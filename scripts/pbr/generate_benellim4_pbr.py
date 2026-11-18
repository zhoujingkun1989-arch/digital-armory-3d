#!/usr/bin/env python3
"""Benelli M4 Super 90 / U.S. M1014 (12 Gauge): deterministic, 1:1 UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel RGB WebP maps in public/textures/:
  1. benellim4_receiver_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.55]: Matte dark charcoal MIL-STD-8625 Type-III hard-anodized 7075-T6 receiver
       (Left flank v=.05..28: BENELLI ARMI S.P.A. URBINO MADE IN ITALY · M4 SUPER 90;
        Right flank v=.30..53: U.S. M1014 JOINT SERVICE COMBAT SHOTGUN · NSN 1005-01-472-3147)
     - v in [0.55, 0.79]: MIL-STD-1913 Picatinny optic rail T2..T14 slot numbering, LPA Ghost-Ring
       sight graduations & bright CNC recoil-lug chamfers (u >= 0.77)
     - v in [0.79, 1.00]: Greenish-gray manganese-phosphate 18.5" barrel, twin ARGO gas manifold,
       underbarrel 7-rd magazine tube & hard-chrome barrel extension lugs (u >= 0.78)

  2. benellim4_furniture_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.45]: Glass-fiber tactical polymer 2-piece forend ribs (v < 0.27), aggressive
       stippled M1014 pistol grip (v=.27..45, u < 0.70) & notched 3-pos steel recoil tube (u >= 0.70)
     - v in [0.45, 0.75]: Skeletonized M1014 collapsible telestock & elastomer comb cheekpiece
       (u < 0.68) + ribbed shock-absorbing vulcanized rubber recoil buttpad (u >= 0.68)
     - v in [0.75, 1.00]: Crimson 12 GA 70mm 00 BUCK fluted polyethylene hull (u < 0.64) +
       polished C26000 high-brass headstamp cup & extractor rim band (u >= 0.64)
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


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.45) * cavity, 0.20, 1.0)
    roughness = np.clip(roughness, 0.06, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
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
            (255, 235, 250),
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


def _draw_benelli_crest(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    draw.rounded_rectangle((cx - r, cy - r * 0.78, cx + r, cy + r * 0.78), radius=10, outline=255, width=3)
    draw.line((cx - r + 10, cy, cx + r - 10, cy), fill=215, width=2)
    f_top = load_font(FONT_COND, int(r * 0.58))
    draw.text((cx, cy - r * 0.34), "BENELLI", fill=255, font=f_top, anchor="mm")
    draw.text((cx, cy + r * 0.36), "ITALY", fill=225, font=f_top, anchor="mm")


def build_benellim4_receiver_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_rec_bool = v < 0.55
    m_rail_bool = (v >= 0.55) & (v < 0.79) & (u < 0.77)
    m_rail_bright_bool = (v >= 0.55) & (v < 0.79) & (u >= 0.77)
    m_park_bool = (v >= 0.79) & (u < 0.78)
    m_chrome_bool = (v >= 0.79) & (u >= 0.78)

    m_rec = m_rec_bool.astype(np.float32)
    m_rail = m_rail_bool.astype(np.float32)
    m_rail_bright = m_rail_bright_bool.astype(np.float32)
    m_park = m_park_bool.astype(np.float32)
    m_chrome = m_chrome_bool.astype(np.float32)

    anodize_grain = np.clip(micro_grain(h, w, seed=1201, center_freq=320.0, band_sigma=95.0), -2.5, 2.5)
    park_crystals = np.clip(micro_grain(h, w, seed=1202, center_freq=260.0, band_sigma=85.0), -2.5, 2.5)
    cnc_long = cnc_toolpath(h, w, pitch_px=3.8, angle_deg=1.5, seed=1203)
    cnc_lathe = cnc_toolpath(h, w, pitch_px=2.8, angle_deg=88.5, seed=1204)
    macro = fbm_noise(h, w, base_freq=6, octaves=4, seed=1205)
    scratches = scratch_field(
        h, w, count=140, min_len=14, max_len=58, angle_deg=-5, angle_spread=26, seed=1206, mask=m_rec_bool
    )

    # 1. Crisp laser engravings: Left Urbino rollmark, Right U.S. M1014 mark, Rail T-numbers, Barrel stamp
    laser_white = np.zeros((h, w), dtype=np.float32)
    stamp_inlet = np.zeros((h, w), dtype=np.float32)

    img_left = Image.new("L", (1080, 170), 0)
    dl = ImageDraw.Draw(img_left)
    _draw_benelli_crest(dl, 82, 85, 58)
    dl.text(
        (164, 52),
        "BENELLI ARMI S.P.A.  ·  URBINO  ·  MADE IN ITALY",
        fill=255,
        font=load_font(FONT_SANS, 31),
        anchor="lm",
    )
    dl.text(
        (164, 114),
        "M4 SUPER 90   —   12 GA. 3\" - 76mm   —   A.R.G.O. PATENTED",
        fill=235,
        font=load_font(FONT_COND, 27),
        anchor="lm",
    )
    _paste_world_mask(laser_white, img_left, 0.14, 0.90, 0.11, 0.25)

    img_right = Image.new("L", (1080, 170), 0)
    dr = ImageDraw.Draw(img_right)
    dr.rounded_rectangle((6, 10, 1074, 160), radius=12, outline=190, width=3)
    dr.text(
        (32, 52),
        "U.S.  M1014   ·   JOINT SERVICE COMBAT SHOTGUN",
        fill=255,
        font=load_font(FONT_SANS, 31),
        anchor="lm",
    )
    dr.text(
        (32, 114),
        "SER. Y048912M   ·   NSN 1005-01-472-3147   ·   CAGE AF475",
        fill=230,
        font=load_font(FONT_COND, 26),
        anchor="lm",
    )
    _paste_world_mask(laser_white, img_right, 0.08, 0.84, 0.35, 0.49)

    img_rail = Image.new("L", (1180, 150), 0)
    drail = ImageDraw.Draw(img_rail)
    drail.text(
        (24, 44),
        "T2      T4      T6      T8      T10      T12      T14      MIL-STD-1913",
        fill=255,
        font=load_font(FONT_SANS, 28),
        anchor="lm",
    )
    drail.text(
        (24, 104),
        "LPA GHOST RING ITALY   ·   1 CLICK = 1 MOA   ·   UP / R",
        fill=225,
        font=load_font(FONT_COND, 25),
        anchor="lm",
    )
    _paste_world_mask(laser_white, img_rail, 0.05, 0.74, 0.59, 0.75)

    img_bbl = Image.new("L", (1180, 140), 0)
    dbbl = ImageDraw.Draw(img_bbl)
    dbbl.text(
        (24, 44),
        "12 GA. 3\" - 76mm  —  FOR 2 3/4\" OR 3\" SHELLS  —  CRIO CHROME BORE",
        fill=245,
        font=load_font(FONT_SANS, 27),
        anchor="lm",
    )
    dbbl.text(
        (24, 100),
        "A.R.G.O. DUAL STAINLESS PISTON   ·   PROOF 1370 BAR   ·   IT-24",
        fill=215,
        font=load_font(FONT_COND, 24),
        anchor="lm",
    )
    _paste_world_mask(stamp_inlet, img_bbl, 0.05, 0.75, 0.82, 0.96)

    stamp_bevel = bevel_mask(stamp_inlet > 0.35, 2.5, profile="trapezoid")

    # Anodized receiver & rail edge silvering wear
    edge_prox = _edge_proximity(m_rec_bool | m_rail_bool, 5.0) * smoothstep(
        -0.02, 0.42, fbm_noise(h, w, base_freq=82, octaves=3, seed=1207)
    )
    bare, oxide = chipped_edge_wear(edge_prox * (m_rec + m_rail), seed=1208, wear_amount=0.42)

    # Dual ARGO gas plug knurl accent inside upper-left Parkerized band
    knurl_zone = (
        smoothstep(0.62, 0.64, u)
        * (1.0 - smoothstep(0.75, 0.77, u))
        * smoothstep(0.81, 0.83, v)
        * (1.0 - smoothstep(0.96, 0.98, v))
    )
    knurl_relief = diamond_knurl(u, v, freq_u=220.0, freq_v=64.0) * knurl_zone

    # 2. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_rec * (cnc_long * 0.022 + anodize_grain * 0.007 - scratches * 0.024 - laser_white * 0.022 - bare * 0.03)
    height += m_rail * (cnc_long * 0.026 + anodize_grain * 0.006 - laser_white * 0.02)
    height += m_rail_bright * (cnc_long * 0.020)
    height += m_park * (park_crystals * 0.014 + cnc_lathe * 0.016 + knurl_relief * 0.085 - stamp_bevel * 0.09)
    height += m_chrome * (cnc_lathe * 0.014)

    # 3. Albedo (sRGB, calibrated well above Khronos anti-black-crush floor)
    albedo = np.zeros((h, w, 3), dtype=np.float32)
    rec_charcoal = np.array([0.228, 0.246, 0.276], dtype=np.float32)
    albedo += m_rec[..., None] * (
        rec_charcoal[None, None, :] * (0.96 + 0.06 * macro[..., None] + 0.03 * cnc_long[..., None])
        - oxide[..., None] * 0.014
    )

    rail_anodized = np.array([0.205, 0.222, 0.250], dtype=np.float32)
    albedo += m_rail[..., None] * (
        rail_anodized[None, None, :] * (0.96 + 0.06 * cnc_long[..., None])
    )

    # Exposed CNC 7075-T6 silver edge highlights
    albedo = albedo * (1.0 - bare[..., None]) + np.array([0.62, 0.66, 0.72], dtype=np.float32) * bare[..., None]

    rail_steel = np.array([0.64, 0.68, 0.74], dtype=np.float32)
    albedo += m_rail_bright[..., None] * (rail_steel[None, None, :] * (0.95 + 0.07 * cnc_long[..., None]))

    # Authentic military greenish-slate manganese-phosphate Parkerized steel (barrel, ARGO manifold & mag tube)
    park_col = np.array([0.248, 0.278, 0.262], dtype=np.float32)
    albedo += m_park[..., None] * (
        park_col[None, None, :] * (0.95 + 0.07 * macro[..., None] + 0.025 * park_crystals[..., None])
        - stamp_bevel[..., None] * 0.032
        + knurl_relief[..., None] * 0.018
    )

    # Hard-chrome barrel extension lugs & Crio crown
    chrome_col = np.array([0.75, 0.79, 0.84], dtype=np.float32)
    albedo += m_chrome[..., None] * (chrome_col[None, None, :] * (0.96 + 0.06 * cnc_lathe[..., None]))

    # Crisp laser-ablated white/silver markings on anodized receiver & rail + light phosphate stamp contrast
    laser_silver = np.array([0.86, 0.89, 0.93], dtype=np.float32)
    laser_blend = np.clip(laser_white * (m_rec + m_rail), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.80 * laser_blend) + laser_silver[None, None, :] * (0.80 * laser_blend)

    stamp_blend = np.clip(stamp_inlet * m_park, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.52 * stamp_blend) + np.array([0.68, 0.72, 0.70], dtype=np.float32) * (
        0.52 * stamp_blend
    )

    # 4. Roughness & Metalness
    roughness = (
        m_rec * (0.42 - 0.14 * bare - 0.05 * scratches)
        + m_rail * (0.38 - 0.12 * bare)
        + m_rail_bright * 0.22
        + m_park * (0.48 + 0.06 * knurl_zone)
        + m_chrome * 0.18
    )
    metalness = (
        m_rec * (0.62 + 0.32 * bare)
        + m_rail * (0.64 + 0.30 * bare)
        + m_rail_bright * 0.88
        + m_park * 0.78
        + m_chrome * 0.94
    )
    cavity = 1.0 - 0.18 * stamp_bevel * m_park - 0.12 * np.abs(knurl_relief)

    _save_suite("benellim4_receiver", albedo, height, roughness, metalness, cavity, strength=2.5)


def build_benellim4_furniture_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_forend_bool = v < 0.27
    m_grip_bool = (v >= 0.27) & (v < 0.45) & (u < 0.70)
    m_tube_bool = (v >= 0.27) & (v < 0.45) & (u >= 0.70)
    m_stock_bool = (v >= 0.45) & (v < 0.75) & (u < 0.68)
    m_pad_bool = (v >= 0.45) & (v < 0.75) & (u >= 0.68)
    m_hull_bool = (v >= 0.75) & (u < 0.64)
    m_brass_bool = (v >= 0.75) & (u >= 0.64)

    m_forend = m_forend_bool.astype(np.float32)
    m_grip = m_grip_bool.astype(np.float32)
    m_tube = m_tube_bool.astype(np.float32)
    m_stock = m_stock_bool.astype(np.float32)
    m_pad = m_pad_bool.astype(np.float32)
    m_hull = m_hull_bool.astype(np.float32)
    m_brass = m_brass_bool.astype(np.float32)

    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=1211)
    pebbles, edges = worley_cellular(h, w, 132, 264, seed=1212)
    vdi_grain = np.clip((0.42 - pebbles) * 1.7 + (edges - 0.17) * 0.45, -1.0, 1.0)
    stipple = laser_stipple_field(h, w, cells_y=144, cells_x=288, seed=1213)
    cnc_lathe = cnc_toolpath(h, w, pitch_px=3.2, angle_deg=88.0, seed=1214)
    fibers = scratch_field(
        h, w, count=1600, min_len=2, max_len=7, angle_deg=18, angle_spread=65, seed=1215,
        mask=(m_forend_bool | m_stock_bool),
    )

    # 1. Tactical 2-piece forend transverse gripping ribs & ARGO vent grooves
    forend_rib_wave = np.cos(((u - 0.05) / 0.028) * np.pi * 2.0)
    forend_ribs = (
        smoothstep(0.35, 0.88, forend_rib_wave)
        * smoothstep(0.08, 0.11, u)
        * (1.0 - smoothstep(0.89, 0.92, u))
        * smoothstep(0.04, 0.06, v)
        * (1.0 - smoothstep(0.22, 0.24, v))
        * m_forend
    )

    # Aggressive stipple patch on M1014 rubberized pistol grip
    grip_stipple_zone = (
        smoothstep(0.06, 0.09, u)
        * (1.0 - smoothstep(0.61, 0.64, u))
        * smoothstep(0.29, 0.31, v)
        * (1.0 - smoothstep(0.42, 0.44, v))
        * m_grip
    )

    # 3-position recoil tube detent notches
    notch_wave = np.cos(((u - 0.74) / 0.065) * np.pi * 2.0)
    tube_notches = (
        smoothstep(0.72, 0.94, notch_wave)
        * smoothstep(0.74, 0.76, u)
        * (1.0 - smoothstep(0.92, 0.94, u))
        * m_tube
    )

    # Buttpad horizontal anti-slip serration grooves
    pad_grooves = (
        smoothstep(0.45, 0.92, np.cos((v / 0.022) * np.pi * 2.0))
        * smoothstep(0.71, 0.73, u)
        * (1.0 - smoothstep(0.94, 0.96, u))
        * m_pad
    )

    # Crimson 12-gauge extruded polyethylene longitudinal hull ribs
    hull_flutes = np.sin((v * 180.0) * np.pi * 2.0) * m_hull

    # 2. Molded stock marks & 12 GA 70mm 00 BUCK hot-stamped hull typography + C26000 headstamp
    poly_stamp = np.zeros((h, w), dtype=np.float32)
    hull_ink = np.zeros((h, w), dtype=np.float32)
    brass_stamp = np.zeros((h, w), dtype=np.float32)

    img_stock = Image.new("L", (920, 140), 0)
    ds = ImageDraw.Draw(img_stock)
    ds.rounded_rectangle((8, 12, 912, 128), radius=12, outline=195, width=3)
    ds.text((460, 48), "BENELLI  M1014  TELESCOPIC  STOCK", fill=255, font=load_font(FONT_SANS, 28), anchor="mm")
    ds.text((460, 98), "GLASS-REINFORCED POLYAMIDE  ·  MADE IN ITALY", fill=220, font=load_font(FONT_COND, 23), anchor="mm")
    _paste_world_mask(poly_stamp, img_stock, 0.08, 0.62, 0.52, 0.66)

    img_hull = Image.new("L", (1040, 170), 0)
    dh = ImageDraw.Draw(img_hull)
    dh.text(
        (520, 52),
        "12 GA   70mm (2 3/4\")   ·   00 BUCK",
        fill=255,
        font=load_font(FONT_SANS, 38),
        anchor="mm",
    )
    dh.text(
        (520, 120),
        "9 PELLETS  ·  1325 FPS  ·  MAX 1050 BAR  ·  MILITARY BUCKSHOT",
        fill=235,
        font=load_font(FONT_COND, 27),
        anchor="mm",
    )
    _paste_world_mask(hull_ink, img_hull, 0.05, 0.60, 0.79, 0.95)

    img_brass = Image.new("L", (620, 160), 0)
    db = ImageDraw.Draw(img_brass)
    db.text((310, 52), "BENELLI  ·  12 GA  ·  12 GA", fill=255, font=load_font(FONT_SANS, 30), anchor="mm")
    db.text((310, 112), "HIGH BRASS C26000  ·  URBINO ITALY", fill=225, font=load_font(FONT_COND, 25), anchor="mm")
    _paste_world_mask(brass_stamp, img_brass, 0.66, 0.95, 0.79, 0.95)

    poly_bevel = bevel_mask(poly_stamp > 0.35, 2.5, profile="trapezoid")
    brass_bevel = bevel_mask(brass_stamp > 0.35, 2.5, profile="trapezoid")

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_forend * (vdi_grain * 0.045 + fibers * 0.012 + forend_ribs * 0.16)
    height += m_grip * (vdi_grain * 0.040 + grip_stipple_zone * stipple * 0.19)
    height += m_tube * (cnc_lathe * 0.024 - tube_notches * 0.14)
    height += m_stock * (vdi_grain * 0.038 + fibers * 0.010 - poly_bevel * 0.11)
    height += m_pad * (vdi_grain * 0.030 - pad_grooves * 0.15)
    height += m_hull * (hull_flutes * 0.045 + macro * 0.012 - hull_ink * 0.02)
    height += m_brass * (cnc_lathe * 0.022 - brass_bevel * 0.10)

    # 4. Albedo (sRGB)
    albedo = np.zeros((h, w, 3), dtype=np.float32)
    forend_col = np.array([0.212, 0.230, 0.258], dtype=np.float32)
    albedo += m_forend[..., None] * (
        forend_col[None, None, :] * (0.96 + 0.06 * macro[..., None])
        + vdi_grain[..., None] * 0.010
        + fibers[..., None] * 0.010
        + forend_ribs[..., None] * 0.024
    )

    grip_col = np.array([0.195, 0.210, 0.236], dtype=np.float32)
    albedo += m_grip[..., None] * (
        grip_col[None, None, :] * (0.96 + 0.05 * macro[..., None])
        - grip_stipple_zone[..., None] * 0.018
    )

    tube_steel = np.array([0.36, 0.40, 0.45], dtype=np.float32)
    albedo += m_tube[..., None] * (
        tube_steel[None, None, :] * (0.95 + 0.08 * cnc_lathe[..., None])
        - tube_notches[..., None] * 0.06
    )

    stock_col = np.array([0.222, 0.240, 0.270], dtype=np.float32)
    albedo += m_stock[..., None] * (
        stock_col[None, None, :] * (0.96 + 0.06 * macro[..., None])
        + vdi_grain[..., None] * 0.009
        - poly_bevel[..., None] * 0.025
    )

    pad_col = np.array([0.185, 0.198, 0.220], dtype=np.float32)
    albedo += m_pad[..., None] * (
        pad_col[None, None, :] * (0.97 + 0.04 * macro[..., None])
        - pad_grooves[..., None] * 0.022
    )

    # Iconic crimson 12 GA 70mm 00 BUCK ribbed hull + silver-white ink print
    crimson_hull = np.array([0.64, 0.135, 0.155], dtype=np.float32)
    hull_rgb = crimson_hull[None, None, :] * (0.95 + 0.07 * macro[..., None] + 0.04 * hull_flutes[..., None])
    ink_blend = np.clip(hull_ink * m_hull, 0.0, 1.0)[..., None]
    hull_rgb = hull_rgb * (1.0 - 0.82 * ink_blend) + np.array([0.92, 0.90, 0.84], dtype=np.float32) * (
        0.82 * ink_blend
    )
    albedo += m_hull[..., None] * hull_rgb

    # C26000 High-Brass headstamp cup & rim band
    brass_col = np.array([0.79, 0.63, 0.27], dtype=np.float32)
    albedo += m_brass[..., None] * (
        brass_col[None, None, :] * (0.95 + 0.08 * cnc_lathe[..., None])
        - brass_bevel[..., None] * 0.14
    )

    # 5. Roughness & Metalness
    roughness = (
        m_forend * (0.64 - 0.06 * forend_ribs + 0.02 * vdi_grain)
        + m_grip * (0.68 + 0.12 * grip_stipple_zone)
        + m_tube * 0.33
        + m_stock * 0.58
        + m_pad * (0.80 + 0.05 * pad_grooves)
        + m_hull * (0.35 + 0.12 * hull_ink)
        + m_brass * (0.23 + 0.12 * brass_bevel)
    )
    metalness = (
        m_forend * 0.03
        + m_grip * 0.03
        + m_tube * 0.86
        + m_stock * 0.05
        + m_pad * 0.02
        + m_hull * 0.04
        + m_brass * 0.94
    )
    cavity = (
        1.0
        - 0.18 * forend_ribs
        - 0.20 * tube_notches
        - 0.18 * pad_grooves
        - 0.16 * brass_bevel
    )

    _save_suite("benellim4_furniture", albedo, height, roughness, metalness, cavity, strength=2.6)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_benellim4_receiver_suite()
    build_benellim4_furniture_suite()
