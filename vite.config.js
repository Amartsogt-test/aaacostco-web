import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['pwa-192x192.png', 'apple-touch-icon.png', 'pwa-512x512.png'],
      manifest: false, // We use a simpler strategy or have a separate manifest file
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/__/, /\/__/],
        // Don't precache the home snapshot — it changes with every catalog sync.
        // Precaching would lock the OLD copy into the service worker until the
        // next build. Instead we runtime-cache it (StaleWhileRevalidate) below so
        // it loads instantly from cache yet always refreshes in the background.
        globIgnores: ['**/qr-scanner-*.js', '**/home-snapshot.json', '**/search-index.json', '**/firebase-messaging-sw.js'],
        runtimeCaching: [
          {
            // 🚀 Home snapshot — instant from cache, always revalidated.
            urlPattern: /\/home-snapshot\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'home-snapshot',
              expiration: { maxEntries: 2, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // 🚀 Search index — instant from cache, refreshed in background.
            urlPattern: /\/search-index\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'search-index',
              expiration: { maxEntries: 2, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // 🚀 Cache Costco product images (CacheFirst = fastest repeat loads)
            urlPattern: /^https:\/\/www\.costco\.co\.kr\/.*\.(jpg|jpeg|png|webp|gif)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'costco-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 🚀 Cache Firebase Storage images
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 🚀 Cache self-hosted product images (public GCS objects)
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*\.(webp|jpg|jpeg|png)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'product-images',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 🚀 Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // 🚀 Cache Firestore API responses (StaleWhileRevalidate = fast + fresh)
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5 minutes
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
  build: {
    // Use esbuild for much faster minification (10-50x faster than terser)
    minify: 'esbuild',
    target: 'es2020', // Modern JS output for smaller bundles
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
              // Split rarely-needed Storage & Functions SDKs into their own async
              // chunks so they stay OUT of the eager firebase-vendor (Firestore +
              // Auth) bundle. They load on demand via uploadFileToStorage / callFunction.
              if (id.includes('firebase/storage') || id.includes('@firebase/storage')) {
                return 'firebase-storage';
              }
              if (id.includes('firebase/functions') || id.includes('@firebase/functions')) {
                return 'firebase-functions';
              }
              return 'firebase-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'ui-vendor';
            }
            // 🚀 Split large QR code library
            if (id.includes('html5-qrcode')) {
              return 'qr-scanner';
            }
            // 🚀 Split state management
            if (id.includes('zustand')) {
              return 'state-vendor';
            }
            // 🚀 Split mapping library
            if (id.includes('leaflet')) {
              return 'map-vendor';
            }
          }
          // Don't manually chunk admin pages - let Vite handle it via lazy loading
        },
      },
    },
    // Increase chunk size warning limit (we're code splitting properly)
    chunkSizeWarningLimit: 1000,
  },
  esbuild: {
    drop: ['console', 'debugger'], // Remove console.logs in production
  },
  server: {
    host: true,
    open: true
  },
  preview: {
    host: true
  }
})
