import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AudioLines,
  ChevronDown,
  Disc3,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  Wrench,
} from 'lucide-react';
import {
  ACOUSTIC_ENVIRONMENT_CONFIGS,
  ACOUSTIC_ENVIRONMENT_PRESETS,
  CALIBER_ACOUSTIC_PROFILES,
  type AcousticEnvironmentPreset,
  type MechanismAcousticStyle,
  getWeaponBespokeAcousticSignature,
  playBrassCasingBounceSound,
  playPressCheckSpringSound,
  playWeaponFiringEventSound,
  playWorkbenchFoley,
  resolveWeaponMechanismAcousticStyle,
  unlockMechanicalAudio,
} from '../../engine/audio/mechanicalSoundEngine';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';

export const NON_BRASS_DROP_WEAPONS: ReadonlySet<WeaponId> = new Set<WeaponId>([
  'g11',
  'gau8',
  'lift33',
  'r500',
  'python',
]);

export function isBrassDropFoleySupported(weaponId: WeaponId): boolean {
  return !NON_BRASS_DROP_WEAPONS.has(weaponId);
}

export function getBrassDropUnsupportedReason(
  weaponId: WeaponId,
  lang: LanguageCode
): string {
  if (weaponId === 'g11') {
    return lang === 'en' ? 'Caseless (No Brass)' : '无壳弹（无抛壳）';
  }
  if (weaponId === 'gau8') {
    return lang === 'en'
      ? 'Closed-Loop Linkless Drum'
      : '闭环无链回壳弹鼓';
  }
  if (weaponId === 'python') {
    return lang === 'en' ? 'Cylinder Retains Cases' : '转轮弹巢留壳';
  }
  if (weaponId === 'lift33' || weaponId === 'r500') {
    return lang === 'en' ? 'Archery (No Brass)' : '弓弩机械（无弹壳）';
  }
  return lang === 'en' ? 'Unavailable' : '当前不可用';
}

export function formatAcousticPartialHz(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(2).replace(/\.00$/, '')} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export const MECHANISM_STYLE_LABELS: Readonly<
  Record<MechanismAcousticStyle, { zh: string; en: string }>
> = {
  long_stroke_piston: { zh: '长行程活塞导气', en: 'Long-Stroke Gas Piston' },
  open_bolt_lmg: { zh: '开膛弹链供弹机枪', en: 'Open-Bolt Belt-Fed LMG' },
  gas_carbine: { zh: '气吹/短行程步枪', en: 'Direct-Impingement / Gas Carbine' },
  pdw_blowback: { zh: '自由枪机高速防卫', en: 'Straight-Blowback PDW' },
  super_v_smg: { zh: 'Super V 延迟后坐', en: 'Super V Delayed Blowback' },
  compact_9mm: { zh: '枪管短后坐闭锁', en: 'Tilting-Barrel Short Recoil' },
  toggle_lock_pistol: { zh: '肘节屈膝短后坐', en: 'Toggle-Lock Short Recoil' },
  short_recoil_heavy: { zh: '重型长行程整管后坐', en: 'Heavy Barrel Short Recoil' },
  bolt_action: { zh: '手动旋转后拉枪机', en: 'Manual Rotating Bolt-Action' },
  gas_magnum_pistol: { zh: '导气式回转枪机手枪', en: 'Gas-Operated Rotating Bolt' },
  revolver_magnum: { zh: '双动转轮弹巢闭锁', en: 'Double-Action Revolver' },
  argo_shotgun: { zh: 'ARGO 双活塞导气', en: 'Dual-Piston ARGO Gas' },
  garand_enbloc: { zh: '漏夹弹射长行程活塞', en: 'En-Bloc Clip Gas Piston' },
  caseless_clockwork: { zh: '90° 旋转无壳弹膛', en: '90° Rotary Caseless Breech' },
  integral_suppressed: { zh: '整体微声消音导气', en: 'Integral Suppressed Gas' },
  electric_gatling: { zh: '电动六管外能源转管', en: 'Electric 6-Barrel Rotary' },
  pulley_hyperburst: { zh: '滑轮钢索超高速两连发', en: 'Pulley-Delayed Hyperburst' },
  compound_bow: { zh: '双偏心轮复合弓', en: 'Dual-Cam Compound Bow' },
  compound_crossbow: { zh: '反曲螺旋凸轮弩', en: 'HeliCoil Compound Crossbow' },
  tank_autoloader_cannon: { zh: '转盘自动装弹滑膛炮', en: 'Carousel Autoloader Cannon' },
  tank_bustle_cannon: { zh: '隔爆尾舱立楔炮闩', en: 'Bustle-Rack Vertical Wedge' },
  tank_ww2_cannon: { zh: '半自动立楔线膛主炮', en: 'Semi-Auto Rifled Tank Gun' },
  lever_action_rifle: { zh: '下垂楔块杠杆连珠', en: 'Falling-Block Lever Action' },
  pump_action_shotgun: { zh: '双连杆泵动上倾闭锁', en: 'Dual-Bar Pump Action' },
  browning_single_link: { zh: '勃朗宁单绞链短后坐', en: 'Browning Single-Link Recoil' },
  mauser_crf_bolt: { zh: '毛瑟 98 受控供弹大抓钩', en: 'Mauser 98 Controlled Feed' },
  mg42_roller_buzzsaw: { zh: 'MG 42 对称双滚柱短后坐', en: 'MG 42 Twin-Roller Recoil' },
  thompson_blish_drum: { zh: '青铜布利什延迟与发条圆鼓', en: 'Blish Lock & L-Drum SMG' },
  hk_roller_delayed: { zh: 'H&K 闭膛双滚柱延迟', en: 'H&K Roller-Delayed Blowback' },
  hydraulic_rotary_cannon: { zh: '双液压七管 30mm 转管炮', en: 'Dual-Hydraulic 7-Barrel Rotary' },
};

