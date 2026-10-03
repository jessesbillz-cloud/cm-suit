import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// BASE_PATH lets the same build live under a sub-path (GitHub Pages staging: /cm-suit/). Default '/'.
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest is hand-written
      // pdf.js's image decoders (public/vendor) load only when a sheet needs them, never into everyone's cache.
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png}'], globIgnores: ['**/node_modules/**/*', 'vendor/**'] },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
  build: { sourcemap: true },
  define: { __BASE_PATH__: JSON.stringify(base) },
});
