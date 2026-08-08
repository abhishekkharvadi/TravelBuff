# Changelog - TravelBuff

All notable changes to TravelBuff will be documented in this file.

## [v1.2.6] - 2026-08-08

### 🚀 Features & Improvements
- **2-Tier Photo Resolution Pipeline**: Implemented a 2-tier fallback strategy for cover photos—searching Wikipedia / Wikimedia Commons first, and falling back to Google Maps Places API if no Wikipedia image exists.
- **Contextual Query Resolution**: Enhanced sub-place photo searches to automatically combine place name and parent location name for higher match accuracy.
- **UI Button Standardization**: Renamed all "Fetch Cover" buttons to "Fetch Cover Image" across Location and Place views with updated tooltips.
- **Graceful Error Handling**: Replaced HTTP 404 error responses on photo searches with clean HTTP 200 payloads to eliminate browser console XHR errors.

---

## [v1.2.5] - 2026-08-07

### 🚀 Bug Fixes & Improvements
- **Fixed Location Detail Modal Crash**: Fixed `ReferenceError: RefreshCw is not defined` crash in `src/components/Locations.jsx` by properly importing `RefreshCw` from `lucide-react`.
- **Non-Disruptive Database Migration**: Added a one-time server startup migration in `db.js` to backfill `local_file_data` cover photo links for existing locations and places from `entity_photos` without modifying or re-downloading user data.
- **Scoped Single-Entity "Fetch Cover"**: Scoped the "Fetch Cover" button strictly to single locations and places, eliminating the bulk auto-fetch loop.
- **Backup & Restore Media Coverage**: Updated `/api/backup/export` in `server.js` to bundle 100% of cover photos stored in `local_file_data` for full data portability across backups.

---

## [v1.2.1] - 2026-07-20

### 🚀 Features & Updates
- Initial stable release with full offline-first Dexie synchronization, Google Maps & OpenStreetMap support, AI Document & URL import, Immich photo album integration, and personal finance trip logging.
