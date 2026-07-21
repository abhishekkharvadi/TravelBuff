import React, { useState } from 'react';
import { X, Check, Trash2, MapPin, Map, ClipboardList, ExternalLink } from 'lucide-react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';

export default function AiReviewQueue({ items, onClose }) {
  const [processingId, setProcessingId] = useState(null);

  const getSourceLink = (url, sourceName) => {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-primary)', textDecoration: 'none', fontSize: '0.8rem' }}>
        <ExternalLink size={14} />
        {sourceName || new URL(url).hostname}
      </a>
    );
  };

  const handleApprove = async (item) => {
    setProcessingId(item.id);
    try {
      const data = JSON.parse(item.data);
      
      if (item.type === 'location') {
        // Global Deduplication for Locations
        const existing = await db.locations.toArray();
        const duplicate = existing.find(loc => 
          loc.name.toLowerCase() === data.name?.toLowerCase() &&
          (loc.state || '').toLowerCase() === (data.state || '').toLowerCase() &&
          (loc.country || '').toLowerCase() === (data.country || '').toLowerCase()
        );

        if (!duplicate) {
          await queueSyncAction('locations', 'insert', {
            id: generateUUID(),
            name: data.name,
            state: data.state || '',
            country: data.country || '',
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            visited: 0,
            notes: data.description || '',
            local_file_data: data.localImagePath || null,
            created_at: new Date().toISOString()
          });
        }
      } else if (item.type === 'place') {
        // Find best matching location if target_location provided
        let targetLocId = '';
        if (data.target_location) {
          const locs = await db.locations.toArray();
          const match = locs.find(l => l.name.toLowerCase().includes(data.target_location.toLowerCase()));
          if (match) targetLocId = match.id;
        }

        if (targetLocId) {
           const existing = await db.places.where({ location_id: targetLocId }).toArray();
           const duplicate = existing.find(p => p.name.toLowerCase() === data.name?.toLowerCase());
           if (!duplicate) {
             await queueSyncAction('places', 'insert', {
               id: generateUUID(),
               location_id: targetLocId,
               name: data.name,
               category: data.category || 'Attraction',
               latitude: data.latitude || null,
               longitude: data.longitude || null,
               visited: 0,
               notes: data.description || '',
               local_file_data: data.localImagePath || null,
               created_at: new Date().toISOString()
             });
           }
        }
      } else if (item.type === 'itinerary') {
        const tripId = generateUUID();
        await queueSyncAction('trips', 'insert', {
          id: tripId,
          name: data.name || 'AI Imported Trip',
          length: data.length || 1,
          start_date: null,
          visited: 0,
          notes: data.description || '',
          created_at: new Date().toISOString()
        });
        
        // We'll leave day parsing to a manual process for now or future iterations
      }

      await queueSyncAction('ai_imports', 'update', { ...item, status: 'approved' });
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Failed to approve item.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (item) => {
    setProcessingId(item.id);
    try {
      await queueSyncAction('ai_imports', 'update', { ...item, status: 'rejected' });
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="trip-details-overlay" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="dialog-header">
        <h2 style={{ margin: 0 }}>Review Pending Imports</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <X size={24} />
        </button>
      </div>

      <div style={{ padding: '24px', flexGrow: 1, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pending imports to review.</p>
        ) : (
          <div className="grid">
            {items.map(item => {
              const data = JSON.parse(item.data);
              let Icon = MapPin;
              let label = 'Location';
              if (item.type === 'place') { Icon = Map; label = 'Place of Visit'; }
              if (item.type === 'itinerary') { Icon = ClipboardList; label = 'Itinerary'; }

              return (
                <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={18} style={{ color: 'var(--accent-primary)' }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                    {getSourceLink(item.url, item.source)}
                  </div>
                  
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{data.name}</h3>
                  {data.target_location && <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-secondary)' }}>📍 {data.target_location}</p>}
                  {data.description && <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-muted)' }}>{data.description.substring(0, 100)}...</p>}
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--error)' }}
                      onClick={() => handleReject(item)}
                      disabled={processingId === item.id}
                    >
                      <Trash2 size={16} /> Reject
                    </button>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => handleApprove(item)}
                      disabled={processingId === item.id}
                    >
                      <Check size={16} /> Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
