import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { CENTENNIAL_BLUEPRINTS } from '../../weapons/expansion/centennialCatalog';
import { buildCentennialInteractionSpecs } from '../../weapons/expansion/centennialProjectors';
import type { CentennialWeaponBlueprint } from '../../weapons/expansion/centennialTypes';
import { WEAPON_IDS, type WeaponId } from '../../weapons/types';
import {
  playPressCheckSpringSound,
  playSelectorDetentSound,
  playTriggerDryBlockSound,
  playTriggerResetSound,
} from '../audio/mechanicalSoundEngine';
import { playbackClock } from '../clock/playbackClock';
import { clamp01 } from '../kinematics/math';
import {
  isArcheryWeapon,
  isHeavyScaleWeapon,
  isOrdnanceWeapon,
  isTankWeapon,
} from '../physics/armoryPhysics';

export type FireSelectorMode = 'safe' | 'semi' | 'auto';

export interface SelectorModeTooltipMeta {
  mode: FireSelectorMode;
  code: string;
  labelZh: string;
  labelEn: string;
  tooltipZh: string;
  tooltipEn: string;
}

export interface WeaponFireControlProfile {
  weaponId: WeaponId;
  supportedModes: readonly FireSelectorMode[];
  mechanismSummaryZh: string;
  mechanismSummaryEn: string;
  modes: Partial<Record<FireSelectorMode, SelectorModeTooltipMeta>>;
}

const SELECT_FIRE_MODES: readonly FireSelectorMode[] = [
  'safe',
  'semi',
  'auto',
] as const;

const SEMI_ONLY_MODES: readonly FireSelectorMode[] = ['safe', 'semi'] as const;

const OPEN_BOLT_AUTO_MODES: readonly FireSelectorMode[] = [
  'safe',
  'auto',
] as const;

function resolveCentennialSelectorModes(
  bp: CentennialWeaponBlueprint
): readonly FireSelectorMode[] {
  if (
    bp.kinematicLaw === 'rotary_gatling' ||
    bp.archetype === 'lmg_belt' ||
    bp.archetype === 'lmg_pan' ||
    bp.archetype === 'heavy_mg' ||
    bp.archetype === 'aa_autocannon' ||
    (bp.kinematicLaw === 'open_bolt_blowback' && bp.id !== 'ppsh41' && bp.id !== 'uzi' && bp.id !== 'sten' && bp.id !== 'mac10')
  ) {
    return OPEN_BOLT_AUTO_MODES;
  }
  if (
    bp.category === 'pistol' ||
    bp.category === 'archery' ||
    bp.category === 'armor' ||
    bp.category === 'sniper' ||
    bp.archetype === 'howitzer' ||
    bp.kinematicLaw === 'bolt_action' ||
    bp.kinematicLaw === 'pump_action' ||
    bp.kinematicLaw === 'lever_action' ||
    bp.kinematicLaw === 'revolver_cylinder' ||
    bp.id === 'sks' ||
    bp.id === 'spas12' ||
    bp.id === 'saiga12'
  ) {
    return SEMI_ONLY_MODES;
  }
  return SELECT_FIRE_MODES;
}

const CENTENNIAL_SELECTOR_CAPABILITIES = Object.fromEntries(
  CENTENNIAL_BLUEPRINTS.map((bp) => [bp.id, resolveCentennialSelectorModes(bp)])
) as Record<(typeof CENTENNIAL_BLUEPRINTS)[number]['id'], readonly FireSelectorMode[]>;

const CENTENNIAL_FIRE_CONTROL_PROFILES = Object.fromEntries(
  CENTENNIAL_BLUEPRINTS.map((bp) => {
    const supportedModes = resolveCentennialSelectorModes(bp);
    const modes: Partial<Record<FireSelectorMode, SelectorModeTooltipMeta>> = {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '保险锁止 (SAFE)',
        labelEn: 'SAFE',
        tooltipZh: `机械锁定 ${bp.shortLabel} 扳机或阻铁连杆，阻断击发行程确保勤务安全。`,
        tooltipEn: `Mechanically blocks the ${bp.shortLabel} trigger or sear linkage to prevent discharge.`,
      },
    };
    if (supportedModes.includes('semi')) {
      modes.semi = {
        mode: 'semi',
        code: 'SEMI',
        labelZh: '单发模式 (SEMI)',
        labelEn: 'SEMI',
        tooltipZh: `每次扣压扳机执行单循环击发与阻铁复位（${bp.caliberLabel}）。`,
        tooltipEn: `Fires one controlled cycle per trigger pull with clean disconnector reset (${bp.caliberLabel}).`,
      };
    }
    if (supportedModes.includes('auto')) {
      modes.auto = {
        mode: 'auto',
        code: 'AUTO',
        labelZh: `连发模式 (${bp.rateOfFireRpm} RPM)`,
        labelEn: `AUTO (${bp.rateOfFireRpm} RPM)`,
        tooltipZh: `解脱单发阻铁限制，保持 ${bp.rateOfFireLabelZh} 持续自动循环火力。`,
        tooltipEn: `Bypasses the disconnector for continuous automatic cycling (${bp.rateOfFireLabelEn}).`,
      };
    }
    return [
      bp.id,
      {
        weaponId: bp.id as WeaponId,
        supportedModes,
        mechanismSummaryZh: bp.actionMechanismZh,
        mechanismSummaryEn: bp.actionMechanismEn,
        modes,
      } satisfies WeaponFireControlProfile,
    ];
  })
) as Record<(typeof CENTENNIAL_BLUEPRINTS)[number]['id'], WeaponFireControlProfile>;

const CENTENNIAL_INTERACTION = buildCentennialInteractionSpecs();

const WEAPON_SELECTOR_CAPABILITIES: Record<
  WeaponId,
  readonly FireSelectorMode[]
> = {
  // Select-fire military assault rifles, SMGs & PDWs
  ak15: SELECT_FIRE_MODES,
  m4a1: SELECT_FIRE_MODES,
  mp5: SELECT_FIRE_MODES,
  scar: SELECT_FIRE_MODES,
  aug: SELECT_FIRE_MODES,
  p90: SELECT_FIRE_MODES,
  vector: SELECT_FIRE_MODES,
  g11: SELECT_FIRE_MODES,
  vss: SELECT_FIRE_MODES,
  an94: SELECT_FIRE_MODES,
  // Pure full-auto machine guns (open-bolt SAW & electric rotary Gatling: SAFE / AUTO)
  m249: OPEN_BOLT_AUTO_MODES,
  m134: OPEN_BOLT_AUTO_MODES,
  // Semi-automatic / bolt-action / compound archery systems
  g17: SEMI_ONLY_MODES,
  p320: SEMI_ONLY_MODES,
  deagle: SEMI_ONLY_MODES,
  m82a1: SEMI_ONLY_MODES,
  awm: SEMI_ONLY_MODES,
  lift33: SEMI_ONLY_MODES,
  r500: SEMI_ONLY_MODES,
  python: SEMI_ONLY_MODES,
  benellim4: SEMI_ONLY_MODES,
  garand: SEMI_ONLY_MODES,
  p08: SEMI_ONLY_MODES,
  // 1:1 Heavy Armor Main Battle Tank main cannons (SAFE / FIRE single-shot cycle)
  ztz99a: SEMI_ONLY_MODES,
  m1a2: SEMI_ONLY_MODES,
  leopard2a7: SEMI_ONLY_MODES,
  tiger1: SEMI_ONLY_MODES,
  winchester1894: SEMI_ONLY_MODES,
  rem870: SEMI_ONLY_MODES,
  m1911: SEMI_ONLY_MODES,
  mg42: OPEN_BOLT_AUTO_MODES,
  k98k: SEMI_ONLY_MODES,
  thompson: SELECT_FIRE_MODES,
  gau8: OPEN_BOLT_AUTO_MODES,
  ...CENTENNIAL_SELECTOR_CAPABILITIES,
};

/**
 * Bilingual authentic Fire-Control Group (FCG) selector documentation per firearm.
 */
export const WEAPON_FIRE_CONTROL_PROFILES: Record<
  WeaponId,
  WeaponFireControlProfile
