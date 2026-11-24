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

export interface KeyboardPowerToolEntry {
  id: string;
  accessZh: string;
  accessEn: string;
  labelZh: string;
  labelEn: string;
}

export const KEYBOARD_SHORTCUT_GROUPS: readonly KeyboardShortcutGroupSpec[] = [
  {
    id: 'viewport',
    items: [
      {
        id: 'section-cut',
        keys: ['C'],
        labelZh: '切换三轴实时 CT 纵剖、3D 剖切盒与膛线剖视',
        labelEn: 'Toggle 3-Axis CT Cutaway, 3D Slice Box & Bore Rifling',
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
        labelZh: '纯净展陈模式（隐藏 / 恢复 HUD）',
        labelEn: 'Hide / Restore UI for Clean Showcase',
      },
      {
        id: 'sfx-mute',
        keys: ['M'],
        labelZh: '静音 / 开启声场（点顶栏音效键打开声学试听台）',
        labelEn: 'Mute / Unmute SFX (Header SFX Chip Opens Acoustic Deck)',
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
        labelZh: '开启 / 退出野战快拆与全枪精拆 DAG 实操',
        labelEn: 'Toggle Guided Field-Strip & Detail-Strip DAG',
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
        labelZh: '开启 / 关闭物理耦合模块化光学与枪口改装台',
        labelEn: 'Toggle Modular Optics & Muzzle Mods Bench',
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
        id: 'mechanism-showdown',
        keys: ['S'],
        labelZh: '枪库页呼出 9×9×9 原理流派对照矩阵',
        labelEn: 'Open Mechanism Lineage Matrix & Showdown (Armory)',
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
        labelEn: 'Open 1,000m 3D Proving Ground & Ballistics Range',
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
        labelZh: '全局双语瞬搜（直达 34 展品、854 零件与全部实验室）',
        labelEn: 'Global Bilingual Search (34 Exhibits, 854 Parts & All Labs)',
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
        labelZh: '呼出收藏级 17 图版图鉴与绘本打印工坊',
        labelEn: 'Open 17-Plate Collector Monograph Print Studio',
      },
      {
        id: 'armory-arrow-nav',
        keys: ['← / →'],
        labelZh: '在 3D 展馆中左右切换展品',
        labelEn: 'Browse Armory Vault exhibits',
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

/**
 * Museum power tools & interactive physics theaters accessible directly via the
 * Command Palette (`Cmd/Ctrl+K`) or Workbench chrome (listed honestly without
 * fabricating unimplemented single-key shortcuts).
 */
export const KEYBOARD_POWER_TOOLS: readonly KeyboardPowerToolEntry[] = [
  {
    id: 'slow-mo-cinema',
    accessZh: '底栏 / ⌘K',
    accessEn: 'Dock / ⌘K',
    labelZh: '一键慢放剖视大片演示（0.25× CT 击发）',
    labelEn: 'Slow-Mo Cutaway Cinema Demo (0.25× CT Firing)',
  },
  {
    id: 'acoustic-deck',
    accessZh: '顶栏音效键',
    accessEn: 'Header SFX',
    labelZh: '军械声学空间切换与 3 路机械音效试听台',
    labelEn: 'Acoustic Studio Deck (Reverb Rooms & Live Foley)',
  },
  {
    id: 'scale-wall',
    accessZh: '⌘K · 实验室',
    accessEn: '⌘K · Labs',
    labelZh: '1:1 真实尺度对比墙（全馆 34 展品）',
    labelEn: '1:1 True-Scale Museum Wall (All 34 Exhibits)',
  },
  {
    id: 'recoil-lab',
    accessZh: '⌘K · 实验室',
    accessEn: '⌘K · Labs',
    labelZh: '后坐冲量、燃气动量与枪口上跳实验室',
    labelEn: 'Recoil Impulse, Gas-Jet & Muzzle-Climb Lab',
  },
  {
    id: 'armor-theater',
    accessZh: '⌘K · 实验室',
    accessEn: '⌘K · Labs',
    labelZh: '1:1 复合装甲三维慢动作穿甲剧场',
    labelEn: '1:1 3D Composite Armor Penetration Theater',
  },
  {
    id: 'copy-deep-link',
    accessZh: '工具菜单 / ⌘K',
    accessEn: 'Tools / ⌘K',
    labelZh: '一键复制当前精确 3D 剖切与改装直达链接',
    labelEn: 'Copy Exact 3D View Deep-Link (Slice / Mods / Part)',
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

          <section
            className="kb-shortcuts-group kb-power-tools-group"
            data-testid="kb-power-tools-section"
            aria-label={
              lang === 'en'
                ? 'Quick-Access Physics Labs and Power Tools'
                : '快捷物理剧场与工程工具入口'
            }
          >
            <h3 className="kb-shortcuts-group-title">
              {lang === 'en'
                ? 'Quick-Access Labs & Power Tools (via ⌘/Ctrl+K or Toolbar)'
                : '快捷物理剧场与工程工具（通过 ⌘/Ctrl+K 或工具栏直达）'}
            </h3>
            <ul className="kb-power-tools-grid">
              {KEYBOARD_POWER_TOOLS.map((tool) => (
                <li key={tool.id} className="kb-shortcuts-row">
                  <span className="kb-shortcuts-desc">
                    {lang === 'en' ? tool.labelEn : tool.labelZh}
                  </span>
                  <span className="kb-access-pill">
                    {lang === 'en' ? tool.accessEn : tool.accessZh}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="kb-shortcuts-footer">
          <span>{ui.footerHint}</span>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
