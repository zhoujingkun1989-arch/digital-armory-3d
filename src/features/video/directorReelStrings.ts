import type { LanguageCode } from '../../narration/types';

export interface DirectorReelLocaleStrings {
  badge: string;
  title: string;
  subtitle: string;
  presetHeading: string;
  includeAudio: string;
  autoCycleFiring: string;
  startBtn: string;
  stopAndSaveBtn: string;
  recordingBadge: string;
  elapsedLabel: string;
  unsupportedHint: string;
  readyHint: string;
  savedMsg: string;
  close: string;
}

export const DIRECTOR_REEL_STRINGS: Record<
  LanguageCode,
  DirectorReelLocaleStrings
> = {
  zh: {
    badge: 'WP-22 · 导演级视频制片台',
    title: '60fps 3D 导演机械短片录制与导出',
    subtitle:
      '将实时 WebGL 剖视/拆解渲染、同步内弹道遥测角标、TTS 旁白字幕与 Web Audio 机械声场合成为离线可分享的 WebM / MP4 短片',
    presetHeading: '导出分辨率与画幅预设',
    includeAudio: '混录 Web Audio 枪械声效音轨',
    autoCycleFiring: '录制期间自动循环实弹击发演示',
    startBtn: '开始录制短片',
    stopAndSaveBtn: '停止并下载视频',
    recordingBadge: 'REC 录制中',
    elapsedLabel: '已录制时长',
    unsupportedHint: '当前浏览器无头环境未开启 MediaRecorder 编码器，可切换标准桌面浏览器保存视频。',
    readyHint: '就绪：点击下方按钮即可实时合帧录制当前 3D 视口与字幕水印。',
    savedMsg: '导演短片已成功合成并触发下载！',
    close: '关闭导演录制台',
  },
  en: {
    badge: 'WP-22 · DIRECTOR REEL STUDIO',
    title: 'WebGL Director Reel Video Capture & Export',
    subtitle:
      'Composite the live 3D cutaway canvas, ballistic telemetry overlays, subtitles, and Web Audio soundscape into a downloadable WebM or MP4 reel',
    presetHeading: 'Aspect Ratio & Bitrate Preset',
    includeAudio: 'Mix Web Audio Mechanical & Ballistic SFX',
    autoCycleFiring: 'Auto-loop firing simulation while recording',
    startBtn: 'Start Recording',
    stopAndSaveBtn: 'Stop & Download Reel',
    recordingBadge: 'REC LIVE',
    elapsedLabel: 'Elapsed',
    unsupportedHint:
      'MediaRecorder codec support is disabled in this environment; standard Chromium/Chrome/Edge browsers export natively.',
    readyHint:
      'Ready: records the active 3D WebGL viewport with technical museum HUD and subtitles.',
    savedMsg: 'Director Reel rendered and downloaded!',
    close: 'Close Director Reel Studio',
  },
};
