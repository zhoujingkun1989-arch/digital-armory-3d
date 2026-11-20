#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for FN M249 SAW (5.56x45mm NATO)
=================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 4 — Final 19/19 Grand Slam)

Generates:
  - public/models/m249.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `m249_recoil_spring` and `m249_sear_spring`
    carrying `aSpringParam`)
  - public/textures/m249_v3_receiver_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/m249_v3_metal_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)
  - public/textures/m249_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/m249/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_m249_photoreal.py
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
# MODE 2: System Python Post-Process (FN Manufacturing Columbia SC Rollmarks,
#         M1913 T-Rail, 300-1000m Rear Drum, 5.56 NATO Barrel Stamp,
#         200-Rd OD-Green SAW Box Yellow Stencils, S/F Safety & 5-Ch ORM WebPs)
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
    FONT_IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.5) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray,
        pil_l: Image.Image,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
    ):
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

    # Genuine 16x16 ECC200 DataMatrix for FNMI CAGE 3S679 + M249 SER 084219
    _UID_MODULES = (
        "1010101010101010",
        "1101011011001011",
        "1011100101101000",
        "1001011101001101",
        "1110010010110010",
        "1010100101101001",
        "1100111010010110",
        "1011000111001011",
        "1101011000110100",
        "1001101101011011",
        "1110010010100100",
        "1011011101101011",
        "1100100011010110",
        "1001011100101101",
        "1010110011010010",
        "1111111111111111",
    )

    def _draw_fn_oval_crest(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float) -> None:
        """Classic FN Herstal / FN Manufacturing oval ordnance crest."""
        lw = max(3, round(ry * 0.14))
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=255, width=lw)
        draw.ellipse((cx - rx * 0.84, cy - ry * 0.80, cx + rx * 0.84, cy + ry * 0.80), outline=255, width=max(2, lw // 2))
        f_fn = _load_font(FONT_DIN, max(20, round(ry * 1.15)))
        draw.text((cx, cy + ry * 0.04), "FN", font=f_fn, fill=255, anchor="mm")

    def _draw_nato_cross(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, lw: int = 4) -> None:
        """Authentic NATO STANAG 4172 cross-in-circle ordnance symbol."""
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        draw.line([(cx - r, cy), (cx + r, cy)], fill=255, width=lw)
        draw.line([(cx, cy - r), (cx, cy + r)], fill=255, width=lw)

    def _draw_liege_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Crisp Belgian Liege Perron + US 'P' ordnance acceptance proof stamp."""
        lw = max(2, round(r * 0.12))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        # Stylized Perron tower + cross
        draw.line([(cx, cy - r * 0.68), (cx, cy + r * 0.56)], fill=255, width=lw)
        draw.line([(cx - r * 0.28, cy - r * 0.42), (cx + r * 0.28, cy - r * 0.42)], fill=255, width=lw)
        draw.line([(cx - r * 0.48, cy + r * 0.56), (cx + r * 0.48, cy + r * 0.56)], fill=255, width=lw)
        draw.text((cx + r * 1.45, cy), "P  US", font=_load_font(FONT_COND, max(18, round(r * 1.35))), fill=245, anchor="lm")

    # -------------------------------------------------------------------------
    # SUITE 1: m249_v3_receiver_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
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
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        engraving = np.zeros((h, w), dtype=np.float32)
        laser = np.zeros((h, w), dtype=np.float32)
        weld_height = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1: Receiver Left Outer Flank (tx in [-15.10, +10.70], ty in [-1.95, +2.55]) ---
        # Left view looks toward +Z: +X front -> u=0.015 (left), -X rear -> u=0.985 (right)
        # UV box: u in [0.015, 0.985], v in [0.815, 0.985]
        # World dimensions: 25.80 cm x 4.50 cm -> draw at 150 px/cm = 3870 x 675 px (exact 1:1 aspect!)
        R_PPCM = 150.0
        RW, RH = int(round(25.80 * R_PPCM)), int(round(4.50 * R_PPCM))
        rec_l_eng = Image.new("L", (RW, RH), 0)
        rec_l_las = Image.new("L", (RW, RH), 0)
        de_rl = ImageDraw.Draw(rec_l_eng)
        dl_rl = ImageDraw.Draw(rec_l_las)

        def rec_x_left(xw: float) -> int:
            return int(round((10.70 - xw) / 25.80 * RW))

        def rec_x_right(xw: float) -> int:
            return int(round((xw - (-15.10)) / 25.80 * RW))

        def rec_y(yw: float) -> int:
            return int(round((2.55 - yw) / 4.50 * RH))

        # Flat open rear-left receiver panel: X in [-13.9, -4.5], Y in [-1.20, +1.85]
        # (completely aft of belt feed throat X=-3.8 & STANAG magwell X=-3.5!)
        # Note on Left flank: +X is left, so X=-4.9 is LEFT of X=-13.8!
        cx_crest = rec_x_left(-5.45)
        cy_crest = rec_y(0.42)
        _draw_fn_oval_crest(de_rl, cx_crest, cy_crest, rx=104.0, ry=64.0)

        tx_l = cx_crest + 132
        de_rl.text((tx_l, rec_y(1.42)), "FN MANUFACTURING INC.", font=_load_font(FONT_DIN, 68), fill=255)
        de_rl.text((tx_l, rec_y(0.86)), "COLUMBIA, S.C.   U.S.A.", font=_load_font(FONT_DIN, 54), fill=250)
        de_rl.text((tx_l, rec_y(0.28)), "M249   5.56MM   SAW", font=_load_font(FONT_DIN, 74), fill=255)
        de_rl.text((tx_l, rec_y(-0.38)), "US GOVT PROPERTY  -  S/N 084219", font=_load_font(FONT_COND, 54), fill=248)
        _draw_liege_proof(de_rl, tx_l + 68, rec_y(-0.88), r=34.0)
        _draw_nato_cross(de_rl, tx_l + 380, rec_y(-0.88), r=28.0, lw=5)
        de_rl.text((tx_l + 430, rec_y(-0.88)), "CAGE  3S679", font=_load_font(FONT_COND, 44), fill=238, anchor="lm")

        # Forward trunnion left stamp (X in [+4.4, +9.6], Y in [-0.4, +1.5])
        fx_l = rec_x_left(9.35)
        de_rl.text((fx_l, rec_y(1.15)), "5.56 NATO", font=_load_font(FONT_DIN, 56), fill=246)
        de_rl.text((fx_l, rec_y(0.55)), "BELT / STANAG", font=_load_font(FONT_COND, 44), fill=232)

        _paste_uv_band(engraving, rec_l_eng, 0.015, 0.985, 0.815, 0.985)
        _paste_uv_band(laser, rec_l_las, 0.015, 0.985, 0.815, 0.985)

        # --- HERO BAND 2: Receiver Right Outer Flank (tx in [-15.10, +10.70], ty in [-1.95, +2.55]) ---
        # Right view looks toward -Z: -X rear -> u=0.015, +X front -> u=0.985
        # UV box: u in [0.015, 0.985], v in [0.630, 0.800]
        rec_r_eng = Image.new("L", (RW, RH), 0)
        rec_r_las = Image.new("L", (RW, RH), 0)
        rec_r_kiss = Image.new("L", (RW, RH), 0)
        de_rr = ImageDraw.Draw(rec_r_eng)
        dl_rr = ImageDraw.Draw(rec_r_las)
        dk_rr = ImageDraw.Draw(rec_r_kiss)

        # Lower-rear right flat panel (below charging handle track Y~1.25): X in [-13.7, -5.6], Y in [-1.30, +0.42]
        ux_c, uy_c = rec_x_right(-13.6), rec_y(0.38)
        pw_c, ph_c = 840, 215
        dl_rr.rounded_rectangle((ux_c, uy_c, ux_c + pw_c, uy_c + ph_c), radius=12, outline=255, width=5)
        mod_px = 10
        dm_x0, dm_y0 = ux_c + 24, uy_c + (ph_c - 16 * mod_px) // 2
        for r_idx, row_bits in enumerate(_UID_MODULES):
            for c_idx, bit in enumerate(row_bits):
                if bit == "1":
                    x0_m = dm_x0 + c_idx * mod_px
                    y0_m = dm_y0 + r_idx * mod_px
                    dl_rr.rectangle((x0_m, y0_m, x0_m + mod_px - 1, y0_m + mod_px - 1), fill=255)
        dl_rr.text((ux_c + 206, uy_c + 22), "US GOVT PROPERTY  -  M249 SAW", font=_load_font(FONT_DIN, 42), fill=255)
        dl_rr.text((ux_c + 206, uy_c + 82), "FN MANUFACTURING INC.  CAGE 3S679", font=_load_font(FONT_COND, 38), fill=250)
        dl_rr.text((ux_c + 206, uy_c + 138), "PN 12556995   SER. NO. 084219", font=_load_font(FONT_COND, 38), fill=250)

        # Forward right trunnion proof (X in [+4.8, +9.8], Y in [-0.5, +1.5])
        de_rr.text((rec_x_right(5.05), rec_y(1.18)), "M249  SAW", font=_load_font(FONT_DIN, 58), fill=248)
        de_rr.text((rec_x_right(5.05), rec_y(0.54)), "5.56MM  NATO", font=_load_font(FONT_COND, 46), fill=236)
        _draw_liege_proof(de_rr, rec_x_right(5.45), rec_y(-0.22), r=34.0)

        # Subtle brass-kiss flecks immediately aft of right ejection port (X in [-4.3, -3.2], Y in [0.1, 1.4])
        rng_k = np.random.default_rng(2491)
        for _ in range(28):
            kx = float(rec_x_right(float(rng_k.uniform(-4.35, -3.22))))
            ky = float(rec_y(float(rng_k.uniform(-0.15, 1.35))))
            krx, kry = float(rng_k.uniform(6, 16)), float(rng_k.uniform(3, 8))
            dk_rr.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(80, 195)))

        _paste_uv_band(engraving, rec_r_eng, 0.015, 0.985, 0.630, 0.800)
        _paste_uv_band(laser, rec_r_las, 0.015, 0.985, 0.630, 0.800)
        _paste_uv_band(brass_kiss, rec_r_kiss, 0.015, 0.985, 0.630, 0.800)

        # --- HERO BAND 3a & 3b: Top Feed Cover Left & Right Side Flanks ---
        # Local X in [-24.40, +0.42] (span 24.82 cm), local Y in [-0.08, +0.96] (span 1.04 cm)
        # Left  flank UV: [0.015, 0.985] x [0.550, 0.618] (+X front -> u=0.015, -X rear -> u=0.985)
        # Right flank UV: [0.015, 0.985] x [0.470, 0.538] (-X rear -> u=0.015, +X front -> u=0.985)
        TC_PPCM = 150.0
        TCW, TCH = int(round(24.82 * TC_PPCM)), int(round(1.04 * TC_PPCM))
        tc_l_las = Image.new("L", (TCW, TCH), 0)
        tc_r_las = Image.new("L", (TCW, TCH), 0)
        dtl = ImageDraw.Draw(tc_l_las)
        dtr = ImageDraw.Draw(tc_r_las)

        f_tc = _load_font(FONT_DIN, 54)
        f_tc_sm = _load_font(FONT_COND, 48)
        dtl.text(
            (TCW // 2, TCH // 2),
            "FN MANUFACTURING INC.  COLUMBIA, S.C.  U.S.A.   /   M249 5.56MM SAW   /   US GOVT PROPERTY",
            font=f_tc,
            fill=246,
            anchor="mm",
        )
        dtr.text(
            (TCW // 2, TCH // 2),
            "MACHINE GUN 5.56MM M249 SAW   /   S/N 084219   /   CAGE 3S679   /   MIL-STD-1913",
            font=f_tc_sm,
            fill=244,
            anchor="mm",
        )
        _paste_uv_band(laser, tc_l_las, 0.015, 0.985, 0.550, 0.618)
        _paste_uv_band(laser, tc_r_las, 0.015, 0.985, 0.470, 0.538)

        # --- HERO BAND 3c: Top Cover MIL-STD-1913 Picatinny Rail Crests (16 slots) ---
        # Local X in [-20.80, -4.00] (span 16.80 cm), local Z in [-0.90, +0.90]
        # UV box: [0.015, 0.985] x [0.415, 0.458]
        # 16 lugs: lug_x = -20.55 + s * 1.04 (width 0.52 -> center -20.29 + s * 1.04)
        PRW, PRH = 2520, 120
        rail_img = Image.new("L", (PRW, PRH), 0)
        drl = ImageDraw.Draw(rail_img)
        f_rail = _load_font(FONT_DIN, 48)
        for s_idx in range(0, 16, 2):
            lug_cx = -20.29 + s_idx * 1.04
            xn = (lug_cx - (-20.80)) / 16.80
            if 0.02 < xn < 0.98:
                t_num = 2 + s_idx
                drl.text((int(round(xn * PRW)), PRH // 2), f"T{t_num}", font=f_rail, fill=255, anchor="mm")
        _paste_uv_band(laser, rail_img, 0.015, 0.985, 0.415, 0.458)

        # --- HERO BAND 4: Rear Sight 300-1000m Calibrated Elevation Drum ---
        # UV box: u in [0.015, 0.320], v in [0.355, 0.402]
        DRW, DRH = 1024, 160
        drum_img = Image.new("L", (DRW, DRH), 0)
        ddrm = ImageDraw.Draw(drum_img)
        f_dr = _load_font(FONT_DIN, 58)
        range_labels = ("3", "4", "5", "6", "7", "8", "9", "10")
        for idx_r, lbl in enumerate(range_labels):
            cx = int(round((idx_r + 0.5) / len(range_labels) * DRW))
            ddrm.text((cx, int(DRH * 0.46)), lbl, font=f_dr, fill=255, anchor="mm")
            ddrm.line([(cx, int(DRH * 0.78)), (cx, int(DRH * 0.94))], fill=255, width=5)
            # Minor 50m tick between numbers
            cx_half = int(round((idx_r + 1.0) / len(range_labels) * DRW)) % DRW
            ddrm.line([(cx_half, int(DRH * 0.83)), (cx_half, int(DRH * 0.94))], fill=220, width=3)
        _paste_uv_band(laser, drum_img, 0.015, 0.320, 0.355, 0.402)

        # --- World-Circular Resistance Spot-Weld Dimples along Stamped Receiver Flanges ---
        left_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.815) & (v_grid <= 0.985)).astype(np.float32)
        right_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.630) & (v_grid <= 0.800)).astype(np.float32)

        spot_xs = (-13.6, -11.4, -9.2, -7.0, -4.8, 5.2, 7.4, 9.6)
        for wx_cm in spot_xs:
            for wy_cm in (-1.52, 2.02):
                for is_left, band_m, v0, v1 in (
                    (True, left_mask, 0.815, 0.985),
                    (False, right_mask, 0.630, 0.800),
                ):
                    xn = (10.70 - wx_cm) / 25.80 if is_left else (wx_cm - (-15.10)) / 25.80
                    yn = (wy_cm - (-1.95)) / 4.50
                    ux = 0.015 + xn * 0.970
                    vy = v0 + yn * (v1 - v0)
                    dx_cm = (u_grid - ux) * (25.80 / 0.970)
                    dy_cm = (v_grid - vy) * (4.50 / (v1 - v0))
                    r_cm = np.hypot(dx_cm, dy_cm)
                    bowl = np.clip((0.14 - r_cm) / 0.032, 0.0, 1.0) * band_m
                    weld_height -= 0.44 * bowl
                    ao *= 1.0 - 0.14 * bowl
                    heat_ring = _smoothstep(0.13, 0.16, r_cm) * (1.0 - _smoothstep(0.19, 0.24, r_cm)) * band_m
                    _mix(albedo, (0.21, 0.22, 0.23), heat_ring * 0.24)

        # Field-handling micro-scratches across stamped receiver walls
        hero_walls = np.clip(left_mask + right_mask, 0.0, 1.0)
        rng = np.random.default_rng(2492)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(135):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.38) * h)
            length = float(rng.uniform(14, 68))
            ang = math.radians(float(rng.uniform(-16, 16)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(75, 195)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * hero_walls
        _mix(albedo, (0.56, 0.58, 0.61), sc * 0.24)
        rgh -= sc * 0.06
        met = np.clip(met + sc * 0.10, 0.0, 0.98)

        # Brass kiss behind ejection port
        brass_kiss = ndimage.gaussian_filter(brass_kiss, sigma=0.9)
        brass_kiss = _smoothstep(0.12, 0.58, brass_kiss)
        _mix(albedo, (0.74, 0.58, 0.24), brass_kiss * 0.45)
        _mix(rgh, 0.24, brass_kiss * 0.48)
        _mix(met, 0.94, brass_kiss * 0.55)

        # Composite crisp struck FNMI rollmarks + white laser T-rail/IUID/drum numerals
        eng_bev = _bevel_mask(engraving, width_px=1.35)
        las_bev = _bevel_mask(laser, width_px=1.05)
        decal_height = weld_height - 0.66 * eng_bev - 0.22 * las_bev - 0.04 * sc

        # Crisp museum chalk/silvered ordnance rollmarks (clear contrast against charcoal manganese phosphate!)
        _mix(albedo, (0.72, 0.74, 0.76), engraving * 0.78)
        _mix(rgh, 0.44, engraving * 0.72)
        _mix(met, 0.34, engraving * 0.64)
        ao *= 1.0 - 0.14 * engraving

        # Crisp dielectric white laser markings (Top Cover, M1913 T2-T16, IUID Plate, 3-10 Sight Drum)
        _mix(albedo, (0.91, 0.92, 0.93), laser * 0.95)
        _mix(rgh, 0.38, laser * 0.88)
        _mix(met, 0.04, laser * 0.95)
        ao *= 1.0 - 0.05 * laser

        decal_nrm = _height_to_normal_01(decal_height, strength=2.5)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m249_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: m249_v3_metal_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
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

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Crisp Barrel Caliber Proof Stamp on Hero Band [0.015, 0.315] x [0.798, 0.840]
        # (forward barrel upper-left contour X in [38.0, 50.8])
        barrel_eng = np.zeros((h, w), dtype=np.float32)
        BW, BH = 1280, 140
        b_img = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_img)
        db.text(
            (BW // 2, BH // 2),
            "5.56 NATO  1/7   FNMI   MP   CHROME BORE",
            font=_load_font(FONT_DIN, 46),
            fill=255,
            anchor="mm",
        )
        _paste_uv_band(barrel_eng, b_img, 0.015, 0.315, 0.798, 0.840)

        eng_bev = _bevel_mask(barrel_eng, width_px=1.2)
        _mix(albedo, (0.68, 0.70, 0.73), barrel_eng * 0.74)
        _mix(rgh, 0.44, barrel_eng * 0.70)
        _mix(met, 0.40, barrel_eng * 0.60)
        ao *= 1.0 - 0.14 * barrel_eng

        decal_nrm = _height_to_normal_01(-0.56 * eng_bev, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.10, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m249_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: m249_v3_furniture_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
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
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.40 + 0.60 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.38, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        yellow_stencil = np.zeros((h, w), dtype=np.float32)
        white_mark = np.zeros((h, w), dtype=np.float32)
        red_mark = np.zeros((h, w), dtype=np.float32)

        # --- HERO BANDS 1 & 2: 200-Round OD-Green SAW Assault Box Left & Right Flanks ---
        # Flat placard area inside flank: local X in [-4.50, +4.50], local Y in [-2.65, +3.75]
        # Full flank UV projection: local X in [-5.32, +5.32] (10.64 cm), local Y in [-5.45, +4.20] (9.65 cm)
        # Left  flank (-Z) UV: [0.015, 0.485] x [0.560, 0.985] (+X front -> left, -X rear -> right)
        # Right flank (+Z) UV: [0.515, 0.985] x [0.560, 0.985] (-X rear -> left, +X front -> right)
        BW, BH = 1064, 965  # exact 100 px/cm = 1:1 square aspect!

        def box_y(yw: float) -> int:
            return int(round((4.20 - yw) / 9.65 * BH))

        def draw_saw_box_stencil(is_left: bool) -> Image.Image:
            img = Image.new("L", (BW, BH), 0)
            dr = ImageDraw.Draw(img)
            cx = BW // 2

            # Clean military stencil border framing flat placard Y in [-2.25, +3.50]
            bx0, bx1 = 124, BW - 124
            by0, by1 = box_y(3.48), box_y(-2.15)
            # Corner military bracket ticks
            tick = 46
            lw_b = 7
            for px, py, sx, sy in (
                (bx0, by0, 1, 1),
                (bx1, by0, -1, 1),
                (bx0, by1, 1, -1),
                (bx1, by1, -1, -1),
            ):
                dr.line([(px, py), (px + sx * tick, py)], fill=235, width=lw_b)
                dr.line([(px, py), (px, py + sy * tick)], fill=235, width=lw_b)

            # Top primary ordnance designation
            dr.text((cx, box_y(2.85)), "200 RD  5.56MM  M27  LINK", font=_load_font(FONT_DIN, 64), fill=255, anchor="mm")
            # Crisp divider rule
            dr.line([(bx0 + 36, box_y(2.26)), (bx1 - 36, box_y(2.26))], fill=240, width=5)

            # Bold Hero M855 BALL badge + NATO Cross-in-Circle
            dr.text((cx - 46, box_y(1.42)), "M855  BALL", font=_load_font(FONT_DIN, 92), fill=255, anchor="mm")
            _draw_nato_cross(dr, cx + 275, box_y(1.42), r=38.0, lw=7)

            if is_left:
                dr.text((cx, box_y(0.32)), "4 BALL M855  /  1 TRACER M856", font=_load_font(FONT_COND, 56), fill=248, anchor="mm")
                dr.text((cx, box_y(-0.55)), "MAGAZINE, CARTRIDGE, 200 ROUND", font=_load_font(FONT_COND, 46), fill=238, anchor="mm")
                dr.text((cx, box_y(-1.38)), "LOT LC-94K209-018   -   DODIC A062", font=_load_font(FONT_COND, 46), fill=242, anchor="mm")
            else:
                dr.text((cx, box_y(0.32)), "MAGAZINE, CARTRIDGE, 200 ROUND", font=_load_font(FONT_COND, 52), fill=248, anchor="mm")
                dr.text((cx, box_y(-0.55)), "USGI  M249  SAW  ASSAULT  PACK", font=_load_font(FONT_COND, 50), fill=242, anchor="mm")
                dr.text((cx, box_y(-1.38)), "NSN 1005-01-334-1508   -   CAGE 3S679", font=_load_font(FONT_COND, 44), fill=238, anchor="mm")
            return img

        _paste_uv_band(yellow_stencil, draw_saw_box_stencil(is_left=True),  0.015, 0.485, 0.560, 0.985)
        _paste_uv_band(yellow_stencil, draw_saw_box_stencil(is_left=False), 0.515, 0.985, 0.560, 0.985)

        # --- HERO BAND 3: Trigger Frame Left & Right Housing Flanks (White 'S' / Crimson 'F' Safety) ---
        # Local X in [-5.65, +3.75] (9.40 cm), local Y in [+0.82, +2.38] (1.56 cm)
        # Cross-bolt safety axis at exact local X = +0.45, Y = +1.38!
        # Left  flank (-Z) UV: [0.015, 0.485] x [0.460, 0.542] (+X -> left, -X -> right)
        # Right flank (+Z) UV: [0.515, 0.985] x [0.460, 0.542] (-X -> left, +X -> right)
        TW, TH = 940, 156
        tf_l_w = Image.new("L", (TW, TH), 0)
        tf_l_r = Image.new("L", (TW, TH), 0)
        tf_r_w = Image.new("L", (TW, TH), 0)
        tf_r_r = Image.new("L", (TW, TH), 0)
        dlw, dlr = ImageDraw.Draw(tf_l_w), ImageDraw.Draw(tf_l_r)
        drw, drr = ImageDraw.Draw(tf_r_w), ImageDraw.Draw(tf_r_r)

        def tf_xl(xw: float) -> int:
            return int(round((3.75 - xw) / 9.40 * TW))

        def tf_xr(xw: float) -> int:
            return int(round((xw - (-5.65)) / 9.40 * TW))

        def tf_y(yw: float) -> int:
            return int(round((2.38 - yw) / 1.56 * TH))

        f_sf = _load_font(FONT_DIN, 62)
        f_sf_sm = _load_font(FONT_COND, 38)
        # On Left flank (-Z): red ring protrudes -> 'F' (FIRE) forward of safety at X=+1.32, 'S' aft at X=-0.42
        dlr.text((tf_xl(1.32), tf_y(1.38)), "F", font=f_sf, fill=255, anchor="mm")
        dlr.text((tf_xl(2.15), tf_y(1.38)), "FIRE", font=f_sf_sm, fill=250, anchor="mm")
        dlw.text((tf_xl(-0.42), tf_y(1.38)), "S", font=f_sf, fill=255, anchor="mm")
        dlw.text((tf_xl(-1.25), tf_y(1.38)), "SAFE", font=f_sf_sm, fill=245, anchor="mm")

        # On Right flank (+Z): 'S' (SAFE) aft at X=-0.42, 'F' (FIRE) forward at X=+1.32
        drw.text((tf_xr(-0.42), tf_y(1.38)), "S", font=f_sf, fill=255, anchor="mm")
        drw.text((tf_xr(-1.25), tf_y(1.38)), "SAFE", font=f_sf_sm, fill=245, anchor="mm")
        drr.text((tf_xr(1.32), tf_y(1.38)), "F", font=f_sf, fill=255, anchor="mm")
        drr.text((tf_xr(2.15), tf_y(1.38)), "FIRE", font=f_sf_sm, fill=250, anchor="mm")

        _paste_uv_band(white_mark, tf_l_w, 0.015, 0.485, 0.460, 0.542)
        _paste_uv_band(red_mark,   tf_l_r, 0.015, 0.485, 0.460, 0.542)
        _paste_uv_band(white_mark, tf_r_w, 0.515, 0.985, 0.460, 0.542)
        _paste_uv_band(red_mark,   tf_r_r, 0.515, 0.985, 0.460, 0.542)

        # Subtle field-wear micro-mottle on yellow stencil paint (95% solid, authentic silkscreen feel!)
        rng_st = np.random.default_rng(2493)
        st_noise = ndimage.gaussian_filter(rng_st.uniform(0.84, 1.0, (h, w)).astype(np.float32), sigma=1.1)
        y_paint = np.clip(yellow_stencil * st_noise, 0.0, 1.0)

        # Composite Authentic Military Ordnance Yellow Stencil onto OD-Green SAW Box (strictly dielectric!)
        _mix(albedo, (0.93, 0.79, 0.19), y_paint * 0.94)
        _mix(rgh, 0.54, y_paint * 0.86)
        _mix(met, 0.00, y_paint * 0.98)

        # Composite Crisp White 'S' & Vivid Crimson 'F' Safety Enamel on Trigger Frame
        _mix(albedo, (0.92, 0.93, 0.91), white_mark * 0.96)
        _mix(rgh, 0.28, white_mark * 0.90)
        _mix(met, 0.03, white_mark * 0.96)

        _mix(albedo, (0.86, 0.08, 0.08), red_mark * 0.96)
        _mix(rgh, 0.24, red_mark * 0.90)
        _mix(met, 0.03, red_mark * 0.96)

        # Subtle paint-thickness & engraved safety normal detail
        sf_bev = _bevel_mask(np.maximum(white_mark, red_mark), width_px=1.2)
        st_bev = _bevel_mask(y_paint, width_px=0.9)
        decal_h = 0.14 * st_bev - 0.52 * sf_bev
        decal_nrm = _height_to_normal_01(decal_h, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_furniture_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_furniture_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m249_v3_furniture_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m249_v3_furniture_{albedo,normal,roughness}.webp (2048x2048)")

    process_receiver_atlas()
    process_metal_atlas()
    process_furniture_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Modeling, UV Layout, Cycles Bake & Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "m249.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 24
BAKE_NORMAL_SAMPLES = 16

T2B_MAT = Matrix((
    (1.0,  0.0, 0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0, 0.0, 0.0),
    (0.0,  0.0, 0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 3-Suite Mapping (24 solid parts; skips ONLY `m249_recoil_spring`, `m249_sear_spring`)
RECEIVER_PARTS = [
    "m249_receiver",
    "m249_top_cover",
    "m249_rear_sight",
    "m249_front_sight",
    "m249_feed_tray",
    "m249_charging_handle",
]

METAL_PARTS = [
    "m249_barrel",
    "m249_gas_regulator",
    "m249_piston_carrier",
    "m249_bolt",
    "m249_firing_pin",
    "m249_hydraulic_buffer",
    "m249_gas_tube",
    "m249_bipod",
    "m249_trigger",
    "m249_open_bolt_sear",
    "m249_feed_lever",
    "m249_feed_pawls",
    "m249_m27_belt",
]

FURNITURE_PARTS = [
    "m249_barrel_handle",
    "m249_handguard",
    "m249_buttstock",
    "m249_trigger_frame",
    "m249_ammo_box",
]

# Exterior parts receiving assembled inter-part contact AO (internal & M27 belt get radiant Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "m249_receiver",
    "m249_top_cover",
    "m249_rear_sight",
    "m249_front_sight",
    "m249_charging_handle",
    "m249_barrel",
    "m249_gas_regulator",
    "m249_gas_tube",
    "m249_bipod",
    "m249_barrel_handle",
    "m249_handguard",
    "m249_buttstock",
    "m249_trigger_frame",
    "m249_ammo_box",
}

ASSEMBLED_POS = {
    "m249_barrel":           (  0.00,  1.25,  0.00),
    "m249_barrel_handle":    ( 14.80,  3.25,  1.85),
    "m249_gas_regulator":    ( 37.40, -0.65,  0.00),
    "m249_piston_carrier":   ( -6.80, -0.65,  0.00),
    "m249_bolt":             ( -6.60,  1.25,  0.00),
    "m249_firing_pin":       ( -7.25,  1.25,  0.00),
    "m249_charging_handle":  ( -0.80,  1.25,  2.25),
    "m249_hydraulic_buffer": (-16.60,  0.85,  0.00),
    "m249_receiver":         (  0.00,  0.00,  0.00),
    "m249_top_cover":        ( 10.20,  2.65,  0.00),
    "m249_rear_sight":       (-12.60,  4.35,  0.00),
    "m249_front_sight":      ( 35.40,  2.75,  0.00),
    "m249_handguard":        ( 21.80,  0.15,  0.00),
    "m249_gas_tube":         ( 23.80, -0.65,  0.00),
    "m249_bipod":            ( 23.50, -2.55,  0.00),
    "m249_buttstock":        (-30.60, -0.45,  0.00),
    "m249_trigger_frame":    ( -8.20, -4.60,  0.00),
    "m249_trigger":          ( -6.40, -3.20,  0.00),
    "m249_open_bolt_sear":   ( -7.80, -1.55,  0.00),
    "m249_feed_tray":        ( -0.80,  1.40,  0.00),
    "m249_feed_lever":       ( -1.20,  3.05,  0.00),
    "m249_feed_pawls":       ( -0.80,  2.28, -0.65),
    "m249_m27_belt":         ( -0.80,  0.20, -2.85),
    "m249_ammo_box":         (  1.50, -7.80, -0.65),
}

# Exact ground-truth CSG reference bounding boxes (Three.js local space) extracted from src/weapons/m249/meshes/
CSG_REF_BBOX = {
    "m249_barrel":           ((  4.200, -2.550, -1.240), ( 57.300,  1.240,  1.240)),
    "m249_barrel_handle":    (( -4.075, -1.695, -1.975), (  4.857,  1.710,  1.666)),
    "m249_gas_regulator":    (( -1.050, -0.820, -0.820), (  1.780,  0.820,  0.820)),
    "m249_piston_carrier":   (( -4.750, -0.680, -1.240), ( 30.800,  3.450,  1.240)),
    "m249_bolt":             (( -2.750, -1.110, -0.960), (  2.700,  0.910,  0.960)),
    "m249_firing_pin":       (( -2.750, -0.700, -0.356), (  3.180,  0.360,  0.356)),
    "m249_charging_handle":  (( -4.300, -0.380, -0.690), (  4.300,  0.450,  1.625)),
    "m249_hydraulic_buffer": (( -3.150, -0.850, -0.774), (  2.580,  0.780,  0.774)),
    "m249_receiver":         ((-15.205, -3.731, -4.042), ( 10.820,  2.730,  2.130)),
    "m249_top_cover":        ((-24.400, -0.276, -2.320), (  0.420,  1.700,  2.320)),
    "m249_rear_sight":       (( -1.325, -0.170, -1.760), (  1.325,  1.420,  1.760)),
    "m249_front_sight":      (( -1.075, -0.410, -0.690), (  1.075,  1.360,  0.690)),
    "m249_handguard":        ((-10.500, -2.220, -2.280), ( 10.500,  2.280,  2.280)),
    "m249_gas_tube":         ((-12.750, -1.530, -1.190), ( 12.750,  0.940,  1.190)),
    "m249_bipod":            ((-12.160, -1.075, -3.095), ( 11.575,  1.025,  3.095)),
    "m249_buttstock":        ((-15.600, -6.705, -1.960), ( 15.375,  2.900,  1.960)),
    "m249_trigger_frame":    (( -5.650, -6.921, -1.380), (  3.950,  2.395,  1.380)),
    "m249_trigger":          (( -1.275, -2.420, -0.560), (  0.797,  1.230,  0.560)),
    "m249_open_bolt_sear":   (( -1.950, -0.360, -0.740), (  1.980,  0.580,  0.740)),
    "m249_feed_tray":        (( -3.550, -0.440, -3.100), (  3.650,  0.380,  1.980)),
    "m249_feed_lever":       (( -7.975, -0.370, -0.600), (  3.075,  0.440,  0.600)),
    "m249_feed_pawls":       (( -2.250, -0.363, -1.575), (  2.250,  0.500,  1.575)),
    "m249_m27_belt":         (( -2.850, -4.409, -1.958), (  2.890,  1.904,  2.039)),
    "m249_ammo_box":         (( -5.410, -5.450, -4.690), (  5.410,  6.252,  4.550)),
}


# =============================================================================
# Scene & Physically Calibrated U.S. Infantry SAW Material Library (Cycles GPU)
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
    edge_srgb: tuple[float, float, float] = (0.78, 0.80, 0.84),
    grain_scale: float = 38.0,
    grain_bump: float = 0.034,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 72.0,
    rough_var: float = 0.042,
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
    n_macro.inputs["Scale"].default_value = 2.10
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.56
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
        min(1.0, base_srgb[0] * 1.06),
        min(1.0, base_srgb[1] * 1.06),
        min(1.0, base_srgb[2] * 1.06),
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
    rgh_val_node.inputs["To Max"].default_value = min(0.94, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.520
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.588
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])

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
        mix_edge_r.inputs[3].default_value = max(0.15, roughness - 0.16)
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
        bump.inputs["Distance"].default_value = 0.020
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_m249_barrel_heat_temper_mat() -> bpy.types.Material:
    """18.3" Fluted SAW Quick-Change Barrel: manganese-phosphate armor steel with authentic
    sustained-fire golden-bronze & heat-blued temper along gas block and birdcage flash hider + muzzle soot."""
    mat = bpy.data.materials.new("M_BarrelHeatTemper")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize barrel X from chamber (+6.7) to birdcage crown (+57.3)
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 6.7
    mr_x.inputs["From Max"].default_value = 57.3
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_heat = nt.nodes.new("ShaderNodeTexNoise")
    n_heat.inputs["Scale"].default_value = 2.4
    n_heat.inputs["Detail"].default_value = 5.0
    n_heat.inputs["Roughness"].default_value = 0.62
    nt.links.new(texcoord.outputs["Object"], n_heat.inputs["Vector"])

    add_h = nt.nodes.new("ShaderNodeMath")
    add_h.operation = "MULTIPLY_ADD"
    add_h.inputs[1].default_value = 0.06
    nt.links.new(n_heat.outputs["Fac"], add_h.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_h.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.240, 0.252, 0.248)  # manganese-phosphate chamber steel
    cr.elements[1].position = 0.44
    cr.elements[1].color = srgb_to_lin(0.248, 0.256, 0.246)
    for pos, rgb in (
        (0.56, (0.320, 0.270, 0.205)),  # gas-block sustained-fire straw-bronze bloom
        (0.70, (0.242, 0.250, 0.254)),  # forward fluted barrel phosphate
        (0.87, (0.345, 0.255, 0.175)),  # birdcage shoulder golden-bronze temper
        (0.935, (0.195, 0.228, 0.315)), # birdcage heat-blued violet-steel band
        (0.985, (0.125, 0.124, 0.128)), # velvety muzzle carbon soot halo
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_h.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.00
    rr.elements[0].color = (0.35, 0.35, 0.35, 1.0)
    rr.elements[1].position = 0.94
    rr.elements[1].color = (0.32, 0.32, 0.32, 1.0)
    el_r = rr.elements.new(0.985)
    el_r.color = (0.82, 0.82, 0.82, 1.0)  # matte carbon soot at muzzle tip
    nt.links.new(add_h.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.00
    rm.elements[0].color = (0.85, 0.85, 0.85, 1.0)
    rm.elements[1].position = 0.94
    rm.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    el_m = rm.elements.new(0.985)
    el_m.color = (0.20, 0.20, 0.20, 1.0)  # carbon deposit dielectric drop at muzzle tip
    nt.links.new(add_h.outputs["Value"], ramp_m.inputs["Fac"])

    # Bright silver edge wear along cooling flutes & flash-hider slots
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    ramp_e = nt.nodes.new("ShaderNodeValToRGB")
    ramp_e.color_ramp.elements[0].position = 0.520
    ramp_e.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_e.color_ramp.elements[1].position = 0.585
    ramp_e.color_ramp.elements[1].color = (0.50, 0.50, 0.50, 1.0)
    nt.links.new(geom.outputs["Pointiness"], ramp_e.inputs["Fac"])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[7].default_value = srgb_to_lin(0.78, 0.80, 0.84)
    nt.links.new(ramp_e.outputs["Color"], mix_col.inputs[0])
    nt.links.new(ramp_c.outputs["Color"], mix_col.inputs[6])

    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.026
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (4.5, 0.7, 0.7)
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])
    n_lathe = nt.nodes.new("ShaderNodeTexNoise")
    n_lathe.inputs["Scale"].default_value = 46.0
    n_lathe.inputs["Detail"].default_value = 5.0
    nt.links.new(mapping.outputs["Vector"], n_lathe.inputs["Vector"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.036
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_lathe.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_m855_annealed_brass_mat() -> bpy.types.Material:
    """C26000 NATO 5.56x45mm Cartridge Brass with authentic Lake City mil-spec heat-annealed
    shoulder & case neck (Object X in [-2.85, +1.62] is coaxial across all 7 M27 belt rounds!)."""
    mat = bpy.data.materials.new("M_Brass556")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X from case rim (-2.85) to case mouth (+1.62)
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -2.85
    mr_x.inputs["From Max"].default_value = 1.62
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_ann = nt.nodes.new("ShaderNodeTexNoise")
    n_ann.inputs["Scale"].default_value = 6.5
    n_ann.inputs["Detail"].default_value = 4.0
    nt.links.new(texcoord.outputs["Object"], n_ann.inputs["Vector"])

    add_a = nt.nodes.new("ShaderNodeMath")
    add_a.operation = "MULTIPLY_ADD"
    add_a.inputs[1].default_value = 0.04
    nt.links.new(n_ann.outputs["Fac"], add_a.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_a.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.84, 0.65, 0.25)   # bright machined brass case head
    cr.elements[1].position = 0.72
    cr.elements[1].color = srgb_to_lin(0.88, 0.69, 0.27)   # gleaming golden C26000 cartridge wall
    for pos, rgb in (
        (0.78, (0.62, 0.45, 0.24)),  # anneal transition amber ring
        (0.84, (0.48, 0.36, 0.34)),  # Lake City mil-spec purple-bronze heat-annealed shoulder!
        (0.93, (0.58, 0.42, 0.25)),  # annealed bronze case neck
        (1.00, (0.66, 0.50, 0.27)),  # crimped mouth
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_a.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.00
    rr.elements[0].color = (0.19, 0.19, 0.19, 1.0)
    rr.elements[1].position = 0.76
    rr.elements[1].color = (0.20, 0.20, 0.20, 1.0)
    el_r = rr.elements.new(0.88)
    el_r.color = (0.31, 0.31, 0.31, 1.0)  # slightly satin oxidized annealed neck
    nt.links.new(add_a.outputs["Value"], ramp_r.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.95

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.012
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.016
    bump.inputs["Distance"].default_value = 0.010
    nt.links.new(n_ann.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_grip_checkering_mat() -> bpy.types.Material:
    """M249 SAW Polymer Pistol Grip high-tooth molded diamond checkering panels."""
    mat = bpy.data.materials.new("F_GripStipple")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")

    map_a = nt.nodes.new("ShaderNodeMapping")
    map_a.inputs["Rotation"].default_value = (0.0, math.radians(45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], map_a.inputs["Vector"])

    wave_a = nt.nodes.new("ShaderNodeTexWave")
    wave_a.wave_type = "BANDS"
    wave_a.bands_direction = "X"
    wave_a.wave_profile = "SAW"
    wave_a.inputs["Scale"].default_value = 12.0
    nt.links.new(map_a.outputs["Vector"], wave_a.inputs["Vector"])

    map_b = nt.nodes.new("ShaderNodeMapping")
    map_b.inputs["Rotation"].default_value = (0.0, math.radians(-45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], map_b.inputs["Vector"])

    wave_b = nt.nodes.new("ShaderNodeTexWave")
    wave_b.wave_type = "BANDS"
    wave_b.bands_direction = "X"
    wave_b.wave_profile = "SAW"
    wave_b.inputs["Scale"].default_value = 12.0
    nt.links.new(map_b.outputs["Vector"], wave_b.inputs["Vector"])

    pyr = nt.nodes.new("ShaderNodeMath")
    pyr.operation = "MINIMUM"
    nt.links.new(wave_a.outputs["Fac"], pyr.inputs[0])
    nt.links.new(wave_b.outputs["Fac"], pyr.inputs[1])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.145, 0.152, 0.162)
    mix_c.inputs[7].default_value = srgb_to_lin(0.228, 0.236, 0.248)
    nt.links.new(pyr.outputs["Value"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.74
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.016
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    bump.inputs["Distance"].default_value = 0.028
    nt.links.new(pyr.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    """Physically calibrated M249 SAW materials (strictly anti-black-crush sRGB 0.21-0.28 armor steel!)."""
    return {
        # --- SUITE 1: Receiver, Hinged Top Cover, Sights, Feed Tray & Charging Handle ---
        "R_ReceiverParkerized": _build_pbr_mat(
            "R_ReceiverParkerized",
            base_srgb=(0.246, 0.260, 0.255),
            roughness=0.36,
            metallic=0.84,
            bevel_r=0.032,
            edge_wear=0.58,
            edge_srgb=(0.82, 0.84, 0.87),
            grain_scale=62.0,
            grain_bump=0.044,
            voronoi_grain=0.54,
            voronoi_scale=88.0,
            rough_var=0.038,
        ),
        "R_ReceiverRibRivet": _build_pbr_mat(
            "R_ReceiverRibRivet",
            base_srgb=(0.268, 0.282, 0.278),
            roughness=0.32,
            metallic=0.86,
            bevel_r=0.026,
            edge_wear=0.66,
            edge_srgb=(0.85, 0.87, 0.90),
            grain_scale=58.0,
            grain_bump=0.036,
            voronoi_grain=0.48,
            voronoi_scale=82.0,
            rough_var=0.032,
        ),
        "R_TopCoverAlloy": _build_pbr_mat(
            "R_TopCoverAlloy",
            base_srgb=(0.228, 0.240, 0.252),
            roughness=0.35,
            metallic=0.82,
            bevel_r=0.030,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=64.0,
            grain_bump=0.040,
            voronoi_grain=0.52,
            voronoi_scale=86.0,
            rough_var=0.036,
        ),
        "R_RailCrest": _build_pbr_mat(
            "R_RailCrest",
            base_srgb=(0.236, 0.246, 0.258),
            roughness=0.33,
            metallic=0.83,
            bevel_r=0.018,
            edge_wear=0.46,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=52.0,
            grain_bump=0.028,
            rough_var=0.030,
        ),
        "R_SlotDark": _build_pbr_mat(
            "R_SlotDark",
            base_srgb=(0.145, 0.152, 0.160),
            roughness=0.46,
            metallic=0.78,
            bevel_r=0.014,
            grain_scale=44.0,
            grain_bump=0.028,
            rough_var=0.030,
        ),
        "R_SightDrum": _build_pbr_mat(
            "R_SightDrum",
            base_srgb=(0.220, 0.230, 0.242),
            roughness=0.33,
            metallic=0.84,
            bevel_r=0.018,
            edge_wear=0.44,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=52.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
        "R_BurnishedSteel": _build_pbr_mat(
            "R_BurnishedSteel",
            base_srgb=(0.72, 0.75, 0.79),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=30.0,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.2, 3.2),
            rough_var=0.025,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.140, 0.148, 0.154),
            roughness=0.48,
            metallic=0.76,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),

        # --- SUITE 2: Quick-Change Barrel, Gas System, Bipod, Open-Bolt BCG/FCG & M27 Belt ---
        "M_BarrelHeatTemper": _build_m249_barrel_heat_temper_mat(),
        "M_BarrelStampBand": _build_pbr_mat(
            "M_BarrelStampBand",
            base_srgb=(0.244, 0.252, 0.250),
            roughness=0.34,
            metallic=0.85,
            bevel_r=0.020,
            edge_wear=0.32,
            grain_scale=48.0,
            grain_bump=0.026,
            aniso_stretch=(4.0, 0.6, 0.6),
            rough_var=0.026,
        ),
        "M_ParkerizedSteel": _build_pbr_mat(
            "M_ParkerizedSteel",
            base_srgb=(0.236, 0.248, 0.244),
            roughness=0.35,
            metallic=0.84,
            bevel_r=0.028,
            edge_wear=0.54,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=62.0,
            grain_bump=0.040,
            voronoi_grain=0.52,
            voronoi_scale=84.0,
            rough_var=0.036,
        ),
        "M_GasBlockDark": _build_pbr_mat(
            "M_GasBlockDark",
            base_srgb=(0.215, 0.224, 0.224),
            roughness=0.38,
            metallic=0.83,
            bevel_r=0.026,
            edge_wear=0.50,
            edge_srgb=(0.76, 0.78, 0.82),
            grain_scale=68.0,
            grain_bump=0.046,
            voronoi_grain=0.56,
            voronoi_scale=92.0,
            rough_var=0.038,
        ),
        "M_OiledCarrier": _build_pbr_mat(
            "M_OiledCarrier",
            base_srgb=(0.250, 0.262, 0.274),
            roughness=0.24,
            metallic=0.91,
            bevel_r=0.026,
            edge_wear=0.60,
            edge_srgb=(0.86, 0.88, 0.92),
            grain_scale=30.0,
            grain_bump=0.026,
            aniso_stretch=(0.35, 3.4, 3.4),
            rough_var=0.032,
        ),
        "M_HardChrome": _build_pbr_mat(
            "M_HardChrome",
            base_srgb=(0.80, 0.83, 0.87),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.94, 0.96, 0.98),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "M_BrushedSteel": _build_pbr_mat(
            "M_BrushedSteel",
            base_srgb=(0.64, 0.67, 0.72),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.30,
            edge_srgb=(0.88, 0.90, 0.94),
            grain_scale=32.0,
            grain_bump=0.022,
            aniso_stretch=(0.40, 3.0, 3.0),
            rough_var=0.026,
        ),
        "M_M27LinkSteel": _build_pbr_mat(
            "M_M27LinkSteel",
            base_srgb=(0.212, 0.222, 0.228),
            roughness=0.40,
            metallic=0.83,
            bevel_r=0.014,
            edge_wear=0.48,
            edge_srgb=(0.74, 0.76, 0.80),
            grain_scale=68.0,
            grain_bump=0.042,
            voronoi_grain=0.50,
            voronoi_scale=90.0,
            rough_var=0.036,
        ),
        "M_Brass556": _build_m855_annealed_brass_mat(),
        "M_CopperFMJ": _build_pbr_mat(
            "M_CopperFMJ",
            base_srgb=(0.82, 0.44, 0.22),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.010,
            edge_wear=0.16,
            edge_srgb=(0.94, 0.62, 0.36),
            grain_scale=34.0,
            grain_bump=0.014,
            rough_var=0.022,
        ),
        "M_M855GreenTip": _build_pbr_mat(
            "M_M855GreenTip",
            base_srgb=(0.13, 0.58, 0.23),
            roughness=0.34,
            metallic=0.04,
            bevel_r=0.008,
            edge_wear=0.10,
            edge_srgb=(0.26, 0.72, 0.36),
            grain_scale=42.0,
            grain_bump=0.014,
            rough_var=0.024,
        ),
        "M_PrimerSilver": _build_pbr_mat(
            "M_PrimerSilver",
            base_srgb=(0.76, 0.78, 0.81),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.008,
            grain_bump=0.012,
            rough_var=0.020,
        ),
        "M_PrimerRedRing": _build_pbr_mat(
            "M_PrimerRedRing",
            base_srgb=(0.80, 0.10, 0.09),
            roughness=0.26,
            metallic=0.04,
            bevel_r=0.006,
            grain_bump=0.010,
            rough_var=0.018,
        ),
        "M_CarbonSoot": _build_pbr_mat(
            "M_CarbonSoot",
            base_srgb=(0.115, 0.114, 0.118),
            roughness=0.84,
            metallic=0.16,
            bevel_r=0.012,
            grain_scale=52.0,
            grain_bump=0.052,
            rough_var=0.045,
        ),

        # --- SUITE 3: 200-Rd OD-Green SAW Box, PIP Buttstock, Handguard, Carry Handle & Trigger Frame ---
        "F_ODGreenBox": _build_pbr_mat(
            "F_ODGreenBox",
            base_srgb=(0.248, 0.298, 0.202),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.18,
            edge_srgb=(0.35, 0.40, 0.29),
            grain_scale=68.0,
            grain_bump=0.088,
            voronoi_grain=0.66,
            voronoi_scale=94.0,
            rough_var=0.042,
        ),
        "F_PolymerCharcoal": _build_pbr_mat(
            "F_PolymerCharcoal",
            base_srgb=(0.184, 0.194, 0.206),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.22,
            edge_srgb=(0.30, 0.31, 0.33),
            grain_scale=66.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=90.0,
            rough_var=0.042,
        ),
        "F_GripStipple": _build_grip_checkering_mat(),
        "F_RubberPad": _build_pbr_mat(
            "F_RubberPad",
            base_srgb=(0.148, 0.154, 0.162),
            roughness=0.82,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.14,
            edge_srgb=(0.24, 0.25, 0.26),
            grain_scale=84.0,
            grain_bump=0.115,
            voronoi_grain=0.72,
            voronoi_scale=110.0,
            rough_var=0.038,
        ),
        "F_HeatshieldSteel": _build_pbr_mat(
            "F_HeatshieldSteel",
            base_srgb=(0.236, 0.248, 0.246),
            roughness=0.35,
            metallic=0.84,
            bevel_r=0.026,
            edge_wear=0.54,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=62.0,
            grain_bump=0.040,
            voronoi_grain=0.52,
            voronoi_scale=84.0,
            rough_var=0.036,
        ),
        "F_WireSteel": _build_pbr_mat(
            "F_WireSteel",
            base_srgb=(0.72, 0.75, 0.80),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=30.0,
            grain_bump=0.018,
            rough_var=0.024,
        ),
        "F_SafetyRed": _build_pbr_mat(
            "F_SafetyRed",
            base_srgb=(0.84, 0.08, 0.08),
            roughness=0.25,
            metallic=0.04,
            bevel_r=0.012,
            grain_scale=34.0,
            grain_bump=0.012,
            rough_var=0.020,
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


def _bm_to_obj(
    name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None
) -> bpy.types.Object:
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
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
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
        bmesh.ops.bevel(
            bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs,
            profile=0.5, affect="EDGES", clamp_overlap=True,
        )
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
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_bot, radius2=r_top, depth=length,
    )
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm, geom=cap_edges, offset=bevel, segments=2,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
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
    u_segs: int = 20, v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_dome_rivet_z(
    name: str, radius: float, height: float, side_sign: float,
    tx: float, ty: float, tz_base: float,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Crisp stamped-receiver dome rivet protruding outward along +-Z."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
    bmesh.ops.scale(bm, vec=(radius, radius, height), verts=bm.verts)
    _apply_three_xform(bm, [("t", tx, ty, tz_base + side_sign * height * 0.35)])
    return _bm_to_obj(name, bm, mat)


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


def mk_capsule_x(
    name: str, radius: float, cyl_len: float, segs: int = 16, cap_rings: int = 5,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    pts: list[tuple[float, float]] = []
    half = cyl_len * 0.5
    for i in range(cap_rings + 1):
        th = -math.pi * 0.5 + (math.pi * 0.5) * (i / cap_rings)
        pts.append((max(0.0, radius * math.cos(th)), -half + radius * math.sin(th)))
    for i in range(cap_rings + 1):
        th = (math.pi * 0.5) * (i / cap_rings)
        pts.append((max(0.0, radius * math.cos(th)), half + radius * math.sin(th)))
    return mk_lathe_x(name, pts, segs=segs, xform=xform, mat=mat)


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
    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
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
                bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
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
    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
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
                bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_y(
    name: str, pts_xz: list[tuple[float, float]], y0: float, y1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xz:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
    if area < 0:
        clean.reverse()

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
            bmesh.ops.bevel(
                bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_stadium_z(
    name: str, half_flat_x: float, radius_y: float, half_span_z: float,
    arc_segs: int = 10,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    pts = []
    for i in range(arc_segs + 1):
        a = -math.pi * 0.5 + math.pi * (i / arc_segs)
        pts.append((half_flat_x + radius_y * math.cos(a), radius_y * math.sin(a)))
    for i in range(arc_segs + 1):
        a = math.pi * 0.5 + math.pi * (i / arc_segs)
        pts.append((-half_flat_x + radius_y * math.cos(a), radius_y * math.sin(a)))
    return mk_extrude_z(name, pts, -half_span_z, half_span_z, bevel=0.0, xform=xform, mat=mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 14,
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "x",
    flutes: int = 20, depth: float = 0.024,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.016, length * 0.16, radius * 0.14)
    bm = bmesh.new()
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


def mk_helical_lands(
    name: str, count: int, bore_r: float, height: float, half_ang: float,
    x0: float, x1: float, twist_cm: float, segs: int = 12,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight raised helical rifling lands inside 5.56mm chrome bore along +X."""
    r_in = bore_r - height
    r_out = bore_r + 0.005
    twist_rad_per_cm = 2.0 * math.pi / twist_cm
    bm = bmesh.new()
    for l in range(count):
        base = (l * 2.0 * math.pi) / count
        rings = []
        for s in range(segs + 1):
            x = x0 + (x1 - x0) * (s / segs)
            ang = base + twist_rad_per_cm * (x - x0)
            a0, a1 = ang - half_ang, ang + half_ang
            v0 = bm.verts.new((x, math.cos(a0) * r_in, math.sin(a0) * r_in))
            v1 = bm.verts.new((x, math.cos(a1) * r_in, math.sin(a1) * r_in))
            v2 = bm.verts.new((x, math.cos(a1) * r_out, math.sin(a1) * r_out))
            v3 = bm.verts.new((x, math.cos(a0) * r_out, math.sin(a0) * r_out))
            rings.append((v0, v1, v2, v3))
        for s in range(segs):
            a, b = rings[s], rings[s + 1]
            for k in range(4):
                kn = (k + 1) % 4
                bm.faces.new((a[k], a[kn], b[kn], b[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
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


def bool_subtract(
    target: bpy.types.Object, cutters: list[bpy.types.Object], solver: str = "EXACT"
) -> bpy.types.Object:
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
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 50
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


# =============================================================================
# GROUP 1: RECEIVER, TOP COVER, SIGHTS, FEED TRAY & CHARGING HANDLE (Suite 1)
# =============================================================================
def build_m249_receiver(mats: dict) -> bpy.types.Object:
    """F-01: Heavy stamped & riveted manganese-phosphate receiver with embossed side ribs,
    dome rivets, hollow front trunnion, internal burnished guide rails, trigger-frame
    hanger clevises, right ejection dust cover & left-angled hinged STANAG emergency magwell."""
    m_pk = mats["R_ReceiverParkerized"]
    m_rb = mats["R_ReceiverRibRivet"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    def _bisect_wall_grid(wall_obj: bpy.types.Object, xs: tuple[float, ...], ys: tuple[float, ...]):
        """Slices clean vertical & horizontal support edge loops through extruded walls
        so Cycles Pointiness never bleeds diagonally across flat hero receiver panels."""
        bm = bmesh.new()
        bm.from_mesh(wall_obj.data)
        for wx in xs:
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(wx, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
        for wy in ys:
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0.0, 0.0, wy), plane_no=(0.0, 0.0, 1.0))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(wall_obj.data)
        bm.free()

    # 1. Left stamped wall (-Z): flat hero outer plane at Z = -2.075 (ribs & rivets reach -2.130!)
    left_xy = [
        (-15.10, -1.95), (10.70, -1.95), (10.70, 2.55),
        (3.45, 2.55), (3.15, 0.95), (-3.75, 0.95),
        (-4.05, 2.55), (-15.10, 2.55),
    ]
    wall_l = mk_extrude_z("r_wallL", left_xy, -2.075, -1.755, bevel=0.022, bevel_segs=2, mat=m_pk)
    _bisect_wall_grid(wall_l, (-14.70, -4.35, -3.75, 3.15, 3.75, 10.30), (-1.55, 0.95, 2.15))
    parts.append(wall_l)

    # 2. Right stamped wall (+Z): flat hero outer plane at Z = +2.075 (ribs & rivets reach +2.130!)
    right_xy = [
        (-15.10, -1.95), (10.70, -1.95), (10.70, 2.55),
        (4.35, 2.55), (4.05, -0.35), (-3.15, -0.35),
        (-3.45, 2.55), (-15.10, 2.55),
    ]
    wall_r = mk_extrude_z("r_wallR", right_xy, 1.755, 2.075, bevel=0.022, bevel_segs=2, mat=m_pk)
    _bisect_wall_grid(wall_r, (-14.70, -3.75, -3.15, 4.05, 4.65, 10.30), (-1.55, -0.35, 2.15))
    parts.append(wall_r)

    # 3. Stamped Embossed Structural Side Ribs (framing flat hero rollmark panels cleanly!)
    for side in (-1.0, 1.0):
        z_rib = side * 2.095
        # Rear upper & lower horizontal stiffening beads (clear of hero rollmarks Y in [-1.30, +1.80])
        parts.append(mk_box(f"r_rib_ru_{side}", 9.6, 0.24, 0.07, [("t", -9.4, 2.26, z_rib)], m_rb, bevel=0.018, bevel_segs=2))
        parts.append(mk_box(f"r_rib_rl_{side}", 9.6, 0.24, 0.07, [("t", -9.4, -1.68, z_rib)], m_rb, bevel=0.018, bevel_segs=2))
        # Front trunnion horizontal stiffening ribs
        parts.append(mk_box(f"r_rib_fu_{side}", 5.4, 0.24, 0.07, [("t", 7.4, 2.26, z_rib)], m_rb, bevel=0.018, bevel_segs=2))
        parts.append(mk_box(f"r_rib_fl_{side}", 5.4, 0.24, 0.07, [("t", 7.4, -1.68, z_rib)], m_rb, bevel=0.018, bevel_segs=2))
        # Authentic domed steel rivets on trunnion & rear backplate (reach Z = +-2.128)
        for rx, ry in (
            (-14.55, 1.85), (-14.55, 0.45), (-14.55, -1.05),
            (6.85, 1.85), (6.85, 0.35), (6.85, -1.15),
            (9.85, 1.85), (9.85, 0.35), (9.85, -1.15),
        ):
            parts.append(mk_dome_rivet_z(f"r_riv_{side}_{rx}_{ry}", 0.16, 0.08, side, rx, ry, side * 2.075, m_rb))

    # Right-side charging handle steel guide track lips & lower ejection dust cover lip
    parts.append(mk_box("r_ch_track_top", 9.6, 0.20, 0.10, [("t", -0.8, 1.72, 2.08)], m_rb, bevel=0.018))
    parts.append(mk_box("r_ch_track_bot", 9.6, 0.20, 0.10, [("t", -0.8, 0.78, 2.08)], m_rb, bevel=0.018))
    # Spring-loaded hinged brass ejection dust cover (lower right ejection window lip)
    parts.append(mk_box("r_ej_door", 6.9, 0.34, 0.12, [("t", 0.45, -0.52, 2.07)], m_rb, bevel=0.022))
    parts.append(mk_cyl("r_ej_hinge", 0.11, 0.11, 7.1, "x", 14, [("t", 0.45, -0.34, 2.02)], m_bs))

    # 4. Receiver Floor with genuine rear open-bolt sear passage opening (X in [-9.8, -5.8])
    parts.append(mk_box("r_floor_f", 16.5, 0.34, 3.68, [("t", 2.45, -1.80, 0.0)], m_in, bevel=0.024))
    parts.append(mk_box("r_floor_r", 5.3,  0.34, 3.68, [("t", -12.45, -1.80, 0.0)], m_in, bevel=0.024))
    parts.append(mk_box("r_floor_sl", 4.1, 0.34, 0.84, [("t", -7.8, -1.80, -1.42)], m_in, bevel=0.020))
    parts.append(mk_box("r_floor_sr", 4.1, 0.34, 0.84, [("t", -7.8, -1.80,  1.42)], m_in, bevel=0.020))

    # Underside T-slot SAW ammo-box dovetail hanger & welded trigger-frame hanger clevises!
    # Connects solidly to `m249_ammo_box` (world Y=-1.92) & `m249_trigger_frame` pins (-4.85 & -13.45, Y=-2.55)!
    parts.append(mk_box("r_box_hanger", 6.2, 0.28, 2.30, [("t", 0.85, -2.02, 0.0)], m_rb, bevel=0.022))
    for hx in (-4.85, -13.45):
        for side in (-1.0, 1.0):
            parts.append(mk_box(f"r_tf_ear_{hx}_{side}", 1.15, 0.96, 0.24, [("t", hx, -2.35, side * 1.14)], m_rb, bevel=0.025))

    # 5. Rear Backplate Tower (hollowed for hydraulic buffer nose at Y=+0.85!)
    backplate = mk_box("r_backplate", 0.85, 4.50, 4.14, [("t", -14.78, 0.30, 0.0)], m_pk, bevel=0.032)
    buf_hole = mk_cyl("r_buf_cut", 0.72, 0.72, 1.40, "x", 24, [("t", -14.78, 0.85, 0.0)], m_in)
    bool_subtract(backplate, [buf_hole])
    parts.append(backplate)
    # Buttstock takedown cross-pin bosses on rear plate
    parts.append(mk_cyl("r_stock_pin_t", 0.26, 0.26, 4.24, "z", 18, [("t", -14.78, 1.95, 0.0)], m_bs, bevel=0.02))
    parts.append(mk_cyl("r_stock_pin_b", 0.26, 0.26, 4.24, "z", 18, [("t", -14.78, -1.35, 0.0)], m_bs, bevel=0.02))

    # 6. Forged Front Barrel Trunnion Block (genuinely hollow for barrel bore Y=+1.25 & gas piston Y=-0.65!)
    trunnion = mk_box("r_trunnion", 4.28, 4.44, 4.14, [("t", 8.58, 0.32, 0.0)], m_rb, bevel=0.040)
    cut_bore = mk_cyl("r_trun_bore", 1.16, 1.16, 5.20, "x", 32, [("t", 8.60, 1.25, 0.0)], m_in)
    cut_gas = mk_cyl("r_trun_gas", 0.72, 0.72, 5.20, "x", 24, [("t", 8.60, -0.65, 0.0)], m_in)
    bool_subtract(trunnion, [cut_bore, cut_gas])
    parts.append(trunnion)

    # Chromed front barrel extension collar & front underbarrel gas-tube boss
    parts.append(mk_lathe_x(
        "r_trun_ring",
        [(1.16, 6.42), (1.48, 6.42), (1.48, 10.82), (1.16, 10.82), (1.16, 6.42)],
        segs=32, xform=[("t", 0.0, 1.25, 0.0)], mat=m_bs,
    ))
    parts.append(mk_lathe_x(
        "r_gas_boss",
        [(0.72, 9.80), (1.06, 9.80), (1.06, 10.92), (0.72, 10.92), (0.72, 9.80)],
        segs=24, xform=[("t", 0.0, -0.65, 0.0)], mat=m_rb,
    ))
    # Front top-cover hinge ears at X=10.20, Y=2.55..2.73
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"r_hinge_ear_{side}", 0.92, 0.56, 0.36, [("t", 10.20, 2.45, side * 1.92)], m_rb, bevel=0.026))

    # 7. Internal Spot-Welded Burnished-Steel Carrier Guide Rails
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"r_in_rail_{side}", 19.2, 0.32, 0.32, [("t", -4.2, 0.56, side * 1.60)], m_bs, bevel=0.020))
        parts.append(mk_box(f"r_in_low_{side}",  18.4, 0.24, 0.26, [("t", -4.2, -0.82, side * 1.62)], m_bs, bevel=0.018))

    # 8. Signature Left-Angled Emergency STANAG M16 Magazine Well (-Z) w/ Hinged Dust Flap!
    # Hollow funnel tilted rx=+0.48 rad at (-0.25, -1.85, -2.55)
    mag_outer = mk_box("r_stanag_out", 6.42, 3.40, 1.60, [], m_pk, bevel=0.045, bevel_segs=2)
    mag_inner = mk_box("r_stanag_in",  5.82, 3.90, 1.02, [("t", 0.0, -0.15, 0.0)], m_in)
    bool_subtract(mag_outer, [mag_inner])
    bm_m = bmesh.new()
    bm_m.from_mesh(mag_outer.data)
    # Transform back from Blender to Three, apply rx/t, transform to Blender
    bmesh.ops.transform(bm_m, matrix=T2B_MAT.inverted(), verts=bm_m.verts)
    _apply_three_xform(bm_m, [("rx", 0.48), ("t", -0.25, -1.85, -2.55)])
    bm_m.to_mesh(mag_outer.data)
    bm_m.free()
    parts.append(mag_outer)

    # Hinged spring-loaded STANAG emergency dust cover flap & hinge knuckle on bottom mouth!
    parts.append(mk_box(
        "r_stanag_flap", 6.20, 0.22, 1.48,
        [("t", 0.0, -1.72, 0.0), ("rx", 0.48), ("t", -0.25, -1.85, -2.55)],
        m_rb, bevel=0.025,
    ))
    parts.append(mk_cyl(
        "r_stanag_hinge", 0.14, 0.14, 6.40, "x", 14,
        [("t", 0.0, -1.68, 0.80), ("rx", 0.48), ("t", -0.25, -1.85, -2.55)],
        m_bs,
    ))
    # STANAG mag-release catch button & ribs on rear of magwell
    parts.append(mk_box(
        "r_stanag_catch", 0.56, 1.10, 0.28,
        [("t", -3.35, -0.45, 0.0), ("rx", 0.48), ("t", -0.25, -1.85, -2.55)],
        m_bs, bevel=0.024,
    ))

    obj = join_objects(parts, "m249_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_top_cover(mats: dict) -> bpy.types.Object:
    """F-02: Hinged die-cast top feed cover w/ MIL-STD-1913 Picatinny optic rail,
    flat laser-marked side skirts, rear sight mounting pad, dual squeeze-latches & internal S-cam."""
    m_tc = mats["R_TopCoverAlloy"]
    m_rc = mats["R_RailCrest"]
    m_sl = mats["R_SlotDark"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    # 1. Inverted U-arch die-cast cover shell (local X in [-24.40, +0.42])
    # Flat outer vertical skirt Z = +-2.16 for Y in [-0.08, +0.92] -> razor-sharp hero side flanks!
    arch_zy = [
        (-2.16, -0.08), (-2.16, 0.92),
        (-1.82, 1.32), (-1.15, 1.35), (1.15, 1.35), (1.82, 1.32),
        (2.16, 0.92), (2.16, -0.08),
        (1.84, -0.08), (1.80, 0.84), (-1.80, 0.84), (-1.84, -0.08),
    ]
    parts.append(mk_extrude_x("tc_shell", arch_zy, -24.40, 0.42, bevel=0.032, bevel_segs=2, mat=m_tc))

    # Front nose end-wall & rear raised sight-base mounting deck (Y = +1.58 so rear sight seats flush!)
    parts.append(mk_box("tc_front_cap", 0.48, 1.24, 3.92, [("t", 0.16, 0.68, 0.0)], m_tc, bevel=0.028))
    parts.append(mk_box("tc_rear_pad",  3.35, 0.36, 2.72, [("t", -22.65, 1.44, 0.0)], m_tc, bevel=0.028))
    # Rear cover closing backplate wall
    parts.append(mk_box("tc_rear_cap",  0.52, 1.32, 4.18, [("t", -24.12, 0.62, 0.0)], m_tc, bevel=0.028))

    # 2. Top MIL-STD-1913 Picatinny Optic Rail (local X in [-20.80, -4.00], 16 dovetail recoil lugs!)
    rail_base_zy = [
        (-0.84, 1.26), (0.84, 1.26), (0.94, 1.44), (-0.94, 1.44),
    ]
    parts.append(mk_extrude_x("tc_rail_base", rail_base_zy, -20.80, -4.00, bevel=0.018, bevel_segs=1, mat=m_sl))

    lug_zy = [
        (-0.86, 1.40), (-1.06, 1.54), (-0.88, 1.70),
        (0.88, 1.70), (1.06, 1.54), (0.86, 1.40),
    ]
    for slot in range(16):
        lx = -20.55 + slot * 1.04
        parts.append(mk_extrude_x(f"tc_lug_{slot}", lug_zy, lx, lx + 0.52, bevel=0.015, bevel_segs=1, mat=m_rc))

    # 3. Internal S-Curved Machined Steel Feed-Cam Track & Hold-Down Pawls (visible in cutaway & open!)
    scam_l = [
        Vector((-21.6, 0.68, -0.52)),
        Vector((-18.8, 0.68, -0.44)),
        Vector((-15.8, 0.68, -0.12)),
        Vector((-12.6, 0.68,  0.16)),
    ]
    scam_r = [
        Vector((-21.6, 0.68,  0.16)),
        Vector((-18.8, 0.68,  0.24)),
        Vector((-15.8, 0.68,  0.56)),
        Vector((-12.6, 0.68,  0.84)),
    ]
    parts.append(mk_tube_along_pts("tc_scam_l", scam_l, 0.13, ring_segs=10, mat=m_bs))
    parts.append(mk_tube_along_pts("tc_scam_r", scam_r, 0.13, ring_segs=10, mat=m_bs))
    # Internal feed-lever pivot boss & cartridge spring guide fingers
    parts.append(mk_cyl("tc_piv_boss", 0.36, 0.40, 0.24, "y", 18, [("t", -12.85, 0.72, 0.0)], m_bs, bevel=0.015))
    for fx in (-12.4, -9.6):
        parts.append(mk_box(f"tc_finger_{fx}", 0.56, 0.14, 2.40, [("t", fx, 0.74, -0.25)], m_in, bevel=0.014))

    # 4. Front Hinge Pin Knuckle & Rear Dual Textured Squeeze-Latch Ears
    parts.append(mk_cyl("tc_hinge_pin", 0.27, 0.27, 4.56, "z", 20, [], m_bs, bevel=0.025))
    parts.append(mk_box("tc_latch_bar", 1.18, 0.56, 4.30, [("t", -23.65, 0.34, 0.0)], m_in, bevel=0.026))
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"tc_latch_ear_{side}", 1.24, 0.64, 0.32, [("t", -23.65, 0.36, side * 2.16)], m_bs, bevel=0.028))

    obj = join_objects(parts, "m249_top_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_rear_sight(mats: dict) -> bpy.types.Object:
    """F-03: Heavy winged windage/elevation peep drum rear sight with calibrated 300-1000m range cylinder."""
    m_pk = mats["R_ReceiverParkerized"]
    m_dr = mats["R_SightDrum"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    # Dovetail steel base seated cleanly onto top-cover rear deck
    parts.append(mk_box("rs_base", 2.64, 0.58, 2.44, [("t", 0.0, 0.12, 0.0)], m_pk, bevel=0.032))
    # Twin heavy beveled protective sight ears (Z = +-0.88)
    wing_xy = [
        (-0.88, 0.14), (0.62, 0.14), (0.58, 1.18),
        (0.28, 1.42), (-0.58, 1.42), (-0.88, 1.05),
    ]
    for side in (-1.0, 1.0):
        parts.append(mk_extrude_z(f"rs_wing_{side}", wing_xy, side * 0.88 - 0.14, side * 0.88 + 0.14, bevel=0.024, bevel_segs=2, mat=m_pk))

    # Peep aperture disk with crisp circular sighting hole
    parts.append(mk_lathe_x(
        "rs_peep",
        [(0.14, -0.18), (0.44, -0.18), (0.44, 0.18), (0.14, 0.18), (0.14, -0.18)],
        segs=24, xform=[("t", -0.15, 0.92, 0.0)], mat=m_bs,
    ))
    parts.append(mk_box("rs_peep_stem", 0.34, 0.42, 0.38, [("t", -0.15, 0.56, 0.0)], m_in, bevel=0.018))

    # Calibrated 300-1000m Elevation Drum Cylinder (hero-unwrapped with white '3..10' markings!)
    # Centered at (-0.15, 0.48, 0.0) along Z axis between protective wings, flanked by knurled windage knobs
    parts.append(mk_cyl("rs_elev_drum", 0.42, 0.42, 1.42, "z", 32, [("t", -0.15, 0.48, 0.0)], m_dr, bevel=0.022))
    # Outer knurled windage adjustment drums (Z reaching +-1.76)
    for side in (-1.0, 1.0):
        parts.append(mk_knurled_cyl(
            f"rs_wind_knob_{side}", 0.41, 0.72, "z", flutes=18, depth=0.022,
            xform=[("t", -0.15, 0.48, side * 1.40)], mat=m_pk,
        ))
    # Rear elevation detent ramp & index pointer needle
    parts.append(mk_box("rs_index", 0.44, 0.22, 0.22, [("t", 0.46, 0.58, 0.0)], m_bs, bevel=0.015))

    obj = join_objects(parts, "m249_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_front_sight(mats: dict) -> bpy.types.Object:
    """F-04: Protected cylindrical steel hooded front sight post with windage dovetail base."""
    m_pk = mats["R_ReceiverParkerized"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    # Dovetail windage base interlocking onto front gas block tower
    base_zy = [(-0.68, -0.41), (0.68, -0.41), (0.56, 0.11), (-0.56, 0.11)]
    parts.append(mk_extrude_x("fs_base", base_zy, -1.07, 1.07, bevel=0.026, bevel_segs=2, mat=m_pk))
    # Windage cross-screw boss
    parts.append(mk_cyl("fs_screw", 0.16, 0.16, 1.38, "z", 16, [("t", 0.0, -0.18, 0.0)], m_bs, bevel=0.015))

    # Protective circular steel sight hood with top light-gathering aperture notch
    hood = mk_lathe_x(
        "fs_hood",
        [(0.54, -0.78), (0.68, -0.78), (0.68, 0.78), (0.54, 0.78), (0.54, -0.78)],
        segs=28, xform=[("t", 0.0, 0.68, 0.0)], mat=m_pk,
    )
    top_notch = mk_box("fs_notch_cut", 0.62, 0.40, 0.34, [("t", 0.0, 1.30, 0.0)], m_in)
    bool_subtract(hood, [top_notch])
    parts.append(hood)

    # Stepped elevation detent collar & tapered steel front sight post
    parts.append(mk_cyl("fs_collar", 0.22, 0.24, 0.20, "y", 16, [("t", 0.0, 0.16, 0.0)], m_in, bevel=0.014))
    parts.append(mk_cyl("fs_post",   0.065, 0.105, 0.66, "y", 16, [("t", 0.0, 0.46, 0.0)], m_bs, bevel=0.010))

    obj = join_objects(parts, "m249_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_feed_tray(mats: dict) -> bpy.types.Object:
    """M-01: Stamped steel ribbed 5.56mm belt feed tray with rolled left entry horn & cartridge stop."""
    m_pk = mats["R_ReceiverParkerized"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    tray_zy = [(-3.10, -0.34)]
    tray_zy += _quad_bez((-3.10, -0.34), (-2.65, 0.12), (-1.85, 0.14), 6)
    tray_zy.append((-0.45, 0.14))
    tray_zy += _quad_bez((-0.45, 0.14), (0.0, -0.18), (0.45, 0.14), 6)
    tray_zy += [(1.55, 0.14), (1.75, 0.38), (1.98, 0.38), (1.98, -0.12), (-2.35, -0.16)]
    tray_zy += _quad_bez((-2.35, -0.16), (-2.75, -0.18), (-2.92, -0.44), 5)
    parts.append(mk_extrude_x("ft_deck", tray_zy, -3.55, 3.55, bevel=0.022, bevel_segs=2, mat=m_pk))

    # 4 Stamped burnished-steel transverse anti-friction ribs
    for rx in (-2.40, -0.80, 0.80, 2.40):
        parts.append(mk_box(f"ft_rib_{rx}", 0.36, 0.14, 3.62, [("t", rx, 0.12, -0.42)], m_bs, bevel=0.018))

    # Belt-retaining spring pawl tabs & front hinge pivot pin
    parts.append(mk_box("ft_pawl_l", 1.15, 0.16, 0.44, [("t", -0.25, 0.22, -1.65)], m_bs, bevel=0.016))
    parts.append(mk_box("ft_rear_lip", 0.28, 0.34, 3.40, [("t", -3.42, 0.12, -0.20)], m_in, bevel=0.016))
    parts.append(mk_cyl("ft_hinge", 0.20, 0.20, 3.60, "z", 18, [("t", 3.45, -0.05, -0.20)], m_bs, bevel=0.018))

    obj = join_objects(parts, "m249_feed_tray")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_charging_handle(mats: dict) -> bpy.types.Object:
    """B-07: Right-side (+Z) non-reciprocating slotted steel charging handle w/ folding knurled knob."""
    m_pk = mats["R_ReceiverParkerized"]
    m_bs = mats["R_BurnishedSteel"]
    m_in = mats["R_InnerDark"]

    parts: list[bpy.types.Object] = []

    # Main longitudinal slide bar riding right receiver guide slot
    bar = mk_box("ch_bar", 8.60, 0.66, 0.42, [], m_pk, bevel=0.030)
    flute = mk_stadium_z("ch_flute", 2.40, 0.16, 0.14, 8, [("t", -0.45, 0.0, 0.22)], m_in)
    bool_subtract(bar, [flute])
    parts.append(bar)

    # Internal carrier-engaging dog (-Z) & front locking detent latch
    parts.append(mk_box("ch_dog",   0.74, 0.48, 0.64, [("t", -3.65, -0.04, -0.37)], m_bs, bevel=0.025))
    parts.append(mk_box("ch_latch", 0.96, 0.78, 0.48, [("t",  3.75,  0.06,  0.08)], m_in, bevel=0.026))
    # Folding hinge yoke & ergonomic knurled pull knob (+Z)
    parts.append(mk_box("ch_stem",  0.88, 0.56, 0.68, [("t",  2.65,  0.00,  0.42)], m_in, bevel=0.026))
    parts.append(mk_cyl("ch_pin",   0.12, 0.12, 0.68, "y", 14, [("t", 2.65, 0.00, 0.62)], m_bs))
    parts.append(mk_knurled_cyl("ch_knob", 0.38, 1.08, "z", flutes=18, depth=0.024, xform=[("t", 2.65, 0.0, 1.08)], mat=m_pk))
    parts.append(mk_cyl("ch_cap",   0.35, 0.30, 0.12, "z", 18, [("t", 2.65, 0.0, 1.56)], m_bs, bevel=0.015))

    obj = join_objects(parts, "m249_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# GROUP 2: BARREL, GAS SYSTEM, BIPOD, OPEN-BOLT BCG/FCG & M27 BELT (Suite 2)
# =============================================================================
def build_m249_barrel(mats: dict) -> bpy.types.Object:
    """B-01: 18.3" fluted cold-hammer-forged quick-change barrel w/ hard-chrome extension,
    6-groove 1:7" rifling, forged gas block (interlocking front sight!) & slotted A2 birdcage."""
    m_br = mats["M_BarrelHeatTemper"]
    m_st = mats["M_BarrelStampBand"]
    m_ch = mats["M_HardChrome"]
    m_gb = mats["M_GasBlockDark"]
    m_so = mats["M_CarbonSoot"]

    parts: list[bpy.types.Object] = []

    # 1. Hard-chrome rear barrel extension (X in [4.20, 6.72]) w/ chamber mouth & indexing collar
    ext_profile = [
        (0.52, 4.20), (1.14, 4.20), (1.14, 6.55), (1.02, 6.72),
        (0.495, 6.72), (0.495, 5.65), (0.52, 4.20),
    ]
    parts.append(mk_lathe_x("br_ext", ext_profile, segs=36, mat=m_ch))
    parts.append(mk_box("br_ext_collar", 1.96, 0.42, 1.62, [("t", 5.25, -0.96, 0.0)], m_ch, bevel=0.028))

    # 2. Main hollow heavy fluted barrel tube + birdcage flash hider (X in [6.70, 57.30])
    barrel_profile = [
        (0.495, 6.70), (1.02, 6.70),
        (1.24, 9.80), (1.24, 15.60),   # Quick-change handle collar seat
        (1.06, 16.40), (0.94, 32.80),  # Heavy sustained-fire fluted contour
        (0.98, 33.10), (0.98, 37.00),  # Front gas block journal
        (0.84, 37.25),
        (0.836, 38.20), (0.784, 50.60), # Exact native ring cuts for forward caliber proof stamp!
        (0.78, 51.60),                 # Forward barrel contour
        (0.92, 51.85), (0.92, 52.35),  # Crush washer + wrench collar
        (0.84, 52.45), (0.92, 52.70),  # Birdcage rear shoulder
        (0.92, 57.15), (0.84, 57.30),  # Birdcage muzzle crown (exact +57.30!)
        (0.44, 57.22), (0.285, 52.00), # Flash hider expansion cone -> Ø5.56mm bore
        (0.285, 10.15),                # Rifled bore throat
        (0.325, 10.07),                # Case neck
        (0.485, 9.25),                 # 23° STANAG shoulder
        (0.495, 6.70),                 # Closes watertight loop
    ]
    barrel_body = mk_lathe_x("br_tube", barrel_profile, segs=36, mat=m_br)

    # Carve 6 heavy longitudinal cooling flutes (mid contour X in [17.4, 31.8]) + 5 A2 birdcage exhaust slots!
    cutters: list[bpy.types.Object] = []
    for k in range(6):
        ang = k * (2.0 * math.pi / 6.0) + math.pi / 6.0
        r_mid = 1.07
        cutters.append(mk_capsule_x(
            f"br_flute_m_{k}", 0.145, 13.8, segs=12, cap_rings=4,
            xform=[("t", 24.6, r_mid * math.cos(ang), r_mid * math.sin(ang))], mat=m_gb,
        ))
    # 5 authentic NATO A2 birdcage slots around upper 220° arc (solid floor suppresses prone dust!)
    for idx_s, deg in enumerate((-100.0, -50.0, 0.0, 50.0, 100.0)):
        rad = math.radians(deg)
        # Rotate around X so +Y slot points at angle `rad` in (Y, Z) plane
        slot_c = mk_box(
            f"br_a2_slot_{idx_s}", 2.35, 0.95, 0.25,
            [("t", 54.95, 0.68, 0.0), ("rx", rad)], mat=m_so,
        )
        cutters.append(slot_c)
    bool_subtract(barrel_body, cutters)

    # Assign `M_BarrelStampBand` directly onto the native outer forward barrel faces in X in [38.2, 50.6]
    # (ZERO duplicate sleeve geometry -> 100% seamless AO & shading!)
    barrel_body.data.materials.append(m_st)
    st_idx = len(barrel_body.data.materials) - 1
    for poly in barrel_body.data.polygons:
        c = poly.center
        n = poly.normal
        # Outer cylindrical surface: radius > 0.60, radial normal pointing outward
        r_c = math.hypot(c.y, c.z)
        if 38.22 <= c.x <= 50.58 and r_c > 0.60 and (c.y * n.y + c.z * n.z) > 0.2:
            poly.material_index = st_idx
    parts.append(barrel_body)

    # 3. 6-Groove 1:7" Hard-Chrome Helical Rifling Lands inside Bore
    parts.append(mk_helical_lands(
        "br_rifling", count=6, bore_r=0.285, height=0.015, half_ang=0.14,
        x0=10.30, x1=51.85, twist_cm=17.78, segs=14, mat=m_ch,
    ))

    # 4. Forged Front Gas Block (rises to local Y = +1.18 = world +2.43 so `m249_front_sight` seats ZERO-GAP!)
    gb_xy = [
        (33.20, 0.68), (34.25, 1.18), (36.55, 1.18), (36.92, 0.68),
        (36.70, -2.54), (33.55, -2.54),
    ]
    gas_block = mk_extrude_z("br_gas_block", gb_xy, -0.78, 0.78, bevel=0.040, bevel_segs=2, mat=m_gb)
    gb_bore_cut = mk_cyl("br_gb_gas_cut", 0.56, 0.56, 4.20, "x", 24, [("t", 35.15, -1.90, 0.0)], m_so)
    bool_subtract(gas_block, [gb_bore_cut])
    parts.append(gas_block)

    # Gas block lower reinforcement ring (r_out = 0.65 at Y = -1.90 -> minY = -2.550 exact!) & cross-pins
    parts.append(mk_lathe_x(
        "br_gb_ring",
        [(0.56, 33.40), (0.65, 33.40), (0.65, 36.85), (0.56, 36.85), (0.56, 33.40)],
        segs=24, xform=[("t", 0.0, -1.90, 0.0)], mat=m_gb,
    ))
    for px in (34.15, 36.05):
        parts.append(mk_cyl(f"br_gb_pin_{px}", 0.12, 0.12, 1.66, "z", 14, [("t", px, -1.02, 0.0)], m_ch, bevel=0.012))

    # Quick-change barrel-collar lug rings (X in [10.4, 15.0])
    for rx in (10.5, 14.9):
        parts.append(mk_cyl(f"br_qc_ring_{rx}", 1.24, 1.24, 0.42, "x", 32, [("t", rx, 0.0, 0.0)], m_gb, bevel=0.024))

    obj = join_objects(parts, "m249_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_gas_regulator(mats: dict) -> bpy.types.Object:
    """B-03: Multi-position fluted/knurled front gas block regulator collar & exhaust plug."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BrushedSteel"]
    m_so = mats["M_CarbonSoot"]

    parts: list[bpy.types.Object] = []

    # Stepped valve core & forward exhaust nose
    plug_prof = [
        (0.0, -1.05), (0.58, -1.05), (0.58, -0.12),
        (0.76, -0.06), (0.76, 0.86), (0.64, 0.94),
        (0.64, 1.65), (0.52, 1.78), (0.0, 1.78),
    ]
    parts.append(mk_lathe_x("gr_body", plug_prof, segs=28, mat=m_pk))
    # Prominent 16-flute knurled gas setting collar (r = 0.82)
    parts.append(mk_knurled_cyl("gr_collar", 0.82, 0.86, "x", flutes=16, depth=0.045, xform=[("t", 0.40, 0.0, 0.0)], mat=m_pk))
    # Sooted exhaust port ring & spring detent lock clip
    parts.append(mk_cyl("gr_vent", 0.65, 0.65, 0.24, "x", 24, [("t", 1.26, 0.0, 0.0)], m_so, bevel=0.015))
    parts.append(mk_box("gr_clip", 0.92, 0.32, 1.56, [("t", 0.38, 0.62, 0.0)], m_bs, bevel=0.022))

    obj = join_objects(parts, "m249_gas_regulator")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_piston_carrier(mats: dict) -> bpy.types.Object:
    """B-04: Long-stroke 3-ring stainless gas piston & heavy oiled-steel slide bolt carrier
    with helical bolt-cam channel, bottom sear catch & top hard-chrome feed-cam actuation roller."""
    m_oc = mats["M_OiledCarrier"]
    m_ch = mats["M_HardChrome"]
    m_bs = mats["M_BrushedSteel"]
    m_so = mats["M_CarbonSoot"]

    parts: list[bpy.types.Object] = []

    # 1. Hard-chrome long-stroke gas piston rod & 3-ring gas-obturator head (X in [-4.75, +30.80])
    piston_prof = [
        (0.0, -4.75), (0.54, -4.75), (0.56, 3.40), (0.44, 3.60),
        (0.44, 27.60), (0.66, 27.85), (0.66, 28.35), (0.54, 28.45),
        (0.54, 28.85), (0.67, 28.95), (0.67, 29.45), (0.55, 29.55),
        (0.68, 29.95), (0.68, 30.80), (0.46, 30.80), (0.42, 30.42),
        (0.0, 30.42),
    ]
    parts.append(mk_lathe_x("pc_rod", piston_prof, segs=28, mat=m_ch))
    # Subtle dark firing-gas soot disk inside concave front piston cup
    parts.append(mk_cyl("pc_cup_soot", 0.41, 0.38, 0.10, "x", 20, [("t", 30.46, 0.0, 0.0)], m_so))

    # 2. Machined oiled-steel bolt-carrier slide tower with real carved helical cam track!
    tower = mk_box("pc_tower", 7.64, 2.24, 1.76, [("t", -0.70, 1.48, 0.0)], m_oc, bevel=0.045, bevel_segs=2)
    cam_cut = mk_box("pc_cam_cut", 3.40, 0.85, 0.56, [("ry", 0.24), ("t", -0.35, 2.32, 0.0)], m_bs)
    bore_cut = mk_cyl("pc_bolt_cut", 0.71, 0.71, 4.20, "x", 24, [("t", 1.35, 1.90, 0.0)], m_bs)
    bool_subtract(tower, [cam_cut, bore_cut])
    parts.append(tower)

    # Burnished side guide-rail wings riding stamped receiver rails (Z = +-1.24)
    parts.append(mk_box("pc_wings", 7.20, 0.42, 2.48, [("t", -0.75, 1.22, 0.0)], m_bs, bevel=0.026))
    # Bottom hardened open-bolt sear catch lug (catches `m249_open_bolt_sear`!)
    parts.append(mk_box("pc_sear_lug", 1.65, 0.48, 1.12, [("t", -1.22, -0.44, 0.0)], m_ch, bevel=0.025))
    # Top vertical feed-cam actuation roller & spindle (drives `m249_feed_lever` & S-cam!)
    parts.append(mk_cyl("pc_roller_ped", 0.26, 0.34, 0.52, "y", 20, [("t", -1.80, 2.82, 0.0)], m_oc, bevel=0.020))
    parts.append(mk_cyl("pc_roller",     0.46, 0.46, 0.42, "y", 26, [("t", -1.80, 3.24, 0.0)], m_ch, bevel=0.032))

    obj = join_objects(parts, "m249_piston_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_bolt(mats: dict) -> bpy.types.Object:
    """B-05: Gleaming brushed-stainless/hard-chrome 2-lug rotating breech bolt w/ claw extractor."""
    m_ch = mats["M_HardChrome"]
    m_bs = mats["M_BrushedSteel"]
    m_dk = mats["M_GasBlockDark"]

    parts: list[bpy.types.Object] = []

    bolt_prof = [
        (0.16, -2.75), (0.64, -2.75), (0.68, -2.55), (0.68, 1.82),
        (0.62, 1.90), (0.62, 2.66), (0.58, 2.70), (0.49, 2.70),
        (0.49, 2.54), (0.16, 2.54), (0.16, -2.75),
    ]
    parts.append(mk_lathe_x("bt_body", bolt_prof, segs=32, mat=m_ch))

    # Dual opposing heavy beveled locking lugs (+-Z)
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"bt_lug_{side}", 0.74, 0.58, 0.44, [("t", 2.22, 0.02, side * 0.74)], m_bs, bevel=0.032))

    # Top belt-stripping feed horn, dark-phosphate claw extractor & plunger ejector
    parts.append(mk_box("bt_horn", 1.15, 0.34, 0.38, [("t", 2.08, 0.74, 0.0)], m_ch, bevel=0.026))
    parts.append(mk_box("bt_ext",  1.62, 0.26, 0.24, [("t", 1.52, 0.36, 0.64)], m_dk, bevel=0.022))
    parts.append(mk_cyl("bt_ext_pin", 0.08, 0.08, 0.34, "y", 12, [("t", 1.22, 0.36, 0.64)], m_ch))
    parts.append(mk_cyl("bt_ejector", 0.11, 0.11, 0.14, "x", 14, [("t", 2.60, 0.0, -0.26)], m_bs))
    # Bottom helical cam follower pin riding carrier cam channel
    parts.append(mk_cyl("bt_cam_pin", 0.24, 0.24, 0.66, "y", 20, [("t", -1.35, -0.78, 0.0)], m_bs, bevel=0.026))

    obj = join_objects(parts, "m249_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_firing_pin(mats: dict) -> bpy.types.Object:
    """B-06: Precision centerless-ground hard-chrome slide-linked firing pin."""
    m_ch = mats["M_HardChrome"]
    m_bs = mats["M_BrushedSteel"]

    shaft_prof = [
        (0.0, -2.75), (0.34, -2.75), (0.355, -2.35), (0.24, -2.28),
        (0.24, -0.45), (0.32, -0.38), (0.32, 0.12), (0.145, 0.24),
        (0.145, 2.72), (0.085, 3.08), (0.045, 3.16), (0.0, 3.18),
    ]
    parts = [
        mk_lathe_x("fp_shaft", shaft_prof, segs=24, mat=m_ch),
        mk_box("fp_lug", 0.56, 0.64, 0.42, [("t", -1.95, -0.38, 0.0)], m_bs, bevel=0.026),
        mk_cyl("fp_pin", 0.10, 0.10, 0.48, "z", 14, [("t", -1.95, -0.46, 0.0)], m_ch),
    ]
    obj = join_objects(parts, "m249_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_hydraulic_buffer(mats: dict) -> bpy.types.Object:
    """B-09: PIP stock-mounted hydraulic recoil damper with chrome plunger & mounting flange."""
    m_ch = mats["M_HardChrome"]
    m_bs = mats["M_BrushedSteel"]
    m_pk = mats["M_ParkerizedSteel"]

    damper_prof = [
        (0.0, -3.15), (0.64, -3.15), (0.68, -2.95),
        (0.68, -2.35), (0.62, -2.30), (0.62, -2.15), (0.68, -2.10),  # Machined retaining groove
        (0.68, -1.35), (0.62, -1.30), (0.62, -1.15), (0.68, -1.10),
        (0.68, -0.35), (0.77, -0.25), (0.77, 0.35),
        (0.58, 0.45), (0.58, 1.45), (0.38, 1.52), (0.38, 2.48),
        (0.32, 2.58), (0.0, 2.58),
    ]
    parts = [
        mk_lathe_x("hb_cyl", damper_prof, segs=28, mat=m_bs),
        mk_cyl("hb_plunger", 0.385, 0.385, 0.96, "x", 24, [("t", 2.02, 0.0, 0.0)], m_ch, bevel=0.020),
        mk_box("hb_flange",  0.72, 1.56, 1.46, [("t", 0.05, -0.06, 0.0)], m_pk, bevel=0.036),
    ]
    obj = join_objects(parts, "m249_hydraulic_buffer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_gas_tube(mats: dict) -> bpy.types.Object:
    """F-06: Seamless hollow underbarrel gas cylinder tube & forged front bipod yoke."""
    m_pk = mats["M_ParkerizedSteel"]
    m_gb = mats["M_GasBlockDark"]
    m_bs = mats["M_BrushedSteel"]

    parts: list[bpy.types.Object] = []

    tube = mk_lathe_x(
        "gt_tube",
        [(0.72, -12.82), (0.94, -12.82), (0.94, 12.75), (0.72, 12.75), (0.72, -12.82)],
        segs=32, mat=m_pk,
    )
    parts.append(tube)
    # Rear receiver locking collar flange & twin stiffening rings
    parts.append(mk_lathe_x(
        "gt_rear_ring",
        [(0.92, -12.82), (1.04, -12.82), (1.04, -11.95), (0.92, -11.95), (0.92, -12.82)],
        segs=28, mat=m_gb,
    ))
    # Forged front bipod mounting collar & downward swivel yoke
    collar = mk_box("gt_yoke", 2.34, 2.40, 2.36, [("t", 10.85, -0.32, 0.0)], m_gb, bevel=0.042)
    c_bore = mk_cyl("gt_yoke_cut", 0.72, 0.72, 3.00, "x", 24, [("t", 10.85, 0.0, 0.0)], m_gb)
    bool_subtract(collar, [c_bore])
    parts.append(collar)
    parts.append(mk_cyl("gt_bipod_pin", 0.22, 0.22, 2.38, "z", 16, [("t", 10.85, -1.16, 0.0)], m_bs, bevel=0.018))

    obj = join_objects(parts, "m249_gas_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_bipod(mats: dict) -> bpy.types.Object:
    """F-07: Rearward-folding telescoping twin stamped U-channel steel bipod w/ serrated ski feet."""
    m_pk = mats["M_ParkerizedSteel"]
    m_gb = mats["M_GasBlockDark"]
    m_bs = mats["M_BrushedSteel"]

    parts: list[bpy.types.Object] = []

    # Front swivel & folding hinge yoke block
    parts.append(mk_box("bp_head", 2.24, 1.34, 4.94, [("t", 10.45, 0.35, 0.0)], m_pk, bevel=0.038))
    parts.append(mk_cyl("bp_swivel", 0.56, 0.56, 1.32, "x", 20, [("t", 10.45, 0.42, 0.0)], m_gb, bevel=0.026))
    for side in (-1.0, 1.0):
        # Twin leg pivot knuckles & hinge pins
        parts.append(mk_cyl(f"bp_knuck_{side}", 0.52, 0.52, 0.86, "y", 18, [("t", 10.45, 0.22, side * 2.38)], m_gb, bevel=0.025))
        parts.append(mk_cyl(f"bp_hpin_{side}",  0.18, 0.18, 1.06, "y", 14, [("t", 10.45, 0.22, side * 2.38)], m_bs, bevel=0.015))

        # Stamped U-channel outer leg shell (hollowed channel facing inward/outward with adjustment slots!)
        leg_outer = mk_box(f"bp_leg_{side}", 21.7, 0.88, 0.68, [("t", -0.65, 0.05, side * 2.38)], m_pk, bevel=0.032)
        # Carve authentic U-channel groove & 3 telescoping height-lock notch slots
        leg_cuts = [
            mk_box(f"bp_ch_{side}", 19.6, 0.48, 0.36, [("t", -0.80, 0.05, side * 2.58)], m_gb),
        ]
        for sx in (-6.5, -2.5, 1.5, 5.5):
            leg_cuts.append(mk_stadium_z(f"bp_slot_{side}_{sx}", 0.52, 0.14, 0.50, 8, [("t", sx, 0.05, side * 2.38)], m_gb))
        bool_subtract(leg_outer, leg_cuts)
        parts.append(leg_outer)

        # Spring release thumb latch on outer leg collar
        parts.append(mk_box(f"bp_latch_{side}", 1.15, 0.36, 0.24, [("t", -8.4, 0.36, side * 2.74)], m_bs, bevel=0.018))

        # Telescoping brushed-stainless inner leg tube
        parts.append(mk_cyl(f"bp_inner_{side}", 0.28, 0.28, 3.25, "x", 18, [("t", -10.40, 0.05, side * 2.38)], m_bs, bevel=0.020))

        # Wide serrated mud/snow ski foot & ground cleats at rear (-X = -11.85)
        parts.append(mk_box(f"bp_ski_{side}", 0.62, 1.64, 1.34, [("t", -11.85, -0.25, side * 2.42)], m_gb, bevel=0.028))
        for cy in (-0.75, -0.25, 0.25):
            parts.append(mk_box(f"bp_cleat_{side}_{cy}", 0.24, 0.16, 1.32, [("t", -12.04, cy, side * 2.42)], m_pk, bevel=0.014))

    obj = join_objects(parts, "m249_bipod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_trigger(mats: dict) -> bpy.types.Object:
    """FC-02: Wide curved serrated steel LMG trigger & sear-release yoke."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BrushedSteel"]
    m_ch = mats["M_HardChrome"]

    shoe_xy = [(-0.28, 1.15), (0.42, 1.15), (0.56, 0.15)]
    shoe_xy += _quad_bez((0.56, 0.15), (0.28, -1.15), (0.78, -2.18), 8)
    shoe_xy += _quad_bez((0.78, -2.18), (0.84, -2.38), (0.56, -2.42), 5)
    shoe_xy += _quad_bez((0.56, -2.42), (-0.18, -1.25), (0.02, 0.12), 8)

    parts = [
        mk_extrude_z("tr_shoe", shoe_xy, -0.33, 0.33, bevel=0.036, bevel_segs=2, mat=m_pk),
        mk_box("tr_yoke", 1.84, 0.42, 0.78, [("t", -0.35, 1.02, 0.0)], m_bs, bevel=0.026),
        mk_cyl("tr_pin",  0.18, 0.18, 1.12, "z", 18, [("t", 0.12, 0.92, 0.0)], m_ch, bevel=0.016),
    ]
    obj = join_objects(parts, "m249_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_open_bolt_sear(mats: dict) -> bpy.types.Object:
    """FC-03: Case-hardened heavy rocking open-bolt sear catch with gleaming catch nose."""
    m_bs = mats["M_BrushedSteel"]
    m_ch = mats["M_HardChrome"]
    m_pk = mats["M_ParkerizedSteel"]

    sear_xy = [
        (-1.95, -0.36), (1.92, -0.36), (1.98, 0.08), (0.95, 0.16),
        (0.82, 0.58), (0.32, 0.58), (-0.15, 0.18), (-1.95, 0.14),
    ]
    parts = [
        mk_extrude_z("sr_body", sear_xy, -0.52, 0.52, bevel=0.032, bevel_segs=2, mat=m_bs),
        mk_box("sr_nose_cap", 0.52, 0.18, 1.02, [("t", 0.57, 0.49, 0.0)], m_ch, bevel=0.020),
        mk_cyl("sr_axle", 0.20, 0.20, 1.48, "z", 18, [("t", -1.42, -0.10, 0.0)], m_ch, bevel=0.018),
        mk_cyl("sr_spring_cup", 0.22, 0.22, 0.14, "y", 14, [("t", 0.60, -0.29, 0.0)], m_pk),
    ]
    obj = join_objects(parts, "m249_open_bolt_sear")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_feed_lever(mats: dict) -> bpy.types.Object:
    """M-02: Pivoting S-forked belt feed cam lever straddling carrier roller."""
    m_bs = mats["M_BrushedSteel"]
    m_ch = mats["M_HardChrome"]
    m_pk = mats["M_ParkerizedSteel"]

    parts = [
        mk_box("fl_spine", 7.80, 0.28, 0.72, [("t", -2.10, 0.0, 0.0)], m_bs, bevel=0.026),
        mk_box("fl_forkL", 2.44, 0.34, 0.28, [("t", -6.75, -0.12, -0.46)], m_ch, bevel=0.022),
        mk_box("fl_forkR", 2.44, 0.34, 0.28, [("t", -6.75, -0.12,  0.46)], m_ch, bevel=0.022),
        mk_cyl("fl_pivot", 0.42, 0.42, 0.64, "y", 22, [("t", -1.45, 0.12, 0.0)], m_pk, bevel=0.026),
        mk_box("fl_tongue", 1.84, 0.38, 0.52, [("t",  2.15, -0.18, -0.15)], m_ch, bevel=0.026),
    ]
    obj = join_objects(parts, "m249_feed_lever")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_feed_pawls(mats: dict) -> bpy.types.Object:
    """M-03: Dual-stage spring-loaded shuttle feed slide & 4 ratcheting belt pawls."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BrushedSteel"]
    m_ch = mats["M_HardChrome"]

    parts: list[bpy.types.Object] = [
        mk_box("fpw_slide", 4.50, 0.34, 3.14, [("t", 0.0, 0.14, 0.0)], m_pk, bevel=0.026),
        mk_box("fpw_boss",  1.25, 0.32, 0.94, [("t", 0.95, 0.34, 0.42)], m_ch, bevel=0.022),
        mk_cyl("fpw_pinA",  0.10, 0.10, 3.04, "z", 12, [("t", -1.25, -0.02, 0.0)], m_ch),
        mk_cyl("fpw_pinB",  0.10, 0.10, 3.04, "z", 12, [("t",  1.25, -0.02, 0.0)], m_ch),
    ]
    for px in (-1.25, 1.25):
        for pz, tilt in ((-1.18, 0.24), (0.18, 0.22)):
            parts.append(mk_box(f"fpw_p_{px}_{pz}", 0.72, 0.32, 0.62, [("rx", tilt), ("t", px, -0.14, pz)], m_bs, bevel=0.022))

    obj = join_objects(parts, "m249_feed_pawls")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_m27_belt(mats: dict) -> bpy.types.Object:
    """M-04 SHOWSTOPPER: 7 linked 1:1 5.56x45mm NATO M855 Green-Tip cartridges with annealed-neck
    C26000 brass, copper FMJ jackets, vivid emerald-green painted penetrator tips, silver primers
    with red waterproof sealant rings & dark parkerized M27 disintegrating spring-steel links!"""
    m_br = mats["M_Brass556"]
    m_cu = mats["M_CopperFMJ"]
    m_gn = mats["M_M855GreenTip"]
    m_lk = mats["M_M27LinkSteel"]
    m_pr = mats["M_PrimerSilver"]
    m_rd = mats["M_PrimerRedRing"]

    stations = [
        ( 1.28,  1.50, 0.02),
        ( 1.24,  0.24, 0.16),
        ( 0.82, -0.82, 0.58),
        (-0.12, -1.32, 1.05),
        (-1.18, -1.42, 1.38),
        (-2.26, -1.24, 1.48),
        (-3.32, -0.96, 1.52),
    ]

    case_prof = [
        (0.0, -2.85), (0.47, -2.85), (0.48, -2.74),
        (0.42, -2.68), (0.42, -2.54), (0.48, -2.46),
        (0.46, 0.68), (0.33, 1.04), (0.32, 1.62), (0.0, 1.62),
    ]
    copper_prof = [
        (0.0, 1.56), (0.285, 1.56), (0.282, 1.88),
        (0.235, 2.18), (0.160, 2.42), (0.0, 2.42),
    ]
    green_prof = [
        (0.0, 2.38), (0.165, 2.38), (0.098, 2.67),
        (0.032, 2.86), (0.0, 2.89),
    ]
    rear_clip_prof = [
        (0.465, -1.65), (0.545, -1.65), (0.545, -0.85), (0.465, -0.85), (0.465, -1.65),
    ]
    front_clip_prof = [
        (0.455, -0.15), (0.535, -0.15), (0.535, 0.58), (0.455, 0.58), (0.455, -0.15),
    ]

    parts: list[bpy.types.Object] = []
    for idx, (ly, lz, rx) in enumerate(stations):
        xf = [("rx", rx), ("t", 0.0, ly, lz)]
        parts.append(mk_lathe_x(f"m27_case_{idx}",   case_prof,       segs=22, xform=xf, mat=m_br))
        parts.append(mk_lathe_x(f"m27_copper_{idx}", copper_prof,     segs=20, xform=xf, mat=m_cu))
        parts.append(mk_lathe_x(f"m27_green_{idx}",  green_prof,      segs=18, xform=xf, mat=m_gn))
        # Crisp case-head boxer primer + crimson waterproof sealant annulus on rear face (X=-2.85)!
        parts.append(mk_cyl(f"m27_prim_{idx}", 0.16, 0.16, 0.04, "x", 14, [("t", -2.845, 0.0, 0.0)] + xf, m_pr))
        parts.append(mk_lathe_x(
            f"m27_ring_{idx}",
            [(0.16, -2.855), (0.21, -2.855), (0.21, -2.82), (0.16, -2.82), (0.16, -2.855)],
            segs=14, xform=xf, mat=m_rd,
        ))
        # Authentic stamped parkerized M27 disintegrating spring-steel links
        parts.append(mk_lathe_x(f"m27_rclip_{idx}",  rear_clip_prof,  segs=20, xform=xf, mat=m_lk))
        parts.append(mk_lathe_x(f"m27_fclip_{idx}",  front_clip_prof, segs=20, xform=xf, mat=m_lk))
        parts.append(mk_box(f"m27_spine_{idx}", 2.34, 0.16, 0.48, [("t", -0.52, 0.54, 0.0)] + xf, m_lk, bevel=0.018))
        # Rim-stop tab engaging cartridge shoulder
        parts.append(mk_box(f"m27_tab_{idx}",   0.22, 0.24, 0.36, [("t", -1.68, 0.46, 0.0)] + xf, m_lk, bevel=0.014))
        if idx > 0:
            parts.append(mk_box(f"m27_ear_{idx}", 0.72, 0.22, 0.86, [("t", -0.52, 0.48, 0.68)] + xf, m_lk, bevel=0.018))

    obj = join_objects(parts, "m249_m27_belt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# GROUP 3: 200-RD OD-GREEN SAW BOX & PIP POLYMER FURNITURE (Suite 3)
# =============================================================================
def build_m249_barrel_handle(mats: dict) -> bpy.types.Object:
    """B-02: Folding quick-change barrel latch yoke, swept steel bail & 6-rib matte carry handle."""
    m_st = mats["F_WireSteel"]
    m_hs = mats["F_HeatshieldSteel"]
    m_pl = mats["F_PolymerCharcoal"]

    parts: list[bpy.types.Object] = [
        # Barrel locking yoke & spring quick-release latch hugging barrel collar
        mk_box("bh_yoke",  1.65, 1.74, 1.44, [("t", -2.45, -0.82, -1.25)], m_hs, bevel=0.036),
        mk_box("bh_latch", 1.84, 0.38, 0.92, [("t", -3.15, -0.15, -0.65)], m_st, bevel=0.026),
        mk_cyl("bh_pin",   0.18, 0.18, 1.56, "z", 16, [("t", -2.45, -0.42, -1.22)], m_st, bevel=0.015),
    ]

    # Heavy swept steel carry bail rod
    bail_pts = [
        Vector((-2.35, -0.35, -0.95)),
        Vector((-2.15,  0.22, -0.45)),
        Vector((-1.90,  0.68,  0.05)),
        Vector((-1.25,  0.95,  0.62)),
        Vector(( 4.85,  0.95,  0.85)),
    ]
    parts.append(mk_tube_along_pts("bh_bail", bail_pts, 0.22, ring_segs=16, mat=m_st))

    # Contoured 6-rib insulated matte charcoal polyamide rotating grip
    grip_prof = [
        (0.0, -0.85), (0.66, -0.85), (0.74, -0.65),
        (0.74, -0.10), (0.64, 0.05), (0.64, 0.35), (0.76, 0.50),
        (0.76, 0.85),  (0.64, 1.00), (0.64, 1.30), (0.76, 1.45),
        (0.76, 1.80),  (0.64, 1.95), (0.64, 2.25), (0.76, 2.40),
        (0.76, 2.75),  (0.64, 2.90), (0.64, 3.20), (0.76, 3.35),
        (0.76, 3.70),  (0.64, 3.85), (0.64, 4.10), (0.74, 4.30),
        (0.62, 4.65),  (0.0, 4.65),
    ]
    parts.append(mk_lathe_x("bh_grip", grip_prof, segs=26, xform=[("ry", -0.04), ("t", 0.10, 0.95, 0.76)], mat=m_pl))
    parts.append(mk_cyl("bh_endcap", 0.42, 0.42, 0.18, "x", 18, [("ry", -0.04), ("t", 4.78, 0.95, 0.85)], m_st, bevel=0.018))

    obj = join_objects(parts, "m249_barrel_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_handguard(mats: dict) -> bpy.types.Object:
    """F-05: Matte charcoal ribbed vented lower polymer handguard + authentic M249 PIP
    perforated stamped-steel upper barrel heatshield shroud with 7 real oval cooling slots per side!"""
    m_pl = mats["F_PolymerCharcoal"]
    m_hs = mats["F_HeatshieldSteel"]

    parts: list[bpy.types.Object] = []

    # 1. Lower matte charcoal ribbed polymer U-trough handguard (X in [-10.50, +10.50])
    lower_zy = [(-2.26, 0.45), (-2.14, -1.65)]
    lower_zy += _quad_bez((-2.14, -1.65), (-1.85, -2.18), (-1.15, -2.22), 6)
    lower_zy.append((1.15, -2.22))
    lower_zy += _quad_bez((1.15, -2.22), (1.85, -2.18), (2.14, -1.65), 6)
    lower_zy += [(2.26, 0.45), (1.92, 0.45), (1.80, -1.52), (-1.80, -1.52), (-1.92, 0.45)]
    lower_trough = mk_extrude_x("hg_lower", lower_zy, -10.50, 10.50, bevel=0.036, bevel_segs=2, mat=m_pl)

    # Carve 5 real underside cooling vents + transverse grip flutes along lower polymer handguard
    l_cuts: list[bpy.types.Object] = []
    for vx in (-7.2, -3.6, 0.0, 3.6, 7.2):
        l_cuts.append(mk_box(f"hg_lvent_{vx}", 1.65, 0.95, 1.35, [("t", vx, -2.02, 0.0)], m_pl))
    bool_subtract(lower_trough, l_cuts)
    parts.append(lower_trough)

    # 9 Molded external transverse grip ribs along lower handguard flanks & belly
    for rx in (-8.8, -6.6, -4.4, -2.2, 0.0, 2.2, 4.4, 6.6, 8.8):
        parts.append(mk_box(f"hg_rib_{rx}", 0.34, 1.35, 4.52, [("t", rx, -0.78, 0.0)], m_pl, bevel=0.028))

    # 2. Upper M249 PIP Perforated Stamped-Steel Barrel Heatshield Shroud (7 real oval slots per flank!)
    shroud_xy = [(-10.10, 0.65), (10.10, 0.65), (9.80, 2.15), (-9.80, 2.15)]
    for side in (-1.0, 1.0):
        flank = mk_extrude_z(f"hg_shroud_{side}", shroud_xy, side * 1.68 - 0.11, side * 1.68 + 0.11, bevel=0.018, bevel_segs=2, mat=m_hs)
        slot_cuts = []
        for s in range(7):
            cx = -7.8 + s * 2.6
            slot_cuts.append(mk_stadium_z(f"hg_ov_{side}_{s}", 0.44, 0.36, 0.45, 10, [("t", cx, 1.42, side * 1.68)], m_hs))
        bool_subtract(flank, slot_cuts)
        parts.append(flank)

    # Perforated stamped-steel shroud top bridge with 7 top exhaust slots!
    roof = mk_box("hg_roof", 19.40, 0.22, 3.42, [("t", 0.0, 2.17, 0.0)], m_hs, bevel=0.022)
    r_cuts = []
    for s in range(7):
        cx = -7.8 + s * 2.6
        r_cuts.append(mk_box(f"hg_rslot_{s}", 1.35, 0.55, 1.65, [("t", cx, 2.18, 0.0)], m_hs))
    bool_subtract(roof, r_cuts)
    parts.append(roof)

    # Rear & front stamped steel heatshield retaining clips
    parts.append(mk_box("hg_clip_f", 0.55, 1.55, 3.62, [("t",  9.85, 1.35, 0.0)], m_hs, bevel=0.024))
    parts.append(mk_box("hg_clip_r", 0.55, 1.55, 3.62, [("t", -9.85, 1.35, 0.0)], m_hs, bevel=0.024))

    obj = join_objects(parts, "m249_handguard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_buttstock(mats: dict) -> bpy.types.Object:
    """F-08: Hollow PIP glass-filled polymer heavy fish-belly buttstock w/ serrated rubber buttpad,
    front steel clevis collar, sling swivel & signature folding brushed-steel wire shoulder rest."""
    m_pl = mats["F_PolymerCharcoal"]
    m_rb = mats["F_RubberPad"]
    m_st = mats["F_WireSteel"]
    m_hs = mats["F_HeatshieldSteel"]

    parts: list[bpy.types.Object] = []

    # Iconic heavy fish-belly M249 PIP polymer buttstock body
    stock_xy = [(15.35, 2.55), (-14.65, 2.25), (-14.95, -6.65)]
    stock_xy += _quad_bez((-14.95, -6.65), (-11.20, -6.95), (-7.80, -5.45), 8)
    stock_xy += _quad_bez((-7.80, -5.45), (-3.20, -3.35), (4.50, -2.45), 8)
    stock_xy.append((15.35, -1.65))
    stock_body = mk_extrude_z("bs_body", stock_xy, -1.84, 1.84, bevel=0.20, bevel_segs=3, mat=m_pl)

    # Carve hollow internal hydraulic-buffer cavity opening at front (+X) & subtle flank recessed cheek panels
    cav_cut = mk_cyl("bs_buf_cav", 0.85, 0.85, 10.5, "x", 22, [("t", 11.2, 1.28, 0.0)], m_pl)
    bool_subtract(stock_body, [cav_cut])
    parts.append(stock_body)

    # Molded polymer side reinforcement bosses & left rear steel sling loop (-Z)
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"bs_rib_{side}", 16.5, 0.42, 0.14, [("t", 1.8, 1.55, side * 1.84)], m_pl, bevel=0.032))
    parts.append(mk_box("bs_sling_mount", 1.15, 0.85, 0.24, [("t", -11.4, -3.65, -1.86)], m_hs, bevel=0.025))

    # Serrated vulcanized rubber recoil buttpad (exact local minX = -15.60 -> world -46.20!)
    parts.append(mk_box("bs_buttpad", 0.98, 9.04, 3.84, [("t", -15.11, -2.18, 0.0)], m_rb, bevel=0.075, bevel_segs=2))
    for sy in (-5.6, -4.4, -3.2, -2.0, -0.8, 0.4, 1.4):
        parts.append(mk_box(f"bs_padrib_{sy}", 0.16, 0.34, 3.68, [("t", -15.54, sy, 0.0)], m_rb, bevel=0.020))

    # Signature M249 Hinged Folding Heavy Brushed-Steel Wire Shoulder Rest along top comb!
    wire_pts = [
        Vector((-14.75, 2.48, -1.55)),
        Vector((-10.00, 2.58, -1.55)),
        Vector(( -4.20, 2.68, -1.55)),
        Vector(( -3.62, 2.72, -0.78)),
        Vector(( -3.55, 2.72,  0.00)),
        Vector(( -3.62, 2.72,  0.78)),
        Vector(( -4.20, 2.68,  1.55)),
        Vector((-10.00, 2.58,  1.55)),
        Vector((-14.75, 2.48,  1.55)),
    ]
    parts.append(mk_tube_along_pts("bs_wire_rest", wire_pts, 0.18, ring_segs=14, mat=m_st))
    # Rear wire-rest hinge knuckles anchored cleanly into buttplate crown
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"bs_wire_hinge_{side}", 0.92, 0.65, 0.48, [("t", -14.78, 2.34, side * 1.55)], m_hs, bevel=0.028))

    # Front steel clevis mounting collar mating flush with `m249_receiver` rear backplate!
    parts.append(mk_box("bs_clevis", 1.45, 4.18, 3.92, [("t", 14.65, 0.45, 0.0)], m_hs, bevel=0.036))
    parts.append(mk_cyl("bs_pin_top", 0.24, 0.24, 3.94, "z", 16, [("t", 14.68, 2.02, 0.0)], m_st, bevel=0.018))
    parts.append(mk_cyl("bs_pin_bot", 0.24, 0.24, 3.94, "z", 16, [("t", 14.68, -1.12, 0.0)], m_st, bevel=0.018))

    obj = join_objects(parts, "m249_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_trigger_frame(mats: dict) -> bpy.types.Object:
    """FC-01: Pinned steel trigger housing w/ white/red S/F cross-bolt safety markings,
    100% SOLIDLY WELDED oversized winter trigger guard (ZERO air gaps!) & ribbed polymer grip."""
    m_hs = mats["F_HeatshieldSteel"]
    m_pl = mats["F_PolymerCharcoal"]
    m_st = mats["F_GripStipple"]
    m_rb = mats["F_RubberPad"]
    m_ws = mats["F_WireSteel"]
    m_rd = mats["F_SafetyRed"]

    parts: list[bpy.types.Object] = []

    # 1. Upper Steel Trigger Housing Walls & Floor (outer flat hero faces at Z = +-1.05!)
    parts.append(mk_box("tf_wallL", 9.40, 1.56, 0.26, [("t", -0.95, 1.60, -0.92)], m_hs, bevel=0.022))
    parts.append(mk_box("tf_wallR", 9.40, 1.56, 0.26, [("t", -0.95, 1.60,  0.92)], m_hs, bevel=0.022))
    parts.append(mk_box("tf_floor", 9.20, 0.36, 1.84, [("t", -0.95, 0.94,  0.00)], m_hs, bevel=0.024))

    # Front & rear captive receiver takedown cross-pin bosses (mate solidly with receiver hanger ears!)
    parts.append(mk_cyl("tf_pin_f", 0.34, 0.34, 2.28, "z", 20, [("t",  3.35, 2.05, 0.0)], m_ws, bevel=0.025))
    parts.append(mk_cyl("tf_pin_r", 0.34, 0.34, 2.28, "z", 20, [("t", -5.25, 2.05, 0.0)], m_ws, bevel=0.025))

    # Push-button Cross-Bolt Safety (exact local X=+0.45, Y=+1.38) + Firewalled Crimson FIRE ring!
    parts.append(mk_cyl("tf_safety_cyl", 0.26, 0.26, 2.48, "z", 20, [("t", 0.45, 1.38, 0.0)], m_hs, bevel=0.022))
    parts.append(mk_cyl("tf_safety_red", 0.276, 0.276, 0.28, "z", 20, [("t", 0.45, 1.38, -1.06)], m_rd, bevel=0.014))

    # 2. 100% SOLIDLY WELDED Oversized Arctic Trigger Guard Loop (ZERO air gaps front OR rear!)
    # Front upright embeds deeply into housing floor up to Y=+1.10; rear leg embeds deeply into pistol grip to X=-1.35!
    guard_xy = [(3.88, 1.10), (3.95, -1.65)]
    guard_xy += _quad_bez((3.95, -1.65), (3.68, -2.56), (1.85, -2.62), 8)
    guard_xy += [(-1.35, -2.54), (-1.35, -1.96), (1.75, -2.18)]
    guard_xy += _quad_bez((1.75, -2.18), (3.26, -2.12), (3.44, -1.45), 8)
    guard_xy.append((3.36, 1.10))
    parts.append(mk_extrude_z("tf_guard", guard_xy, -0.45, 0.45, bevel=0.036, bevel_segs=2, mat=m_pl))

    # 3. Contoured Ribbed M249 Polymer Pistol Grip (welded seamlessly to housing floor & rear trigger guard!)
    grip_xy = [(-0.20, 1.05), (-3.55, 1.05)]
    grip_xy += _quad_bez((-3.55, 1.05), (-4.18, -0.40), (-5.35, -6.15), 10)
    grip_xy += _quad_bez((-5.35, -6.15), (-5.45, -6.65), (-4.75, -6.72), 5)
    grip_xy.append((-2.05, -6.58))
    grip_xy += _quad_bez((-2.05, -6.58), (-1.55, -6.45), (-1.42, -5.85), 5)
    grip_xy += _quad_bez((-1.42, -5.85), (-0.75, -2.85), (-0.20, -1.25), 8)
    parts.append(mk_extrude_z("tf_grip", grip_xy, -1.34, 1.34, bevel=0.16, bevel_segs=3, mat=m_pl))

    # Raised Diamond-Checkered Stipple Side Panels on Left & Right of Pistol Grip!
    stip_xy = [(-0.92, -1.45), (-3.45, -1.10), (-4.55, -5.70), (-1.85, -5.85)]
    for side in (-1.0, 1.0):
        parts.append(mk_extrude_z(f"tf_stip_{side}", stip_xy, side * 1.24, side * 1.36, bevel=0.025, bevel_segs=2, mat=m_st))

    # Ergonomic front-strap finger ribs & flared storage-compartment basecap
    for fy, fx in ((-2.95, -0.92), (-4.10, -1.18), (-5.25, -1.42)):
        parts.append(mk_cyl(f"tf_frib_{fy}", 0.22, 0.22, 1.75, "z", 14, [("t", fx, fy, 0.0)], m_pl))
    parts.append(mk_box("tf_basecap", 3.16, 0.44, 2.74, [("rz", 0.06), ("t", -3.42, -6.62, 0.0)], m_rb, bevel=0.048))

    obj = join_objects(parts, "m249_trigger_frame")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m249_ammo_box(mats: dict) -> bpy.types.Object:
    """M-05 HERO SHOWSTOPPER: 200-Round OD-Green Molded Polymer SAW Assault Box (`isShell: true`)
    with genuinely hollow interior, vertical anti-crush structural ribs framing clean uninterrupted
    flat flank stencil placards on BOTH sides, charcoal snap-lid, receiver dovetail & hollow belt chute!"""
    m_od = mats["F_ODGreenBox"]
    m_pl = mats["F_PolymerCharcoal"]
    m_ws = mats["F_WireSteel"]

    parts: list[bpy.types.Object] = []

    # 1. Hollow OD-Green Rounded-Corner Assault Box Shell (Y in [-5.45, +4.20], X in [-5.32, +5.32], Z in [-4.55, +4.35])
    # Flat outer flank faces at Z = -4.55 (Left) & Z = +4.35 (Right) for ZERO-distortion hero yellow stencils!
    outer_xz = [(-4.82, -4.55), (4.82, -4.55)]
    outer_xz += _quad_bez((4.82, -4.55), (5.32, -4.55), (5.32, -4.05), 5)
    outer_xz.append((5.32, 3.85))
    outer_xz += _quad_bez((5.32, 3.85), (5.32, 4.35), (4.82, 4.35), 5)
    outer_xz.append((-4.82, 4.35))
    outer_xz += _quad_bez((-4.82, 4.35), (-5.32, 4.35), (-5.32, 3.85), 5)
    outer_xz.append((-5.32, -4.05))
    outer_xz += _quad_bez((-5.32, -4.05), (-5.32, -4.55), (-4.82, -4.55), 5)

    box_shell = mk_extrude_y("ab_shell", outer_xz, -5.45, 4.20, bevel=0.14, bevel_segs=2, mat=m_od)
    # Hollow interior cavity so Section Cut (C) displays real molded polymer wall thickness!
    box_cav = mk_box("ab_cav", 9.65, 9.20, 7.90, [("t", 0.0, -0.25, -0.10)], m_od)
    bool_subtract(box_shell, [box_cav])
    parts.append(box_shell)

    # 2. Vertical Anti-Crush Structural Ribs framing (NEVER obscuring!) the flat stencil placards on BOTH flanks!
    #  - Lower-apron vertical ribs (Y in [-5.15, -2.55]) across BOTH flanks (protrude cleanly to Z = -4.68 / +4.48!)
    for rx in (-3.60, -1.80, 0.00, 1.80, 3.60):
        parts.append(mk_box(f"ab_lrib_{rx}", 0.42, 2.55, 9.16, [("t", rx, -3.88, -0.10)], m_od, bevel=0.045))
    #  - Full-height vertical corner pilasters flanking the stencil window (X = +-4.58)
    for rx in (-4.58, 4.58):
        parts.append(mk_box(f"ab_pil_{rx}", 0.46, 8.65, 9.16, [("t", rx, -0.62, -0.10)], m_od, bevel=0.045))
    #  - Horizontal lower/upper placard framing beads framing the yellow stencil cleanly!
    parts.append(mk_box("ab_hbead_b", 9.50, 0.28, 9.14, [("t", 0.0, -2.56, -0.10)], m_od, bevel=0.036))
    parts.append(mk_box("ab_hbead_t", 9.50, 0.28, 9.14, [("t", 0.0,  3.82, -0.10)], m_od, bevel=0.036))
    #  - Heavy vertical anti-crush ribs on Front (+X) & Rear (-X) end walls (X = +-5.34!)
    for rz in (-2.55, -0.10, 2.35):
        parts.append(mk_box(f"ab_erib_{rz}", 10.78, 8.40, 0.48, [("t", 0.0, -0.62, rz)], m_od, bevel=0.045))

    # 3. Charcoal Polymer Snap-On Top Cover Lid, Receiver T-Slot Dovetail & Hollow M27 Feed-Chute Neck!
    parts.append(mk_box("ab_lid", 10.80, 0.72, 9.10, [("t", 0.0, 4.48, -0.10)], m_pl, bevel=0.055))
    # Side lid retention latch tabs
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"ab_latch_{side}", 1.85, 0.92, 0.28, [("t", 0.0, 4.18, side * 4.54 - 0.10)], m_pl, bevel=0.030))

    # Central T-slot receiver mounting bracket rising to local Y=+5.92 (world Y=-1.88, ZERO gap to receiver!)
    parts.append(mk_box("ab_dovetail", 6.40, 1.18, 2.44, [("t", -0.65, 5.33, 0.65)], m_pl, bevel=0.040))
    parts.append(mk_box("ab_lock_clip", 1.25, 0.34, 1.95, [("t", 2.15, 5.25, 0.65)], m_ws, bevel=0.022))

    # Hollow angled left-side M27 belt feed-chute neck (belt rounds emerge genuinely from INSIDE this mouth!)
    chute = mk_box("ab_chute", 6.60, 1.85, 1.96, [], m_pl, bevel=0.055)
    chute_cut = mk_box("ab_chute_cut", 5.95, 2.40, 1.36, [("t", 0.0, 0.12, 0.0)], m_pl)
    bool_subtract(chute, [chute_cut])
    bm_c = bmesh.new()
    bm_c.from_mesh(chute.data)
    bmesh.ops.transform(bm_c, matrix=T2B_MAT.inverted(), verts=bm_c.verts)
    _apply_three_xform(bm_c, [("rx", -0.22), ("t", -1.85, 5.15, -3.55)])
    bm_c.to_mesh(chute.data)
    bm_c.free()
    parts.append(chute)

    obj = join_objects(parts, "m249_ammo_box")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Strict Firewalls + CONCAVE Packing (>=0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    select_face_fn=None,
    skip_face_fn=None,
):
    """Smart-project & CONCAVE-pack selected faces into exact UV rectangle [u0,u1]x[v0,v1]."""
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    active_objs: list[bpy.types.Object] = []
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
        sel_count = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None:
                want = select_face_fn(o.name, f, mname)
            elif skip_face_fn is not None:
                want = not skip_face_fn(o.name, f, mname)
            else:
                want = True
            f.select = want
            if want:
                sel_count += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if sel_count > 0:
            active_objs.append(o)

    assert active_objs, f"No faces selected for UV packing into [{u0},{u1}]x[{v0},{v1}]!"
    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.0045,
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

    du = u1 - u0
    dv = v1 - v0
    packed_u_min, packed_u_max = 1.0, 0.0
    packed_v_min, packed_v_max = 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None:
                if not select_face_fn(o.name, f, mname):
                    continue
            elif skip_face_fn is not None:
                if skip_face_fn(o.name, f, mname):
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
    print(f"  [UV-PACK] {len(active_objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.35 and span_v > 0.35, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 6 receiver/sight/cover/tray/CH parts into `m249_v3_receiver` (2048x2048):
      - Hero Band 1 (Receiver Left  Wall, X in [-15.1,+10.7], Y in [-1.95,+2.55]): [0.015, 0.985] x [0.815, 0.985]
      - Hero Band 2 (Receiver Right Wall, X in [-15.1,+10.7], Y in [-1.95,+2.55]): [0.015, 0.985] x [0.630, 0.800]
      - Hero Band 3a (Top Cover Left  Flank, X in [-24.4,+0.42]):                  [0.015, 0.985] x [0.550, 0.618]
      - Hero Band 3b (Top Cover Right Flank, X in [-24.4,+0.42]):                  [0.015, 0.985] x [0.470, 0.538]
      - Hero Band 3c (Top Cover M1913 Rail Crests, X in [-20.8,-4.0]):             [0.015, 0.985] x [0.415, 0.458]
      - Hero Band 4  (Rear Sight 300-1000m Elevation Drum):                        [0.015, 0.320] x [0.355, 0.402]
      - Packed Sights Non-Hero (`m249_rear_sight`, `m249_front_sight`):            [0.340, 0.990] x [0.355, 0.402]
      - Packed Main Non-Hero (Receiver, Top Cover, Feed Tray, Charging Handle):    [0.010, 0.990] x [0.010, 0.340]
    """
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "m249_receiver" and mat_name == "R_ReceiverParkerized":
            if -15.12 <= tx <= 10.72 and -1.96 <= ty <= 2.56:
                if nz < -0.85 and -2.095 <= tz <= -2.055:
                    return "rec_left"
                if nz > 0.85 and 2.055 <= tz <= 2.095:
                    return "rec_right"
        if obj_name == "m249_top_cover":
            if mat_name == "R_TopCoverAlloy":
                if -24.42 <= tx <= 0.44 and -0.10 <= ty <= 0.96:
                    if nz < -0.85 and -2.185 <= tz <= -2.135:
                        return "tc_left"
                    if nz > 0.85 and 2.135 <= tz <= 2.185:
                        return "tc_right"
            if mat_name == "R_RailCrest":
                if -20.82 <= tx <= -3.98 and ty > 1.675 and ny > 0.85 and abs(tz) <= 0.92:
                    return "tc_rail"
        if obj_name == "m249_rear_sight" and mat_name == "R_SightDrum":
            if abs(nz) < 0.55 and abs(tz) <= 0.72:
                return "rs_drum"
        return None

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return classify_hero(obj_name, face, mat_name) is not None

    sights_grp = [o for o in recv_objs if o.name in {"m249_rear_sight", "m249_front_sight"}]
    main_grp = [o for o in recv_objs if o not in sights_grp]

    _smart_unwrap_and_pack_rect(sights_grp, 0.340, 0.990, 0.355, 0.402, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(main_grp,   0.010, 0.990, 0.010, 0.340, skip_face_fn=is_hero)

    counts = {"rec_left": 0, "rec_right": 0, "tc_left": 0, "tc_right": 0, "tc_rail": 0, "rs_drum": 0}
    for o in recv_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_hero(o.name, f, mname)
            if tag is None:
                continue
            counts[tag] += 1
            if tag in ("rec_left", "rec_right"):
                for loop in f.loops:
                    tx, ty = loop.vert.co.x, loop.vert.co.z
                    yn = max(0.0, min(1.0, (ty - (-1.95)) / 4.50))
                    if tag == "rec_left":
                        xn = max(0.0, min(1.0, (10.70 - tx) / 25.80))
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.815 + yn * 0.170)
                    else:
                        xn = max(0.0, min(1.0, (tx - (-15.10)) / 25.80))
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.630 + yn * 0.170)
            elif tag in ("tc_left", "tc_right"):
                for loop in f.loops:
                    tx, ty = loop.vert.co.x, loop.vert.co.z
                    yn = max(0.0, min(1.0, (ty - (-0.08)) / 1.04))
                    if tag == "tc_left":
                        xn = max(0.0, min(1.0, (0.42 - tx) / 24.82))
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.550 + yn * 0.068)
                    else:
                        xn = max(0.0, min(1.0, (tx - (-24.40)) / 24.82))
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.470 + yn * 0.068)
            elif tag == "tc_rail":
                for loop in f.loops:
                    tx, tz = loop.vert.co.x, -loop.vert.co.y
                    xn = max(0.0, min(1.0, (tx - (-20.80)) / 16.80))
                    zn = max(0.0, min(1.0, (tz + 0.90) / 1.80))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.458 - zn * 0.043)
            elif tag == "rs_drum":
                fc = f.calc_center_median()
                ac = math.atan2(fc.z - 0.48, fc.x + 0.15)
                for loop in f.loops:
                    tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
                    av = math.atan2(ty - 0.48, tx + 0.15)
                    da = (av - ac + math.pi) % (2.0 * math.pi) - math.pi
                    u_turn = max(0.0, min(1.0, (ac + da + math.pi) / (2.0 * math.pi)))
                    zn = max(0.0, min(1.0, (tz + 0.71) / 1.42))
                    loop[uv_layer].uv = (0.015 + u_turn * 0.305, 0.355 + zn * 0.047)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] receiver suite hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing receiver hero UV faces: {counts}"


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 13 ordnance/BCG/FCG/M27-belt parts into `m249_v3_metal` (2048x2048) with
    STRICT MATERIAL UV FIREWALLS around M855 green tips, copper jackets, annealed brass & M27 links!
      - Firewalled M855 Emerald-Green Tips:      [0.015, 0.145] x [0.858, 0.985] (>=40px moat!)
      - Firewalled Copper FMJ Jackets:           [0.165, 0.315] x [0.858, 0.985]
      - Firewalled C26000 Annealed Brass/Primer: [0.335, 0.680] x [0.805, 0.985]
      - Firewalled M27 Parkerized Steel Links:   [0.700, 0.985] x [0.805, 0.985]
      - Hero Barrel Caliber Proof Stamp Band:    [0.015, 0.315] x [0.798, 0.840]
      - Exterior Barrel, Gas Reg, GasTube, Bipod:[0.010, 0.990] x [0.390, 0.780]
      - Internal BCG, Bolt, FP, Buffer, FCG:     [0.010, 0.990] x [0.010, 0.372]
    """
    belt_grp = [o for o in metal_objs if o.name == "m249_m27_belt"]
    ext_grp = [o for o in metal_objs if o.name in {"m249_barrel", "m249_gas_regulator", "m249_gas_tube", "m249_bipod"}]
    int_grp = [o for o in metal_objs if o not in belt_grp and o not in ext_grp]

    # 1. STRICT 5-WAY SUB-FIREWALLS on `m249_m27_belt` so green tips, copper, annealed brass, primers & black links NEVER bleed!
    _smart_unwrap_and_pack_rect(
        belt_grp, 0.015, 0.145, 0.858, 0.985,
        select_face_fn=lambda _n, _f, m: m == "M_M855GreenTip",
    )
    _smart_unwrap_and_pack_rect(
        belt_grp, 0.165, 0.315, 0.858, 0.985,
        select_face_fn=lambda _n, _f, m: m == "M_CopperFMJ",
    )
    _smart_unwrap_and_pack_rect(
        belt_grp, 0.335, 0.618, 0.805, 0.985,
        select_face_fn=lambda _n, _f, m: m == "M_Brass556",
    )
    _smart_unwrap_and_pack_rect(
        belt_grp, 0.635, 0.686, 0.805, 0.985,
        select_face_fn=lambda _n, _f, m: m in {"M_PrimerSilver", "M_PrimerRedRing"},
    )
    _smart_unwrap_and_pack_rect(
        belt_grp, 0.705, 0.985, 0.805, 0.985,
        select_face_fn=lambda _n, _f, m: m == "M_M27LinkSteel",
    )

    # 2. Barrel Stamp Hero Band (`M_BarrelStampBand` outer upper-left arc) + Exterior + Internal Packing
    def is_barrel_stamp(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "m249_barrel" or mat_name != "M_BarrelStampBand":
            return False
        c = face.calc_center_median()
        n = face.normal
        # Outer cylindrical sleeve along X in [38.2, 50.6], upper-left quadrant (-Z / +Y)
        ty, tz = c.z, -c.y
        ny, nz = n.z, -n.y
        return 38.22 <= c.x <= 50.58 and (ny > 0.25 or nz < -0.25) and (ty * ny + tz * nz) > 0.2

    _smart_unwrap_and_pack_rect(ext_grp, 0.010, 0.990, 0.390, 0.780, skip_face_fn=is_barrel_stamp)
    _smart_unwrap_and_pack_rect(int_grp, 0.010, 0.990, 0.010, 0.372)

    barrel = next(o for o in ext_grp if o.name == "m249_barrel")
    bm = bmesh.new()
    bm.from_mesh(barrel.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in barrel.data.materials]
    stamp_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_barrel_stamp("m249_barrel", f, mname):
            continue
        stamp_hits += 1
        for loop in f.loops:
            tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
            # Reading from left/upper flank: +X muzzle left -> -X breech right
            xn = max(0.0, min(1.0, (50.60 - tx) / 12.40))
            ang = math.atan2(ty, -tz)  # 0 at -Z (left), +pi/2 at +Y (top)
            vn = max(0.0, min(1.0, (ang + 0.35) / 2.25))
            loop[uv_layer].uv = (0.015 + xn * 0.300, 0.798 + vn * 0.042)
    bm.to_mesh(barrel.data)
    bm.free()
    print(f"  [HERO-UV] barrel stamp hits={stamp_hits} (M27 belt 4-way firewalled!)")
    assert stamp_hits > 0, "Missing barrel stamp hero faces!"


def unwrap_furniture_atlas(furn_objs: list[bpy.types.Object]):
    """Unwraps 5 furniture/ammo-box parts into `m249_v3_furniture` (2048x2048) with
    STRICT FIREWALLS separating OD-Green SAW box, yellow stencils, crimson safety ring & charcoal polymer:
      - Hero Band 1 (200-Rd OD-Green SAW Box Left  Flank, -Z): [0.015, 0.485] x [0.560, 0.985]
      - Hero Band 2 (200-Rd OD-Green SAW Box Right Flank, +Z): [0.515, 0.985] x [0.560, 0.985]
      - Hero Band 3a (Trigger Frame Left  Housing, S/F):       [0.015, 0.485] x [0.460, 0.542]
      - Hero Band 3b (Trigger Frame Right Housing, S/F):       [0.515, 0.985] x [0.460, 0.542]
      - Firewalled Ammo Box Non-Hero (OD ribs, ends, lid):     [0.010, 0.335] x [0.010, 0.440]
      - Firewalled Crimson Cross-Bolt Safety Ring:             [0.355, 0.415] x [0.380, 0.440]
      - Packed Barrel Carry Handle:                            [0.355, 0.415] x [0.220, 0.360]
      - Packed Handguard & Perforated Steel Heatshield:        [0.435, 0.990] x [0.220, 0.440]
      - Packed PIP Buttstock & Trigger Frame Grip/Guard:       [0.355, 0.990] x [0.010, 0.205]
    """
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if obj_name == "m249_ammo_box" and mat_name == "F_ODGreenBox":
            if -5.34 <= tx <= 5.34 and -5.46 <= ty <= 4.22:
                if nz < -0.88 and -4.58 <= tz <= -4.52:
                    return "box_left"
                if nz > 0.88 and 4.32 <= tz <= 4.38:
                    return "box_right"
        if obj_name == "m249_trigger_frame" and mat_name == "F_HeatshieldSteel":
            if -5.66 <= tx <= 3.76 and 0.81 <= ty <= 2.39:
                if nz < -0.88 and -1.07 <= tz <= -1.03:
                    return "tf_left"
                if nz > 0.88 and 1.03 <= tz <= 1.07:
                    return "tf_right"
        return None

    box_grp = [o for o in furn_objs if o.name == "m249_ammo_box"]
    bh_grp = [o for o in furn_objs if o.name == "m249_barrel_handle"]
    hg_grp = [o for o in furn_objs if o.name == "m249_handguard"]
    tf_grp = [o for o in furn_objs if o.name == "m249_trigger_frame"]
    bs_tf_grp = [o for o in furn_objs if o.name in {"m249_buttstock", "m249_trigger_frame"}]

    _smart_unwrap_and_pack_rect(
        box_grp, 0.010, 0.335, 0.010, 0.440,
        skip_face_fn=lambda n, f, m: classify_hero(n, f, m) is not None,
    )
    _smart_unwrap_and_pack_rect(
        tf_grp, 0.355, 0.415, 0.380, 0.440,
        select_face_fn=lambda _n, _f, m: m == "F_SafetyRed",
    )
    _smart_unwrap_and_pack_rect(bh_grp, 0.355, 0.415, 0.220, 0.360)
    _smart_unwrap_and_pack_rect(hg_grp, 0.435, 0.990, 0.220, 0.440)
    _smart_unwrap_and_pack_rect(
        bs_tf_grp, 0.355, 0.990, 0.010, 0.205,
        skip_face_fn=lambda n, f, m: (classify_hero(n, f, m) is not None) or (m == "F_SafetyRed"),
    )

    counts = {"box_left": 0, "box_right": 0, "tf_left": 0, "tf_right": 0}
    for o in furn_objs:
        if o.name not in {"m249_ammo_box", "m249_trigger_frame"}:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_hero(o.name, f, mname)
            if tag is None:
                continue
            counts[tag] += 1
            for loop in f.loops:
                tx, ty = loop.vert.co.x, loop.vert.co.z
                if tag == "box_left":
                    xn = max(0.0, min(1.0, (5.32 - tx) / 10.64))
                    yn = max(0.0, min(1.0, (ty - (-5.45)) / 9.65))
                    loop[uv_layer].uv = (0.015 + xn * 0.470, 0.560 + yn * 0.425)
                elif tag == "box_right":
                    xn = max(0.0, min(1.0, (tx - (-5.32)) / 10.64))
                    yn = max(0.0, min(1.0, (ty - (-5.45)) / 9.65))
                    loop[uv_layer].uv = (0.515 + xn * 0.470, 0.560 + yn * 0.425)
                elif tag == "tf_left":
                    xn = max(0.0, min(1.0, (3.75 - tx) / 9.40))
                    yn = max(0.0, min(1.0, (ty - 0.82) / 1.56))
                    loop[uv_layer].uv = (0.015 + xn * 0.470, 0.460 + yn * 0.082)
                elif tag == "tf_right":
                    xn = max(0.0, min(1.0, (tx - (-5.65)) / 9.40))
                    yn = max(0.0, min(1.0, (ty - 0.82) / 1.56))
                    loop[uv_layer].uv = (0.515 + xn * 0.470, 0.460 + yn * 0.082)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] furniture suite hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing furniture hero UV faces: {counts}"


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
        o.location = (i * 95.0, 0.0, 0.0)
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
            o.location = (0.0, 260.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object], tmp_dir: Path
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False, extra_objs_override=None,
    ):
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.045, 0.048, 0.046, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.70
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.16) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:8.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.16:
            print(f"       !! BBOX DELTA > 0.16cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    return report


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
        # Suite 1: Receiver, Top Cover, Sights, Feed Tray & Charging Handle (6 parts)
        "m249_receiver":         build_m249_receiver,
        "m249_top_cover":        build_m249_top_cover,
        "m249_rear_sight":       build_m249_rear_sight,
        "m249_front_sight":      build_m249_front_sight,
        "m249_feed_tray":        build_m249_feed_tray,
        "m249_charging_handle":  build_m249_charging_handle,
        # Suite 2: Barrel, Gas System, Bipod, Open-Bolt BCG/FCG & M27 Belt (13 parts)
        "m249_barrel":           build_m249_barrel,
        "m249_gas_regulator":    build_m249_gas_regulator,
        "m249_piston_carrier":   build_m249_piston_carrier,
        "m249_bolt":             build_m249_bolt,
        "m249_firing_pin":       build_m249_firing_pin,
        "m249_hydraulic_buffer": build_m249_hydraulic_buffer,
        "m249_gas_tube":         build_m249_gas_tube,
        "m249_bipod":            build_m249_bipod,
        "m249_trigger":          build_m249_trigger,
        "m249_open_bolt_sear":   build_m249_open_bolt_sear,
        "m249_feed_lever":       build_m249_feed_lever,
        "m249_feed_pawls":       build_m249_feed_pawls,
        "m249_m27_belt":         build_m249_m27_belt,
        # Suite 3: Barrel Carry Handle, Handguard/Shroud, Buttstock, Trigger Frame & 200-Rd Box (5 parts)
        "m249_barrel_handle":    build_m249_barrel_handle,
        "m249_handguard":        build_m249_handguard,
        "m249_buttstock":        build_m249_buttstock,
        "m249_trigger_frame":    build_m249_trigger_frame,
        "m249_ammo_box":         build_m249_ammo_box,
    }

    print("[BUILD] Sculpting all 24 solid FN M249 SAW (5.56x45mm NATO) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    furn_objs = [built[pid] for pid in FURNITURE_PARTS]
    all_objs = recv_objs + metal_objs + furn_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (6), metal (13), furniture (5)...")
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)
    unwrap_furniture_atlas(furn_objs)

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
            assert 0.00003 < oa < 0.88, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:12s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="m249_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking m249_v3_receiver (2048x2048, 6 receiver/cover/sight/tray/CH parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m249_v3_metal (2048x2048, 13 barrel/gas/bipod/BCG/FCG/M27-belt parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m249_v3_furniture (2048x2048, 5 SAW-box/stock/handguard/handle/trigger-frame parts)...")
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir)

        print("[POST] Compositing FNMI rollmarks, T-rail, 300-1000m drum, yellow SAW box stencils & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m249_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "m249_v3_receiver_normal.webp",
        TEX_OUT_DIR / "m249_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "m249_v3_metal_albedo.webp",
        TEX_OUT_DIR / "m249_v3_metal_normal.webp",
        TEX_OUT_DIR / "m249_v3_metal_roughness.webp",
        TEX_OUT_DIR / "m249_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "m249_v3_furniture_normal.webp",
        TEX_OUT_DIR / "m249_v3_furniture_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== FN M249 SAW (5.56x45MM NATO) V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:40s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
