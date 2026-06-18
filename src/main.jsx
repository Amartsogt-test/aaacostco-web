import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

import buildInfo from './buildInfo.json';

// 🛡️ Recover from stale dynamic-import (lazy chunk) failures. After a deploy the
// old index may reference JS hashes that no longer exist; Vite fires this event.
// Reload ONCE (guarded by sessionStorage) to fetch the fresh build instead of
// showing a blank page.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('chunk-reloaded')) {
    sessionStorage.setItem('chunk-reloaded', '1');
    window.location.reload();
  }
});

// Automatically use the latest build timestamp as the cache-buster version
const APP_VERSION = buildInfo.buildTime;
const currentVersion = localStorage.getItem('appVersion');

const host = window.location.hostname;

// 🔐 Dedicated admin entry point. Point `admin.costco.mn` (a custom domain on the
// SAME Firebase Hosting site) here: it serves the same app but lands straight on
// /admin and is never shown the public-site maintenance screen. Access is still
// gated by AdminRoute + Firestore rules (DB/claim-based isAdmin), so the separate
// URL is for convenience/separation, not the security boundary itself.
const ADMIN_HOSTS = ['admin.costco.mn', 'www.admin.costco.mn'];
const isAdminHost = ADMIN_HOSTS.includes(host);
if (isAdminHost && window.location.pathname === '/') {
  window.history.replaceState(null, '', '/admin');
}

// Public-site maintenance screen — never applies to the admin host.
if (!isAdminHost && (host === 'costco.mn' || host === 'www.costco.mn')) {
  document.body.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px;">
      <h1 style="color: #333;">Сайт түр хугацаанд засвартай байна</h1>
      <p style="color: #666; margin-top: 10px;">Бид системдээ шинэчлэлт хийж байгаа тул түр хүлээнэ үү.</p>
    </div>
  `;
} else if (currentVersion !== APP_VERSION) {
  console.log('New version detected! Clearing cache...');
  
  // 1. Unregister Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }

  // 2. Clear Caches API
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }

  // 3. Update version & reload
  localStorage.setItem('appVersion', APP_VERSION);
  // Using setTimeout to allow unregistering to complete before reload
  setTimeout(() => {
    window.location.reload();
  }, 500);
} else {
  // Only render the app if we are not in the middle of a version reload
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
