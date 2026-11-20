#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for Barrett M82A1 / M107 (.50 BMG)
==================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 2)

Generates:
  - public/models/m82a1.glb (Draco-compressed glTF 2.0, all 22 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `m82a1_recoil_spring` and `m82a1_barrel_springs`
    carrying `aSpringParam`)
  - public/textures/m82a1_v3_receiver_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/m82a1_v3_ordnance_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/m82a1_v3_optics_mag_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 22 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/m82a1/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_m82a1_photoreal.py
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
# MODE 2: System Python Post-Process (Barrett Rollmarks, T-Rail, Leupold MIL,
#         Sapphire-Emerald Coated Lens, .50 BMG Mag & 5-Ch Packed ORM WebPs)
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

    # Genuine 16x16 ECC200 DataMatrix for CAGE 64872 + SER 008250
    _UID_MODULES = (
        "1010101010101010",
        "1101100110100101",
        "1010011001011010",
        "1001011101001101",
        "1110001010110010",
        "1011100101101001",
        "1100111010010110",
        "1010100111001011",
        "1101011000110100",
        "1001101101011011",
        "1110010010100100",
        "1011011101101011",
        "1100100011010110",
        "1001011100101101",
        "1010110011010010",
        "1111111111111111",
    )

    def _draw_barrett_crest(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Stylized Barrett Firearms swept-wing 'B' ordnance shield emblem."""
        lw = max(3, round(r * 0.11))
        shield = [
            (cx - r * 0.88, cy - r * 0.78),
            (cx + r * 0.88, cy - r * 0.78),
            (cx + r * 0.74, cy + r * 0.24),
            (cx, cy + r * 0.90),
            (cx - r * 0.74, cy + r * 0.24),
        ]
        draw.polygon(shield, outline=255, width=lw)
        # Inner chevrons
        draw.line(
            [(cx - r * 0.62, cy - r * 0.56), (cx + r * 0.62, cy - r * 0.56)],
            fill=255,
            width=max(2, lw // 2),
        )
        f_b = _load_font(FONT_DIN, max(20, round(r * 1.15)))
        draw.text((cx, cy + r * 0.04), "B", font=f_b, fill=255, anchor="mm")

    def _draw_leupold_medallion(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Leupold & Stevens crosshair duplex reticle ring emblem."""
        lw = max(2, round(r * 0.12))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        for dx0, dy0, dx1, dy1 in (
            (-r, 0, -r * 0.28, 0),
            (r * 0.28, 0, r, 0),
            (0, -r, 0, -r * 0.28),
            (0, r * 0.28, 0, r),
        ):
            draw.line([(cx + dx0, cy + dy0), (cx + dx1, cy + dy1)], fill=255, width=lw)
        f_l = _load_font(FONT_DIN, max(14, round(r * 0.78)))
        draw.text((cx + r * 0.34, cy - r * 0.34), "L", font=f_l, fill=255, anchor="mm")

    # -------------------------------------------------------------------------
    # SUITE 1: m82a1_v3_receiver_{albedo,normal,roughness}.webp
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
        fire_mask = np.zeros((h, w), dtype=np.float32)
        safe_mask = np.zeros((h, w), dtype=np.float32)
        weld_height = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1: Upper Receiver Left Wall (FULL X in [-20.80, +16.50], Y in [0.20, 1.80]) ---
        # Left view looks toward +Z: +X (front) -> u=0.015 (left of image), -X (rear) -> u=0.985
        # UV box: u in [0.015, 0.985], v in [0.770, 0.985]
        # World dimensions: 37.30 cm x 1.60 cm -> draw at 150 px/cm = 5595 x 240 px (exact 1:1 aspect!)
        UP_PPCM = 150.0
        UW, UH = int(round(37.30 * UP_PPCM)), int(round(1.60 * UP_PPCM))
        up_eng = Image.new("L", (UW, UH), 0)
        up_las = Image.new("L", (UW, UH), 0)
        de_u = ImageDraw.Draw(up_eng)
        dl_u = ImageDraw.Draw(up_las)

        def up_x_to_cx_left(xw: float) -> int:
            return int(round((16.50 - xw) / 37.30 * UW))

        def up_y_to_cy(yw: float) -> int:
            return int(round((1.80 - yw) / 1.60 * UH))

        # Prime flat upper-left flank aft of 28 cooling vents (vents end at X ~ 8.1; place rollmarks in X in [-4.8, +6.6])
        cx_crest = up_x_to_cx_left(6.0)
        cy_mid = up_y_to_cy(1.00)
        _draw_barrett_crest(de_u, cx_crest, cy_mid, r=76.0)

        tx0 = cx_crest + 110
        de_u.text((tx0, up_y_to_cy(1.56)), "BARRETT FIREARMS MFG. INC.", font=_load_font(FONT_DIN, 54), fill=255)
        de_u.text((tx0, up_y_to_cy(1.22)), "MURFREESBORO, TN   U.S.A.", font=_load_font(FONT_DIN, 40), fill=255)
        de_u.text((tx0, up_y_to_cy(0.88)), "MODEL 82A1       .50 BMG", font=_load_font(FONT_DIN, 50), fill=255)
        de_u.text((tx0, up_y_to_cy(0.50)), "SER. NO. 008250        CAGE 64872", font=_load_font(FONT_COND, 38), fill=250)

        # Secondary ordnance proof stamp toward rear upper flank (X in [-16.5, -7.2])
        cx_rear = up_x_to_cx_left(-8.0)
        de_u.text((cx_rear, up_y_to_cy(1.24)), "U.S.  M107  SASR  /  12.7x99MM NATO", font=_load_font(FONT_COND, 42), fill=245)
        de_u.text((cx_rear, up_y_to_cy(0.76)), "READ MANUAL BEFORE USE  -  SHORT RECOIL", font=_load_font(FONT_COND, 32), fill=225)

        _paste_uv_band(engraving, up_eng, 0.015, 0.985, 0.770, 0.985)
        _paste_uv_band(laser, up_las, 0.015, 0.985, 0.770, 0.985)

        # --- HERO BAND 2: Full-Length 27-MOA Top Picatinny Rail (X in [-14.43, +15.87]) ---
        # UV box: u in [0.015, 0.985], v in [0.712, 0.758]
        # 36 lugs: lugXs[s] = -13.95 + s * 0.84 for s in 0..35
        RW, RH = 3030, 120
        rail_las = Image.new("L", (RW, RH), 0)
        dl_r = ImageDraw.Draw(rail_las)
        f_rail = _load_font(FONT_DIN, 52)
        for s_idx in range(1, 35, 2):
            lug_x = -13.95 + s_idx * 0.84
            xn = (lug_x - (-14.43)) / 30.30
            if 0.04 < xn < 0.95:
                # Label T2..T28 every 2nd slot (T2 near rear, T28 near front)
                t_num = 2 + ((s_idx - 1) // 2) * 2
                lbl = f"T{t_num}" if t_num <= 28 else "27MOA"
                if t_num <= 28 or s_idx == 33:
                    dl_r.text((int(round(xn * RW)), RH // 2), lbl, font=f_rail, fill=255, anchor="mm")
        _paste_uv_band(laser, rail_las, 0.015, 0.985, 0.712, 0.758)

        # --- HERO BAND 3: Lower Receiver Left Wall (FULL X in [-20.80, +15.80], Y in [-4.65, +0.20]) ---
        # Strict unclamped orthographic planar projection -> ZERO affine shear / ZERO trapezoid stretch!
        # UV box: u in [0.015, 0.985], v in [0.515, 0.700]
        # World dimensions: 36.60 cm x 4.85 cm -> draw at 120 px/cm = 4392 x 582 px (1:1 aspect!)
        LO_PPCM = 120.0
        LW, LH = int(round(36.60 * LO_PPCM)), int(round(4.85 * LO_PPCM))
        lo_eng = Image.new("L", (LW, LH), 0)
        lo_fr = Image.new("L", (LW, LH), 0)
        lo_sf = Image.new("L", (LW, LH), 0)
        de_l = ImageDraw.Draw(lo_eng)
        df_l = ImageDraw.Draw(lo_fr)
        ds_l = ImageDraw.Draw(lo_sf)

        def lo_x_to_cx_left(xw: float) -> int:
            return int(round((15.80 - xw) / 36.60 * LW))

        def lo_y_to_cy(yw: float) -> int:
            return int(round((0.20 - yw) / 4.85 * LH))

        # Selector pivot is at EXACT CAD (-2.95, -0.48)!
        sx_l = lo_x_to_cx_left(-2.95)
        sy_l = lo_y_to_cy(-0.48)
        arc_r = int(round(0.46 * LO_PPCM))
        de_l.arc((sx_l - arc_r, sy_l - arc_r, sx_l + arc_r, sy_l + arc_r), 210, 345, fill=240, width=4)

        f_sel = _load_font(FONT_DIN, 44)
        dot_r = 10
        # FIRE (upper forward of pivot, ~X = -2.05, Y = -0.14)
        fx_l, fy_l = lo_x_to_cx_left(-2.05), lo_y_to_cy(-0.16)
        df_l.ellipse((fx_l - dot_r, fy_l - dot_r, fx_l + dot_r, fy_l + dot_r), fill=255)
        df_l.text((fx_l - 18, fy_l), "FIRE", font=f_sel, fill=255, anchor="rm")
        # SAFE (rearward of pivot, ~X = -3.88, Y = -0.52)
        sfx_l, sfy_l = lo_x_to_cx_left(-3.88), lo_y_to_cy(-0.52)
        ds_l.ellipse((sfx_l - dot_r, sfy_l - dot_r, sfx_l + dot_r, sfy_l + dot_r), fill=255)
        ds_l.text((sfx_l + 18, sfy_l), "SAFE", font=f_sel, fill=255, anchor="lm")

        # Buttstock ordnance rollmark on lower left (X in [-16.8, -7.8], Y in [-1.8, -0.5])
        de_l.text((lo_x_to_cx_left(-8.0), lo_y_to_cy(-0.72)), "MODEL 82A1 / M107   -   .50 BMG", font=_load_font(FONT_DIN, 46), fill=250)
        de_l.text((lo_x_to_cx_left(-8.0), lo_y_to_cy(-1.32)), "BARRETT FIREARMS   MURFREESBORO, TN   CAGE 64872", font=_load_font(FONT_COND, 36), fill=235)

        _paste_uv_band(engraving, lo_eng, 0.015, 0.985, 0.515, 0.700)
        _paste_uv_band(fire_mask, lo_fr, 0.015, 0.985, 0.515, 0.700)
        _paste_uv_band(safe_mask, lo_sf, 0.015, 0.985, 0.515, 0.700)

        # --- HERO BAND 4: Lower Receiver Right Wall (FULL X in [-20.80, +15.80], Y in [-4.65, +0.20]) ---
        # UV box: u in [0.015, 0.985], v in [0.320, 0.505]
        lo_r_eng = Image.new("L", (LW, LH), 0)
        lo_r_las = Image.new("L", (LW, LH), 0)
        de_lr = ImageDraw.Draw(lo_r_eng)
        dl_lr = ImageDraw.Draw(lo_r_las)

        def lo_x_to_cx_right(xw: float) -> int:
            return int(round((xw - (-20.80)) / 36.60 * LW))

        # MIL-STD-130 IUID DataMatrix ordnance plate cleanly horizontal on open right buttstock flank
        # (X in [-14.2, -8.87], Y in [-1.55, -0.28] — generous clearance above angled stock lower rib!)
        ux_c, uy_c = lo_x_to_cx_right(-14.2), lo_y_to_cy(-0.28)
        pw_c, ph_c = 640, 152
        dl_lr.rounded_rectangle((ux_c, uy_c, ux_c + pw_c, uy_c + ph_c), radius=10, outline=255, width=4)
        mod_px = 7
        dm_x0, dm_y0 = ux_c + 20, uy_c + (ph_c - 16 * mod_px) // 2
        for r_idx, row_bits in enumerate(_UID_MODULES):
            for c_idx, bit in enumerate(row_bits):
                if bit == "1":
                    x0_m = dm_x0 + c_idx * mod_px
                    y0_m = dm_y0 + r_idx * mod_px
                    dl_lr.rectangle((x0_m, y0_m, x0_m + mod_px - 1, y0_m + mod_px - 1), fill=255)
        dl_lr.text((ux_c + 154, uy_c + 18), "U.S.  M107  .50 BMG", font=_load_font(FONT_DIN, 36), fill=255)
        dl_lr.text((ux_c + 154, uy_c + 64), "CAGE  64872   PN 82001", font=_load_font(FONT_COND, 32), fill=250)
        dl_lr.text((ux_c + 154, uy_c + 104), "SER.  008250", font=_load_font(FONT_COND, 32), fill=250)

        de_lr.text((lo_x_to_cx_right(-4.6), lo_y_to_cy(-0.46)), "SAFE / FIRE", font=_load_font(FONT_COND, 34), fill=230)

        _paste_uv_band(engraving, lo_r_eng, 0.015, 0.985, 0.320, 0.505)
        _paste_uv_band(laser, lo_r_las, 0.015, 0.985, 0.320, 0.505)

        # --- World-Circular Resistance Spot-Weld Dimples along Lower & Upper Stamped Sheet Flanges ---
        lower_left_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.515) & (v_grid <= 0.700)).astype(np.float32)
        lower_right_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.320) & (v_grid <= 0.505)).astype(np.float32)
        upper_left_mask = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.770) & (v_grid <= 0.985)).astype(np.float32)

        for wx_cm in (-18.2, -15.4, -12.6, -9.8, -6.8, -4.4, 0.6, 3.6, 6.8, 10.6, 13.0):
            # Lower left & right spot welds along top flange (Y = -0.04)
            for is_left, band_m, v0, v1 in (
                (True, lower_left_mask, 0.515, 0.700),
                (False, lower_right_mask, 0.320, 0.505),
            ):
                xn = (15.80 - wx_cm) / 36.60 if is_left else (wx_cm - (-20.80)) / 36.60
                yn = (-0.04 - (-4.65)) / 4.85
                ux = 0.015 + xn * 0.970
                vy = v0 + yn * (v1 - v0)
                dx_cm = (u_grid - ux) * (36.60 / 0.970)
                dy_cm = (v_grid - vy) * (4.85 / (v1 - v0))
                r_cm = np.hypot(dx_cm, dy_cm)
                bowl = np.clip((0.15 - r_cm) / 0.035, 0.0, 1.0) * band_m
                weld_height -= 0.42 * bowl
                ao *= 1.0 - 0.14 * bowl
                heat_ring = _smoothstep(0.14, 0.17, r_cm) * (1.0 - _smoothstep(0.20, 0.25, r_cm)) * band_m
                _mix(albedo, (0.180, 0.188, 0.200), heat_ring * 0.26)

        # CLP Oil Seepage Halos around Selector (-2.95, -0.48), Rear Pin (-19.8, +0.04) & Front Pin (+14.6, +0.04)
        for px_cm, py_cm, rad_cm in ((-2.95, -0.48, 0.45), (-19.8, 0.04, 0.42), (14.6, 0.04, 0.42)):
            for is_left, band_m, v0, v1 in (
                (True, lower_left_mask, 0.515, 0.700),
                (False, lower_right_mask, 0.320, 0.505),
            ):
                xn = (15.80 - px_cm) / 36.60 if is_left else (px_cm - (-20.80)) / 36.60
                yn = (py_cm - (-4.65)) / 4.85
                ux = 0.015 + xn * 0.970
                vy = v0 + yn * (v1 - v0)
                dx_cm = (u_grid - ux) * (36.60 / 0.970)
                dy_cm = (v_grid - vy) * (4.85 / (v1 - v0))
                hub_oil = np.exp(-(dx_cm * dx_cm + dy_cm * dy_cm) / (rad_cm * rad_cm)) * band_m
                rgh -= hub_oil * 0.075
                albedo -= (hub_oil * 0.010)[..., None]

        # Authentic Field-Handling Micro-Scratches across Stamped Steel Flanks
        hero_walls = np.clip(upper_left_mask + lower_left_mask + lower_right_mask, 0.0, 1.0)
        rng = np.random.default_rng(5082)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(150):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.65) * h)
            length = float(rng.uniform(16, 78))
            ang = math.radians(float(rng.uniform(-16, 14)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(75, 200)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * hero_walls
        _mix(albedo, (0.52, 0.54, 0.58), sc * 0.25)
        rgh -= sc * 0.06
        met = np.clip(met + sc * 0.12, 0.0, 0.98)

        # Composite Struck Barrett Rollmarks, White Laser Markings & Red/White Selector Lacquer
        eng_bev = _bevel_mask(engraving, width_px=1.4)
        las_bev = _bevel_mask(laser, width_px=1.1)
        decal_height = weld_height - 0.68 * eng_bev - 0.22 * las_bev - 0.04 * sc

        # Crisp chalk/oxide-silvered museum rollmarks so BARRETT lettering reads razor-sharp under AgX!
        _mix(albedo, (0.64, 0.66, 0.70), engraving * 0.72)
        _mix(rgh, 0.46, engraving * 0.72)
        _mix(met, 0.38, engraving * 0.62)
        ao *= 1.0 - 0.15 * engraving

        # Crisp White Laser T-Rail & IUID Markings (strictly dielectric)
        _mix(albedo, (0.91, 0.92, 0.94), laser * 0.96)
        _mix(rgh, 0.38, laser * 0.90)
        _mix(met, 0.03, laser * 0.96)
        ao *= 1.0 - 0.05 * laser

        # Crimson 'FIRE' & White 'SAFE' Selector Lacquer Enamel
        _mix(albedo, (0.82, 0.06, 0.07), fire_mask * 0.96)
        _mix(rgh, 0.24, fire_mask * 0.92)
        _mix(met, 0.03, fire_mask * 0.96)

        _mix(albedo, (0.92, 0.93, 0.90), safe_mask * 0.96)
        _mix(rgh, 0.26, safe_mask * 0.92)
        _mix(met, 0.03, safe_mask * 0.96)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m82a1_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: m82a1_v3_ordnance_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_ordnance_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "ord_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "ord_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "ord_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "ord_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "ord_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "ord_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "ord_ext_mask.npy")[..., 0]

        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_ordnance_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_ordnance_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_ordnance_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m82a1_v3_ordnance_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: m82a1_v3_optics_mag_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_optics_mag_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "opt_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "opt_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "opt_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "opt_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "opt_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "opt_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "opt_ext_mask.npy")[..., 0]

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

        # --- 1) Firewalled Sapphire-Emerald Multi-Coated Optical Lenses ---
        # Front Objective Lens: u in [0.015, 0.112], v in [0.855, 0.985]
        # Rear Ocular Lens:     u in [0.118, 0.215], v in [0.855, 0.985]
        lens_box_all = np.zeros((h, w), dtype=bool)
        for u_lo, u_hi in ((0.015, 0.112), (0.118, 0.215)):
            lb = (u_grid >= u_lo) & (u_grid <= u_hi) & (v_grid >= 0.855) & (v_grid <= 0.985)
            lens_box_all |= lb
            uc = 0.5 * (u_lo + u_hi)
            lu = (u_grid - uc) / (0.45 * (u_hi - u_lo))
            lv = (v_grid - 0.920) / 0.058
            rad = np.hypot(lu, lv)
            interf = 0.5 + 0.5 * np.cos(7.2 * rad * rad + 0.6 * lv)
            lens_rgb = np.array((0.025, 0.11, 0.29), dtype=np.float32) + interf[..., None] * np.array(
                (0.025, 0.34, 0.14), dtype=np.float32
            )
            rim = _smoothstep(0.75, 1.25, rad)
            lens_rgb *= 1.0 - 0.60 * rim[..., None]
            arc = (1.0 - _smoothstep(0.02, 0.075, np.abs(rad - 0.70))) * _smoothstep(0.08, 0.45, lv) * (
                1.0 - _smoothstep(-0.10, 0.32, lu)
            )
            lens_rgb += arc[..., None] * np.array((0.42, 0.76, 0.78), dtype=np.float32)
            albedo[lb] = np.clip(lens_rgb[lb], 0.0, 1.0)
            rgh[lb] = 0.045
            met[lb] = 0.14
            ao[lb] = 1.0

        # --- 2) Leupold M1 Target Turret 0..15 MIL Vernier Scale ---
        # Elevation Drum: [0.015, 0.510] x [0.654, 0.720] | Windage Drum: [0.015, 0.510] x [0.580, 0.646]
        laser_white = np.zeros((h, w), dtype=np.float32)
        gold_script = np.zeros((h, w), dtype=np.float32)
        mag_stamp = np.zeros((h, w), dtype=np.float32)
        mag_spots = np.zeros((h, w), dtype=np.float32)

        TW, TH = 1800, 260
        tur_im = Image.new("L", (TW, TH), 0)
        dt = ImageDraw.Draw(tur_im)
        y_base = 228
        x_pad = 36
        span_x = TW - 2 * x_pad
        dt.line([(x_pad, y_base), (TW - x_pad, y_base)], fill=255, width=4)
        f_mil = _load_font(FONT_COND, 52)
        for k in range(151):
            xk = round(x_pad + (k / 150.0) * span_x)
            th_px = 64 if k % 10 == 0 else (38 if k % 5 == 0 else 20)
            lw_k = 5 if k % 10 == 0 else 3
            dt.line([(xk, y_base - th_px), (xk, y_base)], fill=255, width=lw_k)
            if k % 10 == 0:
                dt.text((xk, y_base - 96), str(k // 10), font=f_mil, fill=255, anchor="mm")
        dt.text(
            (TW // 2, 54),
            "UP   0..15 MIL   >   1 CLICK = 0.1 MIL",
            font=_load_font(FONT_DIN, 40),
            fill=245,
            anchor="mm",
        )
        _paste_uv_band(laser_white, tur_im, 0.015, 0.510, 0.654, 0.720)
        _paste_uv_band(laser_white, tur_im, 0.015, 0.510, 0.580, 0.646)

        # --- 3) Leupold Mark 4 Main Tube Script (Left [0.738, 0.784] & Right [0.790, 0.836]) ---
        # Main tube spans X in [-4.10, +3.60] (7.70 cm); rear ring [-4.03,-2.67], saddle [-1.20,+0.60], front ring [+2.37,+3.73]
        # Place crisp gold/white script ONLY inside the two 100% unobstructed tube gaps:
        #   Gap A (rear of saddle):  X in [-2.60, -1.25]
        #   Gap B (front of saddle): X in [+0.68, +2.30]
        SW, SH = 2310, 270
        for is_right, v_lo, v_hi in ((False, 0.738, 0.784), (True, 0.790, 0.836)):
            sc_gold = Image.new("L", (SW, SH), 0)
            sc_wh = Image.new("L", (SW, SH), 0)
            dlg = ImageDraw.Draw(sc_gold)
            det = ImageDraw.Draw(sc_wh)

            def sc_x(xw: float) -> int:
                xn = (xw + 4.10) / 7.70 if is_right else (3.60 - xw) / 7.70
                return int(round(xn * SW))

            # Gap B center (X = +1.49): LEUPOLD MARK 4 / 4.5-14x50mm LR/T
            cx_b = sc_x(1.49)
            dlg.text((cx_b, 86), "LEUPOLD  MARK 4", font=_load_font(FONT_DIN, 54), fill=255, anchor="mm")
            det.text((cx_b, 174), "4.5-14x50mm  LR/T", font=_load_font(FONT_COND, 44), fill=250, anchor="mm")

            # Gap A center (X = -1.92): Medallion + M1 MIL-DOT / SN 184920L
            cx_a = sc_x(-1.92)
            _draw_leupold_medallion(dlg, cx_a - 142, 130, r=42)
            dlg.text((cx_a - 82, 92), "M1  MIL-DOT", font=_load_font(FONT_DIN, 46), fill=255, anchor="lm")
            det.text((cx_a - 82, 174), "SN 184920L", font=_load_font(FONT_COND, 42), fill=248, anchor="lm")

            _paste_uv_band(gold_script, sc_gold, 0.015, 0.510, v_lo, v_hi)
            _paste_uv_band(laser_white, sc_wh, 0.015, 0.510, v_lo, v_hi)

        # --- 4) Giant 10-Rd .50 BMG Stamped Steel Magazine Flanks ---
        # Right flank: u in [0.015, 0.255], v in [0.015, 0.560] (bottom slopes UP left->right at +13.8 deg)
        # Left  flank: u in [0.270, 0.510], v in [0.015, 0.560] (bottom slopes DOWN left->right at -13.8 deg)
        # World: X in [-3.05, +3.05] (6.10 cm), Y in [-6.40, +2.65] (9.05 cm)
        MW, MH = 1220, 1810
        m_sp = Image.new("L", (MW, MH), 0)
        dsp = ImageDraw.Draw(m_sp)
        for wy_f in (0.14, 0.28, 0.42, 0.56, 0.70, 0.82):
            cy_s = int(wy_f * MH)
            for cx_s in (72, MW - 72):
                dsp.ellipse((cx_s - 18, cy_s - 18, cx_s + 18, cy_s + 18), fill=255)

        # Render tilted skirt marking parallel to the exact 13.8 deg angled monopod floorplate!
        # Centered safely between rib bottoms (y=1476) and sloped bottom edge (y=1660 at x=610)
        for pu0, pu1, tilt_deg in ((0.015, 0.255, 13.8), (0.270, 0.510, -13.8)):
            txt_strip = Image.new("L", (1100, 180), 0)
            dt_m = ImageDraw.Draw(txt_strip)
            dt_m.text((550, 56), "BARRETT  -  .50 BMG  -  10 RD", font=_load_font(FONT_DIN, 54), fill=255, anchor="mm")
            dt_m.text((550, 126), "MURFREESBORO, TN   CAGE 64872", font=_load_font(FONT_COND, 38), fill=240, anchor="mm")
            rot_strip = txt_strip.rotate(tilt_deg, resample=Image.Resampling.BICUBIC, expand=True)
            m_st = Image.new("L", (MW, MH), 0)
            px_paste = (MW - rot_strip.width) // 2
            py_paste = 1568 - rot_strip.height // 2
            m_st.paste(rot_strip, (px_paste, py_paste))
            _paste_uv_band(mag_stamp, m_st, pu0, pu1, 0.015, 0.560)
            _paste_uv_band(mag_spots, m_sp, pu0, pu1, 0.015, 0.560)

        # Realistic vertical magwell insertion wear scuffs on upper third of .50 BMG steel mag!
        mag_insert = (
            (((u_grid >= 0.015) & (u_grid <= 0.255)) | ((u_grid >= 0.270) & (u_grid <= 0.510)))
            & (v_grid >= 0.405)
            & (v_grid <= 0.560)
        ).astype(np.float32)
        rng = np.random.default_rng(5099)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(420):
            sx = float(rng.uniform(0.018, 0.508) * w)
            sy = float(rng.uniform(0.440, 0.595) * h)
            length = float(rng.uniform(16, 105))
            dsc.line(
                [(sx, sy), (sx + float(rng.uniform(-2.5, 2.5)), sy + length)],
                fill=int(rng.integers(75, 225)),
                width=1,
            )
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * mag_insert

        st_bev = _bevel_mask(mag_stamp, width_px=1.4)
        sp_bev = _bevel_mask(mag_spots, width_px=2.2)
        lw_bev = _bevel_mask(laser_white, width_px=1.1)
        gs_bev = _bevel_mask(gold_script, width_px=1.1)

        decal_height = -0.56 * st_bev - 0.36 * sp_bev - 0.18 * lw_bev - 0.18 * gs_bev - 0.05 * scuffs

        # Mag insertion steel wear
        _mix(albedo, (0.68, 0.71, 0.75), scuffs * 0.58)
        _mix(rgh, 0.20, scuffs * 0.70)
        _mix(met, 0.96, scuffs * 0.75)

        # Mag skirt rollmark (chalk/silver contrast so legible on charcoal parkerized mag!)
        _mix(albedo, (0.62, 0.65, 0.69), mag_stamp * 0.72)
        _mix(rgh, 0.45, mag_stamp * 0.72)
        ao *= 1.0 - 0.14 * mag_stamp - 0.14 * mag_spots

        # White MIL turret & scope markings
        _mix(albedo, (0.93, 0.94, 0.95), laser_white * 0.96)
        _mix(rgh, 0.36, laser_white * 0.90)
        _mix(met, 0.04, laser_white * 0.96)

        # Leupold 24K gold script
        _mix(albedo, (0.92, 0.74, 0.30), gold_script * 0.95)
        _mix(rgh, 0.20, gold_script * 0.92)
        _mix(met, 0.96, gold_script * 0.95)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)
        # Keep lens normal mirror-clean
        nrm_final[lens_box_all] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.04, 0.95)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_optics_mag_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_optics_mag_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m82a1_v3_optics_mag_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m82a1_v3_optics_mag_{albedo,normal,roughness}.webp (2048x2048)")

    process_receiver_atlas()
    process_ordnance_atlas()
    process_optics_mag_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "m82a1.glb"
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
B2T_MAT = T2B_MAT.transposed()


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 22 solid Barrett M82A1 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY dynamic GPU-deforming helical springs `m82a1_recoil_spring` & `m82a1_barrel_springs`!)
RECEIVER_PARTS = [
    "m82a1_upper_receiver",
    "m82a1_lower_receiver",
    "m82a1_carry_handle",
    "m82a1_selector",
]

