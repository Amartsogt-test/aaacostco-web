/**
 * Unified Web & Mobile WebView Permission Manager (`src/utils/permissions.js`)
 *
 * Handles device permissions across mobile WebViews (Android TWA/Capacitor, iOS WKWebView)
 * and standard mobile/desktop browsers:
 *  1. Geolocation / GPS (`requestUserLocation` + `reverseGeocodeAddress`)
 *  2. Camera (`requestCameraPermission`)
 *  3. Microphone (`requestMicrophonePermission`)
 *  4. Push / Local Notifications (`requestNotificationPermission`)
 */

/**
 * Request the user's current GPS coordinates (`{ lat, lng, accuracy }`).
 * Automatically falls back from high-accuracy GPS to network/Wi-Fi location if indoors.
 */
export function requestUserLocation({ timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Таны төхөөрөмж байршил тогтоогч (GPS) дэмжихгүй байна.'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                });
            },
            (err) => {
                // Fallback to low-accuracy (network/cell) if high-accuracy timed out
                if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            resolve({
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude,
                                accuracy: pos.coords.accuracy,
                            });
                        },
                        (fallbackErr) => {
                            reject(formatGeolocationError(fallbackErr));
                        },
                        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                    );
                    return;
                }
                reject(formatGeolocationError(err));
            },
            { enableHighAccuracy: true, timeout, maximumAge: 15000 }
        );
    });
}

function formatGeolocationError(err) {
    if (!err) return new Error('Байршил тогтооход алдаа гарлаа.');
    if (err.code === 1) {
        return new Error('Байршил тогтоох (GPS) зөвшөөрөл хаалттай байна. Утасныхаа тохиргооноос зөвшөөрнө үү.');
    }
    if (err.code === 2) {
        return new Error('GPS дохио олдсонгүй. Утасныхаа Location/GPS-ийг асаана уу.');
    }
    if (err.code === 3) {
        return new Error('Байршил тогтоох хугацаа хэтэрлээ. Дахин оролдоно уу.');
    }
    return new Error('Байршил тогтооход алдаа гарлаа.');
}

/**
 * Reverse-geocode `{ lat, lng }` into a human-readable Mongolian address string
 * via OpenStreetMap Nominatim. Returns empty string on failure.
 */
export async function reverseGeocodeAddress(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=mn,en`;
        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return '';
        const data = await res.json();
        const addr = data.address || {};
        const parts = [
            addr.city_district || addr.suburb || addr.county,
            addr.quarter || addr.neighbourhood,
            addr.road,
            addr.house_number || data.name,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : data.display_name || '';
    } catch {
        return '';
    }
}

/**
 * Explicitly request Camera access (`navigator.mediaDevices.getUserMedia({ video: true })`)
 * and immediately release the stream once granted.
 */
export async function requestCameraPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Камер дэмжихгүй байна.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
}

/**
 * Explicitly request Microphone access (`navigator.mediaDevices.getUserMedia({ audio: true })`)
 * and immediately release the stream once granted.
 */
export async function requestMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Микрофон дэмжихгүй байна.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
}
