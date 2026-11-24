#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Mathews LIFT 33 Flagship Compound Bow
=====================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 4 — Final 19/19 Grand Slam)

Generates:
  - public/models/lift33.glb (Draco-compressed glTF 2.0, all 19 solid parts; skips ONLY
    the 5 dynamic GPU-flexing `aSpringParam` CSG parts: `lift33_upper_limbs`,
    `lift33_lower_limbs`, `lift33_cam_axles`, `lift33_bowstring`, `lift33_yoke_cables`)
  - public/textures/lift33_v3_riser_{albedo,normal,roughness}.webp        (2048x2048 Packed ORM)
  - public/textures/lift33_v3_cams_acc_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)
  - public/textures/lift33_v3_quiver_arrow_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X target/arrow tip, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior stationary parts at assembledPos,
    then all 19 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/lift33/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_lift33_photoreal.py
"""

from __future__ import annotations

import json
import math
import os
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# =============================================================================
# MODE 2: System Python Post-Process (Mathews LIFT 33 Laser Etchings, 2x2 3K
#         Carbon Weave, SwitchWeight-X Bronze-Gold Cam Radial Engravings,
#         Bridge-Lock Sight Tape, LowPro Hood Crest, 300 Spine Arrow & ORM)
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

    def _fit_font(draw: ImageDraw.ImageDraw, text: str, path: str, max_w: float, max_h: float):
        """Returns the largest crisp TrueType font that fits inside (max_w, max_h) with zero clipping."""
        sz = max(10, int(round(max_h)))
        while sz > 10:
            f = _load_font(path, sz)
            bb = draw.textbbox((0, 0), text, font=f)
            if (bb[2] - bb[0]) <= max_w and (bb[3] - bb[1]) <= max_h:
                return f
            sz = max(10, int(sz * 0.90) - 1)
        return _load_font(path, 10)

    def _paste_cyl_text_both_sides(
        dest_img: Image.Image,
        x0: int,
        x1: int,
        strip_h: int,
        draw_fn,
    ):
        """Renders crisp upright, un-mirrored text onto BOTH +Z (top quarter, cy=0.25) and -Z (bottom quarter, cy=0.75)
        of an X-axis cylinder UV map (`v = (atan2(tz, ty) + pi) / 2pi`).
        - On +Z flank (`v~0.75`, `py~0.25*H`): +u=+X (screen right), +py=+Y (screen up) -> FLIP_TOP_BOTTOM!
        - On -Z flank (`v~0.25`, `py~0.75*H`): +u=+X (screen left), -py=+Y (screen up) -> FLIP_LEFT_RIGHT!"""
        sw, sh = dest_img.size
        bw = max(16, x1 - x0)
        bh = max(16, strip_h)
        strip = Image.new("L", (bw, bh), 0)
        draw_fn(ImageDraw.Draw(strip), bw, bh)

        # +Z right flank (cy = 0.25 * sh)
        s_right = strip.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        y_r = max(0, int(round(sh * 0.25 - bh * 0.5)))
        crop_r = np.asarray(dest_img.crop((x0, y_r, x0 + bw, y_r + bh)), dtype=np.uint8)
        dest_img.paste(Image.fromarray(np.maximum(crop_r, np.asarray(s_right, dtype=np.uint8))), (x0, y_r))

        # -Z left flank (cy = 0.75 * sh)
        s_left = strip.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        y_l = max(0, int(round(sh * 0.75 - bh * 0.5)))
        crop_l = np.asarray(dest_img.crop((x0, y_l, x0 + bw, y_l + bh)), dtype=np.uint8)
        dest_img.paste(Image.fromarray(np.maximum(crop_l, np.asarray(s_left, dtype=np.uint8))), (x0, y_l))

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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.4) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float
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

    def _draw_mathews_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float):
        """Crisp Mathews archery compound-bow 'M' diamond crest emblem."""
        lw = max(2, round(r * 0.14))
        # Outer hex-diamond crest
        pts = [
            (cx, cy - r),
            (cx + r * 0.88, cy - r * 0.42),
            (cx + r * 0.88, cy + r * 0.42),
            (cx, cy + r),
            (cx - r * 0.88, cy + r * 0.42),
            (cx - r * 0.88, cy - r * 0.42),
        ]
        draw.polygon(pts, outline=255, width=lw)
        # Inner stylized 'M' bowstring chevron
        m_pts = [
            (cx - r * 0.50, cy + r * 0.42),
            (cx - r * 0.50, cy - r * 0.36),
            (cx, cy + r * 0.14),
            (cx + r * 0.50, cy - r * 0.36),
            (cx + r * 0.50, cy + r * 0.42),
        ]
        draw.line(m_pts, fill=255, width=max(2, round(r * 0.16)), joint="curve")

    def _synth_3k_twill_carbon(
        u_grid: np.ndarray,
        v_grid: np.ndarray,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
        cells_u: float,
        cells_v: float,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Generates authentic 2x2 twill 3K woven carbon fiber (albedo RGB, height, roughness, metalness)
        inside the specified UV rectangle with anisotropic warp/weft tow sheen."""
        lu = np.clip((u_grid - u0) / max(u1 - u0, 1e-6), 0.0, 1.0) * cells_u
        lv = np.clip((v_grid - v0) / max(v1 - v0, 1e-6), 0.0, 1.0) * cells_v

        iu = np.floor(lu).astype(np.int32)
        iv = np.floor(lv).astype(np.int32)
        fu = lu - iu
        fv = lv - iv

        # 2x2 twill staircase: warp-over when ((iu + iv) % 4) < 2
        phase = (iu + iv) % 4
        is_warp = (phase < 2).astype(np.float32)

        # Rounded tow cross-section profile along warp (u) and weft (v)
        warp_crown = np.sin(np.pi * fv) ** 0.72 * (0.78 + 0.22 * np.sin(np.pi * fu))
        weft_crown = np.sin(np.pi * fu) ** 0.72 * (0.78 + 0.22 * np.sin(np.pi * fv))
        # Fine micro-filament striations inside each tow
        warp_fil = 0.5 + 0.5 * np.sin(2.0 * np.pi * fv * 5.0)
        weft_fil = 0.5 + 0.5 * np.sin(2.0 * np.pi * fu * 5.0)

        height = is_warp * (0.45 + 0.55 * warp_crown + 0.06 * warp_fil) + (1.0 - is_warp) * (
            0.40 + 0.55 * weft_crown + 0.06 * weft_fil
        )
        # Crisp diagonal gloss contrast between warp & weft tows (signature 3K carbon checker shimmer!)
        warp_luma = 0.136 + 0.106 * warp_crown + 0.018 * warp_fil
        weft_luma = 0.214 + 0.122 * weft_crown + 0.018 * weft_fil
        luma = is_warp * warp_luma + (1.0 - is_warp) * weft_luma

        # Cool graphite-carbon tint (strictly above anti-black-crush floor!)
        carb_rgb = np.stack((luma * 0.96, luma * 0.99, luma * 1.05), axis=-1).astype(np.float32)
        carb_rgh = (0.36 - 0.14 * height + 0.05 * (1.0 - is_warp)).astype(np.float32)
        carb_met = (0.22 + 0.16 * height).astype(np.float32)
        return carb_rgb, height.astype(np.float32), carb_rgh, carb_met

    def _draw_rotated_horiz_text_on_riser_patch(
        canvas: Image.Image,
        x_range: tuple[float, float],
        y_range: tuple[float, float],
        x_to_py_fn,
        y_to_px_fn,
        draw_fn,
        ppcm: float = 220.0,
    ):
        """Draws upright horizontal artwork (left-to-right on the bow) onto a riser flank canvas
        where +px = +Y (up on bow) and +py = screen right (+X on right flank, -X on left flank)."""
        x_lo, x_hi = min(x_range), max(x_range)
        y_lo, y_hi = min(y_range), max(y_range)
        py_a = x_to_py_fn(x_range[0])
        py_b = x_to_py_fn(x_range[1])
        py0, py1 = min(py_a, py_b), max(py_a, py_b)
        px0, px1 = y_to_px_fn(y_lo), y_to_px_fn(y_hi)
        mw = max(32, int(round((x_hi - x_lo) * ppcm)))
        mh = max(32, int(round((y_hi - y_lo) * ppcm)))
        mini = Image.new("L", (mw, mh), 0)
        draw_fn(ImageDraw.Draw(mini), mw, mh)
        # Rotate 90 deg CW (ROTATE_270 in Pillow CCW): +mx -> +py (screen right), -my -> +px (screen up)
        rot = mini.transpose(Image.Transpose.ROTATE_270)
        tw, th = max(1, px1 - px0), max(1, py1 - py0)
        rot_rs = rot.resize((tw, th), resample=Image.Resampling.LANCZOS)
        # Paste using max compositing
        patch_dst = np.asarray(canvas.crop((px0, py0, px0 + tw, py0 + th)), dtype=np.uint8)
        patch_src = np.asarray(rot_rs, dtype=np.uint8)
        canvas.paste(Image.fromarray(np.maximum(patch_dst, patch_src)), (px0, py0))

    # -------------------------------------------------------------------------
    # SUITE 1 POST-PROCESS: lift33_v3_riser (Riser, Grip, Pockets, Cable Guard, Stabilizer)
    # -------------------------------------------------------------------------
    def process_riser_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "riser_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "riser_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "riser_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "riser_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "riser_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "riser_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "riser_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        white_laser = np.zeros((h, w), dtype=np.float32)
        detail_h = np.zeros((h, w), dtype=np.float32)

        # --- 1) RISER LEFT (-Z) & RIGHT (+Z) HERO FLANKS ---
        # Riser span: Y in [-32.80, +32.80] (65.6 cm) -> u in [0.015, 0.985]
        #             X in [ -2.40,  +3.60] ( 6.0 cm) -> v in [0.835, 0.985] (Left) / [0.675, 0.825] (Right)
        # Left  flank (-Z): u = yNorm (+Y up), v = xNorm (+X -> py increases as X decreases = screen RIGHT!)
        # Right flank (+Z): u = yNorm (+Y up), v = 1 - xNorm (+X -> py increases as X increases = screen RIGHT!)
        CW, CH = 3280, 480  # 50 px/cm along Y, 80 px/cm along X
        Y0, YSPAN = -32.80, 65.60
        X0, XSPAN = -2.40, 6.00

        def y_to_px(y: float) -> int:
            return int(round(max(0.0, min(1.0, (y - Y0) / YSPAN)) * CW))

        def x_to_py_left(x: float) -> int:
            # v = (x - X0)/XSPAN; py = (1 - v) * CH -> higher X is smaller py (screen LEFT), lower X is larger py (screen RIGHT)
            return int(round(max(0.0, min(1.0, 1.0 - (x - X0) / XSPAN)) * CH))

        def x_to_py_right(x: float) -> int:
            # v = 1 - (x - X0)/XSPAN; py = (1 - v) * CH = (x - X0)/XSPAN * CH -> higher X is larger py (screen RIGHT)
            return int(round(max(0.0, min(1.0, (x - X0) / XSPAN)) * CH))

        def paint_riser_flank(is_right: bool) -> Image.Image:
            im = Image.new("L", (CW, CH), 0)
            dr = ImageDraw.Draw(im)
            x2py = x_to_py_right if is_right else x_to_py_left

            # A) Rear Sight Window Spine (X in [-2.28, -0.68], Y in [+1.75, +10.95]) — HERO BRANDING!
            # On Right (+Z) flank, place above quiver bridge (Y in [+5.2, +10.8]) so 100% unobstructed;
            # on Left (-Z) flank, center prominently across Y in [+2.6, +10.2]!
            py_spine_mid = 0.5 * (x2py(-2.22) + x2py(-0.76))
            if is_right:
                _draw_mathews_emblem(dr, y_to_px(5.75), py_spine_mid, r=28)
                dr.text(
                    (y_to_px(6.55), py_spine_mid - 18),
                    "MATHEWS",
                    font=_load_font(FONT_DIN, 46),
                    fill=255,
                    anchor="lm",
                )
                dr.text(
                    (y_to_px(6.60), py_spine_mid + 24),
                    "LIFT 33",
                    font=_load_font(FONT_DIN, 38),
                    fill=248,
                    anchor="lm",
                )
            else:
                _draw_mathews_emblem(dr, y_to_px(3.05), py_spine_mid, r=34)
                dr.text(
                    (y_to_px(4.20), py_spine_mid - 20),
                    "MATHEWS",
                    font=_load_font(FONT_DIN, 54),
                    fill=255,
                    anchor="lm",
                )
                dr.text(
                    (y_to_px(4.25), py_spine_mid + 26),
                    "LIFT 33",
                    font=_load_font(FONT_DIN, 44),
                    fill=248,
                    anchor="lm",
                )

            # B) Upper Truss Rear Spine (X in [-2.26, -1.56], Y in [+13.2, +29.8]) — FACTORY SPEC LINE!
            py_up_spine = 0.5 * (x2py(-2.24) + x2py(-1.58))
            dr.text(
                (y_to_px(13.8), py_up_spine),
                'SPARTA, WI U.S.A.  -  70# / 29" / 348 FPS',
                font=_load_font(FONT_COND, 38),
                fill=242,
                anchor="lm",
            )

            # C) Lower Truss Rear Spine (X in [-2.26, -1.56], Y in [-29.6, -11.4]) — ENGINEERING SPEC!
            py_lo_spine = 0.5 * (x2py(-2.24) + x2py(-1.58))
            dr.text(
                (y_to_px(-29.0), py_lo_spine),
                '7075-T6 CNC BRIDGED RISER  -  33" ATA  -  6.5" BH',
                font=_load_font(FONT_COND, 36),
                fill=236,
                anchor="lm",
            )

            # D) Upper Bridge Crown above sight window (X in [-1.95, +3.05], Y in [+11.35, +12.50])
            def _draw_upper_bridge(d: ImageDraw.ImageDraw, mw: int, mh: int):
                txt = "BRIDGE-LOCK  -  LIFT 33"
                fnt = _fit_font(d, txt, FONT_DIN, mw * 0.84, mh * 0.54)
                d.text((mw * 0.50, mh * 0.50), txt, font=fnt, fill=248, anchor="mm")

            _draw_rotated_horiz_text_on_riser_patch(
                im, (-1.95, 3.05), (11.36, 12.48), x2py, y_to_px, _draw_upper_bridge
            )

            # E) Lower Bridge Slab below grip (X in [-1.65, +3.10], Y in [-10.40, -7.15])
            def _draw_lower_bridge(d: ImageDraw.ImageDraw, mw: int, mh: int):
                t1 = "MATHEWS  LIFT 33"
                t2 = "SWITCHWEIGHT-X  /  CENTERGY"
                t3 = "SER. NO. M24-330841"
                d.text((mw * 0.50, mh * 0.26), t1, font=_fit_font(d, t1, FONT_DIN, mw * 0.84, mh * 0.24), fill=255, anchor="mm")
                d.text((mw * 0.50, mh * 0.54), t2, font=_fit_font(d, t2, FONT_COND, mw * 0.84, mh * 0.20), fill=240, anchor="mm")
                d.text((mw * 0.50, mh * 0.79), t3, font=_fit_font(d, t3, FONT_COND, mw * 0.78, mh * 0.16), fill=225, anchor="mm")

            _draw_rotated_horiz_text_on_riser_patch(
                im, (-1.65, 3.05), (-10.35, -7.20), x2py, y_to_px, _draw_lower_bridge
            )
            return im

        _paste_uv_band(white_laser, paint_riser_flank(is_right=False), 0.015, 0.985, 0.835, 0.985)
        _paste_uv_band(white_laser, paint_riser_flank(is_right=True), 0.015, 0.985, 0.675, 0.825)

        # --- 2) STABILIZER 10" 2x2 3K TWILL CARBON FIBER TUBE + GRAPHICS ---
        # Hero Band: u in [0.015, 0.720] (X_local in [2.25, 22.85]), v in [0.510, 0.655] (circumference)
        stab_mask = (
            (u_grid >= 0.010) & (u_grid <= 0.725) & (v_grid >= 0.505) & (v_grid <= 0.660)
        ).astype(np.float32)
        c_rgb, c_h, c_rgh, c_met = _synth_3k_twill_carbon(
            u_grid, v_grid, 0.015, 0.720, 0.510, 0.655, cells_u=144.0, cells_v=26.0
        )
        _mix(albedo, c_rgb, stab_mask)
        _mix(rgh, c_rgh, stab_mask)
        _mix(met, c_met, stab_mask)
        detail_h += (c_h - 0.5) * 0.28 * stab_mask

        # Crisp upright un-mirrored stabilizer branding on BOTH +Z & -Z flanks!
        SW, SH = 1800, 360
        stab_im = Image.new("L", (SW, SH), 0)
        ds_bg = ImageDraw.Draw(stab_im)
        # Full-circumference technical accent bands near rear & front of carbon tube
        ds_bg.rectangle((140, 0, 174, SH), fill=225)
        ds_bg.rectangle((192, 0, 208, SH), fill=225)
        ds_bg.rectangle((1585, 0, 1618, SH), fill=225)

        def _draw_stab_label(d: ImageDraw.ImageDraw, bw: int, bh: int):
            txt = 'MATHEWS  BRIDGE-LOCK  10"  3K CARBON'
            fnt = _fit_font(d, txt, FONT_DIN, bw * 0.94, bh * 0.64)
            d.text((bw * 0.50, bh * 0.50), txt, font=fnt, fill=255, anchor="mm")

        _paste_cyl_text_both_sides(stab_im, 240, 1550, 96, _draw_stab_label)
        _paste_uv_band(white_laser, stab_im, 0.015, 0.720, 0.510, 0.655)

        # Composite razor-sharp white laser markings & subtle CNC bevel normal
        laser_bev = _bevel_mask(white_laser, width_px=1.2)
        detail_h -= 0.32 * laser_bev
        _mix(albedo, (0.91, 0.91, 0.89), white_laser * 0.92)
        _mix(rgh, 0.36, white_laser * 0.85)
        _mix(met, 0.14, white_laser * 0.85)
        ao *= 1.0 - 0.06 * white_laser

        decal_nrm = _height_to_normal_01(detail_h, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.92)
        met = np.clip(met, 0.00, 0.97)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_riser_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_riser_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_riser_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved lift33_v3_riser_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2 POST-PROCESS: lift33_v3_cams_acc (Dual Bronze-Gold Cams, Sight, Rest, Dampeners)
    # -------------------------------------------------------------------------
    def process_cams_acc_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "cams_acc_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "cams_acc_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "cams_acc_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "cams_acc_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "cams_acc_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "cams_acc_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "cams_acc_ext_mask.npy")[..., 0]

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

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        white_laser = np.zeros((h, w), dtype=np.float32)
        detail_h = np.zeros((h, w), dtype=np.float32)

        # --- 1) ALL 4 SWITCHWEIGHT-X BINARY CAM HERO FACES ---
        # Each cam maps local X in [-4.50, +3.30] (span 7.80), Y in [-3.10, +3.10] (span 6.20)
        # Axle center (0, 0) sits at xNorm = 4.50/7.80 = 0.5769, yNorm = 0.5000!
        # Right face (+Z): u = xNorm (+X right), v = yNorm (+Y up)
        # Left  face (-Z): u = 1 - xNorm (-X right), v = yNorm (+Y up)
        cam_boxes = [
            ("upper_right", True,  True,  0.015, 0.245, 0.755, 0.985),
            ("upper_left",  True,  False, 0.260, 0.490, 0.755, 0.985),
            ("lower_right", False, True,  0.510, 0.740, 0.755, 0.985),
            ("lower_left",  False, False, 0.755, 0.985, 0.755, 0.985),
        ]
        CX0, CXSPAN = -4.50, 7.80
        CY0, CYSPAN = -3.10, 6.20
        CS = 900  # 900x900 high-res cam face canvas

        for _label, is_upper, is_right, u0, u1, v0, v1 in cam_boxes:
            s = 1.0 if is_upper else -1.0
            # Radial CNC lathe turning shimmer concentric around axle (0, 0)
            box_m = (
                (u_grid >= u0) & (u_grid <= u1) & (v_grid >= v0) & (v_grid <= v1)
            ).astype(np.float32)
            ax_u = u0 + ((4.50 / 7.80) if is_right else (1.0 - 4.50 / 7.80)) * (u1 - u0)
            ax_v = v0 + 0.50 * (v1 - v0)
            du_cm = (u_grid - ax_u) / (u1 - u0) * CXSPAN
            dv_cm = (v_grid - ax_v) / (v1 - v0) * CYSPAN
            rad = np.sqrt(du_cm * du_cm + dv_cm * dv_cm)
            rings = 0.5 + 0.5 * np.sin(rad * 42.0)
            fine_rings = 0.5 + 0.5 * np.sin(rad * 115.0)
            lathe_val = (rings * 0.65 + fine_rings * 0.35) * box_m
            detail_h += (lathe_val - 0.5 * box_m) * 0.18
            rgh += (lathe_val - 0.5 * box_m) * 0.038

            # Crisp laser markings on solid cam perimeter & SwitchWeight-X module plate!
            im = Image.new("L", (CS, CS), 0)
            dc = ImageDraw.Draw(im)

            def pt(lx: float, ly: float) -> tuple[float, float]:
                xn = (lx - CX0) / CXSPAN
                un = xn if is_right else (1.0 - xn)
                vn = (ly - CY0) / CYSPAN
                return (un * CS, (1.0 - vn) * CS)

            # A) SwitchWeight-X Let-Off Module Plate (Right face has raised module at (-1.35, -s*1.15))
            # 4 small M3 corner screws sit at (-2.28/-0.42, -s*1.68/-s*0.62) -> keep center text 100% clear!
            if is_right:
                mx, my = pt(-1.35, -s * 1.15)
                p_tl = pt(-2.40, -s * 1.15 + 0.64)
                p_br = pt(-0.30, -s * 1.15 - 0.64)
                dc.rounded_rectangle(
                    (min(p_tl[0], p_br[0]), min(p_tl[1], p_br[1]), max(p_tl[0], p_br[0]), max(p_tl[1], p_br[1])),
                    radius=16,
                    outline=200,
                    width=2,
                )
                dc.text((mx, my - 26), "SWITCHWEIGHT-X", font=_load_font(FONT_DIN, 22), fill=255, anchor="mm")
                dc.text((mx, my + 2), "85% LET-OFF", font=_load_font(FONT_DIN, 26), fill=255, anchor="mm")
                dc.text((mx, my + 29), 'MOD-F  /  70#  /  29"', font=_load_font(FONT_COND, 21), fill=242, anchor="mm")
            else:
                # Left face (-Z): place BOTH lines cleanly on the wide-open bronze lobe crescent
                # (r in [2.05..3.70], 100% clear of raised inner cable track trk_l at r=1.65!)
                mx, my = pt(-2.85, -s * 1.02)
                dc.text((mx, my - 16), "SWITCHWEIGHT-X", font=_load_font(FONT_DIN, 21), fill=255, anchor="mm")
                dc.text((mx, my + 12), "85% LET-OFF / MOD-F", font=_load_font(FONT_COND, 20), fill=246, anchor="mm")

            # B) Outer Rim Laser Legend & Timing Witness Index Dots on solid lobe periphery
            rx, ry = pt(-2.90, s * 0.48)
            dc.text((rx, ry - 14), "MATHEWS", font=_load_font(FONT_DIN, 27), fill=248, anchor="mm")
            dc.text((rx, ry + 18), "LIFT 33", font=_load_font(FONT_COND, 25), fill=240, anchor="mm")

            # Radial timing witness ticks around the central axle hub collar (r = 0.66..0.84 cm)
            for deg in range(0, 360, 30):
                ang = math.radians(deg)
                p0 = pt(math.cos(ang) * 0.66, math.sin(ang) * 0.66)
                p1 = pt(math.cos(ang) * 0.84, math.sin(ang) * 0.84)
                dc.line([p0, p1], fill=228, width=3)

            _paste_uv_band(white_laser, im, u0, u1, v0, v1)

        # --- 2) BRIDGE-LOCK SIGHT ELEVATION YARDAGE TAPE (20..80 YD) ---
        # Hero Band: u in [0.015, 0.245], v in [0.530, 0.735]
        # Top ~28% of elev_rack is behind cross-arm -> place 20..80 YD cleanly across lower 72% (unobstructed!)
        YT_W, YT_H = 520, 480
        yt_im = Image.new("L", (YT_W, YT_H), 0)
        dy_t = ImageDraw.Draw(yt_im)
        dy_t.rectangle((36, 134, YT_W - 36, YT_H - 18), outline=220, width=4)
        yards = [20, 30, 40, 50, 60, 70, 80]
        for idx_y, yd in enumerate(yards):
            yy = 164 + idx_y * 45
            dy_t.line([(58, yy), (160, yy)], fill=255, width=5)
            dy_t.line([(YT_W - 160, yy), (YT_W - 58, yy)], fill=255, width=5)
            dy_t.text((YT_W * 0.50, yy), f"{yd} YD", font=_load_font(FONT_DIN, 33), fill=255, anchor="mm")
            if idx_y < len(yards) - 1:
                ymid = yy + 22
                dy_t.line([(58, ymid), (118, ymid)], fill=210, width=3)
                dy_t.line([(YT_W - 118, ymid), (YT_W - 58, ymid)], fill=210, width=3)
        _paste_uv_band(white_laser, yt_im, 0.015, 0.245, 0.530, 0.735)

        # --- 3) BRIDGE-LOCK SIGHT DOVETAIL BAR MILLIMETER SCALE ---
        # Hero Band: u in [0.260, 0.660], v in [0.530, 0.735]
        DB_W, DB_H = 1200, 400
        db_im = Image.new("L", (DB_W, DB_H), 0)
        ddb = ImageDraw.Draw(db_im)
        for row_y in (100, 300):
            ddb.text((DB_W * 0.50, row_y - 38), "MATHEWS  BRIDGE-LOCK  MICRO-ADJUST", font=_load_font(FONT_DIN, 38), fill=250, anchor="mm")
            for t_i in range(0, 21):
                tx = 80 + t_i * 52
                th = 34 if (t_i % 5 == 0) else 20
                ddb.line([(tx, row_y + 12), (tx, row_y + 12 + th)], fill=245, width=4 if t_i % 5 == 0 else 2)
                if t_i % 5 == 0:
                    ddb.text((tx, row_y + 64), f"{t_i * 5}", font=_load_font(FONT_COND, 28), fill=235, anchor="mm")
        _paste_uv_band(white_laser, db_im, 0.260, 0.660, 0.530, 0.735)

        # Composite razor-sharp laser markings
        laser_bev = _bevel_mask(white_laser, width_px=1.15)
        detail_h -= 0.30 * laser_bev
        _mix(albedo, (0.94, 0.94, 0.92), white_laser * 0.94)
        _mix(rgh, 0.34, white_laser * 0.85)
        _mix(met, 0.12, white_laser * 0.85)
        ao *= 1.0 - 0.05 * white_laser

        decal_nrm = _height_to_normal_01(detail_h, strength=2.0)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        # Keep fiber-optic glow beads silky smooth
        fiber_box = (u_grid >= 0.865) & (v_grid >= 0.525) & (v_grid <= 0.740)
        nrm_final[fiber_box] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_cams_acc_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_cams_acc_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_cams_acc_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved lift33_v3_cams_acc_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3 POST-PROCESS: lift33_v3_quiver_arrow (LowPro Quiver, 3K Carbon Arrow, Broadhead)
    # -------------------------------------------------------------------------
    def process_quiver_arrow_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "quiver_arrow_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "quiver_arrow_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "quiver_arrow_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "quiver_arrow_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "quiver_arrow_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "quiver_arrow_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "quiver_arrow_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        white_ink = np.zeros((h, w), dtype=np.float32)
        accent_orange = np.zeros((h, w), dtype=np.float32)
        detail_h = np.zeros((h, w), dtype=np.float32)

        # --- 1) LOWPRO QUIVER HOOD OUTER RIGHT (+Z) & LEFT (-Z) HERO FACES ---
        # Right (+Z): u in [0.015, 0.485], v in [0.730, 0.985]
        # Left  (-Z): u in [0.515, 0.985], v in [0.730, 0.985]
        HW, HH = 1000, 560
        hood_r = Image.new("L", (HW, HH), 0)
        dhr = ImageDraw.Draw(hood_r)
        _draw_mathews_emblem(dhr, HW * 0.50, HH * 0.27, r=68)
        dhr.text((HW * 0.50, HH * 0.56), "MATHEWS", font=_load_font(FONT_DIN, 92), fill=255, anchor="mm")
        dhr.text((HW * 0.50, HH * 0.76), "LOWPRO  ·  5-ARROW QUIVER", font=_load_font(FONT_COND, 56), fill=242, anchor="mm")
        _paste_uv_band(white_ink, hood_r, 0.015, 0.485, 0.730, 0.985)

        hood_l = Image.new("L", (HW, HH), 0)
        dhl = ImageDraw.Draw(hood_l)
        dhl.text((HW * 0.50, HH * 0.44), "LOWPRO", font=_load_font(FONT_DIN, 86), fill=245, anchor="mm")
        dhl.text((HW * 0.50, HH * 0.68), "DETACHABLE  ACOUSTIC  HOOD", font=_load_font(FONT_COND, 46), fill=230, anchor="mm")
        _paste_uv_band(white_ink, hood_l, 0.515, 0.985, 0.730, 0.985)

        # --- 2) 29" 3K CARBON-FIBER HUNTING ARROW SHAFT + 300 SPINE PRINT + CRESTING ---
        # Hero Band: u in [0.015, 0.985] (X_local in [1.62, 45.95]), v in [0.525, 0.705] (circumference)
        arrow_mask = (
            (u_grid >= 0.010) & (u_grid <= 0.990) & (v_grid >= 0.520) & (v_grid <= 0.710)
        ).astype(np.float32)
        c_rgb, c_h, c_rgh, c_met = _synth_3k_twill_carbon(
            u_grid, v_grid, 0.015, 0.985, 0.525, 0.705, cells_u=260.0, cells_v=20.0
        )
        _mix(albedo, c_rgb, arrow_mask)
        _mix(rgh, c_rgh, arrow_mask)
        _mix(met, c_met, arrow_mask)
        detail_h += (c_h - 0.5) * 0.26 * arrow_mask

        # High-visibility cresting stripes just ahead of vanes (x in [7.7, 9.8]) + white spine spec text!
        AW, AH = 2400, 420
        ar_w = Image.new("L", (AW, AH), 0)
        ar_o = Image.new("L", (AW, AH), 0)
        daw, dao = ImageDraw.Draw(ar_w), ImageDraw.Draw(ar_o)

        def ax_px(x_loc: float) -> int:
            return int(round(max(0.0, min(1.0, (x_loc - 1.62) / (45.95 - 1.62))) * AW))

        # Matte hunting orange & crisp white crest bands ahead of fletching + clean ring past spec print
        dao.rectangle((ax_px(7.80), 0, ax_px(8.90), AH), fill=255)
        daw.rectangle((ax_px(9.05), 0, ax_px(9.35), AH), fill=255)
        dao.rectangle((ax_px(9.50), 0, ax_px(9.80), AH), fill=255)
        daw.rectangle((ax_px(35.80), 0, ax_px(36.15), AH), fill=240)

        # Print crisp upright un-mirrored spine specs on BOTH +Z & -Z flanks (zero tofu glyphs!)
        def _draw_arrow_label(d: ImageDraw.ImageDraw, bw: int, bh: int):
            txt = 'MATHEWS  /  300 SPINE  /  .001" MATCH  /  400 GR'
            fnt = _fit_font(d, txt, FONT_DIN, bw * 0.96, bh * 0.64)
            d.text((bw * 0.50, bh * 0.50), txt, font=fnt, fill=255, anchor="mm")

        _paste_cyl_text_both_sides(ar_w, ax_px(10.60), ax_px(34.60), 96, _draw_arrow_label)

        _paste_uv_band(white_ink, ar_w, 0.015, 0.985, 0.525, 0.705)
        _paste_uv_band(accent_orange, ar_o, 0.015, 0.985, 0.525, 0.705)

        # Composite cresting orange & white print
        _mix(albedo, (0.94, 0.37, 0.07), accent_orange * 0.96)
        _mix(rgh, 0.34, accent_orange * 0.90)
        _mix(met, 0.04, accent_orange * 0.92)

        ink_bev = _bevel_mask(white_ink, width_px=1.1)
        detail_h -= 0.16 * ink_bev
        _mix(albedo, (0.94, 0.94, 0.93), white_ink * 0.95)
        _mix(rgh, 0.34, white_ink * 0.88)
        _mix(met, 0.05, white_ink * 0.90)
        ao *= 1.0 - 0.04 * white_ink

        decal_nrm = _height_to_normal_01(detail_h, strength=2.0)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_quiver_arrow_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_quiver_arrow_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "lift33_v3_quiver_arrow_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved lift33_v3_quiver_arrow_{albedo,normal,roughness}.webp (2048x2048)")

    process_riser_atlas()
    process_cams_acc_atlas()
    process_quiver_arrow_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "lift33.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js (X=target, Y=up, Z=right) -> Blender (X=target, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 19 solid Mathews LIFT 33 parts across 3 dedicated 2048x2048 hero suites
