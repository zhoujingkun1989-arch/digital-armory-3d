#!/usr/bin/env python3
"""
Render 3 physically-based 32-bit Radiance HDR (.hdr) equirectangular studio IBL maps
using Blender 5.2 Cycles for Digital Armory 3D's photorealistic firearm shaders.

Why real Cycles studio HDRIs instead of flat Lightformer boxes:
  - Graduated silk softboxes produce smooth liquid-metal specular rolloff on curved steel & bluing.
  - Physical matte-black negative-fill flags (duvetyne gobos) right beside bright scrims carve
    high-contrast dark reflections into chrome, stainless, and parkerized surfaces.
  - Real architectural room geometry (ceiling coffers, ribbed diffusers, workshop window mullions,
    floor bounce) creates unmistakable micro-reflection realism on glossy oil/clearcoat layers.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \
    --python scripts/blender/render_studio_hdri.py
"""

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = REPO_ROOT / "public" / "hdri"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 1024x512 RGBE HDR yields ultra-crisp 512x512 PMREM cubemaps while staying compact (~500-850 KB)
HDR_WIDTH = 1024
HDR_HEIGHT = 512
CYCLES_SAMPLES = 48


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = CYCLES_SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 2
    scene.cycles.sample_clamp_indirect = 12.0

    scene.render.resolution_x = HDR_WIDTH
    scene.render.resolution_y = HDR_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"

    # Linear raw output for pure physical radiance HDRI
    scene.view_settings.view_transform = "Raw"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    # Minimal ambient world so studio architecture controls all radiance
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.005, 0.006, 0.008, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    return scene


def create_equirect_camera(scene):
    cam_data = bpy.data.cameras.new("EquirectCam")
    cam_data.type = "PANO"
    if hasattr(cam_data, "panorama_type"):
        cam_data.panorama_type = "EQUIRECTANGULAR"
    elif hasattr(cam_data, "cycles") and hasattr(cam_data.cycles, "panorama_type"):
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam_data.clip_start = 0.05
    cam_data.clip_end = 200.0

    cam_obj = bpy.data.objects.new("EquirectCam", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.0, 0.0, 0.0)
    # Level horizon looking along +Y in Blender (maps Z-up to Three.js Y-up equirectangular)
    cam_obj.rotation_euler = (math.pi * 0.5, 0.0, 0.0)
    scene.camera = cam_obj
    return cam_obj


