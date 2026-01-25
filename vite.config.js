import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Boats-Around/',
  plugins: [
    react(),
    cesium(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'BoatsAround',
        short_name: 'BoatsAround',
        description: 'Live Boat Traffic in 3D',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 // 6MB
      }
    })
  ],
  server: {
    proxy: {
      '/api/socket': {
        target: 'wss://stream.aisstream.io',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/socket/, '/v0/stream')
      }
    }
  }
})
