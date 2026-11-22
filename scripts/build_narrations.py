#!/usr/bin/env python3
"""
Google Gemini Bilingual R&D Story, 327-Part Engineering Narration & TTS Audio Builder.

Models & Voice Constitution (AGENTS.md Red Line #6 — strictly immutable):
  - Text & Structured JSON: `gemini-3.8-flash`
  - Unified Weapon 4-Act R&D Story & All-Part Voiceover (CN + EN):
    `gemini-3.8-flash-tts` with Voice `Charon` (24 kHz mono 64 kbps MP3)
  - Third-party TTS engines (`edge-tts`, `say`, etc.) are STRICTLY FORBIDDEN.

Safety & Cost Guardrails:
  - Reads GEMINI_API_KEY from environment, `.env`, `.env.local`, or `GEMINI_ENV_FILE` (never logged).
  - Halts immediately (`StopSpending`) on 402 / 429 / RESOURCE_EXHAUSTED / billing / quota errors.
  - SHA-256 content-addressed caching (`scripts/narrations/.cache/<id>_tts_hashes.json`):
    existing MP3 files matching `sha256("gemini-3.8-flash-tts|Charon|<style>|<audioScript>")` are skipped.

Usage:
  uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --weapon p90 --dry-run
  uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --weapon p90 --batch-tts --force-audio
  uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --all --batch-tts
"""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]
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
    "p90",
    "lift33",
    "r500",
    "python",
    "benellim4",
    "garand",
    "m249",
    "p08",
    "vector",
    "g11",
    "vss",
    "m134",
    "an94",
    "ztz99a",
    "m1a2",
    "leopard2a7",
    "tiger1",
    "winchester1894",
    "rem870",
]

