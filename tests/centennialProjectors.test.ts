import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FieldStripStepSpec } from '../src/engine/fieldstrip/fieldStripSpecs';
import { HISTORY_TIMELINE_NODES } from '../src/features/timeline/historyTimelineSpecs';
import { CENTENNIAL_BLUEPRINT_MAP } from '../src/weapons/expansion/centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  centennialPartId,
  computeCentennialPartLayout,
  type CentennialPartSlot,
} from '../src/weapons/expansion/centennialLayoutMath';
import {
  CENTENNIAL_TANK_IDS,
  buildCentennialArmorySortMeta,
  buildCentennialAttachmentSpecs,
  buildCentennialBallisticsConfigs,
  buildCentennialCaliperBenchmarks,
  buildCentennialCausalityDefaults,
  buildCentennialDirectorProfiles,
  buildCentennialDkEditorialData,
  buildCentennialEnFallbacks,
  buildCentennialFieldStripPlans,
  buildCentennialFiringTimings,
  buildCentennialGasFlowConfigs,
  buildCentennialGasManifolds,
  buildCentennialInteractionSpecs,
  buildCentennialMagazineStackSpecs,
  buildCentennialMalfunctionProfiles,
  buildCentennialManifests,
  buildCentennialRecoilSpecs,
  buildCentennialRiflingSpecs,
  buildCentennialScaleWallMetrology,
  buildCentennialTankCrewSpecs,
  buildCentennialTechDossierProvenance,
  buildCentennialTimelineNodes,
  buildCentennialTurntableMetrics,
} from '../src/weapons/expansion/centennialProjectors';
import { CENTENNIAL_66_IDS } from '../src/weapons/expansion/centennialTypes';

const CJK_OR_FULLWIDTH_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

function assertCleanEn(value: string, ctx: string): void {
  expect(value.trim().length, `Empty EN string at ${ctx}`).toBeGreaterThan(0);
  expect(CJK_OR_FULLWIDTH_RE.test(value), `EN CJK/fullwidth at ${ctx}: ${value}`).toBe(
    false
  );
  expect(WP_JARGON_RE.test(value), `WP leak in EN at ${ctx}: ${value}`).toBe(false);
}

function assertCleanZh(value: string, ctx: string): void {
  expect(value.trim().length, `Empty ZH string at ${ctx}`).toBeGreaterThan(0);
  expect(WP_JARGON_RE.test(value), `WP leak in ZH at ${ctx}: ${value}`).toBe(false);
}

function validPartsFor(id: string): Set<string> {
  return new Set(CENTENNIAL_PART_SLOTS.map((s) => centennialPartId(id, s)));
}

function assertAcyclicDag(steps: readonly FieldStripStepSpec[]): void {
  const byId = new Map<string, FieldStripStepSpec>();
  for (const s of steps) {
    expect(byId.has(s.id)).toBe(false);
    byId.set(s.id, s);
  }
  const state = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string): void => {
    const cur = state.get(id);
    if (cur === 'visited') return;
    expect(cur).not.toBe('visiting');
    state.set(id, 'visiting');
    const step = byId.get(id);
    expect(step).toBeDefined();
    for (const req of step!.requires) {
      expect(byId.has(req)).toBe(true);
      visit(req);
    }
    state.set(id, 'visited');
  };
  for (const s of steps) visit(s.id);
}

