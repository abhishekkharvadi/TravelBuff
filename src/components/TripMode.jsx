import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { 
  Calendar, Check, Plus, DollarSign, Image as ImageIcon, 
  MapPin, RefreshCw, Sparkles, Navigation, X, ShieldAlert 
} from 'lucide-react';
import { performSync } from '../sync.js';

export default function TripMode({ token }) {
  // Dexie live queries
  const trips = useLiveQuery(() => db.trips.toArray()) || [];
  const places = useLiveQuery(() => db.places.toArray()) || [];
  const itineraries = useLiveQuery(() => db.itinerary_items.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const rates = useLiveQuery(() => db.trip_currency_rates.toArray()) || [];

  // Local State
  const [activeTrip, setActiveTrip] = useState(null);
  const [isAutoSelected, setIsAutoSelected] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [currentDayStr, setCurrentDayStr] = useState('');
  
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
      
      // 1. First priority: Check localStorage for explicit active trip
      const storedActiveId = localStorage.getItem('active_trip_id');
      const storedActiveTrip = storedActiveId ? trips.find(t => t.id.toString() === storedActiveId) : null;
      
      if (storedActiveTrip) {
        setActiveTrip(storedActiveTrip);
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
  const getDates = (start, end) => {
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

  const tripDates = activeTrip ? getDates(activeTrip.start_date, activeTrip.end_date) : [];

  // Determine active date showing in UI
  const displayDayStr = tripDates.includes(currentDayStr) ? currentDayStr : (tripDates[0] || '');

  // Active day stops
  const activeDayStops = itineraries.filter(i => activeTrip && i.trip_id === activeTrip.id && i.date === displayDayStr)
                                    .sort((a, b) => a.sequence_order - b.sequence_order);

  const storedActiveId = localStorage.getItem('active_trip_id');
  const isCurrentlyActive = activeTrip && storedActiveId === activeTrip.id.toString();

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
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary-hover)' }}>
            ℹ️ This trip is auto-selected. Set it as active to pin it.
          </span>
          <button 
            className="btn btn-primary"
            onClick={() => {
              localStorage.setItem('active_trip_id', activeTrip.id);
              setForceUpdate(prev => prev + 1);
            }}
            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', margin: 0 }}
          >
            Set as Active
          </button>
        </div>
      )}

      {/* Main Active Trip view */}
      {activeTrip ? (
        <div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.25rem' }}>{activeTrip.name}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Trip status: <b>Active</b> | Today's Date: <b>{currentDayStr}</b>
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
              <h3 style={{ fontSize: '1.1rem' }}>Itinerary Day: {displayDayStr}</h3>
              {tripDates.length > 1 && (
                <select 
                  value={currentDayStr} 
                  onChange={(e) => setCurrentDayStr(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary-hover)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  {tripDates.map(date => (
                    <option key={date} value={date}>{date}</option>
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
                  return (
                    <div key={item.id} className="timeline-item" style={{ paddingBottom: '16px' }}>
                      <div className="timeline-card" style={{ padding: '12px', background: '#1c1b25' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <b style={{ fontSize: '0.95rem' }}>{place ? place.name : 'Unknown Stop'}</b>
                        </div>
                        {place && <span style={{ fontSize: '0.7rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{place.category}</span>}
                        {place && place.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{place.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
    </div>
  );
}
