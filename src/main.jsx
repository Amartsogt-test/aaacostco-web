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
// SAME hosting site) here: it serves the same app but lands straight on
// /admin and is never shown the public-site maintenance screen. Access is still
// gated by AdminRoute (DB/JWT-based isAdmin), so the separate
// URL is for convenience/separation, not the security boundary itself.
const ADMIN_HOSTS = ['admin.costco.mn', 'www.admin.costco.mn'];
const isAdminHost = ADMIN_HOSTS.includes(host);
if (isAdminHost && window.location.pathname === '/') {
  window.history.replaceState(null, '', '/admin');
}

// First-time visitors simply record current build version without reloading.
if (!currentVersion) {
  try { localStorage.setItem('appVersion', APP_VERSION); } catch { /* ignore */ }
}

if (currentVersion && currentVersion !== APP_VERSION) {
  console.log('New version detected! Clearing cache...');
  try { localStorage.setItem('appVersion', APP_VERSION); } catch { /* ignore */ }

  const cleanupTasks = [];
  if ('serviceWorker' in navigator) {
    cleanupTasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((r) => r.unregister()))
      ).catch(() => {})
    );
  }
  if ('caches' in window) {
    cleanupTasks.push(
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      ).catch(() => {})
    );
  }

  Promise.allSettled(cleanupTasks).finally(() => {
    window.location.reload();
  });
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