WEAPON_CONTEXT_HINTS: dict[str, dict[str, str]] = {
    "lift33": {
        "historicalContext": (
            "Mathews Archery Inc. (Sparta, Wisconsin, USA; founded by Matt McPherson in 1992 on the "
            "lineage of Hollis Wilbur Allen's 1966/1969 compound bow patent) pioneered SoloCam, "
            "Perimeter-Weighted cams, Centergy low-torque geometry, Crosscentric, and SwitchWeight modular "
            "draw systems. Released for the 2024 flagship lineup, the Mathews LIFT 33 pairs a 33-inch "
            "axle-to-axle (838 mm) CNC 7075-T6 bridged truss riser with a 6.5-inch (165.1 mm) brace height, "
            "29-inch draw length, and ultra-light 3.94 lb (1.79 kg) bare weight. It integrates Bridge-Lock "
            "in-riser dovetail channels for the 5-pin sight and 10-inch carbon stabilizer, an Integrate MX "
            "dovetail rest track, Engage low-torque grip, and LowPro inline 5-arrow quick-detach quiver."
        ),
        "mechanicalCore": (
            "SwitchWeight-X Synchronized Binary Cams riding on Ti-6Al-4V titanium axles and ABEC-7 bearings "
            "couple via split-yoke buss and control cables (routed laterally by the Bridge-Lock carbon cable "
            "guard and twin rollers). Drawing the Dyneema D-loop and BCY-X bowstring 27.5 cm rearward rotates "
            "both cams 95 degrees and flexes the beyond-parallel Split Quad Carbon-Glass Limbs clamped in CNC "
            "pivoting pockets. After peaking at 70 lb, cam geometry drops into an 85% let-off valley (10.5 lb "
            "holding weight) locked by a titanium Draw-Stop peg against the buss cable. Upon release, 145.6 J "
            "of stored elastic energy drives a 400-grain micro-diameter carbon arrow with a 3-blade mechanical "
            "broadhead to 348 FPS IBO (106 m/s) while the QAD Integrate MX drop-away V-launcher drops clear "
            "in ~4 ms and bridged elastomer limb dampeners plus the string-stop suppress post-shot vibration."
        ),
        "milestoneAnchors": (
            "1966-1969 (Hollis Allen compound bow patent) -> 1992 (Matt McPherson founds Mathews & SoloCam) "
            "-> 2017-2021 (Centergy grip, Crosscentric & SwitchWeight modular cam pods) "
            "-> 2022-2023 (Bridge-Lock internal dovetails & LowPro inline accessories) "
            "-> 2024 (Mathews LIFT 33 SwitchWeight-X debuts at 3.94 lb & 348 FPS)"
        ),
    },
    "r500": {
        "historicalContext": (
            "Engineered by Ravin Crossbows (Superior, Wisconsin, USA) on the foundation of its patented "
            "Helical Cam and Frictionless Flight technologies, the Ravin R500 debuted in 2021 to surpass the "
            "500 FPS hunting crossbow barrier inside a compact 28-inch (711 mm) CNC billet aluminum bullpup "
            "chassis weighing 8.40 lb (3.81 kg). Traditional wide-limb crossbows suffered from heavy front "
            "overhang, rail-induced arrow friction, nock wear, and uneven manual rope cocking. The R500 "
            "eliminates flight-rail friction and collapses axle-to-axle width from 7.6 inches (193 mm) "
            "uncocked down to 3.6 inches (91-92 mm) at full draw—narrower than a scoped hunting rifle."
        ),
        "mechanicalCore": (
            "Patented HexCoil 360-degree multi-tier helical cam stacks on Ti-6Al-4V axles and needle bearings "
            "rotate 310 to 360 degrees, coiling the high-tenacity bowstring and helical power/control cables "
            "around stacked spiral grooves while bending horizontal split quad carbon limbs inward across a "
            "300 lb, 15-inch (381 mm) power stroke. The enclosed VersaDrive 404 mm stainless Acme leadscrew "
            "and 12-tooth bronze dual-ratchet anti-reverse clutch inside the skeletonized buttstock translate "
            "the Trac-Trigger Floating Sear Carriage (TTFS) smoothly along a 360 mm internal track for silent "
            "cocking and safe pause-anywhere de-cocking. Dual spring-loaded self-centering catch jaws grip "
            "the string dead-center, while an automatic ambidextrous SAFE/FIRE selector and copper-bronze "
            "Anti-Dry-Fire (ADF) bolt sensor interlock block the 3.5 lb zero-creep match trigger until a "
            "20-inch 400-grain carbon bolt half-moon nock seats flush. Suspended between the carriage and front "
            "roller/retention arm under a rear-cantilevered 1-8x24 100-yard BDC optical bridge, the bolt "
            "launches frictionlessly at 500 FPS (152.4 m/s, 301 J)."
        ),
        "milestoneAnchors": (
            "2016-2017 (Ravin R9/R15 debuts Helical Cam & Frictionless Flight) -> "
            "2018-2019 (R20 & R26 ultra-compact bullpup & VersaDrive clutch refinements) -> "
            "2020 (HexCoil 360-degree cam & 3.6-inch cocked width validation) -> "
            "2021 (Ravin R500 shatters 500 FPS / 301 J benchmark) -> "
            "2022-2024 (100-yard precision crossbow optics & field adoption)"
        ),
    },
    "python": {
        "historicalContext": (
            "Conceived at Colt's Manufacturing Company (Hartford, Connecticut, USA) following Colt's 1953 "
            "Trooper .38/.357 service revolver and the surging popularity of Bill Jordan's 'combat magnum' "
            "doctrine and bullseye PPC target competition, the Colt Python debuted in 1955 under project lead "
            "Bill Henry, plant superintendent Herman 'Al' Alenhart, and Colt's master Custom Shop polishers "
            "and action tuners. Built upon the forged large .41-size Colt I-frame with zero budget compromises, "
            "every early Python was individually hand-fitted, hand-honed with Arkansas oilstones, buffed on "
            "graded felt wheels, and immersed in hot-salt baths to produce Colt's legendary mirror-deep "
            "'Royal Blue' finish, paired with hand-checkered American black walnut target grips bearing 24K "
            "gold-plated Rampant Colt medallions. Revered by firearms historians such as R.L. Wilson and Law "
            "Enforcement officers worldwide as 'the Rolls-Royce of revolvers,' the 6-inch Python became an "
            "enduring icon of American craftsmanship and later returned in modernized stainless form in 2020."
        ),
        "mechanicalCore": (
            "Hand-fitted DA/SA clockwork inside the forged Colt I-frame centers on a tapered folded V-leaf "
            "mainspring coupled to the wide target hammer via a pivoting stirrup link—eliminating coil-spring "
            "stacking for a butter-smooth double-action pull and crisp single-action break—while the lower "
            "mainspring limb powers the Colt Positive Safety Rebound Lever to cam the hammer rearward off the "
            "frame-mounted floating inertial firing pin whenever the trigger is released. Pulling the grooved "
            "target trigger first depresses the bottom pivoting cylinder stop bolt, then raises the Colt "
            "two-step vertical indexing hand (ratchet pawl) against the 6-point extractor star to rotate the "
            "fluted 6-chamber .357 S&W Magnum cylinder clockwise by 60 degrees. Before hammer fall, the stop "
            "bolt snaps into the 6 o'clock cylinder notch while the lower step of the hand stays wedged hard "
            "against the ratchet tooth, clamping the chamber dead-coaxial with the bore in Colt's famed "
            "'bank-vault full-cock lockup' (plus front underlug detent plunger and pull-back latch pin dual "
            "spindle lock). The 6-inch (152.4 mm) barrel integrates a 3-slot ventilated sight rib (pinned "
            "red-insert front ramp + Colt Accro micrometric rear sight), a full-length solid ejector-rod "
            "underlug shroud to damp .357 Magnum (241 MPa, 158 gr @ 435 m/s) muzzle flip, a recessed target "
            "crown, and tight slightly-tapered 6-groove 1:14-inch right-hand rifling."
        ),
        "milestoneAnchors": (
            "1935 (Smith & Wesson .357 Magnum cartridge debuts) -> "
            "1953 (Colt Trooper I-frame .357 service platform introduced) -> "
            "1955 (Bill Henry & Alenhart team unveil flagship Colt Python 6-inch Royal Blue in Hartford) -> "
            "1960s-1970s (Highway Patrol, PPC Bullseye dominance & 'Rolls-Royce of Revolvers' acclaim) -> "
            "1999-2005 (End of original hand-fitted Custom Shop I-frame production) -> "
            "2020 (Colt modernizes CAD/forged stainless Python lineage for a new century)"
        ),
    },
    "benellim4": {
        "historicalContext": (
            "Developed in 1998 by Benelli Armi S.P.A. (Urbino, Marche, Italy; Chief R&D engineers Nicola "
            "Bandini and Vignaroli team) in direct response to the U.S. Armed Forces TACOM-ARDEC Solicitation "
            "DAAE30-98-R-0401 for the Joint Service Combat Shotgun (JSCS), the Benelli M4 Super 90 broke "
            "decisively with Bruno Civolani's classic 1967 Benelli Inertia-Driven system. Because combat "
            "shotguns laden with tactical weaponlights, night-vision optics, sidesaddles, and heavy collapsible "
            "stocks increase receiver mass—which starves inertia-driven actions of recoil energy—Benelli "
            "invented its first gas-operated action specifically for military trials. Delivering prototypes to "
            "Aberdeen Proving Ground in August 1998, the XM1014 defeated rival entries across mud, sand, "
            "-40°C Arctic cold, salt fog, and 25,000-round endurance torture tests, earning formal adoption by "
            "the U.S. Marine Corps in 1999 as the M1014 Combat Shotgun and serving across Iraq, Afghanistan, "
            "British L128A1 forces, and global counter-terror units."
        ),
        "mechanicalCore": (
            "Patent-protected A.R.G.O. (Auto-Regulating Gas-Operated, U.S. Patent 5,827,992) architecture "
            "mounts twin symmetrical 17-4PH stainless-steel fluted short-stroke tappet pistons inside dual "
            "underbarrel cylinders immediately ahead of the 76 mm chamber on the 18.5-inch (470 mm) chrome-lined "
            "Crio smoothbore barrel. Tapping clean, high-temperature, high-pressure propellant gas right past "
            "the forcing cone prevents plastic wad fouling, while spring-loaded exhaust valves in the twin "
            "knurled front gas plugs automatically bleed excess pressure from 3-inch Magnum loads yet retain "
            "full impulse for 2.75-inch tactical 00 buckshot (79 MPa, 9 pellets @ 404 m/s). Both ARGO tappets "
            "throw rearward just 15 mm in balanced unison against twin shoulders on the heavy machined steel "
            "bolt carrier—eliminating off-axis carrier tilt. After a safety free-travel lead, the carrier's "
            "helical cam track rotates the hard-chrome 2-lug bolt head 38 degrees via the cylindrical cam pin "
            "to unlock, extracting and ejecting the spent crimson hull while a hinged rat-tail link compresses "
            "the 14-degree angled stock-tube recoil spring inside the 3-position notched M1014 skeletonized "
            "telestock. Simultaneously, the 7-round underbarrel tubular magazine spring and high-visibility "
            "fluted cup follower feed the next 12-gauge shell onto the pivoting stamped stainless forked shell "
            "carrier elevator, which swings upward 20 degrees to align the shell with the chamber for stripping "
            "and 2-lug relock (also supporting Benelli's famed 7+1+1 = 9-round 'Ghost Loading' via the cartridge "
            "drop lever)."
        ),
        "milestoneAnchors": (
            "1967 (Bruno Civolani inertia system founds Benelli Armi in Urbino) -> "
            "May 1998 (U.S. Joint Service Combat Shotgun XM1014 solicitation issued) -> "
            "Aug-Oct 1998 (ARGO patent US 5,827,992 granted & Aberdeen Proving Ground trials won) -> "
            "1999 (Adopted by USMC as M1014 Joint Service Combat Shotgun) -> "
            "2001-2011 (Combat proving in Afghanistan/Iraq & UK MoD L128A1 adoption) -> "
            "Present (Unrivaled NATO benchmark for semi-automatic combat shotguns)"
        ),
    },
    "garand": {
        "historicalContext": (
            "Designed over seventeen years (1919–1936) at the U.S. Springfield Armory in Massachusetts by "
            "French-Canadian-born ordnance genius John Cantius Garand, the U.S. Rifle, Caliber .30, M1 made "
            "the United States the only major nation in World War II to issue a semi-automatic battle rifle as "
            "its standard infantry arm. Garand progressed from 1919–1924 primer-actuated blowback prototypes "
            "(Model 1919 / T1) that failed when U.S. Ordnance switched to slower-burning progressive-powder M1 "
            "ammunition, to gas-trap competing rifles in the 1929 Aberdeen trials in .276 Pedersen (7 mm, "
            "10-round T3E2) against John Pedersen's toggle-delayed rifle. In January 1932, Chief of Staff "
            "General Douglas MacArthur vetoed .276 Pedersen on logistics grounds, mandating full-power .30-06 "
            "Springfield utilizing vast WWI stockpiles. Garand scaled up his T1E2 into the 8-round .30-06 M1, "
            "standardized on January 9, 1936, and personally engineered automated broaching and CNC-precursor "
            "production fixtures. After replacing the delicate early 'gas-trap' muzzle cap with the rugged "
            "splined 1940 stainless gas cylinder under barrel splines, Springfield Armory and Winchester built "
            "over 4.04 million M1s during WWII (5.48 million total with postwar HRA/IHC), prompting General "
            "George S. Patton Jr. in January 1945 to hail it as 'the greatest battle implement ever devised.'"
        ),
        "mechanicalCore": (
            "Firing .30-06 Springfield M2 Ball (150 gr gilding-metal spitzer @ 853 m/s, 345 MPa peak pressure) "
            "down a 24-inch (610 mm) 4-groove 1:10-inch barrel, gas vents through a bottom port near the muzzle "
            "into the splined 410 stainless-steel gas cylinder (locked by a figure-8 ring and cross-valve lock "
            "screw that automatically bleeds gas when an M7 grenade launcher is mounted). Gas drives the "
            "curved S-bend long-stroke operating rod rearward; its arched cam hump incorporates a crucial 4 mm "
            "straight free-travel dwell—allowing the bullet to exit the muzzle and chamber pressure to drop "
            "safely—before camming the right lug of the forged 2-lug breech bolt counterclockwise by 32 degrees "
            "for primary extraction and 108 mm synchronized recoil (while a receiver-bridge tang block and "
            "hammer safety notch positively prevent out-of-battery firing). Inside the hollow op-rod, a single "
            "dual-purpose long helical spring simultaneously absorbs recoil to drive counter-recoil forward AND "
            "presses rearward via a forked follower rod and pivoting follower arm to lift staggered cartridges "
            "upward inside the reversible 8-round stamped spring-steel en-bloc clip! When the 8th case ejects "
            "to 1–2 o'clock, the rising follower trips the operating-rod catch and left clip latch, allowing "
            "the V-shaped clip ejector wire to hurl the empty steel clip skyward with the unmistakable "
            "tuning-fork 'Garand Ping!' Insertion of a fresh 8-round clip trips the accelerator linkage "
            "(demanding brisk thumb withdrawal to avoid 'Garand Thumb'), complemented by a 10-second tool-less "
            "cam-locking trigger guard quick-detach milled trigger group, T105 1-MOA micrometric peep sight, "
            "and linseed-oiled American black walnut stock."
        ),
        "milestoneAnchors": (
            "1919-1924 (John C. Garand joins Springfield Armory & tests primer-actuated T1 prototypes) -> "
            "1928-1931 (Aberdeen .276 Pedersen T3E2 gas-trap trials defeat Pedersen toggle action) -> "
            "1932 (Gen. Douglas MacArthur mandates .30-06 Springfield; 8-round T1E2 redesigned) -> "
            "1936 (Standardized Jan 9, 1936 as U.S. Rifle, Caliber .30, M1) -> "
            "1939-1940 (Splined barrel & 1940 stainless gas-port cylinder replace early gas-trap) -> "
            "1941-1957 (5.48 million built across WWII & Korea; Patton's 'greatest battle implement' tribute)"
        ),
    },
    "m249": {
        "historicalContext": (
            "Designed in the late 1970s at Fabrique Nationale (FN Herstal, Belgium) by legendary small-arms "
            "engineer Ernest Vervier (co-architect of the FN MAG / M240), the FN Minimi ('Mini-Mitrailleuse') "
            "answered a critical post-Vietnam tactical doctrine gap: restoring organic sustained automatic "
            "firepower down to the 9-man infantry fireteam without the crushing 10.5 kg weight and 7.62×51mm "
            "ammunition burden of the M60. Entering the grueling 1979–1980 U.S. Army Squad Automatic Weapon "
            "(SAW) trials at Aberdeen Proving Ground as the XM249 against the Heckler & Koch XM262 (HK21E), "
            "Colt CMG-2/XM106, and Ford Aerospace XM248, Vervier's design triumphed in reliability and dual-feed "
            "versatility, winning selection in February 1982 and entering U.S. Army & Marine Corps service in "
            "1984 as the M249 SAW. Following intense combat evaluations in the 1991 Persian Gulf War, the U.S. "
            "M249 Product Improvement Program (PIP) added a stock-mounted hydraulic recoil buffer (replacing "
            "early elastomeric blocks to stabilize cyclic rate around 750–850 RPM and prevent receiver cracking), "
            "a perforated upper steel barrel heatshield, a single-port self-cleaning gas block, and an ergonomic "
            "fish-belly polymer buttstock with folding wire shoulder rest."
        ),
        "mechanicalCore": (
            "Firing 5.56×45mm NATO M855 62-grain green-tip penetrator ammunition (430 MPa peak pressure, 915 m/s "
            "from its 18.3-inch / 465 mm 1:7-inch twist cold-hammer-forged chrome-lined barrel), the M249 fires "
            "from an open bolt so ambient air circulates through the empty chamber between bursts to prevent "
            "catastrophic propellant cook-off. Pressing the trigger drops the case-hardened open-bolt sear catch, "
            "allowing the captive multi-strand driving spring to hurl the heavy underbarrel long-stroke cupped "
            "gas piston and slide carrier forward 95 mm. As the hard-chrome AK-inspired 2-lug breech bolt strips "
            "a round out of its disintegrating M27 metallic link into the chamber, the slide advances a final "
            "6.5 mm—rotating the bolt 30 degrees clockwise into the barrel extension AND mechanically protruding "
            "the slide-linked firing pin ONLY after full lockup! Gas tapped near the muzzle drives the piston "
            "rearward past a straight safety dwell before unlocking, ejecting brass and spent M27 links to the "
            "right, and compressing the PIP stock hydraulic damper across a 23.5 mm overtravel stroke. Crucially, "
            "a vertical steel roller atop the piston tower rides inside the hinged die-cast top cover's MG42-derived "
            "S-cam slot, swinging a forked feed lever and dual-stage spring shuttle pawls to advance a 200-round "
            "under-slung polymer assault box belt across both recoil and counter-recoil—while an angled left-side "
            "STANAG magwell lets a rifleman's 30-round M16/M4 magazine feed directly in an emergency with zero "
            "modification, paired with a 3-second tool-less fixed-headspace quick-change barrel latch handle."
        ),
        "milestoneAnchors": (
            "1974-1977 (Ernest Vervier develops FN Minimi 5.56mm 'Mini-Mitrailleuse' prototype at FN Herstal) -> "
            "1979-1980 (XM249 defeats HK21E, Ford XM248 & Colt entries in U.S. Army SAW Aberdeen trials) -> "
            "1982-1984 (Adopted as U.S. M249 Squad Automatic Weapon; FN Manufacturing Columbia SC production) -> "
            "1991 (Operation Desert Storm combat proving across desert sand & sustained suppressive fire) -> "
            "1994-1998 (M249 PIP upgrade adds hydraulic buffer, perforated barrel shroud & M1913 optic rail) -> "
            "2001-Present (Mk 46 SOCOM / M249 Para global service as NATO's definitive fireteam LMG)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'm249_receiver' (Stamped Dual Belt/STANAG Receiver); "
            "Act 2 -> 'm249_hydraulic_buffer' (PIP Hydraulic Recoil Buffer) or 'm249_handguard' (PIP Barrel Shroud); "
            "Act 3 -> 'm249_piston_carrier' (Long-Stroke Piston & Top Feed-Cam Roller); "
            "Act 4 -> 'm249_barrel' (18.3-inch Quick-Change CHF Barrel); "
            "Breakthroughs -> 'm249_receiver', 'm249_feed_lever' (or 'm249_feed_pawls'), and 'm249_barrel_handle'."
        ),
    },
    "p08": {
        "historicalContext": (
            "Rooted in American-German inventor Hugo Borchardt's 1893 C93—the world's first commercially produced "
            "semi-automatic pistol, whose bulky rear clockwork mainspring housing made it tail-heavy and awkward—the "
            "Parabellum-Pistole was perfected in Berlin at Deutsche Waffen- und Munitionsfabriken (DWM) by Austrian-born "
            "engineer Georg Johann Luger between 1898 and 1900. Luger eliminated Borchardt's clumsy rear housing, "
            "relocated the mainspring into a sublime 55-degree (125-degree) ergonomic grip frame modeled on natural "
            "fencing wrist alignment, and won Switzerland's 1900 military adoption in 7.65×21mm Parabellum—the first "
            "army in history to adopt a semi-automatic service pistol. When Imperial German trials demanded greater "
            "stopping power, Luger straightened the bottleneck 7.65mm case in 1902 to create the immortal 9×19mm "
            "Parabellum cartridge (named from DWM's Latin telegraph address 'Si vis pacem, para bellum'—'If you seek "
            "peace, prepare for war').Adopted by the Imperial German Navy in 1904 and, after replacing the early flat "
            "laminated grip spring with a rugged helical coil recoil spring, standardized by Kaiser Wilhelm II for the "
            "Imperial German Army on August 22, 1908 as the Pistole 08 (P08). Crafted by DWM Berlin (exemplified by "
            "classic 1917 wartime production) with hand-polished rust bluing, 240°C golden straw-tempered "
            "('Gelbangelassen') small parts, and 20-LPI European walnut grips, the Luger P08 became the aristocratic "
            "symbol of early 20th-century precision ordnance."
        ),
        "mechanicalCore": (
            "Chambered in 9×19mm Parabellum (235 MPa peak pressure, 124 gr FMJ @ 360 m/s out of its 4-inch / 102 mm "
            "6-groove tapered barrel), the P08 employs Georg Luger's over-center articulated two-bar knee-joint "
            "toggle lock ('Kniegelenkverschluss'). At battery, the center hinge pin Linking the DWM-monogrammed "
            "front toggle and knurled-ear rear toggle rests 1.5 degrees BELOW the bore-axle dead-center line against "
            "frame stops, mechanically self-locking under peak firing pressure! Upon ignition, the barrel, forked "
            "U-channel barrel extension ('Gabelgehäuse'), rectangular sliding breechblock, and flat toggle train "
            "recoil together as a locked unit for 6.5 mm until chamber pressure subsides. Twin cam rollers on the "
            "rear toggle ears then strike the forged frame's curved unlocking ramps ('Kurvenstücke'), kicking the "
            "knee joint sharply upward past dead center to buckle 53.5 degrees (~3.8 cm skyward) while pulling the "
            "breechblock 42 mm straight back! During this lightning stroke, the top-pivoting extractor (which doubles "
            "as history's most famous tactile/visual loaded-chamber indicator stamped 'GELADEN') pulls the brass case "
            "against the straw-tempered right-flank leaf ejector for crisp upward ejection, the front toggle's "
            "underside cam toe cocks the 3-flute gas-relief cylindrical internal striker, and an S-shaped coupling "
            "link compresses the 18-coil helical recoil spring inside the 55-degree grip spine. Equally ingenious is "
            "the removable left sideplate ('Abzugsblech') housing an L-shaped right-angle bellcrank transfer lever "
            "that converts rearward crescent-trigger pull into an inward lateral push on the horizontal seesaw sear "
            "bar's spring disconnector plunger, complemented by the 'GESICHERT' blocking-bar thumb safety and "
            "8-round brushed-nickel magazine with external thumb-loading follower button."
        ),
        "milestoneAnchors": (
            "1893 (Hugo Borchardt patents C93 toggle-lock semi-automatic pistol at Loewe/DWM Berlin) -> "
            "1898-1900 (Georg Luger refines compact knee-joint & 55-degree grip; Switzerland adopts Model 1900) -> "
            "1902 (Georg Luger creates the 9×19mm Parabellum cartridge for military stopping power) -> "
            "1904 (Imperial German Navy adopts Pistole 04 in 9×19mm Parabellum) -> "
            "Aug 22, 1908 (Helical grip recoil spring perfected; Kaiser Wilhelm II adopts Pistole 08 for German Army) -> "
            "1914-1942 (Over 2 million P08s built across DWM, Erfurt & Mauser; 9×19mm becomes global NATO standard)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'p08_frame' (Forged Curved-Ramp Frame w/ 55-degree Grip); "
            "Act 2 -> 'p08_barrel' (4-inch Tapered 9x19mm Parabellum Barrel); "
            "Act 3 -> 'p08_rear_toggle' (Articulated Rear Toggle Link w/ Knurled Ears & Cam Rollers); "
            "Act 4 -> 'p08_takedown_lever' (Straw-Tempered Takedown Lever) or 'p08_front_toggle' (DWM Scroll Toggle); "
            "Breakthroughs -> 'p08_rear_toggle', 'p08_trigger_lever' (Sideplate L-Bellcrank Lever), and 'p08_extractor' (GELADEN LCI Extractor)."
        ),
    },
    "vector": {
        "historicalContext": (
            "For nearly a century from John T. Thompson's 1921 M1928 'Tommy Gun' through the M3 Grease Gun and H&K "
            "UMP45, submachine guns firing the heavy, slow, man-stopping .45 ACP (11.43×23mm, 230-grain) cartridge "
            "faced a fundamental Newtonian curse: a high bore axis perched well above the shooter's wrist turned "
            "every full-auto burst into violent upward muzzle climb. In the early 2000s, French-born mechanical "
            "engineer Renaud Kerbrat challenged a century of straight-line gun design with U.S. Patent 7,201,094, "
            "redirecting bolt energy steeply downward off-axis rather than straight back into the shoulder. Backed by "
            "Swiss-rooted Transformational Defense Industries (TDI, later KRISS USA in Virginia Beach / Switzerland), "
            "experimental 'Super V' prototypes evaluated alongside U.S. Army Picatinny Arsenal engineers between "
            "2006 and 2007 demonstrated roughly 90% less vertical muzzle climb and 60% less felt recoil than legacy "
            ".45 ACP submachine guns—even at a blistering 1,200 RPM cyclic rate! Entering production as the KRISS "
            "Vector Gen I around 2009 and maturing in 2015 into the refined KRISS Vector Gen II (featuring a "
            "redesigned ergonomic trigger, 45-degree short-throw safety, push-button right-folding skeletonized "
            "stock, and 4-pin tool-free receiver takedown), the Vector redefined close-quarters ballistic physics."
        ),
        "mechanicalCore": (
            "Three synergistic geometric breakthroughs conquer .45 ACP recoil at 1,200 RPM (50 ms cycle time, "
            "145 MPa peak pressure, 230 gr FMJ @ 260 m/s): First, the fixed 5.5-inch (140 mm) chrome-moly-vanadium "
            "barrel sits at an ultra-low bore axis 15.3 mm BELOW the horizontal-travel pivoting trigger, aligning "
            "propellant thrust directly through the web of the firing hand so static overturning torque approaches "
            "zero. Second, the compact Delayed-Blowback Bolt (over 50% lighter than conventional .45 blowback bolts) "
            "projects twin hardened lateral cylindrical cam trunnions into variable-angle cam slots milled inside the "
            "patented tungsten-steel Super V Off-Axis Counterweight Slider ('vector_slider'). Immediately after "
            "ignition, a steep upper cam ramp imposes a ~2.68:1 mechanical disadvantage—forcing every 1 mm of initial "
            "bolt retreat to accelerate the heavy slider >2.6 mm downward—safely delaying breech opening until chamber "
            "pressure drops. Passing the cam knee, the bolt strokes 36.2 mm rearward and pitches into the curved "
            "throat to eject spent .45 brass right while driving the tungsten slider 64 mm steeply downward along a "
            "-65-degree inclined guide rod and helical recoil spring right behind the 66-degree 25-round Glock-21 "
            "compatible Kriss MagEx2 magazine well, generating downward counter-momentum that actively cancels muzzle "
            "rise! Third, because the lower chassis is occupied by the low barrel and -65-degree Super V chute, the "
            "entire CNC stainless fire-control unit ('vector_fcu_chassis') mounts inverted inside the upper FDE "
            "polymer housing, swinging an inverted hammer downward (+47 degrees) and decoupling the lower thumb "
            "safety (S/F) from the upper 3-mode fire selector (Semi '1', ultra-lethal 2-round hyper-burst '2', and "
            "1,200 RPM full-auto 'A')."
        ),
        "milestoneAnchors": (
            "2002-2007 (Renaud Kerbrat files off-axis Super V cam-slider kinematics; US Patent 7,201,094 granted) -> "
            "2006-2007 (TDI & U.S. Army Picatinny Arsenal tests verify ~90% muzzle-climb reduction in .45 ACP) -> "
            "2007-2009 (SHOT Show debut of TDI Kriss Super V XSMG & launch of production KRISS Vector Gen I) -> "
            "2011-2014 (TDI rebrands to KRISS USA; Kriss MagEx 25/30-round Glock-21 extended magazine ecosystem) -> "
            "2015 (KRISS Vector Gen II debuts w/ refined pivoting trigger, right-folding stock & 4-pin takedown) -> "
            "2016-Present (Multi-caliber Gen II law-enforcement adoption & iconic modern museum benchmark)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'vector_lower_chassis' (Super V Lower Chassis w/ -65° Chute & 66° Magwell); "
            "Act 2 -> 'vector_upper_housing' (Gen II FDE Upper Housing & Top Rail); "
            "Act 3 -> 'vector_slider' (Patented KRISS Super V Off-Axis Tungsten Counterweight Slider); "
            "Act 4 -> 'vector_mag_body' (25-Round Glock-21 Kriss MagEx2 Magazine) or 'vector_bolt' (Cam-Trunnion Bolt); "
            "Breakthroughs -> 'vector_slider', 'vector_barrel' (5.5-inch Sub-Trigger Low-Bore Barrel), and 'vector_hammer' (or 'vector_fcu_chassis')."
        ),
    },
    "g11": {
        "historicalContext": (
            "Initiated in 1968 under a radical West German Bundeswehr mandate to triple infantry hit probability "
            "beyond the 7.62×51mm G3, the Heckler & Koch G11 was developed over two decades in Oberndorf am Neckar "
            "by H&K alongside propellant partner Dynamit Nobel and optics specialist Hensoldt. After early "
            "nitrocellulose caseless rounds suffered thermal cook-off in hot chambers, Dynamit Nobel engineered "
            "the breakthrough octogen-based HITP (High Ignition Temperature Propellant) 4.73×33mm DM11 rectangular "
            "caseless block with a recessed copper-jacketed projectile. Reaching final maturity as the G11 K2 "
            "(with twin spare overhead magazine clips and integral 1x/3.5x optic carry-handle), the rifle stunned "
            "evaluators during the 1989–1990 U.S. Army Advanced Combat Rifle (ACR) trials and achieved Bundeswehr "
            "technical certification in 1990—before German reunification budget cuts halted mass production, "
            "cementing its legend as 'Kraut Space Magic.'"
        ),
        "mechanicalCore": (
            "Chambered in 4.73×33mm DM11 HITP caseless ammunition (380 MPa peak pressure, 3.4 g projectile @ 930 m/s "
            "from a 540 mm cold-hammer-forged chrome-lined floating barrel), the G11 K2 eliminates extraction and brass "
            "ejection completely. High-pressure gas tapped into a short-stroke underbarrel piston drives a toothed "
            "rack and meshing Swiss-watch stainless/C36000 brass spur gear train ('g11_clockwork_gears'), rotating "
            "a hard-chromed cylindrical breech ('g11_rotary_breech') 90 degrees upward until its chamber aligns "
            "vertically beneath the overhead 45-round horizontal magazine ('g11_mag_tube'). A vertical cam rammer "
            "('g11_loading_rammer') plunges 26.5 mm downward to press a fresh rectangular DM11 block straight into "
            "the cylinder, retracts clear, and the gear train rotates the breech smoothly back to 0 degrees coaxial "
            "with the bore for hermetic gas sealing and coaxial striker ignition. Crucially, during a 2,100 RPM "
            "3-round hyperburst (~85 ms), the entire floating steel inner receiver ('g11_inner_receiver'), 540 mm "
            "barrel, clockwork core, and overhead magazine glide rearward 42 mm as a unified assembly inside the "
            "sealed olive-charcoal monocoque polymer outer housing—allowing all three bullets to clear the muzzle "
            "before cumulative recoil strikes the shooter's shoulder, while full-auto drops to a controllable 460 RPM."
        ),
        "milestoneAnchors": (
            "1968–1971 (Bundeswehr future infantry rifle mandate launches H&K + Dynamit Nobel caseless program) -> "
            "1974–1977 (First rotary-breech G11 prototypes exceed 2,000 RPM burst cadence) -> "
            "1983–1986 (Dynamit Nobel HITP octogen propellant solves thermal cook-off in 4.73×33mm DM11) -> "
            "1989–1990 (G11 K2 enters U.S. Army Advanced Combat Rifle trials at Aberdeen & Fort Benning) -> "
            "1990 (Bundeswehr technical certification completed for G11 K2 adoption) -> "
            "1991–Present (Post-Cold-War cancellation turns G11 K2 into the summit of pure mechanical ordnance)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'g11_outer_housing' (Monocoque Polymer Outer Casing); "
            "Act 2 -> 'g11_mag_tube' (Overhead 45-Round 4.73x33mm DM11 Caseless Magazine); "
            "Act 3 -> 'g11_rotary_breech' (90-Degree Chrome Rotating Cylindrical Breech); "
            "Act 4 -> 'g11_clockwork_gears' (Swiss-Watch Stainless & Brass Spur Gear Train); "
            "Breakthroughs -> 'g11_rotary_breech', 'g11_inner_receiver', and 'g11_mag_tube'."
        ),
    },
    "vss": {
        "historicalContext": (
            "Commissioned under a classified 1983 KGB and GRU operational requirement for a takedown clandestine "
            "sniper rifle capable of defeating modern steel helmets and Kevlar/titanium body armor at 400 meters "
            "with whisper-quiet acoustic signature, the VSS Vintorez ('Vintovka Snayperskaya Spetsialnaya' / "
            "'Thread Cutter', GRAU index 6P29) was engineered at TsNIITochMash in Klimovsk by lead designer Pyotr "
            "Serdyukov and cartridge specialists Nikolai Zabelin and Lidia Dvoryaninova. Manufactured at the "
            "historic Tula Arms Plant (TOZ) starting in 1987, the VSS packs into a compact briefcase via tool-less "
            "removal of its laminated birch skeleton stock, integral cylindrical suppressor tube, and hammer-tone "
            "PSO-1M2-1 4×24 rangefinding optic calibrated specifically for heavy subsonic trajectories—serving "
            "Soviet and Russian Alpha, Vympel, and GRU Spetsnaz units across four decades."
        ),
        "mechanicalCore": (
            "Built around the purpose-engineered 9×39mm subsonic cartridge (16.2 g SP-5 match and SP-6 hardened "
            "tungsten-carbide armor-piercing core @ 290 m/s, 280 MPa peak pressure, staying safely below the "
            "340 m/s sonic crack barrier), the VSS vents propellant gas progressively through three radial rows "
            "of bleed ports drilled directly into the rifling grooves of its 200 mm barrel ('vss_barrel') into a "
            "414 mm full-length cylindrical expansion jacket ('vss_suppressor_tube'). Forward of the muzzle, six "
            "alternating 28-degree slanted asymmetric CNC baffles ('vss_baffle_stack') strip, cool, and decelerate "
            "residual exhaust gases cleanly down to ~130 dB. Inside the rigid billet CNC-milled Tula steel receiver, "
            "a long-stroke gas piston drives a six-lug symmetrical rotating bolt ('vss_bolt', 60-degree radial "
            "symmetry) for uniform breech lockup and zero asymmetric lug thrust, while a hammerless linear coaxial "
            "sliding striker ('vss_striker') eliminates swinging-hammer mechanical clatter and shortens lock time, "
            "paired with an AK-style right dust-shield safety decoupled from a behind-trigger cross-bolt semi/auto "
            "selector and 10-round ribbed polymer magazine."
        ),
        "milestoneAnchors": (
            "1983 (Classified KGB & GRU 'Vintorez' specification demands silent 400m armor defeat) -> "
            "1984–1985 (TsNIITochMash finalizes heavy 9×39mm SP-5 & tungsten-core SP-6 subsonic rounds) -> "
            "1985–1986 (Pyotr Serdyukov's RG036 validates 6-stage slanted baffles & hammerless linear striker) -> "
            "1987 (Official GRAU 6P29 adoption & Tula Arms Plant TOZ serial production begins) -> "
            "1988–1999 (Dedicated PSO-1M2-1 subsonic optic & Spetsnaz combat baptism) -> "
            "2018–Present (Modernized VSS-M rails & enduring benchmark of integral suppressed sniper design)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'vss_suppressor_tube' (414 mm Full-Length Integral Expansion Suppressor Tube); "
            "Act 2 -> 'vss_baffle_stack' (6-Stage Alternating 28-Degree Slanted Asymmetric Baffle Stack); "
            "Act 3 -> 'vss_striker' (Hammerless Linear Coaxial Sliding Striker); "
            "Act 4 -> 'vss_wood_stock' (Quick-Detach Laminated Birch Skeleton Stock); "
            "Breakthroughs -> 'vss_baffle_stack', 'vss_bolt', and 'vss_striker'."
        ),
    },
    "m134": {
        "historicalContext": (
            "Tracing its rotary multi-barrel lineage back to Dr. Richard Jordan Gatling's 1862 patent, the M134 "
            "Minigun was born in 1960–1962 when General Electric Armament Systems (Burlington, Vermont) scaled "
            "down its 20mm M61 Vulcan fighter-jet cannon to chamber standard 7.62×51mm NATO rifle ammunition for "
            "Vietnam-era helicopters and fixed-wing gunships. Unleashed as the GAU-2/A and M134 aboard AC-47 "
            "'Spooky' ('Puff the Magic Dragon') gunships and UH-1 Hueys, early systems delivered terrifying "
            "suppressive volume yet suffered frequent delinker jams and short 10,000-round rotor wear lives. "
            "In the 1990s, Scottsdale-based Dillon Aero completely re-engineered the feeder/delinker, hardened "
            "six-flute rotor, bolts, and clutch drive—tripling mean rounds between stoppages past 30,000 rounds "
            "and pushing component life beyond 100,000 rounds, earning official 2003 U.S. military type "
            "classification as the modernized M134D across aviation, naval, and vehicle mounts worldwide."
        ),
        "mechanicalCore": (
            "Unlike gas- or recoil-operated machine guns that stall on a single misfire, the M134D is externally "
            "powered by a 3.2-HP 28-volt DC aerospace electric drive motor ('m134_drive_motor') geared to spin "
            "its central six-flute hardened star rotor ('m134_rotor_assembly') and six 22-inch (559 mm) 7.62×51mm "
            "NATO barrels ('m134_barrel_cluster', 415 MPa peak pressure, 147 gr M80 @ 853 m/s) at 500 RPM—yielding "
            "a sustained 3,000 RPM cyclic firestorm while capping each individual barrel's thermal load to 500 RPM "
            "with 300 degrees of air-cooling rotation between shots. Inside the stationary cylindrical main housing "
            "('m134_main_housing'), a precision-milled 360-degree elliptical sinusoidal cam track ('m134_cam_track_ring') "
            "guides all six orbiting chrome-plated rotary bolts ('m134_bolt_1'..'m134_bolt_6', spaced 60 degrees "
            "apart) through a smooth 46 mm axial wave: feeding, 2-lug locking, firing-pin release at top dead center, "
            "primary extraction, and forceful downward ejection through the right chute—effortlessly ejecting any "
            "dud round without interruption. Counter-rotating in strict 1:1 gear lockstep, the Dillon Aero "
            "six-pocket stainless star-wheel delinker ('m134_delinker_sprocket') strips linked 7.62mm rounds from "
            "M13 disintegrating steel links at 50 rounds per second, protected by a spring-loaded clutch and "
            "fail-safe safing sector."
        ),
        "milestoneAnchors": (
            "1862 (Dr. Richard J. Gatling patents the hand-cranked multi-barrel rotary gun) -> "
            "1960–1962 (General Electric scales the 20mm M61 Vulcan down to the 7.62×51mm XM134 Minigun) -> "
            "1964–1969 (Vietnam combat debut aboard AC-47 Spooky & UH-1 Huey gunships) -> "
            "1990–1995 (Dillon Aero completely re-engineers the six-pocket delinker, bolts & rotor core) -> "
            "2003 (U.S. Military type-classifies the 100,000-round modernized M134D) -> "
            "2004–Present (Global 3,000 RPM standard across MH-60, MH-47, patrol craft & special operations)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'm134_drive_motor' (28V DC 3.2-HP Aerospace Electric Drive Motor); "
            "Act 2 -> 'm134_barrel_cluster' (Six-Barrel 22-Inch 7.62x51mm Rotary Cluster); "
            "Act 3 -> 'm134_cam_track_ring' (360-Degree Elliptical Sinusoidal Cam Track Ring); "
            "Act 4 -> 'm134_delinker_housing' (Dillon Aero Delinker Housing) or 'm134_delinker_sprocket'; "
            "Breakthroughs -> 'm134_cam_track_ring', 'm134_drive_motor', and 'm134_delinker_sprocket'."
        ),
    },
    "an94": {
        "historicalContext": (
            "Born out of the top-secret 1978 Soviet 'Project Abakan' competition aimed at boosting burst hit "
            "probability from unstable standing and moving firing positions by 1.5 to 2 times over the AK-74, "
            "the AN-94 (Avtomat Nikonova model 1994, GRAU index 6P33) was conceived at Izhmash by mechanical "
            "visionary Gennady Nikolayevich Nikonov. Outlasting formidable balanced-recoil rivals such as the "
            "AEK-971 through grueling TsNIITochMash mud, arctic freeze, and desert endurance trials across NA-2, "
            "AS, and ASM prototypes from 1981 to 1991, Nikonov's blowback-shifted impulse design achieved official "
            "Russian military adoption in 1994. Earning the nickname 'the Clockwork Kalashnikov' for its internal "
            "pulley-and-cable transmission, the AN-94 saw elite deployment with Russian Airborne (VDV), Naval "
            "Infantry, and MVD special forces—revered as the most mechanically intricate assault rifle ever "
            "standardized for military service."
        ),
        "mechanicalCore": (
            "Chambered in 5.45×39mm 7N6 (294 MPa peak pressure, 3.43 g spitzer @ 900 m/s from a 405 mm CHF barrel), "
            "the AN-94 solves burst dispersion via Blowback-Shifted Pulse (Smeshcheniye Impulsa Otdachi). The entire "
            "barreled action—405 mm barrel, gas tube, self-cleaning figure-8 acoustic muzzle brake, and CNC steel "
            "inner sub-receiver ('an94_inner_receiver')—floats on precision rails inside a stationary fiberglass-"
            "reinforced charcoal polyamide outer housing ('an94_outer_housing'), gliding freely 42 mm rearward as a "
            "single unit during a 1,800 RPM 2-round hyperburst (~33 ms between shots) so BOTH projectiles exit the "
            "muzzle nearly through the same hole before cumulative recoil hits the shooter's shoulder (switching "
            "seamlessly to 600 RPM full-auto from round three onward). To feed a second cartridge at 30 rounds per "
            "second without outrunning a standard AK-74 magazine spring, a CNC V-groove steel pulley wheel "
            "('an94_pulley_wheel') wrapped with a 180-degree braided stainless wire cable ('an94_steel_cable') "
            "couples the rearward-flying bolt carrier directly to a bronze two-stage pre-feed shuttle rammer "
            "('an94_feed_rammer') that lunges +26 mm forward to pre-stage the next cartridge onto an intermediate "
            "loading tray—requiring the 30-round magazine well to cant 15 degrees right to clear the internal "
            "cable track, while a whistling twin-chamber figure-8 muzzle compensator harnesses supersonic exhaust "
            "vortices to tame muzzle climb."
        ),
        "milestoneAnchors": (
            "1978–1981 (Secret Soviet 'Project Abakan' trials demand 1.5–2x AK-74 burst hit probability) -> "
            "1981–1986 (Gennady Nikonov develops NA-2 to AS prototypes with pulley-cable two-stage pre-feed) -> "
            "1987–1991 (Finalist ASM defeats balanced-recoil rivals at TsNIITochMash proving grounds) -> "
            "1994 (Official adoption as AN-94 / GRAU 6P33 by Russian Armed Forces) -> "
            "1997–2005 (Limited Izhmash serial production & elite VDV / Spetsnaz combat validation) -> "
            "2008–Present (Enduring monument of pure mechanical delayed-impulse ordnance engineering)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'an94_outer_housing' (Stationary Polyamide Outer Shell & Rail Frame); "
            "Act 2 -> 'an94_pulley_wheel' (CNC Steel V-Groove Pulley & Braided Stainless Cable); "
            "Act 3 -> 'an94_muzzle_brake' (Twin-Chamber Self-Cleaning Figure-8 Muzzle Brake); "
            "Act 4 -> 'an94_feed_rammer' (Two-Stage Bronze Pre-Feed Shuttle Rammer); "
            "Breakthroughs -> 'an94_inner_receiver', 'an94_pulley_wheel', and 'an94_muzzle_brake'."
        ),
    },
    "ztz99a": {
        "historicalContext": (
            "Evolving from China's landmark 1984 Project 9910 third-generation tank program and the original "
            "Type 99 unveiled in 1999, the PLA ZTZ-99A represents a clean-sheet third-generation-plus digitalized "
            "main battle tank engineered by NORINCO and China North Vehicle Research Institute (201 Institute) "
            "under Chief Designer Mao Ming. Fielded after exhaustive Arctic, high-altitude Qinghai-Tibet plateau, "
            "and desert trials between 2008 and 2011, the 55-tonne ZTZ-99A debuted operationally at Peace Mission "
            "2014 before spearheading the arrowhead vanguard of the 2015 70th Anniversary Victory Day Parade in "
            "Beijing. Pairing arrowhead FY-4 dual-purpose explosive reactive armor, a 6.25-meter 125mm ZPT-98 L/50 "
            "smoothbore cannon, an indigenous 1,500-horsepower 150HB V12 diesel powerpack, and the unmistakable "
            "JD-3 active laser dazzler, it serves as the networked heavy-armor backbone of PLA combined-arms brigades."
        ),
        "mechanicalCore": (
            "Packed inside a low 2.37-meter-tall, 7.60-meter-long welded composite hull (10.90 m overall with gun "
            "forward, 3.50 m wide) shielded by arrowhead turret wedges and glacis FY-4 ERA bricks, the ZTZ-99A "
            "fires two-piece 125mm DTC10-125 tungsten APFSDS ammunition at 650 MPa peak chamber pressure and "
            "1,780 m/s muzzle velocity from its autofrettaged chrome-lined ZPT-98 L/50 smoothbore barrel "
            "('ztz99a_main_gun'). Massive recoil drives the gun and vertical sliding-wedge breechblock "
            "('ztz99a_breech_block') -320 mm rearward along the trunnion cradle against twin chrome hydraulic "
            "brakes and helical recuperator springs ('ztz99a_recoil_springs'). On counter-recoil, opening cams "
            "drop the wedge -160 mm and flip the spent brass stub base skyward through the rear roof ejector hatch "
            "('ztz99a_stub_ejector'). Beneath the 3-man crew floor, the 1.80-meter electric 22-cassette floor "
            "carousel autoloader ('ztz99a_autoloader_carousel') rotates to align the selected projectile and "
            "semi-combustible charge, an articulated elevator hoist ('ztz99a_loading_tray') lifts the cassette "
            "+680 mm into bore alignment, and a bustle-mounted rigid-chain rammer ('ztz99a_rammer_chain') lunges "
            "+540 mm forward for a steady 8 RPM rate. Aft sits the modular 1,500-HP 150HB twin-turbo V12 diesel "
            "('ztz99a_v12_engine') mated to the CH-1000 hydro-mechanical planetary transmission across 12 torsion "
            "bars, while roof-mounted hunter-killer thermal sights and the JD-3 laser dazzler ('ztz99a_optics_citv') "
            "deliver integrated hard-kill and soft-kill battlefield dominance."
        ),
        "milestoneAnchors": (
            "1984–1999 (Project 9910 foundation & original Type 99 parade debut) -> "
            "2000–2007 (ZTZ-99A clean-sheet digital redesign & 150HB / CH-1000 powerpack breakthrough) -> "
            "2008–2011 (Arctic, Qinghai-Tibet plateau & desert trials plus FY-4 ERA qualification) -> "
            "2014 (Operational public debut at Peace Mission 2014 combined exercise) -> "
            "2015 (Arrowhead vanguard debut at the 70th Anniversary Victory Day Parade) -> "
            "2016–Present (Networked combined-arms armored backbone & continuous digital evolution)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'ztz99a_hull_armor' (Hollow Welded Composite Hull Tub); "
            "Act 2 -> 'ztz99a_era_wedges' (Arrowhead FY-4 Dual-Purpose ERA Turret Wedges); "
            "Act 3 -> 'ztz99a_autoloader_carousel' (22-Cassette Floor Carousel Autoloader); "
            "Act 4 -> 'ztz99a_v12_engine' (1,500-HP 150HB Twin-Turbo V12 Diesel Engine); "
            "Breakthroughs -> 'ztz99a_autoloader_carousel', 'ztz99a_optics_citv', and 'ztz99a_v12_engine'."
        ),
    },
    "m1a2": {
        "historicalContext": (
            "Born from the U.S. Army's post-1973 Yom Kippur War reassessment of armored survivability after the "
            "cancellation of the MBT-70, the M1 Abrams originated in Chrysler Defense's audacious XM1 prototype "
            "(led by Dr. Philip Lett) that gambled on an aviation-derived Honeywell/Lycoming AGT1500 1,500-SHP "
            "multi-fuel gas turbine over conventional diesel rivals. Entering service in 1980 and up-gunned in "
            "1985 as the M1A1 with Rheinmetall's licensed 120mm L/44 M256 smoothbore and depleted-uranium-enhanced "
            "Chobham composite armor, the Abrams demonstrated devastating thermal hunter-killer supremacy during "
            "Operation Desert Storm's 1991 Battle of 73 Easting. Evolving through the M1A2 Commander's Independent "
            "Thermal Viewer (CITV) and System Enhancement Packages into today's 66.8-tonne M1A2 SEP v3 (M1A2C), it "
            "stands as the flagship spearhead of U.S. Army armored brigade combat teams."
        ),
        "mechanicalCore": (
            "Measured at true 1:1 scale (9.77 m overall with its 5.28-meter chrome-lined 120mm L/44 M256 "
            "smoothbore cannon, 3.66 m wide, 2.44 m tall), the M1A2 SEP v3 places crew survivability at the heart "
            "of its architecture. Its angular turret cheeks pack 7-layer Chobham and third-generation depleted-"
            "uranium NERA composite armor ('m1a2_composite_armor'), while 36 unitary 120mm M829A4 DU sabot rounds "
            "sit isolated inside a rear honeycombed turret bustle beneath sacrificial roof blow-off vent panels "
            "('m1a2_blowoff_panels') and knee-actuated sliding armored blast doors ('m1a2_blast_doors'). Firing "
            "M829A4 at 650 MPa peak pressure launches the Mach-5 sabot dart at 1,670 m/s, recoiling the M256 tube "
            "and vertical falling-wedge breechblock ('m1a2_breech_block') -300 mm against dual hydraulic brakes and "
            "forged helical recuperator springs ('m1a2_recoil_springs'). On counter-recoil, the wedge drops -150 mm "
            "to eject the metallic stub base into the steel deflector basket; the loader taps the knee switch to "
            "slide the blast doors open 340 mm, extracts a 984 mm M829A4 round ('m1a2_ready_round'), and rams it "
            "+196 cm into battery in a four-second drill before the overhead fail-safe spring slams the doors shut. "
            "In the rear bay, the whisper-quiet 1,500-SHP AGT1500 recuperated gas turbine ('m1a2_agt1500_turbine') "
            "and Allison X1100-3B cross-drive transmission power 7 pairs of dual road wheels across 14 torsion bars."
        ),
        "milestoneAnchors": (
            "1973–1976 (Chrysler gas-turbine XM1 defeats diesel rival to win U.S. Army trials) -> "
            "1980 (Original 105mm M1 Abrams enters U.S. Army frontline service) -> "
            "1985–1988 (M1A1 up-gunned to 120mm L/44 M256 smoothbore & depleted-uranium Chobham armor) -> "
            "1991 (Operation Desert Storm & decisive thermal dominance at the Battle of 73 Easting) -> "
            "1992–2008 (M1A2 hunter-killer CITV & SEP v1/v2 digital network modernization) -> "
            "2017–Present (M1A2 SEP v3 / M1A2C flagship armor, CROWS-LP & ammunition data-link standard)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'm1a2_agt1500_turbine' (Honeywell AGT1500 1,500-SHP Multi-Fuel Gas Turbine); "
            "Act 2 -> 'm1a2_blast_doors' (Knee-Actuated Sliding Armored Bustle Blast Doors); "
            "Act 3 -> 'm1a2_composite_armor' (7-Layer Chobham & Depleted-Uranium NERA Cheek Armor); "
            "Act 4 -> 'm1a2_crows_optics' (CROWS-LP Remote .50 Cal Station & Hunter-Killer CITV); "
            "Breakthroughs -> 'm1a2_blast_doors', 'm1a2_agt1500_turbine', and 'm1a2_composite_armor'."
        ),
    },
    "leopard2a7": {
        "historicalContext": (
            "Forged in Munich by Krauss-Maffei (now KNDS / Krauss-Maffei Wegmann) following the 1970 collapse of "
            "the ambitious joint U.S.-West German MBT-70 program, the Leopard 2 entered Bundeswehr service in 1979 "
            "and rapidly set the international engineering benchmark for balanced firepower, protection, and modular "
            "mobility. Under the 1990s KWS II (Leopard 2A5) and 2001 KWS I (Leopard 2A6) upgrades, Germany "
            "pioneered razor-sharp hollow spaced Arrowhead composite turret wedges and extended Rheinmetall's "
            "legendary 120mm smoothbore from L/44 to the 6.6-meter L/55 lance. Standardized as the 66.5-tonne "
            "Leopard 2A7V ('Verbessert') with bolted upper-glacis add-on armor, the strengthened 700 MPa Rh-120 "
            "L/55A1 barrel, auxiliary power, and digital IFIS command integration, the Leopard 2 lineage serves "
            "more than twenty nations as Europe's armored backbone."
        ),
        "mechanicalCore": (
            "Spanning 10.97 meters overall (3.75 m wide, 2.64 m tall) in NATO three-tone camouflage, the Leopard "
            "2A7V unites three landmark German mechanical subsystems. Up front, hinged hollow spaced Arrowhead "
            "turret wedges ('leo_arrowhead_wedges') house multi-layer NERA plates that induce asymmetric yaw and "
            "shear incoming long-rod penetrators before they reach the main welded composite turret. Centrally "
            "mounted, the 6.6-meter chrome-lined Rheinmetall Rh-120 L/55A1 smoothbore ('leo_main_gun') withstands "
            "700 MPa chamber pressure to launch 120mm DM63A1 tungsten darts at 1,750 m/s (Mach 5.1), recoiling "
            "-340 mm against twin mirror-chrome hydraulic brakes and helical recuperator coils ('leo_recoil_springs'). "
            "Upon counter-recoil, a semi-automatic cam drops the vertical falling-wedge breechblock "
            "('leo_breech_block') -160 mm to eject the metallic stub base; the loader triggers the pneumatic knee "
            "switch to slide the bustle blast door ('leo_blast_door') 340 mm open, draws a 984 mm DM63A1 unitary "
            "round ('leo_ready_round') from the 15-round ready rack (backed by a 27-round hull bunker), and rams "
            "it +1,520 mm forward in a crisp four-second reload. Aft, the 47.6-liter 1,500-HP MTU MB 873 Ka-501 "
            "twin-turbo V12 diesel ('leo_mtu_v12'), RENK HSWL 354 hydro-mechanical transmission, and radial "
            "cooling fans bolt together as a modular EuroPowerpack that can be field-swapped in fifteen minutes."
        ),
        "milestoneAnchors": (
            "1963–1970 (Joint U.S.-German MBT-70 cancellation launches national Leopard 2 program) -> "
            "1972–1979 (Keiler & Leopard 2 prototype trials culminate in first Bundeswehr deliveries) -> "
            "1991–1995 (KWS II Leopard 2A5 pioneers hollow spaced Arrowhead composite turret wedges) -> "
            "2001 (KWS I Leopard 2A6 introduces Rheinmetall's 6.6-meter 120mm Rh-120 L/55 smoothbore) -> "
            "2014–2019 (Leopard 2A7 & enhanced 2A7V adopt glacis add-on armor, L/55A1 & digital IFIS) -> "
            "2021–Present (Frontline Western MBT benchmark fielded across over 20 allied nations)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'leo_hull_shell' (Welded Composite Hull Shell & 2A7V Glacis Add-On Armor); "
            "Act 2 -> 'leo_arrowhead_wedges' (Hinged Hollow Spaced Arrowhead Composite Turret Wedges); "
            "Act 3 -> 'leo_main_gun' (6.6-Meter Rheinmetall Rh-120 L/55A1 700 MPa Smoothbore); "
            "Act 4 -> 'leo_mtu_v12' (47.6L 1,500-HP MTU MB 873 V12 Quick-Swap EuroPowerpack); "
            "Breakthroughs -> 'leo_arrowhead_wedges', 'leo_main_gun', and 'leo_mtu_v12'."
        ),
    },
    "tiger1": {
        "historicalContext": (
            "Conceived under the May 1941 German Wa Prüf 6 heavy breakthrough tank mandate (VK 45.01) demanding "
            "100 mm frontal armor and a tank-mounted adaptation of the dreaded 8.8 cm Flak gun, Henschel's "
            "Erwin Aders defeated Ferdinand Porsche's petrol-electric rival in April 1942 to win serial production "
            "at Kassel as the Panzerkampfwagen VI Tiger I Ausf. E. Chassis number 250122—tactical turret number "
            "'131' of Schwere Panzer-Abteilung 504—rolled off the Kassel line in February 1943 in fresh Dunkelgelb "
            "paint and deployed to North Africa. On April 21, 1943, at Djebel Djaffa (Point 174) in Tunisia, a "
            "6-pounder round from a British Churchill tank wedged in Tiger 131's turret ring, causing its crew to "
            "abandon the 57-tonne giant almost completely intact. Shipped to England for intelligence study and "
            "painstakingly restored to running mechanical order by The Tank Museum at Bovington, Tiger 131 remains "
            "the world's only operating Tiger I heavy tank."
        ),
        "mechanicalCore": (
            "Crafted at exact 1:1 scale (8.45 m overall with its 4.93-meter rifled cannon, 6.32 m hull, 3.56 m "
            "wide, 3.00 m cupola height) with 100 mm interlocking vertical rolled homogeneous armor finished in "
            "Dunkelgelb, Zimmerit paste, and Elfenbein ivory interiors, Tiger 131 embodies the brilliant paradox "
            "of wartime German precision engineering. Inside its horseshoe-curved turret sits Krupp's 88mm KwK 36 "
            "L/56 cannon ('tiger_main_gun') fitted with a twin-baffle conical muzzle brake and semi-automatic "
            "horizontal sliding-wedge breech ('tiger_breech_block'). Firing a 10.2 kg PzGr. 39 APCBC projectile "
            "at 320 MPa peak pressure and 773 m/s through 32 rifling grooves recoils the gun -290 mm against its "
            "hydraulic Rohrbremse and twin helical recuperator coils ('tiger_recoil_springs'); on runout, the "
            "semi-automatic cam slides the steel wedge 160 mm laterally, flinging the scorching 571 mm brass case "
            "into the shell catcher basket so the loader can ram a fresh 16 kg round ('tiger_ready_round') +124 cm "
            "forward and trip the spring-loaded wedge shut. Propulsion runs from the rear 23.1-liter 700-HP Maybach "
            "HL230 P45 V12 gasoline engine ('tiger_maybach_v12') through a central floor propeller shaft "
            "('tiger_driveshaft') to the front Maybach Olvar 8-speed hydraulic pre-selector gearbox and Henschel "
            "L600C dual-radius regenerative steering unit ('tiger_transmission'), carried across rough terrain by "
            "Heinrich Kniepkamp's 3-row overlapping Schachtellaufwerk interleaved road wheels "
            "('tiger_interleaved_wheels') on 16 transverse torsion bars and massive 725 mm combat tracks."
        ),
        "milestoneAnchors": (
            "May 1941 (VK 45.01 heavy breakthrough tank specification issued to Henschel & Porsche) -> "
            "Apr 1942 (Henschel VK 45.01(H) wins trials & enters Tiger I Ausf. E serial production) -> "
            "Aug 1942 (Kassel factory deliveries & first combat deployment near Leningrad) -> "
            "Feb 1943 (Chassis 250122 completed & issued as Tiger 131 to Schwere Panzer-Abteilung 504) -> "
            "Apr 21, 1943 (Captured virtually intact by British forces at Point 174 in Tunisia) -> "
            "2003–Present (Restored to roaring running condition at The Tank Museum, Bovington)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'tiger_hull_box' (100mm Interlocking Vertical RHA Hull & Elfenbein Interior); "
            "Act 2 -> 'tiger_main_gun' (4.93-Meter Krupp 88mm KwK 36 L/56 Rifled Cannon); "
            "Act 3 -> 'tiger_interleaved_wheels' (3-Row Overlapping Schachtellaufwerk Interleaved Road Wheels); "
            "Act 4 -> 'tiger_maybach_v12' (23.1L 700-HP Maybach HL230 P45 V12 Gasoline Engine); "
            "Breakthroughs -> 'tiger_breech_block', 'tiger_interleaved_wheels', and 'tiger_transmission'."
        ),
    },
    "winchester1894": {
        "historicalContext": (
            "Engineered by John Moses Browning in Ogden, Utah and acquired by the Winchester Repeating Arms Company "
            "of New Haven, Connecticut under U.S. Patent 524,702 (issued August 21, 1894), the Model 1894 lever-action "
            "carbine was purposefully designed to harness smokeless powder pressures after earlier black-powder toggle "
            "actions of 1866 and 1873 proved insufficiently strong. Paired with Winchester's 1895 .30 W.C.F. (.30-30 "
            "Winchester—America's first commercial sporting smokeless cartridge), the compact 20-inch Saddle-Ring "
            "Carbine became the quintessential North American frontier utility firearm and surpassed seven million "
            "serial numbers across over a century of continuous production."
        ),
        "mechanicalCore": (
            "Rather than fragile side-by-side toggle links, Browning dropped a pivoted steel link bridge out of the "
            "receiver floor beneath a forged D-loop finger lever ('win94_lever'). Opening the lever cams the vertical "
            "H-shaped steel locking bolt ('win94_locking_bolt') straight down out of upper receiver abutment shoulders, "
            "unlocks and retracts the cylindrical top-eject breech bolt ('win94_breech_bolt') while lifting the brass "
            "shell carrier ('win94_carrier') loaded via King's Patent right-side spring loading gate ('win94_loading_gate') "
            "and full-length 7-round tubular magazine ('win94_mag_tube'), and thumbs back the exposed hammer ('win94_hammer'). "
            "A two-piece interlocked firing pin ('win94_firing_pin') and lower-tang lever squeeze safety block sear release "
            "until the lever seats flush."
        ),
        "milestoneAnchors": (
            "Aug 21, 1894 (John M. Browning receives U.S. Patent 524,702 for rising-wedge Model 1894 lever action) -> "
            "1895 (.30 W.C.F. / .30-30 Winchester debuts as America's first smokeless sporting cartridge) -> "
            "1927 (Serial number 1,000,000 Model 1894 presented to President Calvin Coolidge) -> "
            "1964 (Stamping & sintered parts revision separates revered forged Pre-64 carbines) -> "
            "1982–1992 (U.S. Repeating Arms introduces Angle-Eject & cross-bolt safety variants) -> "
            "Present (Over 7.5 million Model 1894 rifles built worldwide)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'win94_receiver' (Top-Eject Forged Flat-Side Receiver w/ Tang Slots); "
            "Act 2 -> 'win94_barrel' (20-inch Tapered .30-30 Round Carbine Barrel); "
            "Act 3 -> 'win94_locking_bolt' (Browning Vertical Rising Locking Block) & 'win94_lever' (D-Loop Lever); "
            "Act 4 -> 'win94_saddle_ring' (Cavalry Saddle Ring) or 'win94_carrier' (Brass Shell Lifter); "
            "Breakthroughs -> 'win94_locking_bolt', 'win94_carrier', and 'win94_firing_pin'."
        ),
    },
    "rem870": {
        "historicalContext": (
            "Introduced in 1950 by Remington Arms Company of Ilion, New York as a rugged, economical successor to "
            "John Pedersen's Model 31 and engineered by L. Ray Crittendon, Phillip Haskell, Ellis Hailston, and G.E. "
            "Pinckney, the Model 870 Wingmaster (and its heavy-duty law-enforcement sibling, the Model 870 Police Magnum) "
            "revolutionized pump-action shotguns through a milled billet-steel receiver paired with twin non-binding "
            "parallel action bars. Surpassing eleven million units produced, it stands as the highest-production "
            "pump-action combat and sporting shotgun in history."
        ),
        "mechanicalCore": (
            "Stroking the 12-groove corn-cob American walnut pump forend ('rem870_forend') drives twin parallel hardened "
            "steel action bars ('rem870_action_bars') flanking the 4+1 tubular magazine into the milled billet receiver "
            "('rem870_receiver'), eliminating torsional binding even under sand, ice, or stressed one-handed clearing. "
            "The action bars drag an angled steel camming slide block ('rem870_slide_block') rearward inside the bolt "
            "carrier, pulling the tilting steel wedge locking block ('rem870_locking_block') downward out of the 18-inch "
            "Parkerized 12-gauge barrel extension before retracting the mirror hard-chrome breech bolt ('rem870_breech_bolt'). "
            "A removable dual-pin aluminum Police trigger plate ('rem870_trigger_plate'), spring-loaded Flexi-Tab hard-chrome "
            "shell carrier ('rem870_shell_carrier'), and high-visibility safety-orange follower ('rem870_mag_follower') "
            "complete the combat cycle."
        ),
        "milestoneAnchors": (
            "1950 (Remington debuts Model 870 Wingmaster w/ twin action bars & billet steel receiver at Ilion, NY) -> "
            "1966 (U.S. Marine Corps fields Model 870 Mk 1 riot shotgun in Southeast Asia) -> "
            "1973–1984 (Two-million & three-million milestones solidify Model 870 dominance) -> "
            "1987 (Remington introduces anti-jam Flexi-Tab shell carrier upgrade) -> "
            "1990s (Model 870 Police Magnum standardized across U.S. federal & municipal SWAT teams) -> "
            "2009–Present (Over 11 million Model 870 shotguns manufactured globally)"
        ),
        "focusPartGuidance": (
            "Recommended exact focusPartId anchors from BOM: "
            "Act 1 -> 'rem870_receiver' (Machined Solid Billet Steel 12-Gauge Receiver); "
            "Act 2 -> 'rem870_action_bars' (Twin Non-Binding Parallel Steel Action Bars & Sleeve); "
            "Act 3 -> 'rem870_locking_block' (Tilting Steel Wedge Locking Block) & 'rem870_breech_bolt' (Hard-Chrome Bolt); "
            "Act 4 -> 'rem870_forend' (12-Groove Corn-Cob Walnut Pump Forend) & 'rem870_shell_carrier' (Hard-Chrome Lifter); "
            "Breakthroughs -> 'rem870_action_bars', 'rem870_locking_block', and 'rem870_trigger_plate'."
        ),
    },
}

