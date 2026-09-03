import { db, registerSyncTrigger, populateLocalDb } from './clientDb.js';

let isSyncing = false;
let syncStatusCallback = () => {};
let ws = null;
let reconnectTimer = null;
let currentGetToken = null;

export function handleResponseAuth(response) {
  if (!response || !response.headers) return null;
  const refreshedToken = response.headers.get('X-Refreshed-Token');
  if (refreshedToken) {
    console.log('[Auth] Received refreshed JWT token from server.');
    localStorage.setItem('tb_token', refreshedToken);
    window.dispatchEvent(new CustomEvent('tb_token_refreshed', { detail: { token: refreshedToken } }));
    return refreshedToken;
  }
  return null;
}

export function notifyAuthExpired() {
  syncStatusCallback('auth_expired');
  window.dispatchEvent(new CustomEvent('tb_auth_expired'));
}

export function connectWebSocket(getToken) {
  if (getToken) {
    currentGetToken = getToken;
  }
  const token = currentGetToken ? currentGetToken() : localStorage.getItem('tb_token');
  if (!token) return;

  // Prevent multiple concurrent WebSocket connections
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Clean up any existing closed/closing socket reference
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('[WebSocket Sync] Failed to initialize socket:', err);
    return;
  }

  ws.onopen = async () => {
    console.log('[WebSocket Sync] Connected. Flushing offline queue before pull...');
    try {
      syncStatusCallback('syncing');
      // 1. Flush offline changes to server first so server state is up to date
      await performSync(token);
      // 2. Perform fresh pull from server
      await populateLocalDb(token);
      syncStatusCallback('synced');
    } catch (err) {
      if (err?.message === 'AUTH_EXPIRED') {
        notifyAuthExpired();
      } else {
        console.error('[WebSocket Sync] Initial sync failed:', err);
        syncStatusCallback('error');
      }
    }
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'SYNC_REQUIRED') {
        console.log('[WebSocket Sync] Database update notification received. Refreshing...');
        const activeToken = currentGetToken ? currentGetToken() : localStorage.getItem('tb_token');
        await performSync(activeToken);
        await populateLocalDb(activeToken);
      }
    } catch (err) {
      if (err?.message === 'AUTH_EXPIRED') {
        notifyAuthExpired();
      } else {
        console.error('[WebSocket Sync] Error handling message:', err);
      }
    }
  };

  ws.onclose = (event) => {
    ws = null;
    if (event.code === 1008 || event.code === 4401 || event.code === 4403) {
      console.warn('[WebSocket Sync] Connection rejected due to authentication failure.');
      notifyAuthExpired();
      return;
    }
    console.log('[WebSocket Sync] Closed. Reconnecting in 5 seconds...');
    syncStatusCallback('offline');
    reconnectTimer = setTimeout(() => connectWebSocket(currentGetToken), 5000);
  };

  ws.onerror = (err) => {
    console.warn('[WebSocket Sync] Connection note (server offline/connecting):', err);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}

export function registerSyncStatusListener(callback) {
  syncStatusCallback = callback;
}

// Check network status
export function isOnline() {
  return navigator.onLine;
}

let syncPending = false;

// Perform Sync
export async function performSync(token) {
  const activeToken = token || (currentGetToken ? currentGetToken() : localStorage.getItem('tb_token'));
  if (!activeToken) {
    syncStatusCallback('offline');
    return;
  }

  if (isSyncing) {
    syncPending = true;
    return;
  }

  if (!isOnline()) {
    syncStatusCallback('offline');
    return;
  }

  isSyncing = true;
  syncStatusCallback('syncing');

  try {
    while (true) {
      syncPending = false;
      const queue = await db.sync_queue.orderBy('timestamp').toArray();
      if (queue.length === 0) {
        syncStatusCallback('synced');
        break;
      }

      // Send to /api/sync
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ actions: queue })
      });

      handleResponseAuth(response);

      if (response.ok) {
        // Clear synced items from queue
        const ids = queue.map(q => q.id);
        await db.sync_queue.bulkDelete(ids);
        console.log(`[PWA Sync] Successfully synchronized ${queue.length} offline actions.`);
      } else if (response.status === 401 || response.status === 403) {
        notifyAuthExpired();
        console.warn('[PWA Sync] Authentication expired or rejected during synchronization.');
        break;
      } else {
        syncStatusCallback('error');
        const errText = await response.text().catch(() => '');
        console.error('[PWA Sync] Sync failed with status code:', response.status, 'Details:', errText);
        break;
      }
    }
    // Pull fresh data from server once queue is drained
    await populateLocalDb(activeToken);
    syncStatusCallback('synced');
  } catch (err) {
    syncStatusCallback('offline');
    console.warn('[PWA Sync] Server unreachable (offline). Changes remain safely stored locally:', err.message || err);
  } finally {
    isSyncing = false;
    if (syncPending) {
      performSync(activeToken);
    }
  }
}

// Bind to browser online events
export function initSyncManager(getToken) {
  currentGetToken = getToken;

  // Establish WebSocket connection
  connectWebSocket(getToken);

  // Bind online event listener
  window.addEventListener('online', async () => {
    console.log('[PWA Sync] Device is online. Attempting synchronization...');
    const activeToken = getToken ? getToken() : localStorage.getItem('tb_token');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket(getToken);
    }
    await performSync(activeToken);
    await populateLocalDb(activeToken);
  });

  window.addEventListener('offline', () => {
    console.log('[PWA Sync] Device is offline.');
    syncStatusCallback('offline');
  });

  // Re-establish socket and trigger sync instantly on app resume / tab visibility focus
  window.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[PWA Sync] App became visible. Ensuring WebSocket connection and syncing...');
      const activeToken = getToken ? getToken() : localStorage.getItem('tb_token');
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket(getToken);
      }
      await performSync(activeToken);
    }
  });

  // Reconnect / resync on token refresh
  window.addEventListener('tb_token_refreshed', (e) => {
    const refreshedToken = e.detail?.token;
    if (refreshedToken) {
      if (ws) {
        ws.close();
      }
      connectWebSocket(() => refreshedToken);
      performSync(refreshedToken);
    }
  });

  // Bind trigger hook from clientDb
  registerSyncTrigger(() => {
    performSync(getToken());
  });

  // Initial attempt
  setTimeout(() => {
    performSync(getToken());
  }, 1000);
}
