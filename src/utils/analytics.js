// @ts-check
/**
 * analytics.js — minimal Google Analytics 4 wrapper.
 *
 * Gated on VITE_GA_ID: a complete no-op until you put a real GA4 Measurement ID
 * (G-XXXXXXXXXX) in .env.local (VITE_GA_ID=G-XXXX). Once set, initGA() injects
 * gtag.js and trackEvent() sends the standard e-commerce funnel events
 * (add_to_cart → begin_checkout → purchase) so you can see where shoppers drop.
 */
const GA_ID = import.meta.env.VITE_GA_ID || '';
let inited = false;

export function initGA() {
    if (inited || !GA_ID || typeof window === 'undefined' || typeof document === 'undefined') return;
    inited = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];

    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
}

export function trackEvent(name, params = {}) {
    if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params); } catch { /* ignore */ }
}
