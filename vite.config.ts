import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,woff,woff2}'],
      },
      manifest: {
        name: 'ChatAS',
        short_name: 'ChatAS',
        description: 'End-to-end encrypted messaging. Private. Encrypted. Yours.',
        theme_color: '#6C63FF',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          { src: '/chatas.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/chatas.jpg', sizes: '512x512', type: 'image/jpeg' },
          { src: '/chatas.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'maskable' },
        ],
        categories: ['communication', 'social'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
