import { useState, useRef, useEffect } from 'react';

/**
 * LazyImage — optimized image component with:
 * - IntersectionObserver-based lazy loading
 * - Blur-up placeholder effect
 * - Error fallback
 * - Smooth fade-in animation
 */
export default function LazyImage({
    src,
    alt = '',
    className = '',
    placeholderColor = '#f3f4f6',
    ...props
}) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' } // Start loading 200px before visible
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, []);

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
                    src={src}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setHasError(true)}
                    className={`w-full h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                    {...props}
                />
            )}

            {/* Error fallback */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
                    <div className="text-center">
                        <span className="text-2xl">📷</span>
                        <p className="text-xs mt-1">Зураг олдсонгүй</p>
                    </div>
                </div>
            )}
        </div>
    );
}