def make_matte_material(name, rgb, roughness=0.88, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25 if metallic < 0.5 else 0.5
    return mat


def make_graduated_softbox_material(
    name,
    core_rgb,
    edge_rgb,
    core_strength,
    edge_strength,
    grid_ribs=0,
    falloff_power=1.6,
):
    """
    Physical silk diffusion scrim shader: bright hot-spot core gently tapering toward
    softbox frame edges, optionally modulated by real fabric louver/scrim ribs.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")

    # Map UV [0,1]^2 -> centered [-1,1]^2
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (-1.0, -1.0, 0.0)
    mapping.inputs["Scale"].default_value = (2.0, 2.0, 1.0)
    nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    # Elliptical distance from center (smooth softbox falloff)
    vec_len = nt.nodes.new("ShaderNodeVectorMath")
    vec_len.operation = "LENGTH"
    nt.links.new(mapping.outputs["Vector"], vec_len.inputs[0])

    # Clamp and invert: 1 at center -> 0 at perimeter
    map_r = nt.nodes.new("ShaderNodeMapRange")
    map_r.clamp = True
    map_r.inputs["From Min"].default_value = 0.0
    map_r.inputs["From Max"].default_value = 1.08
    map_r.inputs["To Min"].default_value = 1.0
    map_r.inputs["To Max"].default_value = 0.0
    nt.links.new(vec_len.outputs["Value"], map_r.inputs["Value"])

    # Power curve for realistic scrim rolloff
    pow_node = nt.nodes.new("ShaderNodeMath")
    pow_node.operation = "POWER"
    pow_node.inputs[1].default_value = falloff_power
    nt.links.new(map_r.outputs["Result"], pow_node.inputs[0])

    # Soft rectangular border bezel fade so softbox edges aren't razor-clipped pixels
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(mapping.outputs["Vector"], sep.inputs["Vector"])

    abs_x = nt.nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["X"], abs_x.inputs[0])

    abs_y = nt.nodes.new("ShaderNodeMath")
    abs_y.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Y"], abs_y.inputs[0])

    max_xy = nt.nodes.new("ShaderNodeMath")
    max_xy.operation = "MAXIMUM"
    nt.links.new(abs_x.outputs["Value"], max_xy.inputs[0])
    nt.links.new(abs_y.outputs["Value"], max_xy.inputs[1])

    bezel = nt.nodes.new("ShaderNodeMapRange")
    bezel.clamp = True
    bezel.inputs["From Min"].default_value = 0.88
    bezel.inputs["From Max"].default_value = 1.0
    bezel.inputs["To Min"].default_value = 1.0
    bezel.inputs["To Max"].default_value = 0.0
    nt.links.new(max_xy.outputs["Value"], bezel.inputs["Value"])

    # Mix color between edge and core
    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs["A"].default_value = (*edge_rgb, 1.0)
    mix_col.inputs["B"].default_value = (*core_rgb, 1.0)
    nt.links.new(pow_node.outputs["Value"], mix_col.inputs["Factor"])

    # Mix radiance strength between edge and core
    mix_str = nt.nodes.new("ShaderNodeMapRange")
    mix_str.clamp = True
    mix_str.inputs["From Min"].default_value = 0.0
    mix_str.inputs["From Max"].default_value = 1.0
    mix_str.inputs["To Min"].default_value = edge_strength
    mix_str.inputs["To Max"].default_value = core_strength
    nt.links.new(pow_node.outputs["Value"], mix_str.inputs["Value"])

    final_str = nt.nodes.new("ShaderNodeMath")
    final_str.operation = "MULTIPLY"
    nt.links.new(mix_str.outputs["Result"], final_str.inputs[0])
    nt.links.new(bezel.outputs["Result"], final_str.inputs[1])

    # Optional diffuser grid / window muntin ribs for crisp photographic reflection breakup
    if grid_ribs > 0:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "X"
        wave.wave_profile = "SIN"
        wave.inputs["Scale"].default_value = float(grid_ribs) * 0.5
        wave.inputs["Distortion"].default_value = 0.0
        nt.links.new(tex_coord.outputs["UV"], wave.inputs["Vector"])

        rib_mask = nt.nodes.new("ShaderNodeMapRange")
        rib_mask.clamp = True
        rib_mask.inputs["From Min"].default_value = 0.05
        rib_mask.inputs["From Max"].default_value = 0.22
        rib_mask.inputs["To Min"].default_value = 0.22
        rib_mask.inputs["To Max"].default_value = 1.0
        nt.links.new(wave.outputs["Fac"], rib_mask.inputs["Value"])

        rib_mul = nt.nodes.new("ShaderNodeMath")
        rib_mul.operation = "MULTIPLY"
        nt.links.new(final_str.outputs["Value"], rib_mul.inputs[0])
        nt.links.new(rib_mask.outputs["Result"], rib_mul.inputs[1])
        strength_socket = rib_mul.outputs["Value"]
    else:
        strength_socket = final_str.outputs["Value"]

    nt.links.new(mix_col.outputs["Result"], emit.inputs["Color"])
    nt.links.new(strength_socket, emit.inputs["Strength"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def add_panel(name, location, size_xy, material, look_at=None, rotation=None):
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xy[0], size_xy[1], 1.0)
    if look_at is not None:
        direction = Vector(look_at) - Vector(location)
        # Plane normal is +Z; align +Z toward target
        quat = direction.to_track_quat("Z", "Y")
        obj.rotation_euler = quat.to_euler()
    elif rotation is not None:
        obj.rotation_euler = rotation
    obj.data.materials.append(material)
    return obj


def add_studio_room(width, depth, height, wall_mat, floor_mat, ceiling_mat):
    # Floor
    add_panel(
        "StudioFloor",
        (0.0, 0.0, -height * 0.42),
        (width, depth),
        floor_mat,
        rotation=(0.0, 0.0, 0.0),
    )
    # Ceiling
    add_panel(
        "StudioCeiling",
        (0.0, 0.0, height * 0.58),
        (width, depth),
        ceiling_mat,
        rotation=(math.pi, 0.0, 0.0),
    )
    # Four architectural walls
    add_panel(
        "WallNorth",
        (0.0, depth * 0.5, height * 0.08),
        (width, height),
        wall_mat,
        rotation=(math.pi * 0.5, 0.0, 0.0),
    )
    add_panel(
        "WallSouth",
        (0.0, -depth * 0.5, height * 0.08),
        (width, height),
        wall_mat,
        rotation=(-math.pi * 0.5, 0.0, 0.0),
    )
    add_panel(
        "WallEast",
        (width * 0.5, 0.0, height * 0.08),
        (depth, height),
        wall_mat,
        rotation=(0.0, -math.pi * 0.5, 0.0),
    )
    add_panel(
        "WallWest",
        (-width * 0.5, 0.0, height * 0.08),
        (depth, height),
        wall_mat,
        rotation=(0.0, math.pi * 0.5, 0.0),
    )


def add_ceiling_beams(count, span_x, depth_y, z_height, mat):
    for i in range(count):
        t = (i / max(1, count - 1)) - 0.5
        y = t * depth_y * 0.82
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, y, z_height))
        beam = bpy.context.active_object
        beam.name = f"CeilingBeam_{i}"
        beam.scale = (span_x, 0.28, 0.36)
        beam.data.materials.append(mat)


def build_tactical_vault_studio(scene):
    """
    Commercial AAA firearms macro photography studio (neutral-warm dark graphite):
    - Twin longitudinal overhead silk strip softboxes (5400K neutral white, 28 EV peak)
      separated by a matte-black duvetyne negative-fill strip right down the bore axis so
      curved barrels, dust covers, and chamfered receiver edges catch razor-sharp dual liquid-steel
      highlight bands instead of flat dim grey!
    - Balanced front-right (+Z) and rear-left (-Z) softboxes + warm 3800K grazing rim strips
      so BOTH flanks of dark parkerized/blued firearms read with rich photographic depth.
    """
    wall_mat = make_matte_material("VaultWalls", (0.11, 0.115, 0.122), roughness=0.84, metallic=0.04)
    floor_mat = make_matte_material("VaultFloor", (0.085, 0.088, 0.094), roughness=0.62, metallic=0.04)
    ceil_mat = make_matte_material("VaultCeiling", (0.06, 0.063, 0.068), roughness=0.90, metallic=0.0)
    beam_mat = make_matte_material("VaultBeams", (0.14, 0.145, 0.155), roughness=0.52, metallic=0.55)
    flag_mat = make_matte_material("NegativeFillFlag", (0.002, 0.002, 0.0025), roughness=0.99, metallic=0.0)

    add_studio_room(18.0, 14.0, 8.2, wall_mat, floor_mat, ceil_mat)
    add_ceiling_beams(5, 17.6, 13.4, 4.45, beam_mat)

    # Broad neutral-slate horizon bounce cards so vertical receiver & stock flanks show smooth tonal gradation
    mat_horizon_bounce = make_graduated_softbox_material(
        "HorizonWrapBounce",
        core_rgb=(0.86, 0.88, 0.91),
        edge_rgb=(0.18, 0.19, 0.21),
        core_strength=4.2,
        edge_strength=0.55,
        grid_ribs=0,
        falloff_power=1.25,
    )
    add_panel("HorizonWrap_Front", (0.0, -6.2, 1.35), (15.0, 4.0), mat_horizon_bounce, look_at=(0.0, 0.0, 0.0))
    add_panel("HorizonWrap_Rear", (0.0, 6.2, 1.35), (15.0, 4.0), mat_horizon_bounce, look_at=(0.0, 0.0, 0.0))

    mat_floor_bounce = make_graduated_softbox_material(
        "StudioFloorBounce",
        core_rgb=(0.34, 0.35, 0.37),
        edge_rgb=(0.09, 0.095, 0.105),
        core_strength=1.35,
        edge_strength=0.22,
        grid_ribs=0,
        falloff_power=1.35,
    )
    add_panel("TableBounce", (0.0, 0.0, -3.15), (12.5, 9.0), mat_floor_bounce, rotation=(0.0, 0.0, 0.0))

    # 1. Twin primary overhead longitudinal silk strips flanking a central matte-black duvetyne gobo
    #    (classic commercial watch & firearm lighting: razor-crisp metallic highlight stripes!)
    mat_overhead_strip = make_graduated_softbox_material(
        "OverheadStripScrim",
        core_rgb=(1.0, 0.99, 0.97),
        edge_rgb=(0.68, 0.70, 0.74),
        core_strength=26.0,
        edge_strength=2.4,
        grid_ribs=5,
        falloff_power=1.30,
    )
    add_panel(
        "OverheadStrip_Front",
        (0.0, -1.75, 3.85),
        (11.4, 1.35),
        mat_overhead_strip,
        look_at=(0.0, 0.0, 0.0),
    )
    add_panel(
        "OverheadStrip_Rear",
        (0.0, 1.75, 3.85),
        (11.4, 1.35),
        mat_overhead_strip,
        look_at=(0.0, 0.0, 0.0),
    )
    # Central overhead negative-fill gobo right between the twin strips
    add_panel(
        "OverheadNegativeFill",
        (0.0, 0.0, 3.72),
        (11.8, 1.15),
        flag_mat,
        rotation=(math.pi, 0.0, 0.0),
    )

    # 2. Front-right (+Z flank) neutral-white key diffusion bank (sculpts right receiver, dust cover & barrel)
    mat_key_front = make_graduated_softbox_material(
        "KeyBankFront",
        core_rgb=(1.0, 0.985, 0.96),
        edge_rgb=(0.56, 0.58, 0.62),
        core_strength=17.5,
        edge_strength=1.8,
        grid_ribs=4,
        falloff_power=1.45,
    )
    add_panel("KeySoftbox_Front", (3.2, -4.3, 2.05), (6.0, 2.3), mat_key_front, look_at=(0.0, 0.0, 0.0))

    # 3. Front-left soft neutral-cool fill scrim (lifts shadows in polymer stippling & trigger guard)
    mat_fill = make_graduated_softbox_material(
        "NeutralFill",
        core_rgb=(0.90, 0.93, 0.98),
        edge_rgb=(0.34, 0.37, 0.42),
        core_strength=7.8,
        edge_strength=0.95,
        grid_ribs=0,
        falloff_power=1.55,
    )
    add_panel("FillSoftbox_Front", (-4.2, -3.9, 1.55), (5.6, 2.6), mat_fill, look_at=(0.0, 0.0, 0.0))

    # 4. Rear-left (-Z flank) warm-neutral balanced key + grazing rim bank so the LEFT flank gleams equally!
    mat_key_rear = make_graduated_softbox_material(
        "KeyBankRear",
        core_rgb=(1.0, 0.95, 0.88),
        edge_rgb=(0.52, 0.48, 0.44),
        core_strength=16.5,
        edge_strength=1.8,
        grid_ribs=3,
        falloff_power=1.40,
    )
    add_panel("KeySoftbox_Rear", (-3.2, 4.3, 2.05), (6.2, 2.2), mat_key_rear, look_at=(0.0, 0.0, 0.0))

    # 5. Warm tungsten grazing edge rim strip (signature warm edge kiss on dark gunmetal & barrel crown)
    mat_rim_warm = make_graduated_softbox_material(
        "WarmRimStrip",
        core_rgb=(1.0, 0.84, 0.62),
        edge_rgb=(0.76, 0.50, 0.28),
        core_strength=22.0,
        edge_strength=2.2,
        grid_ribs=0,
        falloff_power=1.30,
    )
    add_panel("RearWarmRim", (3.6, 4.6, 1.75), (6.4, 1.10), mat_rim_warm, look_at=(0.0, 0.0, 0.0))

    # 6. Crisp muzzle-side & stock-side kickers (define muzzle ports, front sight hood, buttpad ribs)
    mat_kicker = make_graduated_softbox_material(
        "MuzzleKicker",
        core_rgb=(1.0, 0.94, 0.86),
        edge_rgb=(0.54, 0.50, 0.46),
        core_strength=11.0,
        edge_strength=1.1,
        grid_ribs=0,
        falloff_power=1.50,
    )
    add_panel("RightKicker", (5.8, 0.6, 1.25), (3.4, 2.2), mat_kicker, look_at=(0.0, 0.0, 0.0))
    add_panel("LeftKicker", (-5.8, -0.6, 1.25), (3.4, 2.2), mat_kicker, look_at=(0.0, 0.0, 0.0))

    # 7. Physical Matte-Black Negative-Fill Flags placed cleanly below eye-level horizon so they carve
    #    crisp dark lower reflection bands without starving upper receiver flats of studio light!
    add_panel("BlackFlag_FrontLow", (0.2, -3.5, -1.25), (5.0, 1.05), flag_mat, look_at=(0.0, 0.0, 0.0))
    add_panel("BlackFlag_RearLow", (0.0, 3.6, -1.25), (5.2, 1.05), flag_mat, look_at=(0.0, 0.0, 0.0))


def build_gunsmith_bench_studio(scene):
    """
    Master gunsmith workshop:
    - Twin warm 4000K overhead shop linear strip fixtures with metallic reflectors
    - Left frosted industrial multi-pane steel window casting crisp daylight reflections
    - Warm walnut/plaster workshop walls + dark bench absorption below
    """
    wall_mat = make_matte_material("ShopWalls", (0.18, 0.16, 0.14), roughness=0.86, metallic=0.0)
    floor_mat = make_matte_material("ShopBench", (0.12, 0.10, 0.085), roughness=0.72, metallic=0.0)
    ceil_mat = make_matte_material("ShopCeiling", (0.10, 0.10, 0.11), roughness=0.92, metallic=0.0)
    beam_mat = make_matte_material("ShopBeams", (0.20, 0.18, 0.16), roughness=0.58, metallic=0.55)
    flag_mat = make_matte_material("ShopDarkShadow", (0.006, 0.006, 0.007), roughness=0.96, metallic=0.0)

    add_studio_room(15.0, 11.0, 6.8, wall_mat, floor_mat, ceil_mat)
    add_ceiling_beams(4, 14.6, 10.4, 3.65, beam_mat)

    mat_shop_wrap = make_graduated_softbox_material(
        "ShopWarmWallBounce",
        core_rgb=(0.68, 0.56, 0.44),
        edge_rgb=(0.18, 0.15, 0.13),
        core_strength=1.45,
        edge_strength=0.22,
        grid_ribs=0,
        falloff_power=1.35,
    )
    add_panel("ShopWrapFront", (0.0, -5.2, 0.6), (12.0, 3.2), mat_shop_wrap, look_at=(0.0, 0.0, 0.0))
    add_panel("ShopWrapRear", (0.0, 5.2, 0.6), (12.0, 3.0), mat_shop_wrap, look_at=(0.0, 0.0, 0.0))

    # Twin warm 4000K overhead workshop linear fixtures
    mat_tube = make_graduated_softbox_material(
        "ShopTube4000K",
        core_rgb=(1.0, 0.87, 0.72),
        edge_rgb=(0.76, 0.58, 0.42),
        core_strength=11.0,
        edge_strength=1.6,
        grid_ribs=0,
        falloff_power=1.35,
    )
    add_panel("ShopTube_Front", (0.0, -1.35, 3.25), (8.8, 0.95), mat_tube, rotation=(math.pi, 0.0, 0.0))
    add_panel("ShopTube_Back", (0.0, 1.35, 3.25), (8.8, 0.95), mat_tube, rotation=(math.pi, 0.0, 0.0))

    # Left frosted industrial workshop window (cool 6500K overcast sky with steel mullions)
    mat_window = make_graduated_softbox_material(
        "WorkshopWindow",
        core_rgb=(0.76, 0.88, 1.0),
        edge_rgb=(0.42, 0.56, 0.74),
        core_strength=6.2,
        edge_strength=1.4,
        grid_ribs=5,
        falloff_power=1.4,
    )
    add_panel("SideWindow", (-5.6, -1.2, 1.35), (4.4, 2.7), mat_window, look_at=(0.0, 0.0, 0.0))

    # Warm articulated bench task lamp on front-right
    mat_lamp = make_graduated_softbox_material(
        "TaskLamp",
        core_rgb=(1.0, 0.80, 0.56),
        edge_rgb=(0.68, 0.45, 0.26),
        core_strength=8.5,
        edge_strength=0.9,
        grid_ribs=0,
        falloff_power=1.7,
    )
    add_panel("BenchTaskLamp", (3.8, -3.4, 1.85), (2.8, 1.8), mat_lamp, look_at=(0.0, 0.0, 0.0))

    # Subtle steel cool rim on rear-right
    mat_cool_rim = make_graduated_softbox_material(
        "ShopCoolRim",
        core_rgb=(0.72, 0.84, 0.98),
        edge_rgb=(0.32, 0.40, 0.52),
        core_strength=4.5,
        edge_strength=0.5,
        grid_ribs=0,
        falloff_power=1.6,
    )
    add_panel("ShopRearRim", (3.2, 4.2, 1.4), (4.6, 1.2), mat_cool_rim, look_at=(0.0, 0.0, 0.0))

    # Dark workbench occlusion flags near horizon
    add_panel("BenchFlagFront", (0.0, -3.1, -0.4), (5.0, 1.3), flag_mat, look_at=(0.0, 0.0, 0.0))
    add_panel("BenchFlagRear", (-1.5, 3.8, -0.4), (5.4, 1.5), flag_mat, look_at=(0.0, 0.0, 0.0))


def build_blueprint_daylight_studio(scene):
    """
    High-key clean museum engineering photography studio:
    - Wrap-around soft neutral 6200K studio cyclorama
    - Intentional dark charcoal side flags so polished steel & chrome retain crisp metallic contrast
    """
    wall_mat = make_matte_material("DaylightWalls", (0.36, 0.42, 0.50), roughness=0.90, metallic=0.0)
    floor_mat = make_matte_material("DaylightFloor", (0.28, 0.34, 0.42), roughness=0.80, metallic=0.0)
    ceil_mat = make_matte_material("DaylightCeiling", (0.45, 0.50, 0.58), roughness=0.92, metallic=0.0)
    flag_mat = make_matte_material("DaylightContrastFlag", (0.025, 0.032, 0.044), roughness=0.95, metallic=0.0)

    add_studio_room(18.0, 14.0, 8.2, wall_mat, floor_mat, ceil_mat)

    mat_canopy = make_graduated_softbox_material(
        "DaylightCanopy",
        core_rgb=(1.0, 0.99, 0.97),
        edge_rgb=(0.78, 0.84, 0.92),
        core_strength=7.8,
        edge_strength=1.8,
        grid_ribs=0,
        falloff_power=1.35,
    )
    add_panel("DaylightOverhead", (0.0, 0.0, 3.8), (10.5, 4.2), mat_canopy, rotation=(math.pi, 0.0, 0.0))

    mat_side_a = make_graduated_softbox_material(
        "DaylightSideA",
        core_rgb=(1.0, 0.98, 0.95),
        edge_rgb=(0.72, 0.78, 0.86),
        core_strength=5.2,
        edge_strength=1.2,
        grid_ribs=0,
        falloff_power=1.5,
    )
    add_panel("DaylightFrontKey", (4.0, -4.6, 2.0), (5.5, 2.8), mat_side_a, look_at=(0.0, 0.0, 0.0))
    add_panel("DaylightRearRim", (-3.8, 4.6, 2.1), (5.5, 2.6), mat_side_a, look_at=(0.0, 0.0, 0.0))

    mat_side_b = make_graduated_softbox_material(
        "DaylightSideB",
        core_rgb=(0.88, 0.94, 1.0),
        edge_rgb=(0.58, 0.68, 0.80),
        core_strength=3.8,
        edge_strength=0.9,
        grid_ribs=0,
        falloff_power=1.5,
    )
    add_panel("DaylightLeftFill", (-4.8, -3.6, 1.6), (4.8, 2.6), mat_side_b, look_at=(0.0, 0.0, 0.0))
    add_panel("DaylightRightFill", (4.8, 3.6, 1.6), (4.8, 2.6), mat_side_b, look_at=(0.0, 0.0, 0.0))

    # Intentional dark negative-fill strips so chrome/blued steel still gleam in daylight mode!
    add_panel("DaylightFlag_Front", (0.0, -3.4, -0.3), (4.2, 1.1), flag_mat, look_at=(0.0, 0.0, 0.0))
    add_panel("DaylightFlag_Side", (-3.6, 0.4, 0.1), (2.2, 1.6), flag_mat, look_at=(0.0, 0.0, 0.0))


STUDIOS = [
    ("tactical_vault", build_tactical_vault_studio),
    ("gunsmith_bench", build_gunsmith_bench_studio),
    ("blueprint_daylight", build_blueprint_daylight_studio),
]


def main():
    for preset_id, builder in STUDIOS:
        scene = reset_scene()
        create_equirect_camera(scene)
        builder(scene)
        out_path = OUT_DIR / f"{preset_id}.hdr"
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        size_kb = out_path.stat().st_size / 1024.0 if out_path.exists() else 0.0
        print(f"[HDRI OK] {out_path.name} ({HDR_WIDTH}x{HDR_HEIGHT}, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
