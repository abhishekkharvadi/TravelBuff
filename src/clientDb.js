import Dexie from 'dexie';

// Initialize Dexie Client Database
export const db = new Dexie('TravelBuffDB');

db.version(1).stores({
  locations: 'id, name, visited, immich_album_id',
  places: 'id, location_id, name, category, visited',
  entity_photos: 'id, entity_id, is_featured',
  custom_categories: 'id, name, type',
  tags: 'id, name, color',
  entity_tags: '[entity_id+tag_id], entity_id, tag_id',
  collections: 'id, name',
  trips: 'id, name, start_date, length, visited',
  trip_currency_rates: 'id, trip_id, currency',
  reservations: 'id, trip_id, type',
  itinerary_items: 'id, trip_id, date, place_id',
  expenses: 'id, trip_id, date, category, is_planned',
  gps_logs: 'id, timestamp',
  
  // Local sync queue for offline mutations
  // schema: id (uuid/timestamp), table, action ('insert'|'update'|'delete'), data (JSON payload), timestamp
  sync_queue: 'id, table, action, timestamp'
});

db.version(2).stores({
  ai_imports: 'id, type, status',
  saved_markdowns: 'id, user_id, name, url, created_at'
});

db.version(3).stores({
  locations: 'id, name, visited, immich_album_id, source_urls'
});

db.version(4).stores({
  places: 'id, location_id, name, category, visited, address'
});

db.version(5).stores({
  saved_markdowns: 'id, user_id, name, url, created_at, status'
});

db.version(6).stores({
  saved_markdowns: 'id, user_id, name, url, created_at, status, parsed_items_state, import_context'
});

db.version(7).stores({
  locations: 'id, name, visited, immich_album_id, source_urls, parent_id, is_folder'
});

// Safe UUID generator supporting non-secure contexts
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper: Add mutation to local sync queue if offline, or sync immediately if online
export async function queueSyncAction(table, action, data) {
  // Always update the local Dexie DB immediately
  try {
    if (action === 'insert') {
      await db[table].put(data);
    } else if (action === 'update') {
      await db[table].update(data.id, data);
    } else if (action === 'delete_folder') {
      if (table === 'locations') {
        const deleteContents = data.deleteContents;
        if (deleteContents) {
          const deleteLocationRecursivelyLocal = async (locId) => {
            const childLocs = await db.locations.where({ parent_id: locId }).toArray();
            for (const child of childLocs) {
              await deleteLocationRecursivelyLocal(child.id);
            }
            await db.places.where({ location_id: locId }).delete();
            await db.entity_photos.where({ entity_id: locId }).delete();
            await db.locations.delete(locId);
          };
          await deleteLocationRecursivelyLocal(data.id);
        } else {
          await db.locations.where({ parent_id: data.id }).modify({ parent_id: null });
          await db.places.where({ location_id: data.id }).delete();
          await db.entity_photos.where({ entity_id: data.id }).delete();
          await db.locations.delete(data.id);
        }
      }
    } else if (action === 'delete') {
      if (table === 'entity_tags') {
        await db.entity_tags.delete([data.entity_id, data.tag_id]);
      } else {
        await db[table].delete(data.id);
      }
      // If we are deleting a location/place/trip, clean up child records locally
      if (table === 'locations') {
        await db.places.where({ location_id: data.id }).delete();
        await db.entity_photos.where({ entity_id: data.id }).delete();
      } else if (table === 'places') {
        await db.entity_photos.where({ entity_id: data.id }).delete();
      } else if (table === 'trips') {
        await db.reservations.where({ trip_id: data.id }).delete();
        await db.itinerary_items.where({ trip_id: data.id }).delete();
        await db.expenses.where({ trip_id: data.id }).delete();
      }
    }
  } catch (err) {
    console.error(`Dexie local update error table [${table}] action [${action}]:`, err);
  }

  // Queue changes for the server
  const syncData = JSON.parse(JSON.stringify(data));
  if (syncData && typeof syncData === 'object' && 'local_file_data' in syncData) {
    delete syncData.local_file_data;
  }

  const queueItem = {
    id: generateUUID(),
    table,
    action,
    data: syncData,
    timestamp: Date.now()
  };

  await db.sync_queue.add(queueItem);

  // Trigger sync process
  triggerSync();
}

