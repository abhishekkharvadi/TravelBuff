export const loadGoogleMaps = () => {
  const apiKey = localStorage.getItem('google_maps_api_key');
  const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

  if (typeof window !== 'undefined' && !window.__gmaps_unhandled_handler_set) {
    window.__gmaps_unhandled_handler_set = true;
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && (
        (event.reason.stack && (event.reason.stack.includes('places.js') || event.reason.stack.includes('main.js'))) ||
        (event.reason.message && (event.reason.message.includes('places') || event.reason.message.includes('Google')))
      )) {
        event.preventDefault();
        console.warn('[Google Maps] Suppressed internal async error:', event.reason);
      }
    });
  }

  if (!apiKey || !googleMapsEnabled) {
    return Promise.reject(new Error('Google Maps is disabled or API Key is missing'));
  }

  return new Promise((resolve, reject) => {
    // Set up global auth failure handler
    window.gm_authFailure = () => {
      const errorMsg = 'Google Maps API authentication failed (e.g. invalid key, blocked API targets, or missing billing). Reverting maps/search to OpenStreetMap.';
      console.warn(errorMsg);
      
      // Log to server
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMsg, context: 'GoogleMapsLoader' })
      }).catch(e => console.error('Failed to log error to backend:', e));
    };

    if (window.google && window.google.maps) {
      resolve(window.google);
      return;
    }
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkLoaded);
          resolve(window.google);
        }
      }, 100);
      return;
    }

    window.gmpSelfLoop = () => { resolve(window.google); };

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&loading=async&callback=gmpSelfLoop&v=weekly`;
    script.async = true;
    script.defer = true;
    script.setAttribute('loading', 'async');
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};
