#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Mauser Karabiner 98k (7.92x57mm Mauser)
=======================================================================================
MIT License — Digital Armory 3D (BAY-32)

Generates:
  - public/models/k98k.glb (Draco-compressed glTF 2.0, all 21 watertight solid parts; skips ONLY
    the 3 dynamically GPU-compressed `aSpringParam` springs: `k98k_firing_pin_spring`,
    `k98k_sear_spring`, `k98k_mag_spring`)
  - public/textures/k98k_v3_stock_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)
  - public/textures/k98k_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/k98k_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)

Coordinate & Transform Contract (`glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos, then all 21
    objects are reset to identity transform (0,0,0) before Draco glTF export.
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
# MODE 2: System Python Post-Process (Mauser Oberndorf byf 43 Rollmarks,
#         Mod. 98, Serial 6842 b, WaA135 Proof, 1-20 Tangent Sight Leaf,
#         RNM Normal Blend & 5-Channel Packed ORM WebP Export)
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    from scipy import ndimage

    FONT_SERIF_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_DIN, FONT_SERIF_BOLD, *FONT_FALLBACKS):
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

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float) -> None:
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

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _save_webp_rgb(arr01: np.ndarray, path: Path, quality: int) -> None:
        img = Image.fromarray(np.clip(arr01 * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB")
        img.save(path, "WEBP", quality=quality, method=6)

    def _draw_waa135_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, s: float) -> None:
        """Stylized geometric ordnance inspection proof stamp (wing chevron + WaA135 code)."""
        w = max(3, int(s * 0.11))
        # Stylized geometric straight-wing proof crest above text (neutral ordnance crest)
        draw.line([(cx - s * 1.15, cy - s * 0.42), (cx + s * 1.15, cy - s * 0.42)], fill=245, width=w)
        draw.line([(cx - s * 0.92, cy - s * 0.24), (cx + s * 0.92, cy - s * 0.24)], fill=235, width=max(2, w - 1))
        draw.line([(cx - s * 0.62, cy - s * 0.08), (cx + s * 0.62, cy - s * 0.08)], fill=225, width=max(2, w - 1))
        draw.rectangle((cx - s * 0.14, cy - s * 0.62, cx + s * 0.14, cy - s * 0.02), fill=245)
        draw.text((cx, cy + s * 0.34), "WaA135", fill=255, font=_load_font(FONT_DIN, int(s * 0.56)), anchor="mm")

    # =========================================================================
    # SUITE 1: k98k_v3_stock (Laminated Beechwood Stock & Upper Handguard)
    # =========================================================================
    def process_stock_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "stock_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "stock_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "stock_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "stock_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "stock_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "stock_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "stock_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Subtle ordnance stock cartouche ("H" Army stamp + WaA135 + 6842) centered cleanly on right buttstock flat
        CW, CH = 3200, 960
        stamp_r = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(stamp_r)
        dr.text((CW * 0.19, CH * 0.42), "H", fill=225, font=_load_font(FONT_SERIF_BOLD, 92), anchor="mm")
        _draw_waa135_proof(dr, CW * 0.25, CH * 0.40, 44.0)
        dr.text((CW * 0.22, CH * 0.54), "6842", fill=215, font=_load_font(FONT_DIN, 46), anchor="mm")

        stamp_map = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(stamp_map, stamp_r, 0.015, 0.985, 0.365, 0.665)
        stamp_d = ndimage.gaussian_filter(stamp_map, sigma=0.7) * 0.58

        albedo *= 1.0 - 0.28 * stamp_d[..., None]
        _mix(rgh, 0.68, stamp_d * 0.6)
        ao *= 1.0 - 0.28 * stamp_d
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.48 * stamp_d, strength=4.0))

        rgh = np.clip(rgh, 0.22, 0.88)
        met = np.clip(met, 0.00, 0.95)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "k98k_v3_stock_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "k98k_v3_stock_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "k98k_v3_stock_roughness.webp", 93)
        print("[POST] Saved k98k_v3_stock_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: k98k_v3_receiver (Receiver, Trigger Guard, Floorplate, Buttplate, Bands)
    # =========================================================================
    def process_receiver_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "recv_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "recv_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "recv_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "recv_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "recv_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "recv_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "recv_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        engr_w = np.zeros((h, w), dtype=np.float32)

        # 1. Left Receiver Wall Hero Band (u in [0.015, 0.985], v in [0.765, 0.985])
        #    Maps local X in [-6.80, +9.10] (span 15.90 cm), Y in [-1.25, +1.85] (span 3.10 cm)
        #    Left flank reads muzzle (+X, u=0.015) -> buttstock (-X, u=0.985) left-to-right!
        LW, LH = 3180, 620

        def lx_to_cx(tx: float) -> int:
            xn = (tx - (-6.80)) / 15.90
            return int(round((1.0 - xn) * LW))

        def ly_to_cy(ty: float) -> int:
            yn = (ty - (-1.25)) / 3.10
            return int(round((1.0 - yn) * LH))

        l_img = Image.new("L", (LW, LH), 0)
        dl = ImageDraw.Draw(l_img)
        # Front ring left side: serial "6842 b" + stylized WaA135 proof
        dl.text((lx_to_cx(7.55), ly_to_cy(0.55)), "6842", fill=255, font=_load_font(FONT_DIN, 92), anchor="mm")
        dl.text((lx_to_cx(7.55), ly_to_cy(-0.08)), "b", fill=245, font=_load_font(FONT_SERIF_BOLD, 74), anchor="mm")
        _draw_waa135_proof(dl, lx_to_cx(5.75), ly_to_cy(0.30), 62.0)
        # Iconic Mauser left rail engraving: "Mod. 98" along mid-receiver left wall below thumb cutout
        dl.text((lx_to_cx(1.40), ly_to_cy(-0.18)), "Mod. 98", fill=255, font=_load_font(FONT_SERIF_BOLD, 128), anchor="mm")
        _paste_uv_band(engr_w, l_img, 0.015, 0.985, 0.765, 0.985)

        # 2. Top Front Receiver Ring Crest Hero Band (u in [0.015, 0.485], v in [0.530, 0.740])
        #    Physical ring arc width (~2.70 cm) x length (~3.70 cm) -> aspect 0.73 -> crisp 1:1 proportions!
        TW, TH = 900, 1230
        t_img = Image.new("L", (TW, TH), 0)
        dt = ImageDraw.Draw(t_img)
        dt.text((TW * 0.50, TH * 0.38), "byf", fill=255, font=_load_font(FONT_SERIF_BOLD, 210), anchor="mm")
        dt.text((TW * 0.50, TH * 0.64), "43", fill=255, font=_load_font(FONT_DIN, 200), anchor="mm")
        _paste_uv_band(engr_w, t_img, 0.015, 0.485, 0.530, 0.740)

        # 3. Right Front Receiver Ring Flank Hero Band (u in [0.515, 0.985], v in [0.530, 0.740])
        #    Maps front-right ring (+Z flank) X in [+5.20, +9.10], Y in [-1.00, +1.80]
        RW, RH = 1200, 820
        r_img = Image.new("L", (RW, RH), 0)
        dr = ImageDraw.Draw(r_img)
        _draw_waa135_proof(dr, RW * 0.28, RH * 0.46, 86.0)
        _draw_waa135_proof(dr, RW * 0.56, RH * 0.46, 86.0)
        dr.text((RW * 0.76, RH * 0.54), "6842 b", fill=245, font=_load_font(FONT_DIN, 86), anchor="mm")
        _paste_uv_band(engr_w, r_img, 0.515, 0.985, 0.530, 0.740)

        silver_w = ndimage.gaussian_filter(engr_w, sigma=0.55) * 0.62
        _mix(albedo, (0.72, 0.76, 0.82), silver_w * 0.46)
        _mix(rgh, 0.24, silver_w * 0.45)
        ao *= 1.0 - 0.36 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.58 * engr_w, strength=4.8))
        rgh = np.clip(rgh, 0.16, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "k98k_v3_receiver_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "k98k_v3_receiver_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "k98k_v3_receiver_roughness.webp", 93)
        print("[POST] Saved k98k_v3_receiver_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: k98k_v3_metal (Barrel, Sights, Rod, Bolt Action, FCG, Follower, Brass Clip)
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
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Tangent Rear Sight Leaf Graduations ("1 2 3 ... 20") Hero Band:
        # u in [0.015, 0.255], v in [0.740, 0.985] (500px tall for razor-sharp 1-20 numerals; physical 1.48 x 6.20 cm)
        SW, SH = 520, 2180
        s_img = Image.new("L", (SW, SH), 0)
        ds = ImageDraw.Draw(s_img)
        font_num = _load_font(FONT_DIN, 92)
        for g in range(1, 21):
            frac = (g - 1) / 19.0
            cy = int(round((0.93 - frac * 0.86) * SH))
            tick_len = 86 if (g % 2 == 0 or g == 1) else 56
            ds.line([(28, cy), (28 + tick_len, cy)], fill=250, width=10)
            ds.line([(SW - 28 - tick_len, cy), (SW - 28, cy)], fill=250, width=10)
            if g in (1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20):
                cx_num = int(SW * 0.34) if (g % 2 == 1 or g == 2) else int(SW * 0.66)
                ds.text((cx_num, cy), str(g), fill=255, font=font_num, anchor="mm")

        # Barrel chamber reinforce top proof stamp ("7.92" + "WaA135" + "6842 b") Hero Band: u in [0.300, 0.985], v in [0.815, 0.985]
        BW, BH = 2200, 440
        b_img = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_img)
        db.text((BW * 0.28, BH * 0.50), "7.92", fill=250, font=_load_font(FONT_DIN, 96), anchor="mm")
        _draw_waa135_proof(db, BW * 0.50, BH * 0.48, 54.0)
        db.text((BW * 0.74, BH * 0.50), "6842 b", fill=245, font=_load_font(FONT_DIN, 92), anchor="mm")

        engr_m = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(engr_m, s_img, 0.015, 0.255, 0.740, 0.985)
        _paste_uv_band(engr_m, b_img, 0.300, 0.985, 0.815, 0.985)

        silver_m = ndimage.gaussian_filter(engr_m, sigma=0.5) * 0.72
        _mix(albedo, (0.84, 0.86, 0.90), silver_m * 0.58)
        _mix(rgh, 0.20, silver_m * 0.50)
        ao *= 1.0 - 0.34 * engr_m

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.56 * engr_m, strength=4.8))
        rgh = np.clip(rgh, 0.14, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "k98k_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "k98k_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "k98k_v3_metal_roughness.webp", 93)
        print("[POST] Saved k98k_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    process_stock_atlas()
    process_receiver_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "k98k.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 32
BAKE_NORMAL_SAMPLES = 16

T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


STOCK_PARTS = [
    "k98k_stock",
    "k98k_handguard",
]

RECEIVER_PARTS = [
    "k98k_receiver",
    "k98k_trigger_guard",
    "k98k_mag_floorplate",
    "k98k_buttplate",
    "k98k_front_band",
    "k98k_rear_band",
]

METAL_PARTS = [
    "k98k_barrel",
    "k98k_front_sight",
    "k98k_rear_sight",
    "k98k_cleaning_rod",
    "k98k_bolt_body",
    "k98k_claw_extractor",
    "k98k_bolt_shroud",
    "k98k_flag_safety",
    "k98k_firing_pin",
    "k98k_trigger",
    "k98k_sear",
    "k98k_mag_follower",
    "k98k_stripper_clip",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "k98k_stock",
    "k98k_handguard",
    "k98k_receiver",
    "k98k_trigger_guard",
    "k98k_mag_floorplate",
    "k98k_buttplate",
    "k98k_front_band",
    "k98k_rear_band",
    "k98k_barrel",
    "k98k_front_sight",
    "k98k_rear_sight",
    "k98k_cleaning_rod",
    "k98k_bolt_body",
    "k98k_claw_extractor",
    "k98k_bolt_shroud",
    "k98k_flag_safety",
    "k98k_trigger",
    "k98k_stripper_clip",
}

ASSEMBLED_POS = {
    "k98k_barrel":         ( 36.20,  1.50,  0.00),
    "k98k_front_sight":    ( 63.80,  2.75,  0.00),
    "k98k_bolt_body":      ( -0.20,  1.50,  0.00),
    "k98k_claw_extractor": ( -0.20,  1.50,  0.00),
    "k98k_bolt_shroud":    ( -8.30,  1.50,  0.00),
    "k98k_flag_safety":    ( -9.00,  2.35,  0.00),
    "k98k_firing_pin":     ( -1.50,  1.50,  0.00),
    "k98k_receiver":       ( -0.50,  1.10,  0.00),
    "k98k_rear_sight":     ( 16.80,  2.75,  0.00),
    "k98k_stock":          (  4.00, -2.10,  0.00),
    "k98k_handguard":      ( 31.50,  2.25,  0.00),
    "k98k_front_band":     ( 51.60,  0.85,  0.00),
    "k98k_rear_band":      ( 33.00,  0.90,  0.00),
    "k98k_cleaning_rod":   ( 45.00, -0.35,  0.00),
    "k98k_buttplate":      (-43.80, -5.65,  0.00),
    "k98k_trigger":        ( -8.20, -1.95,  0.00),
    "k98k_sear":           ( -7.90, -0.35,  0.00),
    "k98k_trigger_guard":  ( -1.80, -3.20,  0.00),
    "k98k_mag_follower":   (  1.10, -3.10,  0.00),
    "k98k_mag_floorplate": (  1.10, -4.45,  0.00),
    "k98k_stripper_clip":  ( -4.10,  5.50,  0.00),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "k98k_firing_pin_spring",
    "k98k_sear_spring",
    "k98k_mag_spring",
]


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
    world.light_settings.distance = 1.0

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
    bevel_r: float = 0.026,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.76, 0.79, 0.84),
    grain_scale: float = 42.0,
    grain_bump: float = 0.024,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    rough_var: float = 0.032,
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
    n_macro.inputs["Scale"].default_value = 0.45
    n_macro.inputs["Detail"].default_value = 4.5
    n_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.62
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    base_col_a = srgb_to_lin(*base_srgb)
    base_col_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.13),
        min(1.0, base_srgb[1] * 1.14),
        min(1.0, base_srgb[2] * 1.15),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_col_a
    mix_base.inputs[7].default_value = base_col_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.12, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.92, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.525
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.595
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
        mix_er.inputs[3].default_value = max(0.16, roughness - 0.12)
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        if metallic > 0.35:
            mix_em = nt.nodes.new("ShaderNodeMix")
            mix_em.data_type = "FLOAT"
            mix_em.inputs[3].default_value = 0.96
            nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
            nt.links.new(met_sock, mix_em.inputs[2])
            met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.015
        nt.links.new(n_micro.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_laminated_beech_mat(name: str = "W_LaminatedBeech") -> bpy.types.Material:
    """
    Authentic WWII German K98k Schichtholz (phenolic-resin laminated beechwood):
    distinct alternating horizontal dark/light beech laminate plies (stacked along Blender Z = world Y)
    so sculpted buttstock, comb, and forend contours reveal unmistakable topographic laminate lines!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # Slight 2.2° longitudinal tilt so laminate layers cross the buttstock and wrist authentically
    rot_lam = nt.nodes.new("ShaderNodeMapping")
    rot_lam.inputs["Rotation"].default_value = (0.0, math.radians(-2.2), 0.0)
    nt.links.new(tc.outputs["Object"], rot_lam.inputs["Vector"])

    # Primary laminate ply stack (horizontal bands along Blender Z = Three.js Y, ~2.2mm thick plies!)
    map_ply = nt.nodes.new("ShaderNodeMapping")
    map_ply.inputs["Scale"].default_value = (0.04, 0.06, 1.42)
    nt.links.new(rot_lam.outputs["Vector"], map_ply.inputs["Vector"])

    wave_ply = nt.nodes.new("ShaderNodeTexWave")
    wave_ply.wave_type = "BANDS"
    wave_ply.bands_direction = "Z"
    wave_ply.wave_profile = "SAW"
    wave_ply.inputs["Scale"].default_value = 1.65
    wave_ply.inputs["Distortion"].default_value = 1.35
    wave_ply.inputs["Detail"].default_value = 2.5
    wave_ply.inputs["Detail Scale"].default_value = 1.2
    nt.links.new(map_ply.outputs["Vector"], wave_ply.inputs["Vector"])

    # Secondary harmonic ply contrast (alternating light/mid beech plies + sharp dark phenolic glue line)
    ramp_ply = nt.nodes.new("ShaderNodeValToRGB")
    ramp_ply.color_ramp.interpolation = "LINEAR"
    el0 = ramp_ply.color_ramp.elements[0]
    el0.position = 0.04
    el0.color = srgb_to_lin(0.185, 0.088, 0.042)  # Dark phenolic resin glue line
    el1 = ramp_ply.color_ramp.elements[1]
    el1.position = 0.16
    el1.color = srgb_to_lin(0.320, 0.175, 0.088)  # Darker roasted beech veneer
    el2 = ramp_ply.color_ramp.elements.new(0.46)
    el2.color = srgb_to_lin(0.515, 0.315, 0.165)  # Warm honey-amber beech ply
    el3 = ramp_ply.color_ramp.elements.new(0.76)
    el3.color = srgb_to_lin(0.425, 0.242, 0.122)  # Mid reddish beech ply
    el4 = ramp_ply.color_ramp.elements.new(0.94)
    el4.color = srgb_to_lin(0.205, 0.100, 0.048)  # Next phenolic glue seam
    nt.links.new(wave_ply.outputs["Fac"], ramp_ply.inputs["Fac"])

    # Fine beech wood grain fiber along X
    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.35, 5.2, 5.2)
    nt.links.new(rot_lam.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.4
    n_fib.inputs["Detail"].default_value = 6.0
    n_fib.inputs["Distortion"].default_value = 0.48
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    # Beechwood characteristic short dark flecks / medullary rays
    map_fleck = nt.nodes.new("ShaderNodeMapping")
    map_fleck.inputs["Scale"].default_value = (1.6, 18.0, 18.0)
    nt.links.new(rot_lam.outputs["Vector"], map_fleck.inputs["Vector"])

    n_fleck = nt.nodes.new("ShaderNodeTexNoise")
    n_fleck.inputs["Scale"].default_value = 2.8
    n_fleck.inputs["Detail"].default_value = 4.0
    nt.links.new(map_fleck.outputs["Vector"], n_fleck.inputs["Vector"])

    fleck_m = nt.nodes.new("ShaderNodeMapRange")
    fleck_m.clamp = True
    fleck_m.inputs["From Min"].default_value = 0.62
    fleck_m.inputs["From Max"].default_value = 0.78
    fleck_m.inputs["To Min"].default_value = 0.0
    fleck_m.inputs["To Max"].default_value = 1.0
    nt.links.new(n_fleck.outputs["Fac"], fleck_m.inputs["Value"])

    # Blend fiber tone variation into ply bands
    fib_mod = nt.nodes.new("ShaderNodeMapRange")
    fib_mod.clamp = True
    fib_mod.inputs["From Min"].default_value = 0.25
    fib_mod.inputs["From Max"].default_value = 0.75
    fib_mod.inputs["To Min"].default_value = 0.0
    fib_mod.inputs["To Max"].default_value = 0.24
    nt.links.new(n_fib.outputs["Fac"], fib_mod.inputs["Value"])

    mix_fib = nt.nodes.new("ShaderNodeMix")
    mix_fib.data_type = "RGBA"
    mix_fib.inputs[7].default_value = srgb_to_lin(0.56, 0.36, 0.19)
    nt.links.new(fib_mod.outputs["Result"], mix_fib.inputs[0])
    nt.links.new(ramp_ply.outputs["Color"], mix_fib.inputs[6])

    fleck_mul = nt.nodes.new("ShaderNodeMath")
    fleck_mul.operation = "MULTIPLY"
    fleck_mul.inputs[1].default_value = 0.36
    nt.links.new(fleck_m.outputs["Result"], fleck_mul.inputs[0])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[7].default_value = srgb_to_lin(0.145, 0.068, 0.032)
    nt.links.new(fleck_mul.outputs["Value"], mix_col.inputs[0])
    nt.links.new(mix_fib.outputs[2], mix_col.inputs[6])
    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])

    # Military oiled/lacquered beech roughness (0.44 - 0.62)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.15
    r_wood.inputs["From Max"].default_value = 0.85
    r_wood.inputs["To Min"].default_value = 0.44
    r_wood.inputs["To Max"].default_value = 0.58
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])

    r_fleck = nt.nodes.new("ShaderNodeMath")
    r_fleck.operation = "MULTIPLY_ADD"
    r_fleck.inputs[1].default_value = 0.12
    nt.links.new(fleck_m.outputs["Result"], r_fleck.inputs[0])
    nt.links.new(r_wood.outputs["Result"], r_fleck.inputs[2])
    nt.links.new(r_fleck.outputs["Value"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.0

    # Micro height bump: subtle laminate glue ridge + beech pores
    h_ply = nt.nodes.new("ShaderNodeMath")
    h_ply.operation = "MULTIPLY"
    h_ply.inputs[1].default_value = 0.14
    nt.links.new(wave_ply.outputs["Fac"], h_ply.inputs[0])

    h_fib = nt.nodes.new("ShaderNodeMath")
    h_fib.operation = "MULTIPLY_ADD"
    h_fib.inputs[1].default_value = 0.18
    nt.links.new(n_fib.outputs["Fac"], h_fib.inputs[0])
    nt.links.new(h_ply.outputs["Value"], h_fib.inputs[2])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(h_fib.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # Suite 1: Laminated beechwood + embedded steel takedown disk & recoil cross-bolt
        "W_LaminatedBeech": _build_laminated_beech_mat("W_LaminatedBeech"),
        "S_TakedownSteel": _build_pbr_mat(
            "S_TakedownSteel",
            base_srgb=(0.240, 0.262, 0.305),
            roughness=0.32,
            metallic=0.89,
            bevel_r=0.022,
            edge_wear=0.45,
            grain_scale=36.0,
            grain_bump=0.022,
        ),
        # Suite 2: AgX-calibrated deep German blued steel (sRGB 0.18-0.28, R=0.25-0.38)
        "R_GermanBlued": _build_pbr_mat(
            "R_GermanBlued",
            base_srgb=(0.196, 0.220, 0.272),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.026,
            edge_wear=0.54,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=40.0,
            grain_bump=0.018,
            aniso_stretch=(0.55, 3.2, 3.2),
            rough_var=0.028,
        ),
        "R_ParkHardware": _build_pbr_mat(
            "R_ParkHardware",
            base_srgb=(0.235, 0.256, 0.296),
            roughness=0.35,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.50,
            edge_srgb=(0.74, 0.78, 0.83),
            grain_scale=48.0,
            grain_bump=0.026,
            rough_var=0.032,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.165, 0.182, 0.212),
            roughness=0.40,
            metallic=0.82,
            bevel_r=0.016,
            grain_scale=44.0,
            grain_bump=0.020,
        ),
        # Suite 3: Stepped blued barrel, spring-tempered claw extractor, bright white bolt steel & brass stripper clip
        "M_GermanBlued": _build_pbr_mat(
            "M_GermanBlued",
            base_srgb=(0.194, 0.218, 0.270),
            roughness=0.29,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=42.0,
            grain_bump=0.020,
            aniso_stretch=(3.8, 0.5, 0.5),
            rough_var=0.028,
        ),
        "M_SpringBlued": _build_pbr_mat(
            "M_SpringBlued",
            base_srgb=(0.215, 0.245, 0.312),
            roughness=0.26,
            metallic=0.91,
            bevel_r=0.020,
            edge_wear=0.46,
            grain_scale=36.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.6, 3.6),
        ),
        "M_BoltBright": _build_pbr_mat(
            "M_BoltBright",
            base_srgb=(0.76, 0.79, 0.84),
            roughness=0.19,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.97),
            grain_scale=32.0,
            grain_bump=0.015,
            aniso_stretch=(0.5, 3.4, 3.4),
        ),
        "M_ClipBrass": _build_pbr_mat(
            "M_ClipBrass",
            base_srgb=(0.85, 0.67, 0.28),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.018,
            edge_wear=0.28,
            edge_srgb=(0.95, 0.84, 0.50),
            grain_scale=30.0,
            grain_bump=0.016,
            aniso_stretch=(0.6, 3.0, 0.6),
        ),
    }


# =============================================================================
# Core BMesh Modeling Toolkit (Three.js -> Blender)
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


def _oval_zy(yc: float, ry: float, rz: float, segs: int = 28) -> list[tuple[float, float]]:
    return [(rz * math.sin(2.0 * math.pi * k / segs), yc + ry * math.cos(2.0 * math.pi * k / segs)) for k in range(segs)]


def mk_box(name: str, sx: float, sy: float, sz: float, xform=None, mat=None, bevel: float = 0.0, bevel_segs: int = 2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_sphere(name: str, radius: float, segs: int = 24, rings: int = 16, xform=None, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=radius)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(name: str, r_top: float, r_bot: float, length: float, axis: str = "x", segs: int = 28, xform=None, mat=None, bevel: float = 0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(name: str, pts_r_x: list[tuple[float, float]], segs: int = 36, xform=None, mat=None):
    bm = bmesh.new()
    closed_loop = len(pts_r_x) >= 3 and pts_r_x[0][0] > 1e-5 and math.hypot(pts_r_x[0][0] - pts_r_x[-1][0], pts_r_x[0][1] - pts_r_x[-1][1]) < 1e-4
    pts = pts_r_x[:-1] if closed_loop else list(pts_r_x)
    rings = []
    for r, x in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((x, 0.0, 0.0))])
        else:
            rings.append([bm.verts.new((x, r * math.cos(2.0 * math.pi * s / segs), r * math.sin(2.0 * math.pi * s / segs))) for s in range(segs)])
    n = len(rings)
    end_k = n if closed_loop else n - 1
    for k in range(end_k):
        a, b = rings[k], rings[(k + 1) % n]
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


def mk_extrude_z(name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float, bevel: float = 0.0, bevel_segs: int = 2, xform=None, mat=None):
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1] for i in range(len(clean)))
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
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_x(name: str, stations: list[tuple[float, list[tuple[float, float]]]], mat=None, xform=None):
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = [[bm.verts.new((x, y, z)) for (z, y) in zy_ring] for x, zy_ring in stations]
    for s in range(len(rings) - 1):
        a, b = rings[s], rings[s + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            bm.faces.new((a[k], b[k], b[kn], a[kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(name: str, pts_three: list[Vector], radius: float, ring_segs: int = 18, closed: bool = False, xform=None, mat=None):
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(pts_three)
    for i, p in enumerate(pts_three):
        if closed:
            tang = (pts_three[(i + 1) % n_pts] - pts_three[(i - 1) % n_pts]).normalized()
        elif i == 0:
            tang = (pts_three[1] - pts_three[0]).normalized()
        elif i == n_pts - 1:
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
        rings.append([bm.verts.new(p + (n_vec * math.cos(2.0 * math.pi * s / ring_segs) + b_vec * math.sin(2.0 * math.pi * s / ring_segs)) * radius) for s in range(ring_segs)])
    end_idx = len(rings) if closed else len(rings) - 1
    for i in range(end_idx):
        ni = (i + 1) % len(rings)
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[ni][s], rings[ni][sn], rings[i][sn]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_helical_lands(name: str, count: int, bore_r: float, depth: float, width: float, x0: float, x1: float, twist_cm: float, segs_x: int = 32, mat=None):
    objs = []
    r_in, r_out = bore_r - depth, bore_r + min(0.012, depth * 0.45)
    hw = width * 0.5
    for k in range(count):
        base_a = 2.0 * math.pi * k / count
        bm = bmesh.new()
        rings = []
        for s in range(segs_x + 1):
            x = x0 + (x1 - x0) * (s / segs_x)
            a = base_a + ((x - x0) / twist_cm) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            rings.append([bm.verts.new((x, py * ca - pz * sa, py * sa + pz * ca)) for py, pz in ((r_in, -hw), (r_out, -hw), (r_out, hw), (r_in, hw))])
        for s in range(segs_x):
            for c in range(4):
                cn = (c + 1) % 4
                bm.faces.new((rings[s][c], rings[s + 1][c], rings[s + 1][cn], rings[s][cn]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _apply_three_xform(bm, [])
        objs.append(_bm_to_obj(f"{name}_{k}", bm, mat))
    return objs


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
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


def finish_part(obj: bpy.types.Object, sharp_deg: float = 36.0, weighted_normals: bool = True) -> bpy.types.Object:
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
        e.smooth = (e.calc_face_angle(0.0) < angle_rad) if len(e.link_faces) == 2 else False
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
# Individual Museum-Grade Part Builders (21 Watertight Solid Parts)
# =============================================================================
def build_k98k_barrel(mats):
    m_blue, m_bright = mats["M_GermanBlued"], mats["M_BoltBright"]
    # Authentic 600mm Mauser stepped military contour (local x in [-30.0, +30.0])
    tube = mk_lathe_x(
        "k98k_bbl",
        [
            (0.415, -30.00), (0.415, -29.82), (1.24, -29.75), (1.24, -28.00),
            (1.44, -27.92), (1.28, -22.25), (1.12, -22.15), (0.96, -10.55),
            (0.88, -10.45), (0.78, 29.75), (0.71, 30.00), (0.41, 30.00),
            (0.396, 29.82), (0.396, -24.20), (0.46, -24.80), (0.58, -29.80),
            (0.415, -30.00),
        ],
        segs=40, mat=m_blue,
    )
    ramp = mk_box("k98k_bbl_ramp", 3.40, 0.72, 0.88, [("t", 27.50, 0.92, 0.0)], mat=m_blue, bevel=0.05)
    # 4 helical right-hand 1:240mm rifling lands visible down crown & throat
    lands = mk_helical_lands("k98k_land", 4, 0.396, 0.016, 0.16, -23.5, 29.6, 24.0, segs_x=30, mat=m_bright)
    obj = join_objects([tube, ramp, *lands], "k98k_barrel")
    return finish_part(obj, sharp_deg=36.0)


def build_k98k_front_sight(mats):
    m_blue, m_spr = mats["M_GermanBlued"], mats["M_SpringBlued"]
    base = mk_box("k98k_fs_base", 3.10, 0.42, 1.15, [("t", 0.0, -0.42, 0.0)], mat=m_blue, bevel=0.04)
    blade = mk_extrude_z("k98k_fs_blade", [(-1.10, -0.25), (0.85, -0.25), (0.32, 0.62), (-0.18, 0.62)], -0.12, 0.12, bevel=0.02, mat=m_blue)
    # Protective circular spring-steel front sight hood
    hood_o = mk_cyl("k98k_fs_ho", 0.94, 0.94, 2.45, axis="x", segs=32, xform=[("t", 0.05, 0.32, 0.0)], mat=m_spr, bevel=0.03)
    hood_i = mk_cyl("c_fs_hi", 0.79, 0.79, 2.80, axis="x", segs=32, xform=[("t", 0.05, 0.32, 0.0)], mat=m_spr)
    hood_s = mk_box("c_fs_hs", 2.90, 0.68, 0.92, [("t", 0.05, -0.45, 0.0)], mat=m_spr)
    hood = bool_subtract(hood_o, [hood_i, hood_s])
    return finish_part(join_objects([base, blade, hood], "k98k_front_sight"), sharp_deg=36.0)


def build_k98k_rear_sight(mats):
    m_blue, m_spr = mats["M_GermanBlued"], mats["M_SpringBlued"]
    col_o = mk_cyl("k98k_rs_co", 1.28, 1.28, 6.40, axis="x", segs=32, xform=[("t", 0.0, -1.25, 0.0)], mat=m_blue, bevel=0.05)
    col_i = mk_cyl("c_rs_ci", 1.03, 1.03, 6.90, axis="x", segs=32, xform=[("t", 0.0, -1.25, 0.0)], mat=m_blue)
    collar = bool_subtract(col_o, [col_i])
    # Curved tangent sight base ramp walls
    ramp_l = mk_extrude_z("k98k_rs_rl", [(-3.40, -0.52), (3.40, -0.52), (3.30, 0.36), (1.10, 0.44), (-1.40, 0.28), (-3.40, 0.14)], -0.94, -0.72, bevel=0.03, mat=m_blue)
    ramp_r = mk_extrude_z("k98k_rs_rr", [(-3.40, -0.52), (3.40, -0.52), (3.30, 0.36), (1.10, 0.44), (-1.40, 0.28), (-3.40, 0.14)], 0.72, 0.94, bevel=0.03, mat=m_blue)
    bridge = mk_box("k98k_rs_br", 6.60, 0.46, 1.60, [("t", 0.0, -0.30, 0.0)], mat=m_blue, bevel=0.04)
    # Flat-topped tangent sight leaf (Hero UV band on +Y top surface for 1-20 graduations!)
    leaf = mk_box("k98k_rs_leaf", 6.20, 0.28, 1.48, [("t", -0.10, 0.50, 0.0)], mat=m_spr, bevel=0.025)
    # Sliding elevation cursor with twin knurled pinch buttons
    slider = mk_box("k98k_rs_sld", 1.25, 0.56, 2.02, [("t", -1.45, 0.52, 0.0)], mat=m_blue, bevel=0.04)
    btn_l = mk_cyl("k98k_rs_bl", 0.22, 0.22, 0.32, axis="z", segs=16, xform=[("t", -1.45, 0.52, -1.10)], mat=m_spr, bevel=0.02)
    btn_r = mk_cyl("k98k_rs_br2", 0.22, 0.22, 0.32, axis="z", segs=16, xform=[("t", -1.45, 0.52, 1.10)], mat=m_spr, bevel=0.02)
    return finish_part(join_objects([collar, ramp_l, ramp_r, bridge, leaf, slider, btn_l, btn_r], "k98k_rear_sight"), sharp_deg=34.0)


def build_k98k_bolt_body(mats):
    m_bright, m_blue = mats["M_BoltBright"], mats["M_GermanBlued"]
    # Main rotating bolt cylinder with recessed extractor collar groove
    body = mk_lathe_x(
        "k98k_bb_cyl",
        [
            (0.46, -7.45), (0.86, -7.45), (0.86, -4.60), (0.88, -4.50),
            (0.88, 3.60), (0.74, 3.65), (0.74, 4.45), (0.88, 4.50),
            (0.88, 6.85), (0.60, 6.85), (0.60, 6.45), (0.46, 6.45),
            (0.46, -7.45),
        ],
        segs=32, mat=m_bright,
    )
    # Dual front locking lugs (12 & 6 o'clock in locked battery)
    lugs = mk_box("k98k_bb_lugs", 1.55, 2.52, 0.86, [("t", 5.90, 0.0, 0.0)], mat=m_bright, bevel=0.06)
    # Third rear safety lug ahead of handle root
    saf_lug = mk_box("k98k_bb_slug", 1.35, 0.72, 0.84, [("t", -4.10, -0.82, 0.42)], mat=m_bright, bevel=0.05)
    # Upper-left Mauser bolt guide rib
    rib = mk_box("k98k_bb_rib", 5.60, 0.32, 0.36, [("t", -0.60, 0.78, -0.48)], mat=m_bright, bevel=0.03)
    # Swept-down K98k bent bolt handle stem & spherical knob
    h_pts = [
        Vector((-5.60,  0.00, 0.65)),
        Vector((-5.68, -0.32, 1.65)),
        Vector((-5.85, -1.18, 2.48)),
        Vector((-6.05, -2.28, 3.10)),
        Vector((-6.18, -3.28, 3.55)),
        Vector((-6.20, -3.50, 3.68)),
    ]
    stem = mk_tube_along_pts("k98k_bb_stem", h_pts, 0.33, ring_segs=18, closed=False, mat=m_bright)
    knob = mk_sphere("k98k_bb_knob", 0.92, segs=24, rings=16, xform=[("t", -6.20, -3.55, 3.70)], mat=m_bright)
    # Cut underside gas escape ports & bore cleanup on lugs
    gas1 = mk_cyl("c_bb_g1", 0.24, 0.24, 1.25, axis="y", segs=16, xform=[("t", 2.40, -0.65, 0.0)], mat=m_blue)
    gas2 = mk_cyl("c_bb_g2", 0.24, 0.24, 1.25, axis="y", segs=16, xform=[("t", 0.90, -0.65, 0.0)], mat=m_blue)
    fp_c = mk_cyl("c_bb_fp", 0.46, 0.46, 3.20, axis="x", segs=18, xform=[("t", 5.90, 0.0, 0.0)], mat=m_blue)
    body_c = bool_subtract(body, [gas1, gas2])
    lugs_c = bool_subtract(lugs, [fp_c])
    return finish_part(join_objects([body_c, lugs_c, saf_lug, rib, stem, knob], "k98k_bolt_body"), sharp_deg=36.0)


def build_k98k_claw_extractor(mats):
    m_spr, m_blue = mats["M_SpringBlued"], mats["M_GermanBlued"]
    # Sculpted curved full-length Mauser claw extractor leaf bar along right side (+Z)
    blade = mk_box("k98k_ex_b", 7.80, 0.62, 0.28, [("t", 2.95, 0.0, 0.96)], mat=m_spr, bevel=0.04)
    tail = mk_box("k98k_ex_t", 1.25, 0.48, 0.24, [("t", -0.85, 0.0, 0.92)], mat=m_spr, bevel=0.03)
    claw = mk_box("k98k_ex_c", 0.76, 0.74, 0.56, [("t", 6.82, 0.0, 0.78)], mat=m_spr, bevel=0.04)
    # Rotating extractor collar ring
    col_o = mk_cyl("k98k_ex_co", 0.96, 0.96, 0.68, axis="x", segs=28, xform=[("t", 4.05, 0.0, 0.0)], mat=m_blue, bevel=0.03)
    col_i = mk_cyl("c_ex_ci", 0.76, 0.76, 0.95, axis="x", segs=28, xform=[("t", 4.05, 0.0, 0.0)], mat=m_blue)
    collar = bool_subtract(col_o, [col_i])
    return finish_part(join_objects([blade, tail, claw, collar], "k98k_claw_extractor"), sharp_deg=34.0)


def build_k98k_bolt_shroud(mats):
    m_blue = mats["M_GermanBlued"]
    sleeve = mk_lathe_x(
        "k98k_bs_slv",
        [
            (0.44, -1.45), (0.98, -1.45), (1.04, -1.35), (1.04, 0.55),
            (0.84, 0.62), (0.84, 1.48), (0.44, 1.48), (0.44, -1.45),
        ],
        segs=28, mat=m_blue,
    )
    flange = mk_box("k98k_bs_fl", 0.72, 1.85, 0.82, [("t", -0.25, 0.20, -0.78)], mat=m_blue, bevel=0.06)
    boss = mk_cyl("k98k_bs_bs", 0.58, 0.58, 1.85, axis="x", segs=22, xform=[("t", -0.55, 0.85, 0.0)], mat=m_blue, bevel=0.04)
    cslot = mk_box("c_bs_sl", 2.20, 0.95, 0.62, [("t", -0.50, -0.65, 0.0)], mat=m_blue)
    shroud = bool_subtract(join_objects([sleeve, flange, boss], "k98k_bs_tmp"), [cslot])
    shroud.name = "k98k_bolt_shroud"
    shroud.data.name = "k98k_bolt_shroud"
    return finish_part(shroud, sharp_deg=34.0)


def build_k98k_flag_safety(mats):
    m_bright = mats["M_BoltBright"]
    shaft = mk_cyl("k98k_fsf_sh", 0.36, 0.36, 1.95, axis="x", segs=22, xform=[("t", 0.25, 0.0, 0.0)], mat=m_bright, bevel=0.03)
    wing = mk_extrude_z(
        "k98k_fsf_w",
        [(-0.35, -0.32), (0.45, -0.32), (0.55, 0.25), (-0.15, 1.35), (-0.65, 1.25), (-0.55, 0.20)],
        -0.88, 0.88, bevel=0.05,
        xform=[("rx", -math.pi * 0.38), ("t", -0.62, 0.15, -0.78)],
        mat=m_bright,
    )
    return finish_part(join_objects([shaft, wing], "k98k_flag_safety"), sharp_deg=34.0)


def build_k98k_firing_pin(mats):
    m_bright, m_blue = mats["M_BoltBright"], mats["M_GermanBlued"]
    shaft = mk_lathe_x(
        "k98k_fp_sh",
        [
            (0.0, -8.75), (0.44, -8.75), (0.44, -7.20), (0.24, -7.15),
            (0.24, 3.20), (0.42, 3.28), (0.42, 3.72), (0.20, 3.78),
            (0.14, 7.60), (0.055, 8.28), (0.0, 8.32),
        ],
        segs=22, mat=m_bright,
    )
    flange = mk_box("k98k_fp_fl", 0.95, 0.92, 0.32, [("t", 3.50, 0.0, 0.0)], mat=m_bright, bevel=0.03)
    cock = mk_box("k98k_fp_ck", 1.65, 1.62, 0.72, [("t", -7.95, -0.45, 0.0)], mat=m_blue, bevel=0.05)
    return finish_part(join_objects([shaft, flange, cock], "k98k_firing_pin"), sharp_deg=34.0)


def build_k98k_receiver(mats):
    m_blue, m_park, m_dark = mats["R_GermanBlued"], mats["R_ParkHardware"], mats["R_InnerDark"]
    # Large front ring (Ø35.8mm -> r=1.79)
    fring = mk_cyl("k98k_r_fr", 1.79, 1.79, 3.85, axis="x", segs=36, xform=[("t", 7.25, 0.40, 0.0)], mat=m_blue, bevel=0.07)
    rlug = mk_box("k98k_r_rl", 1.55, 1.45, 2.25, [("t", 7.10, -1.25, 0.0)], mat=m_blue, bevel=0.06)
    body = mk_box("k98k_r_bd", 12.60, 2.95, 3.25, [("t", -0.50, 0.20, 0.0)], mat=m_blue, bevel=0.12, bevel_segs=3)
    rbrg = mk_cyl("k98k_r_rb", 1.62, 1.62, 3.40, axis="x", segs=32, xform=[("t", -4.50, 0.40, 0.0)], mat=m_blue, bevel=0.06)
    tang = mk_box("k98k_r_tg", 4.40, 1.15, 2.15, [("t", -8.60, -0.50, 0.0)], mat=m_blue, bevel=0.08)
    bstop = mk_box("k98k_r_bs", 3.60, 1.25, 0.85, [("t", -6.20, 0.45, -1.85)], mat=m_park, bevel=0.06)
    solid = join_objects([fring, rlug, body, rbrg, tang, bstop], "k98k_r_solid")

    # Precision milled receiver cutouts
    bore = mk_cyl("c_r_bore", 0.94, 0.94, 20.40, axis="x", segs=28, xform=[("t", 0.50, 0.40, 0.0)], mat=m_dark)
    tport = mk_box("c_r_tp", 7.80, 2.10, 2.15, [("t", 1.25, 1.35, 0.22)], mat=m_dark)
    thumb = mk_cyl("c_r_th", 1.45, 1.45, 1.80, axis="z", segs=24, xform=[("t", 0.90, 1.45, -1.55)], mat=m_dark)
    mfeed = mk_box("c_r_mf", 8.40, 2.00, 2.25, [("t", 1.40, -1.10, 0.0)], mat=m_dark)
    cslot = mk_box("c_r_cs", 1.45, 1.30, 1.55, [("t", -3.60, 1.85, 0.0)], mat=m_dark)
    hnotch = mk_box("c_r_hn", 1.85, 1.65, 1.45, [("t", -5.40, 0.35, 1.35)], mat=m_dark)
    gvent = mk_cyl("c_r_gv", 0.16, 0.16, 1.20, axis="z", segs=14, xform=[("t", 7.15, 0.60, -1.65)], mat=m_dark)

    rec = bool_subtract(solid, [bore, tport, thumb, mfeed, cslot, hnotch, gvent])
    rec.name = "k98k_receiver"
    rec.data.name = "k98k_receiver"
    return finish_part(rec, sharp_deg=36.0)


def build_k98k_stock(mats):
    m_wood, m_steel = mats["W_LaminatedBeech"], mats["S_TakedownSteel"]

    # Organically lofted laminated beechwood K98k military rifle stock (local x in [-47.8, +47.8])
    def _stock_ring(ytop: float, ybot: float, rz: float, segs: int = 32):
        cy = 0.5 * (ytop + ybot)
        ry = max(0.35, 0.5 * (ytop - ybot))
        ring = []
        for k in range(segs):
            a = 2.0 * math.pi * k / segs
            # Slightly flatter sides for crisp military stock feel
            sn = math.sin(a)
            cn = math.cos(a)
            z = math.copysign(abs(sn) ** 0.82, sn) * rz
            y = cy + math.copysign(abs(cn) ** 0.88, cn) * ry
            ring.append((z, y))
        return ring

    stations = [
        (-47.8, _stock_ring(2.20, -9.30, 2.04, 32)),
        (-36.0, _stock_ring(2.34, -7.15, 2.04, 32)),
        (-25.0, _stock_ring(2.48, -4.95, 1.92, 32)),
        (-20.2, _stock_ring(2.55, -3.65, 1.62, 32)),
        (-15.5, _stock_ring(2.78, -4.15, 1.64, 32)),  # Semi-pistol grip swell
        (-11.0, _stock_ring(2.85, -2.55, 1.88, 32)),
        ( -5.0, _stock_ring(2.92, -2.25, 2.05, 32)),
        (  5.0, _stock_ring(2.96, -2.25, 2.05, 32)),
        ( 15.0, _stock_ring(3.04, -1.30, 1.90, 32)),
        ( 30.0, _stock_ring(3.12, -0.05, 1.68, 32)),
        ( 47.8, _stock_ring(3.20,  1.15, 1.44, 32)),
    ]
    blank = mk_loft_x("k98k_stk_b", stations, mat=m_wood)

    # Receiver/mag inletting, barrel channel, iconic buttstock sling slot & twin finger grooves
    act_c = mk_box("c_stk_a", 18.20, 4.40, 2.85, [("t", -5.80, 2.10, 0.0)], mat=m_wood)
    mag_c = mk_box("c_stk_m", 9.80, 5.20, 2.55, [("t", -2.90, -0.40, 0.0)], mat=m_wood)
    bbl_c = mk_cyl("c_stk_b", 1.18, 1.18, 47.20, axis="x", segs=24, xform=[("t", 25.20, 3.60, 0.0)], mat=m_wood)
    sling_c = mk_box("c_stk_sl", 4.80, 2.50, 5.40, [("t", -40.40, -2.70, 0.0)], mat=m_wood, bevel=0.22)
    grv_l = mk_box("c_stk_gl", 14.50, 0.65, 0.48, [("t", 14.50, 1.35, -2.02)], mat=m_wood, bevel=0.12)
    grv_r = mk_box("c_stk_gr", 14.50, 0.65, 0.48, [("t", 14.50, 1.35,  2.02)], mat=m_wood, bevel=0.12)
    carved = bool_subtract(blank, [act_c, mag_c, bbl_c, sling_c, grv_l, grv_r])

    # Iconic K98k circular steel bolt takedown disk (Zerlegescheibe) with center recess + recoil cross-bolt
    td_o = mk_cyl("k98k_stk_tdo", 1.28, 1.28, 4.22, axis="z", segs=28, xform=[("t", -32.20, -2.30, 0.0)], mat=m_steel, bevel=0.06)
    td_h = mk_cyl("c_stk_tdh", 0.42, 0.42, 4.60, axis="z", segs=18, xform=[("t", -32.20, -2.30, 0.0)], mat=m_steel)
    td_disk = bool_subtract(td_o, [td_h])
    xbolt = mk_cyl("k98k_stk_xb", 0.45, 0.45, 4.24, axis="z", segs=18, xform=[("t", 2.70, 0.90, 0.0)], mat=m_steel, bevel=0.04)

    stk = join_objects([carved, td_disk, xbolt], "k98k_stock")
    return finish_part(stk, sharp_deg=42.0)


def build_k98k_handguard(mats):
    m_wood = mats["W_LaminatedBeech"]
    outer = mk_cyl("k98k_hg_o", 1.44, 1.68, 38.80, axis="x", segs=32, xform=[("t", 0.0, -0.30, 0.0)], mat=m_wood, bevel=0.08)
    bore = mk_cyl("c_hg_b", 0.92, 1.08, 39.80, axis="x", segs=28, xform=[("t", 0.0, -0.75, 0.0)], mat=m_wood)
    low = mk_box("c_hg_l", 40.40, 2.10, 4.40, [("t", 0.0, -1.65, 0.0)], mat=m_wood)
    swin = mk_box("c_hg_sw", 7.40, 2.60, 2.35, [("t", -14.70, 0.55, 0.0)], mat=m_wood, bevel=0.06)
    hg = bool_subtract(outer, [bore, low, swin])
    hg.name = "k98k_handguard"
    hg.data.name = "k98k_handguard"
    return finish_part(hg, sharp_deg=40.0)


def build_k98k_front_band(mats):
    m_park, m_blue, m_dark = mats["R_ParkHardware"], mats["R_GermanBlued"], mats["R_InnerDark"]
    r_str = mk_box("k98k_fb_r", 1.55, 3.65, 3.25, [("t", -2.20, 0.25, 0.0)], mat=m_park, bevel=0.09)
    f_str = mk_box("k98k_fb_f", 1.55, 3.45, 3.15, [("t",  1.85, 0.20, 0.0)], mat=m_park, bevel=0.09)
    br_l = mk_box("k98k_fb_bl", 4.40, 1.35, 0.36, [("t", -0.20, 0.25, -1.45)], mat=m_park, bevel=0.04)
    br_r = mk_box("k98k_fb_br", 4.40, 1.35, 0.36, [("t", -0.20, 0.25,  1.45)], mat=m_park, bevel=0.04)
    # T-bar S84/98 bayonet lug underneath muzzle
    bstem = mk_box("k98k_fb_bs", 5.20, 0.72, 0.68, [("t", 3.15, -0.95, 0.0)], mat=m_blue, bevel=0.04)
    brail = mk_box("k98k_fb_blg", 4.80, 0.38, 1.18, [("t", 3.25, -1.35, 0.0)], mat=m_blue, bevel=0.04)
    solid = join_objects([r_str, f_str, br_l, br_r, bstem, brail], "k98k_fb_tmp")
    bh = mk_cyl("c_fb_bh", 0.85, 0.85, 7.40, axis="x", segs=26, xform=[("t", 0.0, 0.65, 0.0)], mat=m_dark)
    sh = mk_box("c_fb_sh", 5.80, 1.55, 2.35, [("t", -0.20, -0.55, 0.0)], mat=m_dark)
    res = bool_subtract(solid, [bh, sh])
    res.name = "k98k_front_band"
    res.data.name = "k98k_front_band"
    return finish_part(res, sharp_deg=34.0)


def build_k98k_rear_band(mats):
    m_park, m_blue, m_dark = mats["R_ParkHardware"], mats["R_GermanBlued"], mats["R_InnerDark"]
    strap = mk_box("k98k_rb_s", 2.25, 3.65, 3.55, None, mat=m_park, bevel=0.10)
    bh = mk_cyl("c_rb_bh", 0.92, 0.92, 2.80, axis="x", segs=26, xform=[("t", 0.0, 0.60, 0.0)], mat=m_dark)
    wh = mk_box("c_rb_wh", 2.80, 1.85, 2.65, [("t", 0.0, -0.60, 0.0)], mat=m_dark)
    ring = bool_subtract(strap, [bh, wh])
    pt = mk_box("k98k_rb_pt", 0.55, 0.42, 0.85, [("t", 0.0,  0.95, -2.05)], mat=m_blue, bevel=0.04)
    pb = mk_box("k98k_rb_pb", 0.55, 0.42, 0.85, [("t", 0.0, -0.95, -2.05)], mat=m_blue, bevel=0.04)
    sb = mk_box("k98k_rb_sb", 0.42, 2.25, 0.34, [("t", 0.0,  0.00, -2.32)], mat=m_blue, bevel=0.04)
    return finish_part(join_objects([ring, pt, pb, sb], "k98k_rear_band"), sharp_deg=34.0)


def build_k98k_cleaning_rod(mats):
    m_blue = mats["M_GermanBlued"]
    rod = mk_lathe_x(
        "k98k_cr_rod",
        [
            (0.0, -15.50), (0.20, -15.50), (0.24, -15.20), (0.24, 13.80),
            (0.36, 13.95), (0.36, 15.35), (0.22, 15.50), (0.0, 15.50),
        ],
        segs=20, mat=m_blue,
    )
    eye = mk_box("c_cr_eye", 0.95, 0.24, 0.95, [("t", 14.55, 0.0, 0.0)], mat=m_blue)
    res = bool_subtract(rod, [eye])
    res.name = "k98k_cleaning_rod"
    res.data.name = "k98k_cleaning_rod"
    return finish_part(res, sharp_deg=36.0)


def build_k98k_buttplate(mats):
    m_park, m_dark = mats["R_ParkHardware"], mats["R_InnerDark"]
    outer = mk_extrude_z(
        "k98k_bp_o",
        [(-0.85, -5.75), (1.45, -5.75), (1.45, 5.75), (-0.85, 5.75), (-1.05, 0.0)],
        -2.09, 2.09, bevel=0.14, mat=m_park,
    )
    cup = mk_box("c_bp_cup", 1.85, 10.60, 3.55, [("t", 0.75, 0.0, 0.0)], mat=m_dark, bevel=0.06)
    res = bool_subtract(outer, [cup])
    res.name = "k98k_buttplate"
    res.data.name = "k98k_buttplate"
    return finish_part(res, sharp_deg=36.0)


def build_k98k_trigger(mats):
    m_blue = mats["M_GermanBlued"]
    head = mk_extrude_z(
        "k98k_tr_h",
        [(-1.45, 0.15), (1.42, 0.15), (1.35, 0.95), (0.45, 0.72), (-0.15, 1.05), (-1.35, 0.62)],
        -0.31, 0.31, bevel=0.04, mat=m_blue,
    )
    blade = mk_box("k98k_tr_b", 0.62, 2.45, 0.54, [("rz", 0.24), ("t", -0.22, -1.18, 0.0)], mat=m_blue, bevel=0.06)
    return finish_part(join_objects([head, blade], "k98k_trigger"), sharp_deg=34.0)


def build_k98k_sear(mats):
    m_spr = mats["M_SpringBlued"]
    sr = mk_extrude_z(
        "k98k_sear",
        [(-2.05, -0.35), (1.85, -0.35), (1.85, 0.35), (0.25, 0.35), (-0.35, 0.82), (-1.95, 0.42)],
        -0.39, 0.39, bevel=0.04, mat=m_spr,
    )
    return finish_part(sr, sharp_deg=34.0)


def build_k98k_trigger_guard(mats):
    m_blue, m_dark = mats["R_GermanBlued"], mats["R_InnerDark"]
    bplate = mk_box("k98k_tg_bp", 17.40, 0.58, 2.75, [("t", -0.35, -1.15, 0.0)], mat=m_blue, bevel=0.06)
    mbox = mk_box("k98k_tg_mb", 9.20, 3.55, 2.65, [("t", 2.90, 0.65, 0.0)], mat=m_blue, bevel=0.08)
    gbow = mk_extrude_z(
        "k98k_tg_gb",
        [(-8.40, -0.88), (-3.20, -0.88), (-3.40, -2.15), (-4.80, -2.55), (-7.20, -2.55), (-8.30, -1.85)],
        -0.69, 0.69, bevel=0.06, mat=m_blue,
    )
    solid = join_objects([bplate, mbox, gbow], "k98k_tg_tmp")
    m_in = mk_box("c_tg_mi", 8.45, 4.60, 2.15, [("t", 2.90, 0.55, 0.0)], mat=m_dark)
    ghole = mk_extrude_z(
        "c_tg_gh",
        [(-7.75, -1.20), (-3.90, -1.20), (-4.15, -2.02), (-5.05, -2.18), (-6.95, -2.18), (-7.70, -1.72)],
        -1.10, 1.10, mat=m_dark,
    )
    tslot = mk_box("c_tg_ts", 2.20, 1.20, 0.72, [("t", -6.40, -1.00, 0.0)], mat=m_dark)
    res = bool_subtract(solid, [m_in, ghole, tslot])
    res.name = "k98k_trigger_guard"
    res.data.name = "k98k_trigger_guard"
    return finish_part(res, sharp_deg=34.0)


def build_k98k_mag_follower(mats):
    m_bright = mats["M_BoltBright"]
    base = mk_box("k98k_mf_b", 7.80, 0.34, 1.92, [("t", 0.0, -0.14, 0.0)], mat=m_bright, bevel=0.04)
    step = mk_box("k98k_mf_s", 7.20, 0.34, 0.92, [("t", -0.15, 0.16, -0.46)], mat=m_bright, bevel=0.04)
    stop = mk_box("k98k_mf_st", 0.85, 0.42, 1.72, [("t", -3.45, 0.14, 0.0)], mat=m_bright, bevel=0.04)
    return finish_part(join_objects([base, step, stop], "k98k_mag_follower"), sharp_deg=34.0)


def build_k98k_mag_floorplate(mats):
    m_blue, m_park = mats["R_GermanBlued"], mats["R_ParkHardware"]
    plate = mk_box("k98k_fp_p", 8.90, 0.36, 2.38, None, mat=m_blue, bevel=0.05)
    lip = mk_box("k98k_fp_l", 0.95, 0.46, 1.95, [("t", 3.85, 0.22, 0.0)], mat=m_blue, bevel=0.04)
    stud = mk_cyl("k98k_fp_st", 0.26, 0.26, 0.48, axis="y", segs=16, xform=[("t", -3.80, -0.05, 0.0)], mat=m_park, bevel=0.03)
    return finish_part(join_objects([plate, lip, stud], "k98k_mag_floorplate"), sharp_deg=34.0)


def build_k98k_stripper_clip(mats):
    m_brass, m_spr = mats["M_ClipBrass"], mats["M_SpringBlued"]
    spine = mk_box("k98k_sc_sp", 0.28, 5.10, 1.38, [("t", -0.52, 0.0, 0.0)], mat=m_brass, bevel=0.03)
    w_l = mk_box("k98k_sc_wl", 1.32, 5.10, 0.22, [("t", 0.00, 0.0, -0.62)], mat=m_brass, bevel=0.03)
    w_r = mk_box("k98k_sc_wr", 1.32, 5.10, 0.22, [("t", 0.00, 0.0,  0.62)], mat=m_brass, bevel=0.03)
    l_l = mk_box("k98k_sc_ll", 0.26, 4.95, 0.32, [("t", 0.58, 0.0, -0.48)], mat=m_brass, bevel=0.02)
    l_r = mk_box("k98k_sc_lr", 0.26, 4.95, 0.32, [("t", 0.58, 0.0,  0.48)], mat=m_brass, bevel=0.02)
    # Top & bottom retaining stop tabs + internal blued spring leaf
    tab_t = mk_box("k98k_sc_tt", 0.42, 0.20, 0.88, [("t", -0.18,  2.48, 0.0)], mat=m_brass, bevel=0.02)
    tab_b = mk_box("k98k_sc_tb", 0.42, 0.20, 0.88, [("t", -0.18, -2.48, 0.0)], mat=m_brass, bevel=0.02)
    sleaf = mk_box("k98k_sc_sl", 0.18, 4.40, 0.72, [("t", -0.32, 0.0, 0.0)], mat=m_spr, bevel=0.02)
    return finish_part(join_objects([spine, w_l, w_r, l_l, l_r, tab_t, tab_b, sleaf], "k98k_stripper_clip"), sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & >= 50px Zero-Bleed Atlas Allocation
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    include_face_fn=None,
    label: str = "pack",
    margin: float = 0.005,
) -> int:
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    active_objs, sel_count = [], 0
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
        obj_sel = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            inc = include_face_fn(o.name, f, mname) if include_face_fn else True
            f.select = bool(inc)
            if inc:
                obj_sel += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if obj_sel > 0:
            active_objs.append(o)
            sel_count += obj_sel
    if not active_objs:
        return 0
    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(angle_limit=math.radians(62.0), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin, margin_method="SCALED", shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    du, dv = u1 - u0, v1 - v0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if include_face_fn and not include_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                uv.x = u0 + max(0.0, min(1.0, uv.x)) * du
                uv.y = v0 + max(0.0, min(1.0, uv.y)) * dv
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [UV-PACK:{label:14s}] {len(active_objs):2d} objs ({sel_count:5d} faces) -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}]")
    return sel_count


def unwrap_stock_atlas(stock_objs):
    def classify(on, f, mn):
        if mn == "S_TakedownSteel":
            return "STEEL"
        if on == "k98k_stock":
            nz = -f.normal.y
            tz = -f.calc_center_median().y
            if nz < -0.52 and tz < -0.35:
                return "HERO_LEFT"
            if nz > 0.52 and tz > 0.35:
                return "HERO_RIGHT"
        return "WOOD_PACK"

    # >= 50px firewall between steel takedown disk/cross-bolt (u in [0.76, 0.99]) and wood pack (u in [0.01, 0.72]) -> gap = 0.04 = 82px!
    _smart_unwrap_and_pack_rect(stock_objs, 0.010, 0.720, 0.010, 0.340, lambda on, f, mn: classify(on, f, mn) == "WOOD_PACK", "stock_wood")
    _smart_unwrap_and_pack_rect(stock_objs, 0.760, 0.990, 0.010, 0.340, lambda on, f, mn: classify(on, f, mn) == "STEEL", "stock_steel")

    stk = next(o for o in stock_objs if o.name == "k98k_stock")
    bm = bmesh.new()
    bm.from_mesh(stk.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in stk.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify("k98k_stock", f, mn)
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-47.8)) / 95.6))
            yn = max(0.0, min(1.0, (vco.z - (-9.4)) / 12.7))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.680 + yn * 0.305)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.365 + yn * 0.300)
    bm.to_mesh(stk.data)
    bm.free()


def unwrap_receiver_atlas(recv_objs):
    def classify(on, f, mn):
        if on == "k98k_receiver" and mn == "R_GermanBlued":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            ny, nz = n.z, -n.y
            # Top crest of front Mauser ring: "byf / 43"
            if 5.45 <= tx <= 9.15 and ty > 1.25 and ny > 0.62 and abs(tz) < 1.35:
                return "HERO_TOP_RING"
            # Left receiver flank wall & front ring left side: "Mod. 98", "6842 b", "WaA135"
            if -6.80 <= tx <= 9.10 and -1.25 <= ty <= 1.85 and nz < -0.68 and tz < -1.10:
                return "HERO_LEFT"
            # Right front receiver ring flank: "WaA135", "6842 b"
            if 5.20 <= tx <= 9.10 and -1.00 <= ty <= 1.80 and nz > 0.68 and tz > 1.10:
                return "HERO_RIGHT"
            return "PACK_REC"
        return "PACK_HW"

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.520, 0.010, 0.495, lambda on, f, mn: classify(on, f, mn) == "PACK_REC", "recv_rest")
    _smart_unwrap_and_pack_rect(recv_objs, 0.555, 0.990, 0.010, 0.495, lambda on, f, mn: classify(on, f, mn) == "PACK_HW", "recv_hw")

    rec = next(o for o in recv_objs if o.name == "k98k_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rec.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify("k98k_receiver", f, mn)
        if cls == "HERO_LEFT":
            for loop in f.loops:
                vco = loop.vert.co
                xn = max(0.0, min(1.0, (vco.x - (-6.80)) / 15.90))
                yn = max(0.0, min(1.0, (vco.z - (-1.25)) / 3.10))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.765 + yn * 0.220)
        elif cls == "HERO_TOP_RING":
            # Positive Jacobian (+Z -> u, +X -> v)
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                zn = max(0.0, min(1.0, (tz - (-1.35)) / 2.70))
                xn = max(0.0, min(1.0, (tx - 5.45) / 3.70))
                loop[uv_layer].uv = (0.015 + zn * 0.470, 0.530 + xn * 0.210)
        elif cls == "HERO_RIGHT":
            for loop in f.loops:
                vco = loop.vert.co
                xn = max(0.0, min(1.0, (vco.x - 5.20) / 3.90))
                yn = max(0.0, min(1.0, (vco.z - (-1.00)) / 2.80))
                loop[uv_layer].uv = (0.515 + xn * 0.470, 0.530 + yn * 0.210)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_metal_atlas(metal_objs):
    """
    Strictly isolated UV zones with >= 60px (>= 0.030 UV) firewalls:
      - HERO_SIGHT_LEAF:  [0.015, 0.255] x [0.740, 0.985] (1..20 tangent sight leaf exact top flat face)
      - HERO_BBL_CHAMBER: [0.300, 0.985] x [0.815, 0.985] (7.92 / WaA135 / 6842 b chamber top crest)
      - DARK_BLUED:       [0.290, 0.990] x [0.435, 0.785] + [0.010, 0.260] x [0.435, 0.710]
      - BRIGHT_STEEL:     [0.010, 0.590] x [0.010, 0.400] (polished bolt body, flag safety, firing pin, follower)
      - BRASS_CLIP:       [0.625, 0.990] x [0.010, 0.400] (5-rd brass stripper clip — >= 71px UV firewall!)
    """
    def classify(on, f, mn):
        if mn == "M_ClipBrass":
            return "BRASS_CLIP"
        if mn == "M_BoltBright":
            return "BRIGHT_STEEL"
        if on == "k98k_rear_sight" and mn == "M_SpringBlued":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            # Strictly ONLY the flat top face of the tangent sight leaf (y = 0.64, |z| <= 0.74)
            if n.z > 0.96 and 0.60 <= ty <= 0.68 and -3.22 <= tx <= 3.02 and abs(tz) <= 0.75:
                return "HERO_SIGHT_LEAF"
        if on == "k98k_barrel" and mn == "M_GermanBlued":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            # Strictly exterior top-arc chamber reinforce faces (exclude vertical step rings & bore!)
            if -27.7 <= tx <= -22.5 and n.z > 0.72 and abs(n.x) < 0.25 and ty > 1.05:
                return "HERO_BBL_CHAMBER"
        return "DARK_BLUED"

    _smart_unwrap_and_pack_rect(metal_objs, 0.290, 0.990, 0.435, 0.785, lambda on, f, mn: classify(on, f, mn) == "DARK_BLUED", "metal_blued")
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.590, 0.010, 0.400, lambda on, f, mn: classify(on, f, mn) == "BRIGHT_STEEL", "metal_bright")
    _smart_unwrap_and_pack_rect(metal_objs, 0.625, 0.990, 0.010, 0.400, lambda on, f, mn: classify(on, f, mn) == "BRASS_CLIP", "metal_brass")

    rs = next(o for o in metal_objs if o.name == "k98k_rear_sight")
    bm = bmesh.new()
    bm.from_mesh(rs.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rs.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify("k98k_rear_sight", f, mn) != "HERO_SIGHT_LEAF":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, tz = vco.x, -vco.y
            zn = max(0.0, min(1.0, (tz - (-0.74)) / 1.48))
            xn = max(0.0, min(1.0, (tx - (-3.20)) / 6.20))
            loop[uv_layer].uv = (0.015 + zn * 0.240, 0.740 + xn * 0.245)
    bm.to_mesh(rs.data)
    bm.free()

    bbl = next(o for o in metal_objs if o.name == "k98k_barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bbl.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify("k98k_barrel", f, mn) != "HERO_BBL_CHAMBER":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, tz = vco.x, -vco.y
            xn = max(0.0, min(1.0, (tx - (-27.7)) / 5.20))
            zn = max(0.0, min(1.0, (tz - (-1.00)) / 2.00))
            loop[uv_layer].uv = (0.300 + xn * 0.685, 0.815 + (1.0 - zn) * 0.170)
    bm.to_mesh(bbl.data)
    bm.free()


# =============================================================================
# Cycles Multi-Channel GPU Baker & Draco GLB Export
# =============================================================================
def _attach_bake_image_node(mats_set, img):
    created = []
    for mat in mats_set:
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.nodes.active = tex
        created.append((nt, tex))
    return created


def _remove_bake_image_nodes(created):
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set, input_name: str):
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
            emit.inputs["Color"].default_value = (val, val, val, 1.0) if isinstance(val, (int, float)) else tuple(val)
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        saved.append((nt, out, emit, orig_link))
    return saved


def _restore_bsdf(saved):
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img, filepath: Path):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    np.save(filepath, buf.reshape((h, w, 4))[::-1, :, :3].copy())


def _set_grid_isolated_layout(all_objs):
    for i, o in enumerate(all_objs):
        o.location = (0.0, i * 160.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            o.location = t2b(*ASSEMBLED_POS[o.name])
            o.rotation_euler = (0.0, 0.0, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 600.0, 0.0)


def _set_identity_layout(all_objs):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(prefix: str, target_objs, all_objs, tmp_dir: Path, default_albedo=(0.04, 0.05, 0.07, 1.0)):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0), normal_op=False, extra=None):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())
        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs = extra if extra is not None else target_objs
        select_only(objs, objs[0])
        kw = dict(type=bake_type, margin=5, use_clear=False)
        if normal_op:
            kw.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kw)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)
    s = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", 2, default_albedo)
    _restore_bsdf(s)

    s = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", 2, (0.35, 0.35, 0.35, 1.0))
    _restore_bsdf(s)

    s = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", 2, (0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(s)

    run_bake("normal", "NORMAL", BAKE_NORMAL_SAMPLES, (0.5, 0.5, 1.0, 1.0), normal_op=True)
    scene.world.light_settings.distance = 0.70
    run_bake("ao_self", "AO", BAKE_AO_SAMPLES, (1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.50
    run_bake("ao_ext", "AO", BAKE_AO_SAMPLES, (1.0, 1.0, 1.0, 1.0), extra=ext_targets)

    white_mat = bpy.data.materials.new("__EXT_MASK__")
    nt = white_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

    orig = {}
    for o in ext_targets:
        orig[o.name] = list(o.data.materials)
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
        for m in orig[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


def export_draco_glb(all_objs):
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


def verify_meshes(all_objs):
    total_tris = 0
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()
        assert non_man == 0, f"Non-manifold edges on {o.name}: {non_man}"
        assert vol > 0.0, f"Negative/zero volume on {o.name}: {vol}"
        print(f"  [OK] {o.name:24s} tris={tris:6d} vol={vol:8.2f}")
    print(f"[VERIFY] All {len(all_objs)} solid parts watertight | total_tris={total_tris:,}")


def main():
    t0 = time.time()
    reset_scene()
    mats = create_material_library()
    builders = {
        "k98k_stock":          build_k98k_stock,
        "k98k_handguard":      build_k98k_handguard,
        "k98k_receiver":       build_k98k_receiver,
        "k98k_trigger_guard":  build_k98k_trigger_guard,
        "k98k_mag_floorplate": build_k98k_mag_floorplate,
        "k98k_buttplate":      build_k98k_buttplate,
        "k98k_front_band":     build_k98k_front_band,
        "k98k_rear_band":      build_k98k_rear_band,
        "k98k_barrel":         build_k98k_barrel,
        "k98k_front_sight":    build_k98k_front_sight,
        "k98k_rear_sight":     build_k98k_rear_sight,
        "k98k_cleaning_rod":   build_k98k_cleaning_rod,
        "k98k_bolt_body":      build_k98k_bolt_body,
        "k98k_claw_extractor": build_k98k_claw_extractor,
        "k98k_bolt_shroud":    build_k98k_bolt_shroud,
        "k98k_flag_safety":    build_k98k_flag_safety,
        "k98k_firing_pin":     build_k98k_firing_pin,
        "k98k_trigger":        build_k98k_trigger,
        "k98k_sear":           build_k98k_sear,
        "k98k_mag_follower":   build_k98k_mag_follower,
        "k98k_stripper_clip":  build_k98k_stripper_clip,
    }
    print("[BUILD] Sculpting all 21 solid Mauser Karabiner 98k (7.92x57mm Mauser) parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}
    stock_objs = [built[pid] for pid in STOCK_PARTS]
    recv_objs  = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs   = stock_objs + recv_objs + metal_objs

    verify_meshes(all_objs)
    unwrap_stock_atlas(stock_objs)
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("stock", stock_objs), ("receiver", recv_objs), ("metal", metal_objs)):
        tot = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for pt in pts:
                    assert -1e-4 <= pt.x <= 1.0001 and -1e-4 <= pt.y <= 1.0001
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot += oa
            assert oa > 1e-6, f"Collapsed UV on {o.name}"
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot:.4f}")

    with tempfile.TemporaryDirectory(prefix="k98k_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("stock", stock_objs, all_objs, tmp_dir, (0.14, 0.06, 0.025, 1.0))
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, (0.04, 0.05, 0.075, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.04, 0.05, 0.075, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "k98k_v3_stock_albedo.webp",
        TEX_OUT_DIR / "k98k_v3_stock_normal.webp",
        TEX_OUT_DIR / "k98k_v3_stock_roughness.webp",
        TEX_OUT_DIR / "k98k_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "k98k_v3_receiver_normal.webp",
        TEX_OUT_DIR / "k98k_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "k98k_v3_metal_albedo.webp",
        TEX_OUT_DIR / "k98k_v3_metal_normal.webp",
        TEX_OUT_DIR / "k98k_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== MAUSER KARABINER 98K COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 10.0, f"Exceeded 10.0 MB budget: {total_mb:.2f} MB"


if __name__ == "__main__":
    main()
