const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./public/search-index.json', 'utf8'));
const found = data.items.find(p => p.id === 'eORVhZCfprRzPbabKeCW');
if (found) {
    console.log('FOUND in search-index.json:');
    console.log(JSON.stringify(found, null, 2));
} else {
    console.log('NOT FOUND in search-index.json');
    console.log('Total items:', data.items.length);
}
