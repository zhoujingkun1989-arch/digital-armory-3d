import type {
  CausalityDiagnosticStatus,
  CausalityEvaluation,
  CausalityParameters,
  CausalityPresetId,
} from '../../engine/physics/causalitySandbox';
import type { LanguageCode } from '../../narration/types';

export type CausalityExperimentId =
  | 'mil_spec_equilibrium'
  | 'subsonic_fte_short_stroke'
  | 'overpressure_early_unlock'
  | 'suppressed_backpressure_surge';

export type MarginGaugeTone = 'nominal' | 'warning' | 'hazard';

export interface CausalityExperimentSpec {
  id: CausalityExperimentId;
  expectedRegime: CausalityDiagnosticStatus;
  params: Pick<
    CausalityParameters,
    'gasPortScale' | 'recoilSpringKScale' | 'boltMassScale' | 'powderLoadScale'
  >;
}

export const CAUSALITY_EXPERIMENTS: readonly CausalityExperimentSpec[] = [
  {
    id: 'mil_spec_equilibrium',
    expectedRegime: 'nominal',
    params: {
      gasPortScale: 1.0,
      recoilSpringKScale: 1.0,
      boltMassScale: 1.0,
      powderLoadScale: 1.0,
    },
  },
  {
    id: 'subsonic_fte_short_stroke',
    expectedRegime: 'short_stroke_fte',
    params: {
      gasPortScale: 0.7,
      recoilSpringKScale: 1.24,
      boltMassScale: 1.16,
      powderLoadScale: 0.76,
    },
  },
  {
    id: 'overpressure_early_unlock',
    expectedRegime: 'overgassed_early_unlock',
    params: {
      gasPortScale: 1.26,
      recoilSpringKScale: 0.78,
      boltMassScale: 0.84,
      powderLoadScale: 1.34,
    },
  },
  {
    id: 'suppressed_backpressure_surge',
    expectedRegime: 'overgassed_early_unlock',
    params: {
      gasPortScale: 1.48,
      recoilSpringKScale: 0.72,
      boltMassScale: 0.76,
      powderLoadScale: 1.06,
    },
  },
];

export interface MechanicalMarginGaugeReading {
  id: 'chamberSafety' | 'carrierStroke' | 'lockDwell';
  fillPct: number;
  thresholdPct: number;
  numericValue: number;
  minValue: number;
  maxValue: number;
  formattedValue: string;
  subLabel: string;
  tone: MarginGaugeTone;
}

function clampPct(val: number, min = 4, max = 100): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Pure first-principles margin gauge telemetry for visual mechanical safety bars:
 * 1) Chamber Safety Margin (unlock pressure headroom below safe ceiling)
 * 2) Bolt Carrier Stroke (0–120% with 78% FTE short-stroke cutoff tick)
 * 3) Lock Dwell Window (ms after muzzle exit before breech unlock)
 */
export function computeMechanicalMarginGauges(
  evaluation: CausalityEvaluation
): [
  MechanicalMarginGaugeReading,
  MechanicalMarginGaugeReading,
  MechanicalMarginGaugeReading,
] {
  const safeMpa = Math.max(1, evaluation.safeUnlockPressureMPa);
  const marginPct = Math.round(
    ((safeMpa - evaluation.chamberPressureAtUnlockMPa) / safeMpa) * 100
  );
  const safetyTone: MarginGaugeTone =
    marginPct < -15 ? 'hazard' : marginPct < 5 ? 'warning' : 'nominal';

  const strokePct = Math.round(evaluation.strokeRatio * 100);
  const strokeTone: MarginGaugeTone =
    evaluation.strokeRatio < 0.78
      ? 'hazard'
      : evaluation.strokeRatio > 1.12 || evaluation.boltVelocityRatio > 1.24
        ? 'warning'
        : 'nominal';

  const dwellMs = evaluation.dwellMarginMs;
  const dwellTone: MarginGaugeTone =
    dwellMs <= 0.05 ? 'hazard' : dwellMs < 0.45 ? 'warning' : 'nominal';

  return [
    {
      id: 'chamberSafety',
      fillPct: clampPct(50 + marginPct * 0.5),
      thresholdPct: 50,
      numericValue: marginPct,
      minValue: -100,
      maxValue: 100,
      formattedValue: `${marginPct >= 0 ? '+' : ''}${marginPct}%`,
      subLabel: `${evaluation.chamberPressureAtUnlockMPa.toFixed(0)} / ${safeMpa.toFixed(0)} MPa`,
      tone: safetyTone,
    },
    {
      id: 'carrierStroke',
      fillPct: clampPct((strokePct / 120) * 100),
      thresholdPct: (78 / 120) * 100,
      numericValue: strokePct,
      minValue: 0,
      maxValue: 120,
      formattedValue: `${strokePct}%`,
      subLabel: `v_bolt ${Math.round(evaluation.boltVelocityRatio * 100)}%`,
      tone: strokeTone,
    },
    {
      id: 'lockDwell',
      fillPct: clampPct(((dwellMs + 0.5) / 3.0) * 100),
      thresholdPct: (0.5 / 3.0) * 100,
      numericValue: Number(dwellMs.toFixed(2)),
      minValue: -0.5,
      maxValue: 2.5,
      formattedValue: `${dwellMs >= 0 ? '+' : ''}${dwellMs.toFixed(2)} ms`,
      subLabel: `f_unlock ${Math.round(evaluation.unlockProgressF * 100)}%`,
      tone: dwellTone,
    },
  ];
}