TEXT_MODEL = "gemini-3.8-flash"
STORY_TTS_MODEL = "gemini-3.8-flash-tts"
PART_TTS_MODEL = STORY_TTS_MODEL
DEFAULT_VOICE = "Charon"

STORY_TTS_MIN_INTERVAL_SEC = 6.5
_STORY_TTS_RATE_LOCK = threading.Lock()
_LAST_STORY_TTS_MONO: float = 0.0
_STORY_TTS_STAMP_FILE = TTS_CACHE_DIR / ".story_tts_rate.stamp"

STYLE_STORY_ZH = (
    "沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，"
    "语速适中自然，重点转折处略作停顿，吐字清晰饱满"
)
STYLE_STORY_EN = (
    "Authoritative, warm, articulate museum firearm historian and mechanical "
    "engineering documentary narrator, measured pace with natural cadence"
)
# Unified across the entire vault so every component narration matches the Glock 17 R&D story voice & cadence
STYLE_PART_ZH = STYLE_STORY_ZH
STYLE_PART_EN = STYLE_STORY_EN


class StopSpending(RuntimeError):
    """Immediate circuit breaker on quota, rate-limit, or billing errors."""


class _AbortedByStopEvent(RuntimeError):
    """Internal signal when another worker triggered stop_event while waiting on rate lock."""


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
    name: str = Field(description="Full official English weapon or archery platform title.")
    subtitle: str = Field(description="Concise technical English subtitle.")
    originCountry: str = Field(description="Country of origin in English, e.g. 'Russia' or 'United States'.")
    weaponType: str = Field(description="Weapon/platform type in English, e.g. 'Assault Rifle' or 'Binary-Cam Compound Bow'.")
    categoryLabel: str = Field(description="Category badge in English.")
    actionMechanism: str = Field(description="Operating, locking, or cam/energy-storage mechanism in concise technical English.")
    statusLabel: str = Field(description="Vault status pill in English, e.g. 'In Vault · Ready'.")
    description: str = Field(description="Rich 2-3 sentence museum plaque overview in English.")
    highlights: List[str] = Field(description="4 concise English feature chips matching the 4 Chinese highlights.")
    workbenchTitle: str = Field(description="English Workbench top bar title.")
    workbenchSubtitle: str = Field(description="English Workbench top bar subtitle.")
    cutawayLabel: str = Field(description="Compact English floating cutaway button label.")
    cutawayTitle: str = Field(description="English tooltip for cutaway focus button.")
    searchPlaceholder: str = Field(description="English BOM search input placeholder.")
    firingMilestoneLabel: str = Field(description="Short English label for the 34% release/firing timeline tick.")
    rateOfFire: str = Field(description="Rate of fire or draw-cycle rating in English, e.g. '700 rpm', 'Semi-Auto', or '70 lb · 85% Let-Off'.")
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
        http_options=types.HttpOptions(
            timeout=timeout_sec * 1000,
            api_version="v1beta",
            retry_options=types.HttpRetryOptions(attempts=1),
        )
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

    is_archery = spec.get("catalog", {}).get("category") == "archery"
    context_hint = WEAPON_CONTEXT_HINTS.get(spec["id"])
    context_block = (
        f"\n### Authoritative Engineering & Historical Context Hints:\n{json.dumps(context_hint, ensure_ascii=False, indent=2)}\n"
        if context_hint
        else ""
    )

    if is_archery:
        curator_role = "world-class archery & ballistic mechanisms historian, museum curator, and precision mechanical engineer"
        exhibit_noun = "1:1 3D archery mechanism exhibit"
        act_guidance = """     - Act 1: Historical roots of compound/helical archery, kinetic efficiency & compactness challenges, and design bottlenecks that demanded this platform.
     - Act 2: Chief engineers/inventors, prototyping trials, riser/cam/limb structural optimization, and tournament/field validation.
     - Act 3: Mechanical soul — cam synchronization & let-off or helical coiling geometry, split-limb elastic energy storage, floating sear / anti-dry-fire or drop-away rest kinematics, composites & metallurgy.
     - Act 4: Commercial, hunting & precision adoption, ballistic velocity/energy benchmarks, influence on modern archery, and museum standing."""
        en_domain_note = "authentic archery & precision mechanical engineering English"
    else:
        curator_role = "world-class firearms historian, museum curator, and mechanical ordnance engineer"
        exhibit_noun = "1:1 3D firearm exhibit"
        act_guidance = """     - Act 1: Historical roots, tactical doctrine shift, and operational pain points that demanded this weapon/variant.
     - Act 2: Chief designers, factory/bureau engineering trials, prototype setbacks, and field-feedback redesigns.
     - Act 3: Mechanical soul — locking geometry, gas/recoil kinematics, metallurgy, and optics/ergonomic integration.
     - Act 4: Service adoption, combat evolution, global influence, and historical standing."""
        en_domain_note = "authentic military/ordnance English"

    prompt = f"""You are a {curator_role}.
Generate the complete bilingual (Chinese `storyZh` + English `storyEn`) R&D history story and full English UI metadata (`uiMetaEn`) for this {exhibit_noun} in Digital Armory 3D.

### Ground-Truth Specification (100% authoritative — do NOT invent nonexistent parts):
{json.dumps({
    "id": spec["id"],
    "catalog": spec["catalog"],
    "workbenchMeta": spec["workbenchMeta"],
    "timelinePresets": spec["timelinePresets"],
    "firingPhases": spec["firingPhases"],
    "parts": parts_summary,
}, ensure_ascii=False, indent=2)}
{context_block}
### Strict Quality & Grounding Requirements:
1. **Four-Act R&D Story (`storyZh` & `storyEn`)**:
   - Must contain **exactly 4 chronological acts** (`act1`..`act4`):
{act_guidance}
   - Each act must have 2–3 vivid, historically accurate paragraphs (`paragraphs`) AND a smooth spoken documentary narration script (`audioScript`: ~170–230 Chinese chars for ZH; ~115–160 English words for EN; write natural spoken numbers/units like "三百四十八英尺每秒" or "five hundred feet per second" so TTS pronounces them smoothly without awkward symbols like `×` or `1/4"` raw fractions/symbols in spoken text!).
   - Every `focusPartId` MUST be an exact `id` from `parts` above.
   - Include **exactly 3 `breakthroughs`** (each bound to a distinct, iconic `focusPartId` from `parts`) and **6 chronological `milestones`**.
2. **English UI Metadata (`uiMetaEn`)**:
   - Translate every `timelinePresets` item (preserving exact `id`) and every `firingPhases` item (preserving exact `id`) into crisp, {en_domain_note}.
3. **ZERO CJK IN ENGLISH**:
   - Every single English field (`uiMetaEn` and `storyEn`, including titles, labels, highlights, paragraphs, `focusPartLabel`, and `audioScript`) MUST contain ZERO Chinese/CJK characters or fullwidth CJK punctuation! Translate all Chinese terms into idiomatic English.
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
    is_archery = spec.get("catalog", {}).get("category") == "archery"
    context_hint = WEAPON_CONTEXT_HINTS.get(spec["id"])
    context_block = (
        f"- Engineering Background: {context_hint['mechanicalCore']}\n"
        if context_hint
        else ""
    )
    expert_role = (
        "master archery technician and mechanical CAD engineer"
        if is_archery
        else "master armorer and mechanical CAD engineer"
    )
    cycle_noun = (
        "draw, storage, release & recovery cycle"
        if is_archery
        else "firing cycle"
    )
    kinematic_examples = (
        "(stationary structural datum vs flexing limb, rotating cam, traveling string/cable, dropping rest, or translating trigger sled)"
        if is_archery
        else "(stationary structural datum vs recoiling/rotating/compressing)"
    )

    prompt = f"""You are a {expert_role} narrating an interactive 1:1 3D disassembly & firing/launch simulation for **{spec["catalog"]["nameCn"]} ({spec["catalog"]["modelCode"]})**.

