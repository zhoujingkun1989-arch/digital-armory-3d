import type { WeaponId, WeaponPartSpec } from '../../weapons/types';
import {
  FIELD_STRIP_PLANS,
  type FieldStripPartMotionBinding,
  type FieldStripStepSpec,
  type FieldStripWeaponPlan,
} from './fieldStripSpecs';

export type DisassemblyTier = 'field' | 'detail';

const BASE_CHASSIS_SKIP_PATTERN =
  /^(?:.*_v3_|hull_box$|hull_armor$|hull_shell$|receiver$)/i;

function groupBucketForPart(part: WeaponPartSpec): string {
  if (part.group === 'magazine') return 'magazine';
  if (part.group === 'fire_control') return 'fire_control';
  if (part.group === 'slide') return 'slide';
  return 'frame';
}

const BUCKET_META: Readonly<
  Record<
    string,
    {
      titleZh: string;
      titleEn: string;
      hintZh: string;
      hintEn: string;
    }
  >
> = {
  slide: {
    titleZh: '精密闭锁与复进运动组件深拆',
    titleEn: 'Detail Overhaul · Recoil & Locking Group',
    hintZh: '拆解核心闭锁件、导气/复进弹簧与精密导向机构。',
    hintEn:
      'Extract locking pins, recoil springs, and internal action sub-assemblies.',
  },
  fire_control: {
    titleZh: '火控击发与光电/动力包深拆',
    titleEn: 'Detail Overhaul · Fire-Control & Core Assembly',
    hintZh: '依次退出阻铁、击锤、击针或车体内构动力/观瞄组件。',
    hintEn:
      'Remove sear, hammer, firing-pin, or internal powerpack and optic modules.',
  },
  magazine: {
    titleZh: '供弹具 / 托弹板与自动装弹机深拆',
    titleEn: 'Detail Overhaul · Feed & Magazine Internals',
    hintZh: '分解托弹弹簧、供弹导轨及弹药舱次级运动件。',
    hintEn:
      'Strip feed followers, coil springs, and secondary ammunition feed hardware.',
  },
  frame: {
    titleZh: '外挂护木 / 装甲附件与机匣销轴深拆',
    titleEn: 'Detail Overhaul · Chassis Hardware & Auxiliary Fittings',
    hintZh: '卸除护木、托组件、销轴卡笋或外部附加防御模块。',
    hintEn:
      'Detach handguards, stock assemblies, chassis pins, or external armor fittings.',
  },
};

/**
 * Generates an extended Depot / Armorer-Grade `Detail Strip` DAG on top of
 * any exhibit's verified `FIELD_STRIP_PLANS[weaponId]` without mutating the
 * curated Field-Strip DAG or introducing cycles.
 */
export function buildDetailStripPlan(
  weaponId: WeaponId,
  parts: readonly WeaponPartSpec[]
): FieldStripWeaponPlan {
  const basePlan = FIELD_STRIP_PLANS[weaponId];
  const baseSteps: FieldStripStepSpec[] = basePlan.steps.map((step) => ({
    ...step,
    requires: [...step.requires],
    triggerPartIds: [...step.triggerPartIds],
    bindings: step.bindings.map((b) => ({
      partId: b.partId,
      explodeStepIndices: [...b.explodeStepIndices],
    })),
  }));

  const coveredParts = new Set<string>();
  for (const s of baseSteps) {
    for (const pId of s.triggerPartIds) coveredParts.add(pId);
    for (const b of s.bindings) coveredParts.add(b.partId);
  }

  // Group uncovered movable parts into crisp detail-overhaul batches of <= 3
  const remainingByBucket = new Map<string, WeaponPartSpec[]>();
  for (const part of parts) {
    if (coveredParts.has(part.id)) continue;
    if (!part.explodeSteps || part.explodeSteps.length === 0) continue;
    if (BASE_CHASSIS_SKIP_PATTERN.test(part.id)) continue;
    const bucket = groupBucketForPart(part);
    const list = remainingByBucket.get(bucket);
    if (list) list.push(part);
    else remainingByBucket.set(bucket, [part]);
  }

  // Detail stages unlock cleanly after the initial primary field-strip steps complete
  const anchorReqIds =
    baseSteps.length > 0 ? [baseSteps[baseSteps.length - 1].id] : [];
  let prevDetailId: string | null = anchorReqIds[0] ?? null;
  let seqNum = baseSteps.length + 1;

  const extraSteps: FieldStripStepSpec[] = [];
  const bucketOrder = ['slide', 'fire_control', 'magazine', 'frame'];

  for (const bucket of bucketOrder) {
    const bucketParts = remainingByBucket.get(bucket);
    if (!bucketParts || bucketParts.length === 0) continue;
    const meta = BUCKET_META[bucket] ?? BUCKET_META.frame;

    for (let offset = 0; offset < bucketParts.length; offset += 3) {
      const slice = bucketParts.slice(offset, offset + 3);
      const stepId = `${weaponId}_detail_${bucket}_${Math.floor(offset / 3) + 1}`;
      const leadPart = slice[0];
      const leadNameZh = leadPart.nameZh.split('（')[0].trim();
      const leadNameEn = leadPart.nameEn.split('(')[0].trim();
      const bindings: FieldStripPartMotionBinding[] = slice.map((p) => ({
        partId: p.id,
        explodeStepIndices: p.explodeSteps.map((_, idx) => idx),
      }));
      const triggerPartIds = slice.map((p) => p.id);
      const orderStr = String(seqNum).padStart(2, '0');
      seqNum += 1;

      extraSteps.push({
        id: stepId,
        orderLabel: orderStr,
        titleZh:
          slice.length === 1
            ? `${meta.titleZh}：${leadNameZh}`
            : `${meta.titleZh}（${leadNameZh} 等 ${slice.length} 件）`,
        titleEn:
          slice.length === 1
            ? `${meta.titleEn}: ${leadNameEn}`
            : `${meta.titleEn} (${leadNameEn} +${slice.length - 1})`,
        actionHintZh: meta.hintZh,
        actionHintEn: meta.hintEn,
        requires: prevDetailId ? [prevDetailId] : [],
        stripBlockedNoteZh:
          '所选全拆组件需待前序一级快拆与相邻约束零件卸载后方可取出。',
        stripBlockedNoteEn:
          'Complete preceding field-strip and overlapping overhaul stages before removing this sub-assembly.',
        reassembleBlockedNoteZh:
          '请按军械所逆序装回后续细部零件，再复位本层级基准件。',
        reassembleBlockedNoteEn:
          'Reinstall downstream detail-overhaul assemblies in reverse order before seating this layer.',
        triggerPartIds,
        bindings,
      });

      prevDetailId = stepId;
    }
  }

  return {
    weaponId,
    manualCodeZh: `${basePlan.manualCodeZh.split('·')[0].trim()} · 军械所级全拆 (${baseSteps.length + extraSteps.length} 步)`,
    manualCodeEn: `${basePlan.manualCodeEn.split('·')[0].trim()} · Armorer Detail Strip (${baseSteps.length + extraSteps.length} Steps)`,
    steps: [...baseSteps, ...extraSteps],
  };
}
