import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCaliberGeometries,
} from '../src/engine/actors/BallisticsSystem';
import {
  buildDetailedMagazineCartridgeGeometries,
  getMagazineCartridgeMaterialPreset,
} from '../src/engine/actors/MagazineAmmoStack';
import {
  shouldShowInteractiveHandleSheen,
} from '../src/engine/actors/PartActor';
import {
  MAGAZINE_STACK_SPECS,
  SCULPTURAL_AMMO_EXHIBITS,
  createMutableMagazineRoundPose,
  evaluateMagazineRoundSlotInto,
} from '../src/engine/ballistics/magazineStackSpecs';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  WEAPON_ACTION_DRAG_SPECS,
  beginManualActionRack,
  canDragActionHandleNow,
  getCursorForPartHover,
  getWeaponActionDragSpec,
  getWeaponActionPartIds,
  interactiveActionStore,
  isWeaponActionPart,
  projectWorldDragAxisToScreen,
  releaseManualActionRack,
  resolveActionWorldDragAxis,
  stepInteractiveAction,
  updateManualActionRack,
} from '../src/engine/interaction/InteractiveActionController';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import {
  WEAPON_IDS,
  type CaliberProfile,
  type WeaponId,
} from '../src/weapons/types';

function computeSignedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const index = geo.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let sum = 0;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(pos, index.getX(i));
      b.fromBufferAttribute(pos, index.getX(i + 1));
      c.fromBufferAttribute(pos, index.getX(i + 2));
      cross.crossVectors(b, c);
      sum += a.dot(cross);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      cross.crossVectors(b, c);
      sum += a.dot(cross);
    }
  }
  return sum / 6;
}

function assertFiniteUnitNormals(
  geo: THREE.BufferGeometry,
  label: string
): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  expect(pos, `${label}: missing position attribute`).toBeDefined();
  expect(norm, `${label}: missing normal attribute`).toBeDefined();
  expect(pos.count, `${label}: empty vertex buffer`).toBeGreaterThan(12);

  for (let i = 0; i < pos.count; i++) {
    expect(Number.isFinite(pos.getX(i)), `${label} pos.x[${i}]`).toBe(true);
    expect(Number.isFinite(pos.getY(i)), `${label} pos.y[${i}]`).toBe(true);
    expect(Number.isFinite(pos.getZ(i)), `${label} pos.z[${i}]`).toBe(true);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    expect(Number.isFinite(nx), `${label} norm.x[${i}]`).toBe(true);
    expect(Number.isFinite(ny), `${label} norm.y[${i}]`).toBe(true);
    expect(Number.isFinite(nz), `${label} norm.z[${i}]`).toBe(true);
    const len = Math.hypot(nx, ny, nz);
    expect(len, `${label} norm length at ${i}`).toBeGreaterThan(0.95);
    expect(len, `${label} norm length at ${i}`).toBeLessThan(1.05);
  }
}

function extractUseFrameBodies(source: string): string[] {
  const bodies: string[] = [];
  const needle = 'useFrame(';
  let idx = 0;
  while (true) {
    const start = source.indexOf(needle, idx);
    if (start === -1) break;
    const arrow = source.indexOf('=>', start);
    const braceStart = source.indexOf('{', arrow);
    if (arrow === -1 || braceStart === -1) break;
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    bodies.push(source.slice(braceStart, end + 1));
    idx = end + 1;
  }
  return bodies;
}

