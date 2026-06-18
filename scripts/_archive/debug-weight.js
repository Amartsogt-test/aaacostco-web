
function extractWeightRegex(text) {
    if (!text) return { weightKg: 0, reason: "no text" };

    // Clean text
    const cleanText = text.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    console.log(`Analyzing: "${cleanText}"`);

    // Patterns
    const patterns = [
        /(?:weight|net weight|gross weight|жин)\s*[:-]?\s*(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр)/i,
    ];

    // Strategy 1: Look for explicit "Weight:" labels
    const labelMatch = cleanText.match(patterns[0]);
    if (labelMatch) {
        let val = parseFloat(labelMatch[1]);
        let unit = labelMatch[2].toLowerCase();
        if (['g', 'г', 'gr', 'гр'].some(u => unit.startsWith(u))) val /= 1000;
        return { weightKg: val, reason: `Regex explicit match: ${labelMatch[0]}` };
    }

    // Strategy 2: Look for all weight-like tokens
    // Removing \b and using explicit lookahead for safety with Cyrillic
    const matches = [...cleanText.matchAll(/(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр|ml|l|мл|л)(?=$|\s|[.,])/gi)];

    let candidates = [];
    for (const m of matches) {
        let val = parseFloat(m[1]); // e.g. 340
        const unit = m[2].toLowerCase(); // e.g. g
        const fullMatch = m[0]; // e.g. 340g
        const matchIndex = m.index; // Position in string

        // Convert to KG
        if (['g', 'г', 'gr', 'гр', 'ml', 'мл'].some(u => unit.startsWith(u))) val /= 1000;
        else if (unit === 'l' || unit === 'л') { /* val stays the same for liters */ }

        // 🚀 CHECK FOR MULTIPLIER (x 6 or * 6)
        // Look ahead of the match for " x 6"
        const remainder = cleanText.substring(matchIndex + fullMatch.length);
        const multiplierMatch = remainder.match(/^\s*[x*х]\s*(\d+)/i); // 'x', '*', or cyrillic 'х'

        let multiplierReason = "";

        if (multiplierMatch) {
            const count = parseInt(multiplierMatch[1]);
            // Limit multiplier to avoid matching random numbers like "340g x 2024" (year)
            // But 6 count is common. 340g x 6.
            if (count > 0 && count < 100) {
                multiplierReason = ` (x${count})`;
                val *= count;
            }
        } else {
            // 🚀 CHECK FOR PRE-MULTIPLIER (6 x 340g)
            const prefix = cleanText.substring(0, matchIndex);
            const preMultiplierMatch = prefix.match(/(\d+)\s*[x*х]\s*$/i);
            if (preMultiplierMatch) {
                const count = parseInt(preMultiplierMatch[1]);
                if (count > 0 && count < 100) {
                    multiplierReason = ` (${count}x)`;
                    val *= count;
                }
            }
        }

        // Filter valid range (0.01kg to 500kg)
        if (val > 0.01 && val < 500) {
            candidates.push({ val, match: fullMatch + multiplierReason });
        }
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.val - a.val);
        const best = candidates[0];
        return { weightKg: best.val, reason: `Regex found candidate: ${best.match}` };
    }

    return { weightKg: 0, reason: "no valid weight pattern found" };
}

// Test Cases
const testCases = [
    "Spam Light 340g x 6",
    "Dongwon EPA Tuna 150g x 10",
    "Спам Лайт 340гр х 6",
    "Kirkland Signature 500ml x 20",
    "Product 10kg",
    "Some Item 200g * 4",
    "6 x 340g Spam",
    "Weight: 5kg"
];

testCases.forEach(test => {
    const result = extractWeightRegex(test);
    console.log(`Input: "${test}" => ${result.weightKg.toFixed(3)}kg (${result.reason})`);
});
