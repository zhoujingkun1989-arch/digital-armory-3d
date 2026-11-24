import React from 'react';
import {
  Crosshair,
  Flame,
  Info,
  RotateCcw,
  Scissors,
  Shield,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ATTACHMENT_PRESET_ORDER,
  ATTACHMENT_PRESET_SPECS,
  DEFAULT_ATTACHMENT_LOADOUT,
  MUZZLE_ATTACHMENT_ORDER,
  MUZZLE_ATTACHMENT_SPECS,
  OPTIC_ATTACHMENT_ORDER,
  OPTIC_ATTACHMENT_SPECS,
  getWeaponAttachmentMountProfile,
  isMuzzleCompatible,
  isOpticCompatible,
  isWeaponAttachmentBenchSupported,
  resolvePresetForWeapon,
} from '../../engine/attachments/attachmentSpecs';
import {
  getCachedCombinedAttachmentPhysics,
  useAttachmentStore,
} from '../../engine/attachments/attachmentStore';
import { useTankCrewStore } from '../../engine/tank/tankCrewStore';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import '../../styles/attachment-bench.css';

const AttachmentBenchPanel: React.FC = () => {
  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const setMode = useAppStore((s) => s.setMode);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const toggleFiringPlay = useAppStore((s) => s.toggleFiringPlay);
  const isFiringPlaying = useAppStore((s) => s.isFiringPlaying);
  const toggleTankCrew = useTankCrewStore((s) => s.toggleActive);
  const tankCrewActive = useTankCrewStore((s) => s.active);

  const loadout = useAttachmentStore(
    (s) => s.loadouts[activeWeaponId] ?? DEFAULT_ATTACHMENT_LOADOUT
  );
  const setMuzzle = useAttachmentStore((s) => s.setMuzzle);
  const setOptic = useAttachmentStore((s) => s.setOptic);
  const applyPreset = useAttachmentStore((s) => s.applyPreset);
  const resetWeapon = useAttachmentStore((s) => s.resetWeapon);
  const setBenchOpen = useAttachmentStore((s) => s.setBenchOpen);

  const ui = UI_STRINGS[lang].attachmentBench;
  const manifest = getWeaponManifest(activeWeaponId);
  const profile = getWeaponAttachmentMountProfile(activeWeaponId);
  const supported = isWeaponAttachmentBenchSupported(activeWeaponId);
  const physics = getCachedCombinedAttachmentPhysics(
    loadout.muzzle,
    loadout.optic
  );

  const recoilDeltaPct = Math.round((physics.recoilRiseMultiplier - 1) * 100);
  const velDeltaPct = (physics.muzzleVelocityMultiplier - 1) * 100;
  const isModified = loadout.muzzle !== 'none' || loadout.optic !== 'none';

  const activeMuzzleSpec = MUZZLE_ATTACHMENT_SPECS[loadout.muzzle];
  const activeOpticSpec = OPTIC_ATTACHMENT_SPECS[loadout.optic];

  return (
    <section
      className="attachment-bench-card"
      data-testid="attachment-bench-panel"
      aria-label={ui.title}
    >
      <div className="att-head">
        <div className="att-title-block">
          <div className="att-kicker-row">
            <Wrench size={12} aria-hidden="true" />
            <span>{ui.badge}</span>
          </div>
          <h3 className="att-title">
            {ui.title} · {manifest.shortLabel}
          </h3>
        </div>

        <div className="att-head-actions">
          {supported && (
            <>
              <button
                type="button"
                className={`att-action-pill ${sectionCut ? 'is-active' : ''}`}
                aria-pressed={sectionCut}
                title={ui.ctCutawayTitle}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  toggleSectionCut();
                }}
              >
                <Scissors size={11} aria-hidden="true" />
                <span>{ui.ctCutawayBtn}</span>
              </button>

              <button
                type="button"
                className={`att-action-pill ${
                  mode === 'firing' && isFiringPlaying ? 'is-firing' : ''
                }`}
                title={ui.testFireTitle}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  if (mode !== 'firing') {
                    setMode('firing');
                  } else {
                    toggleFiringPlay();
                  }
                }}
              >
                <Flame size={11} aria-hidden="true" />
                <span>{ui.testFireBtn}</span>
              </button>

              <button
                type="button"
                className="att-icon-btn"
                title={ui.resetTitle}
                aria-label={ui.resetBtn}
                onClick={() => {
                  playWorkbenchFoley('preset_detent');
                  resetWeapon(activeWeaponId);
                }}
              >
                <RotateCcw size={12} aria-hidden="true" />
              </button>
            </>
          )}

          <button
            type="button"
            className="att-icon-btn"
            aria-label={ui.closeTitle}
            title={ui.closeTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setBenchOpen(false);
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="att-sub">{ui.subtitle}</p>

      {!supported ? (
        <div className="att-notice-box" role="status">
          <div className="att-notice-title">
            {profile.platformClass === 'armor' ? (
              <Shield size={14} aria-hidden="true" />
            ) : (
              <Info size={14} aria-hidden="true" />
            )}
            <span>
              {profile.platformClass === 'armor'
                ? ui.tankNoticeTitle
                : ui.archeryNoticeTitle}
            </span>
          </div>
          {profile.muzzleCompatibilityNoteZh && (
            <p>
              {lang === 'zh'
                ? profile.muzzleCompatibilityNoteZh
                : profile.muzzleCompatibilityNoteEn}
            </p>
          )}
          {profile.opticCompatibilityNoteZh && (
            <p>
              {lang === 'zh'
                ? profile.opticCompatibilityNoteZh
                : profile.opticCompatibilityNoteEn}
            </p>
          )}
          {profile.platformClass === 'armor' && (
            <button
              type="button"
              className="att-notice-cta"
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                if (!tankCrewActive) {
                  toggleTankCrew();
                }
                setBenchOpen(false);
              }}
            >
              <Crosshair size={13} aria-hidden="true" />
              <span>{ui.tankNoticeBtn}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* One-Click Tactical Presets */}
          <div className="att-slot-block">
            <div className="att-section-label">
              <span>{ui.presetsHeading}</span>
            </div>
            <div
              className="att-presets-row"
              role="group"
              aria-label={ui.presetsHeading}
            >
              {ATTACHMENT_PRESET_ORDER.map((presetId) => {
                const pSpec = ATTACHMENT_PRESET_SPECS[presetId];
                const resolved = resolvePresetForWeapon(
                  activeWeaponId,
                  presetId
                );
                const isActivePreset =
                  loadout.muzzle === resolved.muzzle &&
                  loadout.optic === resolved.optic;
                return (
                  <button
                    key={presetId}
                    type="button"
                    className={`att-preset-btn ${
                      isActivePreset ? 'is-active' : ''
                    }`}
                    title={lang === 'zh' ? pSpec.descZh : pSpec.descEn}
                    onClick={() => {
                      playWorkbenchFoley('preset_detent');
                      applyPreset(activeWeaponId, presetId);
                    }}
                  >
                    {lang === 'zh' ? pSpec.nameZh : pSpec.nameEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Muzzle Attachment Selector */}
          <div className="att-slot-block">
            <div className="att-section-label">
              <span>{ui.muzzleHeading}</span>
            </div>
            <div className="att-option-grid" role="group" aria-label={ui.muzzleHeading}>
              {MUZZLE_ATTACHMENT_ORDER.map((mId) => {
                const spec = MUZZLE_ATTACHMENT_SPECS[mId];
                const compatible = isMuzzleCompatible(activeWeaponId, mId);
                const selected = loadout.muzzle === mId;
                const dDb = spec.physics.soundDbDelta;
                const rPct = Math.round(
                  (spec.physics.recoilRiseMultiplier - 1) * 100
                );
                const statStr =
                  mId === 'none'
                    ? ui.stockBadge
                    : `${dDb >= 0 ? `+${dDb}` : dDb} dB · ${rPct}%`;
                return (
                  <button
                    key={mId}
                    type="button"
                    disabled={!compatible}
                    aria-pressed={selected}
                    className={`att-option-btn ${
                      selected ? 'is-selected' : ''
                    }`}
                    title={lang === 'zh' ? spec.detailZh : spec.detailEn}
                    onClick={() => {
                      if (!compatible) return;
                      playWorkbenchFoley('preset_detent');
                      setMuzzle(activeWeaponId, mId);
                    }}
                  >
                    <div className="att-option-top">
                      <span className="att-option-name">
                        {lang === 'zh' ? spec.shortZh : spec.shortEn}
                      </span>
                      <span className="att-option-tag">
                        {!compatible
                          ? ui.incompatibleBadge
                          : selected
                            ? ui.mountedBadge
                            : statStr}
                      </span>
                    </div>
                    <span className="att-option-meta">
                      {mId === 'none'
                        ? lang === 'zh'
                          ? spec.materialZh
                          : spec.materialEn
                        : `+${spec.physics.addedMassGrams} g · ${statStr}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {profile.muzzleCompatibilityNoteZh && (
              <p className="att-compat-note">
                {lang === 'zh'
                  ? profile.muzzleCompatibilityNoteZh
                  : profile.muzzleCompatibilityNoteEn}
              </p>
            )}
          </div>

          {/* Optic Rail Selector */}
          <div className="att-slot-block">
            <div className="att-section-label">
              <span>{ui.opticHeading}</span>
            </div>
            <div className="att-option-grid" role="group" aria-label={ui.opticHeading}>
              {OPTIC_ATTACHMENT_ORDER.map((oId) => {
                const spec = OPTIC_ATTACHMENT_SPECS[oId];
                const compatible = isOpticCompatible(activeWeaponId, oId);
                const selected = loadout.optic === oId;
                return (
                  <button
                    key={oId}
                    type="button"
                    disabled={!compatible}
                    aria-pressed={selected}
                    className={`att-option-btn ${
                      selected ? 'is-selected' : ''
                    }`}
                    title={lang === 'zh' ? spec.detailZh : spec.detailEn}
                    onClick={() => {
                      if (!compatible) return;
                      playWorkbenchFoley('preset_detent');
                      setOptic(activeWeaponId, oId);
                    }}
                  >
                    <div className="att-option-top">
                      <span className="att-option-name">
                        {lang === 'zh' ? spec.shortZh : spec.shortEn}
                      </span>
                      <span className="att-option-tag">
                        {!compatible
                          ? ui.incompatibleBadge
                          : selected
                            ? ui.mountedBadge
                            : oId === 'none'
                              ? ui.stockBadge
                              : `+${spec.physics.addedMassGrams}g`}
                      </span>
                    </div>
                    <span className="att-option-meta">
                      {lang === 'zh' ? spec.materialZh : spec.materialEn}
                    </span>
                  </button>
                );
              })}
            </div>
            {profile.opticCompatibilityNoteZh && (
              <p className="att-compat-note">
                {lang === 'zh'
                  ? profile.opticCompatibilityNoteZh
                  : profile.opticCompatibilityNoteEn}
              </p>
            )}
          </div>

          {/* Live Quantitative Physics Readouts */}
          <div className="att-metrics-grid" aria-label={ui.metricsHeading}>
            <div className="att-metric-cell">
              <span>{ui.metricMass}</span>
              <strong className={physics.addedMassGrams > 0 ? 'is-info' : ''}>
                +{physics.addedMassGrams} g
              </strong>
            </div>
            <div className="att-metric-cell">
              <span>{ui.metricSound}</span>
              <strong
                className={
                  physics.soundDbDelta < 0
                    ? 'is-good'
                    : physics.soundDbDelta > 0
                      ? 'is-warn'
                      : ''
                }
              >
                {physics.soundDbDelta > 0
                  ? `+${physics.soundDbDelta}`
                  : physics.soundDbDelta}{' '}
                dB
              </strong>
            </div>
            <div className="att-metric-cell">
              <span>{ui.metricRecoil}</span>
              <strong className={recoilDeltaPct < 0 ? 'is-good' : ''}>
                {recoilDeltaPct > 0
                  ? `+${recoilDeltaPct}`
                  : recoilDeltaPct}
                %
              </strong>
            </div>
            <div className="att-metric-cell">
              <span>{ui.metricVelocity}</span>
              <strong
                className={
                  velDeltaPct > 0.05
                    ? 'is-good'
                    : velDeltaPct < -0.05
                      ? 'is-warn'
                      : ''
                }
              >
                {velDeltaPct > 0 ? '+' : ''}
                {velDeltaPct.toFixed(1)}%
              </strong>
            </div>
          </div>

          {/* Live Gas-Flow, Cutaway & Acoustic Coupling Banner */}
          <div className="att-coupling-banner">
            <div className="att-coupling-pills">
              <span className="att-coupling-chip">
                <Volume2
                  size={10}
                  style={{ display: 'inline', marginRight: 3 }}
                  aria-hidden="true"
                />
                {ui.lowPassLabel}:{' '}
                {physics.lowPassHz !== null
                  ? `${physics.lowPassHz} Hz`
                  : lang === 'zh'
                    ? '全频宽'
                    : 'Full Band'}
              </span>
              <span className="att-coupling-chip">
                {ui.gasRetentionLabel}:{' '}
                {Math.round(physics.gasBaffleRetention * 100)}%
              </span>
              <span className="att-coupling-chip">
                {ui.sideBlastLabel}: {Math.round(physics.sideBlastRatio * 100)}%
              </span>
            </div>
            <div>
              <strong>{ui.couplingSummaryPrefix}: </strong>
              {!isModified
                ? ui.couplingStockNote
                : [
                    loadout.muzzle !== 'none'
                      ? lang === 'zh'
                        ? activeMuzzleSpec.cutawayNoteZh
                        : activeMuzzleSpec.cutawayNoteEn
                      : null,
                    loadout.optic !== 'none'
                      ? lang === 'zh'
                        ? activeOpticSpec.cutawayNoteZh
                        : activeOpticSpec.cutawayNoteEn
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default AttachmentBenchPanel;
