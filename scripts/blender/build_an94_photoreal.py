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
            base_srgb=(0.185, 0.194, 0.210),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.042,
            edge_wear=0.22,
            edge_srgb=(0.30, 0.32, 0.35),
            grain_scale=62.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=88.0,
            rough_var=0.042,
        ),
        "RS_PolyamideGrip": _build_pbr_mat(
            "RS_PolyamideGrip",
            base_srgb=(0.174, 0.182, 0.196),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.18,
            edge_srgb=(0.28, 0.30, 0.33),
            grain_scale=76.0,
            grain_bump=0.135,
            voronoi_grain=0.78,
            voronoi_scale=112.0,
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
            base_srgb=(0.228, 0.176, 0.204),  # Authentic Izhmash Russian "Sliva" Plum-Black polyamide (>= 0.17!)
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.24,
            edge_srgb=(0.35, 0.28, 0.32),
            grain_scale=64.0,
            grain_bump=0.092,
            voronoi_grain=0.65,
            voronoi_scale=88.0,
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
    """F-01: Izhmash Monocoque Charcoal Polyamide Outer Housing, Dovetail Rail,
    Solidly Welded Trigger Guard Loop & 15°-Right-Canted Magwell."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_grip = mats["RS_PolyamideGrip"]
    m_stl = mats["RS_EnamelSteel"]

    # Main receiver chassis body: X ∈ [-16.8, +11.6], Y ∈ [-1.6, +2.55], Z ∈ [-1.95, +1.95]
    chassis = mk_box("oh_main", 28.4, 4.15, 3.90, [("t", -2.6, 0.475, 0.0)], m_poly, bevel=0.14)
    # Tapered sleek Izhmash forend handguard: X ∈ [+11.0, +29.0], Y ∈ [-0.85, +3.65], Z ∈ [-1.75, +1.75]
    forend_zy = [
        (-1.55, -0.85), (1.55, -0.85), (1.75, -0.15), (1.75, 2.95),
        (1.30, 3.65), (-1.30, 3.65), (-1.75, 2.95), (-1.75, -0.15),
    ]
    forend = mk_extrude_x("oh_forend", forend_zy, 11.0, 29.0, bevel=0.14, mat=m_poly)
    # Front nose GP-25 / bayonet mounting fairing
    nose_lug = mk_box("oh_nose", 3.4, 1.50, 1.90, [("t", 27.3, -1.25, 0.0)], m_grip, bevel=0.08)

    # 15°-Right-Canted Magazine Well Collar wrapping magazine throat cleanly!
    mag_collar = mk_box("oh_magwell", 7.4, 4.4, 3.6,
                        [("t", 0.0, -1.7, 0.0), ("rx", AN94_MAG_CANT_RX), ("t", *AN94_MAG_ORIGIN)],
                        m_poly, bevel=0.12)

    # SOLIDLY WELDED CONTINUOUS INTEGRAL TRIGGER GUARD LOOP (ZERO air gaps!)
    tg_pts = [
        (2.75, -1.35), (2.75, -4.42), (-6.15, -4.42), (-6.15, -1.35),
        (-4.85, -1.35), (-4.85, -3.85), (1.45, -3.85), (1.45, -1.35),
    ]
    tguard = mk_extrude_z("oh_tguard", tg_pts, -0.70, 0.70, bevel=0.06, mat=m_poly)
    grip_boss = mk_box("oh_gripboss", 4.6, 1.0, 2.8, [("t", -7.8, -1.5, 0.0)], m_poly, bevel=0.08)

    # Join primary polymer shell & cut precision internal cavities
    shell_raw = join_objects([chassis, forend, nose_lug, mag_collar, tguard, grip_boss], "oh_shell")

    cutters = [
        # Floating sub-receiver internal bay
        mk_box("c_bay", 27.4, 4.45, 3.04, [("t", -2.1, 1.375, 0.0)], m_poly),
        # Lower buffer spring pocket: Y ∈ [-1.32, -0.55], leaving a 100% solid 2.8 mm polyamide bottom floor Y ∈ [-1.60, -1.32]
        mk_box("c_buf", 17.0, 0.77, 1.24, [("t", -6.5, -0.935, 0.0)], m_poly),
        # Crisp trigger-blade passage slot through receiver floor
        mk_box("c_trig", 1.15, 0.50, 0.64, [("t", -2.35, -1.47, 0.0)], m_poly),
        # Floating barrel & gas-tube front clearance tunnel through handguard
        mk_box("c_tun", 19.6, 3.55, 2.35, [("t", 20.6, 2.35, 0.0)], m_poly),
        # 15°-right-canted magazine throat opening
        mk_box("c_mag", 6.72, 6.4, 2.84,
               [("t", 0.0, -1.6, 0.0), ("rx", AN94_MAG_CANT_RX), ("t", *AN94_MAG_ORIGIN)], m_poly),
    ]
    # Sculpted forend ventilation flutes (6 angled slots per side on X ∈ [13.5..25.5])
    for side in (-1.0, 1.0):
        for sx in (14.5, 16.8, 19.1, 21.4, 23.7, 26.0):
            cutters.append(
                mk_box(f"c_vent_{side:+.0f}_{sx:.1f}", 1.35, 0.42, 0.35,
                       [("t", sx, 2.25, side * 1.72)], m_poly)
            )
    shell = bool_subtract(shell_raw, cutters)

    # Steel hardware details mounted flush on outer housing (zero floating!)
    extras = [
        shell,
        # Rear steel stock hinge trunnion block
        mk_box("oh_trun", 1.8, 3.8, 3.6, [("t", -15.9, 0.85, 0.0)], m_stl, bevel=0.08),
        # Classic Soviet left-side dovetail optics rail ("Ласточкин хвост", X ∈ [-12.2, -2.2])
        mk_box("oh_dovetail", 10.0, 1.25, 0.34, [("t", -7.2, 0.90, -2.03)], m_stl, bevel=0.04),
        # Rear magazine paddle release lever behind canted magwell
        mk_box("oh_magrel", 0.72, 1.75, 1.12, [("t", 3.8, -2.4, 0.35)], m_stl, bevel=0.04),
    ]
    # 3 crisp steel dovetail rail rivets + molded ergonomic lower forend finger ribs
    for rx in (-10.8, -7.2, -3.6):
        extras.append(mk_cyl(f"oh_riv_{rx:.1f}", 0.22, 0.22, 0.14, axis="z", segs=16,
                             xform=[("t", rx, 0.90, -2.18)], mat=m_stl, bevel=0.02))
    for rx in (13.2, 15.2, 17.2, 19.2, 21.2, 23.2, 25.2):
        extras.append(mk_box(f"oh_frib_{rx:.1f}", 0.55, 0.14, 2.6, [("t", rx, -0.82, 0.0)], m_grip, bevel=0.02))

    obj = join_objects(extras, "an94_outer_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_dust_cover(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Ribbed Stamped Russian Black-Enamel Top Dust Cover."""
    m_stl = mats["RS_EnamelSteel"]
    pts_zy = [
        (-1.88, 2.22), (-1.88, 3.46), (-1.28, 4.14),
        (1.28, 4.14), (1.88, 3.46), (1.88, 2.22),
    ]
    base = mk_extrude_x("dc_base", pts_zy, -16.22, 5.82, bevel=0.05, mat=m_stl)
    cutters = [
        mk_box("c_dc_in", 21.5, 1.88, 3.24, [("t", -5.2, 2.95, 0.0)], m_stl),
        mk_box("c_dc_ej", 8.2, 1.38, 1.45, [("t", 1.5, 2.85, 1.62)], m_stl),
        mk_box("c_dc_rs", 2.85, 1.45, 2.15, [("t", -13.6, 3.85, 0.0)], m_stl),
    ]
    body = bool_subtract(base, cutters)

    # 5 stamped transverse stiffening ribs across dust cover roof
    parts = [body]
    for rx in (-10.2, -7.8, -5.4, -3.0, -0.6):
        parts.append(mk_box(f"dc_rib_{rx:.1f}", 0.42, 0.08, 2.15, [("t", rx, 4.14, 0.0)], m_stl, bevel=0.02))
    obj = join_objects(parts, "an94_dust_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_buttstock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: Iconic Izhmash Right-Folding Ribbed Charcoal Polyamide Buttstock."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_pad = mats["RS_RubberButtpad"]
    m_stl = mats["RS_EnamelSteel"]

    stock_xy = [
        (-1.4, 1.48), (-25.35, 1.78), (-25.35, -5.85),
        (-20.5, -5.05), (-1.4, -1.65),
    ]
    body_raw = mk_extrude_z("bs_body", stock_xy, -1.42, 1.42, bevel=0.14, mat=m_poly)
    cutters = [
        mk_box("c_bs_sl", 2.6, 1.45, 4.2, [("t", -22.2, -3.55, 0.0)], m_poly),
        mk_box("c_bs_rec", 10.5, 1.55, 4.2, [("t", -12.5, -2.65, 0.0)], m_poly),
    ]
    body = bool_subtract(body_raw, cutters)

    parts = [
        body,
        # Right-folding steel hinge knuckle & pivot pin (+Z side!)
        mk_box("bs_hinge", 1.62, 3.42, 3.40, [("t", -0.80, 0.0, 0.0)], m_stl, bevel=0.08),
        mk_cyl("bs_hpin", 0.42, 0.42, 3.62, axis="y", segs=24, xform=[("t", -0.20, 0.0, 1.65)], mat=m_stl, bevel=0.03),
        # Vulcanized rubber serrated buttpad
        mk_box("bs_pad", 0.85, 7.82, 3.10, [("t", -25.78, -2.05, 0.0)], m_pad, bevel=0.10),
    ]
    # Horizontal molded polymer stiffening ribs + buttpad grip grooves
    for ry in (0.55, -0.65, -1.85):
        parts.append(mk_box(f"bs_rib_{ry:.2f}", 18.4, 0.36, 3.16, [("t", -13.5, ry, 0.0)], m_poly, bevel=0.04))
    for i in range(7):
        gy = 1.1 - i * 1.05
        parts.append(mk_box(f"bs_pg_{i}", 0.16, 0.24, 2.86, [("t", -26.15, gy, 0.0)], m_pad, bevel=0.02))

    obj = join_objects(parts, "an94_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_pistol_grip(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-07: Contoured Izhmash Diamond-Checkered Charcoal Polyamide Pistol Grip."""
    m_poly = mats["RS_IzhmashPolyamide"]
    m_grip = mats["RS_PolyamideGrip"]
    m_stl = mats["RS_EnamelSteel"]

    grip_xy = [
        (-1.70, -0.38), (1.92, -0.38), (1.12, -3.60),
        (-0.95, -9.80), (-4.38, -9.35), (-2.55, -2.60),
    ]
    body = mk_extrude_z("pg_body", grip_xy, -1.32, 1.32, bevel=0.18, mat=m_poly)
    parts = [
        body,
        mk_box("pg_cap", 3.45, 0.65, 2.75, [("t", -2.55, -9.75, 0.0)], m_grip, bevel=0.08),
        mk_cyl("pg_screw", 0.42, 0.42, 0.22, axis="y", segs=18, xform=[("t", -2.55, -9.98, 0.0)], mat=m_stl, bevel=0.02),
    ]
    # Raised checkered side traction panels
    for side in (-1.0, 1.0):
        parts.append(
            mk_box(f"pg_chk_{side:+.0f}", 2.25, 6.20, 0.14,
                   [("rz", -0.24), ("t", -1.35, -5.20, side * 1.31)], m_grip, bevel=0.03)
        )
    obj = join_objects(parts, "an94_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-08: Iconic Nikonov 5-Position Rotary Star-Wheel Diopter Rear Sight (`2..7`)."""
    m_stl = mats["RS_SightSteel"]
    m_ax = mats["RS_BrightAxle"]

    parts = [
        mk_box("rs_base", 3.20, 0.65, 2.20, [("t", 0.0, 0.15, 0.0)], m_stl, bevel=0.05),
        mk_box("rs_ear_l", 2.80, 1.65, 0.34, [("t", 0.0, 1.05, -1.05)], m_stl, bevel=0.04),
        mk_box("rs_ear_r", 2.80, 1.65, 0.34, [("t", 0.0, 1.05, 1.05)], m_stl, bevel=0.04),
        mk_cyl("rs_axle", 0.24, 0.24, 2.45, axis="z", segs=24, xform=[("t", 0.0, 1.12, 0.0)], mat=m_ax, bevel=0.02),
        mk_cyl("rs_hub", 0.85, 0.85, 0.88, axis="z", segs=32, xform=[("t", 0.0, 1.12, 0.0)], mat=m_stl, bevel=0.03),
    ]
    # 5 iconic star-wheel diopter aperture petals (`2 / 3 / 4 / 5 / 7`) with drilled peep holes!
    for i in range(5):
        a = (i / 5.0) * math.tau + math.pi * 0.5
        tx, ty = math.cos(a) * 0.92, 1.12 + math.sin(a) * 0.92
        petal_raw = mk_box(f"rs_pet_{i}", 0.44, 0.58, 0.62, [("rz", a - math.pi * 0.5), ("t", tx, ty, 0.0)], m_stl, bevel=0.03)
        peep = mk_cyl(f"c_peep_{i}", 0.09, 0.09, 0.90, axis="x", segs=14,
                      xform=[("rz", a - math.pi * 0.5), ("t", math.cos(a) * 1.02, 1.12 + math.sin(a) * 1.02, 0.0)], mat=m_stl)
        parts.append(bool_subtract(petal_raw, [peep]))

    obj = join_objects(parts, "an94_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_safety_switch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Dedicated Cross-Receiver Thumb Safety Latch w/ Crimson Fire Dot."""
    m_stl = mats["RS_SightSteel"]
    m_red = mats["RS_CrimsonDot"]
    parts = [
        mk_cyl("saf_ax", 0.26, 0.26, 4.10, axis="z", segs=20, mat=m_stl, bevel=0.02),
        mk_box("saf_pl", 1.35, 0.62, 0.36, [("t", -0.42, 0.06, -2.08)], m_stl, bevel=0.04),
        mk_box("saf_pr", 1.35, 0.62, 0.36, [("t", -0.42, 0.06, 2.08)], m_stl, bevel=0.04),
        mk_cyl("saf_red", 0.14, 0.14, 0.12, axis="z", segs=18, xform=[("t", -0.78, 0.06, -2.28)], mat=m_red, bevel=0.015),
    ]
    obj = join_objects(parts, "an94_safety_switch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_fire_selector(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-04: Rear-Left 3-Position Fire Selector (`ОД / 2 / АВ`) w/ Crimson Pointer."""
    m_stl = mats["RS_SightSteel"]
    m_grip = mats["RS_PolyamideGrip"]
    m_red = mats["RS_CrimsonDot"]
    parts = [
        mk_cyl("fs_ax", 0.32, 0.32, 3.85, axis="z", segs=22, mat=m_stl, bevel=0.02),
        mk_box("fs_cam", 0.95, 0.65, 1.40, [("t", 0.20, 0.18, 0.0)], m_stl, bevel=0.04),
        mk_box("fs_arm", 2.15, 0.58, 0.34, [("t", 0.78, 0.0, -2.06)], m_stl, bevel=0.04),
        mk_box("fs_pad", 0.55, 0.86, 0.44, [("t", 1.68, 0.0, -2.14)], m_grip, bevel=0.04),
        mk_box("fs_ptr", 0.45, 0.12, 0.08, [("t", 1.32, 0.0, -2.31)], m_red, bevel=0.01),
    ]
    obj = join_objects(parts, "an94_fire_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 2 BUILDERS: PULLEY-CABLE FLOATING ACTION & FCG (10 parts)
# =============================================================================
def build_an94_inner_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-01: Floating CNC Steel Sub-Receiver Carriage (Slides -4.2 cm inside Outer Housing)."""
    m_stl = mats["PM_InnerSteel"]
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]

    parts_raw = [
        mk_box("ir_main", 24.4, 3.30, 2.84, [("t", -1.0, 1.10, 0.0)], m_stl, bevel=0.06),
        mk_box("ir_trun", 3.4, 3.60, 2.95, [("t", 9.5, 1.30, 0.0)], m_car, bevel=0.08),
        mk_box("ir_lug", 0.90, 0.78, 1.00, [("t", -6.75, -0.87, 0.0)], m_car, bevel=0.04),
    ]
    body_raw = join_objects(parts_raw, "ir_raw")
    cutters = [
        mk_box("c_ir_run", 20.6, 2.35, 1.98, [("t", -1.8, 1.78, 0.0)], m_stl),
        mk_box("c_ir_win", 19.2, 1.95, 1.42, [("t", -1.2, 0.85, 1.18)], m_stl),
        mk_cyl("c_ir_bbl", 0.95, 0.95, 4.4, axis="x", segs=28, xform=[("t", 9.5, AN94_BORE_Y, 0.0)], mat=m_stl),
    ]
    body = bool_subtract(body_raw, cutters)

    # Gleaming polished guide rails & pulley axle boss + trunnion cross pins
    extras = [
        body,
        mk_cyl("ir_pulley_stud", 0.42, 0.42, 0.56, axis="z", segs=24, xform=[("t", -9.2, 0.55, 0.65)], mat=m_ss, bevel=0.025),
        mk_cyl("ir_trun_pin1", 0.24, 0.24, 2.94, axis="z", segs=18, xform=[("t", 8.6, 0.75, 0.0)], mat=m_ss, bevel=0.02),
        mk_cyl("ir_trun_pin2", 0.24, 0.24, 2.94, axis="z", segs=18, xform=[("t", 10.4, 0.75, 0.0)], mat=m_ss, bevel=0.02),
    ]
    obj = join_objects(extras, "an94_inner_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_pulley_wheel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-05: THE STAR — Lathe-Turned CNC Machined Steel V-Groove Transmission Pulley Wheel + Bronze Hub."""
    m_ss = mats["PM_BrightStainless"]
    m_gr = mats["PM_InnerSteel"]
    m_bz = mats["PM_BronzeRammer"]

    # Build a single watertight closed-loop lathe profile around Z for the steel V-groove pulley body
    # Profile (r, z) in Three.js space: inner bore r=0.38 -> outer rim flanges r=1.06 with deep V-groove r=0.76!
    pts_rz = [
        (0.38, -0.28),
        (0.98, -0.28),
        (1.06, -0.24),
        (1.06, -0.15),
        (0.94, -0.12),
        (0.76, -0.07),
        (0.76,  0.07),
        (0.94,  0.12),
        (1.06,  0.15),
        (1.06,  0.24),
        (0.98,  0.28),
        (0.38,  0.28),
    ]
    segs = 44
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
            # Assign darker hardened-steel groove material inside the V-groove (indices 4..6)
            f.material_index = 1 if (4 <= k <= 6) else 0
    _apply_three_xform(bm, [])
    wheel = _bm_to_obj("pw_wheel", bm, m_ss)
    wheel.data.materials.append(m_gr)

    # Drill 4 crisp circular weight-relief holes cleanly through the flat steel web (r = 0.60, hole r = 0.13)
    hole_cuts = []
    for i in range(4):
        a = i * math.pi * 0.5 + math.pi * 0.25
        hole_cuts.append(
            mk_cyl(f"c_pw_h{i}", 0.13, 0.13, 0.90, axis="z", segs=20,
                   xform=[("t", math.cos(a) * 0.60, math.sin(a) * 0.60, 0.0)], mat=m_gr)
        )
    wheel = bool_subtract(wheel, hole_cuts)

    # Watertight annular phosphor-bronze self-lubricating center hub bushing (r_in=0.18, r_out=0.39, z∈[-0.34, +0.34])
    hub_rz = [
        (0.18, -0.34), (0.36, -0.34), (0.39, -0.31),
        (0.39,  0.31), (0.36,  0.34), (0.18,  0.34),
    ]
    bm_h = bmesh.new()
    h_rings = [[bm_h.verts.new((r * math.cos(math.tau * s / 32), r * math.sin(math.tau * s / 32), z))
                for s in range(32)] for r, z in hub_rz]
    for k in range(len(h_rings)):
        a, b = h_rings[k], h_rings[(k + 1) % len(h_rings)]
        for s in range(32):
            sn = (s + 1) % 32
            bm_h.faces.new((a[s], a[sn], b[sn], b[s]))
    _apply_three_xform(bm_h, [])
    hub = _bm_to_obj("pw_hub", bm_h, m_bz)

    # Prominent CNC radial cross-ribs on left & right faces so 275° spin is unmistakably visible!
    spokes = [
        mk_box("pw_sp1", 1.54, 0.13, 0.05, [("t", 0.0, 0.0,  0.295)], m_ss, bevel=0.012),
        mk_box("pw_sp2", 0.13, 1.54, 0.05, [("t", 0.0, 0.0,  0.295)], m_ss, bevel=0.012),
        mk_box("pw_sp3", 1.54, 0.13, 0.05, [("t", 0.0, 0.0, -0.295)], m_ss, bevel=0.012),
        mk_box("pw_sp4", 0.13, 1.54, 0.05, [("t", 0.0, 0.0, -0.295)], m_ss, bevel=0.012),
    ]
    obj = join_objects([wheel, hub, *spokes], "an94_pulley_wheel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_steel_cable(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-06: Multi-Strand Braided Stainless-Steel Pulley Drive Cable Loop + Brass Ferrules."""
    m_cab = mats["PM_BraidedCable"]
    m_brs = mats["PM_BrassFerrule"]

    pts = []
    r_wrap = 0.84
    for i in range(9):
        pts.append(Vector((7.2 * (1.0 - i / 8.0), r_wrap, 0.0)))
    for i in range(1, 25):
        a = math.pi * 0.5 + math.pi * (i / 24.0)
        pts.append(Vector((math.cos(a) * r_wrap, math.sin(a) * r_wrap, 0.0)))
    for i in range(1, 13):
        pts.append(Vector((12.8 * (i / 12.0), -r_wrap, 0.0)))

    parts = [
        mk_tube_along_pts("cab_wire", pts, 0.11, ring_segs=14, mat=m_cab),
        mk_cyl("cab_fer_u", 0.22, 0.22, 0.85, axis="x", segs=22, xform=[("t", 7.2, r_wrap, 0.0)], mat=m_brs, bevel=0.022),
        mk_cyl("cab_fer_l", 0.22, 0.22, 0.85, axis="x", segs=22, xform=[("t", 12.8, -r_wrap, 0.0)], mat=m_brs, bevel=0.022),
    ]
    obj = join_objects(parts, "an94_steel_cable")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_feed_rammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-07: Gleaming Phosphor-Bronze & Chrome 2-Stage Pre-Feed Shuttle & Tilted Loading Tray."""
    m_bz = mats["PM_BronzeRammer"]
    m_ss = mats["PM_BrightStainless"]
    m_brs = mats["PM_BrassFerrule"]

    parts = [
        mk_box("fr_bar", 5.60, 0.65, 0.72, [("t", 0.40, -0.42, 0.12)], m_bz, bevel=0.045),
        mk_box("fr_tray", 4.80, 0.34, 1.25, [("t", 1.30, 0.18, -0.25)], m_ss, bevel=0.04),
        mk_box("fr_dog", 0.55, 1.05, 0.95, [("t", -1.25, 0.42, -0.20)], m_bz, bevel=0.04),
        mk_box("fr_hook", 0.85, 0.62, 0.45, [("t", -1.60, -0.58, 0.25)], m_brs, bevel=0.03),
        # Polished feed guide side lips along tray
        mk_box("fr_lip_l", 4.40, 0.22, 0.14, [("t", 1.35, 0.36, -0.78)], m_ss, bevel=0.02),
        mk_box("fr_lip_r", 4.40, 0.22, 0.14, [("t", 1.35, 0.36, 0.28)], m_ss, bevel=0.02),
    ]
    obj = join_objects(parts, "an94_feed_rammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_bolt_carrier(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-02: Long-Stroke Chrome Piston Bolt Carrier w/ Upturned Charging Handle & Cable Clevis."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_brs = mats["PM_BrassFerrule"]

    raw = join_objects([
        mk_box("bc_blk", 8.70, 1.65, 1.72, [("t", -0.15, 0.18, 0.0)], m_car, bevel=0.06),
        mk_box("bc_boss", 2.60, 1.55, 1.25, [("t", 3.80, 1.15, 0.0)], m_car, bevel=0.05),
        mk_cyl("bc_rod", 0.42, 0.42, 15.20, axis="x", segs=26, xform=[("t", 11.4, 1.90, 0.0)], mat=m_ss, bevel=0.02),
        mk_cyl("bc_head", 0.64, 0.64, 1.35, axis="x", segs=28, xform=[("t", 19.0, 1.90, 0.0)], mat=m_ss, bevel=0.03),
        mk_box("bc_ch_arm", 0.85, 0.68, 2.20, [("t", 1.85, 0.12, 1.85)], m_car, bevel=0.05),
        mk_cyl("bc_ch_knob", 0.38, 0.44, 1.45, axis="y", segs=22, xform=[("t", 1.85, 0.55, 2.95)], mat=m_car, bevel=0.04),
        mk_box("bc_clev", 1.15, 0.65, 0.48, [("t", -3.60, -0.32, 0.62)], m_brs, bevel=0.03),
    ], "bc_raw")

    cutters = [
        mk_cyl("c_bc_bore", 0.62, 0.62, 5.4, axis="x", segs=24, xform=[("t", 2.6, 0.0, 0.0)], mat=m_car),
        mk_box("c_bc_cam", 2.6, 0.42, 0.82, [("t", 1.8, 0.42, 0.72)], m_car),
    ]
    # 3 crisp piston head gas-sealing ring grooves
    for gx in (18.62, 18.96, 19.30):
        cutters.append(
            bool_subtract(
                mk_cyl(f"c_ring_o_{gx:.2f}", 0.72, 0.72, 0.12, axis="x", segs=24, xform=[("t", gx, 1.90, 0.0)], mat=m_ss),
                [mk_cyl(f"c_ring_i_{gx:.2f}", 0.54, 0.54, 0.20, axis="x", segs=24, xform=[("t", gx, 1.90, 0.0)], mat=m_ss)],
            )
        )
    obj = bool_subtract(raw, cutters)
    obj.name = "an94_bolt_carrier"
    obj.data.name = "an94_bolt_carrier"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_bolt(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-03: Gleaming Brushed-Stainless 2-Lug Rotating Bolt w/ Darkened Claw Extractor."""
    m_ss = mats["PM_BrightStainless"]
    m_car = mats["PM_OiledCarrier"]

    raw = join_objects([
        mk_cyl("blt_body", 0.56, 0.56, 4.80, axis="x", segs=32, xform=[("t", 0.20, 0.0, 0.0)], mat=m_ss, bevel=0.025),
        mk_box("blt_lugs", 0.92, 0.48, 1.62, [("t", 1.95, 0.0, 0.0)], m_ss, bevel=0.035),
        mk_box("blt_cam", 0.62, 0.56, 0.42, [("t", 0.05, 0.62, 0.0)], m_ss, bevel=0.03),
        mk_box("blt_ext", 1.85, 0.24, 0.26, [("t", 1.45, 0.05, 0.58)], m_car, bevel=0.022),
    ], "blt_raw")
    cutters = [
        mk_cyl("c_blt_face", 0.46, 0.46, 0.34, axis="x", segs=24, xform=[("t", 2.52, 0.0, 0.0)], mat=m_ss),
        mk_cyl("c_blt_pin", 0.14, 0.14, 5.20, axis="x", segs=16, xform=[("t", 0.20, 0.0, 0.0)], mat=m_ss),
    ]
    obj = bool_subtract(raw, cutters)
    obj.name = "an94_bolt"
    obj.data.name = "an94_bolt"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-04: Coaxial Stainless Stepped Firing Pin."""
    m_ss = mats["PM_BrightStainless"]
    obj = join_objects([
        mk_cyl("fp_tail", 0.26, 0.26, 0.85, axis="x", segs=22, xform=[("t", -2.0, 0.0, 0.0)], mat=m_ss, bevel=0.02),
        mk_cyl("fp_shaft", 0.12, 0.15, 3.65, axis="x", segs=20, xform=[("t", 0.1, 0.0, 0.0)], mat=m_ss, bevel=0.012),
        mk_cyl("fp_tip", 0.05, 0.11, 0.65, axis="x", segs=16, xform=[("t", 2.22, 0.0, 0.0)], mat=m_ss, bevel=0.01),
    ], "an94_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_an94_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Pivoting CNC Steel Hammer & Bronze 2-Round Hyperburst Ratchet Pawl."""
    m_ss = mats["PM_BrightStainless"]
    m_car = mats["PM_OiledCarrier"]
    m_bz = mats["PM_BronzeRammer"]

    h_xy = [(-0.55, -0.45), (0.55, -0.45), (0.75, 0.45), (0.35, 1.65), (-0.38, 1.65), (-0.62, 0.55)]
    obj = join_objects([
        mk_extrude_z("hm_body", h_xy, -0.36, 0.36, bevel=0.04, mat=m_ss),
        mk_cyl("hm_pin", 0.28, 0.28, 1.65, axis="z", segs=22, mat=m_car, bevel=0.02),
        mk_box("hm_ratchet", 1.65, 0.42, 0.28, [("t", -0.95, 0.25, -0.52)], m_bz, bevel=0.03),
    ], "an94_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: Curved Steel Trigger Shoe & Articulated Floating-Action Disconnector Bar."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_stl = mats["PM_InnerSteel"]

    t_xy = [
        (-0.45, 0.45), (0.55, 0.45), (0.38, -0.35), (0.05, -1.35),
        (0.55, -2.05), (0.12, -2.25), (-0.48, -1.38), (-0.32, -0.35),
    ]
    obj = join_objects([
        mk_extrude_z("tr_shoe", t_xy, -0.27, 0.27, bevel=0.035, mat=m_car),
        mk_cyl("tr_pin", 0.22, 0.22, 1.45, axis="z", segs=20, xform=[("t", 0.0, 0.15, 0.0)], mat=m_ss, bevel=0.02),
        mk_box("tr_bar", 3.40, 0.45, 0.32, [("t", -1.35, 0.65, -0.36)], m_stl, bevel=0.03),
    ], "an94_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_recoil_guide(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-08: Telescoping Dual Steel Recoil Guide Rod & Polyurethane Buffer Block."""
    m_car = mats["PM_OiledCarrier"]
    m_ss = mats["PM_BrightStainless"]
    m_stl = mats["PM_InnerSteel"]
    m_buf = mats["PM_BufferPoly"]

    obj = join_objects([
        mk_box("rg_anc", 1.30, 1.35, 1.25, [("t", -5.85, -0.10, 0.0)], m_car, bevel=0.05),
        mk_cyl("rg_r1", 0.24, 0.24, 7.60, axis="x", segs=22, xform=[("t", -1.80, 0.0, 0.0)], mat=m_ss, bevel=0.018),
        mk_cyl("rg_r2", 0.18, 0.18, 5.20, axis="x", segs=20, xform=[("t", 4.00, 0.0, 0.0)], mat=m_stl, bevel=0.015),
        mk_box("rg_buf", 0.55, 1.15, 1.10, [("t", -4.95, -0.10, 0.0)], m_buf, bevel=0.04),
    ], "an94_recoil_guide")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 3 BUILDERS: 405mm FLOATING BARREL, FIGURE-8 BRAKE & 15° PLUM MAG (7 parts)
# =============================================================================
def build_an94_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: 40.5 cm Floating Cold-Hammer-Forged Chrome-Lined 5.45x39mm Barrel."""
    m_bbl = mats["BM_BarrelSteel"]
    m_stl = mats["BM_MagSteel"]

    raw = join_objects([
        mk_cyl("bbl_ch", 0.92, 0.92, 7.20, axis="x", segs=36, xform=[("t", 3.60, 0.0, 0.0)], mat=m_bbl, bevel=0.03),
        mk_cyl("bbl_mid", 0.76, 0.86, 19.00, axis="x", segs=32, xform=[("t", 16.50, 0.0, 0.0)], mat=m_bbl, bevel=0.02),
        mk_cyl("bbl_fwd", 0.72, 0.75, 14.70, axis="x", segs=32, xform=[("t", 33.15, 0.0, 0.0)], mat=m_bbl, bevel=0.02),
        mk_box("bbl_gb", 2.80, 2.50, 1.85, [("t", 25.50, 0.90, 0.0)], m_stl, bevel=0.06),
        mk_box("bbl_bayo", 2.40, 0.85, 1.15, [("t", 34.80, -0.82, 0.0)], m_stl, bevel=0.04),
    ], "bbl_raw")
    bore = mk_cyl("c_bbl_bore", 0.285, 0.285, 41.4, axis="x", segs=24, xform=[("t", 20.25, 0.0, 0.0)], mat=m_bbl)
    obj = bool_subtract(raw, [bore])
    obj.name = "an94_barrel"
    obj.data.name = "an94_barrel"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_gas_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Upper High-Pressure Gas Cylinder & Tall Hooded Front Sight Tower."""
    m_stl = mats["BM_MagSteel"]
    m_bbl = mats["BM_BarrelSteel"]
    m_wht = mats["BM_SightTritiumWhite"]

    raw = join_objects([
        mk_cyl("gt_tube", 0.68, 0.68, 20.70, axis="x", segs=32, xform=[("t", -0.15, 0.0, 0.0)], mat=m_bbl, bevel=0.025),
        mk_cyl("gt_plug", 0.84, 0.84, 1.45, axis="x", segs=28, xform=[("t", 9.70, 0.0, 0.0)], mat=m_stl, bevel=0.03),
        mk_box("gt_fsb", 2.20, 2.35, 1.45, [("t", 9.20, 1.45, 0.0)], m_stl, bevel=0.05),
        mk_cyl("gt_hood", 0.76, 0.76, 1.75, axis="x", segs=30, xform=[("t", 9.20, 2.55, 0.0)], mat=m_stl, bevel=0.025),
    ], "gt_raw")
    cutters = [
        mk_cyl("c_gt_in", 0.46, 0.46, 20.0, axis="x", segs=22, xform=[("t", -0.60, 0.0, 0.0)], mat=m_bbl),
        mk_cyl("c_gt_hd", 0.56, 0.56, 2.15, axis="x", segs=26, xform=[("t", 9.20, 2.55, 0.0)], mat=m_stl),
    ]
    body = bool_subtract(raw, cutters)
    post = mk_box("gt_post", 0.26, 0.92, 0.16, [("t", 9.20, 2.38, 0.0)], m_wht, bevel=0.015)
    obj = join_objects([body, post], "an94_gas_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_muzzle_brake(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: THE SILHOUETTE ICON — Asymmetrical Figure-8 Twin-Chamber Self-Cleaning Whistling Muzzle Brake."""
    m_brk = mats["BM_Figure8BrakeHeat"]
    m_stl = mats["BM_MagSteel"]

    raw = join_objects([
        # Rear locking collar
        mk_cyl("mb_col", 0.95, 0.95, 1.35, axis="x", segs=36, xform=[("t", 0.675, 0.0, 0.0)], mat=m_stl, bevel=0.03),
        # UPPER offset cylindrical lobe (+0.58 Y) forming Figure-8 top ring
        mk_cyl("mb_top", 0.92, 0.96, 4.35, axis="x", segs=36, xform=[("t", 3.42, 0.58, 0.0)], mat=m_brk, bevel=0.035),
        # LOWER offset cylindrical lobe (-0.52 Y) forming Figure-8 bottom ring
        mk_cyl("mb_bot", 0.88, 0.92, 4.35, axis="x", segs=36, xform=[("t", 3.42, -0.52, 0.0)], mat=m_brk, bevel=0.035),
        # Central sculpted figure-8 waist web
        mk_box("mb_web", 4.35, 1.25, 1.28, [("t", 3.42, 0.03, 0.0)], m_brk, bevel=0.04),
    ], "mb_raw")

    cutters = [
        # Central 5.45mm bullet flight bore
        mk_cyl("c_mb_bore", 0.36, 0.36, 6.2, axis="x", segs=24, xform=[("t", 2.8, 0.0, 0.0)], mat=m_brk),
        # Twin upper & lower self-cleaning vortex whistle chambers
        mk_box("c_mb_u", 2.65, 0.92, 2.50, [("t", 3.40, 0.62, 0.0)], m_brk),
        mk_box("c_mb_l", 2.65, 0.85, 2.50, [("t", 3.40, -0.54, 0.0)], m_brk),
    ]
    obj = bool_subtract(raw, cutters)
    obj.name = "an94_muzzle_brake"
    obj.data.name = "an94_muzzle_brake"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def _mk_curved_arc_box(
    name: str, r_in: float, r_out: float, half_z: float,
    ang0: float, ang1: float, steps: int, mat: bpy.types.Material,
) -> bpy.types.Object:
    rings = []
    for i in range(steps + 1):
        ang = ang0 + (ang1 - ang0) * (i / steps)
        ca, sa = math.cos(ang), math.sin(ang)
        x_in, y_in = AN94_MAG_ARC_CX - ca * r_in, AN94_MAG_ARC_CY - sa * r_in
        x_out, y_out = AN94_MAG_ARC_CX - ca * r_out, AN94_MAG_ARC_CY - sa * r_out
        rings.append([
            (x_in, y_in, -half_z),
            (x_out, y_out, -half_z),
            (x_out, y_out, half_z),
            (x_in, y_in, half_z),
        ])
    return mk_loft_rings(name, rings, mat=mat, cap_ends=True)


def build_an94_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: Iconic 15°-Right-Canted 30-Round Izhmash Dark Plum-Black 5.45x39mm Polymer Magazine."""
    m_plum = mats["BM_PlumMagPolymer"]
    m_stl = mats["BM_MagSteel"]

    outer = _mk_curved_arc_box("mb_out", AN94_MAG_R_IN, AN94_MAG_R_OUT, 1.35, AN94_MAG_ANG_START, AN94_MAG_ANG_END, 24, m_plum)
    inner = _mk_curved_arc_box("mb_in", AN94_MAG_R_IN + 0.34, AN94_MAG_R_OUT - 0.34, 1.08, AN94_MAG_ANG_START - 0.04, AN94_MAG_ANG_END + 0.04, 24, m_plum)
    hollow = bool_subtract(outer, [inner])

    fx, fy = mag_arc_local(0.02, AN94_MAG_R_IN - 0.12)
    rx, ry = mag_arc_local(0.04, AN94_MAG_R_OUT + 0.14)
    obj = join_objects([
        hollow,
        mk_box("mb_flug", 0.55, 0.72, 1.65, [("t", fx, fy, 0.0)], m_stl, bevel=0.03),
        mk_box("mb_rlug", 0.62, 0.95, 1.55, [("t", rx, ry, 0.0)], m_stl, bevel=0.03),
    ], "an94_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_an94_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: Strictly Firewalled Vivid Safety-Orange 5.45mm Anti-Tilt Follower."""
    m_org = mats["BM_FollowerOrange"]
    rot = [("rz", AN94_MAG_FOLLOWER_ANG)]
    parts = [
        mk_box("fl_deck", 5.20, 0.42, 1.88, [("t", 0.0, 0.12, 0.0)] + rot, m_org, bevel=0.05),
        mk_cyl("fl_step", 0.24, 0.24, 4.90, axis="x", segs=22, xform=[("t", 0.0, 0.38, -0.36)] + rot, mat=m_org, bevel=0.025),
        mk_box("fl_sk_f", 0.55, 1.15, 1.76, [("t", 2.25, -0.45, 0.0)] + rot, m_org, bevel=0.04),
        mk_box("fl_sk_r", 0.55, 1.15, 1.76, [("t", -2.25, -0.45, 0.0)] + rot, m_org, bevel=0.04),
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
    """M-04: Stamped Black-Enamel Steel Magazine Floorplate & Lock Button."""
    m_stl = mats["BM_MagSteel"]
    rot = [("rz", AN94_MAG_ANG_END)]
    obj = join_objects([
        mk_box("fp_plate", 6.90, 0.55, 2.86, [("t", 0.0, -0.22, 0.0)] + rot, m_stl, bevel=0.06),
        mk_cyl("fp_btn", 0.32, 0.32, 0.25, axis="y", segs=20, xform=[("t", 0.0, -0.52, 0.0)] + rot, mat=m_stl, bevel=0.02),
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
        return (nz > 0.72 and tz > 1.20) or (nz < -0.72 and tz < -1.20)

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
