import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queueSyncAction, generateUUID, clearLocalDb, populateLocalDb } from '../clientDb.js';
import { Plus, Trash2, Tag, Compass, Folder, Settings, Server, Key, DollarSign, X, RefreshCw, Sparkles, Check, MoreVertical, Clock, Users, Home, MapPin, Search, User, Edit2, ChevronDown, Archive, Map as MapIcon, Copy, Sliders, ShieldCheck, LogOut, AlertTriangle } from 'lucide-react';
import { APP_VERSION } from '../version.js';
import ImmichLocationImportModal from './ImmichLocationImportModal.jsx';

const POPULAR_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'United Arab Emirates Dirham', symbol: 'د.إ' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' }
];

function getCurrencySymbol(code) {
  const popularMatch = POPULAR_CURRENCIES.find(c => c.code === code);
  if (popularMatch) return popularMatch.symbol;
  try {
    const formatted = (0).toLocaleString('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    const symbol = formatted.replace(/[\d\s.,]/g, '');
    return symbol || code;
  } catch (e) {
    return code;
  }
}

function getAllCurrenciesList() {
  let codes = [];
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      codes = Intl.supportedValuesOf('currency');
    } catch (e) {
      codes = [];
    }
  }

  if (!codes || codes.length === 0) {
    codes = [
      'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'AED', 'CNY', 'NZD',
      'BRL', 'ZAR', 'RUB', 'MXN', 'HKD', 'SEK', 'NOK', 'KRW', 'TRY', 'IDR', 'THB', 'MYR',
      'PHP', 'PLN', 'DKK', 'HUF', 'CZK', 'ILS', 'CLP', 'SAR', 'EGP', 'VND'
    ];
  }

  let displayNames = null;
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    } catch (e) {}
  }

  const popularMap = new Map(POPULAR_CURRENCIES.map(c => [c.code, c]));

  return codes.map(code => {
    const pop = popularMap.get(code);
    let name = pop ? pop.name : '';
    if (!name && displayNames) {
      try {
        name = displayNames.of(code) || code;
      } catch (e) {
        name = code;
      }
    }
    if (!name) name = code;
    const symbol = getCurrencySymbol(code);
    return { code, name, symbol };
  });
}

function SearchableCurrencySelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  const allCurrencies = useMemo(() => getAllCurrenciesList(), []);
  const popularSet = useMemo(() => new Set(POPULAR_CURRENCIES.map(c => c.code)), []);

  const selectedCurrencyObj = useMemo(() => {
    return allCurrencies.find(c => c.code === value) || { code: value, name: value, symbol: getCurrencySymbol(value) };
  }, [value, allCurrencies]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const query = search.trim().toLowerCase();

  const filteredPopular = useMemo(() => {
    return POPULAR_CURRENCIES.filter(c => 
      c.code.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      c.symbol.toLowerCase().includes(query)
    );
  }, [query]);

  const filteredAll = useMemo(() => {
    return allCurrencies.filter(c => 
      !popularSet.has(c.code) && (
        c.code.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query)
      )
    );
  }, [allCurrencies, popularSet, query]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        className="form-control"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-glass)',
          color: 'var(--text-primary)',
          borderRadius: '8px',
          padding: '8px 12px'
        }}
      >
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedCurrencyObj.code} - {selectedCurrencyObj.name} ({selectedCurrencyObj.symbol})
        </span>
        <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7, flexShrink: 0, marginLeft: '8px' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-panel, 0 8px 24px rgba(0,0,0,0.3))',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)' }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              autoFocus
              placeholder="Search code, name, or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {filteredPopular.length === 0 && filteredAll.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No matching currencies found
              </div>
            ) : (
              <>
                {filteredPopular.length > 0 && (
                  <div>
                    <div style={{ padding: '6px 12px 2px 12px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      ⭐ Popular Currencies
                    </div>
                    {filteredPopular.map(c => (
                      <div
                        key={c.code}
                        onClick={() => {
                          onChange(c.code);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          background: value === c.code ? 'var(--accent-primary-glow, rgba(139, 92, 246, 0.15))' : 'transparent',
                          color: value === c.code ? 'var(--text-primary)' : 'var(--text-secondary)',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (value !== c.code) e.currentTarget.style.background = 'var(--bg-surface)';
                        }}
                        onMouseLeave={(e) => {
                          if (value !== c.code) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>
                          <strong style={{ color: 'var(--text-primary)' }}>{c.code}</strong> - {c.name} ({c.symbol})
                        </span>
                        {value === c.code && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
                      </div>
                    ))}
                  </div>
                )}

                {filteredAll.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px 2px 12px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderTop: filteredPopular.length > 0 ? '1px solid var(--border-glass)' : 'none', marginTop: filteredPopular.length > 0 ? '4px' : '0' }}>
                      🌐 All Currencies ({filteredAll.length})
                    </div>
                    {filteredAll.map(c => (
                      <div
                        key={c.code}
                        onClick={() => {
                          onChange(c.code);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          background: value === c.code ? 'var(--accent-primary-glow, rgba(139, 92, 246, 0.15))' : 'transparent',
                          color: value === c.code ? 'var(--text-primary)' : 'var(--text-secondary)',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (value !== c.code) e.currentTarget.style.background = 'var(--bg-surface)';
                        }}
                        onMouseLeave={(e) => {
                          if (value !== c.code) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>
                          <strong style={{ color: 'var(--text-primary)' }}>{c.code}</strong> - {c.name} ({c.symbol})
                        </span>
                        {value === c.code && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecorderTrackMapModal({ points = [], onClose }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'table'

  useEffect(() => {
    if (!mapContainerRef.current || points.length === 0 || activeTab !== 'map') return;

    let isMounted = true;

    // Async Leaflet initialization
    import('leaflet').then((LModule) => {
      if (!isMounted || !mapContainerRef.current) return;
      const L = LModule.default || LModule;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Sort points chronologically
      const sorted = [...points].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const latLngs = sorted.map(p => [p.lat, p.lon]);

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      });
      mapInstanceRef.current = map;

      // OSM map tiles
      const osmTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(osmTileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Route Polyline
      const polyline = L.polyline(latLngs, {
        color: '#8b5cf6',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1
      }).addTo(map);

      // Start Marker (Green)
      if (sorted.length > 0) {
        const startP = sorted[0];
        const startIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background:#10b981; color:#000; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.5); font-size:11px;">▶</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([startP.lat, startP.lon], { icon: startIcon })
          .addTo(map)
          .bindPopup(`<b>Start Point</b><br/>${new Date(startP.timestamp * 1000).toLocaleString()}<br/>Acc: ±${Math.round(startP.accuracy || 0)}m`);
      }

      // End Marker (Red / Accent)
      if (sorted.length > 1) {
        const endP = sorted[sorted.length - 1];
        const endIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background:#ef4444; color:#fff; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.5); font-size:11px;">◼</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([endP.lat, endP.lon], { icon: endIcon })
          .addTo(map)
          .bindPopup(`<b>Latest / End Point</b><br/>${new Date(endP.timestamp * 1000).toLocaleString()}<br/>Acc: ±${Math.round(endP.accuracy || 0)}m`);
      }

      // Intermediate small circle dots for sampled points
      if (sorted.length > 2) {
        const step = Math.max(1, Math.floor(sorted.length / 50));
        for (let i = 1; i < sorted.length - 1; i += step) {
          const pt = sorted[i];
          L.circleMarker([pt.lat, pt.lon], {
            radius: 4,
            color: '#a78bfa',
            fillColor: '#8b5cf6',
            fillOpacity: 0.8,
            weight: 1
          }).addTo(map).bindPopup(`${new Date(pt.timestamp * 1000).toLocaleString()}<br/>Lat: ${pt.lat.toFixed(5)}, Lon: ${pt.lon.toFixed(5)}`);
        }
      }

      // Fit bounds
      if (latLngs.length > 0) {
        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      }
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points, activeTab]);

  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [points]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-surface-elevated, #1a1a24)',
        border: '1px solid var(--border-glass)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '900px',
        height: '85vh',
        maxHeight: '750px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapIcon size={20} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>OwnTracks Synced GPS Trail</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {points.length} coordinates synced from OwnTracks Recorder
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* View Switcher (Map vs Table) */}
            <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('map')}
                style={{
                  background: activeTab === 'map' ? 'var(--accent-primary)' : 'transparent',
                  color: activeTab === 'map' ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Map View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('table')}
                style={{
                  background: activeTab === 'table' ? 'var(--accent-primary)' : 'transparent',
                  color: activeTab === 'table' ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Coordinates Table ({points.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'map' ? (
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '350px' }} />
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Time</th>
                    <th style={{ padding: '8px 12px' }}>Latitude</th>
                    <th style={{ padding: '8px 12px' }}>Longitude</th>
                    <th style={{ padding: '8px 12px' }}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPoints.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {new Date(p.timestamp * 1000).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{p.lat.toFixed(5)}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{p.lon.toFixed(5)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                        {p.accuracy ? `±${Math.round(p.accuracy)}m` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer Info */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-glass)',
          background: 'var(--bg-surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)'
        }}>
          <div>
            <span>🟢 Start: <b>{points.length > 0 ? new Date(sortedPoints[sortedPoints.length - 1].timestamp * 1000).toLocaleTimeString() : 'N/A'}</b></span>
            <span style={{ margin: '0 10px' }}>•</span>
            <span>🔴 End: <b>{points.length > 0 ? new Date(sortedPoints[0].timestamp * 1000).toLocaleTimeString() : 'N/A'}</b></span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: '0.8rem', padding: '4px 14px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsComponent({ token, userId, username, profilePicture, onProfileUpdated, onLogout, onResumeMarkdown, onRestartTour, onShowChecklist, onNavigate, onOpenWhatsNew }) {
  // Navigation & Search State
  const [activeSettingsTab, setActiveSettingsTab] = useState('general'); // 'general' | 'integrations' | 'taxonomy' | 'data' | 'account' | 'system'
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [highlightedSectionId, setHighlightedSectionId] = useState(null);

  // Profile Photo state
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState(profilePicture);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileUploadError, setProfileUploadError] = useState(null);
  const [profileUploadSuccess, setProfileUploadSuccess] = useState(false);

  useEffect(() => {
    setProfilePreview(profilePicture);
  }, [profilePicture]);

  const handleProfileFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setProfileFile(selected);
      setProfilePreview(URL.createObjectURL(selected));
      setProfileUploadSuccess(false);
      setProfileUploadError(null);
    }
  };

  const handleUploadProfilePicture = async () => {
    if (!profileFile) return;
    setProfileUploading(true);
    setProfileUploadError(null);
    setProfileUploadSuccess(false);

    const formData = new FormData();
    formData.append('file', profileFile);

    try {
      const res = await fetch('/api/user/profile-picture', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload profile picture');
      }

      if (onProfileUpdated) {
        onProfileUpdated(data.profilePicture);
      }
      setProfileUploadSuccess(true);
      setProfileFile(null);
    } catch (err) {
      setProfileUploadError(err.message);
    } finally {
      setProfileUploading(false);
    }
  };

  // Self-Service Change Password state
  const [userCurrentPassword, setUserCurrentPassword] = useState('');
  const [userNewPassword, setUserNewPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');
  const [userPasswordLoading, setUserPasswordLoading] = useState(false);
  const [userPasswordError, setUserPasswordError] = useState(null);
  const [userPasswordSuccess, setUserPasswordSuccess] = useState(false);

  const handleChangeOwnPassword = async (e) => {
    e.preventDefault();
    if (userNewPassword !== userConfirmPassword) {
      setUserPasswordError('New passwords do not match');
      return;
    }

    setUserPasswordLoading(true);
    setUserPasswordError(null);
    setUserPasswordSuccess(false);

    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword: userCurrentPassword, newPassword: userNewPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setUserPasswordSuccess(true);
      setUserCurrentPassword('');
      setUserNewPassword('');
      setUserConfirmPassword('');
    } catch (err) {
      setUserPasswordError(err.message);
    } finally {
      setUserPasswordLoading(false);
    }
  };

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
  const [owntracksMode, setOwnTracksMode] = useState('webhook'); // 'webhook' | 'recorder'
  const [owntracksRecorderUrl, setOwnTracksRecorderUrl] = useState('');
  const [owntracksRecorderUser, setOwnTracksRecorderUser] = useState('');
  const [owntracksRecorderDevice, setOwnTracksRecorderDevice] = useState('');
  const [owntracksRecorderAuthType, setOwnTracksRecorderAuthType] = useState('none'); // 'none' | 'basic'
  const [owntracksRecorderUsername, setOwnTracksRecorderUsername] = useState('');
  const [owntracksRecorderPassword, setOwnTracksRecorderPassword] = useState('');
  const [recorderTestStatus, setRecorderTestStatus] = useState(null); // 'testing' | 'success' | 'error' | null
  const [recorderTestMsg, setRecorderTestMsg] = useState('');
  const [recorderSyncStatus, setRecorderSyncStatus] = useState(null); // 'syncing' | 'success' | 'error' | null
  const [recorderSyncMsg, setRecorderSyncMsg] = useState('');
  const [recorderSyncedPoints, setRecorderSyncedPoints] = useState([]);
  const [showRecorderMapModal, setShowRecorderMapModal] = useState(false);

  // Webhook live test state
  const [showWebhookTestModal, setShowWebhookTestModal] = useState(false);
  const [webhookLivePing, setWebhookLivePing] = useState(null);
  const [webhookStatusData, setWebhookStatusData] = useState(null);
  const [webhookStatusLoading, setWebhookStatusLoading] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  
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
  const [showImmichImportModal, setShowImmichImportModal] = useState(false);

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
  
  // Telemetry Admin State
  const [telemetryStatus, setTelemetryStatus] = useState(null);
  const [showPayloadModal, setShowPayloadModal] = useState(false);
  const [telemetryActionLoading, setTelemetryActionLoading] = useState(false);

  // Settings Tabs Configuration
  const SETTINGS_TABS = useMemo(() => [
    { id: 'general', label: 'General & Preferences', icon: <Sliders size={16} /> },
    { id: 'integrations', label: 'Integrations & AI', icon: <Server size={16} /> },
    { id: 'taxonomy', label: 'Taxonomy & Tags', icon: <Tag size={16} /> },
    { id: 'data', label: 'Data & Backups', icon: <Archive size={16} /> },
    { id: 'account', label: 'Account', icon: <User size={16} /> },
    { id: 'system', label: 'System', icon: <Settings size={16} /> }
  ], []);

  // Settings Sections Index for Instant Search & Quick Jumps
  const SETTINGS_SECTIONS = useMemo(() => [
    { id: 'section-general-config', tab: 'general', title: 'General Configurations', icon: '⚙️', desc: 'Travel speed, default country, home airport, and base currency' },
    { id: 'section-home-addresses', tab: 'general', title: 'Saved Home Addresses', icon: '🏠', desc: 'Manage your origin and destination home addresses' },
    { id: 'section-immich', tab: 'integrations', title: 'Immich Server Settings', icon: '🖼️', desc: 'Connect self-hosted Immich photo library, URL & API keys' },
    { id: 'section-ai', tab: 'integrations', title: 'AI Assistant Configuration', icon: '✨', desc: 'OpenAI, Gemini, Claude, Ollama, DeepSeek, Groq & OpenRouter models' },
    { id: 'section-gmaps', tab: 'integrations', title: 'Google Maps Integration', icon: '🗺️', desc: 'Google Maps API key, Places autocomplete & geocoding' },
    { id: 'section-owntracks', tab: 'integrations', title: 'OwnTracks GPS Integration', icon: '📍', desc: 'Real-time webhook and recorder GPS travel tracking' },
    { id: 'section-tags', tab: 'taxonomy', title: 'Keyword Tags', icon: '🏷️', desc: 'Custom keyword tags, colors and categorization filters' },
    { id: 'section-categories', tab: 'taxonomy', title: 'Custom Categories', icon: '📂', desc: 'Place categories and icons for itinerary grouping' },
    { id: 'section-people', tab: 'integrations', title: 'People & Companions (Immich Sync)', icon: '👥', desc: 'Travel companion profiles, avatars & Immich face tags' },
    { id: 'section-backup', tab: 'data', title: 'Backup & Restore Data', icon: '💾', desc: 'Full JSON backup export, import and media sync' },
    { id: 'section-archive', tab: 'data', title: 'Archived Items & Data Retention', icon: '📦', desc: 'Manage archived locations, folders, and orphaned places' },
    { id: 'section-guides', tab: 'data', title: 'Saved Travel Guides & Markdowns', icon: '📖', desc: 'Saved markdown articles, itineraries & AI import resumes' },
    { id: 'section-profile', tab: 'account', title: 'My Profile & Security', icon: '🔑', desc: 'Profile photo avatar upload & self-service password change' },
    { id: 'section-admin', tab: 'account', title: 'User Management & Administration', icon: '👤', desc: 'Manage user accounts, roles, and password resets' },
    { id: 'section-telemetry', tab: 'system', title: 'Privacy & Telemetry', icon: '🛡️', desc: 'Anonymous usage statistics and privacy controls' },
    { id: 'section-logs', tab: 'system', title: 'External API Usage Logs', icon: '📊', desc: '6-month call volume history for Google Maps, OSM & AI' },
    { id: 'section-maintenance', tab: 'system', title: 'Database Maintenance & Reset', icon: '⚠️', desc: 'Wipe local storage and database reset actions' },
    { id: 'section-help', tab: 'system', title: 'Help & Guided Onboarding', icon: '💡', desc: 'Restart guided UI tour, checklist & What\'s New in v7.4.0' }
  ], []);

  const searchResults = useMemo(() => {
    const q = settingsSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_SECTIONS.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.desc.toLowerCase().includes(q) ||
      s.tab.toLowerCase().includes(q)
    );
  }, [settingsSearchQuery, SETTINGS_SECTIONS]);

  const jumpToSection = (sectionId, tabName) => {
    setActiveSettingsTab(tabName);
    setHighlightedSectionId(sectionId);
    setSettingsSearchQuery('');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
    setTimeout(() => {
      setHighlightedSectionId(null);
    }, 2800);
  };

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

  const fetchTelemetryStatus = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/admin/telemetry/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTelemetryStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch telemetry status:', e);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminUsers();
      fetchTelemetryStatus();
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

  const handleToggleTelemetry = async (enabled) => {
    setTelemetryActionLoading(true);
    try {
      const res = await fetch('/api/admin/telemetry/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        await fetchTelemetryStatus();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTelemetryActionLoading(false);
    }
  };

  const handlePingTelemetry = async () => {
    setTelemetryActionLoading(true);
    try {
      const res = await fetch('/api/admin/telemetry/ping', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Test ping dispatched successfully!');
        await fetchTelemetryStatus();
      } else {
        const err = await res.json();
        alert(`Ping failed: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTelemetryActionLoading(false);
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

  // Address state & Geocoding state
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressWarning, setAddressWarning] = useState('');
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

  // Check for nearby/matching coordinate or address warning dynamically
  const checkCoordinateWarning = (lat, lon, addrTxt) => {
    const pLat = lat !== '' && lat !== null && !isNaN(Number(lat)) ? Number(lat) : null;
    const pLon = lon !== '' && lon !== null && !isNaN(Number(lon)) ? Number(lon) : null;
    const trimmedTxt = (addrTxt || '').trim().toLowerCase();

    const matchingLoc = userAddresses.find(addr => {
      if (editingAddressId && addr.id === editingAddressId) return false;
      if (pLat !== null && pLon !== null &&
          addr.latitude !== null && addr.latitude !== undefined && addr.latitude !== '' &&
          addr.longitude !== null && addr.longitude !== undefined && addr.longitude !== '' &&
          !isNaN(Number(addr.latitude)) && !isNaN(Number(addr.longitude))) {
        const dLat = Math.abs(Number(addr.latitude) - pLat);
        const dLon = Math.abs(Number(addr.longitude) - pLon);
        if (dLat <= 0.0005 && dLon <= 0.0005) {
          return true;
        }
      }
      if (trimmedTxt && addr.address && addr.address.trim().toLowerCase() === trimmedTxt) {
        return true;
      }
      return false;
    });

    if (matchingLoc) {
      setAddressWarning(`Note: This location matches existing saved address "${matchingLoc.label}". You can still save with a different label.`);
    } else {
      setAddressWarning('');
    }
  };

  const parseCoordinateString = (str) => {
    if (!str || typeof str !== 'string') return null;
    const regex = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*[NS]?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?\s*[EW]?\s*$/i;
    const match = str.trim().match(regex);
    if (match) {
      return { lat: match[1], lon: match[2] };
    }
    return null;
  };

  // Handler: Open Add Address Modal
  const handleOpenAddAddress = () => {
    setEditingAddressId(null);
    setAddressLabel(userAddresses.length === 0 ? 'Home' : '');
    setAddressText('');
    setAddressLat('');
    setAddressLon('');
    setIsDefaultHome(userAddresses.length === 0);
    setAddressSearchResults([]);
    setAddressError('');
    setAddressWarning('');
    setShowAddressModal(true);
  };

  // Handler: Edit Saved Address
  const handleEditAddress = (addr) => {
    setEditingAddressId(addr.id);
    setAddressLabel(addr.label || 'Home');
    setAddressText(addr.address || '');
    const latStr = addr.latitude !== null && addr.latitude !== undefined && addr.latitude !== '' ? addr.latitude.toString() : '';
    const lonStr = addr.longitude !== null && addr.longitude !== undefined && addr.longitude !== '' ? addr.longitude.toString() : '';
    setAddressLat(latStr);
    setAddressLon(lonStr);
    setIsDefaultHome(addr.is_default === 1);
    setAddressSearchResults([]);
    setAddressError('');
    setAddressWarning('');
    setShowAddressModal(true);
  };

  const handleCancelAddressModal = () => {
    setShowAddressModal(false);
    setEditingAddressId(null);
    setAddressLabel('Home');
    setAddressText('');
    setAddressLat('');
    setAddressLon('');
    setIsDefaultHome(false);
    setAddressSearchResults([]);
    setAddressError('');
    setAddressWarning('');
  };

  // Handler: Add or update Saved Address with Duplicate Detection
  const handleAddAddress = async (e) => {
    e.preventDefault();
    setAddressError('');
    const trimmedLabel = addressLabel.trim();
    if (!trimmedLabel) {
      setAddressError('Please provide an address label.');
      return;
    }

    const parsedLat = addressLat !== '' && addressLat !== null && !isNaN(Number(addressLat)) ? Number(addressLat) : null;
    const parsedLon = addressLon !== '' && addressLon !== null && !isNaN(Number(addressLon)) ? Number(addressLon) : null;
    const trimmedAddress = addressText.trim();

    // 1. Hard Block ONLY on Duplicate Label (case-insensitive)
    const duplicateLabel = userAddresses.find(addr => {
      if (editingAddressId && addr.id === editingAddressId) return false;
      return addr.label && addr.label.trim().toLowerCase() === trimmedLabel.toLowerCase();
    });

    if (duplicateLabel) {
      setAddressError(`An address with the label "${duplicateLabel.label}" already exists. Please choose a different label.`);
      return;
    }

    const willBeDefault = isDefaultHome || (userAddresses.length === 0);

    // If setting as default, clear default flag from any other existing addresses
    if (willBeDefault) {
      for (const existingAddr of userAddresses) {
        if (existingAddr.id !== editingAddressId && (existingAddr.is_default === 1 || existingAddr.is_default === true)) {
          await queueSyncAction('user_addresses', 'update', {
            ...existingAddr,
            is_default: 0
          });
        }
      }
    }

    if (editingAddressId) {
      // If there's only 1 address total, or user selected default, it must be default
      const finalIsDefault = (userAddresses.length === 1) || isDefaultHome ? 1 : 0;
      const updated = {
        id: editingAddressId,
        label: trimmedLabel,
        address: trimmedAddress,
        latitude: parsedLat,
        longitude: parsedLon,
        is_default: finalIsDefault
      };
      await queueSyncAction('user_addresses', 'update', updated);
      handleCancelAddressModal();
    } else {
      const newAddr = {
        id: generateUUID(),
        label: trimmedLabel,
        address: trimmedAddress,
        latitude: parsedLat,
        longitude: parsedLon,
        is_default: willBeDefault ? 1 : 0
      };
      await queueSyncAction('user_addresses', 'insert', newAddr);
      handleCancelAddressModal();
    }
  };

  const handleDeleteAddress = async (id) => {
    if (editingAddressId === id) handleCancelAddressModal();
    await queueSyncAction('user_addresses', 'delete', { id });

    // If only 1 address remains after deletion, ensure it is set as default home
    const remaining = userAddresses.filter(a => a.id !== id);
    if (remaining.length === 1) {
      const onlyAddr = remaining[0];
      if (onlyAddr.is_default !== 1) {
        await queueSyncAction('user_addresses', 'update', {
          ...onlyAddr,
          is_default: 1
        });
      }
    }
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
          setOwnTracksMode(data.config.owntracks_mode || 'webhook');
          setOwnTracksRecorderUrl(data.config.owntracks_recorder_url || '');
          setOwnTracksRecorderUser(data.config.owntracks_recorder_user || '');
          setOwnTracksRecorderDevice(data.config.owntracks_recorder_device || '');
          setOwnTracksRecorderAuthType(data.config.owntracks_recorder_auth_type || 'none');
          setOwnTracksRecorderUsername(data.config.owntracks_recorder_username || '');
          setOwnTracksRecorderPassword(data.config.owntracks_recorder_password || '');
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

    // Initial fetch of OwnTracks status
    fetchOwnTracksStatus();
  }, [token]);

  const fetchOwnTracksStatus = async () => {
    if (!token) return;
    setWebhookStatusLoading(true);
    try {
      const res = await fetch('/api/owntracks/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWebhookStatusData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch owntracks status:', e);
    } finally {
      setWebhookStatusLoading(false);
    }
  };

  // Live WebSocket listener for OwnTracks Pings
  useEffect(() => {
    const handleWsMessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'OWNTRACKS_PING_RECEIVED') {
          setWebhookLivePing(payload.data);
          fetchOwnTracksStatus();
        }
      } catch (_) {}
    };

    // If there's a global websocket or window custom event
    const handleCustomPing = (e) => {
      if (e.detail) {
        setWebhookLivePing(e.detail);
        fetchOwnTracksStatus();
      }
    };

    window.addEventListener('owntracks_ping_received', handleCustomPing);

    // Also poll every 3 seconds while Webhook Test Modal is active
    let pollInterval = null;
    if (showWebhookTestModal) {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/owntracks/status', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setWebhookStatusData(data);
            if (data.latestPing) {
              const pingTime = data.latestPing.timestamp * 1000;
              // If ping was received within the last 60 seconds, treat as live ping
              if (Date.now() - pingTime < 60000) {
                setWebhookLivePing(data.latestPing);
              }
            }
          }
        } catch (_) {}
      }, 2500);
    }

    return () => {
      window.removeEventListener('owntracks_ping_received', handleCustomPing);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [showWebhookTestModal, token]);

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
        owntracks_mode: fieldsToUpdate.owntracks_mode !== undefined ? fieldsToUpdate.owntracks_mode : current.owntracks_mode || 'webhook',
        owntracks_recorder_url: fieldsToUpdate.owntracks_recorder_url !== undefined ? fieldsToUpdate.owntracks_recorder_url : current.owntracks_recorder_url || '',
        owntracks_recorder_user: fieldsToUpdate.owntracks_recorder_user !== undefined ? fieldsToUpdate.owntracks_recorder_user : current.owntracks_recorder_user || '',
        owntracks_recorder_device: fieldsToUpdate.owntracks_recorder_device !== undefined ? fieldsToUpdate.owntracks_recorder_device : current.owntracks_recorder_device || '',
        owntracks_recorder_auth_type: fieldsToUpdate.owntracks_recorder_auth_type !== undefined ? fieldsToUpdate.owntracks_recorder_auth_type : current.owntracks_recorder_auth_type || 'none',
        owntracks_recorder_username: fieldsToUpdate.owntracks_recorder_username !== undefined ? fieldsToUpdate.owntracks_recorder_username : current.owntracks_recorder_username || '',
        owntracks_recorder_password: fieldsToUpdate.owntracks_recorder_password !== undefined ? fieldsToUpdate.owntracks_recorder_password : current.owntracks_recorder_password || '',
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

  const handleTestRecorder = async () => {
    if (!owntracksRecorderUrl.trim() || !owntracksRecorderUser.trim() || !owntracksRecorderDevice.trim()) {
      alert('Please fill in Recorder URL, Username, and Device Name before testing.');
      return;
    }
    setRecorderTestStatus('testing');
    setRecorderTestMsg('');
    try {
      const res = await fetch('/api/owntracks/recorder/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recorder_url: owntracksRecorderUrl,
          recorder_user: owntracksRecorderUser,
          recorder_device: owntracksRecorderDevice,
          auth_type: owntracksRecorderAuthType,
          username: owntracksRecorderUsername,
          password: owntracksRecorderPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecorderTestStatus('success');
        setRecorderTestMsg(data.message + (data.lastPing ? ` (Last recorded ping: ${new Date(data.lastPing).toLocaleString()})` : ''));
      } else {
        setRecorderTestStatus('error');
        setRecorderTestMsg(data.error || 'Failed to connect to OwnTracks Recorder.');
      }
    } catch (err) {
      setRecorderTestStatus('error');
      setRecorderTestMsg(err.message || 'Network error testing OwnTracks Recorder.');
    }
  };

  const handleSyncRecorder = async () => {
    setRecorderSyncStatus('syncing');
    setRecorderSyncMsg('');
    try {
      // First ensure current credentials/settings are saved
      await saveFieldConfig({
        owntracks_mode: 'recorder',
        owntracks_recorder_url: owntracksRecorderUrl,
        owntracks_recorder_user: owntracksRecorderUser,
        owntracks_recorder_device: owntracksRecorderDevice,
        owntracks_recorder_auth_type: owntracksRecorderAuthType,
        owntracks_recorder_username: owntracksRecorderUsername,
        owntracks_recorder_password: owntracksRecorderPassword
      });

      const res = await fetch('/api/owntracks/recorder/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({}) // Default: last 7 days
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecorderSyncStatus('success');
        setRecorderSyncMsg(data.message);
        if (Array.isArray(data.points)) {
          setRecorderSyncedPoints(data.points);
        }
      } else {
        setRecorderSyncStatus('error');
        setRecorderSyncMsg(data.error || 'Failed to sync from OwnTracks Recorder.');
      }
    } catch (err) {
      setRecorderSyncStatus('error');
      setRecorderSyncMsg(err.message || 'Network error syncing from OwnTracks Recorder.');
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
          theme: localStorage.getItem('tb_theme') || localStorage.getItem('theme') || 'system',
          tb_theme: localStorage.getItem('tb_theme') || localStorage.getItem('theme') || 'system',
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
        const restoredTheme = backupData.settings_localstorage.tb_theme || backupData.settings_localstorage.theme;
        if (restoredTheme !== undefined) {
          localStorage.setItem('tb_theme', restoredTheme);
          localStorage.setItem('theme', restoredTheme);
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
    <div className="container settings-container">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <h2>Settings & Configurations</h2>
      </div>

      {/* Category Tabs Header & Global Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border-glass)'
      }}>
        <div style={{
          display: 'flex',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-glass)',
          overflowX: 'auto',
          maxWidth: '100%'
        }}>
          {SETTINGS_TABS.map(tab => {
            const isActive = activeSettingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveSettingsTab(tab.id);
                  setSettingsSearchQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Global Search Input */}
        <div style={{ position: 'relative', width: '280px', flexShrink: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            style={{
              paddingLeft: '36px',
              paddingRight: settingsSearchQuery ? '32px' : '12px',
              fontSize: '0.82rem',
              height: '38px',
              borderRadius: '8px',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-glass)',
              color: 'var(--text-primary)'
            }}
            placeholder="Search all settings..."
            value={settingsSearchQuery}
            onChange={(e) => setSettingsSearchQuery(e.target.value)}
          />
          {settingsSearchQuery && (
            <button
              type="button"
              onClick={() => setSettingsSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}

          {/* Instant Search Results Dropdown */}
          {settingsSearchQuery.trim() && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              zIndex: 100,
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '6px'
            }}>
              {searchResults.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  No matching settings found
                </div>
              ) : (
                searchResults.map(item => (
                  <div
                    key={item.id}
                    onClick={() => jumpToSection(item.id, item.tab)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      gap: '8px',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{item.icon}</span>
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-secondary)', textTransform: 'capitalize', padding: '1px 6px', background: 'rgba(6,182,212,0.1)', borderRadius: '4px' }}>
                      {item.tab}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: GENERAL & PREFERENCES */}
      {activeSettingsTab === 'general' && (
        <div className="settings-tab-grid">
          {/* SECTION 4: GENERAL CONFIGURATIONS */}
          <div id="section-general-config" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-general-config' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-general-config' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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
              <SearchableCurrencySelect
                value={baseCurrency}
                onChange={(val) => {
                  setBaseCurrency(val);
                  handleSaveField('general', { base_currency: val });
                }}
              />
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

          
          {/* SAVED ADDRESSES & HOMES CARD */}
          <div id="section-home-addresses" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-home-addresses' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-home-addresses' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Home size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>Saved Home Addresses</h3>
              </div>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleOpenAddAddress}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.85rem' }}
              >
                <Plus size={16} />
                <span>Add Address</span>
              </button>
            </div>

            {/* Address List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {userAddresses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 12px', background: 'var(--bg-app)', border: '1px dashed var(--border-glass)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                    No home addresses added yet. Add your home, office, or base address to calculate travel start & return times for trips.
                  </p>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleOpenAddAddress}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', margin: '0 auto' }}
                  >
                    <Plus size={15} />
                    <span>Add First Address</span>
                  </button>
                </div>
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
                        {(addr.latitude !== null && addr.latitude !== undefined && addr.latitude !== '' &&
                          addr.longitude !== null && addr.longitude !== undefined && addr.longitude !== '' &&
                          !isNaN(Number(addr.latitude)) && !isNaN(Number(addr.longitude))) && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            📍 Coords: {Number(addr.latitude).toFixed(4)}, {Number(addr.longitude).toFixed(4)}
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
          </div>

        
        </div>
      )}

      {/* TAB 2: INTEGRATIONS & AI */}
      {activeSettingsTab === 'integrations' && (
        <div className="settings-tab-grid">
          {/* LEFT COLUMN: IMMICH & COMPANIONS */}
          <div className="settings-column">
            {/* SECTION 1: IMMICH SERVER SETTINGS */}
          <div id="section-immich" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-immich' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-immich' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleTestImmich}
                  disabled={immichTestStatus === 'testing'}
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  {immichTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    if (!immichUrl.trim() || !immichKey.trim()) {
                      alert('Please configure your Immich URL and API Key first.');
                      return;
                    }
                    setShowImmichImportModal(true);
                  }}
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Sparkles size={14} /> Import Locations from Immich
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

              {/* PEOPLE & COMPANIONS SUB-SECTION (IMMICH FACE SYNC) */}
              <div id="section-people" style={{
                marginTop: '24px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-glass)',
                borderRadius: '8px',
                padding: highlightedSectionId === 'section-people' ? '12px' : '0',
                border: highlightedSectionId === 'section-people' ? '1.5px solid var(--accent-primary)' : undefined,
                boxShadow: highlightedSectionId === 'section-people' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined,
                transition: 'box-shadow 0.3s ease, border-color 0.3s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={18} style={{ color: 'var(--accent-primary-hover)' }} />
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>People & Travel Companions</h4>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleOpenImmichPeopleModal}
                    disabled={!immichEnabled}
                    style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', width: 'auto' }}
                  >
                    <RefreshCw size={14} /> Import from Immich
                  </button>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Manage travel companions, tag who accompanied you on trips, and sync face thumbnails directly from your Immich server.
                </p>

                {/* People List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '240px', overflowY: 'auto' }}>
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

          
          </div>

          {/* RIGHT COLUMN: AI, GMAPS & OWNTRACKS */}
          <div className="settings-column">
            {/* SECTION 2: AI ASSISTANT CONFIGURATION */}
          <div id="section-ai" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-ai' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-ai' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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
          <div id="section-gmaps" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-gmaps' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-gmaps' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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

          
          {/* SECTION 5: OWNTRACKS INTEGRATION */}
          <div id="section-owntracks" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-owntracks' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-owntracks' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ color: 'var(--accent-secondary)', fontSize: '0.95rem', margin: 0 }}>OwnTracks GPS Tracking</h4>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#f97316',
                    color: '#000',
                    textTransform: 'uppercase'
                  }}>
                    Alpha
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Capture real-time and historical travel mileage & GPS telemetry (Alpha feature).
                </p>
              </div>

              {/* Mode Switcher Tabs */}
              <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setOwnTracksMode('webhook');
                    saveFieldConfig({ owntracks_mode: 'webhook' });
                  }}
                  style={{
                    background: owntracksMode === 'webhook' ? 'var(--accent-primary)' : 'transparent',
                    color: owntracksMode === 'webhook' ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Direct Webhook (Push)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOwnTracksMode('recorder');
                    saveFieldConfig({ owntracks_mode: 'recorder' });
                  }}
                  style={{
                    background: owntracksMode === 'recorder' ? 'var(--accent-primary)' : 'transparent',
                    color: owntracksMode === 'recorder' ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  OwnTracks Recorder (Pull)
                </button>
              </div>
            </div>

            {owntracksMode === 'webhook' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      OwnTracks Webhook Target URL
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (owntracksKey) {
                          navigator.clipboard.writeText(ownTracksWebhookUrl).catch(() => {
                            const el = document.createElement('textarea');
                            el.value = ownTracksWebhookUrl;
                            document.body.appendChild(el);
                            el.select();
                            document.execCommand('copy');
                            document.body.removeChild(el);
                          });
                          setWebhookCopied(true);
                          setTimeout(() => setWebhookCopied(false), 2500);
                        }
                      }}
                      disabled={!owntracksKey}
                      style={{
                        background: webhookCopied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${webhookCopied ? '#10b981' : 'var(--border-glass)'}`,
                        color: webhookCopied ? '#34d399' : 'var(--text-secondary)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: owntracksKey ? 'pointer' : 'not-allowed',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                    >
                      {webhookCopied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                      <span>{webhookCopied ? 'Copied to clipboard!' : 'Copy URL'}</span>
                    </button>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <textarea
                      className="form-control"
                      readOnly
                      rows="2"
                      style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#121217', cursor: 'text', paddingRight: '12px' }}
                      value={owntracksKey ? ownTracksWebhookUrl : 'Register to generate webhook key'}
                      onClick={(e) => e.target.select()}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: 0 }}>
                    Paste this URL into the <b>OwnTracks mobile app</b> configuration (HTTP mode) to track background GPS positions.
                  </p>
                </div>

                {/* Status Indicator & Test Connection Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: webhookStatusData?.latestPing ? '#10b981' : '#6b7280',
                      boxShadow: webhookStatusData?.latestPing ? '0 0 8px #10b981' : 'none'
                    }} />
                    <span>
                      {webhookStatusData?.latestPing ? (
                        <>
                          <strong style={{ color: 'var(--text-primary)' }}>Active:</strong> Last ping received {new Date(webhookStatusData.latestPing.timestamp * 1000).toLocaleString()} ({webhookStatusData.totalPoints} points recorded)
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>No GPS pings received yet</span>
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowWebhookTestModal(true);
                      setWebhookLivePing(null);
                    }}
                    style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                  >
                    <span>🧪 Test Connection (Live Listener)</span>
                  </button>
                </div>

                {/* Interactive Live Test Modal / Panel */}
                {showWebhookTestModal && (
                  <div style={{
                    marginTop: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '10px',
                    padding: '18px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.35)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem' }}>📡</span>
                        <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>OwnTracks Live Connection Test</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowWebhookTestModal(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                      {/* Step-by-Step Instructions */}
                      <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', marginBottom: '10px' }}>
                          Follow these steps on your phone:
                        </div>
                        <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: 1.4 }}>
                          <li>Open the <b>OwnTracks mobile app</b> on iOS or Android.</li>
                          <li>Ensure the app is configured in <b>HTTP mode</b> with your Webhook URL above.</li>
                          <li>
                            On the map screen, tap the <b>Location / Share icon</b> in the top-right toolbar.
                          </li>
                          <li>
                            Tap <b>"Send location now"</b> (or <b>"Publish"</b>) to force an immediate ping.
                          </li>
                        </ol>
                      </div>

                      {/* Live Listener / Feedback Area */}
                      <div style={{
                        background: webhookLivePing ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${webhookLivePing ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-glass)'}`,
                        borderRadius: '8px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        textAlign: 'center',
                        minHeight: '140px'
                      }}>
                        {webhookLivePing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                            <div style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              background: '#10b981',
                              color: '#000',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                              fontWeight: 'bold',
                              boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                            }}>
                              ✓
                            </div>
                            <strong style={{ color: '#34d399', fontSize: '0.95rem' }}>GPS Ping Received Successfully!</strong>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.5 }}>
                              <div><strong>Time:</strong> {new Date((webhookLivePing.timestamp || Math.floor(Date.now()/1000)) * 1000).toLocaleTimeString()}</div>
                              <div><strong>Coordinates:</strong> {webhookLivePing.latitude?.toFixed(5)}, {webhookLivePing.longitude?.toFixed(5)}</div>
                              {webhookLivePing.accuracy && <div><strong>Accuracy:</strong> ±{Math.round(webhookLivePing.accuracy)}m</div>}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '4px' }}>
                              Connection verified. Your mobile app is successfully streaming coordinates to TravelBuff!
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <div style={{ position: 'relative', width: '36px', height: '36px' }}>
                              <RefreshCw size={28} className="sync-spinner" style={{ color: 'var(--accent-secondary)' }} />
                            </div>
                            <div>
                              <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', display: 'block' }}>
                                Listening for live incoming ping...
                              </strong>
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Waiting for HTTP POST request from your device
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(249, 115, 22, 0.1)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#f97316',
                    color: '#000',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Alpha Feature
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    OwnTracks Recorder integration is in Alpha.
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Pull locations from a self-hosted <b>OwnTracks Recorder</b> (<code>ot-recorder</code>) instance.
                </p>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recorder Server URL</label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://recorder.example.com or http://192.168.1.100:8083"
                    value={owntracksRecorderUrl}
                    onChange={(e) => setOwnTracksRecorderUrl(e.target.value)}
                    onBlur={() => saveFieldConfig({ owntracks_recorder_url: owntracksRecorderUrl })}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recorder User</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. abhishek or user"
                      value={owntracksRecorderUser}
                      onChange={(e) => setOwnTracksRecorderUser(e.target.value)}
                      onBlur={() => saveFieldConfig({ owntracks_recorder_user: owntracksRecorderUser })}
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recorder Device</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. phone or iphone"
                      value={owntracksRecorderDevice}
                      onChange={(e) => setOwnTracksRecorderDevice(e.target.value)}
                      onBlur={() => saveFieldConfig({ owntracks_recorder_device: owntracksRecorderDevice })}
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Authentication</label>
                    <select
                      className="form-control"
                      value={owntracksRecorderAuthType}
                      onChange={(e) => {
                        setOwnTracksRecorderAuthType(e.target.value);
                        saveFieldConfig({ owntracks_recorder_auth_type: e.target.value });
                      }}
                      style={{ fontSize: '0.85rem' }}
                    >
                      <option value="none">None / Open</option>
                      <option value="basic">HTTP Basic Auth</option>
                    </select>
                  </div>

                  {owntracksRecorderAuthType === 'basic' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Auth Username</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="HTTP Basic Username"
                          value={owntracksRecorderUsername}
                          onChange={(e) => setOwnTracksRecorderUsername(e.target.value)}
                          onBlur={() => saveFieldConfig({ owntracks_recorder_username: owntracksRecorderUsername })}
                          style={{ fontSize: '0.85rem' }}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Auth Password</label>
                        <input
                          type="password"
                          className="form-control"
                          placeholder="HTTP Basic Password"
                          value={owntracksRecorderPassword}
                          onChange={(e) => setOwnTracksRecorderPassword(e.target.value)}
                          onBlur={() => saveFieldConfig({ owntracks_recorder_password: owntracksRecorderPassword })}
                          style={{ fontSize: '0.85rem' }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Recorder Test & Sync Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleTestRecorder}
                    disabled={recorderTestStatus === 'testing'}
                    style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {recorderTestStatus === 'testing' ? <RefreshCw size={14} className="sync-spinner" /> : <Check size={14} />}
                    <span>Test Connection</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSyncRecorder}
                    disabled={recorderSyncStatus === 'syncing'}
                    style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {recorderSyncStatus === 'syncing' ? <RefreshCw size={14} className="sync-spinner" /> : <RefreshCw size={14} />}
                    <span>Sync Recent 7 Days</span>
                  </button>

                  {recorderSyncedPoints.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowRecorderMapModal(true)}
                      style={{
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderColor: 'var(--accent-primary)',
                        color: 'var(--accent-primary-hover)'
                      }}
                    >
                      <MapIcon size={14} />
                      <span>🗺️ View Synced Track ({recorderSyncedPoints.length} pts)</span>
                    </button>
                  )}
                </div>

                {/* Test Feedback */}
                {recorderTestStatus && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    background: recorderTestStatus === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${recorderTestStatus === 'success' ? '#10b981' : '#ef4444'}`,
                    color: recorderTestStatus === 'success' ? '#34d399' : '#f87171'
                  }}>
                    {recorderTestMsg}
                  </div>
                )}

                {/* Sync Feedback */}
                {recorderSyncStatus && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    background: recorderSyncStatus === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${recorderSyncStatus === 'success' ? '#10b981' : '#ef4444'}`,
                    color: recorderSyncStatus === 'success' ? '#34d399' : '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <span>{recorderSyncMsg}</span>
                    {recorderSyncedPoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowRecorderMapModal(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#34d399',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          padding: 0
                        }}
                      >
                        Open Map Preview →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recorder Track Map Modal */}
          {showRecorderMapModal && (
            <RecorderTrackMapModal
              points={recorderSyncedPoints}
              onClose={() => setShowRecorderMapModal(false)}
            />
          )}

          
          </div>
        </div>
      )}

      {/* TAB 3: TAXONOMY & TAGS */}
      {activeSettingsTab === 'taxonomy' && (
        <div className="settings-tab-grid">
          {/* TAGS */}
          <div id="section-tags" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-tags' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-tags' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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
                <input type="color" className="form-control" style={{ padding: '6px', height: '38px' }} value={tagColor} onChange={(e) => setTagColor(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: '38px' }}>Add Tag</button>
            </form>
          </div>

          
          {/* CUSTOM CATEGORIES */}
          <div id="section-categories" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-categories' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-categories' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Folder size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Custom Categories</h3>
            </div>

            {/* List categories */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {customCategories.map(c => (
                <span 
                  key={c.id} 
                  className="tag-badge" 
                  style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)', 
                    display: 'inline-flex', alignItems: 'center', gap: '6px' 
                  }}
                >
                  <span>{c.icon}</span> {c.name}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleDeleteCategory(c.id)} />
                </span>
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
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: '38px' }}>Add Category</button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: DATA & BACKUPS */}
      {activeSettingsTab === 'data' && (
        <div className="settings-tab-grid">
          {/* LEFT COLUMN: BACKUP & RESTORE */}
          <div className="settings-column">
            {/* SECTION 3: BACKUP & RESTORE */}
          <div id="section-backup" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-backup' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-backup' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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

          
          </div>

          {/* RIGHT COLUMN: ARCHIVED ITEMS & SAVED GUIDES */}
          <div className="settings-column">
            {/* SECTION: ARCHIVED ITEMS & DATA RETENTION */}
          <div id="section-archive" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-archive' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-archive' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Archive size={22} style={{ color: '#eab308' }} />
                <h3 style={{ margin: 0 }}>Archived Items & Retention</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              View and manage archived folders, locations, and orphaned places of visit. You can restore archived records back to your active trips or permanently delete them with data retention options.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigate && onNavigate('archived')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, border: '1px solid rgba(234, 179, 8, 0.4)', color: '#eab308' }}
            >
              <Archive size={16} />
              <span>Manage Archived Items</span>
            </button>
          </div>

          
          {/* SAVED GUIDES SECTION */}
      <div id="section-guides" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-guides' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-guides' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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

      
          </div>
        </div>
      )}

      {/* TAB 5: ACCOUNT */}
      {activeSettingsTab === 'account' && (
        <div className="settings-tab-grid">
          {/* MY PROFILE & SECURITY CARD */}
          <div id="section-profile" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-profile' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-profile' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>My Profile & Security</h3>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                👤 {username || 'User'}
              </span>
            </div>

            {/* Profile Photo Sub-section */}
            <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-glass)' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '12px' }}>
                Profile Photo / Avatar
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent-primary)', background: '#1a1a24', flexShrink: 0 }}>
                  {profilePreview ? (
                    <img src={profilePreview} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {username ? username[0].toUpperCase() : 'U'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1, minWidth: '180px' }}>
                  <input type="file" accept="image/*" onChange={handleProfileFileChange} style={{ fontSize: '0.8rem' }} />
                  {profileFile && (
                    <button 
                      type="button"
                      className="btn btn-primary" 
                      onClick={handleUploadProfilePicture} 
                      disabled={profileUploading}
                      style={{ width: 'auto', alignSelf: 'flex-start', height: '34px', fontSize: '0.82rem', padding: '6px 14px' }}
                    >
                      {profileUploading ? (
                        <><RefreshCw size={14} className="sync-spinner" /> Uploading...</>
                      ) : (
                        'Save Avatar'
                      )}
                    </button>
                  )}
                  {profileUploadSuccess && (
                    <span style={{ fontSize: '0.78rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> Profile photo updated successfully!
                    </span>
                  )}
                  {profileUploadError && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--error)' }}>
                      ❌ {profileUploadError}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Change Password Sub-section */}
            <form onSubmit={handleChangeOwnPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Key size={16} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Change Password</span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Current Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Enter current password" 
                  value={userCurrentPassword} 
                  onChange={(e) => setUserCurrentPassword(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>New Password</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    placeholder="Min 4 characters" 
                    value={userNewPassword} 
                    onChange={(e) => setUserNewPassword(e.target.value)} 
                    required 
                    minLength={4}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Confirm New Password</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    placeholder="Re-enter new password" 
                    value={userConfirmPassword} 
                    onChange={(e) => setUserConfirmPassword(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              {userPasswordSuccess && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80', color: '#4ade80', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={16} /> Password updated successfully!
                </div>
              )}

              {userPasswordError && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', fontSize: '0.8rem' }}>
                  ❌ {userPasswordError}
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={userPasswordLoading}
                style={{ width: 'auto', alignSelf: 'flex-start', marginTop: '4px', height: '36px' }}
              >
                {userPasswordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* SECTION 4: ADMIN USER MANAGEMENT (Only for Admin users) */}
          {isAdmin && (
            <div id="section-admin" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-admin' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-admin' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Users size={22} style={{ color: '#a855f7' }} />
                  <h3 style={{ margin: 0 }}>User Administration</h3>
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

          
          
          {!isAdmin && (
            <div id="section-admin" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <User size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                <h3 style={{ margin: 0 }}>Account & Session</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                You are currently signed in as a standard user. You can manage your profile photo and change your password in the <strong>My Profile & Security</strong> card.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onLogout}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 6: SYSTEM */}
      {activeSettingsTab === 'system' && (
        <div className="settings-tab-grid">
          {/* LEFT COLUMN: ONBOARDING & TELEMETRY */}
          <div className="settings-column">
            {/* SECTION: GUIDED ONBOARDING & HELP */}
          <div id="section-help" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-help' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-help' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Sparkles size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Help & Guided Onboarding</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Relaunch the interactive spotlight tour to revisit key UI areas, or re-open the Getting Started checklist to track your setup progress.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (onRestartTour) onRestartTour();
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
                <span>Re-start Guided Tour</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (onShowChecklist) onShowChecklist();
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Check size={16} style={{ color: '#10b981' }} />
                <span>Show Getting Started Checklist</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (onOpenWhatsNew) onOpenWhatsNew();
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Sparkles size={16} style={{ color: 'var(--accent-primary-hover)' }} />
                <span>What's New in {APP_VERSION}</span>
              </button>
            </div>
          </div>

          
          {/* PRIVACY & TELEMETRY CARD (Admin Only) */}
          {isAdmin && (
            <div id="section-telemetry" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-telemetry' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-telemetry' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server size={22} style={{ color: 'var(--accent-primary-hover)' }} />
                  <h3 style={{ margin: 0 }}>Privacy & Telemetry</h3>
                </div>
                <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  ★ Admin Only
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Help improve TravelBuff by sending 100% anonymous system and usage statistics (like node version, generic feature usage, and rough bucket scale). <br/>
                <strong>Zero personal data, IPs, or location details are ever collected.</strong> Read our <a href="https://travelbuff.app/#privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary-hover)' }}>Privacy Policy</a>.
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={telemetryStatus?.enabled || false}
                    onChange={(e) => handleToggleTelemetry(e.target.checked)}
                    disabled={telemetryActionLoading || (telemetryStatus?.enabled === false && !telemetryStatus)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    Enable Anonymous Telemetry
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPayloadModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  <Search size={14} /> View Current Payload
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePingTelemetry}
                  disabled={!telemetryStatus?.enabled || telemetryActionLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  <RefreshCw size={14} className={telemetryActionLoading ? 'sync-spinner' : ''} /> Send Test Ping
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Last Reported: {telemetryStatus?.last_reported ? new Date(telemetryStatus.last_reported).toLocaleString() : 'Never'}
                </span>
              </div>

              {/* PAYLOAD PREVIEW MODAL */}
              {showPayloadModal && telemetryStatus && (
                <div className="modal-overlay" style={{ zIndex: 1000 }}>
                  <div className="modal-container" style={{ maxWidth: '600px', width: '90%', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Telemetry Payload Preview</h3>
                      <button type="button" className="btn-icon" onClick={() => setShowPayloadModal(false)}>
                        <X size={18} />
                      </button>
                    </div>
                    <pre style={{ background: '#121217', color: '#a8c7fa', padding: '16px', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', border: '1px solid var(--border-glass)' }}>
                      {JSON.stringify(telemetryStatus.preview_payload, null, 2)}
                    </pre>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-primary" onClick={() => setShowPayloadModal(false)}>Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          
          {/* API USAGE TRACKER SECTION */}
      <div id="section-logs" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-logs' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', boxShadow: highlightedSectionId === 'section-logs' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
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

      
          
          {/* SECTION: DATABASE MAINTENANCE & RESET */}
          <div id="section-maintenance" style={{ background: 'var(--bg-surface)', border: highlightedSectionId === 'section-maintenance' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: highlightedSectionId === 'section-maintenance' ? '0 0 20px rgba(124, 58, 237, 0.4)' : undefined, transition: 'box-shadow 0.3s ease, border-color 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <RefreshCw size={22} style={{ color: 'var(--accent-primary-hover)' }} />
              <h3 style={{ margin: 0 }}>Database Maintenance & Cache</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Re-synchronize your offline client cache and media avatars if you notice discrepancies with the server.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResyncMedia}
                disabled={resyncingMedia}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <RefreshCw size={16} className={resyncingMedia ? 'sync-spinner' : ''} />
                <span>{resyncingMedia ? 'Re-synchronizing...' : '🔄 Re-sync Local Cache & Avatars'}</span>
              </button>
            </div>
          </div>

          </div>
        </div>
      )}

      {/* IMMICH LOCATION IMPORT MODAL */}
      <ImmichLocationImportModal
        isOpen={showImmichImportModal}
        onClose={() => setShowImmichImportModal(false)}
        onImportStarted={() => {
          // No-op or notification
        }}
      />

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

      {/* SAVED HOME ADDRESS MODAL (ADD & EDIT) */}
      {showAddressModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
          padding: '20px'
        }}>
          <div className="login-card" style={{ maxWidth: '520px', width: '100%', padding: '24px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Home size={20} style={{ color: 'var(--accent-primary)' }} />
                {editingAddressId ? 'Edit Home Address' : 'Add Home Address'}
              </h3>
              <button 
                type="button" 
                onClick={handleCancelAddressModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {addressError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{addressError}</span>
              </div>
            )}

            {addressWarning && !addressError && (
              <div style={{
                background: 'rgba(234, 179, 8, 0.15)',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                color: '#facc15',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{addressWarning}</span>
              </div>
            )}

            <form onSubmit={handleAddAddress} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Address Label Name *
                  </label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Primary Home, Office, Summer House" 
                    value={addressLabel} 
                    onChange={(e) => {
                      setAddressLabel(e.target.value);
                      if (addressError) setAddressError('');
                    }} 
                    required 
                    autoFocus
                  />
                </div>
                <div style={{ paddingTop: '26px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={isDefaultHome} 
                      onChange={(e) => setIsDefaultHome(e.target.checked)} 
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    Default Home
                  </label>
                </div>
              </div>

              {/* Searchable Address Input with Geocoding Dropdown */}
              <div style={{ position: 'relative' }} ref={addressDropdownRef}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Search Address or Paste Coords (Auto-fill)
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Type address, city, or paste 'lat, lon'..." 
                    value={addressText} 
                    onChange={(e) => {
                      const txt = e.target.value;
                      handleSearchAddressQuery(txt);
                      if (addressError) setAddressError('');
                      checkCoordinateWarning(addressLat, addressLon, txt);
                    }} 
                  />
                  {addressSearching && (
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Searching...
                    </span>
                  )}
                </div>
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
                    maxHeight: '180px', 
                    overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    color: 'var(--text-primary)',
                    marginTop: '4px'
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
                          if (addressError) setAddressError('');
                          checkCoordinateWarning(res.lat, res.lon, res.display_name);
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
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Latitude</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. 40.7128" 
                    value={addressLat} 
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseCoordinateString(val);
                      let newLat = val;
                      let newLon = addressLon;
                      if (parsed) {
                        newLat = parsed.lat;
                        newLon = parsed.lon;
                        setAddressLat(parsed.lat);
                        setAddressLon(parsed.lon);
                      } else {
                        setAddressLat(val);
                      }
                      if (addressError) setAddressError('');
                      checkCoordinateWarning(newLat, newLon, addressText);
                    }} 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Longitude</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. -74.0060" 
                    value={addressLon} 
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseCoordinateString(val);
                      let newLat = addressLat;
                      let newLon = val;
                      if (parsed) {
                        newLat = parsed.lat;
                        newLon = parsed.lon;
                        setAddressLat(parsed.lat);
                        setAddressLon(parsed.lon);
                      } else {
                        setAddressLon(val);
                      }
                      if (addressError) setAddressError('');
                      checkCoordinateWarning(newLat, newLon, addressText);
                    }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleCancelAddressModal}
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ padding: '8px 20px' }}
                >
                  {editingAddressId ? 'Save Changes' : 'Add Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '36px 0 16px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
        TravelBuff {APP_VERSION} • Offline-First Self-Hosted Travel Companion
      </div>
    </div>
  );
}
