import { useEffect, useState } from 'react';
import { playWorkbenchFoley } from '../engine/audio/mechanicalSoundEngine';
import {
  type StoryDirectorStageSpec,
  useAppStore,
} from '../store/useAppStore';
import { buildCentennialDirectorProfiles } from '../weapons/expansion/centennialProjectors';
import { isWeaponId, type WeaponId } from '../weapons/types';
import {
  getNarrationAudioSnapshot,
  type NarrationTrack,
  playNarrationPlaylist,
  subscribeAudioPlayer,
} from './audioPlayer';
import {
  getLoadedNarrationBundle,
  loadWeaponNarration,
  subscribeWeaponNarrations,
} from './narrationService';
import type { LanguageCode, LocalizedWeaponStory } from './types';

export interface SubtitleCue {
  index: number;
  text: string;
  startRatio: number;
  endRatio: number;
}

export interface DirectorBeatPlan {
  beatKey: string;
  actId: string;
  stageBadgeZh: string;
  stageBadgeEn: string;
  stage: StoryDirectorStageSpec;
}

export type DirectorExhibitCategory = 'firearm' | 'archery' | 'tank' | 'ordnance';

export interface ExhibitDirectorProfile {
  weaponId: WeaponId;
  category: DirectorExhibitCategory;
  /** Verified primary focus part IDs for Acts 1..4 (guarantees non-null focus even if a locale omits focusPartId). */
  actFocusParts: readonly [string, string, string, string];
  /** Verified breakthrough focus part IDs used for Beat B cutaway/sub-strip reveals. */
  breakthroughParts: readonly [string, string];
  fieldStripProgress: number;
  subStripProgress: number;
  firingSlowMo: 0.25 | 0.5 | 1.0;
}

function makeProfile(
  weaponId: WeaponId,
  category: DirectorExhibitCategory,
  actFocusParts: readonly [string, string, string, string],
  breakthroughParts: readonly [string, string]
): ExhibitDirectorProfile {
  return {
    weaponId,
    category,
    actFocusParts,
    breakthroughParts,
    fieldStripProgress: 0.3,
    subStripProgress:
      category === 'tank' ? 0.48 : category === 'firearm' ? 0.52 : 0.5,
    firingSlowMo: 0.25,
  };
}

/**
 * Authoritative 34/34 exhibit documentary choreography table verified against
 * every weapon plugin's real part IDs (covering all 27 firearms, 2 compound
 * archery systems, 4 1:1 MBTs, and the 1:1 30mm GAU-8/A Avenger rotary cannon).
 */
export const EXHIBIT_DIRECTOR_PROFILES: Readonly<
  Record<WeaponId, ExhibitDirectorProfile>
