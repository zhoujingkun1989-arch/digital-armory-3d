import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Copy,
  Cpu,
  Eye,
  Flame,
  Gauge,
  GitBranch,
  Globe2,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Orbit,
  Play,
  Ruler,
  Scissors,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { playbackClock } from '../../engine/clock/playbackClock';
import { resolveAssetUrl } from '../../engine/utils/assetUrl';
import { useAppStore } from '../../store/useAppStore';
import {
  ARMORY_WEAPONS,
  getShortWeaponLabel,
  matchesArmoryCategory,
} from '../../weapons/manifests';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { ArmoryCategory, WeaponId } from '../../weapons/types';
import { WeaponSilhouetteSvg } from '../armory/WeaponSilhouetteSvg';

const GITHUB_REPO_URL =
  'https://github.com/zhoujingkun1989-arch/digital-armory-3d';

type HeroStageMode = 'pbr' | 'section' | 'xray' | 'explode';

interface GalleryItem {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  imageFile: string;
  weaponId: WeaponId;
  actionType: 'armory' | 'explode' | 'firing' | 'section' | 'atlas';
  ctaLabel: string;
}

const SHOWCASE_GALLERY: readonly GalleryItem[] = [
  {
    id: 'ak15-section',
    badge: 'GPU CLIPPING CUTAWAY · 纵向剖视',
    title: 'AK-15M1 冲压机匣与弹匣供弹中轴剖视',
    subtitle:
      '沿枪膛中轴实时剖开右侧壳体，原色直视复进簧、双突笋回转枪机、长行程活塞、击锤阻铁咬合与弧形弹匣托弹簧。',
    imageFile: 'showcase/ak15-section.webp',
    weaponId: 'ak15',
    actionType: 'section',
    ctaLabel: '进入 AK-15M1 剖视实测',
  },
  {
    id: 'm82a1-firing',
    badge: '.50 BMG SHORT RECOIL · 实弹内弹道',
    title: '巴雷特 M82A1 整管短后坐与 60° 箭头制退冲击波',
    subtitle:
      '29 英寸开槽重枪管与双室箭头制退器同步后坐，加速子撬动枪机框解锁，配合 X-Ray 透视双联枪管缓冲簧动态形变。',
    imageFile: 'showcase/m82a1-firing.webp',
    weaponId: 'm82a1',
    actionType: 'firing',
    ctaLabel: '播放 .50 BMG 击发循环',
  },
  {
    id: 'deagle-chrome',
    badge: 'BRUSHED HARD CHROME · 5-CH ORM',
    title: '沙漠之鹰 Mark XIX .50 AE 拉丝硬铬与正向导气活塞',
    subtitle:
      '定制 2K 5 通道 ORM 贴图精准分离镜面抛光侧壁、哑光喷砂顶槽与 Hogue 橡胶握把，完整还原膛底固定枪管导气结构。',
    imageFile: 'showcase/deagle-chrome.webp',
    weaponId: 'deagle',
    actionType: 'explode',
    ctaLabel: '拆解沙漠之鹰 24 零件',
  },
  {
    id: 'awm-section',
    badge: '.338 LAPUA MAGNUM · 精密栓动',
    title: '精密国际 AWM 防冰槽六突笋枪机与施密特瞄具剖视',
    subtitle:
      '铝合金贯穿主梁底盘、60° 开锁行程螺旋防冰槽枪机、双排双进钢弹匣与 S&B PM II 高倍瞄准镜 1:1 空间配合。',
    imageFile: 'showcase/awm-section.webp',
    weaponId: 'awm',
    actionType: 'section',
    ctaLabel: '进入 AWM 栓动剖视',
  },
  {
    id: 'm4a1-iso',
    badge: 'MIL-STD-1913 · 枪匠影棚级深色分层',
    title: 'Colt M4A1 卡宾枪三色导轨齿与干膜灰 STANAG 弹匣',
    subtitle:
      '双侧掠射柔光箱与磷化转化膜着色曲线加持，清晰区分磷酸盐钢枪管、7075 阳极氧化机匣、KAC RAS 导轨齿顶与尼龙枪托。',
    imageFile: 'showcase/m4a1-iso.webp',
    weaponId: 'm4a1',
    actionType: 'explode',
    ctaLabel: '查看 M4A1 气吹内构',
  },
  {
    id: 'pbr-atlas',
    badge: '2048×1024 WEBP · 贴图图集检视器',
    title: '内置三通道 PBR 图集检视器（Albedo / Normal / ORM）',
    subtitle:
      '支持在浏览器内实时切换、放大并下载全库 58 张程序化烘焙贴图，体积从 101.35 MB 无损级压缩至 17.25 MB（-83%）。',
    imageFile: 'showcase/pbr-atlas.webp',
    weaponId: 'ak15',
    actionType: 'atlas',
    ctaLabel: '打开实时 PBR 贴图图集',
  },
];

