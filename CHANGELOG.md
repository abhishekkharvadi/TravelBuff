# Changelog - TravelBuff

All notable changes to TravelBuff will be documented in this file.

## [v4] - 2026-08-12

### 🚀 Architecture & Session Resilience (v4)
- **Database-Persisted `JWT_SECRET`**: Auto-generates and persists a secure 64-character secret in `/data/travelbuff.db` (`app_config` table). User sessions, JWT tokens, and WebSockets now survive container restarts, image updates, and Docker Hub pulls without requiring re-login.
- **3-Port Environment Isolation**:
  - Local Dev (`npm run dev`): `http://localhost:3000` (Vite) / `3001` (API).
  - Local Docker Test (`test-docker-build.sh`): `http://localhost:4000`.
  - Docker Hub Production (`docker-compose.yml`): `http://localhost:5000`.
- **Express SPA Asset Guard**: Updated catch-all route `app.get('*')` in `server.js` to return HTTP `404` for missing static files (`/assets/`), preventing HTML from being returned for script modules (`NS_ERROR_CORRUPTED_CONTENT`).
- **Network-First `index.html` Service Worker Strategy**: Configured `sw.js` to load navigation requests network-first when online, ensuring fresh asset hashes on container deployments.
- **Version Bump**: Updated application version to `v4` across `package.json`, `src/version.js`, `src/router.js`, `public/sw.js`, and `CHANGELOG.md`.

---

### 🐛 Bug Fixes & Session Resilience (v3)
- **Automatic 401/403 Stale Token Invalidation**: Updated `fetchUserConfig` in `App.jsx` to automatically log out users (`handleLogout()`) when `/api/auth/me` returns `401` or `403` status codes, preventing broken logged-in states caused by mismatched JWT secrets.
- **Harmonized JWT Secret Configuration**: Aligned default `JWT_SECRET` in `docker-compose.yml` to `${JWT_SECRET:-travelbuff-super-secret-key-12345}` for seamless dev and container out-of-the-box local testing.
- **Server WebSocket Diagnostic Warnings**: Added explicit `console.warn` outputs during `server.on('upgrade')` on `/api/ws` when JWT verification fails or tokens are missing.
- **Client WebSocket Lifecycle Guard**: Enhanced `connectWebSocket` in `sync.js` to guard against duplicate socket connections and prevent duplicate `.close()` triggers.
- **PWA Service Worker Cache Upgrade (v3)**: Bumped PWA Service Worker cache version to `travelbuff-v3` to automatically purge stale browser app shell caches.
- **Version Bump**: Updated application version to `v3` across `package.json`, `src/version.js`, `public/sw.js`, and `CHANGELOG.md`.

---

### 🚀 Architecture & Major Release (v2)
- **Separate Repositories Setup**: Split TravelBuff into core application repository (`travelbuff`) and container distribution repository (`travelbuff-docker`) linked via Git Submodule.
- **Automated Security Audit & Pre-Sync Gate**: Added `npm audit --audit-level=high` prebuild checks and integrated local security gate in `sync-repos.sh` to block unvetted code from reaching GitHub.
- **3-Port Conflict-Free Dev Setup**: Dedicated Vite Dev Frontend (Port 3000), Express Dev Backend API (Port 3001), and Docker Container (Port 5000).
- **Theme-Aware SVG Teardrop Map Pins**: Upgraded Leaflet map markers to 36x42 SVG teardrop pins with drop shadows, crisp white outlines, numeric coordinate parsing, and theme-adaptive colors (Light vs Dark mode).
- **Automatic Background Geocoding & Error Warning Badge**: Background auto-geocoding for unlocated places with `⚠️ Missing location coordinates` warning indicator on place cards.
- **Version Bump**: Updated application version to `v2` across `package.json`, `src/version.js`, `src/router.js`, and `CHANGELOG.md`.

---

## [v1.3.0] - 2026-08-09

