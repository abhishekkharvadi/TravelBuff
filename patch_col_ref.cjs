const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

code = code.replace(
  /let col = allCols\.find\(c => c\.id === selectedColRef\?\.current\?\.id && \(slugify\(c\.name\) === route\.collectionSlug \|\| c\.id === route\.collectionSlug\)\);/,
  `let col = null; // No ref needed for now
            if (!col) col = allCols.find(c => slugify(c.name) === route.collectionSlug || c.id === route.collectionSlug);`
);

fs.writeFileSync('src/App.jsx', code);
console.log('Fixed collection ref.');