const ARCHITECTURE_PILLARS = [
  {
    code: 'ARCH-01',
    icon: GitBranch,
    title: '自包含武器插件与首屏秒开分包',
    desc: '首屏仅加载不足 8 KB 的轻量展架清单（manifests.ts）；10 款武器的零件 BOM、运动学方程与 CSG 建模脚本均通过 Rollup 动态分包按需预热与懒加载。',
    metric: '10 独立插件 Chunk',
  },
  {
    code: 'ARCH-02',
    icon: Cpu,
    title: 'Web Worker 异步 CSG 与零拷贝回传',
    desc: '重度 three-bvh-csg 膛线镂空、闭锁突笋与防冰槽布尔运算完全隔离在后台 Worker 线程，通过 Transferable Float32Array 流式回传主线程，杜绝掉帧卡顿。',
    metric: '0 ms 主线程阻塞',
  },
  {
    code: 'ARCH-03',
    icon: Gauge,
    title: '60Hz 瞬态时钟与零 React 重渲染',
    desc: '高频拆解插值与击发进度下沉至非受控瞬态时钟 playbackClock.ts，在 R3F useFrame 内以零堆内存分配（Zero-GC）直接驱动矩阵与螺旋弹簧形变。',
    metric: '60 FPS 恒定帧率',
  },
  {
    code: 'ARCH-04',
    icon: Sparkles,
    title: '5 通道 Packed ORM 与双侧掠射柔光棚',
    desc: 'Python pbr_core 离线烘焙 Albedo + 切线法线 + ORM（R:高度积分AO · G:微粗糙度 · B:逐纹素金属度），配合 ACES Filmic 双侧 ±Z 掠射柔光箱还原实物质感。',
    metric: '58 张 WebP (-83%)',
  },
  {
    code: 'ARCH-05',
    icon: Scissors,
    title: 'GPU 局部剖切面与剖视穿透拾取',
    desc: '定制 sectionAwareMeshRaycast 拦截器联动 Three.js GPU 局部裁剪平面，剖开右侧机匣壳体的同时让鼠标射线无缝穿透虚空切面，精准点选内部火控与枪机。',
    metric: '亚毫米级 BVH 拾取',
  },
  {
    code: 'ARCH-06',
    icon: Shield,
    title: '401 步运动学防穿模与亮度门禁',
    desc: 'Vitest 自动化契约套件对全部 10 枪 253 零件执行法线单位长度、UV 跨度、Khronos 线性亮度下限及密集发射步进连续性断言，锁死工业级交付标准。',
    metric: '253 零件全量契约',
  },
] as const;

const SHORTCUT_ITEMS = [
  { key: 'Space', label: '播放 / 暂停拆解或实弹击发循环' },
  { key: 'C', label: '开启 / 关闭 1:1 纵向军械剖视切面' },
  { key: 'X', label: '切换外层机匣与套筒 X-Ray 透视' },
  { key: 'E', label: '显示 / 隐藏工业 CAD 硬边轮廓线' },
  { key: 'L', label: '开关零回流 3D 零件引出编号签' },
  { key: 'R', label: '一键复位 100% 爆炸态与等轴视角' },
  { key: 'Esc', label: '关闭弹窗 / 取消选中 / 返回枪库' },
] as const;

const CATEGORY_TABS: { key: ArmoryCategory; label: string }[] = [
  { key: 'all', label: '全部馆藏' },
  { key: 'assault', label: '突击 / 卡宾 / 无托' },
  { key: 'smg', label: '冲锋枪' },
  { key: 'sniper', label: '狙击 / 反器材' },
  { key: 'pistol', label: '半自动手枪' },
];

