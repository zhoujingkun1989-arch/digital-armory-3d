import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        showcase: resolve(__dirname, 'showcase.html'),
      },
      output: {
        manualChunks(id) {
          const normId = id.replace(/\\/g, '/');
          if (normId.includes('node_modules')) {
            if (
              normId.includes('three-bvh-csg') ||
              normId.includes('three-mesh-bvh')
            ) {
              return 'vendor-csg';
            }
            if (
              normId.includes('@react-three/fiber') ||
              normId.includes('@react-three/drei')
            ) {
              return 'vendor-r3f';
            }
            if (
              normId.includes('/three/examples/') ||
              normId.includes('three-stdlib')
            ) {
              return 'vendor-three-postfx';
            }
            if (normId.includes('/three/')) {
              return 'vendor-three';
            }
            if (
              normId.includes('/react/') ||
              normId.includes('/react-dom/') ||
              normId.includes('/zustand/') ||
              normId.includes('/lucide-react/')
            ) {
              return 'vendor-ui';
            }
            return undefined;
          }

          if (
            normId.includes('/src/weapons/expansion/centennialTypes.ts') ||
            normId.includes('/src/weapons/expansion/centennialCatalog.ts') ||
            normId.includes('/src/weapons/expansion/centennialLayoutMath.ts') ||
            normId.includes(
              '/src/weapons/expansion/centennialPartNomenclature.ts'
            ) ||
            normId.includes('/src/weapons/expansion/centennialProjectors.ts') ||
            normId.includes('/src/weapons/expansion/catalog/')
          ) {
            return 'armory-centennial-catalog';
          }

          if (
            normId.includes('/src/weapons/types.ts') ||
            normId.includes('/src/weapons/manifests.ts') ||
            normId.includes('/src/engine/physics/armoryPhysics.ts') ||
            normId.includes('/src/engine/utils/assetUrl.ts') ||
            normId.includes('/src/engine/canvas/graphicsQuality.ts') ||
            normId.includes('/src/engine/canvas/gpuTelemetryBus.ts')
          ) {
            return 'armory-catalog';
          }

          if (
            normId.includes('/src/engine/fieldstrip/fieldStripSpecs.ts') ||
            normId.includes('/src/engine/malfunctions/malfunctionSpecs.ts') ||
            normId.includes('/src/engine/cartridges/cartridgeSpecs.ts')
          ) {
            return 'armory-specs';
          }

          if (normId.includes('/src/engine/physics/externalBallistics.ts')) {
            return 'armory-ballistics-physics';
          }

          if (
            normId.includes('/src/i18n/uiStrings.ts') ||
            normId.includes('/src/i18n/weaponFallbacks.ts')
          ) {
            return 'armory-i18n';
          }

          if (normId.includes('/src/features/armory/mechanismShowdownSpecs.ts')) {
            return 'armory-showdown-specs';
          }

          if (
            normId.includes('/src/features/armory/WeaponSilhouetteSvg.tsx') ||
            normId.includes(
              '/src/weapons/expansion/centennialSilhouetteRenderer.tsx'
            )
          ) {
            return 'armory-silhouettes';
          }

          if (
            normId.includes('/src/engine/materials/') ||
            normId.includes('/src/engine/actors/StencilSectionCap.tsx')
          ) {
            return 'armory-materials';
          }

          if (normId.includes('/src/engine/geometry/glbAssetService.ts')) {
            return 'armory-glb';
          }

          if (
            normId.includes('/src/engine/audio/mechanicalSoundEngine.ts') ||
            normId.includes('/src/engine/audio/acousticImpulse.ts')
          ) {
            return 'armory-audio';
          }

          if (
            normId.includes('/src/engine/actors/') ||
            normId.includes('/src/engine/canvas/') ||
            normId.includes('/src/engine/ballistics/magazineStackSpecs.ts') ||
            normId.includes('/src/features/monograph/MonographCaptureRig.tsx') ||
            normId.includes(
              '/src/features/showdown3d/SplitShowdownViewport.tsx'
            )
          ) {
            return 'armory-stage';
          }

          return undefined;
        },
      },
    },
  },
});
