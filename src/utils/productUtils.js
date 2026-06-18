export const getProductWeight = (prod) => {
    if (!prod) return null;

    const parseValue = (val, rawUnit) => {
        const unit = rawUnit.toLowerCase();
        let num = parseFloat(val);
        if (['l', '리터'].includes(unit)) return { weight: num, unit: 'kg' };
        if (['ml', '미리리터'].includes(unit)) return { weight: num / 1000, unit: 'kg' };
        if (['kg', 'кг'].includes(unit)) return { weight: num, unit: 'kg' };
        if (['g', 'гр', 'грамм', 'г'].includes(unit)) return { weight: num / 1000, unit: 'kg' };
        return { weight: num, unit: 'kg' };
    };

    const calculateTotal = (text) => {
        if (!text) return null;
        // Find patterns like 1.5L, 500g, 190ml
        const unitRegex = /(\d+(?:\.\d+)?)\s*(kg|g|кг|гр|грамм|г|l|ml|리터|미리리터)\b/i;
        const unitMatch = text.match(unitRegex);

        if (unitMatch) {
            const baseVal = unitMatch[1];
            const rawUnit = unitMatch[2];
            const { weight } = parseValue(baseVal, rawUnit);

            // NEW CONSTANT: Regex for checking if a multiplier is part of a dimension
            // Look for patterns like "L 16.5 x", "16.5cm x", "x 28.0cm"
            // We'll trust that valid count multipliers are usually integers (e.g. 2, 24, 100).
            // Non-integers (1.5, 16.5) are almost always dimensions or weights, not counts.

            const _isDimension = (str, index, fullStr) => {
                // Check immediate context
                const pre = fullStr.substring(0, index).trim();
                const post = fullStr.substring(index).trim();

                // If preceded by L, W, H, D (case insensitive)
                if (/[LWHD]\s*$/i.test(pre)) return true;

                // If followed by unit of length (cm, mm, in)
                if (/^\s*\d+(?:\.\d+)?\s*(?:cm|mm|in|inch)/i.test(post)) return true; // checking what comes AFTER the 'x'

                return false;
            };

            // Find multipliers after (x 24 x 2)
            const afterPart = text.substring(unitMatch.index + unitMatch[0].length);
            // Match float or int multipliers
            const multipliersIterator = afterPart.matchAll(/[xX*]\s*(\d+(?:\.\d+)?)/g);
            const multipliers = [];

            for (const m of multipliersIterator) {
                const val = parseFloat(m[1]);
                const matchIndex = m.index;
                const precedingText = afterPart.substring(0, matchIndex).trim();

                // 1. Skip if nested unit (e.g. mg x 100)
                if (/(?:kg|g|кг|гр|грамм|г|l|ml|리터|미리리터|mg|мг)$/i.test(precedingText)) continue;

                // 2. Skip if it looks like a dimension (e.g. 16.5cm) OR if it's a non-integer (counts are usually integers)
                // We assume counts like "x 1.5" are rare/invalid for "units", likely dimensions or weight multipliers handled by main regex.
                if (!Number.isInteger(val)) continue;

                // Calculate post-match text for context checks
                const endOfMatchIndex = matchIndex + m[0].length;
                const post = afterPart.substring(endOfMatchIndex).trim();

                // 3. Skip if followed by another multiplier (indicates dimension chain: 74 x 74)
                if (/^[xX*]\s*\d/i.test(post)) continue;

                // 4. Skip if followed by known dimension unit (cm, mm, in, m)
                if (/^(?:cm|mm|in|inch|m)\b/i.test(post)) continue;

                multipliers.push(val);
            }

            // Check for multipliers before (2 x 24 x 500g)
            // Use float regex to avoid splitting "16.5" into "5"
            const beforePart = text.substring(0, unitMatch.index);
            const preMultipliersIterator = beforePart.matchAll(/(\d+(?:\.\d+)?)\s*[xX*]/g);
            const preMultipliers = [];

            for (const m of preMultipliersIterator) {
                const val = parseFloat(m[1]);
                const matchIndex = m.index;

                // 1. Skip non-integers (likely dimensions like 16.5 x)
                if (!Number.isInteger(val)) continue;

                // 2. Check overlap with dimensions (L 16 x, Diameter 325 x)
                const pre = beforePart.substring(0, matchIndex).trim();
                if (/[LWHD]$/i.test(pre)) continue;
                // Add check for Mongolian/English dimension words
                if (/(?:diameter|radius|width|height|depth|long|length|диаметр|өндөр|өргөн|гүн|урт|size|хэмжээ)$/i.test(pre)) continue;

                preMultipliers.push(val);
            }

            const allMultipliers = [...preMultipliers, ...multipliers];

            let total = weight;
            allMultipliers.forEach(m => { if (m > 0) total *= m; });

            const formatted = total >= 1
                ? `${parseFloat(total.toFixed(1))}kg`
                : `${Math.round(total * 1000)}g`;

            return { original: unitMatch[0], multipliers: allMultipliers, total: formatted };
        }
        return null;
    };

    // -1. Priority: Explicit weightKg (from new admin fields)
    if (prod.weightKg !== undefined && prod.weightKg !== null) {
        return { label: 'Жин:', value: `${parseFloat(prod.weightKg).toFixed(1)}kg` };
    }

    // 0. Priority: Explicit Weight Field (from cache/scraper/manual edit)
    if (prod.weight) {
        // If it's a number, format it. If string, just show it.
        const val = typeof prod.weight === 'number'
            ? `${parseFloat(prod.weight.toFixed(1))}kg`
            : prod.weight;
        return { label: 'Жин:', value: val };
    }

    // 0.1 Priority: AI Calculated Weight (Fallback if no manual weight)
    if (prod.aiWeight) {
        return { label: 'Жин:', value: `${parseFloat(Number(prod.aiWeight).toFixed(1))}kg` };
    }

    // 1. Try classifications
    if (prod?.classifications) {
        for (const cls of prod.classifications) {
            if (cls.features) {
                for (const feature of cls.features) {
                    const fName = feature.name || '';
                    if (['용량', '중량', '크기', '수량', 'Weight', 'Capacity', 'Size', 'Volume'].some(k => fName.includes(k))) {
                        const val = feature.featureValues?.map(v => v.value).join(', ') || '';
                        const cleanVal = val.replace(/<br\s*\/?>/gi, ', ');
                        const calc = calculateTotal(cleanVal);
                        if (calc) return { label: 'Жин:', value: `${cleanVal} = ${calc.total}` };
                        if (cleanVal.trim() && cleanVal.length < 50) return { label: 'Жин:', value: cleanVal };
                    }
                }
            }
        }
    }

    // 2. Fallback: Parse from Title
    const names = [prod?.name_mn, prod?.englishName, prod?.name].filter(Boolean);
    for (const n of names) {
        const calc = calculateTotal(n);
        if (calc) {
            // Updated multiplier match to include leading multipliers
            const multiplierPartRegex = /((?:\d+\s*[xX*]\s*)*\d+(?:\.\d+)?\s*(?:kg|g|кг|гр|грамм|г|l|ml|리터|미리리터)(?:\s*[xX*]\s*\d+)*)/i;
            const weightPartMatch = n.match(multiplierPartRegex);
            const displayPart = weightPartMatch ? weightPartMatch[0] : calc.original;
            return { label: 'Жин:', value: `${displayPart.trim()} = ${calc.total}` };
        }
    }

    return { label: 'Жин:', value: 'Жингийн мэдээллийг та чатаар асууна уу' };
};