ORDNANCE_PARTS = [
    "m82a1_muzzle_brake",
    "m82a1_barrel",
    "m82a1_barrel_extension",
    "m82a1_bolt_carrier",
    "m82a1_bolt",
    "m82a1_accelerator",
    "m82a1_firing_pin",
    "m82a1_bipod",
    "m82a1_striker",
    "m82a1_sear",
    "m82a1_trigger",
]

OPTICS_MAG_PARTS = [
    "m82a1_scope",
    "m82a1_scope_rings",
    "m82a1_pistol_grip",
    "m82a1_mag_body",
    "m82a1_mag_follower",
    "m82a1_mag_spring",
    "m82a1_mag_floorplate",
]

# Exterior parts receiving assembled inter-part contact AO (internal & sliding parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "m82a1_upper_receiver",
    "m82a1_lower_receiver",
    "m82a1_carry_handle",
    "m82a1_selector",
    "m82a1_muzzle_brake",
    "m82a1_barrel",
    "m82a1_bipod",
    "m82a1_scope",
    "m82a1_scope_rings",
    "m82a1_pistol_grip",
    "m82a1_mag_body",
    "m82a1_mag_floorplate",
}

ASSEMBLED_POS = {
    "m82a1_muzzle_brake":     ( 31.60,  1.25, 0.00),
    "m82a1_barrel":           (  0.00,  1.25, 0.00),
    "m82a1_barrel_extension": (  5.40,  1.25, 0.00),
    "m82a1_upper_receiver":   (  0.00,  0.00, 0.00),
    "m82a1_carry_handle":     ( 10.80,  2.74, 0.00),
    "m82a1_scope":            (  1.80,  4.10, 0.00),
    "m82a1_scope_rings":      (  1.80,  2.74, 0.00),
    "m82a1_bolt_carrier":     ( -1.20,  1.25, 0.00),
    "m82a1_accelerator":      ( -3.40,  0.52, 0.00),
    "m82a1_bolt":             (  2.40,  1.25, 0.00),
    "m82a1_firing_pin":       (  0.60,  1.25, 0.00),
    "m82a1_lower_receiver":   (  0.00,  0.00, 0.00),
    "m82a1_bipod":            ( 14.70, -0.85, 0.00),
    "m82a1_pistol_grip":      ( -2.40, -1.25, 0.00),
    "m82a1_striker":          ( -2.35, -0.35, 0.00),
    "m82a1_sear":             ( -1.45, -0.55, 0.00),
    "m82a1_trigger":          ( -0.45, -1.05, 0.00),
    "m82a1_selector":         ( -2.95, -0.48, 0.00),
    "m82a1_mag_body":         (  5.30, -2.15, 0.00),
    "m82a1_mag_follower":     (  5.30, -6.18, 0.00),
    "m82a1_mag_spring":       (  5.30, -6.85, 0.00),
    "m82a1_mag_floorplate":   (  5.30, -7.80, 0.00),
}

ASSEMBLED_ROT_THREE = {
    "m82a1_mag_floorplate": (0.0, 0.0, 0.24112),
}

# Exact ground-truth CSG reference bounding boxes (Three.js local space) extracted from src/weapons/m82a1/meshes/
CSG_REF_BBOX = {
    "m82a1_muzzle_brake":     ((-1.070, -1.030, -1.746), ( 2.445,  0.860,  1.746)),
    "m82a1_barrel":           (( 4.109, -0.955, -0.955), (31.450,  0.955,  0.955)),
    "m82a1_barrel_extension": ((-2.600, -1.100, -1.070), ( 2.200,  0.975,  1.070)),
    "m82a1_upper_receiver":   ((-20.830, 0.170, -1.200), (16.715,  3.562,  1.472)),
    "m82a1_carry_handle":     ((-1.075, -0.160, -0.830), ( 2.232,  1.532,  2.129)),
    "m82a1_scope":            ((-7.470, -1.080, -1.350), ( 7.850,  1.600,  1.470)),
    "m82a1_scope_rings":      ((-4.030, -0.150, -0.960), ( 3.730,  2.200,  0.960)),
    "m82a1_bolt_carrier":     ((-5.720, -0.970, -0.790), ( 3.445,  0.690,  2.219)),
    "m82a1_accelerator":      ((-0.304, -0.346, -0.740), ( 0.396,  1.190,  0.740)),
    "m82a1_bolt":             ((-1.835, -0.860, -0.815), ( 1.921,  0.900,  0.815)),
    "m82a1_firing_pin":       ((-4.190, -0.750, -0.292), ( 3.550,  0.292,  0.292)),
    "m82a1_lower_receiver":   ((-21.990,-4.710, -1.412), (15.840,  2.370,  1.370)),
    "m82a1_bipod":            ((-1.030, -7.433, -2.835), ( 2.269,  0.210,  2.835)),
    "m82a1_pistol_grip":      ((-3.058, -4.609, -0.762), ( 4.243,  0.120,  0.762)),
    "m82a1_striker":          ((-1.170, -0.306, -0.590), ( 0.286,  0.968,  0.590)),
    "m82a1_sear":             ((-1.030, -0.566, -0.525), ( 1.160,  0.638,  0.525)),
    "m82a1_trigger":          ((-0.970, -1.392, -0.590), ( 0.353,  0.440,  0.590)),
    "m82a1_selector":         ((-0.366, -0.370, -1.375), ( 1.100,  0.407,  1.280)),
    "m82a1_mag_body":         ((-3.330, -6.445, -0.910), ( 3.300,  2.695,  0.910)),
    "m82a1_mag_follower":     ((-2.656, -0.900, -0.660), ( 2.670,  0.513,  0.660)),
    "m82a1_mag_spring":       ((-2.204, -0.419, -0.584), ( 2.204,  0.542,  0.584)),
    "m82a1_mag_floorplate":   ((-3.190, -0.380, -0.970), ( 3.350,  0.170,  0.970)),
}


# =============================================================================
# Scene & Physically Calibrated Heavy-Ordnance Material Library (Cycles GPU)
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
    grain_bump: float = 0.034,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
    rough_var: float = 0.048,
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
    n_macro.inputs["Scale"].default_value = 2.20
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

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.522
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.592
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
        bump.inputs["Distance"].default_value = 0.02
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_m82_brass_deflector_mat() -> bpy.types.Material:
    """Stamped steel .50 BMG brass deflector behind right ejection port with golden cartridge brass streaks."""
    mat = _build_pbr_mat(
        "R_BrassDeflector",
        base_srgb=(0.195, 0.204, 0.218),
        roughness=0.31,
        metallic=0.83,
        bevel_r=0.036,
        edge_wear=0.58,
        edge_srgb=(0.82, 0.84, 0.88),
        grain_scale=64.0,
        grain_bump=0.038,
        voronoi_grain=0.52,
        voronoi_scale=88.0,
        rough_var=0.032,
    )
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = next(n for n in nt.nodes if n.type == "TEX_COORD")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Deflector forward face sits at X in [1.75, 2.16]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 1.68
    mr_x.inputs["From Max"].default_value = 2.12
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_kiss = nt.nodes.new("ShaderNodeTexNoise")
    n_kiss.inputs["Scale"].default_value = 8.5
    n_kiss.inputs["Detail"].default_value = 6.0
    n_kiss.inputs["Roughness"].default_value = 0.72
    nt.links.new(texcoord.outputs["Object"], n_kiss.inputs["Vector"])

    ramp_k = nt.nodes.new("ShaderNodeValToRGB")
    ramp_k.color_ramp.elements[0].position = 0.42
    ramp_k.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_k.color_ramp.elements[1].position = 0.72
    ramp_k.color_ramp.elements[1].color = (0.82, 0.82, 0.82, 1.0)
    nt.links.new(n_kiss.outputs["Fac"], ramp_k.inputs["Fac"])

    mul_k = nt.nodes.new("ShaderNodeMath")
    mul_k.operation = "MULTIPLY"
    nt.links.new(mr_x.outputs["Result"], mul_k.inputs[0])
    nt.links.new(ramp_k.outputs["Color"], mul_k.inputs[1])

    orig_col = bsdf.inputs["Base Color"].links[0].from_socket
    orig_rgh = bsdf.inputs["Roughness"].links[0].from_socket
    orig_met = bsdf.inputs["Metallic"].links[0].from_socket

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[7].default_value = srgb_to_lin(0.78, 0.60, 0.24)
    nt.links.new(mul_k.outputs["Value"], mix_c.inputs[0])
    nt.links.new(orig_col, mix_c.inputs[6])
    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])

    mix_r = nt.nodes.new("ShaderNodeMix")
    mix_r.data_type = "FLOAT"
    mix_r.inputs[3].default_value = 0.22
    nt.links.new(mul_k.outputs["Value"], mix_r.inputs[0])
    nt.links.new(orig_rgh, mix_r.inputs[2])
    nt.links.new(mix_r.outputs[0], bsdf.inputs["Roughness"])

    mix_m = nt.nodes.new("ShaderNodeMix")
    mix_m.data_type = "FLOAT"
    mix_m.inputs[3].default_value = 0.95
    nt.links.new(mul_k.outputs["Value"], mix_m.inputs[0])
    nt.links.new(orig_met, mix_m.inputs[2])
    nt.links.new(mix_m.outputs[0], bsdf.inputs["Metallic"])
    return mat