export function matchActiveCausalityExperiment(
  params: Pick<
    CausalityParameters,
    'gasPortScale' | 'recoilSpringKScale' | 'boltMassScale' | 'powderLoadScale'
  >
): CausalityExperimentId | null {
  for (const exp of CAUSALITY_EXPERIMENTS) {
    if (
      Math.abs(params.gasPortScale - exp.params.gasPortScale) < 0.005 &&
      Math.abs(params.recoilSpringKScale - exp.params.recoilSpringKScale) <
        0.005 &&
      Math.abs(params.boltMassScale - exp.params.boltMassScale) < 0.005 &&
      Math.abs(params.powderLoadScale - exp.params.powderLoadScale) < 0.005
    ) {
      return exp.id;
    }
  }
  return null;
}

export interface CausalitySandboxLocaleStrings {
  badge: string;
  title: string;
  subtitle: string;
  archerySubtitle: string;
  liveOn: string;
  liveOff: string;
  playFiring: string;
  pauseFiring: string;
  reset: string;
  close: string;
  experimentsHeading: string;
  experiments: Record<
    CausalityExperimentId,
    { label: string; tag: string; insight: string }
  >;
  gaugesHeading: string;
  gauges: {
    chamberSafety: { label: string; threshold: string };
    carrierStroke: { label: string; threshold: string };
    lockDwell: { label: string; threshold: string };
  };
  presetsHeading: string;
  sliders: {
    gasPort: string;
    gasPortArchery: string;
    recoilSpring: string;
    recoilSpringArchery: string;
    boltMass: string;
    boltMassArchery: string;
    powderLoad: string;
    powderLoadArchery: string;
  };
  presets: Record<
    CausalityPresetId,
    { label: string; hint: string }
  >;
  metrics: {
    cadence: string;
    peakPressure: string;
    unlockPressure: string;
    stroke: string;
    muzzleVelocity: string;
    dwellMargin: string;
  };
  plot: {
    legendBaseline: string;
    legendModified: string;
    legendSafeLimit: string;
    unlockTag: string;
  };
  diagnostics: Record<
    CausalityDiagnosticStatus,
    { label: string; desc: string }
  >;
}

export const CAUSALITY_SANDBOX_STRINGS: Record<
  LanguageCode,
  CausalitySandboxLocaleStrings
