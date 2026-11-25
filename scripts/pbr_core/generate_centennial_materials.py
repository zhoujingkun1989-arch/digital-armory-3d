#!/usr/bin/env python3
"""
Deterministic 13-Material 1024x1024 Seamless 5-Channel Packed ORM PBR Library
-----------------------------------------------------------------------------
Generates the shared museum material texture suite for Digital Armory 3D's
66 Centennial Procedural CAD exhibits (1,320 parts):

  public/textures/centennial_mat_<name>_{albedo,normal,roughness}.webp

All 39 outputs are strictly:
  - 1024x1024 3-channel RGB WebP (hasAlpha === false, 0 PNGs)
  - Periodic on the 2D torus [0, 1024) x [0, 1024) (zero tiling seams)
  - High-value multiplicative detail albedo (mean sRGB ~0.84-0.92, never crushed)
    designed to multiply cleanly against per-exhibit vertex colors under AgX
  - OpenGL (+Y up) tangent-space normal maps computed via 3x3 periodic Scharr
  - 5-channel Packed ORM maps in `*_roughness.webp` (R = Cavity AO,
    G = Physical Roughness, B = Physical Metalness)
  - Combined footprint strictly < 10 MB across all 39 WebP files

Usage:
  python3 scripts/pbr_core/generate_centennial_materials.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Tuple

import numpy as np
from PIL import Image
from scipy import ndimage

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = PROJECT_ROOT / "public" / "textures"

SIZE = 1024
BASE_SEED = 20261125
MAX_TOTAL_BYTES = 10 * 1024 * 1024  # 10 MB constitutional hard ceiling


@dataclass(frozen=True)
class MaterialOutput:
    albedo_rgb: np.ndarray  # (N, N, 3) uint8 sRGB multiplicative detail albedo
    normal_rgb: np.ndarray  # (N, N, 3) uint8 OpenGL tangent-space normal
    orm_rgb: np.ndarray     # (N, N, 3) uint8 R=AO, G=Roughness, B=Metalness


# ---------------------------------------------------------------------------
# Strictly Periodic 2D Torus Procedural Primitives
# ---------------------------------------------------------------------------


def periodic_fft_fbm(
    n: int,
    f_min: float,
    f_max: float,
    power: float,
    seed: int,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
) -> np.ndarray:
    """Zero-mean, unit-std strictly periodic band-limited 2D FFT field."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((n, n)).astype(np.float32)
    spec = np.fft.rfft2(white)

    fy = np.fft.fftfreq(n)[:, None] * n * aniso_y
    fx = np.fft.rfftfreq(n)[None, :] * n * aniso_x
    freq = np.hypot(fx, fy)

    low_w = np.clip((freq - f_min * 0.75) / max(f_min * 0.5, 1.0), 0.0, 1.0)
    low_w = low_w * low_w * (3.0 - 2.0 * low_w)
    high_w = 1.0 - np.clip((freq - f_max) / max(f_max * 0.35, 1.0), 0.0, 1.0)
    high_w = high_w * high_w * (3.0 - 2.0 * high_w)
    env = (low_w * high_w) / np.maximum(freq, 1.0) ** power
    env[0, 0] = 0.0

    field = np.fft.irfft2(spec * env, s=(n, n)).astype(np.float32)
    field -= float(np.mean(field))
    std = float(np.std(field)) + 1e-7
    return field / std


def periodic_domain_warp(
    field: np.ndarray,
    disp_x: np.ndarray,
    disp_y: np.ndarray,
) -> np.ndarray:
    """Bilinearly resamples `field` on a periodic 2D torus with pixel displacements."""
    n = field.shape[0]
    yy, xx = np.meshgrid(
        np.arange(n, dtype=np.float32),
        np.arange(n, dtype=np.float32),
        indexing="ij",
    )
    coords = np.array([(yy + disp_y) % n, (xx + disp_x) % n], dtype=np.float32)
    return ndimage.map_coordinates(field, coords, order=1, mode="grid-wrap").astype(np.float32)


