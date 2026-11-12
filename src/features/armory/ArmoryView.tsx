import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Globe2,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  Orbit,
  Rotate3d,
  Ruler,
  Scissors,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  ARMORY_WEAPONS,
  getShortWeaponLabel,
  matchesArmoryCategory,
} from '../../weapons/manifests';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { ArmoryCategory, ArmoryWeaponItem } from '../../weapons/types';
import { WeaponSilhouetteSvg } from './WeaponSilhouetteSvg';

const CATEGORY_FILTER_DEFS: { key: ArmoryCategory; labelBase: string }[] = [
  { key: 'all', labelBase: '全部馆藏' },
  { key: 'assault', labelBase: '突击/卡宾/无托' },
  { key: 'smg', labelBase: '冲锋枪' },
  { key: 'sniper', labelBase: '狙击/反器材' },
  { key: 'pistol', labelBase: '半自动手枪' },
];

export const ArmoryView: React.FC = () => {
  const [category, setCategory] = useState<ArmoryCategory>('all');
  const [plannedToast, setPlannedToast] = useState<string | null>(null);
  const rackScrollRef = useRef<HTMLDivElement>(null);

  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const openShowcase = useAppStore((s) => s.openShowcase);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const toggleArmoryAutoRotate = useAppStore((s) => s.toggleArmoryAutoRotate);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbrTextures = useAppStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const shortWeaponTag = getShortWeaponLabel(featuredWeapon.id);

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesArmoryCategory(w, category)
  );

  const scrollRackBy = (dir: -1 | 1) => {
    if (!rackScrollRef.current) return;
    rackScrollRef.current.scrollBy({
      left: dir * 480,
      behavior: 'smooth',
    });
  };

  const handleCardBodyClick = (
    item: ArmoryWeaponItem,
    cardEl?: HTMLDivElement | null
  ) => {
    if (cardEl) {
      cardEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
    if (item.available) {
      if (item.id !== activeWeaponId) {
        selectArmoryWeapon(item.id);
      } else {
        enterWorkbench(item.id);
      }
      return;
    }
    setPlannedToast(
      `「${item.nameCn}」模块正在接入中，当前可预览并拆解已入库枪械`
    );
    window.setTimeout(() => {
      setPlannedToast((prev) => (prev?.includes(item.nameCn) ? null : prev));
    }, 3000);
  };

  const featuredOriginTag = featuredWeapon.originCountryCn
    ? `${featuredWeapon.originCountryCn} · ${
        featuredWeapon.weaponTypeCn ?? featuredWeapon.categoryCn
      }`
    : featuredWeapon.categoryCn;

  return (
    <div className="armory-overlay">
      {/* Top Digital Armory Header */}
      <header className="armory-header">
        <div className="brand-block">
          <div className="brand-badge armory-vault-badge">DIGITAL ARMORY</div>
          <div>
            <h1 className="brand-title">枪械内部结构 3D 数字枪库</h1>
            <p className="brand-sub">
              十款世界名枪交互式陈列馆 · 选择枪械预览 3D 真铁材质并进入爆炸拆解与击发演示
            </p>
          </div>
        </div>

        <div className="armory-header-actions">
          <div
            className="armory-filter-pills"
            role="tablist"
            aria-label="枪械类别筛选"
          >
            {CATEGORY_FILTER_DEFS.map((tab) => {
              const count = ARMORY_WEAPONS.filter((w) =>
                matchesArmoryCategory(w, tab.key)
              ).length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`armory-filter-btn ${
                    category === tab.key ? 'active' : ''
                  }`}
                  onClick={() => setCategory(tab.key)}
                >
                  {tab.labelBase} ({count})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="armory-showcase-btn"
            onClick={openShowcase}
            title="打开项目官方宣传与架构展示主页"
          >
            <Sparkles size={13} />
            <span>产品宣传页</span>
          </button>

          <button
            type="button"
            className="armory-quick-enter-btn"
            onClick={() => enterWorkbench(featuredWeapon.id)}
          >
            <Wrench size={14} />
            <span>进入 {shortWeaponTag} 拆解台</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Left Featured Weapon Technical Plaque */}
      <aside className="armory-hero-plaque">
        <div className="plaque-status-row">
          <div className="plaque-bay-cluster">
            <span className="plaque-bay-tag">{featuredWeapon.bayCode}</span>
            <span className="plaque-origin-pill">
              <Globe2 size={11} />
              <span>{featuredOriginTag}</span>
            </span>
          </div>
          <span className="plaque-ready-pill">
            <CheckCircle2 size={11} />
            {featuredWeapon.statusLabel}
          </span>
        </div>

        <h2 className="plaque-weapon-title">{featuredWeapon.nameCn}</h2>
        <div className="plaque-weapon-sub">{featuredWeapon.modelCode}</div>

        <p className="plaque-desc">{featuredWeapon.description}</p>

        <div className="plaque-spec-grid">
          <div className="plaque-spec-cell">
            <span className="spec-k">口径规格</span>
            <span className="spec-v">{featuredWeapon.caliber}</span>
          </div>
          <div className="plaque-spec-cell">
            <span className="spec-k">建模精度</span>
            <span className="spec-v">
              {featuredWeapon.assembliesCount} 总成 /{' '}
              {featuredWeapon.partsCount} 零件
            </span>
          </div>
          <div className="plaque-spec-cell full">
            <span className="spec-k">核心自动与闭锁原理</span>
            <span className="spec-v">{featuredWeapon.actionMechanism}</span>
          </div>
        </div>

        <div className="plaque-metrology-box">
          <div className="plaque-metrology-head">
            <span className="plaque-metrology-title">
              <Ruler size={11} />
              <span>1:1 原厂测绘与内弹道参数</span>
            </span>
            <span className="plaque-metrology-tag">FACTORY 1:1</span>
          </div>
          <div className="plaque-metrology-grid">
            <div className="metrology-cell">
              <span className="spec-k">全枪长 (OAL)</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.overallLengthMm}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">枪管与膛线</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.barrelSpec}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">空枪质量</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.emptyWeightKg}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">枪口初速</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.muzzleVelocityMs}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">有效射程</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.effectiveRangeM}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">理论射速</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.rateOfFire}
              </span>
            </div>
          </div>
        </div>

        <div className="plaque-feature-chips">
          {featuredWeapon.highlights.map((h) => (
            <span key={h} className="plaque-chip">
              {h}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="plaque-primary-cta"
          onClick={() => enterWorkbench(featuredWeapon.id)}
        >
          <Layers size={16} />
          <span>进入 {shortWeaponTag} 分解与发射演示</span>
          <ArrowRight size={16} />
        </button>
      </aside>

      {/* Right Turntable Controls & Direct Click Hint */}
      <div className="armory-stage-controls">
        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            pbrTexturesEnabled ? 'active-cyan' : ''
          }`}
          onClick={togglePbrTextures}
          title="开启或关闭真实 2K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)"
        >
          <Sparkles size={14} />
          <span>
            {pbrTexturesEnabled ? '真实 PBR 贴图已启用' : 'PBR 贴图已关闭'}
          </span>
        </button>

        <button
          type="button"
          className="toggle-chip armory-ctrl-chip"
          onClick={() => setTextureModalOpen(true)}
          title="检视并下载全部定制 2K WebP 材质贴图原图"
        >
          <ImageIcon size={14} />
          <span>查看 PBR 贴图图集</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            armoryAutoRotate ? 'active-cyan' : ''
          }`}
          onClick={toggleArmoryAutoRotate}
          title="开启或暂停 3D 展台自动环绕旋转"
        >
          <Orbit size={14} />
          <span>{armoryAutoRotate ? '展台旋转中' : '自动旋转已停'}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            xrayShells ? 'active-cyan' : ''
          }`}
          onClick={toggleXrayShells}
          title="在枪库展台内直接预览内部枪机与火控透视结构 (X)"
        >
          <Eye size={14} />
          <span>X-Ray 透视预览</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            sectionCut ? 'active-teal' : ''
          }`}
          onClick={toggleSectionCut}
          title="沿纵向中轴切开外层机匣/套筒/弹匣右侧壳体，原色直视内部膛线、闭锁突笋与实弹供弹机构 (C)"
        >
          <Scissors size={14} />
          <span>{sectionCut ? '军械剖视已启用' : '军械剖视预览'}</span>
        </button>

        <div className="armory-stage-hint">
          <MousePointerClick size={13} />
          <span>拖拽检视 · 单击枪体直达分解</span>
        </div>
      </div>

      {/* Non-intrusive toast when clicking planned slot */}
      {plannedToast && <div className="armory-toast-banner">{plannedToast}</div>}

      {/* Bottom Compact Single-Row 10-Bay Armory Weapon Vault Rack (~176px tall) */}
      <section className="armory-rack-dock" aria-label="枪库十槽武器展架">
        <div className="rack-dock-header">
          <div className="rack-dock-title">
            <Shield size={13} className="rack-icon" />
            <span>枪库武器陈列架 · 10-BAY WEAPON VAULT RACK</span>
            <span className="rack-count-pill">
              {filteredWeapons.length} / {ARMORY_WEAPONS.length}
            </span>
          </div>

          <div className="rack-dock-right">
            <span className="rack-dock-tip">
              单击卡片切换展台预览 · 再次点击或点蓝字进入 3D 拆解台
            </span>
            <div className="rack-scroll-btns">
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(-1)}
                aria-label="向左滚动武器展架"
                title="向左滚动查看槽位"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(1)}
                aria-label="向右滚动武器展架"
                title="向右滚动查看槽位"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div ref={rackScrollRef} className="armory-cards-grid">
          {filteredWeapons.map((item) => {
            const isOnTurntable = item.id === activeWeaponId;
            const originTypeLabel = item.originCountryCn
              ? `${item.originCountryCn} · ${
                  item.weaponTypeCn ?? item.categoryCn
                }`
              : item.categoryCn;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`armory-weapon-card ${
                  item.available ? 'is-ready' : 'is-planned'
                } ${isOnTurntable ? 'is-on-turntable' : ''}`}
                onMouseEnter={() => {
                  if (item.available) preloadWeaponPlugin(item.id);
                }}
                onFocus={() => {
                  if (item.available) preloadWeaponPlugin(item.id);
                }}
                onClick={(e) => handleCardBodyClick(item, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardBodyClick(item, e.currentTarget);
                  }
                }}
              >
                <div className="wcard-top-row">
                  <span className="wcard-bay">{item.bayCode}</span>
                  <span className="wcard-origin-tag">{originTypeLabel}</span>
                  {item.available ? (
                    <span
                      className={`wcard-status ${
                        isOnTurntable ? 'turntable-active' : 'ready'
                      }`}
                    >
                      {isOnTurntable ? (
                        <>
                          <Rotate3d size={10} />
                          <span>预览中</span>
                        </>
                      ) : (
                        <span className="live-dot" title={item.statusLabel} />
                      )}
                    </span>
                  ) : (
                    <span className="wcard-status planned">
                      <Clock size={10} />
                      <span>待接入</span>
                    </span>
                  )}
                </div>

                <div className="wcard-silhouette-box">
                  <WeaponSilhouetteSvg
                    id={item.id}
                    available={item.available}
                  />
                </div>

                <div className="wcard-body">
                  <div className="wcard-title-row">
                    <span className="wcard-name">{item.nameCn}</span>
                  </div>
                  <div className="wcard-meta">
                    {item.caliber} · {item.partsCount} 零件节点
                  </div>
                </div>

                <div className="wcard-footer">
                  {item.available ? (
                    <button
                      type="button"
                      className="wcard-enter-cta-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        enterWorkbench(item.id);
                      }}
                    >
                      <span>进入 3D 内部拆解与发射演示</span>
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <span className="wcard-planned-note">
                      {item.actionMechanism}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
