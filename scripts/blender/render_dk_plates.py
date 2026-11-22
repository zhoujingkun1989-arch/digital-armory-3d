#!/usr/bin/env python3
"""
Digital Armory 3D — Deterministic Headless Blender 5.2 Cycles Studio Master-Plate Renderer
==========================================================================================
Renders museum-grade, pure-transparent-alpha (32-bit RGBA) 2880x1800 studio master plates
with physically ray-traced Shadow Catcher contact shadows and AgX color management for
Digital Armory 3D's DK Visual Encyclopedia Monograph pipeline across all 27 exhibits
(21 firearms, 2 compound archery systems, and 4 1:1 Main Battle Tanks).

Coordinate & Framing Contract (1:1 parity with `MonographCaptureRig.tsx` & `glbAssetService.ts`):
  - Three.js metric space: 1 world unit = 1 cm = 10 mm (+X muzzle, +Y up, +Z right flank).
  - Blender Z-up space: `t2b(tx, ty, tz) = (tx, -tz, ty)` (exact glTF Y-up round-trip!).
  - Solid meshes in `public/models/<id>.glb` reside in Option A local part space; this
    script dynamically extracts exact `assembledPos` / `assembledRot` / `explodeSteps`,
    material bindings, and the 58 dynamic CSG springs/limbs/bowstrings directly from
    TypeScript sources via `scripts/blender/dump_dk_plate_specs.mjs`.
  - External 2K/4K 5-channel Packed ORM (`R=AO, G=Roughness, B=Metallic`) + OpenGL `+Y`
    normal + sRGB albedo WebPs from `public/textures/<id>_v3_*.webp` are wired into
    Cycles Principled BSDF shader trees.
  - Camera uses `sensor_fit='VERTICAL'` with exact vertical `fovDeg = 36.0` and orthonormal
    lookAt matching `THREE.PerspectiveCamera` to sub-pixel precision (including 1:1 MBT
    clipping planes `near = 2.0`, `far >= 9000` and tank minSafeDist).

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/blender/render_dk_plates.py -- \
      --weapons all --fast --skip-existing --width 2880 --height 1800
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = REPO_ROOT / "public" / "models"
TEXTURES_DIR = REPO_ROOT / "public" / "textures"
HDRI_DIR = REPO_ROOT / "public" / "hdri"
DEFAULT_OUT_DIR = REPO_ROOT / "public" / "plates"
DUMP_SPECS_SCRIPT = REPO_ROOT / "scripts" / "blender" / "dump_dk_plate_specs.mjs"

CAPTURE_FOV_DEG = 36.0
MIN_EXISTING_PLATE_BYTES = 4096

# ============================================================================
# 1. EXACT COORDINATE & KINEMATICS HELPERS (1:1 WITH src/engine/kinematics/math.ts)
# ============================================================================


def clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def smoothstep01(x: float) -> float:
    c = clamp01(x)
    return c * c * (3.0 - 2.0 * c)


def t2b(tx: float, ty: float, tz: float) -> Vector:
    """Maps Three.js (+X muzzle, +Y up, +Z right) -> Blender (+X muzzle, -Y right, +Z up)."""
    return Vector((tx, -tz, ty))


def b2t(v: Vector) -> tuple[float, float, float]:
    """Inverse of t2b: Blender -> Three.js."""
    return (v.x, v.z, -v.y)


def three_euler_to_blender_matrix(rx: float, ry: float, rz: float) -> Matrix:
    """
    Exact change-of-basis for Three.js intrinsic XYZ Euler (Rx(rx) * Ry(ry) * Rz(rz))
    under P = +90 deg X (tx->bx, ty->bz, tz->-by):
      M_b = Rx_b(rx) * Rz_b(ry) * Ry_b(-rz)
    """
    return (
        Matrix.Rotation(rx, 4, "X")
        @ Matrix.Rotation(ry, 4, "Z")
        @ Matrix.Rotation(-rz, 4, "Y")
    )


# ============================================================================
# 2. SHOT PLAN & DYNAMIC SPECIFICATION STRUCTURES
# ============================================================================


@dataclass(frozen=True)
class ShotConfig:
    key: str
    explode_t: float
    azimuth_deg: float
    elevation_deg: float
    fill_x: float
    fill_y: float
    isolated_group: str | None = None
    shadow_catcher: bool = True
    shadow_gap: float = 0.03
    use_close_focus: bool = False


SHOT_CATALOG: dict[str, ShotConfig] = {
    "cover_hero": ShotConfig(
        key="cover_hero",
        explode_t=0.0,
        azimuth_deg=18.0,
        elevation_deg=9.5,
        fill_x=0.85,
        fill_y=0.80,
        shadow_catcher=True,
        shadow_gap=0.03,
    ),
    "ortho_right": ShotConfig(
        key="ortho_right",
        explode_t=0.0,
        azimuth_deg=0.0,
        elevation_deg=1.0,
        fill_x=0.88,
        fill_y=0.82,
        shadow_catcher=True,
        shadow_gap=0.03,
    ),
    "ortho_left": ShotConfig(
        key="ortho_left",
        explode_t=0.0,
        azimuth_deg=180.0,
        elevation_deg=1.0,
        fill_x=0.88,
        fill_y=0.82,
        shadow_catcher=True,
        shadow_gap=0.03,
    ),
    "ortho_top": ShotConfig(
        key="ortho_top",
        explode_t=0.0,
        azimuth_deg=0.0,
        elevation_deg=83.0,
        fill_x=0.88,
        fill_y=0.78,
        shadow_catcher=True,
        shadow_gap=0.18,
    ),
    "exploded_bom": ShotConfig(
        key="exploded_bom",
        explode_t=1.0,
        azimuth_deg=10.0,
        elevation_deg=7.5,
        fill_x=0.85,
        fill_y=0.67,
        shadow_catcher=False,
    ),
    "group_slide": ShotConfig(
        key="group_slide",
        explode_t=0.25,
        azimuth_deg=20.0,
        elevation_deg=14.0,
        fill_x=0.82,
        fill_y=0.78,
        isolated_group="slide",
        shadow_catcher=True,
        shadow_gap=0.35,
    ),
    "group_frame": ShotConfig(
        key="group_frame",
        explode_t=0.20,
        azimuth_deg=18.0,
        elevation_deg=12.0,
        fill_x=0.84,
        fill_y=0.78,
        isolated_group="frame",
        shadow_catcher=True,
        shadow_gap=0.25,
    ),
    "group_fcg": ShotConfig(
        key="group_fcg",
        explode_t=0.28,
        azimuth_deg=22.0,
        elevation_deg=15.0,
        fill_x=0.80,
        fill_y=0.76,
        isolated_group="fire_control",
        shadow_catcher=True,
        shadow_gap=0.30,
    ),
    "group_mag": ShotConfig(
        key="group_mag",
        explode_t=0.26,
        azimuth_deg=24.0,
        elevation_deg=14.0,
        fill_x=0.80,
        fill_y=0.78,
        isolated_group="magazine",
        shadow_catcher=True,
        shadow_gap=0.25,
    ),
    "breech_closeup": ShotConfig(
        key="breech_closeup",
        explode_t=0.0,
        azimuth_deg=14.0,
        elevation_deg=10.0,
        fill_x=0.86,
        fill_y=0.80,
        shadow_catcher=False,
        use_close_focus=True,
    ),
}

DEFAULT_SHOTS: tuple[str, ...] = (
    "cover_hero",
    "ortho_right",
    "ortho_left",
    "ortho_top",
    "exploded_bom",
    "group_slide",
    "group_frame",
    "group_fcg",
    "group_mag",
    "breech_closeup",
)

EXPOSURE_BIAS_OVERRIDES: dict[str, float] = {
    "p08": 0.00,
    "ak15": 0.05,
    "ztz99a": 0.00,
    "m1a2": 0.00,
    "leopard2a7": 0.00,
    "tiger1": 0.00,
}

# Preserve exact tuned clearcoat/AO parameters for P08 & AK-15 plus material-kind defaults
ATLAS_PARAM_OVERRIDES: dict[str, tuple[float, float, float]] = {
    "p08_v3_metal": (0.18, 0.20, 0.45),
    "p08_v3_walnut": (0.06, 0.34, 0.55),
    "ak15_v3_receiver": (0.14, 0.26, 0.45),
    "ak15_v3_metal": (0.14, 0.24, 0.45),
    "ak15_v3_furniture": (0.04, 0.42, 0.48),
}

ATLAS_KIND_DEFAULTS: dict[str, tuple[float, float, float]] = {
    "metal": (0.14, 0.24, 0.45),
    "wood": (0.06, 0.34, 0.52),
    "polymer": (0.04, 0.44, 0.48),
}


@dataclass(frozen=True)
class ExplodeStep:
    start: float
    end: float
    offset: tuple[float, float, float]
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass(frozen=True)
class PartSpec:
    part_id: str
    group: str
    atlas_key: str
    assembled_pos: tuple[float, float, float]
    assembled_rot: tuple[float, float, float] = (0.0, 0.0, 0.0)
    explode_steps: tuple[ExplodeStep, ...] = ()
    dynamic_spring: bool = False
    mesh_file: str | None = None


@dataclass(frozen=True)
class AtlasSpec:
    prefix: str
    normal_strength: float
    coat_weight: float
    coat_roughness: float
    ao_factor: float = 0.50


@dataclass(frozen=True)
class WeaponRenderSpec:
    weapon_id: str
    glb_file: str
    is_tank: bool
    is_archery: bool
    atlases: dict[str, AtlasSpec]
    parts: dict[str, PartSpec]
    close_focus_pos: tuple[float, float, float]
    close_focus_target: tuple[float, float, float]
    exposure_bias: float = 0.02


def dump_specs_via_node(
    weapons_arg: str,
    specs_json_path: Path,
    mesh_dir: Path,
) -> dict[str, WeaponRenderSpec]:
    """Invokes Node + esbuild (`dump_dk_plate_specs.mjs`) to serialize TypeScript specs & dynamic CSG meshes."""
    node_bin = shutil.which("node") or "/Users/zhoujingkun/.local/bin/node"
    if not node_bin or not Path(node_bin).exists():
        raise RuntimeError(f"Could not locate Node.js binary for {DUMP_SPECS_SCRIPT}")

    subprocess.run(
        [
            node_bin,
            str(DUMP_SPECS_SCRIPT),
            "--weapons",
            weapons_arg,
            "--out-json",
            str(specs_json_path),
            "--mesh-dir",
            str(mesh_dir),
        ],
        cwd=str(REPO_ROOT),
        check=True,
    )

    payload = json.loads(specs_json_path.read_text(encoding="utf-8"))
    raw_weapons: dict[str, Any] = payload["weapons"]
    parsed: dict[str, WeaponRenderSpec] = {}

    for wid, raw in raw_weapons.items():
        atlases: dict[str, AtlasSpec] = {}
        for a_key, a_val in raw["atlases"].items():
            prefix = str(a_val["prefix"])
            kind = str(a_val.get("kind", "metal"))
            coat_w, coat_r, ao_f = ATLAS_PARAM_OVERRIDES.get(
                prefix, ATLAS_KIND_DEFAULTS.get(kind, (0.14, 0.24, 0.45))
            )
            atlases[a_key] = AtlasSpec(
                prefix=prefix,
                normal_strength=float(a_val.get("normalScale", 0.85)),
                coat_weight=coat_w,
                coat_roughness=coat_r,
                ao_factor=ao_f,
            )

        parts: dict[str, PartSpec] = {}
        for p_raw in raw["parts"]:
            steps = tuple(
                ExplodeStep(
                    start=float(s["start"]),
                    end=float(s["end"]),
                    offset=(float(s["offset"][0]), float(s["offset"][1]), float(s["offset"][2])),
                    rotation=(float(s["rotation"][0]), float(s["rotation"][1]), float(s["rotation"][2])),
                )
                for s in p_raw["explodeSteps"]
            )
            ap = p_raw["assembledPos"]
            ar = p_raw["assembledRot"]
            pspec = PartSpec(
                part_id=str(p_raw["partId"]),
                group=str(p_raw["group"]),
                atlas_key=str(p_raw["atlasKey"]),
                assembled_pos=(float(ap[0]), float(ap[1]), float(ap[2])),
                assembled_rot=(float(ar[0]), float(ar[1]), float(ar[2])),
                explode_steps=steps,
                dynamic_spring=bool(p_raw["dynamicSpring"]),
                mesh_file=p_raw.get("meshFile"),
            )
            parts[pspec.part_id] = pspec

        is_tank = bool(raw.get("isTank", False))
        is_archery = bool(raw.get("isArchery", False))
        cfp = raw["closeFocusPos"]
        cft = raw["closeFocusTarget"]
        parsed[wid] = WeaponRenderSpec(
            weapon_id=wid,
            glb_file=str(raw["glbFile"]),
            is_tank=is_tank,
            is_archery=is_archery,
            atlases=atlases,
            parts=parts,
            close_focus_pos=(float(cfp[0]), float(cfp[1]), float(cfp[2])),
            close_focus_target=(float(cft[0]), float(cft[1]), float(cft[2])),
            exposure_bias=EXPOSURE_BIAS_OVERRIDES.get(
                wid, 0.00 if is_tank else 0.02
            ),
        )

    return parsed


# ============================================================================
# 3. DYNAMIC CSG SPRING / LIMB / BOWSTRING MESH IMPORTER
# ============================================================================


def build_dynamic_mesh_object(
    part_id: str,
    mesh_path: Path,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Loads pre-serialized Three.js CSG BufferGeometry JSON into a Blender mesh in Blender Z-up space."""
    data = json.loads(mesh_path.read_text(encoding="utf-8"))
    pos_flat: list[float] = data["positions"]
    indices: list[int] = data["indices"]

    bm = bmesh.new()
    verts: list[bmesh.types.BMVert] = []
    for i in range(0, len(pos_flat), 3):
        verts.append(bm.verts.new(t2b(pos_flat[i], pos_flat[i + 1], pos_flat[i + 2])))
    bm.verts.ensure_lookup_table()

    for i in range(0, len(indices) - 2, 3):
        ia, ib, ic = indices[i], indices[i + 1], indices[i + 2]
        if ia == ib or ib == ic or ia == ic:
            continue
        try:
            bm.faces.new((verts[ia], verts[ib], verts[ic]))
        except ValueError:
            # Skip duplicate/degenerate triangle faces safely
            continue

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(part_id)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True

    obj = bpy.data.objects.new(part_id, mesh)
    collection.objects.link(obj)
    return obj


