#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Steyr AUG A1 (StG 77 · 5.56x45mm NATO)
======================================================================================
MIT License — Digital Armory 3D (`PR-04` Wave 3)

Generates:
  - public/models/aug.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-compressed helical spring `aug_recoil_springs` carrying `aSpringParam`)
  - public/textures/aug_v3_stock_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)
  - public/textures/aug_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/aug_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/aug/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_aug_photoreal.py
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
# MODE 2: System Python Post-Process (Steyr Mannlicher Stock Cartouches,
#         Smoked Amber Waffle Mag w/ 15 Gleaming 5.56mm Brass Cartridges,
#         Die-Cast Receiver Rollmarks, Austrian NPv Proofs, Swarovski 1.5x14
#         Optic Markings, Emerald-Sapphire Multi-Coated Lenses & 5-Ch ORM WebPs)
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

    def _draw_steyr_target_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, col: int = 255) -> None:
        """Iconic Steyr-Mannlicher concentric target reticle emblem (inverted Y-post + double rings)."""
        inner = r * 0.54
        w_out = max(2, round(r * 0.13))
        w_in = max(2, round(r * 0.10))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=col, width=w_out)
        draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), outline=col, width=w_in)
        for pts in (
            ((cx, cy - r * 1.24), (cx, cy - inner * 0.80)),
            ((cx - r * 1.24, cy), (cx - inner * 0.80, cy)),
            ((cx + inner * 0.80, cy), (cx + r * 1.24, cy)),
            ((cx - r * 0.52, cy + r * 1.18), (cx, cy + inner * 0.84)),
            ((cx + r * 0.52, cy + r * 1.18), (cx, cy + inner * 0.84)),
        ):
            draw.line(pts, fill=col, width=w_out)

    def _draw_austrian_npv_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Austrian Vienna/Ferlach Bundesbeschussamt Eagle shield + 'NPv' nitro proof stamp."""
        lw = max(2, round(r * 0.12))
        wings = [
            (cx - r * 0.94, cy - r * 0.34),
            (cx - r * 0.36, cy - r * 0.12),
            (cx,            cy - r * 0.58),
            (cx + r * 0.36, cy - r * 0.12),
            (cx + r * 0.94, cy - r * 0.34),
            (cx + r * 0.58, cy + r * 0.24),
            (cx,            cy + r * 0.58),
            (cx - r * 0.58, cy + r * 0.24),
        ]
        draw.polygon(wings, outline=255, width=lw)
        draw.rectangle((cx - r * 0.26, cy - r * 0.14, cx + r * 0.26, cy + r * 0.30), fill=255)
        f_npv = _load_font(FONT_COND, max(12, round(r * 0.82)))
        draw.text((cx + r * 1.12, cy + r * 0.04), "NPv", font=f_npv, fill=255, anchor="lm")

    def _paint_smoked_waffle_mag_flank(
        albedo: np.ndarray,
        rgh: np.ndarray,
        met: np.ndarray,
        ao: np.ndarray,
        height_out: np.ndarray,
        u_grid: np.ndarray,
        v_grid: np.ndarray,
        u0: float, u1: float, v0: float, v1: float,
        is_right: bool,
    ) -> None:
        """Renders museum-grade smoked honey-amber Makrolon polycarbonate flank with 15 gleaming
        5.56x45mm NATO brass/copper cartridges visible behind recessed waffle windows, plus crisp
        un-mirrored molded 10/20/30 witness markings & 'STEYR 5.56x45'."""
        h, w = rgh.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return

        # Local normalized coordinates inside this flank patch:
        # s_norm: 0 at top of mag (ang=-0.01, v=v1), 1 at bottom of mag (ang=0.48, v=v0)
        # fwd_norm: 0 at rear convex spine (-X, brass rim), 1 at front concave spine (+X, copper bullet tip)
        u_sub = (u_grid[y0:y1, x0:x1] - u0) / max(u1 - u0, 1e-6)
        v_sub = (v_grid[y0:y1, x0:x1] - v0) / max(v1 - v0, 1e-6)
        s_norm = np.clip(1.0 - v_sub, 0.0, 1.0)
        fwd_norm = np.clip(u_sub if is_right else (1.0 - u_sub), 0.0, 1.0)

        sh, sw = s_norm.shape
        rng = np.random.default_rng(5561 if is_right else 5562)

        # Smoked Makrolon dark amber interior cavity tone
        amber_cavity = np.array([0.215, 0.145, 0.062], dtype=np.float32)
        amber_wall = np.array([0.345, 0.238, 0.098], dtype=np.float32)
        flank_rgb = np.broadcast_to(amber_cavity, (sh, sw, 3)).copy()

        # Fine internal polycarbonate micro-grain
        micro_g = ndimage.gaussian_filter(rng.normal(0.0, 0.012, (sh, sw)).astype(np.float32), sigma=0.8)
        flank_rgb += micro_g[..., None]

        # 15 staggered 5.56x45mm NATO cartridges spanning s_norm in [0.06, 0.80]
        # (upper magwell section down to follower at ang=0.375 -> s_norm = (0.375 - (-0.01)) / 0.49 = 0.786!)
        # Below s_norm = 0.80 sits the dark olive follower & steel spring coils visible through the bottom window!
        s_start = 0.055
        pitch = 0.0485
        n_rounds = 15
        row = np.floor((s_norm - s_start) / pitch).astype(np.int32)
        safe_row = np.clip(row, 0, n_rounds - 1)
        stagger = rng.uniform(-0.0014, 0.0014, n_rounds).astype(np.float32)
        tilt = rng.uniform(-0.0018, 0.0018, n_rounds).astype(np.float32)
        round_tone = rng.uniform(-0.030, 0.030, n_rounds).astype(np.float32)[safe_row]

        centers = s_start + (safe_row + 0.5) * pitch
        local_s = (s_norm - centers + stagger[safe_row] + tilt[safe_row] * (fwd_norm - 0.5)) / (pitch * 0.42)

        # 5.56x45mm NATO bottleneck silhouette along fwd_norm in [0.11 .. 0.89]:
        #   [0.11..0.145]: brass rim; [0.145..0.175]: extractor groove;
        #   [0.175..0.605]: tapered brass body; [0.605..0.665]: annealed shoulder & neck;
        #   [0.665..0.885]: copper-jacketed M855/SS109 spitzer ogive!
        rad_p = np.ones((sh, sw), dtype=np.float32)
        body_t = np.clip((fwd_norm - 0.175) / (0.605 - 0.175), 0.0, 1.0)
        rad_p[:] = 1.0 - 0.13 * body_t
        groove = _smoothstep(0.142, 0.150, fwd_norm) * (1.0 - _smoothstep(0.168, 0.176, fwd_norm))
        rad_p -= groove * 0.16
        shoulder = _smoothstep(0.605, 0.648, fwd_norm)
        rad_p = np.where(fwd_norm >= 0.605, 0.87 - 0.28 * shoulder, rad_p)
        bul_t = np.clip((fwd_norm - 0.672) / 0.210, 0.0, 1.0)
        bul_r = 0.59 * np.sqrt(np.maximum(1.0 - bul_t, 0.0)) * (1.0 - 0.22 * bul_t)
        rad_p = np.where(fwd_norm >= 0.672, bul_r, rad_p)

        cross = local_s / np.maximum(rad_p, 0.012)
        z_cyl = np.sqrt(np.maximum(1.0 - cross * cross, 0.0))
        cov = (1.0 - _smoothstep(0.94, 1.04, np.abs(cross)))
        ammo_zone = (fwd_norm >= 0.110) & (fwd_norm <= 0.882) & (row >= 0) & (row < n_rounds)
        cov *= ammo_zone.astype(np.float32)

        # Cylindrical metallic shading + bright specular glint stripe along each gleaming cartridge!
        shade = np.clip(0.28 + 0.68 * z_cyl - 0.16 * np.clip(cross, -1.0, 1.0), 0.14, 1.06)
        spec_hi = np.power(np.clip(0.92 * z_cyl - 0.42 * np.clip(cross, -1.0, 1.0), 0.0, 1.0), 22.0) * 0.46
        brass_base = np.array([0.92, 0.72, 0.28], dtype=np.float32)
        cart_rgb = brass_base * (shade + round_tone)[..., None] + spec_hi[..., None] * np.array([1.0, 0.92, 0.64], dtype=np.float32)
        cart_rgb *= (1.0 - groove * 0.56)[..., None]

        # Brass headstamp rim lip highlight
        rim_m = ((fwd_norm >= 0.114) & (fwd_norm <= 0.142) & ammo_zone).astype(np.float32)
        cart_rgb += (rim_m * (0.08 + 0.07 * z_cyl))[..., None] * np.array([1.0, 0.88, 0.52], dtype=np.float32)

        # Authentic NATO military brass annealing iridescence on shoulder/neck (fwd_norm in [0.56..0.67])
        ann_t = np.clip((fwd_norm - 0.565) / 0.105 + round_tone * 0.6, 0.0, 1.0)
        ann_stops = (0.0, 0.30, 0.52, 0.74, 1.0)
        ann_pal = np.array([
            [0.78, 0.58, 0.26],
            [0.54, 0.34, 0.24],
            [0.34, 0.28, 0.44],
            [0.52, 0.40, 0.27],
            [0.80, 0.64, 0.32],
        ], dtype=np.float32)
        ann_rgb = np.stack([np.interp(ann_t, ann_stops, ann_pal[:, c]) for c in range(3)], axis=-1).astype(np.float32)
        ann_m = _smoothstep(0.555, 0.585, fwd_norm) * (1.0 - _smoothstep(0.652, 0.672, fwd_norm)) * 0.78
        cart_rgb = cart_rgb * (1.0 - ann_m[..., None]) + ann_rgb * (shade * 0.96 + spec_hi)[..., None] * ann_m[..., None]

        # Warm copper-jacketed FMJ bullet nose + green M855 penetrator tip hint / crimson neck sealant!
        bul_m = ((fwd_norm >= 0.672) & (fwd_norm <= 0.882)).astype(np.float32)
        copper_rgb = (
            np.array([0.86, 0.44, 0.20], dtype=np.float32) * (shade * 0.98)[..., None]
            + spec_hi[..., None] * np.array([0.96, 0.68, 0.38], dtype=np.float32)
        )
        cart_rgb = cart_rgb * (1.0 - bul_m[..., None]) + copper_rgb * bul_m[..., None]
        seal_m = _smoothstep(0.665, 0.669, fwd_norm) * (1.0 - _smoothstep(0.674, 0.678, fwd_norm))
        cart_rgb = cart_rgb * (1.0 - seal_m[..., None]) + np.array([0.52, 0.05, 0.04], dtype=np.float32) * shade[..., None] * seal_m[..., None]

        # Subtle follower silhouette + spring wire silhouette in bottom window (s_norm in [0.795..0.965])
        flw_m = ((s_norm >= 0.790) & (s_norm <= 0.865) & (fwd_norm >= 0.12) & (fwd_norm <= 0.88)).astype(np.float32)
        flw_rgb = np.array([0.15, 0.17, 0.13], dtype=np.float32)
        # Diagonal zig-zag dark steel spring coils below follower (s_norm in [0.87..0.97])
        sp_zone = (s_norm >= 0.870) & (s_norm <= 0.970) & (fwd_norm >= 0.16) & (fwd_norm <= 0.84)
        sp_wave = np.abs(np.sin((s_norm - 0.870) * 145.0 + fwd_norm * 4.2))
        sp_m = (sp_zone & (sp_wave > 0.78)).astype(np.float32) * 0.68

        # Smoked amber Makrolon optical transmission: vivid gleaming honey-gold transmission through clear windows!
        amber_tint = np.array([1.02, 0.84, 0.50], dtype=np.float32)
        transmitted = np.clip(cart_rgb * amber_tint * 0.86 + amber_cavity * 0.18, 0.0, 1.0)
        flank_rgb = flank_rgb * (1.0 - cov[..., None]) + transmitted * cov[..., None]
        flank_rgb = flank_rgb * (1.0 - flw_m[..., None] * 0.75) + flw_rgb * (flw_m[..., None] * 0.75)
        flank_rgb = flank_rgb * (1.0 - sp_m[..., None] * 0.55) + np.array([0.34, 0.31, 0.24], dtype=np.float32) * (sp_m[..., None] * 0.55)

        # Thicker translucent amber Makrolon outer border frame along front/rear spines & top magwell band
        spine_frame = (
            (fwd_norm < 0.085) | (fwd_norm > 0.915) | (s_norm < 0.045) | (s_norm > 0.968)
        ).astype(np.float32)
        spine_frame = ndimage.gaussian_filter(spine_frame, sigma=1.6)
        flank_rgb = flank_rgb * (1.0 - spine_frame[..., None] * 0.85) + amber_wall * (spine_frame[..., None] * 0.85)

        # Subtle molded internal waffle border shadow & glossy smoked-polycarbonate specular sheen!
        # Match 3D waffle rib stations: horizontal ribs at ang = 0.235 + r*0.042 (r=0..5 -> s_norm = (ang+0.01)/0.49)
        # Vertical ribs at rFrac = -0.62, 0.0, +0.62 -> fwd_norm = 0.50 - rFrac * 0.38 = 0.736, 0.500, 0.264
        rib_shadow = np.zeros((sh, sw), dtype=np.float32)
        for rr in range(6):
            ang_r = 0.235 + rr * 0.042
            sr = (ang_r + 0.01) / 0.49
            rib_shadow = np.maximum(rib_shadow, np.exp(-np.square((s_norm - sr) / 0.015)))
        for rf in (-0.62, 0.0, 0.62):
            fr = 0.50 - rf * (0.95 / 2.50)
            in_waffle_y = _smoothstep(0.45, 0.49, s_norm) * (1.0 - _smoothstep(0.93, 0.97, s_norm))
            rib_shadow = np.maximum(rib_shadow, np.exp(-np.square((fwd_norm - fr) / 0.042)) * in_waffle_y)
        flank_rgb *= (1.0 - 0.16 * rib_shadow)[..., None]

        # Crisp un-mirrored 1:1 world-proportional molded witness numbers (10, 20, 30) & "STEYR 5.56x45"
        # Magazine curved flank is 2.50 cm wide x 8.82 cm arc length -> exact 1:1 canvas = 500 x 1764 px (@200 px/cm)!
        stamp_w, stamp_h = 500, 1764
        st_im = Image.new("L", (stamp_w, stamp_h), 0)
        dst = ImageDraw.Draw(st_im)
        f_hd = _load_font(FONT_DIN, 44)
        f_num = _load_font(FONT_COND, 56)
        # Upper smooth magwell area (s_norm in [0.10..0.34]): crisp Steyr caliber stamp
        _draw_steyr_target_emblem(dst, 78, 290, r=28, col=255)
        dst.text((122, 290), "STEYR  5.56×45", font=f_hd, fill=255, anchor="lm")
        dst.text((stamp_w // 2, 365), "MADE IN AUSTRIA · 30 RD", font=_load_font(FONT_COND, 34), fill=235, anchor="mm")
        # Round count witness marks cleanly centered inside front waffle cells (s_norm=0.36, 0.543, 0.800 — zero rib overlap!)
        nx_pos = int(stamp_w * (0.865 if is_right else 0.135))
        for lbl, sn in (("10", 0.360), ("20", 0.543), ("30", 0.800)):
            ny = int(round(sn * stamp_h))
            dst.text((nx_pos, ny), lbl, font=f_num, fill=255, anchor="mm")
        st_arr = np.asarray(st_im.resize((sw, sh), resample=Image.Resampling.LANCZOS), dtype=np.float32) / 255.0

        # Composite raised translucent amber molded typography
        flank_rgb += st_arr[..., None] * np.array([0.14, 0.102, 0.045], dtype=np.float32)
        height_out[y0:y1, x0:x1] = np.maximum(height_out[y0:y1, x0:x1], _bevel_mask(st_arr, width_px=1.3) * 0.48)

        # Write final translucent Makrolon PBR values into atlas slice
        albedo[y0:y1, x0:x1] = np.clip(flank_rgb, 0.0, 1.0)
        # Glossy smoked polycarbonate windows (R=0.14) vs slightly frosted spine/markings (R=0.32), strictly dielectric!
        rgh_sub = 0.14 + 0.18 * spine_frame + 0.16 * st_arr + micro_g * 0.45
        rgh[y0:y1, x0:x1] = np.clip(rgh_sub, 0.12, 0.42)
        met[y0:y1, x0:x1] = 0.03
        # Keep AO softly lifted inside translucent amber windows so gleaming brass rounds pop in both assembled & exploded views!
        ao_sub = ao[y0:y1, x0:x1]
        ao_lifted = np.clip(0.62 + 0.38 * ao_sub, 0.56, 1.0) * (1.0 - 0.14 * rib_shadow)
        ao[y0:y1, x0:x1] = np.clip(ao_lifted, 0.48, 1.0)

    def process_stock_atlas():
        """Austrian Olive-Green PA66 Bullpup Stock (Molded Steyr Cartouches), Smoked Amber Waffle
        Magazine (15 Gleaming 5.56mm Brass Cartridges), Folding Foregrip, Rubber Buttpad,
        Progressive Trigger, Cross-Bolt Safety & Autolube Tan Nylon Hammer Pack."""
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
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.35 + 0.65 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.33, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w))
        v_grid = np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w))

        # --- 1) BULLPUP BUTTSTOCK HERO FLANKS: Raised Molded Steyr Mannlicher Cartouches ---
        # Left  Buttstock Flank (-Z): u in [0.015, 0.490], v in [0.765, 0.985]
        # Right Buttstock Flank (+Z): u in [0.510, 0.985], v in [0.765, 0.985]
        # World X in [-17.25, -2.55] (span 14.70 cm), World Y in [-3.55, +1.95] (span 5.50 cm)
        PPCM = 180.0
        BW, BH = int(round(14.70 * PPCM)), int(round(5.50 * PPCM))  # 2646 x 990 px

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - (-17.25)) / 14.70) * BW))

        def xw_to_cx_right(xw: float) -> int:
            return int(round(((xw - (-17.25)) / 14.70) * BW))

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - (-3.55)) / 5.50) * BH))

        molded_stock = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)

        # Left Buttstock Cartouche cleanly behind left ejection port cover (X in [-16.35 .. -10.50], Y in [-0.95 .. +1.25])
        # Note: on Left flank, +X is LEFT -> cx_left(-10.50) is left, cx_left(-16.35) is right!
        l_im = Image.new("L", (BW, BH), 0)
        dl = ImageDraw.Draw(l_im)
        lx0, lx1 = xw_to_cx_left(-10.55), xw_to_cx_left(-16.35)
        ly0, ly1 = yw_to_cy(1.18), yw_to_cy(-0.92)
        dl.rounded_rectangle((lx0, ly0, lx1, ly1), radius=26, outline=200, width=8)
        cx_llogo = lx0 + 130
        cy_llogo = (ly0 + ly1) // 2
        _draw_steyr_target_emblem(dl, cx_llogo, cy_llogo, r=74, col=255)
        f_shd = _load_font(FONT_DIN, 78)
        f_ssb = _load_font(FONT_COND, 62)
        dl.text((lx0 + 236, cy_llogo - 48), "STEYR MANNLICHER", font=f_shd, fill=255, anchor="lm")
        dl.text((lx0 + 236, cy_llogo + 46), "MADE IN AUSTRIA  ·  StG 77", font=f_ssb, fill=250, anchor="lm")
        _paste_uv_band(molded_stock, l_im, 0.015, 0.490, 0.765, 0.985)

        # Right Buttstock Cartouche cleanly behind right ejection port (X in [-16.35 .. -10.55], Y in [-0.92 .. +1.18])
        r_im = Image.new("L", (BW, BH), 0)
        dr = ImageDraw.Draw(r_im)
        rx0, rx1 = xw_to_cx_right(-16.35), xw_to_cx_right(-10.55)
        ry0, ry1 = yw_to_cy(1.18), yw_to_cy(-0.92)
        dr.rounded_rectangle((rx0, ry0, rx1, ry1), radius=26, outline=200, width=8)
        cx_rlogo = rx0 + 130
        cy_rlogo = (ry0 + ry1) // 2
        _draw_steyr_target_emblem(dr, cx_rlogo, cy_rlogo, r=74, col=255)
        dr.text((rx0 + 236, cy_rlogo - 48), "STEYR AUG A1  5.56×45", font=f_shd, fill=255, anchor="lm")
        dr.text((rx0 + 236, cy_rlogo + 46), "STEYR-DAIMLER-PUCH AG  ·  907418", font=f_ssb, fill=250, anchor="lm")
        _paste_uv_band(molded_stock, r_im, 0.510, 0.985, 0.765, 0.985)

        # Authentic subtle golden-brass shell-kiss flecks right aft of right ejection port lip (X in [-10.35..-9.85], Y in [0.75..1.45])
        k_im = Image.new("L", (BW, BH), 0)
        dk = ImageDraw.Draw(k_im)
        rng_k = np.random.default_rng(7701)
        for _ in range(20):
            kx = float(xw_to_cx_right(float(rng_k.uniform(-10.32, -9.88))))
            ky = float(yw_to_cy(float(rng_k.uniform(0.76, 1.44))))
            krx, kry = float(rng_k.uniform(4, 11)), float(rng_k.uniform(2, 6))
            dk.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(85, 190)))
        _paste_uv_band(brass_kiss, k_im, 0.510, 0.985, 0.765, 0.985)

        # Composite raised molded polymer relief on OD-green stock
        molded_bev = _bevel_mask(molded_stock, width_px=1.6)
        decal_height = 0.72 * molded_bev
        _mix(albedo, (0.332, 0.388, 0.272), molded_stock * 0.82)
        _mix(rgh, 0.45, molded_stock * 0.62)
        halo = np.clip(ndimage.maximum_filter(molded_stock, size=3) - molded_stock, 0.0, 1.0)
        ao *= 1.0 - 0.18 * halo

        brass_kiss = _smoothstep(0.14, 0.58, ndimage.gaussian_filter(brass_kiss, sigma=0.85))
        _mix(albedo, (0.72, 0.55, 0.22), brass_kiss * 0.38)
        _mix(rgh, 0.30, brass_kiss * 0.45)
        _mix(met, 0.72, brass_kiss * 0.50)

        # --- 2) SMOKED AMBER WAFFLE MAGAZINE HERO FLANKS (15 Gleaming 5.56mm Brass Cartridges!) ---
        # Right Mag Flank (+Z): u in [0.015, 0.235], v in [0.350, 0.745]
        # Left  Mag Flank (-Z): u in [0.250, 0.470], v in [0.350, 0.745]
        _paint_smoked_waffle_mag_flank(
            albedo, rgh, met, ao, decal_height, u_grid, v_grid,
            0.015, 0.235, 0.350, 0.745, is_right=True,
        )
        _paint_smoked_waffle_mag_flank(
            albedo, rgh, met, ao, decal_height, u_grid, v_grid,
            0.250, 0.470, 0.350, 0.745, is_right=False,
        )

        # Blend decal relief normals into Cycles baked normals via RNM
        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_stock_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_stock_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_stock_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved aug_v3_stock_{albedo,normal,roughness}.webp (2048x2048)")

    def process_receiver_atlas():
        """Die-Cast Baked-Enamel Aluminum Receiver (Crisp White Steyr AUG A1 Rollmarks & Austrian NPv Proofs),
        Integral Swarovski 1.5x14 Optic (White Tube Markings + Firewalled Emerald-Sapphire Coated Lenses),
        Folding Charging Handle, Barrel Cross-Lock & Rear Takedown Pin."""
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
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.33 + 0.67 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w))
        v_grid = np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w))

        white_ink = np.zeros((h, w), dtype=np.float32)

        # --- 1) DIE-CAST RECEIVER HERO FLANKS (X in [-2.50, +5.85], Y in [+0.42, +2.06]) ---
        # Left  Flank (-Z): u in [0.015, 0.680], v in [0.815, 0.985] (1 - xn: +X front on left)
        # Right Flank (+Z): u in [0.015, 0.680], v in [0.635, 0.805] (xn:     -X rear on left)
        PPCM_R = 260.0
        RW, RH = int(round(8.35 * PPCM_R)), int(round(1.64 * PPCM_R))  # 2171 x 426 px

        def rx_left(xw: float) -> int:
            return int(round((1.0 - (xw - (-2.50)) / 8.35) * RW))

        def rx_right(xw: float) -> int:
            return int(round(((xw - (-2.50)) / 8.35) * RW))

        def ry_cy(yw: float) -> int:
            return int(round((1.0 - (yw - 0.42) / 1.64) * RH))

        # Left Receiver Wall: clean unobstructed band Y in [0.74..1.38] (below charging channel Y=1.46..1.78, above fuller Y<0.68!)
        rec_l = Image.new("L", (RW, RH), 0)
        drl = ImageDraw.Draw(rec_l)
        lx_logo = rx_left(4.65)
        ly_mid = ry_cy(1.06)
        _draw_steyr_target_emblem(drl, lx_logo, ly_mid, r=44, col=255)
        drl.text((lx_logo + 72, ry_cy(1.20)), "STEYR AUG A1   CAL. 5.56×45mm", font=_load_font(FONT_DIN, 62), fill=255, anchor="lm")
        drl.text((lx_logo + 72, ry_cy(0.92)), "MADE IN AUSTRIA   ·   SER. NO. 907418", font=_load_font(FONT_COND, 48), fill=248, anchor="lm")
        _draw_austrian_npv_proof(drl, rx_left(-1.82), ly_mid, r=42)
        _paste_uv_band(white_ink, rec_l, 0.015, 0.680, 0.815, 0.985)

        # Right Receiver Wall: clean unobstructed band X in [-2.25..+2.95], Y in [0.74..1.36] (clear of barrel-lock boss X>3.06 & rod boss Y>1.36!)
        rec_r = Image.new("L", (RW, RH), 0)
        drr = ImageDraw.Draw(rec_r)
        rx0 = rx_right(-2.15)
        drr.text((rx0, ry_cy(1.20)), "STEYR-DAIMLER-PUCH AG", font=_load_font(FONT_DIN, 58), fill=255, anchor="lm")
        drr.text((rx0, ry_cy(0.92)), "MOD. AUG A1 (StG 77)  ·  CIP N", font=_load_font(FONT_COND, 48), fill=248, anchor="lm")
        _draw_austrian_npv_proof(drr, rx_right(2.05), ry_cy(1.06), r=42)
        _paste_uv_band(white_ink, rec_r, 0.015, 0.680, 0.635, 0.805)

        # --- 2) SWAROVSKI 1.5x14 INTEGRAL OPTIC TUBE FLANKS (X in [-4.45, +5.85], Y in [3.26, 4.50]) ---
        # Left  Scope Flank (-Z): u in [0.015, 0.680], v in [0.505, 0.620]
        # Right Scope Flank (+Z): u in [0.015, 0.680], v in [0.380, 0.495]
        SW, SH = 2472, 296

        def sx_left(xw: float) -> int:
            return int(round((1.0 - (xw - (-4.45)) / 10.30) * SW))

        def sx_right(xw: float) -> int:
            return int(round(((xw - (-4.45)) / 10.30) * SW))

        sc_l = Image.new("L", (SW, SH), 0)
        dsl = ImageDraw.Draw(sc_l)
        # Main straight scope tube spans X in [-2.65..+4.25]; put crisp white Swarovski typography centered on straight tube!
        dsl.text((sx_left(3.95), SH // 2), "SWAROVSKI OPTIK TIROL   1.5×14", font=_load_font(FONT_DIN, 74), fill=255, anchor="lm")
        _paste_uv_band(white_ink, sc_l, 0.015, 0.680, 0.505, 0.620)

        sc_r = Image.new("L", (SW, SH), 0)
        dsr = ImageDraw.Draw(sc_r)
        # Windage turret sits at X in [1.10..1.80] -> place crisp markings cleanly aft [-2.55..+0.85] & fore [+2.15..+4.25]!
        dsr.text((sx_right(-0.85), SH // 2), "HABICHT 1.5×14", font=_load_font(FONT_DIN, 70), fill=255, anchor="mm")
        dsr.text((sx_right(3.25), SH // 2), "AUSTRIA", font=_load_font(FONT_COND, 68), fill=252, anchor="mm")
        _paste_uv_band(white_ink, sc_r, 0.015, 0.680, 0.380, 0.495)

        # --- 3) FIREWALLED MULTI-COATED EMERALD-SAPPHIRE SWAROVSKI OPTICAL LENSES ---
        # Front Objective Lens (+X): u in [0.710, 0.890], v in [0.805, 0.985] (center 0.800, 0.895; r=0.086)
        # Rear  Ocular Lens    (-X): u in [0.900, 0.985], v in [0.900, 0.985] (center 0.9425, 0.9425; r=0.040)
        # Back Hemispheres:          u in [0.900, 0.985], v in [0.805, 0.890]
        lens_box = (u_grid >= 0.704) & (u_grid <= 0.992) & (v_grid >= 0.799) & (v_grid <= 0.992)
        albedo[lens_box] = (0.014, 0.068, 0.095)
        rgh[lens_box] = 0.04
        met[lens_box] = 0.10
        ao[lens_box] = 1.0
        nrm[lens_box] = (0.5, 0.5, 1.0)

        for cx_l, cy_l, r_l, u0_l, u1_l, v0_l, v1_l, is_ocular in (
            (0.8000, 0.8950, 0.086, 0.705, 0.894, 0.800, 0.990, False),
            (0.9425, 0.9425, 0.040, 0.896, 0.990, 0.896, 0.990, True),
        ):
            sub_m = (u_grid >= u0_l) & (u_grid <= u1_l) & (v_grid >= v0_l) & (v_grid <= v1_l)
            lu = (u_grid - cx_l) / r_l
            lv = (v_grid - cy_l) / r_l
            rad = np.hypot(lu, lv)
            # Austrian Swarovski broadband emerald-green & deep sapphire-blue multi-coating thin-film interference!
            coat_wave = 0.5 + 0.5 * np.cos(6.4 * rad * rad + 0.50 * lv - 0.32 * lu)
            sapphire_rim = _smoothstep(0.56, 0.92, rad) * (1.0 - _smoothstep(0.92, 1.15, rad))
            lens_rgb = (
                np.array((0.018, 0.135, 0.215), dtype=np.float32)
                + coat_wave[..., None] * np.array((0.022, 0.340, 0.175), dtype=np.float32)
                + sapphire_rim[..., None] * np.array((0.065, 0.145, 0.340), dtype=np.float32)
            )
            lens_rgb *= 1.0 - 0.48 * _smoothstep(0.76, 1.15, rad)[..., None]
            # Crisp curved studio specular coating glints (emerald top-left + sapphire lower-right)
            arc1 = (1.0 - _smoothstep(0.018, 0.056, np.abs(rad - 0.70))) * _smoothstep(0.10, 0.46, lv) * (1.0 - _smoothstep(-0.20, 0.24, lu))
            arc2 = (1.0 - _smoothstep(0.016, 0.050, np.abs(rad - 0.44))) * _smoothstep(-0.56, -0.18, lv) * _smoothstep(0.06, 0.44, lu)
            lens_rgb += arc1[..., None] * np.array((0.36, 0.84, 0.68), dtype=np.float32)
            lens_rgb += arc2[..., None] * np.array((0.20, 0.48, 0.74), dtype=np.float32)
            if is_ocular:
                # Whisper-subtle dark-etched iconic Swarovski "Donut of Death" 1.8m-at-300m circle reticle!
                donut = (1.0 - _smoothstep(0.024, 0.052, np.abs(rad - 0.18)))
                cross_h = (1.0 - _smoothstep(0.014, 0.030, np.abs(lv))) * _smoothstep(0.22, 0.28, np.abs(lu)) * (1.0 - _smoothstep(0.72, 0.80, np.abs(lu)))
                cross_v = (1.0 - _smoothstep(0.014, 0.030, np.abs(lu))) * _smoothstep(0.22, 0.28, np.abs(lv)) * (1.0 - _smoothstep(0.72, 0.80, np.abs(lv)))
                ret_m = np.clip(np.maximum(donut, np.maximum(cross_h, cross_v)), 0.0, 1.0)
                lens_rgb *= (1.0 - 0.65 * ret_m)[..., None]
            albedo[sub_m] = np.clip(lens_rgb[sub_m], 0.0, 1.0)

        # Subtle baked-enamel receiver handling micro-scratches on receiver flanks
        rec_walls = (
            (u_grid >= 0.015) & (u_grid <= 0.680)
            & (((v_grid >= 0.815) & (v_grid <= 0.985)) | ((v_grid >= 0.635) & (v_grid <= 0.805)))
        ).astype(np.float32)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        rng_s = np.random.default_rng(7702)
        for _ in range(85):
            sx = float(rng_s.uniform(0.02, 0.67) * w)
            sy = float(rng_s.uniform(0.02, 0.36) * h)
            slen = float(rng_s.uniform(14, 60))
            ang = math.radians(float(rng_s.uniform(-14, 14)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * slen, sy + math.sin(ang) * slen)],
                     fill=int(rng_s.integers(75, 180)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * rec_walls
        _mix(albedo, (0.58, 0.62, 0.66), sc * 0.24)
        rgh -= sc * 0.05
        met = np.clip(met + sc * 0.10, 0.00, 0.98)

        # Composite razor-crisp white enamel Steyr & Swarovski markings
        ink_bev = _bevel_mask(white_ink, width_px=1.2)
        decal_height = -0.34 * ink_bev - 0.04 * sc
        _mix(albedo, (0.91, 0.92, 0.91), white_ink * 0.96)
        _mix(rgh, 0.36, white_ink * 0.90)
        _mix(met, 0.04, white_ink * 0.95)
        ao *= 1.0 - 0.08 * white_ink

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)
        # Keep Swarovski optical glass optically flat!
        nrm_final[lens_box] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.04, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved aug_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    def process_metal_atlas():
        """20" Steyr Cold-Hammer-Forged Quick-Change Barrel, 3-Slot Tulip Flash Hider w/ Heat/Soot,
        Offset Gas Block, 3-Pos Winged Regulator, Mirror-Chrome Short-Stroke Piston, Twin Parallel
        Chrome Guide-Rod Bolt Carrier, 7-Lug Chrome Rotating Bolt, Firing Pin, Transfer Bars & Mag Spring."""
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.11, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "aug_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved aug_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_stock_atlas()
    process_receiver_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "aug.glb"
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


# Exact 24 solid Steyr AUG A1 parts across 3 dedicated 2048x2048 hero suites
# (skipping ONLY dynamic GPU-compressed helical spring `aug_recoil_springs`!)
STOCK_PARTS = [
    "aug_stock",
    "aug_buttpad",
    "aug_foregrip",
    "aug_trigger",
    "aug_safety",
    "aug_mag_body",
    "aug_mag_follower",
    "aug_mag_floorplate",
    "aug_hammer_pack",
    "aug_hammer",
]

RECEIVER_PARTS = [
    "aug_receiver_optic",
    "aug_charging_handle",
    "aug_barrel_lock",
    "aug_takedown_pin",
]

METAL_PARTS = [
    "aug_barrel",
    "aug_flash_hider",
    "aug_gas_block",
    "aug_gas_regulator",
    "aug_gas_piston",
    "aug_bolt_carrier",
    "aug_bolt",
    "aug_firing_pin",
    "aug_transfer_bars",
    "aug_mag_spring",
]

# Exterior parts receiving assembled inter-part contact AO (moving/internal parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "aug_stock",
    "aug_buttpad",
    "aug_foregrip",
    "aug_mag_body",
    "aug_mag_floorplate",
    "aug_receiver_optic",
    "aug_charging_handle",
    "aug_barrel",
    "aug_flash_hider",
    "aug_gas_block",
    "aug_gas_regulator",
}

ASSEMBLED_POS = {
    "aug_barrel":          (  0.000,  1.050,  0.000),
    "aug_flash_hider":     ( 19.400,  1.050,  0.000),
    "aug_gas_block":       (  8.850,  1.050,  0.000),
    "aug_gas_regulator":   ( 10.050,  1.520,  0.520),
    "aug_gas_piston":      (  7.850,  1.520,  0.520),
    "aug_bolt_carrier":    ( -9.200,  1.180,  0.000),
    "aug_bolt":            ( -8.050,  1.050,  0.000),
    "aug_firing_pin":      ( -9.450,  1.050,  0.000),
    "aug_stock":           (  0.000,  0.000,  0.000),
    "aug_buttpad":         (-17.900, -1.120,  0.000),
    "aug_takedown_pin":    (-15.850, -2.450,  0.000),
    "aug_receiver_optic":  (  0.000,  0.000,  0.000),
    "aug_barrel_lock":     (  3.650,  0.520,  0.000),
    "aug_charging_handle": (  3.450,  1.620, -0.920),
    "aug_foregrip":        (  8.850, -0.180,  0.000),
    "aug_trigger":         (  0.550, -2.350,  0.000),
    "aug_safety":          ( -0.650, -1.420,  0.000),
    "aug_transfer_bars":   ( -6.600, -1.250,  0.000),
    "aug_hammer_pack":     (-14.650, -0.650,  0.000),
    "aug_hammer":          (-12.850, -0.050,  0.000),
    "aug_mag_body":        ( -9.950,  0.450,  0.000),
    "aug_mag_follower":    ( -8.700, -6.140,  0.000),
    "aug_mag_spring":      ( -9.950,  0.450,  0.000),
    "aug_mag_floorplate":  ( -7.840, -8.000,  0.000),
}

ASSEMBLED_ROT_THREE = {
    "aug_mag_follower": (0.0, 0.0, 0.375),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) from src/weapons/aug/meshes/*.ts
CSG_REF_BBOX = {
    "aug_barrel":          (( -8.2000, -0.5850, -0.5850), (18.8500,  0.5850,  0.5850)),
    "aug_flash_hider":     (( -1.1500, -0.5500, -0.5500), ( 1.1000,  0.5500,  0.5500)),
    "aug_gas_block":       (( -2.7000, -1.6200, -0.6200), ( 1.0500,  0.9100,  0.9600)),
    "aug_gas_regulator":   (( -0.7300, -0.7015, -0.4200), ( 0.5820,  0.7015,  0.4200)),
    "aug_gas_piston":      (( -1.7000, -0.2900, -0.2920), ( 1.6500,  0.2900,  0.2920)),
    "aug_bolt_carrier":    (( -1.8868, -0.6900, -0.7900), (15.3500,  0.6100,  0.7900)),
    "aug_bolt":            (( -2.1750, -0.5100, -0.5100), ( 0.8950,  0.7400,  0.5100)),
    "aug_firing_pin":      (( -2.0500, -0.1700, -0.1700), ( 2.0500,  0.1700,  0.1700)),
    "aug_stock":           ((-17.3500, -7.3343, -0.9900), ( 3.9045,  2.1385,  1.0206)),
    "aug_buttpad":         (( -0.6342, -3.2117, -0.8700), ( 1.1200,  3.2310,  0.8700)),
    "aug_takedown_pin":    (( -1.1532, -0.7965, -1.3823), ( 0.4533,  0.2800,  1.0300)),
    "aug_receiver_optic":  (( -8.1950, -0.0400, -1.0565), ( 6.0450,  4.7900,  0.8700)),
    "aug_barrel_lock":     (( -0.4500, -0.2900, -1.0700), ( 0.4500,  0.2800,  1.1419)),
    "aug_charging_handle": (( -1.8500, -0.2400, -1.0631), ( 1.1250,  0.6174,  0.5300)),
    "aug_foregrip":        (( -1.0742, -5.2134, -0.5400), ( 0.4420,  0.4100,  0.5400)),
    "aug_trigger":         (( -0.7700, -1.1724, -0.4200), ( 0.6700,  0.8900,  0.4200)),
    "aug_safety":          (( -0.2300, -0.2200, -1.1000), ( 0.2300,  0.4800,  1.0200)),
    "aug_transfer_bars":   (( -7.5400, -0.6400, -0.6400), ( 7.2400,  0.4000,  0.6400)),
    "aug_hammer_pack":     (( -2.1750, -1.7600, -0.6100), ( 2.1750,  1.0500,  0.6100)),
    "aug_hammer":          (( -1.5689, -0.4592, -0.5700), ( 0.3418,  0.3591,  0.5700)),
    "aug_mag_body":        (( -1.5100, -8.9431, -0.6200), ( 3.1965,  0.3600,  0.6200)),
    "aug_mag_follower":    (( -1.0100, -0.5600, -0.4000), ( 1.0100,  0.3733,  0.4000)),
    "aug_mag_spring":      ((  0.6132, -8.3855, -0.3150), ( 2.5936, -6.4964,  0.3150)),
    "aug_mag_floorplate":  (( -1.3026, -0.7880, -0.6700), ( 1.3026,  0.8174,  0.6700)),
}

# Magazine arc constants (exact match with src/weapons/aug/meshes/augGeometries.ts)
AUG_MAG_ARC_CX = 18.0
AUG_MAG_ARC_CY = 0.0
AUG_MAG_R_INNER = 16.75
AUG_MAG_R_OUTER = 19.25
AUG_MAG_ANG_START = -0.01
AUG_MAG_ANG_END = 0.48


# =============================================================================
# Scene & Physically Calibrated Austrian Alpine Green / Enamel / CHF Material Library
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
    grain_scale: float = 36.0,
    grain_bump: float = 0.032,
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
    rgh_val_node.inputs["To Min"].default_value = max(0.04, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.555
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.635
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


def _build_chf_swirl_barrel_mat() -> bpy.types.Material:
    """Steyr Mannlicher signature cold-hammer-forged (CHF) blackened barrel steel with subtle
    helical rotary-swaging swirl micro-sheen & oil-wiped metallic depth!"""
    mat = bpy.data.materials.new("M_CHFBarrelSteel")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")

    # Helical cold-hammer-forging swirl wave along barrel X axis
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 18.0
    wave.inputs["Distortion"].default_value = 1.15
    wave.inputs["Detail"].default_value = 3.0
    nt.links.new(texcoord.outputs["Object"], wave.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = 46.0
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.58
    nt.links.new(texcoord.outputs["Object"], n_micro.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.138, 0.147, 0.162)
    mix_c.inputs[7].default_value = srgb_to_lin(0.172, 0.184, 0.204)
    nt.links.new(wave.outputs["Fac"], mix_c.inputs[0])

    mr_r = nt.nodes.new("ShaderNodeMapRange")
    mr_r.inputs["From Min"].default_value = 0.0
    mr_r.inputs["From Max"].default_value = 1.0
    mr_r.inputs["To Min"].default_value = 0.21
    mr_r.inputs["To Max"].default_value = 0.29
    nt.links.new(wave.outputs["Fac"], mr_r.inputs["Value"])

    bsdf.inputs["Metallic"].default_value = 0.90
    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mr_r.outputs["Result"], bsdf.inputs["Roughness"])

    mix_h = nt.nodes.new("ShaderNodeMix")
    mix_h.data_type = "FLOAT"
    mix_h.inputs["Factor"].default_value = 0.42
    nt.links.new(n_micro.outputs["Fac"], mix_h.inputs[2])
    nt.links.new(wave.outputs["Fac"], mix_h.inputs[3])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.030
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(mix_h.outputs[0], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_tulip_heat_soot_mat() -> bpy.types.Material:
    """Steyr AUG A1 Closed-Prong Tulip Flash Suppressor: satin dark-nitride rear check-nut &
    22mm grenade collar transitioning into subtle golden-violet muzzle heat temper along the
    3 tulip prongs and matte black gunpowder carbon soot on the crown & expansion ports!"""
    mat = bpy.data.materials.new("M_TulipHeatSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X in [-0.45 .. +1.10] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.35
    mr_x.inputs["From Max"].default_value = 1.10
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 6.2
    n_soot.inputs["Detail"].default_value = 6.0
    n_soot.inputs["Roughness"].default_value = 0.66
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.22
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.165, 0.174, 0.188)
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.180, 0.188, 0.204)
    for pos, rgb in (
        (0.62, (0.35, 0.24, 0.145)),   # subtle 5.56 muzzle bronze heat temper
        (0.76, (0.16, 0.195, 0.275)),  # violet-blue muzzle temper
        (0.92, (0.072, 0.070, 0.072)), # matte black gunpowder carbon soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.50
    rr.elements[0].color = (0.28, 0.28, 0.28, 1.0)
    rr.elements[1].position = 0.94
    rr.elements[1].color = (0.84, 0.84, 0.84, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.72
    rm.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.elements[1].position = 0.96
    rm.elements[1].color = (0.18, 0.18, 0.18, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.042
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: STOCK, FOREGRIP, WAFFLE MAG, CONTROLS & HAMMER PACK (aug_v3_stock) ---
        # Iconic Austrian Bundesheer Olive-Drab / Alpine Military Green fiberglass polyamide (PA66)
        "S_ODGreenStock": _build_pbr_mat(
            "S_ODGreenStock",
            base_srgb=(0.252, 0.300, 0.210),
            roughness=0.58,
            metallic=0.00,
            bevel_r=0.042,
            edge_wear=0.18,
            edge_srgb=(0.335, 0.388, 0.282),
            grain_scale=68.0,
            grain_bump=0.095,
            voronoi_grain=0.72,
            voronoi_scale=104.0,
            rough_var=0.055,
        ),
        "S_ODGreenGrip": _build_pbr_mat(
            "S_ODGreenGrip",
            base_srgb=(0.220, 0.264, 0.182),
            roughness=0.67,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.14,
            edge_srgb=(0.305, 0.352, 0.255),
            grain_scale=78.0,
            grain_bump=0.165,
            voronoi_grain=0.84,
            voronoi_scale=132.0,
            rough_var=0.040,
        ),
        "S_ODGreenDark": _build_pbr_mat(
            "S_ODGreenDark",
            base_srgb=(0.185, 0.222, 0.155),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.024,
            grain_scale=64.0,
            grain_bump=0.088,
            voronoi_grain=0.68,
            voronoi_scale=96.0,
            rough_var=0.042,
        ),
        "S_RubberBlack": _build_pbr_mat(
            "S_RubberBlack",
            base_srgb=(0.102, 0.108, 0.116),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.12,
            edge_srgb=(0.175, 0.182, 0.194),
            grain_scale=62.0,
            grain_bump=0.092,
            voronoi_grain=0.58,
            voronoi_scale=88.0,
            rough_var=0.038,
        ),
        "S_BlackPolymer": _build_pbr_mat(
            "S_BlackPolymer",
            base_srgb=(0.132, 0.140, 0.152),
            roughness=0.55,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.22,
            edge_srgb=(0.245, 0.256, 0.272),
            grain_scale=60.0,
            grain_bump=0.075,
            voronoi_grain=0.64,
            voronoi_scale=92.0,
            rough_var=0.044,
        ),
        "S_SafetyCrimson": _build_pbr_mat(
            "S_SafetyCrimson",
            base_srgb=(0.86, 0.10, 0.09),
            roughness=0.28,
            metallic=0.02,
            bevel_r=0.014,
            grain_scale=30.0,
            grain_bump=0.014,
            rough_var=0.020,
        ),
        "S_SafetyWhite": _build_pbr_mat(
            "S_SafetyWhite",
            base_srgb=(0.93, 0.94, 0.95),
            roughness=0.32,
            metallic=0.00,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.010,
            rough_var=0.018,
        ),
        # Smoked honey-amber Makrolon polycarbonate waffle magazine ribs & outer frame
        "S_MagAmberBody": _build_pbr_mat(
            "S_MagAmberBody",
            base_srgb=(0.355, 0.242, 0.098),
            roughness=0.24,
            metallic=0.03,
            bevel_r=0.026,
            edge_wear=0.18,
            edge_srgb=(0.520, 0.375, 0.165),
            grain_scale=44.0,
            grain_bump=0.024,
            rough_var=0.032,
        ),
        "S_MagAmberRib": _build_pbr_mat(
            "S_MagAmberRib",
            base_srgb=(0.455, 0.312, 0.128),
            roughness=0.34,
            metallic=0.02,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.610, 0.445, 0.205),
            grain_scale=52.0,
            grain_bump=0.042,
            voronoi_grain=0.52,
            voronoi_scale=88.0,
            rough_var=0.034,
        ),
        "S_MagFeedLips": _build_pbr_mat(
            "S_MagFeedLips",
            base_srgb=(0.195, 0.228, 0.168),
            roughness=0.50,
            metallic=0.02,
            bevel_r=0.018,
            grain_scale=56.0,
            grain_bump=0.045,
            rough_var=0.032,
        ),
        # Steyr's famous tan/amber self-lubricating Autolube nylon hammer pack & rotary hammer!
        "S_HammerPackTan": _build_pbr_mat(
            "S_HammerPackTan",
            base_srgb=(0.585, 0.492, 0.348),
            roughness=0.45,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.18,
            edge_srgb=(0.710, 0.620, 0.468),
            grain_scale=58.0,
            grain_bump=0.052,
            voronoi_grain=0.56,
            voronoi_scale=90.0,
            rough_var=0.040,
        ),
        "S_HammerTan": _build_pbr_mat(
            "S_HammerTan",
            base_srgb=(0.515, 0.422, 0.285),
            roughness=0.41,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.20,
            edge_srgb=(0.645, 0.545, 0.395),
            grain_scale=54.0,
            grain_bump=0.042,
            rough_var=0.035,
        ),
        "S_DarkSteelPin": _build_pbr_mat(
            "S_DarkSteelPin",
            base_srgb=(0.205, 0.215, 0.230),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.016,
            edge_wear=0.40,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=44.0,
            grain_bump=0.026,
            rough_var=0.030,
        ),
        "S_BrightSteelPin": _build_pbr_mat(
            "S_BrightSteelPin",
            base_srgb=(0.77, 0.79, 0.83),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "S_SpringSteel": _build_pbr_mat(
            "S_SpringSteel",
            base_srgb=(0.48, 0.51, 0.56),
            roughness=0.24,
            metallic=0.94,
            bevel_r=0.010,
            grain_scale=28.0,
            grain_bump=0.014,
            rough_var=0.022,
        ),

        # --- SUITE 2: DIE-CAST RECEIVER, 1.5x SWAROVSKI OPTIC & CONTROLS (aug_v3_receiver) ---
        # Satin slate-black baked enamel aluminum receiver (sRGB 0.19-0.24, M=0.78, R=0.28-0.38)
        # Keep edge_wear=0.0 so wide flat boolean receiver walls have zero diagonal vertex-pointiness shading!
        "R_ReceiverEnamel": _build_pbr_mat(
            "R_ReceiverEnamel",
            base_srgb=(0.208, 0.220, 0.236),
            roughness=0.33,
            metallic=0.78,
            bevel_r=0.030,
            edge_wear=0.00,
            edge_srgb=(0.66, 0.69, 0.74),
            grain_scale=74.0,
            grain_bump=0.034,
            voronoi_grain=0.52,
            voronoi_scale=102.0,
            rough_var=0.028,
        ),
        "R_ScopeTube": _build_pbr_mat(
            "R_ScopeTube",
            base_srgb=(0.195, 0.208, 0.224),
            roughness=0.30,
            metallic=0.80,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.65, 0.68, 0.73),
            grain_scale=70.0,
            grain_bump=0.028,
            voronoi_grain=0.44,
            voronoi_scale=96.0,
            rough_var=0.028,
        ),
        "R_CoatedLens": _build_pbr_mat(
            "R_CoatedLens",
            base_srgb=(0.025, 0.24, 0.22),
            roughness=0.04,
            metallic=0.10,
            bevel_r=0.004,
            grain_scale=12.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "R_SlotDark": _build_pbr_mat(
            "R_SlotDark",
            base_srgb=(0.088, 0.094, 0.104),
            roughness=0.56,
            metallic=0.68,
            bevel_r=0.014,
            grain_scale=38.0,
            grain_bump=0.026,
            rough_var=0.026,
        ),
        "R_TrunnionSteel": _build_pbr_mat(
            "R_TrunnionSteel",
            base_srgb=(0.68, 0.71, 0.75),
            roughness=0.21,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.88, 0.90, 0.94),
            grain_scale=34.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),
        "R_DarkSteelCtrl": _build_pbr_mat(
            "R_DarkSteelCtrl",
            base_srgb=(0.175, 0.184, 0.198),
            roughness=0.29,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.44,
            edge_srgb=(0.76, 0.79, 0.83),
            grain_scale=48.0,
            grain_bump=0.032,
            voronoi_grain=0.45,
            voronoi_scale=80.0,
            rough_var=0.030,
        ),
        "R_BrightStainless": _build_pbr_mat(
            "R_BrightStainless",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "R_KnobODGreen": _build_pbr_mat(
            "R_KnobODGreen",
            base_srgb=(0.248, 0.296, 0.206),
            roughness=0.60,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.16,
            edge_srgb=(0.330, 0.382, 0.278),
            grain_scale=72.0,
            grain_bump=0.115,
            voronoi_grain=0.76,
            voronoi_scale=112.0,
            rough_var=0.044,
        ),
        "R_KnobODDark": _build_pbr_mat(
            "R_KnobODDark",
            base_srgb=(0.195, 0.236, 0.164),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.024,
            grain_scale=74.0,
            grain_bump=0.130,
            voronoi_grain=0.78,
            voronoi_scale=116.0,
            rough_var=0.038,
        ),
        "R_SightDotWhite": _build_pbr_mat(
            "R_SightDotWhite",
            base_srgb=(0.94, 0.95, 0.94),
            roughness=0.30,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.008,
            rough_var=0.015,
        ),

        # --- SUITE 3: CHF BARREL, TULIP, GAS SYSTEM, DUAL-ROD CARRIER & INTERNALS (aug_v3_metal) ---
        "M_CHFBarrelSteel": _build_chf_swirl_barrel_mat(),
        "M_TulipHeatSoot": _build_tulip_heat_soot_mat(),
        "M_NitrideSteel": _build_pbr_mat(
            "M_NitrideSteel",
            base_srgb=(0.174, 0.184, 0.200),
            roughness=0.29,
            metallic=0.89,
            bevel_r=0.022,
            edge_wear=0.42,
            edge_srgb=(0.76, 0.79, 0.83),
            grain_scale=52.0,
            grain_bump=0.032,
            voronoi_grain=0.46,
            voronoi_scale=84.0,
            rough_var=0.032,
        ),
        "M_CastCarrierSteel": _build_pbr_mat(
            "M_CastCarrierSteel",
            base_srgb=(0.192, 0.204, 0.220),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.46,
            edge_srgb=(0.80, 0.83, 0.87),
            grain_scale=56.0,
            grain_bump=0.036,
            voronoi_grain=0.52,
            voronoi_scale=88.0,
            rough_var=0.030,
        ),
        "M_ChromeMirror": _build_pbr_mat(
            "M_ChromeMirror",
            base_srgb=(0.81, 0.83, 0.87),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.016,
            edge_wear=0.18,
            edge_srgb=(0.94, 0.95, 0.98),
            grain_scale=24.0,
            grain_bump=0.012,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.018,
        ),
        "M_BrushedStainless": _build_pbr_mat(
            "M_BrushedStainless",
            base_srgb=(0.74, 0.77, 0.81),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.24,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.4, 3.4),
            rough_var=0.022,
        ),
        "M_DarkSpringSteel": _build_pbr_mat(
            "M_DarkSpringSteel",
            base_srgb=(0.34, 0.36, 0.40),
            roughness=0.28,
            metallic=0.92,
            bevel_r=0.010,
            grain_scale=32.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "M_SlotDark": _build_pbr_mat(
            "M_SlotDark",
            base_srgb=(0.085, 0.090, 0.098),
            roughness=0.54,
            metallic=0.72,
            bevel_r=0.012,
            grain_scale=36.0,
            grain_bump=0.024,
            rough_var=0.026,
        ),
        "M_GasWingOlive": _build_pbr_mat(
            "M_GasWingOlive",
            base_srgb=(0.205, 0.248, 0.172),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=64.0,
            grain_bump=0.088,
            voronoi_grain=0.70,
            voronoi_scale=98.0,
            rough_var=0.036,
        ),
        "M_RegDotWhite": _build_pbr_mat(
            "M_RegDotWhite",
            base_srgb=(0.93, 0.94, 0.95),
            roughness=0.32,
            metallic=0.00,
            bevel_r=0.006,
            grain_scale=20.0,
            grain_bump=0.006,
            rough_var=0.015,
        ),
        "M_RegDotRed": _build_pbr_mat(
            "M_RegDotRed",
            base_srgb=(0.86, 0.11, 0.10),
            roughness=0.28,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=20.0,
            grain_bump=0.006,
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
    u_segs: int = 28, v_segs: int = 18,
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
    name: str, pts_r_y: list[tuple[float, float]], segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Revolves (r, y) profile around Three.js +Y axis (r=0 caps cleanly at poles)."""
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


