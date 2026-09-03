import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { Plus, X, Folder, Eye, Compass, Trash2, Edit, Search, ChevronRight, ChevronDown, Sparkles, Layers, Sliders, Check, CheckSquare } from 'lucide-react';
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
    const allDescendantLocIds = getDescendantLocationIds(loc.id, locations);
    const matchChildPlace = places.some(p => allDescendantLocIds.includes(p.location_id) && p.name.toLowerCase().includes(search.toLowerCase()));
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
            const allDescendantLocIds = getDescendantLocationIds(loc.id, locations);
            const childPlaces = places.filter(p => allDescendantLocIds.includes(p.location_id) && (!search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || loc.name.toLowerCase().includes(search.toLowerCase())));
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
                      {loc.is_folder === 1 ? `📁 ${loc.name} (Folder)` : `📍 ${loc.name}`}
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

// Helper: Recursively get all descendant location IDs for a given folder or location ID
export const getDescendantLocationIds = (targetId, locations) => {
  let ids = [targetId];
  const directChildren = locations.filter(l => l.parent_id && String(l.parent_id) === String(targetId));
  for (const child of directChildren) {
    ids.push(child.id);
    if (child.is_folder === 1) {
      ids = ids.concat(getDescendantLocationIds(child.id, locations));
    }
  }
  return Array.from(new Set(ids));
};

// Helper: Evaluates a single sentence rule against an entity (location or place)
export const evaluateSentenceRule = (entity, isPlace, ruleItem, locations, places, tags, entityTags) => {
  if (!ruleItem || !ruleItem.values || ruleItem.values.length === 0) return true;
  const isNot = ruleItem.condition === 'is not';
  const matchType = ruleItem.match_type || 'OR';
  const field = (ruleItem.field || '').toLowerCase();

  let isMatch = false;

  if (field === 'location') {
    // Collect all target location IDs including subfolders and children recursively
    const expandedTargetIds = new Set();
    ruleItem.values.forEach(v => {
      // Check by ID
      const locById = locations.find(l => l.id === v);
      if (locById) {
        getDescendantLocationIds(locById.id, locations).forEach(id => expandedTargetIds.add(id));
      }
      // Check by Name
      const locByName = locations.find(l => l.name.toLowerCase() === v.toLowerCase());
      if (locByName) {
        getDescendantLocationIds(locByName.id, locations).forEach(id => expandedTargetIds.add(id));
      }
      expandedTargetIds.add(v);
    });

    if (isPlace) {
      isMatch = entity.location_id ? expandedTargetIds.has(entity.location_id) : false;
    } else {
      isMatch = expandedTargetIds.has(entity.id);
    }
  } else if (field === 'category') {
    if (isPlace) {
      isMatch = ruleItem.values.some(v => (entity.category || '').toLowerCase() === v.toLowerCase());
    } else {
      // Folders do not have categories. Leaf locations match only if they directly contain places with this category.
      if (entity.is_folder === 1) {
        isMatch = false;
      } else {
        isMatch = places.some(p => p.location_id === entity.id && ruleItem.values.some(v => (p.category || '').toLowerCase() === v.toLowerCase()));
      }
    }
  } else if (field === 'tag') {
    const itemTagIds = entityTags.filter(et => et.entity_id === entity.id).map(et => et.tag_id);
    const itemTagNames = tags.filter(t => itemTagIds.includes(t.id)).map(t => t.name.toLowerCase());
    
    if (matchType === 'AND') {
      isMatch = ruleItem.values.every(v => itemTagIds.includes(v) || itemTagNames.includes(v.toLowerCase()));
    } else {
      isMatch = ruleItem.values.some(v => itemTagIds.includes(v) || itemTagNames.includes(v.toLowerCase()));
    }
  } else if (field === 'keyword') {
    const kwList = ruleItem.values.map(v => v.trim().toLowerCase()).filter(Boolean);
    if (kwList.length === 0) return true;

    if (isPlace) {
      const text = ((entity.name || '') + ' ' + (entity.notes || '') + ' ' + (entity.category || '')).toLowerCase();
      isMatch = matchType === 'AND' ? kwList.every(kw => text.includes(kw)) : kwList.some(kw => text.includes(kw));
    } else {
      const directPlaces = places.filter(p => p.location_id === entity.id);
      const directPlacesText = directPlaces.map(p => (p.name || '') + ' ' + (p.notes || '') + ' ' + (p.category || '')).join(' ');
      const text = ((entity.name || '') + ' ' + (entity.notes || '') + ' ' + directPlacesText).toLowerCase();
      isMatch = matchType === 'AND' ? kwList.every(kw => text.includes(kw)) : kwList.some(kw => text.includes(kw));
    }
  } else {
    isMatch = true;
  }

  return isNot ? !isMatch : isMatch;
};

