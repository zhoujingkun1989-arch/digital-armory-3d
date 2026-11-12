#!/usr/bin/env python3
"""
Unified PBR Texture Pipeline CLI for Digital Armory 3D.

Usage:
  1. Convert existing PNG maps in public/textures/ to high-fidelity WebP (and clean PNGs):
       python3 scripts/build_textures.py --convert-existing --clean-png

  2. Procedurally regenerate all 58 maps directly as WebP across all 10 weapons:
       python3 scripts/build_textures.py --regenerate
       python3 scripts/build_textures.py --regenerate --weapon m4a1
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
TEXTURES_DIR = PROJECT_ROOT / "public" / "textures"
PBR_GENERATORS_DIR = SCRIPT_DIR / "pbr"

WEAPON_GENERATORS: dict[str, str] = {
    "ak15": "generate_ak15_pbr.py",
    "m4a1": "generate_m4a1_pbr.py",
    "mp5": "generate_mp5_pbr.py",
    "g17": "generate_g17_pbr.py",
    "m82a1": "generate_m82a1_pbr.py",
    "awm": "generate_awm_pbr.py",
    "scar": "generate_scar_pbr.py",
    "deagle": "generate_deagle_pbr.py",
    "aug": "generate_aug_pbr.py",
    "p320": "generate_p320_pbr.py",
}


def detect_channel_kind(stem: str) -> str:
    if stem.endswith("_normal"):
        return "normal"
    if stem.endswith("_roughness"):
        return "roughness"
    return "albedo"


def convert_existing_pngs(clean_png: bool = False) -> None:
    png_files = sorted(TEXTURES_DIR.glob("*.png"))
    if not png_files:
        webp_files = sorted(TEXTURES_DIR.glob("*.webp"))
        print(f"[pbr-pipeline] No PNG files found. {len(webp_files)} WebP textures already present.")
        return

    quality_map = {"normal": 95, "albedo": 92, "roughness": 94}
    total_src_bytes = 0
    total_dst_bytes = 0
    t0 = time.perf_counter()

    for png_path in png_files:
        kind = detect_channel_kind(png_path.stem)
        webp_path = png_path.with_suffix(".webp")
        src_size = png_path.stat().st_size
        total_src_bytes += src_size

        with Image.open(png_path) as im:
            if im.mode not in ("L", "RGB"):
                im = im.convert("RGB")
            im.save(webp_path, "WEBP", quality=quality_map[kind], method=4)

        dst_size = webp_path.stat().st_size
        total_dst_bytes += dst_size
        ratio = (1.0 - dst_size / max(1, src_size)) * 100.0
        print(
            f"  [webp] {png_path.name:30s} -> {webp_path.name:30s} "
            f"({src_size / 1024:7.1f} KB -> {dst_size / 1024:7.1f} KB, -{ratio:4.1f}%)"
        )
        if clean_png:
            png_path.unlink()

    dt = time.perf_counter() - t0
    saved_pct = (1.0 - total_dst_bytes / max(1, total_src_bytes)) * 100.0
    print(
        f"\n[pbr-pipeline] Converted {len(png_files)} textures in {dt:.2f}s: "
        f"{total_src_bytes / (1024 * 1024):.2f} MB -> {total_dst_bytes / (1024 * 1024):.2f} MB "
        f"(-{saved_pct:.1f}%)"
    )


def regenerate_procedural(weapon: str | None = None, fmt: str = "webp") -> None:
    targets = (
        [(weapon, WEAPON_GENERATORS[weapon])]
        if weapon
        else list(WEAPON_GENERATORS.items())
    )
    env = {
        **dict(__import__("os").environ),
        "PYTHONPATH": str(PROJECT_ROOT),
        "PBR_OUTPUT_FORMAT": fmt,
    }
    t0 = time.perf_counter()
    for wid, script_name in targets:
        script_path = PBR_GENERATORS_DIR / script_name
        print(f"[pbr-pipeline] Generating {wid.upper()} PBR maps ({script_name})...")
        subprocess.run([sys.executable, str(script_path)], env=env, check=True)
    dt = time.perf_counter() - t0
    print(f"[pbr-pipeline] Procedural generation finished in {dt:.2f}s.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Digital Armory 3D PBR Texture Pipeline")
    parser.add_argument(
        "--convert-existing",
        action="store_true",
        help="Convert existing PNG maps in public/textures to optimized WebP",
    )
    parser.add_argument(
        "--clean-png",
        action="store_true",
        help="Delete source PNG files after successful WebP conversion",
    )
    parser.add_argument(
        "--regenerate",
        action="store_true",
        help="Run procedural Python generators from scratch",
    )
    parser.add_argument(
        "--weapon",
        choices=sorted(WEAPON_GENERATORS.keys()),
        default=None,
        help="Only regenerate a single weapon's PBR textures",
    )
    parser.add_argument(
        "--format",
        choices=["webp", "png"],
        default="webp",
        help="Output texture format when regenerating (default: webp)",
    )
    args = parser.parse_args()

    if args.regenerate:
        regenerate_procedural(weapon=args.weapon, fmt=args.format)
    elif args.convert_existing:
        convert_existing_pngs(clean_png=args.clean_png)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