def mk_arc_lug(
    name: str, r_in: float, r_out: float, ang_center: float, ang_width: float,
    x0: float, length: float, steps: int = 6, bevel: float = 0.014,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Chamfered annular-sector locking lug / quick-change barrel spline along +X."""
    a0 = ang_center - ang_width * 0.5
    pts_zy = []
    for i in range(steps + 1):
        a = a0 + ang_width * (i / steps)
        pts_zy.append((math.sin(a) * r_out, math.cos(a) * r_out))
    for i in range(steps, -1, -1):
        a = a0 + ang_width * (i / steps)
        pts_zy.append((math.sin(a) * r_in, math.cos(a) * r_in))
    return mk_extrude_x(name, pts_zy, x0, x0 + length, bevel=bevel, bevel_segs=1, mat=mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 12,
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
    x0: float, x1: float, twist_rad_per_cm: float, segs: int = 18, phase: float = 0.0,
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
            ang = base + twist_rad_per_cm * (x - x0)
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
    name: str, radius: float, length: float, axis: str = "x",
    flutes: int = 22, depth: float = 0.016,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """True 3D fluted/knurled cylinder with crisp chamfered end caps."""
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.015, length * 0.16, radius * 0.14)
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
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 100
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


# =============================================================================
# 24 AAA HARD-SURFACE STEYR AUG A1 (StG 77) PART BUILDERS
# =============================================================================

# --- SUITE 1: STOCK, FOREGRIP, WAFFLE MAG, CONTROLS & HAMMER PACK (10 PARTS) ---

def build_aug_stock(mats: dict) -> bpy.types.Object:
    """F-01: Iconic Austrian Olive-Green PA66 Monocoque Bullpup Stock (assembledPos: [0, 0, 0])."""
    m_od = mats["S_ODGreenStock"]
    m_gr = mats["S_ODGreenGrip"]
    m_dk = mats["S_ODGreenDark"]
    m_rb = mats["S_RubberBlack"]
    m_bp = mats["S_BlackPolymer"]
    m_st = mats["S_BrightSteelPin"]

    # 1. Sweeping futuristic Austrian bullpup monocoque profile (flush at X=-17.30 rear & X=-2.50/Y=+0.42 receiver deck!)
    stock_xy: list[tuple[float, float]] = [
        (-17.30, -4.28),
        (-17.30,  1.98),
    ]
    stock_xy += _quad_bez((-17.30, 1.98), (-17.24, 2.06), (-16.95, 2.06), 6)
    stock_xy += [
        ( -2.50,  2.06),
        ( -2.50,  0.42),
        (  3.85,  0.42),
        (  3.56, -1.14),
    ]
    stock_xy += _quad_bez((3.56, -1.14), (3.16, -1.78), (2.35, -1.82), 8)
    stock_xy += [
        ( -8.35, -2.08),
        ( -8.35, -3.48),
        (-11.75, -3.48),
        (-11.95, -3.64),
        (-13.15, -3.56),
        (-13.68, -2.98),
        (-16.20, -4.05),
    ]
    raw_hull = mk_extrude_z("st_raw", stock_xy, -0.880, 0.880, bevel=0.068, bevel_segs=3, mat=m_od)

    # Ergonomic rounded upper cheekweld comb ridge spanning X in [-16.9, -2.6]
    cheek_comb = mk_cyl(
        "st_comb", 0.42, 0.42, 14.30, "x", 24,
        [("s", 1.0, 0.48, 1.84), ("t", -9.75, 1.935, 0.0)], m_od, bevel=0.04,
    )
    stock_solid = bool_union([raw_hull, cheek_comb], "st_solid", solver="EXACT")

    # Hollow internal bullpup cavities (carrier/hammer-pack bay, fore-channel, curved magwell,
    # right ejection port, left port recess, sliding trigger slot, cross-bolt safety slot, takedown bore)
    cutters = [
        mk_box("c_butt_cav", 14.55, 3.55, 1.34, [("t", -9.85, 0.05, 0.0)], m_dk),
        mk_box("c_fore_chn",  6.60, 1.85, 1.32, [("t",  0.55, -0.35, 0.0)], m_dk),
        mk_box("c_magwell",   2.86, 4.65, 1.34, [("rz", 0.08), ("t", -9.98, -1.55, 0.0)], m_dk),
        mk_box("c_ej_right",  2.96, 1.06, 0.86, [("t", -8.20, 1.12, 0.65)], m_dk),
        mk_box("c_ej_left",   2.96, 1.06, 0.16, [("t", -8.20, 1.12, -0.84)], m_dk),
        mk_box("c_trig_slt",  1.58, 1.22, 0.66, [("t",  0.55, -1.78, 0.0)], m_dk),
        mk_box("c_safe_slt",  0.50, 0.48, 2.04, [("t", -0.65, -1.42, 0.0)], m_dk),
        mk_cyl("c_td_hole",   0.195, 0.195, 2.04, "z", 22, [("t", -15.85, -2.45, 0.0)], m_dk),
    ]
    hull = bool_subtract(stock_solid, cutters, solver="EXACT")

    # 2. Ergonomic Swept-Back (-18 deg) Pistol Grip w/ Sculpted Palm Swells & Anti-Slip Front Ribs
    grip_xy: list[tuple[float, float]] = [(-2.15, -1.55), (0.05, -1.55)]
    grip_xy += _quad_bez((0.05, -1.55), (-0.35, -3.60), (-1.75, -7.05), 14)
    grip_xy += _quad_bez((-1.75, -7.05), (-1.95, -7.28), (-2.35, -7.26), 6)
    grip_xy.append((-3.55, -7.12))
    grip_xy += _quad_bez((-3.55, -7.12), (-3.82, -6.92), (-3.65, -6.35), 8)
    grip_xy += _quad_bez((-3.65, -6.35), (-2.75, -3.85), (-2.35, -2.05), 12)
    grip_core = mk_extrude_z("st_grip", grip_xy, -0.58, 0.58, bevel=0.09, bevel_segs=3, mat=m_od)
    # Seamless organic palm-swell bolsters in matching OD-green polyamide (zero harsh dark oval seam!)
    palm_l = mk_sphere("st_palm_l", 0.68, 1.55, 0.125, 24, 14, [("rz", -0.30), ("t", -1.98, -4.45, -0.525)], m_od)
    palm_r = mk_sphere("st_palm_r", 0.68, 1.55, 0.125, 24, 14, [("rz", -0.30), ("t", -1.98, -4.45,  0.525)], m_od)
    grip_sculpted = bool_union([grip_core, palm_l, palm_r], "st_grip_u", solver="EXACT")

    # Grip base storage compartment elastomer plug
    grip_cap = mk_box("st_gcap", 1.18, 0.16, 0.88, [("rz", 0.11), ("t", -2.72, -7.20, 0.0)], m_rb, bevel=0.025)

    # 3. Iconic Steyr Full-Hand Winter Trigger Guard Bow
    bow_xy: list[tuple[float, float]] = [(-2.05, -7.08)]
    bow_xy += _quad_bez((-2.05, -7.08), (0.45, -5.85), (2.65, -1.62), 16)
    bow_xy.append((1.98, -1.62))
    bow_xy += _quad_bez((1.98, -1.62), (0.05, -5.28), (-1.78, -6.52), 16)
    bow_geo = mk_extrude_z("st_bow", bow_xy, -0.42, 0.42, bevel=0.065, bevel_segs=3, mat=m_od)

    # 4. Flared Magwell Collar, Right Brass Deflector, Left Dust Cover + Retention Clips, Safety Bezels & Controls
    mag_flange = bool_subtract(
        mk_box("st_mflg", 3.48, 0.54, 1.78, [("t", -10.05, -3.32, 0.0)], m_od, bevel=0.04, bevel_segs=2),
        [mk_box("c_mflg", 2.84, 0.86, 1.34, [("t", -10.00, -3.32, 0.0)], m_dk)],
        solver="EXACT",
    )
    # Sculpted bevelled brass shell deflector behind right ejection port
    brass_deflector = mk_box("st_bdefl", 0.34, 1.14, 0.15, [("ry", -0.35), ("t", -9.82, 1.12, 0.90)], m_od, bevel=0.028)

    # Snapped-on Left Ejection Port Polymer Dust Cover w/ twin recessed retention clips
    left_cover = mk_box("st_lcov", 3.04, 1.12, 0.14, [("t", -8.20, 1.12, -0.87)], m_od, bevel=0.028)
    clip_f = mk_box("st_lcf", 0.42, 0.34, 0.08, [("t", -7.15, 1.12, -0.945)], m_dk, bevel=0.016)
    clip_r = mk_box("st_lcr", 0.42, 0.34, 0.08, [("t", -9.25, 1.12, -0.945)], m_dk, bevel=0.016)

    # Molded cross-bolt safety bezel rims on both flanks
    safety_bezel = bool_subtract(
        mk_box("st_sbez", 0.68, 0.66, 1.78, [("t", -0.65, -1.42, 0.0)], m_od, bevel=0.032),
        [mk_box("c_sbez", 0.49, 0.47, 1.96, [("t", -0.65, -1.42, 0.0)], m_dk)],
        solver="EXACT",
    )

    # Rear ambidextrous ribbed black polymer paddle magazine release & stainless cross-pin
    mag_paddle = mk_box("st_mpad", 1.02, 0.44, 0.98, [("rz", 0.18), ("t", -12.38, -3.56, 0.0)], m_bp, bevel=0.032)
    mag_pin = mk_cyl("st_mpin", 0.075, 0.075, 1.56, "z", 16, [("t", -12.05, -3.32, 0.0)], m_st, bevel=0.012)

    # Receiver takedown cross-lock wedge above pistol grip (X=-2.05, Y=-0.22)
    rec_wedge = mk_box("st_rwed", 0.58, 0.36, 1.88, [("t", -2.05, -0.22, 0.0)], m_bp, bevel=0.028)

    parts = [
        hull, grip_sculpted, grip_cap, bow_geo, mag_flange, brass_deflector,
        left_cover, clip_f, clip_r, safety_bezel, mag_paddle, mag_pin, rec_wedge,
    ]
    # Horizontal molded anti-slip ribs along front strap of pistol grip
    for r in range(6):
        t = r / 5.0
        rx = -0.42 - t * 1.18
        ry = -2.75 - t * 3.45
        parts.append(mk_box(f"st_grib_{r}", 0.16, 0.13, 1.14, [("rz", -0.31), ("t", rx, ry, 0.0)], m_gr, bevel=0.022))

    # Ribbed serrations on rear paddle mag release
    for k in range(3):
        parts.append(mk_box(f"st_mpr_{k}", 0.10, 0.05, 0.88, [("rz", 0.18), ("t", -12.14 - k * 0.24, -3.77 - k * 0.04, 0.0)], m_rb, bevel=0.01))

    obj = join_objects(parts, "aug_stock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_buttpad(mats: dict) -> bpy.types.Object:
    """F-02: Ribbed Charcoal-Black Elastomer Shoulder Buttpad & Cleaning Trapdoor (pos: [-17.90, -1.12, 0])."""
    m_rb = mats["S_RubberBlack"]
    m_bp = mats["S_BlackPolymer"]
    m_dk = mats["S_DarkSteelPin"]

    pad_xy: list[tuple[float, float]] = [
        ( 0.60, -3.16),
        ( 0.60,  3.18),
        (-0.42,  3.14),
    ]
    pad_xy += _quad_bez((-0.42, 3.14), (-0.20, 0.15), (-0.58, -3.08), 16)
    raw_pad = mk_extrude_z("bp_raw", pad_xy, -0.855, 0.855, bevel=0.068, bevel_segs=3, mat=m_rb)

    # Internal hollow elastomer plug mating inside buttstock rear mouth
    inner_plug = bool_subtract(
        mk_box("bp_plug", 0.56, 5.10, 1.26, [("t", 0.84, 0.05, 0.0)], m_rb, bevel=0.03),
        [mk_box("c_bp_plug", 0.45, 2.40, 0.88, [("t", 0.92, 0.35, 0.0)], m_bp)],
        solver="EXACT",
    )
    # Recessed cleaning-kit trapdoor frame & hinged lid
    trap_frame = bool_subtract(
        mk_box("bp_tfrm", 0.16, 2.05, 0.82, [("t", -0.34, 0.35, 0.0)], m_dk, bevel=0.018),
        [mk_box("c_bp_tfrm", 0.20, 1.72, 0.62, [("t", -0.38, 0.35, 0.0)], m_bp)],
        solver="EXACT",
    )
    trap_lid = mk_box("bp_tlid", 0.10, 1.66, 0.58, [("t", -0.33, 0.35, 0.0)], m_bp, bevel=0.014)
    trap_latch = mk_box("bp_tlat", 0.06, 0.24, 0.38, [("t", -0.39, 1.04, 0.0)], m_dk, bevel=0.010)

    parts = [raw_pad, inner_plug, trap_frame, trap_lid, trap_latch]
    for i in range(-5, 6):
        if 0 <= i <= 2:
            continue
        parts.append(mk_box(
            f"bp_rib_{i}", 0.14, 0.12, 1.56,
            [("t", -0.38 - abs(i) * 0.015, i * 0.52, 0.0)], m_bp, bevel=0.022,
        ))
    obj = join_objects(parts, "aug_buttpad")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_foregrip(mats: dict) -> bpy.types.Object:
    """F-07: Iconic Austrian OD-Green Folding Vertical Foregrip & Pivot Spring (pos: [8.85, -0.18, 0])."""
    m_od = mats["S_ODGreenStock"]
    m_gr = mats["S_ODGreenGrip"]
    m_rb = mats["S_RubberBlack"]
    m_dk = mats["S_DarkSteelPin"]
    m_st = mats["S_BrightSteelPin"]
    m_sp = mats["S_SpringSteel"]

    # Machined steel top folding pivot knuckle centered at (0,0,0) mating flush inside gas-block clevis
    top_hinge = mk_cyl("fg_hinge", 0.36, 0.36, 0.68, "z", 28, [], m_dk, bevel=0.024)
    detent_lug = mk_box("fg_dlug", 0.28, 0.26, 0.66, [("t", 0.0, 0.28, 0.0)], m_dk, bevel=0.020)
    pivot_pin = mk_cyl("fg_pin", 0.16, 0.16, 1.08, "z", 22, [], m_st, bevel=0.016)

    # Sculpted double-swell contoured OD-green polyamide vertical grip (raked -6.5 deg)
    grip_profile = [
        (0.00, 0.00),
        (0.38, 0.00),
        (0.45, 0.45),
        (0.54, 1.45),
        (0.50, 2.65),
        (0.53, 3.85),
        (0.47, 4.78),
        (0.30, 5.04),
        (0.00, 5.08),
    ]
    grip_body = mk_lathe_y(
        "fg_body", grip_profile, segs=32,
        xform=[("s", 1.12, 1.0, 0.88), ("rz", math.pi - 0.11), ("t", 0.0, -0.12, 0.0)],
        mat=m_od,
    )
    bottom_cap = mk_cyl("fg_bcap", 0.24, 0.22, 0.14, "y", 22, [("rz", -0.11), ("t", -0.55, -5.12, 0.0)], m_rb, bevel=0.020)

    parts = [top_hinge, detent_lug, pivot_pin, grip_body, bottom_cap]
    # 5 tactile circumferential grip rings along ergonomic OD-green handle
    for i in range(1, 6):
        gy = -0.85 - i * 0.68
        gx = gy * 0.11
        parts.append(mk_torus(
            f"fg_grv_{i}", 0.50, 0.044, "y", 28, 10,
            [("s", 1.12, 1.0, 0.88), ("rz", -0.11), ("t", gx, gy, 0.0)], m_gr,
        ))
    # Internal captive pivot detent spring visible in X-Ray / cutaway
    parts.append(mk_coil_spring("fg_spr", "y", -1.15, -0.25, -0.05, 0.0, 0.16, 0.030, 5.0, 8, 14, mat=m_sp))

    obj = join_objects(parts, "aug_foregrip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_aug_trigger(mats: dict) -> bpy.types.Object:
    """FC-01: Progressive Two-Stage Linear Sliding Black Polymer Trigger (pos: [0.55, -2.35, 0])."""
    m_bp = mats["S_BlackPolymer"]
    m_dk = mats["S_ODGreenDark"]
    m_st = mats["S_BrightSteelPin"]
    m_rb = mats["S_RubberBlack"]

    guide_blk = mk_box("tr_gblk", 1.44, 0.54, 0.58, [("t", -0.05, 0.62, 0.0)], m_bp, bevel=0.025)
    guide_rl = mk_box("tr_grl", 1.40, 0.16, 0.72, [("t", -0.05, 0.76, 0.0)], m_dk, bevel=0.018)

    shoe_xy: list[tuple[float, float]] = [(-0.42, 0.45), (0.46, 0.45)]
    shoe_xy += _quad_bez((0.46, 0.45), (0.22, -0.35), (0.36, -1.08), 14)
    shoe_xy.append((-0.18, -1.14))
    shoe_xy += _quad_bez((-0.18, -1.14), (-0.46, -0.45), (-0.42, 0.45), 14)
    shoe = mk_extrude_z("tr_shoe", shoe_xy, -0.25, 0.25, bevel=0.036, bevel_segs=3, mat=m_bp)

    yoke_bolt = mk_cyl("tr_ybolt", 0.12, 0.12, 0.84, "z", 20, [("t", -0.22, 0.65, 0.0)], m_st, bevel=0.014)

    parts = [guide_blk, guide_rl, shoe, yoke_bolt]
    for i in range(4):
        ty = -0.15 - i * 0.24
        parts.append(mk_box(f"tr_rib_{i}", 0.08, 0.058, 0.48, [("t", 0.315, ty, 0.0)], m_rb, bevel=0.012))

    obj = join_objects(parts, "aug_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_safety(mats: dict) -> bpy.types.Object:
    """FC-02: Rectangular Cross-Bolt Push-Button Safety w/ Crimson Fire Collar & White Safe Dot (pos: [-0.65, -1.42, 0])."""
    m_bp = mats["S_BlackPolymer"]
    m_rd = mats["S_SafetyCrimson"]
    m_wh = mats["S_SafetyWhite"]
    m_st = mats["S_BrightSteelPin"]
    m_rb = mats["S_RubberBlack"]

    main_bar = bool_subtract(
        mk_box("sf_bar", 0.46, 0.44, 1.88, [("t", 0.0, 0.0, 0.04)], m_bp, bevel=0.026, bevel_segs=2),
        [mk_box("c_sf_nt", 0.52, 0.18, 0.38, [("t", 0.12, -0.18, -0.24)], m_rb)],
        solver="EXACT",
    )
    # Iconic bright crimson-red left FIRE band + crisp recessed white SAFE dot on right face!
    red_band = mk_box("sf_red", 0.44, 0.42, 0.28, [("t", 0.0, 0.0, -0.96)], m_rd, bevel=0.022, bevel_segs=2)
    white_dot = mk_cyl("sf_wdot", 0.10, 0.10, 0.06, "z", 22, [("t", 0.0, 0.0, 0.99)], m_wh, bevel=0.012)
    detent_pl = mk_cyl("sf_det", 0.075, 0.075, 0.52, "y", 16, [("t", 0.0, 0.22, 0.20)], m_st, bevel=0.010)
    # Subtle molded 'F' & 'S' tactile index rims
    red_rim = mk_cyl("sf_rdimp", 0.095, 0.095, 0.03, "z", 20, [("t", 0.0, 0.0, -1.095)], m_rd, bevel=0.008)

    obj = join_objects([main_bar, red_band, white_dot, detent_pl, red_rim], "aug_safety")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_mag_body(mats: dict) -> bpy.types.Object:
    """M-01: Iconic 30-Rd Smoked Honey-Amber Translucent Waffle-Grid Polymer Magazine (pos: [-9.95, 0.45, 0])."""
    m_amb = mats["S_MagAmberBody"]
    m_rib = mats["S_MagAmberRib"]
    m_lip = mats["S_MagFeedLips"]
    m_dk = mats["S_ODGreenDark"]

    # Exact curved 5.56x45mm NATO circular arc body (Z in [-0.57, +0.57] with crisp beveled spines)
    steps = 32
    mag_xy: list[tuple[float, float]] = []
    for i in range(steps + 1):
        ang = AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * (i / steps)
        mag_xy.append((AUG_MAG_ARC_CX - math.cos(ang) * AUG_MAG_R_OUTER, AUG_MAG_ARC_CY - math.sin(ang) * AUG_MAG_R_OUTER))
    for i in range(steps, -1, -1):
        ang = AUG_MAG_ANG_START + (AUG_MAG_ANG_END - AUG_MAG_ANG_START) * (i / steps)
        mag_xy.append((AUG_MAG_ARC_CX - math.cos(ang) * AUG_MAG_R_INNER, AUG_MAG_ARC_CY - math.sin(ang) * AUG_MAG_R_INNER))

    raw_body = mk_extrude_z("mg_raw", mag_xy, -0.570, 0.570, bevel=0.044, bevel_segs=2, mat=m_amb)
    sculpted = bool_subtract(
        raw_body,
        [mk_box("c_mg_thr", 1.96, 1.68, 0.86, [("t", 0.0, -0.15, 0.0)], m_dk)],
        solver="EXACT",
    )

    parts = [sculpted]
    r_mid = 0.5 * (AUG_MAG_R_INNER + AUG_MAG_R_OUTER)

    # 1. Physical 3D Beveled Horizontal Waffle-Grid Ribs protruding to Z = +-0.618 (framing recessed amber brass windows!)
    for r in range(6):
        ang = 0.235 + r * 0.042
        mx = AUG_MAG_ARC_CX - math.cos(ang) * r_mid
        my = AUG_MAG_ARC_CY - math.sin(ang) * r_mid
        for s_z in (-1.0, 1.0):
            parts.append(mk_box(
                f"mg_hrib_{r}_{int(s_z)}", 2.44, 0.095, 0.070,
                [("rz", ang), ("t", mx, my, s_z * 0.584)], m_rib, bevel=0.016, bevel_segs=2,
            ))

    # 2. Physical 3D Beveled Vertical/Curved Waffle-Grid Ribs intersecting horizontal ribs cleanly!
    for r_idx, r_frac in enumerate((-0.62, 0.0, 0.62)):
        r_rib = r_mid + r_frac * 0.95
        for s in range(5):
            ang = 0.250 + s * 0.044
            mx = AUG_MAG_ARC_CX - math.cos(ang) * r_rib
            my = AUG_MAG_ARC_CY - math.sin(ang) * r_rib
            for s_z in (-1.0, 1.0):
                parts.append(mk_box(
                    f"mg_vrib_{r_idx}_{s}_{int(s_z)}", 0.108, 0.82, 0.066,
                    [("rz", ang), ("t", mx, my, s_z * 0.582)], m_rib, bevel=0.015, bevel_segs=2,
                ))

    # 3. Contoured Double-Stack C-Section Feed Lips + Front Bullet Ramp + Magwell Over-Insertion Stop Lugs
    for side in (-1.0, 1.0):
        lip_zy: list[tuple[float, float]] = [(side * 0.53, 0.05), (side * 0.53, 0.26)]
        lip_zy += _quad_bez((side * 0.53, 0.26), (side * 0.53, 0.358), (side * 0.36, 0.360), 6)
        lip_zy.append((side * 0.22, 0.352))
        lip_zy += _quad_bez((side * 0.22, 0.352), (side * 0.195, 0.320), (side * 0.22, 0.292), 5)
        lip_zy.append((side * 0.35, 0.298))
        lip_zy += _quad_bez((side * 0.35, 0.298), (side * 0.44, 0.290), (side * 0.44, 0.210), 6)
        lip_zy.append((side * 0.44, 0.05))
        parts.append(mk_extrude_x(f"mg_lip_{int(side)}", lip_zy, -1.13, 1.13, bevel=0.022, bevel_segs=2, mat=m_lip))

    parts.append(mk_box("mg_ramp", 0.22, 0.22, 0.92, [("t", 1.02, 0.08, 0.0)], m_lip, bevel=0.018))
    parts.append(mk_box("mg_stopL", 2.34, 0.14, 0.06, [("rz", 0.18), ("t", 0.02, -3.12, -0.585)], m_rib, bevel=0.014))
    parts.append(mk_box("mg_stopR", 2.34, 0.14, 0.06, [("rz", 0.18), ("t", 0.02, -3.12,  0.585)], m_rib, bevel=0.014))
    parts.append(mk_box("mg_lugF", 0.28, 0.42, 0.84, [("t",  1.30, -3.28, 0.0)], m_lip, bevel=0.020))
    parts.append(mk_box("mg_lugR", 0.38, 0.36, 0.88, [("t", -1.32, -3.55, 0.0)], m_lip, bevel=0.020))

    obj = join_objects(parts, "aug_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_mag_follower(mats: dict) -> bpy.types.Object:
    """M-02: Anti-Tilt Olive/Black Polymer Double-Stack Follower (pos: [-8.70, -6.14, 0], rot: [0,0,0.375])."""
    m_od = mats["S_ODGreenStock"]
    m_dk = mats["S_ODGreenDark"]
    m_bp = mats["S_BlackPolymer"]

    parts = [
        mk_box("flw_deck", 2.02, 0.24, 0.80, [("t", 0.0, 0.12, 0.0)], m_bp, bevel=0.022),
        mk_cyl("flw_step", 0.115, 0.115, 1.94, "x", 22, [("t", 0.0, 0.26, -0.16)], m_od, bevel=0.016),
        mk_cyl("flw_bead", 0.075, 0.075, 1.88, "x", 18, [("t", 0.0, 0.22,  0.24)], m_od, bevel=0.012),
        mk_box("flw_legF", 0.16, 0.68, 0.74, [("t",  0.88, -0.22, 0.0)], m_bp, bevel=0.018),
        mk_box("flw_legR", 0.16, 0.68, 0.74, [("t", -0.88, -0.22, 0.0)], m_bp, bevel=0.018),
        mk_box("flw_sbos", 0.68, 0.22, 0.28, [("t",  0.00, -0.11, 0.0)], m_dk, bevel=0.016),
        mk_box("flw_ribL", 1.32, 0.12, 0.05, [("t",  0.00, -0.08, -0.375)], m_dk, bevel=0.010),
        mk_box("flw_ribR", 1.32, 0.12, 0.05, [("t",  0.00, -0.08,  0.375)], m_dk, bevel=0.010),
    ]
    obj = join_objects(parts, "aug_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_mag_floorplate(mats: dict) -> bpy.types.Object:
    """M-04: Flush 0.48-rad Angled Black Polymer Floorplate & Lock Button (pos: [-7.84, -8.00, 0])."""
    m_bp = mats["S_BlackPolymer"]
    m_dk = mats["S_ODGreenDark"]
    m_rb = mats["S_RubberBlack"]
    ang = AUG_MAG_ANG_END

    parts = [
        mk_box("fp_base", 2.76, 0.34, 1.34, [("rz", ang)], m_bp, bevel=0.032, bevel_segs=2),
        mk_box("fp_flng", 2.54, 0.16, 1.24, [("rz", ang), ("t", -0.08, 0.16, 0.0)], m_dk, bevel=0.018),
        mk_box("fp_rlL",  2.48, 0.08, 0.12, [("t", -0.04, 0.20, -0.55), ("rz", ang)], m_bp, bevel=0.012),
        mk_box("fp_rlR",  2.48, 0.08, 0.12, [("t", -0.04, 0.20,  0.55), ("rz", ang)], m_bp, bevel=0.012),
        mk_torus("fp_bez", 0.21, 0.025, "y", 24, 10, [("t", 0.02, -0.17, 0.0), ("rz", ang)], m_rb),
        mk_cyl("fp_btn", 0.17, 0.17, 0.24, "y", 24, [("t", 0.02, -0.13, 0.0), ("rz", ang)], m_dk, bevel=0.016),
    ]
    for rx in (-0.92, -0.58, 0.58, 0.92):
        parts.append(mk_box(f"fp_tr_{rx}", 0.10, 0.035, 1.08, [("t", rx, -0.175, 0.0), ("rz", ang)], m_dk, bevel=0.008))

    obj = join_objects(parts, "aug_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_hammer_pack(mats: dict) -> bpy.types.Object:
    """FC-04: Iconic Steyr Autolube Tan/Amber All-Polymer Rear Hammer Pack (pos: [-14.65, -0.65, 0])."""
    m_hp = mats["S_HammerPackTan"]
    m_hm = mats["S_HammerTan"]
    m_bp = mats["S_BlackPolymer"]
    m_st = mats["S_BrightSteelPin"]
    m_sp = mats["S_SpringSteel"]

    chassis = bool_subtract(
        mk_box("hp_raw", 4.35, 2.22, 1.18, [("t", 0.0, -0.06, 0.0)], m_hp, bevel=0.036, bevel_segs=2),
        [
            mk_box("c_hp_in",  3.65, 1.85, 0.82, [("t",  0.10,  0.28, 0.0)], m_hm),
            mk_box("c_hp_sl",  1.80, 0.90, 1.40, [("rz", -0.32), ("t", -1.55, -1.08, 0.0)], m_hm),
            mk_box("c_hp_spL", 2.40, 0.95, 0.12, [("t",  0.15, -0.10, -0.58)], m_hm),
            mk_box("c_hp_spR", 2.40, 0.95, 0.12, [("t",  0.15, -0.10,  0.58)], m_hm),
        ],
        solver="EXACT",
    )
    pin_lug = bool_subtract(
        mk_box("hp_plug", 0.88, 0.76, 0.76, [("t", -1.20, -1.38, 0.0)], m_hp, bevel=0.028),
        [mk_cyl("c_hp_phole", 0.19, 0.19, 0.96, "z", 20, [("t", -1.20, -1.80, 0.0)], m_hm)],
        solver="EXACT",
    )

    parts = [
        chassis,
        pin_lug,
        mk_box("hp_sear",  2.55, 0.36, 0.56, [("t", 0.38, -0.16, 0.0)], m_hm, bevel=0.022),
        mk_box("hp_disc",  1.18, 0.62, 0.32, [("rz",  0.22), ("t", -0.45, 0.34, -0.16)], m_hm, bevel=0.020),
        mk_box("hp_asear", 0.92, 0.68, 0.28, [("rz", -0.24), ("t",  1.22, 0.36,  0.18)], m_bp, bevel=0.020),
        mk_cyl("hp_slegL", 0.032, 0.032, 0.95, "x", 10, [("rz", -0.18), ("t", 1.34, 0.36, -0.38)], m_sp),
        mk_cyl("hp_slegR", 0.032, 0.032, 0.95, "x", 10, [("rz", -0.18), ("t", 1.34, 0.36,  0.38)], m_sp),
        mk_cyl("hp_pin1",  0.080, 0.080, 1.22, "z", 18, [("t", -0.45, 0.20, 0.0)], m_st, bevel=0.012),
        mk_cyl("hp_pin2",  0.080, 0.080, 1.22, "z", 18, [("t",  1.22, 0.25, 0.0)], m_st, bevel=0.012),
        mk_coil_spring("hp_rspr", "x", -1.65, -0.35, -0.15, 0.0, 0.14, 0.026, 7.0, 8, 14, mat=m_sp),
    ]
    obj = join_objects(parts, "aug_hammer_pack")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_hammer(mats: dict) -> bpy.types.Object:
    """FC-05: All-Polymer Tan/Amber Rotary Hammer & Dual Torsion Springs (pos: [-12.85, -0.05, 0])."""
    m_hm = mats["S_HammerTan"]
    m_st = mats["S_BrightSteelPin"]
    m_sp = mats["S_SpringSteel"]

    pivot_axle = mk_cyl("hm_axle", 0.21, 0.21, 1.14, "z", 22, [], m_st, bevel=0.018)

    h_xy = [
        (-0.24, -0.14),
        ( 0.22, -0.14),
        ( 0.30,  0.42),
        ( 0.31,  0.92),
        ( 0.24,  1.54),
        (-0.26,  1.42),
        (-0.44,  0.56),
    ]
    head_raw = mk_extrude_z("hm_head", h_xy, -0.22, 0.22, bevel=0.032, bevel_segs=2, xform=[("rz", 1.55)], mat=m_hm)
    # Subtract molded circular lightening hole rotated identically with hammer head (+1.55 rad)
    hole_c = mk_cyl("c_hm_hole", 0.14, 0.14, 0.65, "z", 20, [("t", -0.04, 0.76, 0.0), ("rz", 1.55)], m_hm)
    hammer_head = bool_subtract(head_raw, [hole_c], solver="EXACT")

    coil_l = mk_coil_spring("hm_cL", "z", -0.48, -0.26, 0.0, 0.0, 0.31, 0.032, 3.5, 8, 14, mat=m_sp)
    coil_r = mk_coil_spring("hm_cR", "z",  0.26,  0.48, 0.0, 0.0, 0.31, 0.032, 3.5, 8, 14, mat=m_sp)
    bridge = mk_cyl("hm_brg", 0.032, 0.032, 0.96, "z", 12, [("t", -0.34, 0.22, 0.0)], m_sp)

    obj = join_objects([pivot_axle, hammer_head, coil_l, coil_r, bridge], "aug_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 2: DIE-CAST RECEIVER, 1.5x SWAROVSKI OPTIC & CONTROLS (4 PARTS) ---

def build_aug_receiver_optic(mats: dict) -> bpy.types.Object:
    """F-04: Die-Cast Baked-Enamel Aluminum Receiver w/ Integrated 20-Deg Canted
    Swarovski Habicht 1.5x14 Optical Sight Handle & Backup Iron Sights (pos: [0, 0, 0])."""
    m_rc = mats["R_ReceiverEnamel"]
    m_sc = mats["R_ScopeTube"]
    m_ln = mats["R_CoatedLens"]
    m_sl = mats["R_SlotDark"]
    m_tr = mats["R_TrunnionSteel"]
    m_dk = mats["R_DarkSteelCtrl"]
    m_st = mats["R_BrightStainless"]
    m_wh = mats["R_SightDotWhite"]

    # 1. Lower Die-Cast Aluminum Receiver Hull (flush w/ aug_stock at X=-2.50, Y=+0.42!)
    rec_hull = mk_box("rc_hull", 8.35, 1.68, 1.66, [("t", 1.675, 1.26, 0.0)], m_rc)
    right_rod_boss = mk_cyl("rc_rrod", 0.33, 0.33, 8.35, "x", 24, [("t", 1.675, 1.52,  0.52)], m_rc)
    left_rail_boss = mk_cyl("rc_lrl",  0.30, 0.30, 8.15, "x", 22, [("t", 1.580, 1.52, -0.52)], m_rc)
    front_collar = mk_cyl("rc_fcol", 0.76, 0.79, 2.25, "x", 32, [("t", 4.92, 1.05, 0.0)], m_rc, bevel=0.032)
    bottom_lug = mk_box("rc_blug", 0.88, 0.52, 0.84, [("t", -2.05, 0.22, 0.0)], m_rc, bevel=0.025)
    rec_union = bool_union([rec_hull, right_rod_boss, left_rail_boss, front_collar, bottom_lug], "rc_union", solver="EXACT")

    rec_cutters = [
        # Upper octagonal chamfers along receiver shoulders
        mk_box("c_chR", 8.60, 0.48, 0.48, [("rx", math.pi * 0.25), ("t", 1.675, 2.12,  0.85)], m_rc),
        mk_box("c_chL", 8.60, 0.48, 0.48, [("rx", math.pi * 0.25), ("t", 1.675, 2.12, -0.85)], m_rc),
        # Central barrel bore & twin parallel guide-rod bores
        mk_cyl("c_bbore", 0.57, 0.57, 9.40, "x", 28, [("t", 1.65, 1.05, 0.0)], m_sl),
        mk_cyl("c_rgr",   0.21, 0.21, 8.90, "x", 18, [("t", 1.65, 1.52,  0.52)], m_sl),
        mk_cyl("c_lgr",   0.21, 0.21, 8.90, "x", 18, [("t", 1.65, 1.52, -0.52)], m_sl),
        # Left charging-handle guide channel + iconic Steyr upward manual bolt-hold-open notch
        mk_box("c_chslt", 6.95, 0.32, 0.58, [("t", 1.65, 1.62, -0.72)], m_sl),
        mk_box("c_chhld", 0.76, 0.44, 0.58, [("t", 0.18, 1.85, -0.72)], m_sl),
        # Subtle lower flank lightening fuller grooves (leaving mid wall Y in [0.72..1.38] clean for white rollmarks!)
        mk_box("c_flR", 4.80, 0.20, 0.12, [("t", 1.10, 0.58,  0.84)], m_rc),
        mk_box("c_flL", 4.80, 0.20, 0.12, [("t", 1.10, 0.58, -0.84)], m_rc),
    ]
    sculpted_rec = bool_subtract(rec_union, rec_cutters, solver="EXACT")

    # 2. Internal Steel Barrel/Bolt Locking Trunnion Sleeve extending into bullpup stock (X in [-8.195, -2.45])
    trunnion = bool_subtract(
        mk_cyl("rc_trun", 0.68, 0.68, 5.745, "x", 30, [("t", -5.3225, 1.05, 0.0)], m_tr, bevel=0.022),
        [
            mk_cyl("c_tr_in", 0.53, 0.53, 6.00, "x", 26, [("t", -5.32, 1.05, 0.0)], m_sl),
            mk_box("c_tr_ej", 2.45, 0.86, 0.74, [("t", -7.15, 1.08, 0.48)], m_sl),
        ],
        solver="EXACT",
    )

    # 3. Authentic 20-Degree Forward-Canted Carry-Handle Stanchions supporting the Swarovski 1.5x14 Optic
    rear_strut_xy: list[tuple[float, float]] = [(-2.28, 2.00), (-0.78, 2.00)]
    rear_strut_xy += _quad_bez((-0.78, 2.00), (-0.48, 2.65), (-0.22, 3.54), 10)
    rear_strut_xy.append((-1.72, 3.54))
    rear_strut_xy += _quad_bez((-1.72, 3.54), (-1.98, 2.75), (-2.28, 2.00), 10)
    rear_strut = mk_extrude_z("rc_rstr", rear_strut_xy, -0.39, 0.39, bevel=0.052, bevel_segs=3, mat=m_rc)

    front_strut_xy: list[tuple[float, float]] = [(3.25, 2.00), (4.75, 2.00)]
    front_strut_xy += _quad_bez((4.75, 2.00), (5.05, 2.72), (5.31, 3.54), 10)
    front_strut_xy.append((3.81, 3.54))
    front_strut_xy += _quad_bez((3.81, 3.54), (3.52, 2.72), (3.25, 2.00), 10)
    front_strut = mk_extrude_z("rc_fstr", front_strut_xy, -0.39, 0.39, bevel=0.052, bevel_segs=3, mat=m_rc)

    scope_belly = mk_box("rc_sbel", 5.60, 0.24, 0.56, [("t", 1.55, 3.42, 0.0)], m_rc, bevel=0.032)

    # 4. Integrated Swarovski Habicht 1.5x14 Tubular Optical Sight (X in [-4.45, +5.85], Y = 3.88, Z = 0)
    # Closed hollow optical tube lathe with deep recessed matte optical baffles on both ends!
    scope_prof = [
        (0.49, -4.45),
        (0.69, -4.45),  # Flared ocular bell rear rim
        (0.69, -3.35),
        (0.56, -2.72),  # Straight 1.5x14 Habicht main body
        (0.56,  4.32),
        (0.67,  4.92),  # Flared objective bell
        (0.67,  5.85),
        (0.50,  5.85),  # Front objective aperture rim
        (0.50,  5.38),  # Deep front optical baffle cell
        (0.42,  5.34),
        (0.42, -3.96),  # Inner tube cavity
        (0.51, -4.00),  # Deep rear ocular baffle cell
        (0.51, -4.45),
        (0.49, -4.45),
    ]
    scope_tube = mk_lathe_x("rc_scope", scope_prof, segs=40, xform=[("t", 0.0, 3.88, 0.0)], mat=m_sc)

    # Internal knurled lens retaining rings + domed multi-coated emerald-sapphire Swarovski glass lenses
    ocular_retainer = mk_torus("rc_oret", 0.505, 0.030, "x", 32, 10, [("t", -4.34, 3.88, 0.0)], m_dk)
    objective_retainer = mk_torus("rc_frot", 0.495, 0.030, "x", 32, 10, [("t",  5.74, 3.88, 0.0)], m_dk)
    ocular_lens = mk_sphere("rc_olens", 0.095, 0.495, 0.495, 32, 18, [("t", -4.10, 3.88, 0.0)], m_ln)
    objective_lens = mk_sphere("rc_flens", 0.095, 0.490, 0.490, 32, 18, [("t",  5.48, 3.88, 0.0)], m_ln)

    # Coin-slotted Windage (+Z) & Elevation (-Y) Adjustment Turret Caps
    windage_turret = bool_subtract(
        mk_cyl("rc_wtur", 0.28, 0.32, 0.38, "z", 26, [("t", 1.45, 3.88, 0.62)], m_rc, bevel=0.020),
        [mk_box("c_wtur", 0.46, 0.062, 0.12, [("t", 1.45, 3.88, 0.80)], m_sl)],
        solver="EXACT",
    )
    elev_turret = bool_subtract(
        mk_cyl("rc_etur", 0.28, 0.32, 0.34, "y", 26, [("t", 1.45, 3.26, 0.0)], m_rc, bevel=0.020),
        [mk_box("c_etur", 0.46, 0.12, 0.062, [("t", 1.45, 3.10, 0.0)], m_sl)],
        solver="EXACT",
    )

    # Front left captive tactical sling swivel boss & beveled steel loop
    sling_boss = mk_cyl("rc_sbos", 0.18, 0.18, 0.32, "z", 18, [("t", 5.18, 2.18, -0.68)], m_rc, bevel=0.018)
    sling_ring = mk_torus("rc_srng", 0.36, 0.065, "z", 28, 12, [("ry", 0.50), ("t", 5.25, 2.22, -0.82)], m_dk)

    # 5. Integral Top Backup Iron Sights cast atop Swarovski optic housing (Y = 4.52..4.79)
    rear_iron = bool_subtract(
        mk_box("rc_riron", 0.84, 0.30, 0.64, [("t", -3.65, 4.63, 0.0)], m_rc, bevel=0.022),
        [mk_box("c_riron", 0.96, 0.18, 0.16, [("t", -3.65, 4.70, 0.0)], m_sl)],
        solver="EXACT",
    )
    rear_dot_l = mk_cyl("rc_rdL", 0.042, 0.042, 0.03, "x", 14, [("t", -4.07, 4.68, -0.17)], m_wh)
    rear_dot_r = mk_cyl("rc_rdR", 0.042, 0.042, 0.03, "x", 14, [("t", -4.07, 4.68,  0.17)], m_wh)
    front_hood = bool_subtract(
        mk_box("rc_fhood", 0.92, 0.28, 0.52, [("t", 5.20, 4.62, 0.0)], m_rc, bevel=0.022),
        [mk_box("c_fhood", 1.00, 0.22, 0.28, [("t", 5.20, 4.68, 0.0)], m_sl)],
        solver="EXACT",
    )
    front_post = mk_box("rc_fpst", 0.14, 0.22, 0.09, [("t", 5.24, 4.68, 0.0)], m_st, bevel=0.012)
    front_dot = mk_cyl("rc_fdot", 0.038, 0.038, 0.03, "x", 14, [("t", 5.16, 4.73, 0.0)], m_wh)

    # Lower Quick-Change Barrel Cross-Lock Housing Boss under receiver at X = +3.65, Y = +0.58
    lock_boss = bool_subtract(
        mk_box("rc_lbos", 1.18, 0.58, 1.74, [("t", 3.65, 0.58, 0.0)], m_rc, bevel=0.026),
        [mk_box("c_lbos", 0.72, 0.40, 1.88, [("t", 3.65, 0.52, 0.0)], m_sl)],
        solver="EXACT",
    )

    parts = [
        sculpted_rec, trunnion, rear_strut, front_strut, scope_belly,
        scope_tube, ocular_retainer, objective_retainer, ocular_lens, objective_lens,
        windage_turret, elev_turret, sling_boss, sling_ring,
        rear_iron, rear_dot_l, rear_dot_r, front_hood, front_post, front_dot, lock_boss,
    ]
    obj = join_objects(parts, "aug_receiver_optic")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_charging_handle(mats: dict) -> bpy.types.Object:
    """F-06: Left Non-Reciprocating Folding Charging Handle w/ Austrian OD-Green Knob (pos: [3.45, 1.62, -0.92])."""
    m_dk = mats["R_DarkSteelCtrl"]
    m_st = mats["R_BrightStainless"]
    m_od = mats["R_KnobODGreen"]
    m_og = mats["R_KnobODDark"]

    parts = [
        mk_box("ch_shut", 2.95, 0.26, 0.32, [("t", -0.35,  0.00,  0.18)], m_dk, bevel=0.022),
        mk_box("ch_ddog", 0.34, 0.36, 0.38, [("t", -1.68, -0.06,  0.34)], m_st, bevel=0.022),
        mk_cyl("ch_knuk", 0.22, 0.22, 0.62, "x", 22, [("t", 0.45, 0.00, -0.06)], m_dk, bevel=0.020),
        mk_cyl("ch_hpin", 0.09, 0.09, 0.72, "x", 18, [("t", 0.45, 0.00, -0.06)], m_st, bevel=0.012),
        mk_box("ch_hlug", 0.44, 0.24, 0.24, [("t", -0.22, 0.22, -0.02)], m_dk, bevel=0.018),
        # Sculpted OD-green angled folding palm knob
        mk_box("ch_palm", 1.48, 0.38, 0.62, [("ry", 0.42), ("rx", -0.35), ("t", -0.16, 0.18, -0.44)], m_od, bevel=0.072, bevel_segs=3),
        mk_cyl("ch_tip",  0.20, 0.24, 0.52, "y", 22, [("rz", 0.45), ("t", -0.80, 0.28, -0.66)], m_od, bevel=0.045),
    ]
    for k in range(3):
        parts.append(mk_box(
            f"ch_grib_{k}", 0.068, 0.39, 0.61,
            [("ry", 0.42), ("rx", -0.35), ("t", -0.02 - k * 0.24, 0.19 + k * 0.03, -0.46 - k * 0.08)],
            m_og, bevel=0.022,
        ))

    obj = join_objects(parts, "aug_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_barrel_lock(mats: dict) -> bpy.types.Object:
    """F-05: Quick-Change Barrel Cross-Lock Latch & Captive Return Spring (pos: [3.65, 0.52, 0])."""
    m_dk = mats["R_DarkSteelCtrl"]
    m_rc = mats["R_ReceiverEnamel"]
    m_st = mats["R_BrightStainless"]
    m_sl = mats["R_SlotDark"]

    cross_lug = bool_subtract(
        mk_box("bl_lug", 0.66, 0.36, 1.96, [], m_dk, bevel=0.022),
        [mk_cyl("c_bl_sc", 0.46, 0.46, 0.88, "x", 24, [("t", 0.0, 0.46, 0.32)], m_sl)],
        solver="EXACT",
    )
    parts = [
        cross_lug,
        mk_box("bl_pad",  0.88, 0.50, 0.22, [("ry", 0.12), ("t", 0.0, -0.04,  0.98)], m_rc, bevel=0.026),
        mk_cyl("bl_cap",  0.20, 0.20, 0.14, "z", 20, [("t", 0.0, 0.0, -1.00)], m_st, bevel=0.016),
        mk_coil_spring("bl_spr", "z", -0.78, -0.15, 0.0, 0.0, 0.12, 0.025, 5.0, 8, 14, mat=m_st),
    ]
    for i in (-1, 0, 1):
        parts.append(mk_box(f"bl_tth_{i}", 0.12, 0.12, 0.56, [("t", i * 0.22, 0.22, -0.28)], m_st, bevel=0.014))
        parts.append(mk_box(f"bl_rib_{i}", 0.11, 0.44, 0.08, [("rz", 0.35), ("t", i * 0.24, -0.04, 1.09)], m_st, bevel=0.014))

    obj = join_objects(parts, "aug_barrel_lock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_takedown_pin(mats: dict) -> bpy.types.Object:
    """F-03: Rear Captive Takedown Cross-Pin & Left Oval Swivel Sling Loop (pos: [-15.85, -2.45, 0])."""
    m_dk = mats["R_DarkSteelCtrl"]
    m_st = mats["R_BrightStainless"]
    m_sl = mats["R_SlotDark"]

    cross_pin = bool_subtract(
        mk_cyl("td_pin", 0.18, 0.18, 1.98, "z", 24, [], m_dk, bevel=0.016),
        [mk_torus("c_td_grv", 0.19, 0.04, "z", 22, 10, [("t", 0.0, 0.0, 0.42)], m_sl)],
        solver="EXACT",
    )
    right_cap = bool_subtract(
        mk_cyl("td_rcap", 0.26, 0.26, 0.14, "z", 24, [("t", 0.0, 0.0, 0.96)], m_st, bevel=0.018),
        [mk_sphere("c_td_cup", 0.22, 0.22, 0.22, 18, 12, [("t", 0.0, 0.0, 1.12)], m_sl)],
        solver="EXACT",
    )
    parts = [
        cross_pin,
        right_cap,
        mk_cyl("td_lstud", 0.28, 0.28, 0.26, "z", 24, [("t", 0.0, 0.0, -1.02)], m_dk, bevel=0.022),
        mk_box("td_clev",  0.32, 0.28, 0.24, [("t", -0.08, -0.10, -1.14)], m_dk, bevel=0.020),
        mk_torus("td_loop", 0.52, 0.075, "z", 32, 14, [("s", 1.35, 0.85, 1.0), ("rx", 0.35), ("t", -0.35, -0.32, -1.16)], m_dk),
    ]
    obj = join_objects(parts, "aug_takedown_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 3: CHF BARREL, TULIP, GAS SYSTEM, DUAL-ROD CARRIER & INTERNALS (10 PARTS) ---

def build_aug_barrel(mats: dict) -> bpy.types.Object:
    """U-01: 20" (508mm) Cold-Hammer-Forged Quick-Change Barrel w/ 8 Interrupted Locking Rings
    & 6-Groove 1:9" Helical Chrome Rifled Bore (pos: [0, 1.05, 0], X in [-8.20, +18.85])."""
    m_chf = mats["M_CHFBarrelSteel"]
    m_chm = mats["M_ChromeMirror"]
    m_ss  = mats["M_BrushedStainless"]
    m_nit = mats["M_NitrideSteel"]
    m_sl  = mats["M_SlotDark"]

    crown_rim = 0.275
    crown_bore = 0.172
    crown_depth = (crown_rim - crown_bore) * math.tan(math.radians(11.0))

    barrel_prof = [
        (0.390, -8.20),  # Breech extension mouth
        (0.580, -8.20),  # 7-lug steel breech extension collar
        (0.580, -6.55),
        (0.500, -6.25),  # Rear trunnion bearing journal
        (0.500,  2.85),
        (0.535,  3.02),  # Interrupted quick-change locking flange base
        (0.535,  4.38),
        (0.450,  4.55),  # Receiver front bearing journal
        (0.440,  7.82),
        (0.490,  7.90),  # Rear gas-block locating shoulder
        (0.490,  8.18),
        (0.465,  8.22),  # Rear gas-seal circumferential groove
        (0.465,  8.32),
        (0.490,  8.36),
        (0.490,  8.70),
        (0.505,  8.75),  # Precision ground gas-port metering collar
        (0.505,  9.10),
        (0.490,  9.15),
        (0.490,  9.44),
        (0.465,  9.48),  # Front gas-seal circumferential groove
        (0.465,  9.58),
        (0.490,  9.62),
        (0.490,  9.76),  # Front gas-block shoulder
        (0.400,  9.88),  # Forward 20" CHF heavy barrel contour
        (0.400, 15.65),
        (0.443, 15.75),  # NATO 22mm rifle-grenade alignment ring
        (0.443, 16.15),
        (0.390, 16.25),
        (0.390, 18.20),
        (0.295, 18.25),  # M13x1 LH thread-relief undercut groove
        (0.295, 18.32),
        (0.320, 18.35),  # M13x1 LH muzzle thread spigot
        (0.320, 18.81),
        (0.295, 18.85),  # Outer 45-deg crown chamfer
        (crown_rim, 18.85),
        (crown_bore, 18.85 - crown_depth),
        (0.160, 18.85 - crown_depth - 0.018),
        (0.160, -5.65),  # Chrome-lined 5.56mm bore
        (0.175, -5.72),  # Leade / throat
        (0.285, -6.12),  # 5.56x45mm NATO bottleneck shoulder
        (0.305, -7.82),  # Chamber body
        (0.390, -7.86),  # Internal locking-lug recess wall
        (0.390, -8.20),
    ]
    barrel_tube = mk_lathe_x("br_tube", barrel_prof, segs=40, mat=m_chf)
    parts = [barrel_tube]

    # 8 interrupted quick-change barrel locking rings x 4 angular spline sectors (32 chamfered teeth!)
    for i in range(8):
        x0 = 3.08 + i * 0.162
        for s in range(4):
            ang = s * (math.pi * 0.5) + 3.0 * math.pi / 8.0
            parts.append(mk_arc_lug(f"br_spl_{i}_{s}", 0.525, 0.585, ang, math.radians(46.0), x0, 0.092, 5, 0.012, m_ss))

    # 7 internal chrome breech-extension locking lugs inside rear barrel extension
    for k in range(1, 8):
        ang = (k * math.pi * 2.0) / 8.0
        parts.append(mk_arc_lug(f"br_lug_{k}", 0.305, 0.392, ang, math.radians(24.0), -8.16, 0.28, 5, 0.010, m_chm))

    # 45-deg slanted top-right gas-port metering boss & dark drilled gas orifice at X = 8.92
    parts.append(mk_cyl("br_gbos", 0.115, 0.125, 0.08, "y", 18, [("rz", -math.pi * 0.25), ("ry", -math.pi * 0.5), ("t", 8.92, 0.355, 0.355)], m_nit))
    parts.append(mk_cyl("br_gorf", 0.062, 0.062, 0.09, "y", 14, [("rz", -math.pi * 0.25), ("ry", -math.pi * 0.5), ("t", 8.92, 0.358, 0.358)], m_sl))

    # NATO 22mm grenade ring band + M13x1 LH muzzle threads + chrome feed ramp + recessed chrome crown ring
    parts.append(mk_lathe_x("br_gring", [(0.440, 15.77), (0.446, 15.77), (0.446, 16.13), (0.440, 16.13), (0.440, 15.77)], 36, mat=m_nit))
    parts.append(mk_knurled_cyl("br_thrd", 0.324, 0.42, "x", flutes=16, depth=0.010, xform=[("t", 18.58, 0.0, 0.0)], mat=m_ss))
    parts.append(mk_box("br_ramp", 0.32, 0.18, 0.34, [("rz", 0.40), ("t", -7.98, -0.29, 0.0)], m_chm, bevel=0.016))
    parts.append(mk_lathe_x(
        "br_crown",
        [
            (crown_bore, 18.85 - crown_depth),
            (crown_rim - 0.004, 18.849),
            (crown_rim - 0.004, 18.844),
            (crown_bore, 18.845 - crown_depth),
            (crown_bore, 18.85 - crown_depth),
        ],
        36, mat=m_chm,
    ))
    # 6 right-hand 1:9" (22.86 cm) helical chrome rifling lands inside bore
    parts.append(mk_helical_lands(
        "br_rifling", 6, 0.160, 0.018, 0.10,
        -5.60, 18.85 - crown_depth - 0.022, (2.0 * math.pi) / 22.86, segs=22, mat=m_chm,
    ))

    obj = join_objects(parts, "aug_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_aug_flash_hider(mats: dict) -> bpy.types.Object:
    """U-02: Iconic Steyr AUG A1 Closed-End 3-Slot Tulip Flash Suppressor w/ Heat & Carbon Soot (pos: [19.40, 1.05, 0])."""
    m_tul = mats["M_TulipHeatSoot"]
    m_nit = mats["M_NitrideSteel"]
    m_ss  = mats["M_BrushedStainless"]
    m_sl  = mats["M_SlotDark"]

    tulip_prof = [
        (0.325, -1.15),  # M13x1 LH thread socket
        (0.490, -1.15),  # Rear check-nut collar
        (0.490, -0.58),
        (0.535, -0.48),  # Knurled 22mm NATO rifle-grenade collar
        (0.535, -0.18),
        (0.495, -0.05),  # Tulip expansion swell
        (0.465,  0.84),
        (0.410,  1.10),  # Closed-prong tapered tulip crown
        (0.350,  1.10),  # Crown rim
        (0.245,  0.94),  # Recessed front exit cone
        (0.285,  0.82),  # Internal flash expansion chamber
        (0.285, -0.52),
        (0.325, -0.58),  # Barrel muzzle stop shoulder
        (0.325, -1.15),
    ]
    raw_tulip = mk_lathe_x("fh_raw", tulip_prof, segs=36, mat=m_tul)

    # 4 rear check-nut wrench flats + 3 deep 120-deg flash slots + 3 front wire-cutter crown V-notches
    cutters = [
        mk_box("c_fl1", 0.42, 0.18, 0.86, [("t", -0.88,  0.53, 0.0)], m_sl),
        mk_box("c_fl2", 0.42, 0.18, 0.86, [("t", -0.88, -0.53, 0.0)], m_sl),
        mk_box("c_fl3", 0.42, 0.72, 0.18, [("t", -0.88,  0.0,  0.53)], m_sl),
        mk_box("c_fl4", 0.42, 0.72, 0.18, [("t", -0.88,  0.0, -0.53)], m_sl),
    ]
    for k in range(3):
        ang = (k * math.pi * 2.0) / 3.0 + math.pi / 6.0
        cutters.append(mk_box(f"c_sl_{k}", 0.84, 0.30, 0.17, [("t", 0.36, 0.38, 0.0), ("rx", ang)], m_sl))
        cutters.append(mk_box(f"c_vn_{k}", 0.12, 0.18, 0.085, [("t", 1.08, 0.38, 0.0), ("rx", ang + math.pi / 3.0)], m_sl))

    slotted = bool_subtract(raw_tulip, cutters, solver="EXACT")

    # Knurled 22mm grenade collar + captive wire retention spring ring
    knurl = mk_knurled_cyl("fh_knl", 0.542, 0.26, "x", flutes=22, depth=0.012, xform=[("t", -0.33, 0.0, 0.0)], mat=m_nit)
    clip_ring = mk_torus("fh_clip", 0.525, 0.025, "x", 30, 10, [("t", -0.33, 0.0, 0.0)], m_ss)

    obj = join_objects([slotted, knurl, clip_ring], "aug_flash_hider")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_gas_block(mats: dict) -> bpy.types.Object:
    """U-03: Offset 45-Deg Tilted Gas Block & Foregrip Hinge Clevis (pos: [8.85, 1.05, 0])."""
    m_nit = mats["M_NitrideSteel"]
    m_cst = mats["M_CastCarrierSteel"]
    m_ss  = mats["M_BrushedStainless"]
    m_sl  = mats["M_SlotDark"]

    clamp = mk_cyl("gb_clmp", 0.62, 0.62, 1.88, "x", 30, [], m_nit, bevel=0.024)
    web = mk_box("gb_web", 1.68, 0.94, 0.46, [("rx", -0.76), ("t", -0.08, 0.24, 0.26)], m_cst, bevel=0.024)
    gas_cyl = mk_cyl("gb_gcyl", 0.42, 0.44, 3.75, "x", 28, [("t", -0.825, 0.47, 0.52)], m_nit, bevel=0.024)
    strut = mk_box("gb_strt", 1.18, 0.96, 0.88, [("t", 0.0, -0.68, 0.0)], m_cst, bevel=0.024)
    solid = bool_union([clamp, web, gas_cyl, strut], "gb_solid", solver="EXACT")

    hollowed = bool_subtract(
        solid,
        [
            mk_cyl("c_gb_b", 0.49, 0.49, 2.20, "x", 26, [], m_sl),
            mk_cyl("c_gb_p", 0.30, 0.30, 4.10, "x", 24, [("t", -0.82, 0.47, 0.52)], m_sl),
            mk_cyl("c_gb_v", 0.08, 0.08, 0.44, "z", 14, [("t",  0.18, 0.47, 0.84)], m_sl),
        ],
        solver="EXACT",
    )
    parts = [
        hollowed,
        mk_cyl("gb_earL", 0.39, 0.39, 0.19, "z", 24, [("t", 0.0, -1.23, -0.44)], m_cst, bevel=0.022),
        mk_cyl("gb_earR", 0.39, 0.39, 0.19, "z", 24, [("t", 0.0, -1.23,  0.44)], m_cst, bevel=0.022),
        mk_cyl("gb_pinF", 0.075, 0.075, 1.18, "z", 16, [("t",  0.52, -0.48, 0.0)], m_ss, bevel=0.010),
        mk_cyl("gb_pinR", 0.075, 0.075, 1.18, "z", 16, [("t", -0.52, -0.48, 0.0)], m_ss, bevel=0.010),
    ]
    obj = join_objects(parts, "aug_gas_block")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_gas_regulator(mats: dict) -> bpy.types.Object:
    """U-04: 3-Position Fluted Stainless & Winged Gas Regulator Plug (N / A / GR) (pos: [10.05, 1.52, 0.52])."""
    m_ss  = mats["M_BrushedStainless"]
    m_chm = mats["M_ChromeMirror"]
    m_nit = mats["M_NitrideSteel"]
    m_wng = mats["M_GasWingOlive"]
    m_wh  = mats["M_RegDotWhite"]
    m_rd  = mats["M_RegDotRed"]
    m_sl  = mats["M_SlotDark"]

    stem = bool_subtract(
        mk_cyl("gr_stem", 0.28, 0.28, 0.98, "x", 26, [("t", -0.24, 0.0, 0.0)], m_ss, bevel=0.016),
        [
            mk_cyl("c_gr_in",  0.18,  0.18,  0.74, "x", 20, [("t", -0.42, 0.0, 0.0)], m_sl),
            mk_cyl("c_gr_p1",  0.065, 0.065, 0.65, "y", 14, [("t", -0.32, 0.0, 0.0)], m_sl),
            mk_cyl("c_gr_p2",  0.095, 0.095, 0.65, "y", 14, [("rx", math.pi / 3.0), ("t", -0.32, 0.0, 0.0)], m_sl),
        ],
        solver="EXACT",
    )
    front_cap = mk_knurled_cyl("gr_cap", 0.415, 0.42, "x", flutes=18, depth=0.018, xform=[("t", 0.32, 0.0, 0.0)], mat=m_nit)
    parts = [
        stem,
        front_cap,
        mk_cyl("gr_det",  0.055, 0.055, 0.28, "x", 14, [("t", 0.04,  0.34, 0.0)], m_chm, bevel=0.008),
        mk_box("gr_wTop", 0.38, 0.36, 0.18, [("rz", -0.12), ("t", 0.35,  0.50, 0.0)], m_wng, bevel=0.026),
        mk_box("gr_wBot", 0.38, 0.36, 0.18, [("rz",  0.12), ("t", 0.35, -0.50, 0.0)], m_wng, bevel=0.026),
        # 3 setting index dots: Small White (N), Large White (A), Crimson (GR grenade cutoff)
        mk_sphere("gr_dotN", 0.042, 0.042, 0.042, 12, 8, [("t", 0.53,  0.22, 0.16)], m_wh),
        mk_sphere("gr_dotA", 0.052, 0.052, 0.052, 12, 8, [("t", 0.53,  0.00, 0.26)], m_wh),
        mk_sphere("gr_dotG", 0.046, 0.046, 0.046, 12, 8, [("t", 0.53, -0.22, 0.16)], m_rd),
    ]
    obj = join_objects(parts, "aug_gas_regulator")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_gas_piston(mats: dict) -> bpy.types.Object:
    """U-05: Mirror-Chrome Short-Stroke Gas Piston, 3 Seal Rings & Return Spring (pos: [7.85, 1.52, 0.52])."""
    m_chm = mats["M_ChromeMirror"]
    m_nit = mats["M_NitrideSteel"]
    m_sp  = mats["M_DarkSpringSteel"]

    piston_prof = [
        (0.000, -1.70),
        (0.180, -1.70),
        (0.180,  0.42),
        (0.285,  0.58),
        (0.285,  0.74),
        (0.225,  0.78),
        (0.225,  0.86),
        (0.285,  0.90),
        (0.285,  1.06),
        (0.225,  1.10),
        (0.225,  1.18),
        (0.285,  1.22),
        (0.285,  1.38),
        (0.225,  1.42),
        (0.225,  1.48),
        (0.290,  1.52),
        (0.290,  1.65),
        (0.180,  1.65),
        (0.160,  1.48),
        (0.000,  1.48),
    ]
    piston = mk_lathe_x("gp_body", piston_prof, segs=32, mat=m_chm)
    parts = [piston]
    for gx in (0.82, 1.14, 1.45):
        parts.append(mk_torus(f"gp_rng_{gx}", 0.268, 0.024, "x", 26, 10, [("t", gx, 0.0, 0.0)], m_nit))
    parts.append(mk_coil_spring("gp_spr", "x", -1.45, 0.42, 0.0, 0.0, 0.24, 0.030, 8.0, 8, 14, mat=m_sp))

    obj = join_objects(parts, "aug_gas_piston")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_aug_bolt_carrier(mats: dict) -> bpy.types.Object:
    """U-06: Compact Steel Bolt Carrier w/ Iconic Twin Parallel Mirror-Chrome Guide Rods (pos: [-9.20, 1.18, 0])."""
    m_cst = mats["M_CastCarrierSteel"]
    m_nit = mats["M_NitrideSteel"]
    m_chm = mats["M_ChromeMirror"]
    m_ss  = mats["M_BrushedStainless"]
    m_sl  = mats["M_SlotDark"]

    carrier_blk = mk_box("bc_blk", 3.60, 1.12, 1.34, [("t", -0.05, -0.04, 0.0)], m_cst, bevel=0.028)
    boss_l = mk_cyl("bc_bsL", 0.27, 0.27, 3.68, "x", 24, [("t", -0.02, 0.34, -0.52)], m_nit, bevel=0.020)
    boss_r = mk_cyl("bc_bsR", 0.27, 0.27, 3.68, "x", 24, [("t", -0.02, 0.34,  0.52)], m_nit, bevel=0.020)
    carrier_u = bool_union([carrier_blk, boss_l, boss_r], "bc_union", solver="EXACT")

    sculpted = bool_subtract(
        carrier_u,
        [
            mk_cyl("c_bc_bt",  0.41, 0.41, 4.10, "x", 26, [("t",  0.00, -0.13,  0.00)], m_sl),
            mk_box("c_bc_cam", 1.28, 0.36, 0.56, [("ry", 0.48), ("t", 0.42, 0.24, 0.18)], m_sl),
            mk_box("c_bc_fl",  3.80, 0.24, 0.56, [("t",  0.00, -0.54,  0.00)], m_sl),
            mk_cyl("c_bc_sL",  0.19, 0.19, 1.24, "x", 18, [("t", -1.45,  0.34, -0.52)], m_sl),
            mk_cyl("c_bc_sR",  0.19, 0.19, 1.24, "x", 18, [("t", -1.45,  0.34,  0.52)], m_sl),
        ],
        solver="EXACT",
    )

    # Iconic Twin Parallel Gleaming Chrome Tubular Guide Rods extending forward to local X = +15.35!
    parts = [
        sculpted,
        mk_cyl("bc_rodR",   0.185, 0.185, 13.65, "x", 24, [("t",  8.52,  0.34,  0.52)], m_chm, bevel=0.016),
        mk_cyl("bc_rodL",   0.185, 0.185, 13.65, "x", 24, [("t",  8.52,  0.34, -0.52)], m_chm, bevel=0.016),
        mk_cyl("bc_anvilR", 0.210, 0.190,  0.38, "x", 22, [("t", 15.16,  0.34,  0.52)], m_nit, bevel=0.018),
        mk_cyl("bc_shutL",  0.245, 0.245,  0.56, "x", 22, [("t", 12.20,  0.34, -0.52)], m_nit, bevel=0.020),
        mk_cyl("bc_roller", 0.210, 0.210,  0.58, "z", 22, [("t", -1.68, -0.48,  0.00)], m_ss,  bevel=0.018),
    ]
    obj = join_objects(parts, "aug_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_bolt(mats: dict) -> bpy.types.Object:
    """U-07: Bright Chrome 7-Lug Rotating Bolt Head, Claw Extractor, Plunger Ejector & Cam Pin (pos: [-8.05, 1.05, 0])."""
    m_chm = mats["M_ChromeMirror"]
    m_ss  = mats["M_BrushedStainless"]
    m_nit = mats["M_NitrideSteel"]
    m_sp  = mats["M_DarkSpringSteel"]
    m_sl  = mats["M_SlotDark"]

    bolt_prof = [
        (0.140, -2.175),
        (0.380, -2.175),
        (0.380, -0.125),
        (0.290, -0.100),
        (0.290,  0.020),
        (0.265,  0.040),
        (0.265,  0.110),
        (0.290,  0.130),
        (0.290,  0.200),
        (0.365,  0.220),
        (0.365,  0.850),
        (0.265,  0.850),
        (0.245,  0.825),
        (0.245,  0.700),
        (0.055,  0.700),
        (0.055, -0.450),
        (0.140, -0.550),
        (0.140, -2.175),
    ]
    core_raw = mk_lathe_x("bt_core", bolt_prof, segs=36, mat=m_ss)
    core = bool_subtract(
        core_raw,
        [
            mk_box("c_bt_ext", 0.96, 0.20, 0.22, [("t", 0.40, 0.0, 0.34)], m_sl),
            mk_cyl("c_bt_ej",  0.062, 0.062, 0.42, "x", 16, [("t", 0.66, -0.06, -0.14)], m_sl),
        ],
        solver="EXACT",
    )

    parts = [
        core,
        # Dark parkerized rear cam-sleeve jacket over X in [-2.17, -0.13]
        mk_lathe_x("bt_slv", [(0.376, -2.17), (0.383, -2.17), (0.383, -0.13), (0.376, -0.13), (0.376, -2.17)], 32, mat=m_nit),
    ]
    # 7 radial chamfered mirror-chrome locking lugs (k=1..7; k=0 at +Z right is claw extractor!)
    for k in range(1, 8):
        ang = math.pi * 0.5 + (k * math.pi * 2.0) / 8.0
        parts.append(mk_arc_lug(f"bt_lug_{k}", 0.345, 0.510, ang, math.radians(24.0), 0.38, 0.47, 5, 0.018, m_chm))

    # Wide spring-loaded Steyr claw extractor on +Z right flank + chrome hook + pivot pin + spring
    claw_xy = [(-0.14, -0.085), (0.82, -0.085), (0.895, -0.035), (0.895, 0.055), (0.82, 0.085), (-0.14, 0.085)]
    parts.append(mk_extrude_z("bt_extb", claw_xy, 0.35, 0.51, bevel=0.014, bevel_segs=2, mat=m_nit))
    parts.append(mk_box("bt_exth", 0.11, 0.17, 0.16, [("t", 0.84, 0.0, 0.31)], m_chm, bevel=0.014))
    parts.append(mk_cyl("bt_extp", 0.048, 0.048, 0.34, "y", 14, [("t", 0.32, 0.0, 0.41)], m_ss, bevel=0.008))
    parts.append(mk_coil_spring("bt_exts", "z", 0.25, 0.36, 0.02, 0.0, 0.055, 0.013, 4.0, 6, 10, mat=m_sp))

    # Left-lower (-Z) spring plunger ejector w/ domed chrome face + cross roll-pin
    ej_prof = [(0.0, 0.56), (0.048, 0.56), (0.048, 0.81), (0.034, 0.845), (0.0, 0.845)]
    parts.append(mk_lathe_x("bt_ejp", ej_prof, 18, [("t", 0.0, -0.06, -0.14)], m_chm))
    parts.append(mk_cyl("bt_ejr", 0.032, 0.032, 0.42, "y", 12, [("t", 0.52, -0.06, -0.14)], m_nit))

    # Stepped helical cam pin & chrome carrier-track shoe
    parts.append(mk_cyl("bt_cpin", 0.145, 0.145, 0.62, "y", 22, [("t", -0.55, 0.43, 0.0)], m_ss, bevel=0.016))
    parts.append(mk_box("bt_csho", 0.26, 0.18, 0.25, [("t", -0.55, 0.58, 0.0)], m_chm, bevel=0.018))

    obj = join_objects(parts, "aug_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_firing_pin(mats: dict) -> bpy.types.Object:
    """U-08: Stepped Stainless/Chrome Long Firing Pin (pos: [-9.45, 1.05, 0], X in [-2.05, +2.05])."""
    m_chm = mats["M_ChromeMirror"]
    m_ss  = mats["M_BrushedStainless"]

    fp_prof = [
        (0.000, -2.05),
        (0.165, -2.05),
        (0.165, -1.65),
        (0.110, -1.60),
        (0.110,  0.45),
        (0.170,  0.50),
        (0.170,  0.72),
        (0.090,  0.80),
        (0.075,  1.65),
        (0.032,  2.03),
        (0.000,  2.05),
    ]
    pin = mk_lathe_x("fp_lathe", fp_prof, segs=24, mat=m_chm)
    flat_ring = mk_box("fp_flat", 0.32, 0.16, 0.22, [("t", 0.88, -0.02, 0.0)], m_ss, bevel=0.014)
    obj = join_objects([pin, flat_ring], "aug_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_aug_transfer_bars(mats: dict) -> bpy.types.Object:
    """FC-03: Twin Parallel Brushed Stainless 14.3cm Trigger Transfer Bars (pos: [-6.60, -1.25, 0])."""
    m_ss  = mats["M_BrushedStainless"]
    m_nit = mats["M_NitrideSteel"]

    bar_xy = [
        ( 6.95, -0.56),
        ( 6.95, -0.34),
        ( 3.20, -0.34),
        ( 2.10,  0.33),
        (-7.35,  0.33),
        (-7.35,  0.11),
        ( 1.95,  0.11),
        ( 3.05, -0.56),
    ]
    parts = [
        mk_box("tb_fyok",  0.52, 0.38, 1.28, [("t",  6.82, -0.45, 0.0)], m_nit, bevel=0.022),
        mk_cyl("tb_cscr",  0.09, 0.09, 0.32, "x", 16, [("t",  7.08, -0.45, 0.0)], m_ss, bevel=0.012),
        mk_extrude_z("tb_barL", bar_xy, -0.625, -0.530, bevel=0.014, bevel_segs=1, mat=m_ss),
        mk_extrude_z("tb_barR", bar_xy,  0.530,  0.625, bevel=0.014, bevel_segs=1, mat=m_ss),
        mk_box("tb_rbrg",  0.52, 0.36, 1.26, [("t", -7.15,  0.22, 0.0)], m_nit, bevel=0.022),
        mk_cyl("tb_rnut",  0.12, 0.12, 0.24, "x", 6,  [("t", -7.42,  0.22, 0.0)], m_ss, bevel=0.012),
    ]
    obj = join_objects(parts, "aug_transfer_bars")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_aug_mag_spring(mats: dict) -> bpy.types.Object:
    """M-03: Curved Dark Spring-Steel Rectangular-Oval Magazine Coil Spring (pos: [-9.95, 0.45, 0])."""
    m_sp = mats["M_DarkSpringSteel"]
    coils = 8.5
    steps_per_coil = 20
    total_steps = int(round(coils * steps_per_coil))
    r_mid = 0.5 * (AUG_MAG_R_INNER + AUG_MAG_R_OUTER)
    pts: list[Vector] = []
    for i in range(total_steps + 1):
        u = i / total_steps
        ang = 0.382 + u * 0.086
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        rad_off = (1.0 if ct >= 0 else -1.0) * (abs(ct) ** 0.6) * 0.70
        z_off = (1.0 if st >= 0 else -1.0) * (abs(st) ** 0.6) * 0.28
        r_cur = r_mid + rad_off
        px = AUG_MAG_ARC_CX - math.cos(ang) * r_cur
        py = AUG_MAG_ARC_CY - math.sin(ang) * r_cur
        pts.append(Vector((px, py, z_off)))
    obj = mk_tube_along_pts("aug_mag_spring", pts, 0.035, ring_segs=8, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=45.0, weighted_normals=False)


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
    assert span_u > 0.48 and span_v > 0.48, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_stock_atlas(stock_objs: list[bpy.types.Object]):
    """Unwraps 10 stock/furniture/magazine/hammer-pack parts into `aug_v3_stock` (2048x2048):
      - Hero Band 1A (Stock Left  Buttstock Flank -Z):  u in [0.015, 0.490], v in [0.765, 0.985]
      - Hero Band 1B (Stock Right Buttstock Flank +Z):  u in [0.510, 0.985], v in [0.765, 0.985]
      - Hero Band 2A (Waffle Mag Right Window Flank +Z): u in [0.015, 0.235], v in [0.350, 0.745]
      - Hero Band 2B (Waffle Mag Left  Window Flank -Z): u in [0.250, 0.470], v in [0.350, 0.745]
      - Packed Stock Rest + Folding Foregrip:           u in [0.490, 0.990], v in [0.350, 0.745]
      - Packed Buttpad, Trigger, Safety, Floorplate:    u in [0.010, 0.560], v in [0.010, 0.335]
      - Packed Mag Non-Hero (3D Waffle Ribs, Feed Lips):u in [0.575, 0.775], v in [0.010, 0.335]
      - Firewalled Tan Autolube Hammer Pack + Follower: u in [0.790, 0.990], v in [0.010, 0.335]
    """
    def is_stock_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "aug_stock" or mat_name != "S_ODGreenStock":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -17.28 <= tx <= -2.52 and -3.55 <= ty <= 1.98:
            if nz > 0.90 and 0.84 <= tz <= 0.91:
                return True
            if nz < -0.90 and -0.91 <= tz <= -0.84:
                return True
        return False

    def is_mag_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "aug_mag_body" or mat_name != "S_MagAmberBody":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.90 and 0.54 <= tz <= 0.59:
            return True
        if nz < -0.90 and -0.59 <= tz <= -0.54:
            return True
        return False

    od_grp = [o for o in stock_objs if o.name in {"aug_stock", "aug_foregrip"}]
    blk_grp = [o for o in stock_objs if o.name in {"aug_buttpad", "aug_trigger", "aug_safety", "aug_mag_floorplate"}]
    mag_grp = [o for o in stock_objs if o.name == "aug_mag_body"]
    hp_grp = [o for o in stock_objs if o.name in {"aug_hammer_pack", "aug_hammer", "aug_mag_follower"}]

    _smart_unwrap_and_pack_rect(od_grp,  0.490, 0.990, 0.350, 0.745, skip_face_fn=is_stock_hero)
    _smart_unwrap_and_pack_rect(blk_grp, 0.010, 0.560, 0.010, 0.335)
    _smart_unwrap_and_pack_rect(mag_grp, 0.575, 0.775, 0.010, 0.335, skip_face_fn=is_mag_hero)
    _smart_unwrap_and_pack_rect(hp_grp,  0.790, 0.990, 0.010, 0.335)

    # 1. Project exact world-space 1:1 hero UVs onto Bullpup Stock Left & Right Buttstock Flanks
    st = next(o for o in stock_objs if o.name == "aug_stock")
    bm = bmesh.new()
    bm.from_mesh(st.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in st.data.materials]
    st_cnt, st_area = 0, 0.0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_stock_hero("aug_stock", f, mname):
            continue
        st_cnt += 1
        st_area += f.calc_area()
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-17.25)) / 14.70))
            yn = max(0.0, min(1.0, (ty - (-3.55)) / 5.50))
            if is_right:
                loop[uv_layer].uv = (0.510 + xn * 0.475, 0.765 + yn * 0.220)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.475, 0.765 + yn * 0.220)
    bm.to_mesh(st.data)
    bm.free()
    print(f"  [UV-HERO] aug_stock mapped {st_cnt} buttstock hero faces (area={st_area:.2f} cm^2)")
    assert st_cnt >= 2 and st_area > 80.0, f"Stock hero flanks missed! cnt={st_cnt}, area={st_area:.2f}"

    # 2. Project exact curved-arc polar hero UVs onto Smoked Amber Waffle Mag Left & Right Window Flanks
    mag = next(o for o in stock_objs if o.name == "aug_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    mg_cnt, mg_area = 0, 0.0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero("aug_mag_body", f, mname):
            continue
        mg_cnt += 1
        mg_area += f.calc_area()
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            dx = tx - AUG_MAG_ARC_CX
            dy = ty - AUG_MAG_ARC_CY
            rad = math.hypot(dx, dy)
            ang = math.atan2(-dy, -dx)
            s_norm = max(0.0, min(1.0, (ang - AUG_MAG_ANG_START) / (AUG_MAG_ANG_END - AUG_MAG_ANG_START)))
            # fwd_norm = 0 at rear spine (-X, R_OUTER), 1 at front spine (+X, R_INNER)
            fwd_norm = max(0.0, min(1.0, 1.0 - (rad - AUG_MAG_R_INNER) / (AUG_MAG_R_OUTER - AUG_MAG_R_INNER)))
            v_uv = 0.745 - s_norm * 0.395
            if is_right:
                u_uv = 0.015 + fwd_norm * 0.220
            else:
                u_uv = 0.250 + (1.0 - fwd_norm) * 0.220
            loop[uv_layer].uv = (u_uv, v_uv)
    bm.to_mesh(mag.data)
    bm.free()
    print(f"  [UV-HERO] aug_mag_body mapped {mg_cnt} curved amber window faces (area={mg_area:.2f} cm^2)")
    assert mg_cnt >= 2 and mg_area > 30.0, f"Waffle mag hero flanks missed! cnt={mg_cnt}, area={mg_area:.2f}"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 4 receiver/optic/control parts into `aug_v3_receiver` (2048x2048):
      - Hero Band 1A (Receiver Left  Wall -Z):     u in [0.015, 0.680], v in [0.815, 0.985]
      - Hero Band 1B (Receiver Right Wall +Z):     u in [0.015, 0.680], v in [0.635, 0.805]
      - Hero Band 2A (Swarovski Scope Left  -Z):   u in [0.015, 0.680], v in [0.505, 0.620]
      - Hero Band 2B (Swarovski Scope Right +Z):   u in [0.015, 0.680], v in [0.380, 0.495]
      - Firewalled Front Objective Lens (+X):      u in [0.710, 0.890], v in [0.805, 0.985]
      - Firewalled Rear Ocular Lens (-X):          u in [0.900, 0.985], v in [0.900, 0.985]
      - Firewalled Lens Back Hemispheres:          u in [0.900, 0.985], v in [0.805, 0.890]
      - Packed Receiver/Optic/Trunnion Rest:       u in [0.010, 0.685], v in [0.010, 0.365]
      - Packed Controls (Handle, Lock, Pin):       u in [0.705, 0.990], v in [0.010, 0.785]
    """
    def classify_recv_face(obj_name: str, face, mat_name: str) -> str:
        if obj_name != "aug_receiver_optic":
            return ""
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if mat_name == "R_CoatedLens":
            if tx > 0.0:
                return "lens_front" if nx >= 0.0 else "lens_back"
            return "lens_rear" if nx <= 0.0 else "lens_back"

        if mat_name == "R_ReceiverEnamel":
            if -2.52 <= tx <= 5.87 and 0.40 <= ty <= 2.08:
                if nz > 0.90 and 0.79 <= tz <= 0.86:
                    return "rec_right"
                if nz < -0.90 and -0.86 <= tz <= -0.79:
                    return "rec_left"

        if mat_name == "R_ScopeTube":
            if -4.46 <= tx <= 5.86 and 3.30 <= ty <= 4.46 and abs(ny) < 0.62:
                if nz > 0.58 and tz > 0.32:
                    return "scope_right"
                if nz < -0.58 and tz < -0.32:
                    return "scope_left"
        return ""

    def is_recv_hero(obj_name: str, face, mat_name: str) -> bool:
        return classify_recv_face(obj_name, face, mat_name) != ""

    rec_grp = [o for o in recv_objs if o.name == "aug_receiver_optic"]
    ctrl_grp = [o for o in recv_objs if o.name != "aug_receiver_optic"]

    _smart_unwrap_and_pack_rect(rec_grp,  0.010, 0.685, 0.010, 0.365, skip_face_fn=is_recv_hero)
    _smart_unwrap_and_pack_rect(ctrl_grp, 0.705, 0.990, 0.010, 0.785)

    rec = next(o for o in recv_objs if o.name == "aug_receiver_optic")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rec.data.materials]
    counts = {"rec_left": 0, "rec_right": 0, "scope_left": 0, "scope_right": 0, "lens_front": 0, "lens_rear": 0, "lens_back": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_recv_face("aug_receiver_optic", f, mname)
        if not tag:
            continue
        counts[tag] += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            if tag == "rec_left":
                xn = max(0.0, min(1.0, (tx - (-2.50)) / 8.35))
                yn = max(0.0, min(1.0, (ty - 0.42) / 1.64))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.665, 0.815 + yn * 0.170)
            elif tag == "rec_right":
                xn = max(0.0, min(1.0, (tx - (-2.50)) / 8.35))
                yn = max(0.0, min(1.0, (ty - 0.42) / 1.64))
                loop[uv_layer].uv = (0.015 + xn * 0.665, 0.635 + yn * 0.170)
            elif tag == "scope_left":
                xn = max(0.0, min(1.0, (tx - (-4.45)) / 10.30))
                yn = max(0.0, min(1.0, (ty - 3.26) / 1.24))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.665, 0.505 + yn * 0.115)
            elif tag == "scope_right":
                xn = max(0.0, min(1.0, (tx - (-4.45)) / 10.30))
                yn = max(0.0, min(1.0, (ty - 3.26) / 1.24))
                loop[uv_layer].uv = (0.015 + xn * 0.665, 0.380 + yn * 0.115)
            elif tag == "lens_front":
                un = max(-1.0, min(1.0, tz / 0.50))
                vn = max(-1.0, min(1.0, (ty - 3.88) / 0.50))
                loop[uv_layer].uv = (0.800 + un * 0.086, 0.895 + vn * 0.086)
            elif tag == "lens_rear":
                un = max(-1.0, min(1.0, tz / 0.50))
                vn = max(-1.0, min(1.0, (ty - 3.88) / 0.50))
                loop[uv_layer].uv = (0.9425 + un * 0.040, 0.9425 + vn * 0.040)
            elif tag == "lens_back":
                un = max(-1.0, min(1.0, tz / 0.52))
                vn = max(-1.0, min(1.0, (ty - 3.88) / 0.52))
                loop[uv_layer].uv = (0.9425 + un * 0.036, 0.8475 + vn * 0.036)
    bm.to_mesh(rec.data)
    bm.free()
    print(f"  [UV-HERO] aug_receiver_optic hero face counts: {counts}")
    assert counts["rec_left"] >= 1 and counts["rec_right"] >= 1, f"Receiver hero flanks missed: {counts}"
    assert counts["lens_front"] >= 20 and counts["lens_rear"] >= 20, f"Swarovski lenses missed: {counts}"


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 10 barrel/gas/bolt/carrier/internal metal parts into `aug_v3_metal` (2048x2048):
      - Barrel + Tulip Flash Hider + Gas Block + Regulator: u in [0.010, 0.990], v in [0.510, 0.990]
      - Twin-Rod Carrier + 7-Lug Bolt + Piston + Firing Pin:u in [0.010, 0.990], v in [0.165, 0.495]
      - Dual Transfer Bars + Curved Magazine Coil Spring:   u in [0.010, 0.990], v in [0.010, 0.150]
    """
    brl_grp = [o for o in metal_objs if o.name in {"aug_barrel", "aug_flash_hider", "aug_gas_block", "aug_gas_regulator"}]
    act_grp = [o for o in metal_objs if o.name in {"aug_bolt_carrier", "aug_bolt", "aug_gas_piston", "aug_firing_pin"}]
    int_grp = [o for o in metal_objs if o.name in {"aug_transfer_bars", "aug_mag_spring"}]

    _smart_unwrap_and_pack_rect(brl_grp, 0.010, 0.990, 0.510, 0.990)
    _smart_unwrap_and_pack_rect(act_grp, 0.010, 0.990, 0.165, 0.495)
    _smart_unwrap_and_pack_rect(int_grp, 0.010, 0.990, 0.010, 0.150)


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


def _three_rot_to_blender_euler(rot_three: tuple[float, float, float]) -> Euler:
    rx, ry, rz = rot_three
    m_three = Euler((rx, ry, rz), "XYZ").to_matrix().to_4x4()
    m_b = T2B_MAT @ m_three @ B2T_MAT
    return m_b.to_euler("XYZ")


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
            o.rotation_euler = _three_rot_to_blender_euler(ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0)))
        else:
            o.hide_render = True
            o.location = (0.0, 220.0, 0.0)


