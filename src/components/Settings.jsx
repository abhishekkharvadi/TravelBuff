import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID, clearLocalDb, populateLocalDb } from '../clientDb.js';
import { Plus, Trash2, Tag, Compass, Settings, Server, Key, DollarSign, X, RefreshCw, Sparkles, Check, MoreVertical, Clock } from 'lucide-react';

export default function SettingsComponent({ token, userId, onLogout, onResumeMarkdown }) {
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
  const [immichAltUrl, setImmichAltUrl] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [owntracksKey, setOwnTracksKey] = useState('');
  
  // AI Settings state
  const [aiProvider, setAiProvider] = useState('Gemini');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiEndpointUrl, setAiEndpointUrl] = useState('');
  const [aiModel, setAiModel] = useState('gemini-1.5-pro');
  const [firecrawlKey, setFirecrawlKey] = useState('');
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('');
  const [immichEnabled, setImmichEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [googleMapsEnabled, setGoogleMapsEnabled] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [navigationProvider, setNavigationProvider] = useState(localStorage.getItem('navigation_provider') || 'google');
  
  const [renamingId, setRenamingId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  
  const savedGuides = useLiveQuery(() => db.saved_markdowns ? db.saved_markdowns.toArray() : Promise.resolve([])) || [];
  
  // Tooltip states
  const [showEndpointTooltip, setShowEndpointTooltip] = useState(false);
  const [showAltTooltip, setShowAltTooltip] = useState(false);
  const [showGmapsTooltip, setShowGmapsTooltip] = useState(false);
  
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
          setImmichAltUrl(data.config.immich_alt_url || '');
          setBaseCurrency(data.config.base_currency || 'USD');
          setOwnTracksKey(data.config.owntracks_key || '');
          if (data.config.ai_settings) {
            try {
              const aiOpts = JSON.parse(data.config.ai_settings);
              setAiProvider(aiOpts.provider || 'Gemini');
              setAiApiKey(aiOpts.apiKey || '');
              setAiEndpointUrl(aiOpts.endpointUrl || '');
              setAiModel(aiOpts.model || 'gemini-1.5-pro');
              setFirecrawlKey(aiOpts.firecrawlKey || '');
              setAiEnabled(aiOpts.aiEnabled !== undefined ? aiOpts.aiEnabled : true);
              setImmichEnabled(aiOpts.immichEnabled !== undefined ? aiOpts.immichEnabled : true);
            } catch (e) { console.error('Failed to parse ai_settings'); }
          }
        }
      })
      .catch(err => console.error('Failed to load configs:', err));

    const key = localStorage.getItem('google_maps_api_key') || '';
    setGoogleMapsApiKey(key);
    const mapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';
    setGoogleMapsEnabled(mapsEnabled);
  }, [token]);

  useEffect(() => {
    if (!showEndpointTooltip && !showAltTooltip && !showGmapsTooltip) return;
    const handleOutsideClick = () => {
      setShowEndpointTooltip(false);
      setShowAltTooltip(false);
      setShowGmapsTooltip(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showEndpointTooltip, showAltTooltip, showGmapsTooltip]);

  const [cardStatus, setCardStatus] = useState({ immich: '', ai: '', maps: '', general: '' });

  const setStatus = (card, text) => {
    setCardStatus(prev => ({ ...prev, [card]: text }));
    if (text === 'Saved') {
      setTimeout(() => {
        setCardStatus(prev => {
          if (prev[card] === 'Saved') {
            return { ...prev, [card]: '' };
          }
          return prev;
        });
      }, 2000);
    }
  };

  const saveFieldConfig = async (fieldsToUpdate) => {
    try {
      const curConfigRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!curConfigRes.ok) return false;
      const curConfigData = await curConfigRes.json();
      const current = curConfigData.config || {};
      
      const payload = {
        immich_url: fieldsToUpdate.immich_url !== undefined ? fieldsToUpdate.immich_url : current.immich_url || '',
        immich_key: fieldsToUpdate.immich_key !== undefined ? fieldsToUpdate.immich_key : current.immich_key || '',
        immich_alt_url: fieldsToUpdate.immich_alt_url !== undefined ? fieldsToUpdate.immich_alt_url : current.immich_alt_url || '',
        base_currency: fieldsToUpdate.base_currency !== undefined ? fieldsToUpdate.base_currency : current.base_currency || 'USD',
        ai_settings: current.ai_settings || '{}'
      };

      // Merge ai_settings
      let aiOpts = {};
      try {
        aiOpts = JSON.parse(payload.ai_settings);
      } catch (e) {}

      if (fieldsToUpdate.ai_provider !== undefined) aiOpts.provider = fieldsToUpdate.ai_provider;
      if (fieldsToUpdate.ai_apiKey !== undefined) aiOpts.apiKey = fieldsToUpdate.ai_apiKey;
      if (fieldsToUpdate.ai_endpointUrl !== undefined) aiOpts.endpointUrl = fieldsToUpdate.ai_endpointUrl;
      if (fieldsToUpdate.ai_model !== undefined) aiOpts.model = fieldsToUpdate.ai_model;
      if (fieldsToUpdate.ai_firecrawlKey !== undefined) aiOpts.firecrawlKey = fieldsToUpdate.ai_firecrawlKey;
      if (fieldsToUpdate.ai_enabled !== undefined) aiOpts.aiEnabled = fieldsToUpdate.ai_enabled;
      if (fieldsToUpdate.immich_enabled !== undefined) aiOpts.immichEnabled = fieldsToUpdate.immich_enabled;

      payload.ai_settings = JSON.stringify(aiOpts);

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to save config:', err);
      return false;
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
        const backupData = await res.json();
        // Inject client-side localStorage settings
        backupData.settings_localstorage = {
          google_maps_api_key: localStorage.getItem('google_maps_api_key') || '',
          api_call_logs: localStorage.getItem('api_call_logs') || '{}'
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
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

      // Restore client-side localStorage settings
      if (backupData.settings_localstorage) {
        if (backupData.settings_localstorage.google_maps_api_key !== undefined) {
          localStorage.setItem('google_maps_api_key', backupData.settings_localstorage.google_maps_api_key);
        }
        if (backupData.settings_localstorage.api_call_logs !== undefined) {
          localStorage.setItem('api_call_logs', backupData.settings_localstorage.api_call_logs);
        }
      }

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
        window.location.reload(); // Reload page to pick up restored settings
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

  const handleSaveField = async (card, fieldsToUpdate) => {
    setStatus(card, 'Saving...');
    const ok = await saveFieldConfig(fieldsToUpdate);
    setStatus(card, ok ? 'Saved' : 'Error');
  };

  const handleSaveMapsKey = (val) => {
    setStatus('maps', 'Saving...');
    localStorage.setItem('google_maps_api_key', val);
    setStatus('maps', 'Saved');
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
          
          {/* SECTION 1: IMMICH SERVER SETTINGS */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>Immich Server Settings</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={immichEnabled} 
                    onChange={(e) => {
                      const val = e.target.checked;
                      setImmichEnabled(val);
                      handleSaveField('immich', { immich_enabled: val });
                    }} 
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  {immichEnabled ? 'Enabled' : 'Disabled'}
                </label>
                {cardStatus.immich && (
                  <span style={{ fontSize: '0.8rem', color: cardStatus.immich === 'Saved' ? 'var(--success)' : 'var(--accent-secondary)', fontWeight: 'bold' }}>
                    {cardStatus.immich}
                  </span>
                )}
              </div>
            </div>

            <div style={{ opacity: immichEnabled ? 1 : 0.4, pointerEvents: immichEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                  Immich Server Endpoint URL
                  <span 
                    onMouseEnter={() => setShowEndpointTooltip(true)}
                    onMouseLeave={() => setShowEndpointTooltip(false)}
                    onClick={(e) => { e.stopPropagation(); setShowEndpointTooltip(!showEndpointTooltip); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      color: '#000',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    i
                  </span>
                  {showEndpointTooltip && (
                    <span style={{
                      position: 'absolute',
                      bottom: '22px',
                      left: '0',
                      background: '#1a1a24',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      width: '260px',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                      fontWeight: 'normal',
                      lineHeight: '1.3'
                    }}>
                      This is the backend Immich URL. Add the URL without the trailing '/' at the end (e.g. http://localhost:port only).
                    </span>
                  )}
                </label>
                <input 
                  type="url" 
                  className="form-control" 
                  placeholder="https://immich.yourdomain.com"
                  value={immichUrl}
                  onChange={(e) => setImmichUrl(e.target.value)}
                  onBlur={(e) => handleSaveField('immich', { immich_url: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                  Immich Alternative URL
                  <span 
                    onMouseEnter={() => setShowAltTooltip(true)}
                    onMouseLeave={() => setShowAltTooltip(false)}
                    onClick={(e) => { e.stopPropagation(); setShowAltTooltip(!showAltTooltip); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      color: '#000',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    i
                  </span>
                  {showAltTooltip && (
                    <span style={{
                      position: 'absolute',
                      bottom: '22px',
                      left: '0',
                      background: '#1a1a24',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      width: '260px',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                      fontWeight: 'normal',
                      lineHeight: '1.3'
                    }}>
                      Adding this field will use this URL to open Albums which are added to the Locations. When empty, it will use the Endpoint URL instead.
                    </span>
                  )}
                </label>
                <input 
                  type="url" 
                  className="form-control" 
                  placeholder="https://immich-alt.yourdomain.com"
                  value={immichAltUrl}
                  onChange={(e) => setImmichAltUrl(e.target.value)}
                  onBlur={(e) => handleSaveField('immich', { immich_alt_url: e.target.value })}
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
                  onBlur={(e) => handleSaveField('immich', { immich_key: e.target.value })}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
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
            </div>
          </div>

          {/* SECTION 2: AI ASSISTANT CONFIGURATION */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>AI Assistant Configuration</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={aiEnabled} 
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAiEnabled(val);
                      handleSaveField('ai', { ai_enabled: val });
                    }} 
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  {aiEnabled ? 'Enabled' : 'Disabled'}
                </label>
                {cardStatus.ai && (
                  <span style={{ fontSize: '0.8rem', color: cardStatus.ai === 'Saved' ? 'var(--success)' : 'var(--accent-secondary)', fontWeight: 'bold' }}>
                    {cardStatus.ai}
                  </span>
                )}
              </div>
            </div>

            <div style={{ opacity: aiEnabled ? 1 : 0.4, pointerEvents: aiEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
              <div className="form-group">
                <label>AI Provider</label>
                <select 
                  className="form-control" 
                  value={aiProvider} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setAiProvider(val);
                    handleSaveField('ai', { ai_provider: val });
                  }}
                >
                  <option value="OpenAI">OpenAI</option>
                  <option value="Claude">Claude</option>
                  <option value="Gemini">Gemini</option>
                  <option value="Ollama">Ollama</option>
                  <option value="Local AI">Local AI</option>
                </select>
              </div>

              {['OpenAI', 'Claude', 'Gemini'].includes(aiProvider) && (
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder={`Enter ${aiProvider} API Key`}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    onBlur={(e) => handleSaveField('ai', { ai_apiKey: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Firecrawl API Key (Optional)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter Firecrawl API Key"
                  value={firecrawlKey}
                  onChange={(e) => setFirecrawlKey(e.target.value)}
                  onBlur={(e) => handleSaveField('ai', { ai_firecrawlKey: e.target.value })}
                />
              </div>

              {['Ollama', 'Local AI', 'OpenAI', 'Claude'].includes(aiProvider) && (
                <div className="form-group">
                  <label>Endpoint URL (Optional for Cloud Providers)</label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://api... or http://localhost..."
                    value={aiEndpointUrl}
                    onChange={(e) => setAiEndpointUrl(e.target.value)}
                    onBlur={(e) => handleSaveField('ai', { ai_endpointUrl: e.target.value })}
                  />
                </div>
              )}

              {(() => {
                const standardModels = {
                  Gemini: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-pro-latest'],
                  OpenAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
                  Claude: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
                  Ollama: ['llama3', 'mistral', 'phi3', 'gemma'],
                  'Local AI': ['llama3', 'mistral']
                }[aiProvider] || [];

                const isCustom = aiModel && !standardModels.includes(aiModel);

                return (
                  <>
                    <div className="form-group">
                      <label>Model Selector</label>
                      <select
                        className="form-control"
                        value={isCustom ? 'custom' : aiModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setAiModel('');
                          } else {
                            setAiModel(val);
                            handleSaveField('ai', { ai_model: val });
                          }
                        }}
                      >
                        {standardModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="custom">Custom Model...</option>
                      </select>
                    </div>

                    {(isCustom || aiModel === '') && (
                      <div className="form-group">
                        <label>Custom Model Name</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Enter model identifier"
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          onBlur={(e) => handleSaveField('ai', { ai_model: e.target.value })}
                          required
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* SECTION 3: GOOGLE MAPS API KEY (OPTIONAL) */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>Google Maps Integration</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={googleMapsEnabled} 
                    onChange={(e) => {
                      const val = e.target.checked;
                      setGoogleMapsEnabled(val);
                      localStorage.setItem('google_maps_enabled', val ? 'true' : 'false');
                      setCardStatus(prev => ({ ...prev, maps: 'Saved' }));
                      setTimeout(() => setCardStatus(prev => ({ ...prev, maps: '' })), 2000);
                    }} 
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  {googleMapsEnabled ? 'Enabled' : 'Disabled'}
                </label>
                {cardStatus.maps && (
                  <span style={{ fontSize: '0.8rem', color: cardStatus.maps === 'Saved' ? 'var(--success)' : 'var(--accent-secondary)', fontWeight: 'bold' }}>
                    {cardStatus.maps}
                  </span>
                )}
              </div>
            </div>

            <div style={{ opacity: googleMapsEnabled ? 1 : 0.4, pointerEvents: googleMapsEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Google Maps API Key (Optional)
                  <span 
                    onClick={(e) => { e.stopPropagation(); setShowGmapsTooltip(!showGmapsTooltip); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      color: '#000',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    title="Key Setup Instructions & Cost Warning"
                  >
                    i
                  </span>
                </label>

                {showGmapsTooltip && (
                  <div style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    lineHeight: '1.4'
                  }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--accent-primary-hover)' }}>🔑 Google Maps Key Requirements</h5>
                    <p style={{ margin: '0 0 10px 0' }}>The following APIs must be enabled for this key in your Google Cloud Console:</p>
                    <ul style={{ margin: '0 0 12px 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li><b>Maps JavaScript API</b>: Renders the map canvas and plots markers.</li>
                      <li><b>Directions API</b>: Computes actual street path geometries between stops.</li>
                      <li><b>Distance Matrix API</b>: Calculates travel distances and driving durations.</li>
                      <li><b>Geocoding API</b>: Resolves coordinates for locations and curation queue rows.</li>
                      <li><b>Places API</b>: Provides autocomplete recommendations when searching areas.</li>
                    </ul>

                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--accent-primary-hover)' }}>🛠️ Setup Instructions</h5>
                    <ol style={{ margin: '0 0 12px 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>Go to the <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Google Cloud Console</a>.</li>
                      <li>Create or select a project, then go to **APIs & Services &gt; Library**.</li>
                      <li>Search for and enable the three APIs listed above.</li>
                      <li>Go to **APIs & Services &gt; Credentials**, click **Create Credentials**, and select **API Key**.</li>
                      <li>(Recommended) Set HTTP Referrer restrictions to limit usage to your domain.</li>
                    </ol>

                    <h5 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: 'var(--danger)' }}>⚠️ Cost & Billing Warning</h5>
                    <p style={{ margin: 0 }}>
                      Google offers <b>$200 in free monthly credits</b> (approx. 28,000 map loads). However, usage exceeding this limit will be billed to your Google Cloud account. It is highly recommended to set budget notifications and billing alerts in your GCP console.
                    </p>
                  </div>
                )}

                <input 
                  type="password"
                  className="form-control"
                  placeholder="Enter Google Maps API Key for alternative map view"
                  value={googleMapsApiKey}
                  onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                  onBlur={(e) => handleSaveMapsKey(e.target.value)}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  When left blank, the app defaults to OpenStreetMap/Leaflet.
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: GENERAL CONFIGURATIONS */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <DollarSign size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>General Configurations</h3>
              </div>
              {cardStatus.general && (
                <span style={{ fontSize: '0.8rem', color: cardStatus.general === 'Saved' ? 'var(--success)' : 'var(--accent-secondary)', fontWeight: 'bold' }}>
                  {cardStatus.general}
                </span>
              )}
            </div>

            <div className="form-group">
              <label>Base Currency</label>
              <select 
                className="form-control" 
                value={baseCurrency} 
                onChange={(e) => {
                  const val = e.target.value;
                  setBaseCurrency(val);
                  handleSaveField('general', { base_currency: val });
                }}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="INR">INR (₹)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </div>

            {typeof window !== 'undefined' && 
              (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || 
               (navigator.userAgent.includes('Mac') && 'ontouchend' in document)) && (
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Default Navigation Map App</label>
                <select 
                  className="form-control" 
                  value={navigationProvider} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setNavigationProvider(val);
                    localStorage.setItem('navigation_provider', val);
                    setStatus('general', 'Saved');
                  }}
                >
                  <option value="google">Google Maps</option>
                  <option value="apple">Apple Maps</option>
                </select>
              </div>
            )}
          </div>

          {/* SECTION 5: OWNTRACKS INTEGRATION */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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

      {/* SAVED GUIDES SECTION */}
      <div style={{ marginTop: '40px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Sparkles size={22} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ margin: 0 }}>Saved Travel Guides & Markdowns</h3>
        </div>
        
        {savedGuides.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No saved guides yet. Import some guides using the URL import tool!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {savedGuides.map(guide => (
              <div 
                key={guide.id} 
                className="card" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '12px', 
                  padding: '16px', 
                  cursor: 'pointer',
                  border: guide.status === 'completed' ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid var(--border-glass)',
                  transition: 'border-color 0.2s ease, transform 0.2s ease'
                }}
                onClick={() => onResumeMarkdown(guide)}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                  {renamingId === guide.id ? (
                    <input 
                      type="text" 
                      className="form-control"
                      style={{ fontWeight: '600', fontSize: '1rem', background: '#0f0f16', border: '1px solid var(--border)', padding: '4px', flexGrow: 1 }}
                      value={guide.name}
                      autoFocus
                      onChange={async (e) => {
                        const newName = e.target.value;
                        await queueSyncAction('saved_markdowns', 'update', { ...guide, name: newName });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setRenamingId(null);
                      }}
                      onBlur={() => setRenamingId(null)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h4 style={{ margin: 0, fontWeight: '600', fontSize: '1rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                      {guide.name}
                    </h4>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    {guide.status === 'completed' ? (
                      <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', padding: '4px', borderRadius: '50%', backgroundColor: 'rgba(74, 222, 128, 0.1)' }} title="Completed">
                        <Check size={14} />
                      </span>
                    ) : (
                      <span style={{ color: '#eab308', display: 'inline-flex', alignItems: 'center', padding: '4px', borderRadius: '50%', backgroundColor: 'rgba(234, 179, 8, 0.1)' }} title="Incomplete">
                        <Clock size={14} />
                      </span>
                    )}
                    
                    {/* Meatballs dropdown menu */}
                    <div style={{ position: 'relative' }}>
                      <button 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                        onClick={() => setActiveMenuId(activeMenuId === guide.id ? null : guide.id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {activeMenuId === guide.id && (
                        <div style={{
                          position: 'absolute',
                          right: 0,
                          top: '24px',
                          backgroundColor: '#191924',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '4px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 10,
                          minWidth: '100px'
                        }}>
                          <button 
                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '0.8rem' }}
                            onClick={() => {
                              setRenamingId(guide.id);
                              setActiveMenuId(null);
                            }}
                          >
                            Rename
                          </button>
                          <button 
                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.8rem' }}
                            onClick={async () => {
                              setActiveMenuId(null);
                              if (window.confirm(`Delete "${guide.name}"?`)) {
                                await queueSyncAction('saved_markdowns', 'delete', { id: guide.id });
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Source: {guide.url || 'Manual Paste'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Saved: {new Date(guide.created_at || Date.now()).toLocaleDateString()}</span>
                  <span>Size: {(guide.content ? (guide.content.length / 1024).toFixed(1) : '0.0')} KB</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API USAGE TRACKER SECTION */}
      <div style={{ marginTop: '40px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📊</span>
            <h3 style={{ margin: 0 }}>External API Usage Logs (Past 6 Months)</h3>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              const months = [];
              const now = new Date();
              for (let i = 0; i < 6; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }
              const apis = ['Google Maps JavaScript', 'Google Maps Directions', 'Google Maps Distance Matrix', 'Google Maps Geocoding', 'Google Maps Places', 'OSRM Routing', 'Wikipedia', 'AI Assistant'];
              const logs = JSON.parse(localStorage.getItem('api_call_logs') || '{}');

              let csvContent = "data:text/csv;charset=utf-8,";
              csvContent += ["API Name", ...months].join(",") + "\n";
              apis.forEach(api => {
                const row = [api];
                months.forEach(m => {
                  const count = (logs[m] && logs[m][api]) || 0;
                  row.push(count);
                });
                csvContent += row.join(",") + "\n";
              });

              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", `api_usage_logs_${new Date().toISOString().split('T')[0]}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            📥 Export API Log (.csv)
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px 8px', fontWeight: '600' }}>API Service</th>
                {(() => {
                  const months = [];
                  const now = new Date();
                  for (let i = 0; i < 6; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  }
                  return months.map(m => (
                    <th key={m} style={{ padding: '12px 8px', fontWeight: '600' }}>{m}</th>
                  ));
                })()}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const months = [];
                const now = new Date();
                for (let i = 0; i < 6; i++) {
                  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                  months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }
                const apis = ['Google Maps JavaScript', 'Google Maps Directions', 'Google Maps Distance Matrix', 'Google Maps Geocoding', 'Google Maps Places', 'OSRM Routing', 'Wikipedia', 'AI Assistant'];
                const logs = JSON.parse(localStorage.getItem('api_call_logs') || '{}');

                return apis.map(api => (
                  <tr key={api} style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '500' }}>{api}</td>
                    {months.map(m => {
                      const count = (logs[m] && logs[m][api]) || 0;
                      return (
                        <td key={m} style={{ padding: '12px 8px' }}>
                          {count > 0 ? (
                            <span style={{ color: 'var(--accent-primary-hover)', fontWeight: 'bold' }}>{count}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>0</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
