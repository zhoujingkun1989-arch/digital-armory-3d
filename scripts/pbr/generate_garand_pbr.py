#!/usr/bin/env python3
"""U.S. Rifle, Caliber .30, M1 Garand (.30-06 Springfield): 1:1 UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel RGB WebP maps in public/textures/ (zero intermediate PNGs):
  1. garand_walnut_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.02, 0.34]: Left flank of American black walnut stock (u=.03..97)
       w/ crisp stamped WWII Defense Acceptance Stamp (DAS eagle/stars) + Springfield Armory
       Crossed-Cannons ordnance escutcheon on the left receiver wrist!
     - v in [0.35, 0.68]: Right flank & semi-pistol grip wrist w/ circled serif [P] proof stamp!
     - v in [0.70, 0.98], u < 0.76: Rear & front linseed-oiled walnut barrel handguards
     - v in [0.70, 0.98], u >= 0.76: Manganese-phosphate steel handguard ferrule, clip & swivels

  2. garand_parkerized_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.62, 0.98], u < 0.74: Forged open-top heeled receiver top & sloped heel w/ deep
       roll-stamped `U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2841944`!
     - v in [0.62, 0.98], u >= 0.74: T105 aperture rear sight elevation (`2 4 6 8 10 12`) & windage drums
     - v in [0.32, 0.61], u < 0.74: Long-stroke op-rod, 2-lug bolt & milled trigger housing (`D28287-12SA`)
     - v in [0.32, 0.61], u >= 0.74: White 410 stainless op-rod gas piston & silver-worn bolt lugs
     - v in [0.02, 0.31]: WWII stamped spring-steel 8-rd en-bloc clip (`SA` stamp, ribs & brass rub)
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR,
    bevel_mask,
    chipped_edge_wear,
    cnc_toolpath,
    compute_height_ao,
    diamond_knurl,
    fbm_noise,
    height_to_normal_png,
    load_font,
    micro_grain,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    worley_cellular,
)

FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
FONT_SERIF = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def _uv_grid(h: int, w: int) -> tuple[np.ndarray, np.ndarray]:
    return (
        np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w)),
        np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w)),
    )


def _paste_world_mask(
    dest: np.ndarray,
    patch_img: Image.Image,
    u0: float,
    u1: float,
    v0: float,
    v1: float,
) -> None:
    h, w = dest.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    if x1 <= x0 or y1 <= y0:
        return
    resized = patch_img.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    np.maximum(dest[y0:y1, x0:x1], arr, out=dest[y0:y1, x0:x1])


def _edge_proximity(mask: np.ndarray, width: float = 5.0) -> np.ndarray:
    distance = ndimage.distance_transform_edt(mask).astype(np.float32)
    return (1.0 - smoothstep(0.8, width, distance)) * mask


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.35) * cavity, 0.22, 1.0)
    roughness = np.clip(roughness, 0.06, 0.90)
    metalness = np.clip(metalness, 0.02, 0.96)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")

    paths = [save_rgb_png(np.clip(albedo, 0.0, 1.0), os.path.join(OUT_DIR, f"{stem}_albedo.png"))]
    normal_path = height_to_normal_png(
        height, strength=strength, out_path=os.path.join(OUT_DIR, f"{stem}_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, out_path=os.path.join(OUT_DIR, f"{stem}_roughness.png")
    )
    if Path(orm_path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normal = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        orm_rgb = np.clip(
            np.rint(np.stack((ao, roughness, metalness), axis=-1) * 255.0),
            (50, 15, 5),
            (255, 232, 248),
        ).astype(np.uint8)
        maps = (
            (np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8), normal_path),
            (orm_rgb, orm_path),
        )
        for data, path in maps:
            Image.fromarray(data, "RGB").save(path, "WEBP", lossless=True, method=4, exact=True)
    paths.extend((normal_path, orm_path))
    for path in paths:
        if Path(path).suffix == ".webp":
            Path(path).with_suffix(".png").unlink(missing_ok=True)
    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} albedo / OpenGL normal / RGB ORM:",
        *paths,
        sep="\n  ",
    )


def _draw_crossed_cannons(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Draws authentic WWII U.S. Ordnance Corps Flaming Bomb / Crossed Cannons belt wheel."""
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=4)
    draw.ellipse((cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8), outline=210, width=2)
    for sign in (-1.0, 1.0):
        ang = math.radians(38.0 * sign)
        dx = math.cos(ang) * r * 1.18
        dy = math.sin(ang) * r * 1.18
        draw.line((cx - dx, cy + dy, cx + dx, cy - dy), fill=255, width=7)
    # Flaming shell at top center
    draw.ellipse((cx - 10, cy - r * 0.62, cx + 10, cy - r * 0.22), fill=240)
    draw.polygon([(cx - 8, cy - r * 0.58), (cx, cy - r * 0.92), (cx + 8, cy - r * 0.58)], fill=255)


