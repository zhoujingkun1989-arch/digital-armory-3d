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

        # Right Flank Hero Band: v in [0.575, 0.765] — Factory stamp & quick-change warning
        r_img = Image.new("L", (CW, CH), 0)
        dr = ImageDraw.Draw(r_img)
        dr.text((int(CW * 0.14), int(CH * 0.30)), "MG 42   ·   MAGET BERLIN", fill=245, font=_load_font(FONT_COND, 106), anchor="lm")
        dr.text((int(CW * 0.14), int(CH * 0.68)), "LAUFWECHSEL  ->   PATR. 7,92", fill=232, font=_load_font(FONT_COND, 86), anchor="lm")
        _draw_ordnance_proof(dr, CW * 0.80, CH * 0.48, 78.0, "749")
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
        dd.ellipse((96, 96, DW - 96, DW - 96), outline=195, width=10)
        dd.text((DW // 2, int(DW * 0.30)), "GURTTROMMEL 34", fill=245, font=_load_font(FONT_COND, 76), anchor="mm")
        dd.text((DW // 2, int(DW * 0.48)), "50 PATR. 7,92", fill=255, font=_load_font(FONT_DIN, 82), anchor="mm")
        dd.text((DW // 2, int(DW * 0.68)), "cra   1943", fill=230, font=_load_font(FONT_COND, 62), anchor="mm")

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
    "mg42_ammo_belt",
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
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 1.6
    n1.inputs["Detail"].default_value = 7.0
    n1.inputs["Distortion"].default_value = 2.4
    nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])

    # Marbled German reddish-brown phenolic Bakelite (AgX calibrated, zero black crush)
    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = srgb_to_lin(0.245, 0.095, 0.052)
    mix1.inputs[7].default_value = srgb_to_lin(0.465, 0.205, 0.112)
    nt.links.new(n1.outputs["Fac"], mix1.inputs[0])
    nt.links.new(mix1.outputs[2], bsdf.inputs["Base Color"])

    rmap = nt.nodes.new("ShaderNodeMapRange")
    rmap.inputs["From Min"].default_value = 0.25
    rmap.inputs["From Max"].default_value = 0.78
    rmap.inputs["To Min"].default_value = 0.32
    rmap.inputs["To Max"].default_value = 0.46
    nt.links.new(n1.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.024
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.055
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(n1.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # AgX calibrated stamped steel (sRGB 0.20-0.25, R=0.30-0.36, zero black crush!)
        "S_StampedSteel": _build_pbr_mat(
            "S_StampedSteel",
            base_srgb=(0.208, 0.222, 0.245),
            roughness=0.32,
            metallic=0.88,
            bevel_r=0.028,
            edge_wear=0.56,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=38.0,
            grain_bump=0.022,
            aniso_stretch=(0.55, 2.8, 2.8),
        ),
        "S_PhosphateDark": _build_pbr_mat(
            "S_PhosphateDark",
            base_srgb=(0.188, 0.200, 0.218),
            roughness=0.36,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.50,
            grain_scale=46.0,
            grain_bump=0.026,
        ),
        "F_Bakelite": _build_bakelite_mat("F_Bakelite"),
        "F_FieldGray": _build_pbr_mat(
            "F_FieldGray",
            base_srgb=(0.275, 0.312, 0.282),
            roughness=0.42,
            metallic=0.68,
            bevel_r=0.026,
            edge_wear=0.46,
            edge_srgb=(0.68, 0.71, 0.73),
            grain_scale=36.0,
            grain_bump=0.024,
        ),
        "F_Steel": _build_pbr_mat(
            "F_Steel",
            base_srgb=(0.218, 0.232, 0.254),
            roughness=0.31,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.48,
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
    outer = mk_lathe_x(
        "mg_bst_o",
        [
            (1.12, -3.60), (1.84, -3.60), (1.84, -1.55), (1.58, -1.25),
            (1.58, 0.90), (1.20, 1.35), (1.20, 2.15), (1.82, 4.40),
            (1.66, 4.52), (1.42, 4.52), (0.94, 2.10), (0.58, 1.25),
            (0.58, 0.52), (1.12, 0.25), (1.12, -3.60),
        ],
        segs=40, mat=m_dk,
    )
    # 4 radial gas vents + locking detent ribs
    v1 = mk_box("c_bst_v1", 1.85, 0.56, 4.20, [("t", -0.25, 0.0, 0.0)], mat=m_dk)
    v2 = mk_box("c_bst_v2", 1.85, 4.20, 0.56, [("t", -0.25, 0.0, 0.0)], mat=m_dk)
    body = bool_subtract(outer, [v1, v2])
    collar_ribs = [
        mk_box(f"mg_bst_k{i}", 1.55, 0.34, 0.34, [("t", -2.55, 1.84, 0.0), ("rx", i * math.pi / 4.0)], mat=m_st, bevel=0.03)
        for i in range(8)
    ]
    return finish_part(join_objects([body, *collar_ribs], "mg42_muzzle_booster"), sharp_deg=36.0)


def build_mg42_barrel_latch(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    plate = mk_box("mg_bl_p", 8.20, 3.25, 0.44, mat=m_st, bevel=0.06)
    rib = mk_box("mg_bl_r", 6.40, 1.25, 0.32, [("t", 0.20, 0.0, 0.22)], mat=m_st, bevel=0.05)
    handle = mk_box("mg_bl_h", 3.40, 1.15, 0.88, [("t", -2.00, -0.35, 0.48)], mat=m_dk, bevel=0.08)
    thumb = mk_cyl("mg_bl_th", 0.46, 0.46, 0.85, axis="y", segs=20, xform=[("t", -3.45, -0.35, 0.85)], mat=m_dk, bevel=0.04)
    hinge = mk_cyl("mg_bl_hg", 0.30, 0.30, 3.35, axis="y", segs=18, xform=[("t", 3.90, 0.0, -0.04)], mat=m_dk, bevel=0.03)
    return finish_part(join_objects([plate, rib, handle, thumb, hinge], "mg42_barrel_latch"), sharp_deg=36.0)


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
    # Rear cold-stamped receiver box (`X in [-16.8, +18.2]`)
    rec = mk_box("mg_rs_rec", 35.0, 5.15, 4.65, [("t", 0.70, 1.00, 0.0)], mat=m_st, bevel=0.14)
    # Iconic perforated rectangular cooling shroud (`X in [+17.8, +73.2]`)
    shroud = mk_box("mg_rs_shr", 55.4, 4.15, 4.10, [("t", 45.50, 1.45, 0.0)], mat=m_st, bevel=0.20)
    # Carve internal cavities + 7 pairs of iconic stadium cooling vents cleanly on each solid before join!
    c_rec_in = mk_box("c_rec_in", 33.4, 3.65, 3.35, [("t", 1.20, 1.45, 0.0)], mat=m_dk)
    c_top = mk_box("c_rec_top", 24.0, 1.85, 3.45, [("t", 4.80, 3.20, 0.0)], mat=m_dk)
    c_ej = mk_box("c_rec_ej", 9.2, 1.70, 2.45, [("t", 11.80, -1.25, 0.0)], mat=m_dk)
    rec = bool_subtract(rec, [c_rec_in, c_top, c_ej])

    shr_cuts = [
        mk_box("c_shr_in", 56.6, 2.95, 2.95, [("t", 45.80, 1.50, 0.0)], mat=m_dk),
        mk_box("c_shr_win", 8.6, 3.15, 1.40, [("t", 21.20, 1.50, 1.95)], mat=m_dk),
    ]
    for i in range(7):
        vx = 29.0 + i * 6.2
        shr_cuts.append(mk_box(f"c_sv_{i}", 4.05, 1.48, 5.20, [("t", vx, 1.50, 0.0)], mat=m_dk, bevel=0.22))
        shr_cuts.append(mk_box(f"c_tv_{i}", 3.85, 2.40, 1.65, [("t", vx, 3.25, 0.0)], mat=m_dk, bevel=0.18))
    shroud = bool_subtract(shroud, shr_cuts)

    # Stamped detail ribs, folding hooded front sight, charging track & bipod collar rings
    charge_track = mk_box("mg_rs_ct", 24.2, 1.25, 0.50, [("t", 3.50, 1.50, 2.48)], mat=m_dk, bevel=0.05)
    mid_ring = mk_box("mg_rs_mr", 2.4, 4.45, 4.45, [("t", 41.40, 1.45, 0.0)], mat=m_dk, bevel=0.08)
    mid_ring = bool_subtract(mid_ring, [mk_box("c_mr", 3.0, 3.4, 3.4, [("t", 41.40, 1.45, 0.0)], mat=m_dk)])
    front_ring = mk_box("mg_rs_fr", 2.6, 4.45, 4.45, [("t", 71.60, 1.45, 0.0)], mat=m_dk, bevel=0.08)
    front_ring = bool_subtract(front_ring, [mk_box("c_fr", 3.2, 3.4, 3.4, [("t", 71.60, 1.45, 0.0)], mat=m_dk)])
    # Folding hooded triangular front sight post (`X = 69.2`)
    fs_base = mk_box("mg_fs_b", 2.2, 0.65, 1.35, [("t", 69.2, 3.65, 0.0)], mat=m_dk, bevel=0.05)
    fs_hood = mk_extrude_z("mg_fs_h", [(-0.85, 0.0), (0.85, 0.0), (0.35, 1.75), (-0.35, 1.75)], -0.58, 0.58, bevel=0.04, xform=[("t", 69.2, 3.95, 0.0)], mat=m_dk)
    fs_blade = mk_box("mg_fs_p", 0.34, 1.25, 0.18, [("t", 69.2, 4.65, 0.0)], mat=m_st, bevel=0.02)
    # Rivet heads along receiver top & bottom
    rivets = [
        mk_cyl(f"mg_rv_{k}_{s}", 0.22, 0.22, 0.28, axis="z", segs=12, xform=[("t", -14.0 + k * 5.2, 3.05, s * 2.34)], mat=m_dk, bevel=0.03)
        for k in range(6) for s in (-1, 1)
    ]
    return finish_part(join_objects([rec, shroud, charge_track, mid_ring, front_ring, fs_base, fs_hood, fs_blade, *rivets], "mg42_receiver_shroud"), sharp_deg=36.0)


def build_mg42_top_cover(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    shell = mk_box("mg_tc_s", 26.2, 1.48, 4.88, [("t", -12.40, 0.55, 0.0)], mat=m_st, bevel=0.14)
    cav = mk_box("c_tc_c", 24.2, 1.05, 3.88, [("t", -12.20, 0.10, 0.0)], mat=m_dk)
    shell = bool_subtract(shell, [cav])
    # Stamped dorsal spine ribs + rear release latch + hinge knuckle
    rib_l = mk_box("mg_tc_rl", 21.5, 0.36, 0.62, [("t", -12.20, 1.28, -1.45)], mat=m_st, bevel=0.05)
    rib_r = mk_box("mg_tc_rr", 21.5, 0.36, 0.62, [("t", -12.20, 1.28, 1.45)], mat=m_st, bevel=0.05)
    latch = mk_box("mg_tc_lt", 2.0, 1.25, 2.35, [("t", -25.40, 0.35, 0.0)], mat=m_dk, bevel=0.08)
    hinge = mk_cyl("mg_tc_hg", 0.42, 0.42, 4.95, axis="z", segs=18, xform=[("t", 0.55, 0.15, 0.0)], mat=m_dk, bevel=0.04)
    return finish_part(join_objects([shell, rib_l, rib_r, latch, hinge], "mg42_top_cover"), sharp_deg=36.0)


def build_mg42_aa_sight(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    base = mk_box("mg_aa_b", 7.80, 0.72, 2.38, [("t", 0.50, -0.10, 0.0)], mat=m_dk, bevel=0.06)
    leaf = mk_box("mg_aa_lf", 4.80, 0.44, 1.28, [("t", -1.20, 0.46, 0.0)], mat=m_st, bevel=0.04)
    slider = mk_box("mg_aa_sl", 0.95, 0.68, 1.62, [("t", -0.60, 0.56, 0.0)], mat=m_dk, bevel=0.04)
    post = mk_box("mg_aa_p", 0.48, 1.25, 0.58, [("t", 3.00, 0.82, 0.0)], mat=m_st, bevel=0.03)

    # Iconic concentric anti-aircraft spider sight (`Fliegervisier`) centered at (3.00, 2.55, 0.0)
    def ring_pts(r: float, n: int = 36):
        return [Vector((3.00, 2.55 + math.cos(2 * math.pi * i / n) * r, math.sin(2 * math.pi * i / n) * r)) for i in range(n)]

    r_out = mk_tube_along_pts("mg_aa_ro", ring_pts(1.56), 0.11, ring_segs=12, closed=True, mat=m_st)
    r_in = mk_tube_along_pts("mg_aa_ri", ring_pts(0.82), 0.08, ring_segs=10, closed=True, mat=m_st)
    v_sp = mk_box("mg_aa_vs", 0.15, 3.12, 0.15, [("t", 3.00, 2.55, 0.0)], mat=m_dk, bevel=0.01)
    h_sp = mk_box("mg_aa_hs", 0.15, 0.15, 3.12, [("t", 3.00, 2.55, 0.0)], mat=m_dk, bevel=0.01)
    d1 = mk_box("mg_aa_d1", 0.12, 0.12, 3.02, [("rx", math.pi * 0.25), ("t", 3.00, 2.55, 0.0)], mat=m_dk)
    d2 = mk_box("mg_aa_d2", 0.12, 0.12, 3.02, [("rx", -math.pi * 0.25), ("t", 3.00, 2.55, 0.0)], mat=m_dk)
    return finish_part(join_objects([base, leaf, slider, post, r_out, r_in, v_sp, h_sp, d1, d2], "mg42_aa_sight"), sharp_deg=36.0)


def build_mg42_bipod(mats):
    m_st, m_dk = mats["S_StampedSteel"], mats["S_PhosphateDark"]
    yoke = mk_box("mg_bp_y", 3.60, 2.08, 4.90, [("t", 0.0, 0.68, 0.0)], mat=m_st, bevel=0.12)
    yoke = bool_subtract(yoke, [mk_box("c_bp_y", 4.20, 1.40, 3.70, [("t", 0.0, 1.25, 0.0)], mat=m_dk)])
    screw = mk_cyl("mg_bp_sc", 0.34, 0.34, 2.40, axis="y", segs=18, xform=[("t", -0.2, -0.55, 0.0)], mat=m_dk, bevel=0.04)
    parts = [yoke, screw]
    for sgn in (-1, 1):
        leg = mk_box(f"mg_bp_l{sgn}", 24.5, 0.96, 0.76, [("ry", sgn * 0.06), ("rz", -0.04), ("t", -12.2, -0.55, sgn * 2.55)], mat=m_dk, bevel=0.06)
        rib = mk_box(f"mg_bp_rb{sgn}", 22.0, 0.34, 0.92, [("ry", sgn * 0.06), ("rz", -0.04), ("t", -12.2, -0.55, sgn * 2.55)], mat=m_st, bevel=0.04)
        spade = mk_box(f"mg_bp_sp{sgn}", 2.5, 2.65, 1.38, [("t", -24.2, -1.05, sgn * 3.15)], mat=m_st, bevel=0.07)
        parts.extend([leg, rib, spade])
    return finish_part(join_objects(parts, "mg42_bipod"), sharp_deg=36.0)


def build_mg42_buttstock(mats):
    m_bak, m_st = mats["F_Bakelite"], mats["F_Steel"]
    pts = [
        (-12.10, -5.20), (-12.10, 3.15), (4.20, 3.25), (10.50, 3.45),
        (12.20, 3.35), (12.20, 0.25), (6.50, 0.05), (2.40, -2.55),
    ]
    body = mk_extrude_z("mg_bs_b", pts, -1.92, 1.92, bevel=0.26, bevel_segs=3, mat=m_bak)
    # Iconic MG 42 left-side weak-hand cutaway pocket (`-Z` flank)
    cut_l = mk_box("c_bs_cl", 8.50, 3.20, 1.20, [("rz", 0.24), ("t", 3.60, -0.60, -1.75)], mat=m_bak, bevel=0.20)
    body = bool_subtract(body, [cut_l])
    collar = mk_cyl("mg_bs_co", 1.88, 1.98, 2.25, axis="x", segs=32, xform=[("t", 11.60, 1.85, 0.0)], mat=m_st, bevel=0.08)
    buttplate = mk_box("mg_bs_bp", 0.88, 8.60, 3.92, [("t", -12.10, -1.02, 0.0)], mat=m_st, bevel=0.10)
    swivel = mk_box("mg_bs_sw", 1.80, 0.90, 0.72, [("t", -9.20, -4.85, 0.0)], mat=m_st, bevel=0.04)
    return finish_part(join_objects([body, collar, buttplate, swivel], "mg42_buttstock"), sharp_deg=38.0)


def build_mg42_grip_frame(mats):
    m_st, m_bak, m_pol = mats["F_Steel"], mats["F_Bakelite"], mats["F_Polished"]
    upper = mk_box("mg_gf_u", 10.40, 2.38, 2.86, [("t", 0.0, 1.25, 0.0)], mat=m_st, bevel=0.10)
    upper = bool_subtract(upper, [mk_box("c_gf_u", 7.80, 1.85, 1.68, [("t", 0.20, 1.55, 0.0)], mat=m_st)])
    # Pistol grip core + ribbed Bakelite side scales
    grip_core = mk_extrude_z("mg_gf_gc", [(-4.80, 0.30), (-1.00, 0.30), (-2.60, -5.65), (-5.80, -5.45)], -1.10, 1.10, bevel=0.12, mat=m_st)
    scale_l = mk_extrude_z("mg_gf_sl", [(-4.65, -0.05), (-1.25, -0.05), (-2.75, -5.35), (-5.55, -5.18)], -1.42, -1.02, bevel=0.08, mat=m_bak)
    scale_r = mk_extrude_z("mg_gf_sr", [(-4.65, -0.05), (-1.25, -0.05), (-2.75, -5.35), (-5.55, -5.18)], 1.02, 1.42, bevel=0.08, mat=m_bak)
    # Welded closed-loop winter trigger guard (front leg + bottom bar + rear grip weld!)
    tg_f = mk_box("mg_gf_tf", 0.62, 2.75, 1.28, [("rz", -0.22), ("t", 4.35, -0.95, 0.0)], mat=m_st, bevel=0.05)
    tg_b = mk_box("mg_gf_tb", 6.80, 0.56, 1.28, [("t", 1.15, -2.18, 0.0)], mat=m_st, bevel=0.05)
    # Cross-bolt safety button (`S / F`)
    safety = mk_cyl("mg_gf_sf", 0.38, 0.38, 3.40, axis="z", segs=20, xform=[("t", -2.40, 1.25, 0.0)], mat=m_pol, bevel=0.04)
    return finish_part(join_objects([upper, grip_core, scale_l, scale_r, tg_f, tg_b, safety], "mg42_grip_frame"), sharp_deg=36.0)


def build_mg42_trigger(mats):
    m_st = mats["M_CarrierSteel"]
    head = mk_box("mg_tr_h", 2.20, 1.12, 0.68, [("t", 0.0, 0.65, 0.0)], mat=m_st, bevel=0.04)
    blade = mk_box("mg_tr_b", 0.64, 2.08, 0.52, [("rz", 0.24), ("t", 0.15, -0.75, 0.0)], mat=m_st, bevel=0.05)
    return finish_part(join_objects([head, blade], "mg42_trigger"), sharp_deg=36.0)


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
    for i in range(8):
        t = i / 7.0
        cz = 3.40 - t * 6.00
        cy = 1.35 - (t ** 1.45) * 3.30
        case = mk_lathe_x(
            f"mg_rd_c{i}",
            [
                (0.0, -4.10), (0.59, -4.10), (0.59, -3.90), (0.52, -3.84),
                (0.59, -3.72), (0.55, 0.45), (0.45, 1.10), (0.45, 1.62), (0.0, 1.62),
            ],
            segs=20, xform=[("t", 0.0, cy, cz)], mat=m_br,
        )
        bullet = mk_lathe_x(
            f"mg_rd_b{i}",
            [(0.0, 1.58), (0.41, 1.62), (0.37, 2.72), (0.14, 3.76), (0.0, 4.10)],
            segs=20, xform=[("t", 0.0, cy, cz)], mat=m_cu,
        )
        link = mk_box(f"mg_lk_{i}", 3.40, 1.28, 1.38, [("t", -0.80, cy, cz)], mat=m_lk, bevel=0.04)
        parts.extend([case, bullet, link])
    return finish_part(join_objects(parts, "mg42_ammo_belt"), sharp_deg=36.0)


def build_mg42_ammo_drum(mats):
    m_fg, m_st = mats["F_FieldGray"], mats["F_Steel"]
    drum = mk_cyl("mg_ad_d", 5.45, 5.45, 8.95, axis="x", segs=40, xform=[("t", 0.0, -1.00, 0.0)], mat=m_fg, bevel=0.22)
    # Concentric stamped reinforcing beads on front/rear drum walls
    rib_f = mk_cyl("mg_ad_rf", 3.60, 3.60, 0.28, axis="x", segs=36, xform=[("t", 4.46, -1.00, 0.0)], mat=m_fg, bevel=0.05)
    rib_r = mk_cyl("mg_ad_rr", 3.60, 3.60, 0.28, axis="x", segs=36, xform=[("t", -4.46, -1.00, 0.0)], mat=m_fg, bevel=0.05)
    neck = mk_box("mg_ad_nk", 8.65, 4.65, 3.25, [("rx", 0.42), ("t", 0.0, 3.40, 1.85)], mat=m_fg, bevel=0.14)
    latch = mk_box("mg_ad_lt", 5.20, 1.18, 1.28, [("t", 0.0, 4.42, 2.86)], mat=m_st, bevel=0.06)
    return finish_part(join_objects([drum, rib_f, rib_r, neck, latch], "mg42_ammo_drum"), sharp_deg=36.0)


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
            if n.x > 0.78 and c.x > 4.20:
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
    for f in bm.faces:
        if classify("mg42_ammo_drum", f, "") != "HERO_DRUM":
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