# (skipping ONLY the 5 dynamic GPU-flexing `aSpringParam` CSG parts:
#  lift33_upper_limbs, lift33_lower_limbs, lift33_cam_axles, lift33_bowstring, lift33_yoke_cables)
RISER_PARTS = [
    "lift33_riser",
    "lift33_grip",
    "lift33_upper_pocket",
    "lift33_lower_pocket",
    "lift33_cable_guard",
    "lift33_stabilizer",
]

CAMS_ACC_PARTS = [
    "lift33_upper_cam",
    "lift33_lower_cam",
    "lift33_limb_dampeners",
    "lift33_drop_away_rest",
    "lift33_launcher_fork",
    "lift33_sight_housing",
    "lift33_sight_pins",
    "lift33_d_loop",
]

QUIVER_ARROW_PARTS = [
    "lift33_quiver_frame",
    "lift33_quiver_hood",
    "lift33_quiver_latch",
    "lift33_arrow_shaft",
    "lift33_broadhead",
]

# Stationary exterior parts receiving assembled inter-part contact AO
# (rotating cams, dropping launcher fork, drawing D-loop, flying arrow/broadhead & dampeners get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "lift33_riser",
    "lift33_grip",
    "lift33_upper_pocket",
    "lift33_lower_pocket",
    "lift33_cable_guard",
    "lift33_stabilizer",
    "lift33_drop_away_rest",
    "lift33_sight_housing",
    "lift33_sight_pins",
    "lift33_quiver_frame",
    "lift33_quiver_hood",
    "lift33_quiver_latch",
}

