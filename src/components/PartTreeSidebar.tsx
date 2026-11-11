import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Search,
} from 'lucide-react';
import { PartGroupKey } from '../data/g17PartsSpec';
import {
  getWeaponPartGroups,
  getWeaponParts,
  getWeaponWorkbenchMeta,
} from '../data/weaponRegistry';
import { useExplodeStore } from '../store/useExplodeStore';

export const PartTreeSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState<Record<PartGroupKey, boolean>>({
    slide: false,
    frame: false,
    fire_control: false,
    magazine: false,
  });
  const [query, setQuery] = useState('');

  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const selectedPartId = useExplodeStore((s) => s.selectedPartId);
  const hoveredPartId = useExplodeStore((s) => s.hoveredPartId);
  const hiddenGroups = useExplodeStore((s) => s.hiddenGroups);
  const panelCollapsed = useExplodeStore((s) => s.sidebarCollapsed);
  const setPanelCollapsed = useExplodeStore((s) => s.setSidebarCollapsed);
  const selectPart = useExplodeStore((s) => s.selectPart);
  const hoverPart = useExplodeStore((s) => s.hoverPart);
  const toggleGroupVisibility = useExplodeStore((s) => s.toggleGroupVisibility);

  const weaponParts = getWeaponParts(activeWeaponId);
  const partGroups = getWeaponPartGroups(activeWeaponId);
  const meta = getWeaponWorkbenchMeta(activeWeaponId);
  const normalizedQuery = query.trim().toLowerCase();

  if (panelCollapsed) {
    return (
      <button
        className="hud-collapsed-btn"
        onClick={() => setPanelCollapsed(false)}
        title="展开 BOM 零件目录"
      >
        <Layers size={16} />
        <span>零件目录 ({weaponParts.length})</span>
      </button>
    );
  }

  return (
    <aside className="part-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <Layers size={15} className="accent-icon" />
          <span>BOM 零件结构树</span>
          <span className="count-pill">{weaponParts.length}</span>
        </div>
        <button
          className="icon-ghost-btn"
          onClick={() => setPanelCollapsed(true)}
          title="收起侧栏"
        >
          收起
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={13} className="search-icon" />
        <input
          type="text"
          placeholder={meta.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
                  <span className="group-name">{group.nameZh}</span>
                  <span className="group-count">{groupParts.length}</span>
                </button>

                <button
                  className={`eye-btn ${isHidden ? 'muted' : ''}`}
                  onClick={() => toggleGroupVisibility(group.key)}
                  title={isHidden ? '显示该总成' : '隐藏该总成'}
                >
                  {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>

              {!isGroupCollapsed && (
                <ul className="bom-part-list">
                  {groupParts.map((part) => {
                    const active = selectedPartId === part.id;
                    const hovered = hoveredPartId === part.id;
                    return (
                      <li key={part.id}>
                        <button
                          className={`bom-part-item ${active ? 'active' : ''} ${
                            hovered ? 'hovered' : ''
                          } ${isHidden ? 'disabled-item' : ''}`}
                          onClick={() =>
                            selectPart(active ? null : part.id)
                          }
                          onMouseEnter={() => hoverPart(part.id)}
                          onMouseLeave={() => hoverPart(null)}
                        >
                          <span
                            className="part-code"
                            style={{
                              color: active ? '#ffffff' : group.badgeColor,
                            }}
                          >
                            {part.bomCode}
                          </span>
                          <span className="part-label">{part.nameZh}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