Generate deep, museum-grade Chinese (`zh`) and English (`en`) component descriptions and spoken audio-guide scripts for Batch {batch_idx}/{total_batches} ({len(batch_parts)} components).

### Exhibit Context:
- Caliber / Projectile: {spec["catalog"]["caliber"]}
- Mechanism: {spec["catalog"]["actionMechanism"]}
{context_block}- 7 Cycle Phases: {json.dumps([{"step": ph["stepNum"], "title": ph["title"]} for ph in spec["firingPhases"]], ensure_ascii=False)}
- Disassembly Stages: 0% Assembled, 30% Field Strip, 65% Sub-assembly Strip, 100% Full Armorer Explode.

### Target Components in This Batch (preserve exact `partId` = `id` for all {len(batch_parts)} items):
{json.dumps(batch_parts, ensure_ascii=False, indent=2)}

### Requirements for EVERY component:
1. Return **all {len(batch_parts)} items** with exact `partId`.
2. `calloutLabelEn`: Ultra-concise 2–4 word English 3D viewport callout label (<= 24 characters, e.g. "Bridged Truss Riser", "SwitchWeight-X Cam", "HexCoil Helical Cam").
3. Both `zh` and `en` must be rich, mechanically precise, and grounded strictly in this exhibit's real engineering & the provided `explodeSteps` / `material` / `description`:
   - `roleTag`: Concise functional positioning phrase.
   - `overview`: 2 clear sentences on what this component is and where it mounts.
   - `craftAndMaterial`: Metallurgy / carbon composite / polymer / coating process + why its 3D geometry is shaped that way.
   - `kinematicRole`: Exact behavior during the 7-stage {cycle_noun} {kinematic_examples} AND at what disassembly stage (`explodeSteps` range) it comes off.
   - `designHighlight`: R&D story detail, field reliability lesson, or clever mechanical trade-off behind this specific part.
   - `audioScript`: Engaging, natural spoken narration for TTS when the user clicks this part in 3D (~95–130 Chinese chars for `zh`; ~60–85 English words for `en`). Write dimensions/calibers/fractions in natural spoken form (avoid raw `×`, `/`, `"`, `rad`, or unpronounceable symbols) so TTS reads effortlessly like a Discovery Channel engineer!
