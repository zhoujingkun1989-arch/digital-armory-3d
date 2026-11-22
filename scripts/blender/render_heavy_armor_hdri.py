#!/usr/bin/env python3
"""
Render a dedicated 1:1 Heavy Armor Assembly Hangar / Tank Museum Hall 32-bit Radiance HDR (.hdr)
equirectangular environment map using Blender 5.2 Cycles.

Architectural features built at genuine 1:1 meter scale (centered at tank turret height,
floor at Z = -2.2 m, eaves at Z = +10.2 m, gable ridge at Z = +12.6 m, hall 42 m x 28 m):
  - High industrial pitched roof deck with 9 full-span open-web steel roof trusses & purlins
  - 50-ton weathered ochre-steel overhead depot gantry crane bridge & runway rails
  - Dual angled clerestory skylight bays (cool 6800K overcast daylight) with real 3D steel mullions
  - Twin overhead rows of linear industrial high-bay LED luminaires in dark metal hoods (5400K)
  - Warm 3500K sodium/tungsten service-bay & gantry work fixtures for cool/warm metallic contrast
  - Matte dark architectural concrete walls with structural pilasters & corrugated steel blast doors
  - Warm-neutral weathered poured-concrete floor receiving physical multi-bounce GI below horizon

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
    --python scripts/blender/render_heavy_armor_hdri.py
"""

from __future__ import annotations

import math
import time
from pathlib import Path

import bpy
from mathutils import Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO_ROOT / "public" / "hdri"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH = OUT_DIR / "heavy_armor_hangar.hdr"

# 1024x512 32-bit RGBE Radiance HDR -> crisp PMREM cubemap, strictly <= 1.8 MB (~1.1-1.5 MB)
HDR_WIDTH = 1024
HDR_HEIGHT = 512
CYCLES_SAMPLES = 64
MAX_FILE_BYTES = int(1.8 * 1024 * 1024)


