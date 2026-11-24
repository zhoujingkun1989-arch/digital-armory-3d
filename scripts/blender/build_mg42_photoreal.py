#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for MG 42 General-Purpose Machine Gun (7.92x57mm Mauser)
==================================================================================================
MIT License — Digital Armory 3D (V6.0 Track C1b · BAY-31)

Generates:
  - public/models/mg42.glb (Draco-compressed glTF 2.0, all 22 watertight solid parts; skips ONLY
    the 3 dynamically GPU-compressed `aSpringParam` CSG springs: `mg42_recoil_spring`,
    `mg42_buffer_spring`, `mg42_sear_spring`)
  - public/textures/mg42_v3_shroud_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM, 0 alpha)
  - public/textures/mg42_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/mg42_v3_metal_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM, 0 alpha)

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
# MODE 2: System Python Post-Process (MG 42 cra 1943 Rollmarks, Gurttrommel 34
#         Stencil, S/F Safety Markings, RNM Normal Blend & 5-Ch Packed ORM)
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
    FONT_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
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

    def _draw_ordnance_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, code: str) -> None:
        draw.rectangle((cx - r * 1.15, cy - r * 0.85, cx + r * 1.15, cy + r * 0.85), outline=240, width=max(3, int(r * 0.12)))
        draw.text((cx, cy - r * 0.22), "WaA", fill=250, font=_load_font(FONT_COND, int(r * 0.62)), anchor="mm")
        draw.text((cx, cy + r * 0.34), code, fill=250, font=_load_font(FONT_DIN, int(r * 0.58)), anchor="mm")

    # =========================================================================
    # SUITE 1: mg42_v3_shroud (Receiver/Shroud, Top Cover, Latch, Booster, AA Sight, Bipod)
    # =========================================================================
    def process_shroud_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "shroud_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "shroud_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "shroud_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "shroud_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "shroud_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "shroud_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "shroud_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Receiver Hero Flanks: X in [-15.5, +15.5], Y in [-1.45, +3.45] (span 31.0 x 4.9 cm)
        CW, CH = 3800, 720
        engr_w = np.zeros((h, w), dtype=np.float32)

        # Left Flank Hero Band: v in [0.785, 0.985] — MG 42 / cra 1943 / 4812 d / WaA 749
        l_img = Image.new("L", (CW, CH), 0)
        dl = ImageDraw.Draw(l_img)
        dl.text((int(CW * 0.16), int(CH * 0.28)), "MG 42", fill=255, font=_load_font(FONT_DIN, 155), anchor="lm")
        dl.text((int(CW * 0.38), int(CH * 0.28)), "cra   1943", fill=248, font=_load_font(FONT_DIN, 118), anchor="lm")
        dl.text((int(CW * 0.16), int(CH * 0.66)), "4812 d    ·    KAL. 7,92 x 57", fill=236, font=_load_font(FONT_COND, 92), anchor="lm")
        _draw_ordnance_proof(dl, CW * 0.74, CH * 0.48, 84.0, "749")
        _paste_uv_band(engr_w, l_img, 0.015, 0.985, 0.785, 0.985)

        # Right Flank Hero Band: v in [0.575, 0.765] — Factory stamp & quick-change warning (clear of charging rail!)
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        dr.text((int(CW * 0.14), int(CH * 0.19)), "MG 42   ·   MAGET BERLIN", fill=245, font=_load_font(FONT_COND, 98), anchor="lm")
        dr.text((int(CW * 0.14), int(CH * 0.76)), "LAUFWECHSEL  ->   PATR. 7,92", fill=232, font=_load_font(FONT_COND, 86), anchor="lm")
        _draw_ordnance_proof(dr, CW * 0.80, CH * 0.76, 68.0, "749")
        _paste_uv_band(engr_w, r_img, 0.015, 0.985, 0.575, 0.765)

        silver_w = ndimage.gaussian_filter(engr_w, sigma=0.55) * 0.58
        _mix(albedo, (0.74, 0.77, 0.81), silver_w * 0.46)
        _mix(rgh, 0.24, silver_w * 0.45)
        ao *= 1.0 - 0.34 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.56 * engr_w, strength=4.8))
        rgh = np.clip(rgh, 0.16, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "mg42_v3_shroud_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "mg42_v3_shroud_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "mg42_v3_shroud_roughness.webp", 93)
        print("[POST] Saved mg42_v3_shroud_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: mg42_v3_furniture (Buttstock, Grip Frame, 50-Rd Gurttrommel Drum, Feed Tray/Pawl)
    # =========================================================================
    def process_furniture_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "furn_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "furn_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "furn_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "furn_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "furn_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "furn_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "furn_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Gurttrommel 34 Drum Side Stencil Hero Band: u in [0.02, 0.48], v in [0.56, 0.98]
        DW = 1024
        d_img = Image.new("L", (DW, DW), 0)
        dd = ImageDraw.Draw(d_img)
        dd.ellipse((148, 148, DW - 148, DW - 148), outline=195, width=10)
        dd.text((DW // 2, int(DW * 0.34)), "GURTTROMMEL 34", fill=245, font=_load_font(FONT_COND, 68), anchor="mm")
        dd.text((DW // 2, int(DW * 0.50)), "50 PATR. 7,92", fill=255, font=_load_font(FONT_DIN, 74), anchor="mm")
        dd.text((DW // 2, int(DW * 0.66)), "cra   1943", fill=230, font=_load_font(FONT_COND, 56), anchor="mm")

        stencil = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(stencil, d_img, 0.020, 0.470, 0.570, 0.980)
        stencil_s = ndimage.gaussian_filter(stencil, sigma=0.55) * 0.80
        # Crisp painted white-cream military stencil on Feldgrau steel drum!
        _mix(albedo, (0.86, 0.85, 0.78), stencil_s * 0.72)
        _mix(rgh, 0.52, stencil_s * 0.55)
        _mix(met, 0.12, stencil_s * 0.70)

        rgh = np.clip(rgh, 0.18, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "mg42_v3_furniture_albedo.webp", 92)
        _save_webp_rgb(nrm, out_dir / "mg42_v3_furniture_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "mg42_v3_furniture_roughness.webp", 93)
        print("[POST] Saved mg42_v3_furniture_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: mg42_v3_metal (Barrel, Rollers, Bolt Head, Wedge, Carrier, Buffer, Belt w/ UV Firewall)
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

        rgh = np.clip(rgh, 0.14, 0.88)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "mg42_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm, out_dir / "mg42_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "mg42_v3_metal_roughness.webp", 93)
        print("[POST] Saved mg42_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    process_shroud_atlas()
    process_furniture_atlas()
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
MODELS_OUT = REPO_ROOT / "public" / "models" / "mg42.glb"
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


SHROUD_PARTS = [
    "mg42_receiver_shroud",
    "mg42_top_cover",
    "mg42_barrel_latch",
    "mg42_muzzle_booster",
    "mg42_aa_sight",
    "mg42_bipod",
]

FURNITURE_PARTS = [
    "mg42_buttstock",
    "mg42_grip_frame",
    "mg42_ammo_drum",
    "mg42_feed_tray",
    "mg42_feed_pawl",
]

METAL_PARTS = [
    "mg42_barrel",
    "mg42_bolt_head",
    "mg42_locking_rollers",
    "mg42_locking_roller_left",
    "mg42_locking_wedge",
    "mg42_bolt_carrier",
    "mg42_charging_handle",
    "mg42_recoil_buffer",
    "mg42_trigger",
    "mg42_sear",
    "mg42_ammo_belt",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "mg42_receiver_shroud",
    "mg42_top_cover",
    "mg42_barrel_latch",
    "mg42_muzzle_booster",
    "mg42_aa_sight",
    "mg42_bipod",
    "mg42_buttstock",
    "mg42_grip_frame",
    "mg42_ammo_drum",
    "mg42_charging_handle",
    "mg42_trigger",
    "mg42_barrel",
}

ASSEMBLED_POS = {
    "mg42_barrel":              ( 44.50,  1.50,  0.00),
    "mg42_muzzle_booster":      ( 76.50,  1.50,  0.00),
    "mg42_barrel_latch":        ( 21.20,  1.50,  2.35),
    "mg42_bolt_head":           ( 10.00,  1.50,  0.00),
    "mg42_locking_rollers":     ( 10.80,  1.50,  0.92),
    "mg42_locking_roller_left": ( 10.80,  1.50, -0.92),
    "mg42_locking_wedge":       (  7.80,  1.50,  0.00),
    "mg42_bolt_carrier":        (  4.20,  1.50,  0.00),
    "mg42_charging_handle":     (  5.50,  1.50,  2.72),
    "mg42_recoil_buffer":       (-15.20,  1.50,  0.00),
    "mg42_receiver_shroud":     (  0.00,  0.00,  0.00),
    "mg42_top_cover":           ( 16.80,  3.60,  0.00),
    "mg42_aa_sight":            ( 22.80,  3.95,  0.00),
    "mg42_bipod":               ( 64.50, -1.55,  0.00),
    "mg42_buttstock":           (-28.80, -0.35,  0.00),
    "mg42_grip_frame":          ( -2.20, -3.95,  0.00),
    "mg42_trigger":             ( -0.20, -3.15,  0.00),
    "mg42_sear":                ( -2.20, -1.10,  0.00),
    "mg42_feed_tray":           ( 11.80,  2.55,  0.00),
    "mg42_feed_pawl":           ( 10.80,  3.30,  0.00),
    "mg42_ammo_belt":           ( 11.80,  1.35, -3.60),
    "mg42_ammo_drum":           ( 11.80, -2.20, -6.40),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "mg42_recoil_spring",
    "mg42_buffer_spring",
    "mg42_sear_spring",
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
    edge_srgb: tuple[float, float, float] = (0.76, 0.79, 0.83),
    grain_scale: float = 42.0,
    grain_bump: float = 0.026,
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
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.13),
        min(1.0, base_srgb[2] * 1.14),
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
        mix_er.inputs[3].default_value = max(0.16, roughness - 0.14)
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


def _build_bakelite_mat(name: str = "F_Bakelite") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.45, 1.35, 1.15)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    # Primary swirling phenolic Bakelite marbling (multi-scale, rich reddish-brown)
    n_swirl = nt.nodes.new("ShaderNodeTexNoise")
    n_swirl.inputs["Scale"].default_value = 1.45
    n_swirl.inputs["Detail"].default_value = 8.0
    n_swirl.inputs["Roughness"].default_value = 0.62
    n_swirl.inputs["Distortion"].default_value = 3.2
    nt.links.new(mp.outputs["Vector"], n_swirl.inputs["Vector"])

    # Secondary fine cellulose/wood-flour filler speckles authentic to wartime German Bakelite
    n_fine = nt.nodes.new("ShaderNodeTexNoise")
    n_fine.inputs["Scale"].default_value = 18.0
    n_fine.inputs["Detail"].default_value = 6.0
    n_fine.inputs["Roughness"].default_value = 0.68
    nt.links.new(tc.outputs["Object"], n_fine.inputs["Vector"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.24
    cr.elements[0].color = srgb_to_lin(0.205, 0.068, 0.036)  # Deep oxblood phenolic dark
    cr.elements[1].position = 0.78
    cr.elements[1].color = srgb_to_lin(0.515, 0.235, 0.118)  # Warm amber-russet swirl
    e_mid = cr.elements.new(0.52)
    e_mid.color = srgb_to_lin(0.365, 0.145, 0.072)           # Classic Wehrmacht reddish-brown Bakelite
    nt.links.new(n_swirl.outputs["Fac"], ramp.inputs["Fac"])

    fine_fac = nt.nodes.new("ShaderNodeMath")
    fine_fac.operation = "MULTIPLY"
    fine_fac.inputs[1].default_value = 0.28
    nt.links.new(n_fine.outputs["Fac"], fine_fac.inputs[0])

    mix_f = nt.nodes.new("ShaderNodeMix")
    mix_f.data_type = "RGBA"
    mix_f.inputs[7].default_value = srgb_to_lin(0.465, 0.205, 0.102)
    nt.links.new(fine_fac.outputs["Value"], mix_f.inputs[0])
    nt.links.new(ramp.outputs["Color"], mix_f.inputs[6])
    nt.links.new(mix_f.outputs[2], bsdf.inputs["Base Color"])

    # Refined satin-oiled Bakelite roughness (R = 0.34-0.43, never flat matte plastic!)
    rmap = nt.nodes.new("ShaderNodeMapRange")
    rmap.clamp = True
    rmap.inputs["From Min"].default_value = 0.22
    rmap.inputs["From Max"].default_value = 0.78
    rmap.inputs["To Min"].default_value = 0.34
    rmap.inputs["To Max"].default_value = 0.43
    nt.links.new(n_swirl.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    # Subtle phenolic resin micro-texture + soft molded edge bevel
    h_mix = nt.nodes.new("ShaderNodeMix")
    h_mix.data_type = "FLOAT"
    h_mix.inputs["Factor"].default_value = 0.45
    nt.links.new(n_swirl.outputs["Fac"], h_mix.inputs[2])
    nt.links.new(n_fine.outputs["Fac"], h_mix.inputs[3])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.026
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.052
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(h_mix.outputs[0], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # AgX calibrated stamped steel (sRGB 0.20-0.28, R=0.26-0.36, zero black crush!)
        "S_StampedSteel": _build_pbr_mat(
            "S_StampedSteel",
            base_srgb=(0.214, 0.230, 0.256),
            roughness=0.30,
            metallic=0.89,
            bevel_r=0.028,
            edge_wear=0.58,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=38.0,
            grain_bump=0.022,
            aniso_stretch=(0.55, 2.8, 2.8),
        ),
        "S_PhosphateDark": _build_pbr_mat(
            "S_PhosphateDark",
            base_srgb=(0.192, 0.206, 0.226),
            roughness=0.35,
            metallic=0.87,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=46.0,
            grain_bump=0.026,
        ),
        "F_Bakelite": _build_bakelite_mat("F_Bakelite"),
        "F_FieldGray": _build_pbr_mat(
            "F_FieldGray",
            base_srgb=(0.282, 0.324, 0.290),
            roughness=0.39,
            metallic=0.66,
            bevel_r=0.026,
            edge_wear=0.48,
            edge_srgb=(0.70, 0.73, 0.76),
            grain_scale=36.0,
            grain_bump=0.022,
        ),
        "F_Steel": _build_pbr_mat(
            "F_Steel",
            base_srgb=(0.222, 0.238, 0.262),
            roughness=0.29,
            metallic=0.89,
            bevel_r=0.024,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.81, 0.86),
        ),
        "F_Polished": _build_pbr_mat(
            "F_Polished",
            base_srgb=(0.74, 0.77, 0.82),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.22,
        ),
        "M_BarrelBlue": _build_pbr_mat(
            "M_BarrelBlue",
            base_srgb=(0.195, 0.214, 0.256),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.52,
            aniso_stretch=(4.0, 0.5, 0.5),
        ),
        "M_CarrierSteel": _build_pbr_mat(
            "M_CarrierSteel",
            base_srgb=(0.235, 0.250, 0.275),
            roughness=0.29,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.45,
        ),
        "M_PolishedSteel": _build_pbr_mat(
            "M_PolishedSteel",
            base_srgb=(0.76, 0.79, 0.84),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.20,
        ),
        "M_RollerChrome": _build_pbr_mat(
            "M_RollerChrome",
            base_srgb=(0.86, 0.88, 0.92),
            roughness=0.15,
            metallic=0.97,
            bevel_r=0.016,
            edge_wear=0.15,
        ),
        "M_BeltLink": _build_pbr_mat(
            "M_BeltLink",
            base_srgb=(0.205, 0.218, 0.238),
            roughness=0.35,
            metallic=0.86,
            bevel_r=0.014,
            edge_wear=0.35,
        ),
        "M_Brass": _build_pbr_mat(
            "M_Brass",
            base_srgb=(0.86, 0.68, 0.27),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.014,
            edge_wear=0.20,
            edge_srgb=(0.96, 0.84, 0.48),
        ),
        "M_CopperJacket": _build_pbr_mat(
            "M_CopperJacket",
            base_srgb=(0.78, 0.39, 0.20),
            roughness=0.24,
            metallic=0.93,
            bevel_r=0.014,
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


def mk_loft_x(name: str, stations: list[tuple[float, list[tuple[float, float]]]], mat=None, xform=None):
    """Loft closed (z, y) cross-section rings along Three.js X axis."""
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


def mk_loft_y(name: str, stations: list[tuple[float, list[tuple[float, float]]]], mat=None, xform=None):
    """Loft closed (x, z) cross-section rings along Three.js Y axis."""
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = [[bm.verts.new((x, y, z)) for (x, z) in xz_ring] for y, xz_ring in stations]
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


def mk_loft_z(name: str, stations: list[tuple[float, list[tuple[float, float]]]], mat=None, xform=None):
    """Loft closed (x, y) cross-section rings along Three.js Z axis."""
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
    """Smooth stadium/oval 2D contour centered at (0, 0) with semicircular ends."""
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


def mk_chamfered_stadium_cutter_z(
    name: str,
    length_x: float,
    height_y: float,
    wall_half_z: float,
    lip: float = 0.14,
    arc_segs: int = 10,
    xform=None,
    mat=None,
):
    """Watertight stadium cutter through +/-Z walls with integrated 45-deg stamped entry chamfers."""
    r_in = mk_stadium_2d(length_x, height_y, arc_segs)
    r_out = mk_stadium_2d(length_x + 2.0 * lip, height_y + 2.0 * lip, arc_segs)
    stations = [
        (-(wall_half_z + 0.50), r_out),
        (-(wall_half_z + 0.01), r_out),
        (-(wall_half_z - lip),  r_in),
        (+(wall_half_z - lip),  r_in),
        (+(wall_half_z + 0.01), r_out),
        (+(wall_half_z + 0.50), r_out),
    ]
    return mk_loft_z(name, stations, mat=mat, xform=xform)


def mk_chamfered_stadium_cutter_top_y(
    name: str,
    length_x: float,
    width_z: float,
    y_outer: float,
    depth_in: float = 1.40,
    lip: float = 0.14,
    arc_segs: int = 10,
    x_pos: float = 0.0,
    mat=None,
):
    """Watertight stadium cutter piercing +Y wall at y_outer with 45-deg stamped entry chamfer."""
    r_in = mk_stadium_2d(length_x, width_z, arc_segs)
    r_out = mk_stadium_2d(length_x + 2.0 * lip, width_z + 2.0 * lip, arc_segs)
    stations = [
        (-depth_in, r_in),
        (0.0,       r_in),
        (lip,       r_out),
        (lip + 0.55, r_out),
    ]
    return mk_loft_z(name, stations, mat=mat, xform=[("rx", -math.pi * 0.5), ("t", x_pos, y_outer - lip, 0.0)])


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
# High-Detail Sculpted MG 42 Part Builders (22 Watertight Solid Parts)
# =============================================================================
def build_mg42_barrel(mats):
    m_bbl, m_steel, m_pol = mats["M_BarrelBlue"], mats["M_CarrierSteel"], mats["M_PolishedSteel"]
    tube = mk_lathe_x(
        "mg_bbl_t",
        [
            (0.41, -29.00), (1.38, -29.00), (1.38, -22.20), (1.26, -21.80),
            (1.26, -15.50), (1.06, -14.80), (0.94, 16.50), (0.88, 25.00),
            (1.00, 25.25), (1.00, 27.60), (0.85, 27.90), (0.85, 29.35),
            (0.68, 29.50), (0.43, 29.50), (0.41, 29.30), (0.41, -29.00),
        ],
        segs=40, mat=m_bbl,
    )
    # Forged rectangular barrel locking extension (`Verriegelungsstück`) w/ recessed roller lock cavity
    ext_outer = mk_box("mg_bbl_ext", 7.00, 2.75, 2.75, [("t", -25.50, 0.0, 0.0)], mat=m_steel, bevel=0.10)
    ext_cut = mk_box("c_ext_cav", 4.90, 1.72, 2.24, [("t", -27.20, 0.0, 0.0)], mat=m_steel)
    ext_bore = mk_cyl("c_ext_b", 0.56, 0.56, 7.60, axis="x", segs=24, xform=[("t", -25.50, 0.0, 0.0)], mat=m_steel)
    ext = bool_subtract(ext_outer, [ext_cut, ext_bore])
    # Grip flange rings for 5-second quick-change asbestos pad
    ring = mk_cyl("mg_bbl_r", 1.32, 1.32, 0.85, axis="x", segs=32, xform=[("t", -18.50, 0.0, 0.0)], mat=m_steel, bevel=0.05)
    lands = mk_helical_lands("mg_land", 4, 0.41, 0.015, 0.16, -21.5, 29.0, 24.0, segs_x=28, mat=m_pol)
    return finish_part(join_objects([tube, ext, ring, *lands], "mg42_barrel"), sharp_deg=36.0)


def build_mg42_muzzle_booster(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # High-res 48-seg flanged recoil booster cone & flared flash-hider trumpet (`Rückstoßverstärker`)
    outer = mk_lathe_x(
        "mg_bst_o",
        [
            (1.12, -3.65), (1.88, -3.65), (1.92, -3.48), (1.92, -1.62), (1.82, -1.48),
            (1.62, -1.25), (1.62,  0.88), (1.46,  1.10), (1.22,  1.38), (1.18,  1.88),
            (1.24,  2.22), (1.46,  3.05), (1.72,  3.95), (1.88,  4.46), (1.80,  4.62),
            (1.56,  4.62), (1.38,  4.40), (0.96,  2.25), (0.66,  1.45), (0.58,  1.15),
            (0.58,  0.50), (1.02,  0.22), (1.12, -0.10), (1.12, -3.65),
        ],
        segs=48, mat=m_dk,
    )
    # 4 smooth chamfered stadium radial gas ports around the booster expansion chamber
    v_z = mk_chamfered_stadium_cutter_z("c_bst_vz", 1.76, 0.54, 1.62, lip=0.06, arc_segs=8, xform=[("t", -0.22, 0.0, 0.0)], mat=m_dk)
    v_y = mk_chamfered_stadium_cutter_z("c_bst_vy", 1.76, 0.54, 1.62, lip=0.06, arc_segs=8, xform=[("rx", math.pi * 0.5), ("t", -0.22, 0.0, 0.0)], mat=m_dk)
    body = bool_subtract(outer, [v_z, v_y])
    # 12 crisp machined locking-detent ratchet teeth around the rear booster collar
    collar_ribs = [
        mk_box(
            f"mg_bst_k{i}", 1.68, 0.28, 0.24,
            [("t", -2.56, 1.94, 0.0), ("rx", i * (2.0 * math.pi / 12.0))],
            mat=m_st, bevel=0.025,
        )
        for i in range(12)
    ]
    # Forward locking flange collar bead
    flange = mk_cyl("mg_bst_fl", 1.76, 1.76, 0.28, axis="x", segs=40, xform=[("t", -1.42, 0.0, 0.0)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([body, flange, *collar_ribs], "mg42_muzzle_booster"), sharp_deg=36.0)


def build_mg42_barrel_latch(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # Contoured quick-change barrel latch door (`Laufwechselklappe`) with chamfered perimeter
    door_pts = [
        (-4.05, -1.58), (3.85, -1.58), (4.12, -1.32), (4.12, 1.32),
        (3.85, 1.58), (-4.05, 1.58), (-4.22, 1.35), (-4.22, -1.35),
    ]
    plate = mk_extrude_z("mg_bl_p", door_pts, -0.22, 0.22, bevel=0.06, bevel_segs=2, mat=m_st)
    # Embossed stadium stiffening rib on outer door face
    rib_pts = mk_stadium_2d(6.20, 1.28, arc_segs=10)
    rib = mk_extrude_z("mg_bl_r", rib_pts, 0.16, 0.42, bevel=0.05, bevel_segs=2, xform=[("t", 0.25, 0.0, 0.0)], mat=m_st)
    # Sculpted curved steel release lever sweeping outward toward rear thumb catch
    lev_curve = [(-0.20, 0.18)] + sample_cubic_bezier((-0.20, 0.18), (-1.40, 0.30), (-2.55, 0.86), (-3.55, 0.90), steps=14)
    lev_back = [(-3.55, 0.62)] + sample_cubic_bezier((-3.55, 0.62), (-2.45, 0.56), (-1.35, 0.14), (-0.20, 0.04), steps=14)
    # Extrude in X-Y then rotate rx(pi/2) -> curve lies in X-Z plane (x along door, z outward)!
    lever = mk_extrude_z("mg_bl_h", lev_curve + lev_back, -0.52, 0.52, bevel=0.05, bevel_segs=2, xform=[("rx", math.pi * 0.5), ("t", 0.0, -0.32, 0.0)], mat=m_dk)
    # Contoured horizontally-ribbed thumb pad on release lever end
    thumb = mk_cyl("mg_bl_th", 0.48, 0.46, 1.12, axis="y", segs=24, xform=[("t", -3.55, -0.32, 0.84)], mat=m_dk, bevel=0.05)
    t_ribs = [
        mk_cyl(f"mg_bl_tr{k}", 0.505, 0.505, 0.09, axis="y", segs=24, xform=[("t", -3.55, -0.70 + k * 0.19, 0.84)], mat=m_st, bevel=0.015)
        for k in range(5)
    ]
    # Twin forged hinge knuckles + vertical hinge pin at front edge (`X = +3.95`)
    kn_t = mk_cyl("mg_bl_kt", 0.38, 0.38, 0.88, axis="y", segs=20, xform=[("t", 3.92,  0.96, -0.02)], mat=m_st, bevel=0.04)
    kn_b = mk_cyl("mg_bl_kb", 0.38, 0.38, 0.88, axis="y", segs=20, xform=[("t", 3.92, -0.96, -0.02)], mat=m_st, bevel=0.04)
    hinge = mk_cyl("mg_bl_hg", 0.25, 0.25, 3.35, axis="y", segs=18, xform=[("t", 3.92, 0.0, -0.02)], mat=m_dk, bevel=0.03)
    return finish_part(join_objects([plate, rib, lever, thumb, *t_ribs, kn_t, kn_b, hinge], "mg42_barrel_latch"), sharp_deg=36.0)


def build_mg42_bolt_head(mats):
    m_pol, m_st = mats["M_PolishedSteel"], mats["M_CarrierSteel"]
    body = mk_box("mg_bh_b", 4.80, 2.15, 2.08, mat=m_pol, bevel=0.14)
    face = mk_lathe_x(
        "mg_bh_f",
        [(0.0, 2.10), (0.90, 2.10), (0.90, 2.66), (0.64, 2.66), (0.64, 2.44), (0.0, 2.44)],
        segs=28, mat=m_pol,
    )
    rw = mk_box("c_bh_rw", 1.38, 1.62, 2.50, [("t", 0.80, 0.0, 0.0)], mat=m_pol)
    wt = mk_box("c_bh_wt", 5.20, 0.96, 0.88, mat=m_pol)
    carved = bool_subtract(body, [rw, wt])
    extractor = mk_box("mg_bh_ex", 2.55, 0.46, 0.36, [("t", 1.35, 0.14, 0.94)], mat=m_st, bevel=0.03)
    return finish_part(join_objects([carved, face, extractor], "mg42_bolt_head"), sharp_deg=34.0)


def _build_roller(name: str, mats):
    m_chr, m_pol = mats["M_RollerChrome"], mats["M_PolishedSteel"]
    cyl = mk_cyl(f"{name}_c", 0.46, 0.46, 1.48, axis="y", segs=28, mat=m_chr, bevel=0.06)
    axle = mk_cyl(f"{name}_a", 0.24, 0.24, 1.74, axis="y", segs=18, mat=m_pol, bevel=0.03)
    return finish_part(join_objects([cyl, axle], name), sharp_deg=36.0)


def build_mg42_locking_rollers(mats):
    return _build_roller("mg42_locking_rollers", mats)


def build_mg42_locking_roller_left(mats):
    return _build_roller("mg42_locking_roller_left", mats)


def build_mg42_locking_wedge(mats):
    m_pol, m_chr = mats["M_PolishedSteel"], mats["M_RollerChrome"]
    sleeve = mk_box("mg_lw_s", 4.20, 1.44, 0.98, [("t", -0.80, 0.0, 0.0)], mat=m_pol, bevel=0.08)
    # Signature symmetric beveled roller-spreading wedge (`Steuerstück`)
    wedge = mk_extrude_z("mg_lw_w", [(0.80, -0.62), (2.40, -0.34), (2.95, 0.0), (2.40, 0.34), (0.80, 0.62)], -0.58, 0.58, bevel=0.04, xform=[("rx", math.pi * 0.5)], mat=m_chr)
    pin = mk_lathe_x("mg_lw_p", [(0.0, 2.15), (0.18, 2.15), (0.18, 3.22), (0.075, 3.55), (0.0, 3.65)], segs=20, mat=m_chr)
    return finish_part(join_objects([sleeve, wedge, pin], "mg42_locking_wedge"), sharp_deg=34.0)


def build_mg42_bolt_carrier(mats):
    m_st, m_chr = mats["M_CarrierSteel"], mats["M_RollerChrome"]
    main = mk_box("mg_bc_m", 9.60, 2.25, 2.20, mat=m_st, bevel=0.14)
    tail = mk_box("mg_bc_t", 3.40, 1.65, 1.78, [("t", -4.20, -0.10, 0.0)], mat=m_st, bevel=0.10)
    sp_bore = mk_cyl("c_bc_sb", 0.68, 0.68, 5.40, axis="x", segs=22, xform=[("t", -3.80, 0.0, 0.0)], mat=m_st)
    carved = bool_subtract(main, [sp_bore])
    # Iconic top vertical S-cam feed roller stud!
    stud_base = mk_cyl("mg_bc_sb", 0.58, 0.64, 0.45, axis="y", segs=22, xform=[("t", 0.40, 1.25, 0.0)], mat=m_st, bevel=0.04)
    stud = mk_cyl("mg_bc_st", 0.44, 0.46, 0.92, axis="y", segs=24, xform=[("t", 0.40, 1.75, 0.0)], mat=m_chr, bevel=0.05)
    sear_lug = mk_box("mg_bc_sl", 2.30, 0.68, 1.28, [("t", -1.80, -1.25, 0.0)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([carved, tail, stud_base, stud, sear_lug], "mg42_bolt_carrier"), sharp_deg=36.0)


def build_mg42_charging_handle(mats):
    m_st, m_pol = mats["M_CarrierSteel"], mats["M_PolishedSteel"]
    rail = mk_box("mg_ch_r", 7.80, 1.15, 0.42, mat=m_st, bevel=0.05)
    stem = mk_box("mg_ch_s", 1.25, 0.88, 1.48, [("t", -2.40, -0.10, 0.72)], mat=m_st, bevel=0.06)
    grip = mk_cyl("mg_ch_g", 0.48, 0.48, 2.75, axis="y", segs=24, xform=[("t", -2.40, -0.10, 1.44)], mat=m_st, bevel=0.06)
    cap_t = mk_cyl("mg_ch_ct", 0.52, 0.52, 0.24, axis="y", segs=20, xform=[("t", -2.40, 1.25, 1.44)], mat=m_pol, bevel=0.03)
    cap_b = mk_cyl("mg_ch_cb", 0.52, 0.52, 0.24, axis="y", segs=20, xform=[("t", -2.40, -1.45, 1.44)], mat=m_pol, bevel=0.03)
    return finish_part(join_objects([rail, stem, grip, cap_t, cap_b], "mg42_charging_handle"), sharp_deg=36.0)


def build_mg42_recoil_buffer(mats):
    m_pol, m_st = mats["M_PolishedSteel"], mats["M_CarrierSteel"]
    plunger = mk_lathe_x(
        "mg_buf_p",
        [
            (0.0, -2.85), (1.52, -2.85), (1.64, -2.20), (1.64, 0.80),
            (1.25, 1.00), (1.25, 2.48), (0.94, 2.65), (0.0, 2.65),
        ],
        segs=32, mat=m_pol,
    )
    rings = [
        mk_cyl(f"mg_buf_r{i}", 1.70, 1.70, 0.36, axis="x", segs=28, xform=[("t", -1.6 + i * 0.65, 0.0, 0.0)], mat=m_st, bevel=0.03)
        for i in range(3)
    ]
    return finish_part(join_objects([plunger, *rings], "mg42_recoil_buffer"), sharp_deg=36.0)


def build_mg42_receiver_shroud(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # Rear cold-stamped receiver box (`X in [-16.8, +18.2]`, planar Hero UV flanks for `MG 42 cra 1943`!)
    rec = mk_box("mg_rs_rec", 35.0, 5.15, 4.65, [("t", 0.70, 1.00, 0.0)], mat=m_st, bevel=0.14, bevel_segs=3)
    c_rec_in = mk_box("c_rec_in", 33.4, 3.65, 3.35, [("t", 1.20, 1.45, 0.0)], mat=m_dk)
    c_top = mk_box("c_rec_top", 24.0, 1.85, 3.45, [("t", 4.80, 3.20, 0.0)], mat=m_dk)
    c_ej = mk_box("c_rec_ej", 9.2, 1.70, 2.45, [("t", 11.80, -1.25, 0.0)], mat=m_dk)
    rec = bool_subtract(rec, [c_rec_in, c_top, c_ej])

    # Iconic MG 42 stamped chamfered-corner octagonal cooling shroud (`X in [+17.6, +73.2]`)
    def _oct_shroud_ring(y_bot: float, y_top: float, hz: float, ch: float) -> list[tuple[float, float]]:
        return [
            (-hz + ch, y_top), ( hz - ch, y_top),
            ( hz, y_top - ch), ( hz, y_bot + ch),
            ( hz - ch, y_bot), (-hz + ch, y_bot),
            (-hz, y_bot + ch), (-hz, y_top - ch),
        ]

    shroud_stations = [
        (17.60, _oct_shroud_ring(-1.35, 3.56, 2.30, 0.34)),
        (19.20, _oct_shroud_ring(-0.62, 3.52, 2.05, 0.42)),
        (72.90, _oct_shroud_ring(-0.62, 3.52, 2.05, 0.42)),
        (73.25, _oct_shroud_ring(-0.48, 3.38, 1.91, 0.36)),
    ]
    shroud = mk_loft_x("mg_rs_shr", shroud_stations, mat=m_st)

    # Carve hollow barrel channel, right barrel-change door cutout & 7 pairs of chamfered stadium vents!
    shr_cuts = [
        mk_box("c_shr_in", 56.8, 2.95, 2.95, [("t", 45.80, 1.50, 0.0)], mat=m_dk),
        mk_box("c_shr_win", 8.6, 3.15, 1.40, [("t", 21.20, 1.50, 1.95)], mat=m_dk),
    ]
    for i in range(7):
        vx = 29.0 + i * 6.2
        shr_cuts.append(
            mk_chamfered_stadium_cutter_z(
                f"c_sv_{i}", 4.10, 1.48, 2.05, lip=0.14, arc_segs=10,
                xform=[("t", vx, 1.46, 0.0)], mat=m_dk,
            )
        )
        shr_cuts.append(
            mk_chamfered_stadium_cutter_top_y(
                f"c_tv_{i}", 3.90, 1.62, 3.52, depth_in=1.35, lip=0.14, arc_segs=10,
                x_pos=vx, mat=m_dk,
            )
        )
    shroud = bool_subtract(shroud, shr_cuts)

    # Stamped reinforcing stiffening dimples/ribs between cooling vents & along lower shroud belly
    shroud_ribs = []
    for i in range(6):
        rx = 32.1 + i * 6.2
        for sgn in (-1, 1):
            shroud_ribs.append(
                mk_box(f"mg_srib_{i}_{sgn}", 0.56, 1.65, 0.14, [("t", rx, 1.46, sgn * 2.06)], mat=m_st, bevel=0.04)
            )
        shroud_ribs.append(
            mk_box(f"mg_srib_b{i}", 3.80, 0.18, 1.45, [("t", 29.0 + i * 6.2, -0.64, 0.0)], mat=m_dk, bevel=0.04)
        )

    # Stamped charging track rail with recessed guide channel + rear stock twist-lock flange
    charge_track = mk_box("mg_rs_ct", 24.4, 1.06, 0.52, [("t", 3.50, 1.50, 2.48)], mat=m_dk, bevel=0.06)
    charge_track = bool_subtract(charge_track, [mk_box("c_rs_ct", 22.8, 0.42, 0.36, [("t", 3.50, 1.50, 2.64)], mat=m_dk)])
    rear_socket = mk_lathe_x(
        "mg_rs_bsk",
        [(1.54, -17.15), (2.10, -17.15), (2.16, -16.95), (2.16, -16.40), (1.54, -16.40), (1.54, -17.15)],
        segs=36, xform=[("t", 0.0, 1.50, 0.0)], mat=m_dk,
    )
    # Bottom ejection-port spring dust cover bezel
    ej_bezel = mk_box("mg_rs_ejb", 10.2, 0.28, 3.05, [("t", 11.80, -1.62, 0.0)], mat=m_dk, bevel=0.05)
    ej_bezel = bool_subtract(ej_bezel, [mk_box("c_rs_ejb", 8.8, 0.60, 2.25, [("t", 11.80, -1.62, 0.0)], mat=m_dk)])

    # Mid & front bipod clamping collar rings (octagonal bevel matching shroud!)
    mid_ring = mk_loft_x(
        "mg_rs_mr",
        [(40.15, _oct_shroud_ring(-0.84, 3.74, 2.26, 0.44)), (42.65, _oct_shroud_ring(-0.84, 3.74, 2.26, 0.44))],
        mat=m_dk,
    )
    mid_ring = bool_subtract(mid_ring, [mk_box("c_mr", 3.2, 3.35, 3.35, [("t", 41.40, 1.45, 0.0)], mat=m_dk)])
    front_ring = mk_loft_x(
        "mg_rs_fr",
        [(70.25, _oct_shroud_ring(-0.86, 3.76, 2.28, 0.44)), (72.85, _oct_shroud_ring(-0.86, 3.76, 2.28, 0.44))],
        mat=m_dk,
    )
    front_ring = bool_subtract(front_ring, [mk_box("c_fr", 3.4, 3.35, 3.35, [("t", 71.55, 1.45, 0.0)], mat=m_dk)])

    # Iconic MG 42 folding arched-hood front sight post (`X = 69.2`)
    fs_base = mk_box("mg_fs_b", 2.35, 0.58, 1.42, [("t", 69.2, 3.64, 0.0)], mat=m_dk, bevel=0.06)
    fs_hinge = mk_cyl("mg_fs_hg", 0.24, 0.24, 1.56, axis="z", segs=16, xform=[("t", 68.45, 3.86, 0.0)], mat=m_st, bevel=0.02)
    # Horseshoe curved protective front sight hood (`mk_swept_bow` in Z-Y plane -> rotate ry(pi/2))
    hood_arc = [
        (0.58 * math.cos(a), 0.78 + 0.78 * math.sin(a))
        for a in [(-0.32 + 1.64 * (k / 22.0)) * math.pi for k in range(23)]
    ]
    fs_hood = mk_swept_bow(
        "mg_fs_h", hood_arc,
        lambda t: 0.09, lambda t: 0.44, sec_n=16, super_exp=0.65,
        xform=[("ry", math.pi * 0.5), ("t", 69.2, 3.74, 0.0)], mat=m_dk,
    )
    fs_blade = mk_extrude_z("mg_fs_p", [(-0.34, 0.0), (0.34, 0.0), (0.12, 1.06), (-0.12, 1.06)], -0.09, 0.09, bevel=0.02, xform=[("t", 69.2, 3.92, 0.0)], mat=m_st)

    # Flush domed ordnance rivets along receiver top & lower seam
    rivets = [
        mk_cyl(f"mg_rv_{k}_{s}", 0.20, 0.24, 0.26, axis="z", segs=14, xform=[("t", -14.2 + k * 5.2, 3.08, s * 2.34)], mat=m_dk, bevel=0.04)
        for k in range(6) for s in (-1, 1)
    ] + [
        mk_cyl(f"mg_rvb_{k}_{s}", 0.18, 0.22, 0.24, axis="z", segs=14, xform=[("t", -13.5 + k * 5.8, -1.16, s * 2.34)], mat=m_dk, bevel=0.04)
        for k in range(5) for s in (-1, 1)
    ]
    return finish_part(
        join_objects(
            [rec, shroud, *shroud_ribs, charge_track, rear_socket, ej_bezel, mid_ring, front_ring, fs_base, fs_hinge, fs_hood, fs_blade, *rivets],
            "mg42_receiver_shroud",
        ),
        sharp_deg=36.0,
    )


def build_mg42_top_cover(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # Contoured trapezoidal-crown stamped top feed cover
    def _tc_ring(hz_b: float, hz_t: float, yb: float, yt: float) -> list[tuple[float, float]]:
        return [(-hz_t, yt), (hz_t, yt), (hz_b, yt - 0.36), (hz_b, yb), (-hz_b, yb), (-hz_b, yt - 0.36)]

    shell = mk_loft_x(
        "mg_tc_s",
        [
            (-25.45, _tc_ring(2.38, 1.98, -0.18, 1.24)),
            (-24.80, _tc_ring(2.44, 2.04, -0.18, 1.32)),
            ( -0.20, _tc_ring(2.44, 2.04, -0.18, 1.32)),
            (  0.65, _tc_ring(2.36, 1.94, -0.18, 1.22)),
        ],
        mat=m_st,
    )
    cav = mk_box("c_tc_c", 24.4, 1.12, 3.92, [("t", -12.30, 0.10, 0.0)], mat=m_dk)
    shell = bool_subtract(shell, [cav])
    # Embossed twin stamped stiffening spine ribs + S-cam pivot boss
    rib_l = mk_extrude_z("mg_tc_rl", mk_stadium_2d(21.4, 0.56, 8), -0.18, 0.18, bevel=0.05, xform=[("rx", math.pi * 0.5), ("t", -12.30, 1.32, -1.32)], mat=m_st)
    rib_r = mk_extrude_z("mg_tc_rr", mk_stadium_2d(21.4, 0.56, 8), -0.18, 0.18, bevel=0.05, xform=[("rx", math.pi * 0.5), ("t", -12.30, 1.32,  1.32)], mat=m_st)
    pivot_boss = mk_cyl("mg_tc_pb", 0.58, 0.68, 0.30, axis="y", segs=24, xform=[("t", -6.20, 1.38, 0.0)], mat=m_dk, bevel=0.04)
    # Articulated rear cover release latch w/ knurled thumb button + front hinge knuckles
    latch = mk_box("mg_tc_lt", 1.95, 1.24, 2.38, [("t", -25.45, 0.38, 0.0)], mat=m_dk, bevel=0.10)
    latch_pad = mk_cyl("mg_tc_lp", 0.56, 0.56, 1.75, axis="z", segs=20, xform=[("t", -26.25, 0.72, 0.0)], mat=m_st, bevel=0.05)
    hinge = mk_cyl("mg_tc_hg", 0.42, 0.42, 4.98, axis="z", segs=22, xform=[("t", 0.58, 0.16, 0.0)], mat=m_dk, bevel=0.04)
    return finish_part(join_objects([shell, rib_l, rib_r, pivot_boss, latch, latch_pad, hinge], "mg42_top_cover"), sharp_deg=36.0)


def build_mg42_aa_sight(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # Authentic curved 200-2,000m tangent sight ramp base
    ramp_pts = [(-3.45, -0.44), (4.40, -0.44), (4.40, 0.24), (2.20, 0.28)] + sample_quad_bezier((2.20, 0.28), (-0.40, 0.56), (-3.35, 0.20), steps=10)
    base = mk_extrude_z("mg_aa_b", ramp_pts, -1.18, 1.18, bevel=0.05, bevel_segs=2, mat=m_dk)
    leaf = mk_box("mg_aa_lf", 5.20, 0.36, 1.24, [("rz", -0.05), ("t", -0.95, 0.54, 0.0)], mat=m_st, bevel=0.04)
    slider = mk_box("mg_aa_sl", 0.96, 0.64, 1.66, [("t", -0.60, 0.62, 0.0)], mat=m_dk, bevel=0.05)
    btn_l = mk_cyl("mg_aa_bl", 0.26, 0.26, 0.24, axis="z", segs=16, xform=[("t", -0.60, 0.64, -0.90)], mat=m_st, bevel=0.03)
    btn_r = mk_cyl("mg_aa_br", 0.26, 0.26, 0.24, axis="z", segs=16, xform=[("t", -0.60, 0.64,  0.90)], mat=m_st, bevel=0.03)
    post = mk_extrude_z("mg_aa_p", [(-0.34, 0.15), (0.34, 0.15), (0.22, 1.32), (-0.22, 1.32)], -0.32, 0.32, bevel=0.03, xform=[("t", 3.00, 0.18, 0.0)], mat=m_st)
    pivot_pin = mk_cyl("mg_aa_pp", 0.22, 0.22, 1.56, axis="z", segs=16, xform=[("t", 3.00, 0.24, 0.0)], mat=m_dk, bevel=0.02)

    # Iconic concentric anti-aircraft spider sight (`Fliegervisier`) centered at (3.00, 2.55, 0.0)
    def ring_pts(r: float, n: int = 44):
        return [Vector((3.00, 2.55 + math.cos(2 * math.pi * i / n) * r, math.sin(2 * math.pi * i / n) * r)) for i in range(n)]

    r_out = mk_tube_along_pts("mg_aa_ro", ring_pts(1.56), 0.105, ring_segs=14, closed=True, mat=m_st)
    r_in = mk_tube_along_pts("mg_aa_ri", ring_pts(0.82), 0.075, ring_segs=12, closed=True, mat=m_st)
    hub = mk_cyl("mg_aa_hb", 0.16, 0.16, 0.22, axis="x", segs=16, xform=[("t", 3.00, 2.55, 0.0)], mat=m_dk, bevel=0.02)
    v_sp = mk_box("mg_aa_vs", 0.13, 3.10, 0.13, [("t", 3.00, 2.55, 0.0)], mat=m_dk, bevel=0.01)
    h_sp = mk_box("mg_aa_hs", 0.13, 0.13, 3.10, [("t", 3.00, 2.55, 0.0)], mat=m_dk, bevel=0.01)
    d1 = mk_box("mg_aa_d1", 0.10, 0.10, 3.00, [("rx", math.pi * 0.25), ("t", 3.00, 2.55, 0.0)], mat=m_dk)
    d2 = mk_box("mg_aa_d2", 0.10, 0.10, 3.00, [("rx", -math.pi * 0.25), ("t", 3.00, 2.55, 0.0)], mat=m_dk)
    return finish_part(join_objects([base, leaf, slider, btn_l, btn_r, post, pivot_pin, r_out, r_in, hub, v_sp, h_sp, d1, d2], "mg42_aa_sight"), sharp_deg=36.0)


def build_mg42_bipod(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    # Contoured wrap-around shroud clamping saddle yoke + twin pivot knuckles
    yoke = mk_box("mg_bp_y", 3.80, 2.18, 4.96, [("t", 0.0, 0.72, 0.0)], mat=m_st, bevel=0.16, bevel_segs=3)
    yoke = bool_subtract(yoke, [mk_box("c_bp_y", 4.40, 1.48, 3.74, [("t", 0.0, 1.32, 0.0)], mat=m_dk)])
    # Vertical knurled height-limiting tension screw w/ circular thumb knob
    screw = mk_cyl("mg_bp_sc", 0.30, 0.30, 2.35, axis="y", segs=20, xform=[("t", -0.15, -0.58, 0.0)], mat=m_dk, bevel=0.04)
    knob = mk_cyl("mg_bp_kn", 0.68, 0.68, 0.42, axis="y", segs=24, xform=[("t", -0.15, -1.68, 0.0)], mat=m_st, bevel=0.05)
    pivot_bar = mk_cyl("mg_bp_pb", 0.36, 0.36, 5.55, axis="z", segs=20, xform=[("t", -0.25, -0.45, 0.0)], mat=m_dk, bevel=0.04)
    parts = [yoke, screw, knob, pivot_bar]

    for sgn in (-1, 1):
        # Articulated stamped hinge knuckle housing
        knuckle = mk_cyl(f"mg_bp_hk{sgn}", 0.62, 0.62, 0.92, axis="z", segs=22, xform=[("t", -0.35, -0.45, sgn * 2.52)], mat=m_st, bevel=0.05)
        # Tapered folded stamped U-channel bipod leg (`X in [-24.0, -0.4]`)
        leg_xform = [("ry", sgn * 0.055), ("rz", -0.036), ("t", -12.2, -0.52, sgn * 2.58)]
        leg_main = mk_loft_x(
            f"mg_bp_l{sgn}",
            [
                (-11.8, [(-0.34, -0.54), (0.34, -0.54), (0.42, 0.46), (-0.42, 0.46)]),
                (  0.0, [(-0.38, -0.56), (0.38, -0.56), (0.46, 0.50), (-0.46, 0.50)]),
                ( 11.8, [(-0.44, -0.58), (0.44, -0.58), (0.50, 0.54), (-0.50, 0.54)]),
            ],
            mat=m_dk, xform=leg_xform,
        )
        # Stamped longitudinal channel flange ribs + embossed oval stiffening dimples
        flange_t = mk_box(f"mg_bp_ft{sgn}", 22.8, 0.22, 0.96, [("t", 0.0,  0.48, 0.0)] + leg_xform, mat=m_st, bevel=0.04)
        flange_b = mk_box(f"mg_bp_fb{sgn}", 22.8, 0.22, 0.88, [("t", 0.0, -0.48, 0.0)] + leg_xform, mat=m_st, bevel=0.04)
        dimples = [
            mk_extrude_z(
                f"mg_bp_dm{sgn}_{k}", mk_stadium_2d(2.60, 0.42, 8), -0.08, 0.08, bevel=0.03,
                xform=[("t", -8.2 + k * 4.2, 0.0, sgn * 0.44)] + leg_xform, mat=m_st,
            )
            for k in range(5)
        ]
        # Authentic flared Zweibein 42 ribbed spade foot w/ 3 traction ribs & 4 biting ground cleats!
        spade_pts = [
            (-1.25, -1.35), (1.35, -1.18), (1.42, 0.45), (0.85, 1.38),
            (-0.75, 1.38), (-1.35, 0.65),
        ]
        spade = mk_extrude_z(f"mg_bp_sp{sgn}", spade_pts, -0.74, 0.74, bevel=0.06, bevel_segs=2, xform=[("t", -24.15, -1.02, sgn * 3.16)], mat=m_st)
        # Ankle reinforcement gusset joining leg cleanly to spade foot
        ankle = mk_box(f"mg_bp_ak{sgn}", 1.80, 0.88, 1.10, [("t", -23.15, -0.86, sgn * 3.12)], mat=m_dk, bevel=0.05)
        s_ribs = [
            mk_box(f"mg_bp_sr{sgn}_{r}", 0.22, 2.15, 1.56, [("t", -24.60 + r * 0.52, -1.00, sgn * 3.16)], mat=m_dk, bevel=0.03)
            for r in range(3)
        ]
        cleats = [
            mk_box(f"mg_bp_cl{sgn}_{c}", 0.38, 0.36, 1.36, [("rz", 0.35), ("t", -25.10 + c * 0.68, -2.35, sgn * 3.16)], mat=m_dk, bevel=0.02)
            for c in range(4)
        ]
        parts.extend([knuckle, leg_main, flange_t, flange_b, *dimples, spade, ankle, *s_ribs, *cleats])
    return finish_part(join_objects(parts, "mg42_bipod"), sharp_deg=36.0)


def build_mg42_buttstock(mats):
    m_bak, m_st, m_pol = mats["F_Bakelite"], mats["F_Steel"], mats["F_Polished"]

    # Organically lofted 30-station x 40-ring marbled Bakelite MG 42 club-foot buttstock!
    # Receiver rear face is at local x = +12.00, buffer centerline y = +1.85.
    N_ST = 30
    N_RING = 40

    def _butt_ring(x: float, scale_z: float = 1.0, scale_y: float = 1.0, pad_x_cup: float = 0.0) -> list[tuple[float, float]]:
        # Upper comb arch & front neck transition
        y_top = 3.10 + 0.24 * _smoothstep_f(-12.0, 2.5, x) + 0.14 * _smoothstep_f(3.0, 10.6, x)
        # Iconic MG 42 sweeping belly -> hooked weak-hand undercut -> cylindrical collar neck
        t_belly = _smoothstep_f(-12.0, 1.8, x)
        t_hook = _smoothstep_f(1.2, 7.6, x)
        y_bot = -5.18 + 2.38 * t_belly + 3.04 * t_hook
        # Width profile: full rounded cheek -> slender sculpted weak-hand waist -> collar neck
        hw = (
            1.88
            + 0.07 * math.sin(math.pi * _smoothstep_f(-12.0, -1.0, x))
            - 0.34 * _smoothstep_f(-1.5, 5.0, x)
            + 0.14 * _smoothstep_f(6.2, 10.6, x)
        ) * scale_z
        # Teardrop comb taper blends to round cylinder at front buffer collar
        roundness = _smoothstep_f(6.0, 10.5, x)
        top_taper = 0.68 + 0.32 * roundness
        bot_taper = 0.86 + 0.14 * roundness

        yc = 0.5 * (y_top + y_bot)
        ry = max(0.45, 0.5 * (y_top - y_bot)) * scale_y

        # Smooth ergonomic MG 42 left-side (-Z) weak-hand grip scoop concavity!
        scoop_x = _smoothstep_f(-0.4, 2.4, x) * (1.0 - _smoothstep_f(6.2, 8.5, x))

        ring = []
        for k in range(N_RING):
            th = 2.0 * math.pi * k / N_RING
            ct = math.cos(th)  # +1 top comb, -1 bottom belly
            st = math.sin(th)  # +1 right (+Z), -1 left (-Z)
            # Soft superellipse-teardrop cross-section
            w_mod = (top_taper + (1.0 - top_taper) * _smoothstep_f(0.95, -0.15, ct)) * (
                bot_taper + (1.0 - bot_taper) * _smoothstep_f(-0.98, -0.35, ct)
            )
            z = st * hw * w_mod
            # Carve buttery weak-hand palm pocket directly on left (-Z) flank
            if st < 0.0 and scoop_x > 1e-4:
                scoop_y = _smoothstep_f(-0.88, -0.22, ct) * (1.0 - _smoothstep_f(0.18, 0.72, ct))
                z += 0.58 * scoop_x * scoop_y * ((-st) ** 1.25)
            y = yc + ct * ry
            ring.append((z, y))
        return ring

    stations = []
    for i in range(N_ST):
        u = i / (N_ST - 1)
        x = -12.00 + u * 22.65
        stations.append((x, _butt_ring(x)))
    body = mk_loft_x("mg_bs_b", stations, mat=m_bak)

    # Flush contoured cupped stamped-steel buttplate wrapping the exact rear Bakelite oval!
    bp_stations = [
        (-12.66, _butt_ring(-12.00, scale_z=0.90, scale_y=0.92)),
        (-12.56, _butt_ring(-12.00, scale_z=1.02, scale_y=1.015)),
        (-12.02, _butt_ring(-12.00, scale_z=1.045, scale_y=1.022)),
        (-11.42, _butt_ring(-11.42, scale_z=1.032, scale_y=1.016)),
        (-11.34, _butt_ring(-11.34, scale_z=0.985, scale_y=0.992)),
    ]
    buttplate = mk_loft_x("mg_bs_bp", bp_stations, mat=m_st)
    # Recessed slotted steel buttplate screws (upper heel & lower toe)
    bp_scr_t = mk_cyl("mg_bs_st", 0.32, 0.32, 0.24, axis="x", segs=20, xform=[("t", -12.62,  1.65, 0.0)], mat=m_pol, bevel=0.04)
    bp_scr_b = mk_cyl("mg_bs_sb", 0.32, 0.32, 0.24, axis="x", segs=20, xform=[("t", -12.62, -3.65, 0.0)], mat=m_pol, bevel=0.04)

    # Multi-stepped machined steel quick-detach twist-lock buffer collar (`X in [+9.95, +12.30], Y = +1.85`)
    collar = mk_lathe_x(
        "mg_bs_co",
        [
            (0.0,  9.95), (1.78,  9.95), (1.92, 10.12), (1.92, 11.45),
            (2.04, 11.58), (2.04, 12.18), (1.90, 12.30), (0.0, 12.30),
        ],
        segs=40, xform=[("t", 0.0, 1.85, 0.0)], mat=m_st,
    )
    # 4 radial bayonet twist-lock lugs + spring-loaded twist-release thumb button + retaining pin
    bayonet_lugs = [
        mk_box(f"mg_bs_lg{i}", 0.62, 0.56, 0.42, [("t", 11.88, 2.02, 0.0), ("rx", i * math.pi * 0.5 + math.pi * 0.25), ("t", 0.0, 1.85, 0.0)], mat=m_st, bevel=0.04)
        for i in range(4)
    ]
    release_btn = mk_cyl("mg_bs_rb", 0.40, 0.40, 0.64, axis="y", segs=20, xform=[("t", 10.95, 0.02, 0.72)], mat=m_pol, bevel=0.04)
    ret_pin = mk_cyl("mg_bs_rp", 0.20, 0.20, 3.86, axis="z", segs=16, xform=[("t", 10.45, 1.85, 0.0)], mat=m_pol, bevel=0.02)

    # Recessed lower-belly steel sling swivel escutcheon + authentic wire sling loop!
    sw_plate = mk_box("mg_bs_swp", 2.35, 0.42, 0.86, [("rz", 0.22), ("t", -8.65, -4.52, 0.0)], mat=m_st, bevel=0.06)
    sw_post = mk_cyl("mg_bs_sws", 0.24, 0.24, 0.72, axis="y", segs=16, xform=[("t", -8.65, -4.85, 0.0)], mat=m_st, bevel=0.02)
    sw_loop_pts = [
        Vector((-8.65 + 0.96 * math.cos(2.0 * math.pi * i / 28), -5.36 + 0.42 * math.sin(2.0 * math.pi * i / 28), 0.0))
        for i in range(28)
    ]
    sw_loop = mk_tube_along_pts("mg_bs_swl", sw_loop_pts, 0.14, ring_segs=12, closed=True, mat=m_st)
    return finish_part(
        join_objects([body, buttplate, bp_scr_t, bp_scr_b, collar, *bayonet_lugs, release_btn, ret_pin, sw_plate, sw_post, sw_loop], "mg42_buttstock"),
        sharp_deg=42.0,
    )


def build_mg42_grip_frame(mats):
    m_st, m_bak, m_pol = mats["F_Steel"], mats["F_Bakelite"], mats["F_Polished"]
    # Stamped steel upper FCG housing channel mating flush with receiver underside
    upper = mk_box("mg_gf_u", 10.40, 2.38, 2.86, [("t", 0.0, 1.25, 0.0)], mat=m_st, bevel=0.12, bevel_segs=3)
    upper = bool_subtract(upper, [mk_box("c_gf_u", 7.80, 1.85, 1.68, [("t", 0.20, 1.55, 0.0)], mat=m_st)])

    # Contoured steel pistol-grip spine & rounded heel cap (curved frontstrap & ergonomic backstrap)
    gc_pts = (
        [(-4.95, 0.45), (-0.95, 0.45)]
        + sample_quad_bezier((-0.95, 0.45), (-1.55, -2.55), (-2.55, -5.62), steps=12)
        + sample_quad_bezier((-2.55, -5.62), (-4.18, -5.85), (-5.78, -5.42), steps=8)
        + sample_quad_bezier((-5.78, -5.42), (-5.28, -2.65), (-4.95, 0.45), steps=12)
    )
    grip_core = mk_extrude_z("mg_gf_gc", gc_pts, -1.08, 1.08, bevel=0.12, bevel_segs=3, mat=m_st)

    # Smoothly swept cubic-Bezier stamped steel winter trigger-guard bow welded watertight via bool_union!
    tg_pts = (
        [(4.42, 0.42)]
        + sample_cubic_bezier((4.42, 0.42), (4.76, -0.78), (4.86, -1.96), (3.85, -2.26), steps=16)
        + sample_cubic_bezier((3.85, -2.26), (2.45, -2.42), (0.35, -2.38), (-1.65, -2.02), steps=18)
    )
    tg_bow = mk_swept_bow(
        "mg_gf_tg", tg_pts,
        lambda t: 0.26 + 0.05 * (1.0 - _smoothstep_f(0.0, 0.16, t)),
        lambda t: 0.62,
        sec_n=24, super_exp=0.58, mat=m_st,
    )
    frame_steel = bool_union([upper, grip_core, tg_bow], "mg_gf_frame_u")

    # Ergonomically crowned & horizontally-ribbed marbled Bakelite pistol grip scales (`scale_l`, `scale_r`)!
    # 38 vertical stations smoothly sculpt 9 authentic MG 42 horizontal anti-slip grip ribs + rounded palm swell!
    N_GS = 38
    N_GR = 28

    def _build_grip_scale(side: int) -> bpy.types.Object:
        stations = []
        for i in range(N_GS):
            u = i / (N_GS - 1)  # 0 at bottom heel (-5.32), 1 at top (-0.12)
            y = -5.32 + u * 5.20
            # Track steel spine rake along Y
            x_back = -5.58 + u * 0.86 - 0.18 * math.sin(math.pi * u)
            x_front = -2.68 + u * 1.42 + 0.10 * math.sin(math.pi * u)
            xc = 0.5 * (x_back + x_front)
            rx = max(0.65, 0.5 * (x_front - x_back))
            # Soft perimeter bevel at top & bottom ends of scale
            end_env = _smoothstep_f(0.0, 0.08, u) * (1.0 - _smoothstep_f(0.92, 1.0, u))
            # 9 authentic horizontal MG 42 grip ribs in middle grip zone (`u in [0.12, 0.88]`)
            rib_env = _smoothstep_f(0.10, 0.16, u) * (1.0 - _smoothstep_f(0.84, 0.90, u))
            rib_wave = 0.5 * (1.0 - math.cos(2.0 * math.pi * 9.0 * ((u - 0.12) / 0.76))) if 0.12 <= u <= 0.88 else 0.0
            rib_dz = 0.085 * rib_env * rib_wave
            # Ergonomic palm swell peaking gently mid-grip
            palm_dz = 0.34 + 0.10 * math.sin(math.pi * u)

            ring = []
            for k in range(N_GR):
                a = 2.0 * math.pi * k / N_GR
                ca, sa = math.cos(a), math.sin(a)  # ca: -1 back..+1 front; sa: +1 outer dome, -1 inner flat
                x = xc + ca * rx
                if sa >= 0.0:
                    # Domed outer Bakelite face with crisp horizontal ribs in middle chord
                    chord_env = _smoothstep_f(0.0, 0.35, 1.0 - abs(ca))
                    dome = (sa ** 0.58) * (0.12 + palm_dz * end_env) + rib_dz * chord_env * (sa ** 0.70)
                    z = side * (1.06 + dome)
                else:
                    # Flush inner mounting face tucked cleanly against steel grip core (`|Z| = 1.02`)
                    z = side * (1.06 + sa * 0.05)
                ring.append((x, z))
            stations.append((y, ring))
        return mk_loft_y(f"mg_gf_sc_{side}", stations, mat=m_bak)

    scale_l = _build_grip_scale(-1)
    scale_r = _build_grip_scale(+1)
    # Countersunk grip-scale retaining screw & frame cross-pins
    grip_scr = mk_cyl("mg_gf_gsc", 0.30, 0.30, 3.04, axis="z", segs=20, xform=[("t", -3.35, -2.75, 0.0)], mat=m_pol, bevel=0.04)
    pin_f = mk_cyl("mg_gf_pf", 0.24, 0.24, 3.04, axis="z", segs=18, xform=[("t",  3.55, 1.55, 0.0)], mat=m_pol, bevel=0.03)
    pin_r = mk_cyl("mg_gf_pr", 0.24, 0.24, 3.04, axis="z", segs=18, xform=[("t", -3.85, 1.55, 0.0)], mat=m_pol, bevel=0.03)
    # Knurled cross-bolt `S / F` safety plunger w/ stepped collar bosses
    safety = mk_cyl("mg_gf_sf", 0.38, 0.38, 3.55, axis="z", segs=24, xform=[("t", -2.40, 1.25, 0.0)], mat=m_pol, bevel=0.05)
    saf_b = mk_cyl("mg_gf_sfb", 0.52, 0.52, 3.08, axis="z", segs=22, xform=[("t", -2.40, 1.25, 0.0)], mat=m_st, bevel=0.05)
    # Lanyard loop eyelet at grip heel
    lan_pts = [Vector((-4.35 + 0.38 * math.cos(2.0 * math.pi * i / 20), -5.85 + 0.30 * math.sin(2.0 * math.pi * i / 20), 0.0)) for i in range(20)]
    lanyard = mk_tube_along_pts("mg_gf_lan", lan_pts, 0.11, ring_segs=10, closed=True, mat=m_st)
    return finish_part(
        join_objects([frame_steel, scale_l, scale_r, grip_scr, pin_f, pin_r, safety, saf_b, lanyard], "mg42_grip_frame"),
        sharp_deg=38.0,
    )


def build_mg42_trigger(mats):
    m_st = mats["M_CarrierSteel"]
    head = mk_box("mg_tr_h", 2.25, 1.12, 0.68, [("t", -0.05, 0.68, 0.0)], mat=m_st, bevel=0.06)
    # Sculpted curved crescent stamped-steel full-auto trigger shoe
    shoe_pts = sample_cubic_bezier((0.28, 0.35), (0.04, -0.35), (0.08, -1.25), (0.58, -1.78), steps=18, include_start=True)
    blade = mk_swept_bow("mg_tr_b", shoe_pts, lambda t: 0.24 - 0.04 * t, lambda t: 0.27, sec_n=18, super_exp=0.58, mat=m_st)
    res = bool_union([head, blade], "mg42_trigger")
    return finish_part(res, sharp_deg=36.0)


def build_mg42_sear(mats):
    m_pol, m_st = mats["M_PolishedSteel"], mats["M_CarrierSteel"]
    bar = mk_box("mg_sr_b", 3.60, 0.86, 0.92, mat=m_pol, bevel=0.05)
    nose = mk_box("mg_sr_n", 1.16, 1.08, 0.96, [("t", -1.10, 0.62, 0.0)], mat=m_st, bevel=0.05)
    return finish_part(join_objects([bar, nose], "mg42_sear"), sharp_deg=36.0)


def build_mg42_feed_tray(mats):
    m_st = mats["F_Steel"]
    tray = mk_box("mg_ft_t", 8.80, 0.56, 6.80, mat=m_st, bevel=0.06)
    tray = bool_subtract(tray, [mk_box("c_ft_s", 6.80, 0.95, 2.20, [("t", -0.20, 0.10, 0.0)], mat=m_st)])
    stop = mk_box("mg_ft_sw", 8.40, 1.08, 0.46, [("t", 0.0, 0.42, 3.16)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([tray, stop], "mg42_feed_tray"), sharp_deg=36.0)


def build_mg42_feed_pawl(mats):
    m_pol, m_st = mats["F_Polished"], mats["F_Steel"]
    arm = mk_box("mg_fp_a", 7.80, 0.48, 1.48, [("t", -1.60, 0.22, 0.0)], mat=m_pol, bevel=0.05)
    shuttle = mk_box("mg_fp_s", 4.80, 0.58, 5.25, [("t", 0.90, -0.18, 0.0)], mat=m_pol, bevel=0.05)
    p1 = mk_box("mg_fp_p1", 1.80, 0.64, 0.52, [("t", 0.90, -0.46, -1.65)], mat=m_st, bevel=0.04)
    p2 = mk_box("mg_fp_p2", 1.80, 0.64, 0.52, [("t", 0.90, -0.46, 1.25)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([arm, shuttle, p1, p2], "mg42_feed_pawl"), sharp_deg=36.0)


def build_mg42_ammo_belt(mats):
    m_br, m_cu, m_lk = mats["M_Brass"], mats["M_CopperJacket"], mats["M_BeltLink"]
    parts = []
    belt_pts = []

    def _add_round(tag: str, cy: float, cz: float, segs: int = 20):
        case = mk_lathe_x(
            f"mg_rd_c_{tag}",
            [
                (0.0, -4.06), (0.58, -4.06), (0.58, -3.86), (0.51, -3.80),
                (0.58, -3.68), (0.54, 0.45), (0.44, 1.10), (0.44, 1.62), (0.0, 1.62),
            ],
            segs=segs, xform=[("t", 0.0, cy, cz)], mat=m_br,
        )
        bullet = mk_lathe_x(
            f"mg_rd_b_{tag}",
            [(0.0, 1.58), (0.40, 1.62), (0.36, 2.72), (0.14, 3.74), (0.0, 4.06)],
            segs=segs, xform=[("t", 0.0, cy, cz)], mat=m_cu,
        )
        # Contoured wrapped `Gurt 34` spring-steel cartridge sleeve link hugging brass case waist!
        link_collar = mk_lathe_x(
            f"mg_lk_c_{tag}",
            [
                (0.59, -2.50), (0.69, -2.50), (0.71, -2.38), (0.71, 0.70),
                (0.69, 0.82), (0.59, 0.82), (0.59, -2.50),
            ],
            segs=max(14, segs - 2), xform=[("t", 0.0, cy, cz)], mat=m_lk,
        )
        parts.extend([case, bullet, link_collar])

    # 1. Exterior exposed feed belt (`8` rounds sweeping from drum neck up into receiver feed tray)
    for i in range(8):
        t = i / 7.0
        cz = 3.40 - t * 6.00
        cy = 1.35 - (t ** 1.45) * 3.30
        belt_pts.append((cy, cz))
        _add_round(f"ext{i}", cy, cz, segs=20)
        tab = mk_box(f"mg_lk_t{i}", 0.52, 0.34, 0.58, [("t", -2.88, cy + 0.56, cz)], mat=m_lk, bevel=0.04)
        parts.append(tab)

    # 2. Internal Gurttrommel 34 coiled 50-rd drum spiral stack (`22` gleaming brass 7.92x57mm rounds
    #    filling the hollow drum cavity cleanly in `?cut=1` cutaway & exploded view; 100% enclosed at `?cut=0`!).
    #    Drum center in belt local space = (0.0, -4.55, -2.80), inner drum cavity radius = 5.10, X in [-4.35, +4.35].
    drum_cy, drum_cz = -4.55, -2.80
    # Outer spiral ring (`14` rounds at r = 3.98, ang 108..400.5 deg -> chord 1.55cm > 1.42cm, zero overlap w/ neck!)
    for j in range(14):
        ang = math.radians(108.0 + j * 22.5)
        cy = drum_cy + 3.98 * math.sin(ang)
        cz = drum_cz + 3.98 * math.cos(ang)
        belt_pts.append((cy, cz))
        _add_round(f"do{j}", cy, cz, segs=14)
    # Inner spiral ring (`8` rounds at r = 2.32, ang 122..416 deg -> chord 1.70cm, clear of neck drop-in!)
    for j in range(8):
        ang = math.radians(122.0 + j * 42.0)
        cy = drum_cy + 2.32 * math.sin(ang)
        cz = drum_cz + 2.32 * math.cos(ang)
        belt_pts.append((cy, cz))
        _add_round(f"di{j}", cy, cz, segs=14)

    # Central stamped steel Gurttrommel 34 drum core hub spindle inside the inner brass coil
    drum_hub = mk_cyl("mg_lk_hub", 1.28, 1.28, 7.60, axis="x", segs=24, xform=[("t", 0.0, drum_cy, drum_cz)], mat=m_lk, bevel=0.08)
    parts.append(drum_hub)

    # Hinged Gurt 34 spiral wire connector loops bridging adjacent exposed belt links
    for i in range(7):
        y0, z0 = belt_pts[i]
        y1, z1 = belt_pts[i + 1]
        for wx in (-1.95, 0.25):
            wire = mk_tube_along_pts(
                f"mg_lk_w{i}_{int(wx*10)}",
                [Vector((wx, y0 + 0.64, z0)), Vector((wx, 0.5 * (y0 + y1) + 0.72, 0.5 * (z0 + z1))), Vector((wx, y1 + 0.64, z1))],
                0.095, ring_segs=10, closed=False, mat=m_lk,
            )
            parts.append(wire)
    return finish_part(join_objects(parts, "mg42_ammo_belt"), sharp_deg=36.0)


def build_mg42_ammo_drum(mats):
    m_fg, m_st = mats["F_FieldGray"], mats["F_Steel"]
    # High-res 48-seg rolled-seam Gurttrommel 34 drum w/ flat central stencil face (`r <= 4.15` at `x = +4.48`)
    # and embossed outer concentric annular stiffening beads (`r = 4.32..4.96`) on front & rear faces!
    drum = mk_lathe_x(
        "mg_ad_d",
        [
            (0.00, -4.48), (4.05, -4.48), (4.22, -4.64), (4.76, -4.64), (4.94, -4.48),
            (5.26, -4.48), (5.52, -4.34), (5.58, -4.18), (5.46, -4.05),
            (5.46,  4.05), (5.58,  4.18), (5.52,  4.34), (5.26,  4.48),
            (4.94,  4.48), (4.76,  4.64), (4.22,  4.64), (4.05,  4.48), (0.00,  4.48),
        ],
        segs=48, xform=[("t", 0.0, -1.00, 0.0)], mat=m_fg,
    )
    # 6 embossed radial stiffening ribs on rear drum face (`-X`) + center hub boss
    rear_hub = mk_cyl("mg_ad_rh", 1.18, 1.32, 0.36, axis="x", segs=28, xform=[("t", -4.60, -1.00, 0.0)], mat=m_fg, bevel=0.05)
    rear_ribs = [
        mk_box(f"mg_ad_rr{i}", 0.24, 3.15, 0.36, [("t", -4.54, 2.35, 0.0), ("rx", i * math.pi / 3.0), ("t", 0.0, -1.00, 0.0)], mat=m_fg, bevel=0.05)
        for i in range(6)
    ]
    # Contoured tapered feed chute neck w/ reinforcing lip collar & spring dust-cover hinge
    neck = mk_loft_y(
        "mg_ad_nk",
        [
            (1.10, [(-4.40, -1.75), (4.40, -1.75), (4.40, 1.75), (-4.40, 1.75)]),
            (5.35, [(-4.26, -1.48), (4.26, -1.48), (4.26, 1.48), (-4.26, 1.48)]),
            (5.65, [(-4.42, -1.62), (4.42, -1.62), (4.42, 1.62), (-4.42, 1.62)]),
        ],
        mat=m_fg, xform=[("rx", 0.42), ("t", 0.0, 0.25, 0.55)],
    )
    # Dovetail receiver mounting hanger & spring locking latch w/ thumb tab
    latch = mk_box("mg_ad_lt", 5.40, 1.15, 1.24, [("t", 0.0, 4.44, 2.84)], mat=m_st, bevel=0.08)
    latch_tab = mk_box("mg_ad_ltb", 1.55, 0.42, 0.92, [("t", -2.95, 4.78, 2.86)], mat=m_st, bevel=0.05)
    # Wire carry handle bail folded cleanly against lower-outer drum flank
    bail_pts = [
        Vector((-2.60, -2.55, -5.42)),
        Vector((-2.60, -3.55, -5.85)),
        Vector(( 2.60, -3.55, -5.85)),
        Vector(( 2.60, -2.55, -5.42)),
    ]
    bail = mk_tube_along_pts("mg_ad_bl", bail_pts, 0.15, ring_segs=12, closed=False, mat=m_st)
    return finish_part(join_objects([drum, rear_hub, *rear_ribs, neck, latch, latch_tab, bail], "mg42_ammo_drum"), sharp_deg=36.0)


# =============================================================================
# UV Unwrapping, Hero Bands & >=70px Accent Firewall Allocation
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


def unwrap_shroud_atlas(shroud_objs):
    def classify(on, f, mn):
        if on == "mg42_receiver_shroud":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            nz = -n.y
            if -15.5 <= tx <= 15.5 and -1.45 <= ty <= 3.45:
                if nz < -0.78 and tz < -2.05:
                    return "HERO_LEFT"
                if nz > 0.78 and tz > 2.05:
                    return "HERO_RIGHT"
            return "PACK_SHR"
        return "PACK_EXT"

    _smart_unwrap_and_pack_rect(shroud_objs, 0.010, 0.620, 0.010, 0.550, lambda on, f, mn: classify(on, f, mn) == "PACK_SHR", "shroud_body")
    _smart_unwrap_and_pack_rect(shroud_objs, 0.640, 0.990, 0.010, 0.550, lambda on, f, mn: classify(on, f, mn) == "PACK_EXT", "shroud_ext")
    rec = next(o for o in shroud_objs if o.name == "mg42_receiver_shroud")
    bm = bmesh.new()
    bm.from_mesh(rec.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cls = classify("mg42_receiver_shroud", f, "")
        if cls not in ("HERO_LEFT", "HERO_RIGHT"):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            xn = max(0.0, min(1.0, (vco.x - (-15.5)) / 31.0))
            yn = max(0.0, min(1.0, (vco.z - (-1.45)) / 4.90))
            if cls == "HERO_LEFT":
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.785 + yn * 0.200)
            else:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.575 + yn * 0.190)
    bm.to_mesh(rec.data)
    bm.free()


def unwrap_furniture_atlas(furn_objs):
    def classify(on, f, mn):
        if on == "mg42_ammo_drum":
            c, n = f.calc_center_median(), f.normal
            # Restrict HERO_DRUM strictly to the circular front drum face (excluding feed chute neck!)
            if mn == "F_FieldGray" and n.x > 0.78 and c.x > 4.44 and math.hypot(c.z - (-1.00), -c.y) < 5.35:
                return "HERO_DRUM"
            return "PACK_DRUM"
        if mn == "F_Bakelite":
            return "PACK_BAK"
        return "PACK_HW"

    # Dedicated >=50px UV firewall separating marbled Bakelite, Feldgrau drum & steel hardware!
    _smart_unwrap_and_pack_rect(furn_objs, 0.010, 0.470, 0.010, 0.520, lambda on, f, mn: classify(on, f, mn) == "PACK_BAK", "furn_bakelite")
    _smart_unwrap_and_pack_rect(furn_objs, 0.510, 0.990, 0.010, 0.520, lambda on, f, mn: classify(on, f, mn) == "PACK_HW", "furn_steel")
    _smart_unwrap_and_pack_rect(furn_objs, 0.510, 0.990, 0.560, 0.990, lambda on, f, mn: classify(on, f, mn) == "PACK_DRUM", "furn_drum")

    drum = next(o for o in furn_objs if o.name == "mg42_ammo_drum")
    bm = bmesh.new()
    bm.from_mesh(drum.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in drum.data.materials]
    for f in bm.faces:
        mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify("mg42_ammo_drum", f, mn) != "HERO_DRUM":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            ty, tz = vco.z, -vco.y
            un = max(0.0, min(1.0, (tz + 5.5) / 11.0))
            vn = max(0.0, min(1.0, (ty - (-6.5)) / 11.0))
            loop[uv_layer].uv = (0.020 + un * 0.450, 0.570 + vn * 0.410)
    bm.to_mesh(drum.data)
    bm.free()


def unwrap_metal_atlas(metal_objs):
    def classify(on, f, mn):
        if mn in ("M_Brass", "M_CopperJacket"):
            return "BRASS_FIREWALL"
        if mn in ("M_RollerChrome", "M_PolishedSteel"):
            return "BRIGHT_STEEL"
        return "DARK_STEEL"

    # Strict >= 0.036 (~74px) UV firewall isolating brass/copper 7.92mm belt rounds from steel!
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.990, 0.470, 0.990, lambda on, f, mn: classify(on, f, mn) == "DARK_STEEL", "metal_dark")
    _smart_unwrap_and_pack_rect(metal_objs, 0.010, 0.590, 0.010, 0.430, lambda on, f, mn: classify(on, f, mn) == "BRIGHT_STEEL", "metal_bright")
    _smart_unwrap_and_pack_rect(metal_objs, 0.630, 0.990, 0.010, 0.430, lambda on, f, mn: classify(on, f, mn) == "BRASS_FIREWALL", "metal_brass")


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
    scene.world.light_settings.distance = 0.55
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
    print(f"[VERIFY] All {len(all_objs)} solid MG42 parts watertight | total_tris={total_tris:,}")


def main():
    t0 = time.time()
    reset_scene()
    mats = create_material_library()
    builders = {
        "mg42_receiver_shroud":     build_mg42_receiver_shroud,
        "mg42_top_cover":           build_mg42_top_cover,
        "mg42_barrel_latch":        build_mg42_barrel_latch,
        "mg42_muzzle_booster":      build_mg42_muzzle_booster,
        "mg42_aa_sight":            build_mg42_aa_sight,
        "mg42_bipod":               build_mg42_bipod,
        "mg42_buttstock":           build_mg42_buttstock,
        "mg42_grip_frame":          build_mg42_grip_frame,
        "mg42_ammo_drum":           build_mg42_ammo_drum,
        "mg42_feed_tray":           build_mg42_feed_tray,
        "mg42_feed_pawl":           build_mg42_feed_pawl,
        "mg42_barrel":              build_mg42_barrel,
        "mg42_bolt_head":           build_mg42_bolt_head,
        "mg42_locking_rollers":     build_mg42_locking_rollers,
        "mg42_locking_roller_left": build_mg42_locking_roller_left,
        "mg42_locking_wedge":       build_mg42_locking_wedge,
        "mg42_bolt_carrier":        build_mg42_bolt_carrier,
        "mg42_charging_handle":     build_mg42_charging_handle,
        "mg42_recoil_buffer":       build_mg42_recoil_buffer,
        "mg42_trigger":             build_mg42_trigger,
        "mg42_sear":                build_mg42_sear,
        "mg42_ammo_belt":           build_mg42_ammo_belt,
    }
    print("[BUILD] Sculpting all 22 solid MG 42 (7.92x57mm Mauser) parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}
    shroud_objs = [built[pid] for pid in SHROUD_PARTS]
    furn_objs   = [built[pid] for pid in FURNITURE_PARTS]
    metal_objs  = [built[pid] for pid in METAL_PARTS]
    all_objs    = shroud_objs + furn_objs + metal_objs

    verify_meshes(all_objs)
    unwrap_shroud_atlas(shroud_objs)
    unwrap_furniture_atlas(furn_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("shroud", shroud_objs), ("furniture", furn_objs), ("metal", metal_objs)):
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

    with tempfile.TemporaryDirectory(prefix="mg42_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("shroud", shroud_objs, all_objs, tmp_dir, (0.04, 0.045, 0.055, 1.0))
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir, (0.06, 0.055, 0.05, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.04, 0.045, 0.055, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "mg42_v3_shroud_albedo.webp",
        TEX_OUT_DIR / "mg42_v3_shroud_normal.webp",
        TEX_OUT_DIR / "mg42_v3_shroud_roughness.webp",
        TEX_OUT_DIR / "mg42_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "mg42_v3_furniture_normal.webp",
        TEX_OUT_DIR / "mg42_v3_furniture_roughness.webp",
        TEX_OUT_DIR / "mg42_v3_metal_albedo.webp",
        TEX_OUT_DIR / "mg42_v3_metal_normal.webp",
        TEX_OUT_DIR / "mg42_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== MG 42 COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 10.0, f"MG42 asset budget exceeded: {total_mb:.2f} MB > 10.0 MB"


if __name__ == "__main__":
    main()
