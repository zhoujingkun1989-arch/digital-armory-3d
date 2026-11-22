#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for U.S. Army M1A2 SEP v3 Abrams MBT
====================================================================================
MIT License — Digital Armory 3D (`WP-18` BAY-25: 120mm L/44 M256 + Blast-Door Bustle + AGT1500 Turbine)

Generates:
  - public/models/m1a2.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `m1a2_recoil_springs` and `m1a2_door_spring`
    carrying `aSpringParam` on the CSG track)
  - public/textures/m1a2_v3_hull_armor_{albedo,normal,roughness}.webp      (4096x4096 5-Ch Packed ORM)
  - public/textures/m1a2_v3_turret_gun_{albedo,normal,roughness}.webp      (4096x4096 5-Ch Packed ORM)
  - public/textures/m1a2_v3_turbine_bustle_{albedo,normal,roughness}.webp  (2048x2048 5-Ch Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - True 1:1 CAD scale (`1 world unit = 1 cm = 10 mm`): +X front/muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos, then all 24 objects
    are reset to identity (0,0,0) before Draco glTF 2.0 export.
  - Hollow Armored Shells: `m1a2_hull_shell` & `m1a2_turret_shell` are true manifold hollow shells
    (~15-18 cm walls) so `?cut=1` slices +Z>0 open cleanly without capping the interior!

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_m1a2_photoreal.py
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
# MODE 2: System Python Post-Process (4K U.S. Army CARC Stencils, Dry/Wet/Heat
#         Weathering, Tactical Chevrons, JET BLAST Warning, Blast-Door Hazard
#         Stripes, SEP v3 Tactical LCDs & Adaptive WebP Packed ORM Export)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    glb_path = Path(sys.argv[idx + 3]) if len(sys.argv) > idx + 3 else None
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
                    return ImageFont.truetype(cand, size=max(10, int(size)))
                except Exception:
                    continue
        return ImageFont.load_default()

    def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
        denom = e1 - e0
        if abs(denom) < 1e-6:
            return (x >= e0).astype(np.float32)
        t = np.clip((x - e0) / denom, 0.0, 1.0)
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
        ny = dy * strength
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.4) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image,
        u0: float, u1: float, v0: float, v1: float,
    ):
        h, w = target.shape[:2]
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _paste_uv_rgb(
        target: np.ndarray, pil_rgb: Image.Image,
        u0: float, u1: float, v0: float, v1: float,
    ):
        h, w = target.shape[:2]
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_rgb.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = arr

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

    def _combine_ao(ao_self: np.ndarray, ao_ext: np.ndarray, ext_mask: np.ndarray) -> np.ndarray:
        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.48 + ao_ext * 0.52)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        return np.clip(0.20 + 0.80 * np.power(np.clip(ao, 0.0, 1.0), 0.90), 0.18, 1.0).astype(np.float32)

    def _pack_suite_u8(
        albedo: np.ndarray, nrm: np.ndarray,
        ao: np.ndarray, rgh: np.ndarray, met: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        alb_u8 = np.clip(np.round(albedo * 255.0), 0, 255).astype(np.uint8)
        nrm_u8 = np.clip(np.round(nrm * 255.0), 0, 255).astype(np.uint8)
        orm = np.stack((
            np.clip(ao, 0.0, 1.0),
            np.clip(rgh, 0.04, 0.98),
            np.clip(met, 0.0, 1.0),
        ), axis=-1)
        orm_u8 = np.clip(np.round(orm * 255.0), 0, 255).astype(np.uint8)
        return alb_u8, nrm_u8, orm_u8

    def _save_suite_u8(
        stem: str,
        alb_u8: np.ndarray, nrm_u8: np.ndarray, orm_u8: np.ndarray,
        q_alb: int, q_nrm: int, q_orm: int,
    ) -> int:
        p_alb = out_dir / f"{stem}_albedo.webp"
        p_nrm = out_dir / f"{stem}_normal.webp"
        p_orm = out_dir / f"{stem}_roughness.webp"
        Image.fromarray(alb_u8, mode="RGB").save(p_alb, format="WEBP", quality=q_alb, method=5)
        Image.fromarray(nrm_u8, mode="RGB").save(p_nrm, format="WEBP", quality=q_nrm, method=5)
        Image.fromarray(orm_u8, mode="RGB").save(p_orm, format="WEBP", quality=q_orm, method=5)
        return p_alb.stat().st_size + p_nrm.stat().st_size + p_orm.stat().st_size

    def _draw_tactical_chevron(draw: ImageDraw.ImageDraw, cx: int, cy: int, w: int, h: int, thick: int):
        # Iconic U.S. Army Desert Storm / SEP v3 inverted-V coalition recognition chevron `^`
        pts = [
            (cx - w // 2, cy + h // 2),
            (cx, cy - h // 2),
            (cx + w // 2, cy + h // 2),
            (cx + w // 2 - thick, cy + h // 2),
            (cx, cy - h // 2 + int(thick * 1.32)),
            (cx - w // 2 + thick, cy + h // 2),
        ]
        draw.polygon(pts, fill=255)

    # -------------------------------------------------------------------------
    # SUITE 1: m1a2_v3_hull_armor_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def process_hull_armor_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "ha_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "ha_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "ha_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "ha_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "ha_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "ha_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "ha_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        scale_k = max(1.0, w / 2048.0)
        albedo = _linear_to_srgb(alb_lin)
        black_stencil = np.zeros((h, w), dtype=np.float32)
        panel_grooves = np.zeros((h, w), dtype=np.float32)
        oil_weeps = np.zeros((h, w), dtype=np.float32)

        # HERO BAND 1: Side Skirts Right (+Z) & Left (-Z) — 2x 4K Canvas (4800x760)!
        # Exact physical panel seams at X=(-253.5,-158.0,-62.0,34.0,129.0,225.5), mirrored cleanly for Left (-Z)!
        SW, SH = 4800, 760
        seam_xs_phys = (-253.5, -158.0, -62.0, 34.0, 129.0, 225.5)

        def _make_skirt_canvases(mirror_left: bool):
            blk = Image.new("L", (SW, SH), 0)
            grv = Image.new("L", (SW, SH), 0)
            oil = Image.new("L", (SW, SH), 0)
            ds_c = ImageDraw.Draw(blk)
            dg_c = ImageDraw.Draw(grv)
            do_c = ImageDraw.Draw(oil)

            def x_to_px(tx_val: float) -> int:
                xn = (341.0 - tx_val) / 688.0 if mirror_left else (tx_val - (-347.0)) / 688.0
                return int(round(xn * SW))

            for idx_p, sx_val in enumerate(seam_xs_phys):
                px = x_to_px(sx_val)
                dg_c.line([(px, 24), (px, SH - 24)], fill=255, width=16)
                for by in (96, SH - 104):
                    dg_c.ellipse((px - 52, by - 14, px - 24, by + 14), fill=220)
                    dg_c.ellipse((px + 24, by - 14, px + 52, by + 14), fill=220)
                # Subtle organic hinge-oil weep down from top seam hinge
                weep_h = 155 + (idx_p % 3) * 45
                do_c.ellipse((px - 22, -16, px + 22, weep_h), fill=175)

            # Forward Panel #6: `3-69 AR / B-21` | Center Panel #4: `^` | Rear Panel #2: `US ARMY 66.8T`
            _draw_tactical_chevron(ds_c, cx=x_to_px(-14.0), cy=380, w=450, h=430, thick=90)
            ds_c.text((x_to_px(177.2), 256), "3-69 AR", font=_load_font(FONT_DIN, 156), fill=255, anchor="mm")
            ds_c.text((x_to_px(177.2), 464), "B-21", font=_load_font(FONT_IMPACT, 216), fill=255, anchor="mm")
            ds_c.text((x_to_px(-205.8), 380), "US ARMY  66.8T", font=_load_font(FONT_COND, 124), fill=238, anchor="mm")
            return blk, grv, oil

        sk_blk_r, sk_grv_r, sk_oil_r = _make_skirt_canvases(mirror_left=False)
        sk_blk_l, sk_grv_l, sk_oil_l = _make_skirt_canvases(mirror_left=True)

        _paste_uv_band(black_stencil, sk_blk_r, 0.015, 0.985, 0.835, 0.985)
        _paste_uv_band(black_stencil, sk_blk_l, 0.015, 0.985, 0.665, 0.815)
        _paste_uv_band(panel_grooves, sk_grv_r, 0.015, 0.985, 0.835, 0.985)
        _paste_uv_band(panel_grooves, sk_grv_l, 0.015, 0.985, 0.665, 0.815)
        _paste_uv_band(oil_weeps, sk_oil_r, 0.015, 0.985, 0.835, 0.985)
        _paste_uv_band(oil_weeps, sk_oil_l, 0.015, 0.985, 0.665, 0.815)

        # HERO BAND 2: Front Hull Glacis & Bumper Stencils — 2x 4K Canvas (2400x640)!
        # UV Band: [0.015, 0.495] x [0.510, 0.635]
        GW, GH = 2400, 640
        gl_blk = Image.new("L", (GW, GH), 0)
        dgl = ImageDraw.Draw(gl_blk)
        dgl.text((440, 220), "3-69 AR", font=_load_font(FONT_DIN, 156), fill=255, anchor="mm")
        dgl.text((440, 430), "3RD ID", font=_load_font(FONT_COND, 128), fill=245, anchor="mm")
        _draw_tactical_chevron(dgl, cx=1200, cy=320, w=340, h=310, thick=72)
        dgl.text((1940, 220), "B-21", font=_load_font(FONT_IMPACT, 196), fill=255, anchor="mm")
        dgl.text((1940, 430), "M1A2 SEP v3", font=_load_font(FONT_COND, 112), fill=245, anchor="mm")
        _paste_uv_band(black_stencil, gl_blk, 0.015, 0.495, 0.510, 0.635)

        # HERO BAND 3: Rear Engine Deck Jet-Blast Warning Plate — 2x 4K Canvas (2200x620)!
        # UV Band: [0.535, 0.985] x [0.510, 0.635]
        JW, JH = 2200, 620
        jet_img = Image.new("RGB", (JW, JH), (168, 144, 108))
        dj = ImageDraw.Draw(jet_img)
        dj.rectangle((28, 28, JW - 28, JH - 28), fill=(228, 178, 28), outline=(24, 24, 26), width=20)
        for sx in range(-120, JW + 120, 136):
            dj.polygon([(sx, 28), (sx + 68, 28), (sx + 32, 112), (sx - 36, 112)], fill=(24, 24, 26))
            dj.polygon([(sx, JH - 112), (sx + 68, JH - 112), (sx + 32, JH - 28), (sx - 36, JH - 28)], fill=(24, 24, 26))
        dj.rectangle((96, 144, 680, 476), fill=(192, 28, 26), outline=(22, 22, 24), width=12)
        dj.text((388, 310), "DANGER", font=_load_font(FONT_IMPACT, 164), fill=(248, 245, 240), anchor="mm")
        dj.text((1408, 244), "JET BLAST / EXHAUST", font=_load_font(FONT_DIN, 148), fill=(20, 20, 22), anchor="mm")
        dj.text((1408, 408), "AGT1500 TURBINE - KEEP CLEAR 15M", font=_load_font(FONT_COND, 104), fill=(24, 24, 26), anchor="mm")
        _paste_uv_rgb(albedo, jet_img, 0.535, 0.985, 0.510, 0.635)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        jet_zone = (u_grid >= 0.535) & (u_grid <= 0.985) & (v_grid >= 0.510) & (v_grid <= 0.635)
        rgh[jet_zone] = 0.44
        met[jet_zone] = 0.04
        ao[jet_zone] = np.maximum(ao[jet_zone], 0.88)

        # Subtle AGT1500 exhaust soot kiss along the rear-most rim of the jet-blast warning plate
        rng = np.random.default_rng(1201)
        coarse_n = ndimage.gaussian_filter(
            rng.uniform(0.0, 1.0, (h // 8, w // 8)).astype(np.float32), sigma=5.5
        )
        coarse_n = np.asarray(
            Image.fromarray(np.clip(coarse_n * 255.0, 0, 255).astype(np.uint8)).resize((w, h), Image.Resampling.BILINEAR),
            dtype=np.float32,
        ) / 255.0
        fine_n = ndimage.gaussian_filter(rng.uniform(0.84, 1.0, (h, w)).astype(np.float32), sigma=1.1 * scale_k)

        v_wave = v_grid - 0.026 * (coarse_n - 0.5)
        jet_soot_grad = _smoothstep(0.542, 0.510, v_wave) * jet_zone.astype(np.float32) * (0.38 + 0.62 * coarse_n)
        _mix(albedo, (0.12, 0.11, 0.10), jet_soot_grad * 0.45)
        _mix(rgh, 0.76, jet_soot_grad * 0.55)

        # Organic undulating Iraqi desert sand drift along lower skirt edges & forward glacis lower edge (roughness ~ 0.95)
        sk_r_dust = _smoothstep(0.905, 0.835, v_wave) * ((v_grid >= 0.835) & (v_grid <= 0.985) & (u_grid >= 0.015) & (u_grid <= 0.985))
        sk_l_dust = _smoothstep(0.735, 0.665, v_wave) * ((v_grid >= 0.665) & (v_grid <= 0.815) & (u_grid >= 0.015) & (u_grid <= 0.985))
        gl_dust = _smoothstep(0.555, 0.510, v_wave) * ((v_grid >= 0.510) & (v_grid <= 0.635) & (u_grid >= 0.015) & (u_grid <= 0.495))
        desert_drift = np.clip((sk_r_dust + sk_l_dust + gl_dust * 0.70) * (0.42 + 0.78 * coarse_n), 0.0, 1.0)
        _mix(albedo, (0.66, 0.59, 0.46), desert_drift * 0.56)
        _mix(rgh, 0.95, desert_drift * 0.92)
        _mix(met, 0.0, desert_drift * 0.95)

        # Soft vertical wet hinge grease/oil weeping along upper skirt seams (roughness ~ 0.24, darkened tan-brown)
        oil_mask = ndimage.gaussian_filter(oil_weeps, sigma=(10.0 * scale_k, 3.0 * scale_k)) * (0.45 + 0.75 * coarse_n)
        oil_mask = np.clip(oil_mask * (1.0 - black_stencil * 0.85), 0.0, 0.78)
        _mix(albedo, (0.24, 0.20, 0.14), oil_mask * 0.48)
        _mix(rgh, 0.24, oil_mask * 0.85)
        _mix(met, 0.06, oil_mask * 0.45)

        # Crisp black military stencils (applied over base grime, very lightly kissed by dust at 95% legibility)
        blk_paint = np.clip(black_stencil * fine_n * (1.0 - 0.16 * desert_drift), 0.0, 1.0)
        _mix(albedo, (0.105, 0.105, 0.112), blk_paint * 0.95)
        _mix(rgh, 0.62, blk_paint * 0.85)
        _mix(met, 0.02, blk_paint * 0.95)

        # Panel seam darkening & bevel normal detail + crevice grime baked softly into albedo
        _mix(albedo, (0.21, 0.18, 0.13), panel_grooves * 0.72)
        ao *= 1.0 - 0.48 * panel_grooves
        albedo *= (0.76 + 0.24 * ao[..., None])
        decal_h = 0.10 * _bevel_mask(blk_paint, 1.1 * scale_k) - 0.70 * _bevel_mask(panel_grooves, 1.8 * scale_k)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(decal_h, strength=3.0))

        # Lift interior torsion bars & geared turret ring visibility in cutaway + keep burnished track steel gleaming!
        interior_zone = (u_grid >= 0.010) & (u_grid <= 0.280) & (v_grid >= 0.010) & (v_grid <= 0.205)
        burnished_track_zone = (u_grid >= 0.914) & (u_grid <= 0.995) & (v_grid >= 0.010) & (v_grid <= 0.205)
        ao[interior_zone] = np.maximum(ao[interior_zone], 0.78)
        ao[burnished_track_zone] = np.maximum(ao[burnished_track_zone], 0.54)

        return _pack_suite_u8(albedo, nrm_final, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 2: m1a2_v3_turret_gun_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def process_turret_gun_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "tg_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "tg_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "tg_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "tg_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "tg_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tg_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tg_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        scale_k = max(1.0, w / 2048.0)
        albedo = _linear_to_srgb(alb_lin)
        black_stencil = np.zeros((h, w), dtype=np.float32)
        white_stencil = np.zeros((h, w), dtype=np.float32)
        seam_grooves = np.zeros((h, w), dtype=np.float32)

        # HERO BAND 1 & 2: Turret Right (+Z) & Left (-Z) Side Armor Flanks — 2x 4K Canvas (4400x760)!
        # Right [0.015, 0.985] x [0.825, 0.985] (u=0 rear -> u=1 front)
        # Left  [0.015, 0.985] x [0.640, 0.800] (u=0 front -> u=1 rear — mirrored so `^` is ALWAYS forward!)
        TW, TH = 4400, 760
        t_blk_r = Image.new("L", (TW, TH), 0)
        t_grv_r = Image.new("L", (TW, TH), 0)
        dtr = ImageDraw.Draw(t_blk_r)
        dgr = ImageDraw.Draw(t_grv_r)

        dgr.line([(3160, 24), (3160, TH - 24)], fill=244, width=18)
        dgr.line([(1720, 24), (1720, TH - 24)], fill=244, width=18)
        _draw_tactical_chevron(dtr, cx=3720, cy=384, w=440, h=424, thick=88)
        dtr.text((2460, 284), "B-21", font=_load_font(FONT_IMPACT, 304), fill=255, anchor="mm")
        dtr.text((2460, 548), "3-69 AR  -  M1A2 SEP v3", font=_load_font(FONT_DIN, 108), fill=248, anchor="mm")
        dtr.text((1250, 316), "120MM BUSTLE", font=_load_font(FONT_COND, 76), fill=236, anchor="mm")
        dtr.text((1250, 424), "BLAST VENTED", font=_load_font(FONT_COND, 64), fill=226, anchor="mm")

        t_blk_l = Image.new("L", (TW, TH), 0)
        t_grv_l = Image.new("L", (TW, TH), 0)
        dtl = ImageDraw.Draw(t_blk_l)
        dgl = ImageDraw.Draw(t_grv_l)

        dgl.line([(TW - 3160, 24), (TW - 3160, TH - 24)], fill=244, width=18)
        dgl.line([(TW - 1720, 24), (TW - 1720, TH - 24)], fill=244, width=18)
        _draw_tactical_chevron(dtl, cx=TW - 3720, cy=384, w=440, h=424, thick=88)
        dtl.text((TW - 2460, 284), "B-21", font=_load_font(FONT_IMPACT, 304), fill=255, anchor="mm")
        dtl.text((TW - 2460, 548), "3-69 AR  -  M1A2 SEP v3", font=_load_font(FONT_DIN, 108), fill=248, anchor="mm")
        dtl.text((TW - 1250, 316), "120MM BUSTLE", font=_load_font(FONT_COND, 76), fill=236, anchor="mm")
        dtl.text((TW - 1250, 424), "BLAST VENTED", font=_load_font(FONT_COND, 64), fill=226, anchor="mm")

        _paste_uv_band(black_stencil, t_blk_r, 0.015, 0.985, 0.825, 0.985)
        _paste_uv_band(black_stencil, t_blk_l, 0.015, 0.985, 0.640, 0.800)
        _paste_uv_band(seam_grooves, t_grv_r, 0.015, 0.985, 0.825, 0.985)
        _paste_uv_band(seam_grooves, t_grv_l, 0.015, 0.985, 0.640, 0.800)

        # HERO BAND 3a & 3b: M256 120mm Bore Evacuator Right & Left — 2x 4K Canvas (2000x280)!
        BW, BH = 2000, 280
        b_blk = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_blk)
        db.text((BW // 2, 104), "IRONHORSE", font=_load_font(FONT_IMPACT, 132), fill=255, anchor="mm")
        db.text((BW // 2, 216), "120MM L/44 M256 SMOOTHBORE", font=_load_font(FONT_DIN, 68), fill=246, anchor="mm")
        _paste_uv_band(black_stencil, b_blk, 0.015, 0.455, 0.556, 0.612)
        _paste_uv_band(black_stencil, b_blk, 0.015, 0.455, 0.492, 0.548)

        # Subtle organic vertical desert dust drift on lower turret flank edges
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        rng = np.random.default_rng(1202)
        t_coarse = ndimage.gaussian_filter(
            rng.uniform(0.0, 1.0, (h // 8, w // 8)).astype(np.float32), sigma=5.5
        )
        t_coarse = np.asarray(
            Image.fromarray(np.clip(t_coarse * 255.0, 0, 255).astype(np.uint8)).resize((w, h), Image.Resampling.BILINEAR),
            dtype=np.float32,
        ) / 255.0
        mottle = ndimage.gaussian_filter(rng.uniform(0.86, 1.0, (h, w)).astype(np.float32), sigma=1.0 * scale_k)
        tv_wave = v_grid - 0.022 * (t_coarse - 0.5)
        tur_dust = (
            _smoothstep(0.875, 0.825, tv_wave) * ((v_grid >= 0.825) & (v_grid <= 0.985))
            + _smoothstep(0.690, 0.640, tv_wave) * ((v_grid >= 0.640) & (v_grid <= 0.800))
        ).astype(np.float32) * ((u_grid >= 0.015) & (u_grid <= 0.985)) * (0.45 + 0.65 * t_coarse)
        _mix(albedo, (0.64, 0.57, 0.44), tur_dust * 0.28)
        _mix(rgh, 0.94, tur_dust * 0.58)

        blk_paint = np.clip(black_stencil * mottle, 0.0, 1.0)
        _mix(albedo, (0.105, 0.105, 0.11), blk_paint * 0.95)
        _mix(rgh, 0.60, blk_paint * 0.85)
        _mix(met, 0.02, blk_paint * 0.95)
        _mix(albedo, (0.88, 0.88, 0.86), white_stencil * 0.92)

        _mix(albedo, (0.20, 0.17, 0.13), seam_grooves * 0.68)
        ao *= 1.0 - 0.46 * seam_grooves
        albedo *= (0.76 + 0.24 * ao[..., None])
        decal_h = 0.09 * _bevel_mask(blk_paint, 1.1 * scale_k) - 0.65 * _bevel_mask(seam_grooves, 1.8 * scale_k)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(decal_h, strength=2.8))

        # Lift cutaway visibility of Chobham/DU NERA composite armor layers & firewalled emerald-sapphire optics!
        optics_zone = (u_grid >= 0.490) & (u_grid <= 0.635) & (v_grid >= 0.495) & (v_grid <= 0.610)
        chobham_zone = (u_grid >= 0.670) & (u_grid <= 0.985) & (v_grid >= 0.495) & (v_grid <= 0.610)
        ao[optics_zone] = np.maximum(ao[optics_zone], 0.92)
        rgh[optics_zone] = np.minimum(rgh[optics_zone], 0.08)
        ao[chobham_zone] = np.maximum(ao[chobham_zone], 0.86)

        return _pack_suite_u8(albedo, nrm_final, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 3: m1a2_v3_turbine_bustle_{albedo,normal,roughness}.webp (2048x2048)
    # -------------------------------------------------------------------------
    def process_turbine_bustle_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "tb_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "tb_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "tb_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "tb_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "tb_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tb_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tb_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # HERO BAND 1: Sliding Armored Blast Doors Front Face (`+X`) — Yellow/Black Hazard Stripes & Safety Text
        DW, DH = 1320, 440
        door_img = Image.new("RGB", (DW, DH), (146, 152, 160))
        dd = ImageDraw.Draw(door_img)
        dd.rectangle((16, 16, DW - 16, DH - 16), outline=(58, 64, 72), width=14)
        dd.line([(DW // 2, 16), (DW // 2, DH - 16)], fill=(28, 30, 34), width=12)
        for x_bar in (DW // 2 - 74, DW // 2 + 12):
            dd.rectangle((x_bar, 24, x_bar + 62, DH - 24), fill=(234, 182, 24))
            for sy in range(-40, DH + 40, 48):
                dd.polygon(
                    [(x_bar, sy), (x_bar + 62, sy + 28), (x_bar + 62, sy + 52), (x_bar, sy + 24)],
                    fill=(24, 24, 28),
                )
        for cx in (DW // 4 - 22, 3 * DW // 4 + 22):
            dd.rectangle((cx - 210, 88, cx + 210, 352), fill=(62, 68, 76), outline=(234, 182, 24), width=8)
            dd.text((cx, 154), "BLAST DOOR", font=_load_font(FONT_IMPACT, 72), fill=(242, 196, 36), anchor="mm")
            dd.text((cx, 232), "KEEP CLOSED", font=_load_font(FONT_DIN, 58), fill=(242, 244, 246), anchor="mm")
            dd.text((cx, 300), "120MM AMMO COMPARTMENT", font=_load_font(FONT_COND, 40), fill=(224, 228, 232), anchor="mm")
        _paste_uv_rgb(albedo, door_img, 0.015, 0.565, 0.805, 0.985)

        # HERO BAND 2: Three Dedicated Non-Overlapping SEP v3 Tactical LCD Displays
        LW, LH = 360, 420
        drv_img = Image.new("RGB", (LW, LH), (12, 34, 30))
        ddrv = ImageDraw.Draw(drv_img)
        ddrv.rectangle((10, 10, LW - 10, LH - 10), outline=(52, 224, 164), width=5)
        ddrv.text((LW // 2, 54), "DRIVER PANEL", font=_load_font(FONT_DIN, 36), fill=(72, 250, 188), anchor="mm")
        ddrv.line([(24, 88), (LW - 24, 88)], fill=(44, 185, 138), width=3)
        ddrv.text((LW // 2, 148), "AGT1500", font=_load_font(FONT_IMPACT, 48), fill=(248, 212, 64), anchor="mm")
        ddrv.text((LW // 2, 208), "1,500 SHP", font=_load_font(FONT_DIN, 40), fill=(96, 238, 248), anchor="mm")
        ddrv.text((LW // 2, 276), "JP-8: 94%", font=_load_font(FONT_DIN, 36), fill=(78, 246, 162), anchor="mm")
        ddrv.text((LW // 2, 344), "X1100: READY", font=_load_font(FONT_COND, 36), fill=(78, 246, 162), anchor="mm")
        _paste_uv_rgb(albedo, drv_img, 0.605, 0.720, 0.805, 0.985)

        gn_img = Image.new("RGB", (LW, LH), (12, 34, 30))
        dgn = ImageDraw.Draw(gn_img)
        dgn.rectangle((10, 10, LW - 10, LH - 10), outline=(52, 224, 164), width=5)
        dgn.text((LW // 2, 54), "GUNNER FCS", font=_load_font(FONT_DIN, 36), fill=(72, 250, 188), anchor="mm")
        dgn.line([(24, 88), (LW - 24, 88)], fill=(44, 185, 138), width=3)
        dgn.text((LW // 2, 148), "M829A4", font=_load_font(FONT_IMPACT, 50), fill=(248, 212, 64), anchor="mm")
        dgn.text((LW // 2, 208), "LRF: 2,480 M", font=_load_font(FONT_DIN, 38), fill=(72, 250, 188), anchor="mm")
        dgn.text((LW // 2, 276), "MRS: LOCKED", font=_load_font(FONT_DIN, 34), fill=(96, 238, 248), anchor="mm")
        dgn.text((LW // 2, 344), "DOOR: SEALED", font=_load_font(FONT_COND, 36), fill=(78, 246, 162), anchor="mm")
        _paste_uv_rgb(albedo, gn_img, 0.735, 0.852, 0.805, 0.985)

        cm_img = Image.new("RGB", (LW, LH), (10, 32, 28))
        dcm = ImageDraw.Draw(cm_img)
        for gx in range(36, LW, 48):
            dcm.line([(gx, 16), (gx, LH - 16)], fill=(22, 86, 68), width=2)
        for gy in range(36, LH, 48):
            dcm.line([(16, gy), (LW - 16, gy)], fill=(22, 86, 68), width=2)
        dcm.rectangle((10, 10, LW - 10, LH - 10), outline=(52, 224, 164), width=5)
        cx, cy = LW // 2, LH // 2 + 24
        for rr in (48, 96, 138):
            dcm.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(48, 215, 155), width=3)
        dcm.polygon([(cx, cy - 16), (cx + 14, cy + 14), (cx - 14, cy + 14)], fill=(66, 245, 220))
        dcm.polygon([(cx + 68, cy - 52), (cx + 82, cy - 38), (cx + 68, cy - 24), (cx + 54, cy - 38)], fill=(245, 86, 72))
        dcm.text((LW // 2, 46), "SEP v3  BFT MAP", font=_load_font(FONT_DIN, 34), fill=(72, 250, 188), anchor="mm")
        _paste_uv_rgb(albedo, cm_img, 0.868, 0.985, 0.805, 0.985)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        door_zone = (u_grid >= 0.015) & (u_grid <= 0.565) & (v_grid >= 0.805) & (v_grid <= 0.985)
        lcd_zone = (u_grid >= 0.605) & (u_grid <= 0.985) & (v_grid >= 0.805) & (v_grid <= 0.985)
        copper_zone = (u_grid >= 0.015) & (u_grid <= 0.340) & (v_grid >= 0.560) & (v_grid <= 0.770)
        titanium_zone = (u_grid >= 0.375) & (u_grid <= 0.680) & (v_grid >= 0.560) & (v_grid <= 0.770)
        ammo_brass_zone = (u_grid >= 0.715) & (u_grid <= 0.985) & (v_grid >= 0.560) & (v_grid <= 0.770)

        ao[door_zone] = np.maximum(ao[door_zone], 0.88)
        rgh[door_zone] = 0.34
        met[door_zone] = 0.55

        ao[lcd_zone] = 1.0
        rgh[lcd_zone] = 0.14
        met[lcd_zone] = 0.05

        ao[copper_zone] = np.maximum(ao[copper_zone], 0.88)
        rgh[copper_zone] = np.minimum(rgh[copper_zone], 0.22)
        ao[titanium_zone] = np.maximum(ao[titanium_zone], 0.90)
        rgh[titanium_zone] = np.minimum(rgh[titanium_zone], 0.20)
        ao[ammo_brass_zone] = np.maximum(ao[ammo_brass_zone], 0.88)

        return _pack_suite_u8(albedo, nrm, ao, rgh, met)

    ha_u8 = process_hull_armor_atlas()
    tg_u8 = process_turret_gun_atlas()
    tb_u8 = process_turbine_bustle_atlas()

    glb_bytes = glb_path.stat().st_size if (glb_path is not None and glb_path.exists()) else 0
    TARGET_SOFT_BYTES = int(11.50 * 1024 * 1024)
    TARGET_HARD_BYTES = int(11.80 * 1024 * 1024)

    # Adaptive WebP quality schedule: maximize 4K sharpness while keeping full bundle <= 11.80 MB!
    quality_tiers = [
        ((88, 90, 88), (90, 92, 90)),
        ((85, 87, 85), (90, 92, 90)),
        ((82, 85, 82), (88, 90, 88)),
        ((79, 82, 79), (86, 88, 86)),
        ((76, 80, 76), (84, 86, 84)),
        ((73, 77, 73), (82, 84, 82)),
        ((70, 74, 70), (80, 82, 80)),
        ((66, 70, 66), (78, 80, 78)),
    ]
    chosen_tier = None
    last_total = 0
    for q4k, q2k in quality_tiers:
        sz_ha = _save_suite_u8("m1a2_v3_hull_armor", *ha_u8, *q4k)
        sz_tg = _save_suite_u8("m1a2_v3_turret_gun", *tg_u8, *q4k)
        sz_tb = _save_suite_u8("m1a2_v3_turbine_bustle", *tb_u8, *q2k)
        last_total = glb_bytes + sz_ha + sz_tg + sz_tb
        print(
            f"  [POST-WEBP] tier 4K={q4k} 2K={q2k} -> "
            f"ha={sz_ha/1024:.0f}KB tg={sz_tg/1024:.0f}KB tb={sz_tb/1024:.0f}KB "
            f"+ glb={glb_bytes/1024:.0f}KB => total={last_total/(1024*1024):.2f} MB"
        )
        chosen_tier = (q4k, q2k)
        if last_total <= TARGET_SOFT_BYTES:
            break

    assert last_total <= TARGET_HARD_BYTES, (
        f"Adaptive WebP budget exceeded: {last_total / (1024 * 1024):.2f} MB > 11.80 MB"
    )
    print(f"  [POST] Locked final WebP quality tier {chosen_tier} ({last_total / (1024 * 1024):.2f} MB <= 11.80 MB)")
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Sculpture, UV Layout, Cycles Bake & Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "m1a2.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE_4K = 4096
ATLAS_SIZE_2K = 2048
BAKE_NORMAL_SAMPLES = 18
BAKE_AO_SAMPLES = 24

# Three.js (X fwd, Y up, Z right) -> Blender (X fwd, -Z back-left, Y up) det=+1
T2B_MAT = Matrix((
    (1.0,  0.0, 0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0, 0.0, 0.0),
    (0.0,  0.0, 0.0, 1.0),
))


def t2b(tx: float, ty: float, tz: float) -> tuple[float, float, float]:
    return (tx, -tz, ty)


# 3 Dedicated 2K Texture Suites covering all 24 solid GLB parts (8 + 8 + 8 = 24)
HULL_ARMOR_PARTS = (
    "m1a2_hull_shell",
    "m1a2_side_skirts",
    "m1a2_road_wheels",
    "m1a2_tracks_left",
    "m1a2_tracks_right",
    "m1a2_engine_deck",
    "m1a2_torsion_bars",
    "m1a2_turret_ring",
)

TURRET_GUN_PARTS = (
    "m1a2_turret_shell",
    "m1a2_blowoff_panels",
    "m1a2_composite_armor",
    "m1a2_main_gun",
    "m1a2_gun_mantlet",
    "m1a2_breech_block",
    "m1a2_crows_optics",
    "m1a2_smoke_launchers",
)

TURBINE_BUSTLE_PARTS = (
    "m1a2_blast_doors",
    "m1a2_ammo_bustle",
    "m1a2_ready_round",
    "m1a2_stub_deflector",
    "m1a2_agt1500_turbine",
    "m1a2_x1100_transmission",
    "m1a2_fuel_cells",
    "m1a2_crew_stations",
)

EXTERIOR_CONTACT_AO_PARTS = {
    "m1a2_hull_shell",
    "m1a2_side_skirts",
    "m1a2_road_wheels",
    "m1a2_tracks_left",
    "m1a2_tracks_right",
    "m1a2_engine_deck",
    "m1a2_turret_shell",
    "m1a2_blowoff_panels",
    "m1a2_main_gun",
    "m1a2_gun_mantlet",
    "m1a2_crows_optics",
    "m1a2_smoke_launchers",
}

# Exact assembledPos matching `src/weapons/m1a2/plugin.ts`
ASSEMBLED_POS = {
    "m1a2_hull_shell":         (   0.0,   0.0,    0.0),
    "m1a2_side_skirts":        (   0.0, -54.0,    0.0),
    "m1a2_road_wheels":        (   0.0, -84.0,    0.0),
    "m1a2_tracks_left":        (   0.0, -82.0, -146.0),
    "m1a2_tracks_right":       (   0.0, -82.0,  146.0),
    "m1a2_engine_deck":        (-268.0,  20.0,    0.0),
    "m1a2_torsion_bars":       (   0.0, -64.0,    0.0),
    "m1a2_turret_ring":        (  20.0,  12.0,    0.0),
    "m1a2_turret_shell":       (   0.0,   0.0,    0.0),
    "m1a2_blowoff_panels":     (-166.0,  73.0,    0.0),
    "m1a2_composite_armor":    ( 148.0,  44.0,    0.0),
    "m1a2_main_gun":           (  68.0,  44.0,    0.0),
    "m1a2_gun_mantlet":        ( 148.0,  44.0,    0.0),
    "m1a2_breech_block":       (  42.0,  44.0,    0.0),
    "m1a2_crows_optics":       (  48.0,  98.0,    0.0),
    "m1a2_smoke_launchers":    (  40.0,  58.0,    0.0),
    "m1a2_blast_doors":        ( -84.0,  43.0,    0.0),
    "m1a2_ammo_bustle":        (-168.0,  44.0,    0.0),
    "m1a2_ready_round":        (-150.0,  44.0,  -14.0),
    "m1a2_stub_deflector":     ( -16.0,  42.0,    0.0),
    "m1a2_agt1500_turbine":    (-212.0, -24.0,    0.0),
    "m1a2_x1100_transmission": (-330.0, -28.0,    0.0),
    "m1a2_fuel_cells":         ( 205.0, -28.0,    0.0),
    "m1a2_crew_stations":      (  95.0, -20.0,    0.0),
}

# Verified CSG local bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "m1a2_hull_shell":         ((-396.0, -72.0, -173.0), (397.0,  22.0, 173.0)),
    "m1a2_side_skirts":        ((-349.0, -35.0, -182.8), (343.0,  34.0, 182.8)),
    "m1a2_road_wheels":        ((-341.0, -28.9, -171.0), (338.0,  36.0, 171.0)),
    "m1a2_tracks_left":        ((-356.0, -38.0,  -32.0), (352.0,  40.0,  32.0)),
    "m1a2_tracks_right":       ((-356.0, -38.0,  -32.0), (352.0,  40.0,  32.0)),
    "m1a2_engine_deck":        ((-124.0, -14.0, -117.0), (114.0,   9.0, 117.0)),
    "m1a2_torsion_bars":       ((-263.5,  -5.5, -117.0), (253.5,   5.5, 117.0)),
    "m1a2_turret_ring":        ((-108.0,  -9.8, -108.0), (108.0,   9.8, 108.0)),
    "m1a2_turret_shell":       ((-258.0,  12.0, -164.0), (228.0,  76.0, 164.0)),
    "m1a2_blowoff_panels":     (( -69.0,  -2.6, -106.0), ( 69.0,   4.9, 106.0)),
    "m1a2_composite_armor":    (( -59.2, -19.0, -111.1), ( 51.8,  19.0, 111.1)),
    "m1a2_main_gun":           ((   0.0, -13.4,  -13.4), (513.0,  15.4,  13.4)),
    "m1a2_gun_mantlet":        (( -42.0, -21.0,  -46.0), ( 86.0,  21.0,  46.0)),
    "m1a2_breech_block":       (( -22.0, -20.0,  -21.0), ( 26.0,  19.0,  22.0)),
    "m1a2_crows_optics":       (( -74.0, -22.0,  -85.6), ( 85.0,  26.0,  83.0)),
    "m1a2_smoke_launchers":    ((-142.5, -13.0, -177.3), ( 70.6,  62.0, 177.3)),
    "m1a2_blast_doors":        ((  -5.5, -21.8,  -44.0), (  7.6,  21.8,  44.0)),
    "m1a2_ammo_bustle":        (( -57.0, -21.0, -116.0), ( 54.0,  21.0, 116.0)),
    "m1a2_ready_round":        (( -49.0,  -8.4,   -8.4), ( 49.0,   8.4,   8.4)),
    "m1a2_stub_deflector":     (( -30.0, -22.0,  -20.0), ( 29.0,  13.3,  20.0)),
    "m1a2_agt1500_turbine":    (( -75.0, -33.2,  -63.0), ( 69.0,  34.0,  63.0)),
    "m1a2_x1100_transmission": (( -40.0, -26.0,  -98.0), ( 34.0,  27.0,  98.0)),
    "m1a2_fuel_cells":         (( -60.0, -26.2, -102.0), ( 66.0,  24.0, 102.0)),
    "m1a2_crew_stations":      ((-136.0, -41.8,  -84.0), (151.0,  57.0,  84.0)),
}


# =============================================================================
# Scene & Physically Calibrated M1A2 SEP v3 Desert CARC / Ordnance Material Library
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
    scene.cycles.adaptive_threshold = 0.018
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0

    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.light_settings.distance = 20.0

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
    bevel_r: float = 1.6,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.34, 0.36, 0.39),
    grain_scale: float = 0.55,
    grain_bump: float = 0.24,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 1.6,
    rough_var: float = 0.10,
    dust_srgb: tuple[float, float, float] | None = None,
    streak_amt: float = 0.14,
    lower_dust: float = 0.0,
    dust_z_min: float = -58.0,
    dust_z_max: float = 6.0,
    oil_stain_amt: float = 0.0,
    oil_scale: float = 0.045,
    oil_rough: float = 0.23,
    oil_srgb: tuple[float, float, float] = (0.20, 0.16, 0.10),
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])

    # 1. Multi-scale heavy-armor weathering noise (tank scale 1u = 1cm)
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.018
    n_macro.inputs["Detail"].default_value = 6.0
    n_macro.inputs["Roughness"].default_value = 0.62
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    # Vertical gravity rain / oil streaking (stretched along Blender Z = Three.js Y)
    mp_streak = nt.nodes.new("ShaderNodeMapping")
    mp_streak.inputs["Scale"].default_value = (0.095, 0.095, 0.014)
    nt.links.new(texcoord.outputs["Object"], mp_streak.inputs["Vector"])
    n_streak = nt.nodes.new("ShaderNodeTexNoise")
    n_streak.inputs["Scale"].default_value = 1.0
    n_streak.inputs["Detail"].default_value = 5.0
    n_streak.inputs["Roughness"].default_value = 0.58
    nt.links.new(mp_streak.outputs["Vector"], n_streak.inputs["Vector"])

    # Medium rolled-steel mill scale / surface undulation + crisp micro-grain
    n_mid = nt.nodes.new("ShaderNodeTexNoise")
    n_mid.inputs["Scale"].default_value = grain_scale * 0.24
    n_mid.inputs["Detail"].default_value = 7.0
    n_mid.inputs["Roughness"].default_value = 0.66
    nt.links.new(mapping.outputs["Vector"], n_mid.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 7.0
    n_micro.inputs["Roughness"].default_value = 0.68
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    mix_b1 = nt.nodes.new("ShaderNodeMix")
    mix_b1.data_type = "FLOAT"
    mix_b1.inputs["Factor"].default_value = 0.52
    nt.links.new(n_mid.outputs["Fac"], mix_b1.inputs[2])
    nt.links.new(n_micro.outputs["Fac"], mix_b1.inputs[3])
    bump_sock = mix_b1.outputs[0]

    if voronoi_grain > 0.001:
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = voronoi_scale
        nt.links.new(texcoord.outputs["Object"], vor.inputs["Vector"])
        mix_g = nt.nodes.new("ShaderNodeMix")
        mix_g.data_type = "FLOAT"
        mix_g.inputs["Factor"].default_value = voronoi_grain
        nt.links.new(bump_sock, mix_g.inputs[2])
        nt.links.new(vor.outputs["Distance"], mix_g.inputs[3])
        bump_sock = mix_g.outputs[0]

    base_a = srgb_to_lin(*base_srgb)
    if dust_srgb is not None:
        base_b = srgb_to_lin(*dust_srgb)
    else:
        base_b = srgb_to_lin(
            min(1.0, base_srgb[0] * 1.12),
            min(1.0, base_srgb[1] * 1.11),
            min(1.0, base_srgb[2] * 1.09),
        )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_a
    mix_base.inputs[7].default_value = base_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    # Subtle dark vertical rain/grime streaking along hull & turret flanks
    if streak_amt > 0.005:
        ramp_s = nt.nodes.new("ShaderNodeValToRGB")
        ramp_s.color_ramp.elements[0].position = 0.54
        ramp_s.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp_s.color_ramp.elements[1].position = 0.78
        ramp_s.color_ramp.elements[1].color = (streak_amt, streak_amt, streak_amt, 1.0)
        nt.links.new(n_streak.outputs["Fac"], ramp_s.inputs["Fac"])

        mix_st = nt.nodes.new("ShaderNodeMix")
        mix_st.data_type = "RGBA"
        mix_st.inputs[7].default_value = srgb_to_lin(
            base_srgb[0] * 0.56,
            base_srgb[1] * 0.54,
            base_srgb[2] * 0.50,
        )
        nt.links.new(ramp_s.outputs["Color"], mix_st.inputs[0])
        nt.links.new(col_sock, mix_st.inputs[6])
        col_sock = mix_st.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.22
    rgh_map.inputs["From Max"].default_value = 0.78
    rgh_map.inputs["To Min"].default_value = max(0.06, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.96, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    # Lower-hull & recessed Iraqi desert sand drift: pale dry silt + bone-dry roughness ~ 0.95 & metallic -> 0.0
    if lower_dust > 0.01:
        sep_p = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(texcoord.outputs["Object"], sep_p.inputs["Vector"])
        mr_d = nt.nodes.new("ShaderNodeMapRange")
        mr_d.clamp = True
        mr_d.inputs["From Min"].default_value = dust_z_min
        mr_d.inputs["From Max"].default_value = dust_z_max
        mr_d.inputs["To Min"].default_value = lower_dust
        mr_d.inputs["To Max"].default_value = 0.0
        nt.links.new(sep_p.outputs["Z"], mr_d.inputs["Value"])

        mul_d = nt.nodes.new("ShaderNodeMath")
        mul_d.operation = "MULTIPLY"
        nt.links.new(mr_d.outputs["Result"], mul_d.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], mul_d.inputs[1])

        mix_ld = nt.nodes.new("ShaderNodeMix")
        mix_ld.data_type = "RGBA"
        mix_ld.inputs[7].default_value = srgb_to_lin(0.66, 0.59, 0.45)
        nt.links.new(mul_d.outputs["Value"], mix_ld.inputs[0])
        nt.links.new(col_sock, mix_ld.inputs[6])
        col_sock = mix_ld.outputs[2]

        mix_dr = nt.nodes.new("ShaderNodeMix")
        mix_dr.data_type = "FLOAT"
        mix_dr.inputs[3].default_value = 0.95
        nt.links.new(mul_d.outputs["Value"], mix_dr.inputs[0])
        nt.links.new(rgh_sock, mix_dr.inputs[2])
        rgh_sock = mix_dr.outputs[0]

        mix_dm = nt.nodes.new("ShaderNodeMix")
        mix_dm.data_type = "FLOAT"
        mix_dm.inputs[3].default_value = 0.0
        nt.links.new(mul_d.outputs["Value"], mix_dm.inputs[0])
        nt.links.new(met_sock, mix_dm.inputs[2])
        met_sock = mix_dm.outputs[0]

    # Localized wet JP-8 / hydraulic oil stain patches (darkened tan-brown albedo + glossy wet roughness ~ 0.22..0.28!)
    if oil_stain_amt > 0.01:
        n_oil = nt.nodes.new("ShaderNodeTexNoise")
        n_oil.inputs["Scale"].default_value = oil_scale
        n_oil.inputs["Detail"].default_value = 5.0
        n_oil.inputs["Roughness"].default_value = 0.58
        nt.links.new(texcoord.outputs["Object"], n_oil.inputs["Vector"])

        ramp_o = nt.nodes.new("ShaderNodeValToRGB")
        ramp_o.color_ramp.elements[0].position = 0.58
        ramp_o.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp_o.color_ramp.elements[1].position = 0.76
        ramp_o.color_ramp.elements[1].color = (oil_stain_amt, oil_stain_amt, oil_stain_amt, 1.0)
        nt.links.new(n_oil.outputs["Fac"], ramp_o.inputs["Fac"])

        mix_oc = nt.nodes.new("ShaderNodeMix")
        mix_oc.data_type = "RGBA"
        mix_oc.inputs[7].default_value = srgb_to_lin(*oil_srgb)
        nt.links.new(ramp_o.outputs["Color"], mix_oc.inputs[0])
        nt.links.new(col_sock, mix_oc.inputs[6])
        col_sock = mix_oc.outputs[2]

        mix_or = nt.nodes.new("ShaderNodeMix")
        mix_or.data_type = "FLOAT"
        mix_or.inputs[3].default_value = oil_rough
        nt.links.new(ramp_o.outputs["Color"], mix_or.inputs[0])
        nt.links.new(rgh_sock, mix_or.inputs[2])
        rgh_sock = mix_or.outputs[0]

    # Bold tank-scale ShaderNodeBevel (works per-pixel on ANY box/extruded armor polygon!)
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if edge_wear > 0.005:
        # Per-pixel geometric bevel curvature mask: 1.0 - dot(BevelNormal, TrueNormal)
        vdot = nt.nodes.new("ShaderNodeVectorMath")
        vdot.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
        nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])

        sub_c = nt.nodes.new("ShaderNodeMath")
        sub_c.operation = "SUBTRACT"
        sub_c.inputs[0].default_value = 1.0
        nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.012
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.14
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(sub_c.outputs["Value"], ramp.inputs["Fac"])

        # Break up chipped armor edges with noise so wear looks organically abraded, never uniform cartoon lines
        chip_n = nt.nodes.new("ShaderNodeTexNoise")
        chip_n.inputs["Scale"].default_value = 0.22
        chip_n.inputs["Detail"].default_value = 6.0
        chip_n.inputs["Roughness"].default_value = 0.72
        nt.links.new(texcoord.outputs["Object"], chip_n.inputs["Vector"])

        ramp_cn = nt.nodes.new("ShaderNodeValToRGB")
        ramp_cn.color_ramp.elements[0].position = 0.34
        ramp_cn.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)
        ramp_cn.color_ramp.elements[1].position = 0.66
        ramp_cn.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(chip_n.outputs["Fac"], ramp_cn.inputs["Fac"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        nt.links.new(ramp.outputs["Color"], mul_w.inputs[0])
        nt.links.new(ramp_cn.outputs["Color"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = 0.32 if metallic < 0.35 else max(0.16, roughness - 0.18)
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        mix_em = nt.nodes.new("ShaderNodeMix")
        mix_em.data_type = "FLOAT"
        mix_em.inputs[3].default_value = 0.86 if metallic < 0.35 else 0.96
        nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
        nt.links.new(met_sock, mix_em.inputs[2])
        met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.65
        nt.links.new(bump_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_m256_barrel_mat() -> bpy.types.Material:
    """120mm L/44 M256 smoothbore barrel: forged gun steel with subtle thermal blush & muzzle carbon soot kiss."""
    mat = bpy.data.materials.new("T_GunSteelMuzzle")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 0.35
    n_soot.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_soot.inputs["Vector"])

    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = 468.0
    mr.inputs["From Max"].default_value = 513.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.28, 0.29, 0.31)
    cr.elements[1].position = 0.58
    cr.elements[1].color = srgb_to_lin(0.27, 0.25, 0.24)  # Subtle warm propellant temper blush
    el2 = cr.elements.new(0.84)
    el2.color = srgb_to_lin(0.20, 0.20, 0.21)
    el3 = cr.elements.new(0.96)
    el3.color = srgb_to_lin(0.15, 0.15, 0.16)  # Subtle matte propellant soot crown (zero black crush)
    nt.links.new(mr.outputs["Result"], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.clamp = True
    rr.inputs["From Min"].default_value = 0.65
    rr.inputs["From Max"].default_value = 1.00
    rr.inputs["To Min"].default_value = 0.29
    rr.inputs["To Max"].default_value = 0.60
    nt.links.new(mr.outputs["Result"], rr.inputs["Value"])

    rm = nt.nodes.new("ShaderNodeMapRange")
    rm.clamp = True
    rm.inputs["From Min"].default_value = 0.72
    rm.inputs["From Max"].default_value = 1.00
    rm.inputs["To Min"].default_value = 0.89
    rm.inputs["To Max"].default_value = 0.42
    nt.links.new(mr.outputs["Result"], rm.inputs["Value"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Result"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.25
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.09
    bump.inputs["Distance"].default_value = 0.25
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_turbine_exhaust_mat() -> bpy.types.Material:
    """Honeywell AGT1500 500C rear exhaust louver grille: scorched gunmetal, blue-brown thermal oxidation & jet soot streaking."""
    mat = bpy.data.materials.new("H_TurbineExhaust")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Distance from exhaust plume centerline (Blender Y == -Three.js Z, core plume within |Z| < 65 cm)
    abs_y = nt.nodes.new("ShaderNodeMath")
    abs_y.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Y"], abs_y.inputs[0])

    # Streaky exhaust turbulence along blast flow
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.14, 0.045, 0.09)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    n_jet = nt.nodes.new("ShaderNodeTexNoise")
    n_jet.inputs["Scale"].default_value = 1.0
    n_jet.inputs["Detail"].default_value = 7.0
    n_jet.inputs["Roughness"].default_value = 0.66
    nt.links.new(mp.outputs["Vector"], n_jet.inputs["Vector"])

    mr_plume = nt.nodes.new("ShaderNodeMapRange")
    mr_plume.clamp = True
    mr_plume.inputs["From Min"].default_value = 0.0
    mr_plume.inputs["From Max"].default_value = 84.0
    mr_plume.inputs["To Min"].default_value = 0.0
    mr_plume.inputs["To Max"].default_value = 1.0
    nt.links.new(abs_y.outputs["Value"], mr_plume.inputs["Value"])

    mix_heat = nt.nodes.new("ShaderNodeMix")
    mix_heat.data_type = "FLOAT"
    mix_heat.inputs["Factor"].default_value = 0.34
    nt.links.new(mr_plume.outputs["Result"], mix_heat.inputs[2])
    nt.links.new(n_jet.outputs["Fac"], mix_heat.inputs[3])

    # Core jet soot -> iridescent blue-steel temper -> bronze-brown heat oxidation -> scorched gunmetal!
    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.08
    cr.elements[0].color = srgb_to_lin(0.11, 0.11, 0.12)   # Carbon jet-soot core (above 0.10, zero crush)
    el1 = cr.elements.new(0.32)
    el1.color = srgb_to_lin(0.20, 0.21, 0.28)              # Heat-blued steel oxidation
    el2 = cr.elements.new(0.56)
    el2.color = srgb_to_lin(0.36, 0.26, 0.18)              # Straw-bronze high-temp temper tint
    cr.elements[1].position = 0.85
    cr.elements[1].color = srgb_to_lin(0.24, 0.24, 0.26)   # Scorched gunmetal outer housing
    nt.links.new(mix_heat.outputs[0], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.08
    rr.color_ramp.elements[0].color = (0.82, 0.82, 0.82, 1.0)  # Matte carbon soot
    el_r = rr.color_ramp.elements.new(0.45)
    el_r.color = (0.34, 0.34, 0.34, 1.0)                       # Heat-oxidized metallic sheen
    rr.color_ramp.elements[1].position = 0.88
    rr.color_ramp.elements[1].color = (0.44, 0.44, 0.44, 1.0)
    nt.links.new(mix_heat.outputs[0], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.08
    rm.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)  # Soot coated
    el_m = rm.color_ramp.elements.new(0.42)
    el_m.color = (0.86, 0.86, 0.86, 1.0)                       # Tempered alloy steel
    rm.color_ramp.elements[1].position = 0.88
    rm.color_ramp.elements[1].color = (0.78, 0.78, 0.78, 1.0)
    nt.links.new(mix_heat.outputs[0], rm.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.65
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.45
    nt.links.new(n_jet.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_copper_recuperator_mat() -> bpy.types.Material:
    """Honeywell AGT1500 iconic warm copper-bronze annular recuperator heat-exchanger core."""
    mat = bpy.data.materials.new("TB_CopperRecup")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 0.95
    wave.inputs["Distortion"].default_value = 0.3
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.74, 0.38, 0.16)
    mix_c.inputs[7].default_value = srgb_to_lin(0.90, 0.56, 0.26)
    nt.links.new(wave.outputs["Fac"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.21
    bsdf.inputs["Metallic"].default_value = 0.95

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.22
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: Hull Armor, Side Skirts, Wheels, Tracks, Engine Deck, Torsion Bars, Turret Ring ---
        "H_CarcTan": _build_pbr_mat(
            "H_CarcTan", base_srgb=(0.56, 0.48, 0.35), dust_srgb=(0.67, 0.60, 0.46),
            roughness=0.82, metallic=0.02, bevel_r=2.0, edge_wear=0.62,
            edge_srgb=(0.30, 0.32, 0.34), grain_scale=0.68, grain_bump=0.35,
            voronoi_grain=0.42, voronoi_scale=1.9, rough_var=0.10, streak_amt=0.18,
            lower_dust=0.68, dust_z_min=-68.0, dust_z_max=-8.0,
        ),
        "H_CarcTanHero": _build_pbr_mat(
            "H_CarcTanHero", base_srgb=(0.57, 0.49, 0.36), dust_srgb=(0.66, 0.58, 0.44),
            roughness=0.80, metallic=0.02, bevel_r=1.5, edge_wear=0.45,
            edge_srgb=(0.30, 0.32, 0.34), grain_scale=0.62, grain_bump=0.28,
            voronoi_grain=0.36, voronoi_scale=1.8, rough_var=0.10, streak_amt=0.15,
            lower_dust=0.36, dust_z_min=-34.0, dust_z_max=-10.0,
        ),
        "H_CarcDark": _build_pbr_mat(
            "H_CarcDark", base_srgb=(0.45, 0.38, 0.28), dust_srgb=(0.59, 0.52, 0.39),
            roughness=0.84, metallic=0.04, bevel_r=1.5, edge_wear=0.65,
            edge_srgb=(0.28, 0.30, 0.33), grain_scale=0.78, grain_bump=0.36,
            voronoi_grain=0.46, voronoi_scale=2.2, rough_var=0.10, streak_amt=0.18,
            lower_dust=0.58, dust_z_min=-64.0, dust_z_max=-6.0,
        ),
        "H_RoadWheelDish": _build_pbr_mat(
            "H_RoadWheelDish", base_srgb=(0.56, 0.49, 0.36), dust_srgb=(0.69, 0.62, 0.48),
            roughness=0.92, metallic=0.02, bevel_r=1.1, edge_wear=0.44,
            edge_srgb=(0.32, 0.34, 0.36), grain_scale=0.95, grain_bump=0.38,
            voronoi_grain=0.52, voronoi_scale=2.4, rough_var=0.04, streak_amt=0.10,
            lower_dust=0.72, dust_z_min=-26.0, dust_z_max=18.0,
        ),
        "H_RoadWheelHubOil": _build_pbr_mat(
            "H_RoadWheelHubOil", base_srgb=(0.19, 0.16, 0.12), dust_srgb=(0.27, 0.22, 0.15),
            roughness=0.24, metallic=0.46, bevel_r=0.9, edge_wear=0.46,
            edge_srgb=(0.54, 0.57, 0.62), grain_scale=1.0, grain_bump=0.20,
            rough_var=0.04, streak_amt=0.14,
        ),
        "H_FuelCapOil": _build_pbr_mat(
            "H_FuelCapOil", base_srgb=(0.25, 0.20, 0.13), dust_srgb=(0.18, 0.14, 0.09),
            roughness=0.23, metallic=0.12, bevel_r=0.65, edge_wear=0.32,
            edge_srgb=(0.48, 0.50, 0.54), grain_scale=0.9, grain_bump=0.16,
            rough_var=0.04, streak_amt=0.12,
        ),
        "H_EngineDeckOil": _build_pbr_mat(
            "H_EngineDeckOil", base_srgb=(0.55, 0.47, 0.35), dust_srgb=(0.64, 0.57, 0.43),
            roughness=0.83, metallic=0.03, bevel_r=1.4, edge_wear=0.58,
            edge_srgb=(0.30, 0.32, 0.35), grain_scale=0.72, grain_bump=0.32,
            voronoi_grain=0.42, voronoi_scale=2.0, rough_var=0.08, streak_amt=0.14,
            oil_stain_amt=0.78, oil_scale=0.038, oil_rough=0.23, oil_srgb=(0.20, 0.16, 0.10),
        ),
        "H_TurbineExhaust": _build_turbine_exhaust_mat(),
        "H_AntiSlip": _build_pbr_mat(
            "H_AntiSlip", base_srgb=(0.43, 0.37, 0.27), dust_srgb=(0.54, 0.47, 0.35),
            roughness=0.94, metallic=0.0, bevel_r=0.9, edge_wear=0.28,
            edge_srgb=(0.34, 0.33, 0.30), grain_scale=1.5, grain_bump=0.54,
            voronoi_grain=0.70, voronoi_scale=3.6, rough_var=0.03, streak_amt=0.08,
        ),
        "H_JetBlastHero": _build_pbr_mat(
            "H_JetBlastHero", base_srgb=(0.56, 0.48, 0.35), roughness=0.52, metallic=0.05,
            bevel_r=0.6, grain_bump=0.08, streak_amt=0.05,
        ),
        "H_DarkArmorSteel": _build_pbr_mat(
            "H_DarkArmorSteel", base_srgb=(0.22, 0.23, 0.24), dust_srgb=(0.46, 0.40, 0.30),
            roughness=0.44, metallic=0.82, bevel_r=1.0, edge_wear=0.68,
            edge_srgb=(0.62, 0.65, 0.70), grain_scale=0.90, grain_bump=0.26,
            voronoi_grain=0.28, rough_var=0.09, streak_amt=0.12,
            lower_dust=0.42, dust_z_min=-38.0, dust_z_max=-10.0,
        ),
        "H_BurnishedTrackSteel": _build_pbr_mat(
            "H_BurnishedTrackSteel", base_srgb=(0.57, 0.60, 0.65), dust_srgb=(0.68, 0.70, 0.74),
            roughness=0.27, metallic=0.92, bevel_r=0.55, edge_wear=0.52,
            edge_srgb=(0.78, 0.81, 0.86), grain_scale=1.15, grain_bump=0.14,
            aniso_stretch=(0.35, 3.2, 3.2), rough_var=0.03, streak_amt=0.04,
        ),
        "H_TowCableSteel": _build_pbr_mat(
            "H_TowCableSteel", base_srgb=(0.26, 0.28, 0.30), dust_srgb=(0.44, 0.39, 0.31),
            roughness=0.38, metallic=0.86, bevel_r=0.35, edge_wear=0.62,
            edge_srgb=(0.62, 0.65, 0.70), grain_scale=2.2, grain_bump=0.36,
            aniso_stretch=(3.5, 0.6, 0.6), rough_var=0.08, streak_amt=0.08,
        ),
        "H_RubberTrack": _build_pbr_mat(
            "H_RubberTrack", base_srgb=(0.17, 0.18, 0.19), dust_srgb=(0.44, 0.39, 0.30),
            roughness=0.92, metallic=0.0, bevel_r=0.75, grain_scale=1.35, grain_bump=0.40,
            voronoi_grain=0.58, voronoi_scale=2.8, rough_var=0.04, streak_amt=0.10,
            lower_dust=0.56, dust_z_min=-38.0, dust_z_max=10.0,
        ),
        "H_GearSteel": _build_pbr_mat(
            "H_GearSteel", base_srgb=(0.64, 0.67, 0.72), roughness=0.24, metallic=0.95,
            bevel_r=0.8, edge_wear=0.35, edge_srgb=(0.82, 0.84, 0.88), grain_scale=0.9, grain_bump=0.14,
            aniso_stretch=(0.4, 3.0, 3.0), streak_amt=0.05,
        ),
        "H_TorsionSteel": _build_pbr_mat(
            "H_TorsionSteel", base_srgb=(0.30, 0.32, 0.36), roughness=0.31, metallic=0.90,
            bevel_r=0.7, edge_wear=0.42, edge_srgb=(0.66, 0.69, 0.74), grain_scale=1.0, grain_bump=0.14,
            streak_amt=0.06,
        ),
        "H_HeadlightLens": _build_pbr_mat(
            "H_HeadlightLens", base_srgb=(0.76, 0.82, 0.88), roughness=0.08, metallic=0.28,
            bevel_r=0.35, grain_bump=0.01, streak_amt=0.0,
        ),

        # --- SUITE 2: Turret Armor, Blow-Off Panels, Chobham/DU Cheeks, 120mm M256 Gun, Breech, CROWS Optics ---
        "T_CarcTan": _build_pbr_mat(
            "T_CarcTan", base_srgb=(0.56, 0.48, 0.35), dust_srgb=(0.66, 0.58, 0.44),
            roughness=0.81, metallic=0.02, bevel_r=2.1, edge_wear=0.64,
            edge_srgb=(0.30, 0.32, 0.34), grain_scale=0.68, grain_bump=0.35,
            voronoi_grain=0.42, voronoi_scale=1.9, rough_var=0.11, streak_amt=0.18,
            lower_dust=0.32, dust_z_min=12.0, dust_z_max=40.0,
        ),
        "T_CarcTanHero": _build_pbr_mat(
            "T_CarcTanHero", base_srgb=(0.57, 0.49, 0.36), dust_srgb=(0.65, 0.57, 0.43),
            roughness=0.80, metallic=0.02, bevel_r=1.4, edge_wear=0.44,
            edge_srgb=(0.30, 0.32, 0.34), grain_scale=0.62, grain_bump=0.28,
            voronoi_grain=0.36, voronoi_scale=1.8, rough_var=0.10, streak_amt=0.16,
        ),
        "T_OliveCanvas": _build_pbr_mat(
            "T_OliveCanvas", base_srgb=(0.33, 0.35, 0.25), dust_srgb=(0.50, 0.46, 0.34),
            roughness=0.93, metallic=0.0, bevel_r=0.55, edge_wear=0.0,
            grain_scale=2.2, grain_bump=0.44, voronoi_grain=0.42, voronoi_scale=4.2,
            rough_var=0.04, streak_amt=0.08,
        ),
        "T_OliveAmmoCan": _build_pbr_mat(
            "T_OliveAmmoCan", base_srgb=(0.24, 0.29, 0.19), dust_srgb=(0.38, 0.37, 0.26),
            roughness=0.60, metallic=0.28, bevel_r=0.65, edge_wear=0.62,
            edge_srgb=(0.56, 0.58, 0.62), grain_scale=1.1, grain_bump=0.22,
            rough_var=0.08, streak_amt=0.10,
        ),
        "T_StowageStrap": _build_pbr_mat(
            "T_StowageStrap", base_srgb=(0.15, 0.16, 0.14), dust_srgb=(0.24, 0.23, 0.19),
            roughness=0.88, metallic=0.0, bevel_r=0.25, grain_scale=2.4, grain_bump=0.32,
            rough_var=0.05, streak_amt=0.04,
        ),
        "T_SpareWheelRubber": _build_pbr_mat(
            "T_SpareWheelRubber", base_srgb=(0.17, 0.18, 0.19), dust_srgb=(0.42, 0.37, 0.28),
            roughness=0.91, metallic=0.0, bevel_r=0.75, grain_scale=1.3, grain_bump=0.36,
            voronoi_grain=0.50, voronoi_scale=2.6, rough_var=0.05, streak_amt=0.08,
        ),
        "T_AntiSlip": _build_pbr_mat(
            "T_AntiSlip", base_srgb=(0.43, 0.37, 0.27), dust_srgb=(0.51, 0.44, 0.33),
            roughness=0.92, metallic=0.0, bevel_r=0.9, edge_wear=0.28,
            edge_srgb=(0.34, 0.33, 0.30), grain_scale=1.4, grain_bump=0.52,
            voronoi_grain=0.68, voronoi_scale=3.4, rough_var=0.06, streak_amt=0.08,
        ),
        "T_ShroudTan": _build_pbr_mat(
            "T_ShroudTan", base_srgb=(0.51, 0.44, 0.33), dust_srgb=(0.60, 0.53, 0.40),
            roughness=0.76, metallic=0.06, bevel_r=1.1, edge_wear=0.48,
            edge_srgb=(0.32, 0.34, 0.36), grain_scale=0.85, grain_bump=0.28,
            voronoi_grain=0.35, rough_var=0.10, streak_amt=0.14,
        ),
        "T_EvacHero": _build_pbr_mat(
            "T_EvacHero", base_srgb=(0.53, 0.46, 0.34), dust_srgb=(0.61, 0.54, 0.41),
            roughness=0.74, metallic=0.06, bevel_r=0.85, edge_wear=0.34,
            grain_scale=0.75, grain_bump=0.22, streak_amt=0.10,
        ),
        "T_GunSteelMuzzle": _build_m256_barrel_mat(),
        "T_DarkGunMetal": _build_pbr_mat(
            "T_DarkGunMetal", base_srgb=(0.21, 0.22, 0.24), roughness=0.36, metallic=0.88,
            bevel_r=1.1, edge_wear=0.64, edge_srgb=(0.62, 0.66, 0.72), grain_scale=0.85, grain_bump=0.24,
            voronoi_grain=0.22, rough_var=0.09, streak_amt=0.10,
        ),
        "T_BreechChrome": _build_pbr_mat(
            "T_BreechChrome", base_srgb=(0.74, 0.77, 0.82), roughness=0.20, metallic=0.96,
            bevel_r=0.7, edge_wear=0.28, edge_srgb=(0.88, 0.90, 0.94), grain_scale=0.9, grain_bump=0.10,
            aniso_stretch=(0.4, 3.2, 3.2), streak_amt=0.04,
        ),
        # Deep realistic obsidian-emerald / germanium-IR multi-coated armored optical glass (NEVER flat neon teal!)
        "T_EmeraldOptics": _build_pbr_mat(
            "T_EmeraldOptics", base_srgb=(0.035, 0.14, 0.12), dust_srgb=(0.14, 0.07, 0.10),
            roughness=0.06, metallic=0.58, bevel_r=0.22, grain_scale=0.4, grain_bump=0.005,
            rough_var=0.02, streak_amt=0.0,
        ),
        # Chobham / DU NERA Multi-Layer Sandwich Firewalled Materials
        "T_ChobhamCeramic": _build_pbr_mat(
            "T_ChobhamCeramic", base_srgb=(0.82, 0.76, 0.62), roughness=0.46, metallic=0.04,
            bevel_r=0.22, grain_scale=2.2, grain_bump=0.034,
        ),
        "T_ChobhamDU": _build_pbr_mat(
            "T_ChobhamDU", base_srgb=(0.30, 0.34, 0.40), roughness=0.26, metallic=0.92,
            bevel_r=0.22, edge_wear=0.38, edge_srgb=(0.68, 0.72, 0.78), grain_scale=1.8, grain_bump=0.028,
        ),
        "T_ChobhamCopper": _build_pbr_mat(
            "T_ChobhamCopper", base_srgb=(0.82, 0.48, 0.24), roughness=0.24, metallic=0.93,
            bevel_r=0.20, grain_scale=1.5, grain_bump=0.022,
        ),

        # --- SUITE 3: Blast Doors, 120mm M829A4 Bustle, AGT1500 Turbine, X1100 Transmission, Fuel, Crew ---
        "TB_BlastDoorHero": _build_pbr_mat(
            "TB_BlastDoorHero", base_srgb=(0.62, 0.65, 0.70), roughness=0.30, metallic=0.86,
            bevel_r=0.24, grain_bump=0.018,
        ),
        "TB_MachinedSteel": _build_pbr_mat(
            "TB_MachinedSteel", base_srgb=(0.66, 0.69, 0.74), roughness=0.24, metallic=0.94,
            bevel_r=0.24, edge_wear=0.26, grain_scale=1.4, grain_bump=0.022, aniso_stretch=(0.4, 3.0, 3.0),
        ),
        "TB_DarkHousing": _build_pbr_mat(
            "TB_DarkHousing", base_srgb=(0.25, 0.27, 0.30), roughness=0.36, metallic=0.84,
            bevel_r=0.32, edge_wear=0.44, edge_srgb=(0.68, 0.71, 0.75), grain_scale=1.6, grain_bump=0.036,
        ),
        "TB_TitaniumBlades": _build_pbr_mat(
            "TB_TitaniumBlades", base_srgb=(0.79, 0.82, 0.87), roughness=0.18, metallic=0.97,
            bevel_r=0.16, edge_wear=0.20, edge_srgb=(0.94, 0.96, 0.99),
            grain_scale=1.2, grain_bump=0.016, aniso_stretch=(3.2, 0.5, 0.5),
        ),
        "TB_CopperRecup": _build_copper_recuperator_mat(),
        "TB_AmmoBrass": _build_pbr_mat(
            "TB_AmmoBrass", base_srgb=(0.86, 0.66, 0.25), roughness=0.20, metallic=0.96,
            bevel_r=0.16, grain_scale=1.4, grain_bump=0.016,
        ),
        "TB_AmmoCombustible": _build_pbr_mat(
            "TB_AmmoCombustible", base_srgb=(0.56, 0.53, 0.36), dust_srgb=(0.62, 0.58, 0.40),
            roughness=0.62, metallic=0.04, bevel_r=0.16, grain_scale=2.0, grain_bump=0.030,
        ),
        "TB_AmmoSabot": _build_pbr_mat(
            "TB_AmmoSabot", base_srgb=(0.76, 0.79, 0.83), roughness=0.24, metallic=0.93,
            bevel_r=0.14, grain_scale=1.5, grain_bump=0.018,
        ),
        "TB_FuelTan": _build_pbr_mat(
            "TB_FuelTan", base_srgb=(0.50, 0.44, 0.34), roughness=0.58, metallic=0.10,
            bevel_r=0.35, grain_scale=1.8, grain_bump=0.032,
        ),
        "TB_CrewPad": _build_pbr_mat(
            "TB_CrewPad", base_srgb=(0.22, 0.24, 0.26), roughness=0.72, metallic=0.02,
            bevel_r=0.28, grain_scale=2.4, grain_bump=0.042,
        ),
        "TB_KneeYellow": _build_pbr_mat(
            "TB_KneeYellow", base_srgb=(0.90, 0.72, 0.14), roughness=0.38, metallic=0.05,
            bevel_r=0.18, grain_bump=0.014,
        ),
        "TB_LcdHero": _build_pbr_mat(
            "TB_LcdHero", base_srgb=(0.10, 0.76, 0.56), roughness=0.14, metallic=0.06,
            bevel_r=0.08, grain_bump=0.004,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh Hard-Surface Modeling Toolkit
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
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else objs[0]


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
        b = min(bevel, min(sx, sy, sz) * 0.22)
        bmesh.ops.bevel(
            bm, geom=list(bm.edges), offset=b, segments=bevel_segs,
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
        b = min(bevel, min(r_top, r_bot) * 0.25, length * 0.22)
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-3]
        if cap_edges:
            bmesh.ops.bevel(
                bm, geom=cap_edges, offset=b, segments=2,
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


def mk_hollow_tube_x(
    name: str, r_out: float, r_in: float, x0: float, x1: float,
    segs: int = 44, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.3, (x1 - x0) * 0.2)
    if b > 1e-3:
        prof = [
            (r_out - b, x0), (r_out, x0 + b), (r_out, x1 - b), (r_out - b, x1),
            (r_in + b, x1), (r_in, x1 - b), (r_in, x0 + b), (r_in + b, x0),
        ]
    else:
        prof = [(r_out, x0), (r_out, x1), (r_in, x1), (r_in, x0)]

    rings = []
    for r, x in prof:
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            ring.append(bm.verts.new((x, r * math.cos(th), r * math.sin(th))))
        rings.append(ring)
    n = len(rings)
    for k in range(n):
        a = rings[k]
        b_ring = rings[(k + 1) % n]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], b_ring[sn], b_ring[s]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_xy(
    name: str, pts_xy: list[tuple[float, float]], depth_z: float, center_z: float = 0.0,
    mat: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
) -> bpy.types.Object:
    """Strictly watertight prism extruded from 2D (tx, ty) polygon along tz in [center_z - d/2, center_z + d/2]."""
    bm = bmesh.new()
    z0 = center_z - depth_z * 0.5
    z1 = center_z + depth_z * 0.5
    v_back = [bm.verts.new((x, y, z0)) for x, y in pts_xy]
    v_front = [bm.verts.new((x, y, z1)) for x, y in pts_xy]
    bm.faces.new(list(reversed(v_back)))
    bm.faces.new(v_front)
    n = len(pts_xy)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_back[i], v_back[j], v_front[j], v_front[i]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_xz(
    name: str, pts_xz: list[tuple[float, float]], y0: float, y1: float,
    mat: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
) -> bpy.types.Object:
    """Strictly watertight prism extruded from 2D (tx, tz) planform polygon along ty in [y0, y1]."""
    bm = bmesh.new()
    v_bot = [bm.verts.new((x, y0, z)) for x, z in pts_xz]
    v_top = [bm.verts.new((x, y1, z)) for x, z in pts_xz]
    bm.faces.new(list(reversed(v_bot)))
    bm.faces.new(v_top)
    n = len(pts_xz)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_bot[i], v_bot[j], v_top[j], v_top[i]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_braided_cable(
    name: str,
    ctrl_pts: list[tuple[float, float, float]],
    radius: float = 1.85,
    segs: int = 12,
    subdiv_per_seg: int = 5,
    twist_rate: float = 0.42,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Strictly watertight 6-strand helically fluted braided steel tow cable swept along 3D Catmull-Rom spline."""
    pts = [Vector(p) for p in ctrl_pts]
    ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    sampled: list[Vector] = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        steps = subdiv_per_seg if i < len(ext) - 3 else subdiv_per_seg + 1
        for k in range(steps):
            t = k / float(subdiv_per_seg)
            t2 = t * t
            t3 = t2 * t
            pos = 0.5 * (
                (2.0 * p1)
                + (-p0 + p2) * t
                + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
                + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
            )
            sampled.append(pos)

    bm = bmesh.new()
    rings = []
    arc_s = 0.0
    prev_n = None
    for idx, p in enumerate(sampled):
        if idx == 0:
            t_vec = (sampled[1] - sampled[0]).normalized()
        elif idx == len(sampled) - 1:
            t_vec = (sampled[-1] - sampled[-2]).normalized()
        else:
            t_vec = (sampled[idx + 1] - sampled[idx - 1]).normalized()
        if idx > 0:
            arc_s += (p - sampled[idx - 1]).length

        if prev_n is None:
            ref = Vector((0.0, 1.0, 0.0)) if abs(t_vec.y) < 0.85 else Vector((1.0, 0.0, 0.0))
            b_vec = t_vec.cross(ref).normalized()
            n_vec = b_vec.cross(t_vec).normalized()
        else:
            n_vec = (prev_n - t_vec * prev_n.dot(t_vec)).normalized()
            b_vec = t_vec.cross(n_vec).normalized()
        prev_n = n_vec

        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            # 6-strand braided steel wire-rope helical lobe silhouette!
            r_loc = radius * (1.0 + 0.13 * math.cos(6.0 * th + arc_s * twist_rate))
            vpos = p + n_vec * (r_loc * math.cos(th)) + b_vec * (r_loc * math.sin(th))
            ring.append(bm.verts.new((vpos.x, vpos.y, vpos.z)))
        rings.append(ring)

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    for k in range(len(rings) - 1):
        a, b_r = rings[k], rings[k + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], b_r[sn], b_r[s]))
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_u_loop(
    prefix: str, cx: float, cy: float, cz: float,
    span: float, height: float, bar_r: float = 0.75,
    axis: str = "x", mat: bpy.types.Material | None = None,
) -> list[bpy.types.Object]:
    """Recessed forged steel tie-down footman loop / grab handle (3 watertight segments)."""
    half = span * 0.5
    if axis == "x":
        return [
            mk_box(f"{prefix}_a", bar_r * 2.0, height, bar_r * 2.0, xform=[("t", cx - half, cy, cz)], mat=mat, bevel=bar_r * 0.25),
            mk_box(f"{prefix}_b", bar_r * 2.0, height, bar_r * 2.0, xform=[("t", cx + half, cy, cz)], mat=mat, bevel=bar_r * 0.25),
            mk_box(f"{prefix}_t", span + bar_r * 2.0, bar_r * 2.0, bar_r * 2.0, xform=[("t", cx, cy + height * 0.5, cz)], mat=mat, bevel=bar_r * 0.25),
        ]
    return [
        mk_box(f"{prefix}_a", bar_r * 2.0, height, bar_r * 2.0, xform=[("t", cx, cy, cz - half)], mat=mat, bevel=bar_r * 0.25),
        mk_box(f"{prefix}_b", bar_r * 2.0, height, bar_r * 2.0, xform=[("t", cx, cy, cz + half)], mat=mat, bevel=bar_r * 0.25),
        mk_box(f"{prefix}_t", bar_r * 2.0, bar_r * 2.0, span + bar_r * 2.0, xform=[("t", cx, cy + height * 0.5, cz)], mat=mat, bevel=bar_r * 0.25),
    ]


def bool_op(target: bpy.types.Object, cutter: bpy.types.Object, op: str = "DIFFERENCE", delete_cutter: bool = True):
    if len(cutter.data.materials) == 0 and len(target.data.materials) > 0:
        cutter.data.materials.append(target.data.materials[0])
    select_only([target], target)
    mod = target.modifiers.new(name="Bool", type="BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_cutter:
        bpy.data.objects.remove(cutter, do_unlink=True)
    for i in range(len(target.data.materials) - 1, -1, -1):
        if target.data.materials[i] is None:
            target.data.materials.pop(index=i)


def join_parts(name: str, objs: list[bpy.types.Object], smooth_angle_deg: float = 38.0) -> bpy.types.Object:
    if len(objs) == 1:
        root = objs[0]
        root.name = name
    else:
        select_only(objs, objs[0])
        bpy.ops.object.join()
        root = bpy.context.active_object
        root.name = name
    root.data.name = name

    for i in range(len(root.data.materials) - 1, -1, -1):
        if root.data.materials[i] is None:
            root.data.materials.pop(index=i)

    angle_rad = math.radians(smooth_angle_deg)
    bm = bmesh.new()
    bm.from_mesh(root.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm.to_mesh(root.data)
    bm.free()
    root.data.update()

    select_only([root], root)
    wn = root.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 50
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    return root


# =============================================================================
# SUITE 1 BUILDERS: M1A2 SEP v3 HULL, SKIRTS, SUSPENSION & TURRET RING (8 PARTS)
# =============================================================================
def build_m1a2_hull_shell(mats) -> bpy.types.Object:
    # 1. Iconic sharp chisel-nose Abrams welded lower hull tub
    lower_prof = [
        (-392.0, -56.0), (-372.0, -72.0), (268.0, -72.0), (397.0, -22.0),
        (186.0, 12.0), (-156.0, 12.0), (-168.0, 22.0), (-388.0, 22.0), (-396.0, -12.0),
    ]
    lower = mk_extrude_xy("hs_lower", lower_prof, 224.0, 0.0, mat=mats["H_CarcTan"])
    # 2. Upper track sponsons flanking Z in [-173, +173] (strictly non-self-intersecting CCW polygon!)
    sponson_prof = [
        (-392.0, -16.0), (320.0, -16.0), (355.0, -24.0), (397.0, -22.0),
        (186.0, 12.0), (-156.0, 12.0), (-168.0, 22.0), (-388.0, 22.0), (-395.0, 14.0),
    ]
    sponson = mk_extrude_xy("hs_sponson", sponson_prof, 346.0, 0.0, mat=mats["H_CarcTan"])
    bool_op(lower, sponson, "UNION")
    sponson_max_z = max(abs(-v.co.y) for v in lower.data.vertices)
    print(f"  [HULL-SPONSON] post-union max(|Z|) = {sponson_max_z:.2f} cm (> 170.0 cm required)")
    assert sponson_max_z > 170.0, f"Hull sponson union dropped! max(|Z|)={sponson_max_z:.2f} cm"

    # 3. TRUE HOLLOW INTERIOR CAVITY (~15-18 cm armor wall thickness) for dramatic cutaway!
    cav_main = mk_box("hs_cav1", 662.0, 62.0, 188.0, xform=[("t", -32.0, -25.0, 0.0)], mat=mats["H_CarcDark"])
    cav_ring = mk_cyl("hs_cav2", 102.0, 102.0, 50.0, axis="y", segs=40, xform=[("t", 20.0, 12.0, 0.0)], mat=mats["H_CarcDark"])
    cav_eng = mk_box("hs_cav3", 218.0, 44.0, 186.0, xform=[("t", -268.0, 12.0, 0.0)], mat=mats["H_CarcDark"])
    bool_op(lower, cav_main, "DIFFERENCE")
    bool_op(lower, cav_ring, "DIFFERENCE")
    bool_op(lower, cav_eng, "DIFFERENCE")
    post_cav_max_z = max(abs(-v.co.y) for v in lower.data.vertices)
    assert post_cav_max_z > 170.0, f"Hull sponson lost during cavity subtraction! max(|Z|)={post_cav_max_z:.2f} cm"

    parts = [lower]
    # 4. Dedicated Front Upper Glacis Hero Stencil Plaque (`3-69 AR / B-21 / ^`) flush on sloped nose!
    parts.append(mk_box(
        "hs_glacis_hero", 72.0, 2.6, 210.0,
        xform=[("rz", -0.16), ("t", 308.0, -6.5, 0.0)],
        mat=mats["H_CarcTanHero"], bevel=0.35,
    ))
    # 5. Driver's low-profile armored hatch ring, hinge, rim bolts & 3 periscope vision hoods w/ glass
    parts.append(mk_box("hs_drv_hatch", 62.0, 4.5, 58.0, xform=[("t", 202.0, 11.5, 0.0)], mat=mats["H_CarcDark"], bevel=0.8))
    parts.append(mk_box("hs_drv_hinge", 14.0, 3.8, 22.0, xform=[("t", 171.0, 13.0, 0.0)], mat=mats["H_DarkArmorSteel"], bevel=0.4))
    for pz in (-18.0, 0.0, 18.0):
        parts.append(mk_box(f"hs_per_{pz}", 12.0, 5.5, 11.0, xform=[("t", 232.0, 9.0, pz)], mat=mats["H_DarkArmorSteel"], bevel=0.4))
        parts.append(mk_box(f"hs_perg_{pz}", 2.2, 3.0, 7.6, xform=[("t", 237.5, 9.2, pz)], mat=mats["H_HeadlightLens"], bevel=0.15))

    # 6. Sculpted Armor Weld Seams along chisel nose lip, glacis knee joint & engine-deck step!
    for wi, wz in enumerate(range(-140, 145, 28)):
        # Chisel nose front weld beads (below glacis stencil)
        parts.append(mk_cyl(f"hs_wnose_{wi}", 1.45, 1.45, 22.0, axis="z", segs=8, xform=[("t", 394.5, -21.8, float(wz))], mat=mats["H_CarcDark"], bevel=0.25))
        # Upper glacis-to-deck transverse weld seam at X=186
        if abs(wz) > 36:
            parts.append(mk_cyl(f"hs_wglac_{wi}", 1.35, 1.35, 22.0, axis="z", segs=8, xform=[("t", 186.0, 12.2, float(wz))], mat=mats["H_CarcDark"], bevel=0.2))
        # Engine-deck step transverse weld seam at X=-168
        parts.append(mk_cyl(f"hs_wstep_{wi}", 1.45, 1.45, 22.0, axis="z", segs=8, xform=[("t", -168.0, 22.1, float(wz))], mat=mats["H_CarcDark"], bevel=0.2))

    # 7. Heavy Braided Front & Rear Tow Cables with Forged Clevis Eye Thimbles!
    # Front tow cable: draped below/forward of glacis stencil between the two front clevis shackles (Z=±76)
    front_cable_pts = [
        (388.5, -35.5, -76.0),
        (386.0, -37.2, -52.0),
        (383.5, -39.2, -24.0),
        (382.5, -39.8, 0.0),
        (383.5, -39.2, 24.0),
        (386.0, -37.2, 52.0),
        (388.5, -35.5, 76.0),
    ]
    parts.append(mk_braided_cable("hs_tow_cable_front", front_cable_pts, radius=1.95, segs=12, subdiv_per_seg=4, mat=mats["H_TowCableSteel"]))
    # Rear tow cable: draped across lower rear transom between rear forged tow pintles (Z=±76, X_min >= -398.5)
    rear_cable_pts = [
        (-395.5, -34.0, -76.0),
        (-396.8, -37.2, -48.0),
        (-397.4, -39.8, -20.0),
        (-397.6, -40.5, 0.0),
        (-397.4, -39.8, 20.0),
        (-396.8, -37.2, 48.0),
        (-395.5, -34.0, 76.0),
    ]
    parts.append(mk_braided_cable("hs_tow_cable_rear", rear_cable_pts, radius=1.95, segs=12, subdiv_per_seg=4, mat=mats["H_TowCableSteel"]))

    # 8. Dual front brush-guarded headlights, forged clevis shackles, fuel spill pans, footman loops & rear taillights
    for sz in (-1.0, 1.0):
        # Armored headlight box + lens + welded tubular brush guard cage
        parts.append(mk_box(f"hs_hl_box_{sz}", 26.0, 16.0, 22.0, xform=[("t", 346.0, -6.0, sz * 144.0)], mat=mats["H_CarcDark"], bevel=0.8))
        parts.append(mk_cyl(f"hs_hl_lens_{sz}", 5.2, 5.2, 7.0, axis="x", segs=20, xform=[("t", 358.5, -6.0, sz * 144.0)], mat=mats["H_HeadlightLens"], bevel=0.3))
        parts.append(mk_box(f"hs_hlg_top_{sz}", 28.0, 1.6, 25.0, xform=[("t", 347.5, 3.2, sz * 144.0)], mat=mats["H_DarkArmorSteel"], bevel=0.25))
        for gz in (-11.5, 11.5):
            parts.append(mk_box(f"hs_hlg_s_{sz}_{gz}", 28.0, 18.0, 1.6, xform=[("t", 347.5, -5.5, sz * 144.0 + gz)], mat=mats["H_DarkArmorSteel"], bevel=0.25))
        for gy in (-10.0, -2.0):
            parts.append(mk_box(f"hs_hlg_f_{sz}_{gy}", 1.6, 1.6, 24.0, xform=[("t", 361.5, gy, sz * 144.0)], mat=mats["H_DarkArmorSteel"], bevel=0.2))

        # Heavy forged front clevis tow shackles + cross pin + cable thimble eye collar
        parts.append(mk_box(f"hs_shackle_{sz}", 22.0, 14.0, 10.0, xform=[("t", 384.0, -36.0, sz * 76.0)], mat=mats["H_DarkArmorSteel"], bevel=0.8))
        parts.append(mk_cyl(f"hs_pin_{sz}", 4.4, 4.4, 16.0, axis="z", segs=18, xform=[("t", 391.0, -36.0, sz * 76.0)], mat=mats["H_BurnishedTrackSteel"], bevel=0.3))
        parts.append(mk_cyl(f"hs_eye_f_{sz}", 3.6, 3.6, 6.5, axis="z", segs=14, xform=[("t", 389.0, -35.5, sz * 76.0)], mat=mats["H_TowCableSteel"], bevel=0.25))

        # Rear forged tow pintle + shackle pin + cable thimble + armored rear blackout taillight housing
        parts.append(mk_box(f"hs_rear_tow_{sz}", 16.0, 12.0, 10.0, xform=[("t", -390.0, -34.0, sz * 76.0)], mat=mats["H_DarkArmorSteel"], bevel=0.6))
        parts.append(mk_cyl(f"hs_rpin_{sz}", 3.8, 3.8, 15.0, axis="z", segs=14, xform=[("t", -395.2, -34.0, sz * 76.0)], mat=mats["H_BurnishedTrackSteel"], bevel=0.25))
        parts.append(mk_box(f"hs_tail_{sz}", 10.0, 10.0, 16.0, xform=[("t", -392.5, 11.0, sz * 142.0)], mat=mats["H_DarkArmorSteel"], bevel=0.5))

        # Segmented armored weld seam along upper hull sponson edge + anti-slip deck grip walkways
        parts.append(mk_box(f"hs_weld_{sz}", 520.0, 2.2, 2.8, xform=[("t", -10.0, 11.5, sz * 171.5)], mat=mats["H_CarcDark"], bevel=0.4))
        parts.append(mk_box(f"hs_grip_fwd_{sz}", 120.0, 1.4, 52.0, xform=[("t", 220.0, 12.2, sz * 124.0)], mat=mats["H_AntiSlip"], bevel=0.3))
        parts.append(mk_box(f"hs_grip_mid_{sz}", 240.0, 1.4, 48.0, xform=[("t", -20.0, 12.2, sz * 136.0)], mat=mats["H_AntiSlip"], bevel=0.3))

        # Recessed armored JP-8 fuel-filler caps + wet dark JP-8 oil-stained catch coaming pans!
        for fx in (148.0, -110.0):
            parts.append(mk_cyl(f"hs_spill_{sz}_{fx}", 13.5, 14.0, 1.0, axis="y", segs=20, xform=[("t", fx, 12.2, sz * 138.0)], mat=mats["H_FuelCapOil"], bevel=0.15))
            parts.append(mk_cyl(f"hs_cap_{sz}_{fx}", 7.5, 8.2, 3.4, axis="y", segs=18, xform=[("t", fx, 13.0, sz * 138.0)], mat=mats["H_FuelCapOil"], bevel=0.35))
            parts.append(mk_box(f"hs_capb_{sz}_{fx}", 12.0, 1.8, 2.4, xform=[("t", fx, 14.8, sz * 138.0)], mat=mats["H_DarkArmorSteel"], bevel=0.25))

        # Recessed forged tie-down footman loops along upper hull sponsons (8 per side = 16 total!)
        for li, (lx, ly, lz) in enumerate((
            (284.0, -1.2, sz * 142.0),
            (184.0, 13.2, sz * 158.0),
            (92.0, 13.2, sz * 160.0),
            (0.0, 13.2, sz * 160.0),
            (-92.0, 13.2, sz * 160.0),
            (-188.0, 23.0, sz * 156.0),
            (-276.0, 23.0, sz * 156.0),
            (-356.0, 23.0, sz * 156.0),
        )):
            parts.extend(mk_u_loop(f"hs_fml_{sz}_{li}", lx, ly, lz, span=9.0, height=3.2, bar_r=0.75, axis="x", mat=mats["H_DarkArmorSteel"]))
    return join_parts("m1a2_hull_shell", parts, smooth_angle_deg=36.0)


def build_m1a2_side_skirts(mats) -> bpy.types.Object:
    parts = []
    panel_xs = (-302.0, -206.0, -110.0, -14.0, 82.0, 178.0, 284.0)
    panel_ws = (93.0, 91.0, 91.0, 91.0, 91.0, 95.0, 117.0)
    seam_xs = (-253.5, -158.0, -62.0, 34.0, 129.0, 225.5)
    for side in (-1.0, 1.0):
        z_pos = side * 178.0
        # Unified crisp Hero outer skin slab (for razor-sharp U.S. Army `^` chevron & `3-69 AR / B-21` markings!)
        parts.append(mk_box(
            f"sk_hero_{side}", 688.0, 62.0, 2.2,
            xform=[("t", -3.0, -1.0, side * 181.6)],
            mat=mats["H_CarcTanHero"], bevel=0.35,
        ))
        for i, (px, pw) in enumerate(zip(panel_xs, panel_ws)):
            thick = 9.0 if i >= 5 else 7.0
            h = 58.0 if i == 0 else (68.0 if i == 6 else 65.0)
            parts.append(mk_box(f"sk_p_{side}_{i}", pw, h, thick, xform=[("t", px, -1.0, z_pos - side * 0.8)], mat=mats["H_CarcTan"], bevel=0.8))

            # Detailed 3-barrel interlocking forged top hinge knuckles + horizontal steel hinge pin (Y in [29..35.5], ZERO stencil overlap!)
            for hx in (-24.0, 24.0):
                hcx = px + hx
                parts.append(mk_box(f"sk_hb_{side}_{i}_{hx}", 16.0, 6.2, 8.2, xform=[("t", hcx, 29.8, z_pos - side * 1.4)], mat=mats["H_CarcDark"], bevel=0.45))
                for k_off in (-5.2, 0.0, 5.2):
                    parts.append(mk_cyl(f"sk_hk_{side}_{i}_{hx}_{k_off}", 2.3, 2.3, 3.6, axis="x", segs=12, xform=[("t", hcx + k_off, 33.4, side * 180.6)], mat=mats["H_DarkArmorSteel"], bevel=0.2))
                parts.append(mk_cyl(f"sk_hp_{side}_{i}_{hx}", 1.15, 1.15, 19.2, axis="x", segs=10, xform=[("t", hcx, 33.4, side * 180.6)], mat=mats["H_BurnishedTrackSteel"], bevel=0.12))

            # Sculpted lower tubular steel skirt lift handles tucked cleanly along bottom skirt edge (Y=-28.5, ZERO stencil overlap!)
            parts.append(mk_box(f"sk_lh_l_{side}_{i}", 2.2, 2.6, 3.2, xform=[("t", px - 7.5, -28.6, side * 183.4)], mat=mats["H_DarkArmorSteel"], bevel=0.25))
            parts.append(mk_box(f"sk_lh_r_{side}_{i}", 2.2, 2.6, 3.2, xform=[("t", px + 7.5, -28.6, side * 183.4)], mat=mats["H_DarkArmorSteel"], bevel=0.25))
            parts.append(mk_box(f"sk_lh_bar_{side}_{i}", 17.2, 2.2, 1.8, xform=[("t", px, -28.6, side * 184.4)], mat=mats["H_DarkArmorSteel"], bevel=0.25))

        # Ballistic panel seam locking cam latches at top & bottom corners (outside all lettering!)
        for si, sx in enumerate(seam_xs):
            for ly in (25.5, -25.5):
                parts.append(mk_box(f"sk_lat_{side}_{si}_{ly}", 5.2, 3.8, 2.4, xform=[("t", sx, ly, side * 183.2)], mat=mats["H_DarkArmorSteel"], bevel=0.25))
        # Armored front fender mudflap lip on Panel #7 (tucked cleanly behind hero outer face so zero corner shadow!)
        parts.append(mk_box(f"sk_mud_{side}", 4.5, 22.0, 10.0, xform=[("rz", 0.22), ("t", 343.2, -23.5, side * 175.8)], mat=mats["H_RubberTrack"], bevel=0.4))
    return join_parts("m1a2_side_skirts", parts, smooth_angle_deg=36.0)


def build_m1a2_road_wheels(mats) -> bpy.types.Object:
    parts = []
    wheel_xs = (-240.0, -162.0, -84.0, -6.0, 72.0, 150.0, 228.0)
    for side in (-1.0, 1.0):
        zc = side * 146.0
        for wi, wx in enumerate(wheel_xs):
            for dz in (-15.0, 15.0):
                # Smooth 40-seg vulcanized rubber tire + deep dusty CARC tan wheel rim & dish
                parts.append(mk_cyl(f"rw_t_{side}_{wi}_{dz}", 30.2, 30.2, 12.2, axis="z", segs=40, xform=[("t", wx, 1.0, zc + dz)], mat=mats["H_RubberTrack"], bevel=1.0))
                parts.append(mk_cyl(f"rw_r_{side}_{wi}_{dz}", 23.6, 23.6, 13.6, axis="z", segs=36, xform=[("t", wx, 1.0, zc + dz)], mat=mats["H_RoadWheelDish"], bevel=0.7))
                parts.append(mk_cyl(f"rw_d_{side}_{wi}_{dz}", 17.5, 19.5, 14.4, axis="z", segs=28, xform=[("t", wx, 1.0, zc + dz)], mat=mats["H_RoadWheelDish"], bevel=0.5))
            # Wet JP-8/axle-oil stained center hub cap + seepage ring + oil-fill hex plug + 8 perimeter hub bolts!
            parts.append(mk_cyl(f"rw_hub_{side}_{wi}", 10.6, 10.6, 48.0, axis="z", segs=24, xform=[("t", wx, 1.0, zc)], mat=mats["H_RoadWheelHubOil"], bevel=0.6))
            parts.append(mk_cyl(f"rw_oilc_{side}_{wi}", 12.4, 12.4, 1.4, axis="z", segs=24, xform=[("t", wx, 1.0, zc + side * 22.1)], mat=mats["H_RoadWheelHubOil"], bevel=0.2))
            parts.append(mk_cyl(f"rw_plug_{side}_{wi}", 3.2, 3.2, 2.4, axis="z", segs=6, xform=[("t", wx, 1.0, zc + side * 24.4)], mat=mats["H_BurnishedTrackSteel"], bevel=0.2))
            for bi in range(8):
                a = bi * math.pi * 0.25
                parts.append(mk_cyl(
                    f"rw_b_{side}_{wi}_{bi}", 1.3, 1.3, 2.2, axis="z", segs=8,
                    xform=[("t", wx + 13.5 * math.cos(a), 1.0 + 13.5 * math.sin(a), zc + side * 22.0)],
                    mat=mats["H_BurnishedTrackSteel"], bevel=0.2,
                ))
            # Heavy forged torsion swingarm linking hull wall to road wheel axle
            parts.append(mk_box(f"rw_arm_{side}_{wi}", 18.0, 12.0, 34.0, xform=[("t", wx - 10.0, 7.0, side * 116.0)], mat=mats["H_CarcDark"], bevel=0.8))

        # Rear 11-tooth armored drive sprocket (X=-320.5, Y=+11, R_tooth=25.8 -> X_min=-345.2, delta=4.2cm <= 5.0cm!)
        sp_x = -320.5
        for dz in (-16.0, 16.0):
            parts.append(mk_cyl(f"ds_ring_{side}_{dz}", 22.6, 22.6, 8.6, axis="z", segs=32, xform=[("t", sp_x, 11.0, zc + dz)], mat=mats["H_DarkArmorSteel"], bevel=0.5))
            for ti in range(11):
                a = ti * 2.0 * math.pi / 11.0
                parts.append(mk_box(
                    f"ds_t_{side}_{dz}_{ti}", 4.2, 6.2, 5.2,
                    xform=[("rz", a), ("t", sp_x + 22.6 * math.cos(a), 11.0 + 22.6 * math.sin(a), zc + dz)],
                    mat=mats["H_BurnishedTrackSteel"], bevel=0.35,
                ))
        parts.append(mk_cyl(f"ds_hub_{side}", 15.8, 15.8, 50.0, axis="z", segs=28, xform=[("t", sp_x, 11.0, zc)], mat=mats["H_RoadWheelHubOil"], bevel=0.6))

        # Front tensioning idler wheel (X=+317.0, Y=+11, R=25.0 -> X_max=+342.0, delta=4.0cm <= 5.0cm!) w/ burnished steel wear rims!
        id_x = 317.0
        for dz in (-14.0, 14.0):
            parts.append(mk_cyl(f"id_w_{side}_{dz}", 24.4, 24.4, 10.6, axis="z", segs=36, xform=[("t", id_x, 11.0, zc + dz)], mat=mats["H_RoadWheelDish"], bevel=0.6))
            parts.append(mk_cyl(f"id_rim_{side}_{dz}", 25.0, 25.0, 3.6, axis="z", segs=36, xform=[("t", id_x, 11.0, zc + dz)], mat=mats["H_BurnishedTrackSteel"], bevel=0.3))
        parts.append(mk_cyl(f"id_h_{side}", 12.5, 12.5, 44.0, axis="z", segs=24, xform=[("t", id_x, 11.0, zc)], mat=mats["H_RoadWheelHubOil"], bevel=0.5))

        # 3 split dual-disc upper track return support rollers (Y=+29, R=7) leaving center slot open for track guide horns!
        for ri, rx in enumerate((-195.0, -45.0, 110.0)):
            for dz in (-12.0, 12.0):
                parts.append(mk_cyl(f"rr_{side}_{ri}_{dz}", 7.0, 7.0, 8.2, axis="z", segs=20, xform=[("t", rx, 29.0, zc + dz)], mat=mats["H_DarkArmorSteel"], bevel=0.4))
                parts.append(mk_cyl(f"rr_r_{side}_{ri}_{dz}", 7.1, 7.1, 2.4, axis="z", segs=20, xform=[("t", rx, 29.0, zc + dz)], mat=mats["H_BurnishedTrackSteel"], bevel=0.2))
            # Dropped U-yoke support bracket beneath guide-horn clearance path
            parts.append(mk_box(f"rr_yoke_{side}_{ri}", 7.0, 5.0, 28.0, xform=[("t", rx, 20.5, zc)], mat=mats["H_CarcDark"], bevel=0.35))
            for dz in (-12.0, 12.0):
                parts.append(mk_box(f"rr_arm_{side}_{ri}_{dz}", 6.0, 9.0, 4.0, xform=[("t", rx, 25.0, zc + dz)], mat=mats["H_CarcDark"], bevel=0.3))
    return join_parts("m1a2_road_wheels", parts, smooth_angle_deg=40.0)


def _sample_t158_pitch_pins() -> list[tuple[float, float]]:
    """Computes exact closed-loop pin-to-pin 2D pitch coordinates (tx, ty) in track local space:
    - 24 dead-flat ground links along [-240, +228] at Y_pitch = -33.10 -> outer rubber pad at EXACT Y = -38.000 cm!
    - True external tangents & circular wraps around front idler (317, 9, R=26.9) & rear sprocket (-319.8, 9, R=27.2)
    - Realistic multi-span upper-run catenary sag over the 3 return rollers (-195, -45, +110)."""
    y_g = -33.10
    # 1. Exact 24 flat ground-contact links from (-240, -33.1) to (+228, -33.1), pitch = 19.50 cm
    n_ground = 24
    ground_pins = [(-240.0 + (468.0 * k / n_ground), y_g) for k in range(n_ground + 1)]

    # 2. Dense curve for the upper/front/rear loop from (+228, -33.1) CCW back to (-240, -33.1)
    # External tangent RW7 (228, -1, R=32.1) -> Front Idler (317, 9, R=26.9)
    rw_y, rw_r = -1.0, 32.1
    id_x, id_y, id_r = 317.0, 9.0, 27.4
    sp_x, sp_y, sp_r = -320.5, 9.0, 28.2

    df = math.hypot(id_x - 228.0, id_y - rw_y)
    phi_f = math.atan2(id_y - rw_y, id_x - 228.0)
    beta_f = math.asin((rw_r - id_r) / df)
    th_f = (phi_f + beta_f) - math.pi * 0.5  # ~ -80.26 deg

    dr = math.hypot(-240.0 - sp_x, rw_y - sp_y)
    phi_r = math.atan2(rw_y - sp_y, -240.0 - sp_x)
    beta_r = math.asin((rw_r - sp_r) / dr)
    th_r = (phi_r - beta_r) - math.pi * 0.5 + 2.0 * math.pi  # ~ +259.26 deg

    dense: list[tuple[float, float]] = [(228.0, y_g)]

    def add_arc(cx: float, cy: float, r: float, a0: float, a1: float, steps: int):
        for s in range(1, steps + 1):
            a = a0 + (a1 - a0) * (s / float(steps))
            dense.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    def add_line(p0: tuple[float, float], p1: tuple[float, float], steps: int):
        for s in range(1, steps + 1):
            u = s / float(steps)
            dense.append((p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u))

    def add_catenary(p0: tuple[float, float], p1: tuple[float, float], sag: float, steps: int):
        for s in range(1, steps + 1):
            u = s / float(steps)
            x = p0[0] + (p1[0] - p0[0]) * u
            y = p0[1] + (p1[1] - p0[1]) * u - sag * 4.0 * u * (1.0 - u)
            dense.append((x, y))

    # Front transition: RW7 bottom -> tangent -> front slope -> Front Idler wrap to top (+90 deg)
    add_arc(228.0, rw_y, rw_r, -math.pi * 0.5, th_f, 8)
    p_rw7_t = (228.0 + rw_r * math.cos(th_f), rw_y + rw_r * math.sin(th_f))
    p_id_t = (id_x + id_r * math.cos(th_f), id_y + id_r * math.sin(th_f))
    add_line(p_rw7_t, p_id_t, 20)
    add_arc(id_x, id_y, id_r, th_f, math.pi * 0.5, 36)

    # Upper-run realistic catenary sag over 3 return rollers (Q0..Q4)
    q0 = (id_x, id_y + id_r)      # (317.0, 35.9)
    q1 = (110.0, 35.7)            # front return roller crest
    q2 = (-45.0, 35.7)            # mid return roller crest
    q3 = (-195.0, 35.7)           # rear return roller crest
    q4 = (sp_x, sp_y + sp_r)      # (-319.8, 36.2) rear drive sprocket crest
    add_catenary(q0, q1, sag=3.0, steps=36)
    add_catenary(q1, q2, sag=2.2, steps=28)
    add_catenary(q2, q3, sag=2.1, steps=28)
    add_catenary(q3, q4, sag=1.6, steps=24)

    # Rear transition: Rear Sprocket wrap -> rear slope -> RW1 bottom (-90 deg = +270 deg)
    add_arc(sp_x, sp_y, sp_r, math.pi * 0.5, th_r, 36)
    p_sp_t = (sp_x + sp_r * math.cos(th_r), sp_y + sp_r * math.sin(th_r))
    p_rw1_t = (-240.0 + rw_r * math.cos(th_r), rw_y + rw_r * math.sin(th_r))
    add_line(p_sp_t, p_rw1_t, 20)
    add_arc(-240.0, rw_y, rw_r, th_r, 1.5 * math.pi, 8)

    # Uniform arc-length resampling along upper/front/rear loop to match ~19.50 cm T158 pitch!
    cum = [0.0]
    for i in range(1, len(dense)):
        cum.append(cum[-1] + math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
    total_rest = cum[-1]
    n_rest = max(44, int(round(total_rest / 19.50)))
    rest_pins: list[tuple[float, float]] = []
    cur = 0
    for k in range(1, n_rest):
        target_s = total_rest * (k / float(n_rest))
        while cur + 1 < len(cum) and cum[cur + 1] < target_s:
            cur += 1
        seg_l = max(cum[cur + 1] - cum[cur], 1e-8)
        f = (target_s - cum[cur]) / seg_l
        x = dense[cur][0] + (dense[cur + 1][0] - dense[cur][0]) * f
        y = dense[cur][1] + (dense[cur + 1][1] - dense[cur][1]) * f
        rest_pins.append((x, y))

    return ground_pins + rest_pins


def _build_track_belt(name: str, mats) -> bpy.types.Object:
    """Museum flagship articulated T158 Bigfoot Double-Pin Track Belt (~77 individual watertight shoes,
    ~15k tris per track, exact Y_min = -38.00 cm ground contact, realistic upper-run catenary sag &
    direct analytical non-overlapping material-firewalled UV packing!)."""
    side_idx = 0 if "left" in name else 1
    pins = _sample_t158_pitch_pins()
    n_links = len(pins)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    # Material slots: 0 = H_RubberTrack, 1 = H_DarkArmorSteel, 2 = H_BurnishedTrackSteel
    MAT_RUBBER, MAT_SHOE, MAT_BURNISH = 0, 1, 2

    def to_bl(mx: float, my: float, tux: float, tuy: float, u: float, w: float, z: float) -> tuple[float, float, float]:
        # Right-handed (t_hat, in_hat, e_z) with det=+1 -> Blender (tx, -tz, ty)
        inx, iny = -tuy, tux
        tx = mx + u * tux + w * inx
        ty = my + u * tuy + w * iny
        return (tx, -z, ty)

    def add_face_uv(verts, uvs, mat_idx: int):
        f = bm.faces.new(verts)
        f.material_index = mat_idx
        for loop, uv_pt in zip(f.loops, uvs):
            loop[uv_layer].uv = uv_pt
        return f

    def cell_rect(zone_u0: float, zone_u1: float, zone_v0: float, zone_v1: float,
                  cols: int, rows: int, cell_idx: int, pad: float = 0.05) -> tuple[float, float, float, float]:
        col = cell_idx % cols
        row = cell_idx // cols
        cw = (zone_u1 - zone_u0) / cols
        ch = (zone_v1 - zone_v0) / rows
        u0 = zone_u0 + (col + pad) * cw
        u1 = zone_u0 + (col + 1.0 - pad) * cw
        v0 = zone_v0 + (row + pad) * ch
        v1 = zone_v0 + (row + 1.0 - pad) * ch
        return u0, u1, v0, v1

    def map_uv(cu0: float, cu1: float, cv0: float, cv1: float, lx: float, ly: float) -> tuple[float, float]:
        return (cu0 + lx * (cu1 - cu0), cv0 + ly * (cv1 - cv0))

    def add_prism_z(
        mx: float, my: float, tux: float, tuy: float,
        prof_uw: list[tuple[float, float]], z0: float, z1: float,
        mat_idx: int, cu0: float, cu1: float, cv0: float, cv1: float,
    ):
        vb = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w, z0)) for u, w in prof_uw]
        vf = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w, z1)) for u, w in prof_uw]
        us = [p[0] for p in prof_uw]
        ws = [p[1] for p in prof_uw]
        umin, umax = min(us), max(us)
        wmin, wmax = min(ws), max(ws)
        du, dw = max(umax - umin, 1e-4), max(wmax - wmin, 1e-4)

        # Back cap (z0, reversed for outward normal) & Front cap (z1)
        uv_b = [map_uv(cu0, cu1, cv0, cv1, 0.04 + 0.42 * ((u - umin) / du), 0.58 + 0.38 * ((w - wmin) / dw)) for u, w in reversed(prof_uw)]
        uv_f = [map_uv(cu0, cu1, cv0, cv1, 0.54 + 0.42 * ((u - umin) / du), 0.58 + 0.38 * ((w - wmin) / dw)) for u, w in prof_uw]
        add_face_uv(list(reversed(vb)), uv_b, mat_idx)
        add_face_uv(vf, uv_f, mat_idx)

        np_len = len(prof_uw)
        for k in range(np_len):
            kn = (k + 1) % np_len
            sx0 = 0.04 + 0.92 * (k / float(np_len))
            sx1 = 0.04 + 0.92 * ((k + 1) / float(np_len))
            add_face_uv(
                (vb[k], vb[kn], vf[kn], vf[k]),
                [
                    map_uv(cu0, cu1, cv0, cv1, sx0, 0.04),
                    map_uv(cu0, cu1, cv0, cv1, sx1, 0.04),
                    map_uv(cu0, cu1, cv0, cv1, sx1, 0.52),
                    map_uv(cu0, cu1, cv0, cv1, sx0, 0.52),
                ],
                mat_idx,
            )

    def add_oct_pad(
        mx: float, my: float, tux: float, tuy: float,
        zc: float, w_out: float, w_in: float,
        cu0: float, cu1: float, cv0: float, cv1: float,
    ):
        hu, hz, ch = 7.0, 12.1, 2.5
        oct_uz = [
            (hu - ch, zc - hz), (hu, zc - hz + ch), (hu, zc + hz - ch), (hu - ch, zc + hz),
            (-hu + ch, zc + hz), (-hu, zc + hz - ch), (-hu, zc - hz + ch), (-hu + ch, zc - hz),
        ]
        v_out = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w_out, z)) for u, z in oct_uz]
        v_in = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w_in, z)) for u, z in oct_uz]

        uv_out = [map_uv(cu0, cu1, cv0, cv1, 0.04 + 0.42 * ((u + hu) / (2 * hu)), 0.36 + 0.60 * ((z - (zc - hz)) / (2 * hz))) for u, z in reversed(oct_uz)]
        uv_in = [map_uv(cu0, cu1, cv0, cv1, 0.54 + 0.42 * ((u + hu) / (2 * hu)), 0.36 + 0.60 * ((z - (zc - hz)) / (2 * hz))) for u, z in oct_uz]
        add_face_uv(list(reversed(v_out)), uv_out, MAT_RUBBER)
        add_face_uv(v_in, uv_in, MAT_RUBBER)

        for k in range(8):
            kn = (k + 1) % 8
            sx0 = 0.04 + 0.92 * (k / 8.0)
            sx1 = 0.04 + 0.92 * ((k + 1) / 8.0)
            add_face_uv(
                (v_out[k], v_out[kn], v_in[kn], v_in[k]),
                [
                    map_uv(cu0, cu1, cv0, cv1, sx0, 0.04),
                    map_uv(cu0, cu1, cv0, cv1, sx1, 0.04),
                    map_uv(cu0, cu1, cv0, cv1, sx1, 0.30),
                    map_uv(cu0, cu1, cv0, cv1, sx0, 0.30),
                ],
                MAT_RUBBER,
            )

    def add_guide_horn(
        mx: float, my: float, tux: float, tuy: float,
        cu0: float, cu1: float, cv0: float, cv1: float,
    ):
        # Tapered trapezoidal steel guide horn protruding inward between dual road wheel discs
        b_pts = [(-4.2, 1.66, -2.1), (4.2, 1.66, -2.1), (4.2, 1.66, 2.1), (-4.2, 1.66, 2.1)]
        t_pts = [(-2.0, 7.60, -1.0), (2.0, 7.60, -1.0), (2.0, 7.60, 1.0), (-2.0, 7.60, 1.0)]
        vb = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w, z)) for u, w, z in b_pts]
        vt = [bm.verts.new(to_bl(mx, my, tux, tuy, u, w, z)) for u, w, z in t_pts]
        tiles = [
            (list(reversed(vb)), (0.02, 0.17, 0.04, 0.96)),
            (vt,                 (0.18, 0.33, 0.04, 0.96)),
            ([vb[0], vb[1], vt[1], vt[0]], (0.34, 0.49, 0.04, 0.96)),
            ([vb[1], vb[2], vt[2], vt[1]], (0.50, 0.65, 0.04, 0.96)),
            ([vb[2], vb[3], vt[3], vt[2]], (0.66, 0.81, 0.04, 0.96)),
            ([vb[3], vb[0], vt[0], vt[3]], (0.82, 0.97, 0.04, 0.96)),
        ]
        for fv, (x0, x1, y0, y1) in tiles:
            add_face_uv(
                fv,
                [
                    map_uv(cu0, cu1, cv0, cv1, x0, y0),
                    map_uv(cu0, cu1, cv0, cv1, x1, y0),
                    map_uv(cu0, cu1, cv0, cv1, x1, y1),
                    map_uv(cu0, cu1, cv0, cv1, x0, y1),
                ],
                MAT_BURNISH,
            )

    # Precompute unit tangents for every link and averaged tangents at every pin joint
    link_tans = []
    for i in range(n_links):
        p0 = pins[i]
        p1 = pins[(i + 1) % n_links]
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        dl = max(math.hypot(dx, dy), 1e-6)
        link_tans.append((dx / dl, dy / dl))

    # Firewalled non-overlapping grid UV zones inside hull_armor atlas (v in [0.010, 0.200]):
    # Left track takes bottom half v in [0.010, 0.102], Right track takes top half v in [0.108, 0.200]!
    tv0, tv1 = (0.010, 0.102) if side_idx == 0 else (0.108, 0.200)
    cols_shoe = 10
    rows_shoe = (n_links + cols_shoe - 1) // cols_shoe
    cols_pad = 16
    rows_pad = (2 * n_links + cols_pad - 1) // cols_pad

    shoe_prof = [
        (-7.0, -1.90), (7.0, -1.90), (7.6, -1.30), (7.6, 1.10),
        (7.0, 1.70), (-7.0, 1.70), (-7.6, 1.10), (-7.6, -1.30),
    ]
    ec_prof = [
        (-3.2, -2.05), (3.2, -2.05), (3.85, -1.25), (3.85, 1.25),
        (3.2, 2.05), (-3.2, 2.05), (-3.85, 1.25), (-3.85, -1.25),
    ]
    pin_prof = [(1.32 * math.cos(2.0 * math.pi * s / 8.0), 1.32 * math.sin(2.0 * math.pi * s / 8.0)) for s in range(8)]

    for i in range(n_links):
        p0 = pins[i]
        p1 = pins[(i + 1) % n_links]
        mx, my = 0.5 * (p0[0] + p1[0]), 0.5 * (p0[1] + p1[1])
        tux, tuy = link_tans[i]

        # 1. Forged Steel Track Shoe Frame (H_DarkArmorSteel zone u in [0.822, 0.904])
        su0, su1, sv0, sv1 = cell_rect(0.822, 0.904, tv0, tv1, cols_shoe, rows_shoe, i, pad=0.05)
        add_prism_z(mx, my, tux, tuy, shoe_prof, -28.8, 28.8, MAT_SHOE, su0, su1, sv0, sv1)

        # 2. Twin Octagonal Bigfoot Rubber Road Pads (H_RubberTrack zone u in [0.635, 0.810], outer face w=-4.90 -> Y=-38.00 cm!)
        for pi, zc in enumerate((-14.6, 14.6)):
            pu0, pu1, pv0, pv1 = cell_rect(0.635, 0.810, tv0, tv1, cols_pad, rows_pad, 2 * i + pi, pad=0.05)
            add_oct_pad(mx, my, tux, tuy, zc, w_out=-4.90, w_in=-1.86, cu0=pu0, cu1=pu1, cv0=pv0, cv1=pv1)

        # 3. Burnished High-Friction Steel Sub-Parts (H_BurnishedTrackSteel zone u in [0.916, 0.992])
        bu0, bu1, bv0, bv1 = cell_rect(0.916, 0.992, tv0, tv1, cols_shoe, rows_shoe, i, pad=0.04)
        bh = bv1 - bv0
        bw = bu1 - bu0
        # 3a. Twin Double-Pin Steel Barrels at u = ±6.75
        for p_idx, u_off in enumerate((-6.75, 6.75)):
            px_prof = [(u_off + pu, pw) for pu, pw in pin_prof]
            au0 = bu0 + (0.02 if p_idx == 0 else 0.51) * bw
            au1 = bu0 + (0.49 if p_idx == 0 else 0.98) * bw
            add_prism_z(mx, my, tux, tuy, px_prof, -30.9, 30.9, MAT_BURNISH, au0, au1, bv0 + 0.68 * bh, bv0 + 0.98 * bh)

        # 3b. Twin Outer Forged End-Connectors clamped across pin joint P_i (|Z| = 32.00 cm!)
        t_prev = link_tans[(i - 1) % n_links]
        atx, aty = t_prev[0] + tux, t_prev[1] + tuy
        al = max(math.hypot(atx, aty), 1e-6)
        atx, aty = atx / al, aty / al
        for ec_idx, z_ec in enumerate((-30.5, 30.5)):
            eu0 = bu0 + (0.02 if ec_idx == 0 else 0.51) * bw
            eu1 = bu0 + (0.49 if ec_idx == 0 else 0.98) * bw
            add_prism_z(p0[0], p0[1], atx, aty, ec_prof, z_ec - 1.5, z_ec + 1.5, MAT_BURNISH, eu0, eu1, bv0 + 0.35 * bh, bv0 + 0.65 * bh)

        # 3c. Central Sculpted Tapered Guide Horn riding between dual road wheels & return rollers
        add_guide_horn(mx, my, tux, tuy, bu0 + 0.02 * bw, bu0 + 0.98 * bw, bv0 + 0.02 * bh, bv0 + 0.32 * bh)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    angle_rad = math.radians(36.0)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False

    ys_three = [v.co.z for v in bm.verts]
    min_y_local = min(ys_three)
    print(f"  [TRACK] {name}: {n_links} articulated T158 shoes | local_Y_min={min_y_local:.3f} cm (world={min_y_local - 82.0:.3f} cm)")
    assert abs(min_y_local - (-38.0)) < 0.05, f"{name} ground contact drifted: local_Y_min={min_y_local:.3f} cm"

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mats["H_RubberTrack"])
    obj.data.materials.append(mats["H_DarkArmorSteel"])
    obj.data.materials.append(mats["H_BurnishedTrackSteel"])
    obj.data.update()

    select_only([obj], obj)
    wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 50
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


def build_m1a2_engine_deck(mats) -> bpy.types.Object:
    parts = [
        # Engine deck armor rails & center access spine w/ wet JP-8 / hydraulic oil seam staining!
        mk_box("ed_rail_l", 234.0, 8.0, 22.0, xform=[("t", -4.0, 4.0, -106.0)], mat=mats["H_EngineDeckOil"], bevel=0.8),
        mk_box("ed_rail_r", 234.0, 8.0, 22.0, xform=[("t", -4.0, 4.0, 106.0)], mat=mats["H_EngineDeckOil"], bevel=0.8),
        mk_box("ed_fwd", 36.0, 9.0, 234.0, xform=[("t", 96.0, 4.0, 0.0)], mat=mats["H_EngineDeckOil"], bevel=0.8),
        mk_box("ed_aft", 28.0, 9.0, 234.0, xform=[("t", -108.0, 4.0, 0.0)], mat=mats["H_EngineDeckOil"], bevel=0.8),
        mk_box("ed_spine", 184.0, 9.0, 32.0, xform=[("t", -8.0, 4.5, 0.0)], mat=mats["H_EngineDeckOil"], bevel=0.8),
        # Dedicated Hero Warning Plate atop rear exhaust lip (`DANGER JET BLAST / EXHAUST`) — 100% unobstructed!
        mk_box("ed_jet_hero", 24.0, 2.2, 138.0, xform=[("t", -108.0, 8.2, 0.0)], mat=mats["H_JetBlastHero"], bevel=0.2),
        # Rear AGT1500 jet-blast vertical exhaust louver housing (scorched gunmetal + blue-brown heat oxidation + soot!)
        mk_box("ed_exh_box", 14.0, 22.0, 164.0, xform=[("t", -115.0, -3.0, 0.0)], mat=mats["H_TurbineExhaust"], bevel=0.6),
    ]
    # Intake cooling louver blades + crosswise support bars
    for i, x in enumerate(range(-88, 72, 12)):
        parts.append(mk_box(f"ed_ll_{i}", 5.5, 6.8, 74.0, xform=[("rz", 0.18), ("t", float(x), 4.8, -56.0)], mat=mats["H_DarkArmorSteel"], bevel=0.35))
        parts.append(mk_box(f"ed_lr_{i}", 5.5, 6.8, 74.0, xform=[("rz", 0.18), ("t", float(x), 4.8, 56.0)], mat=mats["H_DarkArmorSteel"], bevel=0.35))
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"ed_div_{side}", 168.0, 2.6, 3.2, xform=[("t", -10.0, 7.2, side * 56.0)], mat=mats["H_CarcDark"], bevel=0.25))
        # Deck lift handles & quick-release deck fastener bolts along perimeter rails
        for hx in (-70.0, 56.0):
            parts.extend(mk_u_loop(f"ed_hdl_{side}_{hx}", hx, 8.2, side * 106.0, span=10.0, height=2.2, bar_r=0.65, axis="x", mat=mats["H_DarkArmorSteel"]))
        for bx in (-84.0, -40.0, 8.0, 54.0, 96.0):
            parts.append(mk_cyl(f"ed_blt_{side}_{bx}", 1.3, 1.3, 1.6, axis="y", segs=6, xform=[("t", bx, 8.6, side * 98.0)], mat=mats["H_BurnishedTrackSteel"], bevel=0.15))
    # Rear jet-exhaust horizontal deflector louvers + vertical flow-straightener vanes (H_TurbineExhaust!)
    for j, y in enumerate((-11.0, -6.0, -1.0, 4.0)):
        parts.append(mk_box(f"ed_exl_{j}", 16.0, 2.2, 152.0, xform=[("rz", -0.14), ("t", -116.0, y, 0.0)], mat=mats["H_TurbineExhaust"], bevel=0.3))
    for k, vz in enumerate((-56.0, -28.0, 0.0, 28.0, 56.0)):
        parts.append(mk_box(f"ed_vane_{k}", 15.0, 18.0, 2.0, xform=[("t", -116.5, -3.5, vz)], mat=mats["H_TurbineExhaust"], bevel=0.25))
    return join_parts("m1a2_engine_deck", parts, smooth_angle_deg=36.0)


def build_m1a2_torsion_bars(mats) -> bpy.types.Object:
    parts = []
    for i, wx in enumerate((-240.0, -162.0, -84.0, -6.0, 72.0, 150.0, 228.0)):
        parts.append(mk_cyl(f"tb_a_{i}", 2.6, 2.6, 232.0, axis="z", segs=18, xform=[("t", wx - 5.5, -1.5, 0.0)], mat=mats["H_TorsionSteel"], bevel=0.25))
        parts.append(mk_cyl(f"tb_b_{i}", 2.6, 2.6, 232.0, axis="z", segs=18, xform=[("t", wx + 5.5, 1.5, 0.0)], mat=mats["H_GearSteel"], bevel=0.25))
        parts.append(mk_box(f"tb_al_{i}", 18.0, 9.0, 10.0, xform=[("t", wx, 0.0, -112.0)], mat=mats["H_DarkArmorSteel"], bevel=0.5))
        parts.append(mk_box(f"tb_ar_{i}", 18.0, 9.0, 10.0, xform=[("t", wx, 0.0, 112.0)], mat=mats["H_DarkArmorSteel"], bevel=0.5))
    for j, dx in enumerate((-258.0, 162.0, 248.0)):
        for side in (-1.0, 1.0):
            parts.append(mk_cyl(f"tb_d_{j}_{side}", 5.5, 5.5, 16.0, axis="z", segs=20, xform=[("t", dx, 0.0, side * 108.0)], mat=mats["H_CarcDark"], bevel=0.4))
    return join_parts("m1a2_torsion_bars", parts, smooth_angle_deg=40.0)


def build_m1a2_turret_ring(mats) -> bpy.types.Object:
    ring = mk_cyl("tr_out", 108.0, 108.0, 14.0, axis="y", segs=56, mat=mats["H_GearSteel"], bevel=0.7)
    hole = mk_cyl("tr_in", 94.0, 94.0, 22.0, axis="y", segs=56, mat=mats["H_DarkArmorSteel"])
    bool_op(ring, hole, "DIFFERENCE")
    parts = [ring]
    for i in range(36):
        a = i * 2.0 * math.pi / 36.0
        parts.append(mk_box(
            f"tr_g_{i}", 4.6, 9.2, 4.6,
            xform=[("ry", -a), ("t", 93.0 * math.cos(a), 0.0, 93.0 * math.sin(a))],
            mat=mats["H_TorsionSteel"], bevel=0.35,
        ))
    # Hydraulic azimuth traverse motor & pinion drive
    parts.append(mk_cyl("tr_mot", 10.5, 10.5, 19.5, axis="y", segs=24, xform=[("t", -72.0, 0.0, -48.0)], mat=mats["H_DarkArmorSteel"], bevel=0.5))
    parts.append(mk_cyl("tr_pin", 6.2, 6.2, 13.0, axis="y", segs=20, xform=[("t", -82.0, 0.0, -48.0)], mat=mats["H_GearSteel"], bevel=0.35))
    return join_parts("m1a2_turret_ring", parts, smooth_angle_deg=40.0)


# =============================================================================
# SUITE 2 BUILDERS: TURRET, CHOBHAM/DU, 120MM M256 GUN, BREECH & CROWS (8 PARTS)
# =============================================================================
def build_m1a2_turret_shell(mats) -> bpy.types.Object:
    # Rear armor bulkhead at X=-243.5 (exact taper z=140.764) creates authentic 19 cm deep open rear bustle stowage basket!
    outer_plan = [
        (228.0, -94.0), (228.0, 94.0), (76.0, 164.0),
        (-243.5, 140.764), (-243.5, -140.764), (76.0, -164.0),
    ]
    shell = mk_extrude_xz("ts_outer", outer_plan, 12.0, 76.0, mat=mats["T_CarcTan"])
    # Carve TRUE HOLLOW interior: fighting bay + bustle bay + blast doorway +
    # TAPERED front cheek NERA pockets (strictly >=16 cm inside outer cheek skin — ZERO wall puncture!) +
    # snug mantlet aperture (88 cm wide x 40 cm tall — flush sealed by 92x42 cm mantlet!) + blow-off cutout!
    cheek_r_plan = [(90.0, 50.0), (210.0, 50.0), (210.0, 84.0), (90.0, 138.0)]
    cheek_l_plan = [(90.0, -138.0), (210.0, -84.0), (210.0, -50.0), (90.0, -50.0)]
    cuts = [
        mk_box("ts_c_crew", 190.0, 52.0, 196.0, xform=[("t", 18.0, 42.0, 0.0)], mat=mats["T_CarcTan"]),
        mk_box("ts_c_bustle", 142.5, 48.0, 246.0, xform=[("t", -163.25, 43.0, 0.0)], mat=mats["T_CarcTan"]),
        mk_box("ts_c_door", 32.0, 44.0, 92.0, xform=[("t", -84.0, 43.0, 0.0)], mat=mats["T_CarcTan"]),
        mk_box("ts_c_mant", 124.0, 40.0, 88.0, xform=[("t", 178.0, 44.0, 0.0)], mat=mats["T_CarcTan"]),
        mk_extrude_xz("ts_c_chr", cheek_r_plan, 22.0, 66.0, mat=mats["T_CarcTan"]),
        mk_extrude_xz("ts_c_chl", cheek_l_plan, 22.0, 66.0, mat=mats["T_CarcTan"]),
        mk_box("ts_c_roof", 138.0, 18.0, 222.0, xform=[("t", -166.0, 74.0, 0.0)], mat=mats["T_CarcTan"]),
    ]
    for c in cuts:
        bool_op(shell, c, "DIFFERENCE")

    parts = [shell]
    # Unobstructed Left & Right Turret Flank Hero Stencil Plates — EXACT flush angle `-side * slope_ry`!
    slope_ry = math.atan2(24.0, 330.0)
    for side in (-1.0, 1.0):
        parts.append(mk_box(
            f"ts_hero_{side}", 312.0, 54.0, 1.8,
            xform=[("ry", -side * slope_ry), ("t", -86.0, 44.0, side * 152.6)],
            mat=mats["T_CarcTanHero"], bevel=0.35,
        ))
        # Combat Identification Panel (CIP) louvered thermal panel mounted cleanly in rear bustle rack (X in [-220, -172])
        parts.append(mk_box(
            f"ts_cip_{side}", 48.0, 32.0, 3.8,
            xform=[("ry", -side * slope_ry), ("t", -196.0, 44.0, side * 147.2)],
            mat=mats["T_ShroudTan"], bevel=0.5,
        ))
        for ry_b in (26.0, 66.0):
            parts.append(mk_box(
                f"ts_bar_{side}_{ry_b}", 106.0, 3.4, 3.4,
                xform=[("ry", -side * slope_ry), ("t", -178.0, ry_b, side * 149.7)],
                mat=mats["T_DarkGunMetal"], bevel=0.4,
            ))
        for bx_st in (-224.0, -178.0, -132.0):
            z_w = 164.0 - (24.0 / 330.0) * (76.0 - bx_st)
            parts.append(mk_box(
                f"ts_bst_{side}_{bx_st}", 3.2, 42.0, 5.5,
                xform=[("t", bx_st, 46.0, side * (z_w + 3.2))],
                mat=mats["T_DarkGunMetal"], bevel=0.3,
            ))
        # Coarse textured anti-slip walkway pads on turret roof cheeks
        parts.append(mk_box(
            f"ts_grip_f_{side}", 118.0, 1.5, 58.0,
            xform=[("t", 128.0, 76.2, side * 86.0)],
            mat=mats["T_AntiSlip"], bevel=0.3,
        ))
        parts.append(mk_box(
            f"ts_grip_m_{side}", 96.0, 1.5, 42.0,
            xform=[("t", -22.0, 76.2, side * 114.0)],
            mat=mats["T_AntiSlip"], bevel=0.3,
        ))
        # Heavy front cheek sculpted weld bead seam + tubular crew grab rails (strictly above flanks, Y <= 79.8!)
        parts.append(mk_box(
            f"ts_weld_chk_{side}", 162.0, 2.6, 2.6,
            xform=[("ry", -side * 0.43), ("t", 150.0, 75.8, side * 127.0)],
            mat=mats["T_ShroudTan"], bevel=0.45,
        ))
        # Welded crew grab rails along upper turret flanks (Y_max = 79.6 <= 81.0!)
        for gx_span in (-42.0, 28.0):
            parts.extend(mk_u_loop(f"ts_grab_{side}_{gx_span}", gx_span, 77.6, side * 136.0, span=46.0, height=3.2, bar_r=0.85, axis="x", mat=mats["T_DarkGunMetal"]))
        # 4 Heavy Forged Turret Lifting Eyes (padeye plate + forged lifting ring collar, Y_max = 80.2 <= 81.0!)
        for lx_e, lz_e in ((196.0, 78.0), (-228.0, 118.0)):
            parts.append(mk_box(f"ts_lugb_{side}_{lx_e}", 14.0, 2.8, 9.0, xform=[("t", lx_e, 76.5, side * lz_e)], mat=mats["T_ShroudTan"], bevel=0.4))
            parts.append(mk_cyl(f"ts_luge_{side}_{lx_e}", 3.4, 3.4, 4.2, axis="z", segs=14, xform=[("t", lx_e, 77.2, side * lz_e)], mat=mats["T_DarkGunMetal"], bevel=0.35))
            parts.append(mk_cyl(f"ts_lugp_{side}_{lx_e}", 1.6, 1.6, 5.4, axis="z", segs=10, xform=[("t", lx_e, 77.2, side * lz_e)], mat=mats["T_BreechChrome"], bevel=0.15))
        # Armored SINCGARS antenna mounting base pads on rear roof
        parts.append(mk_cyl(f"ts_antpad_{side}", 6.5, 7.2, 2.6, axis="y", segs=16, xform=[("t", -98.0, 76.8, side * 96.0)], mat=mats["T_DarkGunMetal"], bevel=0.3))
        # Front cheek armor inspection bolt rows
        for bi in range(4):
            bx_b = 112.0 + bi * 28.0
            bz_b = 164.0 - (70.0 / 152.0) * (bx_b - 76.0)
            parts.append(mk_cyl(
                f"ts_cblt_{side}_{bi}", 1.8, 1.8, 3.0, axis="z", segs=6,
                xform=[("ry", -side * 0.43), ("t", bx_b, 71.0, side * (bz_b + 0.6))],
                mat=mats["T_DarkGunMetal"], bevel=0.2,
            ))

    # =========================================================================
    # PLAN C: REAR BUSTLE WIRE-GRID STOWAGE BASKET & FIELD STOWAGE (`ts_bsk_*`)
    # Strictly inside X in [-262.0, -243.5] (delta=4.0cm <= 5.0cm), Y in [31.5, 72.5] (clears engine deck!)
    # and Z in [-126, +126] (100% BEHIND flank stencils — ZERO overlap with B-21 / 3-69 AR / ^ / 120MM BUSTLE!)
    # =========================================================================
    # 1. Outer tubular steel perimeter frame & side return brackets welded to rear turret bulkhead
    parts.append(mk_box("ts_bsk_top", 2.8, 2.8, 250.0, xform=[("t", -260.6, 65.5, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.35))
    parts.append(mk_box("ts_bsk_bot", 2.8, 2.8, 250.0, xform=[("t", -260.6, 32.5, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.35))
    for side in (-1.0, 1.0):
        for ry_r in (32.5, 49.0, 65.5):
            parts.append(mk_box(f"ts_bsk_sr_{side}_{ry_r}", 19.0, 2.6, 2.6, xform=[("t", -252.0, ry_r, side * 124.5)], mat=mats["T_DarkGunMetal"], bevel=0.3))
        parts.append(mk_box(f"ts_bsk_sv_{side}", 2.6, 34.0, 2.6, xform=[("t", -252.0, 49.0, side * 124.5)], mat=mats["T_DarkGunMetal"], bevel=0.25))
    # 2. Finer rear wire-grid lattice (horizontal mesh rods + 13 vertical mesh rods + floor slats)
    for hy in (39.0, 45.5, 52.0, 58.5):
        parts.append(mk_box(f"ts_bsk_mh_{hy}", 1.3, 1.3, 248.0, xform=[("t", -261.0, hy, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.15))
    for vi, vz in enumerate(range(-120, 121, 20)):
        thick_v = 2.4 if (vi % 3 == 0) else 1.25
        parts.append(mk_box(f"ts_bsk_mv_{vi}", thick_v, 33.0, thick_v, xform=[("t", -260.8, 49.0, float(vz))], mat=mats["T_DarkGunMetal"], bevel=0.15))
    for fi, fx in enumerate((-246.5, -251.5, -256.5)):
        parts.append(mk_box(f"ts_bsk_fl_{fi}", 2.0, 1.6, 248.0, xform=[("t", fx, 32.2, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.15))
    for rz in (-118.0, -60.0, 0.0, 60.0, 118.0):
        parts.append(mk_box(f"ts_bsk_br_{rz}", 18.0, 2.2, 2.2, xform=[("t", -252.0, 32.0, rz)], mat=mats["T_DarkGunMetal"], bevel=0.2))

    # 3. Stowed Rolled Olive Canvas Tarp / Camo Net + Lower Crew Pack + Dark Cinch Straps (left bay Z in [-118, -32])
    parts.append(mk_cyl("ts_bsk_tarp", 7.1, 7.3, 82.0, axis="z", segs=22, xform=[("t", -252.2, 55.2, -76.0)], mat=mats["T_OliveCanvas"], bevel=0.9))
    parts.append(mk_box("ts_bsk_pack", 14.2, 13.8, 66.0, xform=[("t", -252.0, 40.5, -76.0)], mat=mats["T_OliveCanvas"], bevel=1.8))
    for si, sz_s in enumerate((-104.0, -76.0, -48.0)):
        parts.append(mk_cyl(f"ts_bsk_tstr_{si}", 7.55, 7.55, 2.4, axis="z", segs=20, xform=[("t", -252.2, 55.2, sz_s)], mat=mats["T_StowageStrap"], bevel=0.2))
        parts.append(mk_box(f"ts_bsk_pstr_{si}", 15.0, 14.6, 2.2, xform=[("t", -252.0, 40.5, sz_s)], mat=mats["T_StowageStrap"], bevel=0.2))

    # 4. Strapped Olive Drab .50 Cal / 7.62mm Metal Ammo Cans & Tool Box (center bay Z in [-24, +54])
    ammo_can_specs = (
        ("c1", -12.0, 14.0, 21.0, 20.0, 0.04),
        ("c2",  13.0, 13.5, 19.0, 22.0, -0.05),
        ("c3",  40.0, 14.2, 22.5, 24.0, 0.03),
    )
    for cname, cz, sx, sy, sz, rot_y in ammo_can_specs:
        cy = 33.2 + sy * 0.5
        parts.append(mk_box(f"ts_bsk_{cname}", sx, sy, sz, xform=[("ry", rot_y), ("t", -252.2, cy, cz)], mat=mats["T_OliveAmmoCan"], bevel=0.6))
        parts.append(mk_box(f"ts_bsk_{cname}_lid", sx + 1.0, 2.6, sz + 1.0, xform=[("ry", rot_y), ("t", -252.2, 33.2 + sy + 0.6, cz)], mat=mats["T_OliveAmmoCan"], bevel=0.35))
        parts.append(mk_box(f"ts_bsk_{cname}_hdl", 2.0, 2.0, 9.0, xform=[("ry", rot_y), ("t", -252.2, 33.2 + sy + 2.6, cz)], mat=mats["T_DarkGunMetal"], bevel=0.2))
        parts.append(mk_box(f"ts_bsk_{cname}_str", sx + 1.4, sy + 2.4, 2.4, xform=[("ry", rot_y), ("t", -252.2, cy + 0.5, cz)], mat=mats["T_StowageStrap"], bevel=0.15))

    # 5. Spare Abrams Road Wheel tucked upright inside right bustle basket bay (Z=+88, X in [-258.5, -245.9], Y in [33.0, 72.6])
    sw_x, sw_y, sw_z = -252.2, 52.8, 88.0
    parts.append(mk_cyl("ts_bsk_sw_tire", 19.8, 19.8, 11.4, axis="x", segs=32, xform=[("t", sw_x, sw_y, sw_z)], mat=mats["T_SpareWheelRubber"], bevel=0.9))
    parts.append(mk_cyl("ts_bsk_sw_rim", 15.2, 15.2, 12.2, axis="x", segs=28, xform=[("t", sw_x, sw_y, sw_z)], mat=mats["T_ShroudTan"], bevel=0.6))
    parts.append(mk_cyl("ts_bsk_sw_hub", 7.2, 7.2, 13.0, axis="x", segs=20, xform=[("t", sw_x, sw_y, sw_z)], mat=mats["T_DarkGunMetal"], bevel=0.4))
    for bi in range(6):
        a = bi * math.pi / 3.0
        parts.append(mk_cyl(f"ts_bsk_sw_b_{bi}", 1.0, 1.0, 13.4, axis="x", segs=8, xform=[("t", sw_x, sw_y + 10.2 * math.cos(a), sw_z + 10.2 * math.sin(a))], mat=mats["T_BreechChrome"], bevel=0.12))
    # Diagonal heavy webbing tie-down strap locking the spare road wheel into the basket
    parts.append(mk_box("ts_bsk_sw_str", 13.4, 40.5, 3.0, xform=[("rx", 0.42), ("t", sw_x, sw_y, sw_z)], mat=mats["T_StowageStrap"], bevel=0.2))
    return join_parts("m1a2_turret_shell", parts, smooth_angle_deg=34.0)


def build_m1a2_blowoff_panels(mats) -> bpy.types.Object:
    parts = []
    for i, sz in enumerate((-72.0, 0.0, 72.0)):
        parts.append(mk_box(f"bo_p_{i}", 136.0, 6.2, 68.0, xform=[("t", 0.0, 0.5, sz)], mat=mats["T_CarcTan"], bevel=0.8))
        parts.append(mk_box(f"bo_r_{i}", 122.0, 2.2, 54.0, xform=[("t", 0.0, 3.7, sz)], mat=mats["T_AntiSlip"], bevel=0.45))
        for bx in (-56.0, 0.0, 56.0):
            for dz in (-26.0, 26.0):
                parts.append(mk_cyl(f"bo_b_{i}_{bx}_{dz}", 1.8, 1.8, 2.4, axis="y", segs=12, xform=[("t", bx, 3.7, sz + dz)], mat=mats["T_DarkGunMetal"], bevel=0.25))
    for sz in (-36.0, 36.0):
        parts.append(mk_box(f"bo_s_{sz}", 138.0, 4.0, 5.5, xform=[("t", 0.0, 1.2, sz)], mat=mats["T_DarkGunMetal"], bevel=0.4))
    return join_parts("m1a2_blowoff_panels", parts, smooth_angle_deg=36.0)


def build_m1a2_composite_armor(mats) -> bpy.types.Object:
    """THE PROTECTION SHOWPIECE: 7-layer tapered Chobham / Depleted-Uranium (DU) NERA cheek arrays,
    tucked strictly >=13 cm inside the sealed Desert CARC Tan outer cheek wall for zero t=0 puncture!"""
    layer_mats = (
        mats["T_DarkGunMetal"],    # 1. Outer high-hardness RHA face plate
        mats["T_ChobhamCeramic"],  # 2. Sintered alumina / SiC ceramic tile array
        mats["T_ChobhamDU"],       # 3. Heavy depleted-uranium alloy mesh core
        mats["T_ChobhamCopper"],   # 4. Warm copper-elastomer shock attenuation liner
        mats["T_ChobhamCeramic"],  # 5. Secondary NERA ceramic flyer plate
        mats["T_ChobhamDU"],       # 6. Inner DU spall-arrest plate
        mats["T_BreechChrome"],    # 7. Interior crew-side spall backing plate
    )
    layer_specs = (
        (-46.0, 52.0, 86.0),
        (-31.0, 48.0, 84.0),
        (-16.0, 44.0, 82.0),
        ( -1.0, 40.0, 79.0),
        ( 14.0, 35.0, 76.0),
        ( 29.0, 30.0, 73.0),
        ( 44.0, 24.0, 68.0),
    )
    parts = []
    for side in (-1.0, 1.0):
        rot_y = side * -0.40
        for i, (lm, (lx, span_z, cz)) in enumerate(zip(layer_mats, layer_specs)):
            parts.append(mk_box(
                f"ca_{side}_{i}", 7.2, 36.0, span_z,
                xform=[("ry", rot_y), ("t", lx, 0.0, side * cz)],
                mat=lm, bevel=0.55,
            ))
        # Structural titanium cassette retaining rails tucked cleanly inside the tapered cavity
        for ry in (-17.5, 17.5):
            parts.append(mk_box(
                f"ca_rail_{side}_{ry}", 94.0, 3.0, 9.0,
                xform=[("ry", rot_y), ("t", -4.0, ry, side * 78.0)],
                mat=mats["T_BreechChrome"], bevel=0.4,
            ))
    obj = join_parts("m1a2_composite_armor", parts, smooth_angle_deg=36.0)
    # Mathematical cheek-containment invariant: every vertex strictly >= 12 cm inside outer cheek wall!
    worst_margin = 999.0
    for v in obj.data.vertices:
        wx = v.co.x + 148.0
        wz = abs(-v.co.y)
        z_outer = 164.0 - (70.0 / 152.0) * (wx - 76.0)
        worst_margin = min(worst_margin, z_outer - wz)
    print(f"  [CHEEK-GUARD] m1a2_composite_armor min outer cheek skin margin = {worst_margin:.2f} cm (>= 12.0 cm)")
    assert worst_margin >= 12.0, f"Composite armor pokes too close to outer cheek! margin={worst_margin:.2f} cm"
    return obj


def build_m1a2_main_gun(mats) -> bpy.types.Object:
    parts = [
        # Rear chamber & recoil sleigh journal (X in [0, 105])
        mk_cyl("mg_ch", 11.4, 12.6, 105.0, axis="x", segs=48, xform=[("t", 52.5, 0.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.5),
        # Rear Desert Tan thermal shroud (X in [105, 212])
        mk_cyl("mg_sh1", 10.0, 10.6, 107.0, axis="x", segs=48, xform=[("t", 158.5, 0.0, 0.0)], mat=mats["T_ShroudTan"], bevel=0.4),
        # Iconic Concentric Bore Evacuator / Fume Extractor (X in [212, 282], Hero Stencil Surface!)
        mk_cyl("mg_evac", 13.4, 13.4, 56.0, axis="x", segs=56, xform=[("t", 247.0, 0.0, 0.0)], mat=mats["T_EvacHero"], bevel=0.9),
        mk_cyl("mg_ev_r", 13.4, 10.2, 8.0, axis="x", segs=48, xform=[("t", 215.0, 0.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),
        mk_cyl("mg_ev_f", 9.4, 13.4, 8.0, axis="x", segs=48, xform=[("t", 279.0, 0.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),
        # Forward thermal shroud (X in [282, 492])
        mk_cyl("mg_sh2", 8.4, 9.4, 210.0, axis="x", segs=48, xform=[("t", 387.0, 0.0, 0.0)], mat=mats["T_ShroudTan"], bevel=0.4),
        # Exposed forged smoothbore hollow muzzle crown (X in [492, 513] -> World X = +581.0!)
        mk_hollow_tube_x("mg_muzzle", 8.7, 6.0, 492.0, 513.0, segs=48, bevel=0.45, mat=mats["T_GunSteelMuzzle"]),
        # Muzzle Reference Sensor (MRS) optical collimator mast atop muzzle crown
        mk_box("mg_mrs_post", 5.5, 7.2, 4.2, xform=[("t", 504.5, 11.4, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.4),
        mk_cyl("mg_mrs_head", 2.4, 2.4, 4.8, axis="x", segs=20, xform=[("t", 504.5, 13.0, 0.0)], mat=mats["T_BreechChrome"], bevel=0.25),
    ]
    for i, bx in enumerate((136.0, 184.0, 316.0, 378.0, 442.0, 488.0)):
        parts.append(mk_cyl(f"mg_band_{i}", 9.8, 9.8, 3.8, axis="x", segs=40, xform=[("t", bx, 0.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.25))
    return join_parts("m1a2_main_gun", parts, smooth_angle_deg=42.0)


def build_m1a2_gun_mantlet(mats) -> bpy.types.Object:
    # Flush-fitting armored rotor shield extending to turret front nose (world X in [158, 226], 92x42 cm)
    # cleanly sealing the 88x40 cm turret mantlet aperture with ZERO dark side gaps!
    shield = mk_box("gm_shield", 68.0, 42.0, 92.0, xform=[("t", 44.0, 0.0, 0.0)], mat=mats["T_CarcTan"], bevel=1.4)
    bore = mk_cyl("gm_bore", 13.0, 13.0, 78.0, axis="x", segs=36, xform=[("t", 44.0, 0.0, 0.0)], mat=mats["T_DarkGunMetal"])
    bool_op(shield, bore, "DIFFERENCE")

    parts = [
        shield,
        mk_hollow_tube_x("gm_collar", 17.6, 12.8, 72.0, 86.0, segs=40, bevel=0.6, mat=mats["T_ShroudTan"]),
        # Coaxial 7.62mm M240 machine gun barrel port flush on right mantlet face
        mk_hollow_tube_x("gm_coax", 2.8, 1.2, 64.0, 85.0, segs=20, bevel=0.25, xform=[("t", 0.0, 4.0, 28.0)], mat=mats["T_DarkGunMetal"]),
    ]
    for sz in (-26.0, 26.0):
        parts.append(mk_box(f"gm_chk_{sz}", 54.0, 18.0, 12.0, xform=[("t", -14.0, 0.0, sz * 1.35)], mat=mats["T_DarkGunMetal"], bevel=0.8))
        parts.append(mk_cyl(f"gm_hy1_{sz}", 4.4, 4.4, 62.0, axis="x", segs=24, xform=[("t", -11.0, 13.5, sz * 0.72)], mat=mats["T_BreechChrome"], bevel=0.35))
        parts.append(mk_cyl(f"gm_hy2_{sz}", 4.4, 4.4, 62.0, axis="x", segs=24, xform=[("t", -11.0, -13.5, sz * 0.72)], mat=mats["T_DarkGunMetal"], bevel=0.35))
    return join_parts("m1a2_gun_mantlet", parts, smooth_angle_deg=38.0)


def build_m1a2_breech_block(mats) -> bpy.types.Object:
    ring = mk_box("bb_ring", 48.0, 36.0, 42.0, xform=[("t", 2.0, -1.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=1.4)
    cav = mk_cyl("bb_cav", 8.6, 8.6, 56.0, axis="x", segs=32, xform=[("t", 2.0, 0.0, 0.0)], mat=mats["T_BreechChrome"])
    bool_op(ring, cav, "DIFFERENCE")
    parts = [
        ring,
        mk_box("bb_wedge", 16.0, 30.0, 24.0, xform=[("t", -10.0, -5.0, 0.0)], mat=mats["T_BreechChrome"], bevel=0.8),
        mk_box("bb_crank", 18.0, 6.0, 8.0, xform=[("t", -4.0, -12.0, 18.0)], mat=mats["T_DarkGunMetal"], bevel=0.5),
        mk_cyl("bb_cam", 4.2, 4.2, 10.0, axis="z", segs=20, xform=[("t", 8.0, -14.0, 17.0)], mat=mats["T_BreechChrome"], bevel=0.35),
        mk_box("bb_sol", 22.0, 6.0, 16.0, xform=[("t", 4.0, 16.0, 0.0)], mat=mats["T_DarkGunMetal"], bevel=0.5),
    ]
    return join_parts("m1a2_breech_block", parts, smooth_angle_deg=38.0)


def build_m1a2_crows_optics(mats) -> bpy.types.Object:
    parts = [
        # 1. Gunner's Primary Sight (GPS) armored doghouse on right roof (Z=+62) w/ dual open armored shutter doors!
        mk_box("co_gps_box", 54.0, 26.0, 42.0, xform=[("t", 44.0, -9.0, 62.0)], mat=mats["T_CarcTan"], bevel=1.2),
        mk_box("co_gps_frm", 8.0, 19.0, 30.0, xform=[("t", 72.0, -9.0, 62.0)], mat=mats["T_DarkGunMetal"], bevel=0.5),
        mk_box("co_gps_lens_l", 4.0, 14.0, 10.5, xform=[("t", 75.0, -9.0, 55.8)], mat=mats["T_EmeraldOptics"], bevel=0.3),
        mk_box("co_gps_lens_r", 4.0, 14.0, 10.5, xform=[("t", 75.0, -9.0, 68.2)], mat=mats["T_EmeraldOptics"], bevel=0.3),
        mk_box("co_gps_div", 5.2, 16.0, 2.2, xform=[("t", 74.8, -9.0, 62.0)], mat=mats["T_DarkGunMetal"], bevel=0.2),
        # Open dual armored ballistic shutter doors flanking the GPS optical window
        mk_box("co_gps_shl", 14.0, 18.5, 2.4, xform=[("ry", 0.30), ("t", 76.5, -9.0, 45.5)], mat=mats["T_ShroudTan"], bevel=0.35),
        mk_box("co_gps_shr", 14.0, 18.5, 2.4, xform=[("ry", -0.30), ("t", 76.5, -9.0, 78.5)], mat=mats["T_ShroudTan"], bevel=0.35),
        mk_box("co_gps_brow", 15.0, 2.8, 36.0, xform=[("t", 74.5, 1.2, 62.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),

        # 2. Commander's Independent Thermal Viewer (CITV) rotating turret on left roof (Z=-62)
        mk_cyl("co_citv_b", 18.0, 21.5, 14.0, axis="y", segs=32, xform=[("t", 26.0, -14.0, -62.0)], mat=mats["T_CarcTan"], bevel=0.6),
        mk_cyl("co_citv_col", 19.2, 19.2, 3.2, axis="y", segs=32, xform=[("t", 26.0, -7.2, -62.0)], mat=mats["T_DarkGunMetal"], bevel=0.3),
        mk_cyl("co_citv_h", 16.0, 16.0, 20.0, axis="y", segs=32, xform=[("t", 26.0, 2.0, -62.0)], mat=mats["T_ShroudTan"], bevel=0.6),
        mk_box("co_citv_frm", 10.0, 14.0, 19.0, xform=[("t", 38.5, 3.0, -62.0)], mat=mats["T_DarkGunMetal"], bevel=0.4),
        mk_box("co_citv_lens", 6.0, 11.2, 15.6, xform=[("t", 41.2, 3.0, -62.0)], mat=mats["T_EmeraldOptics"], bevel=0.3),
        mk_box("co_citv_brow", 12.0, 2.4, 22.0, xform=[("t", 40.0, 10.4, -62.0)], mat=mats["T_DarkGunMetal"], bevel=0.3),

        # 3. Commander's Weapon Station (CWS) Cupola + Hatch Lid + CROWS-LP w/ M2HB .50 cal (top Y <= +29.5!)
        mk_cyl("co_cup_flange", 35.5, 36.5, 3.2, axis="y", segs=36, xform=[("t", -38.0, -20.2, 46.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),
        mk_cyl("co_cup", 32.8, 34.8, 11.5, axis="y", segs=36, xform=[("t", -38.0, -14.8, 46.0)], mat=mats["T_CarcTan"], bevel=0.7),
        mk_cyl("co_cup_lid", 25.0, 26.2, 3.6, axis="y", segs=32, xform=[("t", -38.0, -8.4, 46.0)], mat=mats["T_ShroudTan"], bevel=0.5),
        mk_box("co_cup_hinge", 9.0, 3.6, 12.0, xform=[("t", -62.0, -8.2, 46.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),
        mk_box("co_yoke", 22.0, 24.0, 30.0, xform=[("t", -34.0, 2.0, 46.0)], mat=mats["T_ShroudTan"], bevel=0.8),
        mk_box("co_sens", 17.0, 14.5, 14.5, xform=[("t", -22.0, 6.0, 26.0)], mat=mats["T_DarkGunMetal"], bevel=0.5),
        mk_cyl("co_sens_l", 4.2, 4.2, 6.0, axis="x", segs=20, xform=[("t", -12.8, 7.6, 26.0)], mat=mats["T_EmeraldOptics"], bevel=0.25),
        mk_cyl("co_sens_l2", 2.4, 2.4, 5.5, axis="x", segs=16, xform=[("t", -12.8, 2.6, 26.0)], mat=mats["T_EmeraldOptics"], bevel=0.18),
        # M2HB .50 cal machine gun w/ perforated cooling jacket, muzzle crown, feed chute & 400-rd ammo box
        mk_box("co_m2_rec", 46.0, 12.0, 11.0, xform=[("t", -24.0, 20.0, 46.0)], mat=mats["T_DarkGunMetal"], bevel=0.6),
        mk_cyl("co_m2_jkt", 3.6, 3.8, 24.0, axis="x", segs=20, xform=[("t", 10.0, 21.0, 46.0)], mat=mats["T_DarkGunMetal"], bevel=0.25),
        mk_cyl("co_m2_bbl", 2.2, 2.7, 86.0, axis="x", segs=24, xform=[("t", 42.0, 21.0, 46.0)], mat=mats["T_DarkGunMetal"], bevel=0.25),
        mk_cyl("co_m2_fh", 2.9, 2.4, 6.5, axis="x", segs=18, xform=[("t", 82.5, 21.0, 46.0)], mat=mats["T_BreechChrome"], bevel=0.2),
        mk_box("co_m2_box", 26.0, 16.0, 12.0, xform=[("t", -26.0, 15.0, 60.0)], mat=mats["T_CarcTan"], bevel=0.6),
        mk_box("co_m2_chute", 12.0, 6.5, 6.5, xform=[("t", -24.0, 18.5, 53.5)], mat=mats["T_DarkGunMetal"], bevel=0.3),

        # 4. Loader's armored hatch ring, circular hinged lid, pintle mount rail & rotating M17 periscope (Z=-58)!
        mk_cyl("co_ldr", 26.0, 28.0, 8.0, axis="y", segs=32, xform=[("t", -46.0, -17.0, -58.0)], mat=mats["T_CarcTan"], bevel=0.5),
        mk_cyl("co_ldr_lid", 22.8, 23.6, 3.2, axis="y", segs=30, xform=[("t", -46.0, -12.4, -58.0)], mat=mats["T_ShroudTan"], bevel=0.45),
        mk_box("co_ldr_hinge", 8.0, 3.2, 10.0, xform=[("t", -69.5, -13.0, -58.0)], mat=mats["T_DarkGunMetal"], bevel=0.3),
        # Rotating M17 Loader's Armored Periscope Housing + Recessed Ballistic Glass Prism!
        mk_cyl("co_ldr_per_b", 8.2, 9.0, 4.5, axis="y", segs=20, xform=[("t", -35.0, -9.8, -56.0)], mat=mats["T_CarcTan"], bevel=0.4),
        mk_box("co_ldr_per_h", 12.5, 8.2, 13.5, xform=[("t", -34.0, -5.2, -56.0)], mat=mats["T_CarcTan"], bevel=0.6),
        mk_box("co_ldr_per_f", 3.6, 5.2, 10.4, xform=[("t", -28.0, -5.2, -56.0)], mat=mats["T_DarkGunMetal"], bevel=0.25),
        mk_box("co_ldr_per_g", 2.2, 3.6, 8.4, xform=[("t", -26.8, -5.2, -56.0)], mat=mats["T_EmeraldOptics"], bevel=0.15),
        mk_box("co_ldr_per_br", 4.5, 1.4, 12.0, xform=[("t", -27.2, -1.6, -56.0)], mat=mats["T_DarkGunMetal"], bevel=0.15),
        # Stowed M240 Loader's pintle cradle socket on hatch ring
        mk_box("co_ldr_pint", 7.0, 11.0, 6.5, xform=[("t", -22.5, -11.0, -58.0)], mat=mats["T_DarkGunMetal"], bevel=0.35),
    ]
    # 6-Block Armored Vision Periscope Prism Ring around Commander's Cupola (CWS) — sculpted housings + recessed prisms + rain brows!
    for vi in range(6):
        a = vi * math.pi / 3.0
        ca, sa = math.cos(a), math.sin(a)
        # Sloped CARC Tan armored prism hood housing
        parts.append(mk_box(
            f"co_vh_arm_{vi}", 8.5, 9.2, 15.6,
            xform=[("ry", -a), ("t", -38.0 + 32.4 * ca, -14.2, 46.0 + 32.4 * sa)],
            mat=mats["T_CarcTan"], bevel=0.55,
        ))
        # Dark beveled steel prism aperture frame
        parts.append(mk_box(
            f"co_vh_{vi}", 4.2, 6.0, 12.2,
            xform=[("ry", -a), ("t", -38.0 + 35.6 * ca, -14.2, 46.0 + 35.6 * sa)],
            mat=mats["T_DarkGunMetal"], bevel=0.35,
        ))
        # Recessed multi-coated emerald-sapphire ballistic glass prism (catches AR thin-film Fresnel!)
        parts.append(mk_box(
            f"co_vb_{vi}", 2.2, 3.6, 9.2,
            xform=[("ry", -a), ("t", -38.0 + 37.0 * ca, -14.2, 46.0 + 37.0 * sa)],
            mat=mats["T_EmeraldOptics"], bevel=0.18,
        ))
        # Protective top rain-drip eyebrow lip above each vision block
        parts.append(mk_box(
            f"co_vbr_{vi}", 5.0, 1.4, 14.0,
            xform=[("ry", -a), ("t", -38.0 + 35.8 * ca, -10.4, 46.0 + 35.8 * sa)],
            mat=mats["T_DarkGunMetal"], bevel=0.18,
        ))
    return join_parts("m1a2_crows_optics", parts, smooth_angle_deg=38.0)


def build_m1a2_smoke_launchers(mats) -> bpy.types.Object:
    parts = []
    for side in (-1.0, 1.0):
        # Armored M250 4-tube smoke grenade launcher backing flange, brackets & end caps
        parts.append(mk_box(f"sm_plt_{side}", 28.0, 18.0, 8.0, xform=[("t", 44.0, -4.0, side * 158.0)], mat=mats["T_ShroudTan"], bevel=0.6))
        parts.append(mk_box(f"sm_brk_{side}", 18.0, 4.0, 12.0, xform=[("t", 44.0, -11.0, side * 160.0)], mat=mats["T_DarkGunMetal"], bevel=0.35))
        for i in range(4):
            tx_s = 54.0 + (i % 2) * 3.0
            ty_s = 2.0 + (i // 2) * 7.0
            tz_s = side * (163.0 + i * 2.2)
            rz_s = 0.45 + i * 0.05
            ry_s = side * (-0.18 - i * 0.07)
            parts.append(mk_cyl(
                f"sm_t_{side}_{i}", 3.6, 3.8, 28.0, axis="x", segs=20,
                xform=[("rz", rz_s), ("ry", ry_s), ("t", tx_s, ty_s, tz_s)],
                mat=mats["T_DarkGunMetal"], bevel=0.3,
            ))
            # Armored weather cap rim at tube muzzle
            parts.append(mk_cyl(
                f"sm_cap_{side}_{i}", 4.0, 4.0, 2.2, axis="x", segs=18,
                xform=[("t", 13.5, 0.0, 0.0), ("rz", rz_s), ("ry", ry_s), ("t", tx_s, ty_s, tz_s)],
                mat=mats["T_ShroudTan"], bevel=0.2,
            ))

        # Twin Rear-Turret SINCGARS Whip Antennas w/ Armored Guard, Sculpted Spring-Coil Mount & Tapered Mast!
        # Stays strictly inside CSG_REF_BBOX (X_min >= -145.5, Y_max <= 65.5 -> delta <= 3.5 cm <= 5.0 cm!)
        ax, az = -138.0, side * 96.0
        parts.append(mk_cyl(f"ant_base_{side}", 4.6, 5.2, 4.5, axis="y", segs=18, xform=[("t", ax, 19.5, az)], mat=mats["T_ShroudTan"], bevel=0.35))
        parts.append(mk_box(f"ant_grd_{side}", 11.0, 7.5, 11.0, xform=[("t", ax + 1.5, 22.0, az)], mat=mats["T_CarcTan"], bevel=0.5))
        # 5-turn sculpted helical spring-coil flexible shock mount (Y in [23.5..31.5])
        for ci in range(5):
            cy_c = 24.0 + ci * 1.65
            parts.append(mk_cyl(
                f"ant_coil_{side}_{ci}", 2.75, 2.75, 1.15, axis="y", segs=16,
                xform=[("rz", 0.08), ("t", ax, cy_c, az)],
                mat=mats["T_DarkGunMetal"], bevel=0.25,
            ))
        # Machined steel matching-unit coupling ferrule
        parts.append(mk_cyl(f"ant_fer_{side}", 2.1, 2.4, 3.2, axis="y", segs=16, xform=[("t", ax, 32.8, az)], mat=mats["T_BreechChrome"], bevel=0.2))
        # Lower & upper tapered fiberglass whip mast with slight realistic backward wind rake
        parts.append(mk_cyl(f"ant_m1_{side}", 1.15, 1.65, 17.0, axis="y", segs=12, xform=[("rz", 0.045), ("t", ax - 0.5, 42.2, az)], mat=mats["T_DarkGunMetal"], bevel=0.1))
        parts.append(mk_cyl(f"ant_cpl_{side}", 1.45, 1.45, 2.0, axis="y", segs=12, xform=[("t", ax - 1.0, 50.6, az)], mat=mats["T_BreechChrome"], bevel=0.12))
        parts.append(mk_cyl(f"ant_m2_{side}", 0.55, 1.05, 14.5, axis="y", segs=12, xform=[("rz", 0.075), ("t", ax - 1.7, 58.2, az)], mat=mats["T_DarkGunMetal"], bevel=0.08))
        parts.append(mk_cyl(f"ant_tip_{side}", 1.0, 1.0, 1.8, axis="y", segs=10, xform=[("t", ax - 2.3, 65.0, az)], mat=mats["T_DarkGunMetal"], bevel=0.35))
    return join_parts("m1a2_smoke_launchers", parts, smooth_angle_deg=38.0)


# =============================================================================
# SUITE 3 BUILDERS: BLAST DOORS, 120MM BUSTLE, AGT1500 TURBINE & CREW (8 PARTS)
# =============================================================================
def _mk_120mm_round_parts(prefix: str, cx: float, cy: float, cz: float, mats, segs: int = 20) -> list[bpy.types.Object]:
    return [
        mk_cyl(f"{prefix}_st", 7.9, 7.9, 10.5, axis="x", segs=segs, xform=[("t", cx - 43.75, cy, cz)], mat=mats["TB_AmmoBrass"], bevel=0.28),
        mk_cyl(f"{prefix}_rm", 8.4, 8.4, 2.0, axis="x", segs=segs, xform=[("t", cx - 48.0, cy, cz)], mat=mats["TB_MachinedSteel"], bevel=0.18),
        mk_cyl(f"{prefix}_cs", 7.6, 7.8, 49.0, axis="x", segs=segs, xform=[("t", cx - 14.0, cy, cz)], mat=mats["TB_AmmoCombustible"], bevel=0.30),
        mk_cyl(f"{prefix}_sb", 5.8, 7.2, 13.5, axis="x", segs=segs, xform=[("t", cx + 17.2, cy, cz)], mat=mats["TB_AmmoSabot"], bevel=0.25),
        mk_cyl(f"{prefix}_dt", 1.6, 2.0, 22.0, axis="x", segs=max(12, segs - 4), xform=[("t", cx + 34.0, cy, cz)], mat=mats["TB_DarkHousing"], bevel=0.15),
        mk_cyl(f"{prefix}_tp", 0.35, 1.6, 5.0, axis="x", segs=max(12, segs - 4), xform=[("t", cx + 46.5, cy, cz)], mat=mats["TB_MachinedSteel"], bevel=0.08),
    ]


def build_m1a2_blast_doors(mats) -> bpy.types.Object:
    parts = []
    # Twin heavy sliding armored door leaves + Hero Front Face (`+X`) carrying yellow/black hazard & BLAST DOOR markings!
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"bd_leaf_{side}", 9.2, 42.0, 43.0, xform=[("t", -0.2, 0.0, side * 22.5)], mat=mats["TB_MachinedSteel"], bevel=0.7))
        parts.append(mk_box(f"bd_hdl_{side}", 3.0, 14.0, 2.8, xform=[("t", 6.1, 0.0, side * 14.0)], mat=mats["TB_DarkHousing"], bevel=0.3))
        parts.append(mk_box(f"bd_rt_{side}", 11.0, 4.5, 14.0, xform=[("t", 0.0, 19.5, side * 24.0)], mat=mats["TB_DarkHousing"], bevel=0.4))
        parts.append(mk_box(f"bd_rb_{side}", 11.0, 4.5, 14.0, xform=[("t", 0.0, -19.5, side * 24.0)], mat=mats["TB_DarkHousing"], bevel=0.4))
    # Unified crisp front Hero face plate (`+X`, facing forward toward crew & cutaway camera!)
    parts.append(mk_box("bd_hero_front", 1.4, 39.0, 86.0, xform=[("t", 4.6, 0.0, 0.0)], mat=mats["TB_BlastDoorHero"], bevel=0.0))
    return join_parts("m1a2_blast_doors", parts, smooth_angle_deg=36.0)


def build_m1a2_ammo_bustle(mats) -> bpy.types.Object:
    parts = [
        mk_box("ab_back", 9.0, 40.8, 230.0, xform=[("t", -52.5, 0.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.6),
        mk_box("ab_bot", 107.0, 4.0, 232.0, xform=[("t", 0.5, -19.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.5),
        mk_box("ab_top", 107.0, 4.0, 232.0, xform=[("t", 0.5, 19.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.5),
        mk_box("ab_sl", 105.0, 33.6, 5.8, xform=[("t", 0.5, 0.0, -112.8)], mat=mats["TB_DarkHousing"], bevel=0.5),
        mk_box("ab_sr", 105.0, 33.6, 5.8, xform=[("t", 0.5, 0.0, 112.8)], mat=mats["TB_DarkHousing"], bevel=0.5),
        mk_box("ab_bar", 4.0, 3.8, 224.0, xform=[("t", 49.0, 0.0, 0.0)], mat=mats["TB_MachinedSteel"], bevel=0.4),
    ]
    z_slots = (-98.0, -78.0, -58.0, -38.0, -14.0, 14.0, 38.0, 58.0, 78.0, 98.0)
    y_slots = (-9.5, 9.5)
    idx = 0
    for ry in y_slots:
        for rz in z_slots:
            if rz == -14.0 and ry > 0:
                continue  # Leave ready-round extraction tube open!
            idx += 1
            parts.append(mk_hollow_tube_x(f"ab_cell_{idx}", 8.5, 7.9, 22.0, 45.5, segs=16, bevel=0.12, xform=[("t", 0.0, ry, rz)], mat=mats["TB_DarkHousing"]))
            parts.extend(_mk_120mm_round_parts(f"ab_r{idx}", 4.0, ry, rz, mats, segs=16))
    return join_parts("m1a2_ammo_bustle", parts, smooth_angle_deg=40.0)


def build_m1a2_ready_round(mats) -> bpy.types.Object:
    # Hero 36-seg 120x570mm M829A4 APFSDS unitary round w/ 4 stabilizing dart tail fins!
    parts = _mk_120mm_round_parts("rr", 0.0, 0.0, 0.0, mats, segs=36)
    for fi in range(4):
        a = fi * math.pi * 0.5
        parts.append(mk_box(
            f"rr_fin_{fi}", 8.5, 5.6, 0.9,
            xform=[("rx", a), ("t", 27.0, 0.0, 0.0)],
            mat=mats["TB_MachinedSteel"], bevel=0.15,
        ))
    return join_parts("m1a2_ready_round", parts, smooth_angle_deg=42.0)


def build_m1a2_stub_deflector(mats) -> bpy.types.Object:
    parts = [
        mk_box("sd_floor", 54.0, 3.5, 34.0, xform=[("t", -2.0, -16.0, 0.0)], mat=mats["TB_MachinedSteel"], bevel=0.5),
        mk_box("sd_rear", 14.0, 14.0, 34.0, xform=[("t", -23.0, -15.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.5),
    ]
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"sd_w_{side}", 58.0, 22.0, 3.2, xform=[("t", 0.0, -2.0, side * 18.2)], mat=mats["TB_DarkHousing"], bevel=0.45))
        parts.append(mk_box(f"sd_t_{side}", 58.0, 3.5, 5.0, xform=[("t", 0.0, 11.5, side * 17.5)], mat=mats["TB_MachinedSteel"], bevel=0.4))
    for i, x in enumerate((-18.0, -8.0, 2.0, 12.0, 22.0)):
        parts.append(mk_box(f"sd_b_{i}", 2.8, 3.0, 36.0, xform=[("t", x, -19.5, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.3))
    return join_parts("m1a2_stub_deflector", parts, smooth_angle_deg=38.0)


def build_m1a2_agt1500_turbine(mats) -> bpy.types.Object:
    """THE ENGINE SHOWPIECE: Honeywell AGT1500 1,500 SHP Gas Turbine — 5-stage gleaming titanium
    axial compressor rotor + warm copper-bronze pleated cylindrical annular recuperator!"""
    parts = [
        # Forward intake plenum collar & central titanium turbine mainshaft
        mk_cyl("agt_inlet", 24.0, 26.0, 22.0, axis="x", segs=40, xform=[("t", 58.0, 2.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.7),
        mk_cyl("agt_shaft", 7.6, 7.6, 136.0, axis="x", segs=32, xform=[("t", -6.0, 2.0, 0.0)], mat=mats["TB_TitaniumBlades"], bevel=0.35),
        # Upper-left stator half-shroud (leaving +Z right cutaway side WIDE OPEN to showcase titanium blades!)
        mk_box("agt_shroud", 54.0, 14.0, 24.0, xform=[("t", 24.0, 20.0, -16.0)], mat=mats["TB_DarkHousing"], bevel=0.8),
        # Midsection tangential combustor can & power turbine housing
        mk_cyl("agt_comb", 18.0, 18.0, 26.0, axis="x", segs=32, xform=[("t", -8.0, 16.0, -24.0)], mat=mats["TB_MachinedSteel"], bevel=0.6),
        mk_cyl("agt_core", 22.0, 22.0, 34.0, axis="x", segs=36, xform=[("t", -10.0, 2.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.6),
        # ICONIC WARM COPPER-BRONZE ANNULAR CYLINDRICAL RECUPERATOR CORE (X in [-75, -25])
        mk_cyl("agt_recup", 31.4, 31.4, 50.0, axis="x", segs=48, xform=[("t", -50.0, 0.0, 0.0)], mat=mats["TB_CopperRecup"], bevel=0.9),
    ]
    # 5-stage gleaming Titanium Axial Compressor Rotor Hubs + 16 pitched blades per stage!
    for st in range(5):
        sx = 46.0 - st * 10.5
        rad = 22.6 - st * 1.1
        parts.append(mk_cyl(f"agt_hub_{st}", rad * 0.52, rad * 0.52, 4.8, axis="x", segs=28, xform=[("t", sx, 2.0, 0.0)], mat=mats["TB_TitaniumBlades"], bevel=0.25))
        for b in range(16):
            a = b * 2.0 * math.pi / 16.0 + st * 0.18
            parts.append(mk_box(
                f"agt_bl_{st}_{b}", 4.2, rad * 0.56, 1.35,
                xform=[("ry", 0.34), ("rx", a), ("t", sx, 2.0 + math.cos(a) * rad * 0.72, math.sin(a) * rad * 0.72)],
                mat=mats["TB_TitaniumBlades"], bevel=0.18,
            ))
    # 9 Pleated gleaming copper-bronze recuperator fin rings
    for ri, rx in enumerate((-72.0, -66.5, -61.0, -55.5, -50.0, -44.5, -39.0, -33.5, -28.0)):
        parts.append(mk_cyl(f"agt_fin_{ri}", 33.4, 33.4, 2.4, axis="x", segs=48, xform=[("t", rx, 0.0, 0.0)], mat=mats["TB_CopperRecup"], bevel=0.25))
    # Twin side air-filter / oil-cooler accessory housings
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"agt_acc_{side}", 118.0, 30.0, 18.0, xform=[("t", -6.0, -8.0, side * 54.0)], mat=mats["TB_DarkHousing"], bevel=1.0))
    return join_parts("m1a2_agt1500_turbine", parts, smooth_angle_deg=42.0)


def build_m1a2_x1100_transmission(mats) -> bpy.types.Object:
    parts = [
        mk_box("x11_main", 74.0, 52.0, 118.0, xform=[("t", -3.0, 0.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=1.6),
        mk_box("x11_cool", 62.0, 10.0, 106.0, xform=[("t", -3.0, 22.0, 0.0)], mat=mats["TB_MachinedSteel"], bevel=0.8),
    ]
    for i, x in enumerate((-28.0, -16.0, -4.0, 8.0, 20.0)):
        parts.append(mk_box(f"x11_rib_{i}", 3.0, 46.0, 120.0, xform=[("t", x, -1.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.35))
    for side in (-1.0, 1.0):
        parts.append(mk_cyl(f"x11_dr_{side}", 22.0, 24.0, 38.0, axis="z", segs=32, xform=[("t", -2.0, -2.0, side * 76.0)], mat=mats["TB_MachinedSteel"], bevel=0.8))
        parts.append(mk_cyl(f"x11_fl_{side}", 12.0, 12.0, 14.0, axis="z", segs=24, xform=[("t", -2.0, -2.0, side * 91.0)], mat=mats["TB_DarkHousing"], bevel=0.45))
    return join_parts("m1a2_x1100_transmission", parts, smooth_angle_deg=38.0)


def build_m1a2_fuel_cells(mats) -> bpy.types.Object:
    parts = [
        mk_cyl("fc_pipe", 4.2, 4.2, 152.0, axis="z", segs=20, xform=[("t", -46.0, -22.0, 0.0)], mat=mats["TB_CopperRecup"], bevel=0.25),
    ]
    for side in (-1.0, 1.0):
        parts.append(mk_box(f"fc_tank_{side}", 126.0, 48.0, 56.0, xform=[("t", 3.0, -2.0, side * 74.0)], mat=mats["TB_FuelTan"], bevel=1.6))
        parts.append(mk_cyl(f"fc_cap_{side}", 6.5, 7.0, 7.0, axis="y", segs=24, xform=[("t", -24.0, 20.5, side * 74.0)], mat=mats["TB_MachinedSteel"], bevel=0.35))
        parts.append(mk_box(f"fc_valv_{side}", 36.0, 4.0, 26.0, xform=[("t", 18.0, 21.5, side * 74.0)], mat=mats["TB_DarkHousing"], bevel=0.45))
    return join_parts("m1a2_fuel_cells", parts, smooth_angle_deg=36.0)


def build_m1a2_crew_stations(mats) -> bpy.types.Object:
    parts = [
        # 1. Reclined Driver's Couch + Motorcycle T-Bar Steering Yoke & Digital Gauge LCD
        mk_box("cs_drv_b", 68.0, 8.0, 44.0, xform=[("t", 108.0, -36.0, 0.0)], mat=mats["TB_CrewPad"], bevel=0.9),
        mk_box("cs_drv_bk", 52.0, 8.0, 42.0, xform=[("rz", 0.46), ("t", 72.0, -24.0, 0.0)], mat=mats["TB_CrewPad"], bevel=0.9),
        mk_box("cs_drv_yk", 10.0, 14.0, 34.0, xform=[("t", 146.0, -16.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.6),
        mk_box("cs_drv_lcd", 3.2, 10.0, 26.0, xform=[("t", 140.0, -16.0, 0.0)], mat=mats["TB_LcdHero"], bevel=0.0),

        # 2. Suspended Turret Basket Floor & Hanger Struts
        mk_cyl("cs_floor", 84.0, 84.0, 5.5, axis="y", segs=40, xform=[("t", -52.0, -39.0, 0.0)], mat=mats["TB_DarkHousing"], bevel=0.5),

        # 3. Gunner's Seat & SEP v3 Tactical Battle-Management LCD Console
        mk_box("cs_gn_s", 36.0, 8.0, 34.0, xform=[("t", -46.0, -18.0, 48.0)], mat=mats["TB_CrewPad"], bevel=0.7),
        mk_box("cs_gn_b", 8.0, 34.0, 32.0, xform=[("t", -64.0, 0.0, 48.0)], mat=mats["TB_CrewPad"], bevel=0.7),
        mk_box("cs_gn_c", 16.0, 20.0, 28.0, xform=[("t", -6.0, 14.0, 54.0)], mat=mats["TB_DarkHousing"], bevel=0.6),
        mk_box("cs_gn_lcd", 2.8, 14.0, 22.0, xform=[("t", -15.0, 14.0, 54.0)], mat=mats["TB_LcdHero"], bevel=0.0),

        # 4. Commander's Elevated Seat & Dual BFT/JCR Tactical LCD Console
        mk_box("cs_cm_s", 34.0, 8.0, 34.0, xform=[("t", -96.0, 12.0, 48.0)], mat=mats["TB_CrewPad"], bevel=0.7),
        mk_box("cs_cm_b", 8.0, 34.0, 32.0, xform=[("t", -112.0, 30.0, 48.0)], mat=mats["TB_CrewPad"], bevel=0.7),
        mk_box("cs_cm_c", 14.0, 18.0, 26.0, xform=[("t", -68.0, 48.0, 52.0)], mat=mats["TB_DarkHousing"], bevel=0.6),
        mk_box("cs_cm_lcd", 2.8, 13.0, 21.0, xform=[("t", -76.0, 48.0, 52.0)], mat=mats["TB_LcdHero"], bevel=0.0),

        # 5. Loader's Jump Seat & Bright Yellow Blast-Door Knee Switch Pedestal
        mk_box("cs_ld_s", 32.0, 7.0, 30.0, xform=[("t", -86.0, -8.0, -54.0)], mat=mats["TB_CrewPad"], bevel=0.6),
        mk_box("cs_ld_sw", 12.0, 16.0, 12.0, xform=[("t", -116.0, 24.0, -52.0)], mat=mats["TB_KneeYellow"], bevel=0.5),
    ]
    for i, a in enumerate((0.4, 2.5, -0.5, -2.5)):
        parts.append(mk_cyl(f"cs_st_{i}", 2.6, 2.6, 52.0, axis="y", segs=16, xform=[("t", -52.0 + 76.0 * math.cos(a), -12.0, 76.0 * math.sin(a))], mat=mats["TB_MachinedSteel"], bevel=0.2))
    return join_parts("m1a2_crew_stations", parts, smooth_angle_deg=38.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Strict Firewalls (>=50px) + CONCAVE Packing
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    select_face_fn=None,
    skip_face_fn=None,
):
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
    pu_min, pu_max, pv_min, pv_max = 1.0, 0.0, 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None and not select_face_fn(o.name, f, mname):
                continue
            if skip_face_fn is not None and skip_face_fn(o.name, f, mname):
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

    su, sv = pu_max - pu_min, pv_max - pv_min
    print(f"  [UV-PACK] {len(active_objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] span=({su:.3f}, {sv:.3f})")
    assert su > 0.25 and sv > 0.25, f"UV packing collapsed! span=({su}, {sv})"


def unwrap_hull_armor_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        ny = n.z  # Three.js +Y == Blender +Z
        if obj_name == "m1a2_side_skirts" and mat_name == "H_CarcTanHero":
            if nz > 0.85 and tz > 180.0:
                return "sk_right"
            if nz < -0.85 and tz < -180.0:
                return "sk_left"
        if obj_name == "m1a2_hull_shell" and mat_name == "H_CarcTanHero":
            if ny > 0.85:
                return "hull_glacis"
        if obj_name == "m1a2_engine_deck" and mat_name == "H_JetBlastHero":
            if ny > 0.85:
                return "jet_blast"
        return None

    interior_grp = [o for o in objs if o.name in {"m1a2_torsion_bars", "m1a2_turret_ring"}]
    wheels_grp = [o for o in objs if o.name == "m1a2_road_wheels"]
    tracks_grp = [o for o in objs if o.name in {"m1a2_tracks_left", "m1a2_tracks_right"}]
    armor_grp = [o for o in objs if o not in interior_grp and o not in wheels_grp and o not in tracks_grp]

    _smart_unwrap_and_pack_rect(armor_grp, 0.010, 0.990, 0.220, 0.480, skip_face_fn=lambda n, f, m: classify_hero(n, f, m) is not None)
    _smart_unwrap_and_pack_rect(interior_grp, 0.010, 0.275, 0.010, 0.200)
    _smart_unwrap_and_pack_rect(wheels_grp, 0.290, 0.620, 0.010, 0.200)
    # Tracks already carry direct analytical material-firewalled non-overlapping UVs in [0.635, 0.992] x [0.010, 0.200]!
    print(f"  [UV-PACK]  2 objs (tracks analytical firewalled grid) -> [0.635,0.992]x[0.010,0.200]")

    hits = {"sk_right": 0, "sk_left": 0, "hull_glacis": 0, "jet_blast": 0}
    for o in armor_grp:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_hero(o.name, f, mname)
            if tag is None:
                continue
            hits[tag] += 1
            for loop in f.loops:
                tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
                if tag == "sk_right":
                    # Viewing right flank (+Z): -X is left, +X is right, +Y is top!
                    xn = max(0.0, min(1.0, (tx - (-347.0)) / 688.0))
                    yn = max(0.0, min(1.0, (ty - (-32.0)) / 62.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.835 + yn * 0.150)
                elif tag == "sk_left":
                    # Viewing left flank (-Z): +X is left, -X is right, +Y is top!
                    xn = max(0.0, min(1.0, (341.0 - tx) / 688.0))
                    yn = max(0.0, min(1.0, (ty - (-32.0)) / 62.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.665 + yn * 0.150)
                elif tag == "hull_glacis":
                    # Viewing front glacis from front (+X): +Z is left, -Z is right, back (-X) is top!
                    zn = max(0.0, min(1.0, (105.0 - tz) / 210.0))
                    xn = max(0.0, min(1.0, (344.0 - tx) / 72.0))
                    loop[uv_layer].uv = (0.015 + zn * 0.480, 0.510 + xn * 0.125)
                elif tag == "jet_blast":
                    # Viewing rear engine deck from rear (-X): -Z is left, +Z is right, fwd (+X) is top!
                    zn = max(0.0, min(1.0, (tz - (-69.0)) / 138.0))
                    xn = max(0.0, min(1.0, (tx - (-120.0)) / 24.0))
                    loop[uv_layer].uv = (0.535 + zn * 0.450, 0.510 + xn * 0.125)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] hull_armor hits={hits}")
    assert all(v > 0 for v in hits.values()), f"Missing hull_armor hero faces: {hits}"


def unwrap_turret_gun_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if obj_name == "m1a2_turret_shell" and mat_name == "T_CarcTanHero":
            if nz > 0.80 and tz > 135.0:
                return "tur_right"
            if nz < -0.80 and tz < -135.0:
                return "tur_left"
        if obj_name == "m1a2_main_gun" and mat_name == "T_EvacHero":
            if abs(nz) > 0.55:
                return "evac_side"
        return None

    OPTIC_MATS = {"T_EmeraldOptics"}
    CHOBHAM_OBJS = {"m1a2_composite_armor"}

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in OPTIC_MATS) or (n in CHOBHAM_OBJS)

    # Strict >= 50 px UV Firewalls for Emerald-Sapphire Optics & 7-Layer Chobham/DU Composite Armor!
    optics_objs = [o for o in objs if o.name == "m1a2_crows_optics"]
    chobham_objs = [o for o in objs if o.name == "m1a2_composite_armor"]
    gun_grp = [o for o in objs if o.name in {"m1a2_main_gun", "m1a2_gun_mantlet", "m1a2_breech_block"}]
    tur_grp = [o for o in objs if o not in gun_grp and o not in chobham_objs]

    _smart_unwrap_and_pack_rect(optics_objs, 0.495, 0.630, 0.500, 0.608, select_face_fn=lambda _n, _f, m: m == "T_EmeraldOptics")
    _smart_unwrap_and_pack_rect(chobham_objs, 0.675, 0.985, 0.500, 0.608)
    _smart_unwrap_and_pack_rect(tur_grp, 0.010, 0.990, 0.245, 0.465, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(gun_grp, 0.010, 0.990, 0.010, 0.220, skip_face_fn=is_special)

    hits = {"tur_right": 0, "tur_left": 0, "evac_side": 0}
    for o in objs:
        if o.name not in {"m1a2_turret_shell", "m1a2_main_gun"}:
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
            hits[tag] += 1
            nz = -f.normal.y
            for loop in f.loops:
                tx, ty = loop.vert.co.x, loop.vert.co.z
                if tag == "tur_right":
                    xn = max(0.0, min(1.0, (tx - (-242.0)) / 312.0))
                    yn = max(0.0, min(1.0, (ty - 17.0) / 54.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.825 + yn * 0.160)
                elif tag == "tur_left":
                    xn = max(0.0, min(1.0, (70.0 - tx) / 312.0))
                    yn = max(0.0, min(1.0, (ty - 17.0) / 54.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.640 + yn * 0.160)
                elif tag == "evac_side":
                    if nz > 0:
                        xn = max(0.0, min(1.0, (tx - 219.0) / 56.0))
                        yn = max(0.0, min(1.0, (ty - (-12.5)) / 25.0))
                        loop[uv_layer].uv = (0.015 + xn * 0.440, 0.556 + yn * 0.056)
                    else:
                        xn = max(0.0, min(1.0, (275.0 - tx) / 56.0))
                        yn = max(0.0, min(1.0, (ty - (-12.5)) / 25.0))
                        loop[uv_layer].uv = (0.015 + xn * 0.440, 0.492 + yn * 0.056)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] turret_gun hits={hits}")
    assert all(v > 0 for v in hits.values()), f"Missing turret_gun hero faces: {hits}"


def unwrap_turbine_bustle_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name == "m1a2_blast_doors" and mat_name == "TB_BlastDoorHero" and face.normal.x > 0.85:
            return "blast_door"
        if obj_name == "m1a2_crew_stations" and mat_name == "TB_LcdHero" and face.normal.x < -0.85:
            return "tactical_lcd"
        return None

    FIREWALL_MATS = {"TB_CopperRecup", "TB_TitaniumBlades", "TB_AmmoBrass", "TB_AmmoSabot"}

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FIREWALL_MATS)

    # Strict >= 55 px UV Firewalls for Copper Recuperator, Titanium Compressor Blades & 120mm Brass/Sabot!
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.340, 0.560, 0.770, select_face_fn=lambda _n, _f, m: m == "TB_CopperRecup")
    _smart_unwrap_and_pack_rect(objs, 0.375, 0.680, 0.560, 0.770, select_face_fn=lambda _n, _f, m: m == "TB_TitaniumBlades")
    _smart_unwrap_and_pack_rect(objs, 0.715, 0.985, 0.560, 0.770, select_face_fn=lambda _n, _f, m: m in {"TB_AmmoBrass", "TB_AmmoSabot"})

    bustle_grp = [o for o in objs if o.name in {"m1a2_ammo_bustle", "m1a2_ready_round", "m1a2_blast_doors", "m1a2_stub_deflector"}]
    power_grp = [o for o in objs if o not in bustle_grp]
    _smart_unwrap_and_pack_rect(bustle_grp, 0.010, 0.990, 0.285, 0.525, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(power_grp, 0.010, 0.990, 0.010, 0.255, skip_face_fn=is_special)

    hits = {"blast_door": 0, "tactical_lcd": 0}
    for o in objs:
        if o.name not in {"m1a2_blast_doors", "m1a2_crew_stations"}:
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
            hits[tag] += 1
            if tag == "blast_door":
                for loop in f.loops:
                    ty, tz = loop.vert.co.z, -loop.vert.co.y
                    # Looking back (-X) at front face (+X) of blast doors: +Z is left, -Z is right!
                    zn = max(0.0, min(1.0, (43.0 - tz) / 86.0))
                    yn = max(0.0, min(1.0, (ty - (-19.5)) / 39.0))
                    loop[uv_layer].uv = (0.015 + zn * 0.550, 0.805 + yn * 0.180)
            elif tag == "tactical_lcd":
                fc = f.calc_center_median()
                if fc.x > 60.0:
                    u0_l, du_l = 0.605, 0.115  # Driver LCD
                elif fc.x > -45.0:
                    u0_l, du_l = 0.735, 0.117  # Gunner FCS LCD
                else:
                    u0_l, du_l = 0.868, 0.117  # Commander BFT Map LCD
                zs = [-lp.vert.co.y for lp in f.loops]
                ys = [lp.vert.co.z for lp in f.loops]
                zmin, zmax = min(zs), max(zs)
                ymin, ymax = min(ys), max(ys)
                dz = max(zmax - zmin, 1e-4)
                dy = max(ymax - ymin, 1e-4)
                for loop in f.loops:
                    ty, tz = loop.vert.co.z, -loop.vert.co.y
                    zn = max(0.0, min(1.0, (tz - zmin) / dz))
                    yn = max(0.0, min(1.0, (ty - ymin) / dy))
                    loop[uv_layer].uv = (u0_l + zn * du_l, 0.805 + yn * 0.180)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] turbine_bustle hits={hits}")
    assert all(v > 0 for v in hits.values()), f"Missing turbine_bustle hero faces: {hits}"


# =============================================================================
# Cycles Multi-Channel GPU Baking Engine (Option A: Assembled Contact AO -> Identity)
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
        o.location = (i * 1400.0, 0.0, 0.0)
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
            o.location = (0.0, 4000.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object], tmp_dir: Path,
    atlas_size: int = ATLAS_SIZE_4K, bake_margin: int = 10,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False, extra_objs_override=None,
    ):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", atlas_size, atlas_size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
        arr = np.empty((atlas_size * atlas_size, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=bake_margin, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({atlas_size}px, {bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.34, 0.25, 0.13, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.55, 0.55, 0.55, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    # Tank-scale AO distance (1u = 1cm -> 30 cm self crevice AO, 46 cm assembled contact AO)
    scene.world.light_settings.distance = 30.0
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    if ext_targets:
        _set_assembled_exterior_layout(all_objs)
        scene.world.light_settings.distance = 46.0
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
        img_m = bpy.data.images.new(f"{prefix}_ext_mask", atlas_size, atlas_size, alpha=False, float_buffer=True)
        img_m.colorspace_settings.name = "Non-Color"
        arr = np.zeros((atlas_size * atlas_size, 4), dtype=np.float32)
        arr[:, 3] = 1.0
        img_m.pixels.foreach_set(arr.ravel())
        nodes_m = _attach_bake_image_node({white_mat}, img_m)
        scene.cycles.samples = 1
        select_only(ext_targets, ext_targets[0])
        bpy.ops.object.bake(type="EMIT", margin=bake_margin, use_clear=False)
        _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
        _remove_bake_image_nodes(nodes_m)
        bpy.data.images.remove(img_m)
        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    else:
        # Interior suite (turbine_bustle): all self-AO, zero exterior contact mask
        ones = np.ones((atlas_size, atlas_size, 3), dtype=np.float32)
        zeros = np.zeros((atlas_size, atlas_size, 3), dtype=np.float32)
        np.save(tmp_dir / f"{prefix}_ao_ext.npy", ones)
        np.save(tmp_dir / f"{prefix}_ext_mask.npy", zeros)


# =============================================================================
# Strict Manifold, Normal-Alignment & Bounding-Box Verification + Draco Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
    max_bbox_delta = 0.0
    total_tris = 0
    bad_parts = []
    bbox_violations = []
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 5.0) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:6d} non_man={non_man:2d} vol={vol:12.1f} "
            f"max_bbox_delta={d_max:.2f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 5.0:
            bbox_violations.append((o.name, d_max, bmin, bmax, ref_min, ref_max))
        if o.name in {"m1a2_tracks_left", "m1a2_tracks_right"}:
            world_ymin = ASSEMBLED_POS[o.name][1] + bmin[1]
            print(f"       -> ground contact check: world Y_min = {world_ymin:.3f} cm (target -120.000 cm)")
            assert abs(world_ymin - (-120.0)) < 0.05, f"{o.name} world Y_min != -120.0 cm ({world_ymin:.3f})"
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.2f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    assert not bbox_violations, f"CAD bbox delta > 5.0 cm on parts: {bbox_violations}"
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
    MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
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
        # Suite 1: Hull Armor, Side Skirts, Wheels, Tracks, Engine Deck, Torsion Bars, Turret Ring (8 parts)
        "m1a2_hull_shell":         lambda m: build_m1a2_hull_shell(m),
        "m1a2_side_skirts":        lambda m: build_m1a2_side_skirts(m),
        "m1a2_road_wheels":        lambda m: build_m1a2_road_wheels(m),
        "m1a2_tracks_left":        lambda m: _build_track_belt("m1a2_tracks_left", m),
        "m1a2_tracks_right":       lambda m: _build_track_belt("m1a2_tracks_right", m),
        "m1a2_engine_deck":        lambda m: build_m1a2_engine_deck(m),
        "m1a2_torsion_bars":       lambda m: build_m1a2_torsion_bars(m),
        "m1a2_turret_ring":        lambda m: build_m1a2_turret_ring(m),
        # Suite 2: Turret Armor, Blow-Off Panels, Chobham/DU, 120mm Gun, Mantlet, Breech, CROWS, Smoke (8 parts)
        "m1a2_turret_shell":       lambda m: build_m1a2_turret_shell(m),
        "m1a2_blowoff_panels":     lambda m: build_m1a2_blowoff_panels(m),
        "m1a2_composite_armor":    lambda m: build_m1a2_composite_armor(m),
        "m1a2_main_gun":           lambda m: build_m1a2_main_gun(m),
        "m1a2_gun_mantlet":        lambda m: build_m1a2_gun_mantlet(m),
        "m1a2_breech_block":       lambda m: build_m1a2_breech_block(m),
        "m1a2_crows_optics":       lambda m: build_m1a2_crows_optics(m),
        "m1a2_smoke_launchers":    lambda m: build_m1a2_smoke_launchers(m),
        # Suite 3: Blast Doors, 120mm Ammo Bustle, Ready Round, Stub Deflector, AGT1500, X1100, Fuel, Crew (8 parts)
        "m1a2_blast_doors":        lambda m: build_m1a2_blast_doors(m),
        "m1a2_ammo_bustle":        lambda m: build_m1a2_ammo_bustle(m),
        "m1a2_ready_round":        lambda m: build_m1a2_ready_round(m),
        "m1a2_stub_deflector":     lambda m: build_m1a2_stub_deflector(m),
        "m1a2_agt1500_turbine":    lambda m: build_m1a2_agt1500_turbine(m),
        "m1a2_x1100_transmission": lambda m: build_m1a2_x1100_transmission(m),
        "m1a2_fuel_cells":         lambda m: build_m1a2_fuel_cells(m),
        "m1a2_crew_stations":      lambda m: build_m1a2_crew_stations(m),
    }

    print("[BUILD] Sculpting all 24 solid U.S. Army M1A2 SEP v3 Abrams MBT parts (1:1 cm scale)...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    ha_objs = [built[pid] for pid in HULL_ARMOR_PARTS]
    tg_objs = [built[pid] for pid in TURRET_GUN_PARTS]
    tb_objs = [built[pid] for pid in TURBINE_BUSTLE_PARTS]
    all_objs = ha_objs + tg_objs + tb_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated hero atlases: hull_armor (4K, 8), turret_gun (4K, 8), turbine_bustle (2K, 8)...")
    unwrap_hull_armor_atlas(ha_objs)
    unwrap_turret_gun_atlas(tg_objs)
    unwrap_turbine_bustle_atlas(tb_objs)

    for label, group in (("hull_armor", ha_objs), ("turret_gun", tg_objs), ("turbine_bustle", tb_objs)):
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
        print(f"  [UV-AUDIT] {label:16s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="m1a2_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking m1a2_v3_hull_armor (4096x4096, margin=10, 8 parts)...")
        bake_atlas_suite("ha", ha_objs, all_objs, tmp_dir, atlas_size=ATLAS_SIZE_4K, bake_margin=10)
        print("[CYCLES] Baking m1a2_v3_turret_gun (4096x4096, margin=10, 8 parts)...")
        bake_atlas_suite("tg", tg_objs, all_objs, tmp_dir, atlas_size=ATLAS_SIZE_4K, bake_margin=10)
        print("[CYCLES] Baking m1a2_v3_turbine_bustle (2048x2048, margin=6, 8 parts)...")
        bake_atlas_suite("tb", tb_objs, all_objs, tmp_dir, atlas_size=ATLAS_SIZE_2K, bake_margin=6)

        # Export Draco GLB BEFORE post-processing so adaptive WebP knows exact GLB size!
        export_draco_glb(all_objs)

        print("[POST] Compositing 4K U.S. Army CARC stencils, dry/wet/heat weathering, JET BLAST, Blast Doors & Adaptive WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR), str(MODELS_OUT)],
            check=True,
        )

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m1a2_v3_hull_armor_albedo.webp",
        TEX_OUT_DIR / "m1a2_v3_hull_armor_normal.webp",
        TEX_OUT_DIR / "m1a2_v3_hull_armor_roughness.webp",
        TEX_OUT_DIR / "m1a2_v3_turret_gun_albedo.webp",
        TEX_OUT_DIR / "m1a2_v3_turret_gun_normal.webp",
        TEX_OUT_DIR / "m1a2_v3_turret_gun_roughness.webp",
        TEX_OUT_DIR / "m1a2_v3_turbine_bustle_albedo.webp",
        TEX_OUT_DIR / "m1a2_v3_turbine_bustle_normal.webp",
        TEX_OUT_DIR / "m1a2_v3_turbine_bustle_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== U.S. ARMY M1A2 SEP v3 ABRAMS MBT (120MM M256) V3 4K+PLANC ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:44s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (target <= 11.80 MB / hard test <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 11.80, f"Asset budget exceeded: {total_mb:.2f} MB > 11.80 MB"


if __name__ == "__main__":
    main()
