import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookMarked,
  BookOpen,
  Box,
  Compass,
  CornerDownLeft,
  Crosshair,
  Droplets,
  Eye,
  EyeOff,
  Flame,
  GitCompareArrows,
  Globe,
  Home,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Moon,
  Palette,
  Printer,
  RotateCcw,
  Ruler,
  Scissors,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  Sun,
  Tag,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { WEAPON_EN_FALLBACKS } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import {
  buildCommandPaletteItems,
  type CommandPaletteIconKey,
  type CommandPaletteItem,
  filterCommandPaletteItems,
} from './commandPaletteEngine';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function isMacLikePlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function renderCommandIcon(icon: CommandPaletteIconKey): React.ReactNode {
  const size = 14;
  switch (icon) {
    case 'weapon':
      return <Crosshair size={size} aria-hidden="true" />;
    case 'part':
      return <Layers size={size} aria-hidden="true" />;
    case 'principle':
      return <BookMarked size={size} aria-hidden="true" />;
    case 'armory':
      return <Shield size={size} aria-hidden="true" />;
    case 'showcase':
      return <Home size={size} aria-hidden="true" />;
    case 'cartridge':
      return <Crosshair size={size} aria-hidden="true" />;
    case 'ballistics':
      return <Compass size={size} aria-hidden="true" />;
    case 'showdown':
      return <GitCompareArrows size={size} aria-hidden="true" />;
    case 'atlas':
      return <ImageIcon size={size} aria-hidden="true" />;
    case 'poster':
      return <Share2 size={size} aria-hidden="true" />;
    case 'monograph':
      return <Printer size={size} aria-hidden="true" />;
    case 'story':
      return <BookOpen size={size} aria-hidden="true" />;
    case 'cutaway':
      return <Scissors size={size} aria-hidden="true" />;
    case 'xray':
      return <Eye size={size} aria-hidden="true" />;
    case 'wear':
      return <Droplets size={size} aria-hidden="true" />;
    case 'env_vault':
      return <Moon size={size} aria-hidden="true" />;
    case 'env_bench':
      return <Lightbulb size={size} aria-hidden="true" />;
    case 'env_daylight':
      return <Sun size={size} aria-hidden="true" />;
    case 'fieldstrip':
      return <Wrench size={size} aria-hidden="true" />;
    case 'malfunction':
      return <ShieldAlert size={size} aria-hidden="true" />;
    case 'caliper':
      return <Ruler size={size} aria-hidden="true" />;
    case 'tint':
      return <Palette size={size} aria-hidden="true" />;
    case 'firing':
      return <Flame size={size} aria-hidden="true" />;
    case 'edges':
      return <Box size={size} aria-hidden="true" />;
    case 'labels':
      return <Tag size={size} aria-hidden="true" />;
    case 'sfx':
      return <Volume2 size={size} aria-hidden="true" />;
    case 'hud':
      return <EyeOff size={size} aria-hidden="true" />;
    case 'lang':
      return <Globe size={size} aria-hidden="true" />;
    case 'reset':
      return <RotateCcw size={size} aria-hidden="true" />;
  }
}

const LISTBOX_ID = 'armory-command-palette-listbox';