> = {
  ak15: makeProfile(
    'ak15',
    'firearm',
    ['ak_barrel', 'ak_selector', 'ak_bolt_carrier', 'ak_dust_cover'],
    ['ak_dust_cover', 'ak_lower_handguard']
  ),
  m4a1: makeProfile(
    'm4a1',
    'firearm',
    ['m4a1_barrel', 'm4a1_lower_receiver', 'm4a1_bolt_carrier', 'm4a1_ras_upper'],
    ['m4a1_bolt_carrier', 'm4a1_bolt']
  ),
  mp5: makeProfile(
    'mp5',
    'firearm',
    ['mp5_upper_receiver', 'mp5_mag_body', 'mp5_locking_rollers', 'mp5_buttstock'],
    ['mp5_locking_rollers', 'mp5_barrel']
  ),
  g17: makeProfile(
    'g17',
    'firearm',
    ['frame', 'slide', 'trigger_with_bar', 'locking_block'],
    ['trigger_with_bar', 'frame']
  ),
  m82a1: makeProfile(
    'm82a1',
    'firearm',
    ['m82a1_lower_receiver', 'm82a1_accelerator', 'm82a1_barrel', 'm82a1_muzzle_brake'],
    ['m82a1_muzzle_brake', 'm82a1_accelerator']
  ),
  awm: makeProfile(
    'awm',
    'firearm',
    ['awm_chassis_beam', 'awm_bolt_body', 'awm_scope', 'awm_barrel'],
    ['awm_chassis_beam', 'awm_bolt_body']
  ),
  scar: makeProfile(
    'scar',
    'firearm',
    ['scar_upper_receiver', 'scar_buttstock', 'scar_gas_piston', 'scar_barrel_crossbolts'],
    ['scar_gas_piston', 'scar_upper_receiver']
  ),
  deagle: makeProfile(
    'deagle',
    'firearm',
    ['deagle_barrel', 'deagle_slide', 'deagle_bolt', 'deagle_frame'],
    ['deagle_barrel', 'deagle_bolt']
  ),
  aug: makeProfile(
    'aug',
    'firearm',
    ['aug_stock', 'aug_hammer_pack', 'aug_receiver_optic', 'aug_mag_body'],
    ['aug_hammer_pack', 'aug_barrel']
  ),
  p320: makeProfile(
    'p320',
    'firearm',
    ['p320_fcu_chassis', 'p320_takedown_lever', 'p320_manual_safety', 'p320_slide'],
    ['p320_fcu_chassis', 'p320_takedown_lever']
  ),
  p90: makeProfile(
    'p90',
    'firearm',
    ['p90_barrel', 'p90_stock', 'p90_helical_ramp', 'p90_bolt'],
    ['p90_helical_ramp', 'p90_stock']
  ),
  lift33: makeProfile(
    'lift33',
    'archery',
    ['lift33_bowstring', 'lift33_riser', 'lift33_upper_cam', 'lift33_drop_away_rest'],
    ['lift33_riser', 'lift33_upper_cam']
  ),
  r500: makeProfile(
    'r500',
    'archery',
    ['r500_flight_rail', 'r500_left_cam', 'r500_versadrive_screw', 'r500_carbon_bolt'],
    ['r500_left_cam', 'r500_trigger_sled']
  ),
  python: makeProfile(
    'python',
    'firearm',
    ['python_frame', 'python_barrel', 'python_hand', 'python_grip_left'],
    ['python_hand', 'python_mainspring']
  ),
  benellim4: makeProfile(
    'benellim4',
    'firearm',
    ['benellim4_receiver', 'benellim4_argo_pistons', 'benellim4_bolt_head', 'benellim4_telestock'],
    ['benellim4_argo_pistons', 'benellim4_bolt_head']
  ),
  garand: makeProfile(
    'garand',
    'firearm',
    ['garand_receiver', 'garand_barrel', 'garand_op_rod', 'garand_enbloc_clip'],
    ['garand_op_rod', 'garand_op_rod_spring']
  ),
  m249: makeProfile(
    'm249',
    'firearm',
    ['m249_receiver', 'm249_hydraulic_buffer', 'm249_piston_carrier', 'm249_barrel'],
    ['m249_receiver', 'm249_feed_lever']
  ),
  p08: makeProfile(
    'p08',
    'firearm',
    ['p08_frame', 'p08_barrel', 'p08_rear_toggle', 'p08_front_toggle'],
    ['p08_rear_toggle', 'p08_trigger_lever']
  ),
  vector: makeProfile(
    'vector',
    'firearm',
    ['vector_lower_chassis', 'vector_upper_housing', 'vector_slider', 'vector_mag_body'],
    ['vector_slider', 'vector_barrel']
  ),
  g11: makeProfile(
    'g11',
    'firearm',
    ['g11_outer_housing', 'g11_mag_tube', 'g11_rotary_breech', 'g11_clockwork_gears'],
    ['g11_rotary_breech', 'g11_inner_receiver']
  ),
  vss: makeProfile(
    'vss',
    'firearm',
    ['vss_suppressor_tube', 'vss_baffle_stack', 'vss_striker', 'vss_wood_stock'],
    ['vss_baffle_stack', 'vss_bolt']
  ),
  m134: makeProfile(
    'm134',
    'firearm',
    ['m134_drive_motor', 'm134_barrel_cluster', 'm134_cam_track_ring', 'm134_delinker_housing'],
    ['m134_cam_track_ring', 'm134_drive_motor']
  ),
  an94: makeProfile(
    'an94',
    'firearm',
    ['an94_outer_housing', 'an94_pulley_wheel', 'an94_muzzle_brake', 'an94_feed_rammer'],
    ['an94_inner_receiver', 'an94_pulley_wheel']
  ),
  ztz99a: makeProfile(
    'ztz99a',
    'tank',
    ['ztz99a_hull_armor', 'ztz99a_era_wedges', 'ztz99a_autoloader_carousel', 'ztz99a_v12_engine'],
    ['ztz99a_autoloader_carousel', 'ztz99a_optics_citv']
  ),
  m1a2: makeProfile(
    'm1a2',
    'tank',
    ['m1a2_agt1500_turbine', 'm1a2_blast_doors', 'm1a2_composite_armor', 'm1a2_crows_optics'],
    ['m1a2_blast_doors', 'm1a2_agt1500_turbine']
  ),
  leopard2a7: makeProfile(
    'leopard2a7',
    'tank',
    ['leo_hull_shell', 'leo_arrowhead_wedges', 'leo_main_gun', 'leo_mtu_v12'],
    ['leo_arrowhead_wedges', 'leo_main_gun']
  ),
  tiger1: makeProfile(
    'tiger1',
    'tank',
    ['tiger_hull_box', 'tiger_main_gun', 'tiger_interleaved_wheels', 'tiger_maybach_v12'],
    ['tiger_breech_block', 'tiger_interleaved_wheels']
  ),
  winchester1894: makeProfile(
    'winchester1894',
    'firearm',
    ['win94_receiver', 'win94_barrel', 'win94_locking_bolt', 'win94_saddle_ring'],
    ['win94_locking_bolt', 'win94_carrier']
  ),
  rem870: makeProfile(
    'rem870',
    'firearm',
    ['rem870_receiver', 'rem870_action_bars', 'rem870_locking_block', 'rem870_forend'],
    ['rem870_action_bars', 'rem870_locking_block']
  ),
  m1911: makeProfile(
    'm1911',
    'firearm',
    ['m1911_barrel', 'm1911_barrel_link', 'm1911_trigger', 'm1911_slide'],
    ['m1911_barrel_link', 'm1911_trigger']
  ),
  mg42: makeProfile(
    'mg42',
    'firearm',
    ['mg42_receiver_shroud', 'mg42_locking_rollers', 'mg42_barrel_latch', 'mg42_feed_pawl'],
    ['mg42_locking_rollers', 'mg42_muzzle_booster']
  ),
  k98k: makeProfile(
    'k98k',
    'firearm',
    ['k98k_receiver', 'k98k_bolt_body', 'k98k_claw_extractor', 'k98k_stock'],
    ['k98k_claw_extractor', 'k98k_bolt_body']
  ),
  thompson: makeProfile(
    'thompson',
    'firearm',
    ['thompson_receiver', 'thompson_barrel', 'thompson_blish_lock', 'thompson_drum_mag'],
    ['thompson_blish_lock', 'thompson_drum_rotor']
  ),
  gau8: makeProfile(
    'gau8',
    'ordnance',
    ['gau8_barrel_cluster', 'gau8_cam_track', 'gau8_ammo_drum', 'gau8_hydraulic_motors'],
    ['gau8_cam_track', 'gau8_ammo_drum']
  ),
  ...buildCentennialDirectorProfiles(),
};

