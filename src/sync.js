import { db, registerSyncTrigger } from './clientDb.js';

let isSyncing = false;
let syncStatusCallback = () => {};

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
  // Bind online event listener
  window.addEventListener('online', () => {
    console.log('[PWA Sync] Device is online. Attempting synchronization...');
    performSync(getToken());
  });

  window.addEventListener('offline', () => {
    console.log('[PWA Sync] Device is offline.');
    syncStatusCallback('offline');
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
