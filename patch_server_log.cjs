const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `      await db.exec('COMMIT');`;
const replaceStr = `      console.log(\`[Diagnostics] Imported \${itineraryItems.length} itinerary_items for trip \${newTripId}\`);
      await db.exec('COMMIT');`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('server.js', code);
  console.log("Patched server.js with logs.");
} else {
  console.log("Could not find target string.");
}
