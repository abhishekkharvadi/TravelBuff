import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, MapPin, Compass, ClipboardList, Settings, Map, Check, ChevronRight, ChevronLeft, X } from 'lucide-react';

const TOUR_STEPS = [
  {
    targetId: null, // Center modal
    icon: Sparkles,
    badge: 'Welcome',
    title: 'Welcome to TravelBuff 🌍',
    description: 'Your personal offline-first travel companion. Organize destinations, build thematic collections, scrape travel guides with AI, and plan seamless day-by-day itineraries that work even without internet access.',
    tab: 'locations'
  },
  {
    targetId: 'tour-nav-locations',
    icon: MapPin,
    badge: 'Step 1 of 6',
    title: 'Locations & Nested Folders 📍',
    description: 'Create destination folders, save individual places of visit with precise GPS coordinates, view theme-aware teardrop pins, and track visited statuses (Visited, Partial, Not Visited).',
    tab: 'locations'
  },
  {
    targetId: 'tour-nav-collections',
    icon: Compass,
    badge: 'Step 2 of 6',
    title: 'Smart Collections 📚',
    description: 'Group spots thematically across multiple trips (e.g. "Top Cafes" or "Weekend Day Trips") using Manual Selection or smart Auto-Group Rules based on categories, tags, or keywords.',
    tab: 'collections'
  },
  {
    targetId: 'tour-nav-import',
    icon: Sparkles,
    badge: 'Step 3 of 6',
    title: 'AI Travel Guide Importer ✨',
    description: 'Easily import travel blog articles via URL or upload PDF/Word travel guides. Our AI parser extracts landmark names, descriptions, and auto-geocodes coordinates into a 3-tab curation queue.',
    tab: 'locations'
  },
  {
    targetId: 'tour-nav-trips',
    icon: ClipboardList,
    badge: 'Step 4 of 6',
    title: 'Trips & Daily Itineraries 🗓️',
    description: 'Schedule multi-day trips with automatic driving times, numbered route pins (#1, #2...), booking voucher attachments, and multi-currency budget tracking.',
    tab: 'trips'
  },
  {
    targetId: 'tour-nav-trip-mode',
    icon: Map,
    badge: 'Step 5 of 6',
    title: 'Trip Mode (On-the-Road Companion) 🗺️',
    description: 'Switch to Trip Mode while actively traveling for a focused, single-screen view of today\'s schedule, 1-click nearby food/cafe bookmarking, instant offline hotel/flight vouchers, and quick cash expense logging.',
    tab: 'trips'
  },
  {
    targetId: 'tour-user-menu',
    icon: Settings,
    badge: 'Step 6 of 6',
    title: 'Settings & Integrations ⚙️',
    description: 'Manage 160+ world currencies, configure Google Maps and Immich photo face sync, set saved home starting points, customize tags, and download portable JSON database backups.',
    tab: 'settings'
  }
];

