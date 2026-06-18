import { useState, useEffect, useRef } from 'react';
import { productService } from '../services/productService';
import { useProductStore } from '../store/productStore';

export default function HeroBanner({ settingId = 'home_banner' }) {
    const [banners, setBanners] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isActive, setIsActive] = useState(true);
    const wonRate = useProductStore(state => state.wonRate);

    // Optimize Firebase storage URLs via weserv.nl proxy for WebP compression
    const optimizeBannerUrl = (url) => {
        if (!url) return url;
        if (url.includes('firebasestorage.googleapis.com')) {
            const stripped = url.replace(/^https?:\/\//, '');
            return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=1200&output=webp&q=85&we`;
        }
        return url;
    };

    // Touch swipe state
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // Configurable exchange rate text
    const [exchangeRateText, setExchangeRateText] = useState({
        line1: 'Солонгост хамгийн өндөр ханшаар',
        line2: 'воныг {rate} -аар бодож',
        line3: 'төгрөг шилжүүлж байна'
    });

    // Total slides = exchange rate slide + image banners
    const totalSlides = banners.length + 1;

    useEffect(() => {
        // Subscribe to real-time updates
        const unsubscribe = productService.onSettingsChange(settingId, (data) => {
            if (data && data.items && Array.isArray(data.items)) {
                // Filter active ones or just take all if we assume they are active
                setBanners(data.items.slice(0, 5));
            } else if (data && data.url) {
                // Fallback for old single banner format
                setBanners([{ url: data.url, type: data.type || 'image', title: data.title }]);
            } else {
                setBanners([]);
            }

            // Load exchange rate text if exists
            if (data && data.exchangeRateText) {
                setExchangeRateText(data.exchangeRateText);
            }

            if (data && data.isActive !== undefined) {
                setIsActive(data.isActive);
            } else {
                setIsActive(true); // default to true
            }

            setLoading(false);
        });

        return () => unsubscribe && unsubscribe();
    }, [settingId]);

    // Auto-rotate with variable duration (also handles index reset)
    useEffect(() => {
        // Include exchange rate slide in count
        const totalSlides = banners.length + 1;
        if (totalSlides <= 1) return;

        // Reset index if out of bounds (e.g. after banner deletion)
        if (currentIndex >= totalSlides) {
            const timer = setTimeout(() => setCurrentIndex(0), 0);
            return () => clearTimeout(timer);
        }

        const currentItem = currentIndex === 0
            ? { duration: 6 } // Exchange rate slide shows for 6 seconds
            : banners[currentIndex - 1];
        const duration = (currentItem?.duration || 5) * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % totalSlides);
        }, duration);

        return () => clearTimeout(timer);
    }, [currentIndex, banners, banners.length]);

    // Touch handlers for swipe
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const totalSlides = banners.length + 1;
        const diff = touchStartX.current - touchEndX.current;
        const minSwipeDistance = 50;

        if (Math.abs(diff) > minSwipeDistance) {
            if (diff > 0) {
                // Swipe left - next slide
                setCurrentIndex((prev) => (prev + 1) % totalSlides);
            } else {
                // Swipe right - previous slide
                setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
            }
        }
    };

    if (loading) {
        return (
            <div className="w-full bg-gray-200 animate-pulse aspect-[21/9] sm:aspect-[24/7] rounded-lg mb-4"></div>
        );
    }

    if (!isActive) {
        return null; // Do not render anything if banner is disabled
    }

    // Safely render line2, highlighting {rate} or any manual numbers in yellow
    const renderLine2 = () => {
        const line2 = exchangeRateText?.line2 || '';
        
        // If they still use {rate}, support it
        if (line2.includes('{rate}')) {
            const parts = line2.split('{rate}');
            return (
                <p className="text-xl sm:text-3xl font-bold mb-2">
                    {parts[0]}
                    <span className="text-yellow-300">{wonRate?.toFixed(2) || '...'}</span>
                    {parts.slice(1).join('{rate}')}
                </p>
            );
        }

        // If they type the number manually (e.g. "воныг 2.50 -аар"), highlight all numbers
        const parts = line2.split(/(\d+(?:[.,]\d+)?)/);
        return (
            <p className="text-xl sm:text-3xl font-bold mb-2">
                {parts.map((part, index) => {
                    // The capturing group in split makes odd indices the matched numbers
                    if (index % 2 === 1) {
                        return <span key={index} className="text-yellow-300">{part}</span>;
                    }
                    return part;
                })}
            </p>
        );
    };

    return (
        <div
            className="w-full relative overflow-hidden rounded-lg shadow-sm border border-gray-100 group touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
                {/* Exchange Rate Slide (First) */}
                <div className="relative w-full shrink-0 aspect-[21/9] sm:aspect-[24/7] bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600">
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                        <div className="text-center">
                            <p className="text-xl sm:text-3xl font-bold mb-1">{exchangeRateText.line1}</p>
                            {renderLine2()}
                            <p className="text-xl sm:text-3xl font-bold">{exchangeRateText.line3}</p>
                        </div>
                    </div>
                </div>

                {/* Image/Video Banners */}
                {banners.map((item, index) => {
                    if (!item) return null;
                    return (
                        <div key={index} className="relative w-full shrink-0 aspect-[21/9] sm:aspect-[24/7]">
                            {item.type === 'video' ? (
                                <video
                                    src={item.url}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <img
                                    src={optimizeBannerUrl(item.url)}
                                    alt={item.title || `Banner ${index + 1}`}
                                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${index + 1 === currentIndex ? 'opacity-100' : 'opacity-0'}`}
                                    loading={index === 0 ? "eager" : "lazy"}
                                    fetchPriority={index === 0 ? "high" : "auto"}
                                    decoding="async"
                                />
                            )}

                            {/* Optional Overlay Text */}
                            {item.title && (
                                <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                                    <h2 className="text-white text-2xl md:text-4xl font-bold drop-shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        {item.title}
                                    </h2>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pagination Dots */}
            {totalSlides > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {Array.from({ length: totalSlides }).map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentIndex(index)}
                            className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-white w-4' : 'bg-white/50'
                                }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

