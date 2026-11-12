"""
Procedural PBR synthesis and WebP/PNG encoding for Digital Armory 3D.

Material kernels return float32 heightfields or masks without modifying inputs.
Dimensions are (height, width); UV grids may be dense or broadcastable. Seeded
noise is deterministic and periodic. Height is measured in pixels by the AO
kernel, so scale it to the intended relief before computing occlusion.
"""

from __future__ import annotations

import os
from operator import index
from pathlib import Path
from typing import Iterable, Optional, Sequence, Union

import cv2
import numpy as np
from PIL import Image, ImageFont
from scipy import ndimage

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = str(PROJECT_ROOT / "public" / "textures")
os.makedirs(OUT_DIR, exist_ok=True)

DEFAULT_FONT_CANDIDATES: tuple[str, ...] = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
    "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
)

MONO_FONT_CANDIDATES: tuple[str, ...] = (
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
)


def load_font(
    first: Union[int, str, Sequence[str]],
    second: Optional[int] = None,
) -> Union[ImageFont.FreeTypeFont, ImageFont.ImageFont]:
    """
    Flexible font loader supporting:
      - load_font(size)
      - load_font(preferred_path, size)
      - load_font(candidate_list, size)
    """
    if isinstance(first, int):
        size = first
        candidates: Iterable[str] = DEFAULT_FONT_CANDIDATES
    elif isinstance(first, str):
        size = second if second is not None else 24
        candidates = [first, *DEFAULT_FONT_CANDIDATES]
    else:
        size = second if second is not None else 24
        candidates = [*first, *DEFAULT_FONT_CANDIDATES]

    for fp in candidates:
        if fp and os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def spectral_noise(
    h: int,
    w: int,
    f_low: float,
    f_high: float,
    seed: int,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
) -> np.ndarray:
    """Band-pass Gaussian spectral 2D FFT noise normalized to unit standard deviation."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h / aniso_y
    fx = np.fft.rfftfreq(w)[None, :] * w / aniso_x
    freq = np.sqrt(fx * fx + fy * fy)
    envelope = np.exp(-0.5 * ((freq - f_low) / max(1.0, (f_high - f_low))) ** 2)
    envelope[0, 0] = 0.0
    field = np.fft.irfft2(spec * envelope, s=(h, w))
    std = float(np.std(field)) + 1e-7
    return (field / std).astype(np.float32)


def seamless_band_noise(
    h: int,
    w: int,
    min_freq: float,
    max_freq: float,
    seed: int,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
) -> np.ndarray:
    """Tileable inverse-FFT 1/f^0.85 band-limited noise in [-1, 1] for seamless detail maps."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h * aniso_y
    fx = np.fft.fftfreq(w)[None, :] * w * aniso_x
    freq = np.hypot(fx, fy)
    mask = (freq >= min_freq) & (freq <= max_freq)
    amp = np.zeros((h, w), dtype=np.float32)
    amp[mask] = 1.0 / np.maximum(freq[mask], 1.0) ** 0.85
    phases = rng.uniform(0, 2 * np.pi, size=(h, w)).astype(np.float32)
    spectrum = amp * (np.cos(phases) + 1j * np.sin(phases))
    field = np.fft.ifft2(spectrum).real.astype(np.float32)
    std = float(np.std(field)) + 1e-6
    return np.clip(field / (2.6 * std), -1.0, 1.0)


