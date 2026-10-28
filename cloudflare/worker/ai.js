/**
 * ai.js — Worker-side AI proxy (replaces the Firebase aiProxy Cloud Function). Keeps the
 * Gemini API key server-side. Requires an authenticated caller (anti-abuse). If
 * GEMINI_API_KEY isn't configured the endpoint returns { response: null } so the client
 * falls back to its static product summary.
 *
 *   POST /api/ai/summary { product }  (authed) → { response }
 */

const MODEL = 'gemini-2.5-flash';

export async function aiSummary(body, env) {
  const key = env.GEMINI_API_KEY;
  const product = body?.product || {};
  if (!key) return { status: 200, data: { response: null } }; // not configured → client fallback
  const prodId = String(product.id || product.code || '').trim();
  const cacheKey = prodId ? `ai_summary:${prodId}` : null;
  if (cacheKey && env.CACHE) {
    try {
      const hit = await env.CACHE.get(cacheKey);
      if (hit) return { status: 200, data: { response: hit, cached: true } };
    } catch { /* ignore */ }
  }

  const prompt = [
    'Доорх бүтээгдэхүүний талаар Монгол хэлээр, 2-3 өгүүлбэрт багтаасан товч, ойлгомжтой танилцуулга бич.',
    'Зөвхөн танилцуулгын текстийг буцаа.',
    '',
    `Нэр: ${product.name_mn || product.name || ''}`,
    `Англи нэр: ${product.englishName || ''}`,
    `Брэнд: ${product.brand || ''}`,
    `Тайлбар: ${(product.description_mn || product.description_en || '').toString().slice(0, 1000)}`,
  ].join('\n');

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!r.ok) { console.error('Gemini error:', await r.text()); return { status: 200, data: { response: null } }; }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (text && cacheKey && env.CACHE) {
      try { await env.CACHE.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 * 30 }); } catch { /* ignore */ }
    }
    return { status: 200, data: { response: text } };
  } catch (e) {
    console.error('aiSummary failed:', e?.message);
    return { status: 200, data: { response: null } };
  }
}

