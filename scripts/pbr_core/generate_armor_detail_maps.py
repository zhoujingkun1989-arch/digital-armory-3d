#!/usr/bin/env python3
"""
Deterministic 512x512 Seamless Rolled Homogeneous Armor (RHA) + CARC Silica Detail Maps
---------------------------------------------------------------------------------------
Synthesizes tileable world/object-space triplanar micro-surface detail maps for Digital Armory 3D:
  - public/textures/armor_detail_normal.webp    (512x512 RGB OpenGL tangent-space normal, neutral ~128,128,255)
  - public/textures/armor_detail_roughness.webp (512x512 L greyscale micro-roughness centered at 0.5 / 128)

All noise octaves, domain warps, Voronoi forging/mill-scale pits, Gaussian filters, and Scharr
normal derivatives operate on a strictly periodic 2D torus [0, 512) x [0, 512) so tiling across
10-meter Main Battle Tank hulls and turrets exhibits zero visible seam discontinuity.

Combined output size budget: strictly <= 120 KB (122,880 bytes), zero PNGs.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image
from scipy import ndimage

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = PROJECT_ROOT / "public" / "textures"
NORMAL_OUT = OUT_DIR / "armor_detail_normal.webp"
ROUGHNESS_OUT = OUT_DIR / "armor_detail_roughness.webp"

SIZE = 512
SEED = 20261121
MAX_COMBINED_BYTES = 120 * 1024  # 122,880 bytes hard cap
TARGET_COMBINED_BYTES = 112 * 1024  # leave generous headroom below 120 KB


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

    # Smooth cosine roll-in / roll-out band envelope prevents spectral ringing
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
    """Bilinearly resamples `field` on a periodic torus with displacement in pixels."""
    n = field.shape[0]
    yy, xx = np.meshgrid(
        np.arange(n, dtype=np.float32),
        np.arange(n, dtype=np.float32),
        indexing="ij",
    )
    coords = np.array([(yy + disp_y) % n, (xx + disp_x) % n], dtype=np.float32)
    return ndimage.map_coordinates(field, coords, order=1, mode="grid-wrap").astype(np.float32)


def periodic_rha_pits(n: int, seed: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generates seamless periodic rolled-steel mill-scale pitting & forging indentations
    using toroidal wrapped Voronoi-like micro-craters at two physical scales.

    Returns (pit_height, pit_mask) where pit_height is negative inside pits and
    pit_mask in [0, 1] indicates depressed pit interiors for roughness darkening/matting.
    """
    rng = np.random.default_rng(seed)
    yy, xx = np.meshgrid(
        np.arange(n, dtype=np.float32),
        np.arange(n, dtype=np.float32),
        indexing="ij",
    )
    pit_height = np.zeros((n, n), dtype=np.float32)
    pit_mask = np.zeros((n, n), dtype=np.float32)

    # Layer 1: broader shallow mill-scale depressions (4-9 px radius -> ~2-5 mm at 28 cm tile)
    # Layer 2: sharp tiny RHA pin-pits (1.6-3.4 px radius -> ~0.9-1.9 mm at 28 cm tile)
    layers = [
        (115, 4.2, 8.8, 0.75, 1.35),
        (290, 1.6, 3.6, 0.55, 1.00),
    ]

    for count, r_min, r_max, d_min, d_max in layers:
        cy = rng.uniform(0.0, n, size=count)
        cx = rng.uniform(0.0, n, size=count)
        rad = rng.uniform(r_min, r_max, size=count)
        depth = rng.uniform(d_min, d_max, size=count)
        aspect = rng.uniform(0.68, 1.48, size=count)
        angle = rng.uniform(0.0, np.pi, size=count)

        for i in range(count):
            r = float(rad[i])
            win = int(np.ceil(r * 1.9)) + 2
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

            # Smooth concave pit bowl with subtle rolled lip around d in [0.95, 1.35]
            inside = np.clip(1.0 - d * d, 0.0, 1.0)
            bowl = inside * inside * (3.0 - 2.0 * inside)
            lip = np.exp(-((d - 1.12) / 0.24) ** 2) * 0.14

            sub_h = (-bowl + lip) * float(depth[i])
            sub_m = bowl * float(depth[i])

            idx = np.ix_(gy, gx)
            pit_height[idx] = np.minimum(pit_height[idx], sub_h)
            pit_mask[idx] = np.maximum(pit_mask[idx], sub_m)

    # Gently warp pit silhouettes with periodic noise so craters look forged, never circular
    wx = periodic_fft_fbm(n, 8.0, 26.0, 0.9, seed + 101) * 1.65
    wy = periodic_fft_fbm(n, 8.0, 26.0, 0.9, seed + 102) * 1.65
    pit_height = periodic_domain_warp(pit_height, wx, wy)
    pit_mask = np.clip(periodic_domain_warp(pit_mask, wx, wy), 0.0, 1.0)

    # Zero-mean the height contribution so average surface normal stays exact (0, 0, +1)
    pit_height -= float(np.mean(pit_height))
    return pit_height, pit_mask


