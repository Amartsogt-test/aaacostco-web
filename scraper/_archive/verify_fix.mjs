/**
 * Quick verification: Simulate what the fixed full_sync.py will do
 * Fetch page 0 from each of the 18 categories, show product count
 */
const API_BASE = "https://www.costco.co.kr/rest/v2/korea/products/search";
const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

const CATEGORIES = [
    { name: "디지털/TV/컴퓨터", code: "cos_1" },
    { name: "가구/침구/인테리어", code: "cos_2" },
    { name: "유아동/완구/반려동물용품", code: "cos_3" },
    { name: "스포츠/헬스/캠핑", code: "cos_4" },
    { name: "파티오/정원/창고", code: "cos_5" },
    { name: "의류/가방/잡화", code: "cos_6" },
    { name: "보석/시계/액세서리", code: "cos_7" },
    { name: "화장품/미용/제지", code: "cos_8" },
    { name: "공구/생활/자동차", code: "cos_9" },
    { name: "식품", code: "cos_10" },
    { name: "문구/사무", code: "cos_11" },
    { name: "건강/영양제", code: "cos_12" },
    { name: "대형/생활가전", code: "cos_14" },
    { name: "홈/키친", code: "cos_15" },
    { name: "비즈니스 딜리버리", code: "cos_17" },
    { name: "그로서리", code: "cos_18" },
    { name: "타이어", code: "cos_19" },
    { name: "타이어/자동차용품", code: "cos_20" },
];

async function main() {
    console.log("Verifying fixed full_sync.py category list...\n");
    
    let grandTotal = 0;
    
    for (const cat of CATEGORIES) {
        const url = `${API_BASE}?fields=products(code),pagination&query=${encodeURIComponent(`:relevance:allCategories:${cat.code}`)}&pageSize=1&currentPage=0`;
        try {
            const r = await fetch(url, { headers: HEADERS });
            const d = await r.json();
            const total = d?.pagination?.totalResults || 0;
            const icon = total > 0 ? "✅" : "❌";
            console.log(`${icon} ${cat.code.padEnd(8)} ${String(total).padStart(5)} products  ${cat.name}`);
            grandTotal += total;
        } catch (e) {
            console.log(`❌ ${cat.code.padEnd(8)} ERROR  ${cat.name}`);
        }
        await new Promise(ok => setTimeout(ok, 150));
    }
    
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Total: ${grandTotal} products across ${CATEGORIES.length} categories`);
    console.log(`(Note: some products may appear in multiple categories)`);
}

main().catch(console.error);
