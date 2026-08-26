import React, { useEffect, useRef, useState } from 'react';
import { trackApiCall } from '../utils/apiTracker.js';
import { getDayColor } from '../utils/dayColors.js';

const loadGoogleMapsScript = (apiKey) => {
  return new Promise((resolve, reject) => {
    // Set up global auth failure handler
    window.gm_authFailure = () => {
      const errorMsg = 'Google Maps API authentication failed (e.g. invalid key, blocked API targets, or missing billing). Reverting maps/search to OpenStreetMap.';
      console.warn(errorMsg);

      // Log to server
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMsg, context: 'MapView' })
      }).catch(e => console.error('Failed to log error to backend:', e));
    };

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

    // Google Bootstrap dynamic async script loading pattern
    window.gmpSelfLoop = () => { resolve(); };

    const cleanKey = (apiKey || '').trim();
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${cleanKey}&libraries=places,geometry&loading=async&callback=gmpSelfLoop&v=weekly`;
    script.async = true;
    script.defer = true;
    script.setAttribute('loading', 'async');
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export default function MapView({ points = [], drawLine = false }) {
  const mapContainerRef = useRef(null);
  
  // Leaflet refs
  const mapInstanceRef = useRef(null);
  const leafletMarkersRef = useRef({});
  const polylineRef = useRef(null);

  // Google Maps refs
  const googleMapInstanceRef = useRef(null);
  const googleMarkersRef = useRef({});
  const googlePolylinesRef = useRef([]);
  const tileLayerRef = useRef(null);
  const prevPointsSigRef = useRef('');

  const [isGoogleMapsReady, setIsGoogleMapsReady] = useState(false);
  const apiKey = (localStorage.getItem('google_maps_api_key') || '').trim();
  const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

  useEffect(() => {
    if (apiKey && (googleMapsEnabled || localStorage.getItem('google_maps_api_key'))) {
      // Clear legacy lockout flag if key exists
      if (localStorage.getItem('google_maps_enabled') === 'false' && apiKey) {
        localStorage.setItem('google_maps_enabled', 'true');
      }
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
  }, [apiKey, googleMapsEnabled]);

  useEffect(() => {
    let active = true;

    // 1. Filter valid geocoded points
    const validPoints = points.filter(p => {
      if (!p) return false;
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      return !isNaN(lat) && !isNaN(lng);
    });

    console.log('[MapView Diagnostic]', {
      totalPointsReceived: points.length,
      rawPoints: points,
      validGeocodedPoints: validPoints,
      engine: (isGoogleMapsReady && window.google?.maps) ? 'Google Maps' : 'Leaflet'
    });

    const pointsSig = validPoints.map(p => `${p.id}-${p.latitude}-${p.longitude}`).join(',');
    const hasPointsChanged = pointsSig !== prevPointsSigRef.current;

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
      // Initialize Google Map asynchronously to catch AdvancedMarkerElement initialization errors
      const initMap = async () => {
        try {
          const { Map } = await window.google.maps.importLibrary("maps");
          const { AdvancedMarkerElement } = await window.google.maps.importLibrary("marker");

          // Clean up Leaflet if it was running
          if (mapInstanceRef.current) {
            if (typeof mapInstanceRef.current.remove === 'function') {
              mapInstanceRef.current.remove();
            }
            mapInstanceRef.current = null;
          }

          // Clean up old Google polylines
          googlePolylinesRef.current.forEach(p => p.setMap(null));
          googlePolylinesRef.current = [];

          // Clean up markers that are no longer in validPoints
          const currentPointIds = new Set(validPoints.map(p => p.id));
          Object.keys(googleMarkersRef.current).forEach(id => {
            if (!currentPointIds.has(id)) {
              googleMarkersRef.current[id].setMap(null);
              delete googleMarkersRef.current[id];
            }
          });

          if (!mapContainerRef.current) return;

          let isJustInitialized = false;
          // Initialize Google Map if not created yet or if container was remounted
          const needsNewMap = !googleMapInstanceRef.current || (googleMapInstanceRef.current.getDiv && !mapContainerRef.current.contains(googleMapInstanceRef.current.getDiv()));
          if (needsNewMap) {
            googleMapInstanceRef.current = new Map(mapContainerRef.current, {
              center: { lat: 20, lng: 0 },
              zoom: 2,
              disableDefaultUI: false,
              mapId: 'DEMO_MAP_ID' // Required map ID for AdvancedMarkerElement
            });
            googleMarkersRef.current = {};
            googlePolylinesRef.current = [];
            isJustInitialized = true;
          }

          const googleMap = googleMapInstanceRef.current;

          const isLightTheme = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
          const innerColor = isLightTheme ? '#ffffff' : '#1e1e2c';
          const labelTextColor = isLightTheme ? '#111111' : '#ffffff';

          // Place or update Google advanced markers
          validPoints.forEach(p => {
             const color = p.dayLabel 
               ? getDayColor(parseInt(p.dayLabel.replace(/\D/g, ''), 10) - 1)
               : '#6b7280';
             const seqVal = p.sequenceLabel !== undefined && p.sequenceLabel !== null ? p.sequenceLabel : (p.sequenceOrder !== undefined && p.sequenceOrder !== null ? p.sequenceOrder : null);
             const markerLabel = String(seqVal !== null ? seqVal : getCategoryEmoji(p.category || p.type));
             const dayBadge = p.dayLabel ? `<span style="position: absolute; top: -8px; right: -8px; background: ${color}; color: #fff; font-size: 0.65rem; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-glass, rgba(255,255,255,0.15)); font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${p.dayLabel}</span>` : '';

             const pinContent = document.createElement('div');
             pinContent.style.position = 'relative';
             pinContent.style.width = '36px';
             pinContent.style.height = '42px';
             pinContent.innerHTML = `
               <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42" style="display: block;">
                 <path d="M18 0C8.1 0 0 8.1 0 18c0 12.6 15.3 22.8 16.7 23.7.8.5 1.8.5 2.6 0 1.4-.9 16.7-11.1 16.7-23.7C36 8.1 27.9 0 18 0z" fill="${p.visited ? '#10b981' : color}"/>
                 <circle cx="18" cy="18" r="14" fill="${innerColor}"/>
               </svg>
               <div style="position: absolute; top: 0; left: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: ${labelTextColor}; font-size: 11px; font-weight: bold; pointer-events: none; line-height: 1;">
                 ${markerLabel}
               </div>
               ${dayBadge}
             `;

            const latVal = parseFloat(p.latitude);
            const lngVal = parseFloat(p.longitude);

            let marker = googleMarkersRef.current[p.id];
            if (marker) {
              // Update position and content to avoid re-rendering flicker
              marker.position = { lat: latVal, lng: lngVal };
              marker.content = pinContent;
              marker.title = p.name;
            } else {
              // Create new marker
              marker = new AdvancedMarkerElement({
                position: { lat: latVal, lng: lngVal },
                map: googleMap,
                content: pinContent,
                title: p.name
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

              googleMarkersRef.current[p.id] = marker;
            }
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
              if (dayKey === 'All') return;
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
                  if (!active) return;
                  if (status === 'OK') {
                    const routePolyline = new window.google.maps.Polyline({
                      path: result.routes[0].overview_path,
                      geodesic: true,
                      strokeColor: color,
                      strokeOpacity: 0.85,
                      strokeWeight: 4,
                      map: googleMap
                    });
                    if (active) {
                      googlePolylinesRef.current.push(routePolyline);
                    } else {
                      routePolyline.setMap(null);
                    }
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
                    if (active) {
                      googlePolylinesRef.current.push(routePolyline);
                    } else {
                      routePolyline.setMap(null);
                    }
                  }
                });
              }
            });
          }

          // Auto-fit Google bounds
          if (validPoints.length > 0 && (hasPointsChanged || isJustInitialized)) {
            if (validPoints.length === 1) {
              googleMap.setCenter({ lat: parseFloat(validPoints[0].latitude), lng: parseFloat(validPoints[0].longitude) });
              googleMap.setZoom(13);
            } else {
              const bounds = new window.google.maps.LatLngBounds();
              validPoints.forEach(p => {
                bounds.extend({ lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) });
              });
              googleMap.fitBounds(bounds);
            }
          }
        } catch (initErr) {
          console.error('Google Maps update error:', initErr);
        }
      };

      initMap();

    } else {
      // Clean up Google Maps instance if it was running
      if (googleMapInstanceRef.current) {
        googleMapInstanceRef.current = null;
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = '';
        }
      }

      let isLeafletJustInitialized = false;
      // Initialize Leaflet if not created yet
      if (!mapInstanceRef.current && mapContainerRef.current) {
        const L = window.L;
        if (!L) return;

        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        const map = L.map(mapContainerRef.current).setView([20, 0], 2);
        tileLayerRef.current = L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19
        }).addTo(map);

        mapInstanceRef.current = map;
        isLeafletJustInitialized = true;
      } else if (mapInstanceRef.current && tileLayerRef.current) {
        tileLayerRef.current.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
      }

      const map = mapInstanceRef.current;
      const L = window.L;
      
      if (!map || !L) return;

      // Clean up Leaflet markers that are no longer in validPoints
      const currentPointIds = new Set(validPoints.map(p => p.id));
      Object.keys(leafletMarkersRef.current).forEach(id => {
        if (!currentPointIds.has(id)) {
          map.removeLayer(leafletMarkersRef.current[id]);
          delete leafletMarkersRef.current[id];
        }
      });

      if (polylineRef.current) {
        if (Array.isArray(polylineRef.current)) {
          polylineRef.current.forEach(line => map.removeLayer(line));
        } else {
          map.removeLayer(polylineRef.current);
        }
        polylineRef.current = null;
      }

      if (validPoints.length === 0) return;

      const isLightTheme = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
      const innerColor = isLightTheme ? '#ffffff' : '#1e1e2c';
      const labelTextColor = isLightTheme ? '#111111' : '#ffffff';
      const popupBg = isLightTheme ? '#ffffff' : '#1e1e2c';
      const popupTitleColor = isLightTheme ? '#111111' : '#f3f4f6';
      const popupSubColor = isLightTheme ? '#666666' : '#9ca3af';

      // Place or update Leaflet markers
      validPoints.forEach(p => {
        const pinPrimaryColor = p.visited === 1 
          ? '#10b981' 
          : (p.dayLabel 
              ? getDayColor(parseInt(p.dayLabel.replace(/\D/g, ''), 10) - 1)
              : (p.location_id ? '#06b6d4' : '#8b5cf6')
            );

        const dayBadge = p.dayLabel ? `<span style="position: absolute; top: -8px; right: -8px; background: ${pinPrimaryColor}; color: #fff; font-size: 0.65rem; padding: 2px 4px; border-radius: 4px; border: 1px solid #ffffff; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.4);">${p.dayLabel}</span>` : '';
        const leafletSeqVal = p.sequenceLabel !== undefined && p.sequenceLabel !== null ? p.sequenceLabel : (p.sequenceOrder !== undefined && p.sequenceOrder !== null ? p.sequenceOrder : null);
        const markerLabel = String(leafletSeqVal !== null ? leafletSeqVal : getCategoryEmoji(p.category || p.type));

        const markerHtml = `
          <div style="position: relative; width: 36px; height: 42px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42" style="display: block; filter: drop-shadow(0px 4px 8px rgba(0,0,0,0.5));">
              <path d="M18 0C8.1 0 0 8.1 0 18c0 12.6 15.3 22.8 16.7 23.7.8.5 1.8.5 2.6 0 1.4-.9 16.7-11.1 16.7-23.7C36 8.1 27.9 0 18 0z" fill="${pinPrimaryColor}" stroke="#ffffff" stroke-width="1.5"/>
              <circle cx="18" cy="18" r="13" fill="#ffffff"/>
            </svg>
            <div style="position: absolute; top: 0; left: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #111111; font-size: 13px; font-weight: bold; pointer-events: none; line-height: 1;">
              ${markerLabel}
            </div>
            ${dayBadge}
          </div>
        `;

        const icon = L.divIcon({
          html: markerHtml,
          className: 'custom-div-icon',
          iconSize: [36, 42],
          iconAnchor: [18, 42]
        });

        const popupHtml = `
          <div style="padding: 8px 10px; background: ${popupBg}; color: ${popupTitleColor}; border-radius: 8px; min-width: 140px;">
            <h4 style="margin: 0 0 4px 0; font-size: 0.9rem; font-weight: bold; color: ${popupTitleColor};">${p.name}</h4>
            <span style="font-size: 0.75rem; color: ${popupSubColor};">
              ${p.category || 'Location'} ${p.dayLabel ? `• ${p.dayLabel}` : ''}
            </span>
            ${p.notes ? `<p style="font-size: 0.8rem; margin-top: 6px; color: ${popupSubColor};">${p.notes.substring(0, 80)}...</p>` : ''}
          </div>
        `;

        const latVal = parseFloat(p.latitude);
        const lngVal = parseFloat(p.longitude);

        let marker = leafletMarkersRef.current[p.id];
        if (marker) {
          // Update position, icon, and popup to prevent recreation flicker
          marker.setLatLng([latVal, lngVal]);
          marker.setIcon(icon);
          marker.setPopupContent(popupHtml);
          if (!map.hasLayer(marker)) {
            marker.addTo(map);
          }
        } else {
          // Create new marker
          marker = L.marker([latVal, lngVal], { icon })
            .addTo(map)
            .bindPopup(popupHtml);
          leafletMarkersRef.current[p.id] = marker;
        }
      });

      console.log('[MapView Leaflet] Rendered marker count:', Object.keys(leafletMarkersRef.current).length, 'on map instance:', map);

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
            if (dayKey === 'All') continue;
            const sortedDayPoints = dayGroups[dayKey].sort((a, b) => (a.sequenceOrder || 0) - (b.sequenceOrder || 0));
            const color = getDayColor(colorIdx);
            colorIdx++;

            for (let i = 1; i < sortedDayPoints.length; i++) {
              if (!active) return;
              const p1 = sortedDayPoints[i - 1];
              const p2 = sortedDayPoints[i];
              if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) continue;

              let routeLatLngs = [[p1.latitude, p1.longitude], [p2.latitude, p2.longitude]];
              
              try {
                trackApiCall('OSRM Routing');
                const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${p1.longitude},${p1.latitude};${p2.longitude},${p2.latitude}?overview=full&geometries=geojson`);
                if (!active) return;
                if (res.ok) {
                  const data = await res.json();
                  if (data.routes && data.routes[0] && data.routes[0].geometry) {
                    routeLatLngs = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                  }
                }
              } catch (err) {
                console.warn('Failed to fetch OSRM route line:', err);
              }

              if (!active) return;
              const polyline = L.polyline(routeLatLngs, {
                color: color,
                weight: 4,
                opacity: 0.85
              }).addTo(map);
              polylines.push(polyline);
            }
          }
          if (active) {
            polylineRef.current = polylines;
          } else {
            polylines.forEach(line => map.removeLayer(line));
          }
        };

        drawActualRoutes();
      }

      // Auto-zoom to fit bounds Leaflet
      if (validPoints.length > 0 && (hasPointsChanged || isLeafletJustInitialized)) {
        const markerArray = Object.values(leafletMarkersRef.current);
        if (markerArray.length > 0) {
          if (markerArray.length === 1) {
            const lat = parseFloat(validPoints[0].latitude);
            const lng = parseFloat(validPoints[0].longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              map.setView([lat, lng], 13);
            }
          } else {
            const group = new L.featureGroup(markerArray);
            if (group.getBounds().isValid()) {
              map.fitBounds(group.getBounds().pad(0.15));
            }
          }
        }
      }
      
      prevPointsSigRef.current = pointsSig;
    }

    return () => {
      active = false;
    };
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
