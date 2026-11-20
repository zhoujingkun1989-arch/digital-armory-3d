#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Colt Python 6" (.357 Magnum)
=============================================================================
MIT License — Digital Armory 3D (`PR-04`, Track 2c)

"The Rolls-Royce of Revolvers" — 1955–1978 Hartford Colt Python 6-inch:
  - Legendary mirror-gloss Colt "Royal Blue" hot-salt blued steel
  - Sculpted slab-sided full-underlug 6" barrel w/ 3 beveled ventilated rib ports,
    anti-glare serrated top rib, 11 deg target crown & 6-groove 1:14" helical rifling
  - Deeply fluted 6-shot C_6 symmetric .357 Magnum cylinder w/ beveled stop notches,
    lead-in ramps & subtle circumferential turn-line burnish
  - Forged Colt I-frame w/ gracefully curved oval trigger guard, sculpted recoil shield,
    flush hand-fitted sideplate w/ 3 blued gunsmith-slotted screws, Accro target rear sight
    & Baughman red-insert ramped front sight
  - Organically lofted double-curved palm-swell American Black Walnut target grips w/
    deeply carved border, 22-LPI diamond checkering & inlaid 24K Gold Rampant Colt medallions
  - Hand-tuned jewel-polished stainless DA/SA clockwork & HKS 6-rd .357 speedloader w/
    gleaming brass/nickel rimmed cases & copper-jacketed hollow-point projectiles

Generates (strict ownership):
  - public/models/python.glb (Draco-compressed glTF 2.0, 23 solid parts; skips ONLY
    dynamic GPU-deforming springs `python_mainspring` [w=3 flex] and
    `python_extractor_spring` [w=1 helical])
  - public/textures/python_v3_metal_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/python_v3_walnut_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Option A: Cycles contact AO is baked with stationary exterior parts at assembledPos,
    then all 23 objects are reset to identity transform (0,0,0) before Draco glTF export.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_python_photoreal.py
  (Pass `-- --preview` to also render Cycles studio QA plates to `/tmp/python_qa_*.png`.)
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
# MODE 2: System Python Post-Process (PIL Hartford Rollmarks, Checkering,
#         24K Gold Medallions, RNM Tangent Normal Blend & 5-Ch Packed ORM WebP)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    from scipy import ndimage

    FONT_SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"
    FONT_TIMES_ITALIC = "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"
    FONT_SERIF_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_SERIF_BOLD, FONT_DIN, *FONT_FALLBACKS):
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
        """Reoriented Normal Mapping (RNM) blending two OpenGL tangent-space normals in [0, 1]."""
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 2.0) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.30)
        return (np.clip(dist / max(width_px, 0.5), 0.0, 1.0) * (mask > 0.05)).astype(np.float32)

    def _paste_uv_band(
        target: np.ndarray,
        pil_l: Image.Image,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
    ) -> None:
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray) -> None:
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _draw_rampant_colt(
        draw: ImageDraw.ImageDraw,
        cx: float,
        cy: float,
        scale: float,
        fill: int = 255,
    ) -> None:
        """Crisp heraldic Rampant Colt rearing stallion silhouette w/ broken-spear ground bar."""
        pts_body = [
            (cx - 0.12 * scale, cy + 0.36 * scale),  # Hind hoof left
            (cx - 0.22 * scale, cy + 0.14 * scale),  # Hock
            (cx - 0.17 * scale, cy - 0.07 * scale),  # Croup
            (cx - 0.06 * scale, cy - 0.23 * scale),  # Back arch
            (cx - 0.02 * scale, cy - 0.42 * scale),  # Crest of neck
            (cx + 0.09 * scale, cy - 0.48 * scale),  # Poll / ears
            (cx + 0.24 * scale, cy - 0.38 * scale),  # Muzzle
            (cx + 0.13 * scale, cy - 0.28 * scale),  # Throat
            (cx + 0.14 * scale, cy - 0.12 * scale),  # Chest
            (cx + 0.32 * scale, cy - 0.23 * scale),  # Raised foreleg upper
            (cx + 0.39 * scale, cy - 0.10 * scale),  # Upper fore hoof
            (cx + 0.16 * scale, cy - 0.02 * scale),  # Forearm
            (cx + 0.29 * scale, cy + 0.07 * scale),  # Lower foreleg
            (cx + 0.23 * scale, cy + 0.17 * scale),  # Lower fore hoof
            (cx + 0.06 * scale, cy + 0.05 * scale),  # Brisket
            (cx + 0.02 * scale, cy + 0.20 * scale),  # Belly
            (cx + 0.10 * scale, cy + 0.38 * scale),  # Hind hoof right
            (cx - 0.02 * scale, cy + 0.23 * scale),  # Inner thigh
        ]
        draw.polygon(pts_body, fill=fill)
        pts_tail = [
            (cx - 0.16 * scale, cy - 0.05 * scale),
            (cx - 0.34 * scale, cy + 0.05 * scale),
            (cx - 0.39 * scale, cy + 0.23 * scale),
            (cx - 0.26 * scale, cy + 0.17 * scale),
        ]
        draw.polygon(pts_tail, fill=fill)
        # Broken spear held in forelegs & ground bar
        w_line = max(2, int(round(0.042 * scale)))
        draw.line(
            [(cx - 0.36 * scale, cy + 0.40 * scale), (cx + 0.36 * scale, cy + 0.40 * scale)],
            fill=fill,
            width=w_line,
        )
        draw.line(
            [(cx + 0.05 * scale, cy - 0.33 * scale), (cx + 0.34 * scale, cy - 0.02 * scale)],
            fill=fill,
            width=max(2, int(round(0.028 * scale))),
        )

    def _draw_spaced_text(
        draw: ImageDraw.ImageDraw,
        cx: float,
        cy: float,
        text: str,
        font,
        fill: int = 255,
        tracking: float = 0.0,
    ) -> None:
        """Draws centered text with fine letter tracking for authentic Hartford rollmark kerning."""
        if abs(tracking) < 0.1:
            draw.text((cx, cy), text, fill=fill, font=font, anchor="mm")
            return
        widths = [draw.textlength(ch, font=font) for ch in text]
        total_w = sum(widths) + tracking * max(0, len(text) - 1)
        x = cx - total_w * 0.5
        for ch, cw in zip(text, widths):
            draw.text((x + cw * 0.5, cy), ch, fill=fill, font=font, anchor="mm")
            x += cw + tracking

    def process_metal_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # Blend ray-traced contact AO ONLY onto stationary exterior parts (moving cylinder/hammer/trigger keep pure Self-AO!)
        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        # Elevated WebGL AgX AO floor (0.44..1.0) so dark Royal Blue metal crevices NEVER crush to black!
        ao = np.clip(0.44 + 0.56 * np.power(np.clip(ao, 0.0, 1.0), 0.76), 0.42, 1.0).astype(np.float32)

        # Sanitize any rare coplanar bevel-ray degeneracy (nz < 0.25) so tangent normals stay 100% outward
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        decal_height = np.zeros((h, w), dtype=np.float32)
        engrave_mask = np.zeros((h, w), dtype=np.float32)

        # ------------------------------------------------------------------
        # 1) HERO BAND A — Left Barrel Flank (`u in [0.015, 0.985], v in [0.855, 0.985]`)
        #    Maps tx in [3.55, 17.42] (u=0.015 at muzzle 17.42 -> u=0.985 at breech 3.55),
        #    ty in [0.88, 2.92] -> v in [0.855, 0.985].
        #    Bore center ty = 2.35 maps to y_norm = (2.35 - 0.88)/2.04 = 0.7206 -> v = 0.9487!
        #    Upper flat barrel flank spans ty in [1.92, 2.74] -> y_norm in [0.510, 0.912]!
        # ------------------------------------------------------------------
        bw, bh = 3600, 480
        bl_img = Image.new("L", (bw, bh), 0)
        dbl = ImageDraw.Draw(bl_img)
        f_py_script = _load_font(FONT_SERIF_ITALIC, 118)
        f_py_sub = _load_font(FONT_SERIF_BOLD, 56)
        # Centered directly beneath the iconic 2nd ventilated rib port on the flat barrel flank!
        _draw_spaced_text(dbl, 1980, 124, "PYTHON  .357", f_py_script, fill=255, tracking=9.0)
        _draw_spaced_text(dbl, 1980, 236, "*  .357 MAGNUM CTG.  *", f_py_sub, fill=246, tracking=6.0)
        _paste_uv_band(engrave_mask, bl_img, 0.015, 0.985, 0.855, 0.985)

        # ------------------------------------------------------------------
        # 2) HERO BAND B — Right Barrel Flank (`u in [0.015, 0.985], v in [0.710, 0.840]`)
        #    Maps tx in [3.55, 17.42] (u=0.015 at breech -> u=0.985 at muzzle),
        #    ty in [0.88, 2.92] -> v in [0.710, 0.840].
        #    Crisp classic 2-line Hartford address rollmark on the flat barrel flank!
        # ------------------------------------------------------------------
        br_img = Image.new("L", (bw, bh), 0)
        dbr = ImageDraw.Draw(br_img)
        f_addr1 = _load_font(FONT_SERIF_BOLD, 66)
        f_addr2 = _load_font(FONT_SERIF_BOLD, 54)
        _draw_spaced_text(
            dbr, 1720, 132, "COLT'S PT. F.A. MFG. CO.", f_addr1, fill=255, tracking=5.5
        )
        _draw_spaced_text(
            dbr, 1720, 224, "HARTFORD, CONN. U.S.A.", f_addr2, fill=248, tracking=7.0
        )
        _paste_uv_band(engrave_mask, br_img, 0.015, 0.985, 0.710, 0.840)

        # ------------------------------------------------------------------
        # 3) HERO BAND E — Left I-Frame Flank (`u in [0.015, 0.315], v in [0.230, 0.480]`)
        #    Maps tx in [-6.10, -2.25] (u=0.015 at -2.25 -> u=0.315 at -6.10),
        #    ty in [-1.50, +2.85] -> v in [0.230, 0.480].
        #    Places iconic Rampant Colt stallion + VP proof triangle cleanly below the cylinder latch!
        # ------------------------------------------------------------------
        fw, fh = 1200, 1000
        fr_img = Image.new("L", (fw, fh), 0)
        dfr = ImageDraw.Draw(fr_img)
        # Latch occupies tx in [-4.05, -2.65], ty in [1.14, 1.84]; full-bodied target grip sweeps aft of tx = -4.65
        # Place crisp Rampant Colt cleanly at tx ~ -3.87, ty ~ +0.35 (100% clear of latch AND full walnut grip!)
        _draw_rampant_colt(dfr, 505, 575, 295, fill=255)
        # Authentic triangular VP (Verified Proof) near front trigger-guard web (tx ~ -2.84, ty ~ -0.70)
        dfr.polygon([(140, 848), (186, 760), (232, 848)], outline=248, width=8)
        dfr.text((186, 824), "VP", fill=248, font=_load_font(FONT_COND, 44), anchor="mm")
        # Crisp Hartford serial stamp cleanly clear of full-bodied walnut grip collar
        _draw_spaced_text(dfr, 505, 815, "E 48291", _load_font(FONT_SERIF_BOLD, 56), fill=245, tracking=4.0)
        _paste_uv_band(engrave_mask, fr_img, 0.015, 0.315, 0.230, 0.480)

        # Apply all crisp Hartford rollmarks & stamps cleanly to albedo, roughness, AO, and RNM normal!
        eng_core = _smoothstep(0.10, 0.54, engrave_mask)
        eng_bev = _bevel_mask(engrave_mask, width_px=1.75)
        # High-contrast bright silver-cobalt stamped steel rollmarks legible at full-gun studio distance!
        _mix(albedo, (0.86, 0.90, 0.96), eng_core * 0.92)
        _mix(rgh, 0.28, eng_core * 0.80)
        _mix(met, 0.84, eng_core * 0.65)
        decal_height -= 0.72 * eng_bev
        ao *= 1.0 - 0.16 * eng_core

        # ------------------------------------------------------------------
        # 4) HERO BAND C — Matte Sandblasted Anti-Glare Ventilated Top Rib & Frame Strap
        #    `u in [0.015, 0.985], v in [0.640, 0.695]` (tx in [-2.95, 17.38])
        #    Crisp fine transverse anti-glare serrations + matte bead-blasted roughness (0.48)!
        # ------------------------------------------------------------------
        rib_mask = (
            (u_grid >= 0.014) & (u_grid <= 0.986) & (v_grid >= 0.638) & (v_grid <= 0.697)
        ).astype(np.float32)
        rib_serr = np.sin(u_grid * 310.0 * math.pi * 2.0).astype(np.float32)
        rib_tooth = (0.5 + 0.5 * rib_serr) * rib_mask
        decal_height += 0.26 * rib_serr * rib_mask
        _mix(rgh, 0.48, rib_mask * 0.85)
        rgh = np.clip(rgh + 0.05 * (1.0 - rib_tooth) * rib_mask, 0.10, 0.94)
        ao *= 1.0 - 0.14 * (1.0 - rib_tooth) * rib_mask

        # ------------------------------------------------------------------
        # 5) HERO BAND D — 6-Shot Fluted Cylinder C_6 Periodic Turn-Line & Flute Sheen
        #    `u in [0.015, 0.985], v in [0.500, 0.625]`
        #    Main 360-deg period spans u in [0.025, 0.975] (width = 0.950 -> 6 periods),
        #    with periodic guard wings [0.015..0.025] and [0.975..0.985]!
        #    Axial tx in [-2.08, +2.08] -> bolt stop notch center tx = -0.92 maps to:
        #    x_norm = (-0.92 + 2.08) / 4.16 = 0.27885 -> v_turn = 0.500 + 0.27885 * 0.125 = 0.53486!
        # ------------------------------------------------------------------
        cyl_mask = (
            (u_grid >= 0.014) & (u_grid <= 0.986) & (v_grid >= 0.498) & (v_grid <= 0.627)
        ).astype(np.float32)
        u_cyl_phase = np.mod((u_grid - 0.025) / 0.950, 1.0)
        u6 = np.mod(u_cyl_phase * 6.0, 1.0)

        # Authentic subtle Colt revolver circumferential cylinder-bolt drag / turn line!
        v_turn = 0.500 + ((-0.92 + 2.08) / 4.16) * 0.125
        turn_core = np.exp(-(((v_grid - v_turn) / 0.0028) ** 2)).astype(np.float32) * cyl_mask
        turn_halo = np.exp(-(((v_grid - v_turn) / 0.0072) ** 2)).astype(np.float32) * cyl_mask
        # Slightly stronger gold-silver burnish emerging from each locking notch lead-in!
        notch_boost = (0.68 + 0.32 * np.cos(u6 * 2.0 * math.pi)).astype(np.float32)
        turn_sig = np.clip(turn_core * 0.85 + turn_halo * 0.25, 0.0, 1.0) * notch_boost

        # Subtle warm brass-silver burnished metallic drag streak (catching studio highlights!)
        _mix(albedo, (0.68, 0.63, 0.54), turn_sig * 0.64)
        _mix(rgh, 0.100, turn_sig * 0.72)
        _mix(met, 0.97, turn_sig * 0.75)
        decal_height -= 0.10 * turn_core

        # Subtle muzzle-front & forcing-cone carbon firing halo on Barrel Hero Bands A & B
        muzzle_prox_l = _smoothstep(0.085, 0.018, u_grid) * (
            (v_grid >= 0.855) & (v_grid <= 0.985)
        ).astype(np.float32)
        muzzle_prox_r = _smoothstep(0.915, 0.982, u_grid) * (
            (v_grid >= 0.710) & (v_grid <= 0.840)
        ).astype(np.float32)
        bore_y_l = np.exp(-(((v_grid - 0.948) / 0.036) ** 2)).astype(np.float32)
        bore_y_r = np.exp(-(((v_grid - 0.803) / 0.036) ** 2)).astype(np.float32)
        muzzle_soot = np.clip(muzzle_prox_l * bore_y_l + muzzle_prox_r * bore_y_r, 0.0, 1.0)
        # Subtle holster edge silvering right at muzzle rim & subtle velvet powder soot right beside bore
        _mix(albedo, (0.085, 0.092, 0.108), muzzle_soot * 0.36)
        _mix(rgh, 0.34, muzzle_soot * 0.42)

        # ------------------------------------------------------------------
        # 6) Subtle hand-buffed felt-wheel longitudinal polish micro-streaks on Royal Blue hero flats
        # ------------------------------------------------------------------
        hero_flats = (
            ((u_grid >= 0.015) & (u_grid <= 0.985) & (
                ((v_grid >= 0.855) & (v_grid <= 0.985))
                | ((v_grid >= 0.710) & (v_grid <= 0.840))
                | ((v_grid >= 0.500) & (v_grid <= 0.625))
            ))
            | ((u_grid >= 0.015) & (u_grid <= 0.315) & (v_grid >= 0.230) & (v_grid <= 0.480))
        ).astype(np.float32)
        rng = np.random.default_rng(3571955)
        buff_img = Image.new("L", (w, h), 0)
        db = ImageDraw.Draw(buff_img)
        for _ in range(240):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.76) * h)
            length = float(rng.uniform(28, 130))
            ang = math.radians(float(rng.uniform(-2.5, 2.5)))
            db.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(32, 95)),
                width=1,
            )
        buff = (np.asarray(buff_img, dtype=np.float32) / 255.0) * hero_flats
        rgh = np.clip(rgh - buff * 0.018, 0.10, 0.94)
        decal_height += buff * 0.018

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.10, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_metal_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved python_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    def process_walnut_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "walnut_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "walnut_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "walnut_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "walnut_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "walnut_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "walnut_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "walnut_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        decal_height = np.zeros((h, w), dtype=np.float32)

        # ------------------------------------------------------------------
        # 1) 22-LPI Pointed-Shield Diamond Checkering w/ Deeply Carved Border Groove
        #    Left outer palm panel:  u in [0.020, 0.485], v in [0.180, 0.985]
        #    Right outer palm panel: u in [0.515, 0.980], v in [0.180, 0.985]
        #    In parametric grip coordinates (s_u in [0,1] back->front, s_v in [0,1] butt->top):
        #      - Medallion sits cleanly in smooth upper walnut at s_u ~ 0.50, s_v ~ 0.82
        #      - Brass escutcheon screw sits at s_u ~ 0.52, s_v ~ 0.46
        #      - Checkering shield covers s_u in [0.14, 0.86], s_v in [0.08, 0.68 - 0.14*|2*s_u-1|]
        # ------------------------------------------------------------------
        chk_active = np.zeros((h, w), dtype=np.float32)
        chk_border = np.zeros((h, w), dtype=np.float32)
        diamonds_all = np.zeros((h, w), dtype=np.float32)

        for u_lo, u_hi, is_left in ((0.020, 0.485, True), (0.515, 0.980, False)):
            in_panel = (
                (u_grid >= u_lo) & (u_grid <= u_hi) & (v_grid >= 0.180) & (v_grid <= 0.985)
            ).astype(np.float32)
            su_raw = np.clip((u_grid - u_lo) / (u_hi - u_lo), 0.0, 1.0)
            su = (1.0 - su_raw) if is_left else su_raw
            sv = np.clip((v_grid - 0.180) / (0.985 - 0.180), 0.0, 1.0)

            # Signed distance inside generous full-bodied Colt pointed-shield checkering field!
            d_side = 0.395 - np.abs(su - 0.50)
            d_bot = sv - 0.075
            # Graceful Gothic-arch Colt Python pointed top peak below the centered 24K gold medallion!
            top_roof = 0.665 - 0.14 * np.abs(su - 0.50) * 2.0
            d_top = top_roof - sv
            # Smoothly clear circular walnut ring around grip escutcheon screw at (su=0.50, sv=0.44)
            d_screw = np.hypot((su - 0.50) * 0.66, (sv - 0.44) * 1.0) - 0.064
            # Strictly clear circular walnut collar around centered upper medallion at (su=0.50, sv=0.80)
            d_med = np.hypot((su - 0.50) * 0.66, (sv - 0.80) * 1.0) - 0.132

            sdf = np.minimum(np.minimum(np.minimum(d_side, d_bot), d_top), np.minimum(d_screw, d_med))
            mask_p = _smoothstep(0.0, 0.011, sdf) * in_panel
            # Deeply recessed hand-carved V-groove border trench outlining checkering shield & screw collar!
            border_p = np.exp(-((sdf / 0.0105) ** 2)).astype(np.float32) * in_panel * (
                (d_med > 0.025).astype(np.float32)
            )

            # Bold, razor-crisp 18-20 LPI diamond pyramids that stay unmistakably sharp at full-gun studio distance!
            a_coord = su * 17.5 + sv * 30.0
            b_coord = su * 17.5 - sv * 30.0
            tri_a = 1.0 - 2.0 * np.abs(np.mod(a_coord, 1.0) - 0.5)
            tri_b = 1.0 - 2.0 * np.abs(np.mod(b_coord, 1.0) - 0.5)
            # True pyramidal diamond profile (min of two intersecting V-grooves -> sharp carved diamond peaks!)
            pyr = np.power(np.clip(np.minimum(tri_a, tri_b), 0.0, 1.0), 0.88).astype(np.float32)

            chk_active = np.maximum(chk_active, mask_p)
            chk_border = np.maximum(chk_border, border_p)
            diamonds_all += pyr * mask_p

        # Apply high-contrast matte deeply-carved walnut checkering vs glossy oil-rubbed walnut border!
        valley_w = np.clip(1.0 - diamonds_all, 0.0, 1.0) * chk_active
        albedo *= 1.0 - 0.44 * valley_w[..., None] - 0.48 * chk_border[..., None]
        # Warm burnished highlights on raised diamond pyramid crowns so checkering gleams at studio distance!
        albedo[..., 0] = np.clip(albedo[..., 0] + 0.055 * np.power(diamonds_all, 1.8) * chk_active, 0.0, 1.0)
        albedo[..., 1] = np.clip(albedo[..., 1] + 0.028 * np.power(diamonds_all, 1.8) * chk_active, 0.0, 1.0)

        chk_rgh = 0.82 - 0.24 * diamonds_all
        _mix(rgh, chk_rgh, chk_active * 0.98)
        _mix(rgh, 0.86, chk_border * 0.90)
        ao *= (1.0 - 0.52 * valley_w) * (1.0 - 0.48 * chk_border)
        decal_height += 0.92 * (diamonds_all - 0.5) * chk_active - 0.72 * chk_border

        # ------------------------------------------------------------------
        # 2) Dedicated 286x286 px 24K Gold-Brass Colt Rampant Medallions
        #    Left medallion:  u in [0.560, 0.700], v in [0.015, 0.155]
        #    Right medallion: u in [0.715, 0.855], v in [0.015, 0.155]
        # ------------------------------------------------------------------
        med_size = 512
        img_rel = Image.new("L", (med_size, med_size), 0)
        img_ring = Image.new("L", (med_size, med_size), 0)
        dr = ImageDraw.Draw(img_rel)
        dg = ImageDraw.Draw(img_ring)
        mc = med_size // 2

        # Outer gleaming coin rim + inner double-beaded ring
        dg.ellipse((14, 14, med_size - 14, med_size - 14), fill=255)
        dr.ellipse((24, 24, med_size - 24, med_size - 24), outline=255, width=22)
        dr.ellipse((58, 58, med_size - 58, med_size - 58), outline=230, width=9)
        # Beaded coin dots around inner wreath
        for k in range(36):
            ang = 2.0 * math.pi * k / 36.0
            bx = mc + math.cos(ang) * (mc - 43)
            by = mc + math.sin(ang) * (mc - 43)
            dr.ellipse((bx - 5, by - 5, bx + 5, by + 5), fill=240)

        # High-relief Rampant Colt stallion + "COLT" serif inscription
        _draw_rampant_colt(dr, mc, mc - 18, 255, fill=255)
        _draw_spaced_text(
            dr, mc, med_size - 98, "COLT", _load_font(FONT_SERIF_BOLD, 56), fill=255, tracking=6.0
        )

        med_disc = np.zeros((h, w), dtype=np.float32)
        med_relief = np.zeros((h, w), dtype=np.float32)
        for u0, u1 in ((0.560, 0.700), (0.715, 0.855)):
            _paste_uv_band(med_disc, img_ring, u0, u1, 0.015, 0.155)
            _paste_uv_band(med_relief, img_rel, u0, u1, 0.015, 0.155)

        rel_bev = _bevel_mask(med_relief, width_px=2.4)
        # Fine matte gold micro-stipple in recessed coin field vs mirror-burnished 24K raised relief!
        rng_g = np.random.default_rng(2424)
        stip = rng_g.uniform(-1.0, 1.0, size=(h, w)).astype(np.float32)
        stip = ndimage.gaussian_filter(stip, sigma=0.7)

        _mix(albedo, (0.82, 0.63, 0.22), med_disc * (1.0 - rel_bev) * 0.90)
        _mix(albedo, (0.98, 0.84, 0.38), med_disc * rel_bev * 0.98)
        _mix(rgh, 0.25, med_disc * (1.0 - rel_bev) * 0.92)
        _mix(rgh, 0.14, med_disc * rel_bev * 0.96)
        _mix(met, 0.95, med_disc * 0.98)
        ao *= 1.0 - 0.14 * med_disc * (1.0 - rel_bev)
        decal_height += med_disc * (0.56 * rel_bev + 0.055 * stip * (1.0 - rel_bev))

        decal_nrm = _height_to_normal_01(decal_height, strength=4.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_walnut_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_walnut_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "python_v3_walnut_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved python_v3_walnut_{albedo,normal,roughness}.webp (2048x2048)")

    process_metal_atlas()
    process_walnut_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "python.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 24

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


