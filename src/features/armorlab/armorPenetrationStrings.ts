import type { PenetrationOutcome } from '../../engine/physics/armorPenetration';
import type { LanguageCode } from '../../narration/types';
import type { TheaterPhase } from './armorPenetration3DMath';

export interface ArmorPenetrationLocaleStrings {
  badge: string;
  title: string;
  subtitle: string;
  close: string;
  penetratorHeading: string;
  targetTankHeading: string;
  zoneHeading: string;
  rangeLabel: string;
  obliquityLabel: string;
  eraToggleLabel: string;
  eraUnavailable: string;
  eraOn: string;
  eraOff: string;
  crossSectionTitle: string;
  rangeCurveTitle: string;
  layerTableTitle: string;
  viewModes: {
    groupAria: string;
    theater3d: string;
    schematic2d: string;
    split: string;
  };
  theater: {
    title: string;
    play: string;
    pause: string;
    reset: string;
    resetCamera: string;
    speedLabel: string;
    timelineAria: string;
    liveVelocity: string;
    liveCavity: string;
    spallConeLabel: string;
    orbitHint: string;
    webglFallback: string;
    phases: Record<TheaterPhase, string>;
  };
  kpi: {
    outcome: string;
    velocity: string;
    energy: string;
    penDepth: string;
    targetRhae: string;
    margin: string;
    effectiveAngle: string;
    ricochetCutoff: string;
  };
  outcomes: Record<
    PenetrationOutcome,
    { label: string; summary: string }
  >;
  tableCols: {
    layer: string;
    physical: string;
    los: string;
    rhae: string;
    status: string;
  };
  layerStatus: {
    defeated: string;
    stopped: string;
    ricocheted: string;
  };
  curveLegend: {
    penetration: string;
    targetReq: string;
  };
}

export const ARMOR_PENETRATION_STRINGS: Record<
  LanguageCode,
  ArmorPenetrationLocaleStrings
