import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../clientDb.js';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, MapPin, Compass, ClipboardList, Settings, X, ExternalLink, Award } from 'lucide-react';

export default function OnboardingChecklist({ onOpenTour, onNavigateTab, onOpenImport, isVisible, onClose, userId }) {
  // Dexie live queries for dynamic reactive milestone tracking
  const locationsCount = useLiveQuery(() => db.locations ? db.locations.count() : 0, []) || 0;
  const customCollectionsCount = useLiveQuery(async () => {
    try {
      if (!db.collections) return 0;
      const cols = await db.collections.toArray();
      return cols.filter(c => !c.isSystem && !c.id?.startsWith('system-')).length;
    } catch (_) {
      return 0;
    }
  }, []) || 0;
  const markdownsCount = useLiveQuery(() => db.saved_markdowns ? db.saved_markdowns.count() : 0, []) || 0;
  const tripsCount = useLiveQuery(() => db.trips ? db.trips.count() : 0, []) || 0;
  const homeAddressesCount = useLiveQuery(() => db.user_addresses ? db.user_addresses.count() : 0, []) || 0;

  const collapsedKey = userId ? `tb_checklist_collapsed_${userId}` : 'tb_checklist_collapsed';

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(collapsedKey) === 'true';
  });

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(collapsedKey) === 'true');
  }, [userId, collapsedKey]);

  const [hasCelebrated, setHasCelebrated] = useState(false);

  const tasks = [
    {
      id: 'task-location',
      title: 'Add your first Location or Folder',
      description: 'Create a country/city folder or destination spot with coordinates.',
      icon: MapPin,
      isCompleted: locationsCount > 0,
      actionText: 'Add Location',
      onAction: () => onNavigateTab && onNavigateTab('locations')
    },
    {
      id: 'task-collection',
      title: 'Create a Collection',
      description: 'Group spots thematically across trips using manual or auto-group rules.',
      icon: Compass,
      isCompleted: customCollectionsCount > 0,
      actionText: 'Create Collection',
      onAction: () => onNavigateTab && onNavigateTab('collections')
    },
    {
      id: 'task-import',
      title: 'Import a Guide (URL or PDF)',
      description: 'Convert a web article or travel PDF into structured places.',
      icon: Sparkles,
      isCompleted: markdownsCount > 0,
      actionText: 'Import Guide',
      onAction: () => onOpenImport && onOpenImport('url')
    },
    {
      id: 'task-trip',
      title: 'Plan a Trip & Daily Itinerary',
      description: 'Schedule multi-day routes with driving times and pin markers.',
      icon: ClipboardList,
      isCompleted: tripsCount > 0,
      actionText: 'Plan New Trip',
      onAction: () => onNavigateTab && onNavigateTab('trips')
    },
    {
      id: 'task-settings',
      title: 'Configure Home Address or Settings',
      description: 'Set your primary home starting point or customize preferences.',
      icon: Settings,
      isCompleted: homeAddressesCount > 0,
      actionText: 'Open Settings',
      onAction: () => onNavigateTab && onNavigateTab('settings')
    }
  ];

  const completedCount = tasks.filter(t => t.isCompleted).length;
  const totalCount = tasks.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  useEffect(() => {
    if (isAllComplete && !hasCelebrated) {
      setHasCelebrated(true);
    }
  }, [isAllComplete, hasCelebrated]);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem(collapsedKey, String(nextState));
  };

  if (!isVisible) return null;

  // Mini launcher badge if collapsed
  if (isCollapsed) {
    return (
      <div 
        className="no-print"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9000
        }}
      >
        <button
          onClick={toggleCollapse}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface-elevated, #1e1e2c)',
            border: '1px solid var(--accent-primary, #8b5cf6)',
            color: 'var(--text-primary, #f3f4f6)',
            padding: '8px 14px',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 16px rgba(139,92,246,0.2)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.82rem',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease'
          }}
          title="Getting Started Checklist"
        >
          {isAllComplete ? (
            <Award size={16} style={{ color: '#10b981' }} />
          ) : (
            <Sparkles size={16} style={{ color: 'var(--accent-primary, #8b5cf6)' }} />
          )}
          <span>Getting Started ({completedCount}/{totalCount})</span>
          <ChevronUp size={15} style={{ opacity: 0.7 }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '340px',
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 9000,
        background: 'var(--bg-surface-elevated, #1e1e2c)',
        border: '1px solid var(--border-glass, rgba(255,255,255,0.12))',
        borderRadius: '16px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.15)',
        backdropFilter: 'blur(16px)',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.15))',
          borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: isAllComplete ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #06b6d4))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            {isAllComplete ? <Award size={16} /> : <Sparkles size={16} />}
          </div>
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#fff' }}>
              {isAllComplete ? "You're a TravelBuff Pro! 🎉" : "Getting Started"}
            </h4>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #9ca3af)' }}>
              {completedCount} of {totalCount} completed ({progressPercent}%)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={toggleCollapse}
            title="Minimize"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #9ca3af)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronDown size={18} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close Checklist"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #9ca3af)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.06)' }}>
        <div 
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: isAllComplete ? '#10b981' : 'linear-gradient(90deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #06b6d4))',
            transition: 'width 0.4s ease'
          }}
        />
      </div>

      {/* Checklist items */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
        {tasks.map(task => {
          return (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '10px',
                background: task.isCompleted ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                border: task.isCompleted ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'background 0.2s ease'
              }}
            >
              <div style={{ paddingTop: '2px', flexShrink: 0 }}>
                {task.isCompleted ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                ) : (
                  <Circle size={18} style={{ color: 'var(--text-muted, #6b7280)' }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: task.isCompleted ? 'var(--text-secondary, #9ca3af)' : 'var(--text-primary, #f3f4f6)',
                  textDecoration: task.isCompleted ? 'line-through' : 'none'
                }}>
                  {task.title}
                </div>
                <p style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted, #6b7280)',
                  margin: '2px 0 6px 0',
                  lineHeight: '1.3'
                }}>
                  {task.description}
                </p>

                {!task.isCompleted && (
                  <button
                    type="button"
                    onClick={task.onAction}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      background: 'rgba(139, 92, 246, 0.12)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '6px',
                      color: 'var(--accent-primary-hover, #a78bfa)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>{task.actionText}</span>
                    <ExternalLink size={10} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with Guided Tour trigger */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.06))',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <button
          type="button"
          onClick={onOpenTour}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--accent-secondary, #06b6d4)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0
          }}
        >
          <Sparkles size={13} />
          <span>Launch Guided Tour</span>
        </button>

        <button
          type="button"
          onClick={toggleCollapse}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted, #6b7280)',
            fontSize: '0.72rem',
            cursor: 'pointer'
          }}
        >
          Minimize
        </button>
      </div>
    </div>
  );
}
