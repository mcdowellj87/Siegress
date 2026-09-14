import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(async ({ command }) => {
  const plugins = [];

  if (command === 'build') {
    const { sites } = await import('@openai/sites-vite-plugin');
    plugins.push(sites());
  }

  return {
    plugins,
    resolve: {
      alias: {
        three: fileURLToPath(new URL('./vendor/three.module.js', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  };
});
