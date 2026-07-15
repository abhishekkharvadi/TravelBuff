import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID, clearLocalDb, populateLocalDb } from '../clientDb.js';
import { Plus, Trash2, Tag, Compass, Settings, Server, Key, DollarSign, X, RefreshCw } from 'lucide-react';

export default function SettingsComponent({ token, userId, onLogout }) {
  // Dexie live queries
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const customCategories = useLiveQuery(() => db.custom_categories.toArray()) || [];

  // Local State
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#8b5cf6');

  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('📌');
  const [catType, setCatType] = useState('place');

  // Integrations state
  const [immichUrl, setImmichUrl] = useState('');
  const [immichKey, setImmichKey] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [owntracksKey, setOwnTracksKey] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Immich test state
  const [immichTestStatus, setImmichTestStatus] = useState(null); // 'success', 'error', 'testing', or null
  const [immichVersion, setImmichVersion] = useState('');

  // Backup / Restore states
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState(null);

  // Load backend configurations
  useEffect(() => {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setImmichUrl(data.config.immich_url || '');
          setImmichKey(data.config.immich_key || '');
          setBaseCurrency(data.config.base_currency || 'USD');
          setOwnTracksKey(data.config.owntracks_key || '');
        }
      })
      .catch(err => console.error('Failed to load configs:', err));
  }, [token]);

  const handleSaveConfigs = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          immich_url: immichUrl,
          immich_key: immichKey,
          base_currency: baseCurrency
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestImmich = async () => {
    if (!immichUrl.trim() || !immichKey.trim()) {
      alert('Please fill in both Immich Server Endpoint URL and API Key first.');
      return;
    }
    setImmichTestStatus('testing');
    setImmichVersion('');
    try {
      const res = await fetch('/api/immich/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          immich_url: immichUrl,
          immich_key: immichKey
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.major === 'number' && typeof data.minor === 'number' && typeof data.patch === 'number') {
          setImmichVersion(`${data.major}.${data.minor}.${data.patch}`);
          setImmichTestStatus('success');
        } else {
          setImmichTestStatus('error');
        }
      } else {
        setImmichTestStatus('error');
      }
    } catch (err) {
      console.error(err);
      setImmichTestStatus('error');
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!tagName.trim()) return;

    const newTag = {
      id: generateUUID(),
      name: tagName,
      color: tagColor
    };

    await queueSyncAction('tags', 'insert', newTag);
    setTagName('');
  };

  const handleDeleteTag = async (tagId) => {
    if (window.confirm('Delete this tag? It will be removed from all places/locations.')) {
      await queueSyncAction('tags', 'delete', { id: tagId });
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const newCat = {
      id: generateUUID(),
      name: catName,
      icon: catIcon,
      type: catType
    };

    await queueSyncAction('custom_categories', 'insert', newCat);
    setCatName('');
  };

  const handleDeleteCategory = async (catId) => {
    if (window.confirm('Delete this custom category?')) {
      await queueSyncAction('custom_categories', 'delete', { id: catId });
    }
  };

  // Backup Export
  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup/export');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `travelbuff_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert('Failed to generate backup file.');
      }
    } catch (err) {
      console.error(err);
      alert('Error exporting backup.');
    } finally {
      setBackupLoading(false);
    }
  };

  // Backup Restore
  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('Are you sure you want to restore this backup? Conflicting records will be duplicated rather than replaced.')) {
      e.target.value = '';
      return;
    }

    setRestoreLoading(true);
    setRestoreSummary(null);

    try {
      const reader = new FileReader();
      const payloadPromise = new Promise((resolve, reject) => {
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsText(file);
      const text = await payloadPromise;
      const backupData = JSON.parse(text);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: backupData.data,
          files: backupData.files,
          currentUserId: userId
        })
      });

      if (res.ok) {
        const result = await res.json();
        setRestoreSummary(result);
        
        // Sync the client immediately to populate the new database tables
        alert('Restore finished on server! Re-synchronizing local database...');
        
        await clearLocalDb();
        await populateLocalDb(token);
        
        alert('Local database sync complete!');
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Restore failed: ${errData.error || 'Unknown server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error parsing or restoring backup file.');
    } finally {
      setRestoreLoading(false);
      e.target.value = '';
    }
  };

  // Compile full OwnTracks webhook link
  const ownTracksWebhookUrl = `${window.location.origin}/api/owntracks/webhook/${owntracksKey}`;

  return (
    <div className="container">
      <div className="page-header">
        <h2>Settings & Configurations</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px' }}>
        
        {/* COLUMN 1: INTEGRATIONS & BACKUP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* SECTION 1: INTEGRATIONS */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Server size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Self-Hosted Integrations</h3>
            </div>

            {saveSuccess && (
              <div style={{ background: 'var(--success-glow)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)', padding: '10px', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
                ✓ Settings saved successfully.
              </div>
            )}

            <form onSubmit={handleSaveConfigs}>
              <h4 style={{ color: 'var(--accent-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>Immich Server Settings</h4>
              <div className="form-group">
                <label>Immich Server Endpoint URL</label>
                <input 
                  type="url" 
                  className="form-control" 
                  placeholder="https://immich.yourdomain.com"
                  value={immichUrl}
                  onChange={(e) => setImmichUrl(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Immich API Key</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Enter personal API Key"
                  value={immichKey}
                  onChange={(e) => setImmichKey(e.target.value)}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', marginBottom: '16px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleTestImmich}
                  disabled={immichTestStatus === 'testing'}
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  {immichTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                {immichTestStatus === 'success' && (
                  <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '500' }}>
                    ✔️ Connection Success {immichVersion && `(v${immichVersion})`}
                  </span>
                )}
                {immichTestStatus === 'error' && (
                  <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '500' }}>
                    ❌ Connection Failed
                  </span>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '20px 0' }} />
              
              <h4 style={{ color: 'var(--accent-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>General Configurations</h4>
              <div className="form-group">
                <label>Base Currency</label>
                <select className="form-control" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saveLoading} style={{ marginTop: '10px' }}>
                {saveLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </form>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '20px 0' }} />

            <h4 style={{ color: 'var(--accent-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>OwnTracks Integration</h4>
            <div className="form-group">
              <label>OwnTracks Webhook Target URL</label>
              <textarea
                className="form-control"
                readOnly
                rows="3"
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#121217', cursor: 'pointer' }}
                value={owntracksKey ? ownTracksWebhookUrl : 'Register to generate webhook key'}
                onClick={(e) => { e.target.select(); document.execCommand('copy'); alert('Webhook URL copied to clipboard!'); }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                📋 Click to copy. Paste this URL directly into the <b>OwnTracks mobile app</b> configuration (HTTP mode) to track background GPS positions.
              </p>
            </div>
          </div>

          {/* SECTION 3: BACKUP & RESTORE */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Settings size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Backup & Restore Data</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Export all database tables and uploaded media files into a single portable backup file, or merge/restore database values from a previous JSON export.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleDownloadBackup}
                  disabled={backupLoading}
                  style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {backupLoading ? 'Exporting...' : '📥 Download Backup (.json)'}
                </button>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '8px 0' }} />

              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Restore Backup File</label>
                <input 
                  type="file" 
                  accept=".json"
                  className="form-control" 
                  onChange={handleRestoreBackup}
                  disabled={restoreLoading}
                  style={{ fontSize: '0.85rem', padding: '6px' }}
                />
                {restoreLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: 'var(--accent-secondary)', fontSize: '0.85rem' }}>
                    <RefreshCw size={14} className="sync-spinner" />
                    <span>Restoring data & writing uploads... Please do not navigate away.</span>
                  </div>
                )}
                {restoreSummary && (
                  <div style={{ background: 'var(--success-glow)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)', padding: '12px', borderRadius: 'var(--radius-sm)', marginTop: '16px', fontSize: '0.85rem' }}>
                    <strong>Restore completed successfully!</strong>
                    <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                      <li>Restored rows: {restoreSummary.restored_count}</li>
                      <li>Duplicated/renamed items: {restoreSummary.duplicated_count}</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* COLUMN 2: TAGS & CATEGORIES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* TAGS */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Tag size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Keyword Tags</h3>
            </div>

            {/* List tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {tags.map(t => (
                <span 
                  key={t.id} 
                  className="tag-badge" 
                  style={{ 
                    backgroundColor: t.color, color: '#000', 
                    display: 'inline-flex', alignItems: 'center', gap: '6px' 
                  }}
                >
                  {t.name}
                  {t.name !== 'Visited' && t.name !== 'Not Visited' && (
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleDeleteTag(t.id)} />
                  )}
                </span>
              ))}
            </div>

            <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '0.75rem' }}>Tag Name</label>
                <input type="text" className="form-control" placeholder="e.g. Europe, Roadtrip" value={tagName} onChange={(e) => setTagName(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem' }}>Color</label>
                <input type="color" className="form-control" style={{ padding: '6px', height: '42px' }} value={tagColor} onChange={(e) => setTagColor(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ width: 'auto', padding: '10px 16px' }}>Add</button>
            </form>
          </div>

          {/* CATEGORIES */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Compass size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Categories</h3>
            </div>

            {/* List categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {customCategories.map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <span>{cat.icon} {cat.name}</span>
                  <button className="photo-action-btn" onClick={() => handleDeleteCategory(cat.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '0.75rem' }}>Category Name</label>
                <input type="text" className="form-control" placeholder="e.g. Viewpoint, Camping" value={catName} onChange={(e) => setCatName(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem' }}>Icon/Emoji</label>
                <input type="text" className="form-control" placeholder="🗻" value={catIcon} onChange={(e) => setCatIcon(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ width: 'auto', padding: '10px 16px' }}>Add</button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
