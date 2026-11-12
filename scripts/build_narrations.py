#!/usr/bin/env python3
"""
Google Gemini Bilingual R&D Story, 253-Part Engineering Narration & TTS Audio Builder.

Models used (via Google GenAI Interactions API v1beta — zero video models):
  - Text & Structured JSON: `gemini-3.8-flash`
  - Weapon 4-Act R&D Story Voiceover (CN + EN): `gemini-3.8-flash-tts`
  - Component-by-Component Voiceover (CN + EN): `gemini-3.8-flash-lite-tts`

Safety & Cost Guardrails:
  - Reads GEMINI_API_KEY from environment, `.env`, `.env.local`, or `GEMINI_ENV_FILE` (never logged).
  - Halts immediately (`StopSpending`) on 402 / 429 / RESOURCE_EXHAUSTED / billing / quota errors.
  - SHA-256 content-addressed caching: existing MP3 files matching current `audioScript` hash are skipped.

Usage:
  python3 scripts/build_narrations.py --weapon ak15 --dry-run
  python3 scripts/build_narrations.py --weapon ak15
  python3 scripts/build_narrations.py --all
"""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from typing import Any, List, Optional

if sys.version_info < (3, 10):
    sys.exit("Requires Python >= 3.10.")

try:
    from google import genai
    from google.genai import errors, types
    from pydantic import BaseModel, Field
except ImportError as exc:
    sys.exit(f"Missing dependency ({exc}). Run with a venv containing `google-genai` and `pydantic`.")

ROOT_DIR = Path(__file__).resolve().parent.parent
NARRATIONS_OUT_DIR = ROOT_DIR / "public" / "narrations"
AUDIO_OUT_DIR = ROOT_DIR / "public" / "audio"
TTS_CACHE_DIR = ROOT_DIR / "scripts" / "narrations" / ".cache"
DUMP_SCRIPT = ROOT_DIR / "scripts" / "narrations" / "dump_weapon_spec.mjs"

ALL_WEAPON_IDS = [
    "ak15",
    "m4a1",
    "mp5",
    "g17",
    "m82a1",
    "awm",
    "scar",
    "deagle",
    "aug",
    "p320",
]

TEXT_MODEL = "gemini-3.8-flash"
STORY_TTS_MODEL = "gemini-3.8-flash-tts"
PART_TTS_MODEL = "gemini-3.8-flash-lite-tts"
DEFAULT_VOICE = "Charon"

STYLE_STORY_ZH = (
    "沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，"
    "语速适中自然，重点转折处略作停顿，吐字清晰饱满"
)
STYLE_STORY_EN = (
    "Authoritative, warm, articulate museum firearm historian and mechanical "
    "engineering documentary narrator, measured pace with natural cadence"
)
STYLE_PART_ZH = (
    "专业冷静、条理清晰的军械总工程师现场拆解导览，语速平稳自然，术语准确清晰"
)
STYLE_PART_EN = (
    "Clear, engaging master armorer and mechanical engineer explaining a precision "
    "3D firearm component in an interactive museum exhibit, steady natural pace"
)


class StopSpending(RuntimeError):
    """Immediate circuit breaker on quota, rate-limit, or billing errors."""


# ==================== Pydantic Schemas for Gemini Structured Output ====================


class PresetTranslationItem(BaseModel):
    id: str = Field(description="Exact timeline preset id from input.")
    label: str = Field(description="Concise English button label (2-3 words, e.g. 'Field Strip').")
    subLabel: str = Field(description="Percentage sub-label, e.g. '30%'.")
    desc: str = Field(description="Clear English mechanical description of this disassembly stage.")


class FiringPhaseTranslationItem(BaseModel):
    id: str = Field(description="Exact firing phase id from input.")
    shortLabel: str = Field(description="Compact 2-3 word English pill label (<= 18 chars).")
    title: str = Field(description="Full English phase heading, e.g. 'Phase 1 · Trigger Pull & Hammer Release'.")
    description: str = Field(description="Detailed 2-sentence English explanation of the mechanical kinematics.")


