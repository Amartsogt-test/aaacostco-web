const fs = require('fs');
const html = fs.readFileSync('C:/Users/Batbileg/.gemini/antigravity-ide/brain/0891caf1-bb06-4ab9-9691-b151a170b037/.system_generated/steps/104/content.md', 'utf8');

const prices = [...new Set(html.match(/[0-9,]+원/g) || [])];
console.log('Prices found:', prices);

const ldJsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
if (ldJsonMatch) {
    ldJsonMatch.forEach(script => {
        const content = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        try {
            const json = JSON.parse(content);
            if (json.offers && json.offers.price) {
                console.log('LD-JSON Price:', json.offers.price);
            }
        } catch (e) {}
    });
}
