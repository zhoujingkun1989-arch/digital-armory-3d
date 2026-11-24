import React, { useId, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';

export type KeyboardShortcutGroupId =
  | 'viewport'
  | 'cutaway'
  | 'firing'
  | 'navigation';

export interface KeyboardShortcutEntry {
  id: string;
  keys: readonly string[];
  labelZh: string;
  labelEn: string;
}

export interface KeyboardShortcutGroupSpec {
  id: KeyboardShortcutGroupId;
  items: readonly KeyboardShortcutEntry[];
}

export const KEYBOARD_SHORTCUT_GROUPS: readonly KeyboardShortcutGroupSpec[] = [
  {
    id: 'viewport',
    items: [
      {
        id: 'section-cut',
        keys: ['C'],
        labelZh: '切换 1:1 实时 CT 纵剖面与滑条',
        labelEn: 'Toggle 1:1 Live CT Section Cutaway',
      },
      {
        id: 'xray',
        keys: ['X'],
        labelZh: '切换外框 X-Ray 透视显示',
        labelEn: 'Toggle X-Ray Shell Transparency',
      },
      {
        id: 'engineering-tint',
        keys: ['T'],
        labelZh: '切换 6 大机械职能工程分色',
        labelEn: 'Toggle 6-Role Engineering Color Tint',
      },
      {
        id: 'edges',
        keys: ['E'],
        labelZh: '切换 CAD 硬边线框轮廓',
        labelEn: 'Toggle CAD Hard-Edge Wireframe',
      },
      {
        id: 'labels',
        keys: ['L'],
        labelZh: '切换 3D 零件引线标注',
        labelEn: 'Toggle 3D Part Leader Callouts',
      },
      {
        id: 'hud-hidden',
        keys: ['H'],
        labelZh: '纯净展陈模式（隐藏/恢复 HUD）',
        labelEn: 'Hide / Restore UI for Clean Showcase',
      },
      {
        id: 'sfx-mute',
        keys: ['M'],
        labelZh: '静音或开启实弹与机械声场',
        labelEn: 'Mute / Unmute Ballistic & Mechanical SFX',
      },
    ],
  },
  {
    id: 'cutaway',
    items: [
      {
        id: 'play-pause',
        keys: ['Space'],
        labelZh: '播放 / 暂停拆解或发射循环动画',
        labelEn: 'Play / Pause Disassembly or Firing Cycle',
      },
      {
        id: 'field-strip',
        keys: ['G'],
        labelZh: '开启 / 退出军械师亲手快拆模式',
        labelEn: 'Toggle Hands-On Guided Field-Strip',
      },
      {
        id: 'malfunction',
        keys: ['J'],
        labelZh: '开启 / 退出经典故障剖视排障室',
        labelEn: 'Toggle Malfunction Cutaway Diagnostics',
      },
      {
        id: 'caliper',
        keys: ['K'],
        labelZh: '开启 / 关闭 3D 毫米级游标卡尺',
        labelEn: 'Toggle 1:1 3D Vernier Caliper',
      },
      {
        id: 'attachments',
        keys: ['O'],
        labelZh: '开启 / 关闭模块化光学与枪口改装台',
        labelEn: 'Toggle Modular Optics & Muzzle Bench',
      },
      {
        id: 'reset-workbench',
        keys: ['Shift', 'R'],
        labelZh: '重置为 0% 合拢态与标准等轴测视角',
        labelEn: 'Reset to 0% Assembled & Default Isometric View',
      },
    ],
  },
  {
    id: 'firing',
    items: [
      {
        id: 'hold-trigger',
        keys: ['F'],
        labelZh: '按住扣动两道火扳机（阻铁与断连器仿真）',
        labelEn: 'Hold Two-Stage Trigger (Sear / Disconnector)',
      },
      {
        id: 'selector',
        keys: ['V'],
        labelZh: '切换快慢机火控档位（SAFE / SEMI / AUTO）',
        labelEn: 'Cycle Fire Selector (SAFE / SEMI / AUTO)',
      },
      {
        id: 'press-check',
        keys: ['P'],
        labelZh: '半拉套筒 / 拉机柄执行军械验膛',
        labelEn: 'Retract Bolt / Slide for Press-Check',
      },
      {
        id: 'cartridge-lab',
        keys: ['B'],
        labelZh: '进入 1:1 实弹与坦克炮弹纵剖馆',
        labelEn: 'Open 1:1 Cartridge & Cannon Cutaway Lab',
      },
      {
        id: 'ballistics-range',
        keys: ['R'],
        labelZh: '进入 1,000m 三维实弹靶场与外弹道',
        labelEn: 'Open 1,000m 3D External Ballistics Range',
      },
      {
        id: 'poster-share',
        keys: ['U'],
        labelZh: '生成高清 3D 剖视分享海报',
        labelEn: 'Open Instant HD 3D Poster Studio',
      },
    ],
  },
  {
    id: 'navigation',
    items: [
      {
        id: 'command-palette',
        keys: ['⌘ / Ctrl', 'K'],
        labelZh: '呼出全局双语瞬搜指令面板',
        labelEn: 'Open Global Instant Command Palette',
      },
      {
        id: 'shortcuts-help',
        keys: ['?'],
        labelZh: '打开 / 关闭键盘快捷键参考指南',
        labelEn: 'Open / Close Keyboard Shortcuts Guide',
      },
      {
        id: 'monograph-print',
        keys: ['⌘ / Ctrl', 'P'],
        labelZh: '呼出收藏级图鉴与绘本打印工坊',
        labelEn: 'Open Collector Monograph Print Studio',
      },
      {
        id: 'escape',
        keys: ['Esc'],
        labelZh: '逐层关闭弹窗、取消零件选中或返回军械库',
        labelEn: 'Dismiss Modal, Deselect Part, or Return to Armory',
      },
    ],
  },
];

export interface KeyboardShortcutsModalProps {
  onClose: () => void;
  /** Optional language override for deterministic SSR/unit tests. */
  langOverride?: LanguageCode;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  onClose,
  langOverride,
}) => {
  const storeLang = useAppStore((s) => s.lang);
  const lang = langOverride ?? storeLang;
  const ui = UI_STRINGS[lang].shortcutsModal;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogAccessibility({
    isOpen: true,
    containerRef: dialogRef,
    onClose,
  });

  return (
    <div
      className="kb-shortcuts-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="kb-shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="keyboard-shortcuts-modal"
      >
        <div className="kb-shortcuts-header">
          <div className="kb-shortcuts-heading">
            <div className="kb-shortcuts-badge">
              <Keyboard size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </div>
            <h2 id={titleId} className="kb-shortcuts-title">
              {ui.title}
            </h2>
            <p className="kb-shortcuts-subtitle">{ui.subtitle}</p>
          </div>
          <button
            type="button"
            className="kb-shortcuts-close"
            onClick={onClose}
            aria-label={ui.closeAria}
            title={ui.closeAria}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="kb-shortcuts-grid">
          {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
            <section
              key={group.id}
              className="kb-shortcuts-group"
              aria-label={ui.groups[group.id]}
              data-shortcut-group={group.id}
            >
              <h3 className="kb-shortcuts-group-title">
                {ui.groups[group.id]}
              </h3>
              <ul className="kb-shortcuts-list">
                {group.items.map((item) => (
                  <li key={item.id} className="kb-shortcuts-row">
                    <span className="kb-shortcuts-desc">
                      {lang === 'en' ? item.labelEn : item.labelZh}
                    </span>
                    <span className="kb-shortcuts-keys">
                      {item.keys.map((keyLabel, idx) => (
                        <React.Fragment key={`${item.id}-${keyLabel}`}>
                          {idx > 0 && (
                            <span className="kb-key-plus" aria-hidden="true">
                              +
                            </span>
                          )}
                          <kbd className="kb-keycap">{keyLabel}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="kb-shortcuts-footer">
          <span>{ui.footerHint}</span>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
