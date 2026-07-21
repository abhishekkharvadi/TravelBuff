import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { Plus, X, Folder, Eye, Compass, Trash2, Edit, Search } from 'lucide-react';
import MapView from './MapView.jsx';

export default function Collections({ selectedCol, setSelectedCol }) {
  // Dexie query
  const collections = useLiveQuery(() => db.collections.toArray()) || [];
  const locations = useLiveQuery(() => db.locations.toArray()) || [];
  const places = useLiveQuery(() => db.places.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const entityTags = useLiveQuery(() => db.entity_tags.toArray()) || [];
  const customCategories = useLiveQuery(() => db.custom_categories.toArray()) || [];
  const photos = useLiveQuery(() => db.entity_photos.toArray()) || [];

  const getFeaturedPhoto = (entityId) => {
    const loc = locations.find(l => l.id === entityId);
    if (loc && loc.local_file_data) return loc.local_file_data;

    const place = places.find(p => p.id === entityId);
    if (place && place.local_file_data) return place.local_file_data;

    const pList = photos.filter(p => p.entity_id === entityId);
    const featured = pList.find(p => p.is_featured === 1);
    return featured ? featured.file_path : (pList[0] ? pList[0].file_path : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600');
  };

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
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [colFilter, setColFilter] = useState('ALL'); // 'ALL', 'MANUAL', 'AUTO'
  const [colSearchQuery, setColSearchQuery] = useState('');
  const [selectedRuleCategoryNames, setSelectedRuleCategoryNames] = useState([]);
  const [editSelectedRuleCategoryNames, setEditSelectedRuleCategoryNames] = useState([]);

  // Filter Locations belonging to a collection
  // Resolve both locations and places belonging to a collection
  const getCollectionItems = (col) => {
    if (col.id === 'system-visited') {
      const visitedPlaces = places.filter(p => p.visited === 1);
      const visitedPlaceLocationIds = Array.from(new Set(visitedPlaces.map(p => p.location_id)));
      const matchedLocs = locations.filter(loc => loc.visited === 1 || visitedPlaceLocationIds.includes(loc.id));
      return { locations: matchedLocs, places: visitedPlaces };
    }
    if (col.id === 'system-not-visited') {
      const unvisitedPlaces = places.filter(p => p.visited === 0);
      const unvisitedPlaceLocationIds = Array.from(new Set(unvisitedPlaces.map(p => p.location_id)));
      const matchedLocs = locations.filter(loc => loc.visited === 0 || unvisitedPlaceLocationIds.includes(loc.id));
      return { locations: matchedLocs, places: unvisitedPlaces };
    }

    const rules = col.rules ? (typeof col.rules === 'string' ? JSON.parse(col.rules) : col.rules) : [];
    const manualIds = col.manual_location_ids ? (typeof col.manual_location_ids === 'string' ? JSON.parse(col.manual_location_ids) : col.manual_location_ids) : [];

    let matchedLocs = [];
    let matchedPlaces = [];

    if (rules && rules.length > 0) {
      // Auto-Group mode
      const rule = rules[0];
      const op = rule.operator || 'OR';
      const targetTagIds = rule.tag_ids || [];
      const targetCategories = rule.categories || [];

      if (op === 'OR') {
        // Match ANY
        matchedLocs = locations.filter(loc => {
          const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
          return targetTagIds.some(tid => locTagIds.includes(tid));
        });
        matchedPlaces = places.filter(p => {
          const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
          const matchesTag = targetTagIds.some(tid => placeTagIds.includes(tid));
          const matchesCategory = targetCategories.includes(p.category);
          return matchesTag || matchesCategory;
        });
      } else {
        // Match ALL
        matchedLocs = locations.filter(loc => {
          const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
          const matchesAllTags = targetTagIds.length > 0 && targetTagIds.every(tid => locTagIds.includes(tid));
          return matchesAllTags && targetCategories.length === 0;
        });
        matchedPlaces = places.filter(p => {
          const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
          const matchesAllTags = targetTagIds.length === 0 || targetTagIds.every(tid => placeTagIds.includes(tid));
          const matchesAllCategories = targetCategories.length === 0 || targetCategories.every(cat => p.category === cat);
          return matchesAllTags && matchesAllCategories && (targetTagIds.length > 0 || targetCategories.length > 0);
        });
      }
    } else {
      // Manual list (extract locations and places based on prefixes)
      const locIds = manualIds.filter(id => id.startsWith('loc:') || (!id.startsWith('loc:') && !id.startsWith('place:'))).map(id => id.replace(/^loc:/, ''));
      const placeIds = manualIds.filter(id => id.startsWith('place:')).map(id => id.replace(/^place:/, ''));

      matchedLocs = locations.filter(loc => locIds.includes(loc.id));
      matchedPlaces = places.filter(p => placeIds.includes(p.id));
    }

    return { locations: matchedLocs, places: matchedPlaces };
  };

  const getCollectionLocations = (col) => {
    return getCollectionItems(col).locations;
  };

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!colName.trim()) return;

    let rulesArray = null;
    let manualIdsArray = null;

    if (isAuto) {
      if (selectedRuleTagIds.length === 0 && selectedRuleCategoryNames.length === 0) return;
      rulesArray = [{ type: 'auto', operator: ruleOperator, tag_ids: selectedRuleTagIds, categories: selectedRuleCategoryNames }];
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
    setSelectedRuleCategoryNames([]);
    setRuleOperator('OR');
    setSelectedLocs([]);
    setShowAddForm(false);
  };

  const toggleLocationSelection = (locId) => {
    const prefixed = locId.startsWith('loc:') || locId.startsWith('place:') ? locId : `loc:${locId}`;
    if (selectedLocs.includes(prefixed)) {
      setSelectedLocs(selectedLocs.filter(id => id !== prefixed));
    } else {
      setSelectedLocs([...selectedLocs, prefixed]);
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
      setEditSelectedRuleTagIds(rules[0].tag_ids || []);
      setEditSelectedRuleCategoryNames(rules[0].categories || []);
      setEditRuleOperator(rules[0].operator || 'OR');
      setEditSelectedLocs([]);
    } else {
      setEditIsAuto(false);
      setEditSelectedRuleTagIds([]);
      setEditSelectedRuleCategoryNames([]);
      setEditRuleOperator('OR');
      setEditSelectedLocs(manualIds);
    }
    setLocSearchQuery('');
    setPlaceSearchQuery('');
    setShowEditForm(true);
  };

  const handleSaveEditCollection = async (e) => {
    e.preventDefault();
    if (!editColName.trim()) return;

    let rulesArray = null;
    let manualIdsArray = null;

    if (editIsAuto) {
      if (editSelectedRuleTagIds.length === 0 && editSelectedRuleCategoryNames.length === 0) return;
      rulesArray = [{ type: 'auto', operator: editRuleOperator, tag_ids: editSelectedRuleTagIds, categories: editSelectedRuleCategoryNames }];
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
    const prefixed = locId.startsWith('loc:') || locId.startsWith('place:') ? locId : `loc:${locId}`;
    if (editSelectedLocs.includes(prefixed)) {
      setEditSelectedLocs(editSelectedLocs.filter(id => id !== prefixed));
    } else {
      setEditSelectedLocs([...editSelectedLocs, prefixed]);
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
                  style={{ width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}
                  title="Edit Collection"
                >
                  <Edit size={16} />
                </button>
                <button 
                  className="btn" 
                  onClick={() => handleDeleteCollection(selectedCol.id)} 
                  style={{ width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', border: '1px solid var(--error-glow)' }}
                  title="Delete Collection"
                >
                  <Trash2 size={16} />
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

            {(() => {
              const colItems = getCollectionItems(selectedCol);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {colItems.locations.length > 0 && (
                    <div>
                      <h3 style={{ marginBottom: '16px' }}>Locations in Collection</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {colItems.locations.map(loc => {
                          const locPlaces = places.filter(p => p.location_id === loc.id);
                          return (
                            <div 
                              key={loc.id} 
                              style={{
                                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)',
                                padding: '16px', display: 'flex', gap: '16px', alignItems: 'center'
                              }}
                            >
                              <img 
                                src={getFeaturedPhoto(loc.id)} 
                                alt={loc.name} 
                                style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                                onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'}
                              />
                              <div style={{ flexGrow: 1 }}>
                                <h4 style={{ color: 'var(--accent-primary-hover)', margin: '0 0 8px 0' }}>{loc.name}</h4>
                                {locPlaces.length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                    {locPlaces.map(p => (
                                      <span 
                                        key={p.id} 
                                        style={{
                                          fontSize: '0.75rem', background: 'var(--bg-app)', padding: '2px 8px',
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {colItems.places.length > 0 && (
                    <div>
                      <h3 style={{ marginBottom: '16px' }}>Places of Visit in Collection</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {colItems.places.map(p => {
                          const parentLoc = locations.find(l => l.id === p.location_id);
                          return (
                            <div 
                              key={p.id} 
                              style={{
                                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)',
                                padding: '16px', display: 'flex', gap: '16px', alignItems: 'center'
                              }}
                            >
                              <img 
                                src={getFeaturedPhoto(p.id)} 
                                alt={p.name} 
                                style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                                onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'}
                              />
                              <div style={{ flexGrow: 1 }}>
                                <h4 style={{ color: p.visited === 1 ? 'var(--success)' : 'var(--text-primary)', margin: '0 0 4px 0' }}>
                                  {p.visited === 1 ? '✓ ' : ''}{p.name}
                                </h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  📍 {parentLoc ? parentLoc.name : 'Unknown Location'}
                                </span>
                              </div>
                              <span className="tag-badge" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)', fontSize: '0.7rem', flexShrink: 0 }}>
                                {p.category}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Right Column: Leaflet Map View */}
          <div style={{ position: 'sticky', top: '100px', height: 'calc(100vh - 160px)', minHeight: '450px', zIndex: 10 }}>
            {(() => {
              const colItems = getCollectionItems(selectedCol);
              const mapPoints = [
                ...colItems.locations.map(l => ({ ...l, category: 'location' })),
                ...colItems.places.map(p => ({ ...p, type: p.category }))
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
                      Auto-Group
                    </label>
                  </div>
                </div>

                {editIsAuto ? (
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                    <label>Auto-Classification Rules</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                        <input type="radio" checked={editRuleOperator === 'OR'} onChange={() => setEditRuleOperator('OR')} /> Match ANY (OR)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                        <input type="radio" checked={editRuleOperator === 'AND'} onChange={() => setEditRuleOperator('AND')} /> Match ALL (AND)
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Filter by Tags</label>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {tags.map(t => (
                            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
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
                              />
                              {t.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Filter by Categories</label>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {Array.from(new Set([
                            'Food', 'Hotel', 'Lodging', 'Dinner', 'Lunch', 'Snacks', 'Transportation', 'Fuel', 'Entertainment', 'Other',
                            ...customCategories.map(c => c.name)
                          ])).map(cat => (
                            <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={editSelectedRuleCategoryNames.includes(cat)}
                                onChange={() => {
                                  if (editSelectedRuleCategoryNames.includes(cat)) {
                                    setEditSelectedRuleCategoryNames(editSelectedRuleCategoryNames.filter(c => c !== cat));
                                  } else {
                                    setEditSelectedRuleCategoryNames([...editSelectedRuleCategoryNames, cat]);
                                  }
                                }}
                              />
                              {cat}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Manual Selection</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Add Locations</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search locations..."
                          value={locSearchQuery}
                          onChange={(e) => setLocSearchQuery(e.target.value)}
                          style={{ marginBottom: '8px', height: '30px', fontSize: '0.8rem' }}
                        />
                        <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {locations.filter(loc => loc.name.toLowerCase().includes(locSearchQuery.toLowerCase())).map(loc => (
                            <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={editSelectedLocs.includes(`loc:${loc.id}`) || editSelectedLocs.includes(loc.id)}
                                onChange={() => toggleEditLocationSelection(`loc:${loc.id}`)}
                              />
                              {loc.name}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Add Places of Visit</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search places..."
                          value={placeSearchQuery}
                          onChange={(e) => setPlaceSearchQuery(e.target.value)}
                          style={{ marginBottom: '8px', height: '30px', fontSize: '0.8rem' }}
                        />
                        <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {places.filter(p => p.name.toLowerCase().includes(placeSearchQuery.toLowerCase())).map(p => (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={editSelectedLocs.includes(`place:${p.id}`)}
                                onChange={() => toggleEditLocationSelection(`place:${p.id}`)}
                              />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      </div>
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
        <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setLocSearchQuery(''); setPlaceSearchQuery(''); }} style={{ width: 'auto' }}>
          Create Collection
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', alignSelf: 'flex-start', width: 'fit-content' }}>
          {['ALL', 'MANUAL', 'AUTO'].map(type => (
            <button
              key={type}
              onClick={() => setColFilter(type)}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: colFilter === type ? 'var(--accent-primary)' : 'transparent',
                color: colFilter === type ? '#000' : 'var(--text-secondary)',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              {type === 'ALL' ? 'All' : type === 'MANUAL' ? 'Manual Selection' : 'Auto-Group'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            style={{ padding: '6px 12px 6px 30px', fontSize: '0.8rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', width: '100%', color: 'var(--text-primary)' }}
            placeholder="Search collections..."
            value={colSearchQuery}
            onChange={(e) => setColSearchQuery(e.target.value)}
          />
        </div>
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
                    Auto-Group
                  </label>
                </div>
              </div>

              {isAuto ? (
                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <label>Auto-Classification Rules</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                      <input type="radio" checked={ruleOperator === 'OR'} onChange={() => setRuleOperator('OR')} /> Match ANY (OR)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                      <input type="radio" checked={ruleOperator === 'AND'} onChange={() => setRuleOperator('AND')} /> Match ALL (AND)
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Filter by Tags</label>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tags.map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
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
                            />
                            {t.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Filter by Categories</label>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Array.from(new Set([
                          'Food', 'Hotel', 'Lodging', 'Dinner', 'Lunch', 'Snacks', 'Transportation', 'Fuel', 'Entertainment', 'Other',
                          ...customCategories.map(c => c.name)
                        ])).map(cat => (
                          <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedRuleCategoryNames.includes(cat)}
                              onChange={() => {
                                  if (selectedRuleCategoryNames.includes(cat)) {
                                    setSelectedRuleCategoryNames(selectedRuleCategoryNames.filter(c => c !== cat));
                                  } else {
                                    setSelectedRuleCategoryNames([...selectedRuleCategoryNames, cat]);
                                  }
                              }}
                            />
                            {cat}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Manual Selection</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Add Locations</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search locations..."
                        value={locSearchQuery}
                        onChange={(e) => setLocSearchQuery(e.target.value)}
                        style={{ marginBottom: '8px', height: '30px', fontSize: '0.8rem' }}
                      />
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {locations.filter(loc => loc.name.toLowerCase().includes(locSearchQuery.toLowerCase())).map(loc => (
                          <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedLocs.includes(`loc:${loc.id}`)}
                              onChange={() => toggleLocationSelection(`loc:${loc.id}`)}
                            />
                            {loc.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Add Places of Visit</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search places..."
                        value={placeSearchQuery}
                        onChange={(e) => setPlaceSearchQuery(e.target.value)}
                        style={{ marginBottom: '8px', height: '30px', fontSize: '0.8rem' }}
                      />
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {places.filter(p => p.name.toLowerCase().includes(placeSearchQuery.toLowerCase())).map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedLocs.includes(`place:${p.id}`)}
                              onChange={() => toggleLocationSelection(`place:${p.id}`)}
                            />
                            {p.name}
                          </label>
                        ))}
                      </div>
                    </div>
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
        {(() => {
          const filteredCollections = allCollections.filter(col => {
            if (colSearchQuery.trim() !== '') {
              if (!col.name.toLowerCase().includes(colSearchQuery.toLowerCase())) {
                return false;
              }
            }
            if (colFilter === 'ALL') return true;
            const rules = col.rules ? (typeof col.rules === 'string' ? JSON.parse(col.rules) : col.rules) : [];
            const hasRules = rules && rules.length > 0;
            if (colFilter === 'AUTO') {
              return hasRules && (rules[0].type === 'auto' || rules[0].type === 'tag' || rules[0].type === 'category');
            }
            if (colFilter === 'MANUAL') {
              return !hasRules || rules[0].type === 'manual';
            }
            return true;
          });

          return filteredCollections.map(col => {
            const colItems = getCollectionItems(col);
            const totalPlaces = colItems.places.length;

            return (
              <div key={col.id} className="card" onClick={() => setSelectedCol(col)} style={{ minHeight: '140px' }}>
                <div className="card-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Folder style={{ color: 'var(--accent-primary-hover)' }} size={20} />
                    <h3 style={{ margin: 0 }}>{col.name}</h3>
                  </div>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flexGrow: 1 }}>
                    Contains <b>{colItems.locations.length}</b> locations and <b>{totalPlaces}</b> places to visit.
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
          });
        })()}
      </div>
    </div>
  );
}
