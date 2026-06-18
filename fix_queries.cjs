const fs = require('fs');
let c = fs.readFileSync('src/services/productService.js', 'utf-8');
c = c.replace(/where\('category', '==', category\)/g, 'where_cat_cat');
c = c.replace(/'where_cat_cat'/g, where('categoryPath', 'array-contains', category));
c = c.replace(/where\('category', '==', catId\)/g, 'where_cat_catId');
c = c.replace(/'where_cat_catId'/g, where('categoryPath', 'array-contains', catId));
fs.writeFileSync('src/services/productService.js', c);
