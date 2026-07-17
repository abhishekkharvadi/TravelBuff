import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Calendar, MapPin, Plus, Trash2, Tag, Receipt, 
  ChevronRight, Printer, AlertTriangle, FileText, 
  Map, Edit, CheckSquare, X, DollarSign, RefreshCw, Star 
} from 'lucide-react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import MapView from './MapView.jsx';

const SearchableSelect = ({ options, value, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectRef = useRef(null);

  const filtered = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));
  const selectedOpt = options.find(opt => opt.value === value);

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

  return (
    <div ref={selectRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border-glass)',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          minHeight: '36px',
          color: selectedOpt ? '#fff' : 'var(--text-secondary)'
        }}
      >
        <span>{selectedOpt ? selectedOpt.label : placeholder}</span>
        <span style={{ fontSize: '0.6rem' }}>▼</span>
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#191924',
          border: '1px solid var(--border-glass)',
          borderRadius: '4px',
          zIndex: 1000,
          padding: '8px',
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
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
              background: '#121217',
              border: '1px solid var(--border-glass)',
              borderRadius: '4px',
              color: '#fff'
            }}
          />
          {filtered.map(opt => (
            <div
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
                setSearch('');
              }}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                borderRadius: '2px',
                background: value === opt.value ? 'var(--accent-primary)' : 'transparent',
                color: value === opt.value ? '#000' : '#fff'
              }}
            >
              {opt.label}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No matches.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default function TripPlanning({ token }) {
  // Dexie query
  const trips = useLiveQuery(() => db.trips.toArray()) || [];
  const locations = useLiveQuery(() => db.locations.toArray()) || [];
  const places = useLiveQuery(() => db.places.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const entityTags = useLiveQuery(() => db.entity_tags.toArray()) || [];
  
  // Trip dependents
  const reservations = useLiveQuery(() => db.reservations.toArray()) || [];
  const itineraries = useLiveQuery(() => db.itinerary_items.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const rates = useLiveQuery(() => db.trip_currency_rates.toArray()) || [];

  // Local State
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [forceUpdateActiveTrip, setForceUpdateActiveTrip] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [tripName, setTripName] = useState('');
  const [tripNotes, setTripNotes] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');

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

  // Filters for Add Stop
  const [stopFilterLocationId, setStopFilterLocationId] = useState('');
  const [stopFilterTagId, setStopFilterTagId] = useState('');
  const [stopSelectedPlaceId, setStopSelectedPlaceId] = useState('');
  
  // Search states for filtering
  const [stopFilterLocationSearch, setStopFilterLocationSearch] = useState('');
  const [stopFilterTagSearch, setStopFilterTagSearch] = useState('');
  const [stopPlaceSearch, setStopPlaceSearch] = useState('');
  const [selectedPlaceIds, setSelectedPlaceIds] = useState([]);

  // Base configurations and Trip configuration states
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [plannedBudgetInput, setPlannedBudgetInput] = useState('');
  const [selectedTripCurrencies, setSelectedTripCurrencies] = useState([]);
  const [isInternational, setIsInternational] = useState(false);

  const [activeTripId, setActiveTripId] = useState(localStorage.getItem('active_trip_id') || '');
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
      if (activeTripObj) {
        setSelectedTrip(activeTripObj);
      }
    }
  }, [tripModeActive, activeTripId, trips]);

  useEffect(() => {
    if (selectedTrip) {
      setItinTargetDate(selectedTrip.start_date || '');
    } else {
      setItinTargetDate('');
    }
  }, [selectedTrip]);

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

  // Helper: Retrieve actual driving route from OSRM
  const fetchOSRMDistance = async (p1, p2) => {
    const key = `${p1.id}-${p2.id}`;
    if (distances[key]) return distances[key];

    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${p1.longitude},${p1.latitude};${p2.longitude},${p2.latitude}?overview=false`);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const distKm = Math.round((data.routes[0].distance / 1000) * 10) / 10;
          setDistances(prev => ({ ...prev, [key]: distKm }));
          return distKm;
        }
      }
    } catch (err) {
      console.warn('OSRM router error, falling back to Haversine:', err);
    }
    const havDist = getHaversine(p1, p2);
    setDistances(prev => ({ ...prev, [key]: havDist }));
    return havDist;
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!tripName.trim()) return;

    const newTripId = generateUUID();
    const newTrip = {
      id: newTripId,
      name: tripName,
      start_date: tripStartDate || null,
      end_date: tripEndDate || null,
      visited: 0,
      notes: JSON.stringify({
        description: tripNotes,
        isInternational: isInternational,
        currencies: [baseCurrency],
        plannedBudget: 0
      })
    };

    await queueSyncAction('trips', 'insert', newTrip);

    // Reset Form
    setTripName('');
    setTripStartDate('');
    setTripEndDate('');
    setTripNotes('');
    setIsInternational(false);
    setShowAddForm(false);
    setSelectedTrip(newTrip);
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

    // Reset Form
    setMainResTitle('');
    setMainResDetails('');
    setMainResCost('');
    setMainResFile(null);
    setShowMainTravelForm(false);
  };

  // Add Itinerary Item
  const handleAddItineraryItem = async (date, placeId) => {
    if (!selectedTrip) return;
    
    // Calculate sequence order
    const dayItems = itineraries.filter(i => i.trip_id === selectedTrip.id && i.date === date);
    const maxOrder = dayItems.reduce((max, item) => item.sequence_order > max ? item.sequence_order : max, 0);

    const newItem = {
      id: generateUUID(),
      trip_id: selectedTrip.id,
      date,
      place_id: placeId,
      sequence_order: maxOrder + 1
    };

    await queueSyncAction('itinerary_items', 'insert', newItem);
  };

  // Delete Itinerary Item
  const handleDeleteItineraryItem = async (itemId) => {
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

  // Trigger Road Distance Calculation triggers on mount/render
  const ItineraryDay = ({ date, items }) => {
    const [distancesList, setDistancesList] = useState([]);

    useEffect(() => {
      if (items.length < 2) return;

      const fetchDistances = async () => {
        const computed = [];
        for (let i = 1; i < items.length; i++) {
          const p1 = places.find(p => p.id === items[i - 1].place_id);
          const p2 = places.find(p => p.id === items[i].place_id);
          if (p1 && p2) {
            const dist = await fetchOSRMDistance(p1, p2);
            computed.push(dist);
          } else {
            computed.push(0);
          }
        }
        setDistancesList(computed);
      };
      
      fetchDistances();
    }, [items]);

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

              return (
                <div key={item.id} className="timeline-item">
                  {idx > 0 && dist !== undefined && (
                    <div className="timeline-distance">
                      🚗 {dist} km to next stop
                    </div>
                  )}
                  <div className="timeline-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ color: '#ffffff' }}>{place ? place.name : 'Unknown Stop'}</b>
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

  const tripDates = selectedTrip ? getDatesBetween(selectedTrip.start_date, selectedTrip.end_date) : [];

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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ margin: 0 }}>Trip Planner</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)} style={{ width: 'auto', padding: '10px' }}>
          <span className="desktop-only-text">Plan New Trip</span>
          <Plus size={18} className="mobile-only-icon" style={{ margin: 0 }} />
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
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            Plan New Trip
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
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Plan New Trip</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowAddForm(false)} />
            </div>

            <form onSubmit={handleCreateTrip}>
              <div className="form-group">
                <label>Trip Title</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. Kyoto Autumn Exploration, Swiss Alps Hike..."
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Start Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={tripStartDate}
                    onClick={(e) => e.target.showPicker()}
                    onChange={(e) => setTripStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>End Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={tripEndDate}
                    onClick={(e) => e.target.showPicker()}
                    onChange={(e) => setTripEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Trip Description / Notes</label>
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
                  Save Trip
                </button>
              </div>
            </form>
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
                📅 {trip.start_date || 'No Dates Set'} {trip.end_date ? `to ${trip.end_date}` : ''}
              </p>
              {getTripNotesDescription(trip) && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>{getTripNotesDescription(trip).substring(0, 80)}...</p>}
            </div>
            <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeTripId.toString() === trip.id.toString()) {
                    setActiveTripId('');
                    localStorage.removeItem('active_trip_id');
                  } else {
                    setActiveTripId(trip.id.toString());
                    localStorage.setItem('active_trip_id', trip.id.toString());
                  }
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
      {selectedTrip && (
        <div className="modal-backdrop no-print" onClick={() => setSelectedTrip(null)} />
      )}
      {selectedTrip && (
        <div className="trip-details-overlay" style={{ overflowY: 'auto' }}>
          <div style={{
            background: 'var(--bg-surface)', width: '100%',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div className="dialog-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>{selectedTrip.name}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  📅 {selectedTrip.start_date} to {selectedTrip.end_date}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: !tripModeActive ? '#fff' : 'var(--text-secondary)', fontWeight: 600 }}>Planning</span>
                  <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: '2px', border: '1px solid var(--border-glass)' }}>
                    <button 
                      onClick={() => setTripModeActive(false)}
                      style={{
                        background: !tripModeActive ? 'var(--accent-primary)' : 'none',
                        color: !tripModeActive ? '#000' : '#fff',
                        border: 'none',
                        padding: '6px 10px',
                        borderRadius: '18px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title="Planning Mode"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => setTripModeActive(true)}
                      style={{
                        background: tripModeActive ? 'var(--accent-primary)' : 'none',
                        color: tripModeActive ? '#000' : '#fff',
                        border: 'none',
                        padding: '6px 10px',
                        borderRadius: '18px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title="Trip Mode"
                    >
                      <Map size={14} />
                    </button>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: tripModeActive ? '#fff' : 'var(--text-secondary)', fontWeight: 600 }}>Trip Mode</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="photo-action-btn" onClick={() => setShowPrintOptions(true)} title="Print Trip Plan">
                    <Printer size={16} />
                  </button>
                  <button 
                    className="photo-action-btn" 
                    onClick={() => {
                      const isCurrent = localStorage.getItem('active_trip_id') === selectedTrip.id.toString();
                      if (isCurrent) {
                        localStorage.removeItem('active_trip_id');
                        setActiveTripId('');
                        setForceUpdateActiveTrip(prev => prev + 1);
                      } else {
                        localStorage.setItem('active_trip_id', selectedTrip.id.toString());
                        setActiveTripId(selectedTrip.id.toString());
                        setForceUpdateActiveTrip(prev => prev + 1);
                      }
                    }}
                    style={{ 
                      color: localStorage.getItem('active_trip_id') === selectedTrip.id.toString() ? 'var(--accent-primary-hover)' : 'var(--text-secondary)'
                    }}
                    title={localStorage.getItem('active_trip_id') === selectedTrip.id.toString() ? "Active Trip (Pinned)" : "Set as Active Trip"}
                  >
                    <Star size={16} fill={localStorage.getItem('active_trip_id') === selectedTrip.id.toString() ? 'var(--accent-primary-hover)' : 'none'} />
                  </button>
                  <button 
                    className="photo-action-btn" 
                    onClick={() => handleToggleTripVisited(selectedTrip)}
                    style={{ color: selectedTrip.visited === 1 ? 'var(--success)' : 'var(--text-secondary)' }}
                  >
                    <CheckSquare size={16} />
                  </button>
                  <button className="photo-action-btn" onClick={() => handleDeleteTrip(selectedTrip.id)}>
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
              <h1 style={{ color: '#000' }}>{selectedTrip.name}</h1>
              <p>Trip Dates: {selectedTrip.start_date} to {selectedTrip.end_date}</p>
              <hr style={{ margin: '12px 0' }} />
            </div>

            {/* Main Content Area */}
            <div className="dialog-body" style={{ flexGrow: 1, padding: '24px', maxHeight: 'none', overflowY: 'visible' }}>
              
              {/* Budget Spend Tracker */}
              <div style={{ background: '#1c1b22', padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Budget Spend Tracker</h3>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      <span>Spent: <b style={{ color: '#fff' }}>{actualBudget.toFixed(2)} {baseCurrency}</b></span>
                      <span>Limit: <b style={{ color: '#fff' }}>{plannedBudget.toFixed(2)} {baseCurrency}</b></span>
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
                          {(!expDate || tripDates.includes(expDate)) ? (
                            <select 
                              className="form-control" 
                              required
                              value={expDate} 
                              onChange={(e) => {
                                if (e.target.value === 'custom') {
                                  // set to a temporary value that triggers the date picker view
                                  setExpDate('custom-temp');
                                } else {
                                  setExpDate(e.target.value);
                                }
                              }}
                            >
                              <option value="">Select Date</option>
                              {tripDates.map(d => (
                                <option key={d} value={d}>{d}</option>
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

              {/* Chronological Daily Itinerary */}
              <div className={!printOptItinerary ? 'no-print' : ''} style={{ background: '#1c1b22', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
                <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Chronological Daily Itinerary</h3>
                {tripDates.map(date => {
                  const dayItems = itineraries.filter(i => i.trip_id === selectedTrip.id && i.date === date)
                                              .sort((a,b) => a.sequence_order - b.sequence_order);
                  return (
                    <ItineraryDay key={date} date={date} items={dayItems} />
                  );
                })}
              </div>

              {/* Trip Reservations */}
              <div className={!printOptReservations ? 'no-print' : ''} style={{ background: '#1c1b22', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
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
                      }}
                      className="btn btn-secondary"
                      style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      {showMainTravelForm ? 'Cancel' : '+ Add Reservation'}
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
                          {tripDates.map(date => (
                            <option key={date} value={date}>{date}</option>
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
                      <button type="button" onClick={() => setShowMainTravelForm(false)} className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}>Cancel</button>
                      <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}>Save Reservation</button>
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
                            <td style={{ padding: '8px' }}>
                              <button className="photo-action-btn" onClick={() => handleDeleteReservation(res)}>
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
                <div className={!printOptExpenses ? 'no-print' : ''} style={{ background: '#1c1b22', padding: '24px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--border-glass)' }}>
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

              {/* Itinerary Planner */}
              {!tripModeActive && (
                <div className="no-print" style={{ background: '#1c1b22', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '24px' }}>
                  <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Itinerary Planner</h3>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Target Date</label>
                      <SearchableSelect 
                        placeholder="Select Date" 
                        value={itinTargetDate} 
                        onChange={(val) => setItinTargetDate(val)} 
                        options={tripDates.map(date => ({ value: date, label: date }))}
                      />
                    </div>

                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Filter by Location</label>
                      <SearchableSelect 
                        placeholder="All Locations" 
                        value={stopFilterLocationId} 
                        onChange={(val) => {
                          setStopFilterLocationId(val);
                          setSelectedPlaceIds([]);
                        }} 
                        options={[
                          { value: '', label: 'All Locations' },
                          ...locations.map(loc => ({ value: loc.id, label: loc.name }))
                        ]}
                      />
                    </div>

                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Filter by Tag</label>
                      <SearchableSelect 
                        placeholder="All Tags" 
                        value={stopFilterTagId} 
                        onChange={(val) => {
                          setStopFilterTagId(val);
                          setSelectedPlaceIds([]);
                        }} 
                        options={[
                          { value: '', label: 'All Tags' },
                          ...tags.map(t => ({ value: t.id, label: t.name }))
                        ]}
                      />
                    </div>

                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        onClick={() => {
                          setStopFilterLocationId('');
                          setStopFilterTagId('');
                          setStopPlaceSearch('');
                          setSelectedPlaceIds([]);
                        }}
                        style={{ height: '36px', padding: '0 12px', fontSize: '0.75rem', width: 'auto', margin: 0 }}
                      >
                        Reset Filters
                      </button>
                    </div>

                    <div style={{ flex: '1 1 100%', marginTop: '12px' }}>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Places to Visit (Select Multiple)</label>
                      <input
                        type="text"
                        placeholder="Search places..."
                        className="form-control"
                        style={{ height: '32px', padding: '4px 8px', fontSize: '0.8rem', marginBottom: '8px' }}
                        value={stopPlaceSearch}
                        onChange={(e) => setStopPlaceSearch(e.target.value)}
                      />
                      <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-glass)', padding: '8px', borderRadius: '4px', background: '#121217', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {places.filter(p => {
                          // Filter out places that are already present in ANY date of this specific trip
                          const isAlreadyAdded = itineraries.some(item => item.place_id === p.id && item.trip_id === selectedTrip.id);
                          if (isAlreadyAdded) return false;

                          if (stopFilterLocationId && p.location_id !== stopFilterLocationId) return false;
                          if (stopFilterTagId) {
                            const placeHasTag = entityTags.some(et => et.entity_id === p.id && et.tag_id === stopFilterTagId);
                            const parentLocHasTag = entityTags.some(et => et.entity_id === p.location_id && et.tag_id === stopFilterTagId);
                            if (!placeHasTag && !parentLocHasTag) return false;
                          }
                          if (stopPlaceSearch && !p.name.toLowerCase().includes(stopPlaceSearch.toLowerCase()) && !p.category.toLowerCase().includes(stopPlaceSearch.toLowerCase())) return false;
                          return true;
                        }).map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={selectedPlaceIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPlaceIds([...selectedPlaceIds, p.id]);
                                } else {
                                  setSelectedPlaceIds(selectedPlaceIds.filter(id => id !== p.id));
                                }
                              }}
                              style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                            />
                            <span style={{ color: '#fff' }}>{p.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({p.category})</span>
                          </label>
                        ))}
                        {places.filter(p => {
                          const isAlreadyAdded = itineraries.some(item => item.place_id === p.id && item.trip_id === selectedTrip.id);
                          if (isAlreadyAdded) return false;

                          if (stopFilterLocationId && p.location_id !== stopFilterLocationId) return false;
                          if (stopFilterTagId) {
                            const placeHasTag = entityTags.some(et => et.entity_id === p.id && et.tag_id === stopFilterTagId);
                            const parentLocHasTag = entityTags.some(et => et.entity_id === p.location_id && et.tag_id === stopFilterTagId);
                            if (!placeHasTag && !parentLocHasTag) return false;
                          }
                          if (stopPlaceSearch && !p.name.toLowerCase().includes(stopPlaceSearch.toLowerCase()) && !p.category.toLowerCase().includes(stopPlaceSearch.toLowerCase())) return false;
                          return true;
                        }).length === 0 && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No matching places found.</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      const date = itinTargetDate;
                      if (date && selectedPlaceIds.length > 0) {
                        for (const placeId of selectedPlaceIds) {
                          await handleAddItineraryItem(date, placeId);
                        }
                        setSelectedPlaceIds([]);
                      }
                    }}
                    disabled={selectedPlaceIds.length === 0}
                    className="btn btn-primary" 
                    style={{ marginTop: '16px' }}
                  >
                    Assign Stops to Itinerary
                  </button>
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
    </div>
  );
}
