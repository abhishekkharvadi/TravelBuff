import React, { useEffect, useRef } from 'react';

export default function MapView({ points = [], drawLine = false }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    // 1. Initialise map if not created yet
    if (!mapInstanceRef.current && mapContainerRef.current) {
      const L = window.L;
      if (!L) return;

      const map = L.map(mapContainerRef.current).setView([20, 0], 2);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const L = window.L;
    
    if (!map || !L) return;

    // 2. Clear old markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    // 3. Filter valid geocoded points
    const validPoints = points.filter(p => {
      if (!p) return false;
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      return !isNaN(lat) && !isNaN(lng);
    });
    
    if (validPoints.length === 0) return;

    const latLngs = [];

    // Helper: Map categories to emojis/markers
    const getCategoryEmoji = (category) => {
      const map = {
        cafe: '☕',
        restaurant: '🍽️',
        temple: '⛩️',
        museum: '🏛️',
        waterfall: '🌊',
        mountain: '🏔️',
        trek: '🥾',
        hotel: '🏨',
        airport: '✈️',
        station: '🚉'
      };
      return map[category?.toLowerCase()] || '📍';
    };

    // 4. Place markers
    validPoints.forEach(p => {
      const markerHtml = `
        <div style="
          background: var(--bg-surface-elevated, #1e1e2c);
          border: 2px solid ${p.visited ? 'var(--success, #10b981)' : 'var(--accent-primary, #8b5cf6)'};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        ">
          ${getCategoryEmoji(p.category || p.type)}
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-leaflet-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const marker = L.marker([p.latitude, p.longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: var(--font-ui); padding: 4px;">
            <b style="font-size: 0.95rem; display: block; margin-bottom: 2px;">${p.name}</b>
            <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
              ${p.category || 'Location'}
            </span>
            ${p.notes ? `<p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-secondary);">${p.notes.substring(0, 80)}...</p>` : ''}
          </div>
        `);

      markersRef.current.push(marker);
      latLngs.push([p.latitude, p.longitude]);
    });

    // 5. Draw path if requested (for itinerary chronological track)
    if (drawLine && latLngs.length > 1) {
      const polyline = L.polyline(latLngs, {
        color: '#8b5cf6',
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 8'
      }).addTo(map);
      polylineRef.current = polyline;
    }

    // 6. Auto-zoom to fit bounds
    if (latLngs.length > 0) {
      const group = new L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }, [points, drawLine]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapContainerRef} className="map-container" style={{ width: '100%' }} />;
}
