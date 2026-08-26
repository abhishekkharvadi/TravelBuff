# Changelog - TravelBuff

All notable changes to TravelBuff will be documented in this file.

## [v7.2.1] - 2026-08-27

### 🛠️ Bug Fixes & Workspace Enhancements
- **Places Bank AI Trip Planner**: Added a dedicated `✨ AI Plan` assistant button directly inside the Places Bank column within the Planning Workspace. Allows users to preview and edit custom AI prompts before generating day itineraries, with automatic prioritization of >4-star rated locations and high-importance attractions when schedule capacity is limited.
- **Centralized AI Dispatcher & Authentication Resilience**: Unified all backend AI calls (`/api/ai/generate-trip`, `/api/import/extract-ai`) into a centralized `callAiProvider` helper. Sanitizes API keys, adds standard `x-goog-api-key` headers for Gemini, and surfaces exact upstream error diagnostics rather than generic 401 statuses.
- **Trip Map Pin Numbering Consistency**: Synchronized map pin numbers with the exact badge sequence numbering displayed in "Itinerary Days" and "Places Bank".
- **Interactive Day-Wise Trip Map Filtering**: Made itinerary days (Day 1, Day 2, etc.) clickable. Selecting a day isolates and zooms the Trip Map and driving route strictly to that day's scheduled stops, complete with an active day indicator badge and a single-click reset to restore all days.
- **Start Trip & End Trip Home Address Endpoints**: Added dedicated dropdown selectors in both the New Trip Wizard and Trip Metadata editor to specify Home Addresses as starting and ending points for trips.
- **Places Bank Start & Stop Address Management**: Replaced generic home address lists with dedicated Start Address and Stop Address cards featuring a minus (`−`) button to unassign them from the trip with one click.
- **Dynamic Folder Places Synchronization**: Improved live reactivity between IndexedDB collections/folders and active trips so newly created, imported, or moved places immediately appear inside their parent folders in the Places Bank without requiring a trip re-select.
- **Day-Specific Location Constraints & Stay Filtering**: Added a per-day location assignment dropdown to each day card in Itinerary Days. The AI generator strictly schedules places from the designated location for that day, and the "Stay" dropdown strictly filters to hotels and resorts belonging to that specific location.
- **Itinerary Days Category Display**: Added lowercase category tags (e.g. `(Attraction)`, `(Dining)`, `(Hotel)`) next to landmark titles in the Itinerary Days list to match Places Bank styling.
- **Pure OpenStreetMap Tile Server**: Replaced legacy CARTO basemap URLs in Leaflet fallback with the official OpenStreetMap tile server (`tile.openstreetmap.org`), completely eliminating the "API KEY REQUIRED" watermark.
- **Google Maps Persistence & Recovery**: Fixed Google Maps container remount retention and removed destructive `localStorage` lockout flags upon transient errors, ensuring Google Maps loads automatically whenever an API key is present.

## [v7.2.0] - 2026-08-21

### 🛠️ Fixes & Architectural Improvements
- **Telemetry Cryptography Architecture**: Upgraded Ed25519 signature payload construction. Migrated internal storage from `PEM` encoded strings to raw 32-byte hex seeds to guarantee strict Cloudflare Worker (`crypto.subtle`) verification compatibility.
- **Self-Healing Background Pipeline**: Implemented an auto-recovery subsystem within the telemetry client that gracefully catches desynchronized backend states (`requires_registration`) and automatically initiates a background Proof-of-Work handshake to self-correct.
- **Optimized Boot Sequence**: Removed the artificial startup delay for outbound telemetry pings. Network handshakes and `startup` events now execute completely asynchronously the millisecond the Node server boots without halting the main thread.

## [v7.1.0] - 2026-08-21

### 🔒 Privacy & Architecture Updates
- **Cryptographic Anonymous Telemetry Client**: 
  - Introduced an opt-out, 100% anonymous usage reporting system to guide open-source development priorities. 
  - Uses Ed25519 asymmetric signatures and Proof-of-Work (PoW) registration to guarantee genuine app instances without exposing personally identifiable information (PII).
  - Collects generic infrastructure metrics (Node version, OS architecture) and feature utilization buckets. No IPs, precise counts, or location strings are ever logged.
  - Added a non-intrusive First-Run Notice Banner for admin users.
  - **Opt-Out Control**: Added a "Privacy & Telemetry" toggle in the Admin Settings UI, and support for the `DISABLE_TELEMETRY=true` environment variable to completely block telemetry initialization at the container level.
