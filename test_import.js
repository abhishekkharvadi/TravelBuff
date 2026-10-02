const { db, dbMutex } = require('./db.js');
const crypto = require('crypto');

async function test() {
  console.log("Starting test...");
  // Find a user and a trip
  const trip = await db.get('SELECT * FROM trips LIMIT 1');
  if (!trip) return console.log("No trips");
  console.log("Found trip:", trip.id);

  // Get itinerary items
  const itineraryItems = await db.all('SELECT * FROM itinerary_items WHERE trip_id = ?', [trip.id]);
  console.log("Itineraries:", itineraryItems.length);
}
test();
