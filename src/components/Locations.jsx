import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  MapPin, Plus, Check, Square, Star, Image as ImageIcon, Trash2, 
  Search, X, Edit, Eye, Navigation, PlusCircle, Compass 
} from 'lucide-react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import MapView from './MapView.jsx';

function FolderCover({ folderId, locations, getFeaturedPhoto }) {
  const getAllChildLocationIds = (fId) => {
    let ids = [];
    const children = locations.filter(l => {
      const pId = l.parent_id;
      return pId && (String(pId) === String(fId));
    });
    for (const child of children) {
      ids.push(child.id);
      if (child.is_folder === 1) {
        ids = ids.concat(getAllChildLocationIds(child.id));
      }
    }
    return ids;
  };

  const allLocIds = getAllChildLocationIds(folderId);
  const images = allLocIds
    .map(id => getFeaturedPhoto(id))
    .filter(img => img && img !== 'null' && img !== 'undefined' && !img.includes('placeholder'));

  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [images.length]);

  const activeImg = images[index] || '/placeholder.jpg';

  return (
    <img 
      src={activeImg} 
      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }} 
      alt="Folder Cover" 
    />
  );
}

export default function Locations({ token, selectedLocation, setSelectedLocation, currentFolderId, setCurrentFolderId }) {
  // Dexie Queries (Reactive Live Updates)
  const locations = useLiveQuery(() => db.locations.toArray()) || [];
  const places = useLiveQuery(() => db.places.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const entityTags = useLiveQuery(() => db.entity_tags.toArray()) || [];
  const photos = useLiveQuery(() => db.entity_photos.toArray()) || [];
  const customCategories = useLiveQuery(() => db.custom_categories.where('type').equals('place').toArray()) || [];

  // Local State
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempLat, setTempLat] = useState('');
  const [tempLon, setTempLon] = useState('');
  const [showAddPlaceForm, setShowAddPlaceForm] = useState(false);
  
  // New Location Form
  const [locName, setLocName] = useState('');
  const [locState, setLocState] = useState('');
  const [locCountry, setLocCountry] = useState('');
  const [locLat, setLocLat] = useState('');
  const [locLon, setLocLon] = useState('');
  const [locNotes, setLocNotes] = useState('');
  const [isFolderChecked, setIsFolderChecked] = useState(false);

  // List Filter/Sort State
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateAdded, setFilterDateAdded] = useState('');
  const [filterVisited, setFilterVisited] = useState(''); // '', 'visited', 'not-visited'
  const [filterSource, setFilterSource] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  // Searchable Tag State
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // New Place Form
  const [placeName, setPlaceName] = useState('');
  const [placeCategory, setPlaceCategory] = useState('Cafe');
  const [placeLat, setPlaceLat] = useState('');
  const [placeLon, setPlaceLon] = useState('');
  const [placeNotes, setPlaceNotes] = useState('');
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [placeSearchResults, setPlaceSearchResults] = useState([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);

  // Selected place detailing inside dialog
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  // Visit History details for active location
  const [visitsHistory, setVisitsHistory] = useState([]);

  // Immich States
  const [immichUrl, setImmichUrl] = useState('');
  const [immichKey, setImmichKey] = useState('');
  const [immichAltUrl, setImmichAltUrl] = useState('');
  const [isImmichConfigured, setIsImmichConfigured] = useState(false);
  const [allImmichAlbums, setAllImmichAlbums] = useState([]);
  const [albumSearch, setAlbumSearch] = useState('');
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [linkedAlbumData, setLinkedAlbumData] = useState([]);
  const [immichPeople, setImmichPeople] = useState([]);
  const [showAddVisitForm, setShowAddVisitForm] = useState(false);
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualAlbumLink, setManualAlbumLink] = useState('');
  const [visitError, setVisitError] = useState('');

  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSavingPlace, setIsSavingPlace] = useState(false);

  // Tag creation modal states inside locations
  const [selectedTagToAdd, setSelectedTagToAdd] = useState('');

  // 1-second debounced Nominatim Search
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data);
          setIsSearching(false);
        })
        .catch(err => {
          console.error('Nominatim API error:', err);
          setIsSearching(false);
        });
    }, 1000); // 1s Debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // 1-second debounced Nominatim Search for Places
  useEffect(() => {
    if (placeSearchQuery.trim().length < 3) {
      setPlaceSearchResults([]);
      return;
    }

    setIsSearchingPlace(true);
    const delayDebounceFn = setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(placeSearchQuery)}`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          setPlaceSearchResults(data);
          setIsSearchingPlace(false);
        })
        .catch(err => {
          console.error('Nominatim Place API error:', err);
          setIsSearchingPlace(false);
        });
    }, 1000); // 1s Debounce

    return () => clearTimeout(delayDebounceFn);
  }, [placeSearchQuery, selectedLocation]);

  // Select Place Search result
  const handleSelectPlaceSearchResult = (result) => {
    const address = result.address || {};
    const state = address.state || address.region || '';
    const country = address.country || '';

    // Guess category from OSM types/tags if possible
    const type = result.type?.toLowerCase() || '';
    const osmClass = result.class?.toLowerCase() || '';
    if (type.includes('cafe') || osmClass.includes('cafe')) {
      setPlaceCategory('cafe');
    } else if (type.includes('restaurant') || type.includes('fast_food') || type.includes('bar') || type.includes('pub') || osmClass.includes('amenity')) {
      setPlaceCategory('restaurant');
    } else if (type.includes('temple') || type.includes('place_of_worship') || type.includes('church') || type.includes('shrine')) {
      setPlaceCategory('temple');
    } else if (type.includes('museum') || type.includes('arts_centre') || type.includes('gallery')) {
      setPlaceCategory('museum');
    } else if (type.includes('water') || type.includes('waterfall') || type.includes('lake')) {
      setPlaceCategory('waterfall');
    } else if (type.includes('peak') || type.includes('mountain') || type.includes('volcano')) {
      setPlaceCategory('mountain');
    } else if (type.includes('track') || type.includes('path') || type.includes('trail')) {
      setPlaceCategory('trek');
    } else if (type.includes('hotel') || type.includes('hostel') || type.includes('motel') || type.includes('tourism')) {
      setPlaceCategory('hotel');
    } else if (type.includes('airport') || type.includes('aeroway')) {
      setPlaceCategory('airport');
    } else if (type.includes('station') || type.includes('subway') || type.includes('railway')) {
      setPlaceCategory('station');
    } else {
      setPlaceCategory('cafe'); // default fallback
    }

    setPlaceName(result.display_name.split(',')[0]);
    setPlaceLat(result.lat);
    setPlaceLon(result.lon);
    setPlaceSearchResults([]);
    setPlaceSearchQuery('');
  };

  // Load Visit History when a location is clicked
  useEffect(() => {
    if (selectedLocation) {
      fetch(`/api/locations/${selectedLocation.id}/visits`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setVisitsHistory(data))
        .catch(() => setVisitsHistory([]));
    }
  }, [selectedLocation, token]);

  // Drag & Drop handlers for folder grouping
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e, targetLoc) => {
    if (targetLoc.is_folder === 1) {
      e.preventDefault();
      setDragOverFolderId(targetLoc.id);
    }
  };

  const handleDrop = async (e, targetFolder) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetFolder.id) return;

    const draggedLoc = locations.find(l => l.id === draggedId);
    if (!draggedLoc) return;

    const confirmDrop = window.confirm(`Are you sure you want to move "${draggedLoc.name}" into the folder "${targetFolder.name}"?`);
    if (confirmDrop) {
      const updatedLoc = { ...draggedLoc, parent_id: targetFolder.id };
      await db.locations.update(draggedId, { parent_id: targetFolder.id });
      await queueSyncAction('locations', 'update', updatedLoc);
    }
  };

  // Helper: Get featured image or fallback placeholder
  const getFeaturedPhoto = (entityId) => {
    const loc = locations.find(l => l.id === entityId);
    if (loc && loc.local_file_data) return loc.local_file_data;

    const place = places.find(p => p.id === entityId);
    if (place && place.local_file_data) return place.local_file_data;

    const pList = photos.filter(p => p.entity_id === entityId);
    const featured = pList.find(p => p.is_featured === 1);
    return featured ? featured.file_path : (pList[0] ? pList[0].file_path : '/placeholder.jpg');
  };

  // Helper: Get folder hierarchy path breadcrumbs
  const getBreadcrumbs = () => {
    if (!currentFolderId) return [];
    const path = [];
    let currentId = currentFolderId;
    while (currentId) {
      const loc = locations.find(l => String(l.id) === String(currentId));
      if (!loc) break;
      path.unshift(loc);
      const pId = loc.parent_id;
      if (pId && pId !== 'null' && pId !== 'undefined') {
        currentId = pId;
      } else {
        currentId = null;
      }
    }
    return path;
  };

  // Helper: Get folder hierarchy path breadcrumbs for selected location detail view
  const getSelectedLocationBreadcrumbs = () => {
    if (!selectedLocation || !selectedLocation.parent_id || selectedLocation.parent_id === 'null' || selectedLocation.parent_id === 'undefined') return [];
    const path = [];
    let currentId = selectedLocation.parent_id;
    while (currentId) {
      const loc = locations.find(l => String(l.id) === String(currentId));
      if (!loc) break;
      path.unshift(loc);
      const pId = loc.parent_id;
      if (pId && pId !== 'null' && pId !== 'undefined') {
        currentId = pId;
      } else {
        currentId = null;
      }
    }
    return path;
  };

  // Helper: Get tags for an entity
  const getEntityTagsList = (entityId) => {
    const tIds = entityTags.filter(et => et.entity_id === entityId).map(et => et.tag_id);
    return tags.filter(t => tIds.includes(t.id));
  };

  // Create new location
  const handleCreateLocation = async (e) => {
    if (e) e.preventDefault();
    if (!locName.trim() || isSavingLocation) return;

    setIsSavingLocation(true);

    const newLocId = generateUUID();
    const cleanCountry = locCountry.trim();
    let finalName = locName.trim();
    if (cleanCountry && !finalName.endsWith(cleanCountry)) {
      finalName = `${finalName}, ${cleanCountry}`;
    }

    const latitudeVal = locLat ? parseFloat(locLat) : null;
    const longitudeVal = locLon ? parseFloat(locLon) : null;

    const newLoc = {
      id: newLocId,
      name: finalName,
      state: locState.trim() || null,
      country: locCountry.trim() || null,
      latitude: latitudeVal,
      longitude: longitudeVal,
      visited: 0,
      notes: locNotes,
      local_file_data: null,
      immich_album_id: null,
      parent_id: currentFolderId,
      is_folder: isFolderChecked ? 1 : 0,
      photo_sync_status: 'pending',
      created_at: new Date().toISOString()
    };

    // Save to IndexedDB and queue sync instantly
    await queueSyncAction('locations', 'insert', newLoc);

    // Fire background photo fetching without holding up the UI
    fetch('/api/import/search-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: finalName, latitude: latitudeVal, longitude: longitudeVal })
    })
      .then(res => res.ok ? res.json() : null)
      .then(async (data) => {
        if (data) {
          const updates = { photo_sync_status: 'completed' };
          if (data.fileUrl) updates.local_file_data = data.fileUrl;
          if (data.description && !locNotes.trim()) {
            updates.notes = data.description;
          }

          // Update local IndexedDB
          await db.locations.update(newLocId, updates);
          // Queue update sync
          await queueSyncAction('locations', 'update', {
            ...newLoc,
            ...updates
          });

          if (data.fileUrl) {
            // Insert entity_photos link
            await queueSyncAction('entity_photos', 'insert', {
              id: generateUUID(),
              entity_id: newLocId,
              file_path: data.fileUrl,
              is_featured: 1,
              created_at: new Date().toISOString()
            });
          }
        } else {
          await db.locations.update(newLocId, { photo_sync_status: 'failed' });
          await queueSyncAction('locations', 'update', {
            ...newLoc,
            photo_sync_status: 'failed'
          });
        }
      })
      .catch(async (err) => {
        console.error('Background location photo fetch failed:', err);
        await db.locations.update(newLocId, { photo_sync_status: 'failed' });
        await queueSyncAction('locations', 'update', {
          ...newLoc,
          photo_sync_status: 'failed'
        });
      });

    // Reset Form
    setLocName('');
    setLocState('');
    setLocCountry('');
    setLocLat('');
    setLocLon('');
    setLocNotes('');
    setSearchQuery('');
    setIsFolderChecked(false);
    setShowAddForm(false);
    setIsSavingLocation(false);
  };

  // Select Search result
  const handleSelectSearchResult = (result) => {
    const address = result.address || {};
    const state = address.state || address.region || '';
    const country = address.country || '';

    let parsedState = state;
    let parsedCountry = country;
    if (!parsedState || !parsedCountry) {
      const parts = result.display_name.split(',').map(p => p.trim());
      if (parts.length > 1) {
        parsedCountry = parsedCountry || parts[parts.length - 1];
        parsedState = parsedState || (parts.length > 2 ? parts[parts.length - 3] : parts[parts.length - 2]);
      }
    }

    setLocName(result.display_name.split(',')[0]);
    setLocState(parsedState);
    setLocCountry(parsedCountry);
    setLocLat(result.lat);
    setLocLon(result.lon);
    setSearchResults([]);
    setSearchQuery('');
  };

  // Toggle visited status for location
  const handleToggleVisited = async (loc) => {
    const newStatus = loc.visited === 1 ? 0 : 1;
    const updatedLoc = { ...loc, visited: newStatus, created_at: new Date().toISOString() };

    await queueSyncAction('locations', 'update', updatedLoc);
    setSelectedLocation(updatedLoc);
  };

  // Delete Location
  const handleDeleteLocation = async (locId) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;

    if (loc.is_folder === 1) {
      setFolderToDelete(loc);
    } else {
      if (window.confirm('Are you sure you want to delete this location? This will permanently delete the location, all places of visit within it, and all associated photo files.')) {
        await queueSyncAction('locations', 'delete', { id: locId });
        setSelectedLocation(null);
      }
    }
  };

  // Handle comma-separated coords paste for form inputs (string state)
  const handleCoordsPaste = (e, setLat, setLon) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.includes(',')) {
      e.preventDefault();
      const parts = pastedText.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          setLat(lat.toString());
          setLon(lon.toString());
        }
      }
    }
  };

  // Handle comma-separated coords paste directly in database sync (Edit Place block)
  const handleCoordsPasteDirect = (e, place) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.includes(',')) {
      e.preventDefault();
      const parts = pastedText.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          queueSyncAction('places', 'update', { ...place, latitude: lat, longitude: lon });
        }
      }
    }
  };

  // Add Place to Visit
  const handleAddPlace = async (e) => {
    e.preventDefault();
    if (!placeName.trim() || !selectedLocation || isSavingPlace) return;

    setIsSavingPlace(true);

    const newPlaceId = generateUUID();
    const latitudeVal = placeLat ? parseFloat(placeLat) : null;
    const longitudeVal = placeLon ? parseFloat(placeLon) : null;
    const cleanSearchQuery = `${placeName.trim()} ${selectedLocation.name}`.trim();

    const newPlace = {
      id: newPlaceId,
      location_id: selectedLocation.id,
      name: placeName,
      category: placeCategory,
      latitude: latitudeVal,
      longitude: longitudeVal,
      visited: 0,
      notes: placeNotes,
      local_file_data: null,
      immich_album_id: null,
      created_at: new Date().toISOString()
    };

    // Save to IndexedDB instantly
    await queueSyncAction('places', 'insert', newPlace);

    // Fire background photo fetching without holding up the UI
    fetch('/api/import/search-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: cleanSearchQuery, latitude: latitudeVal, longitude: longitudeVal })
    })
      .then(res => res.ok ? res.json() : null)
      .then(async (data) => {
        if (data) {
          const updates = { photo_sync_status: 'completed' };
          if (data.fileUrl) updates.local_file_data = data.fileUrl;
          if (data.description && !placeNotes.trim()) {
            updates.notes = data.description;
          }

          // Update local IndexedDB
          await db.places.update(newPlaceId, updates);
          // Queue update sync
          await queueSyncAction('places', 'update', {
            ...newPlace,
            ...updates
          });

          if (data.fileUrl) {
            // Insert entity_photos link
            await queueSyncAction('entity_photos', 'insert', {
              id: generateUUID(),
              entity_id: newPlaceId,
              file_path: data.fileUrl,
              is_featured: 1,
              created_at: new Date().toISOString()
            });
          }
        } else {
          await db.places.update(newPlaceId, { photo_sync_status: 'failed' });
          await queueSyncAction('places', 'update', {
            ...newPlace,
            photo_sync_status: 'failed'
          });
        }
      })
      .catch(async (err) => {
        console.error('Background place photo fetch failed:', err);
        await db.places.update(newPlaceId, { photo_sync_status: 'failed' });
        await queueSyncAction('places', 'update', {
          ...newPlace,
          photo_sync_status: 'failed'
        });
      });

    // Reset Form
    setPlaceName('');
    setPlaceLat('');
    setPlaceLon('');
    setPlaceNotes('');
    setShowAddPlaceForm(false);
    setIsSavingPlace(false);
  };

  // Toggle visited status for place
  const handleTogglePlaceVisited = async (place) => {
    const newStatus = place.visited === 1 ? 0 : 1;
    const updatedPlace = { ...place, visited: newStatus };

    await queueSyncAction('places', 'update', updatedPlace);
  };

  // Add Tag to Location/Place
  const handleAddTagToEntity = async (entityId) => {
    if (!selectedTagToAdd) return;
    await queueSyncAction('entity_tags', 'insert', { entity_id: entityId, tag_id: selectedTagToAdd });
    setSelectedTagToAdd('');
  };

  // Remove Tag from Location/Place
  const handleRemoveTagFromEntity = async (entityId, tagId) => {
    await queueSyncAction('entity_tags', 'delete', { entity_id: entityId, tag_id: tagId });
  };

  // Handle Photo Upload
  const handlePhotoUpload = async (e, entityId) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        // Insert photo record
        const newPhoto = {
          id: generateUUID(),
          entity_id: entityId,
          file_path: data.fileUrl,
          is_featured: 0
        };
        await queueSyncAction('entity_photos', 'insert', newPhoto);
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
    }
  };

  const handleSetFeaturedPhoto = async (photo) => {
    const list = photos.filter(p => p.entity_id === photo.entity_id);
    for (const p of list) {
      await queueSyncAction('entity_photos', 'update', { ...p, is_featured: p.id === photo.id ? 1 : 0 });
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (window.confirm('Delete this photo?')) {
      await queueSyncAction('entity_photos', 'delete', { id: photoId });
    }
  };

  const handleSaveName = async () => {
    if (tempName.trim()) {
      const latVal = tempLat.trim() ? parseFloat(tempLat) : null;
      const lonVal = tempLon.trim() ? parseFloat(tempLon) : null;
      const updated = { 
        ...selectedLocation, 
        name: tempName,
        latitude: latVal && !isNaN(latVal) ? latVal : null,
        longitude: lonVal && !isNaN(lonVal) ? lonVal : null,
        created_at: new Date().toISOString()
      };
      setSelectedLocation(updated);
      await queueSyncAction('locations', 'update', updated);
    }
    setIsEditingName(false);
  };

  // Immich API Integration & Setup Hooks
  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.config && data.config.immich_url && data.config.immich_key) {
          setImmichUrl(data.config.immich_url);
          setImmichKey(data.config.immich_key);
          setImmichAltUrl(data.config.immich_alt_url || '');
          setIsImmichConfigured(true);
        } else {
          setIsImmichConfigured(false);
        }
      })
      .catch(err => {
        console.error('Failed to load configs:', err);
        setIsImmichConfigured(false);
      });
  }, [token]);

  useEffect(() => {
    if (isImmichConfigured) {
      // Fetch albums
      fetch('/api/immich/albums', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setAllImmichAlbums(data))
        .catch(() => setAllImmichAlbums([]));

      // Fetch people
      fetch('/api/immich/people', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => setImmichPeople(data))
        .catch(() => setImmichPeople([]));
    }
  }, [isImmichConfigured, token]);

  const getVisits = (loc) => {
    if (!loc || !loc.immich_album_id || loc.immich_album_id === 'null' || loc.immich_album_id === 'undefined' || loc.immich_album_id.trim() === '') return [];
    try {
      const parsed = JSON.parse(loc.immich_album_id);
      if (parsed === null || parsed === undefined) return [];
      if (Array.isArray(parsed)) {
        return parsed.map(item => {
          if (typeof item === 'string') {
            return {
              id: item,
              isManual: false,
              startDate: null,
              endDate: null,
              albumLink: null,
              albumName: null
            };
          }
          return item;
        });
      }
      return [{
        id: loc.immich_album_id,
        isManual: false,
        startDate: null,
        endDate: null,
        albumLink: null,
        albumName: null
      }];
    } catch (e) {
      return [{
        id: loc.immich_album_id,
        isManual: false,
        startDate: null,
        endDate: null,
        albumLink: null,
        albumName: null
      }];
    }
  };

  const getLinkedAlbumIds = (loc) => {
    return getVisits(loc).filter(v => !v.isManual).map(v => v.id);
  };

  useEffect(() => {
    const albumIds = getLinkedAlbumIds(selectedLocation);
    if (!isImmichConfigured || albumIds.length === 0) {
      setLinkedAlbumData([]);
      return;
    }

    Promise.all(
      albumIds.map(id =>
        fetch(`/api/immich/album/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      setLinkedAlbumData(results.filter(Boolean));
    });
  }, [selectedLocation?.immich_album_id, isImmichConfigured, token]);

  const handleLinkAlbum = async (albumId) => {
    if (!selectedLocation) return;
    const albumObj = allImmichAlbums.find(a => a.id === albumId);
    
    const newVisit = {
      id: albumId,
      isManual: false,
      startDate: albumObj?.startDate || null,
      endDate: albumObj?.endDate || null,
      albumLink: null,
      albumName: albumObj?.albumName || 'Immich Album'
    };

    const currentVisits = getVisits(selectedLocation);
    if (currentVisits.some(v => v.id === albumId)) return;
    const updatedVisits = [...currentVisits, newVisit];
    
    const updatedLoc = { 
      ...selectedLocation, 
      immich_album_id: JSON.stringify(updatedVisits),
      visited: 1, // Automatically mark location as visited
      created_at: new Date().toISOString()
    };
    
    setSelectedLocation(updatedLoc);
    await queueSyncAction('locations', 'update', updatedLoc);
    setAlbumSearch('');
    setShowAlbumDropdown(false);
  };

  const handleDeleteVisit = async (visitId) => {
    if (!selectedLocation) return;
    
    const confirmDelete = window.confirm("Are you sure you want to delete this visit?");
    if (!confirmDelete) return;

    const currentVisits = getVisits(selectedLocation);
    const updatedVisits = currentVisits.filter(v => v.id !== visitId);
    
    let newVisited = selectedLocation.visited;
    if (updatedVisits.length === 0) {
      const confirmNotVisited = window.confirm("You have deleted all visits. Would you like to mark this location as Not Visited?");
      if (confirmNotVisited) {
        newVisited = 0;
      }
    }

    const updatedLoc = {
      ...selectedLocation,
      immich_album_id: updatedVisits.length ? JSON.stringify(updatedVisits) : null,
      visited: newVisited,
      created_at: new Date().toISOString()
    };

    setSelectedLocation(updatedLoc);
    await queueSyncAction('locations', 'update', updatedLoc);
  };

  const handleAddManualVisit = async (e) => {
    if (e) e.preventDefault();
    if (!manualStartDate || !manualEndDate) {
      setVisitError('Start Date and End Date are mandatory.');
      return;
    }
    const start = new Date(manualStartDate);
    const end = new Date(manualEndDate);
    if (end < start) {
      setVisitError('Visit End date cannot be earlier than Visit Start date.');
      return;
    }
    setVisitError('');

    const newVisit = {
      id: `manual-${Date.now()}`,
      isManual: true,
      startDate: manualStartDate,
      endDate: manualEndDate,
      albumLink: manualAlbumLink.trim() || null,
      albumName: 'Manual Visit'
    };

    const currentVisits = getVisits(selectedLocation);
    const updatedVisits = [...currentVisits, newVisit];

    const updatedLoc = {
      ...selectedLocation,
      immich_album_id: JSON.stringify(updatedVisits),
      visited: 1, // Automatically mark location as visited
      created_at: new Date().toISOString()
    };

    setSelectedLocation(updatedLoc);
    await queueSyncAction('locations', 'update', updatedLoc);

    // Reset state
    setManualStartDate('');
    setManualEndDate('');
    setManualAlbumLink('');
    setShowAddVisitForm(false);
  };

  const formatImmichDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const parts = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).split(' ');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
    return date.toLocaleDateString();
  };

  const getAlbumDates = (album) => {
    const start = formatImmichDate(album.startDate);
    const end = formatImmichDate(album.endDate);
    return { start, end };
  };

  const getAlbumPeople = (album, allPeople) => {
    if (!album.assets) return [];
    const personIds = new Set();
    album.assets.forEach(asset => {
      if (asset.people && Array.isArray(asset.people)) {
        asset.people.forEach(p => {
          if (p.id) personIds.add(p.id);
          else if (typeof p === 'string') personIds.add(p);
        });
      }
    });
    return allPeople.filter(p => personIds.has(p.id));
  };

  const activeLocationPlaces = places.filter(p => selectedLocation && p.location_id === selectedLocation.id);

  if (selectedLocation) {
    return (
      <div className="container">
        {/* Detail page header with Title (left) and Visited/Delete (right) */}
        <div className="page-header" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {isEditingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    background: '#1a1a24',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    width: '200px'
                  }}
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Location Name"
                  autoFocus
                />
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  style={{
                    fontSize: '1rem',
                    background: '#1a1a24',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    width: '120px'
                  }}
                  value={tempLat}
                  onChange={(e) => setTempLat(e.target.value)}
                  onPaste={(e) => handleCoordsPaste(e, setTempLat, setTempLon)}
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  style={{
                    fontSize: '1rem',
                    background: '#1a1a24',
                    border: '1px solid var(--border-glass)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    width: '120px'
                  }}
                  value={tempLon}
                  onChange={(e) => setTempLon(e.target.value)}
                  onPaste={(e) => handleCoordsPaste(e, setTempLat, setTempLon)}
                  placeholder="Longitude"
                />
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveName}
                  style={{ width: 'auto', padding: '4px 10px', fontSize: '0.85rem' }}
                >
                  Save
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsEditingName(false)}
                  style={{ width: 'auto', padding: '4px 10px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                {(() => {
                  const crumbs = getSelectedLocationBreadcrumbs();
                  if (crumbs.length === 0) return null;
                  return (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {crumbs.map((crumb, idx) => (
                        <React.Fragment key={crumb.id}>
                          <span
                            onClick={() => {
                              setSelectedLocation(null);
                              setCurrentFolderId(crumb.id);
                            }}
                            style={{ cursor: 'pointer', color: 'var(--accent-secondary)' }}
                          >
                            {crumb.name}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>&gt;</span>
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
                <h2 
                  onClick={() => { 
                    setIsEditingName(true); 
                    setTempName(selectedLocation.name);
                    setTempLat(selectedLocation.latitude !== null && selectedLocation.latitude !== undefined ? selectedLocation.latitude.toString() : '');
                    setTempLon(selectedLocation.longitude !== null && selectedLocation.longitude !== undefined ? selectedLocation.longitude.toString() : '');
                  }} 
                  style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  title="Click to edit name and coordinates"
                >
                  {selectedLocation.name} <span style={{ fontSize: '1rem', opacity: 0.6 }}>✏️</span>
                </h2>
                {(selectedLocation.state || selectedLocation.country) && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📍</span>
                    <span>
                      {[selectedLocation.state, selectedLocation.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => handleToggleVisited(selectedLocation)}
              style={{
                background: selectedLocation.visited === 1 ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)', borderRadius: '20px', padding: '8px 16px',
                fontSize: '0.8rem', fontWeight: 600, color: selectedLocation.visited === 1 ? 'var(--success)' : 'var(--text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {selectedLocation.visited === 1 ? '✓ Visited' : '○ Not Visited'}
            </button>
            <button 
              onClick={async () => {
                const newIsFolder = selectedLocation.is_folder === 1 ? 0 : 1;
                const updated = { ...selectedLocation, is_folder: newIsFolder };
                await db.locations.update(selectedLocation.id, { is_folder: newIsFolder });
                await queueSyncAction('locations', 'update', updated);
                setSelectedLocation(updated);

                if (newIsFolder === 1 && (!selectedLocation.notes || !selectedLocation.notes.trim() || !selectedLocation.local_file_data)) {
                  fetch('/api/import/search-photo', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      query: selectedLocation.name,
                      latitude: selectedLocation.latitude,
                      longitude: selectedLocation.longitude
                    })
                  })
                    .then(res => res.ok ? res.json() : null)
                    .then(async (data) => {
                      if (data) {
                        const updates = { photo_sync_status: 'completed' };
                        if (data.fileUrl) updates.local_file_data = data.fileUrl;
                        if (data.description && (!selectedLocation.notes || !selectedLocation.notes.trim())) {
                          updates.notes = data.description;
                        }
                        await db.locations.update(selectedLocation.id, updates);
                        await queueSyncAction('locations', 'update', {
                          ...updated,
                          ...updates
                        });
                        setSelectedLocation(prev => prev && prev.id === selectedLocation.id ? { ...prev, ...updates } : prev);
                      }
                    })
                    .catch(err => console.error('Wikipedia fetch on folder conversion failed:', err));
                }
              }}
              style={{
                background: selectedLocation.is_folder === 1 ? 'var(--accent-primary-glow)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)', borderRadius: '20px', padding: '8px 16px',
                fontSize: '0.8rem', fontWeight: 600, color: selectedLocation.is_folder === 1 ? 'var(--accent-primary-hover)' : 'var(--text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {selectedLocation.is_folder === 1 ? '📂 Folder' : '📄 Convert to Folder'}
            </button>
            <button 
              onClick={() => handleDeleteLocation(selectedLocation.id)} 
              style={{ 
                width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', border: '1px solid var(--error-glow)', 
                borderRadius: '50%', cursor: 'pointer' 
              }}
              title="Delete Location"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Split Page Layout: Left for Options/Lists, Right for Map */}
        <div className="location-detail-grid">
          {/* Left Column: All Options & Sub-places */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Visit History */}
            {visitsHistory.length > 0 && (
              <div style={{ background: '#1c1b22', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--accent-secondary)' }}>Visit History</h4>
                <ul style={{ paddingLeft: '20px', fontSize: '0.85rem' }}>
                  {visitsHistory.map(v => (
                    <li key={v.id} style={{ marginBottom: '6px' }}>
                      Visited on trip <b>{v.name}</b> ({v.start_date} to {v.end_date})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags Section */}
            <div>
              <h4 style={{ marginBottom: '8px' }}>Location Tags</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {getEntityTagsList(selectedLocation.id).map(t => (
                  <span key={t.id} className="tag-badge" style={{ backgroundColor: t.color, color: '#000', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {t.name}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleRemoveTagFromEntity(selectedLocation.id, t.id)} />
                  </span>
                ))}
                {/* Searchable Tag Dropdown */}
                <div style={{ position: 'relative', display: 'inline-block', zIndex: 95 }}>
                  <input
                    type="text"
                    placeholder="+ Add Tag..."
                    className="form-control"
                    value={tagSearch}
                    onChange={(e) => {
                      setTagSearch(e.target.value);
                      setShowTagDropdown(true);
                    }}
                    onFocus={() => setShowTagDropdown(true)}
                    style={{
                      background: '#1a1a24',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      width: '120px'
                    }}
                  />
                  {showTagDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-sm)',
                      zIndex: 100,
                      maxHeight: '180px',
                      overflowY: 'auto',
                      width: '200px',
                      marginTop: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {tags
                        .filter(t => !getEntityTagsList(selectedLocation.id).map(et => et.id).includes(t.id))
                        .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        .map(t => (
                          <div
                            key={t.id}
                            onClick={async () => {
                              await queueSyncAction('entity_tags', 'insert', { entity_id: selectedLocation.id, tag_id: t.id });
                              setTagSearch('');
                              setShowTagDropdown(false);
                            }}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              borderBottom: '1px solid var(--border-glass)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'transparent'
                            }}
                          >
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: t.color, display: 'inline-block' }}></span>
                            {t.name}
                          </div>
                        ))}
                      {tagSearch.trim() && !tags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                        <div
                          onClick={async () => {
                            const newTagId = generateUUID();
                            const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
                            const randomColor = colors[Math.floor(Math.random() * colors.length)];
                            const newTag = {
                              id: newTagId,
                              name: tagSearch.trim(),
                              color: randomColor
                            };
                            await queueSyncAction('tags', 'insert', newTag);
                            await queueSyncAction('entity_tags', 'insert', { entity_id: selectedLocation.id, tag_id: newTagId });
                            setTagSearch('');
                            setShowTagDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            borderBottom: '1px solid var(--border-glass)',
                            color: 'var(--accent-primary-hover)',
                            fontWeight: '600',
                            background: 'transparent'
                          }}
                        >
                          + Create Tag "{tagSearch.trim()}"
                        </div>
                      )}
                      {tags
                        .filter(t => !getEntityTagsList(selectedLocation.id).map(et => et.id).includes(t.id))
                        .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && !tagSearch.trim() && (
                        <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          No matching tags
                        </div>
                      )}
                    </div>
                  )}
                  {showTagDropdown && (
                    <div 
                      onClick={() => setShowTagDropdown(false)} 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <h4 style={{ marginBottom: '8px' }}>Notes</h4>
              <textarea
                className="form-control"
                rows="4"
                value={selectedLocation.notes}
                onChange={(e) => {
                  const updated = { ...selectedLocation, notes: e.target.value, created_at: new Date().toISOString() };
                  setSelectedLocation(updated);
                  queueSyncAction('locations', 'update', updated);
                }}
                placeholder="Record description, best season to visit, packing requirements..."
              />
            </div>

            {/* Photo Gallery */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h4 style={{ margin: 0 }}>Photo Gallery</h4>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => document.getElementById(`photo-upload-loc`).click()}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={12} /> Upload
                </button>
                <input
                  type="file"
                  id="photo-upload-loc"
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, selectedLocation.id)}
                  style={{ display: 'none' }}
                />
              </div>
              <div className="photos-grid">
                {photos.filter(p => p.entity_id === selectedLocation.id).map(photo => (
                  <div key={photo.id} className="photo-thumb">
                    <img src={photo.file_path} alt="Location visual" />
                    {photo.is_featured === 1 && <span className="featured-badge">Featured</span>}
                    <div className="photo-actions">
                      <button className={`photo-action-btn ${photo.is_featured === 1 ? 'featured-btn' : ''}`} onClick={() => handleSetFeaturedPhoto(photo)}>
                        <Star size={12} fill={photo.is_featured === 1 ? '#f59e0b' : 'none'} />
                      </button>
                      <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Places to Visit */}
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Places to Visit</h3>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowAddPlaceForm(!showAddPlaceForm)}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={12} /> Add New Place
                </button>
              </div>

              {/* Form to Add New Place (Toggleable) */}
              {showAddPlaceForm && (
                <form onSubmit={handleAddPlace} style={{ background: '#1c1b22', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
                  
                  {/* OSM Place Search */}
                  <div className="form-group">
                    <label>Search OSM for Place / Landmark</label>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingLeft: '38px' }}
                        placeholder="Search landmarks, cafes, sights near this region..."
                        value={placeSearchQuery}
                        onChange={(e) => setPlaceSearchQuery(e.target.value)}
                      />
                    </div>
                    {isSearchingPlace && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Searching Nominatim...</p>}
                    {placeSearchResults.length > 0 && (
                      <div style={{
                        background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--radius-sm)', marginTop: '8px', maxHeight: '150px', overflowY: 'auto',
                        position: 'relative', zIndex: 10
                      }}>
                        {placeSearchResults.map((r, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleSelectPlaceSearchResult(r)}
                            style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', fontSize: '0.85rem' }}
                          >
                            {r.display_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Place Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Kyoto Imperial Palace, Starbucks..."
                      required
                      value={placeName}
                      onChange={(e) => setPlaceName(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Category</label>
                      <select
                        className="form-control"
                        value={placeCategory}
                        onChange={(e) => setPlaceCategory(e.target.value)}
                      >
                        {customCategories.map(c => (
                          <option key={c.id} value={c.name}>{c.icon || '📌'} {c.name}</option>
                        ))}
                      </select>
                    </div>
                     <div className="form-group" style={{ flex: 1 }}>
                      <label>Latitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control"
                        value={placeLat}
                        onChange={(e) => setPlaceLat(e.target.value)}
                        onPaste={(e) => handleCoordsPaste(e, setPlaceLat, setPlaceLon)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Longitude (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control"
                        value={placeLon}
                        onChange={(e) => setPlaceLon(e.target.value)}
                        onPaste={(e) => handleCoordsPaste(e, setPlaceLat, setPlaceLon)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Place Notes</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Add recommendations, reservations, operating hours..."
                      value={placeNotes}
                      onChange={(e) => setPlaceNotes(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddPlaceForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSavingPlace}>
                      {isSavingPlace ? 'Saving...' : 'Save Place to Visit'}
                    </button>
                  </div>
                </form>
              )}

              {/* Sub-places List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {activeLocationPlaces.map(place => {
                  const featuredPlaceImg = getFeaturedPhoto(place.id);
                  return (
                    <div 
                      key={place.id} 
                      style={{
                        background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)',
                        display: 'flex', overflow: 'hidden', padding: '8px'
                      }}
                    >
                      <img 
                        src={featuredPlaceImg} 
                        onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=150'}
                        style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                        alt={place.name}
                      />
                      <div style={{ flexGrow: 1, paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '1rem' }}>{place.name}</h4>
                            <button 
                              onClick={() => handleTogglePlaceVisited(place)}
                              style={{
                                background: place.visited === 1 ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)',
                                border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem',
                                color: place.visited === 1 ? 'var(--success)' : 'var(--text-secondary)', cursor: 'pointer'
                              }}
                            >
                              {place.visited === 1 ? '✓ Visited' : '○ To Visit'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                              {place.category}
                            </span>
                            {place.created_at && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                • Added: {new Date(place.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {place.latitude ? `📍 Geocoded` : `⚠️ No Coordinates`}
                          </span>
                          <button 
                            style={{ background: 'none', border: 'none', color: 'var(--accent-primary-hover)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setSelectedPlaceId(selectedPlaceId === place.id ? null : place.id)}
                          >
                            <Edit size={12} /> {selectedPlaceId === place.id ? 'Close Details' : 'Edit Details'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sub-place Form Editor (Dynamic toggle inline) */}
              {selectedPlaceId && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '24px' }}>
                  {(() => {
                    const place = places.find(p => p.id === selectedPlaceId);
                    if (!place) return null;
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <h4>Edit Details: {place.name}</h4>
                          <Trash2 size={16} style={{ color: 'var(--error)', cursor: 'pointer' }} onClick={async () => {
                            if (window.confirm('Are you sure you want to delete this place? This will permanently delete the place of visit and all its associated photo files.')) {
                              await queueSyncAction('places', 'delete', { id: place.id });
                              setSelectedPlaceId(null);
                            }
                          }} />
                        </div>

                        <div className="form-group">
                          <label>Place Name</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            value={place.name}
                            onChange={(e) => queueSyncAction('places', 'update', { ...place, name: e.target.value })}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label>Latitude</label>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              value={place.latitude || ''}
                              onChange={(e) => queueSyncAction('places', 'update', { ...place, latitude: parseFloat(e.target.value) || null })}
                              onPaste={(e) => handleCoordsPasteDirect(e, place)}
                            />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label>Longitude</label>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              value={place.longitude || ''}
                              onChange={(e) => queueSyncAction('places', 'update', { ...place, longitude: parseFloat(e.target.value) || null })}
                              onPaste={(e) => handleCoordsPasteDirect(e, place)}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Category</label>
                          <select
                            className="form-control"
                            value={place.category || ''}
                            onChange={(e) => queueSyncAction('places', 'update', { ...place, category: e.target.value })}
                          >
                            <option value="">Select Category</option>
                            {customCategories.map(c => (
                              <option key={c.id} value={c.name}>{c.icon || '📌'} {c.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Notes</label>
                          <textarea 
                            className="form-control" 
                            rows="2"
                            value={place.notes || ''}
                            onChange={(e) => queueSyncAction('places', 'update', { ...place, notes: e.target.value })}
                          />
                        </div>

                        {/* Place Photos */}
                        <div style={{ marginTop: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px' }}>Place Photos</label>
                          <div className="photo-uploader" onClick={() => document.getElementById(`photo-upload-${place.id}`).click()}>
                            <ImageIcon size={18} style={{ color: 'var(--text-muted)', marginBottom: '4px' }} />
                            <p style={{ fontSize: '0.75rem' }}>Upload Photo</p>
                            <input
                              type="file"
                              id={`photo-upload-${place.id}`}
                              accept="image/*"
                              onChange={(e) => handlePhotoUpload(e, place.id)}
                              style={{ display: 'none' }}
                            />
                          </div>
                          <div className="photos-grid">
                            {photos.filter(p => p.entity_id === place.id).map(photo => (
                              <div key={photo.id} className="photo-thumb">
                                <img src={photo.file_path} alt="Place visual" />
                                {photo.is_featured === 1 && <span className="featured-badge">Featured</span>}
                                <div className="photo-actions">
                                  <button className={`photo-action-btn ${photo.is_featured === 1 ? 'featured-btn' : ''}`} onClick={() => handleSetFeaturedPhoto(photo)}>
                                    <Star size={12} fill={photo.is_featured === 1 ? '#f59e0b' : 'none'} />
                                  </button>
                                  <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)}>
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}


            </div>
          </div>

          {/* Right Column: Map & Visits & Gallery */}
          <div style={{ position: 'sticky', top: '100px', height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '4px', zIndex: 10 }}>
            {/* Map View */}
            <div style={{ height: '350px', minHeight: '300px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0 }}>
              {selectedLocation.latitude && selectedLocation.longitude && (
                <MapView 
                  points={[
                    selectedLocation, 
                    ...activeLocationPlaces.map(p => ({ ...p, type: p.category }))
                  ]} 
                />
              )}
            </div>
                   {/* Visits Section */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-primary-hover)' }}>📅 Visits</h3>
                <button 
                  onClick={() => {
                    setShowAddVisitForm(!showAddVisitForm);
                    setVisitError('');
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                  title="Add Visit Manually"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Add Manual Visit Form */}
              {showAddVisitForm && (
                <form onSubmit={handleAddManualVisit} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Visit Start *</label>
                      <input
                        type="date"
                        required
                        className="form-control"
                        style={{ fontSize: '0.8rem', padding: '4px 8px', height: '30px' }}
                        value={manualStartDate}
                        onChange={(e) => setManualStartDate(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Visit End *</label>
                      <input
                        type="date"
                        required
                        className="form-control"
                        style={{ fontSize: '0.8rem', padding: '4px 8px', height: '30px' }}
                        value={manualEndDate}
                        onChange={(e) => setManualEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Album Link (Optional)</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      className="form-control"
                      style={{ fontSize: '0.8rem', padding: '4px 8px', height: '30px' }}
                      value={manualAlbumLink}
                      onChange={(e) => setManualAlbumLink(e.target.value)}
                    />
                  </div>
                  {visitError && (
                    <div style={{ color: 'var(--error)', fontSize: '0.75rem', marginBottom: '8px' }}>
                      ⚠️ {visitError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      onClick={() => setShowAddVisitForm(false)} 
                      style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--accent-primary-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#000', fontWeight: 'bold' }}
                    >
                      Save Visit
                    </button>
                  </div>
                </form>
              )}

              {/* Searchable input & dropdown (Immich integration) */}
              {isImmichConfigured && (
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Search and associate Immich albums..."
                    className="form-control"
                    value={albumSearch}
                    onChange={(e) => {
                      setAlbumSearch(e.target.value);
                      setShowAlbumDropdown(true);
                    }}
                    onFocus={() => setShowAlbumDropdown(true)}
                    style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                  />
                  {showAlbumDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-sm)',
                      zIndex: 110,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: '6px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
                    }}>
                      {allImmichAlbums
                        .filter(a => !getLinkedAlbumIds(selectedLocation).includes(a.id))
                        .filter(a => a.albumName.toLowerCase().includes(albumSearch.toLowerCase()))
                        .map(a => (
                          <div
                            key={a.id}
                            onClick={() => handleLinkAlbum(a.id)}
                            style={{
                              padding: '10px 14px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              borderBottom: '1px solid var(--border-glass)',
                              background: 'transparent',
                              transition: 'background 0.2s',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontWeight: 500 }}>{a.albumName}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.assetCount} photos</span>
                          </div>
                        ))}
                      {allImmichAlbums
                        .filter(a => !getLinkedAlbumIds(selectedLocation).includes(a.id))
                        .filter(a => a.albumName.toLowerCase().includes(albumSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                          No matching albums found
                        </div>
                      )}
                    </div>
                  )}
                  {showAlbumDropdown && (
                    <div 
                      onClick={() => setShowAlbumDropdown(false)} 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                    />
                  )}
                </div>
              )}

              {/* List of currently linked albums / manual visits */}
              {getVisits(selectedLocation).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Header Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2fr 0.3fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', paddingBottom: '6px', borderBottom: '1px solid var(--border-glass)' }}>
                    <div>Visit Start</div>
                    <div>Visit End</div>
                    <div>Album</div>
                    <div></div>
                  </div>
                  
                  {/* Data Rows */}
                  {(() => {
                    const resolvedVisits = getVisits(selectedLocation).map(visit => {
                      let start = visit.startDate;
                      let end = visit.endDate;
                      let albumName = visit.albumName || 'Album';
                      let albumUrl = visit.albumLink;

                      if (!visit.isManual) {
                        const albumObj = linkedAlbumData.find(a => a.id === visit.id) || allImmichAlbums.find(a => a.id === visit.id);
                        if (albumObj) {
                          start = albumObj.startDate;
                          end = albumObj.endDate;
                          albumName = `${albumObj.albumName} (${albumObj.assetCount || 0})`;
                        }
                        const targetUrl = immichAltUrl || immichUrl;
                        albumUrl = `${targetUrl.replace(/\/$/, '')}/albums/${visit.id}`;
                      }
                      return {
                        ...visit,
                        resolvedStart: start,
                        resolvedEnd: end,
                        resolvedAlbumName: albumName,
                        resolvedAlbumUrl: albumUrl
                      };
                    });

                    resolvedVisits.sort((a, b) => {
                      const dateA = a.resolvedEnd ? new Date(a.resolvedEnd) : new Date(0);
                      const dateB = b.resolvedEnd ? new Date(b.resolvedEnd) : new Date(0);
                      return dateB - dateA;
                    });

                    return resolvedVisits.map(visit => {
                      const formattedStart = formatImmichDate(visit.resolvedStart);
                      const formattedEnd = formatImmichDate(visit.resolvedEnd);

                      return (
                        <div key={visit.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2fr 0.3fr', gap: '8px', alignItems: 'center', fontSize: '0.8rem', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ wordBreak: 'break-all' }}>{formattedStart || 'N/A'}</div>
                          <div style={{ wordBreak: 'break-all' }}>{formattedEnd || 'N/A'}</div>
                          <div style={{ wordBreak: 'break-word' }}>
                            {visit.resolvedAlbumUrl ? (
                              <a 
                                href={visit.resolvedAlbumUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ color: 'var(--accent-primary-hover)', textDecoration: 'underline', fontWeight: 500 }}
                              >
                                {visit.resolvedAlbumName}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not Available</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleDeleteVisit(visit.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--error)',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.8
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                              title="Delete Visit"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0 0 0', textAlign: 'center' }}>
                  No visits recorded.
                </p>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        {!currentFolderId ? (
          <h2>Locations & Regions</h2>
        ) : (
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: 0 }}>
            {(() => {
              const crumbs = getBreadcrumbs() || [];
              return crumbs.map((crumb, idx) => {
                const isLast = idx === crumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    <span
                      onClick={() => !isLast && setCurrentFolderId(crumb.id)}
                      style={{
                        cursor: isLast ? 'default' : 'pointer',
                        color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      {crumb.name}
                    </span>
                    {!isLast && <span style={{ color: 'var(--text-muted)' }}>&gt;</span>}
                  </React.Fragment>
                );
              });
            })()}
          </h2>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentFolderId && (
            <button 
              onClick={() => handleDeleteLocation(currentFolderId)} 
              style={{ 
                width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', border: '1px solid var(--error-glow)', 
                borderRadius: '50%', cursor: 'pointer' 
              }}
              title="Delete Active Folder"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ width: 'auto' }}>
            Add Location
          </button>
        </div>
      </div>


      {/* Delete Folder Custom Dialog Modal */}
      {folderToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Delete Folder</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Are you sure you want to delete the folder <strong>{folderToDelete.name}</strong>?
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0, lineHeight: '1.4' }}>
              You can choose to permanently delete all contents inside this folder, or preserve them and move them back to the root Locations list.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={async () => {
                  await queueSyncAction('locations', 'delete_folder', { id: folderToDelete.id, deleteContents: true });
                  if (currentFolderId === folderToDelete.id) {
                    setCurrentFolderId(folderToDelete.parent_id || null);
                  }
                  setFolderToDelete(null);
                  setSelectedLocation(null);
                }}
                className="btn"
                style={{ backgroundColor: 'var(--error)', color: '#fff', border: 'none', fontWeight: '600' }}
              >
                Delete All Contents
              </button>
              <button 
                onClick={async () => {
                  await queueSyncAction('locations', 'delete_folder', { id: folderToDelete.id, deleteContents: false });
                  if (currentFolderId === folderToDelete.id) {
                    setCurrentFolderId(folderToDelete.parent_id || null);
                  }
                  setFolderToDelete(null);
                  setSelectedLocation(null);
                }}
                className="btn btn-secondary"
                style={{ fontWeight: '600' }}
              >
                Move to Locations
              </button>
              <button 
                onClick={() => setFolderToDelete(null)}
                className="btn"
                style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontWeight: '600' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Overlay Dialog */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Add New Location</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowAddForm(false)} />
            </div>

            {/* Geocode Search */}
            <div className="form-group">
              <label>Search OSM for Region</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder="e.g. Paris, Tokyo, Bali..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {isSearching && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Searching Nominatim...</p>}
              {searchResults.length > 0 && (
                <div style={{
                  background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-sm)', marginTop: '8px', maxHeight: '150px', overflowY: 'auto'
                }}>
                  {searchResults.map((r, i) => (
                    <div 
                      key={i} 
                      onClick={() => handleSelectSearchResult(r)}
                      style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateLocation}>
              <div className="form-group">
                <label>Location Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>State / Region</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Tamil Nadu, Tokyo"
                    value={locState}
                    onChange={(e) => setLocState(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Country</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. India, Japan"
                    value={locCountry}
                    onChange={(e) => setLocCountry(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={locLat}
                    onChange={(e) => setLocLat(e.target.value)}
                    onPaste={(e) => handleCoordsPaste(e, setLocLat, setLocLon)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={locLon}
                    onChange={(e) => setLocLon(e.target.value)}
                    onPaste={(e) => handleCoordsPaste(e, setLocLat, setLocLon)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  id="createAsFolder"
                  checked={isFolderChecked}
                  onChange={(e) => setIsFolderChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="createAsFolder" style={{ cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none', margin: 0 }}>
                  Create as Folder (allows grouping other locations inside)
                </label>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={locNotes}
                  onChange={(e) => setLocNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingLocation}>
                  {isSavingLocation ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filtering and Sorting Toolbar */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--bg-surface-elevated)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-glass)',
        marginBottom: '20px'
      }}>
        {/* Row 1: Filters & Sort & Reset */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          width: '100%'
        }}>
          {/* Filter by Country */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Country</label>
            <select
              className="form-control"
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Countries</option>
              {Array.from(new Set(locations.map(l => l.country).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Filter by Source Website */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Source Website</label>
            <select
              className="form-control"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              style={{ minWidth: '120px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Sources</option>
              {(() => {
                const allSources = new Set();
                locations.forEach(loc => {
                  if (loc.source_urls) {
                    try {
                      const urls = JSON.parse(loc.source_urls);
                      if (Array.isArray(urls)) {
                        urls.forEach(u => {
                          try {
                            const host = new URL(u).hostname.replace('www.', '');
                            if (host) allSources.add(host);
                          } catch (_) {}
                        });
                      }
                    } catch (_) {}
                  }
                });
                return Array.from(allSources).sort().map(src => (
                  <option key={src} value={src}>{src}</option>
                ));
              })()}
            </select>
          </div>

          {/* Filter by State */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>State</label>
            <select
              className="form-control"
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All States</option>
              {Array.from(new Set(locations.map(l => l.state).filter(Boolean))).sort().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Filter by Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Tag</label>
            <select
              className="form-control"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Tags</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Filter by Category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Category</label>
            <select
              className="form-control"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Categories</option>
              {Array.from(new Set(places.map(p => p.category).filter(Boolean))).sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Filter by Date Added */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Date Added</label>
            <select
              className="form-control"
              value={filterDateAdded}
              onChange={(e) => setFilterDateAdded(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>

          {/* Filter by Visited status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Status</label>
            <select
              className="form-control"
              value={filterVisited}
              onChange={(e) => setFilterVisited(e.target.value)}
              style={{ minWidth: '100px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">All Statuses</option>
              <option value="visited">Visited</option>
              <option value="not-visited">Not Visited</option>
            </select>
          </div>

          {/* Sort option */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Sort By</label>
            <select
              className="form-control"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: '120px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="date-desc">Date Added (Newest)</option>
              <option value="date-asc">Date Added (Oldest)</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="country-asc">Country (A-Z)</option>
              <option value="state-asc">State (A-Z)</option>
            </select>
          </div>

          {/* Reset Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setListSearchQuery('');
                setFilterCountry('');
                setFilterState('');
                setFilterTag('');
                setFilterCategory('');
                setFilterDateAdded('');
                setFilterVisited('');
                setSortBy('date-desc');
              }}
              style={{ padding: '4px 12px', fontSize: '0.75rem', width: 'auto', height: '28px', display: 'flex', alignItems: 'center' }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Row 2: Search */}
        <div style={{ width: '100%' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search locations by name/notes..."
            value={listSearchQuery}
            onChange={(e) => setListSearchQuery(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '6px 12px', height: '34px' }}
          />
        </div>
      </div>

      {/* Empty State */}
      {locations.length === 0 && !showAddForm && (
        <div className="empty-state" style={{ marginBottom: '20px' }}>
          <MapPin size={48} className="empty-state-icon" />
          <h3>No Locations Yet</h3>
          <p>Start tracking your travel map by adding your first location or country.</p>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            Add Location
          </button>
        </div>
      )}



      {/* Grid of Locations */}
      <div className="grid">
        {(() => {
          const processedLocations = locations.filter(loc => {
            // Filter by folder scope
            if (!listSearchQuery.trim()) {
              const parentId = loc.parent_id;
              const hasParent = parentId && parentId !== 'null' && parentId !== 'undefined';
              if (currentFolderId === null) {
                if (hasParent) return false;
              } else {
                if (parentId !== currentFolderId) return false;
              }
            }
            // Search query
            if (listSearchQuery.trim()) {
              const q = listSearchQuery.toLowerCase();
              const nameMatch = loc.name?.toLowerCase().includes(q);
              const notesMatch = loc.notes?.toLowerCase().includes(q);
              const placeMatch = places
                .filter(p => p.location_id === loc.id)
                .some(p => p.name?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
              if (!nameMatch && !notesMatch && !placeMatch) return false;
            }
            // Country
            if (filterCountry && loc.country !== filterCountry) return false;
            // Source Website
            if (filterSource) {
              if (!loc.source_urls) return false;
              try {
                const urls = JSON.parse(loc.source_urls);
                if (!Array.isArray(urls)) return false;
                const hasMatch = urls.some(u => {
                  try {
                    return new URL(u).hostname.replace('www.', '').toLowerCase() === filterSource.toLowerCase();
                  } catch (_) {
                    return false;
                  }
                });
                if (!hasMatch) return false;
              } catch (_) {
                return false;
              }
            }
            // State
            if (filterState && loc.state !== filterState) return false;
            // Tag
            if (filterTag) {
              const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
              if (!locTagIds.includes(filterTag)) return false;
            }
            // Category
            if (filterCategory) {
              const locPlaces = places.filter(p => p.location_id === loc.id);
              const hasCategory = locPlaces.some(p => p.category === filterCategory);
              if (!hasCategory) return false;
            }
            // Date Added
            if (filterDateAdded) {
              if (!loc.created_at) return false;
              const createdDate = new Date(loc.created_at);
              const now = new Date();
              if (filterDateAdded === 'today') {
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (createdDate < today) return false;
              } else if (filterDateAdded === 'week') {
                const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                if (createdDate < oneWeekAgo) return false;
              } else if (filterDateAdded === 'month') {
                const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                if (createdDate < oneMonthAgo) return false;
              } else if (filterDateAdded === 'year') {
                const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                if (createdDate < oneYearAgo) return false;
              }
            }
            // Visited status filter
            if (filterVisited) {
              const isVisited = loc.visited === 1;
              if (filterVisited === 'visited' && !isVisited) return false;
              if (filterVisited === 'not-visited' && isVisited) return false;
            }
            return true;
          }).sort((a, b) => {
            const parseDate = (str) => {
              if (!str) return new Date(0);
              if (typeof str === 'string' && !str.includes('T') && str.includes(' ')) {
                return new Date(str.replace(' ', 'T'));
              }
              return new Date(str);
            };
            if (sortBy === 'date-desc') {
              const dA = parseDate(a.created_at);
              const dB = parseDate(b.created_at);
              return dB - dA;
            }
            if (sortBy === 'date-asc') {
              const dA = parseDate(a.created_at);
              const dB = parseDate(b.created_at);
              return dA - dB;
            }
            if (sortBy === 'name-asc') {
              return (a.name || '').localeCompare(b.name || '');
            }
            if (sortBy === 'name-desc') {
              return (b.name || '').localeCompare(a.name || '');
            }
            if (sortBy === 'country-asc') {
              return (a.country || '').localeCompare(b.country || '');
            }
            if (sortBy === 'state-asc') {
              return (a.state || '').localeCompare(b.state || '');
            }
            return 0;
          });

          return processedLocations.map(loc => {
          const featuredImg = getFeaturedPhoto(loc.id);
          const locTags = getEntityTagsList(loc.id);

          return (
            <div 
              key={loc.id} 
              className="card" 
              onClick={() => loc.is_folder === 1 ? setCurrentFolderId(loc.id) : setSelectedLocation(loc)}
              draggable={loc.is_folder !== 1}
              onDragStart={(e) => handleDragStart(e, loc.id)}
              onDragOver={(e) => handleDragOver(e, loc)}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(e) => handleDrop(e, loc)}
              style={{
                border: dragOverFolderId === loc.id 
                  ? '2px dashed var(--accent-primary)' 
                  : (loc.is_folder === 1 
                      ? '1px dashed var(--accent-secondary)' 
                      : '1px solid var(--border-glass)'),
                boxShadow: loc.is_folder === 1 ? 'var(--shadow-glow)' : 'var(--shadow-panel)'
              }}
            >
              <div className="card-media">
                {loc.is_folder === 1 ? (
                  <FolderCover folderId={loc.id} locations={locations} getFeaturedPhoto={getFeaturedPhoto} />
                ) : (
                  <img 
                    src={featuredImg} 
                    onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'} 
                    alt={loc.name} 
                  />
                )}
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
                  {loc.is_folder === 1 && (
                    <div className="card-badge folder" style={{ position: 'static', background: 'var(--accent-secondary)' }}>
                      📂 Folder
                    </div>
                  )}
                  <div className={`card-badge ${loc.visited === 1 ? 'visited' : ''}`} style={{ position: 'static' }}>
                    {loc.visited === 1 ? 'Visited' : 'Not Visited'}
                  </div>
                </div>
              </div>
              <div className="card-content">
                <h3>{loc.name}</h3>
                {loc.notes && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flexGrow: 1, marginBottom: '4px' }}>{loc.notes.substring(0, 100)}...</p>}
                
                {/* Source URLs Links */}
                {(() => {
                  if (!loc.source_urls) return null;
                  try {
                    const urls = JSON.parse(loc.source_urls);
                    if (!Array.isArray(urls) || urls.length === 0) return null;
                    return (
                      <div className="location-sources" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }} onClick={(e) => e.stopPropagation()}>
                        {urls.map((u, idx) => {
                          let display = 'Source';
                          try { display = new URL(u).hostname.replace('www.', ''); } catch (_) {}
                          return (
                            <a 
                              key={idx} 
                              href={u} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              style={{ 
                                fontSize: '0.7rem', 
                                background: 'rgba(255,255,255,0.06)', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                border: '1px solid var(--border-glass)',
                                color: 'var(--accent-primary)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              🔗 {display}
                            </a>
                          );
                        })}
                      </div>
                    );
                  } catch (_) {
                    return null;
                  }
                })()}

                <div className="card-tags">
                  {locTags.map(t => (
                    <span key={t.id} className="tag-badge" style={{ backgroundColor: t.color, color: '#000' }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })})()}
      </div>
    </div>
  );
}
