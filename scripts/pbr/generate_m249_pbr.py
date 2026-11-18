#!/usr/bin/env python3
"""FN Minimi / U.S. M249 SAW (5.56x45mm NATO): deterministic, 1:1 UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel RGB WebP maps in public/textures/ (zero intermediate PNGs):
  1. m249_receiver_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.50]: Matte dark manganese-phosphate stamped steel receiver & heatshield
       (Left flank v=.03..25: MACHINE GUN 5.56MM M249 · FN MANUFACTURING INC. COLUMBIA, SC U.S.A.;
        Right flank v=.27..49: U.S. PROPERTY · SER. M249-084219 · CAGE 3S679 + spot-weld dimples;
        u >= 0.77: Burnished internal steel guide rails & chromed trunnion)
     - v in [0.50, 0.77]: Hinged die-cast alloy top feed cover w/ MIL-STD-1913 Picatinny slot
       numbers (T2..T12), rear peep drum range graduations (2..10) & polished S-cam slot (u >= 0.77)
     - v in [0.77, 1.00]: Quick-change 18.3" 5.56mm barrel w/ sustained-fire heat-temper tint,
       5.56 NATO 1/7 CHR MP rollmark, knurled gas regulator & hard-chrome extension/roller (u >= 0.77)

  2. m249_beltbox_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.56]: Ribbed OD-green glass-filled polymer 200-rd SAW assault box
       (200 RD 5.56MM M27 LINK · M855 BALL · U.S. M249 SAW) + charcoal locking lid/collar (u >= 0.74)
     - v in [0.56, 0.80]: Matte charcoal polymer M249 buttstock, insulated barrel handle & stippled
       pistol grip (u < 0.74) + brushed steel folding wire shoulder rest & latch hardware (u >= 0.74)
     - v in [0.80, 1.00]: Matte black M27 phosphate spring-steel disintegrating links (u < 0.47),
       C26000 cartridge brass w/ annealed neck (0.47 <= u < 0.79), copper FMJ jacket (0.79 <= u < 0.90),
       and NATO green-tip M855 SS109 penetrator point (u >= 0.90)
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
    micro_grain,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    worley_cellular,
)

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
    return (1.0 - smoothstep(0.8, width, distance)) * mask


def _spot_weld_dimples(
    u: np.ndarray,
    v: np.ndarray,
    u_centers: tuple[float, ...],
    v_centers: tuple[float, ...],
    ru: float = 0.0085,
    rv: float = 0.0155,
) -> tuple[np.ndarray, np.ndarray]:
    """Synthesizes authentic resistance spot-weld depressions & raised heat-affected rims."""
    dish = np.zeros_like(u)
    rim = np.zeros_like(u)
    for vc in v_centers:
        for uc in u_centers:
            r = np.hypot((u - uc) / ru, (v - vc) / rv)
            dish = np.maximum(dish, 1.0 - smoothstep(0.0, 0.88, r))
            ring = smoothstep(0.68, 0.96, r) * (1.0 - smoothstep(0.96, 1.32, r))
            rim = np.maximum(rim, ring)
    return dish, rim


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.42) * cavity, 0.22, 1.0)
    roughness = np.clip(roughness, 0.08, 0.90)
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
            (54, 18, 5),
            (255, 232, 246),
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


def _draw_fn_oval(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float) -> None:
    draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=255, width=4)
    draw.ellipse((cx - rx + 8, cy - ry + 6, cx + rx - 8, cy + ry - 6), outline=200, width=2)
    draw.text((cx, cy), "FN", fill=255, font=load_font(FONT_SANS, int(ry * 1.05)), anchor="mm")


def build_m249_receiver_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_rec_bool = (v < 0.50) & (u < 0.77)
    m_rec_rail_bool = (v < 0.50) & (u >= 0.77)
    m_cov_bool = (v >= 0.50) & (v < 0.77) & (u < 0.77)
    m_cov_cam_bool = (v >= 0.50) & (v < 0.77) & (u >= 0.77)
    m_bbl_bool = (v >= 0.77) & (u < 0.77)
    m_chrome_bool = (v >= 0.77) & (u >= 0.77)

    m_rec = m_rec_bool.astype(np.float32)
    m_rec_rail = m_rec_rail_bool.astype(np.float32)
    m_cov = m_cov_bool.astype(np.float32)
    m_cov_cam = m_cov_cam_bool.astype(np.float32)
    m_bbl = m_bbl_bool.astype(np.float32)
    m_chrome = m_chrome_bool.astype(np.float32)

    park_crystals = np.clip(micro_grain(h, w, seed=1701, center_freq=275.0, band_sigma=88.0), -2.5, 2.5)
    diecast_grain = np.clip(micro_grain(h, w, seed=1702, center_freq=330.0, band_sigma=95.0), -2.5, 2.5)
    cnc_long = cnc_toolpath(h, w, pitch_px=3.6, angle_deg=1.2, seed=1703)
    cnc_lathe = cnc_toolpath(h, w, pitch_px=2.8, angle_deg=88.5, seed=1704)
    macro = fbm_noise(h, w, base_freq=6, octaves=4, seed=1705)
    scratches = scratch_field(
        h, w, count=165, min_len=14, max_len=62, angle_deg=-4, angle_spread=28, seed=1706,
        mask=(m_rec_bool | m_cov_bool),
    )

    # 1. Resistance spot-weld dimples along stamped receiver guide-rail weld rows
    weld_u = (0.09, 0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.71)
    weld_v = (0.055, 0.225, 0.295, 0.465)
    weld_dish, weld_rim = _spot_weld_dimples(u, v, weld_u, weld_v)
    weld_dish *= m_rec
    weld_rim *= m_rec

    # Stamped longitudinal reinforcement ribs on receiver walls
    rib_wave = (
        np.exp(-((v - 0.085) / 0.010) ** 2)
        + np.exp(-((v - 0.195) / 0.010) ** 2)
        + np.exp(-((v - 0.325) / 0.010) ** 2)
        + np.exp(-((v - 0.435) / 0.010) ** 2)
    ) * smoothstep(0.06, 0.10, u) * (1.0 - smoothstep(0.69, 0.73, u)) * m_rec

    # 2. Rollmarks, Picatinny T-slot engravings & barrel proof stamps
    stamp_inlet = np.zeros((h, w), dtype=np.float32)
    laser_white = np.zeros((h, w), dtype=np.float32)

    img_left = Image.new("L", (1180, 175), 0)
    dl = ImageDraw.Draw(img_left)
    _draw_fn_oval(dl, 86, 88, 66, 48)
    dl.text(
        (176, 52),
        "MACHINE GUN 5.56MM  M249   ·   U.S.",
        fill=255,
        font=load_font(FONT_SANS, 34),
        anchor="lm",
    )
    dl.text(
        (176, 118),
        "FN MANUFACTURING INC.   COLUMBIA, SC  U.S.A.",
        fill=235,
        font=load_font(FONT_COND, 28),
        anchor="lm",
    )
    _paste_world_mask(stamp_inlet, img_left, 0.07, 0.73, 0.095, 0.195)

    img_right = Image.new("L", (1160, 165), 0)
    dr = ImageDraw.Draw(img_right)
    dr.rounded_rectangle((6, 10, 1154, 155), radius=10, outline=185, width=3)
    dr.text(
        (30, 50),
        "U.S. PROPERTY   ·   SAW  5.56MM   ·   SER. M249-084219",
        fill=255,
        font=load_font(FONT_SANS, 30),
        anchor="lm",
    )
    dr.text(
        (30, 112),
        "CAGE 3S679   ·   NSN 1005-01-127-7510   ·   M27 LINK / STANAG",
        fill=225,
        font=load_font(FONT_COND, 26),
        anchor="lm",
    )
    _paste_world_mask(stamp_inlet, img_right, 0.07, 0.73, 0.335, 0.430)

    img_cov = Image.new("L", (1220, 170), 0)
    dcov = ImageDraw.Draw(img_cov)
    dcov.text(
        (24, 48),
        "T2      T4      T6      T8      T10      T12      MIL-STD-1913",
        fill=255,
        font=load_font(FONT_SANS, 30),
        anchor="lm",
    )
    dcov.text(
        (24, 116),
        "RANGE  2    4    6    8    10  (x100M)   ·   WINDAGE  L / R   ·   FEED COVER",
        fill=230,
        font=load_font(FONT_COND, 26),
        anchor="lm",
    )
    _paste_world_mask(laser_white, img_cov, 0.05, 0.74, 0.54, 0.72)

    img_bbl = Image.new("L", (1160, 145), 0)
    dbbl = ImageDraw.Draw(img_bbl)
    dbbl.text(
        (24, 46),
        "5.56 NATO   1/7   CHR   MP   ·   QUICK-CHANGE BARREL",
        fill=245,
        font=load_font(FONT_SANS, 29),
        anchor="lm",
    )
    dbbl.text(
        (24, 104),
        "FNMI  U.S.A.   ·   CAGE 3S679   ·   CHF CHROME-LINED BORE",
        fill=215,
        font=load_font(FONT_COND, 24),
        anchor="lm",
    )
    _paste_world_mask(stamp_inlet, img_bbl, 0.05, 0.68, 0.81, 0.95)

    stamp_bevel = bevel_mask(stamp_inlet > 0.35, 2.5, profile="trapezoid")

    # Knurled gas regulator collar patch inside barrel band
    knurl_zone = (
        smoothstep(0.64, 0.66, u)
        * (1.0 - smoothstep(0.74, 0.76, u))
        * smoothstep(0.80, 0.82, v)
        * (1.0 - smoothstep(0.96, 0.98, v))
    )
    knurl_relief = diamond_knurl(u, v, freq_u=210.0, freq_v=62.0) * knurl_zone

    # Sustained-fire thermal temper tint along barrel mid-forward zone (straw-bronze -> subtle violet)
    heat_band = np.exp(-((u - 0.56) / 0.14) ** 2) * m_bbl
    heat_violet = np.exp(-((u - 0.62) / 0.07) ** 2) * m_bbl

    # Edge wear along stamped receiver & die-cast top cover
    edge_prox = _edge_proximity(m_rec_bool | m_cov_bool, 5.0) * smoothstep(
        -0.02, 0.42, fbm_noise(h, w, base_freq=80, octaves=3, seed=1707)
    )
    bare, oxide = chipped_edge_wear(edge_prox * (m_rec + m_cov), seed=1708, wear_amount=0.40)

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_rec * (
        park_crystals * 0.015
        + cnc_long * 0.016
        + rib_wave * 0.085
        - weld_dish * 0.115
        + weld_rim * 0.032
        - stamp_bevel * 0.095
        - scratches * 0.024
        - bare * 0.026
    )
    height += m_rec_rail * (cnc_long * 0.024)
    height += m_cov * (diecast_grain * 0.012 + cnc_long * 0.022 - laser_white * 0.022 - bare * 0.026)
    height += m_cov_cam * (cnc_long * 0.020)
    height += m_bbl * (park_crystals * 0.014 + cnc_lathe * 0.018 + knurl_relief * 0.085 - stamp_bevel * 0.09)
    height += m_chrome * (cnc_lathe * 0.014)

    # 4. Albedo (sRGB, well above Khronos anti-black-crush floor: meanLuma >= 0.22)
    albedo = np.zeros((h, w, 3), dtype=np.float32)

    rec_park = np.array([0.238, 0.258, 0.252], dtype=np.float32)
    albedo += m_rec[..., None] * (
        rec_park[None, None, :] * (0.95 + 0.07 * macro[..., None] + 0.025 * park_crystals[..., None])
        + rib_wave[..., None] * 0.018
        - weld_dish[..., None] * 0.038
        + weld_rim[..., None] * 0.022
        - oxide[..., None] * 0.012
    )

    rail_bright = np.array([0.66, 0.70, 0.75], dtype=np.float32)
    albedo += m_rec_rail[..., None] * (rail_bright[None, None, :] * (0.95 + 0.07 * cnc_long[..., None]))

    cov_slate = np.array([0.222, 0.240, 0.264], dtype=np.float32)
    albedo += m_cov[..., None] * (
        cov_slate[None, None, :] * (0.96 + 0.06 * macro[..., None] + 0.025 * diecast_grain[..., None])
    )

    albedo = albedo * (1.0 - bare[..., None]) + np.array([0.63, 0.67, 0.72], dtype=np.float32) * bare[..., None]

    cam_steel = np.array([0.68, 0.72, 0.77], dtype=np.float32)
    albedo += m_cov_cam[..., None] * (cam_steel[None, None, :] * (0.95 + 0.07 * cnc_long[..., None]))

    bbl_base = np.array([0.252, 0.268, 0.262], dtype=np.float32)
    straw_tint = np.array([0.36, 0.29, 0.20], dtype=np.float32)
    violet_tint = np.array([0.28, 0.24, 0.33], dtype=np.float32)
    bbl_rgb = bbl_base[None, None, :] * (0.95 + 0.07 * macro[..., None] + 0.025 * cnc_lathe[..., None])
    bbl_rgb = bbl_rgb * (1.0 - 0.42 * heat_band[..., None]) + straw_tint[None, None, :] * (0.42 * heat_band[..., None])
    bbl_rgb = bbl_rgb * (1.0 - 0.26 * heat_violet[..., None]) + violet_tint[None, None, :] * (
        0.26 * heat_violet[..., None]
    )
    albedo += m_bbl[..., None] * (bbl_rgb - stamp_bevel[..., None] * 0.03 + knurl_relief[..., None] * 0.018)

    chrome_col = np.array([0.75, 0.79, 0.84], dtype=np.float32)
    albedo += m_chrome[..., None] * (chrome_col[None, None, :] * (0.96 + 0.06 * cnc_lathe[..., None]))

    # Crisp white/silver laser slot markings & light phosphate rollmark contrast
    laser_silver = np.array([0.86, 0.89, 0.93], dtype=np.float32)
    laser_blend = np.clip(laser_white * m_cov, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.80 * laser_blend) + laser_silver[None, None, :] * (0.80 * laser_blend)

    stamp_blend = np.clip(stamp_inlet * (m_rec + m_bbl), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.54 * stamp_blend) + np.array([0.70, 0.74, 0.72], dtype=np.float32) * (
        0.54 * stamp_blend
    )

    # 5. Roughness & Metalness (Packed ORM)
    roughness = (
        m_rec * (0.47 + 0.05 * weld_dish - 0.14 * bare - 0.04 * scratches)
        + m_rec_rail * 0.20
        + m_cov * (0.41 - 0.12 * bare)
        + m_cov_cam * 0.21
        + m_bbl * (0.44 - 0.06 * heat_band + 0.06 * knurl_zone)
        + m_chrome * 0.18
    )
    metalness = (
        m_rec * (0.76 + 0.18 * bare)
        + m_rec_rail * 0.92
        + m_cov * (0.68 + 0.24 * bare)
        + m_cov_cam * 0.90
        + m_bbl * 0.82
        + m_chrome * 0.94
    )
    cavity = (
        1.0
        - 0.22 * weld_dish
        - 0.18 * stamp_bevel * (m_rec + m_bbl)
        - 0.12 * np.abs(knurl_relief)
    )

    _save_suite("m249_receiver", albedo, height, roughness, metalness, cavity, strength=2.55)


def build_m249_beltbox_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_box_bool = (v < 0.56) & (u < 0.74)
    m_lid_bool = (v < 0.56) & (u >= 0.74)
    m_stock_bool = (v >= 0.56) & (v < 0.80) & (u < 0.74)
    m_wire_bool = (v >= 0.56) & (v < 0.80) & (u >= 0.74)
    m_link_bool = (v >= 0.80) & (u < 0.47)
    m_brass_bool = (v >= 0.80) & (u >= 0.47) & (u < 0.79)
    m_jacket_bool = (v >= 0.80) & (u >= 0.79) & (u < 0.90)
    m_greentip_bool = (v >= 0.80) & (u >= 0.90)

    m_box = m_box_bool.astype(np.float32)
    m_lid = m_lid_bool.astype(np.float32)
    m_stock = m_stock_bool.astype(np.float32)
    m_wire = m_wire_bool.astype(np.float32)
    m_link = m_link_bool.astype(np.float32)
    m_brass = m_brass_bool.astype(np.float32)
    m_jacket = m_jacket_bool.astype(np.float32)
    m_greentip = m_greentip_bool.astype(np.float32)

    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=1711)
    pebbles, edges = worley_cellular(h, w, 136, 272, seed=1712)
    vdi_grain = np.clip((0.42 - pebbles) * 1.65 + (edges - 0.17) * 0.45, -1.0, 1.0)
    stipple = laser_stipple_field(h, w, cells_y=144, cells_x=288, seed=1713)
    cnc_lathe = cnc_toolpath(h, w, pitch_px=3.0, angle_deg=88.2, seed=1714)
    park_link = np.clip(micro_grain(h, w, seed=1715, center_freq=265.0, band_sigma=82.0), -2.5, 2.5)
    fibers = scratch_field(
        h, w, count=1500, min_len=2, max_len=7, angle_deg=16, angle_spread=65, seed=1716,
        mask=(m_box_bool | m_stock_bool | m_lid_bool),
    )

    # 1. Molded structural ribs on 200-round OD-green polymer SAW assault box
    v_rib_wave = smoothstep(0.52, 0.92, np.cos(((u - 0.04) / 0.055) * np.pi * 2.0))
    h_rib_wave = smoothstep(0.62, 0.94, np.cos(((v - 0.04) / 0.085) * np.pi * 2.0))
    box_ribs = (
        np.maximum(v_rib_wave, h_rib_wave * 0.75)
        * smoothstep(0.05, 0.08, u)
        * (1.0 - smoothstep(0.68, 0.71, u))
        * smoothstep(0.04, 0.07, v)
        * (1.0 - smoothstep(0.50, 0.53, v))
        * m_box
    )

    # Stippled grip zone on pistol grip / insulated carry handle
    grip_stipple_zone = (
        smoothstep(0.38, 0.41, u)
        * (1.0 - smoothstep(0.69, 0.72, u))
        * smoothstep(0.59, 0.61, v)
        * (1.0 - smoothstep(0.76, 0.78, v))
        * m_stock
    )

    # 2. Ordnance stencils & stamped markings
    box_stencil = np.zeros((h, w), dtype=np.float32)
    poly_stamp = np.zeros((h, w), dtype=np.float32)
    link_stamp = np.zeros((h, w), dtype=np.float32)

    img_box_a = Image.new("L", (1120, 175), 0)
    dba = ImageDraw.Draw(img_box_a)
    dba.rounded_rectangle((8, 10, 1112, 165), radius=12, outline=205, width=3)
    dba.text(
        (560, 54),
        "200 RD   5.56MM   M27 LINK",
        fill=255,
        font=load_font(FONT_SANS, 38),
        anchor="mm",
    )
    dba.text(
        (560, 120),
        "CART. 5.56MM BALL M855   ·   LOT LC-24H419-082   ·   NATO",
        fill=235,
        font=load_font(FONT_COND, 27),
        anchor="mm",
    )
    _paste_world_mask(box_stencil, img_box_a, 0.06, 0.69, 0.08, 0.24)

    img_box_b = Image.new("L", (1120, 165), 0)
    dbb = ImageDraw.Draw(img_box_b)
    dbb.text(
        (560, 52),
        "MAGAZINE, CARTRIDGE, 200 ROUND   ·   U.S. M249 SAW",
        fill=250,
        font=load_font(FONT_SANS, 30),
        anchor="mm",
    )
    dbb.text(
        (560, 114),
        "NSN 1005-01-169-6575   ·   OLIVE DRAB POLYAMIDE",
        fill=220,
        font=load_font(FONT_COND, 25),
        anchor="mm",
    )
    _paste_world_mask(poly_stamp, img_box_b, 0.06, 0.69, 0.33, 0.48)

    img_stock = Image.new("L", (640, 140), 0)
    dst = ImageDraw.Draw(img_stock)
    dst.rounded_rectangle((8, 12, 632, 128), radius=10, outline=195, width=3)
    dst.text((320, 48), "U.S.  M249  SAW  BUTTSTOCK", fill=255, font=load_font(FONT_SANS, 27), anchor="mm")
    dst.text((320, 98), "FN HERSTAL  ·  HYDRAULIC BUFFER", fill=220, font=load_font(FONT_COND, 23), anchor="mm")
    _paste_world_mask(poly_stamp, img_stock, 0.06, 0.36, 0.61, 0.75)

    img_link = Image.new("L", (780, 130), 0)
    dlk = ImageDraw.Draw(img_link)
    dlk.text(
        (390, 44),
        "M27   U.S.   5.56   NATO   ·   M27   U.S.   5.56",
        fill=250,
        font=load_font(FONT_SANS, 28),
        anchor="mm",
    )
    dlk.text(
        (390, 94),
        "DISINTEGRATING METALLIC BELT LINK   ·   PHOSPHATE SPRING STEEL",
        fill=220,
        font=load_font(FONT_COND, 22),
        anchor="mm",
    )
    _paste_world_mask(link_stamp, img_link, 0.05, 0.44, 0.83, 0.96)

    poly_bevel = bevel_mask(poly_stamp > 0.35, 2.5, profile="trapezoid")
    link_bevel = bevel_mask(link_stamp > 0.35, 2.2, profile="trapezoid")

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_box * (vdi_grain * 0.042 + fibers * 0.012 + box_ribs * 0.155 - poly_bevel * 0.095)
    height += m_lid * (vdi_grain * 0.038 + fibers * 0.010)
    height += m_stock * (vdi_grain * 0.040 + grip_stipple_zone * stipple * 0.18 - poly_bevel * 0.10)
    height += m_wire * (cnc_lathe * 0.024)
    height += m_link * (park_link * 0.018 + cnc_lathe * 0.014 - link_bevel * 0.085)
    height += m_brass * (cnc_lathe * 0.020)
    height += m_jacket * (cnc_lathe * 0.016)
    height += m_greentip * (macro * 0.014)

    # 4. Albedo (sRGB: rich OD-green SAW box, charcoal furniture, black M27 link, C26000 brass, M855 green tip)
    albedo = np.zeros((h, w, 3), dtype=np.float32)

    od_green = np.array([0.278, 0.328, 0.232], dtype=np.float32)
    box_rgb = (
        od_green[None, None, :] * (0.95 + 0.07 * macro[..., None])
        + vdi_grain[..., None] * 0.010
        + box_ribs[..., None] * 0.026
        - poly_bevel[..., None] * 0.025
    )
    # Yellowish-tan US military ammo stencil ink on 200-rd SAW box
    stencil_ink = np.array([0.86, 0.76, 0.38], dtype=np.float32)
    st_blend = np.clip(box_stencil * m_box, 0.0, 1.0)[..., None]
    box_rgb = box_rgb * (1.0 - 0.80 * st_blend) + stencil_ink[None, None, :] * (0.80 * st_blend)
    albedo += m_box[..., None] * box_rgb

    lid_charcoal = np.array([0.215, 0.230, 0.242], dtype=np.float32)
    albedo += m_lid[..., None] * (lid_charcoal[None, None, :] * (0.96 + 0.06 * macro[..., None]))

    stock_charcoal = np.array([0.208, 0.224, 0.244], dtype=np.float32)
    albedo += m_stock[..., None] * (
        stock_charcoal[None, None, :] * (0.96 + 0.06 * macro[..., None])
        + vdi_grain[..., None] * 0.009
        - grip_stipple_zone[..., None] * 0.018
        - poly_bevel[..., None] * 0.022
    )

    wire_steel = np.array([0.54, 0.58, 0.63], dtype=np.float32)
    albedo += m_wire[..., None] * (wire_steel[None, None, :] * (0.95 + 0.07 * cnc_lathe[..., None]))

    # Matte dark phosphate M27 disintegrating steel links
    link_col = np.array([0.218, 0.232, 0.238], dtype=np.float32)
    link_rgb = link_col[None, None, :] * (0.95 + 0.07 * macro[..., None] + 0.025 * park_link[..., None])
    lk_blend = np.clip(link_stamp * m_link, 0.0, 1.0)[..., None]
    link_rgb = link_rgb * (1.0 - 0.45 * lk_blend) + np.array([0.62, 0.66, 0.68], dtype=np.float32) * (0.45 * lk_blend)
    albedo += m_link[..., None] * link_rgb

    # C26000 cartridge brass w/ subtle neck-annealing heat rainbow near u = 0.74..0.78
    brass_col = np.array([0.81, 0.65, 0.28], dtype=np.float32)
    anneal = smoothstep(0.70, 0.77, u) * m_brass
    anneal_col = np.array([0.66, 0.50, 0.36], dtype=np.float32)
    brass_rgb = brass_col[None, None, :] * (0.95 + 0.08 * cnc_lathe[..., None])
    brass_rgb = brass_rgb * (1.0 - 0.48 * anneal[..., None]) + anneal_col[None, None, :] * (0.48 * anneal[..., None])
    albedo += m_brass[..., None] * brass_rgb

    # Gilding-metal copper FMJ bullet jacket
    copper_col = np.array([0.74, 0.40, 0.24], dtype=np.float32)
    albedo += m_jacket[..., None] * (copper_col[None, None, :] * (0.95 + 0.07 * cnc_lathe[..., None]))

    # NATO M855 SS109 Green Penetrator Tip paint
    m855_green = np.array([0.20, 0.49, 0.26], dtype=np.float32)
    albedo += m_greentip[..., None] * (m855_green[None, None, :] * (0.96 + 0.06 * macro[..., None]))

    # 5. Roughness & Metalness (Packed ORM)
    roughness = (
        m_box * (0.60 - 0.05 * box_ribs + 0.02 * vdi_grain)
        + m_lid * 0.58
        + m_stock * (0.62 + 0.12 * grip_stipple_zone)
        + m_wire * 0.30
        + m_link * 0.46
        + m_brass * (0.21 + 0.05 * anneal)
        + m_jacket * 0.24
        + m_greentip * 0.38
    )
    metalness = (
        m_box * 0.03
        + m_lid * 0.04
        + m_stock * 0.04
        + m_wire * 0.88
        + m_link * 0.82
        + m_brass * 0.94
        + m_jacket * 0.90
        + m_greentip * 0.10
    )
    cavity = (
        1.0
        - 0.18 * box_ribs
        - 0.14 * poly_bevel * (m_box + m_stock)
        - 0.16 * link_bevel * m_link
    )

    _save_suite("m249_beltbox", albedo, height, roughness, metalness, cavity, strength=2.6)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_m249_receiver_suite()
    build_m249_beltbox_suite()
