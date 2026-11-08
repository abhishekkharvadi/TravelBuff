import React from 'react';
import { X, Sparkles, MapPin, ArrowUpDown, Trash2, Cloud, Navigation, Users, ShieldCheck, MessageSquarePlus, Share2, Mail, Smartphone } from 'lucide-react';
import { APP_VERSION } from '../version.js';

const FEATURES = [
  {
    icon: <Sparkles size={22} style={{ color: '#8b5cf6' }} />,
    title: 'AI Prompt-Based Trip Discovery & 2-Phase Itinerary Builder',
    badge: 'v7.9.0',
    badgeColor: '#7c3aed',
    desc: 'Write a natural-language prompt inside Plan New Trip -> AI Assisted to discover destinations and places automatically. Review and customize suggested stops in an interactive checklist, populate your Locations library first (with graceful fallback when a place cannot be enriched from Wiki/geocoder), and build your day-by-day route.'
  },
  {
    icon: <Share2 size={22} style={{ color: '#10b981' }} />,
    title: 'Live Collaborative Trip Sharing with Local Users',
    badge: 'v7.9.0',
    badgeColor: '#059669',
    desc: 'Share any trip with other users on the same TravelBuff instance with View-Only or Co-Editor permissions, real-time WebSocket sync, isolated library read-through so collaborators\' personal Locations stay clean, accurate Trip Owner expense attribution, and 1-click trip cloning.'
  },
  {
    icon: <Mail size={22} style={{ color: '#38bdf8' }} />,
    title: 'Native SMTP Email Notifications & Self-Service Password Reset',
    badge: 'v7.9.0',
    badgeColor: '#0284c7',
    desc: 'Configure SMTP in Admin Settings to enable HTML itinerary emails alongside Print, "Who Owes Whom" expense settlement emails, trip share invitations, automated upcoming trip countdown reminders, admin password reset emails, and self-service 6-digit login recovery.'
  },
  {
    icon: <MessageSquarePlus size={22} style={{ color: '#f59e0b' }} />,
    title: 'Direct In-App Feedback & Bug Reporting',
    badge: 'v7.9.0',
    badgeColor: '#d97706',
    desc: 'Submit bug reports, feature requests, and general feedback directly to the TravelBuff team from the user profile menu or Settings — protected by Ed25519 cryptographic signatures, Proof-of-Work verification, and multi-tier rate limiting.'
  },
  {
    icon: <Smartphone size={22} style={{ color: '#10b981' }} />,
    title: 'Full-Page Mobile Trip Scrolling',
    badge: 'v7.9.0',
    badgeColor: '#059669',
    desc: 'On mobile viewports, the top trip summary and navigation bar now scrolls naturally with the page instead of staying pinned, freeing up vertical screen space for your daily itinerary, map, and expense ledger.'
  },
  {
    icon: <ShieldCheck size={22} style={{ color: '#10b981' }} />,
    title: 'Security Patch & Dependency Hardening',
    badge: 'v7.8.3',
    badgeColor: '#059669',
    desc: 'Updated core dependencies to patch known vulnerabilities, upgrading Vite to v7.3.7 to resolve dev-server file exposure advisories and overriding follow-redirects to v1.16.1 to address header leak risks.'
  },
  {
    icon: <Users size={22} style={{ color: '#8b5cf6' }} />,
    title: 'Focused Trip Member Expense Splitting',
    badge: 'v7.8.2',
    badgeColor: '#7c3aed',
    desc: 'Configuring expense splits now displays only the active members on your trip rather than your entire saved contacts directory. Adding trip travelers remains cleanly accessible via the "+" button in the trip header.'
  },
  {
    icon: <MapPin size={22} style={{ color: '#10b981' }} />,
    title: 'Google Maps Resilience & Seamless OpenStreetMap Fallback',
    badge: 'v7.8.1',
    badgeColor: '#059669',
    desc: 'Fixed an issue where disabling Google Maps in Settings could be overridden when opening trips. Also introduced automatic, silent fallback to OpenStreetMap/Leaflet whenever Google Cloud billing or authentication issues occur, eliminating blocking pop-ups.'
  },
  {
    icon: <Sparkles size={22} style={{ color: '#8b5cf6' }} />,
    title: 'Account Profiles, Immich Face Link & Trip Owner Management',
    badge: 'v7.8.0',
    badgeColor: '#7c3aed',
    desc: 'Set personal Display Names and link your user account directly to a recognized face profile in Immich. The Account Owner is added by default to all trips as a traveler with their photo avatar, but can be removed for companion-only trips. Split ledger and Who Owes Whom tables now clearly attribute expenses to the Account Owner.'
  },
  {
    icon: <Sparkles size={22} style={{ color: '#10b981' }} />,
    title: 'Expense Splitting, On-Behalf Payments & Pairwise Settlement',
    badge: 'v7.8.0',
    badgeColor: '#059669',
    desc: 'Split shared expenses across Main Members, log 100% reimbursable expenses paid on behalf of a specific companion (or vice versa), and view bilateral pairwise settlements where non-active members paying for others are accurately settled without false cross-member debts.'
  },
  {
    icon: <Navigation size={22} style={{ color: '#38bdf8' }} />,
    title: 'Full-Page Trip Workspace, Sticky Jump-Bar & Focus Mode',
    badge: 'v7.8.0',
    badgeColor: '#0284c7',
    desc: 'Specific Trip Plans now open in a spacious full-page workspace below the top header with a top-right close button, a sticky section jump-bar, 1-section Focus Mode toggle, collapsible "+ Log Expense" forms, and modal-safe Escape key handling.'
  },
  {
    icon: <Cloud size={22} style={{ color: '#38bdf8' }} />,
    title: '3-Section CSV Export & Trip Data Mobility',
    badge: 'v7.8.0',
    badgeColor: '#0284c7',
    desc: 'Restructured CSV exports into three clean sections: Summary & Member Breakdown, Final Settlement Summary, and Detailed Ledger. Full trips can also be exported and imported across TravelBuff instances as portable JSON packages.'
  },
  {
    icon: <Sparkles size={22} style={{ color: '#10b981' }} />,
    title: 'Journey & Print Fixes',
    badge: 'v7.7.4',
    badgeColor: '#059669',
    desc: 'Fixed an issue preventing edits to the Outbound/Return Journey configuration from saving in the chronological itinerary view. Also fixed a rendering glitch that caused the mobile navigation bar to appear in print previews.'
  }
];

function WhatsNewModal({ isOpen, onClose, onNavigateTab }) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: '16px',
        overscrollBehavior: 'contain'
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
          overflow: 'hidden',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden'
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
        <div style={{
          flexGrow: 1,
          overflowY: 'auto',
          paddingRight: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          willChange: 'scroll-position',
          transform: 'translateZ(0)'
        }}>
          {FEATURES.map((f, i) => (
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

export default React.memo(WhatsNewModal);
