/**
 * Price Calculation Hook
 * Fetches exchange rate from Firebase and calculates MNT prices client-side
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Default exchange rate (fallback)
const DEFAULT_EXCHANGE_RATE = 2.55; // KRW -> MNT

/**
 * Hook to get exchange rate from Firebase with real-time updates
 */
export const usePricingSettings = () => {
    const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, 'settings', 'pricing'),
            (docSnap) => {
                if (docSnap.exists()) {
                    setExchangeRate(docSnap.data().exchangeRate || DEFAULT_EXCHANGE_RATE);
                }
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching exchange rate:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    return { exchangeRate, loading };
};

/**
 * Calculate MNT price from KRW
 * @param {number} priceKRW - Price in Korean Won
 * @param {number} exchangeRate - Exchange rate (KRW -> MNT)
 * @returns {number} - Price in MNT
 */
export const calculatePrice = (priceKRW, exchangeRate) => {
    if (!priceKRW || priceKRW <= 0) return 0;
    return Math.round(priceKRW * (exchangeRate || DEFAULT_EXCHANGE_RATE));
};

/**
 * Format price with thousand separators
 * @param {number} price - Price to format
 * @returns {string} - Formatted price (e.g., "1,234,567₮")
 */
export const formatPrice = (price) => {
    if (!price || price <= 0) return '0₮';
    return price.toLocaleString() + '₮';
};

/**
 * Hook to get calculated price for a product
 * @param {object} product - Product object with priceKRW
 * @returns {object} - { price, originalPrice, discount, formatted, loading }
 */
export const useProductPrice = (product) => {
    const { exchangeRate, loading } = usePricingSettings();

    if (loading || !product) {
        return {
            price: 0,
            originalPrice: 0,
            discount: 0,
            formatted: '...',
            originalFormatted: '',
            hasDiscount: false,
            loading: true
        };
    }

    const price = calculatePrice(product.priceKRW, exchangeRate);
    const originalPrice = product.originalPriceKRW
        ? calculatePrice(product.originalPriceKRW, exchangeRate)
        : price;

    const hasDiscount = originalPrice > price;
    const discount = hasDiscount
        ? Math.round((1 - price / originalPrice) * 100)
        : 0;

    return {
        price,
        originalPrice,
        discount,
        formatted: formatPrice(price),
        originalFormatted: hasDiscount ? formatPrice(originalPrice) : '',
        hasDiscount,
        loading: false
    };
};

export default usePricingSettings;
