import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Search,
} from 'lucide-react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import type {
  AssemblyGroupKey,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';

interface BomPartRowProps {
  part: WeaponPartSpec;
  lang: LanguageCode;
  badgeColor: string;
  isHidden: boolean;
}

const BomPartRow: React.FC<BomPartRowProps> = React.memo(
  ({ part, lang, badgeColor, isHidden }) => {
    const active = useAppStore((s) => s.selectedPartId === part.id);
    const hovered = useAppStore((s) => s.hoveredPartId === part.id);
    const selectPart = useAppStore((s) => s.selectPart);
    const hoverPart = useAppStore((s) => s.hoverPart);

    const partName = lang === 'en' ? part.nameEn : part.nameZh;

    return (
      <li>
        <button
          className={`bom-part-item ${active ? 'active' : ''} ${
            hovered ? 'hovered' : ''
          } ${isHidden ? 'disabled-item' : ''}`}
          onClick={() => selectPart(active ? null : part.id)}
          onMouseEnter={() => hoverPart(part.id)}
          onMouseLeave={() => hoverPart(null)}
          title={partName}
        >
          <span
            className="part-code"
            style={{
              color: active ? '#ffffff' : badgeColor,
            }}
          >
            {part.bomCode}
          </span>
          <span className="part-label">{partName}</span>
        </button>
      </li>
    );
  }
);

BomPartRow.displayName = 'BomPartRow';

export const BomTreeSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState<Record<AssemblyGroupKey, boolean>>(
    {
      slide: false,
      frame: false,
      fire_control: false,
      magazine: false,
    }
  );
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const [searchState, setSearchState] = useState<{
    weaponId: WeaponId;
    text: string;
  }>({ weaponId: activeWeaponId, text: '' });
  const query = searchState.weaponId === activeWeaponId ? searchState.text : '';

  const hiddenGroups = useAppStore((s) => s.hiddenGroups);
  const panelCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setPanelCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const toggleGroupVisibility = useAppStore((s) => s.toggleGroupVisibility);

  const manifest = getWeaponManifest(activeWeaponId);
  const plugin = useWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const weaponParts = plugin?.parts ?? [];
  const partGroups = plugin?.partGroups ?? [];
  const totalPartsCount = weaponParts.length || manifest.catalog.partsCount;
  const ui = UI_STRINGS[lang].bom;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  const normalizedQuery = query.trim().toLowerCase();

  if (panelCollapsed) {
    return (
      <button
        className="hud-collapsed-btn"
        onClick={() => setPanelCollapsed(false)}
        title={ui.collapsedTitle}
      >
        <Layers size={16} />
        <span>{ui.collapsedBtn(totalPartsCount)}</span>
      </button>
    );
  }

  return (
    <aside className="part-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <Layers size={15} className="accent-icon" />
          <span>{ui.headerTitle}</span>
          <span className="count-pill">{totalPartsCount}</span>
        </div>
        <button
          className="icon-ghost-btn"
          onClick={() => setPanelCollapsed(true)}
          title={ui.collapseTitle}
        >
          {ui.collapseAction}
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={13} className="search-icon" />
        <input
          type="text"
          placeholder={displayMeta.searchPlaceholder}
          value={query}
          onChange={(e) =>
            setSearchState({ weaponId: activeWeaponId, text: e.target.value })
          }
        />
      </div>

      <div className="sidebar-groups">
        {partGroups.map((group) => {
          const groupParts = weaponParts.filter((p) => {
            if (p.group !== group.key) return false;
            if (!normalizedQuery) return true;
            return (
              p.nameZh.toLowerCase().includes(normalizedQuery) ||
              p.nameEn.toLowerCase().includes(normalizedQuery) ||
              p.bomCode.toLowerCase().includes(normalizedQuery)
            );
          });

          if (normalizedQuery && groupParts.length === 0) return null;

          const isGroupCollapsed = collapsed[group.key] && !normalizedQuery;
          const isHidden = hiddenGroups[group.key];
          const groupTitle = lang === 'en' ? group.nameEn : group.nameZh;

          return (
            <div key={group.key} className="bom-group">
              <div className="bom-group-header">
                <button
                  className="bom-group-toggle"
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [group.key]: !c[group.key],
                    }))
                  }
                >
                  {isGroupCollapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  <span
                    className="group-dot"
                    style={{ backgroundColor: group.badgeColor }}
                  />
                  <span className="group-name">{groupTitle}</span>
                  <span className="group-count">{groupParts.length}</span>
                </button>

                <button
                  className={`eye-btn ${isHidden ? 'muted' : ''}`}
                  onClick={() => toggleGroupVisibility(group.key)}
                  title={isHidden ? ui.showGroup : ui.hideGroup}
                >
                  {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>

              {!isGroupCollapsed && (
                <ul className="bom-part-list">
                  {groupParts.map((part) => (
                    <BomPartRow
                      key={part.id}
                      part={part}
                      lang={lang}
                      badgeColor={group.badgeColor}
                      isHidden={isHidden}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
