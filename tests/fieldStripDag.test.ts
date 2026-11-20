import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIELD_STRIP_PLANS,
  type FieldStripStepSpec,
} from '../src/engine/fieldstrip/fieldStripSpecs';
import { fieldStripStore } from '../src/engine/fieldstrip/fieldStripStore';
import { createMutablePose } from '../src/engine/kinematics/math';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

function verifyAcyclicDag(steps: readonly FieldStripStepSpec[]): void {
  const byId = new Map<string, FieldStripStepSpec>();
  for (const s of steps) {
    expect(byId.has(s.id)).toBe(false);
    byId.set(s.id, s);
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string): void => {
    const cur = state.get(id);
    if (cur === 'visited') return;
    expect(cur).not.toBe('visiting'); // cycle detected if 'visiting'
    state.set(id, 'visiting');
    const step = byId.get(id);
    expect(step).toBeDefined();
    for (const reqId of step!.requires) {
      expect(byId.has(reqId)).toBe(true);
      visit(reqId);
    }
    state.set(id, 'visited');
  };

  for (const s of steps) {
    visit(s.id);
  }
}

describe('WP-07 Hands-On Guided Military Field-Strip DAG & Runtime Contracts', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('validates acyclic DAG topology, valid part IDs, and non-overlapping explodeSteps across all 23 exhibits', async () => {
    expect(WEAPON_IDS).toHaveLength(23);
    for (const weaponId of WEAPON_IDS) {
      const plan = FIELD_STRIP_PLANS[weaponId];
      expect(plan).toBeDefined();
      expect(plan.weaponId).toBe(weaponId);
      expect(plan.manualCodeZh.length).toBeGreaterThan(3);
      expect(plan.manualCodeEn.length).toBeGreaterThan(3);
      expect(plan.steps.length).toBeGreaterThanOrEqual(5);
      expect(plan.steps.length).toBeLessThanOrEqual(6);

      verifyAcyclicDag(plan.steps);

      const plugin = await loadWeaponPlugin(weaponId);
      const partById = new Map(plugin.parts.map((p) => [p.id, p]));
      const claimedPartExplodeStep = new Set<string>();

      for (const step of plan.steps) {
        expect(step.titleZh.length).toBeGreaterThan(2);
        expect(step.titleEn.length).toBeGreaterThan(2);
        expect(step.actionHintZh.length).toBeGreaterThan(4);
        expect(step.actionHintEn.length).toBeGreaterThan(4);
        expect(step.triggerPartIds.length).toBeGreaterThan(0);
        expect(step.bindings.length).toBeGreaterThan(0);

        if (step.requires.length > 0) {
          expect(step.stripBlockedNoteZh.length).toBeGreaterThan(4);
          expect(step.stripBlockedNoteEn.length).toBeGreaterThan(4);
        }

        for (const trigId of step.triggerPartIds) {
          expect(
            partById.has(trigId),
            `${weaponId}.${step.id} references unknown triggerPartId "${trigId}"`
          ).toBe(true);
        }

        for (const binding of step.bindings) {
          const part = partById.get(binding.partId);
          expect(
            part,
            `${weaponId}.${step.id} binds unknown partId "${binding.partId}"`
          ).toBeDefined();
          expect(binding.explodeStepIndices.length).toBeGreaterThan(0);

          for (const explodeIdx of binding.explodeStepIndices) {
            expect(Number.isInteger(explodeIdx)).toBe(true);
            expect(explodeIdx).toBeGreaterThanOrEqual(0);
            expect(
              explodeIdx,
              `${weaponId}.${step.id} out-of-bounds explodeStepIndex ${explodeIdx} on ${binding.partId}`
            ).toBeLessThan(part!.explodeSteps.length);

            const claimKey = `${binding.partId}#${explodeIdx}`;
            expect(
              claimedPartExplodeStep.has(claimKey),
              `${weaponId} claims ${claimKey} in multiple field-strip steps`
            ).toBe(false);
            claimedPartExplodeStep.add(claimKey);
          }
        }
      }
    }
  });

  it('enforces forward strip interference, hint pulsing, reverse-order reassembly blocking, and full-cycle pose restoration on all 23 exhibits', async () => {
    const pose = createMutablePose();

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const plan = FIELD_STRIP_PLANS[weaponId];
      fieldStripStore.reset(weaponId, true);

      let snap = fieldStripStore.getSnapshot();
      expect(snap.weaponId).toBe(weaponId);
      expect(snap.phase).toBe('strip');
      expect(snap.strippedCount).toBe(0);
      expect(snap.totalSteps).toBe(plan.steps.length);
      expect(snap.fullCycleCompleted).toBe(false);

      // 1. Out-of-order click on a step with unmet prerequisites must block with crimson/amber highlights
      const dependentStep = plan.steps.find((s) => s.requires.length > 0);
      expect(dependentStep).toBeDefined();
      const blockedPartId = dependentStep!.triggerPartIds[0];
      const blockRes = fieldStripStore.attemptPartClick(
        weaponId,
        blockedPartId
      );
      expect(blockRes.outcome).toBe('blocked');
      expect(blockRes.stepId).toBe(dependentStep!.id);

      snap = fieldStripStore.getSnapshot();
      expect(snap.interference).not.toBeNull();
      expect(snap.interference!.severity).toBe('interference');
      expect(snap.interference!.blockingPartIds.length).toBeGreaterThan(0);

      const nowMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      expect(fieldStripStore.getPartHighlight(weaponId, blockedPartId, nowMs)).toBe(
        'blocked'
      );
      expect(
        fieldStripStore.getPartHighlight(
          weaponId,
          snap.interference!.blockingPartIds[0],
          nowMs
        )
      ).toBe('blocking');

      // 2. Triggering hint marks the recommended step's trigger part as 'hint'
      const hintedPartId = fieldStripStore.triggerHint();
      expect(hintedPartId).not.toBeNull();
      const hintNowMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      expect(
        fieldStripStore.getPartHighlight(weaponId, hintedPartId!, hintNowMs)
      ).toBe('hint');

      // 3. Clicking a non-strip receiver/chassis part emits an informational notice without stripping
      const allClaimedParts = new Set<string>();
      for (const s of plan.steps) {
        s.triggerPartIds.forEach((id) => allClaimedParts.add(id));
        s.bindings.forEach((b) => allClaimedParts.add(b.partId));
      }
      const chassisPart = plugin.parts.find((p) => !allClaimedParts.has(p.id));
      if (chassisPart) {
        const chassisRes = fieldStripStore.attemptPartClick(
          weaponId,
          chassisPart.id
        );
        expect(chassisRes.outcome).toBe('non_strip_part');
        expect(fieldStripStore.getSnapshot().interference?.severity).toBe(
          'info'
        );
      }

      // 4. Execute full topological field-strip (0 -> totalSteps)
      for (let i = 0; i < plan.steps.length; i++) {
        const res = fieldStripStore.performRecommendedStep();
        expect(res.outcome).toBe('stripped');
      }

      snap = fieldStripStore.getSnapshot();
      expect(snap.strippedCount).toBe(plan.steps.length);
      expect(snap.phase).toBe('reassemble');

      // Converge 60fps step animations to 1.0 and verify bound parts moved off assembled pose
      for (let frame = 0; frame < 30; frame++) {
        fieldStripStore.stepAnimations(0.05);
      }
      for (const s of plan.steps) {
        expect(fieldStripStore.getStepAlpha(weaponId, s.id)).toBeCloseTo(1, 5);
      }

      const sampleBoundPartId = plan.steps[0].bindings[0].partId;
      const sampleBoundPart = plugin.parts.find(
        (p) => p.id === sampleBoundPartId
      )!;
      fieldStripStore.evaluatePartPoseInto(weaponId, sampleBoundPart, pose);
      const disp = Math.hypot(
        pose.px - sampleBoundPart.assembledPos[0],
        pose.py - sampleBoundPart.assembledPos[1],
        pose.pz - sampleBoundPart.assembledPos[2]
      );
      expect(disp).toBeGreaterThan(0.1);

      // 5. Attempting to reassemble a prerequisite while its dependent is still stripped must block
      const prereqId = dependentStep!.requires[0];
      const prereqStep = plan.steps.find((s) => s.id === prereqId)!;
      const reverseBlockRes = fieldStripStore.attemptPartClick(
        weaponId,
        prereqStep.triggerPartIds[0]
      );
      expect(reverseBlockRes.outcome).toBe('blocked');
      expect(fieldStripStore.getSnapshot().interference?.severity).toBe(
        'interference'
      );

      // 6. Complete reverse-topological reassembly (totalSteps -> 0)
      for (let i = 0; i < plan.steps.length; i++) {
        const res = fieldStripStore.performRecommendedStep();
        expect(res.outcome).toBe('reassembled');
      }

      snap = fieldStripStore.getSnapshot();
      expect(snap.strippedCount).toBe(0);
      expect(snap.phase).toBe('strip');
      expect(snap.fullCycleCompleted).toBe(true);

      // Converge 60fps step animations back to 0.0 and verify exact assembled poses for all parts
      for (let frame = 0; frame < 30; frame++) {
        fieldStripStore.stepAnimations(0.05);
      }
      for (const part of plugin.parts) {
        fieldStripStore.evaluatePartPoseInto(weaponId, part, pose);
        expect(pose.px).toBeCloseTo(part.assembledPos[0], 6);
        expect(pose.py).toBeCloseTo(part.assembledPos[1], 6);
        expect(pose.pz).toBeCloseTo(part.assembledPos[2], 6);
        expect(pose.rx).toBeCloseTo(part.assembledRot?.[0] ?? 0, 6);
        expect(pose.ry).toBeCloseTo(part.assembledRot?.[1] ?? 0, 6);
        expect(pose.rz).toBeCloseTo(part.assembledRot?.[2] ?? 0, 6);
        expect(pose.sx).toBe(1);
      }
    }
  });

  it('synchronizes useAppStore.toggleFieldStripMode with workbench explode state', () => {
    useAppStore.getState().enterWorkbench('m4a1', 'firing');
    expect(useAppStore.getState().mode).toBe('firing');
    expect(useAppStore.getState().fieldStripActive).toBe(false);

    useAppStore.getState().toggleFieldStripMode();
    expect(useAppStore.getState().fieldStripActive).toBe(true);
    expect(useAppStore.getState().mode).toBe('explode');
    expect(useAppStore.getState().isFiringPlaying).toBe(false);

    useAppStore.getState().toggleFieldStripMode();
    expect(useAppStore.getState().fieldStripActive).toBe(false);
  });
});