def configure_cycles_device(scene: bpy.types.Scene) -> str:
    """Enable Apple Silicon Metal GPU when available; fall back cleanly to CPU."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for compute_type in ("METAL", "CUDA", "OPTIX", "HIP"):
            try:
                prefs.compute_device_type = compute_type
                prefs.get_devices()
                gpu_found = False
                for dev in prefs.devices:
                    if dev.type == compute_type:
                        dev.use = True
                        gpu_found = True
                    else:
                        dev.use = False
                if gpu_found:
                    scene.cycles.device = "GPU"
                    return f"GPU ({compute_type})"
            except Exception:
                continue
    except Exception:
        pass
    scene.cycles.device = "CPU"
    return "CPU"


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    device_label = configure_cycles_device(scene)
    print(f"[Hangar HDRI] Cycles compute device: {device_label}")

    scene.cycles.samples = CYCLES_SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.012
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 2
    scene.cycles.sample_clamp_direct = 36.0
    scene.cycles.sample_clamp_indirect = 14.0

    scene.render.resolution_x = HDR_WIDTH
    scene.render.resolution_y = HDR_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"

    # Linear raw radiance output (no Filmic/AgX curve baked into the HDRI)
    scene.view_settings.view_transform = "Raw"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    world = bpy.data.worlds.new("HangarWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.008, 0.011, 0.016, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    return scene


def create_equirect_camera(scene: bpy.types.Scene) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new("HangarEquirectCam")
    cam_data.type = "PANO"
    if hasattr(cam_data, "panorama_type"):
        cam_data.panorama_type = "EQUIRECTANGULAR"
    elif hasattr(cam_data, "cycles") and hasattr(cam_data.cycles, "panorama_type"):
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam_data.clip_start = 0.1
    cam_data.clip_end = 150.0

    cam_obj = bpy.data.objects.new("HangarEquirectCam", cam_data)
    scene.collection.objects.link(cam_obj)
    # Camera placed at tank turret/hull center (~2.2 m above the concrete apron)
    cam_obj.location = (0.0, 0.0, 0.0)
    # Level horizon looking along +Y in Blender -> maps Z-up to Three.js Y-up equirectangular
    cam_obj.rotation_euler = (math.pi * 0.5, 0.0, 0.0)
    scene.camera = cam_obj
    return cam_obj


# =============================================================================
# Procedural Architectural Materials
# =============================================================================


def make_architectural_concrete_material(
    name: str,
    base_rgb: tuple[float, float, float],
    dark_rgb: tuple[float, float, float],
    roughness_min: float = 0.72,
    roughness_max: float = 0.94,
    noise_scale: float = 0.35,
    bump_strength: float = 0.08,
    metallic: float = 0.0,
    expansion_grid_m: float = 0.0,
) -> bpy.types.Material:
    """World-space multi-scale poured concrete shader with tonal mottling, optional slab joints & oil sheen."""
    mat = bpy.data.materials.new(name)
    if not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.42

    geom = nt.nodes.new("ShaderNodeNewGeometry")

    noise_macro = nt.nodes.new("ShaderNodeTexNoise")
    noise_macro.inputs["Scale"].default_value = noise_scale
    noise_macro.inputs["Detail"].default_value = 6.0
    noise_macro.inputs["Roughness"].default_value = 0.62
    nt.links.new(geom.outputs["Position"], noise_macro.inputs["Vector"])

    noise_fine = nt.nodes.new("ShaderNodeTexNoise")
    noise_fine.inputs["Scale"].default_value = noise_scale * 7.5
    noise_fine.inputs["Detail"].default_value = 8.0
    noise_fine.inputs["Roughness"].default_value = 0.72
    nt.links.new(geom.outputs["Position"], noise_fine.inputs["Vector"])

    mix_fac = nt.nodes.new("ShaderNodeMath")
    mix_fac.operation = "MULTIPLY_ADD"
    mix_fac.inputs[1].default_value = 0.65
    nt.links.new(noise_macro.outputs["Fac"], mix_fac.inputs[0])

    fine_scale = nt.nodes.new("ShaderNodeMath")
    fine_scale.operation = "MULTIPLY"
    fine_scale.inputs[1].default_value = 0.35
    nt.links.new(noise_fine.outputs["Fac"], fine_scale.inputs[0])
    nt.links.new(fine_scale.outputs["Value"], mix_fac.inputs[2])

    col_mix = nt.nodes.new("ShaderNodeMix")
    col_mix.data_type = "RGBA"
    col_mix.inputs["A"].default_value = (*dark_rgb, 1.0)
    col_mix.inputs["B"].default_value = (*base_rgb, 1.0)
    nt.links.new(mix_fac.outputs["Value"], col_mix.inputs["Factor"])

    color_out = col_mix.outputs["Result"]
    if expansion_grid_m > 0.0:
        # World-space 3.5m concrete apron slab expansion seams for authentic hangar floor bounce
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.0
        brick.inputs["Scale"].default_value = 1.0 / expansion_grid_m
        brick.inputs["Mortar Size"].default_value = 0.018
        brick.inputs["Mortar Smooth"].default_value = 0.25
        brick.inputs["Brick Width"].default_value = 1.0
        brick.inputs["Row Height"].default_value = 1.0
        brick.inputs["Color1"].default_value = (1.0, 1.0, 1.0, 1.0)
        brick.inputs["Color2"].default_value = (0.92, 0.91, 0.89, 1.0)
        brick.inputs["Mortar"].default_value = (0.45, 0.44, 0.42, 1.0)
        nt.links.new(geom.outputs["Position"], brick.inputs["Vector"])

        joint_mul = nt.nodes.new("ShaderNodeMix")
        joint_mul.data_type = "RGBA"
        joint_mul.blend_type = "MULTIPLY"
        joint_mul.inputs["Factor"].default_value = 0.85
        nt.links.new(color_out, joint_mul.inputs["A"])
        nt.links.new(brick.outputs["Color"], joint_mul.inputs["B"])
        color_out = joint_mul.outputs["Result"]

    nt.links.new(color_out, bsdf.inputs["Base Color"])

    rough_map = nt.nodes.new("ShaderNodeMapRange")
    rough_map.clamp = True
    rough_map.inputs["From Min"].default_value = 0.30
    rough_map.inputs["From Max"].default_value = 0.72
    rough_map.inputs["To Min"].default_value = roughness_min
    rough_map.inputs["To Max"].default_value = roughness_max
    nt.links.new(noise_macro.outputs["Fac"], rough_map.inputs["Value"])
    nt.links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.05
    nt.links.new(noise_fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def make_concrete_wall_dado_material() -> bpy.types.Material:
    """Dark industrial concrete wall with charcoal epoxy dado skirt below Z = +1.4 m."""
    mat = bpy.data.materials.new("HangarConcreteWall")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = 0.02
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.3

    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geom.outputs["Position"], sep.inputs["Vector"])

    # Dado height mask: 0 below Z = +1.35 m (dark epoxy dado), 1 above Z = +1.55 m (raw concrete)
    dado_mask = nt.nodes.new("ShaderNodeMapRange")
    dado_mask.clamp = True
    dado_mask.inputs["From Min"].default_value = 1.32
    dado_mask.inputs["From Max"].default_value = 1.52
    dado_mask.inputs["To Min"].default_value = 0.0
    dado_mask.inputs["To Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], dado_mask.inputs["Value"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.42
    noise.inputs["Detail"].default_value = 6.0
    nt.links.new(geom.outputs["Position"], noise.inputs["Vector"])

    upper_mix = nt.nodes.new("ShaderNodeMix")
    upper_mix.data_type = "RGBA"
    upper_mix.inputs["A"].default_value = (0.095, 0.102, 0.112, 1.0)
    upper_mix.inputs["B"].default_value = (0.165, 0.172, 0.184, 1.0)
    nt.links.new(noise.outputs["Fac"], upper_mix.inputs["Factor"])

    wall_col = nt.nodes.new("ShaderNodeMix")
    wall_col.data_type = "RGBA"
    wall_col.inputs["A"].default_value = (0.052, 0.058, 0.068, 1.0)
    nt.links.new(dado_mask.outputs["Result"], wall_col.inputs["Factor"])
    nt.links.new(upper_mix.outputs["Result"], wall_col.inputs["B"])
    nt.links.new(wall_col.outputs["Result"], bsdf.inputs["Base Color"])

    wall_rough = nt.nodes.new("ShaderNodeMapRange")
    wall_rough.clamp = True
    wall_rough.inputs["From Min"].default_value = 0.0
    wall_rough.inputs["From Max"].default_value = 1.0
    wall_rough.inputs["To Min"].default_value = 0.56
    wall_rough.inputs["To Max"].default_value = 0.88
    nt.links.new(dado_mask.outputs["Result"], wall_rough.inputs["Value"])
    nt.links.new(wall_rough.outputs["Result"], bsdf.inputs["Roughness"])

    return mat


def make_metal_material(
    name: str,
    rgb: tuple[float, float, float],
    roughness: float = 0.48,
    metallic: float = 0.72,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_architectural_emitter(
    name: str,
    core_rgb: tuple[float, float, float],
    edge_rgb: tuple[float, float, float],
    core_strength: float,
    edge_strength: float,
    falloff_power: float = 1.35,
) -> bpy.types.Material:
    """Graduated architectural skylight or industrial LED luminaire emission surface."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")

    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (-1.0, -1.0, 0.0)
    mapping.inputs["Scale"].default_value = (2.0, 2.0, 1.0)
    nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(mapping.outputs["Vector"], sep.inputs["Vector"])

    # Gentle cross-pane gradient (brighter toward upper/center of skylight or diffuser bar)
    abs_y = nt.nodes.new("ShaderNodeMath")
    abs_y.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Y"], abs_y.inputs[0])

    abs_x = nt.nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["X"], abs_x.inputs[0])

    # Subtle edge falloff along bar width & ends (keeps industrial fixture look crisp, not oval softbox)
    edge_y = nt.nodes.new("ShaderNodeMapRange")
    edge_y.clamp = True
    edge_y.inputs["From Min"].default_value = 0.0
    edge_y.inputs["From Max"].default_value = 1.0
    edge_y.inputs["To Min"].default_value = 1.0
    edge_y.inputs["To Max"].default_value = 0.0
    nt.links.new(abs_y.outputs["Value"], edge_y.inputs["Value"])

    pow_y = nt.nodes.new("ShaderNodeMath")
    pow_y.operation = "POWER"
    pow_y.inputs[1].default_value = falloff_power
    nt.links.new(edge_y.outputs["Result"], pow_y.inputs[0])

    end_cap = nt.nodes.new("ShaderNodeMapRange")
    end_cap.clamp = True
    end_cap.inputs["From Min"].default_value = 0.90
    end_cap.inputs["From Max"].default_value = 1.0
    end_cap.inputs["To Min"].default_value = 1.0
    end_cap.inputs["To Max"].default_value = 0.15
    nt.links.new(abs_x.outputs["Value"], end_cap.inputs["Value"])

    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    nt.links.new(pow_y.outputs["Value"], fac.inputs[0])
    nt.links.new(end_cap.outputs["Result"], fac.inputs[1])

    col_mix = nt.nodes.new("ShaderNodeMix")
    col_mix.data_type = "RGBA"
    col_mix.inputs["A"].default_value = (*edge_rgb, 1.0)
    col_mix.inputs["B"].default_value = (*core_rgb, 1.0)
    nt.links.new(fac.outputs["Value"], col_mix.inputs["Factor"])

    str_map = nt.nodes.new("ShaderNodeMapRange")
    str_map.clamp = True
    str_map.inputs["From Min"].default_value = 0.0
    str_map.inputs["From Max"].default_value = 1.0
    str_map.inputs["To Min"].default_value = edge_strength
    str_map.inputs["To Max"].default_value = core_strength
    nt.links.new(fac.outputs["Value"], str_map.inputs["Value"])

    nt.links.new(col_mix.outputs["Result"], emit.inputs["Color"])
    nt.links.new(str_map.outputs["Result"], emit.inputs["Strength"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# =============================================================================
# Geometry Primitives
# =============================================================================


def add_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    return obj


def add_plane(
    name: str,
    location: tuple[float, float, float],
    size_xy: tuple[float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] | None = None,
    look_at: tuple[float, float, float] | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xy[0], size_xy[1], 1.0)
    if look_at is not None:
        direction = Vector(look_at) - Vector(location)
        obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    elif rotation is not None:
        obj.rotation_euler = rotation
    obj.data.materials.append(material)
    return obj


def add_strut_between(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    thickness_x: float,
    thickness_y: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    v0 = Vector(p0)
    v1 = Vector(p1)
    mid = (v0 + v1) * 0.5
    delta = v1 - v0
    length = delta.length
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (thickness_x, thickness_y, length)
    obj.rotation_euler = delta.to_track_quat("Z", "X").to_euler()
    obj.data.materials.append(material)
    return obj


# =============================================================================
# 1:1 Heavy Armor Depot / Tank Museum Assembly Hall
# =============================================================================


def build_heavy_armor_hangar(scene: bpy.types.Scene) -> None:
    hall_len_x = 42.0   # Longitudinal axis (+X muzzle / -X rear)
    hall_wid_y = 28.0   # Transverse flank axis (-Y right flank / +Y left flank)
    floor_z = -2.2      # Concrete deck 2.2 m below camera center
    eave_z = 10.2       # Sidewall eave height (12.4 m floor-to-eave clearance)
    ridge_z = 12.8      # Pitched gable apex (15.0 m total ceiling height)
    half_x = hall_len_x * 0.5
    half_y = hall_wid_y * 0.5

    # --- Materials ---
    mat_floor = make_architectural_concrete_material(
        "HangarConcreteFloor",
        base_rgb=(0.24, 0.222, 0.195),
        dark_rgb=(0.095, 0.090, 0.082),
        roughness_min=0.28,
        roughness_max=0.86,
        noise_scale=0.18,
        bump_strength=0.12,
        expansion_grid_m=3.5,
    )
    mat_wall = make_concrete_wall_dado_material()
    mat_pilaster = make_architectural_concrete_material(
        "HangarConcretePilaster",
        base_rgb=(0.11, 0.115, 0.124),
        dark_rgb=(0.068, 0.072, 0.080),
        roughness_min=0.78,
        roughness_max=0.92,
        noise_scale=0.55,
        bump_strength=0.06,
    )
    mat_roof_deck = make_metal_material(
        "HangarRoofDeck", (0.038, 0.043, 0.052), roughness=0.72, metallic=0.38
    )
    mat_truss_steel = make_metal_material(
        "HangarTrussSteel", (0.058, 0.065, 0.076), roughness=0.46, metallic=0.78
    )
    mat_mullion = make_metal_material(
        "HangarSkylightMullion", (0.028, 0.032, 0.038), roughness=0.42, metallic=0.82
    )
    mat_blast_door = make_metal_material(
        "HangarBlastDoor", (0.072, 0.078, 0.086), roughness=0.58, metallic=0.62
    )
    mat_crane_ochre = make_metal_material(
        "DepotGantryCraneOchre", (0.44, 0.28, 0.055), roughness=0.44, metallic=0.35
    )
    mat_fixture_hood = make_metal_material(
        "IndustrialFixtureHood", (0.045, 0.048, 0.055), roughness=0.36, metallic=0.85
    )

    # 1. Weathered Warm-Neutral Concrete Floor & Architectural Concrete Walls
    add_plane(
        "HangarFloor",
        (0.0, 0.0, floor_z),
        (hall_len_x + 2.0, hall_wid_y + 2.0),
        mat_floor,
        rotation=(0.0, 0.0, 0.0),
    )

    wall_h = eave_z - floor_z + 0.6
    wall_mid_z = (floor_z + eave_z) * 0.5
    # Sidewalls (North +Y, South -Y)
    add_plane(
        "WallNorth_LeftFlank",
        (0.0, half_y, wall_mid_z),
        (hall_len_x, wall_h),
        mat_wall,
        rotation=(math.pi * 0.5, 0.0, 0.0),
    )
    add_plane(
        "WallSouth_RightFlank",
        (0.0, -half_y, wall_mid_z),
        (hall_len_x, wall_h),
        mat_wall,
        rotation=(-math.pi * 0.5, 0.0, 0.0),
    )
    # End gable walls (East +X, West -X)
    end_h = ridge_z - floor_z + 0.4
    end_mid_z = (floor_z + ridge_z) * 0.5
    add_plane(
        "WallEast_MuzzleEnd",
        (half_x, 0.0, end_mid_z),
        (hall_wid_y, end_h),
        mat_wall,
        rotation=(0.0, -math.pi * 0.5, 0.0),
    )
    add_plane(
        "WallWest_RearEnd",
        (-half_x, 0.0, end_mid_z),
        (hall_wid_y, end_h),
        mat_wall,
        rotation=(0.0, math.pi * 0.5, 0.0),
    )

    # 2. Pitched Corrugated Industrial Roof Deck (left & right slopes)
    roof_slope = math.atan2(ridge_z - eave_z, half_y)
    slope_len = math.hypot(half_y, ridge_z - eave_z) + 0.4
    roof_mid_z = (eave_z + ridge_z) * 0.5
    add_plane(
        "RoofSlope_North",
        (0.0, half_y * 0.5, roof_mid_z),
        (hall_len_x + 1.0, slope_len),
        mat_roof_deck,
        rotation=(math.pi - roof_slope, 0.0, 0.0),
    )
    add_plane(
        "RoofSlope_South",
        (0.0, -half_y * 0.5, roof_mid_z),
        (hall_len_x + 1.0, slope_len),
        mat_roof_deck,
        rotation=(math.pi + roof_slope, 0.0, 0.0),
    )

    # 3. Structural Reinforced Concrete Pilasters, Crane Corbels & Runway Rails
    pilaster_xs = [-18.0, -12.0, -6.0, 0.0, 6.0, 12.0, 18.0]
    for i, px in enumerate(pilaster_xs):
        for s_idx, y_sign in enumerate((-1.0, 1.0)):
            py = y_sign * (half_y - 0.42)
            add_box(
                f"Pilaster_{i}_{s_idx}",
                (px, py, wall_mid_z),
                (0.75, 0.85, wall_h),
                mat_pilaster,
            )
            # Crane rail haunch corbel at Z = +7.3 m
            add_box(
                f"CraneCorbel_{i}_{s_idx}",
                (px, y_sign * (half_y - 1.05), 7.3),
                (0.65, 0.72, 0.85),
                mat_pilaster,
            )

    # Twin longitudinal overhead crane runway I-beams
    for s_idx, y_sign in enumerate((-1.0, 1.0)):
        add_box(
            f"CraneRunwayGirder_{s_idx}",
            (0.0, y_sign * (half_y - 1.12), 7.92),
            (hall_len_x - 0.5, 0.42, 0.62),
            mat_truss_steel,
        )

    # 4. 9 Full-Span Open-Web Steel Roof Trusses + Longitudinal Roof Purlins
    truss_xs = [-19.2, -14.4, -9.6, -4.8, 0.0, 4.8, 9.6, 14.4, 19.2]
    chord_z = 9.75
    for ti, tx in enumerate(truss_xs):
        # Bottom tension chord
        add_box(
            f"TrussBottom_{ti}",
            (tx, 0.0, chord_z),
            (0.24, hall_wid_y - 0.6, 0.28),
            mat_truss_steel,
        )
        # Upper pitched compression chords
        add_strut_between(
            f"TrussUpperNorth_{ti}",
            (tx, 0.0, ridge_z - 0.22),
            (tx, half_y - 0.3, eave_z - 0.15),
            0.24,
            0.26,
            mat_truss_steel,
        )
        add_strut_between(
            f"TrussUpperSouth_{ti}",
            (tx, 0.0, ridge_z - 0.22),
            (tx, -(half_y - 0.3), eave_z - 0.15),
            0.24,
            0.26,
            mat_truss_steel,
        )
        # Open-web Warren/Pratt diagonal bracing & vertical struts
        bay_ys = [-12.0, -9.0, -6.0, -3.0, 0.0, 3.0, 6.0, 9.0, 12.0]
        for bi, by in enumerate(bay_ys):
            top_z = ridge_z - 0.22 - (abs(by) / half_y) * (ridge_z - eave_z)
            if top_z - chord_z > 0.35:
                add_strut_between(
                    f"TrussVert_{ti}_{bi}",
                    (tx, by, chord_z),
                    (tx, by, top_z),
                    0.14,
                    0.14,
                    mat_truss_steel,
                )
            if bi < len(bay_ys) - 1:
                ny = bay_ys[bi + 1]
                ntop_z = ridge_z - 0.22 - (abs(ny) / half_y) * (ridge_z - eave_z)
                if by < 0:
                    add_strut_between(
                        f"TrussDiag_{ti}_{bi}",
                        (tx, by, chord_z),
                        (tx, ny, ntop_z),
                        0.12,
                        0.12,
                        mat_truss_steel,
                    )
                else:
                    add_strut_between(
                        f"TrussDiag_{ti}_{bi}",
                        (tx, by, top_z),
                        (tx, ny, chord_z),
                        0.12,
                        0.12,
                        mat_truss_steel,
                    )

    # Longitudinal roof purlins
    for py in (-10.8, -6.4, -2.2, 2.2, 6.4, 10.8):
        pz = ridge_z - 0.18 - (abs(py) / half_y) * (ridge_z - eave_z)
        add_box(
            f"RoofPurlin_{py:.1f}",
            (0.0, py, pz),
            (hall_len_x - 0.4, 0.18, 0.22),
            mat_truss_steel,
        )

    # 5. 50-Ton Overhead Depot Gantry Crane Bridge (parked off-center at X = -7.4 m)
    crane_x = -7.4
    for gi, dx in enumerate((-0.85, 0.85)):
        add_box(
            f"GantryBridgeGirder_{gi}",
            (crane_x + dx, 0.0, 8.62),
            (0.52, hall_wid_y - 2.3, 1.05),
            mat_crane_ochre,
        )
    # Crane hoist trolley carriage
    add_box(
        "GantryTrolleyCarriage",
        (crane_x, 3.6, 8.95),
        (2.4, 2.6, 0.95),
        mat_truss_steel,
    )

    # 6. Recessed Corrugated Steel Armored Hangar Blast Doors at Both Ends (X = +-20.6 m)
    for e_idx, x_sign in enumerate((-1.0, 1.0)):
        door_x = x_sign * (half_x - 0.25)
        add_box(
            f"BlastDoorLeaf_{e_idx}",
            (door_x, 0.0, floor_z + 3.8),
            (0.35, 11.4, 7.6),
            mat_blast_door,
        )
        # Horizontal steel stiffening ribs across blast doors
        for r_idx in range(6):
            rz = floor_z + 1.0 + r_idx * 1.15
            add_box(
                f"BlastDoorRib_{e_idx}_{r_idx}",
                (door_x - x_sign * 0.22, 0.0, rz),
                (0.16, 11.2, 0.18),
                mat_truss_steel,
            )
        # Heavy concrete door portal frame piers
        for side_y in (-6.0, 6.0):
            add_box(
                f"BlastDoorPier_{e_idx}_{side_y:.0f}",
                (door_x - x_sign * 0.35, side_y, floor_z + 4.1),
                (0.75, 0.85, 8.2),
                mat_pilaster,
            )

    # =========================================================================
    # Architectural Lighting (NO tabletop softboxes — genuine building apertures)
    # =========================================================================

    # 7. Dual Angled Clerestory Skylight Bays (Cool 6800K Overcast Daylight)
    #    South (-Y -> Right flank in Three.js) primary skylight stronger than North (+Y)
    #    for rich 3D armor form modeling with real 3D dark steel mullions!
    mat_skylight_primary = make_architectural_emitter(
        "ClerestorySkylight_Primary",
        core_rgb=(0.80, 0.89, 1.0),
        edge_rgb=(0.44, 0.56, 0.74),
        core_strength=22.0,
        edge_strength=6.2,
        falloff_power=1.12,
    )
    mat_skylight_secondary = make_architectural_emitter(
        "ClerestorySkylight_Secondary",
        core_rgb=(0.76, 0.86, 0.99),
        edge_rgb=(0.38, 0.50, 0.68),
        core_strength=15.5,
        edge_strength=4.4,
        falloff_power=1.18,
    )

    skylight_y = 8.4
    skylight_z = ridge_z - 0.25 - (skylight_y / half_y) * (ridge_z - eave_z)
    skylight_len = 35.0
    skylight_w = 4.2

    # Primary (-Y) & secondary (+Y) angled skylight glazing running along the pitched roof
    add_plane(
        "ClerestoryBay_South",
        (0.0, -skylight_y, skylight_z - 0.08),
        (skylight_len, skylight_w),
        mat_skylight_primary,
        rotation=(math.pi + roof_slope + 0.18, 0.0, 0.0),
    )
    add_plane(
        "ClerestoryBay_North",
        (0.0, skylight_y, skylight_z - 0.08),
        (skylight_len, skylight_w),
        mat_skylight_secondary,
        rotation=(math.pi - roof_slope - 0.18, 0.0, 0.0),
    )

    # Real 3D dark steel window mullions slicing both clerestory skylight bays
    for y_sign in (-1.0, 1.0):
        sy = y_sign * skylight_y
        rot_x = math.pi - y_sign * (roof_slope + 0.18)
        for mx in range(-16, 17, 3):
            add_box(
                f"SkylightMullion_{y_sign:+.0f}_{mx}",
                (float(mx), sy, skylight_z - 0.22),
                (0.16, skylight_w + 0.2, 0.24),
                mat_mullion,
                rotation=(rot_x, 0.0, 0.0),
            )
        # Longitudinal central transom bar splitting skylight into upper/lower panes
        add_box(
            f"SkylightTransom_{y_sign:+.0f}",
            (0.0, sy, skylight_z - 0.24),
            (skylight_len + 0.2, 0.16, 0.22),
            mat_mullion,
            rotation=(rot_x, 0.0, 0.0),
        )

    # 8. Upper End-Wall Industrial Clerestory Transom Windows (above blast doors)
    mat_end_transom = make_architectural_emitter(
        "EndWallTransomSky",
        core_rgb=(0.78, 0.87, 0.98),
        edge_rgb=(0.40, 0.50, 0.64),
        core_strength=11.0,
        edge_strength=2.8,
        falloff_power=1.20,
    )
    for e_idx, x_sign in enumerate((-1.0, 1.0)):
        tx = x_sign * (half_x - 0.12)
        add_plane(
            f"EndTransomWindow_{e_idx}",
            (tx, 0.0, 7.6),
            (19.0, 2.5),
            mat_end_transom,
            look_at=(0.0, 0.0, 7.6),
        )
        for my in (-6.0, -3.0, 0.0, 3.0, 6.0):
            add_box(
                f"EndTransomMullion_{e_idx}_{my:.0f}",
                (tx - x_sign * 0.15, my, 7.6),
                (0.22, 0.18, 2.6),
                mat_mullion,
            )

    # 9. Twin Overhead Rows of Linear Industrial High-Bay LED Luminaires (5400K neutral white)
    #    Suspended cleanly beneath the steel roof trusses with real dark metal reflector hoods.
    mat_highbay_key = make_architectural_emitter(
        "HighBayLED_KeyRow",
        core_rgb=(1.0, 0.985, 0.95),
        edge_rgb=(0.80, 0.84, 0.90),
        core_strength=28.0,
        edge_strength=7.0,
        falloff_power=1.20,
    )
    mat_highbay_fill = make_architectural_emitter(
        "HighBayLED_FillRow",
        core_rgb=(0.98, 0.96, 0.91),
        edge_rgb=(0.72, 0.76, 0.82),
        core_strength=20.0,
        edge_strength=5.2,
        falloff_power=1.25,
    )

    fixture_xs = [-15.0, -9.0, -3.0, 3.0, 9.0, 15.0]
    for fi, fx in enumerate(fixture_xs):
        for row_idx, (fy, fmat) in enumerate(((-3.6, mat_highbay_key), (3.6, mat_highbay_fill))):
            fz = 9.28
            # Metal reflector housing hood
            add_box(
                f"HighBayHood_{row_idx}_{fi}",
                (fx, fy, fz + 0.15),
                (3.45, 0.92, 0.24),
                mat_fixture_hood,
            )
            # Linear diffuser emitter facing downward
            add_plane(
                f"HighBayEmitter_{row_idx}_{fi}",
                (fx, fy, fz),
                (3.25, 0.76),
                fmat,
                rotation=(math.pi, 0.0, 0.0),
            )

    # 10. Warm 3500K Sodium / Tungsten Industrial Service-Bay Wall Luminaires
    #     Mounted below the crane runway along both sidewalls -> warm metallic edge rim glints!
    mat_sodium_warm = make_architectural_emitter(
        "DepotSodiumWorkBay",
        core_rgb=(1.0, 0.78, 0.46),
        edge_rgb=(0.86, 0.50, 0.22),
        core_strength=26.0,
        edge_strength=5.5,
        falloff_power=1.30,
    )
    mat_sodium_accent = make_architectural_emitter(
        "DepotSodiumAccent",
        core_rgb=(1.0, 0.82, 0.54),
        edge_rgb=(0.80, 0.48, 0.24),
        core_strength=18.0,
        edge_strength=3.8,
        falloff_power=1.35,
    )
    # Rear-left (+Y) warm industrial work fixtures (classic cool-key vs warm-rim contrast)
    for wi, wx in enumerate((-11.0, 0.0, 11.0)):
        add_box(
            f"SodiumHoodNorth_{wi}",
            (wx, half_y - 0.95, 5.88),
            (3.4, 0.48, 0.62),
            mat_fixture_hood,
        )
        add_plane(
            f"SodiumLampNorth_{wi}",
            (wx, half_y - 1.24, 5.64),
            (3.15, 0.56),
            mat_sodium_warm,
            look_at=(wx * 0.4, 0.0, 0.4),
        )
    # Front-right (-Y) restrained warm accent fixtures near depot ends (subtle warm kicker)
    for wi, wx in enumerate((-13.5, 13.5)):
        add_box(
            f"SodiumHoodSouth_{wi}",
            (wx, -(half_y - 0.95), 5.38),
            (2.8, 0.44, 0.54),
            mat_fixture_hood,
        )
        add_plane(
            f"SodiumLampSouth_{wi}",
            (wx, -(half_y - 1.22), 5.18),
            (2.55, 0.46),
            mat_sodium_accent,
            look_at=(wx * 0.4, 0.0, 0.3),
        )

    # 11. Mid-Height Frosted Industrial Side-Bay Daylight Windows (between pilasters)
    #     Gives vertical hull flanks, skirts & road-wheel hubs realistic architectural horizon sheen.
    mat_side_window = make_architectural_emitter(
        "SideBayFrostedGlass",
        core_rgb=(0.80, 0.87, 0.96),
        edge_rgb=(0.36, 0.43, 0.52),
        core_strength=7.8,
        edge_strength=2.0,
        falloff_power=1.30,
    )
    for y_sign in (-1.0, 1.0):
        wy = y_sign * (half_y - 0.14)
        for bx in (-15.0, -9.0, -3.0, 3.0, 9.0, 15.0):
            add_plane(
                f"SideBayWindow_{y_sign:+.0f}_{bx:+.0f}",
                (bx, wy, 3.9),
                (4.4, 2.7),
                mat_side_window,
                look_at=(bx, 0.0, 3.9),
            )
            # Window mullions (3 panes per bay)
            for dx in (-1.45, 0.0, 1.45):
                add_box(
                    f"SideBayMullion_{y_sign:+.0f}_{bx:+.0f}_{dx:+.1f}",
                    (bx + dx, wy - y_sign * 0.12, 3.9),
                    (0.12, 0.16, 2.75),
                    mat_mullion,
                )


def main() -> None:
    t0 = time.perf_counter()
    scene = reset_scene()
    create_equirect_camera(scene)
    build_heavy_armor_hangar(scene)

    scene.render.filepath = str(OUT_PATH)
    bpy.ops.render.render(write_still=True)

    elapsed = time.perf_counter() - t0
    size_bytes = OUT_PATH.stat().st_size if OUT_PATH.exists() else 0
    size_kb = size_bytes / 1024.0
    size_mb = size_bytes / (1024.0 * 1024.0)
    print(
        f"[HDRI OK] {OUT_PATH.name} ({HDR_WIDTH}x{HDR_HEIGHT}, "
        f"{size_kb:.1f} KB / {size_mb:.2f} MB) in {elapsed:.1f}s"
    )
    if size_bytes == 0 or size_bytes > MAX_FILE_BYTES:
        raise RuntimeError(
            f"heavy_armor_hangar.hdr size {size_bytes} bytes violates budget (0 < size <= {MAX_FILE_BYTES})"
        )


if __name__ == "__main__":
    main()