class WeaponUiMetaEnSchema(BaseModel):
    name: str = Field(description="Full official English firearm title.")
    subtitle: str = Field(description="Concise technical English subtitle.")
    originCountry: str = Field(description="Country of origin in English, e.g. 'Russia'.")
    weaponType: str = Field(description="Weapon type in English, e.g. 'Assault Rifle'.")
    categoryLabel: str = Field(description="Category badge in English.")
    actionMechanism: str = Field(description="Operating & locking mechanism in concise technical English.")
    statusLabel: str = Field(description="Vault status pill in English, e.g. 'In Vault · Ready'.")
    description: str = Field(description="Rich 2-3 sentence museum plaque overview in English.")
    highlights: List[str] = Field(description="4 concise English feature chips matching the 4 Chinese highlights.")
    workbenchTitle: str = Field(description="English Workbench top bar title.")
    workbenchSubtitle: str = Field(description="English Workbench top bar subtitle.")
    cutawayLabel: str = Field(description="Compact English floating cutaway button label.")
    cutawayTitle: str = Field(description="English tooltip for cutaway focus button.")
    searchPlaceholder: str = Field(description="English BOM search input placeholder.")
    firingMilestoneLabel: str = Field(description="Short English label for the 34% firing timeline tick.")
    rateOfFire: str = Field(description="Rate of fire in English, e.g. '700 rpm' or 'Semi-Auto'.")
    timelinePresets: List[PresetTranslationItem]
    firingPhases: List[FiringPhaseTranslationItem]


class GeneratedStoryAct(BaseModel):
    id: str = Field(description="Act identifier: 'act1', 'act2', 'act3', or 'act4'.")
    actNumber: str = Field(description="Display badge, e.g. '第一幕' in ZH or 'ACT I' in EN.")
    eraTag: str = Field(description="Year range or historical era tag, e.g. '1947–1974' or '2020–2023'.")
    title: str = Field(description="Compelling chapter title.")
    paragraphs: List[str] = Field(
        description="2 to 3 rich, historically accurate narrative paragraphs telling the R&D story."
    )
    audioScript: str = Field(
        description=(
            "Natural spoken documentary narration script for this act (approx 160-230 Chinese characters "
            "for ZH, or 110-160 English words for EN). Smooth spoken prose without bullet points or raw symbols."
        )
    )
    focusPartId: Optional[str] = Field(
        default=None,
        description="Exact `part.id` from the provided BOM list most relevant to this act.",
    )
    focusPartLabel: Optional[str] = Field(
        default=None,
        description="Human-readable name of that focused 3D component in the target language.",
    )


class GeneratedBreakthrough(BaseModel):
    id: str = Field(description="Identifier: 'bt1', 'bt2', 'bt3'.")
    title: str = Field(description="Engineering breakthrough title.")
    tag: str = Field(description="Short technical tag, e.g. '归零保持机构' / 'Zero-Retention Lock'.")
    summary: str = Field(description="2-3 sentence explanation of why this design solved a real combat/mechanical problem.")
    focusPartId: str = Field(description="Exact `part.id` from the provided BOM list to focus in the 3D viewport.")
    focusPartLabel: str = Field(description="Button label for the 3D component in target language.")


class GeneratedMilestone(BaseModel):
    year: str = Field(description="Year or year span, e.g. '1947', '2012', '2018', '2023'.")
    title: str = Field(description="Milestone headline.")
    detail: str = Field(description="1-2 sentence historical engineering milestone description.")


class GeneratedLocalizedStory(BaseModel):
    headline: str = Field(description="Museum documentary main headline.")
    deck: str = Field(description="2-sentence executive summary of the firearm's R&D journey.")
    acts: List[GeneratedStoryAct] = Field(description="Exactly 4 chronological R&D story acts.")
    breakthroughs: List[GeneratedBreakthrough] = Field(description="Exactly 3 signature mechanical breakthroughs.")
    milestones: List[GeneratedMilestone] = Field(description="6 key chronological R&D milestones.")


class StoryAndMetaResponseSchema(BaseModel):
    uiMetaEn: WeaponUiMetaEnSchema
    storyZh: GeneratedLocalizedStory
    storyEn: GeneratedLocalizedStory


class GeneratedLocalizedPartText(BaseModel):
    roleTag: str = Field(description="Concise 1-line functional role tag.")
    overview: str = Field(description="2-sentence clear functional overview & mounting location on the weapon.")
    craftAndMaterial: str = Field(
        description="Metallurgy/polymer choice, surface finish, and the engineering purpose of visible 3D features."
    )
    kinematicRole: str = Field(
        description="How this part moves/mates during the 7-phase firing cycle AND when it separates during disassembly."
    )
    designHighlight: str = Field(
        description="Specific R&D design insight, combat lesson, or clever mechanical trade-off behind this part."
    )
    audioScript: str = Field(
        description=(
            "Natural spoken audio-guide narration when the user clicks this component "
            "(approx 95-135 Chinese chars for ZH, or 60-85 English words for EN; ~18-25s spoken, no markdown symbols)."
        )
    )


class GeneratedPartNarrationItem(BaseModel):
    partId: str = Field(description="Exact `part.id` from input.")
    calloutLabelEn: str = Field(
        description="Crisp editorial English 3D leader label (2-4 words, max 24 chars, e.g. '2-Lug Rotating Bolt')."
    )
    zh: GeneratedLocalizedPartText
    en: GeneratedLocalizedPartText


