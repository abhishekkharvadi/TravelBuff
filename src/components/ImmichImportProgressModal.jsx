import React, { useState, useEffect } from 'react';
import { immichImportQueue } from '../services/immichImportQueue.js';
import { RefreshCw, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp, Image as ImageIcon, MapPin, FolderCheck, Sparkles, FolderSync, Clock } from 'lucide-react';

export default function ImmichImportProgressModal({ isOpen, onClose }) {
  const [queueState, setQueueState] = useState(immichImportQueue.getState());
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const unsubscribe = immichImportQueue.subscribe(state => {
      setQueueState(state);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen && queueState.status === 'idle') return null;
  if (!isOpen) return null;

  const stage = queueState.stage || 'idle';
  const isRunning = queueState.status === 'running';
  const isCompleted = queueState.status === 'completed';

  // Stage statuses: 'pending' | 'in_progress' | 'done'
  const isImporting = stage === 'importing' || stage === 'staging' || stage === 'fetching_photos' || stage === 'sorting';
  const stage1Status = isCompleted ? 'done' : (isImporting ? 'in_progress' : 'pending');
  const stage2Status = isCompleted ? 'done' : (isImporting ? 'in_progress' : 'pending');
  const stage3Status = isCompleted ? 'done' : 'pending';

  const handleDismiss = () => {
    immichImportQueue.dismiss();
    onClose();
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel the background photo search? Any locations already created will be kept.')) {
      await immichImportQueue.cancelQueue();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100000 }}>
      <div 
        className="login-card" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '580px', width: '94%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: isCompleted ? 'rgba(74, 222, 128, 0.15)' : 'rgba(99, 102, 241, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isCompleted ? 'var(--success)' : 'var(--accent-primary)'
            }}>
              {isCompleted ? <CheckCircle2 size={22} /> : <RefreshCw size={20} className="sync-spinner" />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                {isCompleted ? 'Immich Import & Organization Complete' : 'Immich Import in Progress'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {isCompleted 
                  ? 'All folders sorted and locations enriched successfully' 
                  : stage === 'staging' 
                    ? 'Importing locations to Immich Imports folder...'
                    : stage === 'fetching_photos'
                      ? 'Fetching cover photos & descriptions in background...'
                      : 'Moving folders to their locations...'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
            title="Minimize to top bar"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3-Stage Visual Pipeline Tracker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '14px' }}>
          
          {/* Stage 1 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.86rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stage1Status === 'done' ? (
                <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              ) : stage1Status === 'in_progress' ? (
                <RefreshCw size={15} className="sync-spinner" style={{ color: 'var(--accent-primary)' }} />
              ) : (
                <Clock size={15} style={{ color: 'var(--text-muted)' }} />
              )}
              <span style={{ fontWeight: stage1Status === 'in_progress' ? 600 : 400, color: stage1Status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                1. Creating Country & State hierarchy on server
              </span>
            </div>
            <span style={{ 
              fontSize: '0.75rem', 
              padding: '2px 8px', 
              borderRadius: '9999px', 
              fontWeight: 600,
              background: stage1Status === 'done' ? 'rgba(74, 222, 128, 0.15)' : (stage1Status === 'in_progress' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)'),
              color: stage1Status === 'done' ? 'var(--success)' : (stage1Status === 'in_progress' ? 'var(--accent-primary)' : 'var(--text-muted)')
            }}>
              {stage1Status === 'done' ? 'Done' : (stage1Status === 'in_progress' ? 'In Progress' : 'Pending')}
            </span>
          </div>

          {/* Stage 2 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.86rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stage2Status === 'done' ? (
                <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              ) : stage2Status === 'in_progress' ? (
                <RefreshCw size={15} className="sync-spinner" style={{ color: 'var(--accent-primary)' }} />
              ) : (
                <Clock size={15} style={{ color: 'var(--text-muted)' }} />
              )}
              <span style={{ fontWeight: stage2Status === 'in_progress' ? 600 : 400, color: stage2Status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                2. Fetching Wikipedia cover photos & metadata
              </span>
            </div>
            <span style={{ 
              fontSize: '0.75rem', 
              padding: '2px 8px', 
              borderRadius: '9999px', 
              fontWeight: 600,
              background: stage2Status === 'done' ? 'rgba(74, 222, 128, 0.15)' : (stage2Status === 'in_progress' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)'),
              color: stage2Status === 'done' ? 'var(--success)' : (stage2Status === 'in_progress' ? 'var(--accent-primary)' : 'var(--text-muted)')
            }}>
              {stage2Status === 'done' ? 'Done' : (stage2Status === 'in_progress' ? 'In Progress' : 'Pending')}
            </span>
          </div>

          {/* Stage 3 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.86rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stage3Status === 'done' ? (
                <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              ) : stage3Status === 'in_progress' ? (
                <RefreshCw size={15} className="sync-spinner" style={{ color: 'var(--accent-primary)' }} />
              ) : (
                <Clock size={15} style={{ color: 'var(--text-muted)' }} />
              )}
              <span style={{ fontWeight: stage3Status === 'in_progress' ? 600 : 400, color: stage3Status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                3. Synchronizing to local offline database
              </span>
            </div>
            <span style={{ 
              fontSize: '0.75rem', 
              padding: '2px 8px', 
              borderRadius: '9999px', 
              fontWeight: 600,
              background: stage3Status === 'done' ? 'rgba(74, 222, 128, 0.15)' : (stage3Status === 'in_progress' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)'),
              color: stage3Status === 'done' ? 'var(--success)' : (stage3Status === 'in_progress' ? 'var(--accent-primary)' : 'var(--text-muted)')
            }}>
              {stage3Status === 'done' ? 'Done' : (stage3Status === 'in_progress' ? 'Syncing...' : 'Pending')}
            </span>
          </div>

        </div>

        {/* Progress Bar & Status for Photo Fetching */}
        {stage === 'fetching_photos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span>Processing photo: <strong style={{ color: 'var(--accent-primary)' }}>{queueState.currentCity || '...'}</strong></span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{queueState.percent}%</span>
            </div>

            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${queueState.percent}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>Completed: {queueState.completed} / {queueState.total}</span>
              <span style={{ color: 'var(--success)' }}>Cover images found: {queueState.successCount}</span>
            </div>
          </div>
        )}

        {/* Informational Tip */}
        {isRunning && (
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            💡 Folders will automatically organize into Country &rarr; State &rarr; City hierarchy once all photos are fetched. You can close this window and let it run in the background!
          </div>
        )}

        {/* Collapsible Stage-Tagged Logs */}
        {queueState.logs && queueState.logs.length > 0 && (
          <div style={{ border: '1px solid var(--border-glass)', borderRadius: '8px', overflow: 'hidden' }}>
            <div 
              onClick={() => setShowLogs(!showLogs)} 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              <span>Activity Log ({queueState.logs.length} entries)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = queueState.logs.map(l => `[${l.time}] [${l.stage}] [${l.type?.toUpperCase() || 'INFO'}] ${l.text}`).join('\n');
                    navigator.clipboard.writeText(text);
                    alert('Activity logs copied to clipboard!');
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    cursor: 'pointer'
                  }}
                >
                  Copy Logs
                </button>
                {showLogs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {showLogs && (
              <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', background: 'rgba(0,0,0,0.15)' }}>
                {queueState.logs.map((log) => {
                  const badgeColor = log.stage === 'Staging' ? 'var(--accent-secondary)' : log.stage === 'Photos' ? 'var(--accent-primary)' : 'var(--success)';
                  const textColor = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? '#f59e0b' : log.type === 'success' ? 'var(--success)' : 'var(--text-primary)';
                  
                  return (
                    <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '4px', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44`, flexShrink: 0, marginTop: '1px' }}>
                          {log.stage}
                        </span>
                        <span style={{ wordBreak: 'break-word', color: textColor, lineHeight: 1.4 }}>
                          {log.text}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }}>
                        {log.time}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          {isRunning ? (
            <>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleCancel}
                style={{ fontSize: '0.85rem', padding: '6px 14px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                Cancel Import
              </button>

              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={onClose}
                style={{ fontSize: '0.85rem', padding: '6px 16px' }}
              >
                Run in Background
              </button>
            </>
          ) : (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleDismiss}
                style={{ fontSize: '0.85rem', padding: '6px 20px' }}
              >
                Done & Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
