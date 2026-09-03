/**
 * Background Task Queue for Immich Locations Enrichment & 3-Stage Pipeline
 * Processes:
 * Stage 1: Staging entities under temporary "Immich Imports" folder
 * Stage 2: Rate-limited cover photo & metadata fetching
 * Stage 3: Topological hierarchy sorting (Country -> State -> City) & holding folder cleanup
 */

import { db, queueSyncAction } from '../clientDb.js';

const STORAGE_KEY = 'tb_immich_import_queue_state';

class ImmichImportQueue {
  constructor() {
    const saved = this.loadPersistedState();
    this.status = saved?.status || 'idle'; // 'idle' | 'running' | 'completed' | 'error'
    this.stage = saved?.stage || 'idle';   // 'idle' | 'staging' | 'fetching_photos' | 'sorting' | 'completed'
    
    this.queue = saved?.queue || [];
    this.total = saved?.total || 0;
    this.completed = saved?.completed || 0;
    this.successCount = saved?.successCount || 0;
    this.skippedCount = saved?.skippedCount || 0;
    this.currentCity = saved?.currentCity || '';
    this.logs = saved?.logs || [];
    this.token = saved?.token || localStorage.getItem('tb_token') || '';
    
    this.holdingFolderId = saved?.holdingFolderId || null;
    this.sortingPlan = saved?.sortingPlan || null;

    this.listeners = new Set();
    this.delayMs = 750; // Respectful rate limiting for Wikipedia / OSM

    // Resume queue automatically if page reloaded while active
    if (this.status === 'running') {
      setTimeout(() => {
        this.token = this.token || localStorage.getItem('tb_token') || '';
        if (this.stage === 'fetching_photos') {
          this.processNextPhoto();
        } else if (this.stage === 'sorting') {
          this.executeSortingPhase();
        }
      }, 500);
    }
  }

  loadPersistedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse persisted immich import queue state:', e);
    }
    return null;
  }

  savePersistedState() {
    try {
      if (this.status === 'idle') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          status: this.status,
          stage: this.stage,
          queue: this.queue,
          total: this.total,
          completed: this.completed,
          successCount: this.successCount,
          skippedCount: this.skippedCount,
          currentCity: this.currentCity,
          logs: this.logs,
          token: this.token,
          holdingFolderId: this.holdingFolderId,
          sortingPlan: this.sortingPlan
        }));
      }
    } catch (e) {
      console.warn('Failed to save immich import queue state:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.savePersistedState();
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  getState() {
    return {
      status: this.status,
      stage: this.stage,
      total: this.total,
      completed: this.completed,
      successCount: this.successCount,
      skippedCount: this.skippedCount,
      currentCity: this.currentCity,
      logs: [...this.logs],
      percent: this.total > 0 ? Math.round((this.completed / this.total) * 100) : (this.stage === 'completed' ? 100 : 0)
    };
  }

  addLog(stageTag, text, type = 'info', extra = {}) {
    this.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      stage: stageTag,
      text,
      type, // 'info' | 'success' | 'warning' | 'error'
      ...extra
    });
    // Keep max 150 log entries
    if (this.logs.length > 150) {
      this.logs = this.logs.slice(0, 150);
    }
    this.notify();
  }

  /**
   * Check Dexie database for any lingering locations with photo_sync_status === 'pending'
   * and auto-resume enrichment if queue is currently idle.
   */
  async checkAndResumePending(token) {
    if (this.status !== 'idle' || this.isProcessing) return;
    try {
      const pendingLocs = await db.locations
        .filter(loc => loc.photo_sync_status === 'pending')
        .toArray();

      if (pendingLocs.length > 0 && this.status === 'idle') {
        console.log(`[ImmichQueue] Found ${pendingLocs.length} pending locations to enrich. Resuming queue...`);
        this.status = 'running';
        this.stage = 'fetching_photos';
        this.token = token || localStorage.getItem('tb_token') || '';
        this.queue = [...pendingLocs];
        this.total = pendingLocs.length;
        this.completed = 0;
        this.successCount = 0;
        this.skippedCount = 0;
        this.notify();
        this.processNextPhoto();
      }
    } catch (err) {
      console.warn('[ImmichQueue] Error checking pending locations:', err);
    }
  }

  /**
   * Start Server-Side Atomic Import Pipeline
   * Sends countryTree payload to /api/immich/execute-import, streams logs, and syncs Dexie
   */
  async startServerImport(countryTree, token, fetchImages = true, totalSelected = 0, createHierarchy = true) {
    if (this.status === 'running') return;

    this.status = 'running';
    this.stage = 'importing';
    this.token = token || localStorage.getItem('tb_token') || '';
    this.logs = [];
    this.completed = 0;
    this.total = totalSelected || 1;
    this.currentCity = '';
    this.notify();

    this.addLog('General', 'Connecting to backend import service...', 'info');

    try {
      const response = await fetch('/api/immich/execute-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ countryTree, fetchImages, createHierarchy })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Merge server logs into queue logs
      if (Array.isArray(result.logs)) {
        for (const logItem of result.logs.reverse()) {
          this.addLog(logItem.stage, logItem.text, logItem.type, logItem.img ? { img: logItem.img } : {});
        }
      }

      this.addLog('Sync', 'Pulling updated data into local offline storage...', 'info');
      
      // Pull fresh data from server into Dexie
      const { populateLocalDb } = await import('../clientDb.js');
      await populateLocalDb(this.token);

      this.stage = 'completed';
      this.status = 'completed';
      this.completed = this.total;
      this.addLog('Sync', 'Local database updated successfully!', 'success');
      this.notify();
    } catch (err) {
      console.error('Failed executing server import:', err);
      this.stage = 'completed';
      this.status = 'error';
      this.addLog('General', `Import failed: ${err.message}`, 'error');
      this.notify();
    }
  }

  // Legacy pipeline signature mapped to server import
  async startPipeline({ stagedItems, cityLocations, sortingPlan, holdingFolderId, countryTree }, token, fetchImagesEnabled = true) {
    if (countryTree) {
      return this.startServerImport(countryTree, token, fetchImagesEnabled);
    }
    // Fallback if countryTree passed as separate arg
    return this.startServerImport(stagedItems || {}, token, fetchImagesEnabled);
  }

  async processNextPhoto() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    if (this.queue.length === 0) {
      this.isProcessing = false;
      // Photo queue finished! Transition to STAGE 3 (Sorting)
      this.addLog('Photos', `Photo fetching complete! Found ${this.successCount} photos (${this.skippedCount} skipped).`, 'success');
      this.stage = 'sorting';
      this.currentCity = '';
      this.notify();
      await this.executeSortingPhase();
      return;
    }

    const item = this.queue.shift();
    this.currentCity = item.name;
    this.notify();

    try {
      const searchPayload = {
        query: item.rawCityName || item.name,
        locationContext: item.locationContext || item.country || '',
        latitude: item.latitude,
        longitude: item.longitude
      };

      const res = await fetch('/api/import/search-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(searchPayload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.fileUrl) {
          const updates = {
            photo_sync_status: 'completed',
            local_file_data: data.fileUrl
          };
          if (data.description) {
            updates.notes = data.description;
          }

          const allLocs = await db.locations.toArray();
          const target = allLocs.find(l => String(l.id) === String(item.id));
          if (target) {
            await db.locations.put({ ...target, ...updates });
          }

          await queueSyncAction('locations', 'update', {
            id: item.id,
            ...updates
          });

          this.successCount++;
          this.addLog('Photos', `SUCCESS: Cover photo attached for "${item.name}"`, 'success', { img: data.fileUrl });
        } else {
          this.skippedCount++;
          const reason = data?.message || 'No matching photo on Wikipedia/Commons';
          this.addLog('Photos', `SKIPPED: "${item.name}" (${reason})`, 'warning');
        }
      } else {
        this.skippedCount++;
        const errText = await res.text().catch(() => '');
        this.addLog('Photos', `ERROR: Failed photo lookup for "${item.name}" (HTTP ${res.status}: ${errText})`, 'error');
      }
    } catch (err) {
      console.warn(`Failed to enrich location "${item.name}":`, err.message);
      this.skippedCount++;
      this.addLog('Photos', `ERROR: Network exception for "${item.name}": ${err.message}`, 'error');
    }

    this.completed++;
    this.isProcessing = false;
    this.notify();

    setTimeout(() => this.processNextPhoto(), this.delayMs);
  }

  // ==========================================
  // STAGE 3: Sorting & Relocation
  // ==========================================
  async executeSortingPhase() {
    this.stage = 'sorting';
    this.notify();
    this.addLog('Sorting', `Starting topological hierarchy organization (Country -> State -> City)...`, 'info');

    try {
      const plan = this.sortingPlan || {};

      const allLocsSnapshot = await db.locations.toArray();

      // 1. Move Country Folders to Root (parent_id = null)
      if (Array.isArray(plan.countryFolders) && plan.countryFolders.length > 0) {
        for (const cf of plan.countryFolders) {
          const existing = allLocsSnapshot.find(l => String(l.id) === String(cf.id)) || await db.locations.get(cf.id);
          const fullRecord = existing ? { ...existing, parent_id: null } : { ...cf, parent_id: null };
          await db.locations.put(fullRecord);
          await queueSyncAction('locations', 'update', {
            id: cf.id,
            parent_id: null
          });
          this.addLog('Sorting', `[Country] Set folder "${cf.name}" to Root level.`, 'info');
        }
      }

      // 2. Move State Folders under their Country Folders (parent_id = countryFolderId)
      if (Array.isArray(plan.stateFolders) && plan.stateFolders.length > 0) {
        for (const sf of plan.stateFolders) {
          const existing = allLocsSnapshot.find(l => String(l.id) === String(sf.id)) || await db.locations.get(sf.id);
          const fullRecord = existing 
            ? { ...existing, parent_id: sf.targetParentId, country: sf.countryName || existing.country } 
            : { ...sf, parent_id: sf.targetParentId, country: sf.countryName || sf.country };
          await db.locations.put(fullRecord);
          await queueSyncAction('locations', 'update', {
            id: sf.id,
            parent_id: sf.targetParentId,
            country: sf.countryName || fullRecord.country
          });
          this.addLog('Sorting', `[State] Moved folder "${sf.name}" under Country "${sf.countryName}".`, 'info');
        }
      }

      // 3. Move City Locations under their State/Country Folders
      if (Array.isArray(plan.cityLocations) && plan.cityLocations.length > 0) {
        for (const cl of plan.cityLocations) {
          const existing = allLocsSnapshot.find(l => String(l.id) === String(cl.id)) || await db.locations.get(cl.id);
          const fullRecord = existing 
            ? { ...existing, parent_id: cl.targetParentId } 
            : { ...cl, parent_id: cl.targetParentId };
          await db.locations.put(fullRecord);
          await queueSyncAction('locations', 'update', {
            id: cl.id,
            parent_id: cl.targetParentId
          });
          this.addLog('Sorting', `[City] Placed location "${cl.name}" into "${cl.parentFolderName}".`, 'info');
        }
      }

      // 4. Relocate Existing Locations
      if (Array.isArray(plan.relocatedLocations) && plan.relocatedLocations.length > 0) {
        for (const rl of plan.relocatedLocations) {
          const targetId = rl.existingLoc?.id;
          const existing = allLocsSnapshot.find(l => String(l.id) === String(targetId)) || await db.locations.get(targetId);
          const fullRecord = existing 
            ? { ...existing, parent_id: rl.targetParentId, state: rl.state || existing.state, country: rl.country || existing.country } 
            : { ...rl.existingLoc, parent_id: rl.targetParentId, state: rl.state || rl.existingLoc.state, country: rl.country || rl.existingLoc.country };
          await db.locations.put(fullRecord);
          await queueSyncAction('locations', 'update', {
            id: fullRecord.id,
            parent_id: rl.targetParentId,
            state: rl.state || fullRecord.state,
            country: rl.country || fullRecord.country
          });
          this.addLog('Sorting', `[Relocate] Moved existing "${rl.existingLoc.name}" into "${rl.parentFolderName}".`, 'info');
        }
      }

      // Brief delay to allow Dexie update cycles to settle
      await new Promise(r => setTimeout(r, 250));

      // 5. Holding Folder Cleanup Check
      if (this.holdingFolderId) {
        let allLocs = await db.locations.toArray();
        let remainingInHolding = allLocs.filter(l => String(l.parent_id) === String(this.holdingFolderId));
        
        // If any remaining items were part of stateFolders, cityLocations, or relocatedLocations, force relocate them
        if (remainingInHolding.length > 0) {
          for (const rem of remainingInHolding) {
            const plannedState = plan.stateFolders?.find(sf => String(sf.id) === String(rem.id));
            const plannedCity = plan.cityLocations?.find(cl => String(cl.id) === String(rem.id));
            const plannedRelocate = plan.relocatedLocations?.find(rl => String(rl.existingLoc?.id) === String(rem.id));
            
            const targetParentId = plannedState?.targetParentId || plannedCity?.targetParentId || plannedRelocate?.targetParentId;
            if (targetParentId) {
              const updatedRem = { ...rem, parent_id: targetParentId };
              await db.locations.put(updatedRem);
              await queueSyncAction('locations', 'update', { id: rem.id, parent_id: targetParentId });
              this.addLog('Sorting', `[Sweep] Auto-relocated lingering "${rem.name}" out of holding folder.`, 'info');
            }
          }
          await new Promise(r => setTimeout(r, 150));
          allLocs = await db.locations.toArray();
          remainingInHolding = allLocs.filter(l => String(l.parent_id) === String(this.holdingFolderId));
        }

        if (remainingInHolding.length === 0) {
          await db.locations.delete(this.holdingFolderId);
          await queueSyncAction('locations', 'delete', { id: this.holdingFolderId });
          this.addLog('Sorting', `All locations sorted! Deleted temporary "Immich Imports" holding folder.`, 'success');
        } else {
          const names = remainingInHolding.map(r => r.name).join(', ');
          this.addLog('Sorting', `Holding folder retained: ${remainingInHolding.length} items still inside (${names}).`, 'warning');
        }
      }

      this.stage = 'completed';
      this.status = 'completed';
      this.addLog('Sorting', `Import and organization finished successfully!`, 'success');
      this.notify();
    } catch (err) {
      console.error('Error during sorting phase:', err);
      this.addLog('Sorting', `ERROR during sorting: ${err.message}`, 'error');
      this.status = 'error';
      this.notify();
    }
  }

  async cancelQueue() {
    this.addLog('General', `User cancelled the import queue.`, 'warning');
    this.status = 'idle';
    this.stage = 'idle';
    const remainingItems = [...this.queue];
    this.queue = [];
    this.currentCity = '';
    this.notify();

    // Mark remaining items in Dexie as photo_sync_status 'completed' so they don't loop
    try {
      for (const item of remainingItems) {
        await db.locations.update(item.id, { photo_sync_status: 'completed' });
      }
    } catch (e) {
      console.warn('Failed to update remaining items on cancel:', e);
    }
  }

  dismiss() {
    this.status = 'idle';
    this.stage = 'idle';
    this.queue = [];
    this.total = 0;
    this.completed = 0;
    this.currentCity = '';
    this.logs = [];
    this.holdingFolderId = null;
    this.sortingPlan = null;
    this.notify();
  }
}

export const immichImportQueue = new ImmichImportQueue();