/**
 * Calculates the final display price in MNT including shipping costs.
 * 
 * Logic:
 * 1. Base Price (KRW) → convert to MNT
 * 2. Shipping Cost (MNT) = Weight (kg) * Rate (MNT/kg)
 * 3. Final (MNT) = Base (MNT) + Shipping (MNT)
 * 
 * @param {Object} product - The product object
 * @param {number} basePriceKRW - The price in KRW to calculate for (price or originalPrice)
 * @param {Object} rates - Transportation rates { ground: number, air: number } (in MNT/kg)
 * @param {number} wonRate - Current MNT/KRW exchange rate
 * @param {string} [shippingType='ground'] - 'ground' or 'air'
 * @returns {number} Final price in MNT
 */
export const calculateFinalPrice = (product, basePriceKRW, rates, wonRate, shippingType = 'ground') => {
    const numericBasePrice = Number(basePriceKRW) || 0;
    if (!numericBasePrice) return 0;

    // 1. Get Weight
    const weightInfo = getProductWeight(product);
    let weightKg = 0;

    // Try to parse weight value from the helper result
    if (weightInfo && weightInfo.value) {
        const valStr = weightInfo.value;
        const equalsMatch = valStr.match(/=\s*(\d+(?:\.\d+)?)\s*kg/i);
        if (equalsMatch) {
            weightKg = parseFloat(equalsMatch[1]);
        } else {
            const match = valStr.match(/(\d+(?:\.\d+)?)\s*kg/i);
            if (match) {
                weightKg = parseFloat(match[1]);
            } else if (valStr.match(/(\d+)\s*g/i)) {
                const gMatch = valStr.match(/(\d+)\s*g/i);
                weightKg = parseInt(gMatch[1]) / 1000;
            }
        }
    }

    // 2. Get Rate (now in MNT/kg)
    const rateMNTPerKg = (rates?.[shippingType] || 0);

    // 3. Calculate Shipping Cost in MNT
    const shippingCostMNT = weightKg * rateMNTPerKg;

    // 4. Base price in MNT
    const basePriceMNT = numericBasePrice * wonRate;

    // 5. Final MNT = Base (MNT) + Shipping (MNT)
    return Math.round(basePriceMNT + shippingCostMNT);
};

