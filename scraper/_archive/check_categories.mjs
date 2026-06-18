/**
 * Check all Costco Korea category codes via their public API
 */
const BASE_URL = "https://www.costco.co.kr/rest/v2/korea/products/search";

async function checkCategory(code, queryType = "category") {
    const query = `:relevance:${queryType}:${code}`;
    const url = `${BASE_URL}?fields=pagination,breadcrumbs&query=${encodeURIComponent(query)}&pageSize=1&currentPage=0`;
    
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });
        
        if (!res.ok) return { code, total: 0, name: "", status: `HTTP ${res.status}` };
        
        const data = await res.json();
        const total = data?.pagination?.totalResults || 0;
        let name = "";
        if (data?.breadcrumbs) {
            for (const bc of data.breadcrumbs) {
                if (bc.facetValueName) name = bc.facetValueName;
            }
        }
        return { code, total, name, status: "OK" };
    } catch (e) {
        return { code, total: 0, name: "", status: `ERROR: ${e.message}` };
    }
}

async function main() {
    console.log("=".repeat(80));
    console.log("COSTCO KOREA - CATEGORY CHECK");
    console.log("=".repeat(80));
    
    // 1. Standard categories cos_1 to cos_20
    console.log("\n--- Standard Categories (cos_1 to cos_20) ---");
    for (let i = 1; i <= 20; i++) {
        const code = `cos_${i}`;
        const r = await checkCategory(code);
        const icon = r.total > 0 ? "✅" : "❌";
        console.log(`  ${icon} ${code.padEnd(10)} | ${String(r.total).padStart(5)} products | ${(r.name || "-").substring(0, 40).padEnd(40)} | ${r.status}`);
        await new Promise(ok => setTimeout(ok, 200));
    }
    
    // 2. Special/promotional categories
    console.log("\n--- Special / Promotional Categories ---");
    const specials = [
        ["SpecialPriceOffers", "allCategories"],
        ["BuyersPick", "allCategories"],
        ["whatsnew", "allCategories"],
        ["ks_all", "category"],
    ];
    for (const [code, qtype] of specials) {
        const r = await checkCategory(code, qtype);
        const icon = r.total > 0 ? "✅" : "❌";
        console.log(`  ${icon} ${code.padEnd(25)} (${qtype.padEnd(15)}) | ${String(r.total).padStart(5)} products | ${r.name || "-"}`);
        await new Promise(ok => setTimeout(ok, 200));
    }
    
    // 3. Check subcategories of cos_1
    console.log("\n--- Subcategories (cos_1.x, cos_4.x samples) ---");
    const subs = ["cos_1.1", "cos_1.2", "cos_1.3", "cos_4.1", "cos_4.2", "cos_4.3", "cos_13.1", "cos_13.2"];
    for (const code of subs) {
        const r = await checkCategory(code);
        const icon = r.total > 0 ? "✅" : "❌";
        console.log(`  ${icon} ${code.padEnd(10)} | ${String(r.total).padStart(5)} products | ${(r.name || "-").substring(0, 40)}`);
        await new Promise(ok => setTimeout(ok, 200));
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("Check complete!");
}

main().catch(console.error);
