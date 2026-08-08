# TravelBuff Documentation

Welcome to the official documentation for **TravelBuff** — a premium, offline-first personal travel organizer and itinerary planner designed to work seamlessly across all your devices.

---

## 1. Overview & Features

### The TravelBuff Philosophy
TravelBuff is designed for travelers who value reliability, speed, and privacy. Traditional travel planners fail when you lose connection in remote locations, subways, or during international flights. TravelBuff solves this by adopting an **Offline-First** architecture:
* All data is stored locally in your browser's IndexedDB database via Dexie.js.
* Changes are made instantaneously on the client without waiting for server responses.
* When a network connection is available, client changes are queued and synchronized to the server.
* WebSocket connections ensure that updates on one screen are propagated in real-time to your other connected devices.

### Core Features
* **Hierarchical Folders & Folder Tags**: Organize locations and regions in nested directories with custom folder tags.
* **Visited Badges**: Track folders and individual locations with color-coded "Visited", "Partial", and "Not Visited" indicators.
* **Dynamic Maps & Sequence Ordering**: Dual mapping supports OpenStreetMap (Leaflet) and Google Maps (AdvancedMarkerElement) with sequence order pin numbers (`#1`, `#2`, `#3`...).
* **AI Curation Queue & Guide Importer**: Import plans automatically from URLs/documents with searchable parent location filters and Gemini AI parsing.
* **Immich API Integration**: Sync personal photos and select travel companions directly from your Immich server face database.
* **OwnTracks GPS Integration**: Import GPS travel logs to calculate actual travel distances.
* **Multi-Currency Expense Manager**: Track budgets and log expenses across different currencies with optional manual exchange rate overrides.
* **Mobile-Responsive Design**: Full mobile support with safe-area navigation bars (`env(safe-area-inset-bottom)`) and responsive header wrapping.

---

## 2. Installation Options

### Manual npm Setup
To run the project locally from source:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/TravelBuff.git
   cd TravelBuff
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   PORT=5000
   JWT_SECRET=your-secure-jwt-secret-key
   UPLOADS_DIR=./data/uploads
   ```

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5000` in your browser.

---

## 3. Setting Up Locations & Folders

### Managing Hierarchical Folders & Folder Tags
Organize your travel destinations inside folders representing countries, states, or cities:
* **Create a Folder**: Click **+ Add Folder** at the top of the Locations screen, name the folder, and click save.
* **Nesting Folders**: Click into any existing folder and select **+ Add Folder** to create a nested child folder. Use the breadcrumb navigation at the top to navigate back.
* **Marking Visited/Not Visited**: Use the toggles to mark folders as visited. Folders display a colored tag (transparent background with color-coded borders and text) indicating their status.
* **Folder Tags**: When inside a folder, use the **Folder Tags** section directly below the header row to assign custom tags. Tags display inline badges with remove (`X`) buttons and a searchable `+ Add Tag...` input dropdown.
* **Recursive Tag Filtering**: Filtering locations by a tag matches folders tagged directly as well as folders containing tagged sub-locations.

### Adding Sights & Sights Categorization
Add individual spots (cafes, hotels, temples, museums) inside folders:
* **Search and Create**: Use the search input to find points of interest. You can search using OpenStreetMap's Nominatim or Google Maps Places Autocomplete depending on your settings.
* **Categories**: Assign categories like `hotel`, `stay`, `resort`, `restaurant`, `cafe`, `temple`, `museum`, `waterfall`, `mountain`, `trek`, `airport`, or `station`.
* **Default Categories**: `hotel`, `stay`, and `resort` are enabled by default to simplify reservation mappings.

---

## 4. Creating Itinerary Plans & Travelers

### Scheduling Stops & Map Sequence Ordering
Plan your daily routes by creating structured itineraries:
* Open the **Trips** tab and select your trip.
* In the itinerary tab, click **+ Add Stop** to search for a location and allocate it to a specific day in your plan.
* Drag and drop itinerary items to change their chronological sequence order.
* **Numbered Map Pins**: The interactive map (both Google Maps and OpenStreetMap) renders sequence numbers (`#1`, `#2`, `#3`...) directly inside pin markers for intuitive route navigation.

