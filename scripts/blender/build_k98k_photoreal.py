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
    distinct alternating diagonal dark/light beech laminate plies (tilted ~7.2 deg along stock
    with subtle lateral cant) so the sculpted semi-pistol grip, comb, beveled sling slot, and
    dual finger grooves reveal unmistakable topographic laminate ply rings with satin-oil sheen!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # Authentic ~7.2 deg diagonal longitudinal ply tilt + subtle 2.8 deg roll for rich topographic ply contours!
    rot_lam = nt.nodes.new("ShaderNodeMapping")
    rot_lam.inputs["Rotation"].default_value = (math.radians(2.8), math.radians(-7.2), 0.0)
    nt.links.new(tc.outputs["Object"], rot_lam.inputs["Vector"])

    # Primary laminate ply stack (~2.0mm phenolic-bonded beech veneer plies)
    map_ply = nt.nodes.new("ShaderNodeMapping")
    map_ply.inputs["Scale"].default_value = (0.045, 0.065, 1.56)
    nt.links.new(rot_lam.outputs["Vector"], map_ply.inputs["Vector"])

    wave_ply = nt.nodes.new("ShaderNodeTexWave")
    wave_ply.wave_type = "BANDS"
    wave_ply.bands_direction = "Z"
    wave_ply.wave_profile = "SAW"
    wave_ply.inputs["Scale"].default_value = 1.72
    wave_ply.inputs["Distortion"].default_value = 1.55
    wave_ply.inputs["Detail"].default_value = 3.0
    wave_ply.inputs["Detail Scale"].default_value = 1.25
    nt.links.new(map_ply.outputs["Vector"], wave_ply.inputs["Vector"])

    # Warm rich German beechwood laminate palette (alternating golden-honey/amber plies + dark phenolic seams)
    ramp_ply = nt.nodes.new("ShaderNodeValToRGB")
    ramp_ply.color_ramp.interpolation = "LINEAR"
    el0 = ramp_ply.color_ramp.elements[0]
    el0.position = 0.04
    el0.color = srgb_to_lin(0.172, 0.080, 0.036)  # Dark phenolic resin glue line
    el1 = ramp_ply.color_ramp.elements[1]
    el1.position = 0.16
    el1.color = srgb_to_lin(0.335, 0.182, 0.088)  # Roasted amber-brown beech veneer
    el2 = ramp_ply.color_ramp.elements.new(0.46)
    el2.color = srgb_to_lin(0.545, 0.340, 0.174)  # Warm honey-golden beech ply
    el3 = ramp_ply.color_ramp.elements.new(0.76)
    el3.color = srgb_to_lin(0.442, 0.254, 0.124)  # Mid chestnut beech ply
    el4 = ramp_ply.color_ramp.elements.new(0.94)
    el4.color = srgb_to_lin(0.192, 0.092, 0.042)  # Next phenolic glue seam
    nt.links.new(wave_ply.outputs["Fac"], ramp_ply.inputs["Fac"])

    # Fine beech wood grain fiber along X
    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.35, 5.2, 5.2)
    nt.links.new(rot_lam.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.4
    n_fib.inputs["Detail"].default_value = 6.0
    n_fib.inputs["Distortion"].default_value = 0.52
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
    fib_mod.inputs["To Max"].default_value = 0.26
    nt.links.new(n_fib.outputs["Fac"], fib_mod.inputs["Value"])

    mix_fib = nt.nodes.new("ShaderNodeMix")
    mix_fib.data_type = "RGBA"
    mix_fib.inputs[7].default_value = srgb_to_lin(0.58, 0.38, 0.20)
    nt.links.new(fib_mod.outputs["Result"], mix_fib.inputs[0])
    nt.links.new(ramp_ply.outputs["Color"], mix_fib.inputs[6])

    fleck_mul = nt.nodes.new("ShaderNodeMath")
    fleck_mul.operation = "MULTIPLY"
    fleck_mul.inputs[1].default_value = 0.34
    nt.links.new(fleck_m.outputs["Result"], fleck_mul.inputs[0])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs[7].default_value = srgb_to_lin(0.145, 0.068, 0.032)
    nt.links.new(fleck_mul.outputs["Value"], mix_col.inputs[0])
    nt.links.new(mix_fib.outputs[2], mix_col.inputs[6])
    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])

    # Refined military linseed-oiled / satin-lacquered beechwood roughness (R = 0.34-0.44, never flat matte!)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.15
    r_wood.inputs["From Max"].default_value = 0.85
    r_wood.inputs["To Min"].default_value = 0.34
    r_wood.inputs["To Max"].default_value = 0.42
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])

    r_fleck = nt.nodes.new("ShaderNodeMath")
    r_fleck.operation = "MULTIPLY_ADD"
    r_fleck.inputs[1].default_value = 0.05
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
    h_fib.inputs[1].default_value = 0.16
    nt.links.new(n_fib.outputs["Fac"], h_fib.inputs[0])
    nt.links.new(h_ply.outputs["Value"], h_fib.inputs[2])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.11
    bump.inputs["Distance"].default_value = 0.015
    nt.links.new(h_fib.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # Suite 1: Laminated beechwood + embedded steel takedown disk, sling keeper & recoil cross-bolt
        "W_LaminatedBeech": _build_laminated_beech_mat("W_LaminatedBeech"),
        "S_TakedownSteel": _build_pbr_mat(
            "S_TakedownSteel",
            base_srgb=(0.248, 0.270, 0.314),
            roughness=0.30,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.48,
            grain_scale=36.0,
            grain_bump=0.020,
        ),
        # Suite 2: AgX-calibrated deep German blued steel (sRGB 0.20-0.28, R=0.25-0.35)
        "R_GermanBlued": _build_pbr_mat(
            "R_GermanBlued",
            base_srgb=(0.208, 0.232, 0.284),
            roughness=0.27,
            metallic=0.90,
            bevel_r=0.026,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=40.0,
            grain_bump=0.018,
            aniso_stretch=(0.55, 3.2, 3.2),
            rough_var=0.028,
        ),
        "R_ParkHardware": _build_pbr_mat(
            "R_ParkHardware",
            base_srgb=(0.244, 0.266, 0.306),
            roughness=0.33,
            metallic=0.87,
            bevel_r=0.024,
            edge_wear=0.48,
            edge_srgb=(0.74, 0.78, 0.83),
            grain_scale=48.0,
            grain_bump=0.024,
            rough_var=0.032,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.180, 0.198, 0.230),
            roughness=0.38,
            metallic=0.84,
            bevel_r=0.016,
            grain_scale=44.0,
            grain_bump=0.020,
        ),
        # Suite 3: Stepped blued barrel, spring-tempered claw extractor, bright white bolt steel & brass stripper clip
        "M_GermanBlued": _build_pbr_mat(
            "M_GermanBlued",
            base_srgb=(0.206, 0.230, 0.282),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.50,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=42.0,
            grain_bump=0.018,
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


def _smoothstep_f(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def sample_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 12,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0],
            mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1],
        ))
    return pts