- **Treunas Scale Listing Compliance**: Bumped standard version string to formal SemVer `7.1.0` to comply with listing requirements.

## [v7] - 2026-08-19

### 🚀 Features & Interactive Onboarding System (v7)
- **Interactive UI Spotlight Tour (`OnboardingTour.jsx`)**:
  - Guided 7-step onboarding tour introducing TravelBuff's offline-first architecture, Locations & Folders, Smart Collections, AI Travel Guide Importer, Trips & Itinerary Planner, Trip Mode, and Settings & Integrations.
  - **SVG Cutout Mask**: Implemented an SVG-based transparent cutout mask (`fill-rule="evenodd"`) with target-highlighted pulsing glow borders (`#8b5cf6`), eliminating backdrop occlusions and keeping spotlighted navigation buttons crisp, bright, and legible.
  - **Trip Mode Guidance**: Dedicated step explaining single-screen daily schedules, 1-click nearby food/cafe bookmarking, offline voucher viewers, and quick expense logging.
  - Responsive positioning adapting to desktop and mobile viewports with step progress indicator dots, previous/next navigation, skip controls, and celebration finish.
- **Floating "Getting Started" Checklist Widget (`OnboardingChecklist.jsx`)**:
  - Sleek collapsible glassmorphic widget floating in the bottom-right corner tracking 5 essential onboarding milestones:
    1. 📍 **Add your first Location or Folder**
    2. 📚 **Create a Collection** (filters out virtual system collections so only user-created collections count)
    3. ✨ **Import a Guide (URL or PDF)**
    4. 🗓️ **Plan a Trip & Daily Itinerary**
    5. ⚙️ **Configure Home Address or Settings**
  - **Dynamic Dexie Live Queries**: Uses `useLiveQuery` on IndexedDB (`db.locations`, `db.collections`, `db.markdowns`, `db.trips`, `db.user_addresses`) to automatically check off milestones in real time.
  - Direct 1-click action shortcuts on each task to open modals or switch to the corresponding screen.
  - Compact minimize launcher badge (`[?] Getting Started (X/5)`) and celebratory completion reward (`You're a TravelBuff Pro! 🎉`).
- **User-Scoped Onboarding Lifecycle & First-Time Registration**:
  - User-scoped completion keys (`tb_tour_completed_${userId}`, `tb_checklist_dismissed_${userId}`, `tb_checklist_collapsed_${userId}`).
  - Automatically launches the spotlight tour and checklist immediately upon new account registration.
- **Settings Guided Onboarding Controls**:
  - Added **"Help & Guided Onboarding"** card in `Settings.jsx` with **"🚀 Re-start Guided Tour"** and **"📋 Show Getting Started Checklist"** controls.
- **Version Bump**: Updated application version to `v7` across `package.json`, `src/version.js`, `src/router.js`, `public/sw.js`, and `CHANGELOG.md`.

---

## [v6] - 2026-08-18

### 🚀 Features & Organization Controls (v6)
- **Move to Folder Actions**:
  - **Quick Action on Location Cards (Option A)**: 1-click move button on location cards to relocate any location or subfolder into another folder or back to root without dragging.
  - **Location Detail Move Action (Option B)**: Dedicated "Move" pill button in the Location Detail view header with real-time breadcrumb and destination updates.
  - **Multi-Select Bulk Move & Delete (Option C)**: Multi-selection mode for locations with glowing card selections and a floating bulk action bar to move or delete multiple locations at once with safety confirmations for nested folders.
- **Unified `MoveToFolderModal`**:
  - Interactive searchable folder selector with wide search bar (`flex: 1`), 1-click clear (`✕`), and hierarchical tree breadcrumbs (e.g. `Root > Asia > Japan`).
  - Safe circular dependency prevention (guards against moving a folder into itself or its own sub-tree).
  - Quick **"🏠 Root / Top Level (No Folder)"** target.
  - Compact **"+ New Folder"** action that seamlessly opens the creation dialog with the "Folder" checkbox checked and locked (`isFolderLocked`), automatically moving the selected locations into the new folder upon save.
