export const loadGoogleMaps = () => {
  const apiKey = localStorage.getItem('google_maps_api_key');
  const googleMapsEnabled = localStorage.getItem('google_maps_enabled') !== 'false';

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

      // Alert the user first
      alert('⚠️ Google Maps API Error: Authentication failed (invalid key or blocked API targets). The application is reverting to OpenStreetMap.');
      
      // Remove local storage enablement flag so we fallback to OSM
      localStorage.setItem('google_maps_enabled', 'false');
      // Trigger dynamic page reload to clean up and boot OSM
      window.location.reload();
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
