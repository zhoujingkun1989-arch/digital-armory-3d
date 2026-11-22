import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Download,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  buildSummaryFromRecord,
  formatExamDuration,
  useArmorerExamStore,
} from '../../engine/exam/armorerExamStore';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import { PASSPORT_STRINGS } from './passportStrings';
import '../../styles/passport.css';

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
  const ui = PASSPORT_STRINGS[lang];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, [onClose]);

  const rows = useMemo(() => {
    return WEAPON_MANIFESTS.map((m) => ({
      manifest: m,
      shortName: getLocalizedShortWeaponLabel(m.id, lang),
      summary: buildSummaryFromRecord(m.id, ledger[m.id]),
    }));
  }, [ledger, lang]);

  const certifiedCount = rows.filter((r) => r.summary.isCertified).length;
  const dualCertifiedCount = rows.filter(
    (r) => r.summary.isDualCertified
  ).length;
  const detailCertifiedCount = rows.filter(
    (r) => !!r.summary.detailStripRank
  ).length;
  const pct = Math.round((certifiedCount / Math.max(1, rows.length)) * 100);

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

          {notice && <div className="passport-notice">{notice}</div>}

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
                {rows.map(({ manifest, shortName, summary }) => (
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
                        <span>{ui.inspectBtn}</span>
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default ArmorerPassportModal;
