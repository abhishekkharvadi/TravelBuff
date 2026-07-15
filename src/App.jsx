import React, { useState, useEffect } from 'react';
import { Cloud, CloudLightning, RefreshCw, LogOut, MapPin, ClipboardList, Settings, Compass, Moon, Edit, Map } from 'lucide-react';
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

  // 1. Recover session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('tb_token');
    const savedUsername = localStorage.getItem('tb_username');
    const savedUserId = localStorage.getItem('tb_userId');
    const savedOwnTracksKey = localStorage.getItem('tb_owntracksKey');

    if (savedToken && savedUsername && savedUserId) {
      const userData = {
        token: savedToken,
        username: savedUsername,
        userId: savedUserId,
        owntracksKey: savedOwnTracksKey
      };
      setUser(userData);
      
      // Start offline database syncing
      initSync(userData.token);
    }
    setIsInitializing(false);
  }, []);

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
    sessionStorage.removeItem('tb_session_token');
    
    await clearLocalDb();
    setUser(null);
    setActiveMode('planning');
    setActiveTab('locations');
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
    <div className="app-shell">
      {/* Universal Header */}
      <header className="app-header">
        <div 
          className="brand" 
          onClick={() => { setActiveMode('planning'); setActiveTab('locations'); setSelectedLocation(null); }}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
        >
          <Compass size={28} style={{ color: 'var(--accent-primary-hover)' }} />
          <h1>TravelBuff</h1>
        </div>

        {/* Top PWA Navbar inside Header (Only displayed in Planning Mode, hidden on mobile) */}
        {activeMode === 'planning' && (
          <nav className="header-nav no-print">
            <button
              className={`nav-link ${activeTab === 'locations' ? 'active' : ''}`}
              onClick={() => { setActiveTab('locations'); setSelectedLocation(null); }}
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
            <button
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={20} />
              <span>Settings</span>
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

          {/* Quick Logout Button */}
          <button 
            className="no-print"
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Pages Switcher */}
      <main style={{ flexGrow: 1 }}>
        {activeMode === 'trip' ? (
          <TripMode token={user.token} />
        ) : (
          <>
            {activeTab === 'locations' && <Locations token={user.token} selectedLocation={selectedLocation} setSelectedLocation={setSelectedLocation} />}
            {activeTab === 'collections' && <Collections token={user.token} selectedCol={selectedCol} setSelectedCol={setSelectedCol} />}
            {activeTab === 'trips' && <TripPlanning token={user.token} />}
            {activeTab === 'settings' && <SettingsTab token={user.token} userId={user.userId} onLogout={handleLogout} />}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (visible only in mobile view via CSS) */}
      {activeMode === 'planning' && (
        <nav className="mobile-bottom-nav no-print">
          <button
            className={`mobile-nav-link ${activeTab === 'locations' ? 'active' : ''}`}
            onClick={() => { setActiveTab('locations'); setSelectedLocation(null); }}
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
            className={`mobile-nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </nav>
      )}
    </div>
  );
}
