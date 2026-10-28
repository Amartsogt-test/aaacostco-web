// aiService — Cloudflare Worker only (Firebase removed).
// The Gemini API key stays server-side behind the Worker /api/ai/summary endpoint. If the
// key isn't configured (or the call fails), we fall back to a static product summary.
import { aiApi } from './apiClient';

export const aiService = {
    async generateProductSummary(product) {
        // Persisted short description wins (instant, no API call).
        if (product.shortDescription && product.shortDescription.length > 5) {
            return product.shortDescription;
        }
        try {
            const minimalProduct = {
                name: product.name,
                name_mn: product.name_mn,
                englishName: product.englishName,
                brand: product.brand,
                price: product.price,
                shortDescription: product.shortDescription,
                specifications: product.specifications || product.classifications,
                description_mn: (product.description_mn || '').substring(0, 1000),
                description_en: (product.description_en || product.description || '').substring(0, 1000),
            };
            const result = await aiApi.summary(minimalProduct);
            if (result?.response) return result.response;
            throw new Error('no-ai');
        } catch {
            // Static fallback.
            const name = product.name_mn || product.name;
            const price = (product.price || 0).toLocaleString();
            const rawDesc = product.description_mn || product.description_en || product.description || '';
            const desc = rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
            const parts = [`📦 ${name}`, `💰 Үнэ: ${price}₮`];
            if (desc) parts.push(`📌 ${desc}...`);
            return parts.join('\n\n');
        }
    },
};
