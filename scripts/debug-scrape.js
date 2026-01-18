
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function scrape(url, name, type = 'html') {
    console.log(`\n🔍 Scraping ${name}: ${url}`);
    try {
        const { data } = await axios.get(url, {
            httpsAgent: agent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });

        if (type === 'json') {
            const krw = data.find(r => r.currency === 'KRW' || r.code === 'KRW');
            if (krw) {
                console.log('✅ Khan JSON Node:', JSON.stringify(krw, null, 2));
            } else {
                console.log('❌ KRW not found in JSON');
            }
            return;
        }

        if (name === 'Golomt') {
            // Next.js Data?
            const nextDataMatch = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
            if (nextDataMatch) {
                console.log('✅ Golomt __NEXT_DATA__ found!');
                const json = JSON.parse(nextDataMatch[1]);
                console.log('   Keys:', Object.keys(json.props.pageProps || {}));
                // Try to find rates in props
                const str = JSON.stringify(json);
                const krwIdx = str.indexOf('KRW');
                if (krwIdx !== -1) {
                    console.log('   KRW found in JSON props:', str.substring(krwIdx - 50, krwIdx + 150));
                }
            } else {
                console.log('❌ Golomt __NEXT_DATA__ not found.');
            }
        }

        if (name === 'TDB') {
            // Look for Table Row
            // <tr>...KRW...</tr>
            const rows = data.match(/<tr[^>]*>[\s\S]*?KRW[\s\S]*?<\/tr>/gi);
            if (rows) {
                console.log('✅ TDB Table Row Found:');
                console.log(rows[0].replace(/\s+/g, ' '));
            } else {
                console.log('❌ TDB Table Row NOT found.');
            }
        }

    } catch (e) {
        console.error(`❌ Error: ${e.message}`);
    }
}

async function run() {
    await scrape('https://www.golomtbank.com/', 'Golomt Home');
    await scrape('https://www.tdbm.mn/', 'TDB Home');

    // Khan API with correct date
    const today = new Date().toISOString().split('T')[0];
    await scrape(`https://www.khanbank.com/api/back/rates?date=${today}`, 'Khan API', 'json');
}

run();