4. **ZERO CJK IN ENGLISH**: `calloutLabelEn` and every field inside `en` (`roleTag`, `overview`, `craftAndMaterial`, `kinematicRole`, `designHighlight`, `audioScript`) MUST contain ZERO Chinese/CJK characters or fullwidth CJK punctuation!
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


def _call_story_tts_rate_limited(
    request_fn: Any,
    stop_event: Optional[threading.Event] = None,
) -> Any:
    """Enforce >= 6.5s interval between `STORY_TTS_MODEL` calls (in-process + cross-process)."""
    global _LAST_STORY_TTS_MONO
    with _STORY_TTS_RATE_LOCK:
        if stop_event is not None and stop_event.is_set():
            raise _AbortedByStopEvent()

        _STORY_TTS_STAMP_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_STORY_TTS_STAMP_FILE, "a+", encoding="utf-8") as stamp_fp:
            if fcntl is not None:
                fcntl.flock(stamp_fp.fileno(), fcntl.LOCK_EX)
            try:
                if stop_event is not None and stop_event.is_set():
                    raise _AbortedByStopEvent()

                stamp_fp.seek(0)
                raw_stamp = stamp_fp.read().strip()
                try:
                    last_wall = float(raw_stamp) if raw_stamp else 0.0
                except ValueError:
                    last_wall = 0.0

                wait_mono = (
                    (_LAST_STORY_TTS_MONO + STORY_TTS_MIN_INTERVAL_SEC) - time.monotonic()
                    if _LAST_STORY_TTS_MONO > 0.0
                    else 0.0
                )
                wait_wall = (
                    (last_wall + STORY_TTS_MIN_INTERVAL_SEC) - time.time()
                    if last_wall > 0.0
                    else 0.0
                )
                wait_sec = max(0.0, wait_mono, wait_wall)
                if wait_sec > 0.0:
                    if stop_event is not None:
                        if stop_event.wait(timeout=wait_sec):
                            raise _AbortedByStopEvent()
                    else:
                        time.sleep(wait_sec)

                dispatched = True
                try:
                    return request_fn()
                finally:
                    if dispatched:
                        _LAST_STORY_TTS_MONO = time.monotonic()
                        stamp_fp.seek(0)
                        stamp_fp.truncate()
                        stamp_fp.write(f"{time.time():.6f}\n")
                        stamp_fp.flush()
            finally:
                if fcntl is not None:
                    fcntl.flock(stamp_fp.fileno(), fcntl.LOCK_UN)