describe('Cycle 5A: 34-Exhibit Direct 3D Interaction, Handle Sheen & Cutaway Cartridge Craft', () => {
  beforeEach(() => {
    useAppStore.getState().returnToArmory();
    useAppStore.getState().setSfxMuted(true);
    interactiveActionStore.reset('ak15');
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, false);
  });

  it('defines valid interactive grab handles, unit 3D drag axes, and finite screen projections for all 34 exhibits', async () => {
    expect(Object.keys(WEAPON_ACTION_DRAG_SPECS)).toHaveLength(
      WEAPON_IDS.length
    );

    // Side-profile museum camera + foreshortened bore-axis camera
    const sideCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 2000);
    sideCam.position.set(0, 6, 45);
    sideCam.lookAt(0, 0, 0);
    sideCam.updateMatrixWorld(true);
    sideCam.updateProjectionMatrix();

    const boreCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 2000);
    boreCam.position.set(45, 0, 0);
    boreCam.lookAt(0, 0, 0);
    boreCam.updateMatrixWorld(true);
    boreCam.updateProjectionMatrix();

    const outXY: [number, number] = [0, 0];
    const CJK_RE = /[\u4e00-\u9fff]/;

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const partIds = new Set(plugin.parts.map((p) => p.id));
      const spec = getWeaponActionDragSpec(weaponId);
      expect(spec.weaponId).toBe(weaponId);
      expect(spec.labelZh.trim().length).toBeGreaterThan(2);
      expect(spec.labelEn.trim().length).toBeGreaterThan(2);
      expect(CJK_RE.test(spec.labelEn), `${weaponId} EN label has CJK`).toBe(
        false
      );
      expect(spec.strokeSpanScale).toBeGreaterThan(0.5);
      expect(spec.strokeSpanScale).toBeLessThan(2.0);
      expect(spec.springReturnRate).toBeGreaterThan(6);
      expect(spec.detentThresholds.length).toBeGreaterThanOrEqual(2);

      // Detents must be strictly ascending inside (0, 1)
      for (let i = 0; i < spec.detentThresholds.length; i++) {
        expect(spec.detentThresholds[i]).toBeGreaterThan(0.1);
        expect(spec.detentThresholds[i]).toBeLessThan(0.98);
        if (i > 0) {
          expect(spec.detentThresholds[i]).toBeGreaterThan(
            spec.detentThresholds[i - 1]
          );
        }
      }

      // Base world drag axis must be unit length
      const len = Math.hypot(
        spec.worldDragAxis[0],
        spec.worldDragAxis[1],
        spec.worldDragAxis[2]
      );
      expect(len, `${weaponId} worldDragAxis unit length`).toBeCloseTo(1, 5);

      // Every action part ID must exist in BOM & project to finite unit screen axis
      const actionIds = getWeaponActionPartIds(weaponId);
      expect(actionIds.length).toBeGreaterThanOrEqual(1);
      for (const pid of actionIds) {
        expect(partIds.has(pid), `${weaponId}:${pid} missing from BOM`).toBe(
          true
        );
        expect(isWeaponActionPart(weaponId, pid)).toBe(true);

        const axis = resolveActionWorldDragAxis(weaponId, pid);
        expect(Math.hypot(axis[0], axis[1], axis[2])).toBeCloseTo(1, 5);

        projectWorldDragAxisToScreen(axis, sideCam, 1920, 1080, outXY);
        expect(Number.isFinite(outXY[0])).toBe(true);
        expect(Number.isFinite(outXY[1])).toBe(true);
        expect(Math.hypot(outXY[0], outXY[1])).toBeCloseTo(1, 5);

        projectWorldDragAxisToScreen(axis, boreCam, 1920, 1080, outXY);
        expect(Number.isFinite(outXY[0])).toBe(true);
        expect(Number.isFinite(outXY[1])).toBe(true);
        expect(Math.hypot(outXY[0], outXY[1])).toBeCloseTo(1, 5);
      }

      // Every per-part axis override must reference a real part in the exhibit BOM
      if (spec.partAxisOverrides) {
        for (const [overridePartId, vec] of Object.entries(
          spec.partAxisOverrides
        )) {
          expect(
            partIds.has(overridePartId),
            `${weaponId} override part ${overridePartId} missing from BOM`
          ).toBe(true);
          expect(Math.hypot(vec[0], vec[1], vec[2])).toBeCloseTo(1, 5);
        }
      }
    }

    // Verify false-positive static fasteners/sears/bolts are strictly excluded
    expect(isWeaponActionPart('rem870', 'rem870_stock_bolt')).toBe(false);
    expect(isWeaponActionPart('python', 'python_cylinder_bolt')).toBe(false);
    expect(isWeaponActionPart('m249', 'm249_open_bolt_sear')).toBe(false);
    expect(isWeaponActionPart('r500', 'r500_carbon_bolt')).toBe(false);

    // Verify distinct biomechanical axes for special mechanisms
    expect(
      resolveActionWorldDragAxis('winchester1894', 'win94_lever')[1]
    ).toBeLessThan(-0.7);
    expect(
      resolveActionWorldDragAxis('winchester1894', 'win94_breech_bolt')[0]
    ).toBeCloseTo(-1, 5);
    expect(resolveActionWorldDragAxis('p08', 'p08_rear_toggle')[1]).toBeGreaterThan(
      0.5
    );
    expect(
      resolveActionWorldDragAxis('ztz99a', 'ztz99a_breech_block')[1]
    ).toBeCloseTo(-1, 5);
    expect(
      resolveActionWorldDragAxis('tiger1', 'tiger_breech_block')[2]
    ).toBeCloseTo(-1, 5);
    expect(
      resolveActionWorldDragAxis('python', 'python_cylinder')[1]
    ).toBeCloseTo(1, 5);
  });

  it('delivers grab/grabbing cursor affordance, damped spring snap-back, and gated metallic handle sheen (Zero-GC)', () => {
    const baseState = {
      screen: 'workbench',
      mode: 'firing',
      activeWeaponId: 'm1911' as WeaponId,
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      isFiringPlaying: false,
      textureModalOpen: false,
    };

    // Grab cursor active on slide in paused firing OR assembled explode (< 0.05)
    expect(canDragActionHandleNow(baseState, 'm1911_slide', 0)).toBe(true);
    expect(getCursorForPartHover(baseState, 'm1911_slide', 0, false)).toBe(
      'grab'
    );
    expect(getCursorForPartHover(baseState, 'm1911_slide', 0, true)).toBe(
      'grabbing'
    );
    expect(
      getCursorForPartHover(
        { ...baseState, mode: 'explode' },
        'm1911_slide',
        0.01,
        false
      )
    ).toBe('grab');
    // Exploded disassembly (>= 0.05), caliper, field-strip, or non-action parts do not trigger grab
    expect(
      getCursorForPartHover(
        { ...baseState, mode: 'explode' },
        'm1911_slide',
        0.25,
        false
      )
    ).toBe('pointer');
    expect(
      getCursorForPartHover(
        { ...baseState, caliperActive: true },
        'm1911_slide',
        0,
        false
      )
    ).toBe('crosshair');
    expect(
      getCursorForPartHover(
        { ...baseState, fieldStripActive: true },
        'm1911_slide',
        0,
        false
      )
    ).toBe('pointer');
    expect(getCursorForPartHover(baseState, 'm1911_frame', 0, false)).toBe(
      'pointer'
    );

    // Metallic sheen predicate gating
    const baseSheen = {
      screen: 'workbench',
      mode: 'firing',
      isHovered: true,
      isDraggingThisHandle: false,
      isActionPart: true,
      isGhostByIsolate: false,
      fieldStripActive: false,
      caliperActive: false,
      malfunctionActive: false,
      isFiringPlaying: false,
      explodeProgress: 0,
    };
    expect(shouldShowInteractiveHandleSheen(baseSheen)).toBe(true);
    expect(
      shouldShowInteractiveHandleSheen({
        ...baseSheen,
        mode: 'explode',
        explodeProgress: 0.02,
      })
    ).toBe(true);
    expect(
      shouldShowInteractiveHandleSheen({
        ...baseSheen,
        mode: 'explode',
        explodeProgress: 0.08,
      })
    ).toBe(false);
    expect(
      shouldShowInteractiveHandleSheen({ ...baseSheen, fieldStripActive: true })
    ).toBe(false);
    expect(
      shouldShowInteractiveHandleSheen({ ...baseSheen, caliperActive: true })
    ).toBe(false);
    expect(
      shouldShowInteractiveHandleSheen({ ...baseSheen, isActionPart: false })
    ).toBe(false);
    expect(
      shouldShowInteractiveHandleSheen({ ...baseSheen, isHovered: false })
    ).toBe(false);
    expect(
      shouldShowInteractiveHandleSheen({
        ...baseSheen,
        isHovered: false,
        isDraggingThisHandle: true,
      })
    ).toBe(true);

    // Damped spring-return snap-back across V5/V6 exhibits (`m1911`, `k98k`, `winchester1894`, `rem870`, `gau8`, `ztz99a`)
    const snapExhibits: WeaponId[] = [
      'm1911',
      'k98k',
      'winchester1894',
      'rem870',
      'gau8',
      'ztz99a',
    ];
    for (const wid of snapExhibits) {
      useAppStore.getState().enterWorkbench(wid, 'firing');
      useAppStore.getState().stopFiringPlay();
      interactiveActionStore.syncWeapon(wid);

      beginManualActionRack();
      updateManualActionRack(0.45);
      expect(
        interactiveActionStore.getTransientState().manualRackProgress
      ).toBeGreaterThan(0.3);
      releaseManualActionRack();
      for (let step = 0; step < 15; step++) {
        stepInteractiveAction(0.02);
      }
      expect(
        interactiveActionStore.getTransientState().manualRackProgress,
        `${wid} did not snap cleanly into battery`
      ).toBe(0);
      expect(playbackClock.getState().fireProgress).toBe(0);
    }

    // Zero-GC static check across useFrame callbacks in owned R3F files
    for (const relPath of [
      'src/engine/actors/PartActor.tsx',
      'src/engine/actors/MagazineAmmoStack.tsx',
      'src/engine/interaction/InteractiveActionController.tsx',
    ]) {
      const src = fs.readFileSync(path.resolve(relPath), 'utf8');
      const bodies = extractUseFrameBodies(src);
      expect(bodies.length, `${relPath} should contain useFrame`).toBeGreaterThan(
        0
      );
      for (const body of bodies) {
        expect(
          body,
          `${relPath} allocates THREE object inside useFrame!`
        ).not.toMatch(/\bnew\s+THREE\./);
      }
    }
  });

  it('builds high-detail cutaway cartridge geometries with beveled rim, extractor groove, recessed primer pocket, dual-material PBR, and clean disposal', () => {
    const metallicCalibers: CaliberProfile[] = [
      '9mm_para',
      '45_acp',
      '50_ae',
      '762_m43',
      '556_nato',
      '57_28',
      '338_lapua',
      '50_bmg',
      '30_06',
      '30_30_win',
      '9x39_subsonic',
      '545_m74',
      '762_nato',
      '792_mauser',
    ];

    for (const cal of metallicCalibers) {
      const detailed = buildDetailedMagazineCartridgeGeometries(cal);
      const refShared = getCaliberGeometries(cal);
      refShared.caseGeo.computeBoundingBox();
      refShared.bulletGeo.computeBoundingBox();

      expect(detailed.hasExtractorGrooveDetail).toBe(true);
      expect(detailed.hasRecessedPrimerPocket).toBe(true);
      assertFiniteUnitNormals(detailed.caseGeo, `${cal}:case`);
      assertFiniteUnitNormals(detailed.livePrimerGeo, `${cal}:primer`);
      assertFiniteUnitNormals(detailed.bulletGeo, `${cal}:bullet`);

      expect(
        computeSignedVolume(detailed.caseGeo),
        `${cal}:case positive signed volume`
      ).toBeGreaterThan(0);
      expect(
        computeSignedVolume(detailed.livePrimerGeo),
        `${cal}:primer positive signed volume`
      ).toBeGreaterThan(0);
      expect(
        computeSignedVolume(detailed.bulletGeo),
        `${cal}:bullet positive signed volume`
      ).toBeGreaterThan(0);

      // Verify bounding fidelity against BallisticsSystem caliber reference (< 0.025u)
      const cb = detailed.caseGeo.boundingBox!;
      const refCb = refShared.caseGeo.boundingBox!;
      expect(Math.abs(cb.min.x - refCb.min.x)).toBeLessThan(0.025);
      expect(Math.abs(cb.max.x - refCb.max.x)).toBeLessThan(0.025);
      expect(Math.abs(cb.max.y - refCb.max.y)).toBeLessThan(0.025);

      // Verify extractor groove undercut exists behind headstamp & primer pocket is recessed
      const pos = detailed.caseGeo.getAttribute('position');
      const xHead = cb.min.x;
      let maxOuterR = 0;
      let minGrooveR = Number.POSITIVE_INFINITY;
      let hasRecessedPocketFloor = false;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const r = Math.hypot(pos.getY(i), pos.getZ(i));
        if (r > maxOuterR) maxOuterR = r;
        // Outer groove band lies just ahead of the rim (xHead + 0.06 .. xHead + 0.38)
        if (x > xHead + 0.06 && x < xHead + 0.38 && r > maxOuterR * 0.6) {
          if (r < minGrooveR) minGrooveR = r;
        }
        // Recessed pocket floor sits on the axis strictly inside xHead
        if (r < 0.005 && x > xHead + 0.05 && x < xHead + 0.2) {
          hasRecessedPocketFloor = true;
        }
      }
      expect(
        minGrooveR,
        `${cal}: missing undercut extractor groove`
      ).toBeLessThan(maxOuterR - 0.025);
      expect(
        hasRecessedPocketFloor,
        `${cal}: missing recessed primer pocket floor`
      ).toBe(true);

      // Verify recessed primer cup sits inside the case headstamp bounds
      const pb = detailed.livePrimerGeo.boundingBox!;
      expect(pb.min.x).toBeGreaterThanOrEqual(xHead - 0.002);
      expect(pb.max.y).toBeLessThan(cb.max.y * 0.65);

      // Verify dual-material metallurgical contrast
      const mat = getMagazineCartridgeMaterialPreset(cal);
      expect(mat.caseColor.toLowerCase()).not.toBe(
        mat.bulletColor.toLowerCase()
      );
      expect(mat.primerColor.toLowerCase()).not.toBe(
        mat.caseColor.toLowerCase()
      );
      expect(mat.primerMetalness).toBeGreaterThanOrEqual(0.92);
      expect(mat.bulletMetalness).toBeGreaterThanOrEqual(0.88);

      // Verify clean disposal of owned buffers without breaking shared cache
      const spyCase = vi.spyOn(detailed.caseGeo, 'dispose');
      const spyPrimer = vi.spyOn(detailed.livePrimerGeo, 'dispose');
      const spyBullet = vi.spyOn(detailed.bulletGeo, 'dispose');
      detailed.dispose();
      expect(spyCase).toHaveBeenCalledTimes(1);
      expect(spyPrimer).toHaveBeenCalledTimes(1);
      expect(spyBullet).toHaveBeenCalledTimes(1);
      // Shared BallisticsSystem buffer remains intact
      expect(refShared.caseGeo.getAttribute('position').count).toBeGreaterThan(
        0
      );
    }

    // Verify 12-gauge shotshell & .357 Magnum preserve multi-tone vertex colors
    for (const vcCal of ['12_gauge', '357_magnum', 'arrow_400gr'] as CaliberProfile[]) {
      const detailed = buildDetailedMagazineCartridgeGeometries(vcCal);
      expect(detailed.hasCaseVertexColors, `${vcCal} case vertexColors`).toBe(
        true
      );
      expect(
        detailed.hasBulletVertexColors,
        `${vcCal} bullet vertexColors`
      ).toBe(true);
      detailed.dispose();
    }

    // Verify .50 AE rebated rim profile specifically (rim OD < base web OD)
    const ae50 = buildDetailedMagazineCartridgeGeometries('50_ae');
    const aePos = ae50.caseGeo.getAttribute('position');
    let rimR = 0;
    let webR = 0;
    for (let i = 0; i < aePos.count; i++) {
      const x = aePos.getX(i);
      const r = Math.hypot(aePos.getY(i), aePos.getZ(i));
      if (x > -1.16 && x < -1.06 && r > rimR) rimR = r;
      if (x > -0.84 && x < 0.0 && r > webR) webR = r;
    }
    expect(rimR).toBeLessThan(webR - 0.02);
    ae50.dispose();
  });

  it('validates all 34 exhibit magazine stacks including Deagle, M1911, K98k, Thompson, MG 42, GAU-8, Win 1894, Rem 870, P08 & AK-15', () => {
    const pose = createMutableMagazineRoundPose();

    // 1. All 34 exhibits accounted for cleanly: 27 instanced + 7 sculptural GLB ammo exhibits
    let instancedCount = 0;
    let sculpturalCount = 0;
    for (const id of WEAPON_IDS) {
      const spec = MAGAZINE_STACK_SPECS[id];
      expect(spec).toBeDefined();
      if (spec.roundCount > 0) {
        instancedCount++;
        expect(spec.slots.length).toBe(spec.roundCount + 1);
      } else {
        sculpturalCount++;
        expect(spec.slots.length).toBe(0);
        const meta = SCULPTURAL_AMMO_EXHIBITS[id];
        expect(meta, `Missing sculptural ammo metadata for ${id}`).toBeDefined();
        expect(meta!.capacityRounds).toBeGreaterThanOrEqual(22);
      }
    }
    expect(instancedCount + sculpturalCount).toBe(WEAPON_IDS.length);
    expect(instancedCount).toBe(27);
    expect(sculpturalCount).toBe(7);

    // 2. Spotlight exhibit contracts
    expect(MAGAZINE_STACK_SPECS.deagle.roundCount).toBe(7);
    expect(MAGAZINE_STACK_SPECS.m1911.roundCount).toBe(7);
    expect(MAGAZINE_STACK_SPECS.k98k.roundCount).toBe(5);
    expect(MAGAZINE_STACK_SPECS.winchester1894.roundCount).toBe(5);
    expect(MAGAZINE_STACK_SPECS.rem870.roundCount).toBe(4);
    expect(MAGAZINE_STACK_SPECS.p08.roundCount).toBe(8);
    expect(MAGAZINE_STACK_SPECS.ak15.roundCount).toBe(21);
    expect(SCULPTURAL_AMMO_EXHIBITS.thompson?.capacityRounds).toBe(50);
    expect(SCULPTURAL_AMMO_EXHIBITS.mg42?.capacityRounds).toBe(50);
    expect(SCULPTURAL_AMMO_EXHIBITS.gau8?.capacityRounds).toBe(1150);

    // 3. Verify tightened bottom-round seating on P08 & Rem 870 and clean single-stack Z=0 on Deagle & M1911
    for (const singleId of ['deagle', 'm1911'] as WeaponId[]) {
      const sp = MAGAZINE_STACK_SPECS[singleId];
      for (let i = 0; i < sp.roundCount; i++) {
        evaluateMagazineRoundSlotInto(singleId, i, 0, pose);
        expect(Math.abs(pose.pz)).toBeLessThan(1e-6);
      }
    }

    // K98k staggered 5-round internal box alternates ±Z
    let k98kMaxZ = 0;
    for (let i = 1; i < MAGAZINE_STACK_SPECS.k98k.roundCount; i++) {
      evaluateMagazineRoundSlotInto('k98k', i, 0, pose);
      k98kMaxZ = Math.max(k98kMaxZ, Math.abs(pose.pz));
    }
    expect(k98kMaxZ).toBeGreaterThan(0.18);

    // Tightened P08 bottom round sits within 1.1 cm along normal from follower deck (was 1.46 cm)
    const p08Spec = MAGAZINE_STACK_SPECS.p08;
    const p08Last = p08Spec.slots[p08Spec.roundCount - 1];
    const p08Dist =
      (p08Last.px - p08Spec.followerDeckPlane.point[0]) *
        p08Spec.followerDeckPlane.normal[0] +
      (p08Last.py - p08Spec.followerDeckPlane.point[1]) *
        p08Spec.followerDeckPlane.normal[1];
    expect(p08Dist).toBeGreaterThan(0.5);
    expect(p08Dist).toBeLessThan(1.1);

    // Tightened Rem 870 front shotshell sits cleanly against follower (within 1.6 cm center-to-deck)
    const remSpec = MAGAZINE_STACK_SPECS.rem870;
    const remLast = remSpec.slots[remSpec.roundCount - 1];
    const remDist = remSpec.followerDeckPlane.point[0] - remLast.px;
    expect(remDist).toBeGreaterThan(1.2);
    expect(remDist).toBeLessThan(1.7);
  });
});
