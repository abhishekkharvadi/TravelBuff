import React, { useState, useEffect, useRef } from 'react';
import { Cloud, CloudLightning, RefreshCw, LogOut, MapPin, ClipboardList, Settings, Compass, Moon, Edit, Map, Sparkles, User, X, Archive } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './clientDb.js';
import AiImportModal from './components/AiImportModal.jsx';
import AiReviewQueue from './components/AiReviewQueue.jsx';
import AccountModal from './components/AccountModal.jsx';
import ReauthModal from './components/ReauthModal.jsx';
import Login from './components/Login.jsx';
import Locations from './components/Locations.jsx';
import Collections from './components/Collections.jsx';
import TripPlanning from './components/TripPlanning.jsx';
import SettingsTab from './components/Settings.jsx';
import TripMode from './components/TripMode.jsx';
import ArchivedItems from './components/ArchivedItems.jsx';
import OnboardingTour from './components/OnboardingTour.jsx';
import OnboardingChecklist from './components/OnboardingChecklist.jsx';
import ImmichImportProgressModal from './components/ImmichImportProgressModal.jsx';
import WhatsNewModal from './components/WhatsNewModal.jsx';
import { immichImportQueue } from './services/immichImportQueue.js';
import { initSyncManager, registerSyncStatusListener } from './sync.js';
import { populateLocalDb, clearLocalDb } from './clientDb.js';
import { reconcileMissingFolderCovers } from './utils/photoReconciler.js';
import { APP_VERSION } from './version.js';
import { parseRoute, buildHash, navigateToHash, slugify } from './router.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeMode, setActiveMode] = useState(localStorage.getItem('tb_activeMode') || 'planning'); // 'planning' or 'trip'
  
  useEffect(() => {
    localStorage.setItem('tb_activeMode', activeMode);
  }, [activeMode]);

  const [activeTab, setActiveTab] = useState('locations'); // 'locations', 'collections', 'trips', 'settings'
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'syncing', 'offline', 'error'
  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedCol, setSelectedCol] = useState(null);
  const [showAiImport, setShowAiImport] = useState(false);
  const [importMode, setImportMode] = useState('url'); // 'url' or 'document'
  const [importDropdownOpen, setImportDropdownOpen] = useState(false);
  const [showAiReview, setShowAiReview] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resumeMarkdown, setResumeMarkdown] = useState(null);

  // Immich background task queue state
  const [immichQueueState, setImmichQueueState] = useState(immichImportQueue.getState());
  const [showImmichProgressModal, setShowImmichProgressModal] = useState(false);

  useEffect(() => {
    const unsub = immichImportQueue.subscribe(state => {
      setImmichQueueState(state);
    });

    const token = localStorage.getItem('tb_token');
    if (token) {
      immichImportQueue.checkAndResumePending(token);
    }

    return () => unsub();
  }, []);

  // Onboarding Tour & Getting Started Checklist states
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(false);

  // Telemetry Banner state
  const [showTelemetryBanner, setShowTelemetryBanner] = useState(false);

  // App Update Notification & What's New state
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [hasUpdateNotification, setHasUpdateNotification] = useState(false);

  useEffect(() => {
    try {
      const lastSeenVersion = localStorage.getItem('tb_last_seen_version');
      if (lastSeenVersion !== APP_VERSION) {
        setHasUpdateNotification(true);
      }
    } catch (e) {
      console.warn('Could not check update version', e);
    }
  }, []);

  const handleOpenWhatsNew = () => {
    setShowWhatsNewModal(true);
    setHasUpdateNotification(false);
    try {
      localStorage.setItem('tb_last_seen_version', APP_VERSION);
    } catch (e) {}
  };

  const handleDismissUpdateNotification = (e) => {
    if (e) e.stopPropagation();
    setHasUpdateNotification(false);
    try {
      localStorage.setItem('tb_last_seen_version', APP_VERSION);
    } catch (e) {}
  };

  // Auto-launch tour & checklist on user session
  useEffect(() => {
    if (user?.userId) {
      const tourKey = `tb_tour_completed_${user.userId}`;
      const dismissedKey = `tb_checklist_dismissed_${user.userId}`;
      
      const tourDone = localStorage.getItem(tourKey) === 'true';
      const checklistDismissed = localStorage.getItem(dismissedKey) === 'true';

      setShowOnboardingChecklist(!checklistDismissed);

      if (user.isAdmin === 1) {
        const telemetryDismissed = localStorage.getItem('tb_telemetry_banner_dismissed') === 'true';
        setShowTelemetryBanner(!telemetryDismissed);
      }

      if (!tourDone) {
        const timer = setTimeout(() => {
          setShowOnboardingTour(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    }
  }, [user?.userId]);

  // Pull-to-refresh touch states
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [theme, setTheme] = useState(localStorage.getItem('tb_theme') || 'system');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [returnToCollectionId, setReturnToCollectionId] = useState(null);

  const [selectedTripId, setSelectedTripId] = useState(null);

  const activeTabRef = useRef(activeTab);
  const currentFolderIdRef = useRef(currentFolderId);
  const selectedLocationRef = useRef(selectedLocation);
  const selectedTripIdRef = useRef(selectedTripId);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    currentFolderIdRef.current = currentFolderId;
  }, [currentFolderId]);

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  // Router Sync & Browser Back/Forward Navigation Handler
  useEffect(() => {
    const handleRouteSync = async () => {
      const route = parseRoute();
      if (route.tab && route.tab !== activeTabRef.current) {
        setActiveTab(route.tab);
      }

      if (route.tab === 'locations') {
        if (route.folderSlug) {
          try {
            const allLocs = await db.locations.toArray();
            const folder = allLocs.find(l => l.is_folder === 1 && (slugify(l.name) === route.folderSlug || l.id === route.folderSlug));
            if (folder && folder.id !== currentFolderIdRef.current) {
              setCurrentFolderId(folder.id);
            }
          } catch (_) {}
        } else if (!route.locationSlug && currentFolderIdRef.current !== null) {
          setCurrentFolderId(null);
        }

        if (route.locationSlug) {
          try {
            const allLocs = await db.locations.toArray();
            const loc = allLocs.find(l => slugify(l.name) === route.locationSlug || l.id === route.locationSlug);
            if (loc && loc.id !== selectedLocationRef.current) {
              setSelectedLocation(loc.id);
            }
          } catch (_) {}
        } else if (selectedLocationRef.current !== null) {
          setSelectedLocation(null);
        }
      } else if (route.tab === 'collections') {
        if (route.collectionSlug) {
          try {
            const allCols = await db.collections.toArray();
            const col = allCols.find(c => slugify(c.name) === route.collectionSlug || c.id === route.collectionSlug);
            if (col) {
              setSelectedCol(col);
            }
          } catch (_) {}
        } else {
          setSelectedCol(null);
        }
      } else if (route.tab === 'trips') {
        if (route.tripSlug) {
          try {
            const allTrips = await db.trips.toArray();
            const trip = allTrips.find(t => slugify(t.name) === route.tripSlug || t.id === route.tripSlug);
            if (trip && trip.id !== selectedTripIdRef.current) {
              setSelectedTripId(trip.id);
            }
          } catch (_) {}
        } else {
          setSelectedTripId(null);
        }
      }
    };

    handleRouteSync();
    window.addEventListener('hashchange', handleRouteSync);
    window.addEventListener('popstate', handleRouteSync);

    return () => {
      window.removeEventListener('hashchange', handleRouteSync);
      window.removeEventListener('popstate', handleRouteSync);
    };
  }, []);

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    if (tab === 'locations') {
      setSelectedLocation(null);
      setCurrentFolderId(null);
      navigateToHash(buildHash('locations'));
    } else {
      navigateToHash(buildHash(tab));
    }
  };

  const handleFolderSelect = async (folderId) => {
    setCurrentFolderId(folderId);
    if (!folderId) {
      navigateToHash(buildHash('locations'));
      return;
    }
    try {
      const folder = await db.locations.get(folderId);
      const name = folder ? folder.name : null;
      navigateToHash(buildHash('locations', { type: 'folder', name }));
    } catch (_) {
      navigateToHash(buildHash('locations'));
    }
  };

  const handleLocationSelect = async (locOrId) => {
    const locId = typeof locOrId === 'object' && locOrId !== null ? locOrId.id : locOrId;
    setSelectedLocation(locId);
    if (!locId) {
      if (currentFolderId) {
        handleFolderSelect(currentFolderId);
      } else {
        navigateToHash(buildHash('locations'));
      }
      return;
    }
    try {
      const loc = typeof locOrId === 'object' && locOrId !== null ? locOrId : await db.locations.get(locId);
      const name = loc ? loc.name : null;
      navigateToHash(buildHash('locations', { type: 'item', name }));
    } catch (_) {
      navigateToHash(buildHash('locations'));
    }
  };

  const handleCollectionSelect = async (colOrId) => {
    if (!colOrId) {
      setSelectedCol(null);
      navigateToHash(buildHash('collections'));
      return;
    }
    const col = typeof colOrId === 'object' ? colOrId : await db.collections.get(colOrId);
    setSelectedCol(col);
    if (col && col.name) {
      navigateToHash(buildHash('collections', { name: col.name }));
    } else {
      navigateToHash(buildHash('collections'));
    }
  };

  const handleTripSelect = async (tripOrId) => {
    if (!tripOrId) {
      setSelectedTripId(null);
      navigateToHash(buildHash('trips'));
      return;
    }
    const trip = typeof tripOrId === 'object' ? tripOrId : await db.trips.get(tripOrId);
    if (trip) {
      setSelectedTripId(trip.id);
      if (trip.name) {
        navigateToHash(buildHash('trips', { name: trip.name }));
      } else {
        navigateToHash(buildHash('trips'));
      }
    } else {
      setSelectedTripId(null);
      navigateToHash(buildHash('trips'));
    }
  };

  const handleNavigateToLocationFromCollection = async (locId, colId) => {
    setSelectedLocation(locId);
    setReturnToCollectionId(colId);
    setActiveTab('locations');
    try {
      const loc = await db.locations.get(locId);
      const name = loc ? loc.name : null;
      navigateToHash(buildHash('locations', { type: 'item', name }));
    } catch (_) {
      navigateToHash(buildHash('locations'));
    }
  };

  const handleReturnToCollection = async () => {
    const colId = returnToCollectionId;
    setReturnToCollectionId(null);
    setSelectedLocation(null);
    setActiveTab('collections');
    if (colId) {
      try {
        const col = await db.collections.get(colId);
        if (col && col.name) {
          navigateToHash(buildHash('collections', { name: col.name }));
          return;
        }
      } catch (_) {}
    }
    navigateToHash(buildHash('collections'));
  };

  useEffect(() => {
    const applyTheme = (currentTheme) => {
      if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
      } else if (currentTheme === 'dark') {
        document.body.classList.remove('light-theme');
      } else {
        const isSystemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        if (isSystemLight) {
          document.body.classList.add('light-theme');
        } else {
          document.body.classList.remove('light-theme');
        }
      }
    };

    applyTheme(theme);
    localStorage.setItem('tb_theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      const handler = (e) => {
        if (e.matches) {
          document.body.classList.add('light-theme');
        } else {
          document.body.classList.remove('light-theme');
        }
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const pendingImports = useLiveQuery(
    () => db.ai_imports ? db.ai_imports.where('status').equals('pending').toArray() : Promise.resolve([]),
    [], []
  );
  const pendingCount = pendingImports?.length || 0;

  const allLocationsForReconcile = useLiveQuery(
    () => db.locations ? db.locations.toArray() : Promise.resolve([]),
    [], []
  );
  const allPhotosForReconcile = useLiveQuery(
    () => db.entity_photos ? db.entity_photos.toArray() : Promise.resolve([]),
    [], []
  );

  const hasReconciledRef = useRef(false);

  // Startup background cover photo reconciler (max 2 attempts per folder, strictly once on startup)
  useEffect(() => {
    if (!hasReconciledRef.current && user?.token && allLocationsForReconcile && allLocationsForReconcile.length > 0) {
      hasReconciledRef.current = true;
      reconcileMissingFolderCovers(allLocationsForReconcile, allPhotosForReconcile || [], user.token);
    }
  }, [user?.token, allLocationsForReconcile]);

  // 1. Recover session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('tb_token');
    const savedUsername = localStorage.getItem('tb_username');
    const savedUserId = localStorage.getItem('tb_userId');
    const savedOwnTracksKey = localStorage.getItem('tb_owntracksKey');
    const savedProfilePicture = localStorage.getItem('tb_profilePicture');
    const savedIsAdmin = localStorage.getItem('tb_isAdmin') === '1' ? 1 : 0;

    if (savedToken && savedUsername && savedUserId) {
      const userData = {
        token: savedToken,
        username: savedUsername,
        userId: savedUserId,
        isAdmin: savedIsAdmin,
        profilePicture: savedProfilePicture,
        owntracksKey: savedOwnTracksKey
      };
      setUser(userData);
      
      // Start offline database syncing
      initSync(userData.token);
    }
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn('[Auth Event] Received tb_auth_expired event.');
      setShowReauthModal(true);
    };

    const handleTokenRefreshed = (e) => {
      const newToken = e.detail?.token;
      if (newToken) {
        setUser(prev => prev ? { ...prev, token: newToken } : prev);
      }
    };

    window.addEventListener('tb_auth_expired', handleAuthExpired);
    window.addEventListener('tb_token_refreshed', handleTokenRefreshed);

    return () => {
      window.removeEventListener('tb_auth_expired', handleAuthExpired);
      window.removeEventListener('tb_token_refreshed', handleTokenRefreshed);
    };
  }, []);

  const fetchUserConfig = async (token) => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const refreshedToken = res.headers?.get('X-Refreshed-Token');
      if (refreshedToken) {
        localStorage.setItem('tb_token', refreshedToken);
        setUser(prev => prev ? { ...prev, token: refreshedToken } : prev);
      }

      if (res.status === 401 || res.status === 403) {
        console.warn('[Auth] Stale or invalid session token. Prompting for re-authentication...');
        setShowReauthModal(true);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.isAdmin !== undefined) {
            setUser(prev => {
              if (!prev) return prev;
              if (prev.isAdmin === data.isAdmin) return prev;
              return { ...prev, isAdmin: data.isAdmin };
            });
            localStorage.setItem('tb_isAdmin', data.isAdmin ? '1' : '0');
          }
          if (data.config && data.config.ai_settings) {
            try {
              const aiOpts = JSON.parse(data.config.ai_settings);
              if (aiOpts.activeMode && aiOpts.activeMode !== activeMode) {
                setActiveMode(aiOpts.activeMode);
              }
            } catch (e) {
              console.error('Failed to parse ai_settings in App.jsx:', e);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user config (offline or network error):', err);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchUserConfig(user.token);
    }
  }, [user?.token]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user?.token) {
        fetchUserConfig(user.token);
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, [user?.token]);

  const handleToggleMode = async (mode) => {
    setActiveMode(mode);
    if (!user?.token) return;

    try {
      const configRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        const current = configData.config || {};
        
        let aiOpts = {};
        try {
          aiOpts = JSON.parse(current.ai_settings || '{}');
        } catch (e) {}
        
        aiOpts.activeMode = mode;
        
        const payload = {
          immich_url: current.immich_url || '',
          immich_key: current.immich_key || '',
          immich_alt_url: current.immich_alt_url || '',
          base_currency: current.base_currency || 'USD',
          ai_settings: JSON.stringify(aiOpts)
        };

        await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (err) {
      console.error('Failed to sync activeMode to backend:', err);
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuOpen && !e.target.closest('.user-menu-container')) {
        setUserMenuOpen(false);
      }
      if (importDropdownOpen && !e.target.closest('.import-menu-container')) {
        setImportDropdownOpen(false);
      }
      if (mobileMenuOpen && !e.target.closest('.mobile-profile-container')) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [userMenuOpen, mobileMenuOpen, importDropdownOpen]);

  const initSync = (token) => {
    registerSyncStatusListener((status) => {
      setSyncStatus(status);
      if (status === 'synced') {
        fetchUserConfig(token);
      }
    });
    // Start background sync hooks
    initSyncManager(() => token);
  };

  const handleLoginSuccess = async (data, trustDevice) => {
    if (trustDevice) {
      localStorage.setItem('tb_token', data.token);
      localStorage.setItem('tb_username', data.username);
      localStorage.setItem('tb_userId', data.userId);
      localStorage.setItem('tb_isAdmin', data.isAdmin ? '1' : '0');
      if (data.owntracksKey) {
        localStorage.setItem('tb_owntracksKey', data.owntracksKey);
      }
      if (data.profilePicture) {
        localStorage.setItem('tb_profilePicture', data.profilePicture);
      }
    } else {
      // Just temporarily keep token in state
      sessionStorage.setItem('tb_session_token', data.token);
    }

    if (data.isNewUser) {
      localStorage.removeItem(`tb_tour_completed_${data.userId}`);
      localStorage.removeItem(`tb_checklist_dismissed_${data.userId}`);
      localStorage.removeItem(`tb_checklist_collapsed_${data.userId}`);
      localStorage.removeItem('tb_tour_completed');
      localStorage.removeItem('tb_checklist_dismissed');
      setShowOnboardingChecklist(true);
      setTimeout(() => setShowOnboardingTour(true), 600);
    }

    setUser(data);
    
    // Sync status manager
    initSync(data.token);

    // Initial database pull from server
    setSyncStatus('syncing');
    await populateLocalDb(data.token);
    setSyncStatus('synced');
  };

  const handleReauthSuccess = async (data) => {
    localStorage.setItem('tb_token', data.token);
    localStorage.setItem('tb_username', data.username);
    localStorage.setItem('tb_userId', data.userId);
    localStorage.setItem('tb_isAdmin', data.isAdmin ? '1' : '0');
    if (data.owntracksKey) {
      localStorage.setItem('tb_owntracksKey', data.owntracksKey);
    }
    if (data.profilePicture) {
      localStorage.setItem('tb_profilePicture', data.profilePicture);
    }

    setUser(data);
    setShowReauthModal(false);

    // Sync status manager
    initSync(data.token);

    // Resume database sync
    setSyncStatus('syncing');
    try {
      await populateLocalDb(data.token);
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Post-reauth sync error:', err);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_username');
    localStorage.removeItem('tb_userId');
    localStorage.removeItem('tb_isAdmin');
    localStorage.removeItem('tb_owntracksKey');
    localStorage.removeItem('tb_profilePicture');
    sessionStorage.removeItem('tb_session_token');
    
    await clearLocalDb();
    setUser(null);
    setActiveMode('planning');
    setActiveTab('locations');
  };

  const handleProfileUpdated = (newPic) => {
    setUser(prev => {
      if (!prev) return prev;
      localStorage.setItem('tb_profilePicture', newPic);
      return { ...prev, profilePicture: newPic };
    });
  };

  // Pull-to-refresh event handlers
  const handleTouchStart = (e) => {
    if (document.documentElement.scrollTop === 0) {
      setStartY(e.touches[0].clientY);
      setPulling(true);
    }
  };

  const handleTouchMove = (e) => {
    if (!pulling) return;
    const y = e.touches[0].clientY;
    const diff = y - startY;
    if (diff > 0) {
      // Limit pulling displacement
      if (diff < 120) {
        setCurrentY(diff);
      }
    } else {
      setPulling(false);
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling) return;
    setPulling(false);
    if (currentY > 70 && !refreshing) {
      setRefreshing(true);
      console.log('[Pull to Refresh] Syncing database...');
      try {
        await initSyncManager(() => user?.token);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(err);
      } finally {
        setRefreshing(false);
      }
    }
    setCurrentY(0);
  };

  if (isInitializing) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-secondary)'
      }}>
        <RefreshCw className="sync-spinner" size={40} style={{ color: 'var(--accent-primary)', marginBottom: '16px' }} />
        <p style={{ fontFamily: 'var(--font-brand)', fontSize: '1.1rem' }}>Loading TravelBuff...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-shell" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* Pull-to-refresh spinner */}
      {(currentY > 0 || refreshing) && (
        <div style={{
          position: 'fixed',
          top: `${Math.min(currentY - 40, 40)}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-glass)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          transition: refreshing ? 'top 0.2s ease' : 'none'
        }}>
          <RefreshCw size={18} className={refreshing ? "sync-spinner" : ""} style={{ transform: `rotate(${currentY * 3}deg)`, color: 'var(--accent-primary)' }} />
        </div>
      )}
      {/* Universal Header */}
      <header className="app-header">
        <div 
          className="brand" 
          onClick={() => { setActiveMode('planning'); setActiveTab('locations'); setSelectedLocation(null); setCurrentFolderId(null); }}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
        >
          <img 
            src={theme === 'light' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? '/logo-light.png' : '/logo-dark.png'} 
            alt="TravelBuff" 
          style={{ height: '32px', display: 'block', objectFit: 'contain' }}
          />
        </div>

        {/* Top PWA Navbar inside Header (Only displayed in Planning Mode, hidden on mobile) */}
        {activeMode === 'planning' && (
          <nav className="header-nav no-print">
            <button
              id="tour-nav-locations"
              className={`nav-link ${activeTab === 'locations' ? 'active' : ''}`}
              onClick={() => { handleTabSelect('locations'); setSelectedLocation(null); setCurrentFolderId(null); }}
            >
              <MapPin size={20} />
              <span>Locations</span>
            </button>
            <button
              id="tour-nav-collections"
              className={`nav-link ${activeTab === 'collections' ? 'active' : ''}`}
              onClick={() => { handleTabSelect('collections'); setSelectedCol(null); }}
            >
              <Compass size={20} />
              <span>Collections</span>
            </button>
            <button
              id="tour-nav-trips"
              className={`nav-link ${activeTab === 'trips' ? 'active' : ''}`}
              onClick={() => handleTabSelect('trips')}
            >
              <ClipboardList size={20} />
              <span>Trips</span>
            </button>
          </nav>
        )}

        <div className="header-controls">
          {/* Immich Task Queue Header Indicator */}
          {immichQueueState.status !== 'idle' && (
            <div 
              onClick={() => setShowImmichProgressModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '32px',
                padding: '0 10px',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: immichQueueState.status === 'completed' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                border: immichQueueState.status === 'completed' ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(99, 102, 241, 0.4)',
                color: immichQueueState.status === 'completed' ? 'var(--success)' : 'var(--accent-primary-hover)',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s ease',
                userSelect: 'none'
              }}
              title={immichQueueState.status === 'completed' ? "Immich import finished. Click to review summary." : `Enriching Immich locations: ${immichQueueState.completed}/${immichQueueState.total}. Click to view progress.`}
            >
              {immichQueueState.status === 'completed' ? (
                <>
                  <span style={{ fontSize: '13px' }}>✨</span>
                  <span>Immich Done</span>
                </>
              ) : (
                <>
                  <RefreshCw size={13} className="sync-spinner" style={{ color: 'var(--accent-primary)' }} />
                  <span>Immich ({immichQueueState.completed}/{immichQueueState.total})</span>
                </>
              )}
            </div>
          )}

          {/* Sync Status Badge */}
          <div className={`sync-badge ${syncStatus}`}>
            {syncStatus === 'synced' && (
              <>
                <Cloud size={14} />
                <span className="sync-text">Synced</span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw size={14} className="sync-spinner" />
                <span className="sync-text">Syncing</span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <Cloud size={14} />
                <span className="sync-text">Offline</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <CloudLightning size={14} />
                <span className="sync-text">Sync Error</span>
              </>
            )}
          </div>

          {/* Mode toggle */}
          <div id="tour-nav-trip-mode" className="mode-switch-wrapper">
            <button
              className={`mode-btn ${activeMode === 'planning' ? 'active' : ''}`}
              onClick={() => handleToggleMode('planning')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Planning"
            >
              <Edit size={16} />
              <span className="desktop-only-text">Planning</span>
            </button>
            <button
              className={`mode-btn ${activeMode === 'trip' ? 'active' : ''}`}
              onClick={() => handleToggleMode('trip')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Trip Mode"
            >
              <Map size={16} />
              <span className="desktop-only-text">Trip Mode</span>
            </button>
          </div>

          {/* AI Import Dropdown Button */}
          <div id="tour-nav-import" className="no-print import-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button 
              className="mode-btn"
              onClick={() => setImportDropdownOpen(!importDropdownOpen)}
              style={{
                height: '36px',
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'var(--accent-primary)',
                color: '#000',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Import Content"
            >
              <Sparkles size={16} />
              <span className="desktop-only-text">Import</span>
              <span style={{ fontSize: '0.7rem' }}>▾</span>
            </button>

            {importDropdownOpen && (
              <div 
                style={{
                  position: 'absolute',
                  top: '42px',
                  right: 0,
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  zIndex: 1100,
                  minWidth: '160px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                    background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 500, textAlign: 'left'
                  }}
                  onClick={() => {
                    setImportMode('url');
                    setShowAiImport(true);
                    setImportDropdownOpen(false);
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-app)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  🌐 Import Trip
                </button>
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                    background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 500, textAlign: 'left', borderTop: '1px solid var(--border-glass)'
                  }}
                  onClick={() => {
                    setImportMode('document');
                    setShowAiImport(true);
                    setImportDropdownOpen(false);
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-app)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📄 Import Document
                </button>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div id="tour-user-menu" className="desktop-only-block user-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button 
              className="no-print"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                background: pendingCount > 0 ? 'var(--error)' : 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border-glass)',
                borderRadius: '50%',
                width: '36px', height: '36px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: pendingCount > 0 ? '#fff' : 'var(--text-secondary)',
                position: 'relative'
              }}
            >
              {user.profilePicture ? (
                <img src={user.profilePicture} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <User size={16} />
              )}
              {pendingCount > 0 && (
                <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '12px', height: '12px', background: 'red', borderRadius: '50%', border: '2px solid var(--bg-app)' }} />
              )}
            </button>

            {userMenuOpen && (
              <div className="user-dropdown no-print" style={{
                position: 'absolute', top: '100%', right: '0', marginTop: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', padding: '8px 0', minWidth: '220px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}>
                <button onClick={() => { handleTabSelect('settings'); setUserMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={16} /> Settings
                </button>
                <button onClick={() => { handleOpenWhatsNew(); setUserMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} style={{ color: 'var(--accent-primary-hover)' }} /> What's New ({APP_VERSION})
                </button>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Theme Mode</span>
                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '2px', borderRadius: '4px' }}>
                    {['system', 'light', 'dark'].map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '0.65rem',
                          background: theme === t ? 'var(--accent-primary)' : 'transparent',
                          color: theme === t ? '#000' : 'var(--text-secondary)',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          textTransform: 'capitalize'
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <button onClick={() => { handleLogout(); setUserMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--error)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LogOut size={16} /> Logout
                </button>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <div 
                  onClick={() => { handleOpenWhatsNew(); setUserMenuOpen(false); }}
                  style={{ padding: '6px 16px', fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.8, cursor: 'pointer' }}
                  title="Click to view release notes"
                >
                  TravelBuff {APP_VERSION}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="app-container">
        {/* App Version Update Notification Banner */}
        {hasUpdateNotification && (
          <div className="no-print" style={{
            background: 'linear-gradient(90deg, rgba(124, 58, 237, 0.9), rgba(59, 130, 246, 0.9))',
            color: '#ffffff',
            padding: '10px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
            fontSize: '0.88rem',
            fontWeight: 500
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={handleOpenWhatsNew}>
              <Sparkles size={16} style={{ color: '#fef08a' }} />
              <span>
                <strong>TravelBuff has been updated to {APP_VERSION}!</strong> <span style={{ textDecoration: 'underline', opacity: 0.95, marginLeft: '4px' }}>Click here to review all updates & changes →</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleDismissUpdateNotification}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.8
              }}
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Connection Offline/Reconnecting Alert Banner */}
        {syncStatus === 'offline' && (
          <div className="offline-banner no-print">
            <CloudLightning size={16} />
            <span>You are currently working offline. Changes will automatically sync when connection restores.</span>
          </div>
        )}

        {/* Global Sync Error Alert */}
        {syncStatus === 'error' && (
          <div className="sync-error-banner no-print">
            <span>Sync encountered an issue. Local changes are saved and will retry automatically.</span>
            <button onClick={() => triggerSync()} className="btn-retry">Retry Now</button>
          </div>
        )}

        {/* AI Processing Queue Indicator / Drawer Trigger */}
        {pendingCount > 0 && (
          <div className="ai-queue-floating-pill no-print" onClick={() => setShowAiReview(true)}>
            <Sparkles size={16} className="sparkle-pulse" />
            <span>{pendingCount} AI Import{pendingCount > 1 ? 's' : ''} Ready to Review</span>
          </div>
        )}

          {showWhatsNewModal && (
            <WhatsNewModal
              isOpen={showWhatsNewModal}
              onClose={() => setShowWhatsNewModal(false)}
              onNavigateTab={handleTabSelect}
            />
          )}
          {showAiImport && <AiImportModal token={user.token} initialMode={importMode} resumeMarkdown={resumeMarkdown} onClose={() => { setShowAiImport(false); setResumeMarkdown(null); }} />}
          {showAiReview && <AiReviewQueue items={pendingImports || []} onClose={() => setShowAiReview(false)} />}
          {showAccountModal && <AccountModal token={user.token} profilePicture={user.profilePicture} username={user.username} onClose={() => setShowAccountModal(false)} onProfileUpdated={handleProfileUpdated} />}
          {showReauthModal && user && (
            <ReauthModal
              username={user.username}
              onReauthSuccess={handleReauthSuccess}
              onForceLogout={() => {
                setShowReauthModal(false);
                handleLogout();
              }}
            />
          )}

          {/* Telemetry Notice Banner */}
          {showTelemetryBanner && (
            <div style={{ background: 'var(--accent-primary-glow)', borderBottom: '1px solid var(--accent-primary)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                <strong>🚀 Help Improve TravelBuff!</strong> We collect 100% anonymous usage stats to guide development. Zero personal data or location data is tracked. 
                <a href="https://travelbuff.app/#privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary-hover)', marginLeft: '6px' }}>Learn More</a>. 
                You can manage this in <button onClick={() => handleTabSelect('settings')} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary-hover)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Settings</button>.
              </div>
              <button 
                onClick={() => {
                  localStorage.setItem('tb_telemetry_banner_dismissed', 'true');
                  setShowTelemetryBanner(false);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Main Pages Switcher */}
          <main style={{ flexGrow: 1 }}>
            {activeMode === 'trip' ? (
              <TripMode token={user.token} />
            ) : (
              <>
                {activeTab === 'locations' && (
                  <Locations 
                    token={user.token} 
                    selectedLocation={selectedLocation} 
                    setSelectedLocation={handleLocationSelect} 
                    currentFolderId={currentFolderId} 
                    setCurrentFolderId={handleFolderSelect} 
                    returnToCollectionId={returnToCollectionId}
                    onReturnToCollection={handleReturnToCollection}
                    onNavigate={handleTabSelect}
                  />
                )}
                {activeTab === 'collections' && (
                  <Collections 
                    token={user.token} 
                    selectedCol={selectedCol} 
                    setSelectedCol={handleCollectionSelect} 
                    onNavigateToLocation={handleNavigateToLocationFromCollection}
                  />
                )}
                {activeTab === 'trips' && (
                  <TripPlanning 
                    token={user.token} 
                    selectedTripId={selectedTripId}
                    onSelectTrip={handleTripSelect}
                  />
                )}
                {activeTab === 'archived' && (
                  <ArchivedItems 
                    token={user.token}
                    onNavigate={handleTabSelect}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsTab 
                    token={user.token} 
                    userId={user.userId} 
                    username={user.username}
                    profilePicture={user.profilePicture}
                    onProfileUpdated={handleProfileUpdated}
                    onLogout={handleLogout} 
                    onResumeMarkdown={(md) => { setResumeMarkdown(md); setShowAiImport(true); }} 
                    onRestartTour={() => setShowOnboardingTour(true)}
                    onOpenWhatsNew={handleOpenWhatsNew}
                    onShowChecklist={() => {
                      setShowOnboardingChecklist(true);
                      if (user?.userId) {
                        localStorage.removeItem(`tb_checklist_dismissed_${user.userId}`);
                        localStorage.removeItem(`tb_checklist_collapsed_${user.userId}`);
                      }
                      localStorage.removeItem('tb_checklist_dismissed');
                      localStorage.removeItem('tb_checklist_collapsed');
                    }}
                    onNavigate={handleTabSelect}
                  />
                )}
              </>
            )}
          </main>

      {/* Mobile Bottom Navigation Bar (visible only in mobile view via CSS) */}
      {activeMode === 'planning' && (
        <nav className="mobile-bottom-nav no-print">
          <button
            className={`mobile-nav-link ${activeTab === 'locations' ? 'active' : ''}`}
            onClick={() => { handleTabSelect('locations'); setSelectedLocation(null); handleFolderSelect(null); }}
          >
            <MapPin size={20} />
            <span>Locations</span>
          </button>
          <button
            className={`mobile-nav-link ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => { handleTabSelect('collections'); setSelectedCol(null); }}
          >
            <Compass size={20} />
            <span>Collections</span>
          </button>
          <button
            className={`mobile-nav-link ${activeTab === 'trips' ? 'active' : ''}`}
            onClick={() => handleTabSelect('trips')}
          >
            <ClipboardList size={20} />
            <span>Trips</span>
          </button>
          <button
            className={`mobile-nav-link mobile-profile-container ${mobileMenuOpen ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ position: 'relative' }}
          >
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Avatar" style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <User size={20} />
            )}
            <span>Profile</span>

            {mobileMenuOpen && (
              <div className="mobile-user-dropdown" style={{
                position: 'absolute', bottom: '60px', right: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', padding: '8px 0', minWidth: '180px', zIndex: 9999, boxShadow: '0 -10px 30px rgba(0,0,0,0.5)'
              }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { handleTabSelect('settings'); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={16} /> Settings
                </button>
                <button onClick={() => { handleOpenWhatsNew(); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} style={{ color: 'var(--accent-primary-hover)' }} /> What's New ({APP_VERSION})
                </button>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Theme Mode</span>
                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '2px', borderRadius: '4px' }}>
                    {['system', 'light', 'dark'].map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '0.65rem',
                          background: theme === t ? 'var(--accent-primary)' : 'transparent',
                          color: theme === t ? '#000' : 'var(--text-secondary)',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          textTransform: 'capitalize'
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--error)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LogOut size={16} /> Logout
                </button>
                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
                <div 
                  onClick={() => { handleOpenWhatsNew(); setMobileMenuOpen(false); }}
                  style={{ padding: '6px 16px', fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.8, cursor: 'pointer' }}
                  title="Click to view release notes"
                >
                  TravelBuff {APP_VERSION}
                </div>
              </div>
            )}
          </button>
        </nav>
      )}

      {/* Interactive UI Spotlight Tour */}
      <OnboardingTour
        isOpen={showOnboardingTour}
        userId={user?.userId}
        onClose={() => setShowOnboardingTour(false)}
        onNavigateTab={(tab) => {
          handleTabSelect(tab);
          if (tab === 'locations') {
            setSelectedLocation(null);
            setCurrentFolderId(null);
          } else if (tab === 'collections') {
            setSelectedCol(null);
          }
        }}
      />

      {/* Getting Started Progress Checklist */}
      <OnboardingChecklist
        isVisible={showOnboardingChecklist && activeMode === 'planning'}
        userId={user?.userId}
        onClose={() => {
          setShowOnboardingChecklist(false);
          if (user?.userId) {
            localStorage.setItem(`tb_checklist_dismissed_${user.userId}`, 'true');
          }
          localStorage.setItem('tb_checklist_dismissed', 'true');
        }}
        onOpenTour={() => setShowOnboardingTour(true)}
        onNavigateTab={(tab) => {
          handleTabSelect(tab);
          if (tab === 'locations') {
            setSelectedLocation(null);
            setCurrentFolderId(null);
          } else if (tab === 'collections') {
            setSelectedCol(null);
          }
        }}
        onOpenImport={(mode) => {
          setImportMode(mode || 'url');
          setShowAiImport(true);
        }}
      />

      {/* Immich Import Progress / Background Task Modal */}
      <ImmichImportProgressModal
        isOpen={showImmichProgressModal}
        onClose={() => setShowImmichProgressModal(false)}
      />
      </div>
    </div>
  );
}
