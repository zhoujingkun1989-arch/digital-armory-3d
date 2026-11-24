#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Remington Model 870 Police Magnum (12 Gauge)
============================================================================================
MIT License — Digital Armory 3D (`WP-25b`)

Generates:
  - public/models/rem870.glb (Draco-compressed glTF 2.0, all 21 solid parts; skips ONLY the 3
    dynamically GPU-compressed `aSpringParam` springs: `rem870_hammer_spring`,
    `rem870_firing_pin_spring`, `rem870_mag_spring`)
  - public/textures/rem870_v3_walnut_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM, 0 alpha)
  - public/textures/rem870_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/rem870_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)
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
# MODE 2: System Python Post-Process (Ilion NY Rollmarks, 870 Police Magnum,
#         Serial No., Rubber Pad Ribbing, Barrel Markings, RNM Blend & ORM)
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
    FONT_SERIF_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
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

    # =========================================================================
    # SUITE 1: rem870_v3_walnut (12-groove Corn-Cob Forend, Walnut Stock & Rubber Buttpad)
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
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.30, 1.0).astype(np.float32)

        # Subtle pressed Remington Police acceptance mark on right buttstock wrist (v in [0.410, 0.685])
        CW, CH = 3000, 900
        stamp_r = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(stamp_r)
        dr.ellipse((CW * 0.71 - 44, CH * 0.30 - 44, CW * 0.71 + 44, CH * 0.30 + 44), outline=235, width=6)
        dr.text((CW * 0.71, CH * 0.30), "R", fill=245, font=_load_font(FONT_SERIF_BOLD, 56), anchor="mm")

        stamp_map = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(stamp_map, stamp_r, 0.015, 0.985, 0.410, 0.685)
        stamp_d = ndimage.gaussian_filter(stamp_map, sigma=0.7) * 0.58

        albedo *= 1.0 - 0.28 * stamp_d[..., None]
        _mix(rgh, 0.66, stamp_d * 0.65)
        ao *= 1.0 - 0.28 * stamp_d
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.50 * stamp_d, strength=4.0))

        rgh = np.clip(rgh, 0.24, 0.90)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "rem870_v3_walnut_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "rem870_v3_walnut_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "rem870_v3_walnut_roughness.webp", 93)
        print("[POST] Saved rem870_v3_walnut_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: rem870_v3_receiver (Billet Receiver, FCG Plate, Trigger, Action Bars, Mag Tube/Cap)
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

        # Billet receiver spans local X in [-8.30, +8.30], Y in [-2.325, +2.325] (16.60 x 4.65 cm)
        CW, CH = 3652, 1023

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - (-2.325)) / 4.65) * CH))

        def xw_to_cx_r(xw: float) -> int:
            return int(round((xw - (-8.30)) / 16.60 * CW))

        def xw_to_cx_l(xw: float) -> int:
            return int(round((1.0 - (xw - (-8.30)) / 16.60 * 1.0) * CW))

        engr_w = np.zeros((h, w), dtype=np.float32)

        # Left Billet Flank: Remington 870 Police Magnum + Serial AB419820M
        l_img = Image.new("L", (CW, CH), 0)
        dl = ImageDraw.Draw(l_img)
        dl.text((xw_to_cx_l(5.6), yw_to_cy(1.22)), "Remington", fill=255, font=_load_font(FONT_SERIF_BOLD, 104))
        dl.text((xw_to_cx_l(5.4), yw_to_cy(0.45)), "870 POLICE MAGNUM  12 GA.", fill=248, font=_load_font(FONT_DIN, 74))
        dl.text((xw_to_cx_l(5.4), yw_to_cy(-0.42)), "SER.  AB419820M", fill=244, font=_load_font(FONT_DIN, 68))
        _paste_uv_band(engr_w, l_img, 0.015, 0.985, 0.765, 0.985)

        # Right Billet Flank (clear below 3" ejection port!): Ilion, N.Y. rollmark
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        dr.text((xw_to_cx_r(-6.8), yw_to_cy(0.18)), "REMINGTON ARMS COMPANY, LLC  ILION, NY", fill=250, font=_load_font(FONT_COND, 68))
        dr.text((xw_to_cx_r(-6.8), yw_to_cy(-0.55)), '2 3/4" OR 3" SHELLS  -  READ OWNERS MANUAL', fill=236, font=_load_font(FONT_COND, 56))
        _paste_uv_band(engr_w, r_img, 0.015, 0.985, 0.525, 0.745)

        silver = ndimage.gaussian_filter(engr_w, sigma=0.5) * 0.58
        _mix(albedo, (0.68, 0.72, 0.77), silver * 0.44)
        _mix(rgh, 0.25, silver * 0.42)
        ao *= 1.0 - 0.34 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.52 * engr_w, strength=4.5))
        rgh = np.clip(rgh, 0.14, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "rem870_v3_receiver_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "rem870_v3_receiver_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "rem870_v3_receiver_roughness.webp", 93)
        print("[POST] Saved rem870_v3_receiver_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: rem870_v3_metal (18" Barrel, Sights, Hard-Chrome Bolt & Carrier, Orange Follower)
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

        BW, BH = 4200, 420
        b_img = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_img)
        db.text((BW * 0.52, BH * 0.32), '12 GA.  -  FOR 2 3/4" OR 3" SHELLS', fill=255, font=_load_font(FONT_DIN, 78), anchor="mm")
        db.text((BW * 0.52, BH * 0.68), '18" IMP. CYL.  REMINGTON ARMS CO. ILION, N.Y.', fill=240, font=_load_font(FONT_COND, 62), anchor="mm")

        roll_w = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(roll_w, b_img, 0.015, 0.985, 0.820, 0.985)
        silver_r = ndimage.gaussian_filter(roll_w, sigma=0.5) * 0.60
        _mix(albedo, (0.72, 0.75, 0.80), silver_r * 0.42)
        _mix(rgh, 0.24, silver_r * 0.42)
        ao *= 1.0 - 0.34 * roll_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.54 * roll_w, strength=4.6))
        rgh = np.clip(rgh, 0.11, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "rem870_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "rem870_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "rem870_v3_metal_roughness.webp", 93)
        print("[POST] Saved rem870_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

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
MODELS_OUT = REPO_ROOT / "public" / "models" / "rem870.glb"
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
    "rem870_forend",
    "rem870_walnut_stock",
    "rem870_buttplate",
]

RECEIVER_PARTS = [
    "rem870_receiver",
    "rem870_trigger_plate",
    "rem870_trigger",
    "rem870_action_release",
    "rem870_action_bars",
    "rem870_mag_tube",
    "rem870_mag_cap",
]

METAL_PARTS = [
    "rem870_barrel",
    "rem870_front_sight",
    "rem870_rear_sight",
    "rem870_slide_block",
    "rem870_breech_bolt",
    "rem870_locking_block",
    "rem870_firing_pin",
    "rem870_hammer",
    "rem870_stock_bolt",
    "rem870_mag_follower",
    "rem870_shell_carrier",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "rem870_forend",
    "rem870_walnut_stock",
    "rem870_buttplate",
    "rem870_receiver",
    "rem870_trigger_plate",
    "rem870_trigger",
    "rem870_action_release",
    "rem870_action_bars",
    "rem870_mag_tube",
    "rem870_mag_cap",
    "rem870_barrel",
    "rem870_front_sight",
    "rem870_rear_sight",
}

