#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Heckler & Koch MP5A3 (9x19mm Parabellum)
========================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 2)

Generates:
  - public/models/mp5.glb (Draco-compressed glTF 2.0, all 25 solid parts; skips ONLY
    dynamic GPU-compressed helical spring `mp5_recoil_spring` carrying `aSpringParam`)
  - public/textures/mp5_v3_receiver_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/mp5_v3_metal_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)
  - public/textures/mp5_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 25 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/mp5/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_mp5_photoreal.py
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
# MODE 2: System Python Post-Process (HK Oberndorf Rollmarks, Ulm Proofs,
#         Navy Bullet Pictograms, Curved Steel Mag Stamping & 5-Ch ORM WebPs)
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

    def _draw_ulm_proof(draw: ImageDraw.ImageDraw, x: float, y: float, s: float = 1.0) -> None:
        """Crisp German Beschussamt Ulm stag-antler + Federal Eagle / N nitro proof stamps."""
        w_main = max(2, round(4.5 * s))
        w_tine = max(2, round(3.4 * s))
        draw.line(
            [(x, y + 36 * s), (x + 20 * s, y + 31 * s), (x + 38 * s, y + 17 * s), (x + 54 * s, y + 4 * s)],
            fill=255, width=w_main,
        )
        for pts in (
            [(x + 15 * s, y + 31 * s), (x + 9 * s, y + 19 * s), (x + 9 * s, y + 9 * s)],
            [(x + 26 * s, y + 25 * s), (x + 24 * s, y + 11 * s), (x + 30 * s, y + 3 * s)],
            [(x + 38 * s, y + 16 * s), (x + 38 * s, y + 2 * s)],
            [(x + 40 * s, y + 16 * s), (x + 57 * s, y + 18 * s), (x + 66 * s, y + 11 * s)],
        ):
            draw.line(pts, fill=255, width=w_tine)
        # German Federal Eagle over 'N' nitro proof shield
        ex, ey = x + 96 * s, y + 18 * s
        draw.polygon(
            [
                (ex - 17 * s, ey - 15 * s), (ex + 17 * s, ey - 15 * s),
                (ex + 13 * s, ey + 2 * s), (ex, ey + 11 * s), (ex - 13 * s, ey + 2 * s),
            ],
            outline=255, width=max(2, round(3.2 * s)),
        )
        draw.line([(ex - 24 * s, ey - 10 * s), (ex + 24 * s, ey - 10 * s)], fill=255, width=max(2, round(3.2 * s)))
        draw.text((ex + 32 * s, y + 3 * s), "CIP  N  IK", fill=250, font=_load_font(FONT_COND, round(34 * s)))

    def _draw_bullet_world(draw: ImageDraw.ImageDraw, cx: float, cy: float, length: float, height_px: float, dir_sign: int):
        """1:1 world-proportional 9x19mm FMJ cartridge silhouette pointing toward +X muzzle."""
        s = dir_sign
        x0, shoulder, neck, tip = -length * 0.5, length * 0.20, length * 0.30, length * 0.50
        r = height_px * 0.5
        pts = [
            (x0, -r), (shoulder, -r), (neck, -r * 0.68),
            (tip - length * 0.09, -r * 0.34), (tip, 0.0),
            (tip - length * 0.09, r * 0.34), (neck, r * 0.68),
            (shoulder, r), (x0, r),
        ]
        draw.polygon([(round(cx + px * s), round(cy + py)) for px, py in pts], fill=255)

    def _draw_navy_cluster(w_draw: ImageDraw.ImageDraw, r_draw: ImageDraw.ImageDraw,
                           piv_x: float, piv_y: float, ppcm: float, dir_sign: int):
        """Crisp Oberndorf HK Navy 0 / 1 / F (Safe / Semi / Auto) Bullet Pictogram Cluster.
        - TOP    (+Y in 3D, dy < 0 in PIL): White boxed crossed-out cartridge (SAFE)
        - MIDDLE (level,    dy = 0 in PIL): Vivid Crimson-Red boxed 1-bullet  (SEMI, aligned to selector pointer!)
        - BOTTOM (-Y in 3D, dy > 0 in PIL): Vivid Crimson-Red open-front 7-bullet spray (800 RPM AUTO)
        """
        s = dir_sign
        box_w = 0.86 * ppcm
        box_h = 0.275 * ppcm
        # Selector lever tip extends ~1.12 cm from pivot; dots at 1.24 cm, icons at [1.38 .. 2.24 cm] forward!
        specs = (
            ("safe", -0.375 * ppcm, 1.38 * ppcm, 1.23 * ppcm),
            ("semi",  0.000 * ppcm, 1.42 * ppcm, 1.26 * ppcm),
            ("auto",  0.385 * ppcm, 1.38 * ppcm, 1.23 * ppcm),
        )
        for mode, dy, r_off, dot_r in specs:
            draw = w_draw if mode == "safe" else r_draw
            cx = piv_x + (r_off + box_w * 0.5) * s
            cy = piv_y + dy
            a, b = cx - box_w * 0.5, cx + box_w * 0.5
            half_h = (0.175 * ppcm) if mode == "auto" else (box_h * 0.5)
            top, bottom = cy - half_h, cy + half_h

            # Circular selector index dot on radial arc right ahead of lever tip
            dot_x = piv_x + dot_r * s
            dot_rad = max(5, round(0.036 * ppcm))
            draw.ellipse((dot_x - dot_rad, cy - dot_rad, dot_x + dot_rad, cy + dot_rad), fill=255)

            stroke = max(4, round(0.028 * ppcm))
            if mode == "auto":
                # Open-front 7-round burst pictogram box (open toward muzzle!)
                rear, front = (a, b) if s > 0 else (b, a)
                draw.line([(front, top), (rear, top), (rear, bottom), (front, bottom)], fill=255, width=stroke)
                sq = max(3, round(0.018 * ppcm))
                for yy in (top + 0.045 * ppcm, cy, bottom - 0.045 * ppcm):
                    draw.rectangle((front - sq, yy - sq, front + sq, yy + sq), fill=255)
                # 7 staggered bullet silhouettes (3 + 2 + 2)
                for ox_f, oy_f in (
                    (-0.27, -0.46), (0.04, -0.46), (0.33, -0.46),
                    (-0.12,  0.00), (0.19,  0.00),
                    (-0.27,  0.46), (0.04,  0.46),
                ):
                    _draw_bullet_world(
                        draw, cx + ox_f * box_w * s, cy + oy_f * half_h,
                        0.24 * box_w, 0.30 * half_h, s,
                    )
            else:
                draw.rounded_rectangle((a, top, b, bottom), radius=max(4, round(0.025 * ppcm)), outline=255, width=stroke)
                _draw_bullet_world(
                    draw, cx, cy,
                    (0.56 if mode == "safe" else 0.62) * box_w, 0.44 * box_h, s,
                )
                if mode == "safe":
                    # Crisp diagonal cancel X across white SAFE cartridge box
                    pad_x = 0.14 * box_w
                    pad_y = 0.12 * box_h
                    draw.line([(a + pad_x, bottom - pad_y), (b - pad_x, top + pad_y)], fill=255, width=stroke)
                    draw.line([(a + pad_x, top + pad_y), (b - pad_x, bottom - pad_y)], fill=255, width=stroke)

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

        # Hero UV bands for Stamped Upper Receiver flanks (X in [-5.48, +5.48], Y in [-1.80, +2.64]):
        #   Left  wall: u in [0.015, 0.985] (1 - xNorm: +X front -> u=0.015), v in [0.730, 0.985]
        #   Right wall: u in [0.015, 0.985] (xNorm:     -X rear  -> u=0.015), v in [0.460, 0.715]
        PPCM = 280.0
        X0, XSPAN = -5.48, 10.96
        Y0, YSPAN = -1.80, 4.44
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3069 x 1243

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        white_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        rail_wear = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT RECEIVER FLANK: Red [HK] + MP5 Kal. 9mmx19 + DE 62-19408 + Ulm Proof ---
        w_left = Image.new("L", (CW, CH), 0)
        r_left = Image.new("L", (CW, CH), 0)
        wear_l = Image.new("L", (CW, CH), 0)
        dwl, drl, dwrl = ImageDraw.Draw(w_left), ImageDraw.Draw(r_left), ImageDraw.Draw(wear_l)

        # Main hero Oberndorf stamp cleanly above magwell & ahead of stock channel (X in [+1.90..+5.15], Y in [+0.42..+1.16])
        # Note: on Left flank, +X is LEFT -> cx_left(5.12) is left edge, cx_left(1.90) is right edge!
        lx0 = xw_to_cx_left(5.10)
        ly0 = yw_to_cy(1.06)
        drl.rounded_rectangle((lx0, ly0, lx0 + 122, ly0 + 84), radius=10, outline=255, width=7)
        drl.text((lx0 + 61, ly0 + 42), "HK", fill=255, font=_load_font(FONT_DIN, 64), anchor="mm")
        dwl.text((lx0 + 144, ly0 + 4), "MP5  Kal. 9mm×19", fill=255, font=_load_font(FONT_DIN, 64))
        dwl.text((lx0 + 144, ly0 + 90), "DE  62 - 19408", fill=248, font=_load_font(FONT_DIN, 44))
        _draw_ulm_proof(dwl, lx0 + 448, ly0 + 90, s=0.98)

        # Secondary rollmark above left stock channel (X in [-1.85..+1.35], Y in [+1.28..+1.66])
        ux0 = xw_to_cx_left(1.30)
        uy0 = yw_to_cy(1.62)
        dwl.text((ux0, uy0), "HECKLER & KOCH  OBERNDORF / N.", fill=242, font=_load_font(FONT_DIN, 42))

        # Left A3 sliding-stock channel longitudinal subtle oiled-steel wear hairlines (X in [-5.44..+1.66], Y in [0.88..1.12])
        rng_w = np.random.default_rng(9191)
        ch_x0_l, ch_x1_l = xw_to_cx_left(1.66), xw_to_cx_left(-5.44)
        ch_y0, ch_y1 = yw_to_cy(1.12), yw_to_cy(0.88)
        for _ in range(95):
            sx = float(rng_w.uniform(ch_x0_l, ch_x1_l - 80))
            sy = float(rng_w.uniform(ch_y0 + 5, ch_y1 - 5))
            slen = float(rng_w.uniform(60, 290))
            dwrl.line([(sx, sy), (min(ch_x1_l, sx + slen), sy + float(rng_w.uniform(-1.2, 1.2)))],
                      fill=int(rng_w.integers(75, 195)), width=1)

        _paste_uv_band(white_m, w_left, 0.015, 0.985, 0.730, 0.985)
        _paste_uv_band(red_m, r_left, 0.015, 0.985, 0.730, 0.985)
        _paste_uv_band(rail_wear, wear_l, 0.015, 0.985, 0.730, 0.985)

        # --- 2) RIGHT RECEIVER FLANK: HECKLER & KOCH GMBH / OBERNDORF / MADE IN GERMANY + Brass Kiss ---
        w_right = Image.new("L", (CW, CH), 0)
        wear_r = Image.new("L", (CW, CH), 0)
        kiss_r = Image.new("L", (CW, CH), 0)
        dwr, dwrr, dkr = ImageDraw.Draw(w_right), ImageDraw.Draw(wear_r), ImageDraw.Draw(kiss_r)

        # Below right stock channel (X in [-4.20..+1.00], Y in [0.32..0.78])
        rx0 = xw_to_cx_right(-4.05)
        ry0 = yw_to_cy(0.75)
        dwr.text((rx0, ry0), "HECKLER & KOCH GMBH", fill=255, font=_load_font(FONT_DIN, 50))
        dwr.text((rx0, ry0 + 58), "OBERNDORF / N.   MADE IN GERMANY", fill=244, font=_load_font(FONT_DIN, 39))

        # Above right stock channel (X in [-3.10..+0.90], Y in [1.30..1.66])
        rtx0 = xw_to_cx_right(-3.00)
        rty0 = yw_to_cy(1.62)
        dwr.text((rtx0, rty0), "HK  MP5A3   9mm×19", fill=248, font=_load_font(FONT_DIN, 46))
        _draw_ulm_proof(dwr, rtx0 + 510, rty0 + 4, s=0.92)

        # Right A3 sliding-stock channel longitudinal subtle oiled-steel wear hairlines
        ch_x0_r, ch_x1_r = xw_to_cx_right(-5.44), xw_to_cx_right(1.66)
        for _ in range(95):
            sx = float(rng_w.uniform(ch_x0_r, ch_x1_r - 80))
            sy = float(rng_w.uniform(ch_y0 + 5, ch_y1 - 5))
            slen = float(rng_w.uniform(60, 290))
            dwrr.line([(sx, sy), (min(ch_x1_r, sx + slen), sy + float(rng_w.uniform(-1.2, 1.2)))],
                      fill=int(rng_w.integers(75, 195)), width=1)

        # Authentic delicate golden-brass shell-kiss flecks tight behind ejection port lip (X in [1.18..1.44], Y in [0.88..1.30])
        rng_k = np.random.default_rng(9192)
        for _ in range(22):
            kx = float(xw_to_cx_right(float(rng_k.uniform(1.20, 1.43))))
            ky = float(yw_to_cy(float(rng_k.uniform(0.90, 1.28))))
            krx, kry = float(rng_k.uniform(4, 12)), float(rng_k.uniform(2, 6))
            dkr.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(75, 195)))

        _paste_uv_band(white_m, w_right, 0.015, 0.985, 0.460, 0.715)
        _paste_uv_band(rail_wear, wear_r, 0.015, 0.985, 0.460, 0.715)
        _paste_uv_band(brass_kiss, kiss_r, 0.015, 0.985, 0.460, 0.715)

        # Subtle field-handling micro-scratches on receiver flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.730) & (v_grid <= 0.985)) | ((v_grid >= 0.460) & (v_grid <= 0.715))
        )).astype(np.float32)

        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        rng_s = np.random.default_rng(9193)
        for _ in range(110):
            sx = float(rng_s.uniform(0.02, 0.98) * w)
            sy = float(rng_s.uniform(0.02, 0.53) * h)
            length = float(rng_s.uniform(14, 62))
            ang = math.radians(float(rng_s.uniform(-18, 18)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng_s.integers(75, 195)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls
        _mix(albedo, (0.50, 0.53, 0.57), sc * 0.28)
        rgh -= sc * 0.06
        met = np.clip(met + sc * 0.10, 0.02, 0.98)

        # Composite subtle oiled-steel stock-channel rail polish & ejection-port brass kisses
        rail_wear = _smoothstep(0.14, 0.68, rail_wear)
        _mix(albedo, (0.52, 0.56, 0.62), rail_wear * 0.40)
        _mix(rgh, 0.21, rail_wear * 0.60)
        _mix(met, 0.94, rail_wear * 0.70)

        brass_kiss = ndimage.gaussian_filter(brass_kiss, sigma=0.9)
        brass_kiss = _smoothstep(0.12, 0.58, brass_kiss)
        _mix(albedo, (0.72, 0.56, 0.23), brass_kiss * 0.48)
        _mix(rgh, 0.24, brass_kiss * 0.52)
        _mix(met, 0.94, brass_kiss * 0.60)

        # Composite crisp Oberndorf enamel-infilled white & crimson-red rollmarks
        mark_all = np.maximum(white_m, red_m)
        decal_height = -0.58 * _bevel_mask(mark_all, width_px=1.2) - 0.12 * rail_wear - 0.04 * sc
        _mix(albedo, (0.88, 0.90, 0.93), white_m * 0.95)
        _mix(albedo, (0.82, 0.08, 0.06), red_m * 0.97)
        _mix(rgh, 0.36, white_m * 0.88)
        _mix(rgh, 0.26, red_m * 0.92)
        _mix(met, 0.04, mark_all * 0.94)
        ao *= 1.0 - 0.11 * mark_all

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved mp5_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

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
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero Curved 30-Rd Stamped-Steel MP5 Magazine Flanks:
        #   Right flank: u in [0.640, 0.805], v in [0.015, 0.985] (v=0.985 top throat -> v=0.015 floorplate)
        #   Left  flank: u in [0.820, 0.985], v in [0.015, 0.985]
        mw, mh = 560, 2860
        mag_stamp = np.zeros((h, w), dtype=np.float32)
        mag_spots = np.zeros((h, w), dtype=np.float32)

        # Left flank carries HK 9mmx19 / MADE IN GERMANY / IR date code cleanly between the twin curved flank ribs!
        left_stamp_img = Image.new("L", (mw, mh), 0)
        dsl = ImageDraw.Draw(left_stamp_img)
        dsl.text((mw // 2, int(mh * 0.818)), "HK  9mm×19", font=_load_font(FONT_DIN, 50), fill=255, anchor="mm")
        dsl.text((mw // 2, int(mh * 0.858)), "MADE IN GERMANY", font=_load_font(FONT_COND, 38), fill=242, anchor="mm")
        dsl.text((mw // 2, int(mh * 0.896)), "IR", font=_load_font(FONT_DIN, 44), fill=245, anchor="mm")

        # Subtle seam spot-weld dimples along front/rear stamped flanges on both flanks
        spot_img = Image.new("L", (mw, mh), 0)
        dsp = ImageDraw.Draw(spot_img)
        for yf in (0.14, 0.27, 0.40, 0.53, 0.66, 0.79, 0.91):
            cy = int(yf * mh)
            for xf in (0.075, 0.925):
                cx = int(xf * mw)
                dsp.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=255)

        _paste_uv_band(mag_stamp, left_stamp_img, 0.820, 0.985, 0.015, 0.985)
        for pu0, pu1 in ((0.640, 0.805), (0.820, 0.985)):
            _paste_uv_band(mag_spots, spot_img, pu0, pu1, 0.015, 0.985)

        # Realistic vertical magwell insertion scuffs on upper neck (v in [0.76, 0.985])
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        neck_mask = (
            (((u_grid >= 0.640) & (u_grid <= 0.805)) | ((u_grid >= 0.820) & (u_grid <= 0.985)))
            & (v_grid >= 0.745) & (v_grid <= 0.985)
        ).astype(np.float32)

        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        rng_m = np.random.default_rng(9194)
        for _ in range(380):
            sx = float(rng_m.uniform(0.644, 0.980) * w)
            sy = float(rng_m.uniform(0.018, 0.250) * h)
            slen = float(rng_m.uniform(16, 110))
            dsc.line([(sx, sy), (sx + float(rng_m.uniform(-2.0, 2.0)), sy + slen)],
                     fill=int(rng_m.integers(80, 230)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * neck_mask

        decal_height = -0.52 * _bevel_mask(mag_stamp, width_px=1.3) - 0.30 * _bevel_mask(mag_spots, width_px=2.2) - 0.06 * scuffs
        _mix(albedo, (0.76, 0.79, 0.83), scuffs * 0.62)
        _mix(rgh, 0.18, scuffs * 0.70)
        _mix(met, 0.96, scuffs * 0.75)

        _mix(albedo, (0.58, 0.61, 0.66), mag_stamp * 0.78)
        _mix(rgh, 0.42, mag_stamp * 0.75)
        _mix(met, 0.45, mag_stamp * 0.60)
        ao *= 1.0 - 0.15 * mag_stamp - 0.12 * mag_spots

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.09, 0.95)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved mp5_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

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

        # Hero UV Bands for HK Navy Bullet-Pictogram Polymer Grip Housing:
        #   Local bounds: X in [-4.35, +3.80] (span 8.15 cm), Y in [-5.80, +0.95] (span 6.75 cm)
        #   Right Flank (+Z): u in [0.015, 0.485] (xNorm),       v in [0.470, 0.985] (yNorm)
        #   Left  Flank (-Z): u in [0.515, 0.985] (1.0 - xNorm), v in [0.470, 0.985] (yNorm)
        PPCM = 260.0
        GX0, GXSPAN = -4.35, 8.15
        GY0, GYSPAN = -5.80, 6.75
        GW, GH = int(round(GXSPAN * PPCM)), int(round(GYSPAN * PPCM))  # 2119 x 1755

        def gy_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - GY0) / GYSPAN) * GH))

        def gx_to_cx_right(xw: float) -> int:
            return int(round((xw - GX0) / GXSPAN * GW))

        def gx_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - GX0) / GXSPAN) * GW))

        w_right, r_right, m_right = [Image.new("L", (GW, GH), 0) for _ in range(3)]
        w_left, r_left, m_left = [Image.new("L", (GW, GH), 0) for _ in range(3)]

        # Selector pivot at exact CAD local (-1.00, -0.20)
        prx, pry = gx_to_cx_right(-1.00), gy_to_cy(-0.20)
        _draw_navy_cluster(ImageDraw.Draw(w_right), ImageDraw.Draw(r_right), prx, pry, PPCM, +1)

        # Molded recessed [HK] emblem on sculpted lower grip flank (X = -2.65, Y = -3.65)
        grx, gry = gx_to_cx_right(-2.65), gy_to_cy(-3.65)
        dmr = ImageDraw.Draw(m_right)
        dmr.rounded_rectangle((grx - 86, gry - 56, grx + 86, gry + 56), radius=12, outline=255, width=7)
        dmr.text((grx, gry), "HK", fill=255, font=_load_font(FONT_DIN, 78), anchor="mm")

        plx, ply = gx_to_cx_left(-1.00), gy_to_cy(-0.20)
        _draw_navy_cluster(ImageDraw.Draw(w_left), ImageDraw.Draw(r_left), plx, ply, PPCM, -1)

        glx, gly = gx_to_cx_left(-2.65), gy_to_cy(-3.65)
        dml = ImageDraw.Draw(m_left)
        dml.rounded_rectangle((glx - 86, gly - 56, glx + 86, gly + 56), radius=12, outline=255, width=7)
        dml.text((glx, gly), "HK", fill=255, font=_load_font(FONT_DIN, 78), anchor="mm")

        w_mark = np.zeros((h, w), dtype=np.float32)
        r_mark = np.zeros((h, w), dtype=np.float32)
        m_mark = np.zeros((h, w), dtype=np.float32)

        _paste_uv_band(w_mark, w_right, 0.015, 0.485, 0.470, 0.985)
        _paste_uv_band(r_mark, r_right, 0.015, 0.485, 0.470, 0.985)
        _paste_uv_band(m_mark, m_right, 0.015, 0.485, 0.470, 0.985)

        _paste_uv_band(w_mark, w_left, 0.515, 0.985, 0.470, 0.985)
        _paste_uv_band(r_mark, r_left, 0.515, 0.985, 0.470, 0.985)
        _paste_uv_band(m_mark, m_left, 0.515, 0.985, 0.470, 0.985)

        # Recessed hot-stamped pockets + vivid crimson-red & crisp white enamel paint infill
        paint = np.maximum(w_mark, r_mark)
        pocket = ndimage.maximum_filter(paint, size=3)
        decal_height = (
            -0.64 * _bevel_mask(pocket, width_px=1.6)
            + 0.16 * _bevel_mask(paint, width_px=1.0)
            - 0.42 * _bevel_mask(m_mark, width_px=1.4)
        )
        # Subtle dark polymer recess rim around painted icons
        _mix(albedo, (0.075, 0.080, 0.088), np.clip(pocket - paint, 0.0, 1.0) * 0.72)
        _mix(albedo, (0.93, 0.94, 0.96), w_mark * 0.98)
        _mix(albedo, (0.86, 0.075, 0.055), r_mark * 0.98)
        _mix(rgh, 0.26, paint * 0.95)
        _mix(met, 0.01, paint * 0.98)
        ao *= (1.0 - 0.14 * pocket) * (1.0 - 0.14 * m_mark)

        # Subtle satin sheen inside recessed molded [HK] grip emblem
        _mix(albedo, (0.145, 0.152, 0.164), m_mark * 0.55)
        _mix(rgh, 0.56, m_mark * 0.65)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_furniture_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_furniture_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "mp5_v3_furniture_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved mp5_v3_furniture_{albedo,normal,roughness}.webp (2048x2048)")

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
MODELS_OUT = REPO_ROOT / "public" / "models" / "mp5.glb"
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


