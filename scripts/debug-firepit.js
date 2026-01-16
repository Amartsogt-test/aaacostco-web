
// const { getProductWeight } = require('../src/utils/productUtils'); // We probably can't require ES module easily.
// I'll copy the logic into this script for debugging to avoid module issues or use ESM if possible.
// Actually, I'll just copy the calculateTotal logic to debug it fast.

const calculateTotal = (text) => {
    if (!text) return null;
    // Find patterns like 1.5L, 500g, 190ml
    const unitRegex = /(\d+(?:\.\d+)?)\s*(kg|g|кг|гр|грамм|г|l|ml|리터|미리리터)\b/i;
    const unitMatch = text.match(unitRegex);

    if (unitMatch) {
        const baseVal = unitMatch[1];
        const rawUnit = unitMatch[2];

        const parseValue = (val, rawUnit) => {
            const unit = rawUnit.toLowerCase();
            let num = parseFloat(val);
            if (['l', '리터'].includes(unit)) return { weight: num, unit: 'kg' };
            if (['ml', '미리리터'].includes(unit)) return { weight: num / 1000, unit: 'kg' };
            if (['kg', 'кг'].includes(unit)) return { weight: num, unit: 'kg' };
            if (['g', 'гр', 'грамм', 'г'].includes(unit)) return { weight: num / 1000, unit: 'kg' };
            return { weight: num, unit: 'kg' };
        };

        const { weight } = parseValue(baseVal, rawUnit);

        // Find multipliers after (x 24 x 2)
        const afterPart = text.substring(unitMatch.index + unitMatch[0].length);
        // Match float or int multipliers
        const multipliersIterator = afterPart.matchAll(/[xX*]\s*(\d+(?:\.\d+)?)/g);
        const multipliers = [];

        for (const m of multipliersIterator) {
            const val = parseFloat(m[1]);
            const matchIndex = m.index;
            const precedingText = afterPart.substring(0, matchIndex).trim();
            const totalText = afterPart;

            console.log(`Checking multiplier candidate: ${val} at index ${matchIndex}`);
            console.log(`Preceding: "${precedingText}"`);
            console.log(`Full Context: "${totalText}"`);

            // 1. Skip if nested unit (e.g. mg x 100)
            if (/(?:kg|g|кг|гр|грамм|г|l|ml|리터|미리리터|mg|мг)$/i.test(precedingText)) {
                console.log("Skipping: nested unit");
                continue;
            }

            // 2. Check overlap with dimensions
            // Current Logic in codebase:
            // if (/[LWHD]$/i.test(pre)) continue;
            // if (/(?:diameter...)$/i.test(pre)) continue;

            // New Idea: Check if 'cm', 'mm' follows the number
            // The match m[0] is "x 74.0" or alike.
            const endOfMatchIndex = matchIndex + m[0].length;
            const post = afterPart.substring(endOfMatchIndex).trim();
            console.log(`Post: "${post}"`);

            if (/^(?:cm|mm|in|inch|m)\b/i.test(post)) {
                console.log("Skipping: followed by dimension unit");
                continue;
            }

            if (!Number.isInteger(val)) {
                console.log("Skipping: Not integer");
                continue;
            }

            multipliers.push(val);
        }

        // Check for multipliers before (logic omitted for this specific bug as it is AFTER)
        // ...

        let total = weight;
        multipliers.forEach(m => { if (m > 0) total *= m; });

        return { original: unitMatch[0], multipliers, total };
    }
    return null;
};

const input = "제품 사이즈: 72.6 x 72.6 x 66.1cm, 17kg, 포장 사이즈 (박스 1개): 74.0 x 74.0 x 52.0 cm";
console.log(`Input: "${input}"`);
const result = calculateTotal(input);
console.log("Result:", result);
