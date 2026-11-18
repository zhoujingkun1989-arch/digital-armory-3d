import type { FlightRegime } from '../../engine/physics/externalBallistics';
import type { LanguageCode } from '../../narration/types';

// ============================================================================
// WP-14 · External Ballistics Range Lab — 100% Bilingual Dictionary (zh / en)
// Contract: Every key has exact zh/en structural parity and 0 CJK in `en`.
// ============================================================================

export interface ExternalBallisticsUiCopy {
  backBtn: string;
  backTitle: string;
  badge: string;
  title: string;
  subtitle: string;
  dopeJumpBtn: string;
  dopeJumpTitle: string;

  presetsLabel: string;
  projectilesLabel: (activeCount: number, maxCount: number) => string;
  slotLimitHint: string;
  isaReadout: (
    rhoKgM3: string,
    pct: string,
    soundMps: string,
    hPa: string
  ) => string;
  resetEnvBtn: string;
  resetEnvTitle: string;

  maxRangeLabel: string;
  zeroRangeLabel: string;
  sightHeightLabel: string;
  sightStdShort: string;
  sightHighShort: string;
  crosswindLabel: string;
  windLeftToRight: string;
  windRightToLeft: string;
  windDirToggleTitle: string;
  altitudeLabel: string;
  temperatureLabel: string;
  targetScrubLabel: string;

  dropChartBadge: string;
  dropChartTitle: string;
  dropChartSubtitle: (zeroM: number, sightCm: number) => string;
  losLabel: string;
  zeroCrossLabel: (zeroM: number) => string;
  machOneShort: string;
  maxOrdShort: string;
  scrubInteractiveHint: string;
  xAxisRangeUnit: string;
  yAxisDropCm: string;
  yAxisDropM: string;
  clampedPlungeHint: string;

  secondaryBadge: string;
  tabWindDrift: string;
  tabVelocity: string;
  tabEnergy: string;
  windChartTitle: string;
  windChartSubtitle: (windStr: string) => string;
  windZeroAxisLabel: string;
  buckshotSpreadLegend: string;
  velocityChartTitle: string;
  velocityChartSubtitle: (soundMps: string) => string;
  sonicBarrierLine: (soundMps: string) => string;
  transonicZoneLabel: string;
  energyChartTitle: string;
  energyChartSubtitle: string;
  scaleLinear: string;
  scaleSqrt: string;

  reticleBadge: string;
  reticleTitle: string;
  reticleSubtitle: (rangeM: number, calCode: string) => string;
  illumEtched: string;
  illumRed: string;
  illumCyan: string;
  reticleScaleBadge: (maxMil: number) => string;
  elevTurretLabel: string;
  windTurretLabel: string;
  holdUpPrefix: string;
  holdDownPrefix: string;
  holdRightPrefix: string;
  holdLeftPrefix: string;
  buckshotPatternNote: (diamMm: number, milSpan: string) => string;
  stalledAtRangeNote: (maxEffM: number) => string;

  telemetryDeckTitle: (rangeM: number) => string;
  primaryFocusTag: string;
  setFocusHint: string;
  metricVelMach: string;
  metricDropHold: string;
  metricWindHold: string;
  metricEnergyRetained: string;
  metricTimeOfFlight: string;
  metricTransonicAt: string;
  subsonicMuzzleText: string;
  supersonicBeyondText: (rangeM: number) => string;
  pelletBreakdownText: (singleJ: number, radiusMm: number) => string;
  inspectInWorkbenchTitle: (weaponLabel: string) => string;

  regimeLabels: Record<FlightRegime, string>;

  dopeBadge: string;
  dopeTitle: (calName: string) => string;
  dopeSubtitle: (
    zeroM: number,
    sightCm: number,
    windStr: string,
    altM: number,
    tempC: number
  ) => string;
  dopeUnitBoth: string;
  dopeUnitMil: string;
  dopeUnitMoa: string;
  dopeClickHint: string;
  colRange: string;
  colDrop: string;
  colElev: string;
  colDrift: string;
  colWind: string;
  colVelocity: string;
  colMach: string;
  colEnergy: string;
  colFlightTime: string;
  colRegime: string;
  zeroBadge: string;
  outOfEnvelopeLabel: string;
}