> = {
  ak15: {
    weaponId: 'ak15',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: '卡拉什尼科夫双钩主阻铁 + 中央单发阻铁 + 不到位保险',
    mechanismSummaryEn:
      'Kalashnikov Double-Hook Primary Sear + Disconnector + Rate/Safety Autosear',
    modes: {
      safe: {
        mode: 'safe',
        code: 'ПР',
        labelZh: '保险 (ПР)',
        labelEn: 'SAFE (ПР)',
        tooltipZh: '快慢机轴扇形凸轮死锁双钩扳机尾翼并封闭拉机柄槽。',
        tooltipEn:
          'Selector sector blocks both trigger hooks and seals receiver charging slot.',
      },
      semi: {
        mode: 'semi',
        code: 'ОД',
        labelZh: '半自动 (ОД)',
        labelEn: 'SEMI (ОД)',
        tooltipZh:
          '单发射击：枪机框后坐压倒击锤由中央单发阻铁截获，须松开扳机完成复位交接。',
        tooltipEn:
          'Single shot: disconnector catches recocked hammer until trigger is released to reset.',
      },
      auto: {
        mode: 'auto',
        code: 'АВ',
        labelZh: '全自动 (АВ)',
        labelEn: 'AUTO (АВ)',
        tooltipZh:
          '快慢机压下中央单发阻铁，仅由不到位保险在枪机闭锁瞬间解脱击锤实现连发。',
        tooltipEn:
          'Selector holds back disconnector; autosear trips hammer immediately upon bolt lockup.',
      },
    },
  },
  m4a1: {
    weaponId: 'm4a1',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: '斯通纳 AR-15 三档旋转快慢机 + 单发阻铁 + 连发阻铁',
    mechanismSummaryEn:
      'Stoner M4A1 3-Position Rotary Selector + Disconnector + Auto Sear',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '保险 (SAFE)',
        labelEn: 'SAFE',
        tooltipZh: '快慢机圆柱凸轮顶住扳机后端上方，机械阻断扳机抬起。',
        tooltipEn:
          'Selector cam drum rests directly over rear trigger tail, preventing sear release.',
      },
      semi: {
        mode: 'semi',
        code: 'SEMI',
        labelZh: '半自动 (SEMI)',
        labelEn: 'SEMI',
        tooltipZh:
          '旋转 90° 解锁扳机，弹簧加载单发阻铁勾住后倒击锤，松开扳机听见清脆复位声。',
        tooltipEn:
          '90° throw enables spring-loaded disconnector hook; release trigger for tactile sear reset.',
      },
      auto: {
        mode: 'auto',
        code: 'AUTO',
        labelZh: '全自动 (AUTO)',
        labelEn: 'AUTO',
        tooltipZh:
          '旋转 180° 压低单发阻铁尾翼并翘起连发阻铁，枪机框复进到位踢开连发阻铁持续击发。',
        tooltipEn:
          '180° throw depresses disconnector tail and engages auto sear tripped by BCG battery tail.',
      },
    },
  },
  mp5: {
    weaponId: 'mp5',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: 'HK 模块化发射机盒（SEF / 海军图标三档快慢机）',
    mechanismSummaryEn:
      'HK Modular Trigger Pack (0-1-F Ambidextrous Pictogram Selector)',
    modes: {
      safe: {
        mode: 'safe',
        code: '0',
        labelZh: '保险 (0)',
        labelEn: 'SAFE (0)',
        tooltipZh: '快慢机轴实心面托住扳机杠杆，锁死击锤释放路径。',
        tooltipEn:
          'Solid selector axle profile blocks trigger lever upward travel.',
      },
      semi: {
        mode: 'semi',
        code: '1',
        labelZh: '半自动 (1)',
        labelEn: 'SEMI (1)',
        tooltipZh:
          '捉钩式单发阻铁在每次滚柱开锁后移位脱钩，需松开扳机重新啮合击锤缺口。',
        tooltipEn:
          'Spring-loaded catch sear disconnects after shot; release trigger to re-engage hammer notch.',
      },
      auto: {
        mode: 'auto',
        code: 'F',
        labelZh: '全自动 (F)',
        labelEn: 'AUTO (F)',
        tooltipZh:
          '800发/分滚柱延迟连发：枪机框闭锁前压下自动解脱杆释放击锤。',
        tooltipEn:
          '800 RPM roller-delayed cyclic fire governed by bolt-carrier release lever.',
      },
    },
  },
  scar: {
    weaponId: 'scar',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: 'FN SCAR 双侧短行程快慢机 (S / 1 / A)',
    mechanismSummaryEn: 'FN SCAR Ambidextrous Short-Throw Selector (S / 1 / A)',
    modes: {
      safe: {
        mode: 'safe',
        code: 'S',
        labelZh: '保险 (S)',
        labelEn: 'SAFE (S)',
        tooltipZh: '双侧拨杆置于水平 S 档，机械锁止扳机尾端。',
        tooltipEn:
          'Ambidextrous lever in S position mechanically blocks trigger bar.',
      },
      semi: {
        mode: 'semi',
        code: '1',
        labelZh: '半自动 (1)',
        labelEn: 'SEMI (1)',
        tooltipZh: '45° 拨入 1 档，单发阻铁拦截后坐击锤，松手完成二道火复位。',
        tooltipEn:
          '1-round semi-automatic mode with crisp disconnector capture and tactile reset.',
      },
      auto: {
        mode: 'auto',
        code: 'A',
        labelZh: '全自动 (A)',
        labelEn: 'AUTO (A)',
        tooltipZh:
          '拨入 A 档激活不到位连发阻铁，配合短行程活塞实现约 625 RPM 稳定连发。',
        tooltipEn:
          'Full-automatic 625 RPM short-stroke gas-piston cyclic fire.',
      },
    },
  },
  aug: {
    weaponId: 'aug',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: '斯太尔横闩保险 + 渐进式双行程扳机连杆与聚合物击锤包',
    mechanismSummaryEn:
      'Steyr Cross-Bolt Safety + Progressive Two-Stage Trigger & Polymer Hammer Pack',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '横闩保险 (SAFE)',
        labelEn: 'CROSS-BOLT SAFE',
        tooltipZh: '握把上方横向方柱保险推入白点锁死位，阻断双推拉连杆后移。',
        tooltipEn:
          'Cross-bolt push-button safety mechanically locks dual trigger transfer bars.',
      },
      semi: {
        mode: 'semi',
        code: 'SEMI',
        labelZh: '一阶单发 (SEMI)',
        labelEn: 'STAGE-1 SEMI',
        tooltipZh:
          '推开红点保险并扣至第一行程止点：聚合物单发阻铁实现单发，松扳机复位。',
        tooltipEn:
          'First-stage progressive pull fires a single round; release trigger to reset.',
      },
      auto: {
        mode: 'auto',
        code: 'AUTO',
        labelZh: '二阶连发 (AUTO)',
        labelEn: 'STAGE-2 AUTO',
        tooltipZh:
          '突破第一行程壁垒扣到底：越过单发阻铁进入全自动短行程活塞连发。',
        tooltipEn:
          'Pull past progressive second-stage detent for sustained 680 RPM cyclic fire.',
      },
    },
  },
  p90: {
    weaponId: 'p90',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: 'FN P90 扳机下置圆盘三档快慢机 (S / 1 / A)',
    mechanismSummaryEn:
      'FN P90 Under-Trigger Rotary Dial Selector (S / 1 / A)',
    modes: {
      safe: {
        mode: 'safe',
        code: 'S',
        labelZh: '保险 (S)',
        labelEn: 'SAFE (S)',
        tooltipZh: '圆盘旋至 S 档限制扳机行程，完全阻断平移连杆后移。',
        tooltipEn:
          'Rotary dial in S limits trigger travel, mechanically locking transfer bars.',
      },
      semi: {
        mode: 'semi',
        code: '1',
        labelZh: '半自动 (1)',
        labelEn: 'SEMI (1)',
        tooltipZh: '圆盘 1 档限位扳机仅能走完半自动行程，每扣一发并需松手复位。',
        tooltipEn:
          'Dial in 1 restricts trigger overtravel to semi-automatic single-shot release.',
      },
      auto: {
        mode: 'auto',
        code: 'A',
        labelZh: '全自动 (A)',
        labelEn: 'AUTO (A)',
        tooltipZh:
          '圆盘 A 档开放全行程渐进扣压，驱动 900 RPM 自由枪机高速连发。',
        tooltipEn:
          'Dial in A unlocks full progressive stroke for 900 RPM 5.7×28mm cyclic fire.',
      },
    },
  },
  g17: {
    weaponId: 'g17',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'Glock Safe-Action® 三重被动自动保险（无外置手动拇指快慢机）',
    mechanismSummaryEn:
      'Glock Safe-Action® Three-Passive-Safety Striker System (No External Manual Lever)',
    modes: {
      safe: {
        mode: 'safe',
        code: 'BLADE LOCK',
        labelZh: '工作台保险片锁止 (SAFE)',
        labelEn: 'TRIGGER BLADE SAFE',
        tooltipZh:
          '教学状态：模拟手指未压下扳机中央铰接保险片（Safe-Action 第一重保险），保险片尾齿顶死底把阻止扳机与十字连杆后移。',
        tooltipEn:
          'Bench FCG inspection: simulates unpressed center Trigger Safety Blade blocking trigger shoe rearward travel against the frame.',
      },
      semi: {
        mode: 'semi',
        code: 'SEMI',
        labelZh: 'Safe-Action 实弹半自动',
        labelEn: 'SAFE-ACTION SEMI',
        tooltipZh:
          '压平中央保险片后后拉连杆：依次顶开击针保险柱并沿阻铁片斜面下潜释放击针；套筒后坐推开阻铁片断路，松手清脆复位。',
        tooltipEn:
          'Depresses center blade, lifts firing-pin safety, and cams cruciform down the connector; release trigger for short tactile reset.',
      },
    },
  },
  p320: {
    weaponId: 'p320',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh: 'SIG M17/P320 模块化 FCU 不锈钢火控底座 + 双侧拇指保险',
    mechanismSummaryEn:
      'SIG M17/P320 Modular Stainless FCU Striker Group + Ambi Manual Safety',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '手动拇指保险 (SAFE)',
        labelEn: 'MANUAL SAFE',
        tooltipZh: '上拨 M17 双侧手动保险杆锁止扳机连杆，禁止阻铁下沉。',
        tooltipEn:
          'Engages ambidextrous manual thumb safety locking the trigger bar.',
      },
      semi: {
        mode: 'semi',
        code: 'SEMI',
        labelZh: '半自动击针平移 (SEMI)',
        labelEn: 'STRIKER SEMI',
        tooltipZh:
          '全预压击针清脆二道火释放，套筒复进后松开扳机完成连杆上抬复位。',
        tooltipEn:
          'Crisp pre-cocked striker break; release trigger shoe to re-engage sear notch.',
      },
    },
  },
  deagle: {
    weaponId: 'deagle',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh: '沙漠之鹰套筒双侧鼓轮保险 + 单动外露击锤导气自动机',
    mechanismSummaryEn:
      'Desert Eagle Slide-Mounted Ambi Drum Safety + Gas-Operated Single-Action Hammer',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '套筒鼓轮保险 (SAFE)',
        labelEn: 'DRUM SAFE',
        tooltipZh: '下拨套筒双侧保险杆：鼓轮锁死浮游击针并断开扳机连杆啮合。',
        tooltipEn:
          'Slide drum safety blocks firing pin and disconnects trigger bar from sear.',
      },
      semi: {
        mode: 'semi',
        code: 'SEMI',
        labelZh: '.50 AE 单动半自动',
        labelEn: '.50 AE SEMI',
        tooltipZh:
          '单动击锤干脆解脱，膛口导气活塞驱动多突笋旋转枪机完成自动装填，松手复位。',
        tooltipEn:
          'Crisp single-action hammer break cycling gas piston & rotary bolt; release to reset.',
      },
    },
  },
  m82a1: {
    weaponId: 'm82a1',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh: '巴雷特 AR 构型双位拇指保险 + 枪管短后坐平移击针火控',
    mechanismSummaryEn:
      'Barrett AR-Pattern Thumb Safety + Short-Recoil Linear Striker FCG',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '保险 (SAFE)',
        labelEn: 'SAFE',
        tooltipZh: '水平拨至 SAFE 锁死扳机舌，防止线性击锤意外解脱。',
        tooltipEn:
          'Thumb selector horizontally locks trigger shoe against linear striker sear.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '.50 BMG 半自动 (FIRE)',
        labelEn: '.50 BMG SEMI',
        tooltipZh:
          '每扣动一次激发一发 12.7×99mm 重弹，加速子辅助开锁复进后须松手复位阻铁。',
        tooltipEn:
          'Fires one 12.7×99mm round per pull via short-recoil accelerator; release to reset.',
      },
    },
  },
  awm: {
    weaponId: 'awm',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh: 'AI 三位枪机尾盖击针保险 + 精密两道火可调狙击扳机',
    mechanismSummaryEn:
      'AI Bolt-Shroud Striker Safety + Two-Stage Adjustable Match Trigger',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '击针尾盖锁止 (SAFE)',
        labelEn: 'SHROUD SAFE',
        tooltipZh: '枪机尾盖后拨机械顶住击针体并锁止 60° 拉机柄。',
        tooltipEn:
          'Bolt-shroud lever physically retracts and blocks striker & 60° bolt handle.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '两道火单发射击 (FIRE)',
        labelEn: 'MATCH SINGLE',
        tooltipZh:
          '清晰一段空程后抵住玻璃般清脆的二道火壁垒，击发后完成 60° 旋转拉栓抛壳上膛。',
        tooltipEn:
          'Smooth first-stage take-up into glass-rod sear break followed by 60° bolt cycle.',
      },
    },
  },
  lift33: {
    weaponId: 'lift33',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'SwitchWeight-X 85% 省力谷闭锁 + D-Loop 防误触撒放保险',
    mechanismSummaryEn:
      'SwitchWeight-X Binary-Cam 85% Let-Off Valley + D-Loop Release Safety Lock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '撒放安全锁定 (SAFE)',
        labelEn: 'RELEASE SAFE',
        tooltipZh:
          '物理锁住机械卡钳撒放器扳机销，确保搭箭拉弦过程不发生走火或空放。',
        tooltipEn:
          'Locks caliper release sear jaw to prevent premature draw discharge or dry-fire.',
      },
      semi: {
        mode: 'semi',
        code: 'DRAW',
        labelZh: '拉弦撒放实射 (SEMI)',
        labelEn: 'LIVE RELEASE',
        tooltipZh:
          '拖拽主弦/D环进入满弓 85% 省力谷或按住扳机完成 571.5 mm 做功行程推射，松手复位。',
        tooltipEn:
          'Draw string or hold trigger through 85% let-off valley to loose the 400 gr carbon arrow.',
      },
    },
  },
  r500: {
    weaponId: 'r500',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'Trac-Trigger 悬浮自动保险 + 铜制半月尾扣防空放阻块 (ADF)',
    mechanismSummaryEn:
      'Trac-Trigger Automatic Tang Safety + Anti-Dry-Fire (ADF) Pawl Lock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '自动保险 + ADF 自锁 (SAFE)',
        labelEn: 'AUTO SAFE / ADF',
        tooltipZh:
          '悬浮滑座推挂弓弦瞬间自动顶出手动保险，未装实箭时铜色 ADF 阻铁亦刚性锁死扳机。',
        tooltipEn:
          'Engages automatic tang safety upon string latch; copper ADF pawl physically blocks trigger without a seated bolt.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '500 FPS 悬轨单发 (SEMI)',
        labelEn: 'SINGLE RELEASE',
        tooltipZh:
          '381mm 零摩擦悬空做功发射 400 gr 碳纤维弩箭，发射后自动锁回防空放安全态。',
        tooltipEn:
          'Crisp frictionless floating-sled sear release launching the 400 gr bolt at 500 FPS.',
      },
    },
  },
  python: {
    weaponId: 'python',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'Colt 回弹安全杠杆被动跌落保险 + 手工精调双动/单动 V 簧火控',
    mechanismSummaryEn:
      'Colt Rebound-Lever Passive Drop Safety + Hand-Tuned DA/SA V-Mainspring Lockwork',
    modes: {
      safe: {
        mode: 'safe',
        code: 'REBOUND SAFE',
        labelZh: '回弹安全杠杆锁止 (SAFE)',
        labelEn: 'REBOUND SAFE',
        tooltipZh:
          '工作台安全态：未扣扳机时回弹安全杠杆前臂刚性垫在击锤安全台肩下方，物理阻隔击锤触碰框内浮动击针。',
        tooltipEn:
          'Rebound lever cam blocks the hammer safety stud unless the trigger is deliberately pulled, isolating the inertial firing pin.',
      },
      semi: {
        mode: 'semi',
        code: 'DA / SA',
        labelZh: '双动分度单发 (DA/SA)',
        labelEn: 'DA / SA FIRE',
        tooltipZh:
          '丝滑扣动扳机驱动双阶拨爪（Hand）将 6 发弹巢旋转 60° 并由止转笋提前满锁，折叠 V 型主簧释放击锤激发 .357 马格南。',
        tooltipEn:
          'Silky pull indexes the 6-shot cylinder 60° into zero-play bolt lockup before the V-mainspring drops the hammer.',
      },
    },
  },
  benellim4: {
    weaponId: 'benellim4',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '护圈加大三角形横推保险栓 + 单发阻铁与托弹板放弹联动火控',
    mechanismSummaryEn:
      'Oversized Triangular Cross-Bolt Safety + Disconnector & Cartridge-Drop FCG',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '横栓推右锁止 (SAFE)',
        labelEn: 'CROSS-BOLT SAFE',
        tooltipZh:
          '扳机护圈后上方三角形保险钮向右推入隐藏红圈，横栓圆柱面直接锁死扳机舌上抬行程。',
        tooltipEn:
          'Triangular cross-bolt button pushed right hides the crimson band and physically blocks upward trigger travel.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '12号双活塞半自动 (SEMI)',
        labelEn: '12GA SEMI',
        tooltipZh:
          '向左推保险露出鲜红火圈：每扣一发激发 9 粒 00 号鹿弹并释放管仓次发滑上升降托弹板，松手完成单发阻铁复位。',
        tooltipEn:
          'Push safety left exposing red fire band; ARGO twin pistons cycle the rotating bolt and shell elevator per pull.',
      },
    },
  },
  garand: {
    weaponId: 'garand',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '扳机护圈前缘冬季勾压保险片 + 双钩二道火半自动军用火控',
    mechanismSummaryEn:
      'Trigger-Guard Front Rocker Safety + Two-Stage Double-Hook Service Rifle FCG',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '护圈拨后锁锤 (SAFE)',
        labelEn: 'GUARD SAFE',
        tooltipZh:
          '将护圈前缘保险片向后钩入护圈内：保险肩直接钩住待击击锤凸耳并将其微抬脱离阻铁，戴厚手套亦可盲操确认。',
        tooltipEn:
          'Rocking the safety rearward into the trigger guard hooks the cocked hammer lug and blocks trigger movement.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '.30-06 两道火半自动 (SEMI)',
        labelEn: '.30-06 SEMI',
        tooltipZh:
          '食指向前推开护圈保险：清晰一段空程后突破军规二道火释放击锤，长行程拉机柄完成抛壳与漏夹供弹循环。',
        tooltipEn:
          'Push safety forward out of guard; crisp two-stage military trigger breaks to cycle the long-stroke op-rod.',
      },
    },
  },
  m249: {
    weaponId: 'm249',
    supportedModes: OPEN_BOLT_AUTO_MODES,
    mechanismSummaryZh:
      '重型渗碳开膛待击主阻铁 + 握把横推保险栓（纯全自动无单发档）',
    mechanismSummaryEn:
      'Heavy Case-Hardened Open-Bolt Sear Catch + Cross-Bolt Safety (Full-Auto Only)',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '横栓推右锁阻铁 (SAFE)',
        labelEn: 'CROSS-BOLT SAFE',
        tooltipZh:
          '枪机挂定后方开膛待击位时将横闩保险向右推入隐去红环，物理死锁开膛阻铁禁止下落。',
        tooltipEn:
          'With piston slide latched on the rear open-bolt sear, pushing the cross-bolt right hides the red ring and blocks sear drop.',
      },
      auto: {
        mode: 'auto',
        code: 'AUTO',
        labelZh: '775 RPM 开膛连发 (FIRE)',
        labelEn: 'OPEN-BOLT AUTO',
        tooltipZh:
          '向左推保险露出红环：扣住扳机压低开膛阻铁，预压复进主簧持续驱动活塞枪机组吞吐 M27 弹链，松手瞬间截停散热。',
        tooltipEn:
          'Push safety left exposing red ring; holding trigger depresses the open-bolt sear for 775 RPM belt-fed cyclic fire until release.',
      },
    },
  },
  p08: {
    weaponId: 'p08',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'GESICHERT 麦秆黄拇指保险条 + 侧盖板 L 形直角换向杠杆与水平跷跷板阻铁',
    mechanismSummaryEn:
      'GESICHERT Straw Thumb Safety Bar + Sideplate L-Bellcrank & Horizontal Sear Bar',
    modes: {
      safe: {
        mode: 'safe',
        code: 'GESICHERT',
        labelZh: '拇指保险锁条 (GESICHERT)',
        labelEn: 'GESICHERT SAFE',
        tooltipZh:
          '后下拨麦秆黄保险杆露出白色德文 GESICHERT，向前推出扁钢锁止条刚性顶死水平阻铁条与叉形节套。',
        tooltipEn:
          'Swinging the straw lever down reveals GESICHERT and drives a steel blocking bar over the horizontal sear bar and extension.',
      },
      semi: {
        mode: 'semi',
        code: 'FEUER',
        labelZh: '9mm 肘节半自动 (SEMI)',
        labelEn: 'TOGGLE SEMI',
        tooltipZh:
          '上拨保险杆解锁：扣动月牙扳机经侧盖板 L 形杠杆横向内压阻铁柱塞释放三槽击针，上机匣后坐自动断连，松手复位。',
        tooltipEn:
          'Crescent trigger pivots the sideplate L-bellcrank inward against the sear plunger to release the striker; recoil disconnects cleanly.',
      },
    },
  },
  vector: {
    weaponId: 'vector',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh:
      '独立双侧拇指保险 (S/F) + 上置三档射控拨杆 (1/2/A) 与顶置倒装下摆击锤',
    mechanismSummaryEn:
      'Separate Ambi Thumb Safety (S/F) + Upper Mode Selector (1/2/A) & Inverted Top Hammer',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '下置拇指保险 (S)',
        labelEn: 'THUMB SAFE (S)',
        tooltipZh:
          '无需改动上层射控档位，拇指上拨握把上方双侧保险杆至 S 位，机械锁死高置水平扳机双联拉杆。',
        tooltipEn:
          'Ambidextrous lower thumb lever in S mechanically locks the twin horizontal trigger transfer bars without disturbing fire mode.',
      },
      semi: {
        mode: 'semi',
        code: '1',
        labelZh: '.45 单发精确 (1)',
        labelEn: 'SEMI (1)',
        tooltipZh:
          '上拨杆置 1 档且拇指保险置 F：顶层倒装击锤向下挥击底置击针，枪机后坐上顶击锤由单发阻铁截获，松手清脆复位。',
        tooltipEn:
          'Upper selector in 1 drops the inverted top hammer onto the low-bore firing pin; disconnector catches hammer until trigger reset.',
      },
      auto: {
        mode: 'auto',
        code: 'A',
        labelZh: '1,200 RPM Super V 连发 (A)',
        labelEn: '1,200 RPM AUTO (A)',
        tooltipZh:
          '上拨杆置 A 档：Super V 钨钢滑块每 50ms 沿 -65° 导槽下潜偏转后坐冲量，登顶闭锁瞬间踢放顶置连发阻铁倾泻 .45 弹雨。',
        tooltipEn:
          '1,200 RPM cyclic fire: -65° Super V tungsten slider plunges to cancel muzzle climb and trips the top autosear every 50 ms.',
      },
    },
  },
  g11: {
    weaponId: 'g11',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh:
      '三档双侧拇指快慢机 (S / 1 / 3·A) + 精密钟表三发计数凸轮与同轴击针互锁',
    mechanismSummaryEn:
      'Ambi 3-Mode Selector (S / 1 / 3-Burst & Auto) + Clockwork 3-Rd Counter Cam',
    modes: {
      safe: {
        mode: 'safe',
        code: 'S',
        labelZh: '保险锁止 (S)',
        labelEn: 'SAFE (S)',
        tooltipZh:
          '快慢机拨至 S 位，机械锁死扳机传力连杆并锁定 90° 旋转弹膛同轴击针防止意外撞击无壳底火。',
        tooltipEn:
          'Selector in S mechanically blocks the trigger pack linkage and locks the coaxial firing pin off the DM11 caseless primer.',
      },
      semi: {
        mode: 'semi',
        code: '1',
        labelZh: '单发精确 (1)',
        labelEn: 'SEMI (1)',
        tooltipZh:
          '扣动扳机引燃单枚 4.73mm DM11 无壳弹：浮置内机匣受控后坐复位，单发阻铁截停钟表齿轮直至松指复位。',
        tooltipEn:
          'Fires one 4.73mm DM11 caseless block; the floating receiver recoils cleanly while the disconnector halts the clockwork until reset.',
      },
      auto: {
        mode: 'auto',
        code: '3/A',
        labelZh: '2,100 RPM 三发高速 / 连发',
        labelEn: '2,100 RPM BURST/AUTO',
        tooltipZh:
          '三发高速档在浮置机匣后坐撞抵橡胶尾垫前的 85ms 内连续高速打出三发 DM11 无壳弹（2,100 RPM），实现三弹同孔齐射！',
        tooltipEn:
          '2,100 RPM hyperburst fires 3 caseless rounds within 85 ms before the 42mm floating action hits the buttplate buffer!',
      },
    },
  },
  vss: {
    weaponId: 'vss',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh:
      '机匣右侧经典杠杆保险 + 扳机护圈后置滑推式单/连发快慢机 + 无击锤线性微声击针',
    mechanismSummaryEn:
      'Right-Side Lever Safety + Behind-Trigger Cross-Bolt Selector & Silent Linear Striker',
    modes: {
      safe: {
        mode: 'safe',
        code: 'ПР',
        labelZh: '杠杆保险 (ПР)',
        labelEn: 'SAFE (ПР)',
        tooltipZh:
          '上推右侧长杠杆保险封闭抛壳槽并机械锁止扳机与无击锤线性平滑击针阻铁。',
        tooltipEn:
          'Raising the right-side safety lever shields the charging slot and blocks both trigger bar and silent linear striker sear.',
      },
      semi: {
        mode: 'semi',
        code: 'ОД',
        labelZh: '单发微声狙击 (ОД)',
        labelEn: 'SEMI SNIPER (ОД)',
        tooltipZh:
          '按下保险并拨动扳机后方横推块至单发位：线性平滑击针无摆锤噪声干脆击发 290 m/s 9×39mm SP-6 亚音速穿甲弹。',
        tooltipEn:
          'Linear striker releases silently without hammer slap to launch 290 m/s 9x39mm SP-6 armor-piercing rounds with surgical precision.',
      },
      auto: {
        mode: 'auto',
        code: 'АВ',
        labelZh: '850 RPM 应急连发 (АВ)',
        labelEn: '850 RPM AUTO (АВ)',
        tooltipZh:
          '扳机护圈后方横推快慢机切至连发位：遭遇近距突袭时六突笋枪机持续以 850 RPM 倾泻微声穿甲火力。',
        tooltipEn:
          'Cross-bolt selector shifted to full-auto enables 850 RPM suppressed 9x39mm cyclic fire for close-quarters defense.',
      },
    },
  },
  m134: {
    weaponId: 'm134',
    supportedModes: OPEN_BOLT_AUTO_MODES,
    mechanismSummaryZh:
      '28V 直流铲形握把双电门火控开关 + 12 点钟可翻式机械保险扇形块（纯电动高速连发）',
    mechanismSummaryEn:
      '28V DC Spade-Grip Dual Firing Switches + 12-O’Clock Hinged Safing Sector (Electric Auto)',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '28V 断电 / 保险扇区 (SAFE)',
        labelEn: 'ELECTRIC SAFE',
        tooltipZh:
          '切断 28V 直流主接触器并抬起 12 点钟保险扇形块，六枚滚轮枪机击针被机械托起绝对无法触发底火。',
        tooltipEn:
          'Cuts 28V DC contactor power and disengages the 12-o’clock safing sector, mechanically blocking all six bolt firing pins.',
      },
      auto: {
        mode: 'auto',
        code: '3000',
        labelZh: '3,000 RPM 六管电动齐射 (FIRE)',
        labelEn: '3,000 RPM GATLING',
        tooltipZh:
          '同时按压铲形握把双拇指电门：28V 直流马达高速旋动六联枪管簇与狄龙脱链机，每秒喷吐 50 发 7.62 NATO 炽热弹流！',
        tooltipEn:
          'Depressing both spade-grip triggers energizes the 28V DC motor, driving all six barrels and the Dillon delinker at 50 rounds per second!',
      },
    },
  },
  an94: {
    weaponId: 'an94',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh:
      '拇指双态快慢机 (ОД / 2 / АВ) + 浮置内机匣二级预供滑轮钢索双发高速同步器',
    mechanismSummaryEn:
      'Thumb Fire Selector (1 / 2-Hyperburst / Auto) + Floating-Action Pulley Synchronizer',
    modes: {
      safe: {
        mode: 'safe',
        code: 'ПР',
        labelZh: '保险锁止 (ПР)',
        labelEn: 'SAFE (ПР)',
        tooltipZh:
          '旋转左侧独立保险钮锁定扳机连杆，禁止在浮置内机匣待击态下释放击锤。',
        tooltipEn:
          'Independent left safety switch blocks the trigger transfer bar and locks the hammer inside the floating inner receiver.',
      },
      semi: {
        mode: 'semi',
        code: 'ОД',
        labelZh: '单发精准 (ОД)',
        labelEn: 'SEMI (ОД)',
        tooltipZh:
          '单发模式：每扣一次扳机击发单枚 5.45×39mm 7N6 弹，浮置枪管内机匣后滑吸收后坐峰值后平滑复位。',
        tooltipEn:
          'Semi-automatic single shot: floating barreled action glides rearward to soften felt impulse before returning to battery.',
      },
      auto: {
        mode: 'auto',
        code: '2/АВ',
        labelZh: '1,800 RPM 双发同孔 / 600 连发',
        labelEn: '1,800 RPM HYPERBURST',
        tooltipZh:
          '标志性双发超高速模式：首发击发瞬间浮置内机匣后退，滑轮钢索前推青铜预供滑块在 33ms 内将第二发弹送膛连发，随后切入 600 RPM 持续连射！',
        tooltipEn:
          'Signature 1,800 RPM 2-round hyperburst: braided cable & pulley stage Round 2 in 33 ms during the 42mm floating stroke before transitioning to 600 RPM!',
      },
    },
  },
  ztz99a: {
    weaponId: 'ztz99a',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '125mm ZPT-98 双稳猎歼数字火控 + 电发火联锁保险与 22 发转盘自动装弹机',
    mechanismSummaryEn:
      '125mm ZPT-98 Hunter-Killer Digital FCS + Breech Interlock & 22-Rd Autoloader',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '主炮电发火断电 (SAFE)',
        labelEn: 'FCS SAFE',
        tooltipZh:
          '炮手火控台断开 27V 主炮电击发回路并锁止自动装弹机举弹闭锁联锁。',
        tooltipEn:
          'Disconnects 27V main-gun firing circuit and engages breech/autoloader safety interlock.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '125mm 主炮单发实射 (FIRE)',
        labelEn: '125MM FIRE',
        tooltipZh:
          '接通电击发电路发射 DTC10-125 穿甲弹：炮身后坐 320mm，立楔下沉抛退弹底并触发底置转盘自动装填！',
        tooltipEn:
          'Fires 125mm DTC10 APFSDS through 320mm hydro-pneumatic recoil, stub ejection, and automated carousel reload!',
      },
    },
  },
  m1a2: {
    weaponId: 'm1a2',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'M1A2 SEP v3 主炮手电击发握把 + 装填手 ARM/SAFE 拨杆与液压防爆门联锁',
    mechanismSummaryEn:
      'M1A2 SEP v3 Gunner Palm-Switch FCS + Loader ARM/SAFE Lever & Blast-Door Interlock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '装填手安全锁 (SAFE)',
        labelEn: 'LOADER SAFE',
        tooltipZh:
          '装填手将炮尾右侧保险杆扳至 SAFE 切断电发火电路，确保防爆门开启装弹期间绝对安全。',
        tooltipEn:
          'Loader sets breech-side lever to SAFE, isolating the electric firing circuit while the blast doors cycle.',
      },
      semi: {
        mode: 'semi',
        code: 'ARM',
        labelZh: '120mm 主炮待发击发 (ARM)',
        labelEn: '120MM ARM / FIRE',
        tooltipZh:
          '“UP!” 装填就绪拨至 ARM：按压双联掌心开关发射 M829A4 穿甲弹，主炮后坐 300mm 并滑开防爆门换弹！',
        tooltipEn:
          'Loader calls "UP!" and flips to ARM: fires M829A4 APFSDS with 300mm recoil and hydraulic bustle-door reload!',
      },
    },
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      'EMES-15 / PERI R17A3 双通道猎歼火控 + 莱茵金属炮闩机电击发联锁',
    mechanismSummaryEn:
      'EMES-15 / PERI R17A3 Hunter-Killer FCS + Rheinmetall Breech Interlock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'GESICHERT',
        labelZh: '主炮机电保险 (SAFE)',
        labelEn: 'BREECH SAFE',
        tooltipZh:
          '切断 Rh-120 L/55A1 高压滑膛炮电发火主开关并锁止立式楔形炮闩击发机构。',
        tooltipEn:
          'Isolates the Rh-120 L/55A1 electric firing circuit and mechanically blocks the vertical wedge firing pin.',
      },
      semi: {
        mode: 'semi',
        code: 'FEUER',
        labelZh: '120mm L/55A1 实弹击发 (FIRE)',
        labelEn: 'L/55A1 FIRE',
        tooltipZh:
          '解脱机电保险轰击 DM63A1 穿甲弹（1,750 m/s）：同轴液气驻退 340mm，尾舱防爆门瞬时滑开爆发装填！',
        tooltipEn:
          'Fires 1,750 m/s DM63A1 APFSDS through 340mm concentric recoil followed by rapid bustle-door reload!',
      },
    },
  },
  tiger1: {
    weaponId: 'tiger1',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '虎式 131 脚踏电发火踏板 + 克虏伯半自动水平楔闩安全闭锁联锁',
    mechanismSummaryEn:
      'Tiger 131 Foot-Pedal Electric Firing Circuit + Krupp Horizontal Wedge Interlock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SICHER',
        labelZh: '炮闩机械保险 (SAFE)',
        labelEn: 'KWK SAFE',
        tooltipZh:
          '断开 12V 电击发开关并锁死克虏伯水平滑楔炮闩联锁，防止未完全闭锁时触发底火。',
        tooltipEn:
          'Disconnects the 12V electric primer circuit and locks the Krupp horizontal sliding-wedge safety.',
      },
      semi: {
        mode: 'semi',
        code: 'FEUER',
        labelZh: '88mm KwK 36 实弹击发 (FIRE)',
        labelEn: '88MM FIRE',
        tooltipZh:
          '踩下炮手电发火踏板轰击 88mm PzGr. 39 穿甲弹：炮身后坐 290mm，复进末端水平楔闩自动滑开抛出整枚黄铜药筒！',
        tooltipEn:
          'Depressing the firing pedal launches an 88mm PzGr. 39 shell through 290mm recoil and semi-auto brass extraction!',
      },
    },
  },
  winchester1894: {
    weaponId: 'winchester1894',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '半待击保险齿口 + D型杠杆握紧联锁保险 + 外露单动击锤',
    mechanismSummaryEn:
      'Half-Cock Hammer Notch + Lever-Squeeze Tang Trigger-Block Safety',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '杠杆微松 / 半待击保险 (SAFE)',
        labelEn: 'TANG BLOCK SAFE',
        tooltipZh:
          '杠杆未压紧下尾舌或击锤处于半待击档位时，阻断块物理挡止扳机移动并断开两段式击针接触。',
        tooltipEn:
          'Lever slightly unlatched or hammer at half-cock physically blocks trigger movement and decouples the two-piece firing pin.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '.30-30 杠杆单发击发 (FIRE)',
        labelEn: 'LEVER SINGLE SHOT',
        tooltipZh:
          '紧握杠杆压入下尾舌保险后扣压扳机释放外露击锤：射出 .30-30 平头弹后前推 D 型杠杆下拉 H 型闭锁块完成顶抛循环。',
        tooltipEn:
          'Squeezing the D-loop lever releases the tang trigger block so hammer fall fires .30-30 Win and lever throw cycles the H-locking bolt.',
      },
    },
  },
  rem870: {
    weaponId: 'rem870',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '护圈后置横栓保险 + 击锤落底自动解锁双平行钢推杆泵动',
    mechanismSummaryEn:
      'Rear Trigger-Guard Crossbolt Safety + Action-Bar Slide Lock Interlock',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '横栓推右锁死扳机 (SAFE)',
        labelEn: 'CROSSBOLT SAFE',
        tooltipZh:
          '护圈后横推保险栓向右隐去红圈挡死扳机行程；同时未击发前左侧推杆解锁片物理锁定玉米棒护木防意外开膛。',
        tooltipEn:
          'Pushing the rear crossbolt right hides the red band and blocks trigger travel while the slide lock keeps the breech sealed.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '12号 警用泵动单发循环 (FIRE)',
        labelEn: '12GA PUMP FIRE',
        tooltipZh:
          '左推横栓露红圈击发：内置击锤敲针瞬间自动弹开左侧推杆锁片，随后后拉再前推玉米棒护木完成开锁退壳与上弹闭锁。',
        tooltipEn:
          'Push crossbolt left showing red band: firing releases the action-bar lock so dual steel bars pump out spent crimson brass cleanly.',
      },
    },
  },
  m1911: {
    weaponId: 'm1911',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '左置 Condition 1 拇指保险 + 虎口自动握把保险 + 纯直推单动扳机与单发断连器',
    mechanismSummaryEn:
      'Condition 1 Frame Thumb Safety + Automatic Tang Grip Safety + Straight Single-Action Disconnector',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '待击上锁保险 (SAFE)',
        labelEn: 'THUMB & GRIP SAFE',
        tooltipZh:
          '击锤满待击时上挑拇指保险同步死锁阻铁与套筒，未握实枪柄时自动握把保险内舌物理阻断直推扳机框。',
        tooltipEn:
          'Upward thumb safety locks both sear and slide in Condition 1 while the unpressed grip safety blocks the trigger bow.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '单动半自动击发 (SEMI)',
        labelEn: 'SINGLE-ACTION SEMI',
        tooltipZh:
          '握实压入握把保险并下拨拇指保险：直推扳机后移 4.2 mm 干脆释放击锤，后坐套筒压下断连器强制单发复位。',
        tooltipEn:
          'Depressing the grip safety and sweeping thumb safety down yields a crisp 4.2 mm straight single-action break with slide disconnector reset.',
      },
    },
  },
  mg42: {
    weaponId: 'mg42',
    supportedModes: OPEN_BOLT_AUTO_MODES,
    mechanismSummaryZh: '极简纯全自动开膛待击阻铁 + 横推 S/F 物理保险栓',
    mechanismSummaryEn:
      'Full-Auto Only Open-Bolt Sear Catch + S/F Cross-Bolt Safety',
    modes: {
      safe: {
        mode: 'safe',
        code: 'S',
        labelZh: '保险 (S · Sicher)',
        labelEn: 'SAFE (S)',
        tooltipZh: '横推保险栓至 S 位直接从物理上锁死重型开膛阻铁。',
        tooltipEn: 'Cross-bolt pushed to S physically locks the heavy open-bolt sear.',
      },
      auto: {
        mode: 'auto',
        code: 'F',
        labelZh: '全自动 1,200 RPM (F · Feuer)',
        labelEn: 'FULL AUTO 1,200 RPM (F)',
        tooltipZh:
          '纯连发开膛循环：扣住扳机以 1,200 发/分释放双滚柱弹幕，松手即由阻铁截停散热。',
        tooltipEn:
          'Pure open-bolt full auto at 1,200 RPM; releasing the trigger raises the sear to vent the barrel.',
      },
    },
  },
  k98k: {
    weaponId: 'k98k',
    supportedModes: SEMI_ONLY_MODES,
    mechanismSummaryZh:
      '毛瑟三档翼形旗式尾套保险 + 双支点两道火军用扳机 + 90° 手动三突笋栓动',
    mechanismSummaryEn:
      'Mauser 3-Position Shroud Wing Flag Safety + Twin-Fulcrum Two-Stage Trigger + 90° Bolt',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '旗式保险右翻/竖立 (SAFE)',
        labelEn: 'FLAG SAFETY LOCKED',
        tooltipZh:
          '翼形旗式保险竖直立起挡住瞄准线并顶退击针（可安全拉栓退弹与拆机），右翻 180° 则同时死锁击针与旋转枪机。',
        tooltipEn:
          'Vertical flag retracts the striker off the sear while permitting safe unloading; flipped right locks both striker and bolt solid.',
      },
      semi: {
        mode: 'semi',
        code: 'FIRE',
        labelZh: '旗式保险左放单发 (FIRE)',
        labelEn: 'BOLT SINGLE SHOT',
        tooltipZh:
          '翼形旗式保险向左放平解锁击针，扣过两道火硬墙击发 7.92×57mm 重尖弹，随后手抬弯拉机柄 90° 开锁并直拉 110 mm 抽抛壳。',
        tooltipEn:
          'Flag folded left frees the striker for two-stage ignition of 7.92×57mm, followed by a 90° bolt lift and 110 mm manual extraction.',
      },
    },
  },
  thompson: {
    weaponId: 'thompson',
    supportedModes: SELECT_FIRE_MODES,
    mechanismSummaryZh: '开膛双模式阻铁摇臂 + 左侧双独立桨式快慢机与保险拨片',
    mechanismSummaryEn:
      'Open-Bolt Select-Fire Sear & Rocker + Twin Left-Side Paddle Levers',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '后桨保险 (SAFE)',
        labelEn: 'SAFE (Rear Paddle)',
        tooltipZh: '后拨片旋至 SAFE 挡死开膛主阻铁与枪机防跌落走火。',
        tooltipEn: 'Rear paddle rotated to SAFE mechanically blocks the open-bolt sear.',
      },
      semi: {
        mode: 'semi',
        code: 'SINGLE',
        labelZh: '前桨单发 (SINGLE)',
        labelEn: 'SEMI (SINGLE)',
        tooltipZh:
          '单发断连摇臂每发后自动脱钩让阻铁升起截停枪机，实现精准半自动点射。',
        tooltipEn:
          'Disconnector rocker trips after each shot so the sear catches the bolt open for accurate single fire.',
      },
      auto: {
        mode: 'auto',
        code: 'FULL AUTO',
        labelZh: '前桨连发 (FULL AUTO)',
        labelEn: 'FULL AUTO (750 RPM)',
        tooltipZh:
          '快慢机顶死单发摇臂，持续扣机以 750 发/分倾泻 50 发发条大弹鼓火力。',
        tooltipEn:
          'Selector bypasses the disconnector for continuous 750 RPM fire fed by the 50-rd clockwork drum.',
      },
    },
  },
  gau8: {
    weaponId: 'gau8',
    supportedModes: OPEN_BOLT_AUTO_MODES,
    mechanismSummaryZh:
      'A-10 二段扳机 3,000 PSI 液压电控 + 停射自动空转清膛安全门',
    mechanismSummaryEn:
      'A-10 Two-Stage Hydraulic-Electric Trigger + Burst-End Clearing Sector Gate',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '机载主臂保险 (MASTER SAFE)',
        labelEn: 'MASTER ARM SAFE',
        tooltipZh:
          '切断双 38.5 马力液压驱动电磁阀并关闭清膛滑门，确保停机坪勤务安全。',
        tooltipEn:
          'Isolates twin 38.5-HP hydraulic solenoid valves and locks the clearing sector gate safe.',
      },
      auto: {
        mode: 'auto',
        code: '3,900 RPM',
        labelZh: '3,900 RPM 液压旋射 (BRRRT)',
        labelEn: '3,900 RPM ROTARY',
        tooltipZh:
          '全压二段扳机启动双液压马达以 65 发/秒倾泻 30×173mm 贫铀穿甲弹幕，松手自动反转半圈清膛防烤燃。',
        tooltipEn:
          'Full trigger drives twin hydraulic motors at 65 rds/sec of 30×173mm API with automatic clearing cycle on release.',
      },
    },
  },
  ...CENTENNIAL_FIRE_CONTROL_PROFILES,
};

