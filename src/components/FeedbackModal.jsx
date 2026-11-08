import React, { useState, useEffect } from 'react';
import { X, MessageSquarePlus, Bug, Sparkles, HelpCircle, Send, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { APP_VERSION } from '../version.js';

export default function FeedbackModal({ isOpen, onClose, token, userEmail = '', activeTab = 'locations', syncStatus = 'online' }) {
  const [category, setCategory] = useState('bug');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState(userEmail || '');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedRef, setSubmittedRef] = useState(null);
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSubmittedRef(null);
      if (userEmail && !contactEmail) {
        setContactEmail(userEmail);
      }
      if (token && syncStatus !== 'offline') {
        fetch('/api/feedback/status', {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (data) setQuota(data);
          })
          .catch(() => {});
      }
    }
  }, [isOpen, token, userEmail, syncStatus]);

  if (!isOpen) return null;

  const isOffline = syncStatus === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isOffline) {
      setError('You are currently offline. Please reconnect to the internet to submit feedback.');
      return;
    }

    if (title.trim().length < 5) {
      setError('Please enter a short summary of at least 5 characters.');
      return;
    }
    if (message.trim().length < 15) {
      setError('Please provide a description of at least 15 characters so we can understand your feedback.');
      return;
    }

    setSubmitting(true);
    try {
      const diagnostics = includeDiagnostics
        ? {
            app_version: APP_VERSION,
            active_tab: activeTab,
            platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
            viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
            sync_status: syncStatus
          }
        : null;

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          category,
          title: title.trim(),
          message: message.trim(),
          contact_email: contactEmail.trim() || null,
          diagnostics
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setSubmittedRef(data.feedback_id || 'Submitted');
      if (data.quota) setQuota(data.quota);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err.message || 'Failed to send feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = [
    { id: 'bug', label: 'Bug Report', icon: Bug, color: '#f87171', desc: 'Something is broken or behaving unexpectedly' },
    { id: 'feature', label: 'Feature Request', icon: Sparkles, color: '#60a5fa', desc: 'Suggest a new capability or workflow improvement' },
    { id: 'other', label: 'Other Feedback', icon: HelpCircle, color: '#a78bfa', desc: 'General thoughts, praise, or usability feedback' }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10005,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid var(--border-glass)',
          background: 'var(--bg-surface)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.25))',
                border: '1px solid rgba(99,102,241,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa'
              }}
            >
              <MessageSquarePlus size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Send Feedback to TravelBuff</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Sent securely to <code>admin.travelbuff.app</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px'
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {submittedRef ? (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <CheckCircle2 size={48} style={{ color: '#34d399', marginBottom: '12px' }} />
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Thank You for Your Feedback!</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Your feedback has been cryptographically verified and delivered to the TravelBuff team.
            </p>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                color: '#34d399',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                marginBottom: '20px'
              }}
            >
              Reference: {submittedRef}
            </div>
            <div>
              <button className="btn btn-primary" onClick={onClose} style={{ minWidth: '140px' }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  marginBottom: '14px'
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                Feedback Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const active = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 8px',
                        borderRadius: '10px',
                        border: active ? `1.5px solid ${cat.color}` : '1px solid var(--border-glass)',
                        background: active ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Icon size={18} style={{ color: cat.color }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: active ? 700 : 500 }}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>Subject *</label>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{title.length}/120</span>
              </div>
              <input
                type="text"
                className="form-control"
                maxLength={120}
                placeholder={
                  category === 'bug'
                    ? 'e.g. Map pins not loading when switching folders'
                    : category === 'feature'
                    ? 'e.g. Support exporting itinerary to calendar (.ics)'
                    : 'Short summary of your feedback'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>Details *</label>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{message.length}/2000</span>
              </div>
              <textarea
                className="form-control"
                rows={5}
                maxLength={2000}
                placeholder={
                  category === 'bug'
                    ? 'Steps to reproduce, what you expected to happen, and what actually happened...'
                    : 'Describe your idea, use case, or feedback in detail...'
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ resize: 'vertical', minHeight: '110px' }}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                Contact Email <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional — if you'd like a reply)</span>
              </label>
              <input
                type="email"
                className="form-control"
                maxLength={150}
                placeholder="you@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-glass)',
                cursor: 'pointer',
                marginBottom: '14px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)'
              }}
            >
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Include basic app diagnostics</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Attaches app version (v{APP_VERSION}), active screen ({activeTab}), viewport size, and OS platform. No personal trip or location data is ever shared.
                </div>
              </div>
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-glass)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                <ShieldCheck size={15} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span>
                  Ed25519 + Proof-of-Work protected
                  {quota ? ` • ${quota.dailyRemaining}/${quota.maxPerDay} left today` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || isOffline || (quota && !quota.canSubmit)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={15} />
                  {submitting
                    ? 'Verifying & Sending...'
                    : quota?.cooldownRemainingSec > 0
                    ? `Wait ${quota.cooldownRemainingSec}s`
                    : 'Send Feedback'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
