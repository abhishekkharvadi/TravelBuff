const fs = require('fs');

let code = fs.readFileSync('src/components/TripPlanning.jsx', 'utf8');

const targetStr = `  // Local State
  const [selectedTrip, setSelectedTrip] = useState(null);`;

const replaceStr = `  // Local State
  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    if (selectedTrip) {
      const tripItins = itineraries.filter(i => i.trip_id === selectedTrip.id);
      console.log(\`[Diagnostics] RENDER: Trip \${selectedTrip.id} has \${tripItins.length} itinerary items in Dexie state.\`);
    }
  }, [selectedTrip, itineraries]);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/TripPlanning.jsx', code);
  console.log("Patched TripPlanning.jsx with logs.");
} else {
  console.log("Could not find target string.");
}
