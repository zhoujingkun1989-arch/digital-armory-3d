import React from 'react';
import { Languages } from 'lucide-react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

interface LanguageSwitchPillProps {
  compact?: boolean;
}

export const LanguageSwitchPill: React.FC<LanguageSwitchPillProps> = ({
  compact = false,
}) => {
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const title = UI_STRINGS[lang].langToggleTitle;

  return (
    <div
      className={`lang-switch-pill ${compact ? 'compact' : ''}`}
      role="group"
      aria-label={title}
      title={title}
    >
      {!compact && <Languages size={13} className="lang-switch-icon" />}
      <button
        type="button"
        className={`lang-seg-btn ${lang === 'zh' ? 'active' : ''}`}
        onClick={() => setLang('zh')}
      >
        中文
      </button>
      <button
        type="button"
        className={`lang-seg-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </div>
  );
};
