#!/usr/bin/env python3
"""Colt Python 6" Royal Blue (.357 Magnum): deterministic 1:1 UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel RGB WebP maps in public/textures/ (zero residual PNGs):
  1. python_frame_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.74, 0.98]: 6" Barrel Left Flank ("PYTHON .357 / * .357 MAGNUM CTG. *")
       + matte transversely serrated ventilated top rib (v in [0.92, 0.98])
     - v in [0.49, 0.73]: 6" Barrel Right Flank & Full Underlug Shroud
       ("COLT'S PT. F.A. MFG. CO. HARTFORD, CONN. U.S.A.")
     - v in [0.24, 0.48]: Forged Colt I-Frame (u < 0.65: Rampant Colt + VP proof + E 48291)
       & Removable Right Sideplate (u >= 0.65: hand-buffed mirror Royal Blue)
     - v in [0.00, 0.24]: 6-Chamber Fluted .357 Cylinder (exact C_6 6-period symmetry across u,
       circumferential bolt stop turn-line burnish & scalloped flute edge wear)

  2. python_walnut_{albedo,normal,roughness}.webp (2048 x 1024)
     - u in [0.00, 0.50]: Left American Black Walnut Target Grip Panel
     - u in [0.50, 1.00]: Right American Black Walnut Target Grip Panel
     - Features rich linseed-oiled walnut burl heartwood figure (G: roughness ~0.58, B: metalness 0.02),
       crisp 22-LPI pointed-shield diamond hand checkering (diamond_knurl + crevice AO),
       brass escutcheon screw ferrule, and inlaid 24K Gold Rampant Colt Medallion
       (B: metalness = 0.92, G: roughness = 0.24).
"""

from __future__ import annotations

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
    laser_stipple_field,
    load_font,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    seamless_band_noise,
    smoothstep,
)

FONT_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


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


def _edge_proximity(mask: np.ndarray, width: float = 4.5) -> np.ndarray:
    distance = ndimage.distance_transform_edt(mask).astype(np.float32)
    return (1.0 - smoothstep(0.8, width, distance)) * mask.astype(np.float32)


def _draw_rampant_colt(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    scale: float,
    fill: int = 255,
) -> None:
    """Draws an iconic rearing stallion (Rampant Colt) silhouette & broken-spear baseline."""
    pts_body = [
        (cx - 0.12 * scale, cy + 0.36 * scale),  # Hind hoof left
        (cx - 0.22 * scale, cy + 0.12 * scale),  # Hock
        (cx - 0.16 * scale, cy - 0.08 * scale),  # Croup / rump
        (cx - 0.06 * scale, cy - 0.24 * scale),  # Back arch
        (cx - 0.02 * scale, cy - 0.42 * scale),  # Crest of neck
        (cx + 0.10 * scale, cy - 0.48 * scale),  # Poll / ears
        (cx + 0.24 * scale, cy - 0.38 * scale),  # Muzzle
        (cx + 0.12 * scale, cy - 0.28 * scale),  # Throat
        (cx + 0.14 * scale, cy - 0.12 * scale),  # Chest
        (cx + 0.32 * scale, cy - 0.22 * scale),  # Foreleg raised upper
        (cx + 0.38 * scale, cy - 0.08 * scale),  # Fore hoof upper
        (cx + 0.16 * scale, cy - 0.02 * scale),  # Forearm return
        (cx + 0.28 * scale, cy + 0.06 * scale),  # Foreleg lower
        (cx + 0.22 * scale, cy + 0.16 * scale),  # Fore hoof lower
        (cx + 0.06 * scale, cy + 0.05 * scale),  # Brisket
        (cx + 0.02 * scale, cy + 0.20 * scale),  # Belly
        (cx + 0.10 * scale, cy + 0.38 * scale),  # Hind hoof right
        (cx - 0.02 * scale, cy + 0.24 * scale),  # Inner thigh
    ]
    draw.polygon(pts_body, fill=fill)
    # Flowing tail
    pts_tail = [
        (cx - 0.16 * scale, cy - 0.06 * scale),
        (cx - 0.34 * scale, cy + 0.04 * scale),
        (cx - 0.38 * scale, cy + 0.22 * scale),
        (cx - 0.26 * scale, cy + 0.16 * scale),
    ]
    draw.polygon(pts_tail, fill=fill)
    # Crossed lance / ground bar
    w_line = max(2, int(round(0.045 * scale)))
    draw.line(
        [(cx - 0.36 * scale, cy + 0.40 * scale), (cx + 0.36 * scale, cy + 0.40 * scale)],
        fill=fill,
        width=w_line,
    )


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.40) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.04, 0.92)
    metalness = np.clip(metalness, 0.0, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")

    paths = [
        save_rgb_png(np.clip(albedo, 0.0, 1.0), os.path.join(OUT_DIR, f"{stem}_albedo.png"))
    ]
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
            (46, 11, 0),
            (255, 235, 250),
        ).astype(np.uint8)
        maps = (
            (np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8), normal_path),
            (orm_rgb, orm_path),
        )
        for data, path in maps:
            Image.fromarray(data, "RGB").save(
                path, "WEBP", lossless=True, method=4, exact=True
            )
    paths.extend((normal_path, orm_path))
    for path in paths:
        if Path(path).suffix == ".webp":
            Path(path).with_suffix(".png").unlink(missing_ok=True)
    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} albedo / OpenGL normal / RGB ORM:",
        *paths,
        sep="\n  ",
    )