function isArcheryInteractiveWeapon(
  weaponId: WeaponId | string | null | undefined
): boolean {
  return isArcheryWeapon(weaponId);
}

/**
 * Returns the authentic real-world fire-control selector modes supported by a weapon.
 */
export function getSupportedSelectorModes(
  weaponId: WeaponId
): readonly FireSelectorMode[] {
  return WEAPON_SELECTOR_CAPABILITIES[weaponId] ?? SEMI_ONLY_MODES;
}

export function getWeaponFireControlProfile(
  weaponId: WeaponId
): WeaponFireControlProfile {
  return WEAPON_FIRE_CONTROL_PROFILES[weaponId];
}

export function getSelectorModeMetadata(
  weaponId: WeaponId,
  mode: FireSelectorMode
): SelectorModeTooltipMeta | null {
  return WEAPON_FIRE_CONTROL_PROFILES[weaponId]?.modes[mode] ?? null;
}

const EXPLICIT_WEAPON_ACTION_PARTS: Record<WeaponId, readonly string[]> = {
  ak15: ['ak_bolt_carrier', 'ak_bolt'],
  m4a1: ['m4a1_charging_handle', 'm4a1_bolt_carrier', 'm4a1_bolt'],
  mp5: ['mp5_charging_handle', 'mp5_bolt_carrier', 'mp5_bolt_head'],
  g17: ['slide'],
  m82a1: ['m82a1_bolt_carrier', 'm82a1_bolt'],
  awm: ['awm_bolt_body', 'awm_bolt_shroud'],
  scar: [
    'scar_charging_handle',
    'scar_bolt_carrier',
    'scar_bolt',
    'scar_gas_piston',
  ],
  deagle: ['deagle_slide', 'deagle_bolt'],
  aug: ['aug_charging_handle', 'aug_bolt_carrier', 'aug_bolt'],
  p320: ['p320_slide'],
  p90: ['p90_charging_handles', 'p90_bolt'],
  lift33: ['lift33_bowstring', 'lift33_d_loop'],
  r500: ['r500_trigger_sled', 'r500_bowstring', 'r500_versadrive_screw'],
  python: ['python_hammer', 'python_cylinder'],
  benellim4: [
    'benellim4_charging_handle',
    'benellim4_bolt_carrier',
    'benellim4_bolt_head',
  ],
  garand: ['garand_op_rod', 'garand_bolt'],
  m249: ['m249_charging_handle', 'm249_piston_carrier', 'm249_bolt'],
  p08: ['p08_rear_toggle', 'p08_front_toggle', 'p08_breechblock'],
  vector: ['vector_charging_handle', 'vector_bolt', 'vector_slider'],
  g11: [
    'g11_winding_knob',
    'g11_rotary_breech',
    'g11_clockwork_gears',
    'g11_driving_rod',
  ],
  vss: ['vss_bolt_carrier', 'vss_bolt'],
  m134: ['m134_rotor_assembly', 'm134_barrel_cluster', 'm134_bolt_1', 'm134_bolt_2'],
  an94: [
    'an94_bolt_carrier',
    'an94_bolt',
    'an94_pulley_wheel',
    'an94_feed_rammer',
  ],
  ztz99a: [
    'ztz99a_main_gun',
    'ztz99a_breech_block',
    'ztz99a_loading_tray',
    'ztz99a_rammer_chain',
  ],
  m1a2: [
    'm1a2_main_gun',
    'm1a2_breech_block',
    'm1a2_blast_doors',
    'm1a2_ready_round',
  ],
  leopard2a7: [
    'leo_main_gun',
    'leo_breech_block',
    'leo_blast_door',
    'leo_ready_round',
  ],
  tiger1: [
    'tiger_main_gun',
    'tiger_breech_block',
    'tiger_recoil_cradle',
    'tiger_ready_round',
  ],
  winchester1894: ['win94_lever', 'win94_breech_bolt', 'win94_locking_bolt'],
  rem870: ['rem870_forend', 'rem870_action_bars', 'rem870_breech_bolt'],
  m1911: ['m1911_slide', 'm1911_barrel', 'm1911_barrel_link'],
  mg42: ['mg42_charging_handle', 'mg42_bolt_carrier', 'mg42_bolt_head'],
  k98k: ['k98k_bolt_body', 'k98k_claw_extractor', 'k98k_bolt_shroud'],
  thompson: ['thompson_actuator', 'thompson_bolt', 'thompson_blish_lock'],
  gau8: ['gau8_rotor_core', 'gau8_barrel_cluster', 'gau8_bolt_1', 'gau8_bolt_2'],
  ...CENTENNIAL_INTERACTION.explicitActionParts,
};

