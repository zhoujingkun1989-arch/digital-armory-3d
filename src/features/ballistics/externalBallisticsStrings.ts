import type {
  FlightRegime,
  ProjectileCategory,
} from '../../engine/physics/externalBallistics';
import type { LanguageCode } from '../../narration/types';
import type {
  RangeAimMode,
  RangeCameraMode,
  RangeTargetType,
  SteelHitZone,
} from './range3DMath';

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
  categoryFilterAria: string;
  categoryLabels: Record<'all' | ProjectileCategory, string>;
  armorBadge: string;
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
  sightTankShort: string;
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

  // Track B2 · 3D 1,000m Interactive Firing Range & Slow-Motion Bullet-Cam
  workspaceModeAria: string;
  workspaceModeSplit: string;
  workspaceModeRange3d: string;
  workspaceModeCharts2d: string;
  range3dJumpBtn: string;
  range3dJumpTitle: string;
  range3dBadge: string;
  range3dTitle: string;
  range3dSubtitle: (
    calCode: string,
    targetM: number,
    acousticDelayS: string
  ) => string;
  range3dCamGroupAria: string;
  range3dCameraLabels: Record<RangeCameraMode, string>;
  range3dFlirBtn: string;
  range3dFlirTitle: string;
  range3dAudioTitle: string;
  range3dAudioOn: string;
  range3dAudioMuted: string;
  range3dFireBtn: string;
  range3dPlayBtn: string;
  range3dPauseBtn: string;
  range3dResetBtn: string;
  range3dSpeedLabel: string;
  range3dTimelineLabel: string;
  range3dTargetTypeLabel: string;
  range3dTargetLabels: Record<RangeTargetType, string>;
  range3dAimModeLabel: string;
  range3dAimLabels: Record<RangeAimMode, string>;
  range3dHudRange: string;
  range3dHudVelMach: string;
  range3dHudTof: string;
  range3dHudEnergy: string;
  range3dHudDropWind: string;
  range3dHudStatus: string;
  range3dAcousticLabel: string;
  range3dHitStatus: (zone: SteelHitZone) => string;
  range3dMissStatus: string;
  range3dGelImpactStatus: (depthCm: string, passesThrough: boolean) => string;
  range3dTermImpactVel: string;
  range3dTermTof: string;
  range3dTermGongResult: string;
  range3dTermSwing: string;
  range3dTermGelDepth: string;
  range3dTermGelCavity: string;
  controlsDeckToggleExpand: string;
  controlsDeckToggleCollapse: string;
  controlsDeckSummaryLabel: string;
}

export const EXTERNAL_BALLISTICS_STRINGS: Readonly<
  Record<LanguageCode, ExternalBallisticsUiCopy>
