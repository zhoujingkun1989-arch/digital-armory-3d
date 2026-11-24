import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
  parseEnvironmentPresetUrlParam,
  serializeEnvironmentPresetUrlParam,
} from '../src/app/useUrlStateSync';
import { setCasingBounceListener } from '../src/engine/physics/armoryPhysics';
import { useAppStore } from '../src/store/useAppStore';

const REPO_ROOT = path.resolve(__dirname, '..');

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function resolveRelativeRuntimeImports(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf8');
  const out: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (match[0].startsWith('import type')) continue;
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const base = path.resolve(path.dirname(filePath), spec);
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const candidate = base + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        out.push(candidate);
        break;
      }
    }
  }
  return out;
}

describe('Cycle 9D.1 — Studio Environment Deep-Link (?env= / ?theme=) Hydration & Serialization', () => {
  beforeEach(() => {
    useAppStore.getState().setEnvironmentPreset('tactical_vault');
  });

  it('parses canonical ?env= presets, dark_studio alias, and ?theme= fallback aliases accurately', () => {
    expect(parseEnvironmentPresetUrlParam('blueprint_daylight')).toBe(
      'blueprint_daylight'
    );
    expect(parseEnvironmentPresetUrlParam('gunsmith_bench')).toBe(
      'gunsmith_bench'
    );
    expect(parseEnvironmentPresetUrlParam('tactical_vault')).toBe(
      'tactical_vault'
    );
    expect(parseEnvironmentPresetUrlParam('dark_studio')).toBe(
      'tactical_vault'
    );
    expect(parseEnvironmentPresetUrlParam(' Blueprint_Daylight ')).toBe(
      'blueprint_daylight'
    );
    expect(parseEnvironmentPresetUrlParam(' DARK_STUDIO ')).toBe(
      'tactical_vault'
    );

    // Fallback to ?theme= when ?env= is omitted or unrecognized
    expect(parseEnvironmentPresetUrlParam(null, 'light')).toBe(
      'blueprint_daylight'
    );
    expect(parseEnvironmentPresetUrlParam(null, 'dark')).toBe('tactical_vault');
    expect(parseEnvironmentPresetUrlParam('unknown_preset', 'light')).toBe(
      'blueprint_daylight'
    );

    // Explicit valid ?env= always takes precedence over ?theme=
    expect(parseEnvironmentPresetUrlParam('gunsmith_bench', 'light')).toBe(
      'gunsmith_bench'
    );
    expect(parseEnvironmentPresetUrlParam('dark_studio', 'light')).toBe(
      'tactical_vault'
    );

    // Omitted or unrecognized returns null
    expect(parseEnvironmentPresetUrlParam(null, null)).toBeNull();
    expect(parseEnvironmentPresetUrlParam('bogus', 'sepia')).toBeNull();

    // Serializer omits default tactical_vault so default URLs stay clean
    expect(serializeEnvironmentPresetUrlParam('tactical_vault')).toBeNull();
    expect(serializeEnvironmentPresetUrlParam(undefined)).toBeNull();
    expect(serializeEnvironmentPresetUrlParam('gunsmith_bench')).toBe(
      'gunsmith_bench'
    );
    expect(serializeEnvironmentPresetUrlParam('blueprint_daylight')).toBe(
      'blueprint_daylight'
    );
  });

  it('hydrates store environmentPreset & acoustic room from ?env= and ?theme= and round-trips cleanly', () => {
    applyLocationToStore(
      '?screen=workbench&weapon=ak15&env=blueprint_daylight&lang=en'
    );
    expect(useAppStore.getState().environmentPreset).toBe('blueprint_daylight');
    expect(useAppStore.getState().acousticEnvironment).toBe('bench_close');

    const bpSearch = buildSearchString(
      'ak15',
      'workbench',
      'explode',
      false,
      'en',
      '556_nato',
      false,
      '338_lapua',
      '?screen=workbench&weapon=ak15&theme=light',
      undefined,
      undefined,
      undefined,
      undefined,
      'blueprint_daylight'
    );
    const bpParams = new URLSearchParams(bpSearch);
    expect(bpParams.get('env')).toBe('blueprint_daylight');
    expect(bpParams.get('theme')).toBeNull();

    applyLocationToStore(
      '?screen=workbench&weapon=m4a1&mode=firing&env=gunsmith_bench&lang=en'
    );
    expect(useAppStore.getState().environmentPreset).toBe('gunsmith_bench');
    expect(useAppStore.getState().mode).toBe('firing');

    const benchSearch = buildSearchString(
      'm4a1',
      'workbench',
      'firing',
      false,
      'en',
      '556_nato',
      false,
      '338_lapua',
      '',
      undefined,
      undefined,
      undefined,
      undefined,
      'gunsmith_bench'
    );
    expect(new URLSearchParams(benchSearch).get('env')).toBe('gunsmith_bench');

    // ?env=dark_studio alias hydrates to default tactical_vault and serializes cleanly without ?env=
    applyLocationToStore(
      '?screen=workbench&weapon=ak15&mode=firing&env=dark_studio'
    );
    expect(useAppStore.getState().environmentPreset).toBe('tactical_vault');
    expect(useAppStore.getState().acousticEnvironment).toBe('indoor_range');
    const defaultSearch = buildSearchString(
      'ak15',
      'workbench',
      'explode',
      false,
      'en',
      '556_nato',
      false,
      '338_lapua',
      '?screen=workbench&weapon=ak15&env=dark_studio',
      undefined,
      undefined,
      undefined,
      undefined,
      'tactical_vault'
    );
    expect(new URLSearchParams(defaultSearch).get('env')).toBeNull();
    expect(new URLSearchParams(defaultSearch).get('theme')).toBeNull();

    // ?theme=light fallback hydrates Blueprint Daylight across Armory / Showcase / Workbench
    applyLocationToStore('?screen=armory&weapon=ztz99a&theme=light');
    expect(useAppStore.getState().environmentPreset).toBe('blueprint_daylight');

    // Returning to a clean URL without ?env= restores default dark studio preset
    applyLocationToStore('?screen=armory&weapon=ztz99a');
    expect(useAppStore.getState().environmentPreset).toBe('tactical_vault');
  });
});

