import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути — обязательно для itch.io и Яндекс Игр,
  // которые раздают билд из произвольной поддиректории.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
});