# Exact 25 solid HK MP5A3 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY dynamic GPU-compressed helical spring `mp5_recoil_spring`!)
RECEIVER_PARTS = [
    "mp5_upper_receiver",
    "mp5_cocking_tube",
    "mp5_front_sight",
    "mp5_rear_sight",
    "mp5_stock_endcap",
]

METAL_PARTS = [
    "mp5_barrel",
    "mp5_buttstock",
    "mp5_charging_handle",
    "mp5_bolt_carrier",
    "mp5_bolt_head",
    "mp5_locking_rollers",
    "mp5_locking_roller_left",
    "mp5_locking_piece",
    "mp5_firing_pin",
    "mp5_recoil_rod",
    "mp5_trigger_pack",
    "mp5_hammer",
    "mp5_trigger",
    "mp5_mag_body",
    "mp5_mag_spring",
    "mp5_mag_floorplate",
]

FURNITURE_PARTS = [
    "mp5_grip_housing",
    "mp5_forearm",
    "mp5_selector",
    "mp5_mag_follower",
]

# Exterior parts receiving assembled inter-part contact AO (internal & sliding parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "mp5_upper_receiver",
    "mp5_cocking_tube",
    "mp5_barrel",
    "mp5_front_sight",
    "mp5_rear_sight",
    "mp5_forearm",
    "mp5_stock_endcap",
    "mp5_buttstock",
    "mp5_charging_handle",
    "mp5_grip_housing",
    "mp5_selector",
    "mp5_trigger",
    "mp5_mag_body",
    "mp5_mag_floorplate",
}

ASSEMBLED_POS = {
    "mp5_charging_handle":     ( 12.450,  2.080,  0.000),
    "mp5_bolt_carrier":        ( -1.150,  1.000,  0.000),
    "mp5_bolt_head":           (  1.750,  1.000,  0.000),
    "mp5_locking_rollers":     (  2.150,  1.000,  0.400),
    "mp5_locking_roller_left": (  2.150,  1.000, -0.400),
    "mp5_locking_piece":       (  1.150,  1.000,  0.000),
    "mp5_firing_pin":          (  0.550,  1.000,  0.000),
    "mp5_recoil_rod":          ( -5.350,  2.080,  0.000),
    "mp5_upper_receiver":      (  0.000,  0.000,  0.000),
    "mp5_cocking_tube":        ( 10.350,  2.080,  0.000),
    "mp5_barrel":              (  0.000,  1.000,  0.000),
    "mp5_front_sight":         ( 15.400,  1.000,  0.000),
    "mp5_rear_sight":          ( -4.250,  2.620,  0.000),
    "mp5_forearm":             ( 10.250,  0.720,  0.000),
    "mp5_stock_endcap":        ( -5.950,  1.050,  0.000),
    "mp5_buttstock":           (-14.450,  0.350,  0.000),
    "mp5_grip_housing":        ( -2.150, -0.350,  0.000),
    "mp5_trigger_pack":        ( -1.850, -0.250,  0.000),
    "mp5_hammer":              ( -0.850, -0.050,  0.000),
    "mp5_trigger":             ( -1.750, -0.950,  0.000),
    "mp5_selector":            ( -3.150, -0.550,  0.000),
    "mp5_mag_body":            (  2.900, -0.450,  0.000),
    "mp5_mag_follower":        (  4.370, -6.700,  0.000),
    "mp5_mag_spring":          (  2.900, -0.450,  0.000),
    "mp5_mag_floorplate":      (  5.180, -8.230,  0.000),
}