> = {
  zh: {
    backBtn: '返回枪库',
    backTitle: '返回 3D 武器陈列馆',
    badge: '1,000m 外弹道实弹试验场 · RK4',
    title: '1,000m 外弹道、横风偏流与跨音速衰减实验室',
    subtitle:
      '四阶龙格-库塔 3-DOF 质点弹道解算 · G1/G7 跨音速激波阻力 · 第一像面圣诞树分划板与狙击 DOPE 射表',
    dopeJumpBtn: 'DOPE 射表',
    dopeJumpTitle: '滚动定位至底部多距离狙击 DOPE 弹道射表',

    presetsLabel: '经典对决预设',
    projectilesLabel: (active, max) => `同屏对比弹种 (${active}/${max})`,
    slotLimitHint:
      '点击弹种增减曲线（最多 4 条同屏叠加），点击已激活卡片切换主瞄准镜分划焦点',
    categoryFilterAria: '按弹种类别筛选外弹道档案',
    categoryLabels: {
      all: '全部弹种',
      armor: '坦克主炮',
      sniper: '狙击重弹',
      rifle: '步枪弹',
      pdw: 'PDW 穿甲弹',
      pistol: '手枪弹',
      shotgun: '霰弹',
      archery: '复合弓弩',
    },
    armorBadge: '主炮',
    isaReadout: (rho, pct, sound, hPa) =>
      `空气密度 ρ = ${rho} kg/m³ (${pct}%) · 音速 a = ${sound} m/s · 气压 ${hPa} hPa`,
    resetEnvBtn: '标准大气复位',
    resetEnvTitle: '重置为 ICAO 海平面标准大气（0 m · 15 °C）与默认横风',

    maxRangeLabel: '靶场最大射程',
    zeroRangeLabel: '瞄具归零距离',
    sightHeightLabel: '瞄准基线高',
    sightStdShort: '4.8 cm 标准',
    sightHighShort: '6.2 cm 高桥',
    sightTankShort: '14.0 cm 坦克',
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
      '对比坦克主炮兆焦级穿甲弹（MJ）、反器材重弹、全威力/中间步枪弹、9粒鹿弹总动能与弓弩弹性动能衰减规律',
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
      supersonic: '超音速',
      transonic: '跨音速',
      subsonic: '亚音速',
    },

    dopeBadge: 'SNIPER DOPE DROP CARD',
    dopeTitle: (calName) => `${calName} — 多距离定量狙击射表 (DOPE Card)`,
    dopeSubtitle: (zeroM, sightCm, windStr, altM, tempC) =>
      `归零 ${zeroM} m · 镜高 ${sightCm.toFixed(1)} cm · 横风 ${windStr} · 海拔 ${altM} m · 气温 ${tempC} °C`,
    dopeUnitBoth: 'MIL + MOA 双制',
    dopeUnitMil: '仅 MIL (mrad)',
    dopeUnitMoa: '仅 MOA (角分)',
    dopeClickHint: '点击任意射程行可同步定位上方曲线光标与分划板',
    colRange: '距离',
    colDrop: '落点',
    colElev: '高低修正',
    colDrift: '横风偏流',
    colWind: '风偏修正',
    colVelocity: '存速',
    colMach: '马赫',
    colEnergy: '留存动能',
    colFlightTime: '飞行时间',
    colRegime: '流态',
    zeroBadge: '归零',
    outOfEnvelopeLabel: '超出平射包络',

    workspaceModeAria: '切换 3D 靶场与 2D 曲线工作台布局',
    workspaceModeSplit: '3D 靶场 + 2D 曲线同屏',
    workspaceModeRange3d: '3D 靶场影院模式',
    workspaceModeCharts2d: '仅 2D 曲线与分划板',
    range3dJumpBtn: '3D 靶场 · 子弹时间',
    range3dJumpTitle: '切换至 3D 1,000m 实弹靶场与慢动作子弹追踪镜头',
    range3dBadge: '3D PROVING GROUND · BULLET-CAM',
    range3dTitle: '3D 1,000m 交互式实弹靶场与慢动作子弹时间追踪',
    range3dSubtitle: (calCode, targetM, acousticDelayS) =>
      `RK4 真实三维弹道驱动 · 主追踪 [${calCode}] @ ${targetM} m · 钢靶声波回传延迟 ${acousticDelayS} s (d / 343)`,
    range3dCamGroupAria: '切换 3D 靶场机位视角',
    range3dCameraLabels: {
      overview: '靶场全景',
      bullet_cam: '子弹追踪视角',
      spotter_flir: '观察手 / FLIR',
    },
    range3dFlirBtn: 'FLIR 白热成像',
    range3dFlirTitle: '开启或关闭观察手白热红外热成像着弹滤镜',
    range3dAudioTitle: '切换靶场击发与 AR500 钢靶回传音效',
    range3dAudioOn: '靶场音效开',
    range3dAudioMuted: '已静音',
    range3dFireBtn: '击发 FIRE',
    range3dPlayBtn: '播放',
    range3dPauseBtn: '暂停',
    range3dResetBtn: '重置弹道回放',
    range3dSpeedLabel: '慢动作回放倍率',
    range3dTimelineLabel: '飞行时间轴',
    range3dTargetTypeLabel: '切换靶标类型',
    range3dTargetLabels: {
      steel_gong: 'AR500 钢靶',
      ballistic_gel: '弹道明胶块',
    },
    range3dAimModeLabel: '瞄具修正模式',
    range3dAimLabels: {
      dope_dial: 'DOPE 满修',
      elev_only: '仅修高低(测风偏)',
      raw_zero: '原始归零',
    },
    range3dHudRange: '当前射程',
    range3dHudVelMach: '瞬时速度 · 马赫',
    range3dHudTof: '飞行时间',
    range3dHudEnergy: '留存动能',
    range3dHudDropWind: '下坠 / 风偏',
    range3dHudStatus: '飞行 / 着弹状态',
    range3dAcousticLabel: '声波回传延迟',
    range3dHitStatus: (zone) =>
      zone === 'bullseye'
        ? '命中靶心 PING!'
        : zone === 'edge'
          ? '擦边命中钢靶'
          : '命中钢靶 PING!',
    range3dMissStatus: '脱靶 (落入沙堤)',
    range3dGelImpactStatus: (depthCm, passesThrough) =>
      passesThrough ? `明胶贯穿 ${depthCm} cm` : `明胶侵入 ${depthCm} cm`,
    range3dTermImpactVel: '着弹存速',
    range3dTermTof: '总飞行时间',
    range3dTermGongResult: '钢靶判定',
    range3dTermSwing: '摆幅 · 动量冲量',
    range3dTermGelDepth: '明胶侵彻深度',
    range3dTermGelCavity: '瞬时空腔直径',
    controlsDeckToggleExpand: '展开弹种与大气参数控制台',
    controlsDeckToggleCollapse: '收起参数控制台',
    controlsDeckSummaryLabel: '射场参数',
  },

  en: {
    backBtn: 'Back to Vault',
    backTitle: 'Return to 3D Armory Exhibition Vault',
    badge: '1,000M PROVING GROUND · RK4',
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
    categoryFilterAria: 'Filter ballistic profiles by ordnance category',
    categoryLabels: {
      all: 'All',
      armor: 'Tank Cannons',
      sniper: 'Sniper',
      rifle: 'Rifle',
      pdw: 'PDW',
      pistol: 'Pistol',
      shotgun: 'Shotgun',
      archery: 'Archery',
    },
    armorBadge: 'TANK',
    isaReadout: (rho, pct, sound, hPa) =>
      `Air Density rho = ${rho} kg/m3 (${pct}%) · Sound a = ${sound} m/s · ${hPa} hPa`,
    resetEnvBtn: 'Reset ISA',
    resetEnvTitle:
      'Reset to ICAO sea-level standard atmosphere (0 m · 15 C) and baseline wind',

    maxRangeLabel: 'Max Range',
    zeroRangeLabel: 'Zero Distance',
    sightHeightLabel: 'Sight Height',
    sightStdShort: '4.8 cm Std',
    sightHighShort: '6.2 cm High',
    sightTankShort: '14.0 cm Tank',
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
      'Contrasting megajoule tank cannon APFSDS/APCBC shells, anti-materiel, rifle, 9-pellet buckshot, and archery retention',
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
    colRange: 'Range',
    colDrop: 'Drop',
    colElev: 'Elev Hold',
    colDrift: 'Drift',
    colWind: 'Wind Hold',
    colVelocity: 'Velocity',
    colMach: 'Mach',
    colEnergy: 'Energy',
    colFlightTime: 'ToF',
    colRegime: 'Regime',
    zeroBadge: 'ZERO',
    outOfEnvelopeLabel: 'Sub-Terminal',

    workspaceModeAria: 'Switch between 3D Firing Range and 2D Charts layout',
    workspaceModeSplit: '3D Range + 2D Lab',
    workspaceModeRange3d: '3D Range Cinema',
    workspaceModeCharts2d: '2D Charts & Reticle',
    range3dJumpBtn: '3D Range / Bullet-Cam',
    range3dJumpTitle:
      'Focus the interactive 3D 1,000m Firing Range & Slow-Motion Bullet-Cam',
    range3dBadge: '3D PROVING GROUND · BULLET-CAM',
    range3dTitle: '3D 1,000m Interactive Firing Range & Slow-Motion Bullet-Cam',
    range3dSubtitle: (calCode, targetM, acousticDelayS) =>
      `True RK4 3-DOF trajectory · Tracking [${calCode}] @ ${targetM} m · Acoustic steel return delay ${acousticDelayS} s (d / 343)`,
    range3dCamGroupAria: 'Select 3D firing range camera mode',
    range3dCameraLabels: {
      overview: 'Range Overview',
      bullet_cam: 'Bullet-Cam',
      spotter_flir: 'Spotter / FLIR',
    },
    range3dFlirBtn: 'FLIR White-Hot',
    range3dFlirTitle: 'Toggle FLIR white-hot thermal spotting scope shader',
    range3dAudioTitle: 'Toggle muzzle launch & delayed steel gong audio ping',
    range3dAudioOn: 'Range SFX',
    range3dAudioMuted: 'Muted',
    range3dFireBtn: 'FIRE',
    range3dPlayBtn: 'Play',
    range3dPauseBtn: 'Pause',
    range3dResetBtn: 'Reset trajectory playback',
    range3dSpeedLabel: 'Slow-motion speed multiplier',
    range3dTimelineLabel: 'Flight Timeline',
    range3dTargetTypeLabel: 'Select target array type',
    range3dTargetLabels: {
      steel_gong: 'AR500 Steel Gong',
      ballistic_gel: 'Ballistic Gel Block',
    },
    range3dAimModeLabel: 'Select sight compensation mode',
    range3dAimLabels: {
      dope_dial: 'DOPE Dial',
      elev_only: 'Elev Only (Wind Test)',
      raw_zero: 'Raw Zero',
    },
    range3dHudRange: 'Range',
    range3dHudVelMach: 'Velocity · Mach',
    range3dHudTof: 'Flight Time',
    range3dHudEnergy: 'Kinetic Energy',
    range3dHudDropWind: 'Drop / Drift',
    range3dHudStatus: 'Status',
    range3dAcousticLabel: 'Acoustic Return',
    range3dHitStatus: (zone) =>
      zone === 'bullseye'
        ? 'BULLSEYE PING!'
        : zone === 'edge'
          ? 'EDGE HIT!'
          : 'STEEL HIT PING!',
    range3dMissStatus: 'MISS (Berm Impact)',
    range3dGelImpactStatus: (depthCm, passesThrough) =>
      passesThrough
        ? `GEL PASS-THRU ${depthCm} cm`
        : `GEL PEN ${depthCm} cm`,
    range3dTermImpactVel: 'Impact Velocity',
    range3dTermTof: 'Total ToF',
    range3dTermGongResult: 'Steel Impact',
    range3dTermSwing: 'Pendulum · Impulse',
    range3dTermGelDepth: 'Gel Penetration',
    range3dTermGelCavity: 'Temp Stretch Cavity',
    controlsDeckToggleExpand: 'Expand Caliber & Atmosphere Controls',
    controlsDeckToggleCollapse: 'Collapse Controls',
    controlsDeckSummaryLabel: 'Range Config',
  },
};

