# Changelog - TravelBuff

All notable changes to TravelBuff will be documented in this file.

## [v7.4.0] - 2026-09-03

### 🚀 Major Features & Enhancements
- **Global Duplicate Prevention for Folders & Locations**:
  - **Comprehensive Multi-Level Detection**: Live duplicate search that inspects the entire database across all folders (`is_folder: 1`) and locations (`is_folder: 0`), regardless of hierarchical parent path.
  - **Multi-Factor Matching**: Evaluates exact and normalized names, state/country pairings, and GPS coordinates within 150 meters.
  - **Inline Warning Banner**: Displays an informative banner in the Create Location / Folder modal with parent path breadcrumbs and a 1-click **"View Existing Folder/Location"** jump button.
  - **Duplicate Guard**: Adds confirmation safeguard preventing accidental duplicate creations.
- **Collection Multi-Select & Bulk Deletion**:
  - **Multi-Select Mode**: Added a "Select" / "Done Selecting" toggle in the Collections header.
  - **Interactive Checkboxes & Counter**: Select multiple collection cards with card-click selection and real-time counter.
  - **Floating Bulk Action Bar**: Pinned bottom action bar featuring "Select All", "Deselect All", selection count, and bulk "Delete (N)" action.
  - **Safe Deletion**: Confirms bulk deletion while explicitly preserving underlying locations and places of visit in the database.
- **Re-organized Hybrid 6-Tab Settings Page with Global Search**:
  - **6 Distinct Category Tabs**:
    1. ⚙️ **General & Preferences**: Base Currency, Default Travel Speed, Default Country, Home Airport, Default Navigation App, and Saved Home Addresses.
    2. 🔌 **Integrations & AI**: Immich Server Settings & Embedded People / Travel Companions Face Sync, AI Assistant Configuration (OpenAI, Gemini, Claude, Ollama, DeepSeek, Groq, OpenRouter), Google Maps Integration, and OwnTracks GPS Tracking.
    3. 🏷️ **Taxonomy & Tags**: Keyword Tags with color management and Custom Categories with emoji icons.
    4. 💾 **Data & Backups**: Full JSON Backup & Restore, Archived Items & Data Retention, and Saved Travel Guides & Markdowns.
    5. 👤 **Account**: My Profile & Security (Profile photo avatar upload & self-service password change) and Admin User Management (roles, admin password resets, user deletion).
    6. 🖥️ **System**: Privacy & Telemetry controls, External API Usage Logs (6-month history), Help & Guided Onboarding, and Database Maintenance.
  - **Global Live Search**: Top search bar with fuzzy matching across all tab sections and instant click-to-jump navigation with smooth scroll and glow highlight.
- **App Update Notification Banner & "What's New in v7.4.0" Modal**:
  - **Gradient Update Banner**: Persistent top notification banner alerting users when a new version is detected via `localStorage` version diffing.
  - **What's New Release Modal**: Rich modal dialog displaying structured highlights, feature descriptions, and navigation shortcuts.
  - **Global Version Visibility**: Synchronized `APP_VERSION` (`v7.4.0`) across all UI surfaces including the login screen, desktop user avatar dropdown, mobile profile drawer, and settings footer.
- **Avatar Dropdown Menu Cleanup**:
  - Removed "Archived Items" from desktop and mobile user avatar dropdowns to streamline account controls (available in Settings $\rightarrow$ Data & Backups).
  - Added direct "What's New" link and app version footer in avatar menus.

## [v7.3.0] - 2026-08-28

