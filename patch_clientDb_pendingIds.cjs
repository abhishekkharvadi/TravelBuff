const fs = require('fs');

let code = fs.readFileSync('src/clientDb.js', 'utf8');

const targetStr = `        await db.transaction('rw', [db.reservations], async () => {`;
const replaceStr = `        const { pendingIds } = await getFreshPendingSets();
        await db.transaction('rw', [db.reservations], async () => {`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/clientDb.js', code);
  console.log("Patched pendingIds.");
} else {
  console.log("Could not find target string.");
}