class PartsBatchResponseSchema(BaseModel):
    parts: List[GeneratedPartNarrationItem]


# ==================== Environment, Sanitization & Error Guardrails ====================


def load_api_key() -> None:
    if os.environ.get("GEMINI_API_KEY"):
        return

    candidates: list[Path] = []
    custom_env = os.environ.get("GEMINI_ENV_FILE")
    if custom_env:
        candidates.append(Path(custom_env))
    candidates.extend([ROOT_DIR / ".env.local", ROOT_DIR / ".env"])

    for env_path in candidates:
        if env_path.is_file():
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'").strip('"')
                if k and v and not os.environ.get(k):
                    os.environ[k] = v
            if os.environ.get("GEMINI_API_KEY"):
                return

    sys.exit("Missing GEMINI_API_KEY (set env var, .env, or GEMINI_ENV_FILE).")


def sanitize_error(err: BaseException) -> str:
    msg = str(err)
    key = os.environ.get("GEMINI_API_KEY", "")
    if key and len(key) >= 8:
        msg = msg.replace(key, "[REDACTED]")
    msg = re.sub(r"AIza[0-9A-Za-z_\-]{25,}", "[REDACTED]", msg)
    msg = re.sub(r"\s+", " ", msg).strip()
    return msg[:420]


def is_stop_spending_error(err: BaseException) -> bool:
    if isinstance(err, errors.APIError):
        code = getattr(err, "code", None)
        status = str(getattr(err, "status", "") or "").upper()
        if code in (402, 429) or status in ("RESOURCE_EXHAUSTED",):
            return True
    lower = str(err).lower()
    return any(
        token in lower
        for token in ("402", "429", "resource_exhausted", "quota", "billing", "insufficient", "payment")
    )


def make_client(timeout_sec: int = 300) -> genai.Client:
    load_api_key()
    return genai.Client(
        http_options=types.HttpOptions(timeout=timeout_sec * 1000, api_version="v1beta")
    )


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def dump_weapon_spec(weapon_id: str) -> dict[str, Any]:
    proc = subprocess.run(
        ["node", str(DUMP_SCRIPT), weapon_id],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"Failed to dump weapon spec for {weapon_id}: {proc.stderr.strip()}"
        )
    return json.loads(proc.stdout)


# ==================== Structured Text Generation (`gemini-3.8-flash`) ====================


def generate_story_and_meta(
    client: genai.Client, spec: dict[str, Any]
) -> StoryAndMetaResponseSchema:
    parts_summary = [
        {
            "id": p["id"],
            "bomCode": p["bomCode"],
            "nameZh": p["nameZh"],
            "nameEn": p["nameEn"],
            "roleTag": p["roleTag"],
        }
        for p in spec["parts"]
    ]

    prompt = f"""You are a world-class firearms historian, museum curator, and mechanical ordnance engineer.
Generate the complete bilingual (Chinese `storyZh` + English `storyEn`) R&D history story and full English UI metadata (`uiMetaEn`) for this 1:1 3D firearm exhibit in Digital Armory 3D.

### Ground-Truth Firearm Specification (100% authoritative — do NOT invent nonexistent parts):
{json.dumps({
    "id": spec["id"],
    "catalog": spec["catalog"],
    "workbenchMeta": spec["workbenchMeta"],
    "timelinePresets": spec["timelinePresets"],
    "firingPhases": spec["firingPhases"],
    "parts": parts_summary,
}, ensure_ascii=False, indent=2)}

### Strict Quality & Grounding Requirements:
1. **Four-Act R&D Story (`storyZh` & `storyEn`)**:
   - Must contain **exactly 4 chronological acts** (`act1`..`act4`):
     - Act 1: Historical roots, tactical doctrine shift, and operational pain points that demanded this weapon/variant.
     - Act 2: Chief designers, factory/bureau engineering trials, prototype setbacks, and field-feedback redesigns.
     - Act 3: Mechanical soul — locking geometry, gas/recoil kinematics, metallurgy, and optics/ergonomic integration.
     - Act 4: Service adoption, combat evolution, global influence, and historical standing.
   - Each act must have 2–3 vivid, historically accurate paragraphs (`paragraphs`) AND a smooth spoken documentary narration script (`audioScript`: ~170–230 Chinese chars for ZH; ~115–160 English words for EN; write natural spoken numbers/units like "七点六二乘三十九毫米" or "seven-point-six-two millimeter" so TTS pronounces them smoothly without awkward symbols like `×` or `6П71М` raw Cyrillic—transliterate or explain gracefully in spoken text!).
   - Every `focusPartId` MUST be an exact `id` from `parts` above.
   - Include **exactly 3 `breakthroughs`** (each bound to a distinct, iconic `focusPartId` from `parts`) and **6 chronological `milestones`**.
2. **English UI Metadata (`uiMetaEn`)**:
   - Translate every `timelinePresets` item (preserving exact `id`) and every `firingPhases` item (preserving exact `id`) into crisp, authentic military/ordnance English.
"""

    last_err: Optional[Exception] = None
    for attempt in range(1, 3):
        try:
            interaction = client.interactions.create(
                model=TEXT_MODEL,
                input=prompt,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": StoryAndMetaResponseSchema.model_json_schema(),
                },
            )
            if not interaction.output_text:
                raise RuntimeError("Empty output_text from story_and_meta interaction.")
            parsed = StoryAndMetaResponseSchema.model_validate_json(interaction.output_text)
            if len(parsed.storyZh.acts) < 4 or len(parsed.storyEn.acts) < 4:
                raise RuntimeError(
                    f"Expected 4 acts in ZH/EN, got {len(parsed.storyZh.acts)}/{len(parsed.storyEn.acts)}"
                )
            if len(parsed.storyZh.breakthroughs) < 3 or len(parsed.storyEn.breakthroughs) < 3:
                raise RuntimeError("Expected >= 3 breakthroughs in ZH/EN")
            if len(parsed.storyZh.milestones) < 5 or len(parsed.storyEn.milestones) < 5:
                raise RuntimeError("Expected >= 5 milestones in ZH/EN")
            parsed.storyZh.acts = parsed.storyZh.acts[:4]
            parsed.storyEn.acts = parsed.storyEn.acts[:4]
            parsed.storyZh.breakthroughs = parsed.storyZh.breakthroughs[:3]
            parsed.storyEn.breakthroughs = parsed.storyEn.breakthroughs[:3]
            return parsed
        except Exception as exc:
            if is_stop_spending_error(exc):
                raise StopSpending(sanitize_error(exc)) from exc
            last_err = exc
            if attempt == 1:
                print(
                    f"    [WARN] Transient error in story_and_meta ({sanitize_error(exc)}), retrying once in 3s...",
                    file=sys.stderr,
                )
                time.sleep(3.0)
                client = make_client(timeout_sec=360)
    assert last_err is not None
    raise last_err