def micro_grain(
    h: int,
    w: int,
    seed: int,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
    center_freq: float = 340.0,
    band_sigma: float = 110.0,
    highpass: float = 160.0,
) -> np.ndarray:
    """High-frequency micro-bead-blast / phosphate grain with zero low-frequency waviness."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h / aniso_y
    fx = np.fft.rfftfreq(w)[None, :] * w / aniso_x
    freq = np.sqrt(fx * fx + fy * fy)
    envelope = np.exp(-0.5 * ((freq - center_freq) / band_sigma) ** 2)
    if highpass > 0:
        envelope[freq < highpass] = 0.0
    envelope[0, 0] = 0.0
    field = np.fft.irfft2(spec * envelope, s=(h, w))
    std = float(np.std(field)) + 1e-7
    return (field / std).astype(np.float32)


def _texture_shape(h: int, w: int) -> tuple[int, int]:
    h, w = index(h), index(w)
    if h < 1 or w < 1:
        raise ValueError("Texture dimensions must be positive")
    return h, w


def _scalar_field(field: np.ndarray) -> np.ndarray:
    field = np.asarray(field, dtype=np.float32)
    if field.ndim != 2 or not all(field.shape):
        raise ValueError("Expected a nonempty (height, width) field")
    return field


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    """Cubic Hermite threshold, including descending and coincident edges."""
    x = np.asarray(x, dtype=np.float32)
    if edge0 == edge1:
        return np.asarray(x >= edge0, dtype=np.float32)
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return np.asarray(t * t * (3.0 - 2.0 * t), dtype=np.float32)


def fbm_noise(
    h: int,
    w: int,
    base_freq: float = 6.0,
    octaves: int = 5,
    persistence: float = 0.52,
    lacunarity: float = 2.05,
    seed: int = 1,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
) -> np.ndarray:
    """Periodic bicubic value-noise FBM, normalized to [-1, 1].

    Frequencies count lattice cells across each axis; anisotropy multiplies
    those counts. Octaves are limited to the pixel Nyquist frequency. Wrapped
    interpolation avoids FFTs and permits arbitrarily shaped texture tiles.
    """
    h, w = _texture_shape(h, w)
    octaves = index(octaves)
    if octaves < 1 or not np.isfinite(persistence) or persistence < 0:
        raise ValueError("octaves must be positive and persistence nonnegative")
    if any(not np.isfinite(v) or v <= 0 for v in (base_freq, lacunarity, aniso_x, aniso_y)):
        raise ValueError("Frequencies and anisotropy must be finite and positive")
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w), dtype=np.float32)
    map_x = np.empty_like(field)
    map_y = np.empty_like(field)
    xs = np.arange(w, dtype=np.float32)[None, :] / w
    ys = np.arange(h, dtype=np.float32)[:, None] / h
    amplitude, frequency = 1.0, base_freq
    for _ in range(octaves):
        nx = max(1, min(max(1, w // 2), int(round(frequency * aniso_x))))
        ny = max(1, min(max(1, h // 2), int(round(frequency * aniso_y))))
        lattice = rng.random((ny, nx), dtype=np.float32) * 2.0 - 1.0
        map_x[:] = xs * nx
        map_y[:] = ys * ny
        layer = cv2.remap(lattice, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
        layer *= amplitude
        field += layer
        amplitude *= persistence
        frequency *= lacunarity
        if amplitude == 0:
            break
    low, high = float(field.min()), float(field.max())
    if high - low <= 1e-7:
        field.fill(0.0)
    else:
        field -= low
        field *= 2.0 / (high - low)
        field -= 1.0
        np.clip(field, -1.0, 1.0, out=field)
    return field


def _cellular_distances(
    h: int, w: int, cells_y: int, cells_x: int, jitter: float, seed: int,
    second_nearest: bool = True,
) -> tuple[np.ndarray, Optional[np.ndarray]]:
    """Exact periodic F1/F2 in cell units, vectorized over cell-local pixels.

    With one seed confined to each cell, a 5x5 neighborhood contains both
    nearest sites. A 3x3 search can miss F2 near strongly jittered corners.
    Broadcasting separable squared distances avoids full-image seed gathers
    for every neighbor; padding supports nondivisible cell/texture sizes.
    """
    h, w = _texture_shape(h, w)
    cells_y, cells_x = index(cells_y), index(cells_x)
    if cells_y < 1 or cells_x < 1 or not np.isfinite(jitter) or not 0 <= jitter <= 1:
        raise ValueError("Cell counts must be positive and jitter must be in [0, 1]")
    sy, sx = (h + cells_y - 1) // cells_y, (w + cells_x - 1) // cells_x
    gy, gx = np.arange(cells_y), np.arange(cells_x)
    start_y = (gy * h + cells_y - 1) // cells_y
    start_x = (gx * w + cells_x - 1) // cells_x
    local_y = ((start_y[:, None] + np.arange(sy)) * (cells_y / h) - gy[:, None]).astype(np.float32)
    local_x = ((start_x[:, None] + np.arange(sx)) * (cells_x / w) - gx[:, None]).astype(np.float32)
    rng = np.random.default_rng(seed)
    sites = 0.5 + (rng.random((cells_y, cells_x, 2), dtype=np.float32) - 0.5) * jitter
    shape = (cells_y, sy, cells_x, sx)
    first = np.full(shape, np.inf, dtype=np.float32)
    second = np.full(shape, np.inf, dtype=np.float32) if second_nearest else None
    distance = np.empty(shape, dtype=np.float32)
    candidate = np.empty(shape, dtype=np.float32) if second_nearest else None
    for dy in range(-2, 3):
        rows = (gy + dy) % cells_y
        for dx in range(-2, 3):
            cols = (gx + dx) % cells_x
            neighbor = sites[rows[:, None], cols[None, :]]
            delta_y = local_y[:, :, None] - (neighbor[..., 0][:, None, :] + dy)
            delta_x = local_x[None, :, :] - (neighbor[..., 1][:, :, None] + dx)
            np.square(delta_y, out=delta_y)
            np.square(delta_x, out=delta_x)
            np.add(delta_y[..., None], delta_x[:, None, ...], out=distance)
            if second_nearest:
                np.maximum(first, distance, out=candidate)
                np.minimum(second, candidate, out=second)
            np.minimum(first, distance, out=first)

    pixel_y, pixel_x = np.arange(h), np.arange(w)
    cell_y, cell_x = pixel_y * cells_y // h, pixel_x * cells_x // w
    rows = cell_y * sy + pixel_y - start_y[cell_y]
    cols = cell_x * sx + pixel_x - start_x[cell_x]

    def unpack(values: np.ndarray) -> np.ndarray:
        values = values.reshape(cells_y * sy, cells_x * sx)
        if values.shape != (h, w):
            values = values[rows[:, None], cols[None, :]]
        np.sqrt(values, out=values)
        return values

    return unpack(first), unpack(second) if second_nearest else None


def worley_cellular(
    h: int, w: int, cells_y: int = 64, cells_x: int = 64,
    jitter: float = 0.85, seed: int = 1,
) -> tuple[np.ndarray, np.ndarray]:
    """Periodic Euclidean F1 and F2-F1, scaled by sqrt(2) into [0, 1].

    Distances use cell-space units, allowing elongated cells for leatherette,
    fiberglass and phosphate crystals. F2-F1 is zero on Voronoi boundaries.
    """
    first, second = _cellular_distances(h, w, cells_y, cells_x, jitter, seed)
    second -= first
    first *= np.float32(1.0 / np.sqrt(2.0))
    second *= np.float32(1.0 / np.sqrt(2.0))
    np.clip(first, 0.0, 1.0, out=first)
    np.clip(second, 0.0, 1.0, out=second)
    return first, second


def laser_stipple_field(
    h: int, w: int, cells_y: int = 160, cells_x: int = 160, seed: int = 1,
) -> np.ndarray:
    """Ablated concave crater bowls with narrow raised lips, in [-1, 1]."""
    distance, _ = _cellular_distances(h, w, cells_y, cells_x, 0.7, seed, second_nearest=False)
    bowl = 1.0 - smoothstep(0.0, 0.36, distance)
    rim = smoothstep(0.25, 0.335, distance) * (1.0 - smoothstep(0.335, 0.43, distance))
    grain = np.random.default_rng(seed + 1).random((h, w), dtype=np.float32) - 0.5
    return np.clip(-0.94 * bowl + 0.48 * rim + 0.045 * grain, -1.0, 1.0)


def diamond_knurl(
    u_grid: np.ndarray, v_grid: np.ndarray, freq_u: float = 180.0, freq_v: float = 48.0,
) -> np.ndarray:
    """Intersect two diagonal V cuts into sharp, planar diamond pyramids."""
    u = np.asarray(u_grid, dtype=np.float32) * freq_u
    v = np.asarray(v_grid, dtype=np.float32) * freq_v
    a = 1.0 - np.abs(2.0 * np.remainder(u + v, 1.0) - 1.0)
    b = 1.0 - np.abs(2.0 * np.remainder(u - v, 1.0) - 1.0)
    return np.asarray(2.0 * np.minimum(a, b) - 1.0, dtype=np.float32)


def chipped_edge_wear(
    edge_prox_01: np.ndarray, seed: int = 1, wear_amount: float = 0.55,
) -> tuple[np.ndarray, np.ndarray]:
    """Sharp exposed-metal islands and a thin oxide transition around chips.

    Edge proximity is 1 at exposed edges and 0 away from them. Wear amount
    lowers a shared threshold, growing chips monotonically for a fixed seed.
    FBM controls patch size and cellular fractures break up chip silhouettes.
    """
    proximity = np.clip(_scalar_field(edge_prox_01), 0.0, 1.0)
    if not np.isfinite(wear_amount):
        raise ValueError("wear_amount must be finite")
    amount = float(np.clip(wear_amount, 0.0, 1.0))
    if amount == 0:
        return np.zeros_like(proximity), np.zeros_like(proximity)
    h, w = proximity.shape
    breakup = fbm_noise(h, w, base_freq=18.0, octaves=4, seed=seed)
    cells, edges = worley_cellular(h, w, max(1, h // 18), max(1, w // 18), seed=seed + 1)
    score = proximity * (0.96 + 0.28 * breakup + 0.24 * (edges - cells))
    threshold = 1.5 - 1.2 * amount
    bare = smoothstep(threshold - 0.022, threshold + 0.022, score)
    halo = smoothstep(threshold - 0.10, threshold - 0.025, score) * (1.0 - bare)
    # No oxide or metal is deposited on zero-proximity parts of the material.
    gate = smoothstep(0.0, 0.12, proximity)
    return bare * gate, halo * gate


def scratch_field(
    h: int, w: int, count: int = 160, min_len: float = 10, max_len: float = 80,
    angle_deg: float = 0.0, angle_spread: float = 25.0, seed: int = 1,
    mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Sparse handling scratches with subpixel AA, tapered ends and varied gauge.

    Angles are in degrees from horizontal; spread is the maximum deviation.
    Drawing loops are over strokes/segments, never over texture pixels. Small
    stroke-local buffers are maximum-composited to preserve crossing marks.
    """
    h, w = _texture_shape(h, w)
    count = index(count)
    if count < 0 or not 0 < min_len <= max_len:
        raise ValueError("count must be nonnegative and lengths positive and ordered")
    if not all(np.isfinite(v) for v in (min_len, max_len, angle_deg, angle_spread)) or angle_spread < 0:
        raise ValueError("Scratch parameters must be finite and angle_spread nonnegative")
    if mask is not None:
        mask = np.clip(_scalar_field(mask), 0.0, 1.0)
        if mask.shape != (h, w):
            raise ValueError("Scratch mask must match the texture shape")
    rng = np.random.default_rng(seed)
    canvas = np.zeros((h, w), dtype=np.uint8)
    centers = rng.uniform((0.0, 0.0), (w, h), (count, 2))
    lengths = rng.uniform(min_len, max_len, count)
    angles = np.deg2rad(angle_deg + rng.uniform(-angle_spread, angle_spread, count))
    brightness = rng.uniform(0.38, 1.0, count)
    steps = np.linspace(-0.5, 0.5, 8)
    for center, length, angle, intensity in zip(centers, lengths, angles, brightness):
        direction = np.array((np.cos(angle), np.sin(angle))) * length
        points = center + steps[:, None] * direction
        x0, y0 = np.maximum(np.floor(points.min(axis=0)).astype(int) - 4, (0, 0))
        x1, y1 = np.minimum(np.ceil(points.max(axis=0)).astype(int) + 5, (w, h))
        if x1 <= x0 or y1 <= y0:
            continue
        stroke = np.zeros((y1 - y0, x1 - x0), dtype=np.uint8)
        points = np.rint((points - (x0, y0)) * 256).astype(int)
        for j in range(7):
            cv2.line(stroke, tuple(points[j]), tuple(points[j + 1]),
                     255, 1, lineType=cv2.LINE_AA, shift=8)
        # Continuous brightness along each stroke avoids visible segment bands.
        along = ((np.arange(x0, x1) - center[0])[None, :] * np.cos(angle)
                 + (np.arange(y0, y1) - center[1])[:, None] * np.sin(angle))
        envelope = np.sin(np.pi * np.clip(along / length + 0.5, 0.0, 1.0))
        stroke = np.rint(stroke * intensity * envelope ** 0.65).astype(np.uint8)
        region = canvas[y0:y1, x0:x1]
        np.maximum(region, stroke, out=region)
    result = canvas.astype(np.float32) / 255.0
    if mask is not None:
        result *= mask
    return result


