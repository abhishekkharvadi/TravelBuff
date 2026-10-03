const fs = require('fs');
let code = fs.readFileSync('src/components/WhatsNewModal.jsx', 'utf8');

const targetStr = `desc: 'Fixed an issue where trips imported with new/missing locations would silently fail to map day locations and hotels, resulting in an empty itinerary. Also fixed a background sync crash that prevented imported itineraries from downloading.'`;
const replaceStr = `desc: 'Fixed an issue where imported trips failed to map day locations/hotels, and resolved a background sync crash preventing itinerary downloads. Also fixed a double-click routing bug for duplicate location names.'`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/WhatsNewModal.jsx', code);
  console.log("Patched WhatsNewModal.");
} else {
  console.log("Could not find target string.");
}
