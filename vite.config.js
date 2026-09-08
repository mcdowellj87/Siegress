import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  plugins: [sites()],
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
});