> = {
  zh: {
    badge: '机械因果实验室 · CAUSALITY LAB',
    title: '闭锁与内弹道因果沙盒',
    subtitle: '实时耦合导气量、复进簧刚度、机框质量与装药量，直接驱动 3D 射速与后坐行程',
    archerySubtitle: '实时耦合凸轮拉力、弓臂刚度、箭重与拉距做功，直接驱动撒放循环',
    liveOn: '3D 实时耦合',
    liveOff: '已旁路',
    playFiring: '播放实弹循环',
    pauseFiring: '暂停击发',
    reset: '恢复出厂',
    close: '关闭沙盒',
    experimentsHeading: '引导式机械因果实验',
    experiments: {
      mil_spec_equilibrium: {
        label: '军标平衡工况',
        tag: '1.00× 标定',
        insight:
          '膛压在弹头出膛后平稳跌破安全阈值才启动开锁，机框获得 100% 满行程抛壳与稳定复进。',
      },
      subsonic_fte_short_stroke: {
        label: '亚音速欠气短行程',
        tag: 'FTE 卡壳',
        insight:
          '低装药叠加高刚度复进簧令自动机冲量跌破 78% 临界行程，弹壳滞留抛壳窗且无法越过弹匣推弹。',
      },
      overpressure_early_unlock: {
        label: '高膛压提前开锁',
        tag: '早开锁危险',
        insight:
          '过量装药与高导气冲量在残余膛压未泄放前强行拉动开锁斜面，黄铜弹壳贴壁摩擦易拉断底缘。',
      },
      suppressed_backpressure_surge: {
        label: '消音器背压激增',
        tag: '背压过速',
        insight:
          '消音器多级挡板滞留火药燃气令导气通量跃升至 1.48×，显著抬高循环射速并放大机框尾铁撞击载荷。',
      },
    },
    gaugesHeading: '实时机械安全裕度仪表',
    gauges: {
      chamberSafety: {
        label: '闭锁膛压裕度',
        threshold: '安全红线 0%',
      },
      carrierStroke: {
        label: '机框后坐行程',
        threshold: '78% 抛壳下限',
      },
      lockDwell: {
        label: '闭锁延时窗口',
        threshold: '0.0 ms 临界',
      },
    },
    presetsHeading: '快速工况预设',
    sliders: {
      gasPort: '导气孔 / 驱动通量',
      gasPortArchery: '凸轮省力谷驱动比',
      recoilSpring: '复进簧刚度 k',
      recoilSpringArchery: '复合弓片刚度 k',
      boltMass: '枪机 / 自动机质量 m',
      boltMassArchery: '箭矢 / 滑梭质量 m',
      powderLoad: '发射药装药量',
      powderLoadArchery: '拉距峰值拉力载荷',
    },
    presets: {
      factory: {
        label: '原厂基准',
        hint: '军标公差平衡工况（1.00× 全参数）',
      },
      suppressed_overgas: {
        label: '消音器过气',
        hint: '消音器背压抬高导气通量 1.38×，提早开锁并剧烈增压',
      },
      subsonic_underpower: {
        label: '亚音速欠气',
        hint: '低膛压减装药配硬复进簧，模拟半行程不抛壳卡壳倾向',
      },
      lightweight_competition: {
        label: '竞赛减重机框',
        hint: '钛合金减重自动机 0.72×，射速激增但后坐撞击剧烈',
      },
      heavy_arctic_buffer: {
        label: '高寒加重缓冲',
        hint: '加重缓冲器 1.42× 与高刚度复进簧，平滑压低循环射速',
      },
    },
    metrics: {
      cadence: '理论射速',
      peakPressure: '峰值膛压',
      unlockPressure: '开锁残压',
      stroke: '后坐行程比',
      muzzleVelocity: '修正初速',
      dwellMargin: '闭锁安全裕度',
    },
    plot: {
      legendBaseline: '基准 P(f)',
      legendModified: '沙盒 P(f)',
      legendSafeLimit: '安全开锁上限',
      unlockTag: '开锁',
    },
    diagnostics: {
      nominal: {
        label: '闭锁与抽壳裕度正常',
        desc: '膛压已回落至安全阈内再行开锁，全行程抛壳复进可靠。',
      },
      overgassed_early_unlock: {
        label: '过气早开锁风险',
        desc: '开锁时刻残余膛压高于安全极限，弹壳尚未缩径易导致拉断底缘。',
      },
      short_stroke_fte: {
        label: '短行程抛壳故障 (FTE)',
        desc: '驱动冲量不足导致机框后坐行程低于 78%，无法稳定越过弹匣推弹进膛。',
      },
      excessive_bolt_velocity: {
        label: '机框撞击过速告警',
        desc: '自动机线速度超过设计包线 124%，尾铁/机匣碰撞载荷激增并易跳弹。',
      },
    },
  },
  en: {
    badge: 'CAUSALITY PHYSICS LAB',
    title: 'Ballistic & Action Causality Sandbox',
    subtitle:
      'Live-coupled gas drive, recoil spring stiffness k, bolt mass m, and charge scaling driving 3D cadence & stroke',
    archerySubtitle:
      'Live-coupled cam draw drive, limb stiffness k, arrow mass m, and draw load driving 3D cycle kinematics',
    liveOn: '3D Coupled',
    liveOff: 'Bypassed',
    playFiring: 'Play Firing Cycle',
    pauseFiring: 'Pause Cycle',
    reset: 'Factory Reset',
    close: 'Close Sandbox',
    experimentsHeading: 'Guided Physics Experiments',
    experiments: {
      mil_spec_equilibrium: {
        label: 'Mil-Spec Equilibrium',
        tag: '1.00x Nominal',
        insight:
          'Chamber pressure drops safely below the extraction threshold before cam unlock, yielding full 100% carrier stroke.',
      },
      subsonic_fte_short_stroke: {
        label: 'Subsonic FTE Short-Stroke',
        tag: 'FTE Cutoff',
        insight:
          'Reduced propellant impulse against a stiff spring starves carrier travel below 78%, stranding spent brass in the port.',
      },
      overpressure_early_unlock: {
        label: 'Overpressure Early Unlock',
        tag: 'Early Unlock',
        insight:
          'Hot charge and oversized gas drive rotate the bolt before pressure decays, risking torn rims while brass grips the chamber.',
      },
      suppressed_backpressure_surge: {
        label: 'Suppressed Backpressure Surge',
        tag: 'Surge Load',
        insight:
          'Suppressor baffle dwell boosts gas flux to 1.48x, spiking cyclic cadence and slamming the carrier into the rear buffer.',
      },
    },
    gaugesHeading: 'Live Mechanical Margin Gauges',
    gauges: {
      chamberSafety: {
        label: 'Chamber Safety Margin',
        threshold: '0% Ceiling',
      },
      carrierStroke: {
        label: 'Bolt Carrier Stroke',
        threshold: '78% FTE Min',
      },
      lockDwell: {
        label: 'Lock Dwell Window',
        threshold: '0.0 ms Floor',
      },
    },
    presetsHeading: 'Quick Operating Regimes',
    sliders: {
      gasPort: 'Gas Port / Drive Flux',
      gasPortArchery: 'Cam Draw Drive Ratio',
      recoilSpring: 'Recoil Spring k',
      recoilSpringArchery: 'Limb Stiffness k',
      boltMass: 'Bolt / Carrier Mass m',
      boltMassArchery: 'Arrow / Sled Mass m',
      powderLoad: 'Propellant Charge',
      powderLoadArchery: 'Peak Draw Load',
    },
    presets: {
      factory: {
        label: 'Factory Spec',
        hint: 'Baseline military specification tolerances (1.00x all parameters)',
      },
      suppressed_overgas: {
        label: 'Suppressed Overgas',
        hint: 'Can back-pressure raises gas drive to 1.38x, rushing unlock under high pressure',
      },
      subsonic_underpower: {
        label: 'Subsonic Short-Stroke',
        hint: 'Reduced powder charge against stiff recoil spring causing incomplete rearward stroke',
      },
      lightweight_competition: {
        label: 'Lightweight Race BCG',
        hint: 'Low-mass carrier (0.72x) spikes cyclic cadence and bolt velocity',
      },
      heavy_arctic_buffer: {
        label: 'Heavy Arctic Buffer',
        hint: 'Heavy buffer (1.42x) + stiff spring delays unlock and tames cyclic speed',
      },
    },
    metrics: {
      cadence: 'Cyclic Rate',
      peakPressure: 'Peak Pressure',
      unlockPressure: 'Unlock Residual',
      stroke: 'Stroke Ratio',
      muzzleVelocity: 'Modified V0',
      dwellMargin: 'Dwell Margin',
    },
    plot: {
      legendBaseline: 'Baseline P(f)',
      legendModified: 'Sandbox P(f)',
      legendSafeLimit: 'Safe Unlock Ceiling',
      unlockTag: 'Unlock',
    },
    diagnostics: {
      nominal: {
        label: 'Nominal Dwell & Unlock',
        desc: 'Chamber pressure bleeds below safe unlock ceiling prior to extraction with full carrier travel.',
      },
      overgassed_early_unlock: {
        label: 'Overgassed Early Unlock',
        desc: 'Carrier unlocks while residual chamber pressure exceeds safe limit; brass case grips chamber walls.',
      },
      short_stroke_fte: {
        label: 'Short-Stroke Failure (FTE)',
        desc: 'Insufficient carrier impulse reduces stroke below 78%, risking failed ejection or missed feed pickup.',
      },
      excessive_bolt_velocity: {
        label: 'Excessive Carrier Velocity',
        desc: 'Carrier rearward velocity exceeds 124% design envelope, elevating receiver impact & bolt bounce.',
      },
    },
  },
};
