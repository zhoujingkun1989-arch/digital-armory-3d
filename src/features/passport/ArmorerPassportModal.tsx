import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Download,
  Filter,
  RotateCcw,
  ShieldCheck,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  buildSummaryFromRecord,
  formatExamDuration,
  useArmorerExamStore,
  type WeaponExamRecord,
  type WeaponExamSummary,
} from '../../engine/exam/armorerExamStore';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import {
  matchesArmoryCategory,
  WEAPON_MANIFESTS,
} from '../../weapons/manifests';
import type {
  ArmoryCategory,
  WeaponId,
  WeaponManifest,
} from '../../weapons/types';
import { PASSPORT_STRINGS } from './passportStrings';
import '../../styles/passport.css';

export type PassportStatusFilter = 'all' | 'certified' | 'pending';

export const PASSPORT_SPECIALIZED_HALLS: readonly Exclude<
  ArmoryCategory,
  'all'
>[] = [
  'assault',
  'lmg',
  'smg',
  'sniper',
  'shotgun',
  'pistol',
  'archery',
  'armor',
  'ordnance',
];

export interface PassportHallMasteryItem {
  hallId: Exclude<ArmoryCategory, 'all'>;
  total: number;
  certified: number;
  pct: number;
}

export interface PassportRowItem {
  manifest: WeaponManifest;
  shortName: string;
  summary: WeaponExamSummary;
}

/**
 * Pure 10-Hall mastery aggregation computing certified/total counts across all
 * 9 specialized museum halls (exact partition summing to `WEAPON_MANIFESTS.length`).
 */
export function computePassportHallMastery(
  ledger: Readonly<Record<string, WeaponExamRecord>>
): PassportHallMasteryItem[] {
  return PASSPORT_SPECIALIZED_HALLS.map((hallId) => {
    const members = WEAPON_MANIFESTS.filter((m) =>
      matchesArmoryCategory(m.catalog, hallId)
    );
    const total = members.length;
    const certified = members.filter(
      (m) => buildSummaryFromRecord(m.id, ledger[m.id]).isCertified
    ).length;
    const pct = total > 0 ? Math.round((certified / total) * 100) : 0;
    return { hallId, total, certified, pct };
  });
}

/**
 * Pure Passport exhibit filter combining Hall selection (`all` or specialized hall)
 * and Certification Status (`all` | `certified` | `pending`).
 */
export function filterPassportRows<
  T extends Pick<PassportRowItem, 'manifest' | 'summary'>,
>(
  rows: readonly T[],
  statusFilter: PassportStatusFilter,
  hallFilter: ArmoryCategory = 'all'
): T[] {
  return rows.filter((row) => {
    if (
      hallFilter !== 'all' &&
      !matchesArmoryCategory(row.manifest.catalog, hallFilter)
    ) {
      return false;
    }
    if (statusFilter === 'certified') return row.summary.isCertified;
    if (statusFilter === 'pending') return !row.summary.isCertified;
    return true;
  });
}

export interface ArmorerPassportModalProps {
  onClose: () => void;
}

