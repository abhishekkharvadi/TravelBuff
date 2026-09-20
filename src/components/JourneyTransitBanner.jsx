import React, { useState } from 'react';
import AirportPicker from './AirportPicker.jsx';

export default function JourneyTransitBanner({
  trip,
  onUpdateTrip,
  userAddresses = [],
  firstDayDate,
  lastDayDate,
  totalDays = 1,
  firstDayStayName,
  lastDayStayName,
  type = 'both', // 'outbound' | 'return' | 'both'
  title
}) {
  const [editingLeg, setEditingLeg] = useState(null); // 'outbound' | 'return' | null

  if (!trip) return null;

  let notesObj = {};
  try {
    notesObj = trip.notes ? JSON.parse(trip.notes) : {};
  } catch (e) {
    notesObj = {};
  }

  // Resolve Outbound & Return configs with backwards-compatibility for existing trips
  const outbound = notesObj.outboundJourney || {
    mode: 'drive',
    startAddressId: trip.start_address_id || null
  };

  const returnLeg = notesObj.returnJourney || {
    mode: 'drive',
    stopAddressId: trip.stop_address_id || null
  };

  const startHomeAddr = userAddresses.find(a => 
    String(a.id) === String(trip.start_address_id || outbound.startAddressId)
  );

  const stopHomeAddr = userAddresses.find(a => 
    String(a.id) === String(trip.stop_address_id || returnLeg.stopAddressId)
  );

  const saveJourney = async (legType, updatedConfig) => {
    let curNotes = {};
    try {
      curNotes = trip.notes ? JSON.parse(trip.notes) : {};
    } catch (e) {
      curNotes = {};
    }

    let updatedTrip = { ...trip };

    if (legType === 'outbound') {
      curNotes.outboundJourney = updatedConfig;
      if (updatedConfig.startAddressId !== undefined) {
        updatedTrip.start_address_id = updatedConfig.startAddressId || null;
      }
    } else if (legType === 'return') {
      curNotes.returnJourney = updatedConfig;
      if (updatedConfig.stopAddressId !== undefined) {
        updatedTrip.stop_address_id = updatedConfig.stopAddressId || null;
      }
    }

    updatedTrip.notes = JSON.stringify(curNotes);

    if (onUpdateTrip) {
      await onUpdateTrip(updatedTrip);
    }
    setEditingLeg(null);
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  // Render Single Outbound Card (Embedded inside Day 1)
  if (type === 'outbound') {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}>
        <JourneyCard
          title={title || "Outbound Journey"}
          icon="🛫"
          isOutbound={true}
          config={outbound}
          homeAddr={startHomeAddr}
          stayName={firstDayStayName || 'Destination Stay'}
          tripDate={firstDayDate}
          onEdit={() => setEditingLeg('outbound')}
          formatDateString={formatDateString}
        />
        {editingLeg && (
          <JourneyEditModal
            legType={editingLeg}
            currentConfig={editingLeg === 'outbound' ? outbound : returnLeg}
            trip={trip}
            onSave={(cfg) => saveJourney(editingLeg, cfg)}
            onClose={() => setEditingLeg(null)}
            userAddresses={userAddresses}
            defaultDate={editingLeg === 'outbound' ? firstDayDate : lastDayDate}
            stayName={editingLeg === 'outbound' ? firstDayStayName : lastDayStayName}
          />
        )}
      </div>
    );
  }

  // Render Single Return Card (Embedded inside Last Day)
  if (type === 'return') {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box', marginTop: '8px' }}>
        <JourneyCard
          title={title || (totalDays > 1 ? `Day ${totalDays} Return Journey` : "Return Journey")}
          icon="🛬"
          isOutbound={false}
          config={returnLeg}
          homeAddr={stopHomeAddr}
          stayName={lastDayStayName || 'Destination Stay'}
          tripDate={lastDayDate}
          onEdit={() => setEditingLeg('return')}
          formatDateString={formatDateString}
        />
        {editingLeg && (
          <JourneyEditModal
            legType={editingLeg}
            currentConfig={editingLeg === 'outbound' ? outbound : returnLeg}
            trip={trip}
            onSave={(cfg) => saveJourney(editingLeg, cfg)}
            onClose={() => setEditingLeg(null)}
            userAddresses={userAddresses}
            defaultDate={editingLeg === 'outbound' ? firstDayDate : lastDayDate}
            stayName={editingLeg === 'outbound' ? firstDayStayName : lastDayStayName}
          />
        )}
      </div>
    );
  }

  // Fallback: 2-Column Banner
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginBottom: '4px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Day 1 Outbound Journey Card */}
        <JourneyCard
          title="Day 1 Outbound Journey"
          icon="🛫"
          isOutbound={true}
          config={outbound}
          homeAddr={startHomeAddr}
          stayName={firstDayStayName || 'Destination Stay'}
          tripDate={firstDayDate}
          onEdit={() => setEditingLeg('outbound')}
          formatDateString={formatDateString}
        />

        {/* Return Journey Card */}
        <JourneyCard
          title={totalDays > 1 ? `Day ${totalDays} Return Journey` : "Return Journey"}
          icon="🛬"
          isOutbound={false}
          config={returnLeg}
          homeAddr={stopHomeAddr}
          stayName={lastDayStayName || 'Destination Stay'}
          tripDate={lastDayDate}
          onEdit={() => setEditingLeg('return')}
          formatDateString={formatDateString}
        />
      </div>

      {/* Interactive Edit Modal */}
      {editingLeg && (
        <JourneyEditModal
          legType={editingLeg}
          currentConfig={editingLeg === 'outbound' ? outbound : returnLeg}
          trip={trip}
          onSave={(cfg) => saveJourney(editingLeg, cfg)}
          onClose={() => setEditingLeg(null)}
          userAddresses={userAddresses}
          defaultDate={editingLeg === 'outbound' ? firstDayDate : lastDayDate}
          stayName={editingLeg === 'outbound' ? firstDayStayName : lastDayStayName}
        />
      )}
    </div>
  );
}