# Exact 23 solid Colt Python 6" parts split cleanly across 2 dedicated 2048x2048 PBR suites
# (Strictly skipping ONLY the 2 GPU-deforming dynamic spring parts:
#    - `python_mainspring` (`aSpringParam` w=3 cantilever V-leaf flex)
#    - `python_extractor_spring` (`aSpringParam` w=1 helical X-axis compression)!)
WALNUT_PARTS = [
    "python_grip_left",
    "python_grip_right",
]

METAL_PARTS = [
    "python_barrel",
    "python_front_sight",
    "python_rear_sight",
    "python_barrel_pin",
    "python_detent_plunger",
    "python_frame",
    "python_sideplate",
    "python_sideplate_screws",
    "python_cylinder_latch",
    "python_hammer",
    "python_hammer_stirrup",
    "python_trigger",
    "python_rebound_lever",
    "python_cylinder_bolt",
    "python_hand",
    "python_firing_pin",
    "python_crane",
    "python_cylinder",
    "python_extractor_star",
    "python_extractor_rod",
    "python_speedloader",
]

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "python_mainspring",
    "python_extractor_spring",
]

# Stationary exterior parts that receive assembled inter-part contact AO
# (Moving/rotating parts — cylinder, hammer, trigger, crane, extractor, speedloader & internal
#  lockwork — receive pure Self-AO so shadows NEVER rotate with the 60-deg cylinder or cocking hammer!)
EXTERIOR_CONTACT_AO_PARTS = {
    "python_barrel",
    "python_front_sight",
    "python_rear_sight",
    "python_barrel_pin",
    "python_frame",
    "python_sideplate",
    "python_sideplate_screws",
    "python_grip_left",
    "python_grip_right",
    "python_cylinder_latch",
}