ASSEMBLED_POS = {
    "rem870_barrel":         ( 30.75,  1.35,  0.00),
    "rem870_front_sight":    ( 51.80,  2.55,  0.00),
    "rem870_rear_sight":     ( -4.50,  2.70,  0.00),
    "rem870_forend":         ( 23.20, -1.25,  0.00),
    "rem870_action_bars":    ( 14.20, -0.25,  0.00),
    "rem870_slide_block":    (  2.20,  0.35,  0.00),
    "rem870_breech_bolt":    (  3.60,  1.35,  0.00),
    "rem870_locking_block":  (  6.40,  1.52,  0.00),
    "rem870_firing_pin":     (  3.20,  1.35,  0.00),
    "rem870_receiver":       (  0.50,  0.15,  0.00),
    "rem870_walnut_stock":   (-22.80, -2.55,  0.00),
    "rem870_buttplate":      (-38.80, -3.95,  0.00),
    "rem870_stock_bolt":     (-22.50, -1.85,  0.00),
    "rem870_trigger_plate":  ( -2.20, -2.65,  0.00),
    "rem870_trigger":        ( -5.40, -3.15,  0.00),
    "rem870_hammer":         ( -1.40, -1.65,  0.00),
    "rem870_action_release": ( -4.60, -2.55, -1.25),
    "rem870_mag_tube":       ( 29.20, -1.25,  0.00),
    "rem870_mag_cap":        ( 50.40, -1.25,  0.00),
    "rem870_mag_follower":   ( 17.80, -1.25,  0.00),
    "rem870_shell_carrier":  ( -1.50, -1.52,  0.00),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "rem870_hammer_spring",
    "rem870_firing_pin_spring",
    "rem870_mag_spring",
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
    grain_scale: float = 48.0,
    grain_bump: float = 0.032,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 84.0,
    rough_var: float = 0.034,
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

    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = srgb_to_lin(*base_srgb)
    mix_base.inputs[7].default_value = srgb_to_lin(min(1.0, base_srgb[0] * 1.12), min(1.0, base_srgb[1] * 1.12), min(1.0, base_srgb[2] * 1.12))
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


def _build_walnut_mat(name: str = "W_PoliceWalnut") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(-3.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (0.072, 0.76, 0.62)
    nt.links.new(rot_g.outputs["Vector"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "X"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 1.08
    wave.inputs["Distortion"].default_value = 7.2
    wave.inputs["Detail"].default_value = 6.0
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.28, 3.8, 3.8)
    nt.links.new(rot_g.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.0
    n_fib.inputs["Detail"].default_value = 6.5
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    c_dark = srgb_to_lin(0.185, 0.095, 0.048)
    c_mid  = srgb_to_lin(0.365, 0.192, 0.096)
    c_warm = srgb_to_lin(0.490, 0.275, 0.145)

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
    nt.links.new(mix2.outputs[2], bsdf.inputs["Base Color"])

    # Refined hand-rubbed satin-oiled American walnut roughness (R = 0.34-0.44, never flat matte plastic!)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.34
    r_wood.inputs["To Max"].default_value = 0.43
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])
    nt.links.new(r_wood.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.13
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_fib.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        "W_PoliceWalnut": _build_walnut_mat("W_PoliceWalnut"),
        "W_RubberButtpad": _build_pbr_mat(
            "W_RubberButtpad",
            base_srgb=(0.155, 0.162, 0.172),
            roughness=0.80,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.10,
            edge_srgb=(0.25, 0.26, 0.27),
            grain_scale=68.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=92.0,
            rough_var=0.035,
        ),
        "W_WhiteSpacer": _build_pbr_mat(
            "W_WhiteSpacer",
            base_srgb=(0.935, 0.925, 0.885),
            roughness=0.36,
            metallic=0.00,
            bevel_r=0.012,
            grain_scale=32.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),
        "W_ForendSteelCap": _build_pbr_mat(
            "W_ForendSteelCap",
            base_srgb=(0.224, 0.240, 0.238),
            roughness=0.33,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.48,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=54.0,
            grain_bump=0.030,
        ),
        "R_ParkerizedBillet": _build_pbr_mat(
            "R_ParkerizedBillet",
            base_srgb=(0.220, 0.236, 0.232),
            roughness=0.36,
            metallic=0.83,
            bevel_r=0.032,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=58.0,
            grain_bump=0.036,
            aniso_stretch=(0.45, 2.8, 2.8),
            voronoi_grain=0.45,
            voronoi_scale=88.0,
        ),
        "R_AluminumFCG": _build_pbr_mat(
            "R_AluminumFCG",
            base_srgb=(0.265, 0.285, 0.312),
            roughness=0.32,
            metallic=0.80,
            bevel_r=0.026,
            edge_wear=0.45,
            grain_scale=54.0,
            grain_bump=0.028,
        ),
        "R_DarkActionSteel": _build_pbr_mat(
            "R_DarkActionSteel",
            base_srgb=(0.195, 0.208, 0.222),
            roughness=0.31,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.54,
            grain_scale=44.0,
            grain_bump=0.026,
            aniso_stretch=(3.6, 0.5, 0.5),
        ),
        "R_SafetyCrimson": _build_pbr_mat(
            "R_SafetyCrimson",
            base_srgb=(0.88, 0.08, 0.06),
            roughness=0.28,
            metallic=0.05,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.010,
        ),
        "M_ParkerizedSteel": _build_pbr_mat(
            "M_ParkerizedSteel",
            base_srgb=(0.222, 0.238, 0.234),
            roughness=0.35,
            metallic=0.84,
            bevel_r=0.028,
            edge_wear=0.50,
            edge_srgb=(0.78, 0.81, 0.84),
            grain_scale=52.0,
            grain_bump=0.034,
            aniso_stretch=(4.0, 0.5, 0.5),
            voronoi_grain=0.42,
            voronoi_scale=86.0,
        ),
        "M_DarkSteel": _build_pbr_mat(
            "M_DarkSteel",
            base_srgb=(0.192, 0.206, 0.220),
            roughness=0.32,
            metallic=0.87,
            bevel_r=0.022,
            edge_wear=0.54,
            grain_scale=42.0,
            grain_bump=0.026,
        ),
        "M_HardChrome": _build_pbr_mat(
            "M_HardChrome",
            base_srgb=(0.86, 0.89, 0.93),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.018,
            edge_wear=0.20,
            edge_srgb=(0.96, 0.98, 1.00),
            grain_scale=28.0,
            grain_bump=0.014,
            aniso_stretch=(0.40, 3.6, 3.6),
        ),
        "M_FollowerOrange": _build_pbr_mat(
            "M_FollowerOrange",
            base_srgb=(0.94, 0.35, 0.06),
            roughness=0.28,
            metallic=0.62,
            bevel_r=0.024,
            edge_wear=0.20,
            edge_srgb=(0.98, 0.58, 0.28),
            grain_scale=36.0,
            grain_bump=0.020,
        ),
        "M_WhiteTritium": _build_pbr_mat(
            "M_WhiteTritium",
            base_srgb=(0.96, 0.97, 0.98),
            roughness=0.20,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.008,
        ),
    }


# =============================================================================
# Core BMesh Modeling Toolkit
# =============================================================================
def _apply_three_xform(bm, ops):
    m = Matrix.Identity(4)
    for op in ops:
        k = op[0]
        if k == "rx":
            m = Matrix.Rotation(op[1], 4, "X") @ m
        elif k == "ry":
            m = Matrix.Rotation(op[1], 4, "Y") @ m
        elif k == "rz":
            m = Matrix.Rotation(op[1], 4, "Z") @ m
        elif k == "t":
            m = Matrix.Translation(Vector((op[1], op[2], op[3]))) @ m
        elif k == "s":
            m = Matrix.Diagonal((op[1], op[2], op[3], 1.0)) @ m
    bmesh.ops.transform(bm, matrix=T2B_MAT @ m, verts=bm.verts)


def _bm_to_obj(name: str, bm: bmesh.types.BMesh, mat=None) -> bpy.types.Object:
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
    pre = [("rx", -math.pi * 0.5)] if axis == "y" else ([("ry", math.pi * 0.5)] if axis == "x" else ([] if axis == "z" else [("ry", -math.pi * 0.5)]))
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_knurled_cyl(name: str, radius: float, length: float, axis: str = "x", flutes: int = 36, depth: float = 0.022, xform=None, mat=None):
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.025, length * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.7 - bev * 0.9),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.7 - bev * 0.9),
    ]
    rings = []
    for s_idx, (ax_pos, r_base) in enumerate(stations):
        is_end = s_idx in (0, 3)
        ring = []
        for k in range(n_pts):
            th = 2.0 * math.pi * k / n_pts
            rr = r_base if is_end else (r_base if (k % 2 == 0) else (r_base - depth))
            u, v = rr * math.cos(th), rr * math.sin(th)
            pt = (ax_pos, u, v) if axis == "x" else ((u, ax_pos, v) if axis == "y" else (u, v, ax_pos))
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