const GENERIC_ACTION_PART_INCLUDE_RE =
  /(?:^|_)(?:slide|bolt_carrier|piston_carrier|charging_handles?|bolt_body|bolt_head|bolt|breechblock|rear_toggle|front_toggle|slider|operating_rod)(?:$|_)/i;
const GENERIC_ACTION_PART_EXCLUDE_RE =
  /(?:slide_lock|slide_stop|slide_catch|slide_cover|bolt_catch|crossbolts?|barrel_lock|stock_bolt|cylinder_bolt|open_bolt_sear|carbon_bolt)/i;

export type ActionHandleKind =
  | 'slide'
  | 'charging_handle'
  | 'bolt_handle'
  | 'lever'
  | 'pump_forend'
  | 'cylinder'
  | 'toggle'
  | 'breech_block'
  | 'rotary_cluster'
  | 'bowstring';

export interface WeaponActionDragSpec {
  readonly weaponId: WeaponId;
  readonly handleKind: ActionHandleKind;
  /** Unit 3D world-space drag vector corresponding to positive manual stroke (+rackProgress) */
  readonly worldDragAxis: readonly [number, number, number];
  /** Optional per-part drag axis override for exhibits with multi-axis mechanisms (e.g. tank wedges, revolver cylinder, lever vs bolt) */
  readonly partAxisOverrides?: Readonly<
    Record<string, readonly [number, number, number]>
  >;
  /** Screen-space drag span multiplier (lower = crisper short stroke, higher = heavier long throw) */
  readonly strokeSpanScale: number;
  /** Damped spring-return rate (1/s) governing snap-back into battery */
  readonly springReturnRate: number;
  /** Mechanical detent thresholds along [0..1] triggering tactile audio feedback */
  readonly detentThresholds: readonly number[];
  readonly labelZh: string;
  readonly labelEn: string;
}

