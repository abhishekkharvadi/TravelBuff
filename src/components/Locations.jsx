import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  MapPin, Plus, Check, Square, Star, Image as ImageIcon, Trash2, Archive, 
  Search, X, Edit, Edit2, Eye, Navigation, PlusCircle, Compass, RefreshCw,
  Folder, FolderPlus, FolderInput, Layers, CheckSquare, Filter
} from 'lucide-react';
import { db, queueSyncAction, generateUUID, populateLocalDb } from '../clientDb.js';
import { trackApiCall } from '../utils/apiTracker.js';
import { loadGoogleMaps } from '../utils/googleMapsLoader.js';
import MapView from './MapView.jsx';
import MoveToFolderModal from './MoveToFolderModal.jsx';
import ImmichLocationImportModal from './ImmichLocationImportModal.jsx';

function FolderCover({ folderId, locations, getFeaturedPhoto }) {
  const getAllChildLocationIds = (fId) => {
    let ids = [];
    const children = locations.filter(l => {
      const pId = l.parent_id;
      return pId && (String(pId) === String(fId));
    });
    for (const child of children) {
      ids.push(child.id);
      if (child.is_folder === 1 || child.is_folder === '1' || child.is_folder === true) {
        ids = ids.concat(getAllChildLocationIds(child.id));
      }
    }
    return ids;
  };

  const selfImg = getFeaturedPhoto(folderId);
  const isRealSelfImg = selfImg && selfImg !== 'null' && selfImg !== 'undefined' && !selfImg.includes('placeholder') && !selfImg.includes('unsplash.com');

  const allLocIds = getAllChildLocationIds(folderId);
  const childImages = allLocIds
    .map(id => getFeaturedPhoto(id))
    .filter(img => img && img !== 'null' && img !== 'undefined' && !img.includes('placeholder') && !img.includes('unsplash.com'));

  // Combine the folder's own cover image and all sub-location images
  const images = [
    ...(isRealSelfImg ? [selfImg] : []),
    ...childImages
  ];

  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [images.length]);

  const activeImg = images[index] || (isRealSelfImg ? selfImg : (childImages[0] || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'));

  return (
    <img 
      src={activeImg} 
      onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }} 
      alt="Folder Cover" 
    />
  );
}