/** Wave-2 / WP-17 / WP-18 weapon display labels so links work seamlessly across all exhibits */
export const WAVE2_WEAPON_LABELS: Readonly<
  Record<string, { zh: string; en: string }>
> = {
  m249: { zh: 'M249 班用机枪', en: 'M249 SAW' },
  p08: { zh: '卢格 P08', en: 'Luger P08' },
  vector: { zh: 'KRISS Vector 短剑', en: 'KRISS Vector' },
  g11: { zh: 'H&K G11 K2 无壳步枪', en: 'H&K G11 K2' },
  vss: { zh: 'VSS 螺纹切割机', en: 'VSS Vintorez' },
  m134: { zh: 'M134D 加特林', en: 'M134D Minigun' },
  an94: { zh: 'AN-94 阿巴坎', en: 'AN-94 Abakan' },
  ztz99a: { zh: 'ZTZ-99A 主战坦克', en: 'ZTZ-99A MBT' },
  m1a2: { zh: 'M1A2 SEP v3 艾布拉姆斯', en: 'M1A2 SEP v3 Abrams' },
  leopard2a7: { zh: '豹 2A7V 主战坦克', en: 'Leopard 2A7V MBT' },
  tiger1: { zh: '虎式 131 重型坦克', en: 'Tiger 131 Heavy Tank' },
};