const AXIS_REARWARD: readonly [number, number, number] = [-1, 0, 0];
const AXIS_BOLT_LIFT_PULL: readonly [number, number, number] = [
  -0.9486833, 0.3162278, 0,
];
const AXIS_TOGGLE_BUCKLE: readonly [number, number, number] = [
  -0.7808688, 0.624695, 0,
];
const AXIS_LEVER_THROW: readonly [number, number, number] = [
  0.5547002, -0.8320503, 0,
];
const AXIS_HAMMER_COCK: readonly [number, number, number] = [
  -0.8944272, -0.4472136, 0,
];
const AXIS_CYLINDER_INDEX: readonly [number, number, number] = [0, 1, 0];
const AXIS_ROTARY_CRANK: readonly [number, number, number] = [-0.6, -0.8, 0];
const AXIS_VERTICAL_WEDGE: readonly [number, number, number] = [0, -1, 0];
const AXIS_HORIZONTAL_WEDGE: readonly [number, number, number] = [0, 0, -1];
const AXIS_CLOCKWORK_WIND: readonly [number, number, number] = [
  -0.85, -0.5267827, 0,
];

const STANDARD_DETENTS: readonly number[] = [0.28, 0.85];
const BOLT_LIFT_DETENTS: readonly number[] = [0.22, 0.55, 0.85];
const ARCHERY_DETENTS: readonly number[] = [0.65, 0.92];
const ROTARY_DETENTS: readonly number[] = [0.33, 0.66, 0.9];

export const WEAPON_ACTION_DRAG_SPECS: Readonly<
  Record<WeaponId, WeaponActionDragSpec>
> = {
  ak15: {
    weaponId: 'ak15',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.0,
    springReturnRate: 11.4,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '拉动枪机框拉柄',
    labelEn: 'Drag Bolt Carrier Handle',
  },
  m4a1: {
    weaponId: 'm4a1',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.0,
    springReturnRate: 11.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '拉动 T 型拉机柄',
    labelEn: 'Drag T-Charging Handle',
  },
  mp5: {
    weaponId: 'mp5',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.95,
    springReturnRate: 12.2,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉前置拉机柄',
    labelEn: 'Drag Forward Cocking Handle',
  },
  g17: {
    weaponId: 'g17',
    handleKind: 'slide',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.84,
    springReturnRate: 13.4,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉套筒验枪/上膛',
    labelEn: 'Rack Pistol Slide',
  },
  m82a1: {
    weaponId: 'm82a1',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.22,
    springReturnRate: 9.6,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '重拉 .50 BMG 机框',
    labelEn: 'Rack .50 BMG Bolt Carrier',
  },
  awm: {
    weaponId: 'awm',
    handleKind: 'bolt_handle',
    worldDragAxis: AXIS_BOLT_LIFT_PULL,
    strokeSpanScale: 1.08,
    springReturnRate: 10.2,
    detentThresholds: BOLT_LIFT_DETENTS,
    labelZh: '60° 抬栓后拉枪机',
    labelEn: 'Lift 60° & Pull Bolt Handle',
  },
  scar: {
    weaponId: 'scar',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.0,
    springReturnRate: 11.6,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉往复式拉机柄',
    labelEn: 'Rack Reciprocating Handle',
  },
  deagle: {
    weaponId: 'deagle',
    handleKind: 'slide',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.92,
    springReturnRate: 12.4,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉重型马格南套筒',
    labelEn: 'Rack .50 AE Magnum Slide',
  },
  aug: {
    weaponId: 'aug',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.98,
    springReturnRate: 11.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉左侧折叠拉机柄',
    labelEn: 'Drag Left Folding Handle',
  },
  p320: {
    weaponId: 'p320',
    handleKind: 'slide',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.84,
    springReturnRate: 13.2,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉 M17 套筒',
    labelEn: 'Rack P320 Slide',
  },
  p90: {
    weaponId: 'p90',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.92,
    springReturnRate: 12.5,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉双侧拉机柄',
    labelEn: 'Drag Ambidextrous Handle',
  },
  lift33: {
    weaponId: 'lift33',
    handleKind: 'bowstring',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.18,
    springReturnRate: 10.6,
    detentThresholds: ARCHERY_DETENTS,
    labelZh: '后拉弓弦与 D 环',
    labelEn: 'Draw Bowstring & D-Loop',
  },
  r500: {
    weaponId: 'r500',
    handleKind: 'bowstring',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.24,
    springReturnRate: 10.0,
    detentThresholds: ARCHERY_DETENTS,
    labelZh: '摇柄后拉反向弓弦滑车',
    labelEn: 'Draw Reverse-Cam Sled',
  },
  python: {
    weaponId: 'python',
    handleKind: 'cylinder',
    worldDragAxis: AXIS_HAMMER_COCK,
    partAxisOverrides: {
      python_cylinder: AXIS_CYLINDER_INDEX,
    },
    strokeSpanScale: 0.82,
    springReturnRate: 12.8,
    detentThresholds: [0.35, 0.82],
    labelZh: '压待击锤 / 拨转六发弹巢',
    labelEn: 'Cock Hammer / Index Cylinder',
  },
  benellim4: {
    weaponId: 'benellim4',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.06,
    springReturnRate: 11.2,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉 ARGO 滚花拉柄',
    labelEn: 'Rack ARGO Bolt Handle',
  },
  garand: {
    weaponId: 'garand',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.1,
    springReturnRate: 11.0,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉导气操作杆',
    labelEn: 'Rack Operating Rod',
  },
  m249: {
    weaponId: 'm249',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.1,
    springReturnRate: 10.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉右侧开膛拉机柄',
    labelEn: 'Rack Open-Bolt Handle',
  },
  p08: {
    weaponId: 'p08',
    handleKind: 'toggle',
    worldDragAxis: AXIS_TOGGLE_BUCKLE,
    strokeSpanScale: 0.88,
    springReturnRate: 13.0,
    detentThresholds: [0.28, 0.78],
    labelZh: '向后上提屈膝肘节球柄',
    labelEn: 'Lift & Pull Toggle Knobs',
  },
  vector: {
    weaponId: 'vector',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.94,
    springReturnRate: 12.0,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉折叠拉机柄驱动 Super V',
    labelEn: 'Rack Super V Charging Handle',
  },
  g11: {
    weaponId: 'g11',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    partAxisOverrides: {
      g11_winding_knob: AXIS_CLOCKWORK_WIND,
    },
    strokeSpanScale: 0.98,
    springReturnRate: 11.6,
    detentThresholds: [0.3, 0.72, 0.9],
    labelZh: '旋拧时钟上弦旋钮',
    labelEn: 'Crank Clockwork Winding Knob',
  },
  vss: {
    weaponId: 'vss',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.0,
    springReturnRate: 11.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉六突笋枪机框',
    labelEn: 'Rack 6-Lug Bolt Carrier',
  },
  m134: {
    weaponId: 'm134',
    handleKind: 'rotary_cluster',
    worldDragAxis: AXIS_ROTARY_CRANK,
    strokeSpanScale: 1.14,
    springReturnRate: 9.8,
    detentThresholds: ROTARY_DETENTS,
    labelZh: '拨转六联加特林转管簇',
    labelEn: 'Crank 6-Barrel Rotor Cluster',
  },
  an94: {
    weaponId: 'an94',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.06,
    springReturnRate: 11.4,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉滑轮联动枪机框',
    labelEn: 'Rack Pulley Bolt Carrier',
  },
  ztz99a: {
    weaponId: 'ztz99a',
    handleKind: 'breech_block',
    worldDragAxis: AXIS_REARWARD,
    partAxisOverrides: {
      ztz99a_breech_block: AXIS_VERTICAL_WEDGE,
    },
    strokeSpanScale: 1.28,
    springReturnRate: 8.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '下拉立楔炮闩 / 推演主炮后坐',
    labelEn: 'Cycle Vertical Wedge Breech',
  },
  m1a2: {
    weaponId: 'm1a2',
    handleKind: 'breech_block',
    worldDragAxis: AXIS_REARWARD,
    partAxisOverrides: {
      m1a2_breech_block: AXIS_VERTICAL_WEDGE,
    },
    strokeSpanScale: 1.28,
    springReturnRate: 8.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '下拉立楔炮闩 / 推演 120mm 后坐',
    labelEn: 'Cycle M256 Vertical Breech',
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    handleKind: 'breech_block',
    worldDragAxis: AXIS_REARWARD,
    partAxisOverrides: {
      leo_breech_block: AXIS_VERTICAL_WEDGE,
    },
    strokeSpanScale: 1.28,
    springReturnRate: 8.8,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '下拉 L/55A1 立楔炮闩',
    labelEn: 'Cycle Rh-120 Vertical Breech',
  },
  tiger1: {
    weaponId: 'tiger1',
    handleKind: 'breech_block',
    worldDragAxis: AXIS_REARWARD,
    partAxisOverrides: {
      tiger_breech_block: AXIS_HORIZONTAL_WEDGE,
    },
    strokeSpanScale: 1.28,
    springReturnRate: 8.6,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '横滑克虏伯 88mm 水平楔闩',
    labelEn: 'Slide Krupp Horizontal Wedge',
  },
  winchester1894: {
    weaponId: 'winchester1894',
    handleKind: 'lever',
    worldDragAxis: AXIS_LEVER_THROW,
    partAxisOverrides: {
      win94_breech_bolt: AXIS_REARWARD,
      win94_locking_bolt: AXIS_VERTICAL_WEDGE,
    },
    strokeSpanScale: 0.96,
    springReturnRate: 11.4,
    detentThresholds: [0.28, 0.82],
    labelZh: '下推 D 型杠杆循环上膛',
    labelEn: 'Throw D-Loop Finger Lever',
  },
  rem870: {
    weaponId: 'rem870',
    handleKind: 'pump_forend',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.0,
    springReturnRate: 12.0,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉玉米棒泵动护木',
    labelEn: 'Pump Corn-Cob Forend',
  },
  m1911: {
    weaponId: 'm1911',
    handleKind: 'slide',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 0.86,
    springReturnRate: 13.0,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉锻钢套筒验枪/上膛',
    labelEn: 'Rack Forged M1911 Slide',
  },
  mg42: {
    weaponId: 'mg42',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.12,
    springReturnRate: 10.6,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉右侧滚柱机枪拉柄',
    labelEn: 'Rack MG 42 Cocking Handle',
  },
  k98k: {
    weaponId: 'k98k',
    handleKind: 'bolt_handle',
    worldDragAxis: AXIS_BOLT_LIFT_PULL,
    strokeSpanScale: 1.08,
    springReturnRate: 10.4,
    detentThresholds: BOLT_LIFT_DETENTS,
    labelZh: '90° 抬栓后拉毛瑟枪机',
    labelEn: 'Lift 90° & Pull Mauser Bolt',
  },
  thompson: {
    weaponId: 'thompson',
    handleKind: 'charging_handle',
    worldDragAxis: AXIS_REARWARD,
    strokeSpanScale: 1.02,
    springReturnRate: 11.2,
    detentThresholds: STANDARD_DETENTS,
    labelZh: '后拉顶置球形拉机柄',
    labelEn: 'Rack Top Actuator Knob',
  },
  gau8: {
    weaponId: 'gau8',
    handleKind: 'rotary_cluster',
    worldDragAxis: AXIS_ROTARY_CRANK,
    strokeSpanScale: 1.24,
    springReturnRate: 9.2,
    detentThresholds: ROTARY_DETENTS,
    labelZh: '拨转七管 30mm 转管簇',
    labelEn: 'Crank 7-Barrel 30mm Rotor',
  },
  ...CENTENNIAL_INTERACTION.dragSpecs,
};

export function getWeaponActionDragSpec(
  weaponId: WeaponId
): WeaponActionDragSpec {
  return WEAPON_ACTION_DRAG_SPECS[weaponId];
}

export function resolveActionWorldDragAxis(
  weaponId: WeaponId,
  partId?: string | null
): readonly [number, number, number] {
  const spec = WEAPON_ACTION_DRAG_SPECS[weaponId];
  if (partId && spec.partAxisOverrides && spec.partAxisOverrides[partId]) {
    return spec.partAxisOverrides[partId];
  }
  return spec.worldDragAxis;
}

