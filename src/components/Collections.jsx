import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { Plus, X, Folder, Eye, Compass, Trash2 } from 'lucide-react';
import MapView from './MapView.jsx';

export default function Collections({ selectedCol, setSelectedCol }) {
  // Dexie query
  const collections = useLiveQuery(() => db.collections.toArray()) || [];
  const locations = useLiveQuery(() => db.locations.toArray()) || [];
  const places = useLiveQuery(() => db.places.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const entityTags = useLiveQuery(() => db.entity_tags.toArray()) || [];

  // System Defined Collections
  const systemCollections = [
    {
      id: 'system-visited',
      name: 'Visited Places',
      isSystem: true
    },
    {
      id: 'system-not-visited',
      name: 'Places Yet to Visit',
      isSystem: true
    }
  ];
  const allCollections = [...systemCollections, ...collections];

  // Local State
  const [showAddForm, setShowAddForm] = useState(false);
  const [colName, setColName] = useState('');
  
  // Rule based auto classification
  const [isAuto, setIsAuto] = useState(false);
  const [selectedRuleTagIds, setSelectedRuleTagIds] = useState([]);
  const [ruleOperator, setRuleOperator] = useState('OR');

  // Manual list
  const [selectedLocs, setSelectedLocs] = useState([]);

  // Edit Collection states
  const [showEditForm, setShowEditForm] = useState(false);
  const [editColName, setEditColName] = useState('');
  const [editIsAuto, setEditIsAuto] = useState(false);
  const [editSelectedRuleTagIds, setEditSelectedRuleTagIds] = useState([]);
  const [editRuleOperator, setEditRuleOperator] = useState('OR');
  const [editSelectedLocs, setEditSelectedLocs] = useState([]);

  // Location search query for selection
  const [locSearchQuery, setLocSearchQuery] = useState('');

  // Filter Locations belonging to a collection
  const getCollectionLocations = (col) => {
    if (col.id === 'system-visited') {
      const visitedPlaceLocationIds = Array.from(new Set(places.filter(p => p.visited === 1).map(p => p.location_id)));
      return locations.filter(loc => loc.visited === 1 || visitedPlaceLocationIds.includes(loc.id));
    }
    if (col.id === 'system-not-visited') {
      const unvisitedPlaceLocationIds = Array.from(new Set(places.filter(p => p.visited === 0).map(p => p.location_id)));
      return locations.filter(loc => loc.visited === 0 || unvisitedPlaceLocationIds.includes(loc.id));
    }

    let matchedLocs = [];

    // Parse rules or parse manual_location_ids
    const rules = col.rules ? (typeof col.rules === 'string' ? JSON.parse(col.rules) : col.rules) : [];
    const manualIds = col.manual_location_ids ? (typeof col.manual_location_ids === 'string' ? JSON.parse(col.manual_location_ids) : col.manual_location_ids) : [];

    if (rules && rules.length > 0) {
      // Auto-grouped by tag rules (e.g. tag matches)
      let op = 'OR';
      let targetTagIds = [];
      if (rules[0].tag_ids) {
        op = rules[0].operator || 'OR';
        targetTagIds = rules[0].tag_ids;
      } else {
        targetTagIds = rules.filter(r => r.type === 'tag').map(r => r.tag_id);
      }
      
      matchedLocs = locations.filter(loc => {
        // Check if loc has any of the target tags
        const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
        if (op === 'AND') {
          return targetTagIds.length > 0 && targetTagIds.every(tid => locTagIds.includes(tid));
        } else {
          return targetTagIds.some(tid => locTagIds.includes(tid));
        }
      });
    } else {
      // Manual list
      matchedLocs = locations.filter(loc => manualIds.includes(loc.id));
    }

    return matchedLocs;
  };

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!colName.trim()) return;

    let rulesArray = null;
    let manualIdsArray = null;

    if (isAuto) {
      if (selectedRuleTagIds.length === 0) return;
      rulesArray = [{ type: 'tag', operator: ruleOperator, tag_ids: selectedRuleTagIds }];
    } else {
      manualIdsArray = selectedLocs;
    }

    const newColId = generateUUID();
    const newCol = {
      id: newColId,
      name: colName,
      rules: rulesArray,
      manual_location_ids: manualIdsArray
    };

    await queueSyncAction('collections', 'insert', newCol);

    // Reset Form
    setColName('');
    setIsAuto(false);
    setSelectedRuleTagIds([]);
    setRuleOperator('OR');
    setSelectedLocs([]);
    setShowAddForm(false);
  };

  const toggleLocationSelection = (locId) => {
    if (selectedLocs.includes(locId)) {
      setSelectedLocs(selectedLocs.filter(id => id !== locId));
    } else {
      setSelectedLocs([...selectedLocs, locId]);
    }
  };

  const handleDeleteCollection = async (colId) => {
    if (window.confirm('Delete this collection? (Locations will not be deleted)')) {
      await queueSyncAction('collections', 'delete', { id: colId });
      setSelectedCol(null);
    }
  };

  const handleStartEditCollection = () => {
    if (!selectedCol) return;
    setEditColName(selectedCol.name);
    const rules = selectedCol.rules ? (typeof selectedCol.rules === 'string' ? JSON.parse(selectedCol.rules) : selectedCol.rules) : [];
    const manualIds = selectedCol.manual_location_ids ? (typeof selectedCol.manual_location_ids === 'string' ? JSON.parse(selectedCol.manual_location_ids) : selectedCol.manual_location_ids) : [];
    if (rules && rules.length > 0) {
      setEditIsAuto(true);
      if (rules[0].tag_ids) {
        setEditSelectedRuleTagIds(rules[0].tag_ids);
        setEditRuleOperator(rules[0].operator || 'OR');
      } else {
        setEditSelectedRuleTagIds(rules.filter(r => r.type === 'tag').map(r => r.tag_id).filter(id => id));
        setEditRuleOperator('OR');
      }
      setEditSelectedLocs([]);
    } else {
      setEditIsAuto(false);
      setEditSelectedRuleTagIds([]);
      setEditRuleOperator('OR');
      setEditSelectedLocs(manualIds);
    }
    setLocSearchQuery('');
    setShowEditForm(true);
  };

  const handleSaveEditCollection = async (e) => {
    e.preventDefault();
    if (!editColName.trim()) return;

    let rulesArray = null;
    let manualIdsArray = null;

    if (editIsAuto) {
      if (editSelectedRuleTagIds.length === 0) return;
      rulesArray = [{ type: 'tag', operator: editRuleOperator, tag_ids: editSelectedRuleTagIds }];
    } else {
      manualIdsArray = editSelectedLocs;
    }

    const updatedCol = {
      ...selectedCol,
      name: editColName,
      rules: rulesArray,
      manual_location_ids: manualIdsArray
    };

    await queueSyncAction('collections', 'update', updatedCol);
    setSelectedCol(updatedCol);
    setShowEditForm(false);
  };

  const toggleEditLocationSelection = (locId) => {
    if (editSelectedLocs.includes(locId)) {
      setEditSelectedLocs(editSelectedLocs.filter(id => id !== locId));
    } else {
      setEditSelectedLocs([...editSelectedLocs, locId]);
    }
  };

  if (selectedCol) {
    return (
      <div className="container">
        {/* Full Page Details Header */}
        <div className="page-header" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ margin: 0 }}>
              {selectedCol.name}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!selectedCol.isSystem && (
              <>
                <button 
                  className="btn btn-secondary"
                  onClick={handleStartEditCollection}
                  style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  Edit Collection
                </button>
                <button 
                  className="btn" 
                  onClick={() => handleDeleteCollection(selectedCol.id)} 
                  style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', border: '1px solid var(--error-glow)' }}
                >
                  <Trash2 size={16} /> Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Details Content in Side-by-Side Grid */}
        <div className="location-detail-grid">
          {/* Left Column: Details & Locations List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {selectedCol.rules && (
              <div style={{ background: 'rgba(6, 182, 212, 0.10)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                  💡 Auto-Group Rule Active
                </span>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Locations are automatically grouped based on matching tags. Edit the collection to change manual or auto settings.
                </p>
              </div>
            )}

            <div>
              <h3 style={{ marginBottom: '16px' }}>Locations in Collection</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {getCollectionLocations(selectedCol).map(loc => {
                  let locPlaces = places.filter(p => p.location_id === loc.id);
                  if (selectedCol.id === 'system-visited') {
                    locPlaces = locPlaces.filter(p => p.visited === 1);
                  } else if (selectedCol.id === 'system-not-visited') {
                    locPlaces = locPlaces.filter(p => p.visited === 0);
                  }
                  return (
                    <div 
                      key={loc.id} 
                      style={{
                        background: '#191924', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)',
                        padding: '16px'
                      }}
                    >
                      <h4 style={{ color: 'var(--accent-primary-hover)', margin: '0 0 8px 0' }}>{loc.name}</h4>
                      {locPlaces.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                          {locPlaces.map(p => (
                            <span 
                              key={p.id} 
                              style={{
                                fontSize: '0.75rem', background: 'rgba(255,255,255,0.04)', padding: '2px 8px',
                                border: '1px solid var(--border-glass)', borderRadius: '4px',
                                color: p.visited === 1 ? 'var(--success)' : 'var(--text-primary)'
                              }}
                            >
                              {p.visited === 1 ? '✓ ' : ''}{p.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>No places to visit registered yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Leaflet Map View */}
          <div style={{ position: 'sticky', top: '100px', height: 'calc(100vh - 160px)', minHeight: '450px', zIndex: 10 }}>
            {(() => {
              const colLocs = getCollectionLocations(selectedCol);
              const locIds = colLocs.map(l => l.id);
              const colPlaces = places.filter(p => locIds.includes(p.location_id));
              const mapPoints = [
                ...colLocs.map(l => ({ ...l, category: 'location' })),
                ...colPlaces.map(p => ({ ...p, type: p.category }))
              ];

              return mapPoints.length > 0 ? (
                <MapView points={mapPoints} />
              ) : (
                <div style={{
                  height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                  border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)'
                }}>
                  No geocoded locations or places inside this collection to map.
                </div>
              );
            })()}
          </div>
        </div>

        {/* Edit Collection Dialog overlay */}
        {showEditForm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
            padding: '20px'
          }}>
            <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3>Edit Collection</h3>
                <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowEditForm(false)} />
              </div>

              <form onSubmit={handleSaveEditCollection}>
                <div className="form-group">
                  <label>Collection Name</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Europe 2026, Beach Getaways..."
                    value={editColName}
                    onChange={(e) => setEditColName(e.target.value)}
                  />
                </div>

                {/* Grouping type */}
                <div className="form-group">
                  <label>Classification Method</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        checked={!editIsAuto}
                        onChange={() => setEditIsAuto(false)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      Manual Selection
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        checked={editIsAuto}
                        onChange={() => setEditIsAuto(true)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      Auto-Group by Tag Rule
                    </label>
                  </div>
                </div>

                {editIsAuto ? (
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                    <label>Select Auto-Classification Tags</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                        <input type="radio" checked={editRuleOperator === 'OR'} onChange={() => setEditRuleOperator('OR')} /> Match ANY (OR)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                        <input type="radio" checked={editRuleOperator === 'AND'} onChange={() => setEditRuleOperator('AND')} /> Match ALL (AND)
                      </label>
                    </div>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {tags.map(t => (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={editSelectedRuleTagIds.includes(t.id)}
                            onChange={() => {
                              if (editSelectedRuleTagIds.includes(t.id)) {
                                setEditSelectedRuleTagIds(editSelectedRuleTagIds.filter(id => id !== t.id));
                              } else {
                                setEditSelectedRuleTagIds([...editSelectedRuleTagIds, t.id]);
                              }
                            }}
                            style={{ accentColor: 'var(--accent-primary)' }}
                          />
                          {t.name}
                        </label>
                      ))}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      💡 Locations matching these tags will be dynamically categorized into this collection.
                    </p>
                  </div>
                ) : (
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                    <label style={{ marginBottom: '8px', display: 'block' }}>Select Locations to Add</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search locations..."
                      value={locSearchQuery}
                      onChange={(e) => setLocSearchQuery(e.target.value)}
                      style={{ marginBottom: '10px' }}
                    />
                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {locations.filter(loc => loc.name.toLowerCase().includes(locSearchQuery.toLowerCase())).map(loc => (
                        <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={editSelectedLocs.includes(loc.id)}
                            onChange={() => toggleEditLocationSelection(loc.id)}
                            style={{ accentColor: 'var(--accent-primary)' }}
                          />
                          {loc.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h2>Collections</h2>
        <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setLocSearchQuery(''); }} style={{ width: 'auto' }}>
          <Plus size={18} />
          Create Collection
        </button>
      </div>

      {collections.length === 0 && !showAddForm && (
        <div className="empty-state">
          <Folder size={48} className="empty-state-icon" />
          <h3>No Collections</h3>
          <p>Group cities or countries by custom tags (like "Europe Roadtrip") or compile lists manually.</p>
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setLocSearchQuery(''); }}>
            Create Collection
          </button>
        </div>
      )}

      {/* Add Collection Dialog overlay */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Create New Collection</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowAddForm(false)} />
            </div>

            <form onSubmit={handleCreateCollection}>
              <div className="form-group">
                <label>Collection Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. Europe 2026, Beach Getaways..."
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                />
              </div>

              {/* Grouping type */}
              <div className="form-group">
                <label>Classification Method</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      checked={!isAuto}
                      onChange={() => setIsAuto(false)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    Manual Selection
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      checked={isAuto}
                      onChange={() => setIsAuto(true)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    Auto-Group by Tag Rule
                  </label>
                </div>
              </div>

              {isAuto ? (
                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <label>Select Auto-Classification Tags</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                      <input type="radio" checked={ruleOperator === 'OR'} onChange={() => setRuleOperator('OR')} /> Match ANY (OR)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                      <input type="radio" checked={ruleOperator === 'AND'} onChange={() => setRuleOperator('AND')} /> Match ALL (AND)
                    </label>
                  </div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {tags.map(t => (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedRuleTagIds.includes(t.id)}
                          onChange={() => {
                            if (selectedRuleTagIds.includes(t.id)) {
                              setSelectedRuleTagIds(selectedRuleTagIds.filter(id => id !== t.id));
                            } else {
                              setSelectedRuleTagIds([...selectedRuleTagIds, t.id]);
                            }
                          }}
                          style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    💡 Locations matching these tags will be dynamically categorized into this collection.
                  </p>
                </div>
              ) : (
                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <label style={{ marginBottom: '8px', display: 'block' }}>Select Locations to Add</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search locations..."
                    value={locSearchQuery}
                    onChange={(e) => setLocSearchQuery(e.target.value)}
                    style={{ marginBottom: '10px' }}
                  />
                  <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {locations.filter(loc => loc.name.toLowerCase().includes(locSearchQuery.toLowerCase())).map(loc => (
                      <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedLocs.includes(loc.id)}
                          onChange={() => toggleLocationSelection(loc.id)}
                          style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        {loc.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collections list grid */}
      <div className="grid">
        {allCollections.map(col => {
          const colLocs = getCollectionLocations(col);
          let colPlaces = places.filter(p => colLocs.map(l => l.id).includes(p.location_id));
          if (col.id === 'system-visited') {
            colPlaces = colPlaces.filter(p => p.visited === 1);
          } else if (col.id === 'system-not-visited') {
            colPlaces = colPlaces.filter(p => p.visited === 0);
          }
          const totalPlaces = colPlaces.length;

          return (
            <div key={col.id} className="card" onClick={() => setSelectedCol(col)} style={{ minHeight: '140px' }}>
              <div className="card-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Folder style={{ color: 'var(--accent-primary-hover)' }} size={20} />
                  <h3 style={{ margin: 0 }}>{col.name}</h3>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flexGrow: 1 }}>
                  Contains <b>{colLocs.length}</b> locations and <b>{totalPlaces}</b> places to visit.
                </p>

                {col.rules && (
                  <span className="tag-badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-secondary)', alignSelf: 'flex-start', marginTop: '12px' }}>
                    Auto-Group Rule
                  </span>
                )}
                {col.isSystem && (
                  <span className="tag-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', alignSelf: 'flex-start', marginTop: '12px' }}>
                    System Collection
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