// Helper: Evaluates auto-group rules across locations and places
export const evaluateAutoGroupRules = (rules, locations, places, tags, entityTags) => {
  if (!rules || rules.length === 0) return { locations: [], places: [] };
  const rule = rules[0];
  const op = rule.operator || 'OR';

  // 1. Sentence-based Advanced Groups
  if (op === 'ADVANCED') {
    const groups = rule.groups || [];
    const outerJoin = rule.outer_join || rule.group_combine_op || 'OR';

    if (groups.length === 0) return { locations: [], places: [] };

    const evalEntityInGroup = (entity, isPlace, group) => {
      // Check if group has sentence rules
      if (group.rules && group.rules.length > 0) {
        const innerJoin = group.inner_join || group.operator || 'AND';
        if (innerJoin === 'AND') {
          return group.rules.every(r => evaluateSentenceRule(entity, isPlace, r, locations, places, tags, entityTags));
        } else {
          return group.rules.some(r => evaluateSentenceRule(entity, isPlace, r, locations, places, tags, entityTags));
        }
      }

      // Legacy group evaluation fallback
      const targetLocIds = group.location_ids || [];
      const expandedTargetLocIds = [];
      targetLocIds.forEach(id => {
        getDescendantLocationIds(id, locations).forEach(dId => expandedTargetLocIds.push(dId));
      });
      const targetTagIds = group.tag_ids || [];
      const targetCategories = group.categories || [];
      const keyword = (group.keywords || '').trim().toLowerCase();
      const kwList = keyword ? keyword.split(',').map(k => k.trim()).filter(Boolean) : [];
      const groupOp = group.operator || 'AND';

      const hasAny = targetLocIds.length > 0 || targetTagIds.length > 0 || targetCategories.length > 0 || kwList.length > 0;
      if (!hasAny) return false;

      const locMatches = expandedTargetLocIds.length > 0 ? (isPlace ? expandedTargetLocIds.includes(entity.location_id) : expandedTargetLocIds.includes(entity.id)) : null;
      let tagMatches = null;
      if (targetTagIds.length > 0) {
        const itemTagIds = entityTags.filter(et => et.entity_id === entity.id).map(et => et.tag_id);
        tagMatches = groupOp === 'AND' ? targetTagIds.every(tid => itemTagIds.includes(tid)) : targetTagIds.some(tid => itemTagIds.includes(tid));
      }
      let catMatches = null;
      if (targetCategories.length > 0) {
        catMatches = isPlace ? targetCategories.includes(entity.category) : false;
      }
      let kwMatches = null;
      if (kwList.length > 0) {
        const text = ((entity.name || '') + ' ' + (entity.notes || '') + ' ' + (isPlace ? entity.category || '' : '')).toLowerCase();
        kwMatches = groupOp === 'AND' ? kwList.every(kw => text.includes(kw)) : kwList.some(kw => text.includes(kw));
      }

      const active = [locMatches, tagMatches, catMatches, kwMatches].filter(v => v !== null);
      if (active.length === 0) return false;
      return groupOp === 'AND' ? active.every(Boolean) : active.some(Boolean);
    };

    const matchedLocs = locations.filter(loc => {
      return outerJoin === 'AND'
        ? groups.every(g => evalEntityInGroup(loc, false, g))
        : groups.some(g => evalEntityInGroup(loc, false, g));
    });

    const matchedPlaces = places.filter(p => {
      return outerJoin === 'AND'
        ? groups.every(g => evalEntityInGroup(p, true, g))
        : groups.some(g => evalEntityInGroup(p, true, g));
    });

    return { locations: matchedLocs, places: matchedPlaces };
  }

  // 2. Sentence-based Flat Clauses (OR / AND)
  if (rule.clauses && rule.clauses.length > 0) {
    const isAnd = op === 'AND';
    const matchedLocs = locations.filter(loc => {
      return isAnd
        ? rule.clauses.every(c => evaluateSentenceRule(loc, false, c, locations, places, tags, entityTags))
        : rule.clauses.some(c => evaluateSentenceRule(loc, false, c, locations, places, tags, entityTags));
    });

    const matchedPlaces = places.filter(p => {
      return isAnd
        ? rule.clauses.every(c => evaluateSentenceRule(p, true, c, locations, places, tags, entityTags))
        : rule.clauses.some(c => evaluateSentenceRule(p, true, c, locations, places, tags, entityTags));
    });

    return { locations: matchedLocs, places: matchedPlaces };
  }

  // 3. Legacy Flat OR / AND evaluation fallback
  const targetLocIds = rule.location_ids || [];
  const expandedTargetLocIds = [];
  targetLocIds.forEach(id => {
    getDescendantLocationIds(id, locations).forEach(dId => expandedTargetLocIds.push(dId));
  });
  const targetTagIds = rule.tag_ids || [];
  const targetCategories = rule.categories || [];
  const keyword = (rule.keywords || '').trim().toLowerCase();
  const kwList = keyword ? keyword.split(',').map(k => k.trim()).filter(Boolean) : [];

  if (op === 'OR') {
    const matchedLocs = locations.filter(loc => {
      const matchesLoc = expandedTargetLocIds.length > 0 && expandedTargetLocIds.includes(loc.id);
      const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
      const matchesTag = targetTagIds.length > 0 && targetTagIds.some(tid => locTagIds.includes(tid));
      const matchesKw = kwList.length > 0 && kwList.some(kw => (loc.name || '').toLowerCase().includes(kw) || (loc.notes || '').toLowerCase().includes(kw));
      return matchesLoc || matchesTag || matchesKw;
    });

    const matchedPlaces = places.filter(p => {
      const matchesLoc = expandedTargetLocIds.length > 0 && expandedTargetLocIds.includes(p.location_id);
      const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
      const matchesTag = targetTagIds.length > 0 && targetTagIds.some(tid => placeTagIds.includes(tid));
      const matchesCategory = targetCategories.length > 0 && targetCategories.includes(p.category);
      const matchesKw = kwList.length > 0 && kwList.some(kw => (p.name || '').toLowerCase().includes(kw) || (p.notes || '').toLowerCase().includes(kw) || (p.category || '').toLowerCase().includes(kw));
      return matchesLoc || matchesTag || matchesCategory || matchesKw;
    });

    return { locations: matchedLocs, places: matchedPlaces };
  }

  if (op === 'AND') {
    const matchedLocs = locations.filter(loc => {
      if (expandedTargetLocIds.length > 0 && !expandedTargetLocIds.includes(loc.id)) return false;
      if (targetTagIds.length > 0) {
        const locTagIds = entityTags.filter(et => et.entity_id === loc.id).map(et => et.tag_id);
        if (!targetTagIds.every(tid => locTagIds.includes(tid))) return false;
      }
      if (kwList.length > 0) {
        const matchesKw = kwList.every(kw => (loc.name || '').toLowerCase().includes(kw) || (loc.notes || '').toLowerCase().includes(kw));
        if (!matchesKw) return false;
      }
      if (targetCategories.length > 0) return false;
      return expandedTargetLocIds.length > 0 || targetTagIds.length > 0 || kwList.length > 0;
    });

    const matchedPlaces = places.filter(p => {
      if (expandedTargetLocIds.length > 0 && !expandedTargetLocIds.includes(p.location_id)) return false;
      if (targetCategories.length > 0 && !targetCategories.includes(p.category)) return false;
      if (targetTagIds.length > 0) {
        const placeTagIds = entityTags.filter(et => et.entity_id === p.id).map(et => et.tag_id);
        if (!targetTagIds.every(tid => placeTagIds.includes(tid))) return false;
      }
      if (kwList.length > 0) {
        const matchesKw = kwList.every(kw => (p.name || '').toLowerCase().includes(kw) || (p.notes || '').toLowerCase().includes(kw) || (p.category || '').toLowerCase().includes(kw));
        if (!matchesKw) return false;
      }
      return expandedTargetLocIds.length > 0 || targetCategories.length > 0 || targetTagIds.length > 0 || kwList.length > 0;
    });

    return { locations: matchedLocs, places: matchedPlaces };
  }

  return { locations: [], places: [] };
};