### Managing Travelers & Immich API Integration
Manage trip companions and sync members:
* **Manage Travelers Modal**: Click **👥 Manage Travelers** in the trip header to view companions.
* **Direct Immich API Import**: Switch to the **📸 Immich API** tab to fetch members directly from your Immich server (`/api/immich/people`). Search through members with live text filtering and view their round face thumbnail photos.
* **Instant Auto-Save**: Checking an Immich member automatically creates the local person record and tags them onto the trip seamlessly.
* **Trip Header Avatars**: Selected travelers display circular thumbnail photo avatars directly in the trip header overview.

### Linking Reservations
Keep all booking records in one place:
* **Add Reservation**: Log flights, bus rides, train tickets, rental cars, and hotel stays.
* **Upload Attachments**: Attach booking PDFs or image receipts directly to reservation items.
* **Active Trip Mode**: Mark a trip as **Active** to hide clutter and focus only on the current day's itinerary, reservation sheets, and quick expense forms.

---

## 5. Expense Tracking & Home Addresses

### Saved Home Addresses
Configure home origins for trip calculations:
* Go to **Settings** -> **Saved Home Addresses** (Column 1 / Left Side Pane).
* Save primary home locations (address, city, state, country) used to calculate starting origins and routes for trips.

### Multi-Currency Budgets
Set budget limits and log costs:
* **Base Currency**: Set your primary currency (e.g. `USD`, `EUR`, `INR`) in Settings.
* **Expense Logging**: Add expenses for food, transport, stays, or tickets in the currency you paid in.
* **Planned vs Actual**: Flag expenses as "Planned" during design, and convert them to "Actual" once paid.

### Custom Exchange Rate Overrides
If you exchange cash at a specific local kiosk rate:
* Go to the Trip Budget page.
* Under **Currency Exchange Rates**, add custom conversion overrides (e.g., `USD` to `EUR` = `0.92`).
* TravelBuff will automatically calculate conversions using your custom overrides, defaulting to real-time API rates if no override is set.

---

## 6. Tips & Tricks

### Google Maps API Keys Setup
Redirection to Google Maps requires an API key:
1. Go to the **Google Cloud Console**.
2. Create a project and enable the following APIs:
   - **Maps JavaScript API** (renders the map canvases)
   - **Directions API** (calculates routes between stops)
   - **Distance Matrix API** (calculates times and distances)
   - **Geocoding API** (resolves coordinates for addresses)
   - **Places API** (powers autocomplete place suggestions)
3. Generate an API Key, restrict it to your domain for security, and paste it into the Google Maps Settings card.

> [!WARNING]
> Google Cloud charges per API request. Keep constraints on key usage and monitor the API Call Tracker table at the bottom of the Settings page to check logs.

### Backup & Restore
* **Export**: Go to Settings and click **Backup Data** to download all locations, collections, trips, expenses, and configurations as a single JSON file.
* **Restore**: Import a previously exported JSON backup to fully restore your workspace state.

---

## 7. Importing Travel Guides via URL & AI Curation

TravelBuff allows you to bootstrap your travel planning by scraping and importing structured data from external travel articles, blogs, and list websites or uploading travel documents (`.md`, `.pdf`, `.docx`, `.html`, `.txt`).

### Step 1: Fetching or Uploading Content
1. Click the **Import Content** button at the top header of the application.
2. Choose between **🌐 Import Trip** (URL scraping) or **📄 Import Document** (file upload).
3. **URL Scraper Engine Options**:
   - **Jina Reader**: Converts full web pages to structured Markdown.
   - **Cheerio Parser**: Fast HTML parser for lightweight pages.
   - **Playwright**: Headless JavaScript browser engine for dynamic, client-rendered web pages.
   - **Firecrawl**: Advanced cloud scraper API.
