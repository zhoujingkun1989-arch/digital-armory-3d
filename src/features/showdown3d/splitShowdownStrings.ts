import type { LanguageCode } from '../../narration/types';

export interface SplitShowdownStringBundle {
  backVault: string;
  backMatrix: string;
  title: string;
  rivalryLabel: string;
  customRivalry: string;
  swapTitle: string;
  linkedOrbitOn: string;
  linkedOrbitOff: string;
  modeExplode: string;
  modeFiring: string;
  sectionLabel: string;
  xrayLabel: string;
  tintLabel: string;
  playLabel: string;
  pauseLabel: string;
  vsBadge: string;
  leftPaneTag: string;
  rightPaneTag: string;
  caliberLabel: string;
  operatingLabel: string;
  velocityLabel: string;
  energyLabel: string;
  pressureLiveLabel: string;
  velocityLiveLabel: string;
  dragHintLinked: string;
  dragHintFree: string;
  resetCamTitle: string;
  openWorkbenchA: string;
  openWorkbenchB: string;
  matrixLaunchBtn: string;
  matrixLaunchTitle: string;
  axisZ: string;
  axisX: string;
  axisY: string;
}

export const SPLIT_SHOWDOWN_STRINGS: Record<
  LanguageCode,
  SplitShowdownStringBundle
> = {
  zh: {
    backVault: '返回兵器库',
    backMatrix: '参数对照矩阵',
    title: '双展品实时 3D 同屏同步剖视对比台',
    rivalryLabel: '经典对决预设',
    customRivalry: '自由组合对比',
    swapTitle: '左右互换对比展品',
    linkedOrbitOn: '双屏同步运镜',
    linkedOrbitOff: '左右独立旋转',
    modeExplode: '分解拆装对比',
    modeFiring: '击发内弹道对比',
    sectionLabel: 'CT 剖视',
    xrayLabel: 'X-Ray 透视',
    tintLabel: '职能分色',
    playLabel: '同步播放',
    pauseLabel: '暂停对比',
    vsBadge: 'VS',
    leftPaneTag: 'A 槽 · 左机位',
    rightPaneTag: 'B 槽 · 右机位',
    caliberLabel: '口径',
    operatingLabel: '核心原理',
    velocityLabel: '标称初速',
    energyLabel: '枪/炮口动能',
    pressureLiveLabel: '瞬时膛压',
    velocityLiveLabel: '膛内瞬速',
    dragHintLinked: '在任意半区拖动，两侧以 1:1 自适应尺度同步旋转 · 滚轮缩放',
    dragHintFree: '独立运镜模式：分别在左侧或右侧拖动以独立观察差异局部',
    resetCamTitle: '重置双机位视角',
    openWorkbenchA: '单机精拆 A',
    openWorkbenchB: '单机精拆 B',
    matrixLaunchBtn: '进入实时 3D 双屏剖视对比',
    matrixLaunchTitle: '在单画布双视口中实时同屏对比这两款展品的 3D 剖视与动作时序',
    axisZ: 'Z 纵',
    axisX: 'X 横',
    axisY: 'Y 俯',
  },
  en: {
    backVault: 'Vault',
    backMatrix: 'Specs Matrix',
    title: 'Live 3D Split-Screen Synchronized Mechanism Showdown',
    rivalryLabel: 'Rivalry Preset',
    customRivalry: 'Custom Pairing',
    swapTitle: 'Swap Left & Right Exhibits',
    linkedOrbitOn: 'Linked 3D Orbit',
    linkedOrbitOff: 'Independent Orbit',
    modeExplode: 'Exploded Teardown',
    modeFiring: 'Live Firing Cycle',
    sectionLabel: 'CT Cut',
    xrayLabel: 'X-Ray',
    tintLabel: 'Role Tint',
    playLabel: 'Sync Play',
    pauseLabel: 'Pause',
    vsBadge: 'VS',
    leftPaneTag: 'SLOT A · LEFT VIEWPORT',
    rightPaneTag: 'SLOT B · RIGHT VIEWPORT',
    caliberLabel: 'Caliber',
    operatingLabel: 'Action',
    velocityLabel: 'Muzzle V0',
    energyLabel: 'Energy',
    pressureLiveLabel: 'Live P(f)',
    velocityLiveLabel: 'Live V(f)',
    dragHintLinked: 'Drag either half to orbit both exhibits in lockstep · Scroll to zoom',
    dragHintFree: 'Independent orbit active: drag left or right pane separately',
    resetCamTitle: 'Reset Split View Cameras',
    openWorkbenchA: 'Inspect A',
    openWorkbenchB: 'Inspect B',
    matrixLaunchBtn: 'Launch Live 3D Split-Screen',
    matrixLaunchTitle: 'Compare these two exhibits live side-by-side in synchronized 3D cutaway viewports',
    axisZ: 'Z Long',
    axisX: 'X Cross',
    axisY: 'Y Top',
  },
};