export interface ActionHandleAvailabilityInput {
  readonly screen: string;
  readonly mode: string;
  readonly activeWeaponId: WeaponId;
  readonly fieldStripActive: boolean;
  readonly malfunctionActive: boolean;
  readonly caliperActive: boolean;
  readonly isFiringPlaying: boolean;
  readonly textureModalOpen: boolean;
}

/**
 * Returns true when hovering/dragging `partId` can immediately manipulate the
 * weapon's 3D action handle (paused firing mode OR assembled `explodeProgress < 0.05`).
 */
export function canDragActionHandleNow(
  appState: ActionHandleAvailabilityInput,
  partId: string | null | undefined,
  explodeProgress = 0
): boolean {
  if (
    appState.screen !== 'workbench' ||
    appState.fieldStripActive ||
    appState.malfunctionActive ||
    appState.caliperActive ||
    appState.isFiringPlaying ||
    appState.textureModalOpen
  ) {
    return false;
  }
  if (!isWeaponActionPart(appState.activeWeaponId, partId)) {
    return false;
  }
  return (
    appState.mode === 'firing' ||
    (appState.mode === 'explode' && explodeProgress < 0.05)
  );
}

export function getCursorForPartHover(
  appState: ActionHandleAvailabilityInput,
  partId: string | null | undefined,
  explodeProgress = 0,
  isDraggingAction = false
): 'crosshair' | 'grabbing' | 'grab' | 'pointer' {
  if (appState.screen !== 'workbench') return 'pointer';
  if (appState.caliperActive) return 'crosshair';
  if (isDraggingAction) return 'grabbing';
  if (canDragActionHandleNow(appState, partId, explodeProgress)) {
    return 'grab';
  }
  return 'pointer';
}

export function getWeaponActionPartIds(weaponId: WeaponId): readonly string[] {
  return EXPLICIT_WEAPON_ACTION_PARTS[weaponId] ?? [];
}

/**
 * Identifies whether a 3D mesh part belongs to the manually rackable reciprocating
 * slide / bolt carrier / charging handle / operating rod assembly.
 */
export function isWeaponActionPart(
  weaponId: WeaponId,
  partId: string | null | undefined
): boolean {
  if (!partId) return false;
  const explicit = EXPLICIT_WEAPON_ACTION_PARTS[weaponId];
  if (explicit && explicit.includes(partId)) {
    return true;
  }
  if (GENERIC_ACTION_PART_EXCLUDE_RE.test(partId)) {
    return false;
  }
  return GENERIC_ACTION_PART_INCLUDE_RE.test(partId);
}

/**
 * Maps manual slide/bolt retraction `[0..1]` onto the unlocking & extraction stroke
 * `[0.32 .. 0.62]` (or `[0.0 .. 0.30]` draw/cocking stroke for compound archery).
 */
export function mapManualRackToFireProgress(
  rackProgress01: number,
  weaponId?: WeaponId | string
): number {
  const r = clamp01(rackProgress01);
  if (r <= 0.0005) return 0.0;
  if (isArcheryInteractiveWeapon(weaponId)) {
    return r * 0.3;
  }
  if (weaponId === 'python') {
    return r * 0.165;
  }
  if (weaponId === 'benellim4' || weaponId === 'garand' || weaponId === 'rem870') {
    return 0.22 + r * 0.28;
  }
  if (weaponId === 'winchester1894') {
    return 0.28 + r * 0.28;
  }
  if (weaponId === 'm249') {
    return 0.3 + r * 0.28;
  }
  if (weaponId === 'p08') {
    return 0.2 + r * 0.23;
  }
  if (weaponId === 'vector') {
    return 0.2 + r * 0.3;
  }
  if (weaponId === 'g11') {
    return 0.22 + r * 0.24;
  }
  if (weaponId === 'vss') {
    return 0.22 + r * 0.26;
  }
  if (weaponId === 'm134' || weaponId === 'an94') {
    return 0.2 + r * 0.28;
  }
  if (weaponId === 'm1911') {
    return 0.3 + r * 0.27;
  }
  if (weaponId === 'k98k') {
    return 0.35 + r * 0.29;
  }
  if (weaponId === 'mg42' || weaponId === 'thompson') {
    return 0.28 + r * 0.3;
  }
  if (isHeavyScaleWeapon(weaponId)) {
    return 0.2 + r * 0.34;
  }
  return 0.32 + r * 0.3;
}

/**
 * Computes simulated recoil-spring / compound-cam draw resistance (Newtons) along the stroke.
 */
export function computeRecoilSpringForceN(
  weaponId: WeaponId,
  rackProgress01: number
): number {
  const r = clamp01(rackProgress01);
  if (r <= 0.0001) return 0;

  if (weaponId === 'lift33' || weaponId === 'hoytrx8') {
    const peakN = 311.4;
    const holdN = weaponId === 'hoytrx8' ? 62.3 : 46.7;
    if (r < 0.65) {
      return peakN * Math.sin((r / 0.65) * (Math.PI * 0.5));
    }
    const d = (r - 0.65) / 0.35;
    return peakN - (peakN - holdN) * (d * d * (3 - 2 * d));
  }
  if (weaponId === 'r500' || weaponId === 'excalibur') {
    const peakN = weaponId === 'excalibur' ? 1201.0 : 1334.5;
    const holdN = weaponId === 'excalibur' ? 1201.0 : 827.4;
    if (r < 0.72) {
      return peakN * Math.sin((r / 0.72) * (Math.PI * 0.5));
    }
    const d = (r - 0.72) / 0.28;
    return peakN - (peakN - holdN) * (d * d * (3 - 2 * d));
  }
  if (weaponId === 'englishlongbow') {
    return 667.2 * r;
  }

  let preloadN = 52;
  let rateN = 46;
  if (weaponId === 'm82a1') {
    preloadN = 115;
    rateN = 98;
  } else if (weaponId === 'awm') {
    preloadN = 36;
    rateN = 28;
  } else if (weaponId === 'g17' || weaponId === 'p320') {
    preloadN = 44;
    rateN = 38;
  } else if (weaponId === 'deagle') {
    preloadN = 76;
    rateN = 64;
  } else if (weaponId === 'python') {
    preloadN = 34;
    rateN = 26;
  } else if (weaponId === 'benellim4') {
    preloadN = 58;
    rateN = 52;
  } else if (weaponId === 'garand') {
    preloadN = 68;
    rateN = 58;
  } else if (weaponId === 'm249') {
    preloadN = 74;
    rateN = 62;
  } else if (weaponId === 'p08') {
    preloadN = 48;
    rateN = 42;
  } else if (weaponId === 'vector') {
    preloadN = 64;
    rateN = 56;
  } else if (weaponId === 'g11') {
    preloadN = 62;
    rateN = 54;
  } else if (weaponId === 'vss') {
    preloadN = 46;
    rateN = 40;
  } else if (weaponId === 'm134') {
    preloadN = 128;
    rateN = 110;
  } else if (weaponId === 'an94') {
    preloadN = 66;
    rateN = 58;
  } else if (weaponId === 'winchester1894') {
    preloadN = 32;
    rateN = 28;
  } else if (weaponId === 'rem870') {
    preloadN = 24;
    rateN = 22;
  } else if (weaponId === 'm1911') {
    preloadN = 42;
    rateN = 34;
  } else if (weaponId === 'mg42') {
    preloadN = 92;
    rateN = 84;
  } else if (weaponId === 'k98k') {
    preloadN = 40;
    rateN = 34;
  } else if (weaponId === 'thompson') {
    preloadN = 68;
    rateN = 58;
  } else if (isOrdnanceWeapon(weaponId)) {
    preloadN = 1400;
    rateN = 1800;
  } else if (isTankWeapon(weaponId)) {
    // Hydro-pneumatic tank main-gun recuperator & breech closing spring resistance (Newtons)
    preloadN = 3200;
    rateN = 4800;
  }

  const bufferRamp = r > 0.8 ? Math.pow((r - 0.8) / 0.2, 2) * 28 : 0;
  return preloadN + rateN * r + bufferRamp;
}

export interface InteractiveActionSnapshot {
  weaponId: WeaponId;
  selectorMode: FireSelectorMode;
  isDraggingAction: boolean;
  isPressCheck: boolean;
  isTriggerHeld: boolean;
  /** True after a SEMI shot breaks until trigger is released for disconnector reset */
  awaitingDisconnectorReset: boolean;
  safetyBlockedSeq: number;
}

export interface InteractiveActionTransientState {
  /** Continuous manual slide/bolt retraction [0..1] (0 = battery, 0.28 = press-check, 1 = full rear) */
  manualRackProgress: number;
  /** Continuous trigger shoe pull [0..1] (0..0.65 take-up, 0.65..0.85 sear wall, 1.0 break) */
  triggerPullProgress: number;
  /** Instantaneous recoil spring resistance force in Newtons */
  recoilSpringForceN: number;
  /** Instantaneous manual action phase velocity */
  rackVelocity: number;
}

type RackMotionPhase =
  | 'idle'
  | 'pointer_drag'
  | 'keyboard_rack'
  | 'press_check_hold'
  | 'snap_battery'
  | 'chamber_round';

export const PRESS_CHECK_RACK_RATIO = 0.28;
export const RACK_BATTERY_SNAP_MAX_RATIO = 0.5;
export const RACK_CHAMBER_ROUND_MIN_RATIO = 0.85;
export const TRIGGER_TAKEUP_END = 0.65;
export const TRIGGER_SEAR_WALL_END = 0.85;

// Pre-allocated mutable 60fps float state (ZERO heap allocations during useFrame)
const transientState: InteractiveActionTransientState = {
  manualRackProgress: 0,
  triggerPullProgress: 0,
  recoilSpringForceN: 0,
  rackVelocity: 0,
};

let currentSnapshot: InteractiveActionSnapshot = {
  weaponId: 'ak15',
  selectorMode: 'semi',
  isDraggingAction: false,
  isPressCheck: false,
  isTriggerHeld: false,
  awaitingDisconnectorReset: false,
  safetyBlockedSeq: 0,
};

let rackPhase: RackMotionPhase = 'idle';
let chamberSweepF = 0.68;
let autoBurstBroke = false;
let resetTailFinishActive = false;
let lastDetentBand = 0;
let snapBatteryStartRack = 0;

function computeDetentBand(
  progress01: number,
  thresholds: readonly number[]
): number {
  let band = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (progress01 >= thresholds[i]) {
      band = i + 1;
    }
  }
  return band;
}

function triggerDetentFeedbackIfCrossed(
  weaponId: WeaponId,
  prevProgress: number,
  nextProgress: number
): void {
  const thresholds = WEAPON_ACTION_DRAG_SPECS[weaponId].detentThresholds;
  if (thresholds.length === 0) return;

  // Hysteresis band prevents audio chatter when pointer hovers right on a detent notch
  if (nextProgress > prevProgress) {
    for (let i = lastDetentBand; i < thresholds.length; i++) {
      if (nextProgress >= thresholds[i] + 0.01) {
        lastDetentBand = i + 1;
        if (lastDetentBand >= thresholds.length) {
          playTriggerResetSound();
        } else {
          playSelectorDetentSound('semi');
        }
      }
    }
  } else if (nextProgress < prevProgress) {
    for (let i = lastDetentBand - 1; i >= 0; i--) {
      if (nextProgress <= thresholds[i] - 0.025) {
        lastDetentBand = i;
        playSelectorDetentSound('safe');
      }
    }
  }
}

const snapshotListeners = new Set<() => void>();

