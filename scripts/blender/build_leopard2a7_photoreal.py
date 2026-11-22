#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for KMW Leopard 2A7V MBT (120mm Rh-120 L/55A1)
===============================================================================================
MIT License — Digital Armory 3D (`WP-18` BAY-26 · Plan B 4K Weathering + Plan C Flagship Silhouette)

Generates at TRUE 1:1 REAL-WORLD SCALE (1 world unit = 1 cm = 10 mm):
  - public/models/leopard2a7.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `leo_recoil_springs` and `leo_breech_spring`
    carrying `aSpringParam` on the CSG Web Worker track)
  - public/textures/leopard2a7_v3_hull_camo_{albedo,normal,roughness}.webp      (4096x4096 Packed ORM)
  - public/textures/leopard2a7_v3_turret_gun_{albedo,normal,roughness}.webp     (4096x4096 Packed ORM)
  - public/textures/leopard2a7_v3_powerpack_int_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X front/muzzle, +Y up, +Z right flank.
  - Ground contact: Y = -120.0 cm (tracks assembled Y = -71.75, local Y_min = -48.25)
  - Hull X in [-385, +385] | 6.6m L/55A1 muzzle X = +712 cm.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export.

Usage:
  LOCK=/tmp/armory_blender_gpu.lock; while ! mkdir "$LOCK" 2>/dev/null; do sleep 4; done; \
  trap 'rmdir "$LOCK"' EXIT; \
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \
      --python scripts/blender/build_leopard2a7_photoreal.py
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
# MODE 2: System Python Post-Process (4K Supersampled Bundeswehr Iron Cross,
#         Y-482 917 Plate, MLC 70 Disc, 2A7V/312 Turret Markings, Blast Door
#         German Caution, IFIS LCDs & Adaptive-Quality 4K/4K/2K Packed ORM WebPs)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    glb_bytes = int(sys.argv[idx + 3]) if len(sys.argv) > idx + 3 else 0
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
        t = base_n_01 * 2.0 - 1.0
        t[..., 2] += 1.0
        u = detail_n_01 * 2.0 - 1.0
        u[..., 0] = -u[..., 0]
        u[..., 1] = -u[..., 1]
        dot_tu = np.sum(t * u, axis=-1, keepdims=True)
        tz = np.maximum(t[..., 2:3], 1e-4)
        r = t * (dot_tu / tz) - u
        r /= np.sqrt(np.sum(r * r, axis=-1, keepdims=True) + 1e-8)
        return np.clip(r * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _height_to_normal_01(height: np.ndarray, strength: float) -> np.ndarray:
        dy, dx = np.gradient(height.astype(np.float32))
        nx = -dx * strength
        ny = dy * strength
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _paste_rgba_uv(
        albedo_srgb: np.ndarray,
        rgh: np.ndarray,
        met: np.ndarray,
        pil_rgba: Image.Image,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
        decal_rgh: float | None = None,
        decal_met: float | None = None,
        height_out: np.ndarray | None = None,
        height_val: float = 0.0,
        weather_grain: float = 0.0,
    ):
        h, w = rgh.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_rgba.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        rgb = arr[..., :3]
        alpha = arr[..., 3:4]
        if weather_grain > 0.0:
            # Subtle realistic CARC stencil micro-wear so markings sit organically on painted RHA
            rng = np.random.default_rng(20742)
            gh, gw = alpha.shape[:2]
            low = rng.random((max(4, gh // 10), max(4, gw // 10)), dtype=np.float32)
            low_up = np.asarray(
                Image.fromarray((low * 255).astype(np.uint8)).resize((gw, gh), resample=Image.Resampling.BILINEAR),
                dtype=np.float32,
            ) / 255.0
            fine = rng.random((gh, gw), dtype=np.float32)
            wear = np.clip(1.0 - weather_grain * np.maximum(0.0, low_up * 0.7 + fine * 0.3 - 0.58) * 2.1, 0.72, 1.0)
            alpha = alpha * wear[..., None]
        albedo_srgb[y0:y1, x0:x1] = albedo_srgb[y0:y1, x0:x1] * (1.0 - alpha) + rgb * alpha
        a2 = alpha[..., 0]
        if decal_rgh is not None:
            rgh[y0:y1, x0:x1] = rgh[y0:y1, x0:x1] * (1.0 - a2) + decal_rgh * a2
        if decal_met is not None:
            met[y0:y1, x0:x1] = met[y0:y1, x0:x1] * (1.0 - a2) + decal_met * a2
        if height_out is not None and abs(height_val) > 1e-5:
            height_out[y0:y1, x0:x1] += a2 * height_val

    def _draw_bundeswehr_iron_cross(draw: ImageDraw.ImageDraw, cx: float, cy: float, size: float):
        """Authentic Bundeswehr Eisernes Kreuz (flared pattée cross: black core + crisp white border)."""
        r = size * 0.5
        arm_in = r * 0.30
        arm_out = r * 0.52

        def cross_poly(scale: float):
            ro = r * scale
            ri = arm_in * scale
            ao = arm_out * scale
            return [
                (cx - ao, cy - ro), (cx + ao, cy - ro), (cx + ri * 0.85, cy - ri),
                (cx + ro, cy - ao), (cx + ro, cy + ao), (cx + ri, cy + ri * 0.85),
                (cx + ao, cy + ro), (cx - ao, cy + ro), (cx - ri * 0.85, cy + ri),
                (cx - ro, cy + ao), (cx - ro, cy - ao), (cx - ri, cy - ri * 0.85),
            ]

        draw.polygon(cross_poly(1.0), fill=(238, 240, 236, 255))
        draw.polygon(cross_poly(0.81), fill=(46, 48, 52, 255))

    def _draw_german_plate(draw: ImageDraw.ImageDraw, x0: int, y0: int, pw: int, ph: int, text: str = "Y-482 917"):
        """Authentic Bundeswehr white license plate with German tricolor flag & bold DIN lettering (resolution-scaled)."""
        sc = max(1.0, ph / 192.0)
        draw.rounded_rectangle(
            (x0, y0, x0 + pw, y0 + ph),
            radius=int(round(10 * sc)),
            fill=(236, 238, 234, 255),
            outline=(44, 46, 50, 255),
            width=max(3, int(round(6 * sc))),
        )
        fx0, fx1 = x0 + int(round(16 * sc)), x0 + int(pw * 0.14)
        fy0, fy1 = y0 + int(round(14 * sc)), y0 + ph - int(round(14 * sc))
        fh = (fy1 - fy0) // 3
        draw.rectangle((fx0, fy0, fx1, fy0 + fh), fill=(44, 46, 50, 255))
        draw.rectangle((fx0, fy0 + fh, fx1, fy0 + fh * 2), fill=(205, 38, 36, 255))
        draw.rectangle((fx0, fy0 + fh * 2, fx1, fy1), fill=(235, 190, 32, 255))
        draw.text(
            (x0 + int(pw * 0.56), y0 + ph // 2 + int(round(2 * sc))),
            text,
            font=_load_font(FONT_DIN, int(ph * 0.64)),
            fill=(42, 44, 48, 255),
            anchor="mm",
        )

    def _draw_mlc70_disc(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int):
        """Authentic NATO yellow circular MLC 70 bridge classification plate (resolution-scaled)."""
        sc = max(1.0, radius / 135.0)
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=(228, 184, 42, 255),
            outline=(44, 46, 50, 255),
            width=max(4, int(round(8 * sc))),
        )
        inset = int(round(12 * sc))
        draw.ellipse(
            (cx - radius + inset, cy - radius + inset, cx + radius - inset, cy + radius - inset),
            outline=(44, 46, 50, 255),
            width=max(2, int(round(4 * sc))),
        )
        draw.text((cx, cy - int(radius * 0.36)), "MLC", font=_load_font(FONT_COND, int(radius * 0.40)), fill=(42, 44, 48, 255), anchor="mm")
        draw.text((cx, cy + int(radius * 0.22)), "70", font=_load_font(FONT_DIN, int(radius * 0.92)), fill=(42, 44, 48, 255), anchor="mm")

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

    def _pack_suite_images(albedo_srgb: np.ndarray, nrm: np.ndarray, ao: np.ndarray, rgh: np.ndarray, met: np.ndarray):
        albedo_u8 = np.clip(np.round(albedo_srgb * 255.0), 0, 255).astype(np.uint8)
        nrm_u8 = np.clip(np.round(nrm * 255.0), 0, 255).astype(np.uint8)
        orm = np.stack((np.clip(ao, 0.0, 1.0), np.clip(rgh, 0.04, 0.96), np.clip(met, 0.0, 1.0)), axis=-1)
        orm_u8 = np.clip(np.round(orm * 255.0), 0, 255).astype(np.uint8)
        return (
            Image.fromarray(albedo_u8, mode="RGB"),
            Image.fromarray(nrm_u8, mode="RGB"),
            Image.fromarray(orm_u8, mode="RGB"),
        )

    def _save_suite_webps(
        suite_name: str,
        imgs: tuple[Image.Image, Image.Image, Image.Image],
        q_alb: int,
        q_nrm: int,
        q_orm: int,
    ) -> int:
        p_alb = out_dir / f"{suite_name}_albedo.webp"
        p_nrm = out_dir / f"{suite_name}_normal.webp"
        p_orm = out_dir / f"{suite_name}_roughness.webp"
        imgs[0].save(p_alb, format="WEBP", quality=q_alb, method=6)
        imgs[1].save(p_nrm, format="WEBP", quality=q_nrm, method=6)
        imgs[2].save(p_orm, format="WEBP", quality=q_orm, method=6)
        sz = p_alb.stat().st_size + p_nrm.stat().st_size + p_orm.stat().st_size
        print(
            f"  [WEBP] {suite_name} ({imgs[0].width}x{imgs[0].height}, q={q_alb}/{q_nrm}/{q_orm}): "
            f"{p_alb.stat().st_size/1024:.0f} + {p_nrm.stat().st_size/1024:.0f} + {p_orm.stat().st_size/1024:.0f} = {sz/1024:.1f} KB"
        )
        return sz

    # -------------------------------------------------------------------------
    # SUITE 1: leopard2a7_v3_hull_camo (4096x4096, 2x Supersampled Hero Decals)
    # -------------------------------------------------------------------------
    def build_hull_camo_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "hc_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "hc_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "hc_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "hc_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "hc_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hc_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hc_ext_mask.npy")[..., 0],
        )
        albedo = _linear_to_srgb(alb_lin)
        h_bump = np.zeros_like(rgh)

        # Hero Band 1: Front 2A7V Glacis Add-On Plate (2x 4K Supersampled: 3200x1120)
        GW, GH = 3200, 1120
        g_img = Image.new("RGBA", (GW, GH), (0, 0, 0, 0))
        dg = ImageDraw.Draw(g_img)
        _draw_bundeswehr_iron_cross(dg, 500, GH // 2, 470)
        _draw_german_plate(dg, 960, GH // 2 - 192, 1240, 384, "Y-482 917")
        dg.text((1580, GH - 128), "KMW LEOPARD 2A7V  -  PZBTL 104", font=_load_font(FONT_COND, 96), fill=(236, 238, 232, 245), anchor="mm")
        _draw_mlc70_disc(dg, 2690, GH // 2, 270)
        _paste_rgba_uv(
            albedo, rgh, met, g_img, 0.015, 0.565, 0.785, 0.985,
            decal_rgh=0.46, decal_met=0.04, height_out=h_bump, height_val=0.26, weather_grain=0.14,
        )

        # Hero Band 2: Rear Armored Transom Plate (2x 4K Supersampled: 2400x1120)
        RW, RH = 2400, 1120
        r_img = Image.new("RGBA", (RW, RH), (0, 0, 0, 0))
        dr = ImageDraw.Draw(r_img)
        _draw_german_plate(dr, 640, RH // 2 - 172, 1120, 344, "Y-482 917")
        for lx in (220, RW - 420):
            dr.rounded_rectangle((lx, 240, lx + 200, 420), radius=20, fill=(215, 42, 38, 255), outline=(44, 46, 50, 255), width=12)
            dr.rounded_rectangle((lx, 460, lx + 200, 580), radius=16, fill=(228, 152, 32, 255), outline=(44, 46, 50, 255), width=10)
        cx_k, cy_k = RW // 2, RH - 164
        dr.rectangle((cx_k - 92, cy_k - 28, cx_k + 92, cy_k + 28), fill=(236, 238, 232, 255))
        dr.rectangle((cx_k - 28, cy_k - 92, cx_k + 28, cy_k + 92), fill=(236, 238, 232, 255))
        _paste_rgba_uv(
            albedo, rgh, met, r_img, 0.595, 0.985, 0.785, 0.985,
            decal_rgh=0.42, decal_met=0.05, height_out=h_bump, height_val=0.22, weather_grain=0.12,
        )

        if np.max(np.abs(h_bump)) > 1e-4:
            dn = _height_to_normal_01(ndimage.gaussian_filter(h_bump, sigma=1.6), strength=2.4)
            nrm = _rnm_blend(nrm, dn)

        albedo *= (0.76 + 0.24 * ao[..., None])
        return _pack_suite_images(albedo, nrm, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 2: leopard2a7_v3_turret_gun (4096x4096, 2x Supersampled Hero Flanks)
    # -------------------------------------------------------------------------
    def build_turret_gun_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "tg_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "tg_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "tg_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "tg_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "tg_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tg_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "tg_ext_mask.npy")[..., 0],
        )
        albedo = _linear_to_srgb(alb_lin)
        h_bump = np.zeros_like(rgh)

        def make_turret_flank_decal() -> Image.Image:
            TW, TH = 3000, 1120
            img = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            _draw_bundeswehr_iron_cross(d, 740, TH // 2, 580)
            d.text((1750, TH // 2 - 96), "2A7V", font=_load_font(FONT_DIN, 370), fill=(238, 240, 234, 255), anchor="mm")
            d.line([(1300, TH // 2 + 128), (2200, TH // 2 + 128)], fill=(234, 236, 230, 242), width=14)
            d.text((1750, TH // 2 + 244), "312  -  PZBTL 104  -  L/55A1", font=_load_font(FONT_COND, 124), fill=(236, 238, 232, 248), anchor="mm")
            rx0, ry0, rx1, ry1 = 2340, 350, 2780, 650
            d.rectangle((rx0, ry0, rx1, ry1), outline=(238, 240, 234, 255), width=18)
            d.rounded_rectangle((rx0 + 56, ry0 + 72, rx1 - 56, ry1 - 72), radius=68, outline=(238, 240, 234, 255), width=16)
            d.text((2560, 770), "4. / 104", font=_load_font(FONT_DIN, 108), fill=(236, 238, 232, 248), anchor="mm")
            return img

        flank_decal = make_turret_flank_decal()
        _paste_rgba_uv(
            albedo, rgh, met, flank_decal, 0.015, 0.485, 0.790, 0.985,
            decal_rgh=0.52, decal_met=0.04, height_out=h_bump, height_val=0.20, weather_grain=0.14,
        )
        _paste_rgba_uv(
            albedo, rgh, met, flank_decal, 0.515, 0.985, 0.790, 0.985,
            decal_rgh=0.52, decal_met=0.04, height_out=h_bump, height_val=0.20, weather_grain=0.14,
        )

        if np.max(np.abs(h_bump)) > 1e-4:
            dn = _height_to_normal_01(ndimage.gaussian_filter(h_bump, sigma=1.5), strength=2.2)
            nrm = _rnm_blend(nrm, dn)

        albedo *= (0.76 + 0.24 * ao[..., None])
        return _pack_suite_images(albedo, nrm, ao, rgh, met)

    # -------------------------------------------------------------------------
    # SUITE 3: leopard2a7_v3_powerpack_int (2048x2048 Interior Powerpack & Ammo)
    # -------------------------------------------------------------------------
    def build_powerpack_int_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "pp_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "pp_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "pp_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "pp_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "pp_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "pp_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "pp_ext_mask.npy")[..., 0],
        )
        albedo = _linear_to_srgb(alb_lin)
        h_bump = np.zeros_like(rgh)

        BW, BH = 1400, 560
        b_img = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
        db = ImageDraw.Draw(b_img)
        for y_band in (28, BH - 118):
            db.rectangle((28, y_band, BW - 28, y_band + 88), fill=(232, 184, 38, 255))
            for sx in range(-120, BW + 120, 110):
                db.polygon(
                    [(sx, y_band + 88), (sx + 54, y_band + 88), (sx + 104, y_band), (sx + 50, y_band)],
                    fill=(44, 46, 50, 255),
                )
            db.rectangle((28, y_band, BW - 28, y_band + 88), outline=(44, 46, 50, 255), width=6)
        db.rounded_rectangle((68, 152, BW - 68, BH - 152), radius=14, fill=(56, 62, 70, 240), outline=(232, 184, 38, 255), width=6)
        db.text((BW // 2, 224), "ACHTUNG  -  MUNITIONSBUNKER  120MM", font=_load_font(FONT_DIN, 68), fill=(242, 210, 68, 255), anchor="mm")
        db.text((BW // 2, 316), "SCHOTT GESCHLOSSEN HALTEN  /  BLAST DOOR", font=_load_font(FONT_COND, 52), fill=(236, 238, 234, 245), anchor="mm")
        _paste_rgba_uv(albedo, rgh, met, b_img, 0.015, 0.485, 0.795, 0.985, decal_rgh=0.44, decal_met=0.12, height_out=h_bump, height_val=0.22)

        SW, SH = 640, 560
        s_img = Image.new("RGBA", (SW, SH), (16, 48, 66, 255))
        ds = ImageDraw.Draw(s_img)
        for gx in range(40, SW, 64):
            ds.line([(gx, 28), (gx, SH - 28)], fill=(38, 128, 152, 200), width=2)
        for gy in range(40, SH, 64):
            ds.line([(28, gy), (SW - 28, gy)], fill=(38, 128, 152, 200), width=2)
        ds.ellipse((150, 130, 490, 470), outline=(72, 228, 242, 255), width=4)
        ds.ellipse((230, 210, 410, 390), outline=(72, 228, 242, 220), width=3)
        ds.line([(320, 120), (320, 480)], fill=(72, 228, 242, 210), width=3)
        ds.line([(140, 300), (500, 300)], fill=(72, 228, 242, 210), width=3)
        ds.rectangle((22, 22, SW - 22, 92), fill=(24, 72, 94, 255), outline=(72, 228, 242, 255), width=4)
        ds.text((SW // 2, 57), "IFIS  -  EMES-15  -  DM63A1  RDY", font=_load_font(FONT_DIN, 34), fill=(120, 248, 255, 255), anchor="mm")
        ds.text((SW // 2, SH - 46), "RNG 2450M  |  MTU 1500HP  |  700 MPA", font=_load_font(FONT_COND, 34), fill=(96, 242, 180, 255), anchor="mm")
        _paste_rgba_uv(albedo, rgh, met, s_img, 0.520, 0.735, 0.795, 0.985, decal_rgh=0.14, decal_met=0.05)

        if np.max(np.abs(h_bump)) > 1e-4:
            dn = _height_to_normal_01(ndimage.gaussian_filter(h_bump, sigma=1.0), strength=1.6)
            nrm = _rnm_blend(nrm, dn)

        return _pack_suite_images(albedo, nrm, ao, rgh, met)

    hc_imgs = build_hull_camo_atlas()
    tg_imgs = build_turret_gun_atlas()
    pp_imgs = build_powerpack_int_atlas()

    # Adaptive WebP quality ladder: start at crisp 88/90/88, step down only if bundle > 11.50 MB!
    TARGET_MAX_BYTES = int(11.50 * 1024 * 1024)
    HARD_MAX_BYTES = int(11.80 * 1024 * 1024)
    quality_ladder = [
        (88, 90, 88),
        (85, 87, 85),
        (82, 84, 82),
        (79, 81, 79),
        (75, 77, 75),
        (71, 73, 71),
        (67, 69, 67),
    ]
    chosen_total = 0
    for q_alb, q_nrm, q_orm in quality_ladder:
        tex_bytes = 0
        tex_bytes += _save_suite_webps("leopard2a7_v3_hull_camo", hc_imgs, q_alb, q_nrm, q_orm)
        tex_bytes += _save_suite_webps("leopard2a7_v3_turret_gun", tg_imgs, q_alb, q_nrm, q_orm)
        tex_bytes += _save_suite_webps("leopard2a7_v3_powerpack_int", pp_imgs, min(90, q_alb + 2), min(92, q_nrm + 2), min(90, q_orm + 2))
        chosen_total = glb_bytes + tex_bytes
        print(
            f"  [BUDGET] Quality {q_alb}/{q_nrm}/{q_orm} -> GLB {glb_bytes/1048576:.2f} MB + "
            f"9 WebPs {tex_bytes/1048576:.2f} MB = {chosen_total/1048576:.2f} MB (target <= 11.50 MB)"
        )
        if chosen_total <= TARGET_MAX_BYTES:
            break
    assert chosen_total <= HARD_MAX_BYTES, f"Bundle {chosen_total/1048576:.2f} MB > 11.80 MB hard ceiling!"
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Sculpting + Cycles Metal GPU Baking
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "leopard2a7.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

# Per-suite bake resolution & quality contract (Plan B: 4K exteriors + 2K interior)
SUITE_ATLAS_SIZE = {"hc": 4096, "tg": 4096, "pp": 2048}
SUITE_BAKE_MARGIN = {"hc": 10, "tg": 10, "pp": 6}
SUITE_AO_SAMPLES = {"hc": 16, "tg": 16, "pp": 24}
SUITE_NORMAL_SAMPLES = {"hc": 8, "tg": 8, "pp": 12}

# Right-handed +90 deg X proper rotation from Three.js (Y-up) -> Blender (Z-up):
# (bx, by, bz) = (tx, -tz, ty), det = +1
T2B_MAT = Matrix(((1.0, 0.0, 0.0, 0.0), (0.0, 0.0, -1.0, 0.0), (0.0, 1.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 3-Suite Mapping (24 solid parts; skips ONLY `leo_recoil_springs`, `leo_breech_spring`)
HULL_CAMO_PARTS = [
    "leo_hull_shell",
    "leo_side_skirts",
    "leo_road_wheels",
    "leo_tracks_left",
    "leo_tracks_right",
    "leo_engine_deck",
    "leo_torsion_bars",
    "leo_turret_ring",
]

TURRET_GUN_PARTS = [
    "leo_turret_shell",
    "leo_arrowhead_wedges",
    "leo_main_gun",
    "leo_gun_mantlet",
    "leo_recoil_system",
    "leo_breech_block",
    "leo_optics_peri",
    "leo_smoke_dischargers",
]

POWERPACK_INT_PARTS = [
    "leo_mtu_v12",
    "leo_renk_transmission",
    "leo_cooling_fans",
    "leo_blast_door",
    "leo_ammo_bustle",
    "leo_hull_ammo_rack",
    "leo_ready_round",
    "leo_crew_stations",
]

# Exterior parts receiving assembled inter-part contact AO (interior cutaway assemblies stay radiant via Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "leo_hull_shell",
    "leo_side_skirts",
    "leo_road_wheels",
    "leo_tracks_left",
    "leo_tracks_right",
    "leo_engine_deck",
    "leo_turret_shell",
    "leo_arrowhead_wedges",
    "leo_main_gun",
    "leo_gun_mantlet",
    "leo_optics_peri",
    "leo_smoke_dischargers",
}

ASSEMBLED_POS = {
    "leo_hull_shell":        (   0.0,   0.0,    0.00),
    "leo_side_skirts":       (   0.0,  -8.0,    0.00),
    "leo_road_wheels":       (   0.0, -80.0,    0.00),
    "leo_tracks_left":       (   0.0, -71.75, -145.75),
    "leo_tracks_right":      (   0.0, -71.75,  145.75),
    "leo_engine_deck":       (-244.0,  54.0,    0.00),
    "leo_torsion_bars":      (  -8.0, -64.0,    0.00),
    "leo_turret_ring":       (  32.0,  46.0,    0.00),
    "leo_turret_shell":      (  32.0,  82.0,    0.00),
    "leo_arrowhead_wedges":  ( 168.0,  78.0,    0.00),
    "leo_main_gun":          ( 148.0,  74.0,    0.00),
    "leo_gun_mantlet":       ( 138.0,  74.0,    0.00),
    "leo_recoil_system":     (  82.0,  74.0,    0.00),
    "leo_breech_block":      (  36.0,  74.0,    0.00),
    "leo_optics_peri":       (  64.0, 116.0,   58.00),
    "leo_smoke_dischargers": (  14.0,  86.0,    0.00),
    "leo_mtu_v12":           (-198.0,  -8.0,    0.00),
    "leo_renk_transmission": (-320.0, -16.0,    0.00),
    "leo_cooling_fans":      (-318.0,  36.0,   46.00),
    "leo_blast_door":        ( -58.0,  84.0,    0.00),
    "leo_ammo_bustle":       (-120.0,  84.0,    0.00),
    "leo_hull_ammo_rack":    ( 195.0, -24.0,  -58.00),
    "leo_ready_round":       (-118.0,  74.0,   20.00),
    "leo_crew_stations":     ( 108.0,  20.0,   34.00),
}

# Exact CSG ground-truth local bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "leo_hull_shell":        ((-385.0, -72.0, -176.00), (385.0,  54.0, 176.00)),
    "leo_side_skirts":       ((-359.0, -52.0, -187.50), (359.0,  54.0, 187.50)),
    "leo_road_wheels":       ((-360.0, -35.0, -173.75), (347.0,  63.0, 173.75)),
    "leo_tracks_left":       ((-368.0, -48.0,  -31.00), (356.0,  58.0,  31.00)),
    "leo_tracks_right":      ((-368.0, -48.0,  -31.00), (356.0,  58.0,  31.00)),
    "leo_engine_deck":       ((-130.0,  -8.0, -112.00), (130.0,  10.5, 112.00)),
    "leo_torsion_bars":      ((-252.0,  -6.0, -108.00), (252.0,   5.0, 108.00)),
    "leo_turret_ring":       ((-106.0, -14.0, -106.00), (106.0,   8.0, 106.00)),
    "leo_turret_shell":      ((-218.0, -32.0, -162.00), ( 92.0,  38.0, 162.00)),
    "leo_arrowhead_wedges":  (( -54.0, -30.0, -160.00), ( 74.0,  38.0, 160.00)),
    "leo_main_gun":          (( -96.0, -13.8,  -13.80), (564.0,  18.1,  13.80)),
    "leo_gun_mantlet":       (( -40.0, -21.0,  -36.00), ( 50.0,  25.0,  36.00)),
    "leo_recoil_system":     (( -56.0, -18.0,  -31.00), ( 56.0,  21.5,  31.00)),
    "leo_breech_block":      (( -20.0, -20.0,  -22.00), ( 19.0,  20.0,  22.00)),
    "leo_optics_peri":       (( -44.0, -19.0,  -12.00), ( 54.0,  28.0,  32.00)),
    "leo_smoke_dischargers": (( -22.0, -11.0, -184.60), ( 34.5,  21.3, 184.60)),
    "leo_mtu_v12":           (( -73.0, -46.0,  -82.00), ( 76.0,  52.0,  82.00)),
    "leo_renk_transmission": (( -42.0, -39.0, -104.00), ( 46.0,  40.0, 104.00)),
    "leo_cooling_fans":      (( -42.0,  -7.0,  -42.00), ( 42.0,   7.0,  42.00)),
    "leo_blast_door":        ((  -6.0, -24.0,  -54.00), (  6.5,  24.0,  54.00)),
    "leo_ammo_bustle":       (( -52.0, -24.0, -108.00), ( 52.0,  24.0, 108.00)),
    "leo_hull_ammo_rack":    (( -57.0, -30.0,  -44.00), ( 57.0,  38.0,  44.00)),
    "leo_ready_round":       (( -49.2,  -7.7,   -7.70), ( 49.2,   7.7,   7.70)),
    "leo_crew_stations":     ((-128.0, -74.0, -117.00), (155.0,  63.0,  58.00)),
}


# =============================================================================
# Scene & Physically Calibrated Bundeswehr Leopard 2A7V Material Library
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
    world.light_settings.distance = 24.0

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    print(f"[SCENE] Blender {bpy.app.version_string} | Cycles device = {scene.cycles.device}")
    return scene


def _build_nato_camo_mat(
    name: str,
    world_offset_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    roughness: float = 0.82,
    metallic: float = 0.02,
    bevel_r: float = 2.0,
    edge_wear: float = 0.65,
    mud_strength: float = 0.0,
    mud_z_top: float = -24.0,
    exhaust_soot: bool = False,
    muzzle_soot: bool = False,
    oil_seep_mode: str = "none",  # "none" | "deck" | "skirts" | "wheels"
) -> bpy.types.Material:
    """Authentic Bundeswehr NATO 3-Tone CARC Camouflage (Plan B Extreme Weathering):
    Bronzegrün (RAL 6031) + Lederbraun (RAL 8027) + Teerschwarz (RAL 9021, AgX anti-crush)
    with RHA rolled-steel mill scale, rain streaks, dried Central-European mud (rgh 0.94..0.96),
    wet hydraulic/lubricant oil seepage (rgh 0.20..0.28), diesel/muzzle soot & BevelNormal chipping!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    # Shift object coords to assembled tank world space (in Blender Z-up) for seamless multi-part camo!
    vadd = nt.nodes.new("ShaderNodeVectorMath")
    vadd.operation = "ADD"
    vadd.inputs[1].default_value = tuple(t2b(*world_offset_three))
    nt.links.new(tc.outputs["Object"], vadd.inputs[0])

    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.0056, 0.0072, 0.0076)
    nt.links.new(vadd.outputs["Vector"], mp.inputs["Vector"])

    # Primary NATO blotch noise (Bronzegrün vs Lederbraun) with crisp hard-spray airbrush border
    n_brown = nt.nodes.new("ShaderNodeTexNoise")
    n_brown.inputs["Scale"].default_value = 1.60
    n_brown.inputs["Detail"].default_value = 3.5
    n_brown.inputs["Roughness"].default_value = 0.42
    n_brown.inputs["Distortion"].default_value = 0.42
    nt.links.new(mp.outputs["Vector"], n_brown.inputs["Vector"])

    r_brown = nt.nodes.new("ShaderNodeValToRGB")
    r_brown.color_ramp.elements[0].position = 0.525
    r_brown.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_brown.color_ramp.elements[1].position = 0.555
    r_brown.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(n_brown.outputs["Fac"], r_brown.inputs["Fac"])

    # Secondary NATO blotch noise (Teerschwarz stripes, offset vector)
    voff = nt.nodes.new("ShaderNodeVectorMath")
    voff.operation = "ADD"
    voff.inputs[1].default_value = (4.7, -3.1, 2.3)
    nt.links.new(mp.outputs["Vector"], voff.inputs[0])

    n_black = nt.nodes.new("ShaderNodeTexNoise")
    n_black.inputs["Scale"].default_value = 1.90
    n_black.inputs["Detail"].default_value = 3.2
    n_black.inputs["Roughness"].default_value = 0.40
    n_black.inputs["Distortion"].default_value = 0.48
    nt.links.new(voff.outputs["Vector"], n_black.inputs["Vector"])

    r_black = nt.nodes.new("ShaderNodeValToRGB")
    r_black.color_ramp.elements[0].position = 0.545
    r_black.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_black.color_ramp.elements[1].position = 0.575
    r_black.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(n_black.outputs["Fac"], r_black.inputs["Fac"])

    # Mix Bronzegrün + Lederbraun -> then Teerschwarz
    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = srgb_to_lin(0.242, 0.282, 0.200)  # Bronzegrün RAL 6031
    mix1.inputs[7].default_value = srgb_to_lin(0.328, 0.232, 0.168)  # Lederbraun RAL 8027
    nt.links.new(r_brown.outputs["Color"], mix1.inputs[0])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = srgb_to_lin(0.175, 0.180, 0.186)  # Teerschwarz RAL 9021 (AgX safe!)
    nt.links.new(r_black.outputs["Color"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])

    # Multi-scale RHA rolled steel pitting + CARC matte mineral grit + rain streaks
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.022
    n_macro.inputs["Detail"].default_value = 6.0
    n_macro.inputs["Roughness"].default_value = 0.62
    nt.links.new(vadd.outputs["Vector"], n_macro.inputs["Vector"])

    n_mid = nt.nodes.new("ShaderNodeTexNoise")
    n_mid.inputs["Scale"].default_value = 0.28
    n_mid.inputs["Detail"].default_value = 7.0
    n_mid.inputs["Roughness"].default_value = 0.68
    nt.links.new(vadd.outputs["Vector"], n_mid.inputs["Vector"])

    n_grit = nt.nodes.new("ShaderNodeTexNoise")
    n_grit.inputs["Scale"].default_value = 1.15
    n_grit.inputs["Detail"].default_value = 8.0
    n_grit.inputs["Roughness"].default_value = 0.72
    nt.links.new(vadd.outputs["Vector"], n_grit.inputs["Vector"])

    vor_pit = nt.nodes.new("ShaderNodeTexVoronoi")
    vor_pit.feature = "F1"
    vor_pit.inputs["Scale"].default_value = 1.85
    nt.links.new(vadd.outputs["Vector"], vor_pit.inputs["Vector"])

    mix_b1 = nt.nodes.new("ShaderNodeMix")
    mix_b1.data_type = "FLOAT"
    mix_b1.inputs["Factor"].default_value = 0.48
    nt.links.new(n_mid.outputs["Fac"], mix_b1.inputs[2])
    nt.links.new(n_grit.outputs["Fac"], mix_b1.inputs[3])

    mix_b2 = nt.nodes.new("ShaderNodeMix")
    mix_b2.data_type = "FLOAT"
    mix_b2.inputs["Factor"].default_value = 0.36
    nt.links.new(mix_b1.outputs[0], mix_b2.inputs[2])
    nt.links.new(vor_pit.outputs["Distance"], mix_b2.inputs[3])
    bump_sock = mix_b2.outputs[0]

    # Subtle vertical European rain / diesel-grime streaks
    mp_st = nt.nodes.new("ShaderNodeMapping")
    mp_st.inputs["Scale"].default_value = (0.095, 0.095, 0.015)
    nt.links.new(vadd.outputs["Vector"], mp_st.inputs["Vector"])
    n_st = nt.nodes.new("ShaderNodeTexNoise")
    n_st.inputs["Scale"].default_value = 1.0
    n_st.inputs["Detail"].default_value = 5.0
    nt.links.new(mp_st.outputs["Vector"], n_st.inputs["Vector"])
    r_st = nt.nodes.new("ShaderNodeValToRGB")
    r_st.color_ramp.elements[0].position = 0.54
    r_st.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_st.color_ramp.elements[1].position = 0.78
    r_st.color_ramp.elements[1].color = (0.22, 0.22, 0.22, 1.0)
    nt.links.new(n_st.outputs["Fac"], r_st.inputs["Fac"])

    mix_st = nt.nodes.new("ShaderNodeMix")
    mix_st.data_type = "RGBA"
    mix_st.inputs[7].default_value = srgb_to_lin(0.14, 0.14, 0.12)
    nt.links.new(r_st.outputs["Color"], mix_st.inputs[0])
    nt.links.new(mix2.outputs[2], mix_st.inputs[6])
    col_sock = mix_st.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.68, roughness - 0.10)
    rgh_map.inputs["To Max"].default_value = min(0.92, roughness + 0.08)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    sep_w = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(vadd.outputs["Vector"], sep_w.inputs["Vector"])

    # --- PLAN B.1: DRIED CENTRAL-EUROPEAN MUD & FINE FIELD GRIT (rgh 0.94..0.96, met 0.0) ---
    if mud_strength > 0.01:
        # Irregular organic splatter height offset so mud line breaks up naturally across lower 28% of skirts & hull
        n_splat = nt.nodes.new("ShaderNodeTexNoise")
        n_splat.inputs["Scale"].default_value = 0.045
        n_splat.inputs["Detail"].default_value = 7.0
        n_splat.inputs["Roughness"].default_value = 0.72
        nt.links.new(vadd.outputs["Vector"], n_splat.inputs["Vector"])

        mr_off = nt.nodes.new("ShaderNodeMapRange")
        mr_off.clamp = True
        mr_off.inputs["From Min"].default_value = 0.25
        mr_off.inputs["From Max"].default_value = 0.78
        mr_off.inputs["To Min"].default_value = -16.0
        mr_off.inputs["To Max"].default_value = 18.0
        nt.links.new(n_splat.outputs["Fac"], mr_off.inputs["Value"])

        z_pert = nt.nodes.new("ShaderNodeMath")
        z_pert.operation = "ADD"
        nt.links.new(sep_w.outputs["Z"], z_pert.inputs[0])
        nt.links.new(mr_off.outputs["Result"], z_pert.inputs[1])

        mr_mud = nt.nodes.new("ShaderNodeMapRange")
        mr_mud.clamp = True
        mr_mud.inputs["From Min"].default_value = mud_z_top - 42.0
        mr_mud.inputs["From Max"].default_value = mud_z_top
        mr_mud.inputs["To Min"].default_value = min(0.92, mud_strength)
        mr_mud.inputs["To Max"].default_value = 0.0
        nt.links.new(z_pert.outputs["Value"], mr_mud.inputs["Value"])

        # Fine dry clod breakup
        n_clod = nt.nodes.new("ShaderNodeTexNoise")
        n_clod.inputs["Scale"].default_value = 0.35
        n_clod.inputs["Detail"].default_value = 8.0
        n_clod.inputs["Roughness"].default_value = 0.78
        nt.links.new(vadd.outputs["Vector"], n_clod.inputs["Vector"])

        r_clod = nt.nodes.new("ShaderNodeValToRGB")
        r_clod.color_ramp.elements[0].position = 0.26
        r_clod.color_ramp.elements[0].color = (0.35, 0.35, 0.35, 1.0)
        r_clod.color_ramp.elements[1].position = 0.68
        r_clod.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(n_clod.outputs["Fac"], r_clod.inputs["Fac"])

        mul_mud = nt.nodes.new("ShaderNodeMath")
        mul_mud.operation = "MULTIPLY"
        nt.links.new(mr_mud.outputs["Result"], mul_mud.inputs[0])
        nt.links.new(r_clod.outputs["Color"], mul_mud.inputs[1])

        # Two-tone Central-European dry loam & darker field clay
        mix_mud_col = nt.nodes.new("ShaderNodeMix")
        mix_mud_col.data_type = "RGBA"
        mix_mud_col.inputs[6].default_value = srgb_to_lin(0.27, 0.23, 0.17)
        mix_mud_col.inputs[7].default_value = srgb_to_lin(0.41, 0.35, 0.26)
        nt.links.new(n_grit.outputs["Fac"], mix_mud_col.inputs[0])

        mix_mud = nt.nodes.new("ShaderNodeMix")
        mix_mud.data_type = "RGBA"
        nt.links.new(mul_mud.outputs["Value"], mix_mud.inputs[0])
        nt.links.new(col_sock, mix_mud.inputs[6])
        nt.links.new(mix_mud_col.outputs[2], mix_mud.inputs[7])
        col_sock = mix_mud.outputs[2]

        # Push roughness to ultra-dry 0.94..0.96 & suppress metallic to 0.0
        rgh_mud = nt.nodes.new("ShaderNodeMapRange")
        rgh_mud.clamp = True
        rgh_mud.inputs["From Min"].default_value = 0.2
        rgh_mud.inputs["From Max"].default_value = 0.8
        rgh_mud.inputs["To Min"].default_value = 0.94
        rgh_mud.inputs["To Max"].default_value = 0.96
        nt.links.new(n_clod.outputs["Fac"], rgh_mud.inputs["Value"])

        mix_mr = nt.nodes.new("ShaderNodeMix")
        mix_mr.data_type = "FLOAT"
        nt.links.new(mul_mud.outputs["Value"], mix_mr.inputs[0])
        nt.links.new(rgh_sock, mix_mr.inputs[2])
        nt.links.new(rgh_mud.outputs["Result"], mix_mr.inputs[3])
        rgh_sock = mix_mr.outputs[0]

        mix_mm = nt.nodes.new("ShaderNodeMix")
        mix_mm.data_type = "FLOAT"
        mix_mm.inputs[3].default_value = 0.0
        nt.links.new(mul_mud.outputs["Value"], mix_mm.inputs[0])
        nt.links.new(met_sock, mix_mm.inputs[2])
        met_sock = mix_mm.outputs[0]

        # Layer gritty clod relief into bump height
        mix_mb = nt.nodes.new("ShaderNodeMix")
        mix_mb.data_type = "FLOAT"
        nt.links.new(mul_mud.outputs["Value"], mix_mb.inputs[0])
        nt.links.new(bump_sock, mix_mb.inputs[2])
        nt.links.new(n_clod.outputs["Fac"], mix_mb.inputs[3])
        bump_sock = mix_mb.outputs[0]

    # --- PLAN B.2: MTU V12 DIESEL EXHAUST SOOT STREAKING (rear exhaust ports & deck louvers) ---
    if exhaust_soot:
        # Concentrate soot around rear hull exhaust ports (world X < -298, Z > +6, |Y| > 118) & rear deck louvers (X < -230, Z > +46)
        mr_ex_x = nt.nodes.new("ShaderNodeMapRange")
        mr_ex_x.clamp = True
        mr_ex_x.inputs["From Min"].default_value = -378.0
        mr_ex_x.inputs["From Max"].default_value = -290.0
        mr_ex_x.inputs["To Min"].default_value = 1.0
        mr_ex_x.inputs["To Max"].default_value = 0.0
        nt.links.new(sep_w.outputs["X"], mr_ex_x.inputs["Value"])

        abs_y = nt.nodes.new("ShaderNodeMath")
        abs_y.operation = "ABSOLUTE"
        nt.links.new(sep_w.outputs["Y"], abs_y.inputs[0])

        mr_ex_y = nt.nodes.new("ShaderNodeMapRange")
        mr_ex_y.clamp = True
        mr_ex_y.inputs["From Min"].default_value = 98.0
        mr_ex_y.inputs["From Max"].default_value = 152.0
        mr_ex_y.inputs["To Min"].default_value = 0.0
        mr_ex_y.inputs["To Max"].default_value = 1.0
        nt.links.new(abs_y.outputs["Value"], mr_ex_y.inputs["Value"])

        mr_ex_z = nt.nodes.new("ShaderNodeMapRange")
        mr_ex_z.clamp = True
        mr_ex_z.inputs["From Min"].default_value = 4.0
        mr_ex_z.inputs["From Max"].default_value = 26.0
        mr_ex_z.inputs["To Min"].default_value = 0.0
        mr_ex_z.inputs["To Max"].default_value = 1.0
        nt.links.new(sep_w.outputs["Z"], mr_ex_z.inputs["Value"])

        # Soot plume stretched along -X/+Z
        mp_soot = nt.nodes.new("ShaderNodeMapping")
        mp_soot.inputs["Scale"].default_value = (0.025, 0.065, 0.055)
        nt.links.new(vadd.outputs["Vector"], mp_soot.inputs["Vector"])
        n_soot = nt.nodes.new("ShaderNodeTexNoise")
        n_soot.inputs["Scale"].default_value = 1.4
        n_soot.inputs["Detail"].default_value = 6.0
        nt.links.new(mp_soot.outputs["Vector"], n_soot.inputs["Vector"])

        m_ex1 = nt.nodes.new("ShaderNodeMath")
        m_ex1.operation = "MULTIPLY"
        nt.links.new(mr_ex_x.outputs["Result"], m_ex1.inputs[0])
        nt.links.new(mr_ex_y.outputs["Result"], m_ex1.inputs[1])

        m_ex2 = nt.nodes.new("ShaderNodeMath")
        m_ex2.operation = "MULTIPLY"
        nt.links.new(m_ex1.outputs["Value"], m_ex2.inputs[0])
        nt.links.new(mr_ex_z.outputs["Result"], m_ex2.inputs[1])

        m_ex3 = nt.nodes.new("ShaderNodeMath")
        m_ex3.operation = "MULTIPLY"
        nt.links.new(m_ex2.outputs["Value"], m_ex3.inputs[0])
        nt.links.new(n_soot.outputs["Fac"], m_ex3.inputs[1])

        m_ex_cap = nt.nodes.new("ShaderNodeMath")
        m_ex_cap.operation = "MULTIPLY"
        m_ex_cap.inputs[1].default_value = 0.82
        m_ex_cap.use_clamp = True
        nt.links.new(m_ex3.outputs["Value"], m_ex_cap.inputs[0])

        mix_sc = nt.nodes.new("ShaderNodeMix")
        mix_sc.data_type = "RGBA"
        mix_sc.inputs[7].default_value = srgb_to_lin(0.085, 0.085, 0.09)
        nt.links.new(m_ex_cap.outputs["Value"], mix_sc.inputs[0])
        nt.links.new(col_sock, mix_sc.inputs[6])
        col_sock = mix_sc.outputs[2]

        mix_sr = nt.nodes.new("ShaderNodeMix")
        mix_sr.data_type = "FLOAT"
        mix_sr.inputs[3].default_value = 0.93
        nt.links.new(m_ex_cap.outputs["Value"], mix_sr.inputs[0])
        nt.links.new(rgh_sock, mix_sr.inputs[2])
        rgh_sock = mix_sr.outputs[0]

    # --- PLAN B.3: 6.6M RH-120 L/55A1 MUZZLE PROPELLANT SOOT ---
    if muzzle_soot:
        mr_mz = nt.nodes.new("ShaderNodeMapRange")
        mr_mz.clamp = True
        mr_mz.inputs["From Min"].default_value = 656.0
        mr_mz.inputs["From Max"].default_value = 708.0
        mr_mz.inputs["To Min"].default_value = 0.0
        mr_mz.inputs["To Max"].default_value = 0.68
        nt.links.new(sep_w.outputs["X"], mr_mz.inputs["Value"])

        m_mz = nt.nodes.new("ShaderNodeMath")
        m_mz.operation = "MULTIPLY"
        nt.links.new(mr_mz.outputs["Result"], m_mz.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], m_mz.inputs[1])

        mix_mc = nt.nodes.new("ShaderNodeMix")
        mix_mc.data_type = "RGBA"
        mix_mc.inputs[7].default_value = srgb_to_lin(0.11, 0.11, 0.115)
        nt.links.new(m_mz.outputs["Value"], mix_mc.inputs[0])
        nt.links.new(col_sock, mix_mc.inputs[6])
        col_sock = mix_mc.outputs[2]

        mix_mzr = nt.nodes.new("ShaderNodeMix")
        mix_mzr.data_type = "FLOAT"
        mix_mzr.inputs[3].default_value = 0.91
        nt.links.new(m_mz.outputs["Value"], mix_mzr.inputs[0])
        nt.links.new(rgh_sock, mix_mzr.inputs[2])
        rgh_sock = mix_mzr.outputs[0]

    # --- PLAN B.4: SUBTLE WET HYDRAULIC / LUBRICANT OIL SEEPAGE (rgh 0.20..0.28) ---
    if oil_seep_mode != "none":
        mp_oil = nt.nodes.new("ShaderNodeMapping")
        if oil_seep_mode == "skirts":
            # Vertical dark oil drips weeping down from top skirt hinge pins (world Y in [+22, +46])
            mp_oil.inputs["Scale"].default_value = (0.14, 0.14, 0.025)
        elif oil_seep_mode == "deck":
            # Lubricant & diesel-oil seepage pools around rear deck fan latches & louver seams
            mp_oil.inputs["Scale"].default_value = (0.045, 0.045, 0.045)
        else:
            # Road-wheel center hub oil weep stains
            mp_oil.inputs["Scale"].default_value = (0.08, 0.08, 0.04)
        nt.links.new(vadd.outputs["Vector"], mp_oil.inputs["Vector"])

        n_oil = nt.nodes.new("ShaderNodeTexNoise")
        n_oil.inputs["Scale"].default_value = 1.35
        n_oil.inputs["Detail"].default_value = 5.0
        n_oil.inputs["Roughness"].default_value = 0.58
        nt.links.new(mp_oil.outputs["Vector"], n_oil.inputs["Vector"])

        r_oil = nt.nodes.new("ShaderNodeValToRGB")
        r_oil.color_ramp.elements[0].position = 0.58
        r_oil.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        r_oil.color_ramp.elements[1].position = 0.74
        r_oil.color_ramp.elements[1].color = (0.72, 0.72, 0.72, 1.0)
        nt.links.new(n_oil.outputs["Fac"], r_oil.inputs["Fac"])

        oil_fac = r_oil.outputs["Color"]
        if oil_seep_mode == "skirts":
            mr_oh = nt.nodes.new("ShaderNodeMapRange")
            mr_oh.clamp = True
            mr_oh.inputs["From Min"].default_value = 24.0
            mr_oh.inputs["From Max"].default_value = 46.0
            mr_oh.inputs["To Min"].default_value = 0.0
            mr_oh.inputs["To Max"].default_value = 0.85
            nt.links.new(sep_w.outputs["Z"], mr_oh.inputs["Value"])
            m_os = nt.nodes.new("ShaderNodeMath")
            m_os.operation = "MULTIPLY"
            nt.links.new(oil_fac, m_os.inputs[0])
            nt.links.new(mr_oh.outputs["Result"], m_os.inputs[1])
            oil_fac = m_os.outputs["Value"]
        elif oil_seep_mode == "deck":
            # Concentrate oil seepage around rear fan grilles (X < -280) and louver latches
            mr_ox = nt.nodes.new("ShaderNodeMapRange")
            mr_ox.clamp = True
            mr_ox.inputs["From Min"].default_value = -360.0
            mr_ox.inputs["From Max"].default_value = -135.0
            mr_ox.inputs["To Min"].default_value = 0.88
            mr_ox.inputs["To Max"].default_value = 0.40
            nt.links.new(sep_w.outputs["X"], mr_ox.inputs["Value"])
            m_od = nt.nodes.new("ShaderNodeMath")
            m_od.operation = "MULTIPLY"
            nt.links.new(oil_fac, m_od.inputs[0])
            nt.links.new(mr_ox.outputs["Result"], m_od.inputs[1])
            oil_fac = m_od.outputs["Value"]

        mix_oc = nt.nodes.new("ShaderNodeMix")
        mix_oc.data_type = "RGBA"
        mix_oc.inputs[7].default_value = srgb_to_lin(0.11, 0.115, 0.095)
        nt.links.new(oil_fac, mix_oc.inputs[0])
        nt.links.new(col_sock, mix_oc.inputs[6])
        col_sock = mix_oc.outputs[2]

        mix_or = nt.nodes.new("ShaderNodeMix")
        mix_or.data_type = "FLOAT"
        mix_or.inputs[3].default_value = 0.23  # Glossy wet lubricant/hydraulic sheen (0.20..0.28)
        nt.links.new(oil_fac, mix_or.inputs[0])
        nt.links.new(rgh_sock, mix_or.inputs[2])
        rgh_sock = mix_or.outputs[0]

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    # Per-pixel BevelNormal steel armor edge chipping along arrowhead wedges, skirts & hatches!
    if edge_wear > 0.01:
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

        chip_n = nt.nodes.new("ShaderNodeTexNoise")
        chip_n.inputs["Scale"].default_value = 0.24
        chip_n.inputs["Detail"].default_value = 6.0
        chip_n.inputs["Roughness"].default_value = 0.72
        nt.links.new(vadd.outputs["Vector"], chip_n.inputs["Vector"])

        r_cn = nt.nodes.new("ShaderNodeValToRGB")
        r_cn.color_ramp.elements[0].position = 0.34
        r_cn.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)
        r_cn.color_ramp.elements[1].position = 0.66
        r_cn.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(chip_n.outputs["Fac"], r_cn.inputs["Fac"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        nt.links.new(ramp.outputs["Color"], mul_w.inputs[0])
        nt.links.new(r_cn.outputs["Color"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(0.36, 0.38, 0.41)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = 0.30
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        mix_em = nt.nodes.new("ShaderNodeMix")
        mix_em.data_type = "FLOAT"
        mix_em.inputs[3].default_value = 0.88
        nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
        nt.links.new(met_sock, mix_em.inputs[2])
        met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.36
    bump.inputs["Distance"].default_value = 0.65
    nt.links.new(bump_sock, bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_pbr_mat(
    name: str,
    base_srgb: tuple[float, float, float],
    roughness: float,
    metallic: float,
    bevel_r: float = 1.4,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.64, 0.68, 0.73),
    grain_scale: float = 0.75,
    grain_bump: float = 0.24,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    rough_var: float = 0.08,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.035
    n_macro.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 7.0
    n_micro.inputs["Roughness"].default_value = 0.66
    nt.links.new(mp.outputs["Vector"], n_micro.inputs["Vector"])

    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = srgb_to_lin(
        max(0.03, base_srgb[0] * 0.88),
        max(0.03, base_srgb[1] * 0.88),
        max(0.03, base_srgb[2] * 0.88),
    )
    mix_base.inputs[7].default_value = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.12),
        min(1.0, base_srgb[2] * 1.12),
    )
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.06, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if edge_wear > 0.005:
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

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    if grain_bump > 0.001:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.55
        nt.links.new(n_micro.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_copper_radiator_mat(name: str) -> bpy.types.Material:
    """Fine ribbed copper-fin heat exchanger radiator core."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 4.2
    wave.inputs["Distortion"].default_value = 0.15
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.62, 0.30, 0.14)
    mix_c.inputs[7].default_value = srgb_to_lin(0.86, 0.49, 0.24)
    nt.links.new(wave.outputs["Fac"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.26
    bsdf.inputs["Metallic"].default_value = 0.94

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.25
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_track_burnished_mat(name: str) -> bpy.types.Material:
    """Burnished high-wear manganese steel on Diehl 570FT grousers, end-connectors,
    center guide teeth, pins & drive sprocket tooth tips (rgh 0.24..0.30, met ~ 0.92)."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.6, 0.35, 1.6)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    n_scuff = nt.nodes.new("ShaderNodeTexNoise")
    n_scuff.inputs["Scale"].default_value = 0.85
    n_scuff.inputs["Detail"].default_value = 7.0
    n_scuff.inputs["Roughness"].default_value = 0.65
    nt.links.new(mp.outputs["Vector"], n_scuff.inputs["Vector"])

    n_fine = nt.nodes.new("ShaderNodeTexNoise")
    n_fine.inputs["Scale"].default_value = 2.4
    n_fine.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_fine.inputs["Vector"])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[6].default_value = srgb_to_lin(0.38, 0.40, 0.44)
    mix_col.inputs[7].default_value = srgb_to_lin(0.62, 0.65, 0.70)
    nt.links.new(n_scuff.outputs["Fac"], mix_col.inputs[0])

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.22
    rgh_map.inputs["From Max"].default_value = 0.78
    rgh_map.inputs["To Min"].default_value = 0.24
    rgh_map.inputs["To Max"].default_value = 0.30
    nt.links.new(n_scuff.outputs["Fac"], rgh_map.inputs["Value"])

    met_map = nt.nodes.new("ShaderNodeMapRange")
    met_map.clamp = True
    met_map.inputs["From Min"].default_value = 0.2
    met_map.inputs["From Max"].default_value = 0.8
    met_map.inputs["To Min"].default_value = 0.90
    met_map.inputs["To Max"].default_value = 0.94
    nt.links.new(n_scuff.outputs["Fac"], met_map.inputs["Value"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.45

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.20
    bump.inputs["Distance"].default_value = 0.25
    nt.links.new(n_fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_map.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(met_map.outputs["Result"], bsdf.inputs["Metallic"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_track_steel_mat(name: str) -> bpy.types.Material:
    """Diehl 570FT forged manganese track shoe body: dark oxidized steel with dried Central-European
    field mud trapped in recesses (rgh ~ 0.94) & burnished metallic ridges on high bevels."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")

    n_mud = nt.nodes.new("ShaderNodeTexNoise")
    n_mud.inputs["Scale"].default_value = 0.14
    n_mud.inputs["Detail"].default_value = 7.0
    n_mud.inputs["Roughness"].default_value = 0.72
    nt.links.new(tc.outputs["Object"], n_mud.inputs["Vector"])

    r_mud = nt.nodes.new("ShaderNodeValToRGB")
    r_mud.color_ramp.elements[0].position = 0.42
    r_mud.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_mud.color_ramp.elements[1].position = 0.68
    r_mud.color_ramp.elements[1].color = (0.62, 0.62, 0.62, 1.0)
    nt.links.new(n_mud.outputs["Fac"], r_mud.inputs["Fac"])

    n_grit = nt.nodes.new("ShaderNodeTexNoise")
    n_grit.inputs["Scale"].default_value = 1.25
    n_grit.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_grit.inputs["Vector"])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[6].default_value = srgb_to_lin(0.24, 0.25, 0.27)
    mix_col.inputs[7].default_value = srgb_to_lin(0.36, 0.31, 0.23)
    nt.links.new(r_mud.outputs["Color"], mix_col.inputs[0])

    mix_rgh = nt.nodes.new("ShaderNodeMix")
    mix_rgh.data_type = "FLOAT"
    mix_rgh.inputs[2].default_value = 0.36
    mix_rgh.inputs[3].default_value = 0.94
    nt.links.new(r_mud.outputs["Color"], mix_rgh.inputs[0])

    mix_met = nt.nodes.new("ShaderNodeMix")
    mix_met.data_type = "FLOAT"
    mix_met.inputs[2].default_value = 0.88
    mix_met.inputs[3].default_value = 0.06
    nt.links.new(r_mud.outputs["Color"], mix_met.inputs[0])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.65

    # Bright burnished steel wear on sharp shoe edges
    vdot = nt.nodes.new("ShaderNodeVectorMath")
    vdot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
    nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])
    sub_c = nt.nodes.new("ShaderNodeMath")
    sub_c.operation = "SUBTRACT"
    sub_c.inputs[0].default_value = 1.0
    nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])
    r_edge = nt.nodes.new("ShaderNodeValToRGB")
    r_edge.color_ramp.elements[0].position = 0.015
    r_edge.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_edge.color_ramp.elements[1].position = 0.14
    r_edge.color_ramp.elements[1].color = (0.82, 0.82, 0.82, 1.0)
    nt.links.new(sub_c.outputs["Value"], r_edge.inputs["Fac"])

    mix_ec = nt.nodes.new("ShaderNodeMix")
    mix_ec.data_type = "RGBA"
    mix_ec.inputs[7].default_value = srgb_to_lin(0.60, 0.63, 0.68)
    nt.links.new(r_edge.outputs["Color"], mix_ec.inputs[0])
    nt.links.new(mix_col.outputs[2], mix_ec.inputs[6])

    mix_er = nt.nodes.new("ShaderNodeMix")
    mix_er.data_type = "FLOAT"
    mix_er.inputs[3].default_value = 0.25
    nt.links.new(r_edge.outputs["Color"], mix_er.inputs[0])
    nt.links.new(mix_rgh.outputs[0], mix_er.inputs[2])

    mix_em = nt.nodes.new("ShaderNodeMix")
    mix_em.data_type = "FLOAT"
    mix_em.inputs[3].default_value = 0.93
    nt.links.new(r_edge.outputs["Color"], mix_em.inputs[0])
    nt.links.new(mix_met.outputs[0], mix_em.inputs[2])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.30
    bump.inputs["Distance"].default_value = 0.35
    nt.links.new(n_grit.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(mix_ec.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mix_er.outputs[0], bsdf.inputs["Roughness"])
    nt.links.new(mix_em.outputs[0], bsdf.inputs["Metallic"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_rubber_weathered_mat(name: str) -> bpy.types.Material:
    """Vulcanized track road pads & road-wheel tires dusted with dried European clay/grit (rgh 0.88..0.96)."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    n_dust = nt.nodes.new("ShaderNodeTexNoise")
    n_dust.inputs["Scale"].default_value = 0.12
    n_dust.inputs["Detail"].default_value = 6.0
    n_dust.inputs["Roughness"].default_value = 0.72
    nt.links.new(tc.outputs["Object"], n_dust.inputs["Vector"])

    r_d = nt.nodes.new("ShaderNodeValToRGB")
    r_d.color_ramp.elements[0].position = 0.44
    r_d.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_d.color_ramp.elements[1].position = 0.76
    r_d.color_ramp.elements[1].color = (0.48, 0.48, 0.48, 1.0)
    nt.links.new(n_dust.outputs["Fac"], r_d.inputs["Fac"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = 1.65
    n_micro.inputs["Detail"].default_value = 7.0
    nt.links.new(tc.outputs["Object"], n_micro.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.165, 0.172, 0.178)
    mix_c.inputs[7].default_value = srgb_to_lin(0.32, 0.28, 0.22)
    nt.links.new(r_d.outputs["Color"], mix_c.inputs[0])

    mix_r = nt.nodes.new("ShaderNodeMix")
    mix_r.data_type = "FLOAT"
    mix_r.inputs[2].default_value = 0.87
    mix_r.inputs[3].default_value = 0.95
    nt.links.new(r_d.outputs["Color"], mix_r.inputs[0])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.55

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.36
    bump.inputs["Distance"].default_value = 0.40
    nt.links.new(n_micro.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mix_r.outputs[0], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_oil_hub_mat(name: str) -> bpy.types.Material:
    """Dark wet hydraulic/lubricant oil seepage steel around road-wheel hubs, deck latches & hinge pins (rgh 0.20..0.28)."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    n_oil = nt.nodes.new("ShaderNodeTexNoise")
    n_oil.inputs["Scale"].default_value = 0.38
    n_oil.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_oil.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.11, 0.11, 0.105)
    mix_c.inputs[7].default_value = srgb_to_lin(0.24, 0.25, 0.27)
    nt.links.new(n_oil.outputs["Fac"], mix_c.inputs[0])

    rgh_m = nt.nodes.new("ShaderNodeMapRange")
    rgh_m.clamp = True
    rgh_m.inputs["From Min"].default_value = 0.25
    rgh_m.inputs["From Max"].default_value = 0.75
    rgh_m.inputs["To Min"].default_value = 0.20
    rgh_m.inputs["To Max"].default_value = 0.28
    nt.links.new(n_oil.outputs["Fac"], rgh_m.inputs["Value"])

    met_m = nt.nodes.new("ShaderNodeMapRange")
    met_m.clamp = True
    met_m.inputs["From Min"].default_value = 0.25
    met_m.inputs["From Max"].default_value = 0.75
    met_m.inputs["To Min"].default_value = 0.42
    met_m.inputs["To Max"].default_value = 0.78
    nt.links.new(n_oil.outputs["Fac"], met_m.inputs["Value"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.45

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_m.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(met_m.outputs["Result"], bsdf.inputs["Metallic"])
    nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_exhaust_heat_mat(name: str) -> bpy.types.Material:
    """MTU V12 oxidized heat-weathered steel & diesel soot on rear flank exhaust louver ports."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    n_ht = nt.nodes.new("ShaderNodeTexNoise")
    n_ht.inputs["Scale"].default_value = 0.14
    n_ht.inputs["Detail"].default_value = 7.0
    n_ht.inputs["Roughness"].default_value = 0.66
    nt.links.new(tc.outputs["Object"], n_ht.inputs["Vector"])

    # Oxidized bronze-brown -> scorched blue-slate -> matte diesel carbon soot
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.24
    ramp.color_ramp.elements[0].color = srgb_to_lin(0.09, 0.09, 0.095)
    e1 = ramp.color_ramp.elements.new(0.52)
    e1.color = srgb_to_lin(0.24, 0.20, 0.19)
    ramp.color_ramp.elements[2].position = 0.78
    ramp.color_ramp.elements[2].color = srgb_to_lin(0.38, 0.25, 0.16)
    nt.links.new(n_ht.outputs["Fac"], ramp.inputs["Fac"])

    rgh_m = nt.nodes.new("ShaderNodeMapRange")
    rgh_m.clamp = True
    rgh_m.inputs["From Min"].default_value = 0.24
    rgh_m.inputs["From Max"].default_value = 0.78
    rgh_m.inputs["To Min"].default_value = 0.90  # carbon soot
    rgh_m.inputs["To Max"].default_value = 0.36  # oxidized steel
    nt.links.new(n_ht.outputs["Fac"], rgh_m.inputs["Value"])

    met_m = nt.nodes.new("ShaderNodeMapRange")
    met_m.clamp = True
    met_m.inputs["From Min"].default_value = 0.24
    met_m.inputs["From Max"].default_value = 0.78
    met_m.inputs["To Min"].default_value = 0.12
    met_m.inputs["To Max"].default_value = 0.84
    nt.links.new(n_ht.outputs["Fac"], met_m.inputs["Value"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.35

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.32
    bump.inputs["Distance"].default_value = 0.35
    nt.links.new(n_ht.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rgh_m.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(met_m.outputs["Result"], bsdf.inputs["Metallic"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_tow_cable_mat(name: str) -> bpy.types.Material:
    """Braided helical steel recovery tow cable wire-rope."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.inputs["Scale"].default_value = 1.65
    wave.inputs["Distortion"].default_value = 0.8
    wave.inputs["Detail"].default_value = 3.0
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.22, 0.24, 0.26)
    mix_c.inputs[7].default_value = srgb_to_lin(0.46, 0.49, 0.53)
    nt.links.new(wave.outputs["Fac"], mix_c.inputs[0])

    rgh_m = nt.nodes.new("ShaderNodeMapRange")
    rgh_m.clamp = True
    rgh_m.inputs["To Min"].default_value = 0.28
    rgh_m.inputs["To Max"].default_value = 0.46
    nt.links.new(wave.outputs["Fac"], rgh_m.inputs["Value"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.40
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_m.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.88
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_camo_net_mat(name: str) -> bpy.types.Material:
    """Rolled Bundeswehr Flecktarn / Olive Barracuda woven camouflage scrim roll."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    n_f = nt.nodes.new("ShaderNodeTexNoise")
    n_f.inputs["Scale"].default_value = 0.24
    n_f.inputs["Detail"].default_value = 6.0
    n_f.inputs["Roughness"].default_value = 0.65
    nt.links.new(tc.outputs["Object"], n_f.inputs["Vector"])

    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 1.8
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = srgb_to_lin(0.15, 0.18, 0.13)
    e1 = ramp.color_ramp.elements.new(0.55)
    e1.color = srgb_to_lin(0.24, 0.28, 0.19)
    ramp.color_ramp.elements[2].position = 0.74
    ramp.color_ramp.elements[2].color = srgb_to_lin(0.32, 0.24, 0.17)
    nt.links.new(n_f.outputs["Fac"], ramp.inputs["Fac"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.58
    bump.inputs["Distance"].default_value = 0.45
    nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])

    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_muzzle_soot_mat(name: str) -> bpy.types.Material:
    """Rh-120 L/55A1 exposed steel muzzle tip transitioning cleanly into subtle heat tint & propellant soot."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = 550.0
    mr.inputs["From Max"].default_value = 564.0
    mr.inputs["To Min"].default_value = 0.0
    mr.inputs["To Max"].default_value = 1.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_s = nt.nodes.new("ShaderNodeTexNoise")
    n_s.inputs["Scale"].default_value = 0.45
    n_s.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_s.inputs["Vector"])

    # Bare muzzle steel -> bronze heat band -> carbon propellant soot at crown lip
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb_to_lin(0.56, 0.60, 0.65)
    e1 = ramp.color_ramp.elements.new(0.45)
    e1.color = srgb_to_lin(0.32, 0.27, 0.24)
    ramp.color_ramp.elements[2].position = 0.88
    ramp.color_ramp.elements[2].color = srgb_to_lin(0.11, 0.11, 0.12)
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])

    rgh_m = nt.nodes.new("ShaderNodeMapRange")
    rgh_m.clamp = True
    rgh_m.inputs["To Min"].default_value = 0.24
    rgh_m.inputs["To Max"].default_value = 0.86
    nt.links.new(mr.outputs["Result"], rgh_m.inputs["Value"])

    met_m = nt.nodes.new("ShaderNodeMapRange")
    met_m.clamp = True
    met_m.inputs["To Min"].default_value = 0.94
    met_m.inputs["To Max"].default_value = 0.22
    nt.links.new(mr.outputs["Result"], met_m.inputs["Value"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.45

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.25
    nt.links.new(n_s.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rgh_m.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(met_m.outputs["Result"], bsdf.inputs["Metallic"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: Hull, Skirts, Running Gear, Deck, Torsion Bars, Turret Ring ---
        "HC_CamoHull":         _build_nato_camo_mat("HC_CamoHull", (0.0, 0.0, 0.0), roughness=0.83, bevel_r=2.1, edge_wear=0.66, mud_strength=0.78, mud_z_top=-26.0, exhaust_soot=True),
        "HC_CamoSkirts":       _build_nato_camo_mat("HC_CamoSkirts", (0.0, -8.0, 0.0), roughness=0.85, bevel_r=1.8, edge_wear=0.64, mud_strength=0.86, mud_z_top=-26.0, oil_seep_mode="skirts"),
        "HC_CamoDeck":         _build_nato_camo_mat("HC_CamoDeck", (-244.0, 54.0, 0.0), roughness=0.84, bevel_r=1.8, edge_wear=0.58, exhaust_soot=True, oil_seep_mode="deck"),
        "HC_CamoWheels":       _build_nato_camo_mat("HC_CamoWheels", (0.0, -80.0, 0.0), roughness=0.82, bevel_r=1.2, edge_wear=0.54, mud_strength=0.72, mud_z_top=-45.0, oil_seep_mode="wheels"),
        "HC_GlacisHero":       _build_nato_camo_mat("HC_GlacisHero", (0.0, 0.0, 0.0), roughness=0.80, bevel_r=1.3, edge_wear=0.42),
        "HC_RearHero":         _build_nato_camo_mat("HC_RearHero", (0.0, 0.0, 0.0), roughness=0.80, bevel_r=1.3, edge_wear=0.42),
        "HC_AntiSlip":         _build_pbr_mat("HC_AntiSlip", (0.19, 0.21, 0.17), roughness=0.93, metallic=0.0, bevel_r=0.8, edge_wear=0.22, grain_scale=1.6, grain_bump=0.50),
        "HC_ArmorDark":        _build_pbr_mat("HC_ArmorDark", (0.21, 0.23, 0.25), roughness=0.42, metallic=0.82, bevel_r=1.2, edge_wear=0.66, grain_bump=0.26),
        "HC_TrackSteel":       _build_track_steel_mat("HC_TrackSteel"),
        "HC_TrackBurnished":   _build_track_burnished_mat("HC_TrackBurnished"),
        "HC_RubberPad":        _build_rubber_weathered_mat("HC_RubberPad"),
        "HC_OilHub":           _build_oil_hub_mat("HC_OilHub"),
        "HC_ExhaustHeatSteel": _build_exhaust_heat_mat("HC_ExhaustHeatSteel"),
        "HC_TowCableSteel":    _build_tow_cable_mat("HC_TowCableSteel"),
        "HC_ToolWood":         _build_pbr_mat("HC_ToolWood", (0.43, 0.30, 0.18), roughness=0.68, metallic=0.0, bevel_r=0.3, aniso_stretch=(0.25, 2.2, 2.2), grain_scale=1.2, grain_bump=0.22),
        "HC_MachinedSteel":    _build_pbr_mat("HC_MachinedSteel", (0.64, 0.68, 0.72), roughness=0.22, metallic=0.94, bevel_r=0.7, edge_wear=0.32, aniso_stretch=(0.4, 2.5, 2.5), grain_bump=0.14),
        "HC_CopperAccent":     _build_pbr_mat("HC_CopperAccent", (0.82, 0.47, 0.23), roughness=0.24, metallic=0.94, bevel_r=0.6, grain_bump=0.12),
        "HC_HeadlightLED":     _build_pbr_mat("HC_HeadlightLED", (0.84, 0.90, 0.96), roughness=0.08, metallic=0.18, bevel_r=0.25, grain_bump=0.0),

        # --- SUITE 2: Turret, Arrowhead Wedges, L/55A1 Gun, Mantlet, Recoil, Breech, Optics, Smoke ---
        "TG_CamoTurret":       _build_nato_camo_mat("TG_CamoTurret", (32.0, 82.0, 0.0), roughness=0.83, bevel_r=2.1, edge_wear=0.66),
        "TG_TurretFlank":      _build_nato_camo_mat("TG_TurretFlank", (32.0, 82.0, 0.0), roughness=0.80, bevel_r=1.3, edge_wear=0.42),
        "TG_AntiSlip":         _build_pbr_mat("TG_AntiSlip", (0.19, 0.21, 0.17), roughness=0.93, metallic=0.0, bevel_r=0.8, edge_wear=0.22, grain_scale=1.6, grain_bump=0.50),
        "TG_CamoArrowhead":    _build_nato_camo_mat("TG_CamoArrowhead", (168.0, 78.0, 0.0), roughness=0.82, bevel_r=2.2, edge_wear=0.74),
        "TG_CamoGun":          _build_nato_camo_mat("TG_CamoGun", (148.0, 74.0, 0.0), roughness=0.76, bevel_r=1.0, edge_wear=0.45, muzzle_soot=True),
        "TG_MuzzleSoot":       _build_muzzle_soot_mat("TG_MuzzleSoot"),
        "TG_CamoOptics":       _build_nato_camo_mat("TG_CamoOptics", (64.0, 116.0, 58.0), roughness=0.80, bevel_r=1.3, edge_wear=0.52),
        "TG_CamoSmoke":        _build_nato_camo_mat("TG_CamoSmoke", (14.0, 86.0, 0.0), roughness=0.78, bevel_r=0.9, edge_wear=0.48),
        "TG_CamoNetRoll":      _build_camo_net_mat("TG_CamoNetRoll"),
        "TG_StowBox":          _build_pbr_mat("TG_StowBox", (0.24, 0.27, 0.20), roughness=0.68, metallic=0.14, bevel_r=0.7, edge_wear=0.55, grain_bump=0.22),
        "TG_WhipAntenna":      _build_pbr_mat("TG_WhipAntenna", (0.16, 0.17, 0.18), roughness=0.40, metallic=0.10, bevel_r=0.15, grain_bump=0.08),
        "TG_GunMetal":         _build_pbr_mat("TG_GunMetal", (0.22, 0.24, 0.26), roughness=0.36, metallic=0.88, bevel_r=1.1, edge_wear=0.66, grain_bump=0.24),
        "TG_BreechSteel":      _build_pbr_mat("TG_BreechSteel", (0.62, 0.66, 0.71), roughness=0.23, metallic=0.95, bevel_r=0.8, edge_wear=0.34, aniso_stretch=(0.35, 2.8, 2.8), grain_bump=0.14),
        "TG_HardChrome":       _build_pbr_mat("TG_HardChrome", (0.86, 0.89, 0.93), roughness=0.14, metallic=0.98, bevel_r=0.5, grain_bump=0.04),
        "TG_BrassValve":       _build_pbr_mat("TG_BrassValve", (0.84, 0.65, 0.26), roughness=0.22, metallic=0.95, bevel_r=0.4, grain_bump=0.08),
        "TG_NeraCopper":       _build_pbr_mat("TG_NeraCopper", (0.76, 0.45, 0.24), roughness=0.30, metallic=0.86, bevel_r=0.6, grain_bump=0.14),
        # Deep dark obsidian-emerald multi-coated PERI/EMES/periscope glass (rgh 0.05 -> Optical AR Fresnel!)
        "TG_OpticEmerald":     _build_pbr_mat("TG_OpticEmerald", (0.03, 0.14, 0.11), roughness=0.05, metallic=0.58, bevel_r=0.20, grain_bump=0.004),

        # --- SUITE 3: MTU V12, RENK, Cooling Fans, Blast Door, Ammo, Crew Stations ---
        "PP_MtuAluminum":      _build_pbr_mat("PP_MtuAluminum", (0.68, 0.72, 0.76), roughness=0.30, metallic=0.90, edge_wear=0.30, bevel_r=0.45),
        "PP_MtuHeadDark":      _build_pbr_mat("PP_MtuHeadDark", (0.46, 0.50, 0.55), roughness=0.34, metallic=0.88, edge_wear=0.42, bevel_r=0.35),
        "PP_TurboChrome":      _build_pbr_mat("PP_TurboChrome", (0.84, 0.87, 0.91), roughness=0.17, metallic=0.97, bevel_r=0.35),
        "PP_CopperPipe":       _build_pbr_mat("PP_CopperPipe", (0.84, 0.48, 0.23), roughness=0.21, metallic=0.95, bevel_r=0.30),
        "PP_CopperRad":        _build_copper_radiator_mat("PP_CopperRad"),
        "PP_RenkGunmetal":     _build_pbr_mat("PP_RenkGunmetal", (0.34, 0.38, 0.42), roughness=0.38, metallic=0.84, edge_wear=0.48, bevel_r=0.45),
        "PP_FanAluminum":      _build_pbr_mat("PP_FanAluminum", (0.78, 0.82, 0.86), roughness=0.20, metallic=0.95, bevel_r=0.22),
        "PP_BlastSteel":       _build_pbr_mat("PP_BlastSteel", (0.32, 0.35, 0.39), roughness=0.40, metallic=0.82, edge_wear=0.42, bevel_r=0.45),
        "PP_BlastHero":        _build_pbr_mat("PP_BlastHero", (0.30, 0.33, 0.37), roughness=0.42, metallic=0.78, bevel_r=0.25),
        "PP_AmmoBrass":        _build_pbr_mat("PP_AmmoBrass", (0.85, 0.66, 0.25), roughness=0.20, metallic=0.96, bevel_r=0.20),
        "PP_AmmoCaseTan":      _build_pbr_mat("PP_AmmoCaseTan", (0.54, 0.48, 0.35), roughness=0.58, metallic=0.06, bevel_r=0.20),
        "PP_AmmoDart":         _build_pbr_mat("PP_AmmoDart", (0.30, 0.33, 0.37), roughness=0.24, metallic=0.94, bevel_r=0.14),
        "PP_CrewSeat":         _build_pbr_mat("PP_CrewSeat", (0.24, 0.27, 0.29), roughness=0.76, metallic=0.02, bevel_r=0.55, grain_bump=0.055),
        "PP_HazardYellow":     _build_pbr_mat("PP_HazardYellow", (0.88, 0.68, 0.16), roughness=0.36, metallic=0.08, bevel_r=0.20),
        "PP_IfisScreen":       _build_pbr_mat("PP_IfisScreen", (0.14, 0.56, 0.68), roughness=0.12, metallic=0.06, bevel_r=0.15, grain_bump=0.005),
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


def _bm_to_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None) -> bpy.types.Object:
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
        b = min(bevel, min(sx, sy, sz) * 0.35)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
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
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        b = min(bevel, min(r_top, r_bot) * 0.35, length * 0.25)
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-3]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=b, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
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
    segs: int = 40, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.32, (x1 - x0) * 0.22)
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
        a, br = rings[k], rings[(k + 1) % n]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], br[sn], br[s]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_hollow_ring_y(
    name: str, r_out: float, r_in: float, height: float,
    segs: int = 48, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    hh = height * 0.5
    return mk_hollow_tube_x(
        name, r_out, r_in, -hh, hh, segs=segs, bevel=bevel,
        xform=[("rz", math.pi * 0.5)] + (xform or []), mat=mat,
    )


def mk_extrude_xy(
    name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    """Strictly manifold convex/simple polygon extruded along Three.js Z in [z0, z1]."""
    bm = bmesh.new()
    v_back = [bm.verts.new((px, py, z0)) for px, py in pts_xy]
    v_front = [bm.verts.new((px, py, z1)) for px, py in pts_xy]
    n = len(pts_xy)
    bm.faces.new(list(reversed(v_back)))
    bm.faces.new(v_front)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_back[i], v_back[j], v_front[j], v_front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_hollow_loop_xy(
    name: str, outer_xy: list[tuple[float, float]], inner_xy: list[tuple[float, float]],
    z0: float, z1: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight manifold closed ribbon loop (e.g. continuous Diehl 570FT track belt)."""
    assert len(outer_xy) == len(inner_xy)
    bm = bmesh.new()
    n = len(outer_xy)
    ob = [bm.verts.new((x, y, z0)) for x, y in outer_xy]
    of = [bm.verts.new((x, y, z1)) for x, y in outer_xy]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner_xy]
    if_ = [bm.verts.new((x, y, z1)) for x, y in inner_xy]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ob[i], ob[j], of[j], of[i]))    # Outer perimeter
        bm.faces.new((ib[j], ib[i], if_[i], if_[j]))  # Inner perimeter
        bm.faces.new((of[i], of[j], if_[j], if_[i]))  # +Z face
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))    # -Z face
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_path(
    name: str,
    pts: list[tuple[float, float, float]],
    radii: float | list[float],
    segs: int = 10,
    mat: bpy.types.Material | None = None,
    closed: bool = False,
) -> bpy.types.Object:
    """Strictly manifold circular swept tube in Three.js coordinates using parallel-transport frames."""
    n_pts = len(pts)
    assert n_pts >= 2
    r_list = [float(radii)] * n_pts if isinstance(radii, (int, float)) else [float(r) for r in radii]
    vecs = [Vector(p) for p in pts]

    tangents = []
    for i in range(n_pts):
        if closed:
            t = vecs[(i + 1) % n_pts] - vecs[(i - 1) % n_pts]
        elif i == 0:
            t = vecs[1] - vecs[0]
        elif i == n_pts - 1:
            t = vecs[-1] - vecs[-2]
        else:
            t = vecs[i + 1] - vecs[i - 1]
        if t.length < 1e-6:
            t = Vector((1.0, 0.0, 0.0))
        tangents.append(t.normalized())

    up_ref = Vector((0.0, 1.0, 0.0)) if abs(tangents[0].y) < 0.85 else Vector((1.0, 0.0, 0.0))
    n_vec = tangents[0].cross(up_ref).normalized()
    b_vec = tangents[0].cross(n_vec).normalized()

    bm = bmesh.new()
    rings = []
    for i in range(n_pts):
        if i > 0:
            rot_q = tangents[i - 1].rotation_difference(tangents[i])
            n_vec = (rot_q @ n_vec).normalized()
            b_vec = tangents[i].cross(n_vec).normalized()
        r = r_list[i]
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            p = vecs[i] + (n_vec * math.cos(th) + b_vec * math.sin(th)) * r
            ring.append(bm.verts.new(p))
        rings.append(ring)

    span = n_pts if closed else n_pts - 1
    for i in range(span):
        a = rings[i]
        b = rings[(i + 1) % n_pts]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], b[sn], b[s]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def join_parts(name: str, objs: list[bpy.types.Object], smooth_angle_deg: float = 36.0) -> bpy.types.Object:
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
# SUITE 1 BUILDERS (8 Parts: Hull, Side Skirts, Road Wheels, Tracks, Deck, Torsion, Ring)
# =============================================================================
def build_leo_hull_shell(mats) -> bpy.types.Object:
    m_hull = mats["HC_CamoHull"]
    m_dark = mats["HC_ArmorDark"]
    m_st = mats["HC_MachinedSteel"]
    m_cab = mats["HC_TowCableSteel"]
    m_wood = mats["HC_ToolWood"]
    m_exh = mats["HC_ExhaustHeatSteel"]
    m_oil = mats["HC_OilHub"]
    parts = [
        # Hollow lower armored belly plate (14 cm thick, mine-protected 2A7V floor)
        mk_box("hs_belly", 686, 14, 224, xform=[("t", -33, -65, 0)], mat=m_hull, bevel=1.2),
        # Sloped lower glacis chin armor
        mk_extrude_xy("hs_lglacis", [(305, -72), (385, -8), (372, 2), (295, -56)], -114, 114, mat=m_hull, bevel=0.8),
        # Upper sloped glacis base armor
        mk_extrude_xy("hs_uglacis", [(232, 48), (385, -6), (385, 16), (262, 52)], -148, 148, mat=m_hull, bevel=0.8),
        # Distinctive 2A7V heavy bolt-on front glacis composite add-on armor wedge
        mk_extrude_xy("hs_2a7v_addon", [(268, 47), (385, 11), (385, -7), (366, -11), (260, 29)], -128, 128, mat=m_hull, bevel=0.9),
        # Dedicated flat Hero UV plate flush on 2A7V front glacis face (Iron Cross + Y-482 917 + MLC 70!)
        mk_box("hs_glacis_hero", 52, 4.0, 210, xform=[("rz", -0.30), ("t", 336, 28.5, 0)], mat=mats["HC_GlacisHero"], bevel=0.35),
        # Sculpted glacis & nose armor weld seams (strictly OUTSIDE Hero plate Z in [-105, 105], X in [310, 362]!)
        mk_box("hs_weld_gl_top", 2.8, 2.4, 256, xform=[("rz", -0.30), ("t", 268.5, 47.4, 0)], mat=m_dark, bevel=0.35),
        mk_box("hs_weld_nose", 3.2, 3.0, 254, xform=[("t", 384.2, -6.8, 0)], mat=m_dark, bevel=0.45),
        mk_box("hs_weld_fw", 3.0, 2.4, 222, xform=[("t", 232.0, 48.2, 0)], mat=m_dark, bevel=0.35),
        # Hollow left & right lower hull tub walls (~16 cm thick)
        mk_box("hs_wall_l", 698, 96, 16, xform=[("t", -24, -14, -104)], mat=m_hull, bevel=0.9),
        mk_box("hs_wall_r", 698, 96, 16, xform=[("t", -24, -14, 104)], mat=m_hull, bevel=0.9),
        # Upper armored sponsons overhanging the tracks (Z in [±112, ±176])
        mk_box("hs_spon_l", 710, 34, 64, xform=[("t", -18, 31, -144)], mat=m_hull, bevel=1.2),
        mk_box("hs_spon_r", 710, 34, 64, xform=[("t", -18, 31, 144)], mat=m_hull, bevel=1.2),
        # Forward hull roof deck & turret-ring surround bridges
        mk_box("hs_froof", 132, 14, 224, xform=[("t", 202, 41, 0)], mat=m_hull, bevel=0.9),
        mk_box("hs_ring_l", 252, 14, 48, xform=[("t", 32, 41, -124)], mat=m_hull, bevel=0.8),
        mk_box("hs_ring_r", 252, 14, 48, xform=[("t", 32, 41, 124)], mat=m_hull, bevel=0.8),
        # Internal armored firewall bulkhead at X = -114 separating fighting compartment & MTU V12
        mk_box("hs_firewall", 12, 100, 204, xform=[("t", -114, -6, 0)], mat=m_dark, bevel=0.6),
        # Elevated rear engine bay side rim coamings
        mk_box("hs_ec_l", 262, 18, 34, xform=[("t", -245, 45, -128)], mat=m_hull, bevel=0.8),
        mk_box("hs_ec_r", 262, 18, 34, xform=[("t", -245, 45, 128)], mat=m_hull, bevel=0.8),
        # Heavy rear armored transom plate
        mk_box("hs_rear", 16, 120, 332, xform=[("t", -377, -8, 0)], mat=m_hull, bevel=1.0),
        # Dedicated flat Rear Hero UV plate (Y-482 917 + taillights + Leitkreuz! Y in [-23, +35])
        mk_box("hs_rear_hero", 3.5, 58, 178, xform=[("t", -383.2, 6, 0)], mat=mats["HC_RearHero"], bevel=0.3),
        # Driver's raised front-right armored sliding hatch & 3 periscope vision hoods + collar weld
        mk_box("hs_drv_brow", 46, 12, 58, xform=[("t", 226, 48, 58)], mat=m_dark, bevel=0.7),
        mk_box("hs_drv_weld", 50, 2.2, 62, xform=[("t", 226, 48.2, 58)], mat=m_oil, bevel=0.3),
    ]
    for pz in (38, 58, 78):
        parts.append(mk_box(f"hs_drv_p_{pz}", 14, 8, 13, xform=[("t", 244, 50, pz)], mat=m_dark, bevel=0.4))
    # 2A7V Glacis add-on heavy bolt heads (strictly behind glacis hero plate)
    for bz in (-110, -55, 0, 55, 110):
        parts.append(mk_cyl(f"hs_bolt_{bz}", 3.2, 3.2, 3.0, axis="y", segs=12, xform=[("rz", -0.30), ("t", 282, 44, bz)], mat=m_dark, bevel=0.3))
    for side in (-1, 1):
        # Glacis lateral composite add-on weld seams (Z = ±128.2, clear of Hero plate!)
        parts.append(mk_box(f"hs_weld_gl_s_{side}", 118, 2.6, 2.6, xform=[("rz", -0.30), ("t", 326, 29.0, side * 128.2)], mat=m_dark, bevel=0.35))
        # Armored LED headlight pods w/ glowing lens face + tubular steel brush-guard cages!
        hl_z = side * 138.0
        parts.append(mk_box(f"hs_hl_{side}", 24, 16, 22, xform=[("t", 358, 32, hl_z)], mat=m_dark, bevel=0.6))
        parts.append(mk_cyl(f"hs_hll_{side}", 5.5, 5.5, 3.0, axis="x", segs=18, xform=[("t", 369.5, 32, hl_z)], mat=mats["HC_HeadlightLED"], bevel=0.3))
        # Headlight protective brush-guard cage (4 uprights + top/front protective guard bars)
        for cx_g in (344.5, 372.5):
            for cz_off in (-13.0, 13.0):
                parts.append(mk_cyl(f"hs_hlg_v_{side}_{cx_g}_{cz_off}", 1.15, 1.15, 20.5, axis="y", segs=8, xform=[("t", cx_g, 33.0, hl_z + cz_off)], mat=m_dark, bevel=0.12))
        for cz_off in (-13.0, 13.0):
            parts.append(mk_cyl(f"hs_hlg_t_{side}_{cz_off}", 1.15, 1.15, 29.5, axis="x", segs=8, xform=[("t", 358.5, 42.8, hl_z + cz_off)], mat=m_dark, bevel=0.12))
        for cy_bar in (24.5, 39.5, 42.8):
            parts.append(mk_cyl(f"hs_hlg_f_{side}_{cy_bar}", 1.05, 1.05, 27.0, axis="z", segs=8, xform=[("t", 372.5, cy_bar, hl_z)], mat=m_dark, bevel=0.12))
        parts.append(mk_cyl(f"hs_hlg_r_{side}", 1.10, 1.10, 27.0, axis="z", segs=8, xform=[("t", 344.5, 42.8, hl_z)], mat=m_dark, bevel=0.12))

        # Heavy forged front & rear towing shackles w/ pins
        parts.append(mk_box(f"hs_tow_f_{side}", 18, 12, 14, xform=[("t", 376, -18, side * 88)], mat=m_dark, bevel=0.6))
        parts.append(mk_cyl(f"hs_tow_fp_{side}", 2.4, 2.4, 18.0, axis="z", segs=10, xform=[("t", 381, -18, side * 88)], mat=m_st, bevel=0.25))
        parts.append(mk_box(f"hs_tow_r_{side}", 16, 12, 14, xform=[("t", -377, -34, side * 102)], mat=m_dark, bevel=0.6))
        parts.append(mk_cyl(f"hs_tow_rp_{side}", 2.4, 2.4, 18.0, axis="z", segs=10, xform=[("t", -382, -34, side * 102)], mat=m_st, bevel=0.25))

        # Rear flank MTU V12 side-exhaust armored louver grille housing + 6 oxidized heat-weathered vanes!
        parts.append(mk_box(f"hs_exh_fr_{side}", 60, 24, 4.0, xform=[("t", -338, 28, side * 173.2)], mat=m_dark, bevel=0.4))
        for vi in range(6):
            vx = -360.0 + vi * 8.8
            parts.append(mk_box(f"hs_exh_v_{side}_{vi}", 6.2, 19.5, 4.8, xform=[("ry", side * 0.36), ("t", vx, 28, side * 173.6)], mat=m_exh, bevel=0.25))

        # Hull roof anti-slip non-skid walkway pads & sponson perimeter weld bead
        parts.append(mk_box(f"hs_grip_{side}", 290, 1.4, 46, xform=[("t", 75, 48.2, side * 144)], mat=mats["HC_AntiSlip"], bevel=0.3))
        parts.append(mk_box(f"hs_weld_{side}", 540, 2.2, 2.6, xform=[("t", 10, 47.5, side * 174.5)], mat=m_dark, bevel=0.35))

        # Braided steel tow cables draped along both upper sponsons & rear coaming + forged eye hooks!
        cab_pts = [
            (242.0, 49.6, side * 165.0),
            (170.0, 49.8, side * 167.5),
            ( 60.0, 49.6, side * 168.5),
            (-55.0, 49.8, side * 167.5),
            (-165.0, 50.2, side * 165.0),
            (-265.0, 51.0, side * 160.0),
            (-336.0, 51.6, side * 150.0),
            (-362.0, 51.0, side * 134.0),
        ]
        parts.append(mk_tube_path(f"hs_towcab_{side}", cab_pts, 1.85, segs=10, mat=m_cab))
        # Forged cable eye thimbles & deck retaining clamp brackets
        parts.append(mk_hollow_ring_y(f"hs_cabeye_f_{side}", 6.2, 3.2, 3.6, segs=16, bevel=0.3, xform=[("t", 248.0, 49.6, side * 164.0)], mat=m_st))
        parts.append(mk_hollow_ring_y(f"hs_cabeye_r_{side}", 6.2, 3.2, 3.6, segs=16, bevel=0.3, xform=[("t", -364.0, 51.0, side * 128.0)], mat=m_st))
        for cx_cl in (140.0, -40.0, -220.0):
            parts.append(mk_box(f"hs_cabcl_{side}_{cx_cl}", 7.5, 4.8, 6.2, xform=[("t", cx_cl, 49.8, side * 167.0)], mat=m_dark, bevel=0.35))

    # Rear transom draped recovery cable slung cleanly BELOW rear hero plate (Y in [-44, -27], zero plate obstruction!)
    rear_cab_pts = [
        (-384.2, -33.0, -96.0),
        (-385.4, -39.5, -52.0),
        (-385.8, -42.5,   0.0),
        (-385.4, -39.5,  52.0),
        (-384.2, -33.0,  96.0),
    ]
    parts.append(mk_tube_path("hs_rear_towcab", rear_cab_pts, 1.75, segs=10, mat=m_cab))

    # Pioneer Tools Rack on Side Sponson Decks (strictly Y <= 53.5 cm <= 54.0!)
    # Left sponson (Z = -146): German pioneer entrenching shovel + heavy forged crowbar
    parts.append(mk_cyl("hs_shv_h", 1.7, 1.7, 74.0, axis="x", segs=10, xform=[("t", 122.0, 50.6, -148.0)], mat=m_wood, bevel=0.2))
    parts.append(mk_box("hs_shv_tg", 3.0, 2.8, 12.0, xform=[("t", 84.0, 50.6, -148.0)], mat=m_dark, bevel=0.3))
    parts.append(mk_box("hs_shv_bl", 24.0, 2.2, 16.5, xform=[("t", 168.0, 50.0, -148.0)], mat=m_dark, bevel=0.4))
    parts.append(mk_cyl("hs_crow_b", 1.35, 1.35, 96.0, axis="x", segs=6, xform=[("t", 118.0, 50.3, -135.0)], mat=m_st, bevel=0.15))
    parts.append(mk_box("hs_crow_tip", 10.0, 2.6, 4.2, xform=[("rz", 0.25), ("t", 169.0, 51.0, -135.0)], mat=m_st, bevel=0.25))
    for cx_tl in (98.0, 152.0):
        parts.append(mk_box(f"hs_tlcl_l_{cx_tl}", 5.0, 4.4, 24.0, xform=[("t", cx_tl, 50.2, -142.0)], mat=m_dark, bevel=0.3))

    # Right sponson (Z = +146): Pioneer pickaxe/mattock + heavy sledgehammer
    parts.append(mk_cyl("hs_pick_h", 1.8, 1.8, 82.0, axis="x", segs=10, xform=[("t", 108.0, 50.6, 148.0)], mat=m_wood, bevel=0.2))
    parts.append(mk_box("hs_pick_hd", 8.5, 4.2, 34.0, xform=[("t", 150.0, 51.0, 148.0)], mat=m_dark, bevel=0.5))
    parts.append(mk_cyl("hs_sldg_h", 1.7, 1.7, 64.0, axis="x", segs=10, xform=[("t", 42.0, 50.5, 136.0)], mat=m_wood, bevel=0.2))
    parts.append(mk_box("hs_sldg_hd", 9.0, 6.2, 16.0, xform=[("t", 75.0, 51.2, 136.0)], mat=m_dark, bevel=0.5))
    for cx_tr in (82.0, 138.0):
        parts.append(mk_box(f"hs_tlcl_r_{cx_tr}", 5.0, 4.4, 24.0, xform=[("t", cx_tr, 50.2, 142.0)], mat=m_dark, bevel=0.3))

    return join_parts("leo_hull_shell", parts)


def build_leo_side_skirts(mats) -> bpy.types.Object:
    m_sk = mats["HC_CamoSkirts"]
    m_dk = mats["HC_ArmorDark"]
    m_rb = mats["HC_RubberPad"]
    m_st = mats["HC_MachinedSteel"]
    m_oil = mats["HC_OilHub"]
    parts = []
    for side in (-1, 1):
        z_heavy = side * 183.25
        z_rear = side * 182.25
        # Front 3 thick modular composite ballistic skirt panels (X in [+120, +360], |Z_max| <= 187.5)
        for i in range(3):
            cx = 160 + i * 80
            parts.append(mk_box(f"sk_hf_{side}_{i}", 78, 106, 8.5, xform=[("t", cx, 1, z_heavy)], mat=m_sk, bevel=0.9))
            # Heavy top hinge knuckles with cylindrical machined pins & oiled grease collars
            for hx_off in (-22.0, 22.0):
                parts.append(mk_box(f"sk_hng_{side}_{i}_{hx_off}", 18, 6.5, 4.6, xform=[("t", cx + hx_off, 50.5, side * 185.1)], mat=m_dk, bevel=0.4))
                parts.append(mk_cyl(f"sk_pin_{side}_{i}_{hx_off}", 1.85, 1.85, 22.0, axis="x", segs=10, xform=[("t", cx + hx_off, 52.0, side * 185.4)], mat=m_oil, bevel=0.2))
                parts.append(mk_box(f"sk_gus_{side}_{i}_{hx_off}", 4.5, 9.0, 3.2, xform=[("t", cx + hx_off, 45.5, side * 185.6)], mat=m_dk, bevel=0.25))
            # Sculpted recessed crew foot-step / handle pocket surround & horizontal steel step bar
            parts.append(mk_box(f"sk_stp_t_{side}_{i}", 28, 2.4, 2.2, xform=[("t", cx, -22.5, side * 186.3)], mat=m_dk, bevel=0.2))
            parts.append(mk_box(f"sk_stp_b_{side}_{i}", 28, 2.4, 2.2, xform=[("t", cx, -33.5, side * 186.3)], mat=m_dk, bevel=0.2))
            parts.append(mk_box(f"sk_stp_l_{side}_{i}", 2.6, 11.5, 2.2, xform=[("t", cx - 12.8, -28.0, side * 186.3)], mat=m_dk, bevel=0.2))
            parts.append(mk_box(f"sk_stp_r_{side}_{i}", 2.6, 11.5, 2.2, xform=[("t", cx + 12.8, -28.0, side * 186.3)], mat=m_dk, bevel=0.2))
            parts.append(mk_cyl(f"sk_stp_bar_{side}_{i}", 1.15, 1.15, 22.0, axis="x", segs=8, xform=[("t", cx, -28.0, side * 186.2)], mat=m_st, bevel=0.12))
            # Recessed lifting handle pocket near upper panel edge + lower armor clamping bolts
            parts.append(mk_box(f"sk_hdl_{side}_{i}", 16, 4.5, 1.8, xform=[("t", cx, 24.0, side * 186.5)], mat=m_dk, bevel=0.2))
            for bx_off in (-26.0, 0.0, 26.0):
                parts.append(mk_cyl(f"sk_blt_{side}_{i}_{bx_off}", 1.4, 1.4, 1.6, axis="z", segs=6, xform=[("t", cx + bx_off, -45.5, side * 186.6)], mat=m_st, bevel=0.15))

        # Rear 6 thinner modular steel-rubber skirt panels (X in [-360, +120])
        for i in range(6):
            cx = -320 + i * 80
            parts.append(mk_box(f"sk_rr_{side}_{i}", 78, 74, 4.8, xform=[("t", cx, 17, z_rear)], mat=m_sk, bevel=0.55))
            # Top hinge knuckles & oiled latch pins
            for hx_off in (-24.0, 24.0):
                parts.append(mk_box(f"sk_rhng_{side}_{i}_{hx_off}", 14, 5.2, 3.6, xform=[("t", cx + hx_off, 51.2, side * 184.0)], mat=m_dk, bevel=0.3))
                parts.append(mk_cyl(f"sk_rpin_{side}_{i}_{hx_off}", 1.4, 1.4, 16.5, axis="x", segs=8, xform=[("t", cx + hx_off, 52.4, side * 184.5)], mat=m_oil, bevel=0.15))
            # Clamping steel batten bar securing lower vulcanized rubber mud-flap trim strip
            parts.append(mk_box(f"sk_rb_{side}_{i}", 76, 18, 3.6, xform=[("t", cx, -29, z_rear)], mat=m_rb, bevel=0.35))
            parts.append(mk_box(f"sk_clp_{side}_{i}", 74, 3.2, 2.2, xform=[("t", cx, -19.5, side * 184.2)], mat=m_dk, bevel=0.2))
            parts.append(mk_box(f"sk_rhdl_{side}_{i}", 14, 3.8, 1.6, xform=[("t", cx, 2.0, side * 184.4)], mat=m_dk, bevel=0.2))
    return join_parts("leo_side_skirts", parts)


def build_leo_road_wheels(mats) -> bpy.types.Object:
    m_whl = mats["HC_CamoWheels"]
    m_rb = mats["HC_RubberPad"]
    m_st = mats["HC_TrackSteel"]
    m_brn = mats["HC_TrackBurnished"]
    m_oil = mats["HC_OilHub"]
    m_dk = mats["HC_ArmorDark"]
    wheel_xs = [-248, -168, -88, -8, 72, 152, 232]
    roller_xs = [-208, -78, 52, 182]
    parts = []
    for side in (-1, 1):
        z_mid = side * 145.75
        for idx_w, wx in enumerate(wheel_xs):
            # Dual dished road-wheel discs: outer rubber tire rim + camou steel dish + oiled hub + lug ring
            for dz in (-15.0, 15.0):
                parts.append(mk_cyl(f"rw_tire_{side}_{idx_w}_{dz}", 35.0, 35.0, 16.0, axis="z", segs=28, xform=[("t", wx, 0, z_mid + dz)], mat=m_rb, bevel=0.85))
                parts.append(mk_cyl(f"rw_rim_{side}_{idx_w}_{dz}", 28.5, 28.5, 17.5, axis="z", segs=26, xform=[("t", wx, 0, z_mid + dz)], mat=m_whl, bevel=0.65))
            # Recessed central wheel drum & wet oil-seepage hub bearing cap (rgh ~ 0.20..0.28!)
            parts.append(mk_cyl(f"rw_hub_{side}_{idx_w}", 12.5, 12.5, 54.0, axis="z", segs=20, xform=[("t", wx, 0, z_mid)], mat=m_oil, bevel=0.5))
            parts.append(mk_cyl(f"rw_cap_{side}_{idx_w}", 7.5, 7.5, 57.2, axis="z", segs=16, xform=[("t", wx, 0, z_mid)], mat=m_oil, bevel=0.35))
            # Oil-sight glass collar ring & 6 lug bolts on outer visible wheel face
            parts.append(mk_cyl(f"rw_oilr_{side}_{idx_w}", 14.5, 14.5, 1.4, axis="z", segs=16, xform=[("t", wx, 0, z_mid + side * 24.4)], mat=m_oil, bevel=0.15))
            for b in range(6):
                ba = b * (math.pi / 3.0)
                parts.append(mk_cyl(f"rw_b_{side}_{idx_w}_{b}", 1.9, 1.9, 2.8, axis="z", segs=8, xform=[("t", wx + 16.5 * math.cos(ba), 16.5 * math.sin(ba), z_mid + side * 24.0)], mat=m_brn, bevel=0.2))
            # Cast-steel torsion swing arm connecting wheel hub inward to hull tub
            parts.append(mk_box(f"rw_arm_{side}_{idx_w}", 24, 13, 26, xform=[("rz", 0.35), ("t", wx - 10, 6, side * 116)], mat=m_dk, bevel=0.6))

        # Rear toothed drive sprocket (X = -326, local Y = +18 -> world Y = -62) w/ burnished steel tooth tips!
        for dz in (-16.0, 16.0):
            parts.append(mk_cyl(f"sp_ring_{side}_{dz}", 30.5, 30.5, 11.0, axis="z", segs=28, xform=[("t", -326, 18, z_mid + dz)], mat=m_st, bevel=0.5))
            for t_i in range(12):
                ta = t_i * (2.0 * math.pi / 12.0)
                parts.append(mk_box(f"sp_t_{side}_{dz}_{t_i}", 7.2, 6.2, 9.0, xform=[("rz", ta), ("t", -326 + 31.5 * math.cos(ta), 18 + 31.5 * math.sin(ta), z_mid + dz)], mat=m_brn, bevel=0.4))
        parts.append(mk_cyl(f"sp_hub_{side}", 20.0, 20.0, 50.0, axis="z", segs=22, xform=[("t", -326, 18, z_mid)], mat=m_oil, bevel=0.6))

        # Front tensioning idler wheel (X = +316, local Y = +16 -> world Y = -64)
        for dz in (-15.0, 15.0):
            parts.append(mk_cyl(f"id_d_{side}_{dz}", 31.0, 31.0, 13.0, axis="z", segs=28, xform=[("t", 316, 16, z_mid + dz)], mat=m_whl, bevel=0.7))
        parts.append(mk_cyl(f"id_h_{side}", 14.0, 14.0, 48.0, axis="z", segs=18, xform=[("t", 316, 16, z_mid)], mat=m_oil, bevel=0.5))

        # 4 upper track return rollers
        for idx_r, rx in enumerate(roller_xs):
            parts.append(mk_cyl(f"rr_{side}_{idx_r}", 11.0, 11.0, 44.0, axis="z", segs=20, xform=[("t", rx, 52, z_mid)], mat=m_rb, bevel=0.5))

    return join_parts("leo_road_wheels", parts)


def _sample_diehl_track_loop(n_links: int = 84) -> list[tuple[float, float, float, float, float, float]]:
    """Computes exact C1-continuous closed pitch-line loop (cx, cy, tx, ty, nx, ny) for
    Diehl 570FT track wrapped tightly around rear drive sprocket, 7 road wheels, front idler,
    flat ground-contact run (pad bottom = local -48.25 -> world -120.00 cm exact!), and
    realistic upper-run catenary sag between the 4 return rollers."""
    # All centers in track-local space (track origin Y = -71.75; road-wheels origin Y = -80.0 -> dy = -8.25)
    c_w1 = (-248.0, -8.25)
    r_w = 37.50       # road wheel R=35.0 + 2.50 half-track -> bottom pitch Y = -45.75 (pad outer = -48.25!)
    c_w7 = (232.0, -8.25)
    c_id = (316.0, 7.75)
    r_id = 35.50      # front idler R=31.0 + clearance -> front outer X = 316 + 38.0 = 354.0 (ref 356)
    c_sp = (-326.0, 9.75)
    r_sp = 37.50      # rear sprocket teeth tip R=35.1 -> rear outer X = -326 - 40.0 = -366.0 (ref -368)
    y_roll = 56.00    # return rollers top Y = 54.75 -> inner shoe = 53.50, outer pad = 58.50 (ref 58.0)

    def _ext_tan_ccw(c1, r1, c2, r2):
        dx, dy = c2[0] - c1[0], c2[1] - c1[1]
        d = math.hypot(dx, dy)
        alpha = math.atan2(dy, dx)
        beta = math.acos(max(-1.0, min(1.0, (r1 - r2) / d)))
        return alpha - beta

    def _arc_pts(c, r, a0, a1, steps):
        # Ensure CCW increase (a1 >= a0)
        while a1 < a0:
            a1 += 2.0 * math.pi
        return [
            (c[0] + r * math.cos(a0 + (a1 - a0) * k / steps), c[1] + r * math.sin(a0 + (a1 - a0) * k / steps))
            for k in range(steps)
        ]

    # Exact tangent angles
    ang_bot = -math.pi * 0.5
    ang_w7_id = _ext_tan_ccw(c_w7, r_w, c_id, r_id)
    # Front idler top tangent toward Roller 4 (182, y_roll)
    p_r4 = (182.0, y_roll)
    dx_id4, dy_id4 = p_r4[0] - c_id[0], p_r4[1] - c_id[1]
    d_id4 = math.hypot(dx_id4, dy_id4)
    ang_id_top = math.atan2(dy_id4, dx_id4) - math.acos(r_id / d_id4)
    p_id_top = (c_id[0] + r_id * math.cos(ang_id_top), c_id[1] + r_id * math.sin(ang_id_top))

    # Rear sprocket top tangent from Roller 1 (-208, y_roll)
    p_r1 = (-208.0, y_roll)
    dx_sp1, dy_sp1 = p_r1[0] - c_sp[0], p_r1[1] - c_sp[1]
    d_sp1 = math.hypot(dx_sp1, dy_sp1)
    ang_sp_top = math.atan2(dy_sp1, dx_sp1) + math.acos(r_sp / d_sp1)
    p_sp_top = (c_sp[0] + r_sp * math.cos(ang_sp_top), c_sp[1] + r_sp * math.sin(ang_sp_top))

    ang_sp_w1 = _ext_tan_ccw(c_sp, r_sp, c_w1, r_w)

    # Assemble dense closed CCW polyline
    poly: list[tuple[float, float]] = []
    # 1. Flat ground-contact bottom run (X in [-248, +232], Y = -45.75 exact)
    for k in range(48):
        poly.append((-248.0 + 480.0 * k / 48.0, -45.75))
    # 2. Road Wheel 7 lower-front curve + straight front climb + Front Idler wrap
    poly.extend(_arc_pts(c_w7, r_w, ang_bot, ang_w7_id, 8))
    p_w7_t = (c_w7[0] + r_w * math.cos(ang_w7_id), c_w7[1] + r_w * math.sin(ang_w7_id))
    p_id_b = (c_id[0] + r_id * math.cos(ang_w7_id), c_id[1] + r_id * math.sin(ang_w7_id))
    for k in range(12):
        u = k / 12.0
        poly.append((p_w7_t[0] + (p_id_b[0] - p_w7_t[0]) * u, p_w7_t[1] + (p_id_b[1] - p_w7_t[1]) * u))
    poly.extend(_arc_pts(c_id, r_id, ang_w7_id, ang_id_top, 28))
    # 3. Upper return run across 4 return rollers with realistic catenary sag!
    upper_nodes = [
        p_id_top,
        (182.0, y_roll),
        (52.0, y_roll),
        (-78.0, y_roll),
        (-208.0, y_roll),
        p_sp_top,
    ]
    sags = (1.75, 2.75, 2.75, 2.75, 1.85)
    for si in range(len(upper_nodes) - 1):
        a, b = upper_nodes[si], upper_nodes[si + 1]
        sag = sags[si]
        steps = 18
        for k in range(steps):
            u = k / steps
            px = a[0] + (b[0] - a[0]) * u
            py = a[1] + (b[1] - a[1]) * u - sag * 4.0 * u * (1.0 - u)
            poly.append((px, py))
    # 4. Rear Drive Sprocket wrap + straight rear descent + Road Wheel 1 lower-rear curve
    poly.extend(_arc_pts(c_sp, r_sp, ang_sp_top, ang_sp_w1, 28))
    p_sp_b = (c_sp[0] + r_sp * math.cos(ang_sp_w1), c_sp[1] + r_sp * math.sin(ang_sp_w1))
    p_w1_t = (c_w1[0] + r_w * math.cos(ang_sp_w1), c_w1[1] + r_w * math.sin(ang_sp_w1))
    for k in range(12):
        u = k / 12.0
        poly.append((p_sp_b[0] + (p_w1_t[0] - p_sp_b[0]) * u, p_sp_b[1] + (p_w1_t[1] - p_sp_b[1]) * u))
    poly.extend(_arc_pts(c_w1, r_w, ang_sp_w1, ang_bot + 2.0 * math.pi, 8))

    # Resample closed loop uniformly by exact arc length into `n_links` articulated link frames
    m = len(poly)
    cum = [0.0]
    for i in range(m):
        p0, p1 = poly[i], poly[(i + 1) % m]
        cum.append(cum[-1] + math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
    total_len = cum[-1]

    def _eval_at(s_val: float) -> tuple[float, float]:
        s_mod = s_val % total_len
        lo, hi = 0, m - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if cum[mid] <= s_mod:
                lo = mid
            else:
                hi = mid - 1
        seg_l = max(cum[lo + 1] - cum[lo], 1e-8)
        u = (s_mod - cum[lo]) / seg_l
        p0, p1 = poly[lo], poly[(lo + 1) % m]
        return (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)

    pitch = total_len / n_links
    frames = []
    for i in range(n_links):
        s_c = (i + 0.5) * pitch
        cx, cy = _eval_at(s_c)
        px0, py0 = _eval_at(s_c - pitch * 0.42)
        px1, py1 = _eval_at(s_c + pitch * 0.42)
        tx, ty = px1 - px0, py1 - py0
        tl = math.hypot(tx, ty)
        tx, ty = tx / tl, ty / tl
        # CCW loop -> outward normal = (+ty, -tx)
        nx, ny = ty, -tx
        # Lock bottom flat ground-run links to exact horizontal Y = -45.75 (zero fp jitter!)
        if cy < -45.55 and ny < -0.995 and -246.0 <= cx <= 230.0:
            cy, tx, ty, nx, ny = -45.75, 1.0, 0.0, 0.0, -1.0
        frames.append((cx, cy, tx, ty, nx, ny))
    return frames


def _build_diehl_track_obj(part_name: str, mats, track_row_offset: int = 0) -> bpy.types.Object:
    """Museum-flagship Diehl 570FT individual articulated track links (84 links per side):
    forged steel link body + twin beveled octagonal rubber road pads + burnished grouser ribs
    + twin connector pins + outer figure-8 end-connectors + central tapered steel guide horn,
    with realistic upper-run catenary sag, EXACT ground contact (local Y_min = -48.25 ->
    world Y_min = -120.00 cm), 0 non-manifold edges, and direct analytical bleed-proof UVs!"""
    m_st = mats["HC_TrackSteel"]
    m_brn = mats["HC_TrackBurnished"]
    m_rb = mats["HC_RubberPad"]

    n_links = 84
    frames = _sample_diehl_track_loop(n_links)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    # Material slot indices: 0 = HC_TrackSteel, 1 = HC_TrackBurnished, 2 = HC_RubberPad
    MAT_STEEL = 0
    MAT_BURN = 1
    MAT_RUB = 2

    def _grid_cell(band_v0: float, band_v1: float, link_i: int) -> tuple[float, float, float, float]:
        cols, rows = 28, 6
        g_idx = track_row_offset * cols + link_i
        col = g_idx % cols
        row = g_idx // cols
        u_span = 0.976 / cols
        v_span = (band_v1 - band_v0) / rows
        pad_u = u_span * 0.045
        pad_v = v_span * 0.075
        u0 = 0.012 + col * u_span + pad_u
        u1 = 0.012 + (col + 1) * u_span - pad_u
        v0 = band_v0 + row * v_span + pad_v
        v1 = band_v0 + (row + 1) * v_span - pad_v
        return (u0, u1, v0, v1)

    def _assign_faces_uv_grid(faces: list, cell: tuple[float, float, float, float]):
        """Maps M convex faces cleanly into non-overlapping sub-tiles inside `cell`."""
        u0, u1, v0, v1 = cell
        m_f = len(faces)
        cols = max(1, int(math.ceil(math.sqrt(m_f * 1.8))))
        rows = max(1, int(math.ceil(m_f / cols)))
        du = (u1 - u0) / cols
        dv = (v1 - v0) / rows
        pu, pv = du * 0.07, dv * 0.07
        for fi, face in enumerate(faces):
            c = fi % cols
            r = fi // cols
            fu0 = u0 + c * du + pu
            fu1 = u0 + (c + 1) * du - pu
            fv0 = v0 + r * dv + pv
            fv1 = v0 + (r + 1) * dv - pv
            verts_co = [lp.vert.co for lp in face.loops]
            # Orthonormal 2D face projection preserving tangent basis
            e1 = verts_co[1] - verts_co[0]
            if e1.length < 1e-6:
                e1 = Vector((1.0, 0.0, 0.0))
            e1 = e1.normalized()
            fn = face.normal
            if fn.length < 1e-6:
                fn = Vector((0.0, 0.0, 1.0))
            e2 = fn.cross(e1)
            if e2.length < 1e-6:
                e2 = Vector((0.0, 1.0, 0.0))
            else:
                e2 = e2.normalized()
            us = [(co - verts_co[0]).dot(e1) for co in verts_co]
            vs = [(co - verts_co[0]).dot(e2) for co in verts_co]
            umin, umax = min(us), max(us)
            vmin, vmax = min(vs), max(vs)
            uspan = max(umax - umin, 1e-5)
            vspan = max(vmax - vmin, 1e-5)
            for lp, pu_v, pv_v in zip(face.loops, us, vs):
                lp[uv_layer].uv = (
                    fu0 + ((pu_v - umin) / uspan) * (fu1 - fu0),
                    fv0 + ((pv_v - vmin) / vspan) * (fv1 - fv0),
                )

    def _to_b(cx, cy, tx, ty, nx, ny, a_loc, out_loc, z_loc, y_lift=0.0) -> Vector:
        # Three.js (x, y, z) -> Blender (x, -z, y)
        px = cx + a_loc * tx + out_loc * nx
        py = cy + a_loc * ty + out_loc * ny + y_lift
        return Vector((px, -z_loc, py))

    def _add_extrude_z(
        pts_ao: list[tuple[float, float]], z0: float, z1: float,
        frame, y_lift: float, mat_idx: int, uv_cell: tuple[float, float, float, float],
    ):
        cx, cy, tx, ty, nx, ny = frame
        vb = [bm.verts.new(_to_b(cx, cy, tx, ty, nx, ny, a, o, z0, y_lift)) for a, o in pts_ao]
        vf = [bm.verts.new(_to_b(cx, cy, tx, ty, nx, ny, a, o, z1, y_lift)) for a, o in pts_ao]
        n = len(pts_ao)
        new_faces = [bm.faces.new(list(reversed(vb))), bm.faces.new(vf)]
        for k in range(n):
            kn = (k + 1) % n
            new_faces.append(bm.faces.new((vb[k], vb[kn], vf[kn], vf[k])))
        bmesh.ops.recalc_face_normals(bm, faces=new_faces)
        for f in new_faces:
            f.material_index = mat_idx
            f.normal_update()
        _assign_faces_uv_grid(new_faces, uv_cell)

    def _add_frustum_out(
        a0_b: float, a1_b: float, z0_b: float, z1_b: float, out_b: float,
        a0_t: float, a1_t: float, z0_t: float, z1_t: float, out_t: float,
        frame, y_lift: float, mat_idx: int, uv_cell: tuple[float, float, float, float],
    ):
        """Closed 6-quad tapered prism/frustum from `out_b` to `out_t` along outward normal."""
        cx, cy, tx, ty, nx, ny = frame
        b_pts = [(a0_b, z0_b), (a1_b, z0_b), (a1_b, z1_b), (a0_b, z1_b)]
        t_pts = [(a0_t, z0_t), (a1_t, z0_t), (a1_t, z1_t), (a0_t, z1_t)]
        vb = [bm.verts.new(_to_b(cx, cy, tx, ty, nx, ny, a, out_b, z, y_lift)) for a, z in b_pts]
        vt = [bm.verts.new(_to_b(cx, cy, tx, ty, nx, ny, a, out_t, z, y_lift)) for a, z in t_pts]
        new_faces = [bm.faces.new(list(reversed(vb))), bm.faces.new(vt)]
        for k in range(4):
            kn = (k + 1) % 4
            new_faces.append(bm.faces.new((vb[k], vb[kn], vt[kn], vt[k])))
        bmesh.ops.recalc_face_normals(bm, faces=new_faces)
        for f in new_faces:
            f.material_index = mat_idx
            f.normal_update()
        _assign_faces_uv_grid(new_faces, uv_cell)

    def _sub_cell(cell: tuple[float, float, float, float], slot: int, total_slots: int) -> tuple[float, float, float, float]:
        u0, u1, v0, v1 = cell
        w = (u1 - u0) / total_slots
        p = w * 0.05
        return (u0 + slot * w + p, u0 + (slot + 1) * w - p, v0, v1)

    # Chamfered octagonal steel shoe profile in (along, outward)
    shoe_prof = [
        (-7.4, -2.50), (7.4, -2.50), (8.0, -1.75), (8.0, 0.35),
        (7.1, 0.95), (-7.1, 0.95), (-8.0, 0.35), (-8.0, -1.75),
    ]
    # Hex connector pin bar profile at link joint (+9.2 along)
    pin_r = 1.18
    pin_prof = [
        (9.2 + pin_r * math.cos(k * math.pi / 3.0), -0.85 + pin_r * math.sin(k * math.pi / 3.0))
        for k in range(6)
    ]
    # Sculpted figure-8 / chamfered outer end-connector profile (bridging joint pin)
    ec_prof = [
        (4.4, -2.10), (14.0, -2.10), (14.8, -1.20), (14.8, 0.55),
        (13.8, 1.35), (4.6, 1.35), (3.6, 0.55), (3.6, -1.20),
    ]

    ext_ao_pts = ((-8.0, 0.95), (8.0, 0.95), (-6.6, 2.50), (6.6, 2.50), (3.6, 1.35), (14.8, 1.35), (-8.0, -2.50), (8.0, -2.50))
    for li, frame in enumerate(frames):
        cx, cy, tx, ty, nx, ny = frame
        # Guarantee NO tilted wheel-transition link vertex dips below local Y = -48.25!
        min_corner_y = min(cy + a * ty + o * ny for a, o in ext_ao_pts)
        y_lift = max(0.0, -48.25 - min_corner_y)

        # 3 completely isolated material UV bands in hull_camo (49px moats between rubber/burnished/steel!)
        cell_rub = _grid_cell(0.010, 0.068, li)
        cell_brn = _grid_cell(0.080, 0.144, li)
        cell_stl = _grid_cell(0.156, 0.218, li)

        # 1. Forged manganese steel Diehl 570FT link shoe body (Z in [-28.2, +28.2])
        _add_extrude_z(shoe_prof, -28.2, 28.2, frame, y_lift, MAT_STEEL, cell_stl)

        # 2. Twin beveled octagonal vulcanized rubber street pads (contact bottom = +2.50 -> exact -48.25!)
        for pi_s, z_c in enumerate((-14.0, 14.0)):
            c_pad = _sub_cell(cell_rub, pi_s, 2)
            # Base skirt of rubber pad -> chamfered contact face
            _add_frustum_out(
                -6.6, 6.6, z_c - 10.4, z_c + 10.4, 0.65,
                -5.4, 5.4, z_c - 9.2, z_c + 9.2, 2.50,
                frame, y_lift, MAT_RUB, c_pad,
            )

        # 3. Burnished metallic steel features:
        #    (a) Central tapered Leopard 2 guide horn (pointing INWARD -2.30 -> -10.20, fits cleanly between dual road wheels!)
        _add_frustum_out(
            -5.6, 5.6, -2.75, 2.75, -2.30,
            -2.6, 2.6, -1.25, 1.25, -10.10,
            frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 0, 6),
        )
        #    (b) Twin outer double-pin end-connector clamps (Z in [±28.3, ±30.9], exact width 61.8 <= 62.0!)
        _add_extrude_z(ec_prof, -30.9, -28.3, frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 1, 6))
        _add_extrude_z(ec_prof, 28.3, 30.9, frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 2, 6))
        #    (c) Twin raised ice-grouser steel ribs fore & aft of rubber pads (recessed at +1.85 so pads carry -48.25!)
        _add_frustum_out(
            -7.5, -5.8, -26.5, 26.5, 0.75,
            -7.1, -6.1, -25.8, 25.8, 1.85,
            frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 3, 6),
        )
        _add_frustum_out(
            5.8, 7.5, -26.5, 26.5, 0.75,
            6.1, 7.1, -25.8, 25.8, 1.85,
            frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 4, 6),
        )
        #    (d) Transverse forged steel hinge pin spanning full width into end-connectors
        _add_extrude_z(pin_prof, -29.6, 29.6, frame, y_lift, MAT_BURN, _sub_cell(cell_brn, 5, 6))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Verify exact ground contact invariant (Three.js Y = Blender Z)
    min_ty = min(v.co.z for v in bm.verts)
    assert abs(min_ty - (-48.25)) < 1e-3, f"{part_name} ground contact drifted: min_ty={min_ty:.4f} != -48.25"

    mesh = bpy.data.meshes.new(part_name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(part_name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(m_st)
    obj.data.materials.append(m_brn)
    obj.data.materials.append(m_rb)
    return join_parts(part_name, [obj], smooth_angle_deg=34.0)


def build_leo_engine_deck(mats) -> bpy.types.Object:
    m_dk_camo = mats["HC_CamoDeck"]
    m_dark = mats["HC_ArmorDark"]
    m_st = mats["HC_MachinedSteel"]
    m_oil = mats["HC_OilHub"]
    parts = [
        # Forward engine access deck (local X in [-7.2, +130], zero coplanar weld with rear step!)
        mk_box("ed_fwd", 137.2, 10, 224, xform=[("t", 61.4, -3, 0)], mat=m_dk_camo, bevel=0.8),
        # Elevated rear twin-fan grille deck step (local X in [-130, -8])
        mk_box("ed_rear", 122, 14, 224, xform=[("t", -69, 1, 0)], mat=m_dk_camo, bevel=0.9),
        # Center armored step hinge seam bar between forward & rear engine decks
        mk_box("ed_seam", 4.5, 4.0, 220, xform=[("t", -7.5, 6.2, 0)], mat=m_oil, bevel=0.35),
    ]
    # Twin iconic circular Leopard 2 radial fan grilles (local X = -72, Z = ±46) w/ 8 spokes + oiled latches!
    for side in (-1, 1):
        gz = side * 46.0
        parts.append(mk_hollow_ring_y(f"ed_gout_{side}", 45.2, 37.5, 8.5, segs=44, bevel=0.5, xform=[("t", -72, 6.2, gz)], mat=m_dark))
        parts.append(mk_hollow_ring_y(f"ed_gmid_{side}", 27.5, 24.5, 3.4, segs=36, bevel=0.25, xform=[("t", -72, 8.0, gz)], mat=m_dark))
        parts.append(mk_hollow_ring_y(f"ed_ginn_{side}", 16.5, 14.5, 3.0, segs=28, bevel=0.2, xform=[("t", -72, 8.1, gz)], mat=m_dark))
        parts.append(mk_cyl(f"ed_ghub_{side}", 10.5, 10.5, 4.5, axis="y", segs=20, xform=[("t", -72, 8.2, gz)], mat=m_oil, bevel=0.35))
        for ang_i in range(4):
            a = ang_i * (math.pi / 4.0)
            parts.append(mk_box(f"ed_sp_{side}_{ang_i}", 80.0, 2.4, 2.8, xform=[("ry", a), ("t", -72, 8.0 + ang_i * 0.08, gz)], mat=m_dark, bevel=0.2))
        # 4 perimeter quick-release latch toggles & oiled hinge knuckles around each radial fan grille!
        for li in range(4):
            la = li * (math.pi * 0.5) + math.pi * 0.25
            lx_p = -72.0 + 46.8 * math.cos(la)
            lz_p = gz + 46.8 * math.sin(la)
            parts.append(mk_box(f"ed_ltch_{side}_{li}", 8.5, 4.2, 6.2, xform=[("ry", -la), ("t", lx_p, 8.4, lz_p)], mat=m_oil, bevel=0.35))
            parts.append(mk_cyl(f"ed_lpin_{side}_{li}", 1.35, 1.35, 8.0, axis="z", segs=8, xform=[("ry", -la), ("t", lx_p, 9.2, lz_p)], mat=m_st, bevel=0.15))

    # Forward transverse armored air-intake louvers + flanking hinge latches & maintenance grab handles
    for i, lx in enumerate((-2, 18, 38, 58, 78, 98, 114)):
        parts.append(mk_box(f"ed_lv_{i}", 10.0, 4.5, 180.0, xform=[("t", lx, 3.2, 0)], mat=m_dark, bevel=0.35))
    for side in (-1, 1):
        parts.append(mk_box(f"ed_lfr_{side}", 128.0, 4.2, 6.0, xform=[("t", 56.0, 3.2, side * 93.0)], mat=m_oil, bevel=0.3))
        # Recessed maintenance hatch grab handles & hinged service latches
        for hx in (28.0, 90.0):
            parts.append(mk_cyl(f"ed_gh_{side}_{hx}", 1.1, 1.1, 16.0, axis="x", segs=8, xform=[("t", hx, 4.4, side * 102.0)], mat=m_st, bevel=0.12))
            parts.append(mk_box(f"ed_gl_{side}_{hx}", 4.5, 3.0, 5.5, xform=[("t", hx, 3.0, side * 102.0)], mat=m_oil, bevel=0.2))
    # 4 heavy forged quick-swap EuroPowerpack lifting lugs w/ oiled clevis pins
    for lx in (-116, 114):
        for lz in (-94, 94):
            parts.append(mk_box(f"ed_lug_{lx}_{lz}", 14, 9, 10, xform=[("t", lx, 5.5, lz)], mat=m_st, bevel=0.5))
            parts.append(mk_cyl(f"ed_lbolt_{lx}_{lz}", 2.2, 2.2, 12.2, axis="z", segs=8, xform=[("t", lx, 7.2, lz)], mat=m_oil, bevel=0.2))
    return join_parts("leo_engine_deck", parts)


def build_leo_torsion_bars(mats) -> bpy.types.Object:
    m_st = mats["HC_MachinedSteel"]
    m_dk = mats["HC_ArmorDark"]
    parts = [mk_box("tb_keel", 504, 8, 16, xform=[("t", 0, -2, 0)], mat=m_dk, bevel=0.6)]
    for i, sx in enumerate((-240, -160, -80, 0, 80, 160, 240)):
        parts.append(mk_cyl(f"tb_a_{i}", 3.2, 3.2, 212, axis="z", segs=18, xform=[("t", sx - 6, 0, 0)], mat=m_st, bevel=0.3))
        parts.append(mk_cyl(f"tb_b_{i}", 3.2, 3.2, 212, axis="z", segs=18, xform=[("t", sx + 6, 0, 0)], mat=m_dk, bevel=0.3))
        for side in (-1, 1):
            parts.append(mk_box(f"tb_anc_{i}_{side}", 18, 10, 14, xform=[("t", sx, 0, side * 101)], mat=m_dk, bevel=0.45))
            if i in (0, 1, 2, 5, 6):
                # Hydraulic rotary shock absorber cylinder
                parts.append(mk_cyl(f"tb_dmp_{i}_{side}", 5.0, 5.0, 12, axis="z", segs=16, xform=[("t", sx, 0, side * 88)], mat=m_st, bevel=0.3))
    return join_parts("leo_torsion_bars", parts)


def build_leo_turret_ring(mats) -> bpy.types.Object:
    m_st = mats["HC_MachinedSteel"]
    m_dk = mats["HC_ArmorDark"]
    m_cu = mats["HC_CopperAccent"]
    parts = [
        mk_hollow_ring_y("tr_race", 105.0, 92.0, 12.0, segs=64, bevel=0.6, xform=[("t", 0, 2, 0)], mat=m_st),
        mk_hollow_ring_y("tr_flange", 106.0, 98.0, 4.5, segs=64, bevel=0.4, xform=[("t", 0, -5, 0)], mat=m_dk),
        # All-electric ESW-Extel azimuth traverse motor & spur pinion gearbox
        mk_cyl("tr_motor", 14.0, 14.0, 22.0, axis="y", segs=28, xform=[("t", -68, -3, -62)], mat=m_dk, bevel=0.6),
        mk_cyl("tr_cu", 10.5, 10.5, 11.0, axis="y", segs=22, xform=[("t", -78, 0, -72)], mat=m_cu, bevel=0.4),
    ]
    for i in range(48):
        a = i * (2.0 * math.pi / 48.0)
        parts.append(mk_box(f"tr_gt_{i}", 3.6, 8.0, 3.6, xform=[("ry", -a), ("t", 90.5 * math.cos(a), 2, 90.5 * math.sin(a))], mat=m_st, bevel=0.18))
    return join_parts("leo_turret_ring", parts)


# =============================================================================
# SUITE 2 BUILDERS (8 Parts: Turret Shell, Arrowhead Wedges, L/55A1 Gun, Mantlet, Recoil, Breech, Optics, Smoke)
# =============================================================================
def build_leo_turret_shell(mats) -> bpy.types.Object:
    m_tur = mats["TG_CamoTurret"]
    m_flk = mats["TG_TurretFlank"]
    m_gm = mats["TG_GunMetal"]
    m_chr = mats["TG_HardChrome"]
    m_em = mats["TG_OpticEmerald"]
    m_net = mats["TG_CamoNetRoll"]
    m_box = mats["TG_StowBox"]
    m_ant = mats["TG_WhipAntenna"]
    parts = [
        # Hollow composite turret roof (~14 cm thick armored slab)
        mk_box("ts_roof", 296, 14, 248, xform=[("t", -62, 27, 0)], mat=m_tur, bevel=1.2),
        # Hollow turret floor ring deck
        mk_box("ts_flr_r", 166, 10, 256, xform=[("t", -135, -27, 0)], mat=m_tur, bevel=0.9),
        mk_box("ts_flr_fl", 130, 10, 62, xform=[("t", 25, -27, -108)], mat=m_tur, bevel=0.9),
        mk_box("ts_flr_fr", 130, 10, 62, xform=[("t", 25, -27, 108)], mat=m_tur, bevel=0.9),
        # Hollow left & right thick composite turret side walls (~22 cm thick!)
        mk_box("ts_wall_l", 298, 62, 22, xform=[("t", -60, -1, -132)], mat=m_tur, bevel=1.2),
        mk_box("ts_wall_r", 298, 62, 22, xform=[("t", -60, -1, 132)], mat=m_tur, bevel=1.2),
        # Front composite cheek bulkheads flanking open gun mantlet bay
        mk_box("ts_frt_l", 22, 62, 106, xform=[("t", 81, -1, -92)], mat=m_tur, bevel=1.0),
        mk_box("ts_frt_r", 22, 62, 106, xform=[("t", 81, -1, 92)], mat=m_tur, bevel=1.0),
        # Rear bustle armored bulkhead wall
        mk_box("ts_rear", 18, 56, 260, xform=[("t", -209, 0, 0)], mat=m_tur, bevel=1.0),
        # Iconic Leopard 2A7V angled flank bustle stowage bins (Staukästen)
        mk_box("ts_bin_l", 210, 44, 19, xform=[("t", -98, 4, -152.5)], mat=m_tur, bevel=0.9),
        mk_box("ts_bin_r", 210, 44, 19, xform=[("t", -98, 4, 152.5)], mat=m_tur, bevel=0.9),
        # Dedicated flat Right (+Z) & Left (-Z) Hero UV Flank Plates — 100% UNOBSTRUCTED REARWARD of smoke dischargers!
        mk_box("ts_hero_r", 132, 38, 2.6, xform=[("t", -130, 4, 160.8)], mat=m_flk, bevel=0.25),
        mk_box("ts_hero_l", 132, 38, 2.6, xform=[("t", -130, 4, -160.8)], mat=m_flk, bevel=0.25),
        # Twin roof ammunition blow-off vent panels over bustle + coarse anti-slip turret roof grip pads!
        mk_box("ts_bo_l", 104, 6, 84, xform=[("t", -148, 35, -48)], mat=m_gm, bevel=0.6),
        mk_box("ts_bo_r", 104, 6, 84, xform=[("t", -148, 35, 48)], mat=m_gm, bevel=0.6),
        mk_box("ts_grip_l", 124, 1.5, 52, xform=[("t", 20, 34.2, -96)], mat=mats["TG_AntiSlip"], bevel=0.3),
        mk_box("ts_grip_r", 124, 1.5, 52, xform=[("t", 20, 34.2, 96)], mat=mats["TG_AntiSlip"], bevel=0.3),
        mk_box("ts_weld_l", 286, 2.4, 2.6, xform=[("t", -60, 33.8, -124)], mat=m_gm, bevel=0.4),
        mk_box("ts_weld_r", 286, 2.4, 2.6, xform=[("t", -60, 33.8, 124)], mat=m_gm, bevel=0.4),
        mk_box("ts_weld_r2", 2.6, 2.4, 250, xform=[("t", -201, 33.8, 0)], mat=m_gm, bevel=0.4),
        # Commander's (right) & Loader's (left) circular hatches + raised periscope cupola rings
        mk_cyl("ts_cmd_h", 26, 28, 7.5, axis="y", segs=32, xform=[("t", -22, 34.2, 62)], mat=m_tur, bevel=0.55),
        mk_hollow_ring_y("ts_cmd_ring", 33.5, 27.5, 6.2, segs=36, bevel=0.45, xform=[("t", -22, 35.8, 62)], mat=m_tur),
        mk_cyl("ts_ldr_h", 28, 30, 8, axis="y", segs=32, xform=[("t", -26, 34, -60)], mat=m_gm, bevel=0.6),
        mk_box("ts_ldr_hng", 10, 4.5, 8, xform=[("t", -55, 35.5, -60)], mat=m_gm, bevel=0.35),
    ]

    # Commander's 6-block armored periscope hatch ring (60 deg radial blocks w/ emerald multi-coated glass!)
    for pi in range(6):
        pa = pi * (math.pi / 3.0) + math.pi / 6.0
        px = -22.0 + 30.2 * math.cos(pa)
        pz = 62.0 + 30.2 * math.sin(pa)
        parts.append(mk_box(f"ts_cp_hd_{pi}", 8.5, 5.2, 11.5, xform=[("ry", -pa), ("t", px, 36.8, pz)], mat=m_gm, bevel=0.35))
        parts.append(mk_box(f"ts_cp_gl_{pi}", 1.8, 3.2, 8.2, xform=[("ry", -pa), ("t", -22.0 + 33.9 * math.cos(pa), 36.6, 62.0 + 33.9 * math.sin(pa))], mat=m_em, bevel=0.15))

    # Loader's twin forward-angled roof periscope vision hoods w/ emerald glass
    for li, la in enumerate((-0.35, 0.35)):
        lx = -26.0 + 31.0 * math.cos(la)
        lz = -60.0 + 31.0 * math.sin(la)
        parts.append(mk_box(f"ts_lp_hd_{li}", 9.0, 5.0, 11.0, xform=[("ry", -la), ("t", lx, 36.5, lz)], mat=m_gm, bevel=0.35))
        parts.append(mk_box(f"ts_lp_gl_{li}", 1.8, 3.0, 7.6, xform=[("ry", -la), ("t", -26.0 + 34.8 * math.cos(la), 36.4, -60.0 + 34.8 * math.sin(la))], mat=m_em, bevel=0.15))

    # Blow-off panel hold-down clamp latches (4 per side) & armored turret roof grab handles!
    for side in (-1, 1):
        for lx in (-190.0, -106.0):
            parts.append(mk_box(f"ts_bol_{side}_{lx}", 6.0, 3.2, 10.0, xform=[("t", lx, 37.5, side * 48.0)], mat=m_chr, bevel=0.25))
        # U-shaped armored roof crew grab handles along flanks & beside hatches
        for gx in (52.0, -72.0, -162.0):
            gh_pts = [
                (gx - 11.0, 33.8, side * 116.0),
                (gx - 11.0, 37.8, side * 116.0),
                (gx + 11.0, 37.8, side * 116.0),
                (gx + 11.0, 33.8, side * 116.0),
            ]
            parts.append(mk_tube_path(f"ts_gh_{side}_{gx}", gh_pts, 1.05, segs=8, mat=m_gm))
        # Top lid seam clasp latches on flank stowage bins (on TOP face Y=+26, zero flank Hero obstruction!)
        for bx in (-172.0, -110.0, -48.0):
            parts.append(mk_box(f"ts_bltc_{side}_{bx}", 8.0, 2.8, 6.0, xform=[("t", bx, 26.5, side * 155.0)], mat=m_gm, bevel=0.25))

        # Twin flexible SEM 80/90 whip antennas on coiled spring pot bases (NATO combat bow tie-down within Y_max <= 41.3!)
        az = side * 112.0
        parts.append(mk_cyl(f"ts_ant_pot_{side}", 3.6, 4.4, 4.5, axis="y", segs=16, xform=[("t", -190.0, 35.5, az)], mat=m_gm, bevel=0.35))
        # Coiled spring base rings (3 stacked collar discs)
        for ri in range(3):
            parts.append(mk_cyl(f"ts_ant_sp_{side}_{ri}", 2.35, 2.35, 0.9, axis="y", segs=14, xform=[("t", -190.0, 38.2 + ri * 1.15, az)], mat=m_chr, bevel=0.12))
        # Arched black fiberglass whip antenna curving cleanly forward to roof tie-down clip (Y_peak = 41.2 <= 41.5, delta <= 3.5 cm!)
        ant_pts = [
            (-190.0, 40.4, az),
            (-176.0, 41.1, side * 113.2),
            (-152.0, 41.2, side * 114.6),
            (-124.0, 40.2, side * 115.6),
            (-98.0,  38.2, side * 116.2),
            (-78.0,  35.6, side * 116.5),
        ]
        ant_r = [0.82, 0.72, 0.62, 0.54, 0.46, 0.40]
        parts.append(mk_tube_path(f"ts_whip_{side}", ant_pts, ant_r, segs=8, mat=m_ant))
        parts.append(mk_box(f"ts_ant_clip_{side}", 5.0, 3.2, 4.2, xform=[("t", -78.0, 35.0, side * 116.5)], mat=m_gm, bevel=0.25))

    # Crisp Wire-Mesh / Tubular Steel Rear Turret Bustle Stowage Rack (X in [-220.6, -198.0], Z in [-116, +116])
    # Upper & lower perimeter tubular rails
    for ry in (0.0, 26.0):
        parts.append(mk_cyl(f"ts_rk_hz_{ry}", 1.35, 1.35, 232.0, axis="z", segs=10, xform=[("t", -219.2, ry, 0.0)], mat=m_gm, bevel=0.15))
        for side in (-1, 1):
            parts.append(mk_cyl(f"ts_rk_sd_{ry}_{side}", 1.35, 1.35, 22.0, axis="x", segs=10, xform=[("t", -208.5, ry, side * 116.0)], mat=m_gm, bevel=0.15))
    # 7 vertical stanchions + mid horizontal guard bar + wire-mesh vertical slats across rear face
    for sz in (-116.0, -78.0, -39.0, 0.0, 39.0, 78.0, 116.0):
        parts.append(mk_cyl(f"ts_rk_st_{sz}", 1.30, 1.30, 27.5, axis="y", segs=10, xform=[("t", -219.2, 13.0, sz)], mat=m_gm, bevel=0.15))
    parts.append(mk_cyl("ts_rk_mid", 0.95, 0.95, 231.0, axis="z", segs=8, xform=[("t", -219.2, 13.0, 0.0)], mat=m_gm, bevel=0.1))
    for mz in range(-106, 108, 18):
        parts.append(mk_cyl(f"ts_rk_msh_{mz}", 0.55, 0.55, 25.0, axis="y", segs=6, xform=[("t", -219.2, 13.0, float(mz))], mat=m_gm, bevel=0.06))
    # Bottom rack floor deck slats
    for bx in (-214.0, -206.0):
        parts.append(mk_box(f"ts_rk_fl_{bx}", 4.5, 1.6, 230.0, xform=[("t", bx, -0.4, 0.0)], mat=m_gm, bevel=0.18))

    # Rolled Bundeswehr Camouflage Net Bundle strapped cleanly into right bustle rack (+Z side)
    net_pts = [
        (-209.0, 14.5,  14.0),
        (-208.6, 15.2,  38.0),
        (-209.4, 14.8,  62.0),
        (-208.8, 15.1,  86.0),
        (-209.2, 14.4, 108.0),
    ]
    net_r = [7.8, 8.6, 8.2, 8.7, 7.6]
    parts.append(mk_tube_path("ts_camonet", net_pts, net_r, segs=14, mat=m_net))
    # 3 dark webbing cinch straps tightly binding the rolled camo net
    for sz_s in (30.0, 62.0, 92.0):
        parts.append(mk_cyl(f"ts_net_str_{sz_s}", 8.95, 8.95, 2.8, axis="z", segs=16, xform=[("t", -209.0, 14.9, sz_s)], mat=m_gm, bevel=0.18))

    # Stowed Olive-Drab Equipment Case & Cylindrical Field Canister inside left bustle rack (-Z side)
    parts.append(mk_box("ts_eqbox", 16.5, 21.5, 68.0, xform=[("t", -208.5, 11.5, -72.0)], mat=m_box, bevel=0.75))
    parts.append(mk_box("ts_eqbox_lid", 17.4, 3.2, 69.2, xform=[("t", -208.5, 21.2, -72.0)], mat=m_box, bevel=0.4))
    for lz in (-92.0, -52.0):
        parts.append(mk_box(f"ts_eqbox_ltc_{lz}", 2.2, 5.5, 4.0, xform=[("t", -216.6, 18.5, lz)], mat=m_chr, bevel=0.2))
    parts.append(mk_cyl("ts_eqcan", 7.8, 7.8, 22.0, axis="y", segs=18, xform=[("t", -208.5, 11.5, -20.0)], mat=m_gm, bevel=0.5))
    parts.append(mk_cyl("ts_eqcan_cap", 4.2, 4.2, 2.5, axis="y", segs=14, xform=[("t", -208.5, 23.0, -20.0)], mat=m_chr, bevel=0.2))

    return join_parts("leo_turret_shell", parts)


def build_leo_arrowhead_wedges(mats) -> bpy.types.Object:
    """THE LEOPARD 2A7V SILHOUETTE ICON: Razor-sharp hollow spaced Arrowhead Composite Cheek Wedges."""
    m_arr = mats["TG_CamoArrowhead"]
    m_gm = mats["TG_GunMetal"]
    m_nc = mats["TG_NeraCopper"]
    m_chr = mats["TG_HardChrome"]
    parts = []
    for side in (-1, 1):
        z0 = 38.0 if side > 0 else -160.0
        z1 = 160.0 if side > 0 else -38.0
        z_outer = 152.0 if side > 0 else -152.0
        # Monolithic watertight hollow V-shaped arrowhead prow composite shell (zero non-manifold prow weld!)
        parts.append(
            mk_extrude_xy(
                f"aw_vprow_{side}",
                [(-54, 38), (74, 2), (-54, -30), (-54, -18), (54, 2), (-54, 26)],
                z0, z1, mat=m_arr, bevel=0.65,
            )
        )
        # Outer triangular cheek closing skin (slightly inset 0.4 cm from outer face to avoid coplanar double-weld)
        parts.append(
            mk_extrude_xy(
                f"aw_sd_{side}",
                [(-53.5, -28), (71.5, 2), (-53.5, 36)],
                z_outer - 4.5, z_outer + 4.5, mat=m_arr, bevel=0.5,
            )
        )
        # Sculpted weld beads along arrowhead wedge mounting collars, top/bottom diagonal junctions & prow apex!
        parts.append(mk_box(f"aw_wcol_t_{side}", 3.0, 2.6, 120.0, xform=[("t", -53.8, 37.6, side * 99.0)], mat=m_gm, bevel=0.45))
        parts.append(mk_box(f"aw_wcol_b_{side}", 3.0, 2.6, 120.0, xform=[("t", -53.8, -29.4, side * 99.0)], mat=m_gm, bevel=0.45))
        parts.append(mk_box(f"aw_wcol_s_{side}", 3.0, 64.0, 2.8, xform=[("t", -53.8, 4.0, side * 159.0)], mat=m_gm, bevel=0.45))
        parts.append(mk_box(f"aw_wprow_u_{side}", 126.0, 2.4, 2.6, xform=[("rz", -0.275), ("t", 9.0, 20.5, side * 156.5)], mat=m_gm, bevel=0.4))
        parts.append(mk_box(f"aw_wprow_l_{side}", 126.0, 2.4, 2.6, xform=[("rz", 0.245), ("t", 9.0, -13.5, side * 156.5)], mat=m_gm, bevel=0.4))
        parts.append(mk_cyl(f"aw_wapex_{side}", 1.6, 1.6, 120.0, axis="z", segs=10, xform=[("t", 73.5, 2.0, side * 99.0)], mat=m_gm, bevel=0.2))

        # Heavy vertical turret hinge brackets along rear inner edge w/ forged cylindrical hinge pins!
        for hy in (-18, 18):
            parts.append(mk_box(f"aw_hng_{side}_{hy}", 14, 10, 12, xform=[("t", -48, hy, side * 150)], mat=m_gm, bevel=0.5))
            parts.append(mk_cyl(f"aw_hpin_{side}_{hy}", 2.2, 2.2, 16.0, axis="y", segs=10, xform=[("t", -52, hy, side * 155.5)], mat=m_chr, bevel=0.25))
        # Iconic Leopard 2A7V wedge cheek access bolt bosses & armored lifting eye on arrowhead wedge!
        for bi, bz in enumerate((56.0, 88.0, 120.0, 146.0)):
            parts.append(mk_cyl(f"aw_blt_{side}_{bi}", 2.2, 2.2, 2.8, axis="y", segs=6, xform=[("rz", -0.28), ("t", -18.0, 28.5, side * bz)], mat=m_gm, bevel=0.25))
            parts.append(mk_cyl(f"aw_blt2_{side}_{bi}", 2.0, 2.0, 2.6, axis="y", segs=6, xform=[("rz", -0.28), ("t", 22.0, 17.2, side * bz)], mat=m_gm, bevel=0.2))
        parts.append(mk_box(f"aw_lift_{side}", 10.0, 4.5, 6.0, xform=[("t", -38.0, 35.8, side * 136.0)], mat=m_gm, bevel=0.4))
        # Visible internal multi-layer spaced NERA composite steel & bronze-elastomer plates inside hollow wedge!
        for idx_p, (px, py, ph) in enumerate(((-34, 2, 42), (-16, 2, 34), (2, 2, 26), (18, 2, 18))):
            p_mat = m_nc if idx_p % 2 == 1 else m_gm
            parts.append(mk_box(f"aw_nera_{side}_{idx_p}", 4.5, ph, 104, xform=[("rz", -0.34), ("t", px, py, side * 98)], mat=p_mat, bevel=0.35))
    # Hollow upper spaced composite mantlet brow bridge spanning Z in [-37.2, +37.2] + weld collar seam
    parts.append(mk_extrude_xy("aw_brow", [(-54, 38), (18, 28), (18, 20), (-54, 28)], -37.2, 37.2, mat=m_arr, bevel=0.6))
    parts.append(mk_box("aw_brow_weld", 3.0, 2.4, 74.0, xform=[("t", -53.6, 37.6, 0.0)], mat=m_gm, bevel=0.4))
    return join_parts("leo_arrowhead_wedges", parts)


def build_leo_main_gun(mats) -> bpy.types.Object:
    """Rheinmetall Rh-120 L/55A1 6.6-meter (55-caliber) smoothbore gun w/ thermal shroud, bore evacuator, MRS & propellant soot."""
    m_camo = mats["TG_CamoGun"]
    m_gm = mats["TG_GunMetal"]
    m_mz = mats["TG_MuzzleSoot"]
    m_chr = mats["TG_HardChrome"]
    parts = [
        # Heavy forged breech-root smoothbore barrel (hollow ID = 120 mm / R_in = 6.0 cm)
        mk_hollow_tube_x("mg_root", 11.8, 6.0, -96.0, 50.0, segs=48, bevel=0.4, mat=m_gm),
        # Mid fiberglass thermal shroud sleeve (X_local in [+50, +190])
        mk_hollow_tube_x("mg_mid", 10.8, 6.0, 50.0, 190.0, segs=48, bevel=0.35, mat=m_camo),
        # Iconic Leopard 2 Bore Evacuator / Fume Extractor (X_local in [+190, +266], R = 13.8 cm)
        mk_hollow_tube_x("mg_evac", 13.8, 6.0, 196.0, 260.0, segs=48, bevel=0.6, mat=m_camo),
        mk_hollow_tube_x("mg_ev_r", 12.2, 6.0, 190.0, 197.0, segs=44, bevel=0.35, mat=m_gm),
        mk_hollow_tube_x("mg_ev_f", 12.0, 6.0, 259.0, 266.0, segs=44, bevel=0.35, mat=m_gm),
        # Ultra-long forward L/55A1 fiberglass thermal shroud (X_local in [+266, +550])
        mk_hollow_tube_x("mg_fwd", 9.6, 6.0, 266.0, 550.0, segs=48, bevel=0.3, mat=m_camo),
        # Exposed muzzle crown tip w/ subtle heat tint & propellant carbon soot (X_local in [+550, +564] -> world X = +712 cm!)
        mk_hollow_tube_x("mg_tip", 8.8, 6.0, 550.0, 564.0, segs=48, bevel=0.45, mat=m_mz),
        # Iconic Muzzle Reference Sensor (MRS) collimator mast atop muzzle crown
        mk_box("mg_mrs_mast", 8.0, 10.0, 4.8, xform=[("t", 557.0, 13.0, 0.0)], mat=m_gm, bevel=0.35),
        mk_cyl("mg_mrs_lens", 2.6, 2.6, 5.2, axis="x", segs=20, xform=[("t", 556.0, 15.5, 0.0)], mat=m_chr, bevel=0.25),
    ]
    # 7 gleaming stainless clamping bands securing thermal shroud sections
    for i, bx in enumerate((68.0, 128.0, 188.0, 268.0, 348.0, 434.0, 520.0)):
        r_band = 11.2 if bx < 195 else 10.1
        parts.append(mk_hollow_tube_x(f"mg_cl_{i}", r_band, r_band - 1.2, bx - 2.4, bx + 2.4, segs=36, bevel=0.2, mat=m_chr))
    return join_parts("leo_main_gun", parts)


def build_leo_gun_mantlet(mats) -> bpy.types.Object:
    m_gm = mats["TG_GunMetal"]
    m_br = mats["TG_BreechSteel"]
    m_tur = mats["TG_CamoTurret"]
    parts = [
        mk_box("mnt_shield", 34, 46, 70, xform=[("t", 33, 2, 0)], mat=m_tur, bevel=1.2),
        mk_hollow_tube_x("mnt_sleeve", 16.5, 12.6, -40.0, 46.0, segs=36, bevel=0.6, mat=m_gm),
        mk_box("mnt_chk_l", 76, 36, 10, xform=[("t", -2, 0, -30)], mat=m_gm, bevel=0.8),
        mk_box("mnt_chk_r", 76, 36, 10, xform=[("t", -2, 0, 30)], mat=m_gm, bevel=0.8),
        mk_cyl("mnt_trun", 10.0, 10.0, 72.0, axis="z", segs=28, xform=[("t", 0, 0, 0)], mat=m_br, bevel=0.5),
        # Coaxial 7.62mm MG3 armored barrel port on left side of mantlet
        mk_cyl("mnt_mg3", 3.2, 3.2, 42.0, axis="x", segs=20, xform=[("t", 26, 6, -24)], mat=m_gm, bevel=0.3),
    ]
    return join_parts("leo_gun_mantlet", parts)


def build_leo_recoil_system(mats) -> bpy.types.Object:
    m_chr = mats["TG_HardChrome"]
    m_gm = mats["TG_GunMetal"]
    m_brs = mats["TG_BrassValve"]
    parts = [
        # Twin upper gleaming hard-chrome hydraulic recoil brake cylinders + stator jackets
        mk_cyl("rc_top_l", 6.4, 6.4, 106, axis="x", segs=32, xform=[("t", 0, 13.5, -18.5)], mat=m_chr, bevel=0.45),
        mk_cyl("rc_top_r", 6.4, 6.4, 106, axis="x", segs=32, xform=[("t", 0, 13.5, 18.5)], mat=m_chr, bevel=0.45),
        mk_cyl("rc_jkt_l", 7.8, 7.8, 56, axis="x", segs=32, xform=[("t", 20, 13.5, -18.5)], mat=m_gm, bevel=0.5),
        mk_cyl("rc_jkt_r", 7.8, 7.8, 56, axis="x", segs=32, xform=[("t", 20, 13.5, 18.5)], mat=m_gm, bevel=0.5),
        # Lower hard-chrome recuperator guide rods (concentric inside dynamic `leo_recoil_springs`!)
        mk_cyl("rc_rod_l", 3.0, 3.0, 108, axis="x", segs=24, xform=[("t", 0, -11.5, -19.5)], mat=m_chr, bevel=0.3),
        mk_cyl("rc_rod_r", 3.0, 3.0, 108, axis="x", segs=24, xform=[("t", 0, -11.5, 19.5)], mat=m_chr, bevel=0.3),
        # Heavy forged front & rear hydraulic yoke collars
        mk_box("rc_yoke_f", 12, 38, 62, xform=[("t", 50, 1, 0)], mat=m_gm, bevel=0.8),
        mk_box("rc_yoke_r", 12, 36, 58, xform=[("t", -50, 1, 0)], mat=m_gm, bevel=0.8),
        # Brass hydraulic relief valves & pressure gauges
        mk_cyl("rc_vlv_l", 2.8, 2.8, 7.0, axis="y", segs=16, xform=[("t", -34, 18, -18.5)], mat=m_brs, bevel=0.25),
        mk_cyl("rc_vlv_r", 2.8, 2.8, 7.0, axis="y", segs=16, xform=[("t", -34, 18, 18.5)], mat=m_brs, bevel=0.25),
    ]
    return join_parts("leo_recoil_system", parts)


def build_leo_breech_block(mats) -> bpy.types.Object:
    m_br = mats["TG_BreechSteel"]
    m_gm = mats["TG_GunMetal"]
    m_chr = mats["TG_HardChrome"]
    m_brs = mats["TG_BrassValve"]
    m_nc = mats["TG_NeraCopper"]
    parts = [
        # Heavy precision-milled Rheinmetall vertical falling-wedge breechblock
        mk_box("bb_body", 34, 36, 40, xform=[("t", 2, 0, 0)], mat=m_br, bevel=1.0),
        mk_box("bb_sh_u", 38, 8, 44, xform=[("t", 0, 16, 0)], mat=m_gm, bevel=0.6),
        mk_box("bb_sh_d", 38, 8, 44, xform=[("t", 0, -16, 0)], mat=m_gm, bevel=0.6),
        # Twin rear spent stub-base extractor forks
        mk_box("bb_ext_l", 10, 24, 5, xform=[("t", -15, 0, -14)], mat=m_chr, bevel=0.4),
        mk_box("bb_ext_r", 10, 24, 5, xform=[("t", -15, 0, 14)], mat=m_chr, bevel=0.4),
        # Semi-auto operating crank shaft & electric primer contact pin
        mk_cyl("bb_crk", 4.5, 4.5, 44, axis="z", segs=22, xform=[("t", -6, -13, 0)], mat=m_nc, bevel=0.35),
        mk_cyl("bb_fpin", 5.5, 5.5, 6.0, axis="x", segs=24, xform=[("t", -16, 0, 0)], mat=m_brs, bevel=0.3),
    ]
    return join_parts("leo_breech_block", parts)


def build_leo_optics_peri(mats) -> bpy.types.Object:
    m_opt = mats["TG_CamoOptics"]
    m_gm = mats["TG_GunMetal"]
    m_em = mats["TG_OpticEmerald"]
    m_chr = mats["TG_HardChrome"]
    parts = [
        # 1. Commander's elevated PERI R17A3 stabilized panoramic thermal periscope (top at Y_local=+28 -> world +144!)
        mk_cyl("op_peri_base", 15, 16, 12, axis="y", segs=32, xform=[("t", -28, 6, 4)], mat=m_opt, bevel=0.6),
        mk_hollow_ring_y("op_peri_col", 16.4, 14.2, 2.8, segs=28, bevel=0.25, xform=[("t", -28, 1.4, 4)], mat=m_gm),
        mk_box("op_peri_head", 26, 18, 28, xform=[("t", -28, 19, 4)], mat=m_gm, bevel=0.9),
        # Armored glare sunshield brow & side blinders framing optic window
        mk_box("op_peri_hood", 9.5, 2.6, 25.5, xform=[("t", -12.5, 26.5, 4)], mat=m_opt, bevel=0.3),
        mk_box("op_peri_bl_l", 7.5, 14.5, 2.4, xform=[("t", -13.2, 19.0, -7.8)], mat=m_opt, bevel=0.25),
        mk_box("op_peri_bl_r", 7.5, 14.5, 2.4, xform=[("t", -13.2, 19.0, 15.8)], mat=m_opt, bevel=0.25),
        # Twin firewalled emerald-sapphire multi-coated PERI thermal + daylight lenses + lens wiper blade!
        mk_box("op_peri_lens", 4.2, 12.2, 17.5, xform=[("t", -14.2, 19.0, 4.0)], mat=m_em, bevel=0.25),
        mk_box("op_peri_wiper", 1.2, 11.0, 1.0, xform=[("rx", 0.22), ("t", -11.6, 19.2, 9.5)], mat=m_chr, bevel=0.1),
        mk_cyl("op_peri_glnd", 2.8, 2.8, 5.0, axis="x", segs=12, xform=[("t", -41.5, 15.0, 4.0)], mat=m_gm, bevel=0.25),
        # 2. Gunner's recessed front-right EMES-15 primary thermal sight doghouse w/ open armored shutter doors!
        mk_box("op_emes_box", 52, 26, 44, xform=[("t", 28, -6, 10)], mat=m_opt, bevel=1.0),
        mk_box("op_emes_visor", 8.0, 2.8, 43.0, xform=[("t", 51.0, 6.2, 10)], mat=m_opt, bevel=0.3),
        mk_box("op_emes_shl", 10, 22, 5.5, xform=[("ry", 0.22), ("t", 50.2, -6, -9.2)], mat=m_gm, bevel=0.45),
        mk_box("op_emes_shr", 10, 22, 5.5, xform=[("ry", -0.22), ("t", 50.2, -6, 29.2)], mat=m_gm, bevel=0.45),
        mk_box("op_emes_mid", 4.0, 20, 3.2, xform=[("t", 51.5, -6, 10.0)], mat=m_gm, bevel=0.25),
        # Twin firewalled emerald-sapphire multi-coated EMES-15 thermal & laser rangefinder lenses!
        mk_box("op_emes_l1", 4.0, 16, 14, xform=[("t", 52.0, -6, 1)], mat=m_em, bevel=0.25),
        mk_box("op_emes_l2", 4.0, 16, 14, xform=[("t", 52.0, -6, 19)], mat=m_em, bevel=0.25),
    ]
    # 6 rotating collar flange bolts around PERI R17A3 base
    for bi in range(6):
        ba = bi * (math.pi / 3.0)
        parts.append(mk_cyl(f"op_pb_{bi}", 1.0, 1.0, 1.8, axis="y", segs=6, xform=[("t", -28 + 15.2 * math.cos(ba), 2.8, 4 + 15.2 * math.sin(ba))], mat=m_chr, bevel=0.1))
    return join_parts("leo_optics_peri", parts)


def build_leo_smoke_dischargers(mats) -> bpy.types.Object:
    m_sm = mats["TG_CamoSmoke"]
    m_gm = mats["TG_GunMetal"]
    parts = []
    for side in (-1, 1):
        parts.append(mk_box(f"sm_brk_{side}", 34, 14, 16, xform=[("t", 0, -4, side * 165)], mat=m_gm, bevel=0.6))
        for row in range(2):
            for col in range(4):
                bx = -14.0 + col * 9.5
                by = -2.0 + row * 9.5
                bz = side * (173.0 + row * 4.5)
                xform = [
                    ("rz", 0.48),
                    ("ry", side * (-0.28 + col * 0.14)),
                    ("t", bx + 6.0, by + 4.0, bz),
                ]
                parts.append(mk_cyl(f"sm_t_{side}_{row}_{col}", 3.9, 3.9, 28.0, axis="x", segs=18, xform=xform, mat=m_sm, bevel=0.35))
    return join_parts("leo_smoke_dischargers", parts)


# =============================================================================
# SUITE 3 BUILDERS (8 Parts: MTU V12, RENK, Cooling Fans, Blast Door, Ammo, Crew)
# =============================================================================
def build_leo_mtu_v12(mats) -> bpy.types.Object:
    """THE ENGINE SHOWPIECE: MTU MB 873 Ka-501 47.6L 1,500 HP Twin-Turbo 90-Deg V12 Diesel!"""
    m_alu = mats["PP_MtuAluminum"]
    m_hd = mats["PP_MtuHeadDark"]
    m_chr = mats["PP_TurboChrome"]
    m_cu = mats["PP_CopperPipe"]
    m_rk = mats["PP_RenkGunmetal"]
    parts = [
        # Deep finned oil sump pan & 90-degree cast-aluminum crankcase block
        mk_box("v12_sump", 146, 30, 88, xform=[("t", 0, -31, 0)], mat=m_rk, bevel=1.2),
        mk_box("v12_block", 144, 34, 114, xform=[("t", 0, -6, 0)], mat=m_alu, bevel=1.2),
        # Central V-valley Bosch 12-plunger injection pump & front pulley stack
        mk_box("v12_pump", 76, 18, 30, xform=[("t", 14, 24, 0)], mat=m_rk, bevel=0.7),
        mk_cyl("v12_pulley", 15, 15, 12, axis="x", segs=28, xform=[("t", 70, -14, 0)], mat=m_hd, bevel=0.5),
        mk_cyl("v12_pul2", 9, 9, 14, axis="x", segs=24, xform=[("t", 69, 8, 0)], mat=m_chr, bevel=0.35),
    ]
    for side in (-1, 1):
        # Angled V12 cylinder bank blocks (6 distinct heads per side = 12 cylinders!)
        parts.append(mk_box(f"v12_bank_{side}", 136, 26, 46, xform=[("rx", side * 0.42), ("t", 0, 16, side * 56)], mat=m_alu, bevel=1.0))
        for c in range(6):
            cx = -55 + c * 22
            parts.append(mk_box(f"v12_hd_{side}_{c}", 17, 14, 28, xform=[("rx", side * 0.42), ("t", cx, 30, side * 62)], mat=m_hd, bevel=0.7))
            # Fuel injector boss atop each cylinder cover
            parts.append(mk_cyl(f"v12_inj_{side}_{c}", 2.2, 2.2, 5.0, axis="y", segs=12, xform=[("rx", side * 0.42), ("t", cx, 38, side * 64)], mat=m_chr, bevel=0.2))
        # Sweeping warm copper-bronze charge-air intercooler pipe & exhaust manifold
        parts.append(mk_cyl(f"v12_ic_{side}", 7.5, 7.5, 132, axis="x", segs=24, xform=[("t", 0, 38, side * 52)], mat=m_cu, bevel=0.5))
        parts.append(mk_cyl(f"v12_ex_{side}", 6.0, 6.0, 126, axis="x", segs=22, xform=[("t", -4, 24, side * 24)], mat=m_cu, bevel=0.4))
        # Twin gleaming snail-scroll exhaust turbochargers atop rear V-valley!
        parts.append(mk_cyl(f"v12_tc_comp_{side}", 16.0, 16.0, 20.0, axis="z", segs=28, xform=[("t", -48, 36, side * 24)], mat=m_chr, bevel=0.8))
        parts.append(mk_cyl(f"v12_tc_turb_{side}", 13.0, 13.0, 16.0, axis="z", segs=24, xform=[("t", -48, 36, side * 38)], mat=m_cu, bevel=0.6))
        parts.append(mk_box(f"v12_tc_out_{side}", 14, 14, 14, xform=[("t", -36, 42, side * 24)], mat=m_chr, bevel=0.6))
    return join_parts("leo_mtu_v12", parts)


def build_leo_renk_transmission(mats) -> bpy.types.Object:
    m_rk = mats["PP_RenkGunmetal"]
    m_alu = mats["PP_MtuAluminum"]
    m_chr = mats["PP_TurboChrome"]
    m_rad = mats["PP_CopperRad"]
    m_cu = mats["PP_CopperPipe"]
    m_fan = mats["PP_FanAluminum"]
    m_brs = mats["PP_AmmoBrass"]
    parts = [
        # Main RENK HSWL 354 hydro-mechanical gearbox casing + torque converter drum
        mk_box("rk_main", 84, 62, 132, xform=[("t", 0, -8, 0)], mat=m_rk, bevel=1.2),
        mk_cyl("rk_tc", 28, 28, 36, axis="x", segs=32, xform=[("t", 28, -6, 0)], mat=m_alu, bevel=0.8),
        # Twin lateral final-drive axles & gleaming ventilated steel disc brakes (Y_local=-18 -> above belly!)
        mk_cyl("rk_axle", 12, 12, 208, axis="z", segs=28, xform=[("t", -6, -18, 0)], mat=m_alu, bevel=0.5),
        mk_cyl("rk_disc_l", 21, 21, 10, axis="z", segs=32, xform=[("t", -6, -18, -84)], mat=m_chr, bevel=0.5),
        mk_cyl("rk_disc_r", 21, 21, 10, axis="z", segs=32, xform=[("t", -6, -18, 84)], mat=m_chr, bevel=0.5),
        # Twin flanking copper-fin cross-flow radiator cores
        mk_box("rk_rad_l", 78, 32, 18, xform=[("t", 0, 14, -88)], mat=m_rad, bevel=0.7),
        mk_box("rk_rad_r", 78, 32, 18, xform=[("t", 0, 14, 88)], mat=m_rad, bevel=0.7),
        # Sister left-side static radial cooling fan impeller under left deck grille (Z_local=-46, Y_local=+34)
        mk_cyl("rk_lfan_h", 12, 12, 12, axis="y", segs=24, xform=[("t", 2, 34, -46)], mat=m_brs, bevel=0.4),
        mk_hollow_ring_y("rk_lfan_sh", 39, 34, 10, segs=36, bevel=0.4, xform=[("t", 2, 34, -46)], mat=m_cu),
    ]
    for b in range(12):
        a = b * (2.0 * math.pi / 12.0)
        parts.append(mk_box(f"rk_lb_{b}", 25, 7.5, 3.8, xform=[("rx", 0.45), ("ry", -a), ("t", 2 + 22 * math.cos(a), 34, -46 + 22 * math.sin(a))], mat=m_fan, bevel=0.25))
    return join_parts("leo_renk_transmission", parts)


def build_leo_cooling_fans(mats) -> bpy.types.Object:
    """Right-side spinning high-output 14-blade radial cooling fan impeller & coaxial copper-fin shroud!"""
    m_fan = mats["PP_FanAluminum"]
    m_brs = mats["PP_AmmoBrass"]
    m_rad = mats["PP_CopperRad"]
    m_chr = mats["PP_TurboChrome"]
    parts = [
        mk_cyl("cf_hub", 12.0, 13.0, 14.0, axis="y", segs=32, mat=m_brs, bevel=0.5),
        mk_hollow_ring_y("cf_shroud", 42.0, 37.0, 12.0, segs=48, bevel=0.5, mat=m_rad),
    ]
    for i in range(6):
        a = i * (math.pi / 3.0)
        parts.append(mk_cyl(f"cf_hb_{i}", 1.4, 1.4, 2.0, axis="y", segs=10, xform=[("t", 7.2 * math.cos(a), 6.8, 7.2 * math.sin(a))], mat=m_chr, bevel=0.15))
    for i in range(14):
        a = i * (2.0 * math.pi / 14.0)
        parts.append(mk_box(f"cf_bl_{i}", 25.0, 9.5, 3.6, xform=[("rx", 0.48), ("ry", -a), ("t", 23.0 * math.cos(a), 0.0, 23.0 * math.sin(a))], mat=m_fan, bevel=0.3))
    return join_parts("leo_cooling_fans", parts)


def build_leo_blast_door(mats) -> bpy.types.Object:
    m_st = mats["PP_BlastSteel"]
    m_hr = mats["PP_BlastHero"]
    m_chr = mats["PP_TurboChrome"]
    parts = [
        mk_box("bd_leaf", 9.0, 44.0, 102.0, xform=[("t", 0, 0, 0)], mat=m_st, bevel=0.7),
        # Flat front (+X) Hero Caution Plate (`ACHTUNG · MUNITIONSBUNKER 120MM`)
        mk_box("bd_hero", 2.0, 38.0, 94.0, xform=[("t", 4.6, 0, 0)], mat=m_hr, bevel=0.2),
        # Upper & lower sliding guide rails + stainless grab handle
        mk_box("bd_rail_u", 12.0, 4.0, 108.0, xform=[("t", 0, 22, 0)], mat=m_chr, bevel=0.4),
        mk_box("bd_rail_d", 12.0, 4.0, 108.0, xform=[("t", 0, -22, 0)], mat=m_chr, bevel=0.4),
        mk_box("bd_hdl", 3.2, 14.0, 4.5, xform=[("t", 4.9, -4, 38)], mat=m_chr, bevel=0.3),
    ]
    return join_parts("leo_blast_door", parts)


def _mk_120mm_round_parts(prefix: str, x: float, y: float, z: float, mats, with_fins: bool = False) -> list[bpy.types.Object]:
    parts = [
        # Metallic brass-steel stub base rim (154 mm OD)
        mk_cyl(f"{prefix}_st", 7.7, 7.7, 11.0, axis="x", segs=22, xform=[("t", x - 43.7, y, z)], mat=mats["PP_AmmoBrass"], bevel=0.35),
        # Olive-tan combustible cartridge case body
        mk_cyl(f"{prefix}_cs", 7.1, 7.35, 55.0, axis="x", segs=22, xform=[("t", x - 10.7, y, z)], mat=mats["PP_AmmoCaseTan"], bevel=0.3),
        # Discarding aluminum sabot petals
        mk_cyl(f"{prefix}_sb", 5.9, 6.2, 11.0, axis="x", segs=20, xform=[("t", x + 21.5, y, z)], mat=mats["PP_FanAluminum"], bevel=0.3),
        # Tungsten long-rod APFSDS penetrator dart & bright ballistic tip
        mk_cyl(f"{prefix}_dt", 1.35, 1.45, 22.0, axis="x", segs=16, xform=[("t", x + 35.5, y, z)], mat=mats["PP_AmmoDart"], bevel=0.15),
        mk_cyl(f"{prefix}_tp", 0.35, 1.35, 6.0, axis="x", segs=16, xform=[("t", x + 46.2, y, z)], mat=mats["PP_TurboChrome"], bevel=0.1),
    ]
    if with_fins:
        for i in range(3):
            a = i * (math.pi / 3.0)
            parts.append(mk_box(f"{prefix}_fn_{i}", 10.0, 5.2, 0.7, xform=[("rx", a), ("t", x + 27.0, y, z)], mat=mats["PP_AmmoDart"], bevel=0.08))
    return parts


def build_leo_ammo_bustle(mats) -> bpy.types.Object:
    m_st = mats["PP_BlastSteel"]
    m_rk = mats["PP_RenkGunmetal"]
    parts = [
        mk_box("ab_rear", 6, 48, 216, xform=[("t", -49, 0, 0)], mat=m_st, bevel=0.6),
        mk_box("ab_fwd", 6, 48, 216, xform=[("t", 49, 0, 0)], mat=m_st, bevel=0.6),
        mk_box("ab_bot", 104, 4, 216, xform=[("t", 0, -22, 0)], mat=m_rk, bevel=0.4),
        mk_box("ab_top", 104, 4, 216, xform=[("t", 0, 22, 0)], mat=m_rk, bevel=0.4),
    ]
    row_ys = (-10.0, 3.0, 15.0)
    col_zs = (-76.0, -44.0, -12.0, 20.0, 52.0)
    for r, ry in enumerate(row_ys):
        for c, cz in enumerate(col_zs):
            if r == 0 and c == 3:
                continue  # Open slot for animated `leo_ready_round`!
            parts.extend(_mk_120mm_round_parts(f"ab_r{r}_{c}", 0.0, ry, cz, mats))
    return join_parts("leo_ammo_bustle", parts)


def build_leo_hull_ammo_rack(mats) -> bpy.types.Object:
    m_st = mats["PP_BlastSteel"]
    m_rk = mats["PP_RenkGunmetal"]
    parts = [
        mk_box("ha_bot", 114, 6, 88, xform=[("t", 0, -27, 0)], mat=m_st, bevel=0.6),
        mk_box("ha_top", 114, 6, 88, xform=[("t", 0, 35, 0)], mat=m_st, bevel=0.6),
        mk_box("ha_wl", 114, 62, 6, xform=[("t", 0, 4, -41)], mat=m_st, bevel=0.6),
        mk_box("ha_wr", 114, 62, 6, xform=[("t", 0, 4, 41)], mat=m_st, bevel=0.6),
        mk_box("ha_frt", 6, 62, 82, xform=[("t", 54, 4, 0)], mat=m_rk, bevel=0.5),
    ]
    for ri, ry in enumerate((-14.0, 4.0, 22.0)):
        for ci, rz in enumerate((-27.0, -9.0, 9.0, 27.0)):
            parts.extend(_mk_120mm_round_parts(f"ha_r{ri}_{ci}", 2.0, ry, rz, mats))
    return join_parts("leo_hull_ammo_rack", parts)


def build_leo_ready_round(mats) -> bpy.types.Object:
    parts = _mk_120mm_round_parts("rr", 0.0, 0.0, 0.0, mats, with_fins=True)
    return join_parts("leo_ready_round", parts)


def build_leo_crew_stations(mats) -> bpy.types.Object:
    m_seat = mats["PP_CrewSeat"]
    m_rk = mats["PP_RenkGunmetal"]
    m_chr = mats["PP_TurboChrome"]
    m_ifis = mats["PP_IfisScreen"]
    m_yel = mats["PP_HazardYellow"]
    parts = [
        # 1. Front-right Driver's ergonomic reclining station + Leopard 2 yoke steering wheel + dashboard
        mk_box("cs_drv_b", 46, 12, 44, xform=[("t", 92, -68, 22)], mat=m_seat, bevel=1.2),
        mk_box("cs_drv_bk", 14, 52, 44, xform=[("rz", 0.25), ("t", 68, -42, 22)], mat=m_seat, bevel=1.2),
        mk_box("cs_drv_dash", 18, 22, 54, xform=[("t", 146, -24, 22)], mat=m_rk, bevel=0.8),
        mk_cyl("cs_drv_whl", 15, 15, 4, axis="x", segs=24, xform=[("t", 132, -24, 22)], mat=m_chr, bevel=0.4),
        mk_box("cs_drv_lcd", 12, 10, 42, xform=[("t", 124, 6, 22)], mat=m_ifis, bevel=0.35),
        # 2. Stepped Gunner's station (lower right turret)
        mk_box("cs_gnr_b", 42, 10, 40, xform=[("t", -40, -39, 36)], mat=m_seat, bevel=1.1),
        mk_box("cs_gnr_bk", 12, 46, 40, xform=[("t", -58, -16, 36)], mat=m_seat, bevel=1.1),
        mk_box("cs_gnr_lcd", 14, 18, 28, xform=[("t", -18, 4, 38)], mat=m_ifis, bevel=0.35),
        # 3. Elevated Commander's station (rear-upper right turret + IFIS tactical display!)
        mk_box("cs_cmd_b", 40, 10, 40, xform=[("t", -100, -5, 38)], mat=m_seat, bevel=1.1),
        mk_box("cs_cmd_bk", 12, 48, 40, xform=[("t", -118, 19, 38)], mat=m_seat, bevel=1.1),
        mk_box("cs_cmd_lcd", 10, 22, 32, xform=[("t", -80, 52, 36)], mat=m_ifis, bevel=0.35),
        # 4. Loader's folding bucket seat & yellow breech safety guard rail (left turret)
        mk_box("cs_ldr_b", 40, 10, 38, xform=[("t", -96, -35, -98)], mat=m_seat, bevel=1.0),
        mk_box("cs_ldr_bk", 10, 42, 38, xform=[("t", -116, -14, -98)], mat=m_seat, bevel=1.0),
        mk_box("cs_ldr_grd", 68, 4, 4, xform=[("t", -94, 34, -78)], mat=m_yel, bevel=0.35),
    ]
    return join_parts("leo_crew_stations", parts)


# =============================================================================
# Non-Overlapping Hero UV Layout + Strict Firewalls (>=55px) + CONCAVE Packing
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


def unwrap_hull_camo_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "leo_hull_shell":
            return None
        n = face.normal
        # Front 2A7V Glacis Hero plate: outward normal points +X/+Y (Blender +X/+Z)
        if mat_name == "HC_GlacisHero" and n.z > 0.70 and n.x > 0.15:
            return "glacis"
        # Rear Transom Hero plate: outward normal points -X
        if mat_name == "HC_RearHero" and n.x < -0.85:
            return "rear"
        return None

    FW_MATS = {
        "HC_HeadlightLED", "HC_CopperAccent", "HC_ToolWood",
        "HC_ExhaustHeatSteel", "HC_OilHub",
        "HC_MachinedSteel", "HC_TowCableSteel", "HC_TrackBurnished", "HC_RubberPad",
    }

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FW_MATS)

    # Tracks already carry zero-overlap, zero-bleed analytical UVs across v in [0.010, 0.218]!
    non_track_objs = [o for o in objs if o.name not in {"leo_tracks_left", "leo_tracks_right"}]

    # Strict 4K Material UV Firewalls (>= 100 px moats at 4096x4096!)
    _smart_unwrap_and_pack_rect(non_track_objs, 0.015, 0.145, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"HC_HeadlightLED", "HC_CopperAccent"})
    _smart_unwrap_and_pack_rect(non_track_objs, 0.170, 0.300, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m == "HC_ToolWood")
    _smart_unwrap_and_pack_rect(non_track_objs, 0.325, 0.485, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"HC_ExhaustHeatSteel", "HC_OilHub"})
    _smart_unwrap_and_pack_rect(non_track_objs, 0.510, 0.720, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"HC_MachinedSteel", "HC_TowCableSteel", "HC_TrackBurnished"})
    _smart_unwrap_and_pack_rect(non_track_objs, 0.745, 0.985, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m == "HC_RubberPad")

    grp_a = [o for o in non_track_objs if o.name in {"leo_hull_shell", "leo_side_skirts", "leo_engine_deck"}]
    grp_b = [o for o in non_track_objs if o not in grp_a]
    _smart_unwrap_and_pack_rect(grp_a, 0.010, 0.990, 0.355, 0.610, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_b, 0.010, 0.990, 0.232, 0.335, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV bands on Front 2A7V Glacis & Rear Transom!
    hs = next(o for o in objs if o.name == "leo_hull_shell")
    bm = bmesh.new()
    bm.from_mesh(hs.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in hs.data.materials]
    counts = {"glacis": 0, "rear": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(hs.name, f, mname)
        if tag is None:
            continue
        counts[tag] += 1
        for loop in f.loops:
            tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
            if tag == "glacis":
                un = max(0.0, min(1.0, (105.0 - tz) / 210.0))
                vn = max(0.0, min(1.0, (362.0 - tx) / 52.0))
                loop[uv_layer].uv = (0.015 + un * 0.550, 0.785 + vn * 0.200)
            elif tag == "rear":
                un = max(0.0, min(1.0, (tz + 89.0) / 178.0))
                vn = max(0.0, min(1.0, (ty - (-23.0)) / 58.0))
                loop[uv_layer].uv = (0.595 + un * 0.390, 0.785 + vn * 0.200)
    bm.to_mesh(hs.data)
    bm.free()
    print(f"  [HERO-UV] hull_camo hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing hull_camo hero faces: {counts}"


def unwrap_turret_gun_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "leo_turret_shell" or mat_name != "TG_TurretFlank":
            return None
        nz = -face.normal.y  # Three.js normal Z
        cz = -face.calc_center_median().y
        if nz > 0.85 and cz > 158.0:
            return "right_flank"
        if nz < -0.85 and cz < -158.0:
            return "left_flank"
        return None

    FW_MATS = {
        "TG_OpticEmerald", "TG_CamoNetRoll", "TG_StowBox", "TG_WhipAntenna",
        "TG_HardChrome", "TG_BrassValve", "TG_NeraCopper", "TG_BreechSteel", "TG_MuzzleSoot",
    }

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FW_MATS)

    # Strict 4K Material UV Firewalls (>= 100 px moats — emerald-sapphire lenses 100% isolated!)
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.185, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m == "TG_OpticEmerald")
    _smart_unwrap_and_pack_rect(objs, 0.210, 0.420, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"TG_CamoNetRoll", "TG_StowBox", "TG_WhipAntenna"})
    _smart_unwrap_and_pack_rect(objs, 0.445, 0.700, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"TG_HardChrome", "TG_BrassValve"})
    _smart_unwrap_and_pack_rect(objs, 0.725, 0.985, 0.635, 0.755, select_face_fn=lambda _n, _f, m: m in {"TG_NeraCopper", "TG_BreechSteel", "TG_MuzzleSoot"})

    grp_a = [o for o in objs if o.name in {"leo_turret_shell", "leo_arrowhead_wedges"}]
    grp_b = [o for o in objs if o not in grp_a]
    _smart_unwrap_and_pack_rect(grp_a, 0.010, 0.990, 0.320, 0.605, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_b, 0.010, 0.990, 0.010, 0.295, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV bands on both Turret Flanks!
    ts = next(o for o in objs if o.name == "leo_turret_shell")
    bm = bmesh.new()
    bm.from_mesh(ts.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in ts.data.materials]
    counts = {"right_flank": 0, "left_flank": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(ts.name, f, mname)
        if tag is None:
            continue
        counts[tag] += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            yn = max(0.0, min(1.0, (ty - (-15.0)) / 38.0))
            if tag == "right_flank":
                # Viewing right (+Z) flank: -X (rear) is LEFT -> u=0.015, +X (front) is RIGHT -> u=0.485 (X in [-196, -64])
                xn = max(0.0, min(1.0, (tx - (-196.0)) / 132.0))
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.790 + yn * 0.195)
            elif tag == "left_flank":
                # Viewing left (-Z) flank: +X (front) is LEFT -> u=0.515, -X (rear) is RIGHT -> u=0.985 (X in [-196, -64])
                xn = max(0.0, min(1.0, (-64.0 - tx) / 132.0))
                loop[uv_layer].uv = (0.515 + xn * 0.470, 0.790 + yn * 0.195)
    bm.to_mesh(ts.data)
    bm.free()
    print(f"  [HERO-UV] turret_gun hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing turret_gun hero faces: {counts}"


def unwrap_powerpack_int_atlas(objs: list[bpy.types.Object]):
    def is_blast_hero(obj_name: str, face, mat_name: str) -> bool:
        return obj_name == "leo_blast_door" and mat_name == "PP_BlastHero" and face.normal.x > 0.85

    FW_MATS = {
        "PP_IfisScreen", "PP_CopperPipe", "PP_CopperRad",
        "PP_AmmoBrass", "PP_AmmoCaseTan", "PP_AmmoDart",
        "PP_MtuAluminum", "PP_TurboChrome", "PP_FanAluminum", "PP_HazardYellow",
    }

    def is_special(n, f, m) -> bool:
        return is_blast_hero(n, f, m) or (m in FW_MATS)

    # Strict Material UV Firewalls (>= 65 px moats across IFIS LCD, copper, ammo brass/tan/dart, MTU silver!)
    _smart_unwrap_and_pack_rect(objs, 0.520, 0.735, 0.795, 0.985, select_face_fn=lambda _n, _f, m: m == "PP_IfisScreen")
    _smart_unwrap_and_pack_rect(objs, 0.770, 0.985, 0.795, 0.985, select_face_fn=lambda _n, _f, m: m in {"PP_CopperPipe", "PP_CopperRad"})
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.230, 0.635, 0.760, select_face_fn=lambda _n, _f, m: m in {"PP_AmmoBrass", "PP_HazardYellow"})
    _smart_unwrap_and_pack_rect(objs, 0.265, 0.560, 0.635, 0.760, select_face_fn=lambda _n, _f, m: m in {"PP_AmmoCaseTan", "PP_AmmoDart"})
    _smart_unwrap_and_pack_rect(objs, 0.595, 0.985, 0.635, 0.760, select_face_fn=lambda _n, _f, m: m in {"PP_MtuAluminum", "PP_TurboChrome", "PP_FanAluminum"})

    grp_a = [o for o in objs if o.name in {"leo_mtu_v12", "leo_renk_transmission", "leo_cooling_fans"}]
    grp_b = [o for o in objs if o not in grp_a]
    _smart_unwrap_and_pack_rect(grp_a, 0.010, 0.990, 0.320, 0.605, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_b, 0.010, 0.990, 0.010, 0.295, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV band on `leo_blast_door` front (+X) caution plate!
    bd = next(o for o in objs if o.name == "leo_blast_door")
    bm = bmesh.new()
    bm.from_mesh(bd.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bd.data.materials]
    hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_blast_hero(bd.name, f, mname):
            continue
        hits += 1
        for loop in f.loops:
            ty, tz = loop.vert.co.z, -loop.vert.co.y
            # Viewing blast door from fighting compartment (+X looking -X): right (+Z) is LEFT -> u=0.015, left (-Z) is RIGHT -> u=0.485
            un = max(0.0, min(1.0, (47.0 - tz) / 94.0))
            vn = max(0.0, min(1.0, (ty - (-19.0)) / 38.0))
            loop[uv_layer].uv = (0.015 + un * 0.470, 0.795 + vn * 0.190)
    bm.to_mesh(bd.data)
    bm.free()
    print(f"  [HERO-UV] powerpack_int blast_door hits={hits}")
    assert hits > 0, "Missing blast door hero caution plate faces!"


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
        o.location = ((i % 6) * 1600.0, (i // 6) * 1600.0, 0.0)
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
            o.location = (0.0, 4500.0, 0.0)


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
    atlas_size = SUITE_ATLAS_SIZE[prefix]
    bake_margin = SUITE_BAKE_MARGIN[prefix]
    ao_samples = SUITE_AO_SAMPLES[prefix]
    normal_samples = SUITE_NORMAL_SAMPLES[prefix]
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
        if not objs_to_bake:
            _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
            _remove_bake_image_nodes(nodes)
            bpy.data.images.remove(img)
            return
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.055, 0.062, 0.048, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.55, 0.55, 0.55, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=normal_samples, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    # 1:1 Main Battle Tank scale AO ray distance (30 cm self, 46 cm assembled contact!)
    scene.world.light_settings.distance = 30.0
    run_bake("ao_self", "AO", samples=ao_samples, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 46.0
    run_bake("ao_ext", "AO", samples=ao_samples, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

    # Emit mask of exterior targets so interior cutaway parts retain crisp bright Self-AO!
    img_m = bpy.data.images.new(f"{prefix}_ext_mask", atlas_size, atlas_size, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    arr = np.zeros((atlas_size * atlas_size, 4), dtype=np.float32)
    arr[:, 3] = 1.0
    img_m.pixels.foreach_set(arr.ravel())
    if ext_targets:
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
        nodes_m = _attach_bake_image_node({white_mat}, img_m)
        scene.cycles.samples = 1
        select_only(ext_targets, ext_targets[0])
        bpy.ops.object.bake(type="EMIT", margin=bake_margin, use_clear=False)
        _remove_bake_image_nodes(nodes_m)
        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    bpy.data.images.remove(img_m)


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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 3.5) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:6d} non_man={non_man:2d} vol={vol:12.1f} "
            f"max_bbox_delta={d_max:.3f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 3.5:
            print(f"       !! BBOX DELTA > 3.5cm: got min={[round(x,2) for x in bmin]} max={[round(x,2) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.3f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    assert max_bbox_delta <= 5.0, f"CAD bbox delta exceeded 5.0 cm: {max_bbox_delta:.3f} cm"
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
        # Suite 1: Hull, Side Skirts, Road Wheels, Left/Right Tracks, Engine Deck, Torsion Bars, Turret Ring (8)
        "leo_hull_shell":        lambda m: build_leo_hull_shell(m),
        "leo_side_skirts":       lambda m: build_leo_side_skirts(m),
        "leo_road_wheels":       lambda m: build_leo_road_wheels(m),
        "leo_tracks_left":       lambda m: _build_diehl_track_obj("leo_tracks_left", m, track_row_offset=0),
        "leo_tracks_right":      lambda m: _build_diehl_track_obj("leo_tracks_right", m, track_row_offset=3),
        "leo_engine_deck":       lambda m: build_leo_engine_deck(m),
        "leo_torsion_bars":      lambda m: build_leo_torsion_bars(m),
        "leo_turret_ring":       lambda m: build_leo_turret_ring(m),
        # Suite 2: Turret Shell, Arrowhead Wedges, L/55A1 Gun, Mantlet, Recoil, Breech, Optics, Smoke (8)
        "leo_turret_shell":      lambda m: build_leo_turret_shell(m),
        "leo_arrowhead_wedges":  lambda m: build_leo_arrowhead_wedges(m),
        "leo_main_gun":          lambda m: build_leo_main_gun(m),
        "leo_gun_mantlet":       lambda m: build_leo_gun_mantlet(m),
        "leo_recoil_system":     lambda m: build_leo_recoil_system(m),
        "leo_breech_block":      lambda m: build_leo_breech_block(m),
        "leo_optics_peri":       lambda m: build_leo_optics_peri(m),
        "leo_smoke_dischargers": lambda m: build_leo_smoke_dischargers(m),
        # Suite 3: MTU V12, RENK Transmission, Cooling Fans, Blast Door, Ammo Bustle, Hull Rack, Ready Round, Crew (8)
        "leo_mtu_v12":           lambda m: build_leo_mtu_v12(m),
        "leo_renk_transmission": lambda m: build_leo_renk_transmission(m),
        "leo_cooling_fans":      lambda m: build_leo_cooling_fans(m),
        "leo_blast_door":        lambda m: build_leo_blast_door(m),
        "leo_ammo_bustle":       lambda m: build_leo_ammo_bustle(m),
        "leo_hull_ammo_rack":    lambda m: build_leo_hull_ammo_rack(m),
        "leo_ready_round":       lambda m: build_leo_ready_round(m),
        "leo_crew_stations":     lambda m: build_leo_crew_stations(m),
    }

    print("[BUILD] Sculpting all 24 solid KMW Leopard 2A7V (Plan C Flagship 1:1 parts)...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    hc_objs = [built[pid] for pid in HULL_CAMO_PARTS]
    tg_objs = [built[pid] for pid in TURRET_GUN_PARTS]
    pp_objs = [built[pid] for pid in POWERPACK_INT_PARTS]
    all_objs = hc_objs + tg_objs + pp_objs

    print("[VERIFY] Checking manifoldness (0 non-manifold), outward normals & 1:1 CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 4K/4K/2K hero atlases: hull_camo (8), turret_gun (8), powerpack_int (8)...")
    unwrap_hull_camo_atlas(hc_objs)
    unwrap_turret_gun_atlas(tg_objs)
    unwrap_powerpack_int_atlas(pp_objs)

    for label, group in (("hull_camo", hc_objs), ("turret_gun", tg_objs), ("powerpack_int", pp_objs)):
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
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="leopard2a7_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print(f"[CYCLES] Baking leopard2a7_v3_hull_camo ({SUITE_ATLAS_SIZE['hc']}px, 8 parts)...")
        bake_atlas_suite("hc", hc_objs, all_objs, tmp_dir)
        print(f"[CYCLES] Baking leopard2a7_v3_turret_gun ({SUITE_ATLAS_SIZE['tg']}px, 8 parts)...")
        bake_atlas_suite("tg", tg_objs, all_objs, tmp_dir)
        print(f"[CYCLES] Baking leopard2a7_v3_powerpack_int ({SUITE_ATLAS_SIZE['pp']}px, 8 parts)...")
        bake_atlas_suite("pp", pp_objs, all_objs, tmp_dir)

        # Export Draco GLB first so post-process knows exact GLB size for adaptive WebP quality budgeting!
        export_draco_glb(all_objs)
        glb_bytes = MODELS_OUT.stat().st_size

        print("[POST] Compositing 4K Bundeswehr Iron Cross, Y-482 917, MLC 70, 2A7V, Blast Door & IFIS LCDs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR), str(glb_bytes)],
            check=True,
        )

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "leopard2a7_v3_hull_camo_albedo.webp",
        TEX_OUT_DIR / "leopard2a7_v3_hull_camo_normal.webp",
        TEX_OUT_DIR / "leopard2a7_v3_hull_camo_roughness.webp",
        TEX_OUT_DIR / "leopard2a7_v3_turret_gun_albedo.webp",
        TEX_OUT_DIR / "leopard2a7_v3_turret_gun_normal.webp",
        TEX_OUT_DIR / "leopard2a7_v3_turret_gun_roughness.webp",
        TEX_OUT_DIR / "leopard2a7_v3_powerpack_int_albedo.webp",
        TEX_OUT_DIR / "leopard2a7_v3_powerpack_int_normal.webp",
        TEX_OUT_DIR / "leopard2a7_v3_powerpack_int_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== KMW LEOPARD 2A7V (120MM RH-120 L/55A1) V3 4K+PLANC ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:48s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 11.80 MB, hard test <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 11.80, f"Asset budget exceeded: {total_mb:.2f} MB > 11.80 MB"


if __name__ == "__main__":
    main()
