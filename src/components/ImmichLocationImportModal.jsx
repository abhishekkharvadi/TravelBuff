import React, { useState, useEffect, useMemo } from 'react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { immichImportQueue } from '../services/immichImportQueue.js';
import { 
  X, RefreshCw, Folder, MapPin, CheckSquare, Square, 
  ChevronRight, ChevronDown, Sparkles, AlertCircle, Info, Check, CornerDownRight, Move
} from 'lucide-react';

// Helper function to canonicalize names by stripping diacritics, punctuation, and extra whitespace
const normalizeGeoString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^\w\s]/g, ' ')       // replace punctuation with space
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
};

// Aliases dictionary for common countries / regions
const COUNTRY_ALIASES = {
  'usa': 'united states',
  'us': 'united states',
  'united states of america': 'united states',
  'uk': 'united kingdom',
  'great britain': 'united kingdom',
  'uae': 'united arab emirates'
};

const canonicalizeCountry = (countryStr) => {
  const norm = normalizeGeoString(countryStr);
  return COUNTRY_ALIASES[norm] || norm;
};

// Break a multi-part location string into canonical segments (e.g. "Paris, Ile-de-France, France")
const extractGeoSegments = (locName) => {
  if (!locName) return [];
  return locName
    .split(/[,–\-|/]/)
    .map(s => normalizeGeoString(s))
    .filter(Boolean);
};

