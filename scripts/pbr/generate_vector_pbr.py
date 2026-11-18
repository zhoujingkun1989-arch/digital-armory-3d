#!/usr/bin/env python3
"""KRISS Vector SMG Gen II (.45 ACP Super V): deterministic, 1:1 UV-calibrated 2K PBR atlases.

Generates 6 lossless 3-channel RGB WebP maps in public/textures/:
  1. vector_housing_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.54]: Two-tone Combat FDE / Matte Charcoal glass-fiber polymer Super V
       lower chassis w/ molded -65 deg geometric ribs, pistol-grip laser stippling, and
       "KRISS USA INC · VIRGINIA BEACH, VA · VECTOR SMG .45 ACP · SUPER V RECOIL MITIGATION"
     - v in [0.54, 0.80]: Upper housing flanks w/ "1 / 2 / A" fire-mode & "S / F" safety
       pictograms (u < 0.73) + Matte Charcoal MIL-STD-1913 Picatinny rail & sights (u >= 0.73)
     - v in [0.80, 1.00]: Gen II skeletonized Combat FDE folding buttstock (u < 0.73) +
       ribbed vulcanized charcoal rubber recoil buttpad & hinge knuckle (u >= 0.73)

  2. vector_internals_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.53, 1.00]: Machined tungsten-gray Super V counterweight slider w/ 5-axis CNC
       toolpaths (u < 0.63) + mirror-polished variable-leverage cam slot (u >= 0.63, B=0.92, G=0.22)
     - v in [0.26, 0.53]: QPQ black-nitride .45 ACP cam-trunnion bolt & 5.5" barrel (u < 0.67) +
       gold/brass .45 ACP cartridge rim & folding charging-handle accent island (u >= 0.67)
     - v in [0.00, 0.26]: Extended 25-rd Kriss MagEx2 .45 ACP magazine body w/ brass-filled
       witness holes, molded extension ribs & "6 · 10 · 13 · 18 · 25 · KRISS MAGEX2 .45 ACP"
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
    ao = np.clip(compute_height_ao(height, strength=1.45) * cavity, 0.22, 1.0)
    roughness = np.clip(roughness, 0.06, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")

    albedo_clamped = np.clip(albedo, 0.0, 1.0)
    albedo_path = save_rgb_png(albedo_clamped, os.path.join(OUT_DIR, f"{stem}_albedo.png"))
    normal_path = height_to_normal_png(
        height, strength=strength, out_path=os.path.join(OUT_DIR, f"{stem}_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, out_path=os.path.join(OUT_DIR, f"{stem}_roughness.png")
    )

    dy, dx = np.gradient(height)
    normal = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    orm_rgb = np.clip(
        np.rint(np.stack((ao, roughness, metalness), axis=-1) * 255.0),
        (56, 15, 5),
        (255, 235, 250),
    ).astype(np.uint8)
    albedo_rgb = np.clip(np.rint(albedo_clamped * 255.0), 0, 255).astype(np.uint8)
    normal_rgb = np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8)

    webp_targets = (
        (albedo_rgb, Path(albedo_path).with_suffix(".webp")),
        (normal_rgb, Path(normal_path).with_suffix(".webp")),
        (orm_rgb, Path(orm_path).with_suffix(".webp")),
    )
    out_paths: list[str] = []
    for data, wpath in webp_targets:
        Image.fromarray(data, "RGB").save(wpath, "WEBP", lossless=True, method=4, exact=True)
        wpath.with_suffix(".png").unlink(missing_ok=True)
        out_paths.append(str(wpath))

    srgb_luma = float(
        0.2126 * albedo_clamped[..., 0].mean()
        + 0.7152 * albedo_clamped[..., 1].mean()
        + 0.0722 * albedo_clamped[..., 2].mean()
    )
    lin_rgb = np.where(
        albedo_clamped <= 0.04045,
        albedo_clamped / 12.92,
        ((albedo_clamped + 0.055) / 1.055) ** 2.4,
    )
    lin_luma = float(
        0.2126 * lin_rgb[..., 0].mean()
        + 0.7152 * lin_rgb[..., 1].mean()
        + 0.0722 * lin_rgb[..., 2].mean()
    )
    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} (sRGB luma={srgb_luma:.4f}, linear luma={lin_luma:.4f}):",
        *out_paths,
        sep="\n  ",
    )


def _draw_kriss_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=5)
    draw.ellipse((cx - r + 10, cy - r + 10, cx + r - 10, cy + r - 10), outline=210, width=2)
    draw.line((cx - r - 6, cy, cx - r * 0.38, cy), fill=255, width=4)
    draw.line((cx + r * 0.38, cy, cx + r + 6, cy), fill=255, width=4)
    draw.line((cx, cy - r - 6, cx, cy - r * 0.38), fill=255, width=4)
    draw.line((cx, cy + r * 0.38, cx, cy + r + 6), fill=255, width=4)
    draw.polygon(
        [(cx - r * 0.30, cy - r * 0.24), (cx + r * 0.30, cy - r * 0.24), (cx, cy + r * 0.36)],
        outline=255,
        fill=220,
    )


def build_vector_housing_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_lower_bool = v < 0.54
    m_upper_bool = (v >= 0.54) & (v < 0.80) & (u < 0.73)
    m_rail_bool = (v >= 0.54) & (v < 0.80) & (u >= 0.73)
    m_stock_bool = (v >= 0.80) & (u < 0.73)
    m_pad_bool = (v >= 0.80) & (u >= 0.73)

    m_lower = m_lower_bool.astype(np.float32)
    m_upper = m_upper_bool.astype(np.float32)
    m_rail = m_rail_bool.astype(np.float32)
    m_stock = m_stock_bool.astype(np.float32)
    m_pad = m_pad_bool.astype(np.float32)

    poly_micro = np.clip(micro_grain(h, w, seed=1901, center_freq=300.0, band_sigma=95.0), -2.5, 2.5)
    pebbles, edges = worley_cellular(h, w, 140, 280, seed=1902)
    vdi_grain = np.clip((0.42 - pebbles) * 1.7 + (edges - 0.17) * 0.45, -1.0, 1.0)
    stipple = laser_stipple_field(h, w, cells_y=132, cells_x=264, seed=1903)
    cnc_long = cnc_toolpath(h, w, pitch_px=3.6, angle_deg=1.8, seed=1904)
    macro = fbm_noise(h, w, base_freq=6, octaves=4, seed=1905)
    fibers = scratch_field(
        h,
        w,
        count=1600,
        min_len=2,
        max_len=7,
        angle_deg=24,
        angle_spread=58,
        seed=1906,
        mask=(m_lower_bool | m_upper_bool | m_stock_bool),
    )

    # 1. Matte-Charcoal aggressive pistol-grip stipple panels on left & right lower chassis flanks
    grip_l = (
        smoothstep(0.05, 0.065, u)
        * (1.0 - smoothstep(0.255, 0.27, u))
        * smoothstep(0.05, 0.065, v)
        * (1.0 - smoothstep(0.225, 0.24, v))
    )
    grip_r = (
        smoothstep(0.05, 0.065, u)
        * (1.0 - smoothstep(0.255, 0.27, u))
        * smoothstep(0.305, 0.32, v)
        * (1.0 - smoothstep(0.48, 0.495, v))
    )
    grip_zone = np.clip(grip_l + grip_r, 0.0, 1.0) * m_lower

    # 2. Molded -65 deg KRISS Super V structural ribs on lower chassis & stock struts
    rib_coord_l = (u - 0.46) * 18.0 - (v - 0.14) * 8.4
    rib_coord_r = (u - 0.46) * 18.0 - (v - 0.40) * 8.4
    rib_wave_l = smoothstep(0.68, 0.92, np.cos(rib_coord_l * np.pi * 2.0))
    rib_wave_r = smoothstep(0.68, 0.92, np.cos(rib_coord_r * np.pi * 2.0))
    rib_win_u = smoothstep(0.31, 0.34, u) * (1.0 - smoothstep(0.86, 0.89, u))
    rib_win_l = rib_win_u * smoothstep(0.045, 0.06, v) * (1.0 - smoothstep(0.115, 0.13, v))
    rib_win_r = rib_win_u * smoothstep(0.30, 0.315, v) * (1.0 - smoothstep(0.365, 0.38, v))
    chassis_ribs = np.clip(rib_wave_l * rib_win_l + rib_wave_r * rib_win_r, 0.0, 1.0) * m_lower

    stock_ribs = (
        smoothstep(0.66, 0.92, np.cos((u * 26.0 - v * 6.0) * np.pi * 2.0))
        * smoothstep(0.06, 0.09, u)
        * (1.0 - smoothstep(0.66, 0.69, u))
        * m_stock
    )
    buttpad_ribs = smoothstep(0.55, 0.90, np.cos(v * 92.0 * np.pi * 2.0)) * m_pad

    # 3. Factory rollmarks, fire-mode pictograms ("1 / 2 / A" & "S / F") & rail T-slots
    engrave_mask = np.zeros((h, w), dtype=np.float32)
    white_paint = np.zeros((h, w), dtype=np.float32)
    red_paint = np.zeros((h, w), dtype=np.float32)

    img_left = Image.new("L", (1180, 175), 0)
    dl = ImageDraw.Draw(img_left)
    dl.rounded_rectangle((6, 6, 1174, 169), radius=14, outline=195, width=3)
    _draw_kriss_emblem(dl, 88, 88, 56)
    dl.text(
        (170, 54),
        "KRISS USA INC  ·  VIRGINIA BEACH, VA",
        fill=255,
        font=load_font(FONT_SANS, 34),
        anchor="lm",
    )
    dl.text(
        (170, 118),
        "VECTOR SMG .45 ACP  ·  SUPER V RECOIL MITIGATION",
        fill=235,
        font=load_font(FONT_COND, 30),
        anchor="lm",
    )
    _paste_world_mask(engrave_mask, img_left, 0.33, 0.94, 0.135, 0.265)

    img_right = Image.new("L", (1180, 175), 0)
    dr = ImageDraw.Draw(img_right)
    dr.rounded_rectangle((6, 6, 1174, 169), radius=14, outline=195, width=3)
    _draw_kriss_emblem(dr, 88, 88, 54)
    dr.text(
        (170, 54),
        "SER. KV45-G2-09481  ·  US PAT. 7,201,094",
        fill=255,
        font=load_font(FONT_SANS, 33),
        anchor="lm",
    )
    dr.text(
        (170, 118),
        "CAL. .45 AUTO (11.43x23mm)  ·  GEN II ENHANCED",
        fill=230,
        font=load_font(FONT_COND, 29),
        anchor="lm",
    )
    _paste_world_mask(engrave_mask, img_right, 0.33, 0.94, 0.385, 0.515)

    # Upper housing "1 / 2 / A" fire-mode pictograms & "S / F" safety markings
    img_up_w = Image.new("L", (1100, 190), 0)
    img_up_r = Image.new("L", (1100, 190), 0)
    duw = ImageDraw.Draw(img_up_w)
    dur = ImageDraw.Draw(img_up_r)
    f_sel = load_font(FONT_SANS, 42)
    f_lbl = load_font(FONT_COND, 27)
    duw.text((88, 62), "S", fill=255, font=f_sel, anchor="mm")
    duw.ellipse((134, 52, 152, 70), fill=255)
    dur.text((228, 62), "F", fill=255, font=f_sel, anchor="mm")
    dur.ellipse((182, 52, 200, 70), fill=255)
    duw.text((430, 62), "1", fill=255, font=f_sel, anchor="mm")
    dur.text((575, 62), "2", fill=255, font=f_sel, anchor="mm")
    dur.text((725, 62), "A", fill=255, font=f_sel, anchor="mm")
    # Bullet Burst Icons next to 1 / 2 / A
    duw.rounded_rectangle((454, 48, 492, 62), radius=5, fill=245)
    dur.rounded_rectangle((600, 40, 638, 54), radius=5, fill=255)
    dur.rounded_rectangle((600, 60, 638, 74), radius=5, fill=255)
    for bi in range(3):
        dur.rounded_rectangle((752, 34 + bi * 18, 792, 47 + bi * 18), radius=5, fill=255)
    duw.text(
        (540, 145),
        "KRISS VECTOR GEN II  ·  SEMI [1]  /  2-RD BURST [2]  /  1200 RPM AUTO [A]",
        fill=235,
        font=f_lbl,
        anchor="mm",
    )
    _paste_world_mask(white_paint, img_up_w, 0.05, 0.70, 0.58, 0.77)
    _paste_world_mask(red_paint, img_up_r, 0.05, 0.70, 0.58, 0.77)
    _paste_world_mask(engrave_mask, img_up_w, 0.05, 0.70, 0.58, 0.77)
    _paste_world_mask(engrave_mask, img_up_r, 0.05, 0.70, 0.58, 0.77)

    # Top MIL-STD-1913 Picatinny rail T-slot laser markings
    img_rail = Image.new("L", (460, 190), 0)
    drr = ImageDraw.Draw(img_rail)
    drr.text(
        (230, 56),
        "T2   T6   T10   T14   T18   T22   T26",
        fill=250,
        font=load_font(FONT_COND, 26),
        anchor="mm",
    )
    drr.text(
        (230, 130),
        "MIL-STD-1913  ·  KRISS DEFIANCE",
        fill=225,
        font=load_font(FONT_COND, 24),
        anchor="mm",
    )
    _paste_world_mask(white_paint, img_rail, 0.75, 0.97, 0.58, 0.77)

    # Gen II Folding Stock badge
    img_st = Image.new("L", (960, 130), 0)
    dst = ImageDraw.Draw(img_st)
    dst.text(
        (480, 65),
        "KRISS  GEN II  FOLDING  STOCK  ·  PA66-GF35",
        fill=240,
        font=load_font(FONT_SANS, 30),
        anchor="mm",
    )
    _paste_world_mask(engrave_mask, img_st, 0.08, 0.68, 0.84, 0.96)

    beveled_engrave = bevel_mask(engrave_mask > 0.32, 3, profile="trapezoid")

    edge_rail = _edge_proximity(m_rail_bool, 5.0) * smoothstep(
        -0.05, 0.40, fbm_noise(h, w, base_freq=82, octaves=3, seed=1907)
    )
    bare_rail, _ = chipped_edge_wear(edge_rail * m_rail, seed=1908, wear_amount=0.42)

    # 4. Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (m_lower + m_upper + m_stock) * (
        vdi_grain * 0.048 + poly_micro * 0.010 + fibers * 0.012
    )
    height += chassis_ribs * 0.16 + stock_ribs * 0.12
    height -= grip_zone * 0.05
    height += grip_zone * stipple * 0.20
    height -= (m_lower + m_upper + m_stock) * beveled_engrave * 0.16
    height += m_rail * (cnc_long * 0.032 - bare_rail * 0.030)
    height += m_pad * (buttpad_ribs * 0.18 + vdi_grain * 0.03)

    # 5. Albedo: Two-Tone Combat FDE & Matte Charcoal (strictly luma >= 0.16!)
    fde_col = np.array([0.585, 0.495, 0.365], dtype=np.float32)
    fde_rib = np.array([0.525, 0.442, 0.322], dtype=np.float32)
    charcoal_poly = np.array([0.295, 0.315, 0.348], dtype=np.float32)
    rail_anodized = np.array([0.315, 0.342, 0.382], dtype=np.float32)
    rubber_dark = np.array([0.265, 0.282, 0.308], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)

    # Lower & Upper & Stock Combat FDE polymer base
    fde_mask = m_lower + m_upper + m_stock
    fde_surface = (
        fde_col[None, None, :] * (0.97 + 0.05 * macro[..., None])
        + vdi_grain[..., None] * 0.012
        + fibers[..., None] * 0.010
        - beveled_engrave[..., None] * 0.055
    )
    rib_total = np.clip(chassis_ribs + stock_ribs, 0.0, 1.0)[..., None]
    fde_surface = fde_surface * (1.0 - 0.55 * rib_total) + fde_rib[None, None, :] * (0.55 * rib_total)
    albedo += fde_mask[..., None] * fde_surface

    # Two-tone Matte Charcoal grip stipple panel + upper accent band
    upper_charcoal_band = (
        m_upper * smoothstep(0.555, 0.575, v) * (1.0 - smoothstep(0.645, 0.665, v))
    )
    charcoal_blend = np.clip(grip_zone + 0.85 * upper_charcoal_band, 0.0, 1.0)[..., None]
    charcoal_tex = charcoal_poly[None, None, :] * (0.96 + 0.05 * macro[..., None]) - grip_zone[..., None] * (0.020 * (1.0 - stipple[..., None]))
    albedo = albedo * (1.0 - charcoal_blend) + charcoal_tex * charcoal_blend

    # Matte Charcoal anodized Picatinny rail + CNC bare aluminum edge wear
    albedo += m_rail[..., None] * (rail_anodized[None, None, :] * (0.96 + 0.06 * cnc_long[..., None]))
    albedo = albedo * (1.0 - bare_rail[..., None]) + np.array([0.66, 0.70, 0.75], dtype=np.float32) * bare_rail[..., None]

    # Ribbed charcoal rubber buttpad
    albedo += m_pad[..., None] * (
        rubber_dark[None, None, :] * (0.96 + 0.06 * buttpad_ribs[..., None])
    )

    # Crisp white & crimson selector / rail paint fills
    w_blend = np.clip(white_paint * (m_upper + m_rail), 0.0, 1.0)[..., None]
    r_blend = np.clip(red_paint * m_upper, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.84 * w_blend) + np.array([0.92, 0.93, 0.95], dtype=np.float32) * (0.84 * w_blend)
    albedo = albedo * (1.0 - 0.86 * r_blend) + np.array([0.84, 0.19, 0.16], dtype=np.float32) * (0.86 * r_blend)

    # 6. Roughness & Metalness (Packed ORM)
    roughness = (
        fde_mask * (0.60 + 0.12 * grip_zone - 0.04 * (chassis_ribs + stock_ribs) + 0.02 * vdi_grain)
        + m_rail * (0.38 - 0.14 * bare_rail)
        + m_pad * (0.78 + 0.05 * buttpad_ribs)
    )
    metalness = (
        fde_mask * 0.03
        + m_rail * (0.65 + 0.28 * bare_rail)
        + m_pad * 0.03
    )
    cavity = 1.0 - 0.20 * beveled_engrave * fde_mask - 0.14 * chassis_ribs

    _save_suite("vector_housing", albedo, height, roughness, metalness, cavity, strength=2.6)


def build_vector_internals_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_slider_bool = (v >= 0.53) & (u < 0.63)
    m_camslot_bool = (v >= 0.53) & (u >= 0.63)
    m_bolt_bool = (v >= 0.26) & (v < 0.53) & (u < 0.67)
    m_brass_bool = (v >= 0.26) & (v < 0.53) & (u >= 0.67)
    m_mag_bool = v < 0.26

    m_slider = m_slider_bool.astype(np.float32)
    m_camslot = m_camslot_bool.astype(np.float32)
    m_bolt = m_bolt_bool.astype(np.float32)
    m_brass = m_brass_bool.astype(np.float32)
    m_mag = m_mag_bool.astype(np.float32)

    cnc_mill = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=14.0, seed=1911)
    cnc_fine = cnc_toolpath(h, w, pitch_px=2.4, angle_deg=1.5, seed=1912)
    cnc_lathe = cnc_toolpath(h, w, pitch_px=3.0, angle_deg=88.0, seed=1913)
    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=1914)
    pebbles, edges = worley_cellular(h, w, 110, 220, seed=1915)
    mag_grain = np.clip((0.42 - pebbles) * 1.5 + (edges - 0.17) * 0.4, -1.0, 1.0)
    wear_scratches = scratch_field(
        h, w, count=110, min_len=18, max_len=64, angle_deg=-65.0, angle_spread=12.0, seed=1916, mask=m_camslot_bool
    )

    # 1. Laser markings on Tungsten Slider, Black-Nitride Bolt/Barrel, Brass .45 Rim & MagEx2
    laser_mask = np.zeros((h, w), dtype=np.float32)
    mag_print = np.zeros((h, w), dtype=np.float32)

    img_sl = Image.new("L", (1050, 220), 0)
    dsl = ImageDraw.Draw(img_sl)
    dsl.rounded_rectangle((8, 8, 1042, 212), radius=14, outline=200, width=3)
    dsl.text(
        (525, 68),
        "KRISS SUPER V  ·  TUNGSTEN-STEEL COUNTERWEIGHT",
        fill=255,
        font=load_font(FONT_SANS, 33),
        anchor="mm",
    )
    dsl.text(
        (525, 148),
        "-65° OFF-AXIS VECTOR SLIDER  ·  US PAT. 7,201,094",
        fill=225,
        font=load_font(FONT_COND, 29),
        anchor="mm",
    )
    _paste_world_mask(laser_mask, img_sl, 0.05, 0.59, 0.60, 0.90)

    img_bt = Image.new("L", (1060, 160), 0)
    dbt = ImageDraw.Draw(img_bt)
    dbt.text(
        (530, 52),
        ".45 ACP (11.43x23mm)  ·  5.5\" CHF 1:16\" LH",
        fill=250,
        font=load_font(FONT_SANS, 31),
        anchor="mm",
    )
    dbt.text(
        (530, 114),
        "CAM-TRUNNION DELAYED BLOWBACK BREECH BOLT",
        fill=220,
        font=load_font(FONT_COND, 27),
        anchor="mm",
    )
    _paste_world_mask(laser_mask, img_bt, 0.05, 0.63, 0.30, 0.49)

    img_br = Image.new("L", (520, 160), 0)
    dbr = ImageDraw.Draw(img_br)
    dbr.text((260, 52), ".45 AUTO  +P", fill=255, font=load_font(FONT_SANS, 34), anchor="mm")
    dbr.text((260, 114), "KRISS BRASS PIVOT", fill=225, font=load_font(FONT_COND, 26), anchor="mm")
    _paste_world_mask(laser_mask, img_br, 0.70, 0.95, 0.30, 0.49)

    # MagEx2 witness holes revealing gleaming .45 ACP brass cartridges + witness numbers
    witness_brass = np.zeros((h, w), dtype=np.float32)
    witness_centers_u = (0.18, 0.31, 0.44, 0.57, 0.70)
    for cu in witness_centers_u:
        du = (u - cu) * (w / h)
        dv = v - 0.145
        rr = np.sqrt(du * du + dv * dv)
        hole = 1.0 - smoothstep(0.016, 0.020, rr)
        witness_brass = np.maximum(witness_brass, hole * m_mag)

    img_mg = Image.new("L", (1680, 210), 0)
    dmg = ImageDraw.Draw(img_mg)
    f_wn = load_font(FONT_SANS, 34)
    for idx_u, label in zip((260, 480, 700, 920, 1140), ("6", "10", "13", "18", "25")):
        dmg.text((idx_u, 152), label, fill=255, font=f_wn, anchor="mm")
    dmg.text(
        (1430, 105),
        "KRISS MAGEX2\n25 RD .45 ACP",
        fill=245,
        font=load_font(FONT_COND, 30),
        anchor="mm",
    )
    _paste_world_mask(mag_print, img_mg, 0.05, 0.95, 0.03, 0.23)

    mag_ribs = (
        smoothstep(0.68, 0.94, np.cos(u * 38.0 * np.pi * 2.0))
        * smoothstep(0.52, 0.56, u)
        * (1.0 - smoothstep(0.92, 0.95, u))
        * m_mag
    )

    # 2. Height map
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_slider * (cnc_mill * 0.042 - laser_mask * 0.05)
    height += m_camslot * (cnc_fine * 0.012 - wear_scratches * 0.015)
    height += m_bolt * (cnc_lathe * 0.032 - laser_mask * 0.04)
    height += m_brass * (cnc_fine * 0.016 - laser_mask * 0.04)
    height += m_mag * (mag_grain * 0.035 + mag_ribs * 0.14 - witness_brass * 0.12 + mag_print * 0.05)

    # 3. Albedo (high-contrast machined tungsten slider, polished cam slot, black-nitride bolt, gold brass, MagEx2)
    tungsten_col = np.array([0.565, 0.585, 0.620], dtype=np.float32)
    camslot_col = np.array([0.795, 0.820, 0.855], dtype=np.float32)
    nitride_col = np.array([0.395, 0.422, 0.468], dtype=np.float32)
    brass_col = np.array([0.825, 0.665, 0.305], dtype=np.float32)
    mag_body_col = np.array([0.355, 0.342, 0.325], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    albedo += m_slider[..., None] * (
        tungsten_col[None, None, :] * (0.96 + 0.07 * cnc_mill[..., None] + 0.03 * macro[..., None])
    )
    albedo += m_camslot[..., None] * (
        camslot_col[None, None, :] * (0.98 + 0.03 * cnc_fine[..., None])
    )
    albedo += m_bolt[..., None] * (
        nitride_col[None, None, :] * (0.96 + 0.06 * cnc_lathe[..., None])
    )
    albedo += m_brass[..., None] * (
        brass_col[None, None, :] * (0.96 + 0.06 * cnc_fine[..., None])
    )

    mag_rgb = mag_body_col[None, None, :] * (0.96 + 0.06 * mag_grain[..., None] + 0.05 * mag_ribs[..., None])
    mag_rgb = mag_rgb * (1.0 - witness_brass[..., None]) + brass_col[None, None, :] * witness_brass[..., None]
    albedo += m_mag[..., None] * mag_rgb

    laser_blend = np.clip(laser_mask * (m_slider + m_bolt), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.72 * laser_blend) + np.array([0.88, 0.90, 0.94], dtype=np.float32) * (0.72 * laser_blend)

    mag_txt = np.clip(mag_print * m_mag * (1.0 - witness_brass), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.78 * mag_txt) + np.array([0.88, 0.82, 0.68], dtype=np.float32) * (0.78 * mag_txt)

    # 4. Roughness (G) & Metalness (B): Polished cam slot strictly B=0.92, G=0.22!
    roughness = (
        m_slider * (0.31 + 0.02 * cnc_mill)
        + m_camslot * 0.22
        + m_bolt * (0.33 + 0.02 * cnc_lathe)
        + m_brass * 0.21
        + m_mag * (0.56 * (1.0 - witness_brass) + 0.21 * witness_brass)
    )
    metalness = (
        m_slider * 0.88
        + m_camslot * 0.92
        + m_bolt * 0.86
        + m_brass * 0.94
        + m_mag * (0.04 * (1.0 - witness_brass) + 0.94 * witness_brass)
    )
    cavity = 1.0 - 0.16 * witness_brass - 0.12 * mag_ribs

    _save_suite("vector_internals", albedo, height, roughness, metalness, cavity, strength=2.4)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_vector_housing_suite()
    build_vector_internals_suite()