const ROOM_SHORT_TITLES: Readonly<
  Record<AcousticEnvironmentPreset, { zh: string; en: string }>
> = {
  bench_close: { zh: '近场军械台', en: 'Bench Close-Mic' },
  indoor_range: { zh: '25m 室内靶道', en: '25m Indoor Range' },
  tactical_hall: { zh: '深层穹顶大厅', en: 'Tactical Vault' },
};

export interface AcousticDeckPopoverProps {
  /** Optional override for SSR/unit verification */
  defaultOpen?: boolean;
  /** Optional exhibit override for SSR/unit verification */
  weaponIdOverride?: WeaponId;
  /** Optional language override for SSR/unit verification */
  langOverride?: LanguageCode;
  /** Invoked when popover opens so sibling header menus can dismiss cleanly */
  onOpenChange?: (open: boolean) => void;
  /** Incremented by parent header whenever another header popover opens */
  closeSignal?: number;
}

export const AcousticDeckPopover: React.FC<AcousticDeckPopoverProps> = ({
  defaultOpen = false,
  weaponIdOverride,
  langOverride,
  onOpenChange,
  closeSignal = 0,
}) => {
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const storeLang = useAppStore((s) => s.lang);
  const sfxMuted = useAppStore((s) => s.sfxMuted);
  const setSfxMuted = useAppStore((s) => s.setSfxMuted);
  const toggleSfxMuted = useAppStore((s) => s.toggleSfxMuted);
  const acousticEnvironment = useAppStore((s) => s.acousticEnvironment);
  const acousticEnvironmentManual = useAppStore(
    (s) => s.acousticEnvironmentManual
  );
  const setAcousticEnvironmentPreset = useAppStore(
    (s) => s.setAcousticEnvironmentPreset
  );
  const resetAcousticEnvironmentAuto = useAppStore(
    (s) => s.resetAcousticEnvironmentAuto
  );

  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const lang = langOverride ?? storeLang;
  const ui = UI_STRINGS[lang].workbench;

  const [rawOpen, setRawOpen] = useState(defaultOpen);
  const [openedAtCloseSignal, setOpenedAtCloseSignal] = useState(closeSignal);
  const [lastCueTag, setLastCueTag] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const isOpen = rawOpen && openedAtCloseSignal === closeSignal;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setRawOpen(false);
        onOpenChange?.(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setRawOpen(false);
        onOpenChange?.(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onOpenChange]);

  const manifest = getWeaponManifest(activeWeaponId);
  const bespokeSignature = getWeaponBespokeAcousticSignature(activeWeaponId);
  const caliberProfile = CALIBER_ACOUSTIC_PROFILES[manifest.caliberProfile];
  const mechanismStyle = resolveWeaponMechanismAcousticStyle(activeWeaponId);
  const activeRoomCfg = ACOUSTIC_ENVIRONMENT_CONFIGS[acousticEnvironment];
  const brassSupported = isBrassDropFoleySupported(activeWeaponId);
  const brassUnsupportedNote = getBrassDropUnsupportedReason(
    activeWeaponId,
    lang
  );

  const ensureAuditionReady = () => {
    unlockMechanicalAudio();
    if (sfxMuted) {
      setSfxMuted(false);
    }
  };

  const handleTogglePopover = () => {
    const next = !isOpen;
    setOpenedAtCloseSignal(closeSignal);
    setRawOpen(next);
    onOpenChange?.(next);
    if (!sfxMuted) {
      playWorkbenchFoley('toggle_switch');
    }
  };

  const handleSelectRoom = (preset: AcousticEnvironmentPreset) => {
    unlockMechanicalAudio();
    setAcousticEnvironmentPreset(preset);
    if (!sfxMuted) {
      playWorkbenchFoley('preset_detent');
    }
    setLastCueTag(ROOM_SHORT_TITLES[preset][lang]);
  };

  const handleAuditionAction = () => {
    ensureAuditionReady();
    playPressCheckSpringSound('pull');
    setLastCueTag(
      activeWeaponId === 'mp5'
        ? lang === 'en'
          ? 'HK Slap Cycle'
          : 'HK 拍柄循环'
        : lang === 'en'
          ? 'Action Cycle'
          : '机构拉栓音'
    );
  };

  const handleAuditionBrass = () => {
    if (!brassSupported) return;
    ensureAuditionReady();
    playBrassCasingBounceSound(manifest.caliberProfile, 160, 1);
    setLastCueTag(lang === 'en' ? 'Brass Floor Bounce' : '弹壳落地叮响');
  };

  const handleAuditionChamber = () => {
    ensureAuditionReady();
    playWeaponFiringEventSound('battery_lockup', activeWeaponId, 1.0);
    playWorkbenchFoley('preset_detent');
    setLastCueTag(lang === 'en' ? 'Chamber Lockup Cue' : '闭锁入膛冲击音');
  };

  const triggerLabel = ui.sfxChip;
  const actionBtnLabel =
    activeWeaponId === 'mp5'
      ? lang === 'en'
        ? 'HK Slap Cycle'
        : 'HK 拍柄试听'
      : lang === 'en'
        ? 'Action Cycle'
        : '拉栓机构音';

  return (
    <div
      ref={popoverRef}
      className="studio-popover-wrap acoustic-deck-wrap"
    >
      <button
        ref={triggerRef}
        type="button"
        className={`toggle-chip wb-ghost-chip acoustic-deck-trigger ${
          sfxMuted ? 'is-sfx-muted' : ''
        } ${isOpen ? 'active-cyan' : ''}`}
        data-testid="wb-acoustic-deck-trigger"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={handleTogglePopover}
        title={
          lang === 'en'
            ? 'Open Acoustic Studio & Foley Audition Deck (M to mute)'
            : '打开军械声学空间与机械音效试听台（快捷键 M 静音）'
        }
      >
        {sfxMuted ? (
          <VolumeX size={13} aria-hidden="true" />
        ) : (
          <Volume2 size={13} aria-hidden="true" />
        )}
        <span>{triggerLabel}</span>
        {bespokeSignature && !sfxMuted && !isOpen && (
          <span
            className="acoustic-bespoke-dot"
            aria-hidden="true"
          />
        )}
        <ChevronDown
          size={11}
          className={`popover-caret ${isOpen ? 'is-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="workbench-popover-menu acoustic-deck-popover"
          role="dialog"
          aria-label={
            lang === 'en'
              ? 'Acoustic Studio and Foley Audition Deck'
              : '军械声学空间与机械音效试听台'
          }
          data-testid="wb-acoustic-deck-panel"
        >
          {/* Header & Master Sound Switch */}
          <div className="acoustic-deck-head">
            <div className="acoustic-deck-title-group">
              <AudioLines size={13} aria-hidden="true" />
              <span className="acoustic-deck-title">
                {lang === 'en' ? 'Acoustic Studio & Foley' : '军械声学与音效台'}
              </span>
            </div>
            <button
              type="button"
              className={`acoustic-mute-pill ${sfxMuted ? 'is-muted' : 'is-live'}`}
              data-testid="acoustic-deck-mute-toggle"
              aria-pressed={!sfxMuted}
              onClick={() => {
                unlockMechanicalAudio();
                toggleSfxMuted();
              }}
              title={ui.sfxChipTitle(sfxMuted)}
            >
              {sfxMuted ? (
                <VolumeX size={12} aria-hidden="true" />
              ) : (
                <Volume2 size={12} aria-hidden="true" />
              )}
              <span>
                {sfxMuted
                  ? lang === 'en'
                    ? 'Muted'
                    : '已静音'
                  : lang === 'en'
                    ? 'Live'
                    : '开启中'}
              </span>
              <kbd className="popover-kbd">M</kbd>
            </button>
          </div>

          {sfxMuted && (
            <div className="acoustic-muted-banner" role="status">
              {lang === 'en'
                ? 'Audio is muted — clicking any audition cue automatically enables SFX.'
                : '当前处于静音状态，点击下方任意试听按钮将自动开启声效。'}
            </div>
          )}

          {/* Section 1: Stereo Convolution Reverb Room Selector */}
          <div className="popover-section">
            <div className="acoustic-section-row">
              <div className="popover-section-head">
                <Waves size={11} aria-hidden="true" />
                <span>
                  {lang === 'en'
                    ? 'Convolution Reverb Space'
                    : '立体声卷积混响空间'}
                </span>
              </div>
              {acousticEnvironmentManual && (
                <button
                  type="button"
                  className="acoustic-auto-reset-btn"
                  data-testid="acoustic-room-auto-btn"
                  onClick={() => {
                    resetAcousticEnvironmentAuto();
                    if (!sfxMuted) playWorkbenchFoley('toggle_switch');
                  }}
                  title={
                    lang === 'en'
                      ? 'Re-sync acoustic space automatically with Studio lighting & mode'
                      : '恢复随影棚环境与击发模式自动切换混响空间'
                  }
                >
                  <RotateCcw size={10} aria-hidden="true" />
                  <span>{lang === 'en' ? 'Auto Sync' : '自动同步'}</span>
                </button>
              )}
            </div>

            <div
              className="acoustic-room-grid"
              role="group"
              aria-label={
                lang === 'en'
                  ? 'Select acoustic reverb room'
                  : '选择卷积混响声场空间'
              }
            >
              {ACOUSTIC_ENVIRONMENT_PRESETS.map((preset) => {
                const cfg = ACOUSTIC_ENVIRONMENT_CONFIGS[preset];
                const isSelected = acousticEnvironment === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={`acoustic-room-btn ${isSelected ? 'is-active' : ''}`}
                    data-testid={`acoustic-room-${preset}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectRoom(preset)}
                    title={lang === 'en' ? cfg.labelEn : cfg.labelZh}
                  >
                    <span className="acoustic-room-name">
                      {ROOM_SHORT_TITLES[preset][lang]}
                    </span>
                    <span className="acoustic-room-rt60">
                      RT60 {cfg.rt60LowSec.toFixed(2)}s
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="acoustic-room-desc">
              {lang === 'en'
                ? activeRoomCfg.descriptionEn
                : activeRoomCfg.descriptionZh}
            </p>
          </div>

          {/* Section 2: Active Weapon Acoustic Signature Card */}
          <div className="popover-section">
            <div
              className={`acoustic-signature-card ${
                bespokeSignature ? 'is-bespoke' : ''
              }`}
              data-testid="acoustic-signature-card"
              data-mechanism-style={mechanismStyle}
            >
              <div className="acoustic-sig-top">
                <span className="acoustic-sig-weapon">
                  {manifest.shortLabel}
                </span>
                {bespokeSignature ? (
                  <span
                    className="acoustic-bespoke-badge"
                    data-testid="acoustic-bespoke-badge"
                  >
                    <Sparkles size={10} aria-hidden="true" />
                    <span>
                      {lang === 'en' ? 'Bespoke Acoustics' : '专属机械声学'}
                    </span>
                  </span>
                ) : (
                  <span className="acoustic-style-pill">
                    {MECHANISM_STYLE_LABELS[mechanismStyle][lang]}
                  </span>
                )}
              </div>

              <div className="acoustic-sig-caliber">
                {lang === 'en'
                  ? caliberProfile.labelEn
                  : caliberProfile.labelZh}
              </div>

              {bespokeSignature && (
                <>
                  <p className="acoustic-sig-desc">
                    {lang === 'en'
                      ? bespokeSignature.labelEn
                      : bespokeSignature.labelZh}
                  </p>
                  <div className="acoustic-partials-row">
                    {bespokeSignature.modalPartialsHz.map((hz) => (
                      <span key={hz} className="acoustic-partial-chip">
                        {formatAcousticPartialHz(hz)}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <div className="acoustic-metrics-strip">
                <span>
                  {lang === 'en' ? 'Sub' : '低频'}{' '}
                  <strong>{caliberProfile.subFreqHz} Hz</strong>
                </span>
                <span>
                  {lang === 'en' ? 'Crack' : '裂空'}{' '}
                  <strong>
                    {formatAcousticPartialHz(caliberProfile.crackCutoffHz)}
                  </strong>
                </span>
                <span>
                  {lang === 'en' ? 'Brass' : '弹壳'}{' '}
                  <strong>
                    {caliberProfile.casingRingHz > 0 && brassSupported
                      ? formatAcousticPartialHz(caliberProfile.casingRingHz)
                      : lang === 'en'
                        ? 'N/A'
                        : '无'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: 3 Live 1-Click Foley Audition Buttons */}
          <div className="popover-section">
            <div className="acoustic-section-row">
              <div className="popover-section-head">
                <Volume2 size={11} aria-hidden="true" />
                <span>
                  {lang === 'en' ? 'Live Foley Audition' : '实时机械声效试听'}
                </span>
              </div>
              {lastCueTag && (
                <span className="acoustic-last-cue" aria-live="polite">
                  {lastCueTag}
                </span>
              )}
            </div>

            <div
              className="acoustic-foley-grid"
              data-testid="acoustic-foley-auditions"
            >
              <button
                type="button"
                className="acoustic-foley-btn"
                data-testid="acoustic-audition-action"
                onClick={handleAuditionAction}
                title={
                  lang === 'en'
                    ? 'Audition mechanical charging / press-check spring action'
                    : '试听当前兵器拉栓与复进簧机械动作声'
                }
              >
                <Wrench size={12} aria-hidden="true" />
                <span className="acoustic-foley-label">{actionBtnLabel}</span>
              </button>

              <button
                type="button"
                className={`acoustic-foley-btn ${!brassSupported ? 'is-disabled' : ''}`}
                data-testid="acoustic-audition-brass"
                disabled={!brassSupported}
                onClick={handleAuditionBrass}
                title={
                  brassSupported
                    ? lang === 'en'
                      ? 'Audition spent brass casing floor-bounce harmonics'
                      : '试听当前口径黄铜弹壳落地弹跳谐振音'
                    : brassUnsupportedNote
                }
              >
                <Disc3 size={12} aria-hidden="true" />
                <span className="acoustic-foley-label">
                  {brassSupported
                    ? lang === 'en'
                      ? 'Brass Drop'
                      : '弹壳落地音'
                    : brassUnsupportedNote}
                </span>
              </button>

              <button
                type="button"
                className="acoustic-foley-btn"
                data-testid="acoustic-audition-chamber"
                onClick={handleAuditionChamber}
                title={
                  lang === 'en'
                    ? 'Audition breech battery lockup & steel waveguide cue'
                    : '试听枪机闭锁入膛钢材频散波导脉冲音'
                }
              >
                <AudioLines size={12} aria-hidden="true" />
                <span className="acoustic-foley-label">
                  {lang === 'en' ? 'Lockup Cue' : '闭锁入膛音'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