// Global hook to trigger sync
let syncTriggerCallback = () => {};
export function registerSyncTrigger(callback) {
  syncTriggerCallback = callback;
}

export function triggerSync() {
  syncTriggerCallback();
}

// Helper to fully seed/update local storage from server API
export async function populateLocalDb(token) {
  const headers = { Authorization: `Bearer ${token}` };
  
  const tables = [
    { url: '/api/locations', table: 'locations' },
    { url: '/api/places', table: 'places' },
    { url: '/api/tags', table: 'tags' },
    { url: '/api/entity-tags', table: 'entity_tags' },
    { url: '/api/collections', table: 'collections' },
    { url: '/api/categories', table: 'custom_categories' },
    { url: '/api/trips', table: 'trips' },
    { url: '/api/ai_imports', table: 'ai_imports' },
    { url: '/api/import/saved-markdowns', table: 'saved_markdowns' }
  ];

  for (const item of tables) {
    try {
      const res = await fetch(item.url, { headers });
      if (res.ok) {
        const rows = await res.json();
        await db[item.table].clear();
        await db[item.table].bulkPut(rows);
      }
    } catch (err) {
      console.warn(`Unable to prefetch table ${item.table} from server (offline):`, err);
    }
  }

  // Prefetch dependent entities for trips
  try {
    const trips = await db.trips.toArray();
    for (const t of trips) {
      // Reservations
      const resRes = await fetch(`/api/reservations/${t.id}`, { headers });
      if (resRes.ok) {
        const rows = await resRes.json();
        const parsedRows = [];
        for (const r of rows) {
          const parsedDetails = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
          const existing = await db.reservations.get(r.id);
          let localFileData = existing ? existing.local_file_data : null;
          
          if (r.file_path) {
            try {
              const fileFetch = await fetch(r.file_path);
              if (fileFetch.ok) {
                const blob = await fileFetch.blob();
                localFileData = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
              }
            } catch (e) {
              console.warn('Unable to cache offline file copy:', e);
            }
          }
          parsedRows.push({
            ...r,
            details: parsedDetails,
            local_file_data: localFileData
          });
        }
        await db.reservations.where({ trip_id: t.id }).delete();
        await db.reservations.bulkPut(parsedRows);
      }
      
      // Itinerary items
      const itinRes = await fetch(`/api/itineraries/${t.id}`, { headers });
      if (itinRes.ok) {
        const rows = await itinRes.json();
        await db.itinerary_items.where({ trip_id: t.id }).delete();
        await db.itinerary_items.bulkPut(rows);
      }
      
      // Expenses
      const expRes = await fetch(`/api/expenses/${t.id}`, { headers });
      if (expRes.ok) {
        const rows = await expRes.json();
        await db.expenses.where({ trip_id: t.id }).delete();
        await db.expenses.bulkPut(rows);
      }

      // Rates
      const rateRes = await fetch(`/api/trips/${t.id}/rates`, { headers });
      if (rateRes.ok) {
        const rows = await rateRes.json();
        await db.trip_currency_rates.where({ trip_id: t.id }).delete();
        await db.trip_currency_rates.bulkPut(rows);
      }
    }
  } catch (err) {
    console.warn('Unable to prefetch trip itineraries/expenses (offline):', err);
  }

  // Pre-fetch all photos for locations and places
  try {
    const locs = await db.locations.toArray();
    const places = await db.places.toArray();
    const entities = [...locs.map(l => l.id), ...places.map(p => p.id)];
    
    await db.entity_photos.clear();
    for (const id of entities) {
      const photoRes = await fetch(`/api/photos/${id}`, { headers });
      if (photoRes.ok) {
        const photos = await photoRes.json();
        await db.entity_photos.bulkPut(photos);
      }
    }
  } catch (err) {
    console.warn('Unable to prefetch entity photos (offline):', err);
  }
}

// Clear all databases on logout
export async function clearLocalDb() {
  await db.locations.clear();
  await db.places.clear();
  await db.entity_photos.clear();
  await db.custom_categories.clear();
  await db.tags.clear();
  await db.entity_tags.clear();
  await db.collections.clear();
  await db.trips.clear();
  await db.trip_currency_rates.clear();
  await db.reservations.clear();
  await db.itinerary_items.clear();
  await db.expenses.clear();
  await db.gps_logs.clear();
  await db.sync_queue.clear();
}
