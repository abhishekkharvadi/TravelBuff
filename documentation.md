# TravelBuff Documentation

Welcome to the official documentation for **TravelBuff** — your personal travel organizer and itinerary planner designed to work seamlessly across all your devices, even when you're offline.

---

## 1. Overview & Features

### The TravelBuff Philosophy
TravelBuff is designed for travelers who value reliability, speed, and privacy. Traditional travel planners stop working when you lose internet connection in remote locations, subways, or during flights. TravelBuff solves this with an **Offline-First** approach:
* All your travel details are saved directly on your device.
* Any changes you make show up instantly without waiting for a connection.
* When you reconnect to the internet, your changes automatically sync with your backup account.
* Live updates automatically sync across your phone, tablet, and computer so all your devices stay up to date.

### Core Features
* **Organized Folders & Tags**: Group your destinations and regions into clear folders with custom labels.
* **Visited Badges**: Easily see where you've been with visual "Visited", "Partial", and "Not Visited" status indicators.
* **Interactive Maps & Numbered Routes**: View your spots on interactive maps with clear step-by-step numbered markers (`#1`, `#2`, `#3`...).
* **AI Trip Importer**: Automatically convert web articles, travel guides, or documents into structured travel plans with smart location details.
* **Photo & Travel Companion Sync**: Connect with your photo library server to easily tag travel companions with face photo avatars.
* **GPS Travel Log Import**: Import GPS logs from your trips to accurately measure your actual travel distances.
* **Multi-Currency Expense Tracker**: Log expenses in any currency and set custom exchange rates to stay on top of your travel budget.
* **Mobile-Friendly Design**: Simple, easy-to-use interface optimized for smartphone screens and touch navigation.

---

## 2. Setting Up TravelBuff

