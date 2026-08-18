import React, { useState, useMemo } from 'react';
import { Folder, FolderPlus, Search, X, Check, ArrowRight } from 'lucide-react';

export default function MoveToFolderModal({
  isOpen,
  onClose,
  movingLocations = [],
  locations = [],
  onMove,
  onOpenAddFolder
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('__UNSELECTED__');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate moving IDs and their descendant tree to prevent circular references
  const movingIds = useMemo(() => new Set(movingLocations.map(l => l.id)), [movingLocations]);

  const invalidTargetIds = useMemo(() => {
    const invalid = new Set(movingIds);
    
    // Find all recursive descendants of any moving folder
    const findDescendants = (parentId) => {
      const children = locations.filter(l => l.parent_id && String(l.parent_id) === String(parentId));
      for (const child of children) {
        invalid.add(child.id);
        if (child.is_folder === 1) {
          findDescendants(child.id);
        }
      }
    };

    movingLocations.forEach(loc => {
      if (loc.is_folder === 1) {
        findDescendants(loc.id);
      }
    });

    return invalid;
  }, [movingIds, movingLocations, locations]);

  // Helper to build hierarchical breadcrumb path for a folder
  const getFolderPath = (folder) => {
    const path = [folder.name];
    let current = folder;
    let depth = 0;
    while (current.parent_id && depth < 20) {
      const parent = locations.find(l => l.id === current.parent_id);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
      depth++;
    }
    return path.join(' > ');
  };

  // Get all valid folders
  const allFolders = useMemo(() => {
    return locations
      .filter(l => l.is_folder === 1)
      .map(folder => ({
        ...folder,
        fullPath: getFolderPath(folder),
        childCount: locations.filter(l => l.parent_id === folder.id).length,
        isInvalid: invalidTargetIds.has(folder.id)
      }))
      .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  }, [locations, invalidTargetIds]);

  // Filter folders by search query
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return allFolders;
    const q = searchQuery.toLowerCase();
    return allFolders.filter(f => 
      f.name.toLowerCase().includes(q) || f.fullPath.toLowerCase().includes(q)
    );
  }, [allFolders, searchQuery]);

  if (!isOpen || movingLocations.length === 0) return null;

  const isSingle = movingLocations.length === 1;
  const singleLoc = isSingle ? movingLocations[0] : null;
  const currentParentId = singleLoc ? singleLoc.parent_id || null : undefined;

  const handleConfirmMove = async () => {
    if (selectedFolderId === '__UNSELECTED__') return;
    setIsSubmitting(true);
    try {
      const targetId = selectedFolderId === '__ROOT__' ? null : selectedFolderId;
      await onMove(targetId);
      onClose();
    } catch (err) {
      console.error('Failed to move locations:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1100,
      padding: '20px',
      backdropFilter: 'blur(6px)'
    }}>
      <div className="login-card" style={{
        maxWidth: '540px',
        width: '100%',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: '85vh',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Move {isSingle ? `"${singleLoc.name}"` : `${movingLocations.length} locations`}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Select a destination folder or move to top level.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar (Wide) & Compact New Folder Button */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
          <div className="search-input-wrapper" style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search destination folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '8px 32px 8px 12px', height: '36px', width: '100%' }}
            />
            {searchQuery && (
              <button 
                type="button" 
                className="search-clear-btn" 
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (onOpenAddFolder) {
                onOpenAddFolder(movingLocations);
              }
            }}
            style={{
              fontSize: '0.8rem',
              height: '36px',
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              width: 'auto'
            }}
            title="Create a new folder and move selection into it"
          >
            <FolderPlus size={15} />
            <span>New Folder</span>
          </button>
        </div>

        {/* Folder List Scroll Area */}
        <div style={{
          overflowY: 'auto',
          maxHeight: '320px',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-surface)'
        }}>
          {/* Option: Root / Top Level */}
          <div
            onClick={() => setSelectedFolderId('__ROOT__')}
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-glass)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: selectedFolderId === '__ROOT__' 
                ? 'rgba(99, 102, 241, 0.15)' 
                : 'transparent',
              transition: 'background 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>🏠</span>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Top Level / Root
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  No folder (main locations list)
                </div>
              </div>
            </div>
            {isSingle && !currentParentId && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>
                Current
              </span>
            )}
            {selectedFolderId === '__ROOT__' && (
              <Check size={16} style={{ color: 'var(--accent-primary)' }} />
            )}
          </div>

          {/* Folder Options */}
          {filteredFolders.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {allFolders.length === 0 ? 'No custom folders created yet. Click "+ New Folder" above to create one.' : 'No matching folders found.'}
            </div>
          ) : (
            filteredFolders.map(folder => {
              const isSelected = selectedFolderId === folder.id;
              const isCurrent = isSingle && currentParentId === folder.id;

              return (
                <div
                  key={folder.id}
                  onClick={() => {
                    if (folder.isInvalid) return;
                    setSelectedFolderId(folder.id);
                  }}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-glass)',
                    cursor: folder.isInvalid ? 'not-allowed' : 'pointer',
                    opacity: folder.isInvalid ? 0.45 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected 
                      ? 'rgba(99, 102, 241, 0.15)' 
                      : 'transparent',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Folder size={18} style={{ color: 'var(--accent-secondary, #06b6d4)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {folder.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {folder.fullPath} • {folder.childCount} item{folder.childCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {folder.isInvalid && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--error, #ef4444)' }}>
                        Invalid destination
                      </span>
                    )}
                    {isCurrent && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>
                        Current
                      </span>
                    )}
                    {isSelected && (
                      <Check size={16} style={{ color: 'var(--accent-primary)' }} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selectedFolderId === '__UNSELECTED__' || isSubmitting}
            onClick={handleConfirmMove}
            style={{
              padding: '8px 20px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Move Here</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
