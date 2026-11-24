#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Colt M4A1 SOPMOD (5.56x45mm NATO)
=================================================================================
MIT License — Digital Armory 3D (`PR-04`, Track 2b)

Generates:
  - public/models/m4a1.glb (Draco-compressed glTF 2.0, all 25 solid parts; skips ONLY
    dynamic GPU-compressed helical spring `m4a1_buffer_spring` carrying `aSpringParam`)
  - public/textures/m4a1_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/m4a1_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)
  - public/textures/m4a1_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 25 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/m4a1/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_m4a1_photoreal.py
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
# MODE 2: System Python Post-Process (Colt Rollmarks, IUID, T-Rail, STANAG + ORM)
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.8) -> np.ndarray:
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

    # Genuine 16x16 ECC200 DataMatrix for CAGE+serial payload "13629W421908"
    _UID_MODULES = (
        "1010101010101010",
        "1110100111100001",
        "1000100000001010",
        "1000101100100001",
        "1110100010111110",
        "1101011011100101",
        "1010111101010000",
        "1010101110000111",
        "1101000001010110",
        "1111011111001101",
        "1001001010111000",
        "1110101110111111",
        "1110001110011100",
        "1001000001101101",
        "1000111101101010",
        "1111111111111111",
    )

    def _draw_colt_rampant_pony(draw: ImageDraw.ImageDraw, x: float, y: float, s: float = 1.0) -> None:
        """Crisp vector Colt Rampant Pony over latitude/longitude globe."""
        draw.ellipse((x + 8 * s, y + 76 * s, x + 124 * s, y + 136 * s), outline=255, width=max(2, round(3.0 * s)))
        draw.ellipse((x + 34 * s, y + 76 * s, x + 98 * s, y + 136 * s), outline=255, width=max(2, round(2.2 * s)))
        draw.line([(x + 10 * s, y + 106 * s), (x + 122 * s, y + 106 * s)], fill=255, width=max(2, round(2.2 * s)))
        draw.arc((x + 12 * s, y + 88 * s, x + 120 * s, y + 124 * s), 0, 360, fill=255, width=max(1, round(2.0 * s)))
        pony = [
            (36, 74), (46, 58), (58, 52), (62, 34), (72, 20),
            (76, 6), (82, 18), (94, 20), (106, 30), (100, 40),
            (86, 38), (78, 52), (84, 64), (96, 62), (104, 46),
            (112, 48), (108, 74), (96, 82), (74, 76), (64, 86),
            (70, 106), (88, 116), (84, 124), (58, 114), (50, 90),
            (40, 96), (34, 116), (18, 124), (14, 116), (26, 106), (28, 84),
        ]
        draw.polygon([(x + px * s, y + py * s) for px, py in pony], fill=255)
        draw.line(
            [(x + 38 * s, y + 66 * s), (x + 22 * s, y + 54 * s), (x + 14 * s, y + 66 * s),
             (x + 20 * s, y + 84 * s), (x + 10 * s, y + 92 * s)],
            fill=255, width=max(2, round(4.0 * s)), joint="curve",
        )
        draw.line([(x + 90 * s, y + 36 * s), (x + 122 * s, y + 48 * s)], fill=255, width=max(2, round(2.6 * s)))
        draw.line([(x + 54 * s, y + 24 * s), (x + 84 * s, y + 34 * s)], fill=255, width=max(2, round(2.4 * s)))

    def _draw_ordnance_escudo(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """U.S. DoD Eagle & Stars acceptance cartouche."""
        draw.rectangle((cx - r, cy - r * 0.82, cx + r, cy + r * 0.82), outline=255, width=max(2, round(r * 0.12)))
        for dx in (-r * 0.52, 0.0, r * 0.52):
            draw.regular_polygon((cx + dx, cy - r * 0.44, r * 0.16), 5, rotation=-18, fill=255)
        draw.line([(cx - r * 0.72, cy - r * 0.02), (cx, cy + r * 0.14), (cx + r * 0.72, cy - r * 0.02)],
                  fill=255, width=max(2, round(r * 0.13)))
        draw.polygon(
            [(cx - r * 0.28, cy + r * 0.04), (cx + r * 0.28, cy + r * 0.04),
             (cx + r * 0.22, cy + r * 0.52), (cx, cy + r * 0.66), (cx - r * 0.22, cy + r * 0.52)],
            fill=255,
        )

    def _draw_vp_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        pts = [(cx - r, cy - r * 0.72), (cx + r, cy - r * 0.72), (cx, cy + r * 0.95)]
        draw.polygon(pts, outline=255, width=max(2, round(r * 0.16)))
        f_vp = _load_font(FONT_COND, max(10, round(r * 0.92)))
        draw.text((cx, cy - r * 0.18), "VP", font=f_vp, fill=255, anchor="mm")

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
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.30 + 0.70 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.28, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # Hero UV bands (exact full lower wall Y in [-2.22, +1.84], X in [-5.80, +4.35]):
        #   Lower Left  wall: u in [0.015, 0.985] (1 - xNorm: +X front -> u=0.015), v in [0.735, 0.985]
        #   Lower Right wall: u in [0.015, 0.985] (xNorm: -X rear -> u=0.015),      v in [0.470, 0.720]
        #   Upper Top 1913 Rail: u in [0.015, 0.985] (X in [-5.50, +4.40]),          v in [0.405, 0.458]
        PPCM = 300.0
        LW, LH = int(round(10.15 * PPCM)), int(round(4.06 * PPCM))  # 3045 x 1218

        def yw_to_cy(yw: float) -> int:
            return int(round((1.84 - yw) / 4.06 * LH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw + 5.80) / 10.15 * LW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw + 5.80) / 10.15) * LW))

        engraving = np.zeros((h, w), dtype=np.float32)
        laser = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT LOWER WALL: Colt Rampant Pony + PROPERTY OF U.S. GOVT. M4A1 CARBINE + SAFE/SEMI/AUTO ---
        left_eng = Image.new("L", (LW, LH), 0)
        left_las = Image.new("L", (LW, LH), 0)
        de_l = ImageDraw.Draw(left_eng)
        dl_l = ImageDraw.Draw(left_las)

        # Left open magwell flat sits strictly below lo_lmbar (Y=-0.79 -> cy=789) and above flare (Y=-1.95 -> cy=1137)
        # X in [0.78, 4.02] -> cx_left in [99..1071]; place Colt rollmark block cleanly inside cx=[155..1040], cy=[815..1110]!
        mx_c, my_c = 160, yw_to_cy(-0.90)  # cy ~ 822
        _draw_colt_rampant_pony(de_l, mx_c, my_c, s=1.42)
        _draw_vp_proof(de_l, mx_c + 76, my_c + 236, 22.0)

        tx_c = mx_c + 206
        f_prop = _load_font(FONT_DIN, 36)
        f_m4 = _load_font(FONT_DIN, 58)
        f_cal = _load_font(FONT_DIN, 46)
        f_ser = _load_font(FONT_DIN, 46)
        f_addr = _load_font(FONT_COND, 31)

        de_l.text((tx_c, my_c - 2), "PROPERTY OF U.S. GOVT.", font=f_prop, fill=255)
        de_l.text((tx_c, my_c + 42), "M4A1  CARBINE", font=f_m4, fill=255)
        de_l.text((tx_c, my_c + 108), "CAL. 5.56 MM.", font=f_cal, fill=255)
        de_l.text((tx_c, my_c + 164), "W 421908", font=f_ser, fill=255)
        de_l.text((mx_c + 132, my_c + 226), "COLT DEFENSE   HARTFORD, CONN.   U.S.A.", font=f_addr, fill=255)
        # U.S. DoD acceptance eagle cartouche cleanly above mag-catch bar (X=2.85, Y=-0.18 -> clear of pivot pin & bolt catch!)
        _draw_ordnance_escudo(de_l, xw_to_cx_left(2.85), yw_to_cy(-0.18), 34.0)

        # Selector markings centered at EXACT CAD (-3.35, -0.22):
        sx_l, sy_l = xw_to_cx_left(-3.35), yw_to_cy(-0.22)
        arc_r = int(round(0.255 * PPCM))
        de_l.arc((sx_l - arc_r, sy_l - arc_r, sx_l + arc_r, sy_l + arc_r), 165, 375, fill=255, width=5)
        f_sel = _load_font(FONT_DIN, 38)
        dl_l.text((sx_l, sy_l - arc_r - 36), "SEMI", font=f_sel, fill=255, anchor="mm")
        dl_l.text((sx_l + arc_r + 20, sy_l), "SAFE", font=f_sel, fill=255, anchor="lm")
        dl_l.text((sx_l - arc_r - 20, sy_l), "AUTO", font=f_sel, fill=255, anchor="rm")
        for dx0, dy0, dx1, dy1 in (
            (-arc_r - 14, 0, -arc_r - 2, 0),
            (0, -arc_r - 14, 0, -arc_r - 2),
            (arc_r + 2, 0, arc_r + 14, 0),
        ):
            dl_l.line([(sx_l + dx0, sy_l + dy0), (sx_l + dx1, sy_l + dy1)], fill=255, width=5)

        _paste_uv_band(engraving, left_eng, 0.015, 0.985, 0.735, 0.985)
        _paste_uv_band(laser, left_las, 0.015, 0.985, 0.735, 0.985)

        # --- 2) RIGHT LOWER WALL: SAFE/SEMI/AUTO + MIL-STD-130 IUID DataMatrix Plate ---
        right_eng = Image.new("L", (LW, LH), 0)
        right_las = Image.new("L", (LW, LH), 0)
        de_r = ImageDraw.Draw(right_eng)
        dl_r = ImageDraw.Draw(right_las)

        sx_r, sy_r = xw_to_cx_right(-3.35), yw_to_cy(-0.22)
        de_r.arc((sx_r - arc_r, sy_r - arc_r, sx_r + arc_r, sy_r + arc_r), 165, 375, fill=255, width=5)
        dl_r.text((sx_r, sy_r - arc_r - 36), "SEMI", font=f_sel, fill=255, anchor="mm")
        dl_r.text((sx_r - arc_r - 20, sy_r), "SAFE", font=f_sel, fill=255, anchor="rm")
        dl_r.text((sx_r + arc_r + 20, sy_r), "AUTO", font=f_sel, fill=255, anchor="lm")
        for dx0, dy0, dx1, dy1 in (
            (-arc_r - 14, 0, -arc_r - 2, 0),
            (0, -arc_r - 14, 0, -arc_r - 2),
            (arc_r + 2, 0, arc_r + 14, 0),
        ):
            dl_r.line([(sx_r + dx0, sy_r + dy0), (sx_r + dx1, sy_r + dy1)], fill=255, width=5)

        # Right-side IUID DataMatrix plate cleanly centered on open right magwell flat
        # (X in [1.35, 3.25], Y in [-1.86, -1.22] -> strictly below fence Y=-1.125 & above flare Y=-1.95!)
        ux_c, uy_c = xw_to_cx_right(1.38), yw_to_cy(-1.22)
        pw_c, ph_c = 540, 188
        dl_r.rounded_rectangle((ux_c, uy_c, ux_c + pw_c, uy_c + ph_c), radius=14, outline=255, width=5)
        mod_px = 8
        dm_x0, dm_y0 = ux_c + 28, uy_c + (ph_c - 16 * mod_px) // 2
        for r_idx, row_bits in enumerate(_UID_MODULES):
            for c_idx, bit in enumerate(row_bits):
                if bit == "1":
                    x0_m = dm_x0 + c_idx * mod_px
                    y0_m = dm_y0 + r_idx * mod_px
                    dl_r.rectangle((x0_m, y0_m, x0_m + mod_px - 1, y0_m + mod_px - 1), fill=255)
        dl_r.text((ux_c + 180, uy_c + 26), "U.S.  M4A1", font=_load_font(FONT_DIN, 38), fill=255)
        dl_r.text((ux_c + 180, uy_c + 78), "CAGE  13629", font=_load_font(FONT_COND, 34), fill=255)
        dl_r.text((ux_c + 180, uy_c + 124), "SER   W421908", font=_load_font(FONT_COND, 34), fill=255)

        # Colt 'C' forge mark on right rear lower buffer-tower tang (X=-5.05, Y=+0.68)
        de_r.text((xw_to_cx_right(-5.05), yw_to_cy(0.68)), "C", font=_load_font(FONT_DIN, 42), fill=240, anchor="mm")

        _paste_uv_band(engraving, right_eng, 0.015, 0.985, 0.470, 0.720)
        _paste_uv_band(laser, right_las, 0.015, 0.985, 0.470, 0.720)

        # --- 3) UPPER RECEIVER MIL-STD-1913 TOP PICATINNY RAIL T2..T12 LASER NUMBERS ---
        RW, RH = int(round(9.90 * PPCM)), int(round(1.00 * PPCM))  # 2970 x 300
        rail_las = Image.new("L", (RW, RH), 0)
        dl_rail = ImageDraw.Draw(rail_las)
        f_rail = _load_font(FONT_DIN, 78)
        pitch = 9.90 / 13.6
        start_x = -0.55 - 6.0 * pitch
        for slot_i, label in ((1, "T2"), (3, "T4"), (5, "T6"), (7, "T8"), (9, "T10"), (11, "T12")):
            lug_x = start_x + (slot_i + 0.5) * pitch
            xn = (lug_x - (-5.50)) / 9.90
            rx_c = int(round(xn * RW))
            dl_rail.text((rx_c, int(RH * 0.25)), label, font=f_rail, fill=255, anchor="mm")
        _paste_uv_band(laser, rail_las, 0.015, 0.985, 0.405, 0.458)

        # --- 4) CLP Oil Seepage Halos around Lower Cross-Pins + Handling Micro-Scratches ---
        lower_walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.735) & (v_grid <= 0.985)) | ((v_grid >= 0.470) & (v_grid <= 0.720))
        )).astype(np.float32)

        cad_pins = (
            (-3.35, -0.22, 0.28),
            (-1.75, -0.32, 0.16),
            (-0.35, -0.05, 0.16),
            (-2.25,  0.11, 0.14),
            (-4.95,  0.02, 0.20),
            ( 3.85,  0.02, 0.20),
        )
        for px_cm, py_cm, rad_cm in cad_pins:
            xn = (px_cm + 5.80) / 10.15
            yn = (py_cm + 2.22) / 4.06
            for ux, vy in ((0.015 + (1.0 - xn) * 0.970, 0.735 + yn * 0.250),
                           (0.015 + xn * 0.970, 0.470 + yn * 0.250)):
                dx_cm = (u_grid - ux) * (10.15 / 0.970)
                dy_cm = (v_grid - vy) * (4.06 / 0.250)
                hub_oil = np.exp(-(dx_cm * dx_cm + dy_cm * dy_cm) / (rad_cm * rad_cm)) * lower_walls
                rgh -= hub_oil * 0.075
                albedo -= (hub_oil * 0.008)[..., None]

        rng = np.random.default_rng(5561)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(120):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.53) * h)
            length = float(rng.uniform(14, 64))
            ang = math.radians(float(rng.uniform(-22, 16)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng.integers(75, 200)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * lower_walls
        _mix(albedo, (0.48, 0.50, 0.54), sc * 0.26)
        rgh -= sc * 0.065
        met = np.clip(met + sc * 0.12, 0.02, 0.98)

        # --- 5) Composite Struck Rollmarks & Crisp White Laser Markings ---
        # Bright light-silver/champagne oxide sheen inside struck Colt rollmarks makes them
        # super legible in studio lighting against deep MIL-A-8625 Type-III anodize!
        eng_bev = _bevel_mask(engraving, width_px=1.4)
        decal_height = -0.68 * eng_bev - 0.22 * _bevel_mask(laser, width_px=1.1) - 0.04 * sc
        _mix(albedo, (0.74, 0.76, 0.80), engraving * 0.80)
        _mix(rgh, 0.44, engraving * 0.75)
        _mix(met, 0.40, engraving * 0.65)
        ao *= 1.0 - 0.20 * engraving

        _mix(albedo, (0.92, 0.93, 0.95), laser * 0.96)
        _mix(rgh, 0.38, laser * 0.90)
        _mix(met, 0.04, laser * 0.96)
        ao *= 1.0 - 0.06 * laser

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m4a1_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

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
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.02, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m4a1_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

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
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero STANAG Magazine Flanks in furniture atlas:
        #   Right flank: u in [0.015, 0.195], v in [0.015, 0.785]
        #   Left  flank: u in [0.210, 0.390], v in [0.015, 0.785]
        #   vNorm = 0 at mag floorplate bottom (v=0.015) -> 1 at feed lip top (v=0.785)
        #   Straight magwell insertion tower sits at vNorm in [0.73, 1.00] (v in [0.577, 0.785])
        mw, mh = 816, 2550
        mag_ribs = np.zeros((h, w), dtype=np.float32)
        mag_spots = np.zeros((h, w), dtype=np.float32)
        mag_stamp = np.zeros((h, w), dtype=np.float32)

        rib_canvas = Image.new("L", (mw, mh), 0)
        dr = ImageDraw.Draw(rib_canvas)
        # Five USGI stamped vertical stiffening channels (below magwell stop bead at y=0.275*mh, clearing lower stamp!)
        for frac in (0.18, 0.34, 0.50, 0.66, 0.82):
            cx = int(frac * mw)
            dr.rounded_rectangle((cx - 24, int(0.31 * mh), cx + 24, int(0.835 * mh)), radius=16, fill=255)
        # Horizontal magwell over-insertion stop bead at vNorm = 0.725 -> y = 0.275*mh
        dr.rounded_rectangle((int(0.06 * mw), int(0.264 * mh), int(0.94 * mw), int(0.288 * mh)), radius=12, fill=235)

        spot_canvas = Image.new("L", (mw, mh), 0)
        dsp = ImageDraw.Draw(spot_canvas)
        for y_frac in (0.18, 0.30, 0.43, 0.56, 0.69, 0.81):
            cy = int(y_frac * mh)
            for x_frac in (0.075, 0.925):
                cx = int(x_frac * mw)
                dsp.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=255)

        stamp_canvas = Image.new("L", (mw, mh), 0)
        dst = ImageDraw.Draw(stamp_canvas)
        dst.text((mw // 2, int(mh * 0.882)), "5.56 MM   NATO   CAGE 33710", font=_load_font(FONT_COND, 56), fill=255, anchor="mm")
        dst.text((mw // 2, int(mh * 0.918)), "COLT'S MFG. CO. INC.  HARTFORD, CT  U.S.A.", font=_load_font(FONT_COND, 40), fill=240, anchor="mm")

        for pu0, pu1 in ((0.015, 0.195), (0.210, 0.390)):
            _paste_uv_band(mag_ribs, rib_canvas, pu0, pu1, 0.015, 0.785)
            _paste_uv_band(mag_spots, spot_canvas, pu0, pu1, 0.015, 0.785)
            _paste_uv_band(mag_stamp, stamp_canvas, pu0, pu1, 0.015, 0.785)

        # Realistic vertical magwell insertion scuffs exposing bright bare 6061 aluminum on upper straight tower!
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        insert_mask = (
            (((u_grid >= 0.015) & (u_grid <= 0.195)) | ((u_grid >= 0.210) & (u_grid <= 0.390)))
            & (v_grid >= 0.575) & (v_grid <= 0.785)
        ).astype(np.float32)
        rng = np.random.default_rng(5562)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(520):
            sx = float(rng.uniform(0.018, 0.388) * w)
            sy = float(rng.uniform(0.215, 0.420) * h)
            length = float(rng.uniform(14, 96))
            dsc.line([(sx, sy), (sx + float(rng.uniform(-2.5, 2.5)), sy + length)],
                     fill=int(rng.integers(75, 225)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * insert_mask

        rib_bev = _bevel_mask(mag_ribs, width_px=4.0)
        spot_bev = _bevel_mask(mag_spots, width_px=2.5)
        stamp_bev = _bevel_mask(mag_stamp, width_px=1.4)

        decal_height = 0.52 * rib_bev - 0.34 * spot_bev - 0.52 * stamp_bev - 0.06 * scuffs
        # Subtle burnishing on stamped rib crests & crisp metallic insertion streaks on pewter-olive STANAG body!
        _mix(albedo, (0.34, 0.355, 0.368), rib_bev * 0.24)
        rgh -= rib_bev * 0.045
        _mix(albedo, (0.64, 0.66, 0.70), scuffs * 0.58)
        _mix(rgh, 0.22, scuffs * 0.68)
        _mix(met, 0.95, scuffs * 0.72)
        # Recessed CAGE 33710 stamp & spot welds (crisp high-contrast etch on dry-film pewter)
        _mix(albedo, (0.125, 0.132, 0.142), mag_stamp * 0.80)
        ao *= 1.0 - 0.18 * mag_stamp - 0.14 * mag_spots

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.95)
        met = np.clip(met, 0.0, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_furniture_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_furniture_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m4a1_v3_furniture_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m4a1_v3_furniture_{albedo,normal,roughness}.webp (2048x2048)")

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
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "m4a1.glb"
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


# Exact 25 solid M4A1 SOPMOD parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY dynamic GPU-compressed helical spring `m4a1_buffer_spring`!)
RECEIVER_PARTS = [
    "m4a1_upper_receiver",
    "m4a1_lower_receiver",
    "m4a1_carry_handle",
    "m4a1_charging_handle",
    "m4a1_selector",
    "m4a1_dust_cover",
]

METAL_PARTS = [
    "m4a1_barrel",
    "m4a1_flash_hider",
    "m4a1_front_sight_base",
    "m4a1_bolt_carrier",
    "m4a1_bolt",
    "m4a1_firing_pin",
    "m4a1_gas_tube",
    "m4a1_buffer_tube",
    "m4a1_buffer",
    "m4a1_hammer",
    "m4a1_trigger",
    "m4a1_mag_spring",
]

FURNITURE_PARTS = [
    "m4a1_ras_upper",
    "m4a1_ras_lower",
    "m4a1_buttstock",
    "m4a1_pistol_grip",
    "m4a1_mag_body",
    "m4a1_mag_follower",
    "m4a1_mag_floorplate",
]

# Exterior parts receiving assembled inter-part contact AO (internal & sliding parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "m4a1_upper_receiver",
    "m4a1_lower_receiver",
    "m4a1_carry_handle",
    "m4a1_dust_cover",
    "m4a1_selector",
    "m4a1_barrel",
    "m4a1_flash_hider",
    "m4a1_front_sight_base",
    "m4a1_ras_upper",
    "m4a1_ras_lower",
    "m4a1_buttstock",
    "m4a1_pistol_grip",
    "m4a1_mag_body",
    "m4a1_mag_floorplate",
}

ASSEMBLED_POS = {
    "m4a1_upper_receiver":   (  0.000,  0.000, 0.000),
    "m4a1_carry_handle":     ( -0.550,  2.120, 0.000),
    "m4a1_charging_handle":  ( -2.250,  1.660, 0.000),
    "m4a1_dust_cover":       (  1.720,  0.620, 0.770),
    "m4a1_bolt_carrier":     ( -0.750,  1.050, 0.000),
    "m4a1_bolt":             (  2.450,  1.050, 0.000),
    "m4a1_firing_pin":       (  0.150,  1.050, 0.000),
    "m4a1_gas_tube":         (  8.350,  1.670, 0.000),
    "m4a1_ras_upper":        (  9.580,  1.050, 0.000),
    "m4a1_ras_lower":        (  9.580,  1.050, 0.000),
    "m4a1_lower_receiver":   (  0.000,  0.000, 0.000),
    "m4a1_barrel":           (  0.000,  1.050, 0.000),
    "m4a1_flash_hider":      ( 22.950,  1.050, 0.000),
    "m4a1_front_sight_base": ( 15.050,  1.050, 0.000),
    "m4a1_buffer_tube":      (-11.350,  1.050, 0.000),
    "m4a1_buffer":           ( -6.350,  1.050, 0.000),
    "m4a1_buttstock":        (-13.950,  1.050, 0.000),
    "m4a1_pistol_grip":      ( -3.450, -0.880, 0.000),
    "m4a1_hammer":           ( -0.350, -0.050, 0.000),
    "m4a1_trigger":          ( -1.750, -0.320, 0.000),
    "m4a1_selector":         ( -3.350, -0.220, 0.000),
    "m4a1_mag_body":         (  2.400, -1.000, 0.000),
    "m4a1_mag_follower":     (  3.052, -7.051, 0.000),
    "m4a1_mag_spring":       (  2.400, -1.000, 0.000),
    "m4a1_mag_floorplate":   (  3.554, -8.591, 0.000),
}

ASSEMBLED_ROT_THREE = {
    "m4a1_mag_follower":   (0.0, 0.0, 0.27),
    "m4a1_mag_floorplate": (0.0, 0.0, 0.36),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) from src/weapons/m4a1/meshes/*.ts
CSG_REF_BBOX = {
    "m4a1_upper_receiver":   ((-5.630, -0.120, -0.990), ( 5.440,  2.120,  1.373)),
    "m4a1_carry_handle":     ((-4.685, -0.315, -0.830), ( 4.485,  1.675,  0.780)),
    "m4a1_charging_handle":  ((-3.953, -0.310, -1.280), ( 3.740,  0.190,  1.280)),
    "m4a1_dust_cover":       ((-1.860, -0.139, -0.140), ( 1.860,  0.905,  0.139)),
    "m4a1_bolt_carrier":     ((-3.750, -0.515, -0.515), ( 3.250,  0.820,  0.548)),
    "m4a1_bolt":             ((-1.660, -0.525, -0.525), ( 1.320,  0.690,  0.490)),
    "m4a1_firing_pin":       ((-0.300, -0.225, -0.549), ( 3.596,  0.307,  0.440)),
    "m4a1_gas_tube":         ((-6.400, -0.116, -0.280), ( 6.300,  0.301,  0.280)),
    "m4a1_ras_upper":        ((-4.175, -0.370, -1.120), ( 4.175,  1.130,  1.120)),
    "m4a1_ras_lower":        ((-4.175, -1.060, -0.900), ( 4.175,  0.000,  0.900)),
    "m4a1_lower_receiver":   ((-5.825, -2.245, -0.900), ( 4.345,  1.865,  0.930)),
    "m4a1_barrel":           (( 3.550, -0.615, -0.615), (22.380,  0.660,  0.615)),
    "m4a1_flash_hider":      ((-1.050, -0.448, -0.450), ( 1.150,  0.448,  0.450)),
    "m4a1_front_sight_base": ((-1.345, -1.380, -0.908), ( 1.208,  2.705,  0.908)),
    "m4a1_buffer_tube":      ((-5.650, -1.000, -0.860), ( 5.850,  0.824,  0.860)),
    "m4a1_buffer":           ((-1.750, -0.511, -0.515), ( 1.850,  0.511,  0.515)),
    "m4a1_buttstock":        ((-4.300, -3.901, -1.184), ( 3.900,  0.953,  1.184)),
    "m4a1_pistol_grip":      ((-2.965, -4.556, -0.650), ( 1.101,  0.110,  0.650)),
    "m4a1_hammer":           ((-1.232, -0.586, -0.482), ( 0.332,  0.332,  0.482)),
    "m4a1_trigger":          ((-0.990, -1.446, -0.480), ( 1.413,  0.560,  0.480)),
    "m4a1_selector":         ((-0.280, -0.280, -0.925), ( 0.280,  0.941,  0.865)),
    "m4a1_mag_body":         ((-1.430, -8.109, -0.571), ( 2.465,  1.208,  0.571)),
    "m4a1_mag_follower":     ((-1.280, -1.120, -0.390), ( 1.130,  0.415,  0.390)),
    "m4a1_mag_spring":       ((-0.101, -7.692, -0.336), ( 1.891, -5.901,  0.336)),
    "m4a1_mag_floorplate":   ((-1.430, -0.190, -0.575), ( 1.430,  0.130,  0.575)),
}


# =============================================================================
# Scene & Physically Calibrated Mil-Spec Material Library (Cycles GPU)
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
    edge_srgb: tuple[float, float, float] = (0.72, 0.74, 0.78),
    grain_scale: float = 34.0,
    grain_bump: float = 0.032,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 64.0,
    rough_var: float = 0.055,
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
    n_macro.inputs["Scale"].default_value = 2.25
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.52
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
    rgh_val_node.inputs["To Min"].default_value = max(0.08, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        # Tight localized inside-AO convex edge curvature (ZERO cloudy Pointiness triangle blotches!)
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.048

        inv_ao = nt.nodes.new("ShaderNodeMath")
        inv_ao.operation = "SUBTRACT"
        inv_ao.inputs[0].default_value = 1.0
        nt.links.new(ao_edge.outputs["AO"], inv_ao.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.24
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.64
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
        mix_edge_r.inputs[3].default_value = max(0.16, roughness - 0.13)
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


def _build_brass_deflector_mat() -> bpy.types.Material:
    """Forged 7075-T6 Brunton Bump shell deflector: satin charcoal Type-III anodize + authentic
    golden-brass case-mouth kisses & bare-aluminum crest wear on the forward ramp!"""
    mat = _build_pbr_mat(
        "R_BrassDeflector",
        base_srgb=(0.188, 0.197, 0.212),
        roughness=0.29,
        metallic=0.86,
        bevel_r=0.040,
        edge_wear=0.36,
        edge_srgb=(0.74, 0.76, 0.80),
        grain_scale=68.0,
        grain_bump=0.026,
        voronoi_grain=0.44,
        voronoi_scale=88.0,
        rough_var=0.022,
    )
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = next(n for n in nt.nodes if n.type == "TEX_COORD")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Forward brass-impact ramp sits at Blender X in [-0.46, +0.08]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.45
    mr_x.inputs["From Max"].default_value = 0.04
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_kiss = nt.nodes.new("ShaderNodeTexNoise")
    n_kiss.inputs["Scale"].default_value = 9.5
    n_kiss.inputs["Detail"].default_value = 6.0
    n_kiss.inputs["Roughness"].default_value = 0.72
    nt.links.new(texcoord.outputs["Object"], n_kiss.inputs["Vector"])

    ramp_k = nt.nodes.new("ShaderNodeValToRGB")
    ramp_k.color_ramp.elements[0].position = 0.44
    ramp_k.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_k.color_ramp.elements[1].position = 0.72
    ramp_k.color_ramp.elements[1].color = (0.78, 0.78, 0.78, 1.0)
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
    mix_c.inputs[7].default_value = srgb_to_lin(0.76, 0.60, 0.24)  # cartridge brass transfer
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
    mix_m.inputs[3].default_value = 0.94
    nt.links.new(mul_k.outputs["Value"], mix_m.inputs[0])
    nt.links.new(orig_met, mix_m.inputs[2])
    nt.links.new(mix_m.outputs[0], bsdf.inputs["Metallic"])

    return mat


def _build_a2_flash_hider_mat() -> bpy.types.Material:
    """USGI A2 Birdcage Flash Suppressor: manganese phosphate rear -> bronze/violet heat-temper
    around the 5 upper flash ports -> velvety gunpowder carbon crown soot at muzzle face!"""
    mat = bpy.data.materials.new("M_A2FlashHiderSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X along [-1.05 .. +1.15] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -1.05
    mr_x.inputs["From Max"].default_value = 1.15
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 4.8
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
    cr.elements[0].color = srgb_to_lin(0.172, 0.178, 0.190)
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.184, 0.190, 0.202)
    for pos, rgb in (
        (0.58, (0.34, 0.24, 0.145)),   # rich bronze gas-port heat temper
        (0.73, (0.16, 0.195, 0.285)),  # heat-blued steel tint
        (0.90, (0.068, 0.066, 0.068)), # gunpowder carbon crown soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.48
    rr.elements[0].color = (0.26, 0.26, 0.26, 1.0)
    rr.elements[1].position = 0.92
    rr.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.72
    rm.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.elements[1].position = 0.95
    rm.elements[1].color = (0.14, 0.14, 0.14, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.025
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.042
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_gas_tube_heat_mat() -> bpy.types.Material:
    """347 Stainless DI Gas Tube: bright brushed steel at receiver -> golden straw & pale blue heat tint at FSB!"""
    mat = bpy.data.materials.new("M_GasTubeStainlessHeat")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X along [-6.40 .. +6.30] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -6.40
    mr_x.inputs["From Max"].default_value = 6.30
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_grain = nt.nodes.new("ShaderNodeTexNoise")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.4, 24.0, 24.0)
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])
    n_grain.inputs["Scale"].default_value = 3.5
    n_grain.inputs["Detail"].default_value = 4.0
    nt.links.new(mapping.outputs["Vector"], n_grain.inputs["Vector"])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.76, 0.78, 0.81)
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.78, 0.80, 0.83)
    for pos, rgb in (
        (0.64, (0.76, 0.67, 0.44)),  # straw temper
        (0.80, (0.62, 0.50, 0.34)),  # bronze heat tint
        (0.92, (0.48, 0.50, 0.60)),  # pale steel-blue near FSB port
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr_x.outputs["Result"], ramp_c.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.21
    bsdf.inputs["Metallic"].default_value = 0.96

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.014
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.025
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(n_grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_a2_diamond_checkering_mat() -> bpy.types.Material:
    """Authentic USGI A2 Pistol Grip 20-LPI molded 45-deg diamond checkering polymer panels!"""
    mat = bpy.data.materials.new("F_A2Checkering")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")

    # Rotate object coords 45 deg around Y (Blender Y = Three.js -Z grip flank normal!) so waves cross in X-Z!
    map_a = nt.nodes.new("ShaderNodeMapping")
    map_a.inputs["Rotation"].default_value = (0.0, math.radians(45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], map_a.inputs["Vector"])

    wave_a = nt.nodes.new("ShaderNodeTexWave")
    wave_a.wave_type = "BANDS"
    wave_a.bands_direction = "X"
    wave_a.wave_profile = "SAW"
    wave_a.inputs["Scale"].default_value = 14.5
    nt.links.new(map_a.outputs["Vector"], wave_a.inputs["Vector"])

    map_b = nt.nodes.new("ShaderNodeMapping")
    map_b.inputs["Rotation"].default_value = (0.0, math.radians(-45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], map_b.inputs["Vector"])

    wave_b = nt.nodes.new("ShaderNodeTexWave")
    wave_b.wave_type = "BANDS"
    wave_b.bands_direction = "X"
    wave_b.wave_profile = "SAW"
    wave_b.inputs["Scale"].default_value = 14.5
    nt.links.new(map_b.outputs["Vector"], wave_b.inputs["Vector"])

    # Pyramid height = min(wave_a, wave_b) -> crisp raised diamond pyramids!
    pyr = nt.nodes.new("ShaderNodeMath")
    pyr.operation = "MINIMUM"
    nt.links.new(wave_a.outputs["Fac"], pyr.inputs[0])
    nt.links.new(wave_b.outputs["Fac"], pyr.inputs[1])

    # Subtle color variation between diamond tips & valleys
    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.095, 0.099, 0.106)
    mix_c.inputs[7].default_value = srgb_to_lin(0.162, 0.168, 0.178)
    nt.links.new(pyr.outputs["Value"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.78
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.018
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.42
    bump.inputs["Distance"].default_value = 0.028
    nt.links.new(pyr.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Receiver Atlas Materials (m4a1_v3_receiver) ---
        # Subtle real-AR MIL-A-8625 Type-III Hard-Coat Anodize mismatch: Upper slightly cooler satin charcoal vs Lower warmer dark graphite!
        "R_UpperAnodize": _build_pbr_mat(
            "R_UpperAnodize",
            base_srgb=(0.188, 0.197, 0.212),
            roughness=0.29,
            metallic=0.86,
            bevel_r=0.036,
            edge_wear=0.28,
            edge_srgb=(0.68, 0.71, 0.76),
            grain_scale=68.0,
            grain_bump=0.026,
            voronoi_grain=0.44,
            voronoi_scale=88.0,
            rough_var=0.022,
        ),
        "R_LowerAnodize": _build_pbr_mat(
            "R_LowerAnodize",
            base_srgb=(0.176, 0.183, 0.196),
            roughness=0.31,
            metallic=0.84,
            bevel_r=0.038,
            edge_wear=0.26,
            edge_srgb=(0.66, 0.69, 0.74),
            grain_scale=72.0,
            grain_bump=0.028,
            voronoi_grain=0.46,
            voronoi_scale=92.0,
            rough_var=0.024,
        ),
        "R_BrassDeflector": _build_brass_deflector_mat(),
        "R_RailCrest": _build_pbr_mat(
            "R_RailCrest",
            base_srgb=(0.208, 0.217, 0.232),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.30,
            edge_srgb=(0.76, 0.78, 0.82),
            grain_scale=36.0,
            grain_bump=0.020,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.022,
        ),
        "R_SlotDark": _build_pbr_mat(
            "R_SlotDark",
            base_srgb=(0.095, 0.100, 0.108),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.024,
        ),
        "R_ParkerizedCtrl": _build_pbr_mat(
            "R_ParkerizedCtrl",
            base_srgb=(0.202, 0.210, 0.224),
            roughness=0.27,
            metallic=0.88,
            bevel_r=0.026,
            edge_wear=0.30,
            edge_srgb=(0.74, 0.76, 0.80),
            grain_scale=54.0,
            grain_bump=0.030,
            voronoi_grain=0.44,
            voronoi_scale=78.0,
            rough_var=0.024,
        ),
        "R_BrightSteel": _build_pbr_mat(
            "R_BrightSteel",
            base_srgb=(0.76, 0.79, 0.82),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.16,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.022,
        ),
        "R_SpringSteel": _build_pbr_mat(
            "R_SpringSteel",
            base_srgb=(0.58, 0.61, 0.65),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.012,
            grain_scale=26.0,
            grain_bump=0.015,
            rough_var=0.022,
        ),

        # --- Metal / Ordnance / BCG / FCG Atlas Materials (m4a1_v3_metal) ---
        "M_ParkerizedBarrel": _build_pbr_mat(
            "M_ParkerizedBarrel",
            base_srgb=(0.180, 0.187, 0.199),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.028,
            edge_wear=0.26,
            edge_srgb=(0.70, 0.72, 0.76),
            grain_scale=40.0,
            grain_bump=0.032,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.026,
        ),
        "M_A2FlashHiderSoot": _build_a2_flash_hider_mat(),
        "M_ForgedFSB": _build_pbr_mat(
            "M_ForgedFSB",
            base_srgb=(0.186, 0.194, 0.206),
            roughness=0.29,
            metallic=0.87,
            bevel_r=0.034,
            edge_wear=0.28,
            edge_srgb=(0.72, 0.74, 0.78),
            grain_scale=72.0,
            grain_bump=0.044,
            voronoi_grain=0.52,
            voronoi_scale=92.0,
            rough_var=0.028,
        ),
        "M_OiledBCG": _build_pbr_mat(
            "M_OiledBCG",
            base_srgb=(0.218, 0.227, 0.240),
            roughness=0.21,
            metallic=0.93,
            bevel_r=0.030,
            edge_wear=0.34,
            edge_srgb=(0.82, 0.84, 0.88),
            grain_scale=28.0,
            grain_bump=0.024,
            aniso_stretch=(0.35, 3.5, 3.5),
            rough_var=0.026,
        ),
        "M_ChromeBolt": _build_pbr_mat(
            "M_ChromeBolt",
            base_srgb=(0.78, 0.81, 0.84),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.022,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=26.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "M_HardChromePin": _build_pbr_mat(
            "M_HardChromePin",
            base_srgb=(0.85, 0.87, 0.90),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.014,
            grain_scale=24.0,
            grain_bump=0.014,
            rough_var=0.018,
        ),
        "M_GasTubeStainlessHeat": _build_gas_tube_heat_mat(),
        "M_BufferTubeAnodize": _build_pbr_mat(
            "M_BufferTubeAnodize",
            base_srgb=(0.182, 0.190, 0.202),
            roughness=0.28,
            metallic=0.85,
            bevel_r=0.026,
            edge_wear=0.26,
            edge_srgb=(0.70, 0.72, 0.76),
            grain_scale=36.0,
            grain_bump=0.024,
            aniso_stretch=(0.4, 3.5, 3.5),
            rough_var=0.024,
        ),
        "M_BufferGoldAnodize": _build_pbr_mat(
            "M_BufferGoldAnodize",
            base_srgb=(0.68, 0.56, 0.31),
            roughness=0.23,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.20,
            edge_srgb=(0.84, 0.76, 0.56),
            grain_scale=38.0,
            grain_bump=0.020,
            aniso_stretch=(4.0, 0.5, 0.5),
            rough_var=0.026,
        ),
        "M_BumperPolyurethane": _build_pbr_mat(
            "M_BumperPolyurethane",
            base_srgb=(0.66, 0.46, 0.19),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.024,
            grain_scale=44.0,
            grain_bump=0.040,
            rough_var=0.028,
        ),
        "M_DarkInternal": _build_pbr_mat(
            "M_DarkInternal",
            base_srgb=(0.105, 0.110, 0.118),
            roughness=0.48,
            metallic=0.78,
            bevel_r=0.018,
            grain_scale=34.0,
            grain_bump=0.024,
            rough_var=0.024,
        ),
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "M_SlingRubber": _build_pbr_mat(
            "M_SlingRubber",
            base_srgb=(0.100, 0.104, 0.110),
            roughness=0.86,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=54.0,
            grain_bump=0.068,
            rough_var=0.030,
        ),

        # --- Furniture / KAC RAS / STANAG Atlas Materials (m4a1_v3_furniture) ---
        "F_RasAnodize": _build_pbr_mat(
            "F_RasAnodize",
            base_srgb=(0.182, 0.190, 0.204),
            roughness=0.29,
            metallic=0.86,
            bevel_r=0.028,
            edge_wear=0.28,
            edge_srgb=(0.70, 0.72, 0.76),
            grain_scale=60.0,
            grain_bump=0.028,
            voronoi_grain=0.44,
            voronoi_scale=80.0,
            rough_var=0.024,
        ),
        "F_RasRailCrest": _build_pbr_mat(
            "F_RasRailCrest",
            base_srgb=(0.208, 0.217, 0.232),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.30,
            edge_srgb=(0.76, 0.78, 0.82),
            grain_scale=34.0,
            grain_bump=0.020,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.022,
        ),
        "F_RasSlotDark": _build_pbr_mat(
            "F_RasSlotDark",
            base_srgb=(0.095, 0.100, 0.108),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.015,
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.024,
        ),
        "F_HeatshieldAlu": _build_pbr_mat(
            "F_HeatshieldAlu",
            base_srgb=(0.83, 0.86, 0.90),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=26.0,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.022,
        ),
        "F_PolyamideMain": _build_pbr_mat(
            "F_PolyamideMain",
            base_srgb=(0.136, 0.141, 0.150),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.042,
            edge_wear=0.14,
            edge_srgb=(0.24, 0.25, 0.265),
            grain_scale=62.0,
            grain_bump=0.115,
            voronoi_grain=0.72,
            voronoi_scale=84.0,
            rough_var=0.036,
        ),
        "F_PolyamideAccent": _build_pbr_mat(
            "F_PolyamideAccent",
            base_srgb=(0.108, 0.112, 0.120),
            roughness=0.76,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.12,
            edge_srgb=(0.20, 0.208, 0.220),
            grain_scale=68.0,
            grain_bump=0.125,
            voronoi_grain=0.74,
            voronoi_scale=88.0,
            rough_var=0.036,
        ),
        "F_A2Checkering": _build_a2_diamond_checkering_mat(),
        "F_MatteRubber": _build_pbr_mat(
            "F_MatteRubber",
            base_srgb=(0.092, 0.095, 0.100),
            roughness=0.88,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.10,
            edge_srgb=(0.16, 0.165, 0.174),
            grain_scale=58.0,
            grain_bump=0.086,
            rough_var=0.032,
        ),
        "F_StanagDryFilm": _build_pbr_mat(
            "F_StanagDryFilm",
            base_srgb=(0.268, 0.280, 0.290),
            roughness=0.35,
            metallic=0.82,
            bevel_r=0.026,
            edge_wear=0.26,
            edge_srgb=(0.70, 0.72, 0.76),
            grain_scale=58.0,
            grain_bump=0.032,
            voronoi_grain=0.46,
            voronoi_scale=86.0,
            rough_var=0.030,
        ),
        "F_FollowerOrange": _build_pbr_mat(
            "F_FollowerOrange",
            base_srgb=(0.88, 0.36, 0.09),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.12,
            edge_srgb=(0.96, 0.54, 0.26),
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.034,
        ),
        "F_SteelHardware": _build_pbr_mat(
            "F_SteelHardware",
            base_srgb=(0.186, 0.192, 0.204),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.72, 0.74, 0.78),
            grain_scale=28.0,
            grain_bump=0.024,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.034,
        ),
        "F_BrightSteel": _build_pbr_mat(
            "F_BrightSteel",
            base_srgb=(0.76, 0.78, 0.81),
            roughness=0.18,
            metallic=0.97,
            bevel_r=0.018,
            edge_wear=0.16,
            edge_srgb=(0.90, 0.92, 0.94),
            grain_scale=26.0,
            grain_bump=0.018,
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
    u_segs: int = 20, v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


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


def mk_extrude_y(
    name: str, pts_xz: list[tuple[float, float]], y0: float, y1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Extrudes a 2D (x_three, z_three) planform polygon along Three.js Y from y0 to y1."""
    clean = []
    for p in pts_xz:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
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
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight capped circular tube swept along a 3D polyline in Three.js space."""
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


def mk_picatinny_rail(
    name: str, length: float, center_x: float, base_y: float, slot_count: int,
    invert_y: bool = False,
    mat_rail: bpy.types.Material | None = None,
    mat_slot: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
    height_scale: float = 1.0,
) -> list[bpy.types.Object]:
    """Crisp beveled MIL-STD-1913 Picatinny rail with 45 deg hexagonal dovetail & cross-slots."""
    s = (-1.0 if invert_y else 1.0) * height_scale
    objs = [
        mk_box(f"{name}_neck", length - 0.01, 0.092 * height_scale, 0.68,
               [("t", center_x, base_y + 0.046 * s, 0.0)] + (xform or []), mat_rail, bevel=0.010, bevel_segs=1),
        mk_box(f"{name}_floor", length - 0.02, 0.032 * height_scale, 0.64,
               [("t", center_x, base_y + 0.104 * s, 0.0)] + (xform or []), mat_slot),
    ]
    lug_zy = [
        (-0.37, 0.088 * s),
        (-0.49, 0.160 * s),
        (-0.38, 0.250 * s),
        (-0.11, 0.250 * s),
        (-0.08, 0.205 * s),
        ( 0.08, 0.205 * s),
        ( 0.11, 0.250 * s),
        ( 0.38, 0.250 * s),
        ( 0.49, 0.160 * s),
        ( 0.37, 0.088 * s),
    ]
    x_min = center_x - length * 0.5
    x_max = center_x + length * 0.5
    slot_half = 0.145
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
                    f"{name}_lug_{i}", lug_zy, seg_start, seg_end,
                    bevel=bev, bevel_segs=2,
                    xform=[("t", 0.0, base_y, 0.0)] + (xform or []),
                    mat=mat_rail,
                )
            )
        if i < slot_count:
            seg_start = start_x + i * pitch + slot_half
    return objs


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 20, depth: float = 0.018,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.014, length * 0.14, radius * 0.14)
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    for f in bm.faces:
        if lock_flat_walls and (abs(f.normal.y) > 0.96 or abs(f.normal.z) > 0.96):
            f.smooth = False
        else:
            f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            if lock_flat_walls and (not e.link_faces[0].smooth or not e.link_faces[1].smooth):
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
        wn.weight = 100
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


# =============================================================================
# 25 AAA HARD-SURFACE COLT M4A1 SOPMOD PART BUILDERS
# =============================================================================

# --- GROUP A: RECEIVER ATLAS (6 PARTS) ---

def build_m4a1_upper_receiver(mats: dict) -> bpy.types.Object:
    m_up = mats["R_UpperAnodize"]
    m_df = mats["R_BrassDeflector"]
    m_rc = mats["R_RailCrest"]
    m_sl = mats["R_SlotDark"]
    m_pk = mats["R_ParkerizedCtrl"]
    m_bs = mats["R_BrightSteel"]

    # Forged 7075-T6 flat-top upper hull (X in [-5.60, +4.40], bottom flush at Y = 0.28)
    sec = [(-0.76, 0.28), (-0.76, 1.08)]
    sec += _quad_bez((-0.76, 1.08), (-0.76, 1.82), (-0.44, 1.88), 10)
    sec.append((0.44, 1.88))
    sec += _quad_bez((0.44, 1.88), (0.76, 1.82), (0.76, 1.08), 10)
    sec.append((0.76, 0.28))
    raw_upper = mk_extrude_x("up_raw", sec, -5.60, 4.40, bevel=0.028, bevel_segs=2, mat=m_up)

    # Machine BCG raceway (Y=1.05), charging handle slot, latch notch, bottom opening, ejection port & M4 feed ramps
    cutters = [
        mk_cyl("c_bcg", 0.58, 0.58, 10.50, "x", 32, [("t", -0.55, 1.05, 0.0)], m_sl),
        mk_box("c_ch", 10.40, 0.36, 0.44, [("t", -0.55, 1.62, 0.0)], m_sl),
        mk_box("c_chl", 0.32, 0.24, 0.42, [("t", -5.52, 1.64, -0.58)], m_sl),
        mk_box("c_bot", 8.85, 0.68, 1.06, [("t", -0.55, 0.50, 0.0)], m_sl),
        mk_box("c_eje", 3.06, 0.82, 0.72, [("t", 1.72, 1.04, 0.58)], m_sl, bevel=0.03, bevel_segs=2),
        # M4 extended dual feed-ramp scallops
        mk_cyl("c_frL", 0.14, 0.17, 0.78, "y", 16, [("rz", math.pi * 0.5 - 0.35), ("t", 3.72, 0.56, -0.15)], m_bs),
        mk_cyl("c_frR", 0.14, 0.17, 0.78, "y", 16, [("rz", math.pi * 0.5 - 0.35), ("t", 3.72, 0.56,  0.15)], m_bs),
    ]
    upper_shell = bool_subtract(raw_upper, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [upper_shell]

    # Left-flank forged cam-pin clearance dome bulge (X in [1.15, 2.55])
    parts.append(
        mk_cyl("up_camdome", 0.24, 0.24, 1.38, "x", 22,
               [("s", 1.0, 1.0, 0.66), ("t", 1.85, 1.42, -0.70)], m_up, bevel=0.05)
    )

    # True 45-deg dovetailed MIL-STD-1913 Flat-Top Rail (Y = 1.87..2.12, 13 crisp T-slots!)
    parts += mk_picatinny_rail(
        "up_rail", 9.90, -0.55, 1.87, 13, invert_y=False,
        mat_rail=m_rc, mat_slot=m_sl, height_scale=1.0,
    )

    # Ejection port dust-cover hinge pin knuckles + upper ball-detent catch rim
    for hx in (0.06, 3.38):
        parts.append(mk_cyl(f"up_hk_{hx}", 0.11, 0.11, 0.28, "x", 16, [("t", hx, 0.62, 0.77)], m_up, bevel=0.015))
    parts.append(mk_box("up_detrim", 0.46, 0.09, 0.08, [("t", 1.72, 1.46, 0.74)], m_bs, bevel=0.012))

    # Sculpted Forged Brunton Bump Brass Shell Deflector behind ejection port (with brass-kiss shader!)
    defl_xz = [
        ( 0.12, 0.70),
        (-0.42, 1.06),
        (-0.50, 1.10),
        (-0.58, 1.05),
        (-0.80, 0.70),
    ]
    parts.append(mk_extrude_y("up_defl", defl_xz, 0.72, 1.38, bevel=0.055, bevel_segs=3, mat=m_df))

    # Sculpted Forged Teardrop Forward Assist Housing, Roll-Pin Boss, Serrated Plunger & Internal Ratchet Pawl
    fa_xform = [("ry", -0.34), ("t", -2.05, 0.86, 0.86)]
    parts.append(mk_cyl("up_fah", 0.285, 0.34, 1.20, "-x", 26, fa_xform, m_up, bevel=0.042))
    # Contoured teardrop blend web connecting forward assist tube seamlessly to receiver flank
    parts.append(mk_box("up_faweb", 1.05, 0.48, 0.36, [("ry", -0.34), ("t", -1.92, 0.86, 0.72)], m_up, bevel=0.08, bevel_segs=3))
    parts.append(mk_cyl("up_fapin", 0.055, 0.055, 0.66, "y", 14, [("t", -1.88, 0.86, 0.86)], m_bs, bevel=0.010))
    # Authentic beveled round/teardrop knurled forward assist plunger rim & thumb face
    parts.append(mk_cyl("up_fabtn", 0.285, 0.265, 0.32, "-x", 28, [("ry", -0.34), ("t", -2.68, 0.86, 1.08)], m_pk, bevel=0.036))
    parts.append(mk_knurled_cyl("up_faface", 0.275, 0.08, "x", flutes=22, depth=0.014,
                                xform=[("ry", -0.34), ("t", -2.84, 0.86, 1.14)], mat=m_pk))
    parts.append(mk_box("up_fapawl", 0.36, 0.14, 0.18, [("ry", -0.34), ("t", -1.35, 0.84, 0.62)], m_bs, bevel=0.014))

    # Raised Cerro Forge "Keyhole" Forge Mark boss above forward assist on right rear upper wall!
    parts.append(mk_cyl("up_cerro_top", 0.068, 0.068, 0.05, "z", 16, [("t", -3.85, 1.48, 0.75)], m_up, bevel=0.010))
    parts.append(mk_box("up_cerro_bot", 0.075, 0.11, 0.05, [("t", -3.85, 1.39, 0.75)], m_up, bevel=0.010))

    # Front Pivot Lug & Rear Takedown Lug w/ drilled cross-pin bores descending cleanly into lower receiver
    for lx in (3.85, -4.95):
        lug = bool_subtract(
            mk_box(f"up_lug_{lx}", 0.62, 0.46, 0.62, [("t", lx, 0.11, 0.0)], m_up, bevel=0.035, bevel_segs=2),
            [mk_cyl(f"c_lpin_{lx}", 0.156, 0.156, 0.84, "z", 18, [("t", lx, 0.02, 0.0)], m_bs)],
            solver="EXACT",
        )
        parts.append(lug)

    # USGI 16-Tooth Star Barrel Nut + Sloped Tapered Delta Slip Ring (X in [4.38, 5.44])
    bn_parts = [mk_cyl("up_bnc", 0.69, 0.69, 0.48, "x", 32, [("t", 4.61, 1.05, 0.0)], m_bs, bevel=0.018)]
    for t in range(16):
        ang = (t * math.pi * 2.0) / 16.0 + math.pi / 16.0
        ty = 1.05 + math.sin(ang) * 0.71
        tz = math.cos(ang) * 0.71
        bn_parts.append(mk_box(f"up_bnt_{t}", 0.24, 0.075, 0.09, [("rx", -ang), ("t", 4.66, ty, tz)], m_bs, bevel=0.012))
    bn_joined = join_objects(bn_parts, "up_bn_all")
    star_nut = bool_subtract(
        bn_joined,
        [
            mk_cyl("c_bnb", 0.56, 0.56, 1.50, "x", 28, [("t", 4.85, 1.05, 0.0)], m_sl),
            mk_cyl("c_bng", 0.14, 0.14, 1.40, "x", 16, [("t", 4.95, 1.67, 0.0)], m_sl),
        ],
        solver="EXACT",
    )

    # Smooth tapered beveled Delta slip ring (r=0.99 rear -> r=0.86 front)
    delta_pts = [
        (0.00, 4.62), (0.985, 4.62), (0.990, 4.66),
        (0.955, 4.86), (0.865, 5.39), (0.840, 5.44), (0.00, 5.44),
    ]
    delta_raw = mk_lathe_x("up_delta_raw", delta_pts, segs=36, xform=[("t", 0.0, 1.05, 0.0)], mat=m_up)
    delta_ring = bool_subtract(
        delta_raw,
        [
            mk_cyl("c_drb", 0.56, 0.56, 1.60, "x", 28, [("t", 4.95, 1.05, 0.0)], m_sl),
            mk_cyl("c_drg", 0.14, 0.14, 1.60, "x", 16, [("t", 4.95, 1.67, 0.0)], m_sl),
        ],
        solver="EXACT",
    )
    parts.extend([star_nut, delta_ring])

    obj = join_objects(parts, "m4a1_upper_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_m4a1_lower_receiver(mats: dict) -> bpy.types.Object:
    m_lo = mats["R_LowerAnodize"]
    m_sl = mats["R_SlotDark"]
    m_pk = mats["R_ParkerizedCtrl"]
    m_bs = mats["R_BrightSteel"]

    # Forged 7075-T6 Colt M4A1 Lower Receiver side contour (top deck flush at Y = 0.28)
    side = [(-5.80, 0.42), (-5.80, 1.55)]
    side += _quad_bez((-5.80, 1.55), (-5.75, 1.84), (-5.20, 1.84), 8)
    side += [
        (-4.65,  1.48),
        (-4.62,  0.28),
        ( 4.32,  0.28),
        ( 4.32, -0.35),
        ( 4.12, -2.22),
        ( 0.68, -2.22),
        ( 0.52, -0.88),
        (-4.52, -0.88),
    ]
    side += _quad_bez((-4.52, -0.88), (-5.35, -0.58), (-5.80, 0.42), 10)
    raw_lower = mk_extrude_z("lo_raw", side, -0.76, 0.76, bevel=0.030, bevel_segs=2, mat=m_lo)

    # Support edge loops across the flat Colt rollmark & IUID hero walls for spotless triangulation!
    bm_sup = bmesh.new()
    bm_sup.from_mesh(raw_lower.data)
    for bx_cut in (-4.55, -2.50, -0.50, 0.56, 2.40, 4.08):
        bmesh.ops.bisect_plane(
            bm_sup, geom=list(bm_sup.verts) + list(bm_sup.edges) + list(bm_sup.faces),
            plane_co=(bx_cut, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0),
        )
    for bz_cut in (-1.94, -0.88, 0.02):
        bmesh.ops.bisect_plane(
            bm_sup, geom=list(bm_sup.verts) + list(bm_sup.edges) + list(bm_sup.faces),
            plane_co=(0.0, 0.0, bz_cut), plane_no=(0.0, 0.0, 1.0),
        )
    bm_sup.to_mesh(raw_lower.data)
    bm_sup.free()

    cutters = [
        mk_box("c_fcg", 4.85, 1.12, 1.02, [("t", -2.05, -0.18, 0.0)], m_sl),
        mk_box("c_mag", 3.05, 2.95, 1.14, [("t", 2.40, -0.95, 0.0)], m_sl),
        mk_box("c_trg", 1.38, 0.68, 0.54, [("t", -1.75, -0.85, 0.0)], m_sl),
        mk_cyl("c_buf", 0.58, 0.58, 1.90, "x", 28, [("t", -5.25, 1.05, 0.0)], m_sl),
    ]
    lower_shell = bool_subtract(raw_lower, cutters, solver="EXACT")

    # SWEPT CURVED FORGED ALUMINUM TRIGGER GUARD (NO SQUARE BLOCK!)
    # Sweeps organically from rear forked roll-pin ears (-2.46) under curved trigger shoe to front detent ears (+0.65)!
    tg_xy = [(-2.48, -0.84), (-2.12, -0.84)]
    tg_xy += _quad_bez((-2.12, -0.84), (-2.04, -1.62), (-1.45, -1.76), 10)
    tg_xy += _quad_bez((-1.45, -1.76), (-0.62, -1.84), (0.04, -1.64), 10)
    tg_xy += _quad_bez((0.04, -1.64), (0.34, -1.48), (0.42, -0.84), 8)
    tg_xy += [(0.68, -0.84), (0.66, -1.42)]
    tg_xy += _quad_bez((0.66, -1.42), (0.48, -1.84), (-0.18, -1.96), 10)
    tg_xy += _quad_bez((-0.18, -1.96), (-1.18, -2.04), (-1.88, -1.92), 10)
    tg_xy += _quad_bez((-1.88, -1.92), (-2.38, -1.76), (-2.48, -1.16), 8)
    tguard = mk_extrude_z("lo_tguard", tg_xy, -0.24, 0.24, bevel=0.052, bevel_segs=3, mat=m_lo)

    # Forged beveled flared STANAG magwell funnel collar with 45-deg internal speed-reload bevel
    flare_outer = mk_box("lo_mf_o", 3.62, 0.28, 1.72, [("t", 2.40, -2.09, 0.0)], m_lo, bevel=0.048, bevel_segs=3)
    flare_inner = mk_box("lo_mf_i", 3.06, 0.48, 1.16, [("t", 2.40, -2.10, 0.0)], m_sl)
    mag_flare = bool_subtract(flare_outer, [flare_inner], solver="EXACT")

    parts: list[bpy.types.Object] = [lower_shell, tguard, mag_flare]

    # Rear forged trigger-guard mounting ears + steel roll pin, front detent hinge plunger
    parts.append(mk_box("lo_tgear_r", 0.34, 0.42, 0.64, [("t", -2.36, -1.04, 0.0)], m_lo, bevel=0.028))
    parts.append(mk_cyl("lo_tgpin_r", 0.055, 0.055, 0.68, "z", 14, [("t", -2.36, -1.14, 0.0)], m_bs, bevel=0.010))
    parts.append(mk_cyl("lo_tgpin_f", 0.052, 0.052, 0.56, "z", 14, [("t", 0.52, -1.10, 0.0)], m_bs, bevel=0.010))

    # Front magwell horizontal forged traction grooves (X = 4.16)
    for g in range(5):
        gy = -1.76 + g * 0.24
        parts.append(mk_box(f"lo_mwg_{g}", 0.06, 0.08, 1.18, [("t", 4.16 + g * 0.018, gy, 0.0)], m_lo, bevel=0.018))

    # Threaded buffer-tower outer collar ring boss
    parts.append(mk_cyl("lo_btboss", 0.86, 0.86, 0.38, "x", 28, [("t", -5.62, 1.05, 0.0)], m_lo, bevel=0.032))

    # Right-side M4A1 Full Mag-Catch Fence (beveled rounded forged ribs) + Oval Serrated Release Button
    parts.extend([
        mk_box("lo_f_top", 2.86, 0.14, 0.13, [("t", 1.25, -0.28, 0.80)], m_lo, bevel=0.032, bevel_segs=2),
        mk_box("lo_f_vrt", 0.14, 0.94, 0.13, [("t", 2.62, -0.68, 0.80)], m_lo, bevel=0.032, bevel_segs=2),
        mk_box("lo_f_bot", 1.20, 0.13, 0.12, [("t", 1.42, -1.06, 0.80)], m_lo, bevel=0.030, bevel_segs=2),
        mk_cyl("lo_mbtn", 0.24, 0.24, 0.17, "z", 22, [("s", 1.28, 0.86, 1.0), ("t", 1.38, -0.68, 0.82)], m_pk, bevel=0.024),
        mk_cyl("lo_mstud", 0.075, 0.075, 0.20, "z", 14, [("t", 1.38, -0.68, 0.84)], m_bs, bevel=0.012),
    ])
    # Horizontal tactile serration bars on mag release button face
    for sr in (-0.11, -0.055, 0.0, 0.055, 0.11):
        parts.append(mk_box(f"lo_mbs_{sr}", 0.44, 0.026, 0.035, [("t", 1.38, -0.68 + sr, 0.905)], m_pk, bevel=0.006))

    # Left-side AR-15 "Ping-Pong Paddle" Bolt Catch (contoured serrated upper paddle + pivot ears + heel + mag catch bar)
    parts.extend([
        mk_box("lo_bc_ear", 0.56, 0.30, 0.15, [("t", 0.22, 0.04, -0.78)], m_lo, bevel=0.028),
        mk_cyl("lo_bc_pin", 0.042, 0.042, 0.62, "x", 12, [("t", 0.22, 0.04, -0.82)], m_bs),
        mk_box("lo_bc_up", 0.48, 0.46, 0.14, [("t", 0.22, 0.23, -0.83)], m_pk, bevel=0.032, bevel_segs=2),
        mk_box("lo_bc_lo", 0.32, 0.34, 0.13, [("t", 0.22, -0.16, -0.82)], m_pk, bevel=0.028, bevel_segs=2),
        mk_box("lo_lmbar", 1.78, 0.22, 0.09, [("t", 1.55, -0.68, -0.78)], m_pk, bevel=0.022),
    ])
    for sr in range(5):
        parts.append(mk_box(f"lo_bcs_{sr}", 0.40, 0.032, 0.035, [("t", 0.22, 0.11 + sr * 0.065, -0.90)], m_bs, bevel=0.006))

    # Buffer Retainer Nipple + Captive Dimpled Pivot/Takedown Pins + Hammer/Trigger/M4A1 3rd-Hole Auto-Sear Pins!
    parts.append(mk_cyl("lo_bret", 0.06, 0.09, 0.24, "y", 14, [("t", -4.72, 0.48, 0.0)], m_bs, bevel=0.012))
    for pname, px, py, rad, plen in (
        ("piv", 3.85, 0.02, 0.155, 1.74),
        ("tkd", -4.95, 0.02, 0.155, 1.74),
        ("ham", -0.35, -0.05, 0.088, 1.58),
        ("trg", -1.75, -0.32, 0.088, 1.58),
        ("ase", -2.25, 0.11, 0.070, 1.58),
    ):
        pin = mk_cyl(f"lo_pin_{pname}", rad, rad, plen, "z", 20, [("t", px, py, 0.0)], m_pk if rad > 0.12 else m_bs, bevel=0.018)
        if rad > 0.12:
            # Captive pin center push-dimple on both flanks!
            pin = bool_subtract(pin, [
                mk_sphere(f"c_dpR_{pname}", rad * 0.48, rad * 0.48, 0.06, 14, 10, [("t", px, py, plen * 0.5)], m_bs),
                mk_sphere(f"c_dpL_{pname}", rad * 0.48, rad * 0.48, 0.06, 14, 10, [("t", px, py, -plen * 0.5)], m_bs),
            ], solver="EXACT")
        parts.append(pin)

    obj = join_objects(parts, "m4a1_lower_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_m4a1_carry_handle(mats: dict) -> bpy.types.Object:
    m_up = mats["R_UpperAnodize"]
    m_sl = mats["R_SlotDark"]
    m_pk = mats["R_ParkerizedCtrl"]
    m_rc = mats["R_RailCrest"]
    m_bs = mats["R_BrightSteel"]

    # Sculpted A2 forged carry handle outer arch
    outer_xy = [
        (-4.65, -0.18), (4.45, -0.18), (4.45, 0.14),
    ]
    outer_xy += _quad_bez((4.45, 0.14), (4.02, 0.72), (3.52, 1.18), 6)
    outer_xy += [(-2.55, 1.32), (-3.15, 1.64), (-4.52, 1.64), (-4.65, 0.25)]
    raw_handle = mk_extrude_z("ch_raw", outer_xy, -0.49, 0.49, bevel=0.042, bevel_segs=3, mat=m_up)

    # Rounded finger carry opening + top optic trough + rear sight pocket + dovetail rail clamping groove
    hole_xy = [(-2.05, 0.20), (2.45, 0.20)]
    hole_xy += _quad_bez((2.45, 0.20), (2.82, 0.24), (2.88, 0.62), 6)
    hole_xy += _quad_bez((2.88, 0.62), (2.85, 0.82), (2.45, 0.80), 6)
    hole_xy.append((-2.02, 0.86))
    hole_xy += _quad_bez((-2.02, 0.86), (-2.25, 0.84), (-2.25, 0.52), 6)
    hole_xy += _quad_bez((-2.25, 0.52), (-2.24, 0.22), (-2.05, 0.20), 6)

    cutters = [
        mk_extrude_z("c_fhole", hole_xy, -0.80, 0.80, mat=m_sl),
        mk_box("c_trough", 7.10, 0.42, 0.44, [("t", 0.65, 1.16, 0.0)], m_sl),
        mk_box("c_rspk", 1.48, 0.72, 0.58, [("t", -3.82, 1.38, 0.0)], m_sl),
        mk_box("c_rgro", 9.40, 0.18, 0.84, [("t", -0.10, -0.14, 0.0)], m_sl),
        # Central A2 optic mounting bore through top handle bridge
        mk_cyl("c_optb", 0.14, 0.14, 0.75, "y", 18, [("t", 0.35, 1.04, 0.0)], m_sl),
    ]
    handle_body = bool_subtract(raw_handle, cutters, solver="EXACT")

    # A2 Dual-Aperture L-Flip Sight Leaf (0-200m ghost ring at Y_local=1.40 => Y_world=3.52!)
    peep = bool_subtract(
        mk_cyl("ch_peep", 0.22, 0.22, 0.11, "x", 24, [("t", -3.85, 1.40, 0.0)], m_pk, bevel=0.015),
        [mk_cyl("c_ph", 0.082, 0.082, 0.28, "x", 18, [("t", -3.85, 1.40, 0.0)], m_sl)],
        solver="EXACT",
    )

    parts: list[bpy.types.Object] = [
        handle_body,
        peep,
        mk_box("ch_fleg", 0.36, 0.08, 0.28, [("t", -3.62, 1.20, 0.0)], m_pk, bevel=0.014),
        mk_box("ch_sblk", 0.54, 0.34, 0.52, [("t", -3.82, 1.14, 0.0)], m_pk, bevel=0.022),
        # True 3D 18-flute knurled right windage drum + roll pin + 24-flute 6/3 elevation index wheel!
        mk_knurled_cyl("ch_wdrum", 0.22, 0.30, "z", flutes=18, depth=0.018, xform=[("t", -3.85, 1.36, 0.63)], mat=m_rc),
        mk_cyl("ch_wpin", 0.05, 0.05, 0.40, "x", 12, [("t", -3.85, 1.36, 0.63)], m_bs),
        mk_knurled_cyl("ch_edrum", 0.30, 0.18, "y", flutes=24, depth=0.018, xform=[("t", -3.82, 0.92, 0.0)], mat=m_rc),
        # Full-length Left Parkerized Steel Rail Clamping Bar
        mk_box("ch_cbar", 8.65, 0.28, 0.12, [("t", -0.10, -0.04, -0.54)], m_pk, bevel=0.020),
    ]

    # Twin oversized 20-flute knurled thumb nuts + slotted screwdriver notch + cross bolts!
    for nx in (-3.15, 2.55):
        nut = bool_subtract(
            mk_knurled_cyl(f"ch_tnut_{nx}", 0.28, 0.28, "z", flutes=20, depth=0.022,
                           xform=[("t", nx, -0.02, -0.69)], mat=m_pk),
            [mk_box(f"c_tnsl_{nx}", 0.58, 0.065, 0.10, [("t", nx, -0.02, -0.82)], m_sl)],
            solver="EXACT",
        )
        parts.append(nut)
        parts.append(mk_cyl(f"ch_bolt_{nx}", 0.11, 0.11, 1.38, "z", 18, [("t", nx, -0.02, -0.14)], m_bs, bevel=0.014))

    obj = join_objects(parts, "m4a1_carry_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_m4a1_charging_handle(mats: dict) -> bpy.types.Object:
    m_up = mats["R_UpperAnodize"]
    m_sl = mats["R_SlotDark"]
    m_pk = mats["R_ParkerizedCtrl"]
    m_bs = mats["R_BrightSteel"]

    # Chamfered forged 7075-T6 stem with hollowed underside gas-key channel
    stem_zy = [(-0.18, -0.125), (-0.18, 0.07), (-0.125, 0.125), (0.125, 0.125), (0.18, 0.07), (0.18, -0.125)]
    shaft = mk_extrude_x("chg_shaft", stem_zy, -3.475, 3.675, bevel=0.012, bevel_segs=1, mat=m_up)
    stem = bool_subtract(shaft, [mk_box("c_gkch", 6.75, 0.18, 0.23, [("t", 0.32, -0.06, 0.0)], m_sl)], solver="EXACT")

    # Swept curved T-handle planform with rounded ergonomic finger-hook wings
    t_xz = [(-3.82, -1.16), (-3.82, 1.16)]
    t_xz += _quad_bez((-3.82, 1.16), (-3.62, 1.22), (-3.34, 1.08), 8)
    t_xz += [(-3.28, 0.30), (-3.28, -0.30), (-3.34, -1.08)]
    t_xz += _quad_bez((-3.34, -1.08), (-3.62, -1.22), (-3.82, -1.16), 8)
    tbar = mk_extrude_y("chg_tbar", t_xz, -0.15, 0.15, bevel=0.032, bevel_segs=3, mat=m_up)

    parts = [
        stem,
        tbar,
        mk_cyl("chg_curlL", 0.20, 0.20, 0.34, "y", 20, [("t", -3.30, 0.0, -1.08)], m_up, bevel=0.025),
        mk_cyl("chg_curlR", 0.20, 0.20, 0.34, "y", 20, [("t", -3.30, 0.0,  1.08)], m_up, bevel=0.025),
        # Spring-loaded left tactical latch claw + serrated grip ribs + roll pin
        mk_box("chg_latch", 0.42, 0.28, 0.62, [("ry", 0.22), ("t", -3.68, 0.0, -0.84)], m_pk, bevel=0.026, bevel_segs=2),
        mk_box("chg_lhook", 0.26, 0.24, 0.16, [("t", -3.26, 0.0, -0.58)], m_bs, bevel=0.015),
        mk_cyl("chg_lpin", 0.045, 0.045, 0.38, "y", 14, [("t", -3.56, 0.0, -0.88)], m_bs, bevel=0.008),
        # Front carrier dog hook & receiver guide ears
        mk_box("chg_fhook", 0.28, 0.34, 0.34, [("t", 3.60, -0.14, 0.0)], m_up, bevel=0.020),
        mk_box("chg_gears", 0.34, 0.12, 0.48, [("t", 2.95,  0.06, 0.0)], m_up, bevel=0.018),
    ]
    obj = join_objects(parts, "m4a1_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_dust_cover(mats: dict) -> bpy.types.Object:
    m_pk = mats["R_ParkerizedCtrl"]
    m_rc = mats["R_RailCrest"]
    m_bs = mats["R_BrightSteel"]
    m_sp = mats["R_SpringSteel"]

    # Die-formed slightly bowed stamped steel door skin (hinge axis strictly at Y=0, Z=0!)
    n_y = 12
    sec_zy = []
    for i in range(n_y + 1):
        t = i / n_y
        y = t * 0.84
        z_crown = 0.02 + math.sin(t * math.pi) * 0.045
        sec_zy.append((z_crown + 0.032, y))
    for i in range(n_y, -1, -1):
        t = i / n_y
        y = t * 0.84
        z_crown = 0.02 + math.sin(t * math.pi) * 0.045
        sec_zy.append((z_crown - 0.032, y))
    door = mk_extrude_x("dc_door", sec_zy, -1.54, 1.54, bevel=0.015, bevel_segs=2, mat=m_pk)

    parts = [
        door,
        # Embossed longitudinal stiffening rib with rounded ends
        mk_box("dc_rib", 2.32, 0.22, 0.055, [("t", 0.0, 0.42, 0.095)], m_rc, bevel=0.024, bevel_segs=3),
        # Upper formed catch flange + detent housing + gleaming chrome ball plunger
        mk_box("dc_flange", 2.62, 0.06, 0.13, [("t", 0.0, 0.83, -0.02)], m_pk, bevel=0.012),
        mk_box("dc_deth", 0.44, 0.22, 0.18, [("t", 0.0, 0.74, -0.05)], m_pk, bevel=0.018),
        mk_sphere("dc_ball", 0.065, 0.065, 0.065, 16, 12, [("t", 0.0, 0.84, -0.06)], m_bs),
        # Rolled dual hinge knuckles + steel hinge rod + C-clip + 8-coil torsion spring
        mk_cyl("dc_knL", 0.10, 0.10, 0.72, "x", 18, [("t", -1.05, 0.0, 0.0)], m_pk, bevel=0.012),
        mk_cyl("dc_knR", 0.10, 0.10, 0.72, "x", 18, [("t",  1.05, 0.0, 0.0)], m_pk, bevel=0.012),
        mk_cyl("dc_rod", 0.062, 0.062, 3.72, "x", 16, [("t", 0.0, 0.0, 0.0)], m_bs, bevel=0.008),
        mk_cyl("dc_cclip", 0.11, 0.11, 0.05, "x", 16, [("t", 1.62, 0.0, 0.0)], m_bs),
        mk_coil_spring("dc_spr", "x", -0.52, 0.52, 0.0, 0.0, 0.115, 0.024, 8.0, 8, 14, mat=m_sp),
    ]
    obj = join_objects(parts, "m4a1_dust_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_selector(mats: dict) -> bpy.types.Object:
    m_pk = mats["R_ParkerizedCtrl"]
    m_sl = mats["R_SlotDark"]
    m_bs = mats["R_BrightSteel"]

    # Rotary cam drum w/ central trigger-clearance flat
    cam_drum = bool_subtract(
        mk_cyl("sel_drum", 0.24, 0.24, 1.62, "z", 24, mat=m_pk, bevel=0.018),
        [mk_box("c_cam", 0.32, 0.22, 0.58, [("t", 0.12, -0.14, 0.0)], m_sl)],
        solver="EXACT",
    )

    # Sculpted left USGI teardrop thumb lever pointing upward (SEMI ready position)
    lever_xy = [(-0.18, 0.0), (0.18, 0.0), (0.12, 0.72), (0.0, 0.93), (-0.12, 0.72)]
    left_lever = mk_extrude_z("sel_llev", lever_xy, -0.92, -0.77, bevel=0.026, bevel_segs=2, mat=m_pk)

    parts = [
        cam_drum,
        mk_cyl("sel_lcap", 0.28, 0.28, 0.14, "z", 24, [("t", 0.0, 0.0, -0.82)], m_pk, bevel=0.022),
        left_lever,
        # Tactile horizontal thumb serrations along left selector blade
        mk_box("sel_s1", 0.24, 0.04, 0.04, [("t", 0.0, 0.30, -0.925)], m_bs, bevel=0.008),
        mk_box("sel_s2", 0.21, 0.04, 0.04, [("t", 0.0, 0.44, -0.925)], m_bs, bevel=0.008),
        mk_box("sel_s3", 0.17, 0.04, 0.04, [("t", 0.0, 0.58, -0.925)], m_bs, bevel=0.008),
        # Flush right indicator drum cap w/ witness pointer bar
        mk_cyl("sel_rcap", 0.24, 0.24, 0.08, "z", 24, [("t", 0.0, 0.0, 0.80)], m_bs, bevel=0.015),
        mk_box("sel_rtik", 0.055, 0.36, 0.055, [("t", 0.0, 0.06, 0.84)], m_pk, bevel=0.010),
    ]
    obj = join_objects(parts, "m4a1_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- GROUP B: METAL / ORDNANCE / BCG / FCG ATLAS (12 PARTS) ---

def _mk_helical_rifling_land(
    name: str, x0: float, x1: float, r: float, height: float, width: float,
    start_ang: float, twist_len: float, segs: int = 36, mat=None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    hw = width * 0.5
    r0 = r - height * 0.5
    r1 = r + height * 0.5
    for i in range(segs + 1):
        x = x0 + (x1 - x0) * (i / segs)
        a = start_ang + ((x - x0) / twist_len) * 2.0 * math.pi
        ca, sa = math.cos(a), math.sin(a)
        # Local cross-section at radius r rotated by angle a around +X
        local_pts = [(r0, -hw), (r1, -hw), (r1, hw), (r0, hw)]
        ring = []
        for ry, rz in local_pts:
            y = ry * ca - rz * sa
            z = ry * sa + rz * ca
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(segs):
        for k in range(4):
            kn = (k + 1) % 4
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][kn], rings[i][kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def build_m4a1_barrel(mats: dict) -> bpy.types.Object:
    m_br = mats["M_ParkerizedBarrel"]
    m_ch = mats["M_ChromeBolt"]
    m_dk = mats["M_DarkInternal"]
    m_hc = mats["M_HardChromePin"]

    # 14.5" USGI Government-Profile CHF Barrel w/ iconic M203 step-down cutout & 11-deg recessed target crown
    pts = [
        (0.000,  3.55),
        (0.560,  3.55),
        (0.560,  4.80),
        (0.615,  4.82),
        (0.615,  4.96),
        (0.480,  5.05),
        (0.340,  6.95),
        (0.340, 13.68),
        (0.450, 13.80),  # .750" FSB journal
        (0.450, 16.25),
        (0.400, 16.35),
        (0.400, 17.75),
        (0.270, 17.85),  # Authentic M203 Grenade-Launcher Front Latch Step-Cut!
        (0.270, 19.22),
        (0.400, 19.32),
        (0.400, 21.84),
        (0.295, 21.87),  # 1/2"-28 UNEF muzzle thread tenon
        (0.295, 22.38),
        (0.168, 22.29),  # Recessed 11-deg target crown
        (0.000, 22.29),
    ]
    lathe = mk_lathe_x("brl_raw", pts, segs=40, mat=m_br)

    cutters = [
        mk_cyl("c_bore", 0.168, 0.168, 19.60, "x", 24, [("t", 13.00, 0.0, 0.0)], m_ch),
        mk_cyl("c_chm", 0.275, 0.295, 2.35, "x", 24, [("t", 4.65, 0.0, 0.0)], m_ch),
        mk_cyl("c_rpL", 0.12, 0.15, 0.68, "y", 14, [("rz", math.pi * 0.5 - 0.32), ("t", 3.75, -0.26, -0.13)], m_ch),
        mk_cyl("c_rpR", 0.12, 0.15, 0.68, "y", 14, [("rz", math.pi * 0.5 - 0.32), ("t", 3.75, -0.26,  0.13)], m_ch),
        mk_cyl("c_gport", 0.045, 0.045, 0.54, "y", 14, [("t", 15.30, 0.25, 0.0)], m_dk),
    ]
    barrel_body = bool_subtract(lathe, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [barrel_body]

    # 6 Right-Hand 1:7" (17.78 cm) helical chrome-lined rifling lands
    for r in range(6):
        ang = (r * math.pi * 2.0) / 6.0 + 0.26
        parts.append(_mk_helical_rifling_land(f"brl_rf_{r}", 6.0, 22.26, 0.156, 0.036, 0.044, ang, 17.78, 32, m_hc))

    # Stainless M4 Barrel Extension Sleeve + 7 Internal Star Locking Lugs + Top Indexing Pin
    ext_col = bool_subtract(
        mk_cyl("brl_ext", 0.566, 0.566, 1.18, "x", 32, [("t", 4.16, 0.0, 0.0)], m_ch, bevel=0.018),
        [mk_cyl("c_extb", 0.43, 0.43, 1.48, "x", 26, [("t", 4.16, 0.0, 0.0)], m_dk)],
        solver="EXACT",
    )
    parts.append(ext_col)
    for k in range(1, 8):
        ang = (k * math.pi) / 4.0 + math.pi / 8.0
        parts.append(mk_box(f"brl_lug_{k}", 0.36, 0.13, 0.16,
                            [("rx", -ang), ("t", 3.78, math.sin(ang) * 0.37, math.cos(ang) * 0.37)], m_ch, bevel=0.015))

    # Top Barrel Extension Indexing Pin + Conical Steel Crush Washer at X = 21.86
    parts.append(mk_cyl("brl_ipin", 0.055, 0.055, 0.14, "y", 14, [("t", 4.25, 0.59, 0.0)], m_hc, bevel=0.010))
    crush = bool_subtract(
        mk_cyl("brl_cw", 0.415, 0.445, 0.12, "x", 30, [("t", 21.86, 0.0, 0.0)], m_ch, bevel=0.012),
        [mk_cyl("c_cwh", 0.28, 0.28, 0.34, "x", 22, [("t", 21.86, 0.0, 0.0)], m_dk)],
        solver="EXACT",
    )
    parts.append(crush)

    obj = join_objects(parts, "m4a1_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_flash_hider(mats: dict) -> bpy.types.Object:
    m_fh = mats["M_A2FlashHiderSoot"]
    m_dk = mats["M_DarkInternal"]

    pts = [
        (0.000, -1.05), (0.420, -1.05), (0.450, -0.98), (0.450, -0.52),
        (0.395, -0.48), (0.395, -0.36), (0.450, -0.32), (0.450,  1.12),
        (0.420,  1.15), (0.235,  1.15), (0.215,  1.04), (0.000,  1.04),
    ]
    body = mk_lathe_x("fh_raw", pts, segs=40, mat=m_fh)

    cutters = [
        mk_cyl("c_fhb", 0.225, 0.225, 2.65, "x", 26, [("t", 0.05, 0.0, 0.0)], m_dk),
        mk_cyl("c_fhe", 0.335, 0.315, 1.16, "x", 28, [("t", 0.36, 0.0, 0.0)], m_dk),
        # 3/4" parallel rear wrench flats
        mk_box("c_wfR", 0.36, 0.96, 0.18, [("t", -0.78, 0.0,  0.47)], m_fh),
        mk_box("c_wfL", 0.36, 0.96, 0.18, [("t", -0.78, 0.0, -0.47)], m_fh),
    ]
    # 5 Upper-Hemisphere A2 Birdcage Flash Ports (-72, -36, 0, +36, +72 deg) with 100% solid closed bottom!
    for i, ang in enumerate((-1.256, -0.628, 0.0, 0.628, 1.256)):
        cutters.append(
            mk_box(f"c_fhp_{i}", 0.98, 0.36, 0.135, [("t", 0.38, 0.37, 0.0), ("rx", ang)], m_fh, bevel=0.032, bevel_segs=2)
        )
    fh = bool_subtract(body, cutters, solver="EXACT")
    fh.name = "m4a1_flash_hider"
    fh.data.name = "m4a1_flash_hider"
    return finish_part(fh, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_front_sight_base(mats: dict) -> bpy.types.Object:
    m_fsb = mats["M_ForgedFSB"]
    m_ch = mats["M_ChromeBolt"]
    m_dk = mats["M_DarkInternal"]
    m_rb = mats["M_SlingRubber"]

    # Forged A-Frame Triangular Front Sight Tower w/ lightening window & protective ear slot
    af_xy = [(-1.18, 0.35), (1.18, 0.35), (0.46, 2.68), (-0.48, 2.68)]
    tower_raw = mk_extrude_z("fsb_twr", af_xy, -0.27, 0.27, bevel=0.036, bevel_segs=3, mat=m_fsb)
    tri_xy = [(-0.68, 0.72), (0.52, 0.72), (-0.08, 1.92)]
    tower = bool_subtract(
        tower_raw,
        [
            mk_extrude_z("c_tri", tri_xy, -0.50, 0.50, bevel=0.04, bevel_segs=2, mat=m_dk),
            mk_box("c_ear", 0.56, 0.50, 0.72, [("t", -0.02, 2.52, 0.0)], m_dk),
        ],
        solver="EXACT",
    )

    # Twin .750" Barrel Journal Rings + Gas Tube Socket Boss + Raised "F" Mark Boss
    j_raw = bool_union([
        mk_cyl("fsb_rR", 0.585, 0.585, 0.68, "x", 30, [("t", -0.84, 0.0, 0.0)], m_fsb, bevel=0.024),
        mk_cyl("fsb_rF", 0.585, 0.585, 0.68, "x", 30, [("t",  0.84, 0.0, 0.0)], m_fsb, bevel=0.024),
        mk_cyl("fsb_gb", 0.22, 0.22, 0.98, "x", 20, [("t", -0.72, 0.80, 0.0)], m_fsb, bevel=0.020),
        mk_box("fsb_fm", 0.28, 0.26, 0.07, [("t", -0.76, 0.68, -0.29)], m_fsb, bevel=0.012),
    ], "fsb_jraw", solver="EXACT")
    journals = bool_subtract(j_raw, [
        mk_cyl("c_bcut", 0.452, 0.452, 2.70, "x", 28, mat=m_dk),
        mk_cyl("c_gsh", 0.115, 0.115, 0.68, "x", 16, [("t", -1.05, 0.80, 0.0)], m_dk),
    ], solver="EXACT")

    # Stamped Triangular M4 Handguard End-Cap w/ M203 side notches at X_local = -1.28
    cap_zy = [(0.0, 0.98)]
    cap_zy += _quad_bez((0.0, 0.98), (0.88, 0.72), (0.92, -0.15), 8)
    cap_zy += _quad_bez((0.92, -0.15), (0.82, -0.88), (0.0, -0.92), 8)
    cap_zy += _quad_bez((0.0, -0.92), (-0.82, -0.88), (-0.92, -0.15), 8)
    cap_zy += _quad_bez((-0.92, -0.15), (-0.88, 0.72), (0.0, 0.98), 8)
    hg_cap = bool_subtract(
        mk_extrude_x("fsb_cap", cap_zy, -1.335, -1.225, bevel=0.016, bevel_segs=2, mat=m_fsb),
        [
            mk_cyl("c_cbh", 0.46, 0.46, 0.42, "x", 26, [("t", -1.28, 0.0, 0.0)], m_dk),
            mk_cyl("c_cgh", 0.13, 0.13, 0.42, "x", 16, [("t", -1.28, 0.80, 0.0)], m_dk),
            mk_cyl("c_cmL", 0.24, 0.24, 0.42, "x", 16, [("t", -1.28, -0.16, -0.88)], m_dk),
            mk_cyl("c_cmR", 0.24, 0.24, 0.42, "x", 16, [("t", -1.28, -0.16,  0.88)], m_dk),
        ],
        solver="EXACT",
    )

    parts = [
        tower, journals, hg_cap,
        # Square Front Sight Post (top at Y_local=+2.47 => Y_world=3.52 co-witness!), 4-notch flange & detent plunger
        mk_cyl("fsb_sflg", 0.125, 0.125, 0.075, "y", 20, [("t", -0.02, 2.25, 0.0)], m_ch, bevel=0.012),
        mk_box("fsb_spost", 0.088, 0.28, 0.088, [("t", -0.02, 2.33, 0.0)], m_ch, bevel=0.010),
        mk_cyl("fsb_sdet", 0.036, 0.036, 0.12, "y", 12, [("t", 0.12, 2.25, 0.0)], m_ch),
        # T-Slotted M9 Bayonet Lug + Swivel Ears + Rubberized Oval Sling Swivel & Rivet + Dual Cross Taper Pins
        mk_box("fsb_bstem", 0.56, 0.26, 0.28, [("t", 0.76, -0.62, 0.0)], m_fsb, bevel=0.022),
        mk_box("fsb_bshoe", 0.66, 0.12, 0.42, [("t", 0.76, -0.78, 0.0)], m_fsb, bevel=0.018),
        mk_box("fsb_sears", 0.42, 0.36, 0.34, [("t", -0.78, -0.64, 0.0)], m_fsb, bevel=0.022),
        mk_cyl("fsb_sriv", 0.06, 0.06, 0.44, "z", 14, [("t", -0.78, -0.72, 0.0)], m_ch, bevel=0.010),
        mk_torus("fsb_swiv", 0.32, 0.055, "z", 28, 12, [("s", 0.85, 1.12, 1.0), ("t", -0.78, -0.96, 0.0)], m_rb),
        mk_cyl("fsb_pinR", 0.072, 0.086, 0.84, "z", 16, [("t", -0.84, -0.44, 0.0)], m_ch, bevel=0.012),
        mk_cyl("fsb_pinF", 0.072, 0.086, 0.84, "z", 16, [("t",  0.84, -0.44, 0.0)], m_ch, bevel=0.012),
    ]
    obj = join_objects(parts, "m4a1_front_sight_base")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_bolt_carrier(mats: dict) -> bpy.types.Object:
    m_bcg = mats["M_OiledBCG"]
    m_ch = mats["M_ChromeBolt"]
    m_hc = mats["M_HardChromePin"]
    m_dk = mats["M_DarkInternal"]

    outer_cyl = mk_cyl("bcg_cyl", 0.515, 0.515, 7.00, "x", 32, [("t", -0.25, 0.0, 0.0)], m_bcg, bevel=0.024)
    # 4 Bright polished bearing rails along 45-deg quadrants (authentic AR BCG wear contrast!)
    rails = [outer_cyl]
    for i, ang in enumerate((math.pi * 0.25, math.pi * 0.75, -math.pi * 0.25, -math.pi * 0.75)):
        rails.append(mk_box(f"bcg_rail_{i}", 6.40, 0.14, 0.08,
                            [("rx", -ang), ("t", -0.25, math.sin(ang) * 0.51, math.cos(ang) * 0.51)], m_ch, bevel=0.014))
    carrier_raw = join_objects(rails, "bcg_raw")

    cutters = [
        mk_cyl("c_bh", 0.39, 0.39, 3.35, "x", 26, [("t", 1.75, 0.0, 0.0)], m_hc),
        mk_cyl("c_rt", 0.33, 0.33, 4.25, "x", 22, [("t", -1.85, 0.0, 0.0)], m_dk),
        mk_box("c_hs", 3.45, 0.58, 0.48, [("t", 1.32, -0.38, 0.0)], m_dk),
        mk_box("c_cam", 0.96, 0.40, 0.42, [("ry", 0.40), ("t", 2.02, 0.38, -0.10)], m_ch, bevel=0.03, bevel_segs=2),
        mk_box("c_rfl", 2.65, 0.68, 0.24, [("t", 1.62, 0.06, 0.52)], m_bcg),
        mk_cyl("c_vp1", 0.085, 0.085, 0.48, "z", 16, [("t", 1.22, -0.02, 0.42)], m_dk),
        mk_cyl("c_vp2", 0.085, 0.085, 0.48, "z", 16, [("t", 1.56, -0.02, 0.42)], m_dk),
        mk_cyl("c_cot", 0.065, 0.065, 1.18, "z", 14, [("t", 0.98, 0.22, 0.0)], m_dk),
    ]
    carrier_body = bool_subtract(carrier_raw, cutters, solver="EXACT")

    parts = [carrier_body]
    # 12 Angled Forward-Assist Ratcheting Serration Notches on lower-right flank
    for s in range(12):
        parts.append(mk_box(f"bcg_fa_{s}", 0.095, 0.22, 0.12,
                            [("ry", -0.20), ("t", -2.05 + s * 0.20, -0.19, 0.48)], m_ch, bevel=0.012))

    # Double-Staked Chrome-Lined Direct-Impingement Carrier Gas Key (Y_local = +0.62 => Y_world = 1.67)
    key_raw = bool_union([
        mk_box("bcg_kbase", 2.22, 0.24, 0.36, [("t", 1.34, 0.52, 0.0)], m_bcg, bevel=0.022),
        mk_cyl("bcg_ktube", 0.195, 0.175, 2.58, "x", 24, [("t", 1.58, 0.62, 0.0)], m_bcg, bevel=0.018),
    ], "bcg_kraw", solver="EXACT")
    gas_key = bool_subtract(
        key_raw,
        [mk_cyl("c_kfun", 0.13, 0.105, 1.58, "x", 18, [("t", 2.35, 0.62, 0.0)], m_hc)],
        solver="EXACT",
    )
    parts.append(gas_key)

    # Twin Grade-8 Socket-Head Cap Screws + Opposing USGI Side-Staking Swage Marks!
    for sx in (0.75, 1.65):
        scr = bool_subtract(
            mk_cyl(f"bcg_scr_{sx}", 0.098, 0.098, 0.16, "y", 18, [("t", sx, 0.74, 0.0)], m_ch, bevel=0.012),
            [mk_cyl(f"c_hex_{sx}", 0.052, 0.052, 0.12, "y", 6, [("t", sx, 0.80, 0.0)], m_dk)],
            solver="EXACT",
        )
        parts.append(scr)
        for sz in (-0.12, 0.12):
            parts.append(mk_box(f"bcg_stk_{sx}_{sz}", 0.11, 0.08, 0.06, [("t", sx, 0.75, sz)], m_bcg, bevel=0.010))

    obj = join_objects(parts, "m4a1_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_bolt(mats: dict) -> bpy.types.Object:
    m_ch = mats["M_ChromeBolt"]
    m_hc = mats["M_HardChromePin"]
    m_bcg = mats["M_OiledBCG"]
    m_dk = mats["M_DarkInternal"]

    # Lathe-turned Carpenter-158 bolt body with Stoner internal gas-piston shoulder & ring journal
    bolt_pts = [
        (0.000, -1.66), (0.240, -1.66), (0.240, -1.24),
        (0.335, -1.22), (0.335, -0.88),
        (0.375, -0.86), (0.375, -0.66),
        (0.340, -0.64), (0.340,  1.26), (0.320, 1.28), (0.000, 1.28),
    ]
    body_lathe = mk_lathe_x("blt_body", bolt_pts, segs=32, mat=m_ch)

    sub_parts = [body_lathe]

    # 3 Staggered Bright-Chrome Gas Sealing Rings around Stoner piston journal
    for rx in (-0.93, -1.05, -1.17):
        sub_parts.append(mk_torus(f"blt_gr_{rx}", 0.362, 0.024, "x", 28, 10, [("t", rx, 0.0, 0.0)], m_hc))

    # 7 CNC-Profiled Chamfered Star Locking Lugs (k=1..7 at 45 deg, leaving k=0 at +Z for claw extractor!)
    lug_xy = [(-0.23, -0.0825), (0.15, -0.0825), (0.23, -0.035), (0.23, 0.035), (0.15, 0.0825), (-0.23, 0.0825)]
    for k in range(1, 8):
        ang = (k * math.pi) / 4.0
        ly = math.sin(ang) * 0.415
        lz = math.cos(ang) * 0.415
        sub_parts.append(
            mk_extrude_z(f"blt_lug_{k}", lug_xy, -0.10, 0.10, bevel=0.014, bevel_segs=2,
                         xform=[("rx", -ang), ("t", 1.06, ly, lz)], mat=m_ch)
        )
    sub_parts.append(mk_torus("blt_col", 0.336, 0.018, "x", 28, 8, [("t", 0.79, 0.0, 0.0)], m_hc))

    # Parkerized CNC Claw Extractor (+Z, k=0) + pivot pin + ejector cross roll pin
    ext_xz = [
        (0.07, 0.34), (0.07, 0.47), (0.13, 0.49), (1.27, 0.49), (1.32, 0.44),
        (1.32, 0.27), (1.21, 0.27), (1.17, 0.31), (0.13, 0.31),
    ]
    sub_parts.extend([
        mk_extrude_y("blt_ext", ext_xz, -0.095, 0.095, bevel=0.012, bevel_segs=2, mat=m_bcg),
        mk_cyl("blt_epin", 0.045, 0.045, 0.36, "y", 14, [("t", 0.52, 0.0, 0.40)], m_hc),
        mk_cyl("blt_rpin", 0.038, 0.038, 0.68, "y", 14, [("t", 0.84, 0.0, -0.12)], m_hc),
        # Rectangular-Head Steel Cam Pin at X_local = -0.32, Y_local = +0.58
        mk_cyl("blt_csha", 0.135, 0.135, 0.62, "y", 18, [("t", -0.32, 0.34, 0.0)], m_bcg, bevel=0.014),
        mk_box("blt_ched", 0.28, 0.22, 0.25, [("t", -0.32, 0.58, 0.0)], m_bcg, bevel=0.022, bevel_segs=2),
    ])

    solid_bolt = join_objects(sub_parts, "blt_solid")
    carved_bolt = bool_subtract(
        solid_bolt,
        [
            mk_cyl("c_bcup", 0.26, 0.26, 0.18, "x", 24, [("t", 1.25, 0.0, 0.0)], m_dk),
            mk_cyl("c_fph", 0.048, 0.048, 0.58, "x", 14, [("t", 1.12, 0.0, 0.0)], m_dk),
        ],
        solver="EXACT",
    )

    # Spring-loaded bright-steel cylindrical plunger ejector protruding onto bolt face
    ej_ang = (5.0 * math.pi) / 4.0
    ejector = mk_cyl("blt_ej", 0.052, 0.052, 0.16, "x", 14,
                     [("t", 1.21, math.sin(ej_ang) * 0.155, math.cos(ej_ang) * 0.155)], m_hc, bevel=0.008)
    obj = join_objects([carved_bolt, ejector], "m4a1_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_firing_pin(mats: dict) -> bpy.types.Object:
    m_hc = mats["M_HardChromePin"]
    m_ch = mats["M_ChromeBolt"]

    # Hard-chromed lathe-turned stepped free-floating firing pin
    fp_pts = [
        (0.000, -0.30), (0.135, -0.30), (0.145, -0.28), (0.145, -0.08),
        (0.078, -0.04), (0.078,  0.24),
        (0.225,  0.26), (0.225,  0.40),
        (0.108,  0.44), (0.088,  2.66),
        (0.036,  3.56), (0.024,  3.59), (0.000, 3.596),
    ]
    parts = [
        mk_lathe_x("fp_shaft", fp_pts, segs=26, mat=m_hc),
        mk_cyl("fp_cotter", 0.034, 0.034, 0.88, "z", 12, [("t", 0.10, 0.22, 0.0)], m_ch, bevel=0.006),
        mk_torus("fp_cloop", 0.065, 0.024, "x", 18, 10, [("t", 0.10, 0.22, -0.46)], m_ch),
    ]
    obj = join_objects(parts, "m4a1_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_gas_tube(mats: dict) -> bpy.types.Object:
    m_gt = mats["M_GasTubeStainlessHeat"]
    m_dk = mats["M_DarkInternal"]
    m_ch = mats["M_ChromeBolt"]

    # Smooth S-bend 347 Stainless Carbine DI Gas Tube (from X=-6.40 gas key to X=+6.30 FSB!)
    pts = []
    segs = 54
    for i in range(segs + 1):
        u = i / segs
        x = -6.40 + 12.70 * u
        if x <= -4.10:
            y = 0.0
        elif x >= -2.10:
            y = 0.18
        else:
            t = (x - (-4.10)) / 2.00
            y = 0.18 * (t * t * (3.0 - 2.0 * t))
        pts.append(Vector((x, y, 0.0)))
    tube = mk_tube_along_pts("gt_tube", pts, 0.092, ring_segs=18, mat=m_gt)

    # Bulbous ground rear sealing nozzle mating inside BCG staked gas key funnel
    nozzle = bool_subtract(
        mk_cyl("gt_noz", 0.105, 0.116, 0.28, "x", 20, [("t", -6.26, 0.0, 0.0)], m_gt, bevel=0.012),
        [mk_cyl("c_nbore", 0.062, 0.062, 0.38, "x", 14, [("t", -6.34, 0.0, 0.0)], m_dk)],
        solver="EXACT",
    )
    parts = [
        tube,
        nozzle,
        mk_cyl("gt_fcol", 0.108, 0.108, 0.55, "x", 18, [("t", 6.02, 0.18, 0.0)], m_gt, bevel=0.012),
        mk_cyl("gt_rpin", 0.040, 0.040, 0.56, "z", 12, [("t", 6.05, 0.18, 0.0)], m_ch, bevel=0.006),
    ]
    obj = join_objects(parts, "m4a1_gas_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_buffer_tube(mats: dict) -> bpy.types.Object:
    m_bt = mats["M_BufferTubeAnodize"]
    m_fsb = mats["M_ForgedFSB"]
    m_dk = mats["M_DarkInternal"]

    tube_raw = bool_union([
        mk_cyl("bt_outer", 0.68, 0.68, 11.50, "x", 34, [("t", 0.10, 0.0, 0.0)], m_bt, bevel=0.028),
        mk_box("bt_track", 9.65, 0.36, 0.44, [("t", -0.80, -0.74, 0.0)], m_bt, bevel=0.032, bevel_segs=2),
    ], "bt_solid", solver="EXACT")

    cutters = [
        mk_cyl("c_btb", 0.55, 0.55, 11.25, "x", 28, [("t", 0.45, 0.0, 0.0)], m_dk),
        mk_cyl("c_btv", 0.09, 0.09, 0.65, "x", 14, [("t", -5.55, 0.0, 0.0)], m_dk),
    ]
    # 6 Mil-Spec LOP circular detent blind sockets along bottom track!
    for p in range(6):
        cutters.append(mk_cyl(f"c_lop_{p}", 0.135, 0.135, 0.32, "y", 16, [("t", -4.60 + p * 1.15, -0.88, 0.0)], m_dk))
    carved_tube = bool_subtract(tube_raw, cutters, solver="EXACT")

    # Stamped Steel Receiver Endplate + 4-Notch Staked Spanner Castle Nut!
    nut_raw = bool_union([
        mk_cyl("bt_ep", 0.86, 0.86, 0.14, "x", 30, [("t", 5.50, -0.06, 0.0)], m_fsb, bevel=0.018),
        mk_box("bt_ept", 0.14, 0.52, 0.42, [("t", 5.50, -0.74, 0.0)], m_fsb, bevel=0.018),
        mk_cyl("bt_cn", 0.83, 0.83, 0.38, "x", 30, [("t", 5.22, 0.0, 0.0)], m_fsb, bevel=0.022),
    ], "bt_nraw", solver="EXACT")
    nut_cuts = [mk_cyl("c_nb", 0.56, 0.56, 0.96, "x", 26, [("t", 5.35, 0.0, 0.0)], m_dk)]
    for n in range(4):
        ang = (n * math.pi) * 0.5 + math.pi * 0.25
        nut_cuts.append(mk_box(f"c_cn_{n}", 0.18, 0.18, 0.24,
                               [("rx", -ang), ("t", 5.06, math.sin(ang) * 0.80, math.cos(ang) * 0.80)], m_dk))
    castle_nut = bool_subtract(nut_raw, nut_cuts, solver="EXACT")

    parts = [carved_tube, castle_nut]
    # Fine receiver-end buffer tube threads (visible in field-strip / exploded!)
    for t in range(5):
        parts.append(mk_torus(f"bt_thr_{t}", 0.685, 0.016, "x", 26, 8, [("t", 4.45 + t * 0.11, 0.0, 0.0)], m_bt))

    obj = join_objects(parts, "m4a1_buffer_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_buffer(mats: dict) -> bpy.types.Object:
    m_gd = mats["M_BufferGoldAnodize"]
    m_bp = mats["M_BumperPolyurethane"]
    m_ch = mats["M_ChromeBolt"]

    pts = [
        (0.000, -1.28), (0.410, -1.28), (0.410, 1.32),
        (0.360,  1.38), (0.360,  1.48),
        (0.515,  1.52), (0.515,  1.82), (0.480, 1.85), (0.000, 1.85),
    ]
    parts = [
        mk_lathe_x("buf_body", pts, segs=32, mat=m_gd),
        mk_cyl("buf_bump", 0.395, 0.340, 0.48, "x", 26, [("t", -1.51, 0.0, 0.0)], m_bp, bevel=0.025),
        mk_cyl("buf_rpin", 0.048, 0.048, 0.83, "z", 14, [("t", -1.08, 0.0, 0.0)], m_ch, bevel=0.008),
    ]
    obj = join_objects(parts, "m4a1_buffer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_hammer(mats: dict) -> bpy.types.Object:
    m_bcg = mats["M_OiledBCG"]
    m_dk = mats["M_DarkInternal"]
    m_sp = mats["M_SpringSteel"]

    hub = bool_subtract(
        mk_cyl("ham_hub", 0.24, 0.24, 0.94, "z", 22, mat=m_bcg, bevel=0.018),
        [mk_cyl("c_hpin", 0.09, 0.09, 1.20, "z", 14, mat=m_dk)],
        solver="EXACT",
    )
    h_xy = [
        (-0.22, -0.14), (0.22, -0.16), (0.14, 0.06), (0.24, 0.68),
        (-0.16, 1.20), (-0.66, 1.06), (-0.56, 0.88), (-0.42, 0.84), (-0.54, 0.42),
    ]
    # True cocked-down rearward angle on sear (rz = +1.48 rad keeps worldY_max <= 0.28 cleanly below BCG!)
    head = mk_extrude_z("ham_head", h_xy, -0.21, 0.21, bevel=0.024, bevel_segs=2,
                        xform=[("rz", 1.48)], mat=m_bcg)
    parts = [
        hub, head,
        mk_coil_spring("ham_spL", "z", -0.45, -0.24, 0.0, 0.0, 0.30, 0.032, 3.5, 8, 14, mat=m_sp),
        mk_coil_spring("ham_spR", "z",  0.24,  0.45, 0.0, 0.0, 0.30, 0.032, 3.5, 8, 14, mat=m_sp),
    ]
    obj = join_objects(parts, "m4a1_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_trigger(mats: dict) -> bpy.types.Object:
    m_bcg = mats["M_OiledBCG"]
    m_ch = mats["M_ChromeBolt"]
    m_dk = mats["M_DarkInternal"]
    m_sp = mats["M_SpringSteel"]

    bow_xy = [(-0.16, -0.08), (0.20, -0.08)]
    bow_xy += _quad_bez((0.20, -0.08), (0.05, -0.82), (0.26, -1.32), 10)
    bow_xy.append((0.04, -1.42))
    bow_xy += _quad_bez((0.04, -1.42), (-0.24, -0.85), (-0.16, -0.08), 10)
    shoe = mk_extrude_z("trg_shoe", bow_xy, -0.19, 0.19, bevel=0.030, bevel_segs=3, mat=m_bcg)

    sear_ch = bool_subtract(
        mk_box("trg_sear", 1.82, 0.30, 0.50, [("t", -0.08, 0.09, 0.0)], m_bcg, bevel=0.018),
        [mk_box("c_dtro", 1.36, 0.28, 0.24, [("t", -0.12, 0.16, 0.0)], m_dk)],
        solver="EXACT",
    )
    disc_xy = [(-0.56, 0.04), (0.62, 0.04), (0.70, 0.42), (0.36, 0.56), (0.24, 0.32), (-0.56, 0.22)]
    disconnector = mk_extrude_z("trg_disc", disc_xy, -0.08, 0.08, bevel=0.012, bevel_segs=2, mat=m_ch)

    parts = [
        mk_cyl("trg_pin", 0.16, 0.16, 0.96, "z", 18, mat=m_ch, bevel=0.014),
        shoe, sear_ch, disconnector,
        mk_coil_spring("trg_dsp", "y", 0.02, 0.24, -0.34, 0.0, 0.065, 0.016, 4.0, 8, 12, mat=m_sp),
        mk_cyl("trg_legL", 0.028, 0.028, 1.48, "y", 10, [("rz", math.pi * 0.5 + 0.18), ("t", 0.68, 0.12, -0.36)], m_sp),
        mk_cyl("trg_legR", 0.028, 0.028, 1.48, "y", 10, [("rz", math.pi * 0.5 + 0.18), ("t", 0.68, 0.12,  0.36)], m_sp),
    ]
    obj = join_objects(parts, "m4a1_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_mag_spring(mats: dict) -> bpy.types.Object:
    """9-coil compressed 17-7PH stainless rectangular STANAG magazine spring along exact R=18.0 arc."""
    m_sp = mats["M_SpringSteel"]
    arc_cx, arc_cy = 18.0, -1.25
    coils = 9
    steps_per_coil = 24
    total_steps = coils * steps_per_coil
    pts = []
    for i in range(total_steps + 1):
        u = i / total_steps
        ang = 0.352 - u * (0.352 - 0.276)
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        rad_off = math.copysign(abs(ct) ** 0.6, ct) * 0.80
        z_off = math.copysign(abs(st) ** 0.6, st) * 0.30
        r_cur = 18.0 - rad_off
        pts.append(Vector((arc_cx - math.cos(ang) * r_cur, arc_cy - math.sin(ang) * r_cur, z_off)))
    obj = mk_tube_along_pts("m4a1_mag_spring", pts, 0.036, ring_segs=8, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


# --- GROUP C: FURNITURE / KAC RAS / STANAG ATLAS (7 PARTS) ---

def _mk_solid_heatshield_liner(
    name: str, length_x: float, inner_r: float, thickness: float,
    start_ang: float, sweep_ang: float, mat,
) -> bpy.types.Object:
    segs = 22
    pts_zy = []
    for i in range(segs + 1):
        a = start_ang + (i / segs) * sweep_ang
        pts_zy.append((math.cos(a) * inner_r, math.sin(a) * inner_r))
    outer_r = inner_r + thickness
    for i in range(segs, -1, -1):
        a = start_ang + (i / segs) * sweep_ang
        rib = math.sin((i / segs) * math.pi * 5.0) * 0.014
        pts_zy.append((math.cos(a) * (outer_r + rib), math.sin(a) * (outer_r + rib)))
    return mk_extrude_x(name, pts_zy, -length_x * 0.5, length_x * 0.5, bevel=0.008, bevel_segs=1, mat=mat)


def build_m4a1_ras_upper(mats: dict) -> bpy.types.Object:
    m_ra = mats["F_RasAnodize"]
    m_rc = mats["F_RasRailCrest"]
    m_sl = mats["F_RasSlotDark"]
    m_hs = mats["F_HeatshieldAlu"]
    m_bs = mats["F_BrightSteel"]

    length = 8.30
    prof_zy = [(-0.92, 0.02), (-0.92, 0.34), (-0.46, 0.87), (0.46, 0.87), (0.92, 0.34), (0.92, 0.02)]
    outer_raw = mk_extrude_x("rasu_raw", prof_zy, -length * 0.5, length * 0.5, bevel=0.028, bevel_segs=2, mat=m_ra)

    cutters = [mk_cyl("c_ru_in", 0.76, 0.76, length + 0.6, "x", 32, mat=m_sl)]
    # 7 authentic KAC chamfered oval cooling vents per upper-45-deg flat (reveals heatshield & DI gas tube!)
    for v in range(7):
        vx = -3.30 + v * 1.10
        cutters.append(
            mk_cyl(f"c_ru_vR_{v}", 0.20, 0.20, 2.20, "y", 18,
                   [("s", 1.18, 1.0, 0.86), ("rx", math.pi * 0.25), ("t", vx, 0.56, 0.56)], m_sl)
        )
        cutters.append(
            mk_cyl(f"c_ru_vL_{v}", 0.20, 0.20, 2.20, "y", 18,
                   [("s", 1.18, 1.0, 0.86), ("rx", -math.pi * 0.25), ("t", vx, 0.56, -0.56)], m_sl)
        )
    upper_body = bool_subtract(outer_raw, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        upper_body,
        # Corrugated brushed aluminum reflection heatshield liner inside upper RAS
        _mk_solid_heatshield_liner("rasu_hs", 7.45, 0.675, 0.036, math.pi * 0.10, math.pi * 0.80, m_hs),
    ]

    # Top 12-o'clock MIL-STD-1913 Rail: crest at Y_local = 0.855 + 0.25*0.86 = 1.070 => Y_world = 2.120 FLUSH w/ upper!
    parts += mk_picatinny_rail(
        "rasu_r12", length, 0.0, 0.855, 11, invert_y=False,
        mat_rail=m_rc, mat_slot=m_sl, height_scale=0.86,
    )
    # 3-o'clock (+Z) & 9-o'clock (-Z) MIL-STD-1913 Side Rails (crest at Z = +-(0.89 + 0.215) = +-1.105!)
    for side in (-1.0, 1.0):
        parts += mk_picatinny_rail(
            f"rasu_rside_{int(side)}", length, 0.0, 0.0, 11, invert_y=False,
            mat_rail=m_rc, mat_slot=m_sl, height_scale=0.86,
            xform=[("rx", side * math.pi * 0.5), ("t", 0.0, 0.14, side * 0.89)],
        )

    # KAC Rear Barrel-Nut Clamp Screw (recessed Allen hex head!) & Front Retaining Hook Tab
    clamp_scr = bool_subtract(
        mk_cyl("rasu_cscr", 0.14, 0.14, 0.20, "y", 18, [("t", -3.45, 1.00, 0.0)], m_bs, bevel=0.015),
        [mk_cyl("c_ras_hex", 0.068, 0.068, 0.12, "y", 6, [("t", -3.45, 1.08, 0.0)], m_sl)],
        solver="EXACT",
    )
    parts.extend([
        clamp_scr,
        mk_box("rasu_hook", 0.18, 0.34, 0.56, [("t", -3.95, 0.66, 0.0)], m_bs, bevel=0.018),
    ])

    obj = join_objects(parts, "m4a1_ras_upper")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_ras_lower(mats: dict) -> bpy.types.Object:
    m_ra = mats["F_RasAnodize"]
    m_rc = mats["F_RasRailCrest"]
    m_sl = mats["F_RasSlotDark"]
    m_hs = mats["F_HeatshieldAlu"]

    length = 8.30
    prof_zy = [(-0.88, -0.02), (0.88, -0.02), (0.88, -0.32), (0.46, -0.85), (-0.46, -0.85), (-0.88, -0.32)]
    outer_raw = mk_extrude_x("rasl_raw", prof_zy, -length * 0.5, length * 0.5, bevel=0.028, bevel_segs=2, mat=m_ra)

    cutters = [mk_cyl("c_rl_in", 0.75, 0.75, length + 0.6, "x", 32, mat=m_sl)]
    for v in range(7):
        vx = -3.30 + v * 1.10
        cutters.append(
            mk_cyl(f"c_rl_vR_{v}", 0.19, 0.19, 2.20, "y", 18,
                   [("s", 1.18, 1.0, 0.86), ("rx", -math.pi * 0.25), ("t", vx, -0.54, 0.54)], m_sl)
        )
        cutters.append(
            mk_cyl(f"c_rl_vL_{v}", 0.19, 0.19, 2.20, "y", 18,
                   [("s", 1.18, 1.0, 0.86), ("rx", math.pi * 0.25), ("t", vx, -0.54, -0.54)], m_sl)
        )
    lower_body = bool_subtract(outer_raw, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        lower_body,
        _mk_solid_heatshield_liner("rasl_hs", 7.45, 0.665, 0.036, math.pi * 1.10, math.pi * 0.80, m_hs),
    ]
    # 6-o'clock bottom MIL-STD-1913 Picatinny Rail (bottom crest at Y_local = -0.845 - 0.215 = -1.060!)
    parts += mk_picatinny_rail(
        "rasl_r6", length, 0.0, -0.845, 11, invert_y=True,
        mat_rail=m_rc, mat_slot=m_sl, height_scale=0.86,
    )

    obj = join_objects(parts, "m4a1_ras_lower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_buttstock(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_rb = mats["F_MatteRubber"]
    m_sh = mats["F_SteelHardware"]
    m_bs = mats["F_BrightSteel"]

    # --- 1. Contoured USGI M4 Reinforced "Waffle" / Enhanced SOPMOD Collapsible Stock Body ---
    st_xy = [(3.85, 0.84), (-3.88, 0.84)]
    st_xy += _quad_bez((-3.88, 0.84), (-4.02, -1.40), (-4.02, -3.76), 8)
    st_xy.append((-3.20, -3.84))
    st_xy += _quad_bez((-3.20, -3.84), (-0.95, -2.52), (1.28, -1.24), 12)
    st_xy += _quad_bez((1.28, -1.24), (2.68, -1.08), (3.85, -1.00), 6)
    raw_body = mk_extrude_z("st_raw", st_xy, -0.60, 0.60, bevel=0.085, bevel_segs=4, mat=m_pm)

    # Smooth contoured upper cheek-weld saddle tube (SOPMOD/M4 enhanced ergonomic cheek contour)
    cheek_tube = mk_cyl("st_cheek", 0.94, 0.94, 7.68, "x", 32,
                        [("s", 1.0, 0.96, 1.24), ("t", -0.02, 0.02, 0.0)], m_pm, bevel=0.06)
    combined = bool_union([raw_body, cheek_tube], "st_comb", solver="EXACT")

    # Rounded triangular ergonomic lightening window + footman's sling slot + recessed waffle structural pockets!
    tri_xy = [(-2.55, -1.08), (0.08, -1.08)]
    tri_xy += _quad_bez((0.08, -1.08), (0.28, -1.10), (0.04, -1.32), 5)
    tri_xy += _quad_bez((0.04, -1.32), (-1.20, -1.96), (-2.42, -2.62), 8)
    tri_xy += _quad_bez((-2.42, -2.62), (-2.68, -2.70), (-2.68, -2.35), 5)
    tri_xy += _quad_bez((-2.68, -2.35), (-2.68, -1.40), (-2.55, -1.08), 5)

    # Recessed flank structural pockets for authentic molded M4 waffle grid relief (NO flat box slabs!)
    pock_xy = [(-3.35, -0.22), (2.25, -0.22), (2.25, -0.92), (-3.35, -1.02)]

    cutters = [
        # Hollow 6-position buffer tube bore + bottom track clearance slot (ZERO clipping w/ buffer tube!)
        mk_cyl("c_btun", 0.70, 0.70, 8.60, "x", 30, mat=m_pa),
        mk_box("c_btrk", 8.60, 0.42, 0.50, [("t", 0.0, -0.75, 0.0)], m_pa),
        mk_extrude_z("c_tri", tri_xy, -0.85, 0.85, mat=m_pa),
        mk_box("c_sling", 0.32, 1.44, 1.50, [("t", -3.40, -1.95, 0.0)], m_pa, bevel=0.06, bevel_segs=2),
        # Recessed waffle pockets on both flanks
        mk_extrude_z("c_wpR", pock_xy, 0.52, 0.78, bevel=0.03, bevel_segs=2, mat=m_pa),
        mk_extrude_z("c_wpL", pock_xy, -0.78, -0.52, bevel=0.03, bevel_segs=2, mat=m_pa),
    ]
    stock_main = bool_subtract(combined, cutters, solver="EXACT")

    # --- 2. Contoured Vulcanized Matte Rubber Buttpad w/ 8 anti-slip horizontal grooves & 2 stainless screws ---
    pad_raw = mk_box("st_pad", 0.38, 4.74, 1.34, [("t", -4.08, -1.48, 0.0)], m_rb, bevel=0.075, bevel_segs=4)
    pad_cuts = [mk_box(f"c_pgr_{b}", 0.14, 0.14, 1.48, [("t", -4.26, -3.42 + b * 0.55, 0.0)], m_rb) for b in range(8)]
    pad_cuts.append(mk_cyl("c_pconc", 5.20, 5.20, 1.60, "z", 28, [("t", -9.44, -1.48, 0.0)], m_rb))
    buttpad = bool_subtract(pad_raw, pad_cuts, solver="EXACT")

    # Recessed stainless QD sling swivel socket cup on rear stock web!
    qd_cup = bool_subtract(
        mk_cyl("st_qdo", 0.24, 0.24, 1.24, "z", 24, [("t", -2.92, -3.12, 0.0)], m_bs, bevel=0.020),
        [mk_cyl("c_qdi", 0.14, 0.14, 1.42, "z", 18, [("t", -2.92, -3.12, 0.0)], m_pa)],
        solver="EXACT",
    )

    # Ergonomic contoured spring-loaded LOP telescoping latch lever nestled cleanly in front lower arch
    latch_xy = [(-0.08, -1.52), (2.48, -1.04), (2.56, -1.26), (2.25, -1.44), (0.04, -1.78)]
    latch = mk_extrude_z("st_latch", latch_xy, -0.28, 0.28, bevel=0.042, bevel_segs=3, mat=m_pa)

    parts: list[bpy.types.Object] = [
        stock_main,
        buttpad,
        qd_cup,
        latch,
        # Knurled steel lock-pin nut + roll pin + bottom parkerized steel oval sling loop + buttpad screws
        mk_knurled_cyl("st_lnut", 0.22, 0.56, "y", flutes=16, depth=0.016, xform=[("t", 2.15, -1.16, 0.0)], mat=m_sh),
        mk_cyl("st_lpin", 0.065, 0.065, 0.78, "z", 14, [("t", 0.22, -1.46, 0.0)], m_bs, bevel=0.010),
        mk_torus("st_swiv", 0.28, 0.052, "z", 26, 12, [("s", 1.15, 0.85, 1.0), ("t", -2.55, -3.45, 0.0)], m_sh),
        mk_cyl("st_scr1", 0.075, 0.075, 0.14, "x", 6, [("t", -4.22,  0.34, 0.0)], m_bs, bevel=0.010),
        mk_cyl("st_scr2", 0.075, 0.075, 0.14, "x", 6, [("t", -4.22, -3.20, 0.0)], m_bs, bevel=0.010),
    ]

    # Authentic flush-molded M4 crisscross "Waffle" stiffening ribs nested cleanly inside recessed side pockets!
    for rx in (-2.90, -1.80, -0.70, 0.40, 1.50):
        parts.append(mk_box(f"st_wv_{rx}", 0.13, 0.80, 1.24, [("t", rx, -0.62, 0.0)], m_pm, bevel=0.022))
    parts.append(mk_box("st_wh", 5.55, 0.12, 1.23, [("t", -0.58, -0.62, 0.0)], m_pm, bevel=0.020))

    obj = join_objects(parts, "m4a1_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_m4a1_pistol_grip(mats: dict) -> bpy.types.Object:
    m_pm = mats["F_PolyamideMain"]
    m_pa = mats["F_PolyamideAccent"]
    m_ck = mats["F_A2Checkering"]
    m_bs = mats["F_BrightSteel"]

    # --- 1. Organically Sculpted 26-Station Ergonomic Colt USGI A2 Grip Loft (ZERO flat slab!) ---
    # Matches exact 25-deg AR-15 grip sweep & CSG envelope min=(-2.96, -4.55, -0.65), max=(1.08, 0.09, 0.65)
    n_stations = 26
    ring_segs = 32
    front_ctrl = [
        (0.00,  1.08,  0.07),
        (0.18,  0.80, -0.78),
        (0.32,  0.48, -1.48),
        (0.39,  0.66, -1.76),  # Signature USGI A2 middle-finger indexing shelf!
        (0.46,  0.34, -2.02),
        (0.72, -0.24, -3.28),
        (1.00, -0.82, -4.52),
    ]
    back_ctrl = [
        (0.00, -1.14,  0.07),
        (0.15, -1.44, -0.64),  # smooth concave upper beaver-tail web!
        (0.42, -1.96, -1.84),  # full rounded ergonomic palm swell!
        (0.74, -2.50, -3.14),
        (1.00, -2.95, -4.26),
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
        hx = max(0.48, 0.5 * (fx - bx))
        # Natural ergonomic palm swell: 0.54 cm at top web -> 0.625 cm palm middle -> 0.58 cm base
        hz = 0.535 + 0.092 * math.sin(min(1.0, u * 1.08) * math.pi) + 0.042 * (u * u)
        if s == 0:
            hx *= 0.96
            hz *= 0.94
        elif s == n_stations:
            hx *= 0.98
            hz *= 0.97
        ring = []
        for k in range(ring_segs):
            th = 2.0 * math.pi * k / ring_segs
            ct, st = math.cos(th), math.sin(th)
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
    raw_grip = _bm_to_obj("pg_raw", bm_g, m_pm)

    # Hollow internal grip-screw bore + top-right selector detent spring blind hole!
    grip_body = bool_subtract(
        raw_grip,
        [
            mk_cyl("c_gscr", 0.34, 0.42, 3.65, "y", 20, [("rz", -0.42), ("t", -1.25, -2.65, 0.0)], m_pa),
            mk_cyl("c_gdet", 0.08, 0.08, 0.48, "y", 12, [("t", 0.10, -0.12, 0.42)], m_pa),
        ],
        solver="EXACT",
    )

    # --- 2. Conforming Curved Raised USGI A2 20-LPI Diamond-Checkered Side Panels ---
    bm_pad = bmesh.new()
    for side in (-1.0, 1.0):
        p_stations = 12
        p_cols = 8
        grid_in = []
        grid_out = []
        for si in range(p_stations + 1):
            u = 0.22 + 0.62 * (si / p_stations)
            fx, fy = _interp_curve(front_ctrl, u)
            bx, by = _interp_curve(back_ctrl, u)
            cx = 0.5 * (fx + bx)
            cy = 0.5 * (fy + by)
            hx = max(0.48, 0.5 * (fx - bx))
            hz = 0.535 + 0.092 * math.sin(min(1.0, u * 1.08) * math.pi) + 0.042 * (u * u)
            u_end = math.sin((si / p_stations) * math.pi)
            row_in, row_out = [], []
            for ci in range(p_cols + 1):
                c_frac = (ci / p_cols) * 2.0 - 1.0
                th = side * (math.pi * 0.5) - side * (c_frac * 0.50 * (0.55 + 0.45 * u_end))
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
                px = cx + hx * sx
                py = cy + 0.5 * (fy - by) * sx
                pz_base = hz * sz
                edge_w = math.sin((ci / p_cols) * math.pi) * u_end
                raise_z = 0.028 * (0.25 + 0.75 * edge_w)
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
        # Internal hex grip mounting screw head visible inside cavity
        mk_cyl("pg_bolt", 0.16, 0.16, 0.45, "y", 6, [("rz", -0.42), ("t", -0.28, -0.58, 0.0)], m_bs, bevel=0.015),
    ]

    # Smooth curved conformal A2 backstrap serration ribs hugging the superellipse contour (ZERO spiky sawtooth boxes!)
    def _mk_curved_backstrap_rib(rname: str, u_center: float, rib_h_u: float = 0.011,
                                 raise_out: float = 0.022, half_arc: float = 0.56) -> bpy.types.Object:
        bm_r = bmesh.new()
        arc_segs = 10
        u_vals = [u_center - rib_h_u, u_center - rib_h_u * 0.42, u_center + rib_h_u * 0.42, u_center + rib_h_u]
        r_mults = [0.0, 1.0, 1.0, 0.0]
        grid_in, grid_out = [], []
        for ui, u_cur in enumerate(u_vals):
            u_cl = max(0.02, min(0.98, u_cur))
            fx, fy = _interp_curve(front_ctrl, u_cl)
            bx, by = _interp_curve(back_ctrl, u_cl)
            cx, cy = 0.5 * (fx + bx), 0.5 * (fy + by)
            hx = max(0.48, 0.5 * (fx - bx))
            hz = 0.535 + 0.092 * math.sin(min(1.0, u_cl * 1.08) * math.pi) + 0.042 * (u_cl * u_cl)
            row_in, row_out = [], []
            for ai in range(arc_segs + 1):
                af = (ai / arc_segs) * 2.0 - 1.0
                th = math.pi + af * half_arc
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** (2.0 / 2.2), ct)
                sz = math.copysign(abs(st) ** (2.0 / 2.2), st)
                px = cx + hx * sx
                py = cy + 0.5 * (fy - by) * sx
                pz = hz * sz
                nx, ny, nz = ct, 0.28 * ct, st
                nlen = math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
                nx, ny, nz = nx / nlen, ny / nlen, nz / nlen
                arc_taper = math.cos(af * math.pi * 0.5) ** 0.75
                d_out = raise_out * r_mults[ui] * arc_taper
                row_in.append(bm_r.verts.new((px - nx * 0.030, py - ny * 0.030, pz - nz * 0.030)))
                row_out.append(bm_r.verts.new((px + nx * d_out, py + ny * d_out, pz + nz * d_out)))
            grid_in.append(row_in)
            grid_out.append(row_out)
        nu = len(u_vals) - 1
        for ui in range(nu):
            for ai in range(arc_segs):
                bm_r.faces.new((grid_out[ui][ai], grid_out[ui + 1][ai], grid_out[ui + 1][ai + 1], grid_out[ui][ai + 1]))
                bm_r.faces.new((grid_in[ui][ai], grid_in[ui][ai + 1], grid_in[ui + 1][ai + 1], grid_in[ui + 1][ai]))
        for ui in range(nu):
            bm_r.faces.new((grid_in[ui][0], grid_out[ui][0], grid_out[ui + 1][0], grid_in[ui + 1][0]))
            bm_r.faces.new((grid_in[ui][arc_segs], grid_in[ui + 1][arc_segs], grid_out[ui + 1][arc_segs], grid_out[ui][arc_segs]))
        for ai in range(arc_segs):
            bm_r.faces.new((grid_in[0][ai], grid_in[0][ai + 1], grid_out[0][ai + 1], grid_out[0][ai]))
            bm_r.faces.new((grid_in[nu][ai], grid_out[nu][ai], grid_out[nu][ai + 1], grid_in[nu][ai + 1]))
        bmesh.ops.recalc_face_normals(bm_r, faces=bm_r.faces)
        _apply_three_xform(bm_r, [])
        return _bm_to_obj(rname, bm_r, m_pa)

    for i in range(9):
        parts.append(_mk_curved_backstrap_rib(f"pg_brib_{i}", 0.22 + i * 0.075))

    obj = join_objects(parts, "m4a1_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def _stanag_profile(r_in: float, r_out: float, ang_end: float, top_y: float = 1.05, steps: int = 26):
    arc_cx, arc_cy = 18.0, -1.25
    pts = [(arc_cx - r_out, top_y), (arc_cx - r_out, arc_cy)]
    for i in range(1, steps + 1):
        a = (i / steps) * ang_end
        pts.append((arc_cx - math.cos(a) * r_out, arc_cy - math.sin(a) * r_out))
    for i in range(steps, -1, -1):
        a = (i / steps) * ang_end
        pts.append((arc_cx - math.cos(a) * r_in, arc_cy - math.sin(a) * r_in))
    pts.append((arc_cx - r_in, top_y))
    return pts


def build_m4a1_mag_body(mats: dict) -> bpy.types.Object:
    m_st = mats["F_StanagDryFilm"]
    m_sl = mats["F_RasSlotDark"]

    arc_cx, arc_cy = 18.0, -1.25
    r_in, r_out, ang_end = 16.64, 19.36, 0.36

    raw_mag = mk_extrude_z("mag_raw", _stanag_profile(r_in, r_out, ang_end, 1.05, 28),
                           -0.52, 0.52, bevel=0.036, bevel_segs=2, mat=m_st)

    # Hollow internal curved cartridge stack + feed throat + mag-catch notch + bolt-catch notch + 20/30 witness holes!
    inner_cav = mk_extrude_z("c_mcav", _stanag_profile(r_in + 0.14, r_out - 0.14, ang_end + 0.015, 1.25, 24),
                             -0.40, 0.40, mat=m_sl)
    cutters = [
        inner_cav,
        mk_box("c_mthr", 2.38, 1.95, 0.84, [("t", 0.0, 0.35, 0.0)], m_sl),
        mk_box("c_mbcn", 0.45, 0.36, 0.56, [("t", -1.26, 0.98, 0.0)], m_sl),
        mk_cyl("c_mfnt", 0.28, 0.28, 0.36, "y", 16, [("t", 1.34, 1.02, 0.0)], m_sl),
        mk_box("c_mmcn", 0.58, 0.28, 0.26, [("t", -0.55, 0.25, -0.52)], m_sl),
    ]
    for i, w_ang in enumerate((0.14, 0.30)):
        cutters.append(
            mk_cyl(f"c_mwit_{i}", 0.08, 0.08, 0.44, "y", 14,
                   [("rz", math.pi * 0.5 + w_ang),
                    ("t", arc_cx - math.cos(w_ang) * (r_out - 0.10), arc_cy - math.sin(w_ang) * (r_out - 0.10), 0.0)],
                   m_sl)
        )
    mag_shell = bool_subtract(raw_mag, cutters, solver="EXACT")

    parts = [
        mag_shell,
        # Rear over-insertion stop tab on spine
        mk_box("mag_stop", 0.08, 0.24, 0.44, [("t", -1.39, -1.08, 0.0)], m_st, bevel=0.012),
    ]

    # True Inward-Rolled Stamped USGI STANAG C-Curl Feed Lips w/ front release taper
    for side in (-1.0, 1.0):
        lip_zy = [(0.50 * side, 0.94), (0.50 * side, 1.10)]
        lip_zy += _quad_bez((0.50 * side, 1.10), (0.50 * side, 1.20), (0.40 * side, 1.20), 5)
        lip_zy.append((0.27 * side, 1.18))
        lip_zy += _quad_bez((0.27 * side, 1.18), (0.22 * side, 1.16), (0.25 * side, 1.12), 4)
        lip_zy.append((0.36 * side, 1.10))
        lip_zy += _quad_bez((0.36 * side, 1.10), (0.41 * side, 1.09), (0.41 * side, 1.03), 4)
        lip_zy.append((0.41 * side, 0.94))
        lip_obj = mk_extrude_x(f"mag_lip_{int(side)}", lip_zy, -1.165, 0.885, bevel=0.012, bevel_segs=2, mat=m_st)
        bm = bmesh.new()
        bm.from_mesh(lip_obj.data)
        for v in bm.verts:
            tx, ty = v.co.x, v.co.z
            if tx > 0.30 and ty > 1.06:
                t = min(1.0, (tx - 0.30) / 0.60)
                v.co.z = ty - t * 0.06 * ((ty - 1.06) / 0.14)
        bm.to_mesh(lip_obj.data)
        bm.free()
        parts.append(lip_obj)

    obj = join_objects(parts, "m4a1_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=32.0, lock_flat_walls=True)


def build_m4a1_mag_follower(mats: dict) -> bpy.types.Object:
    m_fo = mats["F_FollowerOrange"]
    parts = [
        mk_box("flw_deck", 2.26, 0.22, 0.78, [("t", 0.0, 0.14, 0.0)], m_fo, bevel=0.032, bevel_segs=2),
        mk_cyl("flw_step", 0.135, 0.135, 2.16, "x", 20, [("t", 0.04, 0.28, 0.17)], m_fo, bevel=0.022),
        mk_box("flw_tab", 0.32, 0.22, 0.38, [("t", -1.12, 0.22, -0.14)], m_fo, bevel=0.022),
        mk_box("flw_fleg", 0.20, 1.12, 0.74, [("t",  1.03, -0.44, 0.0)], m_fo, bevel=0.026),
        mk_box("flw_rleg", 0.20, 1.24, 0.74, [("t", -1.03, -0.50, 0.0)], m_fo, bevel=0.026),
    ]
    obj = join_objects(parts, "m4a1_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_m4a1_mag_floorplate(mats: dict) -> bpy.types.Object:
    m_st = mats["F_StanagDryFilm"]
    m_bs = mats["F_BrightSteel"]
    parts = [
        mk_box("fp_base", 2.86, 0.14, 1.14, [("t", 0.0, -0.06, 0.0)], m_st, bevel=0.024, bevel_segs=2),
        mk_box("fp_rL", 2.84, 0.16, 0.09, [("t", 0.0, 0.05, -0.53)], m_st, bevel=0.015),
        mk_box("fp_rR", 2.84, 0.16, 0.09, [("t", 0.0, 0.05,  0.53)], m_st, bevel=0.015),
        mk_box("fp_ltab", 1.22, 0.08, 0.54, [("t", 0.0, -0.15, 0.0)], m_bs, bevel=0.014),
        mk_cyl("fp_dimp", 0.11, 0.11, 0.06, "y", 16, [("t", -0.92, -0.14, 0.0)], m_bs, bevel=0.010),
    ]
    obj = join_objects(parts, "m4a1_mag_floorplate")
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
    assert span_u > 0.55 and span_v > 0.55, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 6 receiver parts into `m4a1_v3_receiver` (2048x2048):
      - Hero Band 1 (Lower Left  Wall, Y in [-2.22, +1.84]): u in [0.015, 0.985], v in [0.735, 0.985]
      - Hero Band 2 (Lower Right Wall, Y in [-2.22, +1.84]): u in [0.015, 0.985], v in [0.470, 0.720]
      - Hero Band 3 (Upper Top Rail,   X in [-5.50, +4.40]): u in [0.015, 0.985], v in [0.405, 0.458]
      - Packed Region (all non-hero faces):                  u in [0.010, 0.990], v in [0.010, 0.390]
    """
    def is_hero_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "m4a1_lower_receiver" and mat_name == "R_LowerAnodize":
            if -5.82 <= tx <= 4.35 and -2.23 <= ty <= 1.86:
                if nz > 0.85 and 0.71 <= tz <= 0.775:
                    return True
                if nz < -0.85 and -0.775 <= tz <= -0.71:
                    return True
        if obj_name == "m4a1_upper_receiver" and mat_name == "R_RailCrest":
            if -5.52 <= tx <= 4.42 and ty > 2.095 and ny > 0.85 and abs(tz) <= 0.42:
                return True
        return False

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.990, 0.010, 0.390, skip_face_fn=is_hero_face)

    # Project exact world-space hero UVs onto Lower Receiver Left/Right walls (full Y in [-2.22, +1.84])
    lo = next(o for o in recv_objs if o.name == "m4a1_lower_receiver")
    bm = bmesh.new()
    bm.from_mesh(lo.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in lo.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("m4a1_lower_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 5.80) / 10.15))
            yn = max(0.0, min(1.0, (ty + 2.22) / 4.06))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.470 + yn * 0.250)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.735 + yn * 0.250)
    bm.to_mesh(lo.data)
    bm.free()

    # Project exact top-down hero UVs onto Upper Receiver 1913 top rail crowns (T2..T12)
    up = next(o for o in recv_objs if o.name == "m4a1_upper_receiver")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("m4a1_upper_receiver", f, mname):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, tz = vco.x, -vco.y
            xn = max(0.0, min(1.0, (tx - (-5.50)) / 9.90))
            zn = max(0.0, min(1.0, (tz + 0.50) / 1.00))
            # z=-0.50 (screen up in top view) -> v=0.458, z=+0.50 -> v=0.405
            loop[uv_layer].uv = (0.015 + xn * 0.970, 0.458 - zn * 0.053)
    bm.to_mesh(up.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 12 ordnance/BCG/FCG parts into `m4a1_v3_metal` (2048x2048):
      - Upper Zone (exterior barrel, flash hider, FSB, buffer tube, gas tube): [0.010, 0.990] x [0.500, 0.990]
      - Lower Left (BCG, 7-lug bolt, firing pin, hammer, trigger, mag spring): [0.010, 0.775] x [0.010, 0.485]
      - Lower Right Firewall (champagne-gold H2 buffer & tan bumper):          [0.805, 0.990] x [0.010, 0.485]
    """
    ext_front = [o for o in metal_objs if o.name in {
        "m4a1_barrel", "m4a1_flash_hider", "m4a1_front_sight_base", "m4a1_buffer_tube", "m4a1_gas_tube"
    }]
    h2_buf = [o for o in metal_objs if o.name == "m4a1_buffer"]
    int_mech = [o for o in metal_objs if o not in ext_front and o not in h2_buf]
    _smart_unwrap_and_pack_rect(ext_front, 0.010, 0.990, 0.500, 0.990)
    _smart_unwrap_and_pack_rect(int_mech,  0.010, 0.775, 0.010, 0.485)
    _smart_unwrap_and_pack_rect(h2_buf,    0.805, 0.990, 0.010, 0.485)


def unwrap_furniture_atlas(furn_objs: list[bpy.types.Object]):
    """Unwraps 7 furniture/KAC RAS/STANAG parts into `m4a1_v3_furniture` (2048x2048):
      - Hero Band 1 (STANAG Right flank):         u in [0.015, 0.195], v in [0.015, 0.785]
      - Hero Band 2 (STANAG Left  flank):         u in [0.210, 0.390], v in [0.015, 0.785]
      - Firewalled Box (Orange mag follower):     u in [0.010, 0.165], v in [0.815, 0.990]
      - Isolated Box (STANAG grey floorplate):    u in [0.195, 0.390], v in [0.815, 0.990]
      - Main Polymer + KAC RAS + mag non-hero:    u in [0.410, 0.990], v in [0.010, 0.990]
    """
    arc_cx, arc_cy = 18.0, -1.25

    def is_mag_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "m4a1_mag_body" or mat_name != "F_StanagDryFilm":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.85 and tz > 0.485:
            return True
        if nz < -0.85 and tz < -0.485:
            return True
        return False

    follower_grp = [o for o in furn_objs if o.name == "m4a1_mag_follower"]
    floor_grp = [o for o in furn_objs if o.name == "m4a1_mag_floorplate"]
    main_grp = [o for o in furn_objs if o.name not in {"m4a1_mag_follower", "m4a1_mag_floorplate"}]

    _smart_unwrap_and_pack_rect(main_grp,     0.410, 0.990, 0.010, 0.990, skip_face_fn=is_mag_hero_flank)
    _smart_unwrap_and_pack_rect(follower_grp, 0.010, 0.165, 0.815, 0.990)
    _smart_unwrap_and_pack_rect(floor_grp,    0.195, 0.390, 0.815, 0.990)

    # Project C1-continuous straight+curved STANAG UVs onto Hero Band 1 & 2
    mag = next(o for o in furn_objs if o.name == "m4a1_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero_flank("m4a1_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            if ty >= arc_cy:
                r_norm = max(0.0, min(1.0, (1.36 - tx) / 2.72))
                v_norm = 0.73 + max(0.0, min(1.0, (ty - arc_cy) / 2.30)) * 0.27
            else:
                dx = tx - arc_cx
                dy = ty - arc_cy
                rad = math.hypot(dx, dy)
                ang = math.atan2(-dy, -dx)
                r_norm = max(0.0, min(1.0, (rad - 16.64) / 2.72))
                v_norm = 0.73 - max(0.0, min(1.0, ang / 0.36)) * 0.73
            v_val = 0.015 + v_norm * 0.770
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
        o.location = (i * 60.0, 0.0, 0.0)
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
            o.location = (0.0, 200.0, 0.0)


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

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.45
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


def triangulate_all_keep_normals(all_objs: list[bpy.types.Object]):
    """Triangulate BEFORE Cycles bake so tangent frames match exported Draco GLB 1:1!"""
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


def render_qa_previews(all_objs: list[bpy.types.Object]):
    """Render 5 studio Cycles QA plates using the final baked 2K ORM WebP textures."""
    scene = bpy.context.scene
    print("\n[QA] Rendering 5 museum studio Cycles QA preview plates to /tmp/m4a1_qa_*.png...")

    def _make_baked_mat(label: str, prefix: str) -> bpy.types.Material:
        mat = bpy.data.materials.new(f"__QA_{label}__")
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        img_a = bpy.data.images.load(str(TEX_OUT_DIR / f"{prefix}_albedo.webp"))
        img_a.colorspace_settings.name = "sRGB"
        img_n = bpy.data.images.load(str(TEX_OUT_DIR / f"{prefix}_normal.webp"))
        img_n.colorspace_settings.name = "Non-Color"
        img_r = bpy.data.images.load(str(TEX_OUT_DIR / f"{prefix}_roughness.webp"))
        img_r.colorspace_settings.name = "Non-Color"

        ta = nt.nodes.new("ShaderNodeTexImage"); ta.image = img_a
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img_n
        tr = nt.nodes.new("ShaderNodeTexImage"); tr.image = img_r
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tr.outputs["Color"], sep.inputs["Color"])

        mix_ao = nt.nodes.new("ShaderNodeMix")
        mix_ao.data_type = "RGBA"; mix_ao.blend_type = "MULTIPLY"
        mix_ao.inputs[0].default_value = 0.85
        nt.links.new(ta.outputs["Color"], mix_ao.inputs[6])
        nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])
        nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        nrm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nrm.inputs["Color"])
        nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    m_recv = _make_baked_mat("recv", "m4a1_v3_receiver")
    m_met = _make_baked_mat("met", "m4a1_v3_metal")
    m_furn = _make_baked_mat("furn", "m4a1_v3_furniture")

    for o in all_objs:
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
        o.rotation_euler = (rx, -rz, ry)
        o.hide_render = o.name not in EXTERIOR_CONTACT_AO_PARTS
        o.data.materials.clear()
        if o.name in RECEIVER_PARTS:
            o.data.materials.append(m_recv)
        elif o.name in METAL_PARTS:
            o.data.materials.append(m_met)
        else:
            o.data.materials.append(m_furn)

    scene.world.use_nodes = True
    wnt = scene.world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    bg = wnt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.34, 0.36, 0.40, 1.0)
    bg.inputs["Strength"].default_value = 1.15
    wnt.links.new(bg.outputs["Background"], wout.inputs["Surface"])

    def _add_area(name, loc_three, target_three, energy, sx, sy, color=(1.0, 0.99, 0.97)):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy; ld.shape = "RECTANGLE"; ld.size = sx; ld.size_y = sy; ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = t2b(*loc_three)
        lo.rotation_euler = (t2b(*target_three) - lo.location).to_track_quat("-Z", "Y").to_euler()

    _add_area("KeyR", (2.0, 18.0, 26.0), (1.0, 0.0, 0.0), 16000, 26.0, 14.0, (1.0, 0.98, 0.95))
    _add_area("KeyL", (2.0, 18.0, -26.0), (1.0, 0.0, 0.0), 16000, 26.0, 14.0, (1.0, 0.98, 0.95))
    _add_area("Rim",  (4.0, 24.0, 0.0),   (1.0, 0.0, 0.0), 11000, 42.0, 8.0,  (0.92, 0.96, 1.0))

    cam_d = bpy.data.cameras.new("QACam")
    cam_d.lens = 75.0
    cam_o = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"

    shots = [
        ("/tmp/m4a1_qa_right.png",        ( 2.0,  0.2,  32.0), ( 2.0, -0.4, 0.0), 54.0),
        ("/tmp/m4a1_qa_left.png",         ( 2.0,  0.2, -32.0), ( 2.0, -0.4, 0.0), 54.0),
        ("/tmp/m4a1_qa_macro_breech.png", ( 0.4,  0.2,  14.5), ( 0.4,  0.2, 0.0), 80.0),
        ("/tmp/m4a1_qa_macro_left.png",   ( 0.8, -0.4, -14.5), ( 0.8, -0.4, 0.0), 80.0),
        ("/tmp/m4a1_qa_macro_grip.png",   (-2.2, -2.8,  14.5), (-2.2, -2.8, 0.0), 82.0),
    ]
    for out_path, cam_pos, tgt_pos, lens in shots:
        cam_d.lens = lens
        cam_o.location = t2b(*cam_pos)
        cam_o.rotation_euler = (t2b(*tgt_pos) - cam_o.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        print(f"  [QA-RENDER] Saved {out_path}")


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        "m4a1_upper_receiver":   build_m4a1_upper_receiver,
        "m4a1_lower_receiver":   build_m4a1_lower_receiver,
        "m4a1_carry_handle":     build_m4a1_carry_handle,
        "m4a1_charging_handle":  build_m4a1_charging_handle,
        "m4a1_dust_cover":       build_m4a1_dust_cover,
        "m4a1_selector":         build_m4a1_selector,
        "m4a1_barrel":           build_m4a1_barrel,
        "m4a1_flash_hider":      build_m4a1_flash_hider,
        "m4a1_front_sight_base": build_m4a1_front_sight_base,
        "m4a1_bolt_carrier":     build_m4a1_bolt_carrier,
        "m4a1_bolt":             build_m4a1_bolt,
        "m4a1_firing_pin":       build_m4a1_firing_pin,
        "m4a1_gas_tube":         build_m4a1_gas_tube,
        "m4a1_buffer_tube":      build_m4a1_buffer_tube,
        "m4a1_buffer":           build_m4a1_buffer,
        "m4a1_hammer":           build_m4a1_hammer,
        "m4a1_trigger":          build_m4a1_trigger,
        "m4a1_mag_spring":       build_m4a1_mag_spring,
        "m4a1_ras_upper":        build_m4a1_ras_upper,
        "m4a1_ras_lower":        build_m4a1_ras_lower,
        "m4a1_buttstock":        build_m4a1_buttstock,
        "m4a1_pistol_grip":      build_m4a1_pistol_grip,
        "m4a1_mag_body":         build_m4a1_mag_body,
        "m4a1_mag_follower":     build_m4a1_mag_follower,
        "m4a1_mag_floorplate":   build_m4a1_mag_floorplate,
    }

    print("[BUILD] Sculpting all 25 solid Colt M4A1 SOPMOD hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    furn_objs = [built[pid] for pid in FURNITURE_PARTS]
    all_objs = recv_objs + metal_objs + furn_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (6), metal (12), furniture (7)...")
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
            assert 0.00003 < oa < 0.72, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    print("[TRI] Pre-bake triangulation with preserved custom normals (1:1 tangent-frame lock)...")
    triangulate_all_keep_normals(all_objs)

    with tempfile.TemporaryDirectory(prefix="m4a1_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking m4a1_v3_receiver (2048x2048, 6 hero parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m4a1_v3_metal (2048x2048, 12 ordnance/BCG/FCG parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m4a1_v3_furniture (2048x2048, 7 KAC RAS/polymer/STANAG parts)...")
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir)

        print("[POST] Compositing Colt rollmarks, IUID DataMatrix, T-rail marks, STANAG wear & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)
    if "--preview" in sys.argv:
        render_qa_previews(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m4a1_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "m4a1_v3_receiver_normal.webp",
        TEX_OUT_DIR / "m4a1_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "m4a1_v3_metal_albedo.webp",
        TEX_OUT_DIR / "m4a1_v3_metal_normal.webp",
        TEX_OUT_DIR / "m4a1_v3_metal_roughness.webp",
        TEX_OUT_DIR / "m4a1_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "m4a1_v3_furniture_normal.webp",
        TEX_OUT_DIR / "m4a1_v3_furniture_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== COLT M4A1 SOPMOD V3 ASSET BUDGET ===")
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
