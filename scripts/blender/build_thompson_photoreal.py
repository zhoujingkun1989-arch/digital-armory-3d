#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Thompson M1928A1 Submachine Gun (.45 ACP)
=========================================================================================
MIT License — Digital Armory 3D (V6.0 Track C1b · BAY-33)

Generates:
  - public/models/thompson.glb (Draco-compressed glTF 2.0, all 22 watertight solid parts; skips ONLY
    the 3 dynamically GPU-compressed `aSpringParam` CSG springs: `thompson_recoil_spring`,
    `thompson_sear_spring`, `thompson_drum_spring`)
  - public/textures/thompson_v3_walnut_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM, 0 alpha)
  - public/textures/thompson_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/thompson_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)

Coordinate & Transform Contract (`glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos, then all 22
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
# MODE 2: System Python Post-Process (Thompson M1928A1 Bridgeport Rollmarks,
#         Type L 50-Rd Drum Circular Stamping, GEG Walnut Cartouche & Packed ORM)
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

    # =========================================================================
    # SUITE 1: thompson_v3_walnut (Vertical Foregrip, Pistol Grip & Detachable Buttstock)
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
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Vintage Ordnance GEG & WB Cartouche Stamp on Walnut Buttstock Hero Band
        CW, CH = 2400, 800
        stamp_img = Image.new("L", (CW, CH), 0)
        ds = ImageDraw.Draw(stamp_img)
        cx, cy = int(CW * 0.68), int(CH * 0.34)
        ds.ellipse((cx - 58, cy - 58, cx + 58, cy + 58), outline=235, width=7)
        ds.text((cx, cy), "G.E.G.", fill=245, font=_load_font(FONT_SERIF_BOLD, 34), anchor="mm")
        ds.rectangle((cx - 190, cy - 42, cx - 90, cy + 42), outline=220, width=5)
        ds.text((cx - 140, cy), "W.B.", fill=235, font=_load_font(FONT_SERIF_BOLD, 34), anchor="mm")

        stamp_map = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(stamp_map, stamp_img, 0.015, 0.985, 0.365, 0.665)
        stamp_d = ndimage.gaussian_filter(stamp_map, sigma=0.7) * 0.60

        albedo *= 1.0 - 0.28 * stamp_d[..., None]
        _mix(rgh, 0.64, stamp_d * 0.60)
        ao *= 1.0 - 0.28 * stamp_d
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.50 * stamp_d, strength=4.0))

        rgh = np.clip(rgh, 0.28, 0.88)
        met = np.clip(met, 0.00, 0.04)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "thompson_v3_walnut_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "thompson_v3_walnut_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "thompson_v3_walnut_roughness.webp", 93)
        print("[POST] Saved thompson_v3_walnut_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: thompson_v3_receiver (Milled Receiver, Lower Frame, Lyman Sight, FCG)
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
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        CW, CH = 3600, 620
        engr_w = np.zeros((h, w), dtype=np.float32)

        # Left Upper Receiver Hero Flank: v in [0.785, 0.985]
        l_img = Image.new("L", (CW, CH), 0)
        dl = ImageDraw.Draw(l_img)
        dl.text((int(CW * 0.50), int(CH * 0.28)), "THOMPSON SUBMACHINE GUN", fill=255, font=_load_font(FONT_SERIF_BOLD, 108), anchor="mm")
        dl.text((int(CW * 0.50), int(CH * 0.56)), "CALIBER .45 AUTOMATIC CARTRIDGE", fill=244, font=_load_font(FONT_COND, 82), anchor="mm")
        dl.text((int(CW * 0.24), int(CH * 0.80)), "U.S. MODEL OF 1928 A1", fill=240, font=_load_font(FONT_DIN, 64), anchor="mm")
        dl.text((int(CW * 0.72), int(CH * 0.80)), "NO. S-284917", fill=246, font=_load_font(FONT_DIN, 68), anchor="mm")
        _paste_uv_band(engr_w, l_img, 0.015, 0.985, 0.785, 0.985)

        # Right Upper Receiver Hero Flank: v in [0.575, 0.765]
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        dr.text((int(CW * 0.36), int(CH * 0.30)), "AUTO-ORDNANCE CORPORATION", fill=250, font=_load_font(FONT_SERIF_BOLD, 92), anchor="mm")
        dr.text((int(CW * 0.36), int(CH * 0.58)), "BRIDGEPORT, CONNECTICUT, U.S.A.", fill=238, font=_load_font(FONT_COND, 74), anchor="mm")
        dr.text((int(CW * 0.36), int(CH * 0.82)), "U.S. PAT. 1,131,319  ·  1,352,414  ·  1,422,068", fill=222, font=_load_font(FONT_COND, 56), anchor="mm")
        _paste_uv_band(engr_w, r_img, 0.015, 0.985, 0.575, 0.765)

        silver_w = ndimage.gaussian_filter(engr_w, sigma=0.55) * 0.60
        _mix(albedo, (0.76, 0.79, 0.84), silver_w * 0.48)
        _mix(rgh, 0.22, silver_w * 0.45)
        ao *= 1.0 - 0.34 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.56 * engr_w, strength=4.8))
        rgh = np.clip(rgh, 0.14, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "thompson_v3_receiver_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "thompson_v3_receiver_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "thompson_v3_receiver_roughness.webp", 93)
        print("[POST] Saved thompson_v3_receiver_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: thompson_v3_metal (Finned Barrel, Cutts Comp, Bronze Blish Lock,
    #                             Type L 50-Rd Drum Hero Stamping & .45 ACP Rounds)
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

        # Type L 50-Rd Drum Front Face Hero Disk: u in [0.020, 0.460], v in [0.540, 0.980]
        DW = 1024
        d_img = Image.new("L", (DW, DW), 0)
        dd = ImageDraw.Draw(d_img)
        dd.ellipse((42, 42, DW - 42, DW - 42), outline=215, width=10)
        dd.ellipse((148, 148, DW - 148, DW - 148), outline=185, width=7)
        dd.text((DW // 2, int(DW * 0.21)), "MAGAZINE TYPE 'L'", fill=255, font=_load_font(FONT_SERIF_BOLD, 56), anchor="mm")
        dd.text((DW // 2, int(DW * 0.31)), "THOMPSON SUBMACHINE GUN", fill=242, font=_load_font(FONT_COND, 46), anchor="mm")
        dd.text((DW // 2, int(DW * 0.69)), "50 CARTRIDGES  CAL. .45", fill=252, font=_load_font(FONT_DIN, 50), anchor="mm")
        dd.text((DW // 2, int(DW * 0.79)), "WIND TO 9 CLICKS  ·  AUTO-ORDNANCE N.Y.", fill=232, font=_load_font(FONT_COND, 38), anchor="mm")

        drum_engr = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(drum_engr, d_img, 0.020, 0.460, 0.540, 0.980)
        silver_d = ndimage.gaussian_filter(drum_engr, sigma=0.5) * 0.62
        _mix(albedo, (0.76, 0.79, 0.84), silver_d * 0.48)
        _mix(rgh, 0.22, silver_d * 0.45)
        ao *= 1.0 - 0.32 * drum_engr
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.52 * drum_engr, strength=4.5))

        rgh = np.clip(rgh, 0.14, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "thompson_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "thompson_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "thompson_v3_metal_roughness.webp", 93)
        print("[POST] Saved thompson_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

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
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "thompson.glb"
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
    "thompson_foregrip",
    "thompson_pistol_grip",
    "thompson_buttstock",
]

RECEIVER_PARTS = [
    "thompson_receiver",
    "thompson_lyman_sight",
    "thompson_lower_frame",
    "thompson_buttplate",
    "thompson_trigger",
    "thompson_sear",
    "thompson_selector_levers",
    "thompson_mag_catch",
]

METAL_PARTS = [
    "thompson_barrel",
    "thompson_cutts_comp",
    "thompson_bolt",
    "thompson_blish_lock",
    "thompson_actuator",
    "thompson_hammer_pin",
    "thompson_buffer_pilot",
    "thompson_oiler",
    "thompson_drum_mag",
    "thompson_drum_rotor",
    "thompson_drum_rounds",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "thompson_foregrip",
    "thompson_pistol_grip",
    "thompson_buttstock",
    "thompson_receiver",
    "thompson_lyman_sight",
    "thompson_lower_frame",
    "thompson_buttplate",
    "thompson_trigger",
    "thompson_selector_levers",
    "thompson_mag_catch",
    "thompson_barrel",
    "thompson_cutts_comp",
    "thompson_actuator",
    "thompson_drum_mag",
    "thompson_drum_rotor",
}

ASSEMBLED_POS = {
    "thompson_barrel":          ( 25.80,  1.60,  0.00),
    "thompson_cutts_comp":      ( 42.60,  1.60,  0.00),
    "thompson_bolt":            (  0.20,  1.60,  0.00),
    "thompson_blish_lock":      (  1.60,  1.75,  0.00),
    "thompson_actuator":        (  0.20,  3.35,  0.00),
    "thompson_hammer_pin":      (  3.80,  1.60,  0.00),
    "thompson_buffer_pilot":    ( -8.80,  1.60,  0.00),
    "thompson_oiler":           (  1.80,  1.60,  0.00),
    "thompson_receiver":        (  1.00,  1.50,  0.00),
    "thompson_lyman_sight":     ( -8.60,  3.85,  0.00),
    "thompson_lower_frame":     ( -4.20, -1.25,  0.00),
    "thompson_foregrip":        ( 23.50, -3.20,  0.00),
    "thompson_pistol_grip":     ( -8.40, -5.85,  0.00),
    "thompson_buttstock":       (-25.40, -2.85,  0.00),
    "thompson_buttplate":       (-38.40, -4.15,  0.00),
    "thompson_trigger":         ( -2.80, -2.55,  0.00),
    "thompson_sear":            ( -3.20, -0.55,  0.00),
    "thompson_selector_levers": ( -5.20, -1.05, -1.78),
    "thompson_mag_catch":       (  4.20, -0.85, -1.72),
    "thompson_drum_mag":        (  7.80, -7.80,  0.00),
    "thompson_drum_rotor":      (  7.80, -7.80,  0.00),
    "thompson_drum_rounds":     (  7.80, -7.80,  0.00),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "thompson_recoil_spring",
    "thompson_sear_spring",
    "thompson_drum_spring",
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
    bevel_r: float = 0.024,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.78, 0.81, 0.86),
    grain_scale: float = 40.0,
    grain_bump: float = 0.022,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    rough_var: float = 0.028,
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

    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = srgb_to_lin(*base_srgb)
    mix_base.inputs[7].default_value = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.13),
        min(1.0, base_srgb[2] * 1.15),
    )
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.12, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.90, roughness + rough_var)
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
        nt.links.new(n_micro.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_walnut_mat(name: str = "W_ThompsonWalnut") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (0.072, 0.72, 0.58)
    nt.links.new(tc.outputs["Object"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "X"
    wave.inputs["Scale"].default_value = 1.05
    wave.inputs["Distortion"].default_value = 7.2
    wave.inputs["Detail"].default_value = 6.0
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.2
    n_fib.inputs["Detail"].default_value = 6.5
    n_fib.inputs["Distortion"].default_value = 0.65
    nt.links.new(map_wood.outputs["Vector"], n_fib.inputs["Vector"])

    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = srgb_to_lin(0.185, 0.088, 0.044)
    mix1.inputs[7].default_value = srgb_to_lin(0.385, 0.192, 0.094)
    nt.links.new(wave.outputs["Fac"], mix1.inputs[0])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = srgb_to_lin(0.515, 0.275, 0.136)
    nt.links.new(n_fib.outputs["Fac"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])
    nt.links.new(mix2.outputs[2], bsdf.inputs["Base Color"])

    rmap = nt.nodes.new("ShaderNodeMapRange")
    rmap.inputs["From Min"].default_value = 0.20
    rmap.inputs["From Max"].default_value = 0.80
    rmap.inputs["To Min"].default_value = 0.34
    rmap.inputs["To Max"].default_value = 0.48
    nt.links.new(n_fib.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_fib.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        "W_ThompsonWalnut": _build_walnut_mat("W_ThompsonWalnut"),
        "W_MountSteel": _build_pbr_mat(
            "W_MountSteel",
            base_srgb=(0.192, 0.214, 0.260),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.45,
        ),
        # Pre-war Du-Lite Deep Blued Billet Steel (AgX calibrated, zero black crush)
        "R_DuLiteBlue": _build_pbr_mat(
            "R_DuLiteBlue",
            base_srgb=(0.192, 0.218, 0.272),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.026,
            edge_wear=0.56,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=36.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
        ),
        "R_ControlBlue": _build_pbr_mat(
            "R_ControlBlue",
            base_srgb=(0.215, 0.238, 0.285),
            roughness=0.28,
            metallic=0.89,
            bevel_r=0.020,
            edge_wear=0.48,
        ),
        "R_Polished": _build_pbr_mat(
            "R_Polished",
            base_srgb=(0.76, 0.79, 0.84),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.20,
        ),
        "M_BluedSteel": _build_pbr_mat(
            "M_BluedSteel",
            base_srgb=(0.190, 0.216, 0.268),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.52,
            aniso_stretch=(3.8, 0.5, 0.5),
        ),
        "M_DrumBlue": _build_pbr_mat(
            "M_DrumBlue",
            base_srgb=(0.202, 0.226, 0.274),
            roughness=0.27,
            metallic=0.89,
            bevel_r=0.024,
            edge_wear=0.48,
        ),
        "M_PolishedSteel": _build_pbr_mat(
            "M_PolishedSteel",
            base_srgb=(0.78, 0.81, 0.86),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.20,
        ),
        "M_FiberRed": _build_pbr_mat(
            "M_FiberRed",
            base_srgb=(0.54, 0.21, 0.16),
            roughness=0.58,
            metallic=0.02,
            bevel_r=0.018,
            grain_scale=52.0,
            grain_bump=0.032,
        ),
        # Dedicated >= 75px UV firewall Cast Phosphor Bronze for the legendary Blish H-Lock!
        "M_BlishBronze": _build_pbr_mat(
            "M_BlishBronze",
            base_srgb=(0.81, 0.56, 0.25),
            roughness=0.23,
            metallic=0.94,
            bevel_r=0.020,
            edge_wear=0.26,
            edge_srgb=(0.95, 0.78, 0.45),
            grain_scale=30.0,
            grain_bump=0.018,
        ),
        # Dedicated >= 75px UV firewall Brass & Copper for .45 ACP spiral drum rounds!
        "M_Brass": _build_pbr_mat(
            "M_Brass",
            base_srgb=(0.86, 0.68, 0.27),
            roughness=0.21,
            metallic=0.94,
            bevel_r=0.012,
            edge_wear=0.18,
            edge_srgb=(0.96, 0.84, 0.48),
        ),
        "M_CopperJacket": _build_pbr_mat(
            "M_CopperJacket",
            base_srgb=(0.79, 0.40, 0.20),
            roughness=0.23,
            metallic=0.93,
            bevel_r=0.012,
            edge_wear=0.18,
            edge_srgb=(0.92, 0.58, 0.34),
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


def mk_helical_lands(name: str, count: int, bore_r: float, depth: float, width: float, x0: float, x1: float, twist_cm: float, segs_x: int = 26, mat=None):
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
# High-Detail Sculpted Thompson M1928A1 Builders (22 Watertight Solid Parts)
# =============================================================================
def build_thompson_barrel(mats):
    m_bl, m_pol = mats["M_BluedSteel"], mats["M_PolishedSteel"]
    pts = [(0.57, -13.30), (1.32, -13.30), (1.32, -11.20), (1.18, -11.00)]
    # 28 deeply machined radial cooling fins across [-10.8, +10.6]
    fin_count = 28
    x0_all, x1_all = -10.80, 10.60
    pitch = (x1_all - x0_all) / fin_count
    for i in range(fin_count):
        xa = x0_all + i * pitch
        xb = xa + pitch * 0.36
        xc = xa + pitch * 0.56
        xd = xa + pitch * 0.94
        r_peak = 1.25 - (i / fin_count) * 0.16
        r_root = 0.90 - (i / fin_count) * 0.08
        pts.extend([(r_root, xa), (r_peak, xb), (r_peak, xc), (r_root, xd)])
    pts.extend([(0.82, 10.90), (0.82, 13.30), (0.57, 13.30), (0.57, -13.30)])

    outer = mk_lathe_x("th_bbl_o", pts, segs=38, mat=m_bl)
    lands = mk_helical_lands("th_land", 6, 0.57, 0.016, 0.18, -10.5, 13.0, 40.6, segs_x=24, mat=m_pol)
    return finish_part(join_objects([outer, *lands], "thompson_barrel"), sharp_deg=36.0)


def build_thompson_cutts_comp(mats):
    m_bl = mats["M_BluedSteel"]
    body = mk_lathe_x(
        "th_cc_b",
        [
            (0.62, -3.60), (1.06, -3.60), (1.06, -1.60), (1.28, -1.20),
            (1.28, 2.25), (1.10, 2.48), (1.10, 3.55), (0.94, 3.64),
            (0.62, 3.64), (0.62, -3.60),
        ],
        segs=36, mat=m_bl,
    )
    slots = [
        mk_box(f"c_cc_s{i}", 0.46, 1.50, 1.65, [("rz", -0.24), ("t", -0.75 + i * 0.72, 1.08, 0.0)], mat=m_bl)
        for i in range(4)
    ]
    body = bool_subtract(body, slots)
    ring_boss = mk_cyl("th_cc_rb", 1.28, 1.28, 1.25, axis="x", segs=28, xform=[("t", 2.65, 0.0, 0.0)], mat=m_bl, bevel=0.04)
    ring_boss = bool_subtract(ring_boss, [mk_cyl("c_cc_rb", 0.65, 0.65, 1.60, axis="x", segs=24, xform=[("t", 2.65, 0.0, 0.0)], mat=m_bl)])
    post = mk_extrude_z("th_cc_fs", [(-0.85, 0.0), (0.75, 0.0), (0.45, 1.45), (-0.15, 1.45)], -0.14, 0.14, bevel=0.02, xform=[("t", 2.65, 1.15, 0.0)], mat=m_bl)
    return finish_part(join_objects([body, ring_boss, post], "thompson_cutts_comp"), sharp_deg=36.0)


def build_thompson_bolt(mats):
    m_pol, m_bl = mats["M_PolishedSteel"], mats["M_BluedSteel"]
    main = mk_box("th_bt_m", 9.40, 2.35, 2.26, mat=m_pol, bevel=0.12)
    nose = mk_box("th_bt_n", 2.25, 2.06, 1.86, [("t", 4.60, 0.0, 0.0)], mat=m_pol, bevel=0.08)
    blish_slot = mk_box("c_bt_bs", 1.88, 2.75, 2.65, [("rz", 0.32), ("t", 1.40, 0.25, 0.0)], mat=m_pol)
    sp_bore = mk_cyl("c_bt_sp", 0.56, 0.56, 5.50, axis="x", segs=20, xform=[("t", -2.40, 0.0, 0.0)], mat=m_pol)
    main = bool_subtract(main, [blish_slot, sp_bore])
    extractor = mk_box("th_bt_ex", 4.30, 0.44, 0.28, [("t", 3.20, 0.26, 1.14)], mat=m_bl, bevel=0.03)
    return finish_part(join_objects([main, nose, extractor], "thompson_bolt"), sharp_deg=34.0)


def build_thompson_blish_lock(mats):
    m_brz = mats["M_BlishBronze"]
    bridge = mk_box("th_bl_br", 1.56, 1.15, 2.86, mat=m_brz, bevel=0.06)
    ear_r = mk_box("th_bl_er", 1.78, 2.48, 0.64, [("rz", -0.55), ("t", 0.15, 0.12, 1.26)], mat=m_brz, bevel=0.07)
    ear_l = mk_box("th_bl_el", 1.78, 2.48, 0.64, [("rz", -0.55), ("t", 0.15, 0.12, -1.26)], mat=m_brz, bevel=0.07)
    top_lug = mk_box("th_bl_tl", 1.18, 0.88, 1.06, [("t", -0.15, 0.86, 0.0)], mat=m_brz, bevel=0.05)
    return finish_part(join_objects([bridge, ear_r, ear_l, top_lug], "thompson_blish_lock"), sharp_deg=34.0)


def build_thompson_actuator(mats):
    m_pol = mats["M_PolishedSteel"]
    bar = mk_box("th_ac_b", 6.80, 0.66, 0.92, [("t", 0.40, -0.35, 0.0)], mat=m_pol, bevel=0.05)
    stem = mk_cyl("th_ac_s", 0.42, 0.48, 0.92, axis="y", segs=24, xform=[("t", -0.80, 0.25, 0.0)], mat=m_pol, bevel=0.04)
    knob = mk_cyl("th_ac_k", 1.06, 0.98, 0.72, axis="y", segs=32, xform=[("t", -0.80, 0.88, 0.0)], mat=m_pol, bevel=0.08)
    knob = bool_subtract(knob, [mk_box("c_ac_v", 2.50, 0.70, 0.42, [("t", -0.80, 1.14, 0.0)], mat=m_pol)])
    return finish_part(join_objects([bar, stem, knob], "thompson_actuator"), sharp_deg=34.0)


def build_thompson_hammer_pin(mats):
    m_pol, m_bl = mats["M_PolishedSteel"], mats["M_BluedSteel"]
    pin = mk_lathe_x("th_hp_p", [(0.0, -1.60), (0.24, -1.60), (0.24, 0.82), (0.12, 1.46), (0.04, 1.72), (0.0, 1.76)], segs=20, mat=m_pol)
    hammer = mk_box("th_hp_h", 0.96, 1.48, 0.48, [("rz", -0.22), ("t", -1.35, -0.25, 0.0)], mat=m_bl, bevel=0.04)
    return finish_part(join_objects([pin, hammer], "thompson_hammer_pin"), sharp_deg=34.0)


def build_thompson_buffer_pilot(mats):
    m_bl, m_fib = mats["M_BluedSteel"], mats["M_FiberRed"]
    rod = mk_lathe_x(
        "th_bp_r",
        [(0.0, -3.12), (0.52, -3.12), (0.52, -2.10), (1.18, -2.05), (1.18, -1.35), (0.34, -1.30), (0.34, 4.62), (0.0, 4.66)],
        segs=26, mat=m_bl,
    )
    disc = mk_cyl("th_bp_d", 1.24, 1.24, 0.58, axis="x", segs=28, xform=[("t", -1.68, 0.0, 0.0)], mat=m_fib, bevel=0.05)
    return finish_part(join_objects([rod, disc], "thompson_buffer_pilot"), sharp_deg=36.0)


def build_thompson_oiler(mats):
    m_brz, m_fib = mats["M_BlishBronze"], mats["M_FiberRed"]
    p_r = mk_box("th_oi_r", 2.40, 1.76, 0.34, [("t", 0.0, 0.0, 1.32)], mat=m_brz, bevel=0.04)
    p_l = mk_box("th_oi_l", 2.40, 1.76, 0.34, [("t", 0.0, 0.0, -1.32)], mat=m_brz, bevel=0.04)
    felt_r = mk_box("th_oi_fr", 1.95, 1.42, 0.16, [("t", 0.0, 0.0, 1.15)], mat=m_fib, bevel=0.02)
    felt_l = mk_box("th_oi_fl", 1.95, 1.42, 0.16, [("t", 0.0, 0.0, -1.15)], mat=m_fib, bevel=0.02)
    arch = mk_box("th_oi_a", 1.80, 0.28, 2.86, [("t", 0.0, -0.82, 0.0)], mat=m_brz, bevel=0.03)
    return finish_part(join_objects([p_r, p_l, felt_r, felt_l, arch], "thompson_oiler"), sharp_deg=36.0)


def build_thompson_receiver(mats):
    m_rec, m_ctl = mats["R_DuLiteBlue"], mats["R_ControlBlue"]
    main = mk_box("th_rc_m", 25.00, 3.65, 3.45, mat=m_rec, bevel=0.12)
    nose = mk_box("th_rc_n", 4.80, 3.15, 3.35, [("t", 10.20, 0.15, 0.0)], mat=m_rec, bevel=0.10)
    drum_shelf = mk_box("th_rc_ds", 5.20, 0.95, 4.38, [("t", 6.80, -1.70, 0.0)], mat=m_ctl, bevel=0.08)
    cuts = [
        mk_box("c_rc_in", 21.80, 2.55, 2.48, [("t", -0.20, 0.10, 0.0)], mat=m_ctl),
        mk_box("c_rc_top", 15.50, 1.25, 1.12, [("t", 0.60, 1.65, 0.0)], mat=m_ctl),
        mk_box("c_rc_ej", 6.80, 1.85, 1.30, [("t", 6.60, 0.25, 1.55)], mat=m_ctl),
        mk_box("c_rc_dm", 4.40, 1.45, 3.80, [("t", 6.80, -1.65, 0.0)], mat=m_ctl),
        mk_cyl("c_rc_bb", 1.22, 1.22, 4.40, axis="x", segs=26, xform=[("t", 11.40, 0.10, 0.0)], mat=m_ctl),
    ]
    main = bool_subtract(main, cuts[:4])
    nose = bool_subtract(nose, [cuts[4]])
    drum_shelf = bool_subtract(drum_shelf, [mk_box("c_rc_dm2", 4.42, 1.45, 2.85, [("t", 6.80, -1.70, 0.0)], mat=m_ctl)])
    return finish_part(join_objects([main, nose, drum_shelf], "thompson_receiver"), sharp_deg=34.0)


def build_thompson_lyman_sight(mats):
    m_bl, m_pol = mats["R_ControlBlue"], mats["R_Polished"]
    base = mk_box("th_ly_b", 4.20, 0.66, 2.68, mat=m_bl, bevel=0.06)
    wl = mk_extrude_z("th_ly_wl", [(-1.75, 0.0), (1.75, 0.0), (1.15, 1.75), (-1.45, 1.75)], -1.32, -0.96, bevel=0.05, xform=[("t", -0.15, 0.25, 0.0)], mat=m_bl)
    wr = mk_extrude_z("th_ly_wr", [(-1.75, 0.0), (1.75, 0.0), (1.15, 1.75), (-1.45, 1.75)], 0.96, 1.32, bevel=0.05, xform=[("t", -0.15, 0.25, 0.0)], mat=m_bl)
    ladder = mk_box("th_ly_ld", 0.46, 2.88, 1.48, [("t", -1.20, 1.65, 0.0)], mat=m_bl, bevel=0.04)
    ladder = bool_subtract(ladder, [mk_box("c_ly_w", 0.95, 1.65, 0.68, [("t", -1.20, 1.65, 0.0)], mat=m_bl)])
    knob = mk_cyl("th_ly_kn", 0.34, 0.34, 2.08, axis="z", segs=20, xform=[("t", -1.20, 2.28, 0.0)], mat=m_pol, bevel=0.04)
    return finish_part(join_objects([base, wl, wr, ladder, knob], "thompson_lyman_sight"), sharp_deg=36.0)


def build_thompson_lower_frame(mats):
    m_rec, m_ctl = mats["R_DuLiteBlue"], mats["R_ControlBlue"]
    frame = mk_box("th_lf_f", 17.40, 2.26, 3.06, [("t", 0.20, 0.15, 0.0)], mat=m_rec, bevel=0.10)
    frame = bool_subtract(frame, [mk_box("c_lf_fc", 9.20, 1.68, 1.76, [("t", 0.50, 0.45, 0.0)], mat=m_ctl)])
    # Solid closed-loop milled trigger guard (front + bottom + rear!)
    tg_f = mk_box("th_lf_tf", 0.58, 2.68, 1.26, [("rz", -0.20), ("t", 4.65, -1.75, 0.0)], mat=m_ctl, bevel=0.05)
    tg_b = mk_box("th_lf_tb", 6.85, 0.54, 1.26, [("t", 1.45, -2.92, 0.0)], mat=m_ctl, bevel=0.05)
    tg_r = mk_box("th_lf_tr", 0.70, 2.48, 1.36, [("t", -1.75, -1.75, 0.0)], mat=m_ctl, bevel=0.05)
    tang = mk_box("th_lf_st", 3.45, 1.46, 2.26, [("t", -9.40, 0.15, 0.0)], mat=m_ctl, bevel=0.08)
    return finish_part(join_objects([frame, tg_f, tg_b, tg_r, tang], "thompson_lower_frame"), sharp_deg=36.0)


def build_thompson_foregrip(mats):
    m_wal, m_st = mats["W_ThompsonWalnut"], mats["W_MountSteel"]
    bar = mk_box("th_fg_b", 13.20, 1.06, 1.56, [("t", -3.80, 3.65, 0.0)], mat=m_st, bevel=0.08)
    pts = [
        (-1.35, 3.25), (1.75, 3.25), (2.35, 0.40), (1.85, -1.40),
        (2.30, -3.20), (1.85, -5.20), (2.15, -7.20), (0.85, -8.15),
        (-1.45, -7.85), (-1.85, -3.20),
    ]
    grip = mk_extrude_z("th_fg_g", pts, -1.36, 1.36, bevel=0.34, bevel_segs=4, mat=m_wal)
    return finish_part(join_objects([bar, grip], "thompson_foregrip"), sharp_deg=42.0)


def build_thompson_pistol_grip(mats):
    m_wal = mats["W_ThompsonWalnut"]
    pts = [
        (-1.35, 3.90), (2.15, 3.90), (1.80, 1.60), (1.25, -0.40),
        (0.85, -2.50), (0.35, -4.65), (-2.45, -4.25), (-2.85, -0.80), (-2.10, 2.20),
    ]
    grip = mk_extrude_z("th_pg_g", pts, -1.42, 1.42, bevel=0.34, bevel_segs=4, mat=m_wal)
    grip.name = "thompson_pistol_grip"
    return finish_part(grip, sharp_deg=42.0)


def build_thompson_buttstock(mats):
    m_wal, m_st = mats["W_ThompsonWalnut"], mats["W_MountSteel"]
    pts = [
        (-12.80, -5.65), (-12.80, 2.25), (8.50, 4.15),
        (12.80, 4.15), (12.80, 0.85), (6.20, 0.15),
    ]
    body = mk_extrude_z("th_bs_b", pts, -1.72, 1.72, bevel=0.32, bevel_segs=4, mat=m_wal)
    slide = mk_box("th_bs_sl", 4.80, 1.12, 2.65, [("t", 10.60, 4.15, 0.0)], mat=m_st, bevel=0.06)
    swivel = mk_box("th_bs_sw", 1.85, 0.96, 0.76, [("t", -8.20, -4.65, 0.0)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([body, slide, swivel], "thompson_buttstock"), sharp_deg=42.0)


def build_thompson_buttplate(mats):
    m_bl, m_rec = mats["R_ControlBlue"], mats["R_DuLiteBlue"]
    plate = mk_box("th_bp_p", 0.94, 8.22, 3.52, mat=m_bl, bevel=0.12)
    trap = mk_box("th_bp_t", 0.28, 2.45, 1.56, [("t", -0.44, 0.20, 0.0)], mat=m_rec, bevel=0.04)
    return finish_part(join_objects([plate, trap], "thompson_buttplate"), sharp_deg=36.0)


def build_thompson_trigger(mats):
    m_bl = mats["R_ControlBlue"]
    head = mk_box("th_tr_h", 2.00, 1.06, 0.65, [("t", 0.0, 0.65, 0.0)], mat=m_bl, bevel=0.04)
    blade = mk_box("th_tr_b", 0.58, 1.98, 0.52, [("rz", 0.26), ("t", 0.15, -0.68, 0.0)], mat=m_bl, bevel=0.05)
    return finish_part(join_objects([head, blade], "thompson_trigger"), sharp_deg=36.0)


def build_thompson_sear(mats):
    m_pol, m_bl = mats["R_Polished"], mats["R_ControlBlue"]
    bar = mk_box("th_sr_b", 3.40, 0.78, 0.88, mat=m_pol, bevel=0.04)
    nose = mk_box("th_sr_n", 1.06, 0.96, 0.92, [("t", -1.05, 0.55, 0.0)], mat=m_bl, bevel=0.04)
    return finish_part(join_objects([bar, nose], "thompson_sear"), sharp_deg=36.0)


def build_thompson_selector_levers(mats):
    m_bl = mats["R_ControlBlue"]
    parts = []
    for idx, ox in enumerate((-1.45, 1.55)):
        boss = mk_cyl(f"th_sl_b{idx}", 0.46, 0.46, 0.56, axis="z", segs=20, xform=[("t", ox, 0.0, 0.0)], mat=m_bl, bevel=0.04)
        paddle = mk_box(f"th_sl_p{idx}", 1.88, 0.54, 0.34, [("t", ox + 0.75, 0.0, -0.22)], mat=m_bl, bevel=0.04)
        parts.extend([boss, paddle])
    return finish_part(join_objects(parts, "thompson_selector_levers"), sharp_deg=36.0)


def build_thompson_mag_catch(mats):
    m_bl = mats["R_ControlBlue"]
    arm = mk_box("th_mc_a", 2.82, 0.68, 0.44, mat=m_bl, bevel=0.04)
    pad = mk_cyl("th_mc_p", 0.48, 0.48, 0.54, axis="z", segs=20, xform=[("t", -1.25, -0.25, -0.22)], mat=m_bl, bevel=0.05)
    return finish_part(join_objects([arm, pad], "thompson_mag_catch"), sharp_deg=36.0)


def build_thompson_drum_mag(mats):
    m_dr = mats["M_DrumBlue"]
    outer = mk_cyl("th_dm_o", 8.26, 8.26, 4.36, axis="x", segs=48, mat=m_dr, bevel=0.18)
    neck = mk_box("th_dm_nk", 4.36, 2.30, 2.68, [("t", 0.0, 7.65, 0.0)], mat=m_dr, bevel=0.10)
    cav = mk_cyl("c_dm_cav", 7.66, 7.66, 3.68, axis="x", segs=44, mat=m_dr)
    mouth = mk_box("c_dm_mth", 3.78, 2.50, 1.56, [("t", 0.0, 7.85, 0.0)], mat=m_dr)
    outer = bool_subtract(outer, [cav])
    neck = bool_subtract(neck, [mouth])
    # Iconic stamped circular reinforcing beads on front & rear faces + top T-rail lips
    bead_f = mk_cyl("th_dm_bf", 6.10, 6.10, 0.20, axis="x", segs=44, xform=[("t", 2.16, 0.0, 0.0)], mat=m_dr, bevel=0.04)
    bead_f = bool_subtract(bead_f, [mk_cyl("c_dm_bf", 5.65, 5.65, 0.40, axis="x", segs=40, xform=[("t", 2.16, 0.0, 0.0)], mat=m_dr)])
    bead_r = mk_cyl("th_dm_br", 6.10, 6.10, 0.20, axis="x", segs=44, xform=[("t", -2.16, 0.0, 0.0)], mat=m_dr, bevel=0.04)
    bead_r = bool_subtract(bead_r, [mk_cyl("c_dm_br", 5.65, 5.65, 0.40, axis="x", segs=40, xform=[("t", -2.16, 0.0, 0.0)], mat=m_dr)])
    t_rail_l = mk_box("th_dm_tl", 4.40, 0.42, 0.56, [("t", 0.0, 8.32, -1.42)], mat=m_dr, bevel=0.04)
    t_rail_r = mk_box("th_dm_tr", 4.40, 0.42, 0.56, [("t", 0.0, 8.32, 1.42)], mat=m_dr, bevel=0.04)
    return finish_part(join_objects([outer, neck, bead_f, bead_r, t_rail_l, t_rail_r], "thompson_drum_mag"), sharp_deg=36.0)


def build_thompson_drum_rotor(mats):
    m_pol, m_bl = mats["M_PolishedSteel"], mats["M_BluedSteel"]
    hub = mk_cyl("th_dr_h", 2.15, 2.15, 3.55, axis="x", segs=32, mat=m_pol, bevel=0.08)
    parts = [hub]
    # 4 radial clockwork sweeper spider arms!
    for i in range(4):
        a = (i / 4.0) * 2.0 * math.pi + 0.35
        arm = mk_box(f"th_dr_a{i}", 0.55, 7.35, 0.72, [("t", 0.0, 3.65, 0.0), ("rx", a)], mat=m_pol, bevel=0.04)
        parts.append(arm)
    # Exterior front-face folding clockwork winding key (`local X = +2.55`)
    key_shaft = mk_cyl("th_dr_ks", 0.68, 0.68, 0.72, axis="x", segs=24, xform=[("t", 2.18, 0.0, 0.0)], mat=m_bl, bevel=0.05)
    key_blade = mk_box("th_dr_kb", 0.38, 6.25, 1.48, [("t", 2.56, 0.0, 0.0)], mat=m_bl, bevel=0.06)
    key_tab = mk_box("th_dr_kt", 0.72, 1.65, 1.15, [("t", 2.75, 2.25, 0.0)], mat=m_bl, bevel=0.05)
    parts.extend([key_shaft, key_blade, key_tab])
    return finish_part(join_objects(parts, "thompson_drum_rotor"), sharp_deg=36.0)


def build_thompson_drum_rounds(mats):
    m_br, m_cu = mats["M_Brass"], mats["M_CopperJacket"]
    parts = []
    # 28 crisp .45 ACP 230gr brass/copper cartridges nested along concentric Archimedean spiral tracks!
    count = 28
    for i in range(count):
        t = i / (count - 1)
        theta = t * math.pi * 3.55 + 0.25
        radius = 3.15 + t * 3.85
        cy = math.cos(theta) * radius
        cz = math.sin(theta) * radius
        case = mk_lathe_x(
            f"th_rd_c{i}",
            [(0.0, -1.62), (0.60, -1.62), (0.60, -1.45), (0.53, -1.40), (0.60, -1.30), (0.59, 0.66), (0.0, 0.66)],
            segs=16, xform=[("t", 0.0, cy, cz)], mat=m_br,
        )
        bullet = mk_lathe_x(
            f"th_rd_b{i}",
            [(0.0, 0.62), (0.57, 0.68), (0.54, 1.12), (0.36, 1.48), (0.0, 1.62)],
            segs=16, xform=[("t", 0.0, cy, cz)], mat=m_cu,
        )
        parts.extend([case, bullet])
    return finish_part(join_objects(parts, "thompson_drum_rounds"), sharp_deg=36.0)


# =============================================================================
# UV Unwrapping, Hero Bands & >=75px Accent Firewalls (Bronze Blish & .45 Brass)
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
        if mn == "W_MountSteel":
            return "STEEL_HW"
        if on == "thompson_buttstock":
            nz = -f.normal.y
            tz = -f.calc_center_median().y
            if nz < -0.55 and tz < -0.35:
                return "HERO_LEFT"
            if nz > 0.55 and tz > 0.35:
                return "HERO_RIGHT"
        return "PACK_WOOD"

    _smart_unwrap_and_pack_rect(walnut_objs, 0.010, 0.660, 0.010, 0.340, lambda on, f, mn: classify(on, f, mn) == "PACK_WOOD", "walnut_wood")
    _smart_unwrap_and_pack_rect(walnut_objs, 0.700, 0.990, 0.010, 0.340, lambda on, f, mn: classify(on, f, mn) == "STEEL_HW", "walnut_hw")
    stk = next(o for o in walnut_objs if o.name == "thompson_buttstock")
    bm = bmesh.new()
    bm.from_mesh(stk.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in stk.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify("thompson_buttstock", f, mn)
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-12.8)) / 25.6))
            yn = max(0.0, min(1.0, (vco.z - (-5.7)) / 9.9))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.680 + yn * 0.305)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.365 + yn * 0.300)
    bm.to_mesh(stk.data)
    bm.free()


def unwrap_receiver_atlas(recv_objs):
    def classify(on, f, mn):
        if on == "thompson_receiver":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            nz = -n.y
            if -12.4 <= tx <= 12.4 and -1.85 <= ty <= 1.85:
                if nz < -0.78 and tz < -1.45:
                    return "HERO_LEFT"
                if nz > 0.78 and tz > 1.45:
                    return "HERO_RIGHT"
            return "PACK_REC"
        return "PACK_HW"

    _smart_unwrap_and_pack_rect(recv_objs, 0.010, 0.560, 0.010, 0.545, lambda on, f, mn: classify(on, f, mn) == "PACK_REC", "recv_rest")
    _smart_unwrap_and_pack_rect(recv_objs, 0.590, 0.990, 0.010, 0.545, lambda on, f, mn: classify(on, f, mn) == "PACK_HW", "recv_hw")
    rec = next(o for o in recv_objs if o.name == "thompson_receiver")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cls = classify("thompson_receiver", f, "")
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-12.4)) / 24.8))
            yn = max(0.0, min(1.0, (vco.z - (-1.85)) / 3.70))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.785 + yn * 0.200)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.575 + yn * 0.190)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_metal_atlas(metal_objs):
    def classify(on, f, mn):
        if mn == "M_BlishBronze":
            return "BRONZE_FW"
        if mn in ("M_Brass", "M_CopperJacket"):
            return "BRASS_FW"
        if mn == "M_PolishedSteel":
            return "BRIGHT_ST"
        if on == "thompson_drum_mag":
            c, n = f.calc_center_median(), f.normal
            if n.x > 0.78 and c.x > 1.95:
                return "HERO_DRUM"
        return "BLUED_ST"

    # Strict >= 0.040 (~82px!) UV firewalls isolating Cast Bronze Blish Lock AND .45 ACP Brass!
    _smart_unwrap_and_pack_rect(metal_objs, 0.500, 0.990, 0.530, 0.990, lambda on, f, mn: classify(on, f, mn) == "BLUED_ST", "metal_blued")
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.430, 0.010, 0.485, lambda on, f, mn: classify(on, f, mn) == "BRIGHT_ST", "metal_bright")
    _smart_unwrap_and_pack_rect(metal_objs, 0.470, 0.700, 0.010, 0.485, lambda on, f, mn: classify(on, f, mn) == "BRONZE_FW", "metal_bronze")
    _smart_unwrap_and_pack_rect(metal_objs, 0.740, 0.990, 0.010, 0.485, lambda on, f, mn: classify(on, f, mn) == "BRASS_FW", "metal_brass")

    drum = next(o for o in metal_objs if o.name == "thompson_drum_mag")
    bm = bmesh.new()
    bm.from_mesh(drum.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if classify("thompson_drum_mag", f, "") != "HERO_DRUM":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            ty, tz = vco.z, -vco.y
            un = max(0.0, min(1.0, (tz + 8.30) / 16.60))
            vn = max(0.0, min(1.0, (ty + 8.30) / 16.60))
            loop[uv_layer].uv = (0.020 + un * 0.440, 0.540 + vn * 0.440)
    bm.to_mesh(drum.data)
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
    run_bake("roughness", "EMIT", 2, (0.34, 0.34, 0.34, 1.0))
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
        print(f"  [OK] {o.name:26s} tris={tris:6d} vol={vol:8.2f}")
    print(f"[VERIFY] All {len(all_objs)} solid Thompson parts watertight | total_tris={total_tris:,}")


def main():
    t0 = time.time()
    reset_scene()
    mats = create_material_library()
    builders = {
        "thompson_foregrip":        build_thompson_foregrip,
        "thompson_pistol_grip":     build_thompson_pistol_grip,
        "thompson_buttstock":       build_thompson_buttstock,
        "thompson_receiver":        build_thompson_receiver,
        "thompson_lyman_sight":     build_thompson_lyman_sight,
        "thompson_lower_frame":     build_thompson_lower_frame,
        "thompson_buttplate":       build_thompson_buttplate,
        "thompson_trigger":         build_thompson_trigger,
        "thompson_sear":            build_thompson_sear,
        "thompson_selector_levers": build_thompson_selector_levers,
        "thompson_mag_catch":       build_thompson_mag_catch,
        "thompson_barrel":          build_thompson_barrel,
        "thompson_cutts_comp":      build_thompson_cutts_comp,
        "thompson_bolt":            build_thompson_bolt,
        "thompson_blish_lock":      build_thompson_blish_lock,
        "thompson_actuator":        build_thompson_actuator,
        "thompson_hammer_pin":      build_thompson_hammer_pin,
        "thompson_buffer_pilot":    build_thompson_buffer_pilot,
        "thompson_oiler":           build_thompson_oiler,
        "thompson_drum_mag":        build_thompson_drum_mag,
        "thompson_drum_rotor":      build_thompson_drum_rotor,
        "thompson_drum_rounds":     build_thompson_drum_rounds,
    }
    print("[BUILD] Sculpting all 22 solid Thompson M1928A1 (.45 ACP) parts...")
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
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot:.4f}")

    with tempfile.TemporaryDirectory(prefix="thompson_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir, (0.09, 0.035, 0.015, 1.0))
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, (0.04, 0.05, 0.08, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.04, 0.05, 0.08, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "thompson_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "thompson_v3_walnut_normal.webp",
        TEX_OUT_DIR / "thompson_v3_walnut_roughness.webp",
        TEX_OUT_DIR / "thompson_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "thompson_v3_receiver_normal.webp",
        TEX_OUT_DIR / "thompson_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "thompson_v3_metal_albedo.webp",
        TEX_OUT_DIR / "thompson_v3_metal_normal.webp",
        TEX_OUT_DIR / "thompson_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== THOMPSON M1928A1 COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 10.0, f"Thompson asset budget exceeded: {total_mb:.2f} MB > 10.0 MB"


if __name__ == "__main__":
    main()
