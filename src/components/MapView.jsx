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
      if (Array.isArray(polylineRef.current)) {
        polylineRef.current.forEach(line => map.removeLayer(line));
      } else {
        map.removeLayer(polylineRef.current);
      }
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

    const dayColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];

    // 4. Place markers
    validPoints.forEach(p => {
      const dayNum = p.dayLabel ? parseInt(p.dayLabel.replace(/\D/g, ''), 10) : 1;
      const color = dayColors[(dayNum - 1) % dayColors.length] || 'var(--accent-primary, #8b5cf6)';
      const dayBadge = p.dayLabel ? `<span style="position: absolute; top: -8px; right: -8px; background: ${color}; color: #fff; font-size: 0.6rem; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-glass); font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${p.dayLabel}</span>` : '';
      const markerHtml = `
        <div style="
          background: var(--bg-surface-elevated, #1e1e2c);
          border: 2px solid ${p.visited ? 'var(--success, #10b981)' : color};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          position: relative;
        ">
          ${p.sequenceLabel !== undefined && p.sequenceLabel !== null ? `<span style="font-weight: 800; font-size: 0.9rem; color: var(--text-primary);">${p.sequenceLabel}</span>` : getCategoryEmoji(p.category || p.type)}
          ${dayBadge}
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
            <b style="font-size: 0.95rem; display: block; margin-bottom: 2px; color: var(--text-primary);">${p.name}</b>
            <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
              ${p.category || 'Location'} ${p.dayLabel ? `• ${p.dayLabel}` : ''}
            </span>
            ${p.notes ? `<p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-secondary);">${p.notes.substring(0, 80)}...</p>` : ''}
          </div>
        `);

      markersRef.current.push(marker);
    });

    // 5. Draw path per day if requested (for itinerary chronological track)
    if (drawLine && validPoints.length > 0) {
      const polylines = [];
      const dayColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
      
      const dayGroups = {};
      validPoints.forEach(p => {
        const dayKey = p.dayLabel || 'All';
        if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
        dayGroups[dayKey].push(p);
      });

      const drawActualRoutes = async () => {
        let colorIdx = 0;
        for (const dayKey of Object.keys(dayGroups)) {
          const sortedDayPoints = dayGroups[dayKey].sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
          const color = dayColors[colorIdx % dayColors.length];
          colorIdx++;

          for (let i = 1; i < sortedDayPoints.length; i++) {
            const p1 = sortedDayPoints[i - 1];
            const p2 = sortedDayPoints[i];
            if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) continue;

            let routeLatLngs = [[p1.latitude, p1.longitude], [p2.latitude, p2.longitude]];
            
            try {
              const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${p1.longitude},${p1.latitude};${p2.longitude},${p2.latitude}?overview=full&geometries=geojson`);
              if (res.ok) {
                const data = await res.json();
                if (data.routes && data.routes[0] && data.routes[0].geometry) {
                  routeLatLngs = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                }
              }
            } catch (err) {
              console.warn('Failed to fetch OSRM route line:', err);
            }

            const polyline = L.polyline(routeLatLngs, {
              color: color,
              weight: 4,
              opacity: 0.85
            }).addTo(map);
            polylines.push(polyline);
          }
        }
        polylineRef.current = polylines;
      };

      drawActualRoutes();
    }

    // 6. Auto-zoom to fit bounds
    if (validPoints.length > 0) {
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
