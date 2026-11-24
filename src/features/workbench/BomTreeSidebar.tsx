import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Search,
  X,
} from 'lucide-react';
import {
  ENGINEERING_ROLE_META,
  ENGINEERING_ROLE_ORDER,
  getEngineeringRoleMeta,
  resolvePartEngineeringRole,
  type EngineeringRole,
} from '../../engine/materials/engineeringRoles';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  getLoadedWeaponPlugin,
  useWeaponPlugin,
} from '../../weapons/registry';
import type {
  AssemblyGroupKey,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';

/**
 * Bilingual mechanical role keyword aliases for instant BOM search
 * (supports natural firearm, archery, heavy armor & rotary ordnance queries).
 */
export const BOM_ROLE_SEARCH_KEYWORDS: Readonly<
  Record<EngineeringRole, string>
> = {
  locking:
    'locking lock lug breech bolt barrel chamber cam axle trunnion mantlet 闭锁 枪机 枪管 炮闩 闭锁突笋 承压 凸轮 主炮',
  gas_drive:
    'gas piston tube block regulator drive powerpack engine transmission limb cable 导气 活塞 导气管 动力 引擎 传动 弓片 缆索',
  bolt_carrier:
    'bolt carrier slide recoil handle loader autoloader rammer sled bowstring rotor 枪机框 套筒 拉机柄 复进 装弹 驻退 滑架 弓弦 转子',
  fire_control:
    'trigger sear hammer striker selector safety fire control fcg optics sight release 扳机 阻铁 击锤 击针 快慢机 保险 火控 观瞄 撒放',
  energy_spring:
    'spring recoil buffer damper torsion elastic recuperator 弹簧 复进簧 击锤簧 阻尼 扭杆 储能 复进',
  housing_feed:
    'receiver frame stock grip magazine mag feed drum clip chute armor hull turret riser quiver 机匣 套筒座 枪托 握把 弹匣 弹鼓 桥夹 供弹 装甲 车体 炮塔 弓把',
};

/**
 * Pure bilingual & engineering-role BOM search matcher.
 * Matches across `nameZh`, `nameEn`, `bomCode`, `id`, `roleTag`, `material`,
 * domain-adapted role labels, and canonical bilingual mechanical synonyms.
 */
export function matchesBomPartSearch(
  weaponId: WeaponId,
  part: WeaponPartSpec,
  query: string,
  roleFilter: EngineeringRole | null = null
): boolean {
  const partRole = resolvePartEngineeringRole(weaponId, part);
  if (roleFilter !== null && partRole !== roleFilter) {
    return false;
  }

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const baseRoleMeta = ENGINEERING_ROLE_META[partRole];
  const domainRoleMeta = getEngineeringRoleMeta(partRole, weaponId);
  const haystack = [
    part.nameZh,
    part.nameEn,
    part.bomCode,
    part.id,
    part.roleTag,
    part.material,
    partRole,
    baseRoleMeta.labelZh,
    baseRoleMeta.labelEn,
    baseRoleMeta.shortZh,
    baseRoleMeta.shortEn,
    domainRoleMeta.labelZh,
    domainRoleMeta.labelEn,
    domainRoleMeta.shortZh,
    domainRoleMeta.shortEn,
    BOM_ROLE_SEARCH_KEYWORDS[partRole],
  ]
    .join(' ')
    .toLowerCase();

  const tokens = trimmed.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (!haystack.includes(tokens[i])) {
      return false;
    }
  }
  return true;
}

export interface BomTreeSidebarProps {
  /** Optional overrides for SSR/unit testing; runtime reads directly from `useAppStore`. */
  forceExpanded?: boolean;
  initialQuery?: string;
  initialRoleFilter?: EngineeringRole | null;
  weaponIdOverride?: WeaponId;
}

interface BomPartRowProps {
  part: WeaponPartSpec;
  lang: LanguageCode;
  badgeColor: string;
  roleColor: string;
  roleLabel: string;
  isHidden: boolean;
}