/**
 * Individual Journey Card (Boarding Pass / Transit Card Format)
 */
function JourneyCard({
  title,
  icon,
  isOutbound,
  config,
  homeAddr,
  stayName,
  tripDate,
  onEdit,
  formatDateString
}) {
  const mode = config?.mode || 'drive';

  // Normalize legs: support multi-leg array or legacy single leg
  const legs = Array.isArray(config?.legs) && config.legs.length > 0
    ? config.legs
    : (config?.originHub || config?.destinationHub ? [{
        carrier: config.carrier || '',
        flightNumber: config.flightNumber || '',
        originHub: config.originHub || null,
        originTerminal: config.originTerminal || '',
        departureDate: config.departureDate || tripDate || '',
        departureTime: config.departureTime || '',
        destinationHub: config.destinationHub || null,
        destinationTerminal: config.destinationTerminal || '',
        arrivalDate: config.arrivalDate || tripDate || '',
        arrivalTime: config.arrivalTime || '',
        duration: config.duration || ''
      }] : []);

  const pnr = config?.pnr || config?.bookingRef || '';
  const cabinClass = config?.cabinClass || 'Economy';
  const baggage = config?.baggage || '';
  const originTransitMode = config?.originTransitMode || (isOutbound ? 'cab' : 'transit');
  const destTransitMode = config?.destinationTransitMode || (isOutbound ? 'rental' : 'cab');

  const transitLabelMap = {
    cab: '🚕 Taxi / Rideshare',
    drive: '🚗 Drive & Park',
    rental: '🚙 Car Rental',
    train: '🚆 Train / Metro',
    bus: '🚌 Shuttle / Bus',
    walk: '🚶 Walk'
  };

  return (
    <div style={{
      background: 'var(--bg-surface, #1e1e2e)',
      border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
      borderRadius: '8px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Card Header: Title & Top-Right Edit Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        paddingBottom: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1rem' }}>{icon}</span>
          <h4 style={{
            margin: 0,
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.2px'
          }}>
            {title}
          </h4>
        </div>
        <button
          type="button"
          onClick={onEdit}
          style={{
            background: 'var(--bg-app, #12121a)',
            border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.15))',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s ease'
          }}
          title={`Edit ${title}`}
        >
          <span>✏️</span>
          <span>Edit</span>
        </button>
      </div>

      {/* Mode: Drive */}
      {mode === 'drive' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: 500 }}>
            <span>🚗</span>
            <span>
              {isOutbound
                ? (homeAddr ? `Start at 🏠 ${homeAddr.label}` : 'Start from Origin')
                : `Depart from 🏨 ${stayName || 'Stay'}`}
              {' ➔ '}
              {isOutbound
                ? `Drive to 🏨 ${stayName || 'Destination'}`
                : (homeAddr ? `Return to 🏠 ${homeAddr.label}` : 'Return Home')}
            </span>
          </div>
          {homeAddr?.address && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              📍 {homeAddr.address}
            </span>
          )}
        </div>
      )}

      {/* Mode: Flight (Boarding Pass Ticket Style) */}
      {mode === 'flight' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Ground Transit: Start */}
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px'
          }}>
            <span>{isOutbound ? '🏠' : '🏨'}</span>
            <span>
              {isOutbound
                ? (homeAddr ? `${homeAddr.label}` : 'Home')
                : (stayName || 'Stay')}
              {' ➔ '}
              <strong>{transitLabelMap[originTransitMode] || 'Transit'}</strong>
              {' to Airport'}
            </span>
          </div>

          {/* Flight Legs */}
          {legs.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
              No flight details added yet. Click Edit to add flights.
            </div>
          ) : (
            legs.map((leg, idx) => {
              const orig = leg.originHub || {};
              const dest = leg.destinationHub || {};
              const flightCode = `${leg.carrier ? `${leg.carrier} ` : ''}${leg.flightNumber || ''}`.trim() || 'Flight';

              // Calculate duration if not provided
              let durText = leg.duration || '';
              if (!durText && leg.departureTime && leg.arrivalTime) {
                const [dh, dm] = leg.departureTime.split(':').map(Number);
                const [ah, am] = leg.arrivalTime.split(':').map(Number);
                let diffMins = (ah * 60 + am) - (dh * 60 + dm);
                if (diffMins < 0) diffMins += 24 * 60;
                const h = Math.floor(diffMins / 60);
                const m = diffMins % 60;
                durText = `${h}h ${m}m duration`;
              }

              return (
                <React.Fragment key={idx}>
                  {/* Layover banner between multiple legs */}
                  {idx > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#f59e0b',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px dashed rgba(245, 158, 11, 0.3)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      margin: '2px 0'
                    }}>
                      <span>⏱️</span>
                      <span>Layover / Connection at {orig.code ? `[${orig.code}]` : orig.name || 'Connecting Airport'}</span>
                    </div>
                  )}

                  {/* Flight Boarding Pass Ticket Box */}
                  <div style={{
                    background: 'var(--bg-app, #12121a)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {/* Ticket Header Row: Airline, Flight #, Class, Baggage, PNR */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '6px',
                      fontSize: '0.73rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      paddingBottom: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem' }}>🛩️</span>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>{flightCode}</strong>
                        {cabinClass && (
                          <span style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: 'var(--text-secondary)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontSize: '0.67rem'
                          }}>
                            {cabinClass}
                          </span>
                        )}
                        {baggage && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                            • {baggage}
                          </span>
                        )}
                      </div>

                      {pnr && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          PNR: <strong style={{ color: 'var(--accent-primary, #a78bfa)', letterSpacing: '0.5px' }}>{pnr}</strong>
                        </div>
                      )}
                    </div>

                    {/* Flight Times & Airports 3-Column Row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {/* Departure Side */}
                      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {orig.code || 'DEP'}
                          </span>
                          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary, #a78bfa)' }}>
                            {leg.departureTime || '--:--'}
                          </span>
                        </div>
                        {(leg.departureDate || tripDate) && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {formatDateString(leg.departureDate || tripDate)}
                          </span>
                        )}
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={orig.name}>
                          {leg.originTerminal ? `Terminal - ${leg.originTerminal}, ` : ''}{orig.name || 'Origin Airport'}
                        </span>
                      </div>

                      {/* Center Connector: Duration pill */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        minWidth: '70px'
                      }}>
                        <div style={{
                          border: '1px dashed rgba(255, 255, 255, 0.2)',
                          borderRadius: '12px',
                          padding: '3px 8px',
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          background: 'rgba(255, 255, 255, 0.02)'
                        }}>
                          {durText || 'Flight'}
                        </div>
                      </div>

                      {/* Arrival Side */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', lineHeight: 1.25 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary, #a78bfa)' }}>
                            {leg.arrivalTime || '--:--'}
                          </span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {dest.code || 'ARR'}
                          </span>
                        </div>
                        {(leg.arrivalDate || tripDate) && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {formatDateString(leg.arrivalDate || tripDate)}
                          </span>
                        )}
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dest.name}>
                          {leg.destinationTerminal ? `Terminal - ${leg.destinationTerminal}, ` : ''}{dest.name || 'Arrival Airport'}
                        </span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}

          {/* Ground Transit: End */}
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px'
          }}>
            <span>🛬</span>
            <span>
              {'Airport ➔ '}
              <strong>{transitLabelMap[destTransitMode] || 'Transit'}</strong>
              {' to '}
              {isOutbound
                ? (stayName || 'Hotel / Stay')
                : (homeAddr ? `${homeAddr.label}` : 'Home')}
            </span>
          </div>
        </div>
      )}

      {/* Mode: Train / Bus / Ferry */}
      {(mode === 'train' || mode === 'bus' || mode === 'ferry') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Ground Transit: Start */}
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px'
          }}>
            <span>{isOutbound ? '🏠' : '🏨'}</span>
            <span>
              {isOutbound ? (homeAddr ? homeAddr.label : 'Home') : (stayName || 'Stay')}
              {' ➔ '}
              <strong>{transitLabelMap[originTransitMode] || 'Transit'}</strong>
              {' to Station / Port'}
            </span>
          </div>

          {/* Transit Ticket Box */}
          <div style={{
            background: 'var(--bg-app, #12121a)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.73rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              paddingBottom: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{mode === 'train' ? '🚆' : mode === 'bus' ? '🚌' : '⛴️'}</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {config?.carrier || (mode === 'train' ? 'Train Line' : mode === 'bus' ? 'Bus Operator' : 'Ferry Line')}
                  {config?.flightNumber ? ` (${config.flightNumber})` : ''}
                </strong>
              </div>
              {pnr && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Ref: <strong style={{ color: 'var(--accent-primary, #a78bfa)' }}>{pnr}</strong>
                </div>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary, #a78bfa)' }}>
                  {config?.departureTime || '--:--'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {config?.originHub?.name || 'Origin Station'}
                </span>
              </div>

              <div style={{
                border: '1px dashed rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '2px 6px',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                textAlign: 'center'
              }}>
                {mode.toUpperCase()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-primary, #a78bfa)' }}>
                  {config?.arrivalTime || '--:--'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {config?.destinationHub?.name || 'Destination Station'}
                </span>
              </div>
            </div>
          </div>

          {/* Ground Transit: End */}
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px'
          }}>
            <span>🚉</span>
            <span>
              {'Station / Port ➔ '}
              <strong>{transitLabelMap[destTransitMode] || 'Transit'}</strong>
              {' to '}
              {isOutbound ? (stayName || 'Hotel / Stay') : (homeAddr ? homeAddr.label : 'Home')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Multi-Modal Journey & Multi-Leg Flight Edit Modal
 */
function JourneyEditModal({
  legType,
  currentConfig,
  trip,
  onSave,
  onClose,
  userAddresses = [],
  defaultDate,
  stayName = 'Hotel / Stay',
  renderTabSwitcher
}) {
  const isOutbound = legType === 'outbound';
  const [mode, setMode] = useState(currentConfig?.mode || 'flight');
  const [startAddressId, setStartAddressId] = useState(
    isOutbound ? (currentConfig?.startAddressId ?? trip?.start_address_id ?? '') : ''
  );
  const [stopAddressId, setStopAddressId] = useState(
    !isOutbound ? (currentConfig?.stopAddressId ?? trip?.stop_address_id ?? '') : ''
  );

  // Common Flight / Transit metadata
  const [pnr, setPnr] = useState(currentConfig?.pnr || currentConfig?.bookingRef || '');
  const [cabinClass, setCabinClass] = useState(currentConfig?.cabinClass || 'Economy');
  const [baggage, setBaggage] = useState(currentConfig?.baggage || '7 Kgs • 15 Kgs');
  const [originTransitMode, setOriginTransitMode] = useState(currentConfig?.originTransitMode || (isOutbound ? 'cab' : 'transit'));
  const [destinationTransitMode, setDestinationTransitMode] = useState(currentConfig?.destinationTransitMode || (isOutbound ? 'rental' : 'cab'));
  const [notes, setNotes] = useState(currentConfig?.notes || '');

  // Multi-Legs array
  const initialLegs = Array.isArray(currentConfig?.legs) && currentConfig.legs.length > 0
    ? currentConfig.legs
    : [{
        carrier: currentConfig?.carrier || '',
        flightNumber: currentConfig?.flightNumber || '',
        originHub: currentConfig?.originHub || null,
        originTerminal: currentConfig?.originTerminal || '',
        departureDate: currentConfig?.departureDate || defaultDate || '',
        departureTime: currentConfig?.departureTime || '',
        destinationHub: currentConfig?.destinationHub || null,
        destinationTerminal: currentConfig?.destinationTerminal || '',
        arrivalDate: currentConfig?.arrivalDate || defaultDate || '',
        arrivalTime: currentConfig?.arrivalTime || '',
        duration: currentConfig?.duration || ''
      }];

  const [legs, setLegs] = useState(initialLegs);

  // Non-flight single hub inputs (Train/Bus/Ferry)
  const [customOriginName, setCustomOriginName] = useState(currentConfig?.originHub?.name || '');
  const [customDestName, setCustomDestName] = useState(currentConfig?.destinationHub?.name || '');
  const [carrier, setCarrier] = useState(currentConfig?.carrier || '');
  const [flightNumber, setFlightNumber] = useState(currentConfig?.flightNumber || '');
  const [departureTime, setDepartureTime] = useState(currentConfig?.departureTime || '');
  const [arrivalTime, setArrivalTime] = useState(currentConfig?.arrivalTime || '');

  const MODES = [
    { id: 'drive', label: '🚗 Drive', desc: 'Direct road travel' },
    { id: 'flight', label: '✈️ Flight', desc: 'Fly via airports' },
    { id: 'train', label: '🚆 Train', desc: 'Rail / high-speed train' },
    { id: 'bus', label: '🚌 Bus', desc: 'Intercity coach' },
    { id: 'ferry', label: '⛴️ Ferry', desc: 'Ferry / boat cruise' }
  ];

  const TRANSIT_OPTIONS = [
    { id: 'cab', label: '🚕 Taxi / Rideshare' },
    { id: 'drive', label: '🚗 Drive & Park' },
    { id: 'rental', label: '🚙 Car Rental' },
    { id: 'train', label: '🚆 Train / Metro' },
    { id: 'bus', label: '🚌 Shuttle / Bus' },
    { id: 'walk', label: '🚶 Walk' }
  ];

  const handleAddLeg = () => {
    const prevLeg = legs[legs.length - 1];
    setLegs([
      ...legs,
      {
        carrier: prevLeg?.carrier || '',
        flightNumber: '',
        originHub: prevLeg?.destinationHub || null, // Auto-connect from previous arrival airport!
        originTerminal: '',
        departureDate: defaultDate || '',
        departureTime: '',
        destinationHub: null,
        destinationTerminal: '',
        arrivalDate: defaultDate || '',
        arrivalTime: '',
        duration: ''
      }
    ]);
  };

  const handleRemoveLeg = (idx) => {
    if (legs.length <= 1) return;
    setLegs(legs.filter((_, i) => i !== idx));
  };

  const handleUpdateLeg = (idx, field, value) => {
    const next = [...legs];
    next[idx] = { ...next[idx], [field]: value };
    setLegs(next);
  };

  const handleSave = () => {
    let payload = {
      mode,
      originTransitMode,
      destinationTransitMode,
      notes
    };

    if (isOutbound) {
      payload.startAddressId = startAddressId || null;
    } else {
      payload.stopAddressId = stopAddressId || null;
    }

    if (mode === 'flight') {
      payload.pnr = pnr;
      payload.cabinClass = cabinClass;
      payload.baggage = baggage;
      payload.legs = legs;

      // Also set top-level originHub/destHub for backwards compatibility with single-leg readers
      if (legs.length > 0) {
        payload.originHub = legs[0].originHub;
        payload.destinationHub = legs[legs.length - 1].destinationHub;
        payload.carrier = legs[0].carrier;
        payload.flightNumber = legs[0].flightNumber;
        payload.departureTime = legs[0].departureTime;
        payload.arrivalTime = legs[legs.length - 1].arrivalTime;
      }
    } else if (mode === 'drive') {
      // Direct driving
    } else {
      // Train / Bus / Ferry
      payload.pnr = pnr;
      payload.carrier = carrier;
      payload.flightNumber = flightNumber;
      payload.departureTime = departureTime;
      payload.arrivalTime = arrivalTime;
      payload.originHub = customOriginName ? { name: customOriginName, type: mode } : null;
      payload.destinationHub = customDestName ? { name: customDestName, type: mode } : null;
    }

    onSave(payload);
  };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        background: 'var(--bg-surface, #1e1e2e)',
        border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
        borderRadius: '12px',
        width: '94%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
      }}>
        {/* Optional Tab Switcher */}
        {renderTabSwitcher && renderTabSwitcher()}

        {/* Modal Header */}
        {!renderTabSwitcher && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
            paddingBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>{isOutbound ? '🛫' : '🛬'}</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {isOutbound ? 'Configure Day 1 Outbound Journey' : 'Configure Return Journey'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Home Address Selector (Unifies Journey Start / End) */}
        <div style={{
          background: 'var(--bg-app, #12121a)',
          border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
          borderRadius: '8px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            🏠 {isOutbound ? 'Origin / Journey Start Address' : 'Destination / Return Home Address'}
          </label>
          <select
            className="form-control"
            value={isOutbound ? startAddressId : stopAddressId}
            onChange={(e) => {
              if (isOutbound) setStartAddressId(e.target.value);
              else setStopAddressId(e.target.value);
            }}
            style={{
              fontSize: '0.8rem',
              padding: '6px 10px',
              background: 'var(--bg-surface, #1e1e2e)',
              border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
              color: 'var(--text-primary)'
            }}
          >
            <option value="">{isOutbound ? '-- Start directly at airport / first stop --' : '-- End at last stop --'}</option>
            {userAddresses.map(addr => (
              <option key={addr.id} value={addr.id}>
                🏠 {addr.label} {addr.address ? `(${addr.address})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Main Transport Mode Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Main Journey Transport Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {MODES.map(m => {
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{
                    padding: '8px 4px',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 600 : 400,
                    borderRadius: '6px',
                    border: isSelected ? '1px solid var(--accent-primary, #8b5cf6)' : '1px solid var(--border-glass, rgba(255,255,255,0.1))',
                    background: isSelected ? 'rgba(124, 58, 237, 0.25)' : 'var(--bg-app, #12121a)',
                    color: isSelected ? 'var(--accent-primary-hover, #a78bfa)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{m.label.split(' ')[0]}</span>
                  <span style={{ fontSize: '0.7rem' }}>{m.label.split(' ')[1]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Mode Content Form */}
        {mode === 'drive' ? (
          <div style={{
            background: 'var(--bg-app, #12121a)',
            border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
            borderRadius: '8px',
            padding: '14px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5
          }}>
            🚗 <strong>Direct Road Trip Mode</strong>: Navigates directly by vehicle between your Origin Home Address and Destination Stay / Sightseeing stops. Road driving distances and durations are calculated automatically on the map.
          </div>
        ) : mode === 'flight' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Ticket Info: PNR, Cabin Class, Baggage */}
            <div style={{
              background: 'var(--bg-app, #12121a)',
              border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
              borderRadius: '8px',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>PNR / Booking Reference</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. VDI6UX"
                  value={pnr}
                  onChange={(e) => setPnr(e.target.value.toUpperCase())}
                  style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Cabin Class</label>
                <select
                  className="form-control"
                  value={cabinClass}
                  onChange={(e) => setCabinClass(e.target.value)}
                  style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                >
                  <option value="Economy">Economy</option>
                  <option value="Premium Economy">Premium Economy</option>
                  <option value="Business">Business</option>
                  <option value="First Class">First Class</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Baggage Allowance</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 7 Kgs • 15 Kgs"
                  value={baggage}
                  onChange={(e) => setBaggage(e.target.value)}
                  style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                />
              </div>
            </div>

            {/* Flight Legs List (Supports 1 or Multiple Connecting Flights) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                  ✈️ Flight Legs & Connecting Layovers ({legs.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddLeg}
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    color: '#60a5fa',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    cursor: 'pointer'
                  }}
                >
                  + Add Flight Leg / Layover
                </button>
              </div>

              {legs.map((leg, lIdx) => (
                <div
                  key={lIdx}
                  style={{
                    background: 'var(--bg-app, #12121a)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Leg {lIdx + 1}: {leg.originHub?.code || 'DEP'} ➔ {leg.destinationHub?.code || 'ARR'}
                    </span>
                    {legs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLeg(lIdx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer' }}
                      >
                        Remove Leg ✕
                      </button>
                    )}
                  </div>

                  {/* Carrier & Flight # */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Airline / Carrier</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Air India Express / ANA"
                        value={leg.carrier || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'carrier', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Flight Number</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. IX-2971"
                        value={leg.flightNumber || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'flightNumber', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>

                  {/* Origin Airport & Terminal */}
                  <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>🛫 Departure Airport (Search IATA/City/Name)</label>
                      <AirportPicker
                        value={leg.originHub}
                        onChange={(val) => handleUpdateLeg(lIdx, 'originHub', val)}
                        placeholder="Search departure airport (e.g. MAA, SFO)..."
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Terminal</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. T4"
                        value={leg.originTerminal || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'originTerminal', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>

                  {/* Departure Date & Time */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Departure Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={leg.departureDate || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'departureDate', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Departure Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={leg.departureTime || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'departureTime', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>

                  {/* Destination Airport & Terminal */}
                  <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>🛬 Arrival Airport (Search IATA/City/Name)</label>
                      <AirportPicker
                        value={leg.destinationHub}
                        onChange={(val) => handleUpdateLeg(lIdx, 'destinationHub', val)}
                        placeholder="Search arrival airport (e.g. BLR, LHR)..."
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Terminal</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. T2"
                        value={leg.destinationTerminal || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'destinationTerminal', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>

                  {/* Arrival Date & Time */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Arrival Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={leg.arrivalDate || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'arrivalDate', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Arrival Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={leg.arrivalTime || ''}
                        onChange={(e) => handleUpdateLeg(lIdx, 'arrivalTime', e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Ground Connections */}
            <div style={{
              background: 'var(--bg-app, #12121a)',
              border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
              borderRadius: '8px',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {isOutbound ? 'Transit from Home to Airport:' : 'Transit from Hotel to Airport:'}
                </label>
                <select
                  className="form-control"
                  value={originTransitMode}
                  onChange={(e) => setOriginTransitMode(e.target.value)}
                  style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  {TRANSIT_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {isOutbound ? 'Transit from Airport to Hotel:' : 'Transit from Airport to Home:'}
                </label>
                <select
                  className="form-control"
                  value={destinationTransitMode}
                  onChange={(e) => setDestinationTransitMode(e.target.value)}
                  style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  {TRANSIT_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* Train / Bus / Ferry Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              background: 'var(--bg-app, #12121a)',
              border: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {mode === 'train' ? 'Train Operator / Line' : mode === 'bus' ? 'Coach Operator' : 'Ferry Line'}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Eurostar / Amtrak / FlixBus"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Booking Reference / PNR</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. REF123"
                    value={pnr}
                    onChange={(e) => setPnr(e.target.value.toUpperCase())}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Departure Station / Port</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. London St Pancras"
                    value={customOriginName}
                    onChange={(e) => setCustomOriginName(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Departure Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Arrival Station / Port</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Paris Gare du Nord"
                    value={customDestName}
                    onChange={(e) => setCustomDestName(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Arrival Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '5px 8px', background: 'var(--bg-surface)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
          paddingTop: '12px'
        }}>
          {mode !== 'drive' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMode('drive');
              }}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
            >
              Reset to Drive
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ fontSize: '0.8rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              style={{ fontSize: '0.8rem' }}
            >
              Save Journey
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-Tab Flights & Logistics Manager Modal (Triggered from Planning Workspace Header)
 */
export function JourneyTransitManagerModal({
  trip,
  onUpdateTrip,
  userAddresses = [],
  firstDayDate,
  lastDayDate,
  totalDays = 1,
  firstDayStayName,
  lastDayStayName,
  initialTab = 'outbound',
  onClose
}) {
  const [activeLeg, setActiveLeg] = useState(initialTab); // 'outbound' | 'return'

  if (!trip) return null;

  let notesObj = {};
  try {
    notesObj = trip.notes ? JSON.parse(trip.notes) : {};
  } catch (e) {
    notesObj = {};
  }

  const outbound = notesObj.outboundJourney || {
    mode: 'drive',
    startAddressId: trip.start_address_id || null
  };

  const returnLeg = notesObj.returnJourney || {
    mode: 'drive',
    stopAddressId: trip.stop_address_id || null
  };

  const handleSaveLeg = async (legType, updatedConfig) => {
    let curNotes = {};
    try {
      curNotes = trip.notes ? JSON.parse(trip.notes) : {};
    } catch (e) {
      curNotes = {};
    }

    let updatedTrip = { ...trip };

    if (legType === 'outbound') {
      curNotes.outboundJourney = updatedConfig;
      if (updatedConfig.startAddressId !== undefined) {
        updatedTrip.start_address_id = updatedConfig.startAddressId || null;
      }
    } else if (legType === 'return') {
      curNotes.returnJourney = updatedConfig;
      if (updatedConfig.stopAddressId !== undefined) {
        updatedTrip.stop_address_id = updatedConfig.stopAddressId || null;
      }
    }

    updatedTrip.notes = JSON.stringify(curNotes);

    if (onUpdateTrip) {
      await onUpdateTrip(updatedTrip);
    }
    onClose();
  };

  return (
    <JourneyEditModal
      key={activeLeg}
      legType={activeLeg}
      currentConfig={activeLeg === 'outbound' ? outbound : returnLeg}
      trip={trip}
      onSave={(cfg) => handleSaveLeg(activeLeg, cfg)}
      onClose={onClose}
      userAddresses={userAddresses}
      defaultDate={activeLeg === 'outbound' ? firstDayDate : lastDayDate}
      stayName={activeLeg === 'outbound' ? firstDayStayName : lastDayStayName}
      renderTabSwitcher={() => (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
          background: 'rgba(0, 0, 0, 0.2)',
          margin: '-12px -20px 14px -20px'
        }}>
          <button
            type="button"
            onClick={() => setActiveLeg('outbound')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: activeLeg === 'outbound' ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeLeg === 'outbound' ? '2px solid var(--accent-primary, #7c3aed)' : '2px solid transparent',
              color: activeLeg === 'outbound' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeLeg === 'outbound' ? 600 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🛫</span>
            <span>Day 1 Outbound Journey</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveLeg('return')}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: activeLeg === 'return' ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeLeg === 'return' ? '2px solid var(--accent-primary, #7c3aed)' : '2px solid transparent',
              color: activeLeg === 'return' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeLeg === 'return' ? 600 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🛬</span>
            <span>{totalDays > 1 ? `Day ${totalDays} Return Journey` : 'Return Journey'}</span>
          </button>
        </div>
      )}
    />
  );
}

export { JourneyEditModal };

