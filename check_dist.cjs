const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./dist/search-index.json', 'utf8'));
const found = data.items.find(p => p.id === 'eORVhZCfprRzPbabKeCW');
console.log(found ? 'FOUND in dist: ' + found.n : 'NOT FOUND in dist');
console.log('Total in dist:', data.items.length);