describe('100-Weapon Expansion Phase 2I — Pure Acyclic Centennial Registry Projectors', () => {
  it('enforces strict acyclicity (zero runtime imports outside src/weapons/expansion/)', () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/weapons/expansion/centennialProjectors.ts'
      ),
      'utf8'
    );
    const runtimeImportSpecifiers = [
      ...src.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
    ].map((m) => m[1]);

    expect(runtimeImportSpecifiers.length).toBeGreaterThan(0);
    for (const spec of runtimeImportSpecifiers) {
      expect(
        spec.startsWith('./'),
        `Forbidden external runtime import "${spec}" in centennialProjectors.ts`
      ).toBe(true);
    }
  });

  it('projects exact 66/66 manifests, EN fallbacks, rifling, recoil, scale wall, caliper, director, timeline, provenance, sort meta & timings with 0 EN CJK & 0 WP-XX', () => {
    const manifests = buildCentennialManifests();
    const enFallbacks = buildCentennialEnFallbacks();
    const rifling = buildCentennialRiflingSpecs();
    const recoil = buildCentennialRecoilSpecs();
    const scaleWall = buildCentennialScaleWallMetrology();
    const calipers = buildCentennialCaliperBenchmarks();
    const directors = buildCentennialDirectorProfiles();
    const timeline = buildCentennialTimelineNodes();
    const provenance = buildCentennialTechDossierProvenance();
    const sortMeta = buildCentennialArmorySortMeta();
    const timings = buildCentennialFiringTimings();

    expect(manifests).toHaveLength(66);
    expect(timeline).toHaveLength(66);

    const years = timeline.map((n) => n.year);
    expect(Math.min(...years)).toBe(1415);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2022);

    // Combined 100-node chronological DAG lookup (34 flagship + 66 centennial)
    const combinedYearById = new Map<string, number>();
    for (const fn of HISTORY_TIMELINE_NODES) {
      combinedYearById.set(fn.weaponId, fn.year);
    }
    for (const cn of timeline) {
      combinedYearById.set(cn.weaponId, cn.year);
    }
    expect(combinedYearById.size).toBe(100);

    CENTENNIAL_66_IDS.forEach((id, idx) => {
      const partSet = validPartsFor(id);
      const bp = CENTENNIAL_BLUEPRINT_MAP[id];

      // 1. Manifest
      const m = manifests[idx];
      expect(m.id as string).toBe(id);
      expect(m.orderIndex).toBe(35 + idx);
      expect(m.atlasHeadingCn).toContain('Packed ORM');
      expect(m.catalog.partsCount).toBe(20);
      expect(m.catalog.assembliesCount).toBe(4);
      expect(m.catalog.firingStagesCount).toBe(7);
      expect(m.catalog.specs1To1.overallLengthMm).toContain('mm');
      expect(m.catalog.specs1To1.emptyWeightKg).toContain('kg');
      expect(m.catalog.specs1To1.muzzleVelocityMs).toContain('m/s');
      expect(m.catalog.specs1To1.effectiveRangeM).toContain('m');
      expect(m.workbenchMeta.cutawayFocusPartId).toBe(centennialPartId(id, 'bolt'));
      expect(partSet.has(m.workbenchMeta.cutawayFocusPartId)).toBe(true);
      for (const preset of Object.values(m.cameraPresets)) {
        for (const n of [...preset.pos, ...preset.target]) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }

      // 2. EN fallback
      const fb = enFallbacks[id];
      expect(fb).toBeDefined();
      assertCleanEn(fb.shortLabel, `fb.${id}.shortLabel`);
      assertCleanEn(fb.name, `fb.${id}.name`);
      assertCleanEn(fb.originCountry, `fb.${id}.originCountry`);
      assertCleanEn(fb.weaponType, `fb.${id}.weaponType`);
      assertCleanEn(fb.statusLabel, `fb.${id}.statusLabel`);
      assertCleanEn(fb.actionMechanism, `fb.${id}.actionMechanism`);
      assertCleanEn(fb.overallLengthMm, `fb.${id}.overallLengthMm`);
      assertCleanEn(fb.barrelSpec, `fb.${id}.barrelSpec`);
      assertCleanEn(fb.rateOfFire, `fb.${id}.rateOfFire`);
      assertCleanEn(fb.description, `fb.${id}.description`);
      assertCleanEn(fb.workbenchTitle, `fb.${id}.workbenchTitle`);
      assertCleanEn(fb.workbenchSubtitle, `fb.${id}.workbenchSubtitle`);
      assertCleanEn(fb.cutawayLabel, `fb.${id}.cutawayLabel`);
      assertCleanEn(fb.cutawayTitle, `fb.${id}.cutawayTitle`);
      assertCleanEn(fb.searchPlaceholder, `fb.${id}.searchPlaceholder`);
      assertCleanEn(fb.firingMilestoneLabel, `fb.${id}.firingMilestoneLabel`);
      fb.highlights.forEach((h, hi) => assertCleanEn(h, `fb.${id}.hl[${hi}]`));

      // 3. Rifling
      const r = rifling[id];
      expect(r).toBeDefined();
      assertCleanEn(r.labelEn, `rifling.${id}.labelEn`);
      assertCleanZh(r.labelZh, `rifling.${id}.labelZh`);
      expect(r.grooves).toBeGreaterThanOrEqual(0);
      expect(r.twistInches).toBeGreaterThanOrEqual(0);
      expect(r.twistMm).toBeGreaterThanOrEqual(0);

      // 4. Recoil
      const rec = recoil[id];
      expect(rec.platformMassKg).toBeGreaterThan(0);
      expect(rec.boreAxisMm).toBeGreaterThan(0);
      expect(rec.basePulseDurationMs).toBeGreaterThan(0);
      expect(rec.climbCoupling).toBeGreaterThan(0);

      // 5. Scale wall metrology
      const sw = scaleWall[id];
      expect(sw.oalMm).toBeGreaterThan(100);
      expect(sw.massKg).toBeGreaterThan(0.4);
      assertCleanEn(sw.caliberEn, `scaleWall.${id}.caliberEn`);

      // 6. Caliper benchmarks
      const cal = calipers[id];
      expect(cal.map((c) => c.kind)).toEqual([
        'overall_envelope',
        'barrel_length',
        'bolt_lug_span',
      ]);
      for (const c of cal) {
        expect(c.nominalMm).toBeGreaterThan(0);
        assertCleanEn(c.labelEn, `caliper.${id}.${c.kind}.en`);
        assertCleanZh(c.labelZh, `caliper.${id}.${c.kind}.zh`);
      }
      if (bp.category === 'shotgun' && bp.rifling.profile === 'smoothbore') {
        expect(cal[1].labelZh).toContain('滑膛');
        expect(cal[1].labelEn).toContain('Smoothbore');
      }

      // 7. Director profiles
      const dir = directors[id];
      for (const pid of [...dir.actFocusParts, ...dir.breakthroughParts]) {
        expect(partSet.has(pid), `Unknown director part "${pid}" on ${id}`).toBe(
          true
        );
      }

      // 8. Timeline node — strictly chronological DAG across all 100 exhibits
      const tn = timeline[idx];
      expect(tn.weaponId).toBe(id);
      expect(tn.ancestors).not.toContain(id);
      for (const anc of tn.ancestors) {
        const ancYear = combinedYearById.get(anc);
        expect(ancYear, `Unknown timeline ancestor "${anc}" on ${id}`).toBeDefined();
        expect(
          ancYear!,
          `Backwards timeline ancestor "${anc}" (${ancYear}) on ${id} (${tn.year})`
        ).toBeLessThanOrEqual(tn.year);
      }
      assertCleanEn(tn.designerEn, `timeline.${id}.designerEn`);
      assertCleanEn(tn.innovationEn, `timeline.${id}.innovationEn`);
      assertCleanZh(tn.designerZh, `timeline.${id}.designerZh`);
      assertCleanZh(tn.innovationZh, `timeline.${id}.innovationZh`);

      // 9. Provenance
      const prov = provenance[id];
      expect(prov.year).toBeGreaterThanOrEqual(1415);
      assertCleanEn(prov.manufacturerEn, `prov.${id}.manufacturerEn`);
      assertCleanZh(prov.manufacturerZh, `prov.${id}.manufacturerZh`);

      // 10. Sort metadata
      expect(sortMeta.years[id]).toBe(prov.year);
      expect(sortMeta.filters[id]).toBeTruthy();

      // 11. Firing timings
      const tm = timings[id];
      expect(tm.ignitionF).toBeGreaterThan(0);
      expect(tm.muzzleExitF).toBeGreaterThan(tm.ignitionF);
      expect(tm.ejectF).toBeGreaterThan(tm.muzzleExitF);
      expect(tm.batteryF).toBeGreaterThan(tm.ejectF);
      expect(tm.batteryF).toBeLessThan(1);
    });
  });

  it('projects 66 acyclic 5-step Field-Strip DAGs, Malfunctions, Attachments, Magazine Stacks, Causality, Turntable, Gas Manifolds, Interaction, Ballistics, GasFlow, DK Editorial & 4/4 MBT Tank Crew specs', () => {
    const fieldStrip = buildCentennialFieldStripPlans();
    const malfunctions = buildCentennialMalfunctionProfiles();
    const attachments = buildCentennialAttachmentSpecs();
    const magStacks = buildCentennialMagazineStackSpecs();
    const causality = buildCentennialCausalityDefaults();
    const turntables = buildCentennialTurntableMetrics();
    const gasManifolds = buildCentennialGasManifolds();
    const interaction = buildCentennialInteractionSpecs();
    const ballistics = buildCentennialBallisticsConfigs();
    const gasFlow = buildCentennialGasFlowConfigs();
    const dkEditorial = buildCentennialDkEditorialData();
    const tankCrew = buildCentennialTankCrewSpecs();

    for (const id of CENTENNIAL_66_IDS) {
      const partSet = validPartsFor(id);
      const bp = CENTENNIAL_BLUEPRINT_MAP[id];
      const layout = computeCentennialPartLayout(bp);

      // 12A. Acyclic 5-step Field-Strip DAG covering 15 moving parts disjointly
      // (`receiver` remains fixed non-strip chassis; 4 internal FCG parts defer to Detail-Strip)
      const plan = fieldStrip[id];
      expect(plan.steps).toHaveLength(5);
      assertAcyclicDag(plan.steps);
      assertCleanEn(plan.manualCodeEn, `fs.${id}.manualCodeEn`);
      assertCleanZh(plan.manualCodeZh, `fs.${id}.manualCodeZh`);

      const claimedBindings = new Set<string>();
      const receiverId = centennialPartId(id, 'receiver');
      for (const step of plan.steps) {
        assertCleanEn(step.titleEn, `fs.${id}.${step.id}.titleEn`);
        assertCleanZh(step.titleZh, `fs.${id}.${step.id}.titleZh`);
        assertCleanEn(step.actionHintEn, `fs.${id}.${step.id}.hintEn`);
        assertCleanZh(step.actionHintZh, `fs.${id}.${step.id}.hintZh`);
        if (step.requires.length > 0) {
          assertCleanEn(step.stripBlockedNoteEn, `fs.${id}.${step.id}.stripEn`);
          assertCleanZh(step.stripBlockedNoteZh, `fs.${id}.${step.id}.stripZh`);
        }
        for (const trig of step.triggerPartIds) {
          expect(partSet.has(trig), `Bad triggerPartId ${trig}`).toBe(true);
          expect(trig, `Stationary receiver must not be a Field-Strip trigger on ${id}`).not.toBe(
            receiverId
          );
        }
        for (const b of step.bindings) {
          expect(partSet.has(b.partId), `Bad binding partId ${b.partId}`).toBe(true);
          expect(b.partId, `Stationary receiver must not be bound in Field-Strip on ${id}`).not.toBe(
            receiverId
          );
          const slot = b.partId.slice(id.length + 1) as CentennialPartSlot;
          const off = layout.explodeOffset[slot];
          expect(
            Math.hypot(off[0], off[1], off[2]),
            `Bound Field-Strip part ${b.partId} must have non-zero explodeOffset`
          ).toBeGreaterThan(0.5);
          expect(b.explodeStepIndices.length).toBeGreaterThan(0);
          for (const idx of b.explodeStepIndices) {
            const key = `${b.partId}#${idx}`;
            expect(claimedBindings.has(key), `Duplicate binding ${key}`).toBe(false);
            claimedBindings.add(key);
          }
        }
      }
      expect(claimedBindings.size).toBe(15);

      // 12B. Malfunction profiles
      const malf = malfunctions[id];
      for (const pid of [
        ...malf.actionPartIds,
        ...malf.lockingPartIds,
        malf.extractorPartId,
        ...malf.fireControlPartIds,
        ...malf.magazinePartIds,
      ]) {
        expect(partSet.has(pid), `Bad malfunction part ${pid}`).toBe(true);
      }

      // 13A. Attachment specs
      const att = attachments[id];
      expect(att.modelScale).toBeGreaterThan(0);
      if (att.muzzleCompatibilityNoteEn) {
        assertCleanEn(att.muzzleCompatibilityNoteEn, `att.${id}.muzzleNoteEn`);
      }
      if (att.opticCompatibilityNoteEn) {
        assertCleanEn(att.opticCompatibilityNoteEn, `att.${id}.opticNoteEn`);
      }
      for (const pid of [...att.muzzleReplacedPartIds, ...att.opticReplacedPartIds]) {
        expect(partSet.has(pid)).toBe(true);
      }

      // 13B. Magazine stack specs
      const stack = magStacks[id];
      expect(partSet.has(stack.magBodyPartId)).toBe(true);
      expect(partSet.has(stack.followerPartId)).toBe(true);
      if (stack.roundCount > 0) {
        expect(stack.slots).toHaveLength(stack.roundCount + 1);
      } else {
        expect(stack.slots).toHaveLength(0);
      }

      // 13C. Causality nominal RPM
      expect(causality[id]).toBeGreaterThan(0);

      // 13D. Turntable bounds
      const tt = turntables[id];
      expect(tt.spanX).toBeGreaterThan(0);
      expect(tt.maxY).toBeGreaterThan(tt.minY);
      expect(tt.explode58.spanX).toBeGreaterThanOrEqual(tt.spanX);

      // 13E. Gas manifold
      const gm = gasManifolds[id];
      expect(Number.isFinite(gm.chamberX)).toBe(true);
      expect(Number.isFinite(gm.muzzleX)).toBe(true);
      assertCleanEn(gm.familyTitleEn, `gm.${id}.titleEn`);
      assertCleanEn(gm.flowNoteEn, `gm.${id}.noteEn`);

      // 13F. Interaction specs
      const actParts = interaction.explicitActionParts[id];
      expect(actParts.length).toBeGreaterThan(0);
      for (const pid of actParts) {
        expect(partSet.has(pid)).toBe(true);
      }
      const drag = interaction.dragSpecs[id];
      assertCleanEn(drag.labelEn, `drag.${id}.labelEn`);
      assertCleanZh(drag.labelZh, `drag.${id}.labelZh`);

      // 13G. Ballistics round fit & muzzle devices
      expect(ballistics.roundFit[id].roundScale).toBeGreaterThan(0);
      expect(ballistics.muzzleDevices[id].forwardDamp).toBeGreaterThan(0);

      // 13I. DK Editorial Data (all 5 maps — monotonic 4-digit years & domain-clean archery copy)
      const evo = dkEditorial.evolutionTimelineSeeds[id];
      expect(evo).toHaveLength(5);
      expect(evo.filter((n) => n.eraRelation === 'current')).toHaveLength(1);
      let prevEvoYear = 0;
      for (const n of evo) {
        expect(n.year).toMatch(/^\d{4}$/);
        const yrNum = Number(n.year);
        expect(yrNum).toBeGreaterThanOrEqual(prevEvoYear);
        prevEvoYear = yrNum;
        assertCleanEn(n.name.en, `dk.evo.${id}.name.en`);
        assertCleanEn(n.subtitle.en, `dk.evo.${id}.sub.en`);
        assertCleanZh(n.name.zh, `dk.evo.${id}.name.zh`);
        assertCleanZh(n.subtitle.zh, `dk.evo.${id}.sub.zh`);
      }
      for (const mapName of [
        'fcgLoupeOverrides',
        'breechLoupeOverrides',
        'slideLoupeOverrides',
        'magLoupeOverrides',
      ] as const) {
        const entry = dkEditorial[mapName][id];
        assertCleanEn(entry.title.en, `dk.${mapName}.${id}.title.en`);
        assertCleanEn(entry.caption.en, `dk.${mapName}.${id}.caption.en`);
        assertCleanZh(entry.title.zh, `dk.${mapName}.${id}.title.zh`);
        assertCleanZh(entry.caption.zh, `dk.${mapName}.${id}.caption.zh`);
        if (bp.category === 'archery') {
          expect(entry.caption.zh).not.toMatch(/枪管|弹匣|火药/);
          expect(entry.caption.en.toLowerCase()).not.toMatch(
            /gunpowder|brass case|chamber pressure|barrel/
          );
        }
      }
    }

    // 13H. GasFlow heavy profiles: all 4 new MBTs + m61vulcan rotary halo + heavy shockwaves
    expect(Object.keys(gasFlow.tankBoreEvacuators).sort()).toEqual(
      [...CENTENNIAL_TANK_IDS].sort()
    );
    expect(gasFlow.rotaryBlurs.m61vulcan?.barrelCount).toBe(6);
    expect(gasFlow.rotaryBlurs.m61vulcan?.cyclicRpm).toBe(6000);
    expect(gasFlow.muzzleShockwaves.m777?.isHeavyHangar).toBe(true);
    expect(gasFlow.muzzleShockwaves.m2hb?.maxRadiusCm).toBeGreaterThan(40);

    // 13J. Tank Crew specs for all 4 new 1:1 MBTs
    for (const tankId of CENTENNIAL_TANK_IDS) {
      const partSet = validPartsFor(tankId);
      const kin = tankCrew.kinematics[tankId];
      const opt = tankCrew.gunnerOptics[tankId];
      expect(kin).toBeDefined();
      expect(opt).toBeDefined();
      assertCleanEn(kin.sightNameEn, `tank.${tankId}.sightNameEn`);
      assertCleanZh(kin.sightNameZh, `tank.${tankId}.sightNameZh`);
      assertCleanEn(opt.designationEn, `tank.${tankId}.designationEn`);
      assertCleanZh(opt.designationZh, `tank.${tankId}.designationZh`);
      if (opt.museumStudyThermalNoteEn) {
        assertCleanEn(opt.museumStudyThermalNoteEn, `tank.${tankId}.thermalEn`);
      }
      for (const pid of kin.turretPartIds) {
        expect(partSet.has(pid)).toBe(true);
      }
      for (const pid of kin.gunPartIds) {
        expect(kin.turretPartIds.has(pid)).toBe(true);
      }
    }
  });
});