def trim_callout_label_en(label: str, max_len: int = 30) -> str:
    cleaned = re.sub(r"\s+", " ", label.strip())
    if len(cleaned) <= max_len:
        return cleaned
    cut = cleaned[:max_len].rsplit(" ", 1)[0].strip(" -·,/")
    return cut if len(cut) >= 6 else cleaned[:max_len].strip()


def generate_parts_batch(
    client: genai.Client,
    spec: dict[str, Any],
    batch_parts: list[dict[str, Any]],
    batch_idx: int,
    total_batches: int,
) -> list[GeneratedPartNarrationItem]:
    prompt = f"""You are a master armorer and mechanical CAD engineer narrating an interactive 1:1 3D firearm disassembly & firing simulation for **{spec["catalog"]["nameCn"]} ({spec["catalog"]["modelCode"]})**.

Generate deep, museum-grade Chinese (`zh`) and English (`en`) component descriptions and spoken audio-guide scripts for Batch {batch_idx}/{total_batches} ({len(batch_parts)} components).

### Weapon Context:
- Caliber: {spec["catalog"]["caliber"]}
- Mechanism: {spec["catalog"]["actionMechanism"]}
- 7 Firing Phases: {json.dumps([{"step": ph["stepNum"], "title": ph["title"]} for ph in spec["firingPhases"]], ensure_ascii=False)}
- Disassembly Stages: 0% Assembled, 30% Field Strip, 65% Sub-assembly Strip, 100% Full Armorer Explode.

### Target Components in This Batch (preserve exact `partId` = `id` for all {len(batch_parts)} items):
{json.dumps(batch_parts, ensure_ascii=False, indent=2)}

### Requirements for EVERY component:
1. Return **all {len(batch_parts)} items** with exact `partId`.
2. `calloutLabelEn`: Ultra-concise 2–4 word English 3D viewport callout label (<= 24 characters, e.g. "Railed Top Cover", "2-Lug Rotating Bolt", "30-Rd Windowed Mag").
3. Both `zh` and `en` must be rich, mechanically precise, and grounded strictly in this weapon's real engineering & the provided `explodeSteps` / `material` / `description`:
   - `roleTag`: Concise functional positioning phrase.
   - `overview`: 2 clear sentences on what this component is and where it mounts.
   - `craftAndMaterial`: Metallurgy / polymer / coating process + why its 3D geometry is shaped that way.
   - `kinematicRole`: Exact behavior during the 7-stage firing cycle (stationary structural datum vs recoiling/rotating/compressing) AND at what disassembly stage (`explodeSteps` range) it comes off.
   - `designHighlight`: R&D story detail, combat reliability lesson, or clever mechanical trade-off behind this specific part.
   - `audioScript`: Engaging, natural spoken narration for TTS when the user clicks this part in 3D (~95–130 Chinese chars for `zh`; ~60–85 English words for `en`). Write dimensions/calibers in natural spoken form (avoid raw `×`, `/`, `rad`, or unpronounceable symbols) so TTS reads effortlessly like a Discovery Channel armorer!
"""

    last_err: Optional[Exception] = None
    for attempt in range(1, 3):
        try:
            interaction = client.interactions.create(
                model=TEXT_MODEL,
                input=prompt,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": PartsBatchResponseSchema.model_json_schema(),
                },
            )
            if not interaction.output_text:
                raise RuntimeError(f"Empty output_text for parts batch {batch_idx}.")
            parsed = PartsBatchResponseSchema.model_validate_json(interaction.output_text)
            return parsed.parts
        except Exception as exc:
            if is_stop_spending_error(exc):
                raise StopSpending(sanitize_error(exc)) from exc
            last_err = exc
            if attempt == 1:
                print(
                    f"    [WARN] Transient error in parts batch {batch_idx} ({sanitize_error(exc)}), retrying once in 3s...",
                    file=sys.stderr,
                )
                time.sleep(3.0)
                client = make_client(timeout_sec=360)
    assert last_err is not None
    raise last_err


