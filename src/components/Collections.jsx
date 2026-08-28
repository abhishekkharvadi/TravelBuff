import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { Plus, X, Folder, Eye, Compass, Trash2, Edit, Search, ChevronRight, ChevronDown } from 'lucide-react';
import MapView from './MapView.jsx';

const NestedManualSelector = ({ 
  locations, 
  places, 
  selectedItems, 
  onToggleItem
}) => {
  const [search, setSearch] = useState('');
  const [expandedLocs, setExpandedLocs] = useState({});

  const toggleExpand = (locId) => {
    setExpandedLocs(prev => ({ ...prev, [locId]: !prev[locId] }));
  };

  const filteredLocations = locations.filter(loc => {
    if (!search.trim()) return true;
    const matchLoc = loc.name.toLowerCase().includes(search.toLowerCase());
    const matchChildPlace = places.some(p => p.location_id === loc.id && p.name.toLowerCase().includes(search.toLowerCase()));
    return matchLoc || matchChildPlace;
  });

  const standalonePlaces = places.filter(p => p.is_folder !== 1 && (!p.location_id || !locations.some(l => l.id === p.location_id)));
  const filteredStandalonePlaces = standalonePlaces.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <input
        type="text"
        className="form-control"
        placeholder="🔍 Search locations or places of visit..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '10px', fontSize: '0.8rem', height: '32px' }}
      />
      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '8px', background: 'var(--bg-app)' }}>
        {filteredLocations.length === 0 && filteredStandalonePlaces.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: '8px 0' }}>No matching items found</p>
        ) : (
          filteredLocations.map(loc => {
            const childPlaces = places.filter(p => p.location_id === loc.id && (!search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || loc.name.toLowerCase().includes(search.toLowerCase())));
            const isLocSelected = selectedItems.includes(`loc:${loc.id}`);
            const isExpanded = search.trim() ? true : !!expandedLocs[loc.id];
            const selectedChildCount = childPlaces.filter(p => selectedItems.includes(`place:${p.id}`)).length;

            return (
              <div key={loc.id} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface-elevated)', padding: '6px 10px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(loc.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={isLocSelected}
                        onChange={() => onToggleItem(`loc:${loc.id}`)}
                      />
                      📁 {loc.name}
                    </label>
                  </div>
                  {childPlaces.length > 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {selectedChildCount}/{childPlaces.length} places
                    </span>
                  )}
                </div>

                {/* Nested Child Places */}
                {isExpanded && childPlaces.length > 0 && (
                  <div style={{ paddingLeft: '28px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {childPlaces.map(p => {
                      const isPlaceSelected = selectedItems.includes(`place:${p.id}`);
                      return (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', padding: '2px 4px' }}>
                          <input
                            type="checkbox"
                            checked={isPlaceSelected}
                            onChange={() => onToggleItem(`place:${p.id}`)}
                          />
                          📍 {p.name}
                          {p.category && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '4px' }}>({p.category})</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Standalone Places */}
        {filteredStandalonePlaces.length > 0 && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-glass)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', paddingLeft: '6px' }}>
              📦 Unassigned / Other Places
            </div>
            <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredStandalonePlaces.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(`place:${p.id}`)}
                    onChange={() => onToggleItem(`place:${p.id}`)}
                  />
                  📍 {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Collections({ selectedCol, setSelectedCol, onNavigateToLocation }) {
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
    if (loc && loc.local_file_data) {
      let url = loc.local_file_data;
      if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('/')) url = '/' + url;
      return url;
    }

    const photo = photos.find(p => p.entity_id === entityId);
    if (photo && photo.file_path) {
      let url = photo.file_path;
      if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('/')) url = '/' + url;
      return url;
    }

    const childPlace = places.find(p => p.location_id === entityId && p.local_file_data);
    if (childPlace && childPlace.local_file_data) {
      let url = childPlace.local_file_data;
      if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('/')) url = '/' + url;
      return url;
    }

    return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600';
  };

  // System Defined Collections
  const systemCollections = [
    {
      id: 'system-visited',
      name: 'Visited Places',
      isSystem: true,
      description: 'Automatically shows all visited places and locations'
    },
    {
      id: 'system-not-visited',
      name: 'Bucket List (Not Visited)',
      isSystem: true,
      description: 'Automatically shows places and locations you have not visited yet'
    }
  ];
  const allCollections = [...systemCollections, ...collections];

  // Local State
  const [showAddForm, setShowAddForm] = useState(false);
  const [colName, setColName] = useState('');
  
  // Rule based auto classification
  const [isAuto, setIsAuto] = useState(false);
  const [selectedRuleLocIds, setSelectedRuleLocIds] = useState([]);
  const [selectedRuleTagIds, setSelectedRuleTagIds] = useState([]);
  const [selectedRuleCategoryNames, setSelectedRuleCategoryNames] = useState([]);
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleOperator, setRuleOperator] = useState('OR');

  // Manual list
  const [selectedLocs, setSelectedLocs] = useState([]);

  // Edit Collection states
  const [showEditForm, setShowEditForm] = useState(false);
  const [editColName, setEditColName] = useState('');
  const [editIsAuto, setEditIsAuto] = useState(false);
  const [editSelectedRuleLocIds, setEditSelectedRuleLocIds] = useState([]);
  const [editSelectedRuleTagIds, setEditSelectedRuleTagIds] = useState([]);
  const [editSelectedRuleCategoryNames, setEditSelectedRuleCategoryNames] = useState([]);
  const [editRuleKeyword, setEditRuleKeyword] = useState('');
  const [editRuleOperator, setEditRuleOperator] = useState('OR');
  const [editSelectedLocs, setEditSelectedLocs] = useState([]);

  const [autoFilterSearch, setAutoFilterSearch] = useState('');
  const [editAutoFilterSearch, setEditAutoFilterSearch] = useState('');

  const [colFilter, setColFilter] = useState('ALL'); // 'ALL', 'MANUAL', 'AUTO'
  const [colSearchQuery, setColSearchQuery] = useState('');

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
      const unvisitedPlaces = places.filter(p => p.visited !== 1);
      const unvisitedPlaceLocationIds = Array.from(new Set(unvisitedPlaces.map(p => p.location_id)));
      const matchedLocs = locations.filter(loc => (loc.visited !== 1) || unvisitedPlaceLocationIds.includes(loc.id));
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
      const targetLocIds = rule.location_ids || [];
      const targetTagIds = rule.tag_ids || [];
      const targetCategories = rule.categories || [];
      const keyword = (rule.keywords || '').trim().toLowerCase();
      const kwList = keyword ? keyword.split(',').map(k => k.trim()).filter(Boolean) : [];

      if (op === 'OR') {
        // Match ANY criterion
        matchedLocs = locations.filter(loc => {
          const matchesLoc = targetLocIds.length > 0 && targetLocIds.includes(loc.id);
          const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
          const matchesTag = targetTagIds.length > 0 && targetTagIds.some(tid => locTagIds.includes(tid));
          const matchesKw = kwList.length > 0 && kwList.some(kw => (loc.name || '').toLowerCase().includes(kw) || (loc.notes || '').toLowerCase().includes(kw));
          
          return matchesLoc || matchesTag || matchesKw;
        });

        matchedPlaces = places.filter(p => {
          const matchesLoc = targetLocIds.length > 0 && targetLocIds.includes(p.location_id);
          const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
          const matchesTag = targetTagIds.length > 0 && targetTagIds.some(tid => placeTagIds.includes(tid));
          const matchesCategory = targetCategories.length > 0 && targetCategories.includes(p.category);
          const matchesKw = kwList.length > 0 && kwList.some(kw => (p.name || '').toLowerCase().includes(kw) || (p.notes || '').toLowerCase().includes(kw) || (p.category || '').toLowerCase().includes(kw));
          
          return matchesLoc || matchesTag || matchesCategory || matchesKw;
        });
      } else {
        // Match ALL active criteria
        matchedLocs = locations.filter(loc => {
          if (targetLocIds.length > 0 && !targetLocIds.includes(loc.id)) return false;
          
          if (targetTagIds.length > 0) {
            const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
            if (!targetTagIds.every(tid => locTagIds.includes(tid))) return false;
          }

          if (kwList.length > 0) {
            const matchesKw = kwList.every(kw => (loc.name || '').toLowerCase().includes(kw) || (loc.notes || '').toLowerCase().includes(kw));
            if (!matchesKw) return false;
          }

          if (targetCategories.length > 0) return false;

          return targetLocIds.length > 0 || targetTagIds.length > 0 || kwList.length > 0;
        });

        matchedPlaces = places.filter(p => {
          if (targetLocIds.length > 0 && !targetLocIds.includes(p.location_id)) return false;

          if (targetCategories.length > 0 && !targetCategories.includes(p.category)) return false;

          if (targetTagIds.length > 0) {
            const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
            if (!targetTagIds.every(tid => placeTagIds.includes(tid))) return false;
          }

          if (kwList.length > 0) {
            const matchesKw = kwList.every(kw => (p.name || '').toLowerCase().includes(kw) || (p.notes || '').toLowerCase().includes(kw) || (p.category || '').toLowerCase().includes(kw));
            if (!matchesKw) return false;
          }

          return targetLocIds.length > 0 || targetCategories.length > 0 || targetTagIds.length > 0 || kwList.length > 0;
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
      if (selectedRuleLocIds.length === 0 && selectedRuleTagIds.length === 0 && selectedRuleCategoryNames.length === 0 && !ruleKeyword.trim()) return;
      rulesArray = [{ 
        type: 'auto', 
        operator: ruleOperator, 
        location_ids: selectedRuleLocIds, 
        tag_ids: selectedRuleTagIds, 
        categories: selectedRuleCategoryNames,
        keywords: ruleKeyword.trim()
      }];
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
    setSelectedRuleLocIds([]);
    setSelectedRuleTagIds([]);
    setSelectedRuleCategoryNames([]);
    setRuleKeyword('');
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
      setEditSelectedRuleLocIds(rules[0].location_ids || []);
      setEditSelectedRuleTagIds(rules[0].tag_ids || []);
      setEditSelectedRuleCategoryNames(rules[0].categories || []);
      setEditRuleKeyword(rules[0].keywords || '');
      setEditRuleOperator(rules[0].operator || 'OR');
      setEditSelectedLocs([]);
    } else {
      setEditIsAuto(false);
      setEditSelectedRuleLocIds([]);
      setEditSelectedRuleTagIds([]);
      setEditSelectedRuleCategoryNames([]);
      setEditRuleKeyword('');
      setEditRuleOperator('OR');
      setEditSelectedLocs(manualIds);
    }
    setShowEditForm(true);
  };

  const handleSaveEditCollection = async (e) => {
    e.preventDefault();
    if (!editColName.trim()) return;

    let rulesArray = null;
    let manualIdsArray = null;

    if (editIsAuto) {
      if (editSelectedRuleLocIds.length === 0 && editSelectedRuleTagIds.length === 0 && editSelectedRuleCategoryNames.length === 0 && !editRuleKeyword.trim()) return;
      rulesArray = [{ 
        type: 'auto', 
        operator: editRuleOperator, 
        location_ids: editSelectedRuleLocIds, 
        tag_ids: editSelectedRuleTagIds, 
        categories: editSelectedRuleCategoryNames,
        keywords: editRuleKeyword.trim()
      }];
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
              
              // Build unified Location -> Places hierarchy
              const locationMap = new Map();

              colItems.locations.forEach(loc => {
                locationMap.set(loc.id, { location: loc, places: [] });
              });

              const unassignedPlaces = [];

              colItems.places.forEach(p => {
                if (p.location_id && locations.some(l => l.id === p.location_id)) {
                  if (!locationMap.has(p.location_id)) {
                    const parentLoc = locations.find(l => l.id === p.location_id);
                    if (parentLoc) {
                      locationMap.set(parentLoc.id, { location: parentLoc, places: [] });
                    }
                  }
                  const entry = locationMap.get(p.location_id);
                  if (entry && !entry.places.some(existing => existing.id === p.id)) {
                    entry.places.push(p);
                  }
                } else {
                  if (!unassignedPlaces.some(existing => existing.id === p.id)) {
                    unassignedPlaces.push(p);
                  }
                }
              });

              const locationEntries = Array.from(locationMap.values());

              if (locationEntries.length === 0 && unassignedPlaces.length === 0) {
                return (
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No locations or places found in this collection.</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {locationEntries.map(({ location: loc, places: locPlaces }) => (
                    <div 
                      key={loc.id} 
                      style={{
                        background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)',
                        padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <img 
                          src={getFeaturedPhoto(loc.id)} 
                          alt={loc.name} 
                          style={{ width: '56px', height: '56px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
                          onClick={() => onNavigateToLocation && onNavigateToLocation(loc.id, selectedCol.id)}
                          onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600'; }}
                        />
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 
                              style={{ color: 'var(--accent-primary-hover)', margin: 0, cursor: 'pointer', fontSize: '1.05rem', fontWeight: 600 }}
                              onClick={() => onNavigateToLocation && onNavigateToLocation(loc.id, selectedCol.id)}
                              title="Click to view Location details"
                            >
                              📁 {loc.name}
                            </h4>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              (Click to view details)
                            </span>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                            {locPlaces.length} {locPlaces.length === 1 ? 'place' : 'places'} of visit
                          </p>
                        </div>
                      </div>

                      {/* Nested Child Places */}
                      {locPlaces.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '16px', borderLeft: '2px solid var(--border-glass)' }}>
                          {locPlaces.map(p => (
                            <div 
                              key={p.id}
                              style={{
                                background: 'var(--bg-app)', border: '1px solid var(--border-glass)',
                                padding: '8px 12px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.85rem', color: p.visited === 1 ? 'var(--success)' : 'var(--text-primary)', fontWeight: 500 }}>
                                  📍 {p.name}
                                </span>
                                {p.visited === 1 && (
                                  <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                    Visited
                                  </span>
                                )}
                              </div>
                              {p.category && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-elevated)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                                  {p.category}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Standalone Places */}
                  {unassignedPlaces.length > 0 && (
                    <div 
                      style={{
                        background: 'var(--bg-surface-elevated)', border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-md)',
                        padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px'
                      }}
                    >
                      <h4 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                        📦 Unassigned / Standalone Places
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                        {unassignedPlaces.map(p => (
                          <div 
                            key={p.id}
                            style={{
                              background: 'var(--bg-app)', border: '1px solid var(--border-glass)',
                              padding: '8px 12px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <span style={{ fontSize: '0.85rem', color: p.visited === 1 ? 'var(--success)' : 'var(--text-primary)' }}>
                              📍 {p.name}
                            </span>
                            {p.category && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-elevated)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                                {p.category}
                              </span>
                            )}
                          </div>
                        ))}
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
            padding: '16px'
          }}>
            <div className="login-card" style={{
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflow: 'hidden'
            }}>
              {/* Sticky Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                <h3 style={{ margin: 0 }}>Edit Collection</h3>
                <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowEditForm(false)} />
              </div>

              {/* Form with Scrollable Body & Sticky Footer */}
              <form onSubmit={handleSaveEditCollection} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
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
                  <div className="form-group" style={{ marginBottom: 0 }}>
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
                    <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', marginBottom: 0 }}>
                      <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>Auto-Classification Rules</label>

                      {/* Quick Search Filter across all checkbox options */}
                      <input
                        type="text"
                        className="form-control"
                        placeholder="🔍 Quick filter options (locations, categories, tags)..."
                        value={editAutoFilterSearch}
                        onChange={(e) => setEditAutoFilterSearch(e.target.value)}
                        style={{ marginBottom: '12px', fontSize: '0.8rem', height: '32px' }}
                      />

                      {/* Match Operator */}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', background: 'var(--bg-app)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Match Rule Logic:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input type="radio" checked={editRuleOperator === 'OR'} onChange={() => setEditRuleOperator('OR')} /> Match ANY (OR)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input type="radio" checked={editRuleOperator === 'AND'} onChange={() => setEditRuleOperator('AND')} /> Match ALL (AND)
                        </label>
                      </div>

                      {/* 4 Criteria Blocks Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {/* 1. Filter by Locations */}
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>📁 Filter by Locations</label>
                          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                            {locations.filter(loc => !editAutoFilterSearch.trim() || loc.name.toLowerCase().includes(editAutoFilterSearch.toLowerCase())).map(loc => (
                              <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                <input
                                  type="checkbox"
                                  checked={editSelectedRuleLocIds.includes(loc.id)}
                                  onChange={() => {
                                    if (editSelectedRuleLocIds.includes(loc.id)) {
                                      setEditSelectedRuleLocIds(editSelectedRuleLocIds.filter(id => id !== loc.id));
                                    } else {
                                      setEditSelectedRuleLocIds([...editSelectedRuleLocIds, loc.id]);
                                    }
                                  }}
                                />
                                {loc.name}
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 2. Filter by Categories */}
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>🏷️ Filter by Categories</label>
                          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                            {Array.from(new Set([
                              'Food', 'Hotel', 'Lodging', 'Dinner', 'Lunch', 'Snacks', 'Transportation', 'Fuel', 'Entertainment', 'Other',
                              ...customCategories.map(c => c.name)
                            ])).filter(cat => !editAutoFilterSearch.trim() || cat.toLowerCase().includes(editAutoFilterSearch.toLowerCase())).map(cat => (
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

                        {/* 3. Filter by Tags */}
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>🔖 Filter by Tags</label>
                          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                            {tags.filter(t => !editAutoFilterSearch.trim() || t.name.toLowerCase().includes(editAutoFilterSearch.toLowerCase())).map(t => (
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

                        {/* 4. Keyword Write-up */}
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>✏️ Filter by Keyword</label>
                          <div style={{ background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)', height: '120px' }}>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. beach, cafe..."
                              value={editRuleKeyword}
                              onChange={(e) => setEditRuleKeyword(e.target.value)}
                              style={{ fontSize: '0.8rem', marginBottom: '6px', height: '30px' }}
                            />
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.2 }}>
                              Search words in name/notes. Separate multiple with commas.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', marginBottom: 0 }}>
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Manual Selection</label>
                      <NestedManualSelector 
                        locations={locations}
                        places={places}
                        selectedItems={editSelectedLocs}
                        onToggleItem={toggleEditLocationSelection}
                      />
                    </div>
                  )}
                </div>

                {/* Sticky Footer Action Bar */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-glass)', flexShrink: 0 }}>
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
        <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setLocSearchQuery(''); setPlaceSearchQuery(''); }} style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Folder size={16} />
          <span className="desktop-only-text">Create Collection</span>
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
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setLocSearchQuery(''); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
            <Folder size={16} />
            <span>Create Collection</span>
          </button>
        </div>
      )}

      {/* Add Collection Dialog overlay */}
      {showAddForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '16px'
        }}>
          <div className="login-card" style={{
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            overflow: 'hidden'
          }}>
            {/* Sticky Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}>Create New Collection</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowAddForm(false)} />
            </div>

            {/* Form with Scrollable Body & Sticky Footer */}
            <form onSubmit={handleCreateCollection} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
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
                <div className="form-group" style={{ marginBottom: 0 }}>
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
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', marginBottom: 0 }}>
                    <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>Auto-Classification Rules</label>

                    {/* Quick Search Filter across all checkbox options */}
                    <input
                      type="text"
                      className="form-control"
                      placeholder="🔍 Quick filter options (locations, categories, tags)..."
                      value={autoFilterSearch}
                      onChange={(e) => setAutoFilterSearch(e.target.value)}
                      style={{ marginBottom: '12px', fontSize: '0.8rem', height: '32px' }}
                    />

                    {/* Match Operator */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', background: 'var(--bg-app)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Match Rule Logic:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="radio" checked={ruleOperator === 'OR'} onChange={() => setRuleOperator('OR')} /> Match ANY (OR)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="radio" checked={ruleOperator === 'AND'} onChange={() => setRuleOperator('AND')} /> Match ALL (AND)
                      </label>
                    </div>

                    {/* 4 Criteria Blocks Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                      {/* 1. Filter by Locations */}
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>📁 Filter by Locations</label>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                          {locations.filter(loc => !autoFilterSearch.trim() || loc.name.toLowerCase().includes(autoFilterSearch.toLowerCase())).map(loc => (
                            <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={selectedRuleLocIds.includes(loc.id)}
                                onChange={() => {
                                  if (selectedRuleLocIds.includes(loc.id)) {
                                    setSelectedRuleLocIds(selectedRuleLocIds.filter(id => id !== loc.id));
                                  } else {
                                    setSelectedRuleLocIds([...selectedRuleLocIds, loc.id]);
                                  }
                                }}
                              />
                              {loc.name}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* 2. Filter by Categories */}
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>🏷️ Filter by Categories</label>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                          {Array.from(new Set([
                            'Food', 'Hotel', 'Lodging', 'Dinner', 'Lunch', 'Snacks', 'Transportation', 'Fuel', 'Entertainment', 'Other',
                            ...customCategories.map(c => c.name)
                          ])).filter(cat => !autoFilterSearch.trim() || cat.toLowerCase().includes(autoFilterSearch.toLowerCase())).map(cat => (
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

                      {/* 3. Filter by Tags */}
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>🔖 Filter by Tags</label>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                          {tags.filter(t => !autoFilterSearch.trim() || t.name.toLowerCase().includes(autoFilterSearch.toLowerCase())).map(t => (
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

                      {/* 4. Keyword Write-up */}
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>✏️ Filter by Keyword</label>
                        <div style={{ background: 'var(--bg-app)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-glass)', height: '120px' }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. beach, cafe..."
                            value={ruleKeyword}
                            onChange={(e) => setRuleKeyword(e.target.value)}
                            style={{ fontSize: '0.8rem', marginBottom: '6px', height: '30px' }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.2 }}>
                            Search words in name/notes. Separate multiple with commas.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', marginBottom: 0 }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Manual Selection</label>
                    <NestedManualSelector 
                      locations={locations}
                      places={places}
                      selectedItems={selectedLocs}
                      onToggleItem={toggleLocationSelection}
                    />
                  </div>
                )}
              </div>

              {/* Sticky Footer Action Bar */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-glass)', flexShrink: 0 }}>
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
