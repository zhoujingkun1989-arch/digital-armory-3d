import type { LanguageCode } from '../../narration/types';

export type PosterAspectRatio = '16:9' | '4:5';
export type PosterThemeId =
  | 'obsidian_gold'
  | 'blueprint_white'
  | 'cyber_cyan';
export type PosterArmorerRank = 'S' | 'A' | 'B' | 'C';

export interface PosterShareCopy {
  studioBadge: string;
  studioTitle: string;
  studioSub: string;
  closeTitle: string;
  recaptureBtn: string;
  recaptureTitle: string;
  exhibitSelectAria: string;
  aspectLabel: string;
  aspectOptions: Record<
    PosterAspectRatio,
    { label: string; sub: string; dims: string }
  >;
  themeLabel: string;
  themeOptions: Record<PosterThemeId, { label: string; tip: string }>;
  callsignLabel: string;
  callsignPlaceholder: string;
  rankSealLabel: string;
  rankNone: string;
  rankTitles: Record<PosterArmorerRank, string>;
  rankStampHeader: string;
  downloadPngBtn: string;
  downloadingBtn: string;
  copyImageBtn: string;
  copiedImageBtn: string;
  copyLinkBtn: string;
  copiedLinkBtn: string;
  nativeShareBtn: string;
  shareTitle: (weaponName: string) => string;
  shareText: (weaponName: string, bayCode: string) => string;
  capturingStatus: string;
  readyStatus: (width: number, height: number, aspect: PosterAspectRatio) => string;
  fallbackStageNote: string;
  poster: {
    museumKicker: string;
    scaleTag: string;
    modeSectionCut: string;
    modeXray: string;
    modeRoleTint: string;
    modeExploded: (pct: number) => string;
    modeFiring: string;
    modeBattery: string;
    metricCaliber: string;
    metricMuzzleVel: string;
    metricOal: string;
    metricCadParts: string;
    partsUnit: (count: number, groups: number) => string;
    curveFirearmTitle: string;
    curveArcheryTitle: string;
    peakPressureTag: (mpa: number) => string;
    drawPeakTag: (mpa: number) => string;
    qrTitle: string;
    qrSub: string;
    qrCutawayHint: string;
    curatedBy: string;
    colophon: string;
  };
}

export const POSTER_SHARE_STRINGS: Readonly<
  Record<LanguageCode, PosterShareCopy>