// Subcomponent: Inline Single-Line Rule Creator Bar with Wrap-Around Chip Tags
const SentenceRuleCreatorBar = ({
  locations,
  places,
  tags,
  customCategories,
  onAddRule,
  buttonLabel = '+ Add Rule'
}) => {
  const [field, setField] = useState('Location');
  const [condition, setCondition] = useState('is');
  const [selectedValues, setSelectedValues] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [isOpenPicker, setIsOpenPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!isOpenPicker) return;

    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpenPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpenPicker]);

  const allCategoryNames = useMemo(() => {
    return Array.from(new Set([
      'Restaurant', 'Cafe', 'Food', 'Hotel', 'Resort', 'Lodging', 'Dinner', 'Lunch', 'Snacks', 'Transportation', 'Fuel', 'Entertainment', 'Beach', 'Museum', 'Bar', 'Other',
      ...customCategories.map(c => c.name)
    ]));
  }, [customCategories]);

  const availableOptions = useMemo(() => {
    if (field === 'Location') {
      return locations.map(l => ({
        id: l.id,
        label: l.is_folder === 1 ? `📁 ${l.name} (Folder)` : `📍 ${l.name}`,
        is_folder: l.is_folder === 1,
        name: l.name
      }));
    }
    if (field === 'Category') return allCategoryNames.map(c => ({ id: c, label: c }));
    if (field === 'Tag') return tags.map(t => ({ id: t.id, label: t.name }));
    return [];
  }, [field, locations, allCategoryNames, tags]);

  const filteredOptions = useMemo(() => {
    if (!pickerSearch.trim()) return availableOptions;
    return availableOptions.filter(o => o.label.toLowerCase().includes(pickerSearch.toLowerCase()));
  }, [availableOptions, pickerSearch]);

  const handleFieldChange = (newField) => {
    setField(newField);
    setSelectedValues([]);
    setKeywordInput('');
    setPickerSearch('');
  };

  const toggleValue = (val) => {
    if (selectedValues.includes(val)) {
      setSelectedValues(selectedValues.filter(v => v !== val));
    } else {
      setSelectedValues([...selectedValues, val]);
    }
  };

  const handleAdd = () => {
    let finalValues = [];
    if (field === 'Keyword') {
      finalValues = keywordInput.split(',').map(s => s.trim()).filter(Boolean);
      if (finalValues.length === 0) return;
    } else {
      if (selectedValues.length === 0) return;
      finalValues = selectedValues;
    }

    onAddRule({
      id: generateUUID(),
      field,
      condition,
      values: finalValues,
      match_type: 'OR'
    });

    // Reset picker
    setSelectedValues([]);
    setKeywordInput('');
    setIsOpenPicker(false);
    setPickerSearch('');
  };

  return (
    <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          + Add New Sentence Rule
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Select field, condition, and multiple options
        </span>
      </div>

      <div className="rule-creator-grid">
        {/* Tier 1 on mobile (Field + Condition) */}
        <div className="rule-creator-field-tier">
          {/* Field Selector */}
          <select
            value={field}
            onChange={(e) => handleFieldChange(e.target.value)}
            style={{ fontSize: '0.8rem', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '8px 10px', height: '38px', fontWeight: 600, cursor: 'pointer', width: '100%' }}
          >
            <option value="Location">📁 Location</option>
            <option value="Category">🏷️ Category</option>
            <option value="Tag">🔖 Tag</option>
            <option value="Keyword">✏️ Keyword</option>
          </select>

          {/* Condition Selector */}
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={{ fontSize: '0.8rem', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '8px 10px', height: '38px', cursor: 'pointer', width: '100%' }}
          >
            <option value="is">is (IN)</option>
            <option value="is not">is not (NOT)</option>
          </select>
        </div>

        {/* Tier 2 on mobile (Value Selector + Add Button) */}
        <div className="rule-creator-actions-tier">
          {/* Value Selector (Wrap-around chip display with popover checklist) */}
          <div style={{ position: 'relative', width: '100%' }} ref={pickerRef}>
            {field === 'Keyword' ? (
              <input
                type="text"
                placeholder="e.g. beach, sunset, cafe (comma-separated)..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                style={{ fontSize: '0.8rem', height: '38px', width: '100%', padding: '8px 12px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-primary)' }}
              />
            ) : (
              <div>
                {/* Selected Chips & Trigger Tray */}
                <div
                  onClick={() => setIsOpenPicker(!isOpenPicker)}
                  style={{
                    minHeight: '38px', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: '6px',
                    cursor: 'pointer', flexWrap: 'wrap', gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', flexGrow: 1 }}>
                    {selectedValues.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                        Click to choose {field.toLowerCase()}s...
                      </span>
                    ) : (
                      selectedValues.map(v => {
                        const opt = availableOptions.find(o => o.id === v);
                        const label = opt ? opt.label : v;
                        return (
                          <span
                            key={v}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              background: 'rgba(6, 182, 212, 0.18)', border: '1px solid rgba(6, 182, 212, 0.35)',
                              color: 'var(--accent-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600
                            }}
                            onClick={(e) => { e.stopPropagation(); toggleValue(v); }}
                          >
                            &lt;{label}&gt;
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', marginLeft: '2px', cursor: 'pointer' }}>&times;</span>
                          </span>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, paddingLeft: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                      {selectedValues.length} selected
                    </span>
                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </div>

                {/* Floating Multi-Select Popover Checklist */}
                {isOpenPicker && (
                  <div style={{
                    position: 'absolute', top: '44px', left: 0, right: 0, zIndex: 200,
                    background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '8px',
                    padding: '10px', boxShadow: '0 12px 30px rgba(0,0,0,0.65)', maxHeight: '240px', display: 'flex', flexDirection: 'column', gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Select {field}s
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsOpenPicker(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
                      >
                        &times;
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder={`🔍 Search ${field.toLowerCase()}s...`}
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      autoFocus
                      style={{ fontSize: '0.78rem', height: '32px', padding: '6px 10px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: 'var(--text-primary)' }}
                    />

                    <div style={{ overflowY: 'auto', maxHeight: '140px', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '2px' }}>
                      {filteredOptions.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No options found</span>
                      ) : (
                        filteredOptions.map(opt => {
                          const isChecked = selectedValues.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', cursor: 'pointer',
                                padding: '6px 8px', borderRadius: '4px',
                                background: isChecked ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                                border: isChecked ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid transparent',
                                color: isChecked ? 'var(--accent-secondary)' : 'var(--text-primary)'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleValue(opt.id)}
                              />
                              <span style={{ fontWeight: isChecked ? 600 : 400 }}>{opt.label}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-glass)', paddingTop: '6px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {selectedValues.length} item(s) chosen
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsOpenPicker(false)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '4px 12px', height: '28px', fontWeight: 600 }}
                      >
                        Done Selecting
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Button */}
          <button
            type="button"
            onClick={handleAdd}
            className="btn btn-primary rule-creator-add-btn"
            style={{ height: '38px', fontSize: '0.8rem', padding: '0 16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      {/* Multiple selections OR helper text */}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>ℹ️ Note: Multiple selections within a single rule (e.g. &lt;Chennai, Surat&gt;) are always matched with <b>OR</b>.</span>
      </div>
    </div>
  );
};

// Subcomponent: Auto-Group Rule Configuration UI (Option A: Tag-Chip Composer with Multi-Group Builder)
const AutoGroupRuleEditor = ({
  operator,
  setOperator,
  clauses,
  setClauses,
  groups,
  setGroups,
  outerJoin,
  setOuterJoin,
  locations,
  places,
  tags,
  customCategories,
  entityTags
}) => {
  // Construct live rule for real-time count
  const liveRule = useMemo(() => {
    return {
      type: 'auto',
      operator,
      outer_join: outerJoin,
      groups: groups,
      clauses: clauses
    };
  }, [operator, outerJoin, groups, clauses]);

  const liveCounts = useMemo(() => {
    const res = evaluateAutoGroupRules([liveRule], locations, places, tags, entityTags);
    return {
      locationsCount: res.locations.length,
      placesCount: res.places.length
    };
  }, [liveRule, locations, places, tags, entityTags]);

  const addFlatClause = (newRule) => {
    setClauses([...clauses, newRule]);
  };

  const removeFlatClause = (id) => {
    setClauses(clauses.filter(c => c.id !== id));
  };

  const removeValueFromFlatClause = (clauseId, valToRemove) => {
    setClauses(clauses.map(c => {
      if (c.id === clauseId) {
        const remaining = c.values.filter(v => v !== valToRemove);
        return remaining.length > 0 ? { ...c, values: remaining } : null;
      }
      return c;
    }).filter(Boolean));
  };

  const addGroup = () => {
    setGroups([
      ...groups,
      {
        id: generateUUID(),
        name: `Group ${groups.length + 1}`,
        inner_join: 'AND',
        rules: []
      }
    ]);
  };

  const removeGroup = (groupId) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter(g => g.id !== groupId));
  };

  const updateGroupInnerJoin = (groupId, joinVal) => {
    setGroups(groups.map(g => g.id === groupId ? { ...g, inner_join: joinVal } : g));
  };

  const addRuleToGroup = (groupId, newRule) => {
    setGroups(groups.map(g => {
      if (g.id === groupId) {
        return { ...g, rules: [...(g.rules || []), newRule] };
      }
      return g;
    }));
  };

  const removeRuleFromGroup = (groupId, ruleId) => {
    setGroups(groups.map(g => {
      if (g.id === groupId) {
        return { ...g, rules: (g.rules || []).filter(r => r.id !== ruleId) };
      }
      return g;
    }));
  };

  const removeValueFromGroupRule = (groupId, ruleId, valToRemove) => {
    setGroups(groups.map(g => {
      if (g.id === groupId) {
        const updatedRules = (g.rules || []).map(r => {
          if (r.id === ruleId) {
            const remaining = r.values.filter(v => v !== valToRemove);
            return remaining.length > 0 ? { ...r, values: remaining } : null;
          }
          return r;
        }).filter(Boolean);
        return { ...g, rules: updatedRules };
      }
      return g;
    }));
  };

  const resolveValueLabel = (field, val) => {
    if (field === 'Location') {
      const loc = locations.find(l => l.id === val || l.name.toLowerCase() === val.toLowerCase());
      if (!loc) return val;
      return loc.is_folder === 1 ? `📁 ${loc.name}` : `📍 ${loc.name}`;
    }
    if (field === 'Tag') {
      const t = tags.find(tg => tg.id === val);
      return t ? t.name : val;
    }
    return val;
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', marginBottom: 0 }}>
      {/* 3-Tier Match Operator Segmented Bar with Clear Solid Boundaries */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>
            Rule Logic Mode
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: operator === 'ADVANCED' ? '#c084fc' : 'var(--accent-secondary)' }}>
            {operator === 'ADVANCED' ? '⚡ Advanced Compound Groups' : operator === 'AND' ? '● Match ALL Mode (AND)' : '● Match ANY Mode (OR)'}
          </span>
        </div>

        <div className="rule-operator-segmented-bar" style={{ background: 'var(--bg-app)', padding: '4px', borderRadius: '10px', border: '2px solid var(--border-glass)' }}>
          <button
            type="button"
            onClick={() => setOperator('OR')}
            style={{
              padding: '8px 12px', fontSize: '0.82rem', borderRadius: '6px', cursor: 'pointer',
              background: operator === 'OR' ? 'var(--accent-primary)' : 'transparent',
              color: operator === 'OR' ? '#000' : 'var(--text-secondary)',
              border: operator === 'OR' ? '1px solid var(--accent-primary)' : '1px solid transparent',
              fontWeight: 700, transition: 'all 0.15s'
            }}
          >
            Match ANY (Flat OR)
          </button>
          <button
            type="button"
            onClick={() => setOperator('AND')}
            style={{
              padding: '8px 12px', fontSize: '0.82rem', borderRadius: '6px', cursor: 'pointer',
              background: operator === 'AND' ? 'var(--accent-primary)' : 'transparent',
              color: operator === 'AND' ? '#000' : 'var(--text-secondary)',
              border: operator === 'AND' ? '1px solid var(--accent-primary)' : '1px solid transparent',
              fontWeight: 700, transition: 'all 0.15s'
            }}
          >
            Match ALL (Flat AND)
          </button>
          <button
            type="button"
            onClick={() => setOperator('ADVANCED')}
            style={{
              padding: '8px 12px', fontSize: '0.82rem', borderRadius: '6px', cursor: 'pointer',
              background: operator === 'ADVANCED' ? 'rgba(168, 85, 247, 0.9)' : 'transparent',
              color: operator === 'ADVANCED' ? '#fff' : 'var(--text-secondary)',
              border: operator === 'ADVANCED' ? '1px solid #c084fc' : '1px solid transparent',
              fontWeight: 700, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <Sparkles size={14} /> ⚡ Advanced Groups
          </button>
        </div>

        {/* Informational Subtext */}
        <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 4px' }}>
          {operator === 'OR' && '• Item matches if ANY sentence rule is satisfied. Multiple values in a rule match with OR.'}
          {operator === 'AND' && '• Item must satisfy ALL sentence rules simultaneously. Multiple values in a rule match with OR.'}
          {operator === 'ADVANCED' && '• Group multiple rules together with compound group logic (e.g. Group 1 OR Group 2).'}
        </div>
      </div>

      {/* FLAT CLAUSES VIEW (OR / AND) */}
      {operator !== 'ADVANCED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Active Clauses List with Wrap-Around Chip Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {clauses.length === 0 ? (
              <div style={{ padding: '20px', border: '2px dashed var(--border-glass)', borderRadius: '8px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                No filter rules added yet. Use the composer below to add your first sentence rule.
              </div>
            ) : (
              clauses.map((c, idx) => {
                const isLast = idx === clauses.length - 1;
                const icon = c.field === 'Location' ? '📁' : c.field === 'Category' ? '🏷️' : c.field === 'Tag' ? '🔖' : '✏️';
                return (
                  <React.Fragment key={c.id || idx}>
                    <div className="rule-row-card" style={{
                      padding: '10px 14px',
                      background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '8px', fontSize: '0.82rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexGrow: 1 }}>
                        <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>
                          [Rule {idx + 1}]
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {icon} &lt;{c.field}&gt;
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>{c.condition || 'is'}</span>
                        
                        {/* Wrap-around chip tags with individual remove */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          {c.values.map((v, vIdx) => (
                            <span
                              key={vIdx}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '3px 8px', borderRadius: '4px',
                                background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.35)',
                                color: 'var(--accent-secondary)', fontWeight: 600, fontSize: '0.78rem'
                              }}
                            >
                              &lt;{resolveValueLabel(c.field, v)}&gt;
                              <button
                                type="button"
                                onClick={() => removeValueFromFlatClause(c.id, v)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', padding: 0, marginLeft: '2px' }}
                                title="Remove this value"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>

                        {c.values.length > 1 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>(OR)</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFlatClause(c.id)}
                        className="rule-row-delete-btn"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 6px', fontWeight: 'bold' }}
                        title="Remove entire rule"
                      >
                        &times;
                      </button>
                    </div>

                    {!isLast && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 14px', borderRadius: '12px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', color: operator === 'AND' ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                          ({operator})
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Single-line Adder */}
          <SentenceRuleCreatorBar
            locations={locations}
            places={places}
            tags={tags}
            customCategories={customCategories}
            onAddRule={addFlatClause}
            buttonLabel="+ Add Rule"
          />
        </div>
      )}

      {/* ADVANCED MULTI-GROUP VIEW */}
      {operator === 'ADVANCED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Outer Join Setting Pill Bar */}
          <div className="rule-group-outer-join-bar" style={{ padding: '10px 14px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: '#c084fc', fontWeight: 700 }}>Combine Groups with:</span>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="outer_join"
                  checked={outerJoin === 'OR'}
                  onChange={() => setOuterJoin('OR')}
                />
                <span style={{ fontWeight: 700, color: outerJoin === 'OR' ? 'var(--warning)' : 'var(--text-secondary)' }}>OR (Match Any Group)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="outer_join"
                  checked={outerJoin === 'AND'}
                  onChange={() => setOuterJoin('AND')}
                />
                <span style={{ fontWeight: 700, color: outerJoin === 'AND' ? 'var(--accent-secondary)' : 'var(--text-secondary)' }}>AND (Match All Groups)</span>
              </label>
            </div>
          </div>

          {/* Groups List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {groups.map((group, gIdx) => {
              const isLastGroup = gIdx === groups.length - 1;
              const groupRules = group.rules || [];

              return (
                <React.Fragment key={group.id || gIdx}>
                  <div style={{ background: 'var(--bg-app)', border: '2px solid rgba(168, 85, 247, 0.25)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.25)' }}>
                    {/* Group Header */}
                    <div className="rule-group-header" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', background: 'rgba(168, 85, 247, 0.18)', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '3px 10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                          [GROUP {gIdx + 1}]
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <span>Match:</span>
                          <select
                            value={group.inner_join || 'AND'}
                            onChange={(e) => updateGroupInnerJoin(group.id, e.target.value)}
                            style={{ fontSize: '0.78rem', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '3px 8px', fontWeight: 700 }}
                          >
                            <option value="AND">ALL rules in group (AND)</option>
                            <option value="OR">ANY rule in group (OR)</option>
                          </select>
                        </div>
                      </div>

                      {groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGroup(group.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Trash2 size={13} /> Delete Group
                        </button>
                      )}
                    </div>

                    {/* Sentence Rules Inside Group */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groupRules.length === 0 ? (
                        <div style={{ padding: '12px', border: '1px dashed var(--border-glass)', borderRadius: '6px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          No rules in this group yet. Add a sentence rule below.
                        </div>
                      ) : (
                        groupRules.map((r, rIdx) => {
                          const isLastRule = rIdx === groupRules.length - 1;
                          const icon = r.field === 'Location' ? '📁' : r.field === 'Category' ? '🏷️' : r.field === 'Tag' ? '🔖' : '✏️';
                          return (
                            <React.Fragment key={r.id || rIdx}>
                              <div className="rule-row-card" style={{
                                padding: '8px 12px',
                                background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '0.8rem'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexGrow: 1 }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>Rule {rIdx + 1}</span>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{icon} &lt;{r.field}&gt;</span>
                                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>{r.condition || 'is'}</span>
                                  
                                  {/* Wrap-around chip tags with individual remove */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                    {r.values.map((v, vIdx) => (
                                      <span
                                        key={vIdx}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          padding: '2px 7px', borderRadius: '4px',
                                          background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.35)',
                                          color: 'var(--accent-secondary)', fontWeight: 600, fontSize: '0.75rem'
                                        }}
                                      >
                                        &lt;{resolveValueLabel(r.field, v)}&gt;
                                        <button
                                          type="button"
                                          onClick={() => removeValueFromGroupRule(group.id, r.id, v)}
                                          style={{ background: 'none', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', padding: 0, marginLeft: '2px' }}
                                          title="Remove this value"
                                        >
                                          &times;
                                        </button>
                                      </span>
                                    ))}
                                  </div>

                                  {r.values.length > 1 && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>(OR)</span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeRuleFromGroup(group.id, r.id)}
                                  className="rule-row-delete-btn"
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px', fontWeight: 'bold' }}
                                  title="Remove rule"
                                >
                                  &times;
                                </button>
                              </div>

                              {!isLastRule && (
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
                                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                                    ({group.inner_join || 'AND'})
                                  </span>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>

                    {/* Single-line Adder for this Group */}
                    <SentenceRuleCreatorBar
                      locations={locations}
                      places={places}
                      tags={tags}
                      customCategories={customCategories}
                      onAddRule={(newRule) => addRuleToGroup(group.id, newRule)}
                      buttonLabel="+ Add to Group"
                    />
                  </div>

                  {!isLastGroup && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '4px 18px', borderRadius: '20px', background: outerJoin === 'OR' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(6, 182, 212, 0.2)', border: `2px solid ${outerJoin === 'OR' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(6, 182, 212, 0.5)'}`, color: outerJoin === 'OR' ? 'var(--warning)' : 'var(--accent-secondary)', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                        ({outerJoin})
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Add Another Group Button */}
          <button
            type="button"
            onClick={addGroup}
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.82rem', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed rgba(168, 85, 247, 0.4)', borderRadius: '10px', color: '#c084fc', fontWeight: 700 }}
          >
            <Plus size={16} /> + Add Another Condition Group
          </button>
        </div>
      )}

      {/* Live Match Count Preview Bar */}
      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
          Live Filter Result:
        </span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
          {liveCounts.locationsCount} {liveCounts.locationsCount === 1 ? 'Location' : 'Locations'} &bull; {liveCounts.placesCount} {liveCounts.placesCount === 1 ? 'Place' : 'Places of visit'}
        </span>
      </div>
    </div>
  );
};

export default function Collections({ selectedCol, setSelectedCol, onNavigateToLocation }) {
  // Dexie query
  const collections = useLiveQuery(() => db.collections.toArray()) || [];
  const allLocationsRaw = useLiveQuery(() => db.locations.toArray()) || [];
  const locations = allLocationsRaw.filter(l => Number(l.is_archived) !== 1);
  const allPlacesRaw = useLiveQuery(() => db.places.toArray()) || [];
  const places = allPlacesRaw.filter(p => Number(p.is_archived) !== 1);
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

  // Add Form Local State
  const [showAddForm, setShowAddForm] = useState(false);
  const [colName, setColName] = useState('');
  
  // Rule based auto classification (Add Form)
  const [isAuto, setIsAuto] = useState(false);
  const [ruleOperator, setRuleOperator] = useState('OR'); // 'OR' | 'AND' | 'ADVANCED'
  const [clauses, setClauses] = useState([]);
  const [groups, setGroups] = useState([
    { id: generateUUID(), name: 'Group 1', inner_join: 'AND', rules: [] }
  ]);
  const [outerJoin, setOuterJoin] = useState('OR');

  // Manual list (Add Form)
  const [selectedLocs, setSelectedLocs] = useState([]);

  // Edit Collection states
  const [showEditForm, setShowEditForm] = useState(false);
  const [editColName, setEditColName] = useState('');
  const [editIsAuto, setEditIsAuto] = useState(false);
  const [editRuleOperator, setEditRuleOperator] = useState('OR');
  const [editClauses, setEditClauses] = useState([]);
  const [editGroups, setEditGroups] = useState([]);
  const [editOuterJoin, setEditOuterJoin] = useState('OR');

  // Manual list (Edit Form)
  const [editSelectedLocs, setEditSelectedLocs] = useState([]);

  const [colFilter, setColFilter] = useState('ALL'); // 'ALL', 'MANUAL', 'AUTO'
  const [colSearchQuery, setColSearchQuery] = useState('');

  // Bulk Selection & Delete states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedColIds, setSelectedColIds] = useState([]);

  const toggleCollectionSelect = (colId) => {
    setSelectedColIds(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const handleBulkDeleteCollections = async () => {
    if (selectedColIds.length === 0) return;
    const count = selectedColIds.length;
    const confirmMsg = `Are you sure you want to delete ${count} selected collection(s)? (Underlying locations and places will not be deleted)`;
    if (window.confirm(confirmMsg)) {
      for (const id of selectedColIds) {
        await queueSyncAction('collections', 'delete', { id });
      }
      setSelectedColIds([]);
      setIsSelectMode(false);
    }
  };

  // Filter Locations belonging to a collection
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

    if (rules && rules.length > 0) {
      return evaluateAutoGroupRules(rules, locations, places, tags, entityTags);
    } else {
      // Manual list (extract locations and places based on prefixes)
      const locIds = manualIds.filter(id => id.startsWith('loc:') || (!id.startsWith('loc:') && !id.startsWith('place:'))).map(id => id.replace(/^loc:/, ''));
      const placeIds = manualIds.filter(id => id.startsWith('place:')).map(id => id.replace(/^place:/, ''));

      const expandedLocIds = [];
      locIds.forEach(id => {
        getDescendantLocationIds(id, locations).forEach(dId => expandedLocIds.push(dId));
      });

      const matchedLocs = locations.filter(loc => expandedLocIds.includes(loc.id));
      const matchedPlaces = places.filter(p => placeIds.includes(p.id) || (p.location_id && expandedLocIds.includes(p.location_id)));

      return { locations: matchedLocs, places: matchedPlaces };
    }
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
      rulesArray = [{ 
        type: 'auto', 
        operator: ruleOperator, 
        clauses: clauses,
        groups: groups,
        outer_join: outerJoin
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
    setRuleOperator('OR');
    setClauses([]);
    setGroups([{ id: generateUUID(), name: 'Group 1', inner_join: 'AND', rules: [] }]);
    setOuterJoin('OR');
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
      const r = rules[0];
      setEditIsAuto(true);
      setEditRuleOperator(r.operator || 'OR');
      
      // Hydrate clauses or convert legacy criteria
      if (r.clauses && r.clauses.length > 0) {
        setEditClauses(r.clauses);
      } else {
        const generatedClauses = [];
        if (r.location_ids && r.location_ids.length > 0) {
          generatedClauses.push({ id: generateUUID(), field: 'Location', condition: 'is', values: r.location_ids, match_type: 'OR' });
        }
        if (r.categories && r.categories.length > 0) {
          generatedClauses.push({ id: generateUUID(), field: 'Category', condition: 'is', values: r.categories, match_type: 'OR' });
        }
        if (r.tag_ids && r.tag_ids.length > 0) {
          generatedClauses.push({ id: generateUUID(), field: 'Tag', condition: 'is', values: r.tag_ids, match_type: 'OR' });
        }
        if (r.keywords && r.keywords.trim()) {
          generatedClauses.push({ id: generateUUID(), field: 'Keyword', condition: 'is', values: r.keywords.split(',').map(s => s.trim()).filter(Boolean), match_type: 'OR' });
        }
        setEditClauses(generatedClauses);
      }

      // Hydrate groups
      if (r.groups && r.groups.length > 0) {
        setEditGroups(r.groups.map((g, idx) => ({
          id: g.id || generateUUID(),
          name: g.name || `Group ${idx + 1}`,
          inner_join: g.inner_join || g.operator || 'AND',
          rules: g.rules || []
        })));
      } else {
        setEditGroups([{ id: generateUUID(), name: 'Group 1', inner_join: 'AND', rules: [] }]);
      }

      setEditOuterJoin(r.outer_join || r.group_combine_op || 'OR');
      setEditSelectedLocs([]);
    } else {
      setEditIsAuto(false);
      setEditRuleOperator('OR');
      setEditClauses([]);
      setEditGroups([{ id: generateUUID(), name: 'Group 1', inner_join: 'AND', rules: [] }]);
      setEditOuterJoin('OR');
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
      rulesArray = [{ 
        type: 'auto', 
        operator: editRuleOperator, 
        clauses: editClauses,
        groups: editGroups,
        outer_join: editOuterJoin
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

              const locationEntries = Array.from(locationMap.values()).filter(entry => {
                if (entry.location.is_folder === 1 && entry.places.length === 0) return false;
                return true;
              });

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
          <div 
            onClick={(e) => { if (e.target === e.currentTarget) setShowEditForm(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
              padding: '16px', backdropFilter: 'blur(4px)'
            }}
          >
            <div className="login-card collection-modal-dialog" style={{
              maxWidth: editIsAuto ? '760px' : '560px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflow: 'hidden',
              transition: 'max-width 0.2s ease'
            }}>
              {/* Sticky Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                <h3 style={{ margin: 0 }}>Edit Collection</h3>
                <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowEditForm(false)} />
              </div>

              {/* Form with Scrollable Body */}
              <form onSubmit={handleSaveEditCollection} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px' }}>
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
                    <AutoGroupRuleEditor
                      operator={editRuleOperator}
                      setOperator={setEditRuleOperator}
                      clauses={editClauses}
                      setClauses={setEditClauses}
                      groups={editGroups}
                      setGroups={setEditGroups}
                      outerJoin={editOuterJoin}
                      setOuterJoin={setEditOuterJoin}
                      locations={locations}
                      places={places}
                      tags={tags}
                      customCategories={customCategories}
                      entityTags={entityTags}
                    />
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

                  {/* Save and Cancel Action Bar Inside Modal Flow */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)', flexShrink: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowEditForm(false)} style={{ flex: 1, height: '42px', fontWeight: 600 }}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, height: '42px', fontWeight: 700 }}>
                      Save Changes
                    </button>
                  </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {collections.length > 0 && (
            <button 
              type="button"
              className={`btn ${isSelectMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedColIds([]);
              }} 
              style={{
                width: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                height: '38px',
                padding: '0 12px',
                borderRadius: '8px',
                background: isSelectMode ? 'var(--accent-primary)' : undefined,
                color: isSelectMode ? '#ffffff' : undefined
              }}
            >
              <CheckSquare size={16} />
              <span className="desktop-only-text">{isSelectMode ? 'Done Selecting' : 'Select'}</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); }} style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px', height: '38px', borderRadius: '8px' }}>
            <Folder size={16} />
            <span className="desktop-only-text">Create Collection</span>
          </button>
        </div>
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
          <button className="btn btn-primary" onClick={() => { setShowAddForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
            <Folder size={16} />
            <span>Create Collection</span>
          </button>
        </div>
      )}

      {/* Add Collection Dialog overlay */}
      {showAddForm && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddForm(false); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
            padding: '16px', backdropFilter: 'blur(4px)'
          }}
        >
          <div className="login-card collection-modal-dialog" style={{
            maxWidth: isAuto ? '760px' : '560px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            overflow: 'hidden',
            transition: 'max-width 0.2s ease'
          }}>
            {/* Sticky Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}>Create New Collection</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowAddForm(false)} />
            </div>

            {/* Form with Scrollable Body */}
            <form onSubmit={handleCreateCollection} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px' }}>
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
                  <AutoGroupRuleEditor
                    operator={ruleOperator}
                    setOperator={setRuleOperator}
                    clauses={clauses}
                    setClauses={setClauses}
                    groups={groups}
                    setGroups={setGroups}
                    outerJoin={outerJoin}
                    setOuterJoin={setOuterJoin}
                    locations={locations}
                    places={places}
                    tags={tags}
                    customCategories={customCategories}
                    entityTags={entityTags}
                  />
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

                {/* Save and Cancel Action Bar Inside Modal Flow */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-glass)', flexShrink: 0 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)} style={{ flex: 1, height: '42px', fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2, height: '42px', fontWeight: 700 }}>
                    Save Collection
                  </button>
                </div>
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
            const rules = col.rules ? (typeof col.rules === 'string' ? JSON.parse(col.rules) : col.rules) : [];
            const isAdvRule = rules && rules.length > 0 && rules[0].operator === 'ADVANCED';
            const isSelected = selectedColIds.includes(col.id);

            return (
              <div 
                key={col.id} 
                className={`card ${isSelected ? 'selected-card' : ''}`}
                onClick={() => {
                  if (isSelectMode && !col.isSystem) {
                    toggleCollectionSelect(col.id);
                  } else {
                    setSelectedCol(col);
                  }
                }} 
                style={{ 
                  minHeight: '140px',
                  position: 'relative',
                  cursor: 'pointer',
                  border: isSelected ? '1.5px solid var(--accent-primary)' : undefined,
                  boxShadow: isSelected ? '0 0 15px rgba(124, 58, 237, 0.3)' : undefined
                }}
              >
                {/* Select Mode Checkbox */}
                {isSelectMode && !col.isSystem && (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollectionSelect(col.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      border: isSelected ? 'none' : '2px solid var(--border-glass)',
                      background: isSelected ? 'var(--accent-primary)' : 'rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 2,
                      color: '#ffffff',
                      boxShadow: isSelected ? '0 2px 6px rgba(124, 58, 237, 0.4)' : undefined
                    }}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </div>
                )}

                <div className="card-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingRight: isSelectMode && !col.isSystem ? '28px' : 0 }}>
                    <Folder style={{ color: 'var(--accent-primary-hover)' }} size={20} />
                    <h3 style={{ margin: 0 }}>{col.name}</h3>
                  </div>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flexGrow: 1 }}>
                    Contains <b>{colItems.locations.length}</b> locations and <b>{totalPlaces}</b> places to visit.
                  </p>

                  {col.rules && (
                    <span className="tag-badge" style={{ backgroundColor: isAdvRule ? 'rgba(168, 85, 247, 0.15)' : 'rgba(6, 182, 212, 0.15)', color: isAdvRule ? '#c084fc' : 'var(--accent-secondary)', alignSelf: 'flex-start', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isAdvRule && <Sparkles size={11} />} {isAdvRule ? 'Auto-Group (Advanced)' : 'Auto-Group Rule'}
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

      {/* Floating Bulk Action Bar */}
      {isSelectMode && selectedColIds.length > 0 && (
        <div className="bulk-actions-floating-bar">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {selectedColIds.length} selected
          </span>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const selectableIds = collections.map(c => c.id);
              const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedColIds.includes(id));
              if (allSelected) {
                setSelectedColIds(prev => prev.filter(id => !selectableIds.includes(id)));
              } else {
                setSelectedColIds(Array.from(new Set([...selectedColIds, ...selectableIds])));
              }
            }}
            style={{ fontSize: '0.78rem', padding: '6px 12px', height: '32px' }}
          >
            Select All
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleBulkDeleteCollections}
            style={{
              fontSize: '0.78rem',
              padding: '6px 14px',
              height: '32px',
              background: 'rgba(239, 68, 68, 0.18)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={14} />
            <span>Delete ({selectedColIds.length})</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSelectedColIds([]);
              setIsSelectMode(false);
            }}
            style={{ fontSize: '0.78rem', padding: '6px 10px', height: '32px' }}
            title="Done selecting"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
