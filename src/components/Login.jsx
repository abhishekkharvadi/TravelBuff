import React, { useState, useEffect } from 'react';
import { KeyRound, User, Lock, Eye, EyeOff, Mail, X, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '../version.js';

export default function Login({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Self-Service Password Reset via SMTP
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1 = request code, 2 = verify code + new password, 3 = success
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/smtp-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.smtpEnabled) setSmtpEnabled(true);
      })
      .catch(() => {});
  }, []);

  const handleRequestResetCode = async (e) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      setResetError('Please enter your username or email address.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code.');
      setResetMessage(data.message || 'If your account has a registered email, a 6-digit verification code has been sent.');
      setResetStep(2);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPassword) {
      setResetError('Please enter the 6-digit code and your new password.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: resetIdentifier.trim(),
          code: resetCode.trim(),
          newPassword: resetNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password.');
      setResetMessage(data.message || 'Password reset complete! You can now sign in.');
      setResetStep(3);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setLoading(true);

    const url = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, trustDevice })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Handle successful login
      onLoginSuccess({ ...data, isNewUser: isRegister }, trustDevice);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img 
            src={document.body.classList.contains('light-theme') ? '/logo-light.png' : '/logo-dark.png'} 
            alt="TravelBuff" 
            style={{ height: '36px', display: 'block', margin: '0 auto 12px auto', objectFit: 'contain' }}
          />
          <p>{isRegister ? 'Create an account to start your logs' : 'Sign in to access your travel planner'}</p>
        </div>

        {error && (
          <div style={{
            background: 'var(--error-glow)',
            color: 'var(--error)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '44px' }}
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ margin: 0 }}>Password</label>
              {!isRegister && smtpEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(username || '');
                    setResetCode('');
                    setResetNewPassword('');
                    setResetConfirmPassword('');
                    setResetError('');
                    setResetMessage('');
                    setResetStep(1);
                    setShowForgotModal(true);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 500
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative', marginTop: '6px' }}>
              <Lock size={18} style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                style={{ paddingLeft: '44px', paddingRight: '44px' }}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="trustDevice"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              disabled={loading}
            />
            <div className="checkbox-label-wrapper">
              <label htmlFor="trustDevice" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                Trust this device
              </label>
              {trustDevice && (
                <span className="warning-text">
                  ⚠️ If you trust this device, we will not ask for login credentials again.
                </span>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '10px' }}>
            <KeyRound size={18} />
            {loading ? 'Authenticating...' : isRegister ? 'Register & Log In' : 'Sign In'}
          </button>
        </form>

        <button
          className="btn-toggle-auth"
          onClick={() => {
            setIsRegister(!isRegister);
            setError('');
          }}
          disabled={loading}
        >
          {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
          TravelBuff {APP_VERSION}
        </div>
      </div>

      {/* Self-Service Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-backdrop" onClick={() => setShowForgotModal(false)} style={{ zIndex: 10000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} style={{ color: 'var(--accent-primary)' }} /> Reset Your Password
              </h3>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {resetError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: 'var(--error)', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '12px' }}>
                {resetError}
              </div>
            )}

            {resetStep === 1 && (
              <form onSubmit={handleRequestResetCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Enter your username or registered email address. We will send a 6-digit verification code to your email.
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Username or Email</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. alex or alex@example.com"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForgotModal(false)} style={{ width: 'auto', padding: '8px 14px' }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={resetLoading} style={{ width: 'auto', padding: '8px 16px' }}>
                    {resetLoading ? 'Sending...' : 'Send Reset Code'}
                  </button>
                </div>
              </form>
            )}

            {resetStep === 2 && (
              <form onSubmit={handleConfirmResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {resetMessage && (
                  <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', color: 'var(--accent-secondary)', padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                    {resetMessage}
                  </div>
                )}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>6-Digit Verification Code</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="123456"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    required
                    style={{ letterSpacing: '4px', fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>New Password</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Minimum 4 characters"
                    minLength={4}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Confirm New Password</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Repeat new password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setResetStep(1)} style={{ width: 'auto', padding: '8px 12px', fontSize: '0.8rem' }}>
                    ← Back
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={resetLoading} style={{ width: 'auto', padding: '8px 16px' }}>
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {resetStep === 3 && (
              <div style={{ textAlign: 'center', padding: '12px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={36} style={{ color: '#4ade80' }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {resetMessage}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setUsername(resetIdentifier);
                    setShowForgotModal(false);
                  }}
                  style={{ width: 'auto', padding: '8px 20px', marginTop: '6px' }}
                >
                  Return to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