/**
 * Returns detailed price breakdown for display.
 */
export const getPriceBreakdown = (product, basePriceKRW, rates, wonRate, shippingType = 'ground', quantity = 1) => {
    const numericBasePrice = Number(basePriceKRW) || 0;
    if (!numericBasePrice) return null;

    // 1. Get Weight
    const weightInfo = getProductWeight(product);
    let unitWeightKg = 0;

    if (weightInfo && weightInfo.value) {
        const valStr = weightInfo.value;
        const equalsMatch = valStr.match(/=\s*(\d+(?:\.\d+)?)\s*kg/i);
        if (equalsMatch) {
            unitWeightKg = parseFloat(equalsMatch[1]);
        } else {
            const match = valStr.match(/(\d+(?:\.\d+)?)\s*kg/i);
            if (match) {
                unitWeightKg = parseFloat(match[1]);
            } else if (valStr.match(/(\d+)\s*g/i)) {
                const gMatch = valStr.match(/(\d+)\s*g/i);
                unitWeightKg = parseInt(gMatch[1]) / 1000;
            }
        }
    }

    const totalWeightKg = unitWeightKg * quantity;
    const rateMNTPerKg = (rates?.[shippingType] || 0);
    const shippingCostMNT = totalWeightKg * rateMNTPerKg;
    const totalBasePriceKRW = numericBasePrice * quantity;
    const basePriceMNT = Math.round(totalBasePriceKRW * wonRate);
    const finalMNT = Math.round(basePriceMNT + shippingCostMNT);

    return {
        unitWeightKg,
        totalWeightKg,
        quantity,
        rateMNTPerKg,
        shippingCostMNT: Math.round(shippingCostMNT),
        basePriceKRW: totalBasePriceKRW,
        basePriceMNT,
        totalKRW: totalBasePriceKRW,
        finalMNT,
        // For KRW display (reverse from MNT)
        rateMNT: Math.round(rateMNTPerKg),
        weightDisplay: `${totalWeightKg.toFixed(1)}kg`,
        rateDisplay: `${Math.round(rateMNTPerKg).toLocaleString()}₮`,
        shippingDisplay: `${Math.round(shippingCostMNT).toLocaleString()}₮`,
        baseDisplay: `${basePriceMNT.toLocaleString()}₮`,
        totalDisplay: `${finalMNT.toLocaleString()}₮`
    };
};

/**
 * Cleans the scanned barcode based on user-defined rules.
 * 1. Remove trailing '0' (Always)
 * 2. Remove leading '0' (Only if it starts with '0'. '1' prefix is kept.)
 * 
 * @param {string} code - The raw scanned code
 * @returns {string} The cleaned code
 */
export const cleanBarcode = (code) => {
    if (!code) return code;
    let cleaned = code.trim();

    // 🚀 NEW RULE (2025-01-17): Specific handling for 8-digit barcodes
    if (cleaned.length === 8) {
        // Rule 1: Starts with '1' -> Remove last '0' (Result: 7 digits)
        // e.g., 1xxxxxx0 -> 1xxxxxx
        if (cleaned.startsWith('1') && cleaned.endsWith('0')) {
            return cleaned.slice(0, -1);
        }

        // Rule 2: Starts with '0' -> Remove first and last '0' (Result: 6 digits)
        // e.g., 0xxxxxx0 -> xxxxxx
        if (cleaned.startsWith('0') && cleaned.endsWith('0')) {
            return cleaned.slice(1, -1);
        }
    }

    // Default: Remove leading '0' for other formats (e.g. UPC-A, EAN-13 padding)
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }

    return cleaned;
};
