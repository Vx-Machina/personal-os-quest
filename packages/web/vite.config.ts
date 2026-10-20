import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Read PORT from the repo-root .env so the proxy follows the API.
const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  const api = `http://127.0.0.1:${env.PORT || 8787}`;
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: { '/api': api },
    },
    preview: {
      proxy: { '/api': api },
    },
  };
});
