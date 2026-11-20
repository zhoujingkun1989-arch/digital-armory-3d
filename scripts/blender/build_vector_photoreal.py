#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for KRISS Vector SMG Gen II (.45 ACP · Super V)
===========================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 4 — Final 19/19 Grand Slam)

Generates:
  - public/models/vector.glb (Draco-compressed glTF 2.0, all 22 solid parts; skips ONLY
    the 3 dynamic GPU-compressed helical springs carrying `aSpringParam`:
    `vector_recoil_spring`, `vector_hammer_spring`, `vector_mag_spring`)
  - public/textures/vector_v3_housing_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/vector_v3_metal_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/vector_v3_mag_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 22 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/vector/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_vector_photoreal.py
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
# MODE 2: System Python Post-Process (KRISS USA Rollmarks, Red/White 1/2/A &
#         S/F Selector Icons, M1913 T2..T36 Top Rail, Super V CNC Slider &
#         .45 ACP Bolt Etching, MagEx2 Brass Witness Ports & 5-Ch ORM WebPs)
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.5) -> np.ndarray:
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

    def _draw_kriss_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float):
        """Crisp geometric KRISS crosshair-and-Super-V chevron crest."""
        lw = max(3, int(round(r * 0.11)))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        draw.ellipse((cx - r * 0.80, cy - r * 0.80, cx + r * 0.80, cy + r * 0.80), outline=230, width=max(2, lw // 2))
        for dx0, dy0, dx1, dy1 in (
            (-1.14, 0.0, -0.44, 0.0),
            ( 0.44, 0.0,  1.14, 0.0),
            ( 0.0, -1.14, 0.0, -0.44),
            ( 0.0,  0.44, 0.0,  1.14),
        ):
            draw.line(
                [(cx + dx0 * r, cy + dy0 * r), (cx + dx1 * r, cy + dy1 * r)],
                fill=255, width=max(2, int(round(r * 0.09))),
            )
        # Signature Super V downward chevron inside reticle
        draw.polygon(
            [
                (cx - r * 0.38, cy - r * 0.28),
                (cx - r * 0.16, cy - r * 0.28),
                (cx, cy + r * 0.14),
                (cx + r * 0.16, cy - r * 0.28),
                (cx + r * 0.38, cy - r * 0.28),
                (cx, cy + r * 0.44),
            ],
            fill=255,
        )

    def _draw_bullet_icon(draw: ImageDraw.ImageDraw, x_left: float, y_mid: float, w_px: float, h_px: float, point_right: bool = True):
        """Crisp vector .45 ACP round-nose cartridge icon for 1 / 2 / A selector markings."""
        half_h = h_px * 0.5
        if point_right:
            x_case_end = x_left + w_px * 0.68
            x_tip = x_left + w_px
            draw.rectangle((x_left, y_mid - half_h, x_case_end, y_mid + half_h), fill=255)
            draw.chord((x_case_end - w_px * 0.32, y_mid - half_h, x_tip, y_mid + half_h), -90, 90, fill=255)
        else:
            x_case_start = x_left + w_px * 0.32
            x_right = x_left + w_px
            draw.rectangle((x_case_start, y_mid - half_h, x_right, y_mid + half_h), fill=255)
            draw.chord((x_left, y_mid - half_h, x_case_start + w_px * 0.32, y_mid + half_h), 90, 270, fill=255)

    # -------------------------------------------------------------------------
    # SUITE 1 POST-PROCESS: vector_v3_housing (Two-Tone FDE/Charcoal Upper &
    #   Lower Chassis, M1913 T2..T36 Rail, Red/White 1/2/A & S/F Icons,
    #   KRISS USA Virginia Beach Rollmarks & Gen II Folding Stock)
    # -------------------------------------------------------------------------
    def process_housing_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "housing_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "housing_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "housing_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "housing_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "housing_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "housing_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "housing_ext_mask.npy")[..., 0]

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

        mold_dark = np.zeros((h, w), dtype=np.float32)
        white_ink = np.zeros((h, w), dtype=np.float32)
        red_ink = np.zeros((h, w), dtype=np.float32)

        # =====================================================================
        # A) LOWER CHASSIS HERO FLANKS (`vector_lower_chassis`, X in [-3.45, +22.60], Y in [-12.60, +0.74])
        #    Hero Band 1 (Left  Flank -Z): u[0.012, 0.988] (1 - xNorm: +X muzzle left), v[0.773, 0.988]
        #    Hero Band 2 (Right Flank +Z): u[0.012, 0.988] (xNorm:     -X rear  left),  v[0.545, 0.760]
        # =====================================================================
        LPPCM = 120.0
        LX0, LXSPAN = -3.45, 26.05
        LY0, LYSPAN = -12.60, 13.34
        LCW, LCH = int(round(LXSPAN * LPPCM)), int(round(LYSPAN * LPPCM))  # 3126 x 1601

        def l_yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - LY0) / LYSPAN) * LCH))

        def l_xw_to_cx_right(xw: float) -> int:
            return int(round((xw - LX0) / LXSPAN * LCW))

        def l_xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - LX0) / LXSPAN) * LCW))

        # 1) LOWER LEFT FLANK (-Z): Huge unobstructed flat upper Super V billboard X in [-0.65 .. +8.65], Y in [-1.92 .. +0.44]
        #    (Strictly behind charging slot X>=9.2, cleanly above bolt release Y=-2.75 & -65 deg ribs Y<=-3.85!)
        ll_mold = Image.new("L", (LCW, LCH), 0)
        dll = ImageDraw.Draw(ll_mold)
        bx0, bx1 = l_xw_to_cx_left(8.65), l_xw_to_cx_left(-0.65)
        by0, by1 = l_yw_to_cy(0.44), l_yw_to_cy(-1.92)
        dll.rounded_rectangle((bx0, by0, bx1, by1), radius=24, outline=225, width=6)
        _draw_kriss_emblem(dll, bx0 + 104, (by0 + by1) * 0.5, 66)
        dll.text((bx0 + 204, by0 + 34), "KRISS USA INC.  -  VIRGINIA BEACH, VA", fill=255, font=_load_font(FONT_DIN, 48))
        dll.text((bx0 + 204, by0 + 108), "VECTOR SMG  .45 ACP", fill=255, font=_load_font(FONT_DIN, 60))
        dll.text((bx0 + 204, by0 + 188), "SUPER V RECOIL MITIGATION  -  US PAT. 7,201,094", fill=235, font=_load_font(FONT_COND, 42))

        # Secondary clean barrel-shroud caliber mark forward of pin #4 (X in [15.4 .. 21.8], Y in [-1.85 .. -0.35])
        fx0_l, fx1_l = l_xw_to_cx_left(21.55), l_xw_to_cx_left(15.35)
        fy_mid_l = l_yw_to_cy(-1.10)
        dll.text(((fx0_l + fx1_l) * 0.5, fy_mid_l - 22), "CAL.  .45 AUTO  (11.43x23mm)", fill=242, font=_load_font(FONT_DIN, 42), anchor="mm")
        dll.text(((fx0_l + fx1_l) * 0.5, fy_mid_l + 30), "SER.  KV45-G2-09481", fill=232, font=_load_font(FONT_COND, 40), anchor="mm")

        _paste_uv_band(mold_dark, ll_mold, 0.012, 0.988, 0.773, 0.988)

        # 2) LOWER RIGHT FLANK (+Z):
        #    Clear bay A behind ejection port (X in [-0.65 .. +5.45], Y in [-1.92 .. +0.44])
        #    Clear bay B forward of ejection port (X in [11.35 .. +21.65], Y in [-1.32 .. +0.40], cleanly above pin #4!)
        lr_mold = Image.new("L", (LCW, LCH), 0)
        dlr = ImageDraw.Draw(lr_mold)

        rax0, rax1 = l_xw_to_cx_right(-0.65), l_xw_to_cx_right(5.45)
        ray0, ray1 = l_yw_to_cy(0.44), l_yw_to_cy(-1.92)
        dlr.rounded_rectangle((rax0, ray0, rax1, ray1), radius=22, outline=220, width=6)
        _draw_kriss_emblem(dlr, rax0 + 96, (ray0 + ray1) * 0.5, 60)
        dlr.text((rax0 + 184, ray0 + 36), "KRISS VECTOR", fill=255, font=_load_font(FONT_DIN, 60))
        dlr.text((rax0 + 184, ray0 + 114), "SMG  GEN II  -  .45 ACP", fill=248, font=_load_font(FONT_DIN, 44))
        dlr.text((rax0 + 184, ray0 + 182), "SUPER V RECOIL MITIGATION", fill=232, font=_load_font(FONT_COND, 40))

        rbx0, rbx1 = l_xw_to_cx_right(11.35), l_xw_to_cx_right(21.65)
        rby0, rby1 = l_yw_to_cy(0.40), l_yw_to_cy(-1.32)
        dlr.rounded_rectangle((rbx0, rby0, rbx1, rby1), radius=18, outline=215, width=5)
        dlr.text(((rbx0 + rbx1) * 0.5, rby0 + 44), "KRISS USA INC.  -  VIRGINIA BEACH, VA", fill=255, font=_load_font(FONT_DIN, 46), anchor="mm")
        dlr.text(((rbx0 + rbx1) * 0.5, rby0 + 104), "SER. KV45-G2-09481   -   US PAT. 7,201,094", fill=244, font=_load_font(FONT_DIN, 40), anchor="mm")
        dlr.text(((rbx0 + rbx1) * 0.5, rby0 + 156), "CAL. .45 AUTO  -  READ MANUAL BEFORE USE", fill=228, font=_load_font(FONT_COND, 34), anchor="mm")

        _paste_uv_band(mold_dark, lr_mold, 0.012, 0.988, 0.545, 0.760)

        # =====================================================================
        # B) UPPER HOUSING HERO FLANKS (`vector_upper_housing`, X in [-13.85, +22.60], Y in [+0.68, +3.58])
        #    Hero Band 3 (Upper Left  Flank -Z): u[0.012, 0.988] (1 - xNorm), v[0.442, 0.532]
        #    Hero Band 4 (Upper Right Flank +Z): u[0.012, 0.988] (xNorm),     v[0.339, 0.429]
        #    Crisp Red/White `1 / 2 / A` fire selector icons around (-2.85, 2.55)
        #    Crisp White/Red `S / F` safety icons around (-8.35, 1.25)
        # =====================================================================
        UPPCM = 105.0
        UX0, UXSPAN = -13.85, 36.45
        UY0, UYSPAN = 0.68, 2.90
        UCW, UCH = int(round(UXSPAN * UPPCM)), int(round(UYSPAN * UPPCM))  # 3827 x 305

        def u_yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - UY0) / UYSPAN) * UCH))

        def u_xw_to_cx_right(xw: float) -> int:
            return int(round((xw - UX0) / UXSPAN * UCW))

        def u_xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - UX0) / UXSPAN) * UCW))

        f_sel_num = _load_font(FONT_DIN, 44)
        f_saf_let = _load_font(FONT_DIN, 44)
        f_up_tag = _load_font(FONT_DIN, 46)
        f_up_sub = _load_font(FONT_COND, 36)

        for is_left in (True, False):
            uw = Image.new("L", (UCW, UCH), 0)
            ur = Image.new("L", (UCW, UCH), 0)
            um = Image.new("L", (UCW, UCH), 0)
            duw, dur, dum = ImageDraw.Draw(uw), ImageDraw.Draw(ur), ImageDraw.Draw(um)

            x_fn = u_xw_to_cx_left if is_left else u_xw_to_cx_right
            # Forward (+X) direction on canvas: LEFT (-1) on Left flank, RIGHT (+1) on Right flank!
            fwd = -1 if is_left else 1

            # --- 1) Fire Selector `1 / 2 / A` icons wrapped on FORWARD (+X) arc of boss (-2.85, 2.55, r=0.64) ---
            sel_cx = x_fn(-2.85)
            sel_cy = u_yw_to_cy(2.55)
            # Crisp concentric selector arc groove (r = 0.78 cm = 82 px)
            arc_r = int(round(0.76 * UPPCM))
            if is_left:
                dum.arc((sel_cx - arc_r, sel_cy - arc_r, sel_cx + arc_r, sel_cy + arc_r), 130, 230, fill=235, width=4)
            else:
                dum.arc((sel_cx - arc_r, sel_cy - arc_r, sel_cx + arc_r, sel_cy + arc_r), -50, 50, fill=235, width=4)

            # Three selector positions clearly spaced in Y on forward side (X = -1.78 .. -1.30):
            #   '1' (WHITE, Single/Semi) at Y = 3.04
            #   '2' (CRIMSON RED, 2-Rd Burst) at Y = 2.55
            #   'A' (CRIMSON RED, 1200 RPM Auto) at Y = 2.04
            tx_1 = x_fn(-1.82)
            tx_2 = x_fn(-1.74)
            tx_a = x_fn(-1.82)
            ty_1 = u_yw_to_cy(3.04)
            ty_2 = u_yw_to_cy(2.55)
            ty_a = u_yw_to_cy(2.04)

            # Tick marks radiating from boss arc
            duw.line([(sel_cx + fwd * 74, sel_cy - 34), (sel_cx + fwd * 90, sel_cy - 42)], fill=255, width=5)
            dur.line([(sel_cx + fwd * 80, sel_cy), (sel_cx + fwd * 98, sel_cy)], fill=255, width=5)
            dur.line([(sel_cx + fwd * 74, sel_cy + 34), (sel_cx + fwd * 90, sel_cy + 42)], fill=255, width=5)

            duw.text((tx_1, ty_1), "1", fill=255, font=f_sel_num, anchor="mm")
            dur.text((tx_2, ty_2), "2", fill=255, font=f_sel_num, anchor="mm")
            dur.text((tx_a, ty_a), "A", fill=255, font=f_sel_num, anchor="mm")
            dum.text((tx_1, ty_1), "1", fill=230, font=f_sel_num, anchor="mm")
            dum.text((tx_2, ty_2), "2", fill=230, font=f_sel_num, anchor="mm")
            dum.text((tx_a, ty_a), "A", fill=230, font=f_sel_num, anchor="mm")

            # Bullet burst pictograms beside 1 / 2 / A (pointing toward muzzle!)
            bx_off = fwd * 30
            if fwd > 0:
                _draw_bullet_icon(duw, tx_1 + 26, ty_1, 32, 12, True)
                _draw_bullet_icon(dur, tx_2 + 26, ty_2 - 7, 32, 11, True)
                _draw_bullet_icon(dur, tx_2 + 26, ty_2 + 7, 32, 11, True)
                for bi in (-1, 0, 1):
                    _draw_bullet_icon(dur, tx_a + 26, ty_a + bi * 11, 32, 9, True)
            else:
                _draw_bullet_icon(duw, tx_1 - 58, ty_1, 32, 12, False)
                _draw_bullet_icon(dur, tx_2 - 58, ty_2 - 7, 32, 11, False)
                _draw_bullet_icon(dur, tx_2 - 58, ty_2 + 7, 32, 11, False)
                for bi in (-1, 0, 1):
                    _draw_bullet_icon(dur, tx_a - 58, ty_a + bi * 11, 32, 9, False)

            # --- 2) Thumb Safety `S / F` icons wrapped on FORWARD (+X) side of boss (-8.35, 1.25, r=0.54) ---
            saf_cx = x_fn(-8.35)
            saf_cy = u_yw_to_cy(1.25)
            sx_s = x_fn(-7.32)
            sy_s = u_yw_to_cy(1.78)
            sx_f = x_fn(-7.32)
            sy_f = u_yw_to_cy(1.12)

            # White 'S' + circular safe indicator pip
            duw.ellipse((saf_cx + fwd * 68 - 7, sy_s - 7, saf_cx + fwd * 68 + 7, sy_s + 7), fill=255)
            duw.text((sx_s, sy_s), "S", fill=255, font=f_saf_let, anchor="mm")
            dum.text((sx_s, sy_s), "S", fill=230, font=f_saf_let, anchor="mm")

            # Vivid Crimson 'F' + circular fire indicator pip
            dur.ellipse((saf_cx + fwd * 68 - 7, sy_f - 7, saf_cx + fwd * 68 + 7, sy_f + 7), fill=255)
            dur.text((sx_f, sy_f), "F", fill=255, font=f_saf_let, anchor="mm")
            dum.text((sx_f, sy_f), "F", fill=230, font=f_saf_let, anchor="mm")

            # --- 3) Clean upper-flank model identification in unobstructed mid-front bay (X in [2.6..13.6], Y in [1.95..3.15]) ---
            mid_x = x_fn(8.10)
            mid_y = u_yw_to_cy(2.58)
            if is_left:
                dum.text((mid_x, mid_y - 24), "KRISS VECTOR  GEN II", fill=245, font=f_up_tag, anchor="mm")
                dum.text((mid_x, mid_y + 28), "SUPER V SYSTEM  -  .45 ACP  -  1200 RPM", fill=225, font=f_up_sub, anchor="mm")
            else:
                dum.text((mid_x, mid_y - 24), "VECTOR SMG  -  .45 ACP", fill=245, font=f_up_tag, anchor="mm")
                dum.text((mid_x, mid_y + 28), "KRISS USA INC.  -  VIRGINIA BEACH, VA", fill=225, font=f_up_sub, anchor="mm")

            v0_u, v1_u = (0.442, 0.532) if is_left else (0.339, 0.429)
            _paste_uv_band(white_ink, uw, 0.012, 0.988, v0_u, v1_u)
            _paste_uv_band(red_ink, ur, 0.012, 0.988, v0_u, v1_u)
            _paste_uv_band(mold_dark, um, 0.012, 0.988, v0_u, v1_u)

        # =====================================================================
        # C) FULL-LENGTH 36-SLOT M1913 TOP PICATINNY RAIL WHITE T-NUMBERS (T2 .. T36)
        #    Hero Band 5: u[0.012, 0.988] (xNorm, X in [-12.90, +22.30]), v[0.284, 0.326]
        #    35 cross-slots -> 36 rail lugs centered at lx = -12.66 + i * 0.992 (i = 0..35)
        # =====================================================================
        RW, RH = 3520, 176  # 35.20 x 1.76 cm @ 100 PPCM
        rail_im = Image.new("L", (RW, RH), 0)
        dr_rail = ImageDraw.Draw(rail_im)
        f_rail = _load_font(FONT_DIN, 42)
        for lug_idx in range(1, 36, 2):  # T2, T4, T6, ..., T36!
            lx = -12.66 + lug_idx * 0.992
            xn = (lx - (-12.90)) / 35.20
            px = int(round(xn * RW))
            # Left flat deck of Picatinny crown (strictly clear of central trough!)
            dr_rail.text((px, int(RH * 0.24)), f"T{lug_idx + 1}", fill=255, font=f_rail, anchor="mm")
        _paste_uv_band(white_ink, rail_im, 0.012, 0.988, 0.284, 0.326)

        # Subtle field-handling sheen halos around takedown pin bores on FDE chassis
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        lower_mask = ((u_grid >= 0.012) & (u_grid <= 0.988) & (
            ((v_grid >= 0.773) & (v_grid <= 0.988)) | ((v_grid >= 0.545) & (v_grid <= 0.760))
        )).astype(np.float32)
        for px_cm, py_cm, rad_cm in ((13.8, -1.95, 0.52), (5.25, -3.85, 0.75)):
            xn = (px_cm - LX0) / LXSPAN
            yn = (py_cm - LY0) / LYSPAN
            for ux, vy in (
                (0.012 + (1.0 - xn) * 0.976, 0.773 + yn * 0.215),
                (0.012 + xn * 0.976,         0.545 + yn * 0.215),
            ):
                dx_cm = (u_grid - ux) * (LXSPAN / 0.976)
                dy_cm = (v_grid - vy) * (LYSPAN / 0.215)
                halo = np.exp(-(dx_cm * dx_cm + dy_cm * dy_cm) / (rad_cm * rad_cm)) * lower_mask
                rgh -= halo * 0.065

        # Composite recessed molded rollmarks (crisp high-contrast dark FDE recess) + crisp white & crimson enamel!
        m_bev = _bevel_mask(mold_dark, width_px=1.4)
        w_bev = _bevel_mask(white_ink, width_px=1.3)
        r_bev = _bevel_mask(red_ink, width_px=1.3)
        decal_h = -0.52 * m_bev - 0.38 * np.maximum(w_bev, r_bev)

        # Dark recessed molded polymer rollmarks (unmistakable crispness against Combat FDE!)
        _mix(albedo, (0.215, 0.168, 0.112), mold_dark * 0.80)
        _mix(rgh, 0.48, mold_dark * 0.65)
        ao *= 1.0 - 0.16 * mold_dark

        # Crisp bright white enamel ('S', '1', single bullet, and M1913 T2..T36 rail numbers!)
        _mix(albedo, (0.94, 0.94, 0.93), white_ink * 0.97)
        _mix(rgh, 0.32, white_ink * 0.90)
        _mix(met, 0.02, white_ink * 0.98)

        # Vivid crimson-red enamel ('F', '2', 'A', 2-rd & 3-rd burst bullet icons!)
        _mix(albedo, (0.86, 0.065, 0.055), red_ink * 0.97)
        _mix(rgh, 0.25, red_ink * 0.90)
        _mix(met, 0.02, red_ink * 0.98)

        ao *= 1.0 - 0.10 * np.maximum(white_ink, red_ink)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.16, 0.94)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_housing_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_housing_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_housing_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vector_v3_housing_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2 POST-PROCESS: vector_v3_metal (CNC Brushed Stainless Super V
    #   Slider w/ 5-Axis End-Mill Toolpaths & Patent Etching, .45 ACP Nitride
    #   Bolt Proof, 5.5" Low-Bore Barrel, Brass Charging Pivot & Inverted FCU)
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

        dark_etch = np.zeros((h, w), dtype=np.float32)
        silver_etch = np.zeros((h, w), dtype=np.float32)

        # 1) SUPER V SLIDER CHEEKS (`vector_slider`, X in [-2.10, +2.35], Y in [-3.45, +2.15])
        #    Right Cheek (+Z): u[0.015, 0.275], v[0.640, 0.985] (xNorm)
        #    Left  Cheek (-Z): u[0.290, 0.550], v[0.640, 0.985] (1 - xNorm)
        #    ZERO overlap with Packed Zone B (u >= 0.578)!
        #    Guide rail runs along rear edge (X ~ -1.12); forward counterweight slab (X ~ +0.16, Y in [-2.75..-0.85]) is 100% open!
        SPPCM = 180.0
        SX0, SXSPAN = -2.10, 4.45
        SY0, SYSPAN = -3.45, 5.60
        SCW, SCH = int(round(SXSPAN * SPPCM)), int(round(SYSPAN * SPPCM))  # 801 x 1008

        def s_yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - SY0) / SYSPAN) * SCH))

        def s_xw_to_cx_right(xw: float) -> int:
            return int(round((xw - SX0) / SXSPAN * SCW))

        def s_xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - SX0) / SXSPAN) * SCW))

        for is_left, (u0_s, u1_s) in ((False, (0.015, 0.275)), (True, (0.290, 0.550))):
            im_s = Image.new("L", (SCW, SCH), 0)
            ds = ImageDraw.Draw(im_s)
            cx_s = s_xw_to_cx_left(0.16) if is_left else s_xw_to_cx_right(0.16)
            cy_1 = s_yw_to_cy(-1.05)
            cy_2 = s_yw_to_cy(-1.60)
            cy_3 = s_yw_to_cy(-2.15)
            ds.text((cx_s, cy_1), "SUPER V", fill=255, font=_load_font(FONT_DIN, 58), anchor="mm")
            ds.text((cx_s, cy_2), "PAT. 7,201,094", fill=242, font=_load_font(FONT_COND, 42), anchor="mm")
            ds.text((cx_s, cy_3), ".45 ACP  -  KRISS", fill=235, font=_load_font(FONT_COND, 38), anchor="mm")
            _paste_uv_band(dark_etch, im_s, u0_s, u1_s, 0.640, 0.985)

        # Subtle 5-axis CNC circular end-mill swirl toolpaths strictly inside both slider cheeks!
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        cheek_r_m = ((v_grid >= 0.640) & (v_grid <= 0.985) & (u_grid >= 0.015) & (u_grid <= 0.275)).astype(np.float32)
        cheek_l_m = ((v_grid >= 0.640) & (v_grid <= 0.985) & (u_grid >= 0.290) & (u_grid <= 0.550)).astype(np.float32)
        swirl_r = (np.sin(np.hypot((u_grid - 0.145) * 140.0, (v_grid - 0.81) * 140.0) * 2.2) * 0.5 + 0.5) * cheek_r_m
        swirl_l = (np.sin(np.hypot((u_grid - 0.420) * 140.0, (v_grid - 0.81) * 140.0) * 2.2) * 0.5 + 0.5) * cheek_l_m
        cnc_swirl = swirl_r + swirl_l
        slider_cheeks = cheek_r_m + cheek_l_m
        rgh = np.clip(rgh + (cnc_swirl - 0.5 * slider_cheeks) * 0.045, 0.10, 0.92)

        # 2) BOLT RIGHT FLANK (`vector_bolt`, X in [-2.95, +2.95], Y in [-0.77, +0.77], visible through ejection port!)
        #    Hero Band: u[0.580, 0.985], v[0.855, 0.985] (aspect 3.12:1 matching 3D bolt 3.83:1!)
        #    Ejection port exposes bolt local X in [-1.05, +2.95]; center text at X = -0.08 so ENTIRE 'KRISS .45 ACP'
        #    is 100% visible inside the ejection port & cleanly left of the brass extractor (X >= +0.95)!
        BW, BH = 1180, 308
        im_b = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(im_b)
        bx_c = int(round((-0.08 + 2.95) / 5.90 * BW))
        by_c = int(round((1.0 - (-0.22 + 0.77) / 1.54) * BH))
        db.text((bx_c, by_c - 26), "KRISS .45 ACP", fill=255, font=_load_font(FONT_DIN, 44), anchor="mm")
        db.text((bx_c, by_c + 30), "KV45 - MPI TESTED", fill=236, font=_load_font(FONT_COND, 34), anchor="mm")
        _paste_uv_band(silver_etch, im_b, 0.580, 0.985, 0.855, 0.985)

        # Subtle longitudinal cycling sheen lines on bolt right flank
        bolt_zone = ((u_grid >= 0.580) & (u_grid <= 0.985) & (v_grid >= 0.855) & (v_grid <= 0.985)).astype(np.float32)
        rng_b = np.random.default_rng(4523)
        sc_b = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_b)
        for _ in range(90):
            sx = float(rng_b.uniform(0.59, 0.94) * w)
            sy = float(rng_b.uniform(0.02, 0.14) * h)
            ln = float(rng_b.uniform(28, 130))
            dsc.line([(sx, sy), (sx + ln, sy + float(rng_b.uniform(-2.0, 2.0)))],
                     fill=int(rng_b.integers(80, 195)), width=1)
        bolt_wear = (np.asarray(sc_b, dtype=np.float32) / 255.0) * bolt_zone
        _mix(albedo, (0.64, 0.68, 0.73), bolt_wear * 0.34)
        rgh -= bolt_wear * 0.06

        # Composite dark laser etching on brushed stainless slider + crisp silver laser etching on nitride bolt
        de_bev = _bevel_mask(dark_etch, width_px=1.3)
        se_bev = _bevel_mask(silver_etch, width_px=1.2)
        decal_h = -0.48 * de_bev - 0.42 * se_bev + 0.045 * cnc_swirl - 0.03 * bolt_wear

        _mix(albedo, (0.19, 0.21, 0.24), dark_etch * 0.88)
        _mix(rgh, 0.46, dark_etch * 0.80)
        _mix(met, 0.45, dark_etch * 0.70)

        _mix(albedo, (0.86, 0.88, 0.91), silver_etch * 0.92)
        _mix(rgh, 0.34, silver_etch * 0.80)
        _mix(met, 0.90, silver_etch * 0.65)
        ao *= 1.0 - 0.14 * np.maximum(dark_etch, silver_etch)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.10, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vector_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3 POST-PROCESS: vector_v3_mag (66-Deg Extended Glock-21 Core +
    #   Combat FDE Ribbed MagEx2 Sleeve w/ Brass Witness Holes 4..13 & 15..25,
    #   Crisp KRISS .45 ACP / 25 RD Nameplate, Strictly Firewalled Safety-Orange Follower!)
    # -------------------------------------------------------------------------
    def process_mag_atlas():
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
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero UV bands on `vector_mag_body` (local X in [-8.10, +8.45], spanX = 16.55; Y in [-1.82, +1.82], spanY = 3.64):
        #   Hero Band 1 (Right Flank +Z): u[0.015, 0.280] (-yNorm: Rear +Y left -> Front -Y right), v[0.015, 0.985] (xNorm)
        #   Hero Band 2 (Left  Flank -Z): u[0.298, 0.563] (+yNorm: Front -Y left -> Rear +Y right), v[0.015, 0.985] (xNorm)
        #   Hero Band 3 (Rear Spine  +Y): u[0.582, 0.742] (zNorm: Left -Z left -> Right +Z right),  v[0.015, 0.985] (xNorm)
        #   STRICT FIREWALL: Safety-Orange follower sits in u[0.768, 0.988], v[0.640, 0.985] — NEVER touched here!
        MPPCM = 120.0
        MX0, MXSPAN = -8.10, 16.55
        MW = int(round(3.64 * MPPCM))   # 437 px wide
        MH = int(round(MXSPAN * MPPCM)) # 1986 px tall

        def mx_to_cy(lx: float) -> int:
            return int(round((1.0 - (lx - MX0) / MXSPAN) * MH))

        mold_fde = np.zeros((h, w), dtype=np.float32)
        mold_glock = np.zeros((h, w), dtype=np.float32)
        white_txt = np.zeros((h, w), dtype=np.float32)
        brass_disc = np.zeros((h, w), dtype=np.float32)
        hole_rim = np.zeros((h, w), dtype=np.float32)

        # 1) LEFT & RIGHT MAG FLANKS:
        #    - Smooth recessed Combat FDE MagEx2 Nameplate Bay at local X in [-5.65, -2.55] (cleanly between ribs!)
        #    - Upper Glock 21 matte charcoal core markings at local X in [+1.20, +4.80]
        for is_right, (u0_m, u1_m) in ((True, (0.015, 0.280)), (False, (0.298, 0.563))):
            f_im = Image.new("L", (MW, MH), 0)
            g_im = Image.new("L", (MW, MH), 0)
            df, dg = ImageDraw.Draw(f_im), ImageDraw.Draw(g_im)

            # Combat FDE MagEx2 smooth nameplate bay: local X in [-5.75, -3.14] (100% BELOW magwell lip at local X = -3.01!)
            by0 = mx_to_cy(-3.16)
            by1 = mx_to_cy(-5.76)
            df.rounded_rectangle((46, by0, MW - 46, by1), radius=18, outline=220, width=5)
            _draw_kriss_emblem(df, MW // 2, by0 + 66, 42)
            df.text((MW // 2, by0 + 144), "KRISS", fill=255, font=_load_font(FONT_DIN, 58), anchor="mm")
            df.text((MW // 2, by0 + 206), ".45 ACP  /  25 RD", fill=248, font=_load_font(FONT_DIN, 40), anchor="mm")
            df.text((MW // 2, by0 + 258), "MAGEX2  EXTENDED", fill=232, font=_load_font(FONT_COND, 34), anchor="mm")

            # Upper Glock 21 polymer core mold stamp (cleanly centered BELOW catch_notch at X=+4.45!)
            gy_mid = mx_to_cy(1.95)
            dg.rounded_rectangle((68, gy_mid - 110, MW - 68, gy_mid + 110), radius=14, outline=200, width=4)
            dg.text((MW // 2, gy_mid - 54), "GLOCK 21", fill=245, font=_load_font(FONT_DIN, 44), anchor="mm")
            dg.text((MW // 2, gy_mid + 2), ".45 AUTO", fill=240, font=_load_font(FONT_DIN, 42), anchor="mm")
            dg.text((MW // 2, gy_mid + 58), "AUSTRIA  -  13+12", fill=215, font=_load_font(FONT_COND, 34), anchor="mm")

            _paste_uv_band(mold_fde, f_im, u0_m, u1_m, 0.015, 0.985)
            _paste_uv_band(mold_glock, g_im, u0_m, u1_m, 0.015, 0.985)

        # 2) REAR SPINE (+Y_local, u[0.582, 0.742], v[0.015, 0.985]):
        #    Authentic Glock 21 brass witness ports (4..13) on upper charcoal core + MagEx2 (15, 20, 25) on FDE sleeve!
        SW = int(round(2.84 * MPPCM))  # 341 px wide
        sp_brass = Image.new("L", (SW, MH), 0)
        sp_rim = Image.new("L", (SW, MH), 0)
        sp_wht = Image.new("L", (SW, MH), 0)
        sp_mld = Image.new("L", (SW, MH), 0)
        db_s, dr_s, dw_s, dm_s = (
            ImageDraw.Draw(sp_brass), ImageDraw.Draw(sp_rim), ImageDraw.Draw(sp_wht), ImageDraw.Draw(sp_mld)
        )
        f_wit = _load_font(FONT_DIN, 36)
        f_wit_s = _load_font(FONT_COND, 32)

        # Upper Glock 21 core witness ports (4..13) descending along local X from +6.45 down to -0.75!
        for idx_h, count_num in enumerate(range(4, 14)):
            lx = 6.45 - idx_h * 0.79
            cy = mx_to_cy(lx)
            cx_h = SW // 2 - 22
            # Recessed dark countersink bezel + gleaming .45 ACP brass cartridge rim inside!
            dr_s.ellipse((cx_h - 21, cy - 21, cx_h + 21, cy + 21), fill=255)
            db_s.ellipse((cx_h - 15, cy - 15, cx_h + 15, cy + 15), fill=255)
            dw_s.text((cx_h + 44, cy), str(count_num), fill=248, font=f_wit, anchor="lm")
            dm_s.text((cx_h + 44, cy), str(count_num), fill=225, font=f_wit, anchor="lm")

        # Lower Combat FDE MagEx2 extended witness slots (15, 20, 25) cleanly inside sleeve X in [-7.2 .. -2.3]
        # Crisp high-contrast dark recessed molded digits on Combat FDE (NO pale white washout!)
        for lx, count_num in ((-2.50, 15), (-4.70, 20), (-6.90, 25)):
            cy = mx_to_cy(lx)
            cx_h = SW // 2 - 22
            dr_s.ellipse((cx_h - 22, cy - 22, cx_h + 22, cy + 22), fill=255)
            db_s.ellipse((cx_h - 16, cy - 16, cx_h + 16, cy + 16), fill=255)
            dm_s.text((cx_h + 44, cy), str(count_num), fill=255, font=f_wit, anchor="lm")

        # Subtle top spine caliber mark above port 4
        dw_s.text((SW // 2, mx_to_cy(7.45)), ".45 AUTO", fill=232, font=f_wit_s, anchor="mm")

        _paste_uv_band(brass_disc, sp_brass, 0.582, 0.742, 0.015, 0.985)
        _paste_uv_band(hole_rim, sp_rim, 0.582, 0.742, 0.015, 0.985)
        _paste_uv_band(white_txt, sp_wht, 0.582, 0.742, 0.015, 0.985)
        _paste_uv_band(mold_fde, sp_mld, 0.582, 0.742, 0.015, 0.985)

        # Subtle vertical magwell insertion scuffs on upper matte charcoal Glock 21 section ONLY (v > 0.43)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        in_flanks = (((u_grid >= 0.015) & (u_grid <= 0.280)) | ((u_grid >= 0.298) & (u_grid <= 0.563))).astype(np.float32)
        upper_glock = in_flanks * _smoothstep(0.43, 0.48, v_grid) * (1.0 - _smoothstep(0.95, 0.985, v_grid))
        rng_m = np.random.default_rng(2545)
        sc_m = Image.new("L", (w, h), 0)
        dsm = ImageDraw.Draw(sc_m)
        for _ in range(280):
            sx = float(rng_m.uniform(0.02, 0.56) * w)
            sy = float(rng_m.uniform(0.03, 0.55) * h)
            ln = float(rng_m.uniform(18, 120))
            dsm.line([(sx, sy), (sx + float(rng_m.uniform(-2.0, 2.0)), sy + ln)],
                     fill=int(rng_m.integers(70, 195)), width=1)
        scuffs = (np.asarray(sc_m, dtype=np.float32) / 255.0) * upper_glock
        _mix(albedo, (0.31, 0.325, 0.35), scuffs * 0.36)
        rgh -= scuffs * 0.09

        # Composite recessed MagEx2 FDE markings, Glock stamps, witness port rims & gleaming brass!
        # Strictly zero writes anywhere near u >= 0.768 (firewalled safety-orange follower & baseplate!)
        fde_bev = _bevel_mask(mold_fde, width_px=1.4)
        glk_bev = _bevel_mask(mold_glock, width_px=1.3)
        rim_bev = _bevel_mask(hole_rim, width_px=2.4)
        decal_h = -0.52 * fde_bev - 0.36 * glk_bev - 0.85 * rim_bev - 0.04 * scuffs

        # Dark recessed molded text on Combat FDE MagEx2 bay
        _mix(albedo, (0.21, 0.165, 0.112), mold_fde * 0.82)
        _mix(rgh, 0.48, mold_fde * 0.65)

        # Subtle lighter-edge molded stamp on charcoal Glock 21 body
        _mix(albedo, (0.32, 0.335, 0.355), mold_glock * 0.55)
        _mix(rgh, 0.44, mold_glock * 0.55)

        # Dark countersink rim around witness holes + gleaming metallic C26000 .45 ACP brass inside!
        rim_only = np.clip(hole_rim - brass_disc, 0.0, 1.0)
        _mix(albedo, (0.09, 0.095, 0.105), rim_only * 0.92)
        _mix(rgh, 0.62, rim_only * 0.85)
        ao *= 1.0 - 0.52 * rim_only

        _mix(albedo, (0.86, 0.68, 0.26), brass_disc * 0.98)
        _mix(rgh, 0.22, brass_disc * 0.96)
        _mix(met, 0.94, brass_disc * 0.98)
        ao = np.maximum(ao, brass_disc * 0.88)

        # Crisp light witness port numbers on rear spine
        _mix(albedo, (0.88, 0.89, 0.90), white_txt * 0.85)
        _mix(rgh, 0.38, white_txt * 0.72)
        _mix(met, 0.02, white_txt * 0.90)
        ao *= 1.0 - 0.14 * np.maximum(mold_fde, mold_glock)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_mag_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_mag_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vector_v3_mag_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vector_v3_mag_{albedo,normal,roughness}.webp (2048x2048)")

    process_housing_atlas()
    process_metal_atlas()
    process_mag_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "vector.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

SUPER_V_CHUTE_ANGLE = math.radians(65.0)
VECTOR_MAG_ANGLE = math.radians(66.0)
VECTOR_BORE_Y = -0.95
VECTOR_TRIGGER_Y = 0.58

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 22 solid KRISS Vector SMG Gen II parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY the 3 dynamic GPU-compressed helical springs:
#  `vector_recoil_spring`, `vector_hammer_spring`, `vector_mag_spring`!)
HOUSING_PARTS = [
    "vector_upper_housing",
    "vector_lower_chassis",
    "vector_folding_stock",
    "vector_front_sight",
    "vector_rear_sight",
    "vector_fire_selector",
    "vector_thumb_safety",
]

METAL_PARTS = [
    "vector_barrel",
    "vector_muzzle_device",
    "vector_bolt",
    "vector_firing_pin",
    "vector_slider",
    "vector_guide_rod",
    "vector_charging_handle",
    "vector_takedown_pins",
    "vector_stock_hinge",
    "vector_fcu_chassis",
    "vector_trigger",
    "vector_hammer",
]

MAG_PARTS = [
    "vector_mag_body",
    "vector_mag_follower",
    "vector_mag_baseplate",
]

# Exterior parts receiving assembled inter-part contact AO (internal moving parts receive clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "vector_upper_housing",
    "vector_lower_chassis",
    "vector_folding_stock",
    "vector_front_sight",
    "vector_rear_sight",
    "vector_fire_selector",
    "vector_thumb_safety",
    "vector_barrel",
    "vector_muzzle_device",
    "vector_charging_handle",
    "vector_takedown_pins",
    "vector_stock_hinge",
    "vector_trigger",
    "vector_mag_body",
    "vector_mag_baseplate",
}

ASSEMBLED_POS = {
    "vector_barrel":          (  0.000, VECTOR_BORE_Y,  0.000),
    "vector_muzzle_device":   ( 24.200, VECTOR_BORE_Y,  0.000),
    "vector_bolt":            (  7.250, VECTOR_BORE_Y,  0.000),
    "vector_firing_pin":      (  7.100, VECTOR_BORE_Y,  0.000),
    "vector_slider":          (  3.850, -2.350,         0.000),
    "vector_guide_rod":       ( -2.450, -12.150,        0.000),
    "vector_upper_housing":   (  0.000,  0.000,         0.000),
    "vector_lower_chassis":   (  0.000,  0.000,         0.000),
    "vector_charging_handle": ( 11.800,  0.250,        -1.680),
    "vector_front_sight":     ( 20.600,  4.100,         0.000),
    "vector_rear_sight":      (-11.400,  4.100,         0.000),
    "vector_takedown_pins":   (  0.000,  0.000,         0.000),
    "vector_stock_hinge":     (-14.150,  1.550,         0.000),
    "vector_folding_stock":   (-14.500,  1.550,         0.000),
    "vector_fcu_chassis":     (  0.400,  2.150,         0.000),
    "vector_trigger":         ( -5.400, VECTOR_TRIGGER_Y, 0.000),
    "vector_hammer":          (  3.950,  1.850,         0.000),
    "vector_fire_selector":   ( -2.850,  2.550,         0.000),
    "vector_thumb_safety":    ( -8.350,  1.250,         0.000),
    "vector_mag_body":        (  4.950, -9.850,         0.000),
    "vector_mag_follower":    (  7.650, -3.780,         0.000),
    "vector_mag_baseplate":   (  1.250, -18.150,        0.000),
}

ASSEMBLED_ROT_THREE: dict[str, tuple[float, float, float]] = {
    "vector_guide_rod":     (0.0, 0.0, SUPER_V_CHUTE_ANGLE),
    "vector_mag_body":      (0.0, 0.0, VECTOR_MAG_ANGLE),
    "vector_mag_follower":  (0.0, 0.0, VECTOR_MAG_ANGLE),
    "vector_mag_baseplate": (0.0, 0.0, VECTOR_MAG_ANGLE),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured from src/weapons/vector/meshes/*.ts
CSG_REF_BBOX = {
    "vector_barrel":            ((  9.7309,  -1.0800,  -1.0800), ( 24.2000,   1.3900,   1.0800)),
    "vector_muzzle_device":     (( -0.7200,  -0.9900,  -0.9900), (  1.9000,   0.9900,   0.9900)),
    "vector_bolt":              (( -2.9500,  -1.0000,  -1.1200), (  2.9500,   0.7700,   1.1200)),
    "vector_firing_pin":        (( -3.1800,  -0.2700,  -0.2700), (  3.0500,   0.2700,   0.2700)),
    "vector_slider":            (( -2.3028,  -3.7414,  -1.2700), (  2.3500,   2.1500,   1.2700)),
    "vector_guide_rod":         (( -0.4500,  -0.7600,  -0.7523), ( 14.6800,   0.7600,   0.7523)),
    "vector_upper_housing":     ((-13.8500,   0.6250,  -1.9900), ( 22.6000,   4.1000,   1.9900)),
    "vector_lower_chassis":     ((-13.4500, -12.6000,  -2.0500), ( 22.6000,   0.7400,   1.9500)),
    "vector_charging_handle":   (( -2.1000,  -0.5300,  -0.6400), (  3.3000,   0.3800,   1.0400)),
    "vector_front_sight":       (( -1.0750,  -0.0600,  -1.2400), (  1.0750,   1.8491,   1.2400)),
    "vector_rear_sight":        (( -1.1750,  -0.0600,  -1.2700), (  1.1750,   1.7400,   1.2700)),
    "vector_takedown_pins":     ((-11.1800,  -2.3242,  -2.1600), ( 14.9800,   1.3242,   2.0600)),
    "vector_stock_hinge":       (( -0.6800,  -1.2250,  -1.6300), (  0.6550,   1.3550,   1.7400)),
    "vector_folding_stock":     ((-21.1600,  -8.1750,  -1.3400), (  0.1000,   1.5124,   1.3400)),
    "vector_fcu_chassis":       (( -6.3000,  -0.6600,  -1.0900), (  6.3000,   0.7200,   1.0900)),
    "vector_trigger":           (( -0.3250,  -1.2600,  -0.7500), (  5.8750,   1.2200,   0.7500)),
    "vector_hammer":            (( -2.2200,  -2.0200,  -0.7800), (  0.5200,   0.5200,   0.7800)),
    "vector_fire_selector":     (( -1.4712,  -0.5041,  -2.2200), (  0.4312,   0.3441,   2.2200)),
    "vector_thumb_safety":      (( -1.7784,  -0.5105,  -2.2000), (  0.4184,   0.3505,   2.2000)),
    "vector_mag_body":          (( -8.1000,  -1.8700,  -1.5200), (  8.5750,   1.8700,   1.5200)),
    "vector_mag_follower":      (( -0.7250,  -1.2400,  -0.9500), (  1.0700,   1.3600,   0.8900)),
    "vector_mag_baseplate":     (( -0.7300,  -2.1200,  -1.5100), (  0.9700,   1.9800,   1.5100)),
}


# =============================================================================
# Scene & Physically Calibrated KRISS Vector Gen II Material Library (Cycles GPU)
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


def _build_vector_muzzle_heat_mat() -> bpy.types.Material:
    """M16x1 LH 4-Slot .45 ACP Compensator: QPQ black nitride steel -> subtle warm
    copper/bronze muzzle-blast temper around the 4 slots -> carbon fouling near crown."""
    mat = bpy.data.materials.new("M_MuzzleHeat")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Local muzzle X spans [-0.72 .. +1.90]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.35
    mr_x.inputs["From Max"].default_value = 1.90
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 6.2
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.16
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.200, 0.212, 0.230)
    cr.elements[1].position = 0.48
    cr.elements[1].color = srgb_to_lin(0.232, 0.244, 0.262)
    for pos, rgb in (
        (0.68, (0.33, 0.24, 0.16)),    # subtle .45 ACP copper/bronze fouling around 4 flash ports
        (0.84, (0.19, 0.20, 0.23)),    # dark tempered rim
        (0.95, (0.105, 0.105, 0.110)), # carbon soot inside exit cone (safe above pitch black)
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.56
    rr.elements[0].color = (0.28, 0.28, 0.28, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.76, 0.76, 0.76, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.78
    rm.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.elements[1].position = 0.96
    rm.elements[1].color = (0.24, 0.24, 0.24, 1.0)
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
        # --- SUITE 1: vector_v3_housing (Two-Tone Combat FDE / Matte Charcoal Polyamide, M1913 Rail, Sights & Stock) ---
        "H_FDE_Polymer": _build_pbr_mat(
            "H_FDE_Polymer",
            base_srgb=(0.578, 0.476, 0.336),
            roughness=0.59,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.18,
            edge_srgb=(0.685, 0.585, 0.445),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.56,
            voronoi_scale=92.0,
            rough_var=0.042,
        ),
        "H_FDE_Rib": _build_pbr_mat(
            "H_FDE_Rib",
            base_srgb=(0.518, 0.422, 0.294),
            roughness=0.63,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.16,
            edge_srgb=(0.640, 0.542, 0.405),
            grain_scale=68.0,
            grain_bump=0.048,
            voronoi_grain=0.60,
            voronoi_scale=96.0,
            rough_var=0.040,
        ),
        "H_Charcoal_Poly": _build_pbr_mat(
            "H_Charcoal_Poly",
            base_srgb=(0.206, 0.215, 0.230),
            roughness=0.58,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.22,
            edge_srgb=(0.315, 0.326, 0.346),
            grain_scale=66.0,
            grain_bump=0.048,
            voronoi_grain=0.60,
            voronoi_scale=96.0,
            rough_var=0.044,
        ),
        "H_Charcoal_Grip": _build_pbr_mat(
            "H_Charcoal_Grip",
            base_srgb=(0.186, 0.194, 0.208),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.020,
            edge_wear=0.16,
            edge_srgb=(0.285, 0.296, 0.315),
            grain_scale=92.0,
            grain_bump=0.092,
            voronoi_grain=0.82,
            voronoi_scale=158.0,
            rough_var=0.045,
        ),
        "H_Rubber_Buttpad": _build_pbr_mat(
            "H_Rubber_Buttpad",
            base_srgb=(0.184, 0.190, 0.202),
            roughness=0.76,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.12,
            edge_srgb=(0.255, 0.262, 0.278),
            grain_scale=78.0,
            grain_bump=0.068,
            voronoi_grain=0.72,
            voronoi_scale=116.0,
            rough_var=0.042,
        ),
        "H_Inner_Dark": _build_pbr_mat(
            "H_Inner_Dark",
            base_srgb=(0.155, 0.162, 0.175),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=48.0,
            grain_bump=0.032,
            rough_var=0.035,
        ),
        "H_Anodized_Rail": _build_pbr_mat(
            "H_Anodized_Rail",
            base_srgb=(0.218, 0.230, 0.250),
            roughness=0.35,
            metallic=0.78,
            bevel_r=0.020,
            edge_wear=0.48,
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=46.0,
            grain_bump=0.022,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.030,
        ),
        "H_Control_Steel": _build_pbr_mat(
            "H_Control_Steel",
            base_srgb=(0.228, 0.242, 0.262),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.018,
            edge_wear=0.44,
            edge_srgb=(0.76, 0.80, 0.85),
            grain_scale=38.0,
            grain_bump=0.022,
            rough_var=0.028,
        ),
        "H_Control_Stainless": _build_pbr_mat(
            "H_Control_Stainless",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=30.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "H_Sight_White": _build_pbr_mat(
            "H_Sight_White",
            base_srgb=(0.94, 0.95, 0.96),
            roughness=0.28,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.006,
            rough_var=0.012,
        ),
        "H_Safety_Red": _build_pbr_mat(
            "H_Safety_Red",
            base_srgb=(0.86, 0.08, 0.06),
            roughness=0.26,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.006,
            rough_var=0.012,
        ),

        # --- SUITE 2: vector_v3_metal (5.5" CHF Barrel, Comp, Nitride Bolt, Gleaming Super V CNC Slider, Brass Pivot & FCU) ---
        "M_Barrel_Nitride": _build_pbr_mat(
            "M_Barrel_Nitride",
            base_srgb=(0.200, 0.212, 0.230),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.40,
            edge_srgb=(0.76, 0.80, 0.85),
            grain_scale=44.0,
            grain_bump=0.026,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.028,
        ),
        "M_MuzzleHeat": _build_vector_muzzle_heat_mat(),
        "M_Bolt_Nitride": _build_pbr_mat(
            "M_Bolt_Nitride",
            base_srgb=(0.228, 0.242, 0.264),
            roughness=0.27,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.50,
            edge_srgb=(0.82, 0.86, 0.90),
            grain_scale=38.0,
            grain_bump=0.024,
            aniso_stretch=(0.40, 3.4, 3.4),
            rough_var=0.028,
        ),
        "M_Slider_Stainless": _build_pbr_mat(
            "M_Slider_Stainless",
            base_srgb=(0.725, 0.755, 0.795),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.022,
            edge_wear=0.32,
            edge_srgb=(0.91, 0.93, 0.96),
            grain_scale=34.0,
            grain_bump=0.022,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.026,
        ),
        "M_Polished_Cam": _build_pbr_mat(
            "M_Polished_Cam",
            base_srgb=(0.85, 0.88, 0.92),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.014,
            edge_wear=0.20,
            edge_srgb=(0.95, 0.97, 0.99),
            grain_scale=24.0,
            grain_bump=0.012,
            aniso_stretch=(0.40, 3.8, 3.8),
            rough_var=0.016,
        ),
        "M_Stainless_FCU": _build_pbr_mat(
            "M_Stainless_FCU",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.26,
            edge_srgb=(0.92, 0.94, 0.97),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.38, 3.6, 3.6),
            rough_var=0.022,
        ),
        "M_Spring_Steel": _build_pbr_mat(
            "M_Spring_Steel",
            base_srgb=(0.56, 0.60, 0.66),
            roughness=0.25,
            metallic=0.94,
            bevel_r=0.008,
            grain_scale=32.0,
            grain_bump=0.014,
            rough_var=0.024,
        ),
        "M_Brass_Pivot": _build_pbr_mat(
            "M_Brass_Pivot",
            base_srgb=(0.82, 0.64, 0.24),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.018,
            edge_wear=0.28,
            edge_srgb=(0.94, 0.82, 0.48),
            grain_scale=34.0,
            grain_bump=0.018,
            aniso_stretch=(0.5, 2.8, 2.8),
            rough_var=0.024,
        ),
        "M_Hardware_Steel": _build_pbr_mat(
            "M_Hardware_Steel",
            base_srgb=(0.235, 0.250, 0.272),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.45,
            edge_srgb=(0.78, 0.82, 0.86),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.030,
        ),
        "M_Buffer_Poly": _build_pbr_mat(
            "M_Buffer_Poly",
            base_srgb=(0.195, 0.205, 0.220),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=58.0,
            grain_bump=0.040,
            rough_var=0.036,
        ),
        "M_Inner_Bore": _build_pbr_mat(
            "M_Inner_Bore",
            base_srgb=(0.185, 0.198, 0.215),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.012,
            grain_scale=42.0,
            grain_bump=0.016,
            aniso_stretch=(0.35, 4.0, 4.0),
            rough_var=0.022,
        ),

        # --- SUITE 3: vector_v3_mag (Glock-21 Core, Combat FDE Ribbed MagEx2 Sleeve, Bumper & Firewalled Safety-Orange Follower) ---
        "MG_Glock_Poly": _build_pbr_mat(
            "MG_Glock_Poly",
            base_srgb=(0.198, 0.206, 0.220),
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.20,
            edge_srgb=(0.305, 0.318, 0.338),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.54,
            voronoi_scale=92.0,
            rough_var=0.042,
        ),
        "MG_MagEx_FDE": _build_pbr_mat(
            "MG_MagEx_FDE",
            base_srgb=(0.578, 0.476, 0.336),
            roughness=0.59,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.18,
            edge_srgb=(0.685, 0.585, 0.445),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.56,
            voronoi_scale=92.0,
            rough_var=0.042,
        ),
        "MG_MagEx_Rib": _build_pbr_mat(
            "MG_MagEx_Rib",
            base_srgb=(0.518, 0.422, 0.294),
            roughness=0.63,
            metallic=0.00,
            bevel_r=0.020,
            edge_wear=0.16,
            edge_srgb=(0.640, 0.542, 0.405),
            grain_scale=68.0,
            grain_bump=0.048,
            voronoi_grain=0.60,
            voronoi_scale=96.0,
            rough_var=0.040,
        ),
        "MG_Bumper_Charcoal": _build_pbr_mat(
            "MG_Bumper_Charcoal",
            base_srgb=(0.190, 0.198, 0.212),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.18,
            edge_srgb=(0.295, 0.305, 0.324),
            grain_scale=72.0,
            grain_bump=0.056,
            voronoi_grain=0.65,
            voronoi_scale=104.0,
            rough_var=0.042,
        ),
        "MG_FeedLip_Steel": _build_pbr_mat(
            "MG_FeedLip_Steel",
            base_srgb=(0.68, 0.71, 0.76),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.016,
            edge_wear=0.28,
            edge_srgb=(0.88, 0.90, 0.94),
            grain_scale=34.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "MG_Safety_Orange": _build_pbr_mat(
            "MG_Safety_Orange",
            base_srgb=(0.94, 0.36, 0.05),
            roughness=0.38,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.16,
            edge_srgb=(0.98, 0.56, 0.22),
            grain_scale=44.0,
            grain_bump=0.026,
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
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 10,
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
    embed = min(0.014, depth * 0.5)
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


def mk_picatinny_rail(
    name: str, x_start: float, x_end: float, top_y: float, width_z: float,
    num_lugs: int, slot_w: float, slot_depth: float,
    mat: bpy.types.Material, with_center_trough: bool = True,
) -> bpy.types.Object:
    """True MIL-STD-1913 Picatinny rail with 45-deg double-beveled dovetail profile,
    central optical relief trough, and clean machined recoil cross-slots."""
    s = width_z / 2.12
    # Rail spine (underneath slots): sits from y = top_y - 0.60 to top_y - slot_depth
    neck_pts = [
        (-0.98 * s, top_y - 0.62),
        (-0.98 * s, top_y - 0.52),
        (-0.80 * s, top_y - 0.44),
        (-0.80 * s, top_y - slot_depth),
        ( 0.80 * s, top_y - slot_depth),
        ( 0.80 * s, top_y - 0.44),
        ( 0.98 * s, top_y - 0.52),
        ( 0.98 * s, top_y - 0.62),
    ]
    spine = mk_extrude_x(f"{name}_spine", neck_pts, x_start, x_end, bevel=0.012, bevel_segs=1, mat=mat)

    # Full dovetail lug cross-section (with optional center optical relief channel)
    if with_center_trough:
        lug_pts = [
            (-0.80 * s, top_y - slot_depth - 0.04),
            (-1.06 * s, top_y - 0.23),
            (-0.83 * s, top_y),
            (-0.18 * s, top_y),
            (-0.14 * s, top_y - 0.10),
            ( 0.14 * s, top_y - 0.10),
            ( 0.18 * s, top_y),
            ( 0.83 * s, top_y),
            ( 1.06 * s, top_y - 0.23),
            ( 0.80 * s, top_y - slot_depth - 0.04),
        ]
    else:
        lug_pts = [
            (-0.80 * s, top_y - slot_depth - 0.04),
            (-1.06 * s, top_y - 0.23),
            (-0.83 * s, top_y),
            ( 0.83 * s, top_y),
            ( 1.06 * s, top_y - 0.23),
            ( 0.80 * s, top_y - slot_depth - 0.04),
        ]

    total_len = x_end - x_start
    pitch = (total_len + slot_w) / num_lugs
    lug_len = pitch - slot_w
    parts = [spine]
    for i in range(num_lugs):
        lx0 = x_start + i * pitch
        lx1 = min(x_end, lx0 + lug_len)
        if lx1 - lx0 > 0.08:
            parts.append(
                mk_extrude_x(f"{name}_lug_{i}", lug_pts, lx0, lx1, bevel=0.015, bevel_segs=1, mat=mat)
            )
    return join_objects(parts, name)


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
# PART BUILDERS — ATLAS 1: HOUSING, SIGHTS, CONTROLS & GEN II STOCK (7 parts)
# =============================================================================
def build_vector_upper_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: Two-Tone Combat FDE Upper Polymer Housing & Full-Length 36-Slot M1913 Top Rail
    assembledPos: [0, 0, 0] | spans X in [-13.85, +22.60], Y in [+0.625, +4.10], Z in [-1.99, +1.99]."""
    m_fde = mats["H_FDE_Polymer"]
    m_rib = mats["H_FDE_Rib"]
    m_char = mats["H_Charcoal_Poly"]
    m_dark = mats["H_Inner_Dark"]
    m_rail = mats["H_Anodized_Rail"]

    # 1. Sculpted Gen II chamfered upper shell profile in (X, Y)
    profile = [
        (-13.85, 0.68),
        ( 22.60, 0.68),
        ( 22.60, 3.06),
        ( 21.85, 3.58),
        (-13.15, 3.58),
        (-13.85, 2.95),
    ]
    shell = mk_extrude_z("up_shell", profile, -1.84, 1.84, bevel=0.075, bevel_segs=2, mat=m_fde)

    # Subtle geometric upper shoulder chamfers on both flanks (leaves flat Z=+-1.84 wall intact for hero UVs!)
    chamfer_cuts = []
    for zs in (-1, 1):
        chamfer_cuts.append(
            mk_box(f"up_ch_{zs}", 37.0, 0.55, 0.55,
                   xform=[("rx", zs * math.radians(45.0)), ("t", 4.35, 3.66, zs * 1.94)], mat=m_fde)
        )
    bool_subtract(shell, chamfer_cuts)

    # 2. Carve internal inverted FCU cavity, right upper ejection notch & left upper charging slot
    cavity = mk_box("up_cav", 33.4, 2.52, 2.74, xform=[("t", 3.80, 1.72, 0.0)], mat=m_dark)
    ej_notch = mk_box("up_ej", 4.40, 0.96, 0.86, xform=[("t", 8.40, 0.92, 1.72)], mat=m_dark)
    ch_notch = mk_box("up_ch", 7.20, 0.58, 0.86, xform=[("t", 14.80, 0.92, -1.72)], mat=m_dark)
    bool_subtract(shell, [cavity, ej_notch, ch_notch])

    # 3. Boolean-union molded ambidextrous Charcoal selector & safety bosses + 3 FDE pin lugs (zero hidden double walls!)
    bosses = []
    for zs in (-1, 1):
        # Fire selector boss at (-2.85, 2.55)
        bosses.append(
            mk_cyl(f"up_sel_boss_{zs}", 0.58, 0.64, 0.28, axis="z", segs=24,
                   xform=[("t", -2.85, 2.55, zs * 1.85)], mat=m_char, bevel=0.025)
        )
        # Thumb safety boss at (-8.35, 1.25)
        bosses.append(
            mk_cyl(f"up_saf_boss_{zs}", 0.48, 0.54, 0.26, axis="z", segs=24,
                   xform=[("t", -8.35, 1.25, zs * 1.85)], mat=m_char, bevel=0.025)
        )
        # Sculpted brass deflector micro-lip behind right ejection port (+Z)
        if zs == 1:
            bosses.append(
                mk_box("up_deflector", 0.72, 0.68, 0.24,
                       xform=[("ry", math.radians(-22.0)), ("t", 5.85, 1.04, 1.84)],
                       mat=m_char, bevel=0.03, bevel_segs=2)
            )

    for idx_p, pin_x in enumerate((-10.8, 1.2, 14.6)):
        bosses.append(
            mk_box(f"up_lug_{idx_p}", 1.46, 0.65, 3.74,
                   xform=[("t", pin_x, 0.95, 0.0)], mat=m_rib, bevel=0.045, bevel_segs=2)
        )

    shell = bool_union([shell] + bosses, "up_body")

    # Bore clean through-holes for the 3 upper takedown pins & 2 selector cross-axles
    pin_cuts = [
        mk_cyl(f"up_pin_c_{i}", 0.255, 0.255, 4.40, axis="z", segs=20, xform=[("t", px, 0.95, 0.0)], mat=m_dark)
        for i, px in enumerate((-10.8, 1.2, 14.6))
    ]
    pin_cuts.append(
        mk_cyl("up_sel_c", 0.335, 0.335, 4.40, axis="z", segs=20, xform=[("t", -2.85, 2.55, 0.0)], mat=m_dark)
    )
    pin_cuts.append(
        mk_cyl("up_saf_c", 0.295, 0.295, 4.40, axis="z", segs=20, xform=[("t", -8.35, 1.25, 0.0)], mat=m_dark)
    )
    bool_subtract(shell, pin_cuts)

    # 4. Full-length 36-slot hard-anodized MIL-STD-1913 top Picatinny rail (crown Y = +4.10, X in [-12.90, +22.30])
    top_rail = mk_picatinny_rail(
        "up_top_rail", x_start=-12.90, x_end=22.30, top_y=4.10, width_z=2.12,
        num_lugs=36, slot_w=0.50, slot_depth=0.28, mat=m_rail, with_center_trough=True,
    )

    out = join_objects([shell, top_rail], "vector_upper_housing")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_lower_chassis(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Iconic Tall Angular Combat FDE Super V Lower Polymer Chassis, Solidly Welded
    Horizontal Trigger Guard Bridge & Matte Charcoal Stippled Ergonomic Pistol Grip
    assembledPos: [0, 0, 0] | spans X in [-13.45, +22.60], Y in [-12.60, +0.74], Z in [-2.05, +1.95]."""
    m_fde = mats["H_FDE_Polymer"]
    m_rib = mats["H_FDE_Rib"]
    m_char = mats["H_Charcoal_Poly"]
    m_grip = mats["H_Charcoal_Grip"]
    m_dark = mats["H_Inner_Dark"]

    # 1. Main forward Super V chassis & low-bore barrel shroud block (X in [-3.65, +22.60], Z in [-1.81, +1.81])
    fwd_pts = [
        (-3.55,  0.74),
        (22.60,  0.74),
        (22.60, -2.32),
        (15.20, -2.55),  # Integrated Gen II handstop step
        (13.80, -3.55),
        ( 6.65, -12.60), # Iconic slanted KRISS magwell chin
        (-4.15, -12.60), # Flat floor of magwell & Super V chute
        ( 0.85, -1.95),  # -65 deg slanted rear wall of Super V chute
        (-3.55, -1.95),  # Solidly overlaps rear trigger-guard bridge!
    ]
    fwd_block = mk_extrude_z("low_fwd", fwd_pts, -1.81, 1.81, bevel=0.075, bevel_segs=2, mat=m_fde)

    # 2. Rear ergonomic pistol grip + SOLIDLY WELDED horizontal KRISS wrist-bridge & trigger guard loop!
    #    Built as ONE continuous closed polygon with ZERO air gaps front or rear!
    grip_pts = [
        (-12.55,  0.74),
        ( -3.05,  0.74),  # Overlaps fwd_block cleanly by 0.50 cm at top!
        ( -3.05, -2.08),  # Overlaps fwd_block cleanly by 0.50 cm at bottom trigger-guard junction!
        ( -8.25, -2.08),
    ]
    grip_pts += _quad_bez((-8.25, -2.08), (-9.35, -6.20), (-10.35, -10.55), segs=12)  # Ergonomic frontstrap
    grip_pts += [(-13.45, -10.15)]                                                      # Grip pommel heel
    grip_pts += _quad_bez((-13.45, -10.15), (-12.35, -5.40), (-11.65, -1.15), segs=12) # High web backstrap aligned w/ boreY!
    grip_pts += [(-12.55, -0.35)]
    grip_solid = mk_extrude_z("low_grip_solid", grip_pts, -1.58, 1.58, bevel=0.08, bevel_segs=2, mat=m_fde)

    # Weld forward chassis & rear grip/trigger-guard into ONE monolithic manifold shell!
    body = bool_union([fwd_block, grip_solid], "low_mono")

    # Carve clean radiused open trigger-guard window (X in [-7.85, -3.45], Y in [-1.48, -0.05])
    # leaving a rock-solid 0.60 cm thick lower trigger-guard bar (Y in [-2.08, -1.48]) welded front & rear!
    trig_win_pts = _rounded_rect_pts(2.20, 0.715, 0.22, corner_segs=5)
    trig_win_cut = mk_extrude_z(
        "low_trig_win", trig_win_pts, -2.40, 2.40,
        xform=[("t", -5.65, -0.765, 0.0)], mat=m_dark,
    )
    # Authentic narrow upper trigger pass-through slot so vector_trigger passes into upper FCU without clipping!
    trig_slot_cut = mk_box("low_trig_slot", 2.35, 1.05, 0.92, xform=[("t", -5.40, 0.42, 0.0)], mat=m_dark)
    bool_subtract(body, [trig_win_cut, trig_slot_cut])

    # 3. Carve internal mechanical raceways (low-bore barrel shroud, -65 deg Super V chute, 66 deg magwell, bolt raceway, ports)
    barrel_tunnel = mk_cyl(
        "low_cut_bbl", 1.16, 1.16, 12.9, axis="x", segs=28,
        xform=[("t", 17.15, VECTOR_BORE_Y, 0.0)], mat=m_dark,
    )
    superv_chute = mk_box(
        "low_cut_chute", 13.6, 2.95, 2.66,
        xform=[("rz", SUPER_V_CHUTE_ANGLE), ("t", 0.90, -5.65, 0.0)], mat=m_dark,
    )
    magwell_chute = mk_box(
        "low_cut_mag", 15.2, 3.35, 2.68,
        xform=[("rz", VECTOR_MAG_ANGLE), ("t", 6.10, -7.25, 0.0)], mat=m_dark,
    )
    bolt_raceway = mk_box("low_cut_race", 9.20, 2.85, 2.68, xform=[("t", 6.20, -0.45, 0.0)], mat=m_dark)
    ejection_port = mk_box("low_cut_ej", 4.00, 2.45, 0.88, xform=[("t", 8.20, -0.42, 1.72)], mat=m_dark)
    charging_slot = mk_box("low_cut_ch", 7.20, 0.56, 0.88, xform=[("t", 12.80, 0.25, -1.72)], mat=m_dark)
    pin4_hole = mk_cyl(
        "low_cut_pin4", 0.255, 0.255, 4.40, axis="z", segs=20,
        xform=[("t", 13.80, -1.95, 0.0)], mat=m_dark,
    )
    bool_subtract(
        body,
        [barrel_tunnel, superv_chute, magwell_chute, bolt_raceway, ejection_port, charging_slot, pin4_hole],
    )

    # 4. Boolean-union signature two-tone Matte Charcoal grip panels, 4x -65 deg KRISS structural ribs,
    #    flared magwell collar & left-flank extended Glock magazine release paddle (zero double walls!)
    details = []
    for zs in (-1, 1):
        # Matte Charcoal ergonomic stippled grip panel (sits cleanly on grip Z=+-1.58 -> +-1.66)
        details.append(
            mk_box(f"low_grip_pad_{zs}", 2.38, 6.75, 0.22,
                   xform=[("rz", -0.22), ("t", -10.55, -5.85, zs * 1.56)],
                   mat=m_grip, bevel=0.045, bevel_segs=2)
        )
        # 4 signature -65 deg KRISS geometric strengthening ribs (strictly Y <= -3.85 so nameplate above is 100% clear!)
        for r_idx in range(4):
            rx = 0.65 + r_idx * 2.42
            details.append(
                mk_box(f"low_rib_{zs}_{r_idx}", 7.35, 0.44, 0.24,
                       xform=[("rz", SUPER_V_CHUTE_ANGLE), ("t", rx, -7.30, zs * 1.80)],
                       mat=m_rib, bevel=0.04, bevel_segs=2)
            )
        # Flared Matte Charcoal tactical magwell bevel collar at bottom Y = -12.34
        details.append(
            mk_box(f"low_magflare_{zs}", 6.20, 0.54, 0.28,
                   xform=[("t", 3.25, -12.33, zs * 1.80)],
                   mat=m_char, bevel=0.05, bevel_segs=2)
        )

    # Frontstrap horizontal grip finger serrations (Matte Charcoal)
    for fi in range(6):
        u_f = (fi + 0.5) / 6.0
        fx = -8.70 + (-10.15 - (-8.70)) * u_f
        fy = -3.35 + (-9.55 - (-3.35)) * u_f
        details.append(
            mk_box(f"low_fstrap_{fi}", 0.22, 0.36, 2.35,
                   xform=[("rz", -0.22), ("t", fx + 0.08, fy, 0.0)],
                   mat=m_grip, bevel=0.03, bevel_segs=1)
        )

    # Left-side extended Glock-style checkered magazine release button & slide-stop lever boss
    details.append(
        mk_box("low_mag_rel", 1.25, 0.72, 0.36,
               xform=[("rz", 0.38), ("t", 5.25, -3.85, -1.86)],
               mat=m_char, bevel=0.045, bevel_segs=2)
    )
    details.append(
        mk_box("low_bolt_rel", 1.55, 0.30, 0.20,
               xform=[("t", 4.10, -2.75, -1.85)],
               mat=m_char, bevel=0.03, bevel_segs=1)
    )

    body = bool_union([body] + details, "vector_lower_chassis")
    return finish_part(body, bevel_w=0.0, sharp_deg=34.0)


def build_vector_folding_stock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-08: Skeletonized Gen II Combat FDE Polymer Folding Buttstock & Ribbed Rubber Buttpad
    assembledPos: [-14.50, 1.55, 0] | spans X in [-21.16, +0.10], Y in [-8.175, +1.512], Z in [-1.34, +1.34]."""
    m_fde = mats["H_FDE_Polymer"]
    m_rib = mats["H_FDE_Rib"]
    m_rub = mats["H_Rubber_Buttpad"]
    m_char = mats["H_Charcoal_Poly"]
    m_steel = mats["H_Control_Steel"]

    # 1. Outer triangular KRISS Gen II skeletal polymer buttstock frame
    outer_pts = [
        (  0.10,  1.22),
        (-19.85,  0.92),
        (-20.15, -7.85),
        (-18.25, -8.15),
        ( -0.05, -1.18),
    ]
    frame = mk_extrude_z("stk_frame", outer_pts, -1.12, 1.12, bevel=0.075, bevel_segs=2, mat=m_fde)

    # Iconic triangular Gen II weight-saving cutout window + subtle inner recessed pocket
    tri_cut_pts = [
        ( -2.65,  0.34),
        (-16.95,  0.14),
        (-16.95, -5.82),
        ( -2.65, -1.04),
    ]
    tri_cutter = mk_extrude_z("stk_tri_cut", tri_cut_pts, -1.80, 1.80, mat=m_fde)
    # Recessed side lightening flutes along lower diagonal strut
    strut_flutes = []
    for zs in (-1, 1):
        strut_flutes.append(
            mk_box(f"stk_flute_{zs}", 11.2, 0.56, 0.28,
                   xform=[("rz", math.radians(22.0)), ("t", -9.6, -4.35, zs * 1.12)],
                   mat=m_rib, bevel=0.04, bevel_segs=1)
        )
    bool_subtract(frame, [tri_cutter] + strut_flutes)

    # Ergonomic sculpted FDE cheek-weld comb saddle along top strut
    comb = mk_box(
        "stk_comb", 13.8, 0.48, 2.58,
        xform=[("rz", 0.015), ("t", -10.2, 1.18, 0.0)],
        mat=m_rib, bevel=0.08, bevel_segs=2,
    )
    frame = bool_union([frame, comb], "stk_fde_union")

    # 2. Thick contoured Matte Charcoal vulcanized rubber recoil buttpad w/ 9 crisp recoil ribs
    pad_core = mk_box(
        "stk_pad_core", 1.24, 9.20, 2.64,
        xform=[("t", -20.42, -3.55, 0.0)],
        mat=m_rub, bevel=0.10, bevel_segs=2,
    )
    pad_parts = [pad_core]
    for r in range(9):
        ry = -7.45 + r * 0.98
        pad_parts.append(
            mk_box(f"stk_pad_rib_{r}", 0.26, 0.36, 2.68,
                   xform=[("t", -21.02, ry, 0.0)],
                   mat=m_char, bevel=0.04, bevel_segs=1)
        )
    # Recessed steel buttpad mounting screws & rear steel QD sling socket cup
    for sy in (-6.65, -0.45):
        pad_parts.append(
            mk_cyl(f"stk_scr_{sy}", 0.14, 0.14, 0.18, axis="x", segs=16,
                   xform=[("t", -21.04, sy, 0.0)], mat=m_steel, bevel=0.015)
        )
    qd_cup = mk_cyl(
        "stk_qd", 0.34, 0.34, 2.34, axis="z", segs=20,
        xform=[("t", -18.45, -1.25, 0.0)], mat=m_steel, bevel=0.025,
    )
    out = join_objects([frame, qd_cup] + pad_parts, "vector_folding_stock")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_front_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Low-Profile KRISS Defiance Flip-Up Steel Front Sight
    assembledPos: [20.60, 4.10, 0] | spans X in [-1.075, +1.075], Y in [-0.06, +1.849], Z in [-1.24, +1.24]."""
    m_rail = mats["H_Anodized_Rail"]
    m_steel = mats["H_Control_Steel"]
    m_ss = mats["H_Control_Stainless"]
    m_wht = mats["H_Sight_White"]

    clamp = mk_box("fs_clamp", 2.14, 0.50, 2.26, xform=[("t", 0.0, 0.20, 0.0)], mat=m_rail, bevel=0.045, bevel_segs=2)
    hinge_base = mk_cyl("fs_hinge", 0.26, 0.26, 1.56, axis="z", segs=20,
                        xform=[("t", -0.22, 0.44, 0.0)], mat=m_steel, bevel=0.02)
    ear_l = mk_box("fs_ear_l", 0.86, 1.42, 0.22,
                   xform=[("rx", 0.14), ("t", -0.15, 1.12, -0.68)], mat=m_rail, bevel=0.03, bevel_segs=2)
    ear_r = mk_box("fs_ear_r", 0.86, 1.42, 0.22,
                   xform=[("rx", -0.14), ("t", -0.15, 1.12, 0.68)], mat=m_rail, bevel=0.03, bevel_segs=2)
    elev_drum = mk_knurled_cyl("fs_drum", 0.28, 0.22, axis="y", flutes=16, depth=0.015,
                               xform=[("t", -0.15, 0.54, 0.0)], mat=m_steel)
    post = mk_box("fs_post", 0.20, 0.96, 0.16, xform=[("t", -0.15, 0.96, 0.0)], mat=m_steel, bevel=0.02, bevel_segs=1)
    white_dot = mk_cyl("fs_dot", 0.075, 0.075, 0.08, axis="x", segs=14,
                       xform=[("t", -0.24, 1.32, 0.0)], mat=m_wht, bevel=0.01)
    cross_bolt = mk_knurled_cyl("fs_xbolt", 0.17, 2.46, axis="z", flutes=16, depth=0.012,
                                xform=[("t", 0.35, 0.18, 0.0)], mat=m_ss)

    out = join_objects([clamp, hinge_base, ear_l, ear_r, elev_drum, post, white_dot, cross_bolt], "vector_front_sight")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: Low-Profile KRISS Defiance Dual-Aperture Flip-Up Rear Sight
    assembledPos: [-11.40, 4.10, 0] | spans X in [-1.175, +1.175], Y in [-0.06, +1.74], Z in [-1.27, +1.27]."""
    m_rail = mats["H_Anodized_Rail"]
    m_steel = mats["H_Control_Steel"]
    m_ss = mats["H_Control_Stainless"]

    clamp = mk_box("rs_clamp", 2.34, 0.50, 2.26, xform=[("t", 0.0, 0.20, 0.0)], mat=m_rail, bevel=0.045, bevel_segs=2)
    stem = mk_box("rs_stem", 0.66, 0.86, 1.36, xform=[("t", -0.18, 0.82, 0.0)], mat=m_rail, bevel=0.035, bevel_segs=2)
    # Protective side ears framing the ghost-ring peep aperture
    ear_l = mk_box("rs_ear_l", 0.58, 0.92, 0.18, xform=[("t", -0.18, 1.24, -0.60)], mat=m_rail, bevel=0.025, bevel_segs=1)
    ear_r = mk_box("rs_ear_r", 0.58, 0.92, 0.18, xform=[("t", -0.18, 1.24,  0.60)], mat=m_rail, bevel=0.025, bevel_segs=1)
    # Hollow Ghost-Ring peep aperture centered at exact sight line Y = +1.32!
    peep_ring = mk_lathe_x(
        "rs_peep",
        [(0.20, -0.34), (0.41, -0.34), (0.41, -0.02), (0.20, -0.02), (0.20, -0.34)],
        segs=28, xform=[("t", 0.0, 1.32, 0.0)], mat=m_steel,
    )
    windage = mk_knurled_cyl("rs_wind", 0.27, 2.52, axis="z", flutes=20, depth=0.016,
                             xform=[("t", -0.18, 0.72, 0.0)], mat=m_ss)
    cross_bolt = mk_cyl("rs_xbolt", 0.16, 0.16, 2.42, axis="z", segs=18,
                        xform=[("t", 0.42, 0.18, 0.0)], mat=m_ss, bevel=0.02)

    out = join_objects([clamp, stem, ear_l, ear_r, peep_ring, windage, cross_bolt], "vector_rear_sight")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_fire_selector(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-05: Upper Ambidextrous 3-Mode Fire Selector (1 / 2 / A)
    assembledPos: [-2.85, 2.55, 0] | spans X in [-1.471, +0.431], Y in [-0.504, +0.344], Z in [-2.22, +2.22]."""
    m_steel = mats["H_Control_Steel"]
    m_ss = mats["H_Control_Stainless"]
    m_wht = mats["H_Sight_White"]

    drum = mk_cyl("fsel_drum", 0.31, 0.31, 3.96, axis="z", segs=24, mat=m_ss, bevel=0.025)
    cam_flat_cut = mk_box("fsel_cam_cut", 0.40, 0.26, 1.45, xform=[("t", 0.18, -0.22, 0.0)], mat=m_ss)
    bool_subtract(drum, [cam_flat_cut])

    parts = [drum]
    for zs in (-1, 1):
        # Circular pivot hub + sculpted scalloped selector blade + tactile thumb serrations + white pointer pip
        parts.append(
            mk_cyl(f"fsel_hub_{zs}", 0.34, 0.36, 0.26, axis="z", segs=22,
                   xform=[("t", 0.0, 0.0, zs * 2.04)], mat=m_steel, bevel=0.025)
        )
        parts.append(
            mk_box(f"fsel_lev_{zs}", 1.84, 0.50, 0.24,
                   xform=[("rz", -0.18), ("t", -0.52, -0.08, zs * 2.06)],
                   mat=m_steel, bevel=0.04, bevel_segs=2)
        )
        # Anti-slip ridges along selector thumb tail
        for ri in range(4):
            parts.append(
                mk_box(f"fsel_ser_{zs}_{ri}", 0.08, 0.40, 0.06,
                       xform=[("rz", -0.18), ("t", -0.82 - ri * 0.15, -0.14 - ri * 0.027, zs * 2.18)],
                       mat=m_steel, bevel=0.012, bevel_segs=1)
            )
        # Crisp bright white pointer indicator bar on forward nose pointing toward 1 / 2 / A!
        parts.append(
            mk_box(f"fsel_pip_{zs}", 0.44, 0.11, 0.07,
                   xform=[("rz", -0.18), ("t", 0.18, 0.04, zs * 2.18)],
                   mat=m_wht, bevel=0.012, bevel_segs=1)
        )

    out = join_objects(parts, "vector_fire_selector")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_thumb_safety(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-06: Lower Ambidextrous Ergonomic Thumb Safety Lever (S / F)
    assembledPos: [-8.35, 1.25, 0] | spans X in [-1.778, +0.418], Y in [-0.511, +0.351], Z in [-2.20, +2.20]."""
    m_steel = mats["H_Control_Steel"]
    m_red = mats["H_Safety_Red"]

    axle = mk_cyl("tsaf_axle", 0.27, 0.27, 3.92, axis="z", segs=22, mat=m_steel, bevel=0.025)
    parts = [axle]
    for zs in (-1, 1):
        parts.append(
            mk_cyl(f"tsaf_hub_{zs}", 0.30, 0.32, 0.26, axis="z", segs=20,
                   xform=[("t", 0.0, 0.0, zs * 2.02)], mat=m_steel, bevel=0.025)
        )
        parts.append(
            mk_box(f"tsaf_pad_{zs}", 2.12, 0.58, 0.26,
                   xform=[("rz", -0.12), ("t", -0.68, -0.08, zs * 2.04)],
                   mat=m_steel, bevel=0.045, bevel_segs=2)
        )
        for ri in range(5):
            parts.append(
                mk_box(f"tsaf_ser_{zs}_{ri}", 0.08, 0.46, 0.06,
                       xform=[("rz", -0.12), ("t", -0.95 - ri * 0.16, -0.12 - ri * 0.019, zs * 2.17)],
                       mat=m_steel, bevel=0.012, bevel_segs=1)
            )
        # Crimson-red circular fire-status indicator dot on forward tip!
        parts.append(
            mk_cyl(f"tsaf_dot_{zs}", 0.09, 0.09, 0.07, axis="z", segs=16,
                   xform=[("t", 0.16, 0.02, zs * 2.165)], mat=m_red, bevel=0.01)
        )

    out = join_objects(parts, "vector_thumb_safety")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 2: BARREL, BOLT, SUPER V SLIDER, BRASS HANDLE & FCU (12 parts)
# =============================================================================
def build_vector_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-01: 5.5" (140 mm) Low-Bore .45 ACP CHF Barrel w/ M16x1 LH Threads, Forged Trunnion,
    Polished Feed Ramp & 6-Groove Left-Hand Helical Rifling!
    assembledPos: [0, -0.95, 0] | spans X in [+9.73, +24.20], Y in [-1.08, +1.39], Z in [-1.08, +1.08]."""
    m_bbl = mats["M_Barrel_Nitride"]
    m_hw = mats["M_Hardware_Steel"]
    m_cam = mats["M_Polished_Cam"]
    m_bore = mats["M_Inner_Bore"]

    # Multi-step CHF barrel tube with real M16x1 LH muzzle thread rings & recessed 11-deg target crown
    prof = [
        (0.640, 10.20),
        (0.980, 10.20),  # Heavy breech face
        (0.980, 13.45),
        (0.860, 13.55),  # Trunnion journal step
        (0.860, 16.80),
        (0.820, 17.20),  # Heavy combat .45 ACP contour
        (0.820, 23.35),
        (0.735, 23.42),  # M16x1 LH thread relief groove
    ]
    # 6 crisp M16x1 LH machined muzzle thread crests across X in [23.48 .. 24.12]
    for ti in range(6):
        tx0 = 23.48 + ti * 0.105
        prof.extend([(0.775, tx0 + 0.02), (0.775, tx0 + 0.055), (0.728, tx0 + 0.09)])
    prof.extend([
        (0.760, 24.16),
        (0.715, 24.20),  # 45-deg outer muzzle crown bevel
        (0.610, 24.20),  # Match crown rim
        (0.572, 24.12),  # 11-deg recessed target crown dish
        (0.572, 12.65),  # Ø11.43mm (.45 ACP) bore
        (0.606, 12.48),  # .45 ACP straight-wall case-mouth headspacing ledge!
        (0.612, 10.26),  # .45 ACP chamber (22.8 mm)
        (0.640, 10.20),
    ])
    tube = mk_lathe_x("bbl_tube", prof, segs=44, mat=m_bbl)

    # Forged CNC square chamber trunnion block (X in [10.35, 13.35]) with bored center
    trun_pts = _rounded_rect_pts(1.08, 1.08, 0.14, corner_segs=5)
    trun = mk_extrude_x("bbl_trun", trun_pts, 10.35, 13.35, bevel=0.04, bevel_segs=2, mat=m_hw)
    trun_bore = mk_cyl("bbl_trun_cut", 0.96, 0.96, 3.60, axis="x", segs=32, xform=[("t", 11.85, 0.0, 0.0)], mat=m_bore)
    bool_subtract(trun, [trun_bore])

    # Top trunnion cross-pin locking lug + wide mirror-polished .45 ACP feed ramp tongue
    top_lug = mk_box("bbl_lug", 1.85, 0.42, 1.16, xform=[("t", 11.85, 1.18, 0.0)], mat=m_hw, bevel=0.04, bevel_segs=2)
    feed_ramp = mk_box(
        "bbl_ramp", 0.70, 0.28, 0.92,
        xform=[("rz", 0.46), ("t", 10.08, -0.74, 0.0)],
        mat=m_cam, bevel=0.035, bevel_segs=2,
    )

    # Authentic 6-groove 1:16" LEFT-HAND helical rifling lands inside the .45 ACP bore!
    lands = mk_helical_rifling_lands(
        "bbl_land", count=6, bore_r=0.572, depth=0.015, width=0.14,
        x0=12.78, x1=24.06, twist_cm=-40.64, mat=m_bore, segs=18,
    )

    out = join_objects([tube, trun, top_lug, feed_ramp] + lands, "vector_barrel")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_muzzle_device(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-02: M16x1 LH Tactical 4-Slot Flash Suppressor / Compensator w/ Heat & Carbon Shader
    assembledPos: [24.20, -0.95, 0] | spans X in [-0.72, +1.90], Y in [-0.99, +0.99], Z in [-0.99, +0.99]."""
    m_muz = mats["M_MuzzleHeat"]

    prof = [
        (0.77, -0.72),
        (0.95, -0.72),  # Rear shoulder
        (0.99, -0.64),
        (0.99,  0.34),  # Rear wrench collar
        (0.92,  0.42),  # Relief ring
        (0.96,  0.50),
        (0.96,  1.82),  # Forward 4-slot compensator shroud
        (0.90,  1.90),  # Chamfered crown rim
        (0.70,  1.90),  # Exit cone lip
        (0.63,  0.45),  # Internal .45 ACP blast chamber
        (0.77,  0.34),
        (0.77, -0.72),
    ]
    body = mk_lathe_x("muz_body", prof, segs=40, mat=m_muz)

    # 4 longitudinal flash-suppression slots at exact 0 / 90 / 180 / -90 deg (matches BallisticsSystem gas jets!)
    slot_h = mk_box("muz_sh", 1.18, 0.24, 2.35, xform=[("t", 1.22, 0.0, 0.0)], mat=m_muz)
    slot_v = mk_box("muz_sv", 1.18, 2.35, 0.24, xform=[("t", 1.22, 0.0, 0.0)], mat=m_muz)
    # Opposing CNC wrench flats on rear collar
    wf_t = mk_box("muz_wft", 0.56, 0.24, 2.20, xform=[("t", -0.26,  0.98, 0.0)], mat=m_muz)
    wf_b = mk_box("muz_wfb", 0.56, 0.24, 2.20, xform=[("t", -0.26, -0.98, 0.0)], mat=m_muz)
    bool_subtract(body, [slot_h, slot_v, wf_t, wf_b])

    body.name = "vector_muzzle_device"
    body.data.name = "vector_muzzle_device"
    return finish_part(body, bevel_w=0.0, sharp_deg=34.0)


def build_vector_bolt(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-03: Machined Charcoal-Nitride .45 ACP Delayed-Blowback Breech Bolt w/ Lateral Cam Trunnions
    assembledPos: [7.25, -0.95, 0] | spans X in [-2.95, +2.95], Y in [-1.00, +0.77], Z in [-1.12, +1.12]."""
    m_bolt = mats["M_Bolt_Nitride"]
    m_cam = mats["M_Polished_Cam"]
    m_brass = mats["M_Brass_Pivot"]
    m_bore = mats["M_Inner_Bore"]

    # Main CNC billet breech block
    core = mk_box("blt_core", 5.90, 1.54, 1.46, mat=m_bolt, bevel=0.085, bevel_segs=2)

    # Carve recessed .45 ACP bolt face cup, through axial firing-pin channel, feed-lip slot & left ejector channel
    face_cup = mk_cyl("blt_cup", 0.62, 0.62, 0.42, axis="x", segs=28, xform=[("t", 2.86, 0.0, 0.0)], mat=m_bore)
    fp_bore = mk_cyl("blt_fpb", 0.165, 0.165, 6.40, axis="x", segs=20, mat=m_bore)
    feed_cut = mk_box("blt_feed", 3.80, 0.36, 0.52, xform=[("t", 0.95, -0.68, 0.0)], mat=m_bore)
    ej_cut = mk_box("blt_ejc", 4.20, 0.24, 0.28, xform=[("t", 0.95, -0.18, -0.66)], mat=m_bore)
    bool_subtract(core, [face_cup, fp_bore, feed_cut, ej_cut])

    # Mirror-polished twin cylindrical lateral cam trunnions (Z in [-1.12, +1.12] at X = -2.15!)
    trun_axle = mk_cyl(
        "blt_trun", 0.34, 0.34, 2.24, axis="z", segs=28,
        xform=[("t", -2.15, -0.08, 0.0)], mat=m_cam, bevel=0.035,
    )
    # Polished upper horizontal receiver guide-rail bearing shoes
    rail_l = mk_box("blt_rl", 3.40, 0.28, 0.22, xform=[("t", 0.65, 0.42, -0.80)], mat=m_cam, bevel=0.03, bevel_segs=1)
    rail_r = mk_box("blt_rr", 3.40, 0.28, 0.22, xform=[("t", 0.65, 0.42,  0.80)], mat=m_cam, bevel=0.03, bevel_segs=1)
    # Heavy right-side spring-steel .45 ACP claw extractor + brass rim-kiss wear accent + pivot pin
    extractor = mk_box("blt_ext", 1.85, 0.32, 0.22, xform=[("t", 1.88, 0.06, 0.76)], mat=m_brass, bevel=0.03, bevel_segs=2)
    ext_pin = mk_cyl("blt_epin", 0.09, 0.09, 0.42, axis="y", segs=14,
                     xform=[("t", 1.48, 0.06, 0.74)], mat=m_cam, bevel=0.01)
    # Bottom cartridge-stripping lug horn
    strip_horn = mk_box("blt_horn", 1.45, 0.36, 0.42, xform=[("t", 2.10, -0.82, 0.0)], mat=m_bolt, bevel=0.035, bevel_segs=2)

    out = join_objects([core, trun_axle, rail_l, rail_r, extractor, ext_pin, strip_horn], "vector_bolt")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-04: Stepped Inertial 17-4PH Stainless Firing Pin & Captive Return Spring (solid GLB part!)
    assembledPos: [7.10, -0.95, 0] | spans X in [-3.18, +3.05], Y in [-0.27, +0.27], Z in [-0.27, +0.27]."""
    m_ss = mats["M_Stainless_FCU"]
    m_spr = mats["M_Spring_Steel"]

    prof = [
        (0.000, -3.18),
        (0.240, -3.18),  # Rear hammer-strike anvil button
        (0.270, -3.10),
        (0.270, -2.55),
        (0.130, -2.48),  # Rear stem
        (0.130,  0.20),
        (0.230,  0.26),  # Return spring stop collar
        (0.230,  0.52),
        (0.110,  0.58),  # Forward shaft
        (0.110,  2.35),
        (0.058,  2.96),  # Tapered .45 ACP primer needle
        (0.038,  3.04),
        (0.000,  3.05),
    ]
    shaft = mk_lathe_x("fp_shaft", prof, segs=24, mat=m_ss)
    ret_spring = mk_coil_spring(
        "fp_spring", axis="x", start=0.56, end=2.28, center_a=0.0, center_b=0.0,
        coil_r=0.165, wire_r=0.024, coils=9.0, ring_segs=8, steps_per_coil=14, mat=m_spr,
    )
    out = join_objects([shaft, ret_spring], "vector_firing_pin")
    return finish_part(out, bevel_w=0.0, sharp_deg=36.0)


def build_vector_slider(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-05: STAR SHOWPIECE — Brushed Gleaming 5-Axis CNC Stainless Super V Downward-Plunging
    Inertial Cam Slider w/ Mirror-Lapped Variable-Angle Cam Track Liners & -65 deg Spring Tunnel!
    assembledPos: [3.85, -2.35, 0] | spans X in [-2.30, +2.35], Y in [-3.74, +2.15], Z in [-1.27, +1.27]."""
    m_sl = mats["M_Slider_Stainless"]
    m_cam = mats["M_Polished_Cam"]
    m_bore = mats["M_Inner_Bore"]

    # 1. Twin CNC-milled gleaming stainless side cheeks (Z = +-0.92, thickness 0.44 -> outer walls at Z = +-1.14)
    cheek_pts = [
        (-0.35,  2.15),
        ( 2.15,  2.15),
        ( 2.35,  1.35),
        ( 0.45, -3.45),
        (-1.85, -3.45),
        (-2.05, -2.45),
    ]
    cheek_l = mk_extrude_z("sl_cheek_l", cheek_pts, -1.14, -0.70, bevel=0.035, bevel_segs=2, mat=m_sl)
    cheek_r = mk_extrude_z("sl_cheek_r", cheek_pts,  0.70,  1.14, bevel=0.035, bevel_segs=2, mat=m_sl)

    # Carve Renaud Kerbrat variable-angle dogleg Super V cam slot straight through BOTH cheeks!
    cam_slot_pts = [
        (0.55, 1.72),
        (1.75, 1.52),
        (1.15, 0.35),
        (0.05, 0.65),
    ]
    cam_cutter = mk_extrude_z("sl_cam_cut", cam_slot_pts, -1.60, 1.60, mat=m_cam)
    bool_subtract(cheek_l, [cam_cutter])
    cam_cutter2 = mk_extrude_z("sl_cam_cut2", cam_slot_pts, -1.60, 1.60, mat=m_cam)
    bool_subtract(cheek_r, [cam_cutter2])

    # 2. Massive lower inclined -65 deg tungsten/stainless counterweight mass bridging both cheeks
    cw_raw = mk_box(
        "sl_cw", 2.25, 3.65, 2.08,
        xform=[("rz", SUPER_V_CHUTE_ANGLE - math.pi * 0.5), ("t", -0.55, -1.65, 0.0)],
        mat=m_sl, bevel=0.08, bevel_segs=2,
    )
    spring_bore = mk_cyl(
        "sl_sbore", 0.58, 0.58, 5.40, axis="y", segs=28,
        xform=[("rz", SUPER_V_CHUTE_ANGLE - math.pi * 0.5), ("t", -0.55, -1.65, 0.0)],
        mat=m_bore,
    )
    bool_subtract(cw_raw, [spring_bore])

    # 3. Mirror-lapped chrome bearing cam-track liners + twin -65 deg chute guide rails (Z = +-1.16 -> +-1.27)
    accents = []
    for zs in (-1, 1):
        zc = zs * 0.92
        accents.append(
            mk_box(f"sl_lin_t_{zs}", 1.38, 0.14, 0.48,
                   xform=[("rz", -0.52), ("t", 1.12, 1.58, zc)], mat=m_cam, bevel=0.02, bevel_segs=1)
        )
        accents.append(
            mk_box(f"sl_lin_b_{zs}", 1.38, 0.14, 0.48,
                   xform=[("rz", -0.52), ("t", 0.68, 0.58, zc)], mat=m_cam, bevel=0.02, bevel_segs=1)
        )
        accents.append(
            mk_box(f"sl_rail_{zs}", 0.28, 4.35, 0.22,
                   xform=[("rz", SUPER_V_CHUTE_ANGLE - math.pi * 0.5), ("t", -1.04, -1.26, zc + zs * 0.24)],
                   mat=m_cam, bevel=0.025, bevel_segs=1)
        )

    out = join_objects([cheek_l, cheek_r, cw_raw] + accents, "vector_slider")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_guide_rod(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-06: Inclined -65 deg Centerless-Ground Stainless Recoil Guide Rod & Elastomer Buffer
    assembledPos: [-2.45, -12.15, 0], assembledRot: [0, 0, +65 deg]
    spans local X in [-0.45, +14.68], Y/Z in [-0.76, +0.76]."""
    m_ss = mats["M_Stainless_FCU"]
    m_buf = mats["M_Buffer_Poly"]

    rod_prof = [
        (0.00, -0.45),
        (0.72, -0.45),  # Lower chute anchor flange
        (0.76, -0.38),
        (0.76,  0.00),
        (0.62,  0.05),  # Buffer core hub
        (0.62,  0.65),
        (0.24,  0.72),  # Centerless-ground stainless guide shaft
        (0.24, 14.48),
        (0.18, 14.65),  # Rounded top nose
        (0.00, 14.68),
    ]
    rod = mk_lathe_x("gr_rod", rod_prof, segs=28, mat=m_ss)

    # Ribbed elastomer shock-absorber buffer collar around base X in [0.06 .. 0.64]
    buf_prof = [
        (0.615, 0.06),
        (0.680, 0.08),
        (0.680, 0.22),
        (0.645, 0.26),
        (0.680, 0.30),
        (0.680, 0.44),
        (0.645, 0.48),
        (0.680, 0.52),
        (0.680, 0.62),
        (0.615, 0.64),
        (0.615, 0.06),
    ]
    buf = mk_lathe_x("gr_buf", buf_prof, segs=28, mat=m_buf)

    out = join_objects([rod, buf], "vector_guide_rod")
    return finish_part(out, bevel_w=0.0, sharp_deg=36.0)


def build_vector_charging_handle(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: Left-Flank Non-Reciprocating Folding Charging Handle & Iconic C26000 Brass Knuckle!
    assembledPos: [11.80, 0.25, -1.68] | spans X in [-2.10, +3.30], Y in [-0.53, +0.38], Z in [-0.64, +1.04]."""
    m_hw = mats["M_Hardware_Steel"]
    m_ss = mats["M_Stainless_FCU"]
    m_brass = mats["M_Brass_Pivot"]

    slide_bar = mk_box("ch_bar", 5.40, 0.46, 0.34, xform=[("t", 0.60, 0.0, 0.36)], mat=m_hw, bevel=0.03, bevel_segs=2)
    pusher = mk_box("ch_push", 0.55, 0.62, 0.72, xform=[("t", -1.82, -0.22, 0.68)], mat=m_ss, bevel=0.03, bevel_segs=2)
    # Iconic KRISS self-lubricating golden C26000 brass folding hinge knuckle!
    brass_knuckle = mk_box("ch_brass", 1.28, 0.68, 0.54, xform=[("t", -1.25, 0.0, -0.08)], mat=m_brass, bevel=0.05, bevel_segs=2)
    hinge_pin = mk_cyl("ch_hpin", 0.11, 0.11, 0.76, axis="y", segs=18, xform=[("t", -1.25, 0.0, -0.10)], mat=m_ss, bevel=0.015)
    # Folded-forward contoured handle blade + vertical finger-pull hook + anti-slip serrations
    blade = mk_box("ch_blade", 3.65, 0.54, 0.36, xform=[("t", 0.95, 0.0, -0.28)], mat=m_hw, bevel=0.045, bevel_segs=2)
    hook = mk_box("ch_hook", 0.65, 0.64, 0.52, xform=[("t", 2.58, 0.0, -0.38)], mat=m_hw, bevel=0.05, bevel_segs=2)
    serrs = [
        mk_box(f"ch_ser_{i}", 0.10, 0.44, 0.06, xform=[("t", 0.45 + i * 0.24, 0.0, -0.47)], mat=m_hw, bevel=0.012, bevel_segs=1)
        for i in range(6)
    ]

    out = join_objects([slide_bar, pusher, brass_knuckle, hinge_pin, blade, hook] + serrs, "vector_charging_handle")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_takedown_pins(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: 4 Tool-Free Quick-Push Captive Steel Receiver Takedown Pins
    assembledPos: [0, 0, 0] | spans X in [-11.18, +14.98], Y in [-2.324, +1.324], Z in [-2.16, +2.06]."""
    m_hw = mats["M_Hardware_Steel"]
    m_ss = mats["M_Stainless_FCU"]
    m_cam = mats["M_Polished_Cam"]

    pin_coords = (
        (-10.8,  0.95),  # Rear upper/lower FCU pin
        (  1.2,  0.95),  # Central Super V bridge pin
        ( 14.6,  0.95),  # Forward upper housing pin
        ( 13.8, -1.95),  # Lower barrel-trunnion retention pin
    )
    parts = []
    for idx, (px, py) in enumerate(pin_coords):
        # Blackened shaft with machined detent ring groove
        parts.append(
            mk_cyl(f"tp_sh_{idx}", 0.24, 0.24, 3.92, axis="z", segs=22,
                   xform=[("t", px, py, 0.0)], mat=m_hw, bevel=0.025)
        )
        # Knurled stainless left-side pull head
        parts.append(
            mk_knurled_cyl(f"tp_hd_{idx}", 0.375, 0.28, axis="z", flutes=18, depth=0.014,
                           xform=[("t", px, py, -2.02)], mat=m_ss)
        )
        # Polished right-side bullet-tip push dimple cap
        parts.append(
            mk_cyl(f"tp_tip_{idx}", 0.28, 0.28, 0.16, axis="z", segs=20,
                   xform=[("t", px, py, 1.98)], mat=m_cam, bevel=0.025)
        )

    out = join_objects(parts, "vector_takedown_pins")
    return finish_part(out, bevel_w=0.0, sharp_deg=36.0)


def build_vector_stock_hinge(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-07: Push-Button Right-Folding Gen II Steel Stock Hinge Knuckle & Left QD Cup
    assembledPos: [-14.15, 1.55, 0] | spans X in [-0.68, +0.655], Y in [-1.225, +1.355], Z in [-1.63, +1.74]."""
    m_hw = mats["M_Hardware_Steel"]
    m_ss = mats["M_Stainless_FCU"]
    m_cam = mats["M_Polished_Cam"]

    base = mk_box("sh_base", 0.95, 2.45, 3.12, xform=[("t", 0.18, 0.0, 0.0)], mat=m_hw, bevel=0.065, bevel_segs=2)
    kn_top = mk_cyl("sh_kt", 0.46, 0.46, 0.78, axis="y", segs=24, xform=[("t", -0.22,  0.68, 1.28)], mat=m_hw, bevel=0.035)
    kn_bot = mk_cyl("sh_kb", 0.46, 0.46, 0.78, axis="y", segs=24, xform=[("t", -0.22, -0.68, 1.28)], mat=m_hw, bevel=0.035)
    # Ribbed stainless vertical push-button release plunger
    btn = mk_cyl("sh_btn", 0.34, 0.34, 2.55, axis="y", segs=22, xform=[("t", -0.22, 0.08, 1.28)], mat=m_ss, bevel=0.03)
    btn_cap = mk_knurled_cyl("sh_bcap", 0.35, 0.24, axis="y", flutes=18, depth=0.015,
                             xform=[("t", -0.22, 1.22, 1.28)], mat=m_ss)
    # Left-side machined steel QD sling swivel cup
    qd_cup = mk_lathe_x(
        "sh_qd", [(0.24, -0.35), (0.48, -0.35), (0.48, 0.15), (0.24, 0.15), (0.24, -0.35)],
        segs=24, xform=[("ry", math.pi * 0.5), ("t", 0.05, -0.25, -1.48)], mat=m_cam,
    )

    out = join_objects([base, kn_top, kn_bot, btn, btn_cap, qd_cup], "vector_stock_hinge")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_fcu_chassis(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Top-Deck Inverted CNC Brushed Stainless Modular Fire-Control Sub-Frame
    assembledPos: [0.40, 2.15, 0] | spans X in [-6.30, +6.30], Y in [-0.66, +0.72], Z in [-1.09, +1.09]."""
    m_ss = mats["M_Stainless_FCU"]
    m_hw = mats["M_Hardware_Steel"]
    m_cam = mats["M_Polished_Cam"]

    rail_l = mk_box("fcu_rl", 12.60, 1.32, 0.22, xform=[("t", 0.0, 0.0, -0.88)], mat=m_ss, bevel=0.025, bevel_segs=2)
    rail_r = mk_box("fcu_rr", 12.60, 1.32, 0.22, xform=[("t", 0.0, 0.0,  0.88)], mat=m_ss, bevel=0.025, bevel_segs=2)
    # CNC oval weight-relief pockets in stainless side plates
    pockets_l = [
        mk_box(f"fcu_pkl_{i}", 1.80, 0.54, 2.40, xform=[("t", px, -0.04, 0.0)], mat=m_ss, bevel=0.14, bevel_segs=2)
        for i, px in enumerate((-3.45, -0.15, 2.85))
    ]
    bool_subtract(rail_l, pockets_l)
    pockets_r = [
        mk_box(f"fcu_pkr_{i}", 1.80, 0.54, 2.40, xform=[("t", px, -0.04, 0.0)], mat=m_ss, bevel=0.14, bevel_segs=2)
        for i, px in enumerate((-3.45, -0.15, 2.85))
    ]
    bool_subtract(rail_r, pockets_r)

    rear_bh = mk_box("fcu_rbh", 1.15, 1.36, 1.98, xform=[("t", -5.65, 0.04, 0.0)], mat=m_hw, bevel=0.035, bevel_segs=2)
    mid_deck = mk_box("fcu_mid", 2.85, 0.34, 1.96, xform=[("t", -1.85, 0.48, 0.0)], mat=m_hw, bevel=0.03, bevel_segs=1)
    front_br = mk_box("fcu_fbr", 1.45, 0.44, 1.98, xform=[("t",  5.45, 0.42, 0.0)], mat=m_ss, bevel=0.035, bevel_segs=2)
    # 2-Round burst ratcheting cam wheel + precision polished cross-axles!
    ratchet = mk_knurled_cyl("fcu_ratch", 0.36, 0.42, axis="z", flutes=12, depth=0.035,
                             xform=[("t", 1.25, 0.18, 0.0)], mat=m_hw)
    sear_ax = mk_cyl("fcu_sax", 0.13, 0.13, 2.16, axis="z", segs=18, xform=[("t", 1.25,  0.18, 0.0)], mat=m_cam, bevel=0.018)
    ham_ax = mk_cyl("fcu_hax", 0.16, 0.16, 2.18, axis="z", segs=18, xform=[("t", 3.55, -0.30, 0.0)], mat=m_cam, bevel=0.018)

    out = join_objects([rail_l, rail_r, rear_bh, mid_deck, front_br, ratchet, sear_ax, ham_ax], "vector_fcu_chassis")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: High-Mounted Horizontal-Travel Pivoting Trigger & Twin Stainless Transfer Bars
    assembledPos: [-5.40, +0.58, 0] | spans X in [-0.325, +5.875], Y in [-1.26, +1.22], Z in [-0.75, +0.75]."""
    m_hw = mats["M_Hardware_Steel"]
    m_ss = mats["M_Stainless_FCU"]

    shoe_pts = [(-0.32, 0.92), (0.42, 0.92)]
    shoe_pts += _quad_bez((0.42, 0.92), (0.28, -0.15), (0.48, -1.18), segs=10)
    shoe_pts += [(-0.08, -1.26)]
    shoe_pts += _quad_bez((-0.08, -1.26), (-0.36, -0.20), (-0.32, 0.92), segs=10)
    shoe = mk_extrude_z("trg_shoe", shoe_pts, -0.34, 0.34, bevel=0.04, bevel_segs=2, mat=m_hw)

    pivot = mk_cyl("trg_piv", 0.26, 0.26, 1.38, axis="z", segs=20, xform=[("t", 0.05, 0.88, 0.0)], mat=m_ss, bevel=0.025)
    bar_l = mk_box("trg_bl", 5.85, 0.28, 0.14, xform=[("t", 2.95, 1.08, -0.68)], mat=m_ss, bevel=0.02, bevel_segs=1)
    bar_r = mk_box("trg_br", 5.85, 0.28, 0.14, xform=[("t", 2.95, 1.08,  0.68)], mat=m_ss, bevel=0.02, bevel_segs=1)

    out = join_objects([shoe, pivot, bar_l, bar_r], "vector_trigger")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Inverted Top-Mounted Downward-Swinging Hardened Steel Hammer
    assembledPos: [3.95, 1.85, 0] | spans X in [-2.22, +0.52], Y in [-2.02, +0.52], Z in [-0.78, +0.78]."""
    m_hw = mats["M_Hardware_Steel"]
    m_cam = mats["M_Polished_Cam"]
    m_ss = mats["M_Stainless_FCU"]

    ham_pts = [(-0.42, 0.52), (0.52, 0.52), (0.45, -0.32)]
    ham_pts += _quad_bez((0.45, -0.32), (-0.35, -1.15), (-1.68, -2.02), segs=10)
    ham_pts += [(-2.22, -1.52)]
    ham_pts += _quad_bez((-2.22, -1.52), (-1.12, -0.68), (-0.42, 0.52), segs=10)
    body = mk_extrude_z("ham_body", ham_pts, -0.33, 0.33, bevel=0.04, bevel_segs=2, mat=m_hw)

    # Polished steel cross-pivot sleeve + hardened firing-pin impact anvil pad + sear engagement lug
    piv = mk_cyl("ham_piv", 0.26, 0.26, 1.56, axis="z", segs=22, mat=m_cam, bevel=0.025)
    sear_lug = mk_box("ham_sear", 0.42, 0.26, 0.72, xform=[("t", -0.48, 0.34, 0.0)], mat=m_ss, bevel=0.02, bevel_segs=1)
    strike_pad = mk_box("ham_pad", 0.48, 0.22, 0.54,
                        xform=[("rz", math.radians(-42.0)), ("t", -1.94, -1.72, 0.0)],
                        mat=m_cam, bevel=0.02, bevel_segs=1)

    out = join_objects([body, piv, sear_lug, strike_pad], "vector_hammer")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 3: 66-DEG EXTENDED MAGEX2 .45 ACP MAGAZINE (3 parts)
# =============================================================================
def build_vector_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: 66-Deg Forward-Raked 25-Rd Glock-21 Core + Combat FDE Ribbed MagEx2 Sleeve
    assembledPos: [4.95, -9.85, 0], assembledRot: [0, 0, +66 deg]
    spans local X in [-8.10, +8.575], Y in [-1.87, +1.87], Z in [-1.52, +1.52].
    Strictly hollow inside (`iz=0.98, iy=1.42`) for zero ammo clipping in Section-Cut mode!"""
    m_glock = mats["MG_Glock_Poly"]
    m_fde = mats["MG_MagEx_FDE"]
    m_rib = mats["MG_MagEx_Rib"]
    m_steel = mats["MG_FeedLip_Steel"]

    # 1. Glock-21 matte charcoal polymer-over-steel upper core (local X in [-8.10, +8.45])
    core_outer_pts = _rounded_rect_pts(1.24, 1.62, 0.24, corner_segs=5)
    core_solid = mk_extrude_x("mg_core", core_outer_pts, -8.10, 8.45, bevel=0.035, bevel_segs=2, mat=m_glock)

    # 2. Combat FDE flared MagEx2 lower extension sleeve (local X in [-8.05, -1.20], outer Z=+-1.42, Y=+-1.82)
    slv_outer_pts = _rounded_rect_pts(1.42, 1.82, 0.26, corner_segs=5)
    slv_solid = mk_extrude_x("mg_slv", slv_outer_pts, -8.05, -1.20, bevel=0.055, bevel_segs=2, mat=m_fde)

    # Union core + FDE sleeve first, then carve ONE clean full-length hollow internal ammo channel!
    mag = bool_union([core_solid, slv_solid], "mg_shell")

    # Sculpted FDE anti-slip MagEx2 ribs cleanly ABOVE (-1.72, -2.30) & BELOW (-6.22, -6.92, -7.58)
    # the smooth unobstructed FDE nameplate bay (local X in [-5.80, -3.10], 100% below magwell lip!)
    rib_objs = []
    for rx in (-1.72, -2.30, -6.22, -6.92, -7.58):
        for zs in (-1, 1):
            rib_objs.append(
                mk_box(f"mg_rib_{rx:.2f}_{zs}", 0.36, 3.66, 0.20,
                       xform=[("t", rx, 0.0, zs * 1.42)], mat=m_rib, bevel=0.035, bevel_segs=2)
            )
    mag = bool_union([mag] + rib_objs, "mg_ribbed")

    # Hollow interior channel (`iz = 0.98, iy = 1.40`) + left-side Glock magazine catch lock notch!
    cavity_pts = _rounded_rect_pts(0.98, 1.40, 0.14, corner_segs=3)
    cavity = mk_extrude_x("mg_cav", cavity_pts, -8.50, 8.85, mat=m_glock)
    catch_notch = mk_box("mg_catch", 0.95, 0.56, 0.30, xform=[("t", 4.45, -1.12, -1.24)], mat=m_glock)
    bool_subtract(mag, [cavity, catch_notch])

    # Hardened brushed steel Glock-21 feed-lip liner inserts at top mouth (`local X = +8.15`)
    lip_l = mk_box("mg_lip_l", 0.85, 2.35, 0.24, xform=[("t", 8.15, -0.10, -1.08)], mat=m_steel, bevel=0.03, bevel_segs=2)
    lip_r = mk_box("mg_lip_r", 0.85, 2.35, 0.24, xform=[("t", 8.15, -0.10,  1.08)], mat=m_steel, bevel=0.03, bevel_segs=2)

    out = join_objects([mag, lip_l, lip_r], "vector_mag_body")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


def build_vector_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: STRICTLY FIREWALLED Vivid Safety-Orange Stepped Anti-Tilt .45 ACP Polymer Follower
    assembledPos: [7.65, -3.78, 0], assembledRot: [0, 0, +66 deg]
    spans local X in [-0.725, +1.070], Y in [-1.24, +1.36], Z in [-0.95, +0.89]."""
    m_org = mats["MG_Safety_Orange"]

    base = mk_box("fol_base", 1.45, 2.46, 1.78, mat=m_org, bevel=0.06, bevel_segs=2)
    # Concave .45 ACP double-stack cartridge-cradle upper step ridge
    step = mk_box("fol_step", 0.46, 2.30, 0.82, xform=[("t", 0.84, 0.04, -0.38)], mat=m_org, bevel=0.04, bevel_segs=2)
    # Bolt hold-open actuation tab
    tab = mk_box("fol_tab", 0.44, 0.48, 0.34, xform=[("t", 0.72, 1.12, -0.78)], mat=m_org, bevel=0.03, bevel_segs=2)

    fol = bool_union([base, step, tab], "vector_mag_follower")
    # Underside spring-centering recess pocket
    spr_rec = mk_box("fol_rec", 0.55, 1.65, 1.15, xform=[("t", -0.58, 0.0, 0.0)], mat=m_org)
    bool_subtract(fol, [spr_rec])
    return finish_part(fol, bevel_w=0.0, sharp_deg=34.0)


def build_vector_mag_baseplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: Extended Kriss MagEx2 Two-Tone FDE / Charcoal Ribbed Impact Bumper Baseplate
    assembledPos: [1.25, -18.15, 0], assembledRot: [0, 0, +66 deg]
    spans local X in [-0.73, +0.97], Y in [-2.12, +1.98], Z in [-1.51, +1.51]."""
    m_char = mats["MG_Bumper_Charcoal"]
    m_fde = mats["MG_MagEx_FDE"]
    m_steel = mats["MG_FeedLip_Steel"]

    # Main reinforced charcoal impact bumper shoe with bottom anti-slip traction ribs
    shoe = mk_box("bp_shoe", 1.32, 3.96, 3.00, mat=m_char, bevel=0.10, bevel_segs=2)
    # Combat FDE forward toe-lip extension collar
    toe = mk_box("bp_toe", 0.58, 0.68, 2.86, xform=[("t", 0.68, -1.78, 0.0)], mat=m_fde, bevel=0.055, bevel_segs=2)
    # Bottom anti-slip traction bars + side quick-strip finger ridges
    ribs = []
    for ri in range(4):
        ry = -1.25 + ri * 0.84
        ribs.append(
            mk_box(f"bp_rib_{ri}", 0.14, 0.34, 2.66, xform=[("t", -0.66, ry, 0.0)], mat=m_char, bevel=0.02, bevel_segs=1)
        )
    # Flush-recessed brushed stainless center disassembly detent button on underside
    detent = mk_cyl("bp_det", 0.22, 0.22, 0.34, axis="x", segs=20, xform=[("t", -0.56, 0.0, 0.0)], mat=m_steel, bevel=0.025)

    out = join_objects([shoe, toe, detent] + ribs, "vector_mag_baseplate")
    return finish_part(out, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & Packing Across 3 Dedicated 2K Hero Atlases (ZERO Overlap!)
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
    pack_margin = min(0.024, max(0.006, 0.006 / max(0.20, min(du, dv))))

    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.0055,
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
    assert span_u > 0.45 and span_v > 0.45, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_housing_atlas(housing_objs: list[bpy.types.Object]):
    """Unwraps 7 housing, stock, sight & control parts into `vector_v3_housing` (2048x2048):
      - Hero Band 1 (`vector_lower_chassis` Left  FDE Flank -Z, X>=-3.45): u[0.012,0.988], v[0.773,0.988]
      - Hero Band 2 (`vector_lower_chassis` Right FDE Flank +Z, X>=-3.45): u[0.012,0.988], v[0.545,0.760]
      - Hero Band 3 (`vector_upper_housing` Left  FDE Flank -Z):           u[0.012,0.988], v[0.442,0.532]
      - Hero Band 4 (`vector_upper_housing` Right FDE Flank +Z):           u[0.012,0.988], v[0.339,0.429]
      - Hero Band 5 (`vector_upper_housing` 36-Slot M1913 Top Rail +Y):    u[0.012,0.988], v[0.284,0.326]
      - Packed Region A (`vector_folding_stock`):                          u[0.010,0.390], v[0.010,0.270]
      - Packed Region B (`upper` + `lower` remaining faces):               u[0.405,0.835], v[0.010,0.270]
      - Packed Region C (Sights, Fire Selector & Thumb Safety):            u[0.850,0.990], v[0.010,0.270]
    """
    def is_hero_housing_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "vector_lower_chassis" and mat_name == "H_FDE_Polymer":
            if tx >= -3.45 and ((nz > 0.82 and tz > 1.72) or (nz < -0.82 and tz < -1.72)):
                return True
        if obj_name == "vector_upper_housing":
            if mat_name == "H_FDE_Polymer" and ((nz > 0.82 and tz > 1.74) or (nz < -0.82 and tz < -1.74)):
                return True
            if mat_name == "H_Anodized_Rail" and ny > 0.88 and ty > 4.05:
                return True
        return False

    stock_grp = [o for o in housing_objs if o.name == "vector_folding_stock"]
    shell_grp = [o for o in housing_objs if o.name in {"vector_upper_housing", "vector_lower_chassis"}]
    ctrl_grp = [o for o in housing_objs if o.name in {
        "vector_front_sight", "vector_rear_sight", "vector_fire_selector", "vector_thumb_safety"
    }]

    _smart_unwrap_and_pack_rect(stock_grp, 0.010, 0.390, 0.010, 0.270)
    _smart_unwrap_and_pack_rect(shell_grp, 0.405, 0.835, 0.010, 0.270, skip_face_fn=is_hero_housing_face)
    _smart_unwrap_and_pack_rect(ctrl_grp,  0.850, 0.990, 0.010, 0.270)

    # 1) Project undistorted 1:1 planar hero UVs onto `vector_lower_chassis` Left & Right FDE flanks
    low = next(o for o in housing_objs if o.name == "vector_lower_chassis")
    bm = bmesh.new()
    bm.from_mesh(low.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in low.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_housing_face("vector_lower_chassis", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-3.45)) / 26.05))
            yn = max(0.0, min(1.0, (ty - (-12.60)) / 13.34))
            if is_right:
                loop[uv_layer].uv = (0.012 + xn * 0.976, 0.545 + yn * 0.215)
            else:
                loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.976, 0.773 + yn * 0.215)
    bm.to_mesh(low.data)
    bm.free()

    # 2) Project undistorted 1:1 planar hero UVs onto `vector_upper_housing` Flanks & Top Rail Crown
    up = next(o for o in housing_objs if o.name == "vector_upper_housing")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_housing_face("vector_upper_housing", f, mname):
            continue
        if mname == "H_Anodized_Rail":
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx - (-12.90)) / 35.20))
                zn = max(0.0, min(1.0, (tz + 0.88) / 1.76))
                loop[uv_layer].uv = (0.012 + xn * 0.976, 0.284 + (1.0 - zn) * 0.042)
        else:
            is_right = (-f.normal.y) > 0.0
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx - (-13.85)) / 36.45))
                yn = max(0.0, min(1.0, (ty - 0.68) / 2.90))
                if is_right:
                    loop[uv_layer].uv = (0.012 + xn * 0.976, 0.339 + yn * 0.090)
                else:
                    loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.976, 0.442 + yn * 0.090)
    bm.to_mesh(up.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 12 metal barrel, bolt, Super V CNC slider, brass handle & FCU parts into `vector_v3_metal`:
      - Hero Band 1 (`vector_slider` Right/Left CNC Stainless Cheeks): u[0.015,0.550], v[0.640,0.985]
      - Hero Band 2 (`vector_bolt` Right Flank visible in port):       u[0.580,0.985], v[0.855,0.985]
      - Packed Zone A (Exterior ordnance & brass handle):              u[0.010,0.560], v[0.010,0.618]
      - Packed Zone B (Internal gleaming stainless slider/FCU/rod/fp): u[0.578,0.990], v[0.310,0.835]
      - Packed Zone C (Internal dark steel bolt/hammer):               u[0.578,0.990], v[0.010,0.292]
    """
    def is_hero_metal_face(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if obj_name == "vector_slider" and mat_name == "M_Slider_Stainless":
            if (nz > 0.85 and tz > 1.08) or (nz < -0.85 and tz < -1.08):
                return True
        if obj_name == "vector_bolt" and mat_name == "M_Bolt_Nitride":
            if nz > 0.85 and tz > 0.68:
                return True
        return False

    ext_grp = [o for o in metal_objs if o.name in {
        "vector_barrel", "vector_muzzle_device", "vector_charging_handle",
        "vector_takedown_pins", "vector_stock_hinge", "vector_trigger",
    }]
    int_ss_grp = [o for o in metal_objs if o.name in {
        "vector_slider", "vector_guide_rod", "vector_fcu_chassis", "vector_firing_pin",
    }]
    int_dk_grp = [o for o in metal_objs if o.name in {"vector_bolt", "vector_hammer"}]

    _smart_unwrap_and_pack_rect(ext_grp,    0.010, 0.560, 0.010, 0.618)
    _smart_unwrap_and_pack_rect(int_ss_grp, 0.578, 0.990, 0.310, 0.835, skip_face_fn=is_hero_metal_face)
    _smart_unwrap_and_pack_rect(int_dk_grp, 0.578, 0.990, 0.010, 0.292, skip_face_fn=is_hero_metal_face)

    # 1) Project undistorted hero UVs onto `vector_slider` Left & Right CNC Stainless cheeks
    sl = next(o for o in metal_objs if o.name == "vector_slider")
    bm = bmesh.new()
    bm.from_mesh(sl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sl.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_metal_face("vector_slider", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-2.10)) / 4.45))
            yn = max(0.0, min(1.0, (ty - (-3.45)) / 5.60))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.260, 0.640 + yn * 0.345)
            else:
                loop[uv_layer].uv = (0.290 + (1.0 - xn) * 0.260, 0.640 + yn * 0.345)
    bm.to_mesh(sl.data)
    bm.free()

    # 2) Project undistorted hero UVs onto `vector_bolt` Right flank (+Z)
    blt = next(o for o in metal_objs if o.name == "vector_bolt")
    bm = bmesh.new()
    bm.from_mesh(blt.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in blt.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_metal_face("vector_bolt", f, mname):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 2.95) / 5.90))
            yn = max(0.0, min(1.0, (ty + 0.77) / 1.54))
            loop[uv_layer].uv = (0.580 + xn * 0.405, 0.855 + yn * 0.130)
    bm.to_mesh(blt.data)
    bm.free()


def unwrap_mag_atlas(mag_objs: list[bpy.types.Object]):
    """Unwraps 3 extended .45 ACP MagEx2 parts into `vector_v3_mag` (2048x2048):
      - Hero Band 1 (`vector_mag_body` Right Flank +Z):          u[0.015,0.280], v[0.015,0.985]
      - Hero Band 2 (`vector_mag_body` Left  Flank -Z):          u[0.298,0.563], v[0.015,0.985]
      - Hero Band 3 (`vector_mag_body` Rear Spine  +Y):          u[0.582,0.742], v[0.015,0.985]
      - STRICT FIREWALL (`vector_mag_follower` Safety-Orange):   u[0.768,0.988], v[0.640,0.985]
      - Packed Zone A (`vector_mag_baseplate` FDE/Charcoal):     u[0.768,0.988], v[0.330,0.612]
      - Packed Zone B (`vector_mag_body` rem ribs/cavity/lips):  u[0.768,0.988], v[0.015,0.305]
    """
    def is_hero_mag_face(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "vector_mag_body":
            return False
        if mat_name not in ("MG_Glock_Poly", "MG_MagEx_FDE"):
            return False
        c = face.calc_center_median()
        n = face.normal
        ty, tz = c.z, -c.y
        ny, nz = n.z, -n.y
        # Outer Right (+Z) & Left (-Z) flat flank walls (Glock upper |Z|~1.24, MagEx2 lower |Z|~1.42; excludes inner cavity |Z|<=0.98!)
        if abs(nz) > 0.85 and abs(tz) > 1.15:
            return True
        # Outer Rear Spine (+Y_local: Glock upper ty~1.62, MagEx2 lower ty~1.82; excludes inner cavity ty<=1.40!)
        if ny > 0.85 and ty > 1.54:
            return True
        return False

    fol_grp = [o for o in mag_objs if o.name == "vector_mag_follower"]
    bp_grp = [o for o in mag_objs if o.name == "vector_mag_baseplate"]
    mag_grp = [o for o in mag_objs if o.name == "vector_mag_body"]

    _smart_unwrap_and_pack_rect(fol_grp, 0.768, 0.988, 0.640, 0.985)
    _smart_unwrap_and_pack_rect(bp_grp,  0.768, 0.988, 0.330, 0.612)
    _smart_unwrap_and_pack_rect(mag_grp, 0.768, 0.988, 0.015, 0.305, skip_face_fn=is_hero_mag_face)

    mag = next(o for o in mag_objs if o.name == "vector_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_mag_face("vector_mag_body", f, mname):
            continue
        ny = f.normal.z
        nz = -f.normal.y
        if nz > 0.85:
            # Right Flank (+Z): Screen UP = +X_local, Screen RIGHT = -Y_local (Front right, Rear left!)
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 8.10) / 16.55))
                yn = max(0.0, min(1.0, (1.82 - ty) / 3.64))
                loop[uv_layer].uv = (0.015 + yn * 0.265, 0.015 + xn * 0.970)
        elif nz < -0.85:
            # Left Flank (-Z): Screen UP = +X_local, Screen RIGHT = +Y_local (Front left, Rear right!)
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 8.10) / 16.55))
                yn = max(0.0, min(1.0, (ty + 1.82) / 3.64))
                loop[uv_layer].uv = (0.298 + yn * 0.265, 0.015 + xn * 0.970)
        else:
            # Rear Spine (+Y_local): Screen UP = +X_local, Screen RIGHT = +Z_local (Left -Z left, Right +Z right!)
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx + 8.10) / 16.55))
                zn = max(0.0, min(1.0, (tz + 1.42) / 2.84))
                loop[uv_layer].uv = (0.582 + zn * 0.160, 0.015 + xn * 0.970)
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
    run_bake("albedo", "EMIT", samples=8, fill_color=(0.05, 0.048, 0.042, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=8, fill_color=(0.55, 0.55, 0.55, 1.0))
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
        # Atlas 1: Two-Tone Combat FDE / Charcoal Housing, M1913 Rail, Sights, Controls & Stock (7 parts)
        "vector_upper_housing":   build_vector_upper_housing,
        "vector_lower_chassis":   build_vector_lower_chassis,
        "vector_folding_stock":   build_vector_folding_stock,
        "vector_front_sight":     build_vector_front_sight,
        "vector_rear_sight":      build_vector_rear_sight,
        "vector_fire_selector":   build_vector_fire_selector,
        "vector_thumb_safety":    build_vector_thumb_safety,
        # Atlas 2: 5.5" Low-Bore CHF Barrel, Comp, Nitride Bolt, Super V CNC Slider, Brass Handle & FCU (12 parts)
        "vector_barrel":          build_vector_barrel,
        "vector_muzzle_device":   build_vector_muzzle_device,
        "vector_bolt":            build_vector_bolt,
        "vector_firing_pin":      build_vector_firing_pin,
        "vector_slider":          build_vector_slider,
        "vector_guide_rod":       build_vector_guide_rod,
        "vector_charging_handle": build_vector_charging_handle,
        "vector_takedown_pins":   build_vector_takedown_pins,
        "vector_stock_hinge":     build_vector_stock_hinge,
        "vector_fcu_chassis":     build_vector_fcu_chassis,
        "vector_trigger":         build_vector_trigger,
        "vector_hammer":          build_vector_hammer,
        # Atlas 3: 66-Deg Extended .45 ACP MagEx2 Magazine & Firewalled Safety-Orange Follower (3 parts)
        "vector_mag_body":        build_vector_mag_body,
        "vector_mag_follower":    build_vector_mag_follower,
        "vector_mag_baseplate":   build_vector_mag_baseplate,
    }

    print("[BUILD] Sculpting all 22 solid KRISS Vector SMG Gen II (.45 ACP) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    housing_objs = [built[pid] for pid in HOUSING_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    mag_objs = [built[pid] for pid in MAG_PARTS]
    all_objs = housing_objs + metal_objs + mag_objs
    assert len(all_objs) == 22, f"Expected 22 solid parts, got {len(all_objs)}"

    print("[VERIFY] Checking manifoldness, outward normals & CAD bounding-box alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: housing (7), metal (12), mag (3)...")
    unwrap_housing_atlas(housing_objs)
    unwrap_metal_atlas(metal_objs)
    unwrap_mag_atlas(mag_objs)

    for label, group in (("housing", housing_objs), ("metal", metal_objs), ("mag", mag_objs)):
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
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="vector_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking vector_v3_housing (2048x2048, 7 housing, rail, sight, control & stock parts)...")
        bake_atlas_suite("housing", housing_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking vector_v3_metal (2048x2048, 12 barrel, comp, bolt, Super V slider, brass handle & FCU parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking vector_v3_mag (2048x2048, 3 MagEx2 body, bumper & firewalled safety-orange follower parts)...")
        bake_atlas_suite("mag", mag_objs, all_objs, tmp_dir)

        print("[POST] Compositing KRISS rollmarks, 1/2/A & S/F icons, T2..T36 rail, CNC slider, witness holes & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "vector_v3_housing_albedo.webp",
        TEX_OUT_DIR / "vector_v3_housing_normal.webp",
        TEX_OUT_DIR / "vector_v3_housing_roughness.webp",
        TEX_OUT_DIR / "vector_v3_metal_albedo.webp",
        TEX_OUT_DIR / "vector_v3_metal_normal.webp",
        TEX_OUT_DIR / "vector_v3_metal_roughness.webp",
        TEX_OUT_DIR / "vector_v3_mag_albedo.webp",
        TEX_OUT_DIR / "vector_v3_mag_normal.webp",
        TEX_OUT_DIR / "vector_v3_mag_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== KRISS VECTOR SMG GEN II (.45 ACP) V3 ASSET BUDGET ===")
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