def cnc_toolpath(
    h: int, w: int, pitch_px: float = 12.0, angle_deg: float = 0.0, seed: int = 1,
) -> np.ndarray:
    """Directional cutter scallops with slow feed wander and fine chatter.

    Angle describes the direction of the machining lines. Mix this normalized
    [-1, 1] relief at low amplitude for brushed steel or machined aluminum.
    """
    h, w = _texture_shape(h, w)
    if not np.isfinite(pitch_px) or pitch_px <= 0 or not np.isfinite(angle_deg):
        raise ValueError("pitch_px must be positive and the angle finite")
    theta = np.deg2rad(angle_deg)
    x = np.arange(w, dtype=np.float32)[None, :]
    y = np.arange(h, dtype=np.float32)[:, None]
    across = y * np.cos(theta) - x * np.sin(theta)
    along = x * np.cos(theta) + y * np.sin(theta)
    wander = fbm_noise(h, w, base_freq=8.0, octaves=2, seed=seed)
    offset = np.random.default_rng(seed).uniform(0.0, 2.0 * np.pi)
    phase = across * (2.0 * np.pi / pitch_px) + 0.18 * wander
    phase += 0.08 * np.sin(along * (2.0 * np.pi / (pitch_px * 16.0)) + offset)
    marks = 0.74 * np.cos(phase) + 0.18 * np.cos(2.0 * phase + 0.5) + 0.08 * wander
    return np.clip(marks, -1.0, 1.0).astype(np.float32, copy=False)


