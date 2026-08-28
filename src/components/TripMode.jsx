import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { loadGoogleMaps } from '../utils/googleMapsLoader.js';
import { 
  Calendar, Check, Plus, DollarSign, Image as ImageIcon, 
  MapPin, RefreshCw, Sparkles, Navigation, X, ShieldAlert,
  Utensils, FileText, Star, Compass, Coffee, Trash2, Edit
} from 'lucide-react';
import { performSync } from '../sync.js';
import { getDayColor } from '../utils/dayColors.js';

const formatDuration = (mins) => {
  if (!mins || isNaN(mins) || mins <= 0) return '';
  const numMins = Math.round(Number(mins));
  if (numMins < 60) return `${numMins} mins`;
  const hours = Math.floor(numMins / 60);
  const remainingMins = numMins % 60;
  if (remainingMins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMins} min${remainingMins > 1 ? 's' : ''}`;
};

const STANDARD_CURRENCIES = [
  'USD', 'EUR', 'INR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'AED', 'THB', 'CNY', 'MXN', 'BRL', 'NZD'
];

const safeParseNotes = (val) => {
  if (!val) return {};
  if (typeof val === 'object' && val !== null) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        // Fallback to description
      }
    }
    return { description: val };
  }
  return {};
};

export default function TripMode({ token }) {
  // Consolidate live queries to eliminate PWA rendering flicker on sync updates
  const syncData = useLiveQuery(async () => {
    return {
      trips: await db.trips.toArray(),
      places: await db.places.toArray(),
      itineraries: await db.itinerary_items.toArray(),
      expenses: await db.expenses.toArray(),
      rates: await db.trip_currency_rates.toArray(),
      locations: await db.locations.toArray(),
      reservations: await db.reservations.toArray(),
      tripNotes: await db.trip_notes.toArray(),
      people: await (db.people ? db.people.toArray() : Promise.resolve([])),
      userAddresses: await (db.user_addresses ? db.user_addresses.toArray() : Promise.resolve([]))
    };
  }) || { trips: [], places: [], itineraries: [], expenses: [], rates: [], locations: [], reservations: [], tripNotes: [], people: [], userAddresses: [] };

  const { trips, places, itineraries, expenses, rates, locations, reservations, tripNotes, people = [], userAddresses = [] } = syncData;

  const combinedPlaces = useMemo(() => {
    const homePlaces = (userAddresses || []).map(addr => ({
      id: `home_${addr.id}`,
      address_id: addr.id,
      is_home: true,
      name: `🏠 ${addr.label}`,
      category: 'Home Address',
      latitude: (addr.latitude !== null && addr.latitude !== undefined && addr.latitude !== '' && !isNaN(Number(addr.latitude))) ? parseFloat(addr.latitude) : null,
      longitude: (addr.longitude !== null && addr.longitude !== undefined && addr.longitude !== '' && !isNaN(Number(addr.longitude))) ? parseFloat(addr.longitude) : null,
      address: addr.address || ''
    }));
    return [...places, ...homePlaces];
  }, [places, userAddresses]);

  // Local State
  const [activeTrip, setActiveTrip] = useState(null);
  const [isAutoSelected, setIsAutoSelected] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [currentDayStr, setCurrentDayStr] = useState('');
  const [activePdfUrl, setActivePdfUrl] = useState(null);
  
  // Default user settings currency
  const [userBaseCurrency, setUserBaseCurrency] = useState(localStorage.getItem('base_currency') || 'USD');

  // Quick Expense Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState(userBaseCurrency);
  const [expCategory, setExpCategory] = useState('Snacks');
  const [expNotes, setExpNotes] = useState('');
  const [expFile, setExpFile] = useState(null);

  useEffect(() => {
    const fetchSettingsCurrency = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.config && data.config.base_currency) {
            setUserBaseCurrency(data.config.base_currency);
            setExpCurrency(data.config.base_currency);
            localStorage.setItem('base_currency', data.config.base_currency);
          }
        }
      } catch (e) {
        console.warn('Failed to load user currency settings:', e);
      }
    };
    fetchSettingsCurrency();
  }, [token]);
  
  // Quick Nearby Food Finder States
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodCategoryFilter, setFoodCategoryFilter] = useState('all');
  const [foodSearchProvider, setFoodSearchProvider] = useState('');
  const [foodSearchError, setFoodSearchError] = useState('');
  const [nearbyRestaurants, setNearbyRestaurants] = useState([]);
  const [userCoords, setUserCoords] = useState(null);

  // Trip Notes States
  const [showTripNoteModal, setShowTripNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState('General');
  
  // OwnTracks distance
  const [ownTracksLoading, setOwnTracksLoading] = useState(false);
  const [ownTracksDistance, setOwnTracksDistance] = useState(null);
  const [distanceByDay, setDistanceByDay] = useState({});
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Route Segment Distances Cache & Fetcher
  const [distances, setDistances] = useState({});
  const pendingOSRMFetches = useRef(new Set());

  const getHaversine = (p1, p2) => {
    if (!p1 || !p2 || !p1.latitude || !p1.longitude || !p2.latitude || !p2.longitude) return 0;
    const R = 6371; // km
    const dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
    const dLon = (p2.longitude - p1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(p1.latitude * Math.PI / 180) * Math.cos(p2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
  };

  const fetchOSRMDistance = async (p1, p2) => {
    if (!p1 || !p2 || !p1.latitude || !p1.longitude || !p2.latitude || !p2.longitude) return;
    const key = `${p1.id}-${p2.id}`;
    if (distances[key]) return distances[key];
    if (pendingOSRMFetches.current.has(key)) return;
    pendingOSRMFetches.current.add(key);

    try {
      const apiKey = localStorage.getItem('google_maps_api_key');
      const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

      // 1. Try Google Maps RouteMatrix computeRouteMatrix (v2 REST API)
      if (apiKey && googleMapsEnabled) {
        try {
          const routeRes = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status'
            },
            body: JSON.stringify({
              origins: [{ waypoint: { location: { latLng: { latitude: parseFloat(p1.latitude), longitude: parseFloat(p1.longitude) } } } }],
              destinations: [{ waypoint: { location: { latLng: { latitude: parseFloat(p2.latitude), longitude: parseFloat(p2.longitude) } } } }],
              travelMode: 'DRIVE'
            })
          });

          if (routeRes.ok) {
            const matrixData = await routeRes.json();
            const elem = Array.isArray(matrixData) ? matrixData[0] : matrixData;
            if (elem && elem.distanceMeters) {
              const distKm = Math.round((elem.distanceMeters / 1000) * 10) / 10;
              const durSecs = parseInt((elem.duration || '0').replace('s', ''), 10) || 0;
              const durationMins = Math.round(durSecs / 60);
              const valObj = { distance: distKm, duration: durationMins };
              setDistances(prev => ({ ...prev, [key]: valObj }));
              return valObj;
            }
          }
        } catch (e) {
          console.warn('Google RouteMatrix computeRouteMatrix failed, falling back to OSRM:', e);
        }
      }

      // 2. Try OSRM Routing API for driving distance & travel duration
      const url = `https://router.project-osrm.org/route/v1/driving/${p2.longitude},${p2.latitude};${p1.longitude},${p1.latitude}?overview=false`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const distKm = Math.round((data.routes[0].distance / 1000) * 10) / 10;
          const durationMins = Math.round(data.routes[0].duration / 60);
          const valObj = { distance: distKm, duration: durationMins };
          setDistances(prev => ({ ...prev, [key]: valObj }));
          return valObj;
        }
      }
    } catch (e) {
      console.warn('OSRM routing fetch failed, using haversine fallback:', e);
    }

    // 3. Fallback to Haversine straight-line distance calculation
    const distKm = getHaversine(p1, p2);
    const valObj = { distance: distKm, duration: Math.round(distKm * 2) };
    setDistances(prev => ({ ...prev, [key]: valObj }));
    return valObj;
  };

  // Auto-select nearest ongoing trip on load
  useEffect(() => {
    if (trips.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. If an active trip is already selected, keep it updated with latest fields from trips
      if (activeTrip) {
        const currentMatched = trips.find(t => String(t.id) === String(activeTrip.id));
        if (currentMatched) {
          setActiveTrip(currentMatched);
          return;
        }
      }

      // 2. Check trips table for explicit active trip marked synced in DB
      const dbActiveTrip = trips.find(t => {
        const notesObj = safeParseNotes(t.notes);
        return notesObj.isActive === true;
      });
      
      if (dbActiveTrip) {
        setActiveTrip(dbActiveTrip);
        setIsAutoSelected(false);
      } else {
        // 3. Filter out past trips, only allow ongoing and upcoming
        const ongoingAndUpcoming = trips.filter(t => {
          const start = t.start_date || '';
          const end = t.end_date || '';
          const isOngoing = start && end && today >= start && today <= end;
          const isUpcoming = start && start > today;
          return isOngoing || isUpcoming;
        });

        if (ongoingAndUpcoming.length > 0) {
          // Sort them by priority: ongoing first (latest start date first if multiple), then upcoming (soonest start date first)
          const sorted = [...ongoingAndUpcoming].sort((a, b) => {
            const aStart = a.start_date || '';
            const aEnd = a.end_date || '';
            const bStart = b.start_date || '';
            const bEnd = b.end_date || '';
            
            const aIsOngoing = aStart && aEnd && today >= aStart && today <= aEnd;
            const bIsOngoing = bStart && bEnd && today >= bStart && today <= bEnd;
            
            if (aIsOngoing && !bIsOngoing) return -1;
            if (!aIsOngoing && bIsOngoing) return 1;
            if (aIsOngoing && bIsOngoing) {
              return bStart.localeCompare(aStart);
            }
            // Both are upcoming
            return aStart.localeCompare(bStart);
          });
          
          setActiveTrip(sorted[0]);
          setIsAutoSelected(true);
        } else {
          setActiveTrip(null);
          setIsAutoSelected(false);
        }
      }
    } else {
      setActiveTrip(null);
      setIsAutoSelected(false);
    }
    
    // Set local date string only if not already initialized
    setCurrentDayStr(prev => prev || new Date().toISOString().split('T')[0]);
  }, [trips, forceUpdate]);

  useEffect(() => {
    const handleActiveTripChange = () => {
      setForceUpdate(prev => prev + 1);
    };
    window.addEventListener('active_trip_changed', handleActiveTripChange);
    window.addEventListener('storage', handleActiveTripChange);
    return () => {
      window.removeEventListener('active_trip_changed', handleActiveTripChange);
      window.removeEventListener('storage', handleActiveTripChange);
    };
  }, []);

  // Pull OwnTracks distance data
  const handlePullOwnTracks = async () => {
    if (!activeTrip) return;
    setOwnTracksLoading(true);
    setOwnTracksDistance(null);

    try {
      // Must first trigger sync to push any offline changes to server
      await performSync(token);

      const res = await fetch(`/api/trips/${activeTrip.id}/owntracks-distance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOwnTracksDistance(data.totalKm);
        setDistanceByDay(data.distanceByDay);
      }
    } catch (err) {
      console.error('OwnTracks fetch error:', err);
    } finally {
      setOwnTracksLoading(false);
    }
  };

  const handlePinActiveTrip = async (tripId) => {
    for (const t of trips) {
      const notesObj = safeParseNotes(t.notes);

      const shouldBeActive = t.id.toString() === tripId.toString();
      if (notesObj.isActive !== shouldBeActive) {
        const updatedNotes = { ...notesObj, isActive: shouldBeActive };
        const updatedTrip = {
          ...t,
          notes: JSON.stringify(updatedNotes)
        };
        await queueSyncAction('trips', 'update', updatedTrip);
      }
    }
  };

  const handleQuickExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expAmount || !activeTrip) return;

    let receiptUrl = null;
    
    // If online, upload image immediately, else save as Base64 in local DB or upload later
    if (expFile && navigator.onLine) {
      const formData = new FormData();
      formData.append('file', expFile);
      try {
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          receiptUrl = data.fileUrl;
        }
      } catch (err) {
        console.error('Receipt upload failed:', err);
      }
    }

    const newExpense = {
      id: generateUUID(),
      trip_id: activeTrip.id,
      date: currentDayStr,
      amount: parseFloat(expAmount),
      currency: expCurrency,
      category: expCategory,
      notes: expNotes || 'Quick log',
      receipt_path: receiptUrl,
      is_planned: 0 // Actual
    };

    await queueSyncAction('expenses', 'insert', newExpense);

    // Reset Form
    setExpAmount('');
    setExpNotes('');
    setExpFile(null);
    setShowExpenseModal(false);
  };

  const handleAddTripNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim() || !activeTrip) return;

    const newNote = {
      id: generateUUID(),
      trip_id: activeTrip.id,
      title: noteTitle.trim() || 'Trip Note',
      content: noteContent.trim(),
      category: noteCategory,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await queueSyncAction('trip_notes', 'insert', newNote);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('General');
    setShowTripNoteModal(false);
    showToast('Trip note saved');
  };

  const handleDeleteTripNote = async (id) => {
    await queueSyncAction('trip_notes', 'delete', { id });
    showToast('Trip note removed');
  };

  const handleFindNearbyFood = async (categoryFilter = 'all') => {
    if (!activeTrip) return;
    setFoodSearchLoading(true);
    setShowFoodModal(true);
    setFoodSearchProvider('');
    setFoodSearchError('');

    try {
      let lat = null;
      let lon = null;

      if (navigator.geolocation) {
        try {
          const geoPromise = new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 1500, maximumAge: 60000 });
          });
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1500));
          const pos = await Promise.race([geoPromise, timeoutPromise]);
          if (pos && pos.coords) {
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            setUserCoords({ lat, lon });
          }
        } catch (e) {
          console.warn('Geolocation unavailable or timed out:', e);
        }
      }

      const activeTripItinIds = itineraries.filter(i => i.trip_id === activeTrip.id).map(i => i.place_id);
      const activeTripPlaces = places.filter(p => activeTripItinIds.includes(p.id));

      if ((!lat || !lon) && activeTripPlaces && activeTripPlaces.length > 0) {
        const validPlace = activeTripPlaces.find(p => p.latitude && p.longitude);
        if (validPlace) {
          lat = parseFloat(validPlace.latitude);
          lon = parseFloat(validPlace.longitude);
          setUserCoords({ lat, lon });
        }
      }

      if (!lat || !lon) {
        setNearbyRestaurants([]);
        setFoodSearchError('No current location or trip coordinates found. Please enable GPS.');
        return;
      }

    // Helper for category photo fallback
    const getPhotoForCategory = (cat, typeName = '') => {
      const t = (cat + ' ' + typeName).toLowerCase();
      if (t.includes('cafe') || t.includes('coffee')) {
        return 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=200&h=150&q=80';
      }
      if (t.includes('pizza') || t.includes('fast_food') || t.includes('burger')) {
        return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=200&h=150&q=80';
      }
      if (t.includes('veg') || t.includes('salad')) {
        return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=200&h=150&q=80';
      }
      return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&h=150&q=80';
    };

      let queryKeyword = 'restaurant';
      let amenityType = 'restaurant|cafe|fast_food|food_court';
      if (categoryFilter === 'cafe') {
        queryKeyword = 'cafe';
        amenityType = 'cafe';
      } else if (categoryFilter === 'lunch') {
        queryKeyword = 'lunch';
        amenityType = 'restaurant|fast_food|food_court';
      } else if (categoryFilter === 'dinner') {
        queryKeyword = 'dinner';
        amenityType = 'restaurant|pub';
      } else if (categoryFilter === 'fast_food') {
        queryKeyword = 'fast food';
        amenityType = 'fast_food';
      } else if (categoryFilter === 'veg') {
        queryKeyword = 'vegetarian';
        amenityType = 'restaurant|cafe';
      }

      const apiKey = localStorage.getItem('google_maps_api_key');
      const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

      let results = [];
      let providerUsed = '';
      let googleErrorLogged = '';

      // 1. Try Google Places API (New v1 REST Endpoint) if Key is present
      if (apiKey && googleMapsEnabled) {
        try {
          const googleController = new AbortController();
          const googleTimer = setTimeout(() => googleController.abort(), 4000);

          const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            signal: googleController.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.formattedAddress,places.location,places.types,places.photos'
            },
            body: JSON.stringify({
              includedTypes: ['restaurant', 'cafe', 'bar'],
              maxResultCount: 20,
              locationRestriction: {
                circle: {
                  center: { latitude: lat, longitude: lon },
                  radius: 2000.0
                }
              }
            })
          });
          clearTimeout(googleTimer);

          if (res.ok) {
            const data = await res.json();
            if (data.places && Array.isArray(data.places) && data.places.length > 0) {
              results = data.places.map(p => {
                const rLat = p.location?.latitude || lat;
                const rLon = p.location?.longitude || lon;
                const distKm = getHaversine({ latitude: lat, longitude: lon }, { latitude: rLat, longitude: rLon });
                let photoUrl = getPhotoForCategory(categoryFilter, p.types?.join(' '));
                if (p.photos && p.photos[0] && p.photos[0].name) {
                  photoUrl = `https://places.googleapis.com/v1/${p.photos[0].name}/media?key=${apiKey}&maxHeightPx=200&maxWidthPx=300`;
                }
                return {
                  id: p.id || generateUUID(),
                  name: p.displayName?.text || 'Restaurant',
                  rating: p.rating || 4.3,
                  address: p.formattedAddress || '',
                  lat: rLat,
                  lon: rLon,
                  distanceMeters: Math.round(distKm * 1000),
                  isBookmarked: places.some(pl => pl.name && pl.name.toLowerCase().includes((p.displayName?.text || '').toLowerCase())),
                  types: p.types || [],
                  photoUrl: photoUrl
                };
              });
              providerUsed = 'Google Places (API v1)';
            }
          } else {
            const errText = await res.text().catch(() => '');
            googleErrorLogged = `Google Places API returned status ${res.status}: ${errText.substring(0, 80)}`;
          }
        } catch (err) {
          googleErrorLogged = `Google Places API fetch error: ${err.message}`;
        }
      } else if (googleMapsEnabled && !apiKey) {
        googleErrorLogged = 'Google Maps is enabled in Settings, but no Google Maps API Key was configured.';
      }

      // 2. High-Speed Bounded Nominatim Search around (lat, lon) within 2km box
      if (!results || results.length === 0) {
        try {
          const delta = 0.02; // ~2km box
          const minLon = lon - delta;
          const maxLon = lon + delta;
          const minLat = lat - delta;
          const maxLat = lat + delta;

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(queryKeyword)}&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1&limit=40`;
          const osmRes = await fetch(nomUrl, { signal: controller.signal });
          clearTimeout(timer);

          if (osmRes.ok) {
            const data = await osmRes.json();
            if (Array.isArray(data) && data.length > 0) {
              results = data.map(item => {
                const rLat = parseFloat(item.lat);
                const rLon = parseFloat(item.lon);
                const distKm = getHaversine({ latitude: lat, longitude: lon }, { latitude: rLat, longitude: rLon });
                const name = item.display_name.split(',')[0];
                return {
                  id: item.place_id || generateUUID(),
                  name: name,
                  rating: 4.3,
                  address: item.display_name,
                  lat: rLat,
                  lon: rLon,
                  distanceMeters: Math.round(distKm * 1000),
                  isBookmarked: places.some(p => p.name && p.name.toLowerCase().includes(name.toLowerCase())),
                  types: [item.type || item.class || 'restaurant'],
                  photoUrl: getPhotoForCategory(categoryFilter, item.type || item.class || '')
                };
              });
              providerUsed = 'OpenStreetMap (Nominatim)';
            }
          }
        } catch (e) {
          console.warn('Nominatim search warning:', e);
        }
      }

      // 3. Overpass API Node Search fallback
      if (!results || results.length === 0) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const opQuery = `[out:json][timeout:5];node["amenity"~"${amenityType}"](around:2000,${lat},${lon});out 35;`;
          const opUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(opQuery)}`;
          const opRes = await fetch(opUrl, { signal: controller.signal });
          clearTimeout(timer);

          if (opRes.ok) {
            const opData = await opRes.json();
            if (opData && Array.isArray(opData.elements) && opData.elements.length > 0) {
              results = opData.elements
                .filter(el => el.tags && (el.tags.name || el.tags['name:en']))
                .map(el => {
                  const rLat = el.lat;
                  const rLon = el.lon;
                  const distKm = getHaversine({ latitude: lat, longitude: lon }, { latitude: rLat, longitude: rLon });
                  const name = el.tags.name || el.tags['name:en'] || 'Nearby Spot';
                  const address = [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', ') || 'Nearby Spot';
                  return {
                    id: `osm-${el.id}`,
                    name: name,
                    rating: 4.2,
                    address: address,
                    lat: rLat,
                    lon: rLon,
                    distanceMeters: Math.round(distKm * 1000),
                    isBookmarked: places.some(p => p.name && p.name.toLowerCase().includes(name.toLowerCase())),
                    types: [el.tags.amenity || 'restaurant'],
                    photoUrl: getPhotoForCategory(categoryFilter, el.tags.amenity || '')
                  };
                });
              providerUsed = 'OpenStreetMap (Overpass)';
            }
          }
        } catch (e) {
          console.warn('Overpass API query warning:', e);
        }
      }

      // Filter STRICTLY within 2km (2000 meters) and sort by distance
      const filteredWithin2Km = (results || [])
        .filter(r => r.distanceMeters <= 2000)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      setFoodSearchProvider(providerUsed || 'OpenStreetMap');
      if (googleMapsEnabled && providerUsed !== 'Google Places (API v1)') {
        setFoodSearchError(googleErrorLogged || 'Google Places API request returned no results or was denied. Reverted to OpenStreetMap.');
      } else {
        setFoodSearchError('');
      }

      setNearbyRestaurants(filteredWithin2Km.slice(0, 20));
    } catch (err) {
      console.error('Failed to find food:', err);
    } finally {
      setFoodSearchLoading(false);
    }
  };

  // Date list helper
  const getItineraryDays = (trip) => {
    if (!trip) return [];
    const len = trip.length || 1;
    const days = [];
    for (let i = 1; i <= len; i++) {
      let dateStr = `Day ${i}`;
      let actualDate = '';
      if (trip.start_date && trip.start_date !== 'null' && !isNaN(Date.parse(trip.start_date))) {
        const startDateObj = new Date(trip.start_date);
        startDateObj.setDate(startDateObj.getDate() + (i - 1));
        actualDate = startDateObj.toISOString().split('T')[0];
        dateStr = `Day ${i} (${actualDate})`;
      }
      days.push({
        dayNumber: i,
        label: dateStr,
        date: actualDate || `Day ${i}`
      });
    }
    return days;
  };

  const formatStartDate = (date) => {
    if (!date || date === 'null' || date === 'undefined') return 'No Date Set';
    return date;
  };

  const currentTrip = useMemo(() => {
    if (activeTrip) {
      const found = trips.find(t => String(t.id) === String(activeTrip.id));
      if (found) return found;
    }
    if (trips.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const dbActiveTrip = trips.find(t => {
      const notesObj = safeParseNotes(t.notes);
      return notesObj.isActive === true;
    });
    if (dbActiveTrip) return dbActiveTrip;
    const ongoingAndUpcoming = trips.filter(t => {
      const start = t.start_date || '';
      const end = t.end_date || '';
      const isOngoing = start && end && today >= start && today <= end;
      const isUpcoming = start && start > today;
      return isOngoing || isUpcoming;
    });
    if (ongoingAndUpcoming.length > 0) {
      const sorted = [...ongoingAndUpcoming].sort((a, b) => {
        const aStart = a.start_date || '';
        const aEnd = a.end_date || '';
        const bStart = b.start_date || '';
        const bEnd = b.end_date || '';
        const aIsOngoing = aStart && aEnd && today >= aStart && today <= aEnd;
        const bIsOngoing = bStart && bEnd && today >= bStart && today <= bEnd;
        if (aIsOngoing && !bIsOngoing) return -1;
        if (!aIsOngoing && bIsOngoing) return 1;
        if (aIsOngoing && bIsOngoing) return bStart.localeCompare(aStart);
        return aStart.localeCompare(bStart);
      });
      return sorted[0];
    }
    return trips[0] || null;
  }, [activeTrip, trips]);

  const itineraryDays = getItineraryDays(currentTrip);

  // Determine active date showing in UI
  const displayDayStr = itineraryDays.map(d => d.date).includes(currentDayStr) ? currentDayStr : (itineraryDays[0]?.date || '');
  const activeDayObj = itineraryDays.find(d => d.date === displayDayStr);

  // Active day stops matching date, label, or Day N
  const activeDayStops = useMemo(() => {
    if (!currentTrip) return [];
    return itineraries.filter(i => {
      if (String(i.trip_id) !== String(currentTrip.id)) return false;
      if (i.date === displayDayStr) return true;
      if (activeDayObj && i.date === activeDayObj.label) return true;
      if (activeDayObj && typeof i.date === 'string' && i.date.startsWith('Day ') && activeDayObj.dayNumber === parseInt(i.date.replace('Day ', ''), 10)) return true;
      return false;
    }).sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
  }, [itineraries, currentTrip, displayDayStr, activeDayObj]);

  const sortedActivePlaces = useMemo(() => {
    if (!currentTrip) return [];
    const activePlaces = places.filter(p => p.is_folder !== 1);
    return [...activePlaces].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [places, currentTrip]);

  const findUserAddress = (addrId) => {
    if (!addrId || !Array.isArray(userAddresses)) return null;
    const strId = String(addrId).trim();
    return userAddresses.find(a => 
      String(a.id) === strId || 
      `home_${a.id}` === strId || 
      (a.label && a.label.toLowerCase() === strId.toLowerCase()) || 
      (a.address && a.address.toLowerCase() === strId.toLowerCase())
    ) || null;
  };

  const activeDayIndex = useMemo(() => {
    if (!itineraryDays || itineraryDays.length === 0) return 0;
    const idx = itineraryDays.findIndex(d => 
      d.date === displayDayStr || 
      d.label === displayDayStr || 
      (typeof displayDayStr === 'string' && displayDayStr.startsWith('Day ') && d.dayNumber === parseInt(displayDayStr.replace('Day ', ''), 10))
    );
    return idx !== -1 ? idx : 0;
  }, [itineraryDays, displayDayStr]);

  const currentDayColor = activeDayIndex !== -1 ? getDayColor(activeDayIndex) : 'var(--accent-primary)';
  const isFirstDay = activeDayIndex === 0;
  const isLastDay = activeDayIndex === itineraryDays.length - 1;

  const notesObj = safeParseNotes(currentTrip?.notes);
  const hotelsObj = notesObj.hotels || {};
  const dayEndpoints = notesObj.dayEndpoints || {};
  const dayStayBehaviors = notesObj.dayStayBehaviors || {};
  const segmentTransport = notesObj.segmentTransport || {};
  const dayLocations = notesObj.dayLocations || {};

  const dayEndpointConfig = dayEndpoints[displayDayStr] || (activeDayObj ? dayEndpoints[activeDayObj.label] : null) || (activeDayObj ? dayEndpoints[`Day ${activeDayObj.dayNumber}`] : null) || {};
  const startFromHome = dayEndpointConfig.startFromHome ?? (isFirstDay && Boolean(currentTrip?.start_address_id));
  const lastDayGoHome = dayEndpointConfig.lastDayGoHome ?? (isLastDay && Boolean(currentTrip?.stop_address_id));
  const stayBehavior = dayStayBehaviors[displayDayStr] || (activeDayObj ? dayStayBehaviors[activeDayObj.label] : null) || (activeDayObj ? dayStayBehaviors[`Day ${activeDayObj.dayNumber}`] : null) || 'stay_night';

  const hotelPlaceId = hotelsObj[displayDayStr] || (activeDayObj ? hotelsObj[activeDayObj.label] : null) || (activeDayObj ? hotelsObj[`Day ${activeDayObj.dayNumber}`] : null);
  const hotelPlace = hotelPlaceId ? combinedPlaces.find(p => String(p.id) === String(hotelPlaceId)) : null;
  const startAddrObj = (isFirstDay && currentTrip?.start_address_id && startFromHome) ? findUserAddress(currentTrip.start_address_id) : null;
  const stopAddrObj = (isLastDay && currentTrip?.stop_address_id && lastDayGoHome) ? findUserAddress(currentTrip.stop_address_id) : null;

  const assignedDayLocId = dayLocations[displayDayStr] || (activeDayObj ? dayLocations[activeDayObj.label] : null) || (activeDayObj ? dayLocations[`Day ${activeDayObj.dayNumber}`] : null) || '';
  const assignedDayLocName = (locations || []).find(l => String(l.id) === String(assignedDayLocId))?.name || '';

  // Assemble complete day elements in chronological flow
  const dayElements = useMemo(() => {
    const elems = [];

    // 1. Start from Home (Day 1)
    if (isFirstDay && startAddrObj) {
      elems.push({
        place: {
          ...startAddrObj,
          id: `home_start_${startAddrObj.id}`,
          name: `🏠 Start: ${startAddrObj.label}`,
          category: 'Home Address',
          latitude: (startAddrObj.latitude !== null && startAddrObj.latitude !== undefined && startAddrObj.latitude !== '' && !isNaN(Number(startAddrObj.latitude))) ? parseFloat(startAddrObj.latitude) : null,
          longitude: (startAddrObj.longitude !== null && startAddrObj.longitude !== undefined && startAddrObj.longitude !== '' && !isNaN(Number(startAddrObj.longitude))) ? parseFloat(startAddrObj.longitude) : null,
          is_home: true
        },
        isFixedEndpoint: true,
        endpointType: 'start_home',
        label: `🏠 Start from Home (${startAddrObj.label})`
      });
    }

    // 2. Depart Stay (only on Day 2+ for stay_night or checkout)
    if (!isFirstDay && hotelPlace && (stayBehavior === 'stay_night' || stayBehavior === 'checkout')) {
      const firstItemIsHotel = activeDayStops.length > 0 && String(activeDayStops[0].place_id) === String(hotelPlace.id);
      if (!firstItemIsHotel) {
        elems.push({
          place: hotelPlace,
          isFixedEndpoint: true,
          endpointType: 'stay_origin',
          label: stayBehavior === 'checkout' ? `🏨 Checkout: ${hotelPlace.name}` : `🏨 Stay: ${hotelPlace.name}`
        });
      }
    }

    // 3. Sightseeing Stops
    activeDayStops.forEach(item => {
      const stopPlace = combinedPlaces.find(p => String(p.id) === String(item.place_id)) || {
        id: item.place_id || item.id,
        name: item.notes || 'Scheduled Stop',
        category: 'Sightseeing'
      };
      elems.push({ place: stopPlace, itemObj: item, isHotel: false });
    });

    // 4. Closing Endpoints (Go Home or Return to Stay)
    if (isLastDay && stopAddrObj) {
      elems.push({
        place: {
          ...stopAddrObj,
          id: `home_stop_${stopAddrObj.id}`,
          name: `🏠 Stop: ${stopAddrObj.label}`,
          category: 'Home Address',
          latitude: (stopAddrObj.latitude !== null && stopAddrObj.latitude !== undefined && stopAddrObj.latitude !== '' && !isNaN(Number(stopAddrObj.latitude))) ? parseFloat(stopAddrObj.latitude) : null,
          longitude: (stopAddrObj.longitude !== null && stopAddrObj.longitude !== undefined && stopAddrObj.longitude !== '' && !isNaN(Number(stopAddrObj.longitude))) ? parseFloat(stopAddrObj.longitude) : null,
          is_home: true
        },
        isFixedEndpoint: true,
        endpointType: 'stop_home',
        label: `🏠 Last Day (${stopAddrObj.label})`
      });
    } else if (hotelPlace && (stayBehavior === 'stay_night' || stayBehavior === 'late_checkin')) {
      const lastItem = activeDayStops[activeDayStops.length - 1];
      const lastItemIsHotel = lastItem && String(lastItem.place_id) === String(hotelPlace.id);
      if (!lastItemIsHotel) {
        elems.push({
          place: hotelPlace,
          isFixedEndpoint: true,
          endpointType: 'stay_return',
          label: stayBehavior === 'late_checkin' ? `🏨 Late Check-in: ${hotelPlace.name}` : `🏨 Stay: ${hotelPlace.name}`
        });
      }
    }

    return elems;
  }, [isFirstDay, isLastDay, startAddrObj, stopAddrObj, hotelPlace, stayBehavior, activeDayStops, combinedPlaces]);

  // Compute segment distances across dayElements
  const distancesList = useMemo(() => {
    const list = [];
    for (let i = 1; i < dayElements.length; i++) {
      const p1 = dayElements[i - 1].place;
      const p2 = dayElements[i].place;
      if (p1 && p2) {
        const segKey = `${displayDayStr}_${p1.id}_${p2.id}`;
        const segConfig = segmentTransport[segKey] || {};
        const mode = segConfig.mode || 'drive';

        if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) {
          list.push({ distance: 0, duration: 0, mode });
          continue;
        }

        if (mode === 'flight') {
          const hav = Math.round(getHaversine(p1, p2) * 10) / 10;
          const customDur = segConfig.durationMinutes ? parseInt(segConfig.durationMinutes, 10) : Math.round(hav / 800 * 60) + 60;
          list.push({ distance: hav, duration: customDur, mode: 'flight', notes: segConfig.notes });
        } else if (mode === 'train' || mode === 'ferry') {
          const hav = Math.round(getHaversine(p1, p2) * 10) / 10;
          const customDur = segConfig.durationMinutes ? parseInt(segConfig.durationMinutes, 10) : Math.round(hav / (mode === 'train' ? 100 : 30) * 60);
          list.push({ distance: hav, duration: customDur, mode, notes: segConfig.notes });
        } else {
          const key = `${p1.id}-${p2.id}`;
          let distObj = distances[key];
          if (distObj === undefined) {
            fetchOSRMDistance(p1, p2);
            const hav = getHaversine(p1, p2);
            distObj = { distance: hav, duration: Math.round(hav / 40 * 60), mode };
          } else if (typeof distObj === 'object') {
            distObj = { ...distObj, mode };
          } else {
            distObj = { distance: distObj, duration: 0, mode };
          }
          if (segConfig.durationMinutes) {
            distObj = { ...distObj, duration: parseInt(segConfig.durationMinutes, 10), notes: segConfig.notes };
          }
          list.push(distObj);
        }
      } else {
        list.push({ distance: 0, duration: 0, mode: 'drive' });
      }
    }
    return list;
  }, [dayElements, distances, segmentTransport, displayDayStr]);

  // Persist uncalculated distances to local database
  useEffect(() => {
    if (!currentTrip || activeDayStops.length < 2 || combinedPlaces.length === 0) return;

    const runRecalculate = async () => {
      for (let idx = 1; idx < activeDayStops.length; idx++) {
        const currentItem = activeDayStops[idx];
        const prevItem = activeDayStops[idx - 1];
        const p1 = combinedPlaces.find(p => p.id === prevItem.place_id);
        const p2 = combinedPlaces.find(p => p.id === currentItem.place_id);
        if (p1 && p2) {
          let expectedDistance = 0;
          let expectedDuration = 0;

          const key = `${p1.id}-${p2.id}`;
          if (distances[key] !== undefined) {
            const distObj = distances[key];
            if (typeof distObj === 'object') {
              expectedDistance = parseFloat(distObj.distance) || 0;
              expectedDuration = parseFloat(distObj.duration) || 0;
            } else {
              expectedDistance = parseFloat(distObj) || 0;
              expectedDuration = 0;
            }
          } else {
            fetchOSRMDistance(p1, p2);
            continue;
          }

          const needsRecalculate = currentItem.distance_from_prev === null || 
                                   currentItem.distance_from_prev === undefined ||
                                   currentItem.distance_from_prev === -1;
          
          if (!needsRecalculate) continue;

          await queueSyncAction('itinerary_items', 'update', {
            ...currentItem,
            distance_from_prev: expectedDistance,
            duration_from_prev: expectedDuration
          });
        }
      }
    };

    runRecalculate();
  }, [currentTrip, activeDayStops, combinedPlaces, distances]);

  const isCurrentlyActive = currentTrip && (() => {
    const notesObj = safeParseNotes(currentTrip.notes);
    return notesObj.isActive === true;
  })();

  return (
    <div className="container" style={{ maxWidth: '480px', padding: '16px' }}>
      
      {/* Auto-selected banner */}
      {currentTrip && isAutoSelected && !isCurrentlyActive && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.15)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Showing <strong>{currentTrip.name}</strong> based on current date.
          </span>
          <button 
            className="btn btn-primary"
            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: '28px' }}
            onClick={() => handlePinActiveTrip(currentTrip.id)}
          >
            Pin active
          </button>
        </div>
      )}

      {currentTrip ? (
        <div>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{currentTrip.name}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                  {formatStartDate(currentTrip.start_date)} ({currentTrip.length || 1} {currentTrip.length === 1 ? 'day' : 'days'})
                </p>

                {/* Companion Tags */}
                {(() => {
                  let compIds = [];
                  try {
                    compIds = typeof currentTrip.companions === 'string' ? JSON.parse(currentTrip.companions) : (currentTrip.companions || []);
                  } catch (e) {
                    compIds = [];
                  }
                  if (!Array.isArray(compIds) || compIds.length === 0) return null;
                  const matched = people.filter(p => compIds.includes(p.id));
                  if (matched.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👥 Travelers:</span>
                      {matched.map(p => (
                        <span key={p.id} style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', padding: '1px 6px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                          {p.name} ({p.relation})
                        </span>
                      ))}
                    </div>
                  );
                })()}


              </div>

              {/* Quick Action Toolbar */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setShowExpenseModal(true)}
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <DollarSign size={14} /> Log Expense
                </button>
                <button 
                  onClick={() => handleFindNearbyFood('all')}
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}
                >
                  <Utensils size={14} /> Find Nearby Food
                </button>
                <button 
                  onClick={() => setShowTripNoteModal(true)}
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <FileText size={14} /> Add Note
                </button>
              </div>
            </div>

            {/* Budget Tracker Progress */}
            {(() => {
              const tripExps = expenses.filter(e => String(e.trip_id) === String(currentTrip.id));
              const tripRates = rates.filter(r => String(r.trip_id) === String(currentTrip.id));
              let baseCur = userBaseCurrency || 'USD';
              if (currentTrip.notes) {
                const parsed = safeParseNotes(currentTrip.notes);
                if (parsed.baseCurrency) baseCur = parsed.baseCurrency;
              }

              let totalSpent = 0;
              tripExps.forEach(e => {
                let amt = parseFloat(e.amount) || 0;
                if (e.currency && e.currency !== baseCur) {
                  const matchedRate = tripRates.find(r => r.currency === e.currency);
                  if (matchedRate && matchedRate.rate) {
                    amt = amt * matchedRate.rate;
                  }
                }
                totalSpent += amt;
              });

              let plannedBudget = 0;
              if (currentTrip.notes) {
                const parsed = safeParseNotes(currentTrip.notes);
                if (parsed.plannedBudget) plannedBudget = parseFloat(parsed.plannedBudget) || 0;
              }

              const pct = plannedBudget > 0 ? (totalSpent / plannedBudget) * 100 : 0;

              return (
                <div style={{ marginTop: '14px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                    <span>Total Spent: <b style={{ color: 'var(--accent-primary-hover)' }}>{totalSpent.toFixed(2)} {baseCur}</b></span>
                    <span>Budget Limit: <b>{plannedBudget > 0 ? `${plannedBudget.toFixed(2)} ${baseCur}` : 'No limit set'}</b></span>
                  </div>
                  {plannedBudget > 0 && (
                    <div className="budget-progress-container" style={{ height: '6px' }}>
                      <div 
                        className={`budget-progress-bar ${totalSpent > plannedBudget ? 'over' : ''}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* OwnTracks Distance logging */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distance Traveled Today</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                  {distanceByDay[displayDayStr] !== undefined ? `${distanceByDay[displayDayStr]} km` : (ownTracksDistance !== null ? `${ownTracksDistance} km (Total)` : 'Not pulled')}
                </span>
              </div>
              <button 
                onClick={handlePullOwnTracks} 
                disabled={ownTracksLoading}
                className="photo-action-btn"
                style={{ background: 'var(--accent-primary)', width: 'auto', padding: '6px 12px', color: '#000', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {ownTracksLoading ? <RefreshCw size={12} className="sync-spinner" /> : <Navigation size={12} />}
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Pull GPS</span>
              </button>
            </div>
          </div>

          {/* Today's Stops */}
          <div style={{ marginBottom: '20px' }}>
            {/* Row 1: Day Title and Day (Date) Selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (assignedDayLocName || hotelPlace) ? '8px' : '12px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>
                {activeDayObj ? activeDayObj.label.split(' (')[0] : displayDayStr}
              </h3>
              {itineraryDays.length > 1 && (
                <select 
                  value={displayDayStr} 
                  onChange={(e) => setCurrentDayStr(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary-hover)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                >
                  {itineraryDays.map(day => (
                    <option key={day.date} value={day.date}>{day.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Row 2: Location and Stay Badges */}
            {(assignedDayLocName || hotelPlace) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {assignedDayLocName && (
                  <span 
                    title={assignedDayLocName}
                    style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--accent-primary)', 
                      background: 'rgba(139, 92, 246, 0.15)', 
                      padding: '3px 8px', 
                      borderRadius: '4px', 
                      fontWeight: '600',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📍 {assignedDayLocName}
                  </span>
                )}
                {hotelPlace && (
                  <span 
                    title={`Stay: ${hotelPlace.name}`}
                    style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--text-secondary)', 
                      background: 'rgba(255,255,255,0.05)', 
                      padding: '3px 8px', 
                      borderRadius: '4px', 
                      border: '1px solid var(--border-glass)',
                      maxWidth: '260px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'inline-block'
                    }}
                  >
                    🏨 Stay: {hotelPlace.name}
                  </span>
                )}
              </div>
            )}

            {dayElements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}>
                <MapPin size={24} style={{ marginBottom: '8px', color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '0.85rem' }}>No stops logged for this date.</p>
              </div>
            ) : (
              <div className="timeline" style={{ paddingLeft: '16px' }}>
                {dayElements.map((el, idx) => {
                  const place = el.place;
                  const dist = distancesList[idx - 1];
                  const isHomePlace = el.endpointType?.includes('home') || place?.is_home === true;
                  const isVisited = place && place.visited === 1;

                  const isAppleDevice = typeof window !== 'undefined' && 
                    (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || 
                     (navigator.userAgent.includes('Mac') && 'ontouchend' in document));
                  const navPref = localStorage.getItem('navigation_provider') || 'google';
                  const actualProvider = isAppleDevice ? navPref : 'google';

                  const handleNavigate = () => {
                    if (!place) return;
                    const query = (place.latitude && place.longitude) 
                      ? `${place.latitude},${place.longitude}` 
                      : (place.address || place.name);
                    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                    if (actualProvider === 'apple') {
                      url = `maps://?q=${encodeURIComponent(place.name)}`;
                      if (place.latitude && place.longitude) {
                        url += `&ll=${place.latitude},${place.longitude}`;
                      }
                    }
                    window.open(url, '_blank');
                  };

                  return (
                    <div key={`${place?.id || 'elem'}-${idx}`} className="timeline-item" style={{ paddingBottom: '16px' }}>
                      {idx > 0 && dist !== undefined && (() => {
                        const isUsingGmaps = typeof window !== 'undefined' && 
                          localStorage.getItem('google_maps_api_key') && 
                          localStorage.getItem('google_maps_enabled') !== 'false';
                        const distVal = typeof dist === 'object' ? dist.distance : dist;
                        const durVal = typeof dist === 'object' ? dist.duration : 0;
                        const mode = typeof dist === 'object' ? (dist.mode || 'drive') : 'drive';
                        const modeIcon = mode === 'walk' ? '🚶' : (mode === 'flight' ? '✈️' : (mode === 'train' ? '🚆' : (mode === 'ferry' ? '⛴️' : '🚗')));

                        return (
                          <div className="timeline-distance" style={{ marginBottom: '8px', fontSize: '0.75rem', color: 'var(--accent-primary-hover)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span>{modeIcon}</span>
                            <img 
                              src={isUsingGmaps ? "/gmaps.png" : "/osm.png"} 
                              style={{ width: 12, height: 12, objectFit: 'contain' }} 
                              alt={isUsingGmaps ? "GMaps" : "OSM"}
                              title={isUsingGmaps ? "Route calculated via Google Maps" : "Route calculated via OpenStreetMap (OSRM)"}
                            />
                            <span>
                              {distVal} km{durVal > 0 ? ` (${formatDuration(durVal)})` : ''}
                            </span>
                          </div>
                        );
                      })()}

                      {el.isFixedEndpoint ? (
                        <div style={{
                          background: isHomePlace ? 'var(--endpoint-bg, rgba(74, 222, 128, 0.08))' : 'rgba(139, 92, 246, 0.08)',
                          border: isHomePlace ? '1px solid var(--endpoint-border, rgba(74, 222, 128, 0.35))' : `1px solid ${currentDayColor}`,
                          padding: '10px 12px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: isHomePlace ? 'var(--endpoint-color, #15803d)' : 'var(--accent-secondary)',
                          fontWeight: 600,
                          fontSize: '0.85rem'
                        }}>
                          <span>{el.label}</span>
                          {place && (
                            <button 
                              onClick={handleNavigate}
                              title={`Navigate using ${actualProvider === 'apple' ? 'Apple Maps' : 'Google Maps'}`}
                              style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                            >
                              <Navigation size={12} style={{ color: isHomePlace ? 'var(--endpoint-color, #15803d)' : 'var(--accent-secondary)' }} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="timeline-card" style={{ padding: '12px', background: 'var(--bg-surface-elevated)', border: isHomePlace ? '1px solid rgba(74, 222, 128, 0.4)' : (isVisited ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid var(--border-glass)') }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                              const placeIdx = sortedActivePlaces.findIndex(x => x.id === place?.id);
                              const placeNum = placeIdx !== -1 ? placeIdx + 1 : (idx + 1);
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: isHomePlace ? '#4ade80' : (isVisited ? 'var(--success)' : currentDayColor),
                                    color: isHomePlace ? '#000' : '#fff',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    {isHomePlace ? '🏠' : placeNum}
                                  </span>
                                  <b style={{ fontSize: '0.95rem', textDecoration: isVisited ? 'line-through' : 'none', color: isVisited ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                    {place ? place.name : 'Unknown Stop'}
                                  </b>
                                </div>
                              );
                            })()}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {place && (
                                <button 
                                  onClick={handleNavigate}
                                  title={`Navigate using ${actualProvider === 'apple' ? 'Apple Maps' : 'Google Maps'}`}
                                  style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                                >
                                  <Navigation size={12} style={{ color: 'var(--accent-secondary)' }} />
                                </button>
                              )}
                              {place && !isVisited && (
                                <button 
                                  onClick={async () => {
                                    await queueSyncAction('places', 'update', { ...place, visited: 1 });
                                    const parentLoc = locations.find(l => l.id === place.location_id);
                                    if (parentLoc && parentLoc.visited !== 1) {
                                      await queueSyncAction('locations', 'update', { ...parentLoc, visited: 1 });
                                    }
                                  }}
                                  title="Mark Done"
                                  style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', height: '24px' }}
                                >
                                  <Check size={12} style={{ color: 'var(--success)' }} />
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)' }}>Done</span>
                                </button>
                              )}
                              {isVisited && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold' }}>
                                  <Check size={12} /> Visited
                                </span>
                              )}
                            </div>
                          </div>
                          {place && <span style={{ fontSize: '0.7rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{place.category}</span>}
                          {place && place.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{place.notes}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            {/* Daily Reservations */}
            {(() => {
              const activeDayReservations = reservations.filter(r => {
                if (!currentTrip || String(r.trip_id) !== String(currentTrip.id)) return false;
                try {
                  const details = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
                  return details && details.date === displayDayStr;
                } catch (e) {
                  return false;
                }
              });

              if (activeDayReservations.length === 0) return null;

              return (
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--border-glass)' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📅 Reservations for Today
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {activeDayReservations.map(res => {
                      const details = typeof res.details === 'string' ? JSON.parse(res.details) : res.details || {};
                      return (
                        <div key={res.id} style={{ padding: '12px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-secondary)', textTransform: 'uppercase' }}>
                              {res.type}
                            </span>
                            {res.file_path && (
                              <button 
                                onClick={() => setActivePdfUrl(res.file_path)}
                                style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.65rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                              >
                                View Ticket
                              </button>
                            )}
                          </div>
                          <b style={{ display: 'block', fontSize: '0.9rem', margin: '4px 0', color: 'var(--text-primary)' }}>{res.title}</b>
                          {details.confirmation && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Conf #: <strong>{details.confirmation}</strong>
                            </div>
                          )}
                          {details.notes && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{details.notes}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Trip Notes & Travel Journal Section */}
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} style={{ color: 'var(--accent-primary)' }} /> Trip Notes & Journal
                </h3>
                <button 
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setShowTripNoteModal(true)}
                >
                  <Plus size={12} /> Add Note
                </button>
              </div>

              {(() => {
                const currentNotes = tripNotes.filter(n => currentTrip && String(n.trip_id) === String(currentTrip.id));
                if (currentNotes.length === 0) {
                  return (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                      No notes logged yet. Tap "+ Add Note" to save flight numbers, hotel details, or daily reflections!
                    </p>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {currentNotes.map(note => (
                      <div key={note.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: 'var(--text-primary)' }}>{note.title || 'Trip Note'}</span>
                          <button className="photo-action-btn" onClick={() => handleDeleteTripNote(note.id)} title="Delete Note">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary-hover)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600, display: 'inline-block', marginBottom: '6px' }}>
                          {note.category || 'General'}
                        </span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                          {note.content}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
        <div className="empty-state">
          <Calendar size={48} className="empty-state-icon" />
          <h3>No Active Trips</h3>
          <p>Please switch back to Planning Mode and create a trip to unlock Trip Mode features.</p>
        </div>
      )}

      {/* Floating Action Button (Quick Expense Logger) */}
      {currentTrip && (
        <button 
          onClick={() => setShowExpenseModal(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px',
            width: '60px', height: '60px', borderRadius: '50%',
            background: 'var(--accent-primary)', color: 'black',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
            border: 'none', cursor: 'pointer', zIndex: 100
          }}
        >
          <DollarSign size={28} />
        </button>
      )}

      {/* Quick Expense Modal dialog overlay */}
      {showExpenseModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '420px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Quick Expense</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowExpenseModal(false)} />
            </div>

            <form onSubmit={handleQuickExpenseSubmit}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Amount</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="form-control"
                    placeholder="0.00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Currency</label>
                  <select className="form-control" value={expCurrency} onChange={(e) => setExpCurrency(e.target.value)}>
                    {STANDARD_CURRENCIES.concat(rates.filter(r => currentTrip && String(r.trip_id) === String(currentTrip.id)).map(r => r.currency))
                      .filter((cur, idx, self) => self.indexOf(cur) === idx)
                      .map(cur => (
                        <option key={cur} value={cur}>{cur}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select className="form-control" value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                  <option value="Food">🍽️ Food / Dining</option>
                  <option value="Snacks">☕ Snacks / Cafe</option>
                  <option value="Lunch">🍲 Lunch</option>
                  <option value="Dinner">🍽️ Dinner</option>
                  <option value="Transportation">🚕 Transport / Taxi</option>
                  <option value="Fuel">⛽ Fuel</option>
                  <option value="Hotel">🏨 Hotel / Stay</option>
                  <option value="Entertainment">🎟️ Ticket / Entry</option>
                  <option value="Other">💼 Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Notes / Tag</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. coffee, bus ticket..."
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Add Receipt Photo (Optional)</label>
                <input
                  type="file"
                  id="quick-exp-file"
                  className="form-control"
                  onChange={(e) => setExpFile(e.target.files[0])}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Nearby Food Finder Modal */}
      {showFoodModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '560px', width: '100%', padding: '24px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Utensils size={20} style={{ color: '#f59e0b' }} /> Nearby Food (Within 2 km)
                </h3>
                {foodSearchProvider && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                    Data Source: <strong style={{ color: foodSearchProvider === 'Google Places' ? '#4ade80' : 'var(--accent-primary)' }}>{foodSearchProvider}</strong>
                  </span>
                )}
              </div>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowFoodModal(false)} />
            </div>

            {/* Error Warning Banner */}
            {foodSearchError && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#f59e0b',
                marginBottom: '12px'
              }}>
                ⚠️ {foodSearchError}
              </div>
            )}



            {/* Results Container */}
            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {foodSearchLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="sync-spinner" style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Searching food spots within 2 km...</p>
                </div>
              ) : nearbyRestaurants.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Compass size={32} style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>No restaurants found within 2 km of your current location. Try switching category filters or enabling GPS.</p>
                </div>
              ) : (
                nearbyRestaurants.map(r => (
                  <div key={r.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Place Photo Thumbnail */}
                    {r.photoUrl && (
                      <img 
                        src={r.photoUrl} 
                        alt={r.name} 
                        style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-glass)' }} 
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        {r.isBookmarked && (
                          <span style={{ backgroundColor: 'rgba(74, 222, 128, 0.2)', color: '#4ade80', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                            ★ Saved
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        <span style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>
                          📍 {r.distanceMeters < 1000 ? `${r.distanceMeters}m away` : `${(r.distanceMeters / 1000).toFixed(1)} km away`}
                        </span>
                        <span>⭐ {r.rating}</span>
                      </div>
                      {r.address && <p style={{ fontSize: '0.71rem', color: 'var(--text-muted)', margin: '3px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address}</p>}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.75rem', width: 'auto' }}
                        onClick={() => {
                          const query = (r.lat && r.lon) ? `${r.lat},${r.lon}` : r.name;
                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                        }}
                      >
                        🗺️ Maps
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '0.75rem', width: 'auto' }}
                        onClick={async () => {
                          const newPlaceId = generateUUID();
                          const newPlace = {
                            id: newPlaceId,
                            location_id: locations[0]?.id || '',
                            name: r.name,
                            category: 'restaurant',
                            latitude: r.lat,
                            longitude: r.lon,
                            address: r.address,
                            visited: 0
                          };
                          await queueSyncAction('places', 'insert', newPlace);
                          await queueSyncAction('itinerary_items', 'insert', {
                            id: generateUUID(),
                            trip_id: currentTrip.id,
                            date: currentDayStr || 'Day 1',
                            place_id: newPlaceId,
                            sequence_order: (itineraries.filter(i => String(i.trip_id) === String(currentTrip.id)).length + 1)
                          });
                          alert(`Added "${r.name}" to today's itinerary!`);
                        }}
                      >
                        + Add Stop
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Trip Note Modal Dialog */}
      {showTripNoteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} style={{ color: 'var(--accent-primary)' }} /> Add Trip Note
              </h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowTripNoteModal(false)} />
            </div>

            <form onSubmit={handleAddTripNote} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Flight Info, Hotel Check-in..."
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Category</label>
                <select
                  className="form-control"
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value)}
                >
                  <option value="General">📝 General Note</option>
                  <option value="Flight">✈️ Flight / Transit</option>
                  <option value="Hotel">🏨 Hotel / Lodging</option>
                  <option value="Packing">🎒 Packing List</option>
                  <option value="Journal">📖 Travel Journal</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Note Details *</label>
                <textarea
                  className="form-control"
                  rows="4"
                  required
                  placeholder="Write notes, hotel instructions, or travel journal reflections..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTripNoteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!noteContent.trim()}>
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activePdfUrl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-app)', zIndex: 2000
        }}>
          <button 
            onClick={() => setActivePdfUrl(null)} 
            style={{ 
              position: 'absolute', 
              top: '16px', 
              right: '16px', 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%', 
              background: 'rgba(0, 0, 0, 0.5)', 
              color: '#fff', 
              border: '1px solid rgba(255, 255, 255, 0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              zIndex: 2010,
              fontSize: '18px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)'
            }}
            title="Close"
          >
            ✕
          </button>
          <iframe 
            src={activePdfUrl} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title="PDF Document Viewer"
          />
        </div>
      )}

      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(99, 102, 241, 0.3)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.88rem',
          fontWeight: 600,
          backdropFilter: 'blur(10px)',
          animation: 'slideUpFade 0.25s ease-out'
        }}>
          <span>✅</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
