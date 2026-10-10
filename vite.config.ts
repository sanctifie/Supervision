import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'interface vit dans web/ ; `npm run build` la dépose dans dist/web,
// que le serveur Express sert ensuite.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  test: {
    root: '.',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
} as never);