def bevel_mask(
    mask_01: np.ndarray, width_px: float = 5.0, profile: str = "trapezoid",
) -> np.ndarray:
    """EDT-based inward bevel with a flat top and preserved edge coverage.

    Profiles: trapezoid/linear (planar), round (quarter-circle), smooth (Hermite).
    The canvas exterior is empty, so shapes touching its border bevel correctly.
    Zero width returns the clipped input mask without a bevel.
    """
    mask = np.clip(_scalar_field(mask_01), 0.0, 1.0)
    if not np.isfinite(width_px) or width_px < 0:
        raise ValueError("width_px must be finite and nonnegative")
    if profile not in ("trapezoid", "linear", "round", "smooth"):
        raise ValueError("Unknown bevel profile: " + profile)
    if width_px == 0 or not np.any(mask):
        return mask
    distance = ndimage.distance_transform_edt(np.pad(mask > 0.0, 1))[1:-1, 1:-1].astype(np.float32)
    # A boundary pixel's fractional coverage adjusts its subpixel distance.
    distance -= 1.0
    distance += mask
    distance /= width_px
    np.clip(distance, 0.0, 1.0, out=distance)
    if profile == "round":
        distance = np.sqrt(np.maximum(0.0, 1.0 - (1.0 - distance) ** 2))
    elif profile == "smooth":
        distance = smoothstep(0.0, 1.0, distance)
    return np.minimum(distance, mask)