export default function ImmichLocationImportModal({ isOpen, onClose, onImportStarted }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [markersData, setMarkersData] = useState([]);
  
  const [countryTree, setCountryTree] = useState({});
  const [expandedCountries, setExpandedCountries] = useState({});
  const [expandedStates, setExpandedStates] = useState({});
  const [fetchImagesEnabled, setFetchImagesEnabled] = useState(true);
  const [createHierarchy, setCreateHierarchy] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('tb_token') || '');

  // Global toggle for marking all as visited
  const [globalVisited, setGlobalVisited] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadExistingAndFetchMarkers();
    }
  }, [isOpen]);

  const loadExistingAndFetchMarkers = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const curToken = localStorage.getItem('tb_token') || '';
      setToken(curToken);

      // 1. Fetch all existing locations and folders from Dexie
      const allExistingLocs = await db.locations.toArray();
      
      // Build robust multi-index lookup maps
      const folderMap = new Map(); // id -> folder object
      const allFoldersList = [];
      const allLocationsList = [];

      allExistingLocs.forEach(loc => {
        if (loc.is_folder === 1) {
          folderMap.set(loc.id, loc);
          allFoldersList.push({
            record: loc,
            normName: normalizeGeoString(loc.name),
            canonicalCountry: canonicalizeCountry(loc.name),
            segments: extractGeoSegments(loc.name)
          });
        } else {
          allLocationsList.push({
            record: loc,
            normName: normalizeGeoString(loc.name),
            segments: extractGeoSegments(loc.name),
            rawCountryNorm: normalizeGeoString(loc.country),
            rawStateNorm: normalizeGeoString(loc.state)
          });
        }
      });

      // 2. Fetch photo markers from backend proxy
      const res = await fetch('/api/immich/markers', {
        headers: {
          'Authorization': `Bearer ${curToken}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Immich API returned HTTP ${res.status}`);
      }

      const markers = await res.json();
      if (!Array.isArray(markers) || markers.length === 0) {
        setMarkersData([]);
        setCountryTree({});
        setLoading(false);
        return;
      }

      setMarkersData(markers);
      build3TierHierarchy(markers, {
        folderMap,
        allFoldersList,
        allLocationsList
      });
    } catch (err) {
      console.error('Failed to load Immich markers:', err);
      setErrorMsg(err.message || 'Failed to fetch location markers from Immich.');
    } finally {
      setLoading(false);
    }
  };

  const findMatchingCountryFolder = (countryName, allFoldersList) => {
    const normCountry = canonicalizeCountry(countryName);
    if (!normCountry || normCountry === 'uncategorized other') return null;

    for (const f of allFoldersList) {
      if (f.record.parent_id) continue; // Only root folders for countries
      if (f.canonicalCountry === normCountry || f.normName === normCountry) {
        return f.record;
      }
      if (f.segments.includes(normCountry)) {
        return f.record;
      }
    }
    return null;
  };

  const findMatchingStateFolder = (stateName, countryName, parentCountryFolderId, allFoldersList) => {
    const normState = normalizeGeoString(stateName);
    const normCountry = canonicalizeCountry(countryName);
    if (!normState) return null;

    for (const f of allFoldersList) {
      // 1. Direct sub-folder under parent country folder
      if (parentCountryFolderId && f.record.parent_id === parentCountryFolderId) {
        if (f.normName === normState || f.segments.includes(normState)) {
          return f.record;
        }
      }
      // 2. Folder named "State, Country" at root or under country
      if (f.segments.includes(normState) && (f.segments.includes(normCountry) || f.record.parent_id === parentCountryFolderId)) {
        return f.record;
      }
    }
    return null;
  };

  const findMatchingLocation = (cityName, stateName, countryName, allLocationsList) => {
    const normCity = normalizeGeoString(cityName);
    const normState = normalizeGeoString(stateName);
    const normCountry = canonicalizeCountry(countryName);

    if (!normCity) return null;

    // Check all existing locations with prioritized match strength
    for (const locItem of allLocationsList) {
      const segs = locItem.segments;
      const hasCity = segs.includes(normCity) || locItem.normName.startsWith(normCity);

      if (hasCity) {
        // High confidence match: City + State + Country
        if (normState && (segs.includes(normState) || locItem.rawStateNorm === normState)) {
          return locItem.record;
        }
        // City + Country
        if (normCountry && (segs.includes(normCountry) || locItem.rawCountryNorm === normCountry)) {
          return locItem.record;
        }
        // If location name has only 1 segment and matches city exactly
        if (segs.length === 1 && segs[0] === normCity) {
          return locItem.record;
        }
      }
    }
    return null;
  };

  const build3TierHierarchy = (markers, lookup) => {
    const tree = {};
    const initExpandedCountries = {};
    const initExpandedStates = {};

    markers.forEach(m => {
      // 1. Clean Country
      let country = (m.country || '').trim();
      if (!country) country = 'Uncategorized / Other';

      // 2. Clean State & City
      let state = (m.state || '').trim();
      let city = (m.city || m.name || '').trim();
      
      if (!city) {
        if (state) {
          city = state;
        } else {
          city = `${country} Region (${(m.lat || 0).toFixed(2)}, ${(m.lon || 0).toFixed(2)})`;
        }
      }

      // Initialize Country
      if (!tree[country]) {
        const existingCountryFolder = findMatchingCountryFolder(country, lookup.allFoldersList);

        tree[country] = {
          name: country,
          selected: true,
          count: 0,
          existingFolder: existingCountryFolder,
          actionState: existingCountryFolder ? 'REUSE_FOLDER' : 'NEW_FOLDER',
          states: {},
          directCities: {}
        };
        initExpandedCountries[country] = true;
      }

      tree[country].count++;
      const countryObj = tree[country];

      // Check if state exists
      if (state) {
        // Initialize State under Country
        if (!countryObj.states[state]) {
          const parentFolderId = countryObj.existingFolder ? countryObj.existingFolder.id : null;
          const existingStateFolder = findMatchingStateFolder(state, country, parentFolderId, lookup.allFoldersList);

          countryObj.states[state] = {
            name: state,
            countryName: country,
            selected: true,
            count: 0,
            existingFolder: existingStateFolder,
            actionState: existingStateFolder ? 'REUSE_FOLDER' : 'NEW_FOLDER',
            cities: {}
          };
          initExpandedStates[`${country}:${state}`] = true;
        }

        countryObj.states[state].count++;
        const stateObj = countryObj.states[state];

        // Process City under State
        if (!stateObj.cities[city]) {
          stateObj.cities[city] = analyzeCityPlacement(city, state, country, stateObj.existingFolder, countryObj.existingFolder, lookup, m);
        } else {
          stateObj.cities[city].count++;
        }
      } else {
        // Process Direct City under Country (no state tag)
        if (!countryObj.directCities[city]) {
          countryObj.directCities[city] = analyzeCityPlacement(city, '', country, null, countryObj.existingFolder, lookup, m);
        } else {
          countryObj.directCities[city].count++;
        }
      }
    });

    setCountryTree(tree);
    setExpandedCountries(initExpandedCountries);
    setExpandedStates(initExpandedStates);
  };

  // Helper to determine exact actionState for a city using robust multi-segment search
  const analyzeCityPlacement = (cityName, stateName, countryName, existingStateFolder, existingCountryFolder, lookup, marker) => {
    const existingLoc = findMatchingLocation(cityName, stateName, countryName, lookup.allLocationsList);

    let actionState = 'CREATE_NEW';
    let currentParentName = 'Root Level';
    let relocateSelected = false;

    if (existingLoc) {
      if (existingLoc.parent_id) {
        const parentFolder = lookup.folderMap.get(existingLoc.parent_id);
        currentParentName = parentFolder ? `Folder "${parentFolder.name}"` : 'Other Folder';

        // Check if it's already in the exact target state or country folder
        if (existingStateFolder && existingLoc.parent_id === existingStateFolder.id) {
          actionState = 'ALREADY_IN_PLACE';
        } else if (!existingStateFolder && existingCountryFolder && existingLoc.parent_id === existingCountryFolder.id) {
          actionState = 'ALREADY_IN_PLACE';
        } else {
          actionState = 'RELOCATE_EXISTING';
          relocateSelected = true;
        }
      } else {
        currentParentName = 'Root Level (Not in a folder)';
        actionState = 'RELOCATE_EXISTING';
        relocateSelected = true;
      }
    }

    return {
      originalCity: cityName,
      name: cityName,
      state: stateName,
      country: countryName,
      lat: marker.lat !== undefined ? marker.lat : marker.latitude,
      lon: marker.lon !== undefined ? marker.lon : marker.longitude,
      count: 1,
      visited: true,
      selected: actionState !== 'ALREADY_IN_PLACE',
      existingLoc: existingLoc,
      actionState: actionState,
      relocateSelected: relocateSelected,
      currentParentName: currentParentName
    };
  };

  // Toggle Country selection
  const handleToggleCountry = (countryName) => {
    setCountryTree(prev => {
      const next = { ...prev };
      const c = next[countryName];
      if (!c) return prev;
      const newSelected = !c.selected;
      c.selected = newSelected;

      // Update States
      Object.values(c.states).forEach(st => {
        st.selected = newSelected;
        Object.values(st.cities).forEach(ct => {
          if (ct.actionState === 'CREATE_NEW') ct.selected = newSelected;
          if (ct.actionState === 'RELOCATE_EXISTING') ct.relocateSelected = newSelected;
        });
      });

      // Update Direct Cities
      Object.values(c.directCities).forEach(ct => {
        if (ct.actionState === 'CREATE_NEW') ct.selected = newSelected;
        if (ct.actionState === 'RELOCATE_EXISTING') ct.relocateSelected = newSelected;
      });

      return { ...next };
    });
  };

  // Toggle State selection
  const handleToggleState = (countryName, stateName) => {
    setCountryTree(prev => {
      const next = { ...prev };
      const st = next[countryName]?.states[stateName];
      if (!st) return prev;
      const newSelected = !st.selected;
      st.selected = newSelected;

      Object.values(st.cities).forEach(ct => {
        if (ct.actionState === 'CREATE_NEW') ct.selected = newSelected;
        if (ct.actionState === 'RELOCATE_EXISTING') ct.relocateSelected = newSelected;
      });

      // Recompute parent country selected
      const allStates = Object.values(next[countryName].states);
      const allDirect = Object.values(next[countryName].directCities);
      next[countryName].selected = allStates.some(s => s.selected) || allDirect.some(d => d.selected);

      return { ...next };
    });
  };

  // Toggle Single City selection
  const handleToggleCity = (countryName, stateName, cityName) => {
    setCountryTree(prev => {
      const next = { ...prev };
      const c = next[countryName];
      if (!c) return prev;

      let cityObj = null;
      if (stateName && c.states[stateName]) {
        cityObj = c.states[stateName].cities[cityName];
      } else if (c.directCities[cityName]) {
        cityObj = c.directCities[cityName];
      }

      if (!cityObj || cityObj.actionState === 'ALREADY_IN_PLACE') return prev;

      if (cityObj.actionState === 'CREATE_NEW') {
        cityObj.selected = !cityObj.selected;
      } else if (cityObj.actionState === 'RELOCATE_EXISTING') {
        cityObj.relocateSelected = !cityObj.relocateSelected;
      }

      return { ...next };
    });
  };

  // Toggle City Visited status
  const handleToggleCityVisited = (countryName, stateName, cityName) => {
    setCountryTree(prev => {
      const next = { ...prev };
      const c = next[countryName];
      if (!c) return prev;

      let cityObj = null;
      if (stateName && c.states[stateName]) {
        cityObj = c.states[stateName].cities[cityName];
      } else if (c.directCities[cityName]) {
        cityObj = c.directCities[cityName];
      }

      if (cityObj) {
        cityObj.visited = !cityObj.visited;
      }
      return { ...next };
    });
  };

  // Global Visited Toggle
  const handleToggleGlobalVisited = () => {
    const nextVal = !globalVisited;
    setGlobalVisited(nextVal);
    setCountryTree(prev => {
      const next = { ...prev };
      Object.values(next).forEach(countryObj => {
        Object.values(countryObj.states).forEach(stateObj => {
          Object.values(stateObj.cities).forEach(cityObj => {
            cityObj.visited = nextVal;
          });
        });
        Object.values(countryObj.directCities).forEach(cityObj => {
          cityObj.visited = nextVal;
        });
      });
      return { ...next };
    });
  };

  // Select / Deselect All
  const handleSelectAll = (select) => {
    setCountryTree(prev => {
      const next = { ...prev };
      Object.values(next).forEach(c => {
        c.selected = select;
        Object.values(c.states).forEach(st => {
          st.selected = select;
          Object.values(st.cities).forEach(ct => {
            if (ct.actionState === 'CREATE_NEW') ct.selected = select;
            if (ct.actionState === 'RELOCATE_EXISTING') ct.relocateSelected = select;
          });
        });
        Object.values(c.directCities).forEach(ct => {
          if (ct.actionState === 'CREATE_NEW') ct.selected = select;
          if (ct.actionState === 'RELOCATE_EXISTING') ct.relocateSelected = select;
        });
      });
      return { ...next };
    });
  };

  // Toggle Expand / Collapse Country
  const handleToggleExpandCountry = (countryName) => {
    setExpandedCountries(prev => ({
      ...prev,
      [countryName]: !prev[countryName]
    }));
  };

  // Toggle Expand / Collapse State
  const handleToggleExpandState = (key) => {
    setExpandedStates(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Comprehensive Live Summary Calculations
  const stats = useMemo(() => {
    let newFoldersToCreate = 0;
    let foldersToReuse = 0;
    let locationsToInsert = 0;
    let locationsToRelocate = 0;
    let locationsAlreadyInPlace = 0;

    Object.values(countryTree).forEach(countryObj => {
      const allSelectedCitiesInCountry = [];

      // Inspect states
      Object.values(countryObj.states).forEach(stateObj => {
        const selectedCitiesInState = Object.values(stateObj.cities).filter(c => 
          (c.actionState === 'CREATE_NEW' && c.selected) ||
          (c.actionState === 'RELOCATE_EXISTING' && c.relocateSelected)
        );

        if (selectedCitiesInState.length > 0) {
          allSelectedCitiesInCountry.push(...selectedCitiesInState);
          if (stateObj.actionState === 'NEW_FOLDER') {
            newFoldersToCreate++;
          } else {
            foldersToReuse++;
          }
        }

        // Count city metrics
        Object.values(stateObj.cities).forEach(c => {
          if (c.actionState === 'CREATE_NEW' && c.selected) locationsToInsert++;
          else if (c.actionState === 'RELOCATE_EXISTING' && c.relocateSelected) locationsToRelocate++;
          else if (c.actionState === 'ALREADY_IN_PLACE') locationsAlreadyInPlace++;
        });
      });

      // Inspect direct cities
      Object.values(countryObj.directCities).forEach(c => {
        if (c.actionState === 'CREATE_NEW' && c.selected) {
          locationsToInsert++;
          allSelectedCitiesInCountry.push(c);
        } else if (c.actionState === 'RELOCATE_EXISTING' && c.relocateSelected) {
          locationsToRelocate++;
          allSelectedCitiesInCountry.push(c);
        } else if (c.actionState === 'ALREADY_IN_PLACE') {
          locationsAlreadyInPlace++;
        }
      });

      if (allSelectedCitiesInCountry.length > 0) {
        if (countryObj.actionState === 'NEW_FOLDER') {
          newFoldersToCreate++;
        } else {
          foldersToReuse++;
        }
      }
    });

    return {
      newFoldersToCreate,
      foldersToReuse,
      locationsToInsert,
      locationsToRelocate,
      locationsAlreadyInPlace,
      totalActionItems: locationsToInsert + locationsToRelocate
    };
  }, [countryTree]);

  // Execute 3-Tier Import and Relocation
  // Execute 3-Tier Import and Relocation via Atomic Server Pipeline
  const handleExecuteImport = async () => {
    if (stats.totalActionItems === 0) {
      alert('No locations selected to import or relocate.');
      return;
    }

    setLoading(true);
    try {
      // Mark first-time import completed in localStorage
      localStorage.setItem('immich_locations_imported', 'true');

      // Trigger Atomic Server-Side Import Pipeline with exact selected count & hierarchy setting
      immichImportQueue.startServerImport(countryTree, token, fetchImagesEnabled, stats.totalActionItems, createHierarchy);

      if (onImportStarted) {
        onImportStarted({
          citiesCount: stats.newCitiesToCreate + stats.existingCitiesToRelocate,
          foldersCount: createHierarchy ? stats.newFoldersToCreate : 0,
          enrichingInBackground: fetchImagesEnabled
        });
      }

      onClose();
    } catch (err) {
      console.error('Import execution error:', err);
      alert(`Error creating locations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lock body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{ 
        zIndex: 99990,
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden'
      }}
    >
      {/* Sticky Top Header & Toolbar Container */}
      <div 
        style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 100, 
          background: 'var(--bg-surface)', 
          borderBottom: '1px solid var(--border-glass)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          padding: '16px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
              <MapPin size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Import Locations from Immich
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                3-Tier Hierarchy Organization (Country ➔ State ➔ City) with instant database pre-analysis
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid var(--border-glass)', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer', 
              padding: '8px', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            title="Close view"
          >
            <X size={22} />
          </button>
        </div>

        {/* Action Toolbar & Proactive Summary */}
        {!loading && !errorMsg && Object.keys(countryTree).length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-app)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleSelectAll(true)}
                style={{ padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600 }}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleSelectAll(false)}
                style={{ padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600 }}
              >
                Deselect All
              </button>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>✨ New: <b style={{ color: 'var(--accent-primary)' }}>{stats.locationsToInsert}</b></span>
                <span>📦 Relocating: <b style={{ color: '#f59e0b' }}>{stats.locationsToRelocate}</b></span>
                {stats.locationsAlreadyInPlace > 0 && (
                  <span>✔️ Organized: <b style={{ color: 'var(--success)' }}>{stats.locationsAlreadyInPlace}</b></span>
                )}
              </div>
            </div>

            {/* Global Visited, Hierarchy & Image Fetch Controls */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', margin: 0, userSelect: 'none', fontWeight: 500 }} title="Organize into Country ➔ State folders instead of placing directly at root">
                <input 
                  type="checkbox" 
                  checked={createHierarchy} 
                  onChange={(e) => setCreateHierarchy(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span>Create Hierarchy (Country ➔ State)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', margin: 0, userSelect: 'none', fontWeight: 500 }}>
                <input 
                  type="checkbox" 
                  checked={globalVisited} 
                  onChange={handleToggleGlobalVisited}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span>Mark All as Visited</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', margin: 0, userSelect: 'none', fontWeight: 500 }}>
                <input 
                  type="checkbox" 
                  checked={fetchImagesEnabled} 
                  onChange={(e) => setFetchImagesEnabled(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span>Fetch Wikipedia Cover Photos (Background)</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Main Page Content Body */}
      <div style={{ flex: '1 0 auto', padding: '24px 28px 100px 28px', width: '100%', boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ padding: '120px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <RefreshCw size={44} className="sync-spinner" style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>Connecting to Immich & Cross-referencing Database...</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Building Country ➔ State ➔ City hierarchy and identifying existing cards</span>
          </div>
        ) : errorMsg ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', maxWidth: '600px', margin: '0 auto' }}>
            <AlertCircle size={44} style={{ color: 'var(--error)' }} />
            <p style={{ margin: 0, color: 'var(--error)', fontSize: '1rem' }}>{errorMsg}</p>
            <button className="btn btn-secondary" onClick={loadExistingAndFetchMarkers} style={{ width: 'auto', marginTop: '12px' }}>
              Retry Fetching
            </button>
          </div>
        ) : Object.keys(countryTree).length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Info size={44} style={{ marginBottom: '12px' }} />
            <p style={{ margin: 0, fontSize: '1.1rem' }}>No photo markers with GPS found on your Immich server.</p>
          </div>
        ) : (
          /* List of Country Cards (Fluid 100% Width) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            {Object.entries(countryTree).map(([countryName, countryObj]) => {
              const isCountryExpanded = !!expandedCountries[countryName];
              const stateEntries = Object.entries(countryObj.states);
              const directCityEntries = Object.entries(countryObj.directCities);
              const countrySelected = countryObj.selected;

              return (
                <div 
                  key={countryName} 
                  style={{ 
                    background: 'var(--bg-surface)', 
                    border: countrySelected ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--border-glass)', 
                    borderRadius: '14px', 
                    overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* LEVEL 1: Country Header Row */}
                  <div 
                    style={{ 
                      padding: '16px 22px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      background: isCountryExpanded ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                      borderBottom: isCountryExpanded ? '1px solid var(--border-glass)' : 'none',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => handleToggleExpandCountry(countryName)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <span 
                        onClick={(e) => { e.stopPropagation(); handleToggleCountry(countryName); }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: countrySelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                      >
                        {countrySelected ? <CheckSquare size={22} /> : <Square size={22} />}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Folder size={22} style={{ color: 'var(--accent-secondary)' }} />
                        <span style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                          {countryName}
                        </span>
                      </div>

                      {/* Action state badge for Country */}
                      {countryObj.actionState === 'REUSE_FOLDER' ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '3px 10px', borderRadius: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📁 Reusing Existing Country Folder
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--accent-secondary)', background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)', padding: '3px 10px', borderRadius: '12px', fontWeight: 600 }}>
                          ✨ Will create Country Folder
                        </span>
                      )}

                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '12px', fontWeight: 500 }}>
                        {stateEntries.length} state(s) • {countryObj.count} photos
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {isCountryExpanded ? 'Collapse' : 'Expand'}
                      </span>
                      {isCountryExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>

                  {/* LEVEL 2 & 3: Content inside Country */}
                  {isCountryExpanded && (
                    <div style={{ padding: '16px 22px', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* States List */}
                      {stateEntries.map(([stateName, stateObj]) => {
                        const stateKey = `${countryName}:${stateName}`;
                        const isStateExpanded = !!expandedStates[stateKey];
                        const cityEntries = Object.entries(stateObj.cities);
                        const stateSelected = stateObj.selected;

                        return (
                          <div 
                            key={stateKey}
                            style={{ 
                              background: 'var(--bg-surface)', 
                              border: stateSelected ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--border-glass)', 
                              borderRadius: '10px', 
                              overflow: 'hidden' 
                            }}
                          >
                            {/* LEVEL 2: State Sub-Folder Header */}
                            <div 
                              style={{ 
                                padding: '12px 18px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                background: isStateExpanded ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                                borderBottom: isStateExpanded ? '1px solid var(--border-glass)' : 'none',
                                cursor: 'pointer',
                                userSelect: 'none'
                              }}
                              onClick={() => handleToggleExpandState(stateKey)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span 
                                  onClick={(e) => { e.stopPropagation(); handleToggleState(countryName, stateName); }}
                                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: stateSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                                >
                                  {stateSelected ? <CheckSquare size={19} /> : <Square size={19} />}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <CornerDownRight size={16} style={{ color: 'var(--text-muted)' }} />
                                  <Folder size={18} style={{ color: '#ec4899' }} />
                                  <span style={{ fontWeight: 600, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                                    {stateName}
                                  </span>
                                </div>

                                {/* State action badge */}
                                {stateObj.actionState === 'REUSE_FOLDER' ? (
                                  <span style={{ fontSize: '0.74rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                    📁 Reusing Sub-folder
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.74rem', color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                    ✨ Will create Sub-folder
                                  </span>
                                )}

                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
                                  {cityEntries.length} cities • {stateObj.count} photos
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                  {isStateExpanded ? 'Collapse' : 'Expand'}
                                </span>
                                {isStateExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </div>
                            </div>

                            {/* LEVEL 3: City Cards Grid under State */}
                            {isStateExpanded && (
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                                gap: '12px', 
                                padding: '14px 18px',
                                background: 'rgba(0, 0, 0, 0.2)'
                              }}>
                                {cityEntries.map(([cityName, city]) => renderCityCard(city, countryName, stateName))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Direct Cities (No State Tag) */}
                      {directCityEntries.length > 0 && (
                        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-glass)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            📍 Cities Directly in {countryName} (No State EXIF)
                          </div>
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                            gap: '12px', 
                            padding: '14px 18px',
                            background: 'rgba(0, 0, 0, 0.2)'
                          }}>
                            {directCityEntries.map(([cityName, city]) => renderCityCard(city, countryName, null))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Floating Action Bar */}
      {!loading && !errorMsg && Object.keys(countryTree).length > 0 && (
        <div 
          style={{ 
            position: 'sticky', 
            bottom: 0, 
            zIndex: 100, 
            background: 'var(--bg-surface)', 
            borderTop: '1px solid var(--border-glass)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
            padding: '16px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Summary of Changes:
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <span>📁 Folders: <b style={{ color: '#fff' }}>{stats.newFoldersToCreate}</b> new, <b style={{ color: 'var(--success)' }}>{stats.foldersToReuse}</b> reused</span>
              <span>📍 Locations: <b style={{ color: 'var(--accent-primary)' }}>{stats.locationsToInsert}</b> new, <b style={{ color: '#f59e0b' }}>{stats.locationsToRelocate}</b> relocated</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              style={{ fontSize: '0.9rem', padding: '9px 24px', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleExecuteImport}
              disabled={stats.totalActionItems === 0}
              style={{ fontSize: '0.9rem', padding: '9px 28px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
            >
              <Sparkles size={18} /> Confirm & Apply ({stats.totalActionItems} changes)
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Helper render for single city card
  function renderCityCard(city, countryName, stateName) {
    const isRelocate = city.actionState === 'RELOCATE_EXISTING';
    const isAlreadyInPlace = city.actionState === 'ALREADY_IN_PLACE';
    const isCreateNew = city.actionState === 'CREATE_NEW';

    return (
      <div 
        key={city.originalCity}
        onClick={() => !isAlreadyInPlace && handleToggleCity(countryName, stateName, city.originalCity)}
        style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderRadius: '10px',
          background: isAlreadyInPlace ? 'rgba(255,255,255,0.02)' : isRelocate ? (city.relocateSelected ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)') : (city.selected ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-surface)'),
          border: isAlreadyInPlace ? '1px dashed var(--border-glass)' : isRelocate ? (city.relocateSelected ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid var(--border-glass)') : (city.selected ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--border-glass)'),
          cursor: isAlreadyInPlace ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          opacity: isAlreadyInPlace ? 0.65 : 1,
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexGrow: 1, minWidth: 0 }}>
            <span 
              onClick={(e) => { e.stopPropagation(); if (!isAlreadyInPlace) handleToggleCity(countryName, stateName, city.originalCity); }}
              style={{ 
                cursor: isAlreadyInPlace ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                color: isAlreadyInPlace ? 'var(--text-muted)' : isRelocate ? (city.relocateSelected ? '#f59e0b' : 'var(--text-muted)') : (city.selected ? 'var(--accent-primary)' : 'var(--text-muted)'),
                flexShrink: 0
              }}
            >
              {isAlreadyInPlace ? <CheckSquare size={18} /> : isRelocate ? (city.relocateSelected ? <CheckSquare size={18} /> : <Square size={18} />) : (city.selected ? <CheckSquare size={18} /> : <Square size={18} />)}
            </span>

            <MapPin size={18} style={{ color: isRelocate ? '#f59e0b' : 'var(--accent-primary)', flexShrink: 0 }} />

            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {city.name}
              </div>
              {city.state && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {city.state}
                </div>
              )}
            </div>
          </div>

          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>
            📷 {city.count}
          </span>
        </div>

        {/* Action / Placement Badge */}
        <div style={{ marginBottom: '8px' }}>
          {isAlreadyInPlace && (
            <span style={{ fontSize: '0.72rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              ✔️ Card "{city.existingLoc?.name || city.name}" already in {stateName ? `${stateName} Sub-folder` : `${countryName} Folder`}
            </span>
          )}
          {isRelocate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Move size={11} /> Matched "{city.existingLoc?.name}" • Currently in {city.currentParentName}
              </span>
            </div>
          )}
          {isCreateNew && (
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.12)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              ✨ New Destination
            </span>
          )}
        </div>

        {/* Bottom row: Visited & Relocation toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {isAlreadyInPlace ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No changes needed</span>
          ) : isRelocate ? (
            <label 
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', margin: 0, color: city.relocateSelected ? '#f59e0b' : 'var(--text-muted)', userSelect: 'none', fontWeight: 600 }}
            >
              <input 
                type="checkbox" 
                checked={!!city.relocateSelected} 
                onChange={() => handleToggleCity(countryName, stateName, city.originalCity)}
                style={{ width: '15px', height: '15px', accentColor: '#f59e0b' }}
              />
              <span>{city.relocateSelected ? `Move into ${stateName || countryName}` : 'Keep in current place'}</span>
            </label>
          ) : (
            <>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {city.selected ? 'Will be created' : 'Skipped'}
              </span>

              <label 
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', margin: 0, color: city.visited ? 'var(--success)' : 'var(--text-muted)', userSelect: 'none', fontWeight: 500 }}
              >
                <input 
                  type="checkbox" 
                  checked={!!city.visited} 
                  onChange={() => handleToggleCityVisited(countryName, stateName, city.originalCity)}
                  disabled={!city.selected}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--success)' }}
                />
                <span>{city.visited ? 'Visited ✔' : 'Not Visited'}</span>
              </label>
            </>
          )}
        </div>
      </div>
    );
  }
}