4. **Document Parser Engine Options**:
   - **⚡ Fast Local Parser**: Uses local `pdf2md`, `mammoth`, or `turndown` engines.
   - **🤖 AI Document Vision Parser**: Passes document pages directly to AI for visual layout extraction.

---

### Step 2: Staging & Curation (Review Data Tab)

Once the content is converted, you are presented with the **Review Data** (Curation Queue) workspace.

#### 1. Context & Regional Filter Bar
At the top of the Curation Queue:
- **City**, **State**, **Country**: Enter target destination details to scope geocoding and AI place resolution.
- **Home Address**: Select a saved home location or type a custom starting address. AI will use this origin point when generating day-wise itinerary sequences.

#### 2. Bulk Location Assignment Controls
- **Bulk Location Dropdown**: Filter and select a parent location from your database. The dropdown supports instant text filtering (`Type to filter...`).
- **Apply Button**: Click **Apply** to assign the selected parent location to all pending places in the queue at once.

#### 3. Action Toolbar Buttons (Top Right)
- ➕ **Create New Location**: Opens an inline modal to search regions via Google Maps or OpenStreetMap and create a new parent location immediately without leaving the import workflow.
- 📍 **Query OpenStreetMap (Batch OSM)**: Geocodes all unresolved rows across OpenStreetMap (Nominatim).
- ✨ **Analyze Unresolved Rows with AI**: Sends all pending/unresolved rows to the AI engine (Gemini / OpenAI / Claude / Ollama) to extract exact addresses, categories, descriptions, and day numbers based on proximity to your Home Address.
- 📝 **Custom AI Prompt Console**: Toggle the prompt console to review or customize the system instructions passed to the AI engine.
- 💾 **Save All Resolved Locations & Places**: Batch saves all resolved items into your active IndexedDB database and server sync queue.

#### 4. Review Queue Table & Controls
- **Image Thumbnail**: Automatically fetches and displays cover photos from Wikipedia or Google Maps.
- **Place Name**: Editable text input to refine landmark titles.
- **Day Number**: Assign integer day numbers (Day 1, Day 2, etc.) for itinerary scheduling.
- **Type Selector**: Toggle between **Place of Visit** (sights, restaurants, hotels) and **Location** (parent region).
- **Parent Location Selector**: Mandatory location linkage for places. Features text-searchable filtering.
- **Category Selector**: Assign or select categories (`Attraction`, `Dining`, `Lodging`, `Transit`, `Shopping`, or custom user categories).
  - *Automatic Category Normalization*: AI-extracted terms (e.g. "food", "restaurants", "sightseeing", "hotel") are automatically normalized into standard system categories upon extraction.
- **Description**: Editable text box summarizing place details.
- **Resolved Status**: Shows `✓` (Resolved) or `X` (Unresolved). Clicking the status badge manually toggles resolution state.
- **Row Action Buttons**:
  - `✓` **Accept & Save**: Save single row to database.
  - `📍` **Search OSM**: Geocode single row via OpenStreetMap.
  - `✨` **Analyze Row with AI**: Run AI extraction on single row.
  - `🗑️` **Delete**: Remove row from queue.

#### 5. Saved Places & Day-Wise Itinerary Generation (`Places from this Guide` Tab)
- Switch to the **Places from this Guide** tab to view saved places grouped neatly by **Day 1**, **Day 2**, etc.
- Click **➕ Add Itinerary** at the top right to automatically create a new **Trip**, assign all saved places into daily itinerary stops, and launch your trip planner ready for travel!

---

## 8. Mobile & Responsive Layout

TravelBuff is optimized for mobile browsers and Progressive Web App (PWA) usage:
* **Universal Header**: Dynamically resizes logo, controls, and action buttons to fit viewports down to 320px without horizontal page scrolling.
* **Mobile Bottom Navigation**: In mobile view (`< 768px`), a fixed bottom navigation bar (`.mobile-bottom-nav`) provides instant tab switching between *Locations*, *Collections*, *Trips*, and *Profile/Settings*.
* **Safe Area Insets**: Native support for browser safe-area insets (`env(safe-area-inset-bottom)`) ensures navigation controls and bottom page contents never clash with device gesture bars.

