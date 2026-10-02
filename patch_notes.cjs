const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `      let notesStr = origTrip.notes || '';`;
const replaceStr = `      let notesStr = origTrip.notes || '';
      try {
        if (notesStr) {
          const notesObj = JSON.parse(notesStr);
          if (notesObj.dayLocations) {
            for (const k in notesObj.dayLocations) {
              const oldLocId = notesObj.dayLocations[k];
              if (idMap.has(String(oldLocId))) {
                notesObj.dayLocations[k] = idMap.get(String(oldLocId));
              }
            }
          }
          if (notesObj.hotels) {
            for (const k in notesObj.hotels) {
              const oldHotelId = notesObj.hotels[k];
              if (idMap.has(String(oldHotelId))) {
                notesObj.hotels[k] = idMap.get(String(oldHotelId));
              }
            }
          }
          if (notesObj.segmentTransport) {
            const newSegments = {};
            for (const k in notesObj.segmentTransport) {
              let newK = k;
              for (const [oldId, newId] of idMap.entries()) {
                newK = newK.replace(oldId, newId);
              }
              newSegments[newK] = notesObj.segmentTransport[k];
            }
            notesObj.segmentTransport = newSegments;
          }
          notesStr = JSON.stringify(notesObj);
        }
      } catch (e) {
        console.warn('Failed to parse and update imported trip notes', e);
      }`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('server.js', code);
  console.log("Patched notes.");
} else {
  console.log("Could not find target string.");
}
