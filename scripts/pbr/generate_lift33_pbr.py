#!/usr/bin/env python3
"""Mathews LIFT 33 SwitchWeight-X Compound Bow: 1:1 UV-calibrated 2K PBR atlases.

Generates 6 WebP maps in public/textures/ (zero PNGs left behind):
  1. lift33_riser_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.76, 1.00]: Left CNC 7075-T6 granite-anodized bridged truss riser + MATHEWS LIFT 33 etchings
     - v in [0.54, 0.76]: Right riser flank + Bridge-Lock millimeter dovetail graduations + INTEGRATE MX
     - v in [0.30, 0.54]: Limb pockets & inner milled truss walls (u < 0.72) + stainless weight bolts (u >= 0.72)
     - v in [0.00, 0.30]: Bridge-Lock 5-pin sight housing (u < 0.57) + QAD Integrate MX rest (u >= 0.57)

  2. lift33_limbs_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.62, 1.00]: 2x2 Twill 3K carbon-fiber split quad limbs + MATHEWS QUAD SPLIT LIMBS markings
     - v in [0.32, 0.62]: SwitchWeight-X bronze-gold binary cams (u < 0.53) + 10" carbon stabilizer (u >= 0.53)
     - v in [0.00, 0.32]: Braided BCY-X bowstring + center serving (u < 0.45), LowPro quiver spine (0.45..0.73),
                          acoustic foam broadhead hood (u >= 0.73)
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


def _carbon_twill_weave(u: np.ndarray, v: np.ndarray, freq_u: float, freq_v: float) -> tuple[np.ndarray, np.ndarray]:
    """Generates crisp 2x2 twill carbon-fiber heightfield and warp/weft anisotropy mask."""
    gx = u * freq_u
    gy = v * freq_v
    ix = np.floor(gx).astype(np.int32)
    iy = np.floor(gy).astype(np.int32)
    fx = gx - ix
    fy = gy - iy
    twill = ((ix + iy) & 3) < 2  # True = warp tow on top (horizontal), False = weft tow (vertical)
    warp_h = np.sin(np.clip(fx, 0.05, 0.95) * np.pi) * (0.85 + 0.15 * np.sin(fy * np.pi * 6.0))
    weft_h = np.sin(np.clip(fy, 0.05, 0.95) * np.pi) * (0.85 + 0.15 * np.sin(fx * np.pi * 6.0))
    weave_h = np.where(twill, warp_h, weft_h).astype(np.float32)
    return weave_h, twill.astype(np.float32)


def build_lift33_riser_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_left_bool = v >= 0.76
    m_right_bool = (v >= 0.54) & (v < 0.76)
    m_pocket_bool = (v >= 0.30) & (v < 0.54) & (u < 0.72)
    m_steel_bool = (v >= 0.30) & (v < 0.54) & (u >= 0.72)
    m_sight_bool = (v < 0.30) & (u < 0.57)
    m_rest_bool = (v < 0.30) & (u >= 0.57)

    m_left = m_left_bool.astype(np.float32)
    m_right = m_right_bool.astype(np.float32)
    m_pocket = m_pocket_bool.astype(np.float32)
    m_steel = m_steel_bool.astype(np.float32)
    m_sight = m_sight_bool.astype(np.float32)
    m_rest = m_rest_bool.astype(np.float32)
    m_alloy = np.clip(m_left + m_right + m_pocket + m_sight + m_rest, 0.0, 1.0)

    cnc_fine = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=4.0, seed=1201)
    cnc_cross = cnc_toolpath(h, w, pitch_px=4.2, angle_deg=-12.0, seed=1202)
    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=1203)
    bead_grain = np.clip(spectral_noise(h, w, 190, 420, seed=1204), -2.0, 2.0)
    scratches = scratch_field(
        h, w, count=140, min_len=14, max_len=52, angle_deg=-6, angle_spread=26, seed=1205, mask=m_alloy > 0.5
    )

    # Laser markings & micrometer scales
    laser_white = np.zeros((h, w), dtype=np.float32)
    engrave_cut = np.zeros((h, w), dtype=np.float32)

    img_l = Image.new("L", (1300, 160), 0)
    dl = ImageDraw.Draw(img_l)
    dl.text((40, 52), "MATHEWS  ·  LIFT 33", fill=255, font=load_font(FONT_SANS, 44), anchor="lm")
    dl.text((40, 112), "SWITCHWEIGHT-X  ·  BRIDGE-LOCK  ·  33\" ATA / 6.5\" BH", fill=225, font=load_font(FONT_COND, 28), anchor="lm")
    dl.text((920, 82), "SN  MTH-L33-0842", fill=235, font=load_font(FONT_COND, 30), anchor="lm")
    _paste_world_mask(laser_white, img_l, 0.08, 0.92, 0.79, 0.93)

    img_r = Image.new("L", (1300, 160), 0)
    dr = ImageDraw.Draw(img_r)
    dr.text((40, 54), "7075-T6 BILLET  ·  INTEGRATE MX  ·  SPARTA, WI USA", fill=245, font=load_font(FONT_SANS, 34), anchor="lm")
    dr.text((40, 112), "0    2    4    6    8    10    12    14    16  MM", fill=215, font=load_font(FONT_COND, 24), anchor="lm")
    for tick in range(25):
        tx = 460 + tick * 26
        th = 24 if tick % 5 == 0 else 14
        dr.line([(tx, 145 - th), (tx, 145)], fill=235, width=2)
    _paste_world_mask(laser_white, img_r, 0.08, 0.92, 0.58, 0.72)

    img_pkt = Image.new("L", (920, 140), 0)
    dp = ImageDraw.Draw(img_pkt)
    dp.text((34, 46), "LIMB POCKET  ·  70# PEAK", fill=245, font=load_font(FONT_SANS, 30), anchor="lm")
    dp.text((34, 100), "85% LET-OFF  ·  TORX T25  ·  DO NOT DRY FIRE", fill=220, font=load_font(FONT_COND, 24), anchor="lm")
    _paste_world_mask(engrave_cut, img_pkt, 0.06, 0.68, 0.34, 0.50)

    img_sight = Image.new("L", (740, 140), 0)
    ds = ImageDraw.Draw(img_sight)
    ds.text((28, 42), "BRIDGE-LOCK 5-PIN MICRO", fill=255, font=load_font(FONT_SANS, 28), anchor="lm")
    ds.text((28, 102), "20   30   40   50   60   70 YD", fill=220, font=load_font(FONT_COND, 26), anchor="lm")
    _paste_world_mask(laser_white, img_sight, 0.06, 0.54, 0.06, 0.25)

    img_rest = Image.new("L", (540, 140), 0)
    dre = ImageDraw.Draw(img_rest)
    dre.text((24, 46), "QAD INTEGRATE MX", fill=255, font=load_font(FONT_SANS, 28), anchor="lm")
    dre.text((24, 102), "LOCK  /  DROP TIMING", fill=220, font=load_font(FONT_COND, 23), anchor="lm")
    _paste_world_mask(laser_white, img_rest, 0.60, 0.94, 0.06, 0.25)

    beveled_engrave = bevel_mask(engrave_cut > 0.35, 2.5, profile="trapezoid")

    edge_prox = _edge_proximity(m_left_bool | m_right_bool | m_pocket_bool, 5.0) * smoothstep(
        -0.05, 0.42, fbm_noise(h, w, base_freq=76, octaves=3, seed=1206)
    )
    bare, oxide = chipped_edge_wear(edge_prox * m_alloy, seed=1207, wear_amount=0.38)

    # Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (m_left + m_right) * (cnc_fine * 0.032 + bead_grain * 0.012 - scratches * 0.025 - bare * 0.035)
    height += m_pocket * (cnc_cross * 0.035 + bead_grain * 0.012 - beveled_engrave * 0.14)
    height += m_steel * (cnc_fine * 0.026)
    height += (m_sight + m_rest) * (cnc_cross * 0.028 + bead_grain * 0.014 - laser_white * 0.03)

    # Albedo (sRGB, Khronos calibrated)
    granite_col = np.array([0.245, 0.285, 0.342], dtype=np.float32)
    dark_anod_col = np.array([0.195, 0.228, 0.275], dtype=np.float32)
    stainless_col = np.array([0.66, 0.71, 0.77], dtype=np.float32)
    silver_laser = np.array([0.84, 0.88, 0.93], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    albedo += (m_left + m_right)[..., None] * (
        granite_col * (0.96 + 0.06 * macro[..., None] + 0.04 * cnc_fine[..., None])
        - oxide[..., None] * 0.018
    )
    albedo += m_pocket[..., None] * (
        dark_anod_col * (0.96 + 0.06 * cnc_cross[..., None])
        + beveled_engrave[..., None] * 0.22
    )
    albedo += m_steel[..., None] * (stainless_col * (0.95 + 0.07 * cnc_fine[..., None]))
    albedo += (m_sight + m_rest)[..., None] * (
        dark_anod_col * (0.96 + 0.06 * macro[..., None])
    )
    albedo = albedo * (1.0 - bare[..., None]) + np.array([0.60, 0.65, 0.72], dtype=np.float32) * bare[..., None]

    laser_blend = np.clip(laser_white * m_alloy, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.80 * laser_blend) + silver_laser * (0.80 * laser_blend)

    roughness = (
        (m_left + m_right) * (0.37 + 0.03 * bead_grain - 0.14 * bare - 0.05 * scratches)
        + m_pocket * (0.42 - 0.12 * bare)
        + m_steel * 0.21
        + (m_sight + m_rest) * 0.41
    )
    metalness = (
        (m_left + m_right) * (0.68 + 0.28 * bare)
        + m_pocket * (0.62 + 0.30 * bare)
        + m_steel * 0.94
        + (m_sight + m_rest) * 0.64
    )
    cavity = 1.0 - 0.18 * beveled_engrave * m_pocket

    _save_suite("lift33_riser", albedo, height, roughness, metalness, cavity, strength=2.5)


def build_lift33_limbs_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_limbs_bool = v >= 0.62
    m_cams_bool = (v >= 0.32) & (v < 0.62) & (u < 0.53)
    m_stab_bool = (v >= 0.32) & (v < 0.62) & (u >= 0.53)
    m_string_bool = (v < 0.32) & (u < 0.45)
    m_quiver_bool = (v < 0.32) & (u >= 0.45) & (u < 0.73)
    m_hood_bool = (v < 0.32) & (u >= 0.73)

    m_limbs = m_limbs_bool.astype(np.float32)
    m_cams = m_cams_bool.astype(np.float32)
    m_stab = m_stab_bool.astype(np.float32)
    m_string = m_string_bool.astype(np.float32)
    m_quiver = m_quiver_bool.astype(np.float32)
    m_hood = m_hood_bool.astype(np.float32)

    # 1. 2x2 Twill 3K Carbon-Fiber Weave for limbs & stabilizer
    limb_weave_h, limb_twill = _carbon_twill_weave(u, v, freq_u=192.0, freq_v=96.0)
    stab_weave_h, stab_twill = _carbon_twill_weave(u, v, freq_u=260.0, freq_v=110.0)
    macro = fbm_noise(h, w, base_freq=7, octaves=4, seed=1211)
    pebbles, edges = worley_cellular(h, w, 130, 260, seed=1212)
    foam_grain = np.clip((0.40 - pebbles) * 1.8 + (edges - 0.16) * 0.5, -1.0, 1.0)

    # 2. SwitchWeight-X Cam concentric radial toolpath & anodized bronze-gold markings
    cam_du = (u - 0.28) / 0.22
    cam_dv = (v - 0.47) / 0.13
    cam_r = np.sqrt(cam_du * cam_du + cam_dv * cam_dv)
    cam_rings = np.cos(cam_r * 46.0) * 0.5 + np.sin(cam_r * 19.0) * 0.3
    cam_mod_zone = (smoothstep(0.18, 0.22, u) * (1.0 - smoothstep(0.38, 0.42, u))
                    * smoothstep(0.36, 0.39, v) * (1.0 - smoothstep(0.50, 0.53, v))) * m_cams

    # 3. Braided BCY-X bowstring helical strands & center serving coil
    str_serving = smoothstep(0.185, 0.195, u) * (1.0 - smoothstep(0.265, 0.275, u)) * m_string
    str_braid = np.sin((u * 140.0 + v * 28.0) * np.pi) * np.cos((u * 140.0 - v * 28.0) * np.pi)
    serving_ribs = np.cos(u * 420.0 * np.pi) * str_serving

    # 4. Crisp technical typography
    decal_mask = np.zeros((h, w), dtype=np.float32)

    img_limb = Image.new("L", (1100, 150), 0)
    dl = ImageDraw.Draw(img_limb)
    dl.text((40, 48), "MATHEWS  ·  QUAD SPLIT CARBON-GLASS", fill=245, font=load_font(FONT_SANS, 34), anchor="lm")
    dl.text((40, 108), "BEYOND-PARALLEL PARABOLIC  ·  70# COMP", fill=210, font=load_font(FONT_COND, 26), anchor="lm")
    _paste_world_mask(decal_mask, img_limb, 0.12, 0.88, 0.72, 0.88)

    img_cam = Image.new("L", (640, 150), 0)
    dc = ImageDraw.Draw(img_cam)
    dc.text((320, 44), "SWITCHWEIGHT-X", fill=255, font=load_font(FONT_SANS, 34), anchor="mm")
    dc.text((320, 108), "85% LET-OFF  ·  MOD-F  ·  29.5\"", fill=225, font=load_font(FONT_COND, 25), anchor="mm")
    _paste_world_mask(decal_mask, img_cam, 0.08, 0.48, 0.38, 0.56)

    img_stab = Image.new("L", (640, 130), 0)
    ds = ImageDraw.Draw(img_stab)
    ds.text((320, 44), "BRIDGE-LOCK  10\"  HARMONIC", fill=255, font=load_font(FONT_SANS, 30), anchor="mm")
    ds.text((320, 98), "3K HIGH-MODULUS CARBON", fill=215, font=load_font(FONT_COND, 23), anchor="mm")
    _paste_world_mask(decal_mask, img_stab, 0.56, 0.94, 0.39, 0.55)

    img_q = Image.new("L", (460, 130), 0)
    dq = ImageDraw.Draw(img_q)
    dq.text((230, 65), "LOWPRO · 5-ARROW QD", fill=240, font=load_font(FONT_COND, 28), anchor="mm")
    _paste_world_mask(decal_mask, img_q, 0.48, 0.71, 0.08, 0.26)

    # Height synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_limbs * (limb_weave_h * 0.065 + macro * 0.015)
    height += m_cams * (cam_rings * 0.032 - cam_mod_zone * 0.045 - decal_mask * 0.025)
    height += m_stab * (stab_weave_h * 0.055)
    height += m_string * (str_braid * 0.075 * (1.0 - str_serving) + serving_ribs * 0.085)
    height += m_quiver * (foam_grain * 0.035 + stab_weave_h * 0.02)
    height += m_hood * (foam_grain * 0.09)

    # Albedo (sRGB)
    carbon_dark = np.array([0.175, 0.200, 0.235], dtype=np.float32)
    carbon_sheen = np.array([0.275, 0.310, 0.360], dtype=np.float32)
    cam_bronze = np.array([0.665, 0.445, 0.215], dtype=np.float32)
    cam_mod_col = np.array([0.260, 0.215, 0.175], dtype=np.float32)
    str_gray = np.array([0.415, 0.465, 0.525], dtype=np.float32)
    str_black = np.array([0.185, 0.215, 0.258], dtype=np.float32)
    quiver_col = np.array([0.205, 0.232, 0.272], dtype=np.float32)
    hood_col = np.array([0.182, 0.204, 0.238], dtype=np.float32)
    silver_decal = np.array([0.82, 0.85, 0.89], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    limb_rgb = carbon_dark * (1.0 - limb_twill[..., None] * 0.55) + carbon_sheen * (limb_twill[..., None] * 0.55 + limb_weave_h[..., None] * 0.22)
    albedo += m_limbs[..., None] * limb_rgb

    cam_rgb = cam_bronze * (0.94 + 0.08 * cam_rings[..., None])
    cam_rgb = cam_rgb * (1.0 - cam_mod_zone[..., None]) + cam_mod_col * cam_mod_zone[..., None]
    albedo += m_cams[..., None] * cam_rgb

    stab_rgb = carbon_dark * (1.0 - stab_twill[..., None] * 0.50) + carbon_sheen * (stab_twill[..., None] * 0.50 + stab_weave_h[..., None] * 0.20)
    albedo += m_stab[..., None] * stab_rgb

    braid_mix = smoothstep(-0.3, 0.3, str_braid)[..., None]
    str_rgb = (str_gray * braid_mix + str_black * (1.0 - braid_mix)) * (1.0 - str_serving[..., None]) + str_black * str_serving[..., None]
    albedo += m_string[..., None] * str_rgb

    albedo += m_quiver[..., None] * (quiver_col * (0.95 + 0.08 * stab_weave_h[..., None]))
    albedo += m_hood[..., None] * (hood_col * (0.95 + 0.07 * foam_grain[..., None]))

    decal_blend = np.clip(decal_mask, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.72 * decal_blend) + silver_decal * (0.72 * decal_blend)

    roughness = (
        m_limbs * (0.28 + 0.14 * limb_twill)
        + m_cams * (0.24 + 0.12 * cam_mod_zone)
        + m_stab * (0.27 + 0.13 * stab_twill)
        + m_string * (0.64 - 0.10 * str_serving)
        + m_quiver * 0.52
        + m_hood * (0.82 + 0.06 * foam_grain)
    )
    metalness = (
        m_limbs * 0.08
        + m_cams * (0.88 - 0.26 * cam_mod_zone)
        + m_stab * 0.08
        + m_string * 0.04
        + m_quiver * 0.06
        + m_hood * 0.02
    )
    cavity = 1.0 - 0.15 * (1.0 - limb_weave_h) * m_limbs - 0.18 * cam_mod_zone

    _save_suite("lift33_limbs", albedo, height, roughness, metalness, cavity, strength=2.6)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_lift33_riser_suite()
    build_lift33_limbs_suite()
