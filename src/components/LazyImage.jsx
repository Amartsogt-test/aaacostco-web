import { useState, useRef, useEffect, memo } from 'react';

/**
 * 🚀 Optimize external product images.
 * Costco Korea's SAP Hybris media server ignores ?w= resize params and serves
 * the full 740px master image. We route those through the images.weserv.nl
 * resizing CDN, which actually downscales to the displayed size, converts to
 * WebP, and caches the result globally (so repeat loads are fast + resilient
 * even if the origin is slow/unavailable).
 *
 * Device-pixel-ratio is factored in (capped at 2x) so retina screens stay crisp.
 */
const isProxyableExternalImage = (url) =>
    /costco\.co\.kr|costcojapan|\/medias\//.test(url);

const optimizeImageUrl = (url, width = 300) => {
    // Proxy (images.weserv.nl) маш удаан байгаа тул түр хугацаанд зогсоож шууд эх сурвалжийн URL-ийг ашиглана.
    return url;
};

/**
 * LazyImage — optimized image component with:
 * - IntersectionObserver-based lazy loading
 * - Blur-up placeholder effect
 * - Error fallback with retry
 * - Smooth fade-in animation
 * - Automatic WebP conversion and resize for Costco images
 * - fetchpriority support for above-fold images
 */
const LazyImage = memo(function LazyImage({
    src,
    alt = '',
    className = '',
    placeholderColor = '#f3f4f6',
    width = 300,
    priority = false,
    ...props
}) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(priority); // priority images load immediately
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [useFallback, setUseFallback] = useState(false); // fall back to direct origin if proxy fails
    const imgRef = useRef(null);

    // Primary src goes through the resizing CDN; on failure we retry the direct origin URL.
    const optimizedSrc = useFallback ? src : optimizeImageUrl(src, width);

    const handleImgError = () => {
        if (!useFallback && optimizeImageUrl(src, width) !== src) {
            // Proxy failed — try the original origin URL once before giving up.
            setUseFallback(true);
        } else {
            setHasError(true);
        }
    };

    const handleImageLoad = (e) => {
        if (e.target && e.target.complete) {
            setIsLoaded(true);
        }
    };

    useEffect(() => {
        if (priority) return; // Skip observer for priority images

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '300px' } // Start loading 300px before visible
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, [priority]);

    const handleRetry = () => {
        if (retryCount < 2) {
            setHasError(false);
            setRetryCount(r => r + 1);
        }
    };

    return (
        <div
            ref={imgRef}
            className={`relative overflow-hidden ${className}`}
            style={{ backgroundColor: placeholderColor }}
        >
            {/* Blur placeholder */}
            {!isLoaded && !hasError && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
            )}

            {/* Actual image */}
            {isInView && !hasError && (
                <img
                    src={optimizedSrc}
                    alt={alt}
                    decoding="async"
                    fetchPriority={priority ? 'high' : 'auto'}
                    ref={e => {
                        if (e && e.complete) setIsLoaded(true);
                    }}
                    onLoad={handleImageLoad}
                    onError={handleImgError}
                    className={`w-full h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                    {...props}
                />
            )}

            {/* Error fallback with retry */}
            {hasError && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400 cursor-pointer"
                    onClick={handleRetry}
                >
                    <div className="text-center">
                        <span className="text-2xl">📷</span>
                        <p className="text-xs mt-1">{retryCount < 2 ? 'Дахин оролдох' : 'Зураг олдсонгүй'}</p>
                    </div>
                </div>
            )}
        </div>
    );
});

export default LazyImage;
