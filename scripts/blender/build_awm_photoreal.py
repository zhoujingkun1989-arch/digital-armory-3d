#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Accuracy International AWM (L115A3 · .338 Lapua Magnum)
========================================================================================================
MIT License — Digital Armory 3D (`PR-04` Wave 2)

Generates:
  - public/models/awm.glb (Draco-compressed glTF 2.0, all 23 solid parts; skips ONLY
    dynamic GPU-compressed helical spring `awm_firing_pin_spring` carrying `aSpringParam`)
  - public/textures/awm_v3_chassis_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/awm_v3_metal_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/awm_v3_optic_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 23 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/awm/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_awm_photoreal.py
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
# MODE 2: System Python Post-Process (AI Portsmouth Rollmarks, BNP Proofs,
#         S&B PM II 0..14 MIL Turrets, Multi-Coated Lens, .338 LM Mag & ORM)
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

    def _draw_british_bnp_crown(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """British Birmingham/London Proof House St. Edward's Crown over 'BNP' nitro proof stamp."""
        lw = max(2, round(r * 0.12))
        draw.rectangle((cx - r * 0.58, cy - r * 0.08, cx + r * 0.58, cy + r * 0.06), fill=255)
        draw.arc((cx - r * 0.62, cy - r * 0.58, cx + r * 0.04, cy + r * 0.02), 180, 360, fill=255, width=lw)
        draw.arc((cx - r * 0.04, cy - r * 0.58, cx + r * 0.62, cy + r * 0.02), 180, 360, fill=255, width=lw)
        draw.line([(cx, cy - r * 0.76), (cx, cy - r * 0.42)], fill=255, width=lw)
        draw.line([(cx - r * 0.16, cy - r * 0.62), (cx + r * 0.16, cy - r * 0.62)], fill=255, width=lw)
        f_bnp = _load_font(FONT_COND, max(12, round(r * 0.76)))
        draw.text((cx, cy + r * 0.46), "BNP", font=f_bnp, fill=255, anchor="mm")

    def _draw_ai_reticle(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Accuracy International precision crosshair/octagon crest."""
        lw = max(2, round(r * 0.12))
        draw.regular_polygon((cx, cy, r), 8, rotation=22.5, outline=255, width=lw)
        draw.ellipse((cx - r * 0.52, cy - r * 0.52, cx + r * 0.52, cy + r * 0.52), outline=255, width=max(1, lw - 1))
        for dx0, dy0, dx1, dy1 in (
            (-r * 1.15, 0, -r * 0.30, 0),
            (r * 0.30, 0, r * 1.15, 0),
            (0, -r * 1.15, 0, -r * 0.30),
            (0, r * 0.30, 0, r * 1.15),
        ):
            draw.line([(cx + dx0, cy + dy0), (cx + dx1, cy + dy1)], fill=255, width=lw)

    def process_chassis_atlas():
        """British Military OD-Green Thumbhole Chassis, Folding Stock, Cheekpiece, Buttpad & Orange Follower."""
        alb_lin = _read_f32_rgb(tmp_dir / "chassis_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "chassis_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "chassis_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "chassis_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "chassis_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "chassis_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "chassis_ext_mask.npy")[..., 0]

        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.12, 0.95)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_chassis_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_chassis_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_chassis_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved awm_v3_chassis_{albedo,normal,roughness}.webp (2048x2048)")

    def process_metal_atlas():
        """Flat-Sided Steel Action Receiver (AI Portsmouth Rollmarks + BNP Proofs), 27" Fluted Barrel,
        Dual-Chamber Muzzle Brake, 60-Deg 6-Lug Bolt, CNC Aluminum Spine Beam & Match Trigger Pack."""
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # Hero UV bands for Flat-Sided Steel Action Receiver (local X in [-5.305, +4.745], local Y in [-0.61, +0.56]):
        #   Left  Flat Wall (-Z): u in [0.015, 0.985] (1 - xNorm: +X muzzle on left), v in [0.820, 0.985]
        #   Right Flat Wall (+Z): u in [0.015, 0.985] (xNorm: -X rear on left),       v in [0.640, 0.805]
        # Note: Chassis skin upper skirt covers receiver lower wall below World Y = +0.78 (local Y = -0.27)!
        # Exposed flat receiver flank above OD-Green chassis skin is local Y in [-0.27, +0.56] (0.83 cm tall!).
        PPCM = 300.0
        RW, RH = int(round(10.05 * PPCM)), int(round(1.17 * PPCM))  # 3015 x 351 px

        def yloc_to_cy(yloc: float) -> int:
            return int(round((0.56 - yloc) / 1.17 * RH))

        def xloc_to_cx_left(xloc: float) -> int:
            return int(round((1.0 - (xloc + 5.305) / 10.05) * RW))

        def xloc_to_cx_right(xloc: float) -> int:
            return int(round(((xloc + 5.305) / 10.05) * RW))

        engraving = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT FLAT ACTION WALL (100% unobstructed above OD-green skin line Y_loc = -0.27!) ---
        # Left emergency gas relief port sits at X = +2.95, Y = +0.24 -> cx_left = 539, cy = 96.
        # Place AI Reticle + 3 crisp lines cleanly across X in [+2.45 .. -4.85] (cx_left in [688 .. 2880])
        # and Y_loc in [+0.44 .. -0.18] (cy in [36 .. 222]) — 100% clear of gas port & chassis skin!
        left_eng = Image.new("L", (RW, RH), 0)
        dl = ImageDraw.Draw(left_eng)

        _draw_ai_reticle(dl, xloc_to_cx_left(2.05), yloc_to_cy(0.14), r=56)
        x_txt = xloc_to_cx_left(1.48)
        dl.text((x_txt, yloc_to_cy(0.45)), "ACCURACY INTERNATIONAL", font=_load_font(FONT_DIN, 74), fill=255)
        dl.text((x_txt, yloc_to_cy(0.16)), "PORTSMOUTH  ENGLAND  -  AW  .338 LAPUA MAG", font=_load_font(FONT_DIN, 54), fill=255)
        dl.text((x_txt, yloc_to_cy(-0.06)), "L115A3   /   SER. NO.  GB 09-4418", font=_load_font(FONT_COND, 50), fill=245)
        _draw_british_bnp_crown(dl, xloc_to_cx_left(-4.25), yloc_to_cy(0.14), r=62)

        _paste_uv_band(engraving, left_eng, 0.015, 0.985, 0.820, 0.985)

        # --- 2) RIGHT FLAT ACTION WALL (cleanly avoiding ejection port [-1.55..+2.85, Y>-0.08] & bolt notch!) ---
        # Front receiver ring slab: X in [+3.05..+4.55], Y in [-0.20..+0.48] -> BNP proof + .338 LM!
        # Rear receiver bridge slab: X in [-3.65..-1.68], Y in [-0.22..+0.48] -> AI PORTSMOUTH UK!
        right_eng = Image.new("L", (RW, RH), 0)
        dr = ImageDraw.Draw(right_eng)

        rx_rear = xloc_to_cx_right(-3.55)
        dr.text((rx_rear, yloc_to_cy(0.42)), "AI  PORTSMOUTH", font=_load_font(FONT_DIN, 52), fill=255)
        dr.text((rx_rear, yloc_to_cy(0.18)), "ENGLAND  -  L115A3", font=_load_font(FONT_COND, 48), fill=250)
        dr.text((rx_rear, yloc_to_cy(-0.04)), "GB 09-4418", font=_load_font(FONT_COND, 44), fill=240)

        # Front right receiver ring: Crown BNP proof + CAL .338 LM
        _draw_british_bnp_crown(dr, xloc_to_cx_right(3.82), yloc_to_cy(0.24), r=52)
        dr.text((xloc_to_cx_right(3.82), yloc_to_cy(-0.10)), ".338 LM", font=_load_font(FONT_DIN, 44), fill=255, anchor="mm")

        _paste_uv_band(engraving, right_eng, 0.015, 0.985, 0.640, 0.805)

        # Subtle oil-wiped handling micro-scratches along action flat flanks
        action_walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.820) & (v_grid <= 0.985)) | ((v_grid >= 0.640) & (v_grid <= 0.805))
        )).astype(np.float32)
        rng = np.random.default_rng(3381)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(95):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.015, 0.36) * h)
            length = float(rng.uniform(16, 72))
            ang = math.radians(float(rng.uniform(-12, 12)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng.integers(70, 185)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * action_walls
        _mix(albedo, (0.56, 0.59, 0.63), sc * 0.24)
        rgh -= sc * 0.06
        met = np.clip(met + sc * 0.10, 0.02, 0.98)

        # Composite razor-crisp laser-engraved Portsmouth steel rollmarks (bright bare steel sheen in recessed cut!)
        eng_bev = _bevel_mask(engraving, width_px=1.5)
        decal_height = -0.72 * eng_bev - 0.04 * sc
        _mix(albedo, (0.72, 0.75, 0.79), engraving * 0.80)
        _mix(rgh, 0.36, engraving * 0.75)
        _mix(met, 0.92, engraving * 0.75)
        ao *= 1.0 - 0.14 * engraving

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.11, 0.92)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved awm_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    def process_optic_atlas():
        """S&B PM II 5-25x56 Scope (0..14 MIL Turrets, Tube Markings, Firewalled Sapphire-Emerald Coated Lenses),
        AI One-Piece 34mm Scope Mount, Parker-Hale Folding Bipod & 5-Rd .338 LM Steel Box Magazine."""
        alb_lin = _read_f32_rgb(tmp_dir / "optic_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "optic_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "optic_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "optic_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "optic_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "optic_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "optic_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        white_ink = np.zeros((h, w), dtype=np.float32)
        mag_stamp = np.zeros((h, w), dtype=np.float32)

        # --- 1) S&B PM II DOUBLE-TURN ELEVATION TURRET 0..14 MIL VERNIER SCALE ---
        # Hero Band 1: u in [0.015, 0.680], v in [0.830, 0.985] (circumference ~4.35 cm x height 0.56 cm)
        TW, TH = 2200, 320
        tur_im = Image.new("L", (TW, TH), 0)
        dt = ImageDraw.Draw(tur_im)
        y_base = 286
        x_pad = 32
        span_x = TW - 2 * x_pad
        dt.line([(x_pad, y_base), (TW - x_pad, y_base)], fill=255, width=4)
        f_mil = _load_font(FONT_COND, 74)
        for k in range(140):
            xk = round(x_pad + (k / 140.0) * span_x)
            th_px = 68 if k % 10 == 0 else (44 if k % 5 == 0 else 24)
            lw_k = 5 if k % 10 == 0 else 3
            dt.line([(xk, y_base - th_px), (xk, y_base)], fill=255, width=lw_k)
            if k % 10 == 0:
                dt.text((xk, y_base - 112), str(k // 10), font=f_mil, fill=255, anchor="mm")
        dt.text(
            (TW // 2, 68),
            "1 CLICK = 0.1 MRAD   |   UP / CCW   |   DOUBLE TURN (DT)",
            font=_load_font(FONT_COND, 44),
            fill=245,
            anchor="mm",
        )
        _paste_uv_band(white_ink, tur_im, 0.015, 0.680, 0.830, 0.985)

        # --- 2) S&B PM II 5-25x56 OBJECTIVE BELL & OCULAR TUBE MARKINGS ---
        # Right flank: u in [0.015, 0.680], v in [0.710, 0.815] (local X in [-9.9, +9.9])
        # Left  flank: u in [0.015, 0.680], v in [0.595, 0.700]
        SW, SH = 3960, 420
        sc_r = Image.new("L", (SW, SH), 0)
        ds_r = ImageDraw.Draw(sc_r)
        # Objective bell X in [+5.6..+9.6] -> x_px in [3100..3900]; smooth ocular tube X in [-9.20..-7.25] -> [140..530]
        ds_r.text((3490, 155), "SCHMIDT & BENDER", font=_load_font(FONT_DIN, 78), fill=255, anchor="mm")
        ds_r.text((3490, 250), "PM II  5-25×56  LP/MTC/LT", font=_load_font(FONT_COND, 64), fill=245, anchor="mm")
        # Magnification index numerals strictly inside smooth ocular housing [-9.15..-7.35] (zero overlap w/ zoom ribs!)
        ds_r.text((335, 210), "5  7  10  15  20  25×", font=_load_font(FONT_COND, 54), fill=255, anchor="mm")
        _paste_uv_band(white_ink, sc_r, 0.015, 0.680, 0.710, 0.815)

        sc_l = Image.new("L", (SW, SH), 0)
        ds_l = ImageDraw.Draw(sc_l)
        # Left flank has u reversed (muzzle +X on left -> x_px in [80..860]; smooth ocular at [3430..3820])
        ds_l.text((470, 155), "SCHMIDT & BENDER", font=_load_font(FONT_DIN, 78), fill=255, anchor="mm")
        ds_l.text((470, 250), "MADE IN GERMANY  -  5-25×56", font=_load_font(FONT_COND, 62), fill=245, anchor="mm")
        ds_l.text((3625, 210), "25×  20  15  10  7  5", font=_load_font(FONT_COND, 54), fill=255, anchor="mm")
        _paste_uv_band(white_ink, sc_l, 0.015, 0.680, 0.595, 0.700)

        # --- 3) FIREWALLED MULTI-COATED SAPPHIRE-EMERALD OPTICAL LENSES (Objective + Ocular) ---
        # Front 56mm Objective Lens: u in [0.710, 0.890], v in [0.805, 0.985] (center = 0.800, 0.895; r = 0.086)
        # Rear Ocular Lens:          u in [0.900, 0.985], v in [0.900, 0.985] (center = 0.9425, 0.9425; r = 0.040)
        # Back Hemispheres:          u in [0.900, 0.985], v in [0.805, 0.890] (dark inner optical glass)
        lens_box = (u_grid >= 0.705) & (u_grid <= 0.990) & (v_grid >= 0.800) & (v_grid <= 0.990)
        # Fill entire firewalled lens zone with dark anti-reflection base first
        albedo[lens_box] = (0.016, 0.068, 0.095)
        rgh[lens_box] = 0.05
        met[lens_box] = 0.14
        ao[lens_box] = 1.0
        nrm[lens_box] = (0.5, 0.5, 1.0)

        for cx_l, cy_l, r_l, u0_l, u1_l, v0_l, v1_l in (
            (0.8000, 0.8950, 0.086, 0.706, 0.894, 0.801, 0.989),
            (0.9425, 0.9425, 0.040, 0.896, 0.989, 0.896, 0.989),
        ):
            sub_m = (u_grid >= u0_l) & (u_grid <= u1_l) & (v_grid >= v0_l) & (v_grid <= v1_l)
            lu = (u_grid - cx_l) / r_l
            lv = (v_grid - cy_l) / r_l
            rad = np.hypot(lu, lv)
            # German Schott broadband emerald-green + sapphire-blue + subtle warm amber thin-film interference!
            coat_wave = 0.5 + 0.5 * np.cos(6.8 * rad * rad + 0.55 * lv - 0.35 * lu)
            amber_rim = _smoothstep(0.62, 0.94, rad) * (1.0 - _smoothstep(0.94, 1.18, rad))
            lens_rgb = (
                np.array((0.022, 0.118, 0.205), dtype=np.float32)
                + coat_wave[..., None] * np.array((0.025, 0.295, 0.150), dtype=np.float32)
                + amber_rim[..., None] * np.array((0.195, 0.115, 0.032), dtype=np.float32)
            )
            lens_rgb *= 1.0 - 0.50 * _smoothstep(0.78, 1.16, rad)[..., None]
            arc1 = (1.0 - _smoothstep(0.018, 0.055, np.abs(rad - 0.72))) * _smoothstep(0.10, 0.45, lv) * (1.0 - _smoothstep(-0.18, 0.25, lu))
            arc2 = (1.0 - _smoothstep(0.016, 0.048, np.abs(rad - 0.46))) * _smoothstep(-0.55, -0.20, lv) * _smoothstep(0.05, 0.42, lu)
            lens_rgb += arc1[..., None] * np.array((0.42, 0.78, 0.70), dtype=np.float32)
            lens_rgb += arc2[..., None] * np.array((0.20, 0.46, 0.60), dtype=np.float32)
            albedo[sub_m] = np.clip(lens_rgb[sub_m], 0.0, 1.0)

        # --- 4) 5-ROUND .338 LAPUA MAGNUM STEEL BOX MAGAZINE STAMP & INSERTION WEAR ---
        # Right flank: u in [0.710, 0.985], v in [0.460, 0.685]
        # Left  flank: u in [0.710, 0.985], v in [0.220, 0.445]
        MW, MH = 1264, 888  # 6.32 x 4.44 cm @ 200 px/cm
        mag_im = Image.new("L", (MW, MH), 0)
        dm = ImageDraw.Draw(mag_im)
        # Place cleanly in lower floorplate skirt (below 3D corrugation ribs!)
        dm.text((MW // 2, int(MH * 0.905)), "AI  -  .338 LAPUA MAG  -  5 RD", font=_load_font(FONT_COND, 62), fill=255, anchor="mm")
        _paste_uv_band(mag_stamp, mag_im, 0.710, 0.985, 0.460, 0.685)
        _paste_uv_band(mag_stamp, mag_im, 0.710, 0.985, 0.220, 0.445)

        # Realistic vertical magwell insertion scuffs on upper magazine insertion section
        mag_insert = (
            (u_grid >= 0.710) & (u_grid <= 0.985)
            & (((v_grid >= 0.595) & (v_grid <= 0.685)) | ((v_grid >= 0.355) & (v_grid <= 0.445)))
        ).astype(np.float32)
        rng = np.random.default_rng(3382)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(340):
            sx = float(rng.uniform(0.714, 0.981) * w)
            sy = float(rng.uniform(0.315, 0.645) * h)
            length = float(rng.uniform(12, 68))
            dsc.line([(sx, sy), (sx + float(rng.uniform(-2.0, 2.0)), sy + length)],
                     fill=int(rng.integers(75, 210)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * mag_insert

        # Composite white enamel scope graduations & markings
        ink_bev = _bevel_mask(white_ink, width_px=1.1)
        stamp_bev = _bevel_mask(mag_stamp, width_px=1.4)
        decal_height = -0.20 * ink_bev - 0.62 * stamp_bev - 0.05 * scuffs

        _mix(albedo, (0.91, 0.92, 0.90), white_ink * 0.96)
        _mix(rgh, 0.36, white_ink * 0.90)
        _mix(met, 0.04, white_ink * 0.96)
        ao *= 1.0 - 0.05 * white_ink

        _mix(albedo, (0.68, 0.71, 0.75), mag_stamp * 0.78)
        _mix(rgh, 0.36, mag_stamp * 0.70)
        _mix(met, 0.92, mag_stamp * 0.72)
        ao *= 1.0 - 0.14 * mag_stamp

        _mix(albedo, (0.64, 0.67, 0.71), scuffs * 0.56)
        _mix(rgh, 0.21, scuffs * 0.65)
        _mix(met, 0.95, scuffs * 0.70)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)
        # Keep optical lenses optically smooth!
        nrm_final[lens_box] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.05, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_optic_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_optic_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "awm_v3_optic_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved awm_v3_optic_{albedo,normal,roughness}.webp (2048x2048)")

    process_chassis_atlas()
    process_metal_atlas()
    process_optic_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "awm.glb"
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


# Exact 23 solid Accuracy International AWM parts across 3 dedicated 2048x2048 hero suites
# (skipping ONLY dynamic GPU-compressed helical spring `awm_firing_pin_spring`!)
CHASSIS_PARTS = [
    "awm_chassis_skins",
    "awm_folding_stock",
    "awm_cheekpiece",
    "awm_buttpad_spacers",
    "awm_mag_follower",
]

METAL_PARTS = [
    "awm_action_receiver",
    "awm_barrel",
    "awm_muzzle_brake",
    "awm_bolt_body",
    "awm_bolt_shroud",
    "awm_striker",
    "awm_extractor",
    "awm_chassis_beam",
    "awm_trigger_box",
    "awm_sear",
    "awm_trigger_shoe",
    "awm_mag_catch",
]

OPTIC_PARTS = [
    "awm_scope",
    "awm_scope_mount",
    "awm_bipod",
    "awm_mag_body",
    "awm_mag_spring",
    "awm_mag_floorplate",
]

# Exterior parts receiving assembled inter-part contact AO (moving/internal parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "awm_chassis_skins",
    "awm_folding_stock",
    "awm_cheekpiece",
    "awm_buttpad_spacers",
    "awm_action_receiver",
    "awm_barrel",
    "awm_muzzle_brake",
    "awm_scope",
    "awm_scope_mount",
    "awm_bipod",
    "awm_mag_body",
    "awm_mag_floorplate",
}

ASSEMBLED_POS = {
    "awm_scope":           (  1.700,  3.420, 0.000),
    "awm_scope_mount":     ( -0.400,  2.820, 0.000),
    "awm_bolt_body":       (  0.000,  1.050, 0.000),
    "awm_bolt_shroud":     ( -5.180,  1.050, 0.000),
    "awm_striker":         ( -1.150,  1.050, 0.000),
    "awm_extractor":       (  0.000,  1.050, 0.000),
    "awm_chassis_skins":   (  0.000,  0.000, 0.000),
    "awm_chassis_beam":    (  0.000,  0.000, 0.000),
    "awm_action_receiver": (  0.000,  1.050, 0.000),
    "awm_barrel":          (  0.000,  1.050, 0.000),
    "awm_muzzle_brake":    ( 29.500,  1.050, 0.000),
    "awm_folding_stock":   ( -9.200,  0.000, 0.000),
    "awm_cheekpiece":      (-14.100,  1.350, 0.000),
    "awm_buttpad_spacers": (-19.500, -1.760, 0.000),
    "awm_bipod":           ( 14.400, -0.350, 0.000),
    "awm_trigger_box":     ( -3.050, -0.650, 0.000),
    "awm_sear":            ( -3.150,  0.180, 0.000),
    "awm_trigger_shoe":    ( -2.950, -1.250, 0.000),
    "awm_mag_catch":       ( -1.920, -1.950, 0.000),
    "awm_mag_body":        (  1.350, -1.850, 0.000),
    "awm_mag_follower":    (  1.350, -3.520, 0.000),
    "awm_mag_spring":      (  1.350, -3.820, 0.000),
    "awm_mag_floorplate":  (  1.350, -4.200, 0.000),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) from src/weapons/awm/meshes/*.ts
CSG_REF_BBOX = {
    "awm_scope":           (( -9.9000, -1.1200, -1.5600), (10.0700,  1.8400,  1.5800)),
    "awm_scope_mount":     (( -3.4500, -0.7500, -1.0900), ( 3.4500,  1.5400,  1.0900)),
    "awm_bolt_body":       (( -5.3200, -1.2900, -0.5972), ( 2.9200,  0.6013,  2.2868)),
    "awm_bolt_shroud":     (( -1.2000, -0.6600, -0.7200), ( 0.8400,  0.5500,  0.4600)),
    "awm_striker":         (( -5.2200, -0.6800, -0.2550), ( 3.9600,  0.2550,  0.2550)),
    "awm_extractor":       ((  0.5200,  0.0100,  0.2747), ( 3.0000,  0.2300,  0.5150)),
    "awm_chassis_skins":   (( -9.2700, -5.2200, -0.9100), (13.8700,  0.9500,  0.9100)),
    "awm_chassis_beam":    (( -9.4700, -3.4900, -1.1500), (14.8900,  0.4200,  0.5900)),
    "awm_action_receiver": (( -5.3050, -1.1300, -0.7800), ( 4.7450,  1.2100,  0.7800)),
    "awm_barrel":          ((  2.8448, -0.7400, -0.7400), (29.0000,  0.7400,  0.7400)),
    "awm_muzzle_brake":    (( -1.5000, -0.6730, -0.8400), ( 1.5000,  0.6730,  0.8400)),
    "awm_folding_stock":   ((-10.3600, -4.4646, -1.1600), ( 0.2757,  0.9400,  0.9600)),
    "awm_cheekpiece":      (( -3.2250, -1.1400, -0.8123), ( 2.6250,  0.7823,  0.9800)),
    "awm_buttpad_spacers": (( -1.5100, -2.6300, -0.7600), ( 0.0500,  2.6300,  0.7600)),
    "awm_bipod":           (( -0.6200, -4.7050, -2.8400), ( 2.4498,  0.4400,  2.8400)),
    "awm_trigger_box":     (( -1.1900, -0.8300, -0.4100), ( 1.2900,  0.9100,  0.4100)),
    "awm_sear":            (( -0.7600, -0.5700, -0.1400), ( 0.7600,  0.4500,  0.1400)),
    "awm_trigger_shoe":    (( -0.3100, -1.1507, -0.1680), ( 0.2744,  0.2500,  0.2100)),
    "awm_mag_catch":       (( -0.2459, -0.7153, -0.4700), ( 0.2500,  0.5700,  0.4700)),
    "awm_mag_body":        (( -3.3200, -2.3500, -0.6820), ( 3.3100,  2.0900,  0.6820)),
    "awm_mag_follower":    (( -2.9200, -0.5100, -0.4800), ( 2.9200,  0.2700,  0.4800)),
    "awm_mag_spring":      (( -2.4139, -0.2240, -0.3938), ( 2.4140,  0.2239,  0.3940)),
    "awm_mag_floorplate":  (( -3.4400, -0.2200, -0.7100), ( 3.4400,  0.1000,  0.7100)),
}


# =============================================================================
# Scene & Physically Calibrated British OD-Green x Gunmetal Material Library
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
    bevel_r: float = 0.036,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.76, 0.78, 0.82),
    grain_scale: float = 36.0,
    grain_bump: float = 0.032,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
    rough_var: float = 0.050,
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
    n_macro.inputs["Scale"].default_value = 4.20
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.54
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
        min(1.0, base_srgb[0] * 1.032),
        min(1.0, base_srgb[1] * 1.032),
        min(1.0, base_srgb[2] * 1.032),
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
    rgh_val_node.inputs["To Min"].default_value = max(0.05, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        # Tight Cycles inside-AO convexity mask (zero Pointiness triangle smudges on OD-green skins & flat action walls!)
        ao_in = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_in.samples = 8
        ao_in.inside = True
        ao_in.only_local = True
        ao_in.inputs["Distance"].default_value = 0.046

        inv_ao = nt.nodes.new("ShaderNodeMath")
        inv_ao.operation = "SUBTRACT"
        inv_ao.inputs[0].default_value = 1.0
        nt.links.new(ao_in.outputs["AO"], inv_ao.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.26
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.66
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(inv_ao.outputs["Value"], ramp.inputs["Fac"])

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


def _build_muzzle_brake_heat_soot_mat() -> bpy.types.Material:
    """AI Two-Chamber Tactical Muzzle Brake: satin-matte manganese-phosphated exterior
    with realistic bronze/violet heat-temper along baffle splitters and velvety black
    gunpowder carbon soot inside both blast chambers and exit crown!"""
    mat = bpy.data.materials.new("M_BrakeHeatSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X in [-1.50 .. +1.50] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.82
    mr_x.inputs["From Max"].default_value = 1.50
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 5.4
    n_soot.inputs["Detail"].default_value = 6.0
    n_soot.inputs["Roughness"].default_value = 0.68
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    # Exterior flat slabs stay satin phosphated; heat & carbon concentrate around baffle ports & forward half!
    # In Blender space: Z = Three.js Y (top/bottom slabs at |Z| > 0.56). Keep top/bottom flatter slabs cleaner!
    abs_z = nt.nodes.new("ShaderNodeMath")
    abs_z.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Z"], abs_z.inputs[0])

    mr_slab = nt.nodes.new("ShaderNodeMapRange")
    mr_slab.clamp = True
    mr_slab.inputs["From Min"].default_value = 0.44
    mr_slab.inputs["From Max"].default_value = 0.64
    mr_slab.inputs["To Min"].default_value = 1.0
    mr_slab.inputs["To Max"].default_value = 0.30
    nt.links.new(abs_z.outputs["Value"], mr_slab.inputs["Value"])

    mul_zone = nt.nodes.new("ShaderNodeMath")
    mul_zone.operation = "MULTIPLY"
    nt.links.new(mr_x.outputs["Result"], mul_zone.inputs[0])
    nt.links.new(mr_slab.outputs["Result"], mul_zone.inputs[1])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.24
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mul_zone.outputs["Value"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.178, 0.186, 0.198)
    cr.elements[1].position = 0.34
    cr.elements[1].color = srgb_to_lin(0.192, 0.198, 0.212)
    for pos, rgb in (
        (0.54, (0.37, 0.25, 0.145)),    # golden-bronze .338 LM blast heat temper
        (0.70, (0.17, 0.205, 0.295)),   # heat-blued baffle tint
        (0.88, (0.068, 0.066, 0.068)),  # matte black carbon baffle soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.45
    rr.elements[0].color = (0.28, 0.28, 0.28, 1.0)
    rr.elements[1].position = 0.90
    rr.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.68
    rm.elements[0].color = (0.86, 0.86, 0.86, 1.0)
    rm.elements[1].position = 0.92
    rm.elements[1].color = (0.14, 0.14, 0.14, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.044
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: CHASSIS ATLAS (awm_v3_chassis) ---
        # Iconic British Military Olive-Drab (`OD Green`) textured fiberglass-polyamide chassis
        "C_ODGreenChassis": _build_pbr_mat(
            "C_ODGreenChassis",
            base_srgb=(0.208, 0.252, 0.162),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.18,
            edge_srgb=(0.295, 0.338, 0.236),
            grain_scale=68.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=104.0,
            rough_var=0.044,
        ),
        # High-relief molded EDM stipple panels on pistol grip & forend flanks
        "C_ODGreenGrip": _build_pbr_mat(
            "C_ODGreenGrip",
            base_srgb=(0.188, 0.230, 0.148),
            roughness=0.78,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.14,
            edge_srgb=(0.278, 0.318, 0.224),
            grain_scale=80.0,
            grain_bump=0.165,
            voronoi_grain=0.82,
            voronoi_scale=132.0,
            rough_var=0.032,
        ),
        "C_MatteBlackKydex": _build_pbr_mat(
            "C_MatteBlackKydex",
            base_srgb=(0.120, 0.126, 0.136),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.040,
            edge_wear=0.24,
            edge_srgb=(0.235, 0.245, 0.260),
            grain_scale=62.0,
            grain_bump=0.092,
            voronoi_grain=0.66,
            voronoi_scale=88.0,
            rough_var=0.048,
        ),
        "C_SorbothaneRubber": _build_pbr_mat(
            "C_SorbothaneRubber",
            base_srgb=(0.095, 0.099, 0.106),
            roughness=0.89,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.12,
            edge_srgb=(0.165, 0.172, 0.182),
            grain_scale=60.0,
            grain_bump=0.095,
            rough_var=0.036,
        ),
        "C_AlloySpacer": _build_pbr_mat(
            "C_AlloySpacer",
            base_srgb=(0.215, 0.226, 0.242),
            roughness=0.31,
            metallic=0.84,
            bevel_r=0.022,
            edge_wear=0.36,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=46.0,
            grain_bump=0.032,
            rough_var=0.034,
        ),
        "C_DarkHardware": _build_pbr_mat(
            "C_DarkHardware",
            base_srgb=(0.182, 0.190, 0.204),
            roughness=0.27,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.46,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=48.0,
            grain_bump=0.034,
            voronoi_grain=0.45,
            voronoi_scale=76.0,
            rough_var=0.036,
        ),
        "C_BrightStainless": _build_pbr_mat(
            "C_BrightStainless",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.018,
            edge_wear=0.20,
            edge_srgb=(0.91, 0.93, 0.96),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "C_FollowerOrange": _build_pbr_mat(
            "C_FollowerOrange",
            base_srgb=(0.88, 0.35, 0.09),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.16,
            edge_srgb=(0.96, 0.54, 0.26),
            grain_scale=38.0,
            grain_bump=0.028,
            rough_var=0.038,
        ),

        # --- SUITE 2: METAL / ACTION / BARREL / BOLT / BEAM / FCG ATLAS (awm_v3_metal) ---
        "M_ActionSteel": _build_pbr_mat(
            "M_ActionSteel",
            base_srgb=(0.198, 0.206, 0.220),
            roughness=0.30,
            metallic=0.85,
            bevel_r=0.026,
            edge_wear=0.26,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=72.0,
            grain_bump=0.030,
            voronoi_grain=0.46,
            voronoi_scale=96.0,
            rough_var=0.022,
        ),
        "M_RailCrest": _build_pbr_mat(
            "M_RailCrest",
            base_srgb=(0.214, 0.224, 0.240),
            roughness=0.26,
            metallic=0.87,
            bevel_r=0.018,
            edge_wear=0.32,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=36.0,
            grain_bump=0.022,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.026,
        ),
        "M_SlotDark": _build_pbr_mat(
            "M_SlotDark",
            base_srgb=(0.092, 0.096, 0.104),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
        "M_AnodizedBeam": _build_pbr_mat(
            "M_AnodizedBeam",
            base_srgb=(0.248, 0.262, 0.282),
            roughness=0.27,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=40.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 3.4, 3.4),
            rough_var=0.028,
        ),
        # Bead-blasted satin match stainless barrel (refined muted silver, zero AgX white-chrome blowout!)
        "M_StainlessBarrel": _build_pbr_mat(
            "M_StainlessBarrel",
            base_srgb=(0.50, 0.525, 0.558),
            roughness=0.27,
            metallic=0.92,
            bevel_r=0.022,
            edge_wear=0.22,
            edge_srgb=(0.76, 0.79, 0.83),
            grain_scale=46.0,
            grain_bump=0.024,
            aniso_stretch=(5.4, 0.45, 0.45),
            rough_var=0.026,
        ),
        # Deeper milled satin-steel longitudinal flute valleys so all 6 barrel flutes pop razor-sharp under AgX!
        "M_StainlessFlute": _build_pbr_mat(
            "M_StainlessFlute",
            base_srgb=(0.33, 0.352, 0.386),
            roughness=0.35,
            metallic=0.90,
            bevel_r=0.016,
            edge_wear=0.16,
            edge_srgb=(0.62, 0.65, 0.70),
            grain_scale=34.0,
            grain_bump=0.022,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.024,
        ),
        "M_ChromeBolt": _build_pbr_mat(
            "M_ChromeBolt",
            base_srgb=(0.79, 0.81, 0.85),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.020,
            edge_wear=0.22,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=26.0,
            grain_bump=0.018,
            aniso_stretch=(0.40, 3.4, 3.4),
            rough_var=0.022,
        ),
        "M_BoltFluteSatin": _build_pbr_mat(
            "M_BoltFluteSatin",
            base_srgb=(0.50, 0.53, 0.58),
            roughness=0.26,
            metallic=0.94,
            bevel_r=0.018,
            grain_scale=34.0,
            grain_bump=0.024,
            aniso_stretch=(0.40, 3.2, 3.2),
            rough_var=0.026,
        ),
        "M_BrakeHeatSoot": _build_muzzle_brake_heat_soot_mat(),
        "M_BrakeBaffleSoot": _build_pbr_mat(
            "M_BrakeBaffleSoot",
            base_srgb=(0.088, 0.080, 0.075),
            roughness=0.80,
            metallic=0.22,
            bevel_r=0.016,
            grain_scale=52.0,
            grain_bump=0.055,
            rough_var=0.055,
        ),
        "M_BoltKnobPhenolic": _build_pbr_mat(
            "M_BoltKnobPhenolic",
            base_srgb=(0.112, 0.118, 0.126),
            roughness=0.58,
            metallic=0.06,
            bevel_r=0.028,
            edge_wear=0.24,
            edge_srgb=(0.24, 0.25, 0.27),
            grain_scale=54.0,
            grain_bump=0.068,
            voronoi_grain=0.55,
            voronoi_scale=84.0,
            rough_var=0.042,
        ),
        "M_ParkerizedCtrl": _build_pbr_mat(
            "M_ParkerizedCtrl",
            base_srgb=(0.196, 0.204, 0.218),
            roughness=0.28,
            metallic=0.87,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.72, 0.75, 0.80),
            grain_scale=52.0,
            grain_bump=0.030,
            voronoi_grain=0.42,
            voronoi_scale=80.0,
            rough_var=0.028,
        ),
        "M_GoldBrass": _build_pbr_mat(
            "M_GoldBrass",
            base_srgb=(0.78, 0.62, 0.24),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.014,
            grain_scale=30.0,
            grain_bump=0.018,
            rough_var=0.025,
        ),
        "M_SafetyRed": _build_pbr_mat(
            "M_SafetyRed",
            base_srgb=(0.84, 0.12, 0.11),
            roughness=0.34,
            metallic=0.04,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.012,
            rough_var=0.022,
        ),
        "M_SafetyWhite": _build_pbr_mat(
            "M_SafetyWhite",
            base_srgb=(0.91, 0.92, 0.94),
            roughness=0.36,
            metallic=0.02,
            bevel_r=0.010,
            grain_scale=24.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),

        # --- SUITE 3: OPTIC, MOUNT, BIPOD & .338 LM MAG ATLAS (awm_v3_optic) ---
        "O_ScopeAnodize": _build_pbr_mat(
            "O_ScopeAnodize",
            base_srgb=(0.158, 0.165, 0.178),
            roughness=0.27,
            metallic=0.82,
            bevel_r=0.022,
            edge_wear=0.22,
            edge_srgb=(0.66, 0.69, 0.74),
            grain_scale=68.0,
            grain_bump=0.022,
            voronoi_grain=0.36,
            voronoi_scale=94.0,
            rough_var=0.020,
        ),
        "O_ScopeTurretKnurl": _build_pbr_mat(
            "O_ScopeTurretKnurl",
            base_srgb=(0.194, 0.204, 0.220),
            roughness=0.26,
            metallic=0.86,
            bevel_r=0.016,
            edge_wear=0.30,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=42.0,
            grain_bump=0.022,
            rough_var=0.026,
        ),
        "O_ScopeRubber": _build_pbr_mat(
            "O_ScopeRubber",
            base_srgb=(0.095, 0.098, 0.105),
            roughness=0.85,
            metallic=0.00,
            bevel_r=0.026,
            grain_scale=64.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=96.0,
            rough_var=0.035,
        ),
        "O_DTYellow": _build_pbr_mat(
            "O_DTYellow",
            base_srgb=(0.90, 0.72, 0.08),
            roughness=0.26,
            metallic=0.04,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.012,
            rough_var=0.020,
        ),
        "O_CoatedLens": _build_pbr_mat(
            "O_CoatedLens",
            base_srgb=(0.035, 0.24, 0.22),
            roughness=0.05,
            metallic=0.14,
            bevel_r=0.004,
            grain_scale=12.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "O_MountAlloy": _build_pbr_mat(
            "O_MountAlloy",
            base_srgb=(0.184, 0.194, 0.208),
            roughness=0.29,
            metallic=0.85,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.72, 0.75, 0.80),
            grain_scale=58.0,
            grain_bump=0.028,
            voronoi_grain=0.40,
            voronoi_scale=84.0,
            rough_var=0.028,
        ),
        "O_BipodSteel": _build_pbr_mat(
            "O_BipodSteel",
            base_srgb=(0.178, 0.186, 0.200),
            roughness=0.31,
            metallic=0.87,
            bevel_r=0.022,
            edge_wear=0.28,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=50.0,
            grain_bump=0.032,
            voronoi_grain=0.44,
            voronoi_scale=80.0,
            rough_var=0.030,
        ),
        "O_MagSteel": _build_pbr_mat(
            "O_MagSteel",
            base_srgb=(0.198, 0.208, 0.222),
            roughness=0.31,
            metallic=0.86,
            bevel_r=0.022,
            edge_wear=0.24,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=62.0,
            grain_bump=0.032,
            voronoi_grain=0.46,
            voronoi_scale=92.0,
            rough_var=0.024,
        ),
        "O_BrightStainless": _build_pbr_mat(
            "O_BrightStainless",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.016,
            edge_wear=0.20,
            edge_srgb=(0.91, 0.93, 0.96),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "O_SpringSteel": _build_pbr_mat(
            "O_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.015,
            rough_var=0.024,
        ),
        "O_SlotDark": _build_pbr_mat(
            "O_SlotDark",
            base_srgb=(0.088, 0.092, 0.100),
            roughness=0.54,
            metallic=0.70,
            bevel_r=0.014,
            grain_scale=36.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface Modeling Toolkit
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


def _quad_bez(p0, p1, p2, segs: int = 10):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _cubic_bez(p0, p1, p2, p3, segs: int = 14):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def _catmull_rom_pts(ctrl: list[Vector], samples_per_seg: int = 8) -> list[Vector]:
    """Smooth Catmull-Rom 3D curve interpolation matching THREE.CatmullRomCurve3."""
    n = len(ctrl)
    assert n >= 2
    pts = []
    for i in range(n - 1):
        p0 = ctrl[max(0, i - 1)]
        p1 = ctrl[i]
        p2 = ctrl[i + 1]
        p3 = ctrl[min(n - 1, i + 2)]
        steps = samples_per_seg
        for s in range(steps + (1 if i == n - 2 else 0)):
            t = s / steps
            t2 = t * t
            t3 = t2 * t
            pt = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            pts.append(pt)
    return pts


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


def mk_sphere(
    name: str, rx: float, ry: float, rz: float,
    u_segs: int = 24, v_segs: int = 16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_capsule_x(
    name: str, radius: float, cyl_len: float,
    segs: int = 18, cap_rings: int = 5,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight ball-endmill capsule aligned along Three.js X axis (total length = cyl_len + 2*radius)."""
    half = cyl_len * 0.5
    pts = []
    for i in range(cap_rings + 1):
        ang = -math.pi * 0.5 + (math.pi * 0.5) * (i / cap_rings)
        pts.append((max(0.0, radius * math.cos(ang)), -half + radius * math.sin(ang)))
    for i in range(cap_rings + 1):
        ang = (math.pi * 0.5) * (i / cap_rings)
        pts.append((max(0.0, radius * math.cos(ang)), half + radius * math.sin(ang)))
    return mk_lathe_x(name, pts, segs=segs, xform=xform, mat=mat)


def mk_torus(
    name: str, major_r: float, minor_r: float, axis: str = "x",
    major_segs: int = 32, minor_segs: int = 14,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
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
            ring.append(bm.verts.new((r * cu, r * su, minor_r * sv)))
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
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 44,
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


def _clean_poly2d(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    clean = []
    for p in pts:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()
    return clean


def _offset_poly2d_outward(pts_ccw: list[tuple[float, float]], offset: float) -> list[tuple[float, float]]:
    """Outward miter-clamped 2D polygon offset for CCW polygon (used for smooth hourglass window chamfers!)."""
    n = len(pts_ccw)
    out = []
    for i in range(n):
        p_prev = pts_ccw[(i - 1) % n]
        p_curr = pts_ccw[i]
        p_next = pts_ccw[(i + 1) % n]
        e1x, e1y = p_curr[0] - p_prev[0], p_curr[1] - p_prev[1]
        e2x, e2y = p_next[0] - p_curr[0], p_next[1] - p_curr[1]
        l1 = max(1e-7, math.hypot(e1x, e1y))
        l2 = max(1e-7, math.hypot(e2x, e2y))
        # Outward normal for CCW edge (dx, dy) is (dy, -dx)
        n1x, n1y = e1y / l1, -e1x / l1
        n2x, n2y = e2y / l2, -e2x / l2
        bx, by = n1x + n2x, n1y + n2y
        bl = math.hypot(bx, by)
        if bl < 1e-5:
            nx, ny = n1x, n1y
            scale = offset
        else:
            nx, ny = bx / bl, by / bl
            denom = max(0.45, nx * n1x + ny * n1y)
            scale = min(offset / denom, offset * 1.65)
        out.append((p_curr[0] + nx * scale, p_curr[1] + ny * scale))
    return out


def mk_flared_cutout_z(
    name: str, pts_xy: list[tuple[float, float]],
    z_half_inner: float, flare: float = 0.085, flare_depth: float = 0.14,
    z_overhang: float = 0.25,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight C2 cosine-eased hourglass lofted cutout solid along Z so boolean-subtracting it from
    a chassis skin automatically carves silky ergonomic radiused lips around thumbholes & stock windows!"""
    base = _clean_poly2d(pts_xy)
    z_out = z_half_inner + z_overhang
    z_f0 = max(0.10, z_half_inner - flare_depth)
    # 5-step smooth quarter-circle fillet curve on both +-Z faces
    fillet_steps = 5
    stations: list[tuple[float, float]] = [(-z_out, flare * 1.15)]
    for k in range(fillet_steps + 1):
        th = (math.pi * 0.5) * (k / fillet_steps)
        z_v = -z_f0 - flare_depth * math.cos(th)
        off_v = flare * (1.0 - math.sin(th))
        stations.append((z_v, off_v))
    for k in range(fillet_steps + 1):
        th = (math.pi * 0.5) * (k / fillet_steps)
        z_v = z_f0 + flare_depth * math.sin(th)
        off_v = flare * (1.0 - math.cos(th))
        stations.append((z_v, off_v))
    stations.append((z_out, flare * 1.15))
    bm = bmesh.new()
    rings = []
    for z_val, off in stations:
        poly = base if abs(off) < 1e-6 else _offset_poly2d_outward(base, off)
        rings.append([bm.verts.new((p[0], p[1], z_val)) for p in poly])
    n = len(base)
    for k in range(len(rings) - 1):
        ra, rb = rings[k], rings[k + 1]
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((ra[i], ra[ni], rb[ni], rb[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = _clean_poly2d(pts_xy)
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
    clean = _clean_poly2d(pts_zy)
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


def mk_extrude_y(
    name: str, pts_xz: list[tuple[float, float]], y0: float, y1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = _clean_poly2d(pts_xz)
    bm = bmesh.new()
    v_bot = [bm.verts.new((p[0], y0, p[1])) for p in clean]
    v_top = [bm.verts.new((p[0], y1, p[1])) for p in clean]
    bm.faces.new(v_bot)
    bm.faces.new(list(reversed(v_top)))
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_bot[i], v_top[i], v_top[ni], v_bot[ni]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 14,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    scale_yz: tuple[float, float] = (1.0, 1.0),
) -> bpy.types.Object:
    """Watertight capped tube swept along a 3D polyline in Three.js space."""
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
            off = (n_vec * (math.cos(th) * scale_yz[0]) + b_vec * (math.sin(th) * scale_yz[1])) * radius
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


def mk_coil_spring(
    name: str, axis: str, start: float, end: float,
    center_a: float, center_b: float, coil_r: float, wire_r: float, coils: float,
    ring_segs: int = 8, steps_per_coil: int = 16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
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
    return mk_tube_along_pts(name, pts, wire_r, ring_segs=ring_segs, xform=xform, mat=mat)


def mk_helical_lands(
    name: str, count: int, bore_r: float, height: float, half_ang: float,
    x0: float, x1: float, twist: float, segs: int = 12, phase: float = 0.15,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight raised helical rifling lands inside a bore along +X."""
    r_in = bore_r - height
    r_out = bore_r + 0.005
    bm = bmesh.new()
    for l_idx in range(count):
        base = phase + (l_idx * 2.0 * math.pi) / count
        rings = []
        for s in range(segs + 1):
            x = x0 + (x1 - x0) * (s / segs)
            ang = base + twist * (x - x0)
            a0, a1 = ang - half_ang, ang + half_ang
            v0 = bm.verts.new((x, math.cos(a0) * r_in, math.sin(a0) * r_in))
            v1 = bm.verts.new((x, math.cos(a1) * r_in, math.sin(a1) * r_in))
            v2 = bm.verts.new((x, math.cos(a1) * r_out, math.sin(a1) * r_out))
            v3 = bm.verts.new((x, math.cos(a0) * r_out, math.sin(a0) * r_out))
            rings.append((v0, v1, v2, v3))
        for s in range(segs):
            ra, rb = rings[s], rings[s + 1]
            for k in range(4):
                kn = (k + 1) % 4
                bm.faces.new((ra[k], ra[kn], rb[kn], rb[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 24, depth: float = 0.022,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """True 3D fluted/knurled cylinder with crisp chamfered end caps."""
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.018, length * 0.16, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.85 - bev * 0.8),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.85 - bev * 0.8),
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


def mk_allen_socket_bolt(
    name: str, head_r: float, head_len: float, side_sign: float,
    x: float, y: float, z: float,
    mat_head: bpy.types.Material, mat_dark: bpy.types.Material,
) -> bpy.types.Object:
    """Recessed cylindrical M5/M6 Allen socket-head cap screw oriented along Z."""
    head = mk_cyl(f"{name}_hd", head_r, head_r, head_len, "z", 18,
                  [("t", x, y, z)], mat_head, bevel=head_r * 0.14)
    hex_cut = mk_cyl(f"{name}_hx", head_r * 0.56, head_r * 0.52, head_len * 0.72, "z", 6,
                     [("t", x, y, z + side_sign * head_len * 0.30)], mat_dark)
    return bool_subtract(head, [hex_cut], solver="EXACT")


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


def bool_union(objs: list[bpy.types.Object], name: str, solver: str = "EXACT") -> bpy.types.Object:
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
    degen = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degen:
        bmesh.ops.delete(bm, geom=degen, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    flat_rad = math.radians(12.0)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = e.calc_face_angle(0.0)
            is_flat_wall_edge = False
            if lock_flat_walls and ang > flat_rad:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                if (abs(f0.normal.y) > 0.985 or abs(f1.normal.y) > 0.985) and (
                    f0.calc_area() > 0.08 or f1.calc_area() > 0.08
                ):
                    is_flat_wall_edge = True
            e.smooth = (ang < angle_rad) and (not is_flat_wall_edge)
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    if weighted_normals:
        select_only([obj], obj)
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 100
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


# =============================================================================
# 23 AAA HARD-SURFACE ACCURACY INTERNATIONAL AWM PART BUILDERS
# =============================================================================

# --- SUITE 1: CHASSIS ATLAS (5 PARTS: OD-GREEN SKINS, STOCK, CHEEK, BUTTPAD, FOLLOWER) ---

def build_awm_chassis_skins(mats: dict) -> bpy.types.Object:
    m_od = mats["C_ODGreenChassis"]
    m_gr = mats["C_ODGreenGrip"]
    m_hw = mats["C_DarkHardware"]
    m_sl = mats["C_SorbothaneRubber"]

    # Iconic Accuracy International AWM Thumbhole Outer Silhouette (X in [-9.20, +13.80], Y in [-5.15, +0.88])
    outer_pts: list[tuple[float, float]] = [
        (-9.20,  0.88),
        (-5.05,  0.88),
        (-4.72,  0.56),
        (-3.65,  0.56),
        (-3.35,  0.78),
        ( 4.72,  0.78),
        ( 5.15,  0.64),
        (13.55,  0.58),
        (13.80,  0.25),
        (13.80, -0.88),
        (13.45, -1.18),
        ( 4.92, -1.18),
        ( 4.62, -1.85),
        (-1.88, -1.85),
        (-2.08, -2.85),
        (-4.05, -2.85),
    ]
    # Swept-back ergonomic sniper pistol grip front strap
    outer_pts += _cubic_bez((-4.05, -2.85), (-4.22, -3.45), (-4.48, -4.35), (-4.75, -5.15), 14)
    outer_pts.append((-6.05, -5.15))
    outer_pts += _cubic_bez((-6.05, -5.15), (-7.15, -5.05), (-8.25, -4.65), (-8.85, -4.40), 12)
    outer_pts.append((-9.20, -4.40))

    raw_skin = mk_extrude_z("skin_raw", outer_pts, -0.895, 0.895, bevel=0.115, bevel_segs=5, mat=m_od)

    # Sculpted 3D ergonomic palm-swell bolsters on left & right pistol-grip flanks (zero flat-box look!)
    swell_l = mk_sphere("skin_swell_l", 0.74, 1.42, 0.21, 32, 20,
                        [("rz", -0.26), ("t", -5.08, -2.95, -0.71)], m_gr)
    swell_r = mk_sphere("skin_swell_r", 0.74, 1.42, 0.21, 32, 20,
                        [("rz", -0.26), ("t", -5.08, -2.95,  0.71)], m_gr)
    # Slightly raised tactile molded EDM grip inlay pads on forend flanks (between fuller & underside)
    fpad_l = mk_box("skin_fpad_l", 5.80, 0.54, 0.06, [("t", 8.95, -0.68, -0.880)], m_gr, bevel=0.025, bevel_segs=3)
    fpad_r = mk_box("skin_fpad_r", 5.80, 0.54, 0.06, [("t", 8.95, -0.68,  0.880)], m_gr, bevel=0.025, bevel_segs=3)
    skin_body = bool_union([raw_skin, swell_l, swell_r, fpad_l, fpad_r], "skin_body", solver="EXACT")

    # 1. C2 Smooth Hourglass-Beveled AI Enclosed Teardrop Thumbhole Cutout (silky ergonomic radiused rim!)
    th_pts: list[tuple[float, float]] = [(-5.55, -0.58)]
    th_pts += _cubic_bez((-5.55, -0.58), (-5.68, -1.65), (-5.92, -2.95), (-6.15, -3.98), 18)
    th_pts += _cubic_bez((-6.15, -3.98), (-6.72, -4.12), (-7.45, -3.95), (-7.95, -3.68), 14)
    th_pts += _cubic_bez((-7.95, -3.68), (-8.18, -2.65), (-8.18, -1.45), (-7.92, -0.62), 16)
    th_pts += _cubic_bez((-7.92, -0.62), (-7.25, -0.38), (-6.22, -0.38), (-5.55, -0.58), 14)
    cut_thumb = mk_flared_cutout_z("c_thumbhole", th_pts, z_half_inner=0.90, flare=0.115, flare_depth=0.22, mat=m_od)

    # 2. C2 Smooth Hourglass-Beveled Oversized Arctic Trigger Guard Cutout (rounded comfort corners!)
    tg_pts: list[tuple[float, float]] = [(-2.22, -1.32), (-2.24, -2.30)]
    tg_pts += _quad_bez((-2.24, -2.30), (-2.25, -2.48), (-2.44, -2.48), 8)
    tg_pts.append((-3.64, -2.48))
    tg_pts += _quad_bez((-3.64, -2.48), (-3.84, -2.48), (-3.86, -2.30), 8)
    tg_pts.append((-3.94, -1.32))
    tg_pts += _quad_bez((-3.94, -1.32), (-3.95, -1.24), (-3.82, -1.24), 6)
    tg_pts.append((-2.34, -1.24))
    tg_pts += _quad_bez((-2.34, -1.24), (-2.21, -1.24), (-2.22, -1.32), 6)
    cut_trig_win = mk_flared_cutout_z("c_trigwin", tg_pts, z_half_inner=0.90, flare=0.088, flare_depth=0.18, mat=m_od)

    # 3. Internal structural channels & exterior molded grooves / counterbores
    cutters: list[bpy.types.Object] = [
        cut_thumb,
        cut_trig_win,
        # Internal CNC spine beam pocket
        mk_box("c_spine", 22.90, 1.35, 1.12, [("t", 2.35, -0.18, 0.0)], m_od),
        # Rear bolt shroud clearance channel
        mk_box("c_shroud", 4.60, 0.95, 0.98, [("t", -7.10, 0.72, 0.0)], m_od),
        # Free-float 27" barrel U-channel (R = 0.82 at Y = 1.05 -> generous visible free-float gap!)
        mk_cyl("c_bblch", 0.82, 0.82, 10.20, "x", 32, [("t", 9.10, 1.05, 0.0)], m_od),
        # Front Parker-Hale bipod spigot bore
        mk_cyl("c_spig", 0.36, 0.36, 1.80, "x", 22, [("t", 13.50, -0.35, 0.0)], m_od),
        # Flat-sided steel action receiver bedding recess
        mk_box("c_act", 10.15, 1.60, 1.38, [("t", -0.28, 0.65, 0.0)], m_od),
        # Long-action .338 LM magwell & trigger cassette pockets
        mk_box("c_magw", 6.42, 3.20, 1.32, [("t", 1.35, -0.95, 0.0)], m_od),
        mk_box("c_trigp", 2.55, 2.35, 0.86, [("t", -2.95, -0.92, 0.0)], m_od),
        # Twin rounded capsule molded forend fuller channels (catching crisp top/bottom shadow lines!)
        mk_capsule_x("c_fulR", 0.135, 7.45, 16, 4, [("t", 9.20, -0.14,  0.94)], m_od),
        mk_capsule_x("c_fulL", 0.135, 7.45, 16, 4, [("t", 9.20, -0.14, -0.94)], m_od),
        # Authentic two-piece injection-molding centerline seam grooves (underside forend & bridge)
        mk_box("c_seam1", 8.60, 0.08, 0.045, [("t", 9.20, -1.24, 0.0)], m_od),
        mk_box("c_seam2", 4.40, 0.10, 0.045, [("t", -6.90, -5.18, 0.0)], m_od),
        # Left-forend recessed flush tactical sling-bar pocket
        mk_box("c_sling", 0.44, 0.88, 0.28, [("t", 11.45, -0.58, -0.88)], m_od, bevel=0.04, bevel_segs=2),
        # Right-side ergonomic bolt-handle clearance scallop
        mk_sphere("c_bscal", 0.66, 0.66, 0.66, 22, 16, [("t", -4.88, 0.20, 1.12)], m_od),
    ]

    bolt_coords = [
        (-8.55, -1.85),
        (-4.95, -2.15),
        (-1.45, -0.85),
        ( 4.25, -0.85),
        ( 7.20, -0.58),
        (10.00, -0.58),
        (12.70, -0.58),
    ]
    hardware: list[bpy.types.Object] = [
        # Recessed hardened steel tactical sling bar on left forend
        mk_cyl("skin_slingbar", 0.068, 0.068, 0.86, "y", 14, [("t", 11.45, -0.58, -0.81)], m_hw, bevel=0.012),
    ]
    for bi, (bx, by) in enumerate(bolt_coords):
        for side in (-1.0, 1.0):
            s_tag = "R" if side > 0 else "L"
            # Deep circular counterbore with chamfered lip
            cutters.append(
                mk_cyl(f"c_cb_{bi}_{s_tag}", 0.175, 0.165, 0.28, "z", 18,
                       [("t", bx, by, side * 0.92)], m_od)
            )
            # Real recessed M5 Allen socket-head cap screw
            hardware.append(
                mk_allen_socket_bolt(f"skin_bolt_{bi}_{s_tag}", 0.125, 0.09, side,
                                     bx, by, side * 0.835, m_hw, m_sl)
            )

    carved = bool_subtract(skin_body, cutters, solver="EXACT")
    obj = join_objects([carved] + hardware, "awm_chassis_skins")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_awm_folding_stock(mats: dict) -> bpy.types.Object:
    m_od = mats["C_ODGreenChassis"]
    m_hw = mats["C_DarkHardware"]
    m_ss = mats["C_BrightStainless"]
    m_sl = mats["C_SorbothaneRubber"]

    # Left-hinged AWM-F / L115A3 folding rear buttstock (Local X in [-10.30, 0.0] -> World [-19.5, -9.2])
    stk_pts: list[tuple[float, float]] = [
        (  0.00,  0.88),
        ( -1.55,  0.88),
        ( -1.85,  0.56),  # Recessed comb saddle for adjustable cheekpiece
        ( -8.20,  0.56),
        ( -8.50,  0.88),
        (-10.30,  0.88),
        (-10.30, -4.40),
        ( -8.45, -4.40),  # Iconic AI rear bag-rider toe hook
    ]
    stk_pts += _quad_bez((-8.45, -4.40), (-8.12, -3.40), (-7.95, -2.92), 8)
    stk_pts.append((-3.65, -2.92))
    stk_pts += _cubic_bez((-3.65, -2.92), (-2.45, -3.55), (-1.20, -4.25), (0.00, -4.40), 16)

    raw_stock = mk_extrude_z("stk_raw", stk_pts, -0.845, 0.845, bevel=0.105, bevel_segs=5, mat=m_od)

    # Smoothly rounded C2 hourglass-beveled L115A3 oval weight-saving / sling window!
    win_pts: list[tuple[float, float]] = [(-3.00, -0.45), (-7.20, -0.45)]
    win_pts += _quad_bez((-7.20, -0.45), (-7.55, -0.45), (-7.58, -0.80), 8)
    win_pts.append((-7.64, -1.62))
    win_pts += _quad_bez((-7.64, -1.62), (-7.65, -1.96), (-7.30, -1.97), 8)
    win_pts.append((-2.90, -2.14))
    win_pts += _quad_bez((-2.90, -2.14), (-2.54, -2.15), (-2.56, -1.80), 8)
    win_pts.append((-2.72, -0.80))
    win_pts += _quad_bez((-2.72, -0.80), (-2.75, -0.45), (-3.00, -0.45), 8)
    cut_win = mk_flared_cutout_z("c_stkwin", win_pts, z_half_inner=0.84, flare=0.105, flare_depth=0.20, mat=m_od)

    cutters: list[bpy.types.Object] = [
        cut_win,
        # Twin vertical guide post bores for adjustable cheekpiece
        mk_cyl("c_cpost1", 0.165, 0.165, 1.25, "y", 18, [("t", -3.05, 0.40, 0.0)], m_od),
        mk_cyl("c_cpost2", 0.165, 0.165, 1.25, "y", 18, [("t", -6.75, 0.40, 0.0)], m_od),
        # Lower molding parting seam
        mk_box("c_stseam", 4.20, 0.08, 0.045, [("t", -5.80, -2.95, 0.0)], m_od),
        # Recessed left-rear sling slot pocket
        mk_box("c_stslg", 0.42, 0.84, 0.24, [("t", -9.45, -1.95, -0.82)], m_od, bevel=0.035),
    ]

    hardware: list[bpy.types.Object] = [
        # Heavy machined steel left-side folding hinge barrel (X=0, Z=-0.88) & captive stainless hinge pin
        mk_cyl("stk_hinge", 0.275, 0.275, 2.35, "y", 24, [("t", 0.0, -1.65, -0.88)], m_hw, bevel=0.024),
        mk_cyl("stk_hpin", 0.140, 0.140, 4.16, "y", 20, [("t", 0.0, -1.65, -0.88)], m_ss, bevel=0.018),
        # Spring-loaded serrated folding stock release latch button on left flank
        mk_box("stk_latch", 0.54, 0.48, 0.24, [("t", -0.42, -0.62, -0.86)], m_hw, bevel=0.032, bevel_segs=2),
        # Right-side folded-position ball-detent retention catch socket seated solidly on rear OD-green upright
        # (well clear of the central oval stock window [-7.64..-2.54] and rear hex bolts at Y=-0.65/-3.45!)
        mk_cyl("stk_catch", 0.22, 0.22, 0.22, "z", 20, [("t", -8.60, -1.75, 0.83)], m_hw, bevel=0.022),
        mk_cyl("stk_catch_in", 0.12, 0.12, 0.06, "z", 16, [("t", -8.60, -1.75, 0.93)], m_ss, bevel=0.010),
        # Left-rear steel tactical sling loop bar
        mk_cyl("stk_slingbar", 0.072, 0.072, 0.78, "y", 14, [("t", -9.45, -1.95, -0.81)], m_hw, bevel=0.012),
        # Twin recessed stainless cheekpiece post bushings on comb top
        mk_torus("stk_bush1", 0.17, 0.032, "y", 20, 10, [("t", -3.05, 0.57, 0.0)], m_hw),
        mk_torus("stk_bush2", 0.17, 0.032, "y", 20, 10, [("t", -6.75, 0.57, 0.0)], m_hw),
    ]
    # Crisp horizontal serrations on release latch button
    for sy in (-0.75, -0.66, -0.57, -0.48):
        hardware.append(mk_box(f"stk_lser_{sy:.2f}", 0.46, 0.038, 0.05, [("t", -0.42, sy, -0.975)], m_hw, bevel=0.008))

    stock_bolts = [
        (-1.15, -0.85),
        (-1.25, -3.35),
        (-9.15, -0.65),
        (-9.15, -3.45),
    ]
    for bi, (bx, by) in enumerate(stock_bolts):
        for side in (-1.0, 1.0):
            s_tag = "R" if side > 0 else "L"
            cutters.append(
                mk_cyl(f"c_stcb_{bi}_{s_tag}", 0.16, 0.15, 0.26, "z", 18,
                       [("t", bx, by, side * 0.86)], m_od)
            )
            hardware.append(
                mk_allen_socket_bolt(f"stk_bolt_{bi}_{s_tag}", 0.115, 0.085, side,
                                     bx, by, side * 0.79, m_hw, m_sl)
            )

    carved = bool_subtract(raw_stock, cutters, solver="EXACT")
    obj = join_objects([carved] + hardware, "awm_folding_stock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_awm_cheekpiece(mats: dict) -> bpy.types.Object:
    m_ky = mats["C_MatteBlackKydex"]
    m_ss = mats["C_BrightStainless"]
    m_hw = mats["C_DarkHardware"]
    m_sl = mats["C_SorbothaneRubber"]

    # Organically contoured inverted-U matte-black polyamide cheek saddle (Local X in [-3.22, +2.62])
    # Clears fully-retracted bolt shroud at World X = -11.23 (assembledPos X = -14.10 -> +2.62 = -11.48!)
    outer_sad = mk_cyl("chk_outer", 0.82, 0.75, 5.84, "x", 48,
                       [("s", 1.0, 0.92, 0.98), ("t", -0.30, 0.02, 0.0)], m_ky, bevel=0.072)
    cut_under = mk_box("c_chk_u", 6.20, 0.86, 1.18, [("t", -0.30, -0.56, 0.0)], m_ky)
    cut_front = mk_box("c_chk_f", 0.96, 1.22, 1.84, [("rz", -0.46), ("t", 2.58, 0.32, 0.0)], m_ky)
    # Soft rear edge contour bevel
    cut_rear = mk_box("c_chk_r", 0.42, 0.60, 1.84, [("rz", 0.36), ("t", -3.28, 0.56, 0.0)], m_ky)
    saddle = bool_subtract(outer_sad, [cut_under, cut_front, cut_rear], solver="EXACT")

    parts: list[bpy.types.Object] = [saddle]
    # Twin vertical stainless elevation guide rods + calibration index grooves + 3D knurled locking thumbscrews!
    for i, px in enumerate((1.85, -1.85)):
        parts.extend([
            mk_cyl(f"chk_rod_{i}", 0.14, 0.14, 1.38, "y", 20, [("t", px, -0.45, 0.0)], m_ss, bevel=0.016),
            mk_torus(f"chk_cal1_{i}", 0.142, 0.014, "y", 20, 8, [("t", px, -0.32, 0.0)], m_hw),
            mk_torus(f"chk_cal2_{i}", 0.142, 0.014, "y", 20, 8, [("t", px, -0.56, 0.0)], m_hw),
            # 3D knurled steel locking thumbscrew knob on right flank (+Z) with Allen hex socket center!
            mk_knurled_cyl(f"chk_knob_{i}", 0.245, 0.22, "z", flutes=22, depth=0.022,
                           xform=[("t", px, -0.62, 0.82)], mat=m_hw),
            mk_cyl(f"chk_stem_{i}", 0.11, 0.11, 0.18, "z", 16, [("t", px, -0.62, 0.66)], m_ss),
            mk_allen_socket_bolt(f"chk_cap_{i}", 0.105, 0.07, 1.0, px, -0.62, 0.93, m_ss, m_sl),
        ])

    obj = join_objects(parts, "awm_cheekpiece")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_buttpad_spacers(mats: dict) -> bpy.types.Object:
    m_ky = mats["C_MatteBlackKydex"]
    m_al = mats["C_AlloySpacer"]
    m_rb = mats["C_SorbothaneRubber"]
    m_ss = mats["C_BrightStainless"]

    # Two removable beveled Length-of-Pull (LOP) spacers flush against stock rear (Local X = +0.05)
    sp1 = mk_box("bp_sp1", 0.30, 5.24, 1.50, [("t", -0.10, 0.0, 0.0)], m_ky, bevel=0.026, bevel_segs=2)
    sp2 = mk_box("bp_sp2", 0.30, 5.22, 1.48, [("t", -0.44, 0.0, 0.0)], m_al, bevel=0.026, bevel_segs=2)

    # Thick Sorbothane elastomer recoil buttpad w/ ergonomically cupped shoulder curve & anti-slip ribs
    pad_raw = mk_box("bp_raw", 0.90, 5.22, 1.50, [("t", -1.06, 0.0, 0.0)], m_rb, bevel=0.045, bevel_segs=2)
    cutters: list[bpy.types.Object] = [
        mk_cyl("c_bpcurve", 5.60, 5.60, 1.95, "z", 36, [("t", -6.88, 0.0, 0.0)], m_rb),
        mk_cyl("c_bpscrT", 0.145, 0.145, 1.25, "x", 16, [("t", -1.15,  1.55, 0.0)], m_rb),
        mk_cyl("c_bpscrB", 0.145, 0.145, 1.25, "x", 16, [("t", -1.15, -1.55, 0.0)], m_rb),
    ]
    for ry in (-2.10, -1.68, -1.26, -0.84, -0.42, 0.00, 0.42, 0.84, 1.26, 1.68, 2.10):
        cutters.append(
            mk_box(f"c_bprib_{ry:.2f}", 0.24, 0.115, 1.72, [("t", -1.46, ry, 0.0)], m_rb, bevel=0.02, bevel_segs=1)
        )
    rubber_pad = bool_subtract(pad_raw, cutters, solver="EXACT")

    parts = [
        sp1, sp2, rubber_pad,
        mk_cyl("bp_boltT", 0.105, 0.105, 0.72, "x", 16, [("t", -0.36,  1.55, 0.0)], m_ss, bevel=0.012),
        mk_cyl("bp_boltB", 0.105, 0.105, 0.72, "x", 16, [("t", -0.36, -1.55, 0.0)], m_ss, bevel=0.012),
    ]
    obj = join_objects(parts, "awm_buttpad_spacers")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_mag_follower(mats: dict) -> bpy.types.Object:
    m_fo = mats["C_FollowerOrange"]
    m_hw = mats["C_DarkHardware"]

    # Contoured center-feed .338 Lapua Magnum cartridge cradle cross-section in (Z, Y), extruded along X
    cradle_zy: list[tuple[float, float]] = [(-0.470, -0.042), (-0.470, 0.222)]
    cradle_zy += _quad_bez((-0.470, 0.222), (-0.460, 0.262), (-0.340, 0.262), 5)
    cradle_zy.append((-0.260, 0.215))
    cradle_zy += _quad_bez((-0.260, 0.215), (0.000, 0.055), (0.260, 0.215), 10)
    cradle_zy.append((0.340, 0.262))
    cradle_zy += _quad_bez((0.340, 0.262), (0.460, 0.262), (0.470, 0.222), 5)
    cradle_zy.append((0.470, -0.042))

    parts = [
        mk_extrude_x("flw_deck", cradle_zy, -2.91, 2.91, bevel=0.012, bevel_segs=2, mat=m_fo),
        mk_box("flw_skF", 0.22, 0.56, 0.92, [("t",  2.81, -0.23, 0.0)], m_fo, bevel=0.022),
        mk_box("flw_skR", 0.22, 0.56, 0.92, [("t", -2.81, -0.23, 0.0)], m_fo, bevel=0.022),
        mk_box("flw_stp", 0.42, 0.09, 0.34, [("t", -2.66,  0.21, 0.0)], m_fo, bevel=0.015),
        mk_box("flw_keel", 5.36, 0.22, 0.14, [("t", 0.0, -0.15, 0.0)], m_fo, bevel=0.018),
        mk_box("flw_sbos", 2.60, 0.16, 0.44, [("t", 0.0, -0.11, 0.0)], m_hw, bevel=0.018),
    ]
    obj = join_objects(parts, "awm_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 2: METAL / ACTION / BARREL / BOLT / BEAM / FCG ATLAS (12 PARTS) ---

def build_awm_action_receiver(mats: dict) -> bpy.types.Object:
    m_ac = mats["M_ActionSteel"]
    m_rc = mats["M_RailCrest"]
    m_sl = mats["M_SlotDark"]
    m_ss = mats["M_ChromeBolt"]
    m_pk = mats["M_ParkerizedCtrl"]

    # Iconic Portsmouth AI flat-sided octagonal ordnance-steel Magnum action block (local X in [-5.305, +4.745])
    # Flat vertical walls span Y in [-0.61, +0.56] at Z = +-0.78 (Hero UV rollmark slabs!)
    rec_zy = [
        (-0.56, -0.83),
        ( 0.56, -0.83),
        ( 0.78, -0.61),
        ( 0.78,  0.56),
        ( 0.41,  0.93),
        (-0.41,  0.93),
        (-0.78,  0.56),
        (-0.78, -0.61),
    ]
    raw_rec = mk_extrude_x("rec_raw", rec_zy, -5.305, 4.745, bevel=0.020, bevel_segs=2, mat=m_ac)

    cutters = [
        # Central bolt raceway & chamber tenon bore (R = 0.56)
        mk_cyl("c_rbore", 0.56, 0.56, 10.60, "x", 36, [("t", -0.28, 0.0, 0.0)], m_sl),
        # Right-side .338 Lapua Magnum ejection port (chamfered clean bevels!)
        mk_box("c_reje", 4.40, 0.72, 0.96, [("rx", -0.22), ("t", 0.65, 0.28, 0.55)], m_sl, bevel=0.035, bevel_segs=2),
        # Bottom magwell feed slot
        mk_box("c_rmag", 5.96, 0.76, 0.94, [("t", 1.32, -0.65, 0.0)], m_sl),
        # Rear sear & bolt-shroud anti-rotation tang slot
        mk_box("c_rtang", 2.86, 0.68, 0.44, [("t", -3.82, -0.64, 0.0)], m_sl),
        # Left-flank emergency gas-relief vent port
        mk_cyl("c_rgas", 0.095, 0.095, 0.48, "z", 16, [("t", 2.95, 0.24, -0.68)], m_sl),
        # Right-rear bolt-handle root notch
        mk_box("c_rbh", 0.80, 0.70, 0.88, [("t", -4.18, -0.12, 0.55)], m_sl, bevel=0.025, bevel_segs=2),
    ]
    rec_shell = bool_subtract(raw_rec, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [rec_shell]

    # True 45-degree dovetailed 20-MOA MIL-STD-1913 Integral Picatinny Top Rail (X in [-5.15, +4.65], Y in [+0.93, +1.21])
    rail_neck = mk_box("rec_rneck", 9.80, 0.085, 0.68, [("t", -0.25, 0.965, 0.0)], m_rc, bevel=0.010, bevel_segs=1)
    rail_floor = mk_box("rec_rflr", 9.76, 0.032, 0.66, [("t", -0.25, 1.025, 0.0)], m_sl)
    parts.extend([rail_neck, rail_floor])

    lug_zy = [
        (-0.34, 0.930),
        (-0.42, 1.010),
        (-0.42, 1.155),
        (-0.365, 1.210),
        (-0.10, 1.210),
        (-0.07, 1.170),
        ( 0.07, 1.170),
        ( 0.10, 1.210),
        ( 0.365, 1.210),
        ( 0.42, 1.155),
        ( 0.42, 1.010),
        ( 0.34, 0.930),
    ]
    slot_xs = [-4.75 + i * 0.65 for i in range(15)]
    seg_x0 = -5.15
    for idx, sx in enumerate(slot_xs + [4.65 + 0.12]):
        seg_x1 = sx - 0.12 if idx < len(slot_xs) else 4.65
        if seg_x1 - seg_x0 > 0.04:
            bev = min(0.014, (seg_x1 - seg_x0) * 0.18)
            parts.append(mk_extrude_x(f"rec_rlug_{idx}", lug_zy, seg_x0, seg_x1, bevel=bev, bevel_segs=2, mat=m_rc))
        seg_x0 = sx + 0.12

    # Bright-steel internal dual 6-lug locking abutment rings, 3 raceway guide rails & integral recoil lug
    parts.extend([
        mk_torus("rec_lrF", 0.54, 0.052, "x", 28, 12, [("t", 2.42, 0.0, 0.0)], m_ss),
        mk_torus("rec_lrR", 0.54, 0.048, "x", 28, 12, [("t", 1.78, 0.0, 0.0)], m_ss),
        mk_box("rec_rwL", 6.80, 0.10, 0.08, [("t", -1.60,  0.08, -0.52)], m_ss, bevel=0.012),
        mk_box("rec_rwR", 2.60, 0.10, 0.08, [("t", -3.20, -0.22,  0.50)], m_ss, bevel=0.012),
        mk_box("rec_reclug", 0.32, 0.42, 1.06, [("t", 4.45, -0.92, 0.0)], m_pk, bevel=0.022),
        # Front & rear action mounting boss collars under V-bedding flat
        mk_cyl("rec_mbF", 0.20, 0.20, 0.08, "y", 16, [("t",  3.95, -0.85, 0.0)], m_pk),
        mk_cyl("rec_mbR", 0.20, 0.20, 0.08, "y", 16, [("t", -4.25, -0.85, 0.0)], m_pk),
    ])

    obj = join_objects(parts, "awm_action_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_awm_barrel(mats: dict) -> bpy.types.Object:
    m_bl = mats["M_StainlessBarrel"]
    m_fl = mats["M_StainlessFlute"]
    m_sl = mats["M_SlotDark"]
    m_ss = mats["M_ChromeBolt"]

    # Closed watertight hollow 27" Match Stainless Barrel Lathe (64 radial segments!)
    # M27 breech tenon -> heavy chamber -> match taper -> M18 muzzle spigot -> 11-deg target crown -> .338 LM chamber!
    pts_r_x = [
        (0.390,  2.880),
        (0.540,  2.880),  # M27x2 threaded breech tenon inside steel Magnum receiver
        (0.540,  4.640),
        (0.515,  4.670),  # Thread-relief undercut groove
        (0.515,  4.730),
        (0.740,  4.760),  # Heavy chamber cylinder flush against receiver front face X = +4.75
        (0.740,  8.150),
        (0.680,  8.850),  # Smooth match contour taper start
        (0.550, 27.250),  # 27" free-floating heavy sniper contour
        (0.550, 28.050),  # Muzzle brake shoulder flush at X = +28.05
        (0.410, 28.080),  # Thread-relief undercut
        (0.430, 28.120),  # M18x1.5 threaded muzzle spigot inside AI brake
        (0.430, 28.980),
        (0.410, 29.000),  # 45-deg outer crown chamfer
        (0.355, 29.000),  # Flat outer crown rim
        (0.355, 28.972),  # Recessed crown counterbore step
        (0.215, 28.945),  # True 11-deg recessed target crown cone into .338 bore
        # ---- Hollow .338 (8.6mm) bore & bottleneck .338 Lapua Magnum 70mm chamber ----
        (0.215,  6.720),
        (0.245,  6.420),  # Freebore leade cone
        (0.245,  5.980),  # .338 LM case neck
        (0.348,  5.660),  # 20-deg bottleneck shoulder
        (0.378,  3.040),  # Tapered 14.9mm-base .338 LM case body
        (0.415,  2.920),  # Polished breech chamber chamfer
        (0.390,  2.880),
    ]
    outer = mk_lathe_x("bbl_raw", pts_r_x, segs=64, mat=m_bl)

    # Assign dark internal bore material strictly to interior bore faces (r < 0.395, x in [2.91..28.97])
    outer.data.materials.append(m_sl)
    bm = bmesh.new()
    bm.from_mesh(outer.data)
    for f in bm.faces:
        c = f.calc_center_median()
        r = math.hypot(c.y, c.z)
        if r < 0.392 and 2.91 < c.x < 28.965:
            f.material_index = 1
    bm.to_mesh(outer.data)
    bm.free()

    # 6 Deep Ball-Endmill Longitudinal Flutes + 2 AI Barrel-Wrench Flats (contrasting milled satin valleys!)
    flute_cutters: list[bpy.types.Object] = [
        mk_box("c_bflatR", 0.68, 0.72, 0.18, [("t", 5.35, 0.0,  0.74)], m_fl, bevel=0.02),
        mk_box("c_bflatL", 0.68, 0.72, 0.18, [("t", 5.35, 0.0, -0.74)], m_fl, bevel=0.02),
    ]
    for k in range(6):
        ang = (k * math.pi) / 3.0
        r_mid = 0.635
        fy = math.cos(ang) * r_mid
        fz = math.sin(ang) * r_mid
        tilt = 0.0065
        flute_cutters.append(
            mk_capsule_x(
                f"c_bflute_{k}", 0.138, 17.50, segs=26, cap_rings=7,
                xform=[("ry", math.sin(ang) * tilt), ("rz", -math.cos(ang) * tilt), ("t", 17.75, fy, fz)],
                mat=m_fl,
            )
        )
    fluted_barrel = bool_subtract(outer, flute_cutters, solver="EXACT")

    twist = (2.0 * math.pi) / 25.4
    parts: list[bpy.types.Object] = [
        fluted_barrel,
        # Polished stainless chamber breech feed cone ring
        mk_torus("bbl_bcone", 0.44, 0.056, "x", 28, 12, [("t", 2.90, 0.0, 0.0)], m_ss),
        # 6 Helical 1:10" right-hand .338 rifling lands inside muzzle crown & chamber leade
        mk_helical_lands("bbl_rifM", 6, 0.215, 0.024, 0.12, 25.20, 28.94, twist, segs=10, phase=0.15, mat=m_ss),
        mk_helical_lands("bbl_rifC", 6, 0.215, 0.024, 0.12,  6.75,  9.25, twist, segs=6,  phase=0.15, mat=m_ss),
    ]
    # 3D machined thread rings on M27 breech tenon & M18 muzzle spigot
    for i, tx in enumerate((3.15, 3.42, 3.69, 3.96, 4.23, 4.50)):
        parts.append(mk_torus(f"bbl_bth_{i}", 0.538, 0.016, "x", 28, 8, [("t", tx, 0.0, 0.0)], m_fl))
    for i, tx in enumerate((28.22, 28.38, 28.54, 28.70, 28.86)):
        parts.append(mk_torus(f"bbl_mth_{i}", 0.428, 0.014, "x", 24, 8, [("t", tx, 0.0, 0.0)], m_fl))

    obj = join_objects(parts, "awm_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_muzzle_brake(mats: dict) -> bpy.types.Object:
    m_bk = mats["M_BrakeHeatSoot"]
    m_st = mats["M_BrakeBaffleSoot"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_ss = mats["M_ChromeBolt"]

    # Rear threaded AI tactical suppressor-mount collar (Local X in [-1.50, -0.74])
    rear_collar = mk_lathe_x(
        "mb_collar",
        [(0.43, -1.50), (0.59, -1.50), (0.61, -0.74), (0.43, -0.74), (0.43, -1.50)],
        segs=36, mat=m_pk,
    )

    # Iconic chamfered octagonal slab-sided AI dual-baffle brake body (Local X in [-0.78, +1.50])
    slab_zy = [
        (-0.56, -0.66),
        ( 0.56, -0.66),
        ( 0.84, -0.38),
        ( 0.84,  0.38),
        ( 0.56,  0.66),
        (-0.56,  0.66),
        (-0.84,  0.38),
        (-0.84, -0.38),
    ]
    slab_raw = mk_extrude_x("mb_slab", slab_zy, -0.78, 1.50, bevel=0.022, bevel_segs=2, mat=m_bk)

    # Stepped 11-deg recessed target exit crown cutter at X = +1.50 (World X = +31.00)
    crown_cut = mk_lathe_x(
        "c_mbcrn",
        [(0.0, 1.24), (0.235, 1.24), (0.42, 1.44), (0.47, 1.44), (0.47, 1.56), (0.0, 1.56)],
        segs=32, mat=m_st,
    )

    cutters = [
        # Central .338 bore through brake
        mk_cyl("c_mbbore", 0.235, 0.235, 2.60, "x", 28, [("t", 0.36, 0.0, 0.0)], m_st),
        # Rear muzzle spigot counterbore socket
        mk_cyl("c_mbspg", 0.435, 0.435, 0.42, "x", 28, [("t", -0.64, 0.0, 0.0)], m_st),
        # Chamber 1 & Chamber 2 hollow blast plenums
        mk_cyl("c_mbp1", 0.46, 0.43, 0.58, "x", 28, [("t", -0.18, 0.0, 0.0)], m_st),
        mk_cyl("c_mbp2", 0.45, 0.42, 0.58, "x", 28, [("t",  0.76, 0.0, 0.0)], m_st),
        crown_cut,
        # Aggressive rearward-swept Chamber 1 & Chamber 2 lateral exhaust baffle vents (carbon-soot lined!)
        mk_box("c_mbv1R", 0.64, 0.86, 1.08, [("ry",  0.22), ("t", -0.18, 0.0,  0.50)], m_st, bevel=0.035, bevel_segs=2),
        mk_box("c_mbv1L", 0.64, 0.86, 1.08, [("ry", -0.22), ("t", -0.18, 0.0, -0.50)], m_st, bevel=0.035, bevel_segs=2),
        mk_box("c_mbv2R", 0.64, 0.86, 1.08, [("ry",  0.22), ("t",  0.76, 0.0,  0.50)], m_st, bevel=0.035, bevel_segs=2),
        mk_box("c_mbv2L", 0.64, 0.86, 1.08, [("ry", -0.22), ("t",  0.76, 0.0, -0.50)], m_st, bevel=0.035, bevel_segs=2),
        # 4 Top anti-muzzle-rise compensator ports
        mk_cyl("c_mbt1", 0.085, 0.085, 0.40, "y", 14, [("t", -0.16, 0.56, -0.24)], m_st),
        mk_cyl("c_mbt2", 0.085, 0.085, 0.40, "y", 14, [("t", -0.16, 0.56,  0.24)], m_st),
        mk_cyl("c_mbt3", 0.080, 0.080, 0.40, "y", 14, [("t",  0.78, 0.56, -0.24)], m_st),
        mk_cyl("c_mbt4", 0.080, 0.080, 0.40, "y", 14, [("t",  0.78, 0.56,  0.24)], m_st),
    ]
    brake_slab = bool_subtract(slab_raw, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        rear_collar,
        brake_slab,
        # 3D knurled shoulder lock collar behind brake slab (radius <= 0.673!)
        mk_knurled_cyl("mb_knurl", 0.662, 0.14, "x", flutes=32, depth=0.024,
                       xform=[("t", -0.82, 0.0, 0.0)], mat=m_pk),
        # Internal stainless baffle jet-stripper aperture rings
        mk_torus("mb_jet1", 0.245, 0.020, "x", 24, 10, [("t", 0.29, 0.0, 0.0)], m_ss),
        mk_torus("mb_jet2", 0.245, 0.018, "x", 24, 10, [("t", 1.24, 0.0, 0.0)], m_ss),
        # Throat helical lands
        mk_helical_lands("mb_rif", 6, 0.235, 0.020, 0.11, -0.62, -0.44, (2.0 * math.pi) / 25.4, segs=3, mat=m_ss),
    ]
    # Crisp 3D external AI tactical suppressor-mounting thread rings
    for i, tx in enumerate((-1.38, -1.24, -1.10, -0.96)):
        parts.append(mk_torus(f"mb_sth_{i}", 0.600, 0.017, "x", 28, 8, [("t", tx, 0.0, 0.0)], m_pk))

    obj = join_objects(parts, "awm_muzzle_brake")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_bolt_body(mats: dict) -> bpy.types.Object:
    m_ss = mats["M_ChromeBolt"]
    m_bf = mats["M_BoltFluteSatin"]
    m_sl = mats["M_SlotDark"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_kn = mats["M_BoltKnobPhenolic"]
    m_br = mats["M_GoldBrass"]

    # Gleaming brushed hard-chrome cylindrical Magnum bolt shaft (R = 0.45, X in [-4.52, +2.92])
    main_cyl = mk_cyl("blt_cyl", 0.45, 0.45, 7.44, "x", 56, [("t", -0.80, 0.0, 0.0)], m_ss, bevel=0.015)

    cutters: list[bpy.types.Object] = [
        # Hollow striker & helical spring bore (stops cleanly behind solid bolt-face bulkhead X = +2.56!)
        mk_cyl("c_blt_str", 0.285, 0.285, 7.12, "x", 28, [("t", -0.97, 0.0, 0.0)], m_sl),
        # Recessed .338 Lapua Magnum bolt-face rim cup at X = +2.83
        mk_cyl("c_blt_cup", 0.388, 0.388, 0.24, "x", 36, [("t", 2.85, 0.0, 0.0)], m_sl),
        # Circumferential locking-lug bridge relief groove at X = +2.35
        mk_torus("c_blt_grv", 0.49, 0.06, "x", 36, 12, [("t", 2.35, 0.0, 0.0)], m_bf),
        # Firing pin aperture, plunger-ejector pocket, and extractor mortise
        mk_cyl("c_blt_fp", 0.066, 0.066, 0.48, "x", 16, [("t", 2.73, 0.0, 0.0)], m_sl),
        mk_cyl("c_blt_ej", 0.072, 0.072, 0.30, "x", 16, [("t", 2.72, -0.16, -0.16)], m_sl),
        mk_box("c_blt_ex", 2.48, 0.16, 0.22, [("t", 1.82, 0.12, 0.44)], m_sl),
        # Left bolt-head emergency gas vent port
        mk_cyl("c_blt_gv", 0.052, 0.052, 0.22, "z", 12, [("t", 1.78, 0.06, -0.40)], m_sl),
    ]
    # 6 Arctic anti-icing / mud-relief ball-endmill flutes along chrome bolt shaft [-3.46..+1.62]
    for k in range(6):
        ang = (k * math.pi) / 3.0 + math.pi / 6.0
        fy = math.cos(ang) * 0.468
        fz = math.sin(ang) * 0.468
        cutters.append(
            mk_capsule_x(f"c_blt_fl_{k}", 0.112, 4.86, segs=24, cap_rings=6,
                         xform=[("t", -0.92, fy, fz)], mat=m_bf)
        )
    fluted_body = bool_subtract(main_cyl, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [fluted_body]

    # 6 Symmetrical Forward Tandem Locking Lugs (2 rows of 3 at X=+2.66 and X=+2.04, 120 deg apart!)
    r_in, r_out, half_ang = 0.415, 0.594, 0.355
    lug_zy: list[tuple[float, float]] = [(math.sin(-half_ang) * r_in, math.cos(-half_ang) * r_in)]
    lug_zy.append((math.sin(-half_ang) * r_out, math.cos(-half_ang) * r_out))
    for i in range(1, 15):
        a = -half_ang + (2.0 * half_ang * i) / 14.0
        notch_dip = 0.022 if abs(a) < 0.075 else 0.0
        r = r_out - notch_dip
        lug_zy.append((math.sin(a) * r, math.cos(a) * r))
    lug_zy.append((math.sin(half_ang) * r_in, math.cos(half_ang) * r_in))

    for ri, lx in enumerate((2.66, 2.04)):
        for k in range(3):
            ang = (k * 2.0 * math.pi) / 3.0
            parts.append(
                mk_extrude_x(f"blt_lug_{ri}_{k}", lug_zy, -0.20, 0.20, bevel=0.012, bevel_segs=2,
                             xform=[("rx", ang), ("t", lx, 0.0, 0.0)], mat=m_ss)
            )

    # Spring-loaded hemispherical brass plunger ejector + retaining cross-pin
    ej_pts = [(0.0, -0.10), (0.056, -0.10), (0.056, 0.065), (0.048, 0.092), (0.028, 0.108), (0.0, 0.114)]
    parts.extend([
        mk_lathe_x("blt_plunger", ej_pts, segs=16, xform=[("t", 2.77, -0.16, -0.16)], mat=m_br),
        mk_cyl("blt_epin", 0.026, 0.026, 0.34, "z", 10, [("rx", math.pi * 0.25), ("t", 2.58, -0.24, -0.24)], m_pk),
    ])

    # Rear bolt handle root collar with cock-on-opening helical V-cam notch
    rcol_raw = mk_cyl("blt_rcol", 0.535, 0.535, 0.72, "x", 32, [("t", -4.18, 0.0, 0.0)], m_pk, bevel=0.018)
    cam_cut = mk_box("c_blt_cam", 0.30, 0.30, 0.40, [("rx", math.pi / 5.0), ("t", -4.52, -0.34, 0.0)], m_sl)
    parts.append(bool_subtract(rcol_raw, [cam_cut], solver="EXACT"))

    # Swept forged tactical bolt handle root boss + curved stem + oversized 3D knurled spherical knob!
    handle_ctrl = [
        Vector((-4.16, -0.04, 0.46)),
        Vector((-4.42, -0.22, 1.05)),
        Vector((-4.72, -0.55, 1.54)),
        Vector((-4.88, -0.85, 1.85)),
    ]
    handle_pts = _catmull_rom_pts(handle_ctrl, samples_per_seg=8)
    parts.extend([
        mk_box("blt_hroot", 0.44, 0.36, 0.34, [("rx", 0.18), ("t", -4.18, -0.08, 0.58)], m_pk, bevel=0.028, bevel_segs=2),
        mk_tube_along_pts("blt_hstem", handle_pts, 0.145, ring_segs=18, mat=m_pk),
    ])

    # Iconic AI oversized tactical bolt knob: contoured matte phenolic sphere + 3D knurled equatorial band
    # + recessed stainless hex retaining cap screw! (Centered at (-4.88, -0.85, 1.85), R <= 0.44!)
    knob_dir = (handle_ctrl[-1] - handle_ctrl[-2]).normalized()
    # Compute local orientation aligning knob Z-axis roughly along handle stem exit
    knob_raw = mk_sphere("blt_knob", 0.435, 0.435, 0.435, 28, 20, [("t", -4.88, -0.85, 1.85)], m_kn)
    knob_dimple = mk_cyl("c_kdimp", 0.14, 0.14, 0.24, "z", 16,
                         [("rx", math.pi / 3.0), ("t", -4.92, -1.04, 2.18)], m_sl)
    knob_core = bool_subtract(knob_raw, [knob_dimple], solver="EXACT")
    # 3D knurled tactile grip ring wrapping the bolt knob equator (oriented around stem axis!)
    knob_band = mk_knurled_cyl("blt_kband", 0.438, 0.24, "z", flutes=26, depth=0.024,
                               xform=[("rx", math.pi / 4.2), ("ry", -0.32), ("t", -4.88, -0.85, 1.85)],
                               mat=m_kn)
    knob_cap = mk_cyl("blt_kcap", 0.11, 0.11, 0.08, "z", 6,
                      [("rx", math.pi / 3.0), ("t", -4.91, -1.00, 2.12)], m_ss, bevel=0.010)
    parts.extend([knob_core, knob_band, knob_cap])

    obj = join_objects(parts, "awm_bolt_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_bolt_shroud(mats: dict) -> bpy.types.Object:
    m_pk = mats["M_ParkerizedCtrl"]
    m_ac = mats["M_ActionSteel"]
    m_sl = mats["M_SlotDark"]
    m_ss = mats["M_ChromeBolt"]
    m_rd = mats["M_SafetyRed"]
    m_wh = mats["M_SafetyWhite"]

    # Crisp hexagonal/octagonal AI steel bolt shroud (assembledPos = [-5.18, 1.05, 0])
    shroud_zy = [
        (-0.46, -0.44),
        ( 0.46, -0.44),
        ( 0.46,  0.22),
        ( 0.18,  0.52),
        (-0.18,  0.52),
        (-0.46,  0.22),
    ]
    shroud_main = mk_extrude_x("shr_main", shroud_zy, -1.15, 0.71, bevel=0.022, bevel_segs=2, mat=m_ac)
    front_plug = mk_cyl("shr_plug", 0.45, 0.45, 0.52, "x", 28, [("t", 0.58, 0.0, 0.0)], m_pk, bevel=0.015)
    bot_tang = mk_box("shr_tang", 1.56, 0.28, 0.36, [("t", -0.14, -0.52, 0.0)], m_pk, bevel=0.016)
    body_u = bool_union([shroud_main, front_plug, bot_tang], "shr_u", solver="EXACT")

    cutters = [
        mk_cyl("c_shrbore", 0.18, 0.18, 2.45, "x", 22, [("t", -0.10, 0.0, 0.0)], m_sl),
        mk_box("c_shrslot", 1.75, 0.38, 0.22, [("t", 0.12, -0.52, 0.0)], m_sl),
    ]
    body = bool_subtract(body_u, cutters, solver="EXACT")

    # Iconic AI 3-Position Flag/Wing Safety Lever on left-rear of shroud + white safe index & crimson fire dot!
    parts = [
        body,
        mk_cyl("shr_spiv", 0.16, 0.16, 0.34, "z", 20, [("t", -0.68, 0.22, -0.46)], m_ss, bevel=0.016),
        mk_box("shr_swing", 0.78, 0.28, 0.18, [("t", -0.76, 0.36, -0.56)], m_ac, bevel=0.024, bevel_segs=2),
        mk_box("shr_spad", 0.32, 0.34, 0.24, [("t", -1.04, 0.38, -0.59)], m_pk, bevel=0.026, bevel_segs=2),
        mk_box("shr_sbar", 0.24, 0.05, 0.04, [("t", -0.72, 0.36, -0.655)], m_wh, bevel=0.006),
        mk_sphere("shr_rdot", 0.072, 0.072, 0.072, 16, 12, [("t", -0.24, 0.34, -0.46)], m_rd),
    ]
    # Tactile grip grooves on flag safety thumb pad
    for sx in (-1.12, -1.04, -0.96):
        parts.append(mk_box(f"shr_ser_{sx:.2f}", 0.032, 0.30, 0.04, [("t", sx, 0.38, -0.705)], m_pk, bevel=0.006))

    obj = join_objects(parts, "awm_bolt_shroud")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_striker(mats: dict) -> bpy.types.Object:
    m_ss = mats["M_ChromeBolt"]
    m_bf = mats["M_BoltFluteSatin"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_ac = mats["M_ActionSteel"]
    m_rd = mats["M_SafetyRed"]

    parts = [
        # Tapered .338 LM firing-pin needle tip (local X in [+2.40, +3.96] -> World X up to +2.81)
        mk_cyl("str_tip", 0.046, 0.105, 1.56, "x", 20, [("t", 3.18, 0.0, 0.0)], m_ss, bevel=0.008),
        # Fluted lightweight alloy-steel main striker shaft
        mk_cyl("str_rod", 0.125, 0.125, 6.25, "x", 22, [("t", -0.72, 0.0, 0.0)], m_ss, bevel=0.010),
        # Front helical-spring abutment flange collar
        mk_cyl("str_col", 0.255, 0.255, 0.22, "x", 24, [("t", 2.30, 0.0, 0.0)], m_bf, bevel=0.016),
        # Hardened cocking piece & bottom sear engagement lug (engages awm_sear at World X = -3.13!)
        mk_box("str_cp", 0.92, 0.36, 0.22, [("t", -2.15, -0.22, 0.0)], m_pk, bevel=0.020),
        mk_box("str_lug", 0.56, 0.48, 0.20, [("t", -1.98, -0.44, 0.0)], m_ac, bevel=0.018),
        # Rear tactile/visual cocking indicator rod protruding behind bolt shroud + crimson band
        mk_cyl("str_ind", 0.105, 0.105, 1.38, "x", 20, [("t", -4.53, 0.0, 0.0)], m_ss, bevel=0.014),
        mk_torus("str_ring", 0.108, 0.018, "x", 20, 10, [("t", -5.06, 0.0, 0.0)], m_rd),
    ]
    obj = join_objects(parts, "awm_striker")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_extractor(mats: dict) -> bpy.types.Object:
    m_ss = mats["M_ChromeBolt"]
    m_ac = mats["M_ActionSteel"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_sl = mats["M_SlotDark"]
    m_br = mats["M_GoldBrass"]

    # Contoured external Sako/AI leaf-spring claw extractor profile in (X, Z), extruded along Y [0.04..0.20]
    leaf_xz: list[tuple[float, float]] = [(0.76, 0.365)]
    leaf_xz += _quad_bez((0.76, 0.365), (1.65, 0.502), (2.56, 0.488), 10)
    leaf_xz += [
        (2.955, 0.468),
        (2.992, 0.388),
        (2.992, 0.292),
        (2.835, 0.283),
        (2.790, 0.354),
        (2.540, 0.378),
    ]
    leaf_xz += _quad_bez((2.540, 0.378), (1.68, 0.392), (0.76, 0.365), 10)
    spring_claw = mk_extrude_y("ext_claw", leaf_xz, 0.042, 0.198, bevel=0.010, bevel_segs=2, mat=m_ss)

    col_raw = mk_box("ext_col", 0.28, 0.22, 0.19, [("t", 0.66, 0.12, 0.42)], m_pk, bevel=0.014)
    col_cut = mk_box("c_extcol", 0.08, 0.26, 0.06, [("t", 0.66, 0.12, 0.495)], m_sl)
    retain_collar = bool_subtract(col_raw, [col_cut], solver="EXACT")

    parts = [
        spring_claw,
        mk_box("ext_spine", 1.68, 0.075, 0.036, [("t", 1.66, 0.12, 0.492)], m_ac, bevel=0.008),
        retain_collar,
        mk_cyl("ext_det", 0.042, 0.042, 0.075, "z", 14, [("t", 1.04, 0.12, 0.36)], m_br, bevel=0.008),
    ]
    obj = join_objects(parts, "awm_extractor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_chassis_beam(mats: dict) -> bpy.types.Object:
    m_bm = mats["M_AnodizedBeam"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_sl = mats["M_SlotDark"]
    m_ss = mats["M_ChromeBolt"]

    # Full-Length CNC 7075-T6 Billet Aluminum Chassis Backbone (X in [-9.20, +13.80] + front spigot to +14.89!)
    main_beam = mk_box("bm_main", 23.00, 1.24, 1.06, [("t", 2.30, -0.24, 0.0)], m_bm, bevel=0.028, bevel_segs=2)
    mag_skirt = mk_box("bm_mag", 6.64, 1.08, 1.18, [("t", 1.35, -1.26, 0.0)], m_bm, bevel=0.025, bevel_segs=2)
    grip_tang = mk_box("bm_grip", 1.05, 2.88, 0.72, [("rz", 0.18), ("t", -4.95, -1.95, 0.0)], m_bm, bevel=0.025)
    # Keep rear hinge block front edge <= -8.35 so it stays 100% concealed behind the flared OD-green thumbhole rim!
    hinge_blk = mk_box("bm_hblk", 0.86, 3.64, 1.04, [("t", -8.78, -1.40, 0.0)], m_bm, bevel=0.028)
    beam_u = bool_union([main_beam, mag_skirt, grip_tang, hinge_blk], "bm_u", solver="EXACT")

    cutters = [
        # Precision V-block steel action bedding trough & front recoil lug mortise
        mk_box("c_bm_act", 10.08, 0.56, 0.92, [("t", -0.28,  0.26, 0.0)], m_sl),
        mk_box("c_bm_rlg",  0.38, 0.44, 1.12, [("t",  4.45,  0.12, 0.0)], m_sl),
        # Magwell & trigger pack cutouts
        mk_box("c_bm_mag",  6.36, 2.55, 1.02, [("t",  1.35, -0.85, 0.0)], m_sl),
        mk_box("c_bm_trg",  2.42, 1.62, 0.78, [("t", -3.05, -0.55, 0.0)], m_sl),
    ]
    # 4 CNC-milled rounded-corner forend lightening truss pockets along [5.85..12.15]
    for i, px in enumerate((5.85, 7.95, 10.05, 12.15)):
        cutters.append(
            mk_box(f"c_bm_truss_{i}", 1.52, 0.68, 1.32, [("t", px, -0.26, 0.0)], m_sl, bevel=0.08, bevel_segs=2)
        )
    machined_beam = bool_subtract(beam_u, cutters, solver="EXACT")

    parts = [
        machined_beam,
        # Left-rear heavy steel twin clevis hinge knuckles mating with folding stock hinge pin
        mk_cyl("bm_hlugT", 0.27, 0.27, 0.68, "y", 22, [("t", -9.20, -0.15, -0.88)], m_pk, bevel=0.022),
        mk_cyl("bm_hlugB", 0.27, 0.27, 0.68, "y", 22, [("t", -9.20, -3.15, -0.88)], m_pk, bevel=0.022),
        # Action-bolting hardened stainless steel bedding pillars + recoil cross-pin
        mk_cyl("bm_pilR", 0.16, 0.16, 1.18, "y", 18, [("t", -4.25, -0.26, 0.0)], m_ss, bevel=0.014),
        mk_cyl("bm_pilF", 0.16, 0.16, 1.18, "y", 18, [("t",  3.95, -0.26, 0.0)], m_ss, bevel=0.014),
        mk_cyl("bm_rcpin", 0.11, 0.11, 1.10, "z", 16, [("t",  4.45, -0.10, 0.0)], m_ss, bevel=0.012),
        # Hardened stainless front Parker-Hale bipod spigot + stop collar + detent ball plunger!
        mk_cyl("bm_spig", 0.28, 0.28, 1.38, "x", 28, [("t", 14.20, -0.35, 0.0)], m_ss, bevel=0.024),
        mk_cyl("bm_scol", 0.35, 0.35, 0.16, "x", 24, [("t", 13.72, -0.35, 0.0)], m_pk, bevel=0.016),
        mk_sphere("bm_sdet", 0.075, 0.075, 0.075, 14, 10, [("t", 14.55, -0.61, 0.0)], m_pk),
    ]
    obj = join_objects(parts, "awm_chassis_beam")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_trigger_box(mats: dict) -> bpy.types.Object:
    m_ac = mats["M_ActionSteel"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_sl = mats["M_SlotDark"]
    m_br = mats["M_GoldBrass"]
    m_ss = mats["M_ChromeBolt"]

    box_raw = mk_box("tb_box", 2.18, 1.40, 0.68, [("t", 0.00, 0.02, 0.0)], m_ac, bevel=0.026, bevel_segs=2)
    top_tang = mk_box("tb_tang", 2.48, 0.22, 0.82, [("t", 0.05, 0.80, 0.0)], m_pk, bevel=0.020)
    housing_u = bool_union([box_raw, top_tang], "tb_u", solver="EXACT")

    cutters = [
        mk_box("c_tb_in", 1.74, 1.16, 0.36, [("t", 0.04, -0.05, 0.0)], m_sl),
        mk_cyl("c_tb_w1", 0.21, 0.21, 0.88, "z", 20, [("t", -0.32,  0.10, 0.0)], m_sl),
        mk_cyl("c_tb_w2", 0.16, 0.16, 0.88, "z", 18, [("t",  0.42, -0.14, 0.0)], m_sl),
    ]
    housing = bool_subtract(housing_u, cutters, solver="EXACT")

    parts = [housing]
    # 3 Brass precision adjustment screws (1st-stage travel, 2nd-stage pull weight, overtravel)
    for i, sx in enumerate((0.70, 0.08, -0.64)):
        parts.append(mk_cyl(f"tb_adj_{i}", 0.068, 0.068, 0.38, "y", 14, [("t", sx, -0.64, 0.0)], m_br, bevel=0.010))
    # 3 Hardened stainless cross-pins
    for i, (px, py) in enumerate(((-0.46, 0.42), (0.26, 0.36), (0.18, -0.45))):
        parts.append(mk_cyl(f"tb_pin_{i}", 0.065, 0.065, 0.74, "z", 16, [("t", px, py, 0.0)], m_ss, bevel=0.010))

    obj = join_objects(parts, "awm_trigger_box")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_sear(mats: dict) -> bpy.types.Object:
    m_ss = mats["M_ChromeBolt"]
    m_bf = mats["M_BoltFluteSatin"]
    m_sl = mats["M_SlotDark"]
    m_br = mats["M_GoldBrass"]

    main_bar = mk_box("sr_bar", 1.52, 0.28, 0.28, [("t", 0.00, 0.02, 0.0)], m_ss, bevel=0.018)
    tooth = mk_box("sr_tooth", 0.32, 0.38, 0.28, [("t", -0.10, 0.26, 0.0)], m_ss, bevel=0.016)
    sear_u = bool_union([main_bar, tooth], "sr_u", solver="EXACT")
    sear_body = bool_subtract(sear_u, [mk_cyl("c_srpiv", 0.075, 0.075, 0.42, "z", 16, [("t", 0.32, 0.02, 0.0)], m_sl)], solver="EXACT")

    parts = [
        sear_body,
        mk_box("sr_tleg", 0.26, 0.58, 0.24, [("t", 0.46, -0.28, 0.0)], m_bf, bevel=0.016),
        mk_coil_spring("sr_spr", "y", -0.42, -0.08, -0.52, 0.0, 0.085, 0.020, 5.0, ring_segs=8, steps_per_coil=14, mat=m_br),
    ]
    obj = join_objects(parts, "awm_sear")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_trigger_shoe(mats: dict) -> bpy.types.Object:
    m_ac = mats["M_ActionSteel"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_bf = mats["M_BoltFluteSatin"]
    m_ss = mats["M_ChromeBolt"]
    m_sl = mats["M_SlotDark"]

    yoke_raw = mk_box("ts_yoke", 0.58, 0.34, 0.28, [("t", -0.02, 0.08, 0.0)], m_ac, bevel=0.018)
    yoke = bool_subtract(yoke_raw, [mk_box("c_tslot", 0.38, 0.12, 0.14, [("t", -0.02, 0.08, 0.0)], m_sl)], solver="EXACT")

    blade_ctrl = [
        Vector(( 0.06, -0.26, 0.0)),
        Vector(( 0.19, -0.56, 0.0)),
        Vector(( 0.13, -0.86, 0.0)),
        Vector((-0.08, -1.08, 0.0)),
    ]
    blade_pts = _catmull_rom_pts(blade_ctrl, samples_per_seg=8)
    # Match CSG blade cross-section: radius 0.105 scaled (0.85, 1.0, 1.6)
    blade = mk_tube_along_pts("ts_blade", blade_pts, 0.102, ring_segs=16, scale_yz=(1.58, 0.85), mat=m_ac)

    parts = [
        yoke,
        mk_box("ts_post", 0.22, 0.34, 0.24, [("t", 0.02, -0.18, 0.0)], m_bf, bevel=0.016),
        mk_cyl("ts_scr", 0.06, 0.06, 0.34, "z", 6, [("t", 0.02, -0.14, 0.04)], m_ss, bevel=0.008),
        blade,
    ]
    # 5 Tactile longitudinal finger ribs along curved match trigger front face
    for ri, gz in enumerate((-0.11, -0.055, 0.0, 0.055, 0.11)):
        rib_ctrl = [
            Vector((0.14, -0.34, gz)),
            Vector((0.26, -0.58, gz)),
            Vector((0.20, -0.85, gz)),
            Vector((0.00, -1.04, gz)),
        ]
        parts.append(mk_tube_along_pts(f"ts_rib_{ri}", _catmull_rom_pts(rib_ctrl, 6), 0.016, ring_segs=8, mat=m_pk))

    obj = join_objects(parts, "awm_trigger_shoe")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_mag_catch(mats: dict) -> bpy.types.Object:
    m_ac = mats["M_ActionSteel"]
    m_pk = mats["M_ParkerizedCtrl"]
    m_ss = mats["M_ChromeBolt"]

    parts = [
        mk_box("mc_hook", 0.32, 0.64, 0.48, [("t", 0.09, 0.25, 0.0)], m_ac, bevel=0.020),
        mk_box("mc_pad", 0.22, 0.72, 0.66, [("rz", -0.22), ("t", -0.06, -0.34, 0.0)], m_pk, bevel=0.022),
        mk_cyl("mc_pin", 0.078, 0.078, 0.94, "z", 16, [("t", 0.0, 0.05, 0.0)], m_ss, bevel=0.010),
    ]
    for i, sy in enumerate((-0.18, -0.31, -0.44, -0.57)):
        parts.append(
            mk_box(f"mc_ser_{i}", 0.06, 0.045, 0.68,
                   [("rz", -0.22), ("t", -0.16 + (sy + 0.34) * 0.22, sy, 0.0)], m_ss, bevel=0.008)
        )
    obj = join_objects(parts, "awm_mag_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 3: OPTIC, MOUNT, BIPOD & .338 LM MAG ATLAS (6 PARTS) ---

def build_awm_scope(mats: dict) -> bpy.types.Object:
    m_sc = mats["O_ScopeAnodize"]
    m_kn = mats["O_ScopeTurretKnurl"]
    m_rb = mats["O_ScopeRubber"]
    m_yw = mats["O_DTYellow"]
    m_ln = mats["O_CoatedLens"]
    m_sl = mats["O_SlotDark"]
    m_ss = mats["O_BrightStainless"]

    # High-res 48-seg closed watertight Schmidt & Bender PM II 5-25x56 FFP Scope Tube Lathe
    # (assembledPos = [1.7, 3.42, 0] -> local X in [-9.90, +9.90])
    tube_pts = [
        (0.000, -9.22),
        (0.640, -9.22),  # Deeply recessed ocular glass seat
        (0.660, -9.90),  # Rear ocular bevel
        (0.840, -9.90),  # Fast-focus diopter ring
        (0.840, -9.32),
        (0.780, -9.26),  # Ocular locking step
        (0.790, -7.25),  # Ocular housing
        (0.840, -7.15),  # 5-25x magnification power ring
        (0.840, -6.05),
        (0.620, -5.62),  # Smooth fillet into 34mm main tube
        (0.620,  2.45),  # 34mm central tube (clamped by AI dual rings at local X = -4.35 & +0.05)
        (0.720,  3.25),  # Smooth bell transition
        (1.120,  5.65),  # 56mm objective bell flare
        (1.120, 10.02),  # 56mm objective bell + integral sunshade hood
        (1.000, 10.02),  # Front sunshade rim
        (0.960,  8.76),  # Deeply recessed objective anti-reflection interior cavity
        (0.000,  8.76),
    ]
    main_tube = mk_lathe_x("sc_tube", tube_pts, segs=64, mat=m_sc)

    # Assign dark internal sunshade/ocular baffle material strictly inside front/rear optical cavities
    main_tube.data.materials.append(m_sl)
    bm = bmesh.new()
    bm.from_mesh(main_tube.data)
    for f in bm.faces:
        c = f.calc_center_median()
        r = math.hypot(c.y, c.z)
        if (c.x > 8.75 and r < 0.995) or (c.x < -9.20 and r < 0.655):
            f.material_index = 1
    bm.to_mesh(main_tube.data)
    bm.free()

    parts: list[bpy.types.Object] = [main_tube]

    # Internal objective & ocular anti-reflection threaded retaining baffle rings + rubber fast-focus diopter ring
    for i, bx in enumerate((9.08, 9.42, 9.74)):
        parts.append(mk_torus(f"sc_baf_{i}", 0.975, 0.022, "x", 36, 8, [("t", bx, 0.0, 0.0)], m_sl))
    parts.extend([
        mk_torus("sc_obaf", 0.650, 0.022, "x", 30, 8, [("t", -9.45, 0.0, 0.0)], m_sl),
        mk_knurled_cyl("sc_diop", 0.852, 0.44, "x", flutes=36, depth=0.016,
                       xform=[("t", -9.62, 0.0, 0.0)], mat=m_rb),
    ])

    # 16 Sculpted axial grip ribs around the 5-25x magnification ring + ergonomic throw lever fin!
    for k in range(16):
        ang = (k * 2.0 * math.pi) / 16.0
        ry = math.cos(ang) * 0.842
        rz = math.sin(ang) * 0.842
        parts.append(
            mk_box(f"sc_mrib_{k}", 0.96, 0.045, 0.056, [("rx", -ang), ("t", -6.60, ry, rz)], m_kn, bevel=0.010, bevel_segs=1)
        )
    parts.append(
        mk_box("sc_zfin", 0.72, 0.28, 0.16, [("rx", 0.28), ("t", -6.60, 0.93, -0.26)], m_sc, bevel=0.032, bevel_segs=2)
    )

    # Multi-coated emerald-sapphire curved optical objective (56mm) & ocular lenses! (FIREWALLED UV BOX!)
    parts.extend([
        mk_sphere("sc_lensF", 0.19, 0.955, 0.955, 36, 20, [("t",  8.80, 0.0, 0.0)], m_ln),
        mk_sphere("sc_lensR", 0.14, 0.635, 0.635, 28, 16, [("t", -9.24, 0.0, 0.0)], m_ln),
    ])

    # Sculpted chamfered octagonal erector turret saddle block around local X = -2.05 (World X = -0.35!)
    sad_zy = [
        (-0.56, -0.75), ( 0.56, -0.75),
        ( 0.75, -0.56), ( 0.75,  0.56),
        ( 0.56,  0.75), (-0.56,  0.75),
        (-0.75,  0.56), (-0.75, -0.56),
    ]
    parts.append(mk_extrude_x("sc_saddle", sad_zy, -3.01, -1.09, bevel=0.036, bevel_segs=2, mat=m_sc))

    # 1. Tall S&B PM II Double-Turn (DT) 0.1 MRAD Elevation Turret (+Y at X = -2.05)
    #    Smooth lower MIL-number skirt (Y in [0.92, 1.44]) receives Hero 0..14 MIL UV band;
    #    upper crown (Y in [1.44, 1.65]) has real 3D knurling + yellow DT 2nd-turn indicator ring!
    parts.extend([
        mk_cyl("sc_elcol", 0.73, 0.75, 0.20, "y", 36, [("t", -2.05, 0.82, 0.0)], m_kn, bevel=0.016),
        mk_cyl("sc_elmil", 0.695, 0.705, 0.54, "y", 40, [("t", -2.05, 1.18, 0.0)], m_sc, bevel=0.012),
        mk_knurled_cyl("sc_elkn", 0.705, 0.24, "y", flutes=30, depth=0.022,
                       xform=[("t", -2.05, 1.54, 0.0)], mat=m_kn),
        mk_cyl("sc_eldty", 0.645, 0.675, 0.11, "y", 36, [("t", -2.05, 1.70, 0.0)], m_yw, bevel=0.010),
        mk_cyl("sc_elcap", 0.600, 0.645, 0.10, "y", 36, [("t", -2.05, 1.79, 0.0)], m_sc, bevel=0.018),
    ])
    # Twin stainless zero-stop hex set screws on elevation turret skirt
    for si, ang in enumerate((0.40, 2.74)):
        parts.append(
            mk_cyl(f"sc_elset_{si}", 0.045, 0.045, 0.08, "x", 6,
                   [("ry", -ang), ("t", -2.05 + math.cos(ang) * 0.695, 1.14, math.sin(ang) * 0.695)], m_ss)
        )

    # 2. Right-side MTC Locking Windage Turret (+Z) w/ 3D Knurled Drum
    parts.extend([
        mk_cyl("sc_wcol", 0.61, 0.63, 0.20, "z", 32, [("t", -2.05, 0.0, 0.82)], m_kn, bevel=0.014),
        mk_cyl("sc_wmil", 0.57, 0.59, 0.36, "z", 34, [("t", -2.05, 0.0, 1.09)], m_sc, bevel=0.012),
        mk_knurled_cyl("sc_wkn", 0.585, 0.28, "z", flutes=26, depth=0.022,
                       xform=[("t", -2.05, 0.0, 1.38)], mat=m_kn),
        mk_cyl("sc_wcap", 0.48, 0.54, 0.08, "z", 30, [("t", -2.05, 0.0, 1.54)], m_sc, bevel=0.016),
    ])

    # 3. Left-side Coaxial Side Parallax Focus Turret (50m - Infinity, -Z) w/ 3D Knurled Crown
    parts.extend([
        mk_cyl("sc_pcol", 0.63, 0.65, 0.22, "z", 32, [("t", -2.05, 0.0, -0.82)], m_kn, bevel=0.014),
        mk_cyl("sc_pmil", 0.595, 0.61, 0.38, "z", 34, [("t", -2.05, 0.0, -1.10)], m_sc, bevel=0.012),
        mk_knurled_cyl("sc_pkn", 0.61, 0.28, "z", flutes=28, depth=0.022,
                       xform=[("t", -2.05, 0.0, -1.40)], mat=m_kn),
        mk_cyl("sc_pcap", 0.52, 0.56, 0.07, "z", 28, [("t", -2.05, 0.0, -1.53)], m_sc, bevel=0.014),
    ])

    # 4. S&B PM II Angled 45-deg 11-Position Reticle Illumination Rheostat Dial (upper-left behind saddle)
    parts.extend([
        mk_cyl("sc_ipod", 0.42, 0.45, 0.64, "y", 28, [("rx", -math.pi * 0.25), ("t", -4.78, 0.56, -0.56)], m_sc, bevel=0.016),
        mk_knurled_cyl("sc_icap", 0.415, 0.18, "y", flutes=22, depth=0.018,
                       xform=[("rx", -math.pi * 0.25), ("t", -4.78, 0.84, -0.84)], mat=m_kn),
    ])

    obj = join_objects(parts, "awm_scope")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_scope_mount(mats: dict) -> bpy.types.Object:
    m_al = mats["O_MountAlloy"]
    m_st = mats["O_BipodSteel"]
    m_kn = mats["O_ScopeTurretKnurl"]
    m_ss = mats["O_BrightStainless"]
    m_sl = mats["O_SlotDark"]

    # Monolithic CNC rail clamp base (assembledPos = [-0.4, 2.82, 0] -> local X in [-3.45, +3.45])
    base_raw = mk_box("sm_base", 6.90, 0.50, 1.34, [("t", 0.0, -0.47, 0.0)], m_al, bevel=0.024, bevel_segs=2)
    base_cuts = [
        mk_box("c_smgrv", 7.20, 0.24, 0.86, [("t", 0.0, -0.65, 0.0)], m_sl),
        mk_box("c_smdov", 7.20, 0.14, 0.14, [("rx", math.pi * 0.25), ("t", 0.0, -0.58, -0.43)], m_sl),
        mk_box("c_smbrg", 2.45, 0.34, 1.60, [("t", -0.05, -0.26, 0.0)], m_sl, bevel=0.04, bevel_segs=2),
        mk_box("c_smscL", 2.10, 0.24, 0.24, [("t", -0.05, -0.44, -0.66)], m_kn, bevel=0.03),
    ]
    base_bar = bool_subtract(base_raw, base_cuts, solver="EXACT")

    parts: list[bpy.types.Object] = [
        base_bar,
        # Right-side movable dovetail clamping jaw bar + underside stainless recoil stop keys
        mk_box("sm_jaw", 6.75, 0.34, 0.18, [("t", 0.0, -0.53, 0.69)], m_st, bevel=0.018),
        mk_box("sm_jbev", 6.75, 0.11, 0.11, [("rx", math.pi * 0.25), ("t", 0.0, -0.58, 0.56)], m_st),
        mk_box("sm_rkey1", 0.22, 0.14, 0.82, [("t", -1.95, -0.68, 0.0)], m_ss, bevel=0.012),
        mk_box("sm_rkey2", 0.22, 0.14, 0.82, [("t",  1.95, -0.68, 0.0)], m_ss, bevel=0.012),
    ]

    # Two heavy 34mm scope rings at local X = -2.25 & +2.15 (bore R = 0.625 clamping 34mm scope flush!)
    for ri, rx in enumerate((-2.25, 2.15)):
        outer_r = mk_cyl(f"sm_or_{ri}", 0.88, 0.88, 1.14, "x", 36, [("t", rx, 0.60, 0.0)], m_al, bevel=0.022)
        stanch = mk_box(f"sm_st_{ri}", 1.14, 0.86, 1.28, [("t", rx, -0.01, 0.0)], m_al, bevel=0.022)
        flg_l = mk_box(f"sm_flL_{ri}", 1.10, 0.28, 0.34, [("t", rx, 0.60, -0.92)], m_st, bevel=0.018)
        flg_r = mk_box(f"sm_flR_{ri}", 1.10, 0.28, 0.34, [("t", rx, 0.60,  0.92)], m_st, bevel=0.018)
        top_rib = mk_box(f"sm_trib_{ri}", 1.06, 0.12, 0.42, [("t", rx, 1.48, 0.0)], m_kn, bevel=0.018)
        ring_u = bool_union([outer_r, stanch, flg_l, flg_r, top_rib], f"sm_ru_{ri}", solver="EXACT")

        ring_cuts = [
            mk_cyl(f"c_smbore_{ri}", 0.625, 0.625, 1.44, "x", 36, [("t", rx, 0.60, 0.0)], m_sl),
            mk_box(f"c_smsplL_{ri}", 1.32, 0.055, 0.60, [("t", rx, 0.60, -0.92)], m_sl),
            mk_box(f"c_smsplR_{ri}", 1.32, 0.055, 0.60, [("t", rx, 0.60,  0.92)], m_sl),
        ]
        parts.append(bool_subtract(ring_u, ring_cuts, solver="EXACT"))

        # 4 Stainless socket-head Torx/Allen ring screws per ring (8 total)
        for dx in (-0.33, 0.33):
            for side in (-1.0, 1.0):
                parts.extend([
                    mk_cyl(f"sm_scr_{ri}_{dx:.2f}_{side:.0f}", 0.082, 0.082, 0.38, "y", 16,
                           [("t", rx + dx, 0.69, side * 0.92)], m_ss, bevel=0.010),
                    mk_cyl(f"sm_hex_{ri}_{dx:.2f}_{side:.0f}", 0.044, 0.044, 0.03, "y", 6,
                           [("t", rx + dx, 0.872, side * 0.92)], m_sl),
                ])

    # 3 Heavy AI 13mm hex clamping cross-bolt nuts + washer collars on right flank (+Z)
    for bi, bx in enumerate((-2.55, 0.0, 2.45)):
        parts.extend([
            mk_cyl(f"sm_cb_{bi}", 0.14, 0.14, 1.54, "z", 16, [("t", bx, -0.52, 0.05)], m_ss, bevel=0.012),
            mk_cyl(f"sm_cw_{bi}", 0.22, 0.22, 0.06, "z", 20, [("t", bx, -0.52, 0.80)], m_st, bevel=0.008),
            mk_cyl(f"sm_cn_{bi}", 0.19, 0.19, 0.16, "z", 6,  [("t", bx, -0.52, 0.90)], m_ss, bevel=0.014),
        ])

    obj = join_objects(parts, "awm_scope_mount")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_bipod(mats: dict) -> bpy.types.Object:
    m_al = mats["O_MountAlloy"]
    m_st = mats["O_BipodSteel"]
    m_kn = mats["O_ScopeTurretKnurl"]
    m_ss = mats["O_BrightStainless"]
    m_sp = mats["O_SpringSteel"]
    m_sl = mats["O_SlotDark"]

    # Heavy Parker-Hale pendular cant-swivel spigot yoke block (assembledPos = [14.4, -0.35, 0])
    blk_raw = mk_box("bp_yoke", 1.48, 1.24, 1.58, [("t", 0.12, -0.18, 0.0)], m_al, bevel=0.036, bevel_segs=2)
    spig_cut = mk_cyl("c_bpspg", 0.295, 0.295, 1.72, "x", 24, [("t", 0.05, 0.0, 0.0)], m_sl)
    yoke = bool_subtract(blk_raw, [spig_cut], solver="EXACT")

    parts: list[bpy.types.Object] = [
        yoke,
        # Quick-detach spigot lock latch lever + stainless pivot pin + cant-tension knurled thumbwheel
        mk_box("bp_qd", 0.62, 0.22, 0.34, [("rz", -0.20), ("t", -0.28, -0.86, 0.0)], m_kn, bevel=0.020),
        mk_cyl("bp_piv", 0.12, 0.12, 1.74, "z", 18, [("t", 0.18, -0.42, 0.0)], m_ss, bevel=0.014),
        mk_knurled_cyl("bp_cant", 0.22, 0.20, "x", flutes=20, depth=0.018,
                       xform=[("t", 0.88, -0.52, 0.0)], mat=m_kn),
    ]

    # Left & Right deployed Parker-Hale stamped U-channel telescoping legs + external springs + curved ribbed ski feet!
    for side in (-1.0, 1.0):
        s_tag = "R" if side > 0 else "L"
        leg_xform = [("rx", -side * 0.42), ("rz", 0.28), ("t", 0.18, -0.42, side * 0.58)]

        # Upper stamped U-channel leg (length 2.85) with 3 circular lightening perforations
        uleg_raw = mk_box(f"bp_ul_{s_tag}", 0.56, 2.85, 0.44, [("t", 0.0, -1.42, 0.0)], m_st, bevel=0.024, bevel_segs=2)
        uleg_cuts = [
            mk_box(f"c_bpch_{s_tag}", 0.32, 2.55, 0.26, [("t", 0.14, -1.48, 0.0)], m_sl),
            mk_cyl(f"c_bph1_{s_tag}", 0.13, 0.13, 0.68, "z", 16, [("t", 0.0, -0.75, 0.0)], m_sl),
            mk_cyl(f"c_bph2_{s_tag}", 0.13, 0.13, 0.68, "z", 16, [("t", 0.0, -1.42, 0.0)], m_sl),
            mk_cyl(f"c_bph3_{s_tag}", 0.13, 0.13, 0.68, "z", 16, [("t", 0.0, -2.08, 0.0)], m_sl),
        ]
        uleg = bool_subtract(uleg_raw, uleg_cuts, solver="EXACT")

        leg_sub = [
            uleg,
            # Telescoping notched stainless inner leg tube
            mk_cyl(f"bp_in_{s_tag}", 0.17, 0.15, 2.25, "y", 20, [("t", 0.0, -3.55, 0.0)], m_ss, bevel=0.012),
            # Spring-loaded thumb ratchet lock collar & release button
            mk_box(f"bp_rat_{s_tag}", 0.66, 0.34, 0.54, [("t", 0.0, -2.72, 0.0)], m_kn, bevel=0.022),
            mk_cyl(f"bp_rbtn_{s_tag}", 0.09, 0.09, 0.20, "x", 14, [("t", -0.36, -2.72, 0.0)], m_ss, bevel=0.010),
            # External helical leg tension spring
            mk_coil_spring(f"bp_espr_{s_tag}", "y", -2.25, -0.45, -0.34, 0.0, 0.115, 0.028, 11.0,
                           ring_segs=8, steps_per_coil=14, mat=m_sp),
        ]
        for ni, ny in enumerate((-3.05, -3.45, -3.85, -4.25)):
            leg_sub.append(mk_torus(f"bp_n_{s_tag}_{ni}", 0.162, 0.014, "y", 18, 8, [("t", 0.0, ny, 0.0)], m_st))

        # Join leg assembly & apply exact Three.js splay/cant transform in Blender space!
        leg_obj = join_objects(leg_sub, f"bp_leg_{s_tag}")
        bm = bmesh.new()
        bm.from_mesh(leg_obj.data)
        # Verts are currently in Blender space -> convert to Three.js, apply leg_xform, convert back to Blender
        m_leg = Matrix.Identity(4)
        for op in leg_xform:
            if op[0] == "rx":
                m_leg = Matrix.Rotation(op[1], 4, "X") @ m_leg
            elif op[0] == "rz":
                m_leg = Matrix.Rotation(op[1], 4, "Z") @ m_leg
            elif op[0] == "t":
                m_leg = Matrix.Translation(Vector((op[1], op[2], op[3]))) @ m_leg
        bmesh.ops.transform(bm, matrix=T2B_MAT @ m_leg @ B2T_MAT, verts=bm.verts)
        bm.to_mesh(leg_obj.data)
        bm.free()
        parts.append(leg_obj)

        # Articulated ankle clevis + curved Parker-Hale ribbed ski foot connected flush at (1.36, -4.52, side*2.49)
        parts.extend([
            mk_box(f"bp_ank_{s_tag}", 0.38, 0.30, 0.40, [("t", 1.36, -4.48, side * 2.49)], m_st, bevel=0.020),
            mk_cyl(f"bp_apin_{s_tag}", 0.065, 0.065, 0.50, "z", 14, [("t", 1.36, -4.48, side * 2.49)], m_ss, bevel=0.008),
            mk_box(f"bp_ski_{s_tag}", 1.42, 0.15, 0.70, [("t", 1.45, -4.60, side * 2.49)], m_st, bevel=0.024),
            mk_box(f"bp_toe_{s_tag}", 0.44, 0.15, 0.70, [("rz", 0.48), ("t", 2.22, -4.48, side * 2.49)], m_st, bevel=0.022),
            mk_box(f"bp_hel_{s_tag}", 0.26, 0.14, 0.70, [("rz", -0.36), ("t", 0.68, -4.54, side * 2.49)], m_st, bevel=0.020),
        ])
        for ri, rx in enumerate((0.98, 1.32, 1.66, 2.00)):
            parts.append(mk_box(f"bp_srib_{s_tag}_{ri}", 0.08, 0.05, 0.68, [("t", rx, -4.68, side * 2.49)], m_kn, bevel=0.008))

    obj = join_objects(parts, "awm_bipod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_awm_mag_body(mats: dict) -> bpy.types.Object:
    m_mg = mats["O_MagSteel"]
    m_kn = mats["O_ScopeTurretKnurl"]
    m_ss = mats["O_BrightStainless"]
    m_sl = mats["O_SlotDark"]

    # 5-Round .338 Lapua Magnum Corrugated Steel Box Magazine (assembledPos = [1.35, -1.85, 0])
    outer_box = mk_box("mag_out", 6.32, 4.44, 1.26, [("t", 0.0, -0.13, 0.0)], m_mg, bevel=0.026, bevel_segs=2)
    cutters = [
        mk_box("c_mcav", 6.02, 4.38, 1.04, [("t", 0.0, -0.04, 0.0)], m_sl),
        mk_box("c_mtop", 5.96, 0.46, 0.96, [("t", 0.06, 2.08, 0.0)], m_sl),
        mk_box("c_mfrt", 0.72, 0.44, 1.04, [("t", 2.90, 1.98, 0.0)], m_sl),
    ]
    # 3 Rear spine witness holes + 3 right-flank round-count witness holes
    for i, wy in enumerate((-1.55, -0.65, 0.25)):
        cutters.append(mk_cyl(f"c_mwitB_{i}", 0.085, 0.085, 0.42, "x", 16, [("t", -3.12, wy, 0.0)], m_sl))
    for i, wy in enumerate((-1.45, -0.55, 0.35)):
        cutters.append(mk_cyl(f"c_mwitR_{i}", 0.072, 0.072, 0.28, "z", 16, [("t", -1.62, wy, 0.58)], m_sl))

    shell = bool_subtract(outer_box, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        shell,
        mk_box("mag_rlug", 0.24, 0.34, 0.68, [("t", -3.20, -0.02, 0.0)], m_ss, bevel=0.018),
        mk_box("mag_flug", 0.22, 0.28, 0.68, [("t",  3.20,  0.12, 0.0)], m_ss, bevel=0.018),
        mk_box("mag_rseam", 0.08, 4.15, 0.46, [("t", -3.17, -0.15, 0.0)], m_kn, bevel=0.012),
    ]

    # Inwardly curled stainless steel .338 LM center-feed lips (X in [-2.95, +2.37])
    for side in (-1.0, 1.0):
        s_tag = "R" if side > 0 else "L"
        lip_zy: list[tuple[float, float]] = [(side * 0.625, 1.84), (side * 0.628, 1.985)]
        lip_zy += _quad_bez((side * 0.628, 1.985), (side * 0.615, 2.082), (side * 0.460, 2.082), 5)
        lip_zy += [(side * 0.305, 2.035), (side * 0.325, 1.985), (side * 0.465, 2.026)]
        lip_zy += _quad_bez((side * 0.465, 2.026), (side * 0.568, 2.024), (side * 0.572, 1.965), 5)
        lip_zy.append((side * 0.572, 1.84))
        parts.append(mk_extrude_x(f"mag_lip_{s_tag}", lip_zy, -2.95, 2.37, bevel=0.010, bevel_segs=2, mat=m_ss))

    # 5 Smooth press-formed vertical strengthening corrugation ribs per side (leaving lower skirt clean for AI stamp!)
    for side in (-1.0, 1.0):
        s_tag = "R" if side > 0 else "L"
        rib_xz: list[tuple[float, float]] = [(-0.095, side * 0.628)]
        rib_xz += _quad_bez((-0.095, side * 0.628), (-0.082, side * 0.676), (0.0, side * 0.678), 5)
        rib_xz += _quad_bez((0.0, side * 0.678), (0.082, side * 0.676), (0.095, side * 0.628), 5)
        for ri, rx in enumerate((-2.16, -1.08, 0.0, 1.08, 2.16)):
            # Span Y in [-1.52, +1.42] -> leaves Y in [-2.35, -1.55] clean for crisp "AI · .338 LAPUA MAG · 5 RD" stamp!
            parts.append(
                mk_extrude_y(f"mag_rib_{s_tag}_{ri}", rib_xz, -1.52, 1.42, bevel=0.014, bevel_segs=2,
                             xform=[("t", rx, 0.0, 0.0)], mat=m_kn)
            )

    # Front spine spot-weld dimple bosses
    for i, wy in enumerate((-1.85, -0.95, 0.0, 0.95)):
        parts.append(mk_cyl(f"mag_sw_{i}", 0.055, 0.055, 0.05, "x", 12, [("t", 3.16, wy, 0.0)], m_mg, bevel=0.008))

    obj = join_objects(parts, "awm_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_awm_mag_spring(mats: dict) -> bpy.types.Object:
    m_sp = mats["O_SpringSteel"]
    # True watertight parametric wide-oval 5-coil stainless spring (Y in [-0.19, +0.19], rx=2.38, rz=0.36)
    steps = 160
    coils = 5.0
    pts = []
    for i in range(steps + 1):
        t = i / steps
        th = t * coils * 2.0 * math.pi
        pts.append(Vector((math.cos(th) * 2.38, -0.19 + 0.38 * t, math.sin(th) * 0.36)))
    obj = mk_tube_along_pts("awm_mag_spring", pts, 0.034, ring_segs=10, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=45.0, weighted_normals=False)


def build_awm_mag_floorplate(mats: dict) -> bpy.types.Object:
    m_mg = mats["O_MagSteel"]
    m_kn = mats["O_ScopeTurretKnurl"]
    m_ss = mats["O_BrightStainless"]
    m_sl = mats["O_SlotDark"]

    base_raw = mk_box("fp_base", 6.74, 0.18, 1.42, [("t", 0.0, -0.11, 0.0)], m_mg, bevel=0.022, bevel_segs=2)
    base_plate = bool_subtract(
        base_raw,
        [mk_cyl("c_fpbtn", 0.28, 0.28, 0.16, "y", 22, [("t", 0.0, -0.16, 0.0)], m_sl)],
        solver="EXACT",
    )
    parts = [
        base_plate,
        mk_box("fp_rL", 6.38, 0.16, 0.14, [("t", 0.0, 0.02, -0.64)], m_kn, bevel=0.016),
        mk_box("fp_rR", 6.38, 0.16, 0.14, [("t", 0.0, 0.02,  0.64)], m_kn, bevel=0.016),
        mk_cyl("fp_lipF", 0.08, 0.08, 1.42, "z", 16, [("t",  3.36, -0.12, 0.0)], m_mg, bevel=0.012),
        mk_cyl("fp_lipR", 0.08, 0.08, 1.42, "z", 16, [("t", -3.36, -0.12, 0.0)], m_mg, bevel=0.012),
        mk_cyl("fp_lbtn", 0.23, 0.23, 0.14, "y", 22, [("t",  0.00, -0.15, 0.0)], m_ss, bevel=0.018),
    ]
    obj = join_objects(parts, "awm_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart CONCAVE Packing (margin = 0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    any_selected = False
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
            if not is_hero:
                any_selected = True
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    assert any_selected, f"_smart_unwrap_and_pack_rect: zero faces selected for {[o.name for o in objs]}"

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
    assert span_u > 0.50 and span_v > 0.50, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_chassis_atlas(chassis_objs: list[bpy.types.Object]):
    """Unwraps 5 chassis/stock/follower parts into `awm_v3_chassis` (2048x2048):
      - OD-Green Skins + Folding Stock:         u in [0.010, 0.990], v in [0.280, 0.990]
      - Cheekpiece + Sorbothane Buttpad:        u in [0.010, 0.780], v in [0.010, 0.265]
      - Firewalled Orange Magazine Follower:    u in [0.805, 0.990], v in [0.010, 0.265]
    """
    od_grp = [o for o in chassis_objs if o.name in {"awm_chassis_skins", "awm_folding_stock"}]
    blk_grp = [o for o in chassis_objs if o.name in {"awm_cheekpiece", "awm_buttpad_spacers"}]
    flw_grp = [o for o in chassis_objs if o.name == "awm_mag_follower"]
    _smart_unwrap_and_pack_rect(od_grp,  0.010, 0.990, 0.280, 0.990)
    _smart_unwrap_and_pack_rect(blk_grp, 0.010, 0.780, 0.010, 0.265)
    _smart_unwrap_and_pack_rect(flw_grp, 0.805, 0.990, 0.010, 0.265)


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 12 metal/action/barrel/bolt/beam/FCG parts into `awm_v3_metal` (2048x2048):
      - Hero Band 1 (Receiver Left  Wall -Z):   u in [0.015, 0.985], v in [0.820, 0.985]
      - Hero Band 2 (Receiver Right Wall +Z):   u in [0.015, 0.985], v in [0.640, 0.805]
      - Exterior Barrel, Brake, Bolt, Rec Rest: u in [0.010, 0.990], v in [0.220, 0.625]
      - CNC Spine Beam & Internal FCG/Striker:  u in [0.010, 0.990], v in [0.010, 0.205]
    """
    def is_receiver_hero_wall(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "awm_action_receiver" or mat_name != "M_ActionSteel":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -5.32 <= tx <= 4.76 and -0.63 <= ty <= 0.58:
            if nz > 0.88 and tz > 0.74:
                return True
            if nz < -0.88 and tz < -0.74:
                return True
        return False

    ext_grp = [o for o in metal_objs if o.name in {
        "awm_action_receiver", "awm_barrel", "awm_muzzle_brake", "awm_bolt_body", "awm_bolt_shroud"
    }]
    int_grp = [o for o in metal_objs if o not in ext_grp]

    _smart_unwrap_and_pack_rect(ext_grp, 0.010, 0.990, 0.220, 0.625, skip_face_fn=is_receiver_hero_wall)
    _smart_unwrap_and_pack_rect(int_grp, 0.010, 0.990, 0.010, 0.205)

    # Project exact world-space 1:1 hero UVs onto Flat-Sided Steel Action Left & Right Walls
    rec = next(o for o in metal_objs if o.name == "awm_action_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rec.data.materials]
    hero_count = 0
    hero_area = 0.0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_receiver_hero_wall("awm_action_receiver", f, mname):
            continue
        hero_count += 1
        hero_area += f.calc_area()
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 5.305) / 10.05))
            yn = max(0.0, min(1.0, (ty + 0.61) / 1.17))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.640 + yn * 0.165)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.820 + yn * 0.165)
    bm.to_mesh(rec.data)
    bm.free()
    print(f"  [UV-HERO] awm_action_receiver mapped {hero_count} hero flank faces (area={hero_area:.2f} cm^2)")
    assert hero_count >= 2 and hero_area > 14.0, f"Receiver hero walls missed! count={hero_count}, area={hero_area:.2f}"


def unwrap_optic_atlas(optic_objs: list[bpy.types.Object]):
    """Unwraps 6 optic/mount/bipod/mag parts into `awm_v3_optic` (2048x2048):
      - Hero Band 1 (S&B Elevation MIL Drum):   u in [0.015, 0.680], v in [0.830, 0.985]
      - Hero Band 2a (S&B Tube Right Flank):    u in [0.015, 0.680], v in [0.710, 0.815]
      - Hero Band 2b (S&B Tube Left  Flank):    u in [0.015, 0.680], v in [0.595, 0.700]
      - Packed Scope Rest + Mount + Bipod:      u in [0.010, 0.690], v in [0.010, 0.580]
      - Firewalled Front 56mm Objective Lens:   u in [0.710, 0.890], v in [0.805, 0.985]
      - Firewalled Rear Ocular Lens:            u in [0.900, 0.985], v in [0.900, 0.985]
      - Firewalled Lens Back Hemispheres:       u in [0.900, 0.985], v in [0.805, 0.890]
      - Hero Band 3 (.338 LM Mag Right Flank):  u in [0.710, 0.985], v in [0.460, 0.685]
      - Hero Band 4 (.338 LM Mag Left  Flank):  u in [0.710, 0.985], v in [0.220, 0.445]
      - Packed Mag Rest + Spring + Floorplate:  u in [0.710, 0.990], v in [0.010, 0.205]
    """
    def classify_scope_face(obj_name: str, face, mat_name: str) -> str:
        if obj_name != "awm_scope":
            return ""
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if mat_name == "O_CoatedLens":
            if tx > 0.0:
                return "lens_front" if nx >= 0.0 else "lens_back"
            return "lens_rear" if nx <= 0.0 else "lens_back"

        if mat_name == "O_ScopeAnodize":
            # Elevation turret cylindrical MIL skirt: centered at X=-2.05, Z=0, Y in [0.92, 1.44], radius ~0.70
            rad_el = math.hypot(tx + 2.05, tz)
            if 0.64 <= rad_el <= 0.73 and 0.925 <= ty <= 1.435 and abs(ny) < 0.35:
                return "elev_drum"
            # S&B PM II Objective Bell (X in [5.5..10.02]) & Ocular Housing (X in [-9.3..-6.0]) side flanks
            if ((5.50 <= tx <= 10.02) or (-9.30 <= tx <= -6.00)) and abs(ny) < 0.62:
                if nz > 0.55 and tz > 0.35:
                    return "tube_right"
                if nz < -0.55 and tz < -0.35:
                    return "tube_left"
        return ""

    def is_scope_hero(obj_name: str, face, mat_name: str) -> bool:
        return classify_scope_face(obj_name, face, mat_name) != ""

    def is_mag_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "awm_mag_body" or mat_name != "O_MagSteel":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.88 and tz > 0.59:
            return True
        if nz < -0.88 and tz < -0.59:
            return True
        return False

    scope_grp = [o for o in optic_objs if o.name in {"awm_scope", "awm_scope_mount", "awm_bipod"}]
    mag_grp = [o for o in optic_objs if o.name in {"awm_mag_body", "awm_mag_spring", "awm_mag_floorplate"}]

    _smart_unwrap_and_pack_rect(scope_grp, 0.010, 0.690, 0.010, 0.580, skip_face_fn=is_scope_hero)
    _smart_unwrap_and_pack_rect(mag_grp,   0.710, 0.990, 0.010, 0.205, skip_face_fn=is_mag_hero)

    # Project hero UVs onto S&B PM II scope turrets, tube flanks & firewalled sapphire-emerald lenses
    sc = next(o for o in optic_objs if o.name == "awm_scope")
    bm = bmesh.new()
    bm.from_mesh(sc.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sc.data.materials]
    counts = {"elev_drum": 0, "tube_right": 0, "tube_left": 0, "lens_front": 0, "lens_rear": 0, "lens_back": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_scope_face("awm_scope", f, mname)
        if not tag:
            continue
        counts[tag] += 1
        fc = f.calc_center_median()
        if tag == "elev_drum":
            # Seamless cylindrical wrap around turret vertical Y axis centered at (-2.05, 0)
            fcx, fcz = fc.x + 2.05, -fc.y
            ang_c = math.atan2(fcz, fcx)  # in (-pi, pi]
            for loop in f.loops:
                vco = loop.vert.co
                vx, vy, vz = vco.x + 2.05, vco.z, -vco.y
                ang_v = math.atan2(vz, vx)
                # Prevent quad stretching across the +-pi seam & invert U so MIL numbers read left-to-right!
                if ang_v - ang_c > math.pi:
                    ang_v -= 2.0 * math.pi
                elif ang_v - ang_c < -math.pi:
                    ang_v += 2.0 * math.pi
                u_frac = max(0.0, min(1.0, 1.0 - (ang_v + math.pi) / (2.0 * math.pi)))
                v_frac = max(0.0, min(1.0, (vy - 0.91) / 0.54))
                loop[uv_layer].uv = (0.015 + u_frac * 0.665, 0.830 + v_frac * 0.155)
        elif tag == "tube_right":
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 9.90) / 19.80))
                yn = max(0.0, min(1.0, (ty + 1.05) / 2.10))
                loop[uv_layer].uv = (0.015 + xn * 0.665, 0.710 + yn * 0.105)
        elif tag == "tube_left":
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 9.90) / 19.80))
                yn = max(0.0, min(1.0, (ty + 1.05) / 2.10))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.665, 0.595 + yn * 0.105)
        elif tag == "lens_front":
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                un = max(-1.0, min(1.0, tz / 0.98))
                vn = max(-1.0, min(1.0, ty / 0.98))
                loop[uv_layer].uv = (0.800 + un * 0.086, 0.895 + vn * 0.086)
        elif tag == "lens_rear":
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                un = max(-1.0, min(1.0, tz / 0.66))
                vn = max(-1.0, min(1.0, ty / 0.66))
                loop[uv_layer].uv = (0.9425 + un * 0.040, 0.9425 + vn * 0.040)
        elif tag == "lens_back":
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                un = max(-1.0, min(1.0, tz / 1.05))
                vn = max(-1.0, min(1.0, ty / 1.05))
                loop[uv_layer].uv = (0.9425 + un * 0.036, 0.8475 + vn * 0.036)
    bm.to_mesh(sc.data)
    bm.free()
    print(f"  [UV-HERO] awm_scope hero face counts: {counts}")
    assert counts["elev_drum"] >= 20 and counts["lens_front"] >= 20, f"Scope hero faces missed: {counts}"

    # Project hero UVs onto .338 LM Magazine Left & Right Flanks
    mag = next(o for o in optic_objs if o.name == "awm_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    m_cnt = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero("awm_mag_body", f, mname):
            continue
        m_cnt += 1
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 3.16) / 6.32))
            yn = max(0.0, min(1.0, (ty + 2.35) / 4.44))
            if is_right:
                loop[uv_layer].uv = (0.710 + xn * 0.275, 0.460 + yn * 0.225)
            else:
                loop[uv_layer].uv = (0.710 + (1.0 - xn) * 0.275, 0.220 + yn * 0.225)
    bm.to_mesh(mag.data)
    bm.free()
    print(f"  [UV-HERO] awm_mag_body mapped {m_cnt} hero flank faces")


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
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]):
    for i, o in enumerate(all_objs):
        o.location = (i * 75.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            o.rotation_euler = (0.0, 0.0, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 220.0, 0.0)


def _set_assembled_full_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object], tmp_dir: Path):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
                 normal_op: bool = False, extra_objs_override=None):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
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
    run_bake("albedo", "EMIT", samples=4, fill_color=(0.04, 0.048, 0.042, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=4, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=4, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.65
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.48
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
    scene.cycles.samples = 4
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
# Strict Manifold, Normal-Alignment & Bounding-Box Verification + Draco Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
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
        bmin = (min(xs), min(ys), min(zs))
        bmax = (max(xs), max(ys), max(zs))
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()

        ref_min, ref_max = CSG_REF_BBOX[o.name]
        deltas = [abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)]
        d_max = max(deltas)
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.14) else "WARN"
        print(
            f"  [{status}] {o.name:22s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.14:
            print(f"       !! BBOX DELTA > 0.14cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    return report


def triangulate_keep_normals(all_objs: list[bpy.types.Object]):
    """Locks WeightedNormal planar loop normals into beauty triangles BEFORE Cycles NORMAL baking & export!"""
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


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


def _render_studio_previews(all_objs: list[bpy.types.Object], preview_dir: Path):
    """Renders quick Cycles verification shots using the final baked v3 WebP PBR suites."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3

    # Attach baked WebP PBR materials to verify actual exported UVs + ORM + Normals!
    def mk_baked_mat(suite: str, normal_strength: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(f"Baked_{suite}")
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        tex_alb = nt.nodes.new("ShaderNodeTexImage")
        tex_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"awm_v3_{suite}_albedo.webp"))
        tex_alb.image.colorspace_settings.name = "sRGB"

        tex_orm = nt.nodes.new("ShaderNodeTexImage")
        tex_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"awm_v3_{suite}_roughness.webp"))
        tex_orm.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex_orm.outputs["Color"], sep.inputs["Color"])

        mix_ao = nt.nodes.new("ShaderNodeMix")
        mix_ao.data_type = "RGBA"
        mix_ao.blend_type = "MULTIPLY"
        mix_ao.inputs["Factor"].default_value = 0.85
        nt.links.new(tex_alb.outputs["Color"], mix_ao.inputs[6])
        nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])
        nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        tex_nrm = nt.nodes.new("ShaderNodeTexImage")
        tex_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"awm_v3_{suite}_normal.webp"))
        tex_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_ch = mk_baked_mat("chassis", 0.90)
    mat_mt = mk_baked_mat("metal", 0.86)
    mat_op = mk_baked_mat("optic", 0.85)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in CHASSIS_PARTS:
            o.data.materials.append(mat_ch)
        elif o.name in METAL_PARTS:
            o.data.materials.append(mat_mt)
        else:
            o.data.materials.append(mat_op)

    _set_assembled_full_layout(all_objs)

    # Load repo studio HDRI if available, else bright studio softbox world
    w_nt = scene.world.node_tree
    if not scene.world.use_nodes:
        scene.world.use_nodes = True
        w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "gunsmith_bench.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.15
    else:
        w_bg.inputs["Color"].default_value = (0.14, 0.16, 0.18, 1.0)
        w_bg.inputs["Strength"].default_value = 1.0
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    # Studio softbox lights
    for lname, loc_t, energy, size in (
        ("KeyLight",  (12.0, 26.0,  28.0), 18000.0, 22.0),
        ("FillLight", (-8.0, 14.0, -28.0), 11000.0, 24.0),
        ("RimLight",  (18.0, 24.0, -14.0), 14000.0, 16.0),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc_t)
        d = t2b(2.0, 0.0, 0.0) - lobj.location
        lobj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    shots = [
        ("awm_iso_right.png",     (18.0, 10.5,  64.0), ( 4.5, -0.4,  0.0), 46.0),
        ("awm_left_receiver.png", (-2.0,  2.8, -19.5), (-1.5,  0.8,  0.0), 58.0),
        ("awm_right_action.png",  ( 2.0,  4.2,  19.0), (-2.5,  0.5,  0.0), 56.0),
        ("awm_muzzle_brake.png",  (35.5,  3.8,   9.5), (27.5,  1.0,  0.0), 60.0),
        ("awm_scope_lens.png",    (19.5,  4.8,   7.5), ( 5.5,  3.3,  0.0), 62.0),
    ]
    for fname, cpos, ctgt, lens in shots:
        cam_data.lens = lens
        cam_obj.location = t2b(*cpos)
        direction = t2b(*ctgt) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(preview_dir / fname)
        bpy.ops.render.render(write_still=True)
        print(f"[PREVIEW] Rendered {preview_dir / fname}")


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        "awm_chassis_skins":   build_awm_chassis_skins,
        "awm_folding_stock":   build_awm_folding_stock,
        "awm_cheekpiece":      build_awm_cheekpiece,
        "awm_buttpad_spacers": build_awm_buttpad_spacers,
        "awm_mag_follower":    build_awm_mag_follower,
        "awm_action_receiver": build_awm_action_receiver,
        "awm_barrel":          build_awm_barrel,
        "awm_muzzle_brake":    build_awm_muzzle_brake,
        "awm_bolt_body":       build_awm_bolt_body,
        "awm_bolt_shroud":     build_awm_bolt_shroud,
        "awm_striker":         build_awm_striker,
        "awm_extractor":       build_awm_extractor,
        "awm_chassis_beam":    build_awm_chassis_beam,
        "awm_trigger_box":     build_awm_trigger_box,
        "awm_sear":            build_awm_sear,
        "awm_trigger_shoe":    build_awm_trigger_shoe,
        "awm_mag_catch":       build_awm_mag_catch,
        "awm_scope":           build_awm_scope,
        "awm_scope_mount":     build_awm_scope_mount,
        "awm_bipod":           build_awm_bipod,
        "awm_mag_body":        build_awm_mag_body,
        "awm_mag_spring":      build_awm_mag_spring,
        "awm_mag_floorplate":  build_awm_mag_floorplate,
    }

    print("[BUILD] Sculpting all 23 solid Accuracy International AWM (.338 LM) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    chassis_objs = [built[pid] for pid in CHASSIS_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    optic_objs = [built[pid] for pid in OPTIC_PARTS]
    all_objs = chassis_objs + metal_objs + optic_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: chassis (5), metal (12), optic (6)...")
    unwrap_chassis_atlas(chassis_objs)
    unwrap_metal_atlas(metal_objs)
    unwrap_optic_atlas(optic_objs)

    # Lock WeightedNormal planar normals into beauty triangles BEFORE Cycles NORMAL baking & glTF export!
    triangulate_keep_normals(all_objs)

    for label, group in (("chassis", chassis_objs), ("metal", metal_objs), ("optic", optic_objs)):
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

    with tempfile.TemporaryDirectory(prefix="awm_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking awm_v3_chassis (2048x2048, 5 OD-green chassis/stock/follower parts)...")
        bake_atlas_suite("chassis", chassis_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking awm_v3_metal (2048x2048, 12 action/barrel/brake/bolt/beam/FCG parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking awm_v3_optic (2048x2048, 6 S&B scope/mount/bipod/mag parts)...")
        bake_atlas_suite("optic", optic_objs, all_objs, tmp_dir)

        print("[POST] Compositing AI Portsmouth rollmarks, BNP crowns, S&B 0..14 MIL turrets, lenses & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--render-preview" in sys.argv:
        pidx = sys.argv.index("--render-preview")
        _render_studio_previews(all_objs, Path(sys.argv[pidx + 1]))
    elif "--preview" in sys.argv:
        _render_studio_previews(all_objs, Path("/tmp/awm_qa"))

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "awm_v3_chassis_albedo.webp",
        TEX_OUT_DIR / "awm_v3_chassis_normal.webp",
        TEX_OUT_DIR / "awm_v3_chassis_roughness.webp",
        TEX_OUT_DIR / "awm_v3_metal_albedo.webp",
        TEX_OUT_DIR / "awm_v3_metal_normal.webp",
        TEX_OUT_DIR / "awm_v3_metal_roughness.webp",
        TEX_OUT_DIR / "awm_v3_optic_albedo.webp",
        TEX_OUT_DIR / "awm_v3_optic_normal.webp",
        TEX_OUT_DIR / "awm_v3_optic_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== ACCURACY INTERNATIONAL AWM (.338 LM) V3 ASSET BUDGET ===")
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