### Prerequisites Check (All Operating Systems)
Before setting up TravelBuff, ensure you have **Node.js** (version 18 or higher) installed on your computer:
1. Open your terminal or Command Prompt.
2. Type `node -v` and press Enter.
3. If Node.js is installed, you will see a version number (such as `v18.16.0` or `v20.9.0`). If not, download and install Node.js from [nodejs.org](https://nodejs.org/).

---

### Step 1: Open the Project Folder
Open your command line tool and navigate to where you downloaded or extracted the TravelBuff project files:

* **macOS / Linux**:
  Open the **Terminal** app and enter:
  ```bash
  cd ~/Downloads/TravelBuff
  ```
* **Windows**:
  Open **Command Prompt** or **PowerShell** and enter:
  ```cmd
  cd C:\Users\YourUsername\Downloads\TravelBuff
  ```
  *(Replace `YourUsername` and folder path with your actual directory location)*.

---

### Step 2: Install Required Packages
Download all the application components by running the install command in your terminal:

```bash
npm install
```
This process takes about a minute to complete and sets up all necessary libraries automatically.

---

### Step 3: Create & Configure Environment Settings (`.env`)
TravelBuff uses a configuration file named `.env` in the main folder to manage basic application settings.

#### 1. Example Configuration Template:
Create a file named `.env` in your project folder with the following settings:

```env
# Port number where TravelBuff will run (Default: 5000)
PORT=5000

# Secret phrase used to secure user accounts (replace with your own secret word/key)
JWT_SECRET=my-travelbuff-secret-key-12345

# Folder path for storing uploaded photos and documents
UPLOADS_DIR=./data/uploads
```

#### 2. How to create the `.env` file on your Operating System:

* **macOS / Linux**:
  Run this command in terminal to create and edit the file:
  ```bash
  touch .env
  nano .env
  ```
  Paste the configuration template above, press `Ctrl + O` to save, and `Ctrl + X` to exit.

* **Windows**:
  - In File Explorer, right-click inside your TravelBuff folder, select **New** -> **Text Document**, and name it `.env` (make sure to remove `.txt`).
  - *Alternatively*, in PowerShell run:
    ```powershell
    New-Item .env -ItemType File
    ```
  - Open `.env` in Notepad, paste the template above, and save.

---

### Step 4: Launch TravelBuff

You can choose to run TravelBuff interactively in your terminal or continuously in the background.

#### Option A: Run Interactively (Foreground Mode)
Use this option when testing or developing locally:

```bash
npm run dev
```
This starts both the server and application interface. Keep your terminal window open while using TravelBuff.

#### Option B: Run in the Background (Recommended for Continuous Use)
Use this option if you want TravelBuff to keep running in the background even when you close your terminal:

* **Cross-Platform Option (Using PM2 - Recommended for Windows, macOS, Linux)**:
  1. Install PM2 globally:
     ```bash
     npm install -g pm2
     ```
  2. Start TravelBuff in the background:
     ```bash
     pm2 start server.js --name travelbuff
     ```
  3. Useful PM2 commands:
     - View status: `pm2 status`
     - View live logs: `pm2 logs`
     - Stop application: `pm2 stop travelbuff`

* **macOS / Linux Native Background Option**:
  Run the app in the background using `nohup`:
  ```bash
  nohup npm start > app.log 2>&1 &
  ```

#### Option C: Deploying via Docker & Docker Compose (Recommended for Self-Hosting)

If you prefer using Docker or self-hosting on home servers (Unraid, Synology, Portainer, or VPS), you can deploy TravelBuff using the official Docker image `abhishekkharvadi/travelbuff:latest`.

##### 1. Quick Start via Docker CLI:
Run this command in your terminal to start TravelBuff with persistent storage:

```bash
docker run -d \
  --name travelbuff \
  -p 5000:5000 \
  -e PORT=5000 \
  -e JWT_SECRET=your-secure-jwt-secret-here \
  -v travelbuff_data:/app/data \
  -v travelbuff_uploads:/app/data/uploads \
  --restart unless-stopped \
  abhishekkharvadi/travelbuff:latest
```

##### 2. Sample `docker-compose.yml` Configuration File:
Create a file named `docker-compose.yml` in any folder on your server:

```yaml
version: '3.8'

services:
  travelbuff:
    image: abhishekkharvadi/travelbuff:latest
    container_name: travelbuff
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - PORT=5000
      - JWT_SECRET=change-this-to-a-secure-secret-key
      - UPLOADS_DIR=/app/data/uploads
    volumes:
      - travelbuff_data:/app/data
      - travelbuff_uploads:/app/data/uploads

volumes:
  travelbuff_data:
  travelbuff_uploads:
```

##### 3. Docker Compose Management Commands:
* **Start Container**: `docker compose up -d`
* **View Container Logs**: `docker compose logs -f`
* **Stop Container**: `docker compose down`

---

### Step 5: Open TravelBuff in Your Web Browser
Once launched, open your web browser (Chrome, Safari, Edge, Firefox) and navigate to:

```text
http://localhost:5000
```
Welcome to TravelBuff! You can now start creating your travel folders, itineraries, and trip logs.

---

## 3. Setting Up Locations & Folders

### Adding Locations & Folders
Organize your travel destinations with automated details and folder grouping:
* **Add a Location**: Click the **+ Add Location** button on the Locations screen.
* **Search & Auto-Fill**: Start typing your destination in the search bar and select your location from the dropdown suggestions. Location details—including name, state, country, and map coordinates—are automatically filled in for you.
* **Automated Featured Cover Photos**: Once saved, TravelBuff automatically searches for and downloads a featured cover photo for your location in the background.
* **Folder Option**: You can check the **Create as Folder** option when adding a location, or click **Convert to Folder** on any existing location. This allows you to treat a location (such as a Country or State) as a folder containing multiple other sub-locations or cities.

---

### Places of Visit & Categorization
Add specific spots and landmarks (such as cafes, temples, hotels, or waterfalls) inside any location:
* **Multiple Places per Location**: Each location can store multiple individual places of visit.
* **Spot Categories**: Assign categories to your spots (e.g. `hotel`, `stay`, `resort`, `restaurant`, `cafe`, `temple`, `museum`, `waterfall`, `mountain`, `trek`, `airport`, `station`, or custom user categories).
* **Coordinates & Descriptions**: Each place of visit is saved with its own exact map coordinates and can include custom notes or descriptions.
* **Photo Management**: Featured cover photos are automatically fetched and downloaded if available. If a photo isn't available or if you prefer a custom picture, you can manually upload images or star any uploaded photo as the featured cover image.

---

### Filtering & Sorting Locations
Easily locate your destinations using the flexible filter panel (`🔍 Filters & Sorting`):
* **Text Search**: Search by name across all your locations and places.
* **Country & State Filters**: Narrow down your view by selecting specific countries or states from the dropdown filters.
* **Tag Filters**: Filter by custom tags assigned to your locations or places.
* **Category Filters**: View only specific types of spots (such as cafes, hotels, or attractions).
* **Visited Status**: Filter by `Visited`, `Not Visited`, or `Partial` completion.
* **Sorting Options**: Sort your list by Date Added (Newest or Oldest), Alphabetical Order (A-Z or Z-A), or Visited Status.

---

### Interactive Maps & Image Sources
* **Map Pins**: View your locations and places of visit displayed visually with interactive markers on the map canvas.
* **Image Sources**: By default, location cover photos and map details are pulled automatically from OpenStreetMap and Wikipedia. If you want Google Maps place search and imagery, you can add a Google Maps API Key in Settings (see Section 6 for details).

---

### Visit History & Immich Integration
Track your personal visits to locations:
* **Immich Photo Album Sync**: Connect your Immich server in Settings to link your personal photo albums directly to a location, making your travel memories easy to find.
* **Manual Visit Logs**: Log your visit date ranges manually (Start Date and End Date) along with custom photo album links. Adding a visit automatically updates the location status to `✓ Visited`.

---

## 4. Collections

Collections allow you to create custom thematic groupings of your locations and places of visit across different trips, regions, or travel styles (such as "Wonders of the World", "Top Restaurants", or "Weekend Day Trips").

### System Collections & Custom Collections
TravelBuff provides built-in system collections as well as full custom collection creation:
* **Visited Places**: Automatically gathers all locations and places you have marked as visited (`✓ Visited`).
* **Bucket List (Not Visited)**: Automatically gathers all locations and places you haven't visited yet (`○ Not Visited`).
* **Custom Collections**: Create your own custom collections using either **Manual Selection** or **Auto-Group Rules**.

---

### Classification Methods: Manual vs. Auto-Group

When creating or editing a collection, you can choose how items are gathered:

1. **Manual Selection**: Hand-pick specific destination folders or individual places of visit using a searchable tree list.
2. **Auto-Group Rules**: Automatically populate collections using smart filtering criteria:
   - **Filter by Locations**: Include items located within specific parent folders or cities.
   - **Filter by Categories**: Group spots by type (e.g. `restaurant`, `cafe`, `museum`, `hotel`).
   - **Filter by Tags**: Match custom tags assigned to your items.
   - **Filter by Keywords**: Search for matching words in item titles or notes.
   - **Rule Logic**: Choose **Match ANY (OR)** (includes items matching any active rule) or **Match ALL (AND)** (includes only items satisfying every rule).

---

### Step-by-Step Practical Examples

Here is how to create popular collection setups step-by-step:

#### Example 1: "Wonders of the World" (Manual Selection)
* **Goal**: Hand-pick famous landmarks spanning different countries into one master global collection.
* **Steps**:
  1. Open the **Collections** screen and click **+ Add Collection**.
  2. Name the collection **"Wonders of the World"**.
  3. Select **Manual Selection** as your classification method.
  4. Use the search bar in the selector list to find and check your saved landmarks:
     - Check `📍 Taj Mahal` (under Agra, India)
     - Check `📍 Colosseum` (under Rome, Italy)
     - Check `📍 Machu Picchu` (under Cusco, Peru)
     - Check `📍 Great Wall of China` (under Beijing, China)
     - Check `📍 Petra` (under Ma'an, Jordan)
  5. Click **Save Collection**. You can now view all world wonders together on a single global interactive map!

#### Example 2: "Excellent Restaurants in Delhi" (Auto-Group by Location + Category)
* **Goal**: Automatically collect all dining spots saved under Delhi.
* **Steps**:
  1. Click **+ Add Collection** and name it **"Excellent Restaurants in Delhi"**.
  2. Select **Auto-Group** as the classification method.
  3. Under **Filter by Locations**, check **Delhi**.
  4. Under **Filter by Categories**, check **restaurant** and **cafe**.
  5. Set Rule Logic to **Match ALL (AND)**.
  6. Click **Save Collection**. Any existing or newly added restaurants under Delhi will automatically appear in this collection!

#### Example 3: "Places for a Day Trip from Chennai" (Auto-Group or Manual Tags)
* **Goal**: Group nearby getaway destinations around Chennai for quick weekend trips.
* **Steps**:
  1. Click **+ Add Collection** and name it **"Places for a Day Trip from Chennai"**.
  2. Select **Auto-Group**, type `"Day Trip"` in the Keyword filter (or select the `#DayTrip` tag).
  3. *Alternatively*, choose **Manual Selection** and check nearby locations such as `📁 Mahabalipuram`, `📁 Kanchipuram`, and `📁 Pondicherry`.
  4. Click **Save Collection** to view your getaway destinations and routes on the map.

#### Example 4: "Museums & Historical Landmarks in Paris" (International Example)
* **Goal**: Create a dedicated cultural collection for Paris landmarks.
* **Steps**:
  1. Click **+ Add Collection** and name it **"Paris Cultural Landmarks"**.
  2. Select **Auto-Group** and check **Paris** under Locations.
  3. Under Categories, check **museum** and **temple** (monuments/heritage).
  4. Click **Save Collection** to see an interactive culture map across Paris.

#### Example 5: "Tokyo Coffee Trail" (International Example)
* **Goal**: Group specialty coffee shops across Tokyo neighborhoods (Shibuya, Shinjuku, Ginza).
* **Steps**:
  1. Click **+ Add Collection** and name it **"Tokyo Coffee Trail"**.
  2. Select **Auto-Group**, check **Tokyo** under Locations, and select **cafe** under Categories.
  3. Click **Save Collection** to explore your coffee trail map across Tokyo.

---

## 5. Importing Travel Guides & Using AI

TravelBuff lets you quickly build travel plans by automatically importing structured information from web articles, blogs, or saved document files (`.md`, `.pdf`, `.docx`, `.html`, `.txt`).

### How to Import Content (Step-by-Step Examples)

#### 1. Importing a Web Page URL
1. Click the **Import Content** button in the main header navigation bar.
2. Select **🌐 Import Web Page**.
3. Paste any travel blog or web article link (for example: `https://example.com/delhi-food-guide`).
4. Select your preferred **Web Scraper Engine**:
   - **Jina Reader**: Converts full web pages into clean, readable Markdown text.
   - **Cheerio Parser**: Fast HTML parser for lightweight web pages.
   - **Playwright**: Headless browser engine for dynamic, interactive web pages.
   - **Firecrawl**: Advanced web scraper for complex sites.
5. Choose your **Image Association Setting**: Attach photos found *above* or *below* place headings.
6. Click **Fetch Guide** to convert the article and enter the Review workspace.

#### 2. Importing a Travel Document
1. Click **Import Content** and select **📄 Import Document**.
2. Select or drag-and-drop a document file from your computer (`.md`, `.pdf`, `.docx`, `.html`, `.txt`).
3. Choose your **Document Parser Engine**:
   - **⚡ Fast Local Parser**: Converts local PDFs, Word documents, and text files.
   - **🤖 AI Document Vision Parser**: Uses AI vision to read complex visual document layouts.
4. Click **Convert Document** to launch the Review workspace.

---

### Accessing & Resuming Saved Guides
* **Automatic Storage**: As soon as a web article or document is imported, TravelBuff automatically saves the raw guide content into your local database (`Saved Travel Guides`).
* **Resuming Work**: You can access, view, or resume curation for any imported guide at any time by going to **Settings** -> **Saved Travel Guides**.
* **Progress Auto-Save**: Your curation progress (selected locations, categories, tags, day assignments) is saved automatically so you can safely pause and resume whenever needed.

---

### The 3 Review Workspace Tabs & Their Importance

Once content is imported, TravelBuff opens a dedicated 3-tab workspace for review and curation:

1. **📄 Original Guide Tab**:
   - Displays the converted Markdown text.
   - **Interactive Selection**: Highlight any text snippet in the guide to instantly add it to your curation queue.
   - **Duplicate Detection**: Headings already present in your database display clear green badges (`✓ Already in Database`).

2. **⚙️ Review Data Tab (Curation Queue)**:
   - **Destination & Starting Settings**: Set the destination (City, State, Country) and Home Address to calculate distances and daily routes.
   - **Bulk Location Assignment**: Select a parent destination folder from the dropdown and click **Apply** to link all pending places at once.
   - **Inline Location Creation**: Click **➕ New Location** to search and create a new destination folder without leaving the import tool.
   - **Row Editing**: Edit landmark names, day numbers, spot types, parent locations, categories, descriptions, and cover photos.

3. **🗺️ Places from this Guide Tab**:
   - Groups saved places neatly by assigned day numbers (**Day 1**, **Day 2**, etc.).
   - Includes a 1-click **➕ Add Itinerary** button to instantly generate a trip plan.

---

### Action Toolbar & AI Buttons Guide

Here is a guide to all toolbar and row actions available during review:

* ➕ **New Location**: Opens an inline search modal to create a new destination folder.
* 📍 **Search OSM (Batch OSM)**: Automatically searches OpenStreetMap (Nominatim) for addresses and coordinates for all unresolved rows.
* ✨ **Analyze Unresolved Rows with AI**: Sends pending rows to the AI engine (Gemini, OpenAI, Claude, or Ollama) to extract exact addresses, categories, descriptions, and day numbers based on home proximity.
* 📝 **Custom AI Prompt Console**: Toggle the prompt console to review or edit system instructions passed to the AI engine.
* 💾 **Save All Resolved**: Batch saves all resolved items into your TravelBuff database.
* **Row Buttons**:
  - `✓` **Accept & Save**: Save an individual row to your database.
  - `📍` **Search OSM**: Geocode a single row via OpenStreetMap.
  - `✨` **Analyze Row with AI**: Run AI extraction on a single row.
  - `🗑️` **Delete**: Remove an unwanted item from the queue.

---

### Exporting to a Trip Itinerary
Once your places are saved and day numbers are assigned:
1. Switch to the **Places from this Guide** tab.
2. Click **➕ Add Itinerary** at the top right.
3. TravelBuff will automatically create a new **Trip** in the **Trips** tab, populating all daily stops with numbered map route pins ready for your trip!

---

## 6. Creating Itinerary Plans & Travelers

The **Trips** tab is your central workspace for organizing multi-day travel plans, daily schedules, booking confirmations, travel companions, and expense budgets.

### Trip Planner Overview
The main Trip Planner page displays all your trips organized into clear cards:
* **Trip Filter & Search**: Search your trips by title or filter by status (**All**, **Planned**, or **Completed**).
* **Active Trip Mode**: Mark a trip as **Active** to hide extra clutter during your travels and focus exclusively on today's schedule, booking vouchers, and quick expense entries.

---

### Planning a New Trip (`Plan New Trip` Wizard)

Click **+ Plan New Trip** to open the 2-step setup wizard:

#### Step 1: Basic Trip Details
- **Trip Title**: Enter a name for your journey (e.g., *"Japan Cherry Blossom Tour 2026"*).
- **Start Date & Length**: Set your starting date and the total number of days for your trip.
- **Trip Notes & Description**: Add general notes or travel goals.
- **Planned Budget & Base Currency**: Set a target spending limit and select your primary currency.
- **Starting & Ending Address**: Select a saved home address to calculate travel routes from your home to your first stop and back.

#### Step 2: Choosing Your Planning Mode

You can choose between two creation methods:

1. **Manual Mode**:
   - Manually build your schedule step-by-step from your saved places, locations, or collections.

2. **AI Assisted Mode**:
   - **Day 1 Arrival Time**: Specify your arrival time on Day 1 (**Morning**, **Afternoon**, or **Evening**).
   - **AI Route Optimization**: Select target locations or collections, and Gemini AI will automatically group spots geographically into an optimal day-by-day itinerary tailored to your arrival time!

---

### Selecting Locations or Collections for Your Trip
When creating a trip, choose specific destination folders (**Locations**) or custom thematic sets (**Collections**):
* The trip planner automatically loads all places belonging to your selected locations and collections into your trip's **Places Bank**.
* This makes it easy to drag and drop spots directly into your daily schedule without searching your entire database.

---

### Domestic vs. International Trips
* **Domestic Trips**: Uses your primary home currency for simple expense logging and budget tracking.
* **International Trips**: Enables multi-currency tracking, allowing you to log expenses in foreign currencies (e.g. `EUR`, `JPY`, `GBP`) with custom exchange rate overrides.

---

### The 3-Column Planning Workspace

When editing a trip, TravelBuff opens an interactive 3-column workspace:

* **Column 1: Places Bank (Left Column)**:
  - Displays all spots available from your selected locations and collections.
  - Features quick text and tag filters.
  - Click **+ Add** on any spot to assign it directly to a specific day in your plan.

* **Column 2: Daily Itinerary Schedule (Middle Column)**:
  - Organized day-by-day (**Day 1**, **Day 2**, etc.).
  - **Drag & Drop Reordering**: Drag items up or down to adjust your chronological schedule.
  - **Automated Distances & Travel Times**: Automatically calculates driving distances (in km) and estimated travel times between consecutive stops using real-time routing engines.
  - **Inline Booking Confirmation**: Attach flights, train tickets, rental cars, and hotel confirmation PDFs directly to specific days.

* **Column 3: Interactive Route Map (Right Column)**:
  - Renders color-coded daily routes and sequence-numbered map markers (`#1`, `#2`, `#3`...) for intuitive route visualization.
  - Toggle navigation route lines on or off as needed.

---

### Workspace Sub-Tabs (`Itinerary`, `Budget`, `Notes`)

* **Itinerary Tab**: Manage daily stops, map markers, booking attachments, and overnight hotel selections.
* **Budget Tab**: Monitor planned vs. actual spending, log expenses, add custom exchange rates, and view cost charts.
* **Notes Tab**: Keep general trip notes, packing lists, and important travel documents handy.

---

### Special Handling: Home Addresses & Hotel Anchors

* **Home Address Handling**: Save your primary origin under **Settings** -> **Saved Home Addresses**. Starting a trip calculates exact driving distances and travel times from your home to your first stop.
* **Hotel / Stay / Resort Anchors**: Places categorized as stays (hotels, resorts, Airbnb) can be selected as overnight lodging anchors for each day, automatically linking booking confirmations and establishing return points for the evening.

---

---

## 7. Expense Tracking & Home Addresses

TravelBuff includes a full multi-currency budgeting engine to help you plan, track, and manage travel costs across all your trips.

### Planned vs. Actual Expenses
- **Planned Expenses**: Target budget estimates set during pre-trip planning (e.g. estimated flight costs, hotel allocations, or daily food budgets).
- **Actual Expenses**: Real-world costs logged during or after your trip when payments are made.
- **Budget Progress Bars**: Real-time visual bars comparing your total spent against your planned target, with clear color-coded alerts if you exceed your limit.

---

### Recording Expenses & Receipt Attachments
- **Logging Costs**: Easily record expenses with details like amount, currency, category (`Lodging`, `Transportation`, `Food/Dining`, `Entertainment`, `Snacks`, `Shopping`, `Other`), date, and notes.
- **Image Receipt Attachments**: Upload or snap photos of paper receipts directly to any expense entry for record-keeping.
- **Automated Booking Sync**: Creating or editing flight, train, or hotel reservations automatically generates or updates matching expense entries.

---

### Multi-Currency Budgets & Custom Exchange Rates
- **Base Home Currency**: Set your primary home currency in **Settings** (e.g. `USD`, `EUR`, `INR`, `GBP`, `JPY`).
- **Foreign Currency Expenses**: Record expenses in whichever currency you paid with. TravelBuff automatically converts foreign costs into your base currency for total budget calculations.
- **Custom Exchange Rate Overrides**: If you exchange cash at a specific local kiosk or airport conversion rate, enter custom conversion overrides under **Currency Exchange Rates** in the Trip Budget page. TravelBuff will prioritize your custom exchange rates over default API rates.

---

### Expense Analytics & Printable Reports
- **Category Breakdown Charts**: View interactive visual charts showing how your budget is distributed across categories (Lodging vs Food vs Transportation).
- **Printable Expense Summary**: Export or print detailed expense logs alongside your trip itineraries for tax records or business reimbursement.

---

### Saved Home Addresses
- Save your primary home starting points under **Settings** -> **Saved Home Addresses**.
- The routing engine automatically uses your home address to calculate starting distances, driving times, and home-origin routes for trips.

---

## 8. Trip Mode (On-the-Road Companion)

When you are actively traveling—standing in an airport line, riding a train, or exploring a city on foot—navigating a complex desktop editor can be distracting. **Trip Mode** transforms TravelBuff into a streamlined, mobile-optimized, single-screen travel companion designed for effortless one-handed use.

### Why Trip Mode is Essential While Traveling
- **Single-Screen Focus**: Eliminates complex layout controls and focuses strictly on **today's schedule**.
- **Instant Vouchers**: Access hotel confirmation sheets and flight boarding passes in one tap.
- **On-the-Go Logging**: Quickly log cash expenses, search for nearby food, or check GPS distance logs without leaving the screen.

---

### Key Features of Trip Mode

#### 1. Today's Streamlined Schedule
- Automatically detects your active trip and opens today's date.
- Displays chronological stops for the day with category icons, notes, and driving distances/times between stops.
- One-tap links to open turn-by-turn directions in your favorite map app.

#### 2. 100% Offline Mode & Instant Local Sync
- All your trip itineraries, vouchers, locations, and notes are saved directly on your device.
- You can add expenses, record notes, or view your schedule in remote areas, subways, or airplane mode without any internet connection or server requests.
- All offline changes are saved locally and automatically synchronized with your backup account the moment your device reconnects to the internet.

#### 3. Quick Expense Logger (One-Tap Currency Logging)
- Easily log cash or card expenses on the fly (e.g. coffee, taxi fares, street food).
- Select currency, category, amount, notes, and snap a receipt photo.
- Works offline seamlessly and syncs automatically when reconnected to the internet.

#### 4. Nearby Food & Cafe Finder
- Uses your device's live GPS coordinates (or current stop coordinates) to find nearby restaurants, cafes, lunch spots, dinner venues, or vegetarian options within 2 km.
- Displays distance in meters, user ratings, addresses, and photo previews.
- **1-Click Itinerary Bookmark**: Click **Bookmark** on any nearby spot to instantly add it to your itinerary!

#### 5. Instant Booking Vouchers & Tickets
- Provides quick access to hotel reservations, flight tickets, and rental car vouchers linked to the current day.
- Built-in PDF and image viewer lets you inspect booking confirmation details instantly without opening email apps or file folders.

#### 6. GPS Travel Log Import (OwnTracks Integration)
- Import actual GPS travel distance logs recorded via OwnTracks during your trip.
- Compare actual kilometers traveled each day against your planned route estimates.

#### 7. Quick Trip Notes
- Jot down quick reminders, hotel room numbers, door codes, or packing notes on the fly.

---

## 9. Settings

The **Settings** page is your central control panel for managing integrations, AI assistants, backup files, custom categories, travel companions, saved addresses, and user administration.

---

### Immich Photo Server Integration
Connect your self-hosted **Immich** photo server to automatically sync photo albums with destination folders and link travel companion photos:
* **Server Endpoint URL**: Enter your backend Immich server URL (e.g., `https://immich.yourdomain.com`).
* **Alternative URL**: Optional public URL used when opening Immich web album links directly from location cards.
* **Immich API Key**: Enter your personal Immich API key for secure photo syncing.
* **Test Connection Tool**: Click **Test Connection** to verify your API credentials and detect your Immich server version instantly.

---

### AI Assistant Configuration
Power TravelBuff's smart features—including travel guide extraction, automated location assignment, and trip route generation—with your preferred AI provider:
* **AI Enable Toggle**: Easily toggle AI features on or off.
* **Supported Providers**: Choose between **OpenAI**, **Claude**, **Gemini**, **Ollama (Self-Hosted)**, or **Local AI**.
* **API Key & Custom Endpoints**: Enter cloud API keys or specify custom local endpoint URLs for self-hosted LLMs.
* **Model Selector**: Select standard models (e.g. `gemini-1.5-pro`, `gpt-4o`, `claude-3-5-sonnet`) or type a custom model identifier.
* **Firecrawl API Key (Optional)**: Enable Firecrawl to automatically scrape web articles and travel blogs during guide imports.

---

### Google Maps Integration (Optional)
TravelBuff defaults to free OpenStreetMap and Leaflet maps out of the box. You can optionally enable Google Maps for alternative map displays and routing:
* **Google Maps API Key**: Enter your Google Maps API key.
* **Required APIs**: For full functionality, enable **Maps JavaScript API**, **Directions API**, **Distance Matrix API**, **Geocoding API**, and **Places API** in your Google Cloud Console.
* **Cost & Billing Notice**: Google provides $200 in free monthly credits (approx. 28,000 map loads). We recommend setting budget alerts in your Google Cloud Console for heavy usage.

---

### General Configurations & Navigation Options
* **Base Currency**: Set your primary home currency (`USD`, `EUR`, `INR`, `GBP`, `JPY`) for budget tracking and automatic foreign expense conversions.
* **Default Navigation Map App**: (iOS & macOS devices) Choose whether direction links open in **Google Maps** or **Apple Maps**.

---

### OwnTracks Location Tracking
* **Webhook Target URL**: Copy your unique webhook URL and paste it into the **OwnTracks mobile app** (HTTP mode) to track background GPS positions and calculate real-world kilometers traveled during your trip.

---

### Backup & Restore Engine
Protect your travel database and move your data across devices seamlessly:
* **Security Notice**: Private API keys (Immich, Google Maps, and AI keys) are strictly excluded from backup files to protect your privacy. Re-enter your keys manually after restoring a backup.
* **Download Backup (`.json`)**: Click **📥 Download Backup** to save all locations, places, trips, expenses, guides, notes, and uploaded photos into a single backup file.
* **Chunked Restore**: Upload a saved backup JSON file. TravelBuff safely restores database records and uploaded media in background chunks with real-time progress indicators.
* **Re-Sync Pending Media**: Click **🔄 Re-Sync Pending Media** to refresh local storage and rebuild companion photo avatars if needed.

---

### User Management & Administration (Admin Only)
Visible exclusively to server administrators (the first account created on your server):
* **User Registry Table**: View all registered accounts, user roles (Admin vs Standard User), and registration dates.
* **Reset Passwords**: Click the key icon on any user row to open an admin password reset modal.
* **Permanent User Deletion**: Click the trash icon to safely remove a user account. Automatically wipes all associated trips, places, expenses, travel guides, and uploaded files from both database and disk.

---

### Saved Home Addresses
* Save primary home, office, or secondary starting points with geocoded map coordinates.
* Used automatically by the trip planner to compute initial driving distances and travel times from home to your first stop.

---

### Custom Categories & Color Tags
* **Color Tags**: Create custom labels with a built-in HEX color picker to organize locations and places visually.
* **Custom Categories**: Define custom spot categories with custom emoji icons (`📌`, `🍜`, `🏰`).

---

### Travel Companions (People)
* Manage profiles for friends and family members traveling with you.
* Link companions to **Immich face/person IDs** to display round photo avatars in trip headers and location albums.

---

## 10. Helpful Tips & Shortcuts

Enhance your travel planning experience with these handy tricks and shortcuts built into TravelBuff:

### 📍 Automatic Coordinate Smart Parsing (Latitude/Longitude Paste Trick)
When adding or editing a location, place of visit, or saved address, you don't need to copy and paste latitude and longitude into separate fields manually:
* Simply copy a full coordinate pair string (e.g. `28.6139° N, 77.2090° E` or `28.6139, 77.2090` from Google Maps or Apple Maps).
* Paste the string directly into the **Search Address or Coordinates** field.
* TravelBuff's smart coordinate parser will automatically split the numbers, extract the exact latitude and longitude values, and place your map pin accurately on the map!

---

### ⌨️ Keyboard Shortcuts & Modal Controls
* **Escape (`Esc`)**: Press **Esc** on your keyboard to instantly dismiss open dialog modals, photo viewers, location creation drawers, or prompt consoles.
* **Instant Filter**: Type in any search or filter bar to narrow down locations, places, or trip schedules instantly without waiting for page reloads.

---

### 🌐 Native Browser History & Direct Web Bookmarking
* **Browser Back & Forward Navigation**: TravelBuff integrates seamlessly with your browser's back and forward buttons (`Alt + Left Arrow` / `Cmd + [`). Navigate in and out of nested destination folders naturally without losing your context.
* **Direct Web Bookmarking**: Save links directly to specific destination folders or settings tabs in your browser bookmarks bar (`Cmd + D` / `Ctrl + D`) to jump straight back to a folder with one click.

---

### 🍽️ 1-Click Food Spot Bookmarking in Trip Mode
* When using **Trip Mode** on the road, click **Find Nearby Food**.
* Browse nearby restaurants, cafes, or vegetarian spots within 2 km.
* Click **Bookmark** on any venue card, and TravelBuff will automatically add the place to your database and insert it into today's itinerary instantly!

---

### 🚚 Drag & Drop Itinerary Reordering
* Need to adjust your daily plan on the fly? Simply click and drag any stop up or down in your daily itinerary list.
* TravelBuff automatically recalculates driving distances (in km) and travel durations between all updated consecutive stops in real time.

---

### ✈️ Offline Pre-Loading for Flights & Subways
* Before embarking on a flight or heading into areas with poor cell reception, open your active trip in **Trip Mode**.
* All daily schedules, map markers, hotel confirmation vouchers, and trip notes will remain fully cached and accessible offline on your device!

---

## 11. Mobile & Screen Adaptability

TravelBuff is built for great mobile experiences:
* **Flexible Design**: Header elements and navigation automatically adapt to small phone screens.
* **Mobile Navigation Bar**: When viewed on smartphones, a fixed bottom bar allows smooth switching between *Locations*, *Collections*, *Trips*, and *Settings*.
* **Screen Edge Padding**: Automatic edge padding ensures navigation controls never block phone home bars or notches.

---

## 12. Release Notes & Version History

### Version 1.2.9 (Current Release)
* **Docker & Docker Compose Deployment Guide**: Added comprehensive container setup instructions under Section 2 ("Setting Up TravelBuff").
* **Official Docker Repository**: Documented official image `abhishekkharvadi/travelbuff:latest`.
* **Production-Ready Compose Template**: Provided sample `docker-compose.yml` configuration file with persistent volume mounts (`/app/data` and `/app/data/uploads`) and lifecycle commands (`up`, `logs`, `down`).

---

### Version 1.2.8
* **Comprehensive Documentation Overhaul**: Reorganized and expanded guide documentation into 12 comprehensive, non-technical sections reflecting exact code behavior.
* **Collections Guide & Real-World Examples**: Detailed manual vs. auto-grouping rules with 5 concrete real-world usage examples ("Wonders of the World", "Excellent Restaurants in Delhi", "Places for a Day Trip from Chennai", "Paris Cultural Landmarks", "Tokyo Coffee Trail").
* **Travel Guide & AI Importer**: Documented URL web scraping, file uploads, saved guides workspace, AI button toolbars, and 1-click itinerary generation.
* **Trip Planner Workspace**: Detailed 2-step setup wizard (Manual vs AI Assisted), 3-column workspace, sub-tabs (`Itinerary`, `Budget`, `Notes`), home distance estimates, and hotel stay anchors.
* **Expense Engine & Multi-Currency**: Documented planned vs. actual budget tracking, multi-currency conversions, custom exchange rates, category breakdown charts, and receipt attachments.
* **Trip Mode & 100% Offline Sync**: Documented mobile-optimized single-screen companion view, 100% offline local sync, quick expense logging, 2km nearby food finder with 1-click itinerary bookmarking, instant booking vouchers, and OwnTracks GPS log imports.
* **Settings & Administration**: Fully documented Immich integration, AI provider options, Google Maps API setup, OwnTracks webhook, chunked backup/restore, admin user management, and saved home addresses.
* **Helpful Tips & Shortcuts**: Highlighted automatic coordinate smart parsing (latitude/longitude paste auto-split trick), keyboard shortcuts, browser navigation/bookmarking, and offline pre-loading.

---

### Version 1.2.7
* **Bulk Location Controls**: Streamlined bulk location selection with a dedicated dropdown and quick Apply button.
* **Smart Category Recognition**: Improved AI category extraction and normalized standard category labels (`Dining`, `Attraction`, `Lodging`, `Transit`, `Shopping`).
* **Simplified Documentation**: Updated guide documentation to be easy to read and non-technical for all users.

---

### Version 1.2.6
* **Smart Cover Photo Search**: Added automated cover photo lookup with clean fallback options for accurate landmark photos.
* **Enhanced Location Matching**: Combined place names and destination cities for more accurate photo matches.
* **Clearer Button Labels**: Updated photo buttons to "Fetch Cover Image" for better clarity.
* **Smooth Error Handling**: Improved network response stability during photo searches.

---

### Version 1.2.0
* **Seamless Back & Forward Navigation**:
  - Full browser back and forward button support so you can navigate folder structures and pages naturally without leaving the application.
* **Direct Web Bookmarking**:
  - Save links directly to specific folders or settings pages to reopen them instantly.

---

### Version 1.1.0
* **First-User Admin Rights**:
  - The first account created on your server automatically receives administrator management options.
* **Account Management**:
  - Admins can manage accounts, reset passwords, or remove user entries from Settings.
* **Clean Data Removal**:
  - Deleting an account safely clears all associated trips, expenses, places, and uploaded files.
* **Reliable Backup & Restore Engine**:
  - Large backup files and media attachments restore reliably in manageable chunks.
* **Private Account Backups**:
  - Backup exports are safely isolated to individual accounts.
* **Version Information**:
  - Displays version badges (`TravelBuff v1.1.0`) across login and settings screens.

---

### Version 1.0.0
* Initial release of TravelBuff:
  - Offline-first storage with automatic cross-device sync.
  - Nested destination folders, tags, and visited status indicators.
  - Interactive map integration with step-by-step numbered route markers.
  - Daily trip itineraries, active trip view, booking reservations, and multi-currency budgeting.
  - Smart travel guide importer for web pages and documents.
  - Companion photo syncing, GPS log importing, and saved home locations.
