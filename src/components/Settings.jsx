import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID, clearLocalDb, populateLocalDb } from '../clientDb.js';
import { Plus, Trash2, Tag, Compass, Settings, Server, Key, DollarSign, X, RefreshCw, Sparkles, Check, MoreVertical, Clock, Users, Home, MapPin, Search, User, Edit2 } from 'lucide-react';
import { APP_VERSION } from '../version.js';

export default function SettingsComponent({ token, userId, onLogout, onResumeMarkdown }) {
  // Dexie live queries
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  const customCategories = useLiveQuery(() => db.custom_categories.toArray()) || [];
  const peopleList = useLiveQuery(() => db.people ? db.people.toArray() : Promise.resolve([])) || [];
  const userAddresses = useLiveQuery(() => db.user_addresses ? db.user_addresses.toArray() : Promise.resolve([])) || [];

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
  const [restoreProgressText, setRestoreProgressText] = useState('');
  const [resyncingMedia, setResyncingMedia] = useState(false);

  // Admin User Management State
  const isAdmin = localStorage.getItem('tb_isAdmin') === '1';
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedResetUser, setSelectedResetUser] = useState(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [selectedDeleteUser, setSelectedDeleteUser] = useState(null);
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const fetchAdminUsers = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const usersData = await res.json();
        setAdminUsersList(usersData);
      }
    } catch (e) {
      console.error('Failed to fetch admin users:', e);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminUsers();
    }
  }, [isAdmin, token]);

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedResetUser || !resetNewPassword) return;
    setAdminActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedResetUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: resetNewPassword })
      });
      if (res.ok) {
        const result = await res.json();
        alert(result.message || 'Password updated successfully!');
        setSelectedResetUser(null);
        setResetNewPassword('');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Reset failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reset password');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleAdminDeleteUser = async () => {
    if (!selectedDeleteUser) return;
    setAdminActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedDeleteUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        alert(result.message || 'User and all data deleted successfully!');
        setSelectedDeleteUser(null);
        fetchAdminUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Delete failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete user');
    } finally {
      setAdminActionLoading(false);
    }
  };

  // People state & Immich modal state
  const [personName, setPersonName] = useState('');
  const [personRelation, setPersonRelation] = useState('Friend');
  const [customRelation, setCustomRelation] = useState('');
  const [showImmichPeopleModal, setShowImmichPeopleModal] = useState(false);
  const [immichPeopleList, setImmichPeopleList] = useState([]);
  const [immichPeopleLoading, setImmichPeopleLoading] = useState(false);
  const [selectedImmichPerson, setSelectedImmichPerson] = useState(null);
  const [immichSearchQuery, setImmichSearchQuery] = useState('');

  // Address state & Geocoding state
  const [addressLabel, setAddressLabel] = useState('Home');
  const [addressText, setAddressText] = useState('');
  const [addressLat, setAddressLat] = useState('');
  const [addressLon, setAddressLon] = useState('');
  const [isDefaultHome, setIsDefaultHome] = useState(false);
  const [addressSearchResults, setAddressSearchResults] = useState([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);

  const addressDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(e.target)) {
        setAddressSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const parseCoordinateString = (str) => {
    if (!str || typeof str !== 'string') return null;
    const regex = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*[NS]?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?\s*[EW]?\s*$/i;
    const match = str.trim().match(regex);
    if (match) {
      return { lat: match[1], lon: match[2] };
    }
    return null;
  };

  // Handler: Add or update Person
  const handleAddPerson = async (e) => {
    e.preventDefault();
    if (!personName.trim()) return;
    const finalRelation = personRelation === 'Custom' ? (customRelation.trim() || 'Companion') : personRelation;
    const newPerson = {
      id: generateUUID(),
      name: personName.trim(),
      relation: finalRelation,
      immich_person_id: selectedImmichPerson ? selectedImmichPerson.id : null,
      immich_person_name: selectedImmichPerson ? selectedImmichPerson.name : null,
      notes: ''
    };
    await queueSyncAction('people', 'insert', newPerson);
    setPersonName('');
    setPersonRelation('Friend');
    setCustomRelation('');
    setSelectedImmichPerson(null);
  };

  const handleDeletePerson = async (id) => {
    await queueSyncAction('people', 'delete', { id });
  };

  // Handler: Fetch Immich People
  const handleOpenImmichPeopleModal = async () => {
    setShowImmichPeopleModal(true);
    setImmichPeopleLoading(true);
    try {
      const res = await fetch('/api/immich/people', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImmichPeopleList(Array.isArray(data) ? data : (data.people || []));
      }
    } catch (e) {
      console.warn('Failed to fetch Immich people:', e);
    } finally {
      setImmichPeopleLoading(false);
    }
  };

  // Handler: Edit Saved Address
  const handleEditAddress = (addr) => {
    setEditingAddressId(addr.id);
    setAddressLabel(addr.label || 'Home');
    setAddressText(addr.address || '');
    setAddressLat(addr.latitude !== null && addr.latitude !== undefined ? addr.latitude.toString() : '');
    setAddressLon(addr.longitude !== null && addr.longitude !== undefined ? addr.longitude.toString() : '');
    setIsDefaultHome(addr.is_default === 1);
  };

  const handleCancelEditAddress = () => {
    setEditingAddressId(null);
    setAddressLabel('Home');
    setAddressText('');
    setAddressLat('');
    setAddressLon('');
    setIsDefaultHome(false);
    setAddressSearchResults([]);
  };

  // Handler: Add or update Saved Address
  const handleAddAddress = async (e) => {
    e.preventDefault();
    if (!addressLabel.trim()) return;

    if (editingAddressId) {
      const updated = {
        id: editingAddressId,
        label: addressLabel.trim(),
        address: addressText.trim(),
        latitude: addressLat ? parseFloat(addressLat) : null,
        longitude: addressLon ? parseFloat(addressLon) : null,
        is_default: isDefaultHome ? 1 : 0
      };
      await queueSyncAction('user_addresses', 'update', updated);
      handleCancelEditAddress();
    } else {
      const newAddr = {
        id: generateUUID(),
        label: addressLabel.trim(),
        address: addressText.trim(),
        latitude: addressLat ? parseFloat(addressLat) : null,
        longitude: addressLon ? parseFloat(addressLon) : null,
        is_default: isDefaultHome ? 1 : (userAddresses.length === 0 ? 1 : 0)
      };
      await queueSyncAction('user_addresses', 'insert', newAddr);
      setAddressLabel('Home');
      setAddressText('');
      setAddressLat('');
      setAddressLon('');
      setIsDefaultHome(false);
      setAddressSearchResults([]);
    }
  };

  const handleDeleteAddress = async (id) => {
    if (editingAddressId === id) handleCancelEditAddress();
    await queueSyncAction('user_addresses', 'delete', { id });
  };

  // Address Geocoding Search
  const fetchNominatim = async (query) => {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(nomUrl);
      if (res.ok) {
        const data = await res.json();
        setAddressSearchResults(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('Address search failed:', e);
    } finally {
      setAddressSearching(false);
    }
  };

  const handleSearchAddressQuery = async (query) => {
    setAddressText(query);
    const parsedCoords = parseCoordinateString(query);
    if (parsedCoords) {
      setAddressLat(parsedCoords.lat);
      setAddressLon(parsedCoords.lon);
      setAddressSearchResults([]);
      return;
    }

    if (!query || query.length < 3) {
      setAddressSearchResults([]);
      return;
    }

    setAddressSearching(true);
    const gmapsKey = localStorage.getItem('google_maps_api_key');
    const gmapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

    if (gmapsKey && gmapsEnabled && typeof window !== 'undefined' && window.google && window.google.maps && window.google.maps.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: query }, (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            const mapped = results.slice(0, 5).map(r => ({
              display_name: r.formatted_address,
              lat: r.geometry.location.lat().toString(),
              lon: r.geometry.location.lng().toString()
            }));
            setAddressSearchResults(mapped);
          } else {
            fetchNominatim(query);
          }
          setAddressSearching(false);
        });
        return;
      } catch (err) {
        console.warn('Google Maps Geocoder error:', err);
      }
    }

    await fetchNominatim(query);
  };

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
      const res = await fetch('/api/backup/export', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const backupData = await res.json();
        // Inject non-sensitive client-side localStorage settings (API keys excluded for security)
        backupData.settings_localstorage = {
          theme: localStorage.getItem('theme') || 'system',
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

  // Two-Phase Chunked Backup Restore
  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('Are you sure you want to restore this backup? Database records will be merged cleanly.')) {
      e.target.value = '';
      return;
    }

    setRestoreLoading(true);
    setRestoreSummary(null);
    setRestoreProgressText('Phase 1/2: Reading backup JSON file...');

    try {
      const reader = new FileReader();
      const payloadPromise = new Promise((resolve, reject) => {
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsText(file);
      const text = await payloadPromise;
      const backupData = JSON.parse(text);

      // Restore non-sensitive client-side localStorage settings
      if (backupData.settings_localstorage) {
        if (backupData.settings_localstorage.theme !== undefined) {
          localStorage.setItem('theme', backupData.settings_localstorage.theme);
        }
        if (backupData.settings_localstorage.api_call_logs !== undefined) {
          localStorage.setItem('api_call_logs', backupData.settings_localstorage.api_call_logs);
        }
      }

      setRestoreProgressText('Phase 1/2: Restoring database records (trips, locations, notes, expenses)...');

      // Phase 1: Post metadata (database records)
      const metaRes = await fetch('/api/backup/restore/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: backupData.data,
          currentUserId: userId
        })
      });

      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to restore database metadata');
      }

      const metaResult = await metaRes.json();
      let totalFilesProcessed = 0;
      let totalFilesSkipped = 0;
      const mediaErrors = [];

      // Phase 2: Chunked media batch upload
      const filesList = backupData.files || [];
      if (filesList.length > 0) {
        const CHUNK_SIZE = 10;
        const totalChunks = Math.ceil(filesList.length / CHUNK_SIZE);

        for (let i = 0; i < filesList.length; i += CHUNK_SIZE) {
          const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
          const chunkFiles = filesList.slice(i, i + CHUNK_SIZE);
          setRestoreProgressText(`Phase 2/2: Restoring uploaded media files (${Math.min(i + CHUNK_SIZE, filesList.length)} / ${filesList.length} files - Batch ${chunkNum}/${totalChunks})...`);

          try {
            const chunkRes = await fetch('/api/backup/restore/media-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ files: chunkFiles })
            });

            if (chunkRes.ok) {
              const chunkData = await chunkRes.json();
              totalFilesProcessed += (chunkData.files_processed || 0);
              totalFilesSkipped += (chunkData.files_skipped || 0);
              if (chunkData.errors && chunkData.errors.length > 0) {
                mediaErrors.push(...chunkData.errors);
              }
            }
          } catch (chunkErr) {
            console.warn(`[Client Restore Chunk Error] Batch ${chunkNum} failed:`, chunkErr);
          }
        }
      }

      // Sync IndexedDB client DB
      setRestoreProgressText('Finalizing local client database synchronization...');
      await clearLocalDb();
      await populateLocalDb(token);

      setRestoreSummary({
        restored_count: metaResult.restored_count || 0,
        duplicated_count: metaResult.duplicated_count || 0,
        warnings: metaResult.warnings || [],
        files_processed: totalFilesProcessed,
        files_skipped: totalFilesSkipped,
        media_errors: mediaErrors
      });

    } catch (err) {
      console.error(err);
      alert(`Error restoring backup: ${err.message}`);
    } finally {
      setRestoreLoading(false);
      setRestoreProgressText('');
      e.target.value = '';
    }
  };

  // Re-Sync Pending Media & Avatars
  const handleResyncMedia = async () => {
    setResyncingMedia(true);
    try {
      await clearLocalDb();
      await populateLocalDb(token);
      alert('Media & companion avatars re-synchronized successfully!');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Failed to re-sync media.');
    } finally {
      setResyncingMedia(false);
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

            <div style={{ padding: '10px 14px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '1rem' }}>🔒</span>
              <div>
                <strong>Security Notice:</strong> Private API keys (such as your <strong>Immich API Key</strong> and <strong>Google Maps API Key</strong>) are strictly <em>excluded</em> from backup files for privacy and security. Please re-enter your API keys manually in Settings after restoring a backup.
              </div>
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
                    <span>{restoreProgressText || 'Restoring data & writing uploads... Please do not navigate away.'}</span>
                  </div>
                )}
                {restoreSummary && (
                  <div style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '16px', borderRadius: 'var(--radius-md)', marginTop: '16px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Check size={18} /> Restore Completed Successfully!
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', margin: '10px 0' }}>
                      <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Restored Records</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{restoreSummary.restored_count}</div>
                      </div>
                      <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Media Files Processed</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{restoreSummary.files_processed || 0}</div>
                      </div>
                      {restoreSummary.files_skipped > 0 && (
                        <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Files Skipped (Existing)</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#38bdf8' }}>{restoreSummary.files_skipped}</div>
                        </div>
                      )}
                    </div>

                    {/* Configuration Warnings / Pending Items */}
                    {restoreSummary.warnings && restoreSummary.warnings.length > 0 && (
                      <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '0.8rem' }}>
                        <strong style={{ color: '#eab308' }}>⚠️ Configuration Warnings:</strong>
                        <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                          {restoreSummary.warnings.map((warn, idx) => (
                            <li key={idx} style={{ marginTop: '2px' }}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Re-Sync Media Button */}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={handleResyncMedia}
                        disabled={resyncingMedia}
                        style={{ height: '32px', padding: '0 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <RefreshCw size={13} className={resyncingMedia ? "sync-spinner" : ""} />
                        <span>{resyncingMedia ? 'Re-synchronizing...' : '🔄 Re-Sync Pending Media & Avatars'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: ADMIN USER MANAGEMENT (Only for Admin users) */}
          {isAdmin && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Users size={22} style={{ color: '#a855f7' }} />
                  <h3 style={{ margin: 0 }}>User Management & Administration</h3>
                </div>
                <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  ★ Admin Only
                </span>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Manage registered user accounts, reset passwords, or permanently remove users and all their associated travel data from this server.
              </p>

              {adminLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '12px 0' }}>
                  <RefreshCw size={14} className="sync-spinner" />
                  <span>Loading user registry...</span>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '10px 14px' }}>User</th>
                        <th style={{ padding: '10px 14px' }}>Role</th>
                        <th style={{ padding: '10px 14px' }}>Joined Date</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsersList.map(u => {
                        const isCurrentAccount = (u.id === userId);
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border-glass)', background: isCurrentAccount ? 'rgba(168, 85, 247, 0.05)' : 'transparent' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <User size={16} style={{ color: u.is_admin ? '#c084fc' : 'var(--text-secondary)' }} />
                                <span>{u.username}</span>
                                {isCurrentAccount && (
                                  <span style={{ fontSize: '0.7rem', color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                                    (You)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {u.is_admin ? (
                                <span style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ★ Admin
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Standard User</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  title="Reset Password"
                                  onClick={() => { setSelectedResetUser(u); setResetNewPassword(''); }}
                                  style={{ padding: '6px', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.3)', background: 'rgba(192, 132, 252, 0.1)', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                  <Key size={14} />
                                </button>
                                {!isCurrentAccount && (
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    title="Delete User"
                                    onClick={() => setSelectedDeleteUser(u)}
                                    style={{ padding: '6px', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
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

          {/* ADMIN RESET PASSWORD MODAL */}
          {selectedResetUser && (
            <div className="modal-overlay" style={{ zIndex: 1000 }}>
              <div className="modal-container" style={{ maxWidth: '420px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                    <Key size={18} style={{ color: '#c084fc' }} /> Reset Password for "{selectedResetUser.username}"
                  </h3>
                  <button type="button" className="btn-icon" onClick={() => setSelectedResetUser(null)}>
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleAdminResetPassword}>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Enter new password (min 4 chars)"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      required
                      minLength={4}
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedResetUser(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={adminActionLoading}>
                      {adminActionLoading ? 'Updating...' : 'Save New Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* PERMANENT DATA DELETION WARNING MODAL */}
          {selectedDeleteUser && (
            <div className="modal-overlay" style={{ zIndex: 1000 }}>
              <div className="modal-container" style={{ maxWidth: '480px', padding: '24px', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                    <Trash2 size={20} /> Permanent Data Deletion Warning
                  </h3>
                  <button type="button" className="btn-icon" onClick={() => setSelectedDeleteUser(null)}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '14px', borderRadius: '6px', color: '#f87171', fontSize: '0.85rem', marginBottom: '20px' }}>
                  <strong>⚠️ CAUTION: Irreversible Action</strong>
                  <p style={{ margin: '8px 0 0 0', lineHeight: '1.4' }}>
                    Are you sure you want to permanently delete user account <strong>"{selectedDeleteUser.username}"</strong>?
                  </p>
                  <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                    <li>All saved locations, places & custom folders</li>
                    <li>All trips, daily itineraries, reservations & expenses</li>
                    <li>All travel guides, saved markdowns & AI imports</li>
                    <li>All companion profiles, home addresses & settings</li>
                    <li>All uploaded photos, receipts & document attachments</li>
                  </ul>
                  <p style={{ margin: '8px 0 0 0', fontWeight: 'bold' }}>
                    This operation will delete all database records and disk files. It CANNOT be undone!
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedDeleteUser(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleAdminDeleteUser}
                    disabled={adminActionLoading}
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    {adminActionLoading ? 'Deleting Data...' : '🔴 Delete User & Wipe All Data'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SAVED ADDRESSES & HOMES CARD */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Home size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>Saved Home Addresses</h3>
              </div>
            </div>

            {/* Address List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '240px', overflowY: 'auto' }}>
              {userAddresses.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  No home addresses added. Add your home, office, or secondary address below to calculate travel start & return times for trips.
                </p>
              ) : (
                userAddresses.map(addr => (
                  <div key={addr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', border: '1px solid var(--border-glass)', padding: '10px 12px', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexGrow: 1 }}>
                      <MapPin size={18} style={{ color: addr.is_default ? '#4ade80' : 'var(--text-secondary)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {addr.label}
                          {addr.is_default === 1 && (
                            <span style={{ backgroundColor: 'rgba(74, 222, 128, 0.2)', color: '#4ade80', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              ★ Default Home
                            </span>
                          )}
                        </div>
                        {addr.address && <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr.address}</p>}
                        {(addr.latitude && addr.longitude) && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            📍 Coords: {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                      <button className="photo-action-btn" onClick={() => handleEditAddress(addr)} title="Edit address">
                        <Edit2 size={14} />
                      </button>
                      <button className="photo-action-btn" onClick={() => handleDeleteAddress(addr.id)} title="Delete address">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Form to add or edit address */}
            <form onSubmit={handleAddAddress} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem' }}>Address Label Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Primary Home, Office, Vacation House" 
                    value={addressLabel} 
                    onChange={(e) => setAddressLabel(e.target.value)} 
                    required 
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', marginBottom: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={isDefaultHome} 
                      onChange={(e) => setIsDefaultHome(e.target.checked)} 
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    Set Default Home
                  </label>
                </div>
              </div>

              {/* Searchable Address Input with Geocoding Dropdown */}
              <div style={{ position: 'relative' }} ref={addressDropdownRef}>
                <label style={{ fontSize: '0.75rem' }}>Search Address or Paste Coords (Auto-fill)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Type address, city, or paste 'lat, lon'..." 
                  value={addressText} 
                  onChange={(e) => handleSearchAddressQuery(e.target.value)} 
                />
                {addressSearching && (
                  <span style={{ position: 'absolute', right: '10px', top: '32px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Searching...
                  </span>
                )}
                {addressSearchResults.length > 0 && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    background: 'var(--bg-surface-elevated)', 
                    border: '1px solid var(--border-glass)', 
                    borderRadius: '6px', 
                    zIndex: 1000, 
                    maxHeight: '200px', 
                    overflowY: 'auto',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    color: 'var(--text-primary)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--border-glass)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>Search Suggestions ({addressSearchResults.length})</span>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setAddressSearchResults([])} title="Close" />
                    </div>
                    {addressSearchResults.map((res, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          setAddressText(res.display_name);
                          setAddressLat(res.lat);
                          setAddressLon(res.lon);
                          setAddressSearchResults([]);
                        }}
                        style={{ padding: '8px 12px', fontSize: '0.78rem', borderBottom: '1px solid var(--border-glass)', cursor: 'pointer', color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-app)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        📍 {res.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Coordinate Inputs */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem' }}>Latitude (Decimal or paste 'lat, lon')</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. 40.7128" 
                    value={addressLat} 
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseCoordinateString(val);
                      if (parsed) {
                        setAddressLat(parsed.lat);
                        setAddressLon(parsed.lon);
                      } else {
                        setAddressLat(val);
                      }
                    }} 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem' }}>Longitude (Decimal or paste 'lat, lon')</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. -74.0060" 
                    value={addressLon} 
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseCoordinateString(val);
                      if (parsed) {
                        setAddressLat(parsed.lat);
                        setAddressLon(parsed.lon);
                      } else {
                        setAddressLon(val);
                      }
                    }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingAddressId ? '✓ Update Address' : '+ Save Address'}
                </button>
                {editingAddressId && (
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEditAddress} style={{ width: 'auto' }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
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

          {/* PEOPLE & COMPANIONS CARD */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>People & Companions</h3>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleOpenImmichPeopleModal}
                style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', width: 'auto' }}
              >
                <RefreshCw size={14} /> Import from Immich
              </button>
            </div>

            {/* People List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '240px', overflowY: 'auto' }}>
              {peopleList.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  No people added yet. Add family or travel companions below or import directly from Immich.
                </p>
              ) : (
                peopleList.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', border: '1px solid var(--border-glass)', padding: '8px 12px', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.immich_person_id ? (
                        <img
                          src={`/api/immich/person/thumbnail/${p.immich_person_id}?token=${encodeURIComponent(token || localStorage.getItem('token') || '')}`}
                          alt={p.name}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--accent-primary)' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Relation: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{p.relation}</span>
                          {p.immich_person_name && <span style={{ marginLeft: '6px', opacity: 0.8 }}>• Immich: {p.immich_person_name}</span>}
                        </div>
                      </div>
                    </div>
                    <button className="photo-action-btn" onClick={() => handleDeletePerson(p.id)} title="Delete person">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Form to add person */}
            <form onSubmit={handleAddPerson} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '0.75rem' }}>Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Jane Doe" 
                    value={personName} 
                    onChange={(e) => setPersonName(e.target.value)} 
                    required 
                  />
                </div>
                <div style={{ flex: 1.5 }}>
                  <label style={{ fontSize: '0.75rem' }}>Relation</label>
                  <select 
                    className="form-control" 
                    value={personRelation} 
                    onChange={(e) => setPersonRelation(e.target.value)}
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Partner">Partner</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Friend">Friend</option>
                    <option value="Colleague">Colleague</option>
                    <option value="Self">Self</option>
                    <option value="Custom">Custom...</option>
                  </select>
                </div>
              </div>

              {personRelation === 'Custom' && (
                <div>
                  <label style={{ fontSize: '0.75rem' }}>Custom Relation</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Cousin, Guide" 
                    value={customRelation} 
                    onChange={(e) => setCustomRelation(e.target.value)} 
                    required 
                  />
                </div>
              )}

              {selectedImmichPerson && (
                <div style={{ fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} /> Linked to Immich Person: <strong>{selectedImmichPerson.name}</strong>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '4px' }}>
                + Add Person
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* IMMICH PEOPLE SEARCH & IMPORT MODAL */}
      {showImmichPeopleModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '540px', width: '100%', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} style={{ color: 'var(--accent-primary)' }} /> Import People from Immich
              </h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowImmichPeopleModal(false)} />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Filter Immich people by name..." 
                value={immichSearchQuery} 
                onChange={(e) => setImmichSearchQuery(e.target.value)} 
              />
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', padding: '4px' }}>
              {immichPeopleLoading ? (
                <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="sync-spinner" style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0 }}>Connecting to Immich server & fetching recognized people...</p>
                </div>
              ) : immichPeopleList.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <User size={32} style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0 }}>No named people found in your Immich library. Make sure face recognition is enabled in Immich.</p>
                </div>
              ) : (
                immichPeopleList
                  .filter(p => (p.name || '').toLowerCase().includes(immichSearchQuery.toLowerCase()))
                  .map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => {
                        setPersonName(p.name || 'Unnamed Person');
                        setSelectedImmichPerson(p);
                        setShowImmichPeopleModal(false);
                      }}
                      style={{
                        background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', textAlign: 'center'
                      }}
                    >
                      <img 
                        src={`/api/immich/person/thumbnail/${p.id}?token=${encodeURIComponent(token || localStorage.getItem('token') || '')}`} 
                        alt={p.name} 
                        style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-primary)' }} 
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {p.name || 'Unnamed'}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

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
                      style={{ fontWeight: '600', fontSize: '1rem', background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '4px', flexGrow: 1 }}
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
                    <h4 style={{ margin: 0, fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
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
                          backgroundColor: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '4px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 10,
                          minWidth: '100px'
                        }}>
                          <button 
                            style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem' }}
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

      <div style={{ textAlign: 'center', margin: '36px 0 16px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
        TravelBuff {APP_VERSION} • Offline-First Self-Hosted Travel Companion
      </div>
    </div>
  );
}
