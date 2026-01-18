import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: false, // We use a simpler strategy or have a separate manifest file
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: {
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production only
        drop_debugger: true,
      },
    },
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split vendor chunks from node_modules
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'ui-vendor';
            }
            // 🚀 NEW: Split large QR code library
            if (id.includes('html5-qrcode')) {
              return 'qr-scanner';
            }
            // 🚀 NEW: Split state management
            if (id.includes('zustand')) {
              return 'state-vendor';
            }
            // 🚀 NEW: Split Gemini AI SDK
            if (id.includes('@google/generative-ai')) {
              return 'ai-vendor';
            }
          }
          // Don't manually chunk admin pages - let Vite handle it via lazy loading
        },
      },
    },
    // Increase chunk size warning limit (we're code splitting properly)
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
    open: true
  },
  preview: {
    host: true
  }
})
