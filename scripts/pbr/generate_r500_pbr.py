#!/usr/bin/env python3
"""Ravin R500 HexCoil Compound Crossbow: deterministic, UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel WebP maps in public/textures/:
  1. r500_chassis_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.30]: Left flank CNC 7075-T6 anodized aluminum bullpup chassis
       ("RAVIN CROSSBOWS · R500 HEXCOIL", "500 FPS · PAT. US 10,852,097")
     - v in [0.30, 0.57]: Right flank CNC billet chassis + truss chamfers
       ("SER. RV-500-04819 · 300 LB DRAW · 15 IN POWER STROKE")
     - v in [0.57, 0.79]: Frictionless flight optical bridge & MIL-STD-1913 Picatinny rail
     - v in [0.79, 1.00]: Trac-Trigger floating sled ("TTFS · 3.5 LB") & brushed 17-4PH stirrup

  2. r500_limbs_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.00, 0.29]: 3K Twill Woven Carbon-Fiber split quad limbs & stencil
     - v in [0.29, 0.56]: Bronze-Gold anodized CNC HexCoil 360 helical cams + spiral track grooves
     - v in [0.56, 0.79]: 1-8x24 100-YD BDC crossbow scope + emerald-sapphire coated optics
     - v in [0.79, 1.00]: Tactical polymer stock/grips/3-bolt quiver with VDI-27 EDM stipple
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
    ao = np.clip(compute_height_ao(height, strength=1.4) * cavity, 0.20, 1.0)
    roughness = np.clip(roughness, 0.05, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")

    albedo_path = save_rgb_png(
        np.clip(albedo, 0.0, 1.0), os.path.join(OUT_DIR, f"{stem}_albedo.png")
    )
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
            (46, 12, 5),
            (255, 236, 250),
        ).astype(np.uint8)
        maps = (
            (np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8), normal_path),
            (orm_rgb, orm_path),
        )
        for data, path in maps:
            Image.fromarray(data, "RGB").save(path, "WEBP", lossless=True, method=4, exact=True)

    paths = [albedo_path, normal_path, orm_path]
    for path in paths:
        if Path(path).suffix == ".webp":
            Path(path).with_suffix(".png").unlink(missing_ok=True)

    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} albedo / OpenGL normal / RGB ORM:",
        *paths,
        sep="\n  ",
    )


def build_r500_chassis_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_chassis_bool = v < 0.57
    m_bridge_bool = (v >= 0.57) & (v < 0.79) & (u < 0.75)
    m_rail_bool = (v >= 0.57) & (v < 0.79) & (u >= 0.75)
    m_sled_bool = (v >= 0.79) & (u < 0.66)
    m_stirrup_bool = (v >= 0.79) & (u >= 0.66)

    m_chassis = m_chassis_bool.astype(np.float32)
    m_bridge = m_bridge_bool.astype(np.float32)
    m_rail = m_rail_bool.astype(np.float32)
    m_sled = m_sled_bool.astype(np.float32)
    m_stirrup = m_stirrup_bool.astype(np.float32)

    cnc_h = cnc_toolpath(h, w, pitch_px=3.8, angle_deg=1.5, seed=5001)
    cnc_diag = cnc_toolpath(h, w, pitch_px=4.5, angle_deg=32.0, seed=5002)
    macro = fbm_noise(h, w, base_freq=7.0, octaves=4, seed=5003)
    grain = np.clip(spectral_noise(h, w, 190, 420, seed=5004), -2.2, 2.2)
    scratches = scratch_field(
        h, w, count=140, min_len=14, max_len=64, angle_deg=-5.0, angle_spread=22.0, seed=5005, mask=m_chassis_bool
    )
    knurl = diamond_knurl(u, v, freq_u=190.0, freq_v=64.0) * m_stirrup

    # CNC machined bevel channels and laser markings
    laser_white = np.zeros((h, w), dtype=np.float32)
    engrave_mask = np.zeros((h, w), dtype=np.float32)

    img_l = Image.new("L", (960, 180), 0)
    dl = ImageDraw.Draw(img_l)
    dl.rounded_rectangle((8, 8, 952, 172), radius=16, outline=190, width=3)
    dl.text((40, 56), "RAVIN CROSSBOWS  ·  R500 HEXCOIL", fill=255, font=load_font(FONT_SANS, 38), anchor="lm")
    dl.text((40, 120), "500 FPS  ·  15\" POWER STROKE  ·  PAT. US 10,852,097", fill=225, font=load_font(FONT_COND, 27), anchor="lm")
    _paste_world_mask(laser_white, img_l, 0.24, 0.86, 0.09, 0.24)

    img_r = Image.new("L", (960, 180), 0)
    dr = ImageDraw.Draw(img_r)
    dr.rounded_rectangle((8, 8, 952, 172), radius=16, outline=190, width=3)
    dr.text((40, 56), "SER. RV-500-04819  ·  VERSADRIVE ACME", fill=255, font=load_font(FONT_SANS, 34), anchor="lm")
    dr.text((40, 120), "SUPERIOR, WI USA  ·  300 LB DRAW / ANTI-DRY-FIRE", fill=225, font=load_font(FONT_COND, 26), anchor="lm")
    _paste_world_mask(laser_white, img_r, 0.14, 0.78, 0.35, 0.50)

    img_br = Image.new("L", (960, 140), 0)
    dbr = ImageDraw.Draw(img_br)
    dbr.text((24, 44), "FRICTIONLESS FLIGHT SYSTEM  ·  OPTICAL BRIDGE", fill=250, font=load_font(FONT_SANS, 29), anchor="lm")
    dbr.text((24, 98), "R2    R4    R6    R8    R10    R12    MIL-STD-1913", fill=215, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(laser_white, img_br, 0.06, 0.70, 0.61, 0.75)

    img_sl = Image.new("L", (760, 140), 0)
    dsl = ImageDraw.Draw(img_sl)
    dsl.rounded_rectangle((6, 6, 754, 134), radius=10, outline=200, width=3)
    dsl.text((34, 46), "TRAC-TRIGGER FLOATING SYSTEM", fill=255, font=load_font(FONT_SANS, 30), anchor="lm")
    dsl.text((34, 98), "3.5 LB MATCH SEAR  ·  ZERO-CREEP", fill=220, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(engrave_mask, img_sl, 0.08, 0.61, 0.82, 0.95)

    # Track wear rails along internal sled guide zone
    track_band = (
        smoothstep(0.01, 0.015, v)
        * (1.0 - smoothstep(0.032, 0.04, v))
        * m_chassis
    )
    beveled_engrave = bevel_mask(engrave_mask > 0.35, 2.5, profile="trapezoid")

    edge_prox = _edge_proximity(m_chassis_bool, 5.5) * smoothstep(
        -0.05, 0.42, fbm_noise(h, w, base_freq=76, octaves=3, seed=5006)
    )
    bare, oxide = chipped_edge_wear(edge_prox * m_chassis, seed=5007, wear_amount=0.40)

    # Height field
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_chassis * (cnc_h * 0.028 + grain * 0.008 - scratches * 0.022 - bare * 0.030 - laser_white * 0.015)
    height += track_band * (cnc_h * 0.018)
    height += m_bridge * (cnc_h * 0.025 + grain * 0.007 - laser_white * 0.015)
    height += m_rail * (cnc_diag * 0.024)
    height += m_sled * (cnc_diag * 0.028 - beveled_engrave * 0.14)
    height += m_stirrup * (knurl * 0.085 + cnc_h * 0.02)

    # Albedo (calibrated sRGB avoiding near-black crush)
    albedo = np.zeros((h, w, 3), dtype=np.float32)
    chassis_col = np.array([0.235, 0.268, 0.320], dtype=np.float32)  # Gunmetal graphite CNC 7075-T6
    bridge_col = np.array([0.215, 0.245, 0.295], dtype=np.float32)
    rail_steel = np.array([0.56, 0.61, 0.68], dtype=np.float32)
    sled_col = np.array([0.36, 0.40, 0.46], dtype=np.float32)
    stirrup_col = np.array([0.66, 0.71, 0.77], dtype=np.float32)
    bare_alu = np.array([0.62, 0.66, 0.72], dtype=np.float32)

    albedo += m_chassis[..., None] * (
        chassis_col * (0.95 + 0.07 * macro[..., None] + 0.04 * cnc_h[..., None])
        - oxide[..., None] * 0.02
    )
    albedo = albedo * (1.0 - bare[..., None]) + bare_alu * bare[..., None]
    albedo = albedo * (1.0 - 0.65 * track_band[..., None]) + np.array([0.58, 0.63, 0.69], dtype=np.float32) * (0.65 * track_band[..., None])

    albedo += m_bridge[..., None] * (
        bridge_col * (0.95 + 0.07 * cnc_h[..., None])
    )
    albedo += m_rail[..., None] * (
        rail_steel * (0.94 + 0.08 * cnc_diag[..., None])
    )
    albedo += m_sled[..., None] * (
        sled_col * (0.95 + 0.08 * cnc_diag[..., None]) - beveled_engrave[..., None] * 0.05
    )
    albedo += m_stirrup[..., None] * (
        stirrup_col * (0.95 + 0.07 * knurl[..., None])
    )

    silver_laser = np.array([0.84, 0.88, 0.93], dtype=np.float32)
    laser_blend = np.clip(laser_white * (m_chassis + m_bridge), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.76 * laser_blend) + silver_laser * (0.76 * laser_blend)

    roughness = (
        m_chassis * (0.37 - 0.14 * bare - 0.12 * track_band - 0.04 * scratches)
        + m_bridge * 0.36
        + m_rail * 0.24
        + m_sled * (0.28 + 0.08 * beveled_engrave)
        + m_stirrup * (0.24 + 0.12 * np.abs(knurl))
    )
    metalness = (
        m_chassis * (0.68 + 0.28 * bare + 0.22 * track_band)
        + m_bridge * 0.72
        + m_rail * 0.88
        + m_sled * 0.86
        + m_stirrup * 0.94
    )
    cavity = 1.0 - 0.22 * beveled_engrave * m_sled - 0.10 * np.maximum(-knurl, 0.0) * m_stirrup

    _save_suite("r500_chassis", albedo, height, roughness, metalness, cavity, strength=2.6)


def build_r500_limbs_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_carbon_bool = v < 0.29
    m_cam_bool = (v >= 0.29) & (v < 0.56) & (u < 0.76)
    m_cam_rim_bool = (v >= 0.29) & (v < 0.56) & (u >= 0.76)
    m_scope_bool = (v >= 0.56) & (v < 0.79) & (u < 0.76)
    m_lens_bool = (v >= 0.56) & (v < 0.79) & (u >= 0.76)
    m_poly_bool = v >= 0.79

    m_carbon = m_carbon_bool.astype(np.float32)
    m_cam = m_cam_bool.astype(np.float32)
    m_cam_rim = m_cam_rim_bool.astype(np.float32)
    m_scope = m_scope_bool.astype(np.float32)
    m_lens = m_lens_bool.astype(np.float32)
    m_poly = m_poly_bool.astype(np.float32)

    macro = fbm_noise(h, w, base_freq=6.0, octaves=4, seed=5101)
    cnc_rad = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=8.0, seed=5102)
    pebbles, edges = worley_cellular(h, w, 132, 264, seed=5103)
    edm = np.clip((0.42 - pebbles) * 1.7 + (edges - 0.17) * 0.5, -1.0, 1.0)
    stipple = laser_stipple_field(h, w, cells_y=115, cells_x=230, seed=5104)

    # 1. 3K 2x2 Twill Carbon-Fiber Weave Synthesis for Quad Limbs
    cell_u = u * 168.0
    cell_v = v * 84.0
    iu = np.floor(cell_u).astype(np.int32)
    iv = np.floor(cell_v).astype(np.int32)
    fu = cell_u - iu
    fv = cell_v - iv
    twill_phase = (iu + iv) % 4
    is_warp = twill_phase < 2
    strand_warp = np.sin(np.clip(fu, 0.04, 0.96) * np.pi) ** 0.65
    strand_weft = np.sin(np.clip(fv, 0.04, 0.96) * np.pi) ** 0.65
    twill_h = np.where(is_warp, strand_warp, strand_weft).astype(np.float32)
    twill_shade = np.where(is_warp, 0.16 * strand_warp, -0.06 * (1.0 - strand_weft)).astype(np.float32)

    # 2. Helical Cam Radial Track Grooves
    groove_wave = np.sin(v * 95.0 * np.pi)
    cam_grooves = smoothstep(0.25, 0.78, groove_wave) * m_cam

    # 3. EDM grip stipple zone on polymer island (grips + buttstock + quiver)
    grip_stipple_zone = (
        smoothstep(0.10, 0.13, u)
        * (1.0 - smoothstep(0.55, 0.58, u))
        * smoothstep(0.81, 0.83, v)
        * (1.0 - smoothstep(0.94, 0.96, v))
        * m_poly
    )

    # 4. Crisp laser markings across carbon limbs, bronze HexCoil cams, scope & quiver
    laser_mask = np.zeros((h, w), dtype=np.float32)

    img_limb = Image.new("L", (880, 130), 0)
    d_limb = ImageDraw.Draw(img_limb)
    d_limb.text((32, 42), "RAVIN  QUAD-LIMB  ·  3K HI-MODULUS CARBON", fill=255, font=load_font(FONT_SANS, 30), anchor="lm")
    d_limb.text((32, 92), "7.6\" UN-COCKED  ->  3.6\" FULL DRAW", fill=220, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(laser_mask, img_limb, 0.10, 0.72, 0.08, 0.22)

    img_cam = Image.new("L", (820, 140), 0)
    d_cam = ImageDraw.Draw(img_cam)
    d_cam.text((30, 44), "HEXCOIL  360°  HELICAL CAM  ·  SYNC TIMING", fill=255, font=load_font(FONT_SANS, 30), anchor="lm")
    d_cam.text((30, 96), "0°   |   90°   |   180°   |   270°   |   310° FULL DRAW", fill=225, font=load_font(FONT_COND, 23), anchor="lm")
    _paste_world_mask(laser_mask, img_cam, 0.08, 0.68, 0.34, 0.50)

    img_sc = Image.new("L", (860, 140), 0)
    d_sc = ImageDraw.Draw(img_sc)
    d_sc.text((28, 44), "RAVIN  1-8x24  ILLUMINATED  100-YD BDC", fill=255, font=load_font(FONT_SANS, 30), anchor="lm")
    d_sc.text((28, 96), "1x   2x   3x   4x   6x   8x  ·  500 FPS CALIBRATED", fill=225, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(laser_mask, img_sc, 0.06, 0.68, 0.60, 0.74)

    img_qv = Image.new("L", (760, 140), 0)
    d_qv = ImageDraw.Draw(img_qv)
    d_qv.text((28, 44), "RAVIN  QD 3-BOLT QUIVER  ·  BULLPUP STOCK", fill=250, font=load_font(FONT_SANS, 29), anchor="lm")
    d_qv.text((28, 96), "ANTI-THUMB SAFETY WING  ·  MATCH ERGONOMIC GRIP", fill=215, font=load_font(FONT_COND, 23), anchor="lm")
    _paste_world_mask(laser_mask, img_qv, 0.58, 0.94, 0.82, 0.95)

    # Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_carbon * (twill_h * 0.055 + macro * 0.010)
    height += m_cam * (cnc_rad * 0.025 + cam_grooves * 0.055 - laser_mask * 0.018)
    height += m_cam_rim * (cnc_rad * 0.020)
    height += m_scope * (edm * 0.018 + cnc_rad * 0.015 - laser_mask * 0.015)
    height += m_poly * (edm * 0.052 + grip_stipple_zone * stipple * 0.16)

    # Albedo (sRGB, anti-black-crush calibrated)
    albedo = np.zeros((h, w, 3), dtype=np.float32)

    carbon_base = np.array([0.210, 0.225, 0.252], dtype=np.float32)
    albedo += m_carbon[..., None] * (
        carbon_base * (0.94 + 0.18 * twill_shade[..., None] + 0.05 * macro[..., None])
    )

    bronze_cam = np.array([0.66, 0.47, 0.22], dtype=np.float32)
    albedo += m_cam[..., None] * (
        bronze_cam * (0.95 + 0.08 * cnc_rad[..., None] - 0.12 * cam_grooves[..., None])
    )
    cam_rim_col = np.array([0.74, 0.62, 0.40], dtype=np.float32)
    albedo += m_cam_rim[..., None] * (cam_rim_col * (0.95 + 0.06 * cnc_rad[..., None]))

    scope_col = np.array([0.215, 0.242, 0.285], dtype=np.float32)
    albedo += m_scope[..., None] * (scope_col * (0.96 + 0.06 * macro[..., None]))

    # Sapphire-Emerald Coated Scope Lens (u >= 0.76, v in [0.56, 0.79))
    lens_du = (u - 0.878) / 0.095
    lens_dv = (v - 0.675) / 0.085
    lens_r = np.sqrt(lens_du * lens_du + lens_dv * lens_dv)
    reticle = np.exp(-((lens_r - 0.42) ** 2) / 0.003) + np.exp(-((lens_du) ** 2) / 0.0012) * (lens_r < 0.65)
    lens_rgb = (
        np.array([0.05, 0.48, 0.56], dtype=np.float32)[None, None, :]
        * (1.06 - 0.25 * np.clip(lens_r, 0.0, 1.2))[..., None]
        + np.array([0.32, 0.90, 0.78], dtype=np.float32)[None, None, :] * (reticle * 0.36)[..., None]
    )
    albedo += m_lens[..., None] * np.clip(lens_rgb, 0.05, 0.95)

    poly_col = np.array([0.220, 0.240, 0.275], dtype=np.float32)
    albedo += m_poly[..., None] * (
        poly_col * (0.96 + 0.06 * macro[..., None])
        + edm[..., None] * 0.010
        - grip_stipple_zone[..., None] * 0.022
    )

    silver_laser = np.array([0.85, 0.88, 0.92], dtype=np.float32)
    laser_blend = np.clip(laser_mask * (m_carbon + m_cam + m_scope + m_poly), 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.75 * laser_blend) + silver_laser * (0.75 * laser_blend)

    roughness = (
        m_carbon * (0.28 + 0.10 * (1.0 - twill_h))
        + m_cam * (0.25 + 0.10 * cam_grooves)
        + m_cam_rim * 0.19
        + m_scope * 0.38
        + m_lens * 0.065
        + m_poly * (0.64 + 0.10 * grip_stipple_zone + 0.02 * edm)
    )
    metalness = (
        m_carbon * 0.16
        + m_cam * 0.88
        + m_cam_rim * 0.94
        + m_scope * 0.64
        + m_lens * 0.86
        + m_poly * 0.04
    )
    cavity = 1.0 - 0.18 * cam_grooves - 0.10 * (1.0 - twill_h) * m_carbon

    _save_suite("r500_limbs", albedo, height, roughness, metalness, cavity, strength=2.5)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_r500_chassis_suite()
    build_r500_limbs_suite()