# ==================== TTS Synthesis + FFmpeg MP3 Compression ====================


def wav_bytes_to_mp3(wav_bytes: bytes, out_mp3: Path, bitrate: str) -> None:
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    tmp_mp3 = out_mp3.with_suffix(".tmp.mp3")
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-vn",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            str(tmp_mp3),
        ],
        input=wav_bytes,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not tmp_mp3.exists() or tmp_mp3.stat().st_size < 512:
        err_txt = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg failed for {out_mp3.name}: {err_txt}")
    os.replace(tmp_mp3, out_mp3)


def synthesize_tts_mp3(
    client: genai.Client,
    *,
    model: str,
    voice: str,
    style: str,
    text: str,
    out_mp3: Path,
    bitrate: str,
) -> int:
    try:
        interaction = client.interactions.create(
            model=model,
            input=[
                {
                    "type": "user_input",
                    "content": [
                        {
                            "type": "text",
                            "text": text.strip(),
                            "annotations": [
                                {
                                    "type": "speech_metadata",
                                    "style": style,
                                }
                            ],
                        }
                    ],
                }
            ],
            response_format={"type": "audio"},
            generation_config={"speech_config": [{"voice": voice}]},
        )
    except Exception as exc:
        if is_stop_spending_error(exc):
            raise StopSpending(sanitize_error(exc)) from exc
        raise

    if not interaction.output_audio or not interaction.output_audio.data:
        raise RuntimeError(f"No output_audio returned for {out_mp3.name}")

    wav_bytes = base64.b64decode(interaction.output_audio.data)
    wav_bytes_to_mp3(wav_bytes, out_mp3, bitrate=bitrate)
    return out_mp3.stat().st_size


# ==================== End-to-End Weapon Build Pipeline ====================


