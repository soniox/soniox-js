import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'web',
  plugins: [preact()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api-token': 'http://localhost:3000',
      '/tmp-key': 'http://localhost:3000',
      '/models': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
      '/transcriptions': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
      '/realtime': { target: 'http://localhost:3000', ws: true },
      '/agent': { target: 'http://localhost:3000', ws: true },
      '/push-to-talk': { target: 'http://localhost:3000', ws: true },
    },
  },
});
