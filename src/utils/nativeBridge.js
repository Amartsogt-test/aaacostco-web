/**
 * Capacitor Native Bridge (src/utils/nativeBridge.js)
 *
 * Configures native iOS (Apple App Store) and Android (Google Play Store)
 * runtime integration:
 *  - Native StatusBar styling (#005DA3 Costco Blue, light foreground)
 *  - Native SplashScreen hiding after React initial mount
 *  - Android hardware Back button navigation & root minimize behavior
 *  - Universal Links / App Links / custom URL scheme (`costcomn://`) deep-link routing
 */

import { Capacitor } from '@capacitor/core';

let initialized = false;

export function isNativeMobileApp() {
    try {
        if (Capacitor.isNativePlatform()) return true;
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search || '');
            if (params.get('app') === '1' || params.get('source') === 'app') {
                try {
                    sessionStorage.setItem('costco_native_app', '1');
                    localStorage.setItem('costco_native_app', '1');
                } catch { /* ignore */ }
                return true;
            }
            try {
                if (
                    sessionStorage.getItem('costco_native_app') === '1' ||
                    localStorage.getItem('costco_native_app') === '1'
                ) {
                    return true;
                }
            } catch { /* ignore */ }
            if (document.referrer && document.referrer.startsWith('android-app://')) {
                try {
                    sessionStorage.setItem('costco_native_app', '1');
                    localStorage.setItem('costco_native_app', '1');
                } catch { /* ignore */ }
                return true;
            }
            if (
                window.matchMedia &&
                (window.matchMedia('(display-mode: standalone)').matches ||
                    window.matchMedia('(display-mode: fullscreen)').matches ||
                    window.matchMedia('(display-mode: minimal-ui)').matches)
            ) {
                return true;
            }
            if (window.navigator?.standalone === true) {
                return true;
            }
            const ua = window.navigator?.userAgent || '';
            // Android WebView (`; wv)`), Capacitor bridge, or iOS WKWebView (AppleWebKit without Safari)
            if (
                /;\s*wv\)/i.test(ua) ||
                /Capacitor/i.test(ua) ||
                /((iPhone|iPod|iPad).*AppleWebKit(?!.*Safari))/i.test(ua)
            ) {
                try {
                    sessionStorage.setItem('costco_native_app', '1');
                } catch { /* ignore */ }
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

export async function initNativeMobileApp(navigateCallback) {
    if (initialized || !Capacitor.isNativePlatform()) return;
    initialized = true;

    try {
        const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
            import('@capacitor/status-bar'),
            import('@capacitor/splash-screen'),
            import('@capacitor/app'),
        ]);

        // 1. Style the StatusBar for iOS & Android
        try {
            await StatusBar.setStyle({ style: Style.Dark });
            if (Capacitor.getPlatform() === 'android') {
                await StatusBar.setBackgroundColor({ color: '#005DA3' });
            }
        } catch {
            /* ignore on unsupported webview */
        }

        // 2. Hide native SplashScreen smoothly
        try {
            await SplashScreen.hide({ fadeOutDuration: 300 });
        } catch {
            /* ignore */
        }

        // 3. Handle Android hardware back button
        App.addListener('backButton', ({ canGoBack }) => {
            const path = window.location.pathname;
            if (canGoBack && path !== '/') {
                window.history.back();
            } else if (path !== '/') {
                if (typeof navigateCallback === 'function') {
                    navigateCallback('/');
                } else {
                    window.location.href = '/';
                }
            } else {
                App.minimizeApp();
            }
        });

        // 4. Handle Universal Links / App Links & costcomn:// deep links
        App.addListener('appUrlOpen', (event) => {
            if (!event?.url) return;
            try {
                const parsed = new URL(event.url);
                let targetPath = parsed.pathname || '/';
                if (parsed.protocol === 'costcomn:') {
                    targetPath = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, '/');
                }
                const fullTarget = `${targetPath}${parsed.search || ''}`;
                if (typeof navigateCallback === 'function') {
                    navigateCallback(fullTarget);
                } else {
                    window.location.href = fullTarget;
                }
            } catch {
                /* ignore malformed URL */
            }
        });
    } catch (err) {
        console.warn('[NativeBridge] Initialization warning:', err);
    }
}