export function getExhibitDirectorProfile(
  weaponId: WeaponId
): ExhibitDirectorProfile {
  return EXHIBIT_DIRECTOR_PROFILES[weaponId];
}

interface DirectorCategoryBadges {
  pbrFocusZh: string;
  pbrFocusEn: string;
  fieldStripZh: string;
  fieldStripEn: string;
  cutawayMainZh: string;
  cutawayMainEn: string;
  cutawayCoreZh: string;
  cutawayCoreEn: string;
  xrayLockupZh: string;
  xrayLockupEn: string;
  xrayExplodeZh: string;
  xrayExplodeEn: string;
  firingXrayZh: string;
  firingXrayEn: string;
  firingCutawayZh: string;
  firingCutawayEn: string;
}

const DIRECTOR_CATEGORY_BADGES: Readonly<
  Record<DirectorExhibitCategory, DirectorCategoryBadges>
> = {
  firearm: {
    pbrFocusZh: '1:1 真铁特写',
    pbrFocusEn: '1:1 PBR Focus',
    fieldStripZh: '30% 野战快拆',
    fieldStripEn: '30% Field Strip',
    cutawayMainZh: 'C 纵向军械剖视',
    cutawayMainEn: 'Section-Cut (C)',
    cutawayCoreZh: 'C 剖视内构聚焦',
    cutawayCoreEn: 'Cutaway Core',
    xrayLockupZh: 'X-Ray 闭锁透视',
    xrayLockupEn: 'X-Ray Lockup',
    xrayExplodeZh: '52% 核心机构分解',
    xrayExplodeEn: '52% Sub-Strip',
    firingXrayZh: '0.25x 透视慢放击发',
    firingXrayEn: '0.25x X-Ray Firing',
    firingCutawayZh: '0.25x 剖视实弹循环',
    firingCutawayEn: '0.25x Cutaway Firing',
  },
  tank: {
    pbrFocusZh: '1:1 重装外甲特写',
    pbrFocusEn: '1:1 Armor Exterior',
    fieldStripZh: '30% 炮塔装甲分离',
    fieldStripEn: '30% Armor Separation',
    cutawayMainZh: 'C 车体纵剖透视',
    cutawayMainEn: 'Hull Cutaway (C)',
    cutawayCoreZh: 'C 炮闩与战斗室聚焦',
    cutawayCoreEn: 'Turret & Breech Core',
    xrayLockupZh: 'X-Ray 动力与弹舱透视',
    xrayLockupEn: 'X-Ray Powerpack & Ammo',
    xrayExplodeZh: '48% 重装核心分解',
    xrayExplodeEn: '48% Core Strip',
    firingXrayZh: '0.25x 主炮透视击发',
    firingXrayEn: '0.25x X-Ray Main Gun',
    firingCutawayZh: '0.25x 主炮纵剖循环',
    firingCutawayEn: '0.25x Cutaway Main Gun',
  },
  ordnance: {
    pbrFocusZh: '1:1 航炮总成特写',
    pbrFocusEn: '1:1 Rotary Cannon Focus',
    fieldStripZh: '30% 弹鼓与驱动分解',
    fieldStripEn: '30% Drum & Drive Strip',
    cutawayMainZh: 'C 螺旋凸轮纵剖',
    cutawayMainEn: 'Cam Track Cutaway (C)',
    cutawayCoreZh: 'C 七管转膛核心',
    cutawayCoreEn: 'Rotary Breech Core',
    xrayLockupZh: 'X-Ray 无链螺旋供弹',
    xrayLockupEn: 'X-Ray Helical Feed',
    xrayExplodeZh: '50% 液压驱动总成分解',
    xrayExplodeEn: '50% Hydraulic Strip',
    firingXrayZh: '0.25x 七管旋转击发',
    firingXrayEn: '0.25x X-Ray Rotary Fire',
    firingCutawayZh: '0.25x 30mm 剖视循环',
    firingCutawayEn: '0.25x Cutaway 30mm Fire',
  },
  archery: {
    pbrFocusZh: '1:1 复合弓弩特写',
    pbrFocusEn: '1:1 Archery Focus',
    fieldStripZh: '30% 滑轮与弓片分解',
    fieldStripEn: '30% Cam & Limb Strip',
    cutawayMainZh: 'C 内部机构纵剖',
    cutawayMainEn: 'Mechanism Cutaway (C)',
    cutawayCoreZh: 'C 偏心轮与击发核心',
    cutawayCoreEn: 'Cam & Trigger Core',
    xrayLockupZh: 'X-Ray 蓄能弦缆透视',
    xrayLockupEn: 'X-Ray Limbs & Cables',
    xrayExplodeZh: '50% 核心组件分解',
    xrayExplodeEn: '50% Core Assembly',
    firingXrayZh: '0.25x 满弓透视放箭',
    firingXrayEn: '0.25x X-Ray Release',
    firingCutawayZh: '0.25x 剖视蓄能释能',
    firingCutawayEn: '0.25x Cutaway Release',
  },
};

