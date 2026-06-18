/**
 * Check cos_X categories with BOTH query types, and also try the /results URL pattern
 */
async function check(code, queryType) {
    const url = `https://www.costco.co.kr/rest/v2/korea/products/search?fields=pagination&query=${encodeURIComponent(`:relevance:${queryType}:${code}`)}&pageSize=1&currentPage=0`;
    try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" } });
        if (!res.ok) return 0;
        const data = await res.json();
        return data?.pagination?.totalResults || 0;
    } catch { return -1; }
}

async function checkResultsPage(code) {
    // This is the URL pattern that full_sync.py uses via Playwright
    const url = `https://www.costco.co.kr/rest/v2/korea/products/search?fields=products(code),pagination&query=${encodeURIComponent(`:relevance:allCategories:${code}`)}&pageSize=100&currentPage=0`;
    try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
        if (!res.ok) return { total: 0, sample: [] };
        const data = await res.json();
        const total = data?.pagination?.totalResults || 0;
        const sample = (data?.products || []).slice(0, 3).map(p => p.code);
        return { total, sample };
    } catch { return { total: -1, sample: [] }; }
}

async function main() {
    console.log("=".repeat(90));
    console.log("COSTCO KOREA - FULL CATEGORY COMPARISON");
    console.log("=".repeat(90));
    
    const cats = [];
    for (let i = 1; i <= 20; i++) cats.push(`cos_${i}`);
    
    console.log("\nCode        | category | allCategories | Name from breadcrumb");
    console.log("-".repeat(90));
    
    for (const code of cats) {
        const [catCount, allCatCount] = await Promise.all([
            check(code, "category"),
            check(code, "allCategories"),
        ]);
        
        // Also get name
        const nameRes = await fetch(`https://www.costco.co.kr/rest/v2/korea/products/search?fields=breadcrumbs&query=${encodeURIComponent(`:relevance:category:${code}`)}&pageSize=1`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        let name = "";
        try {
            const nd = await nameRes.json();
            name = nd?.breadcrumbs?.find(b => b.facetValueName)?.facetValueName || "";
        } catch {}
        
        const icon = allCatCount > 0 ? "✅" : catCount > 0 ? "🟡" : "❌";
        console.log(`${icon} ${code.padEnd(10)} | ${String(catCount).padStart(8)} | ${String(allCatCount).padStart(13)} | ${name}`);
        await new Promise(ok => setTimeout(ok, 150));
    }
    
    // Now check with allCategories for known-working specials too
    console.log("\n--- Results Page Pattern (allCategories with products) ---");
    const toCheck = ["cos_1", "cos_10", "cos_14", "cos_15", "cos_18", "cos_19"];
    for (const code of toCheck) {
        const r = await checkResultsPage(code);
        console.log(`  ${code.padEnd(10)} | ${String(r.total).padStart(5)} products | sample: ${r.sample.join(", ")}`);
        await new Promise(ok => setTimeout(ok, 150));
    }
    
    console.log("\n" + "=".repeat(90));
}

main().catch(console.error);
