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
          if (id.includes('node_modules')) {
            if (
              id.includes('three-bvh-csg') ||
              id.includes('three-mesh-bvh')
            ) {
              return 'vendor-csg';
            }
            if (
              id.includes('@react-three/fiber') ||
              id.includes('@react-three/drei')
            ) {
              return 'vendor-r3f';
            }
            if (id.includes('/three/') || id.includes('three-stdlib')) {
              return 'vendor-three';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/zustand/') ||
              id.includes('/lucide-react/')
            ) {
              return 'vendor-ui';
            }
          }
          return undefined;
        },
      },
    },
  },
});