def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs, name: str):
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


def delete_objs(objs):
    for o in objs:
        if o is None:
            continue
        mesh = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def _count_non_manifold(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.free()
    return bad


def bool_subtract(target, cutters, solver: str = "EXACT"):
    if not cutters:
        return target
    for c in cutters:
        for m in c.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)
    for idx, cutter in enumerate(cutters):
        backup = target.data.copy()
        success = False
        for slv in (solver, "MANIFOLD" if solver == "EXACT" else "EXACT"):
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
            old = target.data
            target.data = backup.copy()
            bpy.data.meshes.remove(old)
        if not success:
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolF_{idx}", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup)
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


def mk_loft_z(name: str, stations: list[tuple[float, list[tuple[float, float]]]], mat=None, xform=None):
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = [[bm.verts.new((x, y, z)) for (x, y) in xy_ring] for z, xy_ring in stations]
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


def finish_part(obj, bevel_w: float = 0.0, bevel_segs: int = 2, sharp_deg: float = 36.0, weighted_normals: bool = True):
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
def build_rem870_barrel(mats):
    m_park, m_chr = mats["M_ParkerizedSteel"], mats["M_HardChrome"]
    # High-res 48-seg heavy-wall 18" Police Magnum barrel w/ smooth chamber taper & recessed muzzle crown
    tube = mk_lathe_x(
        "r870_bbl_out",
        [
            (0.925, -22.75), (0.925, 22.75), (1.12, 22.75), (1.24, 22.62), (1.26, 22.35),
            (1.27, -13.80), (1.36, -14.70), (1.46, -15.60), (1.46, -22.55), (1.36, -22.75), (0.925, -22.75),
        ],
        segs=48, mat=m_park,
    )
    # Contoured silver-soldered magazine-tube barrel guide ring + smoothly tapered mounting strut neck!
    guide = mk_cyl("r870_guide", 1.48, 1.48, 2.65, axis="x", segs=36, xform=[("t", 16.50, -2.55, 0.0)], mat=m_park, bevel=0.07)
    g_strut = mk_extrude_z("r870_gstr", [(-1.32, -1.65), (1.32, -1.65), (1.58, -0.75), (-1.58, -0.75)], -0.96, 0.96, bevel=0.10, bevel_segs=2, xform=[("t", 16.50, 0.0, 0.0)], mat=m_park)
    bore = mk_cyl("c_bbl_bore", 0.925, 0.925, 47.0, axis="x", segs=32, mat=m_chr)
    r_hole = mk_cyl("c_bbl_rh", 1.16, 1.16, 3.30, axis="x", segs=28, xform=[("t", 16.50, -2.55, 0.0)], mat=m_park)
    slot = mk_box("c_bbl_slot", 3.40, 0.72, 1.40, [("t", -21.20, 1.05, 0.0)], mat=m_park)
    res = bool_subtract(join_objects([tube, guide, g_strut], "r870_bbl_u"), [bore, r_hole, slot])
    res.name = "rem870_barrel"
    return finish_part(res, sharp_deg=36.0)


def build_rem870_front_sight(mats):
    m_park, m_white = mats["M_ParkerizedSteel"], mats["M_WhiteTritium"]
    # Contoured snag-free ramped combat front sight pedestal + beveled tritium bead blade!
    ped_pts = [(-1.18, -0.44), (1.12, -0.44), (1.02, -0.05), (-0.98, -0.05)]
    ped = mk_extrude_z("r870_fs_p", ped_pts, -0.42, 0.42, bevel=0.05, bevel_segs=2, mat=m_park)
    ramp_pts = (
        [(-1.05, -0.14), (0.98, -0.14)]
        + sample_quad_bezier((0.98, -0.14), (0.92, 0.48), (0.58, 0.86), steps=10)
        + [(0.24, 0.86)]
        + sample_quad_bezier((0.24, 0.86), (-0.36, 0.35), (-1.05, -0.14), steps=10)
    )
    body = mk_extrude_z("r870_fs_b", ramp_pts, -0.26, 0.26, bevel=0.035, bevel_segs=2, mat=m_park)
    # Recessed bright white tritium bead ring facing shooter (`-X` side of blade)
    ring_bezel = mk_cyl("r870_fs_bz", 0.21, 0.21, 0.38, axis="x", segs=22, xform=[("t", 0.36, 0.56, 0.0)], mat=m_park, bevel=0.03)
    dot = mk_cyl("r870_fs_d", 0.145, 0.145, 0.44, axis="x", segs=22, xform=[("t", 0.34, 0.56, 0.0)], mat=m_white, bevel=0.025)
    return finish_part(join_objects([ped, body, ring_bezel, dot], "rem870_front_sight"), sharp_deg=36.0)


