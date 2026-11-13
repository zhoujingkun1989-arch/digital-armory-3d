#!/usr/bin/env python3
"""FN Herstal P90 (5.7x28mm PDW): deterministic, 1:1 UV-calibrated 2K PBR atlases.

Generates 6 lossless/high-fidelity WebP maps in public/textures/:
  1. p90_stock_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.57]: Ergonomic glass-fiber polyamide bullpup thumbhole stock
       (Left flank v=.06..30: FN HERSTAL BELGIUM + P90 CAL 5.7x28 + EDM stipple;
        Right flank v=.32..56: FN084912 serial + Liege Perron proof + EDM stipple)
     - v in [0.58, 0.79]: Type-III hard-anodized alloy optical upper receiver & CNC rail chamfers
     - v in [0.80, 1.00]: FN Ring Sight MC-10-80 optical collimator & sapphire-cyan coated lens

  2. p90_mag_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.55, 0.98]: Top horizontal 50-rd smoked translucent polycarbonate window revealing
       25x2 staggered sideways 5.7x28mm brass/spitzer cartridges + 50 / 25 / 10 witness indices
     - v in [0.33, 0.54]: Left/right frosted polycarbonate flanks + FN 5.7x28mm 50 RDS markings
     - v in [0.02, 0.32]: 90-degree helical cartridge-rotating feed ramp turret & steel feed lips
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
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    spectral_noise,
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
    ao = np.clip(compute_height_ao(height, strength=1.45) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.04, 0.92)
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
            (46, 11, 5),
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


def _draw_fn_oval(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float) -> None:
    draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=255, width=4)
    draw.ellipse((cx - rx + 7, cy - ry + 5, cx + rx - 7, cy + ry - 5), outline=210, width=2)
    f_fn = load_font(FONT_COND, int(ry * 1.15))
    draw.text((cx, cy), "FN", fill=255, font=f_fn, anchor="mm")


def build_p90_stock_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_stock_bool = v < 0.575
    m_upper_bool = (v >= 0.575) & (v < 0.795) & (u < 0.76)
    m_rail_bool = (v >= 0.575) & (v < 0.795) & (u >= 0.76)
    m_optic_bool = (v >= 0.795) & (u < 0.76)
    m_lens_bool = (v >= 0.795) & (u >= 0.76)

    m_stock = m_stock_bool.astype(np.float32)
    m_upper = m_upper_bool.astype(np.float32)
    m_rail_bright = m_rail_bool.astype(np.float32)
    m_optic_body = m_optic_bool.astype(np.float32)
    m_optic_lens = m_lens_bool.astype(np.float32)

    grain = np.clip(spectral_noise(h, w, 240, 480, seed=901), -2.5, 2.5)
    pebbles, edges = worley_cellular(h, w, 148, 296, seed=902)
    edm = np.clip((0.42 - pebbles) * 1.8 + (edges - 0.17) * 0.5, -1.0, 1.0)
    stipple = laser_stipple_field(h, w, cells_y=120, cells_x=240, seed=903)
    cnc_brush = cnc_toolpath(h, w, pitch_px=3.6, angle_deg=2.0, seed=904)
    macro = fbm_noise(h, w, base_freq=6, octaves=4, seed=905)
    scratches = scratch_field(
        h, w, count=120, min_len=16, max_len=56, angle_deg=-8, angle_spread=24, seed=906, mask=m_upper_bool
    )
    fibers = scratch_field(
        h, w, count=1800, min_len=2, max_len=7, angle_deg=21, angle_spread=62, seed=907, mask=m_stock_bool
    )

    # 1. Tactile EDM grip stipple patches on left & right thumbhole pistol grips
    grip_patch_l = (
        smoothstep(0.28, 0.31, u)
        * (1.0 - smoothstep(0.62, 0.65, u))
        * smoothstep(0.07, 0.09, v)
        * (1.0 - smoothstep(0.21, 0.23, v))
    )
    grip_patch_r = (
        smoothstep(0.35, 0.38, u)
        * (1.0 - smoothstep(0.69, 0.72, u))
        * smoothstep(0.33, 0.35, v)
        * (1.0 - smoothstep(0.47, 0.49, v))
    )
    stipple_zone = np.clip(grip_patch_l + grip_patch_r, 0.0, 1.0) * m_stock

    # 2. Factory rollmarks & laser typography
    engrave_mask = np.zeros((h, w), dtype=np.float32)
    laser_white = np.zeros((h, w), dtype=np.float32)

    img_l = Image.new("L", (760, 150), 0)
    dl = ImageDraw.Draw(img_l)
    dl.rounded_rectangle((6, 6, 754, 144), radius=14, outline=185, width=3)
    _draw_fn_oval(dl, 82, 75, 56, 36)
    dl.text((162, 48), "FN HERSTAL BELGIUM", fill=255, font=load_font(FONT_SANS, 34), anchor="lm")
    dl.text((162, 102), "P90  CAL. 5.7x28", fill=235, font=load_font(FONT_COND, 28), anchor="lm")
    _paste_world_mask(engrave_mask, img_l, 0.56, 0.93, 0.17, 0.28)

    img_r = Image.new("L", (760, 150), 0)
    dr = ImageDraw.Draw(img_r)
    dr.rounded_rectangle((6, 6, 754, 144), radius=14, outline=185, width=3)
    dr.text((34, 48), "SER. FN 084912  ·  NATO CAGE B1696", fill=255, font=load_font(FONT_SANS, 28), anchor="lm")
    dr.text((34, 102), "FABRIQUE NATIONALE  —  MADE IN BELGIUM", fill=225, font=load_font(FONT_COND, 25), anchor="lm")
    _paste_world_mask(engrave_mask, img_r, 0.07, 0.44, 0.43, 0.54)

    img_up = Image.new("L", (920, 140), 0)
    du = ImageDraw.Draw(img_up)
    du.text((24, 42), "5.7x28mm NATO  ·  CHF CR-MO 1:9\"", fill=245, font=load_font(FONT_SANS, 28), anchor="lm")
    du.text((24, 98), "T2      T4      T6      T8      T10      MIL-STD-1913", fill=215, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(laser_white, img_up, 0.06, 0.71, 0.62, 0.76)

    img_op = Image.new("L", (920, 140), 0)
    do = ImageDraw.Draw(img_op)
    do.text((24, 44), "RING SIGHTS  ·  MC-10-80  REFLEX", fill=255, font=load_font(FONT_SANS, 30), anchor="lm")
    do.text((24, 100), "UP / R  1 CLICK = 0.5 MIL  ·  H3 TRITIUM", fill=215, font=load_font(FONT_COND, 23), anchor="lm")
    _paste_world_mask(laser_white, img_op, 0.06, 0.71, 0.82, 0.95)

    beveled_engrave = bevel_mask(engrave_mask > 0.35, 3, profile="trapezoid")

    # Anodized receiver edge wear
    edge_prox = _edge_proximity(m_upper_bool, 5.0) * smoothstep(
        -0.02, 0.42, fbm_noise(h, w, base_freq=88, octaves=3, seed=908)
    )
    bare, oxide = chipped_edge_wear(edge_prox * m_upper, seed=909, wear_amount=0.45)

    # 3. Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_stock * (edm * 0.055 + grain * 0.008 + fibers * 0.012)
    height += stipple_zone * stipple * 0.18
    height -= m_stock * beveled_engrave * 0.18
    height += m_upper * (cnc_brush * 0.03 - scratches * 0.025 - bare * 0.035)
    height += m_rail_bright * (cnc_brush * 0.022)
    height += m_optic_body * (edm * 0.025 - laser_white * 0.02)

    # 4. Albedo (sRGB, Khronos anti-black-crush calibrated)
    albedo = np.zeros((h, w, 3), dtype=np.float32)
    poly_col = np.array([0.205, 0.225, 0.262], dtype=np.float32)
    albedo += m_stock[..., None] * (
        poly_col * (0.96 + 0.06 * macro[..., None])
        + edm[..., None] * 0.010
        + fibers[..., None] * 0.011
        - stipple_zone[..., None] * 0.022
        - beveled_engrave[..., None] * 0.028
    )

    alloy_col = np.array([0.258, 0.295, 0.355], dtype=np.float32)
    albedo += m_upper[..., None] * (
        alloy_col * (0.96 + 0.06 * cnc_brush[..., None])
        - oxide[..., None] * 0.015
    )
    albedo = albedo * (1.0 - bare[..., None]) + np.array([0.58, 0.63, 0.69], dtype=np.float32) * bare[..., None]

    steel_col = np.array([0.62, 0.67, 0.74], dtype=np.float32)
    albedo += m_rail_bright[..., None] * (steel_col * (0.95 + 0.08 * cnc_brush[..., None]))

    optic_col = np.array([0.238, 0.275, 0.322], dtype=np.float32)
    albedo += m_optic_body[..., None] * (optic_col * (0.96 + 0.06 * macro[..., None]))

    silver_laser = np.array([0.83, 0.87, 0.92], dtype=np.float32)
    laser_blend = np.clip(laser_white * (m_upper + m_optic_body), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.78 * laser_blend) + silver_laser * (0.78 * laser_blend)

    # Multi-coated Sapphire-Cyan optical lens island (u >= 0.76, v >= 0.795)
    lens_du = (u - 0.875) / 0.095
    lens_dv = (v - 0.885) / 0.085
    lens_r = np.sqrt(lens_du * lens_du + lens_dv * lens_dv)
    reticle_ring = np.exp(-((lens_r - 0.46) ** 2) / 0.0035)
    lens_rgb = (
        np.array([0.055, 0.54, 0.68], dtype=np.float32)[None, None, :]
        * (1.08 - 0.28 * np.clip(lens_r, 0.0, 1.2))[..., None]
        + np.array([0.38, 0.92, 0.98], dtype=np.float32)[None, None, :] * (reticle_ring * 0.42)[..., None]
    )
    albedo += m_optic_lens[..., None] * np.clip(lens_rgb, 0.04, 0.96)

    # 5. Roughness & Metalness
    roughness = (
        m_stock * (0.65 + 0.10 * stipple_zone + 0.02 * edm)
        + m_upper * (0.39 - 0.14 * bare - 0.05 * scratches)
        + m_rail_bright * 0.23
        + m_optic_body * 0.45
        + m_optic_lens * 0.065
    )
    metalness = (
        m_stock * 0.03
        + m_upper * (0.58 + 0.36 * bare)
        + m_rail_bright * 0.88
        + m_optic_body * 0.52
        + m_optic_lens * 0.86
    )
    cavity = 1.0 - 0.22 * beveled_engrave * m_stock

    _save_suite("p90_stock", albedo, height, roughness, metalness, cavity, strength=2.6)


def build_p90_mag_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_top_win = (v >= 0.55).astype(np.float32)
    m_flank = ((v >= 0.33) & (v < 0.55)).astype(np.float32)
    m_ramp_poly = ((v < 0.33) & (u < 0.70)).astype(np.float32)
    m_ramp_steel = ((v < 0.33) & (u >= 0.70)).astype(np.float32)

    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=911)
    pebbles, edges = worley_cellular(h, w, 96, 192, seed=912)
    poly_grain = np.clip((0.42 - pebbles) * 1.6 + (edges - 0.17) * 0.4, -1.0, 1.0)
    cnc_brush = cnc_toolpath(h, w, pitch_px=3.5, angle_deg=18.0, seed=913)

    # 1. Internal horizontal 50-rd double-stack 5.7x28mm cartridges inside smoked polycarbonate window!
    in_stack_u = smoothstep(0.065, 0.08, u) * (1.0 - smoothstep(0.875, 0.89, u))
    col_phase = ((u - 0.07) / 0.0328) % 1.0
    cyl_shade = np.sin(np.clip(col_phase, 0.06, 0.94) * np.pi) ** 0.75
    round_mask = (cyl_shade > 0.12).astype(np.float32) * in_stack_u * m_top_win

    m_brass = round_mask * smoothstep(0.575, 0.59, v) * (1.0 - smoothstep(0.815, 0.835, v))
    m_bullet = round_mask * smoothstep(0.825, 0.845, v) * (1.0 - smoothstep(0.92, 0.94, v))

    rib_wave = np.cos(((u - 0.08) / 0.102) * np.pi * 2.0)
    rib_mask = smoothstep(0.76, 0.95, rib_wave) * smoothstep(0.06, 0.08, u) * (1.0 - smoothstep(0.90, 0.92, u))
    rib_top = rib_mask * (m_top_win + m_flank)

    witness_mask = np.zeros((h, w), dtype=np.float32)
    img_top = Image.new("L", (1600, 320), 0)
    dt = ImageDraw.Draw(img_top)
    f_num = load_font(FONT_SANS, 52)
    f_sub = load_font(FONT_COND, 28)
    dt.text((185, 58), "50", fill=255, font=f_num, anchor="mm")
    dt.text((760, 58), "25", fill=255, font=f_num, anchor="mm")
    dt.text((1310, 58), "10", fill=255, font=f_num, anchor="mm")
    dt.text((800, 268), "FN  5.7x28mm  —  50 RDS HORIZONTAL", fill=225, font=f_sub, anchor="mm")
    _paste_world_mask(witness_mask, img_top, 0.08, 0.90, 0.60, 0.93)

    img_flank = Image.new("L", (1400, 140), 0)
    df = ImageDraw.Draw(img_flank)
    df.text((700, 70), "PATENTED  90°  HELICAL  FEED  SYSTEM  ·  5.7x28", fill=235, font=load_font(FONT_COND, 32), anchor="mm")
    _paste_world_mask(witness_mask, img_flank, 0.10, 0.88, 0.37, 0.50)

    ramp_stamp = np.zeros((h, w), dtype=np.float32)
    img_ramp = Image.new("L", (960, 180), 0)
    dr = ImageDraw.Draw(img_ramp)
    dr.text((480, 56), "90° HELICAL FEED RAMP  ·  US PAT. 4,905,394", fill=255, font=load_font(FONT_SANS, 28), anchor="mm")
    dr.text((480, 124), "ROTATION DIRECTION  CW  >>>", fill=220, font=load_font(FONT_COND, 25), anchor="mm")
    _paste_world_mask(ramp_stamp, img_ramp, 0.06, 0.66, 0.06, 0.28)

    spiral_phase = np.sin((u * 9.5 + v * 14.0) * np.pi)
    spiral_flute = smoothstep(0.55, 0.92, spiral_phase) * m_ramp_poly

    # 2. Height map
    wit_bevel = bevel_mask(witness_mask > 0.35, 2, profile="trapezoid")
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (m_top_win + m_flank) * (rib_top * 0.16 + wit_bevel * 0.10 + macro * 0.015)
    height += m_top_win * round_mask * cyl_shade * 0.045
    height += m_ramp_poly * (poly_grain * 0.035 + spiral_flute * 0.14 - ramp_stamp * 0.08)
    height += m_ramp_steel * (cnc_brush * 0.03)

    # 3. Albedo: Smoked amber-bronze polycarbonate filtering internal 5.7x28mm brass & copper rounds!
    smoked_shell = np.array([0.275, 0.232, 0.192], dtype=np.float32)
    rib_col = np.array([0.215, 0.185, 0.158], dtype=np.float32)
    brass_tint = np.array([0.64, 0.50, 0.23], dtype=np.float32)
    copper_tint = np.array([0.58, 0.31, 0.18], dtype=np.float32)
    witness_white = np.array([0.84, 0.80, 0.72], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    win_rgb = (
        smoked_shell[None, None, :] * (0.96 + 0.06 * macro[..., None])
        + m_brass[..., None] * brass_tint[None, None, :] * (0.52 * cyl_shade[..., None])
        + m_bullet[..., None] * copper_tint[None, None, :] * (0.50 * cyl_shade[..., None])
    )
    win_rgb = win_rgb * (1.0 - 0.65 * rib_top[..., None]) + rib_col[None, None, :] * (0.65 * rib_top[..., None])
    albedo += (m_top_win + m_flank)[..., None] * win_rgb

    wit_blend = np.clip(witness_mask * (m_top_win + m_flank), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.72 * wit_blend) + witness_white[None, None, :] * (0.72 * wit_blend)

    ramp_base = np.array([0.205, 0.218, 0.242], dtype=np.float32)
    albedo += m_ramp_poly[..., None] * (
        ramp_base[None, None, :] * (0.96 + 0.05 * poly_grain[..., None])
        + spiral_flute[..., None] * np.array([0.26, 0.20, 0.09], dtype=np.float32)[None, None, :]
        + ramp_stamp[..., None] * 0.32
    )
    albedo += m_ramp_steel[..., None] * (
        np.array([0.66, 0.71, 0.77], dtype=np.float32)[None, None, :] * (0.95 + 0.08 * cnc_brush[..., None])
    )

    # 4. Roughness & Metalness
    roughness = (
        (m_top_win + m_flank) * (0.19 + 0.36 * rib_top + 0.14 * witness_mask)
        + m_ramp_poly * (0.48 - 0.18 * spiral_flute)
        + m_ramp_steel * 0.20
    )
    metalness = (
        (m_top_win + m_flank) * 0.04
        + m_ramp_poly * (0.05 + 0.28 * spiral_flute)
        + m_ramp_steel * 0.92
    )
    cavity = 1.0 - 0.20 * rib_top - 0.18 * spiral_flute

    _save_suite("p90_mag", albedo, height, roughness, metalness, cavity, strength=2.4)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_p90_stock_suite()
    build_p90_mag_suite()
