import { fileURLToPath } from 'node:url';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, envDir, ''), ...process.env };

  return {
    envDir,
    plugins: [viteReact()],
    server: {
      host: '0.0.0.0',
      port: Number(env.WEB_PORT ?? 3000),
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_INTERNAL_URL ?? 'http://127.0.0.1:3100',
          changeOrigin: true,
        },
      },
    },
  };
});