export const ArmorerPassportModal: React.FC<ArmorerPassportModalProps> = ({
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lang = useAppStore((s) => s.lang);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const setFieldStripActive = useAppStore((s) => s.setFieldStripActive);

  const ledger = useArmorerExamStore((s) => s.ledger);
  const exportPassportJson = useArmorerExamStore((s) => s.exportPassportJson);
  const importPassportJson = useArmorerExamStore((s) => s.importPassportJson);
  const clearExamLedger = useArmorerExamStore((s) => s.clearExamLedger);

  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PassportStatusFilter>('all');
  const [hallFilter, setHallFilter] = useState<ArmoryCategory>('all');
  const ui = PASSPORT_STRINGS[lang];

  useDialogAccessibility({
    isOpen: true,
    containerRef: dialogRef,
    onClose,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  const rows = useMemo<PassportRowItem[]>(() => {
    return WEAPON_MANIFESTS.map((m) => ({
      manifest: m,
      shortName: getLocalizedShortWeaponLabel(m.id, lang),
      summary: buildSummaryFromRecord(m.id, ledger[m.id]),
    }));
  }, [ledger, lang]);

  const hallMastery = useMemo(
    () => computePassportHallMastery(ledger),
    [ledger]
  );

  const certifiedCount = rows.filter((r) => r.summary.isCertified).length;
  const dualCertifiedCount = rows.filter(
    (r) => r.summary.isDualCertified
  ).length;
  const detailCertifiedCount = rows.filter(
    (r) => !!r.summary.detailStripRank
  ).length;
  const pct = Math.round((certifiedCount / Math.max(1, rows.length)) * 100);

  const hallScopedRows = useMemo(
    () => filterPassportRows(rows, 'all', hallFilter),
    [rows, hallFilter]
  );
  const hallScopedCertified = useMemo(
    () => hallScopedRows.filter((r) => r.summary.isCertified).length,
    [hallScopedRows]
  );
  const hallScopedPending = hallScopedRows.length - hallScopedCertified;

  const visibleRows = useMemo(
    () => filterPassportRows(rows, statusFilter, hallFilter),
    [rows, statusFilter, hallFilter]
  );

  const handleExport = () => {
    const json = exportPassportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-armory-passport-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    playWorkbenchFoley('preset_detent');
    setNotice(ui.exportedNotice);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const res = importPassportJson(text);
    if (res.ok) {
      playWorkbenchFoley('director_cue');
      setNotice(ui.importSuccess(res.importedCount));
    } else {
      setNotice(ui.importError);
    }
  };

  const launchExamFor = (weaponId: WeaponId) => {
    playWorkbenchFoley('preset_detent');
    onClose();
    enterWorkbench(weaponId, 'explode');
    setFieldStripActive(true);
  };

  return (
    <dialog
      ref={dialogRef}
      className="passport-dialog"
      data-testid="armorer-passport-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="passport-shell">
        <header className="passport-header">
          <div>
            <span className="passport-badge">
              <Award size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <h2 id={titleId} className="passport-title">
              {ui.title}
            </h2>
            <p className="passport-sub">{ui.subtitle}</p>
          </div>

          <div className="passport-header-actions">
            <button
              type="button"
              className="passport-action-btn"
              onClick={handleExport}
            >
              <Download size={13} aria-hidden="true" />
              <span>{ui.exportBtn}</span>
            </button>
            <button
              type="button"
              className="passport-action-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} aria-hidden="true" />
              <span>{ui.importBtn}</span>
            </button>
            <button
              type="button"
              className="passport-action-btn is-danger"
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                clearExamLedger();
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>{ui.clearBtn}</span>
            </button>
            <button
              type="button"
              className="passport-close-btn"
              aria-label={ui.close}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => void handleImportFile(e)}
            />
          </div>
        </header>

        <div className="passport-body">
          <div className="passport-summary-strip">
            <div className="passport-kpi">
              <span>{ui.overallProgress}</span>
              <strong className="tabular">{pct}%</strong>
            </div>
            <div className="passport-kpi">
              <span>{ui.certifiedCount}</span>
              <strong className="tabular">
                {certifiedCount} / {rows.length}
              </strong>
            </div>
            <div className="passport-kpi">
              <span>{ui.dualCertifiedCount}</span>
              <strong className="tabular">{dualCertifiedCount}</strong>
            </div>
            <div className="passport-kpi">
              <span>{ui.detailCertifiedCount}</span>
              <strong className="tabular">{detailCertifiedCount}</strong>
            </div>
          </div>

          {/* 10-Hall Mastery Breakdown Strip */}
          <section
            className="passport-halls-section"
            aria-label={ui.hallBreakdownAria}
          >
            <div className="passport-section-head">
              <span className="passport-section-label">
                {ui.hallBreakdownTitle}
              </span>
              <div
                className="passport-filter-bar"
                role="group"
                aria-label={ui.filterGroupAria}
              >
                <Filter size={12} className="passport-filter-icon" aria-hidden="true" />
                <button
                  type="button"
                  className={`passport-filter-pill ${
                    statusFilter === 'all' ? 'is-active' : ''
                  }`}
                  aria-pressed={statusFilter === 'all'}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setStatusFilter('all');
                  }}
                >
                  {ui.filterAll(hallScopedRows.length)}
                </button>
                <button
                  type="button"
                  className={`passport-filter-pill ${
                    statusFilter === 'certified' ? 'is-active' : ''
                  }`}
                  aria-pressed={statusFilter === 'certified'}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setStatusFilter('certified');
                  }}
                >
                  {ui.filterCertified(hallScopedCertified)}
                </button>
                <button
                  type="button"
                  className={`passport-filter-pill ${
                    statusFilter === 'pending' ? 'is-active' : ''
                  }`}
                  aria-pressed={statusFilter === 'pending'}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setStatusFilter('pending');
                  }}
                >
                  {ui.filterPending(hallScopedPending)}
                </button>
              </div>
            </div>

            <div className="passport-halls-strip" role="list">
              <button
                type="button"
                role="listitem"
                className={`passport-hall-card ${
                  hallFilter === 'all' ? 'is-active' : ''
                }`}
                aria-pressed={hallFilter === 'all'}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setHallFilter('all');
                }}
              >
                <span className="passport-hall-top">
                  <span className="passport-hall-name">{ui.halls.all}</span>
                  <span className="passport-hall-ratio tabular">
                    {certifiedCount}/{rows.length}
                  </span>
                </span>
                <span className="passport-hall-bar" aria-hidden="true">
                  <span
                    className="passport-hall-fill"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </button>

              {hallMastery.map((item) => (
                <button
                  key={item.hallId}
                  type="button"
                  role="listitem"
                  className={`passport-hall-card ${
                    hallFilter === item.hallId ? 'is-active' : ''
                  } ${item.certified === item.total && item.total > 0 ? 'is-mastered' : ''}`}
                  aria-pressed={hallFilter === item.hallId}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setHallFilter(
                      hallFilter === item.hallId ? 'all' : item.hallId
                    );
                  }}
                >
                  <span className="passport-hall-top">
                    <span className="passport-hall-name">
                      {ui.halls[item.hallId]}
                    </span>
                    <span className="passport-hall-ratio tabular">
                      {item.certified}/{item.total}
                    </span>
                  </span>
                  <span className="passport-hall-bar" aria-hidden="true">
                    <span
                      className="passport-hall-fill"
                      style={{ width: `${item.pct}%` }}
                    />
                  </span>
                </button>
              ))}
            </div>
          </section>

          {notice && <div className="passport-notice">{notice}</div>}

          {visibleRows.length === 0 ? (
            <div className="passport-empty-state" role="status">
              <span>{ui.emptyFilterTitle}</span>
              <button
                type="button"
                className="passport-action-btn"
                onClick={() => {
                  setStatusFilter('all');
                  setHallFilter('all');
                }}
              >
                {ui.resetFilterBtn}
              </button>
            </div>
          ) : (
            <div className="passport-table-wrap">
              <table className="passport-table">
                <thead>
                  <tr>
                    <th>{ui.tableCols.exhibit}</th>
                    <th>{ui.tableCols.fieldStrip}</th>
                    <th>{ui.tableCols.detailStrip}</th>
                    <th>{ui.tableCols.triage}</th>
                    <th>{ui.tableCols.bestTime}</th>
                    <th>{ui.tableCols.overall}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ manifest, shortName, summary }) => (
                    <tr key={manifest.id}>
                      <td>
                        <div className="passport-exhibit-cell">
                          <span className="passport-bay">
                            {manifest.catalog.bayCode}
                          </span>
                          <strong>{shortName}</strong>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`passport-rank-pill ${
                            summary.fieldStripRank
                              ? `rank-${summary.fieldStripRank}`
                              : 'is-empty'
                          }`}
                        >
                          {summary.fieldStripRank ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`passport-rank-pill ${
                            summary.detailStripRank
                              ? `rank-${summary.detailStripRank}`
                              : 'is-empty'
                          }`}
                        >
                          {summary.detailStripRank ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`passport-rank-pill ${
                            summary.triageRank
                              ? `rank-${summary.triageRank}`
                              : 'is-empty'
                          }`}
                        >
                          {summary.triageRank ?? '—'}
                        </span>
                      </td>
                      <td className="tabular">
                        {summary.bestFieldStripMs !== null
                          ? formatExamDuration(summary.bestFieldStripMs)
                          : '—'}
                      </td>
                      <td>
                        {summary.overallRank ? (
                          <span
                            className={`passport-overall-chip rank-${summary.overallRank}`}
                          >
                            <ShieldCheck size={12} aria-hidden="true" />
                            <span>{summary.overallRank}</span>
                          </span>
                        ) : (
                          <span className="passport-pending">
                            {ui.uncertified}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="passport-train-btn"
                          onClick={() => launchExamFor(manifest.id)}
                        >
                          <Wrench size={11} aria-hidden="true" />
                          <span>{ui.launchDrillBtn}</span>
                          <ArrowUpRight size={12} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};

export default ArmorerPassportModal;