def periodic_scharr_normal(height: np.ndarray, strength: float) -> np.ndarray:
    """
    Computes strictly periodic OpenGL (+Y up) tangent-space normal map from `height`
    using a 3x3 periodic Scharr gradient operator (zero edge seams, superior isotropy).
    """
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

    # OpenGL tangent space: +X right, +Y up (image row index increases downward -> +dh_dy)
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


def synthesize_armor_detail_maps(
    n: int = SIZE,
    seed: int = SEED,
) -> Tuple[np.ndarray, np.ndarray]:
    """Synthesizes (normal_rgb_u8, roughness_gray_u8) 512x512 seamless RHA + CARC detail maps."""
    # 1. Rolled-steel hot-mill broad waviness (slightly elongated along rolling axis X)
    mill_wave = periodic_fft_fbm(n, 3.0, 9.0, 1.15, seed + 1, aniso_x=0.78, aniso_y=1.22)

    # 2. Mid-frequency RHA mill-scale orange peel (domain-warped for natural metal flow)
    warp_x = periodic_fft_fbm(n, 4.0, 11.0, 1.0, seed + 2) * 3.8
    warp_y = periodic_fft_fbm(n, 4.0, 11.0, 1.0, seed + 3) * 3.8
    mill_scale = periodic_domain_warp(
        periodic_fft_fbm(n, 10.0, 30.0, 0.95, seed + 4),
        warp_x,
        warp_y,
    )

    # 3. Seamless rolled-steel pitting & forging micro-craters
    pits_h, pits_mask = periodic_rha_pits(n, seed + 5)

    # 4. Crisp matte CARC silica / mineral grit (high-frequency tactile sparkle breakup)
    mineral_grit_mid = periodic_fft_fbm(n, 28.0, 68.0, 0.72, seed + 6)
    mineral_grit_fine = periodic_fft_fbm(n, 64.0, 138.0, 0.55, seed + 7)

    # Combine heightfield (in virtual pixel relief units)
    height = (
        mill_wave * 0.95
        + mill_scale * 0.62
        + pits_h * 1.45
        + mineral_grit_mid * 0.34
        + mineral_grit_fine * 0.16
    ).astype(np.float32)

    # Mild periodic low-pass polish to avoid single-pixel Nyquist noise while preserving crisp grit
    height = ndimage.gaussian_filter(height, sigma=0.42, mode="wrap").astype(np.float32)
    height -= float(np.mean(height))

    normal_rgb = periodic_scharr_normal(height, strength=0.68)

    # Micro-roughness variation centered strictly at 0.5:
    # - Pit interiors & grit valleys read slightly rougher (> 0.5: trapped mineral dust / matte CARC)
    # - Raised mill-scale crests & burnished ridges read slightly smoother (< 0.5)
    rgh_dev = (
        (pits_mask - float(np.mean(pits_mask))) * 0.22
        - mill_wave * 0.068
        - mill_scale * 0.062
        + mineral_grit_mid * 0.072
        + mineral_grit_fine * 0.044
    ).astype(np.float32)
    rgh_dev = ndimage.gaussian_filter(rgh_dev, sigma=0.62, mode="wrap").astype(np.float32)
    rgh_dev -= float(np.mean(rgh_dev))
    # Target crisp organic standard deviation ~0.105 around 0.500 without bright speckling
    rgh_std = float(np.std(rgh_dev)) + 1e-6
    rgh_01 = np.clip(0.5 + (rgh_dev / rgh_std) * 0.105, 0.22, 0.78)
    # Re-center mean cleanly to 0.500 after clipping
    rgh_01 = np.clip(rgh_01 - (float(np.mean(rgh_01)) - 0.5), 0.20, 0.80)
    roughness_u8 = np.clip(np.rint(rgh_01 * 255.0), 0, 255).astype(np.uint8)

    return normal_rgb, roughness_u8


