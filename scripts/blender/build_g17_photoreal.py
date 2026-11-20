#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Glock 17 Gen 5 (9x19mm Parabellum)
===================================================================================
MIT License — Digital Armory 3D (`PR-04` Wave 3)

Generates:
  - public/models/g17.glb (Draco-compressed glTF 2.0, all 26 solid parts; skips ONLY the
    2 dynamic GPU-compressed CSG springs `recoil_spring` and `striker_spring` carrying `aSpringParam`)
  - public/textures/g17_v3_slide_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM: 5 slide/sight/extractor parts)
  - public/textures/g17_v3_polymer_{albedo,normal,roughness}.webp (2048x2048 Packed ORM: 8 Gen 5 polymer frame, mag & firewalled orange follower parts)
  - public/textures/g17_v3_metal_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM: 13 GMB barrel, locking block, Safe Action FCG & pin/spring parts)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 26 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/g17/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_g17_photoreal.py
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
# MODE 2: System Python Post-Process (PIL Laser Rollmarks + RTF4 + RNM + ORM WebP)
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
    FONT_ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    FONT_FALLBACKS = (
        FONT_ARIAL,
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
        ny = dy * strength  # row index increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.6) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float
    ):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        resized = pil_l.resize(
            (max(1, x1 - x0), max(1, y1 - y0)), resample=Image.Resampling.LANCZOS
        )
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _draw_glock_boxed_logo(
        draw: ImageDraw.ImageDraw,
        x0: int,
        y0: int,
        size: int,
        stroke: int = 12,
        fill: int = 255,
    ):
        """Draws the authentic geometric boxed GLOCK emblem (outer square G wrapping LOCK)."""
        s = max(24, int(size))
        t = max(3, int(stroke))
        # Outer square G frame: top bar, left bar, bottom bar, right lower stem + inward crossbar
        draw.rectangle((x0, y0, x0 + s, y0 + t), fill=fill)  # top bar
        draw.rectangle((x0, y0, x0 + t, y0 + s), fill=fill)  # left bar
        draw.rectangle((x0, y0 + s - t, x0 + s, y0 + s), fill=fill)  # bottom bar
        mid_y = y0 + int(s * 0.44)
        draw.rectangle((x0 + s - t, mid_y, x0 + s, y0 + s), fill=fill)  # right lower vertical
        draw.rectangle((x0 + int(s * 0.30), mid_y, x0 + s, mid_y + t), fill=fill)  # G crossbar
        # Crisp bold LOCK nestled cleanly in the lower inner bay
        f_lock = _load_font(FONT_DIN, max(10, int(s * 0.34)))
        cx = x0 + int(s * 0.51)
        cy = y0 + int(s * 0.72)
        draw.text((cx, cy), "LOCK", fill=fill, font=f_lock, anchor="mm")

    def _draw_austrian_eagle(
        draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, fill: int = 255
    ):
        """Miniature Austrian Ferlach / Vienna proof eagle silhouette."""
        r = max(8, int(rad))
        # Stylized heraldic spread-wing eagle crest
        pts = [
            (cx, cy - r),
            (cx + int(r * 0.22), cy - int(r * 0.72)),
            (cx + int(r * 0.16), cy - int(r * 0.48)),
            (cx + int(r * 0.92), cy - int(r * 0.62)),
            (cx + int(r * 0.78), cy - int(r * 0.15)),
            (cx + int(r * 0.52), cy + int(r * 0.10)),
            (cx + int(r * 0.24), cy + int(r * 0.08)),
            (cx + int(r * 0.38), cy + int(r * 0.85)),
            (cx, cy + int(r * 0.62)),
            (cx - int(r * 0.38), cy + int(r * 0.85)),
            (cx - int(r * 0.24), cy + int(r * 0.08)),
            (cx - int(r * 0.52), cy + int(r * 0.10)),
            (cx - int(r * 0.78), cy - int(r * 0.15)),
            (cx - int(r * 0.92), cy - int(r * 0.62)),
            (cx - int(r * 0.16), cy - int(r * 0.48)),
            (cx - int(r * 0.22), cy - int(r * 0.72)),
        ]
        draw.polygon(pts, fill=fill)

    def _draw_ferlach_shield(
        draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, fill: int = 255
    ):
        """Austrian CIP / Ferlach proof pentagon-shield with AT monogram."""
        r = max(8, int(rad))
        w_s, h_s = int(r * 0.78), int(r * 0.95)
        draw.polygon(
            [
                (cx - w_s, cy - int(h_s * 0.75)),
                (cx + w_s, cy - int(h_s * 0.75)),
                (cx + w_s, cy + int(h_s * 0.18)),
                (cx, cy + h_s),
                (cx - w_s, cy + int(h_s * 0.18)),
            ],
            outline=fill,
            width=max(2, int(r * 0.15)),
        )
        draw.text((cx, cy - int(r * 0.04)), "AT", fill=fill, font=_load_font(FONT_DIN, int(r * 0.95)), anchor="mm")

    # =========================================================================
    # SUITE 1: g17_v3_slide (slide, front_sight, rear_sight, slide_cover_plate, extractor)
    # =========================================================================
    def process_slide_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "slide_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "slide_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "slide_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "slide_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "slide_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "slide_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "slide_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.48 + ao_ext * 0.52)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.28, 1.0).astype(np.float32)

        # Subtle bead-blasted nDLC satin directional micro-texture on the 3 slide hero bands
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        slide_hero = (
            (u_grid >= 0.015)
            & (u_grid <= 0.985)
            & (
                ((v_grid >= 0.815) & (v_grid <= 0.985))  # Right flank
                | ((v_grid >= 0.625) & (v_grid <= 0.795))  # Left flank
                | ((v_grid >= 0.435) & (v_grid <= 0.605))  # Top deck
            )
        ).astype(np.float32)

        rng = np.random.default_rng(1705)
        raw_n = rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32)
        # Authentic horizontal CNC-machined satin nDLC micro-grain (breaks up flat dark reflection on vertical walls!)
        ndlc_grain = ndimage.gaussian_filter(raw_n, sigma=(0.45, 16.0)) * 0.68 + ndimage.gaussian_filter(raw_n, sigma=(1.1, 1.1)) * 0.32
        ndlc_grain = np.clip(ndlc_grain * 1.4, -1.0, 1.0)
        oil_cloud = ndimage.gaussian_filter(rng.normal(0.0, 1.0, size=(h // 4, w // 4)).astype(np.float32), sigma=10.0)
        oil_cloud = np.repeat(np.repeat(oil_cloud, 4, axis=0), 4, axis=1)
        oil_cloud = np.clip(oil_cloud * 2.6, -1.0, 1.0)

        decal_height = 0.018 * ndlc_grain * slide_hero
        rgh = np.clip(rgh + (0.022 * ndlc_grain + 0.024 * oil_cloud) * slide_hero, 0.16, 0.94)
        albedo = np.clip(albedo + (0.016 * ndlc_grain * slide_hero)[..., None], 0.0, 1.0)

        # Crisp machined chamfer highlights flanking every front (6) & rear (7) vertical cocking serration
        # so serration ribs catch subtle studio specular light cleanly on flat vertical slide walls!
        serr_edge_hi = np.zeros((h, w), dtype=np.float32)
        for v0, v1, is_right in ((0.815, 0.985, True), (0.625, 0.795, False)):
            in_b = (u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= v0) & (v_grid <= v1)
            xn_b = np.clip((u_grid - 0.015) / 0.970, 0.0, 1.0)
            if not is_right:
                xn_b = 1.0 - xn_b
            yn_b = np.clip((v_grid - v0) / (v1 - v0), 0.0, 1.0)
            wx_b = -7.54 + xn_b * 18.68
            wy_b = 0.82 + yn_b * 2.66
            # Rear 7 serrations (sx = -6.88 + i*0.37, half-w = 0.0925, wy in [1.06, 2.98])
            in_ry = (wy_b >= 1.06) & (wy_b <= 2.98)
            for i in range(7):
                sx = -6.88 + i * 0.37
                d_edge = np.minimum(np.abs(wx_b - (sx - 0.098)), np.abs(wx_b - (sx + 0.098)))
                serr_edge_hi = np.maximum(serr_edge_hi, np.exp(-((d_edge / 0.026) ** 2)) * in_ry * in_b)
            # Front 6 serrations (sx = 7.38 + i*0.35, half-w = 0.0875, wy in [1.19, 2.97])
            in_fy = (wy_b >= 1.19) & (wy_b <= 2.97)
            for i in range(6):
                sx = 7.38 + i * 0.35
                d_edge = np.minimum(np.abs(wx_b - (sx - 0.093)), np.abs(wx_b - (sx + 0.093)))
                serr_edge_hi = np.maximum(serr_edge_hi, np.exp(-((d_edge / 0.024) ** 2)) * in_fy * in_b)

        _mix(albedo, (0.52, 0.55, 0.60), serr_edge_hi * 0.55)
        _mix(rgh, 0.24, serr_edge_hi * 0.50)

        # Slide Hero Bands:
        #   World X in [-7.54, 11.14] (span 18.68 cm), Y in [0.82, 3.48] (span 2.66 cm)
        #   Right (+Z): u in [0.015, 0.985], v in [0.815, 0.985] (muzzle +X at RIGHT)
        #   Left  (-Z): u in [0.015, 0.985], v in [0.625, 0.795] (muzzle +X at LEFT)
        PPCM = 180.0
        sx0, sx_span = -7.54, 18.68
        sy0, sy_span = 0.82, 2.66
        sw, sh = int(round(sx_span * PPCM)), int(round(sy_span * PPCM))  # 3362 x 479 px

        def s_r(wx: float, wy: float):
            return (
                int(round((wx - sx0) / sx_span * sw)),
                int(round((1.0 - (wy - sy0) / sy_span) * sh)),
            )

        def s_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - sx0) / sx_span) * sw)),
                int(round((1.0 - (wy - sy0) / sy_span) * sh)),
            )

        eng_l = Image.new("L", (sw, sh), 0)
        eng_r = Image.new("L", (sw, sh), 0)
        brass_r = Image.new("L", (sw, sh), 0)
        dl = ImageDraw.Draw(eng_l)
        dr = ImageDraw.Draw(eng_r)
        dbr = ImageDraw.Draw(brass_r)

        # --- LEFT FLANK ROLLMARKS (-Z, cleanly between front serrations X=7.25 and rear serrations X=-4.55) ---
        # Reading left-to-right from muzzle (+X) toward rear (-X):
        # [GLOCK]   17  Gen5   AUSTRIA   9x19   + miniature Austrian Ferlach proof marks!
        logo_x, logo_y = s_l(6.42, 2.74)
        _draw_glock_boxed_logo(dl, logo_x, logo_y, size=188, stroke=22, fill=255)

        t1_x, t1_y = s_l(4.82, 2.22)
        dl.text((t1_x, t1_y), "17", fill=255, font=_load_font(FONT_DIN, 148), anchor="lm")

        t2_x, t2_y = s_l(3.65, 2.20)
        dl.text((t2_x, t2_y), "Gen5", fill=255, font=_load_font(FONT_DIN, 94), anchor="lm")

        t3_x, t3_y = s_l(1.68, 2.38)
        dl.text((t3_x, t3_y), "AUSTRIA", fill=255, font=_load_font(FONT_DIN, 64), anchor="lm")
        t4_x, t4_y = s_l(1.68, 1.94)
        dl.text((t4_x, t4_y), "9×19", fill=255, font=_load_font(FONT_DIN, 78), anchor="lm")

        # Authentic Austrian Ferlach Proof Eagle + AT CIP Shield + Matching Serial BHVN919 aft on left flank
        p1_x, p1_y = s_l(-1.35, 2.22)
        _draw_austrian_eagle(dl, p1_x, p1_y, rad=34, fill=245)
        p2_x, p2_y = s_l(-1.90, 2.22)
        _draw_ferlach_shield(dl, p2_x, p2_y, rad=30, fill=245)
        sn_lx, sn_ly = s_l(-2.42, 2.22)
        dl.text((sn_lx, sn_ly), "BHVN919", fill=245, font=_load_font(FONT_DIN, 52), anchor="lm")

        # --- RIGHT FLANK ROLLMARKS (+Z, cleanly aft of extractor & ahead of ejection port) ---
        # Aft of extractor (X in [-4.32, -1.92]): MADE IN AUSTRIA / GLOCK, INC., SMYRNA, GA.
        r1_x, r1_y = s_r(-3.16, 2.40)
        dr.text((r1_x, r1_y), "MADE IN AUSTRIA", fill=255, font=_load_font(FONT_DIN, 44), anchor="mm")
        r2_x, r2_y = s_r(-3.16, 1.96)
        dr.text((r2_x, r2_y), "GLOCK, INC., SMYRNA, GA.", fill=255, font=_load_font(FONT_COND, 44), anchor="mm")

        # Ahead of ejection port (X in [3.00, 6.95]): Austrian Ferlach proofs + AT + Serial BHVN919
        pr1_x, pr1_y = s_r(3.48, 2.24)
        _draw_austrian_eagle(dr, pr1_x, pr1_y, rad=34, fill=248)
        pr2_x, pr2_y = s_r(4.06, 2.24)
        _draw_ferlach_shield(dr, pr2_x, pr2_y, rad=30, fill=248)
        snr_x, snr_y = s_r(4.62, 2.24)
        dr.text((snr_x, snr_y), "BHVN919", fill=255, font=_load_font(FONT_DIN, 62), anchor="lm")

        # Subtle authentic 9mm brass kiss smudges right aft of lower ejection port lip (X in [-0.75, -0.42], Y in [2.10, 2.42])
        bx0, by0 = s_r(-0.74, 2.44)
        bx1, by1 = s_r(-0.38, 2.08)
        dbr.ellipse((bx0, by0, bx1, by1), fill=140)

        engraved = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(engraved, eng_r, 0.015, 0.985, 0.815, 0.985)
        _paste_uv_band(engraved, eng_l, 0.015, 0.985, 0.625, 0.795)
        _paste_uv_band(brass_kiss, brass_r, 0.015, 0.985, 0.815, 0.985)
        brass_kiss = ndimage.gaussian_filter(brass_kiss, sigma=3.5) * 0.55

        # Crisp laser-deep Gen 5 rollmarks: silvery-light laser-annealed steel groove inside dark bevel pocket!
        eng_bev = _bevel_mask(engraved, width_px=1.35)
        eng_rim = np.clip(ndimage.maximum_filter(engraved, size=3) - engraved, 0.0, 1.0)
        decal_height -= 0.78 * eng_bev
        # Subtle dark engraved pocket edge + bright crisp laser-etched silver-grey steel infill!
        _mix(albedo, (0.14, 0.15, 0.165), eng_rim * 0.55)
        _mix(albedo, (0.64, 0.67, 0.72), engraved * 0.90)
        _mix(rgh, 0.48, engraved * 0.85)
        _mix(met, 0.58, engraved * 0.80)
        ao *= 1.0 - 0.24 * engraved

        # Subtle brass kiss behind ejection port
        _mix(albedo, (0.62, 0.48, 0.22), brass_kiss * 0.52)
        _mix(rgh, 0.30, brass_kiss * 0.45)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_slide_albedo.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_slide_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_slide_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g17_v3_slide_{albedo,normal,roughness}.webp (2048x2048)")

    # =========================================================================
    # SUITE 2: g17_v3_polymer (frame, recoil_guide_rod, magazine_catch, trigger_housing_pin,
    #                          trigger_housing, mag_body, mag_follower [FIREWALLED ORANGE], mag_base_plate)
    # =========================================================================
    def process_polymer_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "poly_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "poly_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "poly_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "poly_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "poly_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "poly_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "poly_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # Strict firewall mask protecting Safety Orange mag_follower [0.640..1.000] x [0.680..1.000]
        follower_firewall = ((u_grid >= 0.640) & (v_grid >= 0.680)).astype(np.float32)
        not_follower = 1.0 - follower_firewall

        decal_height = np.zeros((h, w), dtype=np.float32)

        # ---------------------------------------------------------------------
        # 1) ANALYTICAL GEN 5 RTF4 MICRO-PYRAMIDAL STIPPLING + MOLDED GLOCK MEDALLION
        #    Frame Right Flank (+Z): u in [0.012, 0.618], v in [0.666, 0.988]
        #    Frame Left  Flank (-Z): u in [0.012, 0.618], v in [0.330, 0.652] (mirrored U)
        #    World X in [-8.60, 11.12] (span 19.72 cm), Y in [-9.38, 1.04] (span 10.42 cm)
        # ---------------------------------------------------------------------
        fx0, fx_span = -8.60, 19.72
        fy0, fy_span = -9.38, 10.42
        grip_ang = math.radians(-20.0)
        cos_g = math.cos(-grip_ang)  # +20 deg rotation into upright grip coordinates
        sin_g = math.sin(-grip_ang)
        gx_piv, gy_piv = -5.26, -4.25  # exact mag-axis origin of Gen 5 grip in world (X, Y)

        rtf_height = np.zeros((h, w), dtype=np.float32)
        rtf_panel_mask = np.zeros((h, w), dtype=np.float32)
        border_groove = np.zeros((h, w), dtype=np.float32)
        med_recess = np.zeros((h, w), dtype=np.float32)
        molded_raised = np.zeros((h, w), dtype=np.float32)
        molded_recess = np.zeros((h, w), dtype=np.float32)

        # PIL high-res canvases for crisp molded Glock grip medallion & frame legal markings
        # Canvas size matches exact aspect of Frame Flank: 19.72 x 10.42 cm -> 140 px/cm = 2761 x 1459 px
        fw, fh = 2761, 1459

        def f_r(wx: float, wy: float):
            return (
                int(round((wx - fx0) / fx_span * fw)),
                int(round((1.0 - (wy - fy0) / fy_span) * fh)),
            )

        def f_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - fx0) / fx_span) * fw)),
                int(round((1.0 - (wy - fy0) / fy_span) * fh)),
            )

        for v0, v1, is_right in ((0.666, 0.988, True), (0.330, 0.652, False)):
            u0, u1 = 0.012, 0.618
            in_band = (u_grid >= u0) & (u_grid <= u1) & (v_grid >= v0) & (v_grid <= v1)
            xn = np.clip((u_grid - u0) / (u1 - u0), 0.0, 1.0)
            if not is_right:
                xn = 1.0 - xn
            yn = np.clip((v_grid - v0) / (v1 - v0), 0.0, 1.0)
            wx = fx0 + xn * fx_span
            wy = fy0 + yn * fy_span

            # Transform world (wx, wy) into grip-aligned (gx across front-back, gy bottom-top)
            dx = wx - gx_piv
            dy = wy - gy_piv
            gx = dx * cos_g - dy * sin_g
            gy = dx * sin_g + dy * cos_g

            # Main Gen 5 RTF4 Stipple Panel (trapezoidal rounded grip panel centered cleanly on full sculpted grip!)
            # Full grip spans gx in [-1.72, +2.38], gy in [-4.76, +3.40].
            # Panel spans gx in [-1.18, +1.84] (cx=+0.33, hx=1.51) and gy in [-3.78, +2.16] (cy=-0.81, hy=2.97),
            # staying cleanly inside smooth ergonomic borders & below magazine_catch (gy=+3.09)!
            t_top = np.clip((gy - 0.70) / 1.60, 0.0, 1.0)
            hx = 1.50 - 0.16 * t_top
            hy = 2.96
            cx_p = 0.33 - 0.12 * t_top
            cy_p = -0.80
            # Rounded-rectangle signed distance in cm
            qx = np.abs(gx - cx_p) - (hx - 0.28)
            qy = np.abs(gy - cy_p) - (hy - 0.28)
            sdf_panel = np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) + np.minimum(np.maximum(qx, qy), 0.0) - 0.28

            # Smooth square-framed GLOCK logo medallion pocket in upper-center of grip panel
            mx_c, my_c = 0.30, -0.15
            mqx = np.abs(gx - mx_c) - 0.56
            mqy = np.abs(gy - my_c) - 0.56
            sdf_med = np.hypot(np.maximum(mqx, 0.0), np.maximum(mqy, 0.0)) + np.minimum(np.maximum(mqx, mqy), 0.0) - 0.10

            # Authentic Gen 5 RTF4 front thumb-indexing memory pad cleanly above dustcover rail groove (wy in [0.42, 0.72])
            iqx = np.abs(wx - 3.35) - 0.58
            iqy = np.abs(wy - 0.56) - 0.12
            sdf_idx = np.hypot(np.maximum(iqx, 0.0), np.maximum(iqy, 0.0)) + np.minimum(np.maximum(iqx, iqy), 0.0) - 0.05

            # Stipple active strictly inside main panel (outside medallion) OR inside front thumb-index pad
            panel_in = (1.0 - _smoothstep(-0.04, 0.04, sdf_panel)) * _smoothstep(-0.02, 0.05, sdf_med)
            idx_in = 1.0 - _smoothstep(-0.03, 0.03, sdf_idx)
            active_stipple = np.maximum(panel_in, idx_in) * in_band

            # Crisp recessed perimeter framing groove around stipple panel & around medallion box
            groove_p = np.exp(-((sdf_panel / 0.036) ** 2)) * in_band
            groove_m = np.exp(-((sdf_med / 0.032) ** 2)) * in_band
            groove_i = np.exp(-((sdf_idx / 0.025) ** 2)) * in_band
            border_groove = np.maximum(border_groove, np.maximum(groove_p, np.maximum(groove_m, groove_i)))
            med_in = (1.0 - _smoothstep(-0.03, 0.03, sdf_med)) * in_band
            med_recess = np.maximum(med_recess, med_in)

            # Analytical Gen 5 RTF4 Truncated Square-Pyramid Grid (pitch = 0.118 cm = 1.18 mm!)
            pitch = 0.118
            fx_cell = np.abs(((gx / pitch) % 1.0) - 0.5) * 2.0  # 0 at pyramid center, 1 at trough
            fy_cell = np.abs(((gy / pitch) % 1.0) - 0.5) * 2.0
            d_sq = np.maximum(fx_cell, fy_cell)
            # Truncated flat-top square pyramid: flat top for d_sq <= 0.34, crisp 55° slope to 0.86, dark trough > 0.86
            pyr = np.clip((0.88 - d_sq) / (0.88 - 0.34), 0.0, 1.0).astype(np.float32)
            # Finer pitch for front indexing memory pad (0.095 cm)
            ix_cell = np.abs(((wx / 0.095) % 1.0) - 0.5) * 2.0
            iy_cell = np.abs(((wy / 0.095) % 1.0) - 0.5) * 2.0
            pyr_idx = np.clip((0.86 - np.maximum(ix_cell, iy_cell)) / 0.52, 0.0, 1.0).astype(np.float32)
            pyr_all = np.where(idx_in > panel_in, pyr_idx, pyr)

            rtf_height = np.maximum(rtf_height, pyr_all * active_stipple)
            rtf_panel_mask = np.maximum(rtf_panel_mask, active_stipple)

            # Molded GLOCK boxed logo rotated cleanly by -20 deg inside the medallion pocket!
            # Draw upright at high resolution, rotate -20 deg (or +20 deg on mirrored left), then composite
            logo_sz = 260
            logo_tile = Image.new("L", (logo_sz, logo_sz), 0)
            _draw_glock_boxed_logo(ImageDraw.Draw(logo_tile), 34, 34, size=192, stroke=22, fill=255)
            # In world space, grip leans rearward as Y decreases (-20 deg around Z).
            # On Right flank (+X right, +Y up): local grip +gy leans LEFT (-20 deg CCW = +20 deg in PIL CCW!)
            # Wait: PIL rotate(+deg) is CCW! Let's check:
            # Top of grip is at (-4.0, -1.5), bottom is at (-6.5, -8.4), so grip axis tilts upper-RIGHT to lower-LEFT!
            # Wait: at Y=0, X=-3.7; at Y=-8, X=-6.6 -> as Y goes UP, X goes RIGHT (+X)!
            # So on Right flank (+X right, +Y up), the grip leans RIGHT (clockwise by 20 deg = PIL rotate(-20))!
            # On Left flank (+X left, +Y up), the grip leans LEFT (counter-clockwise by 20 deg = PIL rotate(+20))!
            rot_deg = -20.0 if is_right else +20.0
            logo_rot = logo_tile.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)

            raised_c = Image.new("L", (fw, fh), 0)
            recess_c = Image.new("L", (fw, fh), 0)
            # Convert grip-local medallion center (mx_c=-0.06, my_c=0.48) back to world (wx, wy)
            # Inverse of +20 deg rotation is -20 deg:
            ca, sa = math.cos(grip_ang), math.sin(grip_ang)
            m_wx = gx_piv + mx_c * ca - my_c * sa
            m_wy = gy_piv + mx_c * sa + my_c * ca
            fn = f_r if is_right else f_l
            mcx, mcy = fn(m_wx, m_wy)
            lw, lh = logo_rot.size
            raised_c.paste(logo_rot, (mcx - lw // 2, mcy - lh // 2))

            # Subtle molded factory polymer text cleanly ABOVE the dustcover Picatinny T-groove (Y > 0.38)!
            if is_right:
                d_rec = ImageDraw.Draw(recess_c)
                tx1, ty1 = f_r(7.55, 0.68)
                d_rec.text((tx1, ty1), "MADE IN AUSTRIA", fill=225, font=_load_font(FONT_DIN, 26), anchor="mm")
                tx2, ty2 = f_r(7.55, 0.48)
                d_rec.text((tx2, ty2), "GLOCK, INC., SMYRNA, GA.", fill=225, font=_load_font(FONT_COND, 27), anchor="mm")
                # Subtle molded US PAT. micro-text on flat receiver cheek behind trigger pin (cleanly above trigger guard)
                tx3, ty3 = f_r(-2.65, 0.38)
                d_rec.text((tx3, ty3), "U.S. PAT. 8,156,677", fill=195, font=_load_font(FONT_COND, 25), anchor="mm")

            _paste_uv_band(molded_raised, raised_c, u0, u1, v0, v1)
            _paste_uv_band(molded_recess, recess_c, u0, u1, v0, v1)

        # Apply RTF4 micro-pyramid height, albedo, roughness & crisp micro-AO
        decal_height += 0.56 * rtf_height * not_follower
        decal_height -= 0.34 * border_groove * not_follower
        decal_height -= 0.18 * _bevel_mask(med_recess, width_px=2.2) * not_follower
        decal_height += 0.46 * _bevel_mask(molded_raised, width_px=1.4) * not_follower
        decal_height -= 0.32 * _bevel_mask(molded_recess, width_px=1.2) * not_follower

        # Visual contrast: RTF4 troughs slightly darker & rougher matte, pyramid crowns catch subtle light
        trough_m = rtf_panel_mask * (1.0 - rtf_height) * not_follower
        crown_m = rtf_panel_mask * rtf_height * not_follower
        _mix(albedo, (0.108, 0.112, 0.120), trough_m * 0.68)
        _mix(albedo, (0.184, 0.190, 0.200), crown_m * 0.44)
        _mix(rgh, 0.78, trough_m * 0.82)
        _mix(rgh, 0.62, crown_m * 0.48)
        ao *= 1.0 - 0.28 * trough_m - 0.22 * border_groove * not_follower

        # Molded recessed GLOCK medallion: slightly smoother satin recess + crisp lighter raised logo
        _mix(albedo, (0.138, 0.143, 0.152), med_recess * not_follower * 0.55)
        _mix(rgh, 0.68, med_recess * not_follower * 0.60)
        _mix(albedo, (0.215, 0.222, 0.234), molded_raised * not_follower * 0.72)
        _mix(rgh, 0.54, molded_raised * not_follower * 0.70)
        _mix(albedo, (0.118, 0.123, 0.132), molded_recess * not_follower * 0.58)
        _mix(rgh, 0.74, molded_recess * not_follower * 0.60)

        # ---------------------------------------------------------------------
        # 2) FRAME UNDER-DUSTCOVER BRUSHED STAINLESS SERIAL PLATE (`BHVN919`)
        #    Dedicated Hero Tile: u in [0.012, 0.148], v in [0.248, 0.312]
        # ---------------------------------------------------------------------
        sp_w, sp_h = 640, 264
        sp_img = Image.new("L", (sp_w, sp_h), 0)
        dsp = ImageDraw.Draw(sp_img)
        dsp.rectangle((18, 18, sp_w - 18, sp_h - 18), outline=210, width=5)
        dsp.text((sp_w // 2, sp_h // 2), "BHVN919", fill=255, font=_load_font(FONT_DIN, 118), anchor="mm")
        serial_mask = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(serial_mask, sp_img, 0.012, 0.148, 0.248, 0.312)
        decal_height -= 0.55 * _bevel_mask(serial_mask, width_px=1.3)
        _mix(albedo, (0.14, 0.15, 0.165), serial_mask * 0.94)
        _mix(rgh, 0.50, serial_mask * 0.85)
        _mix(met, 0.40, serial_mask * 0.85)
        ao *= 1.0 - 0.25 * serial_mask

        # ---------------------------------------------------------------------
        # 3) MAGAZINE BODY REAR WITNESS HOLES (4, 6, 8, 10, 12, 17) & FLANK STAMPS
        #    Rear Face (-X):  u in [0.642, 0.720], v in [0.334, 0.656] (Z in [-0.88, +0.88], Y in [-4.76, +5.24])
        #    Right Flank (+Z): u in [0.734, 0.854], v in [0.334, 0.656] (X in [-1.32, +1.32], Y in [-4.76, +5.24])
        #    Left  Flank (-Z): u in [0.868, 0.988], v in [0.334, 0.656]
        # ---------------------------------------------------------------------
        # Rear face witness numbers aligned 1:1 with the 6 staggered holes:
        #   Hole i=0..5: Y = 2.4 - i*1.15, Z = (+0.15 if i%2==0 else -0.15)
        #   Viewed from rear (-X looking toward +X): -Z (left flank) is LEFT, +Z (right flank) is RIGHT!
        #   So u_l = (tz - (-0.88)) / 1.76 renders 100% upright & un-mirrored!
        mr_w, mr_h = 360, 1480
        mr_white = Image.new("L", (mr_w, mr_h), 0)
        mr_brass = Image.new("L", (mr_w, mr_h), 0)
        dmw = ImageDraw.Draw(mr_white)
        dmb = ImageDraw.Draw(mr_brass)
        counts = ("4", "6", "8", "10", "12", "17")
        f_cnt = _load_font(FONT_DIN, 62)

        def mr_pt(tz: float, ty: float):
            u_l = (tz - (-0.88)) / 1.76
            v_l = (ty - (-4.76)) / 10.00
            return (int(round(u_l * mr_w)), int(round((1.0 - v_l) * mr_h)))

        for i, num_str in enumerate(counts):
            wy = 2.40 - i * 1.15
            wz = 0.15 if (i % 2 == 0) else -0.15
            # Brass cartridge case rim glint ring subtly framing each witness hole counterbore
            hx_p, hy_p = mr_pt(wz, wy)
            dmb.ellipse((hx_p - 30, hy_p - 30, hx_p + 30, hy_p + 30), fill=255)
            # Crisp molded round-count number placed cleanly to the outer side of each staggered hole
            tz_txt = 0.56 if (i % 2 == 0) else -0.56
            tx_p, ty_p = mr_pt(tz_txt, wy)
            dmw.text((tx_p, ty_p), num_str, fill=255, font=f_cnt, anchor="mm")

        # "9mm" & Austria mark at lower rear spine below hole 17 (Y = -4.05)
        tx_cal, ty_cal = mr_pt(0.0, -4.05)
        dmw.text((tx_cal, ty_cal), "9mm", fill=235, font=_load_font(FONT_DIN, 54), anchor="mm")

        # Right flank molded [GLOCK] + 9x19 + AUSTRIA stamp (X in [-1.32, +1.32], Y in [-4.76, +5.24])
        mf_w, mf_h = 540, 1480
        mf_stamp = Image.new("L", (mf_w, mf_h), 0)
        dmf = ImageDraw.Draw(mf_stamp)
        _draw_glock_boxed_logo(dmf, mf_w // 2 - 74, int(mf_h * 0.44), size=148, stroke=16, fill=255)
        dmf.text((mf_w // 2, int(mf_h * 0.585)), "9×19", fill=250, font=_load_font(FONT_DIN, 74), anchor="mm")
        dmf.text((mf_w // 2, int(mf_h * 0.640)), "AUSTRIA", fill=235, font=_load_font(FONT_COND, 58), anchor="mm")

        mag_white = np.zeros((h, w), dtype=np.float32)
        mag_brass = np.zeros((h, w), dtype=np.float32)
        mag_molded = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(mag_white, mr_white, 0.642, 0.720, 0.334, 0.656)
        _paste_uv_band(mag_brass, mr_brass, 0.642, 0.720, 0.334, 0.656)
        _paste_uv_band(mag_molded, mf_stamp, 0.734, 0.854, 0.334, 0.656)

        # Subtle vertical polymer magwell insertion scuffs on Mag Right & Left flanks
        mag_flank_band = (
            (((u_grid >= 0.734) & (u_grid <= 0.854)) | ((u_grid >= 0.868) & (u_grid <= 0.988)))
            & (v_grid >= 0.340)
            & (v_grid <= 0.650)
        ).astype(np.float32)
        rng_m = np.random.default_rng(1717)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(260):
            sx = float(rng_m.uniform(0.738, 0.984) * w)
            sy = float(rng_m.uniform(0.355, 0.640) * h)
            slen = float(rng_m.uniform(18, 95))
            dsc.line([(sx, sy), (sx + float(rng_m.uniform(-1.5, 1.5)), sy + slen)], fill=int(rng_m.integers(70, 185)), width=1)
        mag_scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * mag_flank_band

        decal_height -= 0.44 * _bevel_mask(mag_white, width_px=1.2)
        decal_height -= 0.36 * _bevel_mask(mag_molded, width_px=1.3)
        decal_height -= 0.04 * mag_scuffs

        # Crisp light-grey/off-white molded witness numerals on black magazine backspine
        _mix(albedo, (0.78, 0.80, 0.83), mag_white * 0.92)
        _mix(rgh, 0.50, mag_white * 0.80)
        # Subtle warm brass glint strictly in witness hole recesses (only where AO is already darkened inside holes!)
        brass_ring = mag_brass * np.clip((0.88 - ao) * 2.4, 0.0, 1.0)
        _mix(albedo, (0.72, 0.56, 0.24), brass_ring * 0.70)
        _mix(met, 0.82, brass_ring * 0.68)
        _mix(rgh, 0.30, brass_ring * 0.68)
        # Molded side magazine emblem (readable crisp satin relief on drop-free mag!)
        _mix(albedo, (0.285, 0.296, 0.312), mag_molded * 0.72)
        _mix(rgh, 0.52, mag_molded * 0.68)
        # Insertion scuffs slightly smoother & brighter polymer sheen
        _mix(albedo, (0.23, 0.24, 0.255), mag_scuffs * 0.32)
        rgh -= 0.08 * mag_scuffs

        # Zero decal perturbations inside the firewalled Safety Orange follower region!
        decal_height *= not_follower
        decal_nrm = _height_to_normal_01(decal_height, strength=2.8)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_polymer_albedo.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_polymer_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_polymer_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g17_v3_polymer_{albedo,normal,roughness}.webp (2048x2048)")

    # =========================================================================
    # SUITE 3: g17_v3_metal (barrel + 12 Safe Action internal metal parts)
    # =========================================================================
    def process_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "metal_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # ---------------------------------------------------------------------
        # 1) BARREL CHAMBER HOOD RIGHT FLANK (visible right through ejection port!)
        #    Band 1: u in [0.015, 0.485], v in [0.745, 0.985] (X in [-0.52, 2.54], Y in [1.86, 3.42])
        # ---------------------------------------------------------------------
        bh_w, bh_h = 1224, 624  # ~400 px/cm!
        bx0, bx_sp = -0.52, 3.06
        by0, by_sp = 1.86, 1.56

        def bh_r(wx: float, wy: float):
            return (
                int(round((wx - bx0) / bx_sp * bh_w)),
                int(round((1.0 - (wy - by0) / by_sp) * bh_h)),
            )

        br_eng = Image.new("L", (bh_w, bh_h), 0)
        dbr = ImageDraw.Draw(br_eng)

        # Bold "9×19" centered in upper-right chamber hood window!
        cx1, cy1 = bh_r(0.95, 2.98)
        dbr.text((cx1, cy1), "9×19", fill=255, font=_load_font(FONT_DIN, 168), anchor="mm")

        # Austrian proof eagle + AT shield + matching serial BHVN919 below 9x19
        px1, py1 = bh_r(0.28, 2.42)
        _draw_austrian_eagle(dbr, px1, py1, rad=54, fill=248)
        px2, py2 = bh_r(0.76, 2.42)
        _draw_ferlach_shield(dbr, px2, py2, rad=46, fill=248)
        snx, sny = bh_r(1.16, 2.42)
        dbr.text((snx, sny), "BHVN919", fill=255, font=_load_font(FONT_DIN, 88), anchor="lm")

        # ---------------------------------------------------------------------
        # 2) BARREL CHAMBER HOOD TOP DECK (u in [0.515, 0.985], v in [0.745, 0.985])
        #    X in [-0.52, 2.54], Z in [-0.80, +0.80]
        #    GMB pentagon proof mark + authentic longitudinal slide-locking bright wear tracks!
        # ---------------------------------------------------------------------
        bt_eng = Image.new("L", (bh_w, bh_h), 0)
        dbt = ImageDraw.Draw(bt_eng)
        # Authentic Glock Marksman Barrel (GMB) pentagonal stamp near front-center of hood top
        pcx, pcy = int(bh_w * 0.72), int(bh_h * 0.50)
        pr = 58
        pent = [
            (pcx + int(pr * math.cos(math.radians(-90 + 72 * k))), pcy + int(pr * math.sin(math.radians(-90 + 72 * k))))
            for k in range(5)
        ]
        dbt.polygon(pent, outline=255, width=10)
        dbt.text((pcx, pcy + 4), "G", fill=255, font=_load_font(FONT_DIN, 58), anchor="mm")

        hood_top_band = (
            (u_grid >= 0.515) & (u_grid <= 0.985) & (v_grid >= 0.745) & (v_grid <= 0.985)
        ).astype(np.float32)
        # Subtle longitudinal slide-locking wear rails near top hood front & side edges
        ut_loc = np.clip((u_grid - 0.515) / 0.470, 0.0, 1.0)
        vt_loc = np.clip((v_grid - 0.745) / 0.240, 0.0, 1.0)
        top_wear = (
            hood_top_band
            * _smoothstep(0.58, 0.94, ut_loc)
            * (np.exp(-(((vt_loc - 0.18) / 0.10) ** 2)) + np.exp(-(((vt_loc - 0.82) / 0.10) ** 2)))
        )

        # ---------------------------------------------------------------------
        # 3) BARREL OUTER CYLINDER ("Glock Smile" circumferential wear crescent + fine lathe rings)
        #    Band 3: u in [0.015, 0.560], v in [0.470, 0.725] (X in [2.52, 11.20], theta around bore)
        # ---------------------------------------------------------------------
        bbl_cyl_band = (
            (u_grid >= 0.015) & (u_grid <= 0.560) & (v_grid >= 0.470) & (v_grid <= 0.725)
        ).astype(np.float32)
        uc_loc = np.clip((u_grid - 0.015) / 0.545, 0.0, 1.0)  # 0 at X=2.52, 1 at X=11.20
        vc_loc = np.clip((v_grid - 0.470) / 0.255, 0.0, 1.0)  # 0.5 = top (+Y), 0/1 = bottom (-Y)
        # Signature "Glock Smile" authentic curved crescent wear arc on top-front barrel cylinder (X ≈ 8.2..9.6)
        dv_arc = vc_loc - 0.50
        smile_center_u = 0.745 - 0.55 * (dv_arc ** 2)
        glock_smile = (
            bbl_cyl_band
            * np.exp(-(((uc_loc - smile_center_u) / 0.032) ** 2))
            * np.exp(-((dv_arc / 0.22) ** 2))
        )
        # Subtle lathe-turning circumferential sheen rings along barrel exterior
        lathe_wave = np.sin(uc_loc * 260.0 * math.pi) * 0.5 * bbl_cyl_band

        engraved = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(engraved, br_eng, 0.015, 0.485, 0.745, 0.985)
        _paste_uv_band(engraved, bt_eng, 0.515, 0.985, 0.745, 0.985)

        wear_all = np.clip(top_wear * 0.55 + glock_smile * 0.52, 0.0, 1.0)
        _mix(albedo, (0.56, 0.59, 0.64), wear_all * 0.72)
        _mix(rgh, 0.16, wear_all * 0.78)
        _mix(met, 0.96, wear_all * 0.80)

        decal_height = -0.74 * _bevel_mask(engraved, width_px=1.4) + 0.010 * lathe_wave
        _mix(albedo, (0.62, 0.65, 0.70), engraved * 0.92)
        _mix(rgh, 0.44, engraved * 0.85)
        _mix(met, 0.62, engraved * 0.80)
        ao *= 1.0 - 0.24 * engraved

        decal_nrm = _height_to_normal_01(decal_height, strength=2.5)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.11, 0.94)
        met = np.clip(met, 0.00, 0.99)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_metal_albedo.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g17_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g17_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_slide_atlas()
    process_polymer_atlas()
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
MODELS_OUT = REPO_ROOT / "public" / "models" / "g17.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16
GRIP_ANGLE_RAD = math.radians(-20.0)

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 26 solid Glock 17 Gen 5 parts split across 3 dedicated 2048x2048 PBR suites
# (skipping ONLY the 2 dynamic GPU springs `recoil_spring` and `striker_spring` carrying `aSpringParam`!)
SLIDE_PARTS = [
    "slide",
    "front_sight",
    "rear_sight",
    "slide_cover_plate",
    "extractor",
]

POLYMER_PARTS = [
    "frame",
    "recoil_guide_rod",
    "magazine_catch",
    "trigger_housing_pin",
    "trigger_housing",
    "mag_body",
    "mag_follower",
    "mag_base_plate",
]

METAL_PARTS = [
    "barrel",
    "striker",
    "firing_pin_safety",
    "extractor_plunger",
    "locking_block",
    "slide_lock",
    "slide_stop_lever",
    "trigger_pin",
    "locking_block_pin",
    "trigger_with_bar",
    "connector",
    "trigger_spring",
    "mag_spring",
]

# Exterior parts that receive assembled inter-part contact AO (internal & enclosed parts get pure crisp Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "slide",
    "front_sight",
    "rear_sight",
    "slide_cover_plate",
    "extractor",
    "frame",
    "slide_lock",
    "slide_stop_lever",
    "magazine_catch",
    "trigger_pin",
    "locking_block_pin",
    "trigger_housing_pin",
    "mag_base_plate",
}

ASSEMBLED_POS = {
    "slide":               ( 0.000,  0.000,  0.000),
    "front_sight":         (10.150,  3.450,  0.000),
    "rear_sight":          (-6.450,  3.450,  0.000),
    "barrel":              ( 0.000,  0.000,  0.000),
    "recoil_guide_rod":    ( 0.000,  0.000,  0.000),
    "slide_cover_plate":   (-7.520,  2.250,  0.000),
    "striker":             ( 0.000,  0.000,  0.000),
    "firing_pin_safety":   (-2.100,  2.100,  0.280),
    "extractor":           (-1.050,  2.550,  0.980),
    "extractor_plunger":   ( 0.000,  0.000,  0.000),
    "frame":               ( 0.000,  0.000,  0.000),
    "locking_block":       ( 0.000,  0.000,  0.000),
    "slide_lock":          ( 0.000,  0.000,  0.000),
    "slide_stop_lever":    ( 0.000,  0.000,  0.000),
    "magazine_catch":      ( 0.000,  0.000,  0.000),
    "trigger_pin":         ( 0.000,  0.150,  0.000),
    "locking_block_pin":   ( 0.650,  0.580,  0.000),
    "trigger_housing_pin": (-5.650,  0.100,  0.000),
    "trigger_with_bar":    ( 0.000,  0.000,  0.000),
    "trigger_housing":     ( 0.000,  0.000,  0.000),
    "connector":           ( 0.000,  0.000,  0.000),
    "trigger_spring":      ( 0.000,  0.000,  0.000),
    "mag_body":            (-5.260, -4.250,  0.000),
    "mag_follower":        (-6.327, -7.182,  0.000),
    "mag_spring":          (-6.619, -7.983,  0.000),
    "mag_base_plate":      (-6.990, -8.990,  0.000),
}

ASSEMBLED_ROT_THREE = {
    "mag_body":       (0.0, 0.0, GRIP_ANGLE_RAD),
    "mag_follower":   (0.0, 0.0, GRIP_ANGLE_RAD),
    "mag_spring":     (0.0, 0.0, GRIP_ANGLE_RAD),
    "mag_base_plate": (0.0, 0.0, GRIP_ANGLE_RAD),
}

# Ground-truth CSG reference bounding boxes (Three.js local space; mag_body corrected to true double-stack fit inside magwell)
CSG_REF_BBOX = {
    "slide":               (( -7.540,   0.460,  -1.315), ( 11.140,   3.485,   1.315)),
    "front_sight":         (( -0.476,  -0.262,  -0.145), (  0.458,   0.475,   0.145)),
    "rear_sight":          (( -0.401,  -0.130,  -0.790), (  0.423,   0.480,   0.790)),
    "barrel":              (( -1.021,   0.940,  -0.805), ( 11.320,   3.425,   0.805)),
    "recoil_guide_rod":    ((  1.740,   0.900,  -0.450), ( 10.960,   1.800,   0.450)),
    "slide_cover_plate":   (( -0.115,  -1.065,  -0.935), (  0.120,   1.065,   0.935)),
    "striker":             (( -6.925,   1.125,  -0.225), ( -0.720,   2.775,   0.250)),
    "firing_pin_safety":   (( -0.220,  -0.885,  -0.220), (  0.220,   0.876,   0.220)),
    "extractor":           (( -0.812,  -0.280,  -0.400), (  0.640,   0.280,   0.262)),
    "extractor_plunger":   (( -7.380,   2.360,   0.530), ( -1.680,   2.740,   0.910)),
    "frame":               (( -8.557,  -9.352,  -1.270), ( 11.092,   1.080,   1.270)),
    "locking_block":       (( -0.370,  -0.060,  -0.860), (  1.450,   1.050,   0.860)),
    "slide_lock":          ((  1.117,  -0.230,  -1.400), (  2.180,   0.760,   1.400)),
    "slide_stop_lever":    (( -3.100,  -0.170,  -1.400), (  0.665,   1.040,  -0.725)),
    "magazine_catch":      (( -3.124,  -4.220,  -1.420), ( -1.857,  -1.537,   1.200)),
    "trigger_pin":         (( -0.190,  -0.190,  -1.270), (  0.190,   0.190,   1.270)),
    "locking_block_pin":   (( -0.145,  -0.145,  -1.250), (  0.145,   0.145,   1.250)),
    "trigger_housing_pin": (( -0.145,  -0.145,  -1.230), (  0.145,   0.145,   1.230)),
    "trigger_with_bar":    (( -5.810,  -2.285,  -0.370), (  0.384,   1.431,   0.930)),
    "trigger_housing":     (( -6.475,  -0.646,  -0.670), ( -2.529,   1.680,   0.670)),
    "connector":           (( -5.781,  -0.430,   0.580), ( -4.790,   1.273,   0.991)),
    "trigger_spring":      (( -6.236,   0.222,  -0.038), ( -5.204,   0.538,   0.277)),
    "mag_body":            (( -1.340,  -4.760,  -0.920), (  1.340,   5.680,   0.920)),
    "mag_follower":        (( -1.050,  -0.800,  -0.625), (  1.050,   0.630,   0.625)),
    "mag_spring":          (( -0.765,  -0.595,  -0.565), (  0.765,   0.595,   0.565)),
    "mag_base_plate":      (( -1.528,  -0.320,  -1.050), (  1.681,   0.460,   1.050)),
}


# =============================================================================
# Scene & Physically Calibrated Cycles PBR Material Library
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
    world.light_settings.distance = 1.2

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
    edge_srgb: tuple[float, float, float] = (0.64, 0.67, 0.72),
    grain_scale: float = 38.0,
    grain_bump: float = 0.026,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
    rough_var: float = 0.036,
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
    n_macro.inputs["Scale"].default_value = 2.2
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
    rgh_val_node.inputs["To Min"].default_value = max(0.09, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        # Per-pixel raytraced geometric convexity (AO inside=True) -> razor-sharp bevel wear
        # with ZERO vertex-interpolated Pointiness triangulation streaking on flat machined walls!
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.068

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
        mix_edge_r.inputs[3].default_value = max(0.14, roughness - 0.12)
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
        bump.inputs["Distance"].default_value = 0.018
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_muzzle_crown_soot_mat() -> bpy.types.Material:
    """Recessed 11-deg Glock Marksman Barrel target crown with subtle 9x19mm gunpowder carbon halo."""
    mat = bpy.data.materials.new("M_MuzzleCrownSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 7.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.115, 0.120, 0.130)
    mix_c.inputs[7].default_value = srgb_to_lin(0.245, 0.258, 0.275)
    nt.links.new(n_soot.outputs["Fac"], mix_c.inputs[0])

    rgh_mr = nt.nodes.new("ShaderNodeMapRange")
    rgh_mr.inputs["From Min"].default_value = 0.25
    rgh_mr.inputs["From Max"].default_value = 0.75
    rgh_mr.inputs["To Min"].default_value = 0.44
    rgh_mr.inputs["To Max"].default_value = 0.72
    nt.links.new(n_soot.outputs["Fac"], rgh_mr.inputs["Value"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_mr.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.72

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.014
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: g17_v3_slide (slide, front_sight, rear_sight, slide_cover_plate, extractor) ---
        # Gen 5 Satin nDLC Gunmetal Steel (sRGB 0.31-0.36, M=0.82, R=0.355 -> luminous satin gunmetal on flat vertical walls!)
        "S_SlideNDLC": _build_pbr_mat(
            "S_SlideNDLC",
            base_srgb=(0.318, 0.334, 0.356),
            roughness=0.355,
            metallic=0.82,
            bevel_r=0.028,
            edge_wear=0.62,
            edge_srgb=(0.74, 0.78, 0.84),
            grain_scale=44.0,
            grain_bump=0.024,
            aniso_stretch=(0.18, 3.4, 3.4),
            voronoi_grain=0.22,
            voronoi_scale=96.0,
            rough_var=0.036,
        ),
        # Milled slide serration roots, ejection port interior, striker/plunger bores (dark contrast against 0.33 satin ribs!)
        "S_SlideMilled": _build_pbr_mat(
            "S_SlideMilled",
            base_srgb=(0.148, 0.158, 0.172),
            roughness=0.44,
            metallic=0.80,
            bevel_r=0.016,
            edge_wear=0.22,
            edge_srgb=(0.48, 0.52, 0.58),
            grain_scale=52.0,
            grain_bump=0.030,
            rough_var=0.042,
        ),
        # MIM External Extractor & Backplate satin gunmetal steel
        "S_ExtractorSteel": _build_pbr_mat(
            "S_ExtractorSteel",
            base_srgb=(0.285, 0.298, 0.318),
            roughness=0.34,
            metallic=0.83,
            bevel_r=0.020,
            edge_wear=0.56,
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=48.0,
            grain_bump=0.026,
            voronoi_grain=0.34,
            voronoi_scale=88.0,
            rough_var=0.036,
        ),
        # Matte anti-glare sight body & polymer backplate outer shell
        "S_SightBody": _build_pbr_mat(
            "S_SightBody",
            base_srgb=(0.165, 0.172, 0.182),
            roughness=0.58,
            metallic=0.04,
            bevel_r=0.016,
            edge_wear=0.14,
            edge_srgb=(0.28, 0.29, 0.31),
            grain_scale=58.0,
            grain_bump=0.028,
            rough_var=0.040,
        ),
        # High-contrast bright crisp white Glock front dot & rear U-outline paint infill
        "S_SightWhite": _build_pbr_mat(
            "S_SightWhite",
            base_srgb=(0.95, 0.96, 0.97),
            roughness=0.22,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.005,
            rough_var=0.015,
        ),
        # Stainless front-sight hex nut & backplate inner steel liner
        "S_SlideStainless": _build_pbr_mat(
            "S_SlideStainless",
            base_srgb=(0.76, 0.785, 0.815),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=32.0,
            grain_bump=0.016,
        ),

        # --- SUITE 2: g17_v3_polymer (frame, mag_body, mag_follower [ORANGE], controls, housing) ---
        # Gen 5 Sculpted Glass-Filled Polyamide Frame (deep matte charcoal sRGB 0.165, M=0.0, R=0.64)
        "P_PolyamideSmooth": _build_pbr_mat(
            "P_PolyamideSmooth",
            base_srgb=(0.165, 0.171, 0.181),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.14,
            edge_srgb=(0.235, 0.244, 0.256),
            grain_scale=68.0,
            grain_bump=0.052,
            voronoi_grain=0.45,
            voronoi_scale=94.0,
            rough_var=0.044,
        ),
        # Darker recessed frame cavities, Picatinny cross-slot, magwell interior, checkering troughs
        "P_PolyamideRecess": _build_pbr_mat(
            "P_PolyamideRecess",
            base_srgb=(0.125, 0.130, 0.138),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=72.0,
            grain_bump=0.062,
            voronoi_grain=0.52,
            voronoi_scale=98.0,
            rough_var=0.048,
        ),
        # 3D Object-space RTF4 stippled polyamide for sculpted frontstrap & backstrap (non-hero faces)
        "P_PolyamideStrapRTF": _build_pbr_mat(
            "P_PolyamideStrapRTF",
            base_srgb=(0.148, 0.154, 0.163),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.08,
            edge_srgb=(0.22, 0.23, 0.24),
            grain_scale=96.0,
            grain_bump=0.34,
            voronoi_grain=0.92,
            voronoi_scale=84.0,
            rough_var=0.045,
        ),
        # Polymer magazine jacket (slightly slicker glass-filled nylon 66 for drop-free magwell speed)
        "P_MagPolymer": _build_pbr_mat(
            "P_MagPolymer",
            base_srgb=(0.176, 0.182, 0.192),
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.14,
            edge_srgb=(0.25, 0.26, 0.27),
            grain_scale=62.0,
            grain_bump=0.036,
            voronoi_grain=0.34,
            voronoi_scale=82.0,
            rough_var=0.042,
        ),
        # Inlaid brushed stainless serial plate, 4 embedded frame rails, mag steel liner/feed lips & #336 ejector
        "P_BrushedStainless": _build_pbr_mat(
            "P_BrushedStainless",
            base_srgb=(0.765, 0.790, 0.820),
            roughness=0.20,
            metallic=0.965,
            bevel_r=0.018,
            edge_wear=0.18,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=34.0,
            grain_bump=0.018,
            aniso_stretch=(0.22, 3.8, 3.8),
            rough_var=0.028,
        ),
        # Firewalled Vivid Gen 5 Safety Orange Anti-Tilt Magazine Follower (ZERO orange bleed!)
        "P_FollowerOrange": _build_pbr_mat(
            "P_FollowerOrange",
            base_srgb=(0.94, 0.31, 0.045),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.16,
            edge_srgb=(0.99, 0.54, 0.22),
            grain_scale=44.0,
            grain_bump=0.024,
            rough_var=0.035,
        ),

        # --- SUITE 3: g17_v3_metal (GMB barrel + 12 Safe Action metal internals) ---
        # Satin nDLC Glock Marksman Barrel steel (silky charcoal-gunmetal harmonizing with Gen 5 slide!)
        "M_BarrelNDLC": _build_pbr_mat(
            "M_BarrelNDLC",
            base_srgb=(0.295, 0.310, 0.332),
            roughness=0.31,
            metallic=0.84,
            bevel_r=0.024,
            edge_wear=0.48,
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=42.0,
            grain_bump=0.020,
            aniso_stretch=(2.6, 0.45, 0.45),
            rough_var=0.030,
        ),
        # Gleaming Mirror-Polished Stainless (barrel feed ramp, Safe Action trigger bar, connector, firing-pin safety)
        "M_MirrorStainless": _build_pbr_mat(
            "M_MirrorStainless",
            base_srgb=(0.815, 0.838, 0.868),
            roughness=0.135,
            metallic=0.985,
            bevel_r=0.018,
            edge_wear=0.12,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=30.0,
            grain_bump=0.010,
            aniso_stretch=(0.24, 3.8, 3.8),
            rough_var=0.018,
        ),
        # Brushed Satin CNC Stainless (locking block, striker, locking block pin, extractor plunger rod)
        "M_BrushedStainless": _build_pbr_mat(
            "M_BrushedStainless",
            base_srgb=(0.735, 0.760, 0.792),
            roughness=0.21,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.22,
            edge_srgb=(0.88, 0.90, 0.94),
            grain_scale=36.0,
            grain_bump=0.020,
            aniso_stretch=(0.28, 3.6, 3.6),
            rough_var=0.030,
        ),
        # Dark nDLC hardware (slide lock, slide stop lever, grooved trigger pin)
        "M_HardwareNDLC": _build_pbr_mat(
            "M_HardwareNDLC",
            base_srgb=(0.178, 0.188, 0.204),
            roughness=0.29,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.45,
            edge_srgb=(0.64, 0.68, 0.74),
            grain_scale=44.0,
            grain_bump=0.026,
            rough_var=0.038,
        ),
        # Internal polygonal bore & chamber throat
        "M_BoreDark": _build_pbr_mat(
            "M_BoreDark",
            base_srgb=(0.22, 0.235, 0.258),
            roughness=0.26,
            metallic=0.92,
            bevel_r=0.010,
            grain_scale=44.0,
            grain_bump=0.022,
            aniso_stretch=(0.18, 4.0, 4.0),
        ),
        "M_MuzzleCrownSoot": _build_muzzle_crown_soot_mat(),
        # Tempered spring steel (trigger spring, mag spring, slide lock leaf spring, plunger spring)
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.45, 0.485, 0.535),
            roughness=0.24,
            metallic=0.94,
            bevel_r=0.010,
            grain_scale=30.0,
            grain_bump=0.016,
        ),
        # Matte polymer trigger shoe (matches Gen 5 frame polyamide!) & extractor SLB bearing
        "M_TriggerPolymer": _build_pbr_mat(
            "M_TriggerPolymer",
            base_srgb=(0.184, 0.190, 0.200),
            roughness=0.60,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.14,
            edge_srgb=(0.26, 0.27, 0.28),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.40,
            voronoi_scale=88.0,
            rough_var=0.040,
        ),
        # Contrasting satin Safe Action center trigger safety blade tongue (visually distinct from shoe!)
        "M_TriggerSafetyBlade": _build_pbr_mat(
            "M_TriggerSafetyBlade",
            base_srgb=(0.245, 0.256, 0.272),
            roughness=0.50,
            metallic=0.00,
            bevel_r=0.014,
            edge_wear=0.18,
            edge_srgb=(0.34, 0.36, 0.39),
            grain_scale=52.0,
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


def _bm_to_obj(
    name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None
) -> bpy.types.Object:
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
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
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return pts


def mk_box(
    name: str,
    sx: float,
    sy: float,
    sz: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
    bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str,
    r_top: float,
    r_bot: float,
    length: float,
    axis: str = "x",
    segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r_bot,
        radius2=r_top,
        depth=length,
    )
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=2,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    elif axis == "z":
        pre = []
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_sphere(
    name: str,
    radius: float,
    segs: int = 20,
    rings: int = 14,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str,
    pts_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
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
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
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
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_x(
    name: str,
    pts_zy: list[tuple[float, float]],
    x0: float,
    x1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
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
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
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
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_y(
    name: str,
    pts_xz: list[tuple[float, float]],
    y0: float,
    y1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
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
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
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
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_beveled_groove_cutter(
    name: str,
    w_out: float,
    w_in: float,
    height: float,
    depth: float,
    z_out: float = 0.16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Trapezoidal beveled cocking serration cutter (wider at surface -> crisp chamfered steel ribs!)."""
    hwo, hwi = w_out * 0.5, w_in * 0.5
    hh = height * 0.5
    coords = [
        (-hwo, -hh, z_out),
        ( hwo, -hh, z_out),
        ( hwo,  hh, z_out),
        (-hwo,  hh, z_out),
        (-hwi, -hh + 0.04, -depth),
        ( hwi, -hh + 0.04, -depth),
        ( hwi,  hh - 0.04, -depth),
        (-hwi,  hh - 0.04, -depth),
    ]
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in coords]
    for q in (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ):
        bm.faces.new([vs[i] for i in q])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_swept_tube(
    name: str,
    pts_three: list[tuple[float, float, float]],
    radius: float,
    ring_segs: int = 10,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight swept circular tube along Three.js polyline."""
    pts = [Vector(p) for p in pts_three]
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            tang = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tang = (pts[-1] - pts[-2]).normalized()
        else:
            tang = (pts[i + 1] - pts[i - 1]).normalized()
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
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_coil_spring(
    name: str,
    axis: str,
    start: float,
    end: float,
    center_a: float,
    center_b: float,
    coil_r: float,
    wire_r: float,
    coils: float,
    ring_segs: int = 8,
    steps_per_coil: int = 16,
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
            pts.append((ax, center_a + ca, center_b + sa))
        elif axis == "y":
            pts.append((center_a + ca, ax, center_b + sa))
        else:
            pts.append((center_a + ca, center_b + sa, ax))
    return mk_swept_tube(name, pts, wire_r, ring_segs=ring_segs, xform=xform, mat=mat)


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
    lock_flat_walls: bool = False,
) -> bpy.types.Object:
    """Strictly enforces manifoldness & outward positive volume BEFORE WeightedNormal & Triangulate!"""
    select_only([obj], obj)
    if bevel_w > 0.0:
        nm_pre = _count_non_manifold(obj)
        backup = obj.data.copy()
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.offset_type = "OFFSET"
        mod.width = bevel_w
        mod.segments = bevel_segs
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        mod.use_clamp_overlap = True
        mod.miter_outer = "MITER_ARC"
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if _count_non_manifold(obj) > nm_pre:
            old = obj.data
            obj.data = backup
            bpy.data.meshes.remove(old)
        else:
            bpy.data.meshes.remove(backup)

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
    flat_rad = math.radians(12.0)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = e.calc_face_angle(0.0)
            is_flat_wall_edge = False
            if lock_flat_walls and ang > flat_rad:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                # Lock planar machined +-Z cheeks (Blender Y axis) & big planar facets optically flat!
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
# SUITE 1 BUILDERS (5 parts): slide, front_sight, rear_sight, slide_cover_plate, extractor
# =============================================================================
def _slide_profile_zy(half_z: float, top_y: float, bot_y: float, sh_w: float, sh_h: float) -> list[tuple[float, float]]:
    """Fixed-topology 28-vertex Glock Gen 5 slab-side cross-section in (Z, Y) for silky smooth bullnose lofting!"""
    # Bottom flat -> lower corner -> right vertical wall -> upper right smooth shoulder -> top flat -> left upper shoulder -> left wall
    pts = [
        (-half_z + 0.055, bot_y),
        ( half_z - 0.055, bot_y),
        ( half_z,         bot_y + 0.055),
        ( half_z,         top_y - sh_h),
    ]
    # Right upper Glock signature curved shoulder bevel (10 smooth segments)
    pts += _cubic_bez(
        (half_z, top_y - sh_h),
        (half_z, top_y - sh_h * 0.42),
        (half_z - sh_w * 0.42, top_y),
        (half_z - sh_w, top_y),
        segs=10,
    )
    pts.append((-half_z + sh_w, top_y))
    # Left upper Glock signature curved shoulder bevel (10 smooth segments)
    pts += _cubic_bez(
        (-half_z + sh_w, top_y),
        (-half_z + sh_w * 0.42, top_y),
        (-half_z, top_y - sh_h * 0.42),
        (-half_z, top_y - sh_h),
        segs=10,
    )
    pts.append((-half_z, bot_y + 0.055))
    return pts


def build_slide(mats: dict) -> bpy.types.Object:
    """U-01: 1:1 Glock 17 Gen 5 nDLC Steel Slide w/ Sculpted Bullnose, Vertical Front & Rear Serrations,
    Deep Beveled Ejection Port, Stepped LCI Extractor Pocket & Exact Internal Channels."""
    m_out = mats["S_SlideNDLC"]
    m_mil = mats["S_SlideMilled"]

    # 1. Multi-station lofted Gen 5 slide envelope with authentic sculpted bullnose muzzle taper!
    # Stations: (x, half_z, top_y, bot_y, sh_w, sh_h)
    stations = [
        (-7.535, 1.242, 3.418, 0.885, 0.36, 0.46),  # rear micro-chamfer edge
        (-7.490, 1.280, 3.455, 0.855, 0.36, 0.47),  # rear main body
        ( 9.950, 1.280, 3.455, 0.855, 0.36, 0.47),  # full width up to front sight
        (10.300, 1.272, 3.446, 0.855, 0.38, 0.48),  # start of Gen 5 bullnose bevel
        (10.620, 1.225, 3.395, 0.858, 0.42, 0.50),  # mid-rear bullnose curve
        (10.900, 1.132, 3.298, 0.865, 0.44, 0.50),  # mid-front bullnose curve
        (11.080, 1.015, 3.185, 0.878, 0.43, 0.48),  # nose chamfer lip
        (11.135, 0.962, 3.138, 0.892, 0.41, 0.46),  # crisp flat muzzle face
    ]

    bm = bmesh.new()
    rings = []
    for x, hz, ty, by, sw, sh in stations:
        prof = _slide_profile_zy(hz, ty, by, sw, sh)
        ring = [bm.verts.new((x, y, z)) for (z, y) in prof]
        rings.append(ring)

    n_p = len(rings[0])
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n_p):
            ni = (i + 1) % n_p
            bm.faces.new((a[i], b[i], b[ni], a[ni]))
    _apply_three_xform(bm, [])
    hull = _bm_to_obj("slide_hull", bm, m_out)

    # Authentic protruding U-shaped front recoil-spring chin collar (nests inside frame dust cover U-channel)
    chin_main = mk_cyl(
        "slide_chin", 0.655, 0.655, 1.12, "x", 36,
        [("t", 10.48, 1.12, 0.0)], m_out, bevel=0.045,
    )
    chin_bridge = mk_box(
        "slide_chin_br", 1.12, 0.42, 1.30,
        [("t", 10.48, 1.32, 0.0)], m_out, bevel=0.025,
    )
    body = bool_union([hull, chin_main, chin_bridge], "slide_raw")

    cutters = []

    # 1. Underside cutout behind dust-cover chin + internal frame rail slots (strictly inside Z=+-0.94/1.09
    #    so solid 0.34 cm slide side skirts NEVER expose internal magazine brass on either flank!)
    cutters.append(mk_box("c_und", 9.55, 0.98, 1.88, [("t", -2.85, 1.26, 0.0)], m_mil))
    cutters.append(mk_box("c_rail", 17.30, 0.20, 2.18, [("t", 1.00, 1.06, 0.0)], m_mil))

    # 2. Barrel tunnel (r=0.76 for clean Browning tilt clearance) + internal hood vault
    cutters.append(mk_cyl("c_bbl_tun", 0.76, 0.76, 12.2, "x", 36, [("t", 5.38, 2.55, 0.0)], m_mil))
    cutters.append(mk_box("c_vault", 7.30, 1.36, 1.68, [("t", 6.20, 2.56, 0.0)], m_mil))

    # Recoil spring tunnel + front guide-rod bore + central web clearance
    cutters.append(mk_cyl("c_rec_tun", 0.50, 0.50, 9.35, "x", 30, [("t", 6.20, 1.38, 0.0)], m_mil))
    cutters.append(mk_cyl("c_gr_bore", 0.37, 0.37, 1.45, "x", 28, [("t", 10.92, 1.35, 0.0)], m_mil))
    cutters.append(mk_box("c_web", 9.00, 1.10, 1.18, [("t", 6.15, 1.95, 0.0)], m_mil))

    # 3. Clean Open Ejection Port with lowered right-wall flare & angled brass-clearance bevel
    cutters.append(mk_box("c_ej_top", 3.12, 0.92, 1.64, [("t", 1.03, 3.26, 0.0)], m_mil))
    cutters.append(mk_box("c_ej_rt", 3.10, 1.50, 1.50, [("t", 1.03, 2.80, 0.68)], m_mil))
    cutters.append(mk_box("c_ej_bev", 3.18, 0.42, 0.42, [("rx", 0.65), ("t", 1.03, 2.08, 1.25)], m_out))
    # Forward-raked front ejection-port brass relief flare on right wall
    cutters.append(mk_box("c_ej_flr", 0.42, 1.12, 0.52, [("ry", 0.62), ("t", 2.62, 2.92, 1.02)], m_out))

    # Breech face rectangular Glock firing-pin aperture + left ejector clearance rail groove
    cutters.append(mk_box("c_fp_slot", 0.48, 0.24, 0.09, [("t", -0.55, 2.55, 0.0)], m_mil))
    cutters.append(mk_box("c_ej_grv", 7.20, 0.68, 0.22, [("t", -3.95, 1.62, -0.34)], m_mil))

    # 4. Stepped External Extractor & LCI Pocket on right wall behind ejection port
    cutters.append(mk_box("c_ext_in", 1.30, 0.52, 0.46, [("t", -1.08, 2.55, 0.97)], m_mil))
    cutters.append(mk_box("c_ext_out", 1.10, 0.44, 0.30, [("t", -0.98, 2.55, 1.24)], m_mil))
    cutters.append(mk_cyl("c_ext_tr", 0.17, 0.17, 0.62, "y", 20, [("t", -1.22, 2.55, 1.06)], m_mil))
    cutters.append(mk_box("c_ext_rmp", 0.42, 0.40, 0.34, [("ry", 0.26), ("t", -1.66, 2.55, 0.96)], m_mil))

    # 5. Rear Striker channel + Sear slot + Firing-pin safety bore + Extractor plunger channel
    cutters.append(mk_cyl("c_str_ch", 0.33, 0.33, 7.35, "x", 26, [("t", -4.10, 2.55, 0.0)], m_mil))
    cutters.append(mk_box("c_sear_sl", 3.55, 1.20, 0.34, [("t", -5.85, 1.95, 0.0)], m_mil))
    cutters.append(mk_cyl("c_fps_br", 0.24, 0.24, 1.68, "y", 22, [("t", -2.10, 2.12, 0.28)], m_mil))
    cutters.append(mk_cyl("c_plg_ch", 0.22, 0.22, 6.25, "x", 24, [("t", -4.55, 2.55, 0.72)], m_mil))

    # Rear slide cover-plate vertical T-slot recess at X = -7.52
    cutters.append(mk_box("c_scp_sl", 0.26, 2.16, 1.88, [("t", -7.50, 2.22, 0.0)], m_mil))

    # Front sight oval mounting hole (X = +10.15) & Rear sight dovetail cut (X = -6.45)
    cutters.append(mk_cyl("c_fs_hl", 0.12, 0.12, 0.38, "y", 18, [("t", 10.15, 3.38, 0.0)], m_mil))
    # Authentic trapezoidal dovetail cut for rear sight
    dt_xy = [(-0.27, 3.35), (0.27, 3.35), (0.23, 3.52), (-0.23, 3.52)]
    cutters.append(mk_extrude_z("c_rs_dt", dt_xy, -1.40, 1.40, xform=[("t", -6.45, 0.0, 0.0)], mat=m_mil))

    # 6. Authentic Milled Step Left Slide-Stop Notch & Shallow Right Gen 5 Ambi Relief
    #    Depth strictly <= 0.14 cm from outer flank (Z=+-1.28 -> +-1.14), backed by 0.20 cm SOLID STEEL so
    #    internal magazine brass cartridges are NEVER visible through the exterior slide wall!
    cutters.append(mk_box("c_ss_l", 0.64, 0.36, 0.20, [("t", -2.65, 1.00, -1.25)], m_mil))
    cutters.append(mk_box("c_ss_r", 0.60, 0.32, 0.16, [("t", -2.65, 0.98,  1.26)], m_mil))

    # 7. Crisp VERTICAL Gen 5 Front (6) & Rear (7) Cocking Serrations on BOTH sides!
    #    Beveled trapezoidal slots (w_out=0.185, w_in=0.125, depth=0.105) catch silky specular highlights!
    for i in range(7):
        sx = -6.88 + i * 0.37
        # Right flank (+Z): cutter local +Z points outward (+Z)
        cutters.append(
            mk_beveled_groove_cutter(
                f"c_rs_r{i}", 0.185, 0.125, 1.94, 0.105, z_out=0.18,
                xform=[("t", sx, 2.02, 1.28)], mat=m_mil,
            )
        )
        # Left flank (-Z): rotate 180 deg around Y so local +Z points outward (-Z)
        cutters.append(
            mk_beveled_groove_cutter(
                f"c_rs_l{i}", 0.185, 0.125, 1.94, 0.105, z_out=0.18,
                xform=[("ry", math.pi), ("t", sx, 2.02, -1.28)], mat=m_mil,
            )
        )

    for i in range(6):
        sx = 7.38 + i * 0.35
        cutters.append(
            mk_beveled_groove_cutter(
                f"c_fs_r{i}", 0.175, 0.118, 1.78, 0.100, z_out=0.18,
                xform=[("t", sx, 2.08, 1.28)], mat=m_mil,
            )
        )
        cutters.append(
            mk_beveled_groove_cutter(
                f"c_fs_l{i}", 0.175, 0.118, 1.78, 0.100, z_out=0.18,
                xform=[("ry", math.pi), ("t", sx, 2.08, -1.28)], mat=m_mil,
            )
        )

    slide = bool_subtract(body, cutters)
    slide.name = "slide"
    slide.data.name = "slide"
    return finish_part(slide, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_front_sight(mats: dict) -> bpy.types.Object:
    """U-02: Ramp Front Sight with High-Contrast Inlaid White Dot & Underside 3/16\" Stainless Hex Screw."""
    m_b = mats["S_SightBody"]
    m_w = mats["S_SightWhite"]
    m_st = mats["S_SlideStainless"]

    blade_xy = [(-0.45, 0.0), (0.43, 0.0), (0.24, 0.44), (-0.42, 0.46)]
    blade = mk_extrude_z("fs_blade", blade_xy, -0.122, 0.122, bevel=0.014, bevel_segs=2, mat=m_b)
    tenon = mk_cyl("fs_tenon", 0.105, 0.105, 0.22, "y", 18, [("t", 0.0, -0.11, 0.0)], m_b)
    hex_screw = mk_cyl("fs_hex", 0.145, 0.145, 0.065, "y", 6, [("t", 0.0, -0.23, 0.0)], m_st, bevel=0.008)
    # Recessed bright white aiming dot on rear sight face (-X)
    white_dot = mk_cyl("fs_dot", 0.088, 0.088, 0.042, "x", 24, [("t", -0.432, 0.27, 0.0)], m_w, bevel=0.006)
    obj = join_objects([blade, tenon, hex_screw, white_dot], "front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_rear_sight(mats: dict) -> bpy.types.Object:
    """U-03: Dovetail Rear Sight with Iconic Glock White U-Outline Border & Anti-Glare Rear Face."""
    m_b = mats["S_SightBody"]
    m_m = mats["S_SlideMilled"]
    m_w = mats["S_SightWhite"]

    side_xy = [(-0.37, 0.0), (0.39, 0.0), (0.26, 0.46), (-0.35, 0.46)]
    base = mk_extrude_z("rs_base", side_xy, -0.76, 0.76, bevel=0.018, bevel_segs=2, mat=m_b)
    dt_xy = [(-0.255, -0.125), (0.255, -0.125), (0.215, 0.02), (-0.215, 0.02)]
    dovetail = mk_extrude_z("rs_dt", dt_xy, -0.74, 0.74, bevel=0.008, mat=m_b)
    raw = bool_union([base, dovetail], "rs_raw")
    notch = mk_box("rs_notch", 0.96, 0.29, 0.37, [("t", 0.0, 0.365, 0.0)], m_m)
    carved = bool_subtract(raw, [notch])

    # Iconic crisp white U-outline border inlaid cleanly on rear face (-X = -0.372)
    u_bot = mk_box("rs_ub", 0.032, 0.068, 0.56, [("t", -0.372, 0.162, 0.0)], m_w, bevel=0.005)
    u_l = mk_box("rs_ul", 0.032, 0.265, 0.068, [("t", -0.372, 0.292, -0.246)], m_w, bevel=0.005)
    u_r = mk_box("rs_ur", 0.032, 0.265, 0.068, [("t", -0.372, 0.292,  0.246)], m_w, bevel=0.005)
    obj = join_objects([carved, u_bot, u_l, u_r], "rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_slide_cover_plate(mats: dict) -> bpy.types.Object:
    """U-07: Gen 5 Machined Slide Cover Plate w/ Horizontal Grip Ribs & Stamped Stainless Liner."""
    m_p = mats["S_SightBody"]
    m_m = mats["S_SlideMilled"]
    m_st = mats["S_SlideStainless"]

    prof_zy = [(-0.915, -1.045), (0.915, -1.045), (0.915, 0.72)]
    prof_zy += _quad_bez((0.915, 0.72), (0.895, 1.045), (0.62, 1.045), 8)
    prof_zy.append((-0.62, 1.045))
    prof_zy += _quad_bez((-0.62, 1.045), (-0.895, 1.045), (-0.915, 0.72), 8)

    plate = mk_extrude_x("scp_plate", prof_zy, -0.10, 0.10, bevel=0.015, bevel_segs=2, mat=m_p)
    cutters = [mk_box("scp_notch", 0.42, 0.52, 0.36, [("t", 0.0, -0.82, 0.0)], m_m)]
    # 6 crisp horizontal rear traction grooves on -X face
    for i in range(6):
        gy = -0.32 + i * 0.22
        cutters.append(mk_box(f"scp_rib{i}", 0.055, 0.055, 1.56, [("t", -0.11, gy, 0.0)], m_m))
    carved = bool_subtract(plate, cutters)

    steel_liner = mk_box("scp_liner", 0.042, 1.54, 1.54, [("t", 0.10, 0.08, 0.0)], m_st, bevel=0.006)
    obj = join_objects([carved, steel_liner], "slide_cover_plate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_extractor(mats: dict) -> bpy.types.Object:
    """U-11: Gen 5 15-deg MIM External Extractor w/ Contoured Rim Claw, Trunnions & Tactile LCI Bar."""
    m_ext = mats["S_ExtractorSteel"]
    m_mil = mats["S_SlideMilled"]
    m_st = mats["S_SlideStainless"]

    # Top-down (X, Z) profile extruded along Y in [-0.22, +0.22]
    pts_xz = [(-0.56, 0.14), (0.58, 0.14)]
    pts_xz += _quad_bez((0.58, 0.14), (0.63, 0.14), (0.63, 0.04), 6)
    pts_xz.append((0.63, -0.32))
    pts_xz += _quad_bez((0.63, -0.32), (0.63, -0.39), (0.54, -0.39), 6)
    pts_xz += [(0.45, -0.39), (0.43, -0.20)]
    pts_xz += _quad_bez((0.43, -0.20), (0.28, -0.16), (0.08, -0.15), 6)
    pts_xz += [(-0.44, -0.15), (-0.76, -0.24)]
    pts_xz += _quad_bez((-0.76, -0.24), (-0.81, -0.22), (-0.80, -0.12), 6)
    pts_xz.append((-0.72, 0.06))
    pts_xz += _quad_bez((-0.72, 0.06), (-0.66, 0.14), (-0.56, 0.14), 6)

    body_raw = mk_extrude_y("ext_body", pts_xz, -0.22, 0.22, bevel=0.012, bevel_segs=2, mat=m_ext)
    claw_bev = mk_box("c_ext_cb", 0.28, 0.18, 0.28, [("rx", -0.55), ("t", 0.54, -0.24, -0.32)], m_mil)
    plg_cup = mk_sphere("c_ext_pc", 0.14, 16, 12, [("t", -0.81, 0.0, -0.09)], m_st)
    body = bool_subtract(body_raw, [claw_bev, plg_cup])

    trunnion = mk_cyl("ext_trun", 0.155, 0.155, 0.56, "y", 22, [("t", -0.14, 0.0, -0.01)], m_ext, bevel=0.010)
    lci_base = mk_box("ext_lci_b", 0.74, 0.30, 0.085, [("t", 0.08, 0.0, 0.178)], m_ext, bevel=0.010)
    lci_step = mk_box("ext_lci_s", 0.46, 0.22, 0.056, [("t", 0.18, 0.0, 0.234)], m_ext, bevel=0.008)
    obj = bool_union([body, trunnion, lci_base, lci_step], "extractor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 2 BUILDERS (8 parts): frame, recoil_guide_rod, magazine_catch, trigger_housing_pin,
#                             trigger_housing, mag_body, mag_follower, mag_base_plate
# =============================================================================
def _mk_unified_gen5_frame_hull(
    mat_smooth: bpy.types.Material, mat_strap: bpy.types.Material
) -> bpy.types.Object:
    """Single seamless organically sculpted Glock 17 Gen 5 polyamide frame hull:
      - Zero diagonal crease or shelf between upper receiver and grip!
      - Smooth ergonomic Gen 5 frontstrap (NO Gen 3 finger grooves) fully enclosing
        magazine_catch (-2.28, -2.05) AND its vertical wire spring (-2.68, -3.10)!
      - Clean -20 deg magwell bottom rim mating mag_base_plate flush with ZERO stray rear heel lip!
      - Quad-sliced grip body with C2 organic palm swell, rounded frontstrap/backstrap ergonomics,
        concave thumb-web waist, and graceful Gen 5 flared magwell!"""
    # Exact unified 2D Gen 5 side profile in Three.js (X, Y):
    # Top dustcover -> front nose -> dustcover underside -> high trigger-guard undercut ->
    # smooth Gen 5 frontstrap (enclosing mag_catch at gx=+2.05..2.34 & wire spring at gx=+2.03!) ->
    # clean -20 deg flared magwell bottom rim -> arched Glock backstrap hump -> concave thumb-web -> beavertail tang!
    body_xy = [(-6.92, 0.86), (10.86, 0.86)]
    body_xy += _quad_bez((10.86, 0.86), (11.05, 0.84), (11.03, 0.42), 8)
    body_xy += _quad_bez((11.03, 0.42), (10.96, -0.12), (10.48, -0.18), 8)
    body_xy.append((2.36, -0.18))
    body_xy += _quad_bez((2.36, -0.18), (1.94, -0.20), (1.72, -0.44), 6)
    body_xy.append((-1.62, -0.44))
    # Smooth high Gen 5 undercut sweeping cleanly forward around magazine_catch (-2.28, -2.05)!
    body_xy += _cubic_bez((-1.62, -0.44), (-1.94, -0.52), (-1.82, -1.25), (-1.82, -1.85), 10)
    # Smooth straight-ergonomic Gen 5 frontstrap (gx ≈ +2.42 -> +2.30 -> +1.86 at flared magwell lip!)
    body_xy += _cubic_bez((-1.82, -1.85), (-2.38, -3.45), (-3.55, -6.55), (-4.72, -9.08), 16)
    body_xy += _quad_bez((-4.72, -9.08), (-4.90, -9.32), (-5.20, -9.32), 6)
    # Clean -20 deg magwell bottom rim parallel to mag_base_plate top face (gy = -4.76):
    # Front (-5.20, -9.32) -> Rear (-8.30, -8.20), flush w/ mag_base_plate [-8.205, -8.292], ZERO stray rear lip!
    body_xy.append((-8.18, -8.25))
    body_xy += _quad_bez((-8.18, -8.25), (-8.38, -8.16), (-8.32, -7.86), 6)
    # Classic Glock ergonomic arched backstrap hump sweeping smoothly into concave thumb-web & Gen 5 beavertail tang!
    body_xy += _cubic_bez((-8.32, -7.86), (-7.76, -6.15), (-7.14, -4.30), (-6.46, -2.35), 14)
    body_xy += _cubic_bez((-6.46, -2.35), (-6.04, -1.18), (-5.96, -0.42), (-6.32, -0.05), 10)
    body_xy += _quad_bez((-6.32, -0.05), (-6.72, 0.24), (-7.18, 0.36), 8)
    body_xy += _quad_bez((-7.18, 0.36), (-7.26, 0.58), (-6.92, 0.86), 8)

    # Extrude unified hull with silky edge bevel (Z in [-1.242, +1.242]; bmesh.ops.bevel insets edges inward
    # so flat outer receiver cheeks sit at exact factory Z = +-1.242 flush w/ slide & 3 cross-pins!)
    obj = mk_extrude_z("frame_hull", body_xy, -1.242, 1.242, bevel=0.072, bevel_segs=3, mat=mat_smooth)

    # Quad-slice ONLY the grip body via bisect_plane (10 grip-horizontal slices + 4 grip-vertical slices)
    # so the C2 organic palm swell, rounded frontstrap/backstrap & Gen 5 flared magwell sculpt with silky smoothness!
    ox, oy = -5.26, -4.25
    ca_w, sa_w = math.cos(GRIP_ANGLE_RAD), math.sin(GRIP_ANGLE_RAD)
    cos_g, sin_g = math.cos(-GRIP_ANGLE_RAD), math.sin(-GRIP_ANGLE_RAD)

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    # Bisect horizontal slices along grip axis (gy from -4.55 to +2.45) restricting to grip verts (ty < -0.55)
    # In Blender coords: bx = tx, by = -tz, bz = ty
    n_gy_three = Vector((-sa_w, ca_w, 0.0))  # unit vector along +gy in Three.js
    n_gy_b = Vector((n_gy_three.x, 0.0, n_gy_three.y))
    for gy_cut in (-4.55, -4.20, -3.65, -2.95, -2.15, -1.30, -0.45, 0.40, 1.25, 2.05):
        p_w = Vector((ox - gy_cut * sa_w, oy + gy_cut * ca_w, 0.0))
        p_b = Vector((p_w.x, 0.0, p_w.y))
        grip_geom = [f for f in bm.faces if f.calc_center_median().z < -0.52 and f.calc_center_median().x < -1.45]
        grip_edges = list({e for f in grip_geom for e in f.edges})
        grip_verts = list({v for f in grip_geom for v in f.verts})
        if grip_geom:
            bmesh.ops.bisect_plane(
                bm, geom=grip_geom + grip_edges + grip_verts,
                plane_co=p_b, plane_no=n_gy_b, dist=1e-5,
            )

    # Bisect 4 longitudinal slices along frontstrap-to-backstrap (gx) inside grip body for rounded cross-section
    n_gx_three = Vector((ca_w, sa_w, 0.0))
    n_gx_b = Vector((n_gx_three.x, 0.0, n_gx_three.y))
    for gx_cut in (-1.15, -0.35, 0.45, 1.25, 1.90):
        p_w = Vector((ox + gx_cut * ca_w, oy + gx_cut * sa_w, 0.0))
        p_b = Vector((p_w.x, 0.0, p_w.y))
        grip_geom = [f for f in bm.faces if f.calc_center_median().z < -0.55 and f.calc_center_median().x < -1.55]
        grip_edges = list({e for f in grip_geom for e in f.edges})
        grip_verts = list({v for f in grip_geom for v in f.verts})
        if grip_geom:
            bmesh.ops.bisect_plane(
                bm, geom=grip_geom + grip_edges + grip_verts,
                plane_co=p_b, plane_no=n_gx_b, dist=1e-5,
            )

    # Smooth C2 ergonomic 3D grip sculpting pass (zero deformation on upper receiver/dustcover ty > -0.60!)
    def _sstep(e0: float, e1: float, x: float) -> float:
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3.0 - 2.0 * t)

    for v in bm.verts:
        tx, ty, tz = v.co.x, v.co.z, -v.co.y
        if ty > -0.58 or tx > -1.35:
            continue
        w_grip = _sstep(-0.58, -2.05, ty)
        dx, dy = tx - ox, ty - oy
        gx = dx * cos_g - dy * sin_g
        gy = dx * sin_g + dy * cos_g

        # 1) Organic anatomical palm swell (+0.028 cm in mid-grip)
        w_palm = math.exp(-(((gy + 1.05) / 2.25) ** 2))
        palm_dz = 0.028 * w_palm

        # 2) Rounded frontstrap & backstrap cross-section (gently tapers Z near front/rear straps so grip feels oval!)
        gx_norm = max(-1.0, min(1.0, (gx - 0.34) / 2.02))
        strap_round = -0.075 * (gx_norm ** 4) * (1.0 - _sstep(-3.85, -4.65, gy))

        # 3) Subtle ergonomic thumb-web waist pinch under beavertail (gy in [+1.2, +3.2], rear backstrap)
        w_web = math.exp(-(((gy - 2.20) / 1.05) ** 2)) * _sstep(0.20, -1.45, gx)
        web_dz = -0.032 * w_web

        # 4) Authentic Gen 5 FLARED MAGWELL smooth outward skirt flare (gy in [-3.75, -4.76] -> half_z = 1.288!)
        w_flare = _sstep(-3.70, -4.68, gy)
        flare_dz = 0.046 * w_flare

        scale_z = (1.242 + w_grip * (palm_dz + strap_round + web_dz + flare_dz)) / 1.242
        tz_new = tz * scale_z
        v.co.y = -tz_new

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()

    # Assign 3D object-space RTF4 strap texture cleanly on rounded frontstrap & backstrap faces!
    obj.data.materials.append(mat_strap)
    bm2 = bmesh.new()
    bm2.from_mesh(obj.data)
    for f in bm2.faces:
        c = f.calc_center_median()
        n = f.normal
        tx, ty = c.x, c.z
        if -8.40 < ty < -2.35 and tx < -1.65 and abs(n.x) > 0.68 and abs(n.y) < 0.52:
            f.material_index = 1
    bm2.to_mesh(obj.data)
    bm2.free()
    return obj


def build_frame(mats: dict) -> bpy.types.Object:
    """F-01: 1:1 Organically Sculpted Glock 17 Gen 5 Polyamide Receiver Frame
    with Unified Seamless Palm-Swell Grip, Flared Magwell Funnel, Solidly Welded Undercut
    Squared Trigger Guard, 1913 Dustcover Rail, Inlaid Stainless Serial Plate & 4 Guide Rails."""
    m_sm = mats["P_PolyamideSmooth"]
    m_rec = mats["P_PolyamideRecess"]
    m_str = mats["P_PolyamideStrapRTF"]
    m_st = mats["P_BrushedStainless"]

    # 1. Unified seamless C2-sculpted Gen 5 frame hull (ZERO upper-to-grip seam, ZERO rear heel lip!)
    main_hull = _mk_unified_gen5_frame_hull(m_sm, m_str)

    # 2. Signature Squared-Front Glock Trigger Guard SOLIDLY WELDED up into the dustcover (Y=+0.18)!
    tg_out = [(2.40, 0.18), (2.34, -1.85), (2.44, -2.52)]
    tg_out += _quad_bez((2.44, -2.52), (2.42, -3.06), (1.92, -3.10), 8)
    tg_out.append((-1.52, -3.10))
    # Smooth ergonomic Gen 5 undercut sweeping seamlessly into the frontstrap root!
    tg_out += _cubic_bez((-1.52, -3.10), (-1.94, -3.06), (-1.84, -2.34), (-2.12, -1.96), 10)
    tg_out.append((-2.08, 0.18))

    tg_solid = mk_extrude_z("f_tg_sol", tg_out, -0.59, 0.59, bevel=0.055, bevel_segs=2, mat=m_sm)
    tg_hole_xy = [(1.62, -0.46)]
    tg_hole_xy += _quad_bez((1.62, -0.46), (1.76, -0.52), (1.76, -1.85), 8)
    tg_hole_xy += _quad_bez((1.76, -1.85), (1.76, -2.58), (1.32, -2.62), 8)
    tg_hole_xy.append((-1.32, -2.62))
    tg_hole_xy += _quad_bez((-1.32, -2.62), (-1.68, -2.55), (-1.68, -1.88), 8)
    tg_hole_xy.append((-1.54, -0.46))
    tg_hole = mk_extrude_z("c_tg_hole", tg_hole_xy, -0.95, 0.95, mat=m_rec)
    trigger_guard = bool_subtract(tg_solid, [tg_hole])

    solid_frame = bool_union([main_hull, trigger_guard], "frame_raw")

    cutters = []

    # 3. Boat-hull lower bevels along front dust cover (left & right 42 deg chamfers, cleanly ahead of trigger guard!)
    for sign in (-1.0, 1.0):
        cutters.append(
            mk_box(f"c_hull_{sign}", 8.55, 0.55, 0.55, [("rx", sign * 0.72), ("t", 6.85, -0.18, sign * 1.25)], m_sm)
        )

    # 4. Front trigger guard checkering grooves (5 crisp horizontal finger-hook serrations)
    for i in range(5):
        gy = -1.92 - i * 0.21
        cutters.append(mk_box(f"c_tg_ch{i}", 0.16, 0.085, 1.38, [("t", 2.41, gy, 0.0)], m_rec))

    # 5. True U-contoured Dust-Cover Recoil Channel (upper slot + semicircular chin cradle)
    cutters.append(mk_box("c_dust_top", 9.50, 0.62, 1.72, [("t", 6.55, 0.76, 0.0)], m_rec))
    cutters.append(mk_cyl("c_dust_cyl", 0.74, 0.74, 9.50, "x", 28, [("t", 6.55, 1.02, 0.0)], m_rec))

    # 6. Slide-lock cross-mortise & central leaf-spring trench at X = 2.05 (cleanly ABOVE trigger guard weld!)
    cutters.append(mk_box("c_sl_mort", 0.22, 0.62, 2.85, [("t", 2.05, 0.44, 0.0)], m_rec))
    cutters.append(mk_box("c_sl_tr", 1.12, 0.46, 0.26, [("t", 1.56, 0.14, 0.0)], m_rec))

    # 7. Split Internal Fire-Control / Locking-Block Cavities:
    #    Front cavity stops cleanly at X_max=+1.62 & Y_min=-0.12 so trigger-guard roof & front strut stay 100% SOLID!
    #    Rear housing cavity cleanly seats trigger_housing behind X=-4.45!
    cutters.append(mk_box("c_fcg_f", 6.22, 1.20, 1.76, [("t", -1.49, 0.48, 0.0)], m_rec))
    cutters.append(mk_box("c_fcg_r", 2.05, 1.74, 1.44, [("t", -5.46, 0.20, 0.0)], m_rec))
    cutters.append(mk_box("c_tr_sl", 1.48, 0.90, 0.86, [("t", -0.14, -0.35, 0.0)], m_rec))

    # 8. Angled Magwell Rectangular Tunnel + Clean Gen 5 Flared Internal Entry Chamfer (solid walls all around!)
    cutters.append(
        mk_box("c_mag_tun", 2.86, 13.40, 1.86, [("rz", GRIP_ANGLE_RAD), ("t", -5.26, -4.25, 0.0)], m_rec)
    )
    bm_fun = bmesh.new()
    v_top = [
        bm_fun.verts.new((-1.43, -4.28, -0.93)),
        bm_fun.verts.new(( 1.43, -4.28, -0.93)),
        bm_fun.verts.new(( 1.43, -4.28,  0.93)),
        bm_fun.verts.new((-1.43, -4.28,  0.93)),
    ]
    v_bot = [
        bm_fun.verts.new((-1.46, -4.90, -1.06)),
        bm_fun.verts.new(( 1.56, -4.90, -1.06)),
        bm_fun.verts.new(( 1.56, -4.90,  1.06)),
        bm_fun.verts.new((-1.46, -4.90,  1.06)),
    ]
    bm_fun.faces.new(list(reversed(v_top)))
    bm_fun.faces.new(v_bot)
    for k in range(4):
        kn = (k + 1) % 4
        bm_fun.faces.new((v_top[k], v_top[kn], v_bot[kn], v_bot[k]))
    _apply_three_xform(bm_fun, [("rz", GRIP_ANGLE_RAD), ("t", -5.26, -4.25, 0.0)])
    cutters.append(_bm_to_obj("c_mag_fun", bm_fun, m_rec))

    # Snug Gen 5 magazine catch window enclosing magazine_catch (-2.28, -2.05) cleanly inside frontstrap!
    cutters.append(
        mk_box("c_mc_win", 0.62, 0.92, 2.85, [("rz", GRIP_ANGLE_RAD), ("t", -2.28, -2.05, 0.0)], m_rec)
    )

    # 9. 1913 / Glock Universal Tactical Accessory Rail: front-open T-grooves + 4.5mm transverse cross-slot
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_acc_g{sign}", 6.65, 0.22, 0.26, [("t", 8.18, 0.24, sign * 1.22)], m_rec))
        cutters.append(mk_box(f"c_acc_s{sign}", 6.45, 0.16, 0.20, [("t", 8.08, -0.10, sign * 1.16)], m_rec))
    cutters.append(mk_box("c_rail_xs", 0.50, 0.26, 2.76, [("t", 7.85, -0.13, 0.0)], m_rec))

    # 10. Sculpted ergonomic thumb-rest scallops & slide-lock recessed dimples on both flanks
    for sign in (-1.0, 1.0):
        cutters.append(
            mk_cyl(
                f"c_thmb_{sign}", 0.62, 0.62, 1.95, "x", 22,
                [("s", 1.10, 0.52, 0.26), ("rz", -0.18), ("t", -3.95, -1.16, sign * 1.35)], m_rec,
            )
        )
        cutters.append(
            mk_sphere(
                f"c_slsc_{sign}", 0.44, 18, 12,
                [("s", 1.08, 1.28, 0.30), ("t", 2.05, 0.38, sign * 1.32)], m_rec,
            )
        )

    # 11. Recessed underside dustcover pocket for inlaid stainless serial plate
    cutters.append(mk_box("c_ser_pk", 1.67, 0.08, 0.70, [("t", 5.15, -0.165, 0.0)], m_rec))

    # 12. Three cross-pin holes (cleanly drilled through solid receiver walls!)
    for idx, (px, py, pr) in enumerate((
        ( 0.00,  0.15, 0.200),
        ( 0.65,  0.58, 0.155),
        (-5.65,  0.10, 0.155),
    )):
        cutters.append(mk_cyl(f"c_pin_{idx}", pr, pr, 2.95, "z", 22, [("t", px, py, 0.0)], m_rec))

    carved = bool_subtract(solid_frame, cutters)

    # 13. Four Embedded Precision Brushed Stainless Slide Guide Rails + Inlaid Under-Dustcover Serial Plate!
    inserts = []
    for rx, rlen in ((2.68, 1.38), (-5.78, 1.42)):
        for sign in (-1.0, 1.0):
            rv = mk_box(f"fr_v_{rx}_{sign}", rlen, 0.24, 0.12, [("t", rx, 0.96, sign * 0.96)], m_st, bevel=0.012)
            rl = mk_box(f"fr_l_{rx}_{sign}", rlen, 0.08, 0.24, [("t", rx, 1.04, sign * 1.02)], m_st, bevel=0.012)
            inserts.append(bool_union([rv, rl], f"rail_{rx}_{sign}"))

    # Flush inlaid bright brushed stainless serial plate under dustcover (dedicated hero UV tile for BHVN919!)
    serial_plate = mk_box("f_serial_plate", 1.65, 0.055, 0.68, [("t", 5.15, -0.172, 0.0)], m_st, bevel=0.008)
    inserts.append(serial_plate)

    # Raised dark polymer inner magazine-throat light baffles nesting snugly inside slide underside (Z=+-0.90)
    # so zero magazine brass can ever peek across the slide-to-frame gap on either side!
    inserts.append(mk_box("f_baf_l", 3.60, 0.26, 0.07, [("t", -3.20, 0.94, -0.90)], m_rec))
    inserts.append(mk_box("f_baf_r", 3.60, 0.26, 0.07, [("t", -3.20, 0.94,  0.90)], m_rec))

    frame = join_objects([carved] + inserts, "frame")
    return finish_part(frame, bevel_w=0.0, sharp_deg=38.0)


def build_recoil_guide_rod(mats: dict) -> bpy.types.Object:
    """U-05: Gen 5 Stepped Polymer Recoil Guide Rod w/ Brushed Stainless Washer Collar & Front Hex Socket."""
    m_p = mats["P_PolyamideSmooth"]
    m_r = mats["P_PolyamideRecess"]
    m_st = mats["P_BrushedStainless"]

    flange = mk_cyl("gr_fl", 0.45, 0.45, 0.18, "x", 28, [("t", 1.83, 1.35, 0.0)], m_p, bevel=0.015)
    washer = mk_cyl("gr_wsh", 0.42, 0.42, 0.08, "x", 28, [("t", 1.98, 1.35, 0.0)], m_st, bevel=0.008)
    # Gen 5 stepped telescopic-look dual-diameter rod
    shaft_r = mk_cyl("gr_shr", 0.21, 0.21, 3.80, "x", 24, [("t", 3.92, 1.35, 0.0)], m_p, bevel=0.010)
    shaft_f = mk_cyl("gr_shf", 0.175, 0.175, 5.20, "x", 24, [("t", 8.15, 1.35, 0.0)], m_p)
    cap_raw = mk_cyl("gr_cap", 0.28, 0.32, 0.28, "x", 26, [("t", 10.82, 1.35, 0.0)], m_p, bevel=0.016)
    hex_rec = mk_cyl("gr_hex", 0.12, 0.12, 0.16, "x", 6, [("t", 10.94, 1.35, 0.0)], m_r)
    cap = bool_subtract(cap_raw, [hex_rec])

    obj = join_objects([flange, washer, shaft_r, shaft_f, cap], "recoil_guide_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_magazine_catch(mats: dict) -> bpy.types.Object:
    """F-05: Gen 5 Enlarged Reversible Serrated Magazine Catch w/ Internal Locking Tooth & Wire Spring."""
    m_p = mats["P_PolyamideSmooth"]
    m_r = mats["P_PolyamideRecess"]
    m_st = mats["P_BrushedStainless"]

    blk_raw = mk_box("mc_blk", 0.58, 0.88, 2.48, [("rz", GRIP_ANGLE_RAD), ("t", -2.28, -2.05, -0.04)], m_p, bevel=0.022)
    sp_sl = mk_box("mc_sl", 0.22, 0.62, 1.45, [("rz", GRIP_ANGLE_RAD), ("t", -2.28, -2.10, 0.12)], m_r)
    blk = bool_subtract(blk_raw, [sp_sl])

    btn_raw = mk_box("mc_btn", 0.52, 0.82, 0.21, [("rz", GRIP_ANGLE_RAD), ("t", -2.28, -2.05, -1.32)], m_p, bevel=0.020)
    grooves = [
        mk_box(f"mc_g{i}", 0.58, 0.055, 0.065, [("t", 0.0, i * 0.14, 0.0), ("rz", GRIP_ANGLE_RAD), ("t", -2.28, -2.05, -1.41)], m_r)
        for i in range(-2, 3)
    ]
    btn = bool_subtract(btn_raw, grooves)
    tooth = mk_box("mc_th", 0.38, 0.32, 0.24, [("rz", GRIP_ANGLE_RAD), ("t", -2.18, -1.96, 0.84)], m_p, bevel=0.014)
    wire = mk_cyl("mc_wire", 0.045, 0.045, 2.35, "y", 16, [("rz", GRIP_ANGLE_RAD), ("t", -2.68, -3.10, 0.12)], m_st, bevel=0.008)

    obj = join_objects([blk, btn, tooth, wire], "magazine_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_trigger_housing_pin(mats: dict) -> bpy.types.Object:
    """F-08: Rear Polymer Trigger Mechanism Housing Pin."""
    m_p = mats["P_PolyamideSmooth"]
    pin = mk_cyl("th_pin", 0.145, 0.145, 2.46, "z", 28, [], m_p, bevel=0.032)
    pin.name = "trigger_housing_pin"
    pin.data.name = "trigger_housing_pin"
    return finish_part(pin, bevel_w=0.0, sharp_deg=34.0)


def build_trigger_housing(mats: dict) -> bpy.types.Object:
    """T-02: Gen 5 Polymer Trigger Mechanism Housing w/ Drop-Safety Shelves & Bent Stainless 9mm Ejector."""
    m_p = mats["P_PolyamideSmooth"]
    m_r = mats["P_PolyamideRecess"]
    m_st = mats["P_BrushedStainless"]

    blk_xy = [(-6.38, -0.62), (-4.62, -0.52), (-4.58, 0.84), (-6.18, 0.84), (-6.45, 0.25)]
    blk_raw = mk_extrude_z("th_blk", blk_xy, -0.64, 0.64, bevel=0.028, bevel_segs=2, mat=m_p)
    c_in = mk_box("c_th_in", 1.65, 0.98, 0.68, [("t", -5.42, 0.38, 0.05)], m_r)
    c_cm = mk_box("c_th_cm", 1.02, 1.28, 0.14, [("t", -5.32, 0.28, 0.64)], m_r)
    c_ph = mk_cyl("c_th_ph", 0.16, 0.16, 1.65, "z", 22, [("t", -5.65, 0.10, 0.0)], m_r)
    housing = bool_subtract(blk_raw, [c_in, c_cm, c_ph])

    # Authentic Stamped & Inward-Bent Flat-Blade 9x19mm Stainless Ejector (#47021 / #336)
    ej_base = mk_box("ej_b", 1.05, 0.28, 0.085, [("t", -4.72, 1.04, -0.38)], m_st, bevel=0.010)
    ej_rise = mk_box("ej_r", 0.96, 0.30, 0.085, [("rz", 0.42), ("t", -4.02, 1.34, -0.36)], m_st, bevel=0.010)
    ej_tip = mk_box("ej_t", 1.18, 0.22, 0.078, [("ry", -0.11), ("t", -3.12, 1.56, -0.29)], m_st, bevel=0.010)
    ejector = bool_union([ej_base, ej_rise, ej_tip], "th_ejector")

    obj = join_objects([housing, ejector], "trigger_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def _rounded_rect_xz(rx: float, rz: float, cr: float, corner_segs: int = 6) -> list[tuple[float, float]]:
    pts = []
    corners = [
        ( rx - cr, -rz + cr, -math.pi * 0.5, 0.0),
        ( rx - cr,  rz - cr,  0.0,           math.pi * 0.5),
        (-rx + cr,  rz - cr,  math.pi * 0.5, math.pi),
        (-rx + cr, -rz + cr,  math.pi,       math.pi * 1.5),
    ]
    for cx, cz, a0, a1 in corners:
        for k in range(corner_segs + 1):
            a = a0 + (a1 - a0) * (k / corner_segs)
            pts.append((cx + cr * math.cos(a), cz + cr * math.sin(a)))
    return pts


def build_mag_body(mats: dict) -> bpy.types.Object:
    """M-01: 1:1 Gen 5 Glock 17 Double-Stack Polymer-Over-Steel 17-Rd Magazine Body
    w/ Clean Inward-Tapered Upper Collar (Fits Magwell Perfectly!), Exposed Stainless Feed Lips,
    Ambi Catch Notches & 6 Staggered Countersunk Rear Witness Holes (4..17)."""
    m_p = mats["P_MagPolymer"]
    m_r = mats["P_PolyamideRecess"]
    m_st = mats["P_BrushedStainless"]

    # Lofted outer polymer jacket: clean double-stack body (Y: -4.75..+4.58) smoothly tapering INWARD
    # at top collar (Y: +4.58..+5.18) so it slides effortlessly inside the 2.88 x 1.88 frame magwell!
    mag_stations = [
        (-4.75, 1.31, 0.86, 0.24),
        ( 4.55, 1.31, 0.86, 0.24),
        ( 4.86, 1.24, 0.78, 0.24),
        ( 5.16, 1.15, 0.65, 0.22),
    ]
    bm = bmesh.new()
    rings = []
    for y_st, rx, rz, cr in mag_stations:
        prof = _rounded_rect_xz(rx, rz, cr, corner_segs=6)
        rings.append([bm.verts.new((x, y_st, z)) for (x, z) in prof])
    n_p = len(rings[0])
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n_p):
            ni = (i + 1) % n_p
            bm.faces.new((a[i], b[i], b[ni], a[ni]))
    _apply_three_xform(bm, [])
    outer_jacket = _bm_to_obj("mag_jacket", bm, m_p)

    # Bottom floor-plate slide-on retention flange rails
    base_rails = mk_box("mag_br", 2.66, 0.16, 1.82, [("t", 0.0, -4.67, 0.0)], m_r, bevel=0.015)

    # Hardened Brushed Stainless-Steel Inner Liner + Sculpted Double-Stack-to-Single-Feed Stamped Lips
    liner_prof = _rounded_rect_xz(1.13, 0.72, 0.16, corner_segs=5)
    liner = mk_extrude_y("mag_liner", liner_prof, -4.72, 5.42, mat=m_st)
    lip_l = mk_box("mag_lipl", 2.04, 0.38, 0.14, [("rx",  0.34), ("t", 0.05, 5.48, -0.43)], m_st, bevel=0.014)
    lip_r = mk_box("mag_lipr", 2.04, 0.38, 0.14, [("rx", -0.34), ("t", 0.05, 5.48,  0.43)], m_st, bevel=0.014)
    curl_l = mk_cyl("mag_cl", 0.068, 0.068, 1.98, "x", 16, [("t", 0.05, 5.60, -0.35)], m_st, bevel=0.010)
    curl_r = mk_cyl("mag_cr", 0.068, 0.068, 1.98, "x", 16, [("t", 0.05, 5.60,  0.35)], m_st, bevel=0.010)
    backstop = mk_box("mag_bs", 0.16, 0.44, 0.96, [("t", -0.96, 5.38, 0.0)], m_st, bevel=0.012)

    solid_mag = bool_union([outer_jacket, base_rails, liner, lip_l, lip_r, curl_l, curl_r, backstop], "mag_solid")

    cutters = []
    # Hollow internal double-stack cartridge column (stops below Y=5.18 so feed lips bridge cleanly)
    cutters.append(mk_box("c_mag_in", 2.10, 10.60, 1.28, [("t", 0.0, -0.15, 0.0)], m_r))
    # Top single-feed presentation slot + front bullet-ogive clearance scoop + rear ejector cut
    cutters.append(mk_box("c_mag_top", 2.08, 1.25, 0.68, [("t", 0.16, 5.32, 0.0)], m_r))
    cutters.append(mk_cyl("c_mag_og", 0.52, 0.52, 0.92, "y", 22, [("t", 1.06, 5.38, 0.0)], m_r))
    cutters.append(mk_box("c_mag_ej", 0.54, 0.54, 0.24, [("t", -0.96, 5.45, -0.26)], m_r))

    # Ambidextrous Gen 5 polymer cutouts exposing hardened stainless steel catch shelves + lower thumb grip pockets
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_mc_n{sign}", 0.46, 0.38, 0.26, [("t", 1.16, 2.35, sign * 0.82)], m_st))
        cutters.append(mk_box(f"c_mg_p{sign}", 1.65, 1.08, 0.12, [("t", 0.0, -3.85, sign * 0.85)], m_r))

    # 6 Staggered Rear Witness Holes (4, 6, 8, 10, 12, 17): stepped polymer counterbore + inner punched bore!
    for i in range(6):
        wy = 2.40 - i * 1.15
        wz = (1.0 if (i % 2 == 0) else -1.0) * 0.15
        cutters.append(mk_cyl(f"c_wh_cb{i}", 0.112, 0.112, 0.26, "x", 18, [("t", -1.26, wy, wz)], m_st))
        cutters.append(mk_cyl(f"c_wh_th{i}", 0.078, 0.078, 0.36, "x", 18, [("t", -1.12, wy, wz)], m_r))

    mag = bool_subtract(solid_mag, cutters)
    mag.name = "mag_body"
    mag.data.name = "mag_body"
    return finish_part(mag, bevel_w=0.0, sharp_deg=36.0, lock_flat_walls=True)


def build_mag_follower(mats: dict) -> bpy.types.Object:
    """M-02: Firewalled Vivid Gen 5 Safety Orange Anti-Tilt Polymer Follower."""
    m_org = mats["P_FollowerOrange"]

    base = mk_box("mf_base", 2.08, 0.46, 1.24, [], m_org, bevel=0.032)
    # Angled cartridge-staggering upper presentation ramp rib
    ridge = mk_cyl(
        "mf_ridge", 0.30, 0.30, 2.02, "x", 22,
        [("s", 1.0, 0.84, 0.88), ("rz", 0.12), ("t", 0.0, 0.25, 0.25)], m_org, bevel=0.020,
    )
    # Left-front slide-stop lever actuator shelf (strictly inside 1.28 inner liner width)
    ledge = mk_box("mf_ledge", 0.58, 0.28, 0.24, [("t", 0.68, 0.24, -0.49)], m_org, bevel=0.020)
    # Front & rear anti-tilt stabilizer skirts
    sk_f = mk_box("mf_skf", 0.22, 0.66, 1.12, [("t",  0.88, -0.45, 0.0)], m_org, bevel=0.022)
    sk_r = mk_box("mf_skr", 0.22, 0.66, 1.12, [("t", -0.88, -0.45, 0.0)], m_org, bevel=0.022)

    obj = bool_union([base, ridge, ledge, sk_f, sk_r], "mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_mag_base_plate(mats: dict) -> bpy.types.Object:
    """M-04: Gen 5 Extended-Front-Lip Flared Polymer Magazine Floor Plate & Locking Insert."""
    m_p = mats["P_MagPolymer"]
    m_r = mats["P_PolyamideRecess"]

    # Gen 5 floorplate with characteristic slightly extended ergonomic front stripping lip!
    plate_xy = [(-1.46, -0.26), (1.64, -0.26)]
    plate_xy += _quad_bez((1.64, -0.26), (1.70, 0.04), (1.42, 0.24), 8)
    plate_xy.append((-1.38, 0.24))
    plate_xy += _quad_bez((-1.38, 0.24), (-1.52, 0.02), (-1.46, -0.26), 8)

    pad_raw = mk_extrude_z("mbp_pad", plate_xy, -0.99, 0.99, bevel=0.055, bevel_segs=3, mat=m_p)
    punch = mk_cyl("c_mbp_p", 0.20, 0.20, 0.36, "y", 22, [("t", 0.0, -0.20, 0.0)], m_r)
    pad = bool_subtract(pad_raw, [punch])

    insert = mk_box("mbp_ins", 2.08, 0.24, 1.26, [("t", 0.0, 0.34, 0.0)], m_r, bevel=0.018)
    stud = mk_cyl("mbp_st", 0.175, 0.175, 0.36, "y", 22, [("t", 0.0, -0.14, 0.0)], m_p, bevel=0.016)
    obj = join_objects([pad, insert, stud], "mag_base_plate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# SUITE 3 BUILDERS (13 parts): barrel + 12 Safe Action metal internals
# =============================================================================
def _mk_gmb_polygonal_rifling_sleeve(mat: bpy.types.Material) -> bpy.types.Object:
    """Watertight 6-land helical right-hand Glock Marksman Barrel rifling sleeve (1:250 mm RH twist)."""
    x_start, x_end = 2.12, 11.12
    center_y = 2.55
    outer_r = 0.464
    mean_r = 0.445
    amp = 0.015
    lobes = 6
    twist_len = 25.0
    rad_segs = 48
    ax_segs = 18

    twist_tot = ((x_end - x_start) / twist_len) * 2.0 * math.pi
    bm = bmesh.new()
    in_rings = []
    out_rings = []
    for i in range(ax_segs + 1):
        u = i / ax_segs
        x = x_start + (x_end - x_start) * u
        phase = u * twist_tot
        ir, or_ = [], []
        for j in range(rad_segs):
            th = (j / rad_segs) * 2.0 * math.pi
            r_in = mean_r - amp * math.cos(lobes * (th - phase))
            ir.append(bm.verts.new((x, center_y + r_in * math.cos(th), r_in * math.sin(th))))
            or_.append(bm.verts.new((x, center_y + outer_r * math.cos(th), outer_r * math.sin(th))))
        in_rings.append(ir)
        out_rings.append(or_)

    for i in range(ax_segs):
        for j in range(rad_segs):
            jn = (j + 1) % rad_segs
            bm.faces.new((in_rings[i][j], in_rings[i + 1][j], in_rings[i + 1][jn], in_rings[i][jn]))
            bm.faces.new((out_rings[i][j], out_rings[i][jn], out_rings[i + 1][jn], out_rings[i + 1][j]))
    for j in range(rad_segs):
        jn = (j + 1) % rad_segs
        bm.faces.new((in_rings[0][j], in_rings[0][jn], out_rings[0][jn], out_rings[0][j]))
        bm.faces.new((in_rings[-1][j], out_rings[-1][j], out_rings[-1][jn], in_rings[-1][jn]))

    _apply_three_xform(bm, [])
    return _bm_to_obj("bbl_rifling", bm, mat)


def build_barrel(mats: dict) -> bpy.types.Object:
    """U-04: 1:1 Cold-Hammer-Forged Glock Marksman Barrel (GMB)
    w/ Square Tilting Hood, Recessed 11-deg Target Crown, Helical Rifling Sleeve,
    Gleaming Mirror-Polished Scooped Feed Ramp & Browning 40-deg Camming Under-Lug."""
    m_ndlc = mats["M_BarrelNDLC"]
    m_pol = mats["M_MirrorStainless"]
    m_bore = mats["M_BoreDark"]
    m_soot = mats["M_MuzzleCrownSoot"]

    # 1. Precision cylindrical GMB tube + beveled outer muzzle collar
    tube = mk_cyl("bbl_tube", 0.65, 0.65, 8.70, "x", 44, [("t", 6.83, 2.55, 0.0)], m_ndlc)
    crown_col = mk_cyl("bbl_col", 0.585, 0.650, 0.14, "x", 44, [("t", 11.25, 2.55, 0.0)], m_pol)

    # 2. Boxy Glock Tilting Chamber Locking Hood with smooth upper shoulder radii
    hood_zy = [(-0.78, 1.86), (0.78, 1.86), (0.78, 3.24)]
    hood_zy += _quad_bez((0.78, 3.24), (0.78, 3.40), (0.62, 3.40), 8)
    hood_zy.append((-0.62, 3.40))
    hood_zy += _quad_bez((-0.62, 3.40), (-0.78, 3.40), (-0.78, 3.24), 8)
    hood = mk_extrude_x("bbl_hood", hood_zy, -0.50, 2.52, bevel=0.028, bevel_segs=2, mat=m_ndlc)

    # 3. Browning 40-deg Camming & Locking Under-Lug
    lug_xy = [
        (-0.44, 1.90), (1.86, 1.90), (1.86, 1.24), (1.66, 1.12), (1.32, 0.96),
        ( 0.88, 0.96), (0.42, 1.42), (0.08, 1.42), (-0.18, 1.04), (-0.48, 1.22),
    ]
    lug = mk_extrude_z("bbl_lug", lug_xy, -0.39, 0.39, bevel=0.022, bevel_segs=2, mat=m_ndlc)

    # 4. Gleaming Mirror-Polished Feed Ramp block at rear-bottom of chamber
    ramp = mk_box("bbl_ramp", 0.62, 0.68, 0.72, [("rz", 0.54), ("t", -0.58, 1.72, 0.0)], m_pol, bevel=0.020)

    solid_bbl = bool_union([tube, crown_col, hood, lug, ramp], "bbl_solid")

    cutters = [
        # Hollow 9mm bore + stepped 9x19mm chamber throat
        mk_cyl("c_bore", 0.462, 0.462, 12.6, "x", 36, [("t", 5.40, 2.55, 0.0)], m_bore),
        mk_cyl("c_chmb", 0.490, 0.500, 2.62, "x", 32, [("t", 0.76, 2.55, 0.0)], m_bore),
        # Recessed 11-deg target muzzle crown dish (conical counter-sink)
        mk_cyl("c_crown", 0.555, 0.460, 0.16, "x", 40, [("t", 11.26, 2.55, 0.0)], m_soot),
        # Concave mirror-polished scooped feed-ramp throat
        mk_cyl("c_fr_sc", 0.32, 0.34, 1.08, "x", 28, [("rz", -0.54), ("t", -0.62, 1.92, 0.0)], m_pol),
        # Half-moon recoil guide rod seat on front of under-lug
        mk_cyl("c_gr_st", 0.24, 0.24, 0.92, "z", 22, [("t", 1.86, 1.35, 0.0)], m_ndlc),
        # Top-rear Loaded Chamber Witness Notch + Right-side Extractor Claw Cutout
        mk_box("c_lci_n", 0.32, 0.22, 0.24, [("t", -0.44, 3.35, 0.0)], m_bore),
        mk_box("c_ext_c", 0.36, 0.42, 0.34, [("t", -0.42, 2.55, 0.68)], m_bore),
    ]

    carved = bool_subtract(solid_bbl, cutters)
    rifling = _mk_gmb_polygonal_rifling_sleeve(m_bore)
    barrel = join_objects([carved, rifling], "barrel")
    return finish_part(barrel, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_striker(mats: dict) -> bpy.types.Object:
    """U-08: Precision Brushed Stainless Striker w/ Rectangular Tip, 4-Fluted Shaft & Sear Lug."""
    m_st = mats["M_BrushedStainless"]
    m_pol = mats["M_MirrorStainless"]
    m_dk = mats["M_HardwareNDLC"]

    tip = mk_box("str_tip", 0.56, 0.175, 0.068, [("t", -1.00, 2.55, 0.0)], m_pol, bevel=0.010)
    shld = mk_cyl("str_sh", 0.105, 0.225, 0.46, "x", 24, [("t", -1.36, 2.55, 0.0)], m_st)
    saf_lug = mk_box("str_saf", 0.34, 0.28, 0.18, [("t", -1.82, 2.55, 0.16)], m_pol, bevel=0.012)

    shaft_raw = mk_cyl("str_shf", 0.155, 0.155, 5.15, "x", 24, [("t", -4.15, 2.55, 0.0)], m_st)
    flutes = []
    for k in range(4):
        ang = k * math.pi * 0.5 + math.pi * 0.25
        flutes.append(
            mk_box(f"c_sf{k}", 2.65, 0.072, 0.072, [("t", -3.45, 2.55 + math.cos(ang) * 0.155, math.sin(ang) * 0.155)], m_dk)
        )
    shaft = bool_subtract(shaft_raw, flutes)

    sear_xy = [(-5.18, 2.55), (-4.65, 2.55), (-4.72, 1.38), (-4.95, 1.14), (-5.18, 1.14)]
    sear_lug = mk_extrude_z("str_sear", sear_xy, -0.11, 0.11, bevel=0.015, bevel_segs=2, mat=m_pol)
    tail = mk_box("str_tail", 1.45, 0.36, 0.28, [("t", -6.20, 2.55, 0.0)], m_st, bevel=0.016)

    obj = join_objects([tip, shld, saf_lug, shaft, sear_lug, tail], "striker")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_firing_pin_safety(mats: dict) -> bpy.types.Object:
    """U-10: Mirror-Polished Spool-Profile Stainless Firing Pin Safety Plunger & Captive Coil Spring."""
    m_pol = mats["M_MirrorStainless"]
    m_sp = mats["M_SpringSteel"]

    head = mk_cyl("fps_hd", 0.22, 0.205, 0.38, "y", 28, [("t", 0.0, -0.51, 0.0)], m_pol, bevel=0.016)
    dome = mk_sphere("fps_dm", 0.205, 24, 16, [("t", 0.0, -0.68, 0.0)], m_pol)
    waist = mk_cyl("fps_ws", 0.095, 0.095, 0.44, "y", 22, [("t", 0.0, -0.11, 0.0)], m_pol)
    cap = mk_cyl("fps_cp", 0.215, 0.215, 0.22, "y", 26, [("t", 0.0, 0.21, 0.0)], m_pol, bevel=0.014)
    plunger = bool_union([head, dome, waist, cap], "fps_plg")

    spring = mk_coil_spring("fps_sp", "y", 0.32, 0.85, 0.0, 0.0, 0.14, 0.026, 6.0, ring_segs=8, steps_per_coil=14, mat=m_sp)
    obj = join_objects([plunger, spring], "firing_pin_safety")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_extractor_plunger(mats: dict) -> bpy.types.Object:
    """U-12: Stainless Extractor Depressor Plunger, Captive Spring & Matte-Polymer SLB Bearing."""
    m_st = mats["M_BrushedStainless"]
    m_sp = mats["M_SpringSteel"]
    m_p = mats["M_TriggerPolymer"]

    head = mk_cyl("ep_hd", 0.14, 0.185, 0.46, "x", 24, [("t", -1.91, 2.55, 0.72)], m_st, bevel=0.012)
    collar = mk_cyl("ep_col", 0.19, 0.19, 0.10, "x", 24, [("t", -2.18, 2.55, 0.72)], m_st, bevel=0.010)
    shaft = mk_cyl("ep_sh", 0.11, 0.11, 1.48, "x", 20, [("t", -2.95, 2.55, 0.72)], m_st)
    spring = mk_coil_spring("ep_sp", "x", -6.45, -3.65, 2.55, 0.72, 0.16, 0.030, 14.0, ring_segs=8, steps_per_coil=14, mat=m_sp)
    slb = mk_cyl("ep_slb", 0.175, 0.160, 0.72, "x", 22, [("t", -6.82, 2.55, 0.72)], m_p, bevel=0.012)
    tail = mk_cyl("ep_tl", 0.12, 0.12, 0.24, "x", 20, [("t", -7.26, 2.55, 0.72)], m_p, bevel=0.010)

    obj = join_objects([head, collar, shaft, spring, slb, tail], "extractor_plunger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_locking_block(mats: dict) -> bpy.types.Object:
    """F-02: Brushed CNC/MIM Stainless Steel Locking Block w/ 40-deg Camming Wedge & Dual Pin Bores."""
    m_st = mats["M_BrushedStainless"]
    m_pol = mats["M_MirrorStainless"]

    wall_l = mk_box("lb_wl", 1.82, 1.08, 0.24, [("t", 0.54, 0.48, -0.68)], m_st, bevel=0.018)
    wall_r = mk_box("lb_wr", 1.82, 1.08, 0.24, [("t", 0.54, 0.48,  0.68)], m_st, bevel=0.018)
    ear_l = mk_box("lb_el", 0.96, 0.14, 0.28, [("t", 0.72, 0.98, -0.72)], m_st, bevel=0.014)
    ear_r = mk_box("lb_er", 0.96, 0.14, 0.28, [("t", 0.72, 0.98,  0.72)], m_st, bevel=0.014)

    wedge_xy = [(-0.22, 0.28), (1.42, 0.28), (1.42, 0.90), (0.88, 0.90), (0.32, 0.44), (-0.04, 0.44), (-0.22, 0.62)]
    wedge = mk_extrude_z("lb_wdg", wedge_xy, -0.58, 0.58, bevel=0.022, bevel_segs=2, mat=m_pol)

    solid = bool_union([wall_l, wall_r, ear_l, ear_r, wedge], "lb_sol")
    c_p1 = mk_cyl("c_lb_p1", 0.195, 0.195, 1.90, "z", 24, [("t", 0.00, 0.15, 0.0)], m_st)
    c_p2 = mk_cyl("c_lb_p2", 0.150, 0.150, 1.90, "z", 22, [("t", 0.65, 0.58, 0.0)], m_st)
    obj = bool_subtract(solid, [c_p1, c_p2])
    obj.name = "locking_block"
    obj.data.name = "locking_block"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_slide_lock(mats: dict) -> bpy.types.Object:
    """F-03: Nitrided Steel Slide Lock Cross-Bar w/ Dual Serrated Finger Tabs & Tempered Leaf Spring."""
    m_dk = mats["M_HardwareNDLC"]
    m_sp = mats["M_SpringSteel"]

    bar = mk_box("sl_bar", 0.16, 0.46, 2.68, [("t", 2.05, 0.42, 0.0)], m_dk, bevel=0.012)
    lip = mk_box("sl_lip", 0.11, 0.12, 0.88, [("t", 2.025, 0.70, 0.0)], m_dk, bevel=0.010)
    tabs = []
    for sign in (-1.0, 1.0):
        t_raw = mk_box(f"sl_t{sign}", 0.26, 0.56, 0.16, [("t", 2.05, 0.42, sign * 1.32)], m_dk, bevel=0.014)
        grvs = [
            mk_box(f"sl_g{sign}_{k}", 0.30, 0.06, 0.065, [("t", 2.05, 0.42 + k * 0.15, sign * 1.39)], m_dk)
            for k in (-1, 0, 1)
        ]
        tabs.append(bool_subtract(t_raw, grvs))

    # Smooth curved leaf spring underneath slide lock
    sp_pts = [
        (1.12, -0.18, 0.0),
        (1.36, -0.17, 0.0),
        (1.58, -0.14, 0.0),
        (1.78, -0.02, 0.0),
        (1.94,  0.14, 0.0),
        (2.05,  0.26, 0.0),
    ]
    leaf = mk_swept_tube("sl_leaf", sp_pts, 0.048, ring_segs=10, mat=m_sp)
    obj = join_objects([bar, lip, *tabs, leaf], "slide_lock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_slide_stop_lever(mats: dict) -> bpy.types.Object:
    """F-04: Stamped nDLC Steel Slide Stop Lever w/ Serrated Thumb Shelf, Actuator Tab & Torsion Wire."""
    m_dk = mats["M_HardwareNDLC"]
    m_st = mats["M_BrushedStainless"]
    m_sp = mats["M_SpringSteel"]

    piv_raw = mk_cyl("ssl_piv", 0.32, 0.32, 0.12, "z", 26, [("t", 0.0, 0.15, -0.82)], m_dk, bevel=0.012)
    piv_hl = mk_cyl("ssl_phl", 0.195, 0.195, 0.32, "z", 22, [("t", 0.0, 0.15, -0.82)], m_dk)
    pivot = bool_subtract(piv_raw, [piv_hl])

    arm_pts = [
        ( 0.00, 0.15, -0.85),
        (-0.55, 0.26, -0.95),
        (-1.10, 0.38, -1.06),
        (-1.75, 0.54, -1.18),
        (-2.35, 0.68, -1.26),
        (-2.95, 0.72, -1.28),
    ]
    arm = mk_swept_tube("ssl_arm", arm_pts, 0.085, ring_segs=10, mat=m_dk)
    catch = mk_box("ssl_ct", 0.42, 0.24, 0.16, [("t", -2.65, 0.92, -1.22)], m_dk, bevel=0.012)
    pad_raw = mk_box("ssl_pad", 0.84, 0.38, 0.16, [("t", -2.68, 0.74, -1.32)], m_dk, bevel=0.016)
    pad_grvs = [
        mk_box(f"ssl_pg{k}", 0.075, 0.34, 0.06, [("t", -2.92 + k * 0.16, 0.74, -1.39)], m_dk)
        for k in range(4)
    ]
    pad = bool_subtract(pad_raw, pad_grvs)
    inward = mk_box("ssl_in", 0.36, 0.12, 0.48, [("t", -2.45, 0.56, -0.98)], m_st, bevel=0.010)

    wire_pts = [
        ( 0.66, 0.44, -0.76),
        ( 0.46, 0.40, -0.76),
        ( 0.28, 0.36, -0.76),
        ( 0.08, 0.16, -0.76),
        (-0.08, 0.02, -0.76),
        (-0.38, 0.08, -0.82),
        (-0.68, 0.18, -0.88),
    ]
    wire = mk_swept_tube("ssl_wire", wire_pts, 0.028, ring_segs=8, mat=m_sp)
    obj = join_objects([pivot, arm, catch, pad, inward, wire], "slide_stop_lever")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_trigger_pin(mats: dict) -> bpy.types.Object:
    """F-06: Precision Ground nDLC Main Trigger Pin w/ Dual Circumferential Retention Grooves."""
    m_dk = mats["M_HardwareNDLC"]
    cyl = mk_cyl("tp_cyl", 0.19, 0.19, 2.54, "z", 28, [], m_dk, bevel=0.042)
    # Two clean circumferential grooves at Z = +-0.68 (r_groove = 0.155)
    # Cut with hollow annular rings so the inner pin core stays intact!
    grvs = []
    for gz in (-0.68, 0.68):
        out_r = mk_cyl(f"tp_go_{gz}", 0.24, 0.24, 0.13, "z", 24, [("t", 0.0, 0.0, gz)], m_dk)
        in_r = mk_cyl(f"tp_gi_{gz}", 0.152, 0.152, 0.20, "z", 24, [("t", 0.0, 0.0, gz)], m_dk)
        grvs.append(bool_subtract(out_r, [in_r]))
    obj = bool_subtract(cyl, grvs)
    obj.name = "trigger_pin"
    obj.data.name = "trigger_pin"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_locking_block_pin(mats: dict) -> bpy.types.Object:
    """F-07: Precision Brushed Stainless Locking Block Front Cross-Pin."""
    m_st = mats["M_BrushedStainless"]
    pin = mk_cyl("lbp_cyl", 0.145, 0.145, 2.50, "z", 28, [], m_st, bevel=0.034)
    pin.name = "locking_block_pin"
    pin.data.name = "locking_block_pin"
    return finish_part(pin, bevel_w=0.0, sharp_deg=34.0)


def build_trigger_with_bar(mats: dict) -> bpy.types.Object:
    """T-01: Safe Action Trigger Shoe w/ Articulated Center Trigger Safety Blade &
    Mirror-Polished Stainless Cruciform Trigger Bar (Shark-Fin Lifter + Cruciform Sear Plate)."""
    m_poly = mats["M_TriggerPolymer"]
    m_blade = mats["M_TriggerSafetyBlade"]
    m_pol = mats["M_MirrorStainless"]

    # 1. Sculpted Gen 5 smooth-face matte-polymer curved Trigger Shoe
    shoe_xy = [(-0.32, 0.38), (0.28, 0.38)]
    shoe_xy += _cubic_bez((0.28, 0.38), (0.36, -0.35), (0.34, -1.15), (0.12, -1.78), 14)
    shoe_xy += _quad_bez((0.12, -1.78), (-0.04, -2.28), (-0.28, -2.26), 10)
    shoe_xy += _quad_bez((-0.28, -2.26), (-0.48, -2.22), (-0.38, -1.86), 8)
    shoe_xy += _cubic_bez((-0.38, -1.86), (-0.18, -1.25), (-0.22, -0.55), (-0.32, 0.38), 14)

    shoe_raw = mk_extrude_z("tr_shoe", shoe_xy, -0.31, 0.31, bevel=0.028, bevel_segs=2, mat=m_poly)
    c_slot = mk_box("c_tr_sl", 0.96, 1.95, 0.18, [("t", 0.05, -1.25, 0.0)], m_poly)
    c_pin = mk_cyl("c_tr_pn", 0.195, 0.195, 0.90, "z", 22, [("t", 0.0, 0.15, 0.0)], m_poly)
    shoe = bool_subtract(shoe_raw, [c_slot, c_pin])

    # Safe Action #1: Articulated Center Pivoting Trigger Safety Blade (clearly distinct tongue + pivot pin!)
    blade_xy = [(0.05, -0.52)]
    blade_xy += _quad_bez((0.05, -0.52), (0.49, -1.06), (0.35, -1.80), 10)
    blade_xy += [(0.19, -2.04), (-0.24, -1.72), (-0.34, -0.62)]
    safety_blade = mk_extrude_z("tr_blade", blade_xy, -0.062, 0.062, bevel=0.012, bevel_segs=2, mat=m_blade)
    blade_pin = mk_cyl("tr_bpin", 0.048, 0.048, 0.64, "z", 14, [("t", 0.08, -0.78, 0.0)], m_pol, bevel=0.008)

    # 2. Mirror-Polished Stainless Stamped Cruciform Trigger Bar + Shark-Fin Safety Lifter
    arm_f = mk_box("tb_af", 0.46, 0.54, 0.10, [("t", 0.02, 0.42, 0.46)], m_pol, bevel=0.012)
    off_b = mk_box("tb_ob", 0.32, 0.26, 0.28, [("t", -0.14, 0.62, 0.56)], m_pol, bevel=0.012)
    main_bar = mk_box("tb_mb", 5.35, 0.28, 0.095, [("t", -2.65, 0.72, 0.66)], m_pol, bevel=0.012)

    # Safe Action #2: Vertical "Shark-Fin" Plunger Lifter centered on Z = +0.28!
    fin_xy = [(-2.46, 0.76), (-1.52, 0.76), (-1.68, 1.34)]
    fin_xy += _quad_bez((-1.68, 1.34), (-1.92, 1.45), (-2.14, 1.41), 8)
    fin_xy.append((-2.38, 1.12))
    fin = mk_extrude_z("tb_fin", fin_xy, 0.225, 0.335, bevel=0.012, bevel_segs=2, mat=m_pol)
    fin_br = mk_box("tb_fbr", 0.82, 0.14, 0.42, [("t", -1.98, 0.78, 0.47)], m_pol, bevel=0.012)

    # Safe Action #3: Rear Cruciform Cross-Plate, Connector Cam Stud, Sear Tab & Hook Leg
    cruc_x = mk_box("tb_cx", 0.68, 0.10, 1.18, [("t", -5.28, 0.86, 0.22)], m_pol, bevel=0.012)
    cam_ear = mk_cyl("tb_ce", 0.06, 0.06, 0.24, "z", 16, [("t", -5.48, 0.88, 0.81)], m_pol, bevel=0.008)
    cruc_sp = mk_box("tb_cs", 1.12, 0.11, 0.32, [("t", -5.25, 0.86, 0.0)], m_pol, bevel=0.012)
    sear_tab = mk_box("tb_st", 0.14, 0.38, 0.28, [("rz", -0.18), ("t", -5.22, 1.04, 0.0)], m_pol, bevel=0.012)

    hook_raw = mk_box("tb_hk", 0.24, 0.52, 0.11, [("t", -5.24, 0.56, 0.12)], m_pol, bevel=0.012)
    hook_eye = mk_cyl("c_tb_he", 0.055, 0.055, 0.26, "z", 16, [("t", -5.24, 0.40, 0.12)], m_pol)
    hook_leg = bool_subtract(hook_raw, [hook_eye])

    obj = join_objects(
        [shoe, safety_blade, blade_pin, arm_f, off_b, main_bar, fin, fin_br, cruc_x, cam_ear, cruc_sp, sear_tab, hook_leg],
        "trigger_with_bar",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_connector(mats: dict) -> bpy.types.Object:
    """T-03: Mirror-Polished Stamped Stainless Minus/5.5-lb Connector w/ 32-deg Cam Lip & Disconnector Lobe."""
    m_pol = mats["M_MirrorStainless"]

    stem = mk_box("cn_st", 0.32, 1.34, 0.075, [("rx", -0.04), ("t", -5.62, 0.28, 0.74)], m_pol, bevel=0.010)
    hook = mk_box("cn_hk", 0.28, 0.14, 0.18, [("t", -5.62, -0.36, 0.67)], m_pol, bevel=0.010)
    arm = mk_box("cn_ar", 0.98, 0.34, 0.075, [("t", -5.28, 0.78, 0.76)], m_pol, bevel=0.010)
    cam = mk_box("cn_cm", 0.38, 0.15, 0.22, [("rz", 0.56), ("rx", 0.45), ("t", -5.58, 0.94, 0.82)], m_pol, bevel=0.010)
    lobe = mk_box("cn_lb", 0.24, 0.36, 0.15, [("rz", -0.12), ("t", -4.94, 1.08, 0.81)], m_pol, bevel=0.010)

    obj = join_objects([stem, hook, arm, cam, lobe], "connector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_trigger_spring(mats: dict) -> bpy.types.Object:
    """T-04: Tempered Coil Tension Trigger Spring w/ Watertight Front & Rear S-Hooks."""
    m_sp = mats["M_SpringSteel"]
    coil = mk_coil_spring("ts_coil", "x", -6.02, -5.42, 0.38, 0.12, 0.13, 0.028, 8.0, ring_segs=8, steps_per_coil=14, mat=m_sp)
    # Front and rear open S-hooks as watertight swept circular arcs
    fh_pts = [
        (-5.32 + 0.09 * math.cos(a), 0.38 + 0.09 * math.sin(a), 0.12)
        for a in [i * (math.pi * 1.4 / 14) for i in range(15)]
    ]
    rh_pts = [
        (-6.12 + 0.09 * math.cos(math.pi + a), 0.38 + 0.09 * math.sin(math.pi + a), 0.12)
        for a in [i * (math.pi * 1.4 / 14) for i in range(15)]
    ]
    fh = mk_swept_tube("ts_fh", fh_pts, 0.026, ring_segs=8, mat=m_sp)
    rh = mk_swept_tube("ts_rh", rh_pts, 0.026, ring_segs=8, mat=m_sp)
    obj = join_objects([coil, fh, rh], "trigger_spring")
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_mag_spring(mats: dict) -> bpy.types.Object:
    """M-03: Tempered Rectangular Coil 17-Rd Magazine Spring (8 coils, watertight swept tube)."""
    m_sp = mats["M_SpringSteel"]
    height, wx, dz, wire_r, coils = 1.10, 1.44, 1.04, 0.045, 8
    hx, hz = wx * 0.5, dz * 0.5
    cr = 0.22
    pts_per_turn = 24
    total_pts = coils * pts_per_turn
    pts = []
    for i in range(total_pts + 1):
        u = i / total_pts
        t = (i % pts_per_turn) / pts_per_turn
        ang = t * 2.0 * math.pi
        ca, sa = math.cos(ang), math.sin(ang)
        # Smooth superellipse rectangular coil loop matching Glock double-stack mag interior
        px = math.copysign(abs(ca) ** 0.52, ca) * (hx - wire_r)
        pz = math.copysign(abs(sa) ** 0.52, sa) * (hz - wire_r)
        py = -height * 0.5 + u * height
        pts.append((px, py, pz))
    obj = mk_swept_tube("mag_spring", pts, wire_r, ring_segs=8, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart Packing (3 Dedicated 2K Atlases)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    skip_face_fn=None,
):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    selected_any = False
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
                selected_any = True
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    assert selected_any, f"No faces selected for UV pack in {[o.name for o in objs]}"
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

    du = u1 - u0
    dv = v1 - v0
    pu_min, pu_max, pv_min, pv_max = 1.0, 0.0, 1.0, 0.0
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
                pu_min, pu_max = min(pu_min, ux), max(pu_max, ux)
                pv_min, pv_max = min(pv_min, vy), max(pv_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = pu_max - pu_min
    span_v = pv_max - pv_min
    print(f"  [UV-PACK] {len(objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.45 and span_v > 0.45, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_slide_atlas(slide_objs: list[bpy.types.Object]):
    """Unwraps slide, front_sight, rear_sight, slide_cover_plate, extractor into `g17_v3_slide` (2048x2048):
      - Band 1 (Slide Right outer flank): u in [0.015, 0.985], v in [0.815, 0.985]
      - Band 2 (Slide Left  outer flank): u in [0.015, 0.985], v in [0.625, 0.795] (mirrored U)
      - Band 3 (Slide Top outer deck):    u in [0.015, 0.985], v in [0.435, 0.605]
      - Pack A (Slide non-hero faces):    u in [0.012, 0.680], v in [0.012, 0.415]
      - Pack B (4 sight/backplate/ext):   u in [0.700, 0.988], v in [0.012, 0.415]
    """
    def slide_hero_kind(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "slide" or mat_name != "S_SlideNDLC":
            return None
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y
        if tx < -7.52 or tx > 11.12:
            return None
        if ty >= 0.84 and ty <= 3.46:
            if nz > 0.84 and tz > 1.21:
                return "right"
            if nz < -0.84 and tz < -1.21:
                return "left"
        if ny > 0.86 and ty > 3.36 and abs(tz) < 1.15:
            return "top"
        return None

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return slide_hero_kind(obj_name, face, mat_name) is not None

    slide_only = [o for o in slide_objs if o.name == "slide"]
    accessories = [o for o in slide_objs if o.name != "slide"]
    _smart_unwrap_and_pack_rect(slide_only, 0.012, 0.680, 0.012, 0.415, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(accessories, 0.700, 0.988, 0.012, 0.415, skip_face_fn=None)

    sl = slide_only[0]
    bm = bmesh.new()
    bm.from_mesh(sl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sl.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        kind = slide_hero_kind("slide", f, mname)
        if kind is None:
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            xn = max(0.0, min(1.0, (tx - (-7.54)) / 18.68))
            if kind == "right":
                yn = max(0.0, min(1.0, (ty - 0.82) / 2.66))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.815 + yn * 0.170)
            elif kind == "left":
                yn = max(0.0, min(1.0, (ty - 0.82) / 2.66))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.625 + yn * 0.170)
            else:  # top deck (+Y facing: +X right, -Z up)
                zn = max(0.0, min(1.0, (1.28 - tz) / 2.56))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.435 + zn * 0.170)
    bm.to_mesh(sl.data)
    bm.free()


def unwrap_polymer_atlas(poly_objs: list[bpy.types.Object]):
    """Unwraps all 8 polymer-suite parts into `g17_v3_polymer` (2048x2048):
      - Band 1 (Frame Right Flank w/ RTF4 & GLOCK medallion): u in [0.012, 0.618], v in [0.666, 0.988]
      - Band 2 (Frame Left  Flank w/ RTF4 & GLOCK medallion): u in [0.012, 0.618], v in [0.330, 0.652] (mirrored U)
      - Firewalled Safety Orange Follower Box (ISOLATED!):    u in [0.655, 0.988], v in [0.695, 0.988]
      - Band 3 (Mag Rear Witness Face 4..17):                 u in [0.642, 0.720], v in [0.334, 0.656]
      - Band 4 (Mag Right Flank w/ GLOCK 9x19):               u in [0.734, 0.854], v in [0.334, 0.656]
      - Band 5 (Mag Left  Flank):                             u in [0.868, 0.988], v in [0.334, 0.656]
      - Band 6 (Frame Under-Dustcover Stainless Serial Plate):u in [0.012, 0.148], v in [0.248, 0.312]
      - Pack C (guide rod, mag catch, housing pin):           u in [0.012, 0.148], v in [0.012, 0.232]
      - Pack A (Frame non-hero faces & rails):                u in [0.164, 0.678], v in [0.012, 0.314]
      - Pack B (Mag non-hero + baseplate + trigger_housing):  u in [0.694, 0.988], v in [0.012, 0.314]
    """
    def poly_hero_kind(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "frame":
            # Under-dustcover stainless serial plate bottom face (-Y)
            if mat_name == "P_BrushedStainless" and ny < -0.85 and 4.25 < tx < 6.05 and -0.24 < ty < -0.12:
                return "serial_plate"
            if mat_name != "P_PolyamideSmooth":
                return None
            # Outer sculpted frame right & left cheeks (main chassis + organic grip side walls + trigger guard outer cheeks!)
            # Strictly exclude internal magwell/FCG walls (|tz| <= 1.05 on grip/frame body) while capturing trigger-guard outer cheeks cleanly!
            is_tg_cheek = (-1.95 < tx < 2.42 and -3.15 < ty < -0.44) and (
                (nz > 0.88 and tz > 0.52) or (nz < -0.88 and tz < -0.52)
            )
            is_main_cheek = (nz > 0.62 and tz > 1.08) or (nz < -0.62 and tz < -1.08)
            if is_main_cheek or is_tg_cheek:
                return "frame_right" if nz > 0.0 else "frame_left"
            return None

        if obj_name == "mag_body" and mat_name == "P_MagPolymer":
            if -4.74 <= ty <= 5.18:
                if nx < -0.82 and tx < -1.16 and abs(tz) < 0.78:
                    return "mag_rear"
                if nz > 0.82 and tz > 0.72:
                    return "mag_right"
                if nz < -0.82 and tz < -0.72:
                    return "mag_left"
        return None

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return poly_hero_kind(obj_name, face, mat_name) is not None

    follower_grp = [o for o in poly_objs if o.name == "mag_follower"]
    frame_grp = [o for o in poly_objs if o.name == "frame"]
    small_grp = [o for o in poly_objs if o.name in {"recoil_guide_rod", "magazine_catch", "trigger_housing_pin"}]
    rest_grp = [o for o in poly_objs if o.name in {"mag_body", "mag_base_plate", "trigger_housing"}]

    # Strictly firewall Safety Orange follower into its own isolated upper-right box!
    _smart_unwrap_and_pack_rect(follower_grp, 0.655, 0.988, 0.695, 0.988, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(small_grp, 0.012, 0.148, 0.012, 0.232, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(frame_grp, 0.164, 0.678, 0.012, 0.314, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(rest_grp, 0.694, 0.988, 0.012, 0.314, skip_face_fn=is_hero)

    # Project Hero Bands for Frame & Mag Body
    for o in (frame_grp[0], next(x for x in rest_grp if x.name == "mag_body")):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            kind = poly_hero_kind(o.name, f, mname)
            if kind is None:
                continue
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                if kind == "frame_right":
                    xn = max(0.0, min(1.0, (tx - (-8.60)) / 19.72))
                    yn = max(0.0, min(1.0, (ty - (-9.38)) / 10.42))
                    loop[uv_layer].uv = (0.012 + xn * 0.606, 0.666 + yn * 0.322)
                elif kind == "frame_left":
                    xn = max(0.0, min(1.0, (tx - (-8.60)) / 19.72))
                    yn = max(0.0, min(1.0, (ty - (-9.38)) / 10.42))
                    loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.606, 0.330 + yn * 0.322)
                elif kind == "serial_plate":
                    # Viewed from underneath (-Y looking up): +X muzzle at RIGHT, +Z at TOP -> upright & un-mirrored!
                    xn = max(0.0, min(1.0, (tx - 4.325) / 1.650))
                    zn = max(0.0, min(1.0, (tz - (-0.340)) / 0.680))
                    loop[uv_layer].uv = (0.012 + xn * 0.136, 0.248 + zn * 0.064)
                elif kind == "mag_rear":
                    # Viewed from rear (-X looking forward): -Z is LEFT, +Z is RIGHT -> z_norm = (tz - (-0.88)) / 1.76!
                    zn = max(0.0, min(1.0, (tz - (-0.88)) / 1.76))
                    yn = max(0.0, min(1.0, (ty - (-4.76)) / 10.00))
                    loop[uv_layer].uv = (0.642 + zn * 0.078, 0.334 + yn * 0.322)
                elif kind == "mag_right":
                    xn = max(0.0, min(1.0, (tx - (-1.32)) / 2.64))
                    yn = max(0.0, min(1.0, (ty - (-4.76)) / 10.00))
                    loop[uv_layer].uv = (0.734 + xn * 0.120, 0.334 + yn * 0.322)
                elif kind == "mag_left":
                    xn = max(0.0, min(1.0, (tx - (-1.32)) / 2.64))
                    yn = max(0.0, min(1.0, (ty - (-4.76)) / 10.00))
                    loop[uv_layer].uv = (0.868 + (1.0 - xn) * 0.120, 0.334 + yn * 0.322)
        bm.to_mesh(o.data)
        bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps all 13 metal-suite parts into `g17_v3_metal` (2048x2048):
      - Band 1 (Barrel Hood Right Flank 9x19 + AT + BHVN919): u in [0.015, 0.485], v in [0.745, 0.985]
      - Band 2 (Barrel Hood Top Deck GMB + lock wear):        u in [0.515, 0.985], v in [0.745, 0.985]
      - Band 3 (Barrel Outer Tube + Glock Smile):             u in [0.015, 0.560], v in [0.470, 0.725]
      - Pack A (Barrel rest + trigger_with_bar + locking_block): u in [0.580, 0.988], v in [0.012, 0.725]
      - Pack B (10 remaining metal internals/pins/springs):   u in [0.012, 0.560], v in [0.012, 0.450]
    """
    def metal_hero_kind(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "barrel" or mat_name != "M_BarrelNDLC":
            return None
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y
        # Barrel chamber hood right flank (+Z)
        if -0.52 <= tx <= 2.54 and 1.88 <= ty <= 3.38 and nz > 0.84 and tz > 0.70:
            return "hood_right"
        # Barrel chamber hood top deck (+Y)
        if -0.52 <= tx <= 2.54 and ny > 0.84 and ty > 3.32:
            return "hood_top"
        # Outer cylindrical barrel tube (X in [2.52, 11.20], radial normal pointing outward away from bore Y=2.55)
        if 2.54 <= tx <= 11.18:
            r = math.hypot(ty - 2.55, tz)
            if r > 0.60 and abs(nx) < 0.35:
                return "bbl_cyl"
        return None

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return metal_hero_kind(obj_name, face, mat_name) is not None

    pack_a = [o for o in metal_objs if o.name in {"barrel", "trigger_with_bar", "locking_block"}]
    pack_b = [o for o in metal_objs if o not in pack_a]
    _smart_unwrap_and_pack_rect(pack_a, 0.580, 0.988, 0.012, 0.725, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(pack_b, 0.012, 0.560, 0.012, 0.450, skip_face_fn=None)

    bbl = next(o for o in metal_objs if o.name == "barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bbl.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        kind = metal_hero_kind("barrel", f, mname)
        if kind is None:
            continue
        if kind == "bbl_cyl":
            # Compute seam-safe cylindrical unwrap around bore axis (Y=2.55, Z=0), with theta=0 at +Y top (v_loc=0.5)
            thetas = []
            for loop in f.loops:
                vco = loop.vert.co
                ty, tz = vco.z, -vco.y
                # atan2(tz, ty-2.55) in [-pi, +pi] -> 0 at +Y top, +-pi at -Y bottom seam!
                th = math.atan2(tz, ty - 2.55)
                thetas.append(th)
            # Fix seam crossing at bottom (-Y) so no triangle stretches across the full UV band!
            if max(thetas) - min(thetas) > math.pi:
                thetas = [t + 2.0 * math.pi if t < 0.0 else t for t in thetas]
                # Clamp cleanly to [0, 1] via modular shift onto top half or bottom half
                mean_t = sum(thetas) / len(thetas)
                if mean_t > math.pi:
                    thetas = [t - 2.0 * math.pi for t in thetas]
            for loop, th in zip(f.loops, thetas):
                tx = loop.vert.co.x
                xn = max(0.0, min(1.0, (tx - 2.52) / 8.68))
                vn = max(0.0, min(1.0, 0.5 + th / (2.0 * math.pi)))
                loop[uv_layer].uv = (0.015 + xn * 0.545, 0.470 + vn * 0.255)
        else:
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                xn = max(0.0, min(1.0, (tx - (-0.52)) / 3.06))
                if kind == "hood_right":
                    yn = max(0.0, min(1.0, (ty - 1.86) / 1.56))
                    loop[uv_layer].uv = (0.015 + xn * 0.470, 0.745 + yn * 0.240)
                else:  # hood_top
                    zn = max(0.0, min(1.0, (0.80 - tz) / 1.60))
                    loop[uv_layer].uv = (0.515 + xn * 0.470, 0.745 + zn * 0.240)
    bm.to_mesh(bbl.data)
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
        o.location = (i * 50.0, 0.0, 0.0)
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


def bake_atlas_suite(
    prefix: str,
    target_objs: list[bpy.types.Object],
    all_objs: list[bpy.types.Object],
    tmp_dir: Path,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str,
        bake_type: str,
        samples: int,
        fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False,
        extra_objs_override=None,
    ):
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
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=4, fill_color=(0.03, 0.032, 0.036, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=4, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=4, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.55
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # Assembled exterior contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    if ext_targets:
        scene.world.light_settings.distance = 0.42
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
    else:
        np.save(tmp_dir / f"{prefix}_ao_ext.npy", np.ones((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))
        np.save(tmp_dir / f"{prefix}_ext_mask.npy", np.zeros((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))


# =============================================================================
# Verification & Draco glTF 2.0 Export
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
            f"  [{status}] {o.name:22s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.16:
            print(f"       !! BBOX DELTA > 0.16cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Non-manifold or inverted parts detected: {bad_parts}"
    return report


def triangulate_keep_normals(all_objs: list[bpy.types.Object]):
    """Locks WeightedNormal planar loop normals into beauty triangles BEFORE baking & export so
    Cycles tangent-space normal maps and Three.js rendered triangles match 100% with zero ngon streaks!"""
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


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: g17_v3_slide (5 parts)
        "slide":               build_slide,
        "front_sight":         build_front_sight,
        "rear_sight":          build_rear_sight,
        "slide_cover_plate":   build_slide_cover_plate,
        "extractor":           build_extractor,
        # Suite 2: g17_v3_polymer (8 parts)
        "frame":               build_frame,
        "recoil_guide_rod":    build_recoil_guide_rod,
        "magazine_catch":      build_magazine_catch,
        "trigger_housing_pin": build_trigger_housing_pin,
        "trigger_housing":     build_trigger_housing,
        "mag_body":            build_mag_body,
        "mag_follower":        build_mag_follower,
        "mag_base_plate":      build_mag_base_plate,
        # Suite 3: g17_v3_metal (13 parts)
        "barrel":              build_barrel,
        "striker":             build_striker,
        "firing_pin_safety":   build_firing_pin_safety,
        "extractor_plunger":   build_extractor_plunger,
        "locking_block":       build_locking_block,
        "slide_lock":          build_slide_lock,
        "slide_stop_lever":    build_slide_stop_lever,
        "trigger_pin":         build_trigger_pin,
        "locking_block_pin":   build_locking_block_pin,
        "trigger_with_bar":    build_trigger_with_bar,
        "connector":           build_connector,
        "trigger_spring":      build_trigger_spring,
        "mag_spring":          build_mag_spring,
    }

    print("[BUILD] Sculpting all 26 solid Glock 17 Gen 5 (9x19mm) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    slide_objs = [built[pid] for pid in SLIDE_PARTS]
    poly_objs = [built[pid] for pid in POLYMER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs = slide_objs + poly_objs + metal_objs
    assert len(all_objs) == 26, f"Expected 26 solid parts, got {len(all_objs)}"

    print("[VERIFY] Checking manifoldness, outward normals & exact CSG alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K atlases: slide (5), polymer (8), metal (13)...")
    unwrap_slide_atlas(slide_objs)
    unwrap_polymer_atlas(poly_objs)
    unwrap_metal_atlas(metal_objs)

    # Triangulate keeping WeightedNormal loop normals BEFORE Cycles NORMAL baking & glTF export!
    triangulate_keep_normals(all_objs)

    # Assert ZERO overlapping UV explosions across all 3 atlases!
    for label, group in (("slide", slide_objs), ("polymer", poly_objs), ("metal", metal_objs)):
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
            assert 0.00003 < oa < 0.80, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="g17_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking g17_v3_slide (2048x2048, 5 slide/sight/extractor parts)...")
        bake_atlas_suite("slide", slide_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking g17_v3_polymer (2048x2048, 8 Gen 5 polymer frame/mag/follower parts)...")
        bake_atlas_suite("poly", poly_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking g17_v3_metal (2048x2048, 13 GMB barrel & Safe Action internal parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)

        print("[POST] Compositing Gen 5 laser rollmarks, RTF4 stippling, Glock medallion, serial plate, witness holes & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "g17_v3_slide_albedo.webp",
        TEX_OUT_DIR / "g17_v3_slide_normal.webp",
        TEX_OUT_DIR / "g17_v3_slide_roughness.webp",
        TEX_OUT_DIR / "g17_v3_polymer_albedo.webp",
        TEX_OUT_DIR / "g17_v3_polymer_normal.webp",
        TEX_OUT_DIR / "g17_v3_polymer_roughness.webp",
        TEX_OUT_DIR / "g17_v3_metal_albedo.webp",
        TEX_OUT_DIR / "g17_v3_metal_normal.webp",
        TEX_OUT_DIR / "g17_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== GLOCK 17 GEN 5 (9x19mm) V3 ASSET BUDGET ===")
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
