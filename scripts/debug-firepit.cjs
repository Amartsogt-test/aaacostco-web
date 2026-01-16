
// Removed unused require
// const { getProductWeight } = require('../src/utils/productUtils'); 

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

        console.log(`Base found: ${weight}kg`);

        for (const m of multipliersIterator) {
            const val = parseFloat(m[1]);
            const matchIndex = m.index;
            const precedingText = afterPart.substring(0, matchIndex).trim();
            const totalText = afterPart;

            console.log(`Checking multiplier candidate: ${val} at index ${matchIndex}`);

            // 1. Skip if nested unit (e.g. mg x 100)
            if (/(?:kg|g|кг|гр|грамм|г|l|ml|리터|미리리터|mg|мг)$/i.test(precedingText)) {
                console.log("Skipping: nested unit");
                continue;
            }

            // 2. Check overlap with dimensions - PRECEDING
            if (/[LWHD]$/i.test(precedingText)) { console.log("Skipping: LWHD"); continue; }
            if (/(?:diameter|radius|width|height|depth|long|length|диаметр|өндөр|өргөн|гүн|урт|size|хэмжээ|사이즈)$/i.test(precedingText)) {
                console.log("Skipping: dimension word");
                continue;
            }

            // 3. Check overlap with dimensions - FOLLOWING
            const endOfMatchIndex = matchIndex + m[0].length;
            const post = afterPart.substring(endOfMatchIndex).trim();
            console.log(`Post-context: "${post.substring(0, 10)}..."`);

            if (/^(?:cm|mm|in|inch|m)\b/i.test(post)) {
                console.log("Skipping: followed by dimension unit");
                continue;
            }

            if (!Number.isInteger(val)) {
                console.log("Skipping: Not integer");
                continue;
            }

            // 4. Large Integer Check?
            // If val is something like 74, it's unlikely to be a count unless it's bulk.
            // But 74 is an integer. 52 is an integer.
            // In "74.0 x 74.0 x 52.0 cm", the "cm" is at the END.
            // x 74.0 -> post is "x 74.0 x 52.0 cm" ... NO.
            // afterPart = ", 포장 사이즈 (박스 1개): 74.0 x 74.0 x 52.0 cm"
            // Match 1: "x 74.0". Post is "x 52.0 cm"
            // Match 2: "x 52.0". Post is "cm" => Caught by check #3.

            // It seems Match 1 is NOT caught by check #3 because next char is "x".
            // So we need to check if the *chain* ends in a unit? Or look ahead?

            // If the multiplier is followed by 'x', it's likely a dimension chain.
            if (/^[xX*]\s*\d/i.test(post)) {
                // Check if that chain eventually ends in a unit?
                // Heuristic: If we are in a chain of X's, and the chain ends with 'cm', ignore ALL.
                console.log("Skipping: followed by another multiplier (dimension chain?)");
                continue;
            }

            multipliers.push(val);
        }

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