def build_rem870_rear_sight(mats):
    m_park, m_dark = mats["M_ParkerizedSteel"], mats["M_DarkSteel"]
    # Authentic Police Magnum Ghost-Ring Aperture Sight w/ swept protective combat wings & windage drum!
    base_pts = [(-1.35, -0.18), (1.35, -0.18), (1.22, 0.18), (-1.22, 0.18)]
    base = mk_extrude_z("r870_rs_b", base_pts, -0.62, 0.62, bevel=0.05, bevel_segs=2, mat=m_park)
    # Twin recessed Torx receiver-mount screws
    scr_f = mk_cyl("r870_rs_sf", 0.16, 0.16, 0.22, axis="y", segs=16, xform=[("t",  0.82, 0.16, 0.0)], mat=m_dark, bevel=0.02)
    scr_r = mk_cyl("r870_rs_sr", 0.16, 0.16, 0.22, axis="y", segs=16, xform=[("t", -0.92, 0.16, 0.0)], mat=m_dark, bevel=0.02)
    # Swept curved protective combat sight wings (`-Z` and `+Z`)
    wing_pts = [(-0.88, 0.06), (0.36, 0.06)] + sample_quad_bezier((0.36, 0.06), (0.20, 0.92), (-0.28, 1.06), steps=10) + sample_quad_bezier((-0.28, 1.06), (-0.72, 0.98), (-0.88, 0.06), steps=10)
    ear_l = mk_extrude_z("r870_rs_l", wing_pts, -0.64, -0.44, bevel=0.03, mat=m_park)
    ear_r = mk_extrude_z("r870_rs_r", wing_pts,  0.44,  0.64, bevel=0.03, mat=m_park)
    # Circular ghost-ring aperture peep ring centered at `(-0.34, 0.64, 0.0)` along bore sight line!
    ring_pts = [Vector((-0.34, 0.64 + 0.34 * math.cos(2.0 * math.pi * k / 32), 0.34 * math.sin(2.0 * math.pi * k / 32))) for k in range(32)]
    peep = mk_tube_along_pts("r870_rs_ring", ring_pts, 0.085, ring_segs=14, closed=True, mat=m_dark)
    stem = mk_cyl("r870_rs_st", 0.16, 0.18, 0.36, axis="y", segs=18, xform=[("t", -0.34, 0.18, 0.0)], mat=m_dark, bevel=0.02)
    # Knurled windage adjustment screw drum on right side (`+Z`)
    wind = mk_cyl("r870_rs_wn", 0.20, 0.20, 0.30, axis="z", segs=18, xform=[("t", -0.34, 0.38, 0.68)], mat=m_dark, bevel=0.03)
    return finish_part(join_objects([base, scr_f, scr_r, ear_l, ear_r, peep, stem, wind], "rem870_rear_sight"), sharp_deg=36.0)


def build_rem870_forend(mats):
    m_wal, m_cap = mats["W_PoliceWalnut"], mats["W_ForendSteelCap"]
    # Iconic Remington 870 Police Magnum deeply ringed "Corn-Cob" walnut pump forend (48-seg smooth lathe)!
    # Cigar-barreled palm profile with 12 smoothly rounded radial ribs & concave U-grooves!
    pts = [(1.24, -7.88), (1.42, -7.88), (1.64, -7.68), (1.76, -7.30)]
    n_grooves = 12
    x_start, x_end = -7.22, 7.22
    pitch = (x_end - x_start) / n_grooves
    for i in range(n_grooves):
        xa = x_start + i * pitch
        # Smooth cigar barrel envelope peaking gently in the center of the palm grip
        for sub in range(8):
            frac = sub / 8.0
            xx = xa + frac * pitch
            u_glob = (xx - x_start) / (x_end - x_start)
            r_env = 1.76 + 0.16 * math.sin(math.pi * u_glob) ** 0.70
            # Rounded convex rib crest (`frac in [0.0..0.46]`) -> smooth concave corn-cob U-groove (`frac in [0.46..1.0]`)
            if frac < 0.46:
                ridge = math.sin(math.pi * (frac / 0.46)) ** 0.55
                rr = r_env - 0.04 + 0.05 * ridge
            else:
                groove = math.sin(math.pi * ((frac - 0.46) / 0.54)) ** 0.85
                rr = r_env - 0.04 - 0.22 * groove
            pts.append((rr, xx))
    pts.extend([(1.78, 7.30), (1.66, 7.68), (1.44, 7.88), (1.24, 7.88), (1.24, -7.88)])
    wood = mk_lathe_x("r870_fe_wood", pts, segs=48, mat=m_wal)

    # Tapered parkerized steel action-bar tube end-caps (isolated behind 61px UV firewall `STEEL_CAP`!)
    rear_cap = mk_lathe_x(
        "r870_fe_rcap",
        [
            (1.24, -8.56), (1.36, -8.56), (1.44, -8.46), (1.58, -7.95),
            (1.56, -7.84), (1.24, -7.84), (1.24, -8.56),
        ],
        segs=40, mat=m_cap,
    )
    front_nut = mk_lathe_x(
        "r870_fe_fcap",
        [
            (1.24, 7.84), (1.56, 7.84), (1.58, 7.96), (1.46, 8.54),
            (1.38, 8.66), (1.24, 8.66), (1.24, 7.84),
        ],
        segs=40, mat=m_cap,
    )
    # Twin spanner-wrench slots on front action-bar tube retention nut
    span_cut = mk_box("c_fe_sp", 0.55, 0.34, 3.40, [("t", 8.48, 0.0, 0.0)], mat=m_cap)
    front_nut = bool_subtract(front_nut, [span_cut])
    return finish_part(join_objects([wood, rear_cap, front_nut], "rem870_forend"), sharp_deg=42.0)


def build_rem870_action_bars(mats):
    m_park, m_dark = mats["R_ParkerizedBillet"], mats["R_DarkActionSteel"]
    sleeve = mk_lathe_x(
        "r870_ab_slv",
        [(1.18, 1.20), (1.26, 1.20), (1.26, 11.80), (1.38, 11.80), (1.38, 12.15), (1.18, 12.15), (1.18, 1.20)],
        segs=28, xform=[("t", 0.0, -1.00, 0.0)], mat=m_park,
    )
    bar_l = mk_box("r870_ab_l", 18.50, 0.72, 0.24, [("t", -2.80, -0.35, -1.42)], mat=m_dark, bevel=0.02)
    bar_r = mk_box("r870_ab_r", 18.50, 0.72, 0.24, [("t", -2.80, -0.35, 1.42)], mat=m_dark, bevel=0.02)
    yoke_l = mk_box("r870_ab_yl", 0.85, 0.95, 0.46, [("t", 1.40, -0.68, -1.32)], mat=m_dark, bevel=0.02)
    yoke_r = mk_box("r870_ab_yr", 0.85, 0.95, 0.46, [("t", 1.40, -0.68, 1.32)], mat=m_dark, bevel=0.02)
    return finish_part(join_objects([sleeve, bar_l, bar_r, yoke_l, yoke_r], "rem870_action_bars"), sharp_deg=34.0)