export default function OnboardingTour({ isOpen, onClose, onNavigateTab, userId }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });
  const popoverRef = useRef(null);

  const step = TOUR_STEPS[currentStep] || TOUR_STEPS[0];
  const StepIcon = step.icon;

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });

      if (step.targetId) {
        const el = document.getElementById(step.targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
            right: rect.right
          });
          return;
        }
      }
      setTargetRect(null);
    };

    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, currentStep, step.targetId]);

  // Sync tab navigation as user steps through
  useEffect(() => {
    if (isOpen && step.tab && onNavigateTab) {
      onNavigateTab(step.tab);
    }
  }, [isOpen, currentStep, step.tab]);

  if (!isOpen) return null;

  const storageKey = userId ? `tb_tour_completed_${userId}` : 'tb_tour_completed';

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(storageKey, 'true');
    localStorage.setItem('tb_tour_completed', 'true');
    if (onClose) onClose();
  };

  const handleSkip = () => {
    localStorage.setItem(storageKey, 'true');
    localStorage.setItem('tb_tour_completed', 'true');
    if (onClose) onClose();
  };

  // Popover positioning calculation
  let popoverStyle = {
    position: 'fixed',
    zIndex: 100002,
    maxWidth: '430px',
    width: 'calc(100vw - 32px)',
    background: 'var(--bg-surface-elevated, #1e1e2c)',
    border: '1px solid var(--accent-primary, #8b5cf6)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(139, 92, 246, 0.3)',
    color: 'var(--text-primary, #f3f4f6)',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
  };

  if (!targetRect) {
    // Center positioning for Welcome or fallback
    popoverStyle.top = '50%';
    popoverStyle.left = '50%';
    popoverStyle.transform = 'translate(-50%, -50%)';
  } else {
    // Relative to target
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      popoverStyle.bottom = '80px';
      popoverStyle.left = '16px';
      popoverStyle.right = '16px';
      popoverStyle.width = 'auto';
    } else {
      const spaceBelow = window.innerHeight - targetRect.bottom;
      if (spaceBelow > 320) {
        popoverStyle.top = `${targetRect.bottom + 14}px`;
        popoverStyle.left = `${Math.max(16, Math.min(window.innerWidth - 450, targetRect.left - 20))}px`;
      } else {
        popoverStyle.bottom = `${window.innerHeight - targetRect.top + 14}px`;
        popoverStyle.left = `${Math.max(16, Math.min(window.innerWidth - 450, targetRect.left - 20))}px`;
      }
    }
  }

  // SVG Cutout Path Generation with rounded rectangle cutout
  const pad = 6;
  const rx = 10;
  const winW = windowDimensions.width;
  const winH = windowDimensions.height;

  let svgCutoutPath = `M 0 0 H ${winW} V ${winH} H 0 Z`;

  if (targetRect) {
    const l = Math.max(0, targetRect.left - pad);
    const t = Math.max(0, targetRect.top - pad);
    const tw = targetRect.width + pad * 2;
    const th = targetRect.height + pad * 2;
    const r = l + tw;
    const b = t + th;

    svgCutoutPath = `M 0 0 H ${winW} V ${winH} H 0 Z M ${l + rx} ${t} H ${r - rx} A ${rx} ${rx} 0 0 1 ${r} ${t + rx} V ${b - rx} A ${rx} ${rx} 0 0 1 ${r - rx} ${b} H ${l + rx} A ${rx} ${rx} 0 0 1 ${l} ${b - rx} V ${t + rx} A ${rx} ${rx} 0 0 1 ${l + rx} ${t} Z`;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, pointerEvents: 'auto' }}>
      {/* SVG Mask Overlay with Even-Odd Transparent Cutout */}
      <svg 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 100000,
          pointerEvents: 'auto'
        }}
        onClick={handleSkip}
      >
        <path 
          d={svgCutoutPath} 
          fill="rgba(0, 0, 0, 0.72)" 
          fillRule="evenodd"
          style={{ transition: 'd 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>

      {/* Spotlight Glowing Border around Target */}
      {targetRect && (
        <div 
          style={{
            position: 'fixed',
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            borderRadius: `${rx}px`,
            border: '2px solid var(--accent-primary, #8b5cf6)',
            boxShadow: '0 0 20px 4px rgba(139, 92, 246, 0.6), inset 0 0 10px rgba(139, 92, 246, 0.2)',
            pointerEvents: 'none',
            zIndex: 100001,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
      )}

      {/* Tour Step Popover Card */}
      <div ref={popoverRef} style={popoverStyle} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), var(--accent-secondary, #06b6d4))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <StepIcon size={18} />
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--accent-secondary, #06b6d4)'
            }}>
              {step.badge}
            </span>
          </div>

          <button
            onClick={handleSkip}
            title="Skip Tour"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #9ca3af)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>
          {step.title}
        </h3>
        <p style={{
          fontSize: '0.875rem',
          lineHeight: '1.55',
          color: 'var(--text-secondary, #9ca3af)',
          marginBottom: '20px'
        }}>
          {step.description}
        </p>

        {/* Step Indicator Dots & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-glass, rgba(255,255,255,0.08))' }}>
          {/* Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                style={{
                  width: idx === currentStep ? '20px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: idx === currentStep ? 'var(--accent-primary, #8b5cf6)' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: '1px solid var(--border-glass, rgba(255,255,255,0.12))',
                  color: 'var(--text-primary, #f3f4f6)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, var(--accent-primary, #8b5cf6), #7c3aed)',
                border: 'none',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.35)'
              }}
            >
              {currentStep === TOUR_STEPS.length - 1 ? (
                <>
                  <Check size={14} /> Finish
                </>
              ) : (
                <>
                  Next <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
