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

TravelBuff allows you to bootstrap your travel planning by scraping and importing structured data from external travel articles, blogs, and list websites.

### Step 1: Fetching the Guide (Import URL)
1. Click the **Import URL** button at the top header of the application.
2. In the modal, paste the full HTTP/HTTPS link of the travel guide or article.
3. Select one of the **4 Markdown Import Options** (tailored parsers/scrapers) to fetch and convert the web page content into a clean markdown document.
4. Click **Fetch** to retrieve the page content. The parsed content is forwarded directly to the staging queue.

### Step 2: Staging & Curation (Review Data Tab)
Once the article is converted, the system redirects you to the **Review Data** (Curation Queue) interface:
1. Review the parsed lists of sights, restaurants, and spots.
2. Curate the list by selecting which parent folder/location, custom tags, and categories (e.g. `temple`, `restaurant`, `stay`) should be associated with each sight.
3. **Searchable Parent Location Filter**: When *Place of Visit* is selected in the Type column, use the searchable `<FilterableSelect>` dropdown (`Type to filter...`) to quickly locate and assign parent locations from large location lists.
4. You can edit sight titles and delete irrelevant entries before importing.

### Step 3: Autocomplete Addresses & Detail Autofills
Before committing the sights to your active locations database, you can automatically fill in their coordinates, address details, and notes:

> [!IMPORTANT]
> **Use City, State, and Country Context Fields!**
> There are three text boxes at the top of the Review Data page: **City**, **State**, and **Country**.
> **Always fill in these boxes before executing automated details parsing.** Adding this regional filter focuses the search engine and guarantees highly accurate address and location mapping the first time.

With the regional text boxes filled:
* **Option A: "Get All Maps"**
  - Sends the sight names and regional constraints to the geocoding engine.
  - If Google Maps is enabled in Settings, the app queries the **Google Maps Places API** to retrieve exact addresses and geocodes.
  - If Google Maps is disabled, the app queries **OpenStreetMap (Nominatim)** for free location geocodes.
* **Option B: "Send All to AI"**
  - Passes the sight names, context fields, and description text to Gemini/selected LLM to draft descriptions, identify categories, and suggest coordinates.

Once geocodes are populated, review the locations on the side-by-side preview map and click **Save/Approve** to add them to your locations list.

---

## 8. Mobile & Responsive Layout

TravelBuff is optimized for mobile browsers and Progressive Web App (PWA) usage:
* **Universal Header**: Dynamically resizes logo, controls, and action buttons to fit viewports down to 320px without horizontal page scrolling.
* **Mobile Bottom Navigation**: In mobile view (`< 768px`), a fixed bottom navigation bar (`.mobile-bottom-nav`) provides instant tab switching between *Locations*, *Collections*, *Trips*, and *Profile/Settings*.
* **Safe Area Insets**: Native support for browser safe-area insets (`env(safe-area-inset-bottom)`) ensures navigation controls and bottom page contents never clash with device gesture bars.

---

## 9. Release Notes & Version History

### Version 1.2.0 (Current Release)
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
