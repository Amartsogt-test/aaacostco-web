import { callFunction, ensureSignedIn } from '../firebase';

// Cloud Function proxy — API key stays server-side. Functions SDK loads lazily.
// aiProxy now requires an authenticated caller (anti-abuse / denial-of-wallet),
// so make sure a Firebase session exists first — guests get an anonymous one.
const callAI = async (data) => {
    await ensureSignedIn();
    return callFunction('aiProxy', data);
};

export const aiService = {
    /**
     * Generates a concise, helpful summary of the product in Mongolian.
     */
    async generateProductSummary(product) {
        // Use persisted short description if available (Instant, No API call)
        if (product.shortDescription && product.shortDescription.length > 5) {
            return product.shortDescription;
        }

        try {
            // Send only the fields needed for summary
            const minimalProduct = {
                name: product.name,
                name_mn: product.name_mn,
                englishName: product.englishName,
                brand: product.brand,
                price: product.price,
                shortDescription: product.shortDescription,
                specifications: product.specifications || product.classifications,
                description_mn: (product.description_mn || '').substring(0, 1000),
                description_en: (product.description_en || product.description || '').substring(0, 1000)
            };
            const result = await callAI({
                action: 'generateSummary',
                payload: { product: minimalProduct }
            });
            return result.data.response;
        } catch {
            // Fallback to static summary if AI fails
            const name = product.name_mn || product.name;
            const price = (product.price || 0).toLocaleString();
            const rawDesc = product.description_mn || product.description_en || product.description || '';
            const desc = rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);

            const parts = [`📦 ${name}`, `💰 Үнэ: ${price}₮`];
            if (desc) parts.push(`📌 ${desc}...`);
            return parts.join('\n\n');
        }
    }
};
