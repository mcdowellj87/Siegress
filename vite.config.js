import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const MAP_FILE = fileURLToPath(new URL('./images/map.png', import.meta.url));
const MAX_MAP_BYTES = 32 * 1024 * 1024;

function gravelMapPersistence() {
  return {
    name: 'siegress-gravel-map-persistence',
    configureServer(server) {
      server.watcher.unwatch(MAP_FILE);
      server.middlewares.use('/__siegress/save-map', (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        const chunks = [];
        let size = 0;
        let rejected = false;

        request.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_MAP_BYTES) {
            rejected = true;
            return;
          }
          chunks.push(chunk);
        });

        request.on('end', async () => {
          if (rejected) {
            response.statusCode = 413;
            response.end('Map image is too large.');
            return;
          }

          const png = Buffer.concat(chunks);
          const hasPngSignature = png.length >= 8 &&
            png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47 &&
            png[4] === 0x0d && png[5] === 0x0a && png[6] === 0x1a && png[7] === 0x0a;
          if (!hasPngSignature) {
            response.statusCode = 415;
            response.end('Expected a PNG image.');
            return;
          }

          try {
            await writeFile(MAP_FILE, png);
            response.statusCode = 204;
            response.end();
          } catch (error) {
            server.config.logger.error(`[gravel] Could not save map.png: ${error.message}`);
            response.statusCode = 500;
            response.end('Could not save map image.');
          }
        });
      });
    }
  };
}

export default defineConfig(async ({ command }) => {
  const plugins = [gravelMapPersistence()];

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