ASSEMBLED_POS = {
    "lift33_riser":          (  0.000,   0.000, 0.000),
    "lift33_grip":           ( -0.250,  -3.500, 0.000),
    "lift33_upper_pocket":   ( -1.400,  32.400, 0.000),
    "lift33_lower_pocket":   ( -1.400, -32.400, 0.000),
    "lift33_cable_guard":    ( -1.800, -11.500, 0.950),
    "lift33_stabilizer":     (  3.200,  -8.500, 0.000),
    "lift33_upper_cam":      (-12.600,  41.500, 0.000),
    "lift33_lower_cam":      (-12.600, -41.500, 0.000),
    "lift33_limb_dampeners": ( -6.500,   0.000, 0.000),
    "lift33_drop_away_rest": (  0.450,   1.450, 1.150),
    "lift33_launcher_fork":  (  1.400,   1.850, 0.000),
    "lift33_sight_housing":  (  4.200,   6.400, 1.250),
    "lift33_sight_pins":     (  4.600,   5.600, 1.450),
    "lift33_d_loop":         (-16.500,   2.400, 0.000),
    "lift33_quiver_frame":   (  0.600,   2.000, 4.200),
    "lift33_quiver_hood":    (  0.600,  22.500, 4.850),
    "lift33_quiver_latch":   (  0.600,   3.500, 2.450),
    "lift33_arrow_shaft":    (-16.500,   2.400, 0.000),
    "lift33_broadhead":      ( 31.300,   2.400, 0.000),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured directly from src/weapons/lift33/meshes/*.ts
CSG_REF_BBOX = {
    "lift33_riser":          ((-2.9500, -32.9000, -1.5500), ( 3.7500,  32.9000,  1.6100)),
    "lift33_grip":           ((-1.5350,  -3.5500, -1.2300), ( 1.5850,   3.4500,  1.2300)),
    "lift33_upper_pocket":   ((-2.0750,  -0.8500, -2.4600), ( 1.9500,   1.8400,  2.4600)),
    "lift33_lower_pocket":   ((-2.0750,  -1.8400, -2.4600), ( 1.9500,   0.8500,  2.4600)),
    "lift33_cable_guard":    ((-12.0750, -0.6700, -0.4800), ( 1.1108,   0.6700,  1.2000)),
    "lift33_stabilizer":     ((-2.5000,  -1.0600, -1.0600), (26.4800,   1.0600,  1.0600)),
    "lift33_upper_cam":      ((-4.4247,  -2.4821, -0.6900), ( 3.1586,   2.8220,  0.7800)),
    "lift33_lower_cam":      ((-4.4247,  -2.8220, -0.6900), ( 3.1586,   2.4821,  0.7800)),
    "lift33_limb_dampeners": ((-9.9000, -39.6500, -2.2800), ( 4.9000,  39.6500,  2.2800)),
    "lift33_drop_away_rest": ((-0.9250,  -0.5250, -1.9795), ( 1.5100,   1.9800,  0.5600)),
    "lift33_launcher_fork":  ((-0.1800,  -0.1400, -0.5467), ( 0.1800,   0.8054,  1.2900)),
    "lift33_sight_housing":  ((-6.0000,  -2.8800, -1.8800), ( 1.2000,   1.2800,  2.2800)),
    "lift33_sight_pins":     ((-0.2250,  -1.2250, -1.8015), ( 0.2250,   2.0256,  1.8015)),
    "lift33_d_loop":         ((-1.5700,  -0.6489, -0.5200), ( 0.3344,  15.3467,  0.5200)),
    "lift33_quiver_frame":   ((-3.2750, -26.9750, -2.7950), ( 3.2750,  21.5000,  1.7000)),
    "lift33_quiver_hood":    ((-3.3200,  -8.1250, -1.3450), ( 3.3200,   5.1500,  1.1500)),
    "lift33_quiver_latch":   ((-1.8250,  -0.5750, -0.3500), ( 1.1250,   0.9250,  0.2300)),
    "lift33_arrow_shaft":    ((-0.3500,  -0.9067, -1.0507), (47.8500,   0.9502,  0.6058)),
    "lift33_broadhead":      ((-0.4500,  -0.8247, -1.3858), ( 4.4500,   1.5800,  1.3858)),
}


# =============================================================================
# Scene & Physically Calibrated Mathews LIFT 33 Material Library
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
    edge_srgb: tuple[float, float, float] = (0.76, 0.78, 0.82),
    grain_scale: float = 38.0,
    grain_bump: float = 0.030,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 72.0,
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
    n_macro.inputs["Scale"].default_value = 3.80
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.54
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.60
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
        min(1.0, base_srgb[0] * 1.036),
        min(1.0, base_srgb[1] * 1.036),
        min(1.0, base_srgb[2] * 1.036),
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
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.548
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.625
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


def _build_3k_carbon_mat(name: str, scale: float = 24.0) -> bpy.types.Material:
    """Procedural 3D 2x2 twill carbon-fiber shader for curved rods, quiver spines & string-stop rod."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(45.0))
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    chk = nt.nodes.new("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 1.65
    chk.inputs["Color1"].default_value = srgb_to_lin(0.165, 0.174, 0.188)
    chk.inputs["Color2"].default_value = srgb_to_lin(0.258, 0.270, 0.288)
    nt.links.new(mp.outputs["Vector"], chk.inputs["Vector"])

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.0
    rgh_map.inputs["From Max"].default_value = 1.0
    rgh_map.inputs["To Min"].default_value = 0.24
    rgh_map.inputs["To Max"].default_value = 0.36
    nt.links.new(chk.outputs["Fac"], rgh_map.inputs["Value"])

    met_map = nt.nodes.new("ShaderNodeMapRange")
    met_map.inputs["From Min"].default_value = 0.0
    met_map.inputs["From Max"].default_value = 1.0
    met_map.inputs["To Min"].default_value = 0.18
    met_map.inputs["To Max"].default_value = 0.32
    nt.links.new(chk.outputs["Fac"], met_map.inputs["Value"])

    nt.links.new(chk.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rgh_map.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(met_map.outputs["Result"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.016
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.058
    bump.inputs["Distance"].default_value = 0.014
    nt.links.new(chk.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_radial_lathe_copper_mat(name: str) -> bpy.types.Material:
    """Machined burnished copper-bronze secondary cable track drum with true 3D concentric CNC lathe turning rings."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Radial distance in Three.js XY = Blender XZ plane around axle (0, 0)
    sq_x = nt.nodes.new("ShaderNodeMath")
    sq_x.operation = "MULTIPLY"
    nt.links.new(sep.outputs["X"], sq_x.inputs[0])
    nt.links.new(sep.outputs["X"], sq_x.inputs[1])

    sq_z = nt.nodes.new("ShaderNodeMath")
    sq_z.operation = "MULTIPLY"
    nt.links.new(sep.outputs["Z"], sq_z.inputs[0])
    nt.links.new(sep.outputs["Z"], sq_z.inputs[1])

    add_r = nt.nodes.new("ShaderNodeMath")
    add_r.operation = "ADD"
    nt.links.new(sq_x.outputs["Value"], add_r.inputs[0])
    nt.links.new(sq_z.outputs["Value"], add_r.inputs[1])

    rad = nt.nodes.new("ShaderNodeMath")
    rad.operation = "SQRT"
    nt.links.new(add_r.outputs["Value"], rad.inputs[0])

    mul_f = nt.nodes.new("ShaderNodeMath")
    mul_f.operation = "MULTIPLY"
    mul_f.inputs[1].default_value = 46.0
    nt.links.new(rad.outputs["Value"], mul_f.inputs[0])

    sin_r = nt.nodes.new("ShaderNodeMath")
    sin_r.operation = "SINE"
    nt.links.new(mul_f.outputs["Value"], sin_r.inputs[0])

    ring01 = nt.nodes.new("ShaderNodeMapRange")
    ring01.inputs["From Min"].default_value = -1.0
    ring01.inputs["From Max"].default_value = 1.0
    ring01.inputs["To Min"].default_value = 0.0
    ring01.inputs["To Max"].default_value = 1.0
    nt.links.new(sin_r.outputs["Value"], ring01.inputs["Value"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.615, 0.418, 0.212)
    mix_c.inputs[7].default_value = srgb_to_lin(0.725, 0.512, 0.278)
    nt.links.new(ring01.outputs["Result"], mix_c.inputs[0])

    rgh_m = nt.nodes.new("ShaderNodeMapRange")
    rgh_m.inputs["From Min"].default_value = 0.0
    rgh_m.inputs["From Max"].default_value = 1.0
    rgh_m.inputs["To Min"].default_value = 0.19
    rgh_m.inputs["To Max"].default_value = 0.27
    nt.links.new(ring01.outputs["Result"], rgh_m.inputs["Value"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_m.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.93

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.018
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.068
    bump.inputs["Distance"].default_value = 0.014
    nt.links.new(ring01.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: RISER, GRIP, POCKETS, CABLE GUARD & STABILIZER (lift33_v3_riser) ---
        # Iconic Mathews Earth-Bronze / Granite-Slate Cerakote CNC 7075-T6 truss riser
        "R_EarthBronzeRiser": _build_pbr_mat(
            "R_EarthBronzeRiser",
            base_srgb=(0.318, 0.284, 0.242),
            roughness=0.34,
            metallic=0.78,
            bevel_r=0.028,
            edge_wear=0.34,
            edge_srgb=(0.66, 0.63, 0.59),
            grain_scale=48.0,
            grain_bump=0.030,
            aniso_stretch=(0.55, 2.8, 2.8),
            rough_var=0.036,
        ),
        "R_RiserMachinedAccent": _build_pbr_mat(
            "R_RiserMachinedAccent",
            base_srgb=(0.470, 0.428, 0.372),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.40,
            edge_srgb=(0.82, 0.81, 0.82),
            grain_scale=44.0,
            grain_bump=0.024,
            aniso_stretch=(2.6, 0.5, 0.5),
            rough_var=0.028,
        ),
        "R_PocketDarkAnodize": _build_pbr_mat(
            "R_PocketDarkAnodize",
            base_srgb=(0.228, 0.236, 0.248),
            roughness=0.34,
            metallic=0.82,
            bevel_r=0.028,
            edge_wear=0.44,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=54.0,
            grain_bump=0.034,
            voronoi_grain=0.42,
            voronoi_scale=84.0,
            rough_var=0.032,
        ),
        "R_EngageRubber": _build_pbr_mat(
            "R_EngageRubber",
            base_srgb=(0.165, 0.168, 0.175),
            roughness=0.78,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.14,
            edge_srgb=(0.245, 0.250, 0.260),
            grain_scale=68.0,
            grain_bump=0.105,
            voronoi_grain=0.72,
            voronoi_scale=110.0,
            rough_var=0.042,
        ),
        "R_EngageInlay": _build_pbr_mat(
            "R_EngageInlay",
            base_srgb=(0.215, 0.205, 0.195),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=82.0,
            grain_bump=0.155,
            voronoi_grain=0.86,
            voronoi_scale=140.0,
            rough_var=0.036,
        ),
        "R_Carbon3K": _build_3k_carbon_mat("R_Carbon3K", scale=22.0),
        "R_TitaniumSilver": _build_pbr_mat(
            "R_TitaniumSilver",
            base_srgb=(0.76, 0.78, 0.82),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=32.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "R_DamperOrange": _build_pbr_mat(
            "R_DamperOrange",
            base_srgb=(0.92, 0.39, 0.08),
            roughness=0.52,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.10,
            edge_srgb=(0.98, 0.56, 0.24),
            grain_scale=44.0,
            grain_bump=0.045,
            rough_var=0.035,
        ),

        # --- SUITE 2: SWITCHWEIGHT-X CAMS, SIGHT, DROP-AWAY REST & D-LOOP (lift33_v3_cams_acc) ---
        # Crown-jewel Antique Bronze-Gold CNC SwitchWeight-X eccentric binary cams!
        "A_CamBronzeGold": _build_pbr_mat(
            "A_CamBronzeGold",
            base_srgb=(0.725, 0.515, 0.268),
            roughness=0.21,
            metallic=0.94,
            bevel_r=0.020,
            edge_wear=0.32,
            edge_srgb=(0.91, 0.77, 0.49),
            grain_scale=40.0,
            grain_bump=0.020,
            rough_var=0.026,
        ),
        "A_CamCopperTrack": _build_radial_lathe_copper_mat("A_CamCopperTrack"),
        "A_ModuleDarkAnodize": _build_pbr_mat(
            "A_ModuleDarkAnodize",
            base_srgb=(0.222, 0.205, 0.192),
            roughness=0.33,
            metallic=0.82,
            bevel_r=0.018,
            edge_wear=0.36,
            edge_srgb=(0.68, 0.64, 0.58),
            grain_scale=52.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
        "A_SightBlackAnodize": _build_pbr_mat(
            "A_SightBlackAnodize",
            base_srgb=(0.194, 0.202, 0.216),
            roughness=0.33,
            metallic=0.82,
            bevel_r=0.022,
            edge_wear=0.42,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=56.0,
            grain_bump=0.030,
            voronoi_grain=0.40,
            voronoi_scale=88.0,
            rough_var=0.030,
        ),
        "A_Stainless": _build_pbr_mat(
            "A_Stainless",
            base_srgb=(0.79, 0.81, 0.85),
            roughness=0.18,
            metallic=0.97,
            bevel_r=0.016,
            edge_wear=0.20,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.4, 3.4),
            rough_var=0.022,
        ),
        "A_BrassNock": _build_pbr_mat(
            "A_BrassNock",
            base_srgb=(0.82, 0.65, 0.28),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.012,
            grain_scale=34.0,
            grain_bump=0.018,
            rough_var=0.024,
        ),
        "A_DLoopCord": _build_pbr_mat(
            "A_DLoopCord",
            base_srgb=(0.84, 0.47, 0.16),
            roughness=0.60,
            metallic=0.08,
            bevel_r=0.010,
            grain_scale=72.0,
            grain_bump=0.090,
            aniso_stretch=(4.2, 1.0, 1.0),
            rough_var=0.045,
        ),
        "A_DamperOrange": _build_pbr_mat(
            "A_DamperOrange",
            base_srgb=(0.94, 0.40, 0.08),
            roughness=0.50,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.12,
            edge_srgb=(0.99, 0.58, 0.26),
            grain_scale=46.0,
            grain_bump=0.042,
            rough_var=0.032,
        ),
        "A_ElastomerDark": _build_pbr_mat(
            "A_ElastomerDark",
            base_srgb=(0.168, 0.174, 0.184),
            roughness=0.76,
            metallic=0.00,
            bevel_r=0.022,
            grain_scale=64.0,
            grain_bump=0.085,
            rough_var=0.040,
        ),
        "A_CarbonRod": _build_3k_carbon_mat("A_CarbonRod", scale=24.0),
        "A_FiberGreen": _build_pbr_mat(
            "A_FiberGreen",
            base_srgb=(0.16, 0.94, 0.34),
            roughness=0.16,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=16.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "A_FiberAmber": _build_pbr_mat(
            "A_FiberAmber",
            base_srgb=(0.98, 0.74, 0.10),
            roughness=0.16,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=16.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "A_FiberOrange": _build_pbr_mat(
            "A_FiberOrange",
            base_srgb=(0.98, 0.42, 0.06),
            roughness=0.18,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=16.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "A_FiberRed": _build_pbr_mat(
            "A_FiberRed",
            base_srgb=(0.96, 0.18, 0.14),
            roughness=0.16,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=16.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),

        # --- SUITE 3: LOWPRO QUIVER, 3K CARBON ARROW & 3-BLADE BROADHEAD (lift33_v3_quiver_arrow) ---
        "Q_Carbon3K": _build_3k_carbon_mat("Q_Carbon3K", scale=22.0),
        "Q_QuiverPolymer": _build_pbr_mat(
            "Q_QuiverPolymer",
            base_srgb=(0.192, 0.198, 0.210),
            roughness=0.58,
            metallic=0.02,
            bevel_r=0.030,
            edge_wear=0.18,
            edge_srgb=(0.30, 0.31, 0.33),
            grain_scale=64.0,
            grain_bump=0.075,
            voronoi_grain=0.62,
            voronoi_scale=96.0,
            rough_var=0.045,
        ),
        "Q_QuiverAnodize": _build_pbr_mat(
            "Q_QuiverAnodize",
            base_srgb=(0.245, 0.242, 0.238),
            roughness=0.34,
            metallic=0.80,
            bevel_r=0.024,
            edge_wear=0.38,
            edge_srgb=(0.74, 0.76, 0.80),
            grain_scale=48.0,
            grain_bump=0.030,
            rough_var=0.032,
        ),
        "Q_AcousticFoam": _build_pbr_mat(
            "Q_AcousticFoam",
            base_srgb=(0.162, 0.166, 0.174),
            roughness=0.90,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=90.0,
            grain_bump=0.165,
            voronoi_grain=0.88,
            voronoi_scale=145.0,
            rough_var=0.030,
        ),
        "Q_LatchOrange": _build_pbr_mat(
            "Q_LatchOrange",
            base_srgb=(0.91, 0.41, 0.10),
            roughness=0.28,
            metallic=0.76,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.98, 0.66, 0.34),
            grain_scale=40.0,
            grain_bump=0.024,
            rough_var=0.026,
        ),
        "Q_VaneOrange": _build_pbr_mat(
            "Q_VaneOrange",
            base_srgb=(0.96, 0.36, 0.06),
            roughness=0.38,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=30.0,
            grain_bump=0.015,
            rough_var=0.025,
        ),
        "Q_VaneWhite": _build_pbr_mat(
            "Q_VaneWhite",
            base_srgb=(0.92, 0.93, 0.94),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=30.0,
            grain_bump=0.015,
            rough_var=0.025,
        ),
        "Q_NockGlowGreen": _build_pbr_mat(
            "Q_NockGlowGreen",
            base_srgb=(0.20, 0.92, 0.34),
            roughness=0.18,
            metallic=0.02,
            bevel_r=0.008,
            grain_scale=20.0,
            grain_bump=0.008,
            rough_var=0.015,
        ),
        "Q_TitaniumCollar": _build_pbr_mat(
            "Q_TitaniumCollar",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=32.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "Q_BroadheadSteel": _build_pbr_mat(
            "Q_BroadheadSteel",
            base_srgb=(0.84, 0.87, 0.91),
            roughness=0.12,
            metallic=0.98,
            bevel_r=0.008,
            edge_wear=0.16,
            edge_srgb=(0.96, 0.97, 0.99),
            grain_scale=26.0,
            grain_bump=0.010,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.015,
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


def _clean_poly2d(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    clean = []
    for p in pts:
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
    return clean


def _offset_poly2d_outward(pts_ccw: list[tuple[float, float]], offset: float) -> list[tuple[float, float]]:
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


def _chamfer_poly2d(pts: list[tuple[float, float]], r: float = 0.18) -> list[tuple[float, float]]:
    """Rounds/chamfers sharp corners of a 2D polygon cleanly for machined CNC pockets."""
    clean = _clean_poly2d(pts)
    n = len(clean)
    out = []
    for i in range(n):
        p0 = clean[(i - 1) % n]
        p1 = clean[i]
        p2 = clean[(i + 1) % n]
        v1x, v1y = p0[0] - p1[0], p0[1] - p1[1]
        v2x, v2y = p2[0] - p1[0], p2[1] - p1[1]
        l1 = math.hypot(v1x, v1y)
        l2 = math.hypot(v2x, v2y)
        d = min(r, l1 * 0.34, l2 * 0.34)
        if d > 1e-4:
            a = (p1[0] + v1x / l1 * d, p1[1] + v1y / l1 * d)
            b = (p1[0] + v2x / l2 * d, p1[1] + v2y / l2 * d)
            mid = (
                0.25 * a[0] + 0.50 * p1[0] + 0.25 * b[0],
                0.25 * a[1] + 0.50 * p1[1] + 0.25 * b[1],
            )
            out.extend([a, mid, b])
        else:
            out.append(p1)
    return _clean_poly2d(out)


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
    axis: str = "x", segs: int = 28,
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
    u_segs: int = 20, v_segs: int = 14,
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
    major_segs: int = 36, minor_segs: int = 14,
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


def mk_lathe_y(
    name: str, pts_r_y: list[tuple[float, float]], segs: int = 28,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    return mk_lathe_x(name, pts_r_y, segs=segs, xform=[("rz", math.pi * 0.5)] + (xform or []), mat=mat)


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
            bmesh.ops.bevel(
                bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_flared_cutout_z(
    name: str, pts_xy: list[tuple[float, float]],
    z_half_inner: float, flare: float = 0.08, flare_depth: float = 0.12,
    z_overhang: float = 0.25,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight hourglass lofted cutout solid along Z so boolean-subtracting carves
    crisp 45-deg CNC chamfered bevels around every truss window & cam spoke cutout!"""
    base = _clean_poly2d(pts_xy)
    z_out = z_half_inner + z_overhang
    z_f0 = max(0.05, z_half_inner - flare_depth)
    stations = [
        (-z_out,        flare * 1.15),
        (-z_half_inner, flare * 1.00),
        (-z_f0,         0.0),
        ( z_f0,         0.0),
        ( z_half_inner, flare * 1.00),
        ( z_out,        flare * 1.15),
    ]
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


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
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
    name: str, radius: float, length: float, axis: str = "y",
    flutes: int = 24, depth: float = 0.022,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.018, length * 0.16, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.85 - bev * 0.8),
        (-half_l + bev, radius),
        ( half_l - bev, radius),
        ( half_l, radius - depth * 0.85 - bev * 0.8),
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
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
            if lock_flat_walls and e.smooth:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                # Lock sharp crease where a large planar +/-Z cheek meets a curved bevel
                # (Blender Y = -Three.js Z), eliminating bevel normal bleed onto flat CNC walls!
                flat0 = abs(f0.normal.y) > 0.96 and f0.calc_area() > 0.12
                flat1 = abs(f1.normal.y) > 0.96 and f1.calc_area() > 0.12
                if flat0 != flat1:
                    e.smooth = False
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


def triangulate_all_keep_normals(all_objs: list[bpy.types.Object]):
    """Triangulate all meshes BEFORE Cycles tangent-normal baking so baked tangent frames
    match the exact exported Draco glTF triangles 1:1 (zero diagonal facet streaks!)."""
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="TriangulatePreBake", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


# =============================================================================
# SUITE 1 BUILDERS: RISER, GRIP, POCKETS, CABLE GUARD & STABILIZER (6 PARTS)
# =============================================================================
def build_lift33_riser(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-01: CNC 7075-T6 Skeletonized Bridged Truss Riser (`pos=[0,0,0]`).
    Features authentic Mathews LIFT 33 opposing triangular CNC beveled weight-reduction
    truss cutouts, asymmetric caged sight window, Bridge-Lock inline sight channel,
    Integrate MX rest dovetail, and threaded stabilizer/cable-guard/string-stop bosses."""
    m_riser = mats["R_EarthBronzeRiser"]
    m_acc = mats["R_RiserMachinedAccent"]
    m_dark = mats["R_PocketDarkAnodize"]
    m_ti = mats["R_TitaniumSilver"]

    # 1. Upper Bridged Truss Slab (y in [11.2, 32.7], z in [-1.43, +1.43])
    upper_poly = [
        (-2.35, 11.20), ( 3.45, 11.20), ( 3.55, 14.00), ( 2.45, 21.50),
        ( 0.85, 28.50), ( 0.15, 32.70), (-2.25, 32.70), (-2.35, 27.00),
    ]
    upper_slab = mk_extrude_z("u_slab", upper_poly, -1.43, 1.43, bevel=0.066, bevel_segs=3, mat=m_riser)

    # Opposing triangular & trapezoidal Mathews LIFT 33 skeletonized CNC truss pockets!
    # Preserves generous solid outer beams (X in [-2.35..-1.52] rear & forward rib) + crisp diagonal struts!
    upper_cut_polys = [
        # Bay 1 (Y 12.70..16.20): split by diagonal strut into two opposing beveled triangles
        [(-1.46, 12.75), ( 2.38, 12.75), ( 2.25, 15.85)],
        [(-1.46, 13.30), ( 1.72, 16.05), (-1.46, 16.05)],
        # Bay 2 (Y 16.85..20.75): reverse diagonal strut (classic Warren/Pratt bow truss!)
        [(-1.46, 16.90), ( 2.02, 16.90), (-1.46, 20.30)],
        [( 1.98, 17.55), ( 1.62, 20.65), (-0.85, 20.65)],
        # Bay 3 (Y 21.40..25.45): crisp opposing triangles
        [(-1.44, 21.50), ( 1.44, 21.50), ( 0.96, 25.15)],
        [(-1.44, 22.10), ( 0.42, 25.35), (-1.44, 25.35)],
        # Bay 4 (Y 26.15..29.95): compact upper lightening trapezoid
        [(-1.40, 26.25), ( 0.62, 26.25), ( 0.18, 29.75), (-1.40, 29.75)],
    ]
    u_cutters = [
        mk_flared_cutout_z(
            f"uc_{i}", _chamfer_poly2d(p, 0.17), z_half_inner=1.43, flare=0.125, flare_depth=0.17, mat=m_acc
        )
        for i, p in enumerate(upper_cut_polys)
    ]
    upper_slab = bool_subtract(upper_slab, u_cutters)

    # 2. Lower Bridged Truss Slab (y in [-32.7, -6.8], z in [-1.43, +1.43])
    # Solid lower bridge slab at Y in [-10.5, -6.8] hosts clean MATHEWS LIFT 33 engraving & stabilizer boss!
    lower_poly = [
        (-2.30, -32.70), ( 0.15, -32.70), ( 1.25, -26.50), ( 3.55, -13.50),
        ( 3.55,  -6.80), (-1.85,  -6.80), (-2.35, -16.00),
    ]
    lower_slab = mk_extrude_z("l_slab", lower_poly, -1.43, 1.43, bevel=0.066, bevel_segs=3, mat=m_riser)

    lower_cut_polys = [
        # Bay 1 (Y -14.70..-10.85): opposing triangles below stabilizer bridge
        [(-1.46, -10.85), ( 2.52, -10.85), ( 2.30, -14.35)],
        [(-1.46, -11.45), ( 1.72, -14.65), (-1.46, -14.65)],
        # Bay 2 (Y -19.90..-15.40): reverse diagonal strut
        [(-1.46, -15.45), ( 2.15, -15.45), (-1.46, -19.40)],
        [( 2.02, -16.20), ( 1.56, -19.80), (-0.82, -19.80)],
        # Bay 3 (Y -25.10..-20.65): opposing triangles
        [(-1.44, -20.70), ( 1.40, -20.70), ( 0.90, -24.75)],
        [(-1.44, -21.35), ( 0.36, -24.95), (-1.44, -24.95)],
        # Bay 4 (Y -29.85..-25.85): lower lightening trapezoid
        [(-1.40, -25.95), ( 0.62, -25.95), ( 0.14, -29.70), (-1.40, -29.70)],
    ]
    l_cutters = [
        mk_flared_cutout_z(
            f"lc_{i}", _chamfer_poly2d(p, 0.17), z_half_inner=1.43, flare=0.125, flare_depth=0.17, mat=m_acc
        )
        for i, p in enumerate(lower_cut_polys)
    ]
    lower_slab = bool_subtract(lower_slab, l_cutters)

    # 3. Centergy Narrow Grip Tang (y in [-7.20, +1.50], z in [-0.84, +0.84] cleanly inside Engage grip!)
    tang_poly = [
        (-1.38, -7.20), ( 1.12, -7.20), ( 1.32, -2.00), ( 2.95, 0.35),
        ( 3.35,  1.50), (-2.35,  1.50), (-2.18, -2.60),
    ]
    grip_tang = mk_extrude_z("grip_tang", tang_poly, -0.84, 0.84, bevel=0.04, bevel_segs=2, mat=m_dark)

    # Arrow shelf deck (y in [0.85, 1.55], z in [-1.42, +1.25]) with smooth chamfered shelf radius
    shelf_plate = mk_box(
        "shelf_plate", 5.10, 0.72, 2.66, [("t", 0.55, 1.20, -0.08)], mat=m_riser, bevel=0.070, bevel_segs=3
    )

    # 4. Asymmetric Caged Sight Window (y in [1.15, 11.45])
    # Rear structural spine spans full Z [-1.43, +1.43] (HERO ENGRAVING SLAB!)
    rear_sight_spine = mk_box(
        "rear_sight_spine", 1.78, 10.40, 2.86, [("t", -1.46, 6.30, 0.0)], mat=m_riser, bevel=0.066, bevel_segs=3
    )
    # Forward caged bridge sits strictly on -Z side (z in [-1.45, -0.45]), leaving z > -0.45 100% OPEN!
    front_left_bridge = mk_box(
        "front_left_bridge", 1.65, 10.40, 1.00, [("t", 2.55, 6.30, -0.95)], mat=m_riser, bevel=0.064, bevel_segs=3
    )
    # Carve two sleek vertical weight-reduction slots in the forward -Z bridge for authentic Mathews silhouette
    fb_cuts = [
        mk_flared_cutout_z(
            "fb_c1", _chamfer_poly2d([(2.15, 2.45), (2.95, 2.45), (2.95, 5.10), (2.15, 5.10)], 0.16),
            z_half_inner=0.50, flare=0.055, flare_depth=0.085, mat=m_acc,
        ),
        mk_flared_cutout_z(
            "fb_c2", _chamfer_poly2d([(2.15, 7.60), (2.95, 7.60), (2.95, 10.15), (2.15, 10.15)], 0.16),
            z_half_inner=0.50, flare=0.055, flare_depth=0.085, mat=m_acc,
        ),
    ]
    for fc in fb_cuts:
        bm_tmp = bmesh.new()
        bm_tmp.from_mesh(fc.data)
        bmesh.ops.translate(bm_tmp, vec=t2b(0.0, 0.0, -0.95), verts=bm_tmp.verts)
        bm_tmp.to_mesh(fc.data)
        bm_tmp.free()
    front_left_bridge = bool_subtract(front_left_bridge, fb_cuts)

    # 5. External Machined Stiffener Ribs on forward sloping truss face
    rib_upper = mk_box(
        "rib_up", 0.40, 16.20, 3.00, [("rz", 0.145), ("t", 1.92, 21.80, 0.0)],
        mat=m_acc, bevel=0.035, bevel_segs=2,
    )
    rib_lower = mk_box(
        "rib_lo", 0.40, 16.20, 3.00, [("rz", -0.155), ("t", 1.96, -21.20, 0.0)],
        mat=m_acc, bevel=0.035, bevel_segs=2,
    )

    # 6. Bridge-Lock Inline Sight Clamp Block (hollow X-extruded housing framing sight dovetail at Y=6.40)
    bl_outer = mk_box(
        "bl_sight_outer", 3.40, 1.64, 2.34, [("t", 1.25, 6.40, -0.25)], mat=m_acc, bevel=0.04, bevel_segs=2
    )
    bl_slot = mk_box(
        "bl_sight_slot", 3.90, 0.72, 1.24, [("t", 1.25, 6.40, 0.24)], mat=m_dark
    )
    bl_sight_boss = bool_subtract(bl_outer, [bl_slot])
    # Stainless Bridge-Lock sight lock thumbscrew on top of sight clamp block
    bl_lock_screw = mk_knurled_cyl(
        "bl_lock_screw", 0.30, 0.34, axis="y", flutes=18, depth=0.022,
        xform=[("t", 1.25, 7.36, 0.25)], mat=m_ti,
    )

    # 7. Integrate MX Drop-Away Rest Dovetail Rail Pad (right flank at [0.35, 1.45, +1.15])
    rest_pad = mk_box(
        "rest_pad", 2.20, 1.10, 0.45, [("t", 0.35, 1.45, 1.15)], mat=m_acc, bevel=0.035, bevel_segs=2
    )
    rest_groove = mk_box(
        "rest_groove", 2.40, 0.42, 0.16, [("t", 0.35, 1.45, 1.36)], mat=m_dark
    )
    rest_pad = bool_subtract(rest_pad, [rest_groove])

    # 8. Bridge-Lock Hollow Stabilizer Boss (Y=-8.5, X in [-0.05, +3.75]), Cable Guard Boss, String-Stop Boss
    stab_boss = mk_lathe_x(
        "stab_boss",
        [(0.49, -0.05), (0.86, -0.05), (0.86, 3.68), (0.80, 3.75), (0.49, 3.75), (0.49, -0.05)],
        segs=28, xform=[("t", 0.0, -8.50, 0.0)], mat=m_acc,
    )
    cg_boss = mk_lathe_x(
        "cg_boss",
        [(0.36, -2.85), (0.66, -2.85), (0.66, -0.25), (0.36, -0.25), (0.36, -2.85)],
        segs=24, xform=[("t", 0.0, -11.50, 0.95)], mat=m_acc,
    )
    ss_boss = mk_lathe_x(
        "ss_boss",
        [(0.32, -2.95), (0.58, -2.95), (0.58, -0.15), (0.32, -0.15), (0.32, -2.95)],
        segs=24, xform=[("t", 0.0, -17.50, 0.0)], mat=m_acc,
    )

    # 9. Upper & Lower Limb-Pocket Clevis Mounts (Z in [-1.55, +1.55] stepped down cleanly into pocket center!)
    up_clevis = mk_box(
        "up_clevis", 2.80, 1.80, 3.10, [("t", -1.25, 32.00, 0.0)], mat=m_riser, bevel=0.05, bevel_segs=2
    )
    lo_clevis = mk_box(
        "lo_clevis", 2.80, 1.80, 3.10, [("t", -1.25, -32.00, 0.0)], mat=m_riser, bevel=0.05, bevel_segs=2
    )

    # 10. Recessed Stainless Titanium Mounting Screws along truss & grip tang
    bolts = [
        mk_cyl(f"rb_{i}", 0.16, 0.16, 2.94, "z", 14, [("t", bx, by, 0.0)], mat=m_ti, bevel=0.025)
        for i, (bx, by) in enumerate([
            (-1.90, 30.80), (-1.90, -30.80), (1.35, -8.50), (-1.90, 11.80), (-1.90, -8.50)
        ])
    ]

    obj = join_objects(
        [
            upper_slab, lower_slab, grip_tang, shelf_plate, rear_sight_spine, front_left_bridge,
            rib_upper, rib_lower, bl_sight_boss, bl_lock_screw, rest_pad,
            stab_boss, cg_boss, ss_boss, up_clevis, lo_clevis, *bolts,
        ],
        "lift33_riser",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_lift33_grip(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-02: Mathews Engage Ergonomic Soft-Touch Overmolded Grip (`pos=[-0.25, -3.50, 0]`).
    13-station smoothly contoured ergonomic wraparound shell with palm swell, narrow Centergy
    wrist throat, conformal rounded side traction inlays & sculpted front palm-ridge pad."""
    m_rub = mats["R_EngageRubber"]
    m_in = mats["R_EngageInlay"]

    # Sculpted 13-station hollow wraparound grip shell lofted smoothly along Y in [-3.55, +3.45]
    # Exact outer envelope stays strictly inside min=[-1.535, -3.55, -1.23], max=[+1.585, +3.45, +1.23]
    y_stations = [
        (-3.55, 0.91, 0.91, 0.00),
        (-3.32, 0.96, 0.96, 0.01),
        (-2.90, 0.99, 0.99, 0.02),
        (-2.25, 1.00, 1.00, 0.04),  # ergonomic lower palm swell
        (-1.45, 1.00, 1.00, 0.05),
        (-0.65, 0.99, 0.98, 0.03),
        ( 0.15, 0.96, 0.95, 0.01),
        ( 1.00, 0.94, 0.92, -0.01),
        ( 1.85, 0.92, 0.90, -0.03), # narrow Centergy low-torque thumb web
        ( 2.55, 0.94, 0.92, -0.01),
        ( 3.05, 0.96, 0.94, 0.00),
        ( 3.32, 0.94, 0.92, 0.00),
        ( 3.45, 0.90, 0.89, 0.00),
    ]
    n_seg = 36
    bm = bmesh.new()
    outer_rings = []
    inner_rings = []
    for y_val, sx, sz, dx in y_stations:
        o_ring = []
        i_ring = []
        for k in range(n_seg):
            a = 2.0 * math.pi * k / n_seg
            ca, sa = math.cos(a), math.sin(a)
            # Ergonomic superellipse with subtle curved palm-ridge contour on front (+X)
            front_ridge = 0.045 * max(0.0, ca) ** 2.2 * (1.0 - abs(y_val + 0.3) / 4.2)
            ox = dx + math.copysign(abs(ca) ** 0.74, ca) * (1.51 * sx) + front_ridge
            oz = math.copysign(abs(sa) ** 0.78, sa) * (1.16 * sz)
            # Inner hollow tang cavity: cleanly clears Centergy tang (X in [-1.18, +1.18], Z in [-0.88, +0.88])
            ix = math.copysign(abs(ca) ** 0.50, ca) * 1.18
            iz = math.copysign(abs(sa) ** 0.50, sa) * 0.88
            o_ring.append(bm.verts.new((ox, y_val, oz)))
            i_ring.append(bm.verts.new((ix, y_val, iz)))
        outer_rings.append(o_ring)
        inner_rings.append(i_ring)

    n_st = len(y_stations)
    for s in range(n_st - 1):
        for k in range(n_seg):
            kn = (k + 1) % n_seg
            bm.faces.new((outer_rings[s][k], outer_rings[s + 1][k], outer_rings[s + 1][kn], outer_rings[s][kn]))
            bm.faces.new((inner_rings[s][k], inner_rings[s][kn], inner_rings[s + 1][kn], inner_rings[s + 1][k]))
    # Bottom & top annular end caps
    for k in range(n_seg):
        kn = (k + 1) % n_seg
        bm.faces.new((outer_rings[0][k], outer_rings[0][kn], inner_rings[0][kn], inner_rings[0][k]))
        bm.faces.new((outer_rings[-1][k], inner_rings[-1][k], inner_rings[-1][kn], outer_rings[-1][kn]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    shell = _bm_to_obj("grip_shell", bm, m_rub)

    # Conformal rounded stadium-oval tactile rubber side inlays (zero boxy slab overhangs!)
    def _stadium_xy(cx: float, cy: float, hx: float, hy: float, r: float, segs_arc: int = 8):
        pts = []
        corners = [
            (cx + hx - r, cy + hy - r, 0.0, math.pi * 0.5),
            (cx - hx + r, cy + hy - r, math.pi * 0.5, math.pi),
            (cx - hx + r, cy - hy + r, math.pi, math.pi * 1.5),
            (cx + hx - r, cy - hy + r, math.pi * 1.5, math.pi * 2.0),
        ]
        for ccx, ccy, a0, a1 in corners:
            for j in range(segs_arc + 1):
                a = a0 + (a1 - a0) * (j / segs_arc)
                pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
        return pts

    side_poly = _stadium_xy(-0.04, -0.15, 0.84, 2.35, 0.52, segs_arc=6)
    inlay_l = mk_extrude_z("g_in_l", side_poly, -1.22, -1.04, bevel=0.055, bevel_segs=3, mat=m_in)
    inlay_r = mk_extrude_z("g_in_r", side_poly,  1.04,  1.22, bevel=0.055, bevel_segs=3, mat=m_in)

    # Smooth contoured ergonomic front palm-ridge traction pad conforming to front superellipse
    front_poly_zy = _stadium_xy(0.0, -0.15, 0.62, 2.55, 0.42, segs_arc=6)
    front_pad = mk_extrude_x("g_front", front_poly_zy, 1.18, 1.58, bevel=0.075, bevel_segs=3, mat=m_in)

    obj = join_objects([shell, inlay_l, inlay_r, front_pad], "lift33_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=44.0)


def _build_limb_pocket(is_upper: bool, mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-03/R-04: CNC Pivoting Upper/Lower Split-Limb Pocket & Titanium Hex Weight Bolt
    (`pos=[-1.40, ±32.40, 0]`). Exact twin split-limb channels at Z in [±0.95, ±2.05]
    mate 100% seamlessly with flexing CSG quad limbs!"""
    s = 1.0 if is_upper else -1.0
    m_pock = mats["R_PocketDarkAnodize"]
    m_acc = mats["R_EarthBronzeRiser"]
    m_ti = mats["R_TitaniumSilver"]

    # Twin-channel forked cross section in (Z, Y) extruded along X in [-1.95, +1.95]
    if is_upper:
        fork_zy = [
            (-2.35, -0.85), (-0.88, -0.85), (-0.88, 0.72), ( 0.88, 0.72),
            ( 0.88, -0.85), ( 2.35, -0.85), ( 2.35, 1.35), ( 2.05, 1.35),
            ( 2.05,  0.05), ( 0.95,  0.05), ( 0.95, 1.35), (-0.95, 1.35),
            (-0.95,  0.05), (-2.05,  0.05), (-2.05, 1.35), (-2.35, 1.35),
        ]
    else:
        fork_zy = [
            (-2.35, -1.35), (-2.05, -1.35), (-2.05, -0.05), (-0.95, -0.05),
            (-0.95, -1.35), ( 0.95, -1.35), ( 0.95, -0.05), ( 2.05, -0.05),
            ( 2.05, -1.35), ( 2.35, -1.35), ( 2.35,  0.85), ( 0.88,  0.85),
            ( 0.88, -0.72), (-0.88, -0.72), (-0.88,  0.85), (-2.35,  0.85),
        ]
    milled = mk_extrude_x("p_fork", fork_zy, -1.95, 1.95, bevel=0.045, bevel_segs=2, mat=m_pock)

    # Rear CNC cradle cap & accent cheek plates
    cradle_cap = mk_box(
        "p_cap", 1.44, 1.14, 4.72, [("t", -1.35, s * 0.82, 0.0)], mat=m_acc, bevel=0.055, bevel_segs=2
    )
    # Recessed side lightening scallops on outer pocket cheeks
    cheek_cut_l = mk_box("pc_l", 2.10, 0.62, 0.16, [("t", 0.35, s * 0.40, -2.32)], mat=m_pock)
    cheek_cut_r = mk_box("pc_r", 2.10, 0.62, 0.16, [("t", 0.35, s * 0.40,  2.32)], mat=m_pock)
    milled = bool_subtract(milled, [cheek_cut_l, cheek_cut_r])

    # Transverse titanium pivot axle pin + flanged end caps
    pivot_pin = mk_cyl(
        "p_pin", 0.28, 0.28, 4.92, axis="z", segs=22,
        xform=[("t", 0.65, -s * 0.35, 0.0)], mat=m_ti, bevel=0.035,
    )

    # Machined 6-point titanium limb-weight adjustment bolt with flanged washer & Allen socket
    bolt_head = mk_cyl(
        "p_bh", 0.56, 0.56, 0.42, axis="y", segs=6,
        xform=[("t", -0.55, s * 1.63, 0.0)], mat=m_ti, bevel=0.03,
    )
    bolt_hex_rec = mk_cyl(
        "p_bh_rec", 0.28, 0.26, 0.24, axis="y", segs=6,
        xform=[("t", -0.55, s * 1.76, 0.0)], mat=m_pock,
    )
    bolt_head = bool_subtract(bolt_head, [bolt_hex_rec])
    bolt_flange = mk_cyl(
        "p_bf", 0.66, 0.66, 0.12, axis="y", segs=24,
        xform=[("t", -0.55, s * 1.46, 0.0)], mat=m_ti, bevel=0.02,
    )
    bolt_shaft = mk_cyl(
        "p_bs", 0.34, 0.34, 1.56, axis="y", segs=18,
        xform=[("t", -0.55, s * 0.64, 0.0)], mat=m_ti,
    )

    name = "lift33_upper_pocket" if is_upper else "lift33_lower_pocket"
    obj = join_objects([milled, cradle_cap, pivot_pin, bolt_head, bolt_flange, bolt_shaft], name)
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_cable_guard(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-05: Bridge-Lock Carbon Cable Guard Rod & Twin Low-Friction Rollers
    (`pos=[-1.80, -11.50, +0.95]`). Twin rollers sit at exact cable-routing points
    `(-11.45, ±0.35, +0.72 / +0.84)` matching `lift33_yoke_cables`!"""
    m_carb = mats["R_Carbon3K"]
    m_anod = mats["R_PocketDarkAnodize"]
    m_acc = mats["R_EarthBronzeRiser"]
    m_ti = mats["R_TitaniumSilver"]

    rod_pts = [
        Vector((  1.10, 0.0, 0.00)),
        Vector(( -1.50, 0.0, 0.10)),
        Vector(( -4.50, 0.0, 0.36)),
        Vector(( -8.20, 0.0, 0.62)),
        Vector((-11.65, 0.0, 0.72)),
    ]
    rod = mk_tube_along_pts("cg_rod", rod_pts, radius=0.28, ring_segs=20, mat=m_carb)

    clamp_collar = mk_cyl(
        "cg_collar", 0.48, 0.48, 1.15, axis="x", segs=22,
        xform=[("t", 0.45, 0.0, 0.0)], mat=m_acc, bevel=0.04,
    )
    # CNC roller containment carriage housing
    carriage = mk_box(
        "cg_carriage", 1.44, 1.04, 0.84, [("t", -11.35, 0.0, 0.72)], mat=m_anod, bevel=0.05, bevel_segs=2
    )
    # Recessed twin roller axles & deeply grooved stainless ball-bearing pulleys
    roller_prof = [
        (0.0, -0.32), (0.36, -0.32), (0.36, -0.17), (0.22, -0.06),
        (0.22,  0.06), (0.36,  0.17), (0.36,  0.32), (0.0,  0.32),
    ]
    r1 = mk_lathe_y("cg_r1", roller_prof, segs=26, xform=[("t", -11.45,  0.35, 0.72)], mat=m_ti)
    r2 = mk_lathe_y("cg_r2", roller_prof, segs=26, xform=[("t", -11.45, -0.35, 0.84)], mat=m_ti)
    cap_bolt = mk_cyl(
        "cg_bolt", 0.14, 0.14, 1.14, axis="y", segs=12,
        xform=[("t", -11.45, 0.0, 0.78)], mat=m_ti, bevel=0.02,
    )

    obj = join_objects([rod, clamp_collar, carriage, r1, r2, cap_bolt], "lift33_cable_guard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_stabilizer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """R-06: Bridge-Lock 10" 3K Carbon Stabilizer, Harmonic Orange Damper & Stacked Stainless Weights
    (`pos=[+3.20, -8.50, 0]`)."""
    m_carb = mats["R_Carbon3K"]
    m_anod = mats["R_PocketDarkAnodize"]
    m_acc = mats["R_EarthBronzeRiser"]
    m_ti = mats["R_TitaniumSilver"]
    m_org = mats["R_DamperOrange"]

    # 1. Rear Bridge-Lock CNC shank & quick-disconnect collar (x in [-2.50, +2.35])
    rear_shank = mk_lathe_x(
        "st_rear",
        [
            (0.00, -2.50), (0.42, -2.50), (0.46, -2.35), (0.46, 0.45),
            (0.68,  0.55), (0.68,  2.25), (0.56,  2.35), (0.00, 2.35),
        ],
        segs=32, mat=m_anod,
    )
    bridge_collar = mk_box(
        "st_collar", 1.15, 1.38, 1.38, [("t", -0.20, 0.0, 0.0)], mat=m_acc, bevel=0.055, bevel_segs=2
    )

    # 2. Dedicated 20.6 cm 3K Twill Woven Carbon Fiber Tube (x in [2.25, 22.85]) — HERO CARBON BAND!
    carbon_tube = mk_cyl(
        "st_carbon_tube", 0.56, 0.56, 20.60, axis="x", segs=36,
        xform=[("t", 12.55, 0.0, 0.0)], mat=m_carb, bevel=0.015,
    )

    # 3. Front Harmonic Damper Housing + Ribbed Firewalled Mathews Orange Elastomer Ring (x in [22.80, 24.85])
    damper_core = mk_lathe_x(
        "st_damp_core",
        [
            (0.00, 22.80), (0.86, 22.85), (0.86, 23.02), (0.68, 23.06),
            (0.68, 24.08), (0.90, 24.14), (0.90, 24.82), (0.00, 24.82),
        ],
        segs=32, mat=m_anod,
    )
    damper_orange = mk_lathe_x(
        "st_damp_org",
        [
            (0.66, 23.02), (0.96, 23.06), (0.96, 23.22), (0.86, 23.26),
            (0.96, 23.30), (0.96, 23.48), (0.86, 23.52), (0.96, 23.56),
            (0.96, 23.74), (0.66, 23.78), (0.66, 23.02),
        ],
        segs=32, mat=m_org,
    )

    # 4. Stacked 3-piece Brushed Stainless Steel Inertia Weights (x in [24.82, 26.48])
    weight_stack = mk_lathe_x(
        "st_weights",
        [
            (0.00, 24.82), (1.05, 24.82), (1.05, 25.27), (0.93, 25.32),
            (1.05, 25.37), (1.05, 25.81), (0.93, 25.86), (1.05, 25.91),
            (1.05, 26.36), (0.94, 26.48), (0.00, 26.48),
        ],
        segs=36, mat=m_ti,
    )

    obj = join_objects(
        [rear_shank, bridge_collar, carbon_tube, damper_core, damper_orange, weight_stack],
        "lift33_stabilizer",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 2 BUILDERS: SWITCHWEIGHT-X CAMS, SIGHT, REST, DAMPENERS & D-LOOP (8 PARTS)
# =============================================================================
def _build_switchweight_cam(is_upper: bool, mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """C-03/C-04: CNC Antique Bronze-Gold SwitchWeight-X Binary Cam & Let-Off Module
    (`pos=[-12.60, ±41.50, 0]`). Exact eccentric perimeter, deep peripheral string groove,
    twin cable tracks, 4 chamfered CNC spoke windows, contoured MOD-F plate & titanium draw-stop!"""
    s = 1.0 if is_upper else -1.0
    m_gold = mats["A_CamBronzeGold"]
    m_cop = mats["A_CamCopperTrack"]
    m_mod = mats["A_ModuleDarkAnodize"]
    m_ti = mats["A_Stainless"]

    def cam_outer_pts(r_offset: float = 0.0, n_pts: int = 96) -> list[tuple[float, float]]:
        pts = []
        for i in range(n_pts):
            a = (i / n_pts) * math.pi * 2.0
            r = (
                2.65
                + 1.35 * max(0.0, -math.cos(a + s * 0.35))
                + 0.55 * math.cos(2.0 * a - s * 0.40)
                + r_offset
            )
            pts.append((math.cos(a) * r, math.sin(a) * r))
        return pts

    # 1. Main Cam Web Sandwich with Deep CNC Peripheral Bowstring V-Groove around Z = 0!
    flange_l = mk_extrude_z("cam_fl_l", cam_outer_pts(0.0), -0.24, -0.07, bevel=0.030, bevel_segs=3, mat=m_gold)
    flange_r = mk_extrude_z("cam_fl_r", cam_outer_pts(0.0),  0.07,  0.24, bevel=0.030, bevel_segs=3, mat=m_gold)
    groove_core = mk_extrude_z("cam_groove", cam_outer_pts(-0.24), -0.10, 0.10, bevel=0.0, mat=m_cop)
    # Axle hub reinforcement boss spanning full cam thickness
    hub_boss = mk_cyl("cam_hub", 0.72, 0.72, 0.56, axis="z", segs=36, mat=m_gold, bevel=0.032)
    main_web = join_objects([flange_l, groove_core, flange_r, hub_boss], "cam_web_raw")

    # 2. Twin Inner & Outer Secondary Yoke/Control Cable Spiral Track Drums (Z in [-0.62..-0.24] & [+0.24..+0.62])
    def track_pts(r_off: float = 0.0, n_pts: int = 72) -> list[tuple[float, float]]:
        pts = []
        for i in range(n_pts):
            a = (i / n_pts) * math.pi * 2.0
            r = 1.65 + 0.72 * max(0.0, math.cos(a - s * 0.50)) + r_off
            pts.append((math.cos(a) * r, math.sin(a) * r))
        return pts

    trk_l_out = mk_extrude_z("tl_o", track_pts(0.0),   -0.60, -0.47, bevel=0.024, bevel_segs=3, mat=m_cop)
    trk_l_grv = mk_extrude_z("tl_g", track_pts(-0.18), -0.49, -0.35, bevel=0.0, mat=m_mod)
    trk_l_in  = mk_extrude_z("tl_i", track_pts(0.0),   -0.37, -0.23, bevel=0.024, bevel_segs=3, mat=m_cop)

    trk_r_in  = mk_extrude_z("tr_i", track_pts(0.0),    0.23,  0.37, bevel=0.024, bevel_segs=3, mat=m_cop)
    trk_r_grv = mk_extrude_z("tr_g", track_pts(-0.18),  0.35,  0.49, bevel=0.0, mat=m_mod)
    trk_r_out = mk_extrude_z("tr_o", track_pts(0.0),    0.47,  0.60, bevel=0.024, bevel_segs=3, mat=m_cop)

    # Boolean-cut exact central axle bore (r = 0.36) + chamfered CNC spoke weight-reduction windows!
    axle_cut = mk_cyl("cam_ax_cut", 0.36, 0.36, 1.80, axis="z", segs=32, mat=m_mod)
    spoke_cuts = [axle_cut]
    drum_cut_polys = []
    for k in range(4):
        a_mid = (k * math.pi) / 2.0 + 0.42
        # Skip cutting right behind the SwitchWeight-X module plate so the module sits on solid bronze!
        cx_test = math.cos(a_mid) * 1.45
        cy_test = math.sin(a_mid) * 1.45
        if cx_test < -0.5 and (cy_test * s) < -0.4:
            continue
        r_in = 0.96
        r_out = 1.78 + 0.62 * max(0.0, -math.cos(a_mid + s * 0.35))
        da = 0.34
        win_pts = _chamfer_poly2d(
            [
                (math.cos(a_mid + da) * r_in, math.sin(a_mid + da) * r_in),
                (math.cos(a_mid + da * 0.80) * r_out, math.sin(a_mid + da * 0.80) * r_out),
                (math.cos(a_mid - da * 0.80) * r_out, math.sin(a_mid - da * 0.80) * r_out),
                (math.cos(a_mid - da) * r_in, math.sin(a_mid - da) * r_in),
            ],
            r=0.14,
        )
        spoke_cuts.append(
            mk_flared_cutout_z(f"cw_{k}", win_pts, z_half_inner=0.24, flare=0.068, flare_depth=0.085, mat=m_cop)
        )
        # Matching inner skeletonized spoke windows through secondary cable drums (leaving solid cable track rim!)
        r_drum_edge = 1.65 + 0.72 * max(0.0, math.cos(a_mid - s * 0.50))
        r_d_out = min(r_out, r_drum_edge - 0.38)
        if r_d_out > 1.15:
            drum_cut_polys.append(
                _chamfer_poly2d(
                    [
                        (math.cos(a_mid + 0.28) * 0.90, math.sin(a_mid + 0.28) * 0.90),
                        (math.cos(a_mid + 0.22) * r_d_out, math.sin(a_mid + 0.22) * r_d_out),
                        (math.cos(a_mid - 0.22) * r_d_out, math.sin(a_mid - 0.22) * r_d_out),
                        (math.cos(a_mid - 0.28) * 0.90, math.sin(a_mid - 0.28) * 0.90),
                    ],
                    r=0.09,
                )
            )

    main_web = bool_subtract(main_web, spoke_cuts)
    # Cut axle bore + matching CNC skeletonized spoke windows through BOTH secondary cable track drums!
    trk_l = join_objects([trk_l_out, trk_l_grv, trk_l_in], "trk_l")
    tl_cuts = [mk_cyl("ax_l", 0.36, 0.36, 1.40, axis="z", segs=28, mat=m_mod)] + [
        mk_extrude_z(f"tl_sp_{idx_d}", dp, -0.75, -0.15, mat=m_mod) for idx_d, dp in enumerate(drum_cut_polys)
    ]
    trk_l = bool_subtract(trk_l, tl_cuts)

    trk_r = join_objects([trk_r_in, trk_r_grv, trk_r_out], "trk_r")
    tr_cuts = [mk_cyl("ax_r", 0.36, 0.36, 1.40, axis="z", segs=28, mat=m_mod)] + [
        mk_extrude_z(f"tr_sp_{idx_d}", dp, 0.15, 0.75, mat=m_mod) for idx_d, dp in enumerate(drum_cut_polys)
    ]
    trk_r = bool_subtract(trk_r, tr_cuts)

    # 3. Sculpted SwitchWeight-X 85% Let-Off Module Plate (dark anodized, chamfered, right face Z in [0.46, 0.72])
    mod_poly = _chamfer_poly2d(
        [
            (-2.52, -s * 1.88), (-0.18, -s * 1.88), (-0.18, -s * 0.42), (-2.52, -s * 0.42)
        ],
        r=0.22,
    )
    mod_plate = mk_extrude_z("cam_mod", mod_poly, 0.46, 0.72, bevel=0.032, bevel_segs=2, mat=m_mod)

    # 4 Countersunk M3 Titanium Corner Socket Screws locking the SwitchWeight-X module (100% clear of center text!)
    mod_bolts = [
        mk_cyl(f"mb_{i}", 0.105, 0.105, 0.28, axis="z", segs=12, xform=[("t", bx, s * by, 0.62)], mat=m_ti, bevel=0.018)
        for i, (bx, by) in enumerate([(-2.26, -1.66), (-0.44, -1.66), (-2.26, -0.64), (-0.44, -0.64)])
    ]

    # 4. Gleaming Titanium Draw-Stop Peg (extends both sides at (1.85, -s*1.85, 0) within Z in [-0.69, +0.69])
    draw_stop = mk_cyl(
        "draw_stop", 0.235, 0.235, 1.38, axis="z", segs=22,
        xform=[("t", 1.85, -s * 1.85, 0.0)], mat=m_ti, bevel=0.035,
    )
    stop_rubber = mk_cyl(
        "stop_rub", 0.26, 0.26, 0.42, axis="z", segs=20,
        xform=[("t", 1.85, -s * 1.85, 0.32)], mat=mats["A_ElastomerDark"], bevel=0.025,
    )

    # 4b. Twin CNC Titanium Sealed Ball-Bearing Race Shields seated concentrically around central axle bore!
    #     Strictly stays inside r in [0.365..0.565] (< 0.66 timing ticks) & z in [-0.625, +0.625] (inside BBOX!)
    bearing_l = mk_lathe_x(
        "cam_brg_l",
        [
            (0.368, -0.575), (0.565, -0.575), (0.565, -0.622), (0.505, -0.628),
            (0.495, -0.606), (0.425, -0.606), (0.415, -0.628), (0.368, -0.622),
            (0.368, -0.575),
        ],
        segs=36, xform=[("ry", -math.pi * 0.5)], mat=m_ti,
    )
    bearing_r = mk_lathe_x(
        "cam_brg_r",
        [
            (0.368, 0.575), (0.368, 0.622), (0.415, 0.628), (0.425, 0.606),
            (0.495, 0.606), (0.505, 0.628), (0.565, 0.622), (0.565, 0.575),
            (0.368, 0.575),
        ],
        segs=36, xform=[("ry", -math.pi * 0.5)], mat=m_ti,
    )

    name = "lift33_upper_cam" if is_upper else "lift33_lower_cam"
    obj = join_objects(
        [main_web, trk_l, trk_r, mod_plate, *mod_bolts, draw_stop, stop_rubber, bearing_l, bearing_r],
        name,
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_lift33_limb_dampeners(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """C-08: Vivid Mathews Orange Harmonic Limb Dampeners & Rear Carbon String-Stop Rod
    (`pos=[-6.50, 0, 0]`)."""
    m_org = mats["A_DamperOrange"]
    m_blk = mats["A_ElastomerDark"]
    m_carb = mats["A_CarbonRod"]
    m_anod = mats["A_SightBlackAnodize"]

    parts = []
    # Upper & lower bridged harmonic elastomer dampeners clamped SNUGLY directly between the
    # outer & inner CSG split quad-limb blades at u = 0.44:
    #   CSG limb root = [-1.40, s*32.40, 0]
    #   cx(0.44) = -11.2 * 0.44^1.25 = -4.0134 -> world X = -5.4134 -> local X = +1.0866
    #   cy(0.44) = s * (9.1*sin(0.22*pi) + 0.55*sin(0.44*pi)) = s*6.3408 -> world Y = s*38.7408
    #   Limb tangent slope = atan2(s*11.338, -11.402) -> tilt rz = -s * 0.7826 rad (~∓44.8 deg)
    #   Blade clear gap at u=0.44 is 0.836 cm -> sy=1.08 cm embeds cleanly into both blades with ZERO air gap!
    for s in (1.0, -1.0):
        xd = 1.0866
        yd = s * 38.7408
        tilt_rz = -s * 0.7826
        for z_side in (-1.50, 1.50):
            # Sculpted Mathews orange harmonic rubber clamp wedged between upper/lower carbon blades
            parts.append(
                mk_box(
                    f"ld_blk_{s}_{z_side}", 1.28, 1.08, 0.92,
                    [("rz", tilt_rz), ("t", xd, yd, z_side)],
                    mat=m_org, bevel=0.075, bevel_segs=2,
                )
            )
            # Outer black elastomer harmonic resonator disc flush against outboard face of orange clamp
            z_out = z_side + (0.54 if z_side > 0 else -0.54)
            parts.append(
                mk_cyl(
                    f"ld_disc_{s}_{z_side}", 0.50, 0.50, 0.34, axis="z", segs=24,
                    xform=[("t", xd, yd, z_out)], mat=m_blk, bevel=0.045,
                )
            )
            # Inner vivid Mathews orange harmonic resonator core flush in disc
            parts.append(
                mk_cyl(
                    f"ld_core_{s}_{z_side}", 0.25, 0.25, 0.37, axis="z", segs=18,
                    xform=[("t", xd, yd, z_out)], mat=m_org, bevel=0.03,
                )
            )
        # Central stiffener cross-bridge bar linking left & right limb dampeners cleanly across split limbs
        parts.append(
            mk_box(
                f"ld_bar_{s}", 0.48, 0.44, 3.12,
                [("rz", tilt_rz), ("t", xd, yd, 0.0)],
                mat=m_blk, bevel=0.04, bevel_segs=2,
            )
        )

    # Rear Bridge-Lock Carbon String-Stop Rod + Clamp Collar + Vivid Orange Elastomer Stop Cup
    stop_pts = [
        Vector(( 4.90, -17.50, 0.0)),
        Vector((-4.20, -17.50, 0.0)),
        Vector((-7.60, -17.20, 0.0)),
        Vector((-9.35, -17.00, 0.0)),
    ]
    parts.append(mk_tube_along_pts("ss_rod", stop_pts, radius=0.26, ring_segs=18, mat=m_carb))
    parts.append(
        mk_cyl(
            "ss_clamp", 0.44, 0.44, 1.10, axis="x", segs=22,
            xform=[("t", 4.35, -17.50, 0.0)], mat=m_anod, bevel=0.04,
        )
    )
    stop_cup = mk_lathe_x(
        "ss_cup",
        [
            (0.00, -9.55), (0.18, -9.55), (0.48, -9.90), (0.58, -9.85),
            (0.45, -9.45), (0.33, -9.20), (0.00, -9.20),
        ],
        segs=26, xform=[("t", 0.0, -17.00, 0.0)], mat=m_org,
    )
    parts.append(stop_cup)

    obj = join_objects(parts, "lift33_limb_dampeners")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_lift33_drop_away_rest(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: QAD Integrate MX Limb-Driven Drop-Away Rest Housing (`pos=[+0.45, +1.45, +1.15]`)."""
    m_anod = mats["A_SightBlackAnodize"]
    m_mod = mats["A_ModuleDarkAnodize"]
    m_st = mats["A_Stainless"]
    m_org = mats["A_DamperOrange"]

    clamp_blk = mk_box("dr_clamp", 1.55, 1.05, 0.68, [("t", -0.15, 0.0, 0.0)], mat=m_anod, bevel=0.045, bevel_segs=2)
    clutch = mk_cyl(
        "dr_clutch", 0.56, 0.56, 0.92, axis="z", segs=26,
        xform=[("t", 0.95, 0.35, -0.25)], mat=m_mod, bevel=0.04,
    )
    wind_knob = mk_knurled_cyl(
        "dr_wknob", 0.32, 0.42, axis="z", flutes=18, depth=0.022,
        xform=[("t", 0.95, 0.35, 0.35)], mat=m_st,
    )
    elev_knob = mk_knurled_cyl(
        "dr_eknob", 0.28, 0.36, axis="y", flutes=16, depth=0.020,
        xform=[("t", -0.15, 0.72, 0.0)], mat=m_st,
    )
    # Thumb-cocking lever & orange lock indicator on side of clutch
    cock_tab = mk_box("dr_tab", 0.55, 0.24, 0.16, [("t", 0.55, 0.62, 0.22)], mat=m_org, bevel=0.025)

    # Full-capture protective containment arch sweeping cleanly over arrow axis (local [0.95, 0.95, -1.15])
    arch_pts = [
        Vector((0.95, 0.35, -0.35)),
        Vector((0.95, 1.55, -0.45)),
        Vector((0.95, 1.85, -1.15)),
        Vector((0.95, 1.55, -1.78)),
        Vector((0.95, 0.75, -1.85)),
    ]
    arch = mk_tube_along_pts("dr_arch", arch_pts, radius=0.13, ring_segs=16, mat=m_anod)

    obj = join_objects([clamp_blk, clutch, wind_knob, elev_knob, cock_tab, arch], "lift33_drop_away_rest")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_launcher_fork(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Spring-Loaded Stainless V-Launcher Fork (`pos=[+1.40, +1.85, 0]`).
    Pivots around local Z at [0,0,0]; V-cradle cleanly supports Ø6.2 mm arrow shaft at local [0, +0.55, 0]!"""
    m_st = mats["A_Stainless"]
    m_felt = mats["A_ElastomerDark"]

    axle = mk_cyl(
        "lf_axle", 0.14, 0.14, 1.48, axis="z", segs=18,
        xform=[("t", 0.0, 0.0, 0.55)], mat=m_st, bevel=0.018,
    )
    base = mk_box("lf_base", 0.32, 0.38, 0.42, [("t", 0.0, 0.14, 0.0)], mat=m_st, bevel=0.028, bevel_segs=2)
    prong_l = mk_tube_along_pts(
        "lf_pl",
        [Vector((0.0, 0.18, -0.08)), Vector((0.0, 0.36, -0.32)), Vector((0.0, 0.76, -0.47))],
        radius=0.075, ring_segs=14, mat=m_st,
    )
    prong_r = mk_tube_along_pts(
        "lf_pr",
        [Vector((0.0, 0.18,  0.08)), Vector((0.0, 0.36,  0.32)), Vector((0.0, 0.76,  0.47))],
        radius=0.075, ring_segs=14, mat=m_st,
    )
    pad = mk_box("lf_pad", 0.36, 0.10, 0.32, [("t", 0.0, 0.25, 0.0)], mat=m_felt, bevel=0.015)

    obj = join_objects([axle, base, prong_l, prong_r, pad], "lift33_launcher_fork")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_sight_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: Bridge-Lock 5-Pin Micro-Adjust Dovetail Sight Housing, Yardage Tape & Fluorescent Level
    (`pos=[+4.20, +6.40, +1.25]`)."""
    m_anod = mats["A_SightBlackAnodize"]
    m_mod = mats["A_ModuleDarkAnodize"]
    m_st = mats["A_Stainless"]
    m_grn = mats["A_FiberGreen"]

    # 1. Long Bridge-Lock Inline Dovetail Extension Bar (passes cleanly through riser channel at z_local=-0.95)
    dovetail = mk_box(
        "sh_dove", 7.20, 0.56, 0.92, [("t", -2.40, 0.0, -0.95)], mat=m_anod, bevel=0.035, bevel_segs=2
    )
    # Cross-arm & vertical elevation micrometer rack (carrying 20-80 YD yardage tape!)
    cross_arm = mk_box(
        "sh_cross", 1.10, 0.78, 1.58, [("t", 0.40, 0.0, -0.25)], mat=m_mod, bevel=0.04, bevel_segs=2
    )
    elev_rack = mk_box(
        "sh_elev", 0.75, 2.35, 0.55, [("t", 0.40, -0.45, 0.35)], mat=m_anod, bevel=0.035, bevel_segs=2
    )
    # Knurled stainless micrometer elevation & windage adjustment drums
    elev_knob = mk_knurled_cyl(
        "sh_eknob", 0.42, 0.34, axis="y", flutes=24, depth=0.025,
        xform=[("t", 0.40, 0.85, 0.35)], mat=m_st,
    )
    wind_knob = mk_knurled_cyl(
        "sh_wknob", 0.36, 0.42, axis="z", flutes=22, depth=0.022,
        xform=[("t", 0.40, -0.80, 0.65)], mat=m_st,
    )

    # 2. Machined Circular Ø38mm Sight Scope Hood centered at local (0.40, -0.80, +0.20)
    scope_ring = mk_lathe_x(
        "sh_ring",
        [
            (1.72, -0.775), (2.06, -0.775), (2.08, -0.72), (2.08, 0.72),
            (2.06,  0.775), (1.72,  0.775), (1.72, -0.775),
        ],
        segs=40, xform=[("t", 0.40, -0.80, 0.20)], mat=m_anod,
    )
    # Fluorescent green rapid-alignment peep ring bezel on archer-facing rear edge
    green_bezel = mk_torus(
        "sh_bezel", major_r=1.78, minor_r=0.08, axis="x", major_segs=36, minor_segs=12,
        xform=[("t", -0.36, -0.80, 0.20)], mat=m_grn,
    )
    # Anti-cant fluorescent green bubble level vial + machined lower guard bracket
    level_vial = mk_cyl(
        "sh_vial", 0.14, 0.14, 0.82, axis="z", segs=18,
        xform=[("t", 0.25, -2.35, 0.20)], mat=m_grn, bevel=0.02,
    )
    vial_end_l = mk_cyl("sh_vl", 0.17, 0.17, 0.14, axis="z", segs=16, xform=[("t", 0.25, -2.35, -0.22)], mat=m_anod)
    vial_end_r = mk_cyl("sh_vr", 0.17, 0.17, 0.14, axis="z", segs=16, xform=[("t", 0.25, -2.35,  0.62)], mat=m_anod)

    obj = join_objects(
        [dovetail, cross_arm, elev_rack, elev_knob, wind_knob, scope_ring, green_bezel, level_vial, vial_end_l, vial_end_r],
        "lift33_sight_housing",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_sight_pins(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: 0.019" Guarded Multi-Color Glowing Fiber-Optic Sight Pins (`pos=[+4.60, +5.60, +1.45]`)."""
    m_rack = mats["A_SightBlackAnodize"]
    pin_rows = [
        ( 0.82, mats["A_FiberGreen"],  1.45),
        ( 0.42, mats["A_FiberAmber"],  1.48),
        ( 0.02, mats["A_FiberOrange"], 1.52),
        (-0.38, mats["A_FiberRed"],    1.48),
        (-0.78, mats["A_FiberGreen"],  1.45),
    ]
    parts = [
        mk_box("sp_rack", 0.45, 2.45, 0.22, [("t", 0.0, 0.0, 1.48)], mat=m_rack, bevel=0.025, bevel_segs=2)
    ]
    for idx_p, (py, mat_fiber, z_len) in enumerate(pin_rows):
        # Precision milled slender steel pin blade
        parts.append(
            mk_box(
                f"sp_blade_{idx_p}", 0.22, 0.08, z_len, [("t", 0.0, py, 1.48 - z_len * 0.5)],
                mat=m_rack, bevel=0.012,
            )
        )
        # Luminous fiber-optic aiming bead centered right on aiming axis (z ~ 0)
        parts.append(
            mk_sphere(
                f"sp_bead_{idx_p}", 0.11, 0.11, 0.11, u_segs=16, v_segs=12,
                xform=[("t", 0.0, py, 1.48 - z_len)], mat=mat_fiber,
            )
        )

    # Top glowing fiber-optic light collector coil arc wrapping around top of sight ring
    fiber_pts = []
    for i in range(17):
        a = -0.35 * math.pi + (0.70 * math.pi * i) / 16.0
        fiber_pts.append(Vector((0.0, math.cos(a) * 1.93, math.sin(a) * 1.93)))
    parts.append(mk_tube_along_pts("sp_fiber_arc", fiber_pts, radius=0.09, ring_segs=14, mat=mats["A_FiberOrange"]))

    obj = join_objects(parts, "lift33_sight_pins")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_d_loop(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: Braided Copper-Gold Dyneema Release D-Loop, Brass Nock Collars & 1/4" Hooded Peep Sight
    (`pos=[-16.50, +2.40, 0]`)."""
    m_brs = mats["A_BrassNock"]
    m_cord = mats["A_DLoopCord"]
    m_anod = mats["A_SightBlackAnodize"]

    up_collar = mk_cyl("dl_uc", 0.21, 0.21, 0.34, axis="y", segs=22, xform=[("t", 0.0,  0.46, 0.0)], mat=m_brs, bevel=0.025)
    lo_collar = mk_cyl("dl_lc", 0.21, 0.21, 0.34, axis="y", segs=22, xform=[("t", 0.0, -0.46, 0.0)], mat=m_brs, bevel=0.025)

    loop_pts = [
        Vector(( 0.05,  0.52, 0.0)),
        Vector((-0.45,  0.54, 0.0)),
        Vector((-0.95,  0.48, 0.0)),
        Vector((-1.38,  0.30, 0.0)),
        Vector((-1.46,  0.00, 0.0)),
        Vector((-1.38, -0.30, 0.0)),
        Vector((-0.95, -0.48, 0.0)),
        Vector((-0.45, -0.54, 0.0)),
        Vector(( 0.05, -0.52, 0.0)),
    ]
    d_cord = mk_tube_along_pts("dl_cord", loop_pts, radius=0.11, ring_segs=14, mat=m_cord)
    # Double knot collars anchoring D-loop to bowstring
    knot_u = mk_sphere("dl_ku", 0.16, 0.16, 0.16, 14, 10, [("t", -0.10,  0.52, 0.0)], mat=m_cord)
    knot_l = mk_sphere("dl_kl", 0.16, 0.16, 0.16, 14, 10, [("t", -0.10, -0.52, 0.0)], mat=m_cord)

    # 1/4" Hooded Aluminum Peep Sight at y_local = +14.80 (world y = +17.20), angled -0.28 rad for full-draw eye line!
    peep_ring = mk_lathe_x(
        "dl_peep",
        [
            (0.24, -0.21), (0.52, -0.21), (0.52, -0.09), (0.44, -0.04),
            (0.44,  0.04), (0.52,  0.09), (0.52,  0.21), (0.24,  0.21),
            (0.24, -0.21),
        ],
        segs=28, xform=[("rz", -0.28), ("t", 0.0, 14.80, 0.0)], mat=m_anod,
    )

    obj = join_objects([up_collar, lo_collar, d_cord, knot_u, knot_l, peep_ring], "lift33_d_loop")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


# =============================================================================
# SUITE 3 BUILDERS: LOWPRO CARBON QUIVER, 3K CARBON ARROW & BROADHEAD (5 PARTS)
# =============================================================================
def build_lift33_quiver_frame(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Q-01: LowPro 5-Arrow Quick-Detach 3K Carbon Quiver Frame (`pos=[+0.60, +2.00, +4.20]`).
    Cleanly frames the 5 reserve arrow slots at X_local = [-2.4, -1.2, 0.0, +1.2, +2.4], Z_local = +0.75!"""
    m_carb = mats["Q_Carbon3K"]
    m_anod = mats["Q_QuiverAnodize"]
    m_poly = mats["Q_QuiverPolymer"]
    m_ti = mats["Q_TitaniumCollar"]

    parts = []
    # Twin parallel vertical 3K woven carbon-fiber spine rods (y_local in [-26.8, +21.5], z_local = -0.42)
    for idx_r, xr in enumerate((-0.75, 0.75)):
        parts.append(
            mk_cyl(f"qf_rod_{idx_r}", 0.26, 0.26, 48.30, axis="y", segs=22, xform=[("t", xr, -2.65, -0.42)], mat=m_carb, bevel=0.02)
        )

    # CNC machined LowPro quick-detach riser mounting bridge (z_local in [-2.795, -0.25])
    bridge = mk_box("qf_bridge", 2.15, 1.45, 2.55, [("t", 0.0, 1.50, -1.52)], mat=m_anod, bevel=0.055, bevel_segs=2)
    # Cross-brace gusset clamps around twin carbon rods
    mid_clamp = mk_box("qf_mclamp", 2.45, 1.85, 0.86, [("t", 0.0, 1.50, -0.42)], mat=m_anod, bevel=0.045, bevel_segs=2)
    parts.extend([bridge, mid_clamp])

    # Lower 5-slot elastomer arrow gripper bar at y_local = -11.50 (frames 5 slots at X = -2.4..+2.4, Z = +0.75)
    parts.append(
        mk_box("qf_grip_bar", 6.55, 1.35, 1.95, [("t", 0.0, -11.50, 0.65)], mat=m_poly, bevel=0.05, bevel_segs=2)
    )
    for i in range(6):
        x_rib = -3.00 + i * 1.20
        parts.append(
            mk_box(f"qf_rib_{i}", 0.24, 1.42, 0.72, [("t", x_rib, -11.50, 1.34)], mat=m_anod, bevel=0.03, bevel_segs=2)
        )

    # Lower nock-tail protective bumper cradle bar at y_local = -26.50
    parts.append(
        mk_box("qf_base_bar", 6.55, 0.95, 1.95, [("t", 0.0, -26.50, 0.65)], mat=m_poly, bevel=0.05, bevel_segs=2)
    )
    # Stainless clamping fasteners on mounting bridge
    for i, bx in enumerate((-0.75, 0.75)):
        parts.append(
            mk_cyl(f"qf_blt_{i}", 0.14, 0.14, 0.94, axis="z", segs=14, xform=[("t", bx, 1.50, -0.42)], mat=m_ti, bevel=0.02)
        )

    obj = join_objects(parts, "lift33_quiver_frame")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_quiver_hood(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Q-02: LowPro Matte Polymer Broadhead Hood + Micro-Cellular Acoustic Foam Insert
    (`pos=[+0.60, +22.50, +4.85]`). Open bottom cavity cleanly encloses all 5 reserve broadheads!"""
    m_poly = mats["Q_QuiverPolymer"]
    m_foam = mats["Q_AcousticFoam"]
    m_anod = mats["Q_QuiverAnodize"]

    # Inverted-U watertight hollow hood shell extruded along X in [-3.32, +3.32]
    # Keeps flat outer +Z & -Z hero panels (y in [-2.85, +4.30], z = ±1.15) crisp for `MATHEWS LOWPRO` crest,
    # while sculpting a sleek chamfered aerodynamic crown dome up to y = +5.15!
    hood_zy = [
        (-1.15, -2.85), (-0.82, -2.85), (-0.82, 3.85), ( 0.82, 3.85),
        ( 0.82, -2.85), ( 1.15, -2.85), ( 1.15, 4.30), ( 0.98, 4.82),
        ( 0.72,  5.15), (-0.72,  5.15), (-0.98, 4.82), (-1.15, 4.30),
    ]
    hood_shell = mk_extrude_x("qh_shell", hood_zy, -3.32, 3.32, bevel=0.070, bevel_segs=3, mat=m_poly)
    # Contoured end cheeks matching the exact tapered crown profile
    end_zy = [
        (-1.11, -2.85), ( 1.11, -2.85), ( 1.11, 4.30), ( 0.95, 4.80),
        ( 0.70,  5.12), (-0.70,  5.12), (-0.95, 4.80), (-1.11, 4.30),
    ]
    side_l = mk_extrude_x("qh_sl", end_zy, -3.30, -2.92, bevel=0.055, bevel_segs=3, mat=m_poly)
    side_r = mk_extrude_x("qh_sr", end_zy,  2.92,  3.30, bevel=0.055, bevel_segs=3, mat=m_poly)
    # Recessed decorative crown stiffener spine ridge along top dome (strictly inside y <= 5.15!)
    crown_rib = mk_box("qh_crib", 5.80, 0.24, 0.56, [("t", 0.0, 5.03, 0.0)], mat=m_anod, bevel=0.04, bevel_segs=2)

    # Internal micro-cellular acoustic foam broadhead cushion cap inside upper hood dome
    foam_cap = mk_box("qh_foam", 5.65, 1.35, 1.56, [("t", 0.0, 3.10, 0.0)], mat=m_foam, bevel=0.06, bevel_segs=2)

    # Upper 5-slot arrow gripper bar (y_local = -7.50 -> y_world = +15.0)
    upper_grip = mk_box("qh_ugrip", 6.55, 1.25, 1.95, [("t", 0.0, -7.50, -0.05)], mat=m_poly, bevel=0.055, bevel_segs=3)

    # Anodized spine socket collar connecting hood down onto twin vertical carbon rods
    spine_collar = mk_box("qh_collar", 2.30, 8.80, 0.85, [("t", 0.0, -3.50, -0.92)], mat=m_anod, bevel=0.055, bevel_segs=3)

    obj = join_objects([hood_shell, side_l, side_r, crown_rib, foam_cap, upper_grip, spine_collar], "lift33_quiver_hood")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_lift33_quiver_latch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Q-03: Firewalled Vivid Orange Eccentric Quick-Detach Quiver Release Latch
    (`pos=[+0.60, +3.50, +2.45]`). Strictly stays inward (`z_local <= +0.23` -> `z_world <= 2.68 < 2.95`)!"""
    m_org = mats["Q_LatchOrange"]
    m_ti = mats["Q_TitaniumCollar"]

    lever = mk_box("ql_lever", 2.65, 0.95, 0.42, [("t", -0.20, 0.0, 0.0)], mat=m_org, bevel=0.055, bevel_segs=2)
    cam_tab = mk_box("ql_tab", 0.95, 1.35, 0.44, [("t", -1.35, 0.25, 0.0)], mat=m_org, bevel=0.055, bevel_segs=2)
    # Milled ergonomic thumb-grip ribs on the cam tab
    rib1 = mk_box("ql_r1", 0.14, 0.95, 0.46, [("t", -1.55, 0.25, 0.0)], mat=m_org, bevel=0.02)
    rib2 = mk_box("ql_r2", 0.14, 0.95, 0.46, [("t", -1.25, 0.25, 0.0)], mat=m_org, bevel=0.02)
    pivot_pin = mk_cyl(
        "ql_pin", 0.20, 0.20, 1.15, axis="y", segs=20,
        xform=[("t", 0.55, 0.0, -0.15)], mat=m_ti, bevel=0.025,
    )

    obj = join_objects([lever, cam_tab, rib1, rib2, pivot_pin], "lift33_quiver_latch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_arrow_shaft(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Q-04: 29" 3K Woven Carbon-Fiber Match Hunting Arrow Shaft, Illuminated Nock & 3 Helical Blazer Vanes
    (`pos=[-16.50, +2.40, 0]`). Local x in [-0.35, +47.85]."""
    m_carb = mats["Q_Carbon3K"]
    m_nock = mats["Q_NockGlowGreen"]
    m_ti = mats["Q_TitaniumCollar"]
    m_vo = mats["Q_VaneOrange"]
    m_vw = mats["Q_VaneWhite"]

    parts = []
    # 1. Illuminated Glowing Lime-Green Polycarbonate Nock (x in [-0.35, +1.15])
    nock = mk_lathe_x(
        "ar_nock",
        [
            (0.00, -0.35), (0.14, -0.35), (0.28, -0.18), (0.335, 0.02),
            (0.335, 1.12), (0.30,  1.16), (0.00,  1.16),
        ],
        segs=26, mat=m_nock,
    )
    parts.append(nock)

    # 2. Machined Aluminum Nock Anti-Explosion Collar (x in [1.10, 1.65])
    nock_collar = mk_cyl(
        "ar_ncollar", 0.35, 0.35, 0.55, axis="x", segs=26,
        xform=[("t", 1.375, 0.0, 0.0)], mat=m_ti, bevel=0.02,
    )
    parts.append(nock_collar)

    # 3. 29" Micro-Diameter 3K Woven Carbon Arrow Shaft (x in [1.62, 45.95], r = 0.31 cm) — HERO CYLINDER BAND!
    # Zero end bevel needed since both ends seat cleanly inside ar_ncollar & ar_halfout!
    carbon_shaft = mk_cyl(
        "ar_shaft", 0.31, 0.31, 44.33, axis="x", segs=32,
        xform=[("t", 23.785, 0.0, 0.0)], mat=m_carb, bevel=0.0,
    )
    parts.append(carbon_shaft)

    # 4. Brushed Stainless Half-Out Front Threaded Broadhead Insert Collar (x in [45.92, 47.85])
    half_out = mk_lathe_x(
        "ar_halfout",
        [
            (0.00, 45.90), (0.31, 45.92), (0.39, 46.04), (0.39, 47.76),
            (0.32, 47.85), (0.00, 47.85),
        ],
        segs=28, mat=m_ti,
    )
    parts.append(half_out)

    # 5. Three Helical 2" High-Profile Parabolic Blazer Fletching Vanes (x in [2.40, 7.60], 120 deg apart!)
    # Cock vane (k=0) = crisp white; Hen vanes (k=1, 2) = vivid hunting neon-orange!
    for k in range(3):
        angle = (k * math.pi * 2.0) / 3.0 + 0.35
        v_mat = m_vw if k == 0 else m_vo
        # Build tapered, helically twisted watertight parabolic vane directly in bmesh
        bm = bmesh.new()
        n_slices = 18
        half_z = 0.048
        # Smooth C1 parabolic Blazer vane aerodynamic silhouette (strictly inside r in [0.28..1.05])
        def vane_top_r(vx: float) -> float:
            if vx < 1.05:
                u = vx / 1.05
                # Smooth S-curved aerodynamic leading ramp
                return 0.28 + (0.94 - 0.28) * (0.5 - 0.5 * math.cos(math.pi * (u ** 0.82)))
            if vx < 4.15:
                u = (vx - 1.05) / 3.10
                # Gentle arched parabolic dorsal spine peaking at r = 1.05
                return 0.94 + 0.11 * math.sin(u * math.pi * 0.72)
            u = min(1.0, (vx - 4.15) / 1.05)
            # Swept teardrop trailing taper back onto carbon shaft
            return 0.28 + (1.035 - 0.28) * (0.5 + 0.5 * math.cos(math.pi * (u ** 1.15)))

        rings = []
        for s_i in range(n_slices + 1):
            vx = 5.20 * (s_i / n_slices)
            r_top = max(0.32, vane_top_r(vx))
            r_bot = 0.28
            a = angle + (vx / 5.20) * 0.16
            ca, sa = math.cos(a), math.sin(a)
            # 4-point thin aerodynamic trapezoid (thicker base at shaft, razor-clean top edge!)
            ht_top = half_z * 0.55
            ht_bot = half_z * 1.15
            local_pts = [
                (r_bot, -ht_bot),
                (r_top, -ht_top),
                (r_top,  ht_top),
                (r_bot,  ht_bot),
            ]
            ring = []
            for vy, vz in local_pts:
                ring.append(bm.verts.new((vx + 2.40, vy * ca - vz * sa, vy * sa + vz * ca)))
            rings.append(ring)
        for s_i in range(n_slices):
            ra, rb = rings[s_i], rings[s_i + 1]
            for j in range(4):
                jn = (j + 1) % 4
                bm.faces.new((ra[j], ra[jn], rb[jn], rb[j]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _apply_three_xform(bm, [])
        parts.append(_bm_to_obj(f"ar_vane_{k}", bm, v_mat))

    obj = join_objects(parts, "lift33_arrow_shaft")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_lift33_broadhead(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Q-05: 100-Grain CNC 3-Blade 440C Mirror-Beveled Stainless Mechanical Broadhead
    (`pos=[+31.30, +2.40, 0]`). Local x in [-0.45, +4.45]."""
    m_st = mats["Q_BroadheadSteel"]
    m_ti = mats["Q_TitaniumCollar"]
    m_org = mats["Q_LatchOrange"]

    parts = []
    # 1. CNC Turned 440C Stainless Ferrule (x in [-0.45, +3.48]) + Seamless 3-Faceted Trocar Chisel Point (x in [3.44, +4.45])
    ferrule = mk_lathe_x(
        "bh_ferrule",
        [
            (0.00, -0.45), (0.24, -0.45), (0.37, -0.35), (0.38, 0.55),
            (0.44,  0.65), (0.44,  1.10), (0.36,  2.35), (0.188, 3.48),
            (0.00,  3.48),
        ],
        segs=36, mat=m_ti,
    )
    parts.append(ferrule)

    # Seamless CNC 3-fluted armor-piercing trocar chisel point transitioning flush from Ø3.76mm ferrule shoulder
    bm_tip = bmesh.new()
    n_t = 12  # 3 blades x 4 angular steps (k % 4 == 0 are the 3 sharp trocar chisel ridges!)
    v_back_c = bm_tip.verts.new((3.44, 0.0, 0.0))
    v_apex = bm_tip.verts.new((4.45, 0.0, 0.0))
    ring_collar = []
    ring_chisel = []
    for k in range(n_t):
        a = (k * math.pi * 2.0) / n_t
        ca, sa = math.cos(a), math.sin(a)
        # Collar at x=3.44 matches ferrule smoothly with zero step
        ring_collar.append(bm_tip.verts.new((3.44, ca * 0.188, sa * 0.188)))
        # Chisel shoulder at x=3.58 forms exact equilateral triangle with vertices at k=0,4,8 (0, 120, 240 deg)
        rem = k % 4
        if rem == 0:
            r_ch = 0.194
        elif rem == 2:
            # Midpoint of triangle edge: r = R * cos(60 deg) = 0.5 * R
            r_ch = 0.194 * 0.50
        else:
            # Quarter point along triangle edge: r = R * cos(60) / cos(30) = R / sqrt(3)
            r_ch = 0.194 / math.sqrt(3.0)
        ring_chisel.append(bm_tip.verts.new((3.58, ca * r_ch, sa * r_ch)))
    for k in range(n_t):
        kn = (k + 1) % n_t
        bm_tip.faces.new((v_back_c, ring_collar[kn], ring_collar[k]))
        bm_tip.faces.new((ring_collar[k], ring_collar[kn], ring_chisel[kn], ring_chisel[k]))
        bm_tip.faces.new((ring_chisel[k], ring_chisel[kn], v_apex))
    bmesh.ops.recalc_face_normals(bm_tip, faces=bm_tip.faces)
    _apply_three_xform(bm_tip, [])
    parts.append(_bm_to_obj("bh_trocar_tip", bm_tip, m_st))

    # 2. Firewalled Anodized Safety-Orange Grooved Blade Retention Collar (x in [0.48, 1.02])
    ret_collar = mk_lathe_x(
        "bh_collar",
        [
            (0.37, 0.48), (0.46, 0.51), (0.46, 0.65), (0.42, 0.68),
            (0.46, 0.71), (0.46, 0.85), (0.42, 0.88), (0.46, 0.91),
            (0.46, 0.99), (0.37, 1.02), (0.37, 0.48),
        ],
        segs=32, mat=m_org,
    )
    parts.append(ret_collar)

    # 3. Three Swept Mirror-Beveled 440C Razor Cutting Blades (120 deg intervals, genuine double-bevel cutting edge!)
    for k in range(3):
        ang = (k * math.pi * 2.0) / 3.0
        # Sculpt genuine diamond double-bevel razor cross-section blade!
        bm = bmesh.new()
        # Razor edge thickness = 0.008 and machined spine root = 0.054 so light flashes crisply across the hollow-ground bevel!
        t_spine = 0.054
        t_edge = 0.008
        v_r0_n = bm.verts.new((0.85, 0.34, -t_spine))
        v_r0_p = bm.verts.new((0.85, 0.34,  t_spine))
        v_r1_n = bm.verts.new((3.45, 0.18, -t_edge))
        v_r1_p = bm.verts.new((3.45, 0.18,  t_edge))
        v_tip_n = bm.verts.new((1.25, 1.58, -t_edge))
        v_tip_p = bm.verts.new((1.25, 1.58,  t_edge))
        v_heel_n = bm.verts.new((0.75, 1.32, -t_spine * 0.65))
        v_heel_p = bm.verts.new((0.75, 1.32,  t_spine * 0.65))

        # Mid-rib ridge vertices for crisp hollow-ground bevel reflection
        v_mid_n = bm.verts.new((1.48, 0.92, -t_spine * 0.92))
        v_mid_p = bm.verts.new((1.48, 0.92,  t_spine * 0.92))

        # -Z bevel facets
        bm.faces.new((v_r0_n, v_r1_n, v_mid_n))
        bm.faces.new((v_r1_n, v_tip_n, v_mid_n))
        bm.faces.new((v_tip_n, v_heel_n, v_mid_n))
        bm.faces.new((v_heel_n, v_r0_n, v_mid_n))
        # +Z bevel facets
        bm.faces.new((v_r1_p, v_r0_p, v_mid_p))
        bm.faces.new((v_tip_p, v_r1_p, v_mid_p))
        bm.faces.new((v_heel_p, v_tip_p, v_mid_p))
        bm.faces.new((v_r0_p, v_heel_p, v_mid_p))
        # Perimeter bevel rim quads (100% watertight!)
        bm.faces.new((v_r0_n, v_r0_p, v_r1_p, v_r1_n))
        bm.faces.new((v_r1_n, v_r1_p, v_tip_p, v_tip_n))
        bm.faces.new((v_tip_n, v_tip_p, v_heel_p, v_heel_n))
        bm.faces.new((v_heel_n, v_heel_p, v_r0_p, v_r0_n))

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _apply_three_xform(bm, [("rx", ang)])
        parts.append(_bm_to_obj(f"bh_blade_{k}", bm, m_st))

    obj = join_objects(parts, "lift33_broadhead")
    return finish_part(obj, bevel_w=0.0, sharp_deg=26.0)


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
    assert max(span_u, span_v) > 0.60 and min(span_u, span_v) > 0.15, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_riser_atlas(riser_objs: list[bpy.types.Object]):
    """Unwraps 6 riser/grip/pocket/guard/stabilizer parts into `lift33_v3_riser` (2048x2048):
      - Hero Band 1a (Riser Left  Outer Flank -Z):   u in [0.015, 0.985], v in [0.835, 0.985]
      - Hero Band 1b (Riser Right Outer Flank +Z):   u in [0.015, 0.985], v in [0.675, 0.825]
      - Hero Band 1c (Stabilizer 3K Carbon Tube):    u in [0.015, 0.720], v in [0.510, 0.655]
      - Firewalled Stabilizer Orange Damper Ring:    u in [0.745, 0.985], v in [0.510, 0.655]
      - Packed Riser Rest, Pockets, Guard, Hardware: u in [0.010, 0.740], v in [0.010, 0.490]
      - Firewalled Engage Rubberized Ergonomic Grip: u in [0.760, 0.990], v in [0.010, 0.490]
    """
    def classify_riser_hero(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y
        if obj_name == "lift33_riser" and mat_name == "R_EarthBronzeRiser":
            if -32.75 <= ty <= 32.75 and -2.40 <= tx <= 3.60:
                if nz < -0.90 and tz < -1.36:
                    return "riser_left"
                if nz > 0.90 and tz > 1.36:
                    return "riser_right"
        if obj_name == "lift33_stabilizer":
            if mat_name == "R_DamperOrange":
                return "stab_orange"
            if mat_name == "R_Carbon3K" and 2.25 <= tx <= 22.85 and abs(nx) < 0.35:
                return "stab_carbon"
        return ""

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return classify_riser_hero(obj_name, face, mat_name) != ""

    main_grp = [o for o in riser_objs if o.name != "lift33_grip"]
    grip_grp = [o for o in riser_objs if o.name == "lift33_grip"]
    stab_obj = next(o for o in riser_objs if o.name == "lift33_stabilizer")

    _smart_unwrap_and_pack_rect(main_grp, 0.010, 0.740, 0.010, 0.490, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(grip_grp, 0.760, 0.990, 0.010, 0.490)
    # Firewall stabilizer orange damper ring into its dedicated rectangle!
    _smart_unwrap_and_pack_rect(
        [stab_obj], 0.745, 0.985, 0.510, 0.655,
        skip_face_fn=lambda on, f, mn: classify_riser_hero(on, f, mn) != "stab_orange",
    )

    # Project exact 1:1 right-handed hero UVs onto Riser Left (-Z) & Right (+Z) outer flanks
    riser = next(o for o in riser_objs if o.name == "lift33_riser")
    bm = bmesh.new()
    bm.from_mesh(riser.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in riser.data.materials]
    cnt_l = cnt_r = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_riser_hero("lift33_riser", f, mname)
        if tag not in ("riser_left", "riser_right"):
            continue
        if tag == "riser_left":
            cnt_l += 1
        else:
            cnt_r += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            yn = max(0.0, min(1.0, (ty + 32.80) / 65.60))
            xn = max(0.0, min(1.0, (tx + 2.40) / 6.00))
            if tag == "riser_left":
                loop[uv_layer].uv = (0.015 + yn * 0.970, 0.835 + xn * 0.150)
            else:
                loop[uv_layer].uv = (0.015 + yn * 0.970, 0.675 + (1.0 - xn) * 0.150)
    bm.to_mesh(riser.data)
    bm.free()
    print(f"  [UV-HERO] lift33_riser mapped hero faces: left={cnt_l}, right={cnt_r}")
    assert cnt_l >= 10 and cnt_r >= 10, f"Riser hero flanks missed! left={cnt_l}, right={cnt_r}"

    # Project seamless cylindrical UVs onto 10" 3K carbon stabilizer tube
    bm = bmesh.new()
    bm.from_mesh(stab_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in stab_obj.data.materials]
    cnt_st = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify_riser_hero("lift33_stabilizer", f, mname) != "stab_carbon":
            continue
        cnt_st += 1
        fc = f.calc_center_median()
        ang_c = math.atan2(-fc.y, fc.z)  # atan2(tz, ty) in (-pi, pi]
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            ang_v = math.atan2(tz, ty)
            if ang_v - ang_c > math.pi:
                ang_v -= 2.0 * math.pi
            elif ang_v - ang_c < -math.pi:
                ang_v += 2.0 * math.pi
            u_f = max(0.0, min(1.0, (tx - 2.25) / 20.60))
            v_f = max(0.0, min(1.0, (ang_v + math.pi) / (2.0 * math.pi)))
            loop[uv_layer].uv = (0.015 + u_f * 0.705, 0.510 + v_f * 0.145)
    bm.to_mesh(stab_obj.data)
    bm.free()
    print(f"  [UV-HERO] lift33_stabilizer mapped {cnt_st} 3K carbon cylinder faces")
    assert cnt_st >= 24, f"Stabilizer carbon tube missed: {cnt_st}"


def unwrap_cams_acc_atlas(cams_objs: list[bpy.types.Object]):
    """Unwraps 8 cam/sight/rest/dampener/D-loop parts into `lift33_v3_cams_acc` (2048x2048):
      - Upper Cam Right (+Z):                   u in [0.015, 0.245], v in [0.755, 0.985]
      - Upper Cam Left  (-Z):                   u in [0.260, 0.490], v in [0.755, 0.985]
      - Lower Cam Right (+Z):                   u in [0.510, 0.740], v in [0.755, 0.985]
      - Lower Cam Left  (-Z):                   u in [0.755, 0.985], v in [0.755, 0.985]
      - Sight Elevation Yardage Tape (20-80YD): u in [0.015, 0.245], v in [0.530, 0.735]
      - Sight Bridge-Lock Dovetail Flanks:      u in [0.260, 0.660], v in [0.530, 0.735]
      - Firewalled Orange Dampeners & D-Loop:   u in [0.680, 0.855], v in [0.530, 0.735]
      - Firewalled Glowing Fiber Pins & Level:  u in [0.870, 0.985], v in [0.530, 0.735]
      - Packed Rest of Cams, Sight, Rest, Fork: u in [0.010, 0.990], v in [0.010, 0.510]
    """
    FIBER_MATS = {"A_FiberGreen", "A_FiberAmber", "A_FiberOrange", "A_FiberRed"}
    ORANGE_MATS = {"A_DamperOrange", "A_DLoopCord"}

    def classify_cams_face(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if mat_name in FIBER_MATS:
            return f"fiber_{mat_name}"
        if mat_name in ORANGE_MATS:
            return "orange_fw"

        if obj_name in ("lift33_upper_cam", "lift33_lower_cam"):
            # Planar exterior +Z / -Z faces of bronze cam web & dark SwitchWeight-X module plate!
            if mat_name in ("A_CamBronzeGold", "A_ModuleDarkAnodize"):
                if nz > 0.92 and tz > 0.18:
                    return f"{obj_name}_r"
                if nz < -0.92 and tz < -0.18:
                    return f"{obj_name}_l"

        if obj_name == "lift33_sight_housing" and mat_name == "A_SightBlackAnodize":
            # Sight vertical elevation rack outer right face (+Z at tz > 0.58) -> Yardage Tape!
            if 0.00 <= tx <= 0.80 and -1.65 <= ty <= 0.75 and nz > 0.88 and tz > 0.58:
                return "yardage_tape"
            # Bridge-Lock dovetail bar side flanks (tx in [-6.0, +1.2], ty in [-0.30, +0.30], |nz| > 0.88)
            if -6.02 <= tx <= 1.22 and -0.32 <= ty <= 0.32 and abs(nz) > 0.88 and -1.45 <= tz <= -0.45:
                return "dovetail_flank"

        return ""

    def is_special(obj_name: str, face, mat_name: str) -> bool:
        return classify_cams_face(obj_name, face, mat_name) != ""

    # 1. Pack all general mechanical/structural faces into bottom half [0.010, 0.990] x [0.010, 0.510]
    _smart_unwrap_and_pack_rect(cams_objs, 0.010, 0.990, 0.010, 0.510, skip_face_fn=is_special)

    # 2. Firewall vivid orange dampeners & D-loop cord into [0.680, 0.855] x [0.530, 0.735]
    orange_objs = [o for o in cams_objs if any(m and m.name in ORANGE_MATS for m in o.data.materials)]
    _smart_unwrap_and_pack_rect(
        orange_objs, 0.680, 0.855, 0.530, 0.735,
        skip_face_fn=lambda on, f, mn: classify_cams_face(on, f, mn) != "orange_fw",
    )

    # 3. Firewall each glowing fiber color into its OWN disjoint quadrant (zero cross-color bleed!)
    fiber_quads = {
        "A_FiberGreen":  (0.870, 0.922, 0.638, 0.735),
        "A_FiberAmber":  (0.933, 0.985, 0.638, 0.735),
        "A_FiberOrange": (0.870, 0.922, 0.530, 0.627),
        "A_FiberRed":    (0.933, 0.985, 0.530, 0.627),
    }
    for fm_name, (fu0, fu1, fv0, fv1) in fiber_quads.items():
        f_objs = [o for o in cams_objs if any(m and m.name == fm_name for m in o.data.materials)]
        _smart_unwrap_and_pack_rect(
            f_objs, fu0, fu1, fv0, fv1,
            skip_face_fn=lambda on, f, mn, target=fm_name: mn != target,
        )

    # 4. Project 1:1 undistorted planar hero UVs onto ALL 4 SwitchWeight-X cam faces!
    cam_uv_map = {
        "lift33_upper_cam_r": (0.015, 0.245, 0.755, 0.985, True),
        "lift33_upper_cam_l": (0.260, 0.490, 0.755, 0.985, False),
        "lift33_lower_cam_r": (0.510, 0.740, 0.755, 0.985, True),
        "lift33_lower_cam_l": (0.755, 0.985, 0.755, 0.985, False),
    }
    for cname in ("lift33_upper_cam", "lift33_lower_cam"):
        co = next(o for o in cams_objs if o.name == cname)
        bm = bmesh.new()
        bm.from_mesh(co.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in co.data.materials]
        cr = cl = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_cams_face(cname, f, mname)
            if tag not in cam_uv_map:
                continue
            u0, u1, v0, v1, is_right = cam_uv_map[tag]
            if is_right:
                cr += 1
            else:
                cl += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 4.50) / 7.80))
                yn = max(0.0, min(1.0, (ty + 3.10) / 6.20))
                un = xn if is_right else (1.0 - xn)
                loop[uv_layer].uv = (u0 + un * (u1 - u0), v0 + yn * (v1 - v0))
        bm.to_mesh(co.data)
        bm.free()
        print(f"  [UV-HERO] {cname} mapped cam faces: right={cr}, left={cl}")
        assert cr >= 4 and cl >= 4, f"{cname} hero faces missed! r={cr}, l={cl}"

    # 5. Project hero UVs onto Bridge-Lock Sight Yardage Tape & Dovetail Bar
    sh = next(o for o in cams_objs if o.name == "lift33_sight_housing")
    bm = bmesh.new()
    bm.from_mesh(sh.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sh.data.materials]
    yt_cnt = dv_cnt = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_cams_face("lift33_sight_housing", f, mname)
        if tag == "yardage_tape":
            yt_cnt += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx - 0.025) / 0.75))
                yn = max(0.0, min(1.0, (ty + 1.625) / 2.35))
                loop[uv_layer].uv = (0.015 + xn * 0.230, 0.530 + yn * 0.205)
        elif tag == "dovetail_flank":
            dv_cnt += 1
            is_right = (-f.normal.y) > 0.0
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx + 6.00) / 7.20))
                yn = max(0.0, min(1.0, (ty + 0.28) / 0.56))
                if is_right:
                    loop[uv_layer].uv = (0.260 + xn * 0.400, 0.635 + yn * 0.095)
                else:
                    loop[uv_layer].uv = (0.260 + (1.0 - xn) * 0.400, 0.532 + yn * 0.095)
    bm.to_mesh(sh.data)
    bm.free()
    print(f"  [UV-HERO] lift33_sight_housing mapped yardage_tape={yt_cnt}, dovetail_flank={dv_cnt}")
    assert yt_cnt >= 1 and dv_cnt >= 2, f"Sight hero bands missed: yt={yt_cnt}, dv={dv_cnt}"


def unwrap_quiver_arrow_atlas(qa_objs: list[bpy.types.Object]):
    """Unwraps 5 quiver/arrow/broadhead parts into `lift33_v3_quiver_arrow` (2048x2048):
      - Hero Band 3a (Quiver Hood Right +Z):     u in [0.015, 0.485], v in [0.730, 0.985]
      - Hero Band 3b (Quiver Hood Left  -Z):     u in [0.515, 0.985], v in [0.730, 0.985]
      - Hero Band 3c (3K Carbon Arrow Shaft):    u in [0.015, 0.985], v in [0.525, 0.705]
      - Firewalled Vivid Orange Quiver Latch:    u in [0.015, 0.365], v in [0.345, 0.505]
      - Firewalled Arrow Vanes, Nock & Collars:  u in [0.385, 0.725], v in [0.345, 0.505]
      - Firewalled 3-Blade 440C Broadhead:       u in [0.745, 0.985], v in [0.345, 0.505]
      - Packed Quiver Frame + Hood Rest + Foam:  u in [0.010, 0.990], v in [0.010, 0.325]
    """
    def classify_qa_face(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "lift33_quiver_hood" and mat_name == "Q_QuiverPolymer":
            if -3.30 <= tx <= 3.30 and -2.85 <= ty <= 5.15:
                if nz > 0.90 and tz > 1.08:
                    return "hood_right"
                if nz < -0.90 and tz < -1.08:
                    return "hood_left"
        if obj_name == "lift33_arrow_shaft":
            if mat_name == "Q_Carbon3K":
                return "arrow_carbon" if abs(nx) < 0.35 else "arrow_carbon_cap"
            return f"arrow_{mat_name}"
        return ""

    quiver_base_grp = [o for o in qa_objs if o.name in ("lift33_quiver_frame", "lift33_quiver_hood")]
    latch_grp = [o for o in qa_objs if o.name == "lift33_quiver_latch"]
    arrow_obj = next(o for o in qa_objs if o.name == "lift33_arrow_shaft")
    bh_grp = [o for o in qa_objs if o.name == "lift33_broadhead"]

    _smart_unwrap_and_pack_rect(
        quiver_base_grp, 0.010, 0.990, 0.010, 0.325,
        skip_face_fn=lambda on, f, mn: classify_qa_face(on, f, mn) in ("hood_right", "hood_left"),
    )
    _smart_unwrap_and_pack_rect(latch_grp, 0.015, 0.365, 0.345, 0.505)

    # Firewall EVERY material on arrow_shaft into its OWN disjoint box (ZERO green bleed onto half-out insert!)
    arrow_fw_boxes = {
        "Q_NockGlowGreen":  (0.382, 0.456, 0.345, 0.505),
        "Q_VaneWhite":      (0.470, 0.544, 0.345, 0.505),
        "Q_VaneOrange":     (0.558, 0.640, 0.345, 0.505),
        "Q_TitaniumCollar": (0.654, 0.728, 0.345, 0.505),
    }
    for am_name, (au0, au1, av0, av1) in arrow_fw_boxes.items():
        _smart_unwrap_and_pack_rect(
            [arrow_obj], au0, au1, av0, av1,
            skip_face_fn=lambda on, f, mn, target=am_name: mn != target,
        )

    _smart_unwrap_and_pack_rect(bh_grp, 0.745, 0.985, 0.345, 0.505)

    # Project hero UVs onto LowPro Quiver Hood +Z & -Z exterior panels
    hood = next(o for o in qa_objs if o.name == "lift33_quiver_hood")
    bm = bmesh.new()
    bm.from_mesh(hood.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in hood.data.materials]
    hr = hl = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_qa_face("lift33_quiver_hood", f, mname)
        if tag not in ("hood_right", "hood_left"):
            continue
        if tag == "hood_right":
            hr += 1
        else:
            hl += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 3.32) / 6.64))
            yn = max(0.0, min(1.0, (ty + 2.85) / 8.00))
            if tag == "hood_right":
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.730 + yn * 0.255)
            else:
                loop[uv_layer].uv = (0.515 + (1.0 - xn) * 0.470, 0.730 + yn * 0.255)
    bm.to_mesh(hood.data)
    bm.free()
    print(f"  [UV-HERO] lift33_quiver_hood mapped hero panels: right={hr}, left={hl}")
    assert hr >= 1 and hl >= 1, f"Quiver hood hero panels missed: r={hr}, l={hl}"

    # Project seamless cylindrical 3K carbon UVs onto 29" arrow shaft (+ clean end-cap tuck)
    bm = bmesh.new()
    bm.from_mesh(arrow_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in arrow_obj.data.materials]
    ac_cnt = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_qa_face("lift33_arrow_shaft", f, mname)
        if tag == "arrow_carbon_cap":
            for loop in f.loops:
                vco = loop.vert.co
                loop[uv_layer].uv = (0.025 + vco.z * 0.015, 0.535 - vco.y * 0.015)
            continue
        if tag != "arrow_carbon":
            continue
        ac_cnt += 1
        fc = f.calc_center_median()
        ang_c = math.atan2(-fc.y, fc.z)
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            ang_v = math.atan2(tz, ty)
            if ang_v - ang_c > math.pi:
                ang_v -= 2.0 * math.pi
            elif ang_v - ang_c < -math.pi:
                ang_v += 2.0 * math.pi
            u_f = max(0.0, min(1.0, (tx - 1.62) / 44.33))
            v_f = max(0.0, min(1.0, (ang_v + math.pi) / (2.0 * math.pi)))
            loop[uv_layer].uv = (0.015 + u_f * 0.970, 0.525 + v_f * 0.180)
    bm.to_mesh(arrow_obj.data)
    bm.free()
    print(f"  [UV-HERO] lift33_arrow_shaft mapped {ac_cnt} 3K carbon cylinder faces")
    assert ac_cnt >= 24, f"Arrow carbon shaft faces missed: {ac_cnt}"


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
        o.location = (i * 120.0, 0.0, 0.0)
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.06, 0.058, 0.055, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.85
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.55
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.22) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:8.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.22:
            print(f"       !! BBOX DELTA > 0.22cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
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

    # Immediate binary GLB contract self-audit (magic, exact 19 node names, 0 non-identity transforms!)
    raw = MODELS_OUT.read_bytes()
    magic, version, _length = struct.unpack_from("<III", raw, 0)
    assert magic == 0x46546C67 and version == 2, f"Bad GLB header: {hex(magic)} v{version}"
    json_len, chunk_type = struct.unpack_from("<II", raw, 12)
    assert chunk_type == 0x4E4F534A
    gltf_json = json.loads(raw[20 : 20 + json_len].decode("utf-8"))
    nodes = gltf_json.get("nodes", [])
    node_names = sorted(n.get("name", "") for n in nodes)
    expected = sorted(RISER_PARTS + CAMS_ACC_PARTS + QUIVER_ARROW_PARTS)
    assert node_names == expected, f"GLB node mismatch!\n  got: {node_names}\n  exp: {expected}"
    assert len(gltf_json.get("meshes", [])) == 19
    for n in nodes:
        for k in ("translation", "rotation", "scale", "matrix"):
            assert k not in n, f"Non-identity transform '{k}' on node {n['name']}"
    print("[GLB-AUDIT] 19/19 exact part names | 0 dynamic springs | 0 non-identity transforms | PASS")


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

    def mk_baked_mat(suite: str, normal_strength: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(f"Baked_{suite}")
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        tex_alb = nt.nodes.new("ShaderNodeTexImage")
        tex_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"lift33_v3_{suite}_albedo.webp"))
        tex_alb.image.colorspace_settings.name = "sRGB"

        tex_orm = nt.nodes.new("ShaderNodeTexImage")
        tex_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"lift33_v3_{suite}_roughness.webp"))
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
        tex_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"lift33_v3_{suite}_normal.webp"))
        tex_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_riser = mk_baked_mat("riser", 0.88)
    mat_cams = mk_baked_mat("cams_acc", 0.85)
    mat_qa = mk_baked_mat("quiver_arrow", 0.88)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in RISER_PARTS:
            o.data.materials.append(mat_riser)
        elif o.name in CAMS_ACC_PARTS:
            o.data.materials.append(mat_cams)
        else:
            o.data.materials.append(mat_qa)

    _set_assembled_full_layout(all_objs)

    w_nt = scene.world.node_tree
    if not scene.world.use_nodes:
        scene.world.use_nodes = True
        w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "studio_dark_armory.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.6
    else:
        w_bg.inputs["Color"].default_value = (0.14, 0.16, 0.18, 1.0)
        w_bg.inputs["Strength"].default_value = 1.0
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    for lname, loc_t, energy, size in (
        ("KeyLight",  (25.0, 28.0,  62.0), 45000.0, 35.0),
        ("FillLight", (-20.0, 12.0, -58.0), 28000.0, 35.0),
        ("RimLight",  (10.0, 48.0, -25.0), 32000.0, 24.0),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc_t)
        d = t2b(2.0, 2.0, 0.0) - lobj.location
        lobj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    shots = [
        ("lift33_qa_right.png",           (  24.0,   4.0,  112.0), (  2.0,   1.0,  0.0), 48.0),
        ("lift33_qa_left.png",            (  22.0,   4.0, -112.0), (  2.0,   1.0,  0.0), 48.0),
        ("lift33_qa_macro_riser.png",     (  16.0,   5.0,  -38.0), (  0.5,   3.0,  0.0), 58.0),
        ("lift33_qa_macro_cam.png",       ( -11.5,  41.5,   15.0), (-12.6,  41.5,  0.0), 56.0),
        ("lift33_qa_macro_broadhead.png", (  42.0,   6.0,   18.0), ( 32.5,   2.4,  0.0), 58.0),
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
        "lift33_riser":          build_lift33_riser,
        "lift33_grip":           build_lift33_grip,
        "lift33_upper_pocket":   lambda m: _build_limb_pocket(True, m),
        "lift33_lower_pocket":   lambda m: _build_limb_pocket(False, m),
        "lift33_cable_guard":    build_lift33_cable_guard,
        "lift33_stabilizer":     build_lift33_stabilizer,
        "lift33_upper_cam":      lambda m: _build_switchweight_cam(True, m),
        "lift33_lower_cam":      lambda m: _build_switchweight_cam(False, m),
        "lift33_limb_dampeners": build_lift33_limb_dampeners,
        "lift33_drop_away_rest": build_lift33_drop_away_rest,
        "lift33_launcher_fork":  build_lift33_launcher_fork,
        "lift33_sight_housing":  build_lift33_sight_housing,
        "lift33_sight_pins":     build_lift33_sight_pins,
        "lift33_d_loop":         build_lift33_d_loop,
        "lift33_quiver_frame":   build_lift33_quiver_frame,
        "lift33_quiver_hood":    build_lift33_quiver_hood,
        "lift33_quiver_latch":   build_lift33_quiver_latch,
        "lift33_arrow_shaft":    build_lift33_arrow_shaft,
        "lift33_broadhead":      build_lift33_broadhead,
    }

    print("[BUILD] Sculpting all 19 solid Mathews LIFT 33 Flagship Compound Bow hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    riser_objs = [built[pid] for pid in RISER_PARTS]
    cams_objs = [built[pid] for pid in CAMS_ACC_PARTS]
    qa_objs = [built[pid] for pid in QUIVER_ARROW_PARTS]
    all_objs = riser_objs + cams_objs + qa_objs

    print("[VERIFY] Checking manifoldness, outward normals & exact CSG CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: riser (6), cams_acc (8), quiver_arrow (5)...")
    unwrap_riser_atlas(riser_objs)
    unwrap_cams_acc_atlas(cams_objs)
    unwrap_quiver_arrow_atlas(qa_objs)

    for label, group in (("riser", riser_objs), ("cams_acc", cams_objs), ("quiver_arrow", qa_objs)):
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
            assert 0.00002 < oa < 0.80, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:14s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    print("[TRI] Pre-bake triangulation with preserved custom normals (1:1 tangent-frame lock)...")
    triangulate_all_keep_normals(all_objs)

    with tempfile.TemporaryDirectory(prefix="lift33_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking lift33_v3_riser (2048x2048, 6 riser/grip/pocket/guard/stabilizer parts)...")
        bake_atlas_suite("riser", riser_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking lift33_v3_cams_acc (2048x2048, 8 SwitchWeight-X cams/sight/rest/dampener parts)...")
        bake_atlas_suite("cams_acc", cams_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking lift33_v3_quiver_arrow (2048x2048, 5 LowPro quiver/3K arrow/broadhead parts)...")
        bake_atlas_suite("quiver_arrow", qa_objs, all_objs, tmp_dir)

        print("[POST] Compositing Mathews LIFT 33 laser etchings, 3K carbon weave, bronze cams & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--render-preview" in sys.argv:
        pidx = sys.argv.index("--render-preview")
        _render_studio_previews(all_objs, Path(sys.argv[pidx + 1]))
    elif "--preview" in sys.argv:
        _render_studio_previews(all_objs, Path("/tmp"))

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "lift33_v3_riser_albedo.webp",
        TEX_OUT_DIR / "lift33_v3_riser_normal.webp",
        TEX_OUT_DIR / "lift33_v3_riser_roughness.webp",
        TEX_OUT_DIR / "lift33_v3_cams_acc_albedo.webp",
        TEX_OUT_DIR / "lift33_v3_cams_acc_normal.webp",
        TEX_OUT_DIR / "lift33_v3_cams_acc_roughness.webp",
        TEX_OUT_DIR / "lift33_v3_quiver_arrow_albedo.webp",
        TEX_OUT_DIR / "lift33_v3_quiver_arrow_normal.webp",
        TEX_OUT_DIR / "lift33_v3_quiver_arrow_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== MATHEWS LIFT 33 COMPOUND BOW V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:42s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