ASSEMBLED_ROT_THREE = {
    "mp5_mag_follower": (0.0, 0.0, 0.432),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured from src/weapons/mp5/meshes/*.ts
CSG_REF_BBOX = {
    "mp5_charging_handle":     ((-1.625, -0.346, -1.749), ( 1.425,  0.464,  0.350)),
    "mp5_bolt_carrier":        ((-1.850, -0.460, -0.590), (10.770,  1.441,  0.590)),
    "mp5_bolt_head":           ((-0.850, -0.510, -0.420), ( 0.920,  0.415,  0.444)),
    "mp5_locking_rollers":     ((-0.185, -0.290, -0.185), ( 0.185,  0.290,  0.185)),
    "mp5_locking_roller_left": ((-0.185, -0.290, -0.185), ( 0.185,  0.290,  0.185)),
    "mp5_locking_piece":       ((-0.870, -0.340, -0.320), ( 1.243,  0.340,  0.320)),
    "mp5_firing_pin":          ((-1.160, -0.172, -0.175), ( 2.060,  0.172,  0.175)),
    "mp5_recoil_rod":          ((-0.010, -0.490, -0.370), (11.625,  0.290,  0.370)),
    "mp5_upper_receiver":      ((-5.480, -2.207, -0.827), ( 5.480,  2.710,  0.872)),
    "mp5_cocking_tube":        ((-4.975, -0.546, -0.550), ( 5.475,  0.546,  0.550)),
    "mp5_barrel":              (( 1.850, -0.590, -0.620), (19.520,  0.590,  0.620)),
    "mp5_front_sight":         ((-0.760, -0.890, -0.830), ( 0.640,  2.530,  0.620)),
    "mp5_rear_sight":          ((-0.730, -0.110, -0.560), ( 0.730,  0.852,  0.560)),
    "mp5_forearm":             ((-5.060, -1.030, -1.096), ( 5.010,  0.930,  1.096)),
    "mp5_stock_endcap":        ((-0.750, -1.474, -1.065), ( 0.770,  1.310,  0.960)),
    "mp5_buttstock":           ((-1.120, -3.116, -0.890), (11.600,  1.240,  0.890)),
    "mp5_grip_housing":        ((-4.275, -5.708, -0.720), ( 3.964,  0.640,  0.720)),
    "mp5_trigger_pack":        ((-1.925, -0.660, -0.530), ( 3.468,  1.157,  0.530)),
    "mp5_hammer":              ((-1.097, -0.300, -0.340), ( 0.236,  0.500,  0.340)),
    "mp5_trigger":             ((-0.240, -1.313, -0.270), ( 0.880,  0.390,  0.270)),
    "mp5_selector":            ((-0.350, -0.280, -0.975), ( 1.117,  0.290,  0.975)),
    "mp5_mag_body":            ((-1.050, -8.297, -0.510), ( 3.113,  1.378,  0.510)),
    "mp5_mag_follower":        ((-0.740, -0.540, -0.340), ( 0.740,  0.333,  0.340)),
    "mp5_mag_spring":          (( 1.028, -7.843, -0.265), ( 2.662, -6.186,  0.265)),
    "mp5_mag_floorplate":      ((-0.885, -0.646, -0.520), ( 0.931,  0.596,  0.520)),
}

# Curved 30-Round MP5 Magazine Arc Constants (locked with tests/magazineAmmoStack.test.ts)
MAG_CX = 16.0
MAG_CY = 0.45
MAG_R_IN = 15.08
MAG_R_OUT = 16.92
MAG_ANG_START = -0.05
MAG_ANG_END = 0.54


# =============================================================================
# Scene & Physically Calibrated Oberndorf H&K Material Library (Cycles GPU)
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
    n_macro.inputs["Scale"].default_value = 2.30
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
        # Tight localized per-pixel raytraced geometric convexity (AO inside=True, Distance=0.044)
        # -> razor-sharp bevel edge highlights with ZERO blown-out bright streaks on thin stamped walls!
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.044

        inv_ao = nt.nodes.new("ShaderNodeMath")
        inv_ao.operation = "SUBTRACT"
        inv_ao.inputs[0].default_value = 1.0
        nt.links.new(ao_edge.outputs["AO"], inv_ao.inputs[1])

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
        mix_edge_r.inputs[3].default_value = max(0.14, roughness - 0.12)
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


def _build_mp5_brass_deflector_mat() -> bpy.types.Material:
    """HK Stamped Rear Ejection-Port Deflector Flare: Satin black baked enamel + subtle golden 9mm brass kisses."""
    mat = _build_pbr_mat(
        "R_HkBrassDeflector",
        base_srgb=(0.188, 0.198, 0.214),
        roughness=0.25,
        metallic=0.86,
        bevel_r=0.030,
        edge_wear=0.28,
        edge_srgb=(0.72, 0.75, 0.80),
        grain_scale=46.0,
        grain_bump=0.022,
        rough_var=0.024,
    )
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = next(n for n in nt.nodes if n.type == "TEX_COORD")

    n_kiss = nt.nodes.new("ShaderNodeTexNoise")
    n_kiss.inputs["Scale"].default_value = 11.0
    n_kiss.inputs["Detail"].default_value = 6.0
    n_kiss.inputs["Roughness"].default_value = 0.72
    nt.links.new(texcoord.outputs["Object"], n_kiss.inputs["Vector"])

    ramp_k = nt.nodes.new("ShaderNodeValToRGB")
    ramp_k.color_ramp.elements[0].position = 0.54
    ramp_k.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_k.color_ramp.elements[1].position = 0.78
    ramp_k.color_ramp.elements[1].color = (0.46, 0.46, 0.46, 1.0)
    nt.links.new(n_kiss.outputs["Fac"], ramp_k.inputs["Fac"])

    orig_col = bsdf.inputs["Base Color"].links[0].from_socket
    orig_rgh = bsdf.inputs["Roughness"].links[0].from_socket
    orig_met = bsdf.inputs["Metallic"].links[0].from_socket

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[7].default_value = srgb_to_lin(0.76, 0.59, 0.24)
    nt.links.new(ramp_k.outputs["Color"], mix_c.inputs[0])
    nt.links.new(orig_col, mix_c.inputs[6])
    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])

    mix_r = nt.nodes.new("ShaderNodeMix")
    mix_r.data_type = "FLOAT"
    mix_r.inputs[3].default_value = 0.22
    nt.links.new(ramp_k.outputs["Color"], mix_r.inputs[0])
    nt.links.new(orig_rgh, mix_r.inputs[2])
    nt.links.new(mix_r.outputs[0], bsdf.inputs["Roughness"])

    mix_m = nt.nodes.new("ShaderNodeMix")
    mix_m.data_type = "FLOAT"
    mix_m.inputs[3].default_value = 0.94
    nt.links.new(ramp_k.outputs["Color"], mix_m.inputs[0])
    nt.links.new(orig_met, mix_m.inputs[2])
    nt.links.new(mix_m.outputs[0], bsdf.inputs["Metallic"])
    return mat


def _build_mp5_muzzle_soot_mat() -> bpy.types.Material:
    """HK Navy 3-Lug QD Hub & Knurled 1/2x28 Thread Protector: black-oxide steel -> subtle bronze/blue
    firing heat tint -> realistic matte black 9mm carbon soot near the 11-deg recessed target crown."""
    mat = bpy.data.materials.new("M_NavyMuzzleSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Local barrel X spans [17.20 .. 19.52] on 3-lug + knurled thread protector
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 17.20
    mr_x.inputs["From Max"].default_value = 19.52
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 5.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.64
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.18
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.210, 0.222, 0.238)
    cr.elements[1].position = 0.45
    cr.elements[1].color = srgb_to_lin(0.245, 0.258, 0.275)
    for pos, rgb in (
        (0.68, (0.30, 0.23, 0.16)),    # subtle bronze suppressor-blast tint
        (0.84, (0.16, 0.19, 0.26)),    # pale steel-blue temper near muzzle
        (0.95, (0.072, 0.072, 0.076)), # gunpowder carbon crown soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.58
    rr.elements[0].color = (0.24, 0.24, 0.24, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.82, 0.82, 0.82, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.80
    rm.elements[0].color = (0.90, 0.90, 0.90, 1.0)
    rm.elements[1].position = 0.97
    rm.elements[1].color = (0.18, 0.18, 0.18, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.022
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.036
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Receiver Atlas Materials (mp5_v3_receiver) ---
        # Iconic Heckler & Koch Satin-Gloss Baked Black Enamel over Manganese Phosphate Stamped Steel
        "R_HkSatinEnamel": _build_pbr_mat(
            "R_HkSatinEnamel",
            base_srgb=(0.188, 0.198, 0.214),
            roughness=0.24,
            metallic=0.86,
            bevel_r=0.032,
            edge_wear=0.26,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=52.0,
            grain_bump=0.022,
            voronoi_grain=0.38,
            voronoi_scale=78.0,
            rough_var=0.022,
        ),
        "R_HkEnamelHighlight": _build_pbr_mat(
            "R_HkEnamelHighlight",
            base_srgb=(0.202, 0.212, 0.228),
            roughness=0.22,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.30,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=44.0,
            grain_bump=0.020,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.022,
        ),
        "R_HkWeldSeam": _build_pbr_mat(
            "R_HkWeldSeam",
            base_srgb=(0.224, 0.230, 0.240),
            roughness=0.30,
            metallic=0.90,
            bevel_r=0.018,
            edge_wear=0.24,
            edge_srgb=(0.72, 0.74, 0.78),
            grain_scale=58.0,
            grain_bump=0.038,
            rough_var=0.028,
        ),
        "R_HkBrassDeflector": _build_mp5_brass_deflector_mat(),
        "R_HkInnerDark": _build_pbr_mat(
            "R_HkInnerDark",
            base_srgb=(0.094, 0.100, 0.110),
            roughness=0.46,
            metallic=0.78,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.022,
            rough_var=0.024,
        ),
        "R_BrightSteel": _build_pbr_mat(
            "R_BrightSteel",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "R_AmberHBuffer": _build_pbr_mat(
            "R_AmberHBuffer",
            base_srgb=(0.76, 0.44, 0.11),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.10,
            edge_srgb=(0.88, 0.62, 0.26),
            grain_scale=38.0,
            grain_bump=0.026,
            rough_var=0.030,
        ),

        # --- Metal / Internals / Barrel / A3 Stock / Curved Mag Atlas Materials (mp5_v3_metal) ---
        "M_HkBarrelBlue": _build_pbr_mat(
            "M_HkBarrelBlue",
            base_srgb=(0.180, 0.190, 0.205),
            roughness=0.24,
            metallic=0.90,
            bevel_r=0.026,
            edge_wear=0.24,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=40.0,
            grain_bump=0.026,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.024,
        ),
        "M_NavyMuzzleSoot": _build_mp5_muzzle_soot_mat(),
        "M_MirrorChromeRoller": _build_pbr_mat(
            "M_MirrorChromeRoller",
            base_srgb=(0.90, 0.92, 0.95),
            roughness=0.09,
            metallic=0.98,
            bevel_r=0.012,
            edge_wear=0.14,
            edge_srgb=(0.97, 0.98, 0.99),
            grain_scale=24.0,
            grain_bump=0.008,
            aniso_stretch=(0.4, 3.5, 3.5),
            rough_var=0.014,
        ),
        "M_MachinedBrightSteel": _build_pbr_mat(
            "M_MachinedBrightSteel",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.18,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.4, 3.4, 3.4),
            rough_var=0.022,
        ),
        "M_StainlessTriggerBox": _build_pbr_mat(
            "M_StainlessTriggerBox",
            base_srgb=(0.70, 0.73, 0.77),
            roughness=0.24,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.20,
            edge_srgb=(0.88, 0.90, 0.93),
            grain_scale=32.0,
            grain_bump=0.022,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.024,
        ),
        "M_OiledBoltCarrier": _build_pbr_mat(
            "M_OiledBoltCarrier",
            base_srgb=(0.200, 0.210, 0.225),
            roughness=0.21,
            metallic=0.92,
            bevel_r=0.026,
            edge_wear=0.32,
            edge_srgb=(0.78, 0.81, 0.85),
            grain_scale=30.0,
            grain_bump=0.022,
            aniso_stretch=(0.35, 3.4, 3.4),
            rough_var=0.026,
        ),
        "M_BluedSteelMag": _build_pbr_mat(
            "M_BluedSteelMag",
            base_srgb=(0.186, 0.198, 0.216),
            roughness=0.21,
            metallic=0.89,
            bevel_r=0.026,
            edge_wear=0.24,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=48.0,
            grain_bump=0.022,
            voronoi_grain=0.36,
            voronoi_scale=76.0,
            rough_var=0.024,
        ),
        "M_CopperExtractorSpring": _build_pbr_mat(
            "M_CopperExtractorSpring",
            base_srgb=(0.82, 0.48, 0.22),
            roughness=0.23,
            metallic=0.95,
            bevel_r=0.014,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.66, 0.38),
            grain_scale=30.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.012,
            grain_scale=26.0,
            grain_bump=0.016,
            rough_var=0.020,
        ),
        "M_DarkInternal": _build_pbr_mat(
            "M_DarkInternal",
            base_srgb=(0.094, 0.100, 0.110),
            roughness=0.46,
            metallic=0.78,
            bevel_r=0.016,
            grain_scale=34.0,
            grain_bump=0.022,
            rough_var=0.024,
        ),
        "M_ButtpadRubber": _build_pbr_mat(
            "M_ButtpadRubber",
            base_srgb=(0.098, 0.103, 0.111),
            roughness=0.88,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.08,
            edge_srgb=(0.16, 0.17, 0.18),
            grain_scale=64.0,
            grain_bump=0.105,
            voronoi_grain=0.66,
            voronoi_scale=90.0,
            rough_var=0.032,
        ),
        "M_SlapKnobPolymer": _build_pbr_mat(
            "M_SlapKnobPolymer",
            base_srgb=(0.124, 0.130, 0.140),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.12,
            edge_srgb=(0.22, 0.23, 0.25),
            grain_scale=66.0,
            grain_bump=0.105,
            voronoi_grain=0.70,
            voronoi_scale=94.0,
            rough_var=0.034,
        ),

        # --- Furniture / Polymer Navy Lower / Tropical Forearm / Follower Atlas (mp5_v3_furniture) ---
        "F_HkPolyamide": _build_pbr_mat(
            "F_HkPolyamide",
            base_srgb=(0.128, 0.134, 0.144),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.14,
            edge_srgb=(0.22, 0.23, 0.25),
            grain_scale=64.0,
            grain_bump=0.110,
            voronoi_grain=0.72,
            voronoi_scale=92.0,
            rough_var=0.036,
        ),
        "F_HkPolyamideDark": _build_pbr_mat(
            "F_HkPolyamideDark",
            base_srgb=(0.104, 0.110, 0.118),
            roughness=0.78,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.10,
            edge_srgb=(0.18, 0.19, 0.20),
            grain_scale=68.0,
            grain_bump=0.115,
            voronoi_grain=0.74,
            voronoi_scale=96.0,
            rough_var=0.034,
        ),
        "F_SelectorWhiteInlay": _build_pbr_mat(
            "F_SelectorWhiteInlay",
            base_srgb=(0.93, 0.94, 0.96),
            roughness=0.26,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),
        "F_SelectorSteelAxle": _build_pbr_mat(
            "F_SelectorSteelAxle",
            base_srgb=(0.196, 0.206, 0.220),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.26,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.026,
        ),
        "F_HeatshieldAlu": _build_pbr_mat(
            "F_HeatshieldAlu",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.21,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.022,
        ),
        "F_PushPinSteel": _build_pbr_mat(
            "F_PushPinSteel",
            base_srgb=(0.186, 0.196, 0.210),
            roughness=0.26,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.72, 0.75, 0.79),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.026,
        ),
        "F_DetentChrome": _build_pbr_mat(
            "F_DetentChrome",
            base_srgb=(0.86, 0.88, 0.92),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.012,
            grain_scale=24.0,
            grain_bump=0.012,
            rough_var=0.018,
        ),
        "F_FollowerOrange": _build_pbr_mat(
            "F_FollowerOrange",
            base_srgb=(0.88, 0.36, 0.09),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.12,
            edge_srgb=(0.96, 0.56, 0.28),
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.032,
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


def _rounded_rect_pts(hw: float, hh: float, r: float, corner_segs: int = 5) -> list[tuple[float, float]]:
    r = min(r, hw * 0.95, hh * 0.95)
    pts = []
    corners = [
        ( hw - r,  hh - r, 0.0,           math.pi * 0.5),
        (-hw + r,  hh - r, math.pi * 0.5, math.pi),
        (-hw + r, -hh + r, math.pi,       math.pi * 1.5),
        ( hw - r, -hh + r, math.pi * 1.5, math.pi * 2.0),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(corner_segs + 1):
            a = a0 + (a1 - a0) * (i / corner_segs)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
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


def mk_lathe_y(
    name: str, pts_r_y: list[tuple[float, float]], segs: int = 36,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Revolves an (r, y) profile around the Three.js +Y axis."""
    bm = bmesh.new()
    closed_loop = (
        len(pts_r_y) >= 3
        and pts_r_y[0][0] > 1e-5
        and math.hypot(pts_r_y[0][0] - pts_r_y[-1][0], pts_r_y[0][1] - pts_r_y[-1][1]) < 1e-4
    )
    pts = pts_r_y[:-1] if closed_loop else list(pts_r_y)
    rings = []
    for r, y in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((r * math.cos(th), y, r * math.sin(th))))
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


def mk_loft_rings(
    name: str,
    rings_three: list[list[tuple[float, float, float]]],
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Watertight multi-station organic loft in Three.js coordinates."""
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
    scale_z: float = 1.0,
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
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * radius
            pt = Vector((p.x + off.x, p.y + off.y, p.z + off.z * scale_z))
            ring.append(bm.verts.new(pt))
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
    name: str, radius: float, length: float, axis: str = "x",
    flutes: int = 24, depth: float = 0.018,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.016, length * 0.14, radius * 0.14)
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


def mk_tig_weld_seam(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    radius: float,
    ripples: int,
    mat: bpy.types.Material,
) -> list[bpy.types.Object]:
    """Row of smooth overlapping squashed-ellipsoid TIG weld ripples ('stack of dimes')."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    d = v1 - v0
    length = d.length or 1.0
    ang_z = math.atan2(d.y, d.x)
    ang_y = -math.asin(max(-1.0, min(1.0, d.z / length)))
    out = []
    n = max(2, ripples)
    for i in range(n):
        t = i / (n - 1)
        pos = v0.lerp(v1, t)
        out.append(
            mk_sphere(
                f"{name}_b{i}", radius * 0.68, radius, radius,
                u_segs=10, v_segs=6,
                xform=[("ry", ang_y), ("rz", ang_z), ("t", pos.x, pos.y, pos.z)],
                mat=mat,
            )
        )
    return out


def mk_arc_lug(
    name: str, r_in: float, r_out: float, ang_center: float, ang_width: float,
    x0: float, length: float, mat: bpy.types.Material, bevel: float = 0.028, steps: int = 8,
) -> bpy.types.Object:
    """Chamfered annular sector lug around +X bore axis (e.g. HK Navy 3-Lug QD mount)."""
    a0 = ang_center - ang_width * 0.5
    pts_zy = []
    for i in range(steps + 1):
        a = a0 + ang_width * (i / steps)
        pts_zy.append((math.sin(a) * r_out, math.cos(a) * r_out))
    for i in range(steps, -1, -1):
        a = a0 + ang_width * (i / steps)
        pts_zy.append((math.sin(a) * r_in, math.cos(a) * r_in))
    return mk_extrude_x(name, pts_zy, x0, x0 + length, bevel=bevel, bevel_segs=2, mat=mat)


def mk_helical_rifling_lands(
    name: str, count: int, bore_r: float, depth: float, width: float,
    x0: float, x1: float, twist_cm: float, mat: bpy.types.Material, segs: int = 16,
) -> list[bpy.types.Object]:
    """Watertight right-hand helical rifling lands along bore wall (+X axis)."""
    embed = min(0.012, depth * 0.5)
    r_in = bore_r - depth
    r_out = bore_r + embed
    hw = width * 0.5
    objs = []
    for k in range(count):
        base_a = 2.0 * math.pi * k / count
        rings = []
        for s in range(segs + 1):
            u = s / segs
            xx = x0 + (x1 - x0) * u
            a = base_a + ((xx - x0) / twist_cm) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            # 4 corners of rectangular land in (y, z) rotated by a around +X
            corners_local = [
                (r_in, -hw),
                (r_out, -hw),
                (r_out,  hw),
                (r_in,  hw),
            ]
            ring = []
            for ly, lz in corners_local:
                wy = ly * ca - lz * sa
                wz = ly * sa + lz * ca
                ring.append((xx, wy, wz))
            rings.append(ring)
        objs.append(mk_loft_rings(f"{name}_{k}", rings, mat=mat, cap_ends=True))
    return objs


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
        if lock_flat_walls and (abs(f.normal.y) > 0.975 or abs(f.normal.z) > 0.975):
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
# PART BUILDERS — ATLAS 1: RECEIVER & SIGHTS SUITE (5 parts)
# =============================================================================
def build_mp5_upper_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-01: Iconic HK MP5 Figure-8 Stamped Sheet-Steel Upper Receiver, Integral Fluted Magwell,
    4 STANAG Claw Mounts, Rolled Ejection Port w/ Brass Deflector, Paddle Release & TIG Welds.
    assembledPos: [0, 0, 0] | spans X in [-5.48, +5.48], Y in [-2.21, +2.71], Z in [-0.83, +0.87]."""
    m_enamel = mats["R_HkSatinEnamel"]
    m_hi = mats["R_HkEnamelHighlight"]
    m_weld = mats["R_HkWeldSeam"]
    m_brass = mats["R_HkBrassDeflector"]
    m_dark = mats["R_HkInnerDark"]
    m_bright = mats["R_BrightSteel"]

    # 1. Smooth high-res stamped figure-8 twin-cylinder cross-section in (Z, Y) extruded along X [-5.45, +5.45]
    fig8_zy = [(-0.75, 0.14), (-0.78, 0.98)]
    fig8_zy += _quad_bez((-0.78, 0.98), (-0.78, 1.56), (-0.56, 1.82), segs=10)
    fig8_zy.append((-0.54, 2.18))
    fig8_zy += _quad_bez((-0.54, 2.18), (-0.50, 2.60), (0.0, 2.63), segs=10)
    fig8_zy += _quad_bez((0.0, 2.63), (0.50, 2.60), (0.54, 2.18), segs=10)
    fig8_zy.append((0.56, 1.82))
    fig8_zy += _quad_bez((0.56, 1.82), (0.78, 1.56), (0.78, 0.98), segs=10)
    fig8_zy.append((0.75, 0.14))

    recv_raw = mk_extrude_x("mp5_recv_hull", fig8_zy, -5.45, 5.45, bevel=0.03, bevel_segs=2, mat=m_enamel)

    # Smooth rounded-corner stamped Magwell (X in [1.45, 4.10], Y in [-1.76, +0.48], Z in [-0.71, +0.71])
    mw_plan = _rounded_rect_pts(1.325, 0.71, 0.14, corner_segs=5)
    mw_outer = mk_extrude_y(
        "mp5_mw_outer", mw_plan, -1.76, 0.48, bevel=0.025, bevel_segs=2,
        xform=[("t", 2.775, 0.0, 0.0)], mat=m_enamel,
    )
    # Flared stamped loading funnel lip at bottom of magwell
    mw_lip_plan = _rounded_rect_pts(1.40, 0.76, 0.16, corner_segs=5)
    mw_lip = mk_extrude_y(
        "mp5_mw_lip", mw_lip_plan, -1.79, -1.61, bevel=0.030, bevel_segs=2,
        xform=[("t", 2.775, 0.0, 0.0)], mat=m_enamel,
    )
    hull = bool_union([recv_raw, mw_outer, mw_lip], "mp5_recv_union")

    # Cutters: bolt & recoil tunnels, connecting spine slot, lower FCG slot, right ejection port,
    # magwell interior cavity, twin longitudinal A3 stock guide channels, and 6 vertical magwell flutes!
    cutters = [
        mk_cyl("c_bolt_tun", 0.62, 0.62, 11.4, axis="x", segs=32, xform=[("t", 0.0, 1.00, 0.0)], mat=m_dark),
        mk_cyl("c_rec_tun",  0.41, 0.41, 11.4, axis="x", segs=26, xform=[("t", 0.0, 2.08, 0.0)], mat=m_dark),
        mk_box("c_web_slot", 10.60, 1.15, 0.76, [("t", -0.10, 1.54, 0.0)], mat=m_dark),
        mk_box("c_fcg_slot",  6.80, 0.72, 1.16, [("t", -1.95, 0.25, 0.0)], mat=m_dark),
        # Right ejection port (rounded-corner cutout on +Z flank, X in [1.44, 3.86], Y in [0.62, 1.50])
        mk_extrude_z(
            "c_eject_port", _rounded_rect_pts(1.21, 0.44, 0.10, corner_segs=4),
            0.14, 1.08, xform=[("t", 2.65, 1.06, 0.0)], mat=m_dark,
        ),
        mk_box("c_mw_cav", 2.14, 2.68, 1.08, [("t", 2.775, -0.62, 0.0)], mat=m_dark),
        # Twin stamped longitudinal MP5A3 stock-rail guide channels (X in [-5.52, +1.70], Y in [0.85, 1.15])
        mk_box("c_stock_ch_l", 7.22, 0.30, 0.20, [("t", -1.91, 1.00, -0.81)], mat=m_enamel, bevel=0.025, bevel_segs=1),
        mk_box("c_stock_ch_r", 7.22, 0.30, 0.20, [("t", -1.91, 1.00,  0.81)], mat=m_enamel, bevel=0.025, bevel_segs=1),
    ]
    # 6 pill-shaped vertical stamped magwell stiffening flutes (3 per flank)
    flute_xy = _rounded_rect_pts(0.11, 0.69, 0.09, corner_segs=4)
    for fx in (2.17, 2.75, 3.33):
        for side in (-1.0, 1.0):
            cutters.append(
                mk_extrude_z(
                    f"c_flute_{fx:.2f}_{side:+.0f}", flute_xy, -0.08, 0.08,
                    xform=[("t", fx, -0.82, side * 0.72)], mat=m_enamel,
                )
            )
    shell = bool_subtract(hull, cutters)

    parts = [shell]

    # Stamped waist stiffening ribs, folded FCG flanges, magwell collar ribs, TIG welds & plug-weld rosettes
    for side in (-1.0, 1.0):
        parts.extend([
            mk_box(f"waist_rib_{side:+.0f}", 10.50, 0.075, 0.078, [("t", 0.0, 1.82, side * 0.585)], m_hi, bevel=0.015),
            mk_box(f"fcg_lip_{side:+.0f}", 6.10, 0.070, 0.060, [("t", -1.95, 0.17, side * 0.74)], m_hi, bevel=0.012),
            mk_box(f"mw_collar_{side:+.0f}", 2.58, 0.080, 0.060, [("t", 2.775, -0.08, side * 0.725)], m_hi, bevel=0.014),
            # Subtle upper & lower stiffening beads framing the A3 sliding-stock channel
            mk_box(f"ch_lip_u_{side:+.0f}", 7.12, 0.042, 0.044, [("t", -1.88, 1.168, side * 0.768)], m_hi, bevel=0.010),
            mk_box(f"ch_lip_d_{side:+.0f}", 7.12, 0.042, 0.044, [("t", -1.88, 0.832, side * 0.768)], m_hi, bevel=0.010),
        ])
        parts.extend(mk_tig_weld_seam(
            f"mw_weld_{side:+.0f}", (1.52, 0.15, side * 0.72), (4.02, 0.15, side * 0.72), 0.028, 14, m_weld
        ))
        # Pressed-trunnion plug-weld rosettes
        for wx in (3.48, 4.42):
            parts.append(
                mk_torus(f"rosette_{wx:.2f}_{side:+.0f}", 0.082, 0.020, axis="z", major_segs=18, minor_segs=8,
                         xform=[("t", wx, 1.38, side * 0.722)], mat=m_weld)
            )
            parts.append(
                mk_cyl(f"ros_core_{wx:.2f}_{side:+.0f}", 0.058, 0.058, 0.032, axis="z", segs=14,
                       xform=[("t", wx, 1.38, side * 0.715)], mat=m_dark)
            )

    # Rear magwell vertical weld seam + front cocking-tube circumferential TIG weld collar
    parts.extend(mk_tig_weld_seam("mw_rear_weld", (1.44, -1.58, 0.0), (1.44, 0.08, 0.0), 0.030, 11, m_weld))
    parts.append(mk_torus("front_tube_weld", 0.458, 0.032, axis="x", major_segs=28, minor_segs=10,
                          xform=[("t", 5.41, 2.08, 0.0)], mat=m_weld))

    # Iconic HK 4-Point STANAG Optic Claw-Mount Locking Bosses (with true undercut dovetail clamping shelves!)
    claw_zy = [
        (-0.37, 2.38), (-0.37, 2.48), (-0.49, 2.52), (-0.47, 2.61),
        ( 0.47, 2.61), ( 0.49, 2.52), ( 0.37, 2.48), ( 0.37, 2.38),
    ]
    for idx_c, cx in enumerate((-2.85, -1.85, -0.15, 0.85)):
        parts.append(mk_extrude_x(f"claw_boss_{idx_c}", claw_zy, cx - 0.24, cx + 0.24, bevel=0.018, bevel_segs=2, mat=m_hi))
        parts.extend(mk_tig_weld_seam(f"cw_l_{idx_c}", (cx - 0.20, 2.40, -0.39), (cx + 0.20, 2.40, -0.39), 0.020, 5, m_weld))
        parts.extend(mk_tig_weld_seam(f"cw_r_{idx_c}", (cx - 0.20, 2.40,  0.39), (cx + 0.20, 2.40,  0.39), 0.020, 5, m_weld))
    # Welded top optic recoil-stop cross-block on receiver spine
    parts.append(mk_box("optic_recoil_stop", 0.24, 0.10, 0.44, [("t", -1.00, 2.66, 0.0)], m_hi, bevel=0.015))

    # Rolled Right Ejection-Port Lip & Angled Rear Brass-Deflector Flare
    parts.extend([
        mk_box("eport_lip_u", 2.54, 0.08, 0.10, [("t", 2.65, 1.51, 0.76)], m_hi, bevel=0.018),
        mk_box("eport_lip_d", 2.54, 0.08, 0.10, [("t", 2.65, 0.61, 0.76)], m_hi, bevel=0.018),
        mk_box("brass_deflector", 0.18, 0.94, 0.14, [("ry", -0.28), ("t", 1.42, 1.06, 0.78)], m_brass, bevel=0.022),
    ])
    parts.extend(mk_tig_weld_seam("eport_weld", (1.36, 0.65, 0.75), (1.36, 1.47, 0.75), 0.022, 7, m_weld))

    # HK Ambidextrous Paddle Magazine Release + Hinge Clevis + Concentric-Serrated Right Push-Button
    parts.extend([
        mk_box("paddle_bracket", 0.38, 0.34, 0.76, [("t", 1.36, -1.48, 0.0)], m_enamel, bevel=0.025),
        mk_box("paddle_lever", 0.22, 0.64, 0.56, [("rz", 0.24), ("t", 1.38, -1.89, 0.0)], m_hi, bevel=0.032),
        mk_cyl("paddle_pin", 0.065, 0.065, 0.84, axis="z", segs=16, xform=[("t", 1.36, -1.52, 0.0)], mat=m_bright, bevel=0.010),
        mk_cyl("mag_btn_base", 0.16, 0.16, 0.24, axis="z", segs=24, xform=[("t", 1.58, -1.30, 0.72)], mat=m_bright, bevel=0.015),
        mk_torus("mag_btn_ring1", 0.115, 0.014, axis="z", major_segs=20, minor_segs=8, xform=[("t", 1.58, -1.30, 0.842)], mat=m_dark),
        mk_torus("mag_btn_ring2", 0.062, 0.012, axis="z", major_segs=16, minor_segs=8, xform=[("t", 1.58, -1.30, 0.842)], mat=m_dark),
    ])

    # Front lower grip-housing shelf lug, front forearm tab, rear takedown pin ears & steel bushings
    parts.extend([
        mk_box("front_grip_shelf", 0.46, 0.38, 0.92, [("t", 1.38, -0.10, 0.0)], m_enamel, bevel=0.025),
        mk_box("front_forearm_tab", 0.55, 0.42, 0.88, [("t", 5.18, 0.18, 0.0)], m_enamel, bevel=0.025),
        mk_cyl("front_pin_bush", 0.135, 0.135, 0.92, axis="z", segs=18, xform=[("t", 5.18, 0.18, 0.0)], mat=m_hi, bevel=0.012),
        mk_cyl("front_pin_core", 0.095, 0.095, 0.95, axis="z", segs=16, xform=[("t", 5.18, 0.18, 0.0)], mat=m_dark),
        mk_box("rear_pin_tab", 0.58, 0.48, 0.96, [("t", -5.18, 0.08, 0.0)], m_enamel, bevel=0.025),
        mk_cyl("rear_pin_bush", 0.145, 0.145, 1.00, axis="z", segs=18, xform=[("t", -5.18, 0.08, 0.0)], mat=m_hi, bevel=0.012),
        mk_cyl("rear_pin_core", 0.100, 0.100, 1.03, axis="z", segs=16, xform=[("t", -5.18, 0.08, 0.0)], mat=m_dark),
    ])

    obj = join_objects(parts, "mp5_upper_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0, lock_flat_walls=True)


def build_mp5_cocking_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-02: Forward Welded Cocking Tube w/ Crisp Left-Side HK-Slap J-Slot & Serrated Bayonet Endcap.
    assembledPos: [10.35, 2.08, 0] | spans X in [-4.98, +5.48]."""
    m_enamel = mats["R_HkSatinEnamel"]
    m_hi = mats["R_HkEnamelHighlight"]
    m_weld = mats["R_HkWeldSeam"]
    m_dark = mats["R_HkInnerDark"]
    m_bright = mats["R_BrightSteel"]

    outer_tube = mk_cyl("ct_outer", 0.50, 0.50, 9.95, axis="x", segs=36, xform=[("t", 0.025, 0.0, 0.0)], mat=m_enamel, bevel=0.016)
    rear_collar = mk_cyl("ct_collar", 0.55, 0.55, 0.65, axis="x", segs=36, xform=[("t", -4.65, 0.0, 0.0)], mat=m_hi, bevel=0.024)
    solid = bool_union([outer_tube, rear_collar], "ct_solid")

    # Hollow inner bore + Iconic Left-Side HK J-Slot (longitudinal charging track + angled upward HK-Slap hook!)
    c_bore = mk_cyl("c_ct_bore", 0.38, 0.38, 10.6, axis="x", segs=28, mat=m_dark)
    c_long = mk_extrude_z(
        "c_ct_long", _rounded_rect_pts(2.225, 0.125, 0.09, corner_segs=4),
        -0.72, -0.06, xform=[("t", 0.85, -0.01, 0.0)], mat=m_dark,
    )
    c_riser = mk_extrude_z(
        "c_ct_riser", _rounded_rect_pts(0.21, 0.22, 0.09, corner_segs=4),
        -0.72, -0.06, xform=[("t", -1.18, 0.18, 0.0)], mat=m_dark,
    )
    c_hook = mk_extrude_z(
        "c_ct_hook", _rounded_rect_pts(0.29, 0.12, 0.08, corner_segs=4),
        -0.72, -0.06, xform=[("t", -0.98, 0.31, 0.0)], mat=m_dark,
    )
    tube_carved = bool_subtract(solid, [c_bore, c_long, c_riser, c_hook])

    # Serrated front bayonet endcap plug with recessed screwdriver cross-slot & detent notches
    plug_raw = mk_cyl("ct_plug", 0.46, 0.48, 0.65, axis="x", segs=32, xform=[("t", 5.15, 0.0, 0.0)], mat=m_bright, bevel=0.024)
    c_slot = mk_box("c_plug_slot", 0.16, 1.02, 0.12, [("t", 5.44, 0.0, 0.0)], mat=m_dark)
    plug = bool_subtract(plug_raw, [c_slot])

    weld_ring = mk_torus("ct_rear_weld", 0.525, 0.022, axis="x", major_segs=30, minor_segs=8,
                         xform=[("t", -4.32, 0.0, 0.0)], mat=m_weld)
    obj = join_objects([tube_carved, plug, weld_ring], "mp5_cocking_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_front_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-04: Iconic HK MP5 'Triple Frame' Hooded Circular Ring Front Sight Tower w/ Sling Loop.
    assembledPos: [15.40, 1.00, 0] | spans X in [-0.76, +0.64], Y in [-0.89, +2.53]."""
    m_enamel = mats["R_HkSatinEnamel"]
    m_hi = mats["R_HkEnamelHighlight"]
    m_dark = mats["R_HkInnerDark"]
    m_bright = mats["R_BrightSteel"]

    barrel_ring = mk_cyl("fs_bring", 0.58, 0.58, 1.28, axis="x", segs=32, mat=m_enamel, bevel=0.022)
    web_xy = [(-0.62, 0.0), (0.62, 0.0), (0.42, 1.88), (-0.46, 1.88)]
    web = mk_extrude_z("fs_web", web_xy, -0.28, 0.28, bevel=0.022, bevel_segs=2, mat=m_enamel)
    cock_collar = mk_cyl("fs_ccol", 0.62, 0.62, 1.18, axis="x", segs=32, xform=[("t", -0.02, 1.08, 0.0)], mat=m_enamel, bevel=0.022)
    hood_outer = mk_cyl("fs_hood", 0.55, 0.55, 0.90, axis="x", segs=38, xform=[("t", -0.02, 1.98, 0.0)], mat=m_hi, bevel=0.028)
    forearm_lug = mk_box("fs_flug", 0.88, 0.54, 0.58, [("t", -0.32, -0.62, 0.0)], mat=m_enamel, bevel=0.028)

    solid = bool_union([barrel_ring, web, cock_collar, hood_outer, forearm_lug], "fs_solid")

    cutters = [
        mk_cyl("c_fs_bar",  0.455, 0.455, 1.65, axis="x", segs=28, mat=m_dark),
        mk_cyl("c_fs_cock", 0.505, 0.505, 1.55, axis="x", segs=28, xform=[("t", 0.0, 1.08, 0.0)], mat=m_dark),
        mk_cyl("c_fs_hood", 0.430, 0.430, 1.25, axis="x", segs=34, xform=[("t", -0.02, 1.98, 0.0)], mat=m_dark),
        # Side web lightening pockets (rounded pill reliefs)
        mk_extrude_z("c_fs_pkl", _rounded_rect_pts(0.28, 0.22, 0.08, corner_segs=4), -0.36, -0.22, xform=[("t", 0.0, 0.54, 0.0)], mat=m_dark),
        mk_extrude_z("c_fs_pkr", _rounded_rect_pts(0.28, 0.22, 0.08, corner_segs=4),  0.22,  0.36, xform=[("t", 0.0, 0.54, 0.0)], mat=m_dark),
    ]
    tower = bool_subtract(solid, cutters)

    # Tapered front sight blade post + sight pedestal + welded left sling bracket & loop + cross pins
    post_xy = [(-0.075, 1.54), (0.075, 1.54), (0.048, 2.00), (-0.048, 2.00)]
    sight_post = mk_extrude_z("fs_post", post_xy, -0.042, 0.042, bevel=0.008, bevel_segs=1, xform=[("t", -0.02, 0.0, 0.0)], mat=m_bright)
    post_base = mk_cyl("fs_pbase", 0.13, 0.16, 0.12, axis="y", segs=18, xform=[("t", -0.02, 1.53, 0.0)], mat=m_hi)
    sling_brk = mk_box("fs_sbrk", 0.32, 0.22, 0.26, [("t", 0.12, 0.54, -0.38)], mat=m_enamel, bevel=0.022)
    sling_eye = mk_torus("fs_seye", 0.22, 0.050, axis="x", major_segs=26, minor_segs=12, xform=[("t", 0.12, 0.54, -0.56)], mat=m_bright)
    bar_pin = mk_cyl("fs_bpin", 0.075, 0.075, 1.08, axis="z", segs=16, xform=[("t", 0.22, -0.44, 0.0)], mat=m_bright, bevel=0.010)
    fa_bush = mk_cyl("fs_fbush", 0.095, 0.095, 0.64, axis="z", segs=16, xform=[("t", -0.32, -0.66, 0.0)], mat=m_bright, bevel=0.010)

    obj = join_objects([tower, sight_post, post_base, sling_brk, sling_eye, bar_pin, fa_bush], "mp5_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-05: Iconic HK Tilted Rotary 4-Aperture Diopter Drum Rear Sight w/ Protective Ears & Knurled Turret.
    assembledPos: [-4.25, 2.62, 0] | spans X in [-0.73, +0.73], Y in [-0.11, +0.85], Z in [-0.56, +0.56]."""
    m_enamel = mats["R_HkSatinEnamel"]
    m_hi = mats["R_HkEnamelHighlight"]
    m_dark = mats["R_HkInnerDark"]
    m_bright = mats["R_BrightSteel"]

    # Welded sight base pedestal + tapered protective left/right side ears + windage clamp
    base_blk = mk_box("rs_base", 1.46, 0.28, 1.04, [("t", 0.0, 0.03, 0.0)], m_enamel, bevel=0.026)
    ear_xy = [(-0.48, 0.10), (0.44, 0.10), (0.34, 0.36), (-0.38, 0.36)]
    ear_l = mk_extrude_z("rs_ear_l", ear_xy, -0.51, -0.39, bevel=0.018, bevel_segs=2, mat=m_enamel)
    ear_r = mk_extrude_z("rs_ear_r", ear_xy,  0.39,  0.51, bevel=0.018, bevel_segs=2, mat=m_enamel)
    w_clamp = mk_box("rs_wclamp", 1.06, 0.20, 0.78, [("t", -0.04, 0.20, 0.0)], m_enamel, bevel=0.020)

    # Iconic Tilted (+0.28 rad) Rotary 4-Aperture Diopter Drum w/ scalloped top notches & 4 distinct peep holes!
    drum_outer = mk_cyl("rs_drum", 0.49, 0.51, 0.58, axis="y", segs=36, mat=m_hi, bevel=0.022)
    drum_cutters = [
        mk_cyl("c_rs_hol", 0.355, 0.355, 0.52, axis="y", segs=30, xform=[("t", 0.0, 0.08, 0.0)], mat=m_dark)
    ]
    ap_radii = (0.052, 0.068, 0.084, 0.100)
    for q in range(4):
        q_ang = q * (math.pi * 0.5)
        r_h = ap_radii[q]
        drum_cutters.append(
            mk_cyl(f"c_rs_ap_{q}", r_h, r_h, 0.65, axis="x", segs=18,
                   xform=[("t", 0.36, 0.04, 0.0), ("ry", q_ang)], mat=m_dark)
        )
        # Top scalloped V-alignment notch above each aperture
        drum_cutters.append(
            mk_box(f"c_rs_sc_{q}", 0.26, 0.11, 0.12,
                   xform=[("t", 0.44, 0.28, 0.0), ("ry", q_ang)], mat=m_dark)
        )
    drum = bool_subtract(drum_outer, drum_cutters)
    # Apply authentic HK +0.28 rad rearward drum tilt & translate into pedestal
    bm = bmesh.new()
    bm.from_mesh(drum.data)
    bmesh.ops.transform(
        bm,
        matrix=T2B_MAT @ Matrix.Translation(Vector((0.04, 0.44, 0.0))) @ Matrix.Rotation(0.28, 4, "Z") @ B2T_MAT,
        verts=bm.verts,
    )
    bm.to_mesh(drum.data)
    bm.free()

    # Knurled central elevation detent clamping turret + slotted windage adjustment screw
    turret = mk_knurled_cyl(
        "rs_turret", 0.148, 0.60, axis="y", flutes=16, depth=0.014,
        xform=[("rz", 0.28), ("t", 0.04, 0.44, 0.0)], mat=m_bright,
    )
    w_screw = mk_cyl(
        "rs_wscrew", 0.080, 0.080, 1.12, axis="z", segs=18,
        xform=[("t", -0.04, 0.18, 0.0)], mat=m_bright, bevel=0.012,
    )

    obj = join_objects([base_blk, ear_l, ear_r, w_clamp, drum, turret, w_screw], "mp5_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_stock_endcap(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-07: MP5A3 Contoured Steel Stock Endcap w/ Amber Polyurethane H-Buffer, Rail Guides & Latch Lever.
    assembledPos: [-5.95, 1.05, 0] | spans X in [-0.75, +0.77], Y in [-1.47, +1.31], Z in [-1.06, +0.96]."""
    m_enamel = mats["R_HkSatinEnamel"]
    m_hi = mats["R_HkEnamelHighlight"]
    m_dark = mats["R_HkInnerDark"]
    m_bright = mats["R_BrightSteel"]
    m_amber = mats["R_AmberHBuffer"]

    # Contoured figure-8-matching stamped tailcap hugging the exact twin-cylinder upper receiver profile!
    # Receiver local Y in [+0.14..+2.63] -> endcap local Y = worldY - 1.05 => [-0.91..+1.58], clipped cleanly to [-1.07..+1.31]
    cap_zy = [(-0.77, -1.07), (-0.78, 0.02)]
    cap_zy += _quad_bez((-0.78, 0.02), (-0.77, 0.52), (-0.56, 0.77), segs=8)
    cap_zy += _quad_bez((-0.56, 0.77), (-0.52, 1.28), (0.0, 1.31), segs=8)
    cap_zy += _quad_bez((0.0, 1.31), (0.52, 1.28), (0.56, 0.77), segs=8)
    cap_zy += _quad_bez((0.56, 0.77), (0.77, 0.52), (0.78, 0.02), segs=8)
    cap_zy.append((0.77, -1.07))
    cap_body = mk_extrude_x("ec_body", cap_zy, -0.68, 0.76, bevel=0.030, bevel_segs=2, mat=m_enamel)
    # Figure-8-conforming interior front hollow (never pierces narrowed upper waist!)
    c_hol_lo = mk_box("c_ec_hol_lo", 0.78, 1.44, 1.24, [("t", 0.45, -0.18, 0.0)], mat=m_dark)
    c_hol_hi = mk_cyl("c_ec_hol_hi", 0.39, 0.39, 0.78, axis="x", segs=26, xform=[("t", 0.45, 0.82, 0.0)], mat=m_dark)
    cap_shell = bool_subtract(cap_body, [c_hol_lo, c_hol_hi])

    # Twin chamfered lateral A3 rail guide sleeves (Z = ±0.82)
    guide_l = mk_box("ec_gl", 1.50, 0.44, 0.28, [("t", 0.02, -0.05, -0.82)], m_hi, bevel=0.028)
    guide_r = mk_box("ec_gr", 1.50, 0.44, 0.28, [("t", 0.02, -0.05,  0.82)], m_hi, bevel=0.028)

    # Amber polyurethane H-Buffer pad seated strictly inside lower cavity (front face at local X=+0.36 -> world X=-5.59!)
    h_buf = mk_box("ec_hbuf", 0.28, 1.22, 0.96, [("t", 0.22, -0.14, 0.0)], m_amber, bevel=0.032)
    # Domed rear steel mounting rivets
    riv_u = mk_sphere("ec_riv_u", 0.075, 0.092, 0.092, 16, 10, [("t", -0.68,  0.58, 0.0)], m_bright)
    riv_l = mk_sphere("ec_riv_l", 0.075, 0.092, 0.092, 16, 10, [("t", -0.68, -0.22, 0.0)], m_bright)

    # Contoured rotary stock-release latch lever underneath
    latch_xy = [(-0.42, -0.22), (0.38, -0.18), (0.42, 0.22), (-0.36, 0.24)]
    latch = mk_extrude_z("ec_latch", latch_xy, -0.29, 0.29, bevel=0.030, bevel_segs=2,
                         xform=[("rz", -0.22), ("t", -0.28, -1.16, 0.0)], mat=m_hi)
    # Captive rear takedown push-pin + domed headcap + left steel sling loop
    td_pin = mk_cyl("ec_tdpin", 0.140, 0.140, 1.72, axis="z", segs=22, xform=[("t", 0.50, -0.96, 0.0)], mat=m_enamel, bevel=0.018)
    td_cap = mk_cyl("ec_tdcap", 0.195, 0.195, 0.08, axis="z", segs=22, xform=[("t", 0.50, -0.96, -0.84)], mat=m_hi, bevel=0.015)
    sling = mk_torus("ec_sling", 0.20, 0.045, axis="x", major_segs=24, minor_segs=10, xform=[("t", -0.55, 0.35, -0.82)], mat=m_bright)

    obj = join_objects([cap_shell, guide_l, guide_r, h_buf, riv_u, riv_l, latch, td_pin, td_cap, sling], "mp5_stock_endcap")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 2: METAL / INTERNALS / BARREL / STOCK / MAG (16 parts)
# =============================================================================
def build_mp5_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-03: 8.85" CHF Navy 3-Lug Barrel, Knurled 1/2x28 Thread Protector, 12-Flute Chamber & Trunnion.
    assembledPos: [0, 1.00, 0] | spans X in [1.85, 19.52], Y in [-0.59, +0.59], Z in [-0.62, +0.62]."""
    m_bar = mats["M_HkBarrelBlue"]
    m_soot = mats["M_NavyMuzzleSoot"]
    m_chrome = mats["M_MirrorChromeRoller"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]

    # 1. Forged Roller-Locking Trunnion Block (X in [1.85, 4.85]) w/ chamfered edges & 45° roller recesses
    trun_raw = mk_box("b_trun", 3.00, 1.18, 1.18, [("t", 3.35, 0.0, 0.0)], m_bar, bevel=0.042, bevel_segs=2)
    trun_cutters = [
        mk_cyl("c_tr_bore", 0.48, 0.48, 3.4, axis="x", segs=30, xform=[("t", 3.35, 0.0, 0.0)], mat=m_dark),
        # Twin vertical Ø8mm roller locking recesses at X = 2.15, Z = ±0.41
        mk_cyl("c_tr_rr", 0.225, 0.225, 0.74, axis="y", segs=24, xform=[("t", 2.15, 0.0,  0.41)], mat=m_dark),
        mk_cyl("c_tr_rl", 0.225, 0.225, 0.74, axis="y", segs=24, xform=[("t", 2.15, 0.0, -0.41)], mat=m_dark),
        mk_box("c_tr_ent", 0.95, 0.88, 0.88, [("t", 2.20, 0.0, 0.0)], mat=m_dark),
    ]
    trunnion = bool_subtract(trun_raw, trun_cutters)

    # 2. Closed Hollow 40-seg Lathe CHF Barrel Contour (outer -> 11° recessed target crown -> bore -> chamber)
    crown_rim = 0.350
    crown_bore = 0.215
    crown_depth = (crown_rim - crown_bore) * math.tan(math.radians(11.0))
    barrel_profile = [
        (0.280, 2.65),
        (0.460, 2.65),
        (0.490, 2.68),
        (0.490, 5.40),
        (0.410, 5.85),
        (0.400, 14.70),
        (0.450, 14.80),
        (0.450, 16.08),
        (0.390, 16.15),
        (0.390, 17.20),
        (0.425, 17.25),
        (0.425, 18.18),
        (0.380, 18.22),
        (0.380, 18.28),
        (0.440, 18.32),
        (0.440, 19.44),
        (0.405, 19.52),
        (crown_rim, 19.52),
        (crown_bore, 19.52 - crown_depth),
        (0.195, 19.52 - crown_depth - 0.02),
        (0.195, 4.75),
        (0.270, 4.55),
        (0.280, 2.65),
    ]
    barrel_raw = mk_lathe_x("b_tube", barrel_profile, segs=40, mat=m_bar)
    # Assign M_NavyMuzzleSoot to muzzle/3-lug section (X >= 17.20) for realistic heat-temper & carbon crown!
    barrel_raw.data.materials.append(m_soot)
    for p in barrel_raw.data.polygons:
        if p.center.x >= 17.20:
            p.material_index = 1

    # Cut right extractor relief + 12 genuine longitudinal HK chamber gas-fluting grooves!
    flute_cutters = [mk_box("c_b_ext", 0.26, 0.24, 0.28, [("t", 2.72, 0.06, 0.36)], mat=m_dark)]
    for f_idx in range(12):
        f_ang = f_idx * (2.0 * math.pi / 12.0) + math.pi / 12.0
        flute_cutters.append(
            mk_box(f"c_fl_{f_idx}", 1.55, 0.032, 0.032, [("t", 3.75, 0.282, 0.0), ("rx", f_ang)], mat=m_dark)
        )
    barrel_carved = bool_subtract(barrel_raw, flute_cutters)

    parts = [trunnion, barrel_carved]

    # 3. Iconic HK Navy 3-Lug Quick-Detach Suppressor Mount (rear stop ring + 3 chamfered arc lugs w/ latch ramps)
    stop_ring_prof = [
        (0.420, 17.24), (0.445, 17.24), (0.460, 17.26), (0.460, 17.38),
        (0.445, 17.40), (0.420, 17.40), (0.420, 17.24),
    ]
    parts.append(mk_lathe_x("b_3lug_ring", stop_ring_prof, segs=36, mat=m_soot))
    for k in range(3):
        ang = k * (2.0 * math.pi / 3.0) + math.pi / 6.0
        parts.append(mk_arc_lug(f"b_lug_{k}", 0.415, 0.540, ang, math.radians(40.0), 17.46, 0.52, m_soot, bevel=0.028))
        parts.append(mk_arc_lug(f"b_lugn_{k}", 0.415, 0.500, ang + math.radians(24.0), math.radians(8.0), 17.98, 0.14, m_soot, bevel=0.016))

    # 4. Crisp 3D Knurled Navy 1/2x28 Thread Protector Sleeve (X in [18.34, 19.42], R_max = 0.456)
    parts.append(
        mk_knurled_cyl("b_tprot_knurl", 0.456, 1.06, axis="x", flutes=26, depth=0.018,
                       xform=[("t", 18.88, 0.0, 0.0)], mat=m_soot)
    )

    # 5. 6 Right-Hand 1:10" (25.4 cm) Helical Rifling Lands visible at recessed 11° crown!
    parts.extend(mk_helical_rifling_lands(
        "b_rifling", count=6, bore_r=0.195, depth=0.022, width=0.044,
        x0=4.80, x1=19.52 - crown_depth - 0.025, twist_cm=25.4, mat=m_chrome, segs=18,
    ))

    # 6. Mirror-polished chrome feed ramp + heavy barrel press cross-pin
    parts.extend([
        mk_box("b_feed_ramp", 0.44, 0.22, 0.48, [("rz", 0.42), ("t", 2.58, -0.34, 0.0)], m_chrome, bevel=0.022),
        mk_cyl("b_xpin", 0.110, 0.110, 1.24, axis="z", segs=18, xform=[("t", 4.15, -0.32, 0.0)], mat=m_bright, bevel=0.014),
    ])

    obj = join_objects(parts, "mp5_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_buttstock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-08: Iconic MP5A3 Twin-Rail Retractable Steel Buttstock & Contoured Concave Ribbed Rubber Pad.
    assembledPos: [-14.45, 0.35, 0] | spans X in [-1.12, +11.60], Y in [-3.12, +1.24], Z in [-0.89, +0.89]."""
    m_rail = mats["M_BluedSteelMag"]
    m_hi = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]
    m_rub = mats["M_ButtpadRubber"]

    # 1. Organically lofted 3D contoured concave vulcanized-rubber MP5A3 buttpad (rounded oval shoulder contour, ZERO flat slab!)
    def _eval_q(p0, p1, p2, t: float):
        u = 1.0 - t
        return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])

    pad_stations = 20
    pad_ring_pts = 28
    pad_rings = []
    for si in range(pad_stations):
        t = si / (pad_stations - 1)  # 0 = top heel (Y=+1.18) -> 1 = curved toe (Y=-3.05)
        rx_pt, ry_pt = _eval_q((-0.82, 1.18), (-0.46, -0.65), (-1.05, -2.95), t)
        if t < 0.22:
            u = t / 0.22
            fx_pt, fy_pt = (0.78, 1.18 - u * 0.86)
        else:
            u = (t - 0.22) / 0.78
            fx_pt, fy_pt = _eval_q((0.78, 0.32), (0.22, -1.35), (-0.35, -3.05), u)
        cy = 0.5 * (ry_pt + fy_pt)
        cx = 0.5 * (rx_pt + fx_pt)
        ax = max(0.32, 0.5 * (fx_pt - rx_pt))
        # Taper smoothly in Z width from ±0.61 at yoke shoulder cradle down to ±0.50 at rounded rubber toe!
        az = 0.615 - 0.095 * (t ** 1.35) + 0.025 * math.sin(t * math.pi)
        end_scale = 0.86 if si in (0, pad_stations - 1) else (0.96 if si in (1, pad_stations - 2) else 1.0)
        ring = []
        for k in range(pad_ring_pts):
            th = 2.0 * math.pi * k / pad_ring_pts
            ct, st = math.cos(th), math.sin(th)
            # Soft superellipse (p=2.35): rounded rubber corners & plush shoulder cradle
            sx = math.copysign(abs(ct) ** 0.85, ct)
            sz = math.copysign(abs(st) ** 0.85, st)
            px = cx + sx * ax * end_scale
            py = cy + (0.04 if si == 0 else (-0.04 if si == pad_stations - 1 else 0.0)) * (1.0 - abs(ct))
            pz = sz * az * end_scale
            ring.append((px, py, pz))
        pad_rings.append(ring)
    pad_raw = mk_loft_rings("bs_pad", pad_rings, mat=m_rub, cap_ends=True)

    # 9 deep horizontal anti-slip shoulder serration grooves along the concave rear shoulder face
    pad_grooves = []
    for g in range(9):
        gy = -2.62 + g * 0.42
        # Follow the curved rear face X contour closely so grooves cut cleanly with uniform depth
        t_y = (gy - (-2.95)) / (1.18 - (-2.95))
        gx_rear = -1.05 * (1 - t_y) ** 2 + 2 * (-0.46) * (1 - t_y) * t_y + (-0.82) * t_y ** 2
        pad_grooves.append(mk_box(f"c_padg_{g}", 0.24, 0.110, 1.44, [("t", gx_rear - 0.04, gy, 0.0)], mat=m_rub))
    buttpad = bool_subtract(pad_raw, pad_grooves)

    # 2. Sculpted cast-steel A3 fork yoke clamping twin steel rails + cross roll-pins
    yoke = mk_box("bs_yoke", 1.38, 0.94, 1.72, [("t", 0.55, 0.65, 0.0)], m_hi, bevel=0.055, bevel_segs=3)
    roll_pin1 = mk_cyl("bs_pin1", 0.065, 0.065, 1.78, axis="z", segs=16, xform=[("t", 0.85, 0.65, 0.0)], mat=m_bright, bevel=0.010)
    roll_pin2 = mk_cyl("bs_pin2", 0.055, 0.055, 1.76, axis="z", segs=14, xform=[("t", 0.28, 0.85, 0.0)], mat=m_bright, bevel=0.010)

    parts = [buttpad, yoke, roll_pin1, roll_pin2]

    # 3. Twin heavy machined C-channel spring-steel fork rails (Z = ±0.80, X_local in [+0.45, +11.60])
    for side in (-1.0, 1.0):
        rail_bar = mk_box(f"bs_rail_{side:+.0f}", 11.15, 0.28, 0.13, [("t", 6.025, 0.65, side * 0.80)], m_rail, bevel=0.016)
        rail_cuts = [
            mk_box(f"c_rfl_{side:+.0f}", 10.20, 0.11, 0.075, [("t", 6.10, 0.65, side * 0.85)], mat=m_dark),
        ]
        for idx_n, nx in enumerate((3.20, 7.10, 10.80)):
            rail_cuts.append(
                mk_box(f"c_rn_{side:+.0f}_{idx_n}", 0.28, 0.12, 0.26, [("t", nx, 0.52, side * 0.80)], mat=m_dark)
            )
        parts.append(bool_subtract(rail_bar, rail_cuts))
        # Gleaming polished steel bearing strips along top & bottom edges of sliding rails
        parts.extend([
            mk_box(f"bs_st_u_{side:+.0f}", 11.08, 0.038, 0.134, [("t", 6.02, 0.778, side * 0.80)], m_bright, bevel=0.006),
            mk_box(f"bs_st_d_{side:+.0f}", 11.08, 0.034, 0.134, [("t", 6.02, 0.522, side * 0.80)], m_bright, bevel=0.006),
        ])

    obj = join_objects(parts, "mp5_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_charging_handle(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-01: Non-Reciprocating Left Folding 'HK Slap' Charging Handle & Cocking Support Sleeve.
    assembledPos: [12.45, 2.08, 0] | spans X in [-1.625, +1.425], Y in [-0.35, +0.46], Z in [-1.75, +0.35]."""
    m_steel = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]
    m_poly = mats["M_SlapKnobPolymer"]

    # Hollowed cylindrical cocking support sleeve riding inside forward cocking tube
    sleeve_raw = mk_cyl("ch_slv", 0.35, 0.35, 3.05, axis="x", segs=28, xform=[("t", -0.10, 0.0, 0.0)], mat=m_steel, bevel=0.016)
    c_bore = mk_cyl("c_ch_bore", 0.24, 0.24, 3.35, axis="x", segs=22, xform=[("t", -0.10, 0.0, 0.0)], mat=m_dark)
    c_slot = mk_box("c_ch_slot", 1.45, 0.24, 0.85, [("t", -0.55, 0.0, 0.0)], mat=m_dark)
    sleeve = bool_subtract(sleeve_raw, [c_bore, c_slot])

    # Pivoted steel folding lever clevis + vertical hinge axle pin
    clevis = mk_box("ch_clev", 0.56, 0.24, 0.36, [("t", 0.35, 0.02, -0.42)], m_steel, bevel=0.024)
    arm = mk_box("ch_arm", 0.42, 0.20, 0.56, [("rx", -0.20), ("t", 0.35, 0.08, -0.74)], m_steel, bevel=0.024)
    pin = mk_cyl("ch_pin", 0.075, 0.075, 0.34, axis="y", segs=16, xform=[("t", 0.35, 0.04, -0.48)], mat=m_bright, bevel=0.010)

    # Iconic HK tapered multi-ribbed matte black polymer "HK Slap" knob (36-seg lathe w/ 5 grip rings!)
    knob_pts = [
        (0.000, 0.00),
        (0.230, 0.02),
        (0.232, 0.14), (0.202, 0.175), (0.228, 0.21),
        (0.224, 0.31), (0.195, 0.345), (0.220, 0.38),
        (0.215, 0.49), (0.186, 0.525), (0.208, 0.56),
        (0.198, 0.67), (0.174, 0.74),
        (0.130, 0.81), (0.065, 0.838), (0.000, 0.845),
    ]
    knob = mk_lathe_y(
        "ch_knob", knob_pts, segs=32,
        xform=[("rx", -(math.pi * 0.5 - 0.20)), ("t", 0.35, 0.14, -0.92)],
        mat=m_poly,
    )

    obj = join_objects([sleeve, clevis, arm, pin, knob], "mp5_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_bolt_carrier(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-02: Heavy Machined HK MP5 Bolt Carrier w/ Brazed Upper Recoil-Spring Tube & Bearing Rails.
    assembledPos: [-1.15, 1.00, 0] | spans X in [-1.85, +10.77], Y in [-0.46, +1.44], Z in [-0.59, +0.59]."""
    m_bcg = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]

    # Lower heavy carrier block with chamfered edges + vertical connecting spine web + long upper recoil tube
    block = mk_box("bc_blk", 3.90, 0.96, 1.06, [("t", 0.10, 0.02, 0.0)], m_bcg, bevel=0.036, bevel_segs=2)
    web = mk_box("bc_web", 3.80, 0.85, 0.66, [("t", 0.10, 0.62, 0.0)], m_bcg, bevel=0.024)
    utube = mk_cyl("bc_utube", 0.36, 0.36, 11.95, axis="x", segs=30, xform=[("t", 4.775, 1.08, 0.0)], mat=m_bcg, bevel=0.015)
    solid = bool_union([block, web, utube], "bc_solid")

    cutters = [
        mk_box("c_bc_ham",  2.60, 0.78, 0.44, [("t", -0.65, -0.14, 0.0)], mat=m_dark),
        mk_cyl("c_bc_sock", 0.34, 0.34, 1.55, axis="x", segs=24, xform=[("t", 1.55, 0.0, 0.0)], mat=m_dark),
        mk_cyl("c_bc_stun", 0.27, 0.27, 11.75, axis="x", segs=22, xform=[("t", 4.65, 1.08, 0.0)], mat=m_dark),
        mk_box("c_bc_ejec", 4.05, 0.26, 0.16, [("t", 0.10, -0.36, -0.18)], mat=m_dark),
        mk_box("c_bc_ramp", 1.15, 0.52, 1.24, [("rz", -0.38), ("t", -1.65, -0.48, 0.0)], mat=m_dark),
    ]
    carved = bool_subtract(solid, cutters)

    # Precision-ground bright steel side bearing rails + tungsten anti-bounce plug cap + roll-pin
    rail_l = mk_box("bc_rl", 3.70, 0.16, 0.08, [("t", 0.10, 0.04, -0.55)], m_bright, bevel=0.014)
    rail_r = mk_box("bc_rr", 3.70, 0.16, 0.08, [("t", 0.10, 0.04,  0.55)], m_bright, bevel=0.014)
    cap = mk_cyl("bc_cap", 0.365, 0.365, 0.22, axis="x", segs=28, xform=[("t", 10.66, 1.08, 0.0)], mat=m_bright, bevel=0.016)

    obj = join_objects([carved, rail_l, rail_r, cap], "mp5_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_bolt_head(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-03: Precision Roller-Delayed Bolt Head w/ Bilateral Roller Windows, Copper Extractor Spring & Cup.
    assembledPos: [1.75, 1.00, 0] | spans X in [-0.85, +0.92], Y in [-0.51, +0.415], Z in [-0.42, +0.444]."""
    m_bright = mats["M_MachinedBrightSteel"]
    m_chrome = mats["M_MirrorChromeRoller"]
    m_steel = mats["M_OiledBoltCarrier"]
    m_copper = mats["M_CopperExtractorSpring"]
    m_dark = mats["M_DarkInternal"]

    # Radiused-corner bolt head forging (Z ±0.42, Y ±0.41, R0.16 corners)
    sec_zy = _rounded_rect_pts(0.42, 0.41, 0.16, corner_segs=6)
    main_body = mk_extrude_x("bh_body", sec_zy, -0.85, 0.90, bevel=0.032, bevel_segs=2, mat=m_bright)
    strip_lug = mk_box("bh_strip", 1.35, 0.14, 0.26, [("t", 0.18, -0.44, 0.08)], m_bright, bevel=0.018)
    raw = bool_union([main_body, strip_lug], "bh_raw")

    cutters = [
        mk_box("c_bh_wedge", 1.42, 0.56, 0.52, [("t", -0.20, 0.0, 0.0)], mat=m_dark),
        mk_cyl("c_bh_cup", 0.305, 0.270, 0.22, axis="x", segs=32, xform=[("t", 0.86, 0.0, 0.0)], mat=m_dark),
        mk_box("c_bh_wire", 0.95, 0.12, 0.12, [("t", 0.05, 0.08, 0.39)], mat=m_dark),
        # Bilateral roller windows at X_local = +0.40
        mk_box("c_bh_rwin", 0.42, 0.62, 1.14, [("t", 0.40, 0.0, 0.0)], mat=m_dark),
        mk_cyl("c_bh_fpin", 0.060, 0.060, 0.56, axis="x", segs=18, xform=[("t", 0.68, 0.0, 0.0)], mat=m_dark),
        mk_box("c_bh_ext",  0.82, 0.26, 0.18, [("t", 0.52, 0.08, 0.37)], mat=m_dark),
        mk_box("c_bh_ejec", 1.92, 0.28, 0.15, [("t", 0.02, -0.32, -0.18)], mat=m_dark),
    ]
    shell = bool_subtract(raw, cutters)

    # Profiled blued extractor claw + undercut hook + vivid copper-beryllium extractor spring wire!
    claw_xy = [(0.22, -0.10), (0.84, -0.10), (0.92, -0.04), (0.92, 0.06), (0.84, 0.10), (0.22, 0.10)]
    claw = mk_extrude_z("bh_claw", claw_xy, 0.305, 0.435, bevel=0.012, bevel_segs=2, xform=[("t", 0.0, 0.08, 0.0)], mat=m_steel)
    hook = mk_box("bh_hook", 0.10, 0.18, 0.14, [("t", 0.86, 0.08, 0.29)], m_steel, bevel=0.010)
    copper_wire = mk_cyl("bh_cu_spr", 0.034, 0.034, 0.78, axis="x", segs=16, xform=[("t", 0.08, 0.08, 0.41)], mat=m_copper, bevel=0.008)
    ret_pin = mk_cyl("bh_rpin", 0.048, 0.048, 0.83, axis="y", segs=14, xform=[("t", 0.68, 0.0, 0.26)], mat=m_steel, bevel=0.008)
    bushing = mk_lathe_x(
        "bh_bush",
        [(0.060, 0.755), (0.095, 0.755), (0.095, 0.770), (0.080, 0.780), (0.060, 0.780), (0.060, 0.755)],
        segs=24, mat=m_chrome,
    )

    obj = join_objects([shell, claw, hook, copper_wire, ret_pin, bushing], "mp5_bolt_head")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def _build_single_locking_roller(name: str, mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-04R / B-04L: Gleaming Mirror-Chrome Precision-Ground Ø8mm Cylindrical Locking Roller.
    R = 0.185, H = 0.58, chamfered ends, central oil micro-groove & hollow bore."""
    m_chrome = mats["M_MirrorChromeRoller"]
    m_dark = mats["M_DarkInternal"]
    pts_ry = [
        (0.065, -0.290),
        (0.145, -0.290),
        (0.185, -0.245),
        (0.185, -0.028),
        (0.174,  0.000),
        (0.185,  0.028),
        (0.185,  0.245),
        (0.145,  0.290),
        (0.065,  0.290),
        (0.065, -0.290),
    ]
    roller = mk_lathe_y(name, pts_ry, segs=36, mat=m_chrome)
    # Darken inner bore faces slightly for metallic depth
    roller.data.materials.append(m_dark)
    for p in roller.data.polygons:
        if math.hypot(p.center.x, p.center.y) < 0.08:
            p.material_index = 1
    return finish_part(roller, bevel_w=0.0, sharp_deg=38.0)


def build_mp5_locking_rollers(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    return _build_single_locking_roller("mp5_locking_rollers", mats)


def build_mp5_locking_roller_left(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    return _build_single_locking_roller("mp5_locking_roller_left", mats)


def build_mp5_locking_piece(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-05: Precision No. 17 100°/45° Steuerstück Locking Piece Wedge.
    assembledPos: [1.15, 1.00, 0] | spans X in [-0.87, +1.24], Y in [-0.34, +0.34], Z in [-0.32, +0.32]."""
    m_bright = mats["M_MachinedBrightSteel"]
    m_chrome = mats["M_MirrorChromeRoller"]
    m_dark = mats["M_DarkInternal"]

    stem = mk_cyl("lp_stem", 0.27, 0.27, 1.02, axis="x", segs=28, xform=[("t", -0.36, 0.0, 0.0)], mat=m_bright, bevel=0.015)
    ears = mk_box("lp_ears", 0.24, 0.68, 0.32, [("t", -0.56, 0.0, 0.0)], m_bright, bevel=0.018)
    collar = mk_cyl("lp_col", 0.32, 0.32, 0.14, axis="x", segs=28, xform=[("t", 0.10, 0.0, 0.0)], mat=m_bright, bevel=0.015)

    # Forward precision-ground 45° Steuerstück camming shoulders in (X, Z) extruded along Y [-0.26, +0.26]
    wedge_xz = [
        (0.14, -0.25), (0.64, -0.25), (1.18, -0.065),
        (1.22,  0.00), (1.18,  0.065), (0.64,  0.25), (0.14,  0.25),
    ]
    wedge = mk_extrude_y("lp_wedge", wedge_xz, -0.26, 0.26, bevel=0.022, bevel_segs=2, mat=m_chrome)
    solid = bool_union([stem, ears, collar, wedge], "lp_solid")

    cutters = [
        mk_cyl("c_lp_br", 0.11, 0.11, 1.45, axis="x", segs=20, xform=[("t", -0.30, 0.0, 0.0)], mat=m_dark),
        mk_cyl("c_lp_bf", 0.08, 0.08, 1.65, axis="x", segs=18, xform=[("t",  0.65, 0.0, 0.0)], mat=m_dark),
    ]
    carved = bool_subtract(solid, cutters)
    carved.name = "mp5_locking_piece"
    carved.data.name = "mp5_locking_piece"
    return finish_part(carved, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-06: Gleaming Chrome Stepped Firing Pin & Captive Return Spring.
    assembledPos: [0.55, 1.00, 0] | spans X in [-1.16, +2.06], Y/Z in [-0.175, +0.175]."""
    m_chrome = mats["M_MirrorChromeRoller"]
    m_spr = mats["M_SpringSteel"]

    pts_rx = [
        (0.000, -1.16),
        (0.130, -1.12),
        (0.130, -0.56),
        (0.174, -0.56),
        (0.174, -0.42),
        (0.090, -0.42),
        (0.085,  1.28),
        (0.055,  1.55),
        (0.032,  2.04),
        (0.000,  2.06),
    ]
    pin = mk_lathe_x("fp_pin", pts_rx, segs=28, mat=m_chrome)
    spr = mk_coil_spring("fp_spr", "x", -0.40, 1.05, 0.0, 0.0, 0.125, 0.022, 12.0, ring_segs=8, steps_per_coil=14, mat=m_spr)
    obj = join_objects([pin, spr], "mp5_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_mp5_recoil_rod(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-07: Captive Telescoping Recoil Spring Guide Rod & Copper Stop Collar.
    assembledPos: [-5.35, 2.08, 0] | spans X in [-0.01, +11.63], Y in [-0.49, +0.29], Z in [-0.37, +0.37]."""
    m_steel = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_copper = mats["M_CopperExtractorSpring"]

    flange = mk_box("rr_flange", 0.24, 0.78, 0.68, [("t", 0.11, -0.10, 0.0)], m_steel, bevel=0.022)
    rivet = mk_cyl("rr_riv", 0.060, 0.060, 0.74, axis="z", segs=16, xform=[("t", 0.11, -0.34, 0.0)], mat=m_bright, bevel=0.010)
    rod = mk_cyl("rr_rod", 0.105, 0.105, 11.55, axis="x", segs=22, xform=[("t", 5.85, 0.0, 0.0)], mat=m_bright, bevel=0.012)
    fcol = mk_cyl("rr_fcol", 0.200, 0.200, 0.22, axis="x", segs=24, xform=[("t", 11.15, 0.0, 0.0)], mat=m_copper, bevel=0.018)
    rwash = mk_cyl("rr_rwash", 0.220, 0.220, 0.16, axis="x", segs=24, xform=[("t", 0.28, 0.0, 0.0)], mat=m_steel, bevel=0.016)

    obj = join_objects([flange, rivet, rod, fcol, rwash], "mp5_recoil_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_trigger_pack(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: Removable Brushed Stainless Sheet-Steel Trigger Box, Sear & Long Pivoted Ejector Lever.
    assembledPos: [-1.85, -0.25, 0] | spans X in [-1.93, +3.47], Y in [-0.66, +1.16], Z in [-0.53, +0.53]."""
    m_ss = mats["M_StainlessTriggerBox"]
    m_steel = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_spr = mats["M_SpringSteel"]
    m_dark = mats["M_DarkInternal"]

    box_raw = mk_box("tp_box", 4.15, 1.12, 0.96, [("t", 0.15, -0.10, 0.0)], m_ss, bevel=0.024)
    cutters = [
        mk_box("c_tp_in",  3.82, 0.98, 0.76, [("t", 0.15, 0.04, 0.0)], mat=m_dark),
        mk_box("c_tp_win", 1.45, 0.48, 1.24, [("t", -0.35, -0.08, 0.0)], mat=m_dark),
        mk_cyl("c_tp_sel", 0.19, 0.19, 1.24, axis="z", segs=18, xform=[("t", -1.30, -0.30, 0.0)], mat=m_dark),
    ]
    chassis = bool_subtract(box_raw, cutters)

    # Signature HK MP5 Long Pivoted Steel Ejector Lever rising into bolt-head groove at Z = -0.18!
    ej_arm = mk_box("tp_ejarm", 2.78, 0.24, 0.11, [("t", 1.85, 0.68, -0.18)], m_steel, bevel=0.016)
    ej_tip = mk_box("tp_ejtip", 0.56, 0.44, 0.11, [("rz", 0.14), ("t", 3.16, 0.90, -0.18)], m_steel, bevel=0.016)
    ej_pin = mk_cyl("tp_ejpin", 0.075, 0.075, 1.02, axis="z", segs=16, xform=[("t", 0.85, 0.44, 0.0)], mat=m_steel, bevel=0.010)
    ej_spr = mk_coil_spring("tp_ejspr", "y", 0.05, 0.48, 0.52, -0.18, 0.070, 0.018, 5.0, ring_segs=7, steps_per_coil=12, mat=m_spr)

    # Internal sear/disconnector plates, cross axles, hammer strut rod & captive coil mainspring
    sear = mk_box("tp_sear", 1.38, 0.34, 0.44, [("t", -0.15, 0.22, 0.0)], m_steel, bevel=0.018)
    ax1 = mk_cyl("tp_ax1", 0.085, 0.085, 1.06, axis="z", segs=16, xform=[("t", 1.00, 0.20, 0.0)], mat=m_steel, bevel=0.010)
    ax2 = mk_cyl("tp_ax2", 0.085, 0.085, 1.06, axis="z", segs=16, xform=[("t", 0.10, -0.25, 0.0)], mat=m_steel, bevel=0.010)
    strut_rod = mk_cyl("tp_srod", 0.050, 0.050, 1.48, axis="x", segs=14,
                       xform=[("rz", -0.28), ("t", 0.22, -0.02, 0.0)], mat=m_bright)
    strut_spr = mk_coil_spring("tp_sspr", "x", -1.38, -0.32, 0.0, 0.0, 0.110, 0.024, 10.0,
                               ring_segs=7, steps_per_coil=12, xform=[("rz", -0.28), ("t", 1.00, -0.02, 0.0)], mat=m_spr)

    obj = join_objects([chassis, ej_arm, ej_tip, ej_pin, ej_spr, sear, ax1, ax2, strut_rod, strut_spr], "mp5_trigger_pack")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Hardened Rotary Steel Hammer baked in cocked-down rest pose (rz = +1.26 rad).
    assembledPos: [-0.85, -0.05, 0] | spans X in [-1.10, +0.24], Y in [-0.30, +0.50], Z in [-0.34, +0.34]."""
    m_bright = mats["M_MachinedBrightSteel"]
    m_chrome = mats["M_MirrorChromeRoller"]
    m_dark = mats["M_DarkInternal"]

    hub_raw = mk_cyl("hm_hub", 0.24, 0.24, 0.68, axis="z", segs=24, mat=m_bright, bevel=0.016)
    hub = bool_subtract(hub_raw, [mk_cyl("c_hm_hb", 0.09, 0.09, 0.88, axis="z", segs=18, mat=m_dark)])

    h_xy = [
        (-0.20, -0.05), (0.22, -0.14), (0.28, 0.55),
        (0.15, 1.08), (-0.32, 1.02), (-0.44, 0.48), (-0.34, 0.36),
    ]
    head_raw = mk_extrude_z("hm_head", h_xy, -0.18, 0.18, bevel=0.026, bevel_segs=2, mat=m_chrome)
    head = bool_subtract(head_raw, [
        mk_cyl("c_hm_lh", 0.11, 0.11, 0.56, axis="z", segs=18, xform=[("t", -0.08, 0.62, 0.0)], mat=m_dark)
    ])
    # Bake exact cocked-down rearward rotation (+1.26 rad around Three.js Z) so rest clears carrier!
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bmesh.ops.transform(bm, matrix=T2B_MAT @ Matrix.Rotation(1.26, 4, "Z") @ B2T_MAT, verts=bm.verts)
    bm.to_mesh(head.data)
    bm.free()

    obj = join_objects([hub, head], "mp5_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-04: Curved Wide-Face Steel Trigger Shoe & Sear Transfer Bow.
    assembledPos: [-1.75, -0.95, 0] | spans X in [-0.24, +0.88], Y in [-1.31, +0.39], Z in [-0.27, +0.27]."""
    m_steel = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]

    hub = mk_cyl("tr_hub", 0.15, 0.15, 0.54, axis="z", segs=22, mat=m_steel, bevel=0.014)
    bow_xy = [(-0.16, 0.08), (0.20, 0.08)]
    bow_xy += _quad_bez((0.20, 0.08), (0.05, -0.65), (0.28, -1.18), segs=12)
    bow_xy.append((0.06, -1.28))
    bow_xy += _quad_bez((0.06, -1.28), (-0.26, -0.68), (-0.16, 0.08), segs=12)
    shoe = mk_extrude_z("tr_shoe", bow_xy, -0.17, 0.17, bevel=0.028, bevel_segs=2, mat=m_steel)
    tbar = mk_box("tr_tbar", 1.12, 0.22, 0.48, [("t", 0.32, 0.28, 0.0)], m_bright, bevel=0.020)

    obj = join_objects([hub, shoe, tbar], "mp5_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: Iconic 30-Round Curved Blued-Steel 9x19mm Magazine Body w/ Full Curved Cavity,
    Stamped Stiffening Ribs, 3 Rear Witness Holes & Rolled Bright-Steel Double-Stack Feed Lips.
    assembledPos: [2.90, -0.45, 0] | spans X in [-1.05, +3.11], Y in [-8.30, +1.38], Z in [-0.51, +0.51]."""
    m_mag = mats["M_BluedSteelMag"]
    m_hi = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]

    # Outer curved magazine silhouette (MAG_CX=16.0, MAG_CY=0.45, R_in=15.08, R_out=16.92, ang=[-0.05, 0.54])
    steps = 30
    outer_xy = []
    for i in range(steps + 1):
        ang = MAG_ANG_START + (MAG_ANG_END - MAG_ANG_START) * (i / steps)
        outer_xy.append((MAG_CX - math.cos(ang) * MAG_R_OUT, MAG_CY - math.sin(ang) * MAG_R_OUT))
    for i in range(steps, -1, -1):
        ang = MAG_ANG_START + (MAG_ANG_END - MAG_ANG_START) * (i / steps)
        outer_xy.append((MAG_CX - math.cos(ang) * MAG_R_IN, MAG_CY - math.sin(ang) * MAG_R_IN))
    raw_mag = mk_extrude_z("mb_raw", outer_xy, -0.46, 0.46, bevel=0.040, bevel_segs=2, mat=m_mag)

    # Full-length curved internal ammo-stack cavity (R in [15.20, 16.80], Z in [-0.38, +0.38], ang in [-0.07, 0.51])
    # Guarantees ZERO clipping with ammo stack, follower & spring AND crisp hollow walls in [C] cutaway!
    cav_xy = []
    for i in range(26):
        ang = -0.075 + (0.518 - (-0.075)) * (i / 25)
        cav_xy.append((MAG_CX - math.cos(ang) * 16.80, MAG_CY - math.sin(ang) * 16.80))
    for i in range(25, -1, -1):
        ang = -0.075 + (0.518 - (-0.075)) * (i / 25)
        cav_xy.append((MAG_CX - math.cos(ang) * 15.20, MAG_CY - math.sin(ang) * 15.20))
    cutters = [
        mk_extrude_z("c_mb_cav", cav_xy, -0.375, 0.375, mat=m_dark),
    ]
    # 5 curved side stamped flutes per flank (leaving lower flat clean for HK 9mmx19 / MADE IN GERMANY stamp!)
    flute_xy = _rounded_rect_pts(0.45, 0.175, 0.075, corner_segs=3)
    for s in range(1, 6):
        ang = 0.085 + s * 0.064
        rx = MAG_CX - math.cos(ang) * 16.0
        ry = MAG_CY - math.sin(ang) * 16.0
        for side in (-1.0, 1.0):
            cutters.append(
                mk_extrude_z(f"c_mb_fl_{s}_{side:+.0f}", flute_xy, -0.045, 0.045,
                             xform=[("rz", ang), ("t", rx, ry, side * 0.49)], mat=m_dark)
            )
    # 3 rear-spine round-count witness holes (10 / 20 / 30)
    for idx_w, w_ang in enumerate((0.19, 0.33, 0.46)):
        wx = MAG_CX - math.cos(w_ang) * MAG_R_OUT
        wy = MAG_CY - math.sin(w_ang) * MAG_R_OUT
        cutters.append(
            mk_cyl(f"c_mb_wit_{idx_w}", 0.065, 0.065, 0.30, axis="y", segs=14,
                   xform=[("rz", math.pi * 0.5 + w_ang), ("t", wx, wy, 0.0)], mat=m_dark)
        )
    sculpted = bool_subtract(raw_mag, cutters)

    parts = [sculpted]

    # Rolled double-stack bright-steel feed lips curling smoothly inward over top 9mm round
    for s_idx, s in enumerate((-1.0, 1.0)):
        lip_zy = [(s * 0.47, 1.02), (s * 0.47, 1.24)]
        lip_zy += _quad_bez((s * 0.47, 1.24), (s * 0.47, 1.375), (s * 0.30, 1.378), segs=6)
        lip_zy.append((s * 0.20, 1.370))
        lip_zy += _quad_bez((s * 0.20, 1.370), (s * 0.18, 1.340), (s * 0.20, 1.312), segs=4)
        lip_zy.append((s * 0.29, 1.318))
        lip_zy += _quad_bez((s * 0.29, 1.318), (s * 0.41, 1.310), (s * 0.41, 1.220), segs=6)
        lip_zy.append((s * 0.41, 1.02))
        parts.append(mk_extrude_x(f"mb_lip_{s_idx}", lip_zy, -0.81, 0.85, bevel=0.022, bevel_segs=2, mat=m_bright))

    # Twin stamped longitudinal curved stiffening beads along both flanks
    for r_idx, r_bead in enumerate((15.40, 16.60)):
        arc_pts = []
        for i in range(19):
            ang = 0.12 + (i / 18.0) * 0.38
            arc_pts.append(Vector((MAG_CX - math.cos(ang) * r_bead, MAG_CY - math.sin(ang) * r_bead, 0.0)))
        for side in (-1.0, 1.0):
            parts.append(
                mk_tube_along_pts(
                    f"mb_bead_{r_idx}_{side:+.0f}", arc_pts, 0.044, ring_segs=8,
                    xform=[("t", 0.0, 0.0, side * 0.482)], mat=m_hi, scale_z=0.45,
                )
            )

    parts.extend([
        mk_box("mb_fguide", 0.20, 0.24, 0.78, [("t", 0.80, 1.16, 0.0)], m_bright, bevel=0.018),
        mk_box("mb_stop",   1.94, 0.16, 1.02, [("rz", 0.08), ("t", 0.12, -1.28, 0.0)], m_hi, bevel=0.018),
        mk_box("mb_catch",  0.26, 0.28, 0.56, [("t", -0.92, -0.92, 0.0)], m_bright, bevel=0.018),
    ])

    obj = join_objects(parts, "mp5_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_mp5_mag_spring(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-03: Compressed Curved Rectangular-Coil Magazine Spring in Bottom Pocket.
    assembledPos: [2.90, -0.45, 0] | spans X in [1.03, 2.66], Y in [-7.84, -6.19], Z in [-0.265, +0.265]."""
    m_spr = mats["M_SpringSteel"]
    coils = 8.5
    total_steps = int(round(coils * 24))
    pts = []
    for i in range(total_steps + 1):
        u = i / total_steps
        ang = 0.44 + u * 0.089
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        rad_off = (1.0 if ct >= 0 else -1.0) * (abs(ct) ** 0.58) * 0.51
        z_off = (1.0 if st >= 0 else -1.0) * (abs(st) ** 0.58) * 0.23
        r_cur = 16.0 + rad_off
        pts.append(Vector((MAG_CX - math.cos(ang) * r_cur, MAG_CY - math.sin(ang) * r_cur, z_off)))
    obj = mk_tube_along_pts("mp5_mag_spring", pts, 0.035, ring_segs=8, mat=m_spr)
    return finish_part(obj, bevel_w=0.0, sharp_deg=45.0, weighted_normals=False)


def build_mp5_mag_floorplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: Flush Slide-On Stamped Steel Magazine Floorplate & Lock Plate (baked rz = +0.54 rad).
    assembledPos: [5.18, -8.23, 0] | spans X in [-0.885, +0.931], Y in [-0.646, +0.596], Z in [-0.52, +0.52]."""
    m_mag = mats["M_BluedSteelMag"]
    m_hi = mats["M_OiledBoltCarrier"]
    m_bright = mats["M_MachinedBrightSteel"]
    m_dark = mats["M_DarkInternal"]

    rot = [("rz", MAG_ANG_END)]
    parts = [
        mk_box("mf_base", 1.98, 0.20, 1.04, [("t", 0.0, -0.06, 0.0)] + rot, m_mag, bevel=0.024),
        mk_box("mf_rl",   1.92, 0.12, 0.10, [("t", 0.0,  0.06, -0.47)] + rot, m_hi, bevel=0.012),
        mk_box("mf_inl",  1.88, 0.045, 0.16, [("t", 0.0, 0.10, -0.41)] + rot, m_hi, bevel=0.008),
        mk_box("mf_rr",   1.92, 0.12, 0.10, [("t", 0.0,  0.06,  0.47)] + rot, m_hi, bevel=0.012),
        mk_box("mf_inr",  1.88, 0.045, 0.16, [("t", 0.0, 0.10,  0.41)] + rot, m_hi, bevel=0.008),
        mk_box("mf_lock", 1.66, 0.06, 0.68, [("t", 0.0,  0.06,  0.00)] + rot, m_dark, bevel=0.010),
        mk_torus("mf_bcol", 0.18, 0.025, axis="y", major_segs=22, minor_segs=8,
                 xform=[("t", 0.0, -0.155, 0.0)] + rot, mat=m_dark),
        mk_cyl("mf_btn", 0.14, 0.14, 0.22, axis="y", segs=22, xform=[("t", 0.0, -0.08, 0.0)] + rot, mat=m_bright, bevel=0.016),
    ]
    for i, rx in enumerate((-0.62, -0.38, 0.38, 0.62)):
        parts.append(mk_box(f"mf_rib_{i}", 0.08, 0.032, 0.78, [("t", rx, -0.16, 0.0)] + rot, m_hi, bevel=0.008))

    obj = join_objects(parts, "mp5_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 3: POLYMER FURNITURE, NAVY LOWER & FOLLOWER (4 parts)
# =============================================================================
def build_mp5_grip_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Iconic HK Navy Bullet-Pictogram Polymer Trigger Housing & Organically Sculpted Pistol Grip.
    ZERO flat boxy grip or square trigger guard! Multi-station lofted ergonomic palm-swell pistol grip
    with concave thumb-web scallops, rounded frontstrap/backstrap, and smoothly swept curved winter-glove
    trigger guard bow. Strictly preserves local bounds X in [-4.28, +3.96], Y in [-5.71, +0.64], Z in [-0.72, +0.72]."""
    m_poly = mats["F_HkPolyamide"]
    m_dark = mats["F_HkPolyamideDark"]

    # 1. Single-Piece Seamless Upper Trigger-Box Tray + Rounded Front Push-Pin Hinge Ears (ZERO seam disc!)
    tray_raw = mk_box("gh_tray", 7.05, 1.60, 1.44, [("t", 0.225, -0.18, 0.0)], m_poly, bevel=0.042, bevel_segs=2)
    ears_raw = mk_cyl("gh_ears", 0.42, 0.42, 1.438, axis="z", segs=28, xform=[("t", 3.55, 0.22, 0.0)], mat=m_poly, bevel=0.032)
    upper_body = bool_union([tray_raw, ears_raw], "gh_upper_solid")

    tray_cuts = [
        mk_box("c_gh_hol", 6.15, 1.40, 1.12, [("t", 0.20, 0.02, 0.0)], mat=m_dark),
        mk_box("c_gh_tsl", 1.45, 0.74, 0.56, [("t", 0.40, -0.82, 0.0)], mat=m_dark),
        mk_box("c_gh_rbe", 1.35, 0.85, 1.72, [("rz", 0.42), ("t", -3.02, -0.78, 0.0)], mat=m_dark),
        mk_cyl("c_gh_sel", 0.185, 0.185, 1.70, axis="z", segs=22, xform=[("t", -1.00, -0.20, 0.0)], mat=m_dark),
        mk_cyl("c_gh_tdh", 0.150, 0.150, 1.70, axis="z", segs=18, xform=[("t", -3.02,  0.36, 0.0)], mat=m_dark),
        mk_cyl("c_gh_fph", 0.145, 0.145, 1.70, axis="z", segs=18, xform=[("t",  3.55,  0.22, 0.0)], mat=m_dark),
        mk_box("c_gh_fcl", 0.92, 0.92, 0.94, [("t", 3.60, 0.22, 0.0)], mat=m_dark),
    ]
    tray_shell = bool_subtract(upper_body, tray_cuts)

    # 2. Organically Lofted Ergonomic HK Navy Pistol Grip (24 height stations x 36 ring pts w/ smooth palm swell & chamfered heel!)
    # Sweeps gracefully from Y = -0.68 down to Y = -5.66 along authentic HK ergonomic grip rake!
    def _eval_quad(p0, p1, p2, t: float):
        u = 1.0 - t
        return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])

    def _eval_grip_station(t: float):
        if t < 0.62:
            u = t / 0.62
            fx, fy = _eval_quad((-0.48, -0.68), (-0.82, -2.15), (-1.45, -3.75), u)
        else:
            u = (t - 0.62) / 0.38
            fx, fy = _eval_quad((-1.45, -3.75), (-1.84, -4.78), (-2.22, -5.68), u)
        # Subtle ergonomic finger-groove relief wave on frontstrap
        fx += 0.045 * math.sin(t * math.pi * 2.5) * math.sin(t * math.pi)

        if t < 0.36:
            u = t / 0.36
            bx, by = _eval_quad((-2.55, -0.68), (-2.70, -1.18), (-3.22, -2.35), u)
        else:
            u = (t - 0.36) / 0.64
            bx, by = _eval_quad((-3.22, -2.35), (-3.88, -3.96), (-4.27, -5.36), u)

        cx, cy = 0.5 * (fx + bx), 0.5 * (fy + by)
        ax = max(0.55, 0.5 * (fx - bx))
        # Smooth upper collar flare into tray -> concave thumb-web pinch -> full ergonomic palm swell -> subtle heel flare!
        collar_blend = 0.075 * math.exp(-(t / 0.09) ** 2)
        thumb_pinch = 0.115 * math.exp(-((t - 0.16) / 0.12) ** 2)
        palm_swell = 0.070 * math.sin(max(0.0, (t - 0.14) / 0.86) * math.pi)
        heel_flare = 0.042 * max(0.0, (t - 0.82) / 0.18)
        az = min(0.71, 0.635 + collar_blend - thumb_pinch + palm_swell + heel_flare)
        tilt_dy = (fy - by) * 0.5
        return cx, cy, ax, az, tilt_dy

    n_stations = 24
    ring_pts = 36
    grip_rings = []
    for si in range(n_stations):
        t = si / (n_stations - 1)
        cx, cy, ax, az, tilt_dy = _eval_grip_station(t)
        if si == 0:
            az = 0.695
        elif si == n_stations - 1:
            az *= 0.90
            ax *= 0.975
        elif si == n_stations - 2:
            az *= 0.98

        ring = []
        for k in range(ring_pts):
            th = 2.0 * math.pi * k / ring_pts
            ct, st = math.cos(th), math.sin(th)
            # Superellipse exponent p = 2.40 (silky rounded-oval HK Navy grip feel, zero flat slab!)
            sx = math.copysign(abs(ct) ** 0.83, ct)
            sz = math.copysign(abs(st) ** 0.85, st)
            # Slightly narrower frontstrap than palm backstrap (real ergonomic grip taper!)
            z_taper = 0.89 + 0.11 * (0.5 - 0.5 * ct)
            px = cx + sx * ax
            py = cy + sx * tilt_dy
            pz = sz * az * z_taper
            ring.append((px, py, pz))
        grip_rings.append(ring)

    grip_raw = mk_loft_rings("gh_grip_loft", grip_rings, mat=m_poly, cap_ends=True)

    # Hollow bottom storage cavity + smooth ergonomic concave thumb-web scallops under selector shelf!
    grip_cuts = [
        mk_box("c_gh_bcav", 1.32, 1.80, 0.78, [("rz", -0.34), ("t", -3.08, -4.88, 0.0)], mat=m_dark),
        mk_sphere("c_gh_thl", 0.76, 0.40, 0.14, 20, 12, [("t", -1.55, -1.10, -0.68)], mat=m_poly),
        mk_sphere("c_gh_thr", 0.76, 0.40, 0.14, 20, 12, [("t", -1.55, -1.10,  0.68)], mat=m_poly),
    ]
    grip_body = bool_subtract(grip_raw, grip_cuts)

    # Smooth conformal curved HK backstrap micro-traction serrations (ZERO spiky boxes!)
    def _mk_hk_backstrap_rib(rname: str, t_center: float, rib_dt: float = 0.011,
                             raise_out: float = 0.020, half_arc: float = 0.52) -> bpy.types.Object:
        bm_r = bmesh.new()
        arc_segs = 10
        t_vals = [t_center - rib_dt, t_center - rib_dt * 0.42, t_center + rib_dt * 0.42, t_center + rib_dt]
        r_mults = [0.0, 1.0, 1.0, 0.0]
        grid_in, grid_out = [], []
        for ui, tc in enumerate(t_vals):
            tc = max(0.06, min(0.94, tc))
            cx, cy, ax, az, tilt_dy = _eval_grip_station(tc)
            row_in, row_out = [], []
            for ai in range(arc_segs + 1):
                af = (ai / arc_segs) * 2.0 - 1.0
                th = math.pi + af * half_arc
                ct, st = math.cos(th), math.sin(th)
                sx = math.copysign(abs(ct) ** 0.83, ct)
                sz = math.copysign(abs(st) ** 0.85, st)
                z_taper = 0.89 + 0.11 * (0.5 - 0.5 * ct)
                px = cx + sx * ax
                py = cy + sx * tilt_dy
                pz = sz * az * z_taper
                nx, ny, nz = ct, 0.25 * ct, st
                nlen = math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
                nx, ny, nz = nx / nlen, ny / nlen, nz / nlen
                arc_taper = math.cos(af * math.pi * 0.5) ** 0.75
                d_out = raise_out * r_mults[ui] * arc_taper
                row_in.append(bm_r.verts.new((px - nx * 0.028, py - ny * 0.028, pz - nz * 0.028)))
                row_out.append(bm_r.verts.new((px + nx * d_out, py + ny * d_out, pz + nz * d_out)))
            grid_in.append(row_in)
            grid_out.append(row_out)
        nu = len(t_vals) - 1
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
        return _bm_to_obj(rname, bm_r, m_dark)

    grip_ribs = [_mk_hk_backstrap_rib(f"gh_brib_{i}", 0.30 + i * 0.075) for i in range(7)]

    # 3. Smoothly Swept Organic Curved Winter-Glove Polymer Trigger Guard Bow (ZERO rectangular box!)
    guard_outer_xy = [
        (-0.72, -0.80), (-0.72, -1.94),
    ]
    guard_outer_xy += _quad_bez((-0.72, -1.94), (0.88, -2.28), (2.42, -2.14), segs=16)
    guard_outer_xy += _quad_bez((2.42, -2.14), (2.94, -2.04), (3.00, -1.30), segs=10)
    guard_outer_xy.append((2.96, -0.78))
    guard_outer_xy.append((2.52, -0.78))
    guard_outer_xy += _quad_bez((2.52, -0.78), (2.54, -1.78), (2.06, -1.86), segs=10)
    guard_outer_xy += _quad_bez((2.06, -1.86), (0.85, -1.98), (-0.34, -1.66), segs=14)
    guard_outer_xy.append((-0.34, -0.80))
    trigger_guard = mk_extrude_z("gh_tguard", guard_outer_xy, -0.31, 0.31, bevel=0.058, bevel_segs=3, mat=m_poly)

    obj = join_objects([tray_shell, grip_body, trigger_guard] + grip_ribs, "mp5_grip_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0, lock_flat_walls=True)


def build_mp5_forearm(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-06: Iconic HK Wide 'Tropical' Ergonomic Contoured Polymer Handguard w/ Corrugated Aluminum
    Heatshields & Captive Push-Pin. Organically lofted teardrop palm-swell tapering gracefully toward
    the front sight tower (ZERO square prism!).
    assembledPos: [10.25, 0.72, 0] | spans X in [-5.06, +5.01], Y in [-1.03, +0.93], Z in [-1.10, +1.10]."""
    m_poly = mats["F_HkPolyamide"]
    m_dark = mats["F_HkPolyamideDark"]
    m_alu = mats["F_HeatshieldAlu"]
    m_pin = mats["F_PushPinSteel"]
    m_chr = mats["F_DetentChrome"]

    # 1. 18-station organic loft of the Wide Tropical HK Forearm (X in [-5.00, +4.96])
    # Smooth palm-swell teardrop cross-section, gentle ergonomic belly fullness mid-forearm,
    # and authentic upward & inward front nose sweep toward the triple-frame front sight!
    base_zy = [(-0.62, -0.92)]
    base_zy += _quad_bez((-0.62, -0.92), (0.0, -1.03), (0.62, -0.92), segs=10)
    base_zy += _quad_bez((0.62, -0.92), (1.10, -0.56), (1.06, 0.08), segs=10)
    base_zy += _quad_bez((1.06, 0.08), (0.96, 0.56), (0.76, 0.90), segs=8)
    base_zy.append((-0.76, 0.90))
    base_zy += _quad_bez((-0.76, 0.90), (-0.96, 0.56), (-1.06, 0.08), segs=8)
    base_zy += _quad_bez((-1.06, 0.08), (-1.10, -0.56), (-0.62, -0.92), segs=10)
    # Deduplicate adjacent close points so loft rings are crisp
    clean_zy = []
    for p in base_zy:
        if not clean_zy or math.hypot(p[0] - clean_zy[-1][0], p[1] - clean_zy[-1][1]) > 1e-4:
            clean_zy.append(p)
    if math.hypot(clean_zy[0][0] - clean_zy[-1][0], clean_zy[0][1] - clean_zy[-1][1]) < 1e-4:
        clean_zy.pop()

    x_stations = [
        -5.00, -4.93, -4.72, -4.15, -3.35, -2.35, -1.25, -0.15,
         0.95,  1.95,  2.80,  3.45,  3.95,  4.35,  4.65,  4.84,  4.92,  4.96,
    ]
    rings = []
    for xi, xx in enumerate(x_stations):
        u = (xx - (-5.00)) / 9.96  # 0 rear -> 1 front
        # Subtle ergonomic palm swell around mid-rear (u ~ 0.35), tapering smoothly forward (u > 0.65)!
        palm_z = 1.0 + 0.032 * math.sin(u * math.pi) - 0.14 * max(0.0, (u - 0.58) / 0.42) ** 1.4
        # Smooth upward front-chin taper for u > 0.68 (classic HK Tropical handguard nose!)
        chin_lift = 0.28 * max(0.0, (u - 0.66) / 0.34) ** 1.35
        # Soft end-cap bevel on very first & last stations
        end_bevel = 0.94 if xi in (0, len(x_stations) - 1) else 1.0
        ring = []
        for pz, py in clean_zy:
            z_out = pz * palm_z * end_bevel
            if py < 0.0:
                y_out = py + chin_lift * (abs(py) / 1.03)
                if xi in (0, len(x_stations) - 1):
                    y_out += 0.05
            else:
                y_out = py - (0.04 if xi in (0, len(x_stations) - 1) else 0.0)
            ring.append((xx, y_out, z_out))
        rings.append(ring)

    forearm_raw = mk_loft_rings("fa_loft", rings, mat=m_poly, cap_ends=True)

    # Hollow U-channel interior for barrel & cocking tube + 7 sculpted angled ergonomic finger-grip scallops!
    cutters = [
        mk_box("c_fa_chan", 10.40, 1.56, 1.28, [("t", 0.0, 0.34, 0.0)], mat=m_dark),
    ]
    for g in range(-3, 4):
        gx = g * 1.05
        # Sleek refined HK Tropical ergonomic angled finger scallops along both flanks
        cutters.append(
            mk_cyl(f"c_fa_gr_l_{g+3}", 0.066, 0.066, 0.90, axis="y", segs=16,
                   xform=[("rz", 0.18), ("t", gx, -0.18, -1.072)], mat=m_dark)
        )
        cutters.append(
            mk_cyl(f"c_fa_gr_r_{g+3}", 0.066, 0.066, 0.90, axis="y", segs=16,
                   xform=[("rz", 0.18), ("t", gx, -0.18,  1.072)], mat=m_dark)
        )
    body = bool_subtract(forearm_raw, cutters)

    parts = [body]
    # Molded bottom parting-line spine rib + corrugated brushed-aluminum internal thermal heatshields!
    parts.extend([
        mk_box("fa_bspine", 7.10, 0.075, 0.22, [("t", -0.60, -0.975, 0.0)], m_dark, bevel=0.020),
        mk_box("fa_sh_l", 8.20, 0.68, 0.040, [("t", -0.20, 0.12, -0.68)], m_alu, bevel=0.008),
        mk_box("fa_sh_r", 8.20, 0.68, 0.040, [("t", -0.20, 0.12,  0.68)], m_alu, bevel=0.008),
    ])
    for i in range(-3, 4):
        for side in (-1.0, 1.0):
            parts.append(
                mk_box(f"fa_srib_{i+3}_{side:+.0f}", 0.14, 0.56, 0.036,
                       [("t", -0.20 + i * 1.10, 0.12, side * 0.655)], m_alu, bevel=0.008)
            )
    # Captive HK front retention push-pin w/ domed headcap & chrome spring detent ball
    parts.extend([
        mk_cyl("fa_pin", 0.135, 0.135, 1.54, axis="z", segs=22, xform=[("t", 4.48, -0.38, 0.0)], mat=m_pin, bevel=0.016),
        mk_cyl("fa_phead", 0.210, 0.210, 0.10, axis="z", segs=22, xform=[("t", 4.48, -0.38, -0.78)], mat=m_pin, bevel=0.020),
        mk_sphere("fa_dball", 0.055, 0.055, 0.055, 14, 10, [("t", 4.48, -0.25, 0.68)], m_chr),
    ])

    obj = join_objects(parts, "mp5_forearm")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_mp5_selector(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-05: Ambidextrous HK Navy Selector Drum Axle & Tapered Thumb Levers w/ White Inlay Pointers.
    assembledPos: [-3.15, -0.55, 0] | spans X in [-0.35, +1.12], Y in [-0.28, +0.29], Z in [-0.975, +0.975]."""
    m_axle = mats["F_SelectorSteelAxle"]
    m_poly = mats["F_HkPolyamideDark"]
    m_white = mats["F_SelectorWhiteInlay"]

    drum_raw = mk_cyl("sel_drum", 0.18, 0.18, 1.56, axis="z", segs=24, mat=m_axle, bevel=0.012)
    drum = bool_subtract(drum_raw, [mk_box("c_sel_cut", 0.24, 0.18, 0.62, [("t", 0.08, 0.12, 0.0)], mat=m_axle)])
    cam = mk_box("sel_cam", 0.42, 0.34, 0.56, [("t", -0.14, 0.12, 0.0)], m_axle, bevel=0.020)

    parts = [drum, cam]
    for side in (-1.0, 1.0):
        z_pos = side * 0.77
        # Authentic HK asymmetric lever lengths (1.15 cm left thumb, 0.98 cm right index-finger clearance!)
        l_len = 1.15 if side < 0 else 0.98
        parts.append(mk_cyl(f"sel_boss_{side:+.0f}", 0.275, 0.275, 0.10, axis="z", segs=24,
                            xform=[("t", 0.0, 0.0, z_pos)], mat=m_poly, bevel=0.018))
        # Tapered ergonomic selector lever arm
        arm_xy = [(-0.08, -0.13), (l_len * 0.92, -0.10), (l_len * 0.95, 0.0), (l_len * 0.92, 0.10), (-0.08, 0.13)]
        parts.append(mk_extrude_z(f"sel_arm_{side:+.0f}", arm_xy, -0.06, 0.06, bevel=0.020, bevel_segs=2,
                                  xform=[("t", 0.0, 0.0, z_pos + side * 0.05)], mat=m_poly))
        # Sculpted thumb paddle w/ 3 tactile vertical traction ribs
        parts.append(mk_box(f"sel_pad_{side:+.0f}", 0.28, 0.36, 0.16,
                            [("t", l_len * 0.85, 0.0, z_pos + side * 0.08)], m_poly, bevel=0.028))
        for ri, roff in enumerate((-0.075, 0.0, 0.075)):
            parts.append(mk_box(f"sel_rib_{side:+.0f}_{ri}", 0.042, 0.31, 0.045,
                                [("t", l_len * 0.85 + roff, 0.0, z_pos + side * 0.165)], m_axle, bevel=0.008))
        # Crisp bright white enamel pointer strip pointing directly at Red SEMI bullet icon!
        parts.append(mk_box(f"sel_wptr_{side:+.0f}", 0.32, 0.052, 0.032,
                            [("t", l_len * 0.62, 0.0, z_pos + side * 0.145)], m_white, bevel=0.006))

    obj = join_objects(parts, "mp5_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_mp5_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: High-Visibility Safety-Orange Staggered Double-Column Anti-Tilt Follower.
    assembledPos: [4.37, -6.70, 0], assembledRot: [0, 0, 0.432] | spans X in [-0.74, +0.74], Y in [-0.54, +0.333]."""
    m_org = mats["F_FollowerOrange"]
    m_dark = mats["F_HkPolyamideDark"]

    parts = [
        mk_box("fl_deck",  1.48, 0.20, 0.68, [("t", 0.0,  0.10,  0.00)], m_org, bevel=0.028),
        mk_cyl("fl_step",  0.105, 0.105, 1.42, axis="x", segs=24, xform=[("t", 0.0, 0.23, -0.14)], mat=m_org, bevel=0.018),
        mk_cyl("fl_rbead", 0.065, 0.065, 1.36, axis="x", segs=18, xform=[("t", 0.0, 0.19,  0.21)], mat=m_org, bevel=0.012),
        mk_box("fl_skf",   0.15, 0.64, 0.64, [("t",  0.65, -0.22, 0.00)], m_org, bevel=0.022),
        mk_box("fl_skr",   0.15, 0.64, 0.64, [("t", -0.65, -0.22, 0.00)], m_org, bevel=0.022),
        mk_box("fl_spost", 0.56, 0.22, 0.26, [("t",  0.00, -0.11, 0.00)], m_dark, bevel=0.018),
        mk_box("fl_fl_l",  0.92, 0.12, 0.05, [("t",  0.00, -0.06, -0.315)], m_dark, bevel=0.008),
        mk_box("fl_fl_r",  0.92, 0.12, 0.05, [("t",  0.00, -0.06,  0.315)], m_dark, bevel=0.008),
    ]
    obj = join_objects(parts, "mp5_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


# =============================================================================
# UV Unwrapping & CONCAVE Packing for 3 Dedicated 2K Hero Atlases
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
    print(f"  [UV-PACK] {len(objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.55 and span_v > 0.55, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 5 receiver/sights/endcap parts into `mp5_v3_receiver` (2048x2048):
      - Hero Band 1 (Upper Receiver Left  Flank, X[-5.48..5.48], Y[-1.80..2.64]): u[0.015,0.985], v[0.730,0.985]
      - Hero Band 2 (Upper Receiver Right Flank, X[-5.48..5.48], Y[-1.80..2.64]): u[0.015,0.985], v[0.460,0.715]
      - Packed Region (cocking tube, front/rear sights, stock endcap & non-hero): u[0.010,0.990], v[0.010,0.445]
    """
    def is_hero_face(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "mp5_upper_receiver" or mat_name != "R_HkSatinEnamel":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -5.46 <= tx <= 5.46 and -1.78 <= ty <= 2.58:
            if nz > 0.62 and tz > 0.56:
                return True
            if nz < -0.62 and tz < -0.56:
                return True
        return False

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.990, 0.010, 0.445, skip_face_fn=is_hero_face)

    up = next(o for o in recv_objs if o.name == "mp5_upper_receiver")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("mp5_upper_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 5.48) / 10.96))
            yn = max(0.0, min(1.0, (ty + 1.80) / 4.44))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.460 + yn * 0.255)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.730 + yn * 0.255)
    bm.to_mesh(up.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 16 metal/internals/barrel/stock/mag parts into `mp5_v3_metal` (2048x2048):
      - Hero Band 1 (Curved 30-Rd Mag Right Flank): u[0.640,0.805], v[0.015,0.985]
      - Hero Band 2 (Curved 30-Rd Mag Left  Flank): u[0.820,0.985], v[0.015,0.985]
      - Upper Left Zone (barrel, buttstock, charging handle, floorplate & mag edges): u[0.010,0.622], v[0.500,0.990]
      - Lower Left Zone (roller-delayed BCG, chrome rollers, locking piece, FCG):     u[0.010,0.622], v[0.010,0.485]
    """
    def is_mag_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "mp5_mag_body" or mat_name != "M_BluedSteelMag":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.72 and tz > 0.42:
            return True
        if nz < -0.72 and tz < -0.42:
            return True
        return False

    ext_grp = [o for o in metal_objs if o.name in {
        "mp5_barrel", "mp5_buttstock", "mp5_charging_handle", "mp5_mag_body", "mp5_mag_floorplate",
    }]
    int_grp = [o for o in metal_objs if o not in ext_grp]

    _smart_unwrap_and_pack_rect(ext_grp, 0.010, 0.622, 0.500, 0.990, skip_face_fn=is_mag_hero_flank)
    _smart_unwrap_and_pack_rect(int_grp, 0.010, 0.622, 0.010, 0.485)

    # Project exact polar arc UVs onto Curved 30-Rd Magazine Right & Left Hero Flanks
    mag = next(o for o in metal_objs if o.name == "mp5_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    ang_span = MAG_ANG_END - MAG_ANG_START
    r_span = MAG_R_OUT - MAG_R_IN
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero_flank("mp5_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            dx = MAG_CX - tx
            dy = MAG_CY - ty
            rad = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            r_norm = max(0.0, min(1.0, (rad - MAG_R_IN) / r_span))       # 0 = front spine (+X), 1 = rear spine (-X)
            a_norm = max(0.0, min(1.0, (ang - MAG_ANG_START) / ang_span)) # 0 = top throat, 1 = bottom floorplate
            v_val = 0.985 - a_norm * 0.970
            if is_right:
                # Viewed from +Z: front (+X, r_norm=0) is RIGHT (u=0.805), rear (r_norm=1) is LEFT (u=0.640)
                u_val = 0.640 + (1.0 - r_norm) * 0.165
            else:
                # Viewed from -Z: front (+X, r_norm=0) is LEFT (u=0.820), rear (r_norm=1) is RIGHT (u=0.985)
                u_val = 0.820 + r_norm * 0.165
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(mag.data)
    bm.free()


def unwrap_furniture_atlas(furn_objs: list[bpy.types.Object]):
    """Unwraps 4 polymer furniture & follower parts into `mp5_v3_furniture` (2048x2048):
      - Hero Band 1 (Navy Grip Housing Right Flank): u[0.015,0.485], v[0.470,0.985]
      - Hero Band 2 (Navy Grip Housing Left  Flank): u[0.515,0.985], v[0.470,0.985]
      - Firewalled Box (Safety-Orange Mag Follower): u[0.010,0.190], v[0.010,0.450]
      - Packed Region (Tropical Forearm, Selector & grip edges): u[0.210,0.990], v[0.010,0.450]
    """
    def is_grip_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "mp5_grip_housing" or mat_name != "F_HkPolyamide":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        # 1) Seamless unified upper trigger-box flat + front hinge ear (tx in [-3.30, +3.98], ty in [-0.96, +0.64])
        if -3.30 <= tx <= 3.98 and -0.96 <= ty <= 0.64:
            if (nz > 0.80 and tz > 0.64) or (nz < -0.80 and tz < -0.64):
                return True
        # 2) Lower sculpted outer pistol-grip flank strictly clear of tray & trigger guard
        if -4.30 <= tx <= -0.50 and -5.60 <= ty <= -1.02:
            if (nz > 0.56 and tz > 0.44) or (nz < -0.56 and tz < -0.44):
                return True
        return False

    follower_grp = [o for o in furn_objs if o.name == "mp5_mag_follower"]
    main_grp = [o for o in furn_objs if o.name != "mp5_mag_follower"]

    _smart_unwrap_and_pack_rect(main_grp,     0.210, 0.990, 0.010, 0.450, skip_face_fn=is_grip_hero_flank)
    _smart_unwrap_and_pack_rect(follower_grp, 0.010, 0.190, 0.010, 0.450)

    gh = next(o for o in furn_objs if o.name == "mp5_grip_housing")
    bm = bmesh.new()
    bm.from_mesh(gh.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in gh.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_grip_hero_flank("mp5_grip_housing", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 4.35) / 8.15))
            yn = max(0.0, min(1.0, (ty + 5.80) / 6.75))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.470 + yn * 0.515)
            else:
                loop[uv_layer].uv = (0.515 + (1.0 - xn) * 0.470, 0.470 + yn * 0.515)
    bm.to_mesh(gh.data)
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
    run_bake("albedo", "EMIT", samples=8, fill_color=(0.04, 0.045, 0.05, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=8, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=8, fill_color=(0.0, 0.0, 0.0, 1.0))
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
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
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
    """Render 5 museum studio Cycles QA preview plates to /tmp/mp5_qa_*.png."""
    scene = bpy.context.scene
    print("\n[QA] Rendering 5 museum studio Cycles QA preview plates to /tmp/mp5_qa_*.png...")

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

    m_recv = _make_baked_mat("recv", "mp5_v3_receiver")
    m_met = _make_baked_mat("met", "mp5_v3_metal")
    m_furn = _make_baked_mat("furn", "mp5_v3_furniture")

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
        ("/tmp/mp5_qa_right.png",        ( 2.0, -0.5,  30.0), ( 2.0, -0.8, 0.0), 50.0),
        ("/tmp/mp5_qa_left.png",         ( 2.0, -0.5, -30.0), ( 2.0, -0.8, 0.0), 50.0),
        ("/tmp/mp5_qa_macro_breech.png", ( 0.8,  0.6,  14.0), ( 0.8,  0.6, 0.0), 82.0),
        ("/tmp/mp5_qa_macro_grip.png",   (-2.4, -2.5, -14.5), (-2.4, -2.5, 0.0), 80.0),
        ("/tmp/mp5_qa_macro_stock.png",  (-12.5, -0.2,  16.0), (-12.5, -0.6, 0.0), 68.0),
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
        # Atlas 1: Receiver & Sights (5 parts)
        "mp5_upper_receiver":      build_mp5_upper_receiver,
        "mp5_cocking_tube":        build_mp5_cocking_tube,
        "mp5_front_sight":         build_mp5_front_sight,
        "mp5_rear_sight":          build_mp5_rear_sight,
        "mp5_stock_endcap":        build_mp5_stock_endcap,
        # Atlas 2: Barrel, A3 Stock, Charging Handle, Roller-Delayed BCG, Trigger Pack & Curved Mag (16 parts)
        "mp5_barrel":              build_mp5_barrel,
        "mp5_buttstock":           build_mp5_buttstock,
        "mp5_charging_handle":     build_mp5_charging_handle,
        "mp5_bolt_carrier":        build_mp5_bolt_carrier,
        "mp5_bolt_head":           build_mp5_bolt_head,
        "mp5_locking_rollers":     build_mp5_locking_rollers,
        "mp5_locking_roller_left": build_mp5_locking_roller_left,
        "mp5_locking_piece":       build_mp5_locking_piece,
        "mp5_firing_pin":          build_mp5_firing_pin,
        "mp5_recoil_rod":          build_mp5_recoil_rod,
        "mp5_trigger_pack":        build_mp5_trigger_pack,
        "mp5_hammer":              build_mp5_hammer,
        "mp5_trigger":             build_mp5_trigger,
        "mp5_mag_body":            build_mp5_mag_body,
        "mp5_mag_spring":          build_mp5_mag_spring,
        "mp5_mag_floorplate":      build_mp5_mag_floorplate,
        # Atlas 3: Polymer Navy Lower, Wide Tropical Forearm, Ambi Selector & Orange Follower (4 parts)
        "mp5_grip_housing":        build_mp5_grip_housing,
        "mp5_forearm":             build_mp5_forearm,
        "mp5_selector":            build_mp5_selector,
        "mp5_mag_follower":        build_mp5_mag_follower,
    }

    print("[BUILD] Sculpting all 25 solid Heckler & Koch MP5A3 hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    furn_objs = [built[pid] for pid in FURNITURE_PARTS]
    all_objs = recv_objs + metal_objs + furn_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (5), metal (16), furniture (4)...")
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

    with tempfile.TemporaryDirectory(prefix="mp5_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking mp5_v3_receiver (2048x2048, 5 hero stamped steel & sight parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking mp5_v3_metal (2048x2048, 16 ordnance/roller-BCG/stock/mag parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking mp5_v3_furniture (2048x2048, 4 Navy lower/Tropical forearm/follower parts)...")
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir)

        print("[POST] Compositing HK Oberndorf rollmarks, Ulm proofs, Navy pictograms, mag wear & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)
    if "--preview" in sys.argv:
        render_qa_previews(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "mp5_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "mp5_v3_receiver_normal.webp",
        TEX_OUT_DIR / "mp5_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "mp5_v3_metal_albedo.webp",
        TEX_OUT_DIR / "mp5_v3_metal_normal.webp",
        TEX_OUT_DIR / "mp5_v3_metal_roughness.webp",
        TEX_OUT_DIR / "mp5_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "mp5_v3_furniture_normal.webp",
        TEX_OUT_DIR / "mp5_v3_furniture_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== HECKLER & KOCH MP5A3 V3 ASSET BUDGET ===")
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
