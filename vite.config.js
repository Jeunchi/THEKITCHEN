import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // never inline .glb/.bin as base64 — keep them as real files
  },
});