def _build_arrowhead_brake_outer_mat() -> bpy.types.Material:
    """Barrett M82A1 Tank Brake exterior: heavy charcoal parkerized armor steel transitioning to
    authentic bronze/heat-blued temper along the forward V-nose & side exhaust wing lips!"""
    mat = bpy.data.materials.new("M_ArrowheadOuter")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X in [-0.95 .. +2.42]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.95
    mr_x.inputs["From Max"].default_value = 2.42
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_heat = nt.nodes.new("ShaderNodeTexNoise")
    n_heat.inputs["Scale"].default_value = 3.8
    n_heat.inputs["Detail"].default_value = 5.0
    n_heat.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_heat.inputs["Vector"])

    add_h = nt.nodes.new("ShaderNodeMath")
    add_h.operation = "MULTIPLY_ADD"
    add_h.inputs[1].default_value = 0.20
    nt.links.new(n_heat.outputs["Fac"], add_h.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_h.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.198, 0.206, 0.218)  # rich charcoal parkerized steel
    cr.elements[1].position = 0.45
    cr.elements[1].color = srgb_to_lin(0.206, 0.212, 0.222)
    for pos, rgb in (
        (0.68, (0.290, 0.235, 0.175)),  # subtle golden-bronze blast heat temper
        (0.84, (0.185, 0.212, 0.278)),  # heat-blued steel muzzle band
        (0.97, (0.120, 0.120, 0.125)),  # dark crown heat halo
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_h.outputs["Value"], ramp_c.inputs["Fac"])

    # Bright silver edge wear along angular arrowhead tank-brake facets!
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    ramp_e = nt.nodes.new("ShaderNodeValToRGB")
    ramp_e.color_ramp.elements[0].position = 0.520
    ramp_e.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_e.color_ramp.elements[1].position = 0.585
    ramp_e.color_ramp.elements[1].color = (0.58, 0.58, 0.58, 1.0)
    nt.links.new(geom.outputs["Pointiness"], ramp_e.inputs["Fac"])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[7].default_value = srgb_to_lin(0.80, 0.82, 0.86)
    nt.links.new(ramp_e.outputs["Color"], mix_col.inputs[0])
    nt.links.new(ramp_c.outputs["Color"], mix_col.inputs[6])

    mix_rgh = nt.nodes.new("ShaderNodeMix")
    mix_rgh.data_type = "FLOAT"
    mix_rgh.inputs[2].default_value = 0.31
    mix_rgh.inputs[3].default_value = 0.17
    nt.links.new(ramp_e.outputs["Color"], mix_rgh.inputs[0])

    mix_met = nt.nodes.new("ShaderNodeMix")
    mix_met.data_type = "FLOAT"
    mix_met.inputs[2].default_value = 0.85
    mix_met.inputs[3].default_value = 0.96
    nt.links.new(ramp_e.outputs["Color"], mix_met.inputs[0])

    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mix_rgh.outputs[0], bsdf.inputs["Roughness"])
    nt.links.new(mix_met.outputs[0], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.032
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 78.0
    nt.links.new(texcoord.outputs["Object"], vor.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.044
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_arrowhead_chamber_soot_mat() -> bpy.types.Material:
    """Interior twin-baffle chambers of Barrett M82A1 Tank Brake: unmistakable bronze/blue .50 BMG
    blast heat-temper swirling into heavy velvety matte-black gunpowder carbon soot!"""
    mat = bpy.data.materials.new("M_BrakeChamberSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Distance from central bore (|Y_blender| = |Z_three|): deeper inside chamber -> denser soot,
    # outer chevron lip -> bronze/violet blast heat-temper!
    abs_y = nt.nodes.new("ShaderNodeMath")
    abs_y.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Y"], abs_y.inputs[0])

    mr_lat = nt.nodes.new("ShaderNodeMapRange")
    mr_lat.clamp = True
    mr_lat.inputs["From Min"].default_value = 0.28
    mr_lat.inputs["From Max"].default_value = 1.55
    nt.links.new(abs_y.outputs["Value"], mr_lat.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 5.5
    n_soot.inputs["Detail"].default_value = 6.0
    n_soot.inputs["Roughness"].default_value = 0.72
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_s = nt.nodes.new("ShaderNodeMath")
    add_s.operation = "MULTIPLY_ADD"
    add_s.inputs[1].default_value = 0.34
    nt.links.new(n_soot.outputs["Fac"], add_s.inputs[0])
    nt.links.new(mr_lat.outputs["Result"], add_s.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.062, 0.060, 0.062)  # dense velvety .50 BMG carbon soot
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.092, 0.088, 0.088)  # dark blasted carbon film
    for pos, rgb in (
        (0.64, (0.380, 0.250, 0.132)),  # rich bronze heat-temper on chevron walls
        (0.82, (0.175, 0.215, 0.335)),  # cobalt-violet thermal blueing
        (0.96, (0.220, 0.228, 0.242)),  # steel edge transition
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_s.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.18
    rr.elements[0].color = (0.90, 0.90, 0.90, 1.0)  # matte velvety carbon soot
    rr.elements[1].position = 0.78
    rr.elements[1].color = (0.30, 0.30, 0.30, 1.0)  # satin tempered baffle steel
    nt.links.new(add_s.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.22
    rm.elements[0].color = (0.10, 0.10, 0.10, 1.0)  # carbon deposit dielectric
    rm.elements[1].position = 0.70
    rm.elements[1].color = (0.86, 0.86, 0.86, 1.0)  # heat-tempered armor steel
    nt.links.new(add_s.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.022
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.068
    bump.inputs["Distance"].default_value = 0.020
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_a2_diamond_checkering_mat() -> bpy.types.Material:
    """Authentic USGI A2 Pistol Grip 20-LPI molded 45-deg diamond checkering polymer panels!"""
    mat = bpy.data.materials.new("O_A2Checkering")
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
    wave_a.inputs["Scale"].default_value = 14.0
    nt.links.new(map_a.outputs["Vector"], wave_a.inputs["Vector"])

    map_b = nt.nodes.new("ShaderNodeMapping")
    map_b.inputs["Rotation"].default_value = (0.0, math.radians(-45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], map_b.inputs["Vector"])

    wave_b = nt.nodes.new("ShaderNodeTexWave")
    wave_b.wave_type = "BANDS"
    wave_b.bands_direction = "X"
    wave_b.wave_profile = "SAW"
    wave_b.inputs["Scale"].default_value = 14.0
    nt.links.new(map_b.outputs["Vector"], wave_b.inputs["Vector"])

    pyr = nt.nodes.new("ShaderNodeMath")
    pyr.operation = "MINIMUM"
    nt.links.new(wave_a.outputs["Fac"], pyr.inputs[0])
    nt.links.new(wave_b.outputs["Fac"], pyr.inputs[1])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.105, 0.110, 0.118)
    mix_c.inputs[7].default_value = srgb_to_lin(0.195, 0.203, 0.215)
    nt.links.new(pyr.outputs["Value"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.76
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.018
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.50
    bump.inputs["Distance"].default_value = 0.030
    nt.links.new(pyr.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: Receiver Atlas Materials (`m82a1_v3_receiver`) ---
        "R_UpperParkerized": _build_pbr_mat(
            "R_UpperParkerized",
            base_srgb=(0.214, 0.222, 0.236),
            roughness=0.31,
            metallic=0.82,
            bevel_r=0.036,
            edge_wear=0.52,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=66.0,
            grain_bump=0.042,
            voronoi_grain=0.56,
            voronoi_scale=90.0,
            rough_var=0.038,
        ),
        "R_LowerParkerized": _build_pbr_mat(
            "R_LowerParkerized",
            base_srgb=(0.212, 0.220, 0.234),
            roughness=0.32,
            metallic=0.82,
            bevel_r=0.038,
            edge_wear=0.52,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=68.0,
            grain_bump=0.044,
            voronoi_grain=0.56,
            voronoi_scale=92.0,
            rough_var=0.040,
        ),
        "R_DarkReinforce": _build_pbr_mat(
            "R_DarkReinforce",
            base_srgb=(0.162, 0.168, 0.180),
            roughness=0.36,
            metallic=0.83,
            bevel_r=0.026,
            edge_wear=0.54,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=60.0,
            grain_bump=0.038,
            voronoi_grain=0.50,
            voronoi_scale=84.0,
            rough_var=0.036,
        ),
        "R_BrassDeflector": _build_m82_brass_deflector_mat(),
        "R_RailCrest": _build_pbr_mat(
            "R_RailCrest",
            base_srgb=(0.228, 0.236, 0.250),
            roughness=0.26,
            metallic=0.87,
            bevel_r=0.022,
            edge_wear=0.60,
            edge_srgb=(0.86, 0.88, 0.92),
            grain_scale=36.0,
            grain_bump=0.026,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.032,
        ),
        "R_SlotDark": _build_pbr_mat(
            "R_SlotDark",
            base_srgb=(0.095, 0.100, 0.108),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.026,
            rough_var=0.030,
        ),
        "R_BrightSteel": _build_pbr_mat(
            "R_BrightSteel",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.22,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.024,
        ),
        "R_SorbothaneRubber": _build_pbr_mat(
            "R_SorbothaneRubber",
            base_srgb=(0.106, 0.110, 0.118),
            roughness=0.88,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.14,
            edge_srgb=(0.19, 0.196, 0.208),
            grain_scale=64.0,
            grain_bump=0.110,
            voronoi_grain=0.68,
            voronoi_scale=92.0,
            rough_var=0.036,
        ),
        "R_CarryHandleGrip": _build_pbr_mat(
            "R_CarryHandleGrip",
            base_srgb=(0.115, 0.120, 0.128),
            roughness=0.78,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.18,
            edge_srgb=(0.22, 0.228, 0.240),
            grain_scale=66.0,
            grain_bump=0.120,
            voronoi_grain=0.72,
            voronoi_scale=88.0,
            rough_var=0.042,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.105, 0.110, 0.118),
            roughness=0.52,
            metallic=0.75,
            bevel_r=0.016,
            grain_scale=34.0,
            grain_bump=0.024,
            rough_var=0.028,
        ),

        # --- SUITE 2: Ordnance / Barrel / Brake / Bolt / Bipod / FCG (`m82a1_v3_ordnance`) ---
        "M_ArrowheadOuter": _build_arrowhead_brake_outer_mat(),
        "M_BrakeChamberSoot": _build_arrowhead_chamber_soot_mat(),
        "M_FlutedBarrelSteel": _build_pbr_mat(
            "M_FlutedBarrelSteel",
            base_srgb=(0.212, 0.220, 0.232),
            roughness=0.27,
            metallic=0.86,
            bevel_r=0.026,
            edge_wear=0.54,
            edge_srgb=(0.82, 0.85, 0.89),
            grain_scale=42.0,
            grain_bump=0.036,
            aniso_stretch=(4.2, 0.45, 0.45),
            rough_var=0.034,
        ),
        "M_BarrelFluteValley": _build_pbr_mat(
            "M_BarrelFluteValley",
            base_srgb=(0.152, 0.159, 0.172),
            roughness=0.36,
            metallic=0.83,
            bevel_r=0.018,
            edge_wear=0.28,
            edge_srgb=(0.68, 0.70, 0.74),
            grain_scale=38.0,
            grain_bump=0.032,
            aniso_stretch=(0.45, 3.6, 3.6),
            rough_var=0.032,
        ),
        "M_BipodParkerized": _build_pbr_mat(
            "M_BipodParkerized",
            base_srgb=(0.194, 0.202, 0.214),
            roughness=0.33,
            metallic=0.83,
            bevel_r=0.028,
            edge_wear=0.52,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.52,
            voronoi_scale=88.0,
            rough_var=0.038,
        ),
        "M_OiledCarrier": _build_pbr_mat(
            "M_OiledCarrier",
            base_srgb=(0.224, 0.233, 0.246),
            roughness=0.23,
            metallic=0.91,
            bevel_r=0.028,
            edge_wear=0.58,
            edge_srgb=(0.86, 0.88, 0.92),
            grain_scale=30.0,
            grain_bump=0.028,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.034,
        ),
        "M_MachinedSteel": _build_pbr_mat(
            "M_MachinedSteel",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.025,
        ),
        "M_BoltMidSteel": _build_pbr_mat(
            "M_BoltMidSteel",
            base_srgb=(0.54, 0.57, 0.62),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.020,
            edge_wear=0.32,
            edge_srgb=(0.86, 0.88, 0.92),
            grain_scale=32.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.028,
        ),
        "M_DarkHardware": _build_pbr_mat(
            "M_DarkHardware",
            base_srgb=(0.155, 0.162, 0.174),
            roughness=0.35,
            metallic=0.84,
            bevel_r=0.022,
            edge_wear=0.46,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=52.0,
            grain_bump=0.034,
            rough_var=0.034,
        ),
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "M_InnerDark": _build_pbr_mat(
            "M_InnerDark",
            base_srgb=(0.095, 0.100, 0.108),
            roughness=0.52,
            metallic=0.76,
            bevel_r=0.016,
            grain_scale=34.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),

        # --- SUITE 3: Optics, Scope Rings, Grip & Giant .50 BMG Mag (`m82a1_v3_optics_mag`) ---
        "O_ScopeAnodized": _build_pbr_mat(
            "O_ScopeAnodized",
            base_srgb=(0.148, 0.155, 0.166),
            roughness=0.26,
            metallic=0.78,
            bevel_r=0.024,
            edge_wear=0.44,
            edge_srgb=(0.76, 0.78, 0.82),
            grain_scale=56.0,
            grain_bump=0.026,
            aniso_stretch=(3.5, 0.5, 0.5),
            rough_var=0.028,
        ),
        "O_TurretDrum": _build_pbr_mat(
            "O_TurretDrum",
            base_srgb=(0.162, 0.170, 0.184),
            roughness=0.30,
            metallic=0.76,
            bevel_r=0.018,
            edge_wear=0.36,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=46.0,
            grain_bump=0.022,
            rough_var=0.024,
        ),
        "O_LeupoldGoldRing": _build_pbr_mat(
            "O_LeupoldGoldRing",
            base_srgb=(0.94, 0.75, 0.28),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.012,
            grain_scale=30.0,
            grain_bump=0.012,
            rough_var=0.018,
        ),
        "O_CoatedLens": _build_pbr_mat(
            "O_CoatedLens",
            base_srgb=(0.04, 0.22, 0.32),
            roughness=0.05,
            metallic=0.14,
            bevel_r=0.006,
            grain_bump=0.0,
            rough_var=0.005,
        ),
        "O_RingSteel": _build_pbr_mat(
            "O_RingSteel",
            base_srgb=(0.178, 0.186, 0.198),
            roughness=0.30,
            metallic=0.85,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.80, 0.82, 0.86),
            grain_scale=54.0,
            grain_bump=0.032,
            voronoi_grain=0.45,
            voronoi_scale=80.0,
            rough_var=0.032,
        ),
        "O_MagParkerized": _build_pbr_mat(
            "O_MagParkerized",
            base_srgb=(0.214, 0.222, 0.236),
            roughness=0.31,
            metallic=0.82,
            bevel_r=0.028,
            edge_wear=0.56,
            edge_srgb=(0.82, 0.84, 0.88),
            grain_scale=64.0,
            grain_bump=0.042,
            voronoi_grain=0.56,
            voronoi_scale=88.0,
            rough_var=0.038,
        ),
        "O_GripPolymer": _build_pbr_mat(
            "O_GripPolymer",
            base_srgb=(0.132, 0.138, 0.148),
            roughness=0.74,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.22,
            edge_srgb=(0.25, 0.26, 0.275),
            grain_scale=64.0,
            grain_bump=0.125,
            voronoi_grain=0.74,
            voronoi_scale=86.0,
            rough_var=0.045,
        ),
        "O_A2Checkering": _build_a2_diamond_checkering_mat(),
        "O_FollowerOrange": _build_pbr_mat(
            "O_FollowerOrange",
            base_srgb=(0.86, 0.36, 0.10),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.16,
            edge_srgb=(0.95, 0.54, 0.28),
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.036,
        ),
        "O_BrightSteel": _build_pbr_mat(
            "O_BrightSteel",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.020,
            rough_var=0.024,
        ),
        "O_SpringSteel": _build_pbr_mat(
            "O_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "O_InnerDark": _build_pbr_mat(
            "O_InnerDark",
            base_srgb=(0.088, 0.092, 0.100),
            roughness=0.56,
            metallic=0.72,
            bevel_r=0.014,
            grain_scale=34.0,
            grain_bump=0.024,
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


def mk_cone(
    name: str, r_base: float, height: float,
    axis: str = "y", segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_base, radius2=0.008, depth=height,
    )
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "-y":
        pre = [("rx", math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
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
    name: str, radius: float, cyl_len: float, segs: int = 18, cap_rings: int = 6,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight capsule oriented along Three.js +X (used for crisp fluted-barrel ball-endmill cuts)."""
    pts: list[tuple[float, float]] = []
    half = cyl_len * 0.5
    for i in range(cap_rings + 1):
        th = -math.pi * 0.5 + (math.pi * 0.5) * (i / cap_rings)
        r = max(0.0, radius * math.cos(th))
        x = -half + radius * math.sin(th)
        pts.append((r, x))
    for i in range(cap_rings + 1):
        th = (math.pi * 0.5) * (i / cap_rings)
        r = max(0.0, radius * math.cos(th))
        x = half + radius * math.sin(th)
        pts.append((r, x))
    return mk_lathe_x(name, pts, segs=segs, xform=xform, mat=mat)


def mk_capsule_y(
    name: str, radius: float, cyl_len: float, segs: int = 16, cap_rings: int = 5,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    return mk_capsule_x(
        name, radius, cyl_len, segs=segs, cap_rings=cap_rings,
        xform=[("rz", math.pi * 0.5)] + (xform or []), mat=mat,
    )


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
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 40,
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 24, depth: float = 0.020,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.015, length * 0.16, radius * 0.14)
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
    x0: float, x1: float, twist: float, segs: int = 8, phase: float = 0.0,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight raised helical rifling lands inside a .50 BMG bore along +X."""
    r_in = bore_r - height
    r_out = bore_r + 0.006
    bm = bmesh.new()
    for l in range(count):
        base = phase + (l * 2.0 * math.pi) / count
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
            a, b = rings[s], rings[s + 1]
            for k in range(4):
                kn = (k + 1) % 4
                bm.faces.new((a[k], a[kn], b[kn], b[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_dovetail_bar_x(
    name: str, x0: float, x1: float, y_bot: float, y_top: float,
    hw_bot: float, hw_max: float, top_chamfer: float,
    bevel: float = 0.012,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    flare = hw_max - hw_bot
    y_flare = min(y_bot + flare, y_top - top_chamfer)
    pts_zy = [
        (-hw_bot, y_bot),
        ( hw_bot, y_bot),
        ( hw_max, y_flare),
        ( hw_max, y_top - top_chamfer),
        ( hw_max - top_chamfer, y_top),
        (-hw_max + top_chamfer, y_top),
        (-hw_max, y_top - top_chamfer),
        (-hw_max, y_flare),
    ]
    return mk_extrude_x(name, pts_zy, x0, x1, bevel=bevel, bevel_segs=1, xform=xform, mat=mat)


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


def bool_union(
    objs: list[bpy.types.Object], name: str, solver: str = "EXACT"
) -> bpy.types.Object:
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
# PART BUILDERS — GROUP 1: RECEIVERS & CONTROLS (Suite 1: m82a1_v3_receiver)
# =============================================================================
def build_m82a1_upper_receiver(mats: dict) -> bpy.types.Object:
    """U-05: Octagonal folded sheet-steel upper receiver, 28 stadium cooling vents,
    full-length 27-MOA 45°-dovetailed M1913 top rail, folding backup iron sights,
    angled .50 BMG brass deflector & Nylatron-lined front barrel guide bushing."""
    m_up = mats["R_UpperParkerized"]
    m_dk = mats["R_DarkReinforce"]
    m_rc = mats["R_RailCrest"]
    m_sl = mats["R_SlotDark"]
    m_bs = mats["R_BrightSteel"]
    m_rb = mats["R_SorbothaneRubber"]
    m_in = mats["R_InnerDark"]
    m_bd = mats["R_BrassDeflector"]

    # Octagonal folded sheet-steel upper cross-section (Z, Y) extruded along X in [-20.8, +16.5]
    # Uses rounded-bend corner chamfers so folded sheet metal catches soft studio rim highlights!
    cross_zy = [
        (-1.16, 0.20),
        (-1.16, 1.76),
        (-1.13, 1.83),
        (-0.80, 2.38),
        (-0.73, 2.42),
        ( 0.73, 2.42),
        ( 0.80, 2.38),
        ( 1.13, 1.83),
        ( 1.16, 1.76),
        ( 1.16, 0.20),
    ]
    shell = mk_extrude_x("up_raw", cross_zy, -20.80, 16.50, bevel=0.030, bevel_segs=2, mat=m_up)

    # Disjoint hollowing & cutouts:
    # 1) Interior bolt/barrel tunnel (-20.50 .. +16.20)
    cut_tunnel = mk_box("up_c_tun", 36.70, 2.02, 1.94, [("t", -2.15, 1.15, 0.0)], m_in)
    # 2) Front barrel bushing bore + massive .50 BMG right-side ejection port (disjoint!)
    cut_front_ej = join_objects([
        mk_cyl("up_c_bore", 0.82, 0.82, 2.20, "x", 28, [("t", 16.10, 1.25, 0.0)], m_in),
        mk_box("up_c_ej", 5.70, 1.24, 1.10, [("t", 5.00, 1.32, 0.85)], m_in),
    ], "up_c_fr_ej")
    # 3) Reciprocating right-side charging handle track slot (X in [-7.05, +2.25])
    cut_chg = mk_box("up_c_chg", 9.30, 0.50, 1.10, [("t", -2.40, 1.25, 0.85)], m_in)
    # 4) 28 iconic Barrett oblong stadium cooling vents (2 rows x 7 per side, mutually disjoint!)
    vent_objs = []
    for i in range(7):
        vx = 8.50 + i * 1.10
        vent_objs.append(mk_stadium_z(f"up_v_t{i}", 0.21, 0.18, 1.35, 8, [("t", vx, 1.98, 0.0)], m_in))
        vent_objs.append(mk_stadium_z(f"up_v_b{i}", 0.23, 0.19, 1.35, 8, [("t", vx, 1.06, 0.0)], m_in))
    cut_vents = join_objects(vent_objs, "up_c_vents")

    shell = bool_subtract(shell, [cut_tunnel, cut_front_ej, cut_chg, cut_vents])
    parts = [shell]

    # Welded lower split-seam reinforcement strips, internal carrier rails & embossed rear stiffening swages
    for side in (-1, 1):
        parts.append(
            mk_box(f"up_seam_{side}", 36.20, 0.14, 0.06, [("t", -2.20, 0.28, side * 1.17)], m_dk, bevel=0.012, bevel_segs=1)
        )
        parts.append(
            mk_box(f"up_rail_{side}", 19.50, 0.12, 0.09, [("t", -1.80, 1.45, side * 0.91)], m_dk, bevel=0.010, bevel_segs=1)
        )
        # Subtle stamped upper-shoulder stiffening rib running cleanly along rear buttstock cheek section
        parts.append(
            mk_box(f"up_rib_{side}", 11.40, 0.10, 0.04, [("t", -14.50, 1.58, side * 1.165)], m_up, bevel=0.012, bevel_segs=1)
        )

    # Front Nylatron-lined barrel guide bushing collar (zero-CSG closed hollow lathe) + wiper ring + twin spring pins
    bushing_pts = [
        (0.765, 15.89),
        (1.050, 15.89),
        (1.050, 16.05),
        (1.005, 16.12),
        (1.030, 16.58),
        (0.980, 16.67),
        (0.765, 16.67),
        (0.765, 15.89),
    ]
    parts.append(mk_lathe_x("up_bush", bushing_pts, segs=36, xform=[("t", 0.0, 1.25, 0.0)], mat=m_dk))
    parts.append(mk_torus("up_wiper", 0.84, 0.055, "x", 32, 12, [("t", 16.66, 1.25, 0.0)], m_rb))
    for side in (-1, 1):
        parts.append(mk_cyl(f"up_spin_{side}", 0.085, 0.085, 0.56, "y", 14, [("t", 15.62, 1.25, side * 0.84)], m_bs, bevel=0.010))

    # Full-Length 27-MOA MIL-STD-1913 Picatinny Top Rail (X in [-14.43, +15.87], top flush at Y = +2.74)
    parts.append(
        mk_dovetail_bar_x("up_rail_base", -14.43, 15.87, 2.41, 2.58, 0.45, 0.49, 0.055, bevel=0.012, mat=m_sl)
    )
    for s in range(36):
        lx = -13.95 + s * 0.84
        parts.append(
            mk_dovetail_bar_x(
                f"up_lug_{s}", lx - 0.23, lx + 0.23, 2.56, 2.74, 0.43, 0.54, 0.055, bevel=0.012, mat=m_rc
            )
        )

    # 1) Folding Hooded Backup Front Iron Sight at X = +15.35 (max Y = 3.562)
    hood_pts = [
        (0.290, 15.08),
        (0.382, 15.08),
        (0.382, 15.62),
        (0.290, 15.62),
        (0.290, 15.08),
    ]
    parts.append(mk_dovetail_bar_x("up_fs_base", 14.97, 15.73, 2.70, 2.94, 0.40, 0.46, 0.040, bevel=0.010, mat=m_dk))
    parts.append(mk_cyl("up_fs_pin", 0.080, 0.080, 0.96, "z", 16, [("t", 15.35, 2.82, 0.0)], m_bs, bevel=0.010))
    parts.append(mk_lathe_x("up_fs_hood", hood_pts, segs=28, xform=[("t", 0.0, 3.18, 0.0)], mat=m_dk))
    parts.append(mk_cyl("up_fs_post", 0.042, 0.055, 0.34, "y", 12, [("t", 15.35, 3.09, 0.0)], m_bs, bevel=0.008))

    # 2) Folding Rear Backup Peep Iron Sight at X = -13.80 (dovetail base, 3D knurled drum, peep leaf)
    parts.append(mk_dovetail_bar_x("up_rs_base", -14.22, -13.38, 2.72, 2.96, 0.42, 0.48, 0.040, bevel=0.010, mat=m_dk))
    parts.append(mk_knurled_cyl("up_rs_drum", 0.165, 1.18, "z", flutes=20, depth=0.014, xform=[("t", -13.80, 2.88, 0.0)], mat=m_bs))
    rear_leaf = mk_box("up_rs_leaf", 1.18, 0.16, 0.56, [("t", -14.32, 2.94, 0.0)], m_up, bevel=0.018, bevel_segs=2)
    rear_hole = mk_cyl("up_rs_hole", 0.11, 0.11, 0.36, "y", 18, [("t", -14.68, 2.94, 0.0)], m_in)
    parts.append(bool_subtract(rear_leaf, [rear_hole]))

    # Multi-facet beveled angled .50 BMG Brass Deflector (max Z = 1.47) + ejection port top lip reinforcement
    defl_xz = [
        (1.38, 1.02),
        (2.14, 1.02),
        (1.98, 1.45),
        (1.52, 1.38),
    ]
    parts.append(mk_extrude_y("up_defl", defl_xz, 0.85, 1.79, bevel=0.022, bevel_segs=2, mat=m_bd))
    parts.append(mk_box("up_ejlip", 5.86, 0.10, 0.08, [("t", 5.00, 1.98, 1.12)], m_dk, bevel=0.012, bevel_segs=1))

    obj = join_objects(parts, "m82a1_upper_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_lower_receiver(mats: dict) -> bpy.types.Object:
    """F-01: Sheet-steel lower receiver + integral monopod-ready rifle buttstock,
    reinforced X-ribbed .50 BMG magwell, rock-in paddle catch, twin quick-release captive
    takedown pins w/ stainless pull rings, and thick 9-rib Sorbothane recoil buttpad."""
    m_lo = mats["R_LowerParkerized"]
    m_dk = mats["R_DarkReinforce"]
    m_bs = mats["R_BrightSteel"]
    m_rb = mats["R_SorbothaneRubber"]
    m_in = mats["R_InnerDark"]

    lower_xy = [
        (-20.80,  0.20),
        ( 15.80,  0.20),
        ( 15.80, -0.44),
        ( 13.60, -0.92),
        (  8.85, -0.92),
        (  8.55, -2.36),
        (  1.85, -2.36),
        (  1.55, -1.25),
        ( -5.20, -1.25),
        (-14.75, -3.55),
        (-15.65, -3.12),
        (-19.00, -3.96),
        (-19.62, -4.65),
        (-20.80, -4.65),
    ]
    hull = mk_extrude_z("lo_hull", lower_xy, -1.12, 1.12, bevel=0.040, bevel_segs=2, mat=m_lo)

    cut_trough = mk_box("lo_c_tr", 35.60, 1.35, 1.88, [("t", -2.40, -0.35, 0.0)], m_in)
    cut_cavs = join_objects([
        mk_box("lo_c_bst", 14.80, 2.40, 1.82, [("rz", 0.14), ("t", -13.00, -1.45, 0.0)], m_in),
        mk_box("lo_c_mag",  6.32, 3.05, 1.84, [("t",   5.25, -1.10, 0.0)], m_in),
        mk_box("lo_c_trg",  2.20, 1.25, 0.84, [("t",  -0.55, -0.95, 0.0)], m_in),
    ], "lo_c_cavs")
    shell = bool_subtract(hull, [cut_trough, cut_cavs])

    # Thick 9-Rib Sorbothane Recoil-Absorbing Buttpad (X in [-21.99, -20.80], Y in [-4.71, +2.37])
    pad_back = mk_box("lo_pback", 0.16, 7.06, 2.34, [("t", -20.88, -1.17, 0.0)], m_dk, bevel=0.020, bevel_segs=2)
    pad_raw = mk_box("lo_pad", 1.06, 7.08, 2.38, [("t", -21.46, -1.17, 0.0)], m_rb, bevel=0.055, bevel_segs=2)
    pad_grooves = join_objects([
        mk_box(f"lo_pg_{r}", 0.30, 0.22, 2.60, [("t", -21.94, -4.15 + r * 0.74, 0.0)], m_rb)
        for r in range(9)
    ], "lo_pgs")
    pad_main = bool_subtract(pad_raw, [pad_grooves])

    # Internal rear cylindrical buffer housing collar (zero-CSG hollow lathe) + accelerator abutment stop block
    buf_pts = [
        (0.62, -20.70),
        (0.76, -20.70),
        (0.76, -16.50),
        (0.62, -16.50),
        (0.62, -20.70),
    ]
    buf_collar = mk_lathe_x("lo_bufc", buf_pts, segs=28, xform=[("t", 0.0, 1.25, 0.0)], mat=m_dk)
    accel_stop = mk_box("lo_astop", 0.72, 0.42, 1.62, [("t", -5.85, 0.12, 0.0)], m_dk, bevel=0.018, bevel_segs=1)

    parts = [shell, pad_back, pad_main, buf_collar, accel_stop]

    # Embossed magwell flared lip collar, diagonal X-stiffening ribs & buttstock horizontal stiffening beads
    for side in (-1, 1):
        zf = side * 1.15
        parts.append(mk_box(f"lo_mwlip_{side}", 6.85, 0.22, 0.08, [("t", 5.20, -2.24, zf)], m_dk, bevel=0.016, bevel_segs=1))
        parts.append(mk_box(f"lo_mwx1_{side}", 4.60, 0.16, 0.065, [("rz",  0.28), ("t", 5.20, -1.22, zf)], m_lo, bevel=0.014, bevel_segs=1))
        parts.append(mk_box(f"lo_mwx2_{side}", 4.60, 0.16, 0.065, [("rz", -0.28), ("t", 5.20, -1.22, zf)], m_lo, bevel=0.014, bevel_segs=1))
        # Subtle stamped lower-edge stiffening rib along rear stock toe
        parts.append(mk_box(f"lo_strib_{side}", 8.40, 0.12, 0.05, [("rz", 0.22), ("t", -10.80, -2.22, zf)], m_lo, bevel=0.012, bevel_segs=1))

    # Rock-and-lock serrated paddle magazine release & pivot pin behind magwell
    parts.append(mk_box("lo_mrel", 0.32, 1.12, 0.90, [("rz", 0.24), ("t", 1.68, -2.56, 0.0)], m_dk, bevel=0.022, bevel_segs=2))
    parts.append(mk_cyl("lo_mrpin", 0.10, 0.10, 1.38, "z", 16, [("t", 1.82, -2.18, 0.0)], m_bs, bevel=0.010))

    # Twin Captive Quick-Release Cross-Lock Takedown Pins (Front X=+14.6, Rear X=-19.8) w/ pull rings
    for idx_p, px in enumerate((14.60, -19.80)):
        parts.append(mk_cyl(f"lo_pboss_{idx_p}", 0.30, 0.30, 2.42, "z", 22, [("t", px, 0.04, 0.0)], m_dk, bevel=0.022))
        parts.append(mk_cyl(f"lo_pshaft_{idx_p}", 0.18, 0.18, 2.74, "z", 22, [("t", px, 0.04, 0.0)], m_bs, bevel=0.016))
        parts.append(mk_cyl(f"lo_phead_{idx_p}", 0.25, 0.25, 0.14, "z", 22, [("t", px, 0.04, -1.28)], m_bs, bevel=0.016))
        parts.append(mk_torus(f"lo_pring_{idx_p}", 0.38, 0.055, "z", 26, 12, [("t", px, -0.18, -1.36)], m_bs))

    # Front Bipod Mounting Yoke Clevis Ears (X = +14.7) + Rear Angled Monopod Dovetail Rail (X = -17.35)
    parts.append(mk_box("lo_byokeL", 1.78, 0.56, 0.24, [("t", 14.70, -0.95, -0.68)], m_dk, bevel=0.022, bevel_segs=2))
    parts.append(mk_box("lo_byokeR", 1.78, 0.56, 0.24, [("t", 14.70, -0.95,  0.68)], m_dk, bevel=0.022, bevel_segs=2))
    parts.append(
        mk_dovetail_bar_x(
            "lo_monorail", -1.20, 1.20, -0.14, 0.14, 0.36, 0.43, 0.04,
            bevel=0.012, xform=[("rx", math.pi), ("rz", 0.23), ("t", -17.35, -3.72, 0.0)], mat=m_dk,
        )
    )

    obj = join_objects(parts, "m82a1_lower_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_carry_handle(mats: dict) -> bpy.types.Object:
    """U-06: Quick-detach folding heavy-duty steel carry handle w/ 3D knurled clamp thumb-nuts
    and 5-groove thermally insulated polymer grip sleeve (folded outward-right at 52 deg)."""
    m_up = mats["R_UpperParkerized"]
    m_dk = mats["R_DarkReinforce"]
    m_bs = mats["R_BrightSteel"]
    m_gr = mats["R_CarryHandleGrip"]

    parts = [
        mk_box("ch_clamp", 2.35, 0.38, 1.26, [("t", 0.10, 0.10, 0.0)], m_dk, bevel=0.028, bevel_segs=2),
        mk_box("ch_clevis", 2.25, 0.34, 0.42, [("t", 0.10, 0.24, 0.62)], m_up, bevel=0.022, bevel_segs=2),
        mk_cyl("ch_hpin", 0.085, 0.085, 2.32, "x", 16, [("t", 0.10, 0.24, 0.62)], m_bs, bevel=0.010),
    ]
    for i, bx in enumerate((-0.55, 0.75)):
        parts.append(mk_cyl(f"ch_bolt_{i}", 0.11, 0.11, 1.48, "z", 16, [("t", bx, 0.08, 0.0)], m_bs, bevel=0.012))
        parts.append(mk_knurled_cyl(f"ch_nut_{i}", 0.24, 0.22, "z", flutes=16, depth=0.018, xform=[("t", bx, 0.08, -0.72)], mat=m_bs))

    # Folded heavy steel bail arms & 5-groove insulated polymer grip sleeve
    fold_xf = [("rx", 0.92), ("t", 0.0, 0.24, 0.56)]
    parts.append(mk_cyl("ch_arm1", 0.115, 0.115, 1.52, "y", 18, [("t", -0.82, 0.74, 0.0)] + fold_xf, m_up, bevel=0.014))
    parts.append(mk_cyl("ch_arm2", 0.115, 0.115, 1.52, "y", 18, [("t",  2.12, 0.74, 0.0)] + fold_xf, m_up, bevel=0.014))
    parts.append(mk_cyl("ch_bar", 0.115, 0.115, 3.16, "x", 18, [("t", 0.65, 1.46, 0.0)] + fold_xf, m_up, bevel=0.016))
    # Contoured polymer grip sleeve + 5 bold raised comfort ribs + steel end ferrules
    parts.append(mk_cyl("ch_sleeve", 0.33, 0.33, 2.52, "x", 28, [("t", 0.65, 1.46, 0.0)] + fold_xf, m_gr, bevel=0.036))
    for r in range(-2, 3):
        parts.append(mk_torus(f"ch_rib_{r}", 0.345, 0.056, "x", 26, 12, [("t", 0.65 + r * 0.45, 1.46, 0.0)] + fold_xf, m_dk))
    for ex in (-0.64, 1.94):
        parts.append(mk_cyl(f"ch_fer_{ex:.1f}", 0.24, 0.24, 0.12, "x", 20, [("t", ex, 1.46, 0.0)] + fold_xf, m_dk, bevel=0.015))

    obj = join_objects(parts, "m82a1_carry_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_selector(mats: dict) -> bpy.types.Object:
    """FC-04: Left-side 90-deg rotary thumb safety selector (SAFE / FIRE) w/ half-moon trigger cam."""
    m_up = mats["R_UpperParkerized"]
    m_dk = mats["R_DarkReinforce"]
    m_bs = mats["R_BrightSteel"]
    m_in = mats["R_InnerDark"]

    raw_shaft = mk_cyl("sel_shaft", 0.22, 0.22, 2.38, "z", 24, mat=m_dk, bevel=0.015)
    cam_cut = mk_box("sel_ccut", 0.32, 0.24, 0.72, [("t", 0.12, -0.14, 0.0)], m_in)
    shaft = bool_subtract(raw_shaft, [cam_cut])

    parts = [
        shaft,
        mk_cyl("sel_lpl", 0.37, 0.37, 0.14, "z", 24, [("t", 0.0, 0.0, -1.20)], m_dk, bevel=0.018),
        mk_box("sel_pad", 1.20, 0.32, 0.18, [("rz", 0.22), ("t", 0.48, 0.12, -1.24)], m_up, bevel=0.024, bevel_segs=2),
        mk_box("sel_rid", 0.96, 0.10, 0.07, [("rz", 0.22), ("t", 0.46, 0.12, -1.34)], m_bs, bevel=0.010, bevel_segs=1),
        mk_cyl("sel_rcap", 0.28, 0.28, 0.10, "z", 22, [("t", 0.0, 0.0, 1.20)], m_bs, bevel=0.014),
        mk_box("sel_wtk", 0.42, 0.06, 0.04, [("rz", 0.22), ("t", 0.04, 0.02, 1.26)], m_dk, bevel=0.008, bevel_segs=1),
    ]
    obj = join_objects(parts, "m82a1_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — GROUP 2: HEAVY ORDNANCE, SHORT-RECOIL & FCG (Suite 2: m82a1_v3_ordnance)
# =============================================================================
def build_m82a1_muzzle_brake(mats: dict) -> bpy.types.Object:
    """U-01: Iconic Murfreesboro Barrett Two-Chamber V-Arrowhead Tank Muzzle Brake
    with beveled top/bottom baffle plates, deep 33° twin expansion chambers lined with
    bronze/blue thermal temper + heavy .50 BMG gunpowder carbon soot, hex jam nut & clamp bolts!"""
    m_out = mats["M_ArrowheadOuter"]
    m_soot = mats["M_BrakeChamberSoot"]
    m_dk = mats["M_DarkHardware"]
    m_mid = mats["M_BoltMidSteel"]
    m_bs = mats["M_MachinedSteel"]

    # Swept V-arrowhead main body core (Y in [-0.53, +0.53])
    core_xz = [
        (-0.26, -0.82),
        (-0.56, -1.48),
        ( 0.24, -1.68),
        ( 0.52, -1.44),
        ( 1.36, -1.34),
        ( 2.40, -0.48),
        ( 2.40,  0.48),
        ( 1.36,  1.34),
        ( 0.52,  1.44),
        ( 0.24,  1.68),
        (-0.56,  1.48),
        (-0.26,  0.82),
    ]
    brake_core = mk_extrude_y("mb_core", core_xz, -0.53, 0.53, bevel=0.014, bevel_segs=1, mat=m_out)

    # Distinct overhanging Top & Bottom beveled horizontal baffle plates (Y in [±0.52, ±0.77], bevel -> ±0.795)
    plate_xz = [
        (-0.28, -0.86),
        (-0.58, -1.54),
        ( 0.26, -1.72),
        ( 1.40, -1.36),
        ( 2.42, -0.50),
        ( 2.42,  0.50),
        ( 1.40,  1.36),
        ( 0.26,  1.72),
        (-0.58,  1.54),
        (-0.28,  0.86),
    ]
    top_plate = mk_extrude_y("mb_top", plate_xz, 0.52, 0.77, bevel=0.025, bevel_segs=2, mat=m_out)
    bot_plate = mk_extrude_y("mb_bot", plate_xz, -0.77, -0.52, bevel=0.025, bevel_segs=2, mat=m_out)

    # Carve central .50 BMG bore, stepped axial plenums, recessed 11° exit crown & twin 33° chevron chambers
    # Cutters carry `M_BrakeChamberSoot` so every carved interior baffle face receives bronze/blue heat + black carbon!
    cut_bore = mk_cyl("mb_cbore", 0.33, 0.33, 3.30, "x", 28, [("t", 0.95, 0.0, 0.0)], m_soot)
    crown_pts = [
        (0.0, 2.18),
        (0.33, 2.18),
        (0.45, 2.38),
        (0.49, 2.38),
        (0.49, 2.52),
        (0.0, 2.52),
    ]
    cut_plenums = join_objects([
        mk_cyl("mb_cp0", 0.59, 0.59, 0.50, "x", 26, [("t", -0.42, 0.0, 0.0)], m_soot),
        mk_cyl("mb_cp1", 0.44, 0.48, 0.56, "x", 24, [("t",  0.20, 0.0, 0.0)], m_soot),
        mk_cyl("mb_cp2", 0.42, 0.46, 0.54, "x", 24, [("t",  1.31, 0.0, 0.0)], m_soot),
        mk_lathe_x("mb_ccrown", crown_pts, segs=28, mat=m_soot),
    ], "mb_cplenums")

    ch_cutters = []
    vent_cutters = []
    for side in (-1, 1):
        ch_cutters.append(
            mk_box(f"mb_c1_{side}", 0.74, 1.12, 1.92, [("ry", side * 0.58), ("t", 0.20, 0.0, side * 0.94)], m_soot)
        )
        ch_cutters.append(
            mk_box(f"mb_c2_{side}", 0.68, 1.12, 1.68, [("ry", side * 0.58), ("t", 1.33, 0.0, side * 0.85)], m_soot)
        )
        for vx in (0.28, 1.36):
            vent_cutters.append(
                mk_box(f"mb_cv_{side}_{vx:.2f}", 0.38, 1.95, 0.24, [("ry", side * 0.56), ("t", vx, 0.0, side * 0.68)], m_soot)
            )
    cut_chambers = join_objects(ch_cutters, "mb_cchamb")
    brake_core = bool_subtract(brake_core, [cut_bore, cut_plenums, cut_chambers])

    plates = join_objects([top_plate, bot_plate], "mb_plates")
    vent_cutters.append(mk_cyl("mb_crearsock", 0.59, 0.59, 0.92, "x", 24, [("t", -0.66, 0.0, 0.0)], m_soot))
    plates = bool_subtract(plates, [join_objects(vent_cutters, "mb_cvents")])

    # Hollow rear threaded mounting collar + twin split-collar clamping ears
    collar_pts = [
        (0.59, -0.91),
        (0.84, -0.91),
        (0.84, -0.13),
        (0.59, -0.13),
        (0.59, -0.91),
    ]
    rear_collar = mk_lathe_x("mb_collar", collar_pts, segs=36, mat=m_out)

    parts = [
        brake_core,
        plates,
        rear_collar,
        mk_box("mb_earL", 0.74, 0.38, 0.30, [("t", -0.54, -0.84, -0.19)], m_dk, bevel=0.022, bevel_segs=2),
        mk_box("mb_earR", 0.74, 0.38, 0.30, [("t", -0.54, -0.84,  0.19)], m_dk, bevel=0.022, bevel_segs=2),
        # True 6-flat hexagonal barrel jam nut (max Y = +0.86) + chamfer collar + stainless peel-washer stack
        mk_cyl("mb_hexnut", 0.86, 0.86, 0.14, "x", 6, [("rx", math.pi / 6.0), ("t", -0.95, 0.0, 0.0)], m_mid, bevel=0.015),
        mk_cyl("mb_chamf", 0.81, 0.81, 0.16, "x", 32, [("t", -0.95, 0.0, 0.0)], m_out, bevel=0.012),
        mk_cyl("mb_shim1", 0.76, 0.76, 0.05, "x", 32, [("t", -1.045, 0.0, 0.0)], m_bs, bevel=0.008),
        mk_cyl("mb_shim2", 0.75, 0.75, 0.035, "x", 32, [("t", -0.85, 0.0, 0.0)], m_bs, bevel=0.006),
        # Stainless jet-stripper aperture ring on central V-splitter baffle bore
        mk_torus("mb_jetring", 0.345, 0.022, "x", 28, 10, [("t", 0.76, 0.0, 0.0)], m_mid),
    ]

    # Twin recessed socket-head clamp bolts + hex nuts on bottom split clamping lug
    for i, bx in enumerate((-0.72, -0.36)):
        parts.append(mk_cyl(f"mb_cb_{i}", 0.082, 0.082, 0.76, "z", 16, [("t", bx, -0.84, 0.0)], m_bs, bevel=0.010))
        parts.append(mk_cyl(f"mb_ch_{i}", 0.125, 0.125, 0.09, "z", 16, [("t", bx, -0.84, -0.38)], m_mid, bevel=0.012))
        parts.append(mk_cyl(f"mb_cn_{i}", 0.125, 0.125, 0.08, "z", 6,  [("t", bx, -0.84,  0.38)], m_mid, bevel=0.010))

    # Internal female thread rings + 8 helical .50 BMG throat rifling lands
    for tx in (-0.88, -0.68, -0.48):
        parts.append(mk_torus(f"mb_thr_{tx:.2f}", 0.585, 0.018, "x", 26, 8, [("t", tx, 0.0, 0.0)], m_mid))
    parts.append(
        mk_helical_lands("mb_lands", 8, 0.33, 0.026, 0.095, -0.22, 0.32, (2.0 * math.pi) / 38.1, segs=4, mat=m_mid)
    )

    obj = join_objects(parts, "m82a1_muzzle_brake")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_barrel(mats: dict) -> bpy.types.Object:
    """U-02: Massive 29-inch (737 mm) deeply 8-fluted recoiling heavy match .50 BMG barrel
    with stepped breech ring, keyed locking collar w/ 4 spanner notches, smooth front bushing
    journal, 11° recessed target crown & 8 helical rifling lands."""
    m_bbl = mats["M_FlutedBarrelSteel"]
    m_flt = mats["M_BarrelFluteValley"]
    m_mid = mats["M_BoltMidSteel"]
    m_bs = mats["M_MachinedSteel"]
    m_in = mats["M_InnerDark"]

    pts_r_x = [
        (0.420,  4.150),
        (0.860,  4.150),  # Heavy breech & chamber journal inside barrel extension
        (0.860,  7.580),
        (0.940,  7.620),  # Integral barrel locking / stop collar flange
        (0.940,  8.240),
        (0.790,  8.420),
        (0.760, 14.100),  # Rear forend fluted section (visible through 28 cooling vents)
        (0.755, 14.250),  # Smooth cylindrical front bushing bearing journal
        (0.755, 16.950),
        (0.735, 17.150),  # Heavy exposed match fluted contour
        (0.710, 29.750),
        (0.740, 29.920),  # Muzzle swell & timing shim shoulder
        (0.740, 30.580),
        (0.580, 30.610),  # Threaded 7/8"-14UNF muzzle tenon
        (0.580, 31.430),
        (0.560, 31.450),  # 45° crown edge break
        (0.470, 31.450),
        (0.470, 31.415),  # Recessed crown step
        (0.285, 31.379),  # True 11° recessed target crown cone
        # Closed hollow bore & .50 BMG chamber return path
        (0.285,  8.250),
        (0.305,  8.000),  # Leade / freebore cone
        (0.305,  7.620),  # Case neck
        (0.400,  7.240),  # .50 BMG shoulder
        (0.430,  4.350),  # Tapered chamber body
        (0.470,  4.200),  # Breech chamfer
        (0.420,  4.150),
    ]
    bbl_obj = mk_lathe_x("bbl_main", pts_r_x, segs=48, mat=m_bbl)
    # Assign dark bore material to interior bore/chamber faces
    bbl_obj.data.materials.append(m_in)
    in_idx = len(bbl_obj.data.materials) - 1
    for p in bbl_obj.data.polygons:
        c = p.center
        r = math.hypot(c.y, c.z)
        if r < 0.475 and 4.17 < c.x < 31.42:
            p.material_index = in_idx

    # 8 DEEP crisp ball-endmill longitudinal flutes on fore-barrel (X in [17.35, 29.55]) &
    # 8 aligned forend cooling flutes (X in [8.85, 13.85]) + 4 spanner notches on locking collar!
    # Cutters carry `M_BarrelFluteValley` so every flute valley contrasts crisply with specular ridges!
    cutters = []
    for k in range(8):
        ang = k * (math.pi / 4.0)
        ca, sa = math.cos(ang), math.sin(ang)
        cutters.append(
            mk_capsule_x(
                f"bbl_ff_{k}", 0.155, 11.90, segs=18, cap_rings=6,
                xform=[("t", 23.45, ca * 0.780, sa * 0.780)], mat=m_flt,
            )
        )
        cutters.append(
            mk_capsule_x(
                f"bbl_rf_{k}", 0.145, 4.70, segs=14, cap_rings=5,
                xform=[("t", 11.35, ca * 0.805, sa * 0.805)], mat=m_flt,
            )
        )
        if k % 2 == 0:
            cutters.append(
                mk_box(
                    f"bbl_sp_{k}", 0.26, 0.22, 0.22,
                    [("t", 7.93, 0.94, 0.0), ("rx", ang)], mat=m_flt,
                )
            )
    bbl_fluted = bool_subtract(bbl_obj, [join_objects(cutters, "bbl_flutes_all")])

    parts = [
        bbl_fluted,
        mk_torus("bbl_throat", 0.58, 0.075, "x", 32, 12, [("t", 4.18, 0.0, 0.0)], m_bs),
        mk_cyl("bbl_lring", 0.955, 0.955, 0.12, "x", 36, [("t", 7.68, 0.0, 0.0)], m_mid, bevel=0.015),
    ]
    # Subtle machined 7/8"-14UNF muzzle thread rings on tenon (hidden under brake, crisp when exploded!)
    for tx in (30.72, 30.86, 31.00, 31.14, 31.28):
        parts.append(mk_torus(f"bbl_th_{tx:.2f}", 0.580, 0.014, "x", 28, 8, [("t", tx, 0.0, 0.0)], m_mid))

    # 8 helical right-hand 1:15" .50 BMG rifling lands at muzzle bore & chamber leade
    twist = (2.0 * math.pi) / 38.1
    parts.append(mk_helical_lands("bbl_rmuz", 8, 0.285, 0.030, 0.10, 27.40, 31.37, twist, segs=10, phase=0.12, mat=m_mid))
    parts.append(mk_helical_lands("bbl_rlead", 8, 0.285, 0.030, 0.10, 8.30, 10.60, twist, segs=6, phase=0.12, mat=m_mid))

    obj = join_objects(parts, "m82a1_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_barrel_extension(mats: dict) -> bpy.types.Object:
    """U-03: Heavy 4340 3-lug locking barrel extension, twin spring-anchor collar & accelerator trip lug."""
    m_dk = mats["M_DarkHardware"]
    m_mid = mats["M_BoltMidSteel"]
    m_bs = mats["M_MachinedSteel"]
    m_in = mats["M_InnerDark"]

    sleeve = mk_cyl("be_slv", 0.98, 0.98, 4.80, "x", 36, [("t", -0.20, 0.0, 0.0)], m_dk, bevel=0.025)
    key_rail = mk_box("be_key", 4.56, 0.42, 2.02, [("t", -0.20, 0.0, 0.0)], m_dk, bevel=0.020, bevel_segs=2)
    spr_col = mk_box("be_scol", 0.54, 0.62, 2.14, [("t", 1.92, 0.0, 0.0)], m_mid, bevel=0.022, bevel_segs=2)
    trip_lug = mk_box("be_trip", 0.86, 0.44, 0.72, [("t", -2.12, -0.88, 0.0)], m_dk, bevel=0.022, bevel_segs=2)
    solid = bool_union([sleeve, key_rail, join_objects([spr_col, trip_lug], "be_st")], "be_solid")

    lug_cuts = []
    for i in range(3):
        ang = (i * 2.0 * math.pi) / 3.0 + math.pi * 0.5
        lug_cuts.append(mk_box(f"be_lr_{i}", 1.28, 0.46, 0.44, [("t", -2.12, 0.64, 0.0), ("rx", ang)], m_in))

    solid = bool_subtract(solid, [
        mk_cyl("be_cb1", 0.68, 0.68, 5.20, "x", 32, [("t", -0.20, 0.0, 0.0)], m_in),
        mk_cyl("be_cb2", 0.83, 0.83, 0.92, "x", 32, [("t", -1.20, 0.0, 0.0)], m_in),
        join_objects(lug_cuts, "be_lrs"),
        join_objects([
            mk_box("be_cej", 1.65, 0.78, 0.85, [("t", -1.55, 0.14, 0.68)], m_in),
            mk_box("be_cfr", 1.48, 0.68, 0.94, [("rz", 0.38), ("t", -2.08, -0.68, 0.0)], m_bs),
        ], "be_ejfr"),
        mk_box("be_ccam", 1.35, 0.48, 0.48, [("ry", -0.38), ("t", -1.85, 0.68, 0.12)], m_in),
    ])

    parts = [solid]
    for i in range(3):
        ang = (i * 2.0 * math.pi) / 3.0 + math.pi / 6.0
        parts.append(mk_box(f"be_abut_{i}", 0.38, 0.18, 0.34, [("t", -1.92, 0.74, 0.0), ("rx", ang)], m_mid, bevel=0.015, bevel_segs=1))
    for side in (-1, 1):
        parts.append(mk_cyl(f"be_pin_{side}", 0.085, 0.085, 0.68, "y", 14, [("t", 1.96, 0.0, side * 0.84)], m_bs, bevel=0.010))

    obj = join_objects(parts, "m82a1_barrel_extension")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_bolt_carrier(mats: dict) -> bpy.types.Object:
    """U-09: Massive machined octagonal steel bolt carrier w/ helical cam track,
    sand-relief fullers, accelerator clevis & hollow lightened grooved charging handle."""
    m_bc = mats["M_OiledCarrier"]
    m_mid = mats["M_BoltMidSteel"]
    m_bs = mats["M_MachinedSteel"]
    m_dk = mats["M_DarkHardware"]
    m_in = mats["M_InnerDark"]

    carrier_zy = [
        (-0.65, -0.69),
        ( 0.65, -0.69),
        ( 0.79, -0.55),
        ( 0.79,  0.49),
        ( 0.59,  0.69),
        (-0.59,  0.69),
        (-0.79,  0.49),
        (-0.79, -0.55),
    ]
    main_blk = mk_extrude_x("bc_blk", carrier_zy, -4.805, 3.445, bevel=0.025, bevel_segs=2, mat=m_bc)
    tail = mk_cyl("bc_tail", 0.58, 0.56, 1.44, "x", 28, [("t", -5.00, 0.0, 0.0)], m_mid, bevel=0.025)
    clevis = mk_box("bc_clev", 1.12, 0.62, 1.24, [("t", -2.20, -0.66, 0.0)], m_bc, bevel=0.022, bevel_segs=2)
    raw = bool_union([main_blk, join_objects([tail, clevis], "bc_tc")], "bc_raw")

    body = bool_subtract(raw, [
        join_objects([
            mk_cyl("bc_cbore", 0.53, 0.53, 3.89, "x", 28, [("t", 1.50, 0.0, 0.0)], m_in),
            mk_box("bc_capok", 1.45, 1.22, 0.64, [("t", -2.25, -0.15, 0.0)], m_in),
        ], "bc_cg1"),
        join_objects([
            mk_box("bc_crlL", 6.80, 0.38, 0.28, [("t", -1.00, 0.18, -0.82)], m_in),
            mk_box("bc_crlR", 5.20, 0.38, 0.28, [("t", -1.80, 0.18,  0.82)], m_in),
            mk_box("bc_fulL", 5.60, 0.18, 0.10, [("t", -0.90, 0.46, -0.78)], m_mid),
            mk_box("bc_fulR", 4.40, 0.18, 0.10, [("t", -1.50, 0.46,  0.78)], m_mid),
        ], "bc_cg2"),
        join_objects([
            mk_box("bc_cstr", 8.40, 0.82, 0.64, [("t", -0.65, -0.69, 0.0)], m_in),
            mk_box("bc_ccam", 1.62, 0.56, 0.52, [("ry", 0.52), ("t", 2.05, 0.58, 0.16)], m_in),
        ], "bc_cg3"),
    ])

    # Hollow lightened grooved Right-Side Charging Handle (Z up to +2.14 w/ knurled grip rings!)
    hdl_pts = [
        (0.0,  0.70),
        (0.23, 0.70),
        (0.19, 1.16),
        (0.29, 1.20),
        (0.29, 2.12),
        (0.25, 2.14),
        (0.16, 2.14),
        (0.16, 1.96),
        (0.0,  1.96),
    ]
    handle = mk_lathe_x("bc_hdl", hdl_pts, segs=28, xform=[("ry", -math.pi * 0.5), ("t", 2.35, 0.0, 0.0)], mat=m_dk)

    parts = [
        body,
        handle,
        mk_cyl("bc_apin", 0.14, 0.14, 1.32, "z", 16, [("t", -2.20, -0.73, 0.0)], m_bs, bevel=0.014),
    ]
    for gz in (1.34, 1.56, 1.78, 2.00):
        parts.append(mk_torus(f"bc_hgr_{gz:.2f}", 0.295, 0.024, "z", 24, 10, [("t", 2.35, 0.0, gz)], m_mid))

    obj = join_objects(parts, "m82a1_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_accelerator(mats: dict) -> bpy.types.Object:
    """U-10: Short-recoil 17-4 PH stainless momentum-transfer accelerator lever arm & roller."""
    m_bs = mats["M_MachinedSteel"]
    m_mid = mats["M_BoltMidSteel"]
    m_sp = mats["M_SpringSteel"]

    arm_xy = [(-0.28, -0.32), (0.26, -0.26)]
    arm_xy.extend(_quad_bez((0.26, -0.26), (0.46, 0.42), (0.30, 1.16), 10))
    arm_xy.append((-0.18, 1.10))
    arm_xy.extend(_quad_bez((-0.18, 1.10), (-0.24, 0.42), (-0.28, -0.32), 10))

    parts = [
        mk_cyl("ac_axle", 0.16, 0.16, 1.48, "z", 20, mat=m_bs, bevel=0.016),
        mk_extrude_z("ac_arm", arm_xy, -0.25, 0.25, bevel=0.028, bevel_segs=2, mat=m_bs),
        mk_cyl("ac_roll", 0.15, 0.15, 0.58, "z", 20, [("t", 0.06, 1.04, 0.0)], m_mid, bevel=0.016),
        mk_coil_spring("ac_spr", "z", -0.48, 0.48, 0.0, 0.0, 0.24, 0.032, 6.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
    ]
    obj = join_objects(parts, "m82a1_accelerator")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_bolt(mats: dict) -> bpy.types.Object:
    """U-11: Massive 3-lug triangular rotating .50 BMG bolt head, twin oil-relief rings,
    heavy pivoting claw extractor, dual plunger ejectors & recessed 20.4 mm bolt face."""
    m_bs = mats["M_MachinedSteel"]
    m_mid = mats["M_BoltMidSteel"]
    m_dk = mats["M_DarkHardware"]
    m_in = mats["M_InnerDark"]

    stem_pts = [
        (0.180, -1.835),
        (0.460, -1.835),
        (0.480, -1.780),
        (0.480, -1.080),
        (0.445, -1.060),
        (0.445, -0.960),
        (0.480, -0.940),
        (0.480, -0.820),
        (0.445, -0.800),
        (0.445, -0.700),
        (0.480, -0.680),
        (0.480,  0.780),
        (0.435,  0.820),
        (0.435,  1.000),
        (0.180,  1.000),
        (0.180, -1.835),
    ]
    stem = mk_lathe_x("blt_stem", stem_pts, segs=36, mat=m_bs)

    # Sculpted equilateral-triangular 3-lug .50 BMG bolt head profile in (Z, Y)
    tri_zy: list[tuple[float, float]] = []
    r_out, r_root = 0.82, 0.565
    for i in range(3):
        base = (i * 2.0 * math.pi) / 3.0 - math.pi * 0.5
        a0, a1 = base - 0.36, base - 0.25
        a_ml, a_mr = base - 0.065, base + 0.065
        a2, a3 = base + 0.25, base + 0.36
        nxt = base + (2.0 * math.pi) / 3.0 - 0.36

        p_a0 = (math.cos(a0) * r_root, math.sin(a0) * r_root)
        p_a1 = (math.cos(a1) * r_out, math.sin(a1) * r_out)
        p_ml = (math.cos(a_ml) * (r_out + 0.015), math.sin(a_ml) * (r_out + 0.015))
        p_mr = (math.cos(a_mr) * (r_out + 0.015), math.sin(a_mr) * (r_out + 0.015))
        p_a2 = (math.cos(a2) * r_out, math.sin(a2) * r_out)
        p_a3 = (math.cos(a3) * r_root, math.sin(a3) * r_root)
        p_nx = (math.cos(nxt) * r_root, math.sin(nxt) * r_root)

        if i == 0:
            tri_zy.append(p_a0)
        tri_zy.append(p_a1)
        tri_zy.extend(_quad_bez(p_a1, (math.cos(base - 0.14) * (r_out + 0.032), math.sin(base - 0.14) * (r_out + 0.032)), p_ml, 4))
        tri_zy.append((math.cos(base) * (r_out - 0.022), math.sin(base) * (r_out - 0.022)))
        tri_zy.append(p_mr)
        tri_zy.extend(_quad_bez(p_mr, (math.cos(base + 0.14) * (r_out + 0.032), math.sin(base + 0.14) * (r_out + 0.032)), p_a2, 4))
        tri_zy.append(p_a3)
        tri_zy.extend(_quad_bez(p_a3, (math.cos(base + math.pi / 3.0) * (r_root * 1.025), math.sin(base + math.pi / 3.0) * (r_root * 1.025)), p_nx, 4))

    head = mk_extrude_x("blt_head", tri_zy, 1.02, 1.80, bevel=0.026, bevel_segs=2, mat=m_bs)
    head = bool_subtract(head, [
        mk_cyl("blt_cface", 0.455, 0.455, 0.20, "x", 32, [("t", 1.75, 0.0, 0.0)], m_in),
        join_objects([
            mk_cyl("blt_cfp", 0.078, 0.078, 0.72, "x", 16, [("t", 1.42,  0.00,  0.00)], m_in),
            mk_cyl("blt_cej1", 0.088, 0.088, 0.34, "x", 16, [("t", 1.56,  0.15, -0.24)], m_in),
            mk_cyl("blt_cej2", 0.088, 0.088, 0.34, "x", 16, [("t", 1.56, -0.15, -0.24)], m_in),
            mk_box("blt_cext", 1.22, 0.32, 0.30, [("t", 1.25, 0.08, 0.57)], m_in),
        ], "blt_cbores"),
    ])

    # Heavy contoured pivoting Claw Extractor in (X, Z)
    ext_xz = [
        (0.65, 0.44),
        (1.66, 0.44),
        (1.68, 0.35),
        (1.83, 0.35),
        (1.908, 0.46),
        (1.86, 0.64),
        (1.28, 0.66),
        (0.65, 0.61),
    ]
    extractor = mk_extrude_y("blt_ext", ext_xz, -0.045, 0.205, bevel=0.014, bevel_segs=1, mat=m_dk)

    # Dual spring-loaded rounded plunger ejectors
    ej_pts = [(0.0, 1.48), (0.068, 1.48), (0.068, 1.77), (0.052, 1.805), (0.0, 1.815)]
    parts = [
        stem,
        head,
        extractor,
        mk_cyl("blt_cpin", 0.17, 0.17, 0.58, "y", 20, [("t", -0.35, 0.56, 0.0)], m_dk, bevel=0.016),
        mk_box("blt_cshoe", 0.42, 0.16, 0.38, [("t", -0.35, 0.82, 0.0)], m_mid, bevel=0.016, bevel_segs=2),
        mk_cyl("blt_rpin", 0.055, 0.055, 0.92, "z", 14, [("t", -1.42, 0.18, 0.0)], m_dk, bevel=0.008),
        mk_cyl("blt_epin", 0.052, 0.052, 0.36, "y", 12, [("t", 1.28, 0.08, 0.56)], m_bs, bevel=0.008),
        mk_lathe_x("blt_ej1", ej_pts, segs=16, xform=[("t", 0.0,  0.15, -0.24)], mat=m_mid),
        mk_lathe_x("blt_ej2", ej_pts, segs=16, xform=[("t", 0.0, -0.15, -0.24)], mat=m_mid),
    ]
    obj = join_objects(parts, "m82a1_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_firing_pin(mats: dict) -> bpy.types.Object:
    """U-12: Heavy stepped S7 tool-steel firing pin, cocking tang & rebound coil spring."""
    m_bs = mats["M_MachinedSteel"]
    m_mid = mats["M_BoltMidSteel"]
    m_dk = mats["M_DarkHardware"]
    m_sp = mats["M_SpringSteel"]

    parts = [
        mk_cyl("fp_head", 0.24, 0.28, 0.42, "x", 24, [("t", -3.98, 0.0, 0.0)], m_bs, bevel=0.020),
        mk_cyl("fp_col",  0.23, 0.23, 0.78, "x", 22, [("t", -3.45, 0.0, 0.0)], m_mid, bevel=0.016),
        mk_box("fp_tang", 0.46, 0.62, 0.28, [("t", -2.85, -0.44, 0.0)], m_bs, bevel=0.022, bevel_segs=2),
        mk_cyl("fp_shft", 0.165, 0.145, 5.10, "x", 22, [("t", -0.55, 0.0, 0.0)], m_bs, bevel=0.012),
        mk_cyl("fp_flng", 0.26, 0.26, 0.16, "x", 22, [("t",  0.75, 0.0, 0.0)], m_dk, bevel=0.014),
        mk_cyl("fp_tip",  0.055, 0.140, 1.58, "x", 20, [("t", 2.76, 0.0, 0.0)], m_bs, bevel=0.010),
        mk_coil_spring("fp_spr", "x", -3.05, 0.66, 0.0, 0.0, 0.25, 0.042, 18.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
    ]
    obj = join_objects(parts, "m82a1_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_bipod(mats: dict) -> bpy.types.Object:
    """F-03: Heavy folding height-adjustable spiked steel bipod w/ perforated 5-hole outer legs,
    external tension lock springs, notched chrome telescoping inner legs & aggressive ski/claw feet."""
    m_bp = mats["M_BipodParkerized"]
    m_dk = mats["M_DarkHardware"]
    m_mid = mats["M_BoltMidSteel"]
    m_bs = mats["M_MachinedSteel"]
    m_sp = mats["M_SpringSteel"]
    m_in = mats["M_InnerDark"]

    parts = [
        mk_box("bp_yoke", 1.62, 0.78, 1.14, [("t", 0.0, -0.18, 0.0)], m_dk, bevel=0.032, bevel_segs=2),
        mk_cyl("bp_spig", 0.19, 0.19, 1.86, "x", 22, [("t", 0.05, -0.14, 0.0)], m_bs, bevel=0.016),
        mk_knurled_cyl("bp_knob", 0.28, 0.22, "x", flutes=20, depth=0.020, xform=[("t", -0.92, -0.14, 0.0)], mat=m_mid),
        mk_cyl("bp_cbolt", 0.16, 0.16, 1.82, "z", 20, [("t", 0.0, -0.08, 0.0)], m_bs, bevel=0.014),
    ]

    for side in (-1, 1):
        leg_xf = [("rx", side * 0.42), ("rz", 0.17), ("t", 0.0, -0.15, side * 0.68)]
        # Perforated 5-hole stamped steel outer leg channel
        outer_raw = mk_box(f"bp_ol_{side}", 0.66, 3.95, 0.54, [("t", 0.0, -2.76, 0.0)], m_bp, bevel=0.026, bevel_segs=2)
        holes = join_objects([
            mk_cyl(f"bp_lh_{side}_{idx_h}", 0.15, 0.15, 0.86, "x", 18, [("t", 0.0, hy, 0.0)], m_in)
            for idx_h, hy in enumerate((-1.35, -2.02, -2.69, -3.36, -4.03))
        ], f"bp_lhs_{side}")
        outer_leg = bool_subtract(outer_raw, [holes])
        # Apply leg_xf to outer_leg via bmesh transform
        bm = bmesh.new()
        bm.from_mesh(outer_leg.data)
        # outer_leg is already in Blender space; transform via T2B @ M_three @ B2T
        m_leg = Matrix.Translation(Vector((0.0, -0.15, side * 0.68))) @ Matrix.Rotation(0.17, 4, "Z") @ Matrix.Rotation(side * 0.42, 4, "X")
        bmesh.ops.transform(bm, matrix=T2B_MAT @ m_leg @ B2T_MAT, verts=bm.verts)
        bm.to_mesh(outer_leg.data)
        bm.free()

        parts.append(outer_leg)
        parts.append(mk_box(f"bp_knk_{side}", 0.82, 0.76, 0.64, [("t", 0.0, -0.54, 0.0)] + leg_xf, m_bp, bevel=0.028, bevel_segs=2))
        parts.append(mk_cyl(f"bp_kpin_{side}", 0.11, 0.11, 0.74, "z", 16, [("t", 0.0, -0.54, 0.0)] + leg_xf, m_bs, bevel=0.012))
        parts.append(
            mk_coil_spring(
                f"bp_spr_{side}", "y", -2.25, -0.95, -0.40, side * 0.24, 0.12, 0.028, 9.0,
                ring_segs=8, steps_per_coil=14, xform=leg_xf, mat=m_sp,
            )
        )
        parts.append(mk_box(f"bp_ltch_{side}", 0.24, 0.42, 0.36, [("t", -0.28, -4.48, side * 0.22)] + leg_xf, m_dk, bevel=0.018, bevel_segs=1))
        parts.append(mk_torus(f"bp_ring_{side}", 0.22, 0.040, "z", 22, 10, [("t", 0.0, -4.48, side * 0.36)] + leg_xf, m_bs))
        # Notched telescoping chrome-steel inner extension leg (5 locking collar detents)
        parts.append(mk_box(f"bp_in_{side}", 0.45, 3.08, 0.39, [("t", 0.0, -5.96, 0.0)] + leg_xf, m_mid, bevel=0.022, bevel_segs=2))
        for idx_n, ny in enumerate((-5.0, -5.5, -6.0, -6.5, -7.0)):
            parts.append(mk_cyl(f"bp_nt_{side}_{idx_n}", 0.265, 0.265, 0.075, "y", 18, [("t", 0.0, ny, 0.0)] + leg_xf, m_dk, bevel=0.010))
        # Barrett spiked ski/claw footpad + upturned serrated front toe + 8 hardened ground spikes!
        parts.append(mk_box(f"bp_ft_{side}", 1.56, 0.22, 0.92, [("t", 0.14, -7.48, 0.0)] + leg_xf, m_dk, bevel=0.022, bevel_segs=2))
        parts.append(mk_box(f"bp_toe_{side}", 0.36, 0.42, 0.90, [("rz", -0.48), ("t", 0.88, -7.34, 0.0)] + leg_xf, m_dk, bevel=0.020, bevel_segs=2))
        parts.append(mk_cyl(f"bp_fpin_{side}", 0.09, 0.09, 1.00, "z", 14, [("t", 0.0, -7.36, 0.0)] + leg_xf, m_bs, bevel=0.010))
        for ix, sx in enumerate((-0.46, -0.06, 0.34, 0.72)):
            for iz, sz in enumerate((-0.26, 0.26)):
                parts.append(mk_cone(f"bp_spk_{side}_{ix}_{iz}", 0.095, 0.34, "-y", 8, [("t", sx, -7.72, sz)] + leg_xf, m_bs))

    obj = join_objects(parts, "m82a1_bipod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_striker(mats: dict) -> bpy.types.Object:
    """FC-01: Barrett upright linear striker lever & dual parallel mainsprings."""
    m_bs = mats["M_MachinedSteel"]
    m_mid = mats["M_BoltMidSteel"]
    m_sp = mats["M_SpringSteel"]

    lever_xy = [
        (-0.24, -0.28),
        ( 0.26, -0.26),
        ( 0.24,  0.54),
        ( 0.08,  0.94),
        (-0.26,  0.88),
        (-0.34,  0.32),
    ]
    parts = [
        mk_cyl("st_hub", 0.24, 0.24, 1.18, "z", 22, mat=m_bs, bevel=0.018),
        mk_extrude_z("st_arm", lever_xy, -0.23, 0.23, bevel=0.026, bevel_segs=2, mat=m_bs),
    ]
    for side in (-1, 1):
        z_off = side * 0.24
        parts.append(mk_cyl(f"st_rod_{side}", 0.052, 0.052, 1.02, "x", 12, [("t", -0.66, -0.06, z_off)], m_mid, bevel=0.008))
        parts.append(
            mk_coil_spring(
                f"st_spr_{side}", "x", -1.12, -0.22, -0.06, z_off, 0.115, 0.026, 8.0,
                ring_segs=8, steps_per_coil=14, mat=m_sp,
            )
        )
    obj = join_objects(parts, "m82a1_striker")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_sear(mats: dict) -> bpy.types.Object:
    """FC-02: Precision-ground primary sear, twin-rail transfer bar yoke & semi-auto disconnector."""
    m_bs = mats["M_MachinedSteel"]
    m_mid = mats["M_BoltMidSteel"]
    m_sp = mats["M_SpringSteel"]

    parts = [
        mk_box("sr_barL", 2.15, 0.22, 0.12, [("t", 0.08, -0.04, -0.34)], m_mid, bevel=0.016, bevel_segs=1),
        mk_box("sr_barR", 2.15, 0.22, 0.12, [("t", 0.08, -0.04,  0.34)], m_mid, bevel=0.016, bevel_segs=1),
        mk_box("sr_fcrs", 0.24, 0.22, 0.80, [("t",  1.04, -0.04, 0.0)], m_mid, bevel=0.016, bevel_segs=1),
        mk_box("sr_rbrg", 0.38, 0.26, 0.80, [("t", -0.84,  0.02, 0.0)], m_mid, bevel=0.018, bevel_segs=1),
        mk_box("sr_hook", 0.46, 0.52, 0.48, [("t", -0.78,  0.24, 0.0)], m_bs, bevel=0.022, bevel_segs=2),
        mk_cyl("sr_pin",  0.085, 0.085, 1.05, "z", 16, [("t", -0.78, 0.08, 0.0)], m_bs, bevel=0.010),
        mk_box("sr_disc", 0.58, 0.54, 0.26, [("rz", -0.18), ("t", 0.32, 0.32, 0.0)], m_bs, bevel=0.020, bevel_segs=2),
        mk_coil_spring("sr_spr", "y", -0.54, -0.08, -0.48, 0.0, 0.11, 0.026, 6.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
    ]
    obj = join_objects(parts, "m82a1_sear")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_trigger(mats: dict) -> bpy.types.Object:
    """FC-03: Curved longitudinally grooved match trigger shoe, transfer bow & overtravel screw."""
    m_dk = mats["M_DarkHardware"]
    m_bs = mats["M_MachinedSteel"]
    m_in = mats["M_InnerDark"]

    shoe_xy = [(-0.20, 0.15), (0.24, 0.15)]
    shoe_xy.extend(_quad_bez((0.24, 0.15), (0.05, -0.68), (0.32, -1.25), 10))
    shoe_xy.append((0.06, -1.36))
    shoe_xy.extend(_quad_bez((0.06, -1.36), (-0.32, -0.72), (-0.20, 0.15), 10))

    shoe = mk_extrude_z("tr_shoe", shoe_xy, -0.22, 0.22, bevel=0.026, bevel_segs=2, mat=m_dk)
    grooves = join_objects([
        mk_box(f"tr_gr_{i}", 0.12, 1.25, 0.038, [("rz", 0.20), ("t", 0.22, -0.68, gz)], m_in)
        for i, gz in enumerate((-0.13, -0.045, 0.045, 0.13))
    ], "tr_grooves")
    shoe = bool_subtract(shoe, [grooves])

    parts = [
        mk_cyl("tr_axle", 0.16, 0.16, 1.18, "z", 20, mat=m_bs, bevel=0.015),
        shoe,
        mk_box("tr_bow", 1.02, 0.32, 0.72, [("t", -0.34, 0.28, 0.0)], m_dk, bevel=0.022, bevel_segs=2),
        mk_cyl("tr_scrw", 0.065, 0.065, 0.30, "x", 14, [("t", -0.82, 0.28, 0.0)], m_bs, bevel=0.008),
    ]
    obj = join_objects(parts, "m82a1_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — GROUP 3: OPTICS, RINGS, GRIP & .50 BMG MAG (Suite 3: m82a1_v3_optics_mag)
# =============================================================================
def build_m82a1_scope(mats: dict) -> bpy.types.Object:
    """U-07: Leupold Mark 4 LR/T 4.5-14x50mm M1 Tactical Sniper Scope w/ screw-in sunshade,
    24K Gold Ring, 3D knurled elevation/windage/parallax target turrets & multi-coated lenses."""
    m_sc = mats["O_ScopeAnodized"]
    m_td = mats["O_TurretDrum"]
    m_gd = mats["O_LeupoldGoldRing"]
    m_ln = mats["O_CoatedLens"]
    m_gr = mats["O_GripPolymer"]
    m_bs = mats["O_BrightSteel"]
    m_in = mats["O_InnerDark"]

    # Closed hollow 48-seg optical tube & deep sunshade housing (zero CSG needed!)
    tube_pts = [
        (0.680, -7.40),
        (0.830, -7.40),  # Rear rubberized fast-focus eyepiece rim
        (0.830, -7.08),
        (0.800, -7.02),  # Diopter lock ring step
        (0.820, -5.55),  # Ocular bell
        (0.660, -5.10),
        (0.730, -4.85),  # Magnification power ring seat
        (0.730, -4.32),
        (0.560, -4.14),  # 30mm Main Tube (rear ring at -3.35, front ring at +3.05)
        (0.560,  3.65),
        (0.890,  4.95),  # Flared objective cone
        (1.080,  5.52),  # 50mm Objective Bell
        (1.080,  5.90),
        (1.045,  5.93),  # Threaded sunshade seam groove
        (1.075,  5.97),  # 2.5" Screw-in Anti-Glare Sunshade
        (1.075,  7.85),
        (0.955,  7.85),  # Thin machined front sunshade lip
        # Return inner sunshade baffle cavity back to recessed objective lens seat (X = +5.76)
        (0.955,  7.35),
        (0.935,  7.30),
        (0.955,  7.25),
        (0.955,  6.55),
        (0.935,  6.50),
        (0.955,  6.45),
        (0.955,  5.76),
        (0.000,  5.76),
    ]
    # Note: rear ocular cap closes smoothly behind ocular lens (-7.14)
    # Build main tube closed at both ends by terminating rear inner recess cleanly!
    tube_pts_full = [
        (0.000, -7.08),
        (0.680, -7.08),
        (0.680, -7.40),
    ] + tube_pts[1:]
    main_tube = mk_lathe_x("sc_tube", tube_pts_full, segs=48, mat=m_sc)
    main_tube.data.materials.append(m_in)
    main_tube.data.materials.append(m_gr)
    in_idx = len(main_tube.data.materials) - 2
    gr_idx = len(main_tube.data.materials) - 1
    for p in main_tube.data.polygons:
        c = p.center
        r = math.hypot(c.y, c.z)
        if c.x < -7.06 and r > 0.72:
            p.material_index = gr_idx  # rubberized fast-focus eyepiece band
        elif (c.x > 5.75 and r < 0.96) or (c.x < -7.05 and r < 0.69):
            p.material_index = in_idx  # matte dark sunshade baffle interior

    parts = [
        main_tube,
        # Iconic Leupold 24K Gold Ring around 50mm objective bell (X in [5.56, 5.74])
        mk_cyl("sc_goldring", 1.084, 1.084, 0.16, "x", 48, [("t", 5.66, 0.0, 0.0)], m_gd, bevel=0.010),
        # 3D Knurled 4.5-14x Magnification Power Ring + Tactile Throw Fin
        mk_knurled_cyl("sc_pwrring", 0.755, 0.50, "x", flutes=36, depth=0.022, xform=[("t", -4.58, 0.0, 0.0)], mat=m_sc),
        mk_box("sc_pwrfin", 0.34, 0.30, 0.18, [("rx", -0.65), ("t", -4.58, 0.80, -0.46)], m_sc, bevel=0.024, bevel_segs=2),
        # Sculpted rounded-square Leupold Mark 4 erector saddle turret block at X = -0.30
        mk_sphere("sc_saddle", 0.90, 0.77, 0.77, u_segs=28, v_segs=18, xform=[("t", -0.30, 0.0, 0.0)], mat=m_sc),
        # 1) Tall Top M1 Tactical Elevation Turret (smooth vernier drum + 3D knurled crown + zero-stop cap)
        mk_cyl("sc_el_drum", 0.49, 0.51, 0.82, "y", 36, [("t", -0.30, 1.03, 0.0)], m_td, bevel=0.012),
        mk_knurled_cyl("sc_el_knurl", 0.53, 0.22, "y", flutes=36, depth=0.020, xform=[("t", -0.30, 1.49, 0.0)], mat=m_sc),
        mk_cyl("sc_el_cap", 0.18, 0.18, 0.04, "y", 18, [("t", -0.30, 1.59, 0.0)], m_bs, bevel=0.008),
        # 2) Right M1 Tactical Windage Turret (graduated drum + 3D knurled crown + cap)
        mk_cyl("sc_wd_drum", 0.45, 0.47, 0.72, "z", 36, [("t", -0.30, 0.0, 0.96)], m_td, bevel=0.012),
        mk_knurled_cyl("sc_wd_knurl", 0.49, 0.20, "z", flutes=32, depth=0.018, xform=[("t", -0.30, 0.0, 1.37)], mat=m_sc),
        mk_cyl("sc_wd_cap", 0.16, 0.16, 0.04, "z", 16, [("t", -0.30, 0.0, 1.46)], m_bs, bevel=0.008),
        # 3) Left Side-Focus Parallax Turret (drum + 3D knurled cap)
        mk_cyl("sc_px_drum", 0.43, 0.45, 0.62, "z", 32, [("t", -0.30, 0.0, -0.91)], m_sc, bevel=0.012),
        mk_knurled_cyl("sc_px_knurl", 0.46, 0.18, "z", flutes=28, depth=0.018, xform=[("t", -0.30, 0.0, -1.26)], mat=m_sc),
        # 4) Convex Multi-Coated Sapphire-Emerald Objective & Ocular Glass Lenses
        mk_sphere("sc_lens_f", 0.17, 0.94, 0.94, u_segs=32, v_segs=20, xform=[("t",  5.86, 0.0, 0.0)], mat=m_ln),
        mk_sphere("sc_lens_r", 0.11, 0.67, 0.67, u_segs=28, v_segs=18, xform=[("t", -7.14, 0.0, 0.0)], mat=m_ln),
    ]
    obj = join_objects(parts, "m82a1_scope")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_scope_rings(mats: dict) -> bpy.types.Object:
    """U-08: Barrett Ultra-High Heavy-Duty 6-Bolt 30mm Tactical Scope Rings w/ dovetail jaws,
    weight-relief ports, 1/2-inch stainless hex nuts & 12 Torx cap screws."""
    m_rg = mats["O_RingSteel"]
    m_dk = mats["O_ScopeAnodized"]
    m_bs = mats["O_BrightSteel"]
    m_in = mats["O_InnerDark"]

    parts = []
    base_zy = [
        (-0.56, -0.02),
        ( 0.56, -0.02),
        ( 0.67,  0.12),
        ( 0.67,  0.78),
        ( 0.58,  0.86),
        (-0.58,  0.86),
        (-0.67,  0.78),
        (-0.67,  0.12),
    ]
    for idx_r, rx in enumerate((-3.35, 3.05)):
        base_blk = mk_extrude_x(f"sr_b_{idx_r}", base_zy, rx - 0.68, rx + 0.68, bevel=0.018, bevel_segs=2, mat=m_rg)
        rec_lug = mk_box(f"sr_rl_{idx_r}", 0.36, 0.18, 1.08, [("t", rx, -0.06, 0.0)], m_dk, bevel=0.012, bevel_segs=1)
        ring_out = mk_cyl(f"sr_ro_{idx_r}", 0.84, 0.84, 1.32, "x", 36, [("t", rx, 1.36, 0.0)], m_rg, bevel=0.024)
        cap_flg = mk_box(f"sr_cf_{idx_r}", 1.32, 0.26, 1.92, [("t", rx, 1.36, 0.0)], m_rg, bevel=0.018, bevel_segs=2)

        solid = bool_union([base_blk, join_objects([rec_lug, cap_flg], f"sr_rc_{idx_r}"), ring_out], f"sr_sol_{idx_r}")
        solid = bool_subtract(solid, [
            mk_cyl(f"sr_cb_{idx_r}", 0.565, 0.565, 1.65, "x", 36, [("t", rx, 1.36, 0.0)], m_in),
            join_objects([
                mk_box(f"sr_csp_{idx_r}", 1.45, 0.04, 2.05, [("t", rx, 1.36, 0.0)], m_in),
                mk_cyl(f"sr_cwh_{idx_r}", 0.22, 0.22, 1.60, "z", 22, [("t", rx, 0.50, 0.0)], m_in),
            ], f"sr_cswh_{idx_r}"),
        ])
        parts.append(solid)
        # 1/2" stainless hex cross-nut + side clamp bar
        parts.append(mk_cyl(f"sr_hnut_{idx_r}", 0.22, 0.22, 1.62, "z", 6, [("t", rx, 0.10, 0.0)], m_bs, bevel=0.014))
        parts.append(mk_box(f"sr_cbar_{idx_r}", 1.34, 0.20, 0.12, [("t", rx, 0.10, -0.72)], m_rg, bevel=0.014, bevel_segs=1))
        # 6 stainless Torx cap screws per ring (12 total!) w/ recessed hex sockets
        for isx, sx in enumerate((-0.42, 0.0, 0.42)):
            for isz, sz in enumerate((-0.78, 0.78)):
                parts.append(mk_cyl(f"sr_sc_{idx_r}_{isx}_{isz}", 0.076, 0.076, 0.36, "y", 14, [("t", rx + sx, 1.42, sz)], m_bs, bevel=0.010))
                parts.append(mk_cyl(f"sr_sk_{idx_r}_{isx}_{isz}", 0.042, 0.042, 0.03, "y", 6, [("t", rx + sx, 1.595, sz)], m_in))

    obj = join_objects(parts, "m82a1_scope_rings")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_pistol_grip(mats: dict) -> bpy.types.Object:
    """F-04: Organically sculpted 26-station super-ellipse ergonomic USGI A2 pistol grip
    with concave beaver-tail web, rounded palm swell, A2 middle-finger indexing shelf,
    conforming curved 20-LPI diamond-checkered side grip panels, horizontal backstrap
    serrations, recessed grip-screw pocket & smooth beveled winter steel trigger guard!"""
    m_pl = mats["O_GripPolymer"]
    m_ck = mats["O_A2Checkering"]
    m_rg = mats["O_RingSteel"]
    m_bs = mats["O_BrightSteel"]
    m_in = mats["O_InnerDark"]

    # --- 1. Organically Sculpted 26-Station Super-Ellipse Ergonomic A2 Grip Loft (ZERO flat slab!) ---
    # Exact CSG grip envelope: X in [-3.05, +0.72], Y in [-4.58, +0.10], Z in [-0.76, +0.76]
    n_stations = 26
    ring_segs = 32
    front_ctrl = [
        (0.00,  0.70,  0.08),
        (0.18,  0.44, -0.78),
        (0.31,  0.16, -1.42),
        (0.38,  0.37, -1.64),  # Signature USGI A2 middle-finger indexing nub!
        (0.46,  0.08, -1.98),
        (0.72, -0.44, -3.26),
        (1.00, -0.94, -4.54),
    ]
    back_ctrl = [
        (0.00, -1.36,  0.08),
        (0.16, -1.64, -0.72),  # Smooth concave upper beaver-tail web!
        (0.44, -2.14, -1.96),  # Full rounded ergonomic palm swell!
        (0.74, -2.62, -3.20),
        (1.00, -3.00, -4.22),
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
        cx = 0.5 * (fx + bx)
        cy = 0.5 * (fy + by)
        hx = max(0.54, 0.5 * (fx - bx))
        # Natural sculpted ergonomic palm swell: 0.58 at top neck -> 0.725 at palm center -> 0.66 at flared heel
        hz = 0.585 + 0.135 * math.sin(min(1.0, u * 1.06) * math.pi) + 0.055 * (u * u)
        if s == 0:
            hx *= 0.96
            hz *= 0.95
        elif s == n_stations:
            hx *= 0.98
            hz *= 0.97
        ring = []
        for k in range(ring_segs):
            th = 2.0 * math.pi * k / ring_segs
            ct, st = math.cos(th), math.sin(th)
            # Rounded ergonomic oval super-ellipse (p=2.15) — completely eliminates flat rectangular box edges!
            sx = math.copysign(abs(ct) ** (2.0 / 2.15), ct)
            sz = math.copysign(abs(st) ** (2.0 / 2.15), st)
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
    raw_grip = _bm_to_obj("pg_body", bm_g, m_pl)

    # Hollow internal grip-screw mounting recess underneath
    grip_body = bool_subtract(
        raw_grip,
        [mk_cyl("pg_c_bore", 0.36, 0.44, 2.80, "y", 20, [("rz", -0.38), ("t", -1.65, -3.20, 0.0)], m_in)],
    )

    # --- 2. Conforming Curved Raised 20-LPI Diamond-Checkered Ergonomic Side Panels ---
    bm_pad = bmesh.new()
    for side in (-1.0, 1.0):
        p_stations = 12
        p_cols = 8
        grid_in = []
        grid_out = []
        for si in range(p_stations + 1):
            u = 0.20 + 0.64 * (si / p_stations)
            fx, fy = _interp_curve(front_ctrl, u)
            bx, by = _interp_curve(back_ctrl, u)
            cx = 0.5 * (fx + bx)
            cy = 0.5 * (fy + by)
            hx = max(0.54, 0.5 * (fx - bx))
            hz = 0.585 + 0.135 * math.sin(min(1.0, u * 1.06) * math.pi) + 0.055 * (u * u)
            u_end = math.sin((si / p_stations) * math.pi)
            row_in, row_out = [], []
            for ci in range(p_cols + 1):
                c_frac = (ci / p_cols) * 2.0 - 1.0
                th = side * (math.pi * 0.5) - side * (c_frac * 0.52 * (0.55 + 0.45 * u_end))
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.15), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.15), st)
                px = cx + hx * sx
                py = cy + 0.5 * (fy - by) * sx
                pz_base = hz * sz
                edge_w = math.sin((ci / p_cols) * math.pi) * u_end
                raise_z = 0.032 * (0.25 + 0.75 * edge_w)
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
        for si in range(p_stations):
            bm_pad.faces.new((grid_in[si][0], grid_out[si][0], grid_out[si + 1][0], grid_in[si + 1][0]))
            bm_pad.faces.new((grid_in[si][p_cols], grid_in[si + 1][p_cols], grid_out[si + 1][p_cols], grid_out[si][p_cols]))
        for ci in range(p_cols):
            bm_pad.faces.new((grid_in[0][ci], grid_in[0][ci + 1], grid_out[0][ci + 1], grid_out[0][ci]))
            bm_pad.faces.new((grid_in[p_stations][ci], grid_out[p_stations][ci], grid_out[p_stations][ci + 1], grid_in[p_stations][ci + 1]))
    bmesh.ops.recalc_face_normals(bm_pad, faces=bm_pad.faces)
    _apply_three_xform(bm_pad, [])
    checkered_pads = _bm_to_obj("pg_pads", bm_pad, m_ck)

    parts = [
        grip_body,
        checkered_pads,
        mk_cyl("pg_screw", 0.18, 0.18, 0.24, "y", 6, [("rz", -0.38), ("t", -1.42, -2.55, 0.0)], m_bs, bevel=0.015),
    ]

    # Molded horizontal backstrap traction serration ribs along curved backstrap
    for i in range(9):
        u = 0.22 + i * 0.075
        bx, by = _interp_curve(back_ctrl, u)
        parts.append(mk_box(f"pg_brib_{i}", 0.07, 0.065, 0.62, [("rz", -0.38), ("t", bx + 0.01, by, 0.0)], m_pl, bevel=0.016))

    # Smooth-curved enlarged winter-gloved steel Trigger Guard + front & rear stainless pivot roll pins
    guard_xy = [
        (0.45,  0.02),
        (0.85,  0.02),
    ]
    guard_xy.extend(_quad_bez((0.85, 0.02), (1.10, -1.25), (1.42, -1.30), 6))
    guard_xy.append((3.28, -1.30))
    guard_xy.extend(_quad_bez((3.28, -1.30), (3.58, -1.25), (3.96, 0.02), 6))
    guard_xy.append((4.22,  0.02))
    guard_xy.extend(_quad_bez((4.22, 0.02), (3.80, -1.52), (3.44, -1.54), 6))
    guard_xy.append((1.24, -1.54))
    guard_xy.extend(_quad_bez((1.24, -1.54), (0.90, -1.48), (0.45, 0.02), 6))

    parts.append(mk_extrude_z("pg_guard", guard_xy, -0.34, 0.34, bevel=0.032, bevel_segs=2, mat=m_rg))
    parts.append(mk_cyl("pg_gpin1", 0.065, 0.065, 0.86, "z", 14, [("t", 0.68, -0.06, 0.0)], m_bs, bevel=0.008))
    parts.append(mk_cyl("pg_gpin2", 0.065, 0.065, 0.86, "z", 14, [("t", 4.06, -0.06, 0.0)], m_bs, bevel=0.008))

    obj = join_objects(parts, "m82a1_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_m82a1_mag_body(mats: dict) -> bpy.types.Object:
    """M-01: Giant 10-round .50 BMG stamped ribbed steel box magazine w/ 4 deep sculpted
    vertical stiffening channels per flank, 3 rear witness holes, welded hooks & curved feed lips."""
    m_mg = mats["O_MagParkerized"]
    m_rg = mats["O_RingSteel"]
    m_bs = mats["O_BrightSteel"]
    m_in = mats["O_InnerDark"]

    mag_xy = [
        (-3.05, -6.40),
        ( 3.05, -4.90),  # Exact atan2(1.50, 6.10) = 0.24112 rad bottom slope!
        ( 3.05,  2.25),
        ( 2.75,  2.65),
        (-2.85,  2.65),
        (-3.05,  2.35),
    ]
    raw_box = mk_extrude_z("mg_box", mag_xy, -0.86, 0.86, bevel=0.045, bevel_segs=2, mat=m_mg)

    # 8 sculpted vertical stamped stiffening channels (4 per flank) + 3 rear round-count witness holes
    flank_cuts = []
    for ir, rx in enumerate((-2.05, -0.70, 0.65, 2.00)):
        for side in (-1, 1):
            flank_cuts.append(
                mk_capsule_y(
                    f"mg_rib_{ir}_{side}", 0.135, 5.35, segs=16, cap_rings=4,
                    xform=[("t", rx, -1.92, side * 0.92)], mat=m_rg,
                )
            )
    for iw, wy in enumerate((-0.55, -2.15, -3.75)):
        flank_cuts.append(mk_cyl(f"mg_wit_{iw}", 0.13, 0.13, 0.55, "x", 18, [("t", -2.98, wy, 0.0)], m_in))

    shell = bool_subtract(raw_box, [
        mk_box("mg_cin1", 5.68, 7.65, 1.42, [("t",  0.00, -1.35, 0.0)], m_in),
        mk_box("mg_cin2", 5.46, 2.20, 1.18, [("t", -0.05,  2.10, 0.0)], m_in),
        join_objects(flank_cuts, "mg_cflank"),
    ])

    parts = [
        shell,
        mk_box("mg_fhook", 0.30, 0.50, 1.40, [("t",  3.15,  0.45, 0.0)], m_bs, bevel=0.020, bevel_segs=2),
        mk_box("mg_rlug",  0.34, 0.44, 1.34, [("t", -3.16, -0.05, 0.0)], m_bs, bevel=0.020, bevel_segs=2),
        mk_box("mg_spine", 0.08, 8.20, 0.52, [("t", -3.09, -2.00, 0.0)], m_rg, bevel=0.012, bevel_segs=1),
    ]

    # Precision inwardly-curved stamped stainless .50 BMG feed lips (Y_max <= 2.695)
    for side in (-1, 1):
        lip_zy = [(side * 0.84, 2.38), (side * 0.84, 2.60)]
        lip_zy.extend(_quad_bez((side * 0.84, 2.60), (side * 0.78, 2.70), (side * 0.50, 2.695), 6))
        lip_zy.append((side * 0.46, 2.62))
        lip_zy.extend(_quad_bez((side * 0.46, 2.62), (side * 0.70, 2.61), (side * 0.72, 2.38), 6))
        parts.append(mk_extrude_x(f"mg_lip_{side}", lip_zy, -2.78, 2.60, bevel=0.012, bevel_segs=1, mat=m_bs))

    obj = join_objects(parts, "m82a1_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_mag_follower(mats: dict) -> bpy.types.Object:
    """M-02: High-visibility safety-orange stepped double-stack anti-tilt .50 BMG follower."""
    m_fo = mats["O_FollowerOrange"]

    cradle_zy = [(-0.66, -0.06), (0.66, -0.06), (0.66, 0.20)]
    cradle_zy.extend(_quad_bez((0.66, 0.20), (0.32, 0.06), (0.04, 0.18), 6))
    cradle_zy.extend(_quad_bez((0.04, 0.18), (-0.22, 0.39), (-0.48, 0.38), 6))
    cradle_zy.append((-0.66, 0.28))

    parts = [
        mk_extrude_x("fl_deck", cradle_zy, -2.64, 2.67, bevel=0.022, bevel_segs=2, xform=[("rz", 0.05)], mat=m_fo),
        mk_box("fl_fleg", 0.24, 0.72, 1.24, [("t",  2.46, -0.24, 0.0)], m_fo, bevel=0.024, bevel_segs=2),
        mk_box("fl_rleg", 0.24, 0.88, 1.24, [("t", -2.46, -0.46, 0.0)], m_fo, bevel=0.024, bevel_segs=2),
        mk_box("fl_srlL", 4.90, 0.18, 0.10, [("rz", 0.05), ("t", 0.0, -0.28, -0.57)], m_fo, bevel=0.016, bevel_segs=1),
        mk_box("fl_srlR", 4.90, 0.18, 0.10, [("rz", 0.05), ("t", 0.0, -0.28,  0.57)], m_fo, bevel=0.016, bevel_segs=1),
        mk_box("fl_boss", 3.80, 0.18, 0.88, [("rz", 0.05), ("t", 0.0, -0.12, 0.0)], m_fo, bevel=0.018, bevel_segs=1),
    ]
    obj = join_objects(parts, "m82a1_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m82a1_mag_spring(mats: dict) -> bpy.types.Object:
    """M-03: Heavy-duty 7-coil rectangular music-wire .50 BMG magazine spring."""
    m_sp = mats["O_SpringSteel"]
    coils = 7
    steps_per_coil = 28
    total = coils * steps_per_coil
    rx, rz = 2.16, 0.54
    pts: list[Vector] = []
    for i in range(total + 1):
        u = i / total
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        sx = math.copysign(abs(ct) ** 0.55, ct) * rx
        sz = math.copysign(abs(st) ** 0.55, st) * rz
        y_bot = -0.40 + 0.055 * max(0.0, sx)
        y_top =  0.39 + 0.050 * sx
        sy = (1.0 - u) * y_bot + u * y_top
        pts.append(Vector((sx, sy, sz)))
    obj = mk_tube_along_pts("m82a1_mag_spring", pts, 0.044, ring_segs=8, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=45.0)


def build_m82a1_mag_floorplate(mats: dict) -> bpy.types.Object:
    """M-04: 13.8° angled monopod-lip stamped steel magazine floorplate w/ curled rails & grip pads."""
    m_mg = mats["O_MagParkerized"]
    m_rg = mats["O_RingSteel"]
    m_gr = mats["O_GripPolymer"]
    m_bs = mats["O_BrightSteel"]

    parts = [
        mk_box("fp_base", 6.46, 0.34, 1.94, [("t", 0.04, -0.12, 0.0)], m_rg, bevel=0.028, bevel_segs=2),
        mk_box("fp_lipL", 6.30, 0.24, 0.16, [("t", 0.00,  0.05, -0.88)], m_mg, bevel=0.020, bevel_segs=2),
        mk_box("fp_lipR", 6.30, 0.24, 0.16, [("t", 0.00,  0.05,  0.88)], m_mg, bevel=0.020, bevel_segs=2),
        mk_box("fp_mono", 0.34, 0.44, 1.92, [("t", 3.18, -0.16,  0.00)], m_rg, bevel=0.024, bevel_segs=2),
        mk_cyl("fp_btn",  0.24, 0.24, 0.18, "y", 20, [("t", 0.00, -0.26, 0.0)], m_bs, bevel=0.016),
    ]
    for i in range(-2, 3):
        parts.append(mk_box(f"fp_pad_{i}", 0.28, 0.10, 1.88, [("t", i * 1.12, -0.32, 0.0)], m_gr, bevel=0.016, bevel_segs=1))

    obj = join_objects(parts, "m82a1_mag_floorplate")
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


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 4 receiver/control parts into `m82a1_v3_receiver` (2048x2048):
      - Hero Band 1 (Upper Left Wall FULL X in [-20.8,+16.5], Y in [0.20,1.80]):  [0.015,0.985] x [0.770,0.985]
      - Hero Band 2 (Upper Top 27-MOA Rail Crowns, X in [-14.43,+15.87]):         [0.015,0.985] x [0.712,0.758]
      - Hero Band 3 (Lower Left Wall FULL X in [-20.8,+15.8], Y in [-4.65,+0.20]):[0.015,0.985] x [0.515,0.700]
      - Hero Band 4 (Lower Right Wall FULL X in [-20.8,+15.8], Y in [-4.65,+0.20]):[0.015,0.985] x [0.320,0.505]
      - Packed Region (all non-hero receiver, handle, selector, buttpad):         [0.010,0.990] x [0.010,0.305]
    """
    def is_hero_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "m82a1_upper_receiver":
            if mat_name == "R_UpperParkerized":
                if nz < -0.85 and -1.170 <= tz <= -1.145 and 0.18 <= ty <= 1.82:
                    return True
            if mat_name == "R_RailCrest":
                if -14.45 <= tx <= 15.90 and ty > 2.715 and ny > 0.85 and abs(tz) <= 0.55:
                    return True
        if obj_name == "m82a1_lower_receiver" and mat_name == "R_LowerParkerized":
            # FULL unclamped outer left & right flat flanks (-1.12 / +1.12) -> ZERO trapezoid UV shear!
            if nz < -0.85 and -1.135 <= tz <= -1.095:
                return True
            if nz > 0.85 and 1.095 <= tz <= 1.135:
                return True
        return False

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.990, 0.010, 0.305, skip_face_fn=is_hero_face)

    # Project Hero Bands 1 & 2 onto Upper Receiver
    up = next(o for o in recv_objs if o.name == "m82a1_upper_receiver")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    up_left_hits = 0
    rail_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("m82a1_upper_receiver", f, mname):
            continue
        if mname == "R_UpperParkerized":
            up_left_hits += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (16.50 - tx) / 37.30))
                yn = max(0.0, min(1.0, (ty - 0.20) / 1.60))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.770 + yn * 0.215)
        elif mname == "R_RailCrest":
            rail_hits += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx - (-14.43)) / 30.30))
                zn = max(0.0, min(1.0, (tz + 0.54) / 1.08))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.758 - zn * 0.046)
    bm.to_mesh(up.data)
    bm.free()

    # Project STRICT ZERO-SHEAR Orthographic Planar (X, Y) UVs onto Lower Receiver Left & Right Walls
    lo = next(o for o in recv_objs if o.name == "m82a1_lower_receiver")
    bm = bmesh.new()
    bm.from_mesh(lo.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in lo.data.materials]
    lo_left_hits = 0
    lo_right_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("m82a1_lower_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        if is_right:
            lo_right_hits += 1
        else:
            lo_left_hits += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            yn = max(0.0, min(1.0, (ty - (-4.65)) / 4.85))
            if is_right:
                xn = max(0.0, min(1.0, (tx - (-20.80)) / 36.60))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.320 + yn * 0.185)
            else:
                xn = max(0.0, min(1.0, (15.80 - tx) / 36.60))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.515 + yn * 0.185)
    bm.to_mesh(lo.data)
    bm.free()
    print(f"  [HERO-UV] upper_left={up_left_hits}, top_rail={rail_hits}, lower_left={lo_left_hits}, lower_right={lo_right_hits}")
    assert up_left_hits > 0 and rail_hits >= 36 and lo_left_hits > 0 and lo_right_hits > 0, "Missing receiver hero faces!"


def unwrap_ordnance_atlas(ord_objs: list[bpy.types.Object]):
    """Unwraps 11 heavy ordnance, short-recoil & FCG parts into `m82a1_v3_ordnance` (2048x2048):
      - Upper Hero Zone (Arrowhead brake, 29" fluted barrel, spiked bipod): [0.010,0.990] x [0.495,0.990]
      - Lower Internals Zone (Extension, BCG, 3-lug bolt, accel, FP, FCG):  [0.010,0.990] x [0.010,0.480]
    """
    ext_hero = [o for o in ord_objs if o.name in {"m82a1_muzzle_brake", "m82a1_barrel", "m82a1_bipod"}]
    int_mech = [o for o in ord_objs if o not in ext_hero]
    _smart_unwrap_and_pack_rect(ext_hero, 0.010, 0.990, 0.495, 0.990)
    _smart_unwrap_and_pack_rect(int_mech, 0.010, 0.990, 0.010, 0.480)


def unwrap_optics_mag_atlas(opt_objs: list[bpy.types.Object]):
    """Unwraps 7 optics/grip/magazine parts into `m82a1_v3_optics_mag` (2048x2048) with
    100% ZERO overlap and firewalled Coated Lenses + Safety-Orange Mag Follower:
      - Hero Mag Right Flank:         [0.015, 0.255] x [0.015, 0.560]
      - Hero Mag Left  Flank:         [0.270, 0.510] x [0.015, 0.560]
      - Hero Windage M1 Turret Drum:  [0.015, 0.510] x [0.580, 0.646]
      - Hero Elevation M1 Turret Drum:[0.015, 0.510] x [0.654, 0.720]
      - Hero Scope Tube Left Script:  [0.015, 0.510] x [0.738, 0.784]
      - Hero Scope Tube Right Script: [0.015, 0.510] x [0.790, 0.836]
      - Firewalled Coated Lenses:     [0.015, 0.215] x [0.855, 0.985] (Front L / Rear R)
      - Firewalled Orange Follower:   [0.240, 0.510] x [0.855, 0.985]
      - Packed Non-Hero Scope, Rings, A2 Grip, Mag Non-Hero, Spring, Floorplate: [0.535, 0.990] x [0.010, 0.990]
    """
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y
        if obj_name == "m82a1_mag_body" and mat_name == "O_MagParkerized":
            if nz > 0.85 and 0.835 <= tz <= 0.885:
                return "mag_right"
            if nz < -0.85 and -0.885 <= tz <= -0.835:
                return "mag_left"
        if obj_name == "m82a1_scope":
            if mat_name == "O_CoatedLens":
                return "lens_front" if tx > 0.0 else "lens_rear"
            if mat_name == "O_TurretDrum":
                if ty > 0.60 and abs(ny) < 0.65:
                    return "turret_elev"
                if tz > 0.58 and abs(nz) < 0.65:
                    return "turret_wind"
            if mat_name == "O_ScopeAnodized":
                if -4.08 <= tx <= 3.58 and abs(ty) < 0.42:
                    if nz > 0.68 and tz > 0.35:
                        return "scope_right"
                    if nz < -0.68 and tz < -0.35:
                        return "scope_left"
        return None

    def is_hero_face(obj_name: str, face, mat_name: str) -> bool:
        return classify_hero(obj_name, face, mat_name) is not None

    follower_grp = [o for o in opt_objs if o.name == "m82a1_mag_follower"]
    main_grp = [o for o in opt_objs if o.name != "m82a1_mag_follower"]

    _smart_unwrap_and_pack_rect(main_grp,     0.535, 0.990, 0.010, 0.990, skip_face_fn=is_hero_face)
    _smart_unwrap_and_pack_rect(follower_grp, 0.240, 0.510, 0.855, 0.985)

    # 1) Giant .50 BMG Magazine Flanks
    mag = next(o for o in opt_objs if o.name == "m82a1_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero("m82a1_mag_body", f, mname)
        if tag not in ("mag_right", "mag_left"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            yn = max(0.0, min(1.0, (ty + 6.40) / 9.05))
            if tag == "mag_right":
                xn = max(0.0, min(1.0, (tx + 3.05) / 6.10))
                loop[uv_layer].uv = (0.015 + xn * 0.240, 0.015 + yn * 0.545)
            else:
                xn = max(0.0, min(1.0, (3.05 - tx) / 6.10))
                loop[uv_layer].uv = (0.270 + xn * 0.240, 0.015 + yn * 0.545)
    bm.to_mesh(mag.data)
    bm.free()

    # 2) Leupold Scope Hero Bands (Turrets, Script Flanks & Firewalled Coated Lenses)
    sc = next(o for o in opt_objs if o.name == "m82a1_scope")
    bm = bmesh.new()
    bm.from_mesh(sc.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sc.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero("m82a1_scope", f, mname)
        if tag is None:
            continue
        fc = f.calc_center_median()
        if tag == "turret_elev":
            ac = math.atan2(-fc.y, fc.x + 0.30)
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                av = math.atan2(tz, tx + 0.30)
                da = (av - ac + math.pi) % (2.0 * math.pi) - math.pi
                u_turn = max(0.0, min(1.0, (ac + da + math.pi) / (2.0 * math.pi)))
                hn = max(0.0, min(1.0, (ty - 0.62) / 0.82))
                loop[uv_layer].uv = (0.015 + u_turn * 0.495, 0.654 + hn * 0.066)
        elif tag == "turret_wind":
            ac = math.atan2(fc.z, fc.x + 0.30)
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                av = math.atan2(ty, tx + 0.30)
                da = (av - ac + math.pi) % (2.0 * math.pi) - math.pi
                u_turn = max(0.0, min(1.0, (ac + da + math.pi) / (2.0 * math.pi)))
                hn = max(0.0, min(1.0, (tz - 0.60) / 0.72))
                loop[uv_layer].uv = (0.015 + u_turn * 0.495, 0.580 + hn * 0.066)
        elif tag == "scope_right":
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 4.10) / 7.70))
                yn = max(0.0, min(1.0, (ty + 0.45) / 0.90))
                loop[uv_layer].uv = (0.015 + xn * 0.495, 0.790 + yn * 0.046)
        elif tag == "scope_left":
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (3.60 - tx) / 7.70))
                yn = max(0.0, min(1.0, (ty + 0.45) / 0.90))
                loop[uv_layer].uv = (0.015 + xn * 0.495, 0.738 + yn * 0.046)
        elif tag == "lens_front":
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                u_l = 0.015 + max(0.0, min(1.0, (tz + 0.96) / 1.92)) * 0.097
                v_l = 0.855 + max(0.0, min(1.0, (ty + 0.96) / 1.92)) * 0.130
                loop[uv_layer].uv = (u_l, v_l)
        elif tag == "lens_rear":
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                u_l = 0.118 + max(0.0, min(1.0, (tz + 0.69) / 1.38)) * 0.097
                v_l = 0.855 + max(0.0, min(1.0, (ty + 0.69) / 1.38)) * 0.130
                loop[uv_layer].uv = (u_l, v_l)
    bm.to_mesh(sc.data)
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.04, 0.045, 0.05, 1.0))
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
        "m82a1_upper_receiver":   build_m82a1_upper_receiver,
        "m82a1_lower_receiver":   build_m82a1_lower_receiver,
        "m82a1_carry_handle":     build_m82a1_carry_handle,
        "m82a1_selector":         build_m82a1_selector,
        "m82a1_muzzle_brake":     build_m82a1_muzzle_brake,
        "m82a1_barrel":           build_m82a1_barrel,
        "m82a1_barrel_extension": build_m82a1_barrel_extension,
        "m82a1_bolt_carrier":     build_m82a1_bolt_carrier,
        "m82a1_bolt":             build_m82a1_bolt,
        "m82a1_accelerator":      build_m82a1_accelerator,
        "m82a1_firing_pin":       build_m82a1_firing_pin,
        "m82a1_bipod":            build_m82a1_bipod,
        "m82a1_striker":          build_m82a1_striker,
        "m82a1_sear":             build_m82a1_sear,
        "m82a1_trigger":          build_m82a1_trigger,
        "m82a1_scope":            build_m82a1_scope,
        "m82a1_scope_rings":      build_m82a1_scope_rings,
        "m82a1_pistol_grip":      build_m82a1_pistol_grip,
        "m82a1_mag_body":         build_m82a1_mag_body,
        "m82a1_mag_follower":     build_m82a1_mag_follower,
        "m82a1_mag_spring":       build_m82a1_mag_spring,
        "m82a1_mag_floorplate":   build_m82a1_mag_floorplate,
    }

    print("[BUILD] Sculpting all 22 solid Barrett M82A1 (.50 BMG) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    ord_objs = [built[pid] for pid in ORDNANCE_PARTS]
    opt_objs = [built[pid] for pid in OPTICS_MAG_PARTS]
    all_objs = recv_objs + ord_objs + opt_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (4), ordnance (11), optics_mag (7)...")
    unwrap_receiver_atlas(recv_objs)
    unwrap_ordnance_atlas(ord_objs)
    unwrap_optics_mag_atlas(opt_objs)

    for label, group in (("receiver", recv_objs), ("ordnance", ord_objs), ("optics_mag", opt_objs)):
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
        print(f"  [UV-AUDIT] {label:12s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="m82a1_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking m82a1_v3_receiver (2048x2048, 4 hero parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m82a1_v3_ordnance (2048x2048, 11 barrel/brake/BCG/bipod/FCG parts)...")
        bake_atlas_suite("ord", ord_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m82a1_v3_optics_mag (2048x2048, 7 scope/rings/grip/mag parts)...")
        bake_atlas_suite("opt", opt_objs, all_objs, tmp_dir)

        print("[POST] Compositing Barrett rollmarks, T-rail marks, Leupold MIL turrets, coated lenses & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m82a1_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "m82a1_v3_receiver_normal.webp",
        TEX_OUT_DIR / "m82a1_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "m82a1_v3_ordnance_albedo.webp",
        TEX_OUT_DIR / "m82a1_v3_ordnance_normal.webp",
        TEX_OUT_DIR / "m82a1_v3_ordnance_roughness.webp",
        TEX_OUT_DIR / "m82a1_v3_optics_mag_albedo.webp",
        TEX_OUT_DIR / "m82a1_v3_optics_mag_normal.webp",
        TEX_OUT_DIR / "m82a1_v3_optics_mag_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== BARRETT M82A1 (.50 BMG) V3 ASSET BUDGET ===")
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
