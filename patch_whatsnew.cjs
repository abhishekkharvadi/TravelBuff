const fs = require('fs');

let code = fs.readFileSync('src/components/WhatsNewModal.jsx', 'utf8');

const targetStr = `      desc: 'Seamlessly export a full trip (including locations, itineraries, notes, and photos) as a single portable JSON package, and import it into any other TravelBuff instance. Missing locations and places will be automatically created on the destination server.'
    }`;
const replaceStr = `      desc: 'Seamlessly export a full trip (including locations, itineraries, notes, and photos) as a single portable JSON package, and import it into any other TravelBuff instance. Missing locations and places will be automatically created on the destination server.'
    },
    {
      icon: <Sparkles size={22} style={{ color: '#10b981' }} />,
      title: 'Import Bug Fixes',
      badge: 'v7.7.1',
      badgeColor: '#059669',
      desc: 'Fixed an issue where trips imported with new/missing locations would silently fail to map day locations and hotels, resulting in an empty itinerary.'
    }`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/WhatsNewModal.jsx', code);
  console.log("Patched WhatsNewModal.");
} else {
  console.log("Could not find target string.");
}