# ============================================================================
# 4. CYCLES ENGINE, MATERIAL WIRING & LONDON DK STUDIO LIGHTING
# ============================================================================


def configure_cycles_scene(
    width: int,
    height: int,
    samples: int,
    device_pref: str = "auto",
    exposure: float = 0.02,
) -> tuple[bpy.types.Scene, str]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"

    backend_used = "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    backends = (
        ("METAL", "OPTIX", "CUDA", "HIP")
        if device_pref == "auto"
        else (("METAL",) if device_pref == "metal" else ())
    )
    for backend in backends:
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
            gpu_devs = [d for d in prefs.devices if d.type == backend]
            if gpu_devs:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                backend_used = f"{backend} GPU ({gpu_devs[0].name})"
                break
        except Exception:
            continue
    if backend_used == "CPU":
        scene.cycles.device = "CPU"

    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.use_denoising = True
    if hasattr(scene.cycles, "denoiser"):
        try:
            scene.cycles.denoiser = "OPENIMAGEDENOISE"
        except Exception:
            pass
    if hasattr(scene.cycles, "denoising_input_passes"):
        try:
            scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        except Exception:
            pass

    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 4
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.sample_clamp_indirect = 10.0

    # Transparent alpha film for frameless DK white-paper compositing
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15

    # AgX Color Management with punchy museum editorial contrast
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "AgX"
    look_set = False
    for candidate_look in ("AgX - Medium High Contrast", "AgX - Base Contrast", "None"):
        try:
            scene.view_settings.look = candidate_look
            look_set = True
            break
        except Exception:
            continue
    if not look_set:
        scene.view_settings.look = "None"
    scene.view_settings.exposure = exposure
    scene.view_settings.gamma = 1.0

    return scene, backend_used


