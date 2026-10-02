const fs = require('fs');

// Clean server.js
let serverCode = fs.readFileSync('server.js', 'utf8');
serverCode = serverCode.replace("      console.log(`[Diagnostics] Imported ${itineraryItems.length} itinerary_items for trip ${newTripId}`);\n", "");
fs.writeFileSync('server.js', serverCode);

// Clean clientDb.js
let clientDbCode = fs.readFileSync('src/clientDb.js', 'utf8');
clientDbCode = clientDbCode.replace("        console.log(`[Diagnostics] Fetched ${rows.length} itineraries for trip ${t.id}`);\n", "");
fs.writeFileSync('src/clientDb.js', clientDbCode);

// Clean TripPlanning.jsx
let tripPlanningCode = fs.readFileSync('src/components/TripPlanning.jsx', 'utf8');
const replaceStr = `  useEffect(() => {
    if (selectedTrip) {
      const tripItins = itineraries.filter(i => i.trip_id === selectedTrip.id);
      console.log(\`[Diagnostics] RENDER: Trip \${selectedTrip.id} has \${tripItins.length} itinerary items in Dexie state.\`);
    }
  }, [selectedTrip, itineraries]);`;
tripPlanningCode = tripPlanningCode.replace(replaceStr + "\n", "");
tripPlanningCode = tripPlanningCode.replace(replaceStr, "");
fs.writeFileSync('src/components/TripPlanning.jsx', tripPlanningCode);

console.log("Cleaned up diagnostic logs.");