- **Targeted Pill Buttons & Horizontal Action Strip Toolbar**:
  - Standardized `36px` uniform height, typography, and hover transitions across all header buttons.
  - Added non-wrapping horizontal swipe action strip (`.header-actions-strip`) ensuring 100% discoverability of text labels on mobile while preventing awkward multi-line wrapping glitches.
  - **Main Locations Header**: `[Select (Pill)]`, `(Filters (Round))`, `[Add Location (Pill)]`.
  - **Within Folder Header**: Strict requested ordering `[Move (Pill)]`, `[Select (Pill)]`, `[Add Location (Pill)]`, `(Filter (Round))`, `(Delete (Round, red error styling))` on the far right.
  - **Location Detail Header**: `[✓ Visited / ○ Not Visited (Pill)]` first in line, `[Folder / Convert to Folder (Pill)]`, `[Move (Pill)]`, `(Delete (Round, red error styling))`.
- **Navigation Scroll Position Reset**:
  - Automatically resets window scroll position to the top when navigating from a scrolled list in a folder to a specific location detail view.
- **Trip Mode Offline Note Saving & Sync Resilience**:
  - Enabled 100% offline trip note creation and deletion backed by local Dexie IndexedDB (`trip_notes`) and queued synchronization (`queueSyncAction`).
  - Added `/api/trips/:tripId/notes` server endpoint and full client-server database synchronization.
  - Handled offline network errors gracefully in PWA synchronization, setting status to `'offline'` without alarming red error badges.
  - Added instant visual feedback toasts when creating or removing trip notes.
- **Mobile Floating Bulk Action Bar Elevation**:
  - Elevated `.bulk-actions-floating-bar` on mobile viewports above the bottom navigation footer (`Locations`, `Collections`, `Trips`) with safe-area insets.
- **1-Click Search Clear Buttons**: Added instant clear (`✕`) buttons on search bars across Locations, Sub-places, Add Location geocoding search, and Move to Folder destination search.
- **Modal Mutual Exclusivity & Shared Rendering**:
  - Extracted unified modal rendering (`renderModals()`) ensuring Move and Delete Folder dialogs open smoothly directly within Location Detail views.
  - Enforced mutual exclusivity so opening one modal automatically closes any other active modal dialogs.
- **Version Bump**: Updated application version to `v6` across `package.json`, `src/version.js`, `src/router.js`, `public/sw.js`, and `CHANGELOG.md`.

### 🐛 Bug Fixes (v6)
- **Mobile Import Dropdown Clipping**: Removed `overflow-x: hidden` clipping on mobile app header and elevated Import dropdown z-index to `1100`.
- **Location Detail View Crash**: Fixed `activeLocationPlaces` ReferenceError when opening specific location detail pages.
- **Modal Search Bar Proportion**: Corrected search window sizing and compact "+ New Folder" placement in the Move to Folder modal.
- **Folder Creation Checkbox Lock**: Prevented unchecking "Folder" when creating a folder through the Move flow.

---

## [v5] - 2026-08-15

### 🚀 Features & Base Currency Search (v5)
- **Dynamic 160+ ISO World Currencies**: Expanded Base Currency configurations in `Settings.jsx` from 5 static currencies to all official ISO 4217 world currencies (~160+) dynamically resolved via browser-native `Intl.supportedValuesOf('currency')` and `Intl.DisplayNames`.
- **Searchable Currency Combobox Component**: Replaced static dropdown with a custom searchable combobox (`SearchableCurrencySelect`) allowing instant search filtering by currency code (e.g. `CAD`), currency name (e.g. `Rupee`, `Euro`, `Yen`), and currency symbol (e.g. `€`, `₹`, `$`).
- **Pinned Popular Currencies**: Top 12 major world currencies (USD, EUR, GBP, INR, JPY, CAD, AUD, CHF, SGD, AED, CNY, NZD) pinned at the top for 1-click selection.
- **Theme-Aware UI**: Formatted dropdown colors using CSS root theme variables (`var(--bg-surface)`, `var(--bg-surface-elevated)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--accent-primary)`), seamlessly adapting to Light Mode, Dark Mode, and custom themes.
- **Version Bump**: Updated application version to `v5` across `package.json`, `src/version.js`, `src/router.js`, and `CHANGELOG.md`.

---

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
