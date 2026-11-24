// ============================================================================
// Cycle 3B · Pure Canvas 2D Museum-Grade Range Target Card PNG Exporter
//
// Renders a downloadable 1200×800 dark engineering blueprint target card
// plotting AR500 steel gong silhouette, numbered 5-round impacts, dashed
// CEP50 & Extreme Spread circles, MPI centroid, caliber, DOPE dial, wind,
// range, impact velocity & retained energy — 100% bilingual (zh / en), zero deps.
// ============================================================================

import type { LanguageCode } from '../../narration/types';
import type { RangeGroupingResult, RangeTrajectory3D } from './range3DMath';

export const TARGET_CARD_WIDTH = 1200;
export const TARGET_CARD_HEIGHT = 800;

export interface TargetCardRenderInput {
  grouping: RangeGroupingResult;
  traj: RangeTrajectory3D;
  lang: LanguageCode;
  signedCrosswindMps: number;
  elevDialMil: number;
  windDialMil: number;
}

export interface TargetCardMetricRow {
  label: string;
  value: string;
  accent?: 'cyan' | 'amber' | 'emerald' | 'slate';
}

export interface TargetCardSummary {
  width: number;
  height: number;
  filename: string;
  headerKicker: string;
  headerTitle: string;
  caliberSubtitle: string;
  plateLegend: string;
  metrics: readonly TargetCardMetricRow[];
  footerNote: string;
}

function formatCardEnergy(energyJ: number): string {
  if (energyJ >= 1_000_000) return `${(energyJ / 1_000_000).toFixed(2)} MJ`;
  if (energyJ >= 1000) return `${Math.round(energyJ).toLocaleString('en-US')} J`;
  return `${Math.round(energyJ)} J`;
}

function formatSigned(val: number, digits = 1): string {
  const safe = Math.abs(val) < Math.pow(10, -(digits + 1)) ? 0 : val;
  return `${safe > 0 ? '+' : ''}${safe.toFixed(digits)}`;
}

/**
 * Pure deterministic summary builder used by both Canvas 2D export and Vitest invariants.
 */
export function buildTargetCardSummary(
  input: TargetCardRenderInput
): TargetCardSummary {
  const { grouping, traj, lang, signedCrosswindMps, elevDialMil, windDialMil } =
    input;
  const isZh = lang === 'zh';
  const spec = traj.spec;
  const rangeRounded = Math.round(grouping.targetRangeM);
  const cleanCode = spec.id.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `digital-armory-target-card-${cleanCode}-${rangeRounded}m.png`;

  const aimLabel =
    traj.aimMode === 'dope_dial'
      ? isZh
        ? 'DOPE 满修'
        : 'DOPE Dial'
      : traj.aimMode === 'elev_only'
        ? isZh
          ? '仅修高低'
          : 'Elev Only'
        : isZh
          ? '原始归零'
          : 'Raw Zero';

  const metrics: TargetCardMetricRow[] = [
    {
      label: isZh ? '最大散布 (Extreme Spread)' : 'Extreme Spread (ES)',
      value: `${grouping.extremeSpreadCm.toFixed(1)} cm · ${grouping.extremeSpreadMoa.toFixed(2)} MOA`,
      accent: 'cyan',
    },
    {
      label: isZh ? '50% 圆概率偏差 (CEP50)' : 'Circular Error Probable (CEP50)',
      value: `${grouping.cep50Cm.toFixed(1)} cm`,
      accent: 'amber',
    },
    {
      label: isZh ? '平均散布半径 (Mean Radius)' : 'Mean Radius (MR)',
      value: `${grouping.meanRadiusCm.toFixed(1)} cm`,
      accent: 'slate',
    },
    {
      label: isZh ? 'AR500 钢靶命中' : 'Steel Gong Hits',
      value: `${grouping.hitCount} / ${grouping.shotCount}`,
      accent: grouping.hitCount >= 4 ? 'emerald' : 'amber',
    },
    {
      label: isZh ? '平均弹着点偏移 (MPI)' : 'Mean Point of Impact (MPI)',
      value: `X ${formatSigned(grouping.groupCenterOffsetCm.x)} / Y ${formatSigned(grouping.groupCenterOffsetCm.y)} cm`,
      accent: 'slate',
    },
    {
      label: isZh ? '靶距与修正模式' : 'Target Range & Sight Mode',
      value: `${rangeRounded} m · ${aimLabel}`,
      accent: 'slate',
    },
    {
      label: isZh ? 'DOPE 旋钮修正 (MIL)' : 'DOPE Turret Dial (MIL)',
      value: `EL ${formatSigned(elevDialMil, 2)} · WD ${formatSigned(windDialMil, 2)} MIL`,
      accent: 'cyan',
    },
    {
      label: isZh ? '横风与固有精度' : 'Crosswind & Base Precision',
      value: `${formatSigned(signedCrosswindMps, 1)} m/s · ${grouping.dispersionProfile.moaBase.toFixed(2)} MOA`,
      accent: 'slate',
    },
    {
      label: isZh ? '着弹存速与留存动能' : 'Impact Velocity & Energy',
      value: `${Math.round(traj.impactSample.velocityMps)} m/s (M${traj.impactSample.mach.toFixed(2)}) · ${formatCardEnergy(traj.impactSample.energyJ)}`,
      accent: 'emerald',
    },
  ];

  return {
    width: TARGET_CARD_WIDTH,
    height: TARGET_CARD_HEIGHT,
    filename,
    headerKicker: isZh
      ? 'DIGITAL ARMORY 3D · 1,000m 实弹外弹道靶场工程成绩单'
      : 'DIGITAL ARMORY 3D · 1,000M PROVING GROUND TARGET CARD',
    headerTitle: isZh
      ? `${spec.code} · ${rangeRounded}m 五发连射散布靶纸`
      : `${spec.code} · ${rangeRounded}m 5-Round Grouping Target Card`,
    caliberSubtitle: isZh
      ? `${spec.nameZh} · ${spec.loadLabelZh}`
      : `${spec.nameEn} · ${spec.loadLabelEn}`,
    plateLegend: isZh
      ? `AR500 钢靶 Ø${Math.round(grouping.plateRadiusCm * 2)} cm · 虚线琥珀圈 = CEP50 · 虚线青圈 = ES 最大散布`
      : `AR500 Gong Ø${Math.round(grouping.plateRadiusCm * 2)} cm · Dashed Amber = CEP50 · Dashed Cyan = ES Span`,
    metrics,
    footerNote: isZh
      ? `RK4 3-DOF 外弹道模型 · 枪口初速 SD ±${grouping.dispersionProfile.mvSdMps.toFixed(1)} m/s · 微风阵抖 ±${grouping.dispersionProfile.windGustSdMps.toFixed(1)} m/s · Seed #${grouping.seed}`
      : `RK4 3-DOF Ballistic Engine · Muzzle Vel SD ±${grouping.dispersionProfile.mvSdMps.toFixed(1)} m/s · Gust Jitter ±${grouping.dispersionProfile.windGustSdMps.toFixed(1)} m/s · Seed #${grouping.seed}`,
  };
}