### 🚀 Major Features & Itinerary Enhancements
- **Timeline Endpoint Checkboxes & Daily Accommodation Management**:
  - **Day 1 Start from Home Checkbox**: Added `[x] Start from Home` toggle on Day 1. When checked, incorporates the starting home address as the origin node in the day's timeline and route navigation.
  - **Day 1 Drive to Stay First Checkbox**: Added `[x] Drive to stay first (Check-in / drop bags before sightseeing)` option on Day 1 when both a Start Home address and Stay are selected. Formats Day 1 into: Home $\rightarrow$ Stay $\rightarrow$ Place 1 $\dots \rightarrow$ Stay.
  - **Daily Stay Behavior Selectors**: Configurable per-day stay behavior options:
    - `🔄 Stay here at night` *(Default round-trip loop: departs stay in the morning, returns at night)*
    - `➡️ Checkout from Hotel` *(Morning departure only; day concludes at the last stop or moving onward to next destination)*
    - `🏁 Late check-in (sightseeing first)` *(Direct sightseeing during the day, checking in to stay in the evening)*
  - **Final Day Go Home Checkbox**: Added `[x] Last Day, Go Home` toggle on the final itinerary day to route from the last stop/stay back to the designated stop home address.
- **Itinerary Reset & Undo Management**:
  - Added a **`🗑️ Reset`** button directly in the **Itinerary Days** header in the Planning Workspace.
  - **Confirmation Dialog**: Asks the user to confirm before wiping scheduled stops, assigned day locations, stays/accommodations, and start/stop endpoints.
  - **One-Click `↺ Undo Reset`**: Captures a full snapshot of the itinerary before clearing. If reset by mistake, clicking `↺ Undo Reset` instantly restores all scheduled items, day locations, stays, and settings across IndexedDB/SQLite.
- **Light Mode UI & Active Trip Contrast**:
  - Enhanced the **⭐ Active Trip** button in the Trips catalog (`#/trips`) with dedicated high-contrast styles (`.active-trip-btn`).
  - In light mode, active trip badges now render with vibrant purple fill (`var(--accent-primary)`), crisp white text (`#ffffff`), glowing accent shadow, and pill border, preventing gray-on-gray washout against light card backgrounds.
- **Places Bank Folder & Location Management**:
  - **"Add Location" Action & Filter Dropdown**: Renamed the "Add Folder" button to **"Add Location"** in the Places Bank header. The dropdown now lists both Folders (`📁`) and Locations (`📍`) with search filtering and direct creation capability.
  - **Create Location / Folder Dialog**: Removed the forced/disabled folder checkbox. Users can now choose whether to create a regular Location (default) or check **"Create as Folder"** to group places inside.
  - **Removed Redundant Checkbox in Add Place**: Removed the disabled "Create as Folder" checkbox from the "Add Place of Visit" modal.
  - **Remove/Delete Unused Location or Folder**: The `🗑️` button remains active on any location or folder in the Places Bank as long as no places from it are scheduled on any day, and neither the location nor its hotels are assigned to any day.
  - Clicking removes the folder/location from the current trip's Places Bank filter and updates trip notes in IndexedDB/SQLite.
  - **Clean Two-Row Header**:
    - **Row 1**: `Day X` title on the left and the interactive `Day (Date) Selector` dropdown on the right.
    - **Row 2**: `📍 Location` badge and `🏨 Stay: <Hotel Name>` badge (with responsive CSS ellipsis truncation and full-name tooltip) displayed side-by-side.
- **Mobile Planning MapView & Responsive Lifecycle Fixes**:
  - **Collections Modal Sticky Header & Footer (`Collections.jsx`)**: Upgraded both *Edit Collection* and *Create Collection* dialogs with fixed maximum height (`maxHeight: 90vh`), sticky top header, independently scrollable rule/place body, and a pinned sticky action footer (Cancel / Save), ensuring buttons are always accessible on short screens and mobile devices.
  - **Day 1 Map Stay Pin Rendering**: Fixed MapView marker loop to ensure Day 1 evening accommodation stay pins render on the map, suppressing duplicate pins only when a morning stay origin was already placed at the exact same location on Day 2+.
  - **ResizeObserver & `isVisible` Propagation (`MapView.jsx`)**: Attached a dynamic `ResizeObserver` and `isVisible` signal to automatically trigger `map.invalidateSize()` (Leaflet) and `google.maps.event.trigger(map, 'resize')` (Google Maps) whenever the map container transitions from `0x0` hidden state (`display: none`) to visible on mobile devices.
  - **Auto FitBounds on Tab Toggle**: Re-evaluates viewport boundaries (`map.fitBounds`) with mobile-optimized padding when switching to the "Map" pane in Planning Workspace, ensuring all scheduled pins and routes display centered without grey tiles or offset views.
  - **Mobile Map Container Height Optimization (`TripPlanning.jsx`)**: Standardized mobile map viewport height (`calc(100vh - 190px)`, min-height `350px`) for edge-to-edge touch interactivity.