> = {
  zh: {
    badge: 'WP-20 · 1:1 穿甲抗弹实验室',
    title: '主战坦克复合装甲抗弹与穿甲推演台',
    subtitle:
      '基于 Lanz-Odermatt 长杆穿甲方程与 De Marre 均质钢方程，实时解算爆炸反应装甲（ERA）、陶瓷复合背板与入射倾角抗弹边界',
    close: '关闭穿甲实验室',
    penetratorHeading: '选择穿甲弹药（KE 动能弹）',
    targetTankHeading: '目标受弹载具',
    zoneHeading: '受弹车体 / 炮塔防区',
    rangeLabel: '交战距离',
    obliquityLabel: '额外偏转着角',
    eraToggleLabel: '反应装甲 (ERA) 挂载状态',
    eraUnavailable: '该防区无挂装 ERA',
    eraOn: 'ERA 完整引爆防护',
    eraOff: 'ERA 已剥离 / 击毁',
    crossSectionTitle: '多材料装甲层截面穿深剖视图',
    rangeCurveTitle: '穿深随距离衰减曲线（500 – 3,500 m）',
    layerTableTitle: '各介质装甲抗弹等效拆解明细',
    viewModes: {
      groupAria: '切换穿甲可视化视图模式',
      theater3d: '3D 剖视剧场',
      schematic2d: '2D 原理剖图',
      split: '3D + 2D 双屏',
    },
    theater: {
      title: '1:1 3D 实时慢动作复合装甲穿甲剖视剧场',
      play: '播放',
      pause: '暂停',
      reset: '重播',
      resetCamera: '复位视角',
      speedLabel: '慢动作倍速',
      timelineAria: '穿甲慢动作时间轴',
      liveVelocity: '瞬时存速',
      liveCavity: '实时侵彻',
      spallConeLabel: '崩落锥角',
      orbitHint: '拖拽 3D 旋转 · 滚轮缩放',
      webglFallback: 'WebGL 渲染上下文已暂停，请切换 2D 原理剖图或重新打开实验室',
      phases: {
        approach: '超高速接敌逼近',
        era_detonation: 'ERA 爆反引爆 · 双飞板剪切',
        penetration: '流体动力学高温侵彻',
        perforation_spall: '背板穿透 · 车内高速崩落射流',
        defeated_arrest: '复合甲成功拦截 · 弹芯耗尽',
        ricochet_deflect: '大倾角滑移跳弹偏转',
      },
    },
    kpi: {
      outcome: '毁伤判定',
      velocity: '着靶存速',
      energy: '着靶动能',
      penDepth: '穿甲等效深',
      targetRhae: '目标防区等效',
      margin: '过穿 / 防护余量',
      effectiveAngle: '合成法线着角',
      ricochetCutoff: '跳弹临界角',
    },
    outcomes: {
      perforation: {
        label: '彻底击穿（PERFORATION）',
        summary: '残余侵彻深度超越装甲总 RHAe 等效，主装甲背板发生穿孔并形成车内高速金属崩落射流。',
      },
      partial_penetration: {
        label: '未击穿防护（DEFEATED）',
        summary: '复合约束层、ERA 侧向剪切波与高硬均质背板成功耗尽弹芯动能，内壁保持完整。',
      },
      ricochet: {
        label: '大倾角跳弹（RICOCHET）',
        summary: '合成着角触发弹芯滑移临界，长杆发生剧烈折断或沿装甲表面跳飞。',
      },
    },
    tableCols: {
      layer: '装甲层级',
      physical: '法线实厚',
      los: '视线厚 LOS',
      rhae: '等效均质钢',
      status: '抗弹状态',
    },
    layerStatus: {
      defeated: '已穿透',
      stopped: '成功拦截',
      ricocheted: '表面跳飞',
    },
    curveLegend: {
      penetration: '弹芯穿深 RHAe',
      targetReq: '目标装甲等效线',
    },
  },
  en: {
    badge: 'WP-20 · ARMOR PENETRATION LAB',
    title: '1:1 Composite Armor & Kinetic Penetrator Lab',
    subtitle:
      'Lanz-Odermatt long-rod & De Marre steel perforation solver evaluating ERA shearing, ceramic NERA arrays, line-of-sight obliquity, and range decay',
    close: 'Close Armor Lab',
    penetratorHeading: 'Select Kinetic Penetrator',
    targetTankHeading: 'Target Armored Vehicle',
    zoneHeading: 'Armor Protection Zone',
    rangeLabel: 'Engagement Range',
    obliquityLabel: 'Additional Obliquity',
    eraToggleLabel: 'Explosive Reactive Armor (ERA)',
    eraUnavailable: 'Zone lacks ERA array',
    eraOn: 'ERA Intact & Active',
    eraOff: 'ERA Stripped / Expended',
    crossSectionTitle: 'Multi-Layer Armor Cross-Section & Penetration Path',
    rangeCurveTitle: 'RHAe Penetration vs Range Curve (500 - 3,500 m)',
    layerTableTitle: 'Layer-by-Layer Armor Defeat Breakdown',
    viewModes: {
      groupAria: 'Armor penetration visualization mode',
      theater3d: '3D Cutaway Theater',
      schematic2d: '2D Schematic',
      split: 'Split',
    },
    theater: {
      title: '1:1 3D Slow-Motion Penetration Cutaway Theater',
      play: 'Play',
      pause: 'Pause',
      reset: 'Reset',
      resetCamera: 'Reset View',
      speedLabel: 'Playback speed',
      timelineAria: 'Penetration slow-motion timeline',
      liveVelocity: 'Velocity',
      liveCavity: 'Cavity',
      spallConeLabel: 'Spall Cone',
      orbitHint: 'Drag to Orbit · Scroll to Zoom',
      webglFallback:
        'WebGL context paused. Switch to 2D Schematic or reopen the lab.',
      phases: {
        approach: 'HYPERVELOCITY APPROACH',
        era_detonation: 'ERA FLYER DETONATION',
        penetration: 'HYDRODYNAMIC PENETRATION',
        perforation_spall: 'PERFORATED · SPALL CONE',
        defeated_arrest: 'DEFEATED · CORE ARRESTED',
        ricochet_deflect: 'RICOCHET DEFLECTION',
      },
    },
    kpi: {
      outcome: 'Terminal Verdict',
      velocity: 'Impact Velocity',
      energy: 'Impact Energy',
      penDepth: 'Penetration RHAe',
      targetRhae: 'Target Array RHAe',
      margin: 'Overmatch Margin',
      effectiveAngle: 'Combined Angle',
      ricochetCutoff: 'Ricochet Cutoff',
    },
    outcomes: {
      perforation: {
        label: 'PERFORATION',
        summary:
          'Residual penetrator energy exceeds cumulative array RHAe resistance, breaching the backing plate with spall.',
      },
      partial_penetration: {
        label: 'ARMOR HELD / DEFEATED',
        summary:
          'Composite NERA ceramics, ERA shearing, and RHA backing exhaust penetrator momentum prior to perforation.',
      },
      ricochet: {
        label: 'CRITICAL RICOCHET',
        summary:
          'Combined obliquity exceeds critical sliding threshold, deflecting or shattering the core along the glacis.',
      },
    },
    tableCols: {
      layer: 'Armor Layer',
      physical: 'Normal mm',
      los: 'LOS mm',
      rhae: 'RHAe mm',
      status: 'Status',
    },
    layerStatus: {
      defeated: 'Defeated',
      stopped: 'Stopped',
      ricocheted: 'Ricocheted',
    },
    curveLegend: {
      penetration: 'Penetration RHAe',
      targetReq: 'Zone Effective RHAe',
    },
  },
};