/**
 * Renders the 1200×800 museum-grade engineering blueprint range target card onto a 2D context.
 */
export function renderRangeTargetCardCanvas(
  ctx: CanvasRenderingContext2D,
  input: TargetCardRenderInput
): TargetCardSummary {
  const summary = buildTargetCardSummary(input);
  const { grouping, lang } = input;
  const isZh = lang === 'zh';
  const W = TARGET_CARD_WIDTH;
  const H = TARGET_CARD_HEIGHT;

  // 1. Deep Engineering Blueprint Background Gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#070d18');
  bg.addColorStop(0.55, '#0c1628');
  bg.addColorStop(1, '#08101d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Precision blueprint grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.065)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Outer blueprint frame
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // 2. Top Header Banner
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(summary.headerKicker, 44, 38);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(summary.headerTitle, 44, 60);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(summary.caliberSubtitle, 44, 96);

  // Header divider rule
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(44, 126);
  ctx.lineTo(W - 44, 126);
  ctx.stroke();

  // 3. Left Panel: Plotted AR500 Steel Gong Blueprint Target Plot
  const plotX = 44;
  const plotY = 144;
  const plotW = 636;
  const plotH = 588;
  const cx = plotX + plotW * 0.5;
  const cy = plotY + plotH * 0.5;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(plotX, plotY, plotW, plotH);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(plotX, plotY, plotW, plotH);

  // Dynamic zoom scale so both the AR500 plate AND all 5 impacts fit comfortably inside plot box
  let maxExtentCm = grouping.plateRadiusCm * 1.24;
  for (const s of grouping.shots) {
    maxExtentCm = Math.max(
      maxExtentCm,
      Math.abs(s.offsetZCm) * 1.18,
      Math.abs(s.offsetYCm) * 1.18
    );
  }
  const pxPerCm = Math.min(plotW, plotH) * 0.44 / Math.max(1, maxExtentCm);
  const platePxR = grouping.plateRadiusCm * pxPerCm;

  // Crosshair axes
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotX + 18, cy);
  ctx.lineTo(plotX + plotW - 18, cy);
  ctx.moveTo(cx, plotY + 18);
  ctx.lineTo(cx, plotY + plotH - 18);
  ctx.stroke();

  // AR500 Steel Gong Disc Silhouette
  const gongGrad = ctx.createRadialGradient(cx, cy, platePxR * 0.08, cx, cy, platePxR);
  gongGrad.addColorStop(0, 'rgba(226, 232, 240, 0.22)');
  gongGrad.addColorStop(0.72, 'rgba(148, 163, 184, 0.14)');
  gongGrad.addColorStop(1, 'rgba(71, 85, 105, 0.26)');
  ctx.fillStyle = gongGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, platePxR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.72)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, platePxR, 0, Math.PI * 2);
  ctx.stroke();

  // Scoring rings (72% and 32% bullseye)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, platePxR * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(234, 88, 12, 0.24)';
  ctx.beginPath();
  ctx.arc(cx, cy, platePxR * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Group centroid (MPI) coordinates
  const mpiPxX = cx + grouping.groupCenterOffsetCm.x * pxPerCm;
  const mpiPxY = cy - grouping.groupCenterOffsetCm.y * pxPerCm;

  // Dashed Extreme Spread Circle around ES midpoint + connecting span line
  const [esIdxA, esIdxB] = grouping.extremeSpreadPair;
  const sA = grouping.shots[esIdxA];
  const sB = grouping.shots[esIdxB];
  if (sA && sB) {
    const ax = cx + sA.offsetZCm * pxPerCm;
    const ay = cy - sA.offsetYCm * pxPerCm;
    const bx = cx + sB.offsetZCm * pxPerCm;
    const by = cy - sB.offsetYCm * pxPerCm;
    const midX = (ax + bx) * 0.5;
    const midY = (ay + by) * 0.5;
    const esR = Math.max(6, (grouping.extremeSpreadCm * 0.5) * pxPerCm);

    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.82)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(midX, midY, esR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  // Dashed Amber CEP50 Circle centered on MPI
  const cepPxR = Math.max(5, grouping.cep50Cm * pxPerCm);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.92)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mpiPxX, mpiPxY, cepPxR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // MPI Crosshair (+)
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mpiPxX - 8, mpiPxY);
  ctx.lineTo(mpiPxX + 8, mpiPxY);
  ctx.moveTo(mpiPxX, mpiPxY - 8);
  ctx.lineTo(mpiPxX, mpiPxY + 8);
  ctx.stroke();

  // Numbered 5-Round Impact Marks
  for (const shot of grouping.shots) {
    const ix = cx + shot.offsetZCm * pxPerCm;
    const iy = cy - shot.offsetYCm * pxPerCm;

    // Outer lead-splash halo
    ctx.fillStyle = shot.hit
      ? 'rgba(56, 189, 248, 0.26)'
      : 'rgba(244, 63, 94, 0.24)';
    ctx.beginPath();
    ctx.arc(ix, iy, 13, 0, Math.PI * 2);
    ctx.fill();

    // Inner bullet hole chip
    ctx.fillStyle = shot.hit ? '#0f172a' : '#450a0a';
    ctx.strokeStyle = shot.hit ? '#38bdf8' : '#fb7185';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(ix, iy, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Shot sequence number 1..5
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(shot.shotNumber), ix, iy + 0.5);
  }

  // Plot Legend Strip at Bottom of Target Box
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(summary.plateLegend, cx, plotY + plotH - 12);

  // 4. Right Column: Quantitative Ballistic Scorecard Cards
  const colX = 700;
  const colW = W - colX - 44;
  let cardY = 144;
  const rowH = 57;
  const rowGap = 9;

  for (const row of summary.metrics) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fillRect(colX, cardY, colW, rowH);

    const accentStroke =
      row.accent === 'cyan'
        ? 'rgba(56, 189, 248, 0.55)'
        : row.accent === 'amber'
          ? 'rgba(251, 191, 36, 0.55)'
          : row.accent === 'emerald'
            ? 'rgba(52, 211, 153, 0.55)'
            : 'rgba(148, 163, 184, 0.24)';

    ctx.strokeStyle = accentStroke;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(colX, cardY, colW, rowH);

    // Accent bar on left edge
    ctx.fillStyle = accentStroke;
    ctx.fillRect(colX, cardY, 4, rowH);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11.5px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(row.label, colX + 16, cardY + 10);

    ctx.fillStyle =
      row.accent === 'cyan'
        ? '#38bdf8'
        : row.accent === 'amber'
          ? '#fbbf24'
          : row.accent === 'emerald'
            ? '#34d399'
            : '#f8fafc';
    ctx.font = '800 16.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(row.value, colX + 16, cardY + 29);

    cardY += rowH + rowGap;
  }

  // 5. Footer Telemetry Stamp
  ctx.fillStyle = '#64748b';
  ctx.font = '600 11.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(summary.footerNote, 44, H - 30);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(
    isZh ? 'DIGITAL ARMORY 3D · 开源轻武器机械博物馆' : 'DIGITAL ARMORY 3D · OPEN-SOURCE MUSEUM',
    W - 44,
    H - 30
  );

  return summary;
}

/**
 * Generates and downloads a 1200×800 PNG Range Target Card in the browser.
 * Returns `true` when export succeeds, `false` in SSR or non-canvas environments.
 */
export function downloadRangeTargetCardPng(
  input: TargetCardRenderInput
): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_CARD_WIDTH;
  canvas.height = TARGET_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const summary = renderRangeTargetCardCanvas(ctx, input);
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = summary.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}