def sample_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 16,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt**3 * p0[0] + 3.0 * mt**2 * t * p1[0] + 3.0 * mt * t**2 * p2[0] + t**3 * p3[0],
            mt**3 * p0[1] + 3.0 * mt**2 * t * p1[1] + 3.0 * mt * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def mk_swept_bow(
    name: str,
    centerline_xy: list[tuple[float, float]],
    rx_fn,
    rz_fn,
    sec_n: int = 24,
    super_exp: float = 0.72,
    xform=None,
    mat=None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    n_pts = len(centerline_xy)
    for i, (cx, cy) in enumerate(centerline_xy):
        t = i / max(1, n_pts - 1)
        if i == 0:
            tx, ty = centerline_xy[1][0] - cx, centerline_xy[1][1] - cy
        elif i == n_pts - 1:
            tx, ty = cx - centerline_xy[-2][0], cy - centerline_xy[-2][1]
        else:
            tx, ty = centerline_xy[i + 1][0] - centerline_xy[i - 1][0], centerline_xy[i + 1][1] - centerline_xy[i - 1][1]
        tl = max(1e-6, math.hypot(tx, ty))
        nx, ny = -ty / tl, tx / tl
        rx = rx_fn(t)
        rz = rz_fn(t)
        ring = []
        for s in range(sec_n):
            a = (s / sec_n) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            px = math.copysign(abs(ca) ** super_exp, ca) * rx
            pz = math.copysign(abs(sa) ** super_exp, sa) * rz
            ring.append(bm.verts.new((cx + nx * px, cy + ny * px, pz)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sec_n):
            sn = (s + 1) % sec_n
            bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_stadium_2d(length_x: float, height_y: float, arc_segs: int = 12) -> list[tuple[float, float]]:
    """Smooth stadium/oval 2D contour centered at (0, 0) with semicircular ends."""
    r = height_y * 0.5
    half_straight = max(0.0, length_x * 0.5 - r)
    pts: list[tuple[float, float]] = []
    # Right semicircle (-pi/2 -> +pi/2)
    for k in range(arc_segs + 1):
        a = -math.pi * 0.5 + math.pi * (k / arc_segs)
        pts.append((half_straight + r * math.cos(a), r * math.sin(a)))
    # Left semicircle (+pi/2 -> +3*pi/2)
    for k in range(arc_segs + 1):
        a = math.pi * 0.5 + math.pi * (k / arc_segs)
        pts.append((-half_straight + r * math.cos(a), r * math.sin(a)))
    return pts


def bool_union(objs: list[bpy.types.Object], name: str, solver: str = "EXACT") -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
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


def _eval_k98k_stock_ring(x: float, n_ring: int = 36, offset_r: float = 0.0, with_flutes: bool = True) -> list[tuple[float, float]]:
    """
    Shared analytical Mauser Karabiner 98k laminated beechwood stock cross-section evaluator (local x in [-47.8, +47.8]):
      - Iconic semi-pistol grip pommel (-18.8) + slender ergonomic oval wrist (-15..-22) + subtle comb nose drop
      - Smooth concave belly cove behind pistol grip sweeping to rounded butt toe (-47.8)
      - Organic pear/oval cross-section w/ narrow comb crest, flat-sided receiver cheeks, & tapered forend
      - Sculpted dual forend finger grooves along x in [+7.5, +24.8] baked directly into loft geometry!
    """
    top_pts = [
        (-47.80, 2.15), (-40.00, 2.24), (-31.00, 2.34), (-25.50, 2.38),
        (-23.20, 2.26), (-21.20, 1.88), (-19.20, 1.66), (-17.20, 1.80),
        (-15.20, 2.48), (-13.60, 2.86), ( -5.00, 2.94), (  5.00, 2.96),
        ( 15.00, 3.04), ( 29.00, 3.12), ( 40.00, 3.16), ( 47.80, 3.20),
    ]
    bot_pts = [
        (-47.80, -9.25), (-41.00, -8.02), (-33.00, -6.54), (-26.50, -5.36),
        (-23.50, -4.96), (-21.80, -4.94), (-20.20, -5.36), (-18.80, -5.66),
        (-17.50, -5.54), (-16.20, -4.84), (-14.80, -3.45), (-13.20, -2.52),
        (-10.50, -2.30), ( -5.00, -2.28), (  2.50, -2.26), (  6.50, -1.94),
        ( 14.00, -1.26), ( 23.00, -0.52), ( 31.00,  0.08), ( 40.00,  0.66),
        ( 47.80,  1.12),
    ]
    w_pts = [
        (-47.80, 2.02), (-39.00, 2.00), (-30.00, 1.92), (-24.50, 1.76),
        (-21.00, 1.54), (-18.20, 1.46), (-15.50, 1.56), (-12.50, 1.94),
        ( -6.00, 2.04), (  5.00, 2.04), ( 12.00, 1.92), ( 22.00, 1.76),
        ( 30.00, 1.62), ( 40.00, 1.50), ( 47.80, 1.40),
    ]

    def _samp(pts: list[tuple[float, float]], xv: float) -> float:
        if xv <= pts[0][0]:
            return pts[0][1]
        if xv >= pts[-1][0]:
            return pts[-1][1]
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            if x0 <= xv <= x1:
                u = (xv - x0) / max(x1 - x0, 1e-6)
                return y0 + (y1 - y0) * u
        return pts[-1][1]

    yt = _samp(top_pts, x) + offset_r
    yb = _samp(bot_pts, x) - offset_r
    hw = _samp(w_pts, x) + offset_r
    ym = 0.5 * (yt + yb)
    hy = max(0.35, 0.5 * (yt - yb))

    # Narrow sculpted comb crest on buttstock (0.56), slender oval wrist, crisper flat receiver cheeks (0.94)
    if x < -22.0:
        top_taper = 0.56
    elif x < -12.5:
        top_taper = 0.56 + 0.38 * _smoothstep_f(-22.0, -12.5, x)
    elif x < 8.0:
        top_taper = 0.94
    else:
        top_taper = 0.94 - 0.08 * _smoothstep_f(8.0, 47.8, x)

    # Organic oval on buttstock & wrist (2.15), crisp slightly flatter receiver cheeks (2.60), rounded forend U (2.25)
    if x < -14.0:
        exp_n = 2.15
    elif x < -9.0:
        exp_n = 2.15 + 0.45 * _smoothstep_f(-14.0, -9.0, x)
    elif x < 8.0:
        exp_n = 2.60
    else:
        exp_n = 2.60 - 0.35 * _smoothstep_f(8.0, 22.0, x)

    # Dual sculpted Kar98k forend finger grooves along both flanks (x in [+7.5, +24.8])!
    flute_x = 0.0
    if with_flutes and 7.5 < x < 24.8:
        u_fl = (x - 7.5) / (24.8 - 7.5)
        # Smooth canoe-ended profile (steep rounded ends, flat long trough)
        flute_x = _smoothstep_f(0.0, 0.14, u_fl) * (1.0 - _smoothstep_f(0.86, 1.0, u_fl))

    ring: list[tuple[float, float]] = []
    for k in range(n_ring):
        th = 2.0 * math.pi * k / n_ring
        ct, st = math.cos(th), math.sin(th)
        sz = math.copysign(abs(ct) ** (2.0 / exp_n), ct)
        sy = math.copysign(abs(st) ** (2.0 / exp_n), st)
        if sy > 0.0:
            w_scale = 1.0 - (1.0 - top_taper) * (sy ** 1.42)
        else:
            w_scale = 1.0 - 0.24 * (abs(sy) ** 1.65)
        z_val = hw * w_scale * sz
        # Carve smooth concave dual finger grooves along upper-mid forend cheeks (sy ~ +0.26)
        if flute_x > 0.001 and abs(ct) > 0.45:
            dy_f = (sy - 0.26) / 0.32
            if abs(dy_f) < 1.0:
                groove_d = 0.25 * flute_x * ((math.cos(dy_f * math.pi * 0.5)) ** 1.4)
                z_val -= math.copysign(groove_d, z_val)
        ring.append((z_val, ym + hy * sy))
    return ring


def build_k98k_stock(mats):
    m_wood, m_steel = mats["W_LaminatedBeech"], mats["S_TakedownSteel"]

    # High-resolution 36-station x 36-ring organically lofted Mauser Kar98k laminated beechwood stock!
    xs = [
        -47.80, -45.50, -42.00, -38.00, -34.00, -30.00, -26.50, -24.50,
        -23.00, -21.60, -20.20, -18.80, -17.50, -16.20, -14.80, -13.40,
        -11.80,  -9.50,  -6.00,  -2.00,   2.50,   6.00,   7.50,   9.20,
         11.50,  15.00,  19.00,  22.50,  24.80,  27.50,  31.00,  35.50,
         40.50,  45.00,  47.20,  47.80,
    ]
    stations = [(x, _eval_k98k_stock_ring(x, 36, offset_r=(-0.04 if x >= 47.75 else 0.0))) for x in xs]
    blank = mk_loft_x("k98k_stk_b", stations, mat=m_wood)

    # Receiver/mag inletting, barrel channel & iconic beveled oval Kar98k side sling slot!
    act_c = mk_box("c_stk_a", 18.20, 4.40, 2.82, [("t", -5.80, 2.15, 0.0)], mat=m_wood)
    mag_c = mk_box("c_stk_m", 9.60, 5.20, 2.52, [("t", -2.90, -0.45, 0.0)], mat=m_wood)
    bbl_c = mk_cyl("c_stk_b", 1.15, 1.15, 47.40, axis="x", segs=28, xform=[("t", 25.20, 3.58, 0.0)], mat=m_wood)

    # Smooth beveled OVAL (stadium) Kar98k buttstock sling slot (replaces ugly square box hole!)
    sl_x, sl_y = -40.40, -2.70
    sling_thru = mk_extrude_z("c_stk_sl", mk_stadium_2d(4.65, 1.78, arc_segs=14), -3.20, 3.20, xform=[("t", sl_x, sl_y, 0.0)], mat=m_wood)
    # 45-deg flared stadium chamfer cutters on left (-Z) and right (+Z) buttstock flanks!
    sl_in = mk_stadium_2d(4.55, 1.68, arc_segs=14)
    sl_out = mk_stadium_2d(5.45, 2.58, arc_segs=14)
    def _mk_sling_chamfer(tag: str, z_inner: float, z_outer: float) -> bpy.types.Object:
        bm = bmesh.new()
        r0 = [bm.verts.new((sl_x + px, sl_y + py, z_inner)) for (px, py) in sl_in]
        r1 = [bm.verts.new((sl_x + px, sl_y + py, z_outer)) for (px, py) in sl_out]
        n = len(r0)
        for k in range(n):
            kn = (k + 1) % n
            bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
        bm.faces.new(list(reversed(r0)))
        bm.faces.new(r1)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _apply_three_xform(bm, [])
        return _bm_to_obj(tag, bm, m_wood)

    sl_ch_l = _mk_sling_chamfer("c_stk_sll", -1.45, -2.45)
    sl_ch_r = _mk_sling_chamfer("c_stk_slr",  1.45,  2.45)

    # Circular inset wood counterbore seats for the Kar98k bolt-disassembly takedown disc (Zerlegescheibe)!
    td_x, td_y = -32.20, -2.30
    td_rec_l = mk_cyl("c_td_rl", 1.28, 1.38, 0.42, axis="z", segs=32, xform=[("t", td_x, td_y, -1.96)], mat=m_wood)
    td_rec_r = mk_cyl("c_td_rr", 1.38, 1.28, 0.42, axis="z", segs=32, xform=[("t", td_x, td_y,  1.96)], mat=m_wood)

    carved = bool_subtract(blank, [act_c, mag_c, bbl_c, sling_thru, sl_ch_l, sl_ch_r, td_rec_l, td_rec_r])

    # Iconic K98k circular steel bolt takedown disk (Zerlegescheibe) w/ beveled flanged grommet & center bore
    td_o = mk_cyl("k98k_stk_tdo", 1.28, 1.28, 4.02, axis="z", segs=32, xform=[("t", td_x, td_y, 0.0)], mat=m_steel, bevel=0.07)
    td_h = mk_cyl("c_stk_tdh", 0.44, 0.44, 4.50, axis="z", segs=22, xform=[("t", td_x, td_y, 0.0)], mat=m_steel)
    td_dish_l = mk_cyl("c_td_dl", 0.44, 0.96, 0.24, axis="z", segs=28, xform=[("t", td_x, td_y, -1.96)], mat=m_steel)
    td_dish_r = mk_cyl("c_td_dr", 0.96, 0.44, 0.24, axis="z", segs=28, xform=[("t", td_x, td_y,  1.96)], mat=m_steel)
    td_disk = bool_subtract(td_o, [td_h, td_dish_l, td_dish_r])

    # Iconic blued steel Kar98k side-sling keeper bar recessed inside front of oval buttstock sling slot!
    sling_bar = mk_cyl("k98k_stk_sbar", 0.16, 0.16, 1.92, axis="y", segs=16, xform=[("t", sl_x + 1.55, sl_y, 0.0)], mat=m_steel, bevel=0.02)
    sling_tab_l = mk_box("k98k_stk_stl", 1.15, 2.35, 0.18, [("t", sl_x + 2.38, sl_y, -1.92)], mat=m_steel, bevel=0.03)
    sling_tab_r = mk_box("k98k_stk_str", 1.15, 2.35, 0.18, [("t", sl_x + 2.38, sl_y,  1.92)], mat=m_steel, bevel=0.03)

    # Recoil cross-bolt & flush nut
    xbolt = mk_cyl("k98k_stk_xb", 0.44, 0.44, 4.18, axis="z", segs=22, xform=[("t", 2.70, 0.90, 0.0)], mat=m_steel, bevel=0.04)

    stk = join_objects([carved, td_disk, sling_bar, sling_tab_l, sling_tab_r, xbolt], "k98k_stock")
    return finish_part(stk, sharp_deg=44.0)


def build_k98k_handguard(mats):
    m_wood = mats["W_LaminatedBeech"]
    # Gracefully tapered thin-walled arched laminated beechwood upper handguard (22-seg arch loft along X in [-19.4, +19.4])
    # Hugs the stepped Mauser barrel and sits flush onto the stock's upper forend lips (zero blocky bar or floating gap!)
    n_arc = 22
    xs = [-19.40, -19.25, -17.50, -14.00, -10.00, -5.00, 0.00, 5.00, 10.00, 15.00, 18.80, 19.25, 19.40]
    stations = []
    for x in xs:
        u = (x + 19.40) / 38.80
        r_out = 1.62 - u * 0.28     # smoothly tapers 1.62 -> 1.34 toward H-band
        r_in = 1.14 - u * 0.22      # clears stepped Mauser barrel (r=1.12 -> 0.80)
        yc = -0.62 + u * 0.06       # world Y = 2.25 - 0.62 = 1.63 (concentric w/ barrel bore at Y=1.50!)
        y_skirt = -1.20 + u * 0.14  # world Y = 1.05..1.19 -> seats cleanly against stock upper lip!
        lip_in = 0.05 if (x <= -19.30 or x >= 19.30) else 0.0
        ro = r_out - lip_in
        ring = [(ro, y_skirt)]
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            ring.append((ro * math.cos(a), yc + ro * math.sin(a)))
        ring.extend([(-ro, y_skirt), (-r_in, y_skirt)])
        for k in range(n_arc, -1, -1):
            a = math.pi * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        ring.append((r_in, y_skirt))
        stations.append((x, ring))

    arch = mk_loft_x("k98k_hg_o", stations, mat=m_wood)
    # Cleanly contoured rear tangent-sight saddle opening (local x in [-18.4, -11.0])
    swin = mk_box("c_hg_sw", 7.45, 2.75, 2.18, [("t", -14.70, 0.45, 0.0)], mat=m_wood, bevel=0.08)
    hg = bool_subtract(arch, [swin])
    hg.name = "k98k_handguard"
    hg.data.name = "k98k_handguard"
    return finish_part(hg, sharp_deg=42.0)


def _mk_k98k_band_collar(name: str, x0: float, x1: float, r_top: float, y_top_c: float, hw_bot: float, y_bot: float, mat) -> bpy.types.Object:
    """Builds an authentic contoured Mauser rounded-arch steel barrel band wrapping upper handguard & rounded forend belly."""
    n_arc = 18
    def _ring(inset: float = 0.0) -> list[tuple[float, float]]:
        rt = r_top - inset
        wb = hw_bot - inset
        yb = y_bot + inset
        pts: list[tuple[float, float]] = []
        # Smooth semicircular top arch over handguard/barrel
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            pts.append((rt * math.cos(a), y_top_c + rt * math.sin(a)))
        # Rounded U-belly wrapping stock forend underside
        n_bot = 14
        for k in range(1, n_bot):
            a = math.pi + math.pi * (k / n_bot)
            ca, sa = math.cos(a), math.sin(a)
            pz = wb * math.copysign(abs(ca) ** 0.78, ca)
            py = y_top_c + (y_top_c - yb) * sa
            pts.append((pz, py))
        return pts

    xm0 = x0 + 0.07
    xm1 = x1 - 0.07
    return mk_loft_x(name, [(x0, _ring(0.045)), (xm0, _ring(0.0)), (xm1, _ring(0.0)), (x1, _ring(0.045))], mat=mat)


def build_k98k_front_band(mats):
    m_park, m_blue, m_dark = mats["R_ParkHardware"], mats["R_GermanBlued"], mats["R_InnerDark"]
    # Authentic contoured H-pattern Mauser front steel barrel band (rounded arch-top collars + recessed H side bridges!)
    r_col = _mk_k98k_band_collar("k98k_fb_r", -2.95, -1.42, 1.46, 0.76, 1.54, -1.25, m_park)
    f_col = _mk_k98k_band_collar("k98k_fb_f",  1.08,  2.60, 1.38, 0.74, 1.48, -1.18, m_park)
    br_l = mk_box("k98k_fb_bl", 4.35, 1.24, 0.34, [("t", -0.18, 0.25, -1.36)], mat=m_park, bevel=0.05)
    br_r = mk_box("k98k_fb_br", 4.35, 1.24, 0.34, [("t", -0.18, 0.25,  1.36)], mat=m_park, bevel=0.05)
    # T-bar S84/98 bayonet lug underneath muzzle
    bstem = mk_box("k98k_fb_bs", 5.20, 0.70, 0.66, [("t", 3.15, -0.95, 0.0)], mat=m_blue, bevel=0.045)
    brail = mk_box("k98k_fb_blg", 4.80, 0.38, 1.16, [("t", 3.25, -1.35, 0.0)], mat=m_blue, bevel=0.045)
    solid = bool_union([r_col, f_col, br_l, br_r, bstem, brail], "k98k_fb_tmp")
    bh = mk_cyl("c_fb_bh", 0.85, 0.85, 7.40, axis="x", segs=28, xform=[("t", 0.0, 0.65, 0.0)], mat=m_dark)
    sh = mk_cyl("c_fb_sh", 1.15, 1.15, 5.80, axis="x", segs=24, xform=[("t", -0.20, -0.35, 0.0)], mat=m_dark)
    res = bool_subtract(solid, [bh, sh])
    res.name = "k98k_front_band"
    res.data.name = "k98k_front_band"
    return finish_part(res, sharp_deg=36.0)


def build_k98k_rear_band(mats):
    m_park, m_blue, m_dark = mats["R_ParkHardware"], mats["R_GermanBlued"], mats["R_InnerDark"]
    # Contoured rounded-arch steel rear barrel band hugging the arched handguard & rounded forend belly!
    strap = _mk_k98k_band_collar("k98k_rb_s", -1.10, 1.10, 1.56, 0.75, 1.74, -1.30, m_park)
    bh = mk_cyl("c_rb_bh", 0.92, 0.92, 2.80, axis="x", segs=28, xform=[("t", 0.0, 0.60, 0.0)], mat=m_dark)
    wh = mk_cyl("c_rb_wh", 1.32, 1.32, 2.80, axis="x", segs=26, xform=[("t", 0.0, -0.45, 0.0)], mat=m_dark)
    ring = bool_subtract(strap, [bh, wh])
    # Authentic left-side cavalry sling bar & contoured mounting ears
    pt = mk_cyl("k98k_rb_pt", 0.24, 0.24, 0.85, axis="z", segs=18, xform=[("t", 0.0,  0.92, -1.96)], mat=m_blue, bevel=0.03)
    pb = mk_cyl("k98k_rb_pb", 0.24, 0.24, 0.85, axis="z", segs=18, xform=[("t", 0.0, -0.92, -1.96)], mat=m_blue, bevel=0.03)
    sb = mk_cyl("k98k_rb_sb", 0.17, 0.17, 2.18, axis="y", segs=16, xform=[("t", 0.0,  0.00, -2.26)], mat=m_blue, bevel=0.03)
    return finish_part(join_objects([ring, pt, pb, sb], "k98k_rear_band"), sharp_deg=36.0)


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
    # Contoured cupped stamped steel Kar98k buttplate lofted directly from the exact rear stock oval!
    # stock Y (-2.10) - buttplate Y (-5.65) = +3.55 cm -> 100% flush wrap around rounded comb heel & toe!
    y_shift = 3.55
    r_front = [(z, y + y_shift) for (z, y) in _eval_k98k_stock_ring(-47.80, 36, offset_r=0.09, with_flutes=False)]
    r_mid   = [(z, y + y_shift) for (z, y) in _eval_k98k_stock_ring(-47.80, 36, offset_r=0.10, with_flutes=False)]
    r_back  = [(z * 0.96, y + y_shift) for (z, y) in _eval_k98k_stock_ring(-47.80, 36, offset_r=0.02, with_flutes=False)]
    r_rim   = [(z * 0.88, y + y_shift) for (z, y) in _eval_k98k_stock_ring(-47.80, 36, offset_r=-0.12, with_flutes=False)]
    outer = mk_loft_x(
        "k98k_bp_o",
        [(1.38, r_front), (0.15, r_mid), (-0.64, r_back), (-0.82, r_rim)],
        mat=m_park,
    )
    # Hollow inner cup matching wood buttstock end so buttplate genuinely wraps like a steel shoe!
    c_in = [(z, y + y_shift) for (z, y) in _eval_k98k_stock_ring(-47.80, 36, offset_r=-0.14, with_flutes=False)]
    cup = mk_loft_x("c_bp_cup", [(0.08, c_in), (1.65, c_in)], mat=m_dark)
    res = bool_subtract(outer, [cup])
    # Twin recessed buttplate wood-screw heads on rear shoulder face
    scr_t = mk_cyl("k98k_bp_st", 0.25, 0.25, 0.22, axis="x", segs=18, xform=[("t", -0.78,  3.75, 0.0)], mat=m_dark, bevel=0.025)
    scr_b = mk_cyl("k98k_bp_sb", 0.25, 0.25, 0.22, axis="x", segs=18, xform=[("t", -0.78, -3.95, 0.0)], mat=m_dark, bevel=0.025)
    res = join_objects([res, scr_t, scr_b], "k98k_buttplate")
    return finish_part(res, sharp_deg=38.0)


def build_k98k_trigger(mats):
    m_blue = mats["M_GermanBlued"]
    head = mk_extrude_z(
        "k98k_tr_h",
        [(-1.45, 0.15), (1.42, 0.15), (1.35, 0.95), (0.45, 0.72), (-0.15, 1.05), (-1.35, 0.62)],
        -0.31, 0.31, bevel=0.04, mat=m_blue,
    )
    # Gracefully curved two-stage Mauser crescent trigger blade dropping cleanly into oval trigger-guard bow!
    bl_pts = [(-0.44, 0.32), (0.20, 0.32)]
    bl_pts.extend(sample_cubic_bezier((0.20, 0.32), (0.04, -1.15), (0.12, -2.35), (0.68, -3.32), steps=14))
    bl_pts.extend(sample_quad_bezier((0.68, -3.32), (0.40, -3.52), (0.08, -3.28), steps=6))
    bl_pts.extend(sample_cubic_bezier((0.08, -3.28), (-0.52, -2.25), (-0.58, -1.08), (-0.44, 0.32), steps=14))
    blade = mk_extrude_z("k98k_tr_b", bl_pts, -0.27, 0.27, bevel=0.06, bevel_segs=3, mat=m_blue)
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
    # Sleek rounded-end milled bottom tang plate flush with stock belly (world Y = -4.35)
    bplate = mk_extrude_z(
        "k98k_tg_bp",
        mk_stadium_2d(17.60, 2.76, arc_segs=10),
        -1.44, -0.86, bevel=0.06, bevel_segs=2,
        xform=[("rx", -math.pi * 0.5), ("t", -0.35, 0.0, 0.0)],
        mat=m_blue,
    )
    # Wait: verify rotation ("rx", -pi/2) maps (x, y, z) -> (x, z, -y) -> z in [-1.44, -0.86] maps to y in [-1.44, -0.86]!
    # And stadium y in [-1.38, +1.38] maps to z in [-1.38, +1.38]! Exact!
    mbox = mk_box("k98k_tg_mb", 9.20, 3.55, 2.65, [("t", 2.90, 0.65, 0.0)], mat=m_blue, bevel=0.08, bevel_segs=3)

    # Unmistakable Mauser 98 smoothly curved milled oval trigger-guard bow welded watertight into tang!
    # Drops cleanly beneath stock wrist (local y down to -3.45 -> world Y = -6.65) framing curved trigger!
    tg_center: list[tuple[float, float]] = []
    tg_center.extend(
        sample_cubic_bezier((-9.05, -1.04), (-9.02, -2.35), (-8.38, -3.28), (-7.05, -3.42), steps=14, include_start=True)
    )
    tg_center.extend(
        sample_cubic_bezier((-7.05, -3.42), (-5.80, -3.52), (-4.42, -3.42), (-3.58, -2.72), steps=14, include_start=False)
    )
    tg_center.extend(
        sample_cubic_bezier((-3.58, -2.72), (-2.94, -2.18), (-2.88, -1.52), (-2.68, -1.04), steps=12, include_start=False)
    )

    def _tg_rx(t: float) -> float:
        f0 = 0.16 * ((1.0 - _smoothstep_f(0.0, 0.16, t)) ** 1.5)
        f1 = 0.18 * (_smoothstep_f(0.84, 1.0, t) ** 1.5)
        return 0.225 + f0 + f1

    def _tg_rz(t: float) -> float:
        f0 = 0.24 * ((1.0 - _smoothstep_f(0.0, 0.20, t)) ** 1.4)
        f1 = 0.26 * (_smoothstep_f(0.80, 1.0, t) ** 1.4)
        return 0.66 + f0 + f1

    gbow = mk_swept_bow("k98k_tg_gb", tg_center, _tg_rx, _tg_rz, sec_n=24, super_exp=0.72, mat=m_blue)

    # Guard screw bosses at front & rear tang ends (classic Mauser action screws!)
    boss_f = mk_cyl("k98k_tg_bf", 0.48, 0.54, 0.56, axis="y", segs=22, xform=[("t", 7.85, -1.16, 0.0)], mat=m_blue, bevel=0.04)
    boss_r = mk_cyl("k98k_tg_br", 0.44, 0.50, 0.54, axis="y", segs=22, xform=[("t", -8.65, -1.16, 0.0)], mat=m_blue, bevel=0.04)

    solid = bool_union([bplate, mbox, gbow, boss_f, boss_r], "k98k_tg_tmp")
    m_in = mk_box("c_tg_mi", 8.45, 4.60, 2.15, [("t", 2.90, 0.55, 0.0)], mat=m_dark)
    tslot = mk_box("c_tg_ts", 2.40, 1.40, 0.72, [("t", -6.40, -1.10, 0.0)], mat=m_dark)
    res = bool_subtract(solid, [m_in, tslot])
    res.name = "k98k_trigger_guard"
    res.data.name = "k98k_trigger_guard"
    return finish_part(res, sharp_deg=36.0)


def build_k98k_mag_follower(mats):
    m_bright = mats["M_BoltBright"]
    base = mk_box("k98k_mf_b", 7.80, 0.34, 1.92, [("t", 0.0, -0.14, 0.0)], mat=m_bright, bevel=0.04)
    step = mk_box("k98k_mf_s", 7.20, 0.34, 0.92, [("t", -0.15, 0.16, -0.46)], mat=m_bright, bevel=0.04)
    stop = mk_box("k98k_mf_st", 0.85, 0.42, 1.72, [("t", -3.45, 0.14, 0.0)], mat=m_bright, bevel=0.04)
    return finish_part(join_objects([base, step, stop], "k98k_mag_follower"), sharp_deg=34.0)


def build_k98k_mag_floorplate(mats):
    m_blue, m_park = mats["R_GermanBlued"], mats["R_ParkHardware"]
    # Sleek rounded-end milled Mauser magazine floorplate seated flush in trigger-guard frame!
    plate = mk_extrude_z(
        "k98k_fp_p",
        mk_stadium_2d(8.90, 2.38, arc_segs=10),
        -0.18, 0.18, bevel=0.055, bevel_segs=3,
        xform=[("rx", -math.pi * 0.5)],
        mat=m_blue,
    )
    lip = mk_box("k98k_fp_l", 0.95, 0.46, 1.95, [("t", 3.85, 0.22, 0.0)], mat=m_blue, bevel=0.04)
    # Recessed bullet-tip floorplate release button & spring-plunger collar
    collar = mk_cyl("k98k_fp_cl", 0.38, 0.40, 0.26, axis="y", segs=20, xform=[("t", -3.72, -0.06, 0.0)], mat=m_park, bevel=0.03)
    stud = mk_cyl("k98k_fp_st", 0.22, 0.22, 0.46, axis="y", segs=18, xform=[("t", -3.72, -0.08, 0.0)], mat=m_blue, bevel=0.03)
    return finish_part(join_objects([plate, lip, collar, stud], "k98k_mag_floorplate"), sharp_deg=34.0)


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