def synthesize_tts_mp3(
    client: genai.Client,
    *,
    model: str,
    voice: str,
    style: str,
    text: str,
    out_mp3: Path,
    bitrate: str,
    stop_event: Optional[threading.Event] = None,
) -> int:
    def _do_create() -> Any:
        return client.interactions.create(
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

    try:
        if model == STORY_TTS_MODEL:
            interaction = _call_story_tts_rate_limited(_do_create, stop_event=stop_event)
        else:
            interaction = _do_create()
    except _AbortedByStopEvent:
        raise
    except Exception as exc:
        if is_stop_spending_error(exc):
            raise StopSpending(sanitize_error(exc)) from exc
        raise

    if not interaction.output_audio or not interaction.output_audio.data:
        raise RuntimeError(f"No output_audio returned for {out_mp3.name}")

    wav_bytes = base64.b64decode(interaction.output_audio.data)
    wav_bytes_to_mp3(wav_bytes, out_mp3, bitrate=bitrate)
    return out_mp3.stat().st_size


_BATCH_CREATE_LOCK = threading.Lock()
_LAST_BATCH_CREATE_MONO: float = 0.0


def run_batch_tts_queue(
    all_jobs: list[dict[str, Any]],
    *,
    batch_chunk_size: int = 10,
    batch_concurrency: int = 6,
    poll_interval_sec: float = 6.0,
) -> None:
    """Synthesize individual TTS clips via Gemini Batch API (`client.batches.create`).

    Uses exact `gemini-3.8-flash-tts` + `Charon` + `speech_metadata.style` per item at 50% cost
    and separate Batch API rate limits, persisting MP3s + SHA-256 hashes incrementally as each
    chunk completes. Halts immediately (`StopSpending`) with zero retries on 402/429/quota errors.
    """
    if not all_jobs:
        print("  [BATCH-TTS] All target TTS audio files are already up-to-date!")
        return

    chunks: list[list[dict[str, Any]]] = [
        all_jobs[i : i + max(1, batch_chunk_size)]
        for i in range(0, len(all_jobs), max(1, batch_chunk_size))
    ]
    print(
        f"\n  [BATCH-TTS] Submitting {len(all_jobs)} clips across {len(chunks)} batch jobs "
        f"(chunk_size={batch_chunk_size}, concurrency={batch_concurrency}, model=`{PART_TTS_MODEL}`, voice=`{DEFAULT_VOICE}`)..."
    )

    stop_event = threading.Event()
    save_lock = threading.Lock()
    completed_clips = 0
    completed_batches = 0
    total_bytes = 0
    fatal_errors: list[BaseException] = []

    def _throttled_create_batch(
        client: genai.Client,
        model_name: str,
        inlined_reqs: list[types.InlinedRequest],
        display_name: str,
    ) -> Any:
        global _LAST_BATCH_CREATE_MONO
        with _BATCH_CREATE_LOCK:
            if stop_event.is_set():
                raise _AbortedByStopEvent()
            wait_s = (_LAST_BATCH_CREATE_MONO + 0.75) - time.monotonic()
            if wait_s > 0:
                if stop_event.wait(timeout=wait_s):
                    raise _AbortedByStopEvent()
            try:
                last_net_err: Optional[BaseException] = None
                for net_attempt in range(1, 5):
                    try:
                        created = client.batches.create(
                            model=model_name,
                            src=inlined_reqs,
                            config=types.CreateBatchJobConfig(display_name=display_name),
                        )
                        return created
                    except Exception as create_exc:
                        if is_stop_spending_error(create_exc):
                            raise StopSpending(sanitize_error(create_exc)) from create_exc
                        last_net_err = create_exc
                        if net_attempt < 4:
                            if stop_event.wait(timeout=2.5 * net_attempt):
                                raise _AbortedByStopEvent()
                            client = make_client(timeout_sec=180)
                assert last_net_err is not None
                raise last_net_err
            finally:
                _LAST_BATCH_CREATE_MONO = time.monotonic()

    def _batch_worker(b_idx_chunk: tuple[int, list[dict[str, Any]]]) -> None:
        nonlocal completed_clips, completed_batches, total_bytes
        b_idx, chunk = b_idx_chunk
        if stop_event.is_set():
            return

        client = make_client(timeout_sec=180)
        model_name = chunk[0]["model"]
        wids_label = "-".join(dict.fromkeys(j["weapon_id"] for j in chunk))
        display_name = f"armory-tts-{wids_label}-{b_idx + 1}of{len(chunks)}"

        inlined_reqs = [
            types.InlinedRequest(
                metadata={"id": job["rel_url"]},
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                text=job["text"].strip(),
                                speech_metadata=types.SpeechMetadata(style=job["style"]),
                            )
                        ],
                    )
                ],
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(voice=job["voice"])
                    ),
                ),
            )
            for job in chunk
        ]

        t0 = time.time()
        try:
            batch_job = _throttled_create_batch(
                client, model_name, inlined_reqs, display_name
            )
            print(
                f"    [Batch {b_idx + 1}/{len(chunks)}] Created `{batch_job.name}` "
                f"({len(chunk)} clips: {chunk[0]['rel_url']} .. {chunk[-1]['rel_url']})",
                flush=True,
            )

            while not stop_event.is_set():
                if stop_event.wait(timeout=poll_interval_sec):
                    raise _AbortedByStopEvent()
                cur = None
                last_poll_err: Optional[BaseException] = None
                for poll_attempt in range(1, 6):
                    try:
                        cur = client.batches.get(name=batch_job.name)
                        break
                    except Exception as poll_exc:
                        if is_stop_spending_error(poll_exc):
                            raise StopSpending(sanitize_error(poll_exc)) from poll_exc
                        last_poll_err = poll_exc
                        if poll_attempt < 5:
                            if stop_event.wait(timeout=2.0 * poll_attempt):
                                raise _AbortedByStopEvent()
                            client = make_client(timeout_sec=180)
                if cur is None:
                    assert last_poll_err is not None
                    raise last_poll_err
                st = str(cur.state)
                if any(term in st for term in ("SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED")):
                    if "SUCCEEDED" not in st:
                        err_detail = getattr(cur, "error", None)
                        err_str = f"Batch {batch_job.name} ended in {st}: {err_detail}"
                        if is_stop_spending_error(RuntimeError(err_str)):
                            raise StopSpending(sanitize_error(RuntimeError(err_str)))
                        raise RuntimeError(err_str)

                    resps = (
                        cur.dest.inlined_responses
                        if (cur.dest and cur.dest.inlined_responses)
                        else []
                    )
                    if len(resps) != len(chunk):
                        raise RuntimeError(
                            f"Batch {batch_job.name} returned {len(resps)} responses for {len(chunk)} requests."
                        )

                    chunk_bytes = 0
                    dirty_hash_files: dict[Path, dict[str, str]] = {}
                    for job, item_resp in zip(chunk, resps):
                        if getattr(item_resp, "error", None):
                            item_err_str = f"Item error on {job['rel_url']}: {item_resp.error}"
                            if is_stop_spending_error(RuntimeError(item_err_str)):
                                raise StopSpending(sanitize_error(RuntimeError(item_err_str)))
                            raise RuntimeError(item_err_str)

                        if (
                            not item_resp.response
                            or not item_resp.response.candidates
                            or not item_resp.response.candidates[0].content
                            or not item_resp.response.candidates[0].content.parts
                        ):
                            raise RuntimeError(f"Empty audio candidate on {job['rel_url']}")

                        part0 = item_resp.response.candidates[0].content.parts[0]
                        if not part0.inline_data or not part0.inline_data.data:
                            raise RuntimeError(f"Missing inline_data.data on {job['rel_url']}")

                        raw_audio = part0.inline_data.data
                        wav_bytes = (
                            raw_audio
                            if isinstance(raw_audio, bytes)
                            else base64.b64decode(raw_audio)
                        )
                        wav_bytes_to_mp3(
                            wav_bytes, job["out_file"], bitrate=job["bitrate"]
                        )
                        nbytes = job["out_file"].stat().st_size
                        chunk_bytes += nbytes

                        with save_lock:
                            job["tts_hashes"][job["rel_url"]] = job["sig"]
                            dirty_hash_files[job["hashes_path"]] = job["tts_hashes"]

                    with save_lock:
                        for h_path, h_dict in dirty_hash_files.items():
                            h_path.parent.mkdir(parents=True, exist_ok=True)
                            tmp_h = h_path.with_suffix(".tmp.json")
                            tmp_h.write_text(
                                json.dumps(h_dict, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8",
                            )
                            os.replace(tmp_h, h_path)
                        completed_clips += len(chunk)
                        completed_batches += 1
                        total_bytes += chunk_bytes
                        print(
                            f"    [Batch {completed_batches}/{len(chunks)} DONE in {time.time() - t0:.1f}s] "
                            f"[{completed_clips}/{len(all_jobs)} clips] +{chunk_bytes / 1024:.1f} KB ({wids_label})",
                            flush=True,
                        )
                    return
        except _AbortedByStopEvent:
            return
        except Exception as exc:
            stop_event.set()
            if is_stop_spending_error(exc) and not isinstance(exc, StopSpending):
                exc = StopSpending(sanitize_error(exc))
            with save_lock:
                fatal_errors.append(exc)
                tag = "STOP SPENDING" if isinstance(exc, StopSpending) else "BATCH ERROR"
                print(f"    [{tag}] {sanitize_error(exc)}", file=sys.stderr, flush=True)

    with ThreadPoolExecutor(max_workers=max(1, batch_concurrency)) as pool:
        futs = [pool.submit(_batch_worker, (idx, ch)) for idx, ch in enumerate(chunks)]
        for fut in as_completed(futs):
            fut.result()

    if fatal_errors:
        first = fatal_errors[0]
        if isinstance(first, StopSpending):
            raise first
        sys.exit(f"Batch TTS aborted due to error: {sanitize_error(first)}")

    print(
        f"\n  [BATCH-TTS COMPLETE] Generated {completed_clips}/{len(all_jobs)} MP3 clips "
        f"({total_bytes / (1024 * 1024):.2f} MB total) with `{PART_TTS_MODEL}` (`{DEFAULT_VOICE}`)!"
    )


# ==================== End-to-End Weapon Build Pipeline ====================


def build_weapon(
    weapon_id: str,
    *,
    dry_run: bool = False,
    force_text: bool = False,
    force_audio: bool = False,
    skip_audio: bool = False,
    audio_only: bool = False,
    story_audio_only: bool = False,
    workers: int = 3,
    collect_jobs_out: Optional[list[dict[str, Any]]] = None,
) -> None:
    json_path = NARRATIONS_OUT_DIR / f"{weapon_id}.json"
    hashes_path = TTS_CACHE_DIR / f"{weapon_id}_tts_hashes.json"

    bundle: Optional[dict[str, Any]] = None
    spec: Optional[dict[str, Any]] = None
    parts_list: list[dict[str, Any]] = []
    part_ids_set: set[str] = set()

    if audio_only:
        print(f"\n==================== [{weapon_id.upper()}] Loading verified narration bundle (--audio-only) ====================")
        if not json_path.is_file():
            raise RuntimeError(
                f"--audio-only requires an existing verified narration file: {json_path.relative_to(ROOT_DIR)}"
            )
        existing = json.loads(json_path.read_text(encoding="utf-8"))
        if (
            existing.get("weaponId") != weapon_id
            or not existing.get("parts")
            or len(existing.get("story", {}).get("zh", {}).get("acts", [])) != 4
            or len(existing.get("story", {}).get("en", {}).get("acts", [])) != 4
        ):
            raise RuntimeError(
                f"Existing narration bundle {json_path.relative_to(ROOT_DIR)} failed structural validation."
            )
        bundle = existing
        part_ids_set = set(bundle["parts"].keys())
        print(
            f"  [AUDIO-ONLY] Read-only lock on {json_path.relative_to(ROOT_DIR)} "
            f"({len(part_ids_set)} parts · 4 bilingual acts -> {8 + 2 * len(part_ids_set)} total clips)"
        )
        if dry_run:
            tts_hashes_preview: dict[str, str] = {}
            if hashes_path.is_file():
                try:
                    tts_hashes_preview = json.loads(hashes_path.read_text(encoding="utf-8"))
                except Exception:
                    tts_hashes_preview = {}
            pending_story = 0
            pending_part = 0
            for lang, style in (("zh", STYLE_STORY_ZH), ("en", STYLE_STORY_EN)):
                for act in bundle["story"][lang]["acts"]:
                    rel_url = act["audioUrl"]
                    out_file = ROOT_DIR / "public" / rel_url
                    sig = sha256_hex(f"{STORY_TTS_MODEL}|{DEFAULT_VOICE}|{style}|{act['audioScript']}")
                    if (
                        force_audio
                        or not out_file.is_file()
                        or out_file.stat().st_size <= 1024
                        or tts_hashes_preview.get(rel_url) != sig
                    ):
                        pending_story += 1
            if not story_audio_only:
                for p_entry in bundle["parts"].values():
                    for lang, style in (("zh", STYLE_PART_ZH), ("en", STYLE_PART_EN)):
                        loc_p = p_entry[lang]
                        rel_url = loc_p["audioUrl"]
                        out_file = ROOT_DIR / "public" / rel_url
                        sig = sha256_hex(f"{PART_TTS_MODEL}|{DEFAULT_VOICE}|{style}|{loc_p['audioScript']}")
                        if (
                            force_audio
                            or not out_file.is_file()
                            or out_file.stat().st_size <= 1024
                            or tts_hashes_preview.get(rel_url) != sig
                        ):
                            pending_part += 1
            print(
                f"  [DRY-RUN] Would synthesize {pending_story} story + {pending_part} part = "
                f"{pending_story + pending_part} `{PART_TTS_MODEL}` (`{DEFAULT_VOICE}`) MP3 clips "
                f"(0 text API calls; {json_path.relative_to(ROOT_DIR)} untouched)."
            )
            return
    else:
        print(f"\n==================== [{weapon_id.upper()}] Extracting 1:1 weapon spec ====================")
        spec = dump_weapon_spec(weapon_id)
        parts_list = spec["parts"]
        part_ids_set = {p["id"] for p in parts_list}
        print(
            f"  Loaded {spec['catalog']['nameCn']} · {len(parts_list)} parts · "
            f"{len(spec['firingPhases'])} firing phases"
        )

        if dry_run:
            batch_count = (len(parts_list) + 12) // 13
            story_clips = 8
            part_clips = 0 if story_audio_only else len(parts_list) * 2
            print(
                f"  [DRY-RUN] Would run {1 + batch_count} `{TEXT_MODEL}` structured JSON calls, "
                f"{story_clips} `{STORY_TTS_MODEL}` story clips, and "
                f"{part_clips} `{PART_TTS_MODEL}` part clips -> {json_path.relative_to(ROOT_DIR)}"
            )
            return

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
                    gen_models = bundle.setdefault("generatorModels", {})
                    if (
                        gen_models.get("storyTts") != STORY_TTS_MODEL
                        or gen_models.get("partTts") != PART_TTS_MODEL
                    ):
                        gen_models["storyTts"] = STORY_TTS_MODEL
                        gen_models["partTts"] = PART_TTS_MODEL
                        json_path.write_text(
                            json.dumps(bundle, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8",
                        )
                        print(
                            f"  [SYNC META] Updated generatorModels in {json_path.relative_to(ROOT_DIR)} -> `{PART_TTS_MODEL}`"
                        )
                    print(f"  [CACHE HIT] Reusing existing text bundle: {json_path.relative_to(ROOT_DIR)}")
            except Exception:
                bundle = None

    if bundle is None:
        assert spec is not None
        client = make_client(timeout_sec=360)
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
                    "weapon_id": weapon_id,
                    "rel_url": rel_url,
                    "out_file": out_file,
                    "model": STORY_TTS_MODEL,
                    "voice": DEFAULT_VOICE,
                    "style": style,
                    "text": script_text,
                    "bitrate": "64k",
                    "sig": sig,
                    "hashes_path": hashes_path,
                    "tts_hashes": tts_hashes,
                }
            )

    if not story_audio_only:
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
                        "weapon_id": weapon_id,
                        "rel_url": rel_url,
                        "out_file": out_file,
                        "model": PART_TTS_MODEL,
                        "voice": DEFAULT_VOICE,
                        "style": style,
                        "text": script_text,
                        "bitrate": "64k",
                        "sig": sig,
                        "hashes_path": hashes_path,
                        "tts_hashes": tts_hashes,
                    }
                )

    if not jobs:
        if story_audio_only:
            print(
                f"  [3/3] All 8 four-act story TTS audio files for `{weapon_id}` "
                f"are already up-to-date! (`--story-audio-only`)"
            )
        else:
            print(f"  [3/3] All TTS audio files for `{weapon_id}` are already up-to-date!")
        return

    if collect_jobs_out is not None:
        collect_jobs_out.extend(jobs)
        print(f"  [QUEUED] Queued {len(jobs)} `{PART_TTS_MODEL}` (`{DEFAULT_VOICE}`) clips for `{weapon_id}` into Batch TTS pool.")
        return

    if story_audio_only:
        print(
            f"  [3/3] Synthesizing {len(jobs)} story TTS audio clips "
            f"(workers={workers}, story=`{STORY_TTS_MODEL}`, `--story-audio-only`)..."
        )
    else:
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
                stop_event=stop_event,
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
        except _AbortedByStopEvent:
            return
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
                    stop_event=stop_event,
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
            except _AbortedByStopEvent:
                return
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
        nargs="+",
        choices=ALL_WEAPON_IDS,
        default=["ak15"],
        help="One or more weapon IDs to generate (default: ak15).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate across all weapons sequentially.",
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
        "--audio-only",
        action="store_true",
        help="Read existing verified public/narrations/<id>.json read-only and synthesize ONLY TTS MP3 clips + SHA-256 hashes.",
    )
    parser.add_argument(
        "--story-audio-only",
        action="store_true",
        help="Ensure <weapon_id>.json exists and synthesize ONLY the 8 four-act story MP3s (skip part MP3s).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Concurrent TTS workers for interactive mode (default: 3).",
    )
    parser.add_argument(
        "--batch-tts",
        action="store_true",
        help="Synthesize TTS clips asynchronously via Gemini Batch API (`client.batches.create`) at 50%% cost & separate quota.",
    )
    parser.add_argument(
        "--batch-chunk-size",
        type=int,
        default=10,
        help="Inlined TTS requests per Batch API job (default: 10).",
    )
    parser.add_argument(
        "--batch-concurrency",
        type=int,
        default=6,
        help="Concurrent active Batch API jobs (default: 6).",
    )
    args = parser.parse_args()

    # Prioritize g17 first when building --all so flagship reference voice is always updated first
    all_ordered = ["g17"] + [w for w in ALL_WEAPON_IDS if w != "g17"]
    targets = all_ordered if args.all else list(dict.fromkeys(args.weapon))
    batch_pool: Optional[list[dict[str, Any]]] = [] if (args.batch_tts and not args.dry_run) else None

    for wid in targets:
        try:
            build_weapon(
                wid,
                dry_run=args.dry_run,
                force_text=args.force_text,
                force_audio=args.force_audio,
                skip_audio=args.skip_audio,
                audio_only=args.audio_only,
                story_audio_only=args.story_audio_only,
                workers=args.workers,
                collect_jobs_out=batch_pool,
            )
        except StopSpending as stop_err:
            sys.exit(f"Stopped immediately (quota/rate-limit guardrail): {stop_err}")

    if batch_pool is not None and batch_pool:
        try:
            run_batch_tts_queue(
                batch_pool,
                batch_chunk_size=args.batch_chunk_size,
                batch_concurrency=args.batch_concurrency,
            )
        except StopSpending as stop_err:
            sys.exit(f"Stopped immediately (quota/rate-limit guardrail): {stop_err}")


if __name__ == "__main__":
    main()
