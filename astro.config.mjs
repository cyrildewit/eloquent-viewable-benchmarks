// @ts-check
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cyrildewit.github.io',
  base: '/eloquent-viewable-benchmarks',
  trailingSlash: 'always',
  server: { host: true, port: 4321 },
  vite: {
    plugins: [tailwindcss()],
    // ECharts' core is about 500 kB minified even tree-shaken, 175 kB compressed, and only the trends page loads it.
    build: { chunkSizeWarningLimit: 600 },
  },
});
