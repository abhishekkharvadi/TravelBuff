import React, { useEffect, useRef, useState } from 'react';
import { trackApiCall } from '../utils/apiTracker.js';

const loadGoogleMapsScript = (apiKey) => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', resolve);
      existingScript.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export default function MapView({ points = [], drawLine = false }) {
  const mapContainerRef = useRef(null);
  
  // Leaflet refs
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  // Google Maps refs
  const googleMapInstanceRef = useRef(null);
  const googleMarkersRef = useRef([]);
  const googlePolylinesRef = useRef([]);

  const [isGoogleMapsReady, setIsGoogleMapsReady] = useState(false);
  const apiKey = localStorage.getItem('google_maps_api_key');

  useEffect(() => {
    if (apiKey) {
      loadGoogleMapsScript(apiKey)
        .then(() => {
          trackApiCall('Google Maps JavaScript');
          setIsGoogleMapsReady(true);
        })
        .catch(err => {
          console.error('Failed to load Google Maps:', err);
          setIsGoogleMapsReady(false);
        });
    } else {
      setIsGoogleMapsReady(false);
    }
  }, [apiKey]);

  useEffect(() => {
    // 1. Filter valid geocoded points
    const validPoints = points.filter(p => {
      if (!p) return false;
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      return !isNaN(lat) && !isNaN(lng);
    });

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

    if (isGoogleMapsReady && window.google && window.google.maps) {
      // Clean up Leaflet if it was running
      if (mapInstanceRef.current) {
        if (typeof mapInstanceRef.current.remove === 'function') {
          mapInstanceRef.current.remove();
        }
        mapInstanceRef.current = null;
      }

      // Clean up old Google markers & polylines
      googleMarkersRef.current.forEach(m => m.setMap(null));
      googleMarkersRef.current = [];
      googlePolylinesRef.current.forEach(p => p.setMap(null));
      googlePolylinesRef.current = [];

      if (!mapContainerRef.current) return;

      // Initialize Google Map if not created yet
      if (!googleMapInstanceRef.current) {
        googleMapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          disableDefaultUI: false
        });
      }

      const googleMap = googleMapInstanceRef.current;

      const isLightTheme = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
      const innerColor = isLightTheme ? '%23ffffff' : '%231e1e2c';
      const labelTextColor = isLightTheme ? '#111111' : '#ffffff';

      // Place Google markers
      validPoints.forEach(p => {
        const dayNum = p.dayLabel ? parseInt(p.dayLabel.replace(/\D/g, ''), 10) : 1;
        const color = dayColors[(dayNum - 1) % dayColors.length] || '#8b5cf6';
        
        const svgPin = `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
          <path d="M18 0C8.1 0 0 8.1 0 18c0 12.6 15.3 22.8 16.7 23.7.8.5 1.8.5 2.6 0 1.4-.9 16.7-11.1 16.7-23.7C36 8.1 27.9 0 18 0z" fill="${encodeURIComponent(color)}"/>
          <circle cx="18" cy="18" r="14" fill="${innerColor}"/>
        </svg>`;

        const markerLabel = String(p.sequenceLabel !== undefined && p.sequenceLabel !== null ? p.sequenceLabel : getCategoryEmoji(p.category || p.type));

        const marker = new window.google.maps.Marker({
          position: { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) },
          map: googleMap,
          icon: {
            url: svgPin,
            size: new window.google.maps.Size(36, 42),
            anchor: new window.google.maps.Point(18, 42)
          },
          label: {
            text: markerLabel,
            color: labelTextColor,
            fontSize: '11px',
            fontWeight: 'bold'
          }
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 10px; color: #111;">
              <h4 style="margin: 0 0 4px 0; font-size: 0.9rem; font-weight: bold;">${p.name}</h4>
              <span style="font-size: 0.75rem; color: #666;">
                ${p.category || 'Location'} ${p.dayLabel ? `• ${p.dayLabel}` : ''}
              </span>
              ${p.notes ? `<p style="font-size: 0.8rem; margin-top: 6px; color: #444;">${p.notes.substring(0, 80)}...</p>` : ''}
            </div>
          `
        });

        marker.addListener('click', () => {
          infoWindow.open(googleMap, marker);
        });

        googleMarkersRef.current.push(marker);
      });

      // Draw Google driving paths
      if (drawLine && validPoints.length > 0) {
        const directionsService = new window.google.maps.DirectionsService();

        const dayGroups = {};
        validPoints.forEach(pt => {
          const dayKey = pt.dayLabel || 'All';
          if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
          dayGroups[dayKey].push(pt);
        });

        let colorIdx = 0;
        Object.keys(dayGroups).forEach(dayKey => {
          const sortedDayPoints = dayGroups[dayKey].sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
          const color = dayColors[colorIdx % dayColors.length];
          colorIdx++;

          for (let i = 1; i < sortedDayPoints.length; i++) {
            const p1 = sortedDayPoints[i - 1];
            const p2 = sortedDayPoints[i];
            if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) continue;

            const request = {
              origin: { lat: parseFloat(p1.latitude), lng: parseFloat(p1.longitude) },
              destination: { lat: parseFloat(p2.latitude), lng: parseFloat(p2.longitude) },
              travelMode: window.google.maps.TravelMode.DRIVING
            };

            trackApiCall('Google Maps Directions');
            directionsService.route(request, (result, status) => {
              if (status === 'OK') {
                const routePolyline = new window.google.maps.Polyline({
                  path: result.routes[0].overview_path,
                  geodesic: true,
                  strokeColor: color,
                  strokeOpacity: 0.85,
                  strokeWeight: 4,
                  map: googleMap
                });
                googlePolylinesRef.current.push(routePolyline);
              } else {
                const routePolyline = new window.google.maps.Polyline({
                  path: [
                    { lat: parseFloat(p1.latitude), lng: parseFloat(p1.longitude) },
                    { lat: parseFloat(p2.latitude), lng: parseFloat(p2.longitude) }
                  ],
                  geodesic: true,
                  strokeColor: color,
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                  map: googleMap
                });
                googlePolylinesRef.current.push(routePolyline);
              }
            });
          }
        });
      }

      // Auto-fit Google bounds
      if (validPoints.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        validPoints.forEach(p => {
          bounds.extend({ lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) });
        });
        googleMap.fitBounds(bounds);
      }

    } else {
      // Clean up Google Maps instance if it was running
      if (googleMapInstanceRef.current) {
        googleMapInstanceRef.current = null;
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = '';
        }
      }

      // Initialize Leaflet if not created yet
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

      // Clear old Leaflet markers & polylines
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

      if (validPoints.length === 0) return;

      // Place Leaflet markers
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

        const icon = L.divIcon({
          html: markerHtml,
          className: 'custom-div-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([p.latitude, p.longitude], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="padding: 10px; color: var(--text-primary);">
              <h4 style="margin: 0 0 4px 0; font-size: 0.9rem; font-weight: bold; color: var(--text-primary);">${p.name}</h4>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">
                ${p.category || 'Location'} ${p.dayLabel ? `• ${p.dayLabel}` : ''}
              </span>
              ${p.notes ? `<p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-secondary);">${p.notes.substring(0, 80)}...</p>` : ''}
            </div>
          `);

        markersRef.current.push(marker);
      });

      // Draw Leaflet actual routes
      if (drawLine && validPoints.length > 0) {
        const polylines = [];
        
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
                trackApiCall('OSRM Routing');
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

      // Auto-zoom to fit bounds Leaflet
      if (validPoints.length > 0) {
        const group = new L.featureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.15));
      }
    }
  }, [points, drawLine, isGoogleMapsReady]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (googleMapInstanceRef.current) {
        googleMapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapContainerRef} className="map-container" style={{ width: '100%', height: '100%' }} />;
}