- **Offline-to-Online Bidirectional Sync Resilience & React Loop Fixes**:
  - **Itinerary Foreign Key Constraint Fix (`server.js`)**: Resolved `POST /api/sync` 500 errors caused by `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` when syncing itinerary items referencing virtual home address IDs (`home_<id>`). The server now sanitizes non-place IDs to `NULL` before database insertion while preserving custom stop metadata.
  - **React Maximum Update Depth Exceeded Loop Elimination (`TripPlanning.jsx`)**: Stabilized `getHaversine` and `fetchOSRMDistance` callback references with `useCallback` and prevented circular re-render cascades in distance calculation dependencies.
  - **SQLite Type-Coercion in Dependent Queries (`server.js`)**: Fixed SQLite query filters (`/api/itineraries/:tripId`, `/api/reservations/:tripId`, `/api/expenses/:tripId`, `/api/trips/:tripId/rates`, and `/api/trips/:tripId/notes`) using `CAST(trip_id AS TEXT) = ? OR trip_id = ?`, preventing SQLite from returning empty sets when queried with string URL parameters.
  - **Prioritized Itinerary Prefetch (`clientDb.js`)**: Reordered `populateLocalDb` to fetch and store `itinerary_items` immediately before long sequential PDF attachment downloads.
  - **Fixed `OnboardingChecklist.jsx` Reconnect Crash**: Corrected invalid table accessor (`db.markdowns` -> `db.saved_markdowns`), eliminating uncaught `TypeError: Cannot read properties of undefined (reading 'count')` that interrupted Dexie live query reactivity on server reconnect.
  - **Resilient Multi-Format `activeDayIndex` & Sightseeing Stop Placeholders (`TripMode.jsx`)**: Guaranteed that `activeDayIndex` always identifies Day 1 without falling back to `-1`, and ensured stops render placeholder items even if place catalog synchronization is momentarily pending.
- **Offline-First Resilience & IndexedDB Synchronization**:
  - **Type-Safe ID Matching**: Standardized entity ID matching across `trips`, `user_addresses`, `places`, `hotels`, and `locations` to string-safe comparisons (`String(a.id) === String(b.id)`), resolving integer-vs-string type discrepancies between SQLite and local Dexie/IndexedDB storage.
  - **Dexie Local Update Fallback**: Enhanced `queueSyncAction` in `clientDb.js` with type-coercion and `put` fallback when `db[table].update` affects 0 rows, guaranteeing immediate offline mutation persistence.
  - **Stay Selection Dropdown Retention**: Ensured currently selected hotel options are always preserved in `<select>` dropdowns regardless of location filter scope, preventing selections from resetting to `-- Unassigned --` offline.
- **Itinerary Chronology & UI Refinements**:
  - **Day 1 Route & Origin Fixes**: Suppressed redundant morning hotel departures on Day 1 (traveler starts from home or directly from the first stop, concluding at the hotel in the evening).
  - **Standardized Stay Labels**: Simplified accommodation labels to clean `🏨 Stay: <Hotel Name>` across Planning Day Cards, Chronological Daily Itinerary, and Trip Mode.
