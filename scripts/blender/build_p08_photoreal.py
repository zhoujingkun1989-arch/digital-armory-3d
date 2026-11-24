#!/usr/bin/env python3
"""
Digital Armory 3D — Photo-Grade Hard-Surface Blender 5.2 Sculptor & Cycles GPU Baker
Exhibit #1 (PR-04 Track 1): 1917 DWM Parabellum-Pistole 1908 (Luger P08, 9x19mm)
====================================================================================
MIT License — 100% deterministic, headless, reproducible Blender 5.2 Python pipeline.

Outputs (zero registry changes — strict 6-WebP + 1-GLB contract, <= 10 MB total):
  - public/models/p08.glb                              (Draco glTF 2.0, 22 solid parts, Option A)
  - public/textures/p08_v3_metal_{albedo,normal,roughness}.webp   (2048x2048 5-Ch Packed ORM)
  - public/textures/p08_v3_walnut_{albedo,normal,roughness}.webp  (2048x2048 5-Ch Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `src/weapons/p08/plugin.ts`):
  - Three.js metric scale: 1 world unit = 1 cm = 10 mm (+X muzzle, +Y up, +Z right flank).
  - Blender glTF export_yup=True maps Blender (bx, by, bz) -> glTF (bx, bz, -by).
  - Every Three.js coordinate (tx, ty, tz) is built in Blender at (tx, -tz, ty), det = +1.
  - Option A: Self-AO is baked in 60cm isolated grid; Exterior Contact-AO is baked at exact
    assembledPos/assembledRot; all 22 objects reset to identity transform (0,0,0) before export.
  - Skips ONLY the 3 dynamic helical springs (`p08_recoil_spring`, `p08_striker_spring`,
    `p08_mag_spring`) which come from CSG Worker with GPU `aSpringParam` compression.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_p08_photoreal.py
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable, Sequence

# =============================================================================
# SHARED ANALYTICAL LUGER P08 CURVED-GRIP & HERO-UV METRIC CONSTANTS
# (Used identically in both Mode 1 Blender Sculptor and Mode 2 Post-Processor!)
# =============================================================================

P08_BORE_Y = 2.15
P08_GRIP_ANGLE_RAD = math.radians(-35.0)
P08_COS35 = math.cos(math.radians(35.0))
P08_SIN35 = math.sin(math.radians(35.0))
P08_GRIP_ORIGIN = (-5.65, -4.45)

P08_TOGGLE_LINK_LEN = 4.62
P08_TOGGLE_OVERCENTER_RAD = math.radians(1.5)
P08_FRONT_PIN_X0 = -0.18
P08_TOGGLE_SPAN_D0 = 2.0 * P08_TOGGLE_LINK_LEN * math.cos(P08_TOGGLE_OVERCENTER_RAD)
P08_REAR_AXLE_X0 = P08_FRONT_PIN_X0 - P08_TOGGLE_SPAN_D0  # -9.41683354
P08_KNEE_LOCAL_DX = P08_TOGGLE_LINK_LEN * math.cos(P08_TOGGLE_OVERCENTER_RAD)
P08_KNEE_LOCAL_DY = -P08_TOGGLE_LINK_LEN * math.sin(P08_TOGGLE_OVERCENTER_RAD)


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def _smoothstep_scalar(e0: float, e1: float, x: float) -> float:
    t = _clamp((x - e0) / max(e1 - e0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _pchip_slopes(xs: Sequence[float], ys: Sequence[float]) -> list[float]:
    """Fritsch-Carlson monotone cubic Hermite (PCHIP) tangents — C1 smooth, zero overshoot!"""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / max(h[i], 1e-8) for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0.0:
            w1 = 2.0 * h[i] + h[i - 1]
            w2 = h[i] + 2.0 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m0 = ((2.0 * h[0] + h[1]) * d[0] - h[0] * d[1]) / max(h[0] + h[1], 1e-8)
    if m0 * d[0] <= 0.0:
        m0 = 0.0
    elif abs(m0) > 3.0 * abs(d[0]):
        m0 = 3.0 * d[0]
    m[0] = m0
    mn = ((2.0 * h[-1] + h[-2]) * d[-1] - h[-1] * d[-2]) / max(h[-1] + h[-2], 1e-8)
    if mn * d[-1] <= 0.0:
        mn = 0.0
    elif abs(mn) > 3.0 * abs(d[-1]):
        mn = 3.0 * d[-1]
    m[-1] = mn
    return m


P08_BS_SU = (-4.70, -3.50, -1.80, -0.20, 1.30, 2.40, 3.30)
P08_BS_SF = (-2.08, -2.18, -2.22, -2.12, -1.96, -1.86, -1.80)
P08_BS_M = _pchip_slopes(P08_BS_SU, P08_BS_SF)

P08_FS_SU = (-4.70, -3.00, -1.20, 0.70, 2.20, 3.30, 4.30)
P08_FS_SF = (1.93, 2.02, 2.08, 2.04, 1.94, 1.97, 2.05)
P08_FS_M = _pchip_slopes(P08_FS_SU, P08_FS_SF)


def _eval_pchip_scalar(xs: Sequence[float], ys: Sequence[float], ms: Sequence[float], x: float) -> float:
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(len(xs) - 1):
        if x <= xs[i + 1]:
            h = xs[i + 1] - xs[i]
            t = (x - xs[i]) / h
            t2 = t * t
            t3 = t2 * t
            return (
                (2.0 * t3 - 3.0 * t2 + 1.0) * ys[i]
                + (t3 - 2.0 * t2 + t) * h * ms[i]
                + (-2.0 * t3 + 3.0 * t2) * ys[i + 1]
                + (t3 - t2) * h * ms[i + 1]
            )
    return ys[-1]


def eval_backstrap_sf(su: float) -> float:
    """
    Continuous C1 PCHIP curved ergonomic Luger P08 steel backstrap offset `s_fwd(s_up)` in cm:
      - Strictly clears recoil spring tunnel (`sf <= -1.62` -> min solid steel wall >= 1.8 mm)
      - Organic lower palm swell (`-2.22`), smooth mid spine, slender concave thumb-web waist (`-1.80`).
    """
    return _eval_pchip_scalar(P08_BS_SU, P08_BS_SF, P08_BS_M, su)


def eval_frontstrap_sf(su: float) -> float:
    """
    Continuous C1 PCHIP tapered ergonomic Luger P08 steel frontstrap offset `s_fwd(s_up)` in cm:
      - Strictly clears 55-deg magazine well (`sf >= +1.66` -> min solid steel wall >= 2.7 mm)
      - Sleek tapered butt heel (`+1.93`), anatomical mid-finger belly (`+2.08`),
        concave upper-finger waist (`+1.94`), and smooth sweep into trigger guard knuckle (`+2.05`).
    """
    return _eval_pchip_scalar(P08_FS_SU, P08_FS_SF, P08_FS_M, su)


def eval_grip_su_bot(u: float) -> float:
    """Curved lower walnut panel heel contour in grip-spine `s_up` cm (`u in [-1, 1]` rear->front)."""
    return -4.46 - 0.16 * u + 0.08 * (1.0 - u * u)


def eval_grip_su_top(u: float) -> float:
    """
    Iconic Luger P08 sculpted top grip arch in grip-spine `s_up` cm (`u in [-1, 1]` rear->front):
      - Rear (`u = -1`): sweeps down neatly under concave thumb web (`+3.28`)
      - Center-front (`u = +0.42`): arches gracefully UP to `+4.48` cradling mag-release button!
      - Front edge (`u = +1`): curves cleanly down (`+4.04`) into rounded frame knuckle!
    """
    arch = 3.28 + 0.76 * (0.5 * (u + 1.0)) + 0.64 * math.sin(math.pi * _clamp((u + 0.88) / 1.88, 0.0, 1.0))
    front_drop = -0.34 * _smoothstep_scalar(0.45, 1.0, u)
    return arch + front_drop


def eval_grip_panel_sf_su(u: float, v: float) -> tuple[float, float]:
    """
    Exact curved walnut grip panel point in `(s_fwd, s_up)` metric cm (`u, v in [-1, 1]`).
    Hugs the curved steel frontstrap & backstrap with a sleek ~2.8 mm rounded steel reveal!
    """
    # Organic smooth corner rounding at all 4 panel corners
    rc = max(0.0, abs(u) - 0.78) / 0.22
    vc = max(0.0, abs(v) - 0.84) / 0.16
    shrink = 0.065 * (rc * rc) * (vc * vc)
    ue = u * (1.0 - shrink)
    ve = v * (1.0 - shrink)

    su_b = eval_grip_su_bot(ue)
    su_t = eval_grip_su_top(ue)
    su = su_b + 0.5 * (ve + 1.0) * (su_t - su_b)

    sf_lo = eval_backstrap_sf(su) + 0.28
    sf_hi = eval_frontstrap_sf(su) - 0.28
    sf = sf_lo + 0.5 * (ue + 1.0) * (sf_hi - sf_lo)
    return sf, su


def grip_local_to_xy(sf: float, su: float) -> tuple[float, float]:
    """Converts grip-aligned `(sf, su)` relative to `P08_GRIP_ORIGIN` into local `(tx, ty)`."""
    return (sf * P08_COS35 + su * P08_SIN35, -sf * P08_SIN35 + su * P08_COS35)


def grip_world_xy(sf: float, su: float) -> tuple[float, float]:
    lx, ly = grip_local_to_xy(sf, su)
    return (P08_GRIP_ORIGIN[0] + lx, P08_GRIP_ORIGIN[1] + ly)


def xy_local_to_sf_su(lx: float, ly: float) -> tuple[float, float]:
    return (lx * P08_COS35 - ly * P08_SIN35, lx * P08_SIN35 + ly * P08_COS35)


# Lower grip retention screw location in metric grip-aligned `(sf, su)`
GRIP_SCREW_SF = -0.04
GRIP_SCREW_SU = -3.48
GRIP_SCREW_LX, GRIP_SCREW_LY = grip_local_to_xy(GRIP_SCREW_SF, GRIP_SCREW_SU)

# Magazine release button in grip-left local `(lx, ly)` & `(sf, su)`
MAG_BTN_WORLD = (-2.05, -0.82)
MAG_BTN_LOCAL_X = MAG_BTN_WORLD[0] - P08_GRIP_ORIGIN[0]  # +3.60
MAG_BTN_LOCAL_Y = MAG_BTN_WORLD[1] - P08_GRIP_ORIGIN[1]  # +3.63
MAG_BTN_SF, MAG_BTN_SU = xy_local_to_sf_su(MAG_BTN_LOCAL_X, MAG_BTN_LOCAL_Y)  # (+0.867, +5.039)

# Shared isotropic metric UV boxes for the 2 giant hero walnut outer faces in 2048x2048 `p08_v3_walnut`
# Scale K = 0.0890 UV/cm => 182.3 pixels/cm = 18.2 px/mm, 100% isotropic (dx == dy)!
WALNUT_UV_K = 0.0890
WALNUT_LEFT_CENTER_UV = (0.192, 0.500)   # u in [~0.015, ~0.365], v in [~0.055, ~0.945]
WALNUT_RIGHT_CENTER_UV = (0.556, 0.500)  # u in [~0.379, ~0.729], v in [~0.055, ~0.945]
WALNUT_SF_MID = -0.05
WALNUT_SU_MID = 0.00

# Dedicated axis-aligned Hero Engraving UV Rects in 2048x2048 `p08_v3_metal`
# (u0, u1, v0, v1) in standard Blender UV space (v=0 bottom, v=1 top)
HERO_METAL_UVS = {
    # Zone A (Imperial Rust-Blued top hero strip: u in [0.008, 0.726], v in [0.816, 0.992])
    "ext_1917":       (0.012, 0.142, 0.822, 0.986),  # p08_barrel_extension top chamber crest ("1917")
    "ext_proofs":     (0.152, 0.352, 0.822, 0.986),  # p08_barrel_extension right flank (Crown B/R/S + Eagle)
    "ftog_dwm":       (0.362, 0.498, 0.822, 0.986),  # p08_front_toggle top deck ("DWM" cursive scroll)
    "frame_gesichert":(0.508, 0.628, 0.910, 0.986),  # p08_frame left curved safety pocket ("GESICHERT")
    "ext_geladen":    (0.508, 0.628, 0.822, 0.898),  # p08_extractor left raised step ("GELADEN")
    "sideplate_21":   (0.638, 0.724, 0.906, 0.986),  # p08_sideplate outer left face ("21")
    "frame_serial":   (0.638, 0.724, 0.822, 0.896),  # p08_frame front dust-cover nose ("4821 a")
    # Zone B (Brushed Nickel / Alloy sub-patches inside u in [0.742, 0.992], v in [0.855, 0.992])
    "mag_p08":        (0.746, 0.862, 0.860, 0.988),  # p08_mag_body lower left flank ("P.08 / 9 m/m")
    "mag_base_serial":(0.872, 0.988, 0.860, 0.988),  # p08_mag_base underside ("4821 a")
    # Zone C (240°C Straw-Gold sub-patch inside u in [0.742, 0.992], v in [0.228, 0.304])
    "td_lever_21":    (0.746, 0.832, 0.230, 0.302),  # p08_takedown_lever pivot hub ("21")
}


# =============================================================================
# MODE 2: System Python Post-Process (PIL 1917 DWM Engravings, 20-LPI Checkering
#         & Hand-Worn Walnut Patina, RNM Normals, Sanitized 5-Ch ORM WebPs)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    from scipy import ndimage

    FONT_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_ITALIC = "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"
    FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_SERIF, FONT_SANS, *FONT_FALLBACKS):
            if os.path.exists(cand):
                try:
                    return ImageFont.truetype(cand, size=max(8, int(size)))
                except Exception:
                    continue
        return ImageFont.load_default()

    def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
        t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0.0, 1.0)
        return (t * t * (3.0 - 2.0 * t)).astype(np.float32)

    def _read_f32_rgb(path: Path) -> np.ndarray:
        arr = np.load(path).astype(np.float32)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, axis=-1)
        return arr[..., :3].copy()

    def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
        x = np.clip(x, 0.0, 1.0)
        return np.where(
            x <= 0.0031308, x * 12.92, 1.055 * np.power(np.maximum(x, 0.0031308), 1.0 / 2.4) - 0.055
        ).astype(np.float32)

    def _rnm_blend(base_n_01: np.ndarray, detail_n_01: np.ndarray) -> np.ndarray:
        """Reoriented Normal Mapping (RNM) blending two OpenGL (+X,+Y,+Z) tangent normals in [0,1]."""
        t = base_n_01 * 2.0 - 1.0
        t[..., 2] += 1.0
        u = detail_n_01 * 2.0 - 1.0
        u[..., 0] = -u[..., 0]
        u[..., 1] = -u[..., 1]
        dot_tu = np.sum(t * u, axis=-1, keepdims=True)
        tz = np.maximum(t[..., 2:3], 1e-4)
        r = t * (dot_tu / tz) - u
        r_len = np.sqrt(np.sum(r * r, axis=-1, keepdims=True) + 1e-8)
        r /= r_len
        return np.clip(r * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _height_to_normal_01(height: np.ndarray, strength: float) -> np.ndarray:
        dy, dx = np.gradient(height.astype(np.float32))
        nx = -dx * strength
        ny = dy * strength  # image row increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 2.0) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.30)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.04)

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, uv_rect: tuple[float, float, float, float]):
        u0, u1, v0, v1 = uv_rect
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        resized = pil_l.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _sanitize_normals(nrm: np.ndarray, tag: str) -> np.ndarray:
        """Strictly guarantees ZERO inverted or degenerate normal texels (`nz > 0.25`)."""
        n_vec = nrm * 2.0 - 1.0
        n_len = np.linalg.norm(n_vec, axis=-1, keepdims=True)
        bad = (n_len[..., 0] < 0.25) | (n_vec[..., 2] < 0.25)
        n_bad = int(np.sum(bad))
        n_vec = np.where(
            n_len > 1e-5,
            n_vec / np.maximum(n_len, 1e-5),
            np.array([0.0, 0.0, 1.0], dtype=np.float32),
        )
        if n_bad > 0:
            n_vec[bad] = np.array([0.0, 0.0, 1.0], dtype=np.float32)
        min_nz = float(np.min(n_vec[..., 2]))
        print(f"  [NORM-AUDIT] {tag}: sanitized={n_bad} px ({100.0 * n_bad / bad.size:.3f}%), min_nz={min_nz:.3f}")
        assert min_nz >= 0.25, f"{tag} still has inverted normal texels! min_nz={min_nz}"
        return np.clip(n_vec * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _sample_bezier_px(pts, steps=48):
        out = []
        n = len(pts) - 1
        for i in range(steps + 1):
            t = i / steps
            mt = 1.0 - t
            if n == 2:
                x = mt * mt * pts[0][0] + 2 * mt * t * pts[1][0] + t * t * pts[2][0]
                y = mt * mt * pts[0][1] + 2 * mt * t * pts[1][1] + t * t * pts[2][1]
            else:
                x = mt**3 * pts[0][0] + 3 * mt**2 * t * pts[1][0] + 3 * mt * t**2 * pts[2][0] + t**3 * pts[3][0]
                y = mt**3 * pts[0][1] + 3 * mt**2 * t * pts[1][1] + 3 * mt * t**2 * pts[2][1] + t**3 * pts[3][1]
            out.append((x, y))
        return out

    def _draw_thick_curve(draw: ImageDraw.ImageDraw, pts, w_start: float, w_mid: float, w_end: float, fill: int = 255):
        """Draws a tapered calligraphic stroke along polyline points."""
        m = len(pts)
        for i in range(m - 1):
            t = i / max(1, m - 2)
            # Smooth calligraphic swell
            if t < 0.5:
                r = w_start + (w_mid - w_start) * (2.0 * t)
            else:
                r = w_mid + (w_end - w_mid) * (2.0 * (t - 0.5))
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            draw.line([(x0, y0), (x1, y1)], fill=fill, width=max(2, int(round(r * 2.0))))
            ir = max(1, int(round(r)))
            draw.ellipse((x0 - ir, y0 - ir, x0 + ir, y0 + ir), fill=fill)

    def _make_dwm_monogram_image() -> Image.Image:
        """
        Authentic Berlin DWM (Deutsche Waffen- und Munitionsfabriken) intertwined calligraphic
        cursive scroll monogram! Rendered at 4x supersampling for razor-sharp museum curves.
        """
        W, H = 1200, 1400
        img = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(img)
        cx, cy = W * 0.50, H * 0.50
        sx, sy = 440.0, 290.0

        def P(u: float, v: float):
            return (cx + u * sx, cy + v * sy)

        # 1) Flowing calligraphic 'D' loop (sweeping tall bow + curled top & bottom serifs)
        d_stem = _sample_bezier_px([P(-0.32, -0.78), P(-0.26, -0.25), P(-0.34, 0.30), P(-0.42, 0.78)], 52)
        _draw_thick_curve(d, d_stem, 7, 17, 9)
        d_bow = _sample_bezier_px([P(-0.48, -0.72), P(0.45, -0.92), P(0.62, 0.78), P(-0.46, 0.76)], 72)
        _draw_thick_curve(d, d_bow, 8, 19, 8)
        # Calligraphic serif curls on 'D'
        d_curl_t = _sample_bezier_px([P(-0.48, -0.72), P(-0.74, -0.66), P(-0.62, -0.34), P(-0.38, -0.46)], 32)
        _draw_thick_curve(d, d_curl_t, 5, 9, 5)
        d_curl_b = _sample_bezier_px([P(-0.46, 0.76), P(-0.76, 0.74), P(-0.66, 0.40), P(-0.42, 0.50)], 32)
        _draw_thick_curve(d, d_curl_b, 5, 9, 5)

        # 2) Sweeping intertwined 'W' (two deep graceful bowls across the center)
        w1 = _sample_bezier_px([P(-0.82, -0.46), P(-0.56, -0.52), P(-0.42, 0.62), P(-0.22, 0.62)], 48)
        w2 = _sample_bezier_px([P(-0.22, 0.62), P(-0.08, 0.58), P(-0.02, -0.28), P(0.02, -0.28)], 40)
        w3 = _sample_bezier_px([P(0.02, -0.28), P(0.08, -0.28), P(0.14, 0.62), P(0.32, 0.62)], 44)
        w4 = _sample_bezier_px([P(0.32, 0.62), P(0.54, 0.60), P(0.66, -0.46), P(0.84, -0.42)], 48)
        for seg, ws in ((w1, (6, 16, 11)), (w2, (9, 10, 7)), (w3, (7, 16, 11)), (w4, (10, 12, 6))):
            _draw_thick_curve(d, seg, *ws)
        # Flanking outward scroll tips on 'W'
        w_tip_l = _sample_bezier_px([P(-0.82, -0.46), P(-0.96, -0.36), P(-0.92, -0.10), P(-0.76, -0.18)], 24)
        w_tip_r = _sample_bezier_px([P(0.84, -0.42), P(0.98, -0.32), P(0.94, -0.06), P(0.78, -0.14)], 24)
        _draw_thick_curve(d, w_tip_l, 5, 8, 4)
        _draw_thick_curve(d, w_tip_r, 5, 8, 4)

        # 3) Interlaced crowned 'M' (delicate rising twin arches threading through 'D' & 'W')
        m1 = _sample_bezier_px([P(-0.74, 0.56), P(-0.58, 0.54), P(-0.42, -0.68), P(-0.24, -0.68)], 44)
        m2 = _sample_bezier_px([P(-0.24, -0.68), P(-0.10, -0.66), P(-0.04, 0.22), P(0.00, 0.22)], 36)
        m3 = _sample_bezier_px([P(0.00, 0.22), P(0.05, 0.22), P(0.14, -0.68), P(0.30, -0.68)], 38)
        m4 = _sample_bezier_px([P(0.30, -0.68), P(0.48, -0.66), P(0.58, 0.54), P(0.76, 0.52)], 44)
        for seg in (m1, m2, m3, m4):
            _draw_thick_curve(d, seg, 5, 11, 6)
        return img

    def _make_imperial_proofs_image() -> Image.Image:
        """
        Museum-sharp 1917 Imperial German DWM Inspection Proof Row:
          [Crown/B]  [Crown/R]  [Crown/S]  [Prussian Reichsadler Military Acceptance Eagle]
        Rendered at 1640x1336 (4x supersampled for hero patch H2) positioned cleanly on upper-mid flank!
        """
        W, H = 1640, 1336
        img = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(img)

        def draw_imperial_crown(cx: float, cy: float, s: float):
            # Ornate 5-point Imperial German crown + orb-and-cross finial + jeweled circlet band
            pts = [
                (cx - 0.34 * s, cy + 0.04 * s),
                (cx - 0.44 * s, cy - 0.26 * s),
                (cx - 0.22 * s, cy - 0.14 * s),
                (cx - 0.16 * s, cy - 0.34 * s),
                (cx - 0.06 * s, cy - 0.18 * s),
                (cx, cy - 0.40 * s),
                (cx + 0.06 * s, cy - 0.18 * s),
                (cx + 0.16 * s, cy - 0.34 * s),
                (cx + 0.22 * s, cy - 0.14 * s),
                (cx + 0.44 * s, cy - 0.26 * s),
                (cx + 0.34 * s, cy + 0.04 * s),
            ]
            d.polygon(pts, fill=255)
            # Crown base band with tiny bead cutouts
            d.rounded_rectangle(
                (cx - 0.36 * s, cy + 0.03 * s, cx + 0.36 * s, cy + 0.13 * s),
                radius=int(0.03 * s),
                fill=255,
            )
            # Tiny top cross finial
            d.line([(cx, cy - 0.40 * s), (cx, cy - 0.56 * s)], fill=255, width=max(4, int(0.055 * s)))
            d.line([(cx - 0.09 * s, cy - 0.49 * s), (cx + 0.09 * s, cy - 0.49 * s)], fill=255, width=max(4, int(0.050 * s)))
            # Inner dark jewel voids for authentic engraved relief
            for dx_j in (-0.18, 0.0, 0.18):
                r_j = max(3, int(0.035 * s))
                d.ellipse(
                    (cx + dx_j * s - r_j, cy + 0.08 * s - r_j, cx + dx_j * s + r_j, cy + 0.08 * s + r_j),
                    fill=0,
                )

        def draw_crown_letter(cx: float, cy: float, s: float, ch: str):
            draw_imperial_crown(cx, cy - 0.08 * s, s * 0.92)
            d.text((cx, cy + 0.34 * s), ch, fill=255, font=_load_font(FONT_SERIF, int(0.62 * s)), anchor="mm")

        def draw_reichsadler(cx: float, cy: float, s: float):
            # Crisp Prussian Imperial Acceptance Eagle (crowned heraldic eagle with spread feathered wings & tail)
            draw_imperial_crown(cx, cy - 0.38 * s, s * 0.56)
            # Eagle head & neck facing left
            d.ellipse((cx - 0.14 * s, cy - 0.24 * s, cx + 0.10 * s, cy - 0.04 * s), fill=255)
            d.polygon([(cx - 0.12 * s, cy - 0.17 * s), (cx - 0.26 * s, cy - 0.12 * s), (cx - 0.10 * s, cy - 0.09 * s)], fill=255)
            # Shield torso
            d.polygon([
                (cx - 0.16 * s, cy - 0.06 * s),
                (cx + 0.16 * s, cy - 0.06 * s),
                (cx + 0.13 * s, cy + 0.22 * s),
                (cx, cy + 0.30 * s),
                (cx - 0.13 * s, cy + 0.22 * s),
            ], fill=255)
            # Spread feathered wings (3 distinct primary feather tips per wing)
            for side in (-1.0, 1.0):
                d.polygon([
                    (cx + side * 0.14 * s, cy - 0.06 * s),
                    (cx + side * 0.44 * s, cy - 0.16 * s),
                    (cx + side * 0.56 * s, cy - 0.06 * s),
                    (cx + side * 0.42 * s, cy + 0.02 * s),
                    (cx + side * 0.52 * s, cy + 0.09 * s),
                    (cx + side * 0.36 * s, cy + 0.14 * s),
                    (cx + side * 0.42 * s, cy + 0.22 * s),
                    (cx + side * 0.15 * s, cy + 0.16 * s),
                ], fill=255)
            # Fanned heraldic tail feathers + talons
            d.polygon([
                (cx - 0.09 * s, cy + 0.26 * s),
                (cx + 0.09 * s, cy + 0.26 * s),
                (cx + 0.24 * s, cy + 0.52 * s),
                (cx + 0.08 * s, cy + 0.45 * s),
                (cx, cy + 0.56 * s),
                (cx - 0.08 * s, cy + 0.45 * s),
                (cx - 0.24 * s, cy + 0.52 * s),
            ], fill=255)

        # Row positioned neatly in clean flat vertical center of right chamber flank (100% inside flat wall!)
        cy_row = int(H * 0.48)
        sc = 225.0
        draw_crown_letter(305, cy_row, sc, "B")
        draw_crown_letter(610, cy_row, sc, "R")
        draw_crown_letter(915, cy_row, sc, "S")
        draw_reichsadler(1275, cy_row + 14, sc * 1.12)
        return img

    def process_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # Two-stage AO: exterior parts get rich assembled contact shadows; internals stay crisp & readable!
        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.48 + ao_ext * 0.52)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.24 + 0.76 * np.power(np.clip(ao, 0.0, 1.0), 0.88), 0.22, 1.0).astype(np.float32)

        nrm = _sanitize_normals(nrm, "p08_v3_metal_base")

        # ------------------------------------------------------------------
        # Composite ALL 10 crisp 1917 DWM Historical Engravings via RNM!
        # ------------------------------------------------------------------
        bright_stamp = np.zeros((h, w), dtype=np.float32)   # Bright silver-steel / brushed engravings
        white_enamel = np.zeros((h, w), dtype=np.float32)   # Crisp white-lacquer GELADEN & GESICHERT
        dark_stamp = np.zeros((h, w), dtype=np.float32)     # Dark recessed stamps on bright nickel/straw/alloy

        # 1) "1917" Chamber Ring Date (H1)
        im_1917 = Image.new("L", (1024, 1280), 0)
        ImageDraw.Draw(im_1917).text((512, 640), "1917", fill=255, font=_load_font(FONT_SERIF, 320), anchor="mm")
        _paste_uv_band(bright_stamp, im_1917, HERO_METAL_UVS["ext_1917"])

        # 2) Imperial Crown B / R / S + Prussian Reichsadler (H2)
        _paste_uv_band(bright_stamp, _make_imperial_proofs_image(), HERO_METAL_UVS["ext_proofs"])

        # 3) Berlin Calligraphic Intertwined "DWM" Scroll Monogram (H3)
        _paste_uv_band(bright_stamp, _make_dwm_monogram_image(), HERO_METAL_UVS["ftog_dwm"])

        # 4) "GESICHERT" in Left Curved Safety Pocket (H4) — positioned in open forward half ahead of safety lever!
        im_ges = Image.new("L", (1200, 740), 0)
        ImageDraw.Draw(im_ges).text((425, 295), "GESICHERT", fill=255, font=_load_font(FONT_COND, 168), anchor="mm")
        _paste_uv_band(white_enamel, im_ges, HERO_METAL_UVS["frame_gesichert"])

        # 5) "GELADEN" on Left Vertical Step of Extractor (H5) — cleanly inset inside pure flat raised wall!
        im_gel = Image.new("L", (1200, 740), 0)
        ImageDraw.Draw(im_gel).text((600, 380), "GELADEN", fill=255, font=_load_font(FONT_SANS, 178), anchor="mm")
        _paste_uv_band(white_enamel, im_gel, HERO_METAL_UVS["ext_geladen"])

        # 6) Matching "21" on Sideplate Upper-Left Flat (H6)
        im_sp21 = Image.new("L", (800, 760), 0)
        ImageDraw.Draw(im_sp21).text((240, 220), "21", fill=255, font=_load_font(FONT_SERIF, 210), anchor="mm")
        _paste_uv_band(bright_stamp, im_sp21, HERO_METAL_UVS["sideplate_21"])

        # 7) "4821 a" Serial on Front Frame Dust-Cover Nose (H7)
        im_ser = Image.new("L", (900, 760), 0)
        ds = ImageDraw.Draw(im_ser)
        ds.text((450, 290), "4821", fill=255, font=_load_font(FONT_SERIF, 240), anchor="mm")
        ds.text((450, 520), "a", fill=255, font=_load_font(FONT_ITALIC, 200), anchor="mm")
        _paste_uv_band(bright_stamp, im_ser, HERO_METAL_UVS["frame_serial"])

        # 8) "P.08 / 9 m/m" on Brushed Nickel Magazine Body (H8)
        im_mag = Image.new("L", (640, 700), 0)
        dm = ImageDraw.Draw(im_mag)
        dm.text((320, 260), "P.08", fill=255, font=_load_font(FONT_SANS, 165), anchor="mm")
        dm.text((320, 445), "9 m/m", fill=235, font=_load_font(FONT_SERIF, 118), anchor="mm")
        _paste_uv_band(dark_stamp, im_mag, HERO_METAL_UVS["mag_p08"])

        # 9) "4821 a" on Underside of Magazine Base (H9)
        _paste_uv_band(dark_stamp, im_ser, HERO_METAL_UVS["mag_base_serial"])

        # 10) Matching "21" on Straw-Gold Takedown Lever Pivot Boss (H10)
        im_td21 = Image.new("L", (512, 420), 0)
        ImageDraw.Draw(im_td21).text((256, 210), "21", fill=255, font=_load_font(FONT_SERIF, 185), anchor="mm")
        _paste_uv_band(dark_stamp, im_td21, HERO_METAL_UVS["td_lever_21"])

        # Blend engraved color, roughness, metalness, micro-AO & V-carved heightfield!
        decal_height = np.zeros((h, w), dtype=np.float32)

        # Bright steel-chased engravings on Imperial Rust-Blued steel (razor crisp, zero chalky halo!)
        bs_bev = _bevel_mask(bright_stamp, width_px=1.2)
        _mix(albedo, (0.82, 0.85, 0.90), bright_stamp * 0.84)
        _mix(rgh, 0.32, bright_stamp * 0.78)
        ao *= 1.0 - 0.26 * bs_bev
        decal_height -= 0.68 * bs_bev

        # Crisp white enamel-inlaid German safety/loaded indicators (GELADEN & GESICHERT)
        we_bev = _bevel_mask(white_enamel, width_px=1.2)
        _mix(albedo, (0.94, 0.95, 0.96), white_enamel * 0.95)
        _mix(rgh, 0.40, white_enamel * 0.90)
        _mix(met, 0.06, white_enamel * 0.95)
        ao *= 1.0 - 0.12 * we_bev
        decal_height -= 0.58 * we_bev

        # Dark recessed die-stamps on bright nickel / alloy / straw-gold
        dk_bev = _bevel_mask(dark_stamp, width_px=1.2)
        _mix(albedo, (0.20, 0.18, 0.14), dark_stamp * 0.68)
        _mix(rgh, 0.46, dark_stamp * 0.78)
        ao *= 1.0 - 0.30 * dk_bev
        decal_height -= 0.60 * dk_bev

        # Subtle authentic museum handling hairline micro-scratches across Zone A blued steel
        rng = np.random.default_rng(1917)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(180):
            sx = float(rng.uniform(0.015, 0.715) * w)
            sy = float(rng.uniform(0.02, 0.98) * h)
            length = float(rng.uniform(10, 56))
            ang = math.radians(float(rng.uniform(-22, 22)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(55, 160)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0)
        # Only on Zone A rust-blued steel (never across bright decals)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        zone_a_mask = (u_grid < 0.728).astype(np.float32) * (1.0 - np.clip(bright_stamp + white_enamel, 0.0, 1.0))
        sc *= zone_a_mask
        _mix(albedo, (0.48, 0.52, 0.58), sc * 0.26)
        rgh -= sc * 0.05
        met = np.clip(met + sc * 0.08, 0.02, 0.98)
        decal_height -= sc * 0.045

        decal_nrm = _height_to_normal_01(decal_height, strength=3.0)
        nrm_final = _rnm_blend(nrm, decal_nrm)
        nrm_final = _sanitize_normals(nrm_final, "p08_v3_metal_final")

        rgh = np.clip(rgh, 0.12, 0.90)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_metal_albedo.webp", "WEBP", quality=98, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_metal_normal.webp", "WEBP", quality=98, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_metal_roughness.webp", "WEBP", quality=96, method=6
        )
        print("[POST] Saved p08_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    def process_walnut_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "walnut_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "walnut_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "walnut_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "walnut_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "walnut_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "walnut_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "walnut_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # Rich realistic contact shadow where walnut meets curved blued-steel frame & screw recess
        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.46 + ao_ext * 0.54)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.28 + 0.72 * np.power(np.clip(ao, 0.0, 1.0), 0.85), 0.25, 1.0).astype(np.float32)

        nrm = _sanitize_normals(nrm, "p08_v3_walnut_base")

        # ------------------------------------------------------------------
        # Analytic Metric 20-LPI Diamond Checkering, Curved Recessed Border
        # Channel, Wood Pores & Warm Hand-Worn Palm Patina on BOTH Hero Panels!
        # ------------------------------------------------------------------
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # Precompute exact vectorized organic panel contour lookup tables (512 samples)
        # Note: because our hero outer faces use exact isotropic metric UV:
        #   u_uv = cx_uv + K * (sf - SF_MID) * sign_u  (left: sign_u=-1 so front->left matching viewing left face,
        #                                               right: sign_u=+1 so front->right matching viewing right face)
        #   v_uv = cy_uv + K * (su - SU_MID)
        detail_height = np.zeros((h, w), dtype=np.float32)
        chk_all = np.zeros((h, w), dtype=np.float32)
        bdr_all = np.zeros((h, w), dtype=np.float32)
        pyr_all = np.zeros((h, w), dtype=np.float32)
        patina_all = np.zeros((h, w), dtype=np.float32)
        wood_outer_all = np.zeros((h, w), dtype=np.float32)

        def _eval_pchip_np(xs, ys, ms, x_arr: np.ndarray) -> np.ndarray:
            xc = np.clip(x_arr, xs[0], xs[-1])
            idx = np.clip(np.searchsorted(xs, xc, side="right") - 1, 0, len(xs) - 2)
            x0 = np.asarray(xs, dtype=np.float32)[idx]
            x1 = np.asarray(xs, dtype=np.float32)[idx + 1]
            y0 = np.asarray(ys, dtype=np.float32)[idx]
            y1 = np.asarray(ys, dtype=np.float32)[idx + 1]
            m0 = np.asarray(ms, dtype=np.float32)[idx]
            m1 = np.asarray(ms, dtype=np.float32)[idx + 1]
            h_seg = np.maximum(x1 - x0, 1e-6)
            t = (xc - x0) / h_seg
            t2 = t * t
            t3 = t2 * t
            return (
                (2.0 * t3 - 3.0 * t2 + 1.0) * y0
                + (t3 - 2.0 * t2 + t) * h_seg * m0
                + (-2.0 * t3 + 3.0 * t2) * y1
                + (t3 - t2) * h_seg * m1
            ).astype(np.float32)

        # Evaluate exact signed distance inside curved PCHIP organic grip outline in metric `(sf, su)` cm!
        def eval_panel_interior_distance(sf_arr: np.ndarray, su_arr: np.ndarray, is_left: bool) -> np.ndarray:
            # Exact vectorized PCHIP backstrap & frontstrap curves matching Mode 1 eval_backstrap_sf / eval_frontstrap_sf
            sf_back = _eval_pchip_np(P08_BS_SU, P08_BS_SF, P08_BS_M, su_arr) + 0.28
            sf_front = _eval_pchip_np(P08_FS_SU, P08_FS_SF, P08_FS_M, su_arr) - 0.28

            u_est = np.clip(2.0 * (sf_arr - sf_back) / np.maximum(sf_front - sf_back, 0.5) - 1.0, -1.0, 1.0)
            su_bot = -4.46 - 0.16 * u_est + 0.08 * (1.0 - u_est * u_est)
            su_top = (
                3.28
                + 0.76 * (0.5 * (u_est + 1.0))
                + 0.64 * np.sin(math.pi * np.clip((u_est + 0.88) / 1.88, 0.0, 1.0))
                - 0.34 * _smoothstep(0.45, 1.0, u_est)
            )

            # Inward positive distance from all 4 organic curved edges (in cm)
            d_left = sf_arr - sf_back
            d_right = sf_front - sf_arr
            d_bot = su_arr - su_bot
            d_top = su_top - su_arr
            d_edge = np.minimum(np.minimum(d_left, d_right), np.minimum(d_bot, d_top))

            # Clear circular smooth collar around lower blued grip screw (r = 0.45 cm)
            d_screw = np.hypot(sf_arr - GRIP_SCREW_SF, su_arr - GRIP_SCREW_SU) - 0.12
            d_edge = np.minimum(d_edge, d_screw)

            # On LEFT panel ONLY: curve border cleanly around semicircular magazine-release scallop!
            if is_left:
                d_mag = np.hypot(sf_arr - MAG_BTN_SF, su_arr - MAG_BTN_SU) - 0.46
                d_edge = np.minimum(d_edge, d_mag)
            return d_edge.astype(np.float32)

        # Authentic 18-LPI Luger European walnut diamond checkering pitch = 0.141 cm (1.41 mm), 3:1 diamond angle (+/-31 deg)!
        pitch_cm = 0.141
        ca = math.cos(math.radians(31.0))
        sa = math.sin(math.radians(31.0))

        for is_left, (cx_uv, cy_uv), sign_u in (
            (True, WALNUT_LEFT_CENTER_UV, -1.0),
            (False, WALNUT_RIGHT_CENTER_UV, +1.0),
        ):
            # Restrict cleanly to this panel's UV region
            u_lo, u_hi = cx_uv - 0.184, cx_uv + 0.184
            v_lo, v_hi = cy_uv - 0.485, cy_uv + 0.485
            box = (u_grid >= u_lo) & (u_grid <= u_hi) & (v_grid >= v_lo) & (v_grid <= v_hi)

            sf_arr = WALNUT_SF_MID + sign_u * (u_grid - cx_uv) / WALNUT_UV_K
            su_arr = WALNUT_SU_MID + (v_grid - cy_uv) / WALNUT_UV_K

            d_in = eval_panel_interior_distance(sf_arr, su_arr, is_left)
            in_panel = box & (d_in > -0.08)
            wood_outer = in_panel.astype(np.float32)
            wood_outer_all = np.maximum(wood_outer_all, wood_outer)

            # Checkering field strictly inset by 0.34 cm (3.4 mm) uniform carved border from EVERY curved edge!
            border_margin = 0.34
            chk_m = _smoothstep(border_margin - 0.025, border_margin + 0.025, d_in) * wood_outer

            # Deep hand-cut V-carved recessed border channel right at d_in = border_margin (width ~0.8 mm)!
            bdr_dist = np.abs(d_in - border_margin)
            bdr_groove = (1.0 - _smoothstep(0.0, 0.052, bdr_dist)) * wood_outer
            # Subtle secondary parallel decorative hairline groove just outside main border channel
            bdr_outer = (1.0 - _smoothstep(0.0, 0.028, np.abs(d_in - (border_margin - 0.075)))) * wood_outer * 0.42

            # Crisp 4-faceted pyramidal 20-LPI diamond checkering: height = min(tri(q1), tri(q2))!
            q1 = (sf_arr * ca + su_arr * sa) / pitch_cm
            q2 = (sf_arr * ca - su_arr * sa) / pitch_cm
            tri1 = 1.0 - 2.0 * np.abs((q1 - np.floor(q1)) - 0.5)
            tri2 = 1.0 - 2.0 * np.abs((q2 - np.floor(q2)) - 0.5)
            # Crisp slightly flattened micro-tip (0.94) so individual specular glints flash cleanly on diamond peaks!
            pyr = np.minimum(tri1, tri2)
            pyr_crested = np.clip(pyr / 0.94, 0.0, 1.0).astype(np.float32)

            # Warm hand-worn darker palm patina centered over ergonomic palm swell (`sf=-0.12, su=-0.45`)!
            palm_r = np.hypot((sf_arr - (-0.12)) / 1.38, (su_arr - (-0.45)) / 3.10)
            palm_pat = np.clip(1.0 - _smoothstep(0.18, 1.15, palm_r), 0.0, 1.0) * wood_outer

            chk_all = np.maximum(chk_all, chk_m)
            bdr_all = np.maximum(bdr_all, np.clip(bdr_groove + bdr_outer, 0.0, 1.0))
            pyr_all = np.where(chk_m > 0.01, pyr_crested, pyr_all)
            patina_all = np.maximum(patina_all, palm_pat)

            # Heightfield contribution: sharp pyramids + recessed carved border channel!
            detail_height += (0.88 * pyr_crested - 0.16) * chk_m - 0.62 * bdr_groove - 0.24 * bdr_outer

        # Fine elongated natural walnut open wood-vessel pores (oriented strictly along grip spine v-axis!)
        rng_w = np.random.default_rng(1908)
        pore_img = Image.new("L", (w, h), 0)
        dp = ImageDraw.Draw(pore_img)
        for _ in range(3800):
            px = float(rng_w.uniform(0.01, 0.74) * w)
            py = float(rng_w.uniform(0.02, 0.98) * h)
            plen = float(rng_w.uniform(6, 30))
            dp.line([(px, py), (px + float(rng_w.uniform(-1.5, 1.5)), py + plen)], fill=int(rng_w.integers(90, 235)), width=1)
        pores = (np.asarray(pore_img, dtype=np.float32) / 255.0) * wood_outer_all * (1.0 - chk_all * 0.55)
        detail_height -= 0.14 * pores

        # Guard screw islands (metalness > 0.3) so wood checkering/patina NEVER touches blued screws!
        wood_guard = (met < 0.25).astype(np.float32)
        chk_all *= wood_guard
        bdr_all *= wood_guard
        patina_all *= wood_guard
        pores *= wood_guard
        detail_height *= wood_guard

        # 1) Warm hand-worn palm patina (rich antique oiled espresso darkening on central swell)
        patina_mul = 1.0 - 0.22 * patina_all[..., None] * np.array([0.85, 1.05, 1.20], dtype=np.float32)
        albedo *= patina_mul

        # 2) Crisp diamond checkering valley darkening vs oil-burnished sunlit diamond crests!
        valley = 1.0 - pyr_all
        # Cut-wood checkering valleys are rich dark walnut; crests catch warm honey-chestnut highlights
        chk_tone = (0.48 + 0.64 * pyr_all)[..., None]
        albedo = albedo * (1.0 - chk_all[..., None]) + (albedo * chk_tone) * chk_all[..., None]

        # Darken recessed carved border groove & natural wood pores
        _mix(albedo, (0.095, 0.048, 0.022), bdr_all * 0.78)
        _mix(albedo, (0.085, 0.042, 0.018), pores * 0.42)

        # 3) Micro-AO in checkering valleys & border channel (deep crisp 3D tactile contrast!)
        ao_chk = 0.40 + 0.60 * np.power(pyr_all, 0.72)
        ao *= (1.0 - chk_all) + ao_chk * chk_all
        ao *= 1.0 - 0.44 * bdr_all
        ao *= 1.0 - 0.18 * pores
        ao = np.clip(ao, 0.22, 1.0).astype(np.float32)

        # 4) Physically-accurate roughness breakup:
        #    - Smooth hand-rubbed linseed-oiled wood border: warm satin sheen (R = 0.29..0.39)
        #    - Hand-worn 18-LPI diamond crests: oil-burnished satin glints (R = 0.33..0.44) catching studio softboxes!
        #    - Deep cut checkering valleys: matte dry end-grain (R = 0.72)
        r_chk_field = 0.72 - 0.35 * np.power(pyr_all, 1.30) - 0.06 * patina_all * pyr_all
        r_smooth_field = np.clip(rgh - 0.08 * patina_all + 0.09 * pores, 0.28, 0.56)
        rgh = np.where(wood_guard > 0.5, r_smooth_field * (1.0 - chk_all) + r_chk_field * chk_all, rgh)
        _mix(rgh, 0.74, bdr_all * 0.85)
        rgh = np.clip(rgh, 0.15, 0.88)

        # 5) Razor-crisp RNM Normal blending for 18-LPI diamond pyramids, carved border groove & wood pores!
        chk_nrm = _height_to_normal_01(detail_height, strength=5.2)
        nrm_final = _rnm_blend(nrm, chk_nrm)
        nrm_final = _sanitize_normals(nrm_final, "p08_v3_walnut_final")

        met = np.clip(met, 0.0, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_walnut_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_walnut_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p08_v3_walnut_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p08_v3_walnut_{albedo,normal,roughness}.webp (2048x2048)")

    process_metal_atlas()
    process_walnut_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Photo-Grade Hard-Surface Sculpting + Cycles GPU Baking
#         + Draco glTF 2.0 Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = REPO_ROOT / "public" / "models"
TEXTURES_DIR = REPO_ROOT / "public" / "textures"
GLB_OUT_PATH = MODELS_DIR / "p08.glb"

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js assembledPos & assembledRotZ from src/weapons/p08/plugin.ts
ASSEMBLED_POSES: dict[str, tuple[tuple[float, float, float], float]] = {
    "p08_barrel": ((0.0, 0.0, 0.0), 0.0),
    "p08_barrel_extension": ((0.0, 0.0, 0.0), 0.0),
    "p08_breechblock": ((0.0, 0.0, 0.0), 0.0),
    "p08_extractor": ((0.95, 2.72, 0.0), 0.0),
    "p08_front_toggle": ((P08_FRONT_PIN_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_rear_toggle": ((P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_toggle_pins": ((P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_striker": ((0.35, P08_BORE_Y, 0.0), 0.0),
    "p08_frame": ((0.0, 0.0, 0.0), 0.0),
    "p08_sideplate": ((1.35, 0.92, -0.96), 0.0),
    "p08_takedown_lever": ((2.55, 0.48, -0.95), 0.0),
    "p08_ejector": ((-1.15, 2.02, 0.72), 0.0),
    "p08_hold_open": ((-0.85, 1.28, 0.36), 0.0),
    "p08_grip_left": ((-5.65, -4.45, -0.92), 0.0),
    "p08_grip_right": ((-5.65, -4.45, 0.92), 0.0),
    "p08_trigger": ((0.55, -0.15, 0.0), 0.0),
    "p08_trigger_lever": ((1.15, 0.92, -0.82), 0.0),
    "p08_sear_bar": ((-1.85, 2.08, -1.04), 0.0),
    "p08_thumb_safety": ((-7.35, 0.45, -0.96), 0.0),
    "p08_mag_body": ((-4.45, -3.30, 0.0), P08_GRIP_ANGLE_RAD),
    "p08_mag_follower": ((-6.58, -6.34, 0.0), P08_GRIP_ANGLE_RAD),
    "p08_mag_base": ((-8.18, -8.62, 0.0), P08_GRIP_ANGLE_RAD),
}

WALNUT_PARTS = ("p08_grip_left", "p08_grip_right")
METAL_PARTS = tuple(k for k in ASSEMBLED_POSES.keys() if k not in WALNUT_PARTS)

# Exterior visible parts that receive assembled Contact-AO (internal parts stay luminous with pure Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "p08_barrel",
    "p08_barrel_extension",
    "p08_breechblock",
    "p08_extractor",
    "p08_front_toggle",
    "p08_rear_toggle",
    "p08_toggle_pins",
    "p08_frame",
    "p08_sideplate",
    "p08_takedown_lever",
    "p08_trigger",
    "p08_sear_bar",
    "p08_thumb_safety",
    "p08_grip_left",
    "p08_grip_right",
    "p08_mag_base",
}


def t2b(tx: float, ty: float, tz: float) -> Vector:
    """Maps Three.js (+X muzzle, +Y up, +Z right) -> Blender (+X muzzle, -Y right, +Z up)."""
    return Vector((tx, -tz, ty))


def b2t(bx: float, by: float, bz: float) -> tuple[float, float, float]:
    """Inverse of t2b: Blender -> Three.js."""
    return (bx, bz, -by)


def mat_three_rot_z(theta: float) -> Matrix:
    return Matrix.Rotation(-theta, 4, "Y")


def mat_three_rot_x(theta: float) -> Matrix:
    return Matrix.Rotation(theta, 4, "X")


def mat_three_rot_y(theta: float) -> Matrix:
    return Matrix.Rotation(theta, 4, "Z")


def mat_three_translate(tx: float, ty: float, tz: float) -> Matrix:
    return Matrix.Translation(t2b(tx, ty, tz))


def srgb_to_lin(r: float, g: float, b: float) -> tuple[float, float, float, float]:
    def c(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(r), c(g), c(b), 1.0)


def find_system_python() -> str:
    for candidate in ("/usr/bin/python3", shutil.which("python3") or "python3"):
        if candidate and os.path.exists(candidate):
            res = subprocess.run(
                [candidate, "-c", "import PIL, numpy, scipy"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if res.returncode == 0:
                return candidate
    raise RuntimeError("System python3 with PIL + numpy + scipy is required for post-processing.")


def select_only(objs: Sequence[bpy.types.Object], active: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def setup_clean_cycles_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"

    prefs = bpy.context.preferences.addons["cycles"].preferences
    use_gpu = False
    for backend in ("METAL", "CUDA", "OPTIX", "HIP"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpu_devs = [d for d in prefs.devices if d.type == backend]
            if gpu_devs:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                use_gpu = True
                print(f"[CYCLES] Using {backend} GPU: {[d.name for d in gpu_devs]}")
                break
        except Exception:
            continue
    if not use_gpu:
        scene.cycles.device = "CPU"
        print("[CYCLES] Using CPU backend")

    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0

    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.light_settings.distance = 0.65

    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    print(f"[SCENE] Blender {bpy.app.version_string} | Cycles device = {scene.cycles.device}")
    return scene


# =============================================================================
# 1. HARD-SURFACE BMESH & SCULPTURAL TOOLKIT
# =============================================================================


def sample_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 12,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0],
            mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1],
        ))
    return pts


def sample_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 16,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0],
            mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def rounded_polygon_2d(
    corners: Sequence[tuple[float, float, float]],
    arc_steps: int = 6,
) -> list[tuple[float, float]]:
    n = len(corners)
    out: list[tuple[float, float]] = []
    for i in range(n):
        p_prev = Vector((corners[(i - 1) % n][0], corners[(i - 1) % n][1]))
        p_curr = Vector((corners[i][0], corners[i][1]))
        p_next = Vector((corners[(i + 1) % n][0], corners[(i + 1) % n][1]))
        r = corners[i][2]
        if r <= 1e-5:
            out.append((p_curr.x, p_curr.y))
            continue
        v1 = p_prev - p_curr
        v2 = p_next - p_curr
        l1, l2 = v1.length, v2.length
        if l1 < 1e-6 or l2 < 1e-6:
            out.append((p_curr.x, p_curr.y))
            continue
        u1, u2 = v1 / l1, v2 / l2
        dot = max(-0.999, min(0.999, u1.dot(u2)))
        half_ang = 0.5 * math.acos(dot)
        tan_h = math.tan(half_ang)
        if tan_h < 1e-5:
            out.append((p_curr.x, p_curr.y))
            continue
        dist = min(r / tan_h, l1 * 0.45, l2 * 0.45)
        r_eff = dist * tan_h
        t1 = p_curr + u1 * dist
        t2 = p_curr + u2 * dist
        bis = u1 + u2
        if bis.length < 1e-6:
            out.append((p_curr.x, p_curr.y))
            continue
        bis.normalize()
        center = p_curr + bis * (r_eff / max(1e-5, math.sin(half_ang)))
        a1 = math.atan2(t1.y - center.y, t1.x - center.x)
        a2 = math.atan2(t2.y - center.y, t2.x - center.x)
        da = (a2 - a1 + math.pi) % (2.0 * math.pi) - math.pi
        for s in range(arc_steps + 1):
            a = a1 + da * (s / arc_steps)
            out.append((center.x + math.cos(a) * r_eff, center.y + math.sin(a) * r_eff))
    return out


def set_smooth_shading(obj: bpy.types.Object) -> None:
    mesh = obj.data
    n = len(mesh.polygons)
    if n > 0:
        mesh.polygons.foreach_set("use_smooth", [True] * n)


def new_mesh_obj(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    set_smooth_shading(obj)
    return obj


def cleanup_mesh(obj: bpy.types.Object, merge_dist: float = 0.00005) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bnd_pre = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nm_pre = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bnd_post = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nm_post = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    if bnd_post <= bnd_pre and nm_post <= nm_pre:
        bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def make_box_three(
    name: str,
    sx: float,
    sy: float,
    sz: float,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    bevel_segs: int = 3,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((sx, sz, sy, 1.0)), verts=bm.verts)
    if bevel > 0.0:
        b = min(bevel, min(sx, sy, sz) * 0.42)
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=b,
            offset_type="OFFSET",
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    rot_m = mat_three_rot_z(rot_three[2]) @ mat_three_rot_y(rot_three[1]) @ mat_three_rot_x(rot_three[0])
    bmesh.ops.transform(bm, matrix=mat_three_translate(*center) @ rot_m, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_cylinder_three(
    name: str,
    radius1: float,
    radius2: float,
    length: float,
    axis: str = "X",
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 36,
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_caps: float = 0.0,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius1,
        radius2=radius2,
        depth=length,
    )
    if bevel_caps > 0.0:
        cap_edges = [
            e for e in bm.edges
            if len(e.link_faces) == 2 and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4
        ]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=min(bevel_caps, length * 0.35, min(radius1, radius2) * 0.4),
                segments=3,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    if axis == "X":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "Y")
    elif axis == "Z":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        axis_m = Matrix.Identity(4)

    rot_m = mat_three_rot_z(rot_three[2]) @ mat_three_rot_y(rot_three[1]) @ mat_three_rot_x(rot_three[0])
    bmesh.ops.transform(bm, matrix=mat_three_translate(*center) @ rot_m @ axis_m, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_revolve_three(
    name: str,
    profile: Sequence[tuple[float, float]],
    axis: str = "X",
    segments: int = 48,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    is_closed_loop = (
        len(profile) >= 3
        and profile[0][0] > 1e-6
        and abs(profile[0][0] - profile[-1][0]) < 1e-6
        and abs(profile[0][1] - profile[-1][1]) < 1e-6
    )
    pts = list(profile[:-1]) if is_closed_loop else list(profile)

    rings: list[list[bmesh.types.BMVert] | bmesh.types.BMVert] = []
    for r, coord in pts:
        if r <= 1e-6:
            rings.append(bm.verts.new((0.0, 0.0, coord)))
        else:
            ring = []
            for s in range(segments):
                a = (2.0 * math.pi * s) / segments
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), coord)))
            rings.append(ring)

    n_rings = len(rings)
    pair_count = n_rings if is_closed_loop else n_rings - 1
    for i in range(pair_count):
        r0 = rings[i]
        r1 = rings[(i + 1) % n_rings]
        if isinstance(r0, list) and isinstance(r1, list):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
                except ValueError:
                    pass
        elif isinstance(r0, bmesh.types.BMVert) and isinstance(r1, list):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0, r1[sn], r1[s]))
                except ValueError:
                    pass
        elif isinstance(r0, list) and isinstance(r1, bmesh.types.BMVert):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0[s], r0[sn], r1))
                except ValueError:
                    pass

    if axis == "X":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "Y")
    elif axis == "Z":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        axis_m = Matrix.Identity(4)

    rot_m = mat_three_rot_z(rot_three[2]) @ mat_three_rot_y(rot_three[1]) @ mat_three_rot_x(rot_three[0])
    bmesh.ops.transform(bm, matrix=mat_three_translate(*center) @ rot_m @ axis_m, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_extrude_z_three(
    name: str,
    poly_xy: Sequence[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 3,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    if z0 > z1:
        z0, z1 = z1, z0
    clean_pts: list[tuple[float, float]] = []
    for p in poly_xy:
        if not clean_pts or math.hypot(p[0] - clean_pts[-1][0], p[1] - clean_pts[-1][1]) > 1e-4:
            clean_pts.append(p)
    if len(clean_pts) > 2 and math.hypot(clean_pts[0][0] - clean_pts[-1][0], clean_pts[0][1] - clean_pts[-1][1]) < 1e-4:
        clean_pts.pop()

    area = sum(
        clean_pts[i][0] * clean_pts[(i + 1) % len(clean_pts)][1]
        - clean_pts[(i + 1) % len(clean_pts)][0] * clean_pts[i][1]
        for i in range(len(clean_pts))
    )
    if area < 0:
        clean_pts.reverse()

    bm = bmesh.new()
    v_bot = [bm.verts.new(t2b(x, y, z0)) for (x, y) in clean_pts]
    v_top = [bm.verts.new(t2b(x, y, z1)) for (x, y) in clean_pts]
    n = len(clean_pts)
    bm.faces.new(v_bot)
    bm.faces.new(list(reversed(v_top)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_bot[i], v_bot[j], v_top[j], v_top[i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    if bevel > 0.0:
        b = min(bevel, abs(z1 - z0) * 0.42)
        cap_edges = [
            e for e in bm.edges
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(24.0)
        ]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=b,
                offset_type="OFFSET",
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )

    rot_m = mat_three_rot_z(rot_three[2]) @ mat_three_rot_y(rot_three[1]) @ mat_three_rot_x(rot_three[0])
    bmesh.ops.transform(bm, matrix=mat_three_translate(*center) @ rot_m, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_swept_tube_three(
    name: str,
    centerline_xy: Sequence[tuple[float, float]],
    rx_fn: Callable[[float], float],
    rz_fn: Callable[[float], float],
    sec_n: int = 20,
    super_exp: float = 0.78,
) -> bpy.types.Object:
    """Sweeps a smoothly varying superellipse cross-section along an (x, y) centerline."""
    bm = bmesh.new()
    rings = []
    n_pts = len(centerline_xy)
    for i, (cx, cy) in enumerate(centerline_xy):
        t = i / max(1, n_pts - 1)
        if i == 0:
            tx, ty = centerline_xy[1][0] - cx, centerline_xy[1][1] - cy
        elif i == n_pts - 1:
            tx, ty = cx - centerline_xy[-2][0], cy - centerline_xy[-2][1]
        else:
            tx, ty = centerline_xy[i + 1][0] - centerline_xy[i - 1][0], centerline_xy[i + 1][1] - centerline_xy[i - 1][1]
        tl = max(1e-6, math.hypot(tx, ty))
        nx, ny = -ty / tl, tx / tl
        rx = rx_fn(t)
        rz = rz_fn(t)
        ring = []
        for s in range(sec_n):
            a = (s / sec_n) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            px = math.copysign(abs(ca) ** super_exp, ca) * rx
            pz = math.copysign(abs(sa) ** super_exp, sa) * rz
            ring.append(bm.verts.new(t2b(cx + nx * px, cy + ny * px, pz)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sec_n):
            sn = (s + 1) % sec_n
            bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return new_mesh_obj(name, bm)


def bool_op(
    target: bpy.types.Object,
    cutter: bpy.types.Object,
    operation: str = "DIFFERENCE",
    delete_cutter: bool = True,
) -> bpy.types.Object:
    select_only([target], target)
    mod = target.modifiers.new("Bool", "BOOLEAN")
    mod.operation = operation
    mod.object = cutter
    mod.solver = "EXACT"
    mod.use_self = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_cutter:
        mesh_data = cutter.data
        bpy.data.objects.remove(cutter, do_unlink=True)
        if mesh_data.users == 0:
            bpy.data.meshes.remove(mesh_data)
    cleanup_mesh(target, merge_dist=0.00002)
    return target


def join_objects(target: bpy.types.Object, others: Sequence[bpy.types.Object]) -> bpy.types.Object:
    if not others:
        return target
    select_only([target, *others], target)
    bpy.ops.object.join()
    return target


def _count_non_manifold(mesh: bpy.types.Mesh) -> tuple[int, int]:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bnd = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.free()
    return bnd, nm


def finalize_hard_surface(
    obj: bpy.types.Object,
    bevel_width: float = 0.030,
    bevel_segments: int = 3,
    bevel_angle_deg: float = 34.0,
    sharp_deg: float = 40.0,
    use_bevel: bool = True,
    lock_flat_walls: bool = False,
    use_weighted_normals: bool = True,
) -> bpy.types.Object:
    """Manifold-guarded multi-segment bevel + optional flat-wall lock + WeightedNormal + beauty triangulation."""
    select_only([obj], obj)
    cleanup_mesh(obj, merge_dist=0.00003)
    set_smooth_shading(obj)

    if use_bevel and bevel_width > 0.0:
        bnd_pre, nm_pre = _count_non_manifold(obj.data)
        backup = obj.data.copy()
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = bevel_segments
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(bevel_angle_deg)
        bev.use_clamp_overlap = True
        bev.miter_outer = "MITER_ARC"
        bev.harden_normals = False
        bpy.ops.object.modifier_apply(modifier=bev.name)
        bnd_post, nm_post = _count_non_manifold(obj.data)
        if bnd_post > bnd_pre or nm_post > nm_pre:
            old = obj.data
            obj.data = backup
            bpy.data.meshes.remove(old)
        else:
            bpy.data.meshes.remove(backup)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    sharp_rad = math.radians(sharp_deg)
    flat_rad = math.radians(12.0)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = e.calc_face_angle(0.0)
            is_flat_wall = False
            if lock_flat_walls and ang > flat_rad:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                # Lock planar machined +-Z cheeks (Blender Y axis) optically mirror-flat!
                if (abs(f0.normal.y) > 0.985 or abs(f1.normal.y) > 0.985) and (
                    f0.calc_area() > 0.06 or f1.calc_area() > 0.06
                ):
                    is_flat_wall = True
            e.smooth = (ang < sharp_rad) and (not is_flat_wall)
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()

    if use_weighted_normals:
        wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        wn.weight = 100
        wn.thresh = 0.01
        bpy.ops.object.modifier_apply(modifier=wn.name)

    tri = obj.modifiers.new("Triangulate", "TRIANGULATE")
    tri.quad_method = "BEAUTY"
    tri.ngon_method = "BEAUTY"
    tri.keep_custom_normals = True
    bpy.ops.object.modifier_apply(modifier=tri.name)

    obj.data.update()
    return obj


def verify_manifold_and_bbox(obj: bpy.types.Object) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    non_manif = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    vol = bm.calc_volume(signed=True)
    if vol < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        vol = -vol
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    xs, ys, zs = [], [], []
    for v in bm.verts:
        tx, ty, tz = b2t(v.co.x, v.co.y, v.co.z)
        xs.append(tx)
        ys.append(ty)
        zs.append(tz)
    bm.free()

    mesh = obj.data
    corner_normals = mesh.corner_normals
    dot_sum = 0.0
    n_loops = 0
    for poly in mesh.polygons:
        fn = poly.normal
        for li in poly.loop_indices:
            dot_sum += corner_normals[li].vector.dot(fn)
            n_loops += 1
    mean_dot = (dot_sum / n_loops) if n_loops > 0 else 1.0
    if mean_dot < 0.72:
        raise RuntimeError(f"{obj.name} has inverted custom split normals! mean_dot={mean_dot:.3f}")

    return {
        "tris": tris,
        "boundary": boundary,
        "non_manifold": non_manif,
        "volume": round(vol, 4),
        "norm_dot": round(mean_dot, 3),
        "min": [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)],
        "max": [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
    }


# =============================================================================
# 2. ALL 22 PHOTO-GRADE SCULPTED DWM 1917 LUGER P08 PART BUILDERS
# =============================================================================


def build_p08_barrel() -> bpy.types.Object:
    """
    U-01: Stepped Cylindrical Reinforced Chamber Ring -> Graceful 4" (102mm) Luger Pencil-Taper
    Barrel -> Integral Front Sight Band w/ Machined Horizontal Dovetail & Undercut Barleycorn Blade
    + Recessed 11-deg Target Crown + 6-Groove Helical Rifling!
    """
    solid_profile = [
        (0.0, 1.72),
        (0.730, 1.72),
        (0.780, 1.77),
        (0.780, 3.38),   # Threaded shank inside barrel extension
        (0.870, 3.44),   # Crisp witness step at chamber ring face (X = 3.48)
        (0.910, 3.50),   # Reinforced cylindrical barrel chamber collar!
        (0.910, 3.84),
        (0.885, 3.92),   # Turned chamfer ring
        (0.810, 4.04),   # Graceful Luger concave shoulder neck
        (0.754, 4.24),
        (0.722, 4.60),
        (0.692, 5.80),   # Slender conical 4" pencil taper
        (0.646, 8.40),
        (0.594, 11.18),
        (0.618, 11.26),  # Concave flare into integral front sight band (Kornsattel)
        (0.668, 11.35),
        (0.678, 11.42),
        (0.678, 12.08),
        (0.662, 12.15),
        (0.612, 12.20),  # Exact OAL muzzle datum X_max = 12.20 cm!
        (0.0, 12.20),
    ]
    barrel = make_revolve_three(
        "p08_barrel", solid_profile, axis="X", segments=72, center=(0.0, P08_BORE_Y, 0.0)
    )

    # Sculpted rounded front sight band pedestal (Kornsockel) w/ visible horizontal dovetail seam!
    base_pts = rounded_polygon_2d(
        [
            (11.34, P08_BORE_Y + 0.54, 0.03),
            (12.10, P08_BORE_Y + 0.54, 0.03),
            (12.04, P08_BORE_Y + 0.89, 0.04),
            (11.40, P08_BORE_Y + 0.89, 0.04),
        ],
        arc_steps=4,
    )
    sight_base = make_extrude_z_three("sight_base", base_pts, -0.26, 0.26, bevel=0.035, bevel_segs=3)
    # Transverse dovetail key wedge protruding subtly at base of sight blade
    dovetail_pts = [
        (11.50, P08_BORE_Y + 0.78),
        (11.96, P08_BORE_Y + 0.78),
        (11.90, P08_BORE_Y + 0.92),
        (11.56, P08_BORE_Y + 0.92),
    ]
    dovetail = make_extrude_z_three("sight_dovetail", dovetail_pts, -0.30, 0.30, bevel=0.018, bevel_segs=2)

    # Undercut anti-glare German triangular barleycorn sight blade (Dachkorn, apex Y = 3.30)
    blade_pts = [
        (11.40, P08_BORE_Y + 0.85),
        (12.02, P08_BORE_Y + 0.85),
        (11.91, P08_BORE_Y + 1.15),
        (11.82, P08_BORE_Y + 1.15),
        (11.46, P08_BORE_Y + 0.96),
    ]
    sight_blade = make_extrude_z_three("sight_blade", blade_pts, -0.095, 0.095, bevel=0.022, bevel_segs=2)

    barrel = bool_op(barrel, sight_base, "UNION")
    barrel = bool_op(barrel, dovetail, "UNION")
    barrel = bool_op(barrel, sight_blade, "UNION")

    # True 6-groove helical rifled bore cutter + 11-deg target muzzle crown
    bm_bore = bmesh.new()
    n_len, n_ang = 28, 48
    x_start, x_end = 3.65, 12.26
    rings = []
    for ix in range(n_len + 1):
        u = ix / n_len
        x = x_start + (x_end - x_start) * u
        twist = u * (8.4 / 25.0) * 2.0 * math.pi
        ring = []
        for ia in range(n_ang):
            a = (ia / n_ang) * 2.0 * math.pi
            groove = 1.0 if math.sin(6.0 * (a - twist)) > 0.12 else 0.0
            r = 0.442 + 0.022 * groove
            if x > 12.07:
                r = max(r, 0.442 + (x - 12.07) * 0.78)
            ring.append(bm_bore.verts.new(t2b(x, P08_BORE_Y + r * math.cos(a), r * math.sin(a))))
        rings.append(ring)
    for ix in range(n_len):
        for ia in range(n_ang):
            ian = (ia + 1) % n_ang
            bm_bore.faces.new((rings[ix][ia], rings[ix][ian], rings[ix + 1][ian], rings[ix + 1][ia]))
    v_c0 = bm_bore.verts.new(t2b(x_start, P08_BORE_Y, 0.0))
    v_c1 = bm_bore.verts.new(t2b(x_end, P08_BORE_Y, 0.0))
    for ia in range(n_ang):
        ian = (ia + 1) % n_ang
        bm_bore.faces.new((v_c0, rings[0][ian], rings[0][ia]))
        bm_bore.faces.new((v_c1, rings[-1][ia], rings[-1][ian]))
    bore_cutter = new_mesh_obj("bore_cutter", bm_bore)

    chamber_cutter = make_revolve_three(
        "chamber_cutter",
        [(0.0, 1.65), (0.505, 1.65), (0.495, 2.50), (0.474, 3.85), (0.448, 4.02), (0.0, 4.02)],
        axis="X",
        segments=40,
        center=(0.0, P08_BORE_Y, 0.0),
    )
    feed_ramp = make_box_three("feed_ramp", 0.60, 0.44, 0.54, center=(1.90, P08_BORE_Y - 0.42, 0.0), rot_three=(0.0, 0.0, 0.46))
    ext_cut = make_box_three("ext_cut", 0.46, 0.30, 0.26, center=(1.90, P08_BORE_Y + 0.52, 0.0))

    # Crisp 2-stage 11-deg recessed target muzzle crown dish (single watertight lathe cutter)
    crown_cutter = make_revolve_three(
        "crown_cutter",
        [
            (0.0, 12.01),
            (0.420, 12.01),
            (0.518, 12.145),
            (0.578, 12.192),
            (0.605, 12.26),
            (0.0, 12.26),
        ],
        axis="X",
        segments=56,
        center=(0.0, P08_BORE_Y, 0.0),
    )

    for c in (bore_cutter, crown_cutter, chamber_cutter, feed_ramp, ext_cut):
        barrel = bool_op(barrel, c, "DIFFERENCE")

    return finalize_hard_surface(barrel, bevel_width=0.018, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_barrel_extension() -> bpy.types.Object:
    """
    U-02: Sculpted Forked U-Channel Barrel Extension (Gabelgehaeuse):
      - Stepped rounded cylindrical chamber shoulders sweeping into flat '1917' top crest
        and crisp flat right flank for the 3 Imperial Crowned Proofs + Reichsadler!
      - Graceful concave step-down into recessed forked toggle train channel
      - Rounded concentric rear toggle axle ears & sculpted left sear-bar channel housing!
    """
    # Main forked receiver body (strictly Y >= 1.375 above frame top rail Y=1.36 -> crisp 0.15mm parting line!)
    pts: list[tuple[float, float]] = [
        (3.48, 1.375),
        (3.48, 2.98),
        (3.38, 3.09),  # Front chamber ring top crest ("1917")
        (1.62, 3.09),
    ]
    # Graceful concave saddle transition from chamber ring down into forked U-channel rails!
    pts.extend(sample_quad_bezier((1.62, 3.09), (1.42, 2.86), (1.18, 2.80), steps=8))
    pts.append((-8.86, 2.80))
    pts.extend(sample_quad_bezier((-8.86, 2.80), (-9.94, 2.80), (-9.94, 2.15), steps=20))
    pts.extend(sample_quad_bezier((-9.94, 2.15), (-9.94, 1.38), (-9.15, 1.38), steps=20))
    pts.append((3.48, 1.375))
    ext = make_extrude_z_three("p08_barrel_extension", pts, -1.02, 1.02, bevel=0.048, bevel_segs=3)

    # Sculpt rounded cylindrical Luger chamber ring upper shoulders (keeping Z=+-1.02 flat up to Y=2.66
    # so right-flank Imperial proofs have a 100% crisp un-sliced flat face, while upper corners curve!)
    for sz in (-1.0, 1.0):
        # Smooth multi-facet arched shoulder cut along upper edges of chamber ring (X in [1.34, 3.56])
        for ang_deg, dy_off, dz_off in ((28.0, 0.08, 0.06), (52.0, -0.02, -0.04)):
            ch_cut = make_box_three(
                "ch_arch_cut",
                2.28,
                0.42,
                0.44,
                center=(2.46, 3.16 + dy_off, sz * (1.06 + dz_off)),
                rot_three=(sz * math.radians(ang_deg), 0.0, 0.0),
            )
            ext = bool_op(ext, ch_cut, "DIFFERENCE")

    # Subtle authentic recessed toggle-train rail outer shoulder bevel along forked arms (X in [-8.7, +1.1])
    for sz in (-1.0, 1.0):
        rail_chamf = make_box_three(
            "rail_ch",
            9.60,
            0.22,
            0.22,
            center=(-3.80, 2.88, sz * 1.08),
            rot_three=(sz * math.radians(45.0), 0.0, 0.0),
        )
        ext = bool_op(ext, rail_chamf, "DIFFERENCE")

    # Internal lower guide-rail tongue (Z in [-0.60, +0.60]) riding cleanly inside frame raceway
    guide_tongue = make_box_three(
        "guide_tongue", 4.10, 0.44, 1.20, center=(0.55, 1.24, 0.0), bevel=0.03, bevel_segs=2
    )
    # Sculpted left-flank external sear-bar housing rail with smoothly rounded ends
    sear_pts = rounded_polygon_2d(
        [
            (-4.15, 1.80, 0.14),
            (0.45, 1.80, 0.14),
            (0.45, 2.36, 0.14),
            (-4.15, 2.36, 0.14),
        ],
        arc_steps=6,
    )
    sear_housing = make_extrude_z_three("sear_housing", sear_pts, -1.18, -0.88, bevel=0.042, bevel_segs=3)
    # Lower recoil lug / takedown-cam foot beneath chamber ring
    recoil_foot = make_box_three(
        "recoil_foot", 1.55, 0.44, 0.72, center=(2.15, 1.04, 0.0), bevel=0.04, bevel_segs=3
    )
    for u_part in (guide_tongue, sear_housing, recoil_foot):
        ext = bool_op(ext, u_part, "UNION")

    # Subtract internal forked U-channel, magazine clearance, barrel thread bore, axle bore, sear & ejector grooves
    cutters = [
        make_box_three("u_chan", 11.88, 1.98, 1.26, center=(-4.25, 2.43, 0.0)),
        make_box_three("mag_clear", 3.85, 0.88, 1.12, center=(-0.75, 1.22, 0.0)),
        make_cylinder_three("bbl_bore", 0.79, 0.79, 2.30, axis="X", center=(2.56, P08_BORE_Y, 0.0), segments=48),
        make_cylinder_three("axle_bore", 0.242, 0.242, 2.40, axis="Z", center=(P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), segments=48),
        make_box_three("sear_grv", 4.46, 0.34, 0.28, center=(-1.85, 2.08, -1.09)),
        make_box_three("ej_slot", 3.15, 0.32, 0.26, center=(-1.15, 2.02, 0.74)),
    ]
    for c in cutters:
        ext = bool_op(ext, c, "DIFFERENCE")

    # Clean vertical edge bisect at X = 1.44 so the right chamber flank (X in [1.44, 3.48]) is a 100%
    # intact rectangular UV patch for all 4 Imperial German proofs (zero diagonal triangle clipping!)
    bm_bi = bmesh.new()
    bm_bi.from_mesh(ext.data)
    bmesh.ops.bisect_plane(
        bm_bi,
        geom=list(bm_bi.verts) + list(bm_bi.edges) + list(bm_bi.faces),
        plane_co=(1.44, 0.0, 0.0),
        plane_no=(1.0, 0.0, 0.0),
    )
    bm_bi.to_mesh(ext.data)
    bm_bi.free()

    return finalize_hard_surface(ext, bevel_width=0.024, bevel_segments=3, bevel_angle_deg=34.0, lock_flat_walls=True)


def build_p08_breechblock() -> bpy.types.Object:
    """U-03: Crisp Bright-White Milled Rectangular Sliding Breechblock (Verschlussstueck)."""
    body = make_box_three(
        "p08_breechblock", 2.68, 1.22, 1.16, center=(0.66, P08_BORE_Y, 0.0), bevel=0.052, bevel_segs=3
    )
    strip_rib = make_box_three(
        "strip_rib", 2.15, 0.28, 0.42, center=(0.88, P08_BORE_Y - 0.65, 0.0), bevel=0.035, bevel_segs=3
    )
    body = bool_op(body, strip_rib, "UNION")

    cutters = [
        make_box_three("clevis", 1.06, 0.94, 0.56, center=(-0.22, P08_BORE_Y, 0.0)),
        make_box_three("ext_ch", 2.28, 0.36, 0.36, center=(0.92, P08_BORE_Y + 0.52, 0.0)),
        make_cylinder_three("str_bore", 0.25, 0.25, 2.52, axis="X", center=(0.58, P08_BORE_Y, 0.0), segments=32),
        make_cylinder_three("fp_hole", 0.09, 0.09, 0.50, axis="X", center=(1.88, P08_BORE_Y, 0.0), segments=20),
        make_cylinder_three("bolt_face", 0.51, 0.51, 0.14, axis="X", center=(1.98, P08_BORE_Y, 0.0), segments=36),
        make_box_three("ej_grv", 2.78, 0.24, 0.22, center=(0.66, P08_BORE_Y - 0.12, 0.52)),
        make_box_three("sear_win", 1.35, 0.26, 0.28, center=(0.22, P08_BORE_Y - 0.06, -0.48)),
    ]
    for c in cutters:
        body = bool_op(body, c, "DIFFERENCE")

    pin_boss = make_cylinder_three(
        "front_pin_boss", 0.158, 0.158, 1.14, axis="Z", center=(P08_FRONT_PIN_X0, P08_BORE_Y, 0.0), segments=28, bevel_caps=0.02
    )
    body = bool_op(body, pin_boss, "UNION")
    return finalize_hard_surface(body, bevel_width=0.022, bevel_segments=2, bevel_angle_deg=35.0)


def build_p08_extractor() -> bpy.types.Object:
    """U-04: Top-Pivoting Extractor & 'GELADEN' Loaded-Chamber Indicator (Auszieher)."""
    pts = [
        (-1.02, -0.10),
        (0.84, -0.10),
        (0.92, -0.24),  # Front rim hook claw
        (1.08, -0.24),
        (1.05, 0.06),
        (0.42, 0.19),   # Raised tactile GELADEN step
        (-0.38, 0.19),
        (-0.54, 0.06),
        (-1.02, 0.04),
    ]
    bar = make_extrude_z_three("p08_extractor", pts, -0.15, 0.15, bevel=0.012, bevel_segs=2)
    pin = make_cylinder_three("ext_pin", 0.065, 0.065, 0.40, axis="Z", center=(-0.12, -0.02, 0.0), segments=20, bevel_caps=0.012)
    bar = bool_op(bar, pin, "UNION")
    # Clean bisect planes isolating the raised tactile GELADEN step into a 100% pure flat rectangle!
    bm_ex = bmesh.new()
    bm_ex.from_mesh(bar.data)
    for co, no in (((-0.38, 0.0, 0.0), (1.0, 0.0, 0.0)), ((0.42, 0.0, 0.0), (1.0, 0.0, 0.0)), ((0.0, 0.0, 0.06), (0.0, 0.0, 1.0))):
        bmesh.ops.bisect_plane(
            bm_ex,
            geom=list(bm_ex.verts) + list(bm_ex.edges) + list(bm_ex.faces),
            plane_co=co,
            plane_no=no,
        )
    bm_ex.to_mesh(bar.data)
    bm_ex.free()
    return finalize_hard_surface(bar, bevel_width=0.0, use_bevel=False)


def build_p08_front_toggle() -> bpy.types.Object:
    """U-05: Articulated Front Toggle Link (Vordergelenk) w/ flat 'DWM' deck & striker-cocking toe."""
    kx = -P08_KNEE_LOCAL_DX
    ky = P08_KNEE_LOCAL_DY

    pts: list[tuple[float, float]] = [(0.42, -0.32), (0.44, 0.28)]
    pts.extend(sample_quad_bezier((0.44, 0.28), (0.22, 0.56), (-0.28, 0.58), steps=8))
    pts.append((kx + 0.48, 0.58))
    pts.extend(sample_quad_bezier((kx + 0.48, 0.58), (kx - 0.52, 0.54), (kx - 0.52, ky), steps=10))
    pts.extend(sample_quad_bezier((kx - 0.52, ky), (kx - 0.52, ky - 0.48), (kx + 0.35, ky - 0.46), steps=10))
    pts.extend([(-0.55, -0.36), (-0.18, -0.52)])
    link = make_extrude_z_three("p08_front_toggle", pts, -0.54, 0.54, bevel=0.046, bevel_segs=3)

    # Authentic rounded-end side lightening flutes (clean flat cutter -> zero bevel slivers!)
    for sz in (-1.0, 1.0):
        flute_pts = rounded_polygon_2d(
            [(-3.55, -0.13, 0.11), (-1.12, -0.13, 0.11), (-1.12, 0.21, 0.11), (-3.55, 0.21, 0.11)],
            arc_steps=5,
        )
        flute = make_extrude_z_three("flute", flute_pts, sz * 0.46, sz * 0.68, bevel=0.0)
        link = bool_op(link, flute, "DIFFERENCE")

    cutters = [
        make_box_three("ft_r", 1.18, 1.32, 0.34, center=(0.12, 0.0, 0.44)),
        make_box_three("ft_l", 1.18, 1.32, 0.34, center=(0.12, 0.0, -0.44)),
        make_box_three("knee_slot", 1.25, 1.32, 0.50, center=(kx - 0.05, ky, 0.0)),
        make_cylinder_three("pin_f", 0.165, 0.165, 1.40, axis="Z", center=(0.0, 0.0, 0.0), segments=28),
        make_cylinder_three("pin_k", 0.210, 0.210, 1.40, axis="Z", center=(kx, ky, 0.0), segments=32),
    ]
    for c in cutters:
        link = bool_op(link, c, "DIFFERENCE")

    return finalize_hard_surface(link, bevel_width=0.025, bevel_segments=3, bevel_angle_deg=34.0)


def build_p08_rear_toggle() -> bpy.types.Object:
    """
    U-06: Articulated Rear Toggle Link (Hintergelenk) — iconic Luger centerpiece!
      - Flawless artifact-free spherical concave finger cups (zero radial shading smudges!)
      - Dense interlocking 40x6 3D diamond knurling pyramids catching crisp bare-steel wear glints
      - Sculpted integral V-notch rear sight (Kimme) & S-link hook lug!
    """
    kx = P08_KNEE_LOCAL_DX
    ky = P08_KNEE_LOCAL_DY

    pts: list[tuple[float, float]] = [(-0.50, -0.44)]
    pts.extend(sample_quad_bezier((-0.50, -0.44), (-0.54, 0.52), (-0.05, 0.72), steps=10))
    pts.extend([
        (0.22, 1.07),
        (0.58, 1.07),
        (0.88, 0.62),
        (kx - 0.45, 0.56),
    ])
    pts.extend(sample_quad_bezier((kx - 0.45, 0.56), (kx + 0.48, 0.52), (kx + 0.48, ky), steps=10))
    pts.extend(sample_quad_bezier((kx + 0.48, ky), (kx + 0.48, ky - 0.46), (kx - 0.35, ky - 0.44), steps=10))
    pts.extend([(0.35, -0.42), (-0.12, -0.58)])
    bridge = make_extrude_z_three("p08_rear_toggle", pts, -0.56, 0.56, bevel=0.046, bevel_segs=3)

    # Trim front knee tongue, V-notch rear sight & exact hinge bores FIRST on bridge
    cutters = [
        make_box_three("kt_r", 1.30, 1.32, 0.42, center=(kx + 0.02, ky, 0.45)),
        make_box_three("kt_l", 1.30, 1.32, 0.42, center=(kx + 0.02, ky, -0.45)),
        make_box_three("v_notch", 0.68, 0.28, 0.28, center=(0.40, 1.13, 0.0), rot_three=(math.pi * 0.25, 0.0, 0.0)),
        make_cylinder_three("rear_bore", 0.242, 0.242, 1.50, axis="Z", center=(0.0, 0.0, 0.0), segments=36),
        make_cylinder_three("knee_bore", 0.210, 0.210, 1.50, axis="Z", center=(kx, ky, 0.0), segments=36),
    ]
    for c in cutters:
        bridge = bool_op(bridge, c, "DIFFERENCE")
    bridge = finalize_hard_surface(bridge, bevel_width=0.024, bevel_segments=3, bevel_angle_deg=34.0)

    # Build twin circular toggle gripping drums (Spannstuecke) cleanly with 72 radial segments &
    # smooth analytical cosine-spherical concave dishes (NO WeightedNormal N-gon smudge -> 100% clean optics!)
    def build_toggle_drum(sign_z: float) -> bpy.types.Object:
        z_in = 0.48
        z_outer = 1.48
        prof = [
            (0.0, z_in),
            (0.58, z_in),
            (0.75, 0.60),
            (0.848, 0.68),
            (0.848, 1.36),
            (0.822, 1.425),
            (0.775, 1.466),
            (0.725, z_outer),
            (0.650, z_outer),
        ]
        # Smooth analytical concave spherical finger dish (18 concentric quad rings, dz/dr = 0 at rim & center pole!)
        z_floor = z_outer - 0.195
        for k in range(1, 18):
            u = k / 18.0
            r = 0.650 * (1.0 - u)
            depth_t = 0.5 * (1.0 - math.cos(u * math.pi))
            prof.append((r, z_outer - 0.195 * depth_t))
        prof.append((0.0, z_floor))
        if sign_z < 0:
            prof = [(r, -z) for (r, z) in reversed(prof)]

        bm_d = bmesh.new()
        seg_d = 72
        rings_d: list[list[bmesh.types.BMVert] | bmesh.types.BMVert] = []
        for r, coord in prof:
            if r <= 1e-6:
                rings_d.append(bm_d.verts.new((0.0, 0.0, coord)))
            else:
                ring = [
                    bm_d.verts.new((r * math.cos(2.0 * math.pi * s / seg_d), r * math.sin(2.0 * math.pi * s / seg_d), coord))
                    for s in range(seg_d)
                ]
                rings_d.append(ring)
        for i in range(len(rings_d) - 1):
            r0, r1 = rings_d[i], rings_d[i + 1]
            if isinstance(r0, list) and isinstance(r1, list):
                for s in range(seg_d):
                    sn = (s + 1) % seg_d
                    bm_d.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            elif isinstance(r0, bmesh.types.BMVert) and isinstance(r1, list):
                for s in range(seg_d):
                    sn = (s + 1) % seg_d
                    bm_d.faces.new((r0, r1[sn], r1[s]))
            elif isinstance(r0, list) and isinstance(r1, bmesh.types.BMVert):
                for s in range(seg_d):
                    sn = (s + 1) % seg_d
                    bm_d.faces.new((r0[s], r0[sn], r1))
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "X")
        bmesh.ops.transform(bm_d, matrix=mat_three_translate(3.30, 0.26, 0.0) @ axis_m, verts=bm_d.verts)
        drum = new_mesh_obj(f"drum_{'R' if sign_z > 0 else 'L'}", bm_d)
        # Skip WeightedNormal on exact analytical revolution dish so radial curvature stays mirror-smooth!
        drum = finalize_hard_surface(drum, bevel_width=0.0, use_bevel=False, sharp_deg=32.0, use_weighted_normals=False)
        return drum

    left_drum = build_toggle_drum(-1.0)
    right_drum = build_toggle_drum(+1.0)
    vg_dish_l = left_drum.vertex_groups.new(name="toggle_drum_l")
    vg_dish_l.add(list(range(len(left_drum.data.vertices))), 1.0, "REPLACE")
    vg_dish_r = right_drum.vertex_groups.new(name="toggle_drum_r")
    vg_dish_r.add(list(range(len(right_drum.data.vertices))), 1.0, "REPLACE")

    # Deep interlocking Swiss-watch 3D diamond knurling pyramids (40 cols x 7 rows x 2 drums!)
    bm_k = bmesh.new()
    n_cols = 40
    n_rows = 7
    z_band_min, z_band_max = 0.695, 1.345
    dz = (z_band_max - z_band_min) / n_rows
    r_base = 0.830
    r_peak = 0.888
    da = (2.0 * math.pi) / n_cols
    for sign_z in (-1.0, 1.0):
        for row in range(n_rows):
            zc = sign_z * (z_band_min + (row + 0.5) * dz)
            a_shift = (0.5 * da) if (row % 2 == 1) else 0.0
            for col in range(n_cols):
                ac = col * da + a_shift
                a0, a1 = ac - da * 0.49, ac + da * 0.49
                za, zb = zc - dz * 0.49, zc + dz * 0.49

                def pt(rr: float, aa: float, zz: float) -> Vector:
                    return t2b(3.30 + rr * math.cos(aa), 0.26 + rr * math.sin(aa), zz)

                v_n = bm_k.verts.new(pt(r_base, ac, zb))
                v_s = bm_k.verts.new(pt(r_base, ac, za))
                v_e = bm_k.verts.new(pt(r_base, a1, zc))
                v_w = bm_k.verts.new(pt(r_base, a0, zc))
                da_t, dz_t = da * 0.12, dz * 0.12
                t_n = bm_k.verts.new(pt(r_peak, ac, zc + dz_t))
                t_s = bm_k.verts.new(pt(r_peak, ac, zc - dz_t))
                t_e = bm_k.verts.new(pt(r_peak, ac + da_t, zc))
                t_w = bm_k.verts.new(pt(r_peak, ac - da_t, zc))

                bm_k.faces.new((t_n, t_e, t_s, t_w))
                bm_k.faces.new((v_n, v_e, t_e, t_n))
                bm_k.faces.new((v_e, v_s, t_s, t_e))
                bm_k.faces.new((v_s, v_w, t_w, t_s))
                bm_k.faces.new((v_w, v_n, t_n, t_w))
                bm_k.faces.new((v_w, v_s, v_e, v_n))

    knurl_obj = new_mesh_obj("knurl_teeth", bm_k)
    knurl_obj = finalize_hard_surface(knurl_obj, bevel_width=0.0, use_bevel=False, sharp_deg=26.0)
    vg_knurl = knurl_obj.vertex_groups.new(name="knurl_teeth")
    vg_knurl.add(list(range(len(knurl_obj.data.vertices))), 1.0, "REPLACE")

    join_objects(bridge, [left_drum, right_drum, knurl_obj])
    return bridge


def build_p08_toggle_pins() -> bpy.types.Object:
    """U-07: CNC-Turned Bright White-Steel Rear Cross-Axle Pin & Center Knee-Joint Pin."""
    kx = P08_KNEE_LOCAL_DX
    ky = P08_KNEE_LOCAL_DY
    rear_pin = make_revolve_three(
        "p08_toggle_pins",
        [
            (0.0, -1.06), (0.165, -1.06), (0.205, -1.045), (0.235, -1.005),
            (0.235, 0.94), (0.305, 0.955), (0.320, 0.975), (0.320, 1.040),
            (0.308, 1.062), (0.285, 1.076), (0.250, 1.080), (0.120, 1.080), (0.0, 1.080),
        ],
        axis="Z",
        segments=64,
    )
    knee_pin = make_revolve_three(
        "knee_pin",
        [
            (0.08, -0.59), (0.165, -0.59), (0.195, -0.57), (0.205, -0.54),
            (0.205, 0.51), (0.268, 0.525), (0.280, 0.545), (0.280, 0.595),
            (0.265, 0.614), (0.240, 0.620), (0.08, 0.620), (0.08, -0.59),
        ],
        axis="Z",
        segments=64,
        center=(kx, ky, 0.0),
    )
    join_objects(rear_pin, [knee_pin])
    return finalize_hard_surface(rear_pin, bevel_width=0.0, use_bevel=False)


def build_p08_striker() -> bpy.types.Object:
    """U-08: Bright White-Steel 3-Flute Gas-Vented Hollow Cylindrical Striker (Schlagbolzen)."""
    tube = make_revolve_three(
        "p08_striker",
        [
            (0.145, -0.92), (0.225, -0.92), (0.225, 0.68), (0.160, 0.82),
            (0.072, 1.38), (0.052, 1.59), (0.025, 1.62), (0.0, 1.62),
            (0.0, 0.55), (0.145, 0.48), (0.145, -0.92),
        ],
        axis="X",
        segments=36,
    )
    for k in range(3):
        a = (k * 2.0 * math.pi) / 3.0 + 0.35
        flute = make_cylinder_three(
            f"flute_{k}", 0.052, 0.052, 1.30, axis="X",
            center=(-0.08, math.cos(a) * 0.22, math.sin(a) * 0.22), segments=16, bevel_caps=0.04,
        )
        tube = bool_op(tube, flute, "DIFFERENCE")
    sear_lug = make_box_three("sear_lug", 0.36, 0.22, 0.24, center=(-0.22, -0.05, -0.28), bevel=0.028, bevel_segs=2)
    tube = bool_op(tube, sear_lug, "UNION")
    return finalize_hard_surface(tube, bevel_width=0.012, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_frame() -> bpy.types.Object:
    """
    F-01: Masterpiece Single-Piece Sculpted 1917 DWM Forged Curved-Ramp Frame (Griffstueck)!
    Eliminates the boxy v1 rectangular grip slab & flat pancake frame completely:
      - ONE seamless continuous Bezier silhouette from rear cam ramps -> deep concave thumb web
        -> gracefully curved ergonomic backstrap -> tapered rounded butt heel -> smoothly curved
        frontstrap -> organic knuckle arch -> variable-section sculpted curved trigger guard ->
        arched front dust-cover chin! (ZERO diagonal seam crease between upper frame & grip!)
      - True 3D rounded D-profile steel frontstrap & backstrap (carved via swept corner-rounding
        cutters so both straps feel organically cylindrical in 3/4 & profile views!)
      - Authentic sculpted side-frame machined lightening contours & beveled rail shoulders!
      - Recessed circular rear lanyard loop (Fangriemenoese) & T-dovetail stock lug!
      - Real 3D diamond-checkered 240-deg-C Straw-Gold magazine release button on left flank!
      - Graceful curved fan-sector 'GESICHERT' safety recess & snug sideplate mortise!
    """
    # 1. ONE UNIFIED SEAMLESS FORGED SILHOUETTE (upper receiver + concave thumb web + curved grip!)
    frame_pts: list[tuple[float, float]] = [
        (3.10, 1.36),
        (-8.25, 1.36),
    ]
    # Iconic twin curved rear unlocking ramps (Kurvenstuecke)
    frame_pts.extend(sample_quad_bezier((-8.25, 1.36), (-9.06, 1.46), (-9.62, 2.56), steps=16))
    frame_pts.append((-10.00, 2.48))  # Exact OAL datum X_min = -10.00 cm
    # Swept rear tang flowing smoothly into DEEP CONCAVE THUMB WEB!
    frame_pts.extend(sample_cubic_bezier((-10.00, 2.48), (-10.02, 1.42), (-9.38, 0.78), (-8.52, 0.42), steps=14))
    p_bs_top = grip_world_xy(eval_backstrap_sf(2.90), 2.90)
    frame_pts.extend(sample_cubic_bezier((-8.52, 0.42), (-7.20, 0.08), (-5.88, -0.35), p_bs_top, steps=16))

    # Graceful curved ergonomic Luger backstrap sweeping smoothly down to lower heel
    n_strap = 26
    for i in range(1, n_strap + 1):
        su = 2.90 + (-4.42 - 2.90) * (i / n_strap)
        frame_pts.append(grip_world_xy(eval_backstrap_sf(su), su))

    # Rounded rear heel around stock lug tapering cleanly into bottom magazine well rim (-7.22, -9.55)!
    p_bs_end = grip_world_xy(eval_backstrap_sf(-4.42), -4.42)
    p_heel_tip = (-9.78, -7.82)
    p_mag_rim_r = (-8.52, -8.82)
    p_mag_rim_f = (-7.22, -9.55)  # Exact Y_min datum = -9.55 cm
    p_fs_bot = grip_world_xy(eval_frontstrap_sf(-4.48), -4.48)
    frame_pts.extend(sample_quad_bezier(p_bs_end, (-9.94, -7.35), p_heel_tip, steps=8))
    frame_pts.extend(sample_quad_bezier(p_heel_tip, (-9.48, -8.42), p_mag_rim_r, steps=8))
    frame_pts.append(p_mag_rim_f)
    frame_pts.extend(sample_quad_bezier(p_mag_rim_f, (-6.82, -9.46), p_fs_bot, steps=6))

    # Smoothly tapered ergonomic frontstrap rising seamlessly into rounded knuckle arch behind trigger guard!
    for i in range(1, n_strap + 1):
        su = -4.48 + (4.22 - (-4.48)) * (i / n_strap)
        frame_pts.append(grip_world_xy(eval_frontstrap_sf(su), su))

    p_fs_top = grip_world_xy(eval_frontstrap_sf(4.22), 4.22)
    # Sculpted rounded frame-to-trigger-guard knuckle arch & curved dust-cover chin!
    frame_pts.extend(sample_cubic_bezier(p_fs_top, (-1.15, -1.58), (-0.82, -0.58), (-0.42, 0.16), steps=12))
    frame_pts.extend(sample_quad_bezier((-0.42, 0.16), (-0.18, 0.30), (0.35, 0.30), steps=6))
    frame_pts.append((2.28, 0.30))
    frame_pts.extend(sample_quad_bezier((2.28, 0.30), (2.78, 0.32), (3.10, 0.50), steps=8))

    frame = make_extrude_z_three("p08_frame", frame_pts, -1.01, 1.01, bevel=0.052, bevel_segs=3)

    # 2. TRUE 3D ROUNDED ERGONOMIC FRONTSTRAP & BACKSTRAP (sculpted D-section via swept edge-rounding cutters!)
    # Carves lush 3.2 mm rounded bevels along both curved grip straps so they look genuinely forged & cylindrical!
    def build_strap_round_cutter(is_front: bool, sign_z: float) -> bpy.types.Object:
        bm = bmesh.new()
        n_st = 28
        su0, su1 = (-4.15, 3.85) if is_front else (-4.05, 2.75)
        rings = []
        for i in range(n_st + 1):
            t = i / n_st
            su = su0 + (su1 - su0) * t
            sf = eval_frontstrap_sf(su) if is_front else eval_backstrap_sf(su)
            # Smoothly taper rounding depth to 0 near upper frame belly & heel so transition is liquid-smooth!
            taper_top = 1.0 - _smoothstep_scalar(0.80, 1.0, t)
            taper_bot = _smoothstep_scalar(0.0, 0.12, t)
            depth = 0.25 * (0.20 + 0.80 * taper_top * taper_bot)
            sign_sf = 1.0 if is_front else -1.0
            # Triangular-concave chamfer prism positioned on outer corner of strap
            p0 = (sf + sign_sf * 0.22, su, sign_z * 1.18)
            p1 = (sf + sign_sf * 0.22, su, sign_z * (1.01 - depth * 1.12))
            p2 = (sf - sign_sf * (depth * 0.92), su, sign_z * 1.18)
            # Smooth arc across the cut hypotenuse so the resulting steel strap is CONVEXLY ROUNDED!
            pts_ring = [p0, p1]
            for k in range(1, 5):
                a = (k / 5.0) * (math.pi * 0.5)
                csf = sf - sign_sf * (depth * 0.92) * (1.0 - math.cos(a))
                cz = sign_z * (1.01 - depth * 1.12 * (1.0 - math.sin(a)))
                pts_ring.append((csf, su, cz))
            pts_ring.append(p2)
            ring_v = []
            for psf, psu, pz in pts_ring:
                wx, wy = grip_world_xy(psf, psu)
                ring_v.append(bm.verts.new(t2b(wx, wy, pz)))
            rings.append(ring_v)
        m = len(rings[0])
        for i in range(n_st):
            for s in range(m):
                sn = (s + 1) % m
                bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        return new_mesh_obj(f"strap_rnd_{'F' if is_front else 'B'}_{int(sign_z)}", bm)

    for is_front in (True, False):
        for sz in (-1.0, 1.0):
            frame = bool_op(frame, build_strap_round_cutter(is_front, sz), "DIFFERENCE")

    # Sculpted curved gooseneck chin taper along bottom front dust-cover edges
    for sz in (-1.0, 1.0):
        chin_cut = make_box_three(
            "chin_cut", 1.85, 0.56, 0.36, center=(2.58, 0.22, sz * 1.02), rot_three=(sz * 0.50, 0.0, 0.0)
        )
        frame = bool_op(frame, chin_cut, "DIFFERENCE")

    # 3. AUTHENTIC LUGER SIDE-FRAME MACHINED LIGHTENING CONTOURS (breaks up flat frame slabs!)
    # Right-flank sculpted lower-belly lightening step curving gracefully around trigger-guard boss & tang!
    right_contour_pts: list[tuple[float, float]] = [(-8.60, 0.96), (2.75, 0.96), (2.75, 0.44)]
    right_contour_pts.extend(sample_quad_bezier((2.75, 0.44), (1.95, 0.36), (1.35, 0.36), steps=6))
    right_contour_pts.extend(sample_quad_bezier((1.35, 0.36), (-0.45, 0.36), (-1.12, -0.35), steps=10))
    right_contour_pts.extend(sample_quad_bezier((-1.12, -0.35), (-2.35, -1.05), (-4.40, -0.68), steps=10))
    right_contour_pts.extend(sample_quad_bezier((-4.40, -0.68), (-7.20, -0.10), (-8.90, 0.65), steps=10))
    right_contour_pts.append((-8.60, 0.96))
    right_relief = make_extrude_z_three("right_frame_relief", right_contour_pts, 0.948, 1.15, bevel=0.042, bevel_segs=3)
    frame = bool_op(frame, right_relief, "DIFFERENCE")

    # Left-flank matching mid-frame lightening contour cleanly aft of sideplate & safely inside cheek!
    left_contour_pts: list[tuple[float, float]] = [(-5.80, 0.96), (-0.52, 0.96), (-0.52, 0.34)]
    left_contour_pts.extend(sample_quad_bezier((-0.52, 0.34), (-1.20, -0.30), (-2.55, -0.78), steps=8))
    left_contour_pts.extend(sample_quad_bezier((-2.55, -0.78), (-4.25, -0.58), (-5.80, -0.10), steps=8))
    left_contour_pts.append((-5.80, 0.96))
    left_relief = make_extrude_z_three("left_frame_relief", left_contour_pts, -1.15, -0.948, bevel=0.040, bevel_segs=3)
    frame = bool_op(frame, left_relief, "DIFFERENCE")

    # 4. SCULPTED ORGANIC CURVED TRIGGER GUARD (variable cross-section flaring seamlessly into BOTH roots!)
    tg_centerline: list[tuple[float, float]] = []
    tg_centerline.extend(
        sample_cubic_bezier((-1.42, -1.10), (-1.22, -1.96), (-0.42, -2.06), (0.38, -2.06), steps=18, include_start=True)
    )
    tg_centerline.extend(
        sample_cubic_bezier((0.38, -2.06), (1.42, -2.06), (2.06, -1.45), (2.14, 0.36), steps=18, include_start=False)
    )

    def tg_rx(t: float) -> float:
        # Thick sculpted organic flares at rear knuckle (t->0) and front dust-cover chin (t->1)!
        flare_r = 0.14 * ((1.0 - _smoothstep_scalar(0.0, 0.22, t)) ** 1.5)
        flare_f = 0.12 * (_smoothstep_scalar(0.80, 1.0, t) ** 1.5)
        return 0.190 + flare_r + flare_f

    def tg_rz(t: float) -> float:
        flare_r = 0.24 * ((1.0 - _smoothstep_scalar(0.0, 0.24, t)) ** 1.4)
        flare_f = 0.20 * (_smoothstep_scalar(0.78, 1.0, t) ** 1.4)
        return 0.495 + flare_r + flare_f

    tg_bow = make_swept_tube_three("tg_bow", tg_centerline, tg_rx, tg_rz, sec_n=20, super_exp=0.76)
    frame = bool_op(frame, tg_bow, "UNION")

    # 5. RECESSED CIRCULAR REAR LANYARD LOOP (Fangriemenoese) & T-DOVETAIL STOCK LUG (Anschlagkolben-Warze)
    # Stock lug on lower backstrap w/ authentic left/right dovetail guide grooves
    lug_cx, lug_cy = grip_world_xy(-2.14, -3.50)
    stock_lug = make_box_three(
        "stock_lug", 0.56, 1.50, 0.90, center=(lug_cx, lug_cy, 0.0),
        rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD), bevel=0.045, bevel_segs=3,
    )
    for sz in (-1.0, 1.0):
        dt_grv = make_box_three(
            "lug_dt", 0.20, 1.60, 0.16, center=(lug_cx, lug_cy, sz * 0.44),
            rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD),
        )
        stock_lug = bool_op(stock_lug, dt_grv, "DIFFERENCE")
    frame = bool_op(frame, stock_lug, "UNION")

    # Sculpted recessed circular rear lanyard loop arch directly above stock lug!
    lan_cx, lan_cy = grip_world_xy(-2.16, -2.32)
    lan_arch = make_cylinder_three(
        "lanyard_arch", 0.32, 0.32, 0.44, axis="Z", center=(lan_cx, lan_cy, 0.0), segments=32, bevel_caps=0.052
    )
    lan_hole = make_cylinder_three(
        "lanyard_hole", 0.140, 0.140, 0.64, axis="Z", center=(lan_cx - 0.04, lan_cy + 0.02, 0.0), segments=24
    )
    lan_arch = bool_op(lan_arch, lan_hole, "DIFFERENCE")
    frame = bool_op(frame, lan_arch, "UNION")

    # Subtle machined boss ring cradling the left magazine release button at (-2.05, -0.82)
    mag_boss = make_cylinder_three(
        "mag_boss", 0.41, 0.39, 0.26, axis="Z", center=(-2.05, -0.82, -0.94), segments=32, bevel_caps=0.035
    )
    frame = bool_op(frame, mag_boss, "UNION")

    # 6. PRECISION INTERNAL CUTOUTS & CURVED GRIP BEDDING POCKETS
    mag_well = make_box_three(
        "mag_well", 2.68, 12.6, 1.42, center=(-4.45, -3.30, 0.0), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD)
    )
    recoil_tunnel = make_cylinder_three(
        "recoil_tunnel", 0.45, 0.45, 8.20, axis="Y", center=(-7.15, -4.55, 0.0),
        segments=28, rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD),
    )

    # Curved organic grip-panel bedding recesses (strictly inside rounded frontstrap & backstrap,
    # keeping solid steel mag-well cheek walls |Z|=0.80 > mag_well |Z|=0.71 -> ZERO exposed magazine!)
    def build_curved_grip_pocket(sign_z: float) -> bpy.types.Object:
        poly_xy = []
        n_e = 20
        # Bottom -> right -> top -> left following exact panel contour inset by 0.04 cm
        for i in range(n_e):
            u = -1.0 + 2.0 * (i / n_e)
            poly_xy.append(grip_world_xy(*eval_grip_panel_sf_su(u, -0.98)))
        for i in range(n_e):
            v = -0.98 + 1.96 * (i / n_e)
            poly_xy.append(grip_world_xy(*eval_grip_panel_sf_su(0.98, v)))
        for i in range(n_e):
            u = 0.98 - 1.96 * (i / n_e)
            poly_xy.append(grip_world_xy(*eval_grip_panel_sf_su(u, 0.98)))
        for i in range(n_e):
            v = 0.98 - 1.96 * (i / n_e)
            poly_xy.append(grip_world_xy(*eval_grip_panel_sf_su(-0.98, v)))
        z0, z1 = (0.80, 1.25) if sign_z > 0 else (-1.25, -0.80)
        return make_extrude_z_three(f"grip_pkt_{int(sign_z)}", poly_xy, z0, z1)

    # Graceful curved fan-sector milled recess for thumb safety & "GESICHERT" (replaces ugly square box!)
    sec_pts = [(-7.35, 0.42)]
    for i in range(18):
        ang = math.radians(10.0 + 114.0 * (i / 17.0))
        r = 1.42 if i > 3 else 1.25
        sec_pts.append((-7.35 + r * math.cos(ang), 0.42 + r * math.sin(ang)))
    # Include clean flat rectangular upper-left bed for crisp "GESICHERT" text
    sec_pts.extend([(-8.12, 1.18), (-6.12, 1.18), (-6.12, 0.56)])
    # Use clean rounded sector box covering safety swing arc
    safety_poly = rounded_polygon_2d(
        [
            (-8.36, 1.22, 0.22),
            (-6.12, 1.22, 0.16),
            (-6.12, 0.44, 0.24),
            (-7.42, 0.22, 0.28),
            (-8.52, 0.88, 0.26),
        ],
        arc_steps=6,
    )
    safety_recess = make_extrude_z_three("safety_recess", safety_poly, -1.16, -0.86, bevel=0.025, bevel_segs=2)
    # Hidden internal channel for thumb-safety blocking bar strictly BEHIND -0.86 recess back wall!
    safety_bar_slot = make_box_three("safety_bar_slot", 2.55, 0.24, 0.22, center=(-6.22, 1.08, -0.66))

    # Snug arched sideplate mortise matching sculpted arched p08_sideplate
    sp_mort_pts = rounded_polygon_2d(
        [
            (-0.08, 0.38, 0.08),
            (2.22, 0.38, 0.12),
            (2.80, 0.82, 0.14),
            (2.80, 1.56, 0.06),
            (-0.08, 1.60, 0.06),
        ],
        arc_steps=6,
    )
    sideplate_mort = make_extrude_z_three("sideplate_mort", sp_mort_pts, -1.14, -0.66)

    cutters = [
        make_box_three("upper_race", 13.02, 2.20, 1.28, center=(-3.69, 1.75, 0.0)),
        make_box_three("s_slot", 2.20, 3.80, 0.68, center=(-7.85, 0.15, 0.0)),
        sideplate_mort,
        make_box_three("trig_slot", 1.28, 1.05, 0.64, center=(0.55, 0.12, 0.0)),
        safety_recess,
        safety_bar_slot,
        make_cylinder_three("td_bore", 0.175, 0.175, 1.30, axis="Z", center=(2.55, 0.48, -0.50), segments=24),
        mag_well,
        recoil_tunnel,
        build_curved_grip_pocket(-1.0),
        build_curved_grip_pocket(+1.0),
    ]
    for c in cutters:
        frame = bool_op(frame, c, "DIFFERENCE")

    frame = finalize_hard_surface(frame, bevel_width=0.022, bevel_segments=3, bevel_angle_deg=35.0, lock_flat_walls=True)
    vg_blued = frame.vertex_groups.new(name="rust_blued")
    vg_blued.add(list(range(len(frame.data.vertices))), 1.0, "REPLACE")

    # 7. AUTHENTIC 1917 DWM CHECKERED 240°C STRAW-GOLD MAGAZINE RELEASE BUTTON (LEFT FLANK!)
    # Built as a separate crisp sub-mesh with real 3D cross-checkering and joined cleanly with its own VG!
    mag_btn = make_revolve_three(
        "mag_catch_btn",
        [
            (0.0, -1.24),
            (0.28, -1.24),
            (0.34, -1.19),
            (0.35, -1.12),
            (0.35, -0.78),
            (0.0, -0.78),
        ],
        axis="Z",
        segments=36,
        center=(-2.05, -0.82, 0.0),
    )
    for k in range(-2, 3):
        off = k * 0.105
        g1 = make_box_three("mbg1", 0.78, 0.026, 0.045, center=(-2.05, -0.82 + off, -1.245), rot_three=(0.0, 0.0, math.radians(35.0)))
        g2 = make_box_three("mbg2", 0.026, 0.78, 0.045, center=(-2.05 + off, -0.82, -1.245), rot_three=(0.0, 0.0, math.radians(35.0)))
        mag_btn = bool_op(mag_btn, g1, "DIFFERENCE")
        mag_btn = bool_op(mag_btn, g2, "DIFFERENCE")
    mag_btn = finalize_hard_surface(mag_btn, bevel_width=0.008, bevel_segments=2, bevel_angle_deg=38.0)
    vg_straw = mag_btn.vertex_groups.new(name="straw_gold")
    vg_straw.add(list(range(len(mag_btn.data.vertices))), 1.0, "REPLACE")

    join_objects(frame, [mag_btn])
    return frame


def build_p08_sideplate() -> bpy.types.Object:
    """
    F-02: Sculpted Beveled Arched Left Trigger-Lever Sideplate (Abzugsblech):
      - Graceful curved arched lower-front contour matching frame mortise
      - Smoothly contoured arched teardrop bellcrank housing dome (NOT a boxy flat pad!)
      - Crisp lower takedown-lever locking semicircle notch & flat upper '21' stamp bed!
    """
    pts: list[tuple[float, float]] = [(-1.42, -0.52), (0.82, -0.52)]
    pts.extend(sample_cubic_bezier((0.82, -0.52), (1.16, -0.52), (1.36, -0.30), (1.42, -0.02), steps=12))
    pts.extend([(1.42, 0.58), (-1.42, 0.64)])
    plate = make_extrude_z_three("p08_sideplate", pts, -0.14, 0.12, bevel=0.036, bevel_segs=3)

    # Sculpted arched teardrop bellcrank housing dome smoothly lofted onto outer left face (-Z)
    boss_pts = rounded_polygon_2d(
        [
            (-1.02, -0.46, 0.26),
            (0.42, -0.46, 0.30),
            (0.46, 0.42, 0.34),
            (-0.98, 0.54, 0.24),
        ],
        arc_steps=8,
    )
    boss = make_extrude_z_three("boss", boss_pts, -0.205, -0.04, bevel=0.068, bevel_segs=4)
    plate = bool_op(plate, boss, "UNION")

    inner_pocket = make_box_three("inner_pkt", 1.52, 1.08, 0.20, center=(-0.18, 0.02, 0.08))
    td_notch = make_cylinder_three("td_notch", 0.27, 0.27, 0.50, axis="Z", center=(1.18, -0.46, 0.0), segments=32)
    plate = bool_op(plate, inner_pocket, "DIFFERENCE")
    plate = bool_op(plate, td_notch, "DIFFERENCE")
    return finalize_hard_surface(plate, bevel_width=0.020, bevel_segments=3, bevel_angle_deg=36.0, lock_flat_walls=True)


def build_p08_takedown_lever() -> bpy.types.Object:
    """
    F-03: Authentic Compact 240-deg-C Straw-Gold Rotating Takedown Lever (Zerlegehebel):
      - Sits horizontally/snugly along the lower-front left frame rim in locked battery position
        (NEVER dangles awkwardly below the frame chin on the right view!)
      - Ergonomic teardrop paddle w/ crisp 3D diamond-checkered thumb pad & rounded '21' pivot boss!
    """
    # Horizontal-swept compact Luger takedown paddle (world Y in [0.34, 0.69] -> strictly above frame chin!)
    pts: list[tuple[float, float]] = [(0.21, 0.19)]
    pts.extend(sample_quad_bezier((0.21, 0.19), (-0.18, 0.23), (-0.74, 0.08), steps=10))
    pts.extend(sample_quad_bezier((-0.74, 0.08), (-0.85, -0.04), (-0.64, -0.14), steps=10))
    pts.extend(sample_quad_bezier((-0.64, -0.14), (-0.18, -0.15), (0.19, -0.14), steps=10))
    pts.extend(sample_quad_bezier((0.19, -0.14), (0.29, 0.02), (0.21, 0.19), steps=8))
    lever = make_extrude_z_three("p08_takedown_lever", pts, -0.22, 0.02, bevel=0.030, bevel_segs=3)

    # Rounded pivot boss + inward locking cam shaft (+Z into frame bore)
    shaft = make_revolve_three(
        "td_shaft",
        [
            (0.0, -0.23), (0.17, -0.23), (0.195, -0.19), (0.195, 0.12),
            (0.155, 0.14), (0.155, 0.88), (0.13, 0.92), (0.0, 0.92),
        ],
        axis="Z",
        segments=32,
    )
    lever = bool_op(lever, shaft, "UNION")

    # Crisp 3D diamond-checkered thumb pad on left outer face (-Z = -0.22), strictly clear of '21' pivot hub!
    for k in range(4):
        gx = -0.66 + k * 0.105
        g1 = make_box_three(f"td_c1_{k}", 0.026, 0.24, 0.08, center=(gx, 0.01, -0.236), rot_three=(0.0, 0.0, math.radians(32.0)))
        g2 = make_box_three(f"td_c2_{k}", 0.026, 0.24, 0.08, center=(gx, 0.01, -0.236), rot_three=(0.0, 0.0, math.radians(-32.0)))
        lever = bool_op(lever, g1, "DIFFERENCE")
        lever = bool_op(lever, g2, "DIFFERENCE")

    return finalize_hard_surface(lever, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_ejector() -> bpy.types.Object:
    """F-04: 240-deg-C Straw-Gold Right-Flank Leaf-Spring Ejector Blade (Auswerfer)."""
    body = make_box_three("p08_ejector", 2.88, 0.24, 0.14, bevel=0.028, bevel_segs=3)
    rear = make_box_three("ej_rear", 0.36, 0.40, 0.20, center=(-1.26, 0.0, 0.03), bevel=0.025, bevel_segs=2)
    front = make_box_three("ej_front", 0.42, 0.22, 0.26, center=(1.22, 0.0, -0.11), bevel=0.025, bevel_segs=2)
    body = bool_op(body, rear, "UNION")
    body = bool_op(body, front, "UNION")
    return finalize_hard_surface(body, bevel_width=0.015, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_hold_open() -> bpy.types.Object:
    """F-05: Bright White-Steel Internal Last-Round Hold-Open Latch & Spring (Verschlussfang)."""
    pts = [(-1.12, -0.12), (0.75, -0.12), (1.12, 0.26), (0.84, 0.26), (0.45, 0.04), (-1.12, 0.04)]
    latch = make_extrude_z_three("p08_hold_open", pts, -0.12, 0.12, bevel=0.015, bevel_segs=2)
    tab = make_box_three("ho_tab", 0.34, 0.20, 0.34, center=(0.18, -0.10, -0.05), bevel=0.016, bevel_segs=2)
    spr = make_box_three("ho_spr", 1.52, 0.072, 0.14, center=(-0.24, -0.155, 0.0), rot_three=(0.0, 0.0, -0.06), bevel=0.010, bevel_segs=2)
    latch = finalize_hard_surface(latch, bevel_width=0.0, use_bevel=False)
    tab = finalize_hard_surface(tab, bevel_width=0.0, use_bevel=False)
    spr = finalize_hard_surface(spr, bevel_width=0.0, use_bevel=False)
    join_objects(latch, [tab, spr])
    return latch


def build_p08_walnut_grip(side: str) -> bpy.types.Object:
    """
    F-06 / F-07: Organically Contoured Palm-Swelled European Walnut Grip Panel!
      - Evaluates the EXACT SAME analytical curved backstrap, frontstrap & sculpted Luger
        top arch (`eval_grip_panel_sf_su`) as `p08_frame` -> watchmaker-grade organic wrap!
      - Lush compound ergonomic palm-swell dome (44x64 surface grid) tapering smoothly flush
        into the rounded steel straps!
      - Crisp left semicircular relief scallop cradling the straw-gold magazine release button!
      - Deeply beveled counterbore + real 3D domed blued slotted steel grip screw!
    """
    assert side in ("left", "right")
    sign_z = 1.0 if side == "right" else -1.0
    part_name = "p08_grip_right" if side == "right" else "p08_grip_left"

    nu, nv = 44, 64
    bm = bmesh.new()

    # Seated cleanly 0.2 mm inside frame's +-0.80 grip bedding seat (Z_world=+-0.78 -> z_local=-sign_z*0.14)
    z_in_base = -sign_z * 0.15

    outer_grid: list[list[bmesh.types.BMVert]] = []
    inner_grid: list[list[bmesh.types.BMVert]] = []

    for iv in range(nv + 1):
        v = -1.0 + 2.0 * (iv / nv)
        row_out = []
        row_in = []
        for iu in range(nu + 1):
            u = -1.0 + 2.0 * (iu / nu)
            sf, su = eval_grip_panel_sf_su(u, v)
            lx, ly = grip_local_to_xy(sf, su)

            # Lush ergonomic compound palm-swell arch: flush-beveled along curved steel straps,
            # rising smoothly into an asymmetric palm belly peaking at Z_world = +-1.44 (z_local = +-0.52)!
            du = min(1.0, abs(u))
            dv = min(1.0, abs(v))
            arch_u = math.pow(max(0.0, 1.0 - du * du), 0.56)
            arch_v = math.pow(max(0.0, 1.0 - dv * dv * 0.88), 0.42)
            # Subtle asymmetric palm-heel swell shifted gently toward rear-center of hand
            palm_bias = 1.0 + 0.10 * math.exp(-((u + 0.14) ** 2) / 0.55 - ((v + 0.10) ** 2) / 0.65)
            z_mag = (0.095 + 0.405 * arch_u * (0.46 + 0.54 * arch_v)) * palm_bias
            z_out = sign_z * z_mag
            z_in = z_in_base + sign_z * (0.08 * (1.0 - arch_u * arch_v))

            row_out.append(bm.verts.new(t2b(lx, ly, z_out)))
            row_in.append(bm.verts.new(t2b(lx, ly, z_in)))
        outer_grid.append(row_out)
        inner_grid.append(row_in)

    for iv in range(nv):
        for iu in range(nu):
            if sign_z > 0:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv][iu + 1], outer_grid[iv + 1][iu + 1], outer_grid[iv + 1][iu]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv + 1][iu], inner_grid[iv + 1][iu + 1], inner_grid[iv][iu + 1]))
            else:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv + 1][iu], outer_grid[iv + 1][iu + 1], outer_grid[iv][iu + 1]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv][iu + 1], inner_grid[iv + 1][iu + 1], inner_grid[iv + 1][iu]))

    for iu in range(nu):
        bm.faces.new((inner_grid[0][iu], inner_grid[0][iu + 1], outer_grid[0][iu + 1], outer_grid[0][iu]))
        bm.faces.new((outer_grid[nv][iu], outer_grid[nv][iu + 1], inner_grid[nv][iu + 1], inner_grid[nv][iu]))
    for iv in range(nv):
        bm.faces.new((outer_grid[iv][0], outer_grid[iv + 1][0], inner_grid[iv + 1][0], inner_grid[iv][0]))
        bm.faces.new((inner_grid[iv][nu], inner_grid[iv + 1][nu], outer_grid[iv + 1][nu], outer_grid[iv][nu]))

    grip = new_mesh_obj(part_name, bm)

    # Crisp semicircular relief arch on LEFT walnut panel cradling checkered straw-gold mag release button!
    if side == "left":
        mag_relief = make_cylinder_three(
            "mag_btn_relief", 0.47, 0.47, 1.60, axis="Z", center=(MAG_BTN_LOCAL_X, MAG_BTN_LOCAL_Y, 0.0), segments=32
        )
        grip = bool_op(grip, mag_relief, "DIFFERENCE")

    # Deep beveled lower grip retention screw counterbore at exact (GRIP_SCREW_LX, GRIP_SCREW_LY)
    cb_prof = [
        (0.0, 0.04), (0.242, 0.04), (0.242, 0.27), (0.315, 0.40), (0.355, 0.68), (0.0, 0.68)
    ]
    if sign_z < 0:
        cb_prof = [(r, -z) for (r, z) in reversed(cb_prof)]
    counterbore = make_revolve_three(
        "counterbore", cb_prof, axis="Z", segments=36, center=(GRIP_SCREW_LX, GRIP_SCREW_LY, 0.0)
    )
    grip = bool_op(grip, counterbore, "DIFFERENCE")
    grip = finalize_hard_surface(grip, bevel_width=0.0, use_bevel=False, sharp_deg=44.0)

    # Real 3D domed blued slotted steel grip screw seated cleanly inside the beveled counterbore!
    screw_prof = [
        (0.0, 0.05), (0.228, 0.05), (0.228, 0.27), (0.205, 0.318), (0.140, 0.348), (0.0, 0.358)
    ]
    if sign_z < 0:
        screw_prof = [(r, -z) for (r, z) in reversed(screw_prof)]
    screw = make_revolve_three(
        f"grip_screw_{side}", screw_prof, axis="Z", segments=36, center=(GRIP_SCREW_LX, GRIP_SCREW_LY, 0.0)
    )
    slot_cut = make_box_three(
        "screw_slot", 0.50, 0.068, 0.15, center=(GRIP_SCREW_LX, GRIP_SCREW_LY, sign_z * 0.338),
        rot_three=(0.0, 0.0, math.radians(18.0)),
    )
    screw = bool_op(screw, slot_cut, "DIFFERENCE")
    screw = finalize_hard_surface(screw, bevel_width=0.008, bevel_segments=2, bevel_angle_deg=38.0)

    vg_wood = grip.vertex_groups.new(name="walnut_wood")
    vg_wood.add(list(range(len(grip.data.vertices))), 1.0, "REPLACE")
    vg_screw = screw.vertex_groups.new(name="blued_screw")
    vg_screw.add(list(range(len(screw.data.vertices))), 1.0, "REPLACE")

    join_objects(grip, [screw])
    return grip


def build_p08_trigger() -> bpy.types.Object:
    """FC-01: Lustrous 240-deg-C Straw-Gold Wide Sculpted Crescent Trigger (Abzug) w/ white steel pivot pin."""
    pts: list[tuple[float, float]] = [(-0.32, 0.44), (0.36, 0.36), (0.28, -0.18)]
    pts.extend(sample_quad_bezier((0.28, -0.18), (0.68, -0.88), (0.14, -1.58), steps=18))
    pts.append((-0.22, -1.52))
    pts.extend(sample_quad_bezier((-0.22, -1.52), (0.24, -0.88), (-0.16, -0.24), steps=18))
    pts.append((-0.48, 0.12))

    shoe = make_extrude_z_three("p08_trigger", pts, -0.28, 0.28, bevel=0.082, bevel_segs=5)
    pin_hole = make_cylinder_three("trig_hole", 0.112, 0.112, 0.80, axis="Z", center=(0.0, 0.0, 0.0), segments=24)
    shoe = bool_op(shoe, pin_hole, "DIFFERENCE")
    shoe = finalize_hard_surface(shoe, bevel_width=0.0, use_bevel=False, sharp_deg=42.0)

    vg_straw = shoe.vertex_groups.new(name="straw_gold")
    vg_straw.add(list(range(len(shoe.data.vertices))), 1.0, "REPLACE")

    pin = make_cylinder_three("trig_pin", 0.105, 0.105, 0.68, axis="Z", center=(0.0, 0.0, 0.0), segments=24, bevel_caps=0.016)
    pin = finalize_hard_surface(pin, bevel_width=0.0, use_bevel=False)
    vg_steel = pin.vertex_groups.new(name="white_steel")
    vg_steel.add(list(range(len(pin.data.vertices))), 1.0, "REPLACE")

    join_objects(shoe, [pin])
    return shoe


def build_p08_trigger_lever() -> bpy.types.Object:
    """FC-02: Bright White-Steel Sideplate L-Shaped Bellcrank Transfer Lever (Abzugshebel)."""
    lower = make_box_three("p08_trigger_lever", 0.30, 0.88, 0.18, center=(-0.18, -0.04, 0.05), rot_three=(0.0, 0.0, 0.20), bevel=0.026, bevel_segs=2)
    upper = make_box_three("tl_up", 0.96, 0.28, 0.20, center=(-0.22, 0.44, -0.05), bevel=0.026, bevel_segs=2)
    pin = make_cylinder_three("tl_pin", 0.082, 0.082, 0.96, axis="Y", center=(0.18, 0.06, -0.02), segments=20, bevel_caps=0.015)
    lower = bool_op(lower, upper, "UNION")
    lower = bool_op(lower, pin, "UNION")
    return finalize_hard_surface(lower, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_sear_bar() -> bpy.types.Object:
    """FC-03: Imperial Rust-Blued Horizontal Left-Flank Sear Bar w/ Bright White-Steel Disconnector Plunger."""
    bar = make_box_three("p08_sear_bar", 4.18, 0.26, 0.16, bevel=0.026, bevel_segs=2)
    tooth = make_box_three("sear_tooth", 0.42, 0.24, 0.24, center=(-0.95, 0.0, 0.10), bevel=0.022, bevel_segs=2)
    leaf = make_box_three("sear_leaf", 1.85, 0.06, 0.14, center=(-0.65, 0.16, -0.04), bevel=0.012, bevel_segs=2)
    bar = bool_op(bar, tooth, "UNION")
    bar = bool_op(bar, leaf, "UNION")
    bar = finalize_hard_surface(bar, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)
    vg_blued = bar.vertex_groups.new(name="rust_blued")
    vg_blued.add(list(range(len(bar.data.vertices))), 1.0, "REPLACE")

    plunger = make_cylinder_three("sear_plunger", 0.11, 0.11, 0.36, axis="Z", center=(1.85, -0.04, 0.04), segments=24, bevel_caps=0.02)
    plunger = finalize_hard_surface(plunger, bevel_width=0.0, use_bevel=False)
    vg_white = plunger.vertex_groups.new(name="white_steel")
    vg_white.add(list(range(len(plunger.data.vertices))), 1.0, "REPLACE")

    join_objects(bar, [plunger])
    return bar


def build_p08_thumb_safety() -> bpy.types.Object:
    """
    FC-04: 240-deg-C Straw-Gold Knurled Thumb Safety Lever & Concealed Sear-Blocking Bar!
      - Graceful tapered lever arm ending in crisp 3D diamond-checkered circular thumb disc (-Z)
      - Internal white-steel blocking bar sits cleanly INSIDE the frame's internal slot
        (NEVER pokes out across the top of the GESICHERT engraving!)
    """
    pts: list[tuple[float, float]] = [(0.16, -0.20), (-0.86, 0.76)]
    pts.extend(sample_quad_bezier((-0.86, 0.76), (-1.20, 1.10), (-0.80, 1.30), steps=10))
    pts.append((0.30, 0.16))
    arm = make_extrude_z_three("p08_thumb_safety", pts, -0.14, 0.06, bevel=0.028, bevel_segs=3)

    disc = make_revolve_three(
        "thumb_disc",
        [(0.0, -0.27), (0.31, -0.27), (0.36, -0.21), (0.36, 0.04), (0.0, 0.04)],
        axis="Z",
        segments=36,
        center=(-0.92, 0.98, 0.0),
    )
    arm = bool_op(arm, disc, "UNION")
    for k in range(-2, 3):
        off = k * 0.105
        g1 = make_box_three("sg1", 0.78, 0.026, 0.045, center=(-0.92, 0.98 + off, -0.274), rot_three=(0.0, 0.0, math.radians(32.0)))
        g2 = make_box_three("sg2", 0.026, 0.78, 0.045, center=(-0.92 + off, 0.98, -0.274), rot_three=(0.0, 0.0, math.radians(32.0)))
        arm = bool_op(arm, g1, "DIFFERENCE")
        arm = bool_op(arm, g2, "DIFFERENCE")
    arm = finalize_hard_surface(arm, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)

    vg_straw = arm.vertex_groups.new(name="straw_gold")
    vg_straw.add(list(range(len(arm.data.vertices))), 1.0, "REPLACE")

    # Forward sliding sear-blocking bar cleanly tucked behind -0.86 GESICHERT back wall (Z_local=+0.30 -> Z_world=-0.66!)
    bar = make_box_three("block_bar", 2.30, 0.18, 0.14, center=(1.12, 0.62, 0.30), bevel=0.020, bevel_segs=2)
    bar = finalize_hard_surface(bar, bevel_width=0.0, use_bevel=False)
    vg_white = bar.vertex_groups.new(name="white_steel")
    vg_white.add(list(range(len(bar.data.vertices))), 1.0, "REPLACE")

    join_objects(arm, [bar])
    return arm


def build_p08_mag_body() -> bpy.types.Object:
    """M-01: Brushed-Nickel 55-deg Folded Sheet-Steel 8-Round Magazine Body (Magazingehaeuse)."""
    outer = make_box_three("p08_mag_body", 2.52, 11.20, 1.28, bevel=0.14, bevel_segs=4)
    spine = make_box_three("mag_spine", 0.24, 11.08, 0.54, center=(-1.26, 0.0, 0.0), bevel=0.045, bevel_segs=3)
    outer = bool_op(outer, spine, "UNION")

    cutters = [
        make_box_three("mag_cav", 2.22, 11.00, 1.06, center=(0.02, 0.22, 0.0)),
        make_box_three("feed_scoop", 1.82, 1.22, 0.86, center=(0.44, 5.45, 0.0)),
        make_box_three("slot_r", 0.32, 8.65, 0.45, center=(0.12, -0.25, 0.58), bevel=0.14, bevel_segs=3),
        make_box_three("slot_l", 0.26, 8.65, 0.45, center=(0.12, -0.25, -0.58), bevel=0.11, bevel_segs=3),
        make_box_three("catch_win", 0.52, 0.34, 0.36, center=(0.85, 3.15, -0.56)),
    ]
    for c in cutters:
        outer = bool_op(outer, c, "DIFFERENCE")

    # Clean horizontal edge bisect at Y_three = -3.15 (Blender Z = -3.15) so lower-left 'P.08 / 9 m/m'
    # hero patch is a 100% solid rectangular island!
    bm_mb = bmesh.new()
    bm_mb.from_mesh(outer.data)
    bmesh.ops.bisect_plane(
        bm_mb,
        geom=list(bm_mb.verts) + list(bm_mb.edges) + list(bm_mb.faces),
        plane_co=(0.0, 0.0, -3.15),
        plane_no=(0.0, 0.0, 1.0),
    )
    bm_mb.to_mesh(outer.data)
    bm_mb.free()

    return finalize_hard_surface(outer, bevel_width=0.018, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_mag_follower() -> bpy.types.Object:
    """M-02: Bright White-Steel Cartridge Follower w/ 3D Knurled External Thumb Loading Button (+Z)."""
    plat = make_box_three("p08_mag_follower", 1.92, 0.68, 0.94, rot_three=(0.0, 0.0, 0.42), bevel=0.055, bevel_segs=3)
    skirt = make_box_three("fol_skirt", 1.48, 0.85, 0.86, center=(-0.08, -0.45, 0.0), bevel=0.04, bevel_segs=2)
    plat = bool_op(plat, skirt, "UNION")

    btn = make_revolve_three(
        "fol_btn",
        [(0.0, 0.15), (0.14, 0.15), (0.14, 0.64), (0.38, 0.68), (0.38, 0.88), (0.33, 0.96), (0.0, 0.96)],
        axis="Z",
        segments=32,
        center=(0.12, -0.12, 0.0),
    )
    left_pin = make_cylinder_three("fol_lpin", 0.12, 0.12, 0.30, axis="Z", center=(0.12, -0.12, -0.34), segments=20, bevel_caps=0.02)
    plat = bool_op(plat, btn, "UNION")
    plat = bool_op(plat, left_pin, "UNION")
    plat = finalize_hard_surface(plat, bevel_width=0.016, bevel_segments=2, bevel_angle_deg=38.0)

    ribs = []
    for k in range(18):
        a = (k / 18.0) * 2.0 * math.pi
        r_obj = make_box_three(
            f"fb_rib_{k}", 0.040, 0.040, 0.20,
            center=(0.12 + math.cos(a) * 0.378, -0.12 + math.sin(a) * 0.378, 0.78),
            rot_three=(0.0, 0.0, a), bevel=0.008, bevel_segs=1,
        )
        r_obj = finalize_hard_surface(r_obj, bevel_width=0.0, use_bevel=False)
        ribs.append(r_obj)
    join_objects(plat, ribs)
    return plat


def build_p08_mag_base() -> bpy.types.Object:
    """M-04: Sculpted Twin-Ear Concentric-Grooved Duralumin Pull-Knob Floorplate (Magazinboden)."""
    plug = make_box_three("p08_mag_base", 2.12, 0.72, 0.98, center=(0.0, 0.36, 0.0), bevel=0.055, bevel_segs=3)
    collar = make_box_three("mb_collar", 2.62, 0.50, 1.34, center=(0.0, -0.14, 0.0), bevel=0.075, bevel_segs=3)
    base = bool_op(plug, collar, "UNION")

    def build_concentric_ear(sign_z: float) -> bpy.types.Object:
        prof: list[tuple[float, float]] = [
            (0.0, 0.44), (0.66, 0.44), (0.66, 0.87), (0.60, 0.96), (0.57, 0.98)
        ]
        for g in range(5):
            r_hi = 0.54 - g * 0.095
            prof.append((r_hi, 0.98))
            prof.append((r_hi - 0.032, 0.935))
            prof.append((r_hi - 0.064, 0.98))
        prof.append((0.0, 0.98))
        if sign_z < 0:
            prof = [(r, -z) for (r, z) in reversed(prof)]
        return make_revolve_three(
            f"mb_ear_{'R' if sign_z > 0 else 'L'}", prof, axis="Z", segments=48, center=(-0.15, -0.38, 0.0)
        )

    base = bool_op(base, build_concentric_ear(-1.0), "UNION")
    base = bool_op(base, build_concentric_ear(+1.0), "UNION")
    base = finalize_hard_surface(base, bevel_width=0.018, bevel_segments=2, bevel_angle_deg=38.0)

    vg_alloy = base.vertex_groups.new(name="mag_alloy")
    vg_alloy.add(list(range(len(base.data.vertices))), 1.0, "REPLACE")

    pin = make_cylinder_three("mb_pin", 0.068, 0.068, 1.36, axis="Z", center=(0.45, 0.25, 0.0), segments=20, bevel_caps=0.012)
    pin = finalize_hard_surface(pin, bevel_width=0.0, use_bevel=False)
    vg_blued = pin.vertex_groups.new(name="rust_blued")
    vg_blued.add(list(range(len(pin.data.vertices))), 1.0, "REPLACE")

    join_objects(base, [pin])
    return base


# =============================================================================
# 3. PHYSICALLY-CALIBRATED CYCLES METALLURGY & WALNUT SHADERS
# =============================================================================


def build_pbr_metal_shader(
    name: str,
    base_srgb_a: tuple[float, float, float],
    base_srgb_b: tuple[float, float, float],
    roughness: float,
    rough_var: float,
    metallic: float,
    bevel_r: float = 0.032,
    edge_wear: float = 0.36,
    edge_srgb: tuple[float, float, float] = (0.74, 0.78, 0.84),
    grain_scale: tuple[float, float, float] = (4.5, 48.0, 48.0),
    grain_bump: float = 0.032,
    oil_mottle_scale: float = 0.95,
) -> bpy.types.Material:
    """
    AK-15M1 Gold-Standard Rich Multi-Layered Gunsmith Metallurgy Shader:
      - Organic CLP gun-oil mottled roughness & subtle indigo-charcoal tonal breakup
      - Directional draw-filed steel brushing micro-grain
      - Dual-driven exposed bright bare-steel edge wear (Pointiness + BevelNormal-TrueNormal delta!)
      - Ray-traced ShaderNodeBevel fillet normals + fine surface micro-bump!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # 1. Directional draw-filed / CNC brushed steel grain
    map_g = nt.nodes.new("ShaderNodeMapping")
    map_g.inputs["Scale"].default_value = grain_scale
    nt.links.new(tc.outputs["Object"], map_g.inputs["Vector"])

    n_grain = nt.nodes.new("ShaderNodeTexNoise")
    n_grain.inputs["Scale"].default_value = 3.2
    n_grain.inputs["Detail"].default_value = 7.0
    n_grain.inputs["Roughness"].default_value = 0.62
    nt.links.new(map_g.outputs["Vector"], n_grain.inputs["Vector"])

    # 2. Multi-scale organic CLP gun-oil cloud breakup (macro + medium mottle!)
    n_oil_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_oil_macro.inputs["Scale"].default_value = oil_mottle_scale
    n_oil_macro.inputs["Detail"].default_value = 5.0
    n_oil_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(tc.outputs["Object"], n_oil_macro.inputs["Vector"])

    n_oil_med = nt.nodes.new("ShaderNodeTexNoise")
    n_oil_med.inputs["Scale"].default_value = oil_mottle_scale * 3.8
    n_oil_med.inputs["Detail"].default_value = 4.0
    n_oil_med.inputs["Roughness"].default_value = 0.60
    nt.links.new(tc.outputs["Object"], n_oil_med.inputs["Vector"])

    oil_mix = nt.nodes.new("ShaderNodeMix")
    oil_mix.data_type = "FLOAT"
    oil_mix.inputs[0].default_value = 0.42
    nt.links.new(n_oil_macro.outputs["Fac"], oil_mix.inputs[2])
    nt.links.new(n_oil_med.outputs["Fac"], oil_mix.inputs[3])
    oil_fac = oil_mix.outputs[0]

    # Base color blend + directional grain tonal micro-modulation
    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[6].default_value = srgb_to_lin(*base_srgb_a)
    mix_col.inputs[7].default_value = srgb_to_lin(*base_srgb_b)
    nt.links.new(oil_fac, mix_col.inputs[0])

    g_mod = nt.nodes.new("ShaderNodeMapRange")
    g_mod.inputs["From Min"].default_value = 0.22
    g_mod.inputs["From Max"].default_value = 0.78
    g_mod.inputs["To Min"].default_value = 0.90
    g_mod.inputs["To Max"].default_value = 1.12
    nt.links.new(n_grain.outputs["Fac"], g_mod.inputs["Value"])

    col_mul = nt.nodes.new("ShaderNodeMix")
    col_mul.data_type = "RGBA"
    col_mul.blend_type = "MULTIPLY"
    col_mul.inputs[0].default_value = 1.0
    nt.links.new(mix_col.outputs[2], col_mul.inputs[6])
    nt.links.new(g_mod.outputs["Result"], col_mul.inputs[7])
    col_sock = col_mul.outputs[2]

    # Wide organic gun-oil roughness breakup (never flat CG specular!)
    r_oil = nt.nodes.new("ShaderNodeMapRange")
    r_oil.clamp = True
    r_oil.inputs["From Min"].default_value = 0.26
    r_oil.inputs["From Max"].default_value = 0.74
    r_oil.inputs["To Min"].default_value = max(0.12, roughness - rough_var)
    r_oil.inputs["To Max"].default_value = min(0.85, roughness + rough_var)
    nt.links.new(oil_fac, r_oil.inputs["Value"])

    r_g = nt.nodes.new("ShaderNodeMapRange")
    r_g.inputs["From Min"].default_value = 0.0
    r_g.inputs["From Max"].default_value = 1.0
    r_g.inputs["To Min"].default_value = -0.022
    r_g.inputs["To Max"].default_value = 0.022
    nt.links.new(n_grain.outputs["Fac"], r_g.inputs["Value"])

    r_add = nt.nodes.new("ShaderNodeMath")
    r_add.operation = "ADD"
    r_add.use_clamp = True
    nt.links.new(r_oil.outputs["Result"], r_add.inputs[0])
    nt.links.new(r_g.outputs["Result"], r_add.inputs[1])
    rgh_sock = r_add.outputs["Value"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    # Ray-traced ShaderNodeBevel fillet normals
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 8
    bev.inputs["Radius"].default_value = bevel_r

    # 3. Exposed bright bare-steel edge wear (Pointiness + BevelNormal deviation, patchy oil modulation!)
    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")

        # Driver A: Mesh convex pointiness (tight threshold -> crisp knurl tips & sharp ridges, ZERO chalky flats!)
        pt_ramp = nt.nodes.new("ShaderNodeValToRGB")
        pt_ramp.color_ramp.elements[0].position = 0.538
        pt_ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        pt_ramp.color_ramp.elements[1].position = 0.610
        pt_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(geom.outputs["Pointiness"], pt_ramp.inputs["Fac"])

        # Driver B: Ray-traced BevelNormal vs TrueNormal (tight rim catchlight, zero flat halo!)
        dot_e = nt.nodes.new("ShaderNodeVectorMath")
        dot_e.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], dot_e.inputs[0])
        nt.links.new(geom.outputs["True Normal"], dot_e.inputs[1])

        bev_e = nt.nodes.new("ShaderNodeMapRange")
        bev_e.clamp = True
        bev_e.inputs["From Min"].default_value = 0.968
        bev_e.inputs["From Max"].default_value = 0.72
        bev_e.inputs["To Min"].default_value = 0.0
        bev_e.inputs["To Max"].default_value = 0.72
        nt.links.new(dot_e.outputs["Value"], bev_e.inputs["Value"])

        max_e = nt.nodes.new("ShaderNodeMath")
        max_e.operation = "MAXIMUM"
        nt.links.new(pt_ramp.outputs["Color"], max_e.inputs[0])
        nt.links.new(bev_e.outputs["Result"], max_e.inputs[1])

        # Patchy handling-wear noise modulation so edge wear looks real & organic, never CG wireframe!
        wear_patch = nt.nodes.new("ShaderNodeMapRange")
        wear_patch.clamp = True
        wear_patch.inputs["From Min"].default_value = 0.26
        wear_patch.inputs["From Max"].default_value = 0.72
        wear_patch.inputs["To Min"].default_value = 0.25 * edge_wear
        wear_patch.inputs["To Max"].default_value = edge_wear
        nt.links.new(n_oil_med.outputs["Fac"], wear_patch.inputs["Value"])

        wear_f = nt.nodes.new("ShaderNodeMath")
        wear_f.operation = "MULTIPLY"
        wear_f.use_clamp = True
        nt.links.new(max_e.outputs["Value"], wear_f.inputs[0])
        nt.links.new(wear_patch.outputs["Result"], wear_f.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(wear_f.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = max(0.13, roughness - 0.12)
        nt.links.new(wear_f.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        mix_em = nt.nodes.new("ShaderNodeMix")
        mix_em.data_type = "FLOAT"
        mix_em.inputs[3].default_value = 0.96
        nt.links.new(wear_f.outputs["Value"], mix_em.inputs[0])
        nt.links.new(met_sock, mix_em.inputs[2])
        met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = grain_bump
    bump.inputs["Distance"].default_value = 0.022
    nt.links.new(n_grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def build_walnut_base_shader(name: str) -> bpy.types.Material:
    """
    Seamless 3D Object-Space European Black Walnut (Juglans regia) heartwood shader:
      - Rich warm antique linseed-oiled walnut cathedral grain across outer face, rims & counterbore
      - Crisp 20-LPI diamond checkering, carved border channel, open wood pores & hand-worn palm
        patina are composited at 18.2 px/mm via exact analytic RNM in Mode 2 post-process!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # Align grain along 55-deg grip spine
    rot_grip = nt.nodes.new("ShaderNodeMapping")
    rot_grip.inputs["Rotation"].default_value = (0.0, math.radians(-35.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_grip.inputs["Vector"])

    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (1.80, 1.60, 0.22)
    nt.links.new(rot_grip.outputs["Vector"], map_wood.inputs["Vector"])

    wave_ring = nt.nodes.new("ShaderNodeTexWave")
    wave_ring.wave_type = "RINGS"
    wave_ring.rings_direction = "Z"
    wave_ring.wave_profile = "SIN"
    wave_ring.inputs["Scale"].default_value = 1.05
    wave_ring.inputs["Distortion"].default_value = 10.5
    wave_ring.inputs["Detail"].default_value = 8.0
    wave_ring.inputs["Detail Scale"].default_value = 1.75
    wave_ring.inputs["Detail Roughness"].default_value = 0.62
    nt.links.new(map_wood.outputs["Vector"], wave_ring.inputs["Vector"])

    noise_fig = nt.nodes.new("ShaderNodeTexNoise")
    noise_fig.inputs["Scale"].default_value = 2.1
    noise_fig.inputs["Detail"].default_value = 6.0
    noise_fig.inputs["Distortion"].default_value = 0.9
    nt.links.new(map_wood.outputs["Vector"], noise_fig.inputs["Vector"])

    # Warm rich hand-rubbed linseed European walnut (Juglans regia) palette
    c_dark = srgb_to_lin(0.125, 0.056, 0.024)
    c_mid = srgb_to_lin(0.315, 0.155, 0.068)
    c_light = srgb_to_lin(0.485, 0.258, 0.118)

    w_mix1 = nt.nodes.new("ShaderNodeMix")
    w_mix1.data_type = "RGBA"
    w_mix1.inputs[6].default_value = c_dark
    w_mix1.inputs[7].default_value = c_mid
    nt.links.new(wave_ring.outputs["Fac"], w_mix1.inputs[0])

    fig_f = nt.nodes.new("ShaderNodeMapRange")
    fig_f.clamp = True
    fig_f.inputs["From Min"].default_value = 0.30
    fig_f.inputs["From Max"].default_value = 0.78
    fig_f.inputs["To Min"].default_value = 0.0
    fig_f.inputs["To Max"].default_value = 0.56
    nt.links.new(noise_fig.outputs["Fac"], fig_f.inputs["Value"])

    w_mix2 = nt.nodes.new("ShaderNodeMix")
    w_mix2.data_type = "RGBA"
    nt.links.new(fig_f.outputs["Result"], w_mix2.inputs[0])
    nt.links.new(w_mix1.outputs[2], w_mix2.inputs[6])
    w_mix2.inputs[7].default_value = c_light

    # Smooth hand-rubbed linseed-oiled wood satin roughness (0.31..0.41)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.31
    r_wood.inputs["To Max"].default_value = 0.41
    nt.links.new(wave_ring.outputs["Fac"], r_wood.inputs["Value"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.022

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.045
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(wave_ring.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(w_mix2.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(r_wood.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # Rich Imperial German Mirror-Rust-Blued Forged Steel (Streichbruenierung, DWM 1917):
        # Deep Prussian midnight blue-black steel (~(0.110..0.156)), M=0.91, R=0.18..0.32
        # catching studio softbox ribbons crisply without milky chalkiness OR crushed black!
        "M_RustBlued": build_pbr_metal_shader(
            "M_RustBlued",
            base_srgb_a=(0.110, 0.130, 0.170),
            base_srgb_b=(0.156, 0.182, 0.230),
            roughness=0.235,
            rough_var=0.072,
            metallic=0.91,
            bevel_r=0.024,
            edge_wear=0.26,
            edge_srgb=(0.76, 0.80, 0.86),
            grain_scale=(4.5, 48.0, 48.0),
            grain_bump=0.024,
            oil_mottle_scale=0.85,
        ),
        # Crisp museum wear on barrel muzzle crown & toggle knurl crests (tight bevel_r keeps dish mirror-smooth!)
        "M_RustBluedHighWear": build_pbr_metal_shader(
            "M_RustBluedHighWear",
            base_srgb_a=(0.108, 0.128, 0.168),
            base_srgb_b=(0.154, 0.180, 0.228),
            roughness=0.225,
            rough_var=0.068,
            metallic=0.92,
            bevel_r=0.016,
            edge_wear=0.34,
            edge_srgb=(0.80, 0.84, 0.90),
            grain_scale=(6.0, 52.0, 52.0),
            grain_bump=0.022,
            oil_mottle_scale=0.95,
        ),
        # Vivid lustrous Imperial German 240-285-deg-C Straw-Tempered Steel (Gelbangelassen):
        # M=0.96, R=0.175 with radiant warm champagne-honey metallic highlights!
        "M_StrawGold": build_pbr_metal_shader(
            "M_StrawGold",
            base_srgb_a=(0.915, 0.785, 0.455),
            base_srgb_b=(0.795, 0.640, 0.315),
            roughness=0.175,
            rough_var=0.042,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.97, 0.91, 0.72),
            grain_scale=(10.0, 52.0, 52.0),
            grain_bump=0.020,
            oil_mottle_scale=1.15,
        ),
        # Crisp bright-white milled steel (breechblock, striker, toggle pins, transfer lever, hold-open)
        "M_WhiteSteel": build_pbr_metal_shader(
            "M_WhiteSteel",
            base_srgb_a=(0.790, 0.818, 0.855),
            base_srgb_b=(0.685, 0.720, 0.765),
            roughness=0.20,
            rough_var=0.042,
            metallic=0.94,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=(5.0, 60.0, 60.0),
            grain_bump=0.030,
            oil_mottle_scale=1.10,
        ),
        # Brushed Nickel Sheet-Steel Magazine Tube (vertical magazine-well insertion wear!)
        "M_MagNickel": build_pbr_metal_shader(
            "M_MagNickel",
            base_srgb_a=(0.795, 0.802, 0.768),
            base_srgb_b=(0.685, 0.695, 0.660),
            roughness=0.23,
            rough_var=0.055,
            metallic=0.92,
            bevel_r=0.022,
            edge_wear=0.30,
            edge_srgb=(0.90, 0.91, 0.89),
            grain_scale=(48.0, 48.0, 4.5),
            grain_bump=0.026,
            oil_mottle_scale=0.95,
        ),
        # Machined Concentric-Grooved Duralumin Magazine Base
        "M_MagAlloy": build_pbr_metal_shader(
            "M_MagAlloy",
            base_srgb_a=(0.735, 0.762, 0.795),
            base_srgb_b=(0.630, 0.658, 0.695),
            roughness=0.25,
            rough_var=0.045,
            metallic=0.91,
            bevel_r=0.020,
            edge_wear=0.32,
            edge_srgb=(0.88, 0.90, 0.93),
            grain_scale=(24.0, 24.0, 24.0),
            grain_bump=0.022,
            oil_mottle_scale=1.10,
        ),
        # Hand-Oiled European Black Walnut + Blued Slotted Grip Screw
        "M_WalnutWood": build_walnut_base_shader("M_WalnutWood"),
        "M_GripScrew": build_pbr_metal_shader(
            "M_GripScrew",
            base_srgb_a=(0.135, 0.160, 0.200),
            base_srgb_b=(0.180, 0.210, 0.255),
            roughness=0.24,
            rough_var=0.045,
            metallic=0.90,
            bevel_r=0.012,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.82, 0.88),
            grain_scale=(22.0, 22.0, 22.0),
            grain_bump=0.018,
        ),
    }


def apply_vg_materials(
    obj: bpy.types.Object,
    vg_to_mat: dict[str, bpy.types.Material],
    default_mat: bpy.types.Material,
) -> None:
    obj.data.materials.clear()
    mats_list = [default_mat]
    for m in vg_to_mat.values():
        if m not in mats_list:
            mats_list.append(m)
    for m in mats_list:
        obj.data.materials.append(m)
    vg_idx_to_mat_slot: dict[int, int] = {}
    for vg_name, m in vg_to_mat.items():
        vg = obj.vertex_groups.get(vg_name)
        if vg:
            vg_idx_to_mat_slot[vg.index] = mats_list.index(m)
    v_slot = [0] * len(obj.data.vertices)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group in vg_idx_to_mat_slot and g.weight > 0.5:
                v_slot[v.index] = vg_idx_to_mat_slot[g.group]
                break
    for p in obj.data.polygons:
        slots = [v_slot[vi] for vi in p.vertices]
        p.material_index = max(set(slots), key=slots.count)


# =============================================================================
# 4. HIGH-UTILIZATION CONCAVE UV PACKING + DEDICATED HERO ENGRAVING PATCHES
# =============================================================================


def _smart_unwrap_and_pack_subset(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    include_face_fn: Callable[[str, bmesh.types.BMFace, str], bool],
    obj_scale_map: dict[str, float] | None = None,
    margin: float = 0.0045,
) -> None:
    """
    Smart-unwraps ONLY faces matching `include_face_fn`, applies optional whole-object texel
    priority weights (never tearing shared islands!), packs cleanly with Blender 5.2 CONCAVE
    `margin=0.0045` (`margin_method='SCALED'`), and affinely maps into `[u0, u1] x [v0, v1]`.
    """
    if not objs:
        return
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    active_objs = []
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers.active = o.data.uv_layers[0]
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.select_mode = {"FACE"}
        for v in bm.verts:
            v.select = False
        for e in bm.edges:
            e.select = False
        mat_names = [m.name if m else "" for m in o.data.materials]
        cnt = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            sel = include_face_fn(o.name, f, mname)
            f.select = sel
            if sel:
                cnt += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if cnt > 0:
            active_objs.append(o)

    if not active_objs:
        return

    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0),
        island_margin=0.003,
        area_weight=0.10,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")

    # Apply uniform whole-object texel priority weights (keeps every UV island 100% intact!)
    if obj_scale_map:
        for o in active_objs:
            s = obj_scale_map.get(o.name, 1.0)
            if abs(s - 1.0) <= 1e-3:
                continue
            bm = bmesh.new()
            bm.from_mesh(o.data)
            uv_layer = bm.loops.layers.uv.verify()
            for f in bm.faces:
                if not f.select:
                    continue
                for loop in f.loops:
                    loop[uv_layer].uv.x *= s
                    loop[uv_layer].uv.y *= s
            bm.to_mesh(o.data)
            bm.free()

    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=margin,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du, dv = u1 - u0, v1 - v0
    p_umin, p_umax = 1.0, 0.0
    p_vmin, p_vmax = 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        for f in bm.faces:
            if not f.select:
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = _clamp(uv.x, 0.0, 1.0)
                vy = _clamp(uv.y, 0.0, 1.0)
                p_umin = min(p_umin, ux)
                p_umax = max(p_umax, ux)
                p_vmin = min(p_vmin, vy)
                p_vmax = max(p_vmax, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = p_umax - p_umin
    span_v = p_vmax - p_vmin
    print(f"  [UV-PACK] {len(active_objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f},{span_v:.3f})")
    assert span_u > 0.35 and span_v > 0.35, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_walnut_atlas(grip_objs: list[bpy.types.Object]) -> None:
    """
    Ultra-High-Texel Layout for 2048x2048 `p08_v3_walnut` (~0.62+ UV utilization, 18.2 px/mm!):
      - Left outer domed wood face:  exact isotropic metric projection in [~0.015, ~0.365] x [~0.055, ~0.945]
      - Right outer domed wood face: exact isotropic metric projection in [~0.379, ~0.729] x [~0.055, ~0.945]
      - Wood rims, inner bedding faces & screw counterbores: CONCAVE packed in [0.746, 0.992] x [0.165, 0.992]
      - Blued slotted steel grip screws: strictly firewalled in [0.746, 0.992] x [0.008, 0.148] (ZERO color bleed!)
    """
    def is_outer_wood(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        if mname != "M_WalnutWood":
            return False
        sign_y = -1.0 if obj_name == "p08_grip_right" else 1.0
        c = f.calc_center_median()
        d_sc = math.hypot(c.x - GRIP_SCREW_LX, c.z - GRIP_SCREW_LY)
        if d_sc < 0.31:
            return False
        return (f.normal.y * sign_y > 0.42) and (c.y * sign_y > 0.04)

    def is_other_wood(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        return (mname == "M_WalnutWood") and not is_outer_wood(obj_name, f, mname)

    def is_blued_screw(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        return mname == "M_GripScrew"

    _smart_unwrap_and_pack_subset(
        grip_objs, 0.746, 0.992, 0.165, 0.992,
        include_face_fn=is_other_wood, margin=0.0045,
    )
    _smart_unwrap_and_pack_subset(
        grip_objs, 0.746, 0.992, 0.008, 0.148,
        include_face_fn=is_blued_screw, margin=0.006,
    )

    for o in grip_objs:
        is_left = o.name == "p08_grip_left"
        cx_uv, cy_uv = WALNUT_LEFT_CENTER_UV if is_left else WALNUT_RIGHT_CENTER_UV
        sign_u = -1.0 if is_left else +1.0
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if not is_outer_wood(o.name, f, mname):
                continue
            for loop in f.loops:
                vco = loop.vert.co
                lx, ly = vco.x, vco.z
                sf, su = xy_local_to_sf_su(lx, ly)
                u_val = cx_uv + sign_u * (sf - WALNUT_SF_MID) * WALNUT_UV_K
                v_val = cy_uv + (su - WALNUT_SU_MID) * WALNUT_UV_K
                loop[uv_layer].uv = (_clamp(u_val, 0.005, 0.738), _clamp(v_val, 0.005, 0.995))
        bm.to_mesh(o.data)
        bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]) -> None:
    """
    Per-Material Color-Firewalled + Dedicated Axis-Aligned Hero Patch + CONCAVE `margin=0.0045`
    UV Atlas Layout for 2048x2048 `p08_v3_metal` (UV utilization > 0.55!):
      - Zone A-Hero  [0.008, 0.726] x [0.816, 0.992]: 7 crisp upright blued-steel engraving patches
      - Zone A-Knurl [0.008, 0.726] x [0.008, 0.072]: 2 compact cylindrical toggle-knurl strips (ZERO confetti!)
      - Zone A-Main  [0.008, 0.726] x [0.080, 0.808]: All remaining Imperial Rust-Blued faces (CONCAVE!)
      - Zone B-Hero  [0.742, 0.992] x [0.856, 0.992]: Mag body P.08 + Mag base underside 4821 a
      - Zone B-Main  [0.742, 0.992] x [0.320, 0.848]: All White Steel, Brushed Nickel & Alloy faces (CONCAVE!)
      - Zone C-Hero  [0.742, 0.992] x [0.228, 0.304]: Takedown lever pivot hub '21'
      - Zone C-Main  [0.742, 0.992] x [0.008, 0.220]: All 240-deg-C Straw-Gold faces (incl. frame mag-release button!)
    """
    BLUED_MATS = {"M_RustBlued", "M_RustBluedHighWear"}
    WHITE_MATS = {"M_WhiteSteel", "M_MagNickel", "M_MagAlloy"}
    STRAW_MATS = {"M_StrawGold"}

    def hero_patch_id(obj_name: str, f: bmesh.types.BMFace, mname: str) -> str | None:
        c = f.calc_center_median()
        n = f.normal
        if obj_name == "p08_barrel_extension" and mname in BLUED_MATS:
            if 1.54 <= c.x <= 3.46 and c.z > 3.02 and n.z > 0.88 and abs(c.y) < 0.62:
                return "ext_1917"
            if 1.44 <= c.x <= 3.46 and 1.38 <= c.z <= 2.74 and c.y < -0.94 and n.y < -0.92:
                return "ext_proofs"
        elif obj_name == "p08_front_toggle" and mname in BLUED_MATS:
            if -4.12 <= c.x <= -0.34 and c.z > 0.52 and n.z > 0.88:
                return "ftog_dwm"
        elif obj_name == "p08_frame" and mname in BLUED_MATS:
            if -8.45 <= c.x <= -6.12 and 0.30 <= c.z <= 1.24 and 0.80 <= c.y <= 0.92 and n.y > 0.88:
                return "frame_gesichert"
            if c.x > 3.02 and 0.44 <= c.z <= 1.32 and abs(c.y) < 0.82 and n.x > 0.88:
                return "frame_serial"
        elif obj_name == "p08_extractor" and mname in BLUED_MATS:
            if -0.40 <= c.x <= 0.42 and c.z > 0.05 and c.y > 0.13 and n.y > 0.95:
                return "ext_geladen"
        elif obj_name == "p08_sideplate" and mname in BLUED_MATS:
            if 0.42 <= c.x <= 1.38 and -0.46 <= c.z <= 0.58 and 0.10 <= c.y <= 0.17 and n.y > 0.88:
                return "sideplate_21"
        elif obj_name == "p08_mag_body" and mname == "M_MagNickel":
            if -1.05 <= c.x <= 1.05 and -5.35 <= c.z <= -3.15 and c.y > 0.58 and n.y > 0.88:
                return "mag_p08"
        elif obj_name == "p08_mag_base" and mname == "M_MagAlloy":
            if -0.95 <= c.x <= 0.95 and abs(c.y) < 0.52 and c.z < -0.34 and n.z < -0.88:
                return "mag_base_serial"
        elif obj_name == "p08_takedown_lever" and mname == "M_StrawGold":
            if math.hypot(c.x, c.z) < 0.19 and c.y > 0.215 and n.y > 0.88:
                return "td_lever_21"
        return None

    rear_tog = next(o for o in metal_objs if o.name == "p08_rear_toggle")
    knurl_vg = rear_tog.vertex_groups.get("knurl_teeth")
    knurl_v = (
        {v.index for v in rear_tog.data.vertices if any(g.group == knurl_vg.index and g.weight > 0.5 for g in v.groups)}
        if knurl_vg else set()
    )

    def is_knurl_face(obj_name: str, f: bmesh.types.BMFace) -> bool:
        return obj_name == "p08_rear_toggle" and bool(knurl_v) and all(v.index in knurl_v for v in f.verts)

    # 1. Pack Zone A-Main (Rust-Blued steel excluding Hero Patches H1..H7 & knurl teeth!)
    def in_zone_a(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        return (mname in BLUED_MATS) and (hero_patch_id(obj_name, f, mname) is None) and (not is_knurl_face(obj_name, f))

    _smart_unwrap_and_pack_subset(
        metal_objs, 0.008, 0.726, 0.080, 0.808,
        include_face_fn=in_zone_a,
        obj_scale_map={
            "p08_frame": 1.15,
            "p08_barrel_extension": 1.15,
            "p08_barrel": 0.95,
            "p08_rear_toggle": 1.10,
            "p08_front_toggle": 1.15,
            "p08_sideplate": 1.35,
            "p08_extractor": 1.25,
            "p08_sear_bar": 0.70,
        },
        margin=0.0045,
    )

    # 1b. Project ALL 456 3D diamond knurl pyramids on p08_rear_toggle cleanly into 2 tidy horizontal
    #     cylindrical bands inside Zone A-Knurl [0.008, 0.726] x [0.008, 0.072] (ZERO confetti!)
    bm_rt = bmesh.new()
    bm_rt.from_mesh(rear_tog.data)
    uv_rt = bm_rt.loops.layers.uv.verify()
    for f in bm_rt.faces:
        if not is_knurl_face("p08_rear_toggle", f):
            continue
        is_right = f.calc_center_median().y < 0.0
        # Avoid seam wrap: compute mean angle of face
        ang_c = math.atan2(f.calc_center_median().z - 0.26, f.calc_center_median().x - 3.30)
        for loop in f.loops:
            co = loop.vert.co
            ang = math.atan2(co.z - 0.26, co.x - 3.30)
            # Unwrap locally relative to face center so no tooth stretches across +/-pi!
            da = ((ang - ang_c + math.pi) % (2.0 * math.pi)) - math.pi
            u_norm = _clamp(((ang_c + da) + math.pi) / (2.0 * math.pi), 0.002, 0.998)
            v_norm = _clamp((abs(co.y) - 0.68) / 0.68, 0.0, 1.0)
            v_base = 0.042 if is_right else 0.010
            loop[uv_rt].uv = (0.010 + u_norm * 0.712, v_base + v_norm * 0.028)
    bm_rt.to_mesh(rear_tog.data)
    bm_rt.free()

    # 2. Pack Zone B-Main (White Steel + Brushed Nickel + Mag Alloy excluding H8/H9)
    def in_zone_b(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        return (mname in WHITE_MATS) and (hero_patch_id(obj_name, f, mname) is None)

    _smart_unwrap_and_pack_subset(
        metal_objs, 0.742, 0.992, 0.320, 0.848,
        include_face_fn=in_zone_b,
        obj_scale_map={
            "p08_breechblock": 1.30,
            "p08_mag_body": 0.90,
            "p08_mag_base": 1.00,
            "p08_toggle_pins": 1.15,
            "p08_mag_follower": 0.85,
            "p08_striker": 0.80,
            "p08_trigger_lever": 0.75,
            "p08_hold_open": 0.75,
        },
        margin=0.0045,
    )

    # 3. Pack Zone C-Main (240-deg-C Straw-Gold ONLY: trigger, takedown lever, thumb safety, ejector, frame mag button!)
    def in_zone_c(obj_name: str, f: bmesh.types.BMFace, mname: str) -> bool:
        return (mname in STRAW_MATS) and (hero_patch_id(obj_name, f, mname) is None)

    _smart_unwrap_and_pack_subset(
        metal_objs, 0.742, 0.992, 0.008, 0.220,
        include_face_fn=in_zone_c,
        obj_scale_map={
            "p08_trigger": 1.25,
            "p08_takedown_lever": 1.20,
            "p08_frame": 1.35,
            "p08_thumb_safety": 1.05,
            "p08_ejector": 0.80,
        },
        margin=0.0045,
    )

    # 4. Project exact upright axis-aligned planar UVs onto ALL 10 Hero Engraving Patches!
    # Every patch maps cleanly into its reserved rectangle in HERO_METAL_UVS -> 0% slicing, razor-sharp 2K PIL RNM!
    for o in metal_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        modified = False
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            hid = hero_patch_id(o.name, f, mname)
            if hid is None:
                continue
            modified = True
            u0, u1, v0, v1 = HERO_METAL_UVS[hid]
            du, dv = u1 - u0, v1 - v0
            for loop in f.loops:
                co = loop.vert.co  # Blender coords: x=tx, y=-tz, z=ty
                if hid == "ext_1917":
                    # Top chamber crest looking down from rear (+Y_b = left -> -Y_b = right, +X = top!)
                    un = _clamp((0.60 - co.y) / 1.20, 0.0, 1.0)
                    vn = _clamp((co.x - 1.54) / 1.94, 0.0, 1.0)
                elif hid == "ext_proofs":
                    # Right chamber flank looking from +Z_three (-Y_b): X in [1.44, 3.48], Z_b in [1.38, 2.74]
                    un = _clamp((co.x - 1.44) / 2.04, 0.0, 1.0)
                    vn = _clamp((co.z - 1.38) / 1.36, 0.0, 1.0)
                elif hid == "ftog_dwm":
                    # Top front-toggle deck looking down from rear (+Y_b = left -> -Y_b = right, +X = top)
                    un = _clamp((0.54 - co.y) / 1.08, 0.0, 1.0)
                    vn = _clamp((co.x - (-4.12)) / 3.78, 0.0, 1.0)
                elif hid == "frame_gesichert":
                    # Left safety pocket looking from -Z_three (+Y_b): +X = left -> -X = right, +Z_b = top!
                    un = _clamp((-6.12 - co.x) / 2.34, 0.0, 1.0)
                    vn = _clamp((co.z - 0.30) / 0.94, 0.0, 1.0)
                elif hid == "ext_geladen":
                    # Left extractor step looking from -Z_three (+Y_b): +X = left -> -X = right, +Z_b = top!
                    un = _clamp((0.42 - co.x) / 0.82, 0.0, 1.0)
                    vn = _clamp((co.z - 0.05) / 0.145, 0.0, 1.0)
                elif hid == "sideplate_21":
                    # Outer left sideplate front flat (+Y_b): +X = left -> -X = right, +Z_b = top!
                    un = _clamp((1.38 - co.x) / 0.96, 0.0, 1.0)
                    vn = _clamp((co.z - (-0.46)) / 1.04, 0.0, 1.0)
                elif hid == "frame_serial":
                    # Front dust-cover nose looking from muzzle (+X): -Y_b (right) -> +Y_b (left) => looking at nose, +Y_b is RIGHT!
                    un = _clamp((co.y - (-0.82)) / 1.64, 0.0, 1.0)
                    vn = _clamp((co.z - 0.44) / 0.88, 0.0, 1.0)
                elif hid == "mag_p08":
                    # Lower left mag flank (+Y_b): +X = left -> -X = right, +Z_b = top
                    un = _clamp((1.05 - co.x) / 2.10, 0.0, 1.0)
                    vn = _clamp((co.z - (-5.35)) / 2.20, 0.0, 1.0)
                elif hid == "mag_base_serial":
                    # Underside of mag base (-Z_b): -X -> +X, -Y_b -> +Y_b
                    un = _clamp((co.x - (-0.95)) / 1.90, 0.0, 1.0)
                    vn = _clamp((co.y - (-0.52)) / 1.04, 0.0, 1.0)
                elif hid == "td_lever_21":
                    # Outer left circular pivot boss (+Y_b): +X = left -> -X = right, +Z_b = top
                    un = _clamp((0.18 - co.x) / 0.36, 0.0, 1.0)
                    vn = _clamp((co.z - (-0.18)) / 0.36, 0.0, 1.0)
                else:
                    un, vn = 0.5, 0.5
                loop[uv_layer].uv = (u0 + un * du, v0 + vn * dv)
        if modified:
            bm.to_mesh(o.data)
        bm.free()


def audit_uv_utilization(label: str, objs: list[bpy.types.Object]) -> float:
    tot_area = 0.0
    for o in objs:
        uvs = o.data.uv_layers.active.data
        oa = 0.0
        for p in o.data.polygons:
            pts = [uvs[li].uv for li in p.loop_indices]
            for i in range(1, len(pts) - 1):
                a, b, c = pts[0], pts[i], pts[i + 1]
                oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
        tot_area += oa
    print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (target > 0.45, <= 0.98 zero-overlap)")
    assert 0.42 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"
    return tot_area


# =============================================================================
# 5. TWO-STAGE CYCLES GPU MULTI-CHANNEL BAKER (AK-15M1 GOLD STANDARD)
# =============================================================================


def _attach_bake_image_node(mats_set: set[bpy.types.Material], img: bpy.types.Image) -> list[tuple]:
    created = []
    for mat in mats_set:
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.name = "__BAKE_TARGET__"
        nt.nodes.active = tex
        created.append((nt, tex))
    return created


def _remove_bake_image_nodes(created: list[tuple]) -> None:
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set: set[bpy.types.Material], input_name: str) -> list[tuple]:
    saved = []
    for mat in mats_set:
        nt = mat.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        orig_link = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        inp = bsdf.inputs[input_name]
        if inp.is_linked:
            nt.links.new(inp.links[0].from_socket, emit.inputs["Color"])
        else:
            val = inp.default_value
            if isinstance(val, (int, float)):
                emit.inputs["Color"].default_value = (val, val, val, 1.0)
            else:
                emit.inputs["Color"].default_value = tuple(val)
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        saved.append((nt, out, emit, orig_link))
    return saved


def _restore_bsdf(saved: list[tuple]) -> None:
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path) -> None:
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]) -> None:
    for i, o in enumerate(all_objs):
        o.location = (i * 60.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)
        o.hide_render = False
    bpy.context.view_layer.update()


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]) -> None:
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            (tx, ty, tz), rot_z = ASSEMBLED_POSES[o.name]
            o.location = t2b(tx, ty, tz)
            o.rotation_euler = Euler((0.0, -rot_z, 0.0), "XYZ")
            o.scale = (1.0, 1.0, 1.0)
        else:
            o.hide_render = True
            o.location = (0.0, 200.0, 0.0)
    bpy.context.view_layer.update()


def _set_assembled_all_layout(all_objs: list[bpy.types.Object]) -> None:
    for o in all_objs:
        o.hide_render = False
        (tx, ty, tz), rot_z = ASSEMBLED_POSES[o.name]
        o.location = t2b(tx, ty, tz)
        o.rotation_euler = Euler((0.0, -rot_z, 0.0), "XYZ")
        o.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def _set_identity_layout(all_objs: list[bpy.types.Object]) -> None:
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def bake_atlas_suite(
    prefix: str,
    target_objs: list[bpy.types.Object],
    all_objs: list[bpy.types.Object],
    tmp_dir: Path,
) -> None:
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str,
        bake_type: str,
        samples: int,
        fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False,
        extra_objs_override=None,
    ):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=6, margin_type="EXTEND", use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"  [BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    # Stage 1: Isolated 60cm grid for pure Albedo, Roughness, Metalness, Tangent Normal & Self-AO
    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.025, 0.032, 0.044, 1.0) if prefix == "metal" else (0.08, 0.035, 0.015, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.28, 0.28, 0.28, 1.0) if prefix == "metal" else (0.45, 0.45, 0.45, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.88, 0.88, 0.88, 1.0) if prefix == "metal" else (0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.60
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # Stage 2: Assembled exterior pose for ray-traced inter-part Contact-AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.45
    run_bake("ao_ext", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

    # Exterior mask so postprocess applies Contact-AO ONLY to exterior parts!
    white_mat = bpy.data.materials.new("__EXT_MASK__")
    nt = white_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

    orig_mats = {}
    for o in ext_targets:
        orig_mats[o.name] = list(o.data.materials)
        o.data.materials.clear()
        o.data.materials.append(white_mat)
    img_m = bpy.data.images.new(f"{prefix}_ext_mask", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    arr = np.zeros((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
    arr[:, 3] = 1.0
    img_m.pixels.foreach_set(arr.ravel())
    nodes_m = _attach_bake_image_node({white_mat}, img_m)
    scene.cycles.samples = 1
    select_only(ext_targets, ext_targets[0])
    bpy.ops.object.bake(type="EMIT", margin=6, margin_type="EXTEND", use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)
    for o in ext_targets:
        o.data.materials.clear()
        for m in orig_mats[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


# =============================================================================
# 6. OPTIONAL CYCLES STUDIO VERIFICATION RENDERER (`--preview <dir>`)
# =============================================================================


def render_cycles_preview(scene: bpy.types.Scene, all_objs: list[bpy.types.Object], preview_dir: str) -> None:
    os.makedirs(preview_dir, exist_ok=True)
    print(f"\n[PREVIEW] Rendering studio verification shots w/ baked WebP maps into {preview_dir}...")
    _set_assembled_all_layout(all_objs)

    def make_baked_mat(mat_name: str, prefix: str, normal_str: float, clearcoat: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(mat_name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

        t_alb = nt.nodes.new("ShaderNodeTexImage")
        t_alb.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_albedo.webp"))
        t_alb.image.colorspace_settings.name = "sRGB"

        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_normal.webp"))
        t_nrm.image.colorspace_settings.name = "Non-Color"

        t_orm = nt.nodes.new("ShaderNodeTexImage")
        t_orm.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_roughness.webp"))
        t_orm.image.colorspace_settings.name = "Non-Color"

        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])

        ao_mix = nt.nodes.new("ShaderNodeMix")
        ao_mix.data_type = "RGBA"
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs[0].default_value = 0.90
        nt.links.new(t_alb.outputs["Color"], ao_mix.inputs[6])
        nt.links.new(sep.outputs["Red"], ao_mix.inputs[7])

        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_str
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])

        nt.links.new(ao_mix.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = clearcoat
            bsdf.inputs["Coat Roughness"].default_value = 0.20
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return mat

    mat_m = make_baked_mat("PrevMetal", "p08_v3_metal", 0.78, 0.26)
    mat_w = make_baked_mat("PrevWalnut", "p08_v3_walnut", 0.88, 0.04)
    for obj in all_objs:
        obj.data.materials.clear()
        obj.data.materials.append(mat_w if obj.name in WALNUT_PARTS else mat_m)

    hdri_path = REPO_ROOT / "public" / "hdri" / "tactical_vault.hdr"
    world = scene.world
    wnt = world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wbg = wnt.nodes.new("ShaderNodeBackground")
    if hdri_path.exists():
        env = wnt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_path))
        wnt.links.new(env.outputs["Color"], wbg.inputs["Color"])
        wbg.inputs["Strength"].default_value = 1.45
    else:
        wbg.inputs["Color"].default_value = (0.35, 0.38, 0.44, 1.0)
        wbg.inputs["Strength"].default_value = 1.5
    wnt.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

    def add_light(name, loc, target, energy, size, color=(1.0, 0.98, 0.95)):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    add_light("Key", t2b(6.0, 14.0, 18.0), t2b(0.5, -2.0, 0.0), 720.0, 14.0, (1.0, 0.97, 0.93))
    add_light("Rim", t2b(-12.0, 10.0, -14.0), t2b(0.0, -1.0, 0.0), 460.0, 10.0, (0.86, 0.92, 1.0))
    add_light("LeftFill", t2b(-4.0, 6.0, -18.0), t2b(-1.0, -1.5, 0.0), 460.0, 14.0, (0.95, 0.97, 1.0))

    cam_d = bpy.data.cameras.new("PrevCam")
    cam_o = bpy.data.objects.new("PrevCam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 93

    shots = [
        ("preview_iso_right.jpg", t2b(16.0, 7.0, 29.0), t2b(0.2, -2.8, 0.0), 54.0),
        ("preview_profile_right.jpg", t2b(0.8, -2.8, 32.0), t2b(0.8, -2.8, 0.0), 54.0),
        ("preview_profile_left.jpg", t2b(0.8, -2.8, -32.0), t2b(0.8, -2.8, 0.0), 54.0),
        ("preview_macro_left_controls.jpg", t2b(-2.5, 0.5, -16.0), t2b(-2.2, -1.2, -0.8), 64.0),
        ("preview_macro_right_breech.jpg", t2b(-1.5, 2.2, 15.0), t2b(-2.2, 1.5, 0.8), 64.0),
        ("preview_macro_top_1917_dwm.jpg", t2b(-6.0, 13.5, -6.5), t2b(-0.5, 2.5, 0.0), 66.0),
    ]
    for fname, loc, tgt, lens in shots:
        cam_d.lens = lens
        cam_o.location = loc
        cam_o.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(preview_dir, fname)
        bpy.ops.render.render(write_still=True)
        print(f"  [SHOT] {fname}")


# =============================================================================
# 7. MAIN ORCHESTRATOR
# =============================================================================


def main() -> None:
    t_start = time.time()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURES_DIR.mkdir(parents=True, exist_ok=True)

    preview_dir = None
    if "--preview" in sys.argv:
        idx = sys.argv.index("--preview")
        if idx + 1 < len(sys.argv):
            preview_dir = sys.argv[idx + 1]

    sys_py = find_system_python()
    scene = setup_clean_cycles_scene()

    print("\n[BUILD] Sculpting all 22 photo-grade Luger P08 parts...")
    builders: dict[str, Callable[[], bpy.types.Object]] = {
        "p08_barrel": build_p08_barrel,
        "p08_barrel_extension": build_p08_barrel_extension,
        "p08_breechblock": build_p08_breechblock,
        "p08_extractor": build_p08_extractor,
        "p08_front_toggle": build_p08_front_toggle,
        "p08_rear_toggle": build_p08_rear_toggle,
        "p08_toggle_pins": build_p08_toggle_pins,
        "p08_striker": build_p08_striker,
        "p08_frame": build_p08_frame,
        "p08_sideplate": build_p08_sideplate,
        "p08_takedown_lever": build_p08_takedown_lever,
        "p08_ejector": build_p08_ejector,
        "p08_hold_open": build_p08_hold_open,
        "p08_grip_left": lambda: build_p08_walnut_grip("left"),
        "p08_grip_right": lambda: build_p08_walnut_grip("right"),
        "p08_trigger": build_p08_trigger,
        "p08_trigger_lever": build_p08_trigger_lever,
        "p08_sear_bar": build_p08_sear_bar,
        "p08_thumb_safety": build_p08_thumb_safety,
        "p08_mag_body": build_p08_mag_body,
        "p08_mag_follower": build_p08_mag_follower,
        "p08_mag_base": build_p08_mag_base,
    }

    part_objs: dict[str, bpy.types.Object] = {}
    total_tris = 0
    for pid, fn in builders.items():
        obj = fn()
        obj.name = pid
        obj.data.name = pid
        st = verify_manifold_and_bbox(obj)
        total_tris += st["tris"]
        part_objs[pid] = obj
        print(
            f"  {pid:22s} tris={st['tris']:5d}  bnd={st['boundary']} nm={st['non_manifold']} "
            f"vol={st['volume']:7.3f} ndot={st['norm_dot']:.3f} min={st['min']} max={st['max']}"
        )
        assert st["boundary"] == 0 and st["non_manifold"] == 0, f"{pid} is NOT watertight manifold!"
        assert st["volume"] > 0.0, f"{pid} has non-positive volume!"

    print(f"[BUILD] All 22 solid parts verified watertight manifold! Total triangles: {total_tris:,}")

    # Assign physically calibrated Cycles metallurgy & walnut shaders BEFORE UV packing
    # so per-face material zone routing puts every face in its exact color-firewalled UV zone!
    mats = create_material_library()
    simple_assign = {
        "p08_barrel": mats["M_RustBluedHighWear"],
        "p08_barrel_extension": mats["M_RustBlued"],
        "p08_breechblock": mats["M_WhiteSteel"],
        "p08_extractor": mats["M_RustBlued"],
        "p08_front_toggle": mats["M_RustBlued"],
        "p08_rear_toggle": mats["M_RustBluedHighWear"],
        "p08_toggle_pins": mats["M_WhiteSteel"],
        "p08_striker": mats["M_WhiteSteel"],
        "p08_sideplate": mats["M_RustBlued"],
        "p08_takedown_lever": mats["M_StrawGold"],
        "p08_ejector": mats["M_StrawGold"],
        "p08_hold_open": mats["M_WhiteSteel"],
        "p08_trigger_lever": mats["M_WhiteSteel"],
        "p08_mag_body": mats["M_MagNickel"],
        "p08_mag_follower": mats["M_WhiteSteel"],
    }
    for pid, mat in simple_assign.items():
        part_objs[pid].data.materials.clear()
        part_objs[pid].data.materials.append(mat)

    apply_vg_materials(part_objs["p08_frame"], {"rust_blued": mats["M_RustBlued"], "straw_gold": mats["M_StrawGold"]}, mats["M_RustBlued"])
    apply_vg_materials(part_objs["p08_trigger"], {"straw_gold": mats["M_StrawGold"], "white_steel": mats["M_WhiteSteel"]}, mats["M_StrawGold"])
    apply_vg_materials(part_objs["p08_sear_bar"], {"rust_blued": mats["M_RustBlued"], "white_steel": mats["M_WhiteSteel"]}, mats["M_RustBlued"])
    apply_vg_materials(part_objs["p08_thumb_safety"], {"straw_gold": mats["M_StrawGold"], "white_steel": mats["M_WhiteSteel"]}, mats["M_StrawGold"])
    apply_vg_materials(part_objs["p08_mag_base"], {"mag_alloy": mats["M_MagAlloy"], "rust_blued": mats["M_RustBlued"]}, mats["M_MagAlloy"])
    apply_vg_materials(part_objs["p08_grip_left"], {"walnut_wood": mats["M_WalnutWood"], "blued_screw": mats["M_GripScrew"]}, mats["M_WalnutWood"])
    apply_vg_materials(part_objs["p08_grip_right"], {"walnut_wood": mats["M_WalnutWood"], "blued_screw": mats["M_GripScrew"]}, mats["M_WalnutWood"])

    walnut_objs = [part_objs[p] for p in WALNUT_PARTS]
    metal_objs = [part_objs[p] for p in METAL_PARTS]
    all_objs = walnut_objs + metal_objs

    print("\n[UV] Unwrapping & CONCAVE packing p08_v3_walnut (2 parts) & p08_v3_metal (20 parts)...")
    unwrap_walnut_atlas(walnut_objs)
    unwrap_metal_atlas(metal_objs)
    walnut_uv_area = audit_uv_utilization("walnut", walnut_objs)
    metal_uv_area = audit_uv_utilization("metal", metal_objs)

    # Two-stage GPU Metal Cycles baking + PIL RNM Post-Processing
    with tempfile.TemporaryDirectory(prefix="p08_v4_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("\n[CYCLES] Baking p08_v3_walnut (2048x2048, 2 sculpted walnut panels + screws)...")
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir)
        print("\n[CYCLES] Baking p08_v3_metal (2048x2048, 20 rust-blued / straw-gold / white-steel parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)

        print("\n[POST] Compositing 1917 DWM engravings, 20-LPI diamond checkering, palm patina & 5-Ch ORM WebPs...")
        subprocess.run(
            [sys_py, str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEXTURES_DIR)],
            check=True,
        )

    if preview_dir:
        render_cycles_preview(scene, all_objs, preview_dir)

    # Option A Export Contract: reset ALL 22 parts to identity transform (exact local part space!)
    print("\n[EXPORT] Resetting all 22 objects to Option A identity transforms & exporting Draco GLB...")
    for o in list(bpy.data.objects):
        if o.name not in part_objs:
            bpy.data.objects.remove(o, do_unlink=True)

    _set_identity_layout(all_objs)
    for obj in all_objs:
        obj.data.materials.clear()
    bpy.context.view_layer.update()

    select_only(all_objs, all_objs[0])
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_OUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="NONE",
        export_vertex_color="NONE",
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=12,
        export_draco_texcoord_quantization=12,
    )

    files = [
        GLB_OUT_PATH,
        TEXTURES_DIR / "p08_v3_metal_albedo.webp",
        TEXTURES_DIR / "p08_v3_metal_normal.webp",
        TEXTURES_DIR / "p08_v3_metal_roughness.webp",
        TEXTURES_DIR / "p08_v3_walnut_albedo.webp",
        TEXTURES_DIR / "p08_v3_walnut_normal.webp",
        TEXTURES_DIR / "p08_v3_walnut_roughness.webp",
    ]
    total_bytes = 0
    print("\n================ P08 PHOTO-GRADE V2 ASSET SUMMARY ================")
    for f in files:
        sz = f.stat().st_size
        total_bytes += sz
        print(f"  {str(f.relative_to(REPO_ROOT)):48s} {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL COMBINED SIZE: {total_mb:.2f} MB (budget <= 10.00 MB)")
    print(f"  TOTAL TRIANGLES:     {total_tris:,}")
    print(f"  UV UTILIZATION:      metal={metal_uv_area:.4f} | walnut={walnut_uv_area:.4f}")
    print(f"  ELAPSED TIME:        {time.time() - t_start:.1f}s")
    print("==================================================================")
    if total_mb > 10.0:
        raise RuntimeError(f"Asset budget exceeded: {total_mb:.2f} MB > 10.00 MB")


if __name__ == "__main__":
    main()