def save_within_budget(
    normal_rgb: np.ndarray,
    roughness_u8: np.ndarray,
    normal_path: Path = NORMAL_OUT,
    roughness_path: Path = ROUGHNESS_OUT,
) -> Tuple[int, int, int, int]:
    """Encodes both WebP textures cleanly with adaptive quality tuning under 120 KB total."""
    normal_path.parent.mkdir(parents=True, exist_ok=True)
    n_img = Image.fromarray(normal_rgb, mode="RGB")
    r_img = Image.fromarray(roughness_u8, mode="L")

    # Prefer highest quality that fits comfortably within TARGET_COMBINED_BYTES (<= 112 KB < 120 KB)
    quality_schedule = [
        (88, 82),
        (86, 80),
        (82, 78),
        (78, 74),
        (74, 70),
        (70, 66),
        (64, 62),
        (58, 56),
        (52, 50),
    ]

    chosen_q = quality_schedule[-1]
    n_bytes = 0
    r_bytes = 0
    for q_n, q_r in quality_schedule:
        n_img.save(normal_path, "WEBP", quality=q_n, method=6)
        r_img.save(roughness_path, "WEBP", quality=q_r, method=6)
        n_bytes = normal_path.stat().st_size
        r_bytes = roughness_path.stat().st_size
        chosen_q = (q_n, q_r)
        if n_bytes + r_bytes <= TARGET_COMBINED_BYTES:
            break

    if n_bytes + r_bytes > MAX_COMBINED_BYTES:
        raise RuntimeError(
            f"Combined armor detail maps ({n_bytes + r_bytes} bytes) exceed "
            f"{MAX_COMBINED_BYTES} byte budget!"
        )
    return n_bytes, r_bytes, chosen_q[0], chosen_q[1]


def verify_outputs(normal_path: Path, roughness_path: Path) -> None:
    """Prints deterministic verification metrics for CI & manual inspection."""
    n_arr = np.asarray(Image.open(normal_path).convert("RGB"), dtype=np.float32)
    r_arr = np.asarray(Image.open(roughness_path).convert("L"), dtype=np.float32)

    assert n_arr.shape == (SIZE, SIZE, 3), f"Expected 512x512 RGB, got {n_arr.shape}"
    assert r_arr.shape == (SIZE, SIZE), f"Expected 512x512 L, got {r_arr.shape}"

    # Verify periodic wrap continuity (opposite borders vs mean interior adjacent pixel delta)
    n_wrap_x = float(np.sqrt(np.mean((n_arr[:, 0, :] - n_arr[:, -1, :]) ** 2)))
    n_int_x = float(np.sqrt(np.mean((n_arr[:, 1:, :] - n_arr[:, :-1, :]) ** 2)))
    n_wrap_y = float(np.sqrt(np.mean((n_arr[0, :, :] - n_arr[-1, :, :]) ** 2)))
    n_int_y = float(np.sqrt(np.mean((n_arr[1:, :, :] - n_arr[:-1, :, :]) ** 2)))

    n_mean = n_arr.mean(axis=(0, 1))
    r_mean = float(r_arr.mean() / 255.0)
    r_std = float(r_arr.std() / 255.0)

    n_kb = normal_path.stat().st_size / 1024.0
    r_kb = roughness_path.stat().st_size / 1024.0

    print(
        f"[OK] {normal_path.name}: {n_kb:.2f} KB | mean RGB=({n_mean[0]:.1f}, {n_mean[1]:.1f}, {n_mean[2]:.1f}) "
        f"| wrapRMS(x={n_wrap_x:.2f} vs int={n_int_x:.2f}, y={n_wrap_y:.2f} vs int={n_int_y:.2f})"
    )
    print(
        f"[OK] {roughness_path.name}: {r_kb:.2f} KB | mean={r_mean:.3f} std={r_std:.3f}"
    )
    print(f"[OK] Combined size: {n_kb + r_kb:.2f} KB (budget <= {MAX_COMBINED_BYTES / 1024.0:.0f} KB)")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    normal_rgb, roughness_u8 = synthesize_armor_detail_maps(SIZE, SEED)
    n_bytes, r_bytes, q_n, q_r = save_within_budget(normal_rgb, roughness_u8)
    print(
        f"[INFO] Encoded WebP q=(normal:{q_n}, roughness:{q_r}) -> "
        f"{(n_bytes + r_bytes) / 1024.0:.2f} KB combined"
    )
    verify_outputs(NORMAL_OUT, ROUGHNESS_OUT)


if __name__ == "__main__":
    main()
