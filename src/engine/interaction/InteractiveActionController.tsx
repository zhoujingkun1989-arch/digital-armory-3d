import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { WEAPON_IDS, type WeaponId } from '../../weapons/types';
import {
  playPressCheckSpringSound,
  playSelectorDetentSound,
  playTriggerDryBlockSound,
  playTriggerResetSound,
} from '../audio/mechanicalSoundEngine';
import { playbackClock } from '../clock/playbackClock';
import { clamp01 } from '../kinematics/math';

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
  weaponId: WeaponId | 'lift33' | 'r500';
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

const WEAPON_SELECTOR_CAPABILITIES: Record<
  WeaponId | 'lift33' | 'r500',
  readonly FireSelectorMode[]
> = {
  // Select-fire military assault rifles, SMGs & PDWs
  ak15: SELECT_FIRE_MODES,
  m4a1: SELECT_FIRE_MODES,
  mp5: SELECT_FIRE_MODES,
  scar: SELECT_FIRE_MODES,
  aug: SELECT_FIRE_MODES,
  p90: SELECT_FIRE_MODES,
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
};

/**
 * Bilingual authentic Fire-Control Group (FCG) selector documentation per firearm.
 */
export const WEAPON_FIRE_CONTROL_PROFILES: Record<
  WeaponId | 'lift33' | 'r500',
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
};

function isArcheryInteractiveWeapon(
  weaponId: WeaponId | string | null | undefined
): boolean {
  return weaponId === 'lift33' || weaponId === 'r500';
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

const EXPLICIT_WEAPON_ACTION_PARTS: Record<
  WeaponId | 'lift33' | 'r500',
  readonly string[]
> = {
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
};

const GENERIC_ACTION_PART_INCLUDE_RE =
  /(?:^|_)(?:slide|bolt_carrier|charging_handles?|bolt_body|bolt_head|bolt|operating_rod)(?:$|_)/i;
const GENERIC_ACTION_PART_EXCLUDE_RE =
  /(?:slide_lock|slide_stop|slide_catch|slide_cover|bolt_catch|crossbolts?|barrel_lock)/i;

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
  if (weaponId === 'benellim4' || weaponId === 'garand') {
    return 0.22 + r * 0.28;
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

  if ((weaponId as string) === 'lift33') {
    const peakN = 311.4;
    const holdN = 46.7;
    if (r < 0.65) {
      return peakN * Math.sin((r / 0.65) * (Math.PI * 0.5));
    }
    const d = (r - 0.65) / 0.35;
    return peakN - (peakN - holdN) * (d * d * (3 - 2 * d));
  }
  if ((weaponId as string) === 'r500') {
    const peakN = 1334.5;
    const holdN = 827.4;
    if (r < 0.72) {
      return peakN * Math.sin((r / 0.72) * (Math.PI * 0.5));
    }
    const d = (r - 0.72) / 0.28;
    return peakN - (peakN - holdN) * (d * d * (3 - 2 * d));
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
    const nextMode = supported.includes(currentSnapshot.selectorMode)
      ? currentSnapshot.selectorMode
      : 'semi';

    const weaponSwitched = currentSnapshot.weaponId !== weaponId;
    if (weaponSwitched) {
      rackPhase = 'idle';
      autoBurstBroke = false;
      resetTailFinishActive = false;
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
    const resolvedMode: FireSelectorMode = supported.includes(requestedMode)
      ? requestedMode
      : 'semi';

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
      const returnSpeed = 5.2 + 6.4 * cur;
      const next = Math.max(0, cur - returnSpeed * dt);
      transientState.rackVelocity = (next - cur) / dt;
      transientState.manualRackProgress = next;
      transientState.recoilSpringForceN = computeRecoilSpringForceN(
        weaponId,
        next
      );

      if (next <= 0.004) {
        transientState.manualRackProgress = 0;
        transientState.recoilSpringForceN = 0;
        transientState.rackVelocity = 0;
        rackPhase = 'idle';
        playbackClock.setFireProgress(0, true);
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
    transientState.manualRackProgress = 0;
    transientState.triggerPullProgress = 0;
    transientState.recoilSpringForceN = 0;
    transientState.rackVelocity = 0;

    commitDiscretePatch({
      weaponId,
      selectorMode: supported.includes('semi') ? 'semi' : supported[0],
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

// Module-pooled scratch vectors for camera-projected barrel (-X) axis computation (Zero GC)
const _muzzleWorld = new THREE.Vector3();
const _breechWorld = new THREE.Vector3();
const _screenMuzzle = new THREE.Vector3();
const _screenBreech = new THREE.Vector3();

function computeScreenRearwardUnitAxis(
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  outXY: [number, number]
): void {
  _muzzleWorld.set(10, 0, 0);
  _breechWorld.set(-10, 0, 0);
  _screenMuzzle.copy(_muzzleWorld).project(camera);
  _screenBreech.copy(_breechWorld).project(camera);

  const dxPx = (_screenBreech.x - _screenMuzzle.x) * 0.5 * viewportWidth;
  const dyPx = -(_screenBreech.y - _screenMuzzle.y) * 0.5 * viewportHeight;
  const len = Math.hypot(dxPx, dyPx);

  if (len > 1e-3) {
    outXY[0] = dxPx / len;
    outXY[1] = dyPx / len;
  } else {
    // Fallback when looking straight down the bore axis: dragging left (-X) retracts
    outXY[0] = -1;
    outXY[1] = 0;
  }
}

interface OrbitControlsLike {
  enabled?: boolean;
}

/**
 * R3F Hands-On 3D Mechanical Action & Fire-Control Controller:
 * - Pointer drag on slide/bolt/charging-handle (or Shift+drag) in paused Workbench `firing` mode
 *   projects pointer motion onto the firearm's 3D `-X` breech axis to manually rack against recoil-spring force
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
  }>({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    movedPx: 0,
    startedRack: false,
    restoreOrbitEnabled: false,
  });

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = useAppStore.getState();
      if (
        st.screen !== 'workbench' ||
        st.mode !== 'firing' ||
        st.malfunctionActive ||
        st.caliperActive ||
        st.isFiringPlaying ||
        st.textureModalOpen
      ) {
        return;
      }

      const hoveredIsAction = isWeaponActionPart(
        st.activeWeaponId,
        st.hoveredPartId
      );
      if (!e.shiftKey && !hoveredIsAction) {
        return;
      }

      const r3f = getThreeState();
      computeScreenRearwardUnitAxis(
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
      const rearwardPx = dx * axis[0] + dy * axis[1];
      // ~175px screen drag spans full bolt/slide stroke
      const viewportWidth = getThreeState().size.width;
      const strokeSpanPx = Math.max(
        120,
        Math.min(240, viewportWidth * 0.16)
      );
      interactiveActionStore.updateActionDrag(rearwardPx / strokeSpanPx);
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
        document.body.style.cursor = 'auto';
        interactiveActionStore.endActionDrag();
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
