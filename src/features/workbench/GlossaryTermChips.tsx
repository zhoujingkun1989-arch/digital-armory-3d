import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowUpRight, BookMarked, ChevronDown, X } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  getGlossaryTermsForWeapon,
  type EngineeringGlossaryTerm,
} from '../../engine/encyclopedia/engineeringGlossary';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';

const MAX_RELATED_EXHIBIT_PILLS = 5;

export interface GlossaryTermChipsProps {
  weaponId: WeaponId;
  lang: LanguageCode;
  /** Optional initial expanded term ID for deterministic SSR / unit verification */
  defaultOpenTermId?: string | null;
}

export const GlossaryTermChips: React.FC<GlossaryTermChipsProps> = ({
  weaponId,
  lang,
  defaultOpenTermId = null,
}) => {
  const disclosureId = useId();
  const terms = useMemo(
    () => getGlossaryTermsForWeapon(weaponId),
    [weaponId]
  );

  // Pair selection with weaponId so switching exhibits automatically clears any stale open term without setState-in-effect
  const [selection, setSelection] = useState<{
    weaponId: WeaponId;
    termId: string | null;
  }>(() => ({
    weaponId,
    termId: defaultOpenTermId,
  }));

  const activeTermId =
    selection.weaponId === weaponId ? selection.termId : defaultOpenTermId;

  const activeTerm: EngineeringGlossaryTerm | null = useMemo(
    () => terms.find((t) => t.id === activeTermId) ?? null,
    [terms, activeTermId]
  );

  useEffect(() => {
    if (!activeTerm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSelection({ weaponId, termId: null });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeTerm, weaponId]);

  if (terms.length === 0) return null;

  const relatedExhibits = activeTerm
    ? activeTerm.relatedWeaponIds
        .filter((id) => id !== weaponId)
        .slice(0, MAX_RELATED_EXHIBIT_PILLS)
    : [];

  const handleToggleTerm = (termId: string) => {
    playWorkbenchFoley('toggle_switch');
    setSelection((prev) => {
      const current = prev.weaponId === weaponId ? prev.termId : null;
      return {
        weaponId,
        termId: current === termId ? null : termId,
      };
    });
  };

  const handleJumpExhibit = (targetId: WeaponId) => {
    playWorkbenchFoley('preset_detent');
    setSelection({ weaponId: targetId, termId: null });
    useAppStore.getState().enterWorkbench(targetId, 'explode');
  };

  return (
    <div
      className="inspector-glossary-block"
      data-testid="inspector-glossary-block"
    >
      <div className="inspector-glossary-head">
        <BookMarked size={11} aria-hidden="true" />
        <span>
          {lang === 'en' ? 'Engineering Principles' : '机械原理词条'}
        </span>
      </div>

      <div
        className="inspector-glossary-chips"
        role="group"
        aria-label={
          lang === 'en' ? 'Engineering Principles' : '机械原理词条'
        }
      >
        {terms.map((term) => {
          const isOpen = activeTerm?.id === term.id;
          const label = lang === 'en' ? term.termEn : term.termZh;
          return (
            <button
              key={term.id}
              type="button"
              className={`glossary-term-chip ${isOpen ? 'is-open' : ''}`}
              data-testid={`glossary-chip-${term.id}`}
              aria-expanded={isOpen}
              aria-controls={isOpen ? disclosureId : undefined}
              onClick={() => handleToggleTerm(term.id)}
            >
              <span>{label}</span>
              <ChevronDown
                size={11}
                className={`glossary-chip-caret ${isOpen ? 'is-open' : ''}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {activeTerm && (
        <div
          id={disclosureId}
          className="glossary-disclosure-card"
          data-testid="glossary-disclosure-card"
          role="region"
          aria-label={lang === 'en' ? activeTerm.termEn : activeTerm.termZh}
        >
          <div className="glossary-disclosure-head">
            <strong className="glossary-disclosure-title">
              {lang === 'en' ? activeTerm.termEn : activeTerm.termZh}
            </strong>
            <button
              type="button"
              className="glossary-disclosure-close"
              aria-label={
                lang === 'en'
                  ? 'Close engineering principle card'
                  : '收起机械原理说明'
              }
              title={lang === 'en' ? 'Close (Esc)' : '收起 (Esc)'}
              onClick={() => setSelection({ weaponId, termId: null })}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>

          <p className="glossary-disclosure-body">
            {lang === 'en' ? activeTerm.summaryEn : activeTerm.summaryZh}
          </p>

          {relatedExhibits.length > 0 && (
            <div className="glossary-related-row">
              <span className="glossary-related-label">
                {lang === 'en' ? 'Compare in Vault' : '关联馆藏直达'}
              </span>
              <div className="glossary-related-pills">
                {relatedExhibits.map((relId) => {
                  const shortLabel = getWeaponManifest(relId).shortLabel;
                  return (
                    <button
                      key={relId}
                      type="button"
                      className="glossary-related-pill"
                      data-testid={`glossary-jump-${relId}`}
                      title={
                        lang === 'en'
                          ? `Inspect ${shortLabel} in 3D Workbench`
                          : `跳转至 ${shortLabel} 3D 拆解台对比该机构`
                      }
                      onClick={() => handleJumpExhibit(relId)}
                    >
                      <span>{shortLabel}</span>
                      <ArrowUpRight size={10} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

GlossaryTermChips.displayName = 'GlossaryTermChips';