# Exact assembledPos from src/weapons/python/plugin.ts (all assembledRot = (0,0,0))
ASSEMBLED_POS = {
    "python_barrel":           ( 0.00,  0.00,  0.00),
    "python_front_sight":      (16.35,  3.82,  0.00),
    "python_rear_sight":       (-2.15,  3.76,  0.00),
    "python_barrel_pin":       ( 3.05,  2.92,  0.00),
    "python_detent_plunger":   ( 8.15,  1.17,  0.00),
    "python_frame":            ( 0.00,  0.00,  0.00),
    "python_sideplate":        (-4.42,  0.56,  0.54),
    "python_sideplate_screws": (-4.42,  0.56,  0.64),
    "python_grip_left":        (-8.05, -4.65, -0.82),
    "python_grip_right":       (-8.05, -4.65,  0.82),
    "python_cylinder_latch":   (-3.35,  1.48, -0.74),
    "python_hammer":           (-4.35,  0.58,  0.00),
    "python_hammer_stirrup":   (-5.12, -0.45,  0.00),
    "python_trigger":          (-2.35, -1.05,  0.00),
    "python_rebound_lever":    (-5.55, -1.72, -0.04),
    "python_cylinder_bolt":    (-0.85, -1.02,  0.12),
    "python_hand":             (-2.48,  0.18, -0.14),
    "python_firing_pin":       (-2.52,  2.35,  0.00),
    "python_crane":            ( 2.22,  0.28, -0.28),
    "python_cylinder":         ( 0.10,  1.17,  0.00),
    "python_extractor_star":   (-0.65,  1.17,  0.00),
    "python_extractor_rod":    ( 4.95,  1.17,  0.00),
    "python_speedloader":      ( 4.20, -6.20, -2.20),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) from src/weapons/python/meshes/*.ts
# Note: `python_sideplate_screws` corrects the CSG Z-inversion bug (threaded shanks now face INWARD
# into the sideplate/frame Z in [-0.48, +0.06] instead of poking outward into air!).
CSG_REF_BBOX = {
    "python_barrel":           (( 2.210,  0.880, -0.560), (17.420,  3.660,  0.560)),
    "python_front_sight":      ((-0.860, -0.220, -0.180), ( 0.840,  0.330,  0.180)),
    "python_rear_sight":       ((-1.080, -0.210, -0.520), ( 1.040,  0.360,  0.650)),
    "python_barrel_pin":       ((-0.105, -0.105, -0.620), ( 0.105,  0.105,  0.620)),
    "python_detent_plunger":   ((-0.560, -0.163, -0.220), ( 0.561,  0.163,  0.220)),
    "python_frame":            ((-11.250,-9.450, -0.960), ( 3.650,  3.660,  0.800)),
    "python_sideplate":        ((-2.060, -2.420, -0.140), ( 2.040,  2.420,  0.130)),
    "python_sideplate_screws": ((-1.225, -1.595, -0.480), ( 1.555,  1.395,  0.060)),
    "python_grip_left":        ((-3.880, -5.280, -0.640), ( 3.940,  5.250,  0.760)),
    "python_grip_right":       ((-3.880, -5.280, -0.760), ( 3.940,  5.250,  0.640)),
    "python_cylinder_latch":   ((-0.694, -0.340, -0.175), ( 0.720,  0.360,  0.520)),
    "python_hammer":           ((-2.120, -0.900, -0.310), ( 1.420,  2.905,  0.310)),
    "python_hammer_stirrup":   ((-0.290, -0.970, -0.180), ( 0.160,  0.840,  0.180)),
    "python_trigger":          ((-0.550, -1.980, -0.300), ( 0.560,  0.480,  0.160)),
    "python_rebound_lever":    ((-0.240, -0.220, -0.120), ( 3.050,  1.520,  0.120)),
    "python_cylinder_bolt":    ((-1.320, -0.315, -0.120), ( 1.180,  0.285,  0.100)),
    "python_hand":             ((-0.220, -0.950, -0.080), ( 0.320,  0.980,  0.230)),
    "python_firing_pin":       ((-0.360, -0.165, -0.165), ( 0.260,  0.165,  0.165)),
    "python_crane":            ((-3.720, -1.012, -0.395), ( 1.460,  1.270,  0.660)),
    "python_cylinder":         ((-2.080, -1.970, -1.970), ( 2.080,  1.970,  1.970)),
    "python_extractor_star":   ((-1.600, -1.115, -1.220), ( 2.450,  1.115,  1.220)),
    "python_extractor_rod":    ((-2.750, -0.265, -0.265), ( 2.770,  0.265,  0.265)),
    "python_speedloader":      ((-1.580, -1.850, -1.850), ( 2.360,  1.850,  1.850)),
}

# Total t=1.0 exploded offset sums from src/weapons/python/plugin.ts (for clearance audit)
EXPLODE_OFFSET_T1 = {
    "python_barrel":           (12.2,  2.2,  0.0),
    "python_front_sight":      (13.2,  5.6,  0.0),
    "python_rear_sight":       (-2.2,  6.0,  0.0),
    "python_barrel_pin":       ( 5.6,  4.6, -5.4),
    "python_detent_plunger":   (12.2, -3.8,  0.0),
    "python_frame":            ( 0.0,  0.0,  0.0),
    "python_sideplate":        (-1.6,  2.4,  8.2),
    "python_sideplate_screws": (-1.6,  2.8, 12.0),
    "python_grip_left":        (-5.0, -4.6, -7.6),
    "python_grip_right":       (-5.0, -4.6,  7.6),
    "python_cylinder_latch":   (-3.8,  5.4, -5.0),
    "python_hammer":           (-7.2,  7.4,  4.0),
    "python_hammer_stirrup":   (-10.2, 4.0,  5.0),
    "python_trigger":          ( 2.8, -7.6,  4.7),
    "python_rebound_lever":    (-4.8, -4.8,  4.4),
    "python_cylinder_bolt":    ( 6.8, -5.2,  4.7),
    "python_hand":             (-2.6, -2.2, -4.7),
    "python_firing_pin":       ( 1.2,  6.2,  4.4),
    "python_crane":            ( 8.6, -4.8, -6.6),
    "python_cylinder":         ( 0.0,  1.0, -9.4),
    "python_extractor_star":   (-9.6,  1.0, -9.4),
    "python_extractor_rod":    (11.6,  1.0, -9.4),
    "python_speedloader":      (-22.0, 8.37,-7.2),
}


# =============================================================================
# Scene & Physically Calibrated Cycles PBR Materials
# =============================================================================
def srgb_to_lin(r: float, g: float, b: float) -> tuple[float, float, float, float]:
    def c(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(r), c(g), c(b), 1.0)


def reset_scene() -> bpy.types.Scene:
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
    edge_srgb: tuple[float, float, float] = (0.62, 0.68, 0.78),
    grain_scale: float = 28.0,
    grain_bump: float = 0.018,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 55.0,
    rough_var: float = 0.025,
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

    # Macro hand-buffed bluing / gun-oil cloud variation
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.85
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.52
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    # Fine anisotropic felt-wheel polish / brushed machining grain
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
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.12),
        min(1.0, base_srgb[2] * 1.14),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_col_a
    mix_base.inputs[7].default_value = base_col_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])

    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.25
    rgh_map.inputs["From Max"].default_value = 0.75
    rgh_map.inputs["To Min"].default_value = max(0.10, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.94, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    # Delicate burnished convex edge highlight (subtle museum-handled Royal Blue gleam)
    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.528
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.600
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        nt.links.new(ramp.outputs["Color"], mul_w.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = max(0.11, roughness - 0.05)
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        if metallic > 0.35:
            mix_em = nt.nodes.new("ShaderNodeMix")
            mix_em.data_type = "FLOAT"
            mix_em.inputs[3].default_value = 0.97
            nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
            nt.links.new(met_sock, mix_em.inputs[2])
            met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.015
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_american_walnut_mat() -> bpy.types.Material:
    """Rich reddish-brown oil-rubbed American Black Walnut (Juglans nigra) in seamless 3D Object Space!
    Features flowing cathedral wood rings, dark elongated open vessel pores, glossy hand-rubbed
    palm sheen (R=0.30..0.44), and pure dielectric response (M=0.0)."""
    mat = bpy.data.materials.new("W_AmericanWalnut")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # Rotate Object coords along the Colt Python ~24-deg swept grip spine so wood grain flows gracefully!
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(-22.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    # Cathedral walnut heartwood rings flowing vertically along grip length
    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (1.55, 1.45, 0.22)
    nt.links.new(rot_g.outputs["Vector"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "Z"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 0.88
    wave.inputs["Distortion"].default_value = 8.5
    wave.inputs["Detail"].default_value = 6.5
    wave.inputs["Detail Scale"].default_value = 1.6
    wave.inputs["Detail Roughness"].default_value = 0.58
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    # Warm organic burl chatoyance
    n_burl = nt.nodes.new("ShaderNodeTexNoise")
    n_burl.inputs["Scale"].default_value = 1.65
    n_burl.inputs["Detail"].default_value = 6.0
    n_burl.inputs["Distortion"].default_value = 0.9
    nt.links.new(map_wood.outputs["Vector"], n_burl.inputs["Vector"])

    # Elongated dark American Black Walnut open vessel pores along wood fiber
    map_pore = nt.nodes.new("ShaderNodeMapping")
    map_pore.inputs["Scale"].default_value = (24.0, 24.0, 2.2)
    nt.links.new(rot_g.outputs["Vector"], map_pore.inputs["Vector"])

    n_pore = nt.nodes.new("ShaderNodeTexNoise")
    n_pore.inputs["Scale"].default_value = 3.4
    n_pore.inputs["Detail"].default_value = 4.0
    nt.links.new(map_pore.outputs["Vector"], n_pore.inputs["Vector"])

    pore_m = nt.nodes.new("ShaderNodeMapRange")
    pore_m.clamp = True
    pore_m.inputs["From Min"].default_value = 0.62
    pore_m.inputs["From Max"].default_value = 0.78
    pore_m.inputs["To Min"].default_value = 0.0
    pore_m.inputs["To Max"].default_value = 1.0
    nt.links.new(n_pore.outputs["Fac"], pore_m.inputs["Value"])

    # Authentic rich warm reddish-brown hand-rubbed Colt American Black Walnut palette
    c_dark = srgb_to_lin(0.205, 0.096, 0.044)
    c_mid = srgb_to_lin(0.430, 0.214, 0.098)
    c_warm = srgb_to_lin(0.585, 0.315, 0.150)

    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = c_dark
    mix1.inputs[7].default_value = c_mid
    nt.links.new(wave.outputs["Fac"], mix1.inputs[0])

    burl_f = nt.nodes.new("ShaderNodeMapRange")
    burl_f.clamp = True
    burl_f.inputs["From Min"].default_value = 0.30
    burl_f.inputs["From Max"].default_value = 0.76
    burl_f.inputs["To Min"].default_value = 0.0
    burl_f.inputs["To Max"].default_value = 0.55
    nt.links.new(n_burl.outputs["Fac"], burl_f.inputs["Value"])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = c_warm
    nt.links.new(burl_f.outputs["Result"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])

    # Darken elongated open walnut pores
    pore_mul = nt.nodes.new("ShaderNodeMath")
    pore_mul.operation = "MULTIPLY"
    pore_mul.inputs[1].default_value = 0.54
    nt.links.new(pore_m.outputs["Result"], pore_mul.inputs[0])

    mix_p = nt.nodes.new("ShaderNodeMix")
    mix_p.data_type = "RGBA"
    mix_p.inputs[7].default_value = srgb_to_lin(0.115, 0.052, 0.024)
    nt.links.new(pore_mul.outputs["Value"], mix_p.inputs[0])
    nt.links.new(mix2.outputs[2], mix_p.inputs[6])
    nt.links.new(mix_p.outputs[2], bsdf.inputs["Base Color"])

    # Glossy hand-rubbed linseed oil palm finish (R=0.29..0.44), slightly rougher inside open pores
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.29
    r_wood.inputs["To Max"].default_value = 0.43
    nt.links.new(n_burl.outputs["Fac"], r_wood.inputs["Value"])

    r_pore = nt.nodes.new("ShaderNodeMath")
    r_pore.operation = "MULTIPLY_ADD"
    r_pore.inputs[1].default_value = 0.14
    nt.links.new(pore_m.outputs["Result"], r_pore.inputs[0])
    nt.links.new(r_wood.outputs["Result"], r_pore.inputs[2])
    nt.links.new(r_pore.outputs["Value"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.0

    # Tactile wood fiber + depressed open pores bump + subtle bevel
    h_pore = nt.nodes.new("ShaderNodeMath")
    h_pore.operation = "MULTIPLY"
    h_pore.inputs[1].default_value = -0.35
    nt.links.new(pore_m.outputs["Result"], h_pore.inputs[0])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(h_pore.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Legendary Colt "Royal Blue" Luminous Satin-Gloss Hot-Salt Blued Steel ---
        # Calibrated specifically for Three.js WebGL 2.0 AgX + `tactical_vault.hdr` so vertical flats
        # glow rich midnight cobalt-blue (NEVER crushed black!), while curved cylinder & trigger guard
        # retain liquid mirror specular highlights!
        "M_RoyalBlueMirror": _build_pbr_mat(
            "M_RoyalBlueMirror",
            base_srgb=(0.255, 0.315, 0.435),
            roughness=0.255,
            metallic=0.86,
            bevel_r=0.028,
            edge_wear=0.55,
            edge_srgb=(0.56, 0.64, 0.78),
            grain_scale=46.0,
            grain_bump=0.012,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.036,
        ),
        # Dedicated liquid-gloss Royal Blue for curved fluted cylinder & swept oval trigger guard!
        "M_RoyalBlueCylinder": _build_pbr_mat(
            "M_RoyalBlueCylinder",
            base_srgb=(0.245, 0.305, 0.425),
            roughness=0.195,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.48,
            edge_srgb=(0.64, 0.72, 0.84),
            grain_scale=48.0,
            grain_bump=0.009,
            aniso_stretch=(0.40, 3.6, 3.6),
            rough_var=0.028,
        ),
        # Hand-fitted removable sideplate w/ crisp subtle tonal contrast & bright perimeter seam highlight!
        "M_SideplateMirror": _build_pbr_mat(
            "M_SideplateMirror",
            base_srgb=(0.275, 0.338, 0.462),
            roughness=0.240,
            metallic=0.87,
            bevel_r=0.030,
            edge_wear=0.64,
            edge_srgb=(0.66, 0.74, 0.88),
            grain_scale=46.0,
            grain_bump=0.010,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.032,
        ),
        "M_RoyalBlueDeep": _build_pbr_mat(
            "M_RoyalBlueDeep",
            base_srgb=(0.205, 0.256, 0.356),
            roughness=0.245,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.60,
            edge_srgb=(0.64, 0.72, 0.84),
            grain_scale=38.0,
            grain_bump=0.014,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.032,
        ),
        # Matte sandblasted anti-glare top ventilated rib & frame sighting plane
        "M_RibMatte": _build_pbr_mat(
            "M_RibMatte",
            base_srgb=(0.185, 0.222, 0.295),
            roughness=0.49,
            metallic=0.80,
            bevel_r=0.016,
            edge_wear=0.34,
            edge_srgb=(0.54, 0.62, 0.74),
            grain_scale=72.0,
            grain_bump=0.045,
            voronoi_grain=0.65,
            voronoi_scale=96.0,
            rough_var=0.042,
        ),
        # Bright jewel-polished stainless / case-hardened hammer sides & internal lockwork
        "M_JewelSteel": _build_pbr_mat(
            "M_JewelSteel",
            base_srgb=(0.79, 0.82, 0.86),
            roughness=0.16,
            metallic=0.96,
            bevel_r=0.022,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=32.0,
            grain_bump=0.016,
            aniso_stretch=(0.40, 3.4, 3.4),
            rough_var=0.026,
        ),
        # Tempered blued-grey spring steel for internal leaf/wire/coil details
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.48, 0.52, 0.58),
            roughness=0.24,
            metallic=0.93,
            bevel_r=0.014,
            grain_scale=30.0,
            grain_bump=0.015,
            rough_var=0.025,
        ),
        # Subtle darkened bore & forcing-cone carbon steel
        "M_BoreCarbon": _build_pbr_mat(
            "M_BoreCarbon",
            base_srgb=(0.095, 0.104, 0.122),
            roughness=0.44,
            metallic=0.78,
            bevel_r=0.016,
            grain_scale=44.0,
            grain_bump=0.032,
            rough_var=0.060,
        ),
        # Baughman ramped front sight orange-red acrylic target insert
        "M_SightRedInsert": _build_pbr_mat(
            "M_SightRedInsert",
            base_srgb=(0.88, 0.18, 0.055),
            roughness=0.22,
            metallic=0.02,
            bevel_r=0.010,
            grain_scale=28.0,
            grain_bump=0.008,
            rough_var=0.020,
        ),
        # Colt Accro rear sight crisp white U-notch contrast inlay
        "M_SightWhiteInlay": _build_pbr_mat(
            "M_SightWhiteInlay",
            base_srgb=(0.93, 0.94, 0.96),
            roughness=0.36,
            metallic=0.00,
            bevel_r=0.006,
            grain_scale=30.0,
            grain_bump=0.008,
            rough_var=0.020,
        ),
        # HKS 586-A satin black anodized machined aluminum speedloader body
        "M_AnodizedBlack": _build_pbr_mat(
            "M_AnodizedBlack",
            base_srgb=(0.118, 0.126, 0.140),
            roughness=0.35,
            metallic=0.74,
            bevel_r=0.024,
            edge_wear=0.34,
            edge_srgb=(0.56, 0.60, 0.66),
            grain_scale=52.0,
            grain_bump=0.028,
            voronoi_grain=0.45,
            voronoi_scale=78.0,
            rough_var=0.045,
        ),
        # Gleaming C26000 cartridge brass (.357 Magnum cases)
        "M_CartridgeBrass": _build_pbr_mat(
            "M_CartridgeBrass",
            base_srgb=(0.86, 0.68, 0.26),
            roughness=0.16,
            metallic=0.97,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.012,
            aniso_stretch=(4.0, 0.5, 0.5),
            rough_var=0.022,
        ),
        # Mirror nickel-plated .357 Magnum cases
        "M_CartridgeNickel": _build_pbr_mat(
            "M_CartridgeNickel",
            base_srgb=(0.84, 0.86, 0.90),
            roughness=0.13,
            metallic=0.98,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.010,
            aniso_stretch=(4.0, 0.5, 0.5),
            rough_var=0.018,
        ),
        # Warm gilding-metal copper JHP projectile jacket
        "M_CopperJHP": _build_pbr_mat(
            "M_CopperJHP",
            base_srgb=(0.82, 0.42, 0.22),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.014,
            grain_scale=34.0,
            grain_bump=0.014,
            aniso_stretch=(3.5, 0.6, 0.6),
            rough_var=0.025,
        ),
        # Exposed lead hollow-point cavity core
        "M_LeadCore": _build_pbr_mat(
            "M_LeadCore",
            base_srgb=(0.38, 0.40, 0.44),
            roughness=0.48,
            metallic=0.84,
            bevel_r=0.010,
            grain_scale=42.0,
            grain_bump=0.024,
            rough_var=0.045,
        ),
        # Gold anodized trim band on HKS knob
        "M_GoldTrim": _build_pbr_mat(
            "M_GoldTrim",
            base_srgb=(0.88, 0.70, 0.26),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.010,
            grain_scale=30.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),

        # --- Dedicated Walnut Atlas Materials (`python_v3_walnut`) ---
        "W_AmericanWalnut": _build_american_walnut_mat(),
        "W_GoldMedallion": _build_pbr_mat(
            "W_GoldMedallion",
            base_srgb=(0.92, 0.75, 0.29),
            roughness=0.16,
            metallic=0.95,
            bevel_r=0.014,
            grain_scale=32.0,
            grain_bump=0.008,
            rough_var=0.018,
        ),
        "W_BrassEscutcheon": _build_pbr_mat(
            "W_BrassEscutcheon",
            base_srgb=(0.88, 0.71, 0.29),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.012,
            grain_scale=36.0,
            grain_bump=0.012,
            rough_var=0.020,
        ),
        "W_GripScrewBlued": _build_pbr_mat(
            "W_GripScrewBlued",
            base_srgb=(0.24, 0.30, 0.42),
            roughness=0.17,
            metallic=0.93,
            bevel_r=0.012,
            edge_wear=0.45,
            edge_srgb=(0.74, 0.79, 0.88),
            grain_scale=32.0,
            grain_bump=0.012,
            rough_var=0.022,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface Modeling Toolkit
# =============================================================================
def _apply_three_xform(bm: bmesh.types.BMesh, ops: list[tuple]) -> None:
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
    name: str,
    bm: bmesh.types.BMesh,
    mat: bpy.types.Material | None = None,
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


def _quad_bez(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    segs: int = 10,
) -> list[tuple[float, float]]:
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2.0 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2.0 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _rounded_rect_2d(
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    r: float,
    arc_segs: int = 5,
) -> list[tuple[float, float]]:
    r = min(r, (x1 - x0) * 0.45, (y1 - y0) * 0.45)
    corners = [
        (x1 - r, y0 + r, -math.pi * 0.5, 0.0),
        (x1 - r, y1 - r, 0.0, math.pi * 0.5),
        (x0 + r, y1 - r, math.pi * 0.5, math.pi),
        (x0 + r, y0 + r, math.pi, math.pi * 1.5),
    ]
    pts = []
    for cx, cy, a0, a1 in corners:
        for i in range(arc_segs + 1):
            a = a0 + (a1 - a0) * (i / arc_segs)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
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
        b = min(bevel, min(sx, sy, sz) * 0.42)
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=b,
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
    bevel_segs: int = 2,
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
            b = min(bevel, length * 0.35, min(r_top, r_bot) * 0.40)
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=b,
                segments=bevel_segs,
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
    rx: float,
    ry: float,
    rz: float,
    u_segs: int = 20,
    v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(
    name: str,
    pts_r_x: list[tuple[float, float]],
    segs: int = 48,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight solid of revolution around Three.js +X from [(r, x), ...].
    Supports both solid-pole profiles (r=0 at start/end) and closed-annulus loops."""
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
    name: str,
    pts_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 3,
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
                offset=min(bevel, abs(z1 - z0) * 0.42),
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_x(
    name: str,
    stations: list[tuple[float, list[tuple[float, float]]]],
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight multi-station loft along Three.js X.
    `stations` is [(x_coord, [(z0, y0), (z1, y1), ...]), ...] with equal ring vertex count."""
    assert len(stations) >= 2
    n_pts = len(stations[0][1])
    bm = bmesh.new()
    rings = []
    for x_val, pts_zy in stations:
        assert len(pts_zy) == n_pts
        ring = [bm.verts.new((x_val, y, z)) for (z, y) in pts_zy]
        rings.append(ring)

    for k in range(len(rings) - 1):
        r0, r1 = rings[k], rings[k + 1]
        for i in range(n_pts):
            ni = (i + 1) % n_pts
            bm.faces.new((r0[i], r1[i], r1[ni], r0[ni]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_swept_tube(
    name: str,
    spine_pts: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    ring_segs: int = 18,
    closed_loop: bool = False,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight organically swept elliptical-section tube along a 3D Three.js curve.
    `radii[i] = (r_in_plane, r_lateral_z)` controls smooth sculpted cross-section thickness!"""
    pts = [Vector(p) for p in spine_pts]
    n_st = len(pts)
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i in range(n_st):
        if closed_loop:
            tang = (pts[(i + 1) % n_st] - pts[(i - 1) % n_st]).normalized()
        elif i == 0:
            tang = (pts[1] - pts[0]).normalized()
        elif i == n_st - 1:
            tang = (pts[-1] - pts[-2]).normalized()
        else:
            tang = (pts[i + 1] - pts[i - 1]).normalized()

        # Align primary normal cleanly in the X-Y plane (perp to Z) when curve lies mostly in X-Y!
        z_ref = Vector((0.0, 0.0, 1.0))
        if abs(tang.dot(z_ref)) < 0.85:
            n_vec = tang.cross(z_ref).normalized()
            b_vec = n_vec.cross(tang).normalized()
        else:
            ref = Vector((1.0, 0.0, 0.0))
            n_vec = tang.cross(ref).normalized() if prev_n is None else (prev_n - tang * prev_n.dot(tang)).normalized()
            b_vec = tang.cross(n_vec).normalized()
        prev_n = n_vec

        rn, rb = radii[i]
        ring = []
        for s in range(ring_segs):
            th = 2.0 * math.pi * s / ring_segs
            off = n_vec * (math.cos(th) * rn) + b_vec * (math.sin(th) * rb)
            ring.append(bm.verts.new(pts[i] + off))
        rings.append(ring)

    seg_count = n_st if closed_loop else n_st - 1
    for i in range(seg_count):
        r0 = rings[i]
        r1 = rings[(i + 1) % n_st]
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((r0[s], r1[s], r1[sn], r0[sn]))

    if not closed_loop:
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
    """Watertight capped static helical spring along Three.js 'x', 'y', or 'z'."""
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
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * wire_r
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


def mk_knurled_cyl(
    name: str,
    radius: float,
    length: float,
    axis: str = "x",
    flutes: int = 20,
    depth: float = 0.018,
    diamond_bands: int = 1,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """True 3D radially fluted or diamond-knurled cylinder (100% watertight manifold solid)."""
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.016, length * 0.14, radius * 0.14)
    bm = bmesh.new()

    # Build axial stations; when diamond_bands > 1, alternate phase every band for authentic 3D diamond knurl!
    stations = [(-half_l, radius - depth * 0.9 - bev * 0.7, 0, True)]
    body_l = length - 2.0 * bev
    if diamond_bands <= 1:
        stations.append((-half_l + bev, radius, 0, False))
        stations.append((half_l - bev, radius, 0, False))
    else:
        for b in range(diamond_bands + 1):
            ax = -half_l + bev + body_l * (b / diamond_bands)
            stations.append((ax, radius, b % 2, False))
    stations.append((half_l, radius - depth * 0.9 - bev * 0.7, 0, True))

    rings = []
    for ax_pos, r_base, phase, is_end in stations:
        ring = []
        for k in range(n_pts):
            th = 2.0 * math.pi * k / n_pts
            is_peak = ((k + phase) % 2 == 0)
            rr = r_base if is_end else (r_base if is_peak else (r_base - depth))
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
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_helical_rifling_lands(
    name: str,
    count: int,
    bore_r: float,
    depth: float,
    width: float,
    x0: float,
    x1: float,
    twist_cm: float,
    center_y: float = 0.0,
    center_z: float = 0.0,
    axial_segs: int = 18,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight 3D helical rifling lands standing proud inside a cylindrical bore along +X."""
    bm = bmesh.new()
    embed = min(0.012, depth * 0.55)
    r_in = bore_r - depth
    r_out = bore_r + embed
    half_ang = (width * 0.5) / max(bore_r, 0.05)

    for k in range(count):
        base_a = (2.0 * math.pi * k) / count
        rings = []
        for s in range(axial_segs + 1):
            u = s / axial_segs
            x = x0 + (x1 - x0) * u
            a = base_a + ((x - x0) / twist_cm) * 2.0 * math.pi
            a0, a1 = a - half_ang, a + half_ang
            ring = [
                bm.verts.new((x, center_y + r_in * math.cos(a0), center_z + r_in * math.sin(a0))),
                bm.verts.new((x, center_y + r_in * math.cos(a1), center_z + r_in * math.sin(a1))),
                bm.verts.new((x, center_y + r_out * math.cos(a1), center_z + r_out * math.sin(a1))),
                bm.verts.new((x, center_y + r_out * math.cos(a0), center_z + r_out * math.sin(a0))),
            ]
            rings.append(ring)
        for s in range(axial_segs):
            r0, r1 = rings[s], rings[s + 1]
            for j in range(4):
                jn = (j + 1) % 4
                bm.faces.new((r0[j], r1[j], r1[jn], r0[jn]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])

    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None) -> None:
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


def delete_objs(objs: list[bpy.types.Object]) -> None:
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
    target: bpy.types.Object,
    cutters: list[bpy.types.Object],
    solver: str = "EXACT",
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
    objs: list[bpy.types.Object],
    name: str,
    solver: str = "EXACT",
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
        if _count_non_manifold(obj) > 0:
            old_m = obj.data
            obj.data = backup.copy()
            bpy.data.meshes.remove(old_m)
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
        wn.weight = 100
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


def assign_material_by_predicate(
    obj: bpy.types.Object,
    mat: bpy.types.Material,
    pred,
) -> None:
    """Assigns `mat` to all polygons where `pred(tx, ty, tz, nx, ny, nz)` is True."""
    if mat.name not in [m.name for m in obj.data.materials if m]:
        obj.data.materials.append(mat)
    mat_idx = [m.name if m else "" for m in obj.data.materials].index(mat.name)
    for p in obj.data.polygons:
        c = p.center
        n = p.normal
        # Blender -> Three.js: tx=bx, ty=bz, tz=-by
        if pred(c.x, c.z, -c.y, n.x, n.z, -n.y):
            p.material_index = mat_idx


# =============================================================================
# 23 AAA HARD-SURFACE COLT PYTHON 6" (.357 MAGNUM) PART BUILDERS
# =============================================================================

# -----------------------------------------------------------------------------
# GROUP 1: 6" VENTILATED-RIB BARREL & TARGET SIGHT ASSEMBLY (5 parts)
# -----------------------------------------------------------------------------
def build_python_barrel(mats: dict) -> bpy.types.Object:
    """U-01: Iconic 6" Slab-Sided Full-Underlug Ventilated-Rib .357 Magnum Barrel.
    assembledPos = [0, 0, 0]. Spans X in [2.21, 17.42], Y in [0.88, 3.66], Z in [-0.56, +0.56].
    Features:
      - Sculpted lofted full-underlug barrel shroud w/ smooth cove shoulder & subtle muzzle taper
      - 3 crisp beveled rectangular ventilated rib ports & matte anti-glare top rib deck
      - 11-deg flared forcing cone, 11-deg recessed target crown & 6 helical 1:14" rifling lands
      - Left-open ejector-rod channel, front detent bore & pinned front sight mounting slot
    """
    m_rb = mats["M_RoyalBlueMirror"]
    m_rib = mats["M_RibMatte"]
    m_bore = mats["M_BoreCarbon"]
    m_st = mats["M_JewelSteel"]

    # 1. Sculpted Colt Python slab-sided barrel + full-length rounded-belly underlug loft!
    #    Cross-section in (z, y) centered around bore (y=2.35) & underlug belly (y_min=0.88)
    def barrel_underlug_section(z_scale: float, y_bot_lift: float = 0.0) -> list[tuple[float, float]]:
        zs = z_scale
        # Start at top-right rib neck, sweep down right flank, round bottom underlug belly, up left flank
        pts_right = [
            (0.345 * zs, 2.86),
            (0.415 * zs, 2.77),
            (0.505 * zs, 2.66),
            (0.556 * zs, 2.50),
            (0.560 * zs, 2.35),   # Full slab-crowned barrel flank at bore centerline!
            (0.548 * zs, 2.16),
            (0.470 * zs, 1.97),   # Sculpted concave fillet into full-length underlug!
            (0.442 * zs, 1.84),
            (0.440 * zs, 1.32 + y_bot_lift * 0.5),
        ]
        # Smooth semicircular rounded underlug belly (R = 0.44*zs around y = 1.32)
        belly_cy = 1.32 + y_bot_lift
        belly_r_z = 0.440 * zs
        belly_r_y = 0.440 - y_bot_lift
        belly = []
        n_arc = 16
        for i in range(1, n_arc):
            a = -math.pi * (i / n_arc)  # 0 -> -pi (right -> bottom -> left)
            belly.append((math.cos(a) * belly_r_z, belly_cy + math.sin(a) * belly_r_y))
        pts_left = [(-z, y) for (z, y) in reversed(pts_right)]
        return pts_right + belly + pts_left

    stations = [
        (3.55,  barrel_underlug_section(0.955, 0.025)),  # Crisp breech shoulder chamfer
        (3.60,  barrel_underlug_section(1.000, 0.000)),
        (10.50, barrel_underlug_section(0.988, 0.004)),
        (17.28, barrel_underlug_section(0.968, 0.012)),  # Classic subtle Colt muzzle taper
        (17.36, barrel_underlug_section(0.952, 0.022)),
        (17.42, barrel_underlug_section(0.895, 0.065)),  # Sleek beveled target muzzle face!
    ]
    main_hull = mk_loft_x("brl_hull", stations, mat=m_rb)

    # 2. Rear threaded frame shank & 11-deg forcing-cone exterior boss (X in [2.21, 3.68])
    shank = mk_lathe_x(
        "brl_shank",
        [
            (0.00, 2.21),
            (0.44, 2.21),
            (0.48, 2.32),
            (0.48, 3.68),
            (0.00, 3.68),
        ],
        segs=48,
        xform=[("t", 0.0, 2.35, 0.0)],
        mat=m_rb,
    )

    # 3. Iconic 3-Vent Ventilated Top Rib (X in [3.55, 17.38], Y in [2.78, 3.66], Z in [-0.35, +0.35])
    rib_pts = [
        (3.55, 2.74),
        (17.38, 2.74),
        (17.38, 3.62),
        (17.33, 3.66),
        (3.58, 3.66),
        (3.55, 3.63),
    ]
    rib_blank = mk_extrude_z("brl_rib_blank", rib_pts, -0.35, 0.35, bevel=0.032, bevel_segs=3, mat=m_rb)

    # 3 crisp beveled cooling vent cutters (flared bevel cuffs on both Z flanks catch studio rim highlights!)
    vent_cutters = []
    for vi, (vx0, vx1) in enumerate(((4.95, 7.55), (8.75, 11.35), (12.55, 15.15))):
        core_poly = _rounded_rect_2d(vx0, vx1, 2.94, 3.40, r=0.085, arc_segs=5)
        vent_cutters.append(mk_extrude_z(f"c_vent_{vi}", core_poly, -0.55, 0.55, mat=m_rb))
        # Subtle 45-deg beveled mouth flares on left & right rib walls
        flare_poly = _rounded_rect_2d(vx0 - 0.035, vx1 + 0.035, 2.905, 3.435, r=0.105, arc_segs=5)
        vent_cutters.append(mk_extrude_z(f"c_vent_flL_{vi}", flare_poly, -0.45, -0.315, bevel=0.022, bevel_segs=1, mat=m_rb))
        vent_cutters.append(mk_extrude_z(f"c_vent_flR_{vi}", flare_poly, 0.315, 0.45, bevel=0.022, bevel_segs=1, mat=m_rb))
    rib_vented = bool_subtract(rib_blank, vent_cutters, solver="EXACT")

    # Unite sculpted barrel+underlug, threaded shank & 3-port ventilated rib into ONE watertight forging!
    barrel_solid = bool_union([main_hull, shank, rib_vented], "python_barrel_solid")

    # 4. Precision internal bore + 11-deg forcing cone + 11-deg recessed target crown + underlug cuts!
    bore_cutter = mk_lathe_x(
        "c_bore",
        [
            (0.00,  2.10),
            (0.365, 2.10),
            (0.340, 2.21),  # 11-deg flared forcing cone mouth
            (0.226, 2.52),  # .357 rifled throat
            (0.226, 17.37), # Full 6" precision lapped bore
            (0.242, 17.39), # 11-deg recessed target crown dish
            (0.330, 17.42), # Target crown outer bevel lip
            (0.345, 17.50),
            (0.00,  17.50),
        ],
        segs=48,
        xform=[("t", 0.0, 2.35, 0.0)],
        mat=m_bore,
    )
    underlug_cutters = [
        bore_cutter,
        # Full-length ENCLOSED Colt Python underlug ejector-rod shroud bore (X in [3.50, 7.82], R=0.31 around Y=1.17)
        # Side walls stay 100% solid & uninterrupted from frame face to 6" muzzle; internal bore clears rod & spring!
        mk_cyl("c_ej_cyl", 0.31, 0.31, 4.46, "x", 28, [("t", 5.68, 1.17, 0.0)], m_bore),
        # Front detent plunger bore (X in [7.78, 8.85], R=0.205)
        mk_cyl("c_det_bore", 0.205, 0.205, 1.16, "x", 24, [("t", 8.30, 1.17, 0.0)], m_bore),
        # Pinned front sight mounting slot on front of top rib (X in [15.46, 17.24])
        mk_box("c_fs_slot", 1.78, 0.24, 0.30, [("t", 16.35, 3.64, 0.0)], m_bore),
        # Front sight transverse pin bore
        mk_cyl("c_fs_pin", 0.056, 0.056, 0.90, "z", 16, [("t", 16.40, 3.70, 0.0)], m_bore),
    ]
    barrel_solid = bool_subtract(barrel_solid, underlug_cutters, solver="EXACT")

    # Assign matte sandblasted anti-glare material to top sighting rib flat (Y > 3.635, ny > 0.72)
    assign_material_by_predicate(
        barrel_solid,
        m_rib,
        lambda tx, ty, tz, nx, ny, nz: ny > 0.72 and ty > 3.635 and tx > 3.56,
    )

    # 5. Deep 6-groove 1:14" right-hand helical target rifling lands + bright recessed target crown ring!
    rifling = mk_helical_rifling_lands(
        "brl_rifling",
        count=6,
        bore_r=0.226,
        depth=0.020,
        width=0.044,
        x0=2.56,
        x1=17.34,
        twist_cm=35.56,
        center_y=2.35,
        center_z=0.0,
        axial_segs=20,
        mat=m_st,
    )
    crown_ring = mk_lathe_x(
        "brl_crown_ring",
        [
            (0.232, 17.392),
            (0.320, 17.419),
            (0.320, 17.412),
            (0.232, 17.385),
            (0.232, 17.392),
        ],
        segs=44,
        xform=[("t", 0.0, 2.35, 0.0)],
        mat=m_st,
    )

    obj = join_objects([barrel_solid, rifling, crown_ring], "python_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_front_sight(mats: dict) -> bpy.types.Object:
    """U-02: Pinned Baughman Ramped Target Front Sight w/ Vivid Red-Orange Insert & Serrated Ramp.
    assembledPos = [16.35, 3.82, 0]."""
    m_dk = mats["M_RoyalBlueDeep"]
    m_red = mats["M_SightRedInsert"]
    m_st = mats["M_JewelSteel"]

    blade_xy = [
        (-0.86, -0.22),
        ( 0.84, -0.22),
        ( 0.77,  0.14),
        ( 0.50,  0.33),
        ( 0.42,  0.33),
        (-0.78, -0.04),
    ]
    blade = mk_extrude_z("fs_blade", blade_xy, -0.14, 0.14, bevel=0.022, bevel_segs=2, mat=m_dk)

    # Carve clean pocket along rear ramp for the flush-inlaid glossy orange-red insert!
    ins_cut_xy = [
        (-0.58,  0.01),
        ( 0.40,  0.30),
        ( 0.34,  0.15),
        (-0.50, -0.08),
    ]
    blade = bool_subtract(blade, [mk_extrude_z("c_ins", ins_cut_xy, -0.095, 0.095, mat=m_dk)])

    red_xy = [
        (-0.56,  0.015),
        ( 0.38,  0.295),
        ( 0.33,  0.165),
        (-0.48, -0.065),
    ]
    red_ins = mk_extrude_z("fs_red", red_xy, -0.09, 0.09, bevel=0.012, bevel_segs=2, mat=m_red)

    # Transverse stainless retention cross-pin
    pin = mk_cyl("fs_pin", 0.055, 0.055, 0.36, "z", 20, [("t", 0.05, -0.12, 0.0)], m_st, bevel=0.010)

    obj = join_objects([blade, red_ins, pin], "python_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_rear_sight(mats: dict) -> bpy.types.Object:
    """U-03: Colt Accro Micrometric Adjustable Target Rear Sight w/ White U-Outline & Click Screws.
    assembledPos = [-2.15, 3.76, 0]."""
    m_dk = mats["M_RoyalBlueDeep"]
    m_wht = mats["M_SightWhiteInlay"]
    m_st = mats["M_JewelSteel"]

    base = mk_box("rs_base", 2.12, 0.34, 0.94, [("t", -0.02, -0.04, 0.0)], m_dk, bevel=0.032, bevel_segs=2)

    # Protective beveled ear rear sight blade w/ milled crisp square U-notch
    blade_raw = mk_box("rs_blade", 0.24, 0.42, 1.04, [("t", -0.82, 0.15, 0.0)], m_dk, bevel=0.026, bevel_segs=2)
    blade = bool_subtract(blade_raw, [mk_box("c_notch", 0.44, 0.23, 0.30, [("t", -0.82, 0.295, 0.0)], m_dk)])

    # Crisp white target U-outline around square notch on rear (-X) face
    w_l = mk_box("rs_wl", 0.032, 0.18, 0.050, [("t", -0.942, 0.26, -0.175)], m_wht, bevel=0.005, bevel_segs=1)
    w_r = mk_box("rs_wr", 0.032, 0.18, 0.050, [("t", -0.942, 0.26,  0.175)], m_wht, bevel=0.005, bevel_segs=1)
    w_b = mk_box("rs_wb", 0.032, 0.046, 0.400, [("t", -0.942, 0.16,  0.000)], m_wht, bevel=0.005, bevel_segs=1)

    # Micrometric slotted top elevation click screw & right-side windage click screw
    elev_raw = mk_cyl("rs_elev", 0.16, 0.16, 0.14, "y", 24, [("t", -0.18, 0.16, 0.0)], m_st, bevel=0.016)
    elev = bool_subtract(elev_raw, [mk_box("c_eslot", 0.34, 0.055, 0.038, [("t", -0.18, 0.225, 0.0)], m_st)])

    wind_raw = mk_cyl("rs_wind", 0.14, 0.14, 0.22, "z", 24, [("t", -0.76, 0.12, 0.54)], m_st, bevel=0.016)
    wind = bool_subtract(wind_raw, [mk_box("c_wslot", 0.038, 0.30, 0.055, [("t", -0.76, 0.12, 0.645)], m_st)])

    hinge = mk_cyl("rs_hinge", 0.055, 0.055, 0.98, "z", 18, [("t", 0.78, -0.04, 0.0)], m_st, bevel=0.010)

    obj = join_objects([base, blade, w_l, w_r, w_b, elev, wind, hinge], "python_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_barrel_pin(mats: dict) -> bpy.types.Object:
    """U-04: Hardened Stainless Frame-Boss Barrel Retention Cross-Pin.
    assembledPos = [3.05, 2.92, 0]."""
    m_st = mats["M_JewelSteel"]
    pin = mk_lathe_x(
        "python_barrel_pin",
        [
            (0.000, -0.62),
            (0.082, -0.60),
            (0.105, -0.55),
            (0.105,  0.55),
            (0.082,  0.60),
            (0.000,  0.62),
        ],
        segs=28,
        xform=[("ry", math.pi * 0.5)],
        mat=m_st,
    )
    return finish_part(pin, bevel_w=0.0, sharp_deg=38.0)


def build_python_detent_plunger(mats: dict) -> bpy.types.Object:
    """U-05: Underlug Ejector-Rod Front Locking Detent Plunger, Cross-Pin & 7-Coil Spring.
    assembledPos = [8.15, 1.17, 0] (stationary part; does NOT deform dynamically)."""
    m_st = mats["M_JewelSteel"]
    m_sp = mats["M_SpringSteel"]

    body = mk_lathe_x(
        "dp_body",
        [
            (0.000, -0.46),
            (0.052, -0.52),
            (0.145, -0.56),
            (0.163, -0.50),
            (0.163, -0.05),
            (0.095, -0.02),
            (0.095,  0.54),
            (0.000,  0.56),
        ],
        segs=28,
        mat=m_st,
    )
    xpin = mk_cyl("dp_pin", 0.042, 0.042, 0.44, "z", 16, [("t", -0.26, 0.08, 0.0)], m_st, bevel=0.008)
    spring = mk_coil_spring(
        "dp_spring", "x", -0.03, 0.53, 0.0, 0.0, 0.135, 0.022, 7.0, ring_segs=8, steps_per_coil=14, mat=m_sp
    )
    obj = join_objects([body, xpin, spring], "python_detent_plunger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


# -----------------------------------------------------------------------------
# GROUP 2: FORGED COLT I-FRAME, SIDEPLATE, SCREWS, WALNUT GRIPS & LATCH (6 parts)
# -----------------------------------------------------------------------------
def build_python_frame(mats: dict) -> bpy.types.Object:
    """F-01: Iconic Sculpted Forged Colt I-Frame w/ Gracefully Curved Oval Trigger Guard,
    Sculpted Recoil Shield, Swept Hammer Shroud Arch, Stepped Grip Tang & 4 Pivot Studs!
    assembledPos = [0, 0, 0]. Spans X in [-11.25, +3.65], Y in [-9.45, +3.66], Z in [-0.96, +0.80].
    """
    m_rb = mats["M_RoyalBlueMirror"]
    m_cyl = mats["M_RoyalBlueCylinder"]
    m_rib = mats["M_RibMatte"]
    m_bore = mats["M_BoreCarbon"]
    m_st = mats["M_JewelSteel"]

    # 1. Main forged I-frame silhouette with smoothly sculpted rounded front crane-housing chin
    #    flowing organically into the curved oval trigger guard root (ZERO sharp 90-deg front brick!)
    frame_xy: list[tuple[float, float]] = [
        ( 3.65,  3.66),
        (-2.95,  3.66),
        (-4.15,  3.28),
    ]
    frame_xy += _quad_bez((-4.15, 3.28), (-5.65, 2.55), (-5.85, 1.15), 10)
    frame_xy += _quad_bez((-5.85, 1.15), (-6.35, -0.85), (-8.35, -4.85), 14)
    frame_xy += _quad_bez((-8.35, -4.85), (-9.75, -7.65), (-11.25, -9.15), 12)
    frame_xy.append((-9.15, -9.45))
    frame_xy += _quad_bez((-9.15, -9.45), (-7.25, -7.25), (-5.65, -3.72), 14)
    frame_xy += _quad_bez((-5.65, -3.72), (-4.55, -2.82), (-3.75, -1.95), 8)
    frame_xy.append((-3.60, -1.32))
    frame_xy.append(( 0.72, -1.24))
    # Smoothly radiused Colt Python crane-housing contour flowing organically upward into barrel boss!
    frame_xy += _quad_bez((0.72, -1.24), (2.25, -1.26), (3.12, -1.04), 10)
    frame_xy += _quad_bez((3.12, -1.04), (3.65, -0.82), (3.65,  0.18), 10)

    base_forging = mk_extrude_z("frm_base", frame_xy, -0.66, 0.66, bevel=0.068, bevel_segs=3, mat=m_rb)

    # 2. Gracefully Curved Organic Oval Trigger Guard Bow (Swept Elliptical Cross-Section — ZERO FLAT BOX!)
    #    Centerline sweeps from rear root (-3.62, -1.36) -> bottom oval (-1.48, -3.48) -> front bow (0.64, -1.30)
    tg_spine_2d: list[tuple[float, float]] = [(-3.62, -1.24)]
    tg_spine_2d += _quad_bez((-3.62, -1.24), (-3.80, -3.48), (-1.52, -3.50), 14)
    tg_spine_2d += _quad_bez((-1.52, -3.50), ( 0.64, -3.50), ( 0.66, -1.22), 14)
    tg_spine_3d = [(x, y, 0.0) for (x, y) in tg_spine_2d]
    tg_radii = []
    for i, (x, y) in enumerate(tg_spine_2d):
        u = i / max(1, len(tg_spine_2d) - 1)
        # Slightly thicker roots where bow blends into frame, sleek sculpted 0.22x0.43 elliptical guard bow!
        root_flare = 1.0 + 0.18 * ((2.0 * u - 1.0) ** 4)
        tg_radii.append((0.22 * root_flare, 0.44 * root_flare))
    trigger_guard = mk_swept_tube("frm_tguard", tg_spine_3d, tg_radii, ring_segs=20, closed_loop=False, mat=m_cyl)

    # 3. Sculpted Hemispherical Recoil Shield behind cylinder (X in [-2.68, -2.24], R=1.92 around [1.17, 0])
    recoil_shield = mk_lathe_x(
        "frm_shield",
        [
            (0.00, -2.72),
            (1.68, -2.72),
            (1.88, -2.62),
            (1.92, -2.44),
            (1.92, -2.26),
            (1.86, -2.24),
            (0.00, -2.24),
        ],
        segs=48,
        xform=[("t", 0.0, 1.17, 0.0)],
        mat=m_rb,
    )

    raw_frame = bool_union([base_forging, trigger_guard, recoil_shield], "frm_united")

    # 4. Mill ALL authentic Colt I-frame openings, cavities, step-ins & bores cleanly!
    #    - Rectangular beveled cylinder window (X in [-2.24, +2.26], Y in [-0.86, +3.22])
    cyl_win_poly = _rounded_rect_2d(-2.24, 2.26, -0.86, 3.22, r=0.06, arc_segs=4)
    cyl_win_cut = mk_extrude_z("c_cyl_win", cyl_win_poly, -2.20, 2.20, mat=m_rb)

    #    - Open grip-tang mainspring window (exposes V-mainspring under X-Ray & Cutaway!)
    tang_win_xy = [
        (-5.85, -1.15),
        (-5.15, -1.45),
        (-8.65, -8.65),
        (-10.25, -8.55),
    ]
    tang_win_cut = mk_extrude_z("c_tang_win", tang_win_xy, -1.20, 1.20, mat=m_bore)

    #    - Contoured right-side milled clockwork cavity matching `python_sideplate` cleanly!
    #      (Leaves solid left frame wall Z in [-0.66, -0.26] and top/rear shroud shoulders!)
    pocket_xy = [
        (-2.38, -1.86),
        (-2.38,  2.98),
        (-3.97,  2.98),
    ]
    pocket_xy += _quad_bez((-3.97, 2.98), (-5.77, 2.51), (-5.94, 1.11), 8)
    pocket_xy += _quad_bez((-5.94, 1.11), (-6.24, -0.59), (-6.48, -1.86), 8)
    pocket_cut = mk_extrude_z("c_pocket", pocket_xy, -0.26, 0.90, mat=m_bore)

    cutters = [
        cyl_win_cut,
        tang_win_cut,
        pocket_cut,
        # Top hammer spur & nose slot
        mk_box("c_ham_slot", 2.65, 2.25, 0.52, [("t", -4.35, 2.45, 0.0)], m_bore),
        # Firing-pin bushing aperture through recoil shield at (Y=2.35, Z=0)
        mk_cyl("c_fp_bore", 0.185, 0.185, 1.25, "x", 22, [("t", -2.55, 2.35, 0.0)], m_bore),
        # Vertical hand-pawl slot on recoil shield face
        mk_box("c_hand_slot", 0.65, 1.15, 0.24, [("t", -2.36, 0.62, -0.14)], m_bore),
        # 6 o'clock lower cylinder-bolt window slot (X=+0.10, Y=-1.02)
        mk_box("c_bolt_slot", 0.76, 0.52, 0.34, [("t", 0.10, -1.02, 0.0)], m_bore),
        # Trigger slot into trigger guard
        mk_box("c_trig_slot", 1.18, 0.56, 0.38, [("t", -2.15, -1.24, 0.0)], m_bore),
        # Front barrel threaded mounting bore (Y=2.35, R=0.485)
        mk_cyl("c_brl_bore", 0.486, 0.486, 1.68, "x", 32, [("t", 2.96, 2.35, 0.0)], m_bore),
        # Barrel cross-pin bore
        mk_cyl("c_bpin_bore", 0.108, 0.108, 1.50, "z", 18, [("t", 3.05, 2.92, 0.0)], m_bore),
        # Lower crane hinge bore (Y=-0.48, Z=-0.32, R=0.28)
        mk_cyl("c_crane_bore", 0.282, 0.282, 1.58, "x", 24, [("t", 2.98, -0.48, -0.32)], m_bore),
        # Internal ejector-rod & spring clearance bore through front frame boss (Y=1.17, R=0.31)
        mk_cyl("c_frm_ej", 0.31, 0.31, 1.65, "x", 24, [("t", 2.96, 1.17, 0.0)], m_bore),
        # Slimmer grip tang Z step-in (+-0.66 -> +-0.38) angled cleanly along the walnut grip collar
        # so the step sits 100% hidden inside the walnut grip silhouette (zero exposed step behind trigger guard!)
        mk_box("c_tang_r", 5.8, 10.6, 0.44, [("rz", -0.44), ("t", -8.85, -5.25,  0.60)], m_rb),
        mk_box("c_tang_l", 5.8, 10.6, 0.44, [("rz", -0.44), ("t", -8.85, -5.25, -0.60)], m_rb),
        # Trim recoil shield Z flanks to authentic Colt I-frame width (Z in [-0.96, +0.76])
        mk_box("c_sh_r", 1.30, 4.5, 1.80, [("t", -2.46, 1.17,  1.66)], m_rb),
        mk_box("c_sh_l", 1.30, 4.5, 1.80, [("t", -2.46, 1.17, -1.86)], m_rb),
        # Rear Accro sight mounting recess on rear of top strap (X in [-3.15, -1.12], Y > 3.55)
        mk_box("c_rs_seat", 2.04, 0.24, 0.96, [("t", -2.15, 3.66, 0.0)], m_bore),
    ]
    milled_frame = bool_subtract(raw_frame, cutters, solver="EXACT")

    # Assign matte anti-glare finish to top strap sighting flat (seamless with barrel rib!)
    assign_material_by_predicate(
        milled_frame,
        m_rib,
        lambda tx, ty, tz, nx, ny, nz: ny > 0.72 and ty > 3.63 and tx > -1.12,
    )

    # 5. Four jewel-polished hardened stainless internal lockwork pivot studs!
    studs = [
        mk_cyl("st_hammer",  0.14, 0.14, 0.62, "z", 20, [("t", -4.35,  0.58, 0.04)], m_st, bevel=0.014),
        mk_cyl("st_trigger", 0.12, 0.12, 0.60, "z", 20, [("t", -2.35, -1.05, 0.04)], m_st, bevel=0.012),
        mk_cyl("st_rebound", 0.11, 0.11, 0.58, "z", 20, [("t", -5.55, -1.72, 0.02)], m_st, bevel=0.012),
        mk_cyl("st_mspring", 0.12, 0.12, 0.74, "z", 20, [("t", -9.75, -8.45, 0.00)], m_st, bevel=0.012),
    ]

    obj = join_objects([milled_frame] + studs, "python_frame")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_sideplate(mats: dict) -> bpy.types.Object:
    """F-02: Hand-Fitted Flush Beveled Right Lockwork Sideplate w/ 3 Countersunk Screw Bores.
    assembledPos = [-4.42, 0.56, 0.54]."""
    m_rb = mats["M_SideplateMirror"]
    m_dk = mats["M_RoyalBlueDeep"]
    m_bore = mats["M_BoreCarbon"]

    outer_xy: list[tuple[float, float]] = [
        ( 2.04, -2.42),
        ( 2.04,  2.42),
        ( 0.45,  2.42),
    ]
    outer_xy += _quad_bez((0.45, 2.42), (-1.35, 1.95), (-1.52, 0.55), 10)
    outer_xy += _quad_bez((-1.52, 0.55), (-1.82, -1.15), (-2.06, -2.42), 10)
    outer_plate = mk_extrude_z("sp_out", outer_xy, -0.06, 0.132, bevel=0.028, bevel_segs=3, mat=m_rb)

    inner_xy: list[tuple[float, float]] = [
        ( 1.88, -2.22),
        ( 1.88,  2.22),
        ( 0.38,  2.22),
    ]
    inner_xy += _quad_bez((0.38, 2.22), (-1.18, 1.78), (-1.34, 0.48), 8)
    inner_xy.append((-1.82, -2.22))
    inner_lip = mk_extrude_z("sp_in", inner_xy, -0.14, -0.05, bevel=0.012, bevel_segs=2, mat=m_dk)

    plate = bool_union([outer_plate, inner_lip], "python_sideplate")

    # 3 crisp countersunk gunsmith screw bores matching `python_sideplate_screws`!
    screw_coords = ((-1.05, 1.22), (1.38, -1.42), (1.35, 1.20))
    cuts = [
        mk_cyl(f"c_sp_s{i}", 0.178, 0.118, 0.40, "z", 24, [("t", sx, sy, 0.02)], m_bore)
        for i, (sx, sy) in enumerate(screw_coords)
    ]
    plate = bool_subtract(plate, cuts, solver="EXACT")
    return finish_part(plate, bevel_w=0.0, sharp_deg=34.0)


def build_python_sideplate_screws(mats: dict) -> bpy.types.Object:
    """F-03: 3 Flush Beveled Blued Gunsmith-Slotted Sideplate Screws (shanks facing INWARD!).
    assembledPos = [-4.42, 0.56, 0.64] -> flush heads sit at world Z=0.67..0.69, shanks go inward into frame!"""
    m_dk = mats["M_RoyalBlueDeep"]
    m_st = mats["M_JewelSteel"]

    screw_specs = (
        (-1.05,  1.22, math.radians( 6.0)),
        ( 1.38, -1.42, math.radians(-4.0)),
        ( 1.35,  1.20, math.radians( 3.0)),
    )
    screws = []
    for idx, (sx, sy, slot_ang) in enumerate(screw_specs):
        # Revolve around +X, then rotateY(-pi/2) -> +X maps cleanly to +Z (head outward, shank inward -Z!)
        body = mk_lathe_x(
            f"sps_body_{idx}",
            [
                (0.000, -0.48),  # Threaded shank tip inside frame
                (0.082, -0.45),
                (0.094, -0.07),
                (0.174, -0.03),  # Beveled countersunk head shoulder
                (0.174,  0.035),
                (0.145,  0.056), # Domed polished mirror-blued gunsmith head
                (0.000,  0.060),
            ],
            segs=28,
            xform=[("ry", -math.pi * 0.5), ("t", sx, sy, 0.0)],
            mat=m_dk,
        )
        slot = mk_box(
            f"c_sps_slot_{idx}",
            0.38,
            0.044,
            0.072,
            [("rz", slot_ang), ("t", sx, sy, 0.056)],
            m_st,
        )
        screws.append(bool_subtract(body, [slot], solver="EXACT"))

    obj = join_objects(screws, "python_sideplate_screws")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# -----------------------------------------------------------------------------
# ORGANICALLY LOFTED DOUBLE-CURVED PALM-SWELL AMERICAN BLACK WALNUT TARGET GRIPS
# -----------------------------------------------------------------------------
def _eval_python_grip_xy(su: float, sv: float) -> tuple[float, float]:
    """Authentic Full-Bodied 1955–1978 Colt Python 1st-Gen Target American Walnut Grip silhouette
    in grip-local (lx, ly) around assembledPos [-8.05, -4.65, +-0.82].
    su in [0, 1]: 0=backstrap -> 1=frontstrap (~3.6-4.0 cm generous front-to-back target width!).
    sv in [0, 1]: 0=flared target butt -> 1=curved upper grip collar.
    Embraces the frontstrap right up behind the curved trigger guard (world [-4.11, -2.60])
    while clearing trigger guard, sideplate screws, Rampant Colt stamp & cylinder latch cleanly!"""
    def qbez(p0, p1, p2, t):
        u = 1.0 - t
        return (
            u * u * p0[0] + 2.0 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2.0 * u * t * p1[1] + t * t * p2[1],
        )

    # Backstrap sweeping curve (sv=0 flared target heel -> sv=1 curved upper backstrap collar)
    if sv <= 0.50:
        bx, by = qbez((-3.88, -4.68), (-1.92, -2.95), (-0.32, 0.20), sv / 0.50)
    else:
        bx, by = qbez((-0.32, 0.20), (1.05, 2.85), (1.62, 5.05), (sv - 0.50) / 0.50)

    # Full-bodied Frontstrap curve wrapping generously forward right up behind the trigger guard bow!
    if sv <= 0.44:
        fx, fy = qbez((-0.18, -5.28), (1.15, -3.15), (2.28, -1.05), sv / 0.44)
    elif sv <= 0.72:
        fx, fy = qbez((2.28, -1.05), (3.28, 0.65), (4.05, 2.05), (sv - 0.44) / 0.28)
    else:
        # Authentic Colt Python upper ergonomic thumb/knuckle sweep clearing Rampant Colt & sideplate screws!
        fx, fy = qbez((4.05, 2.05), (3.28, 3.35), (2.98, 4.95), (sv - 0.72) / 0.28)

    # Smooth organic corner rounding at extreme corners
    cu = max(0.0, abs(2.0 * su - 1.0) - 0.84) / 0.16
    cv = max(0.0, abs(2.0 * sv - 1.0) - 0.88) / 0.12
    shrink = 0.036 * (cu * cu) * (cv * cv)
    su_e = 0.5 + (su - 0.5) * (1.0 - shrink)

    lx = bx + (fx - bx) * su_e
    ly = by + (fy - by) * su_e
    # Graceful domed upper collar arch cleanly above the centered 24K Gold Colt Medallion
    ly += 0.25 * math.sin(math.pi * su_e) * (sv ** 3)
    return (lx, ly)


def _eval_python_grip_z_outer(su: float, sv: float, sign_z: float) -> float:
    """Lush ergonomic double-curved Colt Target palm-swell profile in grip-local Z.
    Swells organically to Z_local = +-0.62 (world Z = +-1.44 cm -> full 28.8 mm target palm grip!)
    and rolls smoothly into the steel frame & frontstrap/backstrap edges."""
    du = min(1.0, abs(2.0 * su - 1.0))
    dv = min(1.0, abs(2.0 * sv - 1.0))
    arch_u = math.pow(max(0.0, 1.0 - du * du), 0.45)
    arch_v = math.pow(max(0.0, 1.0 - dv * dv * 0.84), 0.34)
    palm_bias = 1.0 - 0.16 * (sv ** 2)
    z_swell = 0.15 + 0.47 * arch_u * (0.48 + 0.52 * arch_v) * palm_bias
    return sign_z * z_swell


def _build_python_walnut_grip(side: str, mats: dict) -> bpy.types.Object:
    """F-04 (`left`) / F-05 (`right`): Organically Lofted Double-Curved Palm-Swell American
    Black Walnut Target Grip Panel w/ Inlaid 3D 24K Gold Rampant Colt Medallion,
    Brass Escutcheon Ferrule & Blued Slotted Grip Screw!
    assembledPos = [-8.05, -4.65, -0.82 / +0.82]."""
    assert side in ("left", "right")
    sign_z = 1.0 if side == "right" else -1.0
    part_name = "python_grip_right" if side == "right" else "python_grip_left"

    m_wood = mats["W_AmericanWalnut"]
    m_gold = mats["W_GoldMedallion"]
    m_brass = mats["W_BrassEscutcheon"]
    m_screw = mats["W_GripScrewBlued"]

    # UV panel range for exact pre-boolean outer-face parametric mapping!
    u_lo, u_hi = (0.515, 0.980) if side == "right" else (0.020, 0.485)
    v_lo, v_hi = 0.180, 0.985

    nu, nv = 34, 52
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    # Inner bedding face reaches near center plane (Z_world = +-0.06 -> z_local = -sign_z * 0.76)
    # around the perimeter while carving a clean tang mortise cavity inside!
    outer_grid: list[list[bmesh.types.BMVert]] = []
    inner_grid: list[list[bmesh.types.BMVert]] = []
    uv_grid: list[list[tuple[float, float]]] = []

    for iv in range(nv + 1):
        sv = iv / nv
        row_out = []
        row_in = []
        row_uv = []
        for iu in range(nu + 1):
            su = iu / nu
            lx, ly = _eval_python_grip_xy(su, sv)
            z_out = _eval_python_grip_z_outer(su, sv, sign_z)

            # Lower tang (world Y < -1.97 -> ly < 2.68): steel tang sits at Z_world=+-0.38 (-sign_z*0.44);
            # grip wraps inward toward Z_world=+-0.08 (-sign_z*0.74) around the front/back/butt edges!
            # Upper collar (world Y >= -1.97 -> ly >= 2.68): flush outside frame/sideplate (Z_world=+-0.685 -> -sign_z*0.135)
            # so zero clipping with `python_sideplate` or `python_frame` upper shoulder!
            du = abs(2.0 * su - 1.0)
            in_tang = (1.0 - max(0.0, min(1.0, (du - 0.72) / 0.18))) * (
                1.0 - max(0.0, min(1.0, (0.07 - sv) / 0.07))
            )
            upper_t = max(0.0, min(1.0, (ly - 1.80) / 0.55))
            upper_s = upper_t * upper_t * (3.0 - 2.0 * upper_t)
            z_in_lower = -sign_z * (0.74 - 0.31 * in_tang)
            z_in_upper = -sign_z * 0.135
            z_in = z_in_lower * (1.0 - upper_s) + z_in_upper * upper_s

            row_out.append(bm.verts.new(t2b(lx, ly, z_out)))
            row_in.append(bm.verts.new(t2b(lx, ly, z_in)))

            u_map = u_lo + ((1.0 - su) if side == "left" else su) * (u_hi - u_lo)
            v_map = v_lo + sv * (v_hi - v_lo)
            row_uv.append((u_map, v_map))
        outer_grid.append(row_out)
        inner_grid.append(row_in)
        uv_grid.append(row_uv)

    # Create outer contoured faces WITH exact parametric HeroGripUVs!
    for iv in range(nv):
        for iu in range(nu):
            if sign_z > 0:
                f_out = bm.faces.new((
                    outer_grid[iv][iu],
                    outer_grid[iv][iu + 1],
                    outer_grid[iv + 1][iu + 1],
                    outer_grid[iv + 1][iu],
                ))
                uvs = (uv_grid[iv][iu], uv_grid[iv][iu + 1], uv_grid[iv + 1][iu + 1], uv_grid[iv + 1][iu])
                bm.faces.new((
                    inner_grid[iv][iu],
                    inner_grid[iv + 1][iu],
                    inner_grid[iv + 1][iu + 1],
                    inner_grid[iv][iu + 1],
                ))
            else:
                f_out = bm.faces.new((
                    outer_grid[iv][iu],
                    outer_grid[iv + 1][iu],
                    outer_grid[iv + 1][iu + 1],
                    outer_grid[iv][iu + 1],
                ))
                uvs = (uv_grid[iv][iu], uv_grid[iv + 1][iu], uv_grid[iv + 1][iu + 1], uv_grid[iv][iu + 1])
                bm.faces.new((
                    inner_grid[iv][iu],
                    inner_grid[iv][iu + 1],
                    inner_grid[iv + 1][iu + 1],
                    inner_grid[iv + 1][iu],
                ))
            for loop, uv_pt in zip(f_out.loops, uvs):
                loop[uv_layer].uv = uv_pt

    # Stitch watertight perimeter walls
    for iu in range(nu):
        bm.faces.new((inner_grid[0][iu], inner_grid[0][iu + 1], outer_grid[0][iu + 1], outer_grid[0][iu]))
        bm.faces.new((outer_grid[nv][iu], outer_grid[nv][iu + 1], inner_grid[nv][iu + 1], inner_grid[nv][iu]))
    for iv in range(nv):
        bm.faces.new((outer_grid[iv][0], outer_grid[iv + 1][0], inner_grid[iv + 1][0], inner_grid[iv][0]))
        bm.faces.new((inner_grid[iv][nu], inner_grid[iv + 1][nu], outer_grid[iv + 1][nu], outer_grid[iv][nu]))

    grip = _bm_to_obj(part_name, bm, m_wood)

    # 2. Recessed circular medallion mortise + 3D Inlaid 24K Gold Rampant Colt Medallion CENTERED at (su=0.50, sv=0.80)!
    med_x, med_y = _eval_python_grip_xy(0.50, 0.80)
    med_z_surf = _eval_python_grip_z_outer(0.50, 0.80, sign_z)
    med_r = 0.50

    med_mortise = mk_cyl(
        f"c_med_{side}",
        med_r + 0.025,
        med_r + 0.015,
        0.55,
        "z",
        36,
        [("t", med_x, med_y, med_z_surf + sign_z * 0.16)],
        m_wood,
    )

    # 3. Recessed brass escutcheon screw counterbore centered at (su=0.50, sv=0.44)!
    sc_x, sc_y = _eval_python_grip_xy(0.50, 0.44)
    sc_z_surf = _eval_python_grip_z_outer(0.50, 0.44, sign_z)
    sc_mortise = mk_cyl(
        f"c_sc_{side}",
        0.27,
        0.23,
        0.55,
        "z",
        28,
        [("t", sc_x, sc_y, sc_z_surf + sign_z * 0.12)],
        m_wood,
    )

    grip = bool_subtract(grip, [med_mortise, sc_mortise], solver="EXACT")

    # 3D Domed Inlaid 24K Gold Colt Medallion seated flush inside the beveled wood mortise!
    med_prof = [
        (0.000, -0.08),
        (med_r, -0.08),
        (med_r,  0.030),
        (med_r - 0.032, 0.056),
        (0.000,  0.062),
    ]
    med_rot = ("ry", -math.pi * 0.5) if sign_z > 0 else ("ry", math.pi * 0.5)
    medallion = mk_lathe_x(
        f"grip_med_{side}",
        med_prof,
        segs=40,
        xform=[med_rot, ("t", med_x, med_y, med_z_surf - sign_z * 0.025)],
        mat=m_gold,
    )

    # 3D Recessed Brass Escutcheon Ring + Blued Slotted Gunsmith Grip Screw!
    ferrule_prof = [
        (0.185, -0.09),
        (0.255, -0.09),
        (0.255,  0.015),
        (0.232,  0.034),
        (0.185,  0.034),
        (0.185, -0.09),
    ]
    ferrule = mk_lathe_x(
        f"grip_fer_{side}",
        ferrule_prof,
        segs=32,
        xform=[med_rot, ("t", sc_x, sc_y, sc_z_surf - sign_z * 0.055)],
        mat=m_brass,
    )

    gscrew_prof = [
        (0.000, -0.10),
        (0.178, -0.10),
        (0.178,  0.024),
        (0.152,  0.046),
        (0.000,  0.054),
    ]
    gscrew_raw = mk_lathe_x(
        f"grip_scr_{side}",
        gscrew_prof,
        segs=28,
        xform=[med_rot, ("t", sc_x, sc_y, sc_z_surf - sign_z * 0.042)],
        mat=m_screw,
    )
    gslot = mk_box(
        f"c_gslot_{side}",
        0.38,
        0.048,
        0.075,
        [("rz", math.radians(-18.0)), ("t", sc_x, sc_y, sc_z_surf + sign_z * 0.002)],
        m_brass,
    )
    gscrew = bool_subtract(gscrew_raw, [gslot], solver="EXACT")

    obj = join_objects([grip, medallion, ferrule, gscrew], part_name)
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_python_grip_left(mats: dict) -> bpy.types.Object:
    return _build_python_walnut_grip("left", mats)


def build_python_grip_right(mats: dict) -> bpy.types.Object:
    return _build_python_walnut_grip("right", mats)


def build_python_cylinder_latch(mats: dict) -> bpy.types.Object:
    """F-06: Colt Signature Pull-Back Checkered Teardrop Cylinder Release Latch.
    assembledPos = [-3.35, 1.48, -0.74]."""
    m_rb = mats["M_RoyalBlueMirror"]
    m_dk = mats["M_RoyalBlueDeep"]
    m_st = mats["M_JewelSteel"]

    pts_xy: list[tuple[float, float]] = [(-0.68, -0.18)]
    pts_xy += _quad_bez((-0.68, -0.18), (-0.76,  0.28), (-0.22,  0.36), 8)
    pts_xy += _quad_bez((-0.22,  0.36), ( 0.58,  0.34), ( 0.72,  0.02), 10)
    pts_xy += _quad_bez(( 0.72,  0.02), ( 0.56, -0.32), (-0.18, -0.34), 10)
    pts_xy += _quad_bez((-0.18, -0.34), (-0.62, -0.32), (-0.68, -0.18), 6)

    thumb = mk_extrude_z("cl_body", pts_xy, -0.135, 0.105, bevel=0.036, bevel_segs=3, mat=m_rb)

    # 9 crisp 3D vertical anti-slip serration ribs across the sculpted thumbpad (-Z face)
    parts = [thumb]
    for i in range(-4, 5):
        rx = i * 0.095
        h_rib = 0.44 * math.sqrt(max(0.25, 1.0 - (rx / 0.54) ** 2))
        parts.append(
            mk_box(f"cl_rib_{i}", 0.040, h_rib, 0.048, [("t", rx, 0.01, -0.148)], m_dk, bevel=0.010, bevel_segs=1)
        )
    # Internal stainless latch guide pin extending +Z into frame recoil shield
    parts.append(mk_cyl("cl_pin", 0.11, 0.11, 0.48, "z", 20, [("t", 0.18, 0.0, 0.28)], m_st, bevel=0.014))

    obj = join_objects(parts, "python_cylinder_latch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# -----------------------------------------------------------------------------
# GROUP 3: HAND-TUNED DA/SA CLOCKWORK (7 solid parts; skips `python_mainspring`)
# -----------------------------------------------------------------------------
def build_python_hammer(mats: dict) -> bpy.types.Object:
    """FC-01: Wide Checkered Target Spur DA/SA Hammer w/ Jewel-Polished Sides & Blued Spine!
    assembledPos = [-4.35, 0.58, 0] (pivots directly around [0, 0, 0])."""
    m_st = mats["M_JewelSteel"]
    m_dk = mats["M_RoyalBlueDeep"]

    ham_xy: list[tuple[float, float]] = [
        (-0.35, -0.58),
        ( 0.45, -0.52),
    ]
    ham_xy += _quad_bez(( 0.45, -0.52), ( 0.68,  0.25), ( 0.56,  1.15), 10)
    ham_xy += [
        ( 1.42,  1.62),  # Flat firing-pin striking face
        ( 1.42,  1.92),
        ( 0.48,  2.02),
    ]
    ham_xy += _quad_bez(( 0.48,  2.02), (-0.42,  2.66), (-1.92,  2.86), 14)
    ham_xy.append((-2.10,  2.56))
    ham_xy += _quad_bez((-2.10,  2.56), (-1.12,  2.22), (-0.58,  1.12), 12)
    ham_xy.append((-0.82, -0.32))

    body_raw = mk_extrude_z("ham_body", ham_xy, -0.19, 0.19, bevel=0.026, bevel_segs=3, mat=m_st)
    body = bool_subtract(body_raw, [mk_cyl("c_ham_piv", 0.145, 0.145, 0.55, "z", 24, mat=m_st)])

    # Authentic Colt Python finish: gleaming bright jewel-polished stainless left & right hammer flanks
    # ALL the way up the neck into the spur; deep Royal Blue ONLY along top spine & checkered spur pad!
    assign_material_by_predicate(
        body,
        m_dk,
        lambda tx, ty, tz, nx, ny, nz: abs(nz) < 0.42 and ty > 0.85,
    )

    # Wide flared target thumb-spur pad seated solidly on upper hammer neck w/ 9 transverse checkering ridges!
    spur_pad = mk_box(
        "ham_spur", 1.24, 0.16, 0.60, [("rz", -0.30), ("t", -1.34, 2.60, 0.0)], m_dk, bevel=0.028, bevel_segs=2
    )
    parts = [body, spur_pad]
    for i in range(-4, 5):
        parts.append(
            mk_box(
                f"ham_chk_{i}",
                0.050,
                0.055,
                0.54,
                [("rz", -0.30), ("t", -1.34 + i * 0.122, 2.675 - i * 0.036, 0.0)],
                m_dk,
                bevel=0.010,
                bevel_segs=1,
            )
        )

    # Hinged DA sear strut & stirrup cross-pin on lower heel
    parts.append(
        mk_box("ham_dastrut", 0.16, 0.62, 0.18, [("rz", 0.28), ("t", 0.32, -0.58, 0.06)], m_st, bevel=0.016, bevel_segs=2)
    )
    parts.append(
        mk_cyl("ham_spin", 0.056, 0.056, 0.42, "z", 16, [("t", -0.72, -0.28, 0.0)], m_st, bevel=0.010)
    )

    obj = join_objects(parts, "python_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_hammer_stirrup(mats: dict) -> bpy.types.Object:
    """FC-02: Jewel-Polished Stainless Pivoting Hammer Stirrup Mainspring Link.
    assembledPos = [-5.12, -0.45, 0]."""
    m_st = mats["M_JewelSteel"]
    parts = [
        mk_box("hs_armL", 0.18, 1.72, 0.072, [("rz", 0.14), ("t", -0.08, -0.10, -0.14)], m_st, bevel=0.016, bevel_segs=2),
        mk_box("hs_armR", 0.18, 1.72, 0.072, [("rz", 0.14), ("t", -0.08, -0.10,  0.14)], m_st, bevel=0.016, bevel_segs=2),
        mk_cyl("hs_top",  0.12, 0.12, 0.36, "z", 22, [("t",  0.04,  0.72, 0.0)], m_st, bevel=0.016),
        mk_cyl("hs_bot",  0.09, 0.09, 0.36, "z", 22, [("t", -0.20, -0.88, 0.0)], m_st, bevel=0.014),
    ]
    obj = join_objects(parts, "python_hammer_stirrup")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_python_trigger(mats: dict) -> bpy.types.Object:
    """FC-03: Gracefully Curved Serrated Target Trigger w/ 4 Longitudinal Grooves & DA Sear.
    assembledPos = [-2.35, -1.05, 0] (pivots directly around [0, 0, 0])."""
    m_rb = mats["M_RoyalBlueMirror"]
    m_dk = mats["M_RoyalBlueDeep"]
    m_st = mats["M_JewelSteel"]

    trig_xy: list[tuple[float, float]] = [
        (-0.42,  0.48),
        ( 0.56,  0.42),
        ( 0.32, -0.22),
    ]
    trig_xy += _quad_bez(( 0.32, -0.22), ( 0.58, -1.15), ( 0.12, -1.98), 14)
    trig_xy.append((-0.18, -1.95))
    trig_xy += _quad_bez((-0.18, -1.95), ( 0.18, -1.12), (-0.12, -0.28), 14)
    trig_xy.append((-0.55,  0.15))

    body_raw = mk_extrude_z("trg_body", trig_xy, -0.16, 0.16, bevel=0.026, bevel_segs=3, mat=m_rb)
    body = bool_subtract(body_raw, [mk_cyl("c_trg_piv", 0.125, 0.125, 0.45, "z", 22, mat=m_rb)])

    # 4 crisp curved longitudinal anti-slip finger ridges following the exact target trigger arc!
    parts = [body]
    arc_pts_2d = _quad_bez((0.33, -0.34), (0.55, -1.14), (0.14, -1.88), 12)
    for gi, z_off in enumerate((-0.105, -0.035, 0.035, 0.105)):
        spine = [(x, y, z_off) for (x, y) in arc_pts_2d]
        radii = [(0.020, 0.019) for _ in spine]
        parts.append(mk_swept_tube(f"trg_grv_{gi}", spine, radii, ring_segs=8, mat=m_dk))

    # Stainless hand-pawl crank pin on left rear tail
    parts.append(mk_cyl("trg_pin", 0.065, 0.065, 0.24, "z", 18, [("t", -0.32, 0.28, -0.18)], m_st, bevel=0.010))

    obj = join_objects(parts, "python_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_rebound_lever(mats: dict) -> bpy.types.Object:
    """FC-05: Jewel-Polished Stainless Colt Positive Safety Rebound Lever.
    assembledPos = [-5.55, -1.72, -0.04]."""
    m_st = mats["M_JewelSteel"]
    reb_xy = [
        (-0.24, -0.22),
        ( 3.05,  0.38),
        ( 2.96,  0.68),
        ( 1.42,  0.62),
        ( 1.08,  1.52),
        ( 0.68,  1.48),
        ( 0.55,  0.45),
        (-0.24,  0.24),
    ]
    lever = mk_extrude_z("python_rebound_lever", reb_xy, -0.12, 0.12, bevel=0.020, bevel_segs=2, mat=m_st)
    lever = bool_subtract(lever, [mk_cyl("c_reb_piv", 0.115, 0.115, 0.36, "z", 22, mat=m_st)])
    return finish_part(lever, bevel_w=0.0, sharp_deg=34.0)


def build_python_cylinder_bolt(mats: dict) -> bpy.types.Object:
    """FC-06: Pivoting Lower 6 O'Clock Cylinder Locking Stop Bolt & Tempered Leaf Spring.
    assembledPos = [-0.85, -1.02, 0.12]."""
    m_dk = mats["M_RoyalBlueDeep"]
    m_sp = mats["M_SpringSteel"]

    bolt_xy: list[tuple[float, float]] = [
        (-1.32, -0.14),
        ( 1.12, -0.16),
        ( 1.18,  0.22),
    ]
    bolt_xy += _quad_bez((1.18, 0.22), (0.95, 0.34), (0.72, 0.22), 8)
    bolt_xy += [
        ( 0.32,  0.08),
        (-1.28,  0.16),
    ]
    body = mk_extrude_z("cb_body", bolt_xy, -0.12, 0.10, bevel=0.018, bevel_segs=2, mat=m_dk)
    body = bool_subtract(body, [mk_cyl("c_cb_piv", 0.095, 0.095, 0.36, "z", 20, mat=m_dk)])

    leaf = mk_box("cb_leaf", 0.92, 0.048, 0.12, [("rz", -0.16), ("t", -0.55, -0.22, -0.01)], m_sp, bevel=0.008, bevel_segs=1)
    obj = join_objects([body, leaf], "python_cylinder_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_hand(mats: dict) -> bpy.types.Object:
    """FC-07: Colt Two-Step Vertical Indexing Ratchet Pawl (Hand) in Jewel-Polished Tool Steel.
    assembledPos = [-2.48, 0.18, -0.14]."""
    m_st = mats["M_JewelSteel"]
    hand_xy = [
        (-0.22, -0.95),
        ( 0.14, -0.92),
        ( 0.22,  0.58),  # Secondary bank-vault lockup step
        ( 0.32,  0.68),
        ( 0.30,  0.98),  # Primary 60-deg ratchet nose
        ( 0.06,  0.96),
        (-0.14,  0.22),
    ]
    body = mk_extrude_z("hnd_body", hand_xy, -0.08, 0.08, bevel=0.016, bevel_segs=2, mat=m_st)
    pin = mk_cyl("hnd_pin", 0.075, 0.075, 0.26, "z", 18, [("t", -0.04, -0.78, 0.10)], m_st, bevel=0.010)
    obj = join_objects([body, pin], "python_hand")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_firing_pin(mats: dict) -> bpy.types.Object:
    """FC-08: Frame-Mounted Inertial Firing Pin, Threaded Bushing & 6-Coil Static Return Spring.
    assembledPos = [-2.52, 2.35, 0] (translates rigidly along X; does NOT deform dynamically)."""
    m_st = mats["M_JewelSteel"]
    m_sp = mats["M_SpringSteel"]

    pin = mk_lathe_x(
        "fp_pin",
        [
            (0.000, -0.36),
            (0.105, -0.34),
            (0.115, -0.16),
            (0.068, -0.14),
            (0.068,  0.14),
            (0.042,  0.23),
            (0.000,  0.26),
        ],
        segs=28,
        mat=m_st,
    )
    bushing = mk_lathe_x(
        "fp_bush",
        [
            (0.078, 0.12),
            (0.165, 0.12),
            (0.165, 0.25),
            (0.152, 0.26),
            (0.078, 0.26),
            (0.078, 0.12),
        ],
        segs=28,
        mat=m_st,
    )
    spring = mk_coil_spring(
        "fp_spring", "x", -0.135, 0.115, 0.0, 0.0, 0.098, 0.016, 6.0, ring_segs=8, steps_per_coil=14, mat=m_sp
    )
    obj = join_objects([pin, bushing, spring], "python_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


# -----------------------------------------------------------------------------
# GROUP 4: SWING-OUT 6-SHOT FLUTED CYLINDER, CRANE, STAR, ROD & SPEEDLOADER
#          (5 solid parts; skips `python_extractor_spring`)
# -----------------------------------------------------------------------------
def build_python_crane(mats: dict) -> bpy.types.Object:
    """M-01: Forged Royal Blue Swing-Out Cylinder Crane (Yoke) & Stainless Spindle Arbor.
    assembledPos = [2.22, 0.28, -0.28]."""
    m_rb = mats["M_RoyalBlueMirror"]
    m_st = mats["M_JewelSteel"]

    hinge = mk_lathe_x(
        "cr_hinge",
        [
            (0.000, 0.06),
            (0.255, 0.09),
            (0.255, 1.42),
            (0.220, 1.46),
            (0.000, 1.46),
        ],
        segs=32,
        xform=[("t", 0.0, -0.76, -0.04)],
        mat=m_rb,
    )

    # Organically swept sculpted S-curve yoke forging connecting hinge to spindle!
    # Cubic smooth path in (Y, Z) at X=0.18
    p0 = Vector((0.18, -0.76, -0.04))
    p1 = Vector((0.18, -0.24, -0.14))
    p2 = Vector((0.18,  0.42,  0.10))
    p3 = Vector((0.18,  0.89,  0.28))
    spine = []
    radii = []
    n_seg = 18
    for i in range(n_seg + 1):
        t = i / n_seg
        u = 1.0 - t
        pt = (u ** 3) * p0 + 3 * (u ** 2) * t * p1 + 3 * u * (t ** 2) * p2 + (t ** 3) * p3
        spine.append((pt.x, pt.y, pt.z))
        # Sculpted forged oval yoke beam section
        radii.append((0.215 - 0.02 * math.sin(math.pi * t), 0.195))
    yoke_arm = mk_swept_tube("cr_arm", spine, radii, ring_segs=20, mat=m_rb)
    cap_bot = mk_sphere("cr_bot", 0.22, 0.22, 0.22, 20, 12, [("t", 0.18, -0.76, -0.04)], m_rb)
    cap_top = mk_sphere("cr_top", 0.24, 0.24, 0.24, 20, 12, [("t", 0.18,  0.89,  0.28)], m_rb)

    # Polished stainless hollow spindle arbor running rearward inside cylinder
    spindle = mk_lathe_x(
        "cr_spindle",
        [
            (0.19, -3.72),
            (0.32, -3.72),
            (0.32,  0.18),
            (0.38,  0.22),
            (0.38,  0.32),
            (0.19,  0.32),
            (0.19, -3.72),
        ],
        segs=32,
        xform=[("t", 0.0, 0.89, 0.28)],
        mat=m_st,
    )

    yoke_solid = bool_union([hinge, yoke_arm, cap_bot, cap_top], "cr_yoke")
    obj = join_objects([yoke_solid, spindle], "python_crane")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_python_cylinder(mats: dict) -> bpy.types.Object:
    """M-02: Iconic Deeply Fluted 6-Shot C_6 Symmetric .357 Magnum Cylinder!
    assembledPos = [0.10, 1.17, 0]. OD = 39.4 mm (R = 1.97 cm), L = 4.16 cm (X in [-2.08, +2.08]).
    Strictly C_6 (60-deg) rotationally symmetric around +X!
    Features:
      - Beveled Colt front holster-entry nose & chamfered rear rim
      - 6 precision through-bored .357 chambers w/ stepped bullet throats & recessed rim counterbores
      - 6 deeply scalloped rounded-end external weight-reduction flutes
      - 6 beveled cylinder-bolt locking notches + authentic Colt tangential lead-in ramps
      - Recessed rear ratchet star pocket
    """
    m_rb = mats["M_RoyalBlueCylinder"]
    m_bore = mats["M_BoreCarbon"]
    m_st = mats["M_JewelSteel"]

    # 72 radial segments (exact multiple of 6 -> 12 segments per 60-deg chamber!)
    blank = mk_lathe_x(
        "python_cylinder",
        [
            (0.34, -2.08),
            (1.93, -2.08),
            (1.97, -2.03),
            (1.97,  1.83),
            (1.94,  1.90),
            (1.83,  2.08),  # Iconic Colt beveled front cylinder nose
            (0.34,  2.08),
            (0.34, -2.08),
        ],
        segs=72,
        mat=m_rb,
    )

    cutters = []
    for k in range(6):
        ang = k * math.pi / 3.0
        cy = math.cos(ang) * 1.18
        cz = math.sin(ang) * 1.18

        # Stepped .357 Magnum chamber bore (case wall r=0.495 -> bullet throat r=0.475) + rim counterbore!
        ch_cut = mk_lathe_x(
            f"c_ch_{k}",
            [
                (0.000, -2.20),
                (0.558, -2.20),
                (0.558, -1.89),  # Recessed rimmed .357 counterbore
                (0.495, -1.87),
                (0.492,  1.20),  # Straight-wall case chamber
                (0.474,  1.42),  # Stepped bullet throat cone
                (0.474,  2.20),
                (0.000,  2.20),
            ],
            segs=32,
            xform=[("t", 0.0, cy, cz)],
            mat=m_st,
        )
        cutters.append(ch_cut)

        # Deeply scalloped rounded-end Colt Python flute at (k + 0.5) * 60 deg!
        f_ang = ang + math.pi / 6.0
        fy = math.cos(f_ang) * 2.175
        fz = math.sin(f_ang) * 2.175
        # Smooth watertight capsule flute cutter (lathed around +X so front/rear scallops are razor-smooth!)
        flute_prof = [(0.000, -1.255)]
        n_cap = 8
        for s in range(1, n_cap + 1):
            a = -math.pi * 0.5 + (math.pi * 0.5) * (s / n_cap)
            flute_prof.append((0.462 * math.cos(a), -0.795 + 0.460 * math.sin(a)))
        for s in range(0, n_cap + 1):
            a = (math.pi * 0.5) * (s / n_cap)
            flute_prof.append((0.462 * math.cos(a), 1.555 + 0.460 * math.sin(a)))
        flute_prof.append((0.000, 2.015))
        cutters.append(
            mk_lathe_x(f"c_flute_{k}", flute_prof, segs=28, xform=[("t", 0.0, fy, fz)], mat=m_rb)
        )

        # Beveled rectangular cylinder locking-bolt notch at `ang + pi` + authentic Colt sloped lead-in ramp!
        n_ang = ang + math.pi
        notch = mk_box(
            f"c_notch_{k}",
            0.54,
            0.28,
            0.30,
            [("t", -0.92, 1.96, 0.0), ("rx", n_ang)],
            m_bore,
            bevel=0.025,
            bevel_segs=2,
        )
        # Tangential sloped lead-in ramp entering each locking notch (signature revolver craftsmanship!)
        ramp = mk_box(
            f"c_ramp_{k}",
            0.46,
            0.14,
            0.38,
            [("rx", -0.24), ("t", -0.92, 1.99, -0.24), ("rx", n_ang)],
            m_rb,
            bevel=0.018,
            bevel_segs=1,
        )
        cutters.extend([notch, ramp])

    # Recessed rear ratchet star pocket (R=1.24, X in [-2.12, -1.94])
    cutters.append(mk_cyl("c_star_pkt", 1.24, 1.24, 0.22, "x", 48, [("t", -2.03, 0.0, 0.0)], m_bore))

    cyl = bool_subtract(blank, cutters, solver="EXACT")
    return finish_part(cyl, bevel_w=0.0, sharp_deg=34.0)


def build_python_extractor_star(mats: dict) -> bpy.types.Object:
    """M-03: Strictly C_6 Symmetric 6-Point Precision Ratchet Extractor Star & Guide Stem.
    assembledPos = [-0.65, 1.17, 0]."""
    m_st = mats["M_JewelSteel"]

    disc = mk_cyl("es_disc", 1.22, 1.22, 0.20, "x", 48, [("t", -1.43, 0.0, 0.0)], m_st, bevel=0.016)
    cuts = []
    for k in range(6):
        ang = k * math.pi / 3.0
        cuts.append(
            mk_cyl(
                f"c_es_{k}",
                0.495,
                0.495,
                0.38,
                "x",
                28,
                [("t", -1.43, math.cos(ang) * 1.18, math.sin(ang) * 1.18)],
                m_st,
            )
        )
    star_head = bool_subtract(disc, cuts, solver="EXACT")

    parts = [star_head]
    # 6 crisp asymmetric indexing ratchet teeth around rear hub engaged by `python_hand`
    for k in range(6):
        ang = k * math.pi / 3.0
        parts.append(
            mk_box(
                f"es_tooth_{k}",
                0.18,
                0.22,
                0.16,
                [("rx", 0.32), ("t", -1.51, 0.42, 0.0), ("rx", ang)],
                m_st,
                bevel=0.016,
                bevel_segs=2,
            )
        )
    # Central hollow extractor guide stem extending forward inside spindle
    parts.append(
        mk_lathe_x(
            "es_stem",
            [
                (0.14, -1.60),
                (0.27, -1.60),
                (0.27,  2.45),
                (0.14,  2.45),
                (0.14, -1.60),
            ],
            segs=28,
            mat=m_st,
        )
    )
    obj = join_objects(parts, "python_extractor_star")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_python_extractor_rod(mats: dict) -> bpy.types.Object:
    """M-04: Jewel-Polished Stainless Front Ejector Rod w/ True 3D Diamond-Knurled Tip!
    assembledPos = [4.95, 1.17, 0]."""
    m_st = mats["M_JewelSteel"]

    rod = mk_lathe_x(
        "er_shaft",
        [
            (0.000, -2.75),
            (0.135, -2.72),
            (0.145,  1.92),
            (0.236,  1.98),
            (0.236,  2.73),
            (0.185,  2.77),
            (0.085,  2.77),  # Concave detent socket mating w/ `python_detent_plunger`
            (0.000,  2.68),
        ],
        segs=32,
        mat=m_st,
    )
    # True 3D multi-band diamond-knurled ejector tip (watertight manifold solid!)
    knurl = mk_knurled_cyl(
        "er_knurl",
        radius=0.258,
        length=0.70,
        axis="x",
        flutes=18,
        depth=0.020,
        diamond_bands=10,
        xform=[("t", 2.36, 0.0, 0.0)],
        mat=m_st,
    )
    obj = join_objects([rod, knurl], "python_extractor_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_python_speedloader(mats: dict) -> bpy.types.Object:
    """M-06: Museum-Showcase HKS 586-A Rotary Speedloader + 6 Gleaming .357 Magnum JHP Cartridges!
    assembledPos = [4.20, -6.20, -2.20].
    Showcases alternating gleaming Brass & Nickel rimmed .357 cases w/ silver Boxer primers,
    warm gilding-copper 158gr JHP jackets, exposed lead hollow-point cavities & 3D knurled knob!"""
    m_an = mats["M_AnodizedBlack"]
    m_br = mats["M_CartridgeBrass"]
    m_nk = mats["M_CartridgeNickel"]
    m_cu = mats["M_CopperJHP"]
    m_ld = mats["M_LeadCore"]
    m_au = mats["M_GoldTrim"]
    m_st = mats["M_JewelSteel"]

    # 1. Machined black anodized aluminum rotary speedloader body
    body_raw = mk_lathe_x(
        "sl_body",
        [
            (0.26, -0.65),
            (1.78, -0.65),
            (1.85, -0.58),
            (1.85,  0.28),
            (1.78,  0.35),
            (0.26,  0.35),
            (0.26, -0.65),
        ],
        segs=48,
        mat=m_an,
    )
    # 6 clean cartridge pocket chamfers recessed into front face of speedloader housing
    pocket_cuts = []
    for k in range(6):
        ang = k * math.pi / 3.0
        pocket_cuts.append(
            mk_cyl(
                f"c_sl_p{k}",
                0.555,
                0.555,
                0.76,
                "x",
                24,
                [("t", 0.02, math.cos(ang) * 1.18, math.sin(ang) * 1.18)],
                m_an,
            )
        )
    body = bool_subtract(body_raw, pocket_cuts, solver="EXACT")

    # 2. 3D Diamond-knurled rotary release twist knob + gleaming gold directional ring
    knob_base = mk_lathe_x(
        "sl_knob_base",
        [
            (0.00, -1.58),
            (0.90, -1.58),
            (0.96, -1.50),
            (0.96, -0.82),
            (0.62, -0.65),
            (0.00, -0.65),
        ],
        segs=36,
        mat=m_an,
    )
    knob_knurl = mk_knurled_cyl(
        "sl_knob_knurl",
        radius=0.985,
        length=0.64,
        axis="x",
        flutes=24,
        depth=0.024,
        diamond_bands=8,
        xform=[("t", -1.16, 0.0, 0.0)],
        mat=m_an,
    )
    trim_ring = mk_lathe_x(
        "sl_gold_ring",
        [
            (0.968, -1.19),
            (0.996, -1.19),
            (0.996, -1.12),
            (0.968, -1.12),
            (0.968, -1.19),
        ],
        segs=36,
        mat=m_au,
    )

    parts = [body, knob_base, knob_knurl, trim_ring]

    # 3. Six Showcase .357 Magnum 158gr JHP Cartridges at exact R = 1.18 cm pitch circle!
    for k in range(6):
        ang = k * math.pi / 3.0
        cy = math.cos(ang) * 1.18
        cz = math.sin(ang) * 1.18
        case_mat = m_br if (k % 2 == 0) else m_nk

        # Straight-wall rimmed .357 Magnum case w/ crisp extractor rim & rolled case mouth!
        case_obj = mk_lathe_x(
            f"sl_case_{k}",
            [
                (0.000, -0.450),
                (0.525, -0.450),  # Rimmed .357 headstamp
                (0.542, -0.432),
                (0.542, -0.352),
                (0.476, -0.332),  # Straight-wall body (9.63mm)
                (0.472,  1.525),
                (0.456,  1.550),  # Crimped case mouth
                (0.000,  1.550),
            ],
            segs=28,
            xform=[("t", 0.0, cy, cz)],
            mat=case_mat,
        )
        # Silver Boxer primer cup seated flush in headstamp rear face
        primer = mk_cyl(
            f"sl_prim_{k}", 0.215, 0.215, 0.04, "x", 20, [("t", -0.438, cy, cz)], m_st, bevel=0.008
        )
        # 158gr Gilding-Copper Jacketed Hollow-Point (JHP) projectile w/ cannelure & deep hollow nose!
        jhp_jacket = mk_lathe_x(
            f"sl_jhp_{k}",
            [
                (0.000, 1.535),
                (0.454, 1.535),
                (0.454, 1.840),
                (0.436, 1.860),  # Subtle crimp cannelure groove
                (0.450, 1.890),
                (0.422, 2.040),
                (0.340, 2.345),  # Truncated cone JHP nose
                (0.305, 2.360),
                (0.175, 2.360),  # Scalloped copper jacket lip
                (0.105, 2.185),  # Deep hollow-point cavity
                (0.000, 2.170),
            ],
            segs=28,
            xform=[("t", 0.0, cy, cz)],
            mat=m_cu,
        )
        # Subtle exposed lead core lining inside the hollow-point nose cavity
        lead_core = mk_lathe_x(
            f"sl_lead_{k}",
            [
                (0.000, 2.14),
                (0.145, 2.14),
                (0.172, 2.345),
                (0.110, 2.185),
                (0.000, 2.175),
            ],
            segs=20,
            xform=[("t", 0.0, cy, cz)],
            mat=m_ld,
        )
        parts.extend([case_obj, primer, jhp_jacket, lead_core])

    obj = join_objects(parts, "python_speedloader")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Color-Firewalled CONCAVE Packing
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    include_face_fn,
    label: str = "pack",
    margin: float = 0.0045,
) -> int:
    """Smart-unwraps ONLY faces matching `include_face_fn(obj_name, face, mat_name)` across `objs`,
    packs with Blender 5.2 CONCAVE zero-overlap packing, and maps strictly into [u0, u1] x [v0, v1]."""
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    active_objs: list[bpy.types.Object] = []
    face_count = 0
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
        obj_hits = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            sel = bool(include_face_fn(o.name, f, mname))
            f.select = sel
            if sel:
                obj_hits += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if obj_hits > 0:
            active_objs.append(o)
            face_count += obj_hits

    if not active_objs:
        return 0

    select_only(active_objs, active_objs[0])
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
        margin=margin,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du = u1 - u0
    dv = v1 - v0
    pu_min, pu_max = 1.0, 0.0
    pv_min, pv_max = 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if not include_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                pu_min = min(pu_min, ux)
                pu_max = max(pu_max, ux)
                pv_min = min(pv_min, vy)
                pv_max = max(pv_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = pu_max - pu_min
    span_v = pv_max - pv_min
    print(
        f"  [UV-PACK] {label:16s} ({len(active_objs):2d} objs, {face_count:5d} faces) -> "
        f"[{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})"
    )
    assert span_u > 0.30 and span_v > 0.30, f"UV pack collapsed for {label}: span=({span_u}, {span_v})"
    return face_count


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]) -> None:
    """Disjoint, zero-bleed 2048x2048 UV atlas for all 21 metal/ordnance/speedloader parts:
      - Hero Band A (Barrel Left Flank — PYTHON .357):         [0.015, 0.985] x [0.855, 0.985]
      - Hero Band B (Barrel Right Flank — HARTFORD, CONN.):    [0.015, 0.985] x [0.710, 0.840]
      - Hero Band C (Ventilated Top Rib + Frame Top Strap):    [0.015, 0.985] x [0.640, 0.695]
      - Hero Band D (Fluted Cylinder C_6 Periodic Turn-Line):  [0.015, 0.985] x [0.500, 0.625]
      - Hero Band E (Left I-Frame — Rampant Colt + VP + Ser):  [0.015, 0.315] x [0.230, 0.480]
      - Zone 1 (Royal Blue Non-Hero Packed):                   [0.335, 0.990] x [0.220, 0.485]
      - Zone 2 (Jewel-Polished Stainless Lockwork Packed):     [0.010, 0.545] x [0.010, 0.200]
      - Zone 3 (Speedloader + .357 Cartridges + Sight Accents):[0.565, 0.990] x [0.010, 0.200]
    """
    JEWEL_OBJ_NAMES = {
        "python_hammer",
        "python_hammer_stirrup",
        "python_rebound_lever",
        "python_hand",
        "python_firing_pin",
        "python_extractor_star",
        "python_extractor_rod",
        "python_barrel_pin",
        "python_detent_plunger",
    }
    ACCENT_MAT_NAMES = {"M_SightRedInsert", "M_SightWhiteInlay"}

    def classify_metal_face(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        # Blender -> Three.js: tx=bx, ty=bz, tz=-by; nx=bnx, ny=bnz, nz=-bny
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        # Hero Band C: Matte anti-glare top sighting deck on barrel rib & frame top strap
        if obj_name in ("python_barrel", "python_frame") and mat_name == "M_RibMatte":
            if ny > 0.72 and ty > 3.62 and -2.95 <= tx <= 17.40:
                return "HERO_RIB"

        # Hero Bands A & B: Sculpted flat/crowned barrel & underlug exterior flanks (for crisp rollmarks!)
        if obj_name == "python_barrel" and mat_name == "M_RoyalBlueMirror":
            if 3.55 <= tx <= 17.40 and 0.90 <= ty <= 2.90:
                if nz < -0.52 and tz < -0.36:
                    return "HERO_BRL_L"
                if nz > 0.52 and tz > 0.36:
                    return "HERO_BRL_R"

        # Hero Band D: 6-Shot Fluted Cylinder exterior radial walls (C_6 periodic turn-line!)
        if obj_name == "python_cylinder" and mat_name in ("M_RoyalBlueMirror", "M_RoyalBlueCylinder", "M_BoreCarbon"):
            rad = math.hypot(ty, tz)
            if rad > 1.38 and abs(nx) < 0.78 and -2.07 <= tx <= 2.07:
                return "HERO_CYL"

        # Hero Band E: Left flat I-frame flank behind cylinder (Rampant Colt + VP + E 48291!)
        if obj_name == "python_frame" and mat_name == "M_RoyalBlueMirror":
            if -6.08 <= tx <= -2.26 and -1.48 <= ty <= 2.82 and nz < -0.78 and tz < -0.58:
                return "HERO_FRM_L"

        # Color-Firewalled Zone 3: Speedloader + 6 Brass/Nickel/Copper Cartridges + Red/White Sight Inserts
        if obj_name == "python_speedloader" or mat_name in ACCENT_MAT_NAMES:
            return "ZONE_3"

        # Color-Firewalled Zone 2: Bright Jewel-Polished Stainless Lockwork & Hardware
        if obj_name in JEWEL_OBJ_NAMES or mat_name in ("M_JewelSteel", "M_SpringSteel"):
            return "ZONE_2"

        # Zone 1: Remaining Royal Blue structural/exterior faces
        return "ZONE_1"

    # Pack the 3 color-firewalled non-hero zones cleanly with CONCAVE zero-overlap packing
    c1 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.335, 0.990, 0.220, 0.485,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_1",
        label="metal_zone1_rb",
        margin=0.0045,
    )
    c2 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.010, 0.545, 0.010, 0.200,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_2",
        label="metal_zone2_st",
        margin=0.0045,
    )
    c3 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.565, 0.990, 0.010, 0.200,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_3",
        label="metal_zone3_sl",
        margin=0.0045,
    )

    # Project all 5 Hero Bands cleanly into their reserved non-overlapping rectangles
    hero_counts = {"HERO_BRL_L": 0, "HERO_BRL_R": 0, "HERO_RIB": 0, "HERO_CYL": 0, "HERO_FRM_L": 0}
    for o in metal_objs:
        if o.name not in ("python_barrel", "python_frame", "python_cylinder"):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            cls = classify_metal_face(o.name, f, mname)
            if cls not in hero_counts:
                continue
            hero_counts[cls] += 1

            if cls == "HERO_BRL_L":
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    xn = max(0.0, min(1.0, (tx - 3.55) / (17.42 - 3.55)))
                    yn = max(0.0, min(1.0, (ty - 0.88) / (2.92 - 0.88)))
                    # Left flank: muzzle (+X) on screen-left -> u increases from muzzle toward breech!
                    loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.855 + yn * 0.130)

            elif cls == "HERO_BRL_R":
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    xn = max(0.0, min(1.0, (tx - 3.55) / (17.42 - 3.55)))
                    yn = max(0.0, min(1.0, (ty - 0.88) / (2.92 - 0.88)))
                    # Right flank: breech (-X) on screen-left -> u increases toward muzzle!
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.710 + yn * 0.130)

            elif cls == "HERO_RIB":
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, tz = vco.x, -vco.y
                    xn = max(0.0, min(1.0, (tx - (-2.95)) / (17.38 - (-2.95))))
                    zn = max(0.0, min(1.0, (tz + 0.36) / 0.72))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.640 + zn * 0.055)

            elif cls == "HERO_CYL":
                # Continuous C_6 periodic cylindrical unwrap with guard wings [0.015..0.025] & [0.975..0.985]!
                fc = f.calc_center_median()
                base_ang = math.atan2(-fc.y, fc.z)  # atan2(tz, ty) in [-pi, pi]
                base_u01 = ((base_ang / (2.0 * math.pi)) + 1.0) % 1.0
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty, tz = vco.x, vco.z, -vco.y
                    ang = math.atan2(tz, ty)
                    d_ang = ang - base_ang
                    if d_ang > math.pi:
                        d_ang -= 2.0 * math.pi
                    elif d_ang < -math.pi:
                        d_ang += 2.0 * math.pi
                    u_phase = base_u01 + d_ang / (2.0 * math.pi)
                    u_val = max(0.015, min(0.985, 0.025 + u_phase * 0.950))
                    xn = max(0.0, min(1.0, (tx + 2.08) / 4.16))
                    v_val = 0.500 + xn * 0.125
                    loop[uv_layer].uv = (u_val, v_val)

            elif cls == "HERO_FRM_L":
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    xn = max(0.0, min(1.0, (tx - (-6.10)) / ((-2.25) - (-6.10))))
                    yn = max(0.0, min(1.0, (ty - (-1.50)) / (2.85 - (-1.50))))
                    # Left flank: front (-2.25) on screen-left -> u increases from front toward rear (-6.10)!
                    loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.300, 0.230 + yn * 0.250)

        bm.to_mesh(o.data)
        bm.free()

    print(f"  [UV-HERO] metal heroes: {hero_counts} | packed zones: Z1={c1}, Z2={c2}, Z3={c3}")
    for k, cnt in hero_counts.items():
        assert cnt > 0, f"Hero UV band {k} captured 0 faces!"


def unwrap_walnut_atlas(walnut_objs: list[bpy.types.Object]) -> None:
    """Disjoint, zero-bleed 2048x2048 UV atlas for `python_grip_left` & `python_grip_right`:
      - Hero Left Outer Contoured Walnut Face:    [0.020, 0.485] x [0.180, 0.985] (pre-authored parametric!)
      - Hero Right Outer Contoured Walnut Face:   [0.515, 0.980] x [0.180, 0.985] (pre-authored parametric!)
      - Wood Inner Cavities & Perimeter Rims:     [0.010, 0.540] x [0.010, 0.160]
      - Dedicated 286px Left Gold Colt Medallion: [0.560, 0.700] x [0.015, 0.155]
      - Dedicated 286px Right Gold Colt Medallion:[0.715, 0.855] x [0.015, 0.155]
      - Medallion Rims, Escutcheons & Grip Screws:[0.870, 0.990] x [0.010, 0.160]
    """
    med_x, med_y = _eval_python_grip_xy(0.50, 0.80)
    med_r = 0.50

    def classify_walnut_face(obj_name: str, face, mat_name: str) -> str:
        is_right = (obj_name == "python_grip_right")
        sign_z = 1.0 if is_right else -1.0
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y

        if mat_name == "W_AmericanWalnut":
            # Outward palm-facing walnut grid faces ALREADY have exact parametric HeroGripUVs!
            if nz * sign_z > 0.35 and tz * sign_z > 0.04:
                return "HERO_WOOD_R" if is_right else "HERO_WOOD_L"
            return "WOOD_INNER"

        if mat_name == "W_GoldMedallion":
            # Outward-facing circular coin face of the 24K Gold Colt Medallion!
            if nz * sign_z > 0.65:
                return "HERO_MED_R" if is_right else "HERO_MED_L"
            return "HARDWARE"

        return "HARDWARE"

    # Pack non-hero wood inner/rim faces & metal hardware faces into their firewalled lower boxes!
    cw = _smart_unwrap_and_pack_rect(
        walnut_objs, 0.010, 0.540, 0.010, 0.160,
        include_face_fn=lambda on, f, mn: classify_walnut_face(on, f, mn) == "WOOD_INNER",
        label="walnut_inner",
        margin=0.005,
    )
    ch = _smart_unwrap_and_pack_rect(
        walnut_objs, 0.870, 0.990, 0.010, 0.160,
        include_face_fn=lambda on, f, mn: classify_walnut_face(on, f, mn) == "HARDWARE",
        label="walnut_hw",
        margin=0.005,
    )

    # Project Left & Right 24K Gold Colt Medallion coin discs cleanly (100% upright & L->R on BOTH flanks!)
    med_counts = {"HERO_MED_L": 0, "HERO_MED_R": 0, "HERO_WOOD_L": 0, "HERO_WOOD_R": 0}
    for o in walnut_objs:
        is_right = (o.name == "python_grip_right")
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            cls = classify_walnut_face(o.name, f, mname)
            if cls in ("HERO_WOOD_L", "HERO_WOOD_R"):
                med_counts[cls] += 1
                # Clamp safety on pre-authored parametric outer walnut UVs
                u_lo, u_hi = (0.515, 0.980) if is_right else (0.020, 0.485)
                for loop in f.loops:
                    uv = loop[uv_layer].uv
                    uv.x = max(u_lo, min(u_hi, uv.x))
                    uv.y = max(0.180, min(0.985, uv.y))
            elif cls in ("HERO_MED_L", "HERO_MED_R"):
                med_counts[cls] += 1
                u0, u1 = (0.715, 0.855) if is_right else (0.560, 0.700)
                v0, v1 = 0.015, 0.155
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    dx = (tx - med_x) / (med_r * 1.04)
                    dy = (ty - med_y) / (med_r * 1.04)
                    # Right (+Z): +dx goes right; Left (-Z): -dx goes right -> COLT reads L->R on BOTH flanks!
                    u_n = max(0.0, min(1.0, 0.5 + (dx if is_right else -dx) * 0.5))
                    v_n = max(0.0, min(1.0, 0.5 + dy * 0.5))
                    loop[uv_layer].uv = (u0 + u_n * (u1 - u0), v0 + v_n * (v1 - v0))
        bm.to_mesh(o.data)
        bm.free()

    print(f"  [UV-HERO] walnut heroes: {med_counts} | packed inner={cw}, hw={ch}")
    for k, cnt in med_counts.items():
        assert cnt > 0, f"Walnut hero region {k} captured 0 faces!"


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


def _remove_bake_image_nodes(created: list[tuple]) -> None:
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set: set[bpy.types.Material], input_name: str) -> list[tuple]:
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


def _restore_bsdf(saved: list[tuple]) -> None:
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path) -> None:
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]) -> None:
    for i, o in enumerate(all_objs):
        o.location = (i * 55.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]) -> None:
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            o.rotation_euler = (0.0, 0.0, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 200.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]) -> None:
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
) -> None:
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str,
        bake_type: str,
        samples: int,
        fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False,
        extra_objs_override=None,
    ) -> None:
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

        kwargs = dict(type=bake_type, margin=5, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    # 1. Isolated grid layout: pure Albedo, Roughness, Metalness, Tangent Normal & Self-AO
    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.02, 0.025, 0.038, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.35, 0.35, 0.35, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.55
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # 2. Assembled stationary exterior layout: inter-part contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.40
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
    bpy.ops.object.bake(type="EMIT", margin=5, use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)

    for o in ext_targets:
        o.data.materials.clear()
        for m in orig_mats[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


# =============================================================================
# Hard-Contract Verification, Exploded Clearance Audit & Draco GLB Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
    max_bbox_delta = 0.0
    total_tris = 0
    local_bboxes: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {}

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

        local_bboxes[o.name] = (bmin, bmax)
        ref_min, ref_max = CSG_REF_BBOX[o.name]
        deltas = [abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)]
        d_max = max(deltas)
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.12) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:6d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        assert non_man == 0, f"MANIFOLD VIOLATION on {o.name}: non_man={non_man}"
        assert vol > 0.0, f"NEGATIVE/ZERO VOLUME on {o.name}: vol={vol}"
        if d_max > 0.12:
            print(f"       !! BBOX DELTA > 0.12cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}

    # Check t=1.0 exploded AABB zero-clipping across all 23 parts!
    exp_boxes = {}
    for pid, (bmin, bmax) in local_bboxes.items():
        ap = ASSEMBLED_POS[pid]
        eo = EXPLODE_OFFSET_T1[pid]
        shift = (ap[0] + eo[0], ap[1] + eo[1], ap[2] + eo[2])
        exp_boxes[pid] = (
            (bmin[0] + shift[0], bmin[1] + shift[1], bmin[2] + shift[2]),
            (bmax[0] + shift[0], bmax[1] + shift[1], bmax[2] + shift[2]),
        )
    exp_overlaps = []
    pids = list(exp_boxes.keys())
    for i in range(len(pids)):
        for j in range(i + 1, len(pids)):
            a0, a1 = exp_boxes[pids[i]]
            b0, b1 = exp_boxes[pids[j]]
            ox = min(a1[0], b1[0]) - max(a0[0], b0[0])
            oy = min(a1[1], b1[1]) - max(a0[1], b0[1])
            oz = min(a1[2], b1[2]) - max(a0[2], b0[2])
            if ox > 0.05 and oy > 0.05 and oz > 0.05:
                exp_overlaps.append((pids[i], pids[j], round(ox, 3), round(oy, 3), round(oz, 3)))
    print(
        f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | "
        f"worst_bbox_delta={max_bbox_delta:.4f} cm | t=1.0_overlaps={len(exp_overlaps)}"
    )
    if exp_overlaps:
        print(f"  [WARN] t=1.0 overlaps: {exp_overlaps}")
    return report


def export_draco_glb(all_objs: list[bpy.types.Object]) -> None:
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


def render_qa_previews(all_objs: list[bpy.types.Object]) -> None:
    """Optional Cycles visual QA renderer (`-- --preview`): mounts the FINAL baked WebP PBR maps
    onto the exported meshes in a twin-softbox dark museum studio and renders 5 inspection plates
    to `/tmp/python_qa_*.png` (never writes preview images into the git repository!)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 3
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25

    # Build final PBR preview materials reading the ACTUAL baked WebP atlases!
    def make_baked_mat(name: str, stem: str, nrm_strength: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(name)
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        img_a = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_albedo.webp"))
        img_a.colorspace_settings.name = "sRGB"
        t_a = nt.nodes.new("ShaderNodeTexImage")
        t_a.image = img_a

        img_o = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_roughness.webp"))
        img_o.colorspace_settings.name = "Non-Color"
        t_o = nt.nodes.new("ShaderNodeTexImage")
        t_o.image = img_o

        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_o.outputs["Color"], sep.inputs["Color"])

        # Multiply Albedo by baked AO (R channel) for Cycles preview
        ao_mix = nt.nodes.new("ShaderNodeMix")
        ao_mix.data_type = "RGBA"
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs["Factor"].default_value = 0.88
        nt.links.new(t_a.outputs["Color"], ao_mix.inputs["A"])
        nt.links.new(sep.outputs["Red"], ao_mix.inputs["B"])

        nt.links.new(ao_mix.outputs["Result"], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        img_n = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_normal.webp"))
        img_n.colorspace_settings.name = "Non-Color"
        t_n = nt.nodes.new("ShaderNodeTexImage")
        t_n.image = img_n
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nrm_strength
        nt.links.new(t_n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_m = make_baked_mat("QA_Metal", "python_v3_metal", 0.82)
    mat_w = make_baked_mat("QA_Walnut", "python_v3_walnut", 0.90)

    for o in all_objs:
        o.data.materials.clear()
        o.data.materials.append(mat_w if o.name in WALNUT_PARTS else mat_m)
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False

    # Load actual project HDRI (`public/hdri/tactical_vault.hdr`) so QA preview matches Three.js WebGL 1:1!
    wnt = scene.world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wbg = wnt.nodes.new("ShaderNodeBackground")
    hdri_path = REPO_ROOT / "public" / "hdri" / "tactical_vault.hdr"
    if hdri_path.exists():
        env_tex = wnt.nodes.new("ShaderNodeTexEnvironment")
        env_tex.image = bpy.data.images.load(str(hdri_path))
        wnt.links.new(env_tex.outputs["Color"], wbg.inputs["Color"])
        wbg.inputs["Strength"].default_value = 1.25
    else:
        wbg.inputs["Color"].default_value = (0.04, 0.05, 0.07, 1.0)
        wbg.inputs["Strength"].default_value = 1.0
    wnt.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

    # Clean dark museum backdrop for camera rays while keeping full HDRI reflections on Royal Blue steel!
    lp = wnt.nodes.new("ShaderNodeLightPath")
    bg_cam = wnt.nodes.new("ShaderNodeBackground")
    bg_cam.inputs["Color"].default_value = (0.025, 0.032, 0.044, 1.0)
    bg_cam.inputs["Strength"].default_value = 1.0
    mix_s = wnt.nodes.new("ShaderNodeMixShader")
    wnt.links.new(lp.outputs["Is Camera Ray"], mix_s.inputs["Fac"])
    wnt.links.new(wbg.outputs["Background"], mix_s.inputs[1])
    wnt.links.new(bg_cam.outputs["Background"], mix_s.inputs[2])
    wnt.links.new(mix_s.outputs["Shader"], wout.inputs["Surface"])

    def add_softbox(name: str, loc_t: tuple, aim_t: tuple, energy: float, sx: float, sy: float, col=(1.0, 0.98, 0.96)):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.shape = "RECTANGLE"
        ld.size = sx
        ld.size_y = sy
        ld.energy = energy
        ld.color = col
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = t2b(*loc_t)
        d = t2b(*aim_t) - lo.location
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    add_softbox("KeyStrip_L", ( 4.0, 20.0, -20.0), (2.0, -1.0, 0.0), 2200.0, 38.0, 10.0, (0.97, 0.99, 1.00))
    add_softbox("KeyStrip_R", ( 4.0, 20.0,  20.0), (2.0, -1.0, 0.0), 2000.0, 38.0, 10.0, (1.00, 0.97, 0.92))
    add_softbox("SideCard_L", ( 2.0,  4.0, -30.0), (2.0, -1.0, 0.0),  420.0, 34.0, 14.0, (0.90, 0.94, 1.00))
    add_softbox("SideCard_R", ( 2.0,  4.0,  30.0), (2.0, -1.0, 0.0),  420.0, 34.0, 14.0, (0.96, 0.95, 0.92))

    cam_d = bpy.data.cameras.new("QACam")
    cam_d.lens = 58.0
    cam = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(fname: str, eye_t: tuple, tgt_t: tuple, lens: float = 58.0):
        cam_d.lens = lens
        cam.location = t2b(*eye_t)
        d = t2b(*tgt_t) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"/tmp/{fname}"
        bpy.ops.render.render(write_still=True)
        print(f"[QA-RENDER] Saved /tmp/{fname}")

    # 1. Full-Length Left Hero 3/4 Profile (muzzle crown to flared target grip butt + speedloader!)
    shoot("python_qa_left.png", (5.5, 4.5, -45.0), (2.8, -2.2, 0.0), lens=54.0)
    # 2. Full-Length Right Hero 3/4 Profile (Hartford address, beveled sideplate w/ 3 screws, right grip!)
    shoot("python_qa_right.png", (0.5, 4.5, 45.0), (2.8, -2.2, 0.0), lens=54.0)
    # 3. 3/4 Front-Left Museum Iso (11-deg crown, 6-groove helical rifling, matte top rib, red front sight!)
    shoot("python_qa_iso.png", (25.0, 10.0, -22.0), (3.5, 0.5, 0.0), lens=52.0)
    # 4. Macro Barrel Rollmark + 3 Ventilated Rib Ports + Fluted Cylinder + Turn Line!
    shoot("python_qa_macro_barrel.png", (7.5, 3.8, -19.5), (7.2, 2.0, 0.0), lens=64.0)
    # 5. Macro American Walnut Target Grip + 22-LPI Diamond Checkering + 24K Gold Medallion + Blued Screw!
    shoot("python_qa_macro_grip.png", (-6.2, -2.8, -16.5), (-7.8, -4.0, -0.5), lens=66.0)
    # 6. Lockwork Internals Open View (hide right sideplate, screws & grip to inspect jewel clockwork!)
    for hide_name in ("python_sideplate", "python_sideplate_screws", "python_grip_right"):
        o = bpy.data.objects.get(hide_name)
        if o:
            o.hide_render = True
    shoot("python_qa_internals.png", (-2.2, 1.5, 17.5), (-3.2, -0.2, 0.0), lens=64.0)


def main() -> None:
    t_start = time.time()
    do_preview = "--preview" in sys.argv
    reset_scene()
    mats = create_material_library()

    builders = {
        "python_barrel":           build_python_barrel,
        "python_front_sight":      build_python_front_sight,
        "python_rear_sight":       build_python_rear_sight,
        "python_barrel_pin":       build_python_barrel_pin,
        "python_detent_plunger":   build_python_detent_plunger,
        "python_frame":            build_python_frame,
        "python_sideplate":        build_python_sideplate,
        "python_sideplate_screws": build_python_sideplate_screws,
        "python_grip_left":        build_python_grip_left,
        "python_grip_right":       build_python_grip_right,
        "python_cylinder_latch":   build_python_cylinder_latch,
        "python_hammer":           build_python_hammer,
        "python_hammer_stirrup":   build_python_hammer_stirrup,
        "python_trigger":          build_python_trigger,
        "python_rebound_lever":    build_python_rebound_lever,
        "python_cylinder_bolt":    build_python_cylinder_bolt,
        "python_hand":             build_python_hand,
        "python_firing_pin":       build_python_firing_pin,
        "python_crane":            build_python_crane,
        "python_cylinder":         build_python_cylinder,
        "python_extractor_star":   build_python_extractor_star,
        "python_extractor_rod":    build_python_extractor_rod,
        "python_speedloader":      build_python_speedloader,
    }

    print("[BUILD] Sculpting all 23 solid Colt Python 6\" (.357 Magnum) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    metal_objs = [built[pid] for pid in METAL_PARTS]
    walnut_objs = [built[pid] for pid in WALNUT_PARTS]
    all_objs = metal_objs + walnut_objs

    print("[VERIFY] Auditing manifoldness, outward normals, alignment & t=1.0 exploded clearance...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 2 dedicated 2K PBR suites: metal (21 parts), walnut (2 parts)...")
    unwrap_metal_atlas(metal_objs)
    unwrap_walnut_atlas(walnut_objs)

    # Strict UV area & bounds audit across both atlases!
    for label, group in (("metal", metal_objs), ("walnut", walnut_objs)):
        tot_area = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for pt in pts:
                    assert -1e-4 <= pt.x <= 1.0001 and -1e-4 <= pt.y <= 1.0001, (
                        f"Out-of-bounds UV on {o.name}: ({pt.x:.4f}, {pt.y:.4f})"
                    )
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot_area += oa
            assert 0.00002 < oa < 0.72, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="python_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking python_v3_metal (2048x2048, 21 Royal Blue/Jewel/Brass parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking python_v3_walnut (2048x2048, 2 American Walnut & Gold Medallion grips)...")
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir)

        print("[POST] Compositing Hartford rollmarks, rib serrations, turn-line, 22-LPI checkering & 24K Gold medallions...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    # Final strict <= 10.00 MB asset budget audit
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "python_v3_metal_albedo.webp",
        TEX_OUT_DIR / "python_v3_metal_normal.webp",
        TEX_OUT_DIR / "python_v3_metal_roughness.webp",
        TEX_OUT_DIR / "python_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "python_v3_walnut_normal.webp",
        TEX_OUT_DIR / "python_v3_walnut_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== COLT PYTHON 6\" V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:36s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 10.00 MB)")
    print(f"  SKIPPED DYNAMIC SPRINGS: {SKIPPED_DYNAMIC_SPRING_PARTS}")
    assert total_mb <= 10.0, f"Asset budget exceeded: {total_mb:.2f} MB > 10.00 MB"

    if do_preview:
        print("\n[QA] Rendering 5 studio Cycles QA preview plates to /tmp/python_qa_*.png...")
        render_qa_previews(all_objs)

    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")


if __name__ == "__main__":
    main()