const BomPartRow: React.FC<BomPartRowProps> = React.memo(
  ({ part, lang, badgeColor, roleColor, roleLabel, isHidden }) => {
    const active = useAppStore((s) => s.selectedPartId === part.id);
    const hovered = useAppStore((s) => s.hoveredPartId === part.id);
    const selectPart = useAppStore((s) => s.selectPart);
    const hoverPart = useAppStore((s) => s.hoverPart);

    const partName = lang === 'en' ? part.nameEn : part.nameZh;

    return (
      <li>
        <button
          type="button"
          className={`bom-part-item ${active ? 'active' : ''} ${
            hovered ? 'hovered' : ''
          } ${isHidden ? 'disabled-item' : ''}`}
          onClick={() => selectPart(active ? null : part.id)}
          onMouseEnter={() => hoverPart(part.id)}
          onMouseLeave={() => hoverPart(null)}
          title={`${partName} · ${roleLabel}`}
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
          <span
            className="bom-part-role-dot"
            style={{ backgroundColor: active ? '#ffffff' : roleColor }}
            aria-hidden="true"
          />
        </button>
      </li>
    );
  }
);

BomPartRow.displayName = 'BomPartRow';

export const BomTreeSidebar: React.FC<BomTreeSidebarProps> = ({
  forceExpanded,
  initialQuery = '',
  initialRoleFilter = null,
  weaponIdOverride,
}) => {
  const [collapsed, setCollapsed] = useState<Record<AssemblyGroupKey, boolean>>(
    {
      slide: false,
      frame: false,
      fire_control: false,
      magazine: false,
    }
  );
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const lang = useAppStore((s) => s.lang);
  const [searchState, setSearchState] = useState<{
    weaponId: WeaponId;
    text: string;
    role: EngineeringRole | null;
  }>({
    weaponId: activeWeaponId,
    text: initialQuery,
    role: initialRoleFilter,
  });
  const query = searchState.weaponId === activeWeaponId ? searchState.text : '';
  const activeRole =
    searchState.weaponId === activeWeaponId ? searchState.role : null;

  const hiddenGroups = useAppStore((s) => s.hiddenGroups);
  const storePanelCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const panelCollapsed = forceExpanded ? false : storePanelCollapsed;
  const setPanelCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const toggleGroupVisibility = useAppStore((s) => s.toggleGroupVisibility);

  const manifest = getWeaponManifest(activeWeaponId);
  const plugin =
    useWeaponPlugin(activeWeaponId) ?? getLoadedWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const weaponParts = useMemo(() => plugin?.parts ?? [], [plugin]);
  const partGroups = useMemo(() => plugin?.partGroups ?? [], [plugin]);
  const totalPartsCount = weaponParts.length || manifest.catalog.partsCount;
  const ui = UI_STRINGS[lang].bom;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  const hasActiveFilter = query.trim().length > 0 || activeRole !== null;

  const availableRoles = useMemo(() => {
    const present = new Set<EngineeringRole>();
    for (let i = 0; i < weaponParts.length; i++) {
      present.add(resolvePartEngineeringRole(activeWeaponId, weaponParts[i]));
    }
    return ENGINEERING_ROLE_ORDER.filter((r) => present.has(r));
  }, [activeWeaponId, weaponParts]);

  const filteredByGroup = useMemo(() => {
    const map = new Map<AssemblyGroupKey, WeaponPartSpec[]>();
    let matchedCount = 0;
    for (const group of partGroups) {
      const list = weaponParts.filter(
        (p) =>
          p.group === group.key &&
          matchesBomPartSearch(activeWeaponId, p, query, activeRole)
      );
      map.set(group.key, list);
      matchedCount += list.length;
    }
    return { map, matchedCount };
  }, [activeWeaponId, activeRole, partGroups, query, weaponParts]);

  const matchedPartsCount = filteredByGroup.matchedCount;

  const resetFilters = () => {
    setSearchState({ weaponId: activeWeaponId, text: '', role: null });
  };

  if (panelCollapsed) {
    return (
      <button
        type="button"
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
          <span
            className={`count-pill ${hasActiveFilter ? 'is-filtered' : ''}`}
            data-testid="bom-match-count"
          >
            {hasActiveFilter
              ? ui.matchCount(matchedPartsCount, totalPartsCount)
              : totalPartsCount}
          </span>
        </div>
        <button
          type="button"
          className="icon-ghost-btn"
          onClick={() => setPanelCollapsed(true)}
          title={ui.collapseTitle}
        >
          {ui.collapseAction}
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={13} className="search-icon" aria-hidden="true" />
        <input
          type="text"
          placeholder={displayMeta.searchPlaceholder}
          aria-label={displayMeta.searchPlaceholder}
          value={query}
          onChange={(e) =>
            setSearchState({
              weaponId: activeWeaponId,
              text: e.target.value,
              role: activeRole,
            })
          }
        />
        {query.length > 0 && (
          <button
            type="button"
            className="sidebar-search-clear"
            aria-label={ui.clearSearchAria}
            title={ui.clearSearchAria}
            onClick={() =>
              setSearchState({
                weaponId: activeWeaponId,
                text: '',
                role: activeRole,
              })
            }
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {availableRoles.length > 0 && (
        <div
          className="bom-role-filter-row"
          role="group"
          aria-label={ui.roleFilterAria}
        >
          <button
            type="button"
            className={`bom-role-chip ${activeRole === null ? 'is-active' : ''}`}
            aria-pressed={activeRole === null}
            onClick={() =>
              setSearchState({
                weaponId: activeWeaponId,
                text: query,
                role: null,
              })
            }
          >
            <span>{ui.allRolesLabel}</span>
          </button>
          {availableRoles.map((role) => {
            const meta = getEngineeringRoleMeta(role, activeWeaponId);
            const selected = activeRole === role;
            const shortLabel = lang === 'en' ? meta.shortEn : meta.shortZh;
            const fullLabel = lang === 'en' ? meta.labelEn : meta.labelZh;
            return (
              <button
                key={role}
                type="button"
                className={`bom-role-chip ${selected ? 'is-active' : ''}`}
                aria-pressed={selected}
                title={fullLabel}
                style={
                  selected
                    ? {
                        borderColor: meta.colorHex,
                        boxShadow: `0 0 0 1px ${meta.colorHex}40 inset`,
                      }
                    : undefined
                }
                onClick={() =>
                  setSearchState({
                    weaponId: activeWeaponId,
                    text: query,
                    role: selected ? null : role,
                  })
                }
              >
                <span
                  className="bom-role-chip-dot"
                  style={{ backgroundColor: meta.colorHex }}
                  aria-hidden="true"
                />
                <span>{shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="sidebar-groups">
        {hasActiveFilter && matchedPartsCount === 0 ? (
          <div className="bom-empty-state" role="status">
            <Search size={18} className="bom-empty-icon" aria-hidden="true" />
            <div className="bom-empty-title">{ui.emptyTitle}</div>
            <p className="bom-empty-hint">{ui.emptyHint}</p>
            <button
              type="button"
              className="bom-empty-reset-btn"
              onClick={resetFilters}
            >
              {ui.emptyResetBtn}
            </button>
          </div>
        ) : (
          partGroups.map((group) => {
            const groupParts = filteredByGroup.map.get(group.key) ?? [];
            if (hasActiveFilter && groupParts.length === 0) return null;

            const isGroupCollapsed = collapsed[group.key] && !hasActiveFilter;
            const isHidden = hiddenGroups[group.key];
            const groupTitle = lang === 'en' ? group.nameEn : group.nameZh;

            return (
              <div key={group.key} className="bom-group">
                <div className="bom-group-header">
                  <button
                    type="button"
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
                    type="button"
                    className={`eye-btn ${isHidden ? 'muted' : ''}`}
                    onClick={() => toggleGroupVisibility(group.key)}
                    title={isHidden ? ui.showGroup : ui.hideGroup}
                  >
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>

                {!isGroupCollapsed && (
                  <ul className="bom-part-list">
                    {groupParts.map((part) => {
                      const role = resolvePartEngineeringRole(
                        activeWeaponId,
                        part
                      );
                      const roleMeta = getEngineeringRoleMeta(
                        role,
                        activeWeaponId
                      );
                      return (
                        <BomPartRow
                          key={part.id}
                          part={part}
                          lang={lang}
                          badgeColor={group.badgeColor}
                          roleColor={roleMeta.colorHex}
                          roleLabel={
                            lang === 'en' ? roleMeta.labelEn : roleMeta.labelZh
                          }
                          isHidden={isHidden}
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