export default function Locations({ token, selectedLocation: selectedLocationProp, setSelectedLocation, currentFolderId, setCurrentFolderId, returnToCollectionId, onReturnToCollection, onNavigate }) {
  // Dexie Queries (Reactive Live Updates)
  const allLocationsRaw = useLiveQuery(() => db.locations.toArray()) || [];
  const locations = useMemo(() => allLocationsRaw.filter(l => Number(l.is_archived) !== 1), [allLocationsRaw]);
  const archivedLocationsCount = useMemo(() => allLocationsRaw.filter(l => Number(l.is_archived) === 1).length, [allLocationsRaw]);
  
  const selectedLocation = typeof selectedLocationProp === 'object' && selectedLocationProp !== null 
    ? selectedLocationProp 
    : locations.find(l => String(l.id) === String(selectedLocationProp)) || null;
  const allPlacesRaw = useLiveQuery(() => db.places.toArray()) || [];
  const places = useMemo(() => allPlacesRaw.filter(p => Number(p.is_archived) !== 1), [allPlacesRaw]);
  const archivedPlacesCount = useMemo(() => allPlacesRaw.filter(p => Number(p.is_archived) === 1).length, [allPlacesRaw]);
  const totalArchivedCount = archivedLocationsCount + archivedPlacesCount;
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const entityTags = useLiveQuery(() => db.entity_tags.toArray()) || [];
  const photos = useLiveQuery(() => db.entity_photos.toArray()) || [];
  const customCategories = useLiveQuery(() => db.custom_categories.where('type').equals('place').toArray()) || [];
  const defaultCategories = [
    { id: 'default-hotel', name: 'hotel', icon: '🏨', type: 'place' },
    { id: 'default-stay', name: 'stay', icon: '🏠', type: 'place' },
    { id: 'default-resort', name: 'resort', icon: '🌴', type: 'place' }
  ];
  const allCategories = [
    ...defaultCategories,
    ...customCategories.filter(c => !defaultCategories.some(d => d.name.toLowerCase() === c.name.toLowerCase()))
  ];


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
  const [newLocParentFolderId, setNewLocParentFolderId] = useState(currentFolderId || '');

  // List Filter/Sort State
  const [showFilters, setShowFilters] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateAdded, setFilterDateAdded] = useState('');
  const [filterVisited, setFilterVisited] = useState(''); // '', 'visited', 'not-visited'
  const [filterSource, setFilterSource] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  // Multi-select & Move to Folder Modal State (v6)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedLocIds, setSelectedLocIds] = useState([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [locationsToMove, setLocationsToMove] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [isFolderLocked, setIsFolderLocked] = useState(false);
  const [pendingMoveLocations, setPendingMoveLocations] = useState([]);

  // Reset window scroll position when opening a location or entering/exiting folders
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [selectedLocation?.id, currentFolderId]);

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
  const [editPlaceName, setEditPlaceName] = useState('');
  const [editPlaceLat, setEditPlaceLat] = useState('');
  const [editPlaceLon, setEditPlaceLon] = useState('');
  const [editPlaceCategory, setEditPlaceCategory] = useState('');
  const [editPlaceNotes, setEditPlaceNotes] = useState('');

  useEffect(() => {
    if (selectedPlaceId) {
      const p = places.find(item => item.id === selectedPlaceId);
      if (p) {
        setEditPlaceName(p.name || '');
        setEditPlaceLat(p.latitude !== undefined && p.latitude !== null ? String(p.latitude) : '');
        setEditPlaceLon(p.longitude !== undefined && p.longitude !== null ? String(p.longitude) : '');
        setEditPlaceCategory(p.category || '');
        setEditPlaceNotes(p.notes || '');
      }
    } else {
      setEditPlaceName('');
      setEditPlaceLat('');
      setEditPlaceLon('');
      setEditPlaceCategory('');
      setEditPlaceNotes('');
    }
  }, [selectedPlaceId]);

  // Reset Add Place form and search query when selectedLocation changes
  useEffect(() => {
    setShowAddPlaceForm(false);
    setPlaceSearchQuery('');
    setPlaceSearchResults([]);
    setPlaceName('');
    setPlaceLat('');
    setPlaceLon('');
    setPlaceNotes('');
  }, [selectedLocation?.id]);

  // Visit History details for active location
  const [visitsHistory, setVisitsHistory] = useState([]);

  // Immich States
  const [immichUrl, setImmichUrl] = useState('');
  const [immichKey, setImmichKey] = useState('');
  const [immichAltUrl, setImmichAltUrl] = useState('');
  const [isImmichConfigured, setIsImmichConfigured] = useState(false);
  const [showImmichImportModal, setShowImmichImportModal] = useState(false);
  const [hasImportedImmich, setHasImportedImmich] = useState(localStorage.getItem('immich_locations_imported') === 'true');
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
  const [fetchingPhotoEntityIds, setFetchingPhotoEntityIds] = useState({});

  // Tag creation modal states inside locations
  const [selectedTagToAdd, setSelectedTagToAdd] = useState('');

  const logErrorToBackend = (errorMsg, context) => {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorMsg, context })
    }).catch(e => console.error('Failed to log error to backend:', e));
  };

  // Debounced Google Places / Nominatim Search
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      const apiKey = localStorage.getItem('google_maps_api_key');
      const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

      const fallbackToNominatim = () => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`)
          .then(res => res.json())
          .then(data => {
            setSearchResults(Array.isArray(data) ? data : []);
            setIsSearching(false);
          })
          .catch(err => {
            console.error('Nominatim API error:', err);
            setIsSearching(false);
            setSearchResults([]);
          });
      };

      if (apiKey && googleMapsEnabled) {
        loadGoogleMaps().then(async (google) => {
          trackApiCall('Google Maps Places');
          try {
            const { AutocompleteSuggestion } = await google.maps.importLibrary("places");
            const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query });
            setIsSearching(false);
            if (suggestions && suggestions.length > 0) {
              const mapped = suggestions.map(s => ({
                display_name: s.placePrediction.text.toString(),
                place_id: s.placePrediction.placeId,
                is_gmaps: true
              }));
              setSearchResults(mapped);
            } else {
              fallbackToNominatim();
            }
          } catch (e) {
            try {
              const service = new google.maps.places.AutocompleteService();
              service.getPlacePredictions({ input: query }, (predictions, status) => {
                setIsSearching(false);
                if (status === 'OK' && predictions && predictions.length > 0) {
                  const mapped = predictions.map(p => ({
                    display_name: p.description,
                    place_id: p.place_id,
                    is_gmaps: true
                  }));
                  setSearchResults(mapped);
                } else {
                  fallbackToNominatim();
                }
              });
            } catch (legacyErr) {
              fallbackToNominatim();
            }
          }
        }).catch(() => {
          fallbackToNominatim();
        });
      } else {
        fallbackToNominatim();
      }
    }, 350);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Debounced Google Places / Nominatim Search for Places
  useEffect(() => {
    const query = placeSearchQuery.trim();
    if (query.length < 2) {
      setPlaceSearchResults([]);
      setIsSearchingPlace(false);
      return;
    }

    setIsSearchingPlace(true);
    const delayDebounceFn = setTimeout(() => {
      const apiKey = localStorage.getItem('google_maps_api_key');
      const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

      const fallbackToNominatim = () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`;
        fetch(url)
          .then(res => res.json())
          .then(data => {
            setPlaceSearchResults(Array.isArray(data) ? data : []);
            setIsSearchingPlace(false);
          })
          .catch(err => {
            console.error('Nominatim Place API error:', err);
            setIsSearchingPlace(false);
            setPlaceSearchResults([]);
          });
      };

      if (apiKey && googleMapsEnabled) {
        loadGoogleMaps().then(async (google) => {
          trackApiCall('Google Maps Places');
          try {
            const { AutocompleteSuggestion } = await google.maps.importLibrary("places");
            const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query });
            setIsSearchingPlace(false);
            if (suggestions && suggestions.length > 0) {
              const mapped = suggestions.map(s => ({
                display_name: s.placePrediction.text.toString(),
                place_name: s.placePrediction.mainText ? s.placePrediction.mainText.toString() : s.placePrediction.text.toString().split(',')[0],
                place_id: s.placePrediction.placeId,
                is_gmaps: true,
                types: s.placePrediction.types || []
              }));
              setPlaceSearchResults(mapped);
            } else {
              fallbackToNominatim();
            }
          } catch (e) {
            try {
              const service = new google.maps.places.AutocompleteService();
              service.getPlacePredictions({ input: query }, (predictions, status) => {
                setIsSearchingPlace(false);
                if (status === 'OK' && predictions && predictions.length > 0) {
                  const mapped = predictions.map(p => ({
                    display_name: p.description,
                    place_name: p.structured_formatting && p.structured_formatting.main_text ? p.structured_formatting.main_text : p.description.split(',')[0],
                    place_id: p.place_id,
                    is_gmaps: true,
                    types: p.types || []
                  }));
                  setPlaceSearchResults(mapped);
                } else {
                  fallbackToNominatim();
                }
              });
            } catch (legacyErr) {
              fallbackToNominatim();
            }
          }
        }).catch(() => {
          fallbackToNominatim();
        });
      } else {
        fallbackToNominatim();
      }
    }, 350);

    return () => clearTimeout(delayDebounceFn);
  }, [placeSearchQuery, selectedLocation]);

  // Select Place Search result
  const handleSelectPlaceSearchResult = async (result) => {
    if (result.is_gmaps) {
      setIsSearchingPlace(true);
      try {
        trackApiCall('Google Maps Geocoding');
        const google = await loadGoogleMaps();
        const { Geocoder } = await google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();
        geocoder.geocode({ placeId: result.place_id }, (results, status) => {
          setIsSearchingPlace(false);
          if (status === 'OK' && results[0]) {
            const r = results[0];
            const lat = r.geometry.location.lat();
            const lon = r.geometry.location.lng();
            
            const types = result.types || [];
            if (types.includes('cafe')) setPlaceCategory('cafe');
            else if (types.includes('restaurant') || types.includes('food') || types.includes('bar')) setPlaceCategory('restaurant');
            else if (types.includes('hindu_temple') || types.includes('church') || types.includes('place_of_worship')) setPlaceCategory('temple');
            else if (types.includes('museum') || types.includes('art_gallery')) setPlaceCategory('museum');
            else if (types.includes('natural_feature') || types.includes('park')) setPlaceCategory('waterfall');
            else if (types.includes('campground')) setPlaceCategory('mountain');
            else if (types.includes('lodging') || types.includes('hotel')) setPlaceCategory('hotel');
            else if (types.includes('airport')) setPlaceCategory('airport');
            else if (types.includes('transit_station') || types.includes('subway_station') || types.includes('train_station')) setPlaceCategory('station');
            else setPlaceCategory('cafe');

            setPlaceName(result.place_name || r.formatted_address.split(',')[0]);
            setPlaceLat(lat);
            setPlaceLon(lon);
            setPlaceSearchResults([]);
            setPlaceSearchQuery('');
          }
        });
      } catch (err) {
        console.error('Gmaps geocode failed for place selection:', err);
        setIsSearchingPlace(false);
      }
      return;
    }

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

  // Auto-geocode places under selected location missing coordinates
  useEffect(() => {
    if (!selectedLocation) return;
    const unlocatedPlaces = places.filter(p => 
      String(p.location_id) === String(selectedLocation.id) &&
      (p.latitude === null || p.latitude === undefined || isNaN(parseFloat(p.latitude))) &&
      p.geocode_status !== 'failed'
    );

    if (unlocatedPlaces.length === 0) return;

    unlocatedPlaces.forEach(place => {
      const query = `${place.name} ${selectedLocation.name}`.trim();
      fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(async (data) => {
          if (data && data.length > 0 && data[0].lat && data[0].lon) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            const updatedPlace = { ...place, latitude: lat, longitude: lon, geocode_status: 'completed' };
            await db.places.update(place.id, { latitude: lat, longitude: lon, geocode_status: 'completed' });
            await queueSyncAction('places', 'update', updatedPlace);
          } else {
            await db.places.update(place.id, { geocode_status: 'failed' });
          }
        })
        .catch(async () => {
          await db.places.update(place.id, { geocode_status: 'failed' });
        });
    });
  }, [selectedLocation, places]);

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
      showToast(`Moved "${draggedLoc.name}" to "${targetFolder.name}"`);
    }
  };

  // Toast Notification Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Modal Open / Close Helpers (Mutual Exclusivity)
  const openMoveModal = (locs) => {
    setFolderToDelete(null);
    setShowAddForm(false);
    setLocationsToMove(locs || []);
    setIsMoveModalOpen(true);
  };

  const closeMoveModal = () => {
    setIsMoveModalOpen(false);
    setLocationsToMove([]);
  };

  const openDeleteFolderModal = (folderLoc) => {
    setIsMoveModalOpen(false);
    setShowAddForm(false);
    setFolderToDelete(folderLoc);
  };

  const closeDeleteFolderModal = () => {
    setFolderToDelete(null);
  };

  const openAddLocationModal = () => {
    setIsMoveModalOpen(false);
    setFolderToDelete(null);
    setIsFolderChecked(false);
    setIsFolderLocked(false);
    setNewLocParentFolderId(currentFolderId || '');
    setPendingMoveLocations([]);
    setLocName('');
    setLocState('');
    setLocCountry('');
    setLocLat('');
    setLocLon('');
    setLocNotes('');
    setSearchQuery('');
    setSearchResults([]);
    setShowAddForm(true);
  };

  const openAddFolderModal = (locsToMove = []) => {
    setIsMoveModalOpen(false);
    setFolderToDelete(null);
    setIsFolderChecked(true);
    setIsFolderLocked(true);
    setNewLocParentFolderId(currentFolderId || '');
    setPendingMoveLocations(locsToMove || []);
    setLocName('');
    setLocState('');
    setLocCountry('');
    setLocLat('');
    setLocLon('');
    setLocNotes('');
    setSearchQuery('');
    setSearchResults([]);
    setShowAddForm(true);
  };

  const closeAddModal = () => {
    setShowAddForm(false);
    setIsFolderLocked(false);
    setNewLocParentFolderId(currentFolderId || '');
    setPendingMoveLocations([]);
    setLocName('');
    setLocState('');
    setLocCountry('');
    setLocLat('');
    setLocLon('');
    setLocNotes('');
    setSearchQuery('');
    setSearchResults([]);
  };

  // Move Locations to Target Folder (Option A, B, C)
  const handleMoveLocations = async (targetFolderId, overrideLocs = null) => {
    const locs = overrideLocs || locationsToMove;
    if (!locs || locs.length === 0) return;
    const targetFolder = locations.find(l => l.id === targetFolderId);
    const targetName = targetFolder ? targetFolder.name : 'Top Level / Root';

    for (const loc of locs) {
      const updated = { ...loc, parent_id: targetFolderId };
      await db.locations.update(loc.id, { parent_id: targetFolderId });
      await queueSyncAction('locations', 'update', updated);
    }

    if (selectedLocation && locs.some(l => l.id === selectedLocation.id)) {
      setSelectedLocation(prev => prev ? { ...prev, parent_id: targetFolderId } : prev);
    }

    const count = locs.length;
    setSelectedLocIds([]);
    setLocationsToMove([]);
    setPendingMoveLocations([]);
    setIsSelectMode(false);
    setIsMoveModalOpen(false);
    showToast(count === 1 ? `Moved "${locs[0].name}" to ${targetName}` : `Moved ${count} locations to ${targetName}`);
  };

  // Toggle Single Location in Selection Mode
  const handleToggleSelectLocation = (id) => {
    setSelectedLocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Bulk Archive Selected Locations/Folders
  const handleBulkArchive = async () => {
    if (selectedLocIds.length === 0) return;
    const count = selectedLocIds.length;
    const confirmMsg = `Are you sure you want to archive ${count} selected item(s)? They will be moved to Archived Items and hidden from active views.`;

    if (window.confirm(confirmMsg)) {
      try {
        const activeToken = token || localStorage.getItem('tb_token');
        const res = await fetch('/api/locations/bulk-archive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
          },
          body: JSON.stringify({ ids: selectedLocIds })
        });
        if (res.ok) {
          if (activeToken) await populateLocalDb(activeToken);
          if (selectedLocation && selectedLocIds.includes(selectedLocation.id)) {
            setSelectedLocation(null);
          }
          setSelectedLocIds([]);
          setIsSelectMode(false);
          showToast(`Successfully archived ${count} item(s). View in Archived Items.`);
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(`Failed to archive: ${errData.error || res.statusText}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to archive: ${err.message}`, 'error');
      }
    }
  };

  // Memoized featured photo map for O(1) lookups to avoid main page flickering/lag
  const featuredPhotoMap = React.useMemo(() => {
    const map = {};
    
    // Group photos by entity
    const photoGroups = {};
    photos.forEach(p => {
      if (!photoGroups[p.entity_id]) photoGroups[p.entity_id] = [];
      photoGroups[p.entity_id].push(p);
    });

    // 1. Highest priority: Check entity_photos for explicitly starred photo (is_featured === 1)
    Object.keys(photoGroups).forEach(entId => {
      const pList = photoGroups[entId];
      const featured = pList.find(p => p.is_featured === 1);
      if (featured && featured.file_path) {
        map[entId] = featured.file_path;
      }
    });

    // 2. Pre-populate with locations local_file_data if not set by starred photo
    locations.forEach(loc => {
      if (!map[loc.id] && loc.local_file_data) map[loc.id] = loc.local_file_data;
    });

    // 3. Pre-populate with places local_file_data if not set by starred photo
    places.forEach(place => {
      if (!map[place.id] && place.local_file_data) map[place.id] = place.local_file_data;
    });

    // 4. First photo in entity_photos if entity still has no cover
    Object.keys(photoGroups).forEach(entId => {
      if (map[entId]) return;
      const pList = photoGroups[entId];
      if (pList[0] && pList[0].file_path) map[entId] = pList[0].file_path;
    });

    // 5. Fallback: If a location has no photo, check if any of its sub-places has a photo!
    locations.forEach(loc => {
      if (!map[loc.id]) {
        const childPlace = places.find(p => p.location_id === loc.id && map[p.id]);
        if (childPlace) {
          map[loc.id] = map[childPlace.id];
        }
      }
    });

    return map;
  }, [locations, places, photos]);

  // Helper: Get featured image or fallback placeholder
  const getFeaturedPhoto = React.useCallback((entityId) => {
    let url = featuredPhotoMap[entityId];
    if (!url) return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600';
    if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('/')) {
      url = '/' + url;
    }
    return url;
  }, [featuredPhotoMap]);

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

  // Helper: Get ancestor folder names for a parent_id
  const getAncestorFolderNames = React.useCallback((parentId) => {
    if (!parentId || parentId === 'null' || parentId === 'undefined') return [];
    const names = [];
    let currentId = parentId;
    let depth = 0;
    while (currentId && depth < 20) {
      const parent = locations.find(l => String(l.id) === String(currentId));
      if (parent) {
        names.unshift(parent.name);
        const pId = parent.parent_id;
        if (pId && pId !== 'null' && pId !== 'undefined') {
          currentId = pId;
        } else {
          currentId = null;
        }
      } else {
        break;
      }
      depth++;
    }
    return names;
  }, [locations]);

  // Helper: Get all available folders with full breadcrumb path
  const allAvailableFolders = React.useMemo(() => {
    return locations
      .filter(l => l.is_folder === 1)
      .map(folder => {
        const ancestors = getAncestorFolderNames(folder.parent_id);
        const fullPath = [...ancestors, folder.name].join(' > ');
        return {
          id: folder.id,
          name: folder.name,
          fullPath
        };
      })
      .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }, [locations, getAncestorFolderNames]);

  // Helper: Get all child location IDs for a folder recursively
  const getAllChildLocationIds = React.useCallback((fId) => {
    let ids = [];
    const children = locations.filter(l => l.parent_id && (String(l.parent_id) === String(fId)));
    for (const child of children) {
      ids.push(child.id);
      if (child.is_folder === 1) {
        ids = ids.concat(getAllChildLocationIds(child.id));
      }
    }
    return ids;
  }, [locations]);

  // Helper: Calculate dynamic visited status of a folder (recursively scanning contents)
  const getFolderVisitedStatus = (folderId) => {
    const getAllChildLocations = (fId) => {
      let childs = [];
      const directChildren = locations.filter(l => String(l.parent_id) === String(fId));
      for (const child of directChildren) {
        childs.push(child);
        if (child.is_folder === 1) {
          childs = childs.concat(getAllChildLocations(child.id));
        }
      }
      return childs;
    };

    const allChildLocs = getAllChildLocations(folderId);
    const folderAndChildLocIds = [folderId, ...allChildLocs.map(l => l.id)];
    const childPlaces = places.filter(p => folderAndChildLocIds.includes(p.location_id));
    const leafLocations = allChildLocs.filter(l => l.is_folder !== 1);

    const totalItems = leafLocations.length + childPlaces.length;
    if (totalItems === 0) return 'not_visited';

    const visitedLocationsCount = leafLocations.filter(l => l.visited === 1).length;
    const visitedPlacesCount = childPlaces.filter(p => p.visited === 1).length;
    const totalVisited = visitedLocationsCount + visitedPlacesCount;

    if (totalVisited === totalItems) {
      return 'visited';
    } else if (totalVisited > 0) {
      return 'partial';
    } else {
      return 'not_visited';
    }
  };

  // Memoized tag lookup map for O(1) rendering efficiency
  const entityTagsMap = React.useMemo(() => {
    const map = {};
    entityTags.forEach(et => {
      if (!map[et.entity_id]) map[et.entity_id] = [];
      const tag = tags.find(t => t.id === et.tag_id);
      if (tag) map[et.entity_id].push(tag);
    });
    return map;
  }, [entityTags, tags]);

  // Helper: Get tags for an entity
  const getEntityTagsList = React.useCallback((entityId) => {
    return entityTagsMap[entityId] || [];
  }, [entityTagsMap]);

  // Helper: Find duplicate location or folder anywhere across the database
  const findExistingDuplicate = React.useCallback((name, country = '', state = '', lat = null, lon = null) => {
    if (!name || !name.trim() || !locations || locations.length === 0) return null;
    
    const normalize = (s) => (s || '').toLowerCase().replace(/[,.-]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanCountry = (country || '').trim().toLowerCase();
    const cleanState = (state || '').trim().toLowerCase();
    const normTarget = normalize(name);
    if (!normTarget) return null;

    let combinedTarget = normTarget;
    if (cleanCountry && !normTarget.includes(normalize(cleanCountry))) {
      combinedTarget = `${normTarget} ${normalize(cleanCountry)}`;
    }

    const latNum = lat !== null && lat !== '' && !isNaN(parseFloat(lat)) ? parseFloat(lat) : null;
    const lonNum = lon !== null && lon !== '' && !isNaN(parseFloat(lon)) ? parseFloat(lon) : null;

    for (const loc of locations) {
      const locNorm = normalize(loc.name);
      const locCountry = normalize(loc.country);
      const locState = normalize(loc.state);
      
      let locCombined = locNorm;
      if (locCountry && !locNorm.includes(locCountry)) {
        locCombined = `${locNorm} ${locCountry}`;
      }

      // Check 1: Exact / Normalized Name Match
      if (locNorm === normTarget) {
        return {
          duplicate: loc,
          reason: 'name',
          path: getAncestorFolderNames(loc.parent_id).join(' > ') || 'Root'
        };
      }

      // Check 2: Combined Name + Country Match
      if (locCombined === combinedTarget || (locNorm === combinedTarget) || (combinedTarget === locNorm)) {
        return {
          duplicate: loc,
          reason: 'name_country',
          path: getAncestorFolderNames(loc.parent_id).join(' > ') || 'Root'
        };
      }

      // Check 3: State + Country match if names are close substrings
      if (cleanCountry && locCountry && cleanCountry === locCountry) {
        if (cleanState && locState && cleanState === locState && (locNorm.includes(normTarget) || normTarget.includes(locNorm))) {
          return {
            duplicate: loc,
            reason: 'state_country',
            path: getAncestorFolderNames(loc.parent_id).join(' > ') || 'Root'
          };
        }
      }

      // Check 4: GPS proximity match (within ~150 meters, ~0.0015 deg)
      if (latNum !== null && lonNum !== null && loc.latitude !== null && loc.longitude !== null) {
        const dLat = Math.abs(loc.latitude - latNum);
        const dLon = Math.abs(loc.longitude - lonNum);
        if (dLat < 0.0015 && dLon < 0.0015) {
          return {
            duplicate: loc,
            reason: 'gps_proximity',
            path: getAncestorFolderNames(loc.parent_id).join(' > ') || 'Root'
          };
        }
      }
    }
    return null;
  }, [locations, getAncestorFolderNames]);

  const detectedDuplicate = React.useMemo(() => {
    if (!showAddForm || !locName.trim()) return null;
    return findExistingDuplicate(locName, locCountry, locState, locLat, locLon);
  }, [showAddForm, locName, locCountry, locState, locLat, locLon, findExistingDuplicate]);

  // Create new location
  const handleCreateLocation = async (e) => {
    if (e) e.preventDefault();
    if (!locName.trim() || isSavingLocation) return;

    if (detectedDuplicate) {
      const isDupFolder = detectedDuplicate.duplicate.is_folder === 1;
      const confirmAdd = window.confirm(
        `A ${isDupFolder ? 'folder' : 'location'} named "${detectedDuplicate.duplicate.name}" already exists in "${detectedDuplicate.path}".\n\nAre you sure you want to create this duplicate ${isFolderChecked ? 'folder' : 'location'}?`
      );
      if (!confirmAdd) return;
    }

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
      parent_id: newLocParentFolderId || null,
      is_folder: isFolderChecked ? 1 : 0,
      photo_sync_status: 'pending',
      created_at: new Date().toISOString()
    };

    // Save to IndexedDB and queue sync instantly
    await queueSyncAction('locations', 'insert', newLoc);

    // Fire background photo fetching without holding up the UI
    trackApiCall('Wikipedia');
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
            const newPhotoObj = {
              id: generateUUID(),
              entity_id: newLocId,
              file_path: data.fileUrl,
              is_featured: 1,
              created_at: new Date().toISOString()
            };
            await db.entity_photos.add(newPhotoObj);
            await queueSyncAction('entity_photos', 'insert', newPhotoObj);
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

    // Auto-move pending locations into this newly created folder
    if (pendingMoveLocations && pendingMoveLocations.length > 0) {
      for (const pLoc of pendingMoveLocations) {
        const updated = { ...pLoc, parent_id: newLocId };
        await db.locations.update(pLoc.id, { parent_id: newLocId });
        await queueSyncAction('locations', 'update', updated);
      }
      if (selectedLocation && pendingMoveLocations.some(l => l.id === selectedLocation.id)) {
        setSelectedLocation(prev => prev ? { ...prev, parent_id: newLocId } : prev);
      }
      showToast(pendingMoveLocations.length === 1 ? `Moved "${pendingMoveLocations[0].name}" to "${finalName}"` : `Moved ${pendingMoveLocations.length} locations to "${finalName}"`);
      setPendingMoveLocations([]);
      setSelectedLocIds([]);
      setIsSelectMode(false);
    }

    // Reset Form
    setLocName('');
    setLocState('');
    setLocCountry('');
    setLocLat('');
    setLocLon('');
    setLocNotes('');
    setSearchQuery('');
    setSearchResults([]);
    setIsFolderChecked(false);
    setIsFolderLocked(false);
    setNewLocParentFolderId(currentFolderId || '');
    setShowAddForm(false);
    setIsSavingLocation(false);
  };

  // Select Search result
  const handleSelectSearchResult = async (result) => {
    if (result.is_gmaps) {
      setIsSearching(true);
      try {
        trackApiCall('Google Maps Geocoding');
        const google = await loadGoogleMaps();
        const { Geocoder } = await google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();
        geocoder.geocode({ placeId: result.place_id }, (results, status) => {
          setIsSearching(false);
          if (status === 'OK' && results[0]) {
            const r = results[0];
            const lat = r.geometry.location.lat();
            const lon = r.geometry.location.lng();
            
            let state = '';
            let country = '';
            r.address_components.forEach(c => {
              if (c.types.includes('administrative_area_level_1')) state = c.long_name;
              if (c.types.includes('country')) country = c.long_name;
            });

            setLocName(r.formatted_address.split(',')[0]);
            setLocState(state || (r.formatted_address.split(',').length > 2 ? r.formatted_address.split(',')[r.formatted_address.split(',').length - 3].trim() : ''));
            setLocCountry(country || r.formatted_address.split(',')[r.formatted_address.split(',').length - 1].trim());
            setLocLat(lat);
            setLocLon(lon);
            setSearchResults([]);
            setSearchQuery('');
          }
        });
      } catch (err) {
        console.error('Gmaps geocode failed:', err);
        setIsSearching(false);
      }
      return;
    }

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

  // Archive Location / Folder
  const handleArchiveLocation = async (locId) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;

    const isFolder = loc.is_folder === 1;
    const confirmMsg = isFolder
      ? `Are you sure you want to archive the folder "${loc.name}"? It and all contents inside will be moved to Archived Items.`
      : `Are you sure you want to archive "${loc.name}"? It will be moved to Archived Items and hidden from active views.`;

    if (window.confirm(confirmMsg)) {
      try {
        const activeToken = token || localStorage.getItem('tb_token');
        const res = await fetch(`/api/locations/${locId}/archive`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
          }
        });
        if (res.ok) {
          if (activeToken) await populateLocalDb(activeToken);
          setSelectedLocation(null);
          showToast(`Archived ${isFolder ? 'folder ' : ''}"${loc.name}". View in Archived Items.`);
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(`Failed to archive: ${errData.error || res.statusText}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to archive: ${err.message}`, 'error');
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
  const handleCoordsPasteDirect = (e) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.includes(',')) {
      e.preventDefault();
      const parts = pastedText.split(',').map(part => part.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          setEditPlaceLat(String(lat));
          setEditPlaceLon(String(lon));
        }
      }
    }
  };

  // Add Place to Visit
  const handleAddPlace = async (e) => {
    e.preventDefault();
    const activeTarget = selectedLocation || (currentFolderId ? locations.find(l => l.id === currentFolderId) : null);
    if (!placeName.trim() || !activeTarget || isSavingPlace) return;

    setIsSavingPlace(true);

    const newPlaceId = generateUUID();
    const latitudeVal = placeLat ? parseFloat(placeLat) : null;
    const longitudeVal = placeLon ? parseFloat(placeLon) : null;
    const cleanPlaceQuery = placeName.trim();
    const locationCtx = activeTarget.name || '';

    const newPlace = {
      id: newPlaceId,
      location_id: activeTarget.id,
      name: placeName,
      category: placeCategory,
      latitude: latitudeVal,
      longitude: longitudeVal,
      visited: 0,
      notes: placeNotes,
      local_file_data: null,
      immich_album_id: null,
      photo_sync_status: 'pending',
      created_at: new Date().toISOString()
    };

    // Save to IndexedDB instantly
    await db.places.add(newPlace);
    await queueSyncAction('places', 'insert', newPlace);

    // Fire background photo fetching without holding up the UI
    trackApiCall('Wikipedia / Google Maps');
    fetch('/api/import/search-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        query: cleanPlaceQuery, 
        locationContext: locationCtx,
        latitude: latitudeVal, 
        longitude: longitudeVal,
        googleMapsApiKey: localStorage.getItem('google_maps_api_key')
      })
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
            const newPhotoObj = {
              id: generateUUID(),
              entity_id: newPlaceId,
              file_path: data.fileUrl,
              is_featured: 1,
              created_at: new Date().toISOString()
            };
            await db.entity_photos.add(newPhotoObj);
            await queueSyncAction('entity_photos', 'insert', newPhotoObj);
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
    setPlaceSearchQuery('');
    setPlaceSearchResults([]);
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

  const handleCreateAndAssignTag = async (entityId, tagNameVal) => {
    if (!tagNameVal.trim() || !entityId) return;
    const newTagId = generateUUID();
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newTag = {
      id: newTagId,
      name: tagNameVal.trim(),
      color: randomColor
    };
    try {
      await queueSyncAction('tags', 'insert', newTag);
      await queueSyncAction('entity_tags', 'insert', { entity_id: entityId, tag_id: newTagId });
    } catch (err) {
      console.error('Failed to create and assign tag:', err);
    }
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
    if (!photo || !photo.entity_id) return;

    // 1. Update IndexedDB and queue sync for entity_photos
    const list = photos.filter(p => p.entity_id === photo.entity_id);
    for (const p of list) {
      const isCurrent = p.id === photo.id;
      await db.entity_photos.update(p.id, { is_featured: isCurrent ? 1 : 0 });
      await queueSyncAction('entity_photos', 'update', { ...p, is_featured: isCurrent ? 1 : 0 });
    }

    // 2. Update shortcut local_file_data column on locations or places table
    const isLoc = locations.some(l => l.id === photo.entity_id);
    const table = isLoc ? 'locations' : 'places';
    const entity = isLoc ? locations.find(l => l.id === photo.entity_id) : places.find(p => p.id === photo.entity_id);

    if (entity) {
      await db[table].update(photo.entity_id, { local_file_data: photo.file_path });
      await queueSyncAction(table, 'update', { ...entity, local_file_data: photo.file_path });
    }
  };

  const handleDeletePhoto = async (photoId) => {
    const photoToDelete = photos.find(p => p.id === photoId);
    if (!photoToDelete) return;

    if (window.confirm('Delete this photo?')) {
      await queueSyncAction('entity_photos', 'delete', { id: photoId });

      // If the deleted photo was the featured cover photo, pick next photo or clear local_file_data
      const entityId = photoToDelete.entity_id;
      const remainingPhotos = photos.filter(p => p.entity_id === entityId && p.id !== photoId);
      const isLoc = locations.some(l => l.id === entityId);
      const table = isLoc ? 'locations' : 'places';
      const entity = isLoc ? locations.find(l => l.id === entityId) : places.find(p => p.id === entityId);

      if (entity && entity.local_file_data === photoToDelete.file_path) {
        const nextPhoto = remainingPhotos.find(p => p.is_featured === 1) || remainingPhotos[0];
        const newUrl = nextPhoto ? nextPhoto.file_path : null;
        await db[table].update(entityId, { local_file_data: newUrl });
        await queueSyncAction(table, 'update', { ...entity, local_file_data: newUrl });
      }
    }
  };

  const handleFetchPhotoForEntity = async (entity, isPlace = false) => {
    if (!entity || !entity.name) return;
    setFetchingPhotoEntityIds(prev => ({ ...prev, [entity.id]: true }));
    trackApiCall('Wikipedia / Google Maps');
    
    let searchQuery = entity.name;
    if (isPlace && selectedLocation && selectedLocation.name) {
      searchQuery = `${entity.name.trim()} ${selectedLocation.name.trim()}`.trim();
    }

    try {
      const res = await fetch('/api/import/search-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: searchQuery,
          latitude: entity.latitude,
          longitude: entity.longitude,
          googleMapsApiKey: localStorage.getItem('google_maps_api_key')
        })
      });
      if (res.ok) {
        const data = await res.json();
        const url = data.fileUrl || data.url;
        if (url) {
          const table = isPlace ? 'places' : 'locations';
          await db[table].update(entity.id, { local_file_data: url, photo_sync_status: 'completed' });
          await queueSyncAction(table, 'update', { ...entity, local_file_data: url });
          
          const newPhoto = {
            id: generateUUID(),
            entity_id: entity.id,
            file_path: url,
            is_featured: 1,
            created_at: new Date().toISOString()
          };

          await db.entity_photos.add(newPhoto);
          await queueSyncAction('entity_photos', 'insert', newPhoto);
        } else if (data.message) {
          console.log(`[Photo Fetch] ${data.message} for ${searchQuery}`);
        }
      }
    } catch (e) {
      console.error('Failed to fetch photo for entity:', e);
    } finally {
      setFetchingPhotoEntityIds(prev => ({ ...prev, [entity.id]: false }));
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
    if (!loc) return [];
    if (loc.is_folder === 1) {
      const childIds = getAllChildLocationIds(loc.id);
      const childLocs = locations.filter(l => childIds.includes(l.id));
      const allLocs = [loc, ...childLocs];
      return Array.from(new Set(allLocs.flatMap(l => getVisits(l).filter(v => !v.isManual).map(v => v.id))));
    }
    return getVisits(loc).filter(v => !v.isManual).map(v => v.id);
  };

  useEffect(() => {
    const activeTarget = selectedLocation || (currentFolderId ? locations.find(l => l.id === currentFolderId) : null);
    const albumIds = getLinkedAlbumIds(activeTarget);
    if (!isImmichConfigured || albumIds.length === 0) {
      setLinkedAlbumData(prev => (prev.length === 0 ? prev : []));
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
      const filtered = results.filter(Boolean);
      setLinkedAlbumData(prev => {
        if (prev.length === filtered.length && prev.every((item, i) => item.id === filtered[i]?.id)) {
          return prev;
        }
        return filtered;
      });
    });
  }, [selectedLocation?.id, selectedLocation?.immich_album_id, currentFolderId, locations, isImmichConfigured, token]);

  // Auto-backfill local_file_data from featuredPhotoMap for client Dexie cache
  useEffect(() => {
    if (!locations || locations.length === 0) return;
    locations.forEach(async (loc) => {
      if (loc.is_folder === 1) return;
      const featuredUrl = featuredPhotoMap[loc.id];
      if (!loc.local_file_data && featuredUrl && !featuredUrl.includes('unsplash.com')) {
        await db.locations.update(loc.id, { local_file_data: featuredUrl });
      }
    });
  }, [locations, photos]);

  const handleLinkAlbum = async (albumId, customTarget = null) => {
    const target = customTarget || selectedLocation || (currentFolderId ? locations.find(l => l.id === currentFolderId) : null);
    if (!target) return;
    const albumObj = allImmichAlbums.find(a => a.id === albumId);
    
    const newVisit = {
      id: albumId,
      isManual: false,
      startDate: albumObj?.startDate || null,
      endDate: albumObj?.endDate || null,
      albumLink: null,
      albumName: albumObj?.albumName || 'Immich Album'
    };

    const currentVisits = getVisits(target);
    if (currentVisits.some(v => v.id === albumId)) return;
    const updatedVisits = [...currentVisits, newVisit];
    
    const updatedLoc = { 
      ...target, 
      immich_album_id: JSON.stringify(updatedVisits),
      visited: 1, // Automatically mark location as visited
      created_at: new Date().toISOString()
    };
    
    await db.locations.update(target.id, { immich_album_id: JSON.stringify(updatedVisits), visited: 1 });
    await queueSyncAction('locations', 'update', updatedLoc);
    if (selectedLocation && selectedLocation.id === target.id) {
      setSelectedLocation(updatedLoc);
    }
    setAlbumSearch('');
    setShowAlbumDropdown(false);
  };

  const handleDeleteVisit = async (visitId, customTarget = null) => {
    const target = customTarget || selectedLocation || (currentFolderId ? locations.find(l => l.id === currentFolderId) : null);
    if (!target) return;
    
    const confirmDelete = window.confirm("Are you sure you want to delete this visit?");
    if (!confirmDelete) return;

    const currentVisits = getVisits(target);
    const updatedVisits = currentVisits.filter(v => v.id !== visitId);
    
    let newVisited = target.visited;
    if (updatedVisits.length === 0) {
      const confirmNotVisited = window.confirm("You have deleted all visits. Would you like to mark this as Not Visited?");
      if (confirmNotVisited) {
        newVisited = 0;
      }
    }

    const updatedLoc = {
      ...target,
      immich_album_id: updatedVisits.length ? JSON.stringify(updatedVisits) : null,
      visited: newVisited,
      created_at: new Date().toISOString()
    };

    await db.locations.update(target.id, { immich_album_id: updatedLoc.immich_album_id, visited: newVisited });
    await queueSyncAction('locations', 'update', updatedLoc);
    if (selectedLocation && selectedLocation.id === target.id) {
      setSelectedLocation(updatedLoc);
    }
  };

  const handleAddManualVisit = async (e, customTarget = null) => {
    if (e) e.preventDefault();
    const target = customTarget || selectedLocation || (currentFolderId ? locations.find(l => l.id === currentFolderId) : null);
    if (!target) return;

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

    const currentVisits = getVisits(target);
    const updatedVisits = [...currentVisits, newVisit];

    const updatedLoc = {
      ...target,
      immich_album_id: JSON.stringify(updatedVisits),
      visited: 1, // Automatically mark location as visited
      created_at: new Date().toISOString()
    };

    await db.locations.update(target.id, { immich_album_id: JSON.stringify(updatedVisits), visited: 1 });
    await queueSyncAction('locations', 'update', updatedLoc);
    if (selectedLocation && selectedLocation.id === target.id) {
      setSelectedLocation(updatedLoc);
    }

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

  const renderModals = () => (
    <>
      {/* Delete Folder Custom Dialog Modal */}
      {folderToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100,
          padding: '20px', backdropFilter: 'blur(6px)'
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
                  closeDeleteFolderModal();
                  setSelectedLocation(null);
                  showToast(`Deleted folder "${folderToDelete.name}" and all contents`);
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
                  closeDeleteFolderModal();
                  setSelectedLocation(null);
                  showToast(`Deleted folder "${folderToDelete.name}" (contents preserved)`);
                }}
                className="btn btn-secondary"
                style={{ fontWeight: '600' }}
              >
                Move to Locations
              </button>
              <button 
                onClick={closeDeleteFolderModal}
                className="btn"
                style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontWeight: '600' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Location / Add Folder Overlay Dialog */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '20px', backdropFilter: 'blur(6px)'
        }}>
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>{isFolderLocked ? 'Add New Folder' : 'Add New Location'}</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={closeAddModal} />
            </div>

            {/* Geocode Search */}
            <div className="form-group">
              <label>Search {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'} for Region</label>
              <div className="search-input-wrapper" style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px', paddingRight: searchQuery ? '32px' : '12px' }}
                  placeholder="e.g. Paris, Tokyo, Bali..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isSearching && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Searching {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'}...</p>}
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
              {detectedDuplicate && (
                <div style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
                  <div style={{ flexGrow: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    <strong style={{ color: '#eab308' }}>Potential Duplicate Detected:</strong>
                    <div style={{ marginTop: '2px', lineHeight: 1.4 }}>
                      A {detectedDuplicate.duplicate.is_folder === 1 ? 'folder' : 'location'} named <strong>"{detectedDuplicate.duplicate.name}"</strong> already exists in <strong>{detectedDuplicate.path}</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeAddModal();
                        if (detectedDuplicate.duplicate.is_folder === 1) {
                          setCurrentFolderId(detectedDuplicate.duplicate.id);
                        } else {
                          setSelectedLocation(detectedDuplicate.duplicate);
                        }
                      }}
                      style={{
                        marginTop: '6px',
                        background: 'rgba(234, 179, 8, 0.2)',
                        border: '1px solid rgba(234, 179, 8, 0.4)',
                        color: '#eab308',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      View Existing {detectedDuplicate.duplicate.is_folder === 1 ? 'Folder' : 'Location'} →
                    </button>
                  </div>
                </div>
              )}

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
                  disabled={isFolderLocked}
                  onChange={(e) => !isFolderLocked && setIsFolderChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: isFolderLocked ? 'not-allowed' : 'pointer' }}
                />
                <label htmlFor="createAsFolder" style={{ cursor: isFolderLocked ? 'default' : 'pointer', fontSize: '0.85rem', userSelect: 'none', margin: 0, color: isFolderLocked ? 'var(--accent-primary-hover)' : 'inherit' }}>
                  {isFolderLocked ? 'Folder (Required for grouping locations)' : 'Create as Folder (allows grouping other locations inside)'}
                </label>
              </div>

              <div className="form-group">
                <label>Folder (Optional)</label>
                <select
                  className="form-control"
                  value={newLocParentFolderId || ''}
                  onChange={(e) => setNewLocParentFolderId(e.target.value)}
                >
                  <option value="">None (Top Level / Root)</option>
                  {allAvailableFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      📁 {folder.fullPath}
                    </option>
                  ))}
                </select>
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
                <button type="button" className="btn btn-secondary" onClick={closeAddModal} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingLocation} style={{ flex: 1 }}>
                  {isSavingLocation ? 'Saving...' : (isFolderLocked ? 'Save Folder' : 'Save Location')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Move to Folder Modal */}
      <MoveToFolderModal
        isOpen={isMoveModalOpen}
        onClose={closeMoveModal}
        movingLocations={locationsToMove}
        locations={locations}
        onMove={handleMoveLocations}
        onOpenAddFolder={openAddFolderModal}
      />

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-surface-elevated, #18181b)',
          color: 'var(--text-primary, #ffffff)',
          border: '1px solid var(--accent-primary, #6366f1)',
          borderRadius: '8px',
          padding: '12px 18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.85rem',
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          animation: 'slideUpFade 0.25s ease'
        }}>
          <Check size={16} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );

  const activeLocationPlaces = places.filter(p => {
    if (!selectedLocation || !p.location_id) return false;
    return String(p.location_id).trim().toLowerCase() === String(selectedLocation.id).trim().toLowerCase();
  });

  const renderRightColumn = (targetLoc, mapPoints) => {
    if (!targetLoc) return null;
    const validPoints = (mapPoints || []).filter(p => p && !isNaN(parseFloat(p.latitude)) && !isNaN(parseFloat(p.longitude)));

    const getAggregatedVisits = (loc) => {
      if (!loc) return [];
      if (loc.is_folder === 1) {
        const childIds = getAllChildLocationIds(loc.id);
        const childLocs = locations.filter(l => childIds.includes(l.id));
        const directVisits = getVisits(loc).map(v => ({ ...v, sourceEntity: loc, isDirect: true }));
        const childVisits = childLocs.flatMap(cl => getVisits(cl).map(v => ({ ...v, sourceEntity: cl, isDirect: false })));
        return [...directVisits, ...childVisits];
      }
      return getVisits(loc).map(v => ({ ...v, sourceEntity: loc, isDirect: true }));
    };

    const aggregatedVisits = getAggregatedVisits(targetLoc);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 10 }}>
        {/* Map View */}
        <div style={{ height: '350px', minHeight: '300px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0 }}>
          {validPoints.length > 0 ? (
            <MapView points={validPoints} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              📍 No coordinates available to show map
            </div>
          )}
        </div>

        {/* Visits Section (Option 1: All Visits & Trips for Folders) */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-primary-hover)' }}>
              {targetLoc.is_folder === 1 ? '📅 All Visits & Trips' : '📅 Visits'}
            </h3>
            <button 
              type="button"
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
            <form onSubmit={(e) => handleAddManualVisit(e, targetLoc)} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '16px' }}>
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
                    .filter(a => !getLinkedAlbumIds(targetLoc).includes(a.id))
                    .filter(a => a.albumName.toLowerCase().includes(albumSearch.toLowerCase()))
                    .map(a => (
                      <div
                        key={a.id}
                        onClick={() => handleLinkAlbum(a.id, targetLoc)}
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
                    .filter(a => !getLinkedAlbumIds(targetLoc).includes(a.id))
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
          {aggregatedVisits.length > 0 ? (
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
                const resolvedVisits = aggregatedVisits.map(visit => {
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
                    <div key={`${visit.sourceEntity?.id || 'target'}-${visit.id}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2fr 0.3fr', gap: '8px', alignItems: 'center', fontSize: '0.8rem', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ wordBreak: 'break-all' }}>{formattedStart || 'N/A'}</div>
                      <div style={{ wordBreak: 'break-all' }}>{formattedEnd || 'N/A'}</div>
                      <div style={{ wordBreak: 'break-word', display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
                          <span style={{ color: visit.resolvedAlbumName ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: visit.resolvedAlbumName ? 'normal' : 'italic' }}>
                            {visit.resolvedAlbumName || 'Not Available'}
                          </span>
                        )}
                        {targetLoc.is_folder === 1 && visit.sourceEntity && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: visit.isDirect ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                              color: visit.isDirect ? 'var(--accent-primary-hover)' : 'var(--text-secondary)',
                              border: '1px solid var(--border-glass)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              {visit.isDirect ? '🏷️ Direct' : (visit.sourceEntity.is_folder === 1 ? `📂 ${visit.sourceEntity.name}` : `📍 ${visit.sourceEntity.name}`)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteVisit(visit.id, visit.sourceEntity || targetLoc)}
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
                          title={visit.sourceEntity ? `Delete Visit from ${visit.sourceEntity.name}` : "Delete Visit"}
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
    );
  };

  if (selectedLocation) {
    return (
      <div className="container">
        {renderModals()}
        {returnToCollectionId && (
          <button 
            type="button"
            className="btn btn-secondary"
            onClick={onReturnToCollection}
            style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'auto' }}
          >
            ← Back to Collection
          </button>
        )}
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
          <div className="header-actions-strip">
            <button 
              onClick={() => handleToggleVisited(selectedLocation)}
              style={{
                background: selectedLocation.visited === 1 ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)', borderRadius: '20px', padding: '0 16px',
                fontSize: '0.8rem', fontWeight: 600, color: selectedLocation.visited === 1 ? 'var(--success)' : 'var(--text-secondary)',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px',
                whiteSpace: 'nowrap', flexShrink: 0
              }}
              title={selectedLocation.visited === 1 ? "Mark as not visited" : "Mark as visited"}
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
                  trackApiCall('Wikipedia');
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
                height: '36px',
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: selectedLocation.is_folder === 1 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.05)',
                border: selectedLocation.is_folder === 1 ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid var(--border-glass)',
                borderRadius: '20px',
                color: selectedLocation.is_folder === 1 ? 'var(--accent-secondary)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              title={selectedLocation.is_folder === 1 ? "Folder (Click to convert to regular location)" : "Convert to Folder (allows grouping other locations inside)"}
            >
              {selectedLocation.is_folder === 1 ? <Folder size={15} /> : <FolderPlus size={15} />}
              <span>{selectedLocation.is_folder === 1 ? 'Folder' : 'Convert to Folder'}</span>
            </button>
            <button 
              onClick={() => openMoveModal([selectedLocation])}
              style={{
                height: '36px',
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-glass)',
                borderRadius: '20px',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              title="Move this location to a folder or top level"
            >
              <FolderInput size={15} />
              <span>Move</span>
            </button>
            <button 
              onClick={() => handleArchiveLocation(selectedLocation.id)} 
              style={{ 
                width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.3)', 
                borderRadius: '50%', cursor: 'pointer', flexShrink: 0 
              }}
              title="Archive Location"
            >
              <Archive size={16} />
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
              <h4 style={{ marginBottom: '8px' }}>{selectedLocation.is_folder === 1 ? 'Folder Tags' : 'Location Tags'}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {getEntityTagsList(selectedLocation.id).map(t => (
                  <span 
                    key={t.id} 
                    className="tag-badge" 
                    style={{ 
                      background: t.color ? `${t.color}22` : 'rgba(255, 255, 255, 0.08)',
                      borderColor: t.color ? `${t.color}55` : 'var(--border-glass)'
                    }}
                  >
                    <span>{t.name}</span>
                    <span 
                      className="tag-remove-btn"
                      onClick={() => handleRemoveTagFromEntity(selectedLocation.id, t.id)}
                      title={`Remove tag "${t.name}"`}
                    >
                      <X size={12} />
                    </span>
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
                            await handleCreateAndAssignTag(selectedLocation.id, tagSearch);
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
                <button 
                  className="btn btn-secondary" 
                  disabled={!!fetchingPhotoEntityIds[selectedLocation.id]}
                  onClick={() => handleFetchPhotoForEntity(selectedLocation, false)}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Fetch cover image from Wikipedia / Google Maps"
                >
                  <RefreshCw size={12} className={fetchingPhotoEntityIds[selectedLocation.id] ? "sync-spinner" : ""} /> Fetch Cover Image
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
                    <img 
                      src={photo.file_path && !photo.file_path.startsWith('http') && !photo.file_path.startsWith('data:') && !photo.file_path.startsWith('/') ? '/' + photo.file_path : photo.file_path} 
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }}
                      alt="Location visual" 
                    />
                    {photo.is_featured === 1 && <span className="featured-badge">Featured</span>}
                    <div className="photo-actions">
                      <button 
                        className={`photo-action-btn ${photo.is_featured === 1 ? 'featured-btn' : ''}`} 
                        onClick={() => handleSetFeaturedPhoto(photo)}
                        title={photo.is_featured === 1 ? 'Current cover image' : 'Set as cover image'}
                      >
                        <Star size={12} fill={photo.is_featured === 1 ? '#f59e0b' : 'none'} />
                      </button>
                      <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)} title="Delete photo">
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
                  onClick={() => {
                    if (!showAddPlaceForm) {
                      setPlaceName('');
                      setPlaceLat(selectedLocation?.latitude ? selectedLocation.latitude.toString() : '');
                      setPlaceLon(selectedLocation?.longitude ? selectedLocation.longitude.toString() : '');
                      setPlaceCategory('Attraction');
                      setPlaceNotes('');
                      setPlaceSearchQuery('');
                      setPlaceSearchResults([]);
                      setShowAddPlaceForm(true);
                    } else {
                      setShowAddPlaceForm(false);
                      setPlaceSearchQuery('');
                      setPlaceSearchResults([]);
                    }
                  }}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={12} /> Add New Place
                </button>
              </div>

              {/* Form to Add New Place (Toggleable) */}
              {showAddPlaceForm && (
                <form onSubmit={handleAddPlace} style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
                  
                  {/* OSM Place Search */}
                  <div className="form-group">
                    <label>Search {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'} for Place / Landmark</label>
                    <div className="search-input-wrapper" style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingLeft: '38px', paddingRight: placeSearchQuery ? '32px' : '12px' }}
                        placeholder="Search landmarks, cafes, sights near this region..."
                        value={placeSearchQuery}
                        onChange={(e) => setPlaceSearchQuery(e.target.value)}
                      />
                      {placeSearchQuery && (
                        <button
                          type="button"
                          className="search-clear-btn"
                          onClick={() => {
                            setPlaceSearchQuery('');
                            setPlaceSearchResults([]);
                          }}
                          title="Clear search"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {isSearchingPlace && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Searching {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'}...</p>}
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
                        {allCategories.map(c => (
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
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => {
                        setShowAddPlaceForm(false);
                        setPlaceName('');
                        setPlaceLat('');
                        setPlaceLon('');
                        setPlaceNotes('');
                        setPlaceSearchQuery('');
                        setPlaceSearchResults([]);
                      }}
                    >
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

                  if (selectedPlaceId === place.id) {
                    return (
                      <div 
                        key={place.id} 
                        style={{
                          background: 'var(--bg-surface-elevated)', 
                          border: '1px solid var(--border-glass)', 
                          borderRadius: 'var(--radius-md)',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--accent-primary-hover)' }}>Edit Details: {place.name}</h4>
                          <button 
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to archive "${place.name}"? It will be moved to Orphaned Places in Archived Items.`)) {
                                try {
                                  const activeToken = token || localStorage.getItem('tb_token');
                                  const res = await fetch(`/api/places/${place.id}/archive`, {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
                                    }
                                  });
                                  if (res.ok) {
                                    if (activeToken) await populateLocalDb(activeToken);
                                    setSelectedPlaceId(null);
                                    showToast(`Archived "${place.name}". View in Archived Items.`);
                                  } else {
                                    const errData = await res.json().catch(() => ({}));
                                    showToast(`Failed to archive place: ${errData.error || res.statusText}`, 'error');
                                  }
                                } catch (err) {
                                  showToast(`Failed to archive place: ${err.message}`, 'error');
                                }
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Archive place"
                          >
                            <Archive size={16} />
                          </button>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Place Name</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            value={editPlaceName}
                            onChange={(e) => setEditPlaceName(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div className="form-group" style={{ flex: 1, margin: 0 }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Latitude</label>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              value={editPlaceLat}
                              onChange={(e) => setEditPlaceLat(e.target.value)}
                              onPaste={handleCoordsPasteDirect}
                            />
                          </div>
                          <div className="form-group" style={{ flex: 1, margin: 0 }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Longitude</label>
                            <input 
                              type="number" 
                              step="any"
                              className="form-control" 
                              value={editPlaceLon}
                              onChange={(e) => setEditPlaceLon(e.target.value)}
                              onPaste={handleCoordsPasteDirect}
                            />
                          </div>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Category</label>
                          <select
                            className="form-control"
                            value={editPlaceCategory}
                            onChange={(e) => setEditPlaceCategory(e.target.value)}
                          >
                            <option value="">Select Category</option>
                            {allCategories.map(c => (
                              <option key={c.id} value={c.name}>{c.icon || '📌'} {c.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Notes</label>
                          <textarea 
                            className="form-control" 
                            rows="2"
                            value={editPlaceNotes}
                            onChange={(e) => setEditPlaceNotes(e.target.value)}
                          />
                        </div>

                        {/* Place Photos inside Inline Editor */}
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Place Photos</label>
                            <button 
                              type="button"
                              className="btn btn-secondary" 
                              disabled={!!fetchingPhotoEntityIds[place.id]}
                              onClick={() => {
                                const activePlace = {
                                  ...place,
                                  name: editPlaceName.trim() || place.name,
                                  latitude: editPlaceLat.trim() ? parseFloat(editPlaceLat) : place.latitude,
                                  longitude: editPlaceLon.trim() ? parseFloat(editPlaceLon) : place.longitude
                                };
                                handleFetchPhotoForEntity(activePlace, true);
                              }}
                              style={{ width: 'auto', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Fetch cover image from Wikipedia / Google Maps"
                            >
                              <RefreshCw size={12} className={fetchingPhotoEntityIds[place.id] ? "sync-spinner" : ""} /> Fetch Cover Image
                            </button>
                          </div>
                          <div 
                            className="photo-uploader" 
                            onClick={() => document.getElementById(`photo-upload-${place.id}`).click()}
                            style={{ border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center', cursor: 'pointer' }}
                          >
                            <ImageIcon size={18} style={{ color: 'var(--text-muted)', marginBottom: '4px' }} />
                            <p style={{ fontSize: '0.75rem', margin: 0 }}>Upload Photo</p>
                            <input
                              type="file"
                              id={`photo-upload-${place.id}`}
                              accept="image/*"
                              onChange={(e) => handlePhotoUpload(e, place.id)}
                              style={{ display: 'none' }}
                            />
                          </div>
                          <div className="photos-grid" style={{ marginTop: '8px' }}>
                            {photos.filter(p => p.entity_id === place.id).map(photo => (
                              <div key={photo.id} className="photo-thumb">
                                <img 
                                  src={photo.file_path && !photo.file_path.startsWith('http') && !photo.file_path.startsWith('data:') && !photo.file_path.startsWith('/') ? '/' + photo.file_path : photo.file_path} 
                                  onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=150'; }}
                                  alt="Place visual" 
                                />
                                {photo.is_featured === 1 && <span className="featured-badge">Featured</span>}
                                <div className="photo-actions">
                                  <button 
                                    className={`photo-action-btn ${photo.is_featured === 1 ? 'featured-btn' : ''}`} 
                                    onClick={() => handleSetFeaturedPhoto(photo)}
                                    title={photo.is_featured === 1 ? 'Current cover image' : 'Set as cover image'}
                                  >
                                    <Star size={12} fill={photo.is_featured === 1 ? '#f59e0b' : 'none'} />
                                  </button>
                                  <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)} title="Delete photo">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            onClick={() => setSelectedPlaceId(null)}
                            style={{ flex: 1 }}
                          >
                            Cancel
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            onClick={async () => {
                              if (!editPlaceName.trim()) return;
                              const updatedPlace = {
                                ...place,
                                name: editPlaceName,
                                latitude: editPlaceLat ? parseFloat(editPlaceLat) : null,
                                longitude: editPlaceLon ? parseFloat(editPlaceLon) : null,
                                category: editPlaceCategory,
                                notes: editPlaceNotes,
                                created_at: new Date().toISOString()
                              };
                              await queueSyncAction('places', 'update', updatedPlace);
                              setSelectedPlaceId(null);
                            }}
                            style={{ flex: 1 }}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    );
                  }

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
                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=150'; }}
                        style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                        alt={place.name}
                      />
                      <div style={{ flexGrow: 1, paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {place.name}
                              {(!place.latitude || isNaN(parseFloat(place.latitude))) && (
                                <span title="Missing location coordinates" style={{ fontSize: '0.85rem', cursor: 'help' }}>⚠️</span>
                              )}
                            </h4>
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
                          <span style={{ fontSize: '0.8rem', color: (!place.latitude || isNaN(parseFloat(place.latitude))) ? 'var(--error)' : 'var(--text-secondary)' }}>
                            {(!place.latitude || isNaN(parseFloat(place.latitude))) ? '⚠️ Missing location coordinates' : '📍 Geocoded'}
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
            </div>
          </div>

          {/* Right Column: Sticky Sidebar */}
          {renderRightColumn(selectedLocation, [
            selectedLocation, 
            ...activeLocationPlaces.map(p => ({ ...p, type: p.category }))
          ])}
        </div>
      </div>
    );
  }

  const currentFolder = currentFolderId ? locations.find(l => String(l.id) === String(currentFolderId)) : null;

  const processedLocations = locations.filter(loc => {
    // Filter by folder scope
    if (!listSearchQuery.trim()) {
      const parentId = loc.parent_id;
      const hasActiveParent = parentId && parentId !== 'null' && parentId !== 'undefined' && locations.some(l => String(l.id) === String(parentId));
      if (currentFolderId === null || currentFolderId === undefined || currentFolderId === '') {
        if (hasActiveParent) return false;
      } else {
        if (String(parentId) !== String(currentFolderId)) return false;
      }
    }
    // Search query
    if (listSearchQuery.trim()) {
      const q = listSearchQuery.toLowerCase();
      const nameMatch = loc.name?.toLowerCase().includes(q);
      const notesMatch = loc.notes?.toLowerCase().includes(q);
      const stateMatch = loc.state?.toLowerCase().includes(q);
      const countryMatch = loc.country?.toLowerCase().includes(q);
      
      // Direct place matches for this location
      const directPlaceMatch = places
        .filter(p => String(p.location_id) === String(loc.id))
        .some(p => p.name?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));

      // Check ancestor folder names if this location was moved into a parent folder
      const ancestorNames = getAncestorFolderNames(loc.parent_id);
      const ancestorMatch = ancestorNames.some(n => n.toLowerCase().includes(q));

      // If this is a folder, also check recursive child locations and their places
      let childMatch = false;
      if (loc.is_folder === 1) {
        const childIds = getAllChildLocationIds(loc.id);
        const childLocs = locations.filter(l => childIds.includes(l.id));
        const childLocsMatch = childLocs.some(cl => 
          cl.name?.toLowerCase().includes(q) || 
          cl.notes?.toLowerCase().includes(q) ||
          cl.state?.toLowerCase().includes(q) ||
          cl.country?.toLowerCase().includes(q)
        );
        const childPlacesMatch = places
          .filter(p => childIds.includes(p.location_id))
          .some(p => p.name?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
        
        childMatch = childLocsMatch || childPlacesMatch;
      }

      if (!nameMatch && !notesMatch && !stateMatch && !countryMatch && !directPlaceMatch && !ancestorMatch && !childMatch) {
        return false;
      }
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
      const locTags = getEntityTagsList(loc.id);
      let hasTag = locTags.some(t => t.id === filterTag);
      if (!hasTag && loc.is_folder === 1) {
        const childLocIds = getAllChildLocationIds(loc.id);
        hasTag = childLocIds.some(cid => getEntityTagsList(cid).some(t => t.id === filterTag));
      }
      if (!hasTag) return false;
    }
    // Category
    if (filterCategory) {
      const locPlaces = places.filter(p => String(p.location_id) === String(loc.id));
      let hasCategory = locPlaces.some(p => p.category === filterCategory);
      if (!hasCategory && loc.is_folder === 1) {
        const childLocIds = getAllChildLocationIds(loc.id);
        hasCategory = places.some(p => childLocIds.includes(p.location_id) && p.category === filterCategory);
      }
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
      if (loc.is_folder === 1) {
        const folderStatus = getFolderVisitedStatus(loc.id);
        if (filterVisited === 'visited' && folderStatus !== 'visited') return false;
        if (filterVisited === 'not-visited' && folderStatus === 'visited') return false;
      } else {
        const isVisited = loc.visited === 1;
        if (filterVisited === 'visited' && !isVisited) return false;
        if (filterVisited === 'not-visited' && isVisited) return false;
      }
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

  const renderLocationCards = (locList) => {
    return locList.map(loc => {
      const featuredImg = getFeaturedPhoto(loc.id);
      const locTags = getEntityTagsList(loc.id);
      const isLocSelected = selectedLocIds.includes(loc.id);

      return (
        <div 
          key={loc.id} 
          className={`card ${isSelectMode && isLocSelected ? 'is-selected' : ''}`}
          onClick={() => {
            if (isSelectMode) {
              handleToggleSelectLocation(loc.id);
              return;
            }
            if (loc.is_folder === 1) {
              setCurrentFolderId(loc.id);
              setListSearchQuery('');
            } else {
              setSelectedLocation(loc);
            }
          }}
          draggable={!isSelectMode && loc.is_folder !== 1}
          onDragStart={(e) => handleDragStart(e, loc.id)}
          onDragOver={(e) => handleDragOver(e, loc)}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={(e) => handleDrop(e, loc)}
          style={{
            border: dragOverFolderId === loc.id 
              ? '2px dashed var(--accent-primary)' 
              : (loc.is_folder === 1 
                  ? 'var(--border-folder-card)' 
                  : (isSelectMode && isLocSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)')),
            background: isSelectMode && isLocSelected 
              ? 'rgba(99, 102, 241, 0.12)' 
              : (loc.is_folder === 1 ? 'var(--bg-folder-card)' : 'var(--bg-surface)'),
            boxShadow: loc.is_folder === 1 ? 'var(--shadow-glow)' : 'var(--shadow-panel)'
          }}
        >
          <div className="card-media">
            {/* Multi-Select Checkbox Overlay */}
            {isSelectMode && (
              <div 
                className={`card-select-checkbox ${isLocSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelectLocation(loc.id);
                }}
                title={isLocSelected ? 'Deselect' : 'Select'}
              >
                {isLocSelected && <Check size={14} />}
              </div>
            )}

            {loc.is_folder === 1 ? (
              <FolderCover folderId={loc.id} locations={locations} getFeaturedPhoto={getFeaturedPhoto} />
            ) : (
              <img 
                src={featuredImg} 
                onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }} 
                alt={loc.name} 
              />
            )}
            <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
              {/* Quick Action: Move to Folder */}
              {!isSelectMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMoveModal([loc]);
                  }}
                  style={{
                    background: 'rgba(0, 0, 0, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    borderRadius: '12px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.15s ease'
                  }}
                  title={`Move "${loc.name}" to folder`}
                >
                  <FolderInput size={13} />
                  <span className="desktop-only-text">Move</span>
                </button>
              )}

              {loc.is_folder === 1 ? (
                (() => {
                  const status = getFolderVisitedStatus(loc.id);
                  if (status === 'visited') {
                    return (
                      <>
                        <div className="card-badge folder" style={{ position: 'static', background: 'var(--accent-secondary)' }}>
                          📂 Folder
                        </div>
                        <div className="card-badge visited" style={{ position: 'static' }}>
                          Visited
                        </div>
                      </>
                    );
                  } else if (status === 'partial') {
                    return (
                      <>
                        <div className="card-badge folder" style={{ position: 'static', background: 'var(--accent-secondary)' }}>
                          📂 Folder
                        </div>
                        <div className="card-badge" style={{ position: 'static', color: '#f97316', borderColor: 'rgba(249, 115, 22, 0.3)' }}>
                          Visited
                        </div>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <div className="card-badge folder" style={{ position: 'static', background: 'var(--accent-secondary)' }}>
                          📂 Folder
                        </div>
                        <div className="card-badge" style={{ position: 'static' }}>
                          Not Visited
                        </div>
                      </>
                    );
                  }
                })()
              ) : (
                <div className={`card-badge ${loc.visited === 1 ? 'visited' : ''}`} style={{ position: 'static' }}>
                  {loc.visited === 1 ? 'Visited' : 'Not Visited'}
                </div>
              )}
            </div>
          </div>
          <div className="card-content">
            {loc.parent_id && loc.parent_id !== 'null' && loc.parent_id !== 'undefined' && listSearchQuery.trim() && (
              <div style={{ 
                fontSize: '0.72rem', 
                color: 'var(--accent-secondary)', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '4px', 
                marginBottom: '4px',
                background: 'rgba(6, 182, 212, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                width: 'fit-content'
              }}>
                <Folder size={11} />
                <span>{getAncestorFolderNames(loc.parent_id).join(' > ')}</span>
              </div>
            )}
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

            <div className="card-footer">
              <div className="location-info">
                <span>📍</span>
                <span>
                  {[loc.state, loc.country].filter(Boolean).join(', ') || 'Global'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {places.filter(p => String(p.location_id) === String(loc.id)).length} {places.filter(p => String(p.location_id) === String(loc.id)).length === 1 ? 'place' : 'places'}
                </span>
                {loc.is_folder === 1 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)' }}>
                    • {locations.filter(l => String(l.parent_id) === String(loc.id)).length} {locations.filter(l => String(l.parent_id) === String(loc.id)).length === 1 ? 'location' : 'locations'}
                  </span>
                )}
              </div>
            </div>

            {/* Tags Pills */}
            {locTags.length > 0 && (
              <div className="card-tags">
                {locTags.map(tag => (
                  <span 
                    key={tag.id} 
                    className="tag-badge-mini" 
                    style={{ 
                      background: tag.color ? `${tag.color}22` : 'rgba(255, 255, 255, 0.08)',
                      borderColor: tag.color ? `${tag.color}55` : 'var(--border-glass)'
                    }}
                  >
                    <span>{tag.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  const renderFolderPlacesSection = () => {
    if (!currentFolderId) return null;
    const folderDirectPlaces = places.filter(p => String(p.location_id) === String(currentFolderId));
    const filteredFolderPlaces = folderDirectPlaces.filter(p => {
      if (listSearchQuery.trim()) {
        const q = listSearchQuery.toLowerCase();
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesNotes = (p.notes || '').toLowerCase().includes(q);
        const matchesCat = (p.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNotes && !matchesCat) return false;
      }
      if (filterCategory) {
        if (filterCategory === 'General') {
          if (p.category && p.category !== 'General' && p.category !== 'Attraction') return false;
        } else if (p.category !== filterCategory) {
          return false;
        }
      }
      if (filterVisited === 'visited' && p.visited !== 1) return false;
      if (filterVisited === 'unvisited' && p.visited === 1) return false;
      return true;
    });

    return (
      <div style={{ marginTop: '24px', marginBottom: '24px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: 'var(--accent-primary)' }} />
            Places of Visit {filteredFolderPlaces.length > 0 ? `(${filteredFolderPlaces.length})` : ''}
          </h3>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              const fLoc = locations.find(l => l.id === currentFolderId);
              if (!showAddPlaceForm) {
                setPlaceName('');
                setPlaceLat(fLoc?.latitude ? fLoc.latitude.toString() : '');
                setPlaceLon(fLoc?.longitude ? fLoc.longitude.toString() : '');
                setPlaceCategory('Attraction');
                setPlaceNotes('');
                setPlaceSearchQuery('');
                setPlaceSearchResults([]);
                setShowAddPlaceForm(true);
              } else {
                setShowAddPlaceForm(false);
                setPlaceSearchQuery('');
                setPlaceSearchResults([]);
              }
            }}
            style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={12} /> Add New Place
          </button>
        </div>

        {/* Form to Add New Place (Toggleable) */}
        {showAddPlaceForm && (
          <form onSubmit={handleAddPlace} style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
            <div className="form-group">
              <label>Search {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'} for Place / Landmark</label>
              <div className="search-input-wrapper" style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px', paddingRight: placeSearchQuery ? '32px' : '12px' }}
                  placeholder="Search landmarks, cafes, sights near this region..."
                  value={placeSearchQuery}
                  onChange={(e) => setPlaceSearchQuery(e.target.value)}
                />
                {placeSearchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => {
                      setPlaceSearchQuery('');
                      setPlaceSearchResults([]);
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isSearchingPlace && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Searching {localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false' ? 'Google Maps' : 'OSM'}...</p>}
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
                  {allCategories.map(c => (
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
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddPlaceForm(false);
                  setPlaceName('');
                  setPlaceLat('');
                  setPlaceLon('');
                  setPlaceNotes('');
                  setPlaceSearchQuery('');
                  setPlaceSearchResults([]);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSavingPlace}>
                {isSavingPlace ? 'Saving...' : 'Save Place to Visit'}
              </button>
            </div>
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {filteredFolderPlaces.map(place => {
            const featuredPlaceImg = getFeaturedPhoto(place.id);

            if (selectedPlaceId === place.id) {
              return (
                <div 
                  key={place.id} 
                  style={{
                    background: 'var(--bg-surface-elevated)', 
                    border: '1px solid var(--border-glass)', 
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--accent-primary-hover)' }}>Edit Details: {place.name}</h4>
                    <button 
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`Are you sure you want to archive "${place.name}"? It will be moved to Orphaned Places in Archived Items.`)) {
                          try {
                            const activeToken = token || localStorage.getItem('tb_token');
                            const res = await fetch(`/api/places/${place.id}/archive`, {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
                              }
                            });
                            if (res.ok) {
                              if (activeToken) await populateLocalDb(activeToken);
                              setSelectedPlaceId(null);
                              showToast(`Archived "${place.name}". View in Archived Items.`);
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              showToast(`Failed to archive place: ${errData.error || res.statusText}`, 'error');
                            }
                          } catch (err) {
                            showToast(`Failed to archive place: ${err.message}`, 'error');
                          }
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Archive place"
                    >
                      <Archive size={16} />
                    </button>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Place Name</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={editPlaceName}
                      onChange={(e) => setEditPlaceName(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Latitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        className="form-control" 
                        value={editPlaceLat}
                        onChange={(e) => setEditPlaceLat(e.target.value)}
                        onPaste={handleCoordsPasteDirect}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Longitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        className="form-control" 
                        value={editPlaceLon}
                        onChange={(e) => setEditPlaceLon(e.target.value)}
                        onPaste={handleCoordsPasteDirect}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Category</label>
                    <select
                      className="form-control"
                      value={editPlaceCategory}
                      onChange={(e) => setEditPlaceCategory(e.target.value)}
                    >
                      <option value="">Select Category</option>
                      {allCategories.map(c => (
                        <option key={c.id} value={c.name}>{c.icon || '📌'} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Notes</label>
                    <textarea 
                      className="form-control" 
                      rows="2"
                      value={editPlaceNotes}
                      onChange={(e) => setEditPlaceNotes(e.target.value)}
                    />
                  </div>

                  {/* Place Photos inside Inline Editor */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Place Photos</label>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        disabled={!!fetchingPhotoEntityIds[place.id]}
                        onClick={() => {
                          const activePlace = {
                            ...place,
                            name: editPlaceName.trim() || place.name,
                            latitude: editPlaceLat.trim() ? parseFloat(editPlaceLat) : place.latitude,
                            longitude: editPlaceLon.trim() ? parseFloat(editPlaceLon) : place.longitude
                          };
                          handleFetchPhotoForEntity(activePlace, true);
                        }}
                        style={{ width: 'auto', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Fetch cover image from Wikipedia / Google Maps"
                      >
                        <RefreshCw size={12} className={fetchingPhotoEntityIds[place.id] ? "sync-spinner" : ""} /> Fetch Cover Image
                      </button>
                    </div>
                    <div 
                      className="photo-uploader" 
                      onClick={() => document.getElementById(`photo-upload-${place.id}`).click()}
                      style={{ border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center', cursor: 'pointer' }}
                    >
                      <ImageIcon size={18} style={{ color: 'var(--text-muted)', marginBottom: '4px' }} />
                      <p style={{ fontSize: '0.75rem', margin: 0 }}>Upload Photo</p>
                      <input
                        type="file"
                        id={`photo-upload-${place.id}`}
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e, place.id)}
                        style={{ display: 'none' }}
                      />
                    </div>
                    <div className="photos-grid" style={{ marginTop: '8px' }}>
                      {photos.filter(p => p.entity_id === place.id).map(photo => (
                        <div key={photo.id} className="photo-thumb">
                          <img 
                            src={photo.file_path && !photo.file_path.startsWith('http') && !photo.file_path.startsWith('data:') && !photo.file_path.startsWith('/') ? '/' + photo.file_path : photo.file_path} 
                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=150'; }} 
                            alt="Place visual" 
                          />
                          {photo.is_featured === 1 && <span className="featured-badge">Featured</span>}
                          <div className="photo-actions">
                            <button 
                              className={`photo-action-btn ${photo.is_featured === 1 ? 'featured-btn' : ''}`} 
                              onClick={() => handleSetFeaturedPhoto(photo)}
                              title={photo.is_featured === 1 ? 'Current cover image' : 'Set as cover image'}
                            >
                              <Star size={12} fill={photo.is_featured === 1 ? '#f59e0b' : 'none'} />
                            </button>
                            <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)} title="Delete photo">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => setSelectedPlaceId(null)}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={async () => {
                        if (!editPlaceName.trim()) return;
                        const updatedPlace = {
                          ...place,
                          name: editPlaceName,
                          latitude: editPlaceLat ? parseFloat(editPlaceLat) : null,
                          longitude: editPlaceLon ? parseFloat(editPlaceLon) : null,
                          category: editPlaceCategory,
                          notes: editPlaceNotes,
                          created_at: new Date().toISOString()
                        };
                        await queueSyncAction('places', 'update', updatedPlace);
                        setSelectedPlaceId(null);
                      }}
                      style={{ flex: 1 }}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              );
            }

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
                  onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=150'; }} 
                  style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} 
                  alt={place.name} 
                />
                <div style={{ flexGrow: 1, paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {place.name}
                        {(!place.latitude || isNaN(parseFloat(place.latitude))) && (
                          <span title="Missing location coordinates" style={{ fontSize: '0.85rem', cursor: 'help' }}>⚠️</span>
                        )}
                      </h4>
                      <button 
                        type="button"
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
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
                    <span style={{ fontSize: '0.8rem', color: (!place.latitude || isNaN(parseFloat(place.latitude))) ? 'var(--error)' : 'var(--text-secondary)' }}>
                      {(!place.latitude || isNaN(parseFloat(place.latitude))) ? '⚠️ Missing location coordinates' : '📍 Geocoded'}
                    </span>
                    <button 
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--accent-primary-hover)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => {
                        setSelectedPlaceId(selectedPlaceId === place.id ? null : place.id);
                        if (selectedPlaceId !== place.id) {
                          setEditPlaceName(place.name || '');
                          setEditPlaceLat(place.latitude !== undefined && place.latitude !== null ? String(place.latitude) : '');
                          setEditPlaceLon(place.longitude !== undefined && place.longitude !== null ? String(place.longitude) : '');
                          setEditPlaceCategory(place.category || '');
                          setEditPlaceNotes(place.notes || '');
                        }
                      }}
                    >
                      <Edit size={12} /> {selectedPlaceId === place.id ? 'Close Details' : 'Edit Details'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFiltersToolbar = () => (
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
      {/* Row 2: Search */}
      <div className="search-input-wrapper" style={{ width: '100%', position: 'relative' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Search locations by name/notes..."
          value={listSearchQuery}
          onChange={(e) => setListSearchQuery(e.target.value)}
          style={{ fontSize: '0.8rem', padding: '6px 34px 6px 12px', height: '34px' }}
        />
        {listSearchQuery && (
          <button 
            type="button" 
            className="search-clear-btn" 
            onClick={() => setListSearchQuery('')}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Row 1: Filters & Sort & Reset (Collapsible) */}
      {showFilters && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          width: '100%',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-glass)'
        }}>
          {/* Filter by Country */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Country</label>
            <select
              className="form-control"
              value={filterCountry}
              onChange={(e) => {
                setFilterCountry(e.target.value);
                setFilterState('');
              }}
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
              {(() => {
                let filteredLocs = locations;
                if (filterCountry) {
                  filteredLocs = locations.filter(l => l.country === filterCountry);
                }
                return Array.from(new Set(filteredLocs.map(l => l.state).filter(Boolean))).sort().map(s => (
                  <option key={s} value={s}>{s}</option>
                ));
              })()}
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
              <option value="">Any Time</option>
              <option value="today">Added Today</option>
              <option value="week">Added This Week</option>
              <option value="month">Added This Month</option>
              <option value="year">Added This Year</option>
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
              <option value="visited">Visited Only</option>
              <option value="not-visited">Not Visited Only</option>
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
      )}
    </div>
  );

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
        <div className="header-actions-strip">
          {currentFolderId ? (
            <>
              {/* 0. Visited */}
              {currentFolder && (
                <button 
                  type="button"
                  onClick={() => handleToggleVisited(currentFolder)}
                  style={{
                    background: currentFolder.visited === 1 ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-glass)', borderRadius: '20px', padding: '0 16px',
                    fontSize: '0.8rem', fontWeight: 600, color: currentFolder.visited === 1 ? 'var(--success)' : 'var(--text-secondary)',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}
                  title={currentFolder.visited === 1 ? "Mark as not visited" : "Mark as visited"}
                >
                  {currentFolder.visited === 1 ? '✓ Visited' : '○ Not Visited'}
                </button>
              )}

              {/* 1. Move */}
              <button 
                type="button"
                onClick={() => {
                  if (currentFolder) openMoveModal([currentFolder]);
                }} 
                style={{ 
                  height: '36px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '20px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title="Move this folder to another folder or top level"
              >
                <FolderInput size={15} />
                <span>Move</span>
              </button>

              {/* 2. Select */}
              <button 
                type="button"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedLocIds([]);
                }} 
                style={{ 
                  height: '36px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelectMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  color: isSelectMode ? '#ffffff' : 'var(--text-secondary)',
                  border: isSelectMode ? 'none' : '1px solid var(--border-glass)',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title={isSelectMode ? "Cancel selection mode" : "Select multiple locations to move or delete"}
              >
                <Layers size={15} />
                <span>{isSelectMode ? 'Cancel Selection' : 'Select'}</span>
              </button>

              {/* 3. Add Location */}
              <button 
                type="button"
                onClick={openAddLocationModal} 
                style={{ 
                  height: '36px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title="Add new location in this folder"
              >
                <Plus size={15} />
                <span>Add Location</span>
              </button>

              {/* 4. Filter */}
              <button 
                type="button"
                onClick={() => setShowFilters(!showFilters)} 
                style={{ 
                  width: '36px', height: '36px', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: showFilters ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: showFilters ? 'var(--accent-primary-hover)' : 'var(--text-secondary)',
                  border: showFilters ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                title={showFilters ? "Hide filters" : "Show search & filters"}
              >
                <Filter size={16} />
              </button>

              {/* 5. Delete Folder */}
              <button 
                type="button"
                onClick={() => handleArchiveLocation(currentFolderId)} 
                style={{ 
                  width: '36px', height: '36px', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#eab308', 
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                title="Archive this folder"
              >
                <Archive size={16} />
              </button>
            </>
          ) : (
            <>
              {/* Main Locations: 1. Select */}
              <button 
                type="button"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedLocIds([]);
                }} 
                style={{ 
                  height: '36px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelectMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  color: isSelectMode ? '#ffffff' : 'var(--text-secondary)',
                  border: isSelectMode ? 'none' : '1px solid var(--border-glass)',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title={isSelectMode ? "Cancel selection mode" : "Select multiple locations to move or delete"}
              >
                <Layers size={15} />
                <span>{isSelectMode ? 'Cancel Selection' : 'Select'}</span>
              </button>

              {/* Main Locations: 2. Filter */}
              <button 
                type="button"
                onClick={() => setShowFilters(!showFilters)} 
                style={{ 
                  width: '36px', height: '36px', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: showFilters ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: showFilters ? 'var(--accent-primary-hover)' : 'var(--text-secondary)',
                  border: showFilters ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                title={showFilters ? "Hide filters" : "Show search & filters"}
              >
                <Filter size={16} />
              </button>

              {/* First-time Import from Immich (shown only if Immich configured & not yet imported) */}
              {isImmichConfigured && !hasImportedImmich && (
                <button
                  type="button"
                  onClick={() => setShowImmichImportModal(true)}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-primary-hover)',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  title="Import visited cities and destinations from your Immich photo timeline"
                >
                  <Sparkles size={15} />
                  <span>Import from Immich</span>
                </button>
              )}

              {/* Main Locations: 3. Add Location */}
              <button 
                type="button"
                onClick={openAddLocationModal} 
                style={{ 
                  height: '36px',
                  padding: '0 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title="Add new location"
              >
                <Plus size={15} />
                <span>Add Location</span>
              </button>
            </>
          )}
        </div>
      </div>

      {currentFolderId ? (
        /* Folder View: Two-Column Layout (Matching Specific Location Page) */
        <div className="location-detail-grid">
          {/* Left Column: Details, Sub-Locations, Places */}
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

            {/* Folder Tags Section */}
            <div>
              <h4 style={{ marginBottom: '8px' }}>Folder Tags</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {getEntityTagsList(currentFolderId).map(t => (
                  <span 
                    key={t.id} 
                    className="tag-badge" 
                    style={{ 
                      background: t.color ? `${t.color}22` : 'rgba(255, 255, 255, 0.08)',
                      borderColor: t.color ? `${t.color}55` : 'var(--border-glass)'
                    }}
                  >
                    <span>{t.name}</span>
                    <span 
                      className="tag-remove-btn"
                      onClick={() => handleRemoveTagFromEntity(currentFolderId, t.id)}
                      title={`Remove tag "${t.name}"`}
                    >
                      <X size={12} />
                    </span>
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
                        .filter(t => !getEntityTagsList(currentFolderId).map(et => et.id).includes(t.id))
                        .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        .map(t => (
                          <div
                            key={t.id}
                            onClick={async () => {
                              await queueSyncAction('entity_tags', 'insert', { entity_id: currentFolderId, tag_id: t.id });
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
                            await handleCreateAndAssignTag(currentFolderId, tagSearch);
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
                        .filter(t => !getEntityTagsList(currentFolderId).map(et => et.id).includes(t.id))
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

            {/* Folder Notes */}
            {currentFolder && (
              <div>
                <h4 style={{ marginBottom: '8px' }}>Notes</h4>
                <textarea
                  className="form-control"
                  rows="3"
                  value={currentFolder.notes || ''}
                  onChange={async (e) => {
                    const updated = { ...currentFolder, notes: e.target.value, created_at: new Date().toISOString() };
                    await db.locations.update(currentFolder.id, { notes: e.target.value });
                    queueSyncAction('locations', 'update', updated);
                  }}
                  placeholder="Record description, best season to visit, packing requirements..."
                />
              </div>
            )}

            {/* Folder Photo Gallery */}
            {currentFolder && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0 }}>Photo Gallery</h4>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => document.getElementById(`photo-upload-folder-${currentFolder.id}`).click()}
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={12} /> Upload
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    disabled={!!fetchingPhotoEntityIds[currentFolder.id]}
                    onClick={() => handleFetchPhotoForEntity(currentFolder, false)}
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Fetch cover image from Wikipedia / Google Maps"
                  >
                    <RefreshCw size={12} className={fetchingPhotoEntityIds[currentFolder.id] ? "sync-spinner" : ""} /> Fetch Cover Image
                  </button>
                  <input
                    type="file"
                    id={`photo-upload-folder-${currentFolder.id}`}
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, currentFolder.id)}
                    style={{ display: 'none' }}
                  />
                </div>
                <div className="photos-grid">
                  {photos.filter(p => p.entity_id === currentFolder.id).map(photo => (
                    <div key={photo.id} className="photo-thumb">
                      <img 
                        src={photo.file_path && !photo.file_path.startsWith('http') && !photo.file_path.startsWith('data:') && !photo.file_path.startsWith('/') ? '/' + photo.file_path : photo.file_path} 
                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }} 
                        alt="Folder snapshot" 
                      />
                      <div className="photo-overlay-actions">
                        <button 
                          className={`photo-action-btn ${photo.is_featured ? 'active' : ''}`}
                          onClick={() => handleSetFeaturedPhoto(photo)}
                          title={photo.is_featured ? "Featured cover photo" : "Set as cover photo"}
                        >
                          <Star size={12} fill={photo.is_featured ? "currentColor" : "none"} />
                        </button>
                        <button className="photo-action-btn" onClick={() => handleDeletePhoto(photo.id)} title="Delete photo">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-Locations Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={18} style={{ color: 'var(--accent-secondary)' }} />
                  Sub-Locations & Folders ({processedLocations.length})
                </h3>
              </div>

              {renderFiltersToolbar()}

              {processedLocations.length > 0 ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {renderLocationCards(processedLocations)}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '24px' }}>
                  No sub-locations found in this folder.
                </p>
              )}
            </div>

            {/* Places of Visit Section */}
            {renderFolderPlacesSection()}
          </div>

          {/* Right Column: Sticky Sidebar with Map & Visits & Gallery */}
          {renderRightColumn(currentFolder, [
            ...(!isNaN(parseFloat(currentFolder?.latitude)) && !isNaN(parseFloat(currentFolder?.longitude)) ? [{ ...currentFolder, type: 'Folder' }] : []),
            ...processedLocations.filter(l => !isNaN(parseFloat(l.latitude)) && !isNaN(parseFloat(l.longitude))).map(l => ({ ...l, type: l.is_folder === 1 ? 'Folder' : 'Location' })),
            ...places.filter(p => String(p.location_id) === String(currentFolderId) && !isNaN(parseFloat(p.latitude)) && !isNaN(parseFloat(p.longitude))).map(p => ({ ...p, type: p.category || 'Attraction' }))
          ])}
        </div>
      ) : (
        /* Root Level View */
        <>
          {renderFiltersToolbar()}

          {/* Root Empty State */}
          {locations.length === 0 && !showAddForm && (
            <div className="empty-state" style={{ marginBottom: '20px' }}>
              <MapPin size={48} className="empty-state-icon" />
              <h3>No Locations Yet</h3>
              <p>Start tracking your travel map by adding your first location or country.</p>
              <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
                <MapPin size={16} />
                <span>Add Location</span>
              </button>
            </div>
          )}

          <div className="grid">
            {renderLocationCards(processedLocations)}
          </div>
        </>
      )}

      {/* Floating Bulk Action Bar (Option C) */}
      {isSelectMode && selectedLocIds.length > 0 && (
        <div className="bulk-actions-floating-bar">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {selectedLocIds.length} selected
          </span>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const visibleLocs = locations.filter(loc => {
                if (!listSearchQuery.trim()) {
                  const parentId = loc.parent_id;
                  const hasActiveParent = parentId && parentId !== 'null' && parentId !== 'undefined' && locations.some(l => String(l.id) === String(parentId));
                  if (currentFolderId === null) {
                    if (hasActiveParent) return false;
                  } else {
                    if (String(parentId) !== String(currentFolderId)) return false;
                  }
                }
                return true;
              });
              const visibleIds = visibleLocs.map(l => l.id);
              const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedLocIds.includes(id));
              if (allSelected) {
                setSelectedLocIds(prev => prev.filter(id => !visibleIds.includes(id)));
              } else {
                setSelectedLocIds(Array.from(new Set([...selectedLocIds, ...visibleIds])));
              }
            }}
            style={{ fontSize: '0.78rem', padding: '6px 12px', height: '32px' }}
          >
            Select All
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const locs = locations.filter(l => selectedLocIds.includes(l.id));
              openMoveModal(locs);
            }}
            style={{
              fontSize: '0.78rem',
              padding: '6px 14px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FolderInput size={14} />
            <span>Move ({selectedLocIds.length})</span>
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleBulkArchive}
            style={{
              fontSize: '0.78rem',
              padding: '6px 12px',
              height: '32px',
              background: 'rgba(234, 179, 8, 0.18)',
              color: '#eab308',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Archive size={14} />
            <span>Archive ({selectedLocIds.length})</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSelectedLocIds([]);
              setIsSelectMode(false);
            }}
            style={{ fontSize: '0.78rem', padding: '6px 10px', height: '32px' }}
            title="Done selecting"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bottom Archived Items Link - Only on main root Locations page when archived items exist */}
      {!selectedLocation && currentFolderId === null && totalArchivedCount > 0 && (
        <div style={{ marginTop: '36px', marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onNavigate && onNavigate('archived')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              fontSize: '0.85rem',
              fontWeight: 500,
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <Archive size={15} style={{ color: '#eab308' }} />
            <span>View Archived Items</span>
            <span style={{
              background: 'rgba(234, 179, 8, 0.18)',
              color: '#eab308',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {totalArchivedCount}
            </span>
          </button>
        </div>
      )}

      {/* Shared Modals & Toast */}
      {renderModals()}

      {/* Immich Location Import Modal */}
      <ImmichLocationImportModal
        isOpen={showImmichImportModal}
        onClose={() => setShowImmichImportModal(false)}
        onImportStarted={({ citiesCount, foldersCount, enrichingInBackground }) => {
          setHasImportedImmich(true);
          showToast(`Successfully created ${foldersCount} folder(s) and ${citiesCount} location(s)!`);
        }}
      />
    </div>
  );
}
