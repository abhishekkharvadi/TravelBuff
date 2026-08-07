import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { 
  Calendar, Check, Plus, DollarSign, Image as ImageIcon, 
  MapPin, RefreshCw, Sparkles, Navigation, X, ShieldAlert 
} from 'lucide-react';
import { performSync } from '../sync.js';

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
      reservations: await db.reservations.toArray()
    };
  }) || { trips: [], places: [], itineraries: [], expenses: [], rates: [], locations: [], reservations: [] };

  const { trips, places, itineraries, expenses, rates, locations, reservations } = syncData;

  // Local State
  const [activeTrip, setActiveTrip] = useState(null);
  const [isAutoSelected, setIsAutoSelected] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [currentDayStr, setCurrentDayStr] = useState('');
  const [activePdfUrl, setActivePdfUrl] = useState(null);
  
  // Quick Expense Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState('USD');
  const [expCategory, setExpCategory] = useState('Snacks');
  const [expNotes, setExpNotes] = useState('');
  const [expFile, setExpFile] = useState(null);
  
  // OwnTracks distance
  const [ownTracksLoading, setOwnTracksLoading] = useState(false);
  const [ownTracksDistance, setOwnTracksDistance] = useState(null);
  const [distanceByDay, setDistanceByDay] = useState({});

  // Auto-select nearest ongoing trip on load
  useEffect(() => {
    if (trips.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. First priority: Check trips table for explicit active trip marked synced in DB
      const dbActiveTrip = trips.find(t => {
        try {
          const notesObj = typeof t.notes === 'string' ? JSON.parse(t.notes) : t.notes || {};
          return notesObj.isActive === true;
        } catch (e) {
          return false;
        }
      });
      
      if (dbActiveTrip) {
        setActiveTrip(dbActiveTrip);
        setIsAutoSelected(false);
      } else {
        // 2. Filter out past trips, only allow ongoing and upcoming
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
    
    // Set local date string
    setCurrentDayStr(new Date().toISOString().split('T')[0]);
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
      let notesObj = {};
      try {
        notesObj = typeof t.notes === 'string' ? JSON.parse(t.notes) : t.notes || {};
      } catch (e) {}

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

  const itineraryDays = getItineraryDays(activeTrip);

  // Determine active date showing in UI
  const displayDayStr = itineraryDays.map(d => d.date).includes(currentDayStr) ? currentDayStr : (itineraryDays[0]?.date || '');

  // Active day stops
  const activeDayStops = itineraries.filter(i => activeTrip && i.trip_id === activeTrip.id && i.date === displayDayStr)
                                    .sort((a, b) => a.sequence_order - b.sequence_order);

  const activeDayObj = itineraryDays.find(d => d.date === displayDayStr);

  const isCurrentlyActive = activeTrip && (() => {
    try {
      const notesObj = typeof activeTrip.notes === 'string' ? JSON.parse(activeTrip.notes) : activeTrip.notes || {};
      return notesObj.isActive === true;
    } catch(e) {
      return false;
    }
  })();

  return (
    <div className="container" style={{ maxWidth: '480px', padding: '16px' }}>
      
      {/* Auto-selected banner */}
      {activeTrip && isAutoSelected && !isCurrentlyActive && (
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
            Showing <strong>{activeTrip.name}</strong> based on current date.
          </span>
          <button 
            className="btn btn-primary"
            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: '28px' }}
            onClick={() => handlePinActiveTrip(activeTrip.id)}
          >
            Pin active
          </button>
        </div>
      )}

      {activeTrip ? (
        <div>
          <div style={{ background: 'var(--bg-surface-elevated)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{activeTrip.name}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {formatStartDate(activeTrip.start_date)} ({activeTrip.length || 1} {activeTrip.length === 1 ? 'day' : 'days'})
            </p>

            {/* OwnTracks Distance logging */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem' }}>Itinerary Day: {activeDayObj ? activeDayObj.label : displayDayStr}</h3>
              {itineraryDays.length > 1 && (
                <select 
                  value={displayDayStr} 
                  onChange={(e) => setCurrentDayStr(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary-hover)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  {itineraryDays.map(day => (
                    <option key={day.date} value={day.date}>{day.label}</option>
                  ))}
                </select>
              )}
            </div>

            {activeDayStops.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}>
                <MapPin size={24} style={{ marginBottom: '8px', color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '0.85rem' }}>No stops logged for this date.</p>
              </div>
            ) : (
              <div className="timeline" style={{ paddingLeft: '16px' }}>
                {activeDayStops.map((item, idx) => {
                  const place = places.find(p => p.id === item.place_id);
                  const dbDist = item.distance_from_prev || 0;
                  const dbDur = item.duration_from_prev || 0;
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
                      : place.name;
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
                    <div key={item.id} className="timeline-item" style={{ paddingBottom: '16px' }}>
                      {idx > 0 && dbDist > 0 && (() => {
                        const isUsingGmaps = typeof window !== 'undefined' && 
                          localStorage.getItem('google_maps_api_key') && 
                          localStorage.getItem('google_maps_enabled') !== 'false';
                        return (
                          <div className="timeline-distance" style={{ marginBottom: '8px', fontSize: '0.75rem', color: 'var(--accent-primary-hover)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <img 
                              src={isUsingGmaps ? "/gmaps.png" : "/osm.png"} 
                              style={{ width: 12, height: 12, objectFit: 'contain' }} 
                              alt={isUsingGmaps ? "GMaps" : "OSM"}
                              title={isUsingGmaps ? "Route calculated via Google Maps" : "Route calculated via OpenStreetMap (OSRM)"}
                            />
                            <span>{dbDist} km {dbDur > 0 ? `(${dbDur} mins)` : ''} to next stop</span>
                          </div>
                        );
                      })()}
                      <div className="timeline-card" style={{ padding: '12px', background: 'var(--bg-surface-elevated)', border: isVisited ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <b style={{ fontSize: '0.95rem', textDecoration: isVisited ? 'line-through' : 'none', color: isVisited ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {place ? place.name : 'Unknown Stop'}
                          </b>
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* Daily Reservations */}
            {(() => {
              const activeDayReservations = reservations.filter(r => {
                if (!activeTrip || r.trip_id !== activeTrip.id) return false;
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
      {activeTrip && (
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
                    <option value="USD">USD</option>
                    {rates.filter(r => r.trip_id === activeTrip.id).map(r => (
                      <option key={r.id} value={r.currency}>{r.currency}</option>
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
