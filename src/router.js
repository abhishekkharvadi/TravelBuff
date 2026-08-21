/**
 * TravelBuff Hash Router Helper (v7)
 * Manages URL hash synchronization with pure human-readable name slugs.
 */

export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseRoute() {
  const hash = window.location.hash || '#/locations';
  const cleanPath = hash.replace(/^#\/?/, '');
  const parts = cleanPath.split('/').filter(Boolean);

  const route = {
    tab: 'locations',
    folderSlug: null,
    locationSlug: null,
    collectionSlug: null,
    tripSlug: null,
    tripMode: false,
    guideSlug: null,
    subTab: null
  };

  if (parts.length === 0) {
    return route;
  }

  const primary = parts[0].toLowerCase();

  if (primary === 'locations') {
    route.tab = 'locations';
    if (parts[1] === 'folder' && parts[2]) {
      route.folderSlug = parts[2];
    } else if (parts[1] === 'item' && parts[2]) {
      route.locationSlug = parts[2];
    } else if (parts[1]) {
      route.folderSlug = parts[1];
    }
  } else if (primary === 'collections') {
    route.tab = 'collections';
    if (parts[1]) {
      route.collectionSlug = parts[1];
    }
  } else if (primary === 'trips') {
    route.tab = 'trips';
    if (parts[1]) {
      route.tripSlug = parts[1];
      if (parts[2] === 'mode') {
        route.tripMode = true;
      }
    }
  } else if (primary === 'settings') {
    route.tab = 'settings';
    if (parts[1] === 'guides') {
      route.subTab = 'guides';
      if (parts[2]) {
        route.guideSlug = parts[2];
      }
    }
  }

  return route;
}

export function buildHash(tab, { type = null, name = null } = {}) {
  const slug = slugify(name);

  if (tab === 'locations') {
    if (type === 'folder' && slug) {
      return `#/locations/folder/${slug}`;
    }
    if (type === 'item' && slug) {
      return `#/locations/item/${slug}`;
    }
    return '#/locations';
  }

  if (tab === 'collections') {
    if (slug) {
      return `#/collections/${slug}`;
    }
    return '#/collections';
  }

  if (tab === 'trips') {
    if (slug) {
      return type === 'mode' ? `#/trips/${slug}/mode` : `#/trips/${slug}`;
    }
    return '#/trips';
  }

  if (tab === 'settings') {
    if (type === 'guide' && slug) {
      return `#/settings/guides/${slug}`;
    }
    if (type === 'guides') {
      return '#/settings/guides';
    }
    return '#/settings';
  }

  return '#/locations';
}

export function navigateToHash(targetHash, replace = false) {
  if (window.location.hash === targetHash) return;
  if (replace) {
    window.history.replaceState(null, '', targetHash);
  } else {
    window.history.pushState(null, '', targetHash);
  }
  window.dispatchEvent(new Event('hashchange'));
}