const EN_ABBREV_REGEX =
  /\b(?:U\.S|Obr|Gen|Mk|Dr|Mr|St|No|Mfg|Co|vs|approx|cal|in|mm|cm|kg|ft)\.$/i;

function splitEnglishSentences(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== ';') continue;

    // Skip decimal points such as 7.62, 5.56, .50, .338
    const prevCh = i > 0 ? trimmed[i - 1] : '';
    const nextCh = i + 1 < trimmed.length ? trimmed[i + 1] : '';
    if (ch === '.' && /\d/.test(nextCh)) continue;
    if (ch === '.' && /\d/.test(prevCh) && /\d/.test(nextCh)) continue;

    let endIdx = i + 1;
    while (
      endIdx < trimmed.length &&
      (trimmed[endIdx] === '"' ||
        trimmed[endIdx] === "'" ||
        trimmed[endIdx] === ')' ||
        trimmed[endIdx] === '”')
    ) {
      endIdx++;
    }

    if (endIdx < trimmed.length && !/\s/.test(trimmed[endIdx])) {
      continue;
    }

    const candidate = trimmed.slice(start, endIdx).trim();
    if (!candidate) continue;

    if (ch === '.' && EN_ABBREV_REGEX.test(candidate)) {
      continue;
    }
    // Single initial like "E. Stoner" or "M. Kalashnikov"
    if (ch === '.' && /(?:^|\s)[A-Z]\.$/.test(candidate)) {
      continue;
    }

    parts.push(candidate);
    start = endIdx;
    while (start < trimmed.length && /\s/.test(trimmed[start])) {
      start++;
    }
    i = start - 1;
  }

  const tail = trimmed.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

