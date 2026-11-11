import {
  BallisticsVisualState,
  FiringPhaseInfo,
  PartKinematicDelta,
} from './firingCycleSpec';

export const AK15_FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'ak_trigger_hammer',
    stepNum: '01',
    shortLabel: '扣扳机释击锤',
    title: '阶段 1 · 扣动双钩扳机与多股扭簧驱动击锤前旋',
    range: [0.0, 0.16],
    description:
      '手指扣动弧形扳机（快慢机置于单发 ОД 或连发 АВ），扳机前部双钩主阻铁向下潜入脱离击锤待击卡槽；回转击锤在三股绞合双翼扭簧驱动下绕横轴高速向前上方挥击。',
  },
  {
    id: 'ak_pin_ignition',
    stepNum: '02',
    shortLabel: '击针刺破底火',
    title: '阶段 2 · 浮动长击针前冲撞击 7.62×39mm 弹底火',
    range: [0.16, 0.24],
    description:
      '由于双突笋枪机已完全闭锁且枪机框处于最前位，不到位保险让开通道，击锤正面重重敲击浮动式长击针尾端；击针尖刺破 M43 步枪弹底火，瞬间引燃锥形弹壳内的双基发射药。',
  },
  {
    id: 'ak_gas_tap',
    stepNum: '03',
    shortLabel: '过导气孔引气',
    title: '阶段 3 · 弹头高速越过 90° 导气箍分流高压火药燃气',
    range: [0.24, 0.34],
    description:
      '7.62mm 覆铜钢芯尖头弹沿 415mm 镀铬膛线加速前冲；当弹头越过枪管前段导气孔瞬间，部分高压火药燃气经 90° 导气箍垂直涌入导气管气室，猛烈冲击长行程导气活塞凹面端头，随后弹头冲出五槽消焰器。',
  },
  {
    id: 'ak_piston_unlock',
    stepNum: '04',
    shortLabel: '活塞推框旋锁',
    title: '阶段 4 · 长行程活塞自由行程泄压与 35° 螺旋回转开锁',
    range: [0.34, 0.54],
    description:
      '长行程活塞推动枪机框先行单独后退约 7mm 自由行程（待弹头离膛、膛压安全下降），随后枪机框内壁螺旋导槽强制拨动枪机主凸耳，驱动双突笋枪机顺时针旋转约 35° 脱离前节套闭锁槽，携枪机高速后坐并压倒击锤！',
  },
  {
    id: 'ak_extract_eject',
    stepNum: '05',
    shortLabel: '拉壳撞挺抛壳',
    title: '阶段 5 · 爪式抽壳钩拉出锥形弹壳并撞击抛壳挺翻滚抛出',
    range: [0.45, 0.72],
    description:
      '枪机右侧重型抽壳钩紧紧咬住 7.62×39mm 弹壳底缘抽出弹膛；当空弹壳随枪机后退撞上机匣左侧刚性固定抛壳挺时，弹壳以右侧抽壳钩为支点向右上前方猛烈翻滚抛出防尘盖抛壳口。',
  },
  {
    id: 'ak_feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹旋闭',
    title: '阶段 6 · 香蕉弹匣托弹上升与枪机前冲推弹逆旋闭锁',
    range: [0.56, 0.86],
    description:
      '大弧度观察窗弹匣内下一发 7.62 步枪弹上托至抱弹口；多股螺旋复进簧释放能量推枪机框与长行程活塞高速复进，枪机下突笋推新弹滑入弹膛，螺旋导槽反向驱动枪机逆时针旋转 35° 锁死前节套。',
  },
  {
    id: 'ak_sear_reset',
    stepNum: '07',
    shortLabel: '单发断路交接',
    title: '阶段 7 · 松开扳机，中央单发阻铁将击锤交接回主阻铁',
    range: [0.86, 1.0],
    description:
      '后坐期间被压倒的击锤原本由中央单发阻铁后钩暂时扣住（防止半自动连发）；射手松开扳机后，单发阻铁前倾脱钩，击锤微幅上抬即被双钩主阻铁重新稳稳接住，发出清脆“咔哒”声完成待击复位。',
  },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function seg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  const u = (f - start) / (end - start);
  return u * u * (3 - 2 * u);
}

function linearSeg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  return (f - start) / (end - start);
}

