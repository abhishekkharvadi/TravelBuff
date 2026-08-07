import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Calendar, MapPin, Plus, Trash2, Tag, Receipt, 
  ChevronRight, Printer, AlertTriangle, FileText, 
  Map, Edit, CheckSquare, X, DollarSign, RefreshCw, Star, Compass 
} from 'lucide-react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { trackApiCall } from '../utils/apiTracker.js';
import { loadGoogleMaps } from '../utils/googleMapsLoader.js';
import MapView from './MapView.jsx';

const dayColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];

const SearchableSelect = ({ options, value, onChange, placeholder, isMulti = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectRef = useRef(null);

  const filtered = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));

  const getDisplayLabel = () => {
    if (isMulti && Array.isArray(value)) {
      if (value.length === 0) return placeholder;
      return value.map(val => options.find(o => o.value === val)?.label).filter(Boolean).join(', ');
    }
    const selectedOpt = options.find(opt => opt.value === value);
    return selectedOpt ? selectedOpt.label : placeholder;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleOptionClick = (optVal) => {
    if (isMulti) {
      const currentVal = Array.isArray(value) ? value : [];
      if (currentVal.includes(optVal)) {
        onChange(currentVal.filter(v => v !== optVal));
      } else {
        onChange([...currentVal, optVal]);
      }
    } else {
      onChange(optVal);
      setIsOpen(false);
      setSearch('');
    }
  };

  const isSelected = (optVal) => {
    if (isMulti && Array.isArray(value)) {
      return value.includes(optVal);
    }
    return value === optVal;
  };

  return (
    <div ref={selectRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'var(--bg-app)',
          border: '1px solid var(--border-glass)',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          minHeight: '36px',
          color: (isMulti ? (Array.isArray(value) && value.length > 0) : value) ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '90%' }}>
          {getDisplayLabel()}
        </span>
        <span style={{ fontSize: '0.6rem' }}>▼</span>
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-glass)',
          borderRadius: '4px',
          zIndex: 1000,
          padding: '8px',
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <input
            type="text"
            placeholder="Type to filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '0.8rem',
              marginBottom: '6px',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-glass)',
              borderRadius: '4px',
              color: 'var(--text-primary)'
            }}
          />
          {filtered.map(opt => {
            const selected = isSelected(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => handleOptionClick(opt.value)}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  borderRadius: '2px',
                  background: selected ? 'var(--accent-primary)' : 'transparent',
                  color: selected ? '#000' : 'var(--text-primary)',
                  transition: 'background-color 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!selected) e.currentTarget.style.background = 'transparent';
                }}
              >
                {isMulti && (
                  <input 
                    type="checkbox" 
                    checked={selected} 
                    readOnly 
                    style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none', margin: 0 }}
                  />
                )}
                <span>{opt.label}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No matches found.</span>
          )}
        </div>
      )}
    </div>
  );
};

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