def build_python_frame_suite() -> None:
    """Builds 2048x1024 Colt Royal Blue mirror-blued steel & rollmark suite."""
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_rib_bool = v >= 0.915
    m_brl_l_bool = (v >= 0.74) & (v < 0.915)
    m_brl_r_bool = (v >= 0.49) & (v < 0.74)
    m_frame_bool = (v >= 0.24) & (v < 0.49) & (u < 0.65)
    m_plate_bool = (v >= 0.24) & (v < 0.49) & (u >= 0.65)
    m_cyl_bool = v < 0.24

    m_rib = m_rib_bool.astype(np.float32)
    m_brl_l = m_brl_l_bool.astype(np.float32)
    m_brl_r = m_brl_r_bool.astype(np.float32)
    m_frame = m_frame_bool.astype(np.float32)
    m_plate = m_plate_bool.astype(np.float32)
    m_cyl = m_cyl_bool.astype(np.float32)
    m_mirror = m_brl_l + m_brl_r + m_frame + m_plate

    # Hand-buffed Hartford mirror polish & subtle longitudinal felt-wheel grain
    fine_buff = cnc_toolpath(h, w, pitch_px=2.6, angle_deg=0.4, seed=3571)
    oil_film = fbm_noise(h, w, base_freq=7.0, octaves=4, seed=3572)
    polish_band = seamless_band_noise(h, w, 120, 420, seed=3573)
    micro_scratches = scratch_field(
        h, w, count=950, min_len=6, max_len=38, angle_deg=0.0, angle_spread=7.0, seed=3574
    )

    # Transverse anti-glare serrations on top of ventilated rib (v >= 0.915)
    rib_serr = np.sin(u * 260.0 * np.pi * 2.0).astype(np.float32)

    # 1. Iconic Hartford Factory Barrel & Frame Rollmarks
    engrave_mask = np.zeros((h, w), dtype=np.float32)

    # Left barrel rollmark: PYTHON .357 / * .357 MAGNUM CTG. *
    img_bl = Image.new("L", (1640, 240), 0)
    dbl = ImageDraw.Draw(img_bl)
    f_py = load_font(FONT_SERIF, 72)
    f_cal = load_font(FONT_SANS, 44)
    dbl.text((820, 74), "PYTHON  .357", fill=255, font=f_py, anchor="mm")
    dbl.text((820, 174), "*  .357 MAGNUM CTG.  *", fill=240, font=f_cal, anchor="mm")
    _paste_world_mask(engrave_mask, img_bl, 0.16, 0.84, 0.765, 0.895)

    # Right barrel rollmark: COLT'S PT. F.A. MFG. CO. HARTFORD, CONN. U.S.A.
    img_br = Image.new("L", (1800, 200), 0)
    dbr = ImageDraw.Draw(img_br)
    f_addr = load_font(FONT_SERIF, 44)
    dbr.text(
        (900, 100),
        "COLT'S PT. F.A. MFG. CO. HARTFORD, CONN. U.S.A.",
        fill=250,
        font=f_addr,
        anchor="mm",
    )
    _paste_world_mask(engrave_mask, img_br, 0.12, 0.88, 0.56, 0.675)

    # Left I-frame Rampant Colt horse + VP verified proof triangle + serial E 48291
    img_fr = Image.new("L", (1100, 340), 0)
    dfr = ImageDraw.Draw(img_fr)
    _draw_rampant_colt(dfr, 230, 168, 220, fill=255)
    dfr.ellipse((110, 48, 350, 288), outline=210, width=4)
    # Triangular VP proof mark
    dfr.polygon([(460, 245), (510, 155), (560, 245)], outline=235, width=4)
    dfr.text((510, 218), "VP", fill=235, font=load_font(FONT_COND, 34), anchor="mm")
    dfr.text(
        (800, 130),
        "COLT  HARTFORD",
        fill=245,
        font=load_font(FONT_SERIF, 38),
        anchor="mm",
    )
    dfr.text(
        (800, 212),
        "SER.  E 48291",
        fill=225,
        font=load_font(FONT_SANS, 34),
        anchor="mm",
    )
    _paste_world_mask(engrave_mask, img_fr, 0.05, 0.61, 0.27, 0.45)

    # Sideplate discrete inspection stamp
    img_sp = Image.new("L", (640, 280), 0)
    dsp = ImageDraw.Draw(img_sp)
    dsp.rounded_rectangle((14, 14, 626, 266), radius=24, outline=185, width=4)
    _draw_rampant_colt(dsp, 320, 140, 150, fill=215)
    _paste_world_mask(engrave_mask, img_sp, 0.68, 0.95, 0.28, 0.45)

    beveled_engrave = bevel_mask(engrave_mask > 0.32, width_px=2.2, profile="trapezoid")

    # 2. C_6 6-Fold Symmetric Cylinder Band (v < 0.24):
    #    6 identical periods across u in [0, 1] so rx = 0 and rx = +60 deg sample identical texels!
    u6 = np.remainder(u * 6.0, 1.0)
    notch_dist = np.hypot((u6 - 0.5) * 2.4, (v - 0.082) * 14.0)
    notch_pocket = 1.0 - smoothstep(0.16, 0.28, notch_dist)
    # Classic Colt revolver circumferential bolt drag / turn line at v = 0.082
    turn_line = np.exp(-(((v - 0.082) / 0.0055) ** 2)).astype(np.float32) * m_cyl
    # 6 scalloped flute rims centered at u6 = 0.0 / 1.0 (offset 30 deg from bolt notches at u6 = 0.5)
    flute_u = np.minimum(u6, 1.0 - u6)
    flute_rim = (
        smoothstep(0.15, 0.22, flute_u)
        * (1.0 - smoothstep(0.22, 0.30, flute_u))
        * smoothstep(0.10, 0.12, v)
        * (1.0 - smoothstep(0.20, 0.22, v))
        * m_cyl
    )
    # Subtle muzzle-end holster silver wear on barrel & cylinder front bevel
    edge_prox = _edge_proximity(m_brl_l_bool | m_brl_r_bool, 4.5) * smoothstep(0.76, 0.95, u)
    holster_wear, _ = chipped_edge_wear(
        edge_prox * smoothstep(-0.05, 0.45, fbm_noise(h, w, base_freq=42, octaves=3, seed=3575)),
        seed=3576,
        wear_amount=0.34,
    )

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_mirror * (0.010 * fine_buff + 0.005 * polish_band - 0.014 * micro_scratches)
    height -= m_mirror * beveled_engrave * 0.22
    height += m_rib * (0.095 * rib_serr + 0.015 * polish_band)
    height += m_cyl * (
        0.008 * fine_buff - 0.045 * turn_line - 0.14 * notch_pocket + 0.03 * flute_rim
    )

    # 4. Albedo: Deep Colt Royal Blue hot-salt blued steel (calibrated luminance >= 0.16 sRGB!)
    #    Rich midnight Prussian-cobalt metallic sheen with bright silver rollmark & turn-line highlights
    royal_blue = np.array([0.165, 0.218, 0.318], dtype=np.float32)
    rib_matte = np.array([0.148, 0.182, 0.245], dtype=np.float32)
    silver_steel = np.array([0.66, 0.71, 0.78], dtype=np.float32)
    engrave_silver = np.array([0.58, 0.64, 0.73], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    albedo += (m_mirror + m_cyl)[..., None] * (
        royal_blue[None, None, :]
        * (0.97 + 0.045 * oil_film[..., None] + 0.025 * fine_buff[..., None])
    )
    albedo += m_rib[..., None] * (
        rib_matte[None, None, :] * (0.96 + 0.05 * rib_serr[..., None])
    )

    # Rollmark silver-blued contrast
    eng_blend = np.clip(engrave_mask * m_mirror, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.68 * eng_blend) + engrave_silver[None, None, :] * (0.68 * eng_blend)

    # Cylinder turn-line, flute highlight & muzzle holster silvering
    wear_total = np.clip(
        0.58 * turn_line + 0.35 * flute_rim + 0.62 * holster_wear, 0.0, 0.85
    )[..., None]
    albedo = albedo * (1.0 - wear_total) + silver_steel[None, None, :] * wear_total

    # 5. Roughness & Metalness (Packed ORM: R=AO, G=Roughness, B=Metalness)
    roughness = (
        m_mirror * (0.155 + 0.015 * fine_buff - 0.012 * oil_film + 0.18 * engrave_mask)
        + m_rib * (0.56 + 0.06 * np.abs(rib_serr))
        + m_cyl * (0.150 - 0.045 * turn_line + 0.08 * notch_pocket * m_cyl)
    )
    roughness = roughness * (1.0 - 0.35 * holster_wear) + 0.11 * (0.35 * holster_wear)

    metalness = (
        m_mirror * 0.95
        + m_rib * 0.86
        + m_cyl * 0.96
    )
    cavity = (
        1.0
        - 0.26 * beveled_engrave * m_mirror
        - 0.18 * (notch_pocket * m_cyl)
        - 0.12 * m_rib * np.maximum(0.0, -rib_serr)
    )

    _save_suite(
        "python_frame", albedo, height, roughness, metalness, cavity, strength=2.35
    )


def build_python_walnut_suite() -> None:
    """Builds 2048x1024 American Black Walnut Burl, 22-LPI Checkering & 24K Gold Medallion suite."""
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    #Anisotropic walnut burl & cathedral grain figure
    burl_macro = fbm_noise(h, w, base_freq=5.0, octaves=5, seed=3581, aniso_x=1.6, aniso_y=0.75)
    grain_warp = u * 14.0 + 0.55 * burl_macro + 0.18 * fbm_noise(h, w, base_freq=11.0, octaves=3, seed=3582)
    ring_wave = 0.5 + 0.5 * np.sin(grain_wave := grain_warp * np.pi * 2.0)
    # Fine open walnut vessel pores running along vertical grip axis (v)
    wood_pores = scratch_field(
        h, w, count=4200, min_len=8, max_len=34, angle_deg=88.0, angle_spread=9.0, seed=3583
    )
    fine_fiber = cnc_toolpath(h, w, pitch_px=3.2, angle_deg=87.0, seed=3584)

    # 1. Pointed-shield 22-LPI diamond hand-checkering zones on Left (u in [0.09, 0.42]) & Right (u in [0.58, 0.91])
    def _checker_shield(u_center: float) -> np.ndarray:
        du = np.abs(u - u_center) / 0.155
        # Pointed upper peak tapering toward medallion + flat angled base near grip butt
        upper_roof = 0.69 - 0.13 * du
        in_u = 1.0 - smoothstep(0.94, 1.0, du)
        in_v = smoothstep(0.13, 0.15, v) * (1.0 - smoothstep(-0.015, 0.0, v - upper_roof))
        return (in_u * in_v).astype(np.float32)

    chk_l = _checker_shield(0.255)
    chk_r = _checker_shield(0.745)
    chk_mask = np.clip(chk_l + chk_r, 0.0, 1.0)
    chk_border = _edge_proximity(chk_mask > 0.45, width=5.5)

    # Sharp 22-LPI diamond pyramids (compensated for 2:1 atlas aspect)
    diamonds = diamond_knurl(u, v, freq_u=196.0, freq_v=98.0)

    # 2. Inlaid 24K Gold-Plated Rampant Colt Medallions + Brass Escutcheon Ferrules
    #    Each grip flank spans ~0.44 in u (901 px) x 0.90 in v (921 px) -> nearly 1:1 pixel aspect!
    gold_disc = np.zeros((h, w), dtype=np.float32)
    gold_relief = np.zeros((h, w), dtype=np.float32)
    brass_ferrule = np.zeros((h, w), dtype=np.float32)

    med_size = 360
    img_disc = Image.new("L", (med_size, med_size), 0)
    img_rel = Image.new("L", (med_size, med_size), 0)
    dd = ImageDraw.Draw(img_disc)
    dr = ImageDraw.Draw(img_rel)
    mc = med_size // 2
    dd.ellipse((14, 14, med_size - 14, med_size - 14), fill=255)
    dr.ellipse((18, 18, med_size - 18, med_size - 18), outline=255, width=16)
    dr.ellipse((38, 38, med_size - 38, med_size - 38), outline=220, width=6)
    _draw_rampant_colt(dr, mc, mc - 10, 195, fill=255)
    dr.text(
        (mc, med_size - 56),
        "COLT",
        fill=255,
        font=load_font(FONT_SERIF, 36),
        anchor="mm",
    )

    # Paste onto Left (u=0.255, v=0.805) and Right (u=0.745, v=0.805) upper grip bosses
    for uc in (0.255, 0.745):
        _paste_world_mask(gold_disc, img_disc, uc - 0.052, uc + 0.052, 0.705, 0.905)
        _paste_world_mask(gold_relief, img_rel, uc - 0.052, uc + 0.052, 0.705, 0.905)

    # Escutcheon screw ferrule & blued screw head at v = 0.455
    fer_img = Image.new("L", (180, 180), 0)
    dfer = ImageDraw.Draw(fer_img)
    dfer.ellipse((16, 16, 164, 164), fill=255)
    dfer.line([(36, 90), (144, 90)], fill=40, width=18)
    for uc in (0.255, 0.745):
        _paste_world_mask(brass_ferrule, fer_img, uc - 0.024, uc + 0.024, 0.410, 0.500)

    # Suppress checkering strictly inside escutcheon & gold medallion mortises
    mortise_clear = np.clip(gold_disc * 1.25 + (brass_ferrule > 0.08).astype(np.float32), 0.0, 1.0)
    chk_active = chk_mask * (1.0 - mortise_clear)

    stipple_gold = laser_stipple_field(h, w, cells_y=180, cells_x=360, seed=3585)
    rel_bevel = bevel_mask(gold_relief > 0.30, width_px=2.0, profile="round")

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (1.0 - chk_active) * (0.018 * fine_fiber - 0.042 * wood_pores + 0.015 * burl_macro)
    height += chk_active * (0.165 * diamonds) - 0.095 * chk_border * (1.0 - mortise_clear)
    height += gold_disc * (-0.04 + 0.035 * stipple_gold * (1.0 - gold_relief) + 0.14 * rel_bevel)
    height += (brass_ferrule - 0.35 * (brass_ferrule > 0.08).astype(np.float32)) * 0.08

    # 4. Albedo: Warm hand-rubbed linseed-oiled American black walnut heartwood + 24K Gold medallion
    walnut_light = np.array([0.445, 0.262, 0.138], dtype=np.float32)
    walnut_mid = np.array([0.332, 0.188, 0.098], dtype=np.float32)
    walnut_dark = np.array([0.195, 0.106, 0.056], dtype=np.float32)

    t_ring = smoothstep(0.18, 0.86, ring_wave)
    wood_rgb = (
        walnut_dark[None, None, :] * (1.0 - t_ring[..., None])
        + walnut_mid[None, None, :] * t_ring[..., None]
    )
    burl_glow = smoothstep(0.15, 0.78, burl_macro)[..., None]
    wood_rgb = wood_rgb * (1.0 - 0.42 * burl_glow) + walnut_light[None, None, :] * (0.42 * burl_glow)
    wood_rgb *= 1.0 - 0.18 * wood_pores[..., None]

    # Raw cut walnut inside diamond checkering is slightly warmer/matte
    chk_rgb = wood_rgb * (0.88 + 0.14 * np.maximum(0.0, diamonds)[..., None])
    albedo = wood_rgb * (1.0 - chk_active[..., None]) + chk_rgb * chk_active[..., None]

    # 24K Gold Rampant Colt Medallion & Brass Escutcheon
    gold_base_col = np.array([0.74, 0.57, 0.21], dtype=np.float32)
    gold_high_col = np.array([0.91, 0.76, 0.34], dtype=np.float32)
    med_rgb = (
        gold_base_col[None, None, :] * (1.0 - rel_bevel[..., None])
        + gold_high_col[None, None, :] * rel_bevel[..., None]
    )
    g_mask = np.clip(gold_disc, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - g_mask) + med_rgb * g_mask

    brass_col = np.array([0.76, 0.61, 0.28], dtype=np.float32)
    f_mask = np.clip(brass_ferrule, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - f_mask) + brass_col[None, None, :] * f_mask

    # 5. Roughness & Metalness (Medallion B=0.92, G=0.24 vs Oiled Walnut B=0.0, G=0.58!)
    roughness = (
        (1.0 - chk_active) * (0.58 + 0.05 * wood_pores - 0.03 * burl_macro)
        + chk_active * (0.72 - 0.04 * np.maximum(0.0, diamonds))
    )
    med_rough = 0.30 * (1.0 - rel_bevel) + 0.21 * rel_bevel  # Mean ~0.24 on medallion
    roughness = roughness * (1.0 - gold_disc) + med_rough * gold_disc
    f_hit = (brass_ferrule > 0.25).astype(np.float32)
    roughness = roughness * (1.0 - f_hit) + 0.26 * f_hit

    # Note: _save_suite clips metalness to [0.0, 0.98]; oiled walnut stays strictly dielectric (0.0)!
    metalness = np.zeros((h, w), dtype=np.float32)
    metalness = metalness * (1.0 - gold_disc) + 0.92 * gold_disc
    metalness = metalness * (1.0 - f_hit) + 0.90 * f_hit

    cavity = (
        1.0
        - 0.24 * chk_active * np.maximum(0.0, -diamonds)
        - 0.18 * chk_border * (1.0 - mortise_clear)
        - 0.16 * gold_disc * (1.0 - rel_bevel)
    )

    _save_suite(
        "python_walnut", albedo, height, roughness, metalness, cavity, strength=2.45
    )


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_python_frame_suite()
    build_python_walnut_suite()
