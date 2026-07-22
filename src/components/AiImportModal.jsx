import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, X, Loader, Search, Check, Trash2, Plus, MapPin, RotateCcw, Clock, MoreVertical, Save } from 'lucide-react';
import { db, queueSyncAction, generateUUID } from '../clientDb.js';
import { trackApiCall } from '../utils/apiTracker.js';

const toSentenceTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const FilterableSelect = ({ value, onChange, options, placeholder, isMulti = false, activeValues = [] }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  const filteredOptions = options.filter(opt => 
    opt.name.toLowerCase().includes(query.toLowerCase())
  );
  
  return (
    <div style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setIsOpen(false)}>
      <div 
        style={{ 
          padding: '6px 10px', 
          fontSize: '0.78rem', 
          backgroundColor: 'var(--bg-app)', 
          border: '1px solid var(--border-glass)', 
          borderRadius: '4px',
          cursor: 'pointer',
          minHeight: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--text-primary)'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
          {isMulti ? (activeValues.length > 0 ? `${activeValues.length} selected` : placeholder) : (options.find(o => o.id === value || o.name === value)?.name || placeholder)}
        </span>
        <span>▾</span>
      </div>
      
      {isOpen && (
        <div style={{ 
          position: 'absolute', 
          top: '30px', 
          left: 0, 
          right: 0, 
          backgroundColor: 'var(--bg-surface)', 
          border: '1px solid var(--border-glass)', 
          borderRadius: '4px',
          zIndex: 999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          padding: '6px'
        }}>
          <input 
            type="text" 
            className="form-control"
            style={{ padding: '4px 8px', fontSize: '0.75rem', marginBottom: '6px', width: '100%', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
            placeholder="Type to filter..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredOptions.length === 0 ? (
              <span style={{ padding: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>No matches</span>
            ) : (
              filteredOptions.map((opt) => {
                if (isMulti) {
                  const isSel = activeValues.includes(opt.id);
                  return (
                    <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', fontSize: '0.75rem', cursor: 'pointer', margin: 0, color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={isSel}
                        onChange={() => onChange(opt.id)}
                      />
                      {opt.name}
                    </label>
                  );
                } else {
                  const isOptSelected = value === opt.id || value === opt.name;
                  return (
                    <div 
                      key={opt.id}
                      style={{ padding: '4px 6px', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '3px', color: 'var(--text-primary)', backgroundColor: isOptSelected ? 'var(--bg-surface-elevated)' : 'transparent' }}
                      onClick={() => {
                        onChange(opt.id || opt.name);
                        setIsOpen(false);
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-surface-elevated)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = isOptSelected ? 'var(--bg-surface-elevated)' : 'transparent'}
                    >
                      {opt.name}
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function AiImportModal({ token, onClose, resumeMarkdown = null }) {
  const [step, setStep] = useState(resumeMarkdown ? 1 : 0); // 0: URL input, 1: Review
  const [activeTab, setActiveTab] = useState('markdown'); // 'markdown' or 'places'
  const [url, setUrl] = useState(resumeMarkdown?.url || '');
  const [scraper, setScraper] = useState('jina');
  const [guideName, setGuideName] = useState(resumeMarkdown?.name || '');
  const [imageDirection, setImageDirection] = useState('below');
  const [loading, setLoading] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState(resumeMarkdown?.id || null);
  const [error, setError] = useState(null);
  
  const [markdown, setMarkdown] = useState(resumeMarkdown?.content || '');
  const [places, setPlaces] = useState([]);
  const [savedItemIds, setSavedItemIds] = useState([]);
  const [toastMessage, setToastMessage] = useState('');
  const [showPromptConsole, setShowPromptConsole] = useState(false);
  const [manualHighlights, setManualHighlights] = useState([]);
  const locationsList = useLiveQuery(() => db.locations.toArray()) || [];
  const tagsList = useLiveQuery(() => db.tags.toArray()) || [];
  const customCategoriesList = useLiveQuery(() => db.custom_categories.toArray()) || [];
 
  const savedLocations = useLiveQuery(async () => {
    // 1. Get location IDs saved during this active session
    const sessionIds = savedItemIds.filter(item => item.type === 'location').map(item => item.id);
    
    // 2. Query all database locations matching this guide's URL
    let dbLocs = [];
    if (url) {
      const allLocs = await db.locations.toArray();
      dbLocs = allLocs.filter(loc => {
        if (!loc.source_urls) return false;
        try {
          const urls = JSON.parse(loc.source_urls);
          return Array.isArray(urls) && urls.includes(url);
        } catch (_) {
          return loc.source_urls === url;
        }
      });
    }
    
    // 3. Combine both source URL match and session saved IDs
    const combinedIds = new Set([...sessionIds, ...dbLocs.map(l => l.id)]);
    if (combinedIds.size === 0) return [];
    return db.locations.where('id').anyOf([...combinedIds]).toArray();
  }, [savedItemIds, url]) || [];

  const savedPlaces = useLiveQuery(async () => {
    // 1. Get place IDs saved during this active session
    const sessionIds = savedItemIds.filter(item => item.type === 'place').map(item => item.id);
    
    // 2. Get all database places that belong to the matched guide locations
    const guideLocIds = savedLocations.map(l => l.id);
    let dbPlaces = [];
    if (guideLocIds.length > 0) {
      dbPlaces = await db.places.where('location_id').anyOf(guideLocIds).toArray();
    }
    
    // 3. Combine both location linkage match and session saved IDs
    const combinedIds = new Set([...sessionIds, ...dbPlaces.map(p => p.id)]);
    if (combinedIds.size === 0) return [];
    return db.places.where('id').anyOf([...combinedIds]).toArray();
  }, [savedItemIds, savedLocations]) || [];
  
  // Curation tab states
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [country, setCountry] = useState('');
  const [customPrompt, setCustomPrompt] = useState(
    'Extract geocoding details (address, latitude, longitude) and classify category for the list of places provided.'
  );
  const [osmError, setOsmError] = useState(null);

  // For capturing manual selection
  const [selectedText, setSelectedText] = useState('');
  const [selectionCoords, setSelectionCoords] = useState(null);
  
  const [processingId, setProcessingId] = useState(null);

  // States for geocoding search dropdowns
  const [activeSearchId, setActiveSearchId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleGeocodeName = async (id, query) => {
    if (!query) return;
    setSearching(true);
    setActiveSearchId(id);
    setSearchResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'TravelBuff-App/1.0' }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        const formatted = data.map(item => {
          const address = item.address || {};
          const city = address.city || address.town || address.village || address.municipality || '';
          const country = address.country || '';
          return {
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name,
            city: city,
            country: country
          };
        });
        setSearchResults(formatted);
      }
    } catch (err) {
      console.error('Geocoding query failed', err);
    } finally {
      setSearching(false);
    }
  };

  // Client-side markdown parser to extract headings for resumed guides
  const extractPlacesFromMarkdown = (mdText, imgDir = 'below') => {
    const lines = mdText.split('\n');
    const headings = [];
    const images = []; // Array of { url: '', lineNumber: 0 }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const currentHeading = {
          name: headingMatch[2].trim(),
          level: headingMatch[1].length,
          description: '',
          images: [],
          lineNumber: i
        };
        headings.push(currentHeading);
        
        for (let j = i + 1; j < lines.length; j++) {
          const descLine = lines[j].trim();
          if (descLine === '') continue;
          if (descLine.startsWith('#')) break;
          if (descLine.match(/!\[.*\]\(.*\)/)) continue;
          currentHeading.description = descLine;
          break;
        }
      }

      const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+\.(?:jpg|jpeg|png|webp|gif).*?)\)/gi;
      let match;
      while ((match = imageRegex.exec(line)) !== null) {
        images.push({ url: match[1], lineNumber: i });
      }
    }

    // Associate images to headings respecting heading level boundaries
    for (let hIdx = 0; hIdx < headings.length; hIdx++) {
      const h = headings[hIdx];
      
      if (imgDir === 'above') {
        let startLine = 0;
        for (let k = hIdx - 1; k >= 0; k--) {
          if (headings[k].level <= h.level) {
            startLine = headings[k].lineNumber;
            break;
          }
        }
        h.images = images
          .filter(img => img.lineNumber > startLine && img.lineNumber < h.lineNumber)
          .map(img => img.url);
      } else {
        // Below
        let endLine = lines.length;
        for (let k = hIdx + 1; k < headings.length; k++) {
          if (headings[k].level <= h.level) {
            endLine = headings[k].lineNumber;
            break;
          }
        }
        h.images = images
          .filter(img => img.lineNumber > h.lineNumber && img.lineNumber < endLine)
          .map(img => img.url);
      }
    }

    return headings.map(h => {
      // Clean name
      let name = h.name.replace(/^(\d+[\.\-\s)]+\s*|\bStep\s+\d+[\.\-\s:]+\s*)/i, '').trim();
      const bracketRegex = /\((.*?)\)|\[(.*?)\]/g;
      let m;
      const discarded = [];
      while ((m = bracketRegex.exec(name)) !== null) {
        const text = (m[1] || m[2] || '').trim();
        if (text) discarded.push(text);
      }
      name = name.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+/g, ' ').trim();

      return {
        id: generateUUID(),
        name: toSentenceTitleCase(name),
        discarded: discarded.join(', '),
        description: h.description,
        localImagePath: h.images.length > 0 ? h.images[0] : null,
        latitude: '',
        longitude: '',
        target_location: '',
        geocodeSuccess: false,
        originalHeading: h.name,
        type: 'place',
        status: 'pending'
      };
    });
  };

  // Run automatically on load when resuming a guide
  useEffect(() => {
    const initResumedGuide = async () => {
      if (resumeMarkdown && places.length === 0) {
        // First try to load from database
        if (resumeMarkdown.parsed_items_state) {
          try {
            const storedPlaces = JSON.parse(resumeMarkdown.parsed_items_state);
            setPlaces(storedPlaces);
            
            // Also load context
            if (resumeMarkdown.import_context) {
              const ctx = JSON.parse(resumeMarkdown.import_context);
              setCity(ctx.city || '');
              setStateName(ctx.state || '');
              setCountry(ctx.country || '');
              if (ctx.customPrompt) setCustomPrompt(ctx.customPrompt);
            }
            return; // Loaded successfully!
          } catch (e) {
            console.error('Failed to parse guide state from DB, falling back to markdown parse', e);
          }
        }

        // Fallback: Parse markdown
        if (resumeMarkdown.content) {
          const parsed = extractPlacesFromMarkdown(resumeMarkdown.content, imageDirection);
          
          // Fetch existing entries from Dexie to filter out already imported ones
          const existingLocs = await db.locations.toArray();
          const existingPlaces = await db.places.toArray();

          // Fetch rejected headings list from localStorage
          let rejectedHeadings = [];
          const storageKey = `rejected_headings_${resumeMarkdown.id}`;
          try {
            const stored = localStorage.getItem(storageKey);
            if (stored) rejectedHeadings = JSON.parse(stored);
          } catch (e) {
            console.error(e);
          }

          const filtered = parsed.filter(p => {
            if (rejectedHeadings.includes(p.originalHeading)) {
              return false;
            }
            const nameLower = p.name.toLowerCase();
            const isLoc = existingLocs.some(l => l.name.toLowerCase() === nameLower);
            const isPlace = existingPlaces.some(pl => pl.name.toLowerCase() === nameLower);
            if (isLoc || isPlace) {
              return false;
            }
            return true;
          });

          // Set all initial parsed items to unresolved (status: 'pending')
          const initialized = filtered.map(item => ({ ...item, status: 'pending' }));
          setPlaces(initialized);
        }
      }
    };

    initResumedGuide();
  }, [resumeMarkdown, imageDirection]);

  // Persist curation state debounced
  useEffect(() => {
    const targetGuideId = activeGuideId || resumeMarkdown?.id;
    if (targetGuideId) {
      const saveState = async () => {
        try {
          const serializedPlaces = JSON.stringify(places);
          const serializedContext = JSON.stringify({ city, state: stateName, country, customPrompt });
          
          // If there are pending/unresolved rows (status !== 'completed'), status is 'pending'
          const hasPending = places.length > 0 && places.some(p => p.status !== 'completed');
          const computedStatus = hasPending ? 'pending' : 'completed';

          const guideRecord = await db.saved_markdowns.get(targetGuideId);
          if (guideRecord) {
            const updated = {
              ...guideRecord,
              parsed_items_state: serializedPlaces,
              import_context: serializedContext,
              status: computedStatus
            };
            await db.saved_markdowns.put(updated);
            await queueSyncAction('saved_markdowns', 'update', updated);
          }
        } catch (e) {
          console.error('Failed to persist curation state', e);
        }
      };

      const timeout = setTimeout(saveState, 800);
      return () => clearTimeout(timeout);
    }
  }, [places, city, stateName, country, customPrompt, activeGuideId, resumeMarkdown]);

  const fetchPhotoForPlace = async (rowId, placeName, lat = null, lon = null) => {
    try {
      const queryParts = [placeName, city, country].filter(Boolean).join(' ');
      trackApiCall('Wikipedia');
      const res = await fetch('/api/import/search-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: queryParts, latitude: lat, longitude: lon })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileUrl) {
          setPlaces(prev => prev.map(item => item.id === rowId ? { ...item, localImagePath: data.fileUrl } : item));
        }
      }
    } catch (err) {
      console.error('Failed to search or download photo for manual row:', err);
    }
  };

  // Geocode a single row
  const handleGeocodeRow = async (rowId) => {
    const p = places.find(item => item.id === rowId);
    if (!p) return;
    
    setPlaces(prev => prev.map(item => item.id === rowId ? { ...item, geocodeLoading: true } : item));
    setOsmError(null);

    const queryParts = [p.name, city, stateName, country].filter(Boolean).join(', ');
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(queryParts)}`, {
        headers: { 'User-Agent': 'TravelBuff-App/1.0' }
      });
      
      if (res.status === 429) {
        setOsmError("OpenStreetMap Bandwidth Limit Reached (Error 429). Please try again later.");
        setPlaces(prev => prev.map(item => item.id === rowId ? { ...item, geocodeLoading: false } : item));
        return;
      }
      
      if (!res.ok) {
        throw new Error(`OSM Error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        const addr = result.address || {};
        const locationString = (addr.city && addr.country) ? `${addr.city}, ${addr.country}` : (addr.city || addr.country || '');
        
        setPlaces(prev => prev.map(item => item.id === rowId ? {
          ...item,
          latitude: parseFloat(result.lat) || '',
          longitude: parseFloat(result.lon) || '',
          address: result.display_name || '',
          target_location: locationString,
          status: 'completed',
          geocodeSuccess: true,
          geocodeLoading: false
        } : item));

        // Automatically fetch the photo
        fetchPhotoForPlace(rowId, p.name, parseFloat(result.lat) || null, parseFloat(result.lon) || null);
      } else {
        setPlaces(prev => prev.map(item => item.id === rowId ? { ...item, geocodeLoading: false } : item));
        alert(`No coordinates found for "${p.name}". Try modifying the name or adding location context.`);
      }
    } catch (err) {
      console.error('Single row geocoding failed', err);
      setOsmError(`Geocoding failed: ${err.message}`);
      setPlaces(prev => prev.map(item => item.id === rowId ? { ...item, geocodeLoading: false } : item));
    }
  };

  // Geocode all unresolved rows
  const handleGeocodeAllUnresolved = async () => {
    const unresolved = places.filter(p => p.status !== 'completed');
    if (unresolved.length === 0) {
      alert("No unresolved places to fetch.");
      return;
    }
    
    setOsmError(null);
    for (const p of unresolved) {
      setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, geocodeLoading: true } : item));
      const queryParts = [p.name, city, stateName, country].filter(Boolean).join(', ');
      
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(queryParts)}`, {
          headers: { 'User-Agent': 'TravelBuff-App/1.0' }
        });
        
        if (res.status === 429) {
          setOsmError("OpenStreetMap Bandwidth Limit Reached (Error 429). Batch geocoding paused.");
          setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, geocodeLoading: false } : item));
          break;
        }
        
        const data = await res.json();
        if (res.ok && Array.isArray(data) && data.length > 0) {
          const result = data[0];
          const addr = result.address || {};
          const locationString = (addr.city && addr.country) ? `${addr.city}, ${addr.country}` : (addr.city || addr.country || '');
          
          setPlaces(prev => prev.map(item => item.id === p.id ? {
            ...item,
            latitude: parseFloat(result.lat) || '',
            longitude: parseFloat(result.lon) || '',
            address: result.display_name || '',
            target_location: locationString,
            status: 'completed',
            geocodeSuccess: true,
            geocodeLoading: false
          } : item));

          // Automatically fetch the photo
          fetchPhotoForPlace(p.id, p.name, parseFloat(result.lat) || null, parseFloat(result.lon) || null);
        } else {
          setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, geocodeLoading: false } : item));
        }
      } catch (err) {
        console.error('Batch item geocode failed', err);
        setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, geocodeLoading: false } : item));
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  // AI extraction for unresolved rows
  const handleExtractAI = async (singleRowId = null) => {
    let targetItems = [];
    if (singleRowId) {
      const item = places.find(p => p.id === singleRowId);
      if (item) targetItems = [item];
    } else {
      targetItems = places.filter(p => p.status !== 'completed');
    }

    if (targetItems.length === 0) {
      alert("No unresolved places to send.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/import/extract-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          places: targetItems,
          city,
          state: stateName,
          country,
          prompt: customPrompt
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI Extraction failed');
      }

      if (Array.isArray(data)) {
        setPlaces(prev => prev.map(item => {
          const match = data.find(m => m.id === item.id);
          if (match) {
            // Trigger photo fetching asynchronously!
            fetchPhotoForPlace(item.id, match.name || item.name, match.latitude || null, match.longitude || null);

            return {
              ...item,
              name: match.name || item.name,
              address: match.address || item.address || '',
              latitude: match.latitude || item.latitude || '',
              longitude: match.longitude || item.longitude || '',
              category: (item.category && item.category !== 'Attraction') ? item.category : (match.category || item.category || 'Attraction'),
              selectedTags: (item.selectedTags && item.selectedTags.length > 0) ? item.selectedTags : (match.selectedTags || []),
              description: match.description || item.description || '',
              status: 'completed',
              geocodeSuccess: true
            };
          }
          return item;
        }));
      }
    } catch (err) {
      console.error('AI Extraction failed', err);
      alert(`AI Extraction Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchMarkdown = async (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError(null);
 
    try {
      // URL duplicates check
      const allLocs = await db.locations.toArray();
      const alreadyImported = allLocs.some(loc => {
        if (!loc.source_urls) return false;
        try {
          const urls = JSON.parse(loc.source_urls);
          return Array.isArray(urls) && urls.includes(url);
        } catch (e) {
          return loc.source_urls === url;
        }
      });
      if (alreadyImported) {
        const proceed = window.confirm("This URL has already been imported. Would you like to import it again?");
        if (!proceed) {
          setLoading(false);
          return;
        }
      }
      const res = await fetch('/api/import/markdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url, scraper, imageDirection })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch markdown');
      }

      setMarkdown(data.markdown || '');
      
      const initialPlaces = (data.places || []).map(p => ({
        ...p,
        id: generateUUID(),
        status: 'pending'
      }));
      setPlaces(initialPlaces);

      // Save to saved_markdowns
      const newGuideId = generateUUID();
      setActiveGuideId(newGuideId);
      const cleanName = guideName || new URL(url).hostname || 'Saved Guide';
      
      const newGuide = {
        id: newGuideId,
        name: cleanName,
        url,
        content: data.markdown,
        status: 'pending'
      };

      // Save locally to IndexedDB immediately so Settings page sees it!
      await db.saved_markdowns.put(newGuide);

      // Save to server
      await fetch('/api/import/saved-markdowns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newGuide)
      });

      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseUp = (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text && text.length >= 3 && text.length <= 50) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const container = document.getElementById('markdown-viewer');
      if (container && container.contains(range.commonAncestorContainer)) {
        setSelectedText(text);
        setSelectionCoords({
          top: rect.top - 40,
          left: rect.left + (rect.width / 2) - 60
        });
        return;
      }
    }
    setSelectedText('');
    setSelectionCoords(null);
  };

  const handleExtractManual = () => {
    if (!selectedText) return;
    
    const textToExtract = toSentenceTitleCase(selectedText);
    setSelectedText('');
    setSelectionCoords(null);
    window.getSelection()?.removeAllRanges();
    
    setManualHighlights(prev => [...prev, textToExtract]);
    setToastMessage(`Added "${textToExtract}" to Curation Queue!`);
    setTimeout(() => setToastMessage(''), 2500);
 
    const newPlace = {
      id: generateUUID(),
      name: textToExtract,
      type: 'place',
      description: '',
      localImagePath: null,
      latitude: '',
      longitude: '',
      target_location: '',
      geocodeSuccess: false,
      originalHeading: textToExtract,
      status: 'pending'
    };
 
    setPlaces(prev => [newPlace, ...prev]);
  };
 
  const performManualSearch = async (id, query) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/import/geocode?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data && data.length > 0) {
        const result = data[0];
        let locationString = '';
        if (result.city && result.country) {
          locationString = `${result.city}, ${result.country}`;
        } else {
          locationString = result.city || result.country || '';
        }
 
        setPlaces(prev => prev.map(p => {
          if (p.id === id) {
            return {
              ...p,
              latitude: parseFloat(result.lat) || '',
              longitude: parseFloat(result.lon) || '',
              target_location: locationString,
              geocodeSuccess: true
            };
          }
          return p;
        }));
      }
    } catch (err) {
      console.error('Manual search failed', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveItem = async (p) => {
    setProcessingId(p.id);
    try {
      let locationId = null;
      let existingUrls = [];
      if (url) {
        existingUrls = [url];
      }

      const placeId = generateUUID();

      if (p.type === 'location') {
        // Save direct Location
        locationId = generateUUID();
        const parts = p.name.split(', ').map(s => s.trim());
        const country = parts[1] || '';
        await queueSyncAction('locations', 'insert', {
          id: locationId,
          name: p.name,
          state: '',
          country: country,
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
          visited: 0,
          notes: p.description || 'Auto-imported location',
          local_file_data: p.localImagePath || null,
          created_at: new Date().toISOString(),
          source_urls: JSON.stringify(existingUrls)
        });

        // Save selected tags
        if (p.selectedTags && p.selectedTags.length > 0) {
          for (const tId of p.selectedTags) {
            await queueSyncAction('entity_tags', 'insert', {
              entity_id: locationId,
              tag_id: tId
            });
          }
        }
      } else {
        // Saving a Place of Visit
        if (p.parentLocationId) {
          locationId = p.parentLocationId;
          const matchedLoc = locationsList.find(l => l.id === locationId);
          if (matchedLoc) {
            let currentUrls = [];
            if (matchedLoc.source_urls) {
              try {
                currentUrls = JSON.parse(matchedLoc.source_urls);
                if (!Array.isArray(currentUrls)) currentUrls = [];
              } catch (_) {
                if (typeof matchedLoc.source_urls === 'string') currentUrls = [matchedLoc.source_urls];
              }
            }
            if (url && !currentUrls.includes(url)) {
              currentUrls.push(url);
              await queueSyncAction('locations', 'update', {
                ...matchedLoc,
                source_urls: JSON.stringify(currentUrls),
                created_at: new Date().toISOString()
              });
            }
          }
        } else {
          alert('Please select an existing Location from the dropdown.');
          setProcessingId(null);
          return;
        }

        // Insert Place
        await queueSyncAction('places', 'insert', {
          id: placeId,
          location_id: locationId,
          name: p.name,
          category: p.category || 'Attraction',
          address: p.address || '',
          latitude: p.latitude ? parseFloat(p.latitude) : null,
          longitude: p.longitude ? parseFloat(p.longitude) : null,
          visited: 0,
          notes: p.description || '',
          local_file_data: p.localImagePath || null,
          created_at: new Date().toISOString()
        });
      }

      // Associate image link in entity_photos
      if (p.localImagePath) {
        await queueSyncAction('entity_photos', 'insert', {
          id: generateUUID(),
          entity_id: p.type === 'location' ? locationId : placeId,
          file_path: p.localImagePath,
          is_featured: 1,
          created_at: new Date().toISOString()
        });
      }
 
      // Remove from frontend view state
      setSavedItemIds(prev => [...prev, { id: p.type === 'location' ? locationId : placeId, type: p.type }]);
      setToastMessage(`Saved "${p.name}" successfully!`);
      setTimeout(() => setToastMessage(''), 2500);
      setPlaces(prev => {
        const next = prev.filter(item => item.id !== p.id);
        if (next.length === 0 && resumeMarkdown) {
          queueSyncAction('saved_markdowns', 'update', {
            ...resumeMarkdown,
            status: 'completed'
          }).catch(console.error);
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to save item', err);
      alert('Failed to save item');
    } finally {
      setProcessingId(null);
    }
  };

  const handleImportAll = async () => {
    // Validate first
    const missingParent = places.some(p => p.type === 'place' && !p.parentLocationId);
    if (missingParent) {
      alert("Please configure a parent location for all Place of Visit items before importing all.");
      return;
    }

    setLoading(true);
    let successCount = 0;
    const pendingItems = [...places];
    for (const place of pendingItems) {
      try {
        await handleSaveItem(place);
        successCount++;
      } catch (err) {
        console.error('Failed to import', place.name, err);
      }
    }
    const targetGuideId = activeGuideId || resumeMarkdown?.id;
    if (targetGuideId) {
      try {
        const guideRecord = await db.saved_markdowns.get(targetGuideId);
        if (guideRecord) {
          const updatedGuide = { ...guideRecord, status: 'completed' };
          await db.saved_markdowns.put(updatedGuide);
          await queueSyncAction('saved_markdowns', 'update', updatedGuide);
        }
      } catch (err) {
        console.error('Failed to update guide status to completed:', err);
      }
    }
    setLoading(false);
    alert(`Successfully imported ${successCount} items.`);
  };

  const handleFieldChange = (id, field, value) => {
    setPlaces(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleReject = (id) => {
    setPlaces(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' } : p));
  };

  const escapeHtml = (unsafe) => {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  };
  const renderMarkdownLines = () => {
    const lines = markdown.split('\n');
    return lines.map((line, idx) => {
      let htmlLine = escapeHtml(line);
      
      if (line.match(/^(#{1,6})\s+/)) {
        const headingText = line.replace(/^(#{1,6})\s+/, '').trim().toLowerCase();
        
        let cleanHeading = headingText.replace(/^(\d+[\.\-\s)]+\s*|\bStep\s+\d+[\.\-\s:]+\s*)/i, '').trim();
        cleanHeading = cleanHeading.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

        const isSaved = 
          savedPlaces.some(p => p.name.toLowerCase() === cleanHeading) || 
          savedLocations.some(l => l.name.toLowerCase() === cleanHeading);
        
        const placeInQueue = places.find(p => p.originalHeading && p.originalHeading.trim().toLowerCase() === headingText);
        
        if (isSaved) {
          htmlLine = `<span style="background-color: rgba(74, 222, 128, 0.4); color: #4ade80; padding: 2px 4px; border-radius: 4px;">${htmlLine} (Saved)</span>`;
        } else if (placeInQueue && placeInQueue.geocodeSuccess) {
          htmlLine = `<span style="background-color: rgba(74, 222, 128, 0.4); color: #4ade80; padding: 2px 4px; border-radius: 4px;">${htmlLine}</span>`;
        }
      }

      manualHighlights.forEach(hl => {
        if (hl && line.toLowerCase().includes(hl.toLowerCase())) {
          const cleanHl = hl.toLowerCase().trim();
          const isHlSaved = 
            savedPlaces.some(p => p.name.toLowerCase() === cleanHl) || 
            savedLocations.some(l => l.name.toLowerCase() === cleanHl);
          
          const escapedHl = escapeHtml(hl);
          const colorStyle = isHlSaved 
            ? 'background-color: rgba(74, 222, 128, 0.4); color: #4ade80;' 
            : 'background-color: rgba(56, 189, 248, 0.4); color: #38bdf8;';
          htmlLine = htmlLine.split(escapedHl).join(`<span style="${colorStyle} padding: 0 2px; border-radius: 2px;">${escapedHl}</span>`);
        }
      });

      return (
        <div key={idx} dangerouslySetInnerHTML={{ __html: htmlLine || '&nbsp;' }} style={{ minHeight: '1.2rem', whiteSpace: 'pre-wrap' }} />
      );
    });
  };

  if (step === 0) {
    return (
      <div className="modal-backdrop" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <div className="modal-content" style={{ maxWidth: '500px', width: '90%', margin: '0 auto' }}>
          <div className="dialog-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} style={{ color: 'var(--accent-primary)' }} />
              <h2 style={{ margin: 0 }}>Import Guide</h2>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleFetchMarkdown} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Enter the URL of a travel website or blog post to import its locations.
            </p>
            
            <div className="form-group">
              <label>Source URL</label>
              <input
                type="url"
                className="form-control"
                placeholder="https://example.com/best-places"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Import Scraper Service</label>
              <select className="form-control" value={scraper} onChange={(e) => setScraper(e.target.value)}>
                <option value="jina">Jina Reader (Markdown conversion)</option>
                <option value="cheerio">Cheerio Parser (Fast HTML parser)</option>
                <option value="playwright">Playwright (Headless JS browser)</option>
                <option value="firecrawl">Firecrawl (Advanced scraper API)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Image Association Direction</label>
              <select className="form-control" value={imageDirection} onChange={(e) => setImageDirection(e.target.value)}>
                <option value="below">Below Headings (Default)</option>
                <option value="above">Above Headings</option>
              </select>
            </div>

            <div className="form-group">
              <label>Guide Name (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="My travel itinerary name"
                value={guideName}
                onChange={(e) => setGuideName(e.target.value)}
              />
            </div>

            {error && <div style={{ color: 'var(--error)', fontSize: '0.85rem' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !url}>
                {loading ? (
                  <><Loader size={16} className="sync-spinner" /> Fetching...</>
                ) : (
                  'Import'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onMouseUp={handleMouseUp} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          padding: '8px 16px',
          backgroundColor: 'rgba(74, 222, 128, 0.95)',
          color: '#000',
          fontWeight: 'bold',
          borderRadius: '30px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.82rem'
        }}>
          ✅ {toastMessage}
        </div>
      )}
      {selectionCoords && selectedText && (
        <button 
          className="btn btn-primary"
          style={{
            position: 'fixed',
            top: selectionCoords.top,
            left: selectionCoords.left,
            zIndex: 9999,
            padding: '3px 8px',
            fontSize: '0.72rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            width: 'auto',
            minWidth: 'unset',
            minHeight: 'unset',
            height: '24px',
            borderRadius: '4px'
          }}
          onMouseDown={(e) => { e.preventDefault(); handleExtractManual(); }}
        >
          <Plus size={12} /> Add Item
        </button>
      )}

      <div className="modal-content" style={{ width: '95vw', height: '95vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div className="dialog-header" style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>Review Imports</h2>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ 
              padding: '4px 10px', 
              fontSize: '0.72rem', 
              height: '26px', 
              minHeight: 'unset', 
              width: '55px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontWeight: '600',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }} 
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', padding: '16px 24px' }}>
          {/* Tabs Navigation */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <button 
              className={`btn ${activeTab === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('markdown')}
            >
              Markdown Guide
            </button>
            <button 
              className={`btn ${activeTab === 'review-data' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('review-data')}
            >
              Review Data ({places.length})
            </button>
            <button 
              className={`btn ${activeTab === 'places' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('places')}
            >
              Places from this Guide ({savedLocations.length + savedPlaces.length})
            </button>
          </div>

          <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            {/* Tab 1: Markdown Viewer */}
            {activeTab === 'markdown' && (
              <div 
                id="markdown-viewer"
                style={{ 
                  width: '100%', 
                  padding: '24px', 
                  overflowY: 'auto', 
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-primary)',
                  borderRadius: '6px'
                }}
              >
                {renderMarkdownLines()}
              </div>
            )}

            {/* Tab 2: Review Data Table */}
            {activeTab === 'review-data' && (
              <div style={{ width: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.78rem' }}>
                
                {/* OSM Error Banner */}
                {osmError && (
                  <div style={{ padding: '10px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', color: '#ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚠️ {osmError}</span>
                    <button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setOsmError(null)}>X</button>
                  </div>
                )}

                {/* Top Location Filter Context & Bulk Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', backgroundColor: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', gap: '12px', flexGrow: 1, minWidth: '300px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>City</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)' }} 
                        placeholder="e.g. Paris"
                        value={city} 
                        onChange={(e) => setCity(e.target.value)} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>State</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)' }} 
                        placeholder="e.g. Île-de-France"
                        value={stateName} 
                        onChange={(e) => setStateName(e.target.value)} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Country</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)' }} 
                        placeholder="e.g. France"
                        value={country} 
                        onChange={(e) => setCountry(e.target.value)} 
                      />
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      className="btn" 
                      style={{ padding: '8px 16px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.4)', borderRadius: '4px' }}
                      onClick={handleGeocodeAllUnresolved}
                      title="Query OSM for all unresolved rows"
                    >
                      Get All Maps
                    </button>
                    <button 
                      className="btn" 
                      style={{ padding: '8px 16px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: '4px' }}
                      onClick={() => handleExtractAI(null)}
                      title="Analyze unresolved rows using AI"
                    >
                      Send All to AI
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '8px 12px', fontSize: '0.78rem', borderRadius: '4px' }}
                      onClick={() => setShowPromptConsole(!showPromptConsole)}
                    >
                      {showPromptConsole ? 'Hide Prompt' : 'Edit Prompt'}
                    </button>
                  </div>
                </div>

                {/* Collapsible Prompt Editor */}
                {showPromptConsole && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--bg-surface-elevated)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Custom Prompt Console</label>
                    <textarea 
                      className="form-control" 
                      style={{ padding: '8px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', height: '80px', fontFamily: 'monospace' }}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />
                  </div>
                )}

                {/* Curation Queue Table */}
                {places.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>No places in review queue. Highlight text in the Markdown Guide tab to add items manually.</p>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border-glass)', borderRadius: '6px', minHeight: '450px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-surface-elevated)' }}>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Image</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', minWidth: '150px' }}>Place</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', width: '130px' }}>Type</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', minWidth: '150px' }}>Tags/Category</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', minWidth: '200px' }}>Description</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', minWidth: '200px' }}>Address</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center', width: '110px' }}>Resolved Status</th>
                          <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center', width: '110px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {places.map((place) => {
                          const isResolved = place.status === 'completed';
                          return (
                            <tr key={place.id} style={{ borderBottom: '1px solid var(--border-glass)', backgroundColor: isResolved ? 'rgba(74, 222, 128, 0.03)' : 'var(--bg-surface)' }}>
                              
                              {/* Image column */}
                              <td style={{ padding: '10px' }}>
                                {place.localImagePath ? (
                                  <img 
                                    src={place.localImagePath} 
                                    alt="thumbnail" 
                                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-glass)' }} 
                                  />
                                ) : (
                                  <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-app)', borderRadius: '4px', border: '1px dotted var(--border-glass)', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '0.6rem', color: 'var(--text-muted)' }}>No Pic</div>
                                )}
                              </td>

                              {/* Place Name column */}
                              <td style={{ padding: '10px' }}>
                                <input 
                                  type="text" 
                                  className="form-control" 
                                  style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', width: '100%', border: '1px solid var(--border-glass)' }}
                                  value={place.name} 
                                  onChange={(e) => setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, name: e.target.value } : p))}
                                />
                              </td>

                              {/* Type selection column */}
                              <td style={{ padding: '10px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <select 
                                    className="form-control" 
                                    style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', width: '100%', border: '1px solid var(--border-glass)' }}
                                    value={place.type || 'place'}
                                    onChange={(e) => setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, type: e.target.value } : p))}
                                  >
                                    <option value="place">Place of Visit</option>
                                    <option value="location">Location</option>
                                  </select>
                                  
                                  {place.type === 'place' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <select 
                                        className="form-control" 
                                        style={{ 
                                          padding: '4px 8px', 
                                          fontSize: '0.75rem', 
                                          backgroundColor: 'var(--bg-app)', 
                                          width: '100%', 
                                          border: !place.parentLocationId ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--border-glass)',
                                          color: !place.parentLocationId ? '#ef4444' : 'var(--text-primary)'
                                        }}
                                        value={place.parentLocationId || ''}
                                        onChange={(e) => setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, parentLocationId: e.target.value } : p))}
                                      >
                                        <option value="">-- Parent Location --</option>
                                        {locationsList.map(l => (
                                          <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                      </select>
                                      {!place.parentLocationId && (
                                        <span style={{ fontSize: '0.62rem', color: '#ef4444', fontStyle: 'italic' }}>* Mandatory Location</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Tags/Category column */}
                              <td style={{ padding: '10px' }}>
                                {place.type === 'place' ? (
                                  <FilterableSelect
                                    value={place.category || 'Attraction'}
                                    placeholder="Select Category"
                                    options={
                                      customCategoriesList.length > 0 
                                        ? customCategoriesList.map(c => ({ id: c.name, name: c.name }))
                                        : [
                                            { id: 'Attraction', name: 'Attractions' },
                                            { id: 'Dining', name: 'Dining' },
                                            { id: 'Lodging', name: 'Lodging' },
                                            { id: 'Transit', name: 'Transit' },
                                            { id: 'Shopping', name: 'Shopping' }
                                          ]
                                    }
                                    onChange={(val) => setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, category: val } : p))}
                                  />
                                ) : (
                                  <FilterableSelect
                                    isMulti={true}
                                    activeValues={place.selectedTags || []}
                                    placeholder="Select Tags"
                                    options={tagsList.map(t => ({ id: t.id, name: t.name }))}
                                    onChange={(tagId) => {
                                      const currentTags = place.selectedTags || [];
                                      const nextTags = currentTags.includes(tagId)
                                        ? currentTags.filter(id => id !== tagId)
                                        : [...currentTags, tagId];
                                      setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, selectedTags: nextTags } : p));
                                    }}
                                  />
                                )}
                              </td>

                              {/* Description column */}
                              <td style={{ padding: '10px' }}>
                                <textarea 
                                  className="form-control" 
                                  rows={2}
                                  style={{ padding: '6px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-app)', width: '100%', resize: 'vertical', border: '1px solid var(--border-glass)' }}
                                  value={place.description} 
                                  onChange={(e) => setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, description: e.target.value } : p))}
                                />
                              </td>

                              {/* Address column */}
                              <td style={{ padding: '12px', color: place.address ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.72rem' }}>
                                {place.address || 'Unresolved'}
                              </td>

                              {/* Resolved Status column */}
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                <button 
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: isResolved ? 'var(--success)' : 'var(--error)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: isResolved ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextStatus = isResolved ? 'pending' : 'completed';
                                    setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, status: nextStatus } : p));
                                  }}
                                  title={isResolved ? "Click to manually mark as Unresolved" : "Click to manually mark as Resolved"}
                                >
                                  {isResolved ? <Check size={16} /> : <X size={16} />}
                                </button>
                              </td>

                              {/* Actions column */}
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button 
                                    style={{
                                      padding: '6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--bg-app)',
                                      border: '1px solid rgba(74, 222, 128, 0.4)',
                                      color: '#4ade80',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    onClick={() => handleSaveItem(place)}
                                    disabled={processingId === place.id}
                                    title="Accept and Save to Database"
                                  >
                                    <Save size={12} />
                                  </button>
                                  <button 
                                    style={{
                                      padding: '6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--bg-app)',
                                      border: '1px solid rgba(96, 165, 250, 0.4)',
                                      color: '#60a5fa',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    onClick={() => handleGeocodeRow(place.id)}
                                    disabled={place.geocodeLoading}
                                    title="Search Location on OpenStreetMap"
                                  >
                                    {place.geocodeLoading ? <Loader size={12} className="sync-spinner" /> : <MapPin size={12} />}
                                  </button>
                                  <button 
                                    style={{
                                      padding: '6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--bg-app)',
                                      border: '1px solid rgba(192, 132, 252, 0.4)',
                                      color: '#c084fc',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    onClick={() => handleExtractAI(place.id)}
                                    title="Analyze details with AI"
                                  >
                                    <Sparkles size={12} />
                                  </button>
                                  <button 
                                    style={{
                                      padding: '6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--bg-app)',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    onClick={() => setPlaces(prev => prev.filter(p => p.id !== place.id))}
                                    title="Delete item from queue"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Review Queue Card Grid (Repurposed for Saved Items View) */}
            {activeTab === 'places' && (
              <div style={{ width: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 'bold' }}>Places from this Guide</span>
                </div>

                {savedLocations.length === 0 && savedPlaces.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No items saved yet. Use the Save button in the "Review Data" tab to import places/locations.</p>
                ) : (
                  <div style={{ 
                     display: 'grid', 
                     gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', 
                     gap: '24px' 
                   }}>
                     {/* Saved Locations */}
                     {savedLocations.map((loc) => {
                       return (
                          <div 
                            key={loc.id} 
                            style={{ 
                              display: 'flex', 
                              backgroundColor: 'var(--bg-surface-elevated)', 
                              border: '1px solid var(--border-glass)', 
                              borderRadius: '8px', 
                              overflow: 'hidden',
                              fontSize: '0.78rem',
                              minHeight: '220px'
                            }}
                          >
                            {/* Left Column: Image Thumbnail */}
                            <div style={{ width: '130px', flexShrink: 0, backgroundColor: 'var(--bg-app)', position: 'relative' }}>
                              {loc.local_file_data ? (
                                <img 
                                  src={loc.local_file_data} 
                                  alt={loc.name} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: '6px', color: 'var(--text-muted)', fontSize: '0.65rem' }}>No Image</div>
                              )}
                            </div>

                            {/* Right Column: Read-only details */}
                            <div style={{ flexGrow: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: '600', textTransform: 'uppercase' }}>Location</span>
                                <span style={{ fontSize: '0.92rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{loc.name}</span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Coordinates</span>
                                <span style={{ color: 'var(--text-muted)' }}>Lat: {loc.latitude || 'N/A'}, Lon: {loc.longitude || 'N/A'}</span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Notes / Description</span>
                                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{loc.notes || 'No notes'}</span>
                              </div>
                            </div>
                          </div>
                        );
                     })}

                     {/* Saved Places */}
                      {savedPlaces.map((pl) => {
                        const parentName = locationsList.find(l => l.id === pl.location_id)?.name || 'Unknown Location';
                        return (
                          <div 
                            key={pl.id} 
                            style={{ 
                              display: 'flex', 
                              backgroundColor: 'var(--bg-surface-elevated)', 
                              border: '1px solid var(--border-glass)', 
                              borderRadius: '8px', 
                              overflow: 'hidden',
                              fontSize: '0.78rem',
                              minHeight: '220px'
                            }}
                          >
                            {/* Left Column: Image Thumbnail */}
                            <div style={{ width: '130px', flexShrink: 0, backgroundColor: 'var(--bg-app)', position: 'relative' }}>
                              {pl.local_file_data ? (
                                <img 
                                  src={pl.local_file_data} 
                                  alt={pl.name} 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: '6px', color: 'var(--text-muted)', fontSize: '0.65rem' }}>No Image</div>
                              )}
                            </div>

                            {/* Right Column: Read-only details */}
                            <div style={{ flexGrow: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--accent-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Place of Visit</span>
                                <span style={{ fontSize: '0.92rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{pl.name}</span>
                              </div>

                              <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Parent Location</span>
                                  <span style={{ color: 'var(--text-primary)' }}>{parentName}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Category</span>
                                  <span style={{ color: 'var(--text-primary)' }}>{pl.category || 'Attraction'}</span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Coordinates</span>
                                <span style={{ color: 'var(--text-muted)' }}>Lat: {pl.latitude || 'N/A'}, Lon: {pl.longitude || 'N/A'}</span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Address</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{pl.address || 'No address details'}</span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Notes / Description</span>
                                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{pl.notes || pl.description || 'No description'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                   </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