def build_rem870_slide_block(mats):
    m_dark = mats["M_DarkSteel"]
    base = mk_box("r870_sb_b", 5.20, 1.15, 1.85, None, mat=m_dark, bevel=0.05)
    ramp = mk_box("r870_sb_r", 2.40, 0.65, 1.18, [("t", 1.10, 0.58, 0.0)], mat=m_dark, bevel=0.03)
    slot = mk_box("c_sb_s", 2.20, 0.62, 0.85, [("t", 1.20, 0.72, 0.0)], mat=m_dark)
    res = bool_subtract(join_objects([base, ramp], "r870_sb_u"), [slot])
    res.name = "rem870_slide_block"
    return finish_part(res, sharp_deg=34.0)


def build_rem870_breech_bolt(mats):
    m_chr, m_dark = mats["M_HardChrome"], mats["M_DarkSteel"]
    blank = mk_box("r870_bb_b", 8.20, 1.56, 1.76, None, mat=m_chr, bevel=0.12)
    ext = mk_box("r870_bb_ext", 2.80, 0.42, 0.22, [("t", 2.50, 0.22, 0.92)], mat=m_dark, bevel=0.02)
    win = mk_box("c_bb_win", 2.90, 1.15, 1.25, [("t", 2.30, 0.55, 0.0)], mat=m_chr)
    fpb = mk_cyl("c_bb_fpb", 0.24, 0.24, 8.60, axis="x", segs=16, mat=m_chr)
    res = bool_subtract(join_objects([blank, ext], "r870_bb_u"), [win, fpb])
    res.name = "rem870_breech_bolt"
    return finish_part(res, sharp_deg=34.0)


def build_rem870_locking_block(mats):
    m_dark = mats["M_DarkSteel"]
    lb = mk_extrude_z("rem870_locking_block", [(-1.35, -0.58), (1.28, -0.45), (1.32, 0.78), (-0.35, 0.85), (-1.35, 0.25)], -0.61, 0.61, bevel=0.04, mat=m_dark)
    return finish_part(lb, sharp_deg=34.0)


def build_rem870_firing_pin(mats):
    m_chr = mats["M_HardChrome"]
    fp = mk_lathe_x(
        "rem870_firing_pin",
        [
            (0.0, -3.95), (0.24, -3.95), (0.26, -3.88), (0.26, -3.15), (0.14, -3.05),
            (0.14, 1.80), (0.24, 1.88), (0.24, 2.15), (0.11, 2.22), (0.11, 3.35), (0.045, 3.92), (0.0, 3.95),
        ],
        segs=20, mat=m_chr,
    )
    return finish_part(fp, sharp_deg=36.0)


def build_rem870_receiver(mats):
    m_park, m_dark = mats["R_ParkerizedBillet"], mats["R_DarkActionSteel"]
    # Contoured solid-billet milled Model 870 receiver (`X in [-8.30, +8.30], Y in [-2.325, +2.325], Z in [-1.70, +1.70]`):
    # Signature Remington 870 arched rear shoulder curving smoothly down toward the walnut wrist while keeping
    # left/right Hero UV rollmark flanks (`|tz| > 1.45, |nz| > 0.78`) planar and razor sharp!
    rec_prof = (
        [(-8.30, -2.325), (8.30, -2.325), (8.30, 2.325), (-5.40, 2.325)]
        + sample_cubic_bezier((-5.40, 2.325), (-7.05, 2.30), (-8.18, 1.88), (-8.30, 1.15), steps=12)
    )
    outer = mk_extrude_z("r870_rec_o", rec_prof, -1.70, 1.70, bevel=0.22, bevel_segs=3, mat=m_park)
    bcol = mk_cyl("r870_rec_bc", 1.62, 1.66, 3.80, axis="x", segs=36, xform=[("t", 7.40, 1.20, 0.0)], mat=m_park, bevel=0.07)
    mcol = mk_cyl("r870_rec_mc", 1.38, 1.42, 3.20, axis="x", segs=32, xform=[("t", 7.40, -1.40, 0.0)], mat=m_park, bevel=0.06)

    cav = mk_box("c_rec_cav", 15.20, 3.35, 2.25, [("t", -0.20, 0.05, 0.0)], mat=m_dark)
    # Chamfered 3" Magnum stadium ejection port on right (+Z) flank catching crisp specular bevel highlights!
    ej_in = mk_stadium_2d(7.15, 1.72, arc_segs=10)
    ej_out = mk_stadium_2d(7.43, 2.00, arc_segs=10)
    ej = mk_loft_z(
        "c_rec_ej",
        [(0.70, ej_in), (1.56, ej_in), (1.71, ej_out), (2.25, ej_out)],
        mat=m_dark, xform=[("t", 2.60, 1.05, 0.0)],
    )
    # Rounded-end stadium bottom combat loading gate (`-Y` belly) with beveled entry funnel!
    lp_in = mk_stadium_2d(8.20, 2.00, arc_segs=10)
    lp_out = mk_stadium_2d(8.46, 2.26, arc_segs=10)
    lp = mk_loft_z(
        "c_rec_lp",
        [(-0.75, lp_in), (0.0, lp_in), (0.14, lp_out), (0.65, lp_out)],
        mat=m_dark, xform=[("rx", math.pi * 0.5), ("t", 1.20, -2.18, 0.0)],
    )
    ts = mk_box("c_rec_ts", 9.60, 1.72, 1.92, [("t", -3.40, -1.98, 0.0)], mat=m_dark)
    bs = mk_cyl("c_rec_bs", 1.42, 1.42, 5.40, axis="x", segs=28, xform=[("t", 7.40, 1.20, 0.0)], mat=m_dark)
    ms = mk_cyl("c_rec_ms", 1.20, 1.20, 4.40, axis="x", segs=26, xform=[("t", 7.40, -1.40, 0.0)], mat=m_dark)
    rec_base = bool_union([outer, bcol, mcol], "r870_rec_u")
    rec = bool_subtract(rec_base, [cav, ej, lp, ts, bs, ms])
    # Iconic Remington 870 dual Police Magnum trigger-plate cross-pins (front big pin + rear small pin!)
    pin_f = mk_cyl("r870_rec_pf", 0.25, 0.25, 3.44, axis="z", segs=20, xform=[("t", -0.55, -1.45, 0.0)], mat=m_dark, bevel=0.03)
    pin_r = mk_cyl("r870_rec_pr", 0.21, 0.21, 3.44, axis="z", segs=20, xform=[("t", -5.25, -1.45, 0.0)], mat=m_dark, bevel=0.03)
    res = join_objects([rec, pin_f, pin_r], "rem870_receiver")
    return finish_part(res, sharp_deg=36.0)


