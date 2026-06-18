const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('C:/Users/Batbileg/.gemini/antigravity-ide/brain/0891caf1-bb06-4ab9-9691-b151a170b037/.system_generated/steps/104/content.md', 'utf8');
const $ = cheerio.load(html);

console.log('--- Prices found ---');
$('span.notranslate.ng-star-inserted').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('원')) {
        console.log(text);
    }
});

// also look at the summary area
console.log('--- Summary Text ---');
console.log($('cx-product-summary').text().replace(/\s+/g, ' ').substring(0, 300));