def _ensure_node_tree(id_block: bpy.types.Material | bpy.types.World) -> bpy.types.NodeTree:
    if id_block.node_tree is None:
        id_block.use_nodes = True
    return id_block.node_tree


def build_pbr_atlas_material(mat_name: str, spec: AtlasSpec) -> bpy.types.Material:
    """Wires 2K/4K sRGB Albedo + OpenGL +Y Normal + 5-Ch Packed ORM (R=AO, G=Roughness, B=Metallic)."""
    alb_path = TEXTURES_DIR / f"{spec.prefix}_albedo.webp"
    nrm_path = TEXTURES_DIR / f"{spec.prefix}_normal.webp"
    orm_path = TEXTURES_DIR / f"{spec.prefix}_roughness.webp"
    for p in (alb_path, nrm_path, orm_path):
        if not p.exists():
            raise FileNotFoundError(f"Missing required V3/V4 PBR texture: {p}")

    mat = bpy.data.materials.new(mat_name)
    nt = _ensure_node_tree(mat)
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

    t_alb = nt.nodes.new("ShaderNodeTexImage")
    t_alb.image = bpy.data.images.load(str(alb_path), check_existing=True)
    t_alb.image.colorspace_settings.name = "sRGB"

    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = bpy.data.images.load(str(nrm_path), check_existing=True)
    t_nrm.image.colorspace_settings.name = "Non-Color"

    t_orm = nt.nodes.new("ShaderNodeTexImage")
    t_orm.image = bpy.data.images.load(str(orm_path), check_existing=True)
    t_orm.image.colorspace_settings.name = "Non-Color"

    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])

    # Gentle baked micro-AO modulation (preserves engraving/panel lines without crushing Cycles GI)
    ao_mix = nt.nodes.new("ShaderNodeMix")
    ao_mix.data_type = "RGBA"
    ao_mix.blend_type = "MULTIPLY"
    ao_mix.inputs["Factor"].default_value = spec.ao_factor
    nt.links.new(t_alb.outputs["Color"], ao_mix.inputs["A"])
    nt.links.new(sep.outputs["Red"], ao_mix.inputs["B"])

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = spec.normal_strength
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])

    nt.links.new(ao_mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = spec.coat_weight
        bsdf.inputs["Coat Roughness"].default_value = spec.coat_roughness

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _make_principled_material(
    name: str,
    base_color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    coat_weight: float,
    coat_roughness: float,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = _ensure_node_tree(mat)
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    return mat


def build_dynamic_materials() -> dict[str, bpy.types.Material]:
    return {
        "spring_steel": _make_principled_material(
            "DK_TemperedSpringSteel",
            base_color=(0.48, 0.52, 0.58, 1.0),
            metallic=0.92,
            roughness=0.26,
            coat_weight=0.14,
            coat_roughness=0.20,
        ),
        "spring_stainless": _make_principled_material(
            "DK_StainlessAxle",
            base_color=(0.68, 0.71, 0.75, 1.0),
            metallic=0.96,
            roughness=0.18,
            coat_weight=0.18,
            coat_roughness=0.14,
        ),
        "spring_carbon": _make_principled_material(
            "DK_CarbonLimb",
            base_color=(0.17, 0.19, 0.22, 1.0),
            metallic=0.05,
            roughness=0.48,
            coat_weight=0.06,
            coat_roughness=0.36,
        ),
        "spring_bowstring": _make_principled_material(
            "DK_BraidedBowstring",
            base_color=(0.22, 0.25, 0.29, 1.0),
            metallic=0.0,
            roughness=0.62,
            coat_weight=0.0,
            coat_roughness=0.50,
        ),
    }


def setup_world_hdri(scene: bpy.types.Scene, hdri_strength: float = 0.88) -> None:
    hdri_path = HDRI_DIR / "blueprint_daylight.hdr"
    world = bpy.data.worlds.new("DKStudioWorld")
    scene.world = world
    nt = _ensure_node_tree(world)
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    if hdri_path.exists():
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_path), check_existing=True)
        nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = hdri_strength
    else:
        bg.inputs["Color"].default_value = (0.72, 0.76, 0.82, 1.0)
        bg.inputs["Strength"].default_value = 1.15
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def _clear_studio_rig_objects() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith("DK_Light_") or obj.name == "DK_ShadowCatcher":
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Light) and data.users == 0:
                bpy.data.lights.remove(data)
            elif isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)