export const EXTERNAL_BALLISTICS_STRINGS: Readonly<
  Record<LanguageCode, ExternalBallisticsUiCopy>
> = {
  zh: {
    backBtn: '返回枪库',
    backTitle: '返回 3D 武器陈列馆',
    badge: 'WP-14 · RK4 外弹道靶场',
    title: '1,000m 外弹道、横风偏流与跨音速衰减实验室',
    subtitle:
      '四阶龙格-库塔 3-DOF 质点弹道解算 · G1/G7 跨音速激波阻力 · 第一像面圣诞树分划板与狙击 DOPE 射表',
    dopeJumpBtn: 'DOPE 射表',
    dopeJumpTitle: '滚动定位至底部多距离狙击 DOPE 弹道射表',

    presetsLabel: '经典对决预设',
    projectilesLabel: (active, max) => `同屏对比弹种 (${active}/${max})`,
    slotLimitHint:
      '点击弹种增减曲线（最多 4 条同屏叠加），点击已激活卡片切换主瞄准镜分划焦点',
    isaReadout: (rho, pct, sound, hPa) =>
      `空气密度 ρ = ${rho} kg/m³ (${pct}%) · 音速 a = ${sound} m/s · 气压 ${hPa} hPa`,
    resetEnvBtn: '标准大气复位',
    resetEnvTitle: '重置为 ICAO 海平面标准大气（0 m · 15 °C）与默认横风',

    maxRangeLabel: '靶场最大射程',
    zeroRangeLabel: '瞄具归零距离',
    sightHeightLabel: '瞄准基线高',
    sightStdShort: '4.8 cm 标准镜高',
    sightHighShort: '6.2 cm 高脚镜桥',
    crosswindLabel: '90° 侧向横风',
    windLeftToRight: '左→右 (+Z)',
    windRightToLeft: '右→左 (-Z)',
    windDirToggleTitle: '切换 90° 横风吹拂方向（改变偏流正负号）',
    altitudeLabel: '海拔高度',
    temperatureLabel: '环境温度',
    targetScrubLabel: '目标检视距离',

    dropChartBadge: 'SIDE-PROFILE TRAJECTORY · Y(x)',
    dropChartTitle: '侧视弹道下坠曲线与跨音速转换点',
    dropChartSubtitle: (zeroM, sightCm) =>
      `瞄准基线 Y = 0（归零 @ ${zeroM} m · 镜高 ${sightCm.toFixed(1)} cm）· 菱形标记 M = 1.0 音障穿越位置`,
    losLabel: '瞄准基线 LOS (Y = 0)',
    zeroCrossLabel: (zeroM) => `归零点 ${zeroM}m`,
    machOneShort: 'M1.0 音障',
    maxOrdShort: '弹道高点',
    scrubInteractiveHint: '移动或拖拽光标同步检视双图与光学分划板',
    xAxisRangeUnit: '射程距离 x (m)',
    yAxisDropCm: '弹道高 / 下坠 (cm)',
    yAxisDropM: '弹道高 / 下坠 (m)',
    clampedPlungeHint:
      '低速弹丸远距大落差已智能限幅显示（真实数值见右侧读数与 DOPE 表）',

    secondaryBadge: 'MULTI-DOMAIN TELEMETRY',
    tabWindDrift: '俯视横风偏流 Z(x)',
    tabVelocity: '存速与音障 V(x)',
    tabEnergy: '终端留存动能 Ek(x)',
    windChartTitle: '俯视靶道横风偏流轨迹 Z(x)',
    windChartSubtitle: (windStr) =>
      `侧风矢量 ${windStr} · 飞行滞后时间差 Δt = t − x/V₀ 决定风偏曲率`,
    windZeroAxisLabel: '无风瞄准中轴 (Z = 0)',
    buckshotSpreadLegend: '12号 00鹿弹散布锥包络',
    velocityChartTitle: '弹头留存速度衰减与 M = 1.0 音障线',
    velocityChartSubtitle: (soundMps) =>
      `当地音速 a(T) = ${soundMps} m/s · 阴影带 0.85 ≤ M ≤ 1.20 为跨音速激波阻力陡增区`,
    sonicBarrierLine: (soundMps) => `音障 M = 1.0 (${soundMps} m/s)`,
    transonicZoneLabel: '跨音速激波区 (0.85–1.20 M)',
    energyChartTitle: '终端留存动能衰减曲线 Ek(x)',
    energyChartSubtitle:
      '对比反器材重弹、全威力/中间步枪弹、9粒鹿弹总动能与弓弩弹性动能衰减规律',
    scaleLinear: '线性焦耳 (J)',
    scaleSqrt: '平方根比尺 (√J)',

    reticleBadge: 'FFP CHRISTMAS-TREE RETICLE',
    reticleTitle: '第一像面 MIL 圣诞树光学分划板实况预览',
    reticleSubtitle: (rangeM, calCode) =>
      `距离 ${rangeM} m · 主焦点 [${calCode}] 抬高与迎风修正实况落点`,
    illumEtched: '白昼蚀刻',
    illumRed: '微光红点',
    illumCyan: '夜视青光',
    reticleScaleBadge: (maxMil) => `±${maxMil} MIL 视场`,
    elevTurretLabel: '高低修正 (ELEV)',
    windTurretLabel: '方向风偏 (WIND)',
    holdUpPrefix: '▲ 抬高',
    holdDownPrefix: '▼ 压低',
    holdRightPrefix: '► 偏右',
    holdLeftPrefix: '◄ 偏左',
    buckshotPatternNote: (diamMm, milSpan) =>
      `00鹿弹 9丸散布圆 Ø${Math.round(diamMm)} mm (${milSpan} MIL)`,
    stalledAtRangeNote: (maxEffM) =>
      `该低速弹体平射有效距离止于 ~${Math.round(maxEffM)} m`,

    telemetryDeckTitle: (rangeM) => `@ ${rangeM} m 实时多口径对比遥测`,
    primaryFocusTag: '分划焦点',
    setFocusHint: '设为焦点',
    metricVelMach: '留存速度 · 马赫',
    metricDropHold: '垂直下坠 · 修高',
    metricWindHold: '横风偏流 · 风修',
    metricEnergyRetained: '留存动能 · 保持率',
    metricTimeOfFlight: '飞行时间 ToF',
    metricTransonicAt: 'M=1.0 跨音速距',
    subsonicMuzzleText: '出膛亚音速 (M₀ < 1)',
    supersonicBeyondText: (rangeM) => `${Math.round(rangeM)} m (全程超音速)`,
    pelletBreakdownText: (singleJ, radiusMm) =>
      `单丸 ${Math.round(singleJ)} J · 散布半径 ${Math.round(radiusMm)} mm`,
    inspectInWorkbenchTitle: (weaponLabel) =>
      `在 3D 拆解与击发工作台中检视 ${weaponLabel}`,

    regimeLabels: {
      supersonic: '超音速 SUPERSONIC',
      transonic: '跨音速 TRANSONIC',
      subsonic: '亚音速 SUBSONIC',
    },

    dopeBadge: 'SNIPER DOPE DROP CARD',
    dopeTitle: (calName) => `${calName} — 多距离定量狙击射表 (DOPE Card)`,
    dopeSubtitle: (zeroM, sightCm, windStr, altM, tempC) =>
      `归零 ${zeroM} m · 镜高 ${sightCm.toFixed(1)} cm · 横风 ${windStr} · 海拔 ${altM} m · 气温 ${tempC} °C`,
    dopeUnitBoth: 'MIL + MOA 双制',
    dopeUnitMil: '仅 MIL (mrad)',
    dopeUnitMoa: '仅 MOA (角分)',
    dopeClickHint: '点击任意射程行可同步定位上方曲线光标与分划板',
    colRange: '距离 (m)',
    colDrop: '垂直落点 (cm)',
    colElev: '高低修正',
    colDrift: '横风偏流 (cm)',
    colWind: '风偏修正',
    colVelocity: '留存速度 (m/s)',
    colMach: '马赫数 (M)',
    colEnergy: '留存动能 (J)',
    colFlightTime: '飞行时间 (s)',
    colRegime: '气动流态',
    zeroBadge: '归零',
    outOfEnvelopeLabel: '超出平射包络',
  },

  en: {
    backBtn: 'Back to Vault',
    backTitle: 'Return to 3D Armory Exhibition Vault',
    badge: 'WP-14 · RK4 RANGE LAB',
    title: '1,000m External Ballistics, Wind Drift & Transonic Lab',
    subtitle:
      '4th-Order Runge-Kutta 3-DOF Point-Mass Solver · G1/G7 Transonic Wave Drag · FFP Christmas-Tree Reticle & Sniper DOPE Card',
    dopeJumpBtn: 'DOPE Card',
    dopeJumpTitle: 'Scroll to multi-range quantitative Sniper DOPE Drop Card',

    presetsLabel: 'Showdown Presets',
    projectilesLabel: (active, max) =>
      `Overlaid Projectiles (${active}/${max})`,
    slotLimitHint:
      'Toggle up to 4 simultaneous calibers; click an active card below to switch primary reticle & DOPE focus',
    isaReadout: (rho, pct, sound, hPa) =>
      `Air Density rho = ${rho} kg/m3 (${pct}%) · Sound a = ${sound} m/s · ${hPa} hPa`,
    resetEnvBtn: 'Reset ISA',
    resetEnvTitle:
      'Reset to ICAO sea-level standard atmosphere (0 m · 15 C) and baseline wind',

    maxRangeLabel: 'Max Range',
    zeroRangeLabel: 'Zero Distance',
    sightHeightLabel: 'Sight Height',
    sightStdShort: '4.8 cm Std Optic',
    sightHighShort: '6.2 cm High Mount',
    crosswindLabel: '90 deg Crosswind',
    windLeftToRight: 'L -> R (+Z)',
    windRightToLeft: 'R -> L (-Z)',
    windDirToggleTitle: 'Flip 90-degree crosswind direction (+Z / -Z)',
    altitudeLabel: 'Altitude',
    temperatureLabel: 'Temperature',
    targetScrubLabel: 'Target Cursor',

    dropChartBadge: 'SIDE-PROFILE TRAJECTORY · Y(x)',
    dropChartTitle: 'Bullet Drop Trajectory & Transonic Crossing',
    dropChartSubtitle: (zeroM, sightCm) =>
      `Line of Sight Y = 0 (Zero @ ${zeroM} m · Sight ${sightCm.toFixed(1)} cm) · Diamonds mark M = 1.0 sonic crossing`,
    losLabel: 'Line of Sight LOS (Y = 0)',
    zeroCrossLabel: (zeroM) => `Zero ${zeroM}m`,
    machOneShort: 'M1.0 Sonic',
    maxOrdShort: 'Max Ord',
    scrubInteractiveHint:
      'Hover or drag across charts to scrub range & live reticle holdover',
    xAxisRangeUnit: 'Downrange Distance x (m)',
    yAxisDropCm: 'Height / Drop (cm)',
    yAxisDropM: 'Height / Drop (m)',
    clampedPlungeHint:
      'Steep subsonic plunge auto-clamped for chart clarity (exact values shown in cards & DOPE table)',

    secondaryBadge: 'MULTI-DOMAIN TELEMETRY',
    tabWindDrift: 'Crosswind Drift Z(x)',
    tabVelocity: 'Velocity & Mach V(x)',
    tabEnergy: 'Retained Energy Ek(x)',
    windChartTitle: 'Top-Down Crosswind Deflection Z(x)',
    windChartSubtitle: (windStr) =>
      `Crosswind ${windStr} · Lag time (t - x/V0) governs quadratic wind deflection`,
    windZeroAxisLabel: 'Zero-Wind Boreline (Z = 0)',
    buckshotSpreadLegend: '12ga 00 Buckshot Spread Cone',
    velocityChartTitle: 'Retained Velocity Decay & M = 1.0 Sonic Barrier',
    velocityChartSubtitle: (soundMps) =>
      `Speed of Sound a(T) = ${soundMps} m/s · Shaded band 0.85 <= M <= 1.20 marks transonic wave-drag rise`,
    sonicBarrierLine: (soundMps) => `Sonic Barrier M = 1.0 (${soundMps} m/s)`,
    transonicZoneLabel: 'Transonic Wave-Drag Zone (0.85-1.20 M)',
    energyChartTitle: 'Retained Kinetic Energy Decay Ek(x)',
    energyChartSubtitle:
      'Contrasting anti-materiel, rifle, 9-pellet buckshot payload, and archery kinetic retention',
    scaleLinear: 'Linear (J)',
    scaleSqrt: 'Sqrt Scale (sqrt J)',

    reticleBadge: 'FFP CHRISTMAS-TREE RETICLE',
    reticleTitle: 'Live FFP MIL-Dot / Christmas-Tree Scope Reticle',
    reticleSubtitle: (rangeM, calCode) =>
      `Target @ ${rangeM} m · Primary [${calCode}] Elevation & Windage Holdover`,
    illumEtched: 'Day Etched',
    illumRed: 'Red Illum',
    illumCyan: 'NVG Cyan',
    reticleScaleBadge: (maxMil) => `+/-${maxMil} MIL FOV`,
    elevTurretLabel: 'ELEVATION HOLD',
    windTurretLabel: 'WINDAGE DRIFT',
    holdUpPrefix: 'UP',
    holdDownPrefix: 'DN',
    holdRightPrefix: 'R',
    holdLeftPrefix: 'L',
    buckshotPatternNote: (diamMm, milSpan) =>
      `9-Pellet 00 Buck Spread D=${Math.round(diamMm)} mm (${milSpan} MIL)`,
    stalledAtRangeNote: (maxEffM) =>
      `Low-velocity flat trajectory terminates near ~${Math.round(maxEffM)} m`,

    telemetryDeckTitle: (rangeM) =>
      `Live Multi-Caliber Telemetry @ ${rangeM} m`,
    primaryFocusTag: 'RETICLE FOCUS',
    setFocusHint: 'Focus Reticle',
    metricVelMach: 'Velocity · Mach',
    metricDropHold: 'Drop · Elev Hold',
    metricWindHold: 'Drift · Wind Hold',
    metricEnergyRetained: 'Kinetic Energy',
    metricTimeOfFlight: 'Time of Flight',
    metricTransonicAt: 'M=1.0 Crossing',
    subsonicMuzzleText: 'Subsonic at Muzzle (M0 < 1)',
    supersonicBeyondText: (rangeM) => `${Math.round(rangeM)} m (Supersonic)`,
    pelletBreakdownText: (singleJ, radiusMm) =>
      `${Math.round(singleJ)} J/pellet · R=${Math.round(radiusMm)} mm spread`,
    inspectInWorkbenchTitle: (weaponLabel) =>
      `Inspect ${weaponLabel} in 3D Disassembly & Firing Workbench`,

    regimeLabels: {
      supersonic: 'SUPERSONIC',
      transonic: 'TRANSONIC',
      subsonic: 'SUBSONIC',
    },

    dopeBadge: 'SNIPER DOPE DROP CARD',
    dopeTitle: (calName) =>
      `${calName} — Quantitative Multi-Range DOPE Drop Card`,
    dopeSubtitle: (zeroM, sightCm, windStr, altM, tempC) =>
      `Zero ${zeroM} m · Sight ${sightCm.toFixed(1)} cm · Wind ${windStr} · Alt ${altM} m · Temp ${tempC} C`,
    dopeUnitBoth: 'MIL + MOA',
    dopeUnitMil: 'MIL (mrad)',
    dopeUnitMoa: 'MOA Only',
    dopeClickHint:
      'Click any range row to snap the synchronized chart cursor & optical reticle',
    colRange: 'Range (m)',
    colDrop: 'Drop (cm)',
    colElev: 'Elev Hold',
    colDrift: 'Wind Drift (cm)',
    colWind: 'Wind Hold',
    colVelocity: 'Velocity (m/s)',
    colMach: 'Mach',
    colEnergy: 'Energy (J)',
    colFlightTime: 'ToF (s)',
    colRegime: 'Regime',
    zeroBadge: 'ZERO',
    outOfEnvelopeLabel: 'Sub-Terminal',
  },
};

/** Wave-2 future weapon display labels so links work seamlessly before & after Wave-2 merge */
export const WAVE2_WEAPON_LABELS: Readonly<
  Record<string, { zh: string; en: string }>
> = {
  m249: { zh: 'M249 班用机枪', en: 'M249 SAW' },
  p08: { zh: '卢格 P08', en: 'Luger P08' },
  vector: { zh: 'KRISS Vector 短剑', en: 'KRISS Vector' },
};
