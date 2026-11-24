import type { LanguageCode } from '../../narration/types';

export interface DirectorReelLocaleStrings {
  badge: string;
  title: string;
  subtitle: string;
  presetHeading: string;
  previewHeading: string;
  previewBroadcastTag: string;
  previewCleanFeedTag: string;
  includeAudio: string;
  includeLowerThird: string;
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
    badge: '导演级 3D 视频制片台',
    title: '1080p 导演机械短片录制与广播级导出',
    subtitle:
      '将实时 WebGL 剖视/拆解渲染、广播级博物馆下三分之一标题条、TTS 旁白字幕与 Web Audio 机械声场合成为离线可分享的 WebM / MP4 短片',
    presetHeading: '导出分辨率与画幅预设',
    previewHeading: '画幅构图与广播标题卡预览',
    previewBroadcastTag: '广播标题卡 + 馆藏水印',
    previewCleanFeedTag: '纯净无字幕画面',
    includeAudio: '混录 Web Audio 枪械声效音轨',
    includeLowerThird: '叠加广播级博物馆下三分之一标题卡与水印',
    autoCycleFiring: '录制期间自动循环实弹击发演示',
    startBtn: '开始录制短片',
    stopAndSaveBtn: '停止并下载视频',
    recordingBadge: 'REC 录制中',
    elapsedLabel: '已录制时长',
    unsupportedHint:
      '当前浏览器无头环境未开启 MediaRecorder 编码器，可切换标准桌面浏览器保存视频。',
    readyHint: '就绪：点击下方按钮即可实时合帧录制当前 3D 视口与广播标题卡。',
    savedMsg: '导演短片已成功合成并触发下载！',
    close: '关闭导演录制台',
  },
  en: {
    badge: 'DIRECTOR REEL STUDIO',
    title: '1080p Broadcast Director Reel Capture & Export',
    subtitle:
      'Composite the live 3D cutaway canvas, museum broadcast lower-third title card, subtitles, and Web Audio soundscape into a downloadable WebM or MP4 reel',
    presetHeading: 'Aspect Ratio & Bitrate Preset',
    previewHeading: 'Framing & Broadcast Lower-Third Preview',
    previewBroadcastTag: 'Broadcast Lower-Third + Watermark',
    previewCleanFeedTag: 'Clean Unbadged Feed',
    includeAudio: 'Mix Web Audio Mechanical & Ballistic SFX',
    includeLowerThird: 'Composite Broadcast Museum Lower-Third & Watermark',
    autoCycleFiring: 'Auto-loop firing simulation while recording',
    startBtn: 'Start Recording',
    stopAndSaveBtn: 'Stop & Download Reel',
    recordingBadge: 'REC LIVE',
    elapsedLabel: 'Elapsed',
    unsupportedHint:
      'MediaRecorder codec support is disabled in this environment; standard Chromium/Chrome/Edge browsers export natively.',
    readyHint:
      'Ready: records the active 3D WebGL viewport with optional broadcast lower-third title card and subtitles.',
    savedMsg: 'Director Reel rendered and downloaded!',
    close: 'Close Director Reel Studio',
  },
};
