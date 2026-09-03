# TravelBuff: Complete User & Administrator Guide (Docs.md)

Welcome to the comprehensive documentation for **TravelBuff** — your ultimate personal travel manager. TravelBuff is built with an offline-first architecture, allowing you to organize locations, plan trips, manage budgets, and import travel guides seamlessly.

---

## 1. Getting Started

### Terminology
* **Maps (Google Maps)**: High-performance map canvas integrations. Enabling Google Maps unlocks Places Autocomplete, Geocoding APIs, and distance matrices.
* **OSM (OpenStreetMap)**: The default, open-source mapping engine powered by Leaflet and Nominatim. Used as the automatic fallback if no Google Maps API key is configured.
* **JWT Secret (`JWT_SECRET`)**: A cryptographically secure random string used by the server to sign and verify user authentication tokens.
* **Offline-First**: All data is saved instantly to your browser's IndexedDB (via Dexie.js). You can continue adding locations, photos, and expenses without internet access.
* **WebSocket Sync**: A persistent network channel that pushes local updates to the backend and synchronizes changes in real-time across multiple devices.
* **Curation Queue (Review Data)**: A temporary staging area where scraped travel destinations are formatted and reviewed before being saved to your permanent location list.

### App Navigation
The TravelBuff interface is divided into four main sections accessible from the sidebar (desktop) or navigation bar (mobile):
1. **Locations**: The core workspace where you create directories, add locations, view the map, assign tags, and log personal visits.
2. **Collections**: A folder-independent classification workspace to group related spots (e.g., "Must Try Coffee", "Day Hikes") manually or dynamically.
3. **Trips**: The travel planning dashboard where you schedule itineraries, record booking reservations, set active trip modes, and track multi-currency expenses.
4. **Settings**: A system management portal to configure API keys (GCP, Immich, OwnTracks), adjust currencies, track API usages, and run backups.

### Desktop App
TravelBuff runs as a progressive web application directly inside any modern web browser (Safari, Google Chrome, Mozilla Firefox, Microsoft Edge, Brave, etc.). Open the server address (e.g., `http://localhost:5000` or your custom domain) to access the planner. Ensure cookies and local storage are enabled to allow session and offline databases to function.

### Mobile App (Progressive Web App - PWA)
You can install TravelBuff on your mobile home screen as a standalone app to enjoy a fullscreen, native-like experience.

#### App for iPhone (iOS Safari)
1. Open Safari and navigate to your TravelBuff web address.
2. Tap the **Share** button (box with an upward arrow) in the browser toolbar.
3. Scroll down the sharing menu and select **Add to Home Screen**.
4. Name the application and tap **Add** in the top-right corner.

#### App for Android (Google Chrome)
1. Open Chrome and navigate to your TravelBuff web address.
2. Tap the **Menu** icon (three vertical dots) in the top-right corner.
3. Tap **Install App** or **Add to Home Screen**.
4. Follow the prompt instructions to complete installation.

---

## 2. Setup & Installation

### Environment Configuration
Before launching TravelBuff, customize the environment variables. Below is a sample configuration file representation:

#### Sample `.env` File
Create a `.env` file in the root folder of your project:
```env
# Server Port Configuration
PORT=5000

# JSON Web Token Secret (Replace with a long, random secure string)
JWT_SECRET=a_very_long_random_alphanumeric_jwt_secret_key_129847198

# Directory where uploaded files (reservation attachments, receipts) are stored
UPLOADS_DIR=./data/uploads

# Disable Anonymous Telemetry (Optional)
# Set to 'true' to block all background telemetry and registry tasks
DISABLE_TELEMETRY=true

# Path to the SQLite local database file
SQLITE_DB_PATH=./data/database.sqlite
```

---

### Detailed Installation Methods