function commitDiscretePatch(patch: Partial<InteractiveActionSnapshot>): void {
  let changed = false;
  const keys = Object.keys(patch) as Array<keyof InteractiveActionSnapshot>;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (currentSnapshot[k] !== patch[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;

  currentSnapshot = {
    ...currentSnapshot,
    ...patch,
  };
  snapshotListeners.forEach((fn) => fn());
}

function ensureWorkbenchFiringPaused(): void {
  const st = useAppStore.getState();
  playbackClock.setTargetProgress(0, false);
  if (st.mode !== 'firing') {
    st.setMode('firing');
    useAppStore.getState().stopFiringPlay();
  } else if (st.isFiringPlaying) {
    st.stopFiringPlay();
  }
}

function engageLiveFiringCycle(loopContinuous: boolean): void {
  const st = useAppStore.getState();
  playbackClock.setTargetProgress(0, false);
  // Reset logical fireProgress to 0 so all 8 ballistic/mechanical cues cross in sequence
  playbackClock.setFireProgress(0, false);

  if (st.mode !== 'firing') {
    st.triggerSingleShot();
    const after = useAppStore.getState();
    if (after.fireLoop !== loopContinuous) {
      after.toggleFireLoop();
    }
    return;
  }

  if (st.fireLoop !== loopContinuous) {
    st.toggleFireLoop();
  }
  if (!useAppStore.getState().isFiringPlaying) {
    useAppStore.getState().toggleFiringPlay();
  }
}

function finalizeRackRelease(): void {
  const r = transientState.manualRackProgress;
  if (r <= 0.002) {
    rackPhase = 'idle';
    transientState.manualRackProgress = 0;
    transientState.recoilSpringForceN = 0;
    transientState.rackVelocity = 0;
    commitDiscretePatch({ isDraggingAction: false, isPressCheck: false });
    return;
  }

  if (
    r >= RACK_CHAMBER_ROUND_MIN_RATIO &&
    !isArcheryInteractiveWeapon(currentSnapshot.weaponId)
  ) {
    // Racked past 85%: strip fresh round from feed lips & lock into battery (0.68 -> 1.0)
    rackPhase = 'chamber_round';
    chamberSweepF = 0.68;
    playbackClock.setFireProgress(chamberSweepF, true);
    playPressCheckSpringSound('release');
    commitDiscretePatch({
      isDraggingAction: false,
      isPressCheck: false,
      awaitingDisconnectorReset: false,
    });
    return;
  }

  // Released below 50% (or short-stroked < 85%): recoil spring snaps slide/bolt forward into battery (-> 0.0)
  rackPhase = 'snap_battery';
  snapBatteryStartRack = r;
  lastDetentBand = 0;
  if (r > 0.04) {
    playPressCheckSpringSound('release');
  }
  commitDiscretePatch({ isDraggingAction: false, isPressCheck: false });
}

export const interactiveActionStore = {
  subscribe(listener: () => void): () => void {
    snapshotListeners.add(listener);
    return () => {
      snapshotListeners.delete(listener);
    };
  },

  getSnapshot(): Readonly<InteractiveActionSnapshot> {
    return currentSnapshot;
  },

  getServerSnapshot(): Readonly<InteractiveActionSnapshot> {
    return currentSnapshot;
  },

  getState(): Readonly<InteractiveActionSnapshot> {
    return currentSnapshot;
  },

  getTransientState(): Readonly<InteractiveActionTransientState> {
    return transientState;
  },

  syncWeapon(weaponId: WeaponId): void {
    if (!WEAPON_IDS.includes(weaponId) && !isArcheryInteractiveWeapon(weaponId)) {
      return;
    }
    const supported = getSupportedSelectorModes(weaponId);
    const defaultLiveMode: FireSelectorMode = supported.includes('semi')
      ? 'semi'
      : supported[supported.length - 1];
    const nextMode = supported.includes(currentSnapshot.selectorMode)
      ? currentSnapshot.selectorMode
      : defaultLiveMode;

    const weaponSwitched = currentSnapshot.weaponId !== weaponId;
    if (weaponSwitched) {
      rackPhase = 'idle';
      autoBurstBroke = false;
      resetTailFinishActive = false;
      lastDetentBand = 0;
      snapBatteryStartRack = 0;
      transientState.manualRackProgress = 0;
      transientState.triggerPullProgress = 0;
      transientState.recoilSpringForceN = 0;
      transientState.rackVelocity = 0;
    }

    commitDiscretePatch({
      weaponId,
      selectorMode: nextMode,
      ...(weaponSwitched
        ? {
            isDraggingAction: false,
            isPressCheck: false,
            isTriggerHeld: false,
            awaitingDisconnectorReset: false,
          }
        : {}),
    });
  },

  setSelectorMode(
    requestedMode: FireSelectorMode,
    explicitWeaponId?: WeaponId
  ): FireSelectorMode {
    const weaponId =
      explicitWeaponId ?? useAppStore.getState().activeWeaponId ?? 'ak15';
    this.syncWeapon(weaponId);

    const supported = getSupportedSelectorModes(weaponId);
    const defaultLiveMode: FireSelectorMode = supported.includes('semi')
      ? 'semi'
      : supported[supported.length - 1];
    const resolvedMode: FireSelectorMode = supported.includes(requestedMode)
      ? requestedMode
      : defaultLiveMode;

    if (currentSnapshot.selectorMode !== resolvedMode) {
      playSelectorDetentSound(resolvedMode);

      if (resolvedMode === 'safe') {
        const st = useAppStore.getState();
        if (st.fireLoop) {
          st.toggleFireLoop();
        }
        if (st.isFiringPlaying) {
          st.stopFiringPlay();
        }
        autoBurstBroke = false;
        transientState.triggerPullProgress = 0;
      } else if (resolvedMode === 'semi') {
        const st = useAppStore.getState();
        if (st.fireLoop) {
          st.toggleFireLoop();
        }
      }

      commitDiscretePatch({
        selectorMode: resolvedMode,
        isTriggerHeld: false,
        awaitingDisconnectorReset: false,
      });
    }

    return resolvedMode;
  },

  cycleSelectorMode(explicitWeaponId?: WeaponId): FireSelectorMode {
    const weaponId =
      explicitWeaponId ?? useAppStore.getState().activeWeaponId ?? 'ak15';
    this.syncWeapon(weaponId);
    const supported = getSupportedSelectorModes(weaponId);
    const idx = supported.indexOf(currentSnapshot.selectorMode);
    const next = supported[(idx + 1) % supported.length];
    return this.setSelectorMode(next, weaponId);
  },

  beginActionDrag(): void {
    const weaponId = useAppStore.getState().activeWeaponId;
    this.syncWeapon(weaponId);
    ensureWorkbenchFiringPaused();

    const initialRack = currentSnapshot.isPressCheck
      ? PRESS_CHECK_RACK_RATIO
      : transientState.manualRackProgress;
    rackPhase = 'pointer_drag';
    resetTailFinishActive = false;
    lastDetentBand = computeDetentBand(
      initialRack,
      WEAPON_ACTION_DRAG_SPECS[weaponId].detentThresholds
    );
    transientState.manualRackProgress = initialRack;
    transientState.recoilSpringForceN = computeRecoilSpringForceN(
      weaponId,
      initialRack
    );
    playbackClock.setFireProgress(
      mapManualRackToFireProgress(initialRack, weaponId),
      true
    );

    if (initialRack < 0.05) {
      playPressCheckSpringSound('pull');
    }

    commitDiscretePatch({
      isDraggingAction: true,
      isPressCheck: false,
    });
  },

  updateActionDrag(rearwardDeltaNorm: number): void {
    if (rackPhase !== 'pointer_drag') {
      this.beginActionDrag();
    }
    const weaponId = currentSnapshot.weaponId;
    const cur = transientState.manualRackProgress;

    // Progressive recoil-spring stiffness resists rearward pull and assists forward return
    const resistanceFactor =
      rearwardDeltaNorm >= 0
        ? 1 / (1 + 0.58 * cur * cur)
        : 1 + 0.24 * cur;

    const next = clamp01(cur + rearwardDeltaNorm * resistanceFactor);
    transientState.rackVelocity = next - cur;
    transientState.manualRackProgress = next;
    transientState.recoilSpringForceN = computeRecoilSpringForceN(
      weaponId,
      next
    );
    triggerDetentFeedbackIfCrossed(weaponId, cur, next);
    playbackClock.setFireProgress(
      mapManualRackToFireProgress(next, weaponId),
      true
    );
  },

  endActionDrag(): void {
    if (rackPhase !== 'pointer_drag') return;
    finalizeRackRelease();
  },

  startKeyboardRack(): void {
    const weaponId = useAppStore.getState().activeWeaponId;
    this.syncWeapon(weaponId);
    if (rackPhase === 'keyboard_rack') return;

    ensureWorkbenchFiringPaused();
    resetTailFinishActive = false;
    rackPhase = 'keyboard_rack';
    lastDetentBand = computeDetentBand(
      transientState.manualRackProgress,
      WEAPON_ACTION_DRAG_SPECS[weaponId].detentThresholds
    );
    playPressCheckSpringSound('pull');
    commitDiscretePatch({
      isDraggingAction: true,
      isPressCheck: false,
    });
  },

  releaseKeyboardRack(): void {
    if (rackPhase !== 'keyboard_rack') return;
    finalizeRackRelease();
  },

  setPressCheck(enabled: boolean): boolean {
    const weaponId = useAppStore.getState().activeWeaponId;
    this.syncWeapon(weaponId);

    if (enabled) {
      ensureWorkbenchFiringPaused();
      resetTailFinishActive = false;
      rackPhase = 'press_check_hold';
      playPressCheckSpringSound('pull');
      commitDiscretePatch({
        isPressCheck: true,
        isDraggingAction: false,
      });
      return true;
    }

    if (currentSnapshot.isPressCheck || rackPhase === 'press_check_hold') {
      rackPhase = 'snap_battery';
      playPressCheckSpringSound('release');
      commitDiscretePatch({
        isPressCheck: false,
        isDraggingAction: false,
      });
    }
    return false;
  },

  togglePressCheck(): boolean {
    return this.setPressCheck(!currentSnapshot.isPressCheck);
  },

  pressInteractiveTrigger(): void {
    const st = useAppStore.getState();
    this.syncWeapon(st.activeWeaponId);
    const mode = currentSnapshot.selectorMode;

    // 1. SAFE: Mechanical safety block stops trigger dead and emits dry metallic click
    if (mode === 'safe') {
      if (st.isFiringPlaying) {
        st.stopFiringPlay();
      }
      transientState.triggerPullProgress = 0.18;
      if (st.mode === 'firing' && rackPhase === 'idle') {
        playbackClock.setFireProgress(0.012, true);
      }
      playTriggerDryBlockSound();
      commitDiscretePatch({
        isTriggerHeld: true,
        safetyBlockedSeq: currentSnapshot.safetyBlockedSeq + 1,
      });
      return;
    }

    // Release any open press-check before live trigger pull
    if (currentSnapshot.isPressCheck || rackPhase === 'press_check_hold') {
      rackPhase = 'idle';
      transientState.manualRackProgress = 0;
      transientState.recoilSpringForceN = 0;
      playbackClock.setFireProgress(0, true);
      commitDiscretePatch({ isPressCheck: false });
    }

    // 2. SEMI: If hammer/striker is still held on disconnector from prior shot, block re-fire until reset!
    if (mode === 'semi' && currentSnapshot.awaitingDisconnectorReset) {
      commitDiscretePatch({ isTriggerHeld: true });
      return;
    }

    autoBurstBroke = false;
    resetTailFinishActive = false;
    commitDiscretePatch({ isTriggerHeld: true });
  },

  releaseInteractiveTrigger(): void {
    if (!currentSnapshot.isTriggerHeld && !currentSnapshot.awaitingDisconnectorReset) {
      transientState.triggerPullProgress = 0;
      return;
    }

    const st = useAppStore.getState();
    const mode = currentSnapshot.selectorMode;
    const wasAwaitingReset = currentSnapshot.awaitingDisconnectorReset;
    const wasAutoFiring = mode === 'auto' && autoBurstBroke;

    if (mode === 'safe') {
      transientState.triggerPullProgress = 0;
      if (st.mode === 'firing' && !st.isFiringPlaying && rackPhase === 'idle') {
        playbackClock.setFireProgress(0, true);
      }
      commitDiscretePatch({ isTriggerHeld: false });
      return;
    }

    if (mode === 'semi') {
      if (wasAwaitingReset) {
        playTriggerResetSound();
        // Complete sear handoff tail (0.865 -> 1.0 -> 0.0) if paused on disconnector
        const curF = playbackClock.getState().fireProgress;
        if (st.mode === 'firing' && !st.isFiringPlaying && curF >= 0.8) {
          resetTailFinishActive = true;
        }
      } else if (
        st.mode === 'firing' &&
        !st.isFiringPlaying &&
        rackPhase === 'idle'
      ) {
        playbackClock.setFireProgress(0, true);
      }

      commitDiscretePatch({
        isTriggerHeld: false,
        awaitingDisconnectorReset: false,
      });
      return;
    }

    // AUTO release: disable fireLoop so active round finishes cleanly into battery and stops
    if (st.fireLoop) {
      st.toggleFireLoop();
    }
    if (wasAutoFiring) {
      playTriggerResetSound();
    } else if (
      st.mode === 'firing' &&
      !st.isFiringPlaying &&
      rackPhase === 'idle'
    ) {
      playbackClock.setFireProgress(0, true);
    }
    autoBurstBroke = false;

    commitDiscretePatch({
      isTriggerHeld: false,
      awaitingDisconnectorReset: false,
    });
  },

  step(dtRaw: number): void {
    const dt = Math.max(0, Math.min(dtRaw, 0.1));
    if (dt <= 0) return;

    const st = useAppStore.getState();
    if (st.activeWeaponId !== currentSnapshot.weaponId) {
      this.syncWeapon(st.activeWeaponId);
    }
    if (
      st.screen !== 'workbench' ||
      st.malfunctionActive ||
      st.caliperActive
    ) {
      return;
    }
    const weaponId = currentSnapshot.weaponId;

    // -------------------------------------------------------------------------
    // A. Manual Slide / Bolt / Charging-Handle Physics Integration
    // -------------------------------------------------------------------------
    if (rackPhase === 'keyboard_rack') {
      const cur = transientState.manualRackProgress;
      const pullRate = 2.65 / (1 + 0.45 * cur * cur);
      const next = clamp01(cur + pullRate * dt);
      transientState.rackVelocity = (next - cur) / dt;
      transientState.manualRackProgress = next;
      transientState.recoilSpringForceN = computeRecoilSpringForceN(
        weaponId,
        next
      );
      triggerDetentFeedbackIfCrossed(weaponId, cur, next);
      playbackClock.setFireProgress(
        mapManualRackToFireProgress(next, weaponId),
        true
      );
    } else if (rackPhase === 'press_check_hold') {
      const cur = transientState.manualRackProgress;
      const next = THREE.MathUtils.damp(cur, PRESS_CHECK_RACK_RATIO, 18, dt);
      transientState.rackVelocity = (next - cur) / dt;
      transientState.manualRackProgress = next;
      transientState.recoilSpringForceN = computeRecoilSpringForceN(
        weaponId,
        next
      );
      playbackClock.setFireProgress(
        mapManualRackToFireProgress(next, weaponId),
        true
      );
    } else if (rackPhase === 'snap_battery') {
      const cur = transientState.manualRackProgress;
      const dragSpec = WEAPON_ACTION_DRAG_SPECS[weaponId];
      // Damped spring-return dynamics: recoil-spring preload drives crisp return
      // with weapon-mass-calibrated rate (`springReturnRate`) and metallic lockup detent.
      const returnSpeed = dragSpec.springReturnRate * (0.48 + 0.58 * cur);
      const next = Math.max(0, cur - returnSpeed * dt);
      transientState.rackVelocity = (next - cur) / dt;
      transientState.manualRackProgress = next;
      transientState.recoilSpringForceN = computeRecoilSpringForceN(
        weaponId,
        next
      );

      if (next <= 0.004) {
        const hadMeaningfulTravel = snapBatteryStartRack > 0.16;
        snapBatteryStartRack = 0;
        lastDetentBand = 0;
        transientState.manualRackProgress = 0;
        transientState.recoilSpringForceN = 0;
        transientState.rackVelocity = 0;
        rackPhase = 'idle';
        playbackClock.setFireProgress(0, true);
        if (hadMeaningfulTravel) {
          playTriggerResetSound();
        }
      } else {
        playbackClock.setFireProgress(
          mapManualRackToFireProgress(next, weaponId),
          true
        );
      }
    } else if (rackPhase === 'chamber_round') {
      // Counter-recoil strip & chamber sweep across [0.68 -> 1.0]
      const feedSpeed = 2.9 + 1.8 * (chamberSweepF - 0.68);
      chamberSweepF += feedSpeed * dt;
      const remainingRatio = Math.max(0, (1.0 - chamberSweepF) / 0.32);
      transientState.manualRackProgress = remainingRatio;
      transientState.recoilSpringForceN = computeRecoilSpringForceN(
        weaponId,
        remainingRatio
      );
      transientState.rackVelocity = -feedSpeed;

      if (chamberSweepF >= 1.0) {
        chamberSweepF = 1.0;
        transientState.manualRackProgress = 0;
        transientState.recoilSpringForceN = 0;
        transientState.rackVelocity = 0;
        rackPhase = 'idle';
        playbackClock.setFireProgress(0, true);
      } else {
        playbackClock.setFireProgress(chamberSweepF, true);
      }
    }

    // -------------------------------------------------------------------------
    // B. Interactive Trigger Take-Up -> Sear Wall -> Break & Disconnector Reset
    // -------------------------------------------------------------------------
    const mode = currentSnapshot.selectorMode;

    if (currentSnapshot.isTriggerHeld && mode !== 'safe') {
      if (mode === 'semi' && currentSnapshot.awaitingDisconnectorReset) {
        transientState.triggerPullProgress = 1.0;
        // Hold firing cycle on disconnector latch (0.865) right after bolt lockup until user releases trigger
        const disconnectorHoldF = weaponId === 'awm' ? 0.81 : 0.865;
        if (
          st.mode === 'firing' &&
          st.isFiringPlaying &&
          playbackClock.getState().fireProgress >= disconnectorHoldF
        ) {
          st.stopFiringPlay();
          playbackClock.setFireProgress(disconnectorHoldF, true);
        }
      } else if (mode === 'auto' && autoBurstBroke) {
        transientState.triggerPullProgress = 1.0;
        if (!st.isFiringPlaying) {
          engageLiveFiringCycle(true);
        }
      } else {
        // Two-stage physical trigger travel: brisk slack take-up -> firm sear wall -> crisp glass break
        let p = transientState.triggerPullProgress;
        if (p < TRIGGER_TAKEUP_END) {
          p = Math.min(TRIGGER_TAKEUP_END, p + 13.5 * dt);
        } else if (p < TRIGGER_SEAR_WALL_END) {
          p = Math.min(TRIGGER_SEAR_WALL_END, p + 3.8 * dt);
        } else {
          p = 1.0;
        }

        if (p >= TRIGGER_SEAR_WALL_END) {
          transientState.triggerPullProgress = 1.0;
          if (mode === 'semi') {
            commitDiscretePatch({ awaitingDisconnectorReset: true });
            engageLiveFiringCycle(false);
          } else {
            autoBurstBroke = true;
            engageLiveFiringCycle(true);
          }
        } else {
          transientState.triggerPullProgress = p;
          if (
            st.mode === 'firing' &&
            !st.isFiringPlaying &&
            rackPhase === 'idle'
          ) {
            // Subtle 3D trigger shoe pre-travel visual feedback prior to sear break
            playbackClock.setFireProgress((p / TRIGGER_SEAR_WALL_END) * 0.052);
          }
        }
      }
    } else if (!currentSnapshot.isTriggerHeld) {
      if (transientState.triggerPullProgress > 0) {
        transientState.triggerPullProgress = Math.max(
          0,
          transientState.triggerPullProgress - 11.0 * dt
        );
      }

      if (resetTailFinishActive) {
        const curF = playbackClock.getState().fireProgress;
        const nextF = curF + 2.4 * dt;
        if (nextF >= 1.0) {
          resetTailFinishActive = false;
          playbackClock.setFireProgress(0, true);
        } else {
          playbackClock.setFireProgress(nextF, true);
        }
      }
    }
  },

  reset(explicitWeaponId?: WeaponId): void {
    const weaponId =
      explicitWeaponId ?? useAppStore.getState().activeWeaponId ?? 'ak15';
    const supported = getSupportedSelectorModes(weaponId);
    rackPhase = 'idle';
    chamberSweepF = 0.68;
    autoBurstBroke = false;
    resetTailFinishActive = false;
    lastDetentBand = 0;
    snapBatteryStartRack = 0;
    transientState.manualRackProgress = 0;
    transientState.triggerPullProgress = 0;
    transientState.recoilSpringForceN = 0;
    transientState.rackVelocity = 0;

    commitDiscretePatch({
      weaponId,
      selectorMode: supported.includes('semi')
        ? 'semi'
        : supported[supported.length - 1],
      isDraggingAction: false,
      isPressCheck: false,
      isTriggerHeld: false,
      awaitingDisconnectorReset: false,
      safetyBlockedSeq: 0,
    });
  },
};

export function useInteractiveActionStore(): Readonly<InteractiveActionSnapshot> {
  return useSyncExternalStore(
    interactiveActionStore.subscribe,
    interactiveActionStore.getSnapshot,
    interactiveActionStore.getServerSnapshot
  );
}

export const useInteractiveActionState = useInteractiveActionStore;

export function setFireSelectorMode(mode: FireSelectorMode): FireSelectorMode {
  return interactiveActionStore.setSelectorMode(mode);
}

export function cycleFireSelectorMode(): FireSelectorMode {
  return interactiveActionStore.cycleSelectorMode();
}

export function togglePressCheck(): boolean {
  return interactiveActionStore.togglePressCheck();
}

export function pressInteractiveTrigger(): void {
  interactiveActionStore.pressInteractiveTrigger();
}

export function releaseInteractiveTrigger(): void {
  interactiveActionStore.releaseInteractiveTrigger();
}

export function beginManualActionRack(): void {
  interactiveActionStore.beginActionDrag();
}

export function updateManualActionRack(rearwardDeltaNorm: number): void {
  interactiveActionStore.updateActionDrag(rearwardDeltaNorm);
}

export function releaseManualActionRack(): void {
  interactiveActionStore.endActionDrag();
}

export function stepInteractiveAction(dt: number): void {
  interactiveActionStore.step(dt);
}

function isEditableDomTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

// Module-pooled scratch vectors for camera-projected 3D action-axis computation (Zero GC)
const _axisOriginWorld = new THREE.Vector3();
const _axisTipWorld = new THREE.Vector3();
const _screenOrigin = new THREE.Vector3();
const _screenTip = new THREE.Vector3();

/**
 * Projects a normalized 3D world-space mechanical stroke vector onto screen-space
 * pixel unit coordinates `(dx, dy)` for intuitive 1:1 pointer grab-and-drag projection.
 * Uses pre-allocated scratch vectors (Zero GC).
 */
export function projectWorldDragAxisToScreen(
  worldAxis: readonly [number, number, number],
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  outXY: [number, number]
): [number, number] {
  const ax = Number.isFinite(worldAxis[0]) ? worldAxis[0] : -1;
  const ay = Number.isFinite(worldAxis[1]) ? worldAxis[1] : 0;
  const az = Number.isFinite(worldAxis[2]) ? worldAxis[2] : 0;
  const axisLen = Math.hypot(ax, ay, az);
  const ux = axisLen > 1e-6 ? ax / axisLen : -1;
  const uy = axisLen > 1e-6 ? ay / axisLen : 0;
  const uz = axisLen > 1e-6 ? az / axisLen : 0;

  _axisOriginWorld.set(0, 0, 0);
  _axisTipWorld.set(ux * 10, uy * 10, uz * 10);
  _screenOrigin.copy(_axisOriginWorld).project(camera);
  _screenTip.copy(_axisTipWorld).project(camera);

  const dxPx = (_screenTip.x - _screenOrigin.x) * 0.5 * Math.max(1, viewportWidth);
  const dyPx =
    -(_screenTip.y - _screenOrigin.y) * 0.5 * Math.max(1, viewportHeight);
  const len = Math.hypot(dxPx, dyPx);

  if (len > 1e-3 && Number.isFinite(len)) {
    outXY[0] = dxPx / len;
    outXY[1] = dyPx / len;
  } else {
    // Deterministic fallback when camera looks straight along the mechanical axis
    if (Math.abs(uy) > Math.abs(ux) && Math.abs(uy) >= Math.abs(uz)) {
      outXY[0] = 0;
      outXY[1] = uy > 0 ? -1 : 1;
    } else {
      outXY[0] = ux > 0.25 ? 1 : -1;
      outXY[1] = 0;
    }
  }
  return outXY;
}

interface OrbitControlsLike {
  enabled?: boolean;
}

/**
 * R3F Hands-On 3D Mechanical Action & Fire-Control Controller:
 * - Pointer drag on slide/bolt/charging-handle/lever/forend/breech (or Shift+drag in firing mode)
 *   projects pointer motion onto each exhibit's true 3D mechanical stroke axis against spring resistance
 * - `R` hold: manual slide/bolt rack (`< 50%` snaps into battery; `>= 85%` chambers a fresh round)
 * - `P` toggle: `28%` tactical Press-Check chamber peek
 * - `F` hold: interactive 2-stage trigger pull (`SAFE` dry block, `SEMI` sear break + disconnector reset, `AUTO` cyclic fire)
 * - `V` tap: cycle supported `SAFE / SEMI / AUTO` selector detents
 */
export const InteractiveActionController: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const getThreeState = useThree((s) => s.get);

  const dragAxisRef = useRef<[number, number]>([-1, 0]);
  const pointerDragRef = useRef<{
    active: boolean;
    pointerId: number;
    lastX: number;
    lastY: number;
    movedPx: number;
    startedRack: boolean;
    restoreOrbitEnabled: boolean;
    strokeSpanScale: number;
  }>({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    movedPx: 0,
    startedRack: false,
    restoreOrbitEnabled: false,
    strokeSpanScale: 1,
  });

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = useAppStore.getState();
      const explodeProgress = playbackClock.getState().animatedProgress;
      const canGrabHovered = canDragActionHandleNow(
        st,
        st.hoveredPartId,
        explodeProgress
      );
      const canShiftRack =
        e.shiftKey &&
        st.screen === 'workbench' &&
        st.mode === 'firing' &&
        !st.malfunctionActive &&
        !st.caliperActive &&
        !st.isFiringPlaying &&
        !st.textureModalOpen;

      if (!canGrabHovered && !canShiftRack) {
        return;
      }

      const dragSpec = getWeaponActionDragSpec(st.activeWeaponId);
      const worldAxis = resolveActionWorldDragAxis(
        st.activeWeaponId,
        canGrabHovered ? st.hoveredPartId : null
      );

      const r3f = getThreeState();
      projectWorldDragAxisToScreen(
        worldAxis,
        camera,
        Math.max(1, r3f.size.width),
        Math.max(1, r3f.size.height),
        dragAxisRef.current
      );

      const ctrl = r3f.controls as OrbitControlsLike | null | undefined;
      const wasOrbitEnabled = ctrl ? ctrl.enabled !== false : false;
      if (ctrl && wasOrbitEnabled) {
        ctrl.enabled = false;
      }

      pointerDragRef.current.active = true;
      pointerDragRef.current.pointerId = e.pointerId;
      pointerDragRef.current.lastX = e.clientX;
      pointerDragRef.current.lastY = e.clientY;
      pointerDragRef.current.movedPx = 0;
      pointerDragRef.current.startedRack = e.shiftKey;
      pointerDragRef.current.restoreOrbitEnabled = wasOrbitEnabled;
      pointerDragRef.current.strokeSpanScale = dragSpec.strokeSpanScale;

      if (e.shiftKey) {
        interactiveActionStore.beginActionDrag();
        document.body.style.cursor = 'grabbing';
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag.active || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.movedPx += Math.hypot(dx, dy);

      if (!drag.startedRack) {
        if (drag.movedPx < 4) return;
        drag.startedRack = true;
        interactiveActionStore.beginActionDrag();
        document.body.style.cursor = 'grabbing';
      }

      const axis = dragAxisRef.current;
      const strokeDeltaPx = dx * axis[0] + dy * axis[1];
      // Calibrated per-exhibit screen drag span scaled to viewport width
      const viewportWidth = getThreeState().size.width;
      const baseSpanPx = Math.max(
        115,
        Math.min(240, viewportWidth * 0.16)
      );
      const strokeSpanPx = baseSpanPx * drag.strokeSpanScale;
      interactiveActionStore.updateActionDrag(strokeDeltaPx / strokeSpanPx);
    };

    const finishPointerGesture = (e: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag.active || e.pointerId !== drag.pointerId) return;

      drag.active = false;
      drag.pointerId = -1;

      const ctrl = getThreeState().controls as
        | OrbitControlsLike
        | null
        | undefined;
      if (drag.restoreOrbitEnabled && ctrl) {
        ctrl.enabled = true;
      }
      drag.restoreOrbitEnabled = false;

      if (drag.startedRack) {
        drag.startedRack = false;
        interactiveActionStore.endActionDrag();
        const st = useAppStore.getState();
        const explodeProgress = playbackClock.getState().animatedProgress;
        document.body.style.cursor = st.hoveredPartId
          ? getCursorForPartHover(st, st.hoveredPartId, explodeProgress, false)
          : 'auto';
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishPointerGesture);
    window.addEventListener('pointercancel', finishPointerGesture);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointerGesture);
      window.removeEventListener('pointercancel', finishPointerGesture);
    };
  }, [gl, camera, getThreeState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableDomTarget(e.target)) return;

      const st = useAppStore.getState();
      if (
        st.screen !== 'workbench' ||
        st.malfunctionActive ||
        st.caliperActive ||
        st.textureModalOpen ||
        st.monographModalOpen
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'f') {
        if (!e.repeat) {
          e.preventDefault();
          interactiveActionStore.pressInteractiveTrigger();
        }
        return;
      }

      if (key === 'p') {
        if (!e.repeat) {
          e.preventDefault();
          interactiveActionStore.togglePressCheck();
        }
        return;
      }

      if (key === 'v' && st.mode === 'firing') {
        if (!e.repeat) {
          e.preventDefault();
          interactiveActionStore.cycleSelectorMode(st.activeWeaponId);
        }
        return;
      }

      // In Workbench `firing` mode, holding `R` racks the slide/bolt rather than resetting back to `explode`
      if (key === 'r' && st.mode === 'firing') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) {
          interactiveActionStore.startKeyboardRack();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'f') {
        interactiveActionStore.releaseInteractiveTrigger();
      } else if (key === 'r') {
        interactiveActionStore.releaseKeyboardRack();
      }
    };

    const onWindowBlur = () => {
      interactiveActionStore.releaseInteractiveTrigger();
      interactiveActionStore.releaseKeyboardRack();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  useEffect(() => {
    return useAppStore.subscribe((st) => {
      if (st.activeWeaponId !== interactiveActionStore.getState().weaponId) {
        interactiveActionStore.syncWeapon(st.activeWeaponId);
      }
    });
  }, []);

  useFrame((_, delta) => {
    interactiveActionStore.step(delta);
  });

  return null;
};

InteractiveActionController.displayName = 'InteractiveActionController';
