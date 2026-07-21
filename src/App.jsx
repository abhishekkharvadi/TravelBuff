import React, { useState, useEffect } from 'react';
import { Cloud, CloudLightning, RefreshCw, LogOut, MapPin, ClipboardList, Settings, Compass, Moon, Edit, Map, Sparkles, User } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './clientDb.js';
import AiImportModal from './components/AiImportModal.jsx';
import AiReviewQueue from './components/AiReviewQueue.jsx';
import AccountModal from './components/AccountModal.jsx';
import Login from './components/Login.jsx';
import Locations from './components/Locations.jsx';
import Collections from './components/Collections.jsx';
import TripPlanning from './components/TripPlanning.jsx';
import SettingsTab from './components/Settings.jsx';
import TripMode from './components/TripMode.jsx';
import { initSyncManager, registerSyncStatusListener } from './sync.js';
import { populateLocalDb, clearLocalDb } from './clientDb.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeMode, setActiveMode] = useState('planning'); // 'planning' or 'trip'
  const [activeTab, setActiveTab] = useState('locations'); // 'locations', 'collections', 'trips', 'settings'
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'syncing', 'offline', 'error'
  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedCol, setSelectedCol] = useState(null);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showAiReview, setShowAiReview] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resumeMarkdown, setResumeMarkdown] = useState(null);

  // Pull-to-refresh touch states
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Theme states
  const [theme, setTheme] = useState(localStorage.getItem('tb_theme') || 'system');
  const [currentFolderId, setCurrentFolderId] = useState(null);

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

  // 1. Recover session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('tb_token');
    const savedUsername = localStorage.getItem('tb_username');
    const savedUserId = localStorage.getItem('tb_userId');
    const savedOwnTracksKey = localStorage.getItem('tb_owntracksKey');
    const savedProfilePicture = localStorage.getItem('tb_profilePicture');

    if (savedToken && savedUsername && savedUserId) {
      const userData = {
        token: savedToken,
        username: savedUsername,
        userId: savedUserId,
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
    const handleOutsideClick = (e) => {
      if (userMenuOpen && !e.target.closest('.user-menu-container')) {
        setUserMenuOpen(false);
      }
      if (mobileMenuOpen && !e.target.closest('.mobile-profile-container')) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [userMenuOpen, mobileMenuOpen]);

  const initSync = (token) => {
    registerSyncStatusListener((status) => {
      setSyncStatus(status);
    });
    // Start background sync hooks
    initSyncManager(() => token);
  };

  const handleLoginSuccess = async (data, trustDevice) => {
    if (trustDevice) {
      localStorage.setItem('tb_token', data.token);
      localStorage.setItem('tb_username', data.username);
      localStorage.setItem('tb_userId', data.userId);
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

    setUser(data);
    
    // Sync status manager
    initSync(data.token);

    // Initial database pull from server
    setSyncStatus('syncing');
    await populateLocalDb(data.token);
    setSyncStatus('synced');
  };

  const handleLogout = async () => {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_username');
    localStorage.removeItem('tb_userId');
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
              className={`nav-link ${activeTab === 'locations' ? 'active' : ''}`}
              onClick={() => { setActiveTab('locations'); setSelectedLocation(null); setCurrentFolderId(null); }}
            >
              <MapPin size={20} />
              <span>Locations</span>
            </button>
            <button
              className={`nav-link ${activeTab === 'collections' ? 'active' : ''}`}
              onClick={() => { setActiveTab('collections'); setSelectedCol(null); }}
            >
              <Compass size={20} />
              <span>Collections</span>
            </button>
            <button
              className={`nav-link ${activeTab === 'trips' ? 'active' : ''}`}
              onClick={() => setActiveTab('trips')}
            >
              <ClipboardList size={20} />
              <span>Trips</span>
            </button>
          </nav>
        )}

        <div className="header-controls">
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
          <div className="mode-switch-wrapper">
            <button
              className={`mode-btn ${activeMode === 'planning' ? 'active' : ''}`}
              onClick={() => setActiveMode('planning')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Planning"
            >
              <Edit size={16} />
              <span className="desktop-only-text">Planning</span>
            </button>
            <button
              className={`mode-btn ${activeMode === 'trip' ? 'active' : ''}`}
              onClick={() => setActiveMode('trip')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Trip Mode"
            >
              <Map size={16} />
              <span className="desktop-only-text">Trip Mode</span>
            </button>
          </div>

          {/* AI Import Button */}
          <button 
            className="no-print mode-btn"
            onClick={() => setShowAiImport(true)}
            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-primary)', color: '#000', border: 'none' }}
            title="Import with AI"
          >
            <Sparkles size={16} />
            <span className="desktop-only-text" style={{ fontWeight: 600 }}>Import URL</span>
          </button>

          {/* User Profile Dropdown */}
          <div className="desktop-only-block user-menu-container" style={{ position: 'relative' }}>
            <button 
              className="no-print"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                background: pendingCount > 0 ? 'var(--error)' : 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border-glass)',
                borderRadius: '50%',
                width: '32px', height: '32px',
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
                <button onClick={() => { setActiveTab('settings'); setUserMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={16} /> Settings
                </button>
                <button onClick={() => { setShowAccountModal(true); setUserMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} /> Account Management
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
              </div>
            )}
          </div>
        </div>
      </header>

          {showAiImport && <AiImportModal token={user.token} resumeMarkdown={resumeMarkdown} onClose={() => { setShowAiImport(false); setResumeMarkdown(null); }} />}
          {showAiReview && <AiReviewQueue items={pendingImports || []} onClose={() => setShowAiReview(false)} />}
          {showAccountModal && <AccountModal token={user.token} profilePicture={user.profilePicture} username={user.username} onClose={() => setShowAccountModal(false)} onProfileUpdated={handleProfileUpdated} />}

          {/* Main Pages Switcher */}
          <main style={{ flexGrow: 1 }}>
            {activeMode === 'trip' ? (
              <TripMode token={user.token} />
            ) : (
              <>
                {activeTab === 'locations' && <Locations token={user.token} selectedLocation={selectedLocation} setSelectedLocation={setSelectedLocation} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId} />}
                {activeTab === 'collections' && <Collections token={user.token} selectedCol={selectedCol} setSelectedCol={setSelectedCol} />}
                {activeTab === 'trips' && <TripPlanning token={user.token} />}
                {activeTab === 'settings' && <SettingsTab token={user.token} userId={user.userId} onLogout={handleLogout} onResumeMarkdown={(md) => { setResumeMarkdown(md); setShowAiImport(true); }} />}
              </>
            )}
          </main>

      {/* Mobile Bottom Navigation Bar (visible only in mobile view via CSS) */}
      {activeMode === 'planning' && (
        <nav className="mobile-bottom-nav no-print">
          <button
            className={`mobile-nav-link ${activeTab === 'locations' ? 'active' : ''}`}
            onClick={() => { setActiveTab('locations'); setSelectedLocation(null); setCurrentFolderId(null); }}
          >
            <MapPin size={20} />
            <span>Locations</span>
          </button>
          <button
            className={`mobile-nav-link ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => { setActiveTab('collections'); setSelectedCol(null); }}
          >
            <Compass size={20} />
            <span>Collections</span>
          </button>
          <button
            className={`mobile-nav-link ${activeTab === 'trips' ? 'active' : ''}`}
            onClick={() => setActiveTab('trips')}
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
                <button onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={16} /> Settings
                </button>
                <button onClick={() => { setShowAccountModal(true); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} /> Account Management
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
              </div>
            )}
          </button>
        </nav>
      )}
    </div>
  );
}