export function getActiveAk15FiringPhase(f: number): FiringPhaseInfo {
  for (let i = AK15_FIRING_PHASES.length - 1; i >= 0; i--) {
    if (f >= AK15_FIRING_PHASES[i].range[0]) {
      return AK15_FIRING_PHASES[i];
    }
  }
  return AK15_FIRING_PHASES[0];
}

export interface ExtendedBallisticsState extends BallisticsVisualState {
  gasPortFlashIntensity: number;
  gasPortPos: [number, number, number];
}

/**
 * Real-time mechanical kinematics for all 26 AK-15M1 parts at firing progress f ∈ [0, 1].
 */
export function computeAk15FiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  const ry = 0;
  let rz = 0;
  let scaleX = 1;

  // 1. Master Bolt Carrier + Long-Stroke Gas Piston Recoil Stroke (X delta: 0 -> -5.75 at f=0.54 -> 0 at f=0.85)
  const carrierBack = seg(f, 0.31, 0.54);
  const carrierReturn = seg(f, 0.57, 0.85);
  const carrierDX = -5.75 * (carrierBack - carrierReturn);

  // 2. Rotating Bolt: stays at X=0 during initial free travel [0.31..0.35], unlocks by rotating +0.62 rad around X,
  // then travels rearward by -5.15 with the carrier, then pushes round home and rotates -0.62 rad back into lockup [0.78..0.85]!
  const boltRotUnlock = seg(f, 0.34, 0.4) - seg(f, 0.78, 0.85);
  const boltBack = seg(f, 0.355, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -5.15 * boltBack;
  const boltRX = 0.62 * boltRotUnlock;

  switch (partId) {
    case 'ak_bolt_carrier': {
      dx = carrierDX;
      break;
    }

    case 'ak_bolt': {
      dx = boltDX;
      rx = boltRX;
      break;
    }

    case 'ak_extractor': {
      dx = boltDX;
      rx = boltRX;
      // Snap flex over rim when locking onto fresh 7.62x39mm case
      const rimSnap = Math.sin(linearSeg(f, 0.77, 0.84) * Math.PI);
      dz = 0.08 * rimSnap;
      break;
    }

    case 'ak_firing_pin': {
      // Driven forward +0.34 by hammer blow at [0.15, 0.21], rebounds slightly, and rides with bolt!
      const pinStrike = seg(f, 0.145, 0.19) - seg(f, 0.24, 0.34);
      dx = boltDX + 0.36 * pinStrike;
      break;
    }

    case 'ak_recoil_spring': {
      // Assembled spring spans local X ∈ [-5.6, +3.6] (L0 = 9.2)
      // Rear end (-5.6) stays seated at rear trunnion; front end (+3.6) compresses with carrierDX!
      const x0Orig = -5.6;
      const L0 = 9.2;
      const x1New = 3.6 + carrierDX;
      const LNew = Math.max(3.35, x1New - x0Orig);
      scaleX = LNew / L0;
      dx = x0Orig - x0Orig * scaleX;
      break;
    }

    case 'ak_hammer': {
      // Cocked at rz = 0 -> swings forward (rz = -0.96) at [0.07, 0.16] to strike firing pin ->
      // pushed all the way back down & slightly overcocked (rz = +0.14) by recoiling carrier [0.36, 0.48] ->
      // held on disconnector at rz = +0.08 until trigger release [0.88, 0.95] -> settles at rz = 0!
      const swingStrike = seg(f, 0.07, 0.155);
      const recockByCarrier = seg(f, 0.36, 0.47);
      const overcockDip = Math.sin(linearSeg(f, 0.43, 0.56) * Math.PI) * 0.1;
      const handoffToPrimary = seg(f, 0.89, 0.95);

      rz =
        -0.96 * swingStrike +
        1.04 * recockByCarrier +
        overcockDip -
        0.08 * handoffToPrimary;
      break;
    }

    case 'ak_trigger': {
      // Pulled back (rz = -0.25) during [0.00, 0.14], held down until reset [0.87, 0.96]
      const pull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.96);
      rz = -0.25 * pull;
      break;
    }

    case 'ak_disconnector': {
      // Tilts with trigger, plus rocks backward briefly when hammer cams past its hook at [0.42, 0.50]
      const pull = seg(f, 0.0, 0.14) - seg(f, 0.87, 0.96);
      const camSnap = Math.sin(linearSeg(f, 0.42, 0.5) * Math.PI) * 0.16;
      rz = -0.18 * pull + camSnap;
      break;
    }

    case 'ak_mag_follower': {
      // Subtle upward feed pulse along curved mag path when stripping next cartridge
      const pulse = seg(f, 0.52, 0.63) - seg(f, 0.66, 0.8);
      dx = -0.08 * pulse;
      dy = 0.42 * pulse;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

/**
 * Computes 7.62×39mm M43 cartridge, spitzer projectile, gas-block port tap flash, muzzle flash & case ejection.
 */
export function computeAk15BallisticsState(
  fRaw: number
): ExtendedBallisticsState {
  const f = clamp01(fRaw);

  const boltBack = seg(f, 0.355, 0.54) - seg(f, 0.57, 0.82);
  const boltDX = -5.15 * boltBack;

  // 1. 7.62mm Spitzer Projectile:
  // Seated at chamber neck [7.15, 1.05, 0] until f = 0.21 -> accelerates down 415mm barrel past gas port X=16.7 (at f≈0.275) ->
  // exits flash suppressor X=25.6 at f = 0.305 -> supersonic downrange flight [0.305, 0.46]!
  const bulletVisible = f < 0.46;
  let bulletX = 7.15;
  let streakLength = 0;

  if (f >= 0.21 && f < 0.305) {
    const u = Math.pow(linearSeg(f, 0.21, 0.305), 1.45);
    bulletX = 7.15 + 18.5 * u; // Reaches muzzle X = 25.65 at f = 0.305
    streakLength = 4.2 * u;
  } else if (f >= 0.305 && f < 0.46) {
    const u = linearSeg(f, 0.305, 0.46);
    bulletX = 25.65 + 48.0 * u;
    streakLength = 9.5 * (1 - u * 0.45);
  }

  // 2. Spent 7.62×39mm Bottleneck Case:
  // Seated in chamber at [5.15, 1.05, 0] -> extracted rearward with boltDX [0.355, 0.48] ->
  // strikes fixed left ejector at X ≈ 1.4 and tumbles vigorously out right-upper dust cover port [0.48, 0.76]!
  const spentCaseVisible = f < 0.76;
  let caseX = 5.15;
  let caseY = 1.05;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.355 && f < 0.48) {
    caseX = 5.15 + boltDX;
  } else if (f >= 0.48 && f < 0.76) {
    const u = linearSeg(f, 0.48, 0.76);
    const ejectOriginX = 1.35;
    caseX = ejectOriginX + 3.2 * u; // AK throws cases slightly forward-right!
    caseY = 1.15 + 8.6 * u - 10.5 * u * u;
    caseZ = 12.8 * u;
    caseRX = u * 9.5;
    caseRY = -u * 14.0;
    caseRZ = -u * 11.5;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash, 90° Gas-Block Port Tap Flash, & Slotted Birdcage Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.19 && f <= 0.28) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.19, 0.28) * Math.PI);
  }

  let gasPortFlashIntensity = 0;
  if (f >= 0.265 && f <= 0.355) {
    gasPortFlashIntensity = Math.sin(linearSeg(f, 0.265, 0.355) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.295 && f <= 0.39) {
    const u = linearSeg(f, 0.295, 0.39);
    muzzlePlumeScale = 0.45 + 1.55 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.85;
  }

  // 4. Next 7.62×39mm Cartridge in Curved Mag -> Stripped up bullet guide into Chamber [5.15, 1.05, 0]
  let nextX = 2.55;
  let nextY = -0.15;
  let nextRZ = 0.16;

  if (f >= 0.52 && f < 0.62) {
    const u = seg(f, 0.52, 0.62);
    nextX = 2.55 + 0.15 * u;
    nextY = -0.15 + 0.55 * u;
    nextRZ = 0.16 + 0.06 * u;
  } else if (f >= 0.62 && f < 0.84) {
    const u = seg(f, 0.62, 0.84);
    const guideArc = Math.sin(u * Math.PI) * 0.22;
    nextX = 2.7 + (5.15 - 2.7) * u;
    nextY = 0.4 + (1.05 - 0.4) * u + guideArc;
    nextRZ = 0.22 * (1 - u);
  } else if (f >= 0.84) {
    nextX = 5.15;
    nextY = 1.05;
    nextRZ = 0;
  }

  // 5. Reserve Cartridge underneath in Curved Mag
  const magShift = seg(f, 0.52, 0.72);
  const resX = 2.78 + (2.55 - 2.78) * magShift;
  const resY = -1.25 + (-0.15 - -1.25) * magShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 1.05, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    gasPortFlashIntensity,
    gasPortPos: [16.4, 2.25, 0],
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0.14],
  };
}