def build_weapon(
    weapon_id: str,
    *,
    dry_run: bool = False,
    force_text: bool = False,
    force_audio: bool = False,
    skip_audio: bool = False,
    workers: int = 3,
) -> None:
    print(f"\n==================== [{weapon_id.upper()}] Extracting 1:1 weapon spec ====================")
    spec = dump_weapon_spec(weapon_id)
    parts_list: list[dict[str, Any]] = spec["parts"]
    part_ids_set = {p["id"] for p in parts_list}
    print(
        f"  Loaded {spec['catalog']['nameCn']} · {len(parts_list)} parts · "
        f"{len(spec['firingPhases'])} firing phases"
    )

    json_path = NARRATIONS_OUT_DIR / f"{weapon_id}.json"
    hashes_path = TTS_CACHE_DIR / f"{weapon_id}_tts_hashes.json"

    if dry_run:
        batch_count = (len(parts_list) + 12) // 13
        story_clips = 8
        part_clips = len(parts_list) * 2
        print(
            f"  [DRY-RUN] Would run {1 + batch_count} `{TEXT_MODEL}` structured JSON calls, "
            f"{story_clips} `{STORY_TTS_MODEL}` story clips, and "
            f"{part_clips} `{PART_TTS_MODEL}` part clips -> {json_path.relative_to(ROOT_DIR)}"
        )
        return

    client = make_client(timeout_sec=360)

    bundle: Optional[dict[str, Any]] = None
    if json_path.is_file() and not force_text:
        try:
            existing = json.loads(json_path.read_text(encoding="utf-8"))
            if (
                existing.get("weaponId") == weapon_id
                and set(existing.get("parts", {}).keys()) == part_ids_set
                and len(existing.get("story", {}).get("zh", {}).get("acts", [])) == 4
                and len(existing.get("story", {}).get("en", {}).get("acts", [])) == 4
            ):
                bundle = existing
                print(f"  [CACHE HIT] Reusing existing text bundle: {json_path.relative_to(ROOT_DIR)}")
        except Exception:
            bundle = None

    if bundle is None:
        t0 = time.time()
        batch_size = 13
        batches = [
            parts_list[i : i + batch_size]
            for i in range(0, len(parts_list), batch_size)
        ]
        print(
            f"  [1-2/3] Calling `{TEXT_MODEL}` concurrently: 1 Story/UI call + "
            f"{len(batches)} Parts Batches ({len(parts_list)} parts)..."
        )

        def _run_story() -> StoryAndMetaResponseSchema:
            return generate_story_and_meta(make_client(timeout_sec=360), spec)

        def _run_batch(b_idx: int, batch_items: list[dict[str, Any]]) -> list[GeneratedPartNarrationItem]:
            time.sleep(0.3 * b_idx)
            return generate_parts_batch(
                make_client(timeout_sec=360),
                spec,
                batch_items,
                b_idx,
                len(batches),
            )

        generated_parts_map: dict[str, GeneratedPartNarrationItem] = {}
        with ThreadPoolExecutor(max_workers=1 + len(batches)) as text_pool:
            story_fut = text_pool.submit(_run_story)
            batch_futs = [
                text_pool.submit(_run_batch, b_idx, batch)
                for b_idx, batch in enumerate(batches, start=1)
            ]
            story_meta = story_fut.result()
            for b_fut in batch_futs:
                for item in b_fut.result():
                    generated_parts_map[item.partId] = item

        # Sanitize focusPartId references against actual part IDs
        fallback_part_id = spec["workbenchMeta"]["cutawayFocusPartId"]
        for loc_story in (story_meta.storyZh, story_meta.storyEn):
            for act in loc_story.acts:
                if act.focusPartId and act.focusPartId not in part_ids_set:
                    act.focusPartId = fallback_part_id
            for bt in loc_story.breakthroughs:
                if bt.focusPartId not in part_ids_set:
                    bt.focusPartId = fallback_part_id

        missing_ids = [p["id"] for p in parts_list if p["id"] not in generated_parts_map]
        if missing_ids:
            print(f"  [RETRY] Fetching {len(missing_ids)} missing parts: {missing_ids}")
            retry_specs = [p for p in parts_list if p["id"] in set(missing_ids)]
            retry_items = generate_parts_batch(client, spec, retry_specs, 1, 1)
            for item in retry_items:
                generated_parts_map[item.partId] = item

        still_missing = [p["id"] for p in parts_list if p["id"] not in generated_parts_map]
        if still_missing:
            raise RuntimeError(f"Missing generated part narrations for: {still_missing}")

        def serialize_story(loc: GeneratedLocalizedStory, lang: str) -> dict[str, Any]:
            acts_out = []
            for idx, act in enumerate(loc.acts, start=1):
                act_id = f"act{idx}"
                acts_out.append(
                    {
                        "id": act_id,
                        "actNumber": act.actNumber,
                        "eraTag": act.eraTag,
                        "title": act.title,
                        "paragraphs": act.paragraphs,
                        "audioScript": act.audioScript,
                        "audioUrl": f"audio/{weapon_id}/story_{act_id}_{lang}.mp3",
                        "focusPartId": act.focusPartId,
                        "focusPartLabel": act.focusPartLabel,
                    }
                )
            return {
                "headline": loc.headline,
                "deck": loc.deck,
                "acts": acts_out,
                "breakthroughs": [bt.model_dump() for bt in loc.breakthroughs],
                "milestones": [ms.model_dump() for ms in loc.milestones],
            }

        ui_en_raw = story_meta.uiMetaEn
        ui_meta_en = {
            "name": ui_en_raw.name,
            "subtitle": ui_en_raw.subtitle,
            "originCountry": ui_en_raw.originCountry,
            "weaponType": ui_en_raw.weaponType,
            "categoryLabel": ui_en_raw.categoryLabel,
            "actionMechanism": ui_en_raw.actionMechanism,
            "statusLabel": ui_en_raw.statusLabel,
            "description": ui_en_raw.description,
            "highlights": ui_en_raw.highlights,
            "workbenchTitle": ui_en_raw.workbenchTitle,
            "workbenchSubtitle": ui_en_raw.workbenchSubtitle,
            "cutawayLabel": ui_en_raw.cutawayLabel,
            "cutawayTitle": ui_en_raw.cutawayTitle,
            "searchPlaceholder": ui_en_raw.searchPlaceholder,
            "firingMilestoneLabel": ui_en_raw.firingMilestoneLabel,
            "rateOfFire": ui_en_raw.rateOfFire,
            "timelinePresets": {
                item.id: {
                    "label": item.label,
                    "subLabel": item.subLabel,
                    "desc": item.desc,
                }
                for item in ui_en_raw.timelinePresets
            },
            "firingPhases": {
                item.id: {
                    "shortLabel": item.shortLabel,
                    "title": item.title,
                    "description": item.description,
                }
                for item in ui_en_raw.firingPhases
            },
        }

        parts_out: dict[str, Any] = {}
        for p in parts_list:
            pid = p["id"]
            gen_p = generated_parts_map[pid]
            zh_dump = gen_p.zh.model_dump()
            zh_dump["audioUrl"] = f"audio/{weapon_id}/parts/{pid}_zh.mp3"
            en_dump = gen_p.en.model_dump()
            en_dump["audioUrl"] = f"audio/{weapon_id}/parts/{pid}_en.mp3"
            parts_out[pid] = {
                "partId": pid,
                "bomCode": p["bomCode"],
                "calloutLabelEn": trim_callout_label_en(gen_p.calloutLabelEn),
                "zh": zh_dump,
                "en": en_dump,
            }

        bundle = {
            "schemaVersion": 1,
            "weaponId": weapon_id,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "generatorModels": {
                "text": TEXT_MODEL,
                "storyTts": STORY_TTS_MODEL,
                "partTts": PART_TTS_MODEL,
            },
            "uiMetaEn": ui_meta_en,
            "story": {
                "zh": serialize_story(story_meta.storyZh, "zh"),
                "en": serialize_story(story_meta.storyEn, "en"),
            },
            "parts": parts_out,
        }

        NARRATIONS_OUT_DIR.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(bundle, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"  [SAVED] {json_path.relative_to(ROOT_DIR)} in {time.time() - t0:.1f}s "
            f"({len(parts_out)} parts + 4-act CN/EN story)"
        )

    if skip_audio:
        print("  [SKIP AUDIO] `--skip-audio` enabled; audio synthesis skipped.")
        return

    # ==================== Build TTS Audio Queue ====================
    tts_hashes: dict[str, str] = {}
    if hashes_path.is_file():
        try:
            tts_hashes = json.loads(hashes_path.read_text(encoding="utf-8"))
        except Exception:
            tts_hashes = {}

    jobs: list[dict[str, Any]] = []

    for lang, style in (("zh", STYLE_STORY_ZH), ("en", STYLE_STORY_EN)):
        for act in bundle["story"][lang]["acts"]:
            rel_url = act["audioUrl"]
            out_file = ROOT_DIR / "public" / rel_url
            script_text = act["audioScript"]
            sig = sha256_hex(f"{STORY_TTS_MODEL}|{DEFAULT_VOICE}|{style}|{script_text}")
            if (
                not force_audio
                and out_file.is_file()
                and out_file.stat().st_size > 1024
                and tts_hashes.get(rel_url) == sig
            ):
                continue
            jobs.append(
                {
                    "rel_url": rel_url,
                    "out_file": out_file,
                    "model": STORY_TTS_MODEL,
                    "voice": DEFAULT_VOICE,
                    "style": style,
                    "text": script_text,
                    "bitrate": "64k",
                    "sig": sig,
                }
            )

    for pid, p_entry in bundle["parts"].items():
        for lang, style in (("zh", STYLE_PART_ZH), ("en", STYLE_PART_EN)):
            loc_p = p_entry[lang]
            rel_url = loc_p["audioUrl"]
            out_file = ROOT_DIR / "public" / rel_url
            script_text = loc_p["audioScript"]
            sig = sha256_hex(f"{PART_TTS_MODEL}|{DEFAULT_VOICE}|{style}|{script_text}")
            if (
                not force_audio
                and out_file.is_file()
                and out_file.stat().st_size > 1024
                and tts_hashes.get(rel_url) == sig
            ):
                continue
            jobs.append(
                {
                    "rel_url": rel_url,
                    "out_file": out_file,
                    "model": PART_TTS_MODEL,
                    "voice": DEFAULT_VOICE,
                    "style": style,
                    "text": script_text,
                    "bitrate": "48k",
                    "sig": sig,
                }
            )

    if not jobs:
        print(f"  [3/3] All TTS audio files for `{weapon_id}` are already up-to-date!")
        return

    print(
        f"  [3/3] Synthesizing {len(jobs)} TTS audio clips "
        f"(workers={workers}, story=`{STORY_TTS_MODEL}`, parts=`{PART_TTS_MODEL}`)..."
    )

    stop_event = threading.Event()
    lock = threading.Lock()
    completed_count = 0
    total_bytes = 0
    fatal_error: list[BaseException] = []

    def worker_fn(idx_job: tuple[int, dict[str, Any]]) -> None:
        nonlocal completed_count, total_bytes
        idx, job = idx_job
        if stop_event.is_set():
            return
        # Gentle stagger to stay well clear of burst RPM limits
        time.sleep(0.25 * (idx % max(1, workers)))
        if stop_event.is_set():
            return

        thread_client = make_client(timeout_sec=240)
        try:
            nbytes = synthesize_tts_mp3(
                thread_client,
                model=job["model"],
                voice=job["voice"],
                style=job["style"],
                text=job["text"],
                out_mp3=job["out_file"],
                bitrate=job["bitrate"],
            )
            with lock:
                completed_count += 1
                total_bytes += nbytes
                tts_hashes[job["rel_url"]] = job["sig"]
                hashes_path.parent.mkdir(parents=True, exist_ok=True)
                hashes_path.write_text(
                    json.dumps(tts_hashes, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                print(
                    f"    [{completed_count}/{len(jobs)}] OK {job['rel_url']} "
                    f"({nbytes / 1024:.1f} KB)"
                )
        except StopSpending as stop_exc:
            stop_event.set()
            with lock:
                fatal_error.append(stop_exc)
                print(f"    [STOP SPENDING] {stop_exc}", file=sys.stderr)
        except Exception as exc:
            # One polite retry for transient network/5xx errors (never for 402/429)
            if stop_event.is_set():
                return
            time.sleep(2.5)
            try:
                nbytes = synthesize_tts_mp3(
                    thread_client,
                    model=job["model"],
                    voice=job["voice"],
                    style=job["style"],
                    text=job["text"],
                    out_mp3=job["out_file"],
                    bitrate=job["bitrate"],
                )
                with lock:
                    completed_count += 1
                    total_bytes += nbytes
                    tts_hashes[job["rel_url"]] = job["sig"]
                    hashes_path.parent.mkdir(parents=True, exist_ok=True)
                    hashes_path.write_text(
                        json.dumps(tts_hashes, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    print(
                        f"    [{completed_count}/{len(jobs)}] OK (retry) {job['rel_url']} "
                        f"({nbytes / 1024:.1f} KB)"
                    )
            except StopSpending as stop_exc2:
                stop_event.set()
                with lock:
                    fatal_error.append(stop_exc2)
                    print(f"    [STOP SPENDING] {stop_exc2}", file=sys.stderr)
            except Exception as exc2:
                stop_event.set()
                with lock:
                    fatal_error.append(exc2)
                    print(
                        f"    [ERROR] Failed {job['rel_url']}: {sanitize_error(exc2)}",
                        file=sys.stderr,
                    )

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(worker_fn, (i, j)) for i, j in enumerate(jobs)]
        for fut in as_completed(futures):
            fut.result()

    if fatal_error:
        sys.exit(f"Aborted due to error: {sanitize_error(fatal_error[0])}")

    print(
        f"  [DONE] `{weapon_id}` complete! Generated {completed_count} MP3 clips "
        f"({total_bytes / (1024 * 1024):.2f} MB total)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate bilingual weapon R&D stories, part narrations & Gemini TTS audio."
    )
    parser.add_argument(
        "--weapon",
        choices=ALL_WEAPON_IDS,
        default="ak15",
        help="Single weapon ID to generate (default: ak15).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate across all 10 weapons sequentially.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect spec & print planned API call counts without spending quota.",
    )
    parser.add_argument(
        "--force-text",
        action="store_true",
        help="Regenerate structured JSON text even if public/narrations/<id>.json exists.",
    )
    parser.add_argument(
        "--force-audio",
        action="store_true",
        help="Regenerate all TTS MP3 files even if SHA-256 hashes match.",
    )
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        help="Generate structured JSON text only and skip TTS synthesis.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Concurrent TTS workers (default: 3).",
    )
    args = parser.parse_args()

    targets = ALL_WEAPON_IDS if args.all else [args.weapon]
    for wid in targets:
        try:
            build_weapon(
                wid,
                dry_run=args.dry_run,
                force_text=args.force_text,
                force_audio=args.force_audio,
                skip_audio=args.skip_audio,
                workers=args.workers,
            )
        except StopSpending as stop_err:
            sys.exit(f"Stopped immediately (quota/rate-limit guardrail): {stop_err}")


if __name__ == "__main__":
    main()