def compute_height_ao(
    height: np.ndarray, strength: float = 1.0, radii: Sequence[float] = (1.5, 4.5, 11.0),
) -> np.ndarray:
    """Multi-scale cavity plus eight-direction sampled horizon visibility.

    Sparse ring dilations collect the highest surrounding horizon at each
    radius; positive local-mean differences add crevice occlusion. Distances
    are pixels and borders reflect, avoiding artificial black texture edges.
    """
    height = _scalar_field(height)
    radii = tuple(float(r) for r in radii)
    if not np.isfinite(strength) or strength < 0 or not radii or any(not np.isfinite(r) or r <= 0 for r in radii):
        raise ValueError("strength must be nonnegative and radii finite and positive")
    occlusion = np.zeros_like(height)
    if strength == 0:
        return np.ones_like(height)
    for radius in radii:
        r = max(1, int(round(radius)))
        diagonal = max(1, int(round(r / np.sqrt(2.0))))
        ring = np.zeros((2 * r + 1, 2 * r + 1), dtype=np.uint8)
        ring[(0, r, r, 2 * r), (r, 0, 2 * r, r)] = 1
        ring[(r - diagonal, r - diagonal, r + diagonal, r + diagonal),
             (r - diagonal, r + diagonal, r - diagonal, r + diagonal)] = 1
        horizon = cv2.dilate(height, ring, borderType=cv2.BORDER_REFLECT_101)
        horizon -= height
        np.maximum(horizon, 0.0, out=horizon)
        cavity = cv2.GaussianBlur(height, (0, 0), sigmaX=radius * 0.65, borderType=cv2.BORDER_REFLECT_101)
        cavity -= height
        np.maximum(cavity, 0.0, out=cavity)
        horizon *= 0.65 / radius
        cavity *= 0.35 / radius
        occlusion += horizon
        occlusion += cavity
    occlusion *= -2.4 * strength / len(radii)
    np.exp(occlusion, out=occlusion)
    np.clip(occlusion, 0.18, 1.0, out=occlusion)
    return occlusion


