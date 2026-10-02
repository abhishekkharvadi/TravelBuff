import React from 'react';
import { X, Sparkles, MapPin, ArrowUpDown, Trash2, Cloud, Navigation } from 'lucide-react';
import { APP_VERSION } from '../version.js';

export default function WhatsNewModal({ isOpen, onClose, onNavigateTab }) {
  if (!isOpen) return null;

  const features = [
    {
      icon: <Cloud size={22} style={{ color: '#38bdf8' }} />,
      title: 'Trip Export & Import',
      badge: 'Data Mobility',
      badgeColor: '#0284c7',
      desc: 'Seamlessly export a full trip (including locations, itineraries, notes, and photos) as a single portable JSON package, and import it into any other TravelBuff instance. Missing locations and places will be automatically created on the destination server.'
    },
    {
      icon: <Sparkles size={22} style={{ color: '#10b981' }} />,
      title: 'Import Bug Fixes',
      badge: 'v7.7.1',
      badgeColor: '#059669',
      desc: 'Fixed an issue where trips imported with new/missing locations would silently fail to map day locations and hotels, resulting in an empty itinerary.'
    }
  ];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: '16px'
      }}
    >
      <div
        className="login-card"
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '28px',
          borderRadius: '16px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-glass)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
            }}>
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>What's New in TravelBuff</h3>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(124, 58, 237, 0.2)',
                  color: 'var(--accent-primary-hover)',
                  border: '1px solid rgba(124, 58, 237, 0.4)'
                }}>
                  {APP_VERSION}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Discover the latest features, performance improvements, and workflow updates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Feature List */}
        <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'var(--bg-app)',
                border: '1px solid var(--border-glass)'
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>
                {f.icon}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.title}</span>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: `${f.badgeColor}25`,
                    color: f.badgeColor,
                    border: `1px solid ${f.badgeColor}40`
                  }}>
                    {f.badge}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-glass)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Offline-first & self-hosted
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ padding: '8px 24px', fontWeight: 600, borderRadius: '8px' }}
          >
            Got it, let's explore!
          </button>
        </div>
      </div>
    </div>
  );
}
