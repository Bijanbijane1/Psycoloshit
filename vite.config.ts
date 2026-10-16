import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, version as viteVersion, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function disableHmrTransportPlugin(isHmrEnabled: boolean): Plugin {
  return {
    name: 'disable-hmr-transport',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (!isHmrEnabled && (id.includes('vite/dist/client/client.mjs') || id.endsWith('client.mjs'))) {
        const pattern = /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/g;
        const matches = code.match(pattern);
        const count = matches ? matches.length : 0;

        if (count !== 1) {
          throw new Error(
            `[disableHmrTransportPlugin] Expected exactly 1 match for Vite client transport pattern in client.mjs, but found ${count}. ` +
            `Installed Vite version: ${viteVersion}. The custom HMR transport transformation requires review.`
          );
        }

        return code.replace(
          pattern,
          'const transport = { async connect() {}, async disconnect() {}, send() {} };'
        );
      }
    },
  };
}

export default defineConfig(() => {
  const isHmrEnabled = process.env.ENABLE_HMR === 'true' || process.env.DISABLE_HMR === 'false';

  return {
    plugins: [
      react(),
      tailwindcss(),
      disableHmrTransportPlugin(isHmrEnabled),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // Using /public/manifest.json explicitly
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: isHmrEnabled,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      // HMR is explicitly disabled in AI Studio preview due to reverse proxy WebSocket redirects.
      // Can be explicitly opted into in supporting environments via ENABLE_HMR=true or DISABLE_HMR=false.
      hmr: isHmrEnabled,
      // Keep standard file watching active so manual page reloads reflect changes during development.
      watch: {},
      forwardConsole: false,
    },
  };
});
