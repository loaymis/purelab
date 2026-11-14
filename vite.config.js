import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes the build loadable from file:// inside Electron AND from
// any sub-path when served by the LAN hub or a static web host.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
