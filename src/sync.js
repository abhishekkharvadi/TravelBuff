import { db, registerSyncTrigger, populateLocalDb } from './clientDb.js';

let isSyncing = false;
let syncStatusCallback = () => {};
let ws = null;

function connectWebSocket(getToken) {
  const token = getToken();
  if (!token) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;

  ws = new WebSocket(wsUrl);

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'SYNC_REQUIRED') {
        console.log('[WebSocket Sync] Database update notification received. Refreshing...');
        await populateLocalDb(token);
      }
    } catch (err) {
      console.error('[WebSocket Sync] Error handling message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[WebSocket Sync] Closed. Reconnecting in 5 seconds...');
    setTimeout(() => connectWebSocket(getToken), 5000);
  };

  ws.onerror = (err) => {
    console.error('[WebSocket Sync] Connection error:', err);
    ws.close();
  };
}

export function registerSyncStatusListener(callback) {
  syncStatusCallback = callback;
}

// Check network status
export function isOnline() {
  return navigator.onLine;
}

// Perform Sync
export async function performSync(token) {
  if (!token) {
    syncStatusCallback('offline');
    return;
  }

  if (isSyncing) return;

  if (!isOnline()) {
    syncStatusCallback('offline');
    return;
  }

  try {
    const queue = await db.sync_queue.orderBy('timestamp').toArray();
    if (queue.length === 0) {
      syncStatusCallback('synced');
      return;
    }

    isSyncing = true;
    syncStatusCallback('syncing');

    // Group queue items by action
    // Send to /api/sync
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ actions: queue })
    });

    if (response.ok) {
      // Clear synced items from queue
      const ids = queue.map(q => q.id);
      await db.sync_queue.bulkDelete(ids);
      syncStatusCallback('synced');
      console.log(`[PWA Sync] Successfully synchronized ${queue.length} offline actions.`);
    } else {
      syncStatusCallback('error');
      console.error('[PWA Sync] Sync failed with status code:', response.status);
    }
  } catch (err) {
    syncStatusCallback('error');
    console.error('[PWA Sync] Network error during sync:', err);
  } finally {
    isSyncing = false;
  }
}

// Bind to browser online events
export function initSyncManager(getToken) {
  // Establish WebSocket connection
  connectWebSocket(getToken);

  // Bind online event listener
  window.addEventListener('online', () => {
    console.log('[PWA Sync] Device is online. Attempting synchronization...');
    performSync(getToken());
  });

  window.addEventListener('offline', () => {
    console.log('[PWA Sync] Device is offline.');
    syncStatusCallback('offline');
  });

  // Re-establish socket and trigger sync instantly on app resume / tab visibility focus
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[PWA Sync] App became visible. Ensuring WebSocket connection and syncing...');
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket(getToken);
      }
      performSync(getToken());
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
