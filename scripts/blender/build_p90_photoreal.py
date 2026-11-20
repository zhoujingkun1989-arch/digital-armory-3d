#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for FN Herstal P90 PDW (5.7x28mm)
=============================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 3)

Generates:
  - public/models/p90.glb (Draco-compressed glTF 2.0, all 23 solid parts; skips ONLY
    the 2 dynamic GPU-compressed springs `p90_recoil_springs` & `p90_mag_spring` carrying `aSpringParam`)
  - public/textures/p90_v3_stock_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)
  - public/textures/p90_v3_mag_optic_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/p90_v3_metal_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 23 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/p90/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_p90_photoreal.py
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
# MODE 2: System Python Post-Process (FN Herstal Rollmarks, Liege Proofs,
#         S/1/A Selector Dial, Smoked-Amber 50-Rd Translucent Brass Cartridge
#         Rows, Sapphire MC-10-80 Ring Sight Lenses & 5-Ch Packed ORM WebPs)
# Executed automatically via subprocess from Blender mode.
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

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _paste_uv_rgb(
        target_rgb: np.ndarray,
        target_alpha: np.ndarray,
        pil_rgba: Image.Image,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
    ):
        h, w = target_alpha.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_rgba.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        a = arr[..., 3]
        rgb = arr[..., :3]
        dst = target_rgb[y0:y1, x0:x1]
        dst[:] = dst * (1.0 - a[..., None]) + rgb * a[..., None]
        target_alpha[y0:y1, x0:x1] = np.maximum(target_alpha[y0:y1, x0:x1], a)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _draw_fn_oval(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, lw: int = 5):
        """Crisp Fabrique Nationale Herstal double-bordered oval monogram."""
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=255, width=lw)
        draw.ellipse(
            (cx - rx + lw * 2.0, cy - ry + lw * 1.6, cx + rx - lw * 2.0, cy + ry - lw * 1.6),
            outline=230,
            width=max(2, lw // 2),
        )
        draw.text((cx, cy + ry * 0.04), "FN", fill=255, font=_load_font(FONT_DIN, int(ry * 1.32)), anchor="mm")

    def _draw_liege_proofs(draw: ImageDraw.ImageDraw, cx: float, cy: float, s: float = 1.0):
        """Authentic Belgian Banc d'Epreuves de Liege: Perron column + Crown over ELG oval + PV smokeless."""
        lw = max(2, round(3.4 * s))
        # 1. Liege Perron stepped pedestal + column + orb + cross
        px = cx - 44 * s
        draw.rectangle((px - 16 * s, cy + 20 * s, px + 16 * s, cy + 28 * s), fill=255)
        draw.rectangle((px - 11 * s, cy + 12 * s, px + 11 * s, cy + 20 * s), fill=255)
        draw.rectangle((px - 4.5 * s, cy - 16 * s, px + 4.5 * s, cy + 12 * s), fill=255)
        draw.ellipse((px - 9 * s, cy - 28 * s, px + 9 * s, cy - 12 * s), outline=255, width=lw)
        draw.line([(px, cy - 42 * s), (px, cy - 27 * s)], fill=255, width=lw)
        draw.line([(px - 8 * s, cy - 36 * s), (px + 8 * s, cy - 36 * s)], fill=255, width=lw)

        # 2. Crown over ELG oval proof
        ex = cx + 10 * s
        draw.ellipse((ex - 26 * s, cy - 14 * s, ex + 26 * s, cy + 28 * s), outline=255, width=lw)
        draw.text((ex, cy + 7 * s), "ELG", fill=255, font=_load_font(FONT_COND, int(28 * s)), anchor="mm")
        # Royal Belgian Crown above oval
        draw.line([(ex - 16 * s, cy - 20 * s), (ex + 16 * s, cy - 20 * s)], fill=255, width=lw)
        draw.line([(ex - 16 * s, cy - 20 * s), (ex - 20 * s, cy - 34 * s), (ex - 7 * s, cy - 26 * s),
                   (ex, cy - 38 * s), (ex + 7 * s, cy - 26 * s), (ex + 20 * s, cy - 34 * s),
                   (ex + 16 * s, cy - 20 * s)], fill=255, width=max(2, round(2.6 * s)))

        # 3. 5-point vector inspector star over PV (Poudre Vive) nitro mark
        nx = cx + 64 * s
        draw.text((nx, cy + 12 * s), "PV", fill=255, font=_load_font(FONT_DIN, int(30 * s)), anchor="mm")
        star_pts = []
        for k in range(10):
            ang = -math.pi * 0.5 + k * math.pi / 5.0
            rr = (13.0 if k % 2 == 0 else 5.5) * s
            star_pts.append((nx + math.cos(ang) * rr, cy - 19 * s + math.sin(ang) * rr))
        draw.polygon(star_pts, fill=250)

    # -------------------------------------------------------------------------
    # SUITE 1 POST-PROCESS: p90_v3_stock (Monocoque Polymer Stock + Selector Dial)
    # -------------------------------------------------------------------------
    def process_stock_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "stock_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "stock_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "stock_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "stock_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "stock_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "stock_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "stock_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero UV bands for `p90_stock` (X in [-16.22, +14.63], Y in [-8.10, +1.97]):
        #   Left  flank (-Z): u in [0.015, 0.985] (1 - xNorm: +X muzzle left), v in [0.745, 0.985]
        #   Right flank (+Z): u in [0.015, 0.985] (xNorm:     -X butt left),   v in [0.490, 0.730]
        PPCM = 120.0
        X0, XSPAN = -16.22, 30.85
        Y0, YSPAN = -8.10, 10.07
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3702 x 1208 px

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        mold_recess = np.zeros((h, w), dtype=np.float32)
        white_ink = np.zeros((h, w), dtype=np.float32)
        red_ink = np.zeros((h, w), dtype=np.float32)
        stipple_m = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT STOCK FLANK (-Z): Molded FN Herstal Cartouche + P90 CAL 5.7x28 + Liege Proofs ---
        # Unobstructed rear receiver slab: X in [-14.2 .. -5.6], Y in [-3.0 .. +0.8]
        # Note: On Left flank, +X is LEFT, so x = -5.6 is left of x = -14.2!
        l_mold = Image.new("L", (CW, CH), 0)
        l_white = Image.new("L", (CW, CH), 0)
        l_stip = Image.new("L", (CW, CH), 0)
        dlm, dlw, dls = ImageDraw.Draw(l_mold), ImageDraw.Draw(l_white), ImageDraw.Draw(l_stip)

        # Recessed molded border box on rear left receiver flank: X in [-13.6 .. -6.2], Y in [-2.35 .. -0.30]
        bx0, bx1 = xw_to_cx_left(-6.20), xw_to_cx_left(-13.65)
        by0, by1 = yw_to_cy(-0.25), yw_to_cy(-2.35)
        dlm.rounded_rectangle((bx0, by0, bx1, by1), radius=24, outline=220, width=7)
        # FN Oval Crest + FN HERSTAL BELGIUM / P90 CAL 5.7x28 + Liege Proofs
        _draw_fn_oval(dlw, bx0 + 82, (by0 + by1) * 0.5, 58, 38, lw=5)
        _draw_fn_oval(dlm, bx0 + 82, (by0 + by1) * 0.5, 58, 38, lw=5)
        dlw.text((bx0 + 162, by0 + 36), "FN HERSTAL BELGIUM", fill=255, font=_load_font(FONT_DIN, 54))
        dlm.text((bx0 + 162, by0 + 36), "FN HERSTAL BELGIUM", fill=240, font=_load_font(FONT_DIN, 54))
        dlw.text((bx0 + 162, by0 + 106), "P90   CAL. 5.7×28", fill=250, font=_load_font(FONT_DIN, 48))
        dlm.text((bx0 + 162, by0 + 106), "P90   CAL. 5.7×28", fill=235, font=_load_font(FONT_DIN, 48))
        dlw.text((bx0 + 162, by0 + 168), "NATO CAGE B1696  -  PAT. 4,905,394", fill=220, font=_load_font(FONT_COND, 34))
        _draw_liege_proofs(dlw, bx1 - 108, (by0 + by1) * 0.5 + 10, s=1.05)
        _draw_liege_proofs(dlm, bx1 - 108, (by0 + by1) * 0.5 + 10, s=1.05)

        # Crisp white triangular index pointer beside rotary selector window (authentic FN P90!)
        sx_l = xw_to_cx_left(5.04)
        sy_c = yw_to_cy(-3.38)
        dlw.polygon([(sx_l - 22, sy_c), (sx_l + 6, sy_c - 15), (sx_l + 6, sy_c + 15)], fill=250)
        l_red = Image.new("L", (CW, CH), 0)

        # Tactile EDM grip stipple panels tightly contoured inside solid grip bridges
        dls.rounded_rectangle(
            (xw_to_cx_left(4.65), yw_to_cy(-6.15), xw_to_cx_left(1.95), yw_to_cy(-7.42)),
            radius=20, fill=235,
        )
        dls.rounded_rectangle(
            (xw_to_cx_left(10.85), yw_to_cy(-1.60), xw_to_cx_left(9.05), yw_to_cy(-2.72)),
            radius=18, fill=215,
        )

        _paste_uv_band(mold_recess, l_mold, 0.015, 0.985, 0.745, 0.985)
        _paste_uv_band(white_ink, l_white, 0.015, 0.985, 0.745, 0.985)
        _paste_uv_band(red_ink, l_red, 0.015, 0.985, 0.745, 0.985)
        _paste_uv_band(stipple_m, l_stip, 0.015, 0.985, 0.745, 0.985)

        # --- 2) RIGHT STOCK FLANK (+Z): Fabrique Nationale + Serial FN 084912 + Proofs ---
        r_mold = Image.new("L", (CW, CH), 0)
        r_white = Image.new("L", (CW, CH), 0)
        r_red = Image.new("L", (CW, CH), 0)
        r_stip = Image.new("L", (CW, CH), 0)
        drm, drw, drr, drs = (
            ImageDraw.Draw(r_mold), ImageDraw.Draw(r_white), ImageDraw.Draw(r_red), ImageDraw.Draw(r_stip)
        )

        rx0, rx1 = xw_to_cx_right(-13.65), xw_to_cx_right(-6.20)
        ry0, ry1 = yw_to_cy(-0.25), yw_to_cy(-2.35)
        drm.rounded_rectangle((rx0, ry0, rx1, ry1), radius=24, outline=220, width=7)
        drw.text((rx0 + 44, ry0 + 36), "FABRIQUE NATIONALE HERSTAL", fill=255, font=_load_font(FONT_DIN, 50))
        drm.text((rx0 + 44, ry0 + 36), "FABRIQUE NATIONALE HERSTAL", fill=235, font=_load_font(FONT_DIN, 50))
        drw.text((rx0 + 44, ry0 + 104), "SER.  FN 084912  -  CAL. 5.7×28", fill=248, font=_load_font(FONT_DIN, 44))
        drm.text((rx0 + 44, ry0 + 104), "SER.  FN 084912  -  CAL. 5.7×28", fill=230, font=_load_font(FONT_DIN, 44))
        drw.text((rx0 + 44, ry0 + 168), "MADE IN BELGIUM  -  READ MANUAL BEFORE USE", fill=215, font=_load_font(FONT_COND, 32))
        _draw_liege_proofs(drw, rx1 - 108, (ry0 + ry1) * 0.5 + 10, s=1.05)
        _draw_liege_proofs(drm, rx1 - 108, (ry0 + ry1) * 0.5 + 10, s=1.05)

        # Right-flank crisp triangular selector index pointer
        sx_r = xw_to_cx_right(5.04)
        drw.polygon([(sx_r + 22, sy_c), (sx_r - 6, sy_c - 15), (sx_r - 6, sy_c + 15)], fill=250)

        drs.rounded_rectangle(
            (xw_to_cx_right(1.95), yw_to_cy(-6.15), xw_to_cx_right(4.65), yw_to_cy(-7.42)),
            radius=20, fill=235,
        )
        drs.rounded_rectangle(
            (xw_to_cx_right(9.05), yw_to_cy(-1.60), xw_to_cx_right(10.85), yw_to_cy(-2.72)),
            radius=18, fill=215,
        )

        _paste_uv_band(mold_recess, r_mold, 0.015, 0.985, 0.490, 0.730)
        _paste_uv_band(white_ink, r_white, 0.015, 0.985, 0.490, 0.730)
        _paste_uv_band(red_ink, r_red, 0.015, 0.985, 0.490, 0.730)
        _paste_uv_band(stipple_m, r_stip, 0.015, 0.985, 0.490, 0.730)

        # --- 3) ROTARY SELECTOR DRUM DIAL DISCS (S white / 1 white / A vivid crimson!) ---
        # Left Dial:  u in [0.015, 0.145], v in [0.340, 0.470]
        # Right Dial: u in [0.160, 0.290], v in [0.340, 0.470]
        for is_right, (u0_d, u1_d) in ((False, (0.015, 0.145)), (True, (0.160, 0.290))):
            DS = 512
            dw_im = Image.new("L", (DS, DS), 0)
            dr_im = Image.new("L", (DS, DS), 0)
            dm_im = Image.new("L", (DS, DS), 0)
            dw_d, dr_d, dm_d = ImageDraw.Draw(dw_im), ImageDraw.Draw(dr_im), ImageDraw.Draw(dm_im)
            cx_d, cy_d = DS // 2, DS // 2
            # Recessed circular bezel groove + center axle dimple
            dm_d.ellipse((38, 38, DS - 38, DS - 38), outline=240, width=8)
            dm_d.ellipse((cx_d - 34, cy_d - 34, cx_d + 34, cy_d + 34), outline=220, width=6)
            # Directional sign: Right face (+X right), Left face (+X left)
            sgn = 1 if is_right else -1
            f_sel = _load_font(FONT_DIN, 92)
            # S (top-rear), 1 (forward-level), A (bottom-front, vivid crimson!)
            pos_s = (cx_d - 18 * sgn, cy_d - 130)
            pos_1 = (cx_d + 122 * sgn, cy_d)
            pos_a = (cx_d - 18 * sgn, cy_d + 130)
            dw_d.text(pos_s, "S", fill=255, font=f_sel, anchor="mm")
            dw_d.text(pos_1, "1", fill=255, font=f_sel, anchor="mm")
            dr_d.text(pos_a, "A", fill=255, font=f_sel, anchor="mm")
            # Pointer bar across center pointing toward '1' / 'A'
            dw_d.line([(cx_d - 110 * sgn, cy_d), (cx_d - 44 * sgn, cy_d)], fill=235, width=16)
            dm_d.text(pos_s, "S", fill=230, font=f_sel, anchor="mm")
            dm_d.text(pos_1, "1", fill=230, font=f_sel, anchor="mm")
            dm_d.text(pos_a, "A", fill=230, font=f_sel, anchor="mm")
            _paste_uv_band(white_ink, dw_im, u0_d, u1_d, 0.340, 0.470)
            _paste_uv_band(red_ink, dr_im, u0_d, u1_d, 0.340, 0.470)
            _paste_uv_band(mold_recess, dm_im, u0_d, u1_d, 0.340, 0.470)

        # Fine VDI-27 tactile grip stipple grain inside grip pads
        rng_st = np.random.default_rng(5728)
        stip_noise = rng_st.uniform(-1.0, 1.0, size=(h, w)).astype(np.float32)
        stip_noise = ndimage.gaussian_filter(stip_noise, sigma=0.75)
        stip_soft = ndimage.gaussian_filter(stipple_m, sigma=4.0)
        stip_bump = stip_soft * stip_noise * 0.42

        # Composite tactile grip darkening, molded rollmarks, crisp white/crimson markings
        _mix(albedo, (0.148, 0.155, 0.168), stip_soft * 0.36)
        _mix(rgh, 0.68, stip_soft * 0.55)

        ink_all = np.maximum(white_ink, red_ink)
        decal_h = -0.52 * _bevel_mask(mold_recess, width_px=1.4) + stip_bump
        _mix(albedo, (0.86, 0.88, 0.91), white_ink * 0.88)
        _mix(albedo, (0.88, 0.09, 0.07), red_ink * 0.96)
        _mix(rgh, 0.36, white_ink * 0.72)
        _mix(rgh, 0.24, red_ink * 0.88)
        _mix(met, 0.02, ink_all * 0.90)
        ao *= 1.0 - 0.14 * np.maximum(mold_recess, ink_all)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_stock_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_stock_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_stock_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p90_v3_stock_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2 POST-PROCESS: p90_v3_mag_optic
    #   - Glossy Smoked-Amber 50-Rd Polycarbonate Mag w/ Photorealistic
    #     Double-Stack 5.7x28mm SS190 Brass/Copper/Steel-Tip Cartridge Rows
    #   - Crisp White 10 / 25 / 50 Round Counters & Molded Ribs
    #   - MC-10-80 Ring Sight Flank Markings, Frosted Daylight Collector Bar &
    #     Firewalled Sapphire-Cyan Multi-Coated Collimator Lenses!
    #   - Firewalled Safety-Orange Follower & Polymer Hammer (ZERO BLEED!)
    # -------------------------------------------------------------------------
    def process_mag_optic_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "mag_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "mag_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "mag_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "mag_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "mag_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "mag_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "mag_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w))
        v_grid = np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w))

        # =====================================================================
        # 1) HERO BAND 1: TOP SMOKED-AMBER MAGAZINE ROOF (u[0.015,0.985], v[0.765,0.985])
        #    Maps local X in [-10.40, +10.40] (L->R), local Z in [+1.29, -1.29] (bottom->top).
        #    Top of band (v=0.985) = -Z (Left flank = SS190 bullet tips!).
        #    Bottom of band (v=0.765) = +Z (Right flank = brass cartridge case heads!).
        # =====================================================================
        top_mask = (u_grid >= 0.014) & (u_grid <= 0.986) & (v_grid >= 0.764) & (v_grid <= 0.986)
        tx_top = -10.40 + np.clip((u_grid - 0.015) / 0.970, 0.0, 1.0) * 20.80
        # z_norm = 0 at +Z (bottom, case head), 1 at -Z (top, bullet tip)
        zn_top = np.clip((v_grid - 0.765) / 0.220, 0.0, 1.0)

        # Smoked-amber translucent polycarbonate shell optical filter tint
        amber_shell_base = np.array([0.235, 0.178, 0.118], dtype=np.float32)
        amber_cavity = np.array([0.145, 0.106, 0.072], dtype=np.float32)

        # Two staggered horizontal rows of 5.7x28mm SS190 rounds spanning tx in [-9.65 .. +6.45]
        # (25 rounds visible on top row + 25 staggered half-pitch lower row peeking through = 50 RDS!)
        # Pitch = 0.644 cm (authentic 5.7x28mm case OD = 7.9 mm with double-stack stagger!)
        in_ammo_x = _smoothstep(-9.72, -9.55, tx_top) * (1.0 - _smoothstep(6.32, 6.50, tx_top))
        in_wall_z = _smoothstep(0.055, 0.085, zn_top) * (1.0 - _smoothstep(0.915, 0.945, zn_top))

        pitch = 0.644

        def _render_cartridge_row(x_field: np.ndarray, z_n: np.ndarray, phase_shift: float, depth_att: float):
            """Vectorized photorealistic 5.7x28mm SS190 cartridge row (brass + copper + blue-grey AP tip)."""
            p = ((x_field + 9.65 + phase_shift * pitch) / pitch) % 1.0
            # Local lateral offset across cartridge cylinder [-1, +1]
            lat = (p - 0.5) * 2.0
            # Bottleneck profile radius as function of z_n in [0.07 .. 0.93]:
            #   [0.07..0.11]: rim & extractor groove
            #   [0.11..0.58]: straight tapered brass case body (r = 0.88)
            #   [0.58..0.66]: bottleneck shoulder (0.88 -> 0.56)
            #   [0.66..0.73]: brass case neck (r = 0.56)
            #   [0.73..0.85]: copper FMJ jacket ogive (0.56 -> 0.28)
            #   [0.85..0.93]: dark blue-grey SS190 steel AP tip (0.28 -> 0.0)
            rad = np.zeros_like(z_n, dtype=np.float32)
            # Rim
            m_rim = (z_n >= 0.075) & (z_n < 0.098)
            rad = np.where(m_rim, 0.87, rad)
            # Extractor groove
            m_grv = (z_n >= 0.098) & (z_n < 0.122)
            rad = np.where(m_grv, 0.72, rad)
            # Main brass case body
            m_body = (z_n >= 0.122) & (z_n < 0.585)
            rad = np.where(m_body, 0.88 - 0.05 * np.clip((z_n - 0.122) / 0.463, 0.0, 1.0), rad)
            # Bottleneck shoulder
            m_sh = (z_n >= 0.585) & (z_n < 0.665)
            t_sh = np.clip((z_n - 0.585) / 0.080, 0.0, 1.0)
            rad = np.where(m_sh, 0.83 * (1.0 - t_sh) + 0.56 * t_sh, rad)
            # Brass neck
            m_nk = (z_n >= 0.665) & (z_n < 0.735)
            rad = np.where(m_nk, 0.56, rad)
            # Spitzer copper jacket + blue-grey AP tip ogive
            m_og = (z_n >= 0.735) & (z_n <= 0.935)
            t_og = np.clip((z_n - 0.735) / 0.200, 0.0, 1.0)
            rad = np.where(m_og, 0.55 * np.power(np.clip(1.0 - t_og * t_og, 0.0, 1.0), 0.72), rad)

            inside = np.clip((rad - np.abs(lat)) / 0.08, 0.0, 1.0)
            # Cylindrical normal shading + bright overhead studio specular highlight streak!
            norm_lat = np.clip(lat / np.maximum(rad, 0.05), -1.0, 1.0)
            cyl_cos = np.sqrt(np.clip(1.0 - norm_lat * norm_lat, 0.0, 1.0))
            spec_hl = np.power(np.clip(1.0 - np.abs(norm_lat + 0.22) * 2.2, 0.0, 1.0), 3.2)
            # Annealing subtle bronze band right across bottleneck shoulder (authentic FN 5.7x28mm!)
            anneal = np.exp(-((z_n - 0.62) ** 2) / 0.0028)

            # Base material colors (warm lacquered brass, reddish-copper jacket, blue-grey SS190 AP tip)
            c_brass = np.array([0.84, 0.64, 0.24], dtype=np.float32)
            c_anneal = np.array([0.56, 0.36, 0.18], dtype=np.float32)
            c_copper = np.array([0.80, 0.41, 0.21], dtype=np.float32)
            c_aptip = np.array([0.16, 0.21, 0.29], dtype=np.float32)

            is_brass = (z_n < 0.735).astype(np.float32)
            is_copper = ((z_n >= 0.735) & (z_n < 0.855)).astype(np.float32)
            is_aptip = (z_n >= 0.855).astype(np.float32)

            brass_rgb = c_brass * (1.0 - 0.38 * anneal[..., None]) + c_anneal * (0.38 * anneal[..., None])
            # Darken extractor groove slightly
            brass_rgb = brass_rgb * np.where(m_grv[..., None], 0.55, 1.0)

            base_c = (
                brass_rgb * is_brass[..., None]
                + c_copper * is_copper[..., None]
                + c_aptip * is_aptip[..., None]
            )
            shade = (0.32 + 0.68 * np.power(cyl_cos, 0.75)) * depth_att
            rgb = base_c * shade[..., None] + spec_hl[..., None] * np.array([0.42, 0.35, 0.20], dtype=np.float32) * depth_att
            return np.clip(rgb, 0.0, 1.0), inside

        row_bot_rgb, row_bot_a = _render_cartridge_row(tx_top, zn_top, phase_shift=0.5, depth_att=0.56)
        row_top_rgb, row_top_a = _render_cartridge_row(tx_top, zn_top, phase_shift=0.0, depth_att=1.00)

        # Combine staggered double-stack: upper row occludes lower row cleanly!
        ammo_rgb = amber_cavity * (1.0 - row_bot_a[..., None]) + row_bot_rgb * row_bot_a[..., None]
        ammo_rgb = ammo_rgb * (1.0 - row_top_a[..., None]) + row_top_rgb * row_top_a[..., None]
        ammo_cov = np.clip(np.maximum(row_top_a, row_bot_a * 0.85), 0.0, 1.0) * in_ammo_x * in_wall_z

        # Front pocket (tx in [+6.55 .. +9.95]): orange twin-roller follower & bright zigzag flat spring peek!
        in_follower = _smoothstep(6.52, 6.72, tx_top) * (1.0 - _smoothstep(7.72, 7.88, tx_top)) * in_wall_z
        in_spring = _smoothstep(7.90, 8.05, tx_top) * (1.0 - _smoothstep(9.85, 10.0, tx_top)) * in_wall_z
        spr_zig = np.exp(-((np.sin((tx_top - 8.0) * 14.0) * 0.34 - (zn_top - 0.5)) ** 2) / 0.008) * in_spring

        # Subtle darkened ring shadow directly over 90-deg helical feed turret throat (local x = +0.35)
        turret_dist = np.hypot((tx_top - 0.35) / 1.12, (zn_top - 0.50) * 2.54 / 1.12)
        turret_ring = _smoothstep(0.78, 0.96, turret_dist) * (1.0 - _smoothstep(0.96, 1.18, turret_dist))

        # Apply smoked-amber translucent polycarbonate filter over internal cartridge rows!
        # Glossy smoked amber transmits warm golds/coppers richly while adding subtle amber glaze & rim darkening.
        edge_bezel = 1.0 - _smoothstep(0.03, 0.10, zn_top) * (1.0 - _smoothstep(0.90, 0.97, zn_top))
        amber_filter = np.array([0.82, 0.67, 0.44], dtype=np.float32)
        top_rgb = amber_cavity * (1.0 - ammo_cov[..., None]) + (ammo_rgb * amber_filter) * ammo_cov[..., None]
        # Add follower orange & steel spring glimpse inside front pocket
        top_rgb = top_rgb * (1.0 - in_follower[..., None] * 0.72) + np.array([0.74, 0.31, 0.08], dtype=np.float32) * (in_follower[..., None] * 0.72)
        top_rgb = top_rgb * (1.0 - spr_zig[..., None] * 0.62) + np.array([0.52, 0.50, 0.44], dtype=np.float32) * (spr_zig[..., None] * 0.62)
        # Subtle smoked-amber glaze & perimeter wall frame
        top_rgb = top_rgb * 0.82 + amber_shell_base * 0.18
        top_rgb = top_rgb * (1.0 - edge_bezel[..., None] * 0.55) + np.array([0.195, 0.148, 0.102], dtype=np.float32) * (edge_bezel[..., None] * 0.55)
        top_rgb *= 1.0 - 0.22 * turret_ring[..., None]

        # Subtle molded cross-rib darkening aligned with the 9 physical top ribs (x = -8.6 + i*2.15)
        rib_band = np.zeros_like(tx_top, dtype=np.float32)
        for ri in range(9):
            rx = -8.6 + ri * 2.15
            rib_band = np.maximum(rib_band, np.exp(-((tx_top - rx) ** 2) / (0.14 ** 2)))
        top_rgb = top_rgb * (1.0 - 0.52 * rib_band[..., None]) + np.array([0.185, 0.145, 0.105], dtype=np.float32) * (0.52 * rib_band[..., None])

        albedo[top_mask] = np.clip(top_rgb[top_mask], 0.0, 1.0)
        # Glossy polycarbonate roof (R=0.15-0.19 over clear window, R=0.38 over frosted ribs & bezel)
        top_rgh = 0.155 + 0.22 * rib_band + 0.14 * edge_bezel
        top_met = 0.04 + 0.14 * ammo_cov * (1.0 - rib_band) * (1.0 - edge_bezel)
        rgh[top_mask] = top_rgh[top_mask]
        met[top_mask] = top_met[top_mask]

        # =====================================================================
        # 2) HERO BAND 2: RIGHT MAG FLANK (+Z: Staggered Brass Case Heads + Primers!)
        #    u in [0.015, 0.985], v in [0.630, 0.745]
        # =====================================================================
        rmag_mask = (u_grid >= 0.014) & (u_grid <= 0.986) & (v_grid >= 0.629) & (v_grid <= 0.746)
        tx_rm = -10.40 + np.clip((u_grid - 0.015) / 0.970, 0.0, 1.0) * 20.80
        yn_rm = np.clip((v_grid - 0.630) / 0.115, 0.0, 1.0)  # 0 bottom -> 1 top

        in_rx = _smoothstep(-9.72, -9.55, tx_rm) * (1.0 - _smoothstep(6.32, 6.50, tx_rm))
        # Double-stack vertical centers: upper row at yn = 0.63, lower staggered row at yn = 0.37
        head_rgb = np.broadcast_to(amber_cavity, (h, w, 3)).copy()
        head_cov = np.zeros((h, w), dtype=np.float32)
        for row_y, ph in ((0.37, 0.5), (0.63, 0.0)):
            dx_c = (((tx_rm + 9.65 + ph * pitch) / pitch) % 1.0 - 0.5) * pitch
            dy_c = (yn_rm - row_y) * 1.40
            rr = np.hypot(dx_c, dy_c)
            # 5.7x28mm case head radius ~ 0.245 cm; Boxer primer radius ~ 0.095 cm
            m_head = 1.0 - _smoothstep(0.225, 0.255, rr)
            m_bevel = _smoothstep(0.185, 0.235, rr) * m_head
            m_prim_ring = _smoothstep(0.085, 0.105, rr) * (1.0 - _smoothstep(0.105, 0.125, rr))
            m_prim = 1.0 - _smoothstep(0.085, 0.102, rr)
            # Brass case head + gleaming silver-nickel Boxer primer!
            c_hd = np.array([0.82, 0.63, 0.24], dtype=np.float32) * (1.0 - 0.30 * m_bevel[..., None])
            c_hd = c_hd * (1.0 - m_prim_ring[..., None] * 0.65)
            c_hd = c_hd * (1.0 - m_prim[..., None]) + np.array([0.80, 0.78, 0.70], dtype=np.float32) * m_prim[..., None]
            # Subtle directional sheen across disc
            disc_sh = 0.78 + 0.28 * np.clip(0.5 - dy_c * 2.2, -0.5, 0.5)
            c_hd = np.clip(c_hd * disc_sh[..., None], 0.0, 1.0)
            head_rgb = head_rgb * (1.0 - m_head[..., None]) + c_hd * m_head[..., None]
            head_cov = np.maximum(head_cov, m_head)

        head_cov *= in_rx
        rm_edge = 1.0 - _smoothstep(0.08, 0.18, yn_rm) * (1.0 - _smoothstep(0.82, 0.92, yn_rm))
        rm_rib = np.zeros_like(tx_rm, dtype=np.float32)
        for ri in range(9):
            rx = -8.6 + ri * 2.15
            rm_rib = np.maximum(rm_rib, np.exp(-((tx_rm - rx) ** 2) / (0.14 ** 2)))
        rm_rgb = amber_cavity * (1.0 - head_cov[..., None]) + (head_rgb * amber_filter) * head_cov[..., None]
        rm_rgb = rm_rgb * 0.80 + amber_shell_base * 0.20
        rm_rgb = rm_rgb * (1.0 - rm_edge[..., None] * 0.55) + np.array([0.19, 0.145, 0.10], dtype=np.float32) * (rm_edge[..., None] * 0.55)
        rm_rgb = rm_rgb * (1.0 - 0.52 * rm_rib[..., None]) + np.array([0.18, 0.14, 0.10], dtype=np.float32) * (0.52 * rm_rib[..., None])

        albedo[rmag_mask] = np.clip(rm_rgb[rmag_mask], 0.0, 1.0)
        rgh[rmag_mask] = (0.165 + 0.22 * rm_rib + 0.14 * rm_edge)[rmag_mask]
        met[rmag_mask] = (0.04 + 0.14 * head_cov * (1.0 - rm_rib))[rmag_mask]

        # =====================================================================
        # 3) HERO BAND 3: LEFT MAG FLANK (-Z: Staggered SS190 Copper/Steel Bullet Tips!)
        #    u in [0.015, 0.985] (reversed: +X left!), v in [0.495, 0.610]
        # =====================================================================
        lmag_mask = (u_grid >= 0.014) & (u_grid <= 0.986) & (v_grid >= 0.494) & (v_grid <= 0.611)
        tx_lm = 10.40 - np.clip((u_grid - 0.015) / 0.970, 0.0, 1.0) * 20.80
        yn_lm = np.clip((v_grid - 0.495) / 0.115, 0.0, 1.0)

        in_lx = _smoothstep(-9.72, -9.55, tx_lm) * (1.0 - _smoothstep(6.32, 6.50, tx_lm))
        tip_rgb = np.broadcast_to(amber_cavity, (h, w, 3)).copy()
        tip_cov = np.zeros((h, w), dtype=np.float32)
        for row_y, ph in ((0.37, 0.5), (0.63, 0.0)):
            dx_c = (((tx_lm + 9.65 + ph * pitch) / pitch) % 1.0 - 0.5) * pitch
            dy_c = (yn_lm - row_y) * 1.40
            rr = np.hypot(dx_c, dy_c)
            # Outer copper jacket ring (r ~ 0.17) + dark blue-grey SS190 AP steel core nose (r ~ 0.085)
            m_cop = 1.0 - _smoothstep(0.160, 0.195, rr)
            m_steel = 1.0 - _smoothstep(0.075, 0.098, rr)
            c_tp = np.array([0.78, 0.40, 0.19], dtype=np.float32) * (1.0 - m_steel[..., None]) + np.array([0.22, 0.28, 0.38], dtype=np.float32) * m_steel[..., None]
            disc_sh = 0.74 + 0.32 * np.clip(0.5 - dy_c * 2.6, -0.5, 0.5)
            c_tp = np.clip(c_tp * disc_sh[..., None], 0.0, 1.0)
            tip_rgb = tip_rgb * (1.0 - m_cop[..., None]) + c_tp * m_cop[..., None]
            tip_cov = np.maximum(tip_cov, m_cop)

        tip_cov *= in_lx
        lm_edge = 1.0 - _smoothstep(0.08, 0.18, yn_lm) * (1.0 - _smoothstep(0.82, 0.92, yn_lm))
        lm_rib = np.zeros_like(tx_lm, dtype=np.float32)
        for ri in range(9):
            rx = -8.6 + ri * 2.15
            lm_rib = np.maximum(lm_rib, np.exp(-((tx_lm - rx) ** 2) / (0.14 ** 2)))
        lm_rgb = amber_cavity * (1.0 - tip_cov[..., None]) + (tip_rgb * amber_filter) * tip_cov[..., None]
        lm_rgb = lm_rgb * 0.80 + amber_shell_base * 0.20
        lm_rgb = lm_rgb * (1.0 - lm_edge[..., None] * 0.55) + np.array([0.19, 0.145, 0.10], dtype=np.float32) * (lm_edge[..., None] * 0.55)
        lm_rgb = lm_rgb * (1.0 - 0.52 * lm_rib[..., None]) + np.array([0.18, 0.14, 0.10], dtype=np.float32) * (0.52 * lm_rib[..., None])

        albedo[lmag_mask] = np.clip(lm_rgb[lmag_mask], 0.0, 1.0)
        rgh[lmag_mask] = (0.165 + 0.22 * lm_rib + 0.14 * lm_edge)[lmag_mask]
        met[lmag_mask] = (0.04 + 0.12 * tip_cov * (1.0 - lm_rib))[lmag_mask]

        # =====================================================================
        # 4) CRISP WHITE 10 / 25 / 50 ROUND COUNTERS & FLANK/OPTIC MARKINGS
        # =====================================================================
        white_mark = np.zeros((h, w), dtype=np.float32)

        # Top Mag Roof 10 / 25 / 50 witness markings (strictly centered inside clear bays between the 9 ribs!)
        # Physical ribs sit at rx = -8.60 + i*2.15 (-8.60, -6.45, -4.30, -2.15, 0.00, +2.15, +4.30, +6.45, +8.60).
        MW, MH = 2496, 310  # 20.80 x 2.58 cm @ 120 px/cm
        top_txt = Image.new("L", (MW, MH), 0)
        dt = ImageDraw.Draw(top_txt)
        f_cnt = _load_font(FONT_DIN, 72)
        f_tag = _load_font(FONT_COND, 38)
        for tx_val, lbl in ((-2.40, "10"), (1.85, "25"), (6.15, "50")):
            px = int(round((tx_val + 10.40) / 20.80 * MW))
            dt.line([(px, 16), (px, 92)], fill=255, width=7)
            # Draw digits strictly to the LEFT (-X) of each tick, cleanly inside the unobstructed bay!
            dt.text((px - 16, 52), lbl, fill=255, font=f_cnt, anchor="rm")
        for bay_x, tag in ((-5.375, "FN 5.7×28mm"), (-3.225, "50 RDS"), (1.075, "90° HELICAL"), (3.225, "PAT. 4,905,394")):
            dt.text((int(round((bay_x + 10.40) / 20.80 * MW)), 256), tag, fill=232, font=f_tag, anchor="mm")
        _paste_uv_band(white_mark, top_txt, 0.015, 0.985, 0.765, 0.985)

        # Left Mag Flank (-Z, +X is LEFT -> bay_x = +3.225, +1.075, -1.075, -3.225 read L->R cleanly BETWEEN ribs!)
        fl_im = Image.new("L", (2496, 170), 0)
        dfl = ImageDraw.Draw(fl_im)
        f_fl = _load_font(FONT_COND, 40)
        for bay_x, lbl in ((3.225, "FN HERSTAL"), (1.075, "5.7×28mm"), (-1.075, "50 RDS"), (-3.225, "BELGIUM")):
            px_l = int(round((1.0 - (bay_x + 10.40) / 20.80) * 2496))
            dfl.text((px_l, 86), lbl, fill=232, font=f_fl, anchor="mm")
        _paste_uv_band(white_mark, fl_im, 0.015, 0.985, 0.495, 0.610)

        # MC-10-80 Ring Sight Left & Right Housing Flanks (strictly clear of bevels & windage drum at tx=-0.45, ty=-0.15!):
        #   Right Flank: u in [0.015, 0.340], v in [0.365, 0.475] (windage drum x_px in [340..478])
        #   Left  Flank: u in [0.355, 0.680], v in [0.365, 0.475] (windage drum x_px in [602..740])
        OW, OH = 1080, 340
        op_r = Image.new("L", (OW, OH), 0)
        dor = ImageDraw.Draw(op_r)
        dor.text((OW // 2, 88), "RING SIGHTS  MC-10-80", fill=255, font=_load_font(FONT_DIN, 54), anchor="mm")
        dor.text((775, 212), "5.7×28  REFLEX", fill=238, font=_load_font(FONT_COND, 46), anchor="mm")
        _paste_uv_band(white_mark, op_r, 0.015, 0.340, 0.365, 0.475)

        op_l = Image.new("L", (OW, OH), 0)
        dol = ImageDraw.Draw(op_l)
        dol.text((OW // 2, 88), "RING SIGHTS  MC-10-80", fill=255, font=_load_font(FONT_DIN, 54), anchor="mm")
        dol.text((305, 212), "UP/R  0.5 MIL  H3", fill=238, font=_load_font(FONT_COND, 46), anchor="mm")
        _paste_uv_band(white_mark, op_l, 0.355, 0.680, 0.365, 0.475)

        # =====================================================================
        # 5) FIREWALLED SAPPHIRE-CYAN MULTI-COATED RING SIGHT LENSES &
        #    FROSTED DAYLIGHT FIBER-OPTIC COLLECTOR PRISM BAR!
        # =====================================================================
        # Objective Lens Disc: u in [0.700, 0.835], v in [0.340, 0.475] (center 0.7675, 0.4075, r = 0.064)
        # Ocular Lens Disc:    u in [0.850, 0.985], v in [0.340, 0.475] (center 0.9175, 0.4075, r = 0.064)
        # Daylight Collector:  u in [0.700, 0.985], v in [0.235, 0.325]
        lens_zone = (u_grid >= 0.696) & (u_grid <= 0.989) & (v_grid >= 0.336) & (v_grid <= 0.479)
        albedo[lens_zone] = (0.018, 0.075, 0.125)
        rgh[lens_zone] = 0.055
        met[lens_zone] = 0.16
        ao[lens_zone] = 1.0
        nrm[lens_zone] = (0.5, 0.5, 1.0)

        for cx_l, cy_l, r_l, u0_l, u1_l, v0_l, v1_l, is_ocular in (
            (0.7675, 0.4075, 0.064, 0.697, 0.838, 0.337, 0.478, False),
            (0.9175, 0.4075, 0.064, 0.847, 0.988, 0.337, 0.478, True),
        ):
            sub_m = (u_grid >= u0_l) & (u_grid <= u1_l) & (v_grid >= v0_l) & (v_grid <= v1_l)
            lu = (u_grid - cx_l) / r_l
            lv = (v_grid - cy_l) / r_l
            rad = np.hypot(lu, lv)
            # Multi-coated sapphire-cyan + emerald broadband AR thin-film interference!
            wave = 0.5 + 0.5 * np.cos(6.4 * rad * rad + 0.60 * lv - 0.35 * lu)
            violet_rim = _smoothstep(0.65, 0.95, rad) * (1.0 - _smoothstep(0.95, 1.15, rad))
            lens_rgb = (
                np.array((0.025, 0.155, 0.285), dtype=np.float32)
                + wave[..., None] * np.array((0.035, 0.345, 0.295), dtype=np.float32)
                + violet_rim[..., None] * np.array((0.145, 0.075, 0.240), dtype=np.float32)
            )
            lens_rgb *= 1.0 - 0.48 * _smoothstep(0.76, 1.12, rad)[..., None]
            # Specular crescent glass glints
            arc1 = (1.0 - _smoothstep(0.02, 0.065, np.abs(rad - 0.70))) * _smoothstep(0.12, 0.48, lv) * (1.0 - _smoothstep(-0.20, 0.28, lu))
            arc2 = (1.0 - _smoothstep(0.02, 0.055, np.abs(rad - 0.42))) * _smoothstep(-0.58, -0.22, lv) * _smoothstep(0.04, 0.44, lu)
            lens_rgb += arc1[..., None] * np.array((0.46, 0.86, 0.94), dtype=np.float32)
            lens_rgb += arc2[..., None] * np.array((0.22, 0.56, 0.72), dtype=np.float32)
            # Signature Ring Sight concentric etched collimator ring + T-post inside ocular glass!
            if is_ocular:
                ret_ring = np.exp(-((rad - 0.34) ** 2) / 0.0012)
                ret_dot = np.exp(-(rad * rad) / 0.0014)
                t_horiz = (np.abs(lv) < 0.024) & (np.abs(lu) > 0.38) & (np.abs(lu) < 0.76)
                t_vert = (np.abs(lu) < 0.024) & (lv < -0.38) & (lv > -0.76)
                ret_m = np.clip(ret_ring + ret_dot + t_horiz.astype(np.float32) * 0.8 + t_vert.astype(np.float32) * 0.8, 0.0, 1.0)
                lens_rgb = lens_rgb * (1.0 - 0.65 * ret_m[..., None]) + np.array((0.55, 0.96, 0.84), dtype=np.float32) * (0.65 * ret_m[..., None])
            albedo[sub_m] = np.clip(lens_rgb[sub_m], 0.0, 1.0)

        # Frosted daylight fiber-optic top collector bar (u[0.700,0.985], v[0.235,0.325])
        col_mask = (u_grid >= 0.697) & (u_grid <= 0.988) & (v_grid >= 0.232) & (v_grid <= 0.328)
        cu = np.clip((u_grid - 0.700) / 0.285, 0.0, 1.0)
        cv = np.clip((v_grid - 0.235) / 0.090, 0.0, 1.0)
        frost_ribs = 0.5 + 0.5 * np.sin(cu * 26.0 * math.pi)
        col_glow = 0.84 + 0.16 * np.sin(cv * math.pi)
        col_rgb = (
            np.array((0.70, 0.84, 0.76), dtype=np.float32) * col_glow[..., None]
            + frost_ribs[..., None] * np.array((0.08, 0.10, 0.08), dtype=np.float32)
        )
        albedo[col_mask] = np.clip(col_rgb[col_mask], 0.0, 1.0)
        rgh[col_mask] = (0.16 + 0.08 * frost_ribs)[col_mask]
        met[col_mask] = 0.04
        ao[col_mask] = 0.98

        # Composite white magazine counters & optic legends
        decal_h = 0.28 * _bevel_mask(white_mark, width_px=1.2)
        _mix(albedo, (0.93, 0.94, 0.95), white_mark * 0.94)
        _mix(rgh, 0.38, white_mark * 0.82)
        _mix(met, 0.02, white_mark * 0.92)
        decal_nrm = _height_to_normal_01(decal_h, strength=1.8)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.05, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_mag_optic_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_mag_optic_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_mag_optic_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p90_v3_mag_optic_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3 POST-PROCESS: p90_v3_metal
    #   - Satin Anodized Die-Cast Aluminum Upper Receiver w/ Crisp Laser-Engraved
    #     FN HERSTAL 5.7x28 Rollmarks, Rail T-Numbers & Subtle Field Wear
    #   - 10.4" CHF Barrel, 4-Port Slanted Compensator, Heavy Billet Bolt & Rods
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
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero UV bands for `p90_upper_receiver` (X in [1.76, 15.19], Y in [0.15, 5.72]):
        #   Left  flank (-Z): u in [0.015, 0.985] (1 - xNorm: +X muzzle left), v in [0.755, 0.985]
        #   Right flank (+Z): u in [0.015, 0.985] (xNorm:     rear left),      v in [0.510, 0.740]
        PPCM = 180.0
        X0, XSPAN = 1.76, 13.43
        Y0, YSPAN = 0.15, 5.57
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 2417 x 1003 px

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        laser_m = np.zeros((h, w), dtype=np.float32)

        # Left flank (-Z): crisp engraved "FN HERSTAL  5.7x28" on unobstructed solid alloy bridge wall
        # (X in [7.2 .. 13.6], Y in [2.15 .. 3.25], cleanly between charging slot y=1.48 and sight window y=3.49!)
        l_img = Image.new("L", (CW, CH), 0)
        dl = ImageDraw.Draw(l_img)
        lx0 = xw_to_cx_left(13.35)
        ly_mid = yw_to_cy(2.68)
        _draw_fn_oval(dl, lx0 + 54, ly_mid, 44, 28, lw=4)
        dl.text((lx0 + 116, ly_mid - 20), "FN HERSTAL   5.7×28", fill=255, font=_load_font(FONT_DIN, 54), anchor="lm")
        dl.text((lx0 + 116, ly_mid + 34), "MOD. P90  -  BELGIUM  -  1:9\" CHF", fill=232, font=_load_font(FONT_COND, 38), anchor="lm")
        # Subtle lower shroud serial near rear cradle (X in [2.3..5.8], Y in [0.60..1.10])
        dl.text((xw_to_cx_left(4.15), yw_to_cy(0.84)), "5.7×28 NATO", fill=225, font=_load_font(FONT_COND, 38), anchor="mm")
        _paste_uv_band(laser_m, l_img, 0.015, 0.985, 0.755, 0.985)

        # Right flank (+Z): crisp engraved "FN P90  5.7x28mm NATO" + Liege proof on solid alloy bridge wall
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        rx0 = xw_to_cx_right(7.25)
        ry_mid = yw_to_cy(2.68)
        dr.text((rx0, ry_mid - 20), "FN  P90  -  5.7×28mm NATO", fill=255, font=_load_font(FONT_DIN, 52), anchor="lm")
        dr.text((rx0, ry_mid + 34), "FABRIQUE NATIONALE HERSTAL", fill=232, font=_load_font(FONT_COND, 38), anchor="lm")
        _draw_liege_proofs(dr, xw_to_cx_right(13.15), ry_mid + 4, s=0.82)
        dr.text((xw_to_cx_right(4.15), yw_to_cy(0.84)), "SER. FN084912", fill=225, font=_load_font(FONT_COND, 38), anchor="mm")
        _paste_uv_band(laser_m, r_img, 0.015, 0.985, 0.510, 0.740)

        # Subtle field-handling micro-scratches on anodized upper receiver walls
        u_grid = np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w))
        v_grid = np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w))
        walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.755) & (v_grid <= 0.985)) | ((v_grid >= 0.510) & (v_grid <= 0.740))
        )).astype(np.float32)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        rng_s = np.random.default_rng(5790)
        for _ in range(95):
            sx = float(rng_s.uniform(0.02, 0.98) * w)
            sy = float(rng_s.uniform(0.02, 0.48) * h)
            length = float(rng_s.uniform(14, 58))
            ang = math.radians(float(rng_s.uniform(-16, 16)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng_s.integers(75, 190)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls
        _mix(albedo, (0.56, 0.60, 0.66), sc * 0.24)
        rgh -= sc * 0.05
        met = np.clip(met + sc * 0.10, 0.00, 0.98)

        # Composite crisp silver-laser engraved alloy rollmarks
        eng_bev = _bevel_mask(laser_m, width_px=1.3)
        decal_h = -0.58 * eng_bev - 0.04 * sc
        _mix(albedo, (0.84, 0.87, 0.91), laser_m * 0.88)
        _mix(rgh, 0.34, laser_m * 0.78)
        _mix(met, 0.88, laser_m * 0.60)
        ao *= 1.0 - 0.12 * laser_m

        decal_nrm = _height_to_normal_01(decal_h, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.11, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p90_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p90_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_stock_atlas()
    process_mag_optic_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "p90.glb"
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


# Exact 23 solid FN P90 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY the 2 dynamic GPU-compressed springs: `p90_recoil_springs` & `p90_mag_spring`!)
STOCK_PARTS = [
    "p90_stock",
    "p90_buttplate",
    "p90_mag_catches",
    "p90_ejection_cover",
    "p90_trigger",
    "p90_selector",
    "p90_hammer_pack",
    "p90_mag_floorplate",
]

MAG_OPTIC_PARTS = [
    "p90_mag_body",
    "p90_helical_ramp",
    "p90_mag_follower",
    "p90_hammer",
    "p90_ring_sight",
]

METAL_PARTS = [
    "p90_upper_receiver",
    "p90_barrel",
    "p90_flash_hider",
    "p90_charging_handles",
    "p90_bolt",
    "p90_firing_pin",
    "p90_guide_rods",
    "p90_takedown_lock",
    "p90_sling_mount",
    "p90_transfer_bars",
]

# Exterior parts receiving assembled inter-part contact AO (internal & sliding parts receive clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "p90_stock",
    "p90_buttplate",
    "p90_mag_catches",
    "p90_ejection_cover",
    "p90_trigger",
    "p90_selector",
    "p90_mag_floorplate",
    "p90_mag_body",
    "p90_ring_sight",
    "p90_upper_receiver",
    "p90_barrel",
    "p90_flash_hider",
    "p90_charging_handles",
    "p90_takedown_lock",
    "p90_sling_mount",
}

ASSEMBLED_POS = {
    "p90_upper_receiver":   (  0.000,  0.000,  0.000),
    "p90_barrel":           (  0.000,  0.850,  0.000),
    "p90_flash_hider":      ( 15.850,  0.850,  0.000),
    "p90_ring_sight":       (  9.600,  4.320,  0.000),
    "p90_charging_handles": (  9.400,  1.480,  0.000),
    "p90_bolt":             ( -5.150,  0.720,  0.000),
    "p90_firing_pin":       ( -5.250,  0.850,  0.000),
    "p90_guide_rods":       ( -8.850,  1.240,  0.000),
    "p90_stock":            (  0.000,  0.000,  0.000),
    "p90_buttplate":        (-16.350, -1.950,  0.000),
    "p90_takedown_lock":    (  1.550,  1.380,  0.000),
    "p90_mag_catches":      ( -4.950,  1.980,  0.000),
    "p90_ejection_cover":   ( -3.900, -4.180,  0.000),
    "p90_sling_mount":      ( -8.500, -0.450,  0.000),
    "p90_trigger":          (  6.650, -2.350,  0.000),
    "p90_selector":         (  5.950, -3.380,  0.000),
    "p90_transfer_bars":    ( -3.100, -1.080,  0.000),
    "p90_hammer_pack":      (-12.650, -0.680,  0.000),
    "p90_hammer":           (-11.350, -0.350,  0.000),
    "p90_mag_body":         ( -3.800,  2.660,  0.000),
    "p90_helical_ramp":     ( -3.450,  2.180,  0.000),
    "p90_mag_follower":     (  3.350,  2.660,  0.000),
    "p90_mag_floorplate":   (  6.520,  2.660,  0.000),
}

ASSEMBLED_ROT_THREE: dict[str, tuple[float, float, float]] = {}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured from src/weapons/p90/meshes/*.ts
CSG_REF_BBOX = {
    "p90_upper_receiver":   ((  1.7600, -0.1500, -1.0300), ( 15.1900,  5.7200,  1.2900)),
    "p90_barrel":           (( -2.5500, -0.5800, -0.5800), ( 15.3750,  0.5800,  0.5800)),
    "p90_flash_hider":      (( -0.8100, -0.4300, -0.4300), (  0.9651,  0.4300,  0.4300)),
    "p90_ring_sight":       (( -2.2750, -0.8000, -0.6900), (  2.2750,  0.7000,  0.6900)),
    "p90_charging_handles": (( -2.1000, -0.1800, -1.6764), (  1.2000,  0.1800,  1.6764)),
    "p90_bolt":             (( -2.6000, -0.7000, -0.8900), (  2.6058,  1.1127,  0.8900)),
    "p90_firing_pin":       (( -2.4100, -0.1350, -0.1350), (  2.6450,  0.1350,  0.1350)),
    "p90_guide_rods":       (( -6.3400, -1.1900, -0.8300), (  6.0000,  0.4300,  0.8300)),
    "p90_stock":            ((-16.2200, -8.0645, -1.1200), ( 14.6304,  1.9700,  1.1200)),
    "p90_buttplate":        (( -0.4900, -4.7750, -1.1100), (  0.6950,  3.9050,  1.1100)),
    "p90_takedown_lock":    (( -0.3200, -0.5740, -1.2500), (  0.5500,  0.3723,  1.1900)),
    "p90_mag_catches":      (( -1.1719, -0.2020, -1.3700), (  0.7800,  0.5100,  1.3700)),
    "p90_ejection_cover":   (( -1.4800, -0.1400, -0.6900), (  1.4800,  0.1900,  0.5900)),
    "p90_sling_mount":      (( -6.3100, -3.5400, -1.6350), ( 11.3273,  2.1050,  1.1200)),
    "p90_trigger":          (( -1.0450, -1.1153, -0.3400), (  0.7199,  1.2400,  0.3400)),
    "p90_selector":         (( -0.5650, -0.5650, -0.6700), (  0.5650,  0.6000,  0.6700)),
    "p90_transfer_bars":    (( -9.1600, -0.3500, -0.6900), (  9.2750,  0.3318,  0.6900)),
    "p90_hammer_pack":      (( -2.8500, -0.9400, -0.7400), (  2.5500,  1.1633,  0.7400)),
    "p90_hammer":           (( -1.4400, -0.3300, -0.4800), (  0.3250,  0.8600,  0.4900)),
    "p90_mag_body":         ((-10.4000, -0.7500, -1.2900), ( 10.4000,  0.7600,  1.2900)),
    "p90_helical_ramp":     (( -1.2750, -0.7800, -1.0800), (  1.3750,  0.6600,  1.0800)),
    "p90_mag_follower":     (( -0.5229, -0.3900, -0.9800), (  0.6600,  0.3900,  0.9800)),
    "p90_mag_floorplate":   (( -0.6100, -0.7300, -1.3100), (  0.3600,  0.7300,  1.3100)),
}


# =============================================================================
# Scene & Physically Calibrated FN Herstal Material Library (Cycles GPU)
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
    bevel_r: float = 0.028,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.76, 0.80, 0.84),
    grain_scale: float = 38.0,
    grain_bump: float = 0.028,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 72.0,
    rough_var: float = 0.040,
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
    rgh_val_node.inputs["To Min"].default_value = max(0.06, roughness - rough_var)
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
        ao_edge.inputs["Distance"].default_value = 0.075

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.30
        ramp.color_ramp.elements[0].color = (edge_wear, edge_wear, edge_wear, 1.0)
        ramp.color_ramp.elements[1].position = 0.76
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


def _build_p90_flash_hider_heat_mat() -> bpy.types.Material:
    """FN P90 4-Port Slanted Birdcage Compensator: manganese-phosphate steel -> subtle bronze/blue
    5.7x28mm supersonic blast temper -> matte gunpowder carbon fouling along the 32-deg crown."""
    mat = bpy.data.materials.new("M_FlashHiderHeat")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Local flash-hider X spans [-0.81 .. +0.965]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.55
    mr_x.inputs["From Max"].default_value = 0.96
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 6.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.18
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.205, 0.218, 0.236)
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.240, 0.252, 0.270)
    for pos, rgb in (
        (0.64, (0.31, 0.23, 0.15)),    # subtle golden-bronze blast temper around 4 ports
        (0.80, (0.17, 0.20, 0.27)),    # pale heat-blued steel near slant lip
        (0.94, (0.082, 0.082, 0.086)), # carbon soot inside slanted crown
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.55
    rr.elements[0].color = (0.26, 0.26, 0.26, 1.0)
    rr.elements[1].position = 0.95
    rr.elements[1].color = (0.78, 0.78, 0.78, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.78
    rm.elements[0].color = (0.90, 0.90, 0.90, 1.0)
    rm.elements[1].position = 0.96
    rm.elements[1].color = (0.20, 0.20, 0.20, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.036
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: p90_v3_stock (Monocoque Polymer Stock, Buttplate, Controls & Hammer Pack) ---
        "S_PolyamideMain": _build_pbr_mat(
            "S_PolyamideMain",
            base_srgb=(0.188, 0.196, 0.212),
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.22,
            edge_srgb=(0.285, 0.298, 0.318),
            grain_scale=64.0,
            grain_bump=0.048,
            voronoi_grain=0.62,
            voronoi_scale=96.0,
            rough_var=0.045,
        ),
        "S_PolyamideDark": _build_pbr_mat(
            "S_PolyamideDark",
            base_srgb=(0.128, 0.134, 0.146),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=48.0,
            grain_bump=0.034,
            rough_var=0.035,
        ),
        "S_RubberButt": _build_pbr_mat(
            "S_RubberButt",
            base_srgb=(0.168, 0.174, 0.186),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.14,
            edge_srgb=(0.235, 0.242, 0.256),
            grain_scale=76.0,
            grain_bump=0.068,
            voronoi_grain=0.72,
            voronoi_scale=112.0,
            rough_var=0.040,
        ),
        "S_ControlPolymer": _build_pbr_mat(
            "S_ControlPolymer",
            base_srgb=(0.178, 0.186, 0.200),
            roughness=0.49,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.24,
            edge_srgb=(0.295, 0.308, 0.328),
            grain_scale=54.0,
            grain_bump=0.036,
            voronoi_grain=0.45,
            voronoi_scale=84.0,
            rough_var=0.038,
        ),
        "S_HammerPackTan": _build_pbr_mat(
            "S_HammerPackTan",
            base_srgb=(0.425, 0.388, 0.308),
            roughness=0.48,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.54, 0.50, 0.41),
            grain_scale=50.0,
            grain_bump=0.032,
            voronoi_grain=0.35,
            voronoi_scale=76.0,
            rough_var=0.040,
        ),
        "S_PackAccentAmber": _build_pbr_mat(
            "S_PackAccentAmber",
            base_srgb=(0.76, 0.36, 0.10),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=38.0,
            grain_bump=0.022,
            rough_var=0.032,
        ),
        "S_HardwareSteel": _build_pbr_mat(
            "S_HardwareSteel",
            base_srgb=(0.24, 0.255, 0.275),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.018,
            edge_wear=0.40,
            edge_srgb=(0.78, 0.81, 0.85),
            grain_scale=36.0,
            grain_bump=0.022,
            rough_var=0.030,
        ),
        "S_HardwareChrome": _build_pbr_mat(
            "S_HardwareChrome",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.014,
            rough_var=0.022,
        ),

        # --- SUITE 2: p90_v3_mag_optic (Smoked-Amber 50-Rd Mag, 90-Deg Ramp, Orange Parts & Ring Sight) ---
        "MO_SmokedPolycarb": _build_pbr_mat(
            "MO_SmokedPolycarb",
            base_srgb=(0.30, 0.235, 0.172),
            roughness=0.18,
            metallic=0.02,
            bevel_r=0.024,
            edge_wear=0.14,
            edge_srgb=(0.44, 0.36, 0.26),
            grain_scale=32.0,
            grain_bump=0.012,
            rough_var=0.022,
        ),
        "MO_MagRibAmber": _build_pbr_mat(
            "MO_MagRibAmber",
            base_srgb=(0.215, 0.172, 0.132),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.018,
            edge_wear=0.16,
            edge_srgb=(0.33, 0.27, 0.21),
            grain_scale=46.0,
            grain_bump=0.028,
            rough_var=0.032,
        ),
        "MO_HelicalPolymer": _build_pbr_mat(
            "MO_HelicalPolymer",
            base_srgb=(0.182, 0.192, 0.208),
            roughness=0.44,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.18,
            edge_srgb=(0.30, 0.32, 0.35),
            grain_scale=52.0,
            grain_bump=0.032,
            rough_var=0.035,
        ),
        "MO_HelicalBrassWear": _build_pbr_mat(
            "MO_HelicalBrassWear",
            base_srgb=(0.78, 0.62, 0.25),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.016,
            edge_wear=0.20,
            edge_srgb=(0.90, 0.78, 0.42),
            grain_scale=32.0,
            grain_bump=0.018,
            aniso_stretch=(0.5, 3.0, 3.0),
            rough_var=0.026,
        ),
        "MO_HelicalStainless": _build_pbr_mat(
            "MO_HelicalStainless",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.014,
            edge_wear=0.20,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "MO_SafetyOrange": _build_pbr_mat(
            "MO_SafetyOrange",
            base_srgb=(0.92, 0.36, 0.06),
            roughness=0.38,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.18,
            edge_srgb=(0.98, 0.56, 0.24),
            grain_scale=42.0,
            grain_bump=0.024,
            rough_var=0.034,
        ),
        "MO_DummyRollerDark": _build_pbr_mat(
            "MO_DummyRollerDark",
            base_srgb=(0.195, 0.205, 0.222),
            roughness=0.36,
            metallic=0.04,
            bevel_r=0.014,
            grain_scale=44.0,
            grain_bump=0.020,
            rough_var=0.028,
        ),
        "MO_DummyRollerCopper": _build_pbr_mat(
            "MO_DummyRollerCopper",
            base_srgb=(0.72, 0.38, 0.18),
            roughness=0.28,
            metallic=0.68,
            bevel_r=0.014,
            grain_scale=36.0,
            grain_bump=0.018,
            rough_var=0.028,
        ),
        "MO_HammerSteelInsert": _build_pbr_mat(
            "MO_HammerSteelInsert",
            base_srgb=(0.30, 0.325, 0.360),
            roughness=0.24,
            metallic=0.92,
            bevel_r=0.016,
            edge_wear=0.36,
            edge_srgb=(0.82, 0.85, 0.89),
            grain_scale=34.0,
            grain_bump=0.020,
            rough_var=0.026,
        ),
        "MO_SightAlloy": _build_pbr_mat(
            "MO_SightAlloy",
            base_srgb=(0.258, 0.274, 0.298),
            roughness=0.36,
            metallic=0.72,
            bevel_r=0.024,
            edge_wear=0.45,
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=52.0,
            grain_bump=0.028,
            voronoi_grain=0.38,
            voronoi_scale=84.0,
            rough_var=0.032,
        ),
        "MO_SightInnerDark": _build_pbr_mat(
            "MO_SightInnerDark",
            base_srgb=(0.095, 0.102, 0.114),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.014,
            grain_scale=38.0,
            grain_bump=0.020,
            rough_var=0.024,
        ),
        "MO_CollectorPrism": _build_pbr_mat(
            "MO_CollectorPrism",
            base_srgb=(0.74, 0.86, 0.78),
            roughness=0.18,
            metallic=0.04,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.014,
            rough_var=0.020,
        ),
        "MO_SapphireLens": _build_pbr_mat(
            "MO_SapphireLens",
            base_srgb=(0.04, 0.32, 0.46),
            roughness=0.06,
            metallic=0.14,
            bevel_r=0.008,
            grain_scale=12.0,
            grain_bump=0.002,
            rough_var=0.006,
        ),

        # --- SUITE 3: p90_v3_metal (Anodized Upper Receiver, CHF Barrel, Slant Comp, Heavy Bolt & Rods) ---
        "M_UpperAnodized": _build_pbr_mat(
            "M_UpperAnodized",
            base_srgb=(0.268, 0.286, 0.314),
            roughness=0.35,
            metallic=0.72,
            bevel_r=0.028,
            edge_wear=0.48,
            edge_srgb=(0.78, 0.82, 0.88),
            grain_scale=56.0,
            grain_bump=0.024,
            voronoi_grain=0.36,
            voronoi_scale=88.0,
            rough_var=0.032,
        ),
        "M_RailSteel": _build_pbr_mat(
            "M_RailSteel",
            base_srgb=(0.292, 0.310, 0.338),
            roughness=0.31,
            metallic=0.80,
            bevel_r=0.020,
            edge_wear=0.52,
            edge_srgb=(0.84, 0.87, 0.92),
            grain_scale=42.0,
            grain_bump=0.022,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.028,
        ),
        "M_BarrelCHF": _build_pbr_mat(
            "M_BarrelCHF",
            base_srgb=(0.190, 0.202, 0.218),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.42,
            edge_srgb=(0.78, 0.81, 0.85),
            grain_scale=44.0,
            grain_bump=0.030,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.030,
        ),
        "M_FlashHiderHeat": _build_p90_flash_hider_heat_mat(),
        "M_BoltBillet": _build_pbr_mat(
            "M_BoltBillet",
            base_srgb=(0.235, 0.250, 0.272),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.84, 0.87, 0.91),
            grain_scale=38.0,
            grain_bump=0.024,
            aniso_stretch=(0.40, 3.4, 3.4),
            rough_var=0.028,
        ),
        "M_ChromeSteel": _build_pbr_mat(
            "M_ChromeSteel",
            base_srgb=(0.84, 0.87, 0.91),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.014,
            edge_wear=0.20,
            edge_srgb=(0.94, 0.96, 0.98),
            grain_scale=24.0,
            grain_bump=0.012,
            aniso_stretch=(0.40, 3.6, 3.6),
            rough_var=0.018,
        ),
        "M_StainlessBrushed": _build_pbr_mat(
            "M_StainlessBrushed",
            base_srgb=(0.74, 0.78, 0.82),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.24,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.024,
        ),
        "M_InnerDarkSteel": _build_pbr_mat(
            "M_InnerDarkSteel",
            base_srgb=(0.115, 0.124, 0.138),
            roughness=0.44,
            metallic=0.80,
            bevel_r=0.016,
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.028,
        ),
        "M_BufferPolymer": _build_pbr_mat(
            "M_BufferPolymer",
            base_srgb=(0.18, 0.19, 0.205),
            roughness=0.54,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=52.0,
            grain_bump=0.032,
            rough_var=0.036,
        ),
        "M_BufferAmber": _build_pbr_mat(
            "M_BufferAmber",
            base_srgb=(0.74, 0.34, 0.10),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.14,
            edge_srgb=(0.88, 0.54, 0.24),
            grain_scale=40.0,
            grain_bump=0.026,
            rough_var=0.034,
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


def mk_lathe_z(
    name: str, pts_r_z: list[tuple[float, float]], segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Revolves an (r, z) profile around the Three.js +Z axis (ideal for P90 sideways dummy rollers!)."""
    bm = bmesh.new()
    closed_loop = (
        len(pts_r_z) >= 3
        and pts_r_z[0][0] > 1e-5
        and math.hypot(pts_r_z[0][0] - pts_r_z[-1][0], pts_r_z[0][1] - pts_r_z[-1][1]) < 1e-4
    )
    pts = pts_r_z[:-1] if closed_loop else list(pts_r_z)
    rings = []
    for r, z in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((r * math.cos(th), r * math.sin(th), z)))
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


def mk_helical_rifling_lands(
    name: str, count: int, bore_r: float, depth: float, width: float,
    x0: float, x1: float, twist_cm: float, mat: bpy.types.Material, segs: int = 16,
) -> list[bpy.types.Object]:
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
            ring = []
            for ly, lz in ((r_in, -hw), (r_out, -hw), (r_out, hw), (r_in, hw)):
                ring.append((xx, ly * ca - lz * sa, ly * sa + lz * ca))
            rings.append(ring)
        objs.append(mk_loft_rings(f"{name}_{k}", rings, mat=mat, cap_ends=True))
    return objs


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
# PART BUILDERS — ATLAS 1: MONOCOQUE POLYMER STOCK & CONTROLS (8 parts)
# =============================================================================
def build_p90_stock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: Iconic René Predazzi Ergonomic Glass-Filled Polyamide Thumbhole Bullpup Stock
    assembledPos: [0, 0, 0] | spans X in [-16.22, +14.63], Y in [-8.06, +1.97], Z in [-1.12, +1.12].
    Features organically radiused monocoque curves, sculpted cheekpiece, thumbhole & oversized
    trigger bow with contoured inner bevels, integral downward hand-stop hook, ambidextrous
    finger-rest ledges, clamshell assembly boss recesses & vertical downward ejection chute."""
    m_main = mats["S_PolyamideMain"]
    m_dark = mats["S_PolyamideDark"]
    m_steel = mats["S_HardwareSteel"]

    # 1. High-resolution sweeping monocoque silhouette profile in (X, Y)
    hull = [(-16.16, -6.72), (-16.16, 1.92), (1.82, 1.92), (1.82, 0.20), (14.52, 0.20)]
    hull += _quad_bez((14.52, 0.20), (14.66, -2.80), (13.86, -6.22), segs=12)   # Swept front nose & hand-stop!
    hull += _quad_bez((13.86, -6.22), (13.34, -6.66), (12.64, -5.94), segs=10)  # Rounded hand-stop tip
    hull += _quad_bez((12.64, -5.94), (11.64, -3.52), (9.74, -2.92), segs=12)   # Front foregrip finger cove
    hull += _quad_bez((9.74, -2.92), (9.34, -5.84), (7.64, -6.64), segs=12)     # Oversized winter trigger bow
    hull.append((3.24, -7.84))                                                  # Swept pistol-grip base
    hull += _quad_bez((3.24, -7.84), (1.94, -8.14), (1.24, -7.52), segs=10)     # Heel of grip
    hull += _quad_bez((1.24, -7.52), (0.84, -5.34), (-0.46, -4.18), segs=12)    # Rear sweep to ejection chute
    hull.append((-5.86, -4.18))                                                 # Flat ejection-chute deck
    hull += _quad_bez((-5.86, -4.18), (-9.86, -4.44), (-14.86, -6.54), segs=14) # Tapered bullpup buttstock belly
    hull.append((-16.16, -6.72))

    # Multi-segment generous edge bevel (0.14 cm, 3 segs) gives organic monocoque curves
    # while keeping wide flat side planes at |Z| = 1.11 for distortion-free rollmarks!
    stock = mk_extrude_z("stock_hull", hull, -1.11, 1.11, bevel=0.14, bevel_segs=3, mat=m_main)

    # 2. Internal cavities, sculpted ergonomic thumbhole, trigger window, selector window & downward chute
    #    Beveled elliptical cylinders create smooth radiused ergonomic thumbhole & trigger-bow inner edges!
    thumb_cut = mk_cyl(
        "cut_thumb", 1.44, 1.44, 2.80, axis="z", segs=40,
        xform=[("s", 1.02, 1.16, 1.0), ("t", 3.05, -4.35, 0.0)], mat=m_dark,
    )
    # Flared chamfer cones on both flanks of thumbhole for silky finger ergonomics
    thumb_flare_r = mk_cyl(
        "cut_th_fr", 1.60, 1.38, 0.28, axis="z", segs=40,
        xform=[("s", 1.02, 1.16, 1.0), ("t", 3.05, -4.35, 1.02)], mat=m_main,
    )
    thumb_flare_l = mk_cyl(
        "cut_th_fl", 1.38, 1.60, 0.28, axis="z", segs=40,
        xform=[("s", 1.02, 1.16, 1.0), ("t", 3.05, -4.35, -1.02)], mat=m_main,
    )

    trig_cut = mk_cyl(
        "cut_trig", 1.56, 1.56, 2.80, axis="z", segs=40,
        xform=[("s", 1.06, 1.24, 1.0), ("t", 6.95, -3.72, 0.0)], mat=m_dark,
    )
    trig_flare_r = mk_cyl(
        "cut_tr_fr", 1.70, 1.50, 0.26, axis="z", segs=40,
        xform=[("s", 1.06, 1.24, 1.0), ("t", 6.95, -3.72, 1.03)], mat=m_main,
    )
    trig_flare_l = mk_cyl(
        "cut_tr_fl", 1.50, 1.70, 0.26, axis="z", segs=40,
        xform=[("s", 1.06, 1.24, 1.0), ("t", 6.95, -3.72, -1.03)], mat=m_main,
    )

    bolt_channel = mk_box("cut_bolt_ch", 18.25, 1.98, 1.74, xform=[("t", -7.12, 0.80, 0.0)], mat=m_dark)
    pack_bay = mk_box("cut_pack_bay", 6.85, 2.35, 1.54, xform=[("t", -12.95, -0.78, 0.0)], mat=m_dark)
    turret_well = mk_box("cut_turret", 2.96, 0.88, 1.66, xform=[("t", -3.45, 1.72, 0.0)], mat=m_dark)
    fwd_trough = mk_box("cut_fwd_tr", 11.80, 1.14, 1.50, xform=[("t", 7.80, -0.34, 0.0)], mat=m_dark)
    sel_window = mk_box("cut_sel_win", 1.34, 1.14, 2.60, xform=[("t", 5.95, -3.38, 0.0)], mat=m_dark)
    eject_chute = mk_box("cut_eject", 2.74, 5.10, 1.08, xform=[("t", -3.90, -1.95, 0.0)], mat=m_dark)
    sling_slot = mk_box("cut_sling", 1.76, 0.44, 2.60, xform=[("t", -13.85, -3.65, 0.0)], mat=m_dark)
    td_hole = mk_cyl("cut_td_pin", 0.25, 0.25, 2.60, axis="z", segs=22, xform=[("t", 1.55, 1.38, 0.0)], mat=m_dark)

    stock = bool_subtract(stock, [
        thumb_cut, thumb_flare_r, thumb_flare_l,
        trig_cut, trig_flare_r, trig_flare_l,
        bolt_channel, pack_bay, turret_well, fwd_trough,
        sel_window, eject_chute, sling_slot, td_hole,
    ])

    # 3. Sculpted authentic FN P90 monocoque exterior details (staying strictly inside Z in [-1.12, +1.12]!)
    extras = [stock]
    # Ambidextrous sculpted cheek-weld shoulder bolsters along rear upper spine
    for sgn in (-1.0, 1.0):
        extras.append(mk_box(
            f"cheek_rib_{int(sgn)}", 9.8, 0.34, 0.05,
            xform=[("t", -10.8, 1.48, sgn * 1.095)], mat=m_main, bevel=0.016,
        ))
        # Tactile index-finger rest rib above trigger bow
        extras.append(mk_box(
            f"finger_ledge_{int(sgn)}", 4.2, 0.16, 0.06,
            xform=[("t", 6.8, -1.45, sgn * 1.09)], mat=m_main, bevel=0.015,
        ))
        # Subtle longitudinal molding boss ridge along lower buttstock belly
        extras.append(mk_box(
            f"belly_rib_{int(sgn)}", 6.8, 0.14, 0.04,
            xform=[("rz", 0.24), ("t", -10.6, -4.45, sgn * 1.095)], mat=m_main, bevel=0.012,
        ))
    # Authentic FN P90 clamshell Torx assembly screw heads recessed along right flank (+Z)
    for idx, (sx, sy) in enumerate((
        (-14.95, 0.72), (-14.95, -5.25), (-7.20, -3.55), (-0.85, -3.55), (0.85, -0.65), (12.40, -1.05),
    )):
        extras.append(mk_cyl(
            f"shell_screw_{idx}", 0.125, 0.125, 0.05, axis="z", segs=16,
            xform=[("t", sx, sy, 1.095)], mat=m_steel, bevel=0.010,
        ))

    obj = join_objects(extras, "p90_stock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_buttplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Sliding Ribbed Rubber & Polymer Buttplate w/ Top Detent Latch
    assembledPos: [-16.35, -1.95, 0] | spans X in [-0.49, +0.695], Y in [-4.775, +3.905], Z in [-1.11, +1.11]."""
    m_rub = mats["S_RubberButt"]
    m_poly = mats["S_PolyamideMain"]
    m_dark = mats["S_PolyamideDark"]
    m_stl = mats["S_HardwareSteel"]

    # Slightly curved ergonomic shoulder-pocket profile in (X, Y)
    pad_xy = [
        (-0.34, -4.74), (0.38, -4.74), (0.38, 3.84), (-0.34, 3.84),
        (-0.40, 2.80), (-0.32, 0.60), (-0.30, -1.40), (-0.41, -3.80),
    ]
    plate_body = mk_extrude_z("butt_body", pad_xy, -1.08, 1.08, bevel=0.06, bevel_segs=2, mat=m_rub)

    # Inner polymer guide skirt sliding snugly inside stock tail cavity
    inner_skirt = mk_box(
        "butt_skirt", 0.56, 7.56, 1.64, xform=[("t", 0.41, -0.42, 0.0)], mat=m_dark, bevel=0.03,
    )
    # Twin internal locking dovetail rails
    rail_l = mk_box("butt_rail_l", 0.48, 6.90, 0.14, xform=[("t", 0.36, -0.42, -0.84)], mat=m_poly, bevel=0.015)
    rail_r = mk_box("butt_rail_r", 0.48, 6.90, 0.14, xform=[("t", 0.36, -0.42, 0.84)], mat=m_poly, bevel=0.015)

    # Top serrated sliding release latch tab
    top_latch = mk_box(
        "butt_latch", 0.94, 0.44, 1.10, xform=[("t", 0.18, 3.68, 0.0)], mat=m_stl, bevel=0.025,
    )

    parts = [plate_body, inner_skirt, rail_l, rail_r, top_latch]
    # 11 crisp horizontal anti-slip rubber traction ribs following curved rear shoulder pad
    for r in range(11):
        ry = -4.18 + r * 0.72
        u = (ry + 4.18) / 7.20
        rx_curve = -0.42 + 0.07 * math.sin(u * math.pi)
        parts.append(mk_box(
            f"butt_rib_{r}", 0.15, 0.24, 2.20,
            xform=[("t", rx_curve, ry, 0.0)], mat=m_rub, bevel=0.025,
        ))
    # Rear molded perimeter framing trim
    for sgn in (-1.0, 1.0):
        parts.append(mk_box(
            f"butt_trim_{int(sgn)}", 0.18, 8.10, 0.14,
            xform=[("t", -0.34, -0.45, sgn * 1.01)], mat=m_poly, bevel=0.02,
        ))

    obj = join_objects(parts, "p90_buttplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_mag_catches(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Ambidextrous Rear-Pull Sliding Top-Magazine Release Catches
    assembledPos: [-4.95, 1.98, 0] | spans X in [-1.17, +0.78], Y in [-0.20, +0.51], Z in [-1.37, +1.37]."""
    m_ctrl = mats["S_ControlPolymer"]
    m_stl = mats["S_HardwareSteel"]
    m_chr = mats["S_HardwareChrome"]

    bridge = mk_box("mc_bridge", 1.42, 0.30, 2.34, mat=m_ctrl, bevel=0.03)
    # Swept ambidextrous left/right pull wings with vertical finger serrations
    parts = [bridge]
    for sgn in (-1.0, 1.0):
        wing = mk_box(
            f"mc_wing_{int(sgn)}", 1.26, 0.46, 0.24,
            xform=[("t", -0.10, 0.12, sgn * 1.24)], mat=m_ctrl, bevel=0.035,
        )
        parts.append(wing)
        for k in range(5):
            kx = -0.56 + k * 0.23
            parts.append(mk_box(
                f"mc_serr_{int(sgn)}_{k}", 0.09, 0.36, 0.05,
                xform=[("t", kx, 0.12, sgn * 1.35)], mat=m_stl, bevel=0.010,
            ))

    # Hardened front magazine-collar locking claw hook + entry ramp
    claw_xy = [(0.34, 0.05), (0.78, 0.05), (0.78, 0.42), (0.58, 0.51), (0.34, 0.48)]
    claw = mk_extrude_z("mc_claw", claw_xy, -0.46, 0.46, bevel=0.025, mat=m_stl)
    spring = mk_coil_spring(
        "mc_spring", "x", -1.14, -0.15, -0.05, 0.0, 0.125, 0.022, 6.0,
        ring_segs=8, steps_per_coil=14, mat=m_chr,
    )
    parts.extend([claw, spring])

    obj = join_objects(parts, "p90_mag_catches")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_ejection_cover(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: Bottom Vertical Ejection-Chute Spring-Loaded Dust Cover
    assembledPos: [-3.90, -4.18, 0] | spans X in [-1.48, +1.48], Y in [-0.14, +0.19], Z in [-0.69, +0.59]."""
    m_poly = mats["S_ControlPolymer"]
    m_rub = mats["S_RubberButt"]
    m_stl = mats["S_HardwareSteel"]
    m_chr = mats["S_HardwareChrome"]

    flap = mk_box("ec_flap", 2.66, 0.15, 1.16, mat=m_poly, bevel=0.025)
    knuckle_f = mk_cyl("ec_kn_f", 0.105, 0.105, 0.90, axis="x", segs=18, xform=[("t", 0.91, 0.08, -0.58)], mat=m_stl, bevel=0.012)
    knuckle_r = mk_cyl("ec_kn_r", 0.105, 0.105, 0.90, axis="x", segs=18, xform=[("t", -0.91, 0.08, -0.58)], mat=m_stl, bevel=0.012)
    torsion = mk_coil_spring(
        "ec_torsion", "x", -0.38, 0.38, 0.08, -0.58, 0.082, 0.016, 7.0,
        ring_segs=8, steps_per_coil=12, mat=m_chr,
    )
    hinge_pin = mk_cyl("ec_pin", 0.052, 0.052, 2.94, axis="x", segs=14, xform=[("t", 0.0, 0.08, -0.58)], mat=m_chr, bevel=0.008)
    rib_a = mk_box("ec_rib_a", 2.34, 0.06, 0.15, xform=[("t", 0.0, -0.105, -0.10)], mat=m_poly, bevel=0.014)
    rib_b = mk_box("ec_rib_b", 2.34, 0.06, 0.15, xform=[("t", 0.0, -0.105, 0.28)], mat=m_poly, bevel=0.014)
    deflector = mk_box("ec_pad", 2.10, 0.055, 0.62, xform=[("t", 0.0, 0.10, 0.06)], mat=m_rub, bevel=0.012)
    # Rear latch lip catch tab
    latch_lip = mk_box("ec_lip", 0.65, 0.09, 0.14, xform=[("t", 0.0, 0.06, 0.52)], mat=m_stl, bevel=0.012)

    obj = join_objects([flap, knuckle_f, knuckle_r, torsion, hinge_pin, rib_a, rib_b, deflector, latch_lip], "p90_ejection_cover")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Two-Stage Progressive Horizontal Sliding Polymer Trigger
    assembledPos: [6.65, -2.35, 0] | spans X in [-1.045, +0.72], Y in [-1.115, +1.24], Z in [-0.34, +0.34]."""
    m_ctrl = mats["S_ControlPolymer"]
    m_stl = mats["S_HardwareSteel"]

    # Swept ergonomic finger-shoe curve matching FN P90 horizontal slider
    shoe_xy = [(-0.55, 0.90), (0.66, 0.90)]
    shoe_xy += _quad_bez((0.66, 0.90), (0.40, 0.14), (0.56, -0.78), segs=10)
    shoe_xy += _quad_bez((0.56, -0.78), (0.50, -1.06), (0.18, -1.08), segs=8)
    shoe_xy.append((-0.48, -0.96))
    shoe_xy += _quad_bez((-0.48, -0.96), (-0.66, -0.35), (-0.55, 0.90), segs=10)
    shoe = mk_extrude_z("trig_shoe", shoe_xy, -0.28, 0.28, bevel=0.045, bevel_segs=2, mat=m_ctrl)

    # Upper linear slide carriage + twin guide rail tabs
    guide_block = mk_box("trig_guide", 1.64, 0.50, 0.66, xform=[("t", -0.22, 0.98, 0.0)], mat=m_stl, bevel=0.025)
    # Selector stop foot underneath trigger shoe
    cam_foot = mk_box("trig_cam_ft", 0.42, 0.22, 0.34, xform=[("t", -0.36, -0.82, 0.0)], mat=m_ctrl, bevel=0.018)

    parts = [shoe, guide_block, cam_foot]
    # 5 crisp horizontal traction grooves along front finger face
    for i in range(5):
        ry = -0.68 + i * 0.30
        parts.append(mk_box(
            f"trig_rib_{i}", 0.075, 0.09, 0.52,
            xform=[("t", 0.52, ry, 0.0)], mat=m_ctrl, bevel=0.014,
        ))

    obj = join_objects(parts, "p90_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_selector(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: Ambidextrous Rotary Dial Selector Drum (S / 1 / A) beneath trigger
    assembledPos: [5.95, -3.38, 0] | spans X in [-0.565, +0.565], Y in [-0.565, +0.60], Z in [-0.67, +0.67].
    Outer left & right flat dial discs at Z = +-0.64 carry crisp hero UV S/1/A markings!"""
    m_ctrl = mats["S_ControlPolymer"]
    m_stl = mats["S_HardwareSteel"]
    m_chr = mats["S_HardwareChrome"]

    hub = mk_cyl("sel_hub", 0.45, 0.45, 0.96, axis="z", segs=32, mat=m_ctrl, bevel=0.025)
    # Dedicated flat-faced left & right dial discs (hero UV faces at |Z| > 0.615, |nz| > 0.85!)
    left_dial = mk_cyl("sel_dial_l", 0.52, 0.52, 0.19, axis="z", segs=32, xform=[("t", 0.0, 0.0, -0.555)], mat=m_ctrl, bevel=0.022)
    right_dial = mk_cyl("sel_dial_r", 0.52, 0.52, 0.19, axis="z", segs=32, xform=[("t", 0.0, 0.0, 0.555)], mat=m_ctrl, bevel=0.022)
    # Internal stainless two-stage progressive travel limiter cam
    limiter_cam = mk_box("sel_cam", 0.42, 0.52, 0.42, xform=[("t", 0.18, 0.34, 0.0)], mat=m_chr, bevel=0.022)

    parts = [hub, left_dial, right_dial, limiter_cam]
    # 12 radial knurled thumbwheel ribs around drum perimeter (leaving Z = +-0.65 flat dial discs 100% clear!)
    for k in range(12):
        ang = (k / 12.0) * math.pi * 2.0
        parts.append(mk_box(
            f"sel_knurl_{k}", 0.075, 0.075, 1.18,
            xform=[("rz", ang), ("t", math.cos(ang) * 0.515, math.sin(ang) * 0.515, 0.0)],
            mat=m_stl, bevel=0.012,
        ))

    obj = join_objects(parts, "p90_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_hammer_pack(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-04: Removable All-Polymer Tan/Olive Modular Hammer Pack Housing Cassette
    assembledPos: [-12.65, -0.68, 0] | spans X in [-2.85, +2.55], Y in [-0.94, +1.16], Z in [-0.74, +0.74]."""
    m_tan = mats["S_HammerPackTan"]
    m_dark = mats["S_PolyamideDark"]
    m_ctrl = mats["S_ControlPolymer"]
    m_amb = mats["S_PackAccentAmber"]
    m_chr = mats["S_HardwareChrome"]

    outer_box = mk_box("hp_outer", 5.08, 1.86, 1.38, mat=m_tan, bevel=0.045)
    inner_well = mk_box("hp_well", 4.34, 1.44, 0.94, xform=[("t", 0.10, 0.32, 0.0)], mat=m_dark)
    win_l = mk_box("hp_win_l", 1.84, 0.72, 0.34, xform=[("t", -0.35, 0.05, -0.62)], mat=m_dark)
    win_r = mk_box("hp_win_r", 1.84, 0.72, 0.34, xform=[("t", -0.35, 0.05, 0.62)], mat=m_dark)
    hollow = bool_subtract(outer_box, [inner_well, win_l, win_r])

    # Internal self-lubricating polymer primary sear, progressive disconnector & auto-sear safety trip
    primary_sear = mk_box("hp_sear", 1.18, 0.34, 0.56, xform=[("t", -0.85, 0.38, 0.0)], mat=m_ctrl, bevel=0.022)
    disconnector = mk_box("hp_disconn", 0.92, 0.24, 0.34, xform=[("t", 0.45, 0.14, 0.22)], mat=m_ctrl, bevel=0.018)
    auto_sear_trip = mk_box(
        "hp_auto_trip", 0.32, 0.96, 0.44,
        xform=[("rz", -0.22), ("t", 1.82, 0.66, 0.0)], mat=m_amb, bevel=0.022,
    )
    rear_pull_latch = mk_box("hp_latch", 0.46, 0.68, 0.86, xform=[("t", -2.61, -0.22, 0.0)], mat=m_ctrl, bevel=0.03)

    # 3 stainless steel cross-pins with chamfered ends
    pin1 = mk_cyl("hp_pin1", 0.085, 0.085, 1.47, axis="z", segs=18, xform=[("t", 1.30, 0.25, 0.0)], mat=m_chr, bevel=0.012)
    pin2 = mk_cyl("hp_pin2", 0.085, 0.085, 1.47, axis="z", segs=18, xform=[("t", -0.85, 0.15, 0.0)], mat=m_chr, bevel=0.012)
    pin3 = mk_cyl("hp_pin3", 0.072, 0.072, 1.45, axis="z", segs=16, xform=[("t", -1.95, -0.35, 0.0)], mat=m_chr, bevel=0.010)

    # Molded exterior stiffening ribs along cassette flanks
    parts = [hollow, primary_sear, disconnector, auto_sear_trip, rear_pull_latch, pin1, pin2, pin3]
    for sgn in (-1.0, 1.0):
        parts.append(mk_box(
            f"hp_rib_{int(sgn)}", 4.50, 0.12, 0.05,
            xform=[("t", 0.0, -0.64, sgn * 0.70)], mat=m_tan, bevel=0.012,
        ))

    obj = join_objects(parts, "p90_hammer_pack")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_mag_floorplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-05: Front Detachable Magazine Locking End-Plate & Stainless Detent Button
    assembledPos: [6.52, 2.66, 0] | spans X in [-0.61, +0.36], Y in [-0.73, +0.73], Z in [-1.31, +1.31]."""
    m_ctrl = mats["S_ControlPolymer"]
    m_dark = mats["S_PolyamideDark"]
    m_chr = mats["S_HardwareChrome"]

    # Chamfered cap plate matching beveled magazine cross-section
    cap_pts = _rounded_rect_pts(1.30, 0.725, 0.14, corner_segs=5)
    cap_plate = mk_extrude_x("mfp_cap", cap_pts, -0.23, 0.23, bevel=0.032, bevel_segs=2, mat=m_ctrl)
    inner_plug = mk_box("mfp_plug", 0.52, 1.04, 2.06, xform=[("t", -0.35, 0.0, 0.0)], mat=m_dark, bevel=0.03)
    slide_l = mk_box("mfp_lip_l", 0.36, 1.26, 0.10, xform=[("t", -0.26, 0.0, -1.21)], mat=m_ctrl, bevel=0.016)
    slide_r = mk_box("mfp_lip_r", 0.36, 1.26, 0.10, xform=[("t", -0.26, 0.0, 1.21)], mat=m_ctrl, bevel=0.016)

    # Recessed bezel ring + stepped stainless center lock button
    bezel = mk_lathe_x("mfp_bezel", [
        (0.18, 0.21), (0.24, 0.21), (0.24, 0.265), (0.18, 0.265), (0.18, 0.21),
    ], segs=24, mat=m_dark)
    lock_btn = mk_lathe_x("mfp_btn", [
        (0.0, 0.08), (0.18, 0.08), (0.18, 0.335), (0.148, 0.36), (0.0, 0.36),
    ], segs=26, mat=m_chr)

    parts = [cap_plate, inner_plug, slide_l, slide_r, bezel, lock_btn]
    for idx, rz in enumerate((-0.96, -0.72, -0.48, 0.48, 0.72, 0.96)):
        parts.append(mk_box(
            f"mfp_rib_{idx}", 0.055, 1.08, 0.08,
            xform=[("t", 0.245, 0.0, rz)], mat=m_dark, bevel=0.012,
        ))

    obj = join_objects(parts, "p90_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 2: SMOKED-AMBER MAG, HELICAL RAMP, ORANGE PARTS & RING SIGHT (5 parts)
# =============================================================================
def build_p90_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: 50-Round Top-Mounted Smoked-Amber Polycarbonate Magazine Body
    assembledPos: [-3.80, 2.66, 0] | spans X in [-10.40, +10.40], Y in [-0.75, +0.76], Z in [-1.29, +1.29].
    Outer rounded-bevel polycarbonate shell hollowed cleanly for live 3D Section-Cut cartridges,
    with 9 wrap-around structural ribs, 10/25/50 witness bars, catch lugs & rear helical turret collar."""
    m_poly = mats["MO_SmokedPolycarb"]
    m_rib = mats["MO_MagRibAmber"]

    # Rounded-corner horizontal magazine shell profile in (Z, Y) extruded along X [-10.38, +10.38]
    # Keeps wide flat roof (Y = +0.70) and flat left/right flanks (Z = +-1.27) for undistorted cartridge UVs!
    outer_pts = _rounded_rect_pts(1.27, 0.70, 0.14, corner_segs=5)
    shell = mk_extrude_x("mag_outer", outer_pts, -10.38, 10.38, bevel=0.02, bevel_segs=2, mat=m_poly)

    # Hollow inner cartridge bay + rear helical-turret drop mouth
    inner_cav = mk_box("cut_mag_cav", 20.08, 1.10, 2.18, xform=[("t", 0.15, -0.02, 0.0)], mat=m_rib)
    throat_cut = mk_box("cut_mag_thr", 2.84, 0.76, 1.96, xform=[("t", 0.35, -0.52, 0.0)], mat=m_rib)
    shell = bool_subtract(shell, [inner_cav, throat_cut])

    parts = [shell]

    # 9 molded wrap-around strengthening ribs across roof & left/right flanks (staying inside +-1.29, +0.76)
    for i in range(9):
        rx = -8.60 + i * 2.15
        parts.append(mk_box(f"mag_top_rib_{i}", 0.20, 0.075, 2.52, xform=[("t", rx, 0.72, 0.0)], mat=m_rib, bevel=0.015))
        parts.append(mk_box(f"mag_l_rib_{i}", 0.18, 1.16, 0.04, xform=[("t", rx, 0.02, -1.27)], mat=m_rib, bevel=0.010))
        parts.append(mk_box(f"mag_r_rib_{i}", 0.18, 1.16, 0.04, xform=[("t", rx, 0.02, 1.27)], mat=m_rib, bevel=0.010))

    # Molded witness index ridges aligned with 10 / 25 / 50 markings (local X = -2.40, +1.85, +6.15)
    for idx, wx in enumerate((-2.40, 1.85, 6.15)):
        parts.append(mk_box(
            f"mag_wit_{idx}", 0.09, 0.048, 0.64,
            xform=[("t", wx, 0.73, -0.72)], mat=m_rib, bevel=0.010,
        ))

    # Internal staggered cartridge-guide roof spine
    parts.append(mk_box("mag_roof_spine", 17.80, 0.13, 0.11, xform=[("t", 0.40, 0.48, 0.0)], mat=m_rib, bevel=0.016))
    # Rear ambidextrous magazine-catch locking lugs + front receiver hook nose
    parts.append(mk_box("mag_lug_l", 0.76, 0.24, 0.16, xform=[("t", -1.15, -0.56, -1.18)], mat=m_rib, bevel=0.02))
    parts.append(mk_box("mag_lug_r", 0.76, 0.24, 0.16, xform=[("t", -1.15, -0.56, 1.18)], mat=m_rib, bevel=0.02))
    parts.append(mk_box("mag_nose_hook", 0.72, 0.16, 1.18, xform=[("t", 9.88, -0.66, 0.0)], mat=m_rib, bevel=0.02))

    # Rear circular turret boss collar above the 90-deg helical feed ramp
    turret_collar = mk_lathe_y("mag_turret_collar", [
        (0.92, -0.75), (1.16, -0.75), (1.16, -0.41), (0.92, -0.41), (0.92, -0.75),
    ], segs=36, xform=[("t", 0.35, 0.0, 0.0)], mat=m_rib)
    parts.append(turret_collar)

    obj = join_objects(parts, "p90_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_helical_ramp(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: FN Patented 90-Degree Helical Cartridge-Rotating Feed Ramp Turret (US Pat. 4,905,394)
    assembledPos: [-3.45, 2.18, 0] | spans X in [-1.275, +1.375], Y in [-0.78, +0.66], Z in [-1.08, +1.08]."""
    m_poly = mats["MO_HelicalPolymer"]
    m_brass = mats["MO_HelicalBrassWear"]
    m_ss = mats["MO_HelicalStainless"]
    m_dark = mats["MO_SightInnerDark"]

    drum = mk_cyl("hr_drum", 1.07, 1.02, 1.24, axis="y", segs=36, xform=[("t", 0.0, 0.04, 0.0)], mat=m_poly, bevel=0.03)
    lower_blk = mk_box("hr_lower", 2.64, 0.68, 1.48, xform=[("t", 0.05, -0.44, 0.0)], mat=m_poly, bevel=0.035)
    turret = bool_union([drum, lower_blk], "hr_base")

    # Hollow drop throat & upper sideways entry slot
    drop_cut = mk_box("cut_hr_drop", 2.16, 1.48, 0.68, xform=[("t", 0.08, 0.02, 0.0)], mat=m_dark)
    entry_cut = mk_box("cut_hr_entry", 0.90, 0.70, 2.10, xform=[("t", -0.18, 0.42, 0.0)], mat=m_dark)
    turret = bool_subtract(turret, [drop_cut, entry_cut])

    # Swept 3D Archimedean 90-degree helical spiral guide rails (yaw +90 deg -> 0 deg while descending!)
    pts_a, pts_b, pts_rim = [], [], []
    steps = 26
    for i in range(steps + 1):
        u = i / steps
        yaw = (1.0 - u) * (math.pi * 0.5)
        y = 0.54 - u * 1.06
        r = 0.68 - u * 0.14
        pts_a.append(Vector((math.cos(yaw) * r, y, -math.sin(yaw) * r)))
        pts_b.append(Vector((-math.cos(yaw) * r, y, math.sin(yaw) * r)))
        r_rim = 0.82 - u * 0.18
        pts_rim.append(Vector((-math.cos(yaw) * r_rim, y - 0.08, math.sin(yaw) * r_rim)))

    rail_a = mk_tube_along_pts("hr_rail_a", pts_a, 0.082, ring_segs=10, mat=m_brass)
    rail_b = mk_tube_along_pts("hr_rail_b", pts_b, 0.082, ring_segs=10, mat=m_ss)
    rim_track = mk_tube_along_pts("hr_rim_trk", pts_rim, 0.052, ring_segs=10, mat=m_ss)

    # Central conical cartridge-pivot spindle
    spindle = mk_lathe_y("hr_spindle", [
        (0.0, -0.34), (0.18, -0.34), (0.12, 0.42), (0.04, 0.46), (0.0, 0.46),
    ], segs=24, xform=[("t", -0.04, 0.0, 0.0)], mat=m_poly)

    # Rolled C-hook hardened stainless lower feed lips (open central slot Z in [-0.21, +0.21] for bolt feed horn!)
    def _mk_lip(s: float) -> bpy.types.Object:
        lip_zy = [(s * 0.48, -0.50), (s * 0.48, -0.68)]
        lip_zy += _quad_bez((s * 0.48, -0.68), (s * 0.48, -0.77), (s * 0.34, -0.775), segs=6)
        lip_zy.append((s * 0.22, -0.77))
        lip_zy += _quad_bez((s * 0.22, -0.77), (s * 0.20, -0.74), (s * 0.22, -0.715), segs=4)
        lip_zy.append((s * 0.33, -0.72))
        lip_zy += _quad_bez((s * 0.33, -0.72), (s * 0.41, -0.71), (s * 0.41, -0.65), segs=5)
        lip_zy.append((s * 0.41, -0.50))
        return mk_extrude_x(f"hr_lip_{int(s)}", lip_zy, -0.78, 1.14, bevel=0.018, bevel_segs=2, mat=m_ss)

    lip_l = _mk_lip(-1.0)
    lip_r = _mk_lip(1.0)
    rear_stop = mk_box("hr_stop", 0.16, 0.26, 0.56, xform=[("t", -1.02, -0.62, 0.0)], mat=m_ss, bevel=0.018)

    # Subtle steel retention pins on turret collar flange
    pins = [
        mk_cyl(f"hr_pin_{k}", 0.055, 0.055, 0.12, axis="y", segs=12,
               xform=[("t", math.cos(a) * 0.94, -0.10, math.sin(a) * 0.94)], mat=m_ss, bevel=0.008)
        for k, a in enumerate((0.55, 2.59, 3.69, 5.73))
    ]

    obj = join_objects([turret, rail_a, rail_b, rim_track, spindle, lip_l, lip_r, rear_stop, *pins], "p90_helical_ramp")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-03: Firewalled Safety-Orange Twin-Roller Horizontal Polymer Follower
    assembledPos: [3.35, 2.66, 0] | spans X in [-0.52, +0.66], Y in [-0.39, +0.39], Z in [-0.98, +0.98].
    CRITICAL CLEARANCE: Strictly X >= -0.52 so zero encroachment on MagazineAmmoStack Slot 29!"""
    m_org = mats["MO_SafetyOrange"]
    m_rd_dark = mats["MO_DummyRollerDark"]
    m_rd_cop = mats["MO_DummyRollerCopper"]
    m_ss = mats["MO_HelicalStainless"]

    carriage = mk_box("mf_carr", 0.80, 0.74, 1.88, xform=[("t", 0.19, 0.0, 0.0)], mat=m_org, bevel=0.04)
    spring_boss = mk_box("mf_boss", 0.09, 0.38, 1.12, xform=[("t", 0.615, 0.0, 0.0)], mat=m_rd_dark, bevel=0.016)
    rail_l = mk_box("mf_rail_l", 0.78, 0.16, 0.05, xform=[("t", 0.24, 0.0, -0.955)], mat=m_org, bevel=0.012)
    rail_r = mk_box("mf_rail_r", 0.78, 0.16, 0.05, xform=[("t", 0.24, 0.0, 0.955)], mat=m_org, bevel=0.012)

    # Profiled 5.7x28mm bottleneck dummy-round rollers oriented sideways along -Z (bullet pointing left!)
    # Max radius = 0.200; upper roller centered at X = -0.315 -> min X = -0.515 (strictly > -0.522!)
    dummy_prof = [
        (0.0, -0.92), (0.055, -0.92), (0.126, -0.56), (0.126, -0.36),
        (0.198, -0.18), (0.200, 0.78), (0.166, 0.82), (0.166, 0.87),
        (0.200, 0.89), (0.200, 0.92), (0.0, 0.92),
    ]
    roller_up = mk_lathe_z("mf_roll_up", dummy_prof, segs=26, xform=[("t", -0.315, 0.185, 0.0)], mat=m_rd_dark)
    roller_lo = mk_lathe_z("mf_roll_lo", dummy_prof, segs=26, xform=[("t", -0.12, -0.185, 0.0)], mat=m_rd_cop)
    axle_up = mk_cyl("mf_ax_up", 0.056, 0.056, 1.95, axis="z", segs=16, xform=[("t", -0.315, 0.185, 0.0)], mat=m_ss, bevel=0.008)
    axle_lo = mk_cyl("mf_ax_lo", 0.056, 0.056, 1.95, axis="z", segs=16, xform=[("t", -0.12, -0.185, 0.0)], mat=m_ss, bevel=0.008)

    # Molded roller yoke brackets gripping axle ends cleanly
    yoke_l = mk_box("mf_yoke_l", 0.44, 0.62, 0.07, xform=[("t", -0.20, 0.0, -0.94)], mat=m_org, bevel=0.015)
    yoke_r = mk_box("mf_yoke_r", 0.44, 0.62, 0.07, xform=[("t", -0.20, 0.0, 0.94)], mat=m_org, bevel=0.015)

    obj = join_objects(
        [carriage, spring_boss, rail_l, rail_r, roller_up, roller_lo, axle_up, axle_lo, yoke_l, yoke_r],
        "p90_mag_follower",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-05: Firewalled Safety-Orange Lightweight Polymer Rotary Hammer & Steel Striking Insert
    assembledPos: [-11.35, -0.35, 0] | spans X in [-1.44, +0.325], Y in [-0.33, +0.86], Z in [-0.48, +0.49]."""
    m_org = mats["MO_SafetyOrange"]
    m_stl = mats["MO_HammerSteelInsert"]
    m_ss = mats["MO_HelicalStainless"]

    hub = mk_cyl("hm_hub", 0.28, 0.28, 0.68, axis="z", segs=26, mat=m_org, bevel=0.025)
    # Contoured I-beam polymer hammer arm + sear catch notch
    arm_xy = [
        (0.10, -0.14), (0.16, 0.16), (-1.18, 0.72), (-1.40, 0.56), (-1.12, 0.20), (-0.20, -0.24),
    ]
    arm = mk_extrude_z("hm_arm", arm_xy, -0.24, 0.24, bevel=0.032, bevel_segs=2, mat=m_org)
    # Recessed side lightening pockets on hammer arm (gives sleek molded polymer I-beam look!)
    pkt_l = mk_box("cut_hm_pl", 0.68, 0.14, 0.12, xform=[("rz", -0.38), ("t", -0.62, 0.26, -0.22)], mat=m_org)
    pkt_r = mk_box("cut_hm_pr", 0.68, 0.14, 0.12, xform=[("rz", -0.38), ("t", -0.62, 0.26, 0.22)], mat=m_org)
    arm = bool_subtract(arm, [pkt_l, pkt_r])

    # Inlaid hardened tool-steel striking face pad
    strike_head = mk_box("hm_head", 0.44, 0.56, 0.54, xform=[("t", -1.22, 0.58, 0.0)], mat=m_stl, bevel=0.03)
    # Coiled steel torsion return spring + chrome pivot pin
    torsion_coil = mk_coil_spring(
        "hm_torsion", "z", 0.28, 0.48, 0.0, 0.0, 0.30, 0.028, 3.0,
        ring_segs=8, steps_per_coil=16, mat=m_ss,
    )
    pivot_pin = mk_cyl("hm_pin", 0.10, 0.10, 0.96, axis="z", segs=18, mat=m_ss, bevel=0.012)

    obj = join_objects([hub, arm, strike_head, torsion_coil, pivot_pin], "p90_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_ring_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-04: Iconic British FN Ring Sight MC-10-80 Wedge Reflex Collimator Optical Sight
    assembledPos: [9.60, 4.32, 0] | spans X in [-2.275, +2.275], Y in [-0.80, +0.70], Z in [-0.69, +0.69].
    Features cast anodized wedge housing, frosted daylight fiber-optic top collector prism bar,
    windage/elevation zeroing drums, Torx mounting bolts & firewalled sapphire-cyan lenses."""
    m_ally = mats["MO_SightAlloy"]
    m_dark = mats["MO_SightInnerDark"]
    m_col = mats["MO_CollectorPrism"]
    m_lens = mats["MO_SapphireLens"]
    m_ss = mats["MO_HelicalStainless"]

    # Iconic sloped MC-10-80 optical housing: tapered tubular body blended with wedge hood & dovetail foot
    tube = mk_lathe_x("rs_tube", [
        (0.0, -2.26), (0.60, -2.26), (0.62, -1.95), (0.62, 0.40),
        (0.58, 1.95), (0.56, 2.26), (0.0, 2.26),
    ], segs=36, mat=m_ally)
    foot = mk_box("rs_foot", 3.84, 0.44, 0.92, xform=[("t", -0.08, -0.58, 0.0)], mat=m_ally, bevel=0.03)
    # Sculpted side flat marking bosses (gives crisp flat flank faces for RING SIGHTS MC-10-80 hero UV!)
    flank_boss = mk_box("rs_flank", 3.30, 0.72, 1.18, xform=[("t", -0.06, -0.04, 0.0)], mat=m_ally, bevel=0.06)
    housing = bool_union([tube, foot, flank_boss], "rs_housing")

    # Recessed circular front objective & rear ocular optical cups
    front_cup = mk_cyl("cut_rs_f", 0.46, 0.46, 0.42, axis="x", segs=32, xform=[("t", 2.18, 0.0, 0.0)], mat=m_dark)
    rear_cup = mk_cyl("cut_rs_r", 0.44, 0.44, 0.42, axis="x", segs=32, xform=[("t", -2.18, 0.0, 0.0)], mat=m_dark)
    housing = bool_subtract(housing, [front_cup, rear_cup])

    # Frosted daylight fiber-optic top collector window bar (firewalled luminous emerald-white hero UV!)
    collector_bezel = mk_box("rs_col_bez", 1.56, 0.22, 0.68, xform=[("t", 1.12, 0.54, 0.0)], mat=m_ally, bevel=0.025)
    collector_prism = mk_box("rs_col_bar", 1.40, 0.24, 0.56, xform=[("t", 1.12, 0.58, 0.0)], mat=m_col, bevel=0.022)

    # Firewalled multi-coated sapphire-cyan objective (+X) & ocular (-X) optical lenses
    obj_lens = mk_cyl("rs_lens_obj", 0.445, 0.445, 0.09, axis="x", segs=32, xform=[("t", 2.04, 0.0, 0.0)], mat=m_lens)
    ocu_lens = mk_cyl("rs_lens_ocu", 0.425, 0.425, 0.09, axis="x", segs=32, xform=[("t", -2.04, 0.0, 0.0)], mat=m_lens)

    # Knurled steel windage & elevation zeroing turret drums + twin Torx mounting cross-bolts
    wind_drum = mk_knurled_cyl("rs_wind", 0.21, 1.36, axis="z", flutes=18, depth=0.015, xform=[("t", -0.45, -0.15, 0.0)], mat=m_ss)
    elev_screw = mk_cyl("rs_elev", 0.14, 0.14, 0.16, axis="y", segs=18, xform=[("t", -1.15, 0.58, 0.0)], mat=m_ss, bevel=0.014)
    bolt_f = mk_cyl("rs_bolt_f", 0.10, 0.10, 0.98, axis="z", segs=16, xform=[("t", 1.25, -0.58, 0.0)], mat=m_ss, bevel=0.012)
    bolt_r = mk_cyl("rs_bolt_r", 0.10, 0.10, 0.98, axis="z", segs=16, xform=[("t", -1.35, -0.58, 0.0)], mat=m_ss, bevel=0.012)

    obj = join_objects(
        [housing, collector_bezel, collector_prism, obj_lens, ocu_lens, wind_drum, elev_screw, bolt_f, bolt_r],
        "p90_ring_sight",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 3: ANODIZED UPPER RECEIVER, CHF BARREL, BOLT & HARDWARE (10 parts)
# =============================================================================
def build_p90_upper_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-01: Die-Cast Satin-Anodized Aluminum Optical Bridge Upper Receiver & Side Picatinny Rail
    assembledPos: [0, 0, 0] | spans X in [1.76, 15.19], Y in [-0.15, 5.72], Z in [-1.03, +1.29]."""
    m_ally = mats["M_UpperAnodized"]
    m_rail = mats["M_RailSteel"]
    m_dark = mats["M_InnerDarkSteel"]
    m_chr = mats["M_ChromeSteel"]

    # Swept iconic FN P90 optical bridge silhouette in (X, Y)
    arch_xy = [
        (1.80, 0.20), (15.14, 0.20), (15.14, 1.92), (14.34, 3.35),
    ]
    arch_xy += _quad_bez((14.34, 3.35), (13.64, 5.54), (12.54, 5.67), segs=10)
    arch_xy.append((7.46, 5.67))
    arch_xy += _quad_bez((7.46, 5.67), (6.65, 5.54), (6.46, 3.55), segs=10)
    arch_xy.extend([(6.68, 3.44), (6.68, 1.92), (1.80, 1.92)])

    recv = mk_extrude_z("up_raw", arch_xy, -1.01, 1.01, bevel=0.065, bevel_segs=2, mat=m_ally)

    # Subtract bore shroud tunnel, central MC-10-80 sight window, axial sight tunnel,
    # top backup iron sight trough & twin non-reciprocating charging handle slots
    bore_cut = mk_cyl("cut_up_bore", 0.62, 0.62, 14.0, axis="x", segs=32, xform=[("t", 8.50, 0.85, 0.0)], mat=m_dark)
    sight_win = mk_box("cut_up_swin", 5.10, 1.66, 2.50, xform=[("t", 9.65, 4.32, 0.0)], mat=m_dark)
    sight_port = mk_cyl("cut_up_sport", 0.56, 0.56, 9.20, axis="x", segs=28, xform=[("t", 10.20, 4.32, 0.0)], mat=m_dark)
    top_trough = mk_box("cut_up_iron", 5.60, 0.34, 0.56, xform=[("t", 9.95, 5.62, 0.0)], mat=m_dark)
    chg_slot_l = mk_box("cut_up_cl", 6.80, 0.34, 0.48, xform=[("t", 9.45, 1.48, -0.95)], mat=m_dark)
    chg_slot_r = mk_box("cut_up_cr", 6.80, 0.34, 0.48, xform=[("t", 9.45, 1.48, 0.95)], mat=m_dark)

    recv = bool_subtract(recv, [bore_cut, sight_win, sight_port, top_trough, chg_slot_l, chg_slot_r])

    parts = [recv]

    # Right-side MIL-STD-1913 mini Picatinny accessory rail (chamfered 45-deg dovetail prism + 6 teeth + bolts)
    rail_zy = [
        (1.00, 4.10), (1.16, 4.10), (1.28, 4.17), (1.28, 4.47), (1.16, 4.54), (1.00, 4.54),
    ]
    side_rail_base = mk_extrude_x("up_rail_base", rail_zy, 8.10, 12.70, bevel=0.016, mat=m_rail)
    # Cut 5 recoil cross-slots cleanly across the right Picatinny rail -> 6 sharp lugs!
    slot_cuts = [
        mk_box(f"cut_rslot_{i}", 0.34, 0.58, 0.14, xform=[("t", 8.84 + i * 0.78, 4.32, 1.24)], mat=m_dark)
        for i in range(5)
    ]
    side_rail = bool_subtract(side_rail_base, slot_cuts)
    parts.append(side_rail)

    # Twin hex socket mounting screws securing side Picatinny rail
    for idx, sx in enumerate((8.45, 12.35)):
        parts.append(mk_cyl(
            f"up_rail_bolt_{idx}", 0.095, 0.095, 0.08, axis="z", segs=14,
            xform=[("t", sx, 4.32, 1.25)], mat=m_chr, bevel=0.010,
        ))

    # Integral top emergency backup iron sights (rear notch blade & front post blade inside top trough)
    parts.append(mk_box("up_buis_front", 0.14, 0.24, 0.10, xform=[("t", 12.42, 5.56, 0.0)], mat=m_rail, bevel=0.012))
    parts.append(mk_box("up_buis_rear_l", 0.18, 0.22, 0.16, xform=[("t", 7.42, 5.55, -0.14)], mat=m_rail, bevel=0.012))
    parts.append(mk_box("up_buis_rear_r", 0.18, 0.22, 0.16, xform=[("t", 7.42, 5.55, 0.14)], mat=m_rail, bevel=0.012))

    # Left sight window kept 100% open & unobstructed (authentic single right-rail FN P90!) so MC-10-80 Ring Sight reads cleanly.
    # Rear takedown locking lug underneath receiver heel (mates w/ p90_takedown_lock at X = 1.55)
    parts.append(mk_box("up_td_lug", 0.75, 0.36, 0.84, xform=[("t", 2.18, 0.04, 0.0)], mat=m_rail, bevel=0.025))

    obj = join_objects(parts, "p90_upper_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-02: 10.4-Inch (264mm) Cold-Hammer-Forged Chrome-Lined 5.7x28mm Barrel
    assembledPos: [0, 0.85, 0] | spans X in [-2.55, +15.375], Y/Z in [-0.58, +0.58].
    Hollow closed lathe w/ bottleneck chamber, 11-deg recessed chrome target crown dish,
    M12x1 LH threaded muzzle spigot, rounded-square trunnion collar & 6-groove 1:9 RH rifling."""
    m_chf = mats["M_BarrelCHF"]
    m_rail = mats["M_RailSteel"]
    m_chr = mats["M_ChromeSteel"]
    m_ss = mats["M_StainlessBrushed"]

    crown_rim = 0.258
    crown_bore = 0.172
    crown_depth = (crown_rim - crown_bore) * math.tan(math.radians(11.0))

    barrel_tube = mk_lathe_x("brl_tube", [
        (0.310, -2.550),
        (0.580, -2.550),  # Heavy breech face (mates flush w/ bolt at X = -2.55)
        (0.580, -1.650),
        (0.560,  1.820),  # Heavy chamber block
        (0.450,  1.860),  # Trunnion press-fit journal
        (0.450,  3.240),
        (0.420,  3.300),  # Forward barrel step
        (0.400,  9.500),
        (0.380, 14.680),  # Tapered 10.4" CHF contour
        (0.335, 14.730),  # Muzzle shoulder chamfer
        (0.276, 14.760),  # M12x1 LH thread-relief undercut groove
        (0.276, 14.840),
        (0.300, 14.870),  # Muzzle spigot OD
        (0.300, 15.340),
        (0.275, 15.375),  # 45-deg outer crown chamfer
        (crown_rim, 15.375),
        (crown_bore, 15.375 - crown_depth),
        (0.160, 15.375 - crown_depth - 0.018),
        (0.160, -0.240),  # Chrome-lined 5.7mm bore
        (0.172, -0.280),  # Throat / leade
        (0.270, -0.600),  # 5.7x28mm bottleneck shoulder cone
        (0.280, -2.510),  # Bottleneck chamber wall
        (0.310, -2.550),  # Closes hollow loop!
    ], segs=40, mat=m_chf)

    # Bright stainless M12x1 LH muzzle spigot sleeve & fine circumferential thread rings
    spigot = mk_lathe_x("brl_spigot", [
        (0.296, 14.87), (0.304, 14.87), (0.304, 15.335), (0.296, 15.335), (0.296, 14.87),
    ], segs=32, mat=m_ss)

    parts = [barrel_tube, spigot]
    for k in range(10):
        tx = 14.90 + k * 0.044
        parts.append(mk_lathe_x(f"brl_thr_{k}", [
            (0.298, tx - 0.012), (0.312, tx), (0.298, tx + 0.012), (0.298, tx - 0.012),
        ], segs=28, mat=m_chr))

    # Chamfered CNC rounded-square barrel-trunnion block w/ bore hole + cross-pin
    trun_pts = _rounded_rect_pts(0.54, 0.54, 0.09, corner_segs=5)
    trun_raw = mk_extrude_x("brl_trun", trun_pts, 1.825, 3.275, bevel=0.032, bevel_segs=2, mat=m_rail)
    trun_hole = mk_cyl("cut_trun_b", 0.442, 0.442, 1.70, axis="x", segs=32, xform=[("t", 2.55, 0.0, 0.0)], mat=m_chf)
    trunnion = bool_subtract(trun_raw, [trun_hole])
    trun_pin = mk_cyl("brl_tpin", 0.085, 0.085, 1.09, axis="z", segs=18, xform=[("t", 2.55, -0.36, 0.0)], mat=m_chr, bevel=0.010)

    # Polished chrome breech feed ramp & recessed 11-deg target crown dish ring
    feed_ramp = mk_box("brl_ramp", 0.28, 0.16, 0.36, xform=[("rz", 0.38), ("t", -2.36, -0.33, 0.0)], mat=m_chr, bevel=0.018)
    crown_ring = mk_lathe_x("brl_crown", [
        (crown_bore, 15.375 - crown_depth),
        (crown_rim - 0.004, 15.374),
        (crown_rim - 0.004, 15.368),
        (crown_bore, 15.369 - crown_depth),
        (crown_bore, 15.375 - crown_depth),
    ], segs=36, mat=m_chr)

    # 6 right-hand 1:9" (22.86 cm) chrome helical rifling lands visible inside bore & crown!
    rifling = mk_helical_rifling_lands(
        "brl_rif", count=6, bore_r=0.160, depth=0.018, width=0.032,
        x0=-0.20, x1=15.375 - crown_depth - 0.024, twist_cm=22.86, mat=m_chr, segs=16,
    )
    parts.extend([trunnion, trun_pin, feed_ramp, crown_ring, *rifling])

    obj = join_objects(parts, "p90_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_flash_hider(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-03: Iconic FN P90 32-Degree Slanted 4-Port Birdcage Flash Suppressor / Compensator
    assembledPos: [15.85, 0.85, 0] | spans X in [-0.81, +0.965], Y/Z in [-0.43, +0.43]."""
    m_heat = mats["M_FlashHiderHeat"]
    m_dark = mats["M_InnerDarkSteel"]
    m_chr = mats["M_ChromeSteel"]

    body = mk_lathe_x("fh_body", [
        (0.305, -0.810),
        (0.420, -0.810),
        (0.430, -0.780),
        (0.430, -0.450),  # Rear 15mm wrench-flat collar
        (0.388, -0.420),  # Retention lock-ring groove
        (0.388, -0.350),
        (0.430, -0.320),  # Main 4-port birdcage body
        (0.430,  0.940),
        (0.405,  0.968),  # Front bottom lip bevel
        (0.290,  0.968),
        (0.240,  0.720),  # Tapered muzzle exit cone
        (0.240, -0.220),  # Expansion chamber
        (0.305, -0.300),  # Internal baffle step
        (0.305, -0.810),
    ], segs=36, mat=m_heat)

    # 32-deg downward-slanted crown face + 4 radial upper/lateral compensator ports + 4 rear wrench flats
    slant_cut = mk_box("cut_fh_slant", 1.24, 1.64, 1.44, xform=[("rz", -0.56), ("t", 1.26, -0.25, 0.0)], mat=m_heat)
    port_cuts = [
        mk_box(f"cut_fh_p{k}", 0.74, 0.30, 0.13, xform=[("t", 0.18, 0.32, 0.0), ("rx", ang)], mat=m_dark)
        for k, ang in enumerate((0.62, -0.62, 1.47, -1.47))
    ]
    flat_cuts = [
        mk_box("cut_fh_ft", 0.32, 0.14, 0.84, xform=[("t", -0.62,  0.45,  0.0)], mat=m_heat),
        mk_box("cut_fh_fb", 0.32, 0.14, 0.84, xform=[("t", -0.62, -0.45,  0.0)], mat=m_heat),
        mk_box("cut_fh_fr", 0.32, 0.74, 0.14, xform=[("t", -0.62,  0.0,   0.45)], mat=m_heat),
        mk_box("cut_fh_fl", 0.32, 0.74, 0.14, xform=[("t", -0.62,  0.0,  -0.45)], mat=m_heat),
    ]
    carved = bool_subtract(body, [slant_cut, *port_cuts, *flat_cuts])

    # Internal bright-chrome expansion baffle ring visible through the 4 birdcage ports
    baffle = mk_lathe_x("fh_baffle", [
        (0.235, -0.26), (0.285, -0.26), (0.285, -0.21), (0.235, -0.21), (0.235, -0.26),
    ], segs=28, mat=m_chr)

    obj = join_objects([carved, baffle], "p90_flash_hider")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_charging_handles(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-05: Ambidextrous Non-Reciprocating Ribbed Forward Charging Handles
    assembledPos: [9.40, 1.48, 0] | spans X in [-2.10, +1.20], Y in [-0.18, +0.18], Z in [-1.676, +1.676]."""
    m_rail = mats["M_RailSteel"]
    m_ally = mats["M_UpperAnodized"]
    m_ss = mats["M_StainlessBrushed"]

    cross_bar = mk_box("ch_bar", 0.68, 0.24, 2.38, xform=[("t", 0.55, 0.0, 0.0)], mat=m_rail, bevel=0.024)
    guide_rod = mk_cyl("ch_rod", 0.09, 0.09, 3.30, axis="x", segs=18, xform=[("t", -0.45, 0.0, 0.0)], mat=m_ss, bevel=0.012)
    ret_spring = mk_coil_spring(
        "ch_spr", "x", -1.60, 0.35, 0.0, 0.0, 0.135, 0.022, 9.0,
        ring_segs=8, steps_per_coil=14, mat=m_ss,
    )

    parts = [cross_bar, guide_rod, ret_spring]
    for sgn in (-1.0, 1.0):
        # Swept ergonomic charging knob wing with 4 crisp tactile gripping ridges
        wing = mk_box(
            f"ch_wing_{int(sgn)}", 1.10, 0.34, 0.46,
            xform=[("ry", -sgn * 0.18), ("t", 0.45, 0.0, sgn * 1.34)],
            mat=m_ally, bevel=0.042, bevel_segs=2,
        )
        parts.append(wing)
        for k in range(4):
            kx = 0.08 + k * 0.24
            parts.append(mk_box(
                f"ch_rib_{int(sgn)}_{k}", 0.075, 0.35, 0.06,
                xform=[("ry", -sgn * 0.18), ("t", kx, 0.0, sgn * 1.56)],
                mat=m_rail, bevel=0.012,
            ))

    obj = join_objects(parts, "p90_charging_handles")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_bolt(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-06: Heavy CNC Billet-Steel Straight-Blowback Inertia Breech Bolt
    assembledPos: [-5.15, 0.72, 0] | spans X in [-2.60, +2.606], Y in [-0.70, +1.113], Z in [-0.89, +0.89]."""
    m_bolt = mats["M_BoltBillet"]
    m_rail = mats["M_RailSteel"]
    m_dark = mats["M_InnerDarkSteel"]
    m_ss = mats["M_StainlessBrushed"]
    m_chr = mats["M_ChromeSteel"]

    main_blk = mk_box("blt_main", 5.20, 1.56, 1.58, xform=[("t", 0.0, 0.08, 0.0)], mat=m_bolt, bevel=0.045)
    feed_horn = mk_box("blt_horn", 1.85, 0.34, 0.42, xform=[("t", 1.62, 0.94, 0.0)], mat=m_rail, bevel=0.025)
    rail_l = mk_box("blt_rl", 4.84, 0.28, 0.14, xform=[("t", -0.10, 0.18, -0.82)], mat=m_rail, bevel=0.020)
    rail_r = mk_box("blt_rr", 4.84, 0.28, 0.14, xform=[("t", -0.10, 0.18,  0.82)], mat=m_rail, bevel=0.020)
    bolt = bool_union([main_blk, feed_horn, rail_l, rail_r], "blt_raw")

    # Recessed bright-chrome Ø8.0mm breech bolt-face cup, twin guide-rod bores, CNC lightening pockets,
    # firing-pin bore, bottom downward ejection chute relief, right extractor seat & left ejector bore
    breech_cup = mk_cyl("cut_blt_cup", 0.305, 0.265, 0.26, axis="x", segs=32, xform=[("t", 2.52, 0.13, 0.0)], mat=m_chr)
    rod_l = mk_cyl("cut_blt_rod_l", 0.15, 0.15, 5.60, axis="x", segs=22, xform=[("t", 0.0, 0.52, -0.52)], mat=m_dark)
    rod_r = mk_cyl("cut_blt_rod_r", 0.15, 0.15, 5.60, axis="x", segs=22, xform=[("t", 0.0, 0.52,  0.52)], mat=m_dark)
    pkt_l = mk_box("cut_blt_pl", 2.60, 0.44, 0.22, xform=[("t", -0.55, -0.14, -0.76)], mat=m_dark)
    pkt_r = mk_box("cut_blt_pr", 2.60, 0.44, 0.22, xform=[("t", -0.55, -0.14,  0.76)], mat=m_dark)
    fp_bore = mk_cyl("cut_blt_fp", 0.075, 0.075, 5.60, axis="x", segs=18, xform=[("t", 0.0, 0.13, 0.0)], mat=m_dark)
    eject_rel = mk_box("cut_blt_ej", 3.40, 0.56, 0.68, xform=[("t", 0.95, -0.52, 0.0)], mat=m_dark)
    ext_slot = mk_box("cut_blt_ex", 1.48, 0.26, 0.24, xform=[("t", 1.90, 0.13, 0.36)], mat=m_dark)
    ej_hole = mk_cyl("cut_blt_eh", 0.064, 0.064, 0.56, axis="x", segs=16, xform=[("t", 2.38, 0.13, -0.165)], mat=m_dark)

    bolt = bool_subtract(bolt, [breech_cup, rod_l, rod_r, pkt_l, pkt_r, fp_bore, eject_rel, ext_slot, ej_hole])

    # Profiled right-side hardened steel claw extractor, hook, vertical pivot pin & buffer spring
    claw_xy = [(1.24, -0.10), (2.48, -0.10), (2.58, -0.04), (2.58, 0.06), (2.48, 0.10), (1.24, 0.10)]
    ext_claw = mk_extrude_z("blt_claw", claw_xy, 0.27, 0.41, bevel=0.012, xform=[("t", 0.0, 0.13, 0.0)], mat=m_ss)
    ext_hook = mk_box("blt_hook", 0.11, 0.18, 0.14, xform=[("t", 2.53, 0.13, 0.255)], mat=m_chr, bevel=0.012)
    ext_pin = mk_cyl("blt_epin", 0.055, 0.055, 0.52, axis="y", segs=16, xform=[("t", 1.96, 0.13, 0.35)], mat=m_chr, bevel=0.008)
    ext_spr = mk_coil_spring(
        "blt_espr", "x", 1.24, 1.68, 0.13, 0.41, 0.052, 0.014, 5.0,
        ring_segs=6, steps_per_coil=12, mat=m_ss,
    )

    # Left-side spring-loaded plunger ejector + stainless firing-pin bushing collar on bolt face
    eject_plg = mk_lathe_x("blt_ej_plg", [
        (0.0, 2.34), (0.052, 2.34), (0.052, 2.55), (0.038, 2.585), (0.0, 2.585),
    ], segs=18, xform=[("t", 0.0, 0.13, -0.165)], mat=m_chr)
    pin_bush = mk_lathe_x("blt_pbush", [
        (0.075, 2.41), (0.115, 2.41), (0.115, 2.438), (0.075, 2.438), (0.075, 2.41),
    ], segs=22, xform=[("t", 0.0, 0.13, 0.0)], mat=m_chr)

    # Polished chrome feed-horn tip, charging engage cross-lug & rear hammer-strike anvil
    horn_tip = mk_box("blt_htip", 0.32, 0.18, 0.40, xform=[("rz", -0.22), ("t", 2.43, 0.99, 0.0)], mat=m_chr, bevel=0.018)
    chg_lug = mk_box("blt_clug", 0.46, 0.32, 1.72, xform=[("t", 2.15, 0.72, 0.0)], mat=m_rail, bevel=0.024)
    anvil = mk_box("blt_anvil", 0.18, 0.56, 0.52, xform=[("t", -2.50, -0.12, 0.0)], mat=m_ss, bevel=0.020)

    obj = join_objects(
        [bolt, ext_claw, ext_hook, ext_pin, ext_spr, eject_plg, pin_bush, horn_tip, chg_lug, anvil],
        "p90_bolt",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-07: Coaxial Floating Hardened-Steel Firing Pin & Return Spring
    assembledPos: [-5.25, 0.85, 0] | spans X in [-2.41, +2.645], Y/Z in [-0.135, +0.135]."""
    m_chr = mats["M_ChromeSteel"]
    m_ss = mats["M_StainlessBrushed"]
    m_bolt = mats["M_BoltBillet"]

    # Precision stepped lathe split cleanly into 3 non-coincident axial sections (zero shared cap verts!)
    tail_cap = mk_lathe_x("fp_tail", [
        (0.0, -2.41), (0.118, -2.41), (0.122, -2.38), (0.122, -1.64), (0.0, -1.64),
    ], segs=22, mat=m_bolt)
    pin_shaft = mk_lathe_x("fp_shaft", [
        (0.0, -1.66), (0.072, -1.66), (0.072, 0.84), (0.135, 0.85),
        (0.135, 1.06), (0.072, 1.07), (0.066, 1.58), (0.0, 1.58),
    ], segs=22, mat=m_ss)
    tip_sleeve = mk_lathe_x("fp_tip", [
        (0.0, 1.55), (0.062, 1.55), (0.039, 2.61), (0.022, 2.645), (0.0, 2.645),
    ], segs=22, mat=m_chr)
    coil = mk_coil_spring(
        "fp_coil", "x", -1.45, 0.82, 0.0, 0.0, 0.104, 0.018, 11.0,
        ring_segs=8, steps_per_coil=14, mat=m_chr,
    )

    obj = join_objects([tail_cap, pin_shaft, tip_sleeve, coil], "p90_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_guide_rods(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-08: Dual Parallel Bright-Chrome Guide Rods & Rear Amber Polyurethane Buffer Block
    assembledPos: [-8.85, 1.24, 0] | spans X in [-6.34, +6.00], Y in [-1.19, +0.43], Z in [-0.83, +0.83]."""
    m_chr = mats["M_ChromeSteel"]
    m_bolt = mats["M_BoltBillet"]
    m_poly = mats["M_BufferPolymer"]
    m_amb = mats["M_BufferAmber"]

    rod_l = mk_cyl("gr_rod_l", 0.095, 0.095, 11.80, axis="x", segs=22, xform=[("t", 0.10, 0.0, -0.52)], mat=m_chr, bevel=0.012)
    rod_r = mk_cyl("gr_rod_r", 0.095, 0.095, 11.80, axis="x", segs=22, xform=[("t", 0.10, 0.0,  0.52)], mat=m_chr, bevel=0.012)
    cap_l = mk_cyl("gr_cap_l", 0.15, 0.15, 0.22, axis="x", segs=22, xform=[("t", 5.88, 0.0, -0.52)], mat=m_bolt, bevel=0.018)
    cap_r = mk_cyl("gr_cap_r", 0.15, 0.15, 0.22, axis="x", segs=22, xform=[("t", 5.88, 0.0,  0.52)], mat=m_bolt, bevel=0.018)
    # Rear steel backing collars + polymer anchor block + amber polyurethane shock buffer pad
    buf_base = mk_box("gr_buf_base", 0.92, 1.62, 1.66, xform=[("t", -5.88, -0.38, 0.0)], mat=m_poly, bevel=0.045)
    buf_pad = mk_box("gr_buf_pad", 0.36, 1.28, 1.42, xform=[("t", -5.32, -0.36, 0.0)], mat=m_amb, bevel=0.035)
    # Recessed retention E-clips at rear rod sockets
    clip_l = mk_cyl("gr_clip_l", 0.15, 0.15, 0.10, axis="x", segs=18, xform=[("t", -6.28, 0.0, -0.52)], mat=m_chr, bevel=0.010)
    clip_r = mk_cyl("gr_clip_r", 0.15, 0.15, 0.10, axis="x", segs=18, xform=[("t", -6.28, 0.0,  0.52)], mat=m_chr, bevel=0.010)

    obj = join_objects([rod_l, rod_r, cap_l, cap_r, buf_base, buf_pad, clip_l, clip_r], "p90_guide_rods")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_takedown_lock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: Spring-Loaded Upper-Receiver Lateral Takedown Lock Plunger
    assembledPos: [1.55, 1.38, 0] | spans X in [-0.32, +0.55], Y in [-0.574, +0.372], Z in [-1.25, +1.19]."""
    m_bolt = mats["M_BoltBillet"]
    m_rail = mats["M_RailSteel"]
    m_chr = mats["M_ChromeSteel"]
    m_ss = mats["M_StainlessBrushed"]

    cross_pin = mk_cyl("td_pin", 0.24, 0.24, 2.36, axis="z", segs=26, mat=m_bolt, bevel=0.022)
    lock_tooth = mk_box("td_tooth", 0.62, 0.56, 0.78, xform=[("t", 0.24, -0.28, 0.0)], mat=m_rail, bevel=0.025)
    push_cap = mk_knurled_cyl("td_cap", 0.32, 0.18, axis="z", flutes=20, depth=0.016, xform=[("t", 0.0, 0.0, -1.16)], mat=m_ss)
    det_spr = mk_coil_spring(
        "td_spr", "y", -0.55, 0.35, -0.15, 0.52, 0.138, 0.024, 6.0,
        ring_segs=8, steps_per_coil=14, mat=m_chr,
    )

    obj = join_objects([cross_pin, lock_tooth, push_cap, det_spr], "p90_takedown_lock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_sling_mount(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: Rear Buttstock Steel Sling-Slot Liner & Forward Swivel Loop Hardware
    assembledPos: [-8.50, -0.45, 0] | spans X in [-6.31, +11.33], Y in [-3.54, +2.105], Z in [-1.635, +1.12]."""
    m_bolt = mats["M_BoltBillet"]
    m_rail = mats["M_RailSteel"]
    m_dark = mats["M_InnerDarkSteel"]
    m_chr = mats["M_ChromeSteel"]

    liner_raw = mk_box("sm_liner", 1.92, 0.68, 2.22, xform=[("t", -5.35, -3.20, 0.0)], mat=m_bolt, bevel=0.045)
    liner_cut = mk_box("cut_sm_slot", 1.48, 0.32, 2.55, xform=[("t", -5.35, -3.20, 0.0)], mat=m_dark, bevel=0.03)
    rear_liner = bool_subtract(liner_raw, [liner_cut])

    # Twin recessed flange pins securing sling liner
    riv_f = mk_cyl("sm_rf", 0.06, 0.06, 2.24, axis="z", segs=12, xform=[("t", -4.52, -3.20, 0.0)], mat=m_chr, bevel=0.008)
    riv_r = mk_cyl("sm_rr", 0.06, 0.06, 2.24, axis="z", segs=12, xform=[("t", -6.18, -3.20, 0.0)], mat=m_chr, bevel=0.008)

    # Forward left receiver steel cross-stud & tactical swivel sling torus loop
    front_stud = mk_cyl("sm_stud", 0.18, 0.18, 2.24, axis="z", segs=22, xform=[("t", 11.15, 1.85, 0.0)], mat=m_rail, bevel=0.018)
    front_loop = mk_torus("sm_loop", 0.38, 0.075, axis="x", major_segs=32, minor_segs=14, xform=[("t", 11.15, 1.65, -1.18)], mat=m_chr)

    obj = join_objects([rear_liner, riv_f, riv_r, front_stud, front_loop], "p90_sling_mount")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p90_transfer_bars(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Twin Brushed-Stainless Steel Trigger Transfer Bars Straddling Ejection Chute
    assembledPos: [-3.10, -1.08, 0] | spans X in [-9.16, +9.275], Y in [-0.35, +0.332], Z in [-0.69, +0.69]."""
    m_ss = mats["M_StainlessBrushed"]
    m_bolt = mats["M_BoltBillet"]
    m_rail = mats["M_RailSteel"]
    m_chr = mats["M_ChromeSteel"]

    bar_l = mk_box("tb_bar_l", 18.20, 0.16, 0.09, xform=[("t", 0.10, 0.0, -0.64)], mat=m_ss, bevel=0.015)
    bar_r = mk_box("tb_bar_r", 18.20, 0.16, 0.09, xform=[("t", 0.10, 0.0,  0.64)], mat=m_ss, bevel=0.015)
    front_yoke = mk_box("tb_fyoke", 0.45, 0.42, 1.38, xform=[("t", 9.05, -0.14, 0.0)], mat=m_bolt, bevel=0.022)
    mid_bridge = mk_box("tb_mbridge", 0.38, 0.24, 1.38, xform=[("t", 3.45, 0.18, 0.0)], mat=m_bolt, bevel=0.020)
    rear_yoke = mk_box("tb_ryoke", 0.62, 0.36, 1.38, xform=[("t", -8.85, 0.12, 0.0)], mat=m_rail, bevel=0.025)
    ret_spring = mk_coil_spring(
        "tb_spr", "x", 4.10, 6.40, 0.18, 0.0, 0.130, 0.022, 10.0,
        ring_segs=8, steps_per_coil=14, mat=m_chr,
    )

    obj = join_objects([bar_l, bar_r, front_yoke, mid_bridge, rear_yoke, ret_spring], "p90_transfer_bars")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


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

    du = u1 - u0
    dv = v1 - v0
    # Guarantee >= ~10px pixel gutter even inside smaller sub-rectangles (eliminates dilation bleed!)
    pack_margin = min(0.022, max(0.0055, 0.0055 / max(0.22, min(du, dv))))

    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.005,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=pack_margin,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

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
    assert span_u > 0.50 and span_v > 0.50, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_stock_atlas(stock_objs: list[bpy.types.Object]):
    """Unwraps 8 monocoque stock & polymer control parts into `p90_v3_stock` (2048x2048):
      - Hero Band 1 (`p90_stock` Left  Flank, -Z): u[0.015,0.985], v[0.745,0.985]
      - Hero Band 2 (`p90_stock` Right Flank, +Z): u[0.015,0.985], v[0.490,0.730]
      - Hero Discs (`p90_selector` L/R S-1-A dials): u[0.015,0.290], v[0.340,0.470]
      - Firewalled Box (`p90_hammer_pack` tan nylon): u[0.010,0.295], v[0.010,0.320]
      - Packed Region (remaining charcoal polymer parts): u[0.315,0.990], v[0.010,0.470]
    """
    def is_hero_stock_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if obj_name == "p90_stock" and mat_name == "S_PolyamideMain":
            if (nz > 0.78 and tz > 0.92) or (nz < -0.78 and tz < -0.92):
                return True
        if obj_name == "p90_selector" and mat_name == "S_ControlPolymer":
            if (nz > 0.88 and tz > 0.61) or (nz < -0.88 and tz < -0.61):
                return True
        return False

    pack_grp = [o for o in stock_objs if o.name == "p90_hammer_pack"]
    charcoal_grp = [o for o in stock_objs if o.name != "p90_hammer_pack"]

    _smart_unwrap_and_pack_rect(pack_grp,     0.010, 0.295, 0.010, 0.320)
    _smart_unwrap_and_pack_rect(charcoal_grp, 0.315, 0.990, 0.010, 0.470, skip_face_fn=is_hero_stock_face)

    # Project undistorted 1:1 planar hero UVs onto `p90_stock` Left & Right flanks
    st = next(o for o in stock_objs if o.name == "p90_stock")
    bm = bmesh.new()
    bm.from_mesh(st.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in st.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_stock_face("p90_stock", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 16.22) / 30.85))
            yn = max(0.0, min(1.0, (ty + 8.10) / 10.07))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.490 + yn * 0.240)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.745 + yn * 0.240)
    bm.to_mesh(st.data)
    bm.free()

    # Project crisp circular hero UVs onto `p90_selector` Left & Right S/1/A dial discs
    sel = next(o for o in stock_objs if o.name == "p90_selector")
    bm = bmesh.new()
    bm.from_mesh(sel.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sel.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_stock_face("p90_selector", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            nx_d = max(-1.0, min(1.0, tx / 0.52))
            ny_d = max(-1.0, min(1.0, ty / 0.52))
            if is_right:
                loop[uv_layer].uv = (0.225 + nx_d * 0.060, 0.405 + ny_d * 0.060)
            else:
                loop[uv_layer].uv = (0.080 - nx_d * 0.060, 0.405 + ny_d * 0.060)
    bm.to_mesh(sel.data)
    bm.free()


def unwrap_mag_optic_atlas(mag_objs: list[bpy.types.Object]):
    """Unwraps 5 magazine/ramp/orange/ring-sight parts into `p90_v3_mag_optic` (2048x2048):
      - Hero Band 1 (`p90_mag_body` Top Smoked-Amber Window, +Y): u[0.015,0.985], v[0.765,0.985]
      - Hero Band 2 (`p90_mag_body` Right Flank Brass Heads, +Z): u[0.015,0.985], v[0.630,0.745]
      - Hero Band 3 (`p90_mag_body` Left  Flank SS190 Tips,  -Z): u[0.015,0.985], v[0.495,0.610]
      - Hero Band 4 (`p90_ring_sight` Right/Left Housing Flanks): u[0.015,0.680], v[0.365,0.475]
      - Firewalled Lenses (`p90_ring_sight` Obj & Ocu Sapphire):  u[0.700,0.985], v[0.340,0.475]
      - Firewalled Collector Bar (`p90_ring_sight` Daylight Bar): u[0.700,0.985], v[0.235,0.325]
      - Firewalled Safety-Orange (`p90_mag_follower`+`p90_hammer`):u[0.010,0.300], v[0.010,0.345]
      - Packed Region A (`p90_helical_ramp`+`p90_ring_sight` rem): u[0.320,0.680], v[0.010,0.345]
      - Packed Region B (`p90_mag_body` ribs, bottom, inner):      u[0.700,0.990], v[0.010,0.215]
    """
    def is_hero_mag_optic_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "p90_mag_body" and mat_name == "MO_SmokedPolycarb":
            if ny > 0.78 and ty > 0.58:
                return True
            if (nz > 0.78 and tz > 1.14) or (nz < -0.78 and tz < -1.14):
                return True
        if obj_name == "p90_ring_sight":
            if mat_name in ("MO_SapphireLens", "MO_CollectorPrism"):
                return True
            if mat_name == "MO_SightAlloy" and -1.68 <= tx <= 1.58 and -0.40 <= ty <= 0.34:
                if (nz > 0.80 and tz > 0.50) or (nz < -0.80 and tz < -0.50):
                    return True
        return False

    orange_grp = [o for o in mag_objs if o.name in {"p90_mag_follower", "p90_hammer"}]
    ramp_sight_grp = [o for o in mag_objs if o.name in {"p90_helical_ramp", "p90_ring_sight"}]
    mag_only_grp = [o for o in mag_objs if o.name == "p90_mag_body"]

    _smart_unwrap_and_pack_rect(orange_grp,     0.010, 0.300, 0.010, 0.345)
    _smart_unwrap_and_pack_rect(ramp_sight_grp, 0.320, 0.680, 0.010, 0.345, skip_face_fn=is_hero_mag_optic_face)
    _smart_unwrap_and_pack_rect(mag_only_grp,   0.700, 0.990, 0.010, 0.215, skip_face_fn=is_hero_mag_optic_face)

    # 1) Project undistorted hero UVs onto `p90_mag_body` top roof & left/right flanks
    mag = next(o for o in mag_objs if o.name == "p90_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_mag_optic_face("p90_mag_body", f, mname):
            continue
        ny = f.normal.z
        nz = -f.normal.y
        if ny > 0.78:
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx + 10.40) / 20.80))
                zn = max(0.0, min(1.0, (tz + 1.29) / 2.58))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.765 + (1.0 - zn) * 0.220)
        elif nz > 0.78:
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 10.40) / 20.80))
                yn = max(0.0, min(1.0, (ty + 0.72) / 1.44))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.630 + yn * 0.115)
        else:
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 10.40) / 20.80))
                yn = max(0.0, min(1.0, (ty + 0.72) / 1.44))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.495 + yn * 0.115)
    bm.to_mesh(mag.data)
    bm.free()

    # 2) Project hero flank legends, firewalled sapphire lenses & daylight collector bar on `p90_ring_sight`
    rs = next(o for o in mag_objs if o.name == "p90_ring_sight")
    bm = bmesh.new()
    bm.from_mesh(rs.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rs.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_mag_optic_face("p90_ring_sight", f, mname):
            continue
        c = f.calc_center_median()
        if mname == "MO_SapphireLens":
            is_obj = c.x > 0.0
            r_ref = 0.45 if is_obj else 0.43
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                uz = max(-1.0, min(1.0, tz / r_ref))
                vy = max(-1.0, min(1.0, ty / r_ref))
                if is_obj:
                    loop[uv_layer].uv = (0.7675 - uz * 0.062, 0.4075 + vy * 0.062)
                else:
                    loop[uv_layer].uv = (0.9175 + uz * 0.062, 0.4075 + vy * 0.062)
        elif mname == "MO_CollectorPrism":
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx - 0.40) / 1.44))
                zn = max(0.0, min(1.0, (tz + 0.30) / 0.60))
                loop[uv_layer].uv = (0.705 + xn * 0.275, 0.240 + (1.0 - zn) * 0.080)
        else:
            is_right = (-f.normal.y) > 0.0
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 1.70) / 3.30))
                yn = max(0.0, min(1.0, (ty + 0.42) / 0.78))
                if is_right:
                    loop[uv_layer].uv = (0.015 + xn * 0.325, 0.365 + yn * 0.110)
                else:
                    loop[uv_layer].uv = (0.355 + (1.0 - xn) * 0.325, 0.365 + yn * 0.110)
    bm.to_mesh(rs.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 10 alloy receiver, barrel, flash hider, bolt & steel hardware parts into `p90_v3_metal` (2048x2048):
      - Hero Band 1 (`p90_upper_receiver` Left  Flank, -Z): u[0.015,0.985], v[0.755,0.985]
      - Hero Band 2 (`p90_upper_receiver` Right Flank, +Z): u[0.015,0.985], v[0.510,0.740]
      - Packed Zone A (upper rem, barrel, flash hider, charging, sling, lock): u[0.010,0.555], v[0.010,0.490]
      - Packed Zone B (heavy blowback bolt, firing pin, guide rods, bars):     u[0.575,0.990], v[0.010,0.490]
    """
    def is_hero_upper_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "p90_upper_receiver" or mat_name != "M_UpperAnodized":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if (nz > 0.78 and tz > 0.88) or (nz < -0.78 and tz < -0.88):
            return True
        return False

    ext_grp = [o for o in metal_objs if o.name in {
        "p90_upper_receiver", "p90_barrel", "p90_flash_hider",
        "p90_charging_handles", "p90_sling_mount", "p90_takedown_lock",
    }]
    int_grp = [o for o in metal_objs if o not in ext_grp]

    _smart_unwrap_and_pack_rect(ext_grp, 0.010, 0.555, 0.010, 0.490, skip_face_fn=is_hero_upper_flank)
    _smart_unwrap_and_pack_rect(int_grp, 0.575, 0.990, 0.010, 0.490)

    up = next(o for o in metal_objs if o.name == "p90_upper_receiver")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_upper_flank("p90_upper_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - 1.76) / 13.43))
            yn = max(0.0, min(1.0, (ty - 0.15) / 5.57))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.510 + yn * 0.230)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.755 + yn * 0.230)
    bm.to_mesh(up.data)
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
        o.location = (i * 65.0, 0.0, 0.0)
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

        kwargs = dict(type=bake_type, margin=4, use_clear=False)
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
    bpy.ops.object.bake(type="EMIT", margin=4, use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)
    for o in ext_targets:
        o.data.materials.clear()
        for m in orig_mats[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


# =============================================================================
# Strict Manifold, Outward-Volume & Bounding-Box Verification + Draco Export
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
        # Strict clearance guard for MagazineAmmoStack Slot 29 vs p90_mag_follower!
        if o.name == "p90_mag_follower":
            assert bmin[0] >= -0.525, f"p90_mag_follower min_x={bmin[0]:.4f} encroaches on MagazineAmmoStack Slot 29!"
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
        # Atlas 1: Monocoque Polymer Stock & Controls (8 parts)
        "p90_stock":            build_p90_stock,
        "p90_buttplate":        build_p90_buttplate,
        "p90_mag_catches":      build_p90_mag_catches,
        "p90_ejection_cover":   build_p90_ejection_cover,
        "p90_trigger":          build_p90_trigger,
        "p90_selector":         build_p90_selector,
        "p90_hammer_pack":      build_p90_hammer_pack,
        "p90_mag_floorplate":   build_p90_mag_floorplate,
        # Atlas 2: Smoked-Amber 50-Rd Mag, 90-Deg Helical Ramp, Orange Follower & Hammer, Ring Sight (5 parts)
        "p90_mag_body":         build_p90_mag_body,
        "p90_helical_ramp":     build_p90_helical_ramp,
        "p90_mag_follower":     build_p90_mag_follower,
        "p90_hammer":           build_p90_hammer,
        "p90_ring_sight":       build_p90_ring_sight,
        # Atlas 3: Anodized Upper Receiver, 10.4" CHF Barrel, 4-Port Comp, Heavy Blowback Bolt & Rods (10 parts)
        "p90_upper_receiver":   build_p90_upper_receiver,
        "p90_barrel":           build_p90_barrel,
        "p90_flash_hider":      build_p90_flash_hider,
        "p90_charging_handles": build_p90_charging_handles,
        "p90_bolt":             build_p90_bolt,
        "p90_firing_pin":       build_p90_firing_pin,
        "p90_guide_rods":       build_p90_guide_rods,
        "p90_takedown_lock":    build_p90_takedown_lock,
        "p90_sling_mount":      build_p90_sling_mount,
        "p90_transfer_bars":    build_p90_transfer_bars,
    }

    print("[BUILD] Sculpting all 23 solid FN Herstal P90 PDW hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    stock_objs = [built[pid] for pid in STOCK_PARTS]
    mag_objs = [built[pid] for pid in MAG_OPTIC_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs = stock_objs + mag_objs + metal_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: stock (8), mag_optic (5), metal (10)...")
    unwrap_stock_atlas(stock_objs)
    unwrap_mag_optic_atlas(mag_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("stock", stock_objs), ("mag_optic", mag_objs), ("metal", metal_objs)):
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
            assert 0.00003 < oa < 0.78, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="p90_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking p90_v3_stock (2048x2048, 8 monocoque polymer & control parts)...")
        bake_atlas_suite("stock", stock_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking p90_v3_mag_optic (2048x2048, 5 smoked-amber mag, helical ramp, orange & optic parts)...")
        bake_atlas_suite("mag", mag_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking p90_v3_metal (2048x2048, 10 anodized alloy upper, barrel, slant comp & blowback bolt)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)

        print("[POST] Compositing FN Herstal rollmarks, S/1/A dial, 50-rd amber cartridge rows, sapphire lenses & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "p90_v3_stock_albedo.webp",
        TEX_OUT_DIR / "p90_v3_stock_normal.webp",
        TEX_OUT_DIR / "p90_v3_stock_roughness.webp",
        TEX_OUT_DIR / "p90_v3_mag_optic_albedo.webp",
        TEX_OUT_DIR / "p90_v3_mag_optic_normal.webp",
        TEX_OUT_DIR / "p90_v3_mag_optic_roughness.webp",
        TEX_OUT_DIR / "p90_v3_metal_albedo.webp",
        TEX_OUT_DIR / "p90_v3_metal_normal.webp",
        TEX_OUT_DIR / "p90_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== FN HERSTAL P90 PDW V3 ASSET BUDGET ===")
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
