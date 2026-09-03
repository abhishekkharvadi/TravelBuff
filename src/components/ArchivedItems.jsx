import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, populateLocalDb } from '../clientDb.js';
import { 
  Archive, 
  RotateCcw, 
  Trash2, 
  Folder, 
  MapPin, 
  Search, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight, 
  CheckSquare, 
  Square, 
  Layers, 
  HelpCircle,
  Image as ImageIcon,
  Check
} from 'lucide-react';

export default function ArchivedItems({ token, showToast = () => {}, onNavigate = () => {} }) {
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({});
  const [expandedLocs, setExpandedLocs] = useState({});
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set()); // item keys e.g. "loc:id", "place:id"

  const getAuthHeaders = () => {
    const activeToken = token || localStorage.getItem('tb_token');
    return {
      'Content-Type': 'application/json',
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
    };
  };

  const triggerRefresh = async () => {
    const activeToken = token || localStorage.getItem('tb_token');
    if (activeToken) await populateLocalDb(activeToken);
  };

  // Modal dialog states
  const [folderDeleteModal, setFolderDeleteModal] = useState(null); // folder obj
  const [locationDeleteModal, setLocationDeleteModal] = useState(null); // loc obj
  const [placeDeleteModal, setPlaceDeleteModal] = useState(null); // { place, activeTrips, completedTrips, loading }
  const [restorePlaceModal, setRestorePlaceModal] = useState(null); // { place, targetLocId }

  // Dexie live queries
  const allLocations = useLiveQuery(() => db.locations.toArray(), []) || [];
  const allPlaces = useLiveQuery(() => db.places.toArray(), []) || [];
  const allPhotos = useLiveQuery(() => db.entity_photos.toArray(), []) || [];
  const allTrips = useLiveQuery(() => db.trips.toArray(), []) || [];
  // Helper to check if item has a valid parent
  const hasParentId = (parentId) => {
    return parentId !== null && parentId !== undefined && parentId !== '' && parentId !== 'null' && parentId !== 'undefined';
  };

  // Active locations for re-assigning orphaned places upon restore
  const activeLocations = allLocations.filter(l => Number(l.is_archived) !== 1 && Number(l.is_folder) !== 1);

  // Filter archived entities
  const archivedLocations = allLocations.filter(l => Number(l.is_archived) === 1);
  const archivedPlaces = allPlaces.filter(p => Number(p.is_archived) === 1);

  // All archived folders:
  const archivedFolders = archivedLocations.filter(l => Number(l.is_folder) === 1 || l.is_folder === true || l.is_folder === '1');

  // Root archived folders (not nested inside another archived folder)
  const rootArchivedFolders = archivedFolders.filter(f => !hasParentId(f.parent_id) || !archivedFolders.some(p => String(p.id) === String(f.parent_id)));

  // Top-level archived locations (locations that are NOT folders, and not inside any archived folder)
  const topLevelArchivedLocs = archivedLocations.filter(l => {
    const isFolder = Number(l.is_folder) === 1 || l.is_folder === true || l.is_folder === '1';
    if (isFolder) return false;
    const hasArchivedParentFolder = hasParentId(l.parent_id) && archivedFolders.some(f => String(f.id) === String(l.parent_id));
    return !hasArchivedParentFolder;
  });

  // Orphaned places: places archived individually, or places whose parent location is deleted / not archived
  const orphanedPlaces = archivedPlaces.filter(p => {
    if (!p.location_id || p.location_id === '__orphaned__' || p.location_id === 'null' || p.location_id === 'undefined') return true;
    const parentLoc = allLocations.find(l => String(l.id) === String(p.location_id));
    return !parentLoc || Number(parentLoc.is_archived) !== 1;
  });

  // Filtered queries based on search
  const matchesSearch = (text) => {
    if (!search.trim()) return true;
    return (text || '').toLowerCase().includes(search.toLowerCase().trim());
  };

  const toggleFolderExpand = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const toggleLocExpand = (locId) => {
    setExpandedLocs(prev => ({ ...prev, [locId]: !prev[locId] }));
  };

  const toggleSelectItem = (key) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size > 0) {
      setSelectedItems(new Set());
    } else {
      const allKeys = new Set();
      archivedLocations.forEach(l => allKeys.add(`loc:${l.id}`));
      archivedPlaces.forEach(p => allKeys.add(`place:${p.id}`));
      setSelectedItems(allKeys);
    }
  };

  // Restoration Handlers
  const handleRestoreFolder = async (folder) => {
    try {
      const res = await fetch(`/api/locations/${folder.id}/unarchive`, {
        method: 'PUT',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await triggerRefresh();
        showToast(`Restored "${folder.name}" and all contents to active views.`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error restoring folder: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error restoring folder: ${err.message}`, 'error');
    }
  };

  const handleRestoreLocation = async (loc) => {
    try {
      const res = await fetch(`/api/locations/${loc.id}/unarchive`, {
        method: 'PUT',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await triggerRefresh();
        showToast(`Restored "${loc.name}" to active locations.`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error restoring location: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error restoring location: ${err.message}`, 'error');
    }
  };

  const handleRestorePlace = async (place) => {
    const parentLoc = allLocations.find(l => l.id === place.location_id && !l.is_archived);
    if (parentLoc) {
      try {
        const res = await fetch(`/api/places/${place.id}/unarchive`, {
          method: 'PUT',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          await triggerRefresh();
          showToast(`Restored "${place.name}" under ${parentLoc.name}.`);
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(`Error restoring place: ${err.error || res.statusText}`, 'error');
        }
      } catch (err) {
        showToast(`Error restoring place: ${err.message}`, 'error');
      }
    } else {
      if (activeLocations.length === 0) {
        showToast('Please create an active location first before restoring this place.', 'error');
        return;
      }
      setRestorePlaceModal({ place, targetLocId: activeLocations[0]?.id || '' });
    }
  };

  const confirmRestoreOrphanedPlace = async () => {
    if (!restorePlaceModal || !restorePlaceModal.targetLocId) return;
    try {
      const res = await fetch(`/api/places/${restorePlaceModal.place.id}/unarchive`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ location_id: restorePlaceModal.targetLocId })
      });
      if (res.ok) {
        await triggerRefresh();
        const targetLoc = activeLocations.find(l => l.id === restorePlaceModal.targetLocId);
        showToast(`Restored "${restorePlaceModal.place.name}" under ${targetLoc ? targetLoc.name : 'selected location'}.`);
        setRestorePlaceModal(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error restoring place: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error restoring place: ${err.message}`, 'error');
    }
  };

  // Deletion Modals Handlers
  const openDeleteFolderModal = (folder) => {
    setFolderDeleteModal(folder);
  };

  const confirmDeleteFolder = async (retainLocations) => {
    if (!folderDeleteModal) return;
    try {
      const res = await fetch(`/api/archived/folders/${folderDeleteModal.id}?retainLocations=${retainLocations}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await triggerRefresh();
        showToast(retainLocations 
          ? `Deleted folder "${folderDeleteModal.name}". Locations retained at top-level.` 
          : `Permanently deleted folder "${folderDeleteModal.name}" and all contents.`
        );
        setFolderDeleteModal(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error deleting folder: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error deleting folder: ${err.message}`, 'error');
    }
  };

  const openDeleteLocationModal = (loc) => {
    setLocationDeleteModal(loc);
  };

  const confirmDeleteLocation = async (retainPlaces) => {
    if (!locationDeleteModal) return;
    try {
      const res = await fetch(`/api/archived/locations/${locationDeleteModal.id}?retainPlaces=${retainPlaces}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await triggerRefresh();
        showToast(retainPlaces 
          ? `Deleted location "${locationDeleteModal.name}". Places preserved in Orphaned Places.` 
          : `Permanently deleted location "${locationDeleteModal.name}" and all places.`
        );
        setLocationDeleteModal(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error deleting location: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error deleting location: ${err.message}`, 'error');
    }
  };

  const openDeletePlaceModal = async (place) => {
    const itemsWithPlace = allItineraries.filter(i => String(i.place_id) === String(place.id));
    const activeTripIds = new Set(allTrips.filter(t => !t.visited).map(t => String(t.id)));
    const completedTripIds = new Set(allTrips.filter(t => t.visited === 1).map(t => String(t.id)));

    const activeTrips = itemsWithPlace
      .filter(i => activeTripIds.has(String(i.trip_id)))
      .map(i => {
        const trip = allTrips.find(t => String(t.id) === String(i.trip_id));
        return { tripName: trip?.name || 'Upcoming Trip', date: i.date };
      });

    const completedTrips = itemsWithPlace
      .filter(i => completedTripIds.has(String(i.trip_id)))
      .map(i => {
        const trip = allTrips.find(t => String(t.id) === String(i.trip_id));
        return { tripName: trip?.name || 'Completed Trip', date: i.date };
      });

    setPlaceDeleteModal({
      place,
      activeTrips,
      completedTrips
    });
  };

  const confirmDeletePlace = async () => {
    if (!placeDeleteModal) return;
    try {
      const res = await fetch(`/api/archived/places/${placeDeleteModal.place.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await triggerRefresh();
        showToast(`Permanently deleted "${placeDeleteModal.place.name}". Completed trips preserved.`);
        setPlaceDeleteModal(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error deleting place: ${err.error || res.statusText}`, 'error');
      }
    } catch (err) {
      showToast(`Error deleting place: ${err.message}`, 'error');
    }
  };

  // Bulk Handlers
  const handleBulkRestore = async () => {
    const locIds = [];
    const placeIds = [];
    selectedItems.forEach(key => {
      if (key.startsWith('loc:')) locIds.push(key.replace('loc:', ''));
      if (key.startsWith('place:')) placeIds.push(key.replace('place:', ''));
    });

    try {
      if (locIds.length > 0) {
        const res = await fetch('/api/locations/bulk-unarchive', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ids: locIds })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
      }
      if (placeIds.length > 0) {
        const res = await fetch('/api/places/bulk-unarchive', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ids: placeIds })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
      }
      await triggerRefresh();
      showToast(`Restored ${locIds.length + placeIds.length} items.`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    } catch (err) {
      showToast(`Error in bulk restore: ${err.message}`, 'error');
    }
  };

  const handleBulkDelete = async () => {
    const locIds = [];
    const placeIds = [];
    selectedItems.forEach(key => {
      if (key.startsWith('loc:')) locIds.push(key.replace('loc:', ''));
      if (key.startsWith('place:')) placeIds.push(key.replace('place:', ''));
    });

    if (window.confirm(`Permanently delete ${locIds.length + placeIds.length} selected archived items? This cannot be undone.`)) {
      try {
        const res = await fetch('/api/archived/bulk-delete', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ locationIds: locIds, placeIds: placeIds })
        });
        if (res.ok) {
          await triggerRefresh();
          showToast(`Permanently deleted ${locIds.length + placeIds.length} items.`);
          setSelectedItems(new Set());
          setIsSelectMode(false);
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(`Error in bulk delete: ${err.error || res.statusText}`, 'error');
        }
      } catch (err) {
        showToast(`Error in bulk delete: ${err.message}`, 'error');
      }
    }
  };

  const totalArchivedCount = archivedLocations.length + archivedPlaces.length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', color: 'var(--text-main)' }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-glass)',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#eab308',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Archive size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Archived Items</h2>
              <span style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                padding: '2px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-muted)'
              }}>
                {totalArchivedCount} items
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Archived locations and places are hidden from the active map and lists. Restore or permanently delete them below.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              if (isSelectMode) setSelectedItems(new Set());
            }}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '0.85rem',
              borderRadius: '10px',
              background: isSelectMode ? 'var(--primary-color)' : 'var(--bg-card)',
              color: isSelectMode ? '#fff' : 'var(--text-main)',
              border: '1px solid var(--border-glass)'
            }}
          >
            <CheckSquare size={16} />
            {isSelectMode ? 'Cancel Selection' : 'Select Items'}
          </button>
        </div>
      </div>

      {/* Select Mode Bar */}
      {isSelectMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleSelectAll}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.8rem', borderRadius: '6px' }}
            >
              {selectedItems.size > 0 ? 'Deselect All' : 'Select All'}
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {selectedItems.size} selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleBulkRestore}
              disabled={selectedItems.size === 0}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                opacity: selectedItems.size === 0 ? 0.5 : 1
              }}
            >
              <RotateCcw size={14} />
              Restore Selected
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={selectedItems.size === 0}
              className="btn btn-danger"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                opacity: selectedItems.size === 0 ? 0.5 : 1
              }}
            >
              <Trash2 size={14} />
              Permanently Delete
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="form-control"
          placeholder="Search archived folders, locations, or places..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            paddingLeft: '40px',
            height: '42px',
            borderRadius: '12px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            fontSize: '0.9rem',
            color: 'var(--text-main)',
            width: '100%'
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {totalArchivedCount === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-glass)',
          borderRadius: '16px'
        }}>
          <Archive size={48} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem' }}>No Archived Items</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            When you archive folders, locations, or places from the main list, they will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          
          {/* SECTION 1: ARCHIVED FOLDERS & LOCATIONS */}
          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Folder size={20} style={{ color: 'var(--primary-color)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Archived Folders & Locations</h3>
            </div>

            {rootArchivedFolders.length === 0 && topLevelArchivedLocs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', margin: '8px 0' }}>
                No archived folders or locations.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Render Folders */}
                {rootArchivedFolders.filter(f => matchesSearch(f.name)).map(folder => {
                  const isExpanded = expandedFolders[folder.id];
                  const childLocs = archivedLocations.filter(l => Number(l.is_folder) !== 1 && String(l.parent_id) === String(folder.id));
                  const directPlaces = allPlaces.filter(p => String(p.location_id) === String(folder.id));
                  const isSelected = selectedItems.has(`loc:${folder.id}`);

                  // Calculate total places across all child locations + direct places
                  let totalPlacesCount = directPlaces.length;
                  childLocs.forEach(cl => {
                    totalPlacesCount += allPlaces.filter(p => String(p.location_id) === String(cl.id)).length;
                  });

                  // Build text contents summary
                  const summaryParts = [];
                  childLocs.forEach(cl => {
                    const pCount = allPlaces.filter(p => String(p.location_id) === String(cl.id)).length;
                    summaryParts.push(`${cl.name}${pCount > 0 ? ` (${pCount} places)` : ''}`);
                  });
                  if (directPlaces.length > 0) {
                    summaryParts.push(`${directPlaces.length} direct place${directPlaces.length > 1 ? 's' : ''}`);
                  }
                  const contentsText = summaryParts.length > 0 
                    ? summaryParts.join(', ') 
                    : 'Empty folder (no locations or places inside)';

                  return (
                    <div
                      key={folder.id}
                      style={{
                        border: '1px solid var(--border-glass)',
                        borderRadius: '12px',
                        background: 'var(--bg-card)',
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderBottom: isExpanded ? '1px solid var(--border-glass)' : 'none',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexGrow: 1 }}>
                          {isSelectMode && (
                            <div 
                              onClick={() => toggleSelectItem(`loc:${folder.id}`)}
                              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', paddingTop: '4px' }}
                            >
                              {isSelected ? <CheckSquare size={18} color="var(--primary-color)" /> : <Square size={18} color="var(--text-muted)" />}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => toggleFolderExpand(folder.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <Folder size={18} style={{ color: '#eab308' }} />
                                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{folder.name}</span>
                              </button>
                              <span style={{ fontSize: '0.75rem', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                                {childLocs.length} location{childLocs.length !== 1 ? 's' : ''} • {totalPlacesCount} place{totalPlacesCount !== 1 ? 's' : ''}
                              </span>
                            </div>

                            {/* Text Contents Summary Line */}
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingLeft: '24px', lineHeight: '1.4' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Contents: </span>
                              <span>{contentsText}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleRestoreFolder(folder)}
                            className="btn btn-secondary"
                            title="Restore Folder and its locations"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                          >
                            <RotateCcw size={14} />
                            Restore
                          </button>
                          <button
                            onClick={() => openDeleteFolderModal(folder)}
                            className="btn btn-danger"
                            title="Permanently Delete Folder"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Nested Contents inside Folder */}
                      {isExpanded && (
                        <div style={{ padding: '14px 16px 14px 36px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0, 0, 0, 0.12)' }}>
                          {/* Direct Places attached to folder */}
                          {directPlaces.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Direct Places in Folder:</span>
                              {directPlaces.map(dp => (
                                <div
                                  key={dp.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'var(--bg-app)',
                                    border: '1px solid var(--border-glass)'
                                  }}
                                >
                                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>📍 {dp.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({dp.category || 'Place'})</span></span>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleRestorePlace(dp)} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '6px' }}>Restore</button>
                                    <button onClick={() => openDeletePlaceModal(dp)} className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '6px' }}>Delete</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Child Locations */}
                          {childLocs.length === 0 && directPlaces.length === 0 ? (
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>This folder is empty.</p>
                          ) : (
                            childLocs.map(loc => (
                              <ArchivedLocationCard
                                key={loc.id}
                                loc={loc}
                                allPlaces={allPlaces}
                                allPhotos={allPhotos}
                                isSelectMode={isSelectMode}
                                isSelected={selectedItems.has(`loc:${loc.id}`)}
                                onToggleSelect={() => toggleSelectItem(`loc:${loc.id}`)}
                                onRestore={() => handleRestoreLocation(loc)}
                                onDelete={() => openDeleteLocationModal(loc)}
                                isExpanded={expandedLocs[loc.id]}
                                onToggleExpand={() => toggleLocExpand(loc.id)}
                                onRestorePlace={handleRestorePlace}
                                onDeletePlace={openDeletePlaceModal}
                                selectedItems={selectedItems}
                                toggleSelectItem={toggleSelectItem}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Render Top-level Locations */}
                {topLevelArchivedLocs.filter(l => matchesSearch(l.name)).map(loc => (
                  <ArchivedLocationCard
                    key={loc.id}
                    loc={loc}
                    allPlaces={allPlaces}
                    allPhotos={allPhotos}
                    isSelectMode={isSelectMode}
                    isSelected={selectedItems.has(`loc:${loc.id}`)}
                    onToggleSelect={() => toggleSelectItem(`loc:${loc.id}`)}
                    onRestore={() => handleRestoreLocation(loc)}
                    onDelete={() => openDeleteLocationModal(loc)}
                    isExpanded={expandedLocs[loc.id]}
                    onToggleExpand={() => toggleLocExpand(loc.id)}
                    onRestorePlace={handleRestorePlace}
                    onDeletePlace={openDeletePlaceModal}
                    selectedItems={selectedItems}
                    toggleSelectItem={toggleSelectItem}
                  />
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: ORPHANED PLACES OF VISIT */}
          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} style={{ color: '#ec4899' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Orphaned Places of Visit</h3>
                <span style={{ fontSize: '0.8rem', background: 'var(--bg-app)', padding: '2px 8px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                  {orphanedPlaces.length} places
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Places archived individually or preserved from deleted locations
              </span>
            </div>

            {orphanedPlaces.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                No orphaned places of visit.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {orphanedPlaces.filter(p => matchesSearch(p.name)).map(place => {
                  const isSelected = selectedItems.has(`place:${place.id}`);
                  const photo = allPhotos.find(ph => ph.entity_id === place.id);

                  return (
                    <div
                      key={place.id}
                      style={{
                        border: '1px solid var(--border-glass)',
                        borderRadius: '12px',
                        background: 'var(--bg-card)',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        {isSelectMode && (
                          <div
                            onClick={() => toggleSelectItem(`place:${place.id}`)}
                            style={{ cursor: 'pointer', paddingTop: '2px' }}
                          >
                            {isSelected ? <CheckSquare size={16} color="var(--primary-color)" /> : <Square size={16} color="var(--text-muted)" />}
                          </div>
                        )}
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          background: 'rgba(236, 72, 153, 0.12)',
                          color: '#ec4899',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden'
                        }}>
                          {photo?.file_path ? (
                            <img src={photo.file_path} alt={place.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <MapPin size={20} />
                          )}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {place.name}
                          </h4>
                          <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                            {place.category || 'Place'}
                          </span>
                          {place.notes && (
                            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {place.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                        <button
                          onClick={() => handleRestorePlace(place)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                        >
                          <RotateCcw size={12} />
                          Restore
                        </button>
                        <button
                          onClick={() => openDeletePlaceModal(place)}
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: DELETE FOLDER MODAL */}
      {folderDeleteModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#ef4444' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Delete Archived Folder</h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              How would you like to delete the folder <strong>"{folderDeleteModal.name}"</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => confirmDeleteFolder(true)}
                className="btn btn-secondary"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  border: '1px solid var(--border-glass)'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  1. Delete Folder only (Retain Locations)
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Locations inside this folder will remain archived as top-level items.
                </span>
              </button>

              <button
                onClick={() => confirmDeleteFolder(false)}
                className="btn btn-danger"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  2. Permanently Delete Folder & All Contents
                </span>
                <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                  Permanently deletes the folder, child locations, and all places inside them.
                </span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFolderDeleteModal(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DELETE LOCATION MODAL */}
      {locationDeleteModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#ef4444' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Delete Archived Location</h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              How would you like to delete the location <strong>"{locationDeleteModal.name}"</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => confirmDeleteLocation(true)}
                className="btn btn-secondary"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  border: '1px solid var(--border-glass)'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  1. Delete Location (Retain Places of Visit)
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Preserves all places inside this location and moves them to "Orphaned Places of Visit".
                </span>
              </button>

              <button
                onClick={() => confirmDeleteLocation(false)}
                className="btn btn-danger"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  2. Permanently Delete Location & All Places
                </span>
                <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                  Permanently deletes the location and all places within it.
                </span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLocationDeleteModal(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE PLACE / TRIP PRE-DELETE WARNING */}
      {placeDeleteModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#ef4444' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Permanently Delete Place</h3>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Are you sure you want to permanently delete <strong>"{placeDeleteModal.place.name}"</strong>?
            </p>

            {/* Incomplete Trip Warning */}
            {placeDeleteModal.activeTrips && placeDeleteModal.activeTrips.length > 0 && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                  <AlertTriangle size={16} />
                  <span>Scheduled in Active Trips!</span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  This place is currently scheduled in <strong>{placeDeleteModal.activeTrips.length} upcoming trip(s)</strong>:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {placeDeleteModal.activeTrips.map((at, idx) => (
                    <li key={idx}><strong>{at.tripName}</strong> ({at.date})</li>
                  ))}
                </ul>
                <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#ef4444' }}>
                  Deleting this place will remove it from these upcoming itineraries.
                </p>
              </div>
            )}

            {/* Completed Trips Safety Notice */}
            {placeDeleteModal.completedTrips && placeDeleteModal.completedTrips.length > 0 && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600, fontSize: '0.82rem' }}>
                  <Check size={14} />
                  <span>Completed Trips History Protected</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  This place was part of {placeDeleteModal.completedTrips.length} completed trip(s). Completed itineraries and journals will remain intact with frozen place notes.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setPlaceDeleteModal(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePlace}
                className="btn btn-danger"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: RESTORE ORPHANED PLACE MODAL */}
      {restorePlaceModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem' }}>Restore Place of Visit</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Choose which active location to place <strong>"{restorePlaceModal.place.name}"</strong> into:
            </p>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>Target Location:</label>
              <select
                className="form-control"
                value={restorePlaceModal.targetLocId}
                onChange={(e) => setRestorePlaceModal(prev => ({ ...prev, targetLocId: e.target.value }))}
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: '8px',
                  background: 'var(--bg-app)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-glass)'
                }}
              >
                {activeLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name} {loc.country ? `(${loc.country})` : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRestorePlaceModal(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRestoreOrphanedPlace}
                className="btn btn-primary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Restore Place
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for Location cards in Archive view
function ArchivedLocationCard({
  loc,
  allPlaces,
  allPhotos,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
  isExpanded,
  onToggleExpand,
  onRestorePlace,
  onDeletePlace,
  selectedItems,
  toggleSelectItem
}) {
  const childPlaces = allPlaces.filter(p => String(p.location_id) === String(loc.id));
  const photo = allPhotos.find(p => String(p.entity_id) === String(loc.id));
  const placeNamesPreview = childPlaces.map(p => p.name).slice(0, 4).join(', ') + (childPlaces.length > 4 ? ` +${childPlaces.length - 4} more` : '');

  return (
    <div style={{
      border: '1px solid var(--border-glass)',
      borderRadius: '12px',
      background: 'var(--bg-card)',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: isExpanded ? '1px solid var(--border-glass)' : 'none',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexGrow: 1 }}>
          {isSelectMode && (
            <div onClick={onToggleSelect} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', paddingTop: '3px' }}>
              {isSelected ? <CheckSquare size={18} color="var(--primary-color)" /> : <Square size={18} color="var(--text-muted)" />}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexGrow: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={onToggleExpand}
                style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <MapPin size={18} style={{ color: 'var(--primary-color)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{loc.name}</span>
              </button>
              {loc.country && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>• {loc.country}</span>
              )}
              <span style={{ fontSize: '0.75rem', background: 'var(--bg-app)', padding: '2px 8px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                {childPlaces.length} place{childPlaces.length !== 1 ? 's' : ''}
              </span>
            </div>
            {childPlaces.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '24px', lineHeight: '1.3' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Places: </span>
                <span>{placeNamesPreview}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={onRestore}
            className="btn btn-secondary"
            title="Restore Location and child places"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            <RotateCcw size={14} />
            Restore
          </button>
          <button
            onClick={onDelete}
            className="btn btn-danger"
            title="Permanently Delete Location"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '12px 16px 12px 36px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {childPlaces.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No places of visit inside this location.</p>
          ) : (
            childPlaces.map(place => {
              const isPlaceSelected = selectedItems.has(`place:${place.id}`);
              return (
                <div
                  key={place.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-glass)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isSelectMode && (
                      <div onClick={() => toggleSelectItem(`place:${place.id}`)} style={{ cursor: 'pointer' }}>
                        {isPlaceSelected ? <CheckSquare size={16} color="var(--primary-color)" /> : <Square size={16} color="var(--text-muted)" />}
                      </div>
                    )}
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{place.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({place.category || 'Place'})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => onRestorePlace(place)}
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => onDeletePlace(place)}
                      className="btn btn-danger"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.65)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '16px'
};

const modalContentStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-glass)',
  borderRadius: '16px',
  padding: '24px',
  maxWidth: '480px',
  width: '100%',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
  color: 'var(--text-main)'
};
