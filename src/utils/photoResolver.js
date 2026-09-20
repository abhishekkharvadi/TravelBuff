/**
 * Photo Resolver Utility
 * Resolves the primary/featured photo URL for an entity (place or location)
 * following the priority cascade:
 * 1. Explicitly featured photo in entity_photos (is_featured === 1)
 * 2. local_file_data directly on the entity
 * 3. First photo in entity_photos for this entity
 * 4. Child place fallback if the entity is a location folder
 */

export function formatPhotoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return '/' + trimmed;
}

export function getFeaturedPhotoUrl(entityId, photos = [], locations = [], places = []) {
  if (!entityId) return null;
  const idStr = String(entityId);

  // 1. Explicit featured photo in entity_photos
  const entityPhotoList = (photos || []).filter(p => String(p.entity_id) === idStr);
  const featured = entityPhotoList.find(p => p.is_featured === 1 || p.is_featured === true);
  if (featured && featured.file_path) {
    return formatPhotoUrl(featured.file_path);
  }

  // 2. Direct local_file_data on place or location
  const place = (places || []).find(p => String(p.id) === idStr);
  if (place && place.local_file_data) {
    return formatPhotoUrl(place.local_file_data);
  }

  const loc = (locations || []).find(l => String(l.id) === idStr);
  if (loc && loc.local_file_data) {
    return formatPhotoUrl(loc.local_file_data);
  }

  // 3. First available entity photo
  if (entityPhotoList.length > 0 && entityPhotoList[0].file_path) {
    return formatPhotoUrl(entityPhotoList[0].file_path);
  }

  // 4. If entity is a location, check if any of its sub-places has a photo
  if (loc) {
    const childPlaceWithLocalData = (places || []).find(p => String(p.location_id) === idStr && p.local_file_data);
    if (childPlaceWithLocalData && childPlaceWithLocalData.local_file_data) {
      return formatPhotoUrl(childPlaceWithLocalData.local_file_data);
    }
    const childPlacePhoto = (photos || []).find(p => (places || []).some(pl => String(pl.location_id) === idStr && String(pl.id) === String(p.entity_id)));
    if (childPlacePhoto && childPlacePhoto.file_path) {
      return formatPhotoUrl(childPlacePhoto.file_path);
    }
  }

  return null;
}
