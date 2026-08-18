import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const bridgeToken = env.RELAYLINGS_BRIDGE_TOKEN;
  return ({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        headers: bridgeToken ? { 'X-Relaylings-Token': bridgeToken } : undefined,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  });
});