> [!IMPORTANT]
> **Choosing a Safe Installation Directory**
> Before copying configuration files or extracting packages, create a dedicated, persistent directory on your host machine to store your `.env`, `docker-compose.yml`, and uploads safely:
> * **Windows**: Create a folder at `C:\TravelBuff`
> * **macOS**: Create a folder in your home directory at `~/TravelBuff` (e.g. `/Users/yourusername/TravelBuff`)
> * **Linux**: Create a folder at `~/TravelBuff` or `/opt/travelbuff`
>
> Avoid storing application files in temporary caches (`/tmp`), system directories, or directly on user desktops to prevent accidental file deletion.

---

#### Docker (Recommended)
Launch the application using Docker Compose for simple self-hosting:

1. Create your dedicated directory (e.g., `~/TravelBuff` or `C:\TravelBuff`) and navigate into it.
2. Create a `docker-compose.yml` file in that folder:
   ```yaml
   version: '3.8'
   services:
     travelbuff:
       image: travelbuff:latest
       container_name: travelbuff_app
       restart: unless-stopped
       ports:
         - "5000:5000"
       environment:
         - PORT=5000
         - JWT_SECRET=your_super_secret_jwt_key_please_change_me
         - UPLOADS_DIR=/app/data/uploads
         - SQLITE_DB_PATH=/app/data/database.sqlite
       volumes:
         - travelbuff_data:/app/data
   volumes:
     travelbuff_data:
   ```
3. Launch the container stack in the background:
   ```bash
   docker compose up -d
   ```

#### Windows
If you are new to Node.js and don't use Git, follow these steps to download, extract, and start the server:

1. **Install Node.js**:
   * Open **PowerShell** or **Command Prompt** as Administrator and run:
     ```cmd
     winget install OpenJS.NodeJS
     ```
   * Alternatively, download and run the MSI installer from the official site: [https://nodejs.org/](https://nodejs.org/) (Choose the LTS version).
2. **Download & Extract ZIP**:
   * Go to the GitHub repository page in your browser.
   * Click the green **Code** button and select **Download ZIP**.
   * Create a dedicated folder at `C:\TravelBuff`.
   * Extract the downloaded ZIP contents directly into your `C:\TravelBuff` folder.
3. **Setup Environment**:
   * Create a text file named `.env` in `C:\TravelBuff` (refer to the sample configuration section above to fill it in).
4. **Build & Run**:
   * Open Command Prompt, navigate to your folder, and run:
     ```cmd
     cd C:\TravelBuff
     npm install
     npm run build
     node server.js
     ```

#### Mac
Deploy locally on macOS:

1. **Install Homebrew** (if not already installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. **Install Node.js**:
   ```bash
   brew install node
   ```
3. **Download & Extract**:
   * Download the repository ZIP file from your browser.
   * Create a folder at `~/TravelBuff` and extract the ZIP contents into it.
4. **Setup Environment & Run**:
   ```bash
   cd ~/TravelBuff
   # Create .env file with your configurations
   npm install
   npm run build
   node server.js
   ```

#### Kubernetes (k8s)
Deploy to a cluster using a basic deployment manifest:

1. Create a `deployment.yaml` file:
   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: travelbuff-deployment
     labels:
       app: travelbuff
   spec:
     replicas: 1
     selector:
       matchLabels:
         app: travelbuff
     template:
       metadata:
         labels:
           app: travelbuff
       spec:
         containers:
         - name: travelbuff
           image: travelbuff:latest
           ports:
           - containerPort: 5000
           env:
           - name: PORT
             value: "5000"
           - name: JWT_SECRET
             value: "change_this_to_a_secure_token"
           - name: UPLOADS_DIR
             value: "/data/uploads"
           - name: SQLITE_DB_PATH
             value: "/data/database.sqlite"
           volumeMounts:
           - name: travelbuff-storage
             mountPath: /data
         volumes:
         - name: travelbuff-storage
           persistentVolumeClaim:
             claimName: travelbuff-pvc
   ---
   apiVersion: v1
   kind: Service
   metadata:
     name: travelbuff-service
   spec:
     type: ClusterIP
     ports:
     - port: 80
       targetPort: 5000
     selector:
       app: travelbuff
   ```

#### Debian / Ubuntu / Fedora Linux
Install directly on Linux virtual machines or physical servers:

**Ubuntu / Debian**:
1. Run commands to update packages and install Node.js:
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm
   ```
2. Create a folder at `/opt/travelbuff` or `~/TravelBuff`.
3. Download or wget the ZIP source, extract it, and launch:
   ```bash
   cd ~/TravelBuff
   npm install
   npm run build
   node server.js
   ```

**Fedora**:
1. Run commands to install Node.js:
   ```bash
   sudo dnf install -y nodejs npm
   ```
2. Create your folder, extract the ZIP source, and launch:
   ```bash
   cd ~/TravelBuff
   npm install
   npm run build
   node server.js
   ```

---

## 3. Locations and Regions

The **Locations and Regions** section is the core database of your TravelBuff application. It acts as a personal directory of the spots, sights, cities, and countries you wish to explore or have already visited. Here, you can build a structured, hierarchical database of destinations, plot sights on maps, track tags and custom categories, search for locations globally, and log your personal travel visits alongside your Immich photo library galleries.

### How to Add a Location
1. Open the **Locations** workspace.
2. Click **+ Add Location** (or tap the button in the header toolbar).
3. Search for a city, attraction, or restaurant using the geolocation search bar.
4. **Global Duplicate Prevention**: TravelBuff automatically inspects the entire database across all folders and locations for potential duplicates (matching by name, country/state, and GPS proximity within 150m). If a duplicate is found, an inline warning banner displays the existing item's parent hierarchy breadcrumbs and a direct **"View Existing Folder/Location"** jump button.
5. Confirm details (Name, City, State, Country, Coordinates) and click **Save Location**.

### What are Folders?
Folders represent geographical containers (such as "Europe", "Italy", or "Rome") used to structure child locations logically. Folders display customizable visited states and organize nesting hierarchies. Duplicate prevention applies seamlessly across both standard locations and folder containers.

#### How to Identify a Folder
In the Locations grid workspace, folders can be distinguished from standard location cards by these visual characteristics:
* **Dashed Border**: Folder cards feature a distinct dashed outline (`1px dashed var(--accent-secondary)`) instead of the solid border found on location cards.
* **Folder Icon**: A folder symbol is displayed directly adjacent to the folder's name.
* **Collage Preview**: Folder media previews display a dynamic grid collage showing cover images of the locations stored inside them rather than a single featured image.

### Convert a Location into a Folder
If you have created a standard location and want to convert it into a folder container to hold nested sights:
1. Locate and click on the location card in your grid to open its detail drawer/modal.
2. Inside the drawer, click the **"Convert to Folder"** button located on the right-hand action panel.
3. The location is instantly converted into a destination folder container, allowing you to enter it and add child spots.

### Tags
Create and assign custom tags (e.g., `#nature`, `#cheap-eats`, `#unesco`) to locations in the edit panel. Tags provide global grouping filters.

### Places to Visit
Inside any folder/destination container, add individual pins or points of interest. Categorize them to keep track of monuments, restaurants, viewpoints, and hotels.

### Map View
Toggle the map view at the top of the locations tab. The map plots interactive pins for all locations inside the active folder. Clicking a pin opens a quick summary card.

### Visits
Track when and where you traveled. TravelBuff allows you to document visits to locations:
* **Quick Visited Toggle**: Inside a location or folder detail drawer, you can quickly toggle its status as "Visited" or "Not Visited" using the toggle switch located in the top-right corner of the page.
* **Manual Logs**: Inside a location detail drawer, click the **"+"** button under the "Visits" tab. Enter the start date, end date, and write custom travel log notes.
* **Immich Integration**: If an Immich server is connected, search albums directly inside the visit modal to associate photos and link your digital galleries.

### Filters
Use the **🔍 Filters** toggle button at the top header to expand the filtering card. Filter by Country, State, Tags, Categories, and Visited/Unvisited states to locate specific items.

### Delete a Location or Folder
Click the trash icon inside the item's detail pane:
* **Folders**: Deleting folders prompts a dialog asking if you want to permanently delete all child items or preserve them by moving them back to the parent folder directory.

---

## 4. Collections

### What are Collections?
Collections allow you to group locations and sights across different folders under custom categories without changing their filesystem directory.

### System Collections
TravelBuff has built-in **System Collections** (e.g., "All Visited", "Unvisited Places"). These are automatic system filters and **cannot be deleted**.

### How to Use Collections
Create collections to plan specific thematic interests, compile travel goals, or keep track of global favorites across different folders. Some examples:
* **Weekend Trips from Home**: Plan short, close-range weekend getaways, road trips, and hiking spots.
* **Long Trips from Home**: Group together far-away international locations, multi-week itinerary spots, and flight-hub destinations.
* **Excellent Restaurants in London**: Group top-tier dining recommendations, cafes, pubs, and fine-dining spots specifically located in the London region.
* **Must Visit Places in Tokyo**: Gather all historical temples, shrines, viewpoint towers, and shopping streets in Tokyo.
* **UNESCO World Heritage Sites**: Track global historical sites, ancient ruins, and natural parks across multiple continents.
* **Cozy Workspace Cafes**: Keep a list of coffee shops featuring reliable Wi-Fi, power outlets, and a quiet working environment.

### Dynamic Auto Grouping
Instead of adding locations manually, you can create dynamic collections:
1. Click **+ Add Collection**.
2. Select **Auto Grouping**.
3. Configure the criteria based on **Tags**, **Categories**, or **Both** (e.g., auto-group everything tagged `#luxury` that is categorized as `stay`).
4. Save the configuration. TravelBuff will automatically populate the collection as new matching locations are added.

### Identify Manual vs Auto Group Collections
* **Manual Collections**: Indicated by a generic tag label and allow manual drag-and-drop of items into the collection list.
* **Auto Group Collections**: Display a dynamic badge label (e.g. `Auto: TagName + Category`) indicating their criteria, and prevent manual insertion since lists update dynamically.

### Filter Collections
Inside a collection view, use search queries and tag toggles to filter listed spots.

### Multi-Select Mode & Bulk Deletion
Manage collections efficiently with batch operations:
1. In the Collections page header, click the **"Select"** toggle button.
2. Selection checkboxes appear on all custom collection cards (System collections remain protected and cannot be deleted).
3. Click collection cards to select or deselect items, or use **"Select All"** in the floating bottom action bar.
4. Click **"Delete (N)"** to remove selected collections. A confirmation prompt confirms the deletion while safely preserving all underlying locations and places of visit in the database.
5. Click **"Done Selecting"** to exit multi-select mode.

---

## 5. Trips

### What are Trips?
Trips act as chronological itineraries. They link scheduled activities, booking receipts, and expense logs to specific travel dates.

### Plan New Trip
Click **+ New Trip**, specify the destination, start date, duration (number of days), currency, and outline budget.

### Mark Trip Active
Click the **"Set as Active"** star button on a trip card. The designated active trip will synchronize across all devices.

### Track Expenses
Add items to the expense ledger (stays, transit, restaurants).
* **Multi-currency**: Enter expenses in local currencies (e.g. `JPY` in Japan). TravelBuff calculates totals using default market exchange rates or your custom overrides.
* **Planned vs Actual**: Draft items as "Planned" during design, and convert them to "Actual" expenses when paid.

### International vs Domestic Trip
Trips can be flagged as "International". This enables multi-currency conversions and highlights local customs and tax tracking.

### Trip Mode vs Planning Mode
Toggle modes in the header:
* **Planning Mode**: Open workspace to edit descriptions, drag-and-drop days, query AI itineraries, and edit reservations.
* **Trip Mode**: Clean, streamlined mobile-first layout that hides editing panels. Focuses solely on the active day's timeline, pending reservations, and quick-add expense forms.

### Create Trip Itinerary (Manual vs AI)
* **Manual**: Click **+ Add Stop** on any itinerary day list to search for sights in your locations.
* **AI Generation**: If an AI key is set up, enter target descriptions (e.g., "Foodie tour in Tokyo") and click **Generate with AI** to let the model build structured daily activities.

---

## 6. Settings & Configurations

TravelBuff provides a unified, **6-tab Hybrid Settings** interface with a persistent **Global Live Search** bar for fast navigation:

* **Global Live Search Bar**: Located at the top of the Settings page. Type any keyword (e.g., "Immich", "API key", "Backup", "Currency", "Password") to see instant matching sections across all tabs. Clicking a result instantly switches to the corresponding tab and smoothly scrolls to the section with a prominent highlight glow.
* **1. ⚙️ General & Preferences**:
  - **Base Currency**: Select your default home currency from 160+ ISO currencies.
  - **Default Travel Speed**: Configure average transit speeds for driving, walking, and transit calculations.
  - **Default Country & Home Airport**: Default geographical context for autocomplete queries and flight planning.
  - **Default Navigation Map App**: (iOS/macOS) Choose between Google Maps and Apple Maps.
  - **Saved Home Addresses**: Manage origin and destination home address coordinates for automated route planning.
* **2. 🔌 Integrations & AI**:
  - **Immich Server Settings**: Configure backend server URL, external public URL, API key, test connectivity, and import locations.
  - **People & Companions (Immich Face Sync)**: Directly embedded inside the Immich card to manage travel companion profiles, assign relationship roles, and sync recognized face thumbnails from Immich.
  - **AI Assistant Configuration**: Connect OpenAI, Claude, Gemini, Ollama, DeepSeek, Groq, Mistral, or OpenRouter with custom model selectors and Firecrawl API scraping.
  - **Google Maps Integration**: Set Google Maps API key and configure geocoding/places providers.
  - **OwnTracks GPS Integration**: Real-time webhook URLs and Recorder server connections for GPS trail logging.
* **3. 🏷️ Taxonomy & Tags**:
  - **Keyword Tags**: Create, edit, recolor, or remove custom taxonomy tags.
  - **Custom Categories**: Manage place categories and emoji icons.
* **4. 💾 Data & Backups**:
  - **Backup & Restore Data**: Export full database JSON backups or restore in background chunks.
  - **Archived Items & Data Retention**: View, restore, or permanently delete archived folders and locations.
  - **Saved Travel Guides & Markdowns**: View and resume curating scraped markdown travel guides.
* **5. 👤 Account**:
  - **My Profile & Security**: Upload or change your personal profile picture avatar and self-service password updates with current password validation.
  - **User Management & Administration**: (Admin only) View registered accounts, assign roles, reset user passwords, or permanently delete users with cascade data wiping. Standard users view session info and logout.
* **6. 🖥️ System**:
  - **Help & Guided Onboarding**: Restart interactive spotlight tours, reopen the Getting Started checklist, and access the "What's New in v7.4.0" release notes.
  - **Privacy & Telemetry**: Toggle 100% anonymous usage statistics, preview telemetry payloads, and send test pings.
  - **External API Usage Logs**: Inspect 6-month call volume history across Google Maps, OSRM, Wikipedia, and AI.
  - **Database Maintenance**: Re-sync offline IndexedDB cache and companion avatars with the server.

---

## 7. Import Locations and Places

### The Import URL Process
TravelBuff lets you scrape location lists and sights from external travel websites, blogs, and list articles using an automated ingestion pipeline:

1. Click the **Import URL** button in the top header.
2. Enter the full URL of the travel page you want to scrape.
3. Select one of the **4 Markdown scraper service options** from the dropdown:
   * **Jina Reader**: Converts any web page to clean markdown. Uses the public [Jina Reader API](https://jina.ai/reader/).
   * **Cheerio Parser**: A fast, server-side HTML parser. Ideal for simple static sites and lists.
   * **Playwright**: Uses headless browser scraping. Essential for complex, JavaScript-rendered Single Page Applications (SPAs).
   * **Firecrawl**: An advanced crawler and scraping API. Great for bypassing standard site protections and retrieving structured text data.
4. Click **Fetch** to retrieve the page content.

Once fetched, you are automatically redirected to the **Review Data (Curation Queue)** page:
1. Under the **Markdown Guide** tab, you will see the retrieved text.
2. In the **Review Data** tab, you will see a curated list of candidate sights.
3. For each sight, select the parent target folder location, tags, and category classifications (e.g. `stay`, `temple`, `restaurant`).
4. **Context Constraints**: At the top of the Review Data page, fill in the **City**, **State**, and **Country** input boxes. Entering these fields acts as a geographical bounding query, ensuring the map search engine returns accurate results.
5. Retrieve details for all sights in one click:
   * **Get All Maps**: Queries geocoding coordinates. If Google Maps is enabled in Settings, queries **Google Maps Places/Geocoding API**. If disabled, queries the open-source **OpenStreetMap (OSM) Nominatim API**.
   * **Send All to AI**: Passes the sights and markdown text to the configured LLM (e.g., Gemini) to automatically generate descriptions, identify coordinates, and fill categories.
6. Click **Save/Approve** to commit the curated items into your locations list.

### Guide Storage & Workspace Visibility
* **Guide Archiving**: All successfully scraped guide texts, uploaded files, and parsed URL metadata records are archived permanently in the database. You can review, resume curating, or delete these records inside the **Settings** page under the **Saved Guides / Imported Guides** tracker.
* **Locations View**: Locations and sights imported from guides are saved directly into your primary database. They are displayed inside the corresponding folder's list cards in the **Locations** workspace and are plotted on the interactive **Locations map**.

---

## 8. Backup & Restore

Keep your travel data safe:
* **Export Backup**: Go to Settings and click **Backup Data** to download all locations, collections, trips, expenses, and configuration profiles as a single JSON file.
* **Restore Backup**: Select **Restore Data** and upload your previously saved JSON file to overwrite and restore your database state.

---

## 9. Release Notes & Version History

### Version 7.4.0 (Current Release)
* **Global Duplicate Prevention for Folders & Locations**:
  - Live duplicate search across all folders and locations evaluating names, country/state, and GPS proximity within 150 meters.
  - Interactive duplicate warning banner displaying parent path breadcrumbs and direct "View Existing" navigation button.
* **Collection Multi-Select Mode & Bulk Deletion**:
  - Added "Select" / "Done Selecting" toggle in Collections header with card checkboxes and floating bulk action bar.
  - Safe bulk deletion with confirmation safeguard preserving all underlying locations and places.
* **Re-organized Hybrid 6-Tab Settings with Global Live Search**:
  - 6 dedicated tabs: ⚙️ General & Preferences, 🔌 Integrations & AI, 🏷️ Taxonomy & Tags, 💾 Data & Backups, 👤 Account, and 🖥️ System.
  - Top search input with instant matching dropdown, tab switching, and auto-scrolling with accent outline highlight.
* **App Update Notification Banner & "What's New in v7.4.0" Modal**:
  - Persistent top update notification banner alerting users of new releases with direct link to view release notes.
  - Rich "What's New" modal dialog accessible from the update banner, avatar dropdown, and Settings Help tab.
  - Synchronized `APP_VERSION` across login, avatar menus, mobile profile drawer, and settings footers.
* **Avatar Dropdown Menu Cleanup**:
  - Removed "Archived Items" from user avatar dropdowns (now in Settings $\rightarrow$ Data & Backups).
  - Added clickable "What's New" link and version badge in desktop and mobile profile dropdowns.

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
