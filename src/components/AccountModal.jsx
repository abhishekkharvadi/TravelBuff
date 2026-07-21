import React, { useState } from 'react';
import { X, Upload, Key, ShieldCheck, Loader } from 'lucide-react';

export default function AccountModal({ token, profilePicture, username, onClose, onProfileUpdated }) {
  // Picture upload state
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(profilePicture);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleUploadPicture = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

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

      onProfileUpdated(data.profilePicture);
      alert('Profile picture updated successfully!');
      setFile(null);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
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
      <div className="modal-content" style={{ maxWidth: '500px', width: '90%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ margin: 0 }}>Account Management</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Profile Picture Section */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--accent-secondary)' }}>Profile Photo</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border-glass)', background: '#1a1a24' }}>
              {preview ? (
                <img src={preview} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justify: 'center', color: '#666', fontSize: '2rem' }}>
                  {username ? username[0].toUpperCase() : 'U'}
                </div>
              )}
            </div>
            
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: '0.85rem' }} />
              {file && (
                <button 
                  className="btn btn-primary" 
                  onClick={handleUploadPicture} 
                  disabled={uploading}
                  style={{ width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 12px' }}
                >
                  {uploading ? (
                    <><Loader size={14} className="sync-spinner" /> Uploading...</>
                  ) : (
                    <><Upload size={14} /> Save Avatar</>
                  )}
                </button>
              )}
              {uploadError && <div style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{uploadError}</div>}
            </div>
          </div>
        </div>

        {/* Password Reset Section */}
        <form onSubmit={handleChangePassword} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ margin: '0', fontSize: '1rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} /> Change Password
          </h3>

          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Current Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>New Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Confirm New Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