def _rem870_stock_cross_section(x: float, n_ring: int = 36, scale_z: float = 1.0, scale_y: float = 1.0) -> list[tuple[float, float]]:
    """Shared mathematically exact Remington 870 Police Magnum semi-pistol-grip Monte Carlo walnut cross-section."""
    # Butt rear x = -14.80 (`world X = -37.60`), receiver rear junction x = +15.05 (`world X = -7.75`)
    # Monte Carlo comb: gently level/arched comb (`-14.8..+5.5`) -> nose drop -> curved wrist into arched receiver rear!
    t_comb = _smoothstep_f(-14.8, 5.2, x)
    t_nose = _smoothstep_f(5.0, 9.8, x)
    t_rec = _smoothstep_f(10.5, 15.05, x)
    y_top = 2.32 + 0.64 * t_comb - 0.14 * t_nose + 1.24 * t_rec

    # Iconic Remington 870 semi-pistol grip belly:
    # Sweeps smoothly down to butt toe (`-5.75`), rises toward behind grip (`-3.15` at `x=5.0`),
    # dips down into sculpted curved semi-pistol grip pommel (`-3.82` at `x=7.8`),
    # then sweeps smoothly UP through slim grip neck (`-0.25` at `x=11.8`) to flush receiver bottom (`+0.44` at `x=15.05`)!
    grip_dip = -0.96 * math.exp(-((x - 7.80) / 2.25) ** 2)
    y_bot = (
        -5.75
        + 2.55 * _smoothstep_f(-14.8, 4.8, x)
        + 3.64 * _smoothstep_f(6.8, 15.05, x)
        + grip_dip
    )

    # Organic width: rounded butt (`1.58`) -> gentle cheek swell (`1.64`) -> ergonomic semi-pistol wrist (`1.34`) -> receiver (`1.64`)
    hw = (
        1.58
        + 0.06 * math.sin(math.pi * _smoothstep_f(-14.8, 4.0, x))
        - 0.28 * _smoothstep_f(4.5, 11.2, x)
        + 0.34 * _smoothstep_f(11.6, 15.05, x)
    ) * scale_z

    yc = 0.5 * (y_top + y_bot)
    ry = max(0.42, 0.5 * (y_top - y_bot)) * scale_y
    top_taper = 0.64 + 0.22 * _smoothstep_f(5.5, 12.5, x) + 0.10 * t_rec
    super_p = 1.0 - 0.22 * t_rec  # slightly squarer superellipse flush against milled steel receiver flanks

    # Subtle classic Monte Carlo left-flank (`-Z`) cheekpiece fullness on mid-buttstock (`x in [-11.5, +2.5]`)
    cheek_env = _smoothstep_f(-12.5, -8.0, x) * (1.0 - _smoothstep_f(0.5, 4.2, x))

    ring = []
    for k in range(n_ring):
        th = 2.0 * math.pi * k / n_ring
        ct, st = math.cos(th), math.sin(th)
        w_mod = top_taper + (1.0 - top_taper) * _smoothstep_f(0.95, -0.25, ct)
        z = math.copysign(abs(st) ** super_p, st) * hw * w_mod
        if st < 0.0 and cheek_env > 1e-4:
            cheek_y = _smoothstep_f(-0.20, 0.25, ct) * (1.0 - _smoothstep_f(0.65, 0.95, ct))
            z -= 0.18 * cheek_env * cheek_y * ((-st) ** 0.85)
        y = yc + math.copysign(abs(ct) ** super_p, ct) * ry
        ring.append((z, y))
    return ring


def build_rem870_walnut_stock(mats):
    m_wal = mats["W_PoliceWalnut"]
    # 30-station x 36-ring contoured semi-pistol-grip Monte Carlo American walnut buttstock!
    N_ST = 30
    stations = []
    for i in range(N_ST):
        u = i / (N_ST - 1)
        x = -14.80 + u * 29.85
        stations.append((x, _rem870_stock_cross_section(x, n_ring=36)))
    blank = mk_loft_x("r870_stk_b", stations, mat=m_wal)
    tunnel = mk_cyl("c_stk_tun", 0.54, 0.54, 31.2, axis="x", segs=22, xform=[("t", 0.20, 0.70, 0.0)], mat=m_wal)
    stk = bool_subtract(blank, [tunnel])
    stk.name = "rem870_walnut_stock"
    return finish_part(stk, sharp_deg=44.0)


def build_rem870_buttplate(mats):
    m_rub, m_wht = mats["W_RubberButtpad"], mats["W_WhiteSpacer"]
    # Vented solid-rubber Police Magnum recoil pad + crisp ivory white-line spacer lofted directly from the
    # EXACT rear oval cross-section of `rem870_walnut_stock`!
    # Stock assembledPos = (-22.80, -2.55, 0), buttplate assembledPos = (-38.80, -3.95, 0)
    # Offset stock -> buttplate: dx = +16.00 (stock x=-14.80 -> bp_x=+1.20), dy = +1.40!
    N_RING = 36
    base_ring = [(z, y + 1.40) for (z, y) in _rem870_stock_cross_section(-14.80, n_ring=N_RING)]
    yc = 0.5 * (max(p[1] for p in base_ring) + min(p[1] for p in base_ring))

    def _scaled_ring(sz: float, sy: float) -> list[tuple[float, float]]:
        return [(z * sz, yc + (y - yc) * sy) for (z, y) in base_ring]

    # 1. Crisp ivory white-line phenolic spacer (`bp_x in [+1.00, +1.22]`, isolated in `WHITE_SPACER` UV firewall!)
    spacer = mk_loft_x(
        "r870_bp_sp",
        [
            (0.98, _scaled_ring(0.996, 0.996)),
            (1.02, _scaled_ring(1.012, 1.008)),
            (1.20, _scaled_ring(1.012, 1.008)),
            (1.24, _scaled_ring(0.996, 0.996)),
        ],
        mat=m_wht,
    )
    # 2. Thick contoured vented black rubber Police recoil pad (`bp_x in [-1.26, +1.00]`)
    pad = mk_loft_x(
        "r870_bp_rb",
        [
            (-1.28, _scaled_ring(0.84, 0.94)),
            (-1.14, _scaled_ring(0.98, 0.99)),
            (-0.92, _scaled_ring(1.018, 1.010)),
            ( 0.98, _scaled_ring(1.014, 1.008)),
            ( 1.02, _scaled_ring(0.992, 0.995)),
        ],
        mat=m_rub,
    )
    # Carve 9 horizontal anti-slip traction grooves along rear shoulder face + 4 vented shock-absorption oval side ports!
    cuts = [
        mk_box(f"c_bp_r_{i}", 0.24, 0.16, 3.40, [("t", -1.26, -3.55 + i * 0.86, 0.0)], mat=m_rub)
        for i in range(9)
    ] + [
        mk_extrude_z(f"c_bp_v_{k}", mk_stadium_2d(0.76, 0.54, 8), -1.85, 1.85, xform=[("t", -0.05, -2.55 + k * 1.65, 0.0)], mat=m_rub)
        for k in range(4)
    ]
    pad = bool_subtract(pad, cuts)
    return finish_part(join_objects([pad, spacer], "rem870_buttplate"), sharp_deg=38.0)


def build_rem870_stock_bolt(mats):
    m_dark = mats["M_DarkSteel"]
    sb = mk_lathe_x("rem870_stock_bolt", [(0.0, -12.2), (0.58, -12.2), (0.58, -11.45), (0.28, -11.35), (0.28, 11.4), (0.34, 11.55), (0.34, 12.2), (0.0, 12.2)], segs=20, mat=m_dark)
    return finish_part(sb, sharp_deg=36.0)


