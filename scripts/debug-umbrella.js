
// Paste the regex function directly to avoid import issues
function extractWeightRegex(text) {
    if (!text) return { weightKg: 0, reason: "no text" };

    // Clean text
    const cleanText = text.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    // Patterns
    const patterns = [
        // Explicit "Weight: 13.9kg" or "Weight 13.9kg"
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
    // Removed \b and used lookahead for Cyrillic safety
    const matches = [...cleanText.matchAll(/(\d+(?:\.\d+)?)\s*(kg|кг|g|г|gr|гр|ml|мл)(?=$|\s|[.,])/gi)];

    let candidates = [];
    for (const m of matches) {
        let val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        const fullMatch = m[0];
        const matchIndex = m.index;

        // Convert to KG
        if (['g', 'г', 'gr', 'гр', 'ml', 'мл'].some(u => unit.startsWith(u))) val /= 1000;

        // 🚀 CHECK FOR MULTIPLIER (x 6 or * 6)
        const remainder = cleanText.substring(matchIndex + fullMatch.length);
        const multiplierMatch = remainder.match(/^\s*[x*х]\s*(\d+)/i); // 'x', '*', or cyrillic 'х'

        let multiplierReason = "";

        if (multiplierMatch) {
            const count = parseInt(multiplierMatch[1]);
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

const product = {
    id: '1713474',
    name: "Sunvilla LED гадна зориулалтын шүхэр, 2.9м, Цайвар",
    englishName: "Sunvilla LED Market Umbrella 2.9m Beige",
    originalPrice: 229900,
    price: 169900,
    description: "Sunvilla LED Market Umbrella 2.9m Beige",
};

// Test the regex extraction
console.log("---------------------------------------------------");
console.log("Debugging Product:", product.englishName);

const result = extractWeightRegex(product.englishName);
console.log("English Name Extraction Result:", result);

const descResult = extractWeightRegex(product.description);
console.log("Description Extraction Result:", descResult);

const mnResult = extractWeightRegex(product.name);
console.log("Mongolian Name Extraction Result:", mnResult);

// Is there a case where '2.9m' is misread?
// Let's test specific strings
console.log("Testing '2.9m':", extractWeightRegex("2.9m"));
console.log("Testing '229900':", extractWeightRegex("229900"));