### 🚀 Features & AI Import Improvements
- **AI Location-First Extraction & Tagging**: Updated AI import extraction prompt in `AiImportModal.jsx` to resolve top-level locations first and automatically link places of visit to their corresponding parent locations.
- **Duplicate Prevention & Non-Location Filtering**: Filtered duplicate entries and non-specific location text from AI geocoding and resolution.
- **Version Bump**: Updated application version to `v1.3.0` across `package.json`, `src/version.js`, `src/router.js`, and `CHANGELOG.md`.

---

## [v1.2.9] - 2026-08-09

### 🚀 Features & Documentation Updates
- **Docker & Docker Compose Deployment Guide**: Added official Docker container deployment instructions to `documentation.md` (Section 2: Setting Up TravelBuff):
  - Documented official Docker image repository `abhishekkharvadi/travelbuff:latest`.
  - Added single-line `docker run` CLI setup with volume persistence for `/app/data` and `/app/data/uploads`.
  - Added production-ready `docker-compose.yml` sample template and Docker Compose lifecycle commands (`up`, `logs`, `down`).
- **Version Bump**: Updated application version to `v1.2.9` across `package.json`, `src/version.js`, `src/router.js`, `documentation.md`, and `CHANGELOG.md`.

---

## [v1.2.8] - 2026-08-09

### 🚀 Features & Documentation Overhaul
- **Comprehensive Documentation Rewrite**: Completely updated `documentation.md` into 12 structured, non-technical sections to accurately reflect current source code implementations across all app modules:
  - Added new **Collections** section covering Visited, Bucket List, and custom thematic grouping rules (AND/OR logic, keywords, location filters) with 5 concrete real-world examples (Wonders of the World, Restaurants in Delhi, Day Trips from Chennai, Paris Cultural Landmarks, Tokyo Coffee Trail).
  - Relocated and expanded **Importing Travel Guides & Using AI** section with options for URL scraping, document file uploads, saved guide management, 3 workspace tabs, AI button guides, and 1-click itinerary creation.
  - Rewrote **Creating Itinerary Plans & Travelers** covering the 2-step setup wizard (Manual vs AI Mode), 3-column workspace, sub-tabs (`Itinerary`, `Budget`, `Notes`), home origin distance calculations, and hotel/stay lodging anchors.
  - Expanded **Expense Tracking & Home Addresses** detailing planned vs actual spending, multi-currency conversions, custom exchange rates, category breakdowns, and receipt attachments.
  - Added new **Trip Mode (On-the-Road Companion)** section detailing today's schedule focus, 100% offline local sync, quick expense logging, nearby food finder with 1-click bookmarking, instant booking vouchers, OwnTracks GPS travel logs, and quick notes.
  - Expanded **Settings** section covering Immich integration, AI provider setup (OpenAI, Claude, Gemini, Ollama, Local AI), Google Maps key options, OwnTracks webhook, chunked backup/restore, admin user management, saved home addresses, and companion profiles.
  - Added new **Helpful Tips & Shortcuts** section covering automatic coordinate smart parsing (latitude/longitude paste auto-split trick), keyboard shortcuts, native browser history/bookmarking, and offline pre-loading.
- **Version Bump**: Updated application version to `v1.2.8` across `package.json`, `src/version.js`, `src/router.js`, `documentation.md`, and `CHANGELOG.md`.

---

## [v1.2.7] - 2026-08-08

### 🚀 Features & Bug Fixes
- **Bulk Location Controls Redesign**: Relocated the Bulk Location selector to a dedicated row with an increased, independent 320px dropdown width. Separated the Apply button into a standalone button element next to the selector to eliminate flex layout shrinking and button stretching.
- **AI Bulk Category Extraction & Normalization**: Resolved an issue where AI-extracted categories were blocked from updating table rows during bulk AI extraction. Added an automatic `normalizeCategory` parser (mapping variations like "food" or "restaurants" to standard categories like `Dining`, `"sightseeing"` to `Attraction`, `"hotels"` to `Lodging`, etc.) and case-insensitive dropdown option matching.
- **Comprehensive Documentation**: Updated `documentation.md` with detailed user guidance explaining all toolbar buttons, bulk location options, category normalizations, and AI customization controls in the AI Import & Review Data modal.

---

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