def periodic_scharr_normal(height: np.ndarray, strength: float) -> np.ndarray:
    """Strictly periodic OpenGL (+Y up) tangent-space normal map via 3x3 Scharr."""
    h_xm = np.roll(height, 1, axis=1)
    h_xp = np.roll(height, -1, axis=1)
    h_ym = np.roll(height, 1, axis=0)
    h_yp = np.roll(height, -1, axis=0)

    h_xm_ym = np.roll(h_xm, 1, axis=0)
    h_xp_ym = np.roll(h_xp, 1, axis=0)
    h_xm_yp = np.roll(h_xm, -1, axis=0)
    h_xp_yp = np.roll(h_xp, -1, axis=0)

    dh_dx = (
        3.0 * (h_xp_ym - h_xm_ym)
        + 10.0 * (h_xp - h_xm)
        + 3.0 * (h_xp_yp - h_xm_yp)
    ) / 32.0
    dh_dy = (
        3.0 * (h_xm_yp - h_xm_ym)
        + 10.0 * (h_yp - h_ym)
        + 3.0 * (h_xp_yp - h_xp_ym)
    ) / 32.0

    nx = -dh_dx * strength
    ny = dh_dy * strength
    nz = np.ones_like(height, dtype=np.float32)

    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    nx *= inv_len
    ny *= inv_len
    nz *= inv_len

    rgb = np.empty((height.shape[0], height.shape[1], 3), dtype=np.uint8)
    rgb[..., 0] = np.clip(np.rint((nx * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    rgb[..., 1] = np.clip(np.rint((ny * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    rgb[..., 2] = np.clip(np.rint((nz * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    return rgb


def compute_cavity_ao(
    height: np.ndarray,
    blur_sigma: float,
    ao_min: float,
    strength: float,
) -> np.ndarray:
    """Computes periodic local-cavity ambient occlusion in [ao_min, 1.0]."""
    local_mean = ndimage.gaussian_filter(height, sigma=blur_sigma, mode="wrap").astype(np.float32)
    cavity = np.maximum(0.0, local_mean - height)
    std = float(np.std(height)) + 1e-6
    ao = 1.0 - np.clip((cavity / std) * strength, 0.0, 1.0 - ao_min)
    return np.clip(ao, ao_min, 1.0).astype(np.float32)


def pack_orm(ao_01: np.ndarray, rough_01: np.ndarray, metal_01: np.ndarray | float) -> np.ndarray:
    """Packs R=AO, G=Roughness, B=Metalness into a 3-channel uint8 RGB image."""
    n = ao_01.shape[0]
    orm = np.empty((n, n, 3), dtype=np.uint8)
    orm[..., 0] = np.clip(np.rint(np.clip(ao_01, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)
    orm[..., 1] = np.clip(np.rint(np.clip(rough_01, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)
    if isinstance(metal_01, (int, float)):
        orm[..., 2] = int(round(max(0.0, min(1.0, float(metal_01))) * 255.0))
    else:
        orm[..., 2] = np.clip(np.rint(np.clip(metal_01, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)
    return orm


def calibrate_mult_albedo(
    pattern_01: np.ndarray,
    *,
    lo: float,
    hi: float,
    target_mean: float,
    tint_rgb: Tuple[float, float, float] = (1.0, 1.0, 1.0),
    trough_tint_rgb: Tuple[float, float, float] | None = None,
) -> np.ndarray:
    """
    Maps a normalized [0, 1] procedural detail field into a calibrated HIGH-VALUE
    multiplicative sRGB albedo (mean ~target_mean in [0.84, 0.93], troughs >= lo).
    """
    p = np.clip(pattern_01.astype(np.float32), 0.0, 1.0)
    luma = lo + p * (hi - lo)
    # Gently shift mean to target_mean while preserving crisp dark troughs
    cur_mean = float(np.mean(luma))
    if abs(cur_mean - target_mean) > 1e-4:
        luma = np.clip(luma + (target_mean - cur_mean), lo * 0.94, 0.995)

    rgb = np.empty((p.shape[0], p.shape[1], 3), dtype=np.float32)
    if trough_tint_rgb is None:
        rgb[..., 0] = luma * tint_rgb[0]
        rgb[..., 1] = luma * tint_rgb[1]
        rgb[..., 2] = luma * tint_rgb[2]
    else:
        for ch in range(3):
            c_tint = trough_tint_rgb[ch] * (1.0 - p) + tint_rgb[ch] * p
            rgb[..., ch] = luma * c_tint

    # Re-verify channel-averaged mean stays tightly calibrated
    mean_rgb = float(np.mean(rgb))
    if abs(mean_rgb - target_mean) > 0.008:
        rgb *= target_mean / max(mean_rgb, 1e-4)

    return np.clip(np.rint(np.clip(rgb, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)


def periodic_rha_pits_1024(n: int, seed: int) -> Tuple[np.ndarray, np.ndarray]:
    """Toroidal forged/cast RHA steel pitting & foundry micro-craters at 1024x1024."""
    rng = np.random.default_rng(seed)
    pit_height = np.zeros((n, n), dtype=np.float32)
    pit_mask = np.zeros((n, n), dtype=np.float32)

    layers = [
        (180, 6.5, 14.0, 0.72, 1.25),
        (460, 2.5, 5.8, 0.50, 0.95),
    ]

    for count, r_min, r_max, d_min, d_max in layers:
        cy = rng.uniform(0.0, n, size=count)
        cx = rng.uniform(0.0, n, size=count)
        rad = rng.uniform(r_min, r_max, size=count)
        depth = rng.uniform(d_min, d_max, size=count)
        aspect = rng.uniform(0.65, 1.50, size=count)
        angle = rng.uniform(0.0, np.pi, size=count)

        for i in range(count):
            r = float(rad[i])
            win = int(np.ceil(r * 1.85)) + 2
            iy0 = int(np.floor(cy[i]))
            ix0 = int(np.floor(cx[i]))
            oy = np.arange(-win, win + 1, dtype=np.int32)
            ox = np.arange(-win, win + 1, dtype=np.int32)
            gy = (iy0 + oy) % n
            gx = (ix0 + ox) % n

            dy = (iy0 + oy - cy[i])[:, None].astype(np.float32)
            dx = (ix0 + ox - cx[i])[None, :].astype(np.float32)

            ca = float(np.cos(angle[i]))
            sa = float(np.sin(angle[i]))
            rx = (dx * ca + dy * sa) * float(aspect[i])
            ry = (-dx * sa + dy * ca) / float(aspect[i])
            d = np.hypot(rx, ry) / r

            inside = np.clip(1.0 - d * d, 0.0, 1.0)
            bowl = inside * inside * (3.0 - 2.0 * inside)
            lip = np.exp(-((d - 1.12) / 0.24) ** 2) * 0.14

            sub_h = (-bowl + lip) * float(depth[i])
            sub_m = bowl * float(depth[i])

            idx = np.ix_(gy, gx)
            pit_height[idx] = np.minimum(pit_height[idx], sub_h)
            pit_mask[idx] = np.maximum(pit_mask[idx], sub_m)

    wx = periodic_fft_fbm(n, 8.0, 26.0, 0.9, seed + 101) * 2.6
    wy = periodic_fft_fbm(n, 8.0, 26.0, 0.9, seed + 102) * 2.6
    pit_height = periodic_domain_warp(pit_height, wx, wy)
    pit_mask = np.clip(periodic_domain_warp(pit_mask, wx, wy), 0.0, 1.0)
    pit_height -= float(np.mean(pit_height))
    return pit_height, pit_mask


# ---------------------------------------------------------------------------
# 13 Museum Material Synthesizers (U = X along barrel/stock, V = Y vertical)
# ---------------------------------------------------------------------------


def synth_oiled_walnut(n: int, seed: int) -> MaterialOutput:
    """1. Oiled Walnut — longitudinal (+X/U) cathedral grain + horizontal open wood pores + satin oil."""
    yy, _ = np.meshgrid(
        np.arange(n, dtype=np.float32) / n,
        np.arange(n, dtype=np.float32) / n,
        indexing="ij",
    )
    # Large aniso_x suppresses horizontal oscillation -> long graceful sweeping cathedral grain along +X
    cathedral_warp = periodic_fft_fbm(n, 1.5, 6.0, 1.45, seed + 1, aniso_x=3.2, aniso_y=0.85) * 0.28
    mid_warp = periodic_fft_fbm(n, 4.0, 14.0, 1.25, seed + 2, aniso_x=3.8, aniso_y=0.9) * 0.045
    phase = 2.0 * np.pi * (yy * 11.0 + cathedral_warp + mid_warp)
    rings = 0.5 + 0.5 * np.sin(phase + 0.45 * np.sin(2.0 * phase))
    # Sharpen dark latewood bands like real American/European walnut
    grain = np.power(rings, 0.58)

    # Fine silk wood fibers & open vessel pores strictly elongated horizontally along +X (U)
    fibers = periodic_fft_fbm(n, 18.0, 125.0, 0.72, seed + 3, aniso_x=4.5, aniso_y=0.65)
    pores_raw = periodic_fft_fbm(n, 26.0, 140.0, 0.58, seed + 4, aniso_x=5.0, aniso_y=0.65)
    pores = np.clip((-pores_raw - 1.10) / 1.35, 0.0, 1.0)

    broad_tone = periodic_fft_fbm(n, 1.5, 6.0, 1.25, seed + 5, aniso_x=2.4, aniso_y=0.9)
    pattern = np.clip(
        0.58 * grain + 0.16 * (0.5 + 0.18 * fibers) + 0.14 * (0.5 + 0.20 * broad_tone) + 0.12 - 0.34 * pores,
        0.0,
        1.0,
    )

    height = (grain * 0.46 + fibers * 0.14 - pores * 1.45).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.45, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.58,
        hi=0.98,
        target_mean=0.86,
        tint_rgb=(1.02, 0.99, 0.94),
        trough_tint_rgb=(0.95, 0.90, 0.84),
    )
    normal = periodic_scharr_normal(height, strength=0.72)
    ao = compute_cavity_ao(height, blur_sigma=3.2, ao_min=0.72, strength=0.38)
    rough = np.clip(0.62 - 0.045 * (grain - 0.5) + 0.09 * pores - 0.015 * broad_tone, 0.58, 0.70)
    orm = pack_orm(ao, rough, 0.0)
    return MaterialOutput(albedo, normal, orm)


def synth_russian_laminate(n: int, seed: int) -> MaterialOutput:
    """2. Russian Laminate — horizontal layered birch veneer plies + shellac gloss variation."""
    yy, _ = np.meshgrid(
        np.arange(n, dtype=np.float32) / n,
        np.arange(n, dtype=np.float32) / n,
        indexing="ij",
    )
    # Contoured laminate ply bands sculpted smoothly along +X stock axis
    ply_warp = periodic_fft_fbm(n, 1.5, 5.0, 1.45, seed + 11, aniso_x=2.6, aniso_y=0.9) * 0.055
    ply_phase = 2.0 * np.pi * (yy * 14.0 + ply_warp)
    ply_wave = 0.5 + 0.5 * np.sin(ply_phase)
    # Thin dark phenol-resin glue seams between alternating light/medium birch plies
    glue_line = np.exp(-((np.abs(np.sin(ply_phase * 0.5))) / 0.09) ** 2)
    birch_fiber = periodic_fft_fbm(n, 18.0, 130.0, 0.68, seed + 12, aniso_x=4.8, aniso_y=0.65)
    shellac_cloud = periodic_fft_fbm(n, 2.0, 8.0, 1.2, seed + 13)

    pattern = np.clip(
        0.55 + 0.28 * ply_wave + 0.10 * np.clip(birch_fiber * 0.25, -0.3, 0.3) - 0.42 * glue_line + 0.05 * shellac_cloud,
        0.0,
        1.0,
    )
    height = (ply_wave * 0.32 - glue_line * 0.85 + birch_fiber * 0.14 + shellac_cloud * 0.12).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.48, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.60,
        hi=0.98,
        target_mean=0.87,
        tint_rgb=(1.03, 0.99, 0.92),
        trough_tint_rgb=(0.98, 0.90, 0.80),
    )
    normal = periodic_scharr_normal(height, strength=0.54)
    ao = compute_cavity_ao(height, blur_sigma=3.0, ao_min=0.78, strength=0.30)
    rough = np.clip(0.53 + 0.055 * glue_line - 0.04 * shellac_cloud - 0.02 * (ply_wave - 0.5), 0.46, 0.62)
    orm = pack_orm(ao, rough, 0.0)
    return MaterialOutput(albedo, normal, orm)


def synth_beech_yew(n: int, seed: int) -> MaterialOutput:
    """3. Beech & Yew — fine historical straight/wavy longitudinal (+X/U) wood grain + medullary flecks."""
    yy, _ = np.meshgrid(
        np.arange(n, dtype=np.float32) / n,
        np.arange(n, dtype=np.float32) / n,
        indexing="ij",
    )
    gentle_wave = periodic_fft_fbm(n, 1.5, 6.0, 1.4, seed + 21, aniso_x=3.4, aniso_y=0.85) * 0.12
    phase = 2.0 * np.pi * (yy * 18.0 + gentle_wave)
    fine_grain = 0.5 + 0.5 * np.sin(phase)
    fibers = periodic_fft_fbm(n, 20.0, 145.0, 0.68, seed + 22, aniso_x=4.6, aniso_y=0.65)
    flecks_raw = periodic_fft_fbm(n, 24.0, 105.0, 0.55, seed + 23, aniso_x=4.2, aniso_y=0.70)
    flecks = np.clip((flecks_raw - 1.38) / 1.15, 0.0, 1.0)
    tone = periodic_fft_fbm(n, 1.5, 6.0, 1.25, seed + 24, aniso_x=2.6, aniso_y=0.9)

    pattern = np.clip(
        0.52 + 0.24 * (fine_grain - 0.5) + 0.10 * np.clip(fibers * 0.25, -0.35, 0.35) + 0.08 * tone - 0.34 * flecks,
        0.0,
        1.0,
    )
    height = (fine_grain * 0.34 + fibers * 0.16 - flecks * 0.72).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.45, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.66,
        hi=0.98,
        target_mean=0.89,
        tint_rgb=(1.02, 1.00, 0.95),
        trough_tint_rgb=(0.98, 0.94, 0.87),
    )
    normal = periodic_scharr_normal(height, strength=0.55)
    ao = compute_cavity_ao(height, blur_sigma=2.8, ao_min=0.82, strength=0.28)
    rough = np.clip(0.61 + 0.06 * flecks - 0.025 * (fine_grain - 0.5) - 0.015 * tone, 0.56, 0.68)
    orm = pack_orm(ao, rough, 0.0)
    return MaterialOutput(albedo, normal, orm)


def synth_blued_steel(n: int, seed: int) -> MaterialOutput:
    """4. Blued Steel — anisotropic longitudinal (+X/U) CNC machining streaks + oil sheen."""
    streaks_fine = periodic_fft_fbm(n, 24.0, 190.0, 0.58, seed + 31, aniso_x=6.5, aniso_y=0.55)
    streaks_mid = periodic_fft_fbm(n, 10.0, 72.0, 0.78, seed + 32, aniso_x=4.8, aniso_y=0.65)
    oil_cloud = periodic_fft_fbm(n, 2.0, 9.0, 1.2, seed + 33)
    micro_pit = periodic_fft_fbm(n, 60.0, 190.0, 0.5, seed + 34)

    pattern = np.clip(
        0.62 + 0.18 * np.clip(streaks_fine * 0.38, -0.5, 0.5) + 0.14 * np.clip(streaks_mid * 0.36, -0.5, 0.5) + 0.06 * oil_cloud,
        0.0,
        1.0,
    )
    height = (streaks_fine * 0.36 + streaks_mid * 0.28 + micro_pit * 0.08).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.38, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.73,
        hi=0.98,
        target_mean=0.89,
        tint_rgb=(0.98, 0.99, 1.03),
        trough_tint_rgb=(0.95, 0.97, 1.02),
    )
    normal = periodic_scharr_normal(height, strength=0.46)
    ao = compute_cavity_ao(height, blur_sigma=2.4, ao_min=0.86, strength=0.22)
    rough = np.clip(0.31 - 0.025 * oil_cloud - 0.018 * streaks_mid + 0.012 * micro_pit, 0.26, 0.36)
    orm = pack_orm(ao, rough, 0.92)
    return MaterialOutput(albedo, normal, orm)


def synth_parkerized_steel(n: int, seed: int) -> MaterialOutput:
    """5. Parkerized Steel — micro-crystalline manganese phosphate grit + satin matte."""
    crystal_fine = periodic_fft_fbm(n, 55.0, 185.0, 0.50, seed + 41)
    crystal_mid = periodic_fft_fbm(n, 18.0, 62.0, 0.72, seed + 42)
    roll_grain = periodic_fft_fbm(n, 6.0, 28.0, 0.95, seed + 43, aniso_x=2.4, aniso_y=0.85)
    oil_patch = periodic_fft_fbm(n, 2.5, 9.0, 1.2, seed + 44)

    pattern = np.clip(
        0.58 + 0.16 * np.clip(crystal_fine * 0.35, -0.5, 0.5) + 0.15 * np.clip(crystal_mid * 0.35, -0.5, 0.5) + 0.08 * roll_grain + 0.06 * oil_patch,
        0.0,
        1.0,
    )
    height = (crystal_fine * 0.42 + crystal_mid * 0.46 + roll_grain * 0.26).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.36, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.70,
        hi=0.97,
        target_mean=0.87,
        tint_rgb=(0.99, 1.00, 0.99),
        trough_tint_rgb=(0.96, 0.98, 0.97),
    )
    normal = periodic_scharr_normal(height, strength=0.64)
    ao = compute_cavity_ao(height, blur_sigma=2.2, ao_min=0.80, strength=0.28)
    rough = np.clip(0.44 + 0.03 * crystal_mid - 0.028 * oil_patch + 0.015 * crystal_fine, 0.38, 0.50)
    orm = pack_orm(ao, rough, 0.84)
    return MaterialOutput(albedo, normal, orm)


def synth_anodized_alloy(n: int, seed: int) -> MaterialOutput:
    """6. Anodized Alloy — Type III bead-blasted fine satin aluminum/titanium."""
    bead_fine = periodic_fft_fbm(n, 64.0, 210.0, 0.48, seed + 51)
    bead_mid = periodic_fft_fbm(n, 22.0, 68.0, 0.72, seed + 52)
    mill_pass = periodic_fft_fbm(n, 4.0, 16.0, 1.15, seed + 53, aniso_x=2.6, aniso_y=0.85)

    pattern = np.clip(
        0.64 + 0.14 * np.clip(bead_fine * 0.32, -0.45, 0.45) + 0.12 * np.clip(bead_mid * 0.32, -0.45, 0.45) + 0.07 * mill_pass,
        0.0,
        1.0,
    )
    height = (bead_fine * 0.32 + bead_mid * 0.28 + mill_pass * 0.16).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.36, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.77,
        hi=0.98,
        target_mean=0.90,
        tint_rgb=(0.99, 1.00, 1.01),
    )
    normal = periodic_scharr_normal(height, strength=0.40)
    ao = compute_cavity_ao(height, blur_sigma=2.0, ao_min=0.88, strength=0.20)
    rough = np.clip(0.39 + 0.022 * bead_mid - 0.018 * mill_pass + 0.012 * bead_fine, 0.34, 0.44)
    orm = pack_orm(ao, rough, 0.88)
    return MaterialOutput(albedo, normal, orm)


def synth_brushed_stainless(n: int, seed: int) -> MaterialOutput:
    """7. Brushed Stainless — crisp anisotropic horizontal (+X/U) brushed hairlines + bright metallic ORM."""
    hair_hi = periodic_fft_fbm(n, 36.0, 230.0, 0.52, seed + 61, aniso_x=8.0, aniso_y=0.50)
    hair_mid = periodic_fft_fbm(n, 14.0, 96.0, 0.70, seed + 62, aniso_x=5.6, aniso_y=0.60)
    broad = periodic_fft_fbm(n, 2.0, 10.0, 1.25, seed + 63, aniso_x=2.8, aniso_y=0.85)

    pattern = np.clip(
        0.64 + 0.22 * np.clip(hair_hi * 0.36, -0.5, 0.5) + 0.16 * np.clip(hair_mid * 0.36, -0.5, 0.5) + 0.05 * broad,
        0.0,
        1.0,
    )
    height = (hair_hi * 0.44 + hair_mid * 0.34).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.35, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.74,
        hi=0.995,
        target_mean=0.91,
        tint_rgb=(0.99, 1.00, 1.01),
    )
    normal = periodic_scharr_normal(height, strength=0.52)
    ao = compute_cavity_ao(height, blur_sigma=2.0, ao_min=0.86, strength=0.22)
    rough = np.clip(0.23 - 0.022 * hair_mid - 0.015 * broad + 0.014 * np.abs(hair_hi), 0.18, 0.28)
    orm = pack_orm(ao, rough, 0.98)
    return MaterialOutput(albedo, normal, orm)


def synth_tactical_polymer(n: int, seed: int) -> MaterialOutput:
    """8. Tactical Polymer — isotropic EDM mould micro-stipple + matte nylon."""
    stipple_mid = periodic_fft_fbm(n, 34.0, 102.0, 0.62, seed + 71)
    stipple_fine = periodic_fft_fbm(n, 92.0, 210.0, 0.48, seed + 72)
    mould_mottle = periodic_fft_fbm(n, 6.0, 22.0, 1.05, seed + 73)

    # Slightly flatten pebble peaks like real EDM spark-eroded injection-mould texture
    pebble = np.tanh(stipple_mid * 0.85) * 0.65 + stipple_fine * 0.35

    pattern = np.clip(
        0.60 + 0.24 * np.clip(pebble * 0.42, -0.5, 0.5) + 0.08 * mould_mottle,
        0.0,
        1.0,
    )
    height = (pebble * 0.72 + mould_mottle * 0.18).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.40, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.71,
        hi=0.97,
        target_mean=0.88,
        tint_rgb=(1.0, 1.0, 1.0),
    )
    normal = periodic_scharr_normal(height, strength=0.70)
    ao = compute_cavity_ao(height, blur_sigma=2.5, ao_min=0.78, strength=0.32)
    rough = np.clip(0.66 - 0.028 * pebble + 0.020 * mould_mottle, 0.60, 0.72)
    orm = pack_orm(ao, rough, 0.0)
    return MaterialOutput(albedo, normal, orm)


def synth_checkered_grip(n: int, seed: int) -> MaterialOutput:
    """9. Checkered Grip — crisp 20-LPI 45-deg diamond pyramid checkering + deep groove AO."""
    yy, xx = np.meshgrid(
        np.arange(n, dtype=np.float32),
        np.arange(n, dtype=np.float32),
        indexing="ij",
    )
    # K=36 across 4.5 cm tile -> 8 lines/cm (~20.3 LPI), strictly periodic on [0, N)^2
    k = 36.0
    u_rot = ((xx + yy) * (k / n)) % 1.0
    v_rot = ((xx - yy) * (k / n)) % 1.0

    # Pyramid facets rising from sharp V-grooves (0) to slightly truncated diamond crowns (0.86)
    tri_u = 1.0 - 2.0 * np.abs(u_rot - 0.5)
    tri_v = 1.0 - 2.0 * np.abs(v_rot - 0.5)
    pyramid = np.minimum(tri_u, tri_v)
    crown = np.minimum(pyramid / 0.86, 1.0)
    # Sharpen V-groove bottom slightly for dramatic grazing specular bite
    shaped = np.power(crown, 0.88).astype(np.float32)

    micro_grain = periodic_fft_fbm(n, 28.0, 130.0, 0.65, seed + 81) * 0.045
    height = (shaped * 2.20 + micro_grain).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.42, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    groove_mask = np.clip(1.0 - shaped, 0.0, 1.0)
    pattern = np.clip(0.14 + 0.82 * shaped + micro_grain * 1.4, 0.0, 1.0)

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.56,
        hi=0.98,
        target_mean=0.84,
        tint_rgb=(1.00, 1.00, 0.99),
        trough_tint_rgb=(0.94, 0.93, 0.92),
    )
    normal = periodic_scharr_normal(height, strength=1.55)
    # Deep physical AO inside checkering V-grooves
    ao = np.clip(1.0 - 0.44 * np.power(groove_mask, 1.25), 0.54, 1.0).astype(np.float32)
    rough = np.clip(0.56 + 0.18 * groove_mask + 0.015 * (micro_grain * 10.0), 0.56, 0.74)
    orm = pack_orm(ao, rough, 0.0)
    return MaterialOutput(albedo, normal, orm)


def synth_cast_rha_armor(n: int, seed: int) -> MaterialOutput:
    """10. Cast RHA Armor — WWII cast/rolled steel pitting, foundry orange-peel & weld grain."""
    mill_wave = periodic_fft_fbm(n, 3.0, 10.0, 1.15, seed + 91, aniso_x=1.40, aniso_y=0.82)
    wx = periodic_fft_fbm(n, 4.0, 12.0, 1.0, seed + 92) * 5.2
    wy = periodic_fft_fbm(n, 4.0, 12.0, 1.0, seed + 93) * 5.2
    foundry = periodic_domain_warp(
        periodic_fft_fbm(n, 12.0, 38.0, 0.90, seed + 94),
        wx,
        wy,
    )
    pits_h, pits_mask = periodic_rha_pits_1024(n, seed + 95)
    grit_fine = periodic_fft_fbm(n, 44.0, 145.0, 0.58, seed + 96)

    height = (
        mill_wave * 0.85
        + foundry * 0.68
        + pits_h * 1.60
        + grit_fine * 0.28
    ).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.45, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    pattern = np.clip(
        0.64 + 0.14 * np.clip(mill_wave * 0.30, -0.4, 0.4) + 0.12 * np.clip(foundry * 0.30, -0.4, 0.4) - 0.36 * pits_mask + 0.05 * grit_fine,
        0.0,
        1.0,
    )
    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.61,
        hi=0.97,
        target_mean=0.86,
        tint_rgb=(1.00, 1.00, 0.99),
        trough_tint_rgb=(0.96, 0.95, 0.93),
    )
    normal = periodic_scharr_normal(height, strength=0.88)
    ao = compute_cavity_ao(height, blur_sigma=4.0, ao_min=0.70, strength=0.42)
    rough = np.clip(0.74 + 0.08 * pits_mask - 0.032 * mill_wave - 0.025 * foundry + 0.020 * grit_fine, 0.68, 0.82)
    orm = pack_orm(ao, rough, 0.18)
    return MaterialOutput(albedo, normal, orm)


def synth_carc_olive(n: int, seed: int) -> MaterialOutput:
    """11. CARC Olive — dead-matte silica polyurethane speckle + faint field wear."""
    plate_wave = periodic_fft_fbm(n, 3.0, 11.0, 1.15, seed + 101)
    silica_mid = periodic_fft_fbm(n, 28.0, 82.0, 0.68, seed + 102)
    silica_fine = periodic_fft_fbm(n, 76.0, 195.0, 0.50, seed + 103)
    field_wear = periodic_fft_fbm(n, 2.0, 8.0, 1.25, seed + 104, aniso_x=1.25, aniso_y=0.75)

    height = (plate_wave * 0.42 + silica_mid * 0.55 + silica_fine * 0.32).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.38, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    pattern = np.clip(
        0.62 + 0.14 * np.clip(field_wear * 0.35, -0.45, 0.45) + 0.12 * np.clip(silica_mid * 0.34, -0.45, 0.45) + 0.08 * np.clip(silica_fine * 0.30, -0.4, 0.4),
        0.0,
        1.0,
    )
    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.71,
        hi=0.98,
        target_mean=0.88,
        tint_rgb=(0.99, 1.01, 0.97),
        trough_tint_rgb=(0.97, 0.99, 0.95),
    )
    normal = periodic_scharr_normal(height, strength=0.72)
    ao = compute_cavity_ao(height, blur_sigma=2.6, ao_min=0.80, strength=0.30)
    rough = np.clip(0.80 + 0.032 * silica_mid + 0.022 * silica_fine - 0.025 * field_wear, 0.74, 0.86)
    orm = pack_orm(ao, rough, 0.04)
    return MaterialOutput(albedo, normal, orm)


def synth_carc_desert(n: int, seed: int) -> MaterialOutput:
    """12. CARC Desert — Sinai coarse anti-slip mineral grit + ultra-matte finish."""
    sand_wave = periodic_fft_fbm(n, 2.5, 9.0, 1.2, seed + 111)
    anti_slip_mid = periodic_fft_fbm(n, 36.0, 112.0, 0.58, seed + 112)
    anti_slip_hi = periodic_fft_fbm(n, 105.0, 235.0, 0.46, seed + 113)
    # Chunky quartz anti-slip aggregate peaks (characteristic IDF Merkava coat)
    grit_peaks = np.clip(anti_slip_mid, -1.6, 2.2) * 0.62 + anti_slip_hi * 0.42

    height = (sand_wave * 0.36 + grit_peaks * 0.88).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.35, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    pattern = np.clip(
        0.62 + 0.16 * np.clip(grit_peaks * 0.32, -0.45, 0.45) + 0.12 * np.clip(sand_wave * 0.34, -0.45, 0.45),
        0.0,
        1.0,
    )
    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.71,
        hi=0.985,
        target_mean=0.89,
        tint_rgb=(1.02, 1.00, 0.95),
        trough_tint_rgb=(0.99, 0.96, 0.91),
    )
    normal = periodic_scharr_normal(height, strength=0.86)
    ao = compute_cavity_ao(height, blur_sigma=2.4, ao_min=0.76, strength=0.34)
    rough = np.clip(0.82 + 0.032 * anti_slip_mid + 0.024 * anti_slip_hi - 0.020 * sand_wave, 0.76, 0.88)
    orm = pack_orm(ao, rough, 0.03)
    return MaterialOutput(albedo, normal, orm)


def synth_cartridge_brass(n: int, seed: int) -> MaterialOutput:
    """13. Cartridge Brass — fine drawn brass/bronze longitudinal (+X/U) die streaks + bright metallic ORM."""
    draw_fine = periodic_fft_fbm(n, 30.0, 205.0, 0.56, seed + 121, aniso_x=7.0, aniso_y=0.55)
    draw_mid = periodic_fft_fbm(n, 10.0, 68.0, 0.78, seed + 122, aniso_x=5.0, aniso_y=0.65)
    anneal = periodic_fft_fbm(n, 2.0, 8.0, 1.25, seed + 123)

    pattern = np.clip(
        0.64 + 0.18 * np.clip(draw_fine * 0.36, -0.5, 0.5) + 0.14 * np.clip(draw_mid * 0.34, -0.5, 0.5) + 0.07 * anneal,
        0.0,
        1.0,
    )
    height = (draw_fine * 0.34 + draw_mid * 0.24).astype(np.float32)
    height = ndimage.gaussian_filter(height, sigma=0.36, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    albedo = calibrate_mult_albedo(
        pattern,
        lo=0.75,
        hi=0.995,
        target_mean=0.90,
        tint_rgb=(1.02, 1.00, 0.94),
        trough_tint_rgb=(1.00, 0.96, 0.88),
    )
    normal = periodic_scharr_normal(height, strength=0.42)
    ao = compute_cavity_ao(height, blur_sigma=2.0, ao_min=0.88, strength=0.20)
    rough = np.clip(0.25 - 0.025 * anneal - 0.018 * draw_mid + 0.014 * np.abs(draw_fine), 0.20, 0.32)
    orm = pack_orm(ao, rough, 0.98)
    return MaterialOutput(albedo, normal, orm)


CENTENNIAL_MATERIAL_SPECS: List[Tuple[str, Callable[[int, int], MaterialOutput]]] = [
    ("oiled_walnut", synth_oiled_walnut),
    ("russian_laminate", synth_russian_laminate),
    ("beech_yew", synth_beech_yew),
    ("blued_steel", synth_blued_steel),
    ("parkerized_steel", synth_parkerized_steel),
    ("anodized_alloy", synth_anodized_alloy),
    ("brushed_stainless", synth_brushed_stainless),
    ("tactical_polymer", synth_tactical_polymer),
    ("checkered_grip", synth_checkered_grip),
    ("cast_rha_armor", synth_cast_rha_armor),
    ("carc_olive", synth_carc_olive),
    ("carc_desert", synth_carc_desert),
    ("cartridge_brass", synth_cartridge_brass),
]


def edge_wrap_mae(arr: np.ndarray) -> float:
    """Mean absolute edge wrap delta (0-255 scale) across left/right and top/bottom seams."""
    f = arr.astype(np.float32)
    lr = float(np.mean(np.abs(f[:, 0] - f[:, -1])))
    tb = float(np.mean(np.abs(f[0, :] - f[-1, :])))
    return max(lr, tb)


def save_rgb_webp(arr: np.ndarray, out_path: Path, quality: int) -> int:
    img = Image.fromarray(arr, mode="RGB")
    img.save(out_path, format="WEBP", quality=quality, method=6)
    return out_path.stat().st_size


def generate_all(out_dir: Path = OUT_DIR) -> Dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    quality_presets = [
        (82, 86, 84),
        (78, 82, 80),
        (74, 78, 76),
    ]

    for q_alb, q_nrm, q_orm in quality_presets:
        total_bytes = 0
        report: List[Dict[str, object]] = []
        for idx, (name, fn) in enumerate(CENTENNIAL_MATERIAL_SPECS):
            mat = fn(SIZE, BASE_SEED + idx * 1000)

            alb_path = out_dir / f"centennial_mat_{name}_albedo.webp"
            nrm_path = out_dir / f"centennial_mat_{name}_normal.webp"
            orm_path = out_dir / f"centennial_mat_{name}_roughness.webp"

            alb_bytes = save_rgb_webp(mat.albedo_rgb, alb_path, q_alb)
            nrm_bytes = save_rgb_webp(mat.normal_rgb, nrm_path, q_nrm)
            orm_bytes = save_rgb_webp(mat.orm_rgb, orm_path, q_orm)
            mat_bytes = alb_bytes + nrm_bytes + orm_bytes
            total_bytes += mat_bytes

            alb_mean = float(np.mean(mat.albedo_rgb)) / 255.0
            rgh_min = float(np.min(mat.orm_rgb[..., 1])) / 255.0
            rgh_max = float(np.max(mat.orm_rgb[..., 1])) / 255.0
            mtl_mean = float(np.mean(mat.orm_rgb[..., 2])) / 255.0
            seam_delta = max(
                edge_wrap_mae(mat.albedo_rgb),
                edge_wrap_mae(mat.normal_rgb),
                edge_wrap_mae(mat.orm_rgb),
            )
            report.append(
                {
                    "name": name,
                    "bytes": mat_bytes,
                    "kb": round(mat_bytes / 1024.0, 1),
                    "albedoMean": round(alb_mean, 4),
                    "roughRange": [round(rgh_min, 3), round(rgh_max, 3)],
                    "metalMean": round(mtl_mean, 3),
                    "maxEdgeWrapMae": round(seam_delta, 2),
                }
            )

        if total_bytes < MAX_TOTAL_BYTES:
            return {
                "size": SIZE,
                "suiteCount": len(CENTENNIAL_MATERIAL_SPECS),
                "fileCount": len(CENTENNIAL_MATERIAL_SPECS) * 3,
                "qualities": {"albedo": q_alb, "normal": q_nrm, "orm": q_orm},
                "totalBytes": total_bytes,
                "totalMb": round(total_bytes / (1024.0 * 1024.0), 3),
                "materials": report,
            }

    raise RuntimeError(
        f"Centennial material library exceeded {MAX_TOTAL_BYTES} bytes even at lowest quality preset."
    )


def main() -> int:
    summary = generate_all(OUT_DIR)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