export async function aiScan(body, env, user) {
  if (!user?.uid) return { status: 401, data: { error: 'unauthenticated' } };
  const key = env.GEMINI_API_KEY;
  if (!key) return { status: 500, data: { error: 'Gemini API key not configured' } };

  const imageBase64 = body?.imageBase64;
  if (!imageBase64) return { status: 400, data: { error: 'Image Base64 data is required' } };

  const prompt = `
  You are a highly accurate, professional OCR and logistics extraction AI for Costco South Korea warehouse price tags.
  Analyze the provided image of a Costco price tag and extract all available product details. We only process South Korean tags.

  CRITICAL EXTRACTION RULES:
  1. PRODUCT CODE:
     - Look for a 6 or 7-digit code (e.g., "618081", "624871", "680428", "789157"). This is extremely important.
     - If the code is followed by an asterisk (*) or plus (+), extract it but do NOT include the * or + in the "code" field.

  2. PRODUCT NAME & BRAND:
     - "extractedName": Full Korean and English product name as written on the label. Keep it complete but clean.
     - "extractedBrand": Extract the brand name in uppercase if present (e.g., "KIRKLAND SIGNATURE", "STARBUCKS", "SAMSUNG", "TCL", "CJ").

  3. BUNDLE / PACKAGE QUANTITY (БАГЦ ДОТОРХ ШИРХЭГ):
     - Look closely at the product name and descriptions for bundle/pack details: "940G X 2", "1L 4개", "24개입", "48P", "30롤", "24/12 OZ", "2/40 OZ", "12 CT".
     - "packageQuantity": Extract the integer count of individual items inside this single bundle/pack (e.g., for "940G X 2" extract 2; for "1L 4개" extract 4; for "30롤" extract 30; for "48P" extract 48; for "24/12 OZ" extract 24; if it is just a single item without any bundle info, extract 1).
     - "packageUnit": The unit of measurement for individual items (e.g., "개", "팩", "롤", "병", "포", "P", "ct", "oz", "cup").
     - "extractedBundleInfo": The exact raw string representing this bundle/pack configuration from the label (e.g., "940G X 2", "1L 4개", "48P", "30롤", "24/12 OZ").
     - "unitSize": The weight/size of a single item in the bundle (e.g., "940G", "1L", "120g", "12 OZ", "40m").

  4. PRICES & DISCOUNTS:
     - "extractedPrice": The final checkout price in KRW (large numbers at the bottom). Clean it of commas and symbols, return as a whole integer (e.g., 10990).
     - "extractedOriginalPrice": The original price before discount. If there is no discount, this equals "extractedPrice".
     - "extractedDiscount": The discount amount (e.g., 4000). Return 0 if no discount.
     - "hasDiscount": true if there is an explicit discount highlight, "할인행사", "원 할인", or strike-through price.

  5. SUPPLY STATUS & SPECIAL SYMBOLS:
     - "isDiscontinued": true if an asterisk (*) is present next to the product code or in the upper-right corner.
     - "restockStatus": "no_restock" if asterisk (*) is found, "uncertain" if plus (+) is found, otherwise "normal".
     - "priceSecret": "clearance" if the price ends in 70 (e.g. 19,970원), "store_markdown" if it ends in 00 (e.g. 20,000원), "standard" if it ends in 90 (e.g. 19,990원).

  6. LOGISTICS & MEASUREMENTS:
     - "tagDate": Find any printed printing date stamp if visible (usually very small text on the bottom-right or bottom-left of the tag, e.g. "2026/05/19", "11/15/23"). Return as string.
     - "weightKg": Calculate the total net shipping weight in kilograms if possible (e.g., for "940G X 2", weight is 1.88; for "1L 4개", weight is 4.0; for liquids, 1 Liter = 1 Kilogram). If not possible to calculate, return null.
     - "dimensions": Look for dimensions in the specifications (e.g., "크기: 545 X 1,430 X 600MM" or "700x1,755x672MM").
       * Extract to this object structure: { lengthCm: number, widthCm: number, heightCm: number }
       * Convert MM to CM by dividing by 10 (e.g. 545mm becomes 54.5cm, 1430mm becomes 143cm, 600mm becomes 60cm). If no dimensions are found, return null.

  7. SPECIFICATIONS:
     - "extractedSpecs": Extract any other sub-info, bulleted specs (e.g., "▶모델명: RT42CG6024S9", "100g당 585원", "원산지 : 베트남") as a clean text string.

  Respond STRICTLY in this JSON structure:
  {
    "code": "string (6 or 7-digit code)",
    "extractedName": "string",
    "extractedBrand": "string",
    "packageQuantity": number,
    "packageUnit": "string",
    "extractedBundleInfo": "string",
    "unitSize": "string",
    "extractedPrice": number,
    "extractedOriginalPrice": number,
    "extractedDiscount": number,
    "hasDiscount": boolean,
    "isDiscontinued": boolean,
    "restockStatus": "normal" | "no_restock" | "uncertain",
    "priceSecret": "standard" | "clearance" | "store_markdown",
    "tagDate": "string",
    "weightKg": number | null,
    "dimensions": {
      "lengthCm": number,
      "widthCm": number,
      "heightCm": number
    } | null,
    "extractedSpecs": "string"
  }
  `;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        }),
      }
    );
    if (!r.ok) { console.error('Gemini error:', await r.text()); return { status: 500, data: { error: 'AI processing failed' } }; }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (!text) return { status: 500, data: { error: 'Empty response from AI' } };
    
    let resultJson;
    try {
      resultJson = JSON.parse(text);
    } catch {
      const jsonStr = text.replace(/`{3}json|`{3}/g, "").trim();
      resultJson = JSON.parse(jsonStr);
    }
    
    return { status: 200, data: resultJson };
  } catch (e) {
    console.error('aiScan failed:', e?.message);
    return { status: 500, data: { error: e?.message } };
  }
}