---

## 9. Release Notes & Version History

### Version 1.2.7 (Current Release)
* **Bulk Location Controls Layout**: Relocated Bulk Location controls to a dedicated row with a 320px dropdown selector and standalone Apply button.
* **AI Bulk Category Extraction & Normalization**: Fixed category updates during AI bulk processing, added automatic category normalization (`Dining`, `Attraction`, `Lodging`, `Transit`, `Shopping`), and improved case-insensitive dropdown option matching.
* **Comprehensive Curation Documentation**: Fully documented all options, buttons, and AI curation workflows in `documentation.md`.

---

### Version 1.2.6
* **2-Tier Photo Resolution Pipeline**: Implemented a 2-tier fallback strategy for cover photos—searching Wikipedia / Wikimedia Commons first, and falling back to Google Maps Places API if no Wikipedia image exists.
* **Contextual Query Resolution**: Enhanced sub-place photo searches to automatically combine place name and parent location name for higher match accuracy.
* **UI Button Standardization**: Renamed all "Fetch Cover" buttons to "Fetch Cover Image" across Location and Place views with updated tooltips.
* **Graceful Error Handling**: Replaced HTTP 404 error responses on photo searches with clean HTTP 200 payloads to eliminate browser console XHR errors.

---

### Version 1.2.0
* **Browser Back (`←`) / Forward (`→`) Navigation & Hash Routing**:
  - Implemented lightweight hash-based URL routing (`src/router.js`) synchronized with browser history states (`pushState`, `popstate`, `hashchange`).
  - Pressing the browser Back button now seamlessly steps back through nested location folders (`/#/locations/:folderId`), collections, trip planners, and settings pages instead of exiting the app.
* **Direct Deep-Linking**:
  - Navigating directly to bookmarked URLs (e.g. `/#/locations/folder_japan_2026` or `/#/settings`) opens the target workspace and folder instantly on initial page boot.

---

### Version 1.1.0
* **First-User Admin Role & Auto-Assignment**:
  - The very first user registering on a server automatically receives `is_admin = 1` privileges.
* **Admin User Management in Settings**:
  - Admin users can view all registered accounts in Settings, reset passwords for any user, or permanently delete user accounts.
* **Complete Cascade Data Cleanup & Deletion Warning**:
  - Prompts an explicit warning modal before deleting a user account.
  - Deletes user data across all 20 database tables (`locations`, `places`, `collections`, `trips`, `expenses`, `reservations`, `itinerary_items`, `trip_notes`, `saved_markdowns`, `ai_imports`, `people`, `user_addresses`, `tags`, `custom_categories`, `user_configs`, `users`) as well as uploaded media files from disk storage.
* **Resilient Two-Phase Backup Restore Engine**:
  - Split restore operations into Phase 1 (Database Metadata, < 10MB) and Phase 2 (Chunked Media Uploads, 10MB batches), resolving `413 Payload Too Large` and HTTP timeout errors.
  - Skips existing media files in 1ms for fast resumable restores.
* **User-Scoped Backup Exports & Name Collision Handling**:
  - Backup exports are now strictly scoped to `req.user.id`.
  - Duplicate `(Copy)` labels during restore are appended only if an entity with the exact same name already exists for the active user.
* **UI Version Footers**:
  - Added small-print version badges (`TravelBuff v1.1.0`) across the Login page, Header Dropdown menu, and Settings page.

---

### Version 1.0.0
* Initial release of TravelBuff:
  - Offline-first IndexedDB storage with real-time WebSocket server sync.
  - Nested location folders, folder tags, and color-coded visited badges.
  - OpenStreetMap & Google Maps integration with numbered sequence map pins.
  - Daily trip itineraries, active trip mode, reservations, and multi-currency expense tracking.
  - AI travel guide importer for web URLs, PDFs, and Word documents.
  - Immich face photo sync, OwnTracks GPS log imports, and saved home address management.
