import React, { useState, useEffect } from 'react';
import { X, Upload, Key, ShieldCheck, Loader, User, Link, Unlink, RefreshCw, Check } from 'lucide-react';

export default function AccountModal({ token, profilePicture, username, onClose, onProfileUpdated }) {
  // Profile picture upload state
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(profilePicture);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Account details state
  const [displayName, setDisplayName] = useState('');
  const [immichPersonId, setImmichPersonId] = useState(null);
  const [immichPersonName, setImmichPersonName] = useState(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsSuccess, setDetailsSuccess] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // Immich People Picker sub-modal
  const [showImmichPicker, setShowImmichPicker] = useState(false);
  const [immichPeople, setImmichPeople] = useState([]);
  const [immichLoading, setImmichLoading] = useState(false);
  const [immichSearch, setImmichSearch] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Load account details on mount
  useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.displayName !== undefined) setDisplayName(data.displayName || '');
            if (data.immichPersonId !== undefined) setImmichPersonId(data.immichPersonId || null);
            if (data.immichPersonName !== undefined) setImmichPersonName(data.immichPersonName || null);
            if (data.profilePicture) setPreview(data.profilePicture);
          }
        }
      } catch (err) {
        console.warn('Failed to load user profile in AccountModal:', err);
      }
    };
    fetchProfile();
    return () => { isMounted = false; };
  }, [token]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setUploadSuccess(false);
      setUploadError(null);
    }
  };

  const handleUploadPicture = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append('file', file);

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

      setUploadSuccess(true);
      if (onProfileUpdated) {
        onProfileUpdated({
          profilePicture: data.profilePicture,
          displayName,
          immichPersonId,
          immichPersonName
        });
      }
      setFile(null);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveDetails = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setDetailsSaving(true);
    setDetailsError(null);
    setDetailsSuccess(false);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          immichPersonId: immichPersonId || null,
          immichPersonName: immichPersonName || null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update account details');
      }

      setDetailsSuccess(true);
      if (onProfileUpdated) {
        onProfileUpdated({
          profilePicture: preview,
          displayName: data.displayName,
          immichPersonId: data.immichPersonId,
          immichPersonName: data.immichPersonName
        });
      }
      setTimeout(() => setDetailsSuccess(false), 3000);
    } catch (err) {
      setDetailsError(err.message);
    } finally {
      setDetailsSaving(false);
    }
  };

  const handleFetchImmichPeople = async () => {
    setShowImmichPicker(true);
    setImmichLoading(true);
    try {
      const res = await fetch('/api/immich/people', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImmichPeople(Array.isArray(data) ? data : (data.people || []));
      }
    } catch (err) {
      console.warn('Failed to fetch Immich people in AccountModal:', err);
    } finally {
      setImmichLoading(false);
    }
  };

  const handleSelectImmichPerson = async (person) => {
    setImmichPersonId(person.id);
    setImmichPersonName(person.name || 'Unnamed');
    if (!displayName.trim() && person.name) {
      setDisplayName(person.name);
    }
    setShowImmichPicker(false);

    // Save immediately
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim() || person.name || '',
          immichPersonId: person.id,
          immichPersonName: person.name || 'Unnamed'
        })
      });
      const data = await res.json();
      if (res.ok && onProfileUpdated) {
        onProfileUpdated({
          profilePicture: preview,
          displayName: data.displayName,
          immichPersonId: data.immichPersonId,
          immichPersonName: data.immichPersonName
        });
      }
    } catch (err) {
      console.warn('Failed auto-saving Immich association:', err);
    }
  };

  const handleUnlinkImmichPerson = async () => {
    setImmichPersonId(null);
    setImmichPersonName(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          immichPersonId: null,
          immichPersonName: null
        })
      });
      const data = await res.json();
      if (res.ok && onProfileUpdated) {
        onProfileUpdated({
          profilePicture: preview,
          displayName: data.displayName,
          immichPersonId: null,
          immichPersonName: null
        });
      }
    } catch (err) {
      console.warn('Failed unlinking Immich association:', err);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '540px', width: '90%', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Account Details & Security</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* 1. Account Profile Details (Name & Immich Face Association) */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={16} /> Account Profile Details
          </h3>

          <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Full / Display Name</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder={username || 'Your display name'}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ height: '36px', fontSize: '0.85rem' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={detailsSaving}
                  style={{ width: 'auto', padding: '6px 14px', fontSize: '0.82rem', height: '36px' }}
                >
                  {detailsSaving ? <RefreshCw size={14} className="sync-spinner" /> : 'Save'}
                </button>
              </div>
              <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Used as your traveler name on trip plans and expense splits.
              </small>
            </div>

            {/* Immich Profile Link Sub-card */}
            <div style={{ marginTop: '4px', padding: '10px 12px', background: 'rgba(139, 92, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-purple-text)' }}>
                  📸 Immich Profile Association
                </span>
                {immichPersonId && (
                  <button
                    type="button"
                    onClick={handleUnlinkImmichPerson}
                    style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                    title="Unlink Immich profile"
                  >
                    <Unlink size={12} /> Unlink
                  </button>
                )}
              </div>

              {immichPersonId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={`/api/immich/person/thumbnail/${immichPersonId}?token=${encodeURIComponent(token || localStorage.getItem('token') || '')}`}
                    alt="Immich Profile"
                    style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {immichPersonName || 'Linked Immich Profile'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      Associated with your TravelBuff account
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleFetchImmichPeople}
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '0.72rem', height: '28px' }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Link your account to your Immich recognized face profile.
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleFetchImmichPeople}
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: '30px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Link size={12} /> Link Immich Profile
                  </button>
                </div>
              )}
            </div>

            {detailsSuccess && (
              <span style={{ fontSize: '0.78rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} /> Account details saved successfully!
              </span>
            )}
            {detailsError && (
              <span style={{ fontSize: '0.78rem', color: 'var(--error)' }}>
                ❌ {detailsError}
              </span>
            )}
          </form>
        </div>

        {/* 2. Profile Photo / Avatar Section */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--accent-secondary)' }}>Profile Photo / Avatar</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border-glass)', background: '#1a1a24', flexShrink: 0 }}>
              {preview ? (
                <img src={preview} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '1.8rem' }}>
                  {displayName ? displayName[0].toUpperCase() : (username ? username[0].toUpperCase() : 'U')}
                </div>
              )}
            </div>
            
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: '0.8rem' }} />
              {file && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleUploadPicture} 
                  disabled={uploading}
                  style={{ width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  {uploading ? (
                    <><Loader size={14} className="sync-spinner" /> Uploading...</>
                  ) : (
                    <><Upload size={14} /> Save Avatar</>
                  )}
                </button>
              )}
              {uploadSuccess && <div style={{ color: '#4ade80', fontSize: '0.78rem' }}>Avatar updated successfully!</div>}
              {uploadError && <div style={{ color: 'var(--error)', fontSize: '0.78rem' }}>{uploadError}</div>}
            </div>
          </div>
        </div>

        {/* 3. Password Reset Section */}
        <form onSubmit={handleChangePassword} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ margin: '0', fontSize: '0.95rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} /> Change Password
          </h3>

          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '0.75rem' }}>Current Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem' }}>New Password</label>
              <input 
                type="password" 
                className="form-control" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={4}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem' }}>Confirm New Password</label>
              <input 
                type="password" 
                className="form-control" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {passwordError && <div style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{passwordError}</div>}
          {passwordSuccess && <div style={{ color: 'var(--success)', fontSize: '0.8rem' }}>Password changed successfully!</div>}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={passwordLoading}
            style={{ width: 'fit-content', marginTop: '4px' }}
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Immich People Picker Sub-Modal */}
      {showImmichPicker && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 11000, padding: '16px'
        }}>
          <div className="login-card" style={{ maxWidth: '500px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📸 Select Your Immich Profile
              </h3>
              <X size={18} style={{ cursor: 'pointer' }} onClick={() => setShowImmichPicker(false)} />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Filter recognized people by name..."
                value={immichSearch}
                onChange={(e) => setImmichSearch(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', padding: '4px' }}>
              {immichLoading ? (
                <div style={{ gridColumn: '1 / -1', padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={22} className="sync-spinner" style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>Connecting to Immich & fetching people...</p>
                </div>
              ) : immichPeople.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <User size={28} style={{ marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>No named people found in your Immich library.</p>
                </div>
              ) : (
                immichPeople
                  .filter(p => (p.name || '').toLowerCase().includes(immichSearch.toLowerCase()))
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectImmichPerson(p)}
                      style={{
                        background: 'var(--bg-app)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', textAlign: 'center'
                      }}
                    >
                      <img
                        src={`/api/immich/person/thumbnail/${p.id}?token=${encodeURIComponent(token || localStorage.getItem('token') || '')}`}
                        alt={p.name}
                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-primary)' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {p.name || 'Unnamed'}
                      </span>
                    </div>
                  ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowImmichPicker(false)} style={{ fontSize: '0.78rem', padding: '4px 12px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
