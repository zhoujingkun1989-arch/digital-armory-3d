export interface FiringPhaseInfo {
  id: string;
  stepNum: string;
  shortLabel: string;
  title: string;
  range: [number, number];
  description: string;
}

export const FIRING_PHASES: FiringPhaseInfo[] = [
  {
    id: 'trigger_pull',
    stepNum: '01',
    shortLabel: '扣扳机解保险',
    title: '阶段 1 · 扣动扳机与三重保险逐级解除',
    range: [0.0, 0.18],
    description:
      '手指先压平扳机中央保险舌片（解除第一重保险），随后扳机连杆后移：连杆上方鸟嘴凸起将击针保险柱塞向上顶开（解除第二重保险），尾部十字片将半待击的击针继续向后拉至全待击满蓄能位置。',
  },
  {
    id: 'sear_release',
    stepNum: '02',
    shortLabel: '阻铁断路击发',
    title: '阶段 2 · 十字尾沿阻铁斜面下沉释放击针',
    range: [0.18, 0.25],
    description:
      '扳机连杆后移到底时，右侧凸耳受 L 形阻铁片（Connector）45° 斜面引导向下潜入，脱离防跌落平台（解除第三重保险）；十字尾下沉脱钩，击针在击针簧推动下高速前冲撞击弹底火。',
  },
  {
    id: 'projectile_exit',
    stepNum: '03',
    shortLabel: '燃气推弹出膛',
    title: '阶段 3 · 发射药燃爆膨胀与弹头出膛',
    range: [0.25, 0.36],
    description:
      '底火引燃发射药产生高压高温燃气，推动紫铜被甲弹头沿枪管膛线高速向前加速并冲出枪口，膛口形成锥形火药燃气羽流。',
  },
  {
    id: 'unlock_recoil',
    stepNum: '04',
    shortLabel: '枪管偏移开锁',
    title: '阶段 4 · 勃朗宁枪管下倾开锁与套筒后坐',
    range: [0.36, 0.54],
    description:
      '后坐冲量带动套筒与枪管共同短暂后退约 3mm 后，枪管下凸耳撞击机匣金属闭锁块斜面，迫使枪管尾端向下倾转脱离套筒抛壳窗完成开锁；套筒继续独立后坐到底并大幅压缩扁钢丝复进簧。',
  },
  {
    id: 'extract_eject',
    stepNum: '05',
    shortLabel: '抽壳撞挺抛壳',
    title: '阶段 5 · 抽壳钩拉壳与抛壳挺踢出空弹壳',
    range: [0.46, 0.72],
    description:
      '套筒后坐过程中，右侧抽壳钩紧紧勾住空黄铜弹壳底缘将其抽出弹膛；当弹壳左侧底部撞击扳机座上固定的钢制抛壳挺（Ejector）时，空弹壳向右侧上方抛壳窗翻滚抛出。',
  },
  {
    id: 'feed_lock',
    stepNum: '06',
    shortLabel: '复进推弹上膛',
    title: '阶段 6 · 弹匣托弹上升与复进推弹闭锁',
    range: [0.56, 0.86],
    description:
      '弹匣内下一发弹在托弹簧作用下上升至抱弹口；复进簧释放能量推套筒高速前冲，套筒下沿推新弹顺着枪管坡道（Feed Ramp）滑入弹膛，同时顶推枪管复原上抬重新卡入抛壳窗闭锁，击针挂入半待击位。',
  },
  {
    id: 'trigger_reset',
    stepNum: '07',
    shortLabel: '扳机断路复位',
    title: '阶段 7 · 松开扳机与半自动断路复位',
    range: [0.86, 1.0],
    description:
      '松开扳机后，扳机连杆前移，先前被套筒压向内侧断路的阻铁片向外弹回，将十字尾重新托举回击针挂机齿正前方（发出清脆复位声），击针保险柱塞回落闭锁，准备下一次击发。',
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

export function getActiveFiringPhase(f: number): FiringPhaseInfo {
  for (let i = FIRING_PHASES.length - 1; i >= 0; i--) {
    if (f >= FIRING_PHASES[i].range[0]) {
      return FIRING_PHASES[i];
    }
  }
  return FIRING_PHASES[0];
}

export interface PartKinematicDelta {
  pos: [number, number, number];
  rot: [number, number, number];
  scaleX: number;
}

/**
 * Computes real-time firing-cycle mechanical kinematics for any of the 28 G17 parts at cycle progress f ∈ [0, 1].
 */
export function computeFiringKinematics(
  partId: string,
  fRaw: number
): PartKinematicDelta {
  const f = clamp01(fRaw);
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let scaleX = 1;

  // Master Slide Recoil Stroke (X delta: 0 -> -4.45 cm at f=0.54 -> 0 at f=0.85)
  const slideRecoilIn = seg(f, 0.33, 0.54);
  const slideReturn = seg(f, 0.57, 0.85);
  const slideDX = -4.45 * (slideRecoilIn - slideReturn);

  // Master Barrel Browning Tilting-Unlock Motion (locks back up during 0.75..0.85)
  const barrelUnlockIn = seg(f, 0.33, 0.43);
  const barrelLockReturn = seg(f, 0.75, 0.85);
  const barrelFactor = barrelUnlockIn - barrelLockReturn;
  const barrelDX = -0.58 * barrelFactor;
  const barrelDY = -0.22 * barrelFactor;
  const barrelRZ = 0.044 * barrelFactor; // Muzzle tilts slightly up, chamber drops clear of slide roof

  const isSlideRigidChild =
    partId === 'slide' ||
    partId === 'front_sight' ||
    partId === 'rear_sight' ||
    partId === 'slide_cover_plate' ||
    partId === 'extractor' ||
    partId === 'extractor_plunger';

  if (isSlideRigidChild) {
    dx = slideDX;
    // Subtle outward extractor flex when rim snaps in during chambering
    if (partId === 'extractor') {
      const snap = Math.sin(linearSeg(f, 0.78, 0.85) * Math.PI);
      dz = 0.06 * snap;
    }
    return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
  }

  switch (partId) {
    case 'barrel': {
      // Pivot compensation around Y=2.55 so chamber hood drops cleanly without excessive X shift
      dx = barrelDX + 2.55 * Math.sin(barrelRZ);
      dy = barrelDY;
      rz = barrelRZ;
      break;
    }

    case 'recoil_guide_rod': {
      // Guide rod rear flange stays seated against the barrel lug while slide recoils over its front tip!
      dx = barrelDX;
      break;
    }

    case 'recoil_spring': {
      // Original recoil spring spans X ∈ [2.02, 10.62] (L0 = 8.60)
      const x0Orig = 2.02;
      const L0 = 8.6;
      const x0New = x0Orig + barrelDX;
      const x1New = 10.62 + slideDX;
      const LNew = Math.max(3.2, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      break;
    }

    case 'striker': {
      // 1) Cocked back -0.62 in [0.04, 0.18]
      // 2) Released forward to +0.46 at [0.185, 0.225]
      // 3) Rides with slide during recoil, then picked up by cruciform at half-cock during return [0.74, 0.85]
      const pullBack = seg(f, 0.04, 0.18);
      const snapForward = seg(f, 0.185, 0.222);
      const recock = seg(f, 0.72, 0.85);
      const localStrikerX =
        -0.62 * pullBack + 1.08 * snapForward - 0.46 * recock;
      dx = slideDX + localStrikerX;
      break;
    }

    case 'striker_spring': {
      // Original striker spring spans X ∈ [-5.85, -2.15] (L0 = 3.70)
      // Rear (-5.85) moves with slideDX; Front (-2.15) moves with striker total DX
      const pullBack = seg(f, 0.04, 0.18);
      const snapForward = seg(f, 0.185, 0.222);
      const recock = seg(f, 0.72, 0.85);
      const localStrikerX =
        -0.62 * pullBack + 1.08 * snapForward - 0.46 * recock;

      const x0Orig = -5.85;
      const L0 = 3.7;
      const x0New = x0Orig + slideDX;
      const x1New = -2.15 + slideDX + localStrikerX;
      const LNew = Math.max(1.8, x1New - x0New);
      scaleX = LNew / L0;
      dx = x0New - x0Orig * scaleX;
      break;
    }

    case 'firing_pin_safety': {
      // Lifted upward (+0.28 in Y) by trigger bar shark-fin during trigger pull, drops back on reset
      const liftUp = seg(f, 0.05, 0.16);
      const dropOnSlideMove = seg(f, 0.36, 0.44);
      dx = slideDX;
      dy = 0.28 * (liftUp - dropOnSlideMove);
      break;
    }

    case 'trigger_with_bar': {
      // Moves backward (-0.54) in [0.00, 0.18], drops sear (-0.15 in Y) at [0.17, 0.21] + disconnector [0.40, 0.48],
      // returns forward & clicks back up during Trigger Reset [0.87, 0.97]
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.96);
      const searDrop = seg(f, 0.17, 0.205);
      const searReset = seg(f, 0.91, 0.97);
      dx = -0.54 * (pull - release);
      dy = -0.15 * (searDrop - searReset);
      break;
    }

    case 'connector': {
      // Cammed inward (-Z) by recoiling slide rail (disconnector action), snaps back out on trigger reset
      const disconnectIn = seg(f, 0.38, 0.46);
      const resetOut = seg(f, 0.89, 0.95);
      dz = -0.09 * (disconnectIn - resetOut);
      break;
    }

    case 'trigger_spring': {
      const pull = seg(f, 0.0, 0.18);
      const release = seg(f, 0.87, 0.96);
      dx = -0.26 * (pull - release);
      break;
    }

    case 'mag_follower': {
      // Slight upward feed pulse along +20° magazine axis when next cartridge rises
      const feedRise = seg(f, 0.52, 0.62) - seg(f, 0.64, 0.78);
      dx = 0.14 * feedRise;
      dy = 0.38 * feedRise;
      break;
    }

    default:
      break;
  }

  return { pos: [dx, dy, dz], rot: [rx, ry, rz], scaleX };
}

export interface BallisticsVisualState {
  // 1. Fired Copper Projectile
  bulletVisible: boolean;
  bulletPos: [number, number, number];
  streakLength: number;

  // 2. Spent Brass Case (in chamber -> extracted -> ejected spinning arc)
  spentCaseVisible: boolean;
  spentCasePos: [number, number, number];
  spentCaseRot: [number, number, number];
  spentCaseOpacity: number;

  // 3. Muzzle & Chamber Propellant Flash
  chamberFlashIntensity: number;
  muzzlePlumeScale: number;
  muzzlePlumeOpacity: number;

  // 4. Next Cartridge in Magazine -> Fed into Chamber seamlessly
  nextRoundPos: [number, number, number];
  nextRoundRotZ: number;

  // 5. Reserve Round below in Magazine (visual continuity)
  reserveRoundPos: [number, number, number];
}

/**
 * Computes positions, rotations & effects for cartridges, bullet, shell ejection, and muzzle gas plume.
 */
export function computeBallisticsState(fRaw: number): BallisticsVisualState {
  const f = clamp01(fRaw);

  // Slide recoil helper matching computeFiringKinematics
  const slideRecoilIn = seg(f, 0.33, 0.54);
  const slideReturn = seg(f, 0.57, 0.85);
  const slideDX = -4.45 * (slideRecoilIn - slideReturn);

  // 1. Projectile: seated at [1.75, 2.55, 0] until f=0.245 -> accelerates down barrel [0.245, 0.31] -> exits muzzle [0.31, 0.47]
  let bulletVisible = f < 0.47;
  let bulletX = 1.75;
  let streakLength = 0;

  if (f >= 0.245 && f < 0.31) {
    const u = Math.pow(linearSeg(f, 0.245, 0.31), 1.5);
    bulletX = 1.75 + 9.8 * u; // Reaches muzzle X = 11.55 at f = 0.31
    streakLength = 2.5 * u;
  } else if (f >= 0.31 && f < 0.47) {
    const u = linearSeg(f, 0.31, 0.47);
    bulletX = 11.55 + 32.0 * u;
    streakLength = 6.5 * (1 - u * 0.5);
  }

  // 2. Spent Brass Case:
  // [0, 0.33]: in chamber at [0.42, 2.55, 0]
  // [0.33, 0.47]: pulled straight back with slideDX
  // [0.47, 0.76]: hits ejector and launches out right-top ejection port in parabolic tumbling arc!
  let spentCaseVisible = f < 0.76;
  let caseX = 0.42;
  let caseY = 2.55;
  let caseZ = 0;
  let caseRX = 0;
  let caseRY = 0;
  let caseRZ = 0;
  let spentCaseOpacity = 1;

  if (f >= 0.33 && f < 0.47) {
    caseX = 0.42 + slideDX;
    // Slight barrel drop before clearing chamber
    const drop = Math.sin(linearSeg(f, 0.34, 0.45) * Math.PI) * -0.12;
    caseY = 2.55 + drop;
  } else if (f >= 0.47 && f < 0.76) {
    const u = linearSeg(f, 0.47, 0.76);
    const baseAtEject = 0.42 - 3.15; // slideDX at f=0.47 is approx -3.15
    caseX = baseAtEject - 4.2 * u;
    caseY = 2.55 + 6.8 * u - 8.5 * u * u;
    caseZ = 9.5 * u;
    caseRX = u * 8.5;
    caseRY = u * 12.0;
    caseRZ = -u * 10.5;
    if (f > 0.64) {
      spentCaseOpacity = 1 - linearSeg(f, 0.64, 0.76);
    }
  }

  // 3. Chamber Flash & Muzzle Plume
  let chamberFlashIntensity = 0;
  if (f >= 0.225 && f <= 0.32) {
    chamberFlashIntensity = Math.sin(linearSeg(f, 0.225, 0.32) * Math.PI);
  }

  let muzzlePlumeScale = 0.01;
  let muzzlePlumeOpacity = 0;
  if (f >= 0.30 && f <= 0.39) {
    const u = linearSeg(f, 0.30, 0.39);
    muzzlePlumeScale = 0.35 + 1.25 * Math.pow(u, 0.55);
    muzzlePlumeOpacity = Math.sin(u * Math.PI) * 0.82;
  }

  // 4. Next Cartridge in Magazine -> Stripped up Feed Ramp into Chamber [0.42, 2.55, 0]
  // Resting top-of-mag position: X = -2.85, Y = 1.05, Z = 0, tilted slightly nose-up (+0.12 rad)
  let nextX = -2.85;
  let nextY = 1.05;
  let nextRZ = 0.12;

  if (f >= 0.52 && f < 0.62) {
    // Rises into feed lip stripping position once slide clears behind it
    const u = seg(f, 0.52, 0.62);
    nextX = -2.85 + 0.18 * u;
    nextY = 1.05 + 0.52 * u;
    nextRZ = 0.12 + 0.08 * u;
  } else if (f >= 0.62 && f < 0.85) {
    // Pushed forward by returning slide up the barrel feed ramp and leveled into chamber!
    const u = seg(f, 0.62, 0.85);
    const rampArc = Math.sin(u * Math.PI) * 0.24;
    nextX = -2.67 + (0.42 - -2.67) * u;
    nextY = 1.57 + (2.55 - 1.57) * u + rampArc;
    nextRZ = 0.2 * (1 - u);
  } else if (f >= 0.85) {
    // Fully seated in chamber — seamless match with SpentCase+Bullet at f = 0.00!
    nextX = 0.42;
    nextY = 2.55;
    nextRZ = 0;
  }

  // 5. Reserve cartridge underneath in magazine (rises into top-mag spot by f=0.85 for seamless loop!)
  const magFeedShift = seg(f, 0.52, 0.72);
  const resX = -3.22 + (-2.85 - -3.22) * magFeedShift;
  const resY = 0.05 + (1.05 - 0.05) * magFeedShift;

  return {
    bulletVisible,
    bulletPos: [bulletX, 2.55, 0],
    streakLength,
    spentCaseVisible,
    spentCasePos: [caseX, caseY, caseZ],
    spentCaseRot: [caseRX, caseRY, caseRZ],
    spentCaseOpacity,
    chamberFlashIntensity,
    muzzlePlumeScale,
    muzzlePlumeOpacity,
    nextRoundPos: [nextX, nextY, 0],
    nextRoundRotZ: nextRZ,
    reserveRoundPos: [resX, resY, 0],
  };
}
