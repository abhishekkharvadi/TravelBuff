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

db.version(8).stores({
  trip_notes: 'id, trip_id, category, created_at'
});

db.version(9).stores({
  people: 'id, user_id, name, relation, immich_person_id',
  user_addresses: 'id, user_id, label, is_default'
});

db.version(10).stores({
  locations: 'id, name, visited, immich_album_id, source_urls, parent_id, is_folder, is_archived',
  places: 'id, location_id, name, category, visited, address, is_archived',
  itinerary_items: 'id, trip_id, date, place_id, custom_name'
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
      const updatedCount = await db[table].update(data.id, data);
      if (updatedCount === 0) {
        // Fallback in case ID types differ (e.g. number vs string) or record needs to be inserted/replaced
        const numId = Number(data.id);
        let numUpdated = 0;
        if (!isNaN(numId)) {
          numUpdated = await db[table].update(numId, data);
        }
        if (numUpdated === 0) {
          await db[table].put(data);
        }
      }
    } else if (action === 'archive_location') {
      const locId = data.id;
      const allLocs = await db.locations.toArray();
      const loc = allLocs.find(l => String(l.id) === String(locId));
      if (loc && (loc.is_folder === 1 || loc.is_folder === true || loc.is_folder === '1')) {
        const archiveRecursively = async (pid) => {
          const children = (await db.locations.toArray()).filter(l => String(l.parent_id) === String(pid));
          for (const ch of children) {
            await db.locations.update(ch.id, { is_archived: 1 });
            const childPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(ch.id));
            for (const cp of childPlaces) {
              await db.places.update(cp.id, { is_archived: 1 });
            }
            await archiveRecursively(ch.id);
          }
        };
        await db.locations.update(loc.id, { is_archived: 1 });
        const directPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(loc.id));
        for (const dp of directPlaces) {
          await db.places.update(dp.id, { is_archived: 1 });
        }
        await archiveRecursively(loc.id);
      } else if (loc) {
        await db.locations.update(loc.id, { is_archived: 1 });
        const directPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(loc.id));
        for (const dp of directPlaces) {
          await db.places.update(dp.id, { is_archived: 1 });
        }
      }
    } else if (action === 'unarchive_location') {
      const locId = data.id;
      const allLocs = await db.locations.toArray();
      const loc = allLocs.find(l => String(l.id) === String(locId));
      if (loc) {
        const unarchiveRecursively = async (pid) => {
          const children = (await db.locations.toArray()).filter(l => String(l.parent_id) === String(pid));
          for (const ch of children) {
            await db.locations.update(ch.id, { is_archived: 0 });
            const childPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(ch.id));
            for (const cp of childPlaces) {
              await db.places.update(cp.id, { is_archived: 0 });
            }
            await unarchiveRecursively(ch.id);
          }
        };
        const isFolder = Number(loc.is_folder) === 1 || loc.is_folder === true || loc.is_folder === '1';
        const updates = { is_archived: 0 };
        if (!isFolder && loc.parent_id && loc.parent_id !== 'null' && loc.parent_id !== 'undefined') {
          const parent = allLocs.find(p => String(p.id) === String(loc.parent_id));
          if (parent && Number(parent.is_archived) === 1) {
            updates.parent_id = null;
          }
        }
        await db.locations.update(loc.id, updates);
        const directPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(loc.id));
        for (const dp of directPlaces) {
          await db.places.update(dp.id, { is_archived: 0 });
        }
        await unarchiveRecursively(loc.id);
      }
    } else if (action === 'archive_place') {
      await db.places.update(data.id, { is_archived: 1 });
    } else if (action === 'unarchive_place') {
      const upd = { is_archived: 0 };
      if (data.location_id) upd.location_id = data.location_id;
      await db.places.update(data.id, upd);
    } else if (action === 'delete_archived_folder') {
      const folderId = data.id;
      const retainLocations = data.retainLocations;
      const allLocs = await db.locations.toArray();
      if (retainLocations) {
        const children = allLocs.filter(l => String(l.parent_id) === String(folderId));
        for (const ch of children) {
          await db.locations.update(ch.id, { parent_id: null });
        }
        const photos = (await db.entity_photos.toArray()).filter(p => String(p.entity_id) === String(folderId));
        for (const ph of photos) {
          await db.entity_photos.delete(ph.id);
        }
        await db.locations.delete(folderId);
      } else {
        const deleteRecursively = async (pid) => {
          const childLocs = (await db.locations.toArray()).filter(l => String(l.parent_id) === String(pid));
          for (const cl of childLocs) {
            await deleteRecursively(cl.id);
          }
          const childPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(pid));
          for (const cp of childPlaces) {
            const cpPhotos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(cp.id));
            for (const ph of cpPhotos) await db.entity_photos.delete(ph.id);
            await db.places.delete(cp.id);
          }
          const pPhotos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(pid));
          for (const ph of pPhotos) await db.entity_photos.delete(ph.id);
          await db.locations.delete(pid);
        };
        await deleteRecursively(folderId);
      }
    } else if (action === 'delete_archived_location') {
      const locId = data.id;
      const retainPlaces = data.retainPlaces;
      const childPlaces = (await db.places.toArray()).filter(p => String(p.location_id) === String(locId));
      if (retainPlaces) {
        for (const cp of childPlaces) {
          await db.places.update(cp.id, { location_id: '__orphaned__', is_archived: 1 });
        }
        const photos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(locId));
        for (const ph of photos) await db.entity_photos.delete(ph.id);
        await db.locations.delete(locId);
      } else {
        for (const cp of childPlaces) {
          // Snapshot completed trip itinerary items before deleting places
          const trips = (await db.trips.toArray()).filter(t => Number(t.visited) === 1);
          const tripIds = new Set(trips.map(t => String(t.id)));
          const items = (await db.itinerary_items.toArray()).filter(i => String(i.place_id) === String(cp.id));
          for (const it of items) {
            if (tripIds.has(String(it.trip_id))) {
              await db.itinerary_items.update(it.id, {
                custom_name: cp.name,
                custom_category: cp.category,
                custom_lat: cp.latitude || null,
                custom_lng: cp.longitude || null,
                place_id: null
              });
            } else {
              await db.itinerary_items.delete(it.id);
            }
          }
          const cpPhotos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(cp.id));
          for (const ph of cpPhotos) await db.entity_photos.delete(ph.id);
          await db.places.delete(cp.id);
        }
        const photos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(locId));
        for (const ph of photos) await db.entity_photos.delete(ph.id);
        await db.locations.delete(locId);
      }
    } else if (action === 'delete_archived_place') {
      const placeId = data.id;
      const allP = await db.places.toArray();
      const place = allP.find(p => String(p.id) === String(placeId));
      if (place) {
        const trips = (await db.trips.toArray()).filter(t => Number(t.visited) === 1);
        const tripIds = new Set(trips.map(t => String(t.id)));
        const items = (await db.itinerary_items.toArray()).filter(i => String(i.place_id) === String(placeId));
        for (const it of items) {
          if (tripIds.has(String(it.trip_id))) {
            await db.itinerary_items.update(it.id, {
              custom_name: place.name,
              custom_category: place.category,
              custom_lat: place.latitude || null,
              custom_lng: place.longitude || null,
              place_id: null
            });
          } else {
            await db.itinerary_items.delete(it.id);
          }
        }
        const photos = (await db.entity_photos.toArray()).filter(ph => String(ph.entity_id) === String(placeId));
        for (const ph of photos) await db.entity_photos.delete(ph.id);
        await db.places.delete(place.id);
      }
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

function checkResponseAuth(res) {
  if (!res || !res.headers) return;
  const refreshedToken = res.headers.get('X-Refreshed-Token');
  if (refreshedToken) {
    localStorage.setItem('tb_token', refreshedToken);
    window.dispatchEvent(new CustomEvent('tb_token_refreshed', { detail: { token: refreshedToken } }));
  }
}

// Helper to fully seed/update local storage from server API
export async function populateLocalDb(token) {
  const headers = { Authorization: `Bearer ${token}` };
  
  // Extract all pending ids to prevent overwriting them during populate
  const pendingActions = await db.sync_queue.toArray();
  const pendingIds = new Set();
  for (const act of pendingActions) {
    if (act.data && act.data.id) {
      pendingIds.add(act.data.id.toString());
    }
  }

  const tables = [
    { url: '/api/locations', table: 'locations' },
    { url: '/api/places', table: 'places' },
    { url: '/api/tags', table: 'tags' },
    { url: '/api/entity-tags', table: 'entity_tags' },
    { url: '/api/collections', table: 'collections' },
    { url: '/api/categories', table: 'custom_categories' },
    { url: '/api/trips', table: 'trips' },
    { url: '/api/ai_imports', table: 'ai_imports' },
    { url: '/api/import/saved-markdowns', table: 'saved_markdowns' },
    { url: '/api/people', table: 'people' },
    { url: '/api/user-addresses', table: 'user_addresses' }
  ];

  for (const item of tables) {
    try {
      const res = await fetch(item.url, { headers });
      checkResponseAuth(res);

      if (res.status === 401 || res.status === 403) {
        console.warn(`[ClientDB] Auth failed on ${item.url} (${res.status}). Aborting populate.`);
        throw new Error('AUTH_EXPIRED');
      }

      if (res.ok) {
        const rows = await res.json();
        
        if (item.table === 'entity_tags') {
          await db.transaction('rw', [db.entity_tags], async () => {
            await db.entity_tags.bulkPut(rows);
          });
        } else {
          // Atomic non-destructive update: put updated rows first, delete missing rows second
          await db.transaction('rw', [db[item.table]], async () => {
            const localRows = await db[item.table].toArray();
            const serverIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
            const idsToDelete = localRows.map(r => r.id).filter(id => id !== undefined && id !== null && !serverIds.has(id.toString()) && !pendingIds.has(id.toString()));
            const rowsToPut = rows.filter(r => r.id === undefined || r.id === null || !pendingIds.has(r.id.toString()));

            await db[item.table].bulkPut(rowsToPut);
            if (idsToDelete.length > 0) {
              await db[item.table].bulkDelete(idsToDelete);
            }
          });
        }
      }
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') {
        throw err;
      }
      console.warn(`Unable to prefetch table ${item.table} from server (offline):`, err);
    }
  }

  // Prefetch dependent entities for trips atomically
  try {
    const trips = await db.trips.toArray();
    for (const t of trips) {
      // 1. Itinerary items (High priority for immediate view rendering)
      const itinRes = await fetch(`/api/itineraries/${t.id}`, { headers });
      checkResponseAuth(itinRes);
      if (itinRes.status === 401 || itinRes.status === 403) {
        throw new Error('AUTH_EXPIRED');
      }
      if (itinRes.ok) {
        const rows = await itinRes.json();
        await db.transaction('rw', [db.itinerary_items], async () => {
          const localItinRows = (await db.itinerary_items.toArray()).filter(i => String(i.trip_id) === String(t.id));
          const serverItinIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
          const itinIdsToDelete = localItinRows.map(r => r.id).filter(id => id && !serverItinIds.has(id.toString()) && !pendingIds.has(id.toString()));
          const itinRowsToPut = rows.filter(r => !pendingIds.has(r.id.toString()));

          await db.itinerary_items.bulkPut(itinRowsToPut);
          if (itinIdsToDelete.length > 0) {
            await db.itinerary_items.bulkDelete(itinIdsToDelete);
          }
        });
      }

      // 2. Reservations
      const resRes = await fetch(`/api/reservations/${t.id}`, { headers });
      checkResponseAuth(resRes);
      if (resRes.status === 401 || resRes.status === 403) {
        throw new Error('AUTH_EXPIRED');
      }
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

        await db.transaction('rw', [db.reservations], async () => {
          const localResRows = (await db.reservations.toArray()).filter(r => String(r.trip_id) === String(t.id));
          const serverResIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
          const resIdsToDelete = localResRows.map(r => r.id).filter(id => id && !serverResIds.has(id.toString()) && !pendingIds.has(id.toString()));
          const resRowsToPut = parsedRows.filter(r => !pendingIds.has(r.id.toString()));

          await db.reservations.bulkPut(resRowsToPut);
          if (resIdsToDelete.length > 0) {
            await db.reservations.bulkDelete(resIdsToDelete);
          }
        });
      }
      
      // Expenses
      const expRes = await fetch(`/api/expenses/${t.id}`, { headers });
      checkResponseAuth(expRes);
      if (expRes.status === 401 || expRes.status === 403) {
        throw new Error('AUTH_EXPIRED');
      }
      if (expRes.ok) {
        const rows = await expRes.json();
        await db.transaction('rw', [db.expenses], async () => {
          const localExpRows = (await db.expenses.toArray()).filter(e => String(e.trip_id) === String(t.id));
          const serverExpIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
          const expIdsToDelete = localExpRows.map(r => r.id).filter(id => id && !serverExpIds.has(id.toString()) && !pendingIds.has(id.toString()));
          const expRowsToPut = rows.filter(r => !pendingIds.has(r.id.toString()));

          await db.expenses.bulkPut(expRowsToPut);
          if (expIdsToDelete.length > 0) {
            await db.expenses.bulkDelete(expIdsToDelete);
          }
        });
      }

      // Rates
      const rateRes = await fetch(`/api/trips/${t.id}/rates`, { headers });
      checkResponseAuth(rateRes);
      if (rateRes.status === 401 || rateRes.status === 403) {
        throw new Error('AUTH_EXPIRED');
      }
      if (rateRes.ok) {
        const rows = await rateRes.json();
        await db.transaction('rw', [db.trip_currency_rates], async () => {
          const localRateRows = (await db.trip_currency_rates.toArray()).filter(r => String(r.trip_id) === String(t.id));
          const serverRateIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
          const rateIdsToDelete = localRateRows.map(r => r.id).filter(id => id && !serverRateIds.has(id.toString()) && !pendingIds.has(id.toString()));
          const rateRowsToPut = rows.filter(r => !pendingIds.has(r.id.toString()));

          await db.trip_currency_rates.bulkPut(rateRowsToPut);
          if (rateIdsToDelete.length > 0) {
            await db.trip_currency_rates.bulkDelete(rateIdsToDelete);
          }
        });
      }

      // Trip Notes
      const notesRes = await fetch(`/api/trips/${t.id}/notes`, { headers });
      checkResponseAuth(notesRes);
      if (notesRes.status === 401 || notesRes.status === 403) {
        throw new Error('AUTH_EXPIRED');
      }
      if (notesRes.ok) {
        const rows = await notesRes.json();
        await db.transaction('rw', [db.trip_notes], async () => {
          const localNoteRows = await db.trip_notes.where({ trip_id: t.id }).toArray();
          const serverNoteIds = new Set(rows.map(r => r.id ? r.id.toString() : null).filter(Boolean));
          const noteIdsToDelete = localNoteRows.map(r => r.id).filter(id => id && !serverNoteIds.has(id.toString()) && !pendingIds.has(id.toString()));
          const noteRowsToPut = rows.filter(r => !pendingIds.has(r.id.toString()));

          await db.trip_notes.bulkPut(noteRowsToPut);
          if (noteIdsToDelete.length > 0) {
            await db.trip_notes.bulkDelete(noteIdsToDelete);
          }
        });
      }
    }
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED') {
      throw err;
    }
    console.warn('Unable to prefetch trip itineraries/expenses/notes (offline):', err);
  }

  // Pre-fetch all photos in bulk atomically
  try {
    const photoRes = await fetch('/api/photos', { headers });
    checkResponseAuth(photoRes);
    if (photoRes.status === 401 || photoRes.status === 403) {
      throw new Error('AUTH_EXPIRED');
    }
    if (photoRes.ok) {
      const photos = await photoRes.json();
      await db.transaction('rw', [db.entity_photos], async () => {
        await db.entity_photos.bulkPut(photos);
      });
    }
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED') {
      throw err;
    }
    console.warn('Unable to prefetch entity photos (offline):', err);
  }
}

// Clear all databases on logout or restore re-sync
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
  await db.ai_imports.clear();
  await db.saved_markdowns.clear();
  await db.people.clear();
  await db.user_addresses.clear();
  if (db.trip_notes) await db.trip_notes.clear();
  await db.sync_queue.clear();
}