function splitChineseSentences(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^。！？；]+[。！？；]*[”」』）)]*/g);
  if (!matches) return [trimmed];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Splits a verbatim TTS `audioScript` into proportional `[startRatio, endRatio]`
 * subtitle cues weighted by spoken character/word cadence and punctuation pauses.
 */
export function splitScriptIntoTimedCues(
  audioScript: string,
  lang: LanguageCode
): SubtitleCue[] {
  const clean = audioScript.trim();
  if (!clean) return [];

  const isZh = lang === 'zh' || /[\u4e00-\u9fff]/.test(clean);
  const sentences = isZh
    ? splitChineseSentences(clean)
    : splitEnglishSentences(clean);

  if (sentences.length === 0) return [];

  const weights = sentences.map((sentence) => {
    if (isZh) {
      const charCount = sentence.replace(/\s+/g, '').length;
      const commaCount = (sentence.match(/[，、：]/g) ?? []).length;
      return Math.max(4, charCount + commaCount * 2.4 + 3.8);
    }
    const charCount = sentence.replace(/\s+/g, '').length;
    const commaCount = (sentence.match(/[,:]/g) ?? []).length;
    return Math.max(8, charCount + commaCount * 4.5 + 7.5);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    return [
      {
        index: 0,
        text: clean,
        startRatio: 0,
        endRatio: 1,
      },
    ];
  }

  let acc = 0;
  return sentences.map((text, index) => {
    const startRatio = index === 0 ? 0 : acc / totalWeight;
    acc += weights[index];
    const endRatio = index === sentences.length - 1 ? 1 : acc / totalWeight;
    return {
      index,
      text,
      startRatio,
      endRatio,
    };
  });
}

export function findActiveSubtitleCueIndex(
  cues: readonly SubtitleCue[],
  progress01: number
): number {
  if (cues.length === 0) return -1;
  const p = Math.max(0, Math.min(1, progress01));
  for (let i = 0; i < cues.length; i++) {
    if (p < cues[i].endRatio || i === cues.length - 1) {
      return i;
    }
  }
  return cues.length - 1;
}

/**
 * Pure choreography planner mapping `(weaponId, story, actId, progress)` to an
 * idempotent 3D camera, cutaway, X-Ray, disassembly, or 0.25x firing stage
 * across all 34 exhibits (with verified fallback focusPartIds when any locale omits them).
 */
export function resolveDirectorBeat(
  weaponId: WeaponId,
  story: LocalizedWeaponStory,
  actId: string,
  progress01: number
): DirectorBeatPlan | null {
  const actIndex = story.acts.findIndex((a) => a.id === actId);
  if (actIndex < 0) return null;

  const profile = getExhibitDirectorProfile(weaponId);
  const badges = DIRECTOR_CATEGORY_BADGES[profile.category];
  const act = story.acts[actIndex];
  const clampedActIdx = Math.min(3, Math.max(0, actIndex));
  const focusPart =
    act.focusPartId ?? profile.actFocusParts[clampedActIdx] ?? null;
  const bt0 =
    story.breakthroughs[0]?.focusPartId ??
    profile.breakthroughParts[0] ??
    focusPart;
  const bt1 =
    story.breakthroughs[1]?.focusPartId ??
    profile.breakthroughParts[1] ??
    focusPart;
  const p = Math.max(0, Math.min(1, progress01));

  if (actIndex === 0) {
    if (p < 0.54) {
      return {
        beatKey: `${weaponId}:${actId}:pbr_focus`,
        actId,
        stageBadgeZh: badges.pbrFocusZh,
        stageBadgeEn: badges.pbrFocusEn,
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: false,
          xrayShells: false,
          focusPartId: focusPart,
          cameraPreset: 'iso',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:field_strip`,
      actId,
      stageBadgeZh: badges.fieldStripZh,
      stageBadgeEn: badges.fieldStripEn,
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: profile.fieldStripProgress,
        sectionCut: false,
        xrayShells: false,
        focusPartId: null,
        cameraPreset: 'iso',
      },
    };
  }

  if (actIndex === 1) {
    if (p < 0.54) {
      return {
        beatKey: `${weaponId}:${actId}:cutaway_main`,
        actId,
        stageBadgeZh: badges.cutawayMainZh,
        stageBadgeEn: badges.cutawayMainEn,
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: true,
          xrayShells: false,
          focusPartId: focusPart,
          cameraPreset: 'right',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:cutaway_bt0`,
      actId,
      stageBadgeZh: badges.cutawayCoreZh,
      stageBadgeEn: badges.cutawayCoreEn,
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: 0,
        sectionCut: true,
        xrayShells: false,
        focusPartId: bt0,
        cameraPreset: 'cutaway_focus',
      },
    };
  }

  if (actIndex === 2) {
    if (p < 0.52) {
      return {
        beatKey: `${weaponId}:${actId}:xray_lockup`,
        actId,
        stageBadgeZh: badges.xrayLockupZh,
        stageBadgeEn: badges.xrayLockupEn,
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: false,
          xrayShells: true,
          focusPartId: focusPart,
          cameraPreset: 'iso',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:xray_explode`,
      actId,
      stageBadgeZh: badges.xrayExplodeZh,
      stageBadgeEn: badges.xrayExplodeEn,
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: profile.subStripProgress,
        sectionCut: false,
        xrayShells: true,
        focusPartId: bt1,
        cameraPreset: 'iso',
      },
    };
  }

  // Act 4 (and any subsequent finale act): 0.25x Ultra-Slow Live Firing
  if (p < 0.54) {
    return {
      beatKey: `${weaponId}:${actId}:firing_xray`,
      actId,
      stageBadgeZh: badges.firingXrayZh,
      stageBadgeEn: badges.firingXrayEn,
      stage: {
        weaponId,
        mode: 'firing',
        targetProgress: 0,
        sectionCut: false,
        xrayShells: true,
        focusPartId: null,
        cameraPreset: 'firing_view',
        fireSpeedMultiplier: profile.firingSlowMo,
      },
    };
  }

  return {
    beatKey: `${weaponId}:${actId}:firing_cutaway`,
    actId,
    stageBadgeZh: badges.firingCutawayZh,
    stageBadgeEn: badges.firingCutawayEn,
    stage: {
      weaponId,
      mode: 'firing',
      targetProgress: 0,
      sectionCut: true,
      xrayShells: false,
      focusPartId: null,
      cameraPreset: 'right',
      fireSpeedMultiplier: profile.firingSlowMo,
    },
  };
}

export function buildWeaponStoryTracks(
  weaponId: WeaponId,
  lang: LanguageCode,
  story: LocalizedWeaponStory
): NarrationTrack[] {
  return story.acts.map((act) => ({
    key: `story:${weaponId}:${lang}:${act.id}`,
    relativeUrl: act.audioUrl,
    label: `${act.actNumber} · ${act.title}`,
    kind: 'story',
    actId: act.id,
    fallbackText: act.audioScript,
    lang,
  }));
}

/**
 * One-click entry point to launch a firearm's 4-Act Bilingual Documentary in
 * 3D Director Mode (used by Showcase & Armory CTAs).
 */
export async function launchDirectorDocumentary(
  weaponIdRaw?: string,
  options?: { minimizeDrawer?: boolean; startActIndex?: number }
): Promise<void> {
  const store = useAppStore.getState();
  const weaponId: WeaponId = isWeaponId(weaponIdRaw)
    ? weaponIdRaw
    : store.activeWeaponId;
  const minimize = options?.minimizeDrawer ?? true;
  const startIdx = options?.startActIndex ?? 0;

  store.enterWorkbench(weaponId, 'explode');
  useAppStore.setState({
    storyOpen: true,
    storyMinimized: minimize,
    storyDirectorMode: true,
  });

  const bundle = await loadWeaponNarration(weaponId);
  const live = useAppStore.getState();
  if (!bundle || live.activeWeaponId !== weaponId) return;

  const localizedStory = bundle.story[live.lang];
  if (!localizedStory || localizedStory.acts.length === 0) return;

  const tracks = buildWeaponStoryTracks(weaponId, live.lang, localizedStory);
  playNarrationPlaylist(tracks, startIdx);
}

let activeDirectorBeat: DirectorBeatPlan | null = null;
const beatListeners = new Set<() => void>();

function setActiveDirectorBeat(next: DirectorBeatPlan | null): void {
  if (activeDirectorBeat?.beatKey === next?.beatKey) return;
  activeDirectorBeat = next;
  beatListeners.forEach((fn) => fn());
}

export function useActiveDirectorBeat(): DirectorBeatPlan | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onBeat = () => setTick((n) => n + 1);
    beatListeners.add(onBeat);
    return () => {
      beatListeners.delete(onBeat);
    };
  }, []);
  return activeDirectorBeat;
}

/**
 * Root non-visual controller that orchestrates 3D camera flights, longitudinal
 * section-cut (`C`), X-Ray (`X`), staged explode, and `0.25x` slow-motion firing
 * in lockstep with the 4-Act narration audio timeline.
 */
export function useStoryDirectorController(): void {
  useEffect(() => {
    let lastAppliedBeatKey: string | null = null;

    const evaluateDirector = () => {
      const state = useAppStore.getState();
      const audio = getNarrationAudioSnapshot();

      if (
        !state.storyDirectorMode ||
        !state.storyOpen ||
        state.screen === 'showcase' ||
        audio.activeKind !== 'story' ||
        !audio.activeKey ||
        !audio.activeActId
      ) {
        if (!audio.isPlaying && !audio.isLoading) {
          lastAppliedBeatKey = null;
          setActiveDirectorBeat(null);
        }
        return;
      }

      // Track key format: `story:<weaponId>:<lang>:<actId>`
      const segments = audio.activeKey.split(':');
      const keyWeapon = segments[1];
      const keyLang = segments[2] as LanguageCode | undefined;
      if (!isWeaponId(keyWeapon)) return;

      const bundle = getLoadedNarrationBundle(keyWeapon);
      if (!bundle) {
        void loadWeaponNarration(keyWeapon);
        return;
      }

      const lang: LanguageCode = keyLang === 'en' ? 'en' : state.lang;
      const localizedStory = bundle.story[lang];
      if (!localizedStory) return;

      const plan = resolveDirectorBeat(
        keyWeapon,
        localizedStory,
        audio.activeActId,
        audio.progress
      );
      if (!plan) return;

      setActiveDirectorBeat(plan);

      if (
        (audio.isPlaying || audio.isLoading) &&
        plan.beatKey !== lastAppliedBeatKey
      ) {
        lastAppliedBeatKey = plan.beatKey;
        playWorkbenchFoley('director_cue');
        state.applyStoryDirectorStage(plan.stage);
      }
    };

    const unsubAudio = subscribeAudioPlayer(evaluateDirector);
    const unsubNarrations = subscribeWeaponNarrations(evaluateDirector);

    let prevDirectorEnabled = useAppStore.getState().storyDirectorMode;
    const unsubStore = useAppStore.subscribe((s) => {
      if (s.storyDirectorMode !== prevDirectorEnabled) {
        prevDirectorEnabled = s.storyDirectorMode;
        if (s.storyDirectorMode) {
          lastAppliedBeatKey = null;
          evaluateDirector();
        } else {
          setActiveDirectorBeat(null);
        }
      }
    });

    return () => {
      unsubAudio();
      unsubNarrations();
      unsubStore();
    };
  }, []);
}
