import { db, queueSyncAction, generateUUID } from '../clientDb.js';

let isReconciling = false;

/**
 * Scans for folders/locations that do not have a cover photo and attempts to fetch
 * one via /api/import/search-photo (Google Maps Places -> Wikimedia Commons -> Wikipedia).
 * Persistently tracks attempt counts in localStorage so that after 2 tries it stops permanently.
 *
 * @param {Array} locations List of locations from Dexie
 * @param {Array} photos List of entity_photos from Dexie
 * @param {string} token Auth token
 */
export async function reconcileMissingFolderCovers(locations, photos, token) {
  if (isReconciling) return;
  if (!locations || locations.length === 0 || !token) return;

  isReconciling = true;

  try {
    const photoEntityIds = new Set((photos || []).map(p => p.entity_id));

    // Identify folders or locations lacking both local_file_data and entity_photos
    const missingCoverLocs = locations.filter(loc => {
      if (loc.photo_sync_status === 'pending') return false;
      const hasLocalData = loc.local_file_data && typeof loc.local_file_data === 'string' && loc.local_file_data.trim().length > 0;
      const hasEntityPhoto = photoEntityIds.has(loc.id);
      return !hasLocalData && !hasEntityPhoto;
    });

    if (missingCoverLocs.length === 0) {
      isReconciling = false;
      return;
    }

    const googleMapsApiKey = localStorage.getItem('google_maps_api_key');

    for (const loc of missingCoverLocs) {
      const retryKey = `tb_folder_cover_retries_${loc.id}`;
      const attempts = parseInt(localStorage.getItem(retryKey) || '0', 10);

      // Max 2 attempts allowed across restarts
      if (attempts >= 2) {
        continue;
      }

      // Increment and record attempt immediately
      localStorage.setItem(retryKey, (attempts + 1).toString());

      try {
        const res = await fetch('/api/import/search-photo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query: loc.name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            googleMapsApiKey: googleMapsApiKey || undefined
          })
        });

        if (res.ok) {
          const data = await res.json();
          const fileUrl = data.fileUrl || data.url;

          if (fileUrl) {
            const updates = { photo_sync_status: 'completed', local_file_data: fileUrl };
            if (data.description && (!loc.notes || !loc.notes.trim())) {
              updates.notes = data.description;
            }

            // Update local DB & sync queue
            await db.locations.update(loc.id, updates);
            await queueSyncAction('locations', 'update', { ...loc, ...updates });

            // Check if photo already recorded to avoid duplicate
            const existingPhotos = await db.entity_photos.where('entity_id').equals(loc.id).toArray();
            if (!existingPhotos.some(p => p.file_path === fileUrl)) {
              const newPhotoObj = {
                id: generateUUID(),
                entity_id: loc.id,
                file_path: fileUrl,
                is_featured: 1,
                created_at: new Date().toISOString()
              };
              await db.entity_photos.add(newPhotoObj);
              await queueSyncAction('entity_photos', 'insert', newPhotoObj);
            }
          }
        }
      } catch (err) {
        console.warn(`[PhotoReconciler] Failed attempt ${attempts + 1} for folder ${loc.name}:`, err);
      }

      // Small delay between requests to avoid burst load
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (globalErr) {
    console.warn('[PhotoReconciler] Global reconciliation error:', globalErr);
  } finally {
    isReconciling = false;
  }
}