def build_rem870_trigger_plate(mats):
    m_alu = mats["R_AluminumFCG"]
    # Contoured Police Magnum anodized aluminum dual-pin FCG housing + smoothly swept curved trigger-guard bow!
    spine = mk_box("r870_tp_s", 11.40, 0.92, 2.02, [("t", 0.0, 0.52, 0.0)], mat=m_alu, bevel=0.10, bevel_segs=3)
    # Smoothly swept cubic-Bezier Remington 870 oval trigger-guard bow welded watertight via bool_union!
    # Encloses `rem870_trigger` (`tp local (-3.20, -0.50)` down to `y = -1.70`) with generous combat clearance!
    bow_pts = (
        [(-0.78, 0.44)]
        + sample_cubic_bezier((-0.78, 0.44), (-0.42, -0.52), (-0.65, -1.68), (-1.75, -1.86), steps=14)
        + sample_cubic_bezier((-1.75, -1.86), (-2.65, -1.96), (-3.85, -1.94), (-4.72, -1.76), steps=14)
        + sample_cubic_bezier((-4.72, -1.76), (-5.58, -1.52), (-5.68, -0.45), (-5.35, 0.44), steps=14)
    )
    guard_bow = mk_swept_bow(
        "r870_tp_bow", bow_pts,
        lambda t: 0.24 + 0.04 * (1.0 - math.sin(math.pi * t)),
        lambda t: 0.62,
        sec_n=24, super_exp=0.64, mat=m_alu,
    )
    # Rear cross-bolt safety boss integrated cleanly into rear guard root
    saf_boss = mk_cyl("r870_tp_sb", 0.42, 0.42, 1.38, axis="z", segs=20, xform=[("t", -3.85, 0.22, 0.0)], mat=m_alu, bevel=0.04)
    res = bool_union([spine, guard_bow, saf_boss], "rem870_trigger_plate")
    return finish_part(res, sharp_deg=36.0)


def build_rem870_trigger(mats):
    m_dark, m_red = mats["R_DarkActionSteel"], mats["R_SafetyCrimson"]
    base = mk_box("r870_tr_b", 1.85, 1.15, 0.65, [("t", 0.0, 0.55, 0.0)], mat=m_dark, bevel=0.04)
    # Smoothly curved grooved Remington 870 combat trigger shoe (`mk_swept_bow`)
    shoe_pts = sample_cubic_bezier((0.08, 0.20), (-0.12, -0.45), (-0.02, -1.05), (0.44, -1.48), steps=16, include_start=True)
    blade = mk_swept_bow("r870_tr_bl", shoe_pts, lambda t: 0.24 - 0.04 * t, lambda t: 0.24, sec_n=18, super_exp=0.60, mat=m_dark)
    body = bool_union([base, blade], "r870_tr_u")
    # Iconic Police 870 oversized cross-bolt safety with bright crimson fire-warning ring on left end!
    saf_pin = mk_cyl("r870_saf_p", 0.25, 0.25, 1.24, axis="z", segs=22, xform=[("t", -0.65, 0.72, 0.0)], mat=m_dark, bevel=0.03)
    saf_ring = mk_cyl("r870_saf_r", 0.265, 0.265, 0.16, axis="z", segs=22, xform=[("t", -0.65, 0.72, -0.40)], mat=m_red)
    return finish_part(join_objects([body, saf_pin, saf_ring], "rem870_trigger"), sharp_deg=36.0)


def build_rem870_hammer(mats):
    m_dark = mats["M_DarkSteel"]
    hm = mk_extrude_z("rem870_hammer", [(-0.58, -0.68), (0.62, -0.68), (1.15, 1.38), (0.55, 1.85), (-0.85, 1.28)], -0.39, 0.39, bevel=0.04, mat=m_dark)
    return finish_part(hm, sharp_deg=34.0)


def build_rem870_action_release(mats):
    m_dark, m_park = mats["R_DarkActionSteel"], mats["R_ParkerizedBillet"]
    arm = mk_box("r870_ar_a", 3.10, 0.58, 0.24, None, mat=m_dark, bevel=0.03)
    pad = mk_box("r870_ar_p", 1.15, 0.78, 0.42, [("t", 0.95, -0.18, -0.12)], mat=m_park, bevel=0.04)
    return finish_part(join_objects([arm, pad], "rem870_action_release"), sharp_deg=34.0)


def build_rem870_mag_tube(mats):
    m_park = mats["R_ParkerizedBillet"]
    mt = mk_lathe_x("rem870_mag_tube", [(0.98, -20.5), (1.14, -20.5), (1.14, 20.5), (0.98, 20.5), (0.98, -20.5)], segs=32, mat=m_park)
    return finish_part(mt, sharp_deg=36.0)


def build_rem870_mag_cap(mats):
    m_park, m_dark = mats["R_ParkerizedBillet"], mats["R_DarkActionSteel"]
    # Crisp 40-flute deeply knurled parkerized magazine cap w/ domed front crown & sling swivel stud!
    knurl = mk_knurled_cyl("r870_mc_kn", 1.32, 2.70, axis="x", flutes=40, depth=0.035, xform=[("t", -0.08, 0.0, 0.0)], mat=m_park)
    nose = mk_lathe_x(
        "r870_mc_nose",
        [
            (0.0, -1.60), (1.18, -1.60), (1.28, -1.44), (1.28, 1.24),
            (1.16, 1.48), (0.86, 1.62), (0.0, 1.66),
        ],
        segs=36, mat=m_park,
    )
    stud = mk_cyl("r870_mc_st", 0.28, 0.34, 0.72, axis="x", segs=20, xform=[("t", 1.92, 0.0, 0.0)], mat=m_dark, bevel=0.05)
    stud_h = mk_cyl("c_mc_sh", 0.12, 0.12, 0.90, axis="z", segs=14, xform=[("t", 2.02, 0.0, 0.0)], mat=m_dark)
    stud = bool_subtract(stud, [stud_h])
    return finish_part(join_objects([knurl, nose, stud], "rem870_mag_cap"), sharp_deg=36.0)


def build_rem870_mag_follower(mats):
    m_org = mats["M_FollowerOrange"]
    fol = mk_lathe_x("rem870_mag_follower", [(0.0, -1.45), (0.92, -1.45), (0.94, 0.85), (0.72, 1.45), (0.0, 1.45)], segs=28, mat=m_org)
    return finish_part(fol, sharp_deg=36.0)


