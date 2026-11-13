import React, { useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import {
  normalizeTextureFileName,
  resolveTextureUrl,
} from '../../engine/utils/assetUrl';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest, WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';

export const TextureAtlasModal: React.FC = () => {
  const open = useAppStore((s) => s.textureModalOpen);
  const setOpen = useAppStore((s) => s.setTextureModalOpen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const pbrEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbr = useAppStore((s) => s.togglePbrTextures);

  const [weaponTab, setWeaponTab] = useState<WeaponId>(activeWeaponId);
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');

  const tabManifest = getWeaponManifest(weaponTab);
  const tabPlugin = useWeaponPlugin(weaponTab);
  const suites = tabPlugin?.pbrSuites ?? [];

  if (!open) return null;

  const current = suites.find((s) => s.id === activeSuiteId) ?? suites[0];

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="PBR 真实贴图图集检视器"
    >
      <div className="tex-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tex-modal-header">
          <div className="tex-modal-title-wrap">
            <div className="tex-badge-row">
              <span className="tex-modal-badge">
                <ImageIcon size={12} />
                11-WEAPON 2K PBR ATLAS
              </span>
              <div
                className="tex-weapon-switcher"
                role="tablist"
                aria-label="十一款枪械 PBR 贴图库切换"
              >
                {WEAPON_MANIFESTS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`tex-weapon-pill ${
                      weaponTab === m.id ? 'active' : ''
                    }`}
                    onMouseEnter={() => preloadWeaponPlugin(m.id)}
                    onClick={() => {
                      setWeaponTab(m.id);
                      setActiveSuiteId('');
                    }}
                  >
                    {m.catalog.bayCode.replace('BAY-', '#')} {m.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="tex-modal-title">{tabManifest.atlasHeadingCn}</h2>
              <p className="tex-modal-sub">
                全馆十一款名枪共 64 张定制高清 WebP
                物理材质贴图（public/textures/*.webp）· 已按三角面 UV
                实时绑定至全部 278 个精密零件
              </p>
            </div>
          </div>

          <div className="tex-modal-header-actions">
            <button
              type="button"
              className={`tex-live-toggle ${pbrEnabled ? 'is-on' : ''}`}
              onClick={togglePbr}
            >
              {pbrEnabled ? <Check size={14} /> : <Layers size={14} />}
              <span>
                {pbrEnabled ? '3D 实时贴图：已开启' : '3D 实时贴图：已关闭'}
              </span>
            </button>

            <button
              type="button"
              className="tex-close-btn"
              onClick={() => setOpen(false)}
              aria-label="关闭贴图检视窗口"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {current ? (
          <>
            {/* Suite Selector Tabs */}
            <div
              className="tex-suite-tabs"
              style={{
                gridTemplateColumns: `repeat(${suites.length}, minmax(0, 1fr))`,
              }}
            >
              {suites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tex-suite-tab ${
                    s.id === current.id ? 'active' : ''
                  }`}
                  onClick={() => setActiveSuiteId(s.id)}
                >
                  <span className="tex-tab-tag">{s.partTag}</span>
                  <span className="tex-tab-name">
                    {s.titleCn.replace(/贴图组|无缝细节贴图|无缝贴图/, '')}
                  </span>
                </button>
              ))}
            </div>

            {/* Suite Metadata Banner */}
            <div className="tex-suite-info">
              <div className="tex-info-main">
                <div className="tex-info-headline">
                  <h3>{current.titleCn}</h3>
                  <span className="tex-res-pill">{current.resolution}</span>
                </div>
                <p>{current.summary}</p>
              </div>
              <div className="tex-info-chips">
                {current.highlights.map((h) => (
                  <span key={h} className="tex-highlight-chip">
                    <Sparkles size={11} />
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* 3-Channel Preview Grid */}
            <div className="tex-channels-grid">
              {current.channels.map((ch) => {
                const cleanFile = normalizeTextureFileName(ch.fileName);
                const resolvedUrl = resolveTextureUrl(cleanFile);
                return (
                  <div
                    key={`${current.id}-${cleanFile}`}
                    className="tex-channel-card"
                  >
                    <div className="tex-ch-head">
                      <div>
                        <span
                          className={`tex-ch-badge kind-${ch.kind.toLowerCase()}`}
                        >
                          {ch.kind === 'Roughness'
                            ? 'ORM · R/G/B'
                            : ch.kind.toUpperCase()}
                        </span>
                        <span className="tex-ch-title">
                          {ch.kind === 'Roughness'
                            ? 'ORM 复合通道 (R:AO · G:粗糙 · B:金属)'
                            : ch.labelCn}
                        </span>
                      </div>
                      <a
                        href={resolvedUrl}
                        download={cleanFile}
                        className="tex-download-link"
                        title={`下载 ${cleanFile}`}
                      >
                        <Download size={12} />
                        <span>WEBP</span>
                      </a>
                    </div>

                    <div className="tex-img-frame">
                      <img src={resolvedUrl} alt={ch.labelCn} loading="lazy" />
                    </div>

                    <div className="tex-ch-foot">
                      <code>/textures/{cleanFile}</code>
                      <span>{ch.note}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="tex-suite-info">
            <p>正在按需加载 {tabManifest.shortLabel} 材质图集元数据...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextureAtlasModal;