const QUICKSTART_SNIPPET = `git clone ${GITHUB_REPO_URL}.git
cd digital-armory-3d
npm install
npm run dev`;

export const ShowcaseView: React.FC = () => {
  const [heroMode, setHeroMode] = useState<HeroStageMode>('pbr');
  const [category, setCategory] = useState<ArmoryCategory>('all');
  const [copied, setCopied] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const toggleArmoryAutoRotate = useAppStore((s) => s.toggleArmoryAutoRotate);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const setXrayShells = useAppStore((s) => s.setXrayShells);
  const setTargetProgress = useAppStore((s) => s.setTargetProgress);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const shortWeaponTag = getShortWeaponLabel(featuredWeapon.id);

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesArmoryCategory(w, category)
  );

  const applyHeroStageMode = (nextMode: HeroStageMode) => {
    setHeroMode(nextMode);
    if (nextMode === 'pbr') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0);
    } else if (nextMode === 'section') {
      setSectionCut(true);
      setTargetProgress(0);
    } else if (nextMode === 'xray') {
      setXrayShells(true);
      setTargetProgress(0);
    } else if (nextMode === 'explode') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0.58);
    }
  };

  const handleHeroWeaponSwitch = (weaponId: WeaponId) => {
    selectArmoryWeapon(weaponId);
    // Preserve currently selected live preview visual state across weapon switches
    if (heroMode === 'section') {
      setSectionCut(true);
      setTargetProgress(0);
    } else if (heroMode === 'xray') {
      setXrayShells(true);
      setTargetProgress(0);
    } else if (heroMode === 'explode') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0.58);
    }
  };

  const launchSectionWorkbench = (weaponId: WeaponId) => {
    enterWorkbench(weaponId, 'explode');
    playbackClock.setTargetProgress(0, false);
    setSectionCut(true);
    useAppStore.getState().triggerCameraPreset('right');
  };

  const handleGalleryAction = (item: GalleryItem) => {
    setLightboxItem(null);
    if (item.actionType === 'armory') {
      returnToArmory();
      selectArmoryWeapon(item.weaponId);
    } else if (item.actionType === 'explode') {
      enterWorkbench(item.weaponId, 'explode');
    } else if (item.actionType === 'firing') {
      enterWorkbench(item.weaponId, 'firing');
    } else if (item.actionType === 'section') {
      launchSectionWorkbench(item.weaponId);
    } else if (item.actionType === 'atlas') {
      selectArmoryWeapon(item.weaponId);
      setTextureModalOpen(true);
    }
  };

  const handleCopyQuickstart = async () => {
    try {
      await navigator.clipboard.writeText(QUICKSTART_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="showcase-scroll-root" id="showcase-top">
      {/* Sticky Precision Glass Launch Navigation */}
      <nav className="showcase-nav" aria-label="产品宣传页主导航">
        <div className="showcase-nav-inner">
          <button
            type="button"
            className="showcase-brand"
            onClick={() => scrollToSection('showcase-top')}
          >
            <span className="showcase-brand-badge">DIGITAL ARMORY 3D</span>
            <span className="showcase-brand-ver">v2.0 · 1:1 EDITION</span>
          </button>

          <div className="showcase-nav-links">
            <button
              type="button"
              onClick={() => scrollToSection('capabilities')}
            >
              四大核心模式
            </button>
            <button type="button" onClick={() => scrollToSection('gallery')}>
              实机渲染画廊
            </button>
            <button type="button" onClick={() => scrollToSection('arsenal')}>
              十款馆藏名枪
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('architecture')}
            >
              三维引擎架构
            </button>
            <button type="button" onClick={() => scrollToSection('quickstart')}>
              开源快速部署
            </button>
          </div>

          <div className="showcase-nav-actions">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="showcase-gh-pill"
            >
              <Star size={13} />
              <span>GitHub</span>
              <ArrowUpRight size={13} />
            </a>
            <button
              type="button"
              className="showcase-launch-pill"
              onClick={returnToArmory}
            >
              <Layers size={14} />
              <span>进入 3D 数字枪库</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* ==================== HERO STAGE (LIVE REAL-TIME 3D WEBGL WINDOW) ==================== */}
      <section className="showcase-hero">
        <div className="showcase-hero-top">
          <div className="showcase-eyebrow">
            <Sparkles size={12} />
            <span>
              OPEN-SOURCE WEBGL 2.0 MECHANICAL ENGINE · 10 ICONIC FIREARMS · 253
              CSG PARTS
            </span>
          </div>

          <h1 className="showcase-hero-title">
            把十款世界传奇名枪的 <span>1:1 机械内构</span>，装进你的浏览器
          </h1>

          <p className="showcase-hero-sub">
            纯代码实时 CSG 布尔建模 <strong>253 个独立运动零件</strong>、
            <strong>58 张 2K 5 通道 ORM 物理贴图</strong>与{' '}
            <strong>7 阶段内弹道击发循环</strong>。零外部静态三维资产依赖，后台
            Web Worker 流式构建，60 FPS 丝滑透视每一根膛线、闭锁突笋与导气活塞。
          </p>

          <div className="showcase-hero-ctas">
            <button
              type="button"
              className="showcase-cta-primary"
              onClick={returnToArmory}
            >
              <Layers size={16} />
              <span>立即进入 3D 数字枪库</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="showcase-cta-secondary"
              onClick={() => enterWorkbench(featuredWeapon.id, 'explode')}
            >
              <Wrench size={15} />
              <span>直达 {shortWeaponTag} 爆炸拆解台</span>
            </button>

            <button
              type="button"
              className="showcase-cta-firing"
              onClick={() => enterWorkbench(featuredWeapon.id, 'firing')}
            >
              <Flame size={15} />
              <span>播放实弹击发循环</span>
            </button>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="showcase-cta-ghost"
            >
              <Star size={15} />
              <span>Star on GitHub</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>

        {/* Unobstructed Panoramic Window Revealing Live 60FPS WebGL Turntable Behind */}
        <div className="showcase-live-window">
          <div className="showcase-live-telemetry">
            <div className="live-telemetry-head">
              <span className="live-pulse-dot" />
              <span>LIVE WEBGL 2.0 REAL-TIME RENDER</span>
            </div>
            <div className="live-telemetry-name">{featuredWeapon.nameCn}</div>
            <div className="live-telemetry-meta">
              <span>{featuredWeapon.caliber}</span>
              <span>·</span>
              <span>{featuredWeapon.partsCount} 独立零件</span>
              <span>·</span>
              <span>OAL {featuredWeapon.specs1To1.overallLengthMm}</span>
            </div>
            <div className="live-telemetry-mech">
              {featuredWeapon.actionMechanism}
            </div>
          </div>
        </div>

        {/* Interactive Live 3D Stage Controller & Engineering Metrics Strip */}
        <div className="showcase-stage-dock">
          <div className="stage-dock-controls">
            <div className="stage-mode-group" role="group" aria-label="实时渲染模式切换">
              <span className="stage-ctrl-label">实时 3D 视口预览：</span>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'pbr' ? 'active' : ''}`}
                onClick={() => applyHeroStageMode('pbr')}
              >
                <Sparkles size={13} />
                <span>真铁 PBR 原貌</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'section' ? 'active-teal' : ''}`}
                onClick={() => applyHeroStageMode('section')}
              >
                <Scissors size={13} />
                <span>纵向军械剖视</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'xray' ? 'active' : ''}`}
                onClick={() => applyHeroStageMode('xray')}
              >
                <Eye size={13} />
                <span>X-Ray 透视内构</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'explode' ? 'active-amber' : ''}`}
                onClick={() => applyHeroStageMode('explode')}
              >
                <Box size={13} />
                <span>58% 悬浮半爆炸</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${armoryAutoRotate ? 'active-subtle' : ''}`}
                onClick={toggleArmoryAutoRotate}
              >
                <Orbit size={13} />
                <span>{armoryAutoRotate ? '环绕旋转中' : '旋转已暂停'}</span>
              </button>
            </div>

            <div className="stage-weapon-pills" aria-label="快速切换舞台展示枪械">
              {ARMORY_WEAPONS.map((w) => {
                const active = w.id === activeWeaponId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`stage-weapon-pill ${active ? 'active' : ''}`}
                    onMouseEnter={() => preloadWeaponPlugin(w.id)}
                    onClick={() => handleHeroWeaponSwitch(w.id)}
                  >
                    <span className="swp-bay">{w.bayCode.replace('BAY-', '#')}</span>
                    <span>{getShortWeaponLabel(w.id)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="showcase-metrics-bar">
            <div className="s-metric-item">
              <div className="s-metric-val">10 款</div>
              <div className="s-metric-lbl">传奇制式名枪 · 6 大闭锁原理</div>
            </div>
            <div className="s-metric-item">
              <div className="s-metric-val">253 件</div>
              <div className="s-metric-lbl">实时 CSG 布尔零件 · 零穿模</div>
            </div>
            <div className="s-metric-item">
              <div className="s-metric-val">58 张</div>
              <div className="s-metric-lbl">2K 5 通道 ORM 物理材质贴图</div>
            </div>
            <div className="s-metric-item">
              <div className="s-metric-val">-83%</div>
              <div className="s-metric-lbl">贴图体积压缩 (101MB → 17MB)</div>
            </div>
            <div className="s-metric-item">
              <div className="s-metric-val">60 FPS</div>
              <div className="s-metric-lbl">Worker 异步建模 · 零重渲染时钟</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SOLID EDITORIAL CONTENT BODY ==================== */}
      <div className="showcase-editorial-body">
        {/* SECTION 1: FOUR CORE INSPECTION MODES BENTO */}
        <section id="capabilities" className="showcase-section">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">FOUR CORE CAPABILITIES</span>
              <h2 className="section-title">四大军械级三维检视与仿真模式</h2>
              <p className="section-desc">
                从外层磷化钢滚印到腔内闭锁突笋咬合，每一把武器均打通「多级爆炸拆解、7
                阶段实弹循环、纵向中轴剖视、5 通道物理材质」全链路交互。
              </p>
            </div>

            <div className="bento-grid">
              <article className="bento-card bento-wide">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/ak15-callouts.webp')}
                    alt="AK-15M1 零回流引线与多级爆炸拆解工作台"
                    loading="lazy"
                  />
                  <span className="bento-tag">MODE 01 · EXPLODED CAD & CALLOUTS</span>
                </div>
                <div className="bento-content">
                  <h3>渐进式三级爆炸拆解 + 零回流防遮挡引线标注</h3>
                  <p>
                    支持「合拢态 0% → 野战一级快拆 30% → 枪机护木细拆 65% → 全枪
                    100% 爆炸图」无级阻尼拖拽；3D
                    表面锚点实时投影为工程细线引出签，自动避让 HUD
                    面板并精准读取每一枚零件的 <code>L × H × W mm</code>{' '}
                    毫米三维包络尺寸。
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn"
                    onClick={() => enterWorkbench('ak15', 'explode')}
                  >
                    <Play size={14} />
                    <span>打开 AK-15M1 100% 爆炸拆解台</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>

              <article className="bento-card bento-wide">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/m82a1-firing.webp')}
                    alt="Barrett M82A1 .50 BMG 整管短后坐与箭头制退侧喷"
                    loading="lazy"
                  />
                  <span className="bento-tag bento-tag-orange">
                    MODE 02 · 7-STAGE KINEMATICS & BALLISTICS
                  </span>
                </div>
                <div className="bento-content">
                  <h3>7 阶段真实运动学循环 + 6 口径 SAAMI/CIP 实弹内弹道</h3>
                  <p>
                    严格遵循各枪机械运动定律：长/短行程导气活塞、斯通纳气吹、MP5
                    4:1 滚柱延迟、M82A1 整管短后坐加速子、AWM 60°
                    防冰栓动及布朗宁闭锁下倾；含底火击发凹坑、抽壳抛壳轨迹与制退器侧向冲击波。
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn bento-action-orange"
                    onClick={() => enterWorkbench('m82a1', 'firing')}
                  >
                    <Flame size={14} />
                    <span>体验巴雷特 .50 BMG 慢放击发</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>

              <article className="bento-card">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/ak15-section.webp')}
                    alt="纵向中轴军械剖视切面"
                    loading="lazy"
                  />
                  <span className="bento-tag bento-tag-teal">
                    MODE 03 · LONGITUDINAL SECTION-CUT (C)
                  </span>
                </div>
                <div className="bento-content">
                  <h3>GPU 纵向中轴军械剖视与穿透射线拾取</h3>
                  <p>
                    按下 <code>C</code>{' '}
                    键即可沿枪膛纵轴切开右侧机匣、套筒与弹匣壳体，保留左侧完整真铁涂装；鼠标可直接穿过剖切面点选内部膛线、击锤、导气活塞与托弹簧。
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn bento-action-teal"
                    onClick={() => launchSectionWorkbench('ak15')}
                  >
                    <Scissors size={14} />
                    <span>直达纵向军械剖视模式</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>

              <article className="bento-card">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/pbr-atlas.webp')}
                    alt="5 通道 Packed ORM 物理贴图图集检视器"
                    loading="lazy"
                  />
                  <span className="bento-tag">MODE 04 · 5-CHANNEL PACKED ORM PBR</span>
                </div>
                <div className="bento-content">
                  <h3>Khronos 校准五级深色金属/聚合物分离与图集检视</h3>
                  <p>
                    针对锰系磷化钢、硬质阳极铝、CNC
                    导轨倒角、玻纤尼龙与硫化橡胶建立五级光学梯度，内置按需加载的
                    2K WebP 三通道贴图检视与原图下载面板。
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn"
                    onClick={() => setTextureModalOpen(true)}
                  >
                    <ImageIcon size={14} />
                    <span>打开 58 张 PBR 贴图图集检视器</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* SECTION 2: HIGH-RES WEBGL 2.0 GALLERY */}
        <section id="gallery" className="showcase-section showcase-section-alt">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">LIVE METAL WEBGL 2.0 CAPTURES</span>
              <h2 className="section-title">100% 浏览器实时渲染实机画廊</h2>
              <p className="section-desc">
                以下全部画面均由本项目前端引擎在浏览器内实时生成（零预渲染离线视频、零外部三维模型资产），点击图片可放大检视细节或一键进入同款实时视口。
              </p>
            </div>

            <div className="gallery-grid">
              {SHOWCASE_GALLERY.map((item) => (
                <div key={item.id} className="gallery-card">
                  <button
                    type="button"
                    className="gallery-img-btn"
                    onClick={() => setLightboxItem(item)}
                    title="点击放大检视高清实机渲染图"
                  >
                    <img
                      src={resolveAssetUrl(item.imageFile)}
                      alt={item.title}
                      loading="lazy"
                    />
                    <span className="gallery-zoom-pill">点击放大高清检视</span>
                  </button>
                  <div className="gallery-card-body">
                    <div className="gallery-badge">{item.badge}</div>
                    <h3 className="gallery-title">{item.title}</h3>
                    <p className="gallery-sub">{item.subtitle}</p>
                    <button
                      type="button"
                      className="gallery-launch-link"
                      onClick={() => handleGalleryAction(item)}
                    >
                      <span>{item.ctaLabel}</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 3: 10-WEAPON MASTER ARSENAL MATRIX */}
        <section id="arsenal" className="showcase-section">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">10-BAY MASTER ROSTER · FACTORY 1:1</span>
              <h2 className="section-title">十大世界经典名枪 1:1 测绘馆藏矩阵</h2>
              <p className="section-desc">
                涵盖俄、美、德、奥、英、比、以七国代表性轻武器体系，每款均配备完整原厂外弹道/测绘铭牌、独立总成分组与专属自动闭锁运动学方程。
              </p>
            </div>

            <div className="arsenal-filter-bar" role="tablist" aria-label="馆藏分类筛选">
              {CATEGORY_TABS.map((tab) => {
                const count = ARMORY_WEAPONS.filter((w) =>
                  matchesArmoryCategory(w, tab.key)
                ).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`arsenal-tab ${category === tab.key ? 'active' : ''}`}
                    onClick={() => setCategory(tab.key)}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="arsenal-grid">
              {filteredWeapons.map((item) => {
                const originLabel = item.originCountryCn
                  ? `${item.originCountryCn} · ${item.weaponTypeCn ?? item.categoryCn}`
                  : item.categoryCn;
                return (
                  <article
                    key={item.id}
                    className="arsenal-card"
                    onMouseEnter={() => preloadWeaponPlugin(item.id)}
                  >
                    <div className="arsenal-card-top">
                      <span className="arsenal-bay">{item.bayCode}</span>
                      <span className="arsenal-origin">
                        <Globe2 size={11} />
                        <span>{originLabel}</span>
                      </span>
                      <span className="arsenal-parts-pill">
                        {item.partsCount} 零件
                      </span>
                    </div>

                    <div className="arsenal-silhouette">
                      <WeaponSilhouetteSvg id={item.id} available={item.available} />
                    </div>

                    <div className="arsenal-head">
                      <h3>{item.nameCn}</h3>
                      <div className="arsenal-code">{item.modelCode}</div>
                    </div>

                    <p className="arsenal-mech">{item.actionMechanism}</p>

                    <div className="arsenal-specs">
                      <div className="a-spec">
                        <span>口径</span>
                        <strong>{item.caliber}</strong>
                      </div>
                      <div className="a-spec">
                        <span>全枪长 (OAL)</span>
                        <strong>{item.specs1To1.overallLengthMm}</strong>
                      </div>
                      <div className="a-spec">
                        <span>枪口初速</span>
                        <strong>{item.specs1To1.muzzleVelocityMs}</strong>
                      </div>
                      <div className="a-spec">
                        <span>有效射程</span>
                        <strong>{item.specs1To1.effectiveRangeM}</strong>
                      </div>
                    </div>

                    <div className="arsenal-actions">
                      <button
                        type="button"
                        className="arsenal-btn-explode"
                        onClick={() => enterWorkbench(item.id, 'explode')}
                      >
                        <Wrench size={13} />
                        <span>3D 爆炸拆解</span>
                      </button>
                      <button
                        type="button"
                        className="arsenal-btn-fire"
                        onClick={() => enterWorkbench(item.id, 'firing')}
                      >
                        <Flame size={13} />
                        <span>实弹击发演示</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: 6-PILLAR ENGINE ARCHITECTURE */}
        <section id="architecture" className="showcase-section showcase-section-alt">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">ENGINEERING ARCHITECTURE</span>
              <h2 className="section-title">纯 TypeScript + Python 驱动的工业级架构</h2>
              <p className="section-desc">
                拒绝臃肿黑盒静态资产，以严谨的前端图形工程管线解决大规模 CSG
                布尔运算、高频动画状态同步与 GPU 显存生命周期管理。
              </p>
            </div>

            <div className="pipeline-ribbon" aria-label="渲染与建模流水线">
              <div className="pipe-step">
                <span className="pipe-num">01</span>
                <span>Manifest 轻量目录 (&lt;8KB)</span>
              </div>
              <ArrowRight size={14} className="pipe-arrow" />
              <div className="pipe-step">
                <span className="pipe-num">02</span>
                <span>插件动态分包预热</span>
              </div>
              <ArrowRight size={14} className="pipe-arrow" />
              <div className="pipe-step">
                <span className="pipe-num">03</span>
                <span>Worker 异步 CSG 建模</span>
              </div>
              <ArrowRight size={14} className="pipe-arrow" />
              <div className="pipe-step">
                <span className="pipe-num">04</span>
                <span>Transferable 零拷贝传输</span>
              </div>
              <ArrowRight size={14} className="pipe-arrow" />
              <div className="pipe-step">
                <span className="pipe-num">05</span>
                <span>LRU 几何/WebP 显存池</span>
              </div>
              <ArrowRight size={14} className="pipe-arrow" />
              <div className="pipe-step">
                <span className="pipe-num">06</span>
                <span>60Hz 瞬态时钟零重渲染</span>
              </div>
            </div>

            <div className="arch-grid">
              {ARCHITECTURE_PILLARS.map((pillar) => {
                const IconComp = pillar.icon;
                return (
                  <div key={pillar.code} className="arch-card">
                    <div className="arch-card-head">
                      <div className="arch-icon-box">
                        <IconComp size={18} />
                      </div>
                      <span className="arch-code">{pillar.code}</span>
                      <span className="arch-metric">{pillar.metric}</span>
                    </div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 5: DEVELOPER QUICK-START, SHORTCUTS & FINAL CTA */}
        <section id="quickstart" className="showcase-section">
          <div className="showcase-container">
            <div className="quickstart-layout">
              <div className="quickstart-panel">
                <div className="qs-head">
                  <div className="qs-title-group">
                    <Terminal size={16} className="qs-icon" />
                    <span>30 秒本地克隆与极速启动</span>
                  </div>
                  <button
                    type="button"
                    className="qs-copy-btn"
                    onClick={handleCopyQuickstart}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? '已复制命令' : '复制命令'}</span>
                  </button>
                </div>
                <pre className="qs-code">
                  <code>{QUICKSTART_SNIPPET}</code>
                </pre>
                <div className="qs-badges">
                  <span>
                    <Zap size={12} /> Node.js &gt;= 20
                  </span>
                  <span>
                    <Ruler size={12} /> TypeScript Strict + ESLint 10
                  </span>
                  <span>
                    <Shield size={12} /> Vitest 9/9 全绿契约
                  </span>
                </div>
              </div>

              <div className="shortcuts-panel">
                <div className="qs-head">
                  <div className="qs-title-group">
                    <Keyboard size={16} className="qs-icon" />
                    <span>工作台全局工程快捷键</span>
                  </div>
                </div>
                <div className="shortcuts-list">
                  {SHORTCUT_ITEMS.map((sc) => (
                    <div key={sc.key} className="shortcut-row">
                      <kbd className="shortcut-kbd">{sc.key}</kbd>
                      <span>{sc.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Final Closing Banner */}
            <div className="final-cta-banner">
              <div>
                <div className="final-cta-kicker">READY FOR INSPECTION</div>
                <h2 className="final-cta-title">
                  现在进入 3D 数字枪库，亲手拆解每一枚精密零件
                </h2>
                <p className="final-cta-sub">
                  支持 URL 深度链接分享任意枪械、拆解进度与击发演示；开源免费，如果这个项目对你有启发，欢迎在
                  GitHub 点亮一颗 Star。
                </p>
              </div>
              <div className="final-cta-buttons">
                <button
                  type="button"
                  className="showcase-cta-primary"
                  onClick={returnToArmory}
                >
                  <Layers size={16} />
                  <span>启动 10 槽 3D 数字枪库</span>
                  <ArrowRight size={16} />
                </button>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="showcase-cta-github-solid"
                >
                  <Star size={16} />
                  <span>前往 GitHub 点亮 Star</span>
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </div>

            <footer className="showcase-footer">
              <div className="footer-left">
                <strong>Digital Armory 3D · 枪械内部结构 3D 数字仓库</strong>
                <span>
                  原理示意级（Schematic / Educational Level）机械科普与三维可视化开源工程
                  · 不包含任何工业制造加工公差或可打印图纸。
                </span>
              </div>
              <div className="footer-right">
                <span>MIT License</span>
                <span>·</span>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                  zhoujingkun1989-arch/digital-armory-3d
                </a>
              </div>
            </footer>
          </div>
        </section>
      </div>

      {/* High-Res Screenshot Lightbox Modal */}
      {lightboxItem && (
        <div
          className="showcase-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="showcase-lightbox-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-top">
              <div>
                <span className="gallery-badge">{lightboxItem.badge}</span>
                <h3>{lightboxItem.title}</h3>
              </div>
              <div className="lightbox-top-actions">
                <button
                  type="button"
                  className="showcase-launch-pill"
                  onClick={() => handleGalleryAction(lightboxItem)}
                >
                  <span>{lightboxItem.ctaLabel}</span>
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  className="lightbox-close-btn"
                  onClick={() => setLightboxItem(null)}
                  aria-label="关闭大图预览"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <img
              src={resolveAssetUrl(lightboxItem.imageFile)}
              alt={lightboxItem.title}
              className="lightbox-img"
            />
            <p className="lightbox-caption">{lightboxItem.subtitle}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowcaseView;