def build_garand_walnut_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_wood_bool = (v < 0.695) | (u < 0.765)
    m_steel_bool = ~m_wood_bool
    m_wood = m_wood_bool.astype(np.float32)
    m_steel = m_steel_bool.astype(np.float32)
    m_handguard = ((v >= 0.695) & (u < 0.765)).astype(np.float32)

    # 1. Rich WWII Linseed-Oiled American Black Walnut (Juglans nigra) Heartwood Grain!
    warp_lo = fbm_noise(h, w, base_freq=4.0, octaves=4, seed=1601, aniso_x=0.55, aniso_y=2.4)
    warp_hi = fbm_noise(h, w, base_freq=14.0, octaves=3, seed=1602, aniso_x=0.35, aniso_y=3.5)
    # Cathedral growth-ring figure running horizontally along the walnut stock blank (U axis)
    ring_coord = v * 19.5 + u * 2.35 + warp_lo * 2.15 + warp_hi * 0.42
    rings = 0.5 + 0.5 * np.sin(ring_coord * math.pi * 2.0)
    early_late = rings ** 1.65  # Crisp dark latewood veins vs warm golden-chocolate heartwood

    mineral_streak = smoothstep(
        0.38,
        0.78,
        fbm_noise(h, w, base_freq=9.0, octaves=4, seed=1603, aniso_x=0.3, aniso_y=5.5),
    )
    wood_pores = scratch_field(
        h, w, count=2600, min_len=6, max_len=24, angle_deg=0.0, angle_spread=4.5, seed=1604, mask=m_wood
    )
    fine_fiber = np.clip(
        micro_grain(h, w, seed=1605, aniso_x=3.8, aniso_y=0.65, center_freq=280.0, band_sigma=95.0),
        -2.2,
        2.2,
    )
    oil_patina = 0.5 + 0.5 * fbm_noise(h, w, base_freq=5.0, octaves=4, seed=1606)

    # 2. Authentic WWII Springfield Armory Ordnance Wood Cartouches (`DAS` + Crossed Cannons + `[P]`)
    stamp_mask = np.zeros((h, w), dtype=np.float32)

    # Left receiver cheek (in left-flank band v in [0.03, 0.33], X ~ [-8, -2] -> u ~ [0.46, 0.62]):
    # Boxed `SA / EMcF` + Defense Acceptance Stamp (`DAS` Eagle/Stars) + Crossed Cannons wheel!
    img_das = Image.new("L", (620, 210), 0)
    dd = ImageDraw.Draw(img_das)
    dd.rectangle((10, 16, 250, 194), outline=255, width=5)
    dd.text((130, 62), "S.A.", fill=255, font=load_font(FONT_SERIF, 44), anchor="mm")
    dd.text((130, 118), "G.A.W.", fill=245, font=load_font(FONT_SANS, 30), anchor="mm")
    dd.text((130, 164), "*  *  *   DAS", fill=235, font=load_font(FONT_COND, 24), anchor="mm")
    _draw_crossed_cannons(dd, 365, 105, 74)
    dd.rectangle((468, 38, 606, 172), outline=235, width=4)
    dd.text((537, 84), "ORD", fill=245, font=load_font(FONT_SANS, 30), anchor="mm")
    dd.text((537, 134), "1944", fill=235, font=load_font(FONT_COND, 28), anchor="mm")
    _paste_world_mask(stamp_mask, img_das, 0.44, 0.64, 0.16, 0.29)

    # Right wrist / pistol-grip front proof `[P]` in circle (v in [0.36, 0.66], u ~ [0.40, 0.48])
    img_proof = Image.new("L", (220, 220), 0)
    dp = ImageDraw.Draw(img_proof)
    dp.ellipse((18, 18, 202, 202), outline=255, width=7)
    dp.text((110, 112), "P", fill=255, font=load_font(FONT_SERIF, 112), anchor="mm")
    _paste_world_mask(stamp_mask, img_proof, 0.41, 0.48, 0.41, 0.52)

    stamped_bevel = bevel_mask(stamp_mask > 0.32, 2.5, profile="trapezoid")

    # 3. Steel ferrule / sling-swivel swatch (v >= 0.695, u >= 0.765)
    cells, edges = worley_cellular(h, w, 260, 520, seed=1607)
    phosphate = (0.42 - cells) * 0.7 + (edges - 0.17) * 0.4
    cnc = cnc_toolpath(h, w, pitch_px=4.0, angle_deg=6.0, seed=1608)
    edge_prox = _edge_proximity(m_steel_bool, 6.0)
    bare_steel, _ = chipped_edge_wear(edge_prox * m_steel, seed=1609, wear_amount=0.45)

    # 4. Height Map (open vessel walnut pores + crisp indented ordnance cartouches!)
    height = np.full((h, w), 0.52, dtype=np.float32)
    height += m_wood * (
        -wood_pores * 0.085
        - early_late * 0.028
        + fine_fiber * 0.012
        - stamped_bevel * 0.22
    )
    height += m_steel * (phosphate * 0.032 + cnc * 0.018 - bare_steel * 0.04)

    # 5. Albedo (Rich WWII boiled-linseed-oil American black walnut, safely above luma floor!)
    walnut_light = np.array([0.395, 0.242, 0.148], dtype=np.float32)
    walnut_vein = np.array([0.238, 0.142, 0.088], dtype=np.float32)
    walnut_streak = np.array([0.195, 0.118, 0.074], dtype=np.float32)

    wood_rgb = (
        walnut_light[None, None, :] * (1.0 - 0.58 * early_late[..., None])
        + walnut_vein[None, None, :] * (0.58 * early_late[..., None])
    )
    wood_rgb = (
        wood_rgb * (1.0 - 0.34 * mineral_streak[..., None])
        + walnut_streak[None, None, :] * (0.34 * mineral_streak[..., None])
    )
    wood_rgb *= 0.94 + 0.12 * oil_patina[..., None]
    wood_rgb -= wood_pores[..., None] * 0.026
    # Barrel warmth slight darkening on upper handguards + deep oil pooled in stamped cartouches
    wood_rgb *= 1.0 - 0.08 * m_handguard[..., None]
    wood_rgb *= 1.0 - 0.26 * stamped_bevel[..., None]

    park_col = np.array([0.248, 0.268, 0.254], dtype=np.float32)
    steel_rgb = park_col[None, None, :] + phosphate[..., None] * 0.012
    steel_rgb = (
        steel_rgb * (1.0 - bare_steel[..., None])
        + np.array([0.62, 0.66, 0.70], dtype=np.float32)[None, None, :] * bare_steel[..., None]
    )

    albedo = m_wood[..., None] * wood_rgb + m_steel[..., None] * steel_rgb

    # 6. Satin Linseed-Oil Roughness (~0.52) & Zero-Wood Metalness (0.02 vs 0.78 steel ferrule!)
    roughness = (
        m_wood
        * (
            0.52
            + 0.08 * wood_pores
            + 0.04 * early_late
            - 0.05 * oil_patina
            + 0.10 * stamped_bevel
        )
        + m_steel * (0.41 - 0.18 * bare_steel)
    )
    metalness = m_wood * 0.02 + m_steel * (0.76 + 0.18 * bare_steel)
    cavity = 1.0 - 0.24 * stamped_bevel * m_wood - 0.08 * wood_pores * m_wood

    _save_suite("garand_walnut", albedo, height, roughness, metalness, cavity, strength=2.5)