- **Multi-Modal Transport Modes & Curved Flight Arcs**:
  - Added per-segment transport mode configuration (🚗 Drive, ✈️ Flight, 🚆 Train, 🚶 Walk, ⛴️ Ferry).
  - **Arched Flight Paths**: Generates curved geodesic parabolic flight arcs on both Google Maps and Leaflet for air travel segments.
  - **Rail & Ferry Tracks**: Renders styled dashed paths for trains and ferries.
  - **Custom Transit Durations & Notes**: Allows custom duration overrides (in minutes) and optional travel notes (e.g. flight numbers, train booking references) accessible via an interactive segment settings modal.
- **Dexie & Offline Synchronization Persistence**:
  - All endpoint selections, stay behaviors, segment transport modes, custom durations, and notes persist into Dexie and sync to SQLite via `trip.notes`. No repeated recalculations upon reopening trips.

## [v7.2.2] - 2026-08-28

### 🛠️ Bug Fixes & Resiliency Improvements
- **AI Trip Planner JSON Parsing & Response Resilience**:
  - Fixed `SyntaxError: JSON.parse: unexpected character at line 1 column 1...` by reading AI endpoint responses as text before parsing and displaying friendly error diagnostics on HTTP/server failures.
  - Upgraded backend `callAiProvider` with heuristic JSON extraction (automatically extracting `[...]` or `{...}` blocks and stripping markdown fences or conversational preambles).
  - Enabled native **`responseMimeType: 'application/json'`** mode for Gemini API to enforce strict JSON structure at the model level.
  - Refined AI prompt construction in Planning Workspace by providing explicit few-shot JSON templates and removing ambiguous phrasing that prompted plain-text bullet lists.
  - Added live staged progress indicators (`📡 Connecting...`, `📍 Analyzing...`, `✨ Scheduling...`, `💾 Saving...`) to both the Places Bank AI modal and the New Trip AI wizard to provide real-time backend status transparency.
  - Surfaced clear, actionable guidance on AI high demand / 503 / 429 rate limit errors (suggesting a retry or choosing a different model in Settings -> AI Settings without hardcoded model references).
- **Workspace Infinite Render Loop Fix**:
  - Resolved `Warning: Maximum update depth exceeded` in `TripPlanning.jsx` by checking previous selection state before calling `setSelectedTrip(null)`.
- **Workspace Pin Coloring & Day-Move Transition Fix**:
  - Resolved inconsistent pin coloring in Planning Workspace (where Day 3 pins displayed green rather than purple) by adopting flexible day index matching across ISO date strings and day numbers.
  - Added explicit `color` attributes and date-scoped point IDs (`${place.id}_${item.id}_${item.date}`) to map points, ensuring moving a stop from one day to another instantly updates pin colors and route paths on both Google Maps and Leaflet.
- **Comprehensive Start, Stay, and Stop Daily Route Navigation**:
  - Connected daily navigation routing across **Start Address**, **Stay (Hotel/Accommodation)**, intermediate sightseeing stops, and **Stop Address (Home/Airport)**.
  - Automatically structures round-trip loops for intermediate days ($Stay \rightarrow Stops \rightarrow Stay$) and point-to-point journeys on Day 1 ($Start \rightarrow Stay \rightarrow Stops \rightarrow Stay$) and Final Day ($Stay \rightarrow Stops \rightarrow Stop\ Address$).
  - Fixed route disappearance when selecting Stays by integrating accommodation coordinates into daily route points and handling non-geocoded places smoothly.
- **Home Address Blank Fields & `toFixed` TypeError Fix**:
  - Fixed `TypeError: e.latitude.toFixed is not a function` when editing and saving saved home addresses without coordinates.
  - Full support for optional/blank values in `Address` and `Latitude / Longitude` fields (only `Label` is mandatory).
  - Added defensive numeric validation (`Number(addr.latitude).toFixed(4)`) to the Saved Home Addresses card in Settings.
  - Guarded `homePlaces` coordinate mapping in Planning Workspace and Trip Mode to prevent `NaN` coordinates when addresses do not have latitude/longitude set.

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