export default function TripPlanning({ token }) {
  // Dexie query
  // Consolidate all Dexie queries to avoid back-to-back renders (WebSocket flickering)
  const syncData = useLiveQuery(async () => {
    return {
      trips: await db.trips.toArray(),
      locations: await db.locations.toArray(),
      places: await db.places.toArray(),
      tags: await db.tags.toArray(),
      entityTags: await db.entity_tags.toArray(),
      collections: await db.collections.toArray(),
      reservations: await db.reservations.toArray(),
      itineraries: await db.itinerary_items.toArray(),
      expenses: await db.expenses.toArray(),
      rates: await db.trip_currency_rates.toArray(),
      syncQueue: await db.sync_queue.toArray()
    };
  }) || {
    trips: [], locations: [], places: [], tags: [], entityTags: [],
    collections: [], reservations: [], itineraries: [], expenses: [], rates: [], syncQueue: []
  };

  const { 
    trips, locations, places, tags, entityTags, collections, 
    reservations, itineraries, expenses, rates, syncQueue 
  } = syncData;

  // Local State
  const [selectedTrip, setSelectedTrip] = useState(null);
  
  useEffect(() => {
    const apiKey = localStorage.getItem('google_maps_api_key');
    const enabled = localStorage.getItem('google_maps_enabled') !== 'false';
    if (apiKey && enabled) {
      loadGoogleMaps(apiKey).catch(err => console.warn('Failed to load Google Maps SDK on Trip Planning:', err));
    }
  }, []);
  const currentTrip = selectedTrip ? (trips.find(t => t.id === selectedTrip.id) || selectedTrip) : null;
  const [forceUpdateActiveTrip, setForceUpdateActiveTrip] = useState(0);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [unmappedRecommendations, setUnmappedRecommendations] = useState([]);

  const itineraryDays = getItineraryDays(currentTrip);
  const [showAddForm, setShowAddForm] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardTrip, setWizardTrip] = useState(null);
  const [tripBudget, setTripBudget] = useState('');
  const [showAddLocationDropdown, setShowAddLocationDropdown] = useState(false);
  const [isManualOrAi, setIsManualOrAi] = useState('manual');
  const [show3ColumnWorkspace, setShow3ColumnWorkspace] = useState(false);
  const [showNavigationLines, setShowNavigationLines] = useState(false);
  const [tripName, setTripName] = useState('');
  const [tripNotes, setTripNotes] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripLength, setTripLength] = useState(1);

  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiMode, setAiMode] = useState(null); // 'ai' or 'manual' or null
  const [selectedLocationsForAi, setSelectedLocationsForAi] = useState([]);
  const [selectedCollectionsForAi, setSelectedCollectionsForAi] = useState([]);
  const [isGeneratingTrip, setIsGeneratingTrip] = useState(false);
  const [wizardSearchQuery, setWizardSearchQuery] = useState('');
  const [customPromptText, setCustomPromptText] = useState('');
  const [arrivalTime, setArrivalTime] = useState('morning'); // 'morning', 'afternoon', 'evening'

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [activeMobilePane, setActiveMobilePane] = useState('itinerary'); // 'map', 'itinerary', 'bank'

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const syncActive = syncQueue.length > 0;

  useEffect(() => {
    if (aiMode === 'ai') {
      const selectedPlacesList = places.filter(p => {
        const belongsToLoc = selectedLocationsForAi.includes(p.location_id);
        const belongsToCol = collections.some(col => 
          selectedCollectionsForAi.includes(col.id) && 
          (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
        );
        return belongsToLoc || belongsToCol;
      });

      const formattedPlaces = selectedPlacesList.map(p => ({
        name: p.name,
        address: p.address || '',
        latitude: p.latitude || '',
        longitude: p.longitude || ''
      }));

      setCustomPromptText(
        `Assign these ${selectedPlacesList.length} places of visit to a ${tripLength}-day itinerary optimally based on geocoordinates.
Arrival Time on Day 1: ${arrivalTime}.
Optimize the itinerary starting from Day 1 based on this arrival time.
Places to visit list: ${JSON.stringify(formattedPlaces)}`
      );
    }
  }, [selectedLocationsForAi, selectedCollectionsForAi, tripLength, aiMode, arrivalTime, locations, collections, places]);

  useEffect(() => {
    const checkAi = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.config && data.config.ai_settings) {
            const parsed = JSON.parse(data.config.ai_settings);
            const isEnabled = parsed.aiEnabled !== false;
            if (isEnabled && (parsed.apiKey || parsed.provider === 'Ollama')) {
              setAiConfigured(true);
            } else {
              setAiConfigured(false);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkAi();
  }, [token]);

  // Editing trip metadata states
  const [isEditingTripMeta, setIsEditingTripMeta] = useState(false);
  const [editTripName, setEditTripName] = useState('');
  const [editTripStartDate, setEditTripStartDate] = useState('');
  const [editTripLength, setEditTripLength] = useState(1);

  const startEditingTrip = () => {
    if (!selectedTrip) return;
    setEditTripName(selectedTrip.name);
    setEditTripStartDate(selectedTrip.start_date || '');
    setEditTripLength(selectedTrip.length || 1);
    setIsEditingTripMeta(true);
  };

  // Close planner details on pressing Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedTrip) {
        setSelectedTrip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrip]);

  // Selected Location / Collection for the trip
  const [selectedLocationId, setSelectedLocationId] = useState('');
  
  // Reservation Form State
  const [resType, setResType] = useState('hotel');
  const [resTitle, setResTitle] = useState('');
  const [resDetails, setResDetails] = useState('');
  const [resFile, setResFile] = useState(null);

  // Expense Form State
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('USD');
  const [expCategory, setExpCategory] = useState('Hotel');
  const [expNotes, setExpNotes] = useState('');
  const [expDate, setExpDate] = useState('');
  const [expIsPlanned, setExpIsPlanned] = useState(false); // Planned vs Actual
  const [expFile, setExpFile] = useState(null);

  // Edit Expense States
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editExpAmount, setEditExpAmount] = useState('');
  const [editExpCurrency, setEditExpCurrency] = useState('USD');
  const [editExpCategory, setEditExpCategory] = useState('');
  const [editExpNotes, setEditExpNotes] = useState('');
  const [editExpDate, setEditExpDate] = useState('');
  const [itinTargetDate, setItinTargetDate] = useState('');
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  const [tripFilterStatus, setTripFilterStatus] = useState('all'); // 'all', 'planned', 'completed'

  // Custom Exchange rates inside Trip Editing
  const [targetCur, setTargetCur] = useState('');
  const [curRate, setCurRate] = useState('');

  // Active planning sub-section toggle
  const [planSubTab, setPlanSubTab] = useState('itinerary'); // 'itinerary', 'budget'

  // Calculated Road Distances cache: { "placeId1-placeId2": distanceKm }
  const [distances, setDistances] = useState({});
  const pendingOSRMFetches = useRef(new Set());

  // Filters for Add Stop
  const [stopFilterLocationIds, setStopFilterLocationIds] = useState([]);
  const [stopFilterTagIds, setStopFilterTagIds] = useState([]);
  const [stopSelectedPlaceId, setStopSelectedPlaceId] = useState('');
  
  // Search states for filtering
  const [stopFilterLocationSearch, setStopFilterLocationSearch] = useState('');
  const [stopFilterTagSearch, setStopFilterTagSearch] = useState('');
  const [stopPlaceSearch, setStopPlaceSearch] = useState('');
  const [selectedPlaceIds, setSelectedPlaceIds] = useState([]);

  const filteredPlacesToAdd = useMemo(() => {
    if (!selectedTrip) return [];
    return places.filter(p => {
      const isAlreadyAdded = itineraries.some(item => item.place_id === p.id && item.trip_id === selectedTrip.id);
      if (isAlreadyAdded) return false;
      if (stopFilterLocationIds.length > 0 && !stopFilterLocationIds.includes(p.location_id)) return false;
      if (stopFilterTagIds.length > 0) {
        const placeHasTag = entityTags.some(et => et.entity_id === p.id && stopFilterTagIds.includes(et.tag_id));
        const parentLocHasTag = entityTags.some(et => et.entity_id === p.location_id && stopFilterTagIds.includes(et.tag_id));
        if (!placeHasTag && !parentLocHasTag) return false;
      }
      if (stopPlaceSearch && !p.name.toLowerCase().includes(stopPlaceSearch.toLowerCase()) && !p.category.toLowerCase().includes(stopPlaceSearch.toLowerCase())) return false;
      return true;
    });
  }, [places, itineraries, selectedTrip, stopFilterLocationIds, stopFilterTagIds, stopPlaceSearch, entityTags]);

  const mapPoints = useMemo(() => {
    if (!selectedTrip) return [];

    let hotelsObj = {};
    try {
      const notesObj = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
      hotelsObj = notesObj.hotels || {};
    } catch (e) {}

    // 1. Get all unscheduled and scheduled places belonging to selected trip locations
    const activePlaces = places.filter(p => p.is_folder !== 1 && stopFilterLocationIds.includes(p.location_id));
    const sortedActivePlaces = [...activePlaces].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const pointsList = sortedActivePlaces.map((place, idx) => {
      const scheduledItem = itineraries.find(i => i.trip_id === selectedTrip.id && i.place_id === place.id);
      
      let dayLabelText = null;
      let sequenceOrder = 1000 + idx;
      if (scheduledItem) {
        const dayIndex = itineraryDays.findIndex(d => d.date === scheduledItem.date);
        if (dayIndex !== -1) {
          dayLabelText = `D${dayIndex + 1}`;
          sequenceOrder = (dayIndex + 1) * 1000 + scheduledItem.sequence_order;
        }
      }

      return {
        ...place,
        dayLabel: dayLabelText,
        sequenceOrder: sequenceOrder,
        sequenceLabel: idx + 1
      };
    });

    // 2. Append daily stays (hotels) if assigned
    itineraryDays.forEach((day, dIdx) => {
      const dayDate = day.date;
      const dayNum = dIdx + 1;
      const dayLabelText = `D${dayNum}`;

      const hotelPlaceId = hotelsObj[dayDate];
      if (hotelPlaceId) {
        const hotelPlace = places.find(p => p.id === hotelPlaceId);
        if (hotelPlace) {
          pointsList.push({
            ...hotelPlace,
            dayLabel: dayLabelText,
            sequenceOrder: dIdx * 1000 + 0,
            sequenceLabel: 'H',
            isHotel: true
          });
        }
      }

      const nextDay = itineraryDays[dIdx + 1];
      if (nextDay) {
        const nextHotelPlaceId = hotelsObj[nextDay.date];
        if (nextHotelPlaceId) {
          const nextHotelPlace = places.find(p => p.id === nextHotelPlaceId);
          if (nextHotelPlace) {
            pointsList.push({
              ...nextHotelPlace,
              dayLabel: dayLabelText,
              sequenceOrder: dIdx * 1000 + 999,
              sequenceLabel: 'H',
              isHotel: true
            });
          }
        }
      }
    });

    return pointsList;
  }, [itineraries, places, selectedTrip, itineraryDays, stopFilterLocationIds]);

  // Base configurations and Trip configuration states
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [plannedBudgetInput, setPlannedBudgetInput] = useState('');
  const [selectedTripCurrencies, setSelectedTripCurrencies] = useState([]);
  const [isInternational, setIsInternational] = useState(false);

  const activeTripObj = trips.find(t => {
    try {
      const notesObj = typeof t.notes === 'string' ? JSON.parse(t.notes) : t.notes || {};
      return notesObj.isActive === true;
    } catch (e) {
      return false;
    }
  });
  const activeTripId = activeTripObj ? activeTripObj.id.toString() : '';
  const [tripModeActive, setTripModeActive] = useState(localStorage.getItem('tripModeActive') === 'true');

  // Cost and Tracker control states
  const [inlineResCost, setInlineResCost] = useState('');
  const [mainResCost, setMainResCost] = useState('');
  const [showBudgetLimitForm, setShowBudgetLimitForm] = useState(false);
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false);
  const [showRatesForm, setShowRatesForm] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printOptItinerary, setPrintOptItinerary] = useState(true);
  const [printOptReservations, setPrintOptReservations] = useState(true);
  const [printOptExpenses, setPrintOptExpenses] = useState(true);

  useEffect(() => {
    localStorage.setItem('tripModeActive', tripModeActive);
  }, [tripModeActive]);



  useEffect(() => {
    if (tripModeActive && activeTripId) {
      const activeTripObj = trips.find(t => t.id.toString() === activeTripId.toString());
      if (activeTripObj && (!selectedTrip || selectedTrip.id !== activeTripObj.id)) {
        setSelectedTrip(activeTripObj);
      }
    }
  }, [tripModeActive, activeTripId, trips, selectedTrip]);

  useEffect(() => {
    if (!selectedTrip || itineraries.length === 0 || places.length === 0) return;

    const runRecalculate = async () => {
      const tripItins = itineraries.filter(i => i.trip_id === selectedTrip.id);
      
      const days = {};
      tripItins.forEach(item => {
        if (!days[item.date]) days[item.date] = [];
        days[item.date].push(item);
      });

      for (const date in days) {
        const items = days[date].sort((a, b) => a.sequence_order - b.sequence_order);
        for (let idx = 0; idx < items.length; idx++) {
          const currentItem = items[idx];
          if (idx === 0) {
            if (currentItem.distance_from_prev !== 0 || currentItem.duration_from_prev !== 0) {
              await queueSyncAction('itinerary_items', 'update', {
                ...currentItem,
                distance_from_prev: 0,
                duration_from_prev: 0
              });
            }
          } else {
            const prevItem = items[idx - 1];
            const p1 = places.find(p => p.id === prevItem.place_id);
            const p2 = places.find(p => p.id === currentItem.place_id);
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
        }
      }
    };

    runRecalculate();
  }, [selectedTrip, itineraries, places, distances]);

  useEffect(() => {
    if (selectedTrip) {
      setItinTargetDate(selectedTrip.start_date || '');
      
      try {
        const notesObj = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
        const savedLocIds = notesObj.locationIds || [];
        const savedColIds = notesObj.collectionIds || [];
        
        let locIdsToSet = [...savedLocIds];
        if (savedColIds.length > 0) {
          const colPlaces = places.filter(p => 
            collections.some(col => 
              savedColIds.includes(col.id) && 
              (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
            )
          );
          const colLocIds = colPlaces.map(p => p.location_id);
          locIdsToSet = [...new Set([...locIdsToSet, ...colLocIds])];
        }
        setStopFilterLocationIds(locIdsToSet);
      } catch (e) {
        console.warn('Failed to parse trip notes for locations/collections:', e);
      }
    } else {
      setItinTargetDate('');
      setStopFilterLocationIds([]);
    }
  }, [selectedTrip, places, collections]);

  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.config && data.config.base_currency) {
          setBaseCurrency(data.config.base_currency);
          setExpCurrency(data.config.base_currency);
        }
      })
      .catch(() => {});
  }, [token]);

  const getTripNotesDescription = (trip) => {
    if (!trip || !trip.notes) return '';
    try {
      const parsed = JSON.parse(trip.notes);
      return parsed.description || '';
    } catch (e) {
      return trip.notes;
    }
  };

  const getTripIsInternational = (trip) => {
    if (!trip || !trip.notes) return false;
    try {
      const parsed = JSON.parse(trip.notes);
      return !!parsed.isInternational;
    } catch (e) {
      return false;
    }
  };

  const getTripCurrencies = (trip) => {
    if (!trip || !trip.notes) return [];
    try {
      const parsed = JSON.parse(trip.notes);
      return parsed.currencies || [];
    } catch (e) {
      return [];
    }
  };

  const getTripPlannedBudget = (trip) => {
    if (!trip || !trip.notes) return 0;
    try {
      const parsed = JSON.parse(trip.notes);
      return parsed.plannedBudget || 0;
    } catch (e) {
      return 0;
    }
  };

  useEffect(() => {
    if (selectedTrip) {
      setPlannedBudgetInput(getTripPlannedBudget(selectedTrip) || '');
      setSelectedTripCurrencies(getTripCurrencies(selectedTrip) || []);
    }
  }, [selectedTrip]);

  const handleUpdateTripConfig = async (updatedFields) => {
    if (!selectedTrip) return;
    let existingNotes = {};
    try {
      existingNotes = JSON.parse(selectedTrip.notes || '{}');
    } catch (e) {
      existingNotes = { description: selectedTrip.notes };
    }

    const updatedNotes = {
      ...existingNotes,
      ...updatedFields
    };

    const updatedTrip = {
      ...selectedTrip,
      notes: JSON.stringify(updatedNotes)
    };

    await queueSyncAction('trips', 'update', updatedTrip);
    setSelectedTrip(updatedTrip);
  };

  const getAiPromptText = () => {
    const locLines = locations
      .filter(l => selectedLocationsForAi.includes(l.id))
      .map((l, i) => `Location ${i + 1}: ${l.name} (Lat: ${l.latitude || 'N/A'}, Lon: ${l.longitude || 'N/A'}, Address: ${l.address || 'N/A'})`);

    const selectedPlacesList = places.filter(p => {
      const belongsToLoc = selectedLocationsForAi.includes(p.location_id);
      const belongsToCol = collections.some(col => 
        selectedCollectionsForAi.includes(col.id) && 
        (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
      );
      return belongsToLoc || belongsToCol;
    });

    const placeLines = selectedPlacesList.map((p, i) => 
      `Place of Visit ${i + 1}: ${p.name} (Lat: ${p.latitude || 'N/A'}, Lon: ${p.longitude || 'N/A'}, Address: ${p.address || 'N/A'})`
    );

    return `You are a trip planning specialist. You are planning a trip to the locations below along with their geo-codes. Review the locations and geocodes and plan a trip for these locations so that maximum number of places can be covered. Expect to spend sometime in each of these place for sightseeing.

Trip Days: ${tripLength || 3} days
Arrival time on Day 1: ${arrivalTime || 'Morning'}

${locLines.join('\n')}
${placeLines.join('\n')}

Only return the places to visit for each day in the itinerary.`;
  };

  useEffect(() => {
    if (showAddForm && wizardStep === 2) {
      setCustomPromptText(getAiPromptText());
    }
  }, [selectedLocationsForAi, selectedCollectionsForAi, tripLength, arrivalTime, showAddForm, wizardStep]);

  // Inline reservation state
  const [activeDateForResForm, setActiveDateForResForm] = useState(null);
  const [inlineResType, setInlineResType] = useState('Travel');
  const [inlineResTitle, setInlineResTitle] = useState('');
  const [inlineResDetails, setInlineResDetails] = useState('');
  const [inlineResFile, setInlineResFile] = useState(null);

  // Main starting reservation state
  const [showMainTravelForm, setShowMainTravelForm] = useState(false);
  const [mainResType, setMainResType] = useState('Air');
  const [mainResTitle, setMainResTitle] = useState('');
  const [mainResDetails, setMainResDetails] = useState('');
  const [mainResFile, setMainResFile] = useState(null);
  const [editingReservationId, setEditingReservationId] = useState(null);
  const [activePdfUrl, setActivePdfUrl] = useState(null);

  // Helper: Haversine distance
  const getHaversine = (p1, p2) => {
    if (!p1.latitude || !p1.longitude || !p2.latitude || !p2.longitude) return 0;
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

  // Helper: Retrieve actual driving route from OSRM or Google Maps Distance Matrix
  const fetchOSRMDistance = async (p1, p2) => {
    const key = `${p1.id}-${p2.id}`;
    if (distances[key]) return distances[key];
    if (pendingOSRMFetches.current.has(key)) return;
    pendingOSRMFetches.current.add(key);

    try {
      if (window.google && window.google.maps && localStorage.getItem('google_maps_api_key') && localStorage.getItem('google_maps_enabled') !== 'false') {
        try {
          trackApiCall('Google Maps Distance Matrix');
          const service = new window.google.maps.DistanceMatrixService();
          const response = await new Promise((resolve, reject) => {
            service.getDistanceMatrix({
              origins: [{ lat: parseFloat(p1.latitude), lng: parseFloat(p1.longitude) }],
              destinations: [{ lat: parseFloat(p2.latitude), lng: parseFloat(p2.longitude) }],
              travelMode: window.google.maps.TravelMode.DRIVING
            }, (res, status) => {
              if (status === 'OK') resolve(res);
              else reject(new Error('Distance Matrix failed with status: ' + status));
            });
          });

          if (response.rows && response.rows[0] && response.rows[0].elements && response.rows[0].elements[0]) {
            const element = response.rows[0].elements[0];
            if (element.status === 'OK') {
              const distKm = Math.round((element.distance.value / 1000) * 10) / 10;
              const durationMins = Math.round(element.duration.value / 60);
              const valObj = { distance: distKm, duration: durationMins };
              setDistances(prev => ({ ...prev, [key]: valObj }));
              return valObj;
            }
          }
        } catch (err) {
          console.warn('Google Distance Matrix failed, falling back to OSRM:', err);
        }
      }

      try {
        trackApiCall('OSRM Routing');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${p1.longitude},${p1.latitude};${p2.longitude},${p2.latitude}?overview=false`);
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
      } catch (err) {
        console.warn('OSRM router error, falling back to Haversine:', err);
      }
      const havDist = getHaversine(p1, p2);
      const durMins = Math.round((havDist / 40) * 60);
      const valObj = { distance: havDist, duration: durMins };
      setDistances(prev => ({ ...prev, [key]: valObj }));
      return valObj;
    } finally {
      pendingOSRMFetches.current.delete(key);
    }
  };

  const handleWizardNext = async (e) => {
    e.preventDefault();
    if (!tripName.trim()) return;

    let calculatedEndDate = null;
    const len = parseInt(tripLength, 10) || 1;
    if (tripStartDate) {
      const start = new Date(tripStartDate);
      start.setDate(start.getDate() + (len - 1));
      calculatedEndDate = start.toISOString().split('T')[0];
    }

    const newTripId = generateUUID();
    const newTrip = {
      id: newTripId,
      name: tripName,
      start_date: tripStartDate || null,
      end_date: calculatedEndDate,
      length: len,
      visited: 0,
      notes: JSON.stringify({
        description: tripNotes || '',
        isInternational: isInternational,
        currencies: [baseCurrency],
        plannedBudget: parseFloat(tripBudget) || 0,
        arrivalTime: arrivalTime || 'morning',
        planningMode: isManualOrAi
      })
    };

    await queueSyncAction('trips', 'insert', newTrip);
    setWizardTrip(newTrip);
    setWizardStep(2);
  };

  const handleSelectHotel = async (date, hotelPlaceId) => {
    if (!selectedTrip) return;
    let notesObj = {};
    try {
      notesObj = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
    } catch (e) {
      notesObj = {};
    }
    notesObj.hotels = notesObj.hotels || {};
    if (hotelPlaceId) {
      notesObj.hotels[date] = hotelPlaceId;
    } else {
      delete notesObj.hotels[date];
    }
    const updated = {
      ...selectedTrip,
      notes: JSON.stringify(notesObj)
    };
    await queueSyncAction('trips', 'update', updated);
    setSelectedTrip(updated);
  };

  const handleStartManualPlanning = async () => {
    if (wizardTrip) {
      const existingNotes = typeof wizardTrip.notes === 'string' ? JSON.parse(wizardTrip.notes) : wizardTrip.notes || {};
      const updatedNotes = {
        ...existingNotes,
        locationIds: selectedLocationsForAi,
        collectionIds: selectedCollectionsForAi
      };
      const updatedTrip = {
        ...wizardTrip,
        notes: JSON.stringify(updatedNotes)
      };
      await queueSyncAction('trips', 'update', updatedTrip);
      setSelectedTrip(updatedTrip);
    }

    let locIdsToSet = [...selectedLocationsForAi];
    if (selectedCollectionsForAi.length > 0) {
      const colPlaces = places.filter(p => 
        collections.some(col => 
          selectedCollectionsForAi.includes(col.id) && 
          (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
        )
      );
      const colLocIds = colPlaces.map(p => p.location_id);
      locIdsToSet = [...new Set([...locIdsToSet, ...colLocIds])];
    }
    setStopFilterLocationIds(locIdsToSet);

    setShowAddForm(false);
    setWizardStep(1);
    setTripBudget('');
    setWizardTrip(null);
    setShow3ColumnWorkspace(true);
  };

  const handleCreateTripWithAi = async (e) => {
    e.preventDefault();
    if (!wizardTrip) return;

    setIsGeneratingTrip(true);
    try {
      const existingNotes = typeof wizardTrip.notes === 'string' ? JSON.parse(wizardTrip.notes) : wizardTrip.notes || {};
      const updatedNotes = {
        ...existingNotes,
        locationIds: selectedLocationsForAi,
        collectionIds: selectedCollectionsForAi
      };
      const updatedTrip = {
        ...wizardTrip,
        notes: JSON.stringify(updatedNotes)
      };
      await queueSyncAction('trips', 'update', updatedTrip);

      const locNames = locations.filter(l => selectedLocationsForAi.includes(l.id)).map(l => l.name);
      const colNames = collections.filter(c => selectedCollectionsForAi.includes(c.id)).map(c => c.name);

      const selectedPlacesList = places.filter(p => {
        const belongsToLoc = selectedLocationsForAi.includes(p.location_id);
        const belongsToCol = collections.some(col => 
          selectedCollectionsForAi.includes(col.id) && 
          (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
        );
        return belongsToLoc || belongsToCol;
      }).map(p => ({
        name: p.name,
        address: p.address || '',
        latitude: p.latitude || '',
        longitude: p.longitude || ''
      }));

      trackApiCall('AI Assistant');
      const aiRes = await fetch('/api/ai/generate-trip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          locations: locNames,
          collections: colNames,
          lengthDays: parseInt(tripLength, 10) || 1,
          prompt: customPromptText,
          placesList: selectedPlacesList
        })
      });

      if (!aiRes.ok) {
        const errorData = await aiRes.json();
        throw new Error(errorData.error || 'AI generation failed');
      }

      const days = await aiRes.json();

      const unmappedList = [];
      for (const day of days) {
        let dayDateStr = `Day ${day.day}`;
        if (wizardTrip.start_date) {
          const d = new Date(wizardTrip.start_date);
          d.setDate(d.getDate() + (day.day - 1));
        dayDateStr = d.toISOString().split('T')[0];
        }

        for (let idx = 0; idx < (day.activities || []).length; idx++) {
          const activityText = day.activities[idx];
          
          let matchedPlace = places.find(p => {
            const nameMatch = p.name.toLowerCase() === activityText.toLowerCase() ||
              activityText.toLowerCase().includes(p.name.toLowerCase()) ||
              p.name.toLowerCase().includes(activityText.toLowerCase());
            if (!nameMatch) return false;
            
            const cat = p.category?.toLowerCase() || '';
            const isExcluded = cat.includes('hotel') || cat.includes('resort') || cat.includes('cafe') || cat.includes('stay');
            return !isExcluded;
          });
          let placeId = matchedPlace ? matchedPlace.id : null;

          if (!placeId) {
            unmappedList.push({
              name: activityText.substring(0, 100),
              suggestedDay: dayDateStr
            });
          } else {
            const newItem = {
              id: generateUUID(),
              trip_id: wizardTrip.id,
              date: dayDateStr,
              place_id: placeId,
              sequence_order: idx + 1,
              distance_from_prev: null,
              duration_from_prev: null
            };
            await queueSyncAction('itinerary_items', 'insert', newItem);
          }
        }
      }
      setUnmappedRecommendations(unmappedList);
      
      let locIdsToSet = [...selectedLocationsForAi];
      if (selectedCollectionsForAi.length > 0) {
        const colPlaces = places.filter(p => 
          collections.some(col => 
            selectedCollectionsForAi.includes(col.id) && 
            (typeof col.place_ids === 'string' ? JSON.parse(col.place_ids) : col.place_ids || []).includes(p.id)
          )
        );
        const colLocIds = colPlaces.map(p => p.location_id);
        locIdsToSet = [...new Set([...locIdsToSet, ...colLocIds])];
      }
      setStopFilterLocationIds(locIdsToSet);

      setTripName('');
      setTripStartDate('');
      setTripLength(1);
      setTripNotes('');
      setIsInternational(false);
      setSelectedLocationsForAi([]);
      setSelectedCollectionsForAi([]);
      setAiMode(null);
      setShowAddForm(false);
      setWizardStep(1);
      setTripBudget('');
      setSelectedTrip(updatedTrip);
      setWizardTrip(null);
      setShow3ColumnWorkspace(true);
    } catch (err) {
      console.error(err);
      alert('Failed to generate trip with AI: ' + err.message);
    } finally {
      setIsGeneratingTrip(false);
    }
  };

  const handleSaveRecommendation = async (rec) => {
    let targetLocId = selectedLocationsForAi[0];
    if (!targetLocId) {
      const firstLoc = locations[0];
      if (firstLoc) {
        targetLocId = firstLoc.id;
      } else {
        const defaultLocId = generateUUID();
        await queueSyncAction('locations', 'insert', {
          id: defaultLocId,
          name: 'General Locations',
          visited: 0,
          is_folder: 0,
          parent_id: null,
          local_file_data: null
        });
        targetLocId = defaultLocId;
      }
    }

    const placeId = generateUUID();
    await queueSyncAction('places', 'insert', {
      id: placeId,
      location_id: targetLocId,
      name: rec.name,
      category: 'Sightseeing',
      visited: 0,
      address: '',
      notes: 'AI Recommended stop.'
    });

    let dayDateStr = rec.suggestedDay;
    const dayItems = itineraries.filter(i => i.trip_id === selectedTrip.id && i.date === dayDateStr);

    const newItem = {
      id: generateUUID(),
      trip_id: selectedTrip.id,
      date: dayDateStr,
      place_id: placeId,
      sequence_order: dayItems.length + 1,
      distance_from_prev: null,
      duration_from_prev: null
    };
    await queueSyncAction('itinerary_items', 'insert', newItem);

    setUnmappedRecommendations(prev => prev.filter(r => r.name !== rec.name));
  };

  const handleToggleTripVisited = async (trip) => {
    const newStatus = trip.visited === 1 ? 0 : 1;
    const updated = { ...trip, visited: newStatus };
    await queueSyncAction('trips', 'update', updated);
    setSelectedTrip(updated);

    // Cascade update to locations and places
    const tripItineraries = itineraries.filter(i => i.trip_id === trip.id);
    const placeIds = [...new Set(tripItineraries.map(i => i.place_id))];

    if (placeIds.length > 0) {
      const tripPlaces = places.filter(p => placeIds.includes(p.id));
      const locationIds = [...new Set(tripPlaces.map(p => p.location_id))];
      const tripLocations = locations.filter(l => locationIds.includes(l.id));

      if (newStatus === 1) {
        // Mark all places in the trip as visited
        for (const place of tripPlaces) {
          if (place.visited !== 1) {
            await queueSyncAction('places', 'update', { ...place, visited: 1 });
          }
        }
        // Mark all locations in the trip as visited
        for (const loc of tripLocations) {
          if (loc.visited !== 1) {
            await queueSyncAction('locations', 'update', { ...loc, visited: 1 });
          }
        }
      } else {
        // Ask confirmation for marking as not visited
        if (window.confirm('Do you want to mark all locations and places of visit in this trip as "Not Visited" again?')) {
          for (const place of tripPlaces) {
            if (place.visited !== 0) {
              await queueSyncAction('places', 'update', { ...place, visited: 0 });
            }
          }
          for (const loc of tripLocations) {
            if (loc.visited !== 0) {
              await queueSyncAction('locations', 'update', { ...loc, visited: 0 });
            }
          }
        }
      }
    }
  };

  const handleDeleteTrip = async (tripId) => {
    if (window.confirm('Delete this planned trip entirely? All reservations, itineraries, and expenses will be lost.')) {
      await queueSyncAction('trips', 'delete', { id: tripId });
      setSelectedTrip(null);
    }
  };

  // Add inline reservation for a specific date
  const handleAddInlineReservation = async (e, date) => {
    e.preventDefault();
    if (!inlineResTitle.trim() || !selectedTrip) return;

    let fileUrl = null;
    let localFileData = null;
    if (inlineResFile) {
      localFileData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(inlineResFile);
      });

      const formData = new FormData();
      formData.append('file', inlineResFile);
      try {
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          fileUrl = data.fileUrl;
        }
      } catch (err) {
        console.error('File upload failed:', err);
      }
    }

    const newRes = {
      id: generateUUID(),
      trip_id: selectedTrip.id,
      type: inlineResType.toLowerCase(),
      title: inlineResTitle,
      details: JSON.stringify({ notes: inlineResDetails, date: date }),
      file_path: fileUrl,
      local_file_data: localFileData
    };

    await queueSyncAction('reservations', 'insert', newRes);

    const parsedCost = parseFloat(inlineResCost);
    if (!isNaN(parsedCost) && parsedCost > 0) {
      let expCategoryVal = 'Other';
      const rType = (inlineResType || '').toLowerCase();
      if (rType === 'stay' || rType === 'hotel' || rType === 'airbnb' || rType === 'lodging') {
        expCategoryVal = 'Lodging';
      } else if (['flight', 'air', 'train', 'bus', 'car', 'rental', 'transport', 'ferry', 'taxi'].includes(rType)) {
        expCategoryVal = 'Transportation';
      } else if (['activity', 'attraction', 'ticket', 'event', 'entertainment'].includes(rType)) {
        expCategoryVal = 'Entertainment';
      }

      const newExp = {
        id: generateUUID(),
        trip_id: selectedTrip.id,
        date: date,
        amount: parsedCost,
        currency: baseCurrency,
        category: expCategoryVal,
        notes: `Cost for reservation: ${inlineResTitle}`,
        receipt_path: null,
        is_planned: 0,
        reservation_id: newRes.id
      };
      await queueSyncAction('expenses', 'insert', newExp);
    }

    // Reset Form
    setInlineResTitle('');
    setInlineResDetails('');
    setInlineResCost('');
    setInlineResFile(null);
    setActiveDateForResForm(null);
  };

  // Add Main starting travel reservation
  const handleAddMainReservation = async (e) => {
    e.preventDefault();
    if (!mainResTitle.trim() || !selectedTrip) return;

    let fileUrl = null;
    let localFileData = null;
    if (mainResFile) {
      localFileData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(mainResFile);
      });

      const formData = new FormData();
      formData.append('file', mainResFile);
      try {
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          fileUrl = data.fileUrl;
        }
      } catch (err) {
        console.error('File upload failed:', err);
      }
    }

    if (editingReservationId) {
      const existingRes = reservations.find(r => r.id === editingReservationId);
      if (existingRes) {
        const updatedRes = {
          ...existingRes,
          type: mainResType.toLowerCase(),
          title: mainResTitle,
          details: JSON.stringify({ notes: mainResDetails, isMainTripStart: true }),
          file_path: fileUrl || existingRes.file_path,
          local_file_data: localFileData || existingRes.local_file_data
        };
        await queueSyncAction('reservations', 'update', updatedRes);

        const parsedCost = parseFloat(mainResCost);
        const existingExp = expenses.find(exp => exp.reservation_id === editingReservationId);
        
        let expCategoryVal = 'Other';
        const rType = (mainResType || '').toLowerCase();
        if (rType === 'stay' || rType === 'hotel' || rType === 'airbnb' || rType === 'lodging') {
          expCategoryVal = 'Lodging';
        } else if (['flight', 'air', 'train', 'bus', 'car', 'rental', 'transport', 'ferry', 'taxi'].includes(rType)) {
          expCategoryVal = 'Transportation';
        } else if (['activity', 'attraction', 'ticket', 'event', 'entertainment'].includes(rType)) {
          expCategoryVal = 'Entertainment';
        }

        if (existingExp) {
          if (!isNaN(parsedCost) && parsedCost > 0) {
            const updatedExp = {
              ...existingExp,
              amount: parsedCost,
              category: expCategoryVal,
              notes: `Cost for departure/arrival: ${mainResTitle}`,
              date: document.getElementById('main-res-date-select')?.value || selectedTrip.start_date || new Date().toISOString().split('T')[0]
            };
            await queueSyncAction('expenses', 'update', updatedExp);
          } else {
            await queueSyncAction('expenses', 'delete', { id: existingExp.id });
          }
        } else if (!isNaN(parsedCost) && parsedCost > 0) {
          const newExp = {
            id: generateUUID(),
            trip_id: selectedTrip.id,
            date: document.getElementById('main-res-date-select')?.value || selectedTrip.start_date || new Date().toISOString().split('T')[0],
            amount: parsedCost,
            currency: baseCurrency,
            category: expCategoryVal,
            notes: `Cost for departure/arrival: ${mainResTitle}`,
            receipt_path: null,
            is_planned: 0,
            reservation_id: editingReservationId
          };
          await queueSyncAction('expenses', 'insert', newExp);
        }
      }
    } else {
      const newRes = {
        id: generateUUID(),
        trip_id: selectedTrip.id,
        type: mainResType.toLowerCase(),
        title: mainResTitle,
        details: JSON.stringify({ notes: mainResDetails, isMainTripStart: true }),
        file_path: fileUrl,
        local_file_data: localFileData
      };

      await queueSyncAction('reservations', 'insert', newRes);

      const parsedCost = parseFloat(mainResCost);
      if (!isNaN(parsedCost) && parsedCost > 0) {
        let expCategoryVal = 'Other';
        const rType = (mainResType || '').toLowerCase();
        if (rType === 'stay' || rType === 'hotel' || rType === 'airbnb' || rType === 'lodging') {
          expCategoryVal = 'Lodging';
        } else if (['flight', 'air', 'train', 'bus', 'car', 'rental', 'transport', 'ferry', 'taxi'].includes(rType)) {
          expCategoryVal = 'Transportation';
        } else if (['activity', 'attraction', 'ticket', 'event', 'entertainment'].includes(rType)) {
          expCategoryVal = 'Entertainment';
        }

        const newExp = {
          id: generateUUID(),
          trip_id: selectedTrip.id,
          date: document.getElementById('main-res-date-select')?.value || selectedTrip.start_date || new Date().toISOString().split('T')[0],
          amount: parsedCost,
          currency: baseCurrency,
          category: expCategoryVal,
          notes: `Cost for departure/arrival: ${mainResTitle}`,
          receipt_path: null,
          is_planned: 0,
          reservation_id: newRes.id
        };
        await queueSyncAction('expenses', 'insert', newExp);
      }
    }

    // Reset Form
    setMainResTitle('');
    setMainResDetails('');
    setMainResCost('');
    setMainResFile(null);
    setEditingReservationId(null);
    setShowMainTravelForm(false);
  };

  // Add Itinerary Item
  const handleAddItineraryItem = async (date, placeId) => {
    if (!currentTrip) return;
    
    // Calculate sequence order
    const dayItems = itineraries.filter(i => i.trip_id === currentTrip.id && i.date === date);
    const maxOrder = dayItems.reduce((max, item) => item.sequence_order > max ? item.sequence_order : max, 0);

    const newItem = {
      id: generateUUID(),
      trip_id: currentTrip.id,
      date,
      place_id: placeId,
      sequence_order: maxOrder + 1,
      distance_from_prev: null,
      duration_from_prev: null
    };

    await queueSyncAction('itinerary_items', 'insert', newItem);
  };

  const handleMobileAddStop = async (place) => {
    if (!currentTrip || !itineraryDays || itineraryDays.length === 0) return;
    const firstDayDate = itineraryDays[0].date;
    await handleAddItineraryItem(firstDayDate, place.id);
  };

  const handleViewAttachment = (res) => {
    if (res.file_path) {
      setActivePdfUrl(res.file_path);
    }
  };

  const handleToggleActiveTrip = async (tripId) => {
    for (const t of trips) {
      let notesObj = {};
      try {
        notesObj = typeof t.notes === 'string' ? JSON.parse(t.notes) : t.notes || {};
      } catch (e) {}

      const shouldBeActive = t.id.toString() === tripId.toString() && !notesObj.isActive;
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

  // Delete Itinerary Item
  const handleDeleteItineraryItem = async (itemId) => {
    const itemToDelete = itineraries.find(i => i.id === itemId);
    if (itemToDelete) {
      const dayItems = itineraries
        .filter(i => i.trip_id === itemToDelete.trip_id && i.date === itemToDelete.date && i.id !== itemId)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const subsequentItem = dayItems.find(i => i.sequence_order > itemToDelete.sequence_order);
      if (subsequentItem) {
        await queueSyncAction('itinerary_items', 'update', {
          ...subsequentItem,
          distance_from_prev: null,
          duration_from_prev: null
        });
      }
    }
    await queueSyncAction('itinerary_items', 'delete', { id: itemId });
  };

  // Delete Reservation (with cascade and confirmation)
  const handleDeleteReservation = async (res) => {
    if (window.confirm('Are you sure you want to delete this reservation? This will also delete any associated expense.')) {
      await queueSyncAction('reservations', 'delete', { id: res.id });
      const related = expenses.filter(e => e.reservation_id === res.id);
      for (const exp of related) {
        await queueSyncAction('expenses', 'delete', { id: exp.id });
      }
    }
  };

  const handleStartEditReservation = (res) => {
    setEditingReservationId(res.id);
    setMainResType(res.type.charAt(0).toUpperCase() + res.type.slice(1));
    setMainResTitle(res.title);
    
    let notes = '';
    try {
      const details = typeof res.details === 'string' ? JSON.parse(res.details) : res.details || {};
      notes = details.notes || '';
    } catch (e) {}
    setMainResDetails(notes);

    const associatedExp = expenses.find(e => e.reservation_id === res.id);
    setMainResCost(associatedExp ? associatedExp.amount.toString() : '');
    setMainResFile(null); // original file kept unless replaced
    setShowMainTravelForm(true);
  };

  // Add Custom Exchange Rate
  const handleAddRate = async (e) => {
    e.preventDefault();
    if (!targetCur || !curRate || !selectedTrip) return;

    const newRate = {
      id: generateUUID(),
      trip_id: selectedTrip.id,
      currency: targetCur.toUpperCase(),
      rate: parseFloat(curRate)
    };

    await queueSyncAction('trip_currency_rates', 'insert', newRate);
    setTargetCur('');
    setCurRate('');
  };

  // Add Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expAmount || !expDate || expDate === 'custom-temp' || !selectedTrip) return;

    let receiptUrl = null;
    if (expFile) {
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

    const newExp = {
      id: generateUUID(),
      trip_id: selectedTrip.id,
      date: expDate,
      amount: parseFloat(expAmount),
      currency: expCurrency,
      category: expCategory,
      notes: expNotes,
      receipt_path: receiptUrl,
      is_planned: 0
    };

    await queueSyncAction('expenses', 'insert', newExp);

    // Reset
    setExpAmount('');
    setExpNotes('');
    setExpFile(null);
    if (document.getElementById('exp-file-input')) {
      document.getElementById('exp-file-input').value = '';
    }
  };

  // Start Editing Expense
  const handleStartEditExpense = (exp) => {
    setEditingExpenseId(exp.id);
    setEditExpAmount(exp.amount.toString());
    setEditExpCurrency(exp.currency);
    setEditExpCategory(exp.category);
    setEditExpNotes(exp.notes || '');
    setEditExpDate(exp.date);
  };

  // Save Edited Expense
  const handleSaveEditedExpense = async (expId) => {
    if (!editExpAmount || !editExpDate) return;
    const existing = expenses.find(e => e.id === expId);
    if (!existing) return;

    const updated = {
      ...existing,
      amount: parseFloat(editExpAmount),
      currency: editExpCurrency,
      category: editExpCategory,
      notes: editExpNotes,
      date: editExpDate
    };

    await queueSyncAction('expenses', 'update', updated);
    setEditingExpenseId(null);
  };

  // Delete Expense (with bi-directional cascade deletion to reservations)
  const handleDeleteExpense = async (exp) => {
    if (exp.reservation_id) {
      const res = reservations.find(r => r.id === exp.reservation_id);
      if (res) {
        await handleDeleteReservation(res);
        return;
      }
    }
    if (window.confirm('Are you sure you want to delete this expense?')) {
      await queueSyncAction('expenses', 'delete', { id: exp.id });
    }
  };

  // List of Dates
  const getDatesBetween = (start, end) => {
    const list = [];
    if (!start || !end) return list;
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) {
      list.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return list;
  };

  const formatStartDate = (date) => {
    if (!date || date === 'null' || date === 'undefined') return 'No Date Set';
    return date;
  };

  // Budget calculations
  const getConvertedAmount = (amount, currency) => {
    if (currency === 'USD') return amount;
    const rateRow = rates.find(r => selectedTrip && r.trip_id === selectedTrip.id && r.currency === currency);
    return rateRow ? amount * rateRow.rate : amount; // defaults to 1:1 if not found
  };

  const tripExpensesList = selectedTrip 
    ? [...expenses.filter(e => e.trip_id === selectedTrip.id)].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const getCategoryColor = (catName) => {
    const categoriesMap = {};
    tripExpensesList.forEach(e => {
      const converted = getConvertedAmount(e.amount, e.currency);
      categoriesMap[e.category] = (categoriesMap[e.category] || 0) + converted;
    });
    const uniqueCats = Object.keys(categoriesMap);
    const colorsList = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
    const idx = uniqueCats.indexOf(catName);
    return idx !== -1 ? colorsList[idx % colorsList.length] : 'var(--accent-primary-hover)';
  };
  const plannedBudget = selectedTrip ? getTripPlannedBudget(selectedTrip) : 0;
  const actualBudget = tripExpensesList.reduce((sum, e) => sum + getConvertedAmount(e.amount, e.currency), 0);
  const budgetPercentage = plannedBudget > 0 ? (actualBudget / plannedBudget) * 100 : 0;

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.name.toLowerCase().includes(tripSearchQuery.toLowerCase()) ||
      (trip.notes && trip.notes.toLowerCase().includes(tripSearchQuery.toLowerCase()));

    let matchesStatus = true;
    if (tripFilterStatus === 'completed') {
      matchesStatus = trip.visited === 1;
    } else if (tripFilterStatus === 'planned') {
      matchesStatus = trip.visited !== 1;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="container">
      <div className={selectedTrip ? "no-print" : ""}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ margin: 0 }}>Trip Planner</h2>
          {(() => {
            const isUsingGmaps = typeof window !== 'undefined' && 
              window.google && 
              window.google.maps && 
              localStorage.getItem('google_maps_api_key') && 
              localStorage.getItem('google_maps_enabled') !== 'false';
            return (
              <div 
                title={isUsingGmaps ? "Using Google Maps Distance Matrix API for travel routes" : "Using OpenStreetMap (OSRM) API for travel routes"}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '4px', 
                  borderRadius: '50%', 
                  border: '1px solid var(--border-glass)',
                  background: isUsingGmaps ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                  cursor: 'help'
                }}
              >
                <img 
                  src={isUsingGmaps ? "/gmaps.png" : "/osm.png"} 
                  style={{ width: 18, height: 18, objectFit: 'contain' }} 
                  alt={isUsingGmaps ? "GMaps" : "OSM"} 
                />
              </div>
            );
          })()}
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ width: 'auto', padding: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={18} style={{ margin: 0 }} />
          <span className="desktop-only-text">Plan New Trip</span>
        </button>
      </div>

      {/* Search and Filter Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search trips by name or notes..."
            value={tripSearchQuery}
            onChange={(e) => setTripSearchQuery(e.target.value)}
            style={{ height: '38px', padding: '8px 16px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', color: '#fff' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)' }}>
          <button
            onClick={() => setTripFilterStatus('all')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: tripFilterStatus === 'all' ? 'var(--accent-primary)' : 'transparent',
              color: tripFilterStatus === 'all' ? '#000' : 'var(--text-secondary)',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            All
          </button>
          <button
            onClick={() => setTripFilterStatus('planned')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: tripFilterStatus === 'planned' ? 'var(--accent-primary)' : 'transparent',
              color: tripFilterStatus === 'planned' ? '#000' : 'var(--text-secondary)',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            Planned
          </button>
          <button
            onClick={() => setTripFilterStatus('completed')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: tripFilterStatus === 'completed' ? 'var(--accent-primary)' : 'transparent',
              color: tripFilterStatus === 'completed' ? '#000' : 'var(--text-secondary)',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            Completed
          </button>
        </div>
      </div>

      {trips.length === 0 && !showAddForm && (
        <div className="empty-state">
          <Calendar size={48} className="empty-state-icon" />
          <h3>No Planned Trips</h3>
          <p>Create a trip itinerary, log travel reservations, and plan your budget limits before departing.</p>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
            <Compass size={18} />
            <span>Plan New Trip</span>
          </button>
        </div>
      )}

      {/* Add Trip Dialog */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Plan New Trip</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => { setShowAddForm(false); setAiMode(null); }} />
            </div>

            {wizardStep === 1 ? (
              <form onSubmit={handleWizardNext}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '8px' }}>Planning Method</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className={`btn ${isManualOrAi === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setIsManualOrAi('ai')}
                      style={{ flex: 1, padding: '10px' }}
                    >
                      AI-Assisted
                    </button>
                    <button
                      type="button"
                      className={`btn ${isManualOrAi === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setIsManualOrAi('manual')}
                      style={{ flex: 1, padding: '10px' }}
                    >
                      Manual (Self-designed)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Trip Title</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Kyoto Autumn Exploration..."
                    value={tripName}
                    onChange={(e) => setTripName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Start Date (Optional)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={tripStartDate}
                      onClick={(e) => e.target.showPicker()}
                      onChange={(e) => setTripStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Trip Length (Days)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="form-control"
                      placeholder="e.g. 7"
                      value={tripLength === 0 || tripLength === '' ? '' : tripLength}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTripLength(val === '' ? '' : parseInt(val, 10));
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Arrival (Day 1)</label>
                    <select
                      className="form-control"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="evening">Evening</option>
                      <option value="night">Night</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Budget Limit ({baseCurrency})</label>
                    <input
                      type="number"
                      placeholder="e.g. 1500"
                      className="form-control"
                      value={tripBudget}
                      onChange={(e) => setTripBudget(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description / Notes</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={tripNotes}
                    onChange={(e) => setTripNotes(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    id="is-international-checkbox"
                    checked={isInternational}
                    onChange={(e) => setIsInternational(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                  />
                  <label htmlFor="is-international-checkbox" style={{ margin: 0, fontSize: '0.9rem', cursor: 'pointer' }}>This is an International Trip</label>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Next
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {isGeneratingTrip ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px 0' }}>
                    <Compass size={48} className="spin" style={{ color: 'var(--accent-primary)' }} />
                    <p style={{ fontWeight: 'bold' }}>Generating daily itinerary with AI...</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>Connecting with your configured model to outline day-wise stops and routing activities.</p>
                  </div>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                      Select locations and collections to populate the places bank for this trip:
                    </p>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <input 
                        type="text"
                        className="form-control"
                        placeholder="Search locations or collections..."
                        value={wizardSearchQuery}
                        onChange={(e) => setWizardSearchQuery(e.target.value)}
                        style={{ fontSize: '0.85rem' }}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label>Select Locations</label>
                        <div style={{ border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '8px', maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-app)' }}>
                          {locations
                            .filter(l => l.is_folder !== 1)
                            .filter(l => !wizardSearchQuery.trim() || l.name?.toLowerCase().includes(wizardSearchQuery.toLowerCase()))
                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                            .map(loc => (
                              <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <input 
                                  type="checkbox" 
                                  id={`loc-ai-${loc.id}`}
                                  checked={selectedLocationsForAi.includes(loc.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedLocationsForAi(prev => [...prev, loc.id]);
                                    else setSelectedLocationsForAi(prev => prev.filter(id => id !== loc.id));
                                  }}
                                />
                                <label htmlFor={`loc-ai-${loc.id}`} style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer' }}>{loc.name}</label>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label>Select Collections</label>
                        <div style={{ border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '8px', maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-app)' }}>
                          {collections
                            .filter(c => !wizardSearchQuery.trim() || c.name?.toLowerCase().includes(wizardSearchQuery.toLowerCase()))
                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                            .map(col => (
                              <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <input 
                                  type="checkbox" 
                                  id={`col-ai-${col.id}`}
                                  checked={selectedCollectionsForAi.includes(col.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedCollectionsForAi(prev => [...prev, col.id]);
                                    else setSelectedCollectionsForAi(prev => prev.filter(id => id !== col.id));
                                  }}
                                />
                                <label htmlFor={`col-ai-${col.id}`} style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer' }}>{col.name}</label>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    {isManualOrAi === 'ai' ? (
                      <form onSubmit={handleCreateTripWithAi} style={{ marginTop: '20px' }}>
                        <div className="form-group">
                          <label>AI Prompt (Edit details to guide your planner)</label>
                          <textarea
                            className="form-control"
                            rows="5"
                            value={customPromptText}
                            onChange={(e) => setCustomPromptText(e.target.value)}
                            placeholder="Customize the itinerary generation instructions..."
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(1)}>
                            Back
                          </button>
                          <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Compass size={16} />
                            Send to AI
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(1)}>
                          Back
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleStartManualPlanning}>
                          Start Manual Planning
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {filteredTrips.length === 0 && !showAddForm && (
        <div className="empty-state">
          <Calendar size={48} className="empty-state-icon" />
          <h3>No Matching Trips</h3>
          <p>Try adjusting your search query or status filter.</p>
        </div>
      )}

      {/* Grid of Trips */}
      <div className="grid">
        {filteredTrips.map(trip => (
          <div key={trip.id} className="card" onClick={() => setSelectedTrip(trip)} style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="card-content" style={{ flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0 }}>{trip.name}</h3>
                <span className={`tag-badge ${trip.visited === 1 ? 'visited' : ''}`} style={{ background: trip.visited === 1 ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)', color: trip.visited === 1 ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {trip.visited === 1 ? 'Completed' : 'Planned'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                📅 {formatStartDate(trip.start_date)} ({trip.length || 1} {trip.length === 1 ? 'day' : 'days'})
              </p>
              {getTripNotesDescription(trip) && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>{getTripNotesDescription(trip).substring(0, 80)}...</p>}
            </div>
            <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleActiveTrip(trip.id);
                }}
                className="btn btn-secondary"
                style={{ 
                  marginTop: '10px', 
                  padding: '6px 12px', 
                  fontSize: '0.75rem', 
                  background: activeTripId.toString() === trip.id.toString() ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                  borderColor: activeTripId.toString() === trip.id.toString() ? 'var(--accent-primary)' : 'var(--border-glass)',
                  color: activeTripId.toString() === trip.id.toString() ? '#000' : '#fff',
                  width: 'auto',
                  fontWeight: 600
                }}
              >
                {activeTripId.toString() === trip.id.toString() ? '⭐ Active Trip' : 'Set as Active'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Trip Details Dialog/Overlay */}
      {selectedTrip && !showAddForm && !show3ColumnWorkspace && (
        <div className="modal-backdrop no-print" onClick={() => setSelectedTrip(null)} />
      )}
      </div>

      {selectedTrip && !showAddForm && !show3ColumnWorkspace && (
        <div className="trip-details-overlay" style={{ overflowY: 'auto' }}>
          <div style={{
            background: 'var(--bg-surface)', width: '100%',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div className="dialog-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {isEditingTripMeta ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ fontSize: '1.2rem', fontWeight: 'bold', padding: '4px 8px', height: '38px', background: '#14131a', border: '1px solid var(--border-glass)' }}
                      value={editTripName}
                      onChange={(e) => setEditTripName(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="date" 
                        className="form-control" 
                        style={{ width: '140px', fontSize: '0.8rem', height: '30px', padding: '2px 6px', background: '#14131a', border: '1px solid var(--border-glass)' }}
                        value={editTripStartDate}
                        onClick={(e) => e.target.showPicker()}
                        onChange={(e) => setEditTripStartDate(e.target.value)}
                      />
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Length"
                        className="form-control" 
                        style={{ width: '90px', fontSize: '0.8rem', height: '30px', padding: '2px 6px', background: '#14131a', border: '1px solid var(--border-glass)' }}
                        value={editTripLength === 0 || editTripLength === '' ? '' : editTripLength}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditTripLength(val === '' ? '' : parseInt(val, 10));
                        }}
                      />
                      <button 
                        className="btn btn-primary"
                        style={{ width: 'auto', height: '30px', padding: '4px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }}
                        onClick={async () => {
                          const len = Math.max(1, parseInt(editTripLength, 10) || 1);
                          let calculatedEndDate = null;
                          if (editTripStartDate && editTripStartDate !== 'null') {
                            const start = new Date(editTripStartDate);
                            start.setDate(start.getDate() + (len - 1));
                            calculatedEndDate = start.toISOString().split('T')[0];
                          }
                          const updated = {
                            ...selectedTrip,
                            name: editTripName,
                            start_date: editTripStartDate || null,
                            end_date: calculatedEndDate,
                            length: len
                          };
                          await queueSyncAction('trips', 'update', updated);
                          setSelectedTrip(updated);
                          setIsEditingTripMeta(false);
                        }}
                      >
                        Save
                      </button>
                      <button 
                        className="btn btn-secondary"
                        style={{ width: 'auto', height: '30px', padding: '4px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }}
                        onClick={() => setIsEditingTripMeta(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0 }}>{currentTrip.name}</h2>
                      <button 
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '2px 8px', fontSize: '0.7rem', height: '24px', display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'none' }}
                        onClick={startEditingTrip}
                      >
                        Edit Details
                      </button>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      📅 {formatStartDate(currentTrip.start_date)} ({currentTrip.length || 1} {currentTrip.length === 1 ? 'day' : 'days'})
                    </p>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="photo-action-btn" onClick={() => setShow3ColumnWorkspace(true)} title="Interactive Map View">
                    <Map size={16} />
                  </button>
                  <button className="photo-action-btn" onClick={() => setShowPrintOptions(true)} title="Print Trip Plan">
                    <Printer size={16} />
                  </button>
                  <button 
                    className="photo-action-btn" 
                    onClick={() => handleToggleActiveTrip(currentTrip.id)}
                    style={{ 
                      color: activeTripId === currentTrip.id.toString() ? 'var(--accent-primary-hover)' : 'var(--text-secondary)'
                    }}
                    title={activeTripId === currentTrip.id.toString() ? "Active Trip (Pinned)" : "Set as Active Trip"}
                  >
                    <Star size={16} fill={activeTripId === currentTrip.id.toString() ? 'var(--accent-primary-hover)' : 'none'} />
                  </button>
                  <button 
                    className="photo-action-btn" 
                    onClick={() => handleToggleTripVisited(currentTrip)}
                    style={{ color: currentTrip.visited === 1 ? 'var(--success)' : 'var(--text-secondary)' }}
                  >
                    <CheckSquare size={16} />
                  </button>
                  <button className="photo-action-btn" onClick={() => handleDeleteTrip(currentTrip.id)}>
                    <Trash2 size={16} />
                  </button>
                  <button className="photo-action-btn" onClick={() => setSelectedTrip(null)}>
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Print Header (Visible only when printing) */}
            <div className="print-only" style={{ display: 'none', padding: '24px', borderBottom: '2px solid #000' }}>
              <h1 style={{ color: '#000' }}>{currentTrip.name}</h1>
              <p>Trip Duration: {formatStartDate(currentTrip.start_date)} ({currentTrip.length || 1} {currentTrip.length === 1 ? 'day' : 'days'})</p>
              <hr style={{ margin: '12px 0' }} />
            </div>

            {/* Main Content Area */}
            <div className="dialog-body" style={{ flexGrow: 1, padding: '24px', maxHeight: 'none', overflowY: 'visible' }}>
              
              {/* Budget Spend Tracker */}
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Budget Spend Tracker</h3>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      <span>Spent: <b style={{ color: 'var(--text-primary)' }}>{actualBudget.toFixed(2)} {baseCurrency}</b></span>
                      <span>Limit: <b style={{ color: 'var(--text-primary)' }}>{plannedBudget.toFixed(2)} {baseCurrency}</b></span>
                    </div>
                  </div>

                  {/* Actions toolbar */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => {
                        setShowBudgetLimitForm(!showBudgetLimitForm);
                        setShowAddExpenseForm(false);
                        setShowRatesForm(false);
                      }}
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Update Planned Budget Limit"
                    >
                      <DollarSign size={14} /> <span className="desktop-only">Set Limit</span>
                    </button>
                    <button 
                      onClick={() => {
                        setShowAddExpenseForm(!showAddExpenseForm);
                        setShowBudgetLimitForm(false);
                        setShowRatesForm(false);
                      }}
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Add Expense"
                    >
                      <Plus size={14} /> <span className="desktop-only">Add Expense</span>
                    </button>
                    {getTripIsInternational(selectedTrip) && (
                      <button 
                        onClick={() => {
                          setShowRatesForm(!showRatesForm);
                          setShowBudgetLimitForm(false);
                          setShowAddExpenseForm(false);
                        }}
                        className="btn btn-secondary"
                        style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Update Conversion Rates"
                      >
                        <RefreshCw size={14} /> <span className="desktop-only">Rates</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Tracker Slider progress */}
                <div className="budget-progress-container">
                  <div 
                    className={`budget-progress-bar ${actualBudget > plannedBudget ? 'over' : ''}`}
                    style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                  />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'right', margin: 0 }}>
                  {budgetPercentage.toFixed(0)}% of limit reached
                </p>

                {/* Collapsible Forms inside Tracker */}
                {showBudgetLimitForm && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-glass)', marginTop: '16px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Update Planned Budget Limit ({baseCurrency})</label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <input
                        type="number"
                        placeholder="e.g. 1500"
                        className="form-control"
                        value={plannedBudgetInput}
                        onChange={(e) => setPlannedBudgetInput(e.target.value)}
                        style={{ maxWidth: '200px' }}
                      />
                      <button 
                        onClick={() => {
                          handleUpdateTripConfig({ plannedBudget: parseFloat(plannedBudgetInput) || 0 });
                          setShowBudgetLimitForm(false);
                        }}
                        className="btn btn-primary"
                        style={{ width: 'auto' }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {showRatesForm && getTripIsInternational(selectedTrip) && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-glass)', marginTop: '16px' }}>
                    <h4 style={{ marginBottom: '8px', fontSize: '0.9rem' }}>Convert Currencies manually (Base: {baseCurrency})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      {rates.filter(r => r.trip_id === selectedTrip.id).map(r => (
                        <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                          1 {r.currency} = {r.rate} {baseCurrency}
                          <X size={12} style={{ cursor: 'pointer' }} onClick={() => queueSyncAction('trip_currency_rates', 'delete', { id: r.id })} />
                        </span>
                      ))}
                    </div>
                    <form onSubmit={(e) => { handleAddRate(e); setShowRatesForm(false); }} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem' }}>Currency</label>
                        <input type="text" className="form-control" placeholder="e.g. EUR" value={targetCur} onChange={(e) => setTargetCur(e.target.value)} required />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem' }}>Conversion Rate (to {baseCurrency})</label>
                        <input type="number" step="any" className="form-control" placeholder="e.g. 1.08" value={curRate} onChange={(e) => setCurRate(e.target.value)} required />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '10px 16px' }}>Add Rate</button>
                    </form>
                  </div>
                )}

                {showAddExpenseForm && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-glass)', marginTop: '16px' }}>
                    <form onSubmit={(e) => { handleAddExpense(e); setShowAddExpenseForm(false); localStorage.setItem(`last_currency_used_${selectedTrip.id}`, expCurrency); }}>
                      <h4 style={{ marginBottom: '12px' }}>+ Record Expense</h4>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Amount</label>
                          <input type="number" step="any" required className="form-control" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Currency</label>
                          <select className="form-control" value={expCurrency} onChange={(e) => setExpCurrency(e.target.value)}>
                            {!getTripIsInternational(selectedTrip) ? (
                              <option value={baseCurrency}>{baseCurrency}</option>
                            ) : (
                              [baseCurrency, ...rates.filter(r => r.trip_id === selectedTrip.id).map(r => r.currency)].filter((val, idx, self) => self.indexOf(val) === idx).map(cur => (
                                <option key={cur} value={cur}>{cur}</option>
                              ))
                            )}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Date</label>
                          {(!expDate || itineraryDays.some(d => d.date === expDate)) ? (
                            <select 
                              className="form-control" 
                              required
                              value={expDate} 
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                  setExpDate('custom-temp');
                                } else {
                                  setExpDate(val);
                                }
                              }}
                            >
                              <option value="">Select Date</option>
                              {itineraryDays.map(d => (
                                <option key={d.date} value={d.date}>{d.label}</option>
                              ))}
                              <option value="custom">📅 Custom Date...</option>
                            </select>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input 
                                type="date" 
                                required 
                                className="form-control" 
                                value={expDate === 'custom-temp' ? '' : expDate} 
                                onChange={(e) => setExpDate(e.target.value)} 
                              />
                              <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={() => setExpDate('')}
                                style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', height: '34px' }}
                              >
                                Reset
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Category</label>
                          <select className="form-control" value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                            <option value="Food">🍽️ Food / Dining</option>
                            <option value="Hotel">🏨 Hotel / Stay</option>
                            <option value="Dinner">🍽️ Dinner</option>
                            <option value="Lunch">🍲 Lunch</option>
                            <option value="Snacks">☕ Snacks</option>
                            <option value="Transportation">🚕 Transportation</option>
                            <option value="Fuel">⛽ Fuel</option>
                            <option value="Entertainment">🎟️ Entertainment</option>
                            <option value="Other">💼 Miscellaneous</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group" style={{ marginTop: '12px' }}>
                        <label>Notes</label>
                        <input type="text" className="form-control" placeholder="Short description..." value={expNotes} onChange={(e) => setExpNotes(e.target.value)} />
                      </div>

                      <div className="form-group">
                        <label>Upload Receipt Photo (Optional)</label>
                        <input type="file" id="exp-file-input" className="form-control" onChange={(e) => setExpFile(e.target.files[0])} />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button type="button" onClick={() => setShowAddExpenseForm(false)} className="btn btn-secondary" style={{ width: 'auto' }}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>Save Expense</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {unmappedRecommendations.length > 0 && (
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={20} /> Unmapped AI Recommendations
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    AI suggested the following places that are not in your database. Click "+" to add them:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {unmappedRecommendations.map((rec, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                        <div>
                          <b style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{rec.name}</b>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '12px' }}>Suggested for: {rec.suggestedDay}</span>
                        </div>
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleSaveRecommendation(rec)}
                          style={{ width: 'auto', padding: '4px 8px', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={14} /> Add Place
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chronological Daily Itinerary */}
              <div className={!printOptItinerary ? 'no-print' : ''} style={{ background: 'var(--bg-surface-elevated)', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Chronological Daily Itinerary</h3>
                {itineraryDays.map(day => {
                  const dayItems = itineraries.filter(i => currentTrip && i.trip_id === currentTrip.id && i.date === day.date)
                                              .sort((a,b) => a.sequence_order - b.sequence_order);
                  return (
                    <ItineraryDay 
                      key={day.date} 
                      date={day.date} 
                      label={day.label} 
                      items={dayItems} 
                      places={places}
                      distances={distances}
                      reservations={reservations}
                      selectedTrip={currentTrip}
                      tripModeActive={tripModeActive}
                      handleViewAttachment={handleViewAttachment}
                      handleDeleteReservation={handleDeleteReservation}
                      handleDeleteItineraryItem={handleDeleteItineraryItem}
                      fetchOSRMDistance={fetchOSRMDistance}
                      getHaversine={getHaversine}
                    />
                  );
                })}
              </div>

              {/* Trip Reservations */}
              <div className={!printOptReservations ? 'no-print' : ''} style={{ background: 'var(--bg-surface-elevated)', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3>Trip Reservations</h3>
                  {!tripModeActive && (
                    <button 
                      onClick={() => {
                        setShowMainTravelForm(!showMainTravelForm);
                        setMainResTitle('');
                        setMainResDetails('');
                        setMainResCost('');
                        setMainResFile(null);
                        setEditingReservationId(null);
                      }}
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      {editingReservationId ? 'Cancel Edit' : (showMainTravelForm ? 'Cancel' : '+ Add Reservation')}
                    </button>
                  )}
                </div>

                {showMainTravelForm && (
                  <form onSubmit={handleAddMainReservation} style={{ background: '#1c1b22', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Type</label>
                        <select className="form-control" style={{ height: '32px', padding: '4px 8px', fontSize: '0.8rem' }} value={mainResType} onChange={(e) => setMainResType(e.target.value)}>
                          <option value="Air">✈️ Air</option>
                          <option value="Bus">🚌 Bus</option>
                          <option value="Train">🚉 Train</option>
                          <option value="Ferry">🚢 Ferry</option>
                          <option value="Car">🚗 Car / Taxi</option>
                          <option value="Stay">🏨 Stay</option>
                          <option value="Activity">🎟️ Activity</option>
                        </select>
                      </div>
                      <div style={{ flex: 2 }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Reservation Title</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="e.g. Flight to Tokyo" 
                          className="form-control" 
                          style={{ height: '32px', padding: '4px 8px', fontSize: '0.8rem' }} 
                          value={mainResTitle}
                          onChange={(e) => setMainResTitle(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Cost ({baseCurrency})</label>
                        <input 
                          type="number" 
                          placeholder="Optional cost" 
                          className="form-control" 
                          style={{ height: '32px', padding: '4px 8px', fontSize: '0.8rem' }} 
                          value={mainResCost}
                          onChange={(e) => setMainResCost(e.target.value)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Associated Date (Optional)</label>
                        <select id="main-res-date-select" className="form-control" style={{ height: '32px', padding: '4px 8px', fontSize: '0.8rem' }}>
                          <option value="">No specific date</option>
                          {itineraryDays.map(day => (
                            <option key={day.date} value={day.date}>{day.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Details / Confirmation #</label>
                      <textarea 
                        rows="2" 
                        placeholder="Add addresses, booking references, etc." 
                        className="form-control" 
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }} 
                        value={mainResDetails}
                        onChange={(e) => setMainResDetails(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Document / PDF (Optional)</label>
                      <input 
                        type="file" 
                        className="form-control" 
                        style={{ fontSize: '0.8rem', padding: '4px' }} 
                        onChange={(e) => setMainResFile(e.target.files[0])}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => { setShowMainTravelForm(false); setEditingReservationId(null); }} className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}>Cancel</button>
                      <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}>
                        {editingReservationId ? 'Update Reservation' : 'Save Reservation'}
                      </button>
                    </div>
                  </form>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Type</th>
                        <th style={{ padding: '8px' }}>Title</th>
                        <th style={{ padding: '8px' }}>Details</th>
                        <th style={{ padding: '8px' }}>Doc</th>
                        <th style={{ padding: '8px' }}>Done</th>
                        {!tripModeActive && <th style={{ padding: '8px' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.filter(r => {
                        if (r.trip_id !== selectedTrip.id) return false;
                        if (tripModeActive && r.completed === 1) return false;
                        return true;
                      }).map(res => (
                        <tr key={res.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px', textTransform: 'uppercase', color: 'var(--accent-secondary)' }}>{res.type}</td>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{res.title}</td>
                          <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                            {res.details && (typeof res.details === 'string' ? JSON.parse(res.details).notes : res.details.notes)}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {res.file_path && (
                              <button className="photo-action-btn" onClick={() => handleViewAttachment(res)}>
                                <FileText size={12} />
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="checkbox" 
                              checked={res.completed === 1} 
                              onChange={async (e) => {
                                const updated = { ...res, completed: e.target.checked ? 1 : 0 };
                                await queueSyncAction('reservations', 'update', updated);
                              }}
                              style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                            />
                          </td>
                          {!tripModeActive && (
                            <td style={{ padding: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button className="photo-action-btn" onClick={() => handleStartEditReservation(res)} title="Edit Reservation">
                                <Edit size={12} />
                              </button>
                              <button className="photo-action-btn" onClick={() => handleDeleteReservation(res)} title="Delete Reservation">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expenses List & Graph */}
              {!tripModeActive && (
                <div className={!printOptExpenses ? 'no-print' : ''} style={{ background: 'var(--bg-surface-elevated)', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Trip Expenses</h3>
                  
                  {tripExpensesList.length > 0 && (
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '150px', display: 'flex', justifyContent: 'center' }}>
                        <svg viewBox="0 0 100 100" style={{ maxWidth: '150px', maxHeight: '150px' }}>
                          {(() => {
                            const categories = {};
                            tripExpensesList.forEach(e => {
                              const converted = getConvertedAmount(e.amount, e.currency);
                              categories[e.category] = (categories[e.category] || 0) + converted;
                            });
                            const total = Object.values(categories).reduce((a, b) => a + b, 0);
                            let currentAngle = 0;
                            const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
                            
                            return Object.keys(categories).map((cat, i) => {
                              const val = categories[cat];
                              const percentage = val / total;
                              const angle = percentage * 360;
                              
                              const getCoordinatesForPercent = (percent) => {
                                const x = Math.cos(2 * Math.PI * percent);
                                const y = Math.sin(2 * Math.PI * percent);
                                return [x, y];
                              };

                              const [startX, startY] = getCoordinatesForPercent(currentAngle / 360);
                              currentAngle += angle;
                              const [endX, endY] = getCoordinatesForPercent(currentAngle / 360);
                              const largeArcFlag = percentage > 0.5 ? 1 : 0;
                              
                              const sx = 50 + startX * 40;
                              const sy = 50 + startY * 40;
                              const ex = 50 + endX * 40;
                              const ey = 50 + endY * 40;

                              if (percentage >= 0.999) {
                                return (
                                  <circle 
                                    key={cat}
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill={colors[i % colors.length]}
                                    title={`${cat}: ${val.toFixed(2)}`}
                                  />
                                );
                              }

                              return (
                                <path 
                                  key={cat}
                                  d={`M 50 50 L ${sx} ${sy} A 40 40 0 ${largeArcFlag} 1 ${ex} ${ey} Z`}
                                  fill={colors[i % colors.length]}
                                  title={`${cat}: ${val.toFixed(2)}`}
                                />
                              );
                            });
                          })()}
                        </svg>
                      </div>
                      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(() => {
                          const categories = {};
                          tripExpensesList.forEach(e => {
                            const converted = getConvertedAmount(e.amount, e.currency);
                            categories[e.category] = (categories[e.category] || 0) + converted;
                          });
                          const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
                          return Object.keys(categories).map((cat, i) => (
                            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                              <div style={{ width: '12px', height: '12px', background: colors[i % colors.length], borderRadius: '2px' }} />
                              <span>{cat}: <b>{categories[cat].toFixed(2)} {baseCurrency}</b></span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>Category</th>
                          <th style={{ padding: '8px' }}>Notes</th>
                          <th style={{ padding: '8px' }}>Amount</th>
                          <th style={{ padding: '8px' }}>Date</th>
                          <th style={{ padding: '8px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tripExpensesList.map(exp => {
                          const isEditing = editingExpenseId === exp.id;
                          return (
                            <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <td style={{ padding: '8px' }}>
                                {isEditing ? (
                                  <select 
                                    className="form-control" 
                                    style={{ height: '30px', padding: '2px 6px', fontSize: '0.8rem', background: '#1c1b22', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                                    value={editExpCategory} 
                                    onChange={(e) => setEditExpCategory(e.target.value)}
                                  >
                                    <option value="Food">🍽️ Food</option>
                                    <option value="Hotel">🏨 Hotel</option>
                                    <option value="Lodging">🏡 Lodging</option>
                                    <option value="Dinner">🍽️ Dinner</option>
                                    <option value="Lunch">🍲 Lunch</option>
                                    <option value="Snacks">☕ Snacks</option>
                                    <option value="Transportation">🚕 Transportation</option>
                                    <option value="Fuel">⛽ Fuel</option>
                                    <option value="Entertainment">🎟️ Entertainment</option>
                                    <option value="Other">💼 Other</option>
                                  </select>
                                ) : (
                                  <span 
                                    className="tag-badge" 
                                    style={{ 
                                      backgroundColor: `${getCategoryColor(exp.category)}1A`, 
                                      color: getCategoryColor(exp.category), 
                                      border: `1px solid ${getCategoryColor(exp.category)}33`,
                                      fontSize: '0.65rem' 
                                    }}
                                  >
                                    {exp.category}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                                {isEditing ? (
                                  <input 
                                    type="text" 
                                    className="form-control" 
                                    style={{ height: '30px', padding: '2px 6px', fontSize: '0.8rem', background: '#1c1b22', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                                    value={editExpNotes} 
                                    onChange={(e) => setEditExpNotes(e.target.value)}
                                  />
                                ) : (
                                  exp.notes
                                )}
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <input 
                                      type="number" 
                                      className="form-control" 
                                      style={{ height: '30px', padding: '2px 6px', fontSize: '0.8rem', width: '70px', background: '#1c1b22', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                                      value={editExpAmount} 
                                      onChange={(e) => setEditExpAmount(e.target.value)}
                                    />
                                    <select
                                      className="form-control"
                                      style={{ height: '30px', padding: '2px 6px', fontSize: '0.8rem', width: '70px', background: '#1c1b22', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                                      value={editExpCurrency}
                                      onChange={(e) => setEditExpCurrency(e.target.value)}
                                    >
                                      <option value="USD">USD</option>
                                      {rates.filter(r => r.trip_id === selectedTrip.id).map(r => (
                                        <option key={r.id} value={r.currency}>{r.currency}</option>
                                      ))}
                                      {editExpCurrency !== 'USD' && !rates.some(r => r.trip_id === selectedTrip.id && r.currency === editExpCurrency) && (
                                        <option value={editExpCurrency}>{editExpCurrency}</option>
                                      )}
                                    </select>
                                  </div>
                                ) : (
                                  <>
                                    {exp.amount} {exp.currency} 
                                    {exp.currency !== baseCurrency && ` (~${getConvertedAmount(exp.amount, exp.currency).toFixed(2)} ${baseCurrency})`}
                                  </>
                                )}
                              </td>
                              <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                                {isEditing ? (
                                  <input 
                                    type="date" 
                                    className="form-control" 
                                    style={{ height: '30px', padding: '2px 6px', fontSize: '0.8rem', background: '#1c1b22', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px' }}
                                    value={editExpDate} 
                                    onChange={(e) => setEditExpDate(e.target.value)}
                                  />
                                ) : (
                                  exp.date
                                )}
                              </td>
                              <td style={{ padding: '8px' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="photo-action-btn" onClick={() => handleSaveEditedExpense(exp.id)} title="Save changes">
                                      <CheckSquare size={12} style={{ color: 'var(--success)' }} />
                                    </button>
                                    <button className="photo-action-btn" onClick={() => setEditingExpenseId(null)} title="Cancel">
                                      <X size={12} style={{ color: 'var(--error)' }} />
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="photo-action-btn" onClick={() => handleStartEditExpense(exp)} title="Edit expense">
                                      <Edit size={12} />
                                    </button>
                                    <button className="photo-action-btn" onClick={() => handleDeleteExpense(exp)} title="Delete expense">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showPrintOptions && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: '#fff' }}>Select Sections to Print</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={printOptItinerary} 
                  onChange={(e) => setPrintOptItinerary(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span style={{ color: '#fff', fontSize: '0.9rem' }}>Chronological Daily Itinerary</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={printOptReservations} 
                  onChange={(e) => setPrintOptReservations(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span style={{ color: '#fff', fontSize: '0.9rem' }}>Trip Reservations</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={printOptExpenses} 
                  onChange={(e) => setPrintOptExpenses(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                 <span style={{ color: '#fff', fontSize: '0.9rem' }}>Trip Expenses</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowPrintOptions(false)} 
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  setShowPrintOptions(false);
                  setTimeout(() => {
                    window.print();
                  }, 300);
                }} 
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Print Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {showFullScreenMap && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-app)', display: 'flex', zIndex: 1100
        }}>
          <div style={{ flex: '1 1 70%', position: 'relative', height: '100%' }}>
            <MapView 
              points={mapPoints} 
              drawLine={showNavigationLines} 
            />
            <button 
              className="photo-action-btn" 
              onClick={() => setShowFullScreenMap(false)}
              style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1200, width: '36px', height: '36px' }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{
            flex: '0 0 30%', minWidth: '320px', background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column',
            height: '100%', overflow: 'hidden'
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Interactive Itinerary</h3>
              <button className="btn btn-secondary" onClick={() => setShowFullScreenMap(false)} style={{ width: 'auto', padding: '4px 10px', margin: 0 }}>Done</button>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px' }}>
              {itineraryDays.map(day => {
                const dayItems = itineraries
                  .filter(i => i.trip_id === selectedTrip.id && i.date === day.date)
                  .sort((a,b) => a.sequence_order - b.sequence_order);

                return (
                  <div key={day.date} style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', color: 'var(--text-primary)' }}>
                      {day.label}
                    </h4>
                    
                    {dayItems.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0 8px' }}>No stops planned.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {dayItems.map((item, idx) => {
                          const place = places.find(p => p.id === item.place_id);
                          return (
                            <div 
                              key={item.id} 
                              style={{
                                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)',
                                padding: '10px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div style={{ overflow: 'hidden', marginRight: '8px', flexGrow: 1 }}>
                                <b style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                  {idx + 1}. {place ? place.name : 'Unknown Stop'}
                                </b>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                <select
                                  value={item.date}
                                  onChange={async (e) => {
                                    const newDate = e.target.value;
                                    const targetDayItems = itineraries.filter(i => i.trip_id === selectedTrip.id && i.date === newDate);
                                    const updated = {
                                      ...item,
                                      date: newDate,
                                      sequence_order: targetDayItems.length + 1,
                                      distance_from_prev: null,
                                      duration_from_prev: null
                                    };
                                    await queueSyncAction('itinerary_items', 'update', updated);
                                  }}
                                  style={{ padding: '2px 4px', fontSize: '0.75rem', background: 'var(--bg-app)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '4px' }}
                                >
                                  {itineraryDays.map(d => (
                                    <option key={d.date} value={d.date}>{d.label.split(' (')[0]}</option>
                                  ))}
                                </select>
                                <button
                                  disabled={idx === 0}
                                  onClick={async () => {
                                    const prevItem = dayItems[idx - 1];
                                    const updCurrent = { ...item, sequence_order: prevItem.sequence_order, distance_from_prev: null, duration_from_prev: null };
                                    const updPrev = { ...prevItem, sequence_order: item.sequence_order, distance_from_prev: null, duration_from_prev: null };
                                    await queueSyncAction('itinerary_items', 'update', updCurrent);
                                    await queueSyncAction('itinerary_items', 'update', updPrev);
                                  }}
                                  style={{ padding: '2px 4px', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: idx === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                >
                                  ▲
                                </button>
                                <button
                                  disabled={idx === dayItems.length - 1}
                                  onClick={async () => {
                                    const nextItem = dayItems[idx + 1];
                                    const updCurrent = { ...item, sequence_order: nextItem.sequence_order, distance_from_prev: null, duration_from_prev: null };
                                    const updNext = { ...nextItem, sequence_order: item.sequence_order, distance_from_prev: null, duration_from_prev: null };
                                    await queueSyncAction('itinerary_items', 'update', updCurrent);
                                    await queueSyncAction('itinerary_items', 'update', updNext);
                                  }}
                                  style={{ padding: '2px 4px', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: idx === dayItems.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {show3ColumnWorkspace && selectedTrip && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-app)', display: 'flex', zIndex: 1100,
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '16px 24px', background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-glass)', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Planning Workspace: {selectedTrip.name}</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Drag places/folders from Column 3 to assign them to itinerary days in Column 2. All updates are auto-saved.
              </p>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={() => {
                setShow3ColumnWorkspace(false);
                setSelectedTrip(selectedTrip);
              }}
              style={{ width: 'auto', padding: '8px 24px', margin: 0 }}
            >
              Done
            </button>
          </div>

          {isMobile && (
            <div style={{
              display: 'flex',
              background: 'var(--bg-surface-elevated)',
              borderBottom: '1px solid var(--border-glass)',
              padding: '8px 12px',
              gap: '8px',
              justifyContent: 'space-between'
            }}>
              <button
                onClick={() => setActiveMobilePane('map')}
                className="btn"
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: '0.8rem',
                  padding: '6px',
                  background: activeMobilePane === 'map' ? 'var(--accent-primary)' : 'transparent',
                  color: activeMobilePane === 'map' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '4px'
                }}
              >
                🗺️ Map
              </button>
              <button
                onClick={() => setActiveMobilePane('itinerary')}
                className="btn"
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: '0.8rem',
                  padding: '6px',
                  background: activeMobilePane === 'itinerary' ? 'var(--accent-primary)' : 'transparent',
                  color: activeMobilePane === 'itinerary' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '4px'
                }}
              >
                📅 Itinerary
              </button>
              <button
                onClick={() => setActiveMobilePane('bank')}
                className="btn"
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: '0.8rem',
                  padding: '6px',
                  background: activeMobilePane === 'bank' ? 'var(--accent-primary)' : 'transparent',
                  color: activeMobilePane === 'bank' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '4px'
                }}
              >
                📍 Places Bank
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            
            <div style={{
              flex: isMobile ? '1 1 100%' : '0 0 35%',
              borderRight: isMobile ? 'none' : '1px solid var(--border-glass)',
              display: isMobile && activeMobilePane !== 'map' ? 'none' : 'flex',
              flexDirection: 'column',
              height: '100%',
              position: 'relative'
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Trip Map</h3>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowNavigationLines(prev => !prev)}
                  style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: '28px', margin: 0 }}
                >
                  {showNavigationLines ? '🗺️ Hide Routes' : '🚗 Generate Navigation'}
                </button>
              </div>
              <div style={{ flexGrow: 1, position: 'relative' }}>
                <MapView 
                  points={mapPoints} 
                  drawLine={showNavigationLines} 
                />
              </div>
            </div>

            <div style={{
              flex: isMobile ? '1 1 100%' : '0 0 35%',
              borderRight: isMobile ? 'none' : '1px solid var(--border-glass)',
              display: isMobile && activeMobilePane !== 'itinerary' ? 'none' : 'flex',
              flexDirection: 'column',
              height: '100%',
              background: 'var(--bg-surface)'
            }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Itinerary Days</h3>
              </div>
              <div style={{ flexGrow: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {itineraryDays.map((day, dIdx) => {
                  const dayItems = itineraries
                    .filter(i => i.trip_id === selectedTrip.id && i.date === day.date)
                    .sort((a,b) => a.sequence_order - b.sequence_order);
                  const color = dayColors[dIdx % dayColors.length];
                  
                  // Calculate active day itinerary stops & hotels in sequence
                  const dayElements = [];
                  
                  let hotelsObj = {};
                  try {
                    const notesObj = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
                    hotelsObj = notesObj.hotels || {};
                  } catch(e) {}

                  const dayHotelId = hotelsObj[day.date];
                  if (dayHotelId) {
                    const hotelPlace = places.find(p => p.id === dayHotelId);
                    if (hotelPlace) {
                      dayElements.push({ place: hotelPlace, isHotel: true, label: '🏠 Start Stay' });
                    }
                  }

                  dayItems.forEach(item => {
                    const stopPlace = places.find(p => p.id === item.place_id);
                    if (stopPlace) {
                      dayElements.push({ place: stopPlace, itemObj: item, isHotel: false });
                    }
                  });

                  const nextDay = itineraryDays[dIdx + 1];
                  if (nextDay) {
                    const nextHotelId = hotelsObj[nextDay.date];
                    if (nextHotelId) {
                      const nextHotelPlace = places.find(p => p.id === nextHotelId);
                      if (nextHotelPlace) {
                        dayElements.push({ place: nextHotelPlace, isHotel: true, label: '🏠 End Stay' });
                      }
                    }
                  }

                  // Calculate distances list for this day
                  const dayDistancesList = [];
                  let dayTotalDistance = 0;
                  for (let i = 1; i < dayElements.length; i++) {
                    const p1 = dayElements[i - 1].place;
                    const p2 = dayElements[i].place;
                    if (p1 && p2) {
                      if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) {
                        dayDistancesList.push({ distance: 0, duration: 0 });
                        continue;
                      }
                      const key = `${p1.id}-${p2.id}`;
                      let distObj = distances[key];
                      if (distObj === undefined) {
                        fetchOSRMDistance(p1, p2);
                        const hav = getHaversine(p1, p2);
                        distObj = { distance: hav, duration: Math.round(hav / 40 * 60) };
                      }
                      dayDistancesList.push(distObj);
                      dayTotalDistance += (typeof distObj === 'object' ? distObj.distance : distObj);
                    } else {
                      dayDistancesList.push({ distance: 0, duration: 0 });
                    }
                  }
                  dayTotalDistance = Math.round(dayTotalDistance * 10) / 10;

                  return (
                    <div 
                      key={day.date}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const rawData = e.dataTransfer.getData('text/plain');
                        if (!rawData) return;
                        try {
                          const data = JSON.parse(rawData);
                          const scheduledPlaceIds = itineraries.filter(i => i.trip_id === selectedTrip.id).map(i => i.place_id);
                          if (data.type === 'place') {
                            const p = places.find(x => x.id === data.id);
                            const cat = p?.category?.toLowerCase() || '';
                            const isExcluded = cat.includes('hotel') || cat.includes('resort') || cat.includes('cafe') || cat.includes('stay');
                            if (isExcluded) return;

                            if (data.sourceDay) {
                              if (data.sourceDay === day.date) return;
                              const sourceItem = itineraries.find(i => i.trip_id === selectedTrip.id && i.date === data.sourceDay && i.place_id === data.id);
                              if (sourceItem) {
                                const updated = {
                                  ...sourceItem,
                                  date: day.date,
                                  sequence_order: dayItems.length + 1,
                                  distance_from_prev: null,
                                  duration_from_prev: null
                                };
                                await queueSyncAction('itinerary_items', 'update', updated);
                              }
                            } else {
                              if (dayItems.some(i => i.place_id === data.id)) return;
                              const newItem = {
                                id: generateUUID(),
                                trip_id: selectedTrip.id,
                                date: day.date,
                                place_id: data.id,
                                sequence_order: dayItems.length + 1,
                                distance_from_prev: null,
                                duration_from_prev: null
                              };
                              await queueSyncAction('itinerary_items', 'insert', newItem);
                            }
                          } else if (data.type === 'folder') {
                            const folderPlaces = places.filter(p => {
                              if (p.location_id !== data.id) return false;
                              if (scheduledPlaceIds.includes(p.id)) return false;
                              const cat = p.category?.toLowerCase() || '';
                              const isExcluded = cat.includes('hotel') || cat.includes('resort') || cat.includes('cafe') || cat.includes('stay');
                              return !isExcluded;
                            });
                            let addedCount = 0;
                            for (const fp of folderPlaces) {
                              if (dayItems.some(i => i.place_id === fp.id)) continue;
                              const newItem = {
                                id: generateUUID(),
                                trip_id: selectedTrip.id,
                                date: day.date,
                                place_id: fp.id,
                                sequence_order: dayItems.length + addedCount + 1,
                                distance_from_prev: null,
                                duration_from_prev: null
                              };
                              await queueSyncAction('itinerary_items', 'insert', newItem);
                              addedCount++;
                            }
                          }
                        } catch (err) {
                          console.error('Drop error:', err);
                        }
                      }}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: `2px dashed ${color}`,
                        borderRadius: '6px',
                        padding: '12px'
                      }}
                    >
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {day.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                          Total: {dayTotalDistance} km
                        </span>
                      </h4>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '6px 10px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>🏠 Stay:</span>
                        <select
                          className="form-control"
                          value={(() => {
                            try {
                              const notesObj = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
                              return notesObj.hotels ? notesObj.hotels[day.date] || '' : '';
                            } catch(e) { return ''; }
                          })()}
                          onChange={(e) => handleSelectHotel(day.date, e.target.value)}
                          style={{ flexGrow: 1, height: '26px', fontSize: '0.75rem', padding: '0 4px', background: 'transparent', border: 'none', color: 'var(--text-primary)', margin: 0 }}
                        >
                          <option value="" style={{ background: 'var(--bg-surface)' }}>-- Unassigned --</option>
                          {(() => {
                            const dayPlaces = dayItems.map(item => places.find(p => p.id === item.place_id)).filter(Boolean);
                            let dayLocIds = [...new Set(dayPlaces.map(p => p.location_id))];
                            
                            if (dayLocIds.length === 0 && selectedTrip) {
                              const sortedDays = [...itineraryDays].sort((a, b) => a.date.localeCompare(b.date));
                              const currentDayIdx = sortedDays.findIndex(d => d.date === day.date);
                              if (currentDayIdx > 0) {
                                for (let i = currentDayIdx - 1; i >= 0; i--) {
                                  const prevDayDate = sortedDays[i].date;
                                  const prevDayItems = itineraries.filter(item => item.trip_id === selectedTrip.id && item.date === prevDayDate);
                                  const prevPlaces = prevDayItems.map(item => places.find(p => p.id === item.place_id)).filter(Boolean);
                                  if (prevPlaces.length > 0) {
                                    dayLocIds = [prevPlaces[prevPlaces.length - 1].location_id];
                                    break;
                                  }
                                }
                              }
                            }
                            
                            const targetLocIds = dayLocIds.length > 0 ? dayLocIds : stopFilterLocationIds;

                            return places.filter(p => {
                              const cat = p.category?.toLowerCase() || '';
                              const isHotel = cat.includes('hotel') || cat.includes('stay') || cat.includes('resort');
                              if (!isHotel) return false;
                              return targetLocIds.length === 0 || targetLocIds.includes(p.location_id);
                            }).map(p => (
                              <option key={p.id} value={p.id} style={{ background: 'var(--bg-surface)' }}>{p.name} ({p.category})</option>
                            ));
                          })()}
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {dayElements.map((el, idx) => {
                          const place = el.place;
                          return (
                            <React.Fragment key={`${place.id}-${idx}`}>
                              {el.isHotel ? (
                                <div style={{
                                  background: 'rgba(139, 92, 246, 0.08)',
                                  border: `1px solid ${color}`,
                                  padding: '8px 12px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.8rem',
                                  fontWeight: 500
                                }}>
                                  <span style={{ color: 'var(--text-primary)' }}>
                                    {el.label}: {place.name}
                                  </span>
                                </div>
                              ) : (
                                <div 
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'place', id: el.itemObj.place_id, sourceDay: day.date }));
                                  }}
                                  style={{
                                    background: 'var(--bg-app)',
                                    border: '1px solid var(--border-glass)',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'grab'
                                  }}
                                >
                                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Stop: {place.name}
                                  </span>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      disabled={dayItems.indexOf(el.itemObj) === 0}
                                      onClick={async () => {
                                        const sIdx = dayItems.indexOf(el.itemObj);
                                        const prevItem = dayItems[sIdx - 1];
                                        const updCurrent = { ...el.itemObj, sequence_order: prevItem.sequence_order };
                                        const updPrev = { ...prevItem, sequence_order: el.itemObj.sequence_order };
                                        await queueSyncAction('itinerary_items', 'update', updCurrent);
                                        await queueSyncAction('itinerary_items', 'update', updPrev);
                                      }}
                                      style={{ padding: '2px 4px', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: dayItems.indexOf(el.itemObj) === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                    >
                                      ▲
                                    </button>
                                    <button
                                      disabled={dayItems.indexOf(el.itemObj) === dayItems.length - 1}
                                      onClick={async () => {
                                        const sIdx = dayItems.indexOf(el.itemObj);
                                        const nextItem = dayItems[sIdx + 1];
                                        const updCurrent = { ...el.itemObj, sequence_order: nextItem.sequence_order };
                                        const updNext = { ...nextItem, sequence_order: el.itemObj.sequence_order };
                                        await queueSyncAction('itinerary_items', 'update', updCurrent);
                                        await queueSyncAction('itinerary_items', 'update', updNext);
                                      }}
                                      style={{ padding: '2px 4px', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: dayItems.indexOf(el.itemObj) === dayItems.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                    >
                                      ▼
                                    </button>
                                    <button
                                      onClick={async () => {
                                        await handleDeleteItineraryItem(el.itemObj.id);
                                      }}
                                      style={{ padding: '2px 4px', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}

                              {idx < dayElements.length - 1 && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  background: 'rgba(255,255,255,0.03)',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  margin: '4px 16px',
                                  borderLeft: `2px solid ${color}`,
                                  gap: '6px'
                                }}>
                                  {(() => {
                                    const isUsingGmaps = typeof window !== 'undefined' && 
                                      window.google && 
                                      window.google.maps && 
                                      localStorage.getItem('google_maps_api_key') && 
                                      localStorage.getItem('google_maps_enabled') !== 'false';
                                    return (
                                      <>
                                        <img 
                                          src={isUsingGmaps ? "/gmaps.png" : "/osm.png"} 
                                          style={{ width: 12, height: 12, objectFit: 'contain' }} 
                                          alt={isUsingGmaps ? "GMaps" : "OSM"}
                                          title={isUsingGmaps ? "Route calculated via Google Maps" : "Route calculated via OpenStreetMap (OSRM)"}
                                        />
                                        <span>
                                          {dayDistancesList[idx] && typeof dayDistancesList[idx] === 'object' ? `${dayDistancesList[idx].distance} km (${dayDistancesList[idx].duration} mins)` : `${dayDistancesList[idx] || 0} km`} to next stop
                                        </span>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {dayItems.length === 0 && (
                          <div style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Drag places here to plan the day
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              flex: isMobile ? '1 1 100%' : '0 0 30%',
              display: isMobile && activeMobilePane !== 'bank' ? 'none' : 'flex',
              flexDirection: 'column',
              height: '100%',
              background: 'var(--bg-surface)',
              position: 'relative'
            }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Places Bank</h3>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowAddLocationDropdown(!showAddLocationDropdown)}
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: '28px', margin: 0 }}
                  >
                    ➕ Add Folder
                  </button>
                </div>

                {showAddLocationDropdown && (
                  <div style={{
                    position: 'absolute', top: '50px', right: '16px', background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '12px', zIndex: 1200,
                    width: '240px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Select folders to add:</h5>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {locations.filter(l => l.is_folder !== 1 && !stopFilterLocationIds.includes(l.id)).map(loc => (
                        <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0, color: 'var(--text-primary)' }}>
                          <input 
                            type="checkbox"
                            onChange={async (e) => {
                              if (e.target.checked) {
                                const updatedLocIds = [...stopFilterLocationIds, loc.id];
                                setStopFilterLocationIds(updatedLocIds);
                                
                                if (selectedTrip) {
                                  const existingNotes = typeof selectedTrip.notes === 'string' ? JSON.parse(selectedTrip.notes) : selectedTrip.notes || {};
                                  const savedLocIds = existingNotes.locationIds || [];
                                  if (!savedLocIds.includes(loc.id)) {
                                    existingNotes.locationIds = [...savedLocIds, loc.id];
                                    const updatedTrip = { ...selectedTrip, notes: JSON.stringify(existingNotes) };
                                    await queueSyncAction('trips', 'update', updatedTrip);
                                    setSelectedTrip(updatedTrip);
                                  }
                                }
                              }
                            }}
                          />
                          {loc.name}
                        </label>
                      ))}
                      {locations.filter(l => l.is_folder !== 1 && !stopFilterLocationIds.includes(l.id)).length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No other folders available.</span>
                      )}
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setShowAddLocationDropdown(false)}
                      style={{ width: '100%', height: '28px', fontSize: '0.75rem', marginTop: '10px', padding: 0 }}
                    >
                      Close
                    </button>
                  </div>
                )}

                <input 
                  type="text"
                  placeholder="Search bank..."
                  className="form-control"
                  style={{ height: '34px', fontSize: '0.85rem' }}
                  onChange={(e) => setStopPlaceSearch(e.target.value)}
                  value={stopPlaceSearch}
                />
              </div>

              <div style={{ flexGrow: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {locations
                  .filter(l => l.is_folder !== 1 && stopFilterLocationIds.includes(l.id))
                  .map(loc => {
                    const scheduledPlaceIds = itineraries
                      .filter(i => i.trip_id === selectedTrip.id)
                      .map(i => i.place_id);
                    const folderPlaces = places.filter(p => p.location_id === loc.id && !scheduledPlaceIds.includes(p.id) && (!stopPlaceSearch || p.name.toLowerCase().includes(stopPlaceSearch.toLowerCase())));

                    const activePlacesInLoc = places.filter(pl => pl.is_folder !== 1 && stopFilterLocationIds.includes(pl.location_id));
                    const sortedActivePlacesInLoc = [...activePlacesInLoc].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                    return (
                      <div key={loc.id} style={{ border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '10px', background: 'var(--bg-surface-elevated)' }}>
                        <div 
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', id: loc.id }));
                          }}
                          style={{
                            fontSize: '0.85rem', fontWeight: 600, cursor: 'grab', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', marginBottom: '8px'
                          }}
                        >
                          📁 <span>{loc.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '14px' }}>
                          {folderPlaces.map(p => {
                            const placeIdx = sortedActivePlacesInLoc.findIndex(x => x.id === p.id);
                            const placeNum = placeIdx !== -1 ? placeIdx + 1 : '';
                            return (
                              <div 
                                key={p.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'place', id: p.id }));
                                }}
                                style={{
                                  background: 'var(--bg-app)', border: '1px solid var(--border-glass)',
                                  padding: '6px 10px', borderRadius: '4px', cursor: 'grab', fontSize: '0.75rem',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-primary)'
                                }}
                              >
                                <span>📍 {placeNum ? `#${placeNum} ` : ''}{p.name}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>({p.category})</span>
                                  {isMobile && (
                                    <button
                                      onClick={() => handleMobileAddStop(p)}
                                      className="btn btn-primary"
                                      style={{
                                        width: '20px',
                                        height: '20px',
                                        padding: 0,
                                        margin: 0,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {folderPlaces.length === 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No unscheduled places</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

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
    </div>
  );
}

const ItineraryDay = ({ 
  date, 
  label, 
  items, 
  places, 
  distances, 
  reservations, 
  selectedTrip, 
  tripModeActive, 
  handleViewAttachment, 
  handleDeleteReservation, 
  handleDeleteItineraryItem, 
  fetchOSRMDistance, 
  getHaversine 
}) => {
  const distancesList = useMemo(() => {
    if (items.length < 2) return [];
    const computed = [];
    for (let i = 1; i < items.length; i++) {
      const p1 = places.find(p => p.id === items[i - 1].place_id);
      const p2 = places.find(p => p.id === items[i].place_id);
      if (p1 && p2) {
        const key = `${p1.id}-${p2.id}`;
        if (distances[key] !== undefined) {
          computed.push(distances[key]);
        } else {
          fetchOSRMDistance(p1, p2);
          computed.push(getHaversine(p1, p2));
        }
      } else {
        computed.push(0);
      }
    }
    return computed;
  }, [items, distances, places]);

  const dayReservations = reservations.filter(r => {
    if (r.trip_id !== selectedTrip?.id) return false;
    try {
      const details = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
      return details && details.date === date;
    } catch (e) {
      return false;
    }
  });

  const stayRes = dayReservations.find(r => r.type === 'stay' || r.type === 'hotel');
  const stayLocation = stayRes ? stayRes.title : '';

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          🗓️ {date} 
          {stayLocation && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'normal' }}>
              🏡 Stay: {stayLocation}
            </span>
          )}
        </h4>
      </div>

      {/* Display reservations directly below the date */}
      {dayReservations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0' }}>
          {dayReservations.map(res => (
            <div key={res.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--accent-secondary)', fontWeight: 'bold', marginRight: '6px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '2px' }}>
                  {res.type}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{res.title}</span>
                {res.details && (typeof res.details === 'string' ? JSON.parse(res.details).notes : res.details.notes) && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    {typeof res.details === 'string' ? JSON.parse(res.details).notes : res.details.notes}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {res.file_path && (
                  <button className="photo-action-btn" onClick={() => handleViewAttachment(res)}>
                    <FileText size={12} />
                  </button>
                )}
                {!tripModeActive && (
                  <button className="photo-action-btn" onClick={() => handleDeleteReservation(res)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {items.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '8px 0' }}>No stops planned for this day.</p>
      ) : (
        <div className="timeline">
          {items.map((item, idx) => {
            const place = places.find(p => p.id === item.place_id);
            const dist = distancesList[idx - 1];
            const dbDist = item.distance_from_prev || 0;
            const dbDur = item.duration_from_prev || 0;

            return (
              <div key={item.id} className="timeline-item">
                {idx > 0 && (dbDist > 0 || dist !== undefined) && (() => {
                  const isUsingGmaps = typeof window !== 'undefined' && 
                    localStorage.getItem('google_maps_api_key') && 
                    localStorage.getItem('google_maps_enabled') !== 'false';
                  return (
                    <div className="timeline-distance" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <img 
                        src={isUsingGmaps ? "/gmaps.png" : "/osm.png"} 
                        style={{ width: 12, height: 12, objectFit: 'contain' }} 
                        alt={isUsingGmaps ? "GMaps" : "OSM"}
                        title={isUsingGmaps ? "Route calculated via Google Maps" : "Route calculated via OpenStreetMap (OSRM)"}
                      />
                      <span>
                        {dbDist > 0 
                          ? `${dbDist} km${dbDur > 0 ? ` (${dbDur} mins)` : ''}` 
                          : (dist && typeof dist === 'object' ? `${dist.distance} km (${dist.duration} mins)` : `${dist} km`)} to next stop
                      </span>
                    </div>
                  );
                })()}
                <div className="timeline-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: 'var(--text-primary)' }}>{place ? place.name : 'Unknown Stop'}</b>
                    {!tripModeActive && (
                      <button className="photo-action-btn" onClick={() => handleDeleteItineraryItem(item.id)}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {place && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{place.category}</span>}
                  {place && place.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{place.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
