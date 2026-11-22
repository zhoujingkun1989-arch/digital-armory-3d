import type {
  CausalityDiagnosticStatus,
  CausalityPresetId,
} from '../../engine/physics/causalitySandbox';
import type { LanguageCode } from '../../narration/types';

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
    badge: 'WP-20 · 物理沙盒',
    title: '闭锁与内弹道因果沙盒',
    subtitle: '实时耦合导气量、复进簧刚度、机框质量与装药量，直接驱动 3D 射速与后坐行程',
    archerySubtitle: '实时耦合凸轮拉力、弓臂刚度、箭重与拉距做功，直接驱动撒放循环',
    liveOn: '3D 实时耦合',
    liveOff: '已旁路',
    playFiring: '播放实弹循环',
    pauseFiring: '暂停击发',
    reset: '恢复出厂',
    close: '关闭沙盒',
    presetsHeading: '典型工况预设',
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
    badge: 'WP-20 · CAUSALITY SANDBOX',
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
    presetsHeading: 'Operating Regimes',
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
