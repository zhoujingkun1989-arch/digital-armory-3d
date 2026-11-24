#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Winchester Model 1894 Saddle-Ring Carbine (.30-30 Win)
====================================================================================================
MIT License — Digital Armory 3D (`WP-25b`)

Generates:
  - public/models/winchester1894.glb (Draco-compressed glTF 2.0, all 21 solid parts; skips ONLY
    the 3 dynamically GPU-compressed `aSpringParam` springs: `win94_mainspring`,
    `win94_sear_spring`, `win94_mag_spring`)
  - public/textures/win94_v3_walnut_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM, 0 alpha)
  - public/textures/win94_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/win94_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)

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
# MODE 2: System Python Post-Process (Winchester Factory Rollmarks, Serial,
#         WP Oval Proof, Steel Buttplate Checkering, RNM Blend & Packed ORM)
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

    def _draw_wp_oval_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        draw.ellipse((cx - r * 1.15, cy - r * 0.88, cx + r * 1.15, cy + r * 0.88), outline=245, width=max(3, int(r * 0.14)))
        draw.text((cx, cy - r * 0.18), "W", fill=255, font=_load_font(FONT_SERIF_BOLD, int(r * 0.72)), anchor="mm")
        draw.text((cx, cy + r * 0.28), "P", fill=255, font=_load_font(FONT_SERIF_BOLD, int(r * 0.72)), anchor="mm")

    # =========================================================================
    # SUITE 1: win94_v3_walnut (Stock & Carbine Forend)
    # =========================================================================
    def process_walnut_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "walnut_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "walnut_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "walnut_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "walnut_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "walnut_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "walnut_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "walnut_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.30, 1.0).astype(np.float32)

        # Vintage Winchester wrist inspection proof oval on right flank hero band (v in [0.365, 0.665])
        CW, CH = 3200, 960
        stamp_r = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(stamp_r)
        _draw_wp_oval_proof(dr, CW * 0.72, CH * 0.28, 48.0)
        dr.text((CW * 0.72, CH * 0.44), "W.R.A.CO.", fill=220, font=_load_font(FONT_SERIF_BOLD, 42), anchor="mm")

        stamp_map = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(stamp_map, stamp_r, 0.015, 0.985, 0.365, 0.665)
        stamp_d = ndimage.gaussian_filter(stamp_map, sigma=0.7) * 0.62

        albedo *= 1.0 - 0.30 * stamp_d[..., None]
        _mix(rgh, 0.66, stamp_d * 0.65)
        ao *= 1.0 - 0.30 * stamp_d
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.52 * stamp_d, strength=4.2))

        rgh = np.clip(rgh, 0.28, 0.88)
        met = np.clip(met, 0.00, 0.02)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "win94_v3_walnut_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "win94_v3_walnut_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "win94_v3_walnut_roughness.webp", 93)
        print("[POST] Saved win94_v3_walnut_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: win94_v3_receiver (Receiver, Loading Gate, Saddle Ring, Lever, Link, Buttplate)
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
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.30, 1.0).astype(np.float32)

        # Receiver flanks span X in [-6.10, +6.10], Y in [-2.05, +2.05] (span 12.20 x 4.10 cm)
        CW, CH = 3172, 1066

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - (-2.05)) / 4.10) * CH))

        def xw_to_cx_r(xw: float) -> int:
            return int(round((xw - (-6.10)) / 12.20 * CW))

        def xw_to_cx_l(xw: float) -> int:
            return int(round((1.0 - (xw - (-6.10)) / 12.20) * CW))

        engr_w = np.zeros((h, w), dtype=np.float32)
        silver_w = np.zeros((h, w), dtype=np.float32)

        # Left Receiver Flank: Pre-64 Factory Engraving & Serial / WP Proof
        l_img = Image.new("L", (CW, CH), 0)
        dl = ImageDraw.Draw(l_img)
        _draw_wp_oval_proof(dl, xw_to_cx_l(3.9), yw_to_cy(1.05), 54.0)
        dl.text((xw_to_cx_l(1.6), yw_to_cy(1.10)), "WINCHESTER", fill=255, font=_load_font(FONT_SERIF_BOLD, 78))
        dl.text((xw_to_cx_l(1.4), yw_to_cy(0.55)), "MODEL 1894  -  .30 W.C.F.", fill=240, font=_load_font(FONT_SERIF_BOLD, 62))
        dl.text((xw_to_cx_l(0.8), yw_to_cy(-0.45)), "SER.  942186", fill=245, font=_load_font(FONT_DIN, 68))
        _paste_uv_band(engr_w, l_img, 0.015, 0.985, 0.765, 0.985)

        # Right Receiver Flank (above loading port X in [-5.4, +0.2]): New Haven Rollmark & Patent
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        dr.text((xw_to_cx_r(-4.8), yw_to_cy(0.92)), "WINCHESTER REPEATING ARMS CO.", fill=250, font=_load_font(FONT_COND, 62))
        dr.text((xw_to_cx_r(-4.8), yw_to_cy(0.32)), "NEW HAVEN, CONN. U.S.A.", fill=238, font=_load_font(FONT_COND, 56))
        dr.text((xw_to_cx_r(-4.8), yw_to_cy(-0.88)), "PAT. AUG. 21, 1894", fill=220, font=_load_font(FONT_COND, 50))
        _paste_uv_band(engr_w, r_img, 0.015, 0.985, 0.525, 0.745)

        # Brushed steel grain + subtle silver highlight inside rollmarks
        silver_w = ndimage.gaussian_filter(engr_w, sigma=0.5) * 0.55
        _mix(albedo, (0.68, 0.71, 0.76), silver_w * 0.42)
        _mix(rgh, 0.24, silver_w * 0.45)
        ao *= 1.0 - 0.35 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.55 * engr_w, strength=4.6))
        rgh = np.clip(rgh, 0.14, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "win94_v3_receiver_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "win94_v3_receiver_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "win94_v3_receiver_roughness.webp", 93)
        print("[POST] Saved win94_v3_receiver_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: win94_v3_metal (Barrel, Sights, Bands, Bolt, Hammer, Mag Tube, Brass Carrier/Follower)
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
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.30, 1.0).astype(np.float32)

        # Barrel upper-left flat rollmark hero band: u in [0.015, 0.985], v in [0.815, 0.985]
        BW, BH = 4400, 440
        b_img = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_img)
        _draw_wp_oval_proof(db, BW * 0.86, BH * 0.50, 56.0)
        db.text(
            (BW * 0.52, BH * 0.32),
            "WINCHESTER  - MODEL 94 -  .30 W.C.F.",
            fill=255,
            font=_load_font(FONT_SERIF_BOLD, 84),
            anchor="mm",
        )
        db.text(
            (BW * 0.52, BH * 0.68),
            "MADE IN NEW HAVEN, CONN. U.S.A.  WINCHESTER PROOF STEEL",
            fill=242,
            font=_load_font(FONT_COND, 64),
            anchor="mm",
        )

        roll_w = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(roll_w, b_img, 0.015, 0.985, 0.815, 0.985)
        silver_r = ndimage.gaussian_filter(roll_w, sigma=0.5) * 0.62
        _mix(albedo, (0.72, 0.75, 0.80), silver_r * 0.45)
        _mix(rgh, 0.22, silver_r * 0.45)
        ao *= 1.0 - 0.34 * roll_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.56 * roll_w, strength=4.8))
        rgh = np.clip(rgh, 0.12, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "win94_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "win94_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "win94_v3_metal_roughness.webp", 93)
        print("[POST] Saved win94_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    process_walnut_atlas()
    process_receiver_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "winchester1894.glb"
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


WALNUT_PARTS = [
    "win94_forend",
    "win94_walnut_stock",
]

RECEIVER_PARTS = [
    "win94_receiver",
    "win94_loading_gate",
    "win94_saddle_ring",
    "win94_lever",
    "win94_link",
    "win94_buttplate",
]

METAL_PARTS = [
    "win94_barrel",
    "win94_front_sight",
    "win94_rear_sight",
    "win94_barrel_bands",
    "win94_breech_bolt",
    "win94_firing_pin",
    "win94_locking_bolt",
    "win94_hammer",
    "win94_trigger",
    "win94_tang_safety",
    "win94_mag_tube",
    "win94_mag_follower",
    "win94_carrier",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "win94_forend",
    "win94_walnut_stock",
    "win94_receiver",
    "win94_loading_gate",
    "win94_saddle_ring",
    "win94_lever",
    "win94_buttplate",
    "win94_barrel",
    "win94_front_sight",
    "win94_rear_sight",
    "win94_barrel_bands",
    "win94_hammer",
    "win94_trigger",
    "win94_mag_tube",
}

ASSEMBLED_POS = {
    "win94_barrel":        ( 30.80,  1.45,  0.00),
    "win94_front_sight":   ( 54.20,  2.55,  0.00),
    "win94_rear_sight":    ( 14.50,  2.35,  0.00),
    "win94_breech_bolt":   ( -0.40,  1.45,  0.00),
    "win94_firing_pin":    ( -0.80,  1.45,  0.00),
    "win94_locking_bolt":  ( -5.90, -0.05,  0.00),
    "win94_lever":         (  0.80, -1.65,  0.00),
    "win94_link":          ( -4.60, -1.85,  0.00),
    "win94_receiver":      ( -1.00,  0.25,  0.00),
    "win94_saddle_ring":   ( -3.80,  0.20, -1.62),
    "win94_forend":        ( 21.50,  0.45,  0.00),
    "win94_barrel_bands":  ( 36.20,  0.55,  0.00),
    "win94_walnut_stock":  (-22.50, -2.55,  0.00),
    "win94_buttplate":     (-38.40, -4.15,  0.00),
    "win94_hammer":        ( -6.80,  0.45,  0.00),
    "win94_trigger":       ( -7.20, -1.65,  0.00),
    "win94_tang_safety":   ( -8.40, -0.95,  0.00),
    "win94_mag_tube":      ( 30.00, -0.35,  0.00),
    "win94_mag_follower":  ( 25.80, -0.35,  0.00),
    "win94_loading_gate":  (  0.30,  0.10,  1.44),
    "win94_carrier":       ( -1.40, -0.75,  0.00),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "win94_mainspring",
    "win94_sear_spring",
    "win94_mag_spring",
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
    edge_srgb: tuple[float, float, float] = (0.76, 0.78, 0.82),
    grain_scale: float = 44.0,
    grain_bump: float = 0.028,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 80.0,
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
    n_macro.inputs["Scale"].default_value = 0.48
    n_macro.inputs["Detail"].default_value = 4.5
    n_macro.inputs["Roughness"].default_value = 0.56
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
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.13),
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
    rgh_map.inputs["To Min"].default_value = max(0.10, roughness - rough_var)
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
        mix_er.inputs[3].default_value = max(0.14, roughness - 0.14)
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
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_walnut_mat(name: str = "W_WinchesterWalnut") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(-3.5), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (0.068, 0.72, 0.58)
    nt.links.new(rot_g.outputs["Vector"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "X"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 1.05
    wave.inputs["Distortion"].default_value = 7.4
    wave.inputs["Detail"].default_value = 6.0
    wave.inputs["Detail Scale"].default_value = 1.5
    wave.inputs["Detail Roughness"].default_value = 0.54
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.28, 3.8, 3.8)
    nt.links.new(rot_g.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 1.9
    n_fib.inputs["Detail"].default_value = 6.5
    n_fib.inputs["Distortion"].default_value = 0.62
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    map_pore = nt.nodes.new("ShaderNodeMapping")
    map_pore.inputs["Scale"].default_value = (1.15, 16.0, 16.0)
    nt.links.new(rot_g.outputs["Vector"], map_pore.inputs["Vector"])

    n_pore = nt.nodes.new("ShaderNodeTexNoise")
    n_pore.inputs["Scale"].default_value = 2.6
    n_pore.inputs["Detail"].default_value = 4.0
    nt.links.new(map_pore.outputs["Vector"], n_pore.inputs["Vector"])

    pore_m = nt.nodes.new("ShaderNodeMapRange")
    pore_m.clamp = True
    pore_m.inputs["From Min"].default_value = 0.60
    pore_m.inputs["From Max"].default_value = 0.77
    pore_m.inputs["To Min"].default_value = 0.0
    pore_m.inputs["To Max"].default_value = 1.0
    nt.links.new(n_pore.outputs["Fac"], pore_m.inputs["Value"])

    # Classic rich red-brown pre-64 Winchester varnished/oiled American Black Walnut
    c_dark = srgb_to_lin(0.175, 0.082, 0.042)
    c_mid  = srgb_to_lin(0.355, 0.172, 0.084)
    c_warm = srgb_to_lin(0.495, 0.258, 0.128)

    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = c_dark
    mix1.inputs[7].default_value = c_mid
    nt.links.new(wave.outputs["Fac"], mix1.inputs[0])

    fib_f = nt.nodes.new("ShaderNodeMapRange")
    fib_f.clamp = True
    fib_f.inputs["From Min"].default_value = 0.30
    fib_f.inputs["From Max"].default_value = 0.76
    fib_f.inputs["To Min"].default_value = 0.0
    fib_f.inputs["To Max"].default_value = 0.56
    nt.links.new(n_fib.outputs["Fac"], fib_f.inputs["Value"])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = c_warm
    nt.links.new(fib_f.outputs["Result"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])

    pore_mul = nt.nodes.new("ShaderNodeMath")
    pore_mul.operation = "MULTIPLY"
    pore_mul.inputs[1].default_value = 0.48
    nt.links.new(pore_m.outputs["Result"], pore_mul.inputs[0])

    mix_p = nt.nodes.new("ShaderNodeMix")
    mix_p.data_type = "RGBA"
    mix_p.inputs[7].default_value = srgb_to_lin(0.105, 0.046, 0.022)
    nt.links.new(pore_mul.outputs["Value"], mix_p.inputs[0])
    nt.links.new(mix2.outputs[2], mix_p.inputs[6])
    nt.links.new(mix_p.outputs[2], bsdf.inputs["Base Color"])

    # Refined hand-rubbed linseed-oiled Pre-64 Winchester American walnut roughness (R = 0.34-0.44)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.34
    r_wood.inputs["To Max"].default_value = 0.41
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])

    r_pore = nt.nodes.new("ShaderNodeMath")
    r_pore.operation = "MULTIPLY_ADD"
    r_pore.inputs[1].default_value = 0.045
    nt.links.new(pore_m.outputs["Result"], r_pore.inputs[0])
    nt.links.new(r_wood.outputs["Result"], r_pore.inputs[2])
    nt.links.new(r_pore.outputs["Value"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.0

    h_pore = nt.nodes.new("ShaderNodeMath")
    h_pore.operation = "MULTIPLY"
    h_pore.inputs[1].default_value = -0.34
    nt.links.new(pore_m.outputs["Result"], h_pore.inputs[0])

    h_fib = nt.nodes.new("ShaderNodeMath")
    h_fib.operation = "MULTIPLY_ADD"
    h_fib.inputs[1].default_value = 0.16
    nt.links.new(n_fib.outputs["Fac"], h_fib.inputs[0])
    nt.links.new(h_pore.outputs["Value"], h_fib.inputs[2])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.13
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(h_fib.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        "W_WinchesterWalnut": _build_walnut_mat("W_WinchesterWalnut"),
        # AgX-calibrated Pre-64 Winchester Royal Blued steel (sRGB 0.20-0.29, R=0.25-0.31)
        "R_RoyalBlued": _build_pbr_mat(
            "R_RoyalBlued",
            base_srgb=(0.204, 0.232, 0.296),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.028,
            edge_wear=0.56,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=38.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.026,
        ),
        "R_CaseHardened": _build_pbr_mat(
            "R_CaseHardened",
            base_srgb=(0.355, 0.318, 0.292),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.80, 0.78, 0.76),
            grain_scale=18.0,
            grain_bump=0.022,
            rough_var=0.034,
        ),
        "R_SaddleIron": _build_pbr_mat(
            "R_SaddleIron",
            base_srgb=(0.255, 0.278, 0.322),
            roughness=0.29,
            metallic=0.89,
            bevel_r=0.020,
            edge_wear=0.48,
            grain_scale=34.0,
            grain_bump=0.020,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.180, 0.194, 0.218),
            roughness=0.38,
            metallic=0.84,
            bevel_r=0.016,
            grain_scale=42.0,
            grain_bump=0.020,
        ),
        "M_BluedSteel": _build_pbr_mat(
            "M_BluedSteel",
            base_srgb=(0.200, 0.228, 0.290),
            roughness=0.23,
            metallic=0.90,
            bevel_r=0.026,
            edge_wear=0.56,
            edge_srgb=(0.79, 0.82, 0.87),
            grain_scale=40.0,
            grain_bump=0.020,
            aniso_stretch=(4.0, 0.5, 0.5),
            rough_var=0.028,
        ),
        "M_PolishedSteel": _build_pbr_mat(
            "M_PolishedSteel",
            base_srgb=(0.74, 0.77, 0.82),
            roughness=0.18,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.25,
            edge_srgb=(0.92, 0.94, 0.97),
            grain_scale=32.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.5, 3.5),
        ),
        "M_Stainless": _build_pbr_mat(
            "M_Stainless",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.16,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.20,
            grain_scale=28.0,
            grain_bump=0.014,
        ),
        "M_CaseHardened": _build_pbr_mat(
            "M_CaseHardened",
            base_srgb=(0.355, 0.318, 0.292),
            roughness=0.26,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.48,
            grain_scale=18.0,
            grain_bump=0.022,
        ),
        "M_Brass": _build_pbr_mat(
            "M_Brass",
            base_srgb=(0.84, 0.66, 0.28),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.95, 0.82, 0.48),
            grain_scale=30.0,
            grain_bump=0.016,
            aniso_stretch=(3.2, 0.6, 0.6),
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


def _quad_bez(p0, p1, p2, segs: int = 8):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _oval_zy(yc: float, ry: float, rz: float, segs: int = 24) -> list[tuple[float, float]]:
    return [(rz * math.sin(2.0 * math.pi * k / segs), yc + ry * math.cos(2.0 * math.pi * k / segs)) for k in range(segs)]


def mk_box(name: str, sx: float, sy: float, sz: float, xform=None, mat=None, bevel: float = 0.0, bevel_segs: int = 2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
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


def mk_tube_along_pts(name: str, pts_three: list[Vector], radius: float, ring_segs: int = 16, closed: bool = False, xform=None, mat=None):
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


def mk_helical_lands(name: str, count: int, bore_r: float, depth: float, width: float, x0: float, x1: float, twist_cm: float, segs_x: int = 30, mat=None):
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


def mk_stadium_2d(length_x: float, height_y: float, arc_segs: int = 10) -> list[tuple[float, float]]:
    r = height_y * 0.5
    half_straight = max(1e-4, length_x * 0.5 - r)
    pts: list[tuple[float, float]] = []
    for k in range(arc_segs + 1):
        a = -math.pi * 0.5 + math.pi * (k / arc_segs)
        pts.append((half_straight + r * math.cos(a), r * math.sin(a)))
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


def finish_part(obj: bpy.types.Object, bevel_w: float = 0.0, bevel_segs: int = 2, sharp_deg: float = 36.0, weighted_normals: bool = True) -> bpy.types.Object:
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
# Individual High-Detail Part Builders (21 Solid Parts)
# =============================================================================
def build_win94_barrel(mats):
    m_blued, m_steel, m_dark = mats["M_BluedSteel"], mats["M_PolishedSteel"], mats["M_BluedSteel"]
    tube = mk_lathe_x(
        "w94_bbl",
        [
            (0.39, -25.60), (0.39, -25.30), (1.06, -25.25), (1.06, -22.20),
            (0.94, -21.80), (0.78, -5.00), (0.72, 23.80), (0.72, 25.55),
            (0.64, 25.70), (0.41, 25.70), (0.39, 25.50), (0.39, -25.60),
        ],
        segs=40, mat=m_blued,
    )
    lug = mk_box("w94_lug", 1.50, 1.45, 0.72, [("t", 22.60, -1.05, 0.0)], mat=m_blued, bevel=0.04)
    ramp = mk_box("w94_sramp", 2.20, 0.52, 0.56, [("t", 23.40, 0.88, 0.0)], mat=m_blued, bevel=0.04)
    lands = mk_helical_lands("w94_land", 6, 0.39, 0.014, 0.14, -22.5, 25.2, 25.4, segs_x=28, mat=m_steel)
    obj = join_objects([tube, lug, ramp, *lands], "win94_barrel")
    return finish_part(obj, sharp_deg=36.0)


def build_win94_front_sight(mats):
    m_blued, m_brass = mats["M_BluedSteel"], mats["M_Brass"]
    # Contoured dovetail base + gracefully swept ramp blade + domed solid brass front bead
    base = mk_extrude_z("w94_fs_base", [(-0.98, -0.40), (0.98, -0.40), (0.78, -0.06), (-0.78, -0.06)], -0.44, 0.44, bevel=0.04, mat=m_blued)
    blade_pts = [(-0.88, -0.14), (0.86, -0.14)] + sample_quad_bezier((0.86, -0.14), (0.82, 0.46), (0.28, 0.88), steps=10) + sample_quad_bezier((0.28, 0.88), (-0.18, 0.45), (-0.88, -0.14), steps=10)
    blade = mk_extrude_z("w94_fs_b", blade_pts, -0.13, 0.13, bevel=0.025, mat=m_blued)
    bead_stem = mk_cyl("w94_fs_bs", 0.14, 0.14, 0.36, axis="x", segs=20, xform=[("t", -0.04, 0.64, 0.0)], mat=m_brass, bevel=0.03)
    bead_cap = mk_lathe_x(
        "w94_fs_bc",
        [(0.0, -0.18), (0.12, -0.16), (0.16, -0.08), (0.16, 0.08), (0.11, 0.16), (0.0, 0.18)],
        segs=20, xform=[("t", -0.14, 0.64, 0.0)], mat=m_brass,
    )
    return finish_part(join_objects([base, blade, bead_stem, bead_cap], "win94_front_sight"), sharp_deg=36.0)


def build_win94_rear_sight(mats):
    m_blued = mats["M_BluedSteel"]
    # Authentic Winchester semi-buckhorn rear sight w/ dovetail base, spring leaf & 5-step elevator ramp!
    base = mk_extrude_z("w94_rs_dv", [(1.10, -0.26), (2.10, -0.26), (1.92, 0.06), (1.28, 0.06)], -0.48, 0.48, bevel=0.03, mat=m_blued)
    leaf_pts = [(-1.85, 0.06), (1.92, -0.08), (1.92, 0.14), (-1.85, 0.30)]
    leaf = mk_extrude_z("w94_rs_leaf", leaf_pts, -0.34, 0.34, bevel=0.03, mat=m_blued)
    # 5-stepped elevation elevator wedge beneath leaf (`X in [-1.35, +0.95]`)
    elev_pts = [(-1.30, -0.16), (0.95, -0.16), (0.95, -0.04)]
    for st in range(5):
        sx0 = 0.72 - st * 0.38
        sx1 = sx0 - 0.34
        sy = -0.02 + st * 0.08
        elev_pts.extend([(sx0, sy), (sx1, sy)])
    elev_pts.append((-1.30, 0.32))
    elevator = mk_extrude_z("w94_rs_el", elev_pts, -0.32, 0.32, bevel=0.02, mat=m_blued)
    # Iconic swept curved semi-buckhorn rear sight ears framing central U-notch (in Z-Y plane -> rotate ry(pi/2))
    horn_l = sample_cubic_bezier((-0.14, 0.24), (-0.42, 0.26), (-0.72, 0.56), (-0.54, 0.94), steps=14, include_start=True)
    horn_r = sample_cubic_bezier(( 0.14, 0.24), ( 0.42, 0.26), ( 0.72, 0.56), ( 0.54, 0.94), steps=14, include_start=True)
    ear_l = mk_swept_bow("w94_rs_hl", horn_l, lambda t: 0.12 - 0.04 * t, lambda t: 0.16, sec_n=14, super_exp=0.65, xform=[("ry", math.pi * 0.5), ("t", -1.68, 0.18, 0.0)], mat=m_blued)
    ear_r = mk_swept_bow("w94_rs_hr", horn_r, lambda t: 0.12 - 0.04 * t, lambda t: 0.16, sec_n=14, super_exp=0.65, xform=[("ry", math.pi * 0.5), ("t", -1.68, 0.18, 0.0)], mat=m_blued)
    saddle = mk_box("w94_rs_sd", 0.34, 0.28, 0.46, [("t", -1.68, 0.34, 0.0)], mat=m_blued, bevel=0.03)
    return finish_part(join_objects([base, leaf, elevator, ear_l, ear_r, saddle], "win94_rear_sight"), sharp_deg=34.0)


def build_win94_breech_bolt(mats):
    m_pol, m_blued = mats["M_PolishedSteel"], mats["M_BluedSteel"]
    blank = mk_box("w94_bolt_b", 8.60, 1.24, 1.38, None, mat=m_pol, bevel=0.10)
    collar = mk_lathe_x("w94_bolt_f", [(0.0, 4.10), (0.64, 4.10), (0.64, 4.40), (0.52, 4.40), (0.52, 4.25), (0.0, 4.25)], segs=24, mat=m_pol)
    ext = mk_box("w94_bolt_ext", 3.40, 0.26, 0.38, [("t", 2.20, 0.66, 0.0)], mat=m_blued, bevel=0.03)
    fp_bore = mk_cyl("c_fpb", 0.22, 0.22, 9.00, axis="x", segs=14, mat=m_pol)
    notch = mk_box("c_bnotch", 1.80, 0.88, 0.72, [("t", -3.60, -0.35, 0.0)], mat=m_pol)
    b_cut = bool_subtract(blank, [fp_bore, notch])
    return finish_part(join_objects([b_cut, collar, ext], "win94_breech_bolt"), sharp_deg=34.0)


def build_win94_firing_pin(mats):
    m_ss = mats["M_Stainless"]
    pin = mk_lathe_x(
        "w94_fp_shaft",
        [
            (0.0, -4.55), (0.24, -4.55), (0.26, -4.45), (0.26, -3.55),
            (0.14, -3.45), (0.14, 2.80), (0.075, 4.35), (0.035, 4.55), (0.0, 4.58),
        ],
        segs=20, mat=m_ss,
    )
    lug = mk_box("w94_fp_lug", 0.85, 0.42, 0.24, [("t", -3.20, -0.14, 0.0)], mat=m_ss, bevel=0.02)
    return finish_part(join_objects([pin, lug], "win94_firing_pin"), sharp_deg=34.0)


def build_win94_locking_bolt(mats):
    m_ch, m_pol = mats["M_CaseHardened"], mats["M_PolishedSteel"]
    blk = mk_extrude_z("w94_lb", [(-0.78, -1.55), (0.78, -1.55), (0.82, 0.55), (0.65, 1.48), (-0.65, 1.48), (-0.78, 0.95)], -0.81, 0.81, bevel=0.04, mat=m_ch)
    clr = mk_box("c_lb_clr", 2.20, 0.78, 0.62, [("t", 0.0, 0.15, 0.0)], mat=m_pol)
    hole = mk_cyl("c_lb_hole", 0.24, 0.24, 2.00, axis="z", segs=16, xform=[("t", 0.0, -1.05, 0.0)], mat=m_pol)
    res = bool_subtract(blk, [clr, hole])
    res.name = "win94_locking_bolt"
    res.data.name = "win94_locking_bolt"
    return finish_part(res, sharp_deg=34.0)


def build_win94_lever(mats):
    m_ch, m_blued = mats["R_CaseHardened"], mats["R_RoyalBlued"]
    # Authentic John Browning Model 1894 swept curved oval finger-lever loop (`assembledPos=(0.80, -1.65, 0)`)!
    # Forward pivot knuckle & locking-bolt camming tongue
    pivot_head = mk_cyl("w94_lev_pv", 0.62, 0.62, 0.96, axis="z", segs=24, xform=[("t", 0.0, 0.02, 0.0)], mat=m_ch, bevel=0.05)
    cam_tongue = mk_extrude_z("w94_lev_cam", [(-0.72, -0.25), (0.64, -0.25), (0.58, 0.85), (-0.42, 0.92), (-0.85, 0.32)], -0.38, 0.38, bevel=0.04, mat=m_blued)
    # Continuous smooth cubic-Bezier swept D-loop:
    # Front neck along receiver belly -> sweeping down ahead of trigger (`x=-5.6`) -> curved bottom finger bar
    # under trigger (`x=-8.0, y=-3.05`) -> rounded Western heel loop (`x=-13.85`) -> upper rear tang kissing
    # underside of straight wrist & pressing tang safety (`x=-9.2`)!
    loop_pts = (
        [(0.0, -0.06)]
        + sample_cubic_bezier((0.0, -0.06), (-2.10, -0.20), (-4.20, -0.28), (-5.45, -0.45), steps=12)
        + sample_cubic_bezier((-5.45, -0.45), (-5.78, -1.55), (-6.10, -2.72), (-7.45, -2.98), steps=16)
        + sample_cubic_bezier((-7.45, -2.98), (-9.60, -3.18), (-11.65, -3.22), (-12.95, -3.02), steps=14)
        + sample_cubic_bezier((-12.95, -3.02), (-14.12, -2.75), (-14.18, -1.55), (-12.75, -1.04), steps=18)
        + sample_cubic_bezier((-12.75, -1.04), (-11.35, -0.72), (-9.85, -0.48), (-8.65, -0.20), steps=12)
    )
    swept_loop = mk_swept_bow(
        "w94_lev_bow",
        loop_pts,
        lambda t: 0.34 - 0.07 * _smoothstep_f(0.14, 0.30, t) + 0.04 * _smoothstep_f(0.55, 0.72, t) - 0.04 * _smoothstep_f(0.84, 1.0, t),
        lambda t: 0.48 - 0.04 * _smoothstep_f(0.20, 0.85, t),
        sec_n=24, super_exp=0.68, mat=m_ch,
    )
    # Small tang-safety actuator lug on upper rear lever bar (`x = -9.2`)
    saf_boss = mk_box("w94_lev_sb", 0.92, 0.42, 0.62, [("t", -9.20, -0.20, 0.0)], mat=m_blued, bevel=0.05)
    lever_u = bool_union([pivot_head, swept_loop, cam_tongue, saf_boss], "win94_lever")
    return finish_part(lever_u, sharp_deg=36.0)


def build_win94_link(mats):
    m_blued = mats["R_RoyalBlued"]
    body = mk_extrude_z("w94_lnk", [(-2.35, -0.42), (2.45, -0.35), (2.55, 0.48), (1.25, 0.65), (-1.85, 0.45), (-2.45, -0.05)], -0.62, 0.62, bevel=0.05, mat=m_blued)
    slot = mk_box("c_lnk_s", 3.40, 0.48, 0.46, [("t", 0.10, 0.45, 0.0)], mat=m_blued)
    res = bool_subtract(body, [slot])
    res.name = "win94_link"
    res.data.name = "win94_link"
    return finish_part(res, sharp_deg=34.0)


def build_win94_receiver(mats):
    m_blue, m_dark, m_iron = mats["R_RoyalBlued"], mats["R_InnerDark"], mats["R_SaddleIron"]
    # Crisp milled flat-sided Model 1894 forged receiver (`X in [-6.10, +6.10]`, Hero UV flanks planar!)
    outer = mk_box("w94_rec", 12.20, 4.10, 2.80, None, mat=m_blue, bevel=0.13, bevel_segs=3)
    # Smoothly contoured upper & lower straight-grip wrist tangs mating flush onto walnut stock!
    utang_pts = (
        [(-5.40, 0.45), (-5.40, 1.18)]
        + sample_quad_bezier((-5.40, 1.18), (-8.40, 0.98), (-11.35, 0.56), steps=12)
        + sample_quad_bezier((-11.35, 0.56), (-11.75, 0.42), (-11.30, 0.24), steps=6)
        + sample_quad_bezier((-11.30, 0.24), (-8.40, 0.42), (-5.40, 0.45), steps=12)
    )
    utang = mk_extrude_z("w94_rec_ut", utang_pts, -0.72, 0.72, bevel=0.06, bevel_segs=2, mat=m_blue)
    ltang_pts = (
        [(-5.40, -2.02), (-5.40, -1.20)]
        + sample_quad_bezier((-5.40, -1.20), (-8.80, -1.56), (-12.05, -2.08), steps=12)
        + sample_quad_bezier((-12.05, -2.08), (-12.35, -2.28), (-11.90, -2.44), steps=6)
        + sample_quad_bezier((-11.90, -2.44), (-8.80, -2.18), (-5.40, -2.02), steps=12)
    )
    ltang = mk_extrude_z("w94_rec_lt", ltang_pts, -0.78, 0.78, bevel=0.07, bevel_segs=2, mat=m_blue)
    # Front receiver barrel-ring & mag-tube shoulder collar
    bbl_ring = mk_cyl("w94_rec_br", 1.24, 1.28, 0.90, axis="x", segs=32, xform=[("t", 5.90, 1.20, 0.0)], mat=m_blue, bevel=0.06)

    top_ej = mk_box("c_rec_top", 9.20, 2.20, 1.65, [("t", 0.35, 1.45, 0.0)], mat=m_dark)
    bot_sl = mk_box("c_rec_bot", 9.40, 2.20, 1.56, [("t", 0.20, -1.50, 0.0)], mat=m_dark)
    bbl_sk = mk_cyl("c_rec_bsk", 0.95, 0.95, 3.60, axis="x", segs=24, xform=[("t", 5.50, 1.20, 0.0)], mat=m_dark)
    # Rounded stadium right-flank loading gate cutout
    l_port = mk_extrude_z("c_rec_lp", mk_stadium_2d(4.40, 1.42, 10), 0.90, 1.80, xform=[("t", 1.30, -0.15, 0.0)], mat=m_dark)
    rec = bool_subtract(join_objects([outer, utang, ltang, bbl_ring], "w94_rec_solid"), [top_ej, bot_sl, bbl_sk, l_port])
    # Flush domed receiver cross-screws & upper tang screw
    t_scr = mk_cyl("w94_rec_ts", 0.26, 0.26, 0.26, axis="y", segs=18, xform=[("t", -10.40, 0.62, 0.0)], mat=m_iron, bevel=0.04)
    pins = [
        mk_cyl(f"w94_rec_p{i}", 0.22, 0.22, 2.86, axis="z", segs=18, xform=[("t", px, py, 0.0)], mat=m_iron, bevel=0.03)
        for i, (px, py) in enumerate([(-4.70, -1.35), (1.80, -1.45), (4.65, -0.95)])
    ]
    res = join_objects([rec, t_scr, *pins], "win94_receiver")
    return finish_part(res, sharp_deg=36.0)


def build_win94_rear_sight_alias(mats):
    return build_win94_rear_sight(mats)


def build_win94_saddle_ring(mats):
    m_iron = mats["R_SaddleIron"]
    # Contoured screw-in cavalry saddle-ring staple boss + beveled collar + 40-seg forged iron ring
    collar = mk_cyl("w94_sr_col", 0.42, 0.48, 0.22, axis="z", segs=24, xform=[("t", 0.0, 0.0, 0.16)], mat=m_iron, bevel=0.04)
    stud = mk_cyl("w94_sr_stud", 0.26, 0.28, 0.56, axis="z", segs=22, mat=m_iron, bevel=0.04)
    eye_pts = [Vector((math.cos(2.0 * math.pi * i / 40) * 0.94, math.sin(2.0 * math.pi * i / 40) * 0.94 - 0.86, -0.18)) for i in range(40)]
    ring = mk_tube_along_pts("w94_sr_ring", eye_pts, 0.145, ring_segs=16, closed=True, mat=m_iron)
    return finish_part(join_objects([collar, stud, ring], "win94_saddle_ring"), sharp_deg=36.0)


def build_win94_forend(mats):
    m_wal = mats["W_WinchesterWalnut"]
    # 18-station x 36-ring organically contoured American walnut carbine forend (`X in [-16.38, +14.78]`)!
    # Rear meets receiver front face (`world X = +5.10`) flush; nose tucks cleanly into front barrel band (`world X = +36.20`)!
    N_ST = 18
    N_RING = 36
    stations = []
    for i in range(N_ST):
        u = i / (N_ST - 1)
        x = -16.38 + u * 31.16
        # Gentle organic grip swell through mid-forend tapering softly to receiver rear & barrel band nose
        swell = math.sin(math.pi * u) ** 0.72
        nose_taper = 1.0 - 0.09 * _smoothstep_f(0.84, 1.0, u)
        rz = (1.38 + 0.17 * swell) * nose_taper
        y_top = 0.98 + 0.06 * swell - 0.05 * _smoothstep_f(0.84, 1.0, u)
        y_bot = -1.26 - 0.10 * swell + 0.08 * _smoothstep_f(0.84, 1.0, u)
        yc = 0.5 * (y_top + y_bot)
        ry = 0.5 * (y_top - y_bot)
        ring = []
        for k in range(N_RING):
            th = 2.0 * math.pi * k / N_RING
            ct, st = math.cos(th), math.sin(th)
            # Authentic Winchester rounded-belly ovoid cross-section (slightly broader mid-upper palm grip)
            w_mod = 0.92 + 0.08 * math.sin(max(0.0, ct) * math.pi * 0.5)
            z = st * rz * w_mod
            y = yc + ct * ry
            ring.append((z, y))
        stations.append((x, ring))

    blank = mk_loft_x("w94_fe_b", stations, mat=m_wal)
    bbl_g = mk_cyl("c_fe_b", 0.84, 0.84, 32.8, axis="x", segs=28, xform=[("t", -0.60, 1.00, 0.0)], mat=m_wal)
    mag_c = mk_cyl("c_fe_m", 0.62, 0.62, 32.8, axis="x", segs=24, xform=[("t", -0.60, -0.80, 0.0)], mat=m_wal)
    fe = bool_subtract(blank, [bbl_g, mag_c])
    fe.name = "win94_forend"
    return finish_part(fe, sharp_deg=44.0)


def build_win94_barrel_bands(mats):
    m_blue, m_iron = mats["M_BluedSteel"], mats["M_PolishedSteel"]

    # Helper: authentic sculpted figure-8 rounded-arch Winchester Model 94 carbine barrel band!
    def _mk_fig8_band(tag: str, x_center: float, width_x: float, r_bbl_out: float, r_mag_out: float, waist_z: float, bbl_r_in: float, mag_r_in: float):
        # Smooth 40-pt figure-8 perimeter in (z, y): top arch centered at y=+0.90, bottom arch at y=-0.90
        pts_zy = []
        n_arc = 18
        for k in range(n_arc + 1):
            a = -0.18 * math.pi + 1.36 * math.pi * (k / n_arc)  # right -> top -> left
            z = r_bbl_out * math.cos(a)
            y = 0.90 + r_bbl_out * math.sin(a)
            pts_zy.append((z, y))
        # Left gentle waist curve
        pts_zy.append((-waist_z, 0.0))
        for k in range(n_arc + 1):
            a = 0.82 * math.pi + 1.36 * math.pi * (k / n_arc)  # left -> bottom -> right
            z = r_mag_out * math.cos(a)
            y = -0.90 + r_mag_out * math.sin(a)
            pts_zy.append((z, y))
        pts_zy.append((waist_z, 0.0))

        # Slight crown/chamfer along X edges so specular light catches rounded milled band edges!
        hx = width_x * 0.5
        ch = 0.14
        def _scale_ring(s: float):
            return [(z * s, y * (0.985 + 0.015 * s)) for (z, y) in pts_zy]

        band_blank = mk_loft_x(
            f"{tag}_body",
            [
                (x_center - hx,      _scale_ring(0.94)),
                (x_center - hx + ch, _scale_ring(1.00)),
                (x_center + hx - ch, _scale_ring(1.00)),
                (x_center + hx,      _scale_ring(0.94)),
            ],
            mat=m_blue,
        )
        h1 = mk_cyl(f"c_{tag}_1", bbl_r_in, bbl_r_in, width_x + 0.60, axis="x", segs=28, xform=[("t", x_center,  0.90, 0.0)], mat=m_blue)
        h2 = mk_cyl(f"c_{tag}_2", mag_r_in, mag_r_in, width_x + 0.60, axis="x", segs=24, xform=[("t", x_center, -0.90, 0.0)], mat=m_blue)
        band = bool_subtract(band_blank, [h1, h2])
        # Recessed slotted clamping cross-screw boss on lower belly
        scr = mk_cyl(f"{tag}_scr", 0.24, 0.24, waist_z * 2.15, axis="z", segs=20, xform=[("t", x_center, -0.18, 0.0)], mat=m_iron, bevel=0.04)
        return [band, scr]

    # 1. Rear forend-nose carbine barrel band (`world X = 36.20`, hugging walnut forend nose cleanly!)
    rear_band = _mk_fig8_band("w94_bb_rear", 0.0, 2.35, r_bbl_out=1.18, r_mag_out=1.08, waist_z=1.34, bbl_r_in=0.75, mag_r_in=0.58)
    # 2. Forward muzzle carbine barrel band (`world X = 52.00`, clamping barrel & mag tube ahead of forend!)
    front_band = _mk_fig8_band("w94_bb_fwd", 15.80, 1.55, r_bbl_out=1.02, r_mag_out=0.88, waist_z=0.72, bbl_r_in=0.73, mag_r_in=0.58)
    return finish_part(join_objects([*rear_band, *front_band], "win94_barrel_bands"), sharp_deg=36.0)


def _win94_stock_cross_section(x: float, n_ring: int = 36, scale_z: float = 1.0, scale_y: float = 1.0) -> list[tuple[float, float]]:
    """Shared mathematically exact Pre-64 Winchester 1894 straight-grip buttstock cross-section in stock local coords."""
    # Rear butt x = -15.00 (`world X = -37.50`), front receiver shoulder x = +15.42 (`world X = -7.08`)
    # Smooth Western comb arch -> graceful comb nose drop -> slender oval straight wrist -> flush receiver shoulder
    t_comb = _smoothstep_f(-15.0, 4.5, x)
    t_wrist = _smoothstep_f(4.5, 12.2, x)
    t_rec = _smoothstep_f(11.8, 15.42, x)

    y_top = 2.02 + 0.72 * t_comb + 0.42 * t_wrist + 0.28 * t_rec
    # Sweeping classic straight-grip carbine toe/belly -> slim straight wrist -> receiver bottom (+0.78)
    y_bot = (
        -5.62
        + 3.92 * _smoothstep_f(-15.0, 5.2, x)
        + 2.06 * _smoothstep_f(5.0, 11.8, x)
        + 0.42 * _smoothstep_f(11.6, 15.42, x)
    )
    # Slim Western silhouette: rounded butt (`1.46`) -> slender oval wrist (`1.12`) -> flush receiver width (`1.36`)
    hw = (
        1.46
        + 0.04 * math.sin(math.pi * _smoothstep_f(-15.0, 2.0, x))
        - 0.34 * _smoothstep_f(1.0, 11.0, x)
        + 0.24 * _smoothstep_f(12.2, 15.42, x)
    ) * scale_z

    yc = 0.5 * (y_top + y_bot)
    ry = max(0.38, 0.5 * (y_top - y_bot)) * scale_y
    # Teardrop comb taper at butt smoothly transitioning to oval wrist & flat-flanked receiver shoulder!
    top_taper = 0.62 + 0.24 * t_wrist + 0.12 * t_rec
    super_p = 1.0 - 0.24 * t_rec  # slightly squarer superellipse right at flat-sided receiver junction!

    ring = []
    for k in range(n_ring):
        th = 2.0 * math.pi * k / n_ring
        ct, st = math.cos(th), math.sin(th)
        w_mod = top_taper + (1.0 - top_taper) * _smoothstep_f(0.95, -0.25, ct)
        z = math.copysign(abs(st) ** super_p, st) * hw * w_mod
        y = yc + math.copysign(abs(ct) ** super_p, ct) * ry
        ring.append((z, y))
    return ring


def build_win94_walnut_stock(mats):
    m_wal = mats["W_WinchesterWalnut"]
    # 28-station x 36-ring organically lofted American black walnut straight-grip Western carbine buttstock!
    N_ST = 28
    stations = []
    for i in range(N_ST):
        u = i / (N_ST - 1)
        x = -15.00 + u * 30.42
        stations.append((x, _win94_stock_cross_section(x, n_ring=36)))

    blank = mk_loft_x("w94_stk_b", stations, mat=m_wal)
    # Crisp flush upper & lower tang inletting mortises (`world X in [-12.5, -7.1]` -> `stock local x in [+10.0, +15.6]`)
    um = mk_box("c_stk_um", 5.80, 0.65, 1.48, [("rz", 0.08), ("t", 12.80, 3.32, 0.0)], mat=m_wal)
    lm = mk_box("c_stk_lm", 6.20, 0.72, 1.60, [("rz", 0.09), ("t", 12.60, 0.56, 0.0)], mat=m_wal)
    stk = bool_subtract(blank, [um, lm])
    stk.name = "win94_walnut_stock"
    return finish_part(stk, sharp_deg=44.0)


def build_win94_buttplate(mats):
    m_blue, m_iron = mats["R_RoyalBlued"], mats["R_SaddleIron"]
    # Iconic curved crescent steel Winchester carbine buttplate lofted directly from the exact rear stock oval!
    # Stock assembledPos = (-22.50, -2.55, 0), buttplate assembledPos = (-38.40, -4.15, 0)
    # Offset stock -> buttplate: dx = +15.90, dy = +1.60 (so stock x=-15.00 maps to bp_x=+0.90, stock y maps to y+1.60!)
    N_RING = 36
    base_ring = [(z, y + 1.60) for (z, y) in _win94_stock_cross_section(-15.00, n_ring=N_RING)]

    # Build curved crescent steel shell with concave shoulder profile (horns at heel/toe hook back to bp_x = -0.56,
    # hollow center scoops smoothly forward to bp_x = +0.20, front lip wraps flush over walnut at bp_x = +0.90..+1.10!)
    bm = bmesh.new()
    slices = [
        # (x_base, cup_amp, sz, sy)
        (-0.56, 0.72, 0.88, 0.96),   # Rear crescent bevel rim
        (-0.46, 0.70, 1.015, 1.01),  # Outer crescent ridge
        ( 0.88, 0.06, 1.032, 1.018), # Flush walnut mating shoulder
        ( 1.12, 0.00, 1.026, 1.014), # Steel wrap lip hugging walnut rear perimeter
        ( 1.16, 0.00, 0.980, 0.990), # Clean inward bevel return
    ]
    rings = []
    yc = 0.5 * (max(p[1] for p in base_ring) + min(p[1] for p in base_ring))
    ry = max(0.1, 0.5 * (max(p[1] for p in base_ring) - min(p[1] for p in base_ring)))
    for x_b, cup_amp, sz, sy in slices:
        ring = []
        for (z0, y0) in base_ring:
            yn = max(-1.0, min(1.0, (y0 - yc) / ry))  # +1 heel, -1 toe
            x_v = x_b + cup_amp * (1.0 - yn * yn)
            y_v = yc + (y0 - yc) * sy
            z_v = z0 * sz
            ring.append(bm.verts.new((x_v, y_v, z_v)))
        rings.append(ring)
    for s in range(len(rings) - 1):
        a, b = rings[s], rings[s + 1]
        for k in range(N_RING):
            kn = (k + 1) % N_RING
            bm.faces.new((a[k], b[k], b[kn], a[kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    shell = _bm_to_obj("w94_bp_shell", bm, m_blue)

    # Iconic Winchester curved upper heel comb tang wrapping 2.4 cm forward over walnut comb (`bp_x in [+0.80, +3.35]`)
    tang_pts = [(0.70, 3.35), (0.70, 3.68)] + sample_quad_bezier((0.70, 3.68), (2.05, 3.74), (3.35, 3.72), steps=10) + [(3.20, 3.48), (0.80, 3.35)]
    heel_tang = mk_extrude_z("w94_bp_ht", tang_pts, -0.78, 0.78, bevel=0.06, bevel_segs=2, mat=m_blue)
    # Twin countersunk slotted steel buttplate screws (upper heel tang + lower crescent toe)
    scr_top = mk_cyl("w94_bp_st", 0.24, 0.24, 0.26, axis="y", segs=18, xform=[("t", 2.15, 3.66, 0.0)], mat=m_iron, bevel=0.03)
    scr_bot = mk_cyl("w94_bp_sb", 0.25, 0.25, 0.26, axis="x", segs=18, xform=[("t", -0.24, -2.65, 0.0)], mat=m_iron, bevel=0.03)
    return finish_part(join_objects([shell, heel_tang, scr_top, scr_bot], "win94_buttplate"), sharp_deg=40.0)


def build_win94_hammer(mats):
    m_blue = mats["M_BluedSteel"]
    # Classic sculpted curved external Winchester Model 94 spur hammer w/ rounded thumb crest & 6 grip serrations!
    hm_pts = (
        [(-0.48, -0.58), (0.56, -0.58)]
        + sample_quad_bezier((0.56, -0.58), (0.72, 0.45), (0.62, 1.48), steps=10)
        + sample_quad_bezier((0.62, 1.48), (0.42, 2.28), (-0.08, 2.46), steps=10)
        + sample_quad_bezier((-0.08, 2.46), (-0.95, 2.58), (-1.62, 2.42), steps=10)
        + sample_quad_bezier((-1.62, 2.42), (-1.66, 2.02), (-1.22, 1.90), steps=8)
        + sample_quad_bezier((-1.22, 1.90), (-0.52, 1.78), (-0.36, 1.45), steps=8)
        + [(-0.48, -0.58)]
    )
    hm = mk_extrude_z("w94_hm_b", hm_pts, -0.44, 0.44, bevel=0.05, bevel_segs=2, mat=m_blue)
    # 6 crisp cross-serrations along upper thumb spur crest
    serrs = [
        mk_box(f"w94_hm_s{k}", 0.14, 0.12, 0.84, [("rz", -0.10), ("t", -1.42 + k * 0.22, 2.49 + 0.015 * math.sin(k * 0.6), 0.0)], mat=m_blue, bevel=0.015)
        for k in range(6)
    ]
    return finish_part(join_objects([hm, *serrs], "win94_hammer"), sharp_deg=36.0)


def build_win94_trigger(mats):
    m_blue = mats["M_BluedSteel"]
    top = mk_extrude_z("w94_tr_top", [(-0.52, -0.25), (0.65, -0.25), (0.65, 1.15), (-0.45, 1.15)], -0.28, 0.28, bevel=0.04, mat=m_blue)
    shoe_pts = sample_cubic_bezier((0.08, -0.10), (-0.08, -0.78), (0.04, -1.42), (0.48, -1.92), steps=16, include_start=True)
    shoe = mk_swept_bow("w94_tr_shoe", shoe_pts, lambda t: 0.22 - 0.04 * t, lambda t: 0.22, sec_n=16, super_exp=0.60, mat=m_blue)
    return finish_part(bool_union([top, shoe], "win94_trigger"), sharp_deg=36.0)


def build_win94_tang_safety(mats):
    m_ss = mats["M_Stainless"]
    body = mk_box("w94_ts_b", 2.20, 0.58, 0.68, None, mat=m_ss, bevel=0.04)
    tab = mk_box("w94_ts_t", 0.75, 0.72, 0.52, [("t", -0.62, -0.35, 0.0)], mat=m_ss, bevel=0.03)
    return finish_part(join_objects([body, tab], "win94_tang_safety"), sharp_deg=34.0)


def build_win94_mag_tube(mats):
    m_blue, m_iron = mats["M_BluedSteel"], mats["M_PolishedSteel"]
    # Full-length blued tubular magazine w/ beveled crowned end-plug & barrel hanger lug
    tube = mk_lathe_x(
        "w94_mt_t",
        [
            (0.48, -24.80), (0.58, -24.80), (0.58, 24.30), (0.65, 24.38),
            (0.65, 24.72), (0.54, 24.86), (0.28, 24.92), (0.00, 24.92),
            (0.00, 23.75), (0.48, 23.75), (0.48, -24.80),
        ],
        segs=32, mat=m_blue,
    )
    plug_scr = mk_cyl("w94_mt_ps", 0.16, 0.16, 0.18, axis="x", segs=16, xform=[("t", 24.92, 0.0, 0.0)], mat=m_iron, bevel=0.02)
    hanger = mk_box("w94_mt_hg", 1.20, 1.30, 0.52, [("t", 23.40, 0.95, 0.0)], mat=m_blue, bevel=0.04)
    return finish_part(join_objects([tube, plug_scr, hanger], "win94_mag_tube"), sharp_deg=36.0)


def build_win94_mag_follower(mats):
    m_brass = mats["M_Brass"]
    fol = mk_lathe_x(
        "win94_mag_follower",
        [(0.0, -1.35), (0.46, -1.35), (0.49, -1.20), (0.49, 1.15), (0.44, 1.32), (0.0, 1.32)],
        segs=24, mat=m_brass,
    )
    return finish_part(fol, sharp_deg=36.0)


def build_win94_loading_gate(mats):
    m_blue, m_iron = mats["R_RoyalBlued"], mats["R_SaddleIron"]
    # Contoured King's patent rounded stadium loading gate cover w/ recessed thumb bevel & mounting screw
    gate = mk_extrude_z("w94_lg_g", mk_stadium_2d(4.32, 1.36, 10), -0.12, 0.12, bevel=0.04, bevel_segs=2, mat=m_blue)
    tang = mk_box("w94_lg_t", 1.20, 0.52, 0.18, [("t", 2.18, 0.12, -0.10)], mat=m_blue, bevel=0.03)
    scr = mk_cyl("w94_lg_s", 0.18, 0.18, 0.28, axis="z", segs=16, xform=[("t", 1.75, 0.0, 0.04)], mat=m_iron, bevel=0.03)
    return finish_part(join_objects([gate, tang, scr], "win94_loading_gate"), sharp_deg=36.0)


def build_win94_carrier(mats):
    m_brass = mats["M_Brass"]
    base = mk_extrude_z("w94_car_b", [(-3.10, -0.45), (3.40, -0.45), (3.50, 0.38), (-2.80, 0.52)], -0.69, 0.69, bevel=0.04, mat=m_brass)
    trough = mk_box("c_car_tr", 5.60, 0.55, 0.88, [("t", 0.40, 0.35, 0.0)], mat=m_brass)
    car = bool_subtract(base, [trough])
    car.name = "win94_carrier"
    return finish_part(car, sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & Zero-Bleed Atlas Allocation
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


def unwrap_walnut_atlas(walnut_objs):
    def classify(on, f, mn):
        if on == "win94_walnut_stock":
            nz = -f.normal.y
            tz = -f.calc_center_median().y
            if nz < -0.52 and tz < -0.25:
                return "HERO_LEFT"
            if nz > 0.52 and tz > 0.25:
                return "HERO_RIGHT"
        return "PACK"

    _smart_unwrap_and_pack_rect(walnut_objs, 0.010, 0.990, 0.010, 0.350, lambda on, f, mn: classify(on, f, mn) == "PACK", "walnut_pack")
    stk = next(o for o in walnut_objs if o.name == "win94_walnut_stock")
    bm = bmesh.new()
    bm.from_mesh(stk.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cls = classify("win94_walnut_stock", f, "")
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-15.0)) / 30.45))
            yn = max(0.0, min(1.0, (vco.z - (-5.7)) / 9.30))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.680 + yn * 0.305)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.365 + yn * 0.300)
    bm.to_mesh(stk.data)
    bm.free()


def unwrap_receiver_atlas(recv_objs):
    def classify(on, f, mn):
        if on == "win94_receiver":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            nz = -n.y
            if -6.10 <= tx <= 6.10 and -2.05 <= ty <= 2.05:
                if nz < -0.78 and tz < -1.10:
                    return "HERO_LEFT"
                if nz > 0.78 and tz > 1.10:
                    return "HERO_RIGHT"
            return "PACK_REC"
        return "PACK_HW"

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.560, 0.010, 0.505, lambda on, f, mn: classify(on, f, mn) == "PACK_REC", "recv_rest")
    _smart_unwrap_and_pack_rect(recv_objs, 0.575, 0.990, 0.010, 0.505, lambda on, f, mn: classify(on, f, mn) == "PACK_HW", "recv_hw")
    rec = next(o for o in recv_objs if o.name == "win94_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cls = classify("win94_receiver", f, "")
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-6.10)) / 12.20))
            yn = max(0.0, min(1.0, (vco.z - (-2.05)) / 4.10))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.765 + yn * 0.220)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.525 + yn * 0.220)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_metal_atlas(metal_objs):
    ext_set = {"win94_barrel", "win94_front_sight", "win94_rear_sight", "win94_barrel_bands", "win94_mag_tube", "win94_hammer", "win94_trigger"}
    act_set = {"win94_breech_bolt", "win94_firing_pin", "win94_locking_bolt", "win94_tang_safety"}

    def classify(on, f, mn):
        if mn == "M_Brass" or on in ("win94_carrier", "win94_mag_follower"):
            return "BRASS"
        if on == "win94_barrel" and mn == "M_BluedSteel":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            ny, nz = n.z, -n.y
            if -21.5 <= tx <= 12.0 and nz < -0.35 and ny > 0.20 and tz < -0.20:
                return "HERO_BBL"
        if on in ext_set:
            return "Z1"
        if on in act_set:
            return "Z2"
        return "BRASS"

    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.990, 0.435, 0.798, lambda on, f, mn: classify(on, f, mn) == "Z1", "metal_z1")
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.580, 0.010, 0.415, lambda on, f, mn: classify(on, f, mn) == "Z2", "metal_z2")
    _smart_unwrap_and_pack_rect(metal_objs, 0.600, 0.990, 0.010, 0.415, lambda on, f, mn: classify(on, f, mn) == "BRASS", "metal_brass")

    bbl = next(o for o in metal_objs if o.name == "win94_barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bbl.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify("win94_barrel", f, mn) != "HERO_BBL":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            xn = max(0.0, min(1.0, (tx - (-21.5)) / 33.5))
            ang = math.atan2(ty, max(0.001, -tz))
            an = max(0.0, min(1.0, (ang - (-0.35)) / 1.50))
            loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.815 + an * 0.170)
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
        o.location = (0.0, i * 140.0, 0.0)
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
            o.location = (0.0, 500.0, 0.0)


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
        "win94_forend":        build_win94_forend,
        "win94_walnut_stock":  build_win94_walnut_stock,
        "win94_receiver":      build_win94_receiver,
        "win94_loading_gate":  build_win94_loading_gate,
        "win94_saddle_ring":   build_win94_saddle_ring,
        "win94_lever":         build_win94_lever,
        "win94_link":          build_win94_link,
        "win94_buttplate":     build_win94_buttplate,
        "win94_barrel":        build_win94_barrel,
        "win94_front_sight":   build_win94_front_sight,
        "win94_rear_sight":    build_win94_rear_sight,
        "win94_barrel_bands":  build_win94_barrel_bands,
        "win94_breech_bolt":   build_win94_breech_bolt,
        "win94_firing_pin":    build_win94_firing_pin,
        "win94_locking_bolt":  build_win94_locking_bolt,
        "win94_hammer":        build_win94_hammer,
        "win94_trigger":       build_win94_trigger,
        "win94_tang_safety":   build_win94_tang_safety,
        "win94_mag_tube":      build_win94_mag_tube,
        "win94_mag_follower":  build_win94_mag_follower,
        "win94_carrier":       build_win94_carrier,
    }
    print("[BUILD] Sculpting all 21 solid Winchester Model 1894 (.30-30 Win) parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}
    walnut_objs = [built[pid] for pid in WALNUT_PARTS]
    recv_objs   = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs  = [built[pid] for pid in METAL_PARTS]
    all_objs    = walnut_objs + recv_objs + metal_objs

    verify_meshes(all_objs)
    unwrap_walnut_atlas(walnut_objs)
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("walnut", walnut_objs), ("receiver", recv_objs), ("metal", metal_objs)):
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

    with tempfile.TemporaryDirectory(prefix="win94_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir, (0.09, 0.035, 0.015, 1.0))
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, (0.04, 0.05, 0.08, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.04, 0.05, 0.08, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "win94_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "win94_v3_walnut_normal.webp",
        TEX_OUT_DIR / "win94_v3_walnut_roughness.webp",
        TEX_OUT_DIR / "win94_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "win94_v3_receiver_normal.webp",
        TEX_OUT_DIR / "win94_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "win94_v3_metal_albedo.webp",
        TEX_OUT_DIR / "win94_v3_metal_normal.webp",
        TEX_OUT_DIR / "win94_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== WINCHESTER 1894 COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 12.0


if __name__ == "__main__":
    main()