> = {
  zh: {
    studioBadge: '高清 3D 剖视海报工坊',
    studioTitle: '实时 3D 机械剖视社交分享海报工坊',
    studioSub:
      '一键定格当前 WebGL 2.0 实时视口，矢量级合成双语铭牌、1:1 量测参数、内弹道曲线与可扫码直达二维码',
    closeTitle: '关闭海报分享工坊',
    recaptureBtn: '重拍当前 3D 视角',
    recaptureTitle: '重新抓拍当前实时 3D 视口的角度、剖视与爆炸状态',
    exhibitSelectAria: '选择海报展示藏品',
    aspectLabel: '画幅比例',
    aspectOptions: {
      '16:9': {
        label: '16:9 横屏宽幅',
        sub: '桌面壁纸 · B站 · X · YouTube',
        dims: '1920 × 1080',
      },
      '4:5': {
        label: '4:5 竖屏社交',
        sub: '小红书 · 微信朋友圈 · Instagram',
        dims: '1080 × 1350',
      },
    },
    themeLabel: '策展视觉主题',
    themeOptions: {
      obsidian_gold: {
        label: '黑曜战术金',
        tip: '深邃枪铁黑曜石底色配皇家黄铜金刻度线',
      },
      blueprint_white: {
        label: '工程蓝图白',
        tip: 'ISO 建筑工程白昼图纸配精密钴蓝尺寸标尺',
      },
      cyber_cyan: {
        label: '赛博青剖视',
        tip: '暗夜激光青矩阵网格配高亮遥测流光边框',
      },
    },
    callsignLabel: '藏家署名铭牌',
    callsignPlaceholder: '输入专属呼号 (如 ARMORER-01)...',
    rankSealLabel: '军械师认证印章',
    rankNone: '隐藏印章',
    rankTitles: {
      S: '首席军械师',
      A: '高级军械师',
      B: '合格军械员',
      C: '见习学徒',
    },
    rankStampHeader: 'ARMORER QUALIFIED · 军械考核认证',
    downloadPngBtn: '下载高清 PNG 海报',
    downloadingBtn: '正在生成 PNG...',
    copyImageBtn: '复制海报图片',
    copiedImageBtn: '已复制到剪贴板！',
    copyLinkBtn: '复制直达链接',
    copiedLinkBtn: '直达链接已复制！',
    nativeShareBtn: '系统原生分享',
    shareTitle: (weaponName) =>
      `${weaponName} · Digital Armory 3D 1:1 机械剖视海报`,
    shareText: (weaponName, bayCode) =>
      `探索 ${bayCode} ${weaponName} 的 1:1 浏览器实时 CSG 机械内构、双通道实心剖视与内弹道仿真：`,
    capturingStatus: '正在抓拍实时 WebGL 2.0 画面并合成高分倍率矢量铭牌...',
    readyStatus: (width, height, aspect) =>
      `已就绪 · ${width} × ${height} px (${aspect}) 无损 PNG · 扫码直达实时纵剖工作台`,
    fallbackStageNote: '1:1 实时 CSG 参数化精密建模视口',
    poster: {
      museumKicker: 'DIGITAL ARMORY 3D · 开源 1:1 轻武器与弓弩三维机械博物馆',
      scaleTag: '1:1 CAD MILLIMETER METROLOGY · WEBGL 2.0',
      modeSectionCut: 'SECTION-CUT · 实心纵剖',
      modeXray: 'X-RAY · 透视外壳',
      modeRoleTint: 'ROLE TINT · 职能分色',
      modeExploded: (pct) => `EXPLODED · 爆炸拆解 ${pct}%`,
      modeFiring: 'LIVE BALLISTICS · 实弹循环',
      modeBattery: '1:1 IN-BATTERY · 精密合拢',
      metricCaliber: '口径规格 · CALIBER',
      metricMuzzleVel: '初速动能 · MUZZLE VEL',
      metricOal: '全长尺度 · 1:1 OAL',
      metricCadParts: '实时构件 · CAD PARTS',
      partsUnit: (count, groups) => `${count} 件 · ${groups} 大总成`,
      curveFirearmTitle: 'SAAMI/CIP 膛压与初速曲线 P(t) · V(t)',
      curveArcheryTitle: '复合弓片蓄能与箭速曲线 F(t) · V(t)',
      peakPressureTag: (mpa) => `峰值膛压 ${mpa} MPa`,
      drawPeakTag: (mpa) => `等效峰值 ${mpa} MPa`,
      qrTitle: '扫码直达 3D 实心纵剖台',
      qrSub: '零客户端安装 · 浏览器原生秒开实时拆解与击发',
      qrCutawayHint: '?screen=workbench · 自动开启纵剖透视',
      curatedBy: 'CURATED BY · 藏家署名',
      colophon:
        'OPEN-SOURCE 3D MECHANICAL ENCYCLOPEDIA · PROCEDURAL CSG + 5-CH ORM PBR + 60FPS BALLISTICS',
    },
  },
  en: {
    studioBadge: 'HD 3D POSTER STUDIO',
    studioTitle: 'Instant HD 3D Cutaway Social Poster Studio',
    studioSub:
      'Capture the live WebGL 2.0 viewport into a vector-sharp museum card with 1:1 CAD metrology, ballistics & scannable QR',
    closeTitle: 'Close Poster Share Studio',
    recaptureBtn: 'Recapture 3D View',
    recaptureTitle:
      'Capture a fresh frame from the live 3D viewport with current camera, cutaway & explosion state',
    exhibitSelectAria: 'Select exhibit for poster metadata',
    aspectLabel: 'Aspect Ratio',
    aspectOptions: {
      '16:9': {
        label: '16:9 Widescreen',
        sub: 'Desktop · X · Bilibili · YouTube',
        dims: '1920 x 1080',
      },
      '4:5': {
        label: '4:5 Portrait Card',
        sub: 'Instagram · Mobile · Social Feed',
        dims: '1080 x 1350',
      },
    },
    themeLabel: 'Studio Theme',
    themeOptions: {
      obsidian_gold: {
        label: 'Obsidian Tactical Gold',
        tip: 'Anodized obsidian-gunmetal plate accented with warm brass-gold CAD fiducials',
      },
      blueprint_white: {
        label: 'Blueprint Engineering White',
        tip: 'Architectural ISO daylight vellum grid with cobalt-blue dimension hairlines',
      },
      cyber_cyan: {
        label: 'Cyber Cyan Cutaway',
        tip: 'Deep midnight schematic matrix with electric-cyan laser cutaway telemetry',
      },
    },
    callsignLabel: 'Collector Callsign',
    callsignPlaceholder: 'e.g. ARMORER-01 / Curator...',
    rankSealLabel: 'Armorer Rank Seal',
    rankNone: 'Hidden',
    rankTitles: {
      S: 'Master Armorer',
      A: 'Senior Armorer',
      B: 'Qualified Armorer',
      C: 'Armorer Trainee',
    },
    rankStampHeader: 'ARMORER QUALIFICATION SEAL',
    downloadPngBtn: 'Download HD PNG',
    downloadingBtn: 'Rendering PNG...',
    copyImageBtn: 'Copy Image',
    copiedImageBtn: 'Copied HD PNG!',
    copyLinkBtn: 'Copy Deep Link',
    copiedLinkBtn: 'Link Copied!',
    nativeShareBtn: 'Share Poster',
    shareTitle: (weaponName) =>
      `${weaponName} · Digital Armory 3D 1:1 Cutaway Poster`,
    shareText: (weaponName, bayCode) =>
      `Inspect ${bayCode} ${weaponName} in 1:1 browser-native 3D CSG cutaway & live internal ballistics:`,
    capturingStatus:
      'Capturing live WebGL 2.0 viewport & composing high-DPI vector plate...',
    readyStatus: (width, height, aspect) =>
      `Ready · ${width} x ${height} px (${aspect}) Lossless PNG · QR links directly to 3D Cutaway Workbench`,
    fallbackStageNote: '1:1 Live Procedural CSG Mechanical Viewport',
    poster: {
      museumKicker: 'DIGITAL ARMORY 3D · 1:1 CAD MECHANICAL MUSEUM',
      scaleTag: '1:1 CAD MILLIMETER METROLOGY · WEBGL 2.0',
      modeSectionCut: 'SECTION-CUT',
      modeXray: 'X-RAY',
      modeRoleTint: 'ROLE TINT',
      modeExploded: (pct) => `EXPLODED ${pct}%`,
      modeFiring: 'LIVE BALLISTICS',
      modeBattery: '1:1 IN-BATTERY',
      metricCaliber: 'CALIBER',
      metricMuzzleVel: 'MUZZLE VEL',
      metricOal: '1:1 OAL',
      metricCadParts: 'CAD PARTS',
      partsUnit: (count, groups) => `${count} PCS · ${groups} GROUPS`,
      curveFirearmTitle: 'SAAMI/CIP PRESSURE & VELOCITY P(t) · V(t)',
      curveArcheryTitle: 'CAM DRAW FORCE & VELOCITY F(t) · V(t)',
      peakPressureTag: (mpa) => `PEAK ${mpa} MPa`,
      drawPeakTag: (mpa) => `EQUIV ${mpa} MPa`,
      qrTitle: 'SCAN FOR LIVE 3D CUTAWAY',
      qrSub: 'Zero-Install Browser WebGL 2.0 Disassembly & Ballistics',
      qrCutawayHint: '?screen=workbench · Instant Cutaway View',
      curatedBy: 'CURATED BY',
      colophon:
        'OPEN-SOURCE 3D MECHANICAL ENCYCLOPEDIA · PROCEDURAL CSG + 5-CH ORM PBR + 60FPS BALLISTICS',
    },
  },
};
