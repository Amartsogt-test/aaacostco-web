import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// Cloud Function proxy — API key stays server-side
const callAI = httpsCallable(functions, 'aiProxy');

export const aiService = {
    /**
     * Analyzes user message to see if they are looking for a product.
     * Returns keywords or null.
     */
    async parseIntent(message) {
        try {
            const result = await callAI({ action: 'parseIntent', payload: { message } });
            return result.data;
        } catch (error) {
            console.warn('AI parseIntent failed:', error.message);
            return { isSearch: false, mustHave: [], synonyms: [], excludeTerms: [], predictedCategory: "" };
        }
    },

    /**
     * Generates a friendly Mongolian response based on found products.
     */
    async generateRecommendationResponse(userMessage, products) {
        try {
            // Send only minimal product data to reduce payload size
            const minimalProducts = (products || []).map(p => ({
                name: p.name,
                name_mn: p.name_mn,
                price: p.price
            }));
            const result = await callAI({
                action: 'generateRecommendation',
                payload: { userMessage, products: minimalProducts }
            });
            return result.data.response;
        } catch {
            return "Таны хайсан барааг манайхаас оллоо. Сонгож үзээрэй.";
        }
    },

    /**
     * Smart Search: Takes a user query and returns expanded keywords
     * to help the local product search find better matches.
     */
    async smartSearch(term) {
        const intent = await this.parseIntent(term);

        if (!intent || !intent.isSearch) {
            return {
                mustHave: [term.toLowerCase()],
                synonyms: [],
                excludeTerms: [],
                predictedCategory: ""
            };
        }

        return intent;
    },

    /**
     * Calculates the total shipping weight of a product using AI.
     * Analyzes product name, specs, and description to find the final KG weight.
     */
    async calculateProductWeight(product) {
        try {
            // Send only the fields needed for weight calculation
            const minimalProduct = {
                name: product.name,
                name_mn: product.name_mn,
                englishName: product.englishName,
                brand: product.brand,
                specifications: product.specifications || product.classifications,
                description_mn: (product.description_mn || '').substring(0, 500),
                description_en: (product.description_en || product.description || '').substring(0, 500)
            };
            const result = await callAI({
                action: 'calculateWeight',
                payload: { product: minimalProduct }
            });
            return result.data;
        } catch (error) {
            console.warn('AI calculateWeight failed:', error.message);
            return null;
        }
    },

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

            const parts = [`✨ ${name}`, `💰 Үнэ: ${price}₮`];
            if (desc) parts.push(`📝 ${desc}...`);
            return parts.join('\n\n');
        }
    }
};
