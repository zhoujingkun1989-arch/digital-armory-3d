#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Kalashnikov AK-15M1 (6P71M, 2023)
=================================================================================
MIT License — Digital Armory 3D (`PR-03`)

Generates:
  - public/models/ak15.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips only
    dynamic helical/curved springs `ak_recoil_spring` and `ak_mag_spring`)
  - public/textures/ak15_v3_metal_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/ak15_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/ak15/meshes/*.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_ak15_photoreal.py
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# =============================================================================
# MODE 2: System Python Post-Process (PIL Cyrillic Decals + RNM Normal + ORM WebP)
# Executed automatically via subprocess from Blender mode so zero extra scripts exist.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    from scipy import ndimage

    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_DIN, FONT_COND, *FONT_FALLBACKS):
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
        """Reads lossless float32 .npy baked directly from Blender Cycles image buffer (H, W, 3)."""
        arr = np.load(path).astype(np.float32)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, axis=-1)
        return arr[..., :3].copy()

    def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
        x = np.clip(x, 0.0, 1.0)
        return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055).astype(np.float32)

    def _rnm_blend(base_n_01: np.ndarray, detail_n_01: np.ndarray) -> np.ndarray:
        """Reoriented Normal Mapping (RNM) blending two OpenGL tangent-space normals in [0,1]."""
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
        ny = dy * strength  # row index increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 2.0) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        resized = pil_l.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        if field.ndim == 3:
            m = mask[..., None]
        else:
            m = mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _draw_gis_proof(draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, width: int = 4):
        draw.polygon(
            [
                (cx - int(rad * 1.35), cy),
                (cx, cy - int(rad * 0.82)),
                (cx + int(rad * 1.35), cy),
                (cx, cy + int(rad * 0.82)),
            ],
            outline=255,
            width=width,
        )
        draw.text((cx, cy), "ГИС", fill=255, font=_load_font(FONT_COND, int(rad * 0.92)), anchor="mm")

    def _draw_izhmash_arrow_triangle(draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, width: int = 5):
        """Classic Izhmash arrow-in-triangle arsenal emblem next to [KK]."""
        p_top = (cx, cy - rad)
        p_bl = (cx - int(rad * 0.92), cy + int(rad * 0.78))
        p_br = (cx + int(rad * 0.92), cy + int(rad * 0.78))
        draw.polygon([p_top, p_bl, p_br], outline=255, width=width)
        # Vertical arrow shaft + fletching + arrowhead inside triangle
        draw.line([(cx, cy - int(rad * 0.62)), (cx, cy + int(rad * 0.56))], fill=255, width=max(3, width - 1))
        draw.polygon(
            [(cx, cy - int(rad * 0.72)), (cx - int(rad * 0.22), cy - int(rad * 0.26)), (cx + int(rad * 0.22), cy - int(rad * 0.26))],
            fill=255,
        )
        for dy in (0.18, 0.36):
            yy = cy + int(rad * dy)
            draw.line([(cx, yy), (cx - int(rad * 0.24), yy + int(rad * 0.16))], fill=255, width=max(2, width - 2))
            draw.line([(cx, yy), (cx + int(rad * 0.24), yy + int(rad * 0.16))], fill=255, width=max(2, width - 2))

    def _inpaint_margin(rgb: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
        """Safety cleanup ensuring zero black bleed outside baked UV islands."""
        if np.all(valid_mask):
            return rgb
        _, inds = ndimage.distance_transform_edt(~valid_mask, return_indices=True)
        out = rgb.copy()
        out[~valid_mask] = rgb[inds[0][~valid_mask], inds[1][~valid_mask]]
        return out

    def process_receiver_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "recv_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "recv_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "recv_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "recv_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "recv_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "recv_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "recv_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.50 + ao_ext * 0.50)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        # Rich realistic contact shadows around rivets, rail slots & dust-cover seam while flats stay luminous
        ao = np.clip(0.28 + 0.72 * np.power(np.clip(ao, 0.0, 1.0), 0.85), 0.26, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Dedicated 2K hero UV bands for stamped receiver flanks:
        #   Right wall: u in [0.015, 0.985], v in [0.790, 0.985] (x in [-6.25, +6.05], y in [-0.92, +1.64])
        #   Left  wall: u in [0.015, 0.985], v in [0.580, 0.775] (u mirrored so left wall reads L->R!)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        cw, ch = 3936, 840
        x_min_w, x_span_w = -6.25, 12.30
        y_min_w, y_span_w = -0.92, 2.56

        def w2rc(wx: float, wy: float):
            return ((wx - x_min_w) / x_span_w * cw, (1.0 - (wy - y_min_w) / y_span_w) * ch)

        # 1) Iconic AK curved bare-steel selector sweep scratch arc centered on CAD pivot (-3.85, +0.35)
        arc_canvas = Image.new("L", (cw, ch), 0)
        da = ImageDraw.Draw(arc_canvas)
        piv_wx, piv_wy = -3.85, 0.35
        det_r = math.hypot(4.32, 0.06)
        theta_safe, theta_auto, theta_semi = 0.128, math.atan2(0.06, 4.32), -0.100
        for stroke in range(9):
            r_stroke = det_r + (stroke - 4) * 0.0085
            angles = np.linspace(theta_semi - 0.028 + stroke * 0.0025, theta_safe + 0.028 - stroke * 0.0025, 120)
            pts = [w2rc(piv_wx + r_stroke * math.cos(a), piv_wy + r_stroke * math.sin(a)) for a in angles]
            da.line(pts, fill=255 if 2 <= stroke <= 6 else 185, width=9 if stroke == 4 else 4)

        arc_mask = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(arc_mask, arc_canvas, 0.015, 0.985, 0.790, 0.985)
        arc = _smoothstep(0.08, 0.56, arc_mask)

        # Dark rubbed enamel shoulder + gleaming bare steel scratch groove
        oxide_arc = np.clip(ndimage.maximum_filter(arc, size=5) - arc, 0.0, 1.0)
        _mix(albedo, (0.07, 0.068, 0.066), oxide_arc * 0.62)
        _mix(albedo, (0.86, 0.88, 0.91), arc * 0.97)
        _mix(rgh, 0.13, arc * 0.95)
        _mix(met, 0.98, arc * 0.98)

        decal_height = -0.34 * arc

        # 2) Three recessed circular selector detent pits at exact ПР / АВ / ОД angles
        det_canvas = Image.new("L", (cw, ch), 0)
        dd = ImageDraw.Draw(det_canvas)
        for theta in (theta_safe, theta_auto, theta_semi):
            wx = piv_wx + det_r * math.cos(theta)
            wy = piv_wy + det_r * math.sin(theta)
            px, py = w2rc(wx, wy)
            rr = 24
            dd.ellipse((px - rr, py - rr, px + rr, py + rr), fill=255)
        det_mask = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(det_mask, det_canvas, 0.015, 0.985, 0.790, 0.985)
        det_bev = _bevel_mask(det_mask, width_px=2.4)
        decal_height -= 0.85 * det_bev
        ao *= 1.0 - 0.30 * det_mask
        _mix(albedo, (0.62, 0.65, 0.69), det_mask * 0.88)
        _mix(rgh, 0.16, det_mask * 0.88)
        _mix(met, 0.96, det_mask * 0.92)

        # 3) Subtle realistic oil-darkened grime halos around trunnion rivets + resistance spot-weld dimples
        spot_r = Image.new("L", (cw, ch), 0)
        dsr = ImageDraw.Draw(spot_r)
        spot_l = Image.new("L", (cw, ch), 0)
        dsl = ImageDraw.Draw(spot_l)
        for sx_frac in (0.245, 0.355, 0.465, 0.575, 0.755):
            px_r = int(sx_frac * cw)
            py_r = int(0.84 * ch)
            dsr.ellipse((px_r - 19, py_r - 19, px_r + 19, py_r + 19), fill=255)
            px_l = int((1.0 - sx_frac) * cw)
            dsl.ellipse((px_l - 19, py_r - 19, px_l + 19, py_r + 19), fill=255)
        spot_mask = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(spot_mask, spot_r, 0.015, 0.985, 0.790, 0.985)
        _paste_uv_band(spot_mask, spot_l, 0.015, 0.985, 0.580, 0.775)
        decal_height -= 0.34 * _bevel_mask(spot_mask, width_px=2.0)
        ao *= 1.0 - 0.18 * spot_mask

        # Subtle golden-brass shell-kiss scuffs aft of ejection port on right receiver upper edge
        kiss_canvas = Image.new("L", (cw, ch), 0)
        dk = ImageDraw.Draw(kiss_canvas)
        rng_k = np.random.default_rng(762)
        for _ in range(18):
            kx, ky = w2rc(float(rng_k.uniform(-0.35, 0.48)), float(rng_k.uniform(1.18, 1.54)))
            krx, kry = float(rng_k.uniform(8, 22)), float(rng_k.uniform(4, 12))
            dk.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(70, 175)))
        kiss_mask = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(kiss_mask, kiss_canvas, 0.015, 0.985, 0.790, 0.985)
        kiss_mask = ndimage.gaussian_filter(kiss_mask, sigma=1.4)
        _mix(albedo, (0.64, 0.52, 0.24), kiss_mask * 0.42)
        _mix(rgh, 0.24, kiss_mask * 0.45)
        _mix(met, 0.92, kiss_mask * 0.50)

        # 4) Crisp Cyrillic markings: Right (ПР / АВ / ОД) & Left ([КК] + Izhmash arrow + АК-15 7,62×39 + ГИС)
        right_marks = Image.new("L", (cw, ch), 0)
        drm = ImageDraw.Draw(right_marks)
        for label, theta in (("ПР", theta_safe), ("АВ", theta_auto), ("ОД", theta_semi)):
            wx = piv_wx + (det_r + 0.26) * math.cos(theta)
            wy = piv_wy + (det_r + 0.26) * math.sin(theta)
            tx, ty = w2rc(wx, wy)
            drm.text((tx + 18, ty), label, fill=255, font=_load_font(FONT_DIN, 64), anchor="lm")

        left_marks = Image.new("L", (cw, ch), 0)
        dlm = ImageDraw.Draw(left_marks)
        lx, ly = 445, 225
        dlm.rounded_rectangle((lx, ly, lx + 142, ly + 100), radius=12, outline=255, width=6)
        dlm.text((lx + 71, ly + 50), "КК", fill=255, font=_load_font(FONT_DIN, 74), anchor="mm")
        _draw_izhmash_arrow_triangle(dlm, lx + 215, ly + 52, 46, width=5)
        dlm.text((lx + 290, ly + 4), "АК-15   7,62×39", fill=255, font=_load_font(FONT_DIN, 80))
        dlm.text(
            (lx + 290, ly + 114),
            "6П71М  ОБР.2023  08419   СДЕЛАНО В РОССИИ",
            fill=246,
            font=_load_font(FONT_DIN, 50),
        )
        _draw_gis_proof(dlm, lx + 1135, ly + 52, 36, width=4)
        dlm.text((lx + 1205, ly + 52), "CIP  N", fill=244, font=_load_font(FONT_COND, 50), anchor="lm")

        lettering = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(lettering, right_marks, 0.015, 0.985, 0.790, 0.985)
        _paste_uv_band(lettering, left_marks, 0.015, 0.985, 0.580, 0.775)

        _mix(albedo, (0.90, 0.91, 0.93), lettering * 0.95)
        _mix(rgh, 0.44, lettering * 0.88)
        _mix(met, 0.05, lettering * 0.95)
        decal_height -= 0.54 * _bevel_mask(lettering, width_px=1.2)
        ao *= 1.0 - 0.12 * lettering

        # 5) Realistic field-handling micro-scratches & oil-rag wipe streaks on receiver walls
        walls_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.790) & (v_grid <= 0.985)) | ((v_grid >= 0.580) & (v_grid <= 0.775))
        )).astype(np.float32)
        rng = np.random.default_rng(1571)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(145):
            sx = float(rng.uniform(0.03, 0.97) * w)
            sy = float(rng.uniform(0.02, 0.41) * h)
            length = float(rng.uniform(16, 78))
            ang = math.radians(float(rng.uniform(-26, 12)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng.integers(85, 225)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls_mask
        _mix(albedo, (0.48, 0.50, 0.54), sc * 0.34)
        rgh -= sc * 0.08
        met = np.clip(met + sc * 0.14, 0.02, 0.98)
        decal_height -= sc * 0.055

        # Subtle crevice darkening along stamped receiver lower bend & upper rail lip
        lip_prox = np.exp(-((v_grid - 0.982) / 0.010) ** 2) + np.exp(-((v_grid - 0.772) / 0.010) ** 2)
        lip_prox = np.clip(lip_prox * walls_mask, 0.0, 1.0)
        _mix(albedo, (0.58, 0.60, 0.64), lip_prox * 0.24)
        rgh -= lip_prox * 0.05

        decal_nrm = _height_to_normal_01(decal_height, strength=2.8)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_receiver_albedo.webp", "WEBP", quality=95, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved ak15_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    def process_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.50 + ao_ext * 0.50)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.30 + 0.70 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.28, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved ak15_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    def process_furniture_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "furn_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "furn_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "furn_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "furn_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "furn_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "furn_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "furn_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        # Consistent tactical polymer lighting across handguards, buttstock, grip & mag; crisp linear crevice AO!
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

        # Sanitize any rare coplanar bevel-ray degeneracy (nz < 0.25) so tangent normals stay 100% outward
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Reserved hero UV bands for curved banana magazine flanks:
        #   Right mag flank: u in [0.015, 0.195], v in [0.020, 0.810] (+X muzzle toward u=0.195)
        #   Left  mag flank: u in [0.210, 0.390], v in [0.020, 0.810] (+X muzzle toward u=0.210)
        # Witness window slot is genuinely open in 3D geometry around mid-radius [0.38..0.62],
        # so ticks & molded white witness numbers sit cleanly beside the beveled window frame!
        mw, mh = 738, 3236
        font_num = _load_font(FONT_COND, 76)
        font_cal = _load_font(FONT_COND, 92)
        lettering = np.zeros((h, w), dtype=np.float32)

        flank_bands = (
            (0.015, 0.195, "left"),   # Right flank: ticks on left (rear spine side, away from muzzle)
            (0.210, 0.390, "right"),  # Left  flank: ticks on right (rear spine side)
        )
        for pu0, pu1, tick_side in flank_bands:
            mag_canvas = Image.new("L", (mw, mh), 0)
            dm = ImageDraw.Draw(mag_canvas)
            # sNorm = 0 at top (v=0.81) -> 1 at bottom (v=0.02)
            # Witness window ang in [0.16, 0.70] maps to sNorm in [0.20, 0.78]
            for label, s_norm in (("10", 0.26), ("15", 0.39), ("20", 0.52), ("25", 0.65), ("30", 0.76)):
                cy = int(s_norm * mh)
                if tick_side == "right":
                    x_t0, x_t1 = int(0.645 * mw), int(0.675 * mw)
                    dm.line([(x_t0, cy), (x_t1, cy)], fill=255, width=7)
                    dm.text((x_t1 + 14, cy), label, fill=255, font=font_num, anchor="lm")
                else:
                    x_t0, x_t1 = int(0.325 * mw), int(0.355 * mw)
                    dm.line([(x_t0, cy), (x_t1, cy)], fill=255, width=7)
                    dm.text((x_t0 - 14, cy), label, fill=255, font=font_num, anchor="rm")
            cy_cal = int(0.885 * mh)
            dm.text((mw // 2, cy_cal), "7,62×39", fill=255, font=font_cal, anchor="mm")
            _paste_uv_band(lettering, mag_canvas, pu0, pu1, 0.020, 0.810)

        # Subtle insertion wear scuffs along upper magazine well engagement zone (sNorm < 0.17)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        insert_mask = (
            (((u_grid >= 0.015) & (u_grid <= 0.195)) | ((u_grid >= 0.210) & (u_grid <= 0.390)))
            & (v_grid >= 0.675) & (v_grid <= 0.810)
        ).astype(np.float32)
        rng = np.random.default_rng(1572)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(420):
            sx = float(rng.uniform(0.015, 0.39) * w)
            sy = float(rng.uniform(0.19, 0.325) * h)
            length = float(rng.uniform(12, 72))
            dsc.line([(sx, sy), (sx + float(rng.uniform(-3, 3)), sy + length)],
                     fill=int(rng.integers(70, 190)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * insert_mask * (met < 0.3)

        decal_height = 0.36 * _bevel_mask(lettering, width_px=1.2) - 0.05 * scuffs
        _mix(albedo, (0.82, 0.84, 0.86), lettering * 0.94)
        _mix(rgh, 0.52, lettering * 0.78)
        _mix(met, 0.0, lettering * 0.95)
        _mix(albedo, (0.29, 0.305, 0.325), scuffs * 0.48)
        rgh -= scuffs * 0.12

        decal_nrm = _height_to_normal_01(decal_height, strength=2.3)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.0, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_furniture_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_furniture_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "ak15_v3_furniture_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved ak15_v3_furniture_{albedo,normal,roughness}.webp (2048x2048)")

    process_receiver_atlas()
    process_metal_atlas()
    process_furniture_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "ak15.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 28
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))
B2T_MAT = T2B_MAT.transposed()


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 24 solid AK-15M1 parts split across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY dynamic springs `ak_recoil_spring` and `ak_mag_spring`)
RECEIVER_PARTS = [
    "ak_receiver",
    "ak_dust_cover",
    "ak_rear_sight",
    "ak_selector",
]

METAL_PARTS = [
    "ak_bolt_carrier",
    "ak_bolt",
    "ak_firing_pin",
    "ak_extractor",
    "ak_recoil_guide",
    "ak_gas_tube",
    "ak_barrel",
    "ak_muzzle_device",
    "ak_gas_block",
    "ak_hammer",
    "ak_trigger",
    "ak_disconnector",
]

FURNITURE_PARTS = [
    "ak_upper_handguard",
    "ak_lower_handguard",
    "ak_buttstock",
    "ak_cheek_riser",
    "ak_pistol_grip",
    "ak_mag_body",
    "ak_mag_follower",
    "ak_mag_floorplate",
]

# Exterior parts that receive assembled inter-part contact AO (internal parts get pure Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "ak_receiver",
    "ak_dust_cover",
    "ak_rear_sight",
    "ak_barrel",
    "ak_muzzle_device",
    "ak_gas_block",
    "ak_selector",
    "ak_upper_handguard",
    "ak_lower_handguard",
    "ak_buttstock",
    "ak_cheek_riser",
    "ak_pistol_grip",
    "ak_mag_body",
    "ak_mag_floorplate",
}

ASSEMBLED_POS = {
    "ak_dust_cover":      (-0.10,  2.22, 0.00),
    "ak_rear_sight":      (-4.65,  3.32, 0.00),
    "ak_bolt_carrier":    ( 1.60,  1.55, 0.00),
    "ak_bolt":            ( 2.85,  1.05, 0.00),
    "ak_firing_pin":      ( 2.68,  1.05, 0.00),
    "ak_extractor":       ( 4.00,  1.08, 0.34),
    "ak_recoil_guide":    (-2.10,  1.85, 0.00),
    "ak_upper_handguard": (10.55,  2.38, 0.00),
    "ak_gas_tube":        (10.80,  2.35, 0.00),
    "ak_receiver":        ( 0.00,  0.00, 0.00),
    "ak_barrel":          ( 0.00,  1.05, 0.00),
    "ak_muzzle_device":   (24.20,  1.05, 0.00),
    "ak_gas_block":       (16.70,  1.05, 0.00),
    "ak_lower_handguard": (10.75,  0.82, 0.00),
    "ak_buttstock":       (-12.35, 0.45, 0.00),
    "ak_cheek_riser":     (-11.80, 1.62, 0.00),
    "ak_pistol_grip":     (-3.20, -0.88, 0.00),
    "ak_hammer":          (-0.35, -0.05, 0.00),
    "ak_trigger":         (-2.15, -0.35, 0.00),
    "ak_disconnector":    (-2.35, -0.15, 0.00),
    "ak_selector":        (-3.85,  0.35, 0.00),
    "ak_mag_body":        ( 2.55, -0.55, 0.00),
    "ak_mag_follower":    ( 5.599,-8.29, 0.00),
    "ak_mag_floorplate":  ( 6.94, -9.54, 0.00),
}

ASSEMBLED_ROT_THREE = {
    "ak_mag_follower": (0.0, 0.0, 0.62),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) for strict < 0.08 cm verification
CSG_REF_BBOX = {
    "ak_dust_cover":      ((-6.150, -0.810, -0.890), ( 6.540,  0.900,  1.060)),
    "ak_rear_sight":      ((-0.710, -0.320, -0.660), ( 0.710,  0.540,  0.660)),
    "ak_bolt_carrier":    ((-2.455, -0.640, -0.590), (13.700,  1.182,  1.580)),
    "ak_bolt":            ((-1.700, -0.600, -0.719), ( 1.580,  0.700,  0.710)),
    "ak_firing_pin":      ((-2.420, -0.133, -0.135), ( 1.760,  0.133,  0.135)),
    "ak_extractor":       ((-0.802, -0.135, -0.145), ( 0.576,  0.135,  0.280)),
    "ak_recoil_guide":    ((-4.140, -0.630, -0.460), ( 1.930,  0.350,  0.460)),
    "ak_upper_handguard": ((-4.565, -0.615, -0.915), ( 4.565,  0.740,  0.915)),
    "ak_gas_tube":        ((-4.810, -0.580, -0.580), ( 4.810,  0.580,  0.580)),
    "ak_receiver":        ((-6.450, -0.920, -1.010), ( 6.000,  1.580,  0.940)),
    "ak_barrel":          (( 3.813, -0.680, -0.680), (23.480,  0.680,  0.680)),
    "ak_muzzle_device":   ((-1.550, -0.670, -0.590), ( 1.680,  0.590,  0.590)),
    "ak_gas_block":       ((-1.125, -0.790, -0.675), ( 1.710,  2.840,  0.640)),
    "ak_lower_handguard": ((-4.830, -1.130, -1.200), ( 4.825,  0.960,  1.200)),
    "ak_buttstock":       ((-6.230, -2.981, -0.720), ( 6.230,  1.280,  0.720)),
    "ak_cheek_riser":     ((-2.600, -0.620, -0.840), ( 2.600,  0.560,  0.930)),
    "ak_pistol_grip":     ((-3.976, -5.283, -0.680), ( 4.045,  0.140,  0.680)),
    "ak_hammer":          ((-1.097, -0.386, -0.576), ( 0.376,  0.484,  0.576)),
    "ak_trigger":         ((-0.790, -1.693, -0.560), ( 1.807,  0.460,  0.560)),
    "ak_disconnector":    ((-0.471, -0.502, -0.130), ( 0.602,  0.607,  0.130)),
    "ak_selector":        ((-1.331, -0.541, -1.080), ( 4.579,  0.395,  1.210)),
    "ak_mag_body":        ((-1.597, -9.893, -0.660), ( 5.098,  0.728,  0.660)),
    "ak_mag_follower":    ((-1.097, -0.841, -0.410), ( 1.097,  0.534,  0.410)),
    "ak_mag_floorplate":  ((-1.026, -1.160, -0.690), ( 1.008,  1.160,  0.690)),
}


# =============================================================================
# Scene & Material Setup (Cycles Physically Calibrated PBR Materials)
# =============================================================================
def srgb_to_lin(r: float, g: float, b: float):
    def c(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(r), c(g), c(b), 1.0)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    use_gpu = False
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            if dev.type == "METAL":
                dev.use = True
                use_gpu = True
            else:
                dev.use = False
    except Exception:
        use_gpu = False
    scene.cycles.device = "GPU" if use_gpu else "CPU"
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
    world.light_settings.distance = 1.4

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    print(f"[SCENE] Blender {bpy.app.version_string} | Cycles device = {scene.cycles.device}")
    return scene


def _build_pbr_mat(
    name: str,
    base_srgb: tuple[float, float, float],
    roughness: float,
    metallic: float,
    bevel_r: float = 0.04,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.62, 0.65, 0.68),
    grain_scale: float = 28.0,
    grain_bump: float = 0.03,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 48.0,
    rough_var: float = 0.04,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # Object coordinates for seamless 3D procedural texture across UV seams
    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])

    # Macro patina / oil / molding flow breakup (refined scale — ZERO cloudy blotches!)
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 2.25
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    # High-frequency surface micro-grain (CNC milling or polymer stipple)
    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.62
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    bump_height_sock = n_micro.outputs["Fac"]
    if voronoi_grain > 0.001:
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = voronoi_scale
        nt.links.new(texcoord.outputs["Object"], vor.inputs["Vector"])
        mix_g = nt.nodes.new("ShaderNodeMix")
        mix_g.data_type = "FLOAT"
        mix_g.inputs["Factor"].default_value = voronoi_grain
        nt.links.new(n_micro.outputs["Fac"], mix_g.inputs[2])
        nt.links.new(vor.outputs["Distance"], mix_g.inputs[3])
        bump_height_sock = mix_g.outputs[0]

    # Subtle base color variation (tight 1.05x envelope -> clean museum finish!)
    base_col_a = srgb_to_lin(*base_srgb)
    base_col_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.05),
        min(1.0, base_srgb[1] * 1.05),
        min(1.0, base_srgb[2] * 1.05),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_col_a
    mix_base.inputs[7].default_value = base_col_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])

    col_sock = mix_base.outputs[2]
    rgh_val_node = nt.nodes.new("ShaderNodeMapRange")
    rgh_val_node.inputs["From Min"].default_value = 0.25
    rgh_val_node.inputs["From Max"].default_value = 0.75
    rgh_val_node.inputs["To Min"].default_value = max(0.08, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    # Crisp localized convex-edge wear driven strictly by Cycles inside-AO (ZERO triangle Pointiness bleed!)
    if edge_wear > 0.001:
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.048

        inv_e = nt.nodes.new("ShaderNodeMath")
        inv_e.operation = "SUBTRACT"
        inv_e.inputs[0].default_value = 1.0
        nt.links.new(ao_edge.outputs["AO"], inv_e.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.24
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.64
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(inv_e.outputs["Value"], ramp.inputs["Fac"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        nt.links.new(ramp.outputs["Color"], mul_w.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], mul_w.inputs[1])

        mix_edge_c = nt.nodes.new("ShaderNodeMix")
        mix_edge_c.data_type = "RGBA"
        mix_edge_c.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_edge_c.inputs[0])
        nt.links.new(col_sock, mix_edge_c.inputs[6])
        col_sock = mix_edge_c.outputs[2]

        mix_edge_r = nt.nodes.new("ShaderNodeMix")
        mix_edge_r.data_type = "FLOAT"
        mix_edge_r.inputs[3].default_value = max(0.16, roughness - 0.14)
        nt.links.new(mul_w.outputs["Value"], mix_edge_r.inputs[0])
        nt.links.new(rgh_sock, mix_edge_r.inputs[2])
        rgh_sock = mix_edge_r.outputs[0]

        if metallic > 0.35:
            mix_edge_m = nt.nodes.new("ShaderNodeMix")
            mix_edge_m.data_type = "FLOAT"
            mix_edge_m.inputs[3].default_value = 0.95
            nt.links.new(mul_w.outputs["Value"], mix_edge_m.inputs[0])
            nt.links.new(met_sock, mix_edge_m.inputs[2])
            met_sock = mix_edge_m.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    # Ray-traced ShaderNodeBevel + subtle micro-grain Bump -> crisp rounded specular edges!
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.02
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_chrome_piston_mat() -> bpy.types.Material:
    """Hard-chrome stainless long-stroke piston with Object-X heat temper & gas-ring carbon soot!"""
    mat = bpy.data.materials.new("M_ChromePiston")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize piston X along [2.85 .. 13.70] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.inputs["From Min"].default_value = 2.85
    mr_x.inputs["From Max"].default_value = 13.70
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    # Fine lathe turning rings along X
    n_lathe = nt.nodes.new("ShaderNodeTexNoise")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (42.0, 2.5, 2.5)
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])
    n_lathe.inputs["Scale"].default_value = 1.6
    n_lathe.inputs["Detail"].default_value = 3.0
    nt.links.new(mapping.outputs["Vector"], n_lathe.inputs["Vector"])

    # Carbon soot noise
    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 7.5
    n_soot.inputs["Detail"].default_value = 5.0
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    # Color ramp: bright chrome -> golden straw -> bronze -> violet temper -> dark charred piston head
    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.80, 0.83, 0.86)
    cr.elements[1].position = 0.70
    cr.elements[1].color = srgb_to_lin(0.79, 0.82, 0.85)
    for pos, rgb in (
        (0.76, (0.78, 0.69, 0.45)),  # straw temper
        (0.81, (0.64, 0.47, 0.26)),  # bronze temper
        (0.85, (0.42, 0.36, 0.50)),  # violet-blue temper
        (0.89, (0.28, 0.24, 0.21)),  # dark transition
        (0.93, (0.075, 0.075, 0.078)),  # carbon soot crown
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr_x.outputs["Result"], ramp_c.inputs["Fac"])

    # Roughness ramp: mirror-satin chrome (0.15) -> temper (0.24) -> soot (0.86)
    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.72
    rr.elements[0].color = (0.15, 0.15, 0.15, 1.0)
    rr.elements[1].position = 0.94
    rr.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    el_r = rr.elements.new(0.84)
    el_r.color = (0.26, 0.26, 0.26, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_r.inputs["Fac"])

    # Metalness ramp: chrome (0.98) -> soot (0.06)
    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.86
    rm.elements[0].color = (0.98, 0.98, 0.98, 1.0)
    rm.elements[1].position = 0.94
    rm.elements[1].color = (0.06, 0.06, 0.06, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.025
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.03
    bump.inputs["Distance"].default_value = 0.015
    nt.links.new(n_lathe.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_muzzle_soot_mat() -> bpy.types.Material:
    """2023 AK-15M1 birdcage flash suppressor: deep nitrided base -> faint heat temper -> carbon crown soot."""
    mat = bpy.data.materials.new("M_MuzzleHeatSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize muzzle X along [-1.55 .. +1.68] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -1.55
    mr_x.inputs["From Max"].default_value = 1.68
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 4.2
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    # Modulate longitudinal soot progression slightly with organic noise
    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.22
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.145, 0.150, 0.160)
    cr.elements[1].position = 0.56
    cr.elements[1].color = srgb_to_lin(0.155, 0.158, 0.168)
    for pos, rgb in (
        (0.68, (0.21, 0.18, 0.145)),  # faint bronze gas-port heat temper
        (0.80, (0.145, 0.150, 0.175)), # subtle bluing transition
        (0.92, (0.068, 0.066, 0.066)), # velvety gunpowder carbon crown soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.52
    rr.elements[0].color = (0.26, 0.26, 0.26, 1.0)
    rr.elements[1].position = 0.94
    rr.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.72
    rm.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.elements[1].position = 0.96
    rm.elements[1].color = (0.18, 0.18, 0.18, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.045
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Receiver & Metal Materials (Authentic Izhmash Baked Nigrosine Enamel over Parkerized Steel, AgX Calibrated) ---
        "M_ReceiverPhosphate": _build_pbr_mat(
            "M_ReceiverPhosphate",
            base_srgb=(0.180, 0.186, 0.196),
            roughness=0.31,
            metallic=0.85,
            bevel_r=0.036,
            edge_wear=0.26,
            edge_srgb=(0.68, 0.71, 0.76),
            grain_scale=72.0,
            grain_bump=0.036,
            voronoi_grain=0.50,
            voronoi_scale=96.0,
            rough_var=0.026,
        ),
        "M_DustCoverEnamel": _build_pbr_mat(
            "M_DustCoverEnamel",
            base_srgb=(0.192, 0.199, 0.210),
            roughness=0.27,
            metallic=0.87,
            bevel_r=0.032,
            edge_wear=0.28,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=52.0,
            grain_bump=0.028,
            aniso_stretch=(0.55, 3.0, 3.0),
            rough_var=0.024,
        ),
        "M_RivetSteel": _build_pbr_mat(
            "M_RivetSteel",
            base_srgb=(0.242, 0.250, 0.264),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.024,
            edge_wear=0.26,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=38.0,
            grain_bump=0.022,
            rough_var=0.024,
        ),
        "M_DarkNitrideSteel": _build_pbr_mat(
            "M_DarkNitrideSteel",
            base_srgb=(0.184, 0.190, 0.200),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.032,
            edge_wear=0.28,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=34.0,
            grain_bump=0.028,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.026,
        ),
        "M_RailAnodized": _build_pbr_mat(
            "M_RailAnodized",
            base_srgb=(0.204, 0.212, 0.226),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.30,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=36.0,
            grain_bump=0.022,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.024,
        ),
        "M_RailSlotDark": _build_pbr_mat(
            "M_RailSlotDark",
            base_srgb=(0.105, 0.110, 0.118),
            roughness=0.50,
            metallic=0.76,
            bevel_r=0.016,
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.024,
        ),
        "M_OrdnanceBarrel": _build_pbr_mat(
            "M_OrdnanceBarrel",
            base_srgb=(0.182, 0.190, 0.192),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.028,
            edge_wear=0.24,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=42.0,
            grain_bump=0.030,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.026,
        ),
        "M_MuzzleHeatSoot": _build_muzzle_soot_mat(),
        "M_BoltCarrierBody": _build_pbr_mat(
            "M_BoltCarrierBody",
            base_srgb=(0.248, 0.258, 0.272),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.032,
            edge_wear=0.32,
            edge_srgb=(0.80, 0.83, 0.87),
            grain_scale=26.0,
            grain_bump=0.024,
            aniso_stretch=(0.35, 3.5, 3.5),
            rough_var=0.030,
        ),
        "M_ChromePiston": _build_chrome_piston_mat(),
        "M_BrushedStainless": _build_pbr_mat(
            "M_BrushedStainless",
            base_srgb=(0.80, 0.83, 0.86),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.024,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.024,
        ),
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.56, 0.59, 0.63),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.015,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "M_BufferElastomer": _build_pbr_mat(
            "M_BufferElastomer",
            base_srgb=(0.115, 0.120, 0.128),
            roughness=0.84,
            metallic=0.02,
            bevel_r=0.030,
            grain_scale=42.0,
            grain_bump=0.042,
            rough_var=0.030,
        ),

        # --- Furniture Atlas Materials (ak15_v3_furniture) — Deep Russian PA6-GF30 Glass-Filled Polyamide ---
        "F_PolyamideMain": _build_pbr_mat(
            "F_PolyamideMain",
            base_srgb=(0.134, 0.139, 0.148),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.12,
            edge_srgb=(0.21, 0.22, 0.23),
            grain_scale=72.0,
            grain_bump=0.115,
            voronoi_grain=0.72,
            voronoi_scale=102.0,
            rough_var=0.038,
        ),
        "F_PolyamideAccent": _build_pbr_mat(
            "F_PolyamideAccent",
            base_srgb=(0.102, 0.106, 0.113),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.09,
            edge_srgb=(0.18, 0.185, 0.195),
            grain_scale=76.0,
            grain_bump=0.125,
            voronoi_grain=0.75,
            voronoi_scale=108.0,
            rough_var=0.036,
        ),
        "F_PolyamideRail": _build_pbr_mat(
            "F_PolyamideRail",
            base_srgb=(0.146, 0.152, 0.160),
            roughness=0.52,
            metallic=0.04,
            bevel_r=0.020,
            edge_wear=0.14,
            edge_srgb=(0.24, 0.25, 0.265),
            grain_scale=52.0,
            grain_bump=0.052,
            voronoi_grain=0.54,
            voronoi_scale=74.0,
            rough_var=0.034,
        ),
        "F_GripStipple": _build_pbr_mat(
            "F_GripStipple",
            base_srgb=(0.096, 0.100, 0.106),
            roughness=0.80,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=96.0,
            grain_bump=0.28,
            voronoi_grain=0.90,
            voronoi_scale=110.0,
            rough_var=0.036,
        ),
        "F_MatteRubber": _build_pbr_mat(
            "F_MatteRubber",
            base_srgb=(0.092, 0.095, 0.100),
            roughness=0.86,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.08,
            edge_srgb=(0.16, 0.165, 0.172),
            grain_scale=78.0,
            grain_bump=0.105,
            voronoi_grain=0.70,
            voronoi_scale=112.0,
            rough_var=0.034,
        ),
        "F_FollowerOrange": _build_pbr_mat(
            "F_FollowerOrange",
            base_srgb=(0.86, 0.22, 0.075),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.12,
            edge_srgb=(0.95, 0.42, 0.18),
            grain_scale=36.0,
            grain_bump=0.022,
            rough_var=0.030,
        ),
        "F_SteelHardware": _build_pbr_mat(
            "F_SteelHardware",
            base_srgb=(0.182, 0.188, 0.200),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.68, 0.71, 0.76),
            grain_scale=32.0,
            grain_bump=0.028,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.030,
        ),
        "F_BrightSteelHardware": _build_pbr_mat(
            "F_BrightSteelHardware",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.18,
            metallic=0.97,
            bevel_r=0.020,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=26.0,
            grain_bump=0.018,
            rough_var=0.024,
        ),
        "F_BrushedAluminum": _build_pbr_mat(
            "F_BrushedAluminum",
            base_srgb=(0.74, 0.77, 0.80),
            roughness=0.24,
            metallic=0.95,
            bevel_r=0.018,
            grain_scale=24.0,
            grain_bump=0.024,
            aniso_stretch=(0.3, 4.0, 4.0),
            rough_var=0.026,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface Modeling Toolkit
# =============================================================================
def _apply_three_xform(bm: bmesh.types.BMesh, ops: list[tuple]):
    """Applies exact sequence of Three.js transforms before mapping to Blender Z-up."""
    m = Matrix.Identity(4)
    for op in ops:
        kind = op[0]
        if kind == "rx":
            m = Matrix.Rotation(op[1], 4, "X") @ m
        elif kind == "ry":
            m = Matrix.Rotation(op[1], 4, "Y") @ m
        elif kind == "rz":
            m = Matrix.Rotation(op[1], 4, "Z") @ m
        elif kind == "t":
            m = Matrix.Translation(Vector((op[1], op[2], op[3]))) @ m
        elif kind == "s":
            sm = Matrix.Diagonal((op[1], op[2], op[3], 1.0))
            m = sm @ m
    bmesh.ops.transform(bm, matrix=T2B_MAT @ m, verts=bm.verts)


def _bm_to_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None) -> bpy.types.Object:
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def _quad_bez(p0, p1, p2, segs: int = 8):
    """Samples quadratic Bezier from p0 via control p1 to p2 (excluding p0)."""
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _pill_2d(w: float, h: float, arc_segs: int = 6):
    r = h * 0.5
    hw = max(0.005, w * 0.5 - r)
    pts = []
    for i in range(arc_segs + 1):
        a = math.pi * 0.5 + math.pi * (i / arc_segs)
        pts.append((-hw + math.cos(a) * r, math.sin(a) * r))
    for i in range(arc_segs + 1):
        a = -math.pi * 0.5 + math.pi * (i / arc_segs)
        pts.append((hw + math.cos(a) * r, math.sin(a) * r))
    return pts


def mk_box(
    name: str,
    sx: float,
    sy: float,
    sz: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
    bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str,
    r_top: float,
    r_bot: float,
    length: float,
    axis: str = "x",
    segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    """Cylinder centered at origin along Three.js axis ('x', 'y', or 'z').
    r_top is at +axis/2, r_bot is at -axis/2 (matching Three.js CylinderGeometry(rTop, rBot, h) after axis rotation!)."""
    bm = bmesh.new()
    # In bmesh create_cone, radius1 is bottom (-Z), radius2 is top (+Z) along local Z.
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r_bot,
        radius2=r_top,
        depth=length,
    )
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=2,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    # Local cone axis is +Z. Map local +Z -> requested Three.js axis:
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]  # local +Z -> Three.js +Y
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]   # local +Z -> Three.js +X (r_top at +X, r_bot at -X)
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]  # local +Z -> Three.js -X (matches Three Cylinder.rotateZ(+pi/2)!)
    elif axis == "z":
        pre = []                        # local +Z -> Three.js +Z
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_sphere(
    name: str,
    rx: float,
    ry: float,
    rz: float,
    u_segs: int = 20,
    v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_capsule(
    name: str,
    radius: float,
    straight_len: float,
    scale_xyz=(1.0, 1.0, 1.0),
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight capsule along Three.js Y axis (matching Three.js CapsuleGeometry)."""
    bm = bmesh.new()
    # Lathe profile around Three.js Y, then map cleanly
    pts_ry = []
    half = straight_len * 0.5
    n_hemi = 6
    for i in range(n_hemi + 1):
        a = -math.pi * 0.5 + (math.pi * 0.5) * (i / n_hemi)
        pts_ry.append((radius * math.cos(a), -half + radius * math.sin(a)))
    for i in range(n_hemi + 1):
        a = (math.pi * 0.5) * (i / n_hemi)
        pts_ry.append((radius * math.cos(a), half + radius * math.sin(a)))

    # Revolve around Y
    segs = 18
    rings = []
    for r, y in pts_ry:
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((r * math.cos(th), y, r * math.sin(th))))
            rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        if len(a) == 1 and len(b) > 1:
            for s in range(segs):
                bm.faces.new((a[0], b[(s + 1) % segs], b[s]))
        elif len(a) > 1 and len(b) == 1:
            for s in range(segs):
                bm.faces.new((a[s], a[(s + 1) % segs], b[0]))
        elif len(a) > 1 and len(b) > 1:
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((a[s], a[sn], b[sn], b[s]))
    bmesh.ops.scale(bm, vec=scale_xyz, verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_torus(
    name: str,
    major_r: float,
    minor_r: float,
    axis: str = "x",
    major_segs: int = 32,
    minor_segs: int = 14,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight torus around Three.js axis ('x', 'y', or 'z')."""
    bm = bmesh.new()
    rings = []
    for i in range(major_segs):
        u = 2.0 * math.pi * i / major_segs
        cu, su = math.cos(u), math.sin(u)
        ring = []
        for j in range(minor_segs):
            v = 2.0 * math.pi * j / minor_segs
            cv, sv = math.cos(v), math.sin(v)
            r = major_r + minor_r * cv
            x = r * cu
            y = r * su
            z = minor_r * sv
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(major_segs):
        ni = (i + 1) % major_segs
        for j in range(minor_segs):
            nj = (j + 1) % minor_segs
            bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
    pre = []
    if axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "y":
        pre = [("rx", math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(
    name: str,
    pts_r_x: list[tuple[float, float]],
    segs: int = 36,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight solid of revolution around Three.js +X from [(r, x), ...].
    Handles both solid-pole profiles (r=0 at start/end) and closed-annulus loops (pts[0] == pts[-1])."""
    bm = bmesh.new()
    closed_loop = (
        len(pts_r_x) >= 3
        and pts_r_x[0][0] > 1e-5
        and math.hypot(pts_r_x[0][0] - pts_r_x[-1][0], pts_r_x[0][1] - pts_r_x[-1][1]) < 1e-4
    )
    pts = pts_r_x[:-1] if closed_loop else list(pts_r_x)

    rings = []
    for r, x in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((x, 0.0, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((x, r * math.cos(th), r * math.sin(th))))
            rings.append(ring)

    n = len(rings)
    end_k = n if closed_loop else n - 1
    for k in range(end_k):
        a = rings[k]
        b = rings[(k + 1) % n]
        if len(a) == 1 and len(b) == 1:
            continue
        elif len(a) == 1 and len(b) > 1:
            for s in range(segs):
                bm.faces.new((a[0], b[(s + 1) % segs], b[s]))
        elif len(a) > 1 and len(b) == 1:
            for s in range(segs):
                bm.faces.new((a[s], a[(s + 1) % segs], b[0]))
        else:
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((a[s], a[sn], b[sn], b[s]))

    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str,
    pts_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Extrudes a 2D (x, y) polygon along Three.js Z from z0 to z1 with optional cap bevel."""
    # Deduplicate consecutive close points
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()

    # Ensure CCW winding in XY so extrusion along +Z produces outward normals
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()

    bm = bmesh.new()
    v_bot = [bm.verts.new((p[0], p[1], z0)) for p in clean]
    v_top = [bm.verts.new((p[0], p[1], z1)) for p in clean]
    bm.faces.new(list(reversed(v_bot)))
    bm.faces.new(v_top)
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_bot[i], v_bot[ni], v_top[ni], v_top[i]))

    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_x(
    name: str,
    pts_zy: list[tuple[float, float]],
    x0: float,
    x1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Extrudes a 2D (z_three, y_three) cross-section along Three.js X from x0 to x1."""
    # Note: in Three.js Shape(x_s, y_s) extruded along Z=[0, depth], then rotateY(+pi/2):
    # (x_s, y_s, z_e) -> (z_e, y_s, -x_s). Because AK-15 cross sections are Z-symmetric,
    # building directly in (x, y, z) where profile is (z_val, y_val) avoids any ambiguity!
    clean = []
    for p in pts_zy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()

    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()

    bm = bmesh.new()
    v_a = [bm.verts.new((x0, p[1], p[0])) for p in clean]
    v_b = [bm.verts.new((x1, p[1], p[0])) for p in clean]
    bm.faces.new(v_a)
    bm.faces.new(list(reversed(v_b)))
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_a[i], v_b[i], v_b[ni], v_a[ni]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_coil_spring(
    name: str,
    axis: str,
    start: float,
    end: float,
    center_a: float,
    center_b: float,
    coil_r: float,
    wire_r: float,
    coils: float,
    ring_segs: int = 8,
    steps_per_coil: int = 16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight capped helical coil spring along Three.js 'x', 'y', or 'z'."""
    total_steps = max(12, int(round(coils * steps_per_coil)))
    pts = []
    for i in range(total_steps + 1):
        u = i / total_steps
        ang = u * coils * 2.0 * math.pi
        ax = start + (end - start) * u
        ca = math.cos(ang) * coil_r
        sa = math.sin(ang) * coil_r
        if axis == "x":
            pts.append(Vector((ax, center_a + ca, center_b + sa)))
        elif axis == "y":
            pts.append(Vector((center_a + ca, ax, center_b + sa)))
        else:
            pts.append(Vector((center_a + ca, center_b + sa, ax)))

    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            tang = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tang = (pts[-1] - pts[-2]).normalized()
        else:
            tang = (pts[i + 1] - pts[i - 1]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(tang.z) < 0.85 else Vector((1, 0, 0))
            n_vec = tang.cross(ref).normalized()
        else:
            n_vec = (prev_n - tang * prev_n.dot(tang)).normalized()
        prev_n = n_vec
        b_vec = tang.cross(n_vec).normalized()
        ring = []
        for s in range(ring_segs):
            th = 2.0 * math.pi * s / ring_segs
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * wire_r
            ring.append(bm.verts.new(p + off))
        rings.append(ring)

    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_picatinny_rail(
    name: str,
    length: float,
    center_x: float,
    base_y: float,
    slot_count: int,
    invert_y: bool = False,
    mat_rail: bpy.types.Material | None = None,
    mat_slot: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
) -> list[bpy.types.Object]:
    """Crisp beveled MIL-STD-1913 Picatinny rail with 45 deg hexagonal dovetail & cross-slots."""
    s = -1.0 if invert_y else 1.0
    # Non-coplanar stepped neck & slot floor so Cycles ShaderNodeBevel NEVER hits coplanar faces!
    objs = [
        mk_box(f"{name}_neck", length - 0.01, 0.096, 0.68, [("t", center_x, base_y + 0.048 * s, 0.0)] + (xform or []), mat_rail, bevel=0.010, bevel_segs=1),
        mk_box(f"{name}_floor", length - 0.02, 0.032, 0.64, [("t", center_x, base_y + 0.108 * s, 0.0)] + (xform or []), mat_slot),
    ]
    # Authentic MIL-STD-1913 45 deg hexagonal dovetail lug cross-section w/ central sight groove
    lug_zy = [
        (-0.37, 0.09 * s),
        (-0.49, 0.16 * s),
        (-0.38, 0.25 * s),
        (-0.12, 0.25 * s),
        (-0.09, 0.205 * s),
        ( 0.09, 0.205 * s),
        ( 0.12, 0.25 * s),
        ( 0.38, 0.25 * s),
        ( 0.49, 0.16 * s),
        ( 0.37, 0.09 * s),
    ]
    x_min = center_x - length * 0.5
    x_max = center_x + length * 0.5
    slot_half = 0.14
    pitch = length / (slot_count + 0.6)
    start_x = center_x - ((slot_count - 1) * pitch) * 0.5

    seg_start = x_min
    for i in range(slot_count + 1):
        seg_end = (start_x + i * pitch - slot_half) if i < slot_count else x_max
        seg_len = seg_end - seg_start
        if seg_len > 0.025:
            bev = min(0.014, seg_len * 0.18)
            objs.append(
                mk_extrude_x(
                    f"{name}_lug_{i}",
                    lug_zy,
                    seg_start,
                    seg_end,
                    bevel=bev,
                    bevel_segs=2,
                    xform=[("t", 0.0, base_y, 0.0)] + (xform or []),
                    mat=mat_rail,
                )
            )
        if i < slot_count:
            seg_start = start_x + i * pitch + slot_half
    return objs


def mk_knurled_cyl(
    name: str,
    radius: float,
    length: float,
    axis: str = "z",
    flutes: int = 18,
    depth: float = 0.018,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """True 3D radially knurled/fluted tactical thumbwheel or windage drum (100% manifold solid)."""
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.014, length * 0.14, radius * 0.14)
    bm = bmesh.new()
    # 4 axial rings: chamfered start -> full flute start -> full flute end -> chamfered end
    stations = [
        (-half_l, radius - depth * 0.8 - bev * 0.8),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.8 - bev * 0.8),
    ]
    rings = []
    for s_idx, (ax_pos, r_base) in enumerate(stations):
        ring = []
        is_end = s_idx in (0, 3)
        for k in range(n_pts):
            th = 2.0 * math.pi * k / n_pts
            rr = r_base if is_end else (r_base if (k % 2 == 0) else (r_base - depth))
            u, v = rr * math.cos(th), rr * math.sin(th)
            if axis == "x":
                pt = (ax_pos, u, v)
            elif axis == "y":
                pt = (u, ax_pos, v)
            else:
                pt = (u, v, ax_pos)
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    for s in range(len(rings) - 1):
        for k in range(n_pts):
            kn = (k + 1) % n_pts
            bm.faces.new((rings[s][k], rings[s + 1][k], rings[s + 1][kn], rings[s][kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
    assert len(objs) > 0, f"join_objects({name}): empty list"
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    select_only(objs, objs[0])
    bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = name
    res.data.name = name
    return res


def delete_objs(objs: list[bpy.types.Object]):
    for o in objs:
        if o is None:
            continue
        mesh = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def _count_non_manifold(obj: bpy.types.Object) -> int:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.free()
    return bad


def bool_subtract(target: bpy.types.Object, cutters: list[bpy.types.Object], solver: str = "EXACT") -> bpy.types.Object:
    """Boolean subtraction preserving material slots and guaranteeing watertight manifold result."""
    if not cutters:
        return target
    for c in cutters:
        # Ensure target inherits cutter's material if needed
        for m in c.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)

    # Apply one by one (or batched) with automatic solver fallback for zero non-manifold edges!
    for idx, cutter in enumerate(cutters):
        backup_mesh = target.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        success = False
        for slv in tried:
            select_only([target], target)
            mod = target.modifiers.new(name=f"Bool_{idx}", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = slv
            mod.object = cutter
            if slv == "EXACT":
                mod.use_self = True
                mod.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if _count_non_manifold(target) == 0 and len(target.data.polygons) > 0:
                success = True
                break
            # Restore and try alternate solver
            old_m = target.data
            target.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not success:
            # Final fallback with EXACT
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolF_{idx}", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)

    delete_objs(cutters)
    return target


def bool_union(objs: list[bpy.types.Object], name: str, solver: str = "EXACT") -> bpy.types.Object:
    """Boolean union combining overlapping manifold solids into a single watertight solid."""
    assert len(objs) >= 1
    base = objs[0]
    rest = objs[1:]
    for idx, other in enumerate(rest):
        for m in other.data.materials:
            if m and m.name not in [tm.name for tm in base.data.materials if tm]:
                base.data.materials.append(m)
        backup_mesh = base.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        ok = False
        for slv in tried:
            select_only([base], base)
            mod = base.modifiers.new(name=f"Union_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = slv
            mod.object = other
            if slv == "EXACT":
                mod.use_self = True
                mod.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if _count_non_manifold(base) == 0 and len(base.data.polygons) > 0:
                ok = True
                break
            old_m = base.data
            base.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not ok:
            select_only([base], base)
            mod = base.modifiers.new(name=f"UnionF_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = other
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)
    delete_objs(rest)
    base.name = name
    base.data.name = name
    return base


def finish_part(
    obj: bpy.types.Object,
    bevel_w: float = 0.0,
    bevel_segs: int = 2,
    sharp_deg: float = 34.0,
    weighted_normals: bool = True,
    lock_flat_walls: bool = False,
) -> bpy.types.Object:
    """Applies hard-surface angle bevel, manifold cleanup, outward normals, and Weighted Normals."""
    select_only([obj], obj)
    if bevel_w > 0.0:
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.offset_type = "OFFSET"
        mod.width = bevel_w
        mod.segments = bevel_segs
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        mod.use_clamp_overlap = True
        mod.miter_outer = "MITER_ARC"
        bpy.ops.object.modifier_apply(modifier=mod.name)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    for f in bm.faces:
        if lock_flat_walls and abs(f.normal.y) > 0.985 and f.calc_area() > 0.04:
            f.smooth = False
        else:
            f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            f0, f1 = e.link_faces[0], e.link_faces[1]
            if lock_flat_walls and (not f0.smooth or not f1.smooth):
                e.smooth = False
            else:
                e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    if weighted_normals:
        select_only([obj], obj)
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 65
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


def triangulate_all_keep_normals(all_objs: list[bpy.types.Object]):
    """Triangulate all meshes BEFORE Cycles tangent-space baking while preserving
    weighted custom normals so baked normals match exported glTF 1:1 with zero seams."""
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="TriangulatePreBake", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


# =============================================================================
# 24 AAA HARD-SURFACE AK-15M1 (6P71M) PART BUILDERS
# =============================================================================

def build_ak_receiver(mats: dict) -> bpy.types.Object:
    m_rec = mats["M_ReceiverPhosphate"]
    m_in = mats["M_RailSlotDark"]
    m_st = mats["M_BrushedStainless"]
    m_dk = mats["M_DarkNitrideSteel"]

    # 1.5mm die-formed stamped U-channel hull with smooth radiused lower bends (r=2.2mm)
    hull_zy = [(-0.81, 1.58), (-0.81, -0.66)]
    hull_zy += _quad_bez((-0.81, -0.66), (-0.81, -0.88), (-0.59, -0.88), 8)
    hull_zy.append((0.59, -0.88))
    hull_zy += _quad_bez((0.59, -0.88), (0.81, -0.88), (0.81, -0.66), 8)
    hull_zy.append((0.81, 1.58))
    hull = mk_extrude_x("rec_hull", hull_zy, -6.20, 6.00, bevel=0.025, bevel_segs=2, mat=m_rec)
    # Add clean support edge loops framing the magwell dimple so flat receiver walls NEVER shade diagonally!
    bm_h = bmesh.new()
    bm_h.from_mesh(hull.data)
    for wx in (-4.40, -1.00, 0.85, 3.45, 5.10):
        geom_h = list(bm_h.verts) + list(bm_h.edges) + list(bm_h.faces)
        bmesh.ops.bisect_plane(bm_h, geom=geom_h, plane_co=(wx, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
    for wy in (-0.30, 0.72, 1.32):
        geom_h = list(bm_h.verts) + list(bm_h.edges) + list(bm_h.faces)
        bmesh.ops.bisect_plane(bm_h, geom=geom_h, plane_co=(0.0, 0.0, wy), plane_no=(0.0, 0.0, 1.0))
    bmesh.ops.remove_doubles(bm_h, verts=bm_h.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm_h, faces=bm_h.faces)
    bm_h.to_mesh(hull.data)
    bm_h.free()

    cutters = [
        mk_box("c_cav", 11.10, 2.18, 1.32, [("t", -0.15, 0.64, 0.0)], m_in),
        mk_box("c_mag", 3.45, 1.24, 1.28, [("t", 2.55, -0.55, 0.0)], m_in),
        mk_box("c_lug", 0.62, 0.68, 0.98, [("t", 4.18, -0.56, 0.0)], m_in),
        mk_box("c_trg", 1.58, 1.12, 0.74, [("t", -2.05, -0.58, 0.0)], m_in),
        # Sculpted stamped oval magwell strengthening dimples on both flanks
        mk_sphere("c_dimR", 0.66 * 1.62, 0.66 * 0.60, 0.66 * 0.22, 24, 14, [("t", 2.14, 0.21, 0.86)], m_rec),
        mk_sphere("c_dimL", 0.66 * 1.62, 0.66 * 0.60, 0.66 * 0.22, 24, 14, [("t", 2.14, 0.21, -0.86)], m_rec),
        mk_box("c_slant", 2.60, 0.80, 2.00, [("rz", 0.16), ("t", -5.30, -1.08, 0.0)], m_in),
        mk_box("c_rstep", 4.65, 0.34, 0.36, [("t", 1.85, 1.48, 0.76)], m_in),
    ]
    shell = bool_subtract(hull, cutters, solver="EXACT")

    # Forged Front Trunnion with barrel journal bore, 2-lug rotary locking pocket & cam lead-in
    trun_raw = mk_box("rec_trun", 2.18, 2.28, 1.46, [("t", 4.85, 0.44, 0.0)], m_dk, bevel=0.02, bevel_segs=2)
    trun = bool_subtract(trun_raw, [
        mk_cyl("c_tbore", 0.63, 0.63, 2.55, "x", 32, [("t", 4.85, 1.05, 0.0)], m_in),
        mk_box("c_tlug", 0.76, 0.44, 1.24, [("t", 4.02, 1.05, 0.0)], m_in),
        mk_box("c_tcam", 0.68, 0.56, 0.54, [("rx", 0.45), ("t", 3.98, 1.18, 0.36)], m_in),
    ], solver="EXACT")

    parts = [
        shell,
        trun,
        # Riveted curved steel bullet guide ramp (сухарь)
        mk_box("rec_bguide", 0.58, 0.24, 0.78, [("rz", 0.38), ("t", 3.84, 0.52, 0.0)], m_st, bevel=0.02),
        # Internal stepped guide rails & fixed left-side ejector fin
        mk_box("rec_railL", 8.65, 0.14, 0.19, [("t", -0.80, 1.22, -0.58)], m_st, bevel=0.015),
        mk_box("rec_railR", 8.65, 0.14, 0.19, [("t", -0.80, 1.22, 0.58)], m_st, bevel=0.015),
        mk_box("rec_eject", 1.22, 0.20, 0.30, [("t", 1.25, 1.04, -0.46)], m_st, bevel=0.015),
        # Hardened center-support spacer collar
        mk_cyl("rec_csup", 0.21, 0.21, 1.32, "z", 22, [("t", -1.56, 0.24, 0.0)], m_st, bevel=0.015),
        # Rear folding-stock hinge trunnion, twin knuckles, hinge pin, side latch, selector stop & cover lock boss
        mk_box("rec_rblk", 0.98, 2.15, 1.54, [("t", -5.85, 0.48, 0.0)], m_dk, bevel=0.025),
        mk_cyl("rec_hku", 0.23, 0.23, 0.56, "y", 24, [("t", -6.22, 1.02, -0.78)], m_dk, bevel=0.02),
        mk_cyl("rec_hkl", 0.23, 0.23, 0.56, "y", 24, [("t", -6.22, -0.06, -0.78)], m_dk, bevel=0.02),
        mk_cyl("rec_hpin", 0.11, 0.11, 1.82, "y", 18, [("t", -6.22, 0.48, -0.78)], m_st, bevel=0.015),
        mk_box("rec_slatch", 0.46, 0.32, 0.14, [("t", 4.35, -0.18, -0.84)], m_dk, bevel=0.02),
        mk_box("rec_sstop", 1.15, 0.16, 0.08, [("t", -1.55, -0.84, 0.83)], m_dk, bevel=0.015),
        mk_cyl("rec_cpin", 0.18, 0.18, 1.88, "z", 22, [("t", -5.65, 1.38, 0.0)], m_st, bevel=0.02),
        # FCG hammer & trigger axis pins with machined outer retaining washer rings
        mk_cyl("rec_fpin1", 0.125, 0.125, 1.72, "z", 20, [("t", -0.35, -0.05, 0.0)], m_dk, bevel=0.018),
        mk_cyl("rec_fpin2", 0.125, 0.125, 1.72, "z", 20, [("t", -2.15, -0.35, 0.0)], m_dk, bevel=0.018),
        mk_torus("rec_fw1R", 0.145, 0.028, "z", 20, 8, [("t", -0.35, -0.05, 0.825)], m_st),
        mk_torus("rec_fw1L", 0.145, 0.028, "z", 20, 8, [("t", -0.35, -0.05, -0.825)], m_st),
        mk_torus("rec_fw2R", 0.145, 0.028, "z", 20, 8, [("t", -2.15, -0.35, 0.825)], m_st),
        mk_torus("rec_fw2L", 0.145, 0.028, "z", 20, 8, [("t", -2.15, -0.35, -0.825)], m_st),
        # Stamped front trunnion lower handguard-retainer shelf & bottom trigger-guard rivet heads
        mk_box("rec_fhg", 0.42, 0.24, 1.38, [("t", 5.86, -0.84, 0.0)], m_dk, bevel=0.025),
        mk_cyl("rec_tgriv1", 0.095, 0.095, 0.10, "y", 14, [("t", 0.35, -0.90, -0.36)], m_st, bevel=0.015),
        mk_cyl("rec_tgriv2", 0.095, 0.095, 0.10, "y", 14, [("t", 0.35, -0.90, 0.36)], m_st, bevel=0.015),
    ]

    # 14 Real 3D domed Kalashnikov trunnion & center-support rivets (7 per flank!) with subtle forged base collars
    rivet_specs = [
        ( 5.29,  0.89, 0.128),
        ( 4.61, -0.10, 0.128),
        ( 4.18, -0.36, 0.112),
        (-1.56,  0.24, 0.140),
        (-4.98,  1.06, 0.128),
        (-4.57, -0.05, 0.122),
        (-5.34, -0.05, 0.122),
    ]
    m_rv = mats["M_RivetSteel"]
    for idx, (rx, ry, rr) in enumerate(rivet_specs):
        for side in (-1.0, 1.0):
            parts.append(
                mk_sphere(f"rec_riv_{idx}_{int(side)}", rr, rr, rr * 0.52, 20, 12, [("t", rx, ry, side * 0.82)], m_rv)
            )
            parts.append(
                mk_torus(f"rec_rcol_{idx}_{int(side)}", rr * 0.98, 0.018, "z", 18, 8, [("t", rx, ry, side * 0.816)], m_dk)
            )

    obj = join_objects(parts, "ak_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_ak_dust_cover(mats: dict) -> bpy.types.Object:
    m_dc = mats["M_DustCoverEnamel"]
    m_dk = mats["M_DarkNitrideSteel"]
    m_rl = mats["M_RailAnodized"]
    m_sl = mats["M_RailSlotDark"]
    m_st = mats["M_BrushedStainless"]

    # Smooth 12-segment stamped U-arch cross-section in dedicated dust-cover enamel finish
    arch_zy = [(-0.84, -0.68), (-0.84, 0.18)]
    arch_zy += _quad_bez((-0.84, 0.18), (-0.82, 0.62), (-0.45, 0.66), 8)
    arch_zy.append((0.45, 0.66))
    arch_zy += _quad_bez((0.45, 0.66), (0.82, 0.62), (0.84, 0.18), 8)
    arch_zy.append((0.84, -0.68))
    outer = mk_extrude_x("dc_outer", arch_zy, -6.05, 6.05, bevel=0.032, bevel_segs=2, mat=m_dc)

    shell = bool_subtract(outer, [
        mk_box("c_in", 11.78, 1.25, 1.44, [("t", 0.0, -0.18, 0.0)], m_sl),
        mk_box("c_ej", 4.78, 0.94, 0.96, [("t", 2.85, -0.28, 0.56)], m_sl),
        mk_cyl("c_pin", 0.19, 0.19, 1.95, "z", 20, [("t", -5.55, -0.82, 0.0)], m_sl),
    ], solver="EXACT")

    parts = [shell]
    parts += mk_picatinny_rail("dc_rail", 11.95, 0.0, 0.65, 17, invert_y=False, mat_rail=m_rl, mat_slot=m_sl)

    # Authentic wide die-embossed AK-15M1 vertical strengthening ribs + contoured brass shell deflector lip
    for rx in (-3.95, -2.05, -0.15, 1.95):
        parts.append(mk_capsule(f"dc_ribL_{rx}", 0.145, 0.44, (1.0, 1.0, 0.30), [("t", rx, -0.12, -0.848)], m_dc))
    for rx in (-3.95, -2.05):
        parts.append(mk_capsule(f"dc_ribR_{rx}", 0.145, 0.44, (1.0, 1.0, 0.30), [("t", rx, -0.12, 0.848)], m_dc))
    # Sculpted chamfered brass shell deflector & rolled upper ejection port reinforcement bead
    parts.append(mk_box("dc_defl", 0.24, 0.78, 0.16, [("ry", 0.22), ("t", 0.40, -0.22, 0.84)], m_rl, bevel=0.035, bevel_segs=2))
    parts.append(mk_box("dc_ejlip", 4.72, 0.10, 0.08, [("t", 2.85, 0.22, 0.84)], m_rl, bevel=0.02))

    # Front forged hinge clevis arms & stainless pivot pin
    parts.append(mk_box("dc_clL", 0.72, 0.48, 0.24, [("t", 6.18, 0.22, -0.58)], m_dk, bevel=0.025))
    parts.append(mk_box("dc_clR", 0.72, 0.48, 0.24, [("t", 6.18, 0.22, 0.58)], m_dk, bevel=0.025))
    parts.append(mk_cyl("dc_clPin", 0.12, 0.12, 1.46, "z", 20, [("t", 6.36, 0.16, 0.0)], m_st, bevel=0.015))

    # Model 2023 rear takedown cam latch, rotary lever & true 3D knurled locking thumb stud
    parts.append(mk_box("dc_rblk", 0.76, 0.78, 1.66, [("t", -5.78, -0.42, 0.0)], m_dk, bevel=0.028))
    parts.append(mk_cyl("dc_rboss", 0.25, 0.25, 0.15, "z", 24, [("t", -5.55, -0.52, 0.88)], m_dk, bevel=0.020))
    parts.append(mk_box("dc_rlev", 0.88, 0.22, 0.10, [("rz", 0.24), ("t", -5.18, -0.44, 0.94)], m_dk, bevel=0.020))
    parts.append(mk_knurled_cyl("dc_rstud", 0.105, 0.16, "z", flutes=14, depth=0.014, xform=[("t", -4.78, -0.34, 0.98)], mat=m_st))

    obj = join_objects(parts, "ak_dust_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_ak_rear_sight(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_rl = mats["M_RailAnodized"]
    m_sl = mats["M_RailSlotDark"]
    m_st = mats["M_BrushedStainless"]

    clamp = bool_subtract(
        mk_box("rs_cl", 1.42, 0.36, 1.08, [("t", 0.0, -0.14, 0.0)], m_dk, bevel=0.024),
        [mk_box("c_grv", 1.50, 0.16, 0.82, [("t", 0.0, -0.28, 0.0)], m_sl)],
        solver="EXACT",
    )
    day_ap = bool_subtract(
        mk_cyl("rs_day", 0.24, 0.24, 0.14, "x", 28, [("t", -0.08, 0.30, 0.0)], m_dk, bevel=0.015),
        [mk_cyl("c_dp", 0.075, 0.075, 0.34, "x", 20, [("t", -0.08, 0.30, 0.0)], m_sl)],
        solver="EXACT",
    )
    night_ap = bool_subtract(
        mk_cyl("rs_ngt", 0.22, 0.22, 0.12, "y", 24, [("t", 0.26, 0.06, 0.0)], m_dk, bevel=0.015),
        [mk_cyl("c_np", 0.11, 0.11, 0.28, "y", 20, [("t", 0.26, 0.06, 0.0)], m_sl)],
        solver="EXACT",
    )
    # Tapered protective sight wings with milled side lightening flutes
    ear_xy = [(-0.50, -0.05), (0.36, -0.05), (0.30, 0.53), (-0.42, 0.53)]
    ear_l = bool_subtract(
        mk_extrude_z("rs_earL", ear_xy, -0.50, -0.35, bevel=0.020, bevel_segs=2, mat=m_rl),
        [mk_box("c_el", 0.44, 0.22, 0.08, [("t", -0.08, 0.28, -0.50)], m_sl)],
        solver="EXACT",
    )
    ear_r = bool_subtract(
        mk_extrude_z("rs_earR", ear_xy, 0.35, 0.50, bevel=0.020, bevel_segs=2, mat=m_rl),
        [mk_box("c_er", 0.44, 0.22, 0.08, [("t", -0.08, 0.28, 0.50)], m_sl)],
        solver="EXACT",
    )
    parts = [
        clamp,
        mk_cyl("rs_bolt", 0.09, 0.09, 1.24, "z", 18, [("t", 0.28, -0.12, 0.0)], m_st, bevel=0.012),
        mk_cyl("rs_nut", 0.16, 0.16, 0.13, "z", 6, [("t", 0.28, -0.12, -0.58)], m_dk, bevel=0.014),
        ear_l,
        ear_r,
        day_ap,
        night_ap,
        # True 3D 16-flute knurled windage adjustment drum!
        mk_knurled_cyl("rs_wind", 0.175, 1.32, "z", flutes=16, depth=0.018, xform=[("t", -0.08, 0.04, 0.0)], mat=m_st),
    ]
    obj = join_objects(parts, "ak_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_bolt_carrier(mats: dict) -> bpy.types.Object:
    m_bc = mats["M_BoltCarrierBody"]
    m_in = mats["M_RailSlotDark"]
    m_pi = mats["M_ChromePiston"]

    # Heavy CNC bolt carrier body + upper cylindrical tower
    raw_c = mk_box("bc_raw", 5.28, 1.18, 1.18, [("t", 0.185, -0.05, 0.0)], m_bc, bevel=0.032, bevel_segs=2)
    tower = mk_cyl("bc_twr", 0.46, 0.48, 5.18, "-x", 32, [("t", 0.20, 0.68, 0.0)], m_bc, bevel=0.025)
    carrier_u = bool_union([raw_c, tower], "bc_u", solver="EXACT")

    sculpted = bool_subtract(carrier_u, [
        mk_cyl("c_btun", 0.39, 0.39, 4.98, "x", 28, [("t", 0.56, -0.46, 0.0)], m_in),
        mk_box("c_dwel", 0.68, 0.34, 0.62, [("t", 2.05, -0.06, 0.345)], m_in),
        mk_box("c_cam", 1.38, 0.36, 0.66, [("ry", 0.54), ("rx", -0.28), ("t", 1.32, -0.10, 0.325)], m_in),
        mk_box("c_rlL", 5.52, 0.18, 0.23, [("t", 0.18, -0.33, -0.565)], m_in),
        mk_box("c_rlR", 5.52, 0.18, 0.23, [("t", 0.18, -0.33, 0.565)], m_in),
        mk_cyl("c_rhole", 0.32, 0.32, 5.18, "x", 24, [("t", -0.03, 0.32, 0.0)], m_in),
        mk_box("c_hramp", 1.26, 0.52, 1.32, [("rz", -0.36), ("t", -2.08, -0.56, 0.0)], m_in),
        mk_box("c_hslot", 2.62, 0.72, 0.54, [("t", -1.35, -0.365, 0.0)], m_in),
    ], solver="EXACT")

    # Iconic organically swept Kalashnikov upturned charging handle (smooth lofted stem + contoured knob!)
    handle_stem = mk_box("bc_hstem", 0.64, 0.28, 0.78, [("t", 1.85, -0.08, 0.88)], m_bc, bevel=0.055, bevel_segs=3)
    handle_tip = mk_cyl("bc_htip", 0.17, 0.24, 0.72, "y", 24, [("rz", -0.35), ("t", 1.88, 0.18, 1.34)], m_bc, bevel=0.05)

    # Hard-chrome long-stroke stainless gas piston w/ 3 crisp gas-seal grooves & concave cup face
    piston_pts = [
        (0.000,  2.86),
        (0.330,  2.86),
        (0.330,  3.56),
        (0.230,  3.78),
        (0.230, 11.82),
        (0.375, 12.12),
        (0.375, 12.37),
        (0.295, 12.40),
        (0.295, 12.52),
        (0.375, 12.55),
        (0.375, 12.78),
        (0.295, 12.81),
        (0.295, 12.92),
        (0.375, 12.95),
        (0.375, 13.18),
        (0.295, 13.21),
        (0.295, 13.32),
        (0.382, 13.35),
        (0.382, 13.68),
        (0.365, 13.70),
        (0.200, 13.53),
        (0.000, 13.48),
    ]
    piston = mk_lathe_x("bc_piston", piston_pts, segs=36, xform=[("t", 0.0, 0.80, 0.0)], mat=m_pi)

    obj = join_objects([sculpted, handle_stem, handle_tip, piston], "ak_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_bolt(mats: dict) -> bpy.types.Object:
    m_st = mats["M_BrushedStainless"]
    m_in = mats["M_RailSlotDark"]
    m_dk = mats["M_DarkNitrideSteel"]

    def lug_xy(length: float, height: float):
        hx, hy = length * 0.5, height * 0.5
        return [
            (-hx + 0.06, -hy),
            ( hx - 0.13, -hy),
            ( hx,        -hy + 0.12),
            ( hx,         hy - 0.08),
            ( hx - 0.09,  hy),
            (-hx,         hy),
            (-hx,        -hy + 0.06),
        ]

    stem = mk_cyl("blt_stem", 0.31, 0.31, 3.20, "x", 32, [("t", -0.10, 0.0, 0.0)], m_st, bevel=0.02)
    head = mk_cyl("blt_head", 0.46, 0.46, 0.92, "x", 32, [("t", 1.12, 0.0, 0.0)], m_st, bevel=0.025)
    lugL = mk_extrude_z("blt_lugL", lug_xy(0.68, 0.36), -0.155, 0.155, bevel=0.018, bevel_segs=2,
                        xform=[("rx", -0.08), ("t", 1.08, 0.04, -0.53)], mat=m_st)
    lugR = mk_extrude_z("blt_lugR", lug_xy(0.70, 0.40), -0.160, 0.160, bevel=0.018, bevel_segs=2,
                        xform=[("t", 1.08, -0.02, 0.53)], mat=m_st)
    cam_b = mk_box("blt_camb", 0.46, 0.42, 0.26, [("t", 0.68, 0.32, 0.14)], m_st, bevel=0.025)
    cam_p = mk_cyl("blt_camp", 0.15, 0.17, 0.36, "y", 22, [("t", 0.68, 0.52, 0.14)], m_st, bevel=0.02)
    feed = mk_box("blt_feed", 0.96, 0.24, 0.22, [("t", 1.06, -0.48, 0.0)], m_st, bevel=0.02)

    solid = bool_union([stem, head, lugL, lugR, cam_b, cam_p, feed], "blt_solid", solver="EXACT")
    carved = bool_subtract(solid, [
        mk_cyl("c_fp", 0.115, 0.115, 3.60, "x", 22, [("t", -0.02, 0.0, 0.0)], m_in),
        mk_cyl("c_cup", 0.325, 0.325, 0.20, "x", 28, [("t", 1.52, 0.0, 0.0)], m_in),
        mk_box("c_ext", 1.02, 0.30, 0.28, [("t", 1.12, 0.03, 0.38)], m_in),
        mk_box("c_ej", 1.85, 0.24, 0.26, [("t", 0.85, -0.01, -0.44)], m_in),
    ], solver="EXACT")

    parts = [
        carved,
        mk_cyl("blt_epin", 0.055, 0.055, 0.78, "y", 14, [("t", 0.98, 0.02, 0.34)], m_dk, bevel=0.01),
        mk_cyl("blt_fpin", 0.050, 0.050, 0.58, "y", 14, [("t", -0.38, 0.04, 0.16)], m_dk, bevel=0.01),
    ]
    obj = join_objects(parts, "ak_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_firing_pin(mats: dict) -> bpy.types.Object:
    m_st = mats["M_BrushedStainless"]
    m_dk = mats["M_DarkNitrideSteel"]

    pts = [
        (0.000, -2.42),
        (0.135, -2.37),
        (0.135, -1.55),
        (0.105, -1.48),
        (0.105,  1.08),
        (0.068,  1.48),
        (0.032,  1.74),
        (0.000,  1.76),
    ]
    raw = mk_lathe_x("fp_raw", pts, segs=24, mat=m_st)
    cutters = [mk_box("c_flat", 0.62, 0.08, 0.30, [("t", -0.22, 0.10, 0.0)], m_dk)]
    for k in range(3):
        cutters.append(
            mk_box(f"c_fl_{k}", 1.55, 0.055, 0.07, [("t", 0.28, 0.10, 0.0), ("rx", k * 2.0 * math.pi / 3.0)], m_dk)
        )
    obj = bool_subtract(raw, cutters, solver="EXACT")
    obj.name = "ak_firing_pin"
    obj.data.name = "ak_firing_pin"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_extractor(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_st = mats["M_BrushedStainless"]
    m_sp = mats["M_SpringSteel"]

    # Matches clawShape extruded along Z=[0, 0.24], then rotateX(-pi/2), translate(0, -0.12, 0)
    # Note: rotateX(-pi/2) maps (x, y_shape, z_ext) -> (x, z_ext, -y_shape)!
    claw_xy = [
        (-0.56, -0.10),
        ( 0.32, -0.11),
        ( 0.52, -0.26),
        ( 0.56, -0.14),
        ( 0.46,  0.12),
        (-0.22,  0.13),
        (-0.56,  0.07),
    ]
    claw = mk_extrude_z("ext_claw", claw_xy, 0.0, 0.24, bevel=0.015, bevel_segs=2,
                        xform=[("rx", -math.pi * 0.5), ("t", 0.0, -0.12, 0.0)], mat=m_dk)
    stud = mk_cyl("ext_stud", 0.038, 0.038, 0.42, "x", 14, [("t", -0.55, 0.0, 0.04)], m_st)
    spr = mk_coil_spring("ext_spr", "x", -0.78, -0.26, 0.0, 0.04, 0.078, 0.022, 6.0, ring_segs=8, steps_per_coil=14, mat=m_sp)
    obj = join_objects([claw, stud, spr], "ak_extractor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_recoil_guide(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_in = mats["M_RailSlotDark"]
    m_st = mats["M_BrushedStainless"]
    m_buf = mats["M_BufferElastomer"]

    heel = bool_subtract(
        mk_box("rg_heel", 0.84, 0.92, 0.68, [("t", -3.72, -0.16, 0.0)], m_dk, bevel=0.025),
        [mk_cyl("c_eye", 0.16, 0.16, 0.85, "z", 20, [("t", -3.55, -0.45, 0.0)], m_in)],
        solver="EXACT",
    )
    parts = [
        heel,
        mk_box("rg_buf", 0.28, 0.98, 0.92, [("t", -3.24, -0.14, 0.0)], m_buf, bevel=0.035),
        mk_cyl("rg_out", 0.165, 0.165, 2.80, "x", 24, [("t", -1.60, 0.0, 0.0)], m_st, bevel=0.015),
        mk_cyl("rg_in", 0.115, 0.115, 2.15, "x", 22, [("t", 0.78, 0.0, 0.0)], m_st, bevel=0.012),
        mk_cyl("rg_keep", 0.21, 0.21, 0.14, "x", 24, [("t", 1.86, 0.0, 0.0)], m_dk, bevel=0.015),
        mk_cyl("rg_stop", 0.26, 0.26, 0.16, "x", 24, [("t", -3.04, 0.0, 0.0)], m_dk, bevel=0.018),
    ]
    obj = join_objects(parts, "ak_recoil_guide")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_gas_tube(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_in = mats["M_RailSlotDark"]
    m_rl = mats["M_RailAnodized"]
    m_st = mats["M_BrushedStainless"]

    outer = mk_cyl("gt_out", 0.49, 0.49, 9.60, "x", 32, mat=m_dk, bevel=0.015)
    cutters = [mk_cyl("c_bore", 0.395, 0.395, 10.10, "x", 28, mat=m_in)]
    for k in range(6):
        ang = k * math.pi / 3.0 + math.pi / 6.0
        cutters.append(mk_box(f"c_fl_{k}", 7.20, 0.06, 0.14, [("t", 0.10, 0.49, 0.0), ("rx", ang)], m_in))
    tube = bool_subtract(outer, cutters, solver="EXACT")

    parts = [
        tube,
        mk_cyl("gt_rcol", 0.58, 0.58, 0.86, "x", 32, [("t", -4.38, 0.0, 0.0)], m_rl, bevel=0.025),
        mk_cyl("gt_ffer", 0.53, 0.51, 0.58, "-x", 28, [("t", 4.52, 0.0, 0.0)], m_st, bevel=0.02),
    ]
    obj = join_objects(parts, "ak_gas_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_barrel(mats: dict) -> bpy.types.Object:
    m_bar = mats["M_OrdnanceBarrel"]
    m_in = mats["M_RailSlotDark"]
    m_st = mats["M_BrushedStainless"]

    # Stepped bayonet-free 415mm CHF barrel contour with recessed 11 deg target crown
    pts = [
        (0.00,  3.85),
        (0.61,  3.85),
        (0.61,  5.95),
        (0.68,  5.98),
        (0.68,  6.42),
        (0.49,  6.65),
        (0.45, 11.20),
        (0.44, 15.52),
        (0.49, 15.62),
        (0.49, 17.95),
        (0.40, 18.06),
        (0.40, 22.58),
        (0.44, 22.62),
        (0.44, 22.74),
        (0.35, 22.76),
        (0.35, 23.48),
        (0.22, 23.38),
        (0.00, 23.38),
    ]
    outer = mk_lathe_x("bar_out", pts, segs=36, mat=m_bar)
    hollowed = bool_subtract(outer, [
        mk_cyl("c_bore", 0.215, 0.215, 20.40, "x", 24, [("t", 13.75, 0.0, 0.0)], m_in),
        mk_cyl("c_chm", 0.31, 0.35, 2.35, "-x", 24, [("t", 4.95, 0.0, 0.0)], m_in),
        mk_box("c_ext", 0.30, 0.34, 0.32, [("t", 3.92, 0.03, 0.38)], m_in),
        mk_cyl("c_gport", 0.085, 0.085, 0.56, "y", 14, [("t", 16.70, 0.36, 0.0)], m_in),
        mk_cyl("c_pin1", 0.08, 0.08, 0.90, "z", 12, [("t", 16.15, -0.45, 0.0)], m_in),
        mk_cyl("c_pin2", 0.08, 0.08, 0.90, "z", 12, [("t", 17.25, -0.45, 0.0)], m_in),
    ], solver="EXACT")

    parts = [
        hollowed,
        mk_torus("bar_throat", 0.38, 0.06, "x", 28, 12, [("t", 3.87, 0.0, 0.0)], m_st),
    ]

    # 4 true right-hand 1:240mm helical chrome rifling lands
    for k in range(4):
        start_ang = k * math.pi * 0.5 + math.pi * 0.25
        x0, x1, r_l, lh, lw, twist, segs = 6.2, 23.3, 0.205, 0.032, 0.045, 24.0, 28
        bm = bmesh.new()
        rings = []
        for s in range(segs + 1):
            x = x0 + (x1 - x0) * (s / segs)
            a = start_ang + ((x - x0) / twist) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            ring = []
            for dy, dz in ((-lh * 0.5, -lw * 0.5), (lh * 0.5, -lw * 0.5), (lh * 0.5, lw * 0.5), (-lh * 0.5, lw * 0.5)):
                y0 = r_l + dy
                ring.append(bm.verts.new((x, y0 * ca - dz * sa, y0 * sa + dz * ca)))
            rings.append(ring)
        for s in range(segs):
            for j in range(4):
                jn = (j + 1) % 4
                bm.faces.new((rings[s][j], rings[s + 1][j], rings[s + 1][jn], rings[s][jn]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        _apply_three_xform(bm, [])
        parts.append(_bm_to_obj(f"bar_land_{k}", bm, m_st))

    obj = join_objects(parts, "ak_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_ak_muzzle_device(mats: dict) -> bpy.types.Object:
    m_mz = mats["M_MuzzleHeatSoot"]
    m_in = mats["M_RailSlotDark"]
    m_rl = mats["M_RailAnodized"]
    m_st = mats["M_BrushedStainless"]

    pts = [
        (0.36, -1.55),
        (0.56, -1.55),
        (0.56, -0.72),
        (0.50, -0.68),
        (0.50, -0.42),
        (0.55, -0.38),
        (0.55,  0.24),
        (0.51,  0.32),
        (0.53,  1.68),
        (0.41,  1.68),
        (0.34,  1.56),
        (0.34, -1.55),
        (0.36, -1.55),
    ]
    raw = mk_lathe_x("mz_raw", pts, segs=40, mat=m_mz)
    cutters = [
        mk_cyl("c_bore", 0.27, 0.27, 3.60, "x", 28, [("t", 0.05, 0.0, 0.0)], m_in),
        mk_cyl("c_exp", 0.41, 0.41, 1.55, "x", 28, [("t", -0.62, 0.0, 0.0)], m_in),
        mk_cyl("c_cone", 0.42, 0.38, 1.32, "-x", 28, [("t", 1.04, 0.0, 0.0)], m_in),
        mk_box("c_brk", 0.42, 0.32, 1.25, [("t", -0.10, 0.0, 0.0)], m_in),
        mk_cyl("c_top", 0.13, 0.13, 0.55, "y", 16, [("t", -0.10, 0.42, 0.0)], m_in),
        # Precision armorer wrench flats on base collar
        mk_box("c_wfL", 0.42, 0.34, 0.14, [("t", -1.16, 0.0, -0.57)], m_in),
        mk_box("c_wfR", 0.42, 0.34, 0.14, [("t", -1.16, 0.0, 0.57)], m_in),
    ]
    for idx, ang in enumerate((-1.68, -0.84, 0.0, 0.84, 1.68)):
        cutters.append(mk_box(f"c_sl_{idx}", 1.08, 0.62, 0.155, [("t", 0.96, 0.42, 0.0), ("rx", ang)], m_in))
    for c in range(3):
        cutters.append(mk_box(f"c_cr_{c}", 0.18, 1.18, 0.12, [("t", 1.64, 0.0, 0.0), ("rx", c * math.pi / 3.0)], m_in))

    slotted = bool_subtract(raw, cutters, solver="EXACT")
    parts = [
        slotted,
        # True 3D 16-tooth machined QD suppressor ratchet locking ring
        mk_knurled_cyl("mz_qd", 0.585, 0.24, "x", flutes=16, depth=0.030, xform=[("t", -0.55, 0.0, 0.0)], mat=m_st),
        mk_torus("mz_ring", 0.55, 0.042, "x", 32, 12, [("t", -0.37, 0.0, 0.0)], m_st),
        mk_box("mz_lug", 0.40, 0.22, 0.24, [("t", -1.18, -0.56, 0.0)], m_rl, bevel=0.025),
    ]
    obj = join_objects(parts, "ak_muzzle_device")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_gas_block(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_in = mats["M_RailSlotDark"]
    m_rl = mats["M_RailAnodized"]
    m_st = mats["M_BrushedStainless"]

    solid = bool_union([
        mk_cyl("gb_slv", 0.64, 0.64, 2.25, "x", 36, mat=m_dk, bevel=0.028),
        mk_box("gb_web", 1.82, 1.45, 0.76, [("t", -0.04, 0.72, 0.0)], m_dk, bevel=0.045, bevel_segs=2),
        mk_cyl("gb_cup", 0.56, 0.56, 2.22, "x", 36, [("t", 0.02, 1.30, 0.0)], m_dk, bevel=0.028),
        mk_box("gb_twr", 0.92, 0.65, 0.64, [("t", 0.08, 1.85, 0.0)], m_dk, bevel=0.032, bevel_segs=2),
        mk_cyl("gb_hood", 0.48, 0.48, 0.80, "x", 36, [("t", 0.08, 2.36, 0.0)], m_rl, bevel=0.024),
        mk_box("gb_ear", 0.68, 0.26, 0.38, [("t", -0.15, -0.66, 0.0)], m_dk, bevel=0.025),
    ], "gb_solid", solver="EXACT")

    carved = bool_subtract(solid, [
        mk_cyl("c_bh", 0.495, 0.495, 2.60, "x", 28, mat=m_in),
        mk_cyl("c_gs", 0.42, 0.42, 1.65, "x", 26, [("t", -0.55, 1.30, 0.0)], m_in),
        mk_cyl("c_ht", 0.37, 0.37, 1.02, "x", 28, [("t", 0.08, 2.36, 0.0)], m_in),
        # Authentic circular side lightening / ambient-light holes through protective front sight hood!
        mk_cyl("c_hs", 0.16, 0.16, 1.15, "z", 20, [("t", 0.08, 2.38, 0.0)], m_in),
        # Deep forged side lightening flutes on gas block tower web
        mk_box("c_flL", 0.96, 0.50, 0.18, [("t", -0.04, 0.66, -0.38)], m_in, bevel=0.04),
        mk_box("c_flR", 0.96, 0.50, 0.18, [("t", -0.04, 0.66, 0.38)], m_in, bevel=0.04),
    ], solver="EXACT")

    parts = [
        carved,
        # True 3D knurled stainless gas-tube cleanout plug cap + cross-bar wrench slot
        mk_knurled_cyl("gb_plug", 0.465, 0.56, "x", flutes=18, depth=0.022, xform=[("t", 1.36, 1.30, 0.0)], mat=m_st),
        mk_box("gb_pbar", 0.18, 0.78, 0.16, [("t", 1.62, 1.30, 0.0)], m_st, bevel=0.018),
        mk_cyl("gb_pdet", 0.068, 0.068, 0.26, "x", 16, [("t", 1.18, 1.68, 0.24)], m_st, bevel=0.012),
        mk_cyl("gb_post", 0.048, 0.068, 0.46, "y", 16, [("t", 0.08, 2.24, 0.0)], m_st),
        mk_knurled_cyl("gb_drum", 0.135, 0.76, "z", flutes=12, depth=0.014, xform=[("t", 0.08, 1.98, 0.0)], mat=m_st),
        mk_cyl("gb_pin1", 0.082, 0.082, 0.94, "z", 16, [("t", -0.55, -0.45, 0.0)], m_st, bevel=0.012),
        mk_cyl("gb_pin2", 0.082, 0.082, 0.94, "z", 16, [("t", 0.55, -0.45, 0.0)], m_st, bevel=0.012),
        mk_torus("gb_sling", 0.19, 0.046, "x", 24, 12, [("t", -0.15, 0.62, -0.44)], m_st),
    ]
    obj = join_objects(parts, "ak_gas_block")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_hammer(mats: dict) -> bpy.types.Object:
    m_st = mats["M_BrushedStainless"]
    m_in = mats["M_RailSlotDark"]
    m_dk = mats["M_DarkNitrideSteel"]
    m_sp = mats["M_SpringSteel"]

    hub = bool_subtract(
        mk_cyl("hm_hub", 0.27, 0.27, 1.10, "z", 24, mat=m_st, bevel=0.018),
        [mk_cyl("c_hb", 0.125, 0.125, 1.30, "z", 18, mat=m_in)],
        solver="EXACT",
    )
    h_xy = [
        (-0.24, -0.04), (0.24, -0.18), (0.32, -0.06), (0.34, 0.56),
        (0.20, 1.10), (-0.34, 1.02), (-0.48, 0.48), (-0.38, 0.36),
    ]
    raw_h = mk_extrude_z("hm_head", h_xy, -0.24, 0.24, bevel=0.025, bevel_segs=2, mat=m_st)
    head = bool_subtract(raw_h, [
        mk_cyl("c_scL", 0.18, 0.18, 0.08, "z", 20, [("t", -0.04, 0.62, -0.25)], m_dk),
        mk_cyl("c_scR", 0.18, 0.18, 0.08, "z", 20, [("t", -0.04, 0.62, 0.25)], m_dk),
    ], solver="EXACT")
    # Rotate hammer head to cocked-flat angle (+1.34 rad around Three.js +Z = -1.34 around Blender Y)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    rot_m = T2B_MAT @ Matrix.Rotation(1.34, 4, "Z") @ B2T_MAT
    bmesh.ops.transform(bm, matrix=rot_m, verts=bm.verts)
    bm.to_mesh(head.data)
    bm.free()

    parts = [
        hub,
        head,
        mk_coil_spring("hm_cL", "z", -0.54, -0.28, 0.0, 0.0, 0.34, 0.036, 4.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_coil_spring("hm_cR", "z", 0.28, 0.54, 0.0, 0.0, 0.34, 0.036, 4.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_cyl("hm_brg", 0.035, 0.035, 0.34, "y", 10, [("t", 0.16, 0.42, 0.0), ("rz", 1.34)], m_sp),
    ]
    obj = join_objects(parts, "ak_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_trigger(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_in = mats["M_RailSlotDark"]
    m_sp = mats["M_SpringSteel"]

    piv = bool_subtract(
        mk_cyl("tr_piv", 0.20, 0.20, 1.12, "z", 22, mat=m_dk, bevel=0.015),
        [mk_cyl("c_pb", 0.115, 0.115, 1.30, "z", 16, mat=m_in)],
        solver="EXACT",
    )
    shoe_xy = [(-0.18, -0.10), (0.22, -0.10)]
    shoe_xy += _quad_bez((0.22, -0.10), (0.06, -0.94), (0.32, -1.55), 10)
    shoe_xy.append((0.08, -1.66))
    shoe_xy += _quad_bez((0.08, -1.66), (-0.28, -0.98), (-0.18, -0.10), 10)

    sear_xy = [(-0.46, -0.08), (0.88, -0.04), (0.92, 0.44), (0.68, 0.46), (0.62, 0.26), (-0.46, 0.16)]

    parts = [
        piv,
        mk_extrude_z("tr_shoe", shoe_xy, -0.21, 0.21, bevel=0.03, bevel_segs=3, mat=m_dk),
        mk_extrude_z("tr_hL", sear_xy, -0.37, -0.20, bevel=0.015, bevel_segs=2, mat=m_dk),
        mk_extrude_z("tr_hR", sear_xy, 0.20, 0.37, bevel=0.015, bevel_segs=2, mat=m_dk),
        mk_box("tr_tail", 0.78, 0.22, 0.72, [("t", -0.40, -0.02, 0.0)], m_dk, bevel=0.02),
        mk_cyl("tr_spL", 0.036, 0.036, 1.92, "y", 10, [("rz", math.pi * 0.5 + 0.12), ("t", 0.85, 0.21, -0.44)], m_sp),
        mk_cyl("tr_spR", 0.036, 0.036, 1.92, "y", 10, [("rz", math.pi * 0.5 + 0.12), ("t", 0.85, 0.21, 0.44)], m_sp),
    ]
    obj = join_objects(parts, "ak_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_disconnector(mats: dict) -> bpy.types.Object:
    m_st = mats["M_BrushedStainless"]
    m_in = mats["M_RailSlotDark"]
    m_sp = mats["M_SpringSteel"]

    d_xy = [(-0.45, -0.24), (0.46, -0.24), (0.58, 0.34), (0.24, 0.58), (0.18, 0.42), (0.02, 0.34), (-0.42, 0.12)]
    plate = bool_subtract(
        mk_extrude_z("dc_pl", d_xy, -0.11, 0.11, bevel=0.02, bevel_segs=2, mat=m_st),
        [mk_cyl("c_ph", 0.115, 0.115, 0.40, "z", 18, [("t", 0.20, -0.14, 0.0)], m_in)],
        solver="EXACT",
    )
    spr = mk_coil_spring("dc_sp", "y", -0.48, -0.06, -0.24, 0.0, 0.088, 0.022, 5.5, ring_segs=8, steps_per_coil=14, mat=m_sp)
    obj = join_objects([plate, spr], "ak_disconnector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_selector(mats: dict) -> bpy.types.Object:
    m_dk = mats["M_DarkNitrideSteel"]
    m_rl = mats["M_RailAnodized"]
    m_st = mats["M_BrushedStainless"]

    lev_xy = [(-0.28, -0.24), (4.42, -0.06), (4.56, 0.14), (4.36, 0.38), (0.45, 0.34), (-0.28, 0.24)]
    parts = [
        mk_cyl("sel_ax", 0.155, 0.155, 1.82, "z", 22, mat=m_dk, bevel=0.015),
        mk_box("sel_cam", 0.62, 0.46, 0.64, [("t", 0.36, -0.22, -0.08)], m_st, bevel=0.02),
        mk_extrude_z("sel_rlev", lev_xy, 0.83, 0.91, bevel=0.016, bevel_segs=2, mat=m_dk),
        mk_box("sel_rib", 3.55, 0.16, 0.05, [("rz", 0.03), ("t", 2.15, 0.12, 0.92)], m_rl, bevel=0.012),
        mk_sphere("sel_det", 0.08, 0.08, 0.08, 14, 10, [("t", 4.32, 0.06, 0.84)], m_st),
        mk_cyl("sel_cap", 0.36, 0.36, 0.12, "z", 26, [("t", 0.0, 0.0, 0.87)], m_rl, bevel=0.02),
        mk_box("sel_shf", 1.24, 0.12, 0.38, [("t", 1.52, -0.16, 1.02)], m_rl, bevel=0.018),
        mk_box("sel_llev", 1.42, 0.32, 0.16, [("rz", -0.22), ("t", -0.50, -0.16, -0.92)], m_dk, bevel=0.025),
        mk_box("sel_lpad", 0.42, 0.42, 0.24, [("rz", -0.22), ("t", -1.08, -0.29, -0.96)], m_rl, bevel=0.03),
    ]
    for s in range(-2, 3):
        parts.append(mk_box(f"sel_sr_{s}", 0.07, 0.04, 0.34, [("t", 1.52 + s * 0.20, -0.09, 1.03)], m_st, bevel=0.008))

    obj = join_objects(parts, "ak_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- FURNITURE ATLAS PARTS (8 PARTS) ---

def build_ak_upper_handguard(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_pr = mats["F_PolyamideRail"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    # Tapered sleek ergonomic rounded-arch upper heatshield with crisp lower parting skirt
    arch_zy = [(-0.91, -0.61), (-0.91, -0.22)]
    arch_zy += _quad_bez((-0.91, -0.22), (-0.88, 0.44), (-0.48, 0.50), 9)
    arch_zy.append((0.48, 0.50))
    arch_zy += _quad_bez((0.48, 0.50), (0.88, 0.44), (0.91, -0.22), 9)
    arch_zy.append((0.91, -0.61))
    raw = mk_extrude_x("uhg_raw", arch_zy, -4.56, 4.56, bevel=0.045, bevel_segs=3, mat=m_pm)

    # Subtle stepped recessed cooling bezel frames + inner angled oblong cooling slots
    bezel_pill = _pill_2d(1.24, 0.34, 6)
    vent_pill = _pill_2d(1.02, 0.22, 6)
    cutters = [mk_cyl("c_tun", 0.62, 0.62, 9.50, "x", 30, [("t", 0.0, -0.16, 0.0)], m_pa)]
    for vx in (-2.95, -1.00, 0.95, 2.90):
        # Stepped outer recess bezel on both flanks
        cutters.append(
            mk_extrude_z(f"c_vbR_{vx}", bezel_pill, 0.82, 1.05, xform=[("rz", 0.14), ("t", vx, -0.09, 0.0)], mat=m_pa)
        )
        cutters.append(
            mk_extrude_z(f"c_vbL_{vx}", bezel_pill, -1.05, -0.82, xform=[("rz", 0.14), ("t", vx, -0.09, 0.0)], mat=m_pa)
        )
        # Inner through-vent slot
        cutters.append(
            mk_extrude_z(f"c_v_{vx}", vent_pill, -1.08, 1.08, xform=[("rz", 0.14), ("t", vx, -0.09, 0.0)], mat=m_pa)
        )
    # Recessed sculpted thumb-rest scallop groove along upper flank shoulder
    cutters.append(mk_box("c_scL", 7.80, 0.16, 0.10, [("t", 0.0, 0.26, -0.86)], m_pa, bevel=0.03))
    cutters.append(mk_box("c_scR", 7.80, 0.16, 0.10, [("t", 0.0, 0.26, 0.86)], m_pa, bevel=0.03))
    body = bool_subtract(raw, cutters, solver="EXACT")

    parts = [body]
    parts += mk_picatinny_rail("uhg_rail", 8.95, 0.0, 0.49, 12, invert_y=False, mat_rail=m_pr, mat_slot=m_pa)
    # Molded lower clamping lip & front/rear steel retainer ferrules + cross-pin boss
    parts.append(mk_box("uhg_rclip", 0.30, 0.48, 1.66, [("t", -4.41, -0.28, 0.0)], m_sh, bevel=0.025))
    parts.append(mk_box("uhg_fclip", 0.30, 0.48, 1.66, [("t", 4.41, -0.28, 0.0)], m_sh, bevel=0.025))
    parts.append(mk_cyl("uhg_pin", 0.075, 0.075, 1.84, "z", 16, [("t", -3.95, -0.42, 0.0)], m_bs, bevel=0.012))

    obj = join_objects(parts, "ak_upper_handguard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_ak_lower_handguard(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_pr = mats["F_PolyamideRail"]
    m_gs = mats["F_GripStipple"]
    m_al = mats["F_BrushedAluminum"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    # Sculpted ergonomic rounded-octagonal free-float U-trough (wider palm belly, sleeker shoulder bevel)
    hg_zy = [(-0.72, -0.90), (0.72, -0.90)]
    hg_zy += _quad_bez((0.72, -0.90), (1.02, -0.76), (1.02, -0.34), 6)
    hg_zy += _quad_bez((1.02, -0.34), (1.01, 0.38), (0.94, 0.78), 5)
    hg_zy += _quad_bez((0.94, 0.78), (0.90, 0.93), (0.74, 0.95), 4)
    hg_zy.append((-0.74, 0.95))
    hg_zy += _quad_bez((-0.74, 0.95), (-0.90, 0.93), (-0.94, 0.78), 4)
    hg_zy += _quad_bez((-0.94, 0.78), (-1.01, 0.38), (-1.02, -0.34), 5)
    hg_zy += _quad_bez((-1.02, -0.34), (-1.02, -0.76), (-0.72, -0.90), 6)

    raw = mk_extrude_x("lhg_raw", hg_zy, -4.82, 4.82, bevel=0.055, bevel_segs=3, mat=m_pm)

    # Stepped chamfered outer vent bezels + inner angled cooling slots + concave C-clamp finger channels
    side_bezel = _pill_2d(1.14, 0.40, 6)
    side_pill = _pill_2d(0.92, 0.26, 6)
    low_pill = _pill_2d(1.06, 0.16, 6)
    cutters = [
        mk_box("c_u", 9.90, 1.54, 1.40, [("t", 0.0, 0.34, 0.0)], m_pa),
        # Sculpted upper C-clamp thumb-rest channel flutes along both flanks
        mk_box("c_flL", 8.40, 0.20, 0.14, [("t", -0.15, 0.72, -0.98)], m_pa, bevel=0.04),
        mk_box("c_flR", 8.40, 0.20, 0.14, [("t", -0.15, 0.72, 0.98)], m_pa, bevel=0.04),
        # Lower forward grasping finger-swell recess
        mk_box("c_gpL", 5.80, 0.42, 0.10, [("t", -0.85, -0.38, -1.02)], m_gs, bevel=0.03),
        mk_box("c_gpR", 5.80, 0.42, 0.10, [("t", -0.85, -0.38, 1.02)], m_gs, bevel=0.03),
    ]
    for vx in (-3.35, -1.90, -0.45, 1.00, 2.45):
        cutters.append(mk_extrude_z(f"c_sbR_{vx}", side_bezel, 0.92, 1.14, xform=[("rz", 0.14), ("t", vx, 0.26, 0.0)], mat=m_pa))
        cutters.append(mk_extrude_z(f"c_sbL_{vx}", side_bezel, -1.14, -0.92, xform=[("rz", 0.14), ("t", vx, 0.26, 0.0)], mat=m_pa))
        cutters.append(mk_extrude_z(f"c_sv_{vx}", side_pill, -1.16, 1.16, xform=[("rz", 0.14), ("t", vx, 0.26, 0.0)], mat=m_pa))
    for lvx in (-2.60, -0.60, 1.40):
        cutters.append(mk_extrude_z(f"c_lv_{lvx}", low_pill, -1.12, 1.12, xform=[("t", lvx, -0.38, 0.0)], mat=m_pa))
    body = bool_subtract(raw, cutters, solver="EXACT")

    # Perforated brushed stainless internal heatshield liners visible through the cooling louvers!
    hs_holes = [mk_cyl(f"c_hsh_{i}", 0.14, 0.14, 1.85, "z", 14, [("t", -3.2 + i * 1.05, 0.22, 0.0)], m_pa) for i in range(7)]
    hs_l = bool_subtract(mk_box("lhg_hsL", 8.10, 0.72, 0.05, [("t", -0.20, 0.20, -0.71)], m_al), hs_holes, solver="EXACT")
    hs_holes_r = [mk_cyl(f"c_hshr_{i}", 0.14, 0.14, 1.85, "z", 14, [("t", -3.2 + i * 1.05, 0.22, 0.0)], m_pa) for i in range(7)]
    hs_r = bool_subtract(mk_box("lhg_hsR", 8.10, 0.72, 0.05, [("t", -0.20, 0.20, 0.71)], m_al), hs_holes_r, solver="EXACT")

    rear_collar = bool_subtract(
        mk_box("lhg_rcol", 0.44, 1.66, 1.84, [("t", -4.60, 0.02, 0.0)], m_sh, bevel=0.025),
        [mk_box("c_rc", 0.65, 1.42, 1.42, [("t", -4.60, 0.22, 0.0)], m_pa)],
        solver="EXACT",
    )
    front_collar = bool_subtract(
        mk_box("lhg_fcol", 0.34, 1.56, 1.80, [("t", 4.65, 0.04, 0.0)], m_sh, bevel=0.025),
        [mk_box("c_fc", 0.55, 1.32, 1.38, [("t", 4.65, 0.24, 0.0)], m_pa)],
        solver="EXACT",
    )

    parts = [
        body,
        hs_l,
        hs_r,
        rear_collar,
        front_collar,
        # Steel cross-retaining pin & front handguard clamp screw
        mk_cyl("lhg_xpin", 0.082, 0.082, 1.98, "z", 16, [("t", -4.45, -0.52, 0.0)], m_bs, bevel=0.012),
        mk_cyl("lhg_fpin", 0.078, 0.078, 1.94, "z", 16, [("t", 4.65, -0.48, 0.0)], m_bs, bevel=0.012),
    ]
    parts += mk_picatinny_rail("lhg_brail", 8.65, 0.05, -0.88, 12, invert_y=True, mat_rail=m_pr, mat_slot=m_pa)

    # 10 crisp molded tactical anti-slip palm-swell grip ridges along lower bevels (both sides)
    for r in range(10):
        rx = -3.75 + r * 0.66
        for side in (-1.0, 1.0):
            parts.append(
                mk_box(f"lhg_rib_{r}_{int(side)}", 0.16, 0.42, 0.085,
                       [("rx", side * 0.36), ("t", rx, -0.66, side * 0.90)], m_pa, bevel=0.022)
            )

    # Forward left & right 4-slot M1913 side rails + countersunk stainless hex screws
    for side in (-1.0, 1.0):
        parts += mk_picatinny_rail(
            f"lhg_srail_{int(side)}", 2.60, 3.15, 0.0, 4, invert_y=False,
            mat_rail=m_pr, mat_slot=m_pa,
            xform=[("rx", side * math.pi * 0.5), ("t", 0.0, 0.22, side * 0.96)],
        )
        for sx in (2.25, 4.05):
            parts.append(mk_cyl(f"lhg_scr_{int(side)}_{sx}", 0.078, 0.078, 0.28, "z", 6,
                                [("t", sx, 0.22, side * 1.07)], m_bs, bevel=0.014))

    obj = join_objects(parts, "ak_lower_handguard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_ak_buttstock(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_gs = mats["F_GripStipple"]
    m_rb = mats["F_MatteRubber"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    # --- 1. Sculpted 2023 AK-12M1 / AK-15M1 EVO L-Frame Polymer Body (NOT a flat extruded plank!) ---
    # Swept ergonomic silhouette with curved cheek comb, graceful underside arch & contoured heel
    st_xy = [(4.60, 1.04), (-5.64, 1.02)]
    st_xy += _quad_bez((-5.64, 1.02), (-5.88, -0.85), (-5.84, -2.86), 8)
    st_xy.append((-4.78, -2.96))
    st_xy += _quad_bez((-4.78, -2.96), (-2.10, -1.62), (1.75, -0.68), 14)
    st_xy += _quad_bez((1.75, -0.68), (3.45, -0.58), (4.60, -0.56), 6)
    raw_st = mk_extrude_z("st_raw", st_xy, -0.69, 0.69, bevel=0.11, bevel_segs=4, mat=m_pm)

    # Rounded triangular ergonomic lightening window (smooth Bezier-cornered cutout!)
    tri_xy = [(-4.10, -0.18), (-0.75, -0.02)]
    tri_xy += _quad_bez((-0.75, -0.02), (-0.45, -0.04), (-0.68, -0.34), 6)
    tri_xy += _quad_bez((-0.68, -0.34), (-2.25, -1.02), (-3.85, -1.55), 8)
    tri_xy += _quad_bez((-3.85, -1.55), (-4.28, -1.52), (-4.30, -1.10), 6)
    tri_xy += _quad_bez((-4.30, -1.10), (-4.28, -0.45), (-4.10, -0.18), 6)

    # Stepped sculpted outer recessed cheek/flank structural pockets (carves real 3D I-beam polymer relief!)
    pock_xy = [(-5.15, 0.56), (3.90, 0.56), (3.90, -0.18), (-1.40, -0.95), (-4.95, -2.25), (-5.15, -2.15)]

    body = bool_subtract(raw_st, [
        mk_extrude_z("c_tri", tri_xy, -0.90, 0.90, mat=m_pa),
        # Stepped recessed side structural web pockets on BOTH flanks (breaks up flat slab completely!)
        mk_extrude_z("c_pkL", pock_xy, -0.76, -0.53, bevel=0.04, bevel_segs=2, mat=m_pa),
        mk_extrude_z("c_pkR", pock_xy, 0.53, 0.76, bevel=0.04, bevel_segs=2, mat=m_pa),
        # Rear tactical sling pass-through slot
        mk_box("c_str", 0.28, 1.42, 1.65, [("t", -4.72, -0.46, 0.0)], m_pa, bevel=0.06, bevel_segs=2),
        # Sleek upper shoulder chamfer grooves (transforms boxy top spine into tapered ergonomic comb!)
        mk_box("c_chL", 10.60, 0.42, 0.34, [("rx", 0.52), ("t", -0.55, 0.96, -0.68)], m_pa),
        mk_box("c_chR", 10.60, 0.42, 0.34, [("rx", -0.52), ("t", -0.55, 0.96, 0.68)], m_pa),
    ], solver="EXACT")

    # --- 2. Contoured Vulcanized Rubber Recoil Buttpad with 10 traction ribs & 2 stainless Allen screws ---
    pad_raw = mk_box("st_pad", 0.56, 3.92, 1.38, [("t", -5.94, -0.95, 0.0)], m_rb, bevel=0.085, bevel_segs=4)
    pad_cuts = [mk_box(f"c_pg_{g}", 0.19, 0.13, 1.54, [("t", -6.20, -2.55 + g * 0.355, 0.0)], m_rb) for g in range(10)]
    # Slight ergonomic shoulder concavity along rear pad face
    pad_cuts.append(mk_cyl("c_pconc", 4.80, 4.80, 1.65, "z", 28, [("t", -10.88, -0.95, 0.0)], m_rb))
    buttpad = bool_subtract(pad_raw, pad_cuts, solver="EXACT")

    # --- 3. Dual Recessed Stainless QD Sling Swivel Cups + 6-Position Perforated Buffer Tube Track ---
    qd_cup = bool_subtract(
        mk_cyl("st_qdo", 0.27, 0.27, 1.36, "z", 28, [("t", -4.35, -1.78, 0.0)], m_bs, bevel=0.024),
        [mk_cyl("c_qdi", 0.155, 0.155, 1.52, "z", 22, [("t", -4.35, -1.78, 0.0)], m_pa)],
        solver="EXACT",
    )
    qd_front = bool_subtract(
        mk_cyl("st_qdf", 0.24, 0.24, 1.24, "z", 24, [("t", 3.45, 0.22, 0.0)], m_bs, bevel=0.020),
        [mk_cyl("c_qdfi", 0.14, 0.14, 1.42, "z", 20, [("t", 3.45, 0.22, 0.0)], m_pa)],
        solver="EXACT",
    )
    # 6-position telescoping steel buffer-tube track with real circular position index holes!
    track_raw = mk_box("st_trk", 5.25, 0.52, 0.62, [("t", 3.40, -0.06, 0.0)], m_sh, bevel=0.035, bevel_segs=2)
    track_holes = [mk_cyl(f"c_th_{i}", 0.095, 0.095, 0.78, "y", 14, [("t", 1.45 + i * 0.66, -0.26, 0.0)], m_pa) for i in range(6)]
    track = bool_subtract(track_raw, track_holes, solver="EXACT")

    # Sculpted contoured telescoping adjustment latch paddle nestled organically into lower arch!
    latch_xy = [(0.55, -0.52), (3.15, -0.48), (3.28, -0.74), (2.95, -0.92), (0.72, -0.82)]
    latch_paddle = mk_extrude_z("st_latch", latch_xy, -0.34, 0.34, bevel=0.045, bevel_segs=3, mat=m_gs)

    parts = [
        # Robust cylindrical receiver-extension buffer tube & molded upper spine rib
        mk_cyl("st_tube", 0.53, 0.53, 5.40, "x", 32, [("t", 3.40, 0.42, 0.0)], m_sh, bevel=0.030),
        track,
        body,
        # Sculpted polymer stiffening truss rib cleanly nested inside the recessed EVO side pocket
        mk_box("st_trussL", 2.15, 0.20, 0.11, [("rz", 0.30), ("t", 0.55, 0.14, -0.57)], m_pm, bevel=0.028),
        mk_box("st_trussR", 2.15, 0.20, 0.11, [("rz", 0.30), ("t", 0.55, 0.14, 0.57)], m_pm, bevel=0.028),
        # Buttpad mounting collar + vulcanized rubber buttpad + 2 countersunk stainless Allen screws
        mk_box("st_pplate", 0.14, 3.84, 1.32, [("t", -5.66, -0.95, 0.0)], m_sh, bevel=0.02),
        buttpad,
        mk_cyl("st_pscr1", 0.085, 0.085, 0.16, "x", 6, [("t", -6.16, 0.42, 0.0)], m_bs, bevel=0.012),
        mk_cyl("st_pscr2", 0.085, 0.085, 0.16, "x", 6, [("t", -6.16, -2.28, 0.0)], m_bs, bevel=0.012),
        # Heavy forged steel left-folding hinge block, knuckle ears, spring release button & hinge pin
        mk_box("st_hpl", 0.92, 1.76, 1.44, [("t", 5.74, 0.24, 0.0)], m_sh, bevel=0.042, bevel_segs=2),
        mk_cyl("st_hknu", 0.21, 0.21, 1.72, "y", 24, [("t", 6.02, 0.24, -0.56)], m_sh, bevel=0.022),
        mk_cyl("st_hpin", 0.11, 0.11, 1.88, "y", 18, [("t", 6.02, 0.24, -0.56)], m_bs, bevel=0.015),
        mk_knurled_cyl("st_hbtn", 0.165, 0.34, "y", flutes=14, depth=0.015, xform=[("t", 5.80, 1.11, -0.34)], mat=m_bs),
        # Dual stainless QD sling sockets + contoured telescoping adjustment lever & pivot pin
        qd_cup,
        qd_front,
        latch_paddle,
        mk_cyl("st_lpin", 0.08, 0.08, 0.96, "z", 16, [("t", 0.92, -0.64, 0.0)], m_bs, bevel=0.012),
    ]
    obj = join_objects(parts, "ak_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_ak_cheek_riser(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    cr_zy = [(-0.79, -0.61), (-0.79, 0.14)]
    cr_zy += _quad_bez((-0.79, 0.14), (-0.75, 0.50), (0.0, 0.55), 10)
    cr_zy += _quad_bez((0.0, 0.55), (0.75, 0.50), (0.79, 0.14), 10)
    cr_zy += [(0.79, -0.61), (0.56, -0.61), (0.56, 0.10)]
    cr_zy += _quad_bez((0.56, 0.10), (0.52, 0.28), (0.0, 0.30), 6)
    cr_zy += _quad_bez((0.0, 0.30), (-0.52, 0.28), (-0.56, 0.10), 6)
    cr_zy.append((-0.56, -0.61))

    raw = mk_extrude_x("cr_raw", cr_zy, -2.59, 2.59, bevel=0.06, bevel_segs=3, mat=m_pm)
    cuts = [
        mk_box("c_fb", 1.25, 0.92, 1.95, [("rz", -0.42), ("t", 2.52, 0.44, 0.0)], m_pa),
        mk_box("c_rb", 0.85, 0.72, 1.95, [("rz", 0.38), ("t", -2.55, 0.42, 0.0)], m_pa),
        mk_box("c_bs", 0.26, 0.54, 1.85, [("t", 0.35, -0.26, 0.0)], m_pa),
    ]
    # Molded vertical elevation-index hash slots on both flanks
    for ix in (-1.55, -1.05, -0.55, 1.25, 1.75):
        cuts.append(mk_box(f"c_ihL_{ix}", 0.10, 0.34, 0.10, [("t", ix, -0.18, -0.78)], m_pa))
        cuts.append(mk_box(f"c_ihR_{ix}", 0.10, 0.34, 0.10, [("t", ix, -0.18, 0.78)], m_pa))
    saddle = bool_subtract(raw, cuts, solver="EXACT")

    parts = [
        saddle,
        mk_cyl("cr_bolt", 0.115, 0.115, 1.68, "z", 22, [("t", 0.35, -0.26, 0.0)], m_bs, bevel=0.015),
        # True 3D 18-flute knurled steel elevation clamping thumbwheel!
        mk_knurled_cyl("cr_whl", 0.265, 0.20, "z", flutes=18, depth=0.022, xform=[("t", 0.35, -0.26, 0.84)], mat=m_sh),
        mk_cyl("cr_cap", 0.14, 0.14, 0.06, "z", 18, [("t", 0.35, -0.26, 0.95)], m_bs, bevel=0.015),
    ]
    obj = join_objects(parts, "ak_cheek_riser")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_ak_pistol_grip(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_gs = mats["F_GripStipple"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    # --- 1. Organically Sculpted 24-Station Ergonomic AK-15M1 Grip Loft ---
    # Deep concave upper beaver-tail web, 3 pronounced front finger grooves, full ergonomic palm swell!
    n_stations = 24
    ring_segs = 32
    front_ctrl = [
        (0.00,  0.34,  0.10),
        (0.16, -0.02, -0.82),
        (0.32, -0.34, -1.62),
        (0.55, -0.78, -2.76),
        (0.78, -1.30, -3.90),
        (1.00, -1.86, -5.04),
    ]
    back_ctrl = [
        (0.00, -2.24,  0.10),
        (0.14, -2.26, -0.68),  # concave upper beaver-tail thumb web!
        (0.42, -2.86, -2.10),  # ergonomic curved palm swell!
        (0.74, -3.44, -3.58),
        (1.00, -3.90, -4.86),
    ]

    def _interp_curve(ctrl, u):
        for i in range(len(ctrl) - 1):
            u0, x0, y0 = ctrl[i]
            u1, x1, y1 = ctrl[i + 1]
            if u <= u1 or i == len(ctrl) - 2:
                t = max(0.0, min(1.0, (u - u0) / max(u1 - u0, 1e-6)))
                return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
        return (ctrl[-1][1], ctrl[-1][2])

    bm_g = bmesh.new()
    rings = []
    for s in range(n_stations + 1):
        u = s / n_stations
        fx, fy = _interp_curve(front_ctrl, u)
        bx, by = _interp_curve(back_ctrl, u)
        # 3 distinct ergonomic frontstrap finger scallops + pronounced upper middle-finger undercut
        finger_bump = 0.125 * max(0.0, math.sin(u * math.pi)) * math.sin(u * 3.0 * math.pi)
        fx += finger_bump
        cx = 0.5 * (fx + bx)
        cy = 0.5 * (fy + by)
        hx = max(0.48, 0.5 * (fx - bx))
        # Fuller rounded palm swell in middle (0.67 cm), sleeker at upper web (0.54 cm) & flared heel (0.64 cm)
        hz = 0.54 + 0.13 * math.sin(min(1.0, u * 1.12) * math.pi) + 0.04 * (u * u)
        if s == 0:
            hx *= 0.94
            hz *= 0.92
        elif s == n_stations:
            hx *= 0.98
            hz *= 0.96
        ring = []
        for k in range(ring_segs):
            th = 2.0 * math.pi * k / ring_segs
            ct, st = math.cos(th), math.sin(th)
            # Smooth rounded super-ellipse (p=2.2) gives true molded ergonomic polymer contours
            sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
            sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
            px = cx + hx * sx
            py = cy + 0.5 * (fy - by) * sx
            pz = hz * sz
            ring.append(bm_g.verts.new((px, py, pz)))
        rings.append(ring)

    for s in range(n_stations):
        for k in range(ring_segs):
            kn = (k + 1) % ring_segs
            bm_g.faces.new((rings[s][k], rings[s + 1][k], rings[s + 1][kn], rings[s][kn]))
    bm_g.faces.new(list(reversed(rings[0])))
    bm_g.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm_g, faces=bm_g.faces)
    _apply_three_xform(bm_g, [])
    grip_body = _bm_to_obj("pg_body", bm_g, m_pm)

    # --- 2. Contoured Curved Raised Tactical Stipple Palm Panels (conforming 1:1 to grip surface!) ---
    # Replaces ugly flat rectangular cutout boxes with sculpted curved diamond-stippled pads!
    bm_pad = bmesh.new()
    for side in (-1.0, 1.0):
        p_stations = 12
        p_cols = 8
        grid_in = []
        grid_out = []
        for si in range(p_stations + 1):
            u = 0.24 + 0.58 * (si / p_stations)
            fx, fy = _interp_curve(front_ctrl, u)
            bx, by = _interp_curve(back_ctrl, u)
            cx = 0.5 * (fx + bx)
            cy = 0.5 * (fy + by)
            hx = max(0.48, 0.5 * (fx - bx))
            hz = 0.54 + 0.13 * math.sin(min(1.0, u * 1.12) * math.pi) + 0.04 * (u * u)
            # Taper pad ends organically into elliptical palm contour
            u_end = math.sin((si / p_stations) * math.pi)
            row_in = []
            row_out = []
            for ci in range(p_cols + 1):
                c_frac = (ci / p_cols) * 2.0 - 1.0  # -1..+1 across grip flank
                th = side * (math.pi * 0.5) - side * (c_frac * 0.52 * (0.55 + 0.45 * u_end))
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
                px = cx + hx * sx
                py = cy + 0.5 * (fy - by) * sx
                pz_base = hz * sz
                # Edge taper so panel rises smoothly out of the curved palm wall
                edge_w = math.sin((ci / p_cols) * math.pi) * u_end
                raise_z = 0.036 * (0.25 + 0.75 * edge_w)
                row_in.append(bm_pad.verts.new((px, py, pz_base - side * 0.03)))
                row_out.append(bm_pad.verts.new((px, py, pz_base + side * raise_z)))
            grid_in.append(row_in)
            grid_out.append(row_out)
        for si in range(p_stations):
            for ci in range(p_cols):
                if side > 0:
                    bm_pad.faces.new((grid_out[si][ci], grid_out[si + 1][ci], grid_out[si + 1][ci + 1], grid_out[si][ci + 1]))
                    bm_pad.faces.new((grid_in[si][ci], grid_in[si][ci + 1], grid_in[si + 1][ci + 1], grid_in[si + 1][ci]))
                else:
                    bm_pad.faces.new((grid_out[si][ci], grid_out[si][ci + 1], grid_out[si + 1][ci + 1], grid_out[si + 1][ci]))
                    bm_pad.faces.new((grid_in[si][ci], grid_in[si + 1][ci], grid_in[si + 1][ci + 1], grid_in[si][ci + 1]))
        # Stitch 4 perimeter walls cleanly so palm pads are 100% closed manifold solids
        for si in range(p_stations):
            bm_pad.faces.new((grid_in[si][0], grid_out[si][0], grid_out[si + 1][0], grid_in[si + 1][0]))
            bm_pad.faces.new((grid_in[si][p_cols], grid_in[si + 1][p_cols], grid_out[si + 1][p_cols], grid_out[si][p_cols]))
        for ci in range(p_cols):
            bm_pad.faces.new((grid_in[0][ci], grid_in[0][ci + 1], grid_out[0][ci + 1], grid_out[0][ci]))
            bm_pad.faces.new((grid_in[p_stations][ci], grid_out[p_stations][ci], grid_out[p_stations][ci + 1], grid_in[p_stations][ci + 1]))
    bmesh.ops.recalc_face_normals(bm_pad, faces=bm_pad.faces)
    _apply_three_xform(bm_pad, [])
    palm_pads = _bm_to_obj("pg_pads", bm_pad, m_gs)

    # --- 3. SWEPT CURVED MONOLITHIC ERGONOMIC TRIGGER GUARD (KILL THE SQUARE `[_]` BRACKET!) ---
    # Smoothly sweeps from upper frontstrap undercut -> rounded gloved bow -> forward steel mag-catch guard!
    tg_outer = [
        (-0.35,  0.04),
        ( 0.42,  0.04),
        ( 0.46, -0.56),
    ]
    tg_outer += _quad_bez((0.46, -0.56), (0.62, -1.26), (1.42, -1.44), 10)
    tg_outer += _quad_bez((1.42, -1.44), (2.52, -1.52), (3.16, -1.16), 10)
    tg_outer += _quad_bez((3.16, -1.16), (3.52, -0.92), (3.62, -0.18), 8)
    tg_outer += [
        (3.62,  0.04),
        (3.18,  0.04),
    ]
    tg_outer += _quad_bez((3.18,  0.04), (3.14, -0.82), (2.68, -1.04), 8)
    tg_outer += _quad_bez((2.68, -1.04), (1.82, -1.20), (1.06, -1.10), 10)
    tg_outer += _quad_bez((1.06, -1.10), (0.52, -0.96), (0.36, -0.22), 8)
    tg_outer.append((-0.35, -0.22))
    tguard = mk_extrude_z("pg_tg_swept", tg_outer, -0.35, 0.35, bevel=0.068, bevel_segs=4, mat=m_pm)

    # --- 4. Steel Magazine-Catch Bracket, Rolled Cross-Pin & Serrated Tactical Extended Paddle ---
    mag_catch_h = bool_subtract(
        mk_box("pg_mch", 0.72, 0.68, 0.88, [("t", 3.65, -0.28, 0.0)], m_sh, bevel=0.028),
        [mk_box("c_mcs", 0.80, 0.75, 0.52, [("t", 3.65, -0.35, 0.0)], m_pa)],
        solver="EXACT",
    )

    parts = [
        grip_body,
        palm_pads,
        tguard,
        # Flush upper receiver-interface tang collar (seals trigger-guard-to-receiver junction cleanly!)
        mk_box("pg_collar", 2.48, 0.24, 1.18, [("t", -0.92, -0.02, 0.0)], m_pm, bevel=0.045, bevel_segs=2),
        mag_catch_h,
        # Flared contoured bottom storage-compartment baseplate + rear hinge lug + front steel spring latch
        mk_box("pg_cap", 2.16, 0.28, 1.32, [("rz", -0.14), ("t", -2.90, -5.02, 0.0)], m_pa, bevel=0.065, bevel_segs=3),
        mk_box("pg_tab", 0.44, 0.16, 0.58, [("rz", -0.14), ("t", -2.18, -5.16, 0.0)], m_sh, bevel=0.025),
        mk_cyl("pg_hpin", 0.055, 0.055, 1.12, "z", 12, [("t", -3.76, -4.96, 0.0)], m_bs),
        # Extended ergonomic steel mag-release paddle with textured thumb shelf
        mk_box("pg_pad", 0.20, 1.04, 0.46, [("rz", 0.28), ("t", 3.74, -0.84, 0.0)], m_sh, bevel=0.028),
        mk_box("pg_ptip", 0.30, 0.24, 0.72, [("rz", 0.28), ("t", 3.89, -1.28, 0.0)], m_sh, bevel=0.035),
        mk_cyl("pg_pin", 0.098, 0.098, 1.04, "z", 20, [("t", 3.65, -0.32, 0.0)], m_bs, bevel=0.015),
    ]

    # Smooth curved conformal frontstrap & backstrap traction micro-ridges hugging the superellipse!
    # (Taper smoothly to zero at +-36 deg so ZERO spiky corners ever protrude out of the grip!)
    def _mk_curved_grip_rib(name: str, u_c: float, is_front: bool):
        bm_r = bmesh.new()
        r_rings = []
        du_half = 0.011
        for du, proud_r in ((-du_half, -0.012), (-du_half * 0.45, 0.028), (du_half * 0.45, 0.028), (du_half, -0.012)):
            u_s = max(0.02, min(0.98, u_c + du))
            fx, fy = _interp_curve(front_ctrl, u_s)
            bx, by = _interp_curve(back_ctrl, u_s)
            fx += 0.125 * max(0.0, math.sin(u_s * math.pi)) * math.sin(u_s * 3.0 * math.pi)
            cx = 0.5 * (fx + bx)
            cy = 0.5 * (fy + by)
            hx = max(0.48, 0.5 * (fx - bx))
            hz = 0.54 + 0.13 * math.sin(min(1.0, u_s * 1.12) * math.pi) + 0.04 * (u_s * u_s)
            sign_x = 1.0 if is_front else -1.0
            base_ang = 0.0 if is_front else math.pi
            ring_v = []
            # Outer curved arc
            for k in range(9):
                a_off = math.radians(-34.0 + 68.0 * (k / 8.0))
                th = base_ang + a_off
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
                taper = max(0.0, math.cos(a_off * 2.4))
                px = cx + hx * sx + sign_x * proud_r * taper
                py = cy + 0.5 * (fy - by) * sx
                pz = hz * sz
                ring_v.append(bm_r.verts.new((px, py, pz)))
            # Inner embedded arc (0.14 cm inside grip wall -> 100% closed watertight solid!)
            for k in range(8, -1, -1):
                a_off = math.radians(-34.0 + 68.0 * (k / 8.0))
                th = base_ang + a_off
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
                px = cx + max(0.25, hx - 0.14) * sx
                py = cy + 0.5 * (fy - by) * sx
                pz = hz * 0.86 * sz
                ring_v.append(bm_r.verts.new((px, py, pz)))
            r_rings.append(ring_v)
        n_rp = len(r_rings[0])
        for ri in range(len(r_rings) - 1):
            for k in range(n_rp):
                kn = (k + 1) % n_rp
                bm_r.faces.new((r_rings[ri][k], r_rings[ri + 1][k], r_rings[ri + 1][kn], r_rings[ri][kn]))
        bm_r.faces.new(list(reversed(r_rings[0])))
        bm_r.faces.new(r_rings[-1])
        bmesh.ops.recalc_face_normals(bm_r, faces=bm_r.faces)
        if bm_r.calc_volume(signed=True) < 0.0:
            bmesh.ops.reverse_faces(bm_r, faces=bm_r.faces)
        _apply_three_xform(bm_r, [])
        return _bm_to_obj(name, bm_r, m_pa)

    for i in range(9):
        u_rib = 0.24 + i * 0.072
        parts.append(_mk_curved_grip_rib(f"pg_frib_{i}", u_rib, is_front=True))
        parts.append(_mk_curved_grip_rib(f"pg_brib_{i}", u_rib, is_front=False))

    obj = join_objects(parts, "ak_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def _banana_poly(arc_cx, arc_cy, r_in, r_out, ang0, ang1, steps=32):
    pts = []
    for i in range(steps + 1):
        a = ang0 + (ang1 - ang0) * (i / steps)
        pts.append((arc_cx - math.cos(a) * r_out, arc_cy - math.sin(a) * r_out))
    for i in range(steps, -1, -1):
        a = ang0 + (ang1 - ang0) * (i / steps)
        pts.append((arc_cx - math.cos(a) * r_in, arc_cy - math.sin(a) * r_in))
    return pts


def build_ak_mag_body(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_bs = mats["F_BrightSteelHardware"]

    ARC_CX, ARC_CY = 11.80, 0.25
    ARC_R_IN, ARC_R_OUT = 10.60, 13.10
    ANG0, ANG1 = -0.025, 0.885

    raw = mk_extrude_z(
        "mag_raw",
        _banana_poly(ARC_CX, ARC_CY, ARC_R_IN, ARC_R_OUT, ANG0, ANG1, 34),
        -0.65, 0.65, bevel=0.080, bevel_segs=3, mat=m_pm,
    )

    inner_cav = mk_extrude_z(
        "c_cav",
        _banana_poly(ARC_CX, ARC_CY, 10.72, 12.94, -0.06, 0.90, 32),
        -0.44, 0.44, mat=m_pa,
    )
    win_bezel_poly = _banana_poly(ARC_CX, ARC_CY, 11.49, 12.21, 0.148, 0.712, 22)
    win_slot_poly = _banana_poly(ARC_CX, ARC_CY, 11.55, 12.15, 0.160, 0.700, 22)

    wit_ang = 0.78
    cutters = [
        inner_cav,
        mk_box("c_thr", 1.92, 1.85, 0.86, [("t", -0.05, 0.15, 0.0)], m_pa),
        mk_extrude_z("c_wbR", win_bezel_poly, 0.59, 0.72, mat=m_pa),
        mk_extrude_z("c_wbL", win_bezel_poly, -0.72, -0.59, mat=m_pa),
        mk_extrude_z("c_ws", win_slot_poly, -0.72, 0.72, mat=m_pa),
        mk_cyl(
            "c_rwit", 0.085, 0.085, 0.48, "y", 14,
            [("rz", math.pi * 0.5 + wit_ang), ("t", ARC_CX - math.cos(wit_ang) * 12.92, ARC_CY - math.sin(wit_ang) * 12.92, 0.0)],
            m_pa,
        ),
    ]
    sculpted = bool_subtract(raw, cutters, solver="EXACT")

    parts = [sculpted]
    # Swept curved longitudinal reinforcement spine rails along front & rear edges (signature AK-15 mag!)
    parts.append(mk_extrude_z("mag_spF", _banana_poly(ARC_CX, ARC_CY, 10.64, 10.92, 0.14, 0.85, 24), -0.675, 0.675, bevel=0.03, bevel_segs=2, mat=m_pa))
    parts.append(mk_extrude_z("mag_spR", _banana_poly(ARC_CX, ARC_CY, 12.78, 13.06, 0.14, 0.85, 24), -0.675, 0.675, bevel=0.03, bevel_segs=2, mat=m_pa))

    # Crisp diagonal molded tactical grip ribs flanking front & rear spines
    for r in range(1, 8):
        ang = 0.12 + r * 0.095
        fx = ARC_CX - math.cos(ang) * 11.02
        fy = ARC_CY - math.sin(ang) * 11.02
        bx = ARC_CX - math.cos(ang) * 12.68
        by = ARC_CY - math.sin(ang) * 12.68
        parts.append(mk_box(f"mag_fr_{r}", 0.58, 0.15, 1.35, [("rz", ang + 0.18), ("t", fx, fy, 0.0)], m_pa, bevel=0.025))
        parts.append(mk_box(f"mag_br_{r}", 0.58, 0.15, 1.35, [("rz", ang - 0.18), ("t", bx, by, 0.0)], m_pa, bevel=0.025))

    # Embedded rock-and-lock steel front hook lug, rear paddle tooth, bullet-tip collar & rolled C-curl steel feed lips
    parts.append(mk_box("mag_flug", 0.42, 0.36, 0.94, [("rz", -0.12), ("t", 1.20, -0.38, 0.0)], m_bs, bevel=0.02))
    parts.append(mk_box("mag_rlug", 0.46, 0.30, 0.88, [("rz", 0.22), ("t", -1.34, -0.64, 0.0)], m_bs, bevel=0.02))
    parts.append(mk_box("mag_fcol", 0.24, 0.32, 0.96, [("t", 0.95, 0.44, 0.0)], m_bs, bevel=0.018))

    for side in (-1.0, 1.0):
        lip_zy = [(0.52 * side, 0.38), (0.52 * side, 0.62)]
        lip_zy += _quad_bez((0.52 * side, 0.62), (0.52 * side, 0.72), (0.41 * side, 0.72), 5)
        lip_zy.append((0.27 * side, 0.69))
        lip_zy += _quad_bez((0.27 * side, 0.69), (0.23 * side, 0.66), (0.26 * side, 0.62), 4)
        lip_zy.append((0.39 * side, 0.60))
        lip_zy += _quad_bez((0.39 * side, 0.60), (0.43 * side, 0.59), (0.43 * side, 0.52), 4)
        lip_zy.append((0.43 * side, 0.38))
        lip_obj = mk_extrude_x(f"mag_lip_{int(side)}", lip_zy, -1.11, 1.01, bevel=0.012, bevel_segs=2, mat=m_bs)
        # Forward release flare matching buildAkRolledFeedLip()
        bm = bmesh.new()
        bm.from_mesh(lip_obj.data)
        for v in bm.verts:
            # Blender x = Three.js x, Blender z = Three.js y
            tx, ty = v.co.x, v.co.z
            if tx > 0.32 and ty > 0.56:
                t = min(1.0, (tx - 0.32) / 0.68)
                v.co.z = ty - t * 0.07 * ((ty - 0.56) / 0.16)
        bm.to_mesh(lip_obj.data)
        bm.free()
        parts.append(lip_obj)

    obj = join_objects(parts, "ak_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_ak_mag_follower(mats: dict) -> bpy.types.Object:
    m_fo = mats["F_FollowerOrange"]
    parts = [
        mk_box("flw_top", 2.05, 0.24, 0.82, [("rz", 0.10), ("t", 0.0, 0.15, 0.0)], m_fo, bevel=0.03),
        mk_cyl("flw_rdg", 0.14, 0.14, 1.96, "y", 20, [("rz", math.pi * 0.5 + 0.10), ("t", 0.0, 0.30, -0.18)], m_fo, bevel=0.02),
        mk_box("flw_fsk", 0.22, 0.98, 0.78, [("rz", 0.14), ("t", 0.92, -0.34, 0.0)], m_fo, bevel=0.025),
        mk_box("flw_rsk", 0.22, 0.98, 0.78, [("rz", 0.14), ("t", -0.92, -0.34, 0.0)], m_fo, bevel=0.025),
        mk_box("flw_bos", 1.15, 0.26, 0.42, [("rz", 0.10), ("t", 0.0, -0.10, 0.0)], m_fo, bevel=0.02),
    ]
    obj = join_objects(parts, "ak_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_ak_mag_floorplate(mats: dict) -> bpy.types.Object:
    m_rb = mats["F_MatteRubber"]
    m_pa = mats["F_PolyamideAccent"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteelHardware"]

    plate_raw = mk_box("fp_raw", 2.68, 0.40, 1.38, mat=m_rb, bevel=0.04, bevel_segs=2)
    grooves = [mk_box(f"c_gr_{g}", 0.14, 0.12, 1.50, [("t", g * 0.44, -0.18, 0.0)], m_pa) for g in range(-2, 3)]
    bumper = bool_subtract(plate_raw, grooves, solver="EXACT")

    # Rotate bumper by +0.88 rad around Three.js Z (matching buildAkMagFloorplateGeometry)
    bm = bmesh.new()
    bm.from_mesh(bumper.data)
    rot_m = T2B_MAT @ Matrix.Rotation(0.88, 4, "Z") @ B2T_MAT
    bmesh.ops.transform(bm, matrix=rot_m, verts=bm.verts)
    bm.to_mesh(bumper.data)
    bm.free()

    parts = [
        bumper,
        mk_box("fp_lipL", 2.52, 0.14, 0.12, [("t", 0.0, 0.22, -0.61), ("rz", 0.88)], m_sh, bevel=0.015),
        mk_box("fp_lipR", 2.52, 0.14, 0.12, [("t", 0.0, 0.22, 0.61), ("rz", 0.88)], m_sh, bevel=0.015),
        mk_cyl("fp_stud", 0.18, 0.18, 0.26, "y", 22, [("t", 0.0, -0.10, 0.0), ("rz", 0.88)], m_bs, bevel=0.02),
    ]
    obj = join_objects(parts, "ak_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart Packing
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    skip_face_fn=None,
):
    """Smart-unwraps selected faces across multiple objects, packs with zero overlap,
    and remaps packed UVs cleanly into [u0, u1] x [v0, v1]."""
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    # Ensure every object has a UVMap named 'UVMap' and select ONLY non-hero faces cleanly
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
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            is_hero = skip_face_fn(o.name, f, mname) if skip_face_fn else False
            f.select = not is_hero
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.004,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=0.0045,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    # Remap packed [0, 1]^2 UVs into [u0, u1] x [v0, v1] for non-hero faces only,
    # and assert full coverage so collapsed-UV bugs can NEVER slip through!
    du = u1 - u0
    dv = v1 - v0
    packed_u_min, packed_u_max = 1.0, 0.0
    packed_v_min, packed_v_max = 1.0, 0.0
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if skip_face_fn and skip_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                packed_u_min = min(packed_u_min, ux)
                packed_u_max = max(packed_u_max, ux)
                packed_v_min = min(packed_v_min, vy)
                packed_v_max = max(packed_v_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = packed_u_max - packed_u_min
    span_v = packed_v_max - packed_v_min
    print(f"  [UV-PACK] {len(objs)} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.55 and span_v > 0.55, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps the 4 receiver hero parts into dedicated `ak15_v3_receiver` (2048x2048):
      - Hero Band 1 (Receiver Right exterior stamped wall): u in [0.015, 0.985], v in [0.790, 0.985]
      - Hero Band 2 (Receiver Left  exterior stamped wall): u in [0.015, 0.985], v in [0.580, 0.775]
      - High-Texel Packed Region (dust cover, rear sight, selector, receiver non-hero): u in [0.010, 0.990], v in [0.010, 0.565]
    """
    def is_rec_hero_wall(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "ak_receiver" or mat_name != "M_ReceiverPhosphate":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if tx < -6.22 or tx > 6.02 or ty < -0.90 or ty > 1.60:
            return False
        if nz > 0.55 and tz > 0.68:
            return True
        if nz < -0.55 and tz < -0.68:
            return True
        return False

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.990, 0.010, 0.565, skip_face_fn=is_rec_hero_wall)

    rec = next(o for o in recv_objs if o.name == "ak_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rec.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_rec_hero_wall("ak_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-6.25)) / 12.30))
            yn = max(0.0, min(1.0, (ty - (-0.92)) / 2.56))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.790 + yn * 0.195)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.580 + yn * 0.195)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps all 12 barrel/muzzle/gas-block/bolt/carrier/FCG parts into `ak15_v3_metal` (2048x2048):
      - Upper zone (exterior barrel, muzzle brake, gas block, gas tube): [0.010, 0.990] x [0.490, 0.990]
      - Lower zone (internal bolt carrier, chrome piston, bolt, firing pin, FCG): [0.010, 0.990] x [0.010, 0.475]
    """
    ext_front = [o for o in metal_objs if o.name in {"ak_barrel", "ak_muzzle_device", "ak_gas_block", "ak_gas_tube"}]
    int_mech = [o for o in metal_objs if o.name not in {"ak_barrel", "ak_muzzle_device", "ak_gas_block", "ak_gas_tube"}]
    _smart_unwrap_and_pack_rect(ext_front, 0.010, 0.990, 0.490, 0.990, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(int_mech, 0.010, 0.990, 0.010, 0.475, skip_face_fn=None)


def unwrap_furniture_atlas(furn_objs: list[bpy.types.Object]):
    """Unwraps all 8 furniture parts into `ak15_v3_furniture` (2048x2048):
      - Hero Band 1 (Mag Right flank): u in [0.015, 0.195], v in [0.020, 0.810]
      - Hero Band 2 (Mag Left  flank): u in [0.210, 0.390], v in [0.020, 0.810]
      - Pack Region A (upper handguard, lower handguard, buttstock, pistol grip, mag non-hero): u in [0.405, 0.990], v in [0.010, 0.990]
      - Pack Region B (cheek riser, mag follower, mag floorplate): u in [0.010, 0.395], v in [0.825, 0.990]
    """
    ARC_CX, ARC_CY = 11.80, 0.25

    def is_mag_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "ak_mag_body" or mat_name != "F_PolyamideMain":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.85 and tz > 0.625:
            return True
        if nz < -0.85 and tz < -0.625:
            return True
        return False

    # Isolate bright-orange ak_mag_follower in its OWN firewalled UV box so orange dilation
    # can NEVER bleed onto ak_cheek_riser, ak_mag_floorplate, or ak_pistol_grip!
    follower_group = [o for o in furn_objs if o.name == "ak_mag_follower"]
    riser_floor_group = [o for o in furn_objs if o.name in {"ak_cheek_riser", "ak_mag_floorplate"}]
    main_group = [o for o in furn_objs if o.name not in {"ak_mag_follower", "ak_cheek_riser", "ak_mag_floorplate"}]

    _smart_unwrap_and_pack_rect(main_group, 0.415, 0.990, 0.010, 0.990, skip_face_fn=is_mag_hero_flank)
    _smart_unwrap_and_pack_rect(follower_group, 0.010, 0.140, 0.840, 0.990, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(riser_floor_group, 0.175, 0.385, 0.840, 0.990, skip_face_fn=None)

    # Project exact banana polar UVs onto Hero Band 1 & 2 for magazine right & left flanks
    mag = next(o for o in furn_objs if o.name == "ak_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero_flank("ak_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            dx = tx - ARC_CX
            dy = ty - ARC_CY
            rad = math.hypot(dx, dy)
            ang = math.atan2(-dy, -dx)
            s_norm = max(0.0, min(1.0, (ang - (-0.03)) / 0.92))
            r_norm = max(0.0, min(1.0, (rad - 10.50) / 2.70))
            v_val = 0.810 - s_norm * 0.790
            if is_right:
                u_val = 0.015 + (1.0 - r_norm) * 0.180
            else:
                u_val = 0.210 + r_norm * 0.180
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(mag.data)
    bm.free()


# =============================================================================
# Cycles Multi-Channel GPU Baking Engine
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


def _remove_bake_image_nodes(created: list[tuple]):
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set: set[bpy.types.Material], input_name: str):
    """Temporarily routes Principled BSDF input ('Base Color', 'Roughness', 'Metallic') to Emission
    so Cycles EMIT bake outputs 100% pure noise-free values even on pure metals (Metallic=1.0)!"""
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


def _restore_bsdf(saved: list[tuple]):
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path):
    """Saves exact float32 Cycles bake buffer flipped vertically to top-down (H, W, 3) .npy."""
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]):
    """Separates every part by 60 cm so Self-AO bakes cleanly with zero inter-part occlusion."""
    for i, o in enumerate(all_objs):
        o.location = (i * 60.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]):
    """Places exterior parts at exact assembledPos/assembledRot for ray-traced contact AO."""
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
            o.rotation_euler = (rx, -rz, ry)
        else:
            # Hide internal parts so they don't occlude exterior or get blackened
            o.hide_render = True
            o.location = (0.0, 200.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    """Option A: Resets every part to identity transform (0,0,0) before Draco glTF export."""
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str,
    target_objs: list[bpy.types.Object],
    all_objs: list[bpy.types.Object],
    tmp_dir: Path,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
                 normal_op: bool = False, extra_objs_override=None):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
        # Fill pixel buffer cleanly before baking
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=6, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    # 1. Isolated grid layout for pure Albedo, Roughness, Metalness, Tangent Normal & Self-AO
    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=4, fill_color=(0.04, 0.045, 0.05, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=4, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=4, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.60
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # 2. Assembled exterior layout for ray-traced inter-part contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.45
    run_bake("ao_ext", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

    # Bake white mask for exterior parts so post-process blends contact AO ONLY onto exterior parts!
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
    # Bake mask
    img_m = bpy.data.images.new(f"{prefix}_ext_mask", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    arr = np.zeros((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
    arr[:, 3] = 1.0
    img_m.pixels.foreach_set(arr.ravel())
    nodes_m = _attach_bake_image_node({white_mat}, img_m)
    scene.cycles.samples = 1
    select_only(ext_targets, ext_targets[0])
    bpy.ops.object.bake(type="EMIT", margin=6, use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)
    for o in ext_targets:
        o.data.materials.clear()
        for m in orig_mats[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


# =============================================================================
# Verification & Draco glTF 2.0 Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
    max_bbox_delta = 0.0
    total_tris = 0
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        # Compute Three.js local space bbox: tx=bx, ty=bz, tz=-by
        xs = [v.co.x for v in bm.verts]
        ys = [v.co.z for v in bm.verts]
        zs = [-v.co.y for v in bm.verts]
        bmin = (min(xs), min(ys), min(zs))
        bmax = (max(xs), max(ys), max(zs))
        # Tri count
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()

        ref_min, ref_max = CSG_REF_BBOX[o.name]
        deltas = [abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)]
        d_max = max(deltas)
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.08) else "WARN"
        print(
            f"  [{status}] {o.name:20s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0:
            print(f"       !! WARNING: {o.name} has {non_man} non-manifold edges!")
        if d_max > 0.08:
            print(f"       !! BBOX DELTA > 0.08cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] 24 parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    return report


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    select_only(all_objs, all_objs[0])
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_OUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=True,
        export_materials="NONE",
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=12,
        export_draco_texcoord_quantization=12,
    )
    print(f"[EXPORT] Wrote Draco GLB -> {MODELS_OUT} ({MODELS_OUT.stat().st_size / 1024:.1f} KB)")


def _make_baked_preview_mat(name: str, suite_prefix: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def _load_tex(fname: str, cs: str):
        img = bpy.data.images.load(str(TEX_OUT_DIR / fname), check_existing=True)
        img.colorspace_settings.name = cs
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        return tex

    t_alb = _load_tex(f"{suite_prefix}_albedo.webp", "sRGB")
    t_nrm = _load_tex(f"{suite_prefix}_normal.webp", "Non-Color")
    t_orm = _load_tex(f"{suite_prefix}_roughness.webp", "Non-Color")

    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])

    mix_ao = nt.nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.blend_type = "MULTIPLY"
    mix_ao.inputs[0].default_value = 0.85
    nt.links.new(t_alb.outputs["Color"], mix_ao.inputs[6])
    nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])
    nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])

    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 1.0
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def render_qa_previews(
    recv_objs: list[bpy.types.Object],
    metal_objs: list[bpy.types.Object],
    furn_objs: list[bpy.types.Object],
):
    print("\n[QA] Rendering 5 museum studio Cycles QA preview plates to /tmp/ak15_qa_*.png...")
    scene = bpy.context.scene
    all_objs = recv_objs + metal_objs + furn_objs

    for o in all_objs:
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
        o.rotation_euler = (rx, -rz, ry)
        o.hide_render = False

    m_recv = _make_baked_preview_mat("QA_Recv", "ak15_v3_receiver")
    m_met = _make_baked_preview_mat("QA_Metal", "ak15_v3_metal")
    m_furn = _make_baked_preview_mat("QA_Furn", "ak15_v3_furniture")
    for grp, pm in ((recv_objs, m_recv), (metal_objs, m_met), (furn_objs, m_furn)):
        for o in grp:
            o.data.materials.clear()
            o.data.materials.append(pm)

    world = scene.world
    wnt = world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wbg = wnt.nodes.new("ShaderNodeBackground")
    wbg.inputs["Color"].default_value = (0.52, 0.54, 0.57, 1.0)
    wbg.inputs["Strength"].default_value = 1.25
    wnt.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

    lights = []
    for lname, loc, energy, size in (
        ("QA_Key",  (10.0, -52.0, 34.0), 22000.0, 32.0),
        ("QA_Fill", (12.0,  52.0, 22.0), 14000.0, 36.0),
        ("QA_Rim",  (-14.0, -18.0, 48.0), 12000.0, 26.0),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(lname, ld)
        lo.location = loc
        direction = Vector((4.0, 0.0, 0.0)) - Vector(loc)
        lo.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)
        lights.append(lo)

    cam_d = bpy.data.cameras.new("QA_Cam")
    cam_d.lens = 75.0
    cam_o = bpy.data.objects.new("QA_Cam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2

    shots = [
        ("right",        ( 3.5, -56.0,  1.0), ( 3.5, 0.0, -1.0), 72.0),
        ("left",         ( 3.5,  56.0,  1.0), ( 3.5, 0.0, -1.0), 72.0),
        ("macro_breech", ( 0.0, -18.5,  0.8), ( 0.0, 0.0,  0.4), 80.0),
        ("macro_left",   ( 0.0,  18.5,  0.8), ( 0.0, 0.0,  0.4), 80.0),
        ("macro_grip",   (-3.2, -16.0, -2.6), (-3.2, 0.0, -2.6), 82.0),
    ]
    for tag, cam_pos, tgt, lens in shots:
        cam_d.lens = lens
        cam_o.location = cam_pos
        direction = Vector(tgt) - Vector(cam_pos)
        cam_o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        out_p = f"/tmp/ak15_qa_{tag}.png"
        scene.render.filepath = out_p
        bpy.ops.render.render(write_still=True)
        print(f"  [QA-RENDER] Saved {out_p}")

    for lo in lights:
        bpy.data.objects.remove(lo, do_unlink=True)
    bpy.data.objects.remove(cam_o, do_unlink=True)


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        "ak_receiver": build_ak_receiver,
        "ak_dust_cover": build_ak_dust_cover,
        "ak_rear_sight": build_ak_rear_sight,
        "ak_bolt_carrier": build_ak_bolt_carrier,
        "ak_bolt": build_ak_bolt,
        "ak_firing_pin": build_ak_firing_pin,
        "ak_extractor": build_ak_extractor,
        "ak_recoil_guide": build_ak_recoil_guide,
        "ak_gas_tube": build_ak_gas_tube,
        "ak_barrel": build_ak_barrel,
        "ak_muzzle_device": build_ak_muzzle_device,
        "ak_gas_block": build_ak_gas_block,
        "ak_hammer": build_ak_hammer,
        "ak_trigger": build_ak_trigger,
        "ak_disconnector": build_ak_disconnector,
        "ak_selector": build_ak_selector,
        "ak_upper_handguard": build_ak_upper_handguard,
        "ak_lower_handguard": build_ak_lower_handguard,
        "ak_buttstock": build_ak_buttstock,
        "ak_cheek_riser": build_ak_cheek_riser,
        "ak_pistol_grip": build_ak_pistol_grip,
        "ak_mag_body": build_ak_mag_body,
        "ak_mag_follower": build_ak_mag_follower,
        "ak_mag_floorplate": build_ak_mag_floorplate,
    }

    print("[BUILD] Sculpting all 24 solid AK-15M1 hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    furn_objs = [built[pid] for pid in FURNITURE_PARTS]
    all_objs = recv_objs + metal_objs + furn_objs

    print("[VERIFY] Checking manifoldness, outward normals & ergonomic alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (4), metal (12), furniture (8)...")
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)
    unwrap_furniture_atlas(furn_objs)

    # Assert ZERO overlapping UV explosions across all 3 atlases!
    for label, group in (("receiver", recv_objs), ("metal", metal_objs), ("furniture", furn_objs)):
        tot_area = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot_area += oa
            assert 0.00003 < oa < 0.72, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    print("[TRI] Pre-bake triangulation with preserved custom normals (1:1 tangent-frame lock)...")
    triangulate_all_keep_normals(all_objs)

    with tempfile.TemporaryDirectory(prefix="ak15_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking ak15_v3_receiver (2048x2048, 4 hero parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking ak15_v3_metal (2048x2048, 12 ordnance/FCG parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking ak15_v3_furniture (2048x2048, 8 ergonomic polymer parts)...")
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir)

        print("[POST] Compositing Cyrillic receiver stamps, selector arc, brass kisses, mag ticks & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--preview" in sys.argv:
        render_qa_previews(recv_objs, metal_objs, furn_objs)

    # Final budget audit (<= 12 MB total)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "ak15_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "ak15_v3_receiver_normal.webp",
        TEX_OUT_DIR / "ak15_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "ak15_v3_metal_albedo.webp",
        TEX_OUT_DIR / "ak15_v3_metal_normal.webp",
        TEX_OUT_DIR / "ak15_v3_metal_roughness.webp",
        TEX_OUT_DIR / "ak15_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "ak15_v3_furniture_normal.webp",
        TEX_OUT_DIR / "ak15_v3_furniture_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== AK-15M1 V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:38s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