const CommandPaletteDialogBody: React.FC = () => {
  const closeCommandPalette = useAppStore((s) => s.closeCommandPalette);
  const lang = useAppStore((s) => s.lang);
  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const weaponWearLevel = useAppStore((s) => s.weaponWearLevel);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const showEdges = useAppStore((s) => s.showEdges);
  const showLabels = useAppStore((s) => s.showLabels);
  const sfxMuted = useAppStore((s) => s.sfxMuted);
  const hudHidden = useAppStore((s) => s.hudHidden);
  const textureModalOpen = useAppStore((s) => s.textureModalOpen);
  const posterShareModalOpen = useAppStore((s) => s.posterShareModalOpen);
  const monographModalOpen = useAppStore((s) => s.monographModalOpen);
  const storyOpen = useAppStore((s) => s.storyOpen);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const prevFocusedRef = useRef<HTMLElement | null>(null);

  // Ensure active weapon parts are loaded immediately when opening Cmd+K from any screen
  useEffect(() => {
    preloadWeaponPlugin(activeWeaponId);
  }, [activeWeaponId]);

  const activePlugin = useWeaponPlugin(activeWeaponId);
  const activeWeaponParts = activePlugin?.parts ?? [];

  // Capture & restore focus cleanly across modal lifecycle
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const current = document.activeElement;
      prevFocusedRef.current =
        current instanceof HTMLElement && current !== document.body
          ? current
          : null;
    }
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      const prev = prevFocusedRef.current;
      prevFocusedRef.current = null;
      if (prev && prev.isConnected) {
        window.requestAnimationFrame(() => {
          if (prev.isConnected) prev.focus({ preventScroll: true });
        });
      }
    };
  }, []);

  const allItems = useMemo(
    () =>
      buildCommandPaletteItems({
        state: useAppStore.getState(),
        activeWeaponParts,
      }),
    // Re-evaluate whenever any surfaced status or weapon/part context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      lang,
      screen,
      activeWeaponId,
      mode,
      selectedPartId,
      sectionCut,
      xrayShells,
      weaponWearLevel,
      environmentPreset,
      fieldStripActive,
      malfunctionActive,
      caliperActive,
      engineeringTint,
      showEdges,
      showLabels,
      sfxMuted,
      hudHidden,
      textureModalOpen,
      posterShareModalOpen,
      monographModalOpen,
      storyOpen,
      activeWeaponParts,
    ]
  );

  const { groups, flatItems } = useMemo(
    () => filterCommandPaletteItems(allItems, query, lang),
    [allItems, query, lang]
  );

  const clampedIndex =
    flatItems.length === 0
      ? -1
      : Math.min(Math.max(activeIndex, 0), flatItems.length - 1);
  const activeItem = clampedIndex >= 0 ? flatItems[clampedIndex] : null;

  // Keep highlighted option scrolled into view on keyboard movement
  useEffect(() => {
    if (!activeItem) return;
    const node = itemRefs.current.get(activeItem.id);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeItem]);

  const executeItem = useCallback(
    (item: CommandPaletteItem) => {
      closeCommandPalette();
      item.execute();
    },
    [closeCommandPalette]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setActiveIndex((idx) => (idx + 1) % flatItems.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) {
        setActiveIndex(
          (idx) => (idx - 1 + flatItems.length) % flatItems.length
        );
      }
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      if (flatItems.length > 0) setActiveIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      if (flatItems.length > 0) setActiveIndex(flatItems.length - 1);
      return;
    }
    if (e.key === 'Enter' && activeItem) {
      e.preventDefault();
      executeItem(activeItem);
    }
  };

  const str = COMMAND_PALETTE_STRINGS[lang];
  const manifest = getWeaponManifest(activeWeaponId);
  const activeWeaponShort =
    lang === 'en'
      ? WEAPON_EN_FALLBACKS[activeWeaponId].shortLabel
      : manifest.shortLabel;
  const kbdShortcutLabel = isMacLikePlatform()
    ? str.trigger.kbdMac
    : str.trigger.kbdOther;

  let flatCursor = 0;

  return (
    <div
      className="cmdk-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closeCommandPalette();
        }
      }}
    >
      <div
        className="cmdk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={str.modal.dialogAria}
        onKeyDown={handleKeyDown}
      >
        <div className="cmdk-search-row">
          <Search size={16} className="cmdk-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="cmdk-search-input"
            role="combobox"
            aria-label={
              lang === 'zh'
                ? '搜索 34 款馆藏、854 个零件或博物馆实验室'
                : 'Search 34 exhibits, 854 parts, or museum labs'
            }
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              activeItem ? `cmdk-opt-${activeItem.id}` : undefined
            }
            placeholder={str.modal.searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
          {query && (
            <button
              type="button"
              className="cmdk-clear-btn"
              aria-label={str.modal.clearAria}
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus({ preventScroll: true });
              }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="cmdk-esc-btn"
            onClick={closeCommandPalette}
          >
            ESC
          </button>
        </div>

        <div className="cmdk-context-strip">
          <span className="cmdk-context-weapon">
            {str.modal.activeWeaponContext(
              activeWeaponShort,
              activeWeaponParts.length || manifest.catalog.partsCount
            )}
          </span>
          <span className="cmdk-results-count">
            {str.modal.resultsCount(flatItems.length)}
          </span>
        </div>

        <div
          id={LISTBOX_ID}
          className="cmdk-results-scroll"
          role="listbox"
          aria-label={str.modal.dialogAria}
        >
          {groups.length === 0 ? (
            <div className="cmdk-empty-state">
              <Search size={22} className="cmdk-empty-icon" aria-hidden="true" />
              <div className="cmdk-empty-title">{str.modal.emptyTitle}</div>
              <div className="cmdk-empty-hint">{str.modal.emptyHint}</div>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="cmdk-group" role="presentation">
                <div className="cmdk-group-heading">
                  <span>{group.label}</span>
                  <span className="cmdk-group-count">{group.items.length}</span>
                </div>
                {group.items.map((item) => {
                  const idx = flatCursor++;
                  const isHighlighted = idx === clampedIndex;
                  return (
                    <button
                      key={item.id}
                      id={`cmdk-opt-${item.id}`}
                      ref={(el) => {
                        if (el) itemRefs.current.set(item.id, el);
                        else itemRefs.current.delete(item.id);
                      }}
                      type="button"
                      role="option"
                      aria-selected={isHighlighted}
                      className={`cmdk-item ${
                        isHighlighted ? 'is-highlighted' : ''
                      } ${item.isActive ? 'is-active' : ''}`}
                      onMouseMove={() => {
                        if (activeIndex !== idx) setActiveIndex(idx);
                      }}
                      onClick={() => executeItem(item)}
                    >
                      <span className={`cmdk-item-icon group-${item.group}`}>
                        {renderCommandIcon(item.icon)}
                      </span>
                      <span className="cmdk-item-copy">
                        <span className="cmdk-item-title-row">
                          {item.codeBadge && (
                            <span className="cmdk-code-badge">
                              {item.codeBadge}
                            </span>
                          )}
                          <span className="cmdk-item-title">{item.title}</span>
                        </span>
                        <span className="cmdk-item-sub">{item.subtitle}</span>
                      </span>
                      <span className="cmdk-item-trailing">
                        {item.statusBadge && (
                          <span
                            className={`cmdk-status-pill tone-${
                              item.statusTone ?? 'muted'
                            }`}
                          >
                            {item.statusBadge}
                          </span>
                        )}
                        {item.shortcut && (
                          <kbd className="cmdk-kbd">{item.shortcut}</kbd>
                        )}
                        {isHighlighted && (
                          <CornerDownLeft
                            size={12}
                            className="cmdk-enter-cue"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-footer">
          <span className="cmdk-footer-hint">
            <kbd className="cmdk-kbd">↑</kbd>
            <kbd className="cmdk-kbd">↓</kbd>
            <span>{str.modal.footer.navigate}</span>
          </span>
          <span className="cmdk-footer-hint">
            <kbd className="cmdk-kbd">↵</kbd>
            <span>{str.modal.footer.execute}</span>
          </span>
          <span className="cmdk-footer-hint">
            <kbd className="cmdk-kbd">ESC</kbd>
            <span>{str.modal.footer.close}</span>
          </span>
          <span className="cmdk-footer-hint cmdk-footer-toggle">
            <kbd className="cmdk-kbd">{kbdShortcutLabel}</kbd>
            <span>{str.modal.footer.toggle}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export interface CommandPaletteModalProps {
  /** Optional override used in SSR/unit verification; runtime reads `useAppStore.commandPaletteOpen`. */
  forceOpen?: boolean;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  forceOpen,
}) => {
  const storeOpen = useAppStore((s) => s.commandPaletteOpen);
  const commandPaletteOpen = forceOpen ?? storeOpen;

  // Global capture-phase Cmd+K / Ctrl+K & Escape handler (works on ALL 5 screens)
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      const state = useAppStore.getState();

      if (state.commandPaletteOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.closeCommandPalette();
          return;
        }
        if (
          (e.metaKey || e.ctrlKey) &&
          !e.altKey &&
          !e.shiftKey &&
          e.key.toLowerCase() === 'k'
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.closeCommandPalette();
          return;
        }
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'k'
      ) {
        // Ignore Cmd/Ctrl+K while typing in an unrelated input/textarea/select
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        playWorkbenchFoley('toggle_switch');
        state.openCommandPalette();
      }
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, []);

  if (!commandPaletteOpen) return null;
  return <CommandPaletteDialogBody />;
};