def _set_assembled_full_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = _three_rot_to_blender_euler(ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0)))


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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.045, 0.052, 0.042, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.65
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


def _render_studio_previews(all_objs: list[bpy.types.Object], preview_dir: Path):
    """Renders quick Cycles verification shots using the final baked v3 WebP PBR suites."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.28
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
        tex_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"aug_v3_{suite}_albedo.webp"))
        tex_alb.image.colorspace_settings.name = "sRGB"

        tex_orm = nt.nodes.new("ShaderNodeTexImage")
        tex_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"aug_v3_{suite}_roughness.webp"))
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
        tex_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"aug_v3_{suite}_normal.webp"))
        tex_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_st = mk_baked_mat("stock", 0.90)
    mat_rc = mk_baked_mat("receiver", 0.88)
    mat_mt = mk_baked_mat("metal", 0.85)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in STOCK_PARTS:
            o.data.materials.append(mat_st)
        elif o.name in RECEIVER_PARTS:
            o.data.materials.append(mat_rc)
        else:
            o.data.materials.append(mat_mt)

    _set_assembled_full_layout(all_objs)

    w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "studio_dark_armory.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.65
    else:
        w_bg.inputs["Color"].default_value = (0.14, 0.16, 0.18, 1.0)
        w_bg.inputs["Strength"].default_value = 1.0
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    for lname, loc_t, energy, size in (
        ("KeyLight",  ( 10.0, 22.0,  26.0), 16000.0, 20.0),
        ("FillLight", (-10.0, 12.0, -26.0), 11000.0, 22.0),
        ("RimLight",  ( 16.0, 22.0, -14.0), 13000.0, 16.0),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc_t)
        d = t2b(0.0, 0.0, 0.0) - lobj.location
        lobj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    shots = [
        ("aug_iso_right.png",      ( 14.0,  8.5,  54.0), (  1.5, -0.8, 0.0), 46.0),
        ("aug_left_hero.png",      ( -2.0,  2.2, -32.0), ( -3.5,  0.6, 0.0), 50.0),
        ("aug_waffle_mag.png",     ( -7.5, -4.2,  14.5), ( -9.2, -4.4, 0.0), 58.0),
        ("aug_optic_lens.png",     ( 13.5,  4.8,   5.8), (  3.5,  3.5, 0.0), 62.0),
        ("aug_left_receiver.png",  (  1.8,  2.2, -16.5), (  1.5,  2.0, 0.0), 56.0),
        ("aug_muzzle_gas.png",     ( 23.0,  4.5,  14.0), ( 13.5,  0.8, 0.0), 52.0),
    ]
    for fname, cpos, ctgt, lens in shots:
        cam_data.lens = lens
        cam_obj.location = t2b(*cpos)
        direction = t2b(*ctgt) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(preview_dir / fname)
        bpy.ops.render.render(write_still=True)
        print(f"[PREVIEW] Rendered {preview_dir / fname}")

    # Also render a quick internal showcase shot (twin-rod bolt carrier, 7-lug bolt, tan hammer pack & piston!)
    internal_show = {"aug_bolt_carrier", "aug_bolt", "aug_firing_pin", "aug_gas_piston", "aug_hammer_pack", "aug_hammer", "aug_transfer_bars"}
    for o in all_objs:
        o.hide_render = o.name not in internal_show
    cam_data.lens = 50.0
    cam_obj.location = t2b(-6.0, 7.0, 28.0)
    cam_obj.rotation_euler = (t2b(-4.0, 0.5, 0.0) - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(preview_dir / "aug_internals_showcase.png")
    bpy.ops.render.render(write_still=True)
    print(f"[PREVIEW] Rendered {preview_dir / 'aug_internals_showcase.png'}")
    for o in all_objs:
        o.hide_render = False


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: aug_v3_stock (10 parts)
        "aug_stock":           build_aug_stock,
        "aug_buttpad":         build_aug_buttpad,
        "aug_foregrip":        build_aug_foregrip,
        "aug_trigger":         build_aug_trigger,
        "aug_safety":          build_aug_safety,
        "aug_mag_body":        build_aug_mag_body,
        "aug_mag_follower":    build_aug_mag_follower,
        "aug_mag_floorplate":  build_aug_mag_floorplate,
        "aug_hammer_pack":     build_aug_hammer_pack,
        "aug_hammer":          build_aug_hammer,
        # Suite 2: aug_v3_receiver (4 parts)
        "aug_receiver_optic":  build_aug_receiver_optic,
        "aug_charging_handle": build_aug_charging_handle,
        "aug_barrel_lock":     build_aug_barrel_lock,
        "aug_takedown_pin":    build_aug_takedown_pin,
        # Suite 3: aug_v3_metal (10 parts)
        "aug_barrel":          build_aug_barrel,
        "aug_flash_hider":     build_aug_flash_hider,
        "aug_gas_block":       build_aug_gas_block,
        "aug_gas_regulator":   build_aug_gas_regulator,
        "aug_gas_piston":      build_aug_gas_piston,
        "aug_bolt_carrier":    build_aug_bolt_carrier,
        "aug_bolt":            build_aug_bolt,
        "aug_firing_pin":      build_aug_firing_pin,
        "aug_transfer_bars":   build_aug_transfer_bars,
        "aug_mag_spring":      build_aug_mag_spring,
    }

    print("[BUILD] Sculpting all 24 solid Steyr AUG A1 (5.56x45mm NATO) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    stock_objs = [built[pid] for pid in STOCK_PARTS]
    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs = stock_objs + recv_objs + metal_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: stock (10), receiver (4), metal (10)...")
    unwrap_stock_atlas(stock_objs)
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("stock", stock_objs), ("receiver", recv_objs), ("metal", metal_objs)):
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

    with tempfile.TemporaryDirectory(prefix="aug_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking aug_v3_stock (2048x2048, 10 OD-green stock/waffle-mag/hammer-pack parts)...")
        bake_atlas_suite("stock", stock_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking aug_v3_receiver (2048x2048, 4 enamel receiver/Swarovski optic/control parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking aug_v3_metal (2048x2048, 10 CHF barrel/tulip/gas/twin-rod bolt parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)

        print("[POST] Compositing Steyr stock cartouches, smoked waffle-mag 5.56 brass rounds, Swarovski lenses & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--render-preview" in sys.argv:
        pidx = sys.argv.index("--render-preview")
        _render_studio_previews(all_objs, Path(sys.argv[pidx + 1]))

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "aug_v3_stock_albedo.webp",
        TEX_OUT_DIR / "aug_v3_stock_normal.webp",
        TEX_OUT_DIR / "aug_v3_stock_roughness.webp",
        TEX_OUT_DIR / "aug_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "aug_v3_receiver_normal.webp",
        TEX_OUT_DIR / "aug_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "aug_v3_metal_albedo.webp",
        TEX_OUT_DIR / "aug_v3_metal_normal.webp",
        TEX_OUT_DIR / "aug_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== STEYR AUG A1 (5.56x45mm NATO) V3 ASSET BUDGET ===")
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