def build_garand_parkerized_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_rec_bool = (v >= 0.62) & (u < 0.74)
    m_sight_bool = (v >= 0.62) & (u >= 0.74)
    m_action_bool = (v >= 0.315) & (v < 0.62) & (u < 0.74)
    m_white_bool = (v >= 0.315) & (v < 0.62) & (u >= 0.74)
    m_clip_bool = v < 0.315

    m_rec = m_rec_bool.astype(np.float32)
    m_sight = m_sight_bool.astype(np.float32)
    m_action = m_action_bool.astype(np.float32)
    m_white = m_white_bool.astype(np.float32)
    m_clip = m_clip_bool.astype(np.float32)

    # 1. Authentic WWII Manganese-Phosphate (Parkerized) Crystal Grain + CLP Gun-Oil Patina
    cells, boundaries = worley_cellular(h, w, 320, 640, seed=1621)
    phosphate = (0.42 - cells) * 0.75 + (boundaries - 0.17) * 0.42
    oil = 0.5 + 0.5 * fbm_noise(h, w, base_freq=7.0, octaves=4, seed=1622)
    lathe_marks = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=88.0, seed=1623)
    mill_marks = cnc_toolpath(h, w, pitch_px=4.8, angle_deg=3.0, seed=1624)
    knurl = diamond_knurl(u, v, freq_u=210.0, freq_v=84.0) * m_sight * smoothstep(0.84, 0.88, v)

    scratches = scratch_field(
        h,
        w,
        count=140,
        min_len=18,
        max_len=68,
        angle_deg=0.0,
        angle_spread=16.0,
        seed=1625,
        mask=(m_rec + m_action + m_clip),
    )

    # 2. Crisp Springfield Armory Receiver Heel Rollmark, T105 Sight Graduations & En-Bloc Stamp!
    engrave_mask = np.zeros((h, w), dtype=np.float32)
    white_grad = np.zeros((h, w), dtype=np.float32)

    # Receiver Heel (`U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD / ARMORY / 2841944`)
    # Receiver heel sits at X in [-8.6, -5.2] -> xNorm in [0.0, 0.23] -> u in [0.05, 0.36], v in [0.66, 0.94]
    img_heel = Image.new("L", (720, 320), 0)
    dh = ImageDraw.Draw(img_heel)
    dh.rectangle((10, 10, 710, 310), outline=160, width=3)
    dh.text((360, 48), "U.S. RIFLE", fill=255, font=load_font(FONT_SANS, 40), anchor="mm")
    dh.text((360, 102), "CAL. .30 M1", fill=255, font=load_font(FONT_SANS, 38), anchor="mm")
    dh.text((360, 162), "SPRINGFIELD", fill=255, font=load_font(FONT_SANS, 38), anchor="mm")
    dh.text((360, 214), "ARMORY", fill=255, font=load_font(FONT_SANS, 38), anchor="mm")
    dh.text((360, 272), "2841944", fill=245, font=load_font(FONT_COND, 38), anchor="mm")
    _paste_world_mask(engrave_mask, img_heel, 0.05, 0.41, 0.65, 0.94)

    # Receiver front ring & side drawing stamp
    img_dwg = Image.new("L", (560, 180), 0)
    dw = ImageDraw.Draw(img_dwg)
    dw.text((280, 56), "D 28291  32", fill=240, font=load_font(FONT_COND, 38), anchor="mm")
    dw.text((280, 126), "ORDNANCE  DEPT.  U.S.A.", fill=215, font=load_font(FONT_COND, 30), anchor="mm")
    _paste_world_mask(engrave_mask, img_dwg, 0.44, 0.71, 0.69, 0.89)

    # T105 Aperture Sight Elevation & Windage Graduations (u in [0.75, 0.98], v in [0.64, 0.96])
    img_t105 = Image.new("L", (520, 300), 0)
    dt = ImageDraw.Draw(img_t105)
    dt.text((260, 48), "2    4    6    8   10   12", fill=255, font=load_font(FONT_SANS, 34), anchor="mm")
    for tx in range(44, 486, 36):
        dt.line((tx, 78, tx, 114), fill=255, width=4)
    dt.text((260, 168), "<<<  LEFT     WINDAGE     RIGHT  >>>", fill=245, font=load_font(FONT_COND, 27), anchor="mm")
    dt.text((260, 240), "T105  1 CLICK = 1 MOA  ·  100-1200 YDS", fill=225, font=load_font(FONT_COND, 25), anchor="mm")
    _paste_world_mask(white_grad, img_t105, 0.755, 0.975, 0.645, 0.855)

    # Action / Op-Rod / Trigger Housing drawing numbers (`D35382 9 SA` & `D28287-12SA`)
    img_act = Image.new("L", (960, 180), 0)
    da = ImageDraw.Draw(img_act)
    da.text((480, 56), "D 35382  9  SA   ·   OP-ROD  LONG-STROKE", fill=245, font=load_font(FONT_SANS, 32), anchor="mm")
    da.text((480, 126), "D 28287-12 SA   ·   D 28290-14 SA", fill=225, font=load_font(FONT_COND, 30), anchor="mm")
    _paste_world_mask(engrave_mask, img_act, 0.08, 0.68, 0.38, 0.54)

    # 8-Rd En-Bloc Clip base ordnance stamp (`SA` / `BR-W` + vertical stiffening ribs)
    img_clip = Image.new("L", (1400, 180), 0)
    dc = ImageDraw.Draw(img_clip)
    dc.text((700, 58), "S A    ·    8-RD  EN-BLOC  CLIP    ·    CAL. .30-06  M2", fill=245, font=load_font(FONT_SANS, 34), anchor="mm")
    dc.text((700, 126), "BORG-WARNER  /  SPRINGFIELD  ORDNANCE  SPRING  STEEL", fill=215, font=load_font(FONT_COND, 28), anchor="mm")
    _paste_world_mask(engrave_mask, img_clip, 0.12, 0.88, 0.08, 0.24)

    engrave_bevel = bevel_mask(engrave_mask > 0.32, 2.2, profile="trapezoid")
    grad_bevel = bevel_mask(white_grad > 0.32, 1.8, profile="trapezoid")

    # Longitudinal raceway silver wear & en-bloc vertical rib highlights
    raceway_wear = (
        m_action
        * smoothstep(0.06, 0.12, u)
        * (1.0 - smoothstep(0.64, 0.70, u))
        * np.exp(-(((v - 0.47) / 0.022) ** 2))
    )
    clip_rib_wave = np.cos(((u - 0.14) / 0.18) * math.pi * 2.0)
    clip_ribs = smoothstep(0.82, 0.97, clip_rib_wave) * m_clip * smoothstep(0.04, 0.06, v) * (
        1.0 - smoothstep(0.26, 0.29, v)
    )
    clip_lip_wear = m_clip * smoothstep(0.255, 0.285, v)

    edge_prox = _edge_proximity(m_rec_bool | m_action_bool, 5.5)
    bare_chips, _ = chipped_edge_wear(edge_prox * (m_rec + m_action), seed=1626, wear_amount=0.42)

    # 3. Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (m_rec + m_action + m_sight) * (phosphate * 0.036 + mill_marks * 0.015)
    height += m_sight * (knurl * 0.12 - grad_bevel * 0.12)
    height -= (m_rec + m_action + m_clip) * engrave_bevel * 0.18
    height -= scratches * 0.025
    height += m_white * (lathe_marks * 0.024)
    height += m_clip * (phosphate * 0.028 + clip_ribs * 0.14)

    # 4. Albedo: Authentic WWII Greenish-Slate Manganese-Phosphate Parkerizing!
    park_green_slate = np.array([0.252, 0.276, 0.258], dtype=np.float32)
    action_slate = np.array([0.238, 0.258, 0.246], dtype=np.float32)
    clip_charcoal = np.array([0.218, 0.232, 0.242], dtype=np.float32)
    white_stainless = np.array([0.695, 0.725, 0.758], dtype=np.float32)
    silver_wear = np.array([0.64, 0.68, 0.72], dtype=np.float32)
    chalk_fill = np.array([0.84, 0.85, 0.81], dtype=np.float32)
    brass_rub = np.array([0.56, 0.45, 0.23], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    albedo += (m_rec + m_sight)[..., None] * (
        park_green_slate[None, None, :] * (0.95 + 0.08 * oil[..., None])
        + phosphate[..., None] * 0.014
    )
    albedo += m_action[..., None] * (
        action_slate[None, None, :] * (0.95 + 0.08 * oil[..., None])
        + phosphate[..., None] * 0.012
    )

    # White stainless piston w/ subtle golden-straw gas heat temper band on front edge!
    heat_straw = smoothstep(0.90, 0.97, u) * m_white
    piston_rgb = (
        white_stainless[None, None, :] * (0.96 + 0.06 * lathe_marks[..., None])
        * (1.0 - 0.35 * heat_straw[..., None])
        + np.array([0.66, 0.56, 0.38], dtype=np.float32)[None, None, :] * (0.35 * heat_straw[..., None])
    )
    albedo += m_white[..., None] * piston_rgb

    # En-bloc spring-steel clip + subtle .30-06 brass cartridge rub streaks
    brass_band = m_clip * smoothstep(0.11, 0.16, v) * (1.0 - smoothstep(0.21, 0.25, v))
    albedo += m_clip[..., None] * (
        clip_charcoal[None, None, :] * (0.96 + 0.06 * oil[..., None])
        + brass_band[..., None] * brass_rub[None, None, :] * 0.16
        + clip_ribs[..., None] * 0.06
    )

    # Silver wear on bolt/op-rod raceways, clip lips, handling scratches & edge chips
    wear_total = np.clip(
        bare_chips + 0.68 * raceway_wear + 0.55 * clip_lip_wear + 0.26 * scratches,
        0.0,
        1.0,
    )[..., None]
    albedo = albedo * (1.0 - wear_total) + silver_wear[None, None, :] * wear_total

    # Crisp ordnance chalk/silver contrast in receiver heel rollmark & T105 sight graduations!
    mark_fill = np.clip(0.52 * engrave_mask + 0.84 * white_grad, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - mark_fill) + chalk_fill[None, None, :] * mark_fill

    # 5. Roughness & Metalness
    roughness = (
        (m_rec + m_sight) * (0.43 + 0.03 * phosphate - 0.04 * oil + 0.12 * knurl)
        + m_action * (0.41 - 0.16 * raceway_wear - 0.04 * oil)
        + m_white * (0.19 + 0.06 * heat_straw)
        + m_clip * (0.46 - 0.18 * clip_lip_wear - 0.06 * clip_ribs)
        - 0.14 * bare_chips
    )
    metalness = (
        (m_rec + m_sight + m_action) * 0.64
        + m_white * 0.93
        + m_clip * (0.72 + 0.18 * clip_lip_wear)
        + 0.28 * (bare_chips + raceway_wear)
    )
    cavity = 1.0 - 0.22 * engrave_bevel - 0.16 * clip_ribs - 0.14 * knurl

    _save_suite("garand_parkerized", albedo, height, roughness, metalness, cavity, strength=2.4)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_garand_walnut_suite()
    build_garand_parkerized_suite()