def build_rem870_shell_carrier(mats):
    m_chr = mats["M_HardChrome"]
    base = mk_extrude_z("r870_sc_b", [(-0.35, -0.45), (6.45, -0.42), (6.55, 0.35), (0.45, 0.48), (-0.35, 0.28)], -0.86, 0.86, bevel=0.04, mat=m_chr)
    cut = mk_box("c_sc_s", 4.80, 0.55, 1.12, [("t", 3.40, 0.32, 0.0)], mat=m_chr)
    sc = bool_subtract(base, [cut])
    sc.name = "rem870_shell_carrier"
    return finish_part(sc, sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & Zero-Bleed Atlas Allocation
# =============================================================================
def _smart_unwrap_and_pack_rect(objs, u0: float, u1: float, v0: float, v1: float, include_face_fn=None, label: str = "pack", margin: float = 0.005) -> int:
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
        if mn == "W_WhiteSpacer":
            return "WHITE_SPACER"
        if mn == "W_ForendSteelCap":
            return "STEEL_CAP"
        if on == "rem870_buttplate" or mn == "W_RubberButtpad":
            return "RUBBER"
        if on == "rem870_walnut_stock":
            nz, tz = -f.normal.y, -f.calc_center_median().y
            if nz < -0.50 and tz < -0.25:
                return "HERO_LEFT"
            if nz > 0.50 and tz > 0.25:
                return "HERO_RIGHT"
        return "WALNUT_PACK"

    # Strict >= 51px UV firewalls separating walnut, black rubber pad, steel forend caps & white-line spacer!
    _smart_unwrap_and_pack_rect(walnut_objs, 0.010, 0.535, 0.010, 0.380, lambda on, f, mn: classify(on, f, mn) == "WALNUT_PACK", "walnut_wood")
    _smart_unwrap_and_pack_rect(walnut_objs, 0.565, 0.785, 0.010, 0.380, lambda on, f, mn: classify(on, f, mn) == "RUBBER", "walnut_rubber")
    _smart_unwrap_and_pack_rect(walnut_objs, 0.815, 0.915, 0.010, 0.380, lambda on, f, mn: classify(on, f, mn) == "STEEL_CAP", "walnut_cap")
    _smart_unwrap_and_pack_rect(walnut_objs, 0.945, 0.990, 0.010, 0.380, lambda on, f, mn: classify(on, f, mn) == "WHITE_SPACER", "walnut_white")
    stk = next(o for o in walnut_objs if o.name == "rem870_walnut_stock")
    bm = bmesh.new()
    bm.from_mesh(stk.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cls = classify("rem870_walnut_stock", f, "")
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-14.80)) / 29.90))
            yn = max(0.0, min(1.0, (vco.z - (-5.80)) / 10.00))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.700 + yn * 0.285)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.410 + yn * 0.275)
    bm.to_mesh(stk.data)
    bm.free()


def unwrap_receiver_atlas(recv_objs):
    def classify(on, f, mn):
        if mn == "R_SafetyCrimson":
            return "SAFETY_RED"
        if on == "rem870_receiver":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            nz = -n.y
            if -8.30 <= tx <= 8.30 and -2.325 <= ty <= 2.325:
                if nz < -0.78 and tz < -1.45:
                    return "HERO_LEFT"
                if nz > 0.78 and tz > 1.45:
                    return "HERO_RIGHT"
        return "PACK"

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.840, 0.010, 0.505, lambda on, f, mn: classify(on, f, mn) == "PACK", "recv_pack")
    _smart_unwrap_and_pack_rect(recv_objs, 0.855, 0.990, 0.010, 0.505, lambda on, f, mn: classify(on, f, mn) == "SAFETY_RED", "recv_red")
    rec = next(o for o in recv_objs if o.name == "rem870_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rec.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify("rem870_receiver", f, mn)
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-8.30)) / 16.60))
            yn = max(0.0, min(1.0, (vco.z - (-2.325)) / 4.65))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.765 + yn * 0.220)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.525 + yn * 0.220)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_metal_atlas(metal_objs):
    def classify(on, f, mn):
        if on == "rem870_mag_follower" or mn == "M_FollowerOrange":
            return "ORANGE"
        if mn == "M_WhiteTritium":
            return "WHITE"
        if mn == "M_HardChrome" or on in ("rem870_breech_bolt", "rem870_firing_pin", "rem870_shell_carrier"):
            return "CHROME"
        if on == "rem870_barrel" and mn == "M_ParkerizedSteel":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            ny, nz = n.z, -n.y
            if -20.0 <= tx <= 10.0 and nz < -0.55 and tz < -0.55 and abs(ny) < 0.75:
                return "HERO_BBL"
        return "Z1"

    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.990, 0.435, 0.805, lambda on, f, mn: classify(on, f, mn) == "Z1", "metal_z1")
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.620, 0.010, 0.415, lambda on, f, mn: classify(on, f, mn) == "CHROME", "metal_chrome")
    _smart_unwrap_and_pack_rect(metal_objs, 0.640, 0.880, 0.010, 0.415, lambda on, f, mn: classify(on, f, mn) == "ORANGE", "metal_orange")
    _smart_unwrap_and_pack_rect(metal_objs, 0.895, 0.990, 0.010, 0.415, lambda on, f, mn: classify(on, f, mn) == "WHITE", "metal_white")

    bbl = next(o for o in metal_objs if o.name == "rem870_barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bbl.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify("rem870_barrel", f, mn) != "HERO_BBL":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            xn = max(0.0, min(1.0, (tx - (-20.0)) / 30.0))
            ang = math.atan2(ty, max(0.001, -tz))
            an = max(0.0, min(1.0, (ang - (-0.65)) / 1.30))
            loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.820 + an * 0.165)
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


def bake_atlas_suite(prefix: str, target_objs, all_objs, tmp_dir: Path, default_albedo=(0.04, 0.045, 0.045, 1.0)):
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
        "rem870_forend":         build_rem870_forend,
        "rem870_walnut_stock":   build_rem870_walnut_stock,
        "rem870_buttplate":      build_rem870_buttplate,
        "rem870_receiver":       build_rem870_receiver,
        "rem870_trigger_plate":  build_rem870_trigger_plate,
        "rem870_trigger":        build_rem870_trigger,
        "rem870_action_release": build_rem870_action_release,
        "rem870_action_bars":    build_rem870_action_bars,
        "rem870_mag_tube":       build_rem870_mag_tube,
        "rem870_mag_cap":        build_rem870_mag_cap,
        "rem870_barrel":         build_rem870_barrel,
        "rem870_front_sight":    build_rem870_front_sight,
        "rem870_rear_sight":     build_rem870_rear_sight,
        "rem870_slide_block":    build_rem870_slide_block,
        "rem870_breech_bolt":    build_rem870_breech_bolt,
        "rem870_locking_block":  build_rem870_locking_block,
        "rem870_firing_pin":     build_rem870_firing_pin,
        "rem870_hammer":         build_rem870_hammer,
        "rem870_stock_bolt":     build_rem870_stock_bolt,
        "rem870_mag_follower":   build_rem870_mag_follower,
        "rem870_shell_carrier":  build_rem870_shell_carrier,
    }
    print("[BUILD] Sculpting all 21 solid Remington Model 870 Police Magnum (12 Ga) parts...")
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

    with tempfile.TemporaryDirectory(prefix="rem870_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir, (0.09, 0.04, 0.018, 1.0))
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, (0.045, 0.05, 0.048, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.045, 0.05, 0.048, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "rem870_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "rem870_v3_walnut_normal.webp",
        TEX_OUT_DIR / "rem870_v3_walnut_roughness.webp",
        TEX_OUT_DIR / "rem870_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "rem870_v3_receiver_normal.webp",
        TEX_OUT_DIR / "rem870_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "rem870_v3_metal_albedo.webp",
        TEX_OUT_DIR / "rem870_v3_metal_normal.webp",
        TEX_OUT_DIR / "rem870_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== REMINGTON 870 COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 12.0


if __name__ == "__main__":
    main()
