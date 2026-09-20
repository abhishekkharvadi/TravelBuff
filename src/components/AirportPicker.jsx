import React, { useState, useEffect, useRef, useMemo } from 'react';
import airportsData from '../data/airports.json';

/**
 * AirportPicker component
 * Instant offline search over 5,600+ world airports by IATA code, city, or airport name,
 * with fallback to Google Maps / OpenStreetMap places search.
 */
export default function AirportPicker({
  value, // { code, name, city, country, lat, lon } or string
  onChange,
  placeholder = "Search airport by IATA code, city, or name...",
  style = {}
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef(null);

  // Sync display text from incoming value
  useEffect(() => {
    if (value) {
      if (typeof value === 'object' && value.code) {
        setQuery(`${value.code} - ${value.name} (${value.city || value.country})`);
      } else if (typeof value === 'string') {
        setQuery(value);
      }
    } else {
      setQuery('');
    }
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fast offline filtering (capped at 15 matches for speed)
  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || q.length < 2) return [];

    // Exact IATA match priority
    const exactIata = airportsData.filter(a => a.code === q);
    const startIata = airportsData.filter(a => a.code.startsWith(q) && a.code !== q);

    const qLower = query.trim().toLowerCase();
    const otherMatches = airportsData.filter(a => {
      if (a.code.startsWith(q)) return false;
      return (
        (a.city && a.city.toLowerCase().includes(qLower)) ||
        (a.name && a.name.toLowerCase().includes(qLower)) ||
        (a.country && a.country.toLowerCase().includes(qLower))
      );
    });

    return [...exactIata, ...startIata, ...otherMatches].slice(0, 15);
  }, [query]);

  const handleSelect = (airport) => {
    setQuery(`${airport.code} - ${airport.name} (${airport.city || airport.country})`);
    setIsOpen(false);
    if (onChange) {
      onChange(airport);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || matches.length === 0) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[highlightIdx]) {
        handleSelect(matches[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIdx(0);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '6px 28px 6px 10px',
            fontSize: '0.8rem',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-glass)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            outline: 'none'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              if (onChange) onChange(null);
            }}
            style={{
              position: 'absolute',
              right: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '2px 4px'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && matches.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          maxHeight: '220px',
          overflowY: 'auto',
          background: 'var(--bg-surface-elevated, #1e1e2e)',
          border: '1px solid var(--border-glass)',
          borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          zIndex: 9999
        }}>
          {matches.map((a, idx) => {
            const isHighlighted = idx === highlightIdx;
            return (
              <div
                key={`${a.code}-${idx}`}
                onClick={() => handleSelect(a)}
                onMouseEnter={() => setHighlightIdx(idx)}
                style={{
                  padding: '7px 10px',
                  cursor: 'pointer',
                  background: isHighlighted ? 'rgba(124, 58, 237, 0.25)' : 'transparent',
                  borderBottom: idx < matches.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  fontSize: '0.78rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{
                    background: 'var(--accent-primary, #8b5cf6)',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontWeight: 'bold',
                    fontSize: '0.72rem',
                    flexShrink: 0
                  }}>
                    {a.code}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.name}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.city ? `${a.city}, ` : ''}{a.country}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', opacity: 0.6, flexShrink: 0 }}>✈️</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