def _add_area_softbox(
    scene: bpy.types.Scene,
    name: str,
    loc_b: Vector,
    target_b: Vector,
    energy: float,
    size_x: float,
    size_y: float,
    color: tuple[float, float, float],
    spread_deg: float = 110.0,
    cast_shadow: bool = True,
) -> bpy.types.Object:
    ld = bpy.data.lights.new(name, type="AREA")
    ld.shape = "RECTANGLE"
    ld.size = size_x
    ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    if hasattr(ld, "use_shadow"):
        ld.use_shadow = cast_shadow
    if hasattr(ld, "spread"):
        ld.spread = math.radians(spread_deg)
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = loc_b
    direction = (target_b - loc_b).normalized()
    lo.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return lo


def build_studio_lighting_and_shadow_catcher(
    scene: bpy.types.Scene,
    spec: WeaponRenderSpec,
    bounds_min_t: Vector,
    bounds_max_t: Vector,
    shot: ShotConfig,
    cam_pos_t: Vector,
    cam_target_t: Vector,
) -> None:
    """
    Constructs a London DK museum light-tent softbox rig scaled to the subject bounding box
    and oriented cleanly relative to the camera side, plus an invisible physical Cycles
    Shadow Catcher plane beneath the firearm, bow, or 1:1 Main Battle Tank.
    """
    _clear_studio_rig_objects()

    center_t = (bounds_min_t + bounds_max_t) * 0.5
    span_t = bounds_max_t - bounds_min_t
    scale = max(12.0, span_t.x, span_t.y, span_t.z, 14.0)
    # Energy scales quadratically with distance (inverse-square law) for consistent exposure
    # across compact pistols, tall compound bows, and 1:1 Main Battle Tanks!
    e_scale = (scale / 22.0) ** 2

    center_b = t2b(center_t.x, center_t.y, center_t.z)

    cam_delta = cam_pos_t - cam_target_t
    flank_sign = -1.0 if cam_delta.z < -0.5 else 1.0

    # 1. Longitudinal Overhead Silk Strip Softbox
    _add_area_softbox(
        scene,
        "DK_Light_OverheadStrip",
        t2b(center_t.x + 0.04 * scale, bounds_max_t.y + 0.88 * scale, flank_sign * 0.16 * scale),
        center_b,
        energy=1450.0 * e_scale,
        size_x=1.45 * scale,
        size_y=0.34 * scale,
        color=(1.0, 0.99, 0.97),
        spread_deg=100.0,
        cast_shadow=True,
    )

    # 2. High Grazing Front-Right Key Silk Softbox
    _add_area_softbox(
        scene,
        "DK_Light_KeyFront",
        t2b(center_t.x + 0.44 * scale, center_t.y + 0.78 * scale, flank_sign * 0.92 * scale),
        center_b,
        energy=940.0 * e_scale,
        size_x=0.92 * scale,
        size_y=0.48 * scale,
        color=(1.0, 0.985, 0.955),
        spread_deg=108.0,
        cast_shadow=True,
    )

    # 3. Cool-Neutral Broad Fill Bank on opposite X
    _add_area_softbox(
        scene,
        "DK_Light_CoolFill",
        t2b(center_t.x - 0.56 * scale, center_t.y + 0.34 * scale, flank_sign * 1.05 * scale),
        center_b,
        energy=430.0 * e_scale,
        size_x=1.15 * scale,
        size_y=0.64 * scale,
        color=(0.91, 0.95, 1.0),
        spread_deg=135.0,
        cast_shadow=False,
    )

    # 4. Crisp Grazing Rim Strip (separates dark armor/steel edges from white DK page)
    _add_area_softbox(
        scene,
        "DK_Light_RimStrip",
        t2b(center_t.x - 0.18 * scale, bounds_max_t.y + 0.54 * scale, -flank_sign * 0.92 * scale),
        center_b,
        energy=880.0 * e_scale,
        size_x=1.40 * scale,
        size_y=0.24 * scale,
        color=(1.0, 0.96, 0.90),
        spread_deg=92.0,
        cast_shadow=False,
    )

    # 5. Low White-Paper Bounce Fill (shadowless upward studio sweep bounce)
    _add_area_softbox(
        scene,
        "DK_Light_TableBounce",
        t2b(center_t.x, bounds_min_t.y + 0.08 * scale, flank_sign * 0.78 * scale),
        center_b,
        energy=180.0 * e_scale,
        size_x=1.35 * scale,
        size_y=0.55 * scale,
        color=(0.97, 0.98, 1.0),
        spread_deg=145.0,
        cast_shadow=False,
    )

    # 6. Physical Cycles Shadow Catcher Ground Plane
    if shot.shadow_catcher:
        shadow_gap = shot.shadow_gap * (10.0 if spec.is_tank else 1.0)
        floor_y_three = bounds_min_t.y - shadow_gap
        plane_size = max(160.0, scale * 10.0)
        bm = bmesh.new()
        bmesh.ops.create_grid(
            bm,
            x_segments=1,
            y_segments=1,
            size=plane_size * 0.5,
            matrix=Matrix.Translation(t2b(center_t.x, floor_y_three, center_t.z)),
        )
        mesh = bpy.data.meshes.new("DK_ShadowCatcher")
        bm.to_mesh(mesh)
        bm.free()
        sc_obj = bpy.data.objects.new("DK_ShadowCatcher", mesh)
        scene.collection.objects.link(sc_obj)
        sc_obj.is_shadow_catcher = True

        sc_mat = bpy.data.materials.get("DK_ShadowPaperMat")
        if sc_mat is None:
            sc_mat = bpy.data.materials.new("DK_ShadowPaperMat")
            nt_sc = _ensure_node_tree(sc_mat)
            bsdf = nt_sc.nodes.get("Principled BSDF")
            bsdf.inputs["Base Color"].default_value = (0.94, 0.94, 0.95, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.88
            bsdf.inputs["Metallic"].default_value = 0.0
        sc_obj.data.materials.append(sc_mat)


# ============================================================================
# 5. WEAPON LOADING, POSE EVALUATION & CAMERA FRAMING (1:1 MonographCaptureRig)
# ============================================================================


def _match_glb_node_to_part_id(raw_name: str, candidate_ids: set[str]) -> str | None:
    trimmed = raw_name.strip()
    if not trimmed:
        return None
    if trimmed in candidate_ids:
        return trimmed
    dot_stripped = re.sub(r"\.\d{3}$", "", trimmed)
    if dot_stripped in candidate_ids:
        return dot_stripped
    under_stripped = re.sub(r"_\d+$", "", trimmed)
    if under_stripped in candidate_ids:
        return under_stripped
    sanitized_stripped = re.sub(r"00\d$", "", trimmed)
    if sanitized_stripped in candidate_ids:
        return sanitized_stripped
    return None


def load_weapon_parts(
    scene: bpy.types.Scene,
    spec: WeaponRenderSpec,
    mesh_dir: Path,
) -> dict[str, bpy.types.Object]:
    glb_path = MODELS_DIR / spec.glb_file
    if not glb_path.exists():
        raise FileNotFoundError(f"Missing weapon GLB: {glb_path}")

    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    materials: dict[str, bpy.types.Material] = {
        key: build_pbr_atlas_material(f"DK_{spec.weapon_id}_{key}", atlas_spec)
        for key, atlas_spec in spec.atlases.items()
    }
    materials.update(build_dynamic_materials())

    non_spring_ids = {
        pid for pid, ps in spec.parts.items() if not ps.dynamic_spring
    }

    part_objs: dict[str, bpy.types.Object] = {}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        pid = _match_glb_node_to_part_id(obj.name, non_spring_ids)
        if pid is None and obj.data is not None:
            pid = _match_glb_node_to_part_id(obj.data.name, non_spring_ids)
        if pid and pid not in part_objs:
            part_objs[pid] = obj
            obj.parent = None
            obj.matrix_world = Matrix.Identity(4)

    # Load pre-serialized dynamic CSG springs / archery quad-limbs / bowstrings
    for pid, pspec in spec.parts.items():
        if pspec.dynamic_spring and pid not in part_objs:
            if not pspec.mesh_file:
                raise RuntimeError(f"Dynamic part {spec.weapon_id}/{pid} missing meshFile")
            spr = build_dynamic_mesh_object(pid, mesh_dir / pspec.mesh_file, scene.collection)
            part_objs[pid] = spr

    missing = [pid for pid in spec.parts if pid not in part_objs]
    if missing:
        raise RuntimeError(f"Weapon {spec.weapon_id} missing parts after import: {missing}")

    for pid, pspec in spec.parts.items():
        obj = part_objs[pid]
        obj.data.materials.clear()
        obj.data.materials.append(materials[pspec.atlas_key])

    return part_objs


def evaluate_part_pose_three(
    pspec: PartSpec,
    explode_t: float,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    px, py, pz = pspec.assembled_pos
    rx, ry, rz = pspec.assembled_rot
    for step in pspec.explode_steps:
        if explode_t <= step.start:
            continue
        raw = (explode_t - step.start) / (step.end - step.start) if step.end > step.start else 1.0
        w = smoothstep01(raw)
        px += step.offset[0] * w
        py += step.offset[1] * w
        pz += step.offset[2] * w
        rx += step.rotation[0] * w
        ry += step.rotation[1] * w
        rz += step.rotation[2] * w
    return (px, py, pz), (rx, ry, rz)


def apply_shot_poses_and_visibility(
    spec: WeaponRenderSpec,
    part_objs: dict[str, bpy.types.Object],
    shot: ShotConfig,
) -> tuple[Vector, Vector]:
    """
    Positions every part in Blender world space for `shot.explode_t`, isolates `shot.isolated_group`
    when requested, and returns tight Three.js-space world bounding box `(min_t, max_t)`.
    """
    min_x = min_y = min_z = float("inf")
    max_x = max_y = max_z = float("-inf")
    has_any = False

    for pid, pspec in spec.parts.items():
        obj = part_objs[pid]
        visible = (shot.isolated_group is None) or (pspec.group == shot.isolated_group)
        obj.hide_render = not visible
        obj.hide_viewport = not visible

        (px, py, pz), (rx, ry, rz) = evaluate_part_pose_three(pspec, shot.explode_t)
        mat_b = Matrix.Translation(t2b(px, py, pz)) @ three_euler_to_blender_matrix(rx, ry, rz)
        obj.matrix_world = mat_b

        if visible:
            for corner_local in obj.bound_box:
                wb = mat_b @ Vector(corner_local)
                tx, ty, tz = b2t(wb)
                if tx < min_x:
                    min_x = tx
                if ty < min_y:
                    min_y = ty
                if tz < min_z:
                    min_z = tz
                if tx > max_x:
                    max_x = tx
                if ty > max_y:
                    max_y = ty
                if tz > max_z:
                    max_z = tz
                has_any = True

    bpy.context.view_layer.update()
    if not has_any:
        if spec.is_tank:
            return Vector((-400.0, -120.0, -185.0)), Vector((720.0, 180.0, 185.0))
        return Vector((-20.0, -10.0, -3.0)), Vector((25.0, 6.0, 3.0))
    return Vector((min_x, min_y, min_z)), Vector((max_x, max_y, max_z))


def position_studio_camera(
    scene: bpy.types.Scene,
    spec: WeaponRenderSpec,
    shot: ShotConfig,
    bounds_min_t: Vector,
    bounds_max_t: Vector,
    width: int,
    height: int,
) -> tuple[Vector, Vector, float, float]:
    """
    Positions Blender PerspectiveCamera with 1:1 mathematical parity to
    `MonographCaptureRig.tsx :: positionStudioShotCamera` (vertical FOV = 36 deg).
    Returns `(cam_pos_t, cam_target_t, effective_azimuth_deg, effective_elevation_deg)`.
    """
    cam_obj = scene.camera
    if cam_obj is None:
        cam_data = bpy.data.cameras.new("DK_StudioCam")
        cam_obj = bpy.data.objects.new("DK_StudioCam", cam_data)
        scene.collection.objects.link(cam_obj)
        scene.camera = cam_obj
    else:
        cam_data = cam_obj.data

    base_clip_start = 2.0 if spec.is_tank else 0.1
    base_clip_end = 9000.0 if spec.is_tank else 1000.0

    cam_data.type = "PERSP"
    cam_data.sensor_fit = "VERTICAL"
    cam_data.lens_unit = "FOV"
    cam_data.angle = math.radians(CAPTURE_FOV_DEG)
    cam_data.clip_start = base_clip_start
    cam_data.clip_end = base_clip_end

    if shot.use_close_focus:
        cam_pos_t = Vector(spec.close_focus_pos)
        cam_target_t = Vector(spec.close_focus_target)
        d = (cam_pos_t - cam_target_t).normalized()
        eff_el = math.degrees(math.asin(max(-1.0, min(1.0, d.y))))
        eff_az = math.degrees(math.atan2(d.x, d.z))
    else:
        cx = 0.5 * (bounds_min_t.x + bounds_max_t.x)
        cy = 0.5 * (bounds_min_t.y + bounds_max_t.y)
        cz = 0.5 * (bounds_min_t.z + bounds_max_t.z)

        az = math.radians(shot.azimuth_deg)
        el = math.radians(shot.elevation_deg)
        view_dir = Vector((
            math.sin(az) * math.cos(el),
            math.sin(el),
            math.cos(az) * math.cos(el),
        )).normalized()

        world_up_t = Vector((0.0, 1.0, 0.0))
        right_t = world_up_t.cross(view_dir).normalized()
        up_t = view_dir.cross(right_t).normalized()

        max_proj_x = 1.5
        max_proj_y = 1.5
        max_depth = 0.8
        for mask in range(8):
            vx = (bounds_max_t.x if (mask & 1) else bounds_min_t.x) - cx
            vy = (bounds_max_t.y if (mask & 2) else bounds_min_t.y) - cy
            vz = (bounds_max_t.z if (mask & 4) else bounds_min_t.z) - cz
            c = Vector((vx, vy, vz))
            max_proj_x = max(max_proj_x, abs(c.dot(right_t)))
            max_proj_y = max(max_proj_y, abs(c.dot(up_t)))
            max_depth = max(max_depth, c.dot(view_dir))

        aspect = float(width) / max(1.0, float(height))
        tan_half_v = math.tan(math.radians(CAPTURE_FOV_DEG * 0.5))
        tan_half_h = tan_half_v * aspect

        dist_y = max_proj_y / (tan_half_v * shot.fill_y) + max_depth
        dist_x = max_proj_x / (tan_half_h * shot.fill_x) + max_depth
        if spec.is_tank:
            min_safe = 120.0 if shot.isolated_group else 220.0
        else:
            min_safe = 8.5 if shot.isolated_group else 14.0
        dist = max(min_safe, dist_x, dist_y)

        cam_data.clip_end = max(base_clip_end, dist + max_depth * 3.5)
        cam_target_t = Vector((cx, cy, cz))
        cam_pos_t = cam_target_t + view_dir * dist
        eff_az = shot.azimuth_deg
        eff_el = shot.elevation_deg

    pos_b = t2b(cam_pos_t.x, cam_pos_t.y, cam_pos_t.z)
    tgt_b = t2b(cam_target_t.x, cam_target_t.y, cam_target_t.z)
    z_axis = (pos_b - tgt_b).normalized()
    world_up_b = Vector((0.0, 0.0, 1.0))
    x_axis = world_up_b.cross(z_axis).normalized()
    y_axis = z_axis.cross(x_axis).normalized()

    cam_mat = Matrix((
        (x_axis.x, y_axis.x, z_axis.x, pos_b.x),
        (x_axis.y, y_axis.y, z_axis.y, pos_b.y),
        (x_axis.z, y_axis.z, z_axis.z, pos_b.z),
        (0.0, 0.0, 0.0, 1.0),
    ))
    cam_obj.matrix_world = cam_mat
    return cam_pos_t, cam_target_t, round(eff_az, 2), round(eff_el, 2)


# ============================================================================
# 6. OUTPUT ENCODING (LOSSLESS-ALPHA RGBA WEBP VIA cwebp / PIL OR PNG)
# ============================================================================


_CLEAN_ALPHA_SCRIPT = r"""
import sys
import numpy as np
from PIL import Image

png_path = sys.argv[1]
has_shadow = sys.argv[2] == "1"

im = Image.open(png_path).convert("RGBA")
arr = np.asarray(im, dtype=np.float32) / 255.0
h, w = arr.shape[:2]
a = arr[..., 3]

if not has_shadow:
    m = a > 0.50
    for _ in range(3):
        mp = np.pad(m, 1, mode="edge")
        m = (
            mp[:-2, :-2] | mp[:-2, 1:-1] | mp[:-2, 2:] |
            mp[1:-1, :-2] | mp[1:-1, 1:-1] | mp[1:-1, 2:] |
            mp[2:, :-2] | mp[2:, 1:-1] | mp[2:, 2:]
        )
    a[~m] = 0.0
else:
    floor_cut = 0.048
    knee = 0.22
    t = np.clip((a - floor_cut) / (knee - floor_cut), 0.0, 1.0)
    toe_w = t * t * (3.0 - 2.0 * t)
    a = np.where(a < knee, a * toe_w, a)

    m = a > 0.72
    for _ in range(2):
        mp = np.pad(m, 1, mode="edge")
        m = (
            mp[:-2, :-2] | mp[:-2, 1:-1] | mp[:-2, 2:] |
            mp[1:-1, :-2] | mp[1:-1, 1:-1] | mp[1:-1, 2:] |
            mp[2:, :-2] | mp[2:, 1:-1] | mp[2:, 2:]
        )
    margin_x = max(8.0, w * 0.05)
    margin_y = max(8.0, h * 0.05)
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    tx = np.clip(np.minimum(xs, (w - 1.0) - xs) / margin_x, 0.0, 1.0)
    ty = np.clip(np.minimum(ys, (h - 1.0) - ys) / margin_y, 0.0, 1.0)
    bx = tx * tx * (3.0 - 2.0 * tx)
    by = ty * ty * (3.0 - 2.0 * ty)
    border_fade = by[:, None] * bx[None, :]
    a = np.where(m, a, a * border_fade)

zero_mask = a < (0.5 / 255.0)
arr[zero_mask, :3] = 0.0
arr[..., 3] = a

out_u8 = np.rint(np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8)
Image.fromarray(out_u8, mode="RGBA").save(png_path, compress_level=1)
"""


def _find_system_python_pil() -> str | None:
    for py_cand in ("/usr/bin/python3", shutil.which("python3") or "python3"):
        if py_cand and Path(py_cand).exists():
            res = subprocess.run(
                [py_cand, "-c", "import PIL, numpy"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if res.returncode == 0:
                return py_cand
    return None


def encode_rgba_plate(
    png_path: Path,
    out_path: Path,
    fmt: str,
    webp_quality: int,
    has_shadow_catcher: bool = True,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    sys_py = _find_system_python_pil()
    if sys_py:
        subprocess.run(
            [sys_py, "-c", _CLEAN_ALPHA_SCRIPT, str(png_path), "1" if has_shadow_catcher else "0"],
            check=True,
        )

    if fmt == "png":
        shutil.copy2(png_path, out_path)
        return

    cwebp_bin = shutil.which("cwebp") or ("/opt/homebrew/bin/cwebp" if Path("/opt/homebrew/bin/cwebp").exists() else None)
    if cwebp_bin:
        subprocess.run(
            [
                cwebp_bin,
                "-quiet",
                "-q", str(webp_quality),
                "-alpha_q", "100",
                "-m", "6",
                "-mt",
                str(png_path),
                "-o", str(out_path),
            ],
            check=True,
        )
        return

    if sys_py:
        subprocess.run(
            [
                sys_py,
                "-c",
                (
                    "import sys; from PIL import Image; "
                    "im = Image.open(sys.argv[1]).convert('RGBA'); "
                    "im.save(sys.argv[2], 'WEBP', quality=int(sys.argv[3]), method=6)"
                ),
                str(png_path),
                str(out_path),
                str(webp_quality),
            ],
            check=True,
        )
        return

    raise RuntimeError("Neither `cwebp` nor system `python3` with Pillow WebP support is available.")


# ============================================================================
# 7. CLI & ORCHESTRATION
# ============================================================================


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render 4K/2880x1800 transparent Cycles master plates for Digital Armory 3D DK Visual Encyclopedia.",
    )
    parser.add_argument(
        "--weapons",
        default="p08,ak15",
        help="Comma-separated weapon IDs to render, or 'all' for all 27 exhibits. Default: p08,ak15",
    )
    parser.add_argument(
        "--shots",
        default=",".join(DEFAULT_SHOTS),
        help=f"Comma-separated shot keys. Default: {','.join(DEFAULT_SHOTS)}",
    )
    parser.add_argument("--width", type=int, default=2880, help="Output plate width in px (default: 2880)")
    parser.add_argument("--height", type=int, default=1800, help="Output plate height in px (default: 1800)")
    parser.add_argument("--samples", type=int, default=96, help="Cycles samples per pixel (default: 96)")
    parser.add_argument("--fast", action="store_true", help="Fast quality mode (56 spp + OpenImageDenoise)")
    parser.add_argument("--format", choices=("webp", "png"), default="webp", help="Output image format (default: webp)")
    parser.add_argument("--webp-quality", type=int, default=93, help="WebP RGB quality 1-100 (alpha is lossless 100; default: 93)")
    parser.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="Output directory (default: public/plates)")
    parser.add_argument("--device", choices=("auto", "metal", "cpu"), default="auto", help="Cycles compute device preference")
    parser.add_argument("--skip-existing", action="store_true", help="Skip rendering plates that already exist on disk (>=4 KB)")
    parser.add_argument("--dry-run", action="store_true", help="Verify assets, poses, framing, and manifest without rendering")
    return parser.parse_args(list(argv))


def update_manifest(
    out_dir: Path,
    weapon_entries: dict[str, dict[str, Any]],
) -> Path:
    manifest_path = out_dir / "manifest.json"
    existing: dict[str, Any] = {"version": 1, "weapons": {}}
    if manifest_path.exists():
        try:
            loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict) and isinstance(loaded.get("weapons"), dict):
                existing = loaded
        except Exception:
            pass

    weapons_map: dict[str, Any] = dict(existing.get("weapons", {}))
    for wid, entry in weapon_entries.items():
        if wid in weapons_map and isinstance(weapons_map[wid].get("plates"), dict):
            merged_plates = dict(weapons_map[wid]["plates"])
            merged_plates.update(entry["plates"])
            entry = {**entry, "plates": merged_plates}
        weapons_map[wid] = entry

    manifest = {
        "version": 1,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "weapons": weapons_map,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> None:
    raw_argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parse_args(raw_argv)

    shots = [s.strip() for s in args.shots.split(",") if s.strip()]
    for s in shots:
        if s not in SHOT_CATALOG:
            raise ValueError(f"Unsupported shot '{s}'. Supported: {sorted(SHOT_CATALOG)}")

    samples = 56 if args.fast else max(8, args.samples)
    out_dir = Path(args.out).resolve()
    ext = "webp" if args.format == "webp" else "png"
    t_total = time.time()

    with tempfile.TemporaryDirectory(prefix="dk_cycles_plates_") as tmp_str:
        tmp_dir = Path(tmp_str)
        specs_json = tmp_dir / "specs.json"
        mesh_dir = tmp_dir / "meshes"

        weapon_specs = dump_specs_via_node(args.weapons, specs_json, mesh_dir)
        weapons = list(weapon_specs.keys())

        print(
            f"[DK-PLATES] Weapons={weapons} ({len(weapons)}) | Shots={len(shots)} ({','.join(shots)}) | "
            f"{args.width}x{args.height} @ {samples} spp | format={ext} | skip_existing={args.skip_existing} | dry_run={args.dry_run}"
        )

        for wid in weapons:
            spec = weapon_specs[wid]
            scene, backend = configure_cycles_scene(
                width=args.width,
                height=args.height,
                samples=samples,
                device_pref=args.device,
                exposure=spec.exposure_bias,
            )
            setup_world_hdri(scene, hdri_strength=0.88)
            part_objs = load_weapon_parts(scene, spec, mesh_dir)
            print(
                f"\n[WEAPON] {wid.upper()} loaded ({len(part_objs)} parts, tank={spec.is_tank}, "
                f"backend={backend}, look='{scene.view_settings.look}', exposure={spec.exposure_bias:+.2f})"
            )

            plates_meta: dict[str, Any] = {}
            weapon_out_dir = out_dir / wid
            if not args.dry_run:
                weapon_out_dir.mkdir(parents=True, exist_ok=True)

            for shot_key in shots:
                shot = SHOT_CATALOG[shot_key]
                bmin_t, bmax_t = apply_shot_poses_and_visibility(spec, part_objs, shot)
                cam_pos_t, cam_tgt_t, eff_az, eff_el = position_studio_camera(
                    scene, spec, shot, bmin_t, bmax_t, args.width, args.height
                )

                rel_file = f"plates/{wid}/{shot_key}.{ext}"
                out_file = weapon_out_dir / f"{shot_key}.{ext}"

                if args.dry_run:
                    print(
                        f"  [DRY-RUN] {wid}/{shot_key:15s} bounds=({bmin_t.x:.1f}..{bmax_t.x:.1f}, "
                        f"{bmin_t.y:.1f}..{bmax_t.y:.1f}, {bmin_t.z:.1f}..{bmax_t.z:.1f}) "
                        f"cam=({cam_pos_t.x:.1f},{cam_pos_t.y:.1f},{cam_pos_t.z:.1f}) "
                        f"az={eff_az} el={eff_el} sc={shot.shadow_catcher}"
                    )
                elif args.skip_existing and out_file.exists() and out_file.stat().st_size >= MIN_EXISTING_PLATE_BYTES:
                    kb = out_file.stat().st_size / 1024.0
                    print(f"  [SKIP]   {rel_file:36s} {kb:6.1f} KB (existing)")
                else:
                    build_studio_lighting_and_shadow_catcher(
                        scene, spec, bmin_t, bmax_t, shot, cam_pos_t, cam_tgt_t
                    )
                    t0 = time.time()
                    raw_png = tmp_dir / f"{wid}_{shot_key}.png"
                    scene.render.filepath = str(raw_png)
                    bpy.ops.render.render(write_still=True)
                    encode_rgba_plate(
                        raw_png,
                        out_file,
                        args.format,
                        args.webp_quality,
                        has_shadow_catcher=shot.shadow_catcher,
                    )
                    raw_png.unlink(missing_ok=True)
                    kb = out_file.stat().st_size / 1024.0
                    print(
                        f"  [RENDER] {rel_file:36s} {args.width}x{args.height} "
                        f"{kb:6.1f} KB  ({time.time() - t0:.1f}s)"
                    )

                plates_meta[shot_key] = {
                    "file": rel_file,
                    "width": args.width,
                    "height": args.height,
                    "azimuthDeg": eff_az,
                    "elevationDeg": eff_el,
                    "fovDeg": CAPTURE_FOV_DEG,
                }

            if not args.dry_run:
                manifest_path = update_manifest(
                    out_dir,
                    {
                        wid: {
                            "renderer": "Blender 5.2 Cycles",
                            "resolution": [args.width, args.height],
                            "transparent": True,
                            "plates": plates_meta,
                        }
                    },
                )
                try:
                    disp_manifest = str(manifest_path.relative_to(REPO_ROOT))
                except ValueError:
                    disp_manifest = str(manifest_path)
                print(f"  [MANIFEST] Synced {wid} -> {disp_manifest}")

    if args.dry_run:
        print(f"\n[DRY-RUN OK] Verified {len(weapons)} weapons x {len(shots)} shots in {time.time() - t_total:.2f}s.")
        return

    print(f"\n[DONE] Completed {len(weapons)} weapons in {time.time() - t_total:.1f}s.")


if __name__ == "__main__":
    main()
