import { GoogleGenerativeAI } from "@google/generative-ai";

// Fetch the API Key. Note: In a client-side Vite app, 
// environment variables must be prefixed with VITE_.
const getApiKey = () => import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash-exp";

export const aiService = {
    /**
     * Analyzes user message to see if they are looking for a product.
     * Returns keywords or null.
     */
    async parseIntent(message) {
        const apiKey = getApiKey();
        if (!apiKey) {
            console.error("❌ AI Shopper: CRITICAL - VITE_GEMINI_API_KEY is missing!");
            return { isSearch: false, isGreeting: true, generalResponse: "Сайн байна уу? Надад одоогоор хариулах боломж алга байна (API Key тохируулаагүй байна)." };
        }

        const tryModel = async (modelId, useJsonMode = true) => {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelId,
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            });

            const prompt = `
            You are a helpful AI Personal Shopper for a Costco import store in Mongolia.
            Analyze the user's search query: "${message}"

            Intent analysis requirements:
            1. isSearch: true if they are looking for specific products.
            2. mustHave: Array of the MOST CRITICAL English keywords that MUST be in the product name or category (e.g. for "cooking oil" -> ["oil", "cooking"]).
            3. synonyms: Array of secondary keywords or synonyms in Mongolian and English (e.g. ["тос", "хүнсний"]).
            4. excludeTerms: Array of keywords to EXCLUDE. If the user wants food oil, exclude non-food oils like ["face", "body", "lotion", "motor", "engine"].
            5. predictedCategory: A likely category name (e.g. "Oil", "Coffee", "Electronics").

            Respond strictly in this JSON structure:
            {
              "isSearch": boolean,
              "mustHave": string[],
              "synonyms": string[],
              "excludeTerms": string[],
              "predictedCategory": string
            }
            `;

            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: useJsonMode ? { responseMimeType: "application/json" } : {}
            });
            const response = await result.response;
            const text = response.text();

            try {
                return JSON.parse(text);
            } catch {
                const jsonStr = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonStr);
            }
        };

        try {
            return await tryModel(GEMINI_MODEL);
        } catch (error) {
            console.warn(`⚠️ AI Shopper: ${GEMINI_MODEL} failed, falling back...`, error.message);
            try {
                return await tryModel("gemini-1.5-flash", false);
            } catch (fallbackError) {
                console.error("❌ AI Shopper: All models failed", fallbackError);
                return { isSearch: false, mustHave: [], synonyms: [], excludeTerms: [], predictedCategory: "" };
            }
        }
    },

    /**
     * Generates a friendly Mongolian response based on found products.
     */
    async generateRecommendationResponse(userMessage, products) {
        const apiKey = getApiKey();
        if (!apiKey) return "Бид эдгээр бараануудыг оллоо. Та сонирхож үзээрэй.";

        const tryRec = async (modelId) => {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelId,
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            });

            const productInfo = products.map(p => `- ${p.name_mn || p.name} (${(p.price || 0).toLocaleString()}₮)`).join("\n");
            const prompt = `
            You are a helpful AI Personal Shopper for "AAA Costco" in Mongolia.
            User asked: "${userMessage}"
            We found these products in our local store:
            ${productInfo}
            
            Write a short, friendly response in Mongolian (Ulaanbaatar dialect) recommending these items.
            Keep it concise (max 3 sentences).
            `;

            const result = await model.generateContent(prompt);
            return result.response.text();
        };

        try {
            return await tryRec(GEMINI_MODEL);
        } catch {
            try {
                return await tryRec("gemini-1.5-flash");
            } catch {
                return "Таны хайсан барааг манайхаас оллоо. Сонгож үзээрэй.";
            }
        }
    },

    /**
     * Smart Search: Takes a user query and returns expanded keywords
     * to help the local product search find better matches.
     */
    async smartSearch(term) {
        console.log("🤖 AI Shopper: Advanced Smart Search for:", term);
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
     * Calculates the total shipping weight of a product using Gemini AI.
     * Analyzes product name, specs, and description to find the final KG weight.
     */
    async calculateProductWeight(product) {
        const apiKey = getApiKey();
        if (!apiKey) return null;

        const productContext = `
            Name (MN): ${product.name_mn || ''}
            Name (EN): ${product.englishName || product.name || ''}
            Brand: ${product.brand || ''}
            Specs: ${JSON.stringify(product.specifications || product.classifications || [])}
            Description (MN): ${(product.description_mn || '').substring(0, 500)}
            Description (EN): ${(product.description_en || product.description || '').substring(0, 500)}
        `;

        const tryWeight = async (modelId) => {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelId,
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            });

            const prompt = `
            You are a logistics expert specializing in Costco products.
            Analyze this product information and calculate the TOTAL SHIPPING WEIGHT in Kilograms (kg).

            PRODUCT INFO:
            ${productContext}

            CRITICAL RULES:
            1. MULTIPLIERS ARE VITAL: If names include "x 40", "x 12", "x 6", "x 2", etc., you MUST multiply the unit weight.
               Example: "340g x 6" -> 0.34 * 6 = 2.04kg
               Example: "2.83L x 2" -> 2.83 * 2 = 5.66kg (Liquids 1L ≈ 1kg)
            2. PRODUCT TYPE CONVERSION:
               - Liquids (ml, L): 1 liter = 1kg.
               - Grains/Powders (g, kg): Direct weight.
            3. IGNORE DIMENSIONS: "74cm x 74cm" or "size 32" are NOT weights. Do not use them in calculation.
            4. PACKAGE OVERHEAD: Add 5% extra for heavy bulk items or glass bottled items.
            5. ESTIMATION: If no explicit weight is found, use your internal knowledge of typical Costco product sizes.
               - Typical large detergent: 5-8kg
               - Typical snack box: 0.5-1.5kg
               - Typical multi-vitamins: 0.3-0.5kg
            
             6. WAREHOUSE PRICE ESTIMATION (Online markup vs Store price):
                Costco Online prices often include a shipping markup (배송비). 
                However, NOT all products are cheaper in-store. 
                Estimate the "Shipping Markup" (배송비) in KRW:
                - Electronics, Laptops, Mobile, Luxury Watches, High-end Appliances: Usually 0 KRW markup (Online Price = Store Price).
                - Heavy/Bulky Food, Water, Detergent, Large Packs (>5kg): Usually 3,000 - 5,000 KRW markup.
                - Standard Grocery/Daily Essentials: Usually 2,000 KRW markup.
                - If the product is already marked as "Sale/Discounted" online, the markup might be 0.
                - If unsure if it's cheaper in-store: Use 0 KRW (Safer to assume no discount).

            Return JSON only:
            {
              "weightKg": number,
              "reason": "short explanation in Mongolian",
              "confidence": "high" | "medium" | "low",
              "estimatedMarkupKrw": number
            }
            `;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            try {
                return JSON.parse(text);
            } catch {
                const jsonStr = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonStr);
            }
        };

        try {
            return await tryWeight(GEMINI_MODEL);
        } catch (error) {
            console.warn(`⚠️ AI Weight: ${GEMINI_MODEL} failed, trying fallback...`, error.message);
            try {
                return await tryWeight("gemini-1.5-flash");
            } catch {
                console.error("❌ AI Weight: All models failed");
                return null;
            }
        }
    },

    /**
     * Generates a concise, helpful summary of the product in Mongolian.
     */
    async generateProductSummary(product) {
        const apiKey = getApiKey();
        if (!apiKey) return "AI тохиргоо хийгдээгүй байна.";

        // 1. Use persisted short description if available (Instant, No API)
        if (product.shortDescription && product.shortDescription.length > 5) {
            return product.shortDescription;
        }

        const productContext = `
            Name (MN): ${product.name_mn || product.name || ''}
            Name (EN): ${product.englishName || ''}
            Brand: ${product.brand || ''}
            Price: ${product.price || ''}
            Specs: ${JSON.stringify(product.specifications || product.classifications || [])}
            Description (MN): ${(product.description_mn || '').substring(0, 1000)}
            Description (EN): ${(product.description_en || product.description || '').substring(0, 1000)}
        `;

        const trySummary = async (modelId) => {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: modelId,
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
                ]
            });

            const prompt = `
            You are a helpful Costco Personal Shopper.
            Write a SHORT, CONCISE summary of this product in MONGOLIAN (Ulaanbaatar dialect).
            
            PRODUCT INFO:
            ${productContext}

            REQUIREMENTS:
            1. **Key Benefits**: What is it? Why is it good? (1 sentence).
            2. **Usage/Specs**: Quantity, size, or how to use (1 sentence).
            3. **Tone**: Helpful, friendly, professional.
            4. **Format**: Plain text, max 3-4 lines. NO bullet points, just a nice paragraph.
            5. **Language**: Natural Mongolian (e.g. "Энэ бол...", "Та үүнийг...").
            
            Example:
            "Энэ бол Kirkland брэндийн органик оливийн тос юм. 2 литрийн савлагаатай тул удаан хэрэглэхэд тохиромжтой ба хоол хийх болон салатанд хийж идэхэд нэн тохиромжтой эрүүл бүтээгдэхүүн юм."
            `;

            const result = await model.generateContent(prompt);
            return result.response.text();
        };

        try {
            return await trySummary(GEMINI_MODEL);
        } catch {
            try {
                return await trySummary("gemini-1.5-flash");
            } catch {
                // Fallback to static summary if AI fails
                const name = product.name_mn || product.name;
                const price = (product.price || 0).toLocaleString();
                const desc = (product.description_mn || product.description_en || product.description || '').substring(0, 300);

                return `✨ **${name}**\n\n💰 Үнэ: ${price}₮\n\n📝 ${desc}${desc.length > 300 ? '...' : ''}`;
            }
        }
    }
};