def compute_convexity(height: np.ndarray, sigma: float = 1.8) -> np.ndarray:
    """Positive curvature of smoothed relief, normalized for edge burnishing.

    Valleys and flat surfaces return zero; raised shoulders and peaks return
    positive values. The mask is invariant to a constant height offset.
    """
    height = _scalar_field(height)
    if not np.isfinite(sigma) or sigma <= 0:
        raise ValueError("sigma must be finite and positive")
    blurred = cv2.GaussianBlur(height, (0, 0), sigmaX=sigma, borderType=cv2.BORDER_REFLECT_101)
    curvature = -cv2.Laplacian(blurred, cv2.CV_32F, ksize=1, borderType=cv2.BORDER_REFLECT_101)
    np.maximum(curvature, 0.0, out=curvature)
    peak = float(curvature.max())
    if peak > 1e-7:
        curvature /= peak
    else:
        curvature.fill(0.0)
    return curvature


def _resolve_target_path(out_path: str) -> tuple[str, str]:
    """Resolves output format (defaults to WebP unless PBR_OUTPUT_FORMAT=png)."""
    fmt = os.environ.get("PBR_OUTPUT_FORMAT", "webp").strip().lower()
    base, ext = os.path.splitext(out_path)
    if fmt == "png":
        return f"{base}.png", "PNG"
    if ext.lower() in (".png", ".webp"):
        return f"{base}.webp", "WEBP"
    return out_path, "WEBP"


def save_pil_channel(
    img: Image.Image,
    out_path: str,
    channel_kind: str = "albedo",
) -> str:
    """Saves a PIL image using channel-tuned WebP (or PNG) encoding settings."""
    final_path, pil_fmt = _resolve_target_path(out_path)
    if pil_fmt == "PNG":
        img.save(final_path, "PNG", optimize=True)
    else:
        quality_map = {
            "normal": 95,
            "orm": 94,
            "albedo": 92,
            "roughness": 92,
        }
        q = quality_map.get(channel_kind, 88)
        img.save(final_path, "WEBP", quality=q, method=4)
    return final_path


def height_to_normal_map(
    height: np.ndarray,
    strength: float,
    out_path: str,
    seamless: bool = False,
) -> str:
    """Converts scalar heightfield (H, W) into OpenGL (+Y up) tangent-space RGB normal map."""
    if seamless:
        dh_dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
        dh_dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
        nx = -dh_dx
        ny = dh_dy
    else:
        dh_dy, dh_dx = np.gradient(height)
        nx = -dh_dx * strength
        ny = dh_dy * strength

    nz = np.ones_like(height, dtype=np.float32)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    rgb = np.empty((height.shape[0], height.shape[1], 3), dtype=np.uint8)
    rgb[..., 0] = np.clip((nx * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 1] = np.clip((ny * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 2] = np.clip((nz * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return save_pil_channel(Image.fromarray(rgb, mode="RGB"), out_path, channel_kind="normal")


def save_rgb_map(arr01: np.ndarray, out_path: str) -> str:
    rgb = np.clip(arr01 * 255.0, 0, 255).astype(np.uint8)
    return save_pil_channel(Image.fromarray(rgb, mode="RGB"), out_path, channel_kind="albedo")


def save_gray_map(arr01: np.ndarray, out_path: str) -> str:
    g = np.clip(arr01 * 255.0, 0, 255).astype(np.uint8)
    return save_pil_channel(Image.fromarray(g, mode="L"), out_path, channel_kind="roughness")


def save_orm_map(
    ao: np.ndarray, roughness: np.ndarray, metalness: np.ndarray, out_path: str,
) -> str:
    """Pack linear AO/roughness/metalness into RGB, using the ORM encoder."""
    channels = [_scalar_field(channel) for channel in (ao, roughness, metalness)]
    if any(channel.shape != channels[0].shape for channel in channels[1:]):
        raise ValueError("ORM channels must have matching (height, width) shapes")
    rgb = (np.clip(np.stack(channels, axis=-1), 0.0, 1.0) * 255.0).astype(np.uint8)
    return save_pil_channel(Image.fromarray(rgb, mode="RGB"), out_path, channel_kind="orm")


# Backward-compatible aliases used by weapon PBR generator modules
height_to_normal_png = height_to_normal_map
save_rgb_png = save_rgb_map
save_gray_png = save_gray_map
save_orm_png = save_orm_map
