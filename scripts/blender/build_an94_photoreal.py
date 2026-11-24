#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Nikonov AN-94 "Abakan" (6P33, 5.45x39mm)
========================================================================================
MIT License — Digital Armory 3D (`WP-17` · BAY-23)

Generates:
  - public/models/an94.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY the
    2 dynamic GPU-compressed helical springs `an94_recoil_spring` and `an94_receiver_buffer_spring`)
  - public/textures/an94_v3_receiver_stock_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/an94_v3_pulley_metal_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/an94_v3_barrel_mag_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `src/weapons/an94/plugin.ts`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/an94/meshes/an94Geometries.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_an94_photoreal.py
"""

from __future__ import annotations

import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# =============================================================================
# MODE 2: System Python Post-Process (Izhmash Cyrillic Decals, Selector Icons,
#         Plum Magazine Stampings, RNM Normal Blending & 5-Ch ORM WebPs)
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
    FONT_CYR = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
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
        arr = np.load(path).astype(np.float32)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, axis=-1)
        return arr[..., :3].copy()

    def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
        x = np.clip(x, 0.0, 1.0)
        return np.where(
            x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055
        ).astype(np.float32)

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
        ny = dy * strength  # row increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.6) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _draw_izhmash_arrow_triangle(draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, width: int = 5):
        """Classic Izhmash arsenal arrow-in-triangle emblem."""
        p_top = (cx, cy - rad)
        p_bl = (cx - int(rad * 0.92), cy + int(rad * 0.78))
        p_br = (cx + int(rad * 0.92), cy + int(rad * 0.78))
        draw.polygon([p_top, p_bl, p_br], outline=255, width=width)
        draw.line([(cx, cy - int(rad * 0.60)), (cx, cy + int(rad * 0.58))], fill=255, width=max(3, width - 1))
        draw.polygon(
            [
                (cx, cy - int(rad * 0.72)),
                (cx - int(rad * 0.24), cy - int(rad * 0.24)),
                (cx + int(rad * 0.24), cy - int(rad * 0.24)),
            ],
            fill=255,
        )
        for dy in (0.18, 0.36):
            yy = cy + int(rad * dy)
            draw.line([(cx, yy), (cx - int(rad * 0.24), yy + int(rad * 0.16))], fill=255, width=max(2, width - 2))
            draw.line([(cx, yy), (cx + int(rad * 0.24), yy + int(rad * 0.16))], fill=255, width=max(2, width - 2))

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

    def _save_suite(prefix_out: str, albedo: np.ndarray, nrm: np.ndarray, ao: np.ndarray, rgh: np.ndarray, met: np.ndarray):
        rgh = np.clip(rgh, 0.10, 0.94)
        met = np.clip(met, 0.00, 0.98)
        ao = np.clip(ao, 0.26, 1.00)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB").save(
            out_dir / f"{prefix_out}_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB").save(
            out_dir / f"{prefix_out}_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB").save(
            out_dir / f"{prefix_out}_roughness.webp", "WEBP", quality=94, method=6
        )
        print(f"[POST] Saved {prefix_out}_{{albedo,normal,roughness}}.webp (2048x2048 RGB)")

    # -------------------------------------------------------------------------
    # SUITE 1: an94_v3_receiver_stock (Outer Housing, Dust Cover, Stock, Grip, Sights, Controls)
    # -------------------------------------------------------------------------
    def process_receiver_stock():
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
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Dedicated Hero UV bands on `an94_outer_housing` left/right flanks:
        # World X ∈ [-16.2, +5.8] (span 22.0 cm), Y ∈ [-1.50, +2.50] (span 4.00 cm)
        #   Left  Hero Flank (-Z): u ∈ [0.015, 0.985] (1 - xNorm: +X front -> u=0.015), v ∈ [0.745, 0.985]
        #   Right Hero Flank (+Z): u ∈ [0.015, 0.985] (xNorm:     -X rear  -> u=0.015), v ∈ [0.490, 0.730]
        PPCM = 180.0
        X0, XSPAN = -16.2, 22.0
        Y0, YSPAN = -1.50, 4.00
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3960 x 720

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        white_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        brass_m = np.zeros((h, w), dtype=np.float32)

        # --- LEFT FLANK (-Z): Izhmash Emblem + Cyrillic АН-94 «АБАКАН» + Selector ОД / 2 / АВ + Safety ПР / ОГ ---
        w_left = Image.new("L", (CW, CH), 0)
        r_left = Image.new("L", (CW, CH), 0)
        dwl, drl = ImageDraw.Draw(w_left), ImageDraw.Draw(r_left)

        # Main hero nomenclature clearly ahead of left dovetail rail (X ∈ [-1.8 .. +5.2], Y ∈ [+0.20 .. +2.05])
        # On left flank (+X is LEFT): xw_to_cx_left(+5.0) is left edge!
        lx0 = xw_to_cx_left(5.15)
        ly0 = yw_to_cy(1.88)
        _draw_izhmash_arrow_triangle(dwl, lx0 + 62, ly0 + 68, 56, width=6)
        dwl.text((lx0 + 148, ly0 + 2), "АН-94  «АБАКАН»", fill=255, font=_load_font(FONT_CYR, 74))
        dwl.text((lx0 + 148, ly0 + 96), "5,45×39 · ИЖМАШ · № 940218", fill=248, font=_load_font(FONT_CYR, 48))
        _draw_gis_proof(dwl, lx0 + 1065, ly0 + 52, 38, width=4)
        dwl.text((lx0 + 1132, ly0 + 52), "CIP N", fill=236, font=_load_font(FONT_COND, 48), anchor="lm")

        # Vivid White/Crimson 3-position Fire Selector arc around pivot X=-12.2, Y=+0.75 (selector points +X/LEFT on -Z!)
        sel_cx, sel_cy = xw_to_cx_left(-12.2), yw_to_cy(0.75)
        # Note: selector arm reaches forward (+X = left on left flank) by ~2.0 cm = 360 px
        # Place ОД (top), crimson 2 (middle — hyperburst!), crimson АВ (bottom) cleanly ahead of selector tip!
        dwl.text((sel_cx - 425, sel_cy - 115), "ОД", fill=255, font=_load_font(FONT_CYR, 58), anchor="mm")
        drl.rounded_rectangle((sel_cx - 472, sel_cy - 40, sel_cx - 380, sel_cy + 40), radius=10, outline=255, width=6)
        drl.text((sel_cx - 426, sel_cy + 1), "2", fill=255, font=_load_font(FONT_CYR, 62), anchor="mm")
        drl.text((sel_cx - 425, sel_cy + 115), "АВ", fill=255, font=_load_font(FONT_CYR, 58), anchor="mm")
        for dy_dot, is_red in ((-115, False), (0, True), (115, True)):
            d = drl if is_red else dwl
            d.ellipse((sel_cx - 355, sel_cy + dy_dot - 12, sel_cx - 331, sel_cy + dy_dot + 12), fill=255)

        # Dedicated lower Safety markings around X=-5.8, Y=-0.95 (above trigger guard)
        saf_cx, saf_cy = xw_to_cx_left(-5.8), yw_to_cy(-0.95)
        dwl.text((saf_cx + 165, saf_cy - 55), "ПР", fill=255, font=_load_font(FONT_CYR, 52), anchor="mm")
        drl.text((saf_cx - 175, saf_cy - 55), "ОГ", fill=255, font=_load_font(FONT_CYR, 52), anchor="mm")

        _paste_uv_band(white_m, w_left, 0.015, 0.985, 0.745, 0.985)
        _paste_uv_band(red_m, r_left, 0.015, 0.985, 0.745, 0.985)

        # --- RIGHT FLANK (+Z): 6П33 · 1997 · СДЕЛАНО В РОССИИ + Brass Shell-Kiss Scuffs ---
        w_right = Image.new("L", (CW, CH), 0)
        k_right = Image.new("L", (CW, CH), 0)
        dwr, dkr = ImageDraw.Draw(w_right), ImageDraw.Draw(k_right)

        rx0 = xw_to_cx_right(-13.8)
        ry0 = yw_to_cy(1.78)
        dwr.text((rx0, ry0), "6П33 · АН-94 · 1997", fill=252, font=_load_font(FONT_CYR, 64))
        dwr.text((rx0, ry0 + 84), "ИЖМАШ · СДЕЛАНО В РОССИИ", fill=242, font=_load_font(FONT_CYR, 44))

        # Subtle brass/lacquered-steel shell kisses aft of right ejection port (X ∈ [-2.4, +3.2], Y ∈ [+1.45, +2.32])
        rng_k = np.random.default_rng(54594)
        for _ in range(28):
            kx = float(xw_to_cx_right(float(rng_k.uniform(-2.2, 3.0))))
            ky = float(yw_to_cy(float(rng_k.uniform(1.48, 2.30))))
            krx, kry = float(rng_k.uniform(7, 20)), float(rng_k.uniform(3, 9))
            dkr.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(75, 195)))

        _paste_uv_band(white_m, w_right, 0.015, 0.985, 0.490, 0.730)
        _paste_uv_band(brass_m, k_right, 0.015, 0.985, 0.490, 0.730)
        brass_m = ndimage.gaussian_filter(brass_m, sigma=1.2)

        # Apply crisp recessed white & crimson markings + subtle brass scuffs
        _mix(albedo, (0.91, 0.92, 0.94), white_m * 0.95)
        _mix(rgh, 0.42, white_m * 0.88)
        _mix(met, 0.02, white_m * 0.95)

        _mix(albedo, (0.86, 0.14, 0.14), red_m * 0.96)
        _mix(rgh, 0.36, red_m * 0.90)
        _mix(met, 0.02, red_m * 0.96)

        _mix(albedo, (0.64, 0.52, 0.26), brass_m * 0.36)
        _mix(rgh, 0.28, brass_m * 0.40)
        _mix(met, 0.65, brass_m * 0.40)

        decal_h = -0.52 * _bevel_mask(np.maximum(white_m, red_m), width_px=1.3)
        ao *= 1.0 - 0.14 * np.maximum(white_m, red_m)

        # Field-handling micro-wear scratches on polymer/enamel flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.745) & (v_grid <= 0.985)) | ((v_grid >= 0.490) & (v_grid <= 0.730))
        )).astype(np.float32)
        rng_s = np.random.default_rng(9402)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(135):
            sx = float(rng_s.uniform(0.02, 0.98) * w)
            sy = float(rng_s.uniform(0.02, 0.50) * h)
            ln = float(rng_s.uniform(14, 66))
            ang = math.radians(float(rng_s.uniform(-18, 12)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * ln, sy + math.sin(ang) * ln)],
                     fill=int(rng_s.integers(60, 175)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls
        _mix(albedo, (0.34, 0.36, 0.40), sc * 0.28)
        rgh -= sc * 0.08
        decal_h -= sc * 0.045

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(decal_h, strength=2.6))
        _save_suite("an94_v3_receiver_stock", albedo, nrm_final, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 2: an94_v3_pulley_metal (Floating Inner Receiver, Pulley, Cable, Rammer, BCG, FCG)
    # -------------------------------------------------------------------------
    def process_pulley_metal():
        alb_lin = _read_f32_rgb(tmp_dir / "pulley_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "pulley_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "pulley_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "pulley_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "pulley_ao_self.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao_self, 0.0, 1.0), 0.82), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Subtle longitudinal CNC brushing & reciprocating oil-film streaks across internal steel mechanisms
        rng = np.random.default_rng(1800)
        brush = rng.normal(0.0, 1.0, (h // 4, w // 16)).astype(np.float32)
        brush = ndimage.zoom(brush, (4.0, 16.0), order=1)
        brush = ndimage.gaussian_filter(brush, sigma=(0.8, 3.5))
        rgh = np.clip(rgh + brush * 0.022, 0.12, 0.88)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(brush * 0.14, strength=1.5))

        _save_suite("an94_v3_pulley_metal", albedo, nrm_final, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 3: an94_v3_barrel_mag (405mm Barrel, Gas Tube, Figure-8 Brake & 15° Plum Mag + Firewalled Follower)
    # -------------------------------------------------------------------------
    def process_barrel_mag():
        alb_lin = _read_f32_rgb(tmp_dir / "bmag_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "bmag_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "bmag_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "bmag_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "bmag_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "bmag_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "bmag_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Polar-Arc Hero UV bands on `an94_mag_body` (Right flank u∈[0.640,0.805], Left flank u∈[0.820,0.985], v∈[0.015,0.985])
        mw, mh = 540, 1880
        mag_emboss = np.zeros((h, w), dtype=np.float32)
        mag_white = np.zeros((h, w), dtype=np.float32)

        for is_right, u0, u1 in ((True, 0.640, 0.805), (False, 0.820, 0.985)):
            c_emb = Image.new("L", (mw, mh), 0)
            c_wh = Image.new("L", (mw, mh), 0)
            de, dw = ImageDraw.Draw(c_emb), ImageDraw.Draw(c_wh)

            # Vertical polymer molding grip ribs along front & rear spines
            for rx in (48, 86, mw - 86, mw - 48):
                de.rounded_rectangle((rx - 9, 170, rx + 9, mh - 140), radius=6, fill=220)

            # Horizontal stiffening bars near bottom floorplate lip
            for ry in (mh - 260, mh - 195):
                de.rounded_rectangle((36, ry - 11, mw - 36, ry + 11), radius=6, fill=215)

            # Authentic Izhmash 5.45×39mm plum polymer stampings (zero tofu!)
            if is_right:
                _draw_izhmash_arrow_triangle(de, mw // 2, mh - 415, 62, width=7)
                _draw_izhmash_arrow_triangle(dw, mw // 2, mh - 415, 62, width=6)
                dw.text((mw // 2, mh - 540), "5,45×39", fill=240, font=_load_font(FONT_CYR, 56), anchor="mm")
                de.text((mw // 2, mh - 540), "5,45×39", fill=255, font=_load_font(FONT_CYR, 56), anchor="mm")
                de.ellipse((mw // 2 - 22, mh - 310, mw // 2 + 22, mh - 266), fill=255)
                dw.text((mw // 2, mh - 225), "30", fill=245, font=_load_font(FONT_CYR, 52), anchor="mm")
            else:
                dw.text((mw // 2, 540), "ИЖМАШ", fill=238, font=_load_font(FONT_CYR, 54), anchor="mm")
                de.text((mw // 2, 540), "ИЖМАШ", fill=255, font=_load_font(FONT_CYR, 54), anchor="mm")
                dw.text((mw // 2, 635), "АН-94 · 5,45", fill=232, font=_load_font(FONT_CYR, 44), anchor="mm")
                de.text((mw // 2, 635), "АН-94 · 5,45", fill=245, font=_load_font(FONT_CYR, 44), anchor="mm")
                _draw_izhmash_arrow_triangle(de, mw // 2, mh - 415, 62, width=7)
                _draw_izhmash_arrow_triangle(dw, mw // 2, mh - 415, 62, width=6)

            _paste_uv_band(mag_emboss, c_emb, u0, u1, 0.015, 0.985)
            _paste_uv_band(mag_white, c_wh, u0, u1, 0.015, 0.985)

        # Embossed plum ribs slightly lighter sheen; white molded stencil subtle chalky contrast
        _mix(albedo, (0.265, 0.215, 0.242), mag_emboss * 0.30)
        _mix(albedo, (0.84, 0.84, 0.86), mag_white * 0.62)
        _mix(rgh, 0.48, mag_emboss * 0.35)
        decal_h = 0.42 * _bevel_mask(mag_emboss, width_px=1.6)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(decal_h, strength=2.4))

        _save_suite("an94_v3_barrel_mag", albedo, nrm_final, ao, rgh, met)

    process_receiver_stock()
    process_pulley_metal()
    process_barrel_mag()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles Metal GPU Baking + Draco GLB
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "an94.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact AN-94 CAD Constants (100% locked with src/weapons/an94/meshes/an94Geometries.ts)
AN94_BORE_Y = 1.65
AN94_GAS_Y = 3.55
AN94_MAG_CANT_RX = -math.radians(15.0)
AN94_COS_CANT = math.cos(AN94_MAG_CANT_RX)
AN94_SIN_CANT = math.sin(AN94_MAG_CANT_RX)

AN94_MAG_ORIGIN = (7.6, -0.35, 0.0)
AN94_MAG_ARC_CX = 20.5
AN94_MAG_ARC_CY = 0.0
AN94_MAG_R_IN = 17.25
AN94_MAG_R_OUT = 23.75
AN94_MAG_R_MID = 20.5
AN94_MAG_ANG_START = -0.04
AN94_MAG_ANG_END = 0.92
AN94_MAG_FOLLOWER_ANG = 0.795


def mag_arc_local(ang: float, radius: float = AN94_MAG_R_MID) -> tuple[float, float]:
    return (
        AN94_MAG_ARC_CX - math.cos(ang) * radius,
        AN94_MAG_ARC_CY - math.sin(ang) * radius,
    )


def mag_local_to_world(lx: float, ly: float, lz: float = 0.0) -> tuple[float, float, float]:
    ox, oy, oz = AN94_MAG_ORIGIN
    wy = oy + ly * AN94_COS_CANT - lz * AN94_SIN_CANT
    wz = oz + ly * AN94_SIN_CANT + lz * AN94_COS_CANT
    return (round(ox + lx, 4), round(wy, 4), round(wz, 4))


FOLLOWER_WORLD_POS = mag_local_to_world(*mag_arc_local(AN94_MAG_FOLLOWER_ANG))
FLOORPLATE_WORLD_POS = mag_local_to_world(*mag_arc_local(AN94_MAG_ANG_END))

# Exact 24 solid Nikonov AN-94 parts across 3 dedicated 2048x2048 PBR suites
# (skipping ONLY the 2 dynamic aSpringParam springs `an94_recoil_spring`, `an94_receiver_buffer_spring`!)
RECEIVER_STOCK_PARTS = [
    "an94_outer_housing",
    "an94_dust_cover",
    "an94_buttstock",
    "an94_pistol_grip",
    "an94_rear_sight",
    "an94_safety_switch",
    "an94_fire_selector",
]

PULLEY_METAL_PARTS = [
    "an94_inner_receiver",
    "an94_pulley_wheel",
    "an94_steel_cable",
    "an94_feed_rammer",
    "an94_bolt_carrier",
    "an94_bolt",
    "an94_firing_pin",
    "an94_hammer",
    "an94_trigger",
    "an94_recoil_guide",
]

BARREL_MAG_PARTS = [
    "an94_barrel",
    "an94_gas_tube",
    "an94_muzzle_brake",
    "an94_mag_body",
    "an94_mag_follower",
    "an94_mag_spring",
    "an94_mag_floorplate",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "an94_outer_housing",
    "an94_dust_cover",
    "an94_buttstock",
    "an94_pistol_grip",
    "an94_rear_sight",
    "an94_safety_switch",
    "an94_fire_selector",
    "an94_barrel",
    "an94_gas_tube",
    "an94_muzzle_brake",
    "an94_mag_body",
    "an94_mag_floorplate",
    "an94_trigger",
}

ASSEMBLED_POS = {
    "an94_inner_receiver": (0.0, 0.0, 0.0),
    "an94_bolt_carrier":   (1.5, AN94_BORE_Y, 0.0),
    "an94_bolt":           (5.4, AN94_BORE_Y, 0.0),
    "an94_firing_pin":     (5.1, AN94_BORE_Y, 0.0),
    "an94_pulley_wheel":   (-9.2, 0.55, 0.62),
    "an94_steel_cable":    (-9.2, 0.55, 0.62),
    "an94_feed_rammer":    (4.8, 0.35, 0.45),
    "an94_recoil_guide":   (-6.5, 2.35, 0.0),
    "an94_outer_housing":  (0.0, 0.0, 0.0),
    "an94_dust_cover":     (0.0, 0.0, 0.0),
    "an94_barrel":         (5.2, AN94_BORE_Y, 0.0),
    "an94_gas_tube":       (21.5, AN94_GAS_Y, 0.0),
    "an94_muzzle_brake":   (45.7, AN94_BORE_Y, 0.0),
    "an94_buttstock":      (-16.8, 1.05, 0.0),
    "an94_pistol_grip":    (-8.2, -1.35, 0.0),
    "an94_rear_sight":     (-13.6, 4.10, 0.0),
    "an94_hammer":         (-2.8, 0.25, 0.0),
    "an94_trigger":        (-2.4, -1.75, 0.0),
    "an94_safety_switch":  (-5.8, -0.95, 0.0),
    "an94_fire_selector":  (-12.2, 0.75, 0.0),
    "an94_mag_body":       AN94_MAG_ORIGIN,
    "an94_mag_follower":   FOLLOWER_WORLD_POS,
    "an94_mag_spring":     AN94_MAG_ORIGIN,
    "an94_mag_floorplate": FLOORPLATE_WORLD_POS,
}

ASSEMBLED_ROT_THREE = {
    "an94_mag_body":       (AN94_MAG_CANT_RX, 0.0, 0.0),
    "an94_mag_follower":   (AN94_MAG_CANT_RX, 0.0, 0.0),
    "an94_mag_spring":     (AN94_MAG_CANT_RX, 0.0, 0.0),
    "an94_mag_floorplate": (AN94_MAG_CANT_RX, 0.0, 0.0),
}

# Ground-truth CSG reference bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "an94_inner_receiver": ((-13.200, -1.260, -1.475), (11.200, 3.100, 1.475)),
    "an94_bolt_carrier":   (( -4.500, -0.645, -0.860), (19.675, 2.540, 3.383)),
    "an94_bolt":           (( -2.200, -0.560, -0.810), ( 2.600, 0.900, 0.810)),
    "an94_firing_pin":     (( -2.425, -0.260, -0.256), ( 2.545, 0.260, 0.256)),
    "an94_pulley_wheel":   (( -1.060, -1.060, -0.340), ( 1.060, 1.060, 0.340)),
    "an94_steel_cable":    (( -0.950, -1.060, -0.220), (13.225, 1.060, 0.220)),
    "an94_feed_rammer":    (( -2.400, -0.890, -0.875), ( 3.700, 0.945, 0.480)),
    "an94_recoil_guide":   (( -6.500, -0.775, -0.625), ( 6.600, 0.575, 0.625)),
    "an94_outer_housing":  ((-16.800, -4.552, -2.200), (29.000, 3.650, 2.717)),
    "an94_dust_cover":     ((-16.250,  2.200, -1.900), ( 5.850, 4.170, 1.900)),
    "an94_barrel":         ((  0.000, -1.245, -0.925), (40.500, 2.150, 0.925)),
    "an94_gas_tube":       ((-10.500, -0.840, -0.840), (10.425, 3.310, 0.840)),
    "an94_muzzle_brake":   ((  0.000, -1.440, -0.960), ( 5.595, 1.540, 0.960)),
    "an94_buttstock":      ((-26.205, -6.001, -1.700), ( 0.220, 1.891, 2.070)),
    "an94_pistol_grip":    (( -4.562,-10.075, -1.375), ( 2.100,-0.200, 1.375)),
    "an94_rear_sight":     (( -1.600, -0.175, -1.225), ( 1.600, 2.320, 1.225)),
    "an94_hammer":         (( -1.775, -0.490, -0.825), ( 0.791, 1.690, 0.825)),
    "an94_trigger":        (( -3.050, -2.288, -0.725), ( 0.591, 0.875, 0.725)),
    "an94_safety_switch":  (( -1.095, -0.256, -2.340), ( 0.260, 0.370, 2.260)),
    "an94_fire_selector":  (( -0.320, -0.430, -2.360), ( 1.955, 0.505, 1.925)),
    "an94_mag_body":       (( -3.681,-18.896, -1.350), (10.050, 0.950, 1.350)),
    "an94_mag_follower":   (( -2.144, -2.492, -0.940), ( 2.472, 2.169, 0.940)),
    "an94_mag_spring":     ((  5.093,-17.938, -0.874), ( 9.188,-13.524, 0.875)),
    "an94_mag_floorplate": (( -2.097, -3.008, -1.430), ( 2.448, 2.742, 1.430)),
}


# =============================================================================
# Scene & Physically Calibrated AgX-Safe Material Library (Cycles Metal GPU)
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
    bevel_r: float = 0.032,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.78, 0.81, 0.85),
    grain_scale: float = 38.0,
    grain_bump: float = 0.030,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
    rough_var: float = 0.045,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])

    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 2.60
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.55
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

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

    base_col_a = srgb_to_lin(*base_srgb)
    base_col_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.07),
        min(1.0, base_srgb[1] * 1.07),
        min(1.0, base_srgb[2] * 1.07),
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

    if edge_wear > 0.001:
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.085

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.30
        ramp.color_ramp.elements[0].color = (edge_wear, edge_wear, edge_wear, 1.0)
        ramp.color_ramp.elements[1].position = 0.78
        ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1.0)
        nt.links.new(ao_edge.outputs["AO"], ramp.inputs["Fac"])

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
        mix_edge_r.inputs[3].default_value = max(0.14, roughness - 0.14)
        nt.links.new(mul_w.outputs["Value"], mix_edge_r.inputs[0])
        nt.links.new(rgh_sock, mix_edge_r.inputs[2])
        rgh_sock = mix_edge_r.outputs[0]

        if metallic > 0.35:
            mix_edge_m = nt.nodes.new("ShaderNodeMix")
            mix_edge_m.data_type = "FLOAT"
            mix_edge_m.inputs[3].default_value = 0.96
            nt.links.new(mul_w.outputs["Value"], mix_edge_m.inputs[0])
            nt.links.new(met_sock, mix_edge_m.inputs[2])
            met_sock = mix_edge_m.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

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


def _build_an94_figure8_brake_mat() -> bpy.types.Material:
    """Nikonov Asymmetrical Figure-8 Twin-Chamber Whistling Muzzle Brake:
    Russian parkerized/blued ordnance steel -> golden-bronze/steel-blue 1,800 RPM firing heat temper
    -> realistic matte gunpowder carbon soot near front vortex baffle mouths."""
    mat = bpy.data.materials.new("BM_Figure8BrakeHeat")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Local brake X spans [0.0 .. 5.6]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 0.40
    mr_x.inputs["From Max"].default_value = 5.55
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 4.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.22
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.225, 0.238, 0.256)
    cr.elements[1].position = 0.36
    cr.elements[1].color = srgb_to_lin(0.260, 0.268, 0.282)
    for pos, rgb in (
        (0.58, (0.42, 0.31, 0.20)),    # warm bronze-straw heat temper from 1,800 RPM bursts
        (0.78, (0.21, 0.25, 0.35)),    # iridescent steel-blue high-temp band
        (0.96, (0.145, 0.145, 0.152)), # realistic carbon vortex soot (kept >= AgX readable floor)
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.52
    rr.elements[0].color = (0.25, 0.25, 0.25, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.82, 0.82, 0.82, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.78
    rm.elements[0].color = (0.92, 0.92, 0.92, 1.0)
    rm.elements[1].position = 0.97
    rm.elements[1].color = (0.22, 0.22, 0.22, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.042
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Suite 1: Receiver & Stock (AgX-safe charcoal polyamide >= 0.17, Russian enamel steel >= 0.21) ---
        "RS_IzhmashPolyamide": _build_pbr_mat(
            "RS_IzhmashPolyamide",
            base_srgb=(0.204, 0.214, 0.230),
            roughness=0.52,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.26,
            edge_srgb=(0.33, 0.35, 0.38),
            grain_scale=62.0,
            grain_bump=0.088,
            voronoi_grain=0.66,
            voronoi_scale=88.0,
            rough_var=0.044,
        ),
        "RS_PolyamideGrip": _build_pbr_mat(
            "RS_PolyamideGrip",
            base_srgb=(0.186, 0.195, 0.210),
            roughness=0.60,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.20,
            edge_srgb=(0.30, 0.32, 0.35),
            grain_scale=82.0,
            grain_bump=0.145,
            voronoi_grain=0.80,
            voronoi_scale=124.0,
            rough_var=0.045,
        ),
        "RS_RubberButtpad": _build_pbr_mat(
            "RS_RubberButtpad",
            base_srgb=(0.172, 0.178, 0.188),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.12,
            edge_srgb=(0.24, 0.25, 0.27),
            grain_scale=66.0,
            grain_bump=0.110,
            voronoi_grain=0.70,
            voronoi_scale=92.0,
            rough_var=0.036,
        ),
        "RS_EnamelSteel": _build_pbr_mat(
            "RS_EnamelSteel",
            base_srgb=(0.218, 0.230, 0.248),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.030,
            edge_wear=0.52,
            edge_srgb=(0.82, 0.85, 0.89),
            grain_scale=46.0,
            grain_bump=0.028,
            voronoi_grain=0.35,
            voronoi_scale=72.0,
            rough_var=0.036,
        ),
        "RS_SightSteel": _build_pbr_mat(
            "RS_SightSteel",
            base_srgb=(0.232, 0.244, 0.262),
            roughness=0.25,
            metallic=0.91,
            bevel_r=0.024,
            edge_wear=0.58,
            edge_srgb=(0.86, 0.89, 0.92),
            grain_scale=42.0,
            grain_bump=0.024,
            rough_var=0.032,
        ),
        "RS_BrightAxle": _build_pbr_mat(
            "RS_BrightAxle",
            base_srgb=(0.80, 0.83, 0.87),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.015,
            rough_var=0.020,
        ),
        "RS_CrimsonDot": _build_pbr_mat(
            "RS_CrimsonDot",
            base_srgb=(0.86, 0.14, 0.14),
            roughness=0.34,
            metallic=0.00,
            bevel_r=0.010,
            grain_scale=24.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),

        # --- Suite 2: Pulley-Cable Floating Action Metal (an94_v3_pulley_metal) ---
        "PM_InnerSteel": _build_pbr_mat(
            "PM_InnerSteel",
            base_srgb=(0.228, 0.240, 0.258),
            roughness=0.29,
            metallic=0.90,
            bevel_r=0.028,
            edge_wear=0.56,
            edge_srgb=(0.84, 0.87, 0.90),
            grain_scale=36.0,
            grain_bump=0.026,
            aniso_stretch=(0.35, 3.2, 3.2),
            rough_var=0.036,
        ),
        "PM_OiledCarrier": _build_pbr_mat(
            "PM_OiledCarrier",
            base_srgb=(0.218, 0.230, 0.248),
            roughness=0.24,
            metallic=0.92,
            bevel_r=0.026,
            edge_wear=0.60,
            edge_srgb=(0.86, 0.89, 0.93),
            grain_scale=32.0,
            grain_bump=0.024,
            aniso_stretch=(0.30, 3.5, 3.5),
            rough_var=0.032,
        ),
        "PM_BrightStainless": _build_pbr_mat(
            "PM_BrightStainless",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.16,
            metallic=0.97,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.94, 0.96, 0.98),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.022,
        ),
        "PM_BraidedCable": _build_pbr_mat(
            "PM_BraidedCable",
            base_srgb=(0.85, 0.88, 0.92),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.010,
            grain_scale=88.0,
            grain_bump=0.095,
            aniso_stretch=(3.5, 0.6, 0.6),
            rough_var=0.028,
        ),
        "PM_BronzeRammer": _build_pbr_mat(
            "PM_BronzeRammer",
            base_srgb=(0.79, 0.54, 0.25),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.93, 0.72, 0.40),
            grain_scale=34.0,
            grain_bump=0.022,
            aniso_stretch=(0.40, 3.0, 3.0),
            rough_var=0.028,
        ),
        "PM_BrassFerrule": _build_pbr_mat(
            "PM_BrassFerrule",
            base_srgb=(0.86, 0.68, 0.28),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "PM_BufferPoly": _build_pbr_mat(
            "PM_BufferPoly",
            base_srgb=(0.185, 0.195, 0.210),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.024,
            grain_scale=54.0,
            grain_bump=0.075,
            rough_var=0.036,
        ),

        # --- Suite 3: 405mm Barrel, Gas Tube, Figure-8 Brake & 15° Plum Mag (an94_v3_barrel_mag) ---
        "BM_BarrelSteel": _build_pbr_mat(
            "BM_BarrelSteel",
            base_srgb=(0.218, 0.232, 0.250),
            roughness=0.26,
            metallic=0.91,
            bevel_r=0.026,
            edge_wear=0.50,
            edge_srgb=(0.82, 0.85, 0.89),
            grain_scale=40.0,
            grain_bump=0.024,
            aniso_stretch=(0.25, 4.0, 4.0),
            rough_var=0.032,
        ),
        "BM_Figure8BrakeHeat": _build_an94_figure8_brake_mat(),
        "BM_SightTritiumWhite": _build_pbr_mat(
            "BM_SightTritiumWhite",
            base_srgb=(0.93, 0.95, 0.97),
            roughness=0.28,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=20.0,
            grain_bump=0.008,
            rough_var=0.018,
        ),
        "BM_PlumMagPolymer": _build_pbr_mat(
            "BM_PlumMagPolymer",
            base_srgb=(0.252, 0.178, 0.216),  # Authentic Izhmash Russian "Sliva" Plum-Violet glass-filled polyamide
            roughness=0.47,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.26,
            edge_srgb=(0.39, 0.30, 0.35),
            grain_scale=64.0,
            grain_bump=0.088,
            voronoi_grain=0.64,
            voronoi_scale=92.0,
            rough_var=0.044,
        ),
        "BM_MagSteel": _build_pbr_mat(
            "BM_MagSteel",
            base_srgb=(0.216, 0.228, 0.246),
            roughness=0.28,
            metallic=0.89,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.82, 0.85, 0.89),
            grain_scale=44.0,
            grain_bump=0.026,
            rough_var=0.034,
        ),
        "BM_SpringSteel": _build_pbr_mat(
            "BM_SpringSteel",
            base_srgb=(0.62, 0.65, 0.70),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.010,
            grain_scale=28.0,
            grain_bump=0.018,
            rough_var=0.024,
        ),
        "BM_FollowerOrange": _build_pbr_mat(
            "BM_FollowerOrange",
            base_srgb=(0.90, 0.36, 0.08),
            roughness=0.38,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.16,
            edge_srgb=(0.96, 0.56, 0.26),
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.036,
        ),
    }


# =============================================================================
# Core Three.js-Space Watertight BMesh Hard-Surface Modeling Toolkit
# =============================================================================
def _apply_three_xform(bm: bmesh.types.BMesh, ops: list[tuple]):
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
            m = Matrix.Diagonal((op[1], op[2], op[3], 1.0)) @ m
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


def mk_box(
    name: str, sx: float, sy: float, sz: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0, bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str, r_top: float, r_bot: float, length: float,
    axis: str = "x", segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=2,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
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
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_x(
    name: str, pts_zy: list[tuple[float, float]], x0: float, x1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
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
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_rings(
    name: str,
    rings_three: list[list[tuple[float, float, float]]],
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    bm = bmesh.new()
    bm_rings = [[bm.verts.new(p) for p in ring] for ring in rings_three]
    n_pts = len(bm_rings[0])
    for i in range(len(bm_rings) - 1):
        a, b = bm_rings[i], bm_rings[i + 1]
        for k in range(n_pts):
            kn = (k + 1) % n_pts
            bm.faces.new((a[k], a[kn], b[kn], b[k]))
    if cap_ends:
        bm.faces.new(list(reversed(bm_rings[0])))
        bm.faces.new(bm_rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts_three):
        if i == 0:
            tang = (pts_three[1] - pts_three[0]).normalized()
        elif i == len(pts_three) - 1:
            tang = (pts_three[-1] - pts_three[-2]).normalized()
        else:
            tang = (pts_three[i + 1] - pts_three[i - 1]).normalized()
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
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * radius
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
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
    assert len(objs) > 0, f"join_objects({name}): empty"
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
    if not cutters:
        return target
    for c in cutters:
        for m in c.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)

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
            old_m = target.data
            target.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not success:
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


def bool_union(target: bpy.types.Object, additions: list[bpy.types.Object], solver: str = "EXACT") -> bpy.types.Object:
    if not additions:
        return target
    for a in additions:
        for m in a.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)

    for idx, add in enumerate(additions):
        backup_mesh = target.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        success = False
        for slv in tried:
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolU_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = slv
            mod.object = add
            if slv == "EXACT":
                mod.use_self = True
                mod.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if _count_non_manifold(target) == 0 and len(target.data.polygons) > 0:
                success = True
                break
            old_m = target.data
            target.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not success:
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolUF_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = add
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)

    delete_objs(additions)
    return target


def _smoothstep_f(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def sample_quad_bezier(p0, p1, p2, segs: int = 10) -> list[tuple[float, float]]:
    pts = []
    for i in range(segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


def sample_cubic_bezier(p0, p1, p2, p3, segs: int = 12) -> list[tuple[float, float]]:
    pts = []
    for i in range(segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def _superellipse_ring_zy(y_bot: float, y_top: float, hz_bot: float, hz_top: float, p_bot: float, p_top: float, n_ring: int = 28) -> list[tuple[float, float]]:
    yc = 0.5 * (y_bot + y_top)
    hy = max(0.02, 0.5 * (y_top - y_bot))
    pts = []
    for k in range(n_ring):
        th = math.tau * k / n_ring
        ct, st = math.cos(th), math.sin(th)
        hz = hz_top if st >= 0.0 else hz_bot
        pw = p_top if st >= 0.0 else p_bot
        inv_p = 2.0 / max(pw, 1.2)
        z = math.copysign(abs(ct) ** inv_p, ct) * hz
        y = yc + math.copysign(abs(st) ** inv_p, st) * hy
        pts.append((z, y))
    return pts


def mk_loft_x(
    name: str,
    stations: list[tuple[float, float, float, float, float, float, float]],
    n_ring: int = 28,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Organic superellipse loft along X: station = (x, y_bot, y_top, hz_bot, hz_top, p_bot, p_top)."""
    rings = []
    for x, yb, yt, hzb, hzt, pb, pt in stations:
        zy = _superellipse_ring_zy(yb, yt, hzb, hzt, pb, pt, n_ring=n_ring)
        rings.append([(x, y, z) for z, y in zy])
    return mk_loft_rings(name, rings, mat=mat, cap_ends=cap_ends)