describe('Cycle 9D.2 — Acyclic Chunk Graph (Zero armory-stage <-> armory-audio Cycle) & Brass Bounce Preservation', () => {
  it('routes pure leaf gpuTelemetryBus into armory-catalog so armory-audio never depends back on armory-stage', () => {
    const viteCfgSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'vite.config.ts'),
      'utf8'
    );
    expect(viteCfgSrc).toContain('/src/engine/canvas/gpuTelemetryBus.ts');
    expect(viteCfgSrc).toContain('/src/engine/canvas/graphicsQuality.ts');

    // Confirm gpuTelemetryBus is a zero-import leaf module (safe inside armory-catalog)
    const busPath = path.join(REPO_ROOT, 'src/engine/canvas/gpuTelemetryBus.ts');
    expect(resolveRelativeRuntimeImports(busPath)).toEqual([]);

    // Confirm mechanicalSoundEngine and useAppStore have zero transitive runtime reach into armory-stage
    const isArmoryStage = (absPath: string): boolean => {
      const norm = absPath.replace(/\\/g, '/');
      if (
        norm.includes('/src/engine/canvas/graphicsQuality.ts') ||
        norm.includes('/src/engine/canvas/gpuTelemetryBus.ts') ||
        norm.includes('/src/engine/actors/StencilSectionCap.tsx')
      ) {
        return false;
      }
      return (
        norm.includes('/src/engine/actors/') ||
        norm.includes('/src/engine/canvas/') ||
        norm.includes('/src/engine/ballistics/magazineStackSpecs.ts') ||
        norm.includes('/src/features/monograph/MonographCaptureRig.tsx') ||
        norm.includes('/src/features/showdown3d/SplitShowdownViewport.tsx')
      );
    };

    const startFile = path.join(
      REPO_ROOT,
      'src/engine/audio/mechanicalSoundEngine.ts'
    );
    const visited = new Set<string>([startFile]);
    const queue: string[] = [startFile];
    const leakedStageFiles: string[] = [];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of resolveRelativeRuntimeImports(cur)) {
        if (isArmoryStage(next)) {
          leakedStageFiles.push(path.relative(REPO_ROOT, next));
        } else if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    expect(leakedStageFiles).toEqual([]);
  });

  it('preserves Cycle 8B brass floor-bounce listener registration contract cleanly', () => {
    const fired: string[] = [];
    setCasingBounceListener((cal, _speed, bounce) => {
      fired.push(`${cal}#${bounce}`);
    });
    setCasingBounceListener(null);
    expect(fired).toEqual([]);

    const ballisticsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
      'utf8'
    );
    expect(ballisticsSrc).toContain('setCasingBounceListener(');
    expect(ballisticsSrc).toContain('playBrassCasingBounceSound(');
    expect(ballisticsSrc).toContain('setCasingBounceListener(null)');

    // Sanity check src tree scan runs cleanly
    const audioFiles = walkTsFiles(path.join(REPO_ROOT, 'src/engine/audio'));
    expect(audioFiles.length).toBeGreaterThanOrEqual(2);
  });
});
