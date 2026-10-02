const fs = require('fs');

let code = fs.readFileSync('src/clientDb.js', 'utf8');

const targetStr = `      if (itinRes.ok) {
        const rows = await itinRes.json();`;
const replaceStr = `      if (itinRes.ok) {
        const rows = await itinRes.json();
        console.log(\`[Diagnostics] Fetched \${rows.length} itineraries for trip \${t.id}\`);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/clientDb.js', code);
  console.log("Patched clientDb.js with logs.");
} else {
  console.log("Could not find target string.");
}