def mk_loft_y(
    name: str,
    stations: list[tuple[float, float, float, float, float, float]],
    n_ring: int = 28,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Organic superellipse loft along Y: station = (y, x_back, x_front, hz, p_back, p_front)."""
    rings = []
    for y, xb, xf, hz, pb, pf in stations:
        xc = 0.5 * (xb + xf)
        hx = max(0.02, 0.5 * (xf - xb))
        ring = []
        for k in range(n_ring):
            th = math.tau * k / n_ring
            ct, st = math.cos(th), math.sin(th)
            pw = pf if ct >= 0.0 else pb
            inv_p = 2.0 / max(pw, 1.2)
            x = xc + math.copysign(abs(ct) ** inv_p, ct) * hx
            z = math.copysign(abs(st) ** inv_p, st) * hz
            ring.append((x, y, z))
        rings.append(ring)
    return mk_loft_rings(name, rings, mat=mat, cap_ends=cap_ends)


def mk_swept_bow(
    name: str,
    center_pts_xy: list[tuple[float, float]],
    thickness: float,
    half_z: float,
    bevel: float = 0.05,
    bevel_segs: int = 2,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Swept smooth curved ribbon (trigger guard / trigger shoe) extruded cleanly in Z."""
    clean = []
    for p in center_pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-4:
            clean.append(p)
    n = len(clean)
    ht = thickness * 0.5
    left_side, right_side = [], []
    for i in range(n):
        if i == 0:
            dx, dy = clean[1][0] - clean[0][0], clean[1][1] - clean[0][1]
        elif i == n - 1:
            dx, dy = clean[-1][0] - clean[-2][0], clean[-1][1] - clean[-2][1]
        else:
            dx, dy = clean[i + 1][0] - clean[i - 1][0], clean[i + 1][1] - clean[i - 1][1]
        ln = max(1e-6, math.hypot(dx, dy))
        nx, ny = -dy / ln, dx / ln
        left_side.append((clean[i][0] + nx * ht, clean[i][1] + ny * ht))
        right_side.append((clean[i][0] - nx * ht, clean[i][1] - ny * ht))
    poly = left_side + list(reversed(right_side))
    return mk_extrude_z(name, poly, -half_z, half_z, bevel=bevel, bevel_segs=bevel_segs, mat=mat)


def mk_stadium_2d(cx: float, cy: float, length: float, width: float, segs: int = 10) -> list[tuple[float, float]]:
    r = width * 0.5
    hl = max(0.01, length * 0.5 - r)
    pts = []
    for i in range(segs + 1):
        a = -math.pi * 0.5 + math.pi * (i / segs)
        pts.append((cx + hl + r * math.cos(a), cy + r * math.sin(a)))
    for i in range(segs + 1):
        a = math.pi * 0.5 + math.pi * (i / segs)
        pts.append((cx - hl + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def mk_chamfered_stadium_cutter_z(
    name: str,
    cx: float, cy: float,
    z_wall: float, depth: float,
    length: float, width: float,
    chamfer: float = 0.06,
    side_sign: float = 1.0,
    through_both: bool = False,
    segs: int = 10,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Flared stadium Boolean cutter along Z producing crisp chamfered vent/relief slot edges."""
    if through_both:
        z_out = abs(z_wall)
        stations = [
            (-z_out - 0.18, chamfer + 0.08),
            (-z_out + chamfer, 0.0),
            (z_out - chamfer, 0.0),
            (z_out + 0.18, chamfer + 0.08),
        ]
    else:
        s = 1.0 if side_sign >= 0.0 else -1.0
        z_in = z_wall - s * depth
        z_ch = z_wall - s * chamfer
        z_ov = z_wall + s * 0.16
        stations = [(z_in, 0.0), (z_ch, 0.0), (z_ov, chamfer + 0.06)]
        if s < 0.0:
            stations.reverse()
    rings = []
    for z_pos, dr in stations:
        pts2d = mk_stadium_2d(cx, cy, length + 2.0 * dr, width + 2.0 * dr, segs=segs)
        rings.append([(x, y, z_pos) for x, y in pts2d])
    return mk_loft_rings(name, rings, mat=mat, cap_ends=True)


def mk_lathe_x(
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 36,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
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
                th = math.tau * s / segs
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 24, depth: float = 0.022,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.020, length * 0.15, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.7 - bev * 0.9),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.7 - bev * 0.9),
    ]
    rings = []
    for s_idx, (ax_pos, r_base) in enumerate(stations):
        ring = []
        is_end = s_idx in (0, 3)
        for k in range(n_pts):
            th = math.tau * k / n_pts
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


def mk_braided_cable_along_pts(
    name: str,
    pts_three: list[Vector],
    base_radius: float,
    strands: int = 6,
    twist_per_cm: float = 2.6,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Swept helically fluted multi-strand braided steel wire along a 3D centerline."""
    bm = bmesh.new()
    ring_segs = strands * 3
    rings = []
    prev_n = None
    n_pts = len(pts_three)
    arc_len = 0.0
    for i, p in enumerate(pts_three):
        if i > 0:
            arc_len += (pts_three[i] - pts_three[i - 1]).length
        if i == 0:
            tang = (pts_three[1] - pts_three[0]).normalized()
        elif i == n_pts - 1:
            tang = (pts_three[-1] - pts_three[-2]).normalized()
        else:
            tang = (pts_three[i + 1] - pts_three[i - 1]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(tang.z) < 0.85 else Vector((1, 0, 0))
            n_vec = tang.cross(ref).normalized()
        else:
            n_vec = (prev_n - tang * prev_n.dot(tang)).normalized()
        prev_n = n_vec
        b_vec = tang.cross(n_vec).normalized()
        twist = arc_len * twist_per_cm
        ring = []
        for s in range(ring_segs):
            th = math.tau * s / ring_segs
            r = base_radius * (0.90 + 0.14 * abs(math.cos(0.5 * strands * (th + twist))))
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * r
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def finish_part(
    obj: bpy.types.Object,
    bevel_w: float = 0.0,
    bevel_segs: int = 2,
    sharp_deg: float = 34.0,
    weighted_normals: bool = True,
) -> bpy.types.Object:
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
    degen = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degen:
        bmesh.ops.delete(bm, geom=degen, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    if weighted_normals:
        select_only([obj], obj)
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA"
        wn.weight = 50
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


# =============================================================================
# SUITE 1 BUILDERS: RECEIVER & STOCK (7 parts)
# =============================================================================
def build_an94_outer_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: Izhmash Monocoque Charcoal Polyamide Outer Housing, 45° Dovetail Rail,
    Smoothly Swept Curved Trigger-Guard Bow, Sculpted Forend & 15°-Right-Canted Magwell."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_grip = mats["RS_PolyamideGrip"]
    m_stl = mats["RS_EnamelSteel"]

    # Main receiver chassis body: X ∈ [-16.8, +11.6], Y ∈ [-1.6, +2.55], Z ∈ [-1.95, +1.95]
    # Keep outer flanks planar across X ∈ [-16.1, +5.6] for distortion-free Cyrillic Hero UV rollmarks!
    chassis = mk_box("oh_main", 28.4, 4.15, 3.90, [("t", -2.6, 0.475, 0.0)], m_poly, bevel=0.12, bevel_segs=3)

    # Organically contoured Izhmash tapered glass-filled polyamide handguard forend (X ∈ [10.8, 29.0])
    forend_stations = [
        (10.8, -1.30, 3.35, 1.84, 1.80, 3.4, 3.6),
        (12.2, -0.92, 3.60, 1.76, 1.74, 2.8, 3.4),
        (15.5, -0.84, 3.66, 1.75, 1.72, 2.5, 3.2),
        (19.8, -0.86, 3.66, 1.74, 1.70, 2.4, 3.2),
        (24.2, -0.84, 3.62, 1.70, 1.66, 2.5, 3.2),
        (27.8, -0.78, 3.55, 1.64, 1.58, 2.6, 3.4),
        (29.0, -0.68, 3.42, 1.52, 1.46, 3.0, 3.6),
    ]
    forend = mk_loft_x("oh_forend", forend_stations, n_ring=28, mat=m_poly, cap_ends=True)

    # Sculpted front GP-25 / bayonet mounting lug fairing under forend nose
    nose_lug = mk_box("oh_nose", 3.4, 1.48, 1.86, [("t", 27.3, -1.24, 0.0)], m_grip, bevel=0.12, bevel_segs=3)

    # 15°-Right-Canted Magazine Well Collar wrapping magazine throat cleanly
    mag_collar = mk_box(
        "oh_magwell", 7.45, 4.45, 3.62,
        [("t", 0.0, -1.72, 0.0), ("rx", AN94_MAG_CANT_RX), ("t", *AN94_MAG_ORIGIN)],
        m_poly, bevel=0.14, bevel_segs=3,
    )

    # Smoothly swept curved integral polyamide trigger-guard bow (watertight union with chassis & grip boss!)
    tg_curve = (
        [(2.55, -1.15)]
        + sample_cubic_bezier((2.55, -1.45), (2.42, -3.55), (1.75, -4.18), (0.25, -4.18), segs=10)[1:]
        + sample_quad_bezier((0.25, -4.18), (-1.90, -4.22), (-4.05, -4.18), segs=8)[1:]
        + sample_cubic_bezier((-4.05, -4.18), (-5.45, -4.16), (-5.88, -3.35), (-5.92, -1.45), segs=10)[1:]
        + [(-5.92, -1.15)]
    )
    tguard = mk_swept_bow("oh_tguard", tg_curve, thickness=0.46, half_z=0.68, bevel=0.08, bevel_segs=3, mat=m_poly)
    grip_boss = mk_box("oh_gripboss", 4.7, 1.05, 2.86, [("t", -7.8, -1.48, 0.0)], m_poly, bevel=0.12, bevel_segs=2)

    # Watertight bool_union before carving cavities & chamfered vents (prevents internal non-manifold walls!)
    shell_raw = bool_union(chassis, [forend, nose_lug, mag_collar, tguard, grip_boss])

    cutters = [
        # Floating sub-receiver internal bay
        mk_box("c_bay", 27.4, 4.45, 3.04, [("t", -2.1, 1.375, 0.0)], m_poly),
        # Lower buffer spring pocket: Y ∈ [-1.32, -0.55], leaving a solid 2.8 mm bottom floor
        mk_box("c_buf", 17.0, 0.77, 1.24, [("t", -6.5, -0.935, 0.0)], m_poly),
        # Crisp trigger-blade passage slot through receiver floor
        mk_box("c_trig", 1.15, 0.56, 0.64, [("t", -2.35, -1.46, 0.0)], m_poly),
        # Floating barrel & gas-tube front clearance tunnel through handguard
        mk_box("c_tun", 19.8, 3.55, 2.35, [("t", 20.6, 2.35, 0.0)], m_poly),
        # 15°-right-canted magazine throat opening
        mk_box(
            "c_mag", 6.72, 6.6, 2.84,
            [("t", 0.0, -1.6, 0.0), ("rx", AN94_MAG_CANT_RX), ("t", *AN94_MAG_ORIGIN)], m_poly,
        ),
    ]
    # 6 crisp chamfered stadium ventilation slots per side on contoured forend flanks
    for side in (-1.0, 1.0):
        for sx in (14.4, 16.7, 19.0, 21.3, 23.6, 25.9):
            cutters.append(
                mk_chamfered_stadium_cutter_z(
                    f"c_vent_{side:+.0f}_{sx:.1f}",
                    cx=sx, cy=2.28,
                    z_wall=side * 1.71, depth=0.45,
                    length=1.45, width=0.42, chamfer=0.055,
                    side_sign=side, segs=8, mat=m_poly,
                )
            )
    shell = bool_subtract(shell_raw, cutters)

    # Authentic Russian 45° trapezoidal dovetail optics rail ("Ласточкин хвост", X ∈ [-12.2, -2.2])
    dove_zy = [
        (-1.90, 0.28), (-2.12, 0.44), (-2.24, 0.52), (-2.24, 1.28),
        (-2.12, 1.36), (-1.90, 1.52),
    ]
    dovetail = mk_extrude_x("oh_dovetail", dove_zy, -12.2, -2.2, bevel=0.03, mat=m_stl)
    # Contoured steel magazine release paddle behind canted magwell
    magrel_xy = [
        (3.45, -1.52), (4.12, -1.52), (4.22, -2.65), (3.85, -3.28), (3.42, -3.12), (3.62, -2.42),
    ]
    magrel = mk_extrude_z("oh_magrel", magrel_xy, -0.18, 0.88, bevel=0.05, bevel_segs=2, mat=m_stl)

    extras = [
        shell,
        # Rear steel stock hinge trunnion block
        mk_box("oh_trun", 1.8, 3.8, 3.6, [("t", -15.9, 0.85, 0.0)], m_stl, bevel=0.08, bevel_segs=2),
        dovetail,
        # Dovetail recoil stop lug
        mk_box("oh_dstop", 0.52, 0.90, 0.24, [("t", -11.9, 0.90, -2.14)], m_stl, bevel=0.03),
        magrel,
        mk_cyl("oh_magpin", 0.14, 0.14, 1.28, axis="z", segs=16, xform=[("t", 3.75, -1.85, 0.35)], mat=m_stl, bevel=0.02),
    ]
    # 3 domed steel dovetail rail rivets
    for rx in (-10.6, -7.2, -3.8):
        extras.append(mk_cyl(f"oh_riv_{rx:.1f}", 0.22, 0.24, 0.12, axis="z", segs=18,
                             xform=[("t", rx, 0.90, -2.24)], mat=m_stl, bevel=0.03))
    # Contoured lower forend ergonomic traction ribs hugging rounded belly
    for rx in (13.2, 15.0, 16.8, 18.6, 20.4, 22.2, 24.0, 25.8):
        extras.append(mk_box(f"oh_frib_{rx:.1f}", 0.46, 0.18, 2.38, [("t", rx, -0.82, 0.0)], m_grip, bevel=0.04, bevel_segs=2))

    obj = join_objects(extras, "an94_outer_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_dust_cover(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Smoothly Arched Ribbed Stamped Russian Black-Enamel Top Dust Cover."""
    m_stl = mats["RS_EnamelSteel"]
    # 16-segment smooth stamped Russian arch cross-section
    pts_zy = [(-1.88, 2.22), (-1.88, 3.22)]
    for i in range(13):
        ang = math.pi * (1.0 - i / 12.0)
        z = 1.88 * math.cos(ang)
        y = 3.22 + 0.93 * math.sin(ang)
        pts_zy.append((z, y))
    pts_zy.append((1.88, 2.22))

    base = mk_extrude_x("dc_base", pts_zy, -16.22, 5.82, bevel=0.06, bevel_segs=2, mat=m_stl)
    # Matching inner arch cavity cutter
    in_zy = [(-1.62, 2.02), (-1.62, 3.12)]
    for i in range(13):
        ang = math.pi * (1.0 - i / 12.0)
        z = 1.62 * math.cos(ang)
        y = 3.12 + 0.78 * math.sin(ang)
        in_zy.append((z, y))
    in_zy.append((1.62, 2.02))
    c_in = mk_extrude_x("c_dc_in", in_zy, -15.88, 5.48, mat=m_stl)
    c_ej = mk_box("c_dc_ej", 8.2, 1.42, 1.48, [("t", 1.5, 2.82, 1.62)], m_stl, bevel=0.08, bevel_segs=2)
    c_rs = mk_box("c_dc_rs", 2.90, 1.48, 2.18, [("t", -13.6, 3.85, 0.0)], m_stl, bevel=0.06)
    body = bool_subtract(base, [c_in, c_ej, c_rs])

    # 5 embossed curved transverse stiffening ribs following the arched dust cover roof!
    parts = [body]
    rib_zy = []
    for i in range(11):
        ang = math.radians(150.0 - i * 12.0)
        rib_zy.append((1.70 * math.cos(ang), 3.18 + 0.99 * math.sin(ang)))
    for i in range(10, -1, -1):
        ang = math.radians(150.0 - i * 12.0)
        rib_zy.append((1.56 * math.cos(ang), 3.12 + 0.86 * math.sin(ang)))
    for rx in (-10.2, -7.8, -5.4, -3.0, -0.6):
        parts.append(mk_extrude_x(f"dc_rib_{rx:.1f}", rib_zy, rx - 0.22, rx + 0.22, bevel=0.035, bevel_segs=2, mat=m_stl))
    # Rolled ejection port top reinforcement lip
    parts.append(mk_box("dc_lip", 8.4, 0.14, 0.22, [("t", 1.5, 3.56, 1.72)], m_stl, bevel=0.04))
    obj = join_objects(parts, "an94_dust_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_buttstock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: Ergonomically Contoured Izhmash Right-Folding Polyamide Buttstock w/ Recessed Truss
    Pockets, Chamfered Oval Sling Slot, Detailed Hinge Knuckle & Curved Multi-Ribbed Rubber Buttpad."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_pad = mats["RS_RubberButtpad"]
    m_stl = mats["RS_EnamelSteel"]

    # Smooth Bezier cheek comb & gracefully sweeping lower belly contour
    top_comb = sample_cubic_bezier((-1.38, 1.48), (-8.5, 1.66), (-17.5, 1.76), (-25.32, 1.78), segs=12)
    bot_belly = sample_cubic_bezier((-25.32, -5.82), (-21.0, -5.22), (-11.0, -3.28), (-1.38, -1.65), segs=12)
    stock_xy = top_comb + bot_belly

    body_raw = mk_extrude_z("bs_body", stock_xy, -1.42, 1.42, bevel=0.26, bevel_segs=5, mat=m_poly)

    # Subdivide cheek faces cleanly with bisect planes and apply C^2 ergonomic cheek-rest & belly taper!
    bm = bmesh.new()
    bm.from_mesh(body_raw.data)
    for bx in (-23.8, -22.0, -20.0, -17.5, -15.0, -12.5, -10.0, -7.5, -5.0, -3.0):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(bx, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
    for bz_h in (-4.4, -3.2, -2.0, -0.8, 0.4):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0.0, 0.0, bz_h), plane_no=(0.0, 0.0, 1.0))
    for v in bm.verts:
        tx, ty, tz = v.co.x, v.co.z, -v.co.y
        # Keep ends flush at hinge (tx > -2.6) and buttpad (tx < -24.6)
        end_blend = _smoothstep_f(-24.8, -21.5, tx) * (1.0 - _smoothstep_f(-4.8, -2.2, tx))
        # Fuller rounded cheek rest along upper comb (ty > -0.8), sleeker tapered lower strut
        cheek_swell = 1.035 * _smoothstep_f(-1.2, 0.6, ty) + 0.84 * (1.0 - _smoothstep_f(-1.2, 0.6, ty))
        scale_z = 1.0 + end_blend * (cheek_swell - 1.0)
        v.co.y = -(tz * scale_z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(body_raw.data)
    bm.free()

    # Carve crisp chamfered oval sling loop slot through rear buttstock + beveled side truss pockets!
    cutters = [
        mk_chamfered_stadium_cutter_z(
            "c_bs_sling", cx=-22.2, cy=-3.42,
            z_wall=1.42, depth=3.2,
            length=2.45, width=1.18, chamfer=0.10,
            through_both=True, segs=10, mat=m_poly,
        ),
    ]
    for side in (-1.0, 1.0):
        # Shallow recessed Izhmash molded truss lightening pockets on both flanks
        cutters.append(
            mk_chamfered_stadium_cutter_z(
                f"c_bs_truss_{side:+.0f}", cx=-12.8, cy=-2.05,
                z_wall=side * 1.24, depth=0.34,
                length=11.6, width=1.12, chamfer=0.09,
                side_sign=side, segs=10, mat=m_poly,
            )
        )
    body = bool_subtract(body_raw, cutters)

    # Contoured vulcanized rubber recoil buttpad with gentle concave shoulder cup
    pad_xy = (
        [(-25.30, 1.82), (-25.95, 1.82)]
        + sample_quad_bezier((-25.95, 1.82), (-25.72, -2.02), (-26.08, -5.88), segs=10)[1:]
        + [(-25.30, -5.88)]
    )
    pad = mk_extrude_z("bs_pad", pad_xy, -1.52, 1.52, bevel=0.14, bevel_segs=3, mat=m_pad)

    parts = [
        body,
        pad,
        # Steel sling loop bar inside oval sling slot
        mk_cyl("bs_sbar", 0.14, 0.14, 1.35, axis="y", segs=16, xform=[("t", -22.2, -3.42, 0.0)], mat=m_stl, bevel=0.02),
        # Detailed right-folding steel hinge knuckle, vertical pivot pin (+Z) & spring release button (-Z)
        mk_box("bs_hinge", 1.62, 3.42, 3.40, [("t", -0.80, 0.0, 0.0)], m_stl, bevel=0.10, bevel_segs=2),
        mk_cyl("bs_hknuck", 0.56, 0.56, 3.36, axis="y", segs=24, xform=[("t", -0.22, 0.0, 1.58)], mat=m_stl, bevel=0.05),
        mk_cyl("bs_hpin", 0.34, 0.34, 3.66, axis="y", segs=24, xform=[("t", -0.22, 0.0, 1.58)], mat=m_stl, bevel=0.03),
        mk_knurled_cyl("bs_relbtn", 0.34, 0.28, axis="z", flutes=18, depth=0.018, xform=[("t", -0.92, -0.45, -1.72)], mat=m_stl),
    ]
    # Molded longitudinal polymer reinforcement spine rib above truss pocket
    parts.append(mk_box("bs_rib_u", 19.2, 0.30, 2.94, [("t", -13.4, 0.38, 0.0)], m_poly, bevel=0.06, bevel_segs=2))
    # 9 crisp anti-slip horizontal shoulder tread ribs along curved buttpad face
    for i in range(9):
        u = i / 8.0
        gy = 1.35 - u * 6.70
        gx_pad = -25.86 - 0.10 * ((2.0 * u - 1.0) ** 2)
        parts.append(mk_box(f"bs_pg_{i}", 0.16, 0.24, 2.68, [("t", gx_pad, gy, 0.0)], m_pad, bevel=0.03))

    obj = join_objects(parts, "an94_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_an94_pistol_grip(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-07: Organically Lofted Ergonomic Izhmash Pistol Grip w/ Palm Swell, Finger Contour & Diagonal Ribbing."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_grip = mats["RS_PolyamideGrip"]
    m_stl = mats["RS_EnamelSteel"]

    # 14-station ergonomic superellipse loft along Y (from receiver seat Y=-0.36 to base Y=-9.55)
    # Station = (y, x_back, x_front, hz, p_back, p_front)
    grip_stations = [
        (-0.36, -1.68,  1.88, 1.24, 2.6, 2.6),
        (-1.10, -2.02,  1.65, 1.20, 2.3, 2.2),  # slender upper thumb-web waist
        (-2.05, -2.42,  1.32, 1.26, 2.2, 2.1),  # top finger groove arch
        (-3.00, -2.68,  1.15, 1.34, 2.1, 2.2),  # palm swell begins
        (-4.10, -2.92,  0.86, 1.40, 2.1, 2.3),  # anatomical palm swell peak
        (-5.20, -3.18,  0.54, 1.40, 2.1, 2.3),
        (-6.35, -3.48,  0.18, 1.36, 2.2, 2.3),
        (-7.50, -3.80, -0.22, 1.32, 2.2, 2.4),
        (-8.60, -4.12, -0.62, 1.30, 2.3, 2.5),
        (-9.45, -4.34, -0.94, 1.34, 2.5, 2.6),  # subtle ergonomic heel flare
    ]
    body = mk_loft_y("pg_body", grip_stations, n_ring=32, mat=m_poly, cap_ends=True)

    # Flared contoured heel base cap & recessed slotted steel grip screw
    cap_stations = [
        (-9.35, -4.40, -0.88, 1.38, 2.8, 2.8),
        (-9.68, -4.44, -0.85, 1.40, 3.0, 3.0),
        (-9.94, -4.32, -0.98, 1.30, 3.0, 3.0),
    ]
    cap = mk_loft_y("pg_cap", cap_stations, n_ring=28, mat=m_grip, cap_ends=True)
    screw = mk_cyl("pg_screw", 0.38, 0.38, 0.22, axis="y", segs=20, xform=[("t", -2.62, -9.94, 0.0)], mat=m_stl, bevel=0.03)

    parts = [body, cap, screw]
    # Raised crowned textured Izhmash lateral traction panels + 7 molded diagonal grip serration ribs per side!
    for side in (-1.0, 1.0):
        parts.append(
            mk_box(
                f"pg_chk_{side:+.0f}", 2.10, 5.95, 0.14,
                [("rz", -0.28), ("t", -1.45, -5.25, side * 1.34)],
                m_grip, bevel=0.05, bevel_segs=2,
            )
        )
        for k in range(7):
            ry = -2.65 - k * 0.82
            rx = -0.75 - k * 0.24
            parts.append(
                mk_box(
                    f"pg_rib_{side:+.0f}_{k}", 1.85, 0.14, 0.10,
                    [("rz", 0.22), ("t", rx, ry, side * 1.40)],
                    m_grip, bevel=0.025,
                )
            )
    # Frontstrap horizontal tactile traction ribs
    for k in range(5):
        ry = -3.4 - k * 1.05
        rx = 1.02 - k * 0.34
        parts.append(mk_box(f"pg_frib_{k}", 0.16, 0.22, 1.25, [("rz", -0.28), ("t", rx, ry, 0.0)], m_grip, bevel=0.03))

    obj = join_objects(parts, "an94_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_an94_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-08: Iconic Nikonov 5-Position Rotary Star-Wheel Diopter Rear Sight (`2/3/4/5/7`) w/ Sculpted Ears & Knurled Axle."""
    m_stl = mats["RS_SightSteel"]
    m_ax = mats["RS_BrightAxle"]

    # Swept curved protective side wings (authentic Russian diopter guard profile!)
    ear_xy = (
        [(-1.42, 0.28), (1.42, 0.28), (1.36, 1.22)]
        + sample_cubic_bezier((1.36, 1.22), (1.15, 1.98), (-1.15, 1.98), (-1.36, 1.22), segs=12)[1:]
    )
    parts = [
        mk_box("rs_base", 3.22, 0.64, 2.22, [("t", 0.0, 0.15, 0.0)], m_stl, bevel=0.06, bevel_segs=2),
        mk_extrude_z("rs_ear_l", ear_xy, -1.22, -0.88, bevel=0.05, bevel_segs=2, mat=m_stl),
        mk_extrude_z("rs_ear_r", ear_xy, 0.88, 1.22, bevel=0.05, bevel_segs=2, mat=m_stl),
        mk_cyl("rs_axle", 0.24, 0.24, 2.46, axis="z", segs=24, xform=[("t", 0.0, 1.12, 0.0)], mat=m_ax, bevel=0.02),
        # Knurled detent/windage axle drums on outer flanks
        mk_knurled_cyl("rs_knob_l", 0.34, 0.20, axis="z", flutes=18, depth=0.018, xform=[("t", 0.0, 1.12, -1.24)], mat=m_stl),
        mk_knurled_cyl("rs_knob_r", 0.34, 0.20, axis="z", flutes=18, depth=0.018, xform=[("t", 0.0, 1.12, 1.24)], mat=m_stl),
        mk_cyl("rs_hub", 0.84, 0.84, 0.86, axis="z", segs=36, xform=[("t", 0.0, 1.12, 0.0)], mat=m_stl, bevel=0.05),
    ]
    # 5 iconic star-wheel diopter aperture barrels (`2 / 3 / 4 / 5 / 7`) with rounded cylindrical lugs & countersunk peep bores!
    for i in range(5):
        a = (i / 5.0) * math.tau + math.pi * 0.5
        tx, ty = math.cos(a) * 0.90, 1.12 + math.sin(a) * 0.90
        # Rounded cylindrical diopter sight lobe oriented tangentially along sightline
        petal_cyl = mk_cyl(
            f"rs_pet_{i}", 0.30, 0.30, 0.62, axis="x", segs=24,
            xform=[("rz", a - math.pi * 0.5), ("t", tx, ty, 0.0)],
            mat=m_stl, bevel=0.04,
        )
        # Web stem uniting petal to hub
        stem = mk_box(
            f"rs_stem_{i}", 0.38, 0.44, 0.54,
            [("rz", a - math.pi * 0.5), ("t", math.cos(a) * 0.68, 1.12 + math.sin(a) * 0.68, 0.0)],
            m_stl, bevel=0.03,
        )
        petal_u = bool_union(petal_cyl, [stem])
        peep = mk_cyl(
            f"c_peep_{i}", 0.11, 0.11, 1.00, axis="x", segs=18,
            xform=[("rz", a - math.pi * 0.5), ("t", tx, ty, 0.0)], mat=m_ax,
        )
        parts.append(bool_subtract(petal_u, [peep]))

    obj = join_objects(parts, "an94_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_safety_switch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Dedicated Cross-Receiver Thumb Safety Latch w/ Contoured Serrated Paddles & Crimson Fire Dot."""
    m_stl = mats["RS_SightSteel"]
    m_red = mats["RS_CrimsonDot"]
    parts = [
        mk_cyl("saf_ax", 0.26, 0.26, 4.10, axis="z", segs=24, mat=m_stl, bevel=0.025),
        mk_box("saf_pl", 1.38, 0.62, 0.36, [("t", -0.42, 0.06, -2.08)], m_stl, bevel=0.06, bevel_segs=2),
        mk_box("saf_pr", 1.38, 0.62, 0.36, [("t", -0.42, 0.06, 2.08)], m_stl, bevel=0.06, bevel_segs=2),
        mk_cyl("saf_red", 0.14, 0.14, 0.12, axis="z", segs=20, xform=[("t", -0.78, 0.06, -2.28)], mat=m_red, bevel=0.02),
    ]
    obj = join_objects(parts, "an94_safety_switch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_fire_selector(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-04: Rear-Left 3-Position Fire Selector (`ОД / 2 / АВ`) w/ Contoured Thumb Lever & Crimson Pointer."""
    m_stl = mats["RS_SightSteel"]
    m_grip = mats["RS_PolyamideGrip"]
    m_red = mats["RS_CrimsonDot"]
    parts = [
        mk_cyl("fs_ax", 0.32, 0.32, 3.85, axis="z", segs=24, mat=m_stl, bevel=0.025),
        mk_box("fs_cam", 0.95, 0.65, 1.40, [("t", 0.20, 0.18, 0.0)], m_stl, bevel=0.05),
        mk_box("fs_arm", 2.15, 0.56, 0.34, [("t", 0.78, 0.0, -2.06)], m_stl, bevel=0.06, bevel_segs=2),
        mk_box("fs_pad", 0.58, 0.88, 0.44, [("t", 1.68, 0.0, -2.14)], m_grip, bevel=0.06, bevel_segs=2),
        mk_box("fs_ptr", 0.45, 0.12, 0.08, [("t", 1.32, 0.0, -2.31)], m_red, bevel=0.015),
    ]
    obj = join_objects(parts, "an94_fire_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 2 BUILDERS: PULLEY-CABLE FLOATING ACTION & FCG (10 parts)
# =============================================================================
def build_an94_inner_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-01: Floating CNC Steel Sub-Receiver Carriage w/ Polished Guide Rails & Chamfered Pulley Bay."""
    m_stl = mats["PM_InnerSteel"]
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]

    main_b = mk_box("ir_main", 24.4, 3.30, 2.84, [("t", -1.0, 1.10, 0.0)], m_stl, bevel=0.07, bevel_segs=2)
    trun_b = mk_box("ir_trun", 3.4, 3.60, 2.95, [("t", 9.5, 1.30, 0.0)], m_car, bevel=0.08, bevel_segs=2)
    lug_b = mk_box("ir_lug", 0.90, 0.78, 1.00, [("t", -6.75, -0.87, 0.0)], m_car, bevel=0.05)
    body_raw = bool_union(main_b, [trun_b, lug_b])

    cutters = [
        mk_box("c_ir_run", 20.6, 2.35, 1.98, [("t", -1.8, 1.78, 0.0)], m_stl),
        mk_box("c_ir_win", 19.2, 1.95, 1.42, [("t", -1.2, 0.85, 1.18)], m_stl, bevel=0.08),
        mk_cyl("c_ir_bbl", 0.95, 0.95, 4.4, axis="x", segs=32, xform=[("t", 9.5, AN94_BORE_Y, 0.0)], mat=m_stl),
        # Left-side chamfered weight-relief stadium windows exposing internal carriage precision!
        mk_chamfered_stadium_cutter_z("c_ir_lw1", -7.5, 1.15, -1.42, 0.55, 5.2, 1.05, chamfer=0.06, side_sign=-1.0, segs=8, mat=m_stl),
        mk_chamfered_stadium_cutter_z("c_ir_lw2", 0.8, 1.15, -1.42, 0.55, 6.4, 1.05, chamfer=0.06, side_sign=-1.0, segs=8, mat=m_stl),
    ]
    body = bool_subtract(body_raw, cutters)

    # Gleaming polished reciprocating stainless guide rail shoes, flanged pulley stud & cross pins
    extras = [
        body,
        mk_box("ir_rail_ul", 20.5, 0.24, 0.14, [("t", -1.5, 2.48, -1.43)], m_ss, bevel=0.025),
        mk_box("ir_rail_ll", 20.5, 0.24, 0.14, [("t", -1.5, -0.28, -1.43)], m_ss, bevel=0.025),
        mk_box("ir_rail_ur", 20.5, 0.24, 0.14, [("t", -1.5, 2.48, 1.43)], m_ss, bevel=0.025),
        mk_box("ir_rail_lr", 20.5, 0.24, 0.14, [("t", -1.5, -0.28, 1.43)], m_ss, bevel=0.025),
        mk_cyl("ir_pulley_stud", 0.42, 0.44, 0.56, axis="z", segs=28, xform=[("t", -9.2, 0.55, 0.65)], mat=m_ss, bevel=0.03),
        mk_cyl("ir_trun_pin1", 0.24, 0.24, 2.94, axis="z", segs=20, xform=[("t", 8.6, 0.75, 0.0)], mat=m_ss, bevel=0.025),
        mk_cyl("ir_trun_pin2", 0.24, 0.24, 2.94, axis="z", segs=20, xform=[("t", 10.4, 0.75, 0.0)], mat=m_ss, bevel=0.025),
    ]
    obj = join_objects(extras, "an94_inner_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_pulley_wheel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-05: THE STAR — 48-Seg CNC Lathe-Turned Deep V-Groove Transmission Pulley + 6 Lightening Holes & Flanged Bronze Hub."""
    m_ss = mats["PM_BrightStainless"]
    m_gr = mats["PM_InnerSteel"]
    m_bz = mats["PM_BronzeRammer"]

    pts_rz = [
        (0.38, -0.28),
        (0.98, -0.28),
        (1.06, -0.24),
        (1.06, -0.15),
        (0.95, -0.12),
        (0.75, -0.065),
        (0.75,  0.065),
        (0.95,  0.12),
        (1.06,  0.15),
        (1.06,  0.24),
        (0.98,  0.28),
        (0.38,  0.28),
    ]
    segs = 48
    bm = bmesh.new()
    rings = []
    for r, z in pts_rz:
        ring = []
        for s in range(segs):
            th = math.tau * s / segs
            ring.append(bm.verts.new((r * math.cos(th), r * math.sin(th), z)))
        rings.append(ring)
    n_p = len(rings)
    for k in range(n_p):
        a = rings[k]
        b = rings[(k + 1) % n_p]
        for s in range(segs):
            sn = (s + 1) % segs
            f = bm.faces.new((a[s], a[sn], b[sn], b[s]))
            f.material_index = 1 if (4 <= k <= 6) else 0
    _apply_three_xform(bm, [])
    wheel = _bm_to_obj("pw_wheel", bm, m_ss)
    wheel.data.materials.append(m_gr)

    # Drill 6 crisp chamfered circular weight-relief holes cleanly through the steel web!
    hole_cuts = []
    for i in range(6):
        a = i * math.tau / 6.0 + math.pi / 6.0
        hx, hy = math.cos(a) * 0.60, math.sin(a) * 0.60
        hole_cuts.append(
            mk_cyl(f"c_pw_h{i}", 0.115, 0.115, 0.90, axis="z", segs=20,
                   xform=[("t", hx, hy, 0.0)], mat=m_gr)
        )
    wheel = bool_subtract(wheel, hole_cuts)

    # Flanged self-lubricating phosphor-bronze center bearing bushing
    hub_rz = [
        (0.18, -0.34), (0.37, -0.34), (0.42, -0.30), (0.42, -0.26), (0.39, -0.25),
        (0.39,  0.25), (0.42,  0.26), (0.42,  0.30), (0.37,  0.34), (0.18,  0.34),
    ]
    bm_h = bmesh.new()
    h_rings = [[bm_h.verts.new((r * math.cos(math.tau * s / 36), r * math.sin(math.tau * s / 36), z))
                for s in range(36)] for r, z in hub_rz]
    for k in range(len(h_rings)):
        a, b = h_rings[k], h_rings[(k + 1) % len(h_rings)]
        for s in range(36):
            sn = (s + 1) % 36
            bm_h.faces.new((a[s], a[sn], b[sn], b[s]))
    _apply_three_xform(bm_h, [])
    hub = _bm_to_obj("pw_hub", bm_h, m_bz)

    # 3 prominent CNC radial beveled cross-ribs on both faces so 275° spin pops in slow-mo!
    spokes = []
    for i in range(3):
        ang = i * math.pi / 3.0
        for sgn in (-1.0, 1.0):
            spokes.append(mk_box(f"pw_sp_{i}_{sgn:+.0f}", 1.56, 0.11, 0.055,
                                 [("rz", ang), ("t", 0.0, 0.0, sgn * 0.295)], m_ss, bevel=0.015))
    obj = join_objects([wheel, hub, *spokes], "an94_pulley_wheel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_steel_cable(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-06: Helically Twisted 6-Strand Braided Stainless Pulley Drive Cable + Stepped Swaged Brass Ferrules."""
    m_cab = mats["PM_BraidedCable"]
    m_brs = mats["PM_BrassFerrule"]

    pts = []
    r_wrap = 0.84
    for i in range(18):
        pts.append(Vector((7.2 * (1.0 - i / 17.0), r_wrap, 0.0)))
    for i in range(1, 33):
        a = math.pi * 0.5 + math.pi * (i / 32.0)
        pts.append(Vector((math.cos(a) * r_wrap, math.sin(a) * r_wrap, 0.0)))
    for i in range(1, 25):
        pts.append(Vector((12.8 * (i / 24.0), -r_wrap, 0.0)))

    # Stepped swaged brass end ferrules with crimping collar bands
    fer_pts = [
        (0.00, -0.44), (0.19, -0.44), (0.22, -0.38), (0.22, -0.10),
        (0.18, -0.05), (0.18,  0.05), (0.22,  0.10), (0.22,  0.38),
        (0.19,  0.44), (0.00,  0.44),
    ]
    parts = [
        mk_braided_cable_along_pts("cab_wire", pts, base_radius=0.115, strands=6, twist_per_cm=2.8, mat=m_cab),
        mk_lathe_x("cab_fer_u", fer_pts, segs=24, xform=[("t", 7.2, r_wrap, 0.0)], mat=m_brs),
        mk_lathe_x("cab_fer_l", fer_pts, segs=24, xform=[("t", 12.8, -r_wrap, 0.0)], mat=m_brs),
    ]
    obj = join_objects(parts, "an94_steel_cable")
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_an94_feed_rammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-07: Gleaming Phosphor-Bronze & Chrome 2-Stage Pre-Feed Shuttle w/ Curved 5.45mm Cradle Trough."""
    m_bz = mats["PM_BronzeRammer"]
    m_ss = mats["PM_BrightStainless"]
    m_brs = mats["PM_BrassFerrule"]

    # Curved U-cradle stainless pre-feed cartridge tray cross-section in Z-Y
    tray_zy = [
        (-0.88, 0.44), (-0.70, 0.44), (-0.64, 0.22), (-0.25, 0.14),
        (0.14, 0.22), (0.20, 0.44), (0.38, 0.44), (0.38, 0.04), (-0.88, 0.04),
    ]
    tray = mk_extrude_x("fr_tray", tray_zy, -1.10, 3.70, bevel=0.035, bevel_segs=2, mat=m_ss)
    parts = [
        mk_box("fr_bar", 5.60, 0.64, 0.72, [("t", 0.40, -0.42, 0.12)], m_bz, bevel=0.06, bevel_segs=2),
        tray,
        mk_box("fr_dog", 0.56, 1.06, 0.96, [("t", -1.25, 0.42, -0.20)], m_bz, bevel=0.05, bevel_segs=2),
        mk_box("fr_hook", 0.86, 0.62, 0.46, [("t", -1.60, -0.58, 0.25)], m_brs, bevel=0.04, bevel_segs=2),
        mk_cyl("fr_pin", 0.14, 0.14, 0.56, axis="z", segs=16, xform=[("t", -1.78, -0.62, 0.25)], mat=m_ss, bevel=0.02),
    ]
    obj = join_objects(parts, "an94_feed_rammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_bolt_carrier(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-02: Long-Stroke Chrome Piston Bolt Carrier w/ Sculpted Upturned Charging Handle & Cable Clevis."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_brs = mats["PM_BrassFerrule"]

    blk = mk_box("bc_blk", 8.70, 1.65, 1.72, [("t", -0.15, 0.18, 0.0)], m_car, bevel=0.08, bevel_segs=2)
    boss = mk_box("bc_boss", 2.60, 1.55, 1.25, [("t", 3.80, 1.15, 0.0)], m_car, bevel=0.06)
    rod = mk_cyl("bc_rod", 0.42, 0.42, 15.20, axis="x", segs=28, xform=[("t", 11.4, 1.90, 0.0)], mat=m_ss, bevel=0.02)
    head_pts = [
        (0.00, 18.32), (0.64, 18.32), (0.64, 18.56), (0.52, 18.60), (0.52, 18.70),
        (0.64, 18.74), (0.64, 18.92), (0.52, 18.96), (0.52, 19.06), (0.64, 19.10),
        (0.64, 19.28), (0.52, 19.32), (0.52, 19.42), (0.64, 19.46), (0.64, 19.62),
        (0.56, 19.68), (0.00, 19.68),
    ]
    phead = mk_lathe_x("bc_head", head_pts, segs=32, xform=[("t", 0.0, 1.90, 0.0)], mat=m_ss)
    # Ergonomic swept upturned charging handle
    ch_pts = sample_quad_bezier((0.0, 0.12), (2.25, 0.12), (2.95, 1.24), segs=10)
    ch_arm = mk_tube_along_pts("bc_ch_arm", [Vector((1.85, py, pz)) for pz, py in ch_pts], radius=0.34, ring_segs=18, mat=m_car)
    ch_knob = mk_cyl("bc_ch_knob", 0.40, 0.46, 0.72, axis="y", segs=24, xform=[("t", 1.85, 0.96, 2.95)], mat=m_car, bevel=0.08)
    clev = mk_box("bc_clev", 1.15, 0.65, 0.48, [("t", -3.60, -0.32, 0.62)], m_brs, bevel=0.04)

    raw = bool_union(blk, [boss])
    cutters = [
        mk_cyl("c_bc_bore", 0.62, 0.62, 5.4, axis="x", segs=28, xform=[("t", 2.6, 0.0, 0.0)], mat=m_car),
        mk_box("c_bc_cam", 2.6, 0.42, 0.82, [("t", 1.8, 0.42, 0.72)], m_car, bevel=0.04),
    ]
    body = bool_subtract(raw, cutters)
    obj = join_objects([body, rod, phead, ch_arm, ch_knob, clev], "an94_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_bolt(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-03: Gleaming Brushed-Stainless 2-Lug Rotating Bolt w/ Darkened Claw Extractor."""
    m_ss = mats["PM_BrightStainless"]
    m_car = mats["PM_OiledCarrier"]

    raw = bool_union(
        mk_cyl("blt_body", 0.56, 0.56, 4.80, axis="x", segs=36, xform=[("t", 0.20, 0.0, 0.0)], mat=m_ss, bevel=0.03),
        [
            mk_box("blt_lugs", 0.92, 0.48, 1.62, [("t", 1.95, 0.0, 0.0)], m_ss, bevel=0.04, bevel_segs=2),
            mk_box("blt_cam", 0.62, 0.56, 0.42, [("t", 0.05, 0.62, 0.0)], m_ss, bevel=0.035),
        ],
    )
    cutters = [
        mk_cyl("c_blt_face", 0.46, 0.46, 0.34, axis="x", segs=28, xform=[("t", 2.52, 0.0, 0.0)], mat=m_ss),
        mk_cyl("c_blt_pin", 0.14, 0.14, 5.20, axis="x", segs=18, xform=[("t", 0.20, 0.0, 0.0)], mat=m_ss),
    ]
    body = bool_subtract(raw, cutters)
    ext = mk_box("blt_ext", 1.85, 0.24, 0.26, [("t", 1.45, 0.05, 0.58)], m_car, bevel=0.025)
    obj = join_objects([body, ext], "an94_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-04: Coaxial Stainless Stepped Firing Pin."""
    m_ss = mats["PM_BrightStainless"]
    pts = [
        (0.00, -2.42), (0.26, -2.42), (0.26, -1.58), (0.16, -1.48),
        (0.13, 1.88), (0.06, 2.54), (0.00, 2.54),
    ]
    obj = mk_lathe_x("an94_firing_pin", pts, segs=24, mat=m_ss)
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_an94_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Pivoting CNC Steel Hammer & Bronze 2-Round Hyperburst Ratchet Pawl."""
    m_ss = mats["PM_BrightStainless"]
    m_car = mats["PM_OiledCarrier"]
    m_bz = mats["PM_BronzeRammer"]

    h_xy = (
        [(-0.55, -0.45), (0.55, -0.45)]
        + sample_quad_bezier((0.55, -0.45), (0.82, 0.45), (0.36, 1.65), segs=8)[1:]
        + [(-0.38, 1.65)]
        + sample_quad_bezier((-0.38, 1.65), (-0.72, 0.55), (-0.55, -0.45), segs=8)[1:-1]
    )
    obj = join_objects([
        mk_extrude_z("hm_body", h_xy, -0.36, 0.36, bevel=0.05, bevel_segs=2, mat=m_ss),
        mk_cyl("hm_pin", 0.28, 0.28, 1.65, axis="z", segs=24, mat=m_car, bevel=0.025),
        mk_box("hm_ratchet", 1.65, 0.42, 0.28, [("t", -0.95, 0.25, -0.52)], m_bz, bevel=0.035),
    ], "an94_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: Smoothly Swept Curved Steel Trigger Shoe & Articulated Floating-Action Disconnector Bar."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_stl = mats["PM_InnerSteel"]

    shoe_curve = sample_cubic_bezier((0.06, 0.40), (-0.12, -0.55), (-0.36, -1.42), (0.32, -2.14), segs=12)
    shoe = mk_swept_bow("tr_shoe", shoe_curve, thickness=0.46, half_z=0.27, bevel=0.06, bevel_segs=2, mat=m_car)
    obj = join_objects([
        shoe,
        mk_cyl("tr_pin", 0.22, 0.22, 1.45, axis="z", segs=22, xform=[("t", 0.0, 0.15, 0.0)], mat=m_ss, bevel=0.025),
        mk_box("tr_bar", 3.40, 0.45, 0.32, [("t", -1.35, 0.65, -0.36)], m_stl, bevel=0.035),
    ], "an94_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_recoil_guide(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-08: Telescoping Dual Steel Recoil Guide Rod & Polyurethane Buffer Block."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_stl = mats["PM_InnerSteel"]
    m_buf = mats["PM_BufferPoly"]

    obj = join_objects([
        mk_box("rg_anc", 1.30, 1.35, 1.25, [("t", -5.85, -0.10, 0.0)], m_car, bevel=0.06, bevel_segs=2),
        mk_cyl("rg_r1", 0.24, 0.24, 7.60, axis="x", segs=24, xform=[("t", -1.80, 0.0, 0.0)], mat=m_ss, bevel=0.02),
        mk_cyl("rg_r2", 0.18, 0.18, 5.20, axis="x", segs=22, xform=[("t", 4.00, 0.0, 0.0)], mat=m_stl, bevel=0.018),
        mk_box("rg_buf", 0.55, 1.15, 1.10, [("t", -4.95, -0.10, 0.0)], m_buf, bevel=0.05),
    ], "an94_recoil_guide")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 3 BUILDERS: 405mm FLOATING BARREL, FIGURE-8 BRAKE & 15° PLUM MAG (7 parts)
# =============================================================================
def build_an94_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: 40.5 cm Floating Cold-Hammer-Forged Chrome-Lined 5.45x39mm Barrel w/ Stepped Lathe Contour."""
    m_bbl = mats["BM_BarrelSteel"]
    m_stl = mats["BM_MagSteel"]

    bbl_pts = [
        (0.285, 0.00), (0.92, 0.00), (0.92, 7.10), (0.86, 7.45),
        (0.76, 25.40), (0.75, 26.20), (0.72, 40.25), (0.68, 40.50),
        (0.285, 40.50), (0.285, 0.00),
    ]
    bbl = mk_lathe_x("bbl_tube", bbl_pts, segs=40, mat=m_bbl)
    gb = mk_box("bbl_gb", 2.80, 2.50, 1.85, [("t", 25.50, 0.90, 0.0)], m_stl, bevel=0.08, bevel_segs=2)
    gb_bore = mk_cyl("c_gb_b", 0.78, 0.78, 3.2, axis="x", segs=28, xform=[("t", 25.50, 0.0, 0.0)], mat=m_stl)
    gb = bool_subtract(gb, [gb_bore])
    bayo = mk_box("bbl_bayo", 2.40, 0.85, 1.15, [("t", 34.80, -0.82, 0.0)], m_stl, bevel=0.05, bevel_segs=2)
    obj = join_objects([bbl, gb, bayo], "an94_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_gas_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Upper High-Pressure Gas Cylinder, Knurled Gas Plug & Tall Hooded Front Sight Tower."""
    m_stl = mats["BM_MagSteel"]
    m_bbl = mats["BM_BarrelSteel"]
    m_wht = mats["BM_SightTritiumWhite"]

    gt_pts = [
        (0.46, -10.50), (0.68, -10.50), (0.68, 9.05), (0.84, 9.15),
        (0.84, 10.42), (0.00, 10.42), (0.00, 9.40), (0.46, 9.40), (0.46, -10.50),
    ]
    tube = mk_lathe_x("gt_tube", gt_pts, segs=36, mat=m_bbl)
    fsb_xy = [
        (8.10, 0.55), (10.30, 0.55), (10.05, 2.10), (8.35, 2.10),
    ]
    fsb = mk_extrude_z("gt_fsb", fsb_xy, -0.72, 0.72, bevel=0.08, bevel_segs=2, mat=m_stl)
    hood_raw = mk_cyl("gt_hood", 0.76, 0.76, 1.75, axis="x", segs=36, xform=[("t", 9.20, 2.55, 0.0)], mat=m_stl, bevel=0.04)
    hood = bool_subtract(hood_raw, [mk_cyl("c_gt_hd", 0.56, 0.56, 2.15, axis="x", segs=30, xform=[("t", 9.20, 2.55, 0.0)], mat=m_stl)])
    plug_knurl = mk_knurled_cyl("gt_plug_k", 0.85, 0.65, axis="x", flutes=24, depth=0.020, xform=[("t", 10.08, 0.0, 0.0)], mat=m_stl)
    wind_drum = mk_cyl("gt_drum", 0.24, 0.24, 1.48, axis="z", segs=20, xform=[("t", 9.20, 1.90, 0.0)], mat=m_stl, bevel=0.025)
    post = mk_cyl("gt_post", 0.08, 0.11, 0.92, axis="y", segs=16, xform=[("t", 9.20, 2.38, 0.0)], mat=m_wht)
    obj = join_objects([tube, fsb, hood, plug_knurl, wind_drum, post], "an94_gas_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_muzzle_brake(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: THE SILHOUETTE ICON — Sculpted Figure-8 Twin-Chamber Acoustic Whistling Muzzle Brake
    with Smooth Hourglass Profile, Chamfered Stadium Vortex Exhaust Ports & Detent Locking Collar."""
    m_brk = mats["BM_Figure8BrakeHeat"]
    m_stl = mats["BM_MagSteel"]

    # Smooth 64-point figure-8 hourglass cross-section (upper lobe Y=+0.58, lower lobe Y=-0.52, pinched waist!)
    fig8_zy = []
    # Upper circular arc (+155° -> +25°, centered at (0, +0.58), r=0.92)
    for i in range(21):
        ang = math.radians(155.0 - i * (130.0 / 20.0))
        fig8_zy.append((0.92 * math.cos(ang), 0.58 + 0.92 * math.sin(ang)))
    # Right pinched waist curve (+Z)
    fig8_zy.extend(sample_quad_bezier(fig8_zy[-1], (0.64, 0.03), (0.88 * math.cos(math.radians(-25.0)), -0.52 + 0.88 * math.sin(math.radians(-25.0))), segs=8)[1:])
    # Lower circular arc (-25° -> -155°, centered at (0, -0.52), r=0.88)
    for i in range(1, 21):
        ang = math.radians(-25.0 - i * (130.0 / 20.0))
        fig8_zy.append((0.88 * math.cos(ang), -0.52 + 0.88 * math.sin(ang)))
    # Left pinched waist curve (-Z)
    fig8_zy.extend(sample_quad_bezier(fig8_zy[-1], (-0.64, 0.03), fig8_zy[0], segs=8)[1:-1])

    fig8_body = mk_extrude_x("mb_fig8", fig8_zy, 1.24, 5.60, bevel=0.08, bevel_segs=3, mat=m_brk)
    # Stepped rear bayonet/detent locking collar w/ ribbed wrench ring
    col_pts = [
        (0.00, 0.00), (0.95, 0.00), (0.95, 0.95), (0.86, 1.02),
        (0.86, 1.12), (0.95, 1.18), (0.95, 1.38), (0.00, 1.38),
    ]
    collar = mk_lathe_x("mb_col", col_pts, segs=40, mat=m_stl)
    raw = bool_union(fig8_body, [collar])

    cutters = [
        # Central 5.45mm bullet flight bore + front crown bevel counterbore
        mk_cyl("c_mb_bore", 0.36, 0.36, 6.2, axis="x", segs=28, xform=[("t", 2.8, 0.0, 0.0)], mat=m_brk),
        mk_cyl("c_mb_crown", 0.48, 0.36, 0.34, axis="x", segs=28, xform=[("t", 5.52, 0.0, 0.0)], mat=m_brk),
        # Twin chamfered stadium upper & lower self-cleaning vortex whistle chambers!
        mk_chamfered_stadium_cutter_z(
            "c_mb_u", cx=3.42, cy=0.62, z_wall=0.96, depth=2.6,
            length=2.72, width=0.90, chamfer=0.075, through_both=True, segs=10, mat=m_brk,
        ),
        mk_chamfered_stadium_cutter_z(
            "c_mb_l", cx=3.42, cy=-0.54, z_wall=0.92, depth=2.6,
            length=2.72, width=0.84, chamfer=0.075, through_both=True, segs=10, mat=m_brk,
        ),
        # Rear spring-detent locking notch on collar top
        mk_box("c_mb_det", 0.35, 0.24, 0.36, [("t", 0.14, 0.94, 0.0)], m_stl),
    ]
    obj = bool_subtract(raw, cutters)
    obj.name = "an94_muzzle_brake"
    obj.data.name = "an94_muzzle_brake"
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def _mk_curved_arc_box(
    name: str, r_in: float, r_out: float, half_z: float,
    ang0: float, ang1: float, steps: int, mat: bpy.types.Material,
    chamfer: float = 0.0,
) -> bpy.types.Object:
    rings = []
    for i in range(steps + 1):
        ang = ang0 + (ang1 - ang0) * (i / steps)
        ca, sa = math.cos(ang), math.sin(ang)
        if chamfer > 1e-4:
            ri0, ri1 = r_in, r_in + chamfer
            ro0, ro1 = r_out - chamfer, r_out
            hz0, hz1 = half_z - chamfer, half_z
            pts = [
                (AN94_MAG_ARC_CX - ca * ri0, AN94_MAG_ARC_CY - sa * ri0, -hz0),
                (AN94_MAG_ARC_CX - ca * ri1, AN94_MAG_ARC_CY - sa * ri1, -hz1),
                (AN94_MAG_ARC_CX - ca * ro0, AN94_MAG_ARC_CY - sa * ro0, -hz1),
                (AN94_MAG_ARC_CX - ca * ro1, AN94_MAG_ARC_CY - sa * ro1, -hz0),
                (AN94_MAG_ARC_CX - ca * ro1, AN94_MAG_ARC_CY - sa * ro1,  hz0),
                (AN94_MAG_ARC_CX - ca * ro0, AN94_MAG_ARC_CY - sa * ro0,  hz1),
                (AN94_MAG_ARC_CX - ca * ri1, AN94_MAG_ARC_CY - sa * ri1,  hz1),
                (AN94_MAG_ARC_CX - ca * ri0, AN94_MAG_ARC_CY - sa * ri0,  hz0),
            ]
        else:
            x_in, y_in = AN94_MAG_ARC_CX - ca * r_in, AN94_MAG_ARC_CY - sa * r_in
            x_out, y_out = AN94_MAG_ARC_CX - ca * r_out, AN94_MAG_ARC_CY - sa * r_out
            pts = [
                (x_in, y_in, -half_z),
                (x_out, y_out, -half_z),
                (x_out, y_out, half_z),
                (x_in, y_in, half_z),
            ]
        rings.append(pts)
    return mk_loft_rings(name, rings, mat=mat, cap_ends=True)


def build_an94_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: Iconic 15°-Right-Canted 30-Round Izhmash Plum-Violet Polyamide Magazine w/ Chamfered Spine,
    Molded Longitudinal Strengthening Ribs, Top/Bottom Collars & Steel Feed-Lip Liner."""
    m_plum = mats["BM_PlumMagPolymer"]
    m_stl = mats["BM_MagSteel"]

    outer = _mk_curved_arc_box(
        "mb_out", AN94_MAG_R_IN, AN94_MAG_R_OUT, 1.35,
        AN94_MAG_ANG_START, AN94_MAG_ANG_END, 28, m_plum, chamfer=0.16,
    )
    inner = _mk_curved_arc_box(
        "mb_in", AN94_MAG_R_IN + 0.34, AN94_MAG_R_OUT - 0.34, 1.08,
        AN94_MAG_ANG_START - 0.04, AN94_MAG_ANG_END + 0.04, 28, m_plum,
    )
    hollow = bool_subtract(outer, [inner])

    # Molded curved front & rear longitudinal strengthening spine ribs (stay strictly on spine edges, clear of flat Hero UV cheeks!)
    rib_front = _mk_curved_arc_box(
        "mb_rib_f", AN94_MAG_R_IN - 0.04, AN94_MAG_R_IN + 0.42, 1.24,
        AN94_MAG_ANG_START + 0.06, AN94_MAG_ANG_END - 0.03, 24, m_plum, chamfer=0.06,
    )
    rib_rear = _mk_curved_arc_box(
        "mb_rib_r", AN94_MAG_R_OUT - 0.42, AN94_MAG_R_OUT + 0.04, 1.24,
        AN94_MAG_ANG_START + 0.06, AN94_MAG_ANG_END - 0.03, 24, m_plum, chamfer=0.06,
    )
    # Molded bottom floorplate retaining flange & upper magwell insertion bolster (|tz|=1.40 -> outside Hero UV!)
    bot_flange = _mk_curved_arc_box(
        "mb_bot_fl", AN94_MAG_R_IN - 0.04, AN94_MAG_R_OUT + 0.04, 1.40,
        AN94_MAG_ANG_END - 0.042, AN94_MAG_ANG_END, 8, m_plum, chamfer=0.06,
    )
    # Steel-reinforced upper feed-lip collar liner & front/rear steel locking lugs
    feed_lip_l = _mk_curved_arc_box(
        "mb_flip_l", AN94_MAG_R_IN + 0.16, AN94_MAG_R_OUT - 0.16, 1.28,
        AN94_MAG_ANG_START, AN94_MAG_ANG_START + 0.055, 8, m_stl, chamfer=0.04,
    )
    feed_lip_cut = _mk_curved_arc_box(
        "mb_flip_c", AN94_MAG_R_IN + 0.36, AN94_MAG_R_OUT - 0.36, 1.06,
        AN94_MAG_ANG_START - 0.02, AN94_MAG_ANG_START + 0.075, 8, m_stl,
    )
    feed_lip = bool_subtract(feed_lip_l, [feed_lip_cut])

    fx, fy = mag_arc_local(0.02, AN94_MAG_R_IN - 0.12)
    rx, ry = mag_arc_local(0.04, AN94_MAG_R_OUT + 0.14)
    parts = [
        hollow,
        rib_front,
        rib_rear,
        bot_flange,
        feed_lip,
        mk_box("mb_flug", 0.56, 0.72, 1.65, [("t", fx, fy, 0.0)], m_stl, bevel=0.04),
        mk_box("mb_rlug", 0.64, 0.96, 1.56, [("t", rx, ry, 0.0)], m_stl, bevel=0.04),
    ]
    # 3 subtle molded round-count witness bosses along rear spine (`10 / 20 / 30`)
    for frac in (0.34, 0.62, 0.88):
        ang_w = AN94_MAG_ANG_START + frac * (AN94_MAG_ANG_END - AN94_MAG_ANG_START)
        wx, wy = mag_arc_local(ang_w, AN94_MAG_R_OUT + 0.05)
        parts.append(mk_cyl(f"mb_wit_{frac:.2f}", 0.13, 0.13, 0.10, axis="x", segs=14,
                            xform=[("rz", ang_w), ("t", wx, wy, 0.0)], mat=m_stl))

    obj = join_objects(parts, "an94_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: Strictly Firewalled Vivid Safety-Orange 5.45mm Anti-Tilt Follower."""
    m_org = mats["BM_FollowerOrange"]
    rot = [("rz", AN94_MAG_FOLLOWER_ANG)]
    parts = [
        mk_box("fl_deck", 5.20, 0.42, 1.88, [("t", 0.0, 0.12, 0.0)] + rot, m_org, bevel=0.06, bevel_segs=2),
        mk_cyl("fl_step", 0.24, 0.24, 4.90, axis="x", segs=24, xform=[("t", 0.0, 0.38, -0.36)] + rot, mat=m_org, bevel=0.03),
        mk_box("fl_sk_f", 0.55, 1.15, 1.76, [("t", 2.25, -0.45, 0.0)] + rot, m_org, bevel=0.05),
        mk_box("fl_sk_r", 0.55, 1.15, 1.76, [("t", -2.25, -0.45, 0.0)] + rot, m_org, bevel=0.05),
    ]
    obj = join_objects(parts, "an94_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_mag_spring(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-03: Solid Watertight Curved Rectangular-Section 5.45mm Magazine Spring."""
    m_spr = mats["BM_SpringSteel"]
    pts = []
    coils = 5
    steps = coils * 18
    ang_a, ang_b = 0.828, 0.908
    for i in range(steps + 1):
        u = i / steps
        ang = ang_a + (ang_b - ang_a) * u
        th = u * coils * math.tau
        lx, ly = mag_arc_local(ang, AN94_MAG_R_MID + math.cos(th) * 2.15)
        pts.append(Vector((lx, ly, math.sin(th) * 0.78)))
    obj = mk_tube_along_pts("an94_mag_spring", pts, 0.095, ring_segs=10, mat=m_spr)
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_an94_mag_floorplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: Contoured Stamped Black-Enamel Steel Magazine Floorplate w/ Curled Side Rails & Detent Button."""
    m_stl = mats["BM_MagSteel"]
    rot = [("rz", AN94_MAG_ANG_END)]
    obj = join_objects([
        mk_box("fp_plate", 6.90, 0.42, 2.86, [("t", 0.0, -0.26, 0.0)] + rot, m_stl, bevel=0.07, bevel_segs=2),
        mk_box("fp_rail_l", 6.72, 0.30, 0.20, [("t", 0.0, -0.05, -1.33)] + rot, m_stl, bevel=0.04),
        mk_box("fp_rail_r", 6.72, 0.30, 0.20, [("t", 0.0, -0.05,  1.33)] + rot, m_stl, bevel=0.04),
        mk_box("fp_lip_f", 0.34, 0.38, 2.64, [("t", 3.28, -0.10, 0.0)] + rot, m_stl, bevel=0.04),
        mk_cyl("fp_btn", 0.32, 0.34, 0.22, axis="y", segs=22, xform=[("t", 0.0, -0.50, 0.0)] + rot, mat=m_stl, bevel=0.03),
    ], "an94_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & CONCAVE Packing + Strict >=50px Color Firewalls (3 x 2K Suites)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
):
    if not objs:
        return

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
            is_skip = skip_face_fn(o.name, f, mname) if skip_face_fn else False
            f.select = not is_skip
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
        margin=0.0048,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du, dv = u1 - u0, v1 - v0
    u_min, u_max, v_min, v_max = 1.0, 0.0, 1.0, 0.0
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
                ux, vy = max(0.0, min(1.0, uv.x)), max(0.0, min(1.0, uv.y))
                u_min, u_max = min(u_min, ux), max(u_max, ux)
                v_min, v_max = min(v_min, vy), max(v_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u, span_v = u_max - u_min, v_max - v_min
    print(f"  [UV-PACK] {len(objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.45 and span_v > 0.45, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_stock_atlas(objs: list[bpy.types.Object]):
    """Atlas 1 (`an94_v3_receiver_stock`, 7 parts):
      - Hero Band 1 (Outer Housing Left  Flank -Z): u[0.015,0.985], v[0.745,0.985]
      - Hero Band 2 (Outer Housing Right Flank +Z): u[0.015,0.985], v[0.490,0.730]
      - Firewalled Crimson Dots Box (>60px moat):   u[0.010,0.125], v[0.010,0.125]
      - Main Packed Region (rest of 7 parts):       u[0.160,0.990], v[0.010,0.470]
    """
    def is_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "an94_outer_housing" or mat_name != "RS_IzhmashPolyamide":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -16.1 <= tx <= 5.6 and -1.48 <= ty <= 2.48:
            if (nz > 0.72 and tz > 1.75) or (nz < -0.72 and tz < -1.75):
                return True
        return False

    def is_crimson(_obj_name: str, _face, mat_name: str) -> bool:
        return mat_name == "RS_CrimsonDot"

    def skip_main(obj_name: str, face, mat_name: str) -> bool:
        return is_hero_flank(obj_name, face, mat_name) or is_crimson(obj_name, face, mat_name)

    def skip_non_crimson(obj_name: str, face, mat_name: str) -> bool:
        return not is_crimson(obj_name, face, mat_name)

    _smart_unwrap_and_pack_rect(objs, 0.160, 0.990, 0.010, 0.470, skip_face_fn=skip_main)
    red_objs = [o for o in objs if o.name in {"an94_safety_switch", "an94_fire_selector"}]
    _smart_unwrap_and_pack_rect(red_objs, 0.010, 0.125, 0.010, 0.125, skip_face_fn=skip_non_crimson)

    oh = next(o for o in objs if o.name == "an94_outer_housing")
    bm = bmesh.new()
    bm.from_mesh(oh.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in oh.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_flank("an94_outer_housing", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 16.2) / 22.0))
            yn = max(0.0, min(1.0, (ty + 1.50) / 4.00))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.490 + yn * 0.240)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.745 + yn * 0.240)
    bm.to_mesh(oh.data)
    bm.free()


def unwrap_pulley_metal_atlas(objs: list[bpy.types.Object]):
    """Atlas 2 (`an94_v3_pulley_metal`, 10 parts):
      - Upper Hero Zone (Pulley Wheel, Braided Steel Cable, Bronze Feed Rammer, Rotating Bolt): u[0.012,0.988], v[0.520,0.988]
      - Lower Zone (Floating Inner Receiver, Bolt Carrier, Firing Pin, Hammer, Trigger, Guide): u[0.012,0.988], v[0.012,0.485]
    """
    hero_set = {"an94_pulley_wheel", "an94_steel_cable", "an94_feed_rammer", "an94_bolt"}
    hero_grp = [o for o in objs if o.name in hero_set]
    rest_grp = [o for o in objs if o.name not in hero_set]
    _smart_unwrap_and_pack_rect(hero_grp, 0.012, 0.988, 0.520, 0.988)
    _smart_unwrap_and_pack_rect(rest_grp, 0.012, 0.988, 0.012, 0.485)


def unwrap_barrel_mag_atlas(objs: list[bpy.types.Object]):
    """Atlas 3 (`an94_v3_barrel_mag`, 7 parts):
      - Hero Band 1 (15° Plum Mag Right Flank):        u[0.640,0.805], v[0.015,0.985]
      - Hero Band 2 (15° Plum Mag Left  Flank):        u[0.820,0.985], v[0.015,0.985]
      - Firewalled Safety-Orange Follower (>=80px moat): u[0.010,0.180], v[0.010,0.230]
      - Upper Left (405mm Barrel, Gas Tube, Figure-8): u[0.010,0.610], v[0.275,0.988]
      - Lower Mid (Mag Edges, Spring & Floorplate):    u[0.220,0.610], v[0.010,0.255]
    """
    def is_mag_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "an94_mag_body" or mat_name != "BM_PlumMagPolymer":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz, nz = -c.y, -n.y
        return (nz > 0.80 and 1.31 <= tz <= 1.375) or (nz < -0.80 and -1.375 <= tz <= -1.31)

    barrel_grp = [o for o in objs if o.name in {"an94_barrel", "an94_gas_tube", "an94_muzzle_brake"}]
    follower_grp = [o for o in objs if o.name == "an94_mag_follower"]
    mag_rest_grp = [o for o in objs if o.name in {"an94_mag_body", "an94_mag_spring", "an94_mag_floorplate"}]

    _smart_unwrap_and_pack_rect(barrel_grp, 0.010, 0.610, 0.275, 0.988)
    _smart_unwrap_and_pack_rect(follower_grp, 0.010, 0.180, 0.010, 0.230)
    _smart_unwrap_and_pack_rect(mag_rest_grp, 0.220, 0.610, 0.010, 0.255, skip_face_fn=is_mag_hero)

    # Polar-arc 1:1 distortion-free UV mapping on 5.45mm plum magazine flanks
    mag = next(o for o in objs if o.name == "an94_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    ang_span = AN94_MAG_ANG_END - AN94_MAG_ANG_START
    r_span = AN94_MAG_R_OUT - AN94_MAG_R_IN
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero("an94_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            dx, dy = AN94_MAG_ARC_CX - tx, AN94_MAG_ARC_CY - ty
            rad = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            r_n = max(0.0, min(1.0, (rad - AN94_MAG_R_IN) / r_span))
            a_n = max(0.0, min(1.0, (ang - AN94_MAG_ANG_START) / ang_span))
            v_val = 0.985 - a_n * 0.970
            u_val = (0.640 + (1.0 - r_n) * 0.165) if is_right else (0.820 + r_n * 0.165)
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(mag.data)
    bm.free()


# =============================================================================
# Cycles Metal GPU Multi-Channel Baking Engine
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
            emit.inputs["Color"].default_value = (val, val, val, 1.0) if isinstance(val, (int, float)) else tuple(val)
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        saved.append((nt, out, emit, orig_link))
    return saved


def _restore_bsdf(saved: list[tuple]):
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]):
    for i, o in enumerate(all_objs):
        o.location = (i * 80.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
            o.rotation_euler = (rx, -rz, ry)
        else:
            o.hide_render = True
            o.location = (0.0, 260.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object],
    all_objs: list[bpy.types.Object], tmp_dir: Path, bake_contact_ao: bool = True,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
                 normal_op: bool = False, extra_objs_override=None):
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

        kwargs = dict(type=bake_type, margin=6, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=8, fill_color=(0.04, 0.044, 0.05, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=8, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=8, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.65
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    if bake_contact_ao:
        _set_assembled_exterior_layout(all_objs)
        ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
        scene.world.light_settings.distance = 0.50
        run_bake("ao_ext", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

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
# Strict Manifold, Volume & CAD BBox Verification + Draco glTF 2.0 Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]):
    max_bbox_delta = 0.0
    total_tris = 0
    bad_parts = []
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        xs = [v.co.x for v in bm.verts]
        ys = [v.co.z for v in bm.verts]
        zs = [-v.co.y for v in bm.verts]
        bmin, bmax = (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()

        ref_min, ref_max = CSG_REF_BBOX[o.name]
        d_max = max([abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)])
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.25) else "WARN"
        print(f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} max_delta={d_max:.4f} cm")
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

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


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: Receiver & Stock (7 parts)
        "an94_outer_housing":  build_an94_outer_housing,
        "an94_dust_cover":     build_an94_dust_cover,
        "an94_buttstock":      build_an94_buttstock,
        "an94_pistol_grip":    build_an94_pistol_grip,
        "an94_rear_sight":     build_an94_rear_sight,
        "an94_safety_switch":  build_an94_safety_switch,
        "an94_fire_selector":  build_an94_fire_selector,
        # Suite 2: Pulley-Cable Floating Action & FCG (10 parts)
        "an94_inner_receiver": build_an94_inner_receiver,
        "an94_pulley_wheel":   build_an94_pulley_wheel,
        "an94_steel_cable":    build_an94_steel_cable,
        "an94_feed_rammer":    build_an94_feed_rammer,
        "an94_bolt_carrier":   build_an94_bolt_carrier,
        "an94_bolt":           build_an94_bolt,
        "an94_firing_pin":     build_an94_firing_pin,
        "an94_hammer":         build_an94_hammer,
        "an94_trigger":        build_an94_trigger,
        "an94_recoil_guide":   build_an94_recoil_guide,
        # Suite 3: 405mm Barrel, Gas Tube, Figure-8 Brake & 15° Plum Mag (7 parts)
        "an94_barrel":         build_an94_barrel,
        "an94_gas_tube":       build_an94_gas_tube,
        "an94_muzzle_brake":   build_an94_muzzle_brake,
        "an94_mag_body":       build_an94_mag_body,
        "an94_mag_follower":   build_an94_mag_follower,
        "an94_mag_spring":     build_an94_mag_spring,
        "an94_mag_floorplate": build_an94_mag_floorplate,
    }

    print("[BUILD] Sculpting all 24 solid Nikonov AN-94 'Abakan' hard-surface parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}

    recv_objs = [built[pid] for pid in RECEIVER_STOCK_PARTS]
    pulley_objs = [built[pid] for pid in PULLEY_METAL_PARTS]
    bmag_objs = [built[pid] for pid in BARREL_MAG_PARTS]
    all_objs = recv_objs + pulley_objs + bmag_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & CONCAVE-packing 3 dedicated 2K hero atlases: receiver_stock (7), pulley_metal (10), barrel_mag (7)...")
    unwrap_receiver_stock_atlas(recv_objs)
    unwrap_pulley_metal_atlas(pulley_objs)
    unwrap_barrel_mag_atlas(bmag_objs)

    for label, group in (("receiver_stock", recv_objs), ("pulley_metal", pulley_objs), ("barrel_mag", bmag_objs)):
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
            assert 0.00002 < oa < 0.72, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:15s}: total_uv_area={tot_area:.4f} (<= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="an94_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking an94_v3_receiver_stock (2048x2048, 7 hero chassis/stock/sight parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, bake_contact_ao=True)
        print("[CYCLES] Baking an94_v3_pulley_metal (2048x2048, 10 clockwork pulley/cable/rammer/BCG parts)...")
        bake_atlas_suite("pulley", pulley_objs, all_objs, tmp_dir, bake_contact_ao=False)
        print("[CYCLES] Baking an94_v3_barrel_mag (2048x2048, 7 barrel/figure-8 brake/15° plum mag parts)...")
        bake_atlas_suite("bmag", bmag_objs, all_objs, tmp_dir, bake_contact_ao=True)

        print("[POST] Compositing Izhmash Cyrillic rollmarks, ОД/2/АВ markings, plum mag embossing & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "an94_v3_receiver_stock_albedo.webp",
        TEX_OUT_DIR / "an94_v3_receiver_stock_normal.webp",
        TEX_OUT_DIR / "an94_v3_receiver_stock_roughness.webp",
        TEX_OUT_DIR / "an94_v3_pulley_metal_albedo.webp",
        TEX_OUT_DIR / "an94_v3_pulley_metal_normal.webp",
        TEX_OUT_DIR / "an94_v3_pulley_metal_roughness.webp",
        TEX_OUT_DIR / "an94_v3_barrel_mag_albedo.webp",
        TEX_OUT_DIR / "an94_v3_barrel_mag_normal.webp",
        TEX_OUT_DIR / "an94_v3_barrel_mag_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== NIKONOV AN-94 'ABAKAN' V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:44s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
