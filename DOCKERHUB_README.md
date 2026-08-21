# 🌍 TravelBuff

> **Self-hosted, offline-first travel planner, location tracker, and itinerary manager.**

[![Docker Pulls](https://img.shields.io/docker/pulls/YOUR_DOCKERHUB_USERNAME/travelbuff?style=flat-square&logo=docker)](https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/travelbuff)
[![Docker Image Size](https://img.shields.io/docker/image-size/YOUR_DOCKERHUB_USERNAME/travelbuff/latest?style=flat-square)](https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/travelbuff)
[![Architectures](https://img.shields.io/badge/arch-amd64%20%7C%20arm64-blue?style=flat-square)](https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/travelbuff)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

**TravelBuff** is an all-in-one personal travel operating system designed for self-hosters, frequent travelers, and digital nomads. Organize places you want to visit, curate travel guides from any website, plan multi-day trip itineraries, track multi-currency budgets, and log visits—with seamless offline support and real-time multi-device sync.

---

## ✨ Features

- 🗺️ **Hierarchical Location Catalog**: Organize spots into nested folders (e.g., *Europe* → *Italy* → *Rome*), assign custom tags, categories, and plot them on interactive maps (OpenStreetMap default or Google Maps).
- ✈️ **Trip & Itinerary Planner**: Schedule multi-day trips with timelines, reservation attachments, and optional AI-assisted itinerary generation.
- 📱 **Mobile & PWA Ready**: Installable Progressive Web App (PWA) for iOS and Android with a dedicated, distraction-free **Trip Mode**.
- 📶 **Offline-First with Real-Time Sync**: Instant local reads/writes backed by IndexedDB (Dexie.js) paired with WebSocket sync to your server when online.
- 💰 **Multi-Currency Budget & Expenses**: Log planned vs. actual expenses with automatic currency conversion and receipt attachments.
- 📥 **Smart Travel Guide Ingestion**: Import travel blogs, web articles, PDFs, and docs using Cheerio, Playwright, Jina Reader, Firecrawl, or OCR, then curate sights into your database.
- 📸 **Self-Hosted Ecosystem Integrations**: Link photo memories directly with **Immich** and import daily location tracking via **OwnTracks**.
- 🔒 **Private & Multi-User**: Built-in user management, first-user admin privileges, JWT authentication, and isolated user data with full JSON export/import backups.

---

## 🚀 Quick Start with Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  travelbuff:
    image: YOUR_DOCKERHUB_USERNAME/travelbuff:latest
    container_name: travelbuff
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - JWT_SECRET=change_this_to_a_long_random_secure_string
      - DATABASE_DIR=/app/data
      - UPLOADS_DIR=/app/data/uploads
    volumes:
      - travelbuff_data:/app/data

volumes:
  travelbuff_data:
    driver: local
```

Start the container:
```bash
docker compose up -d
```

Open your browser and navigate to `http://localhost:3000`. The first registered user will automatically be assigned **Admin** privileges.

---

## 🐳 Quick Start with Docker CLI

```bash
docker run -d \
  --name travelbuff \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PORT=3000 \
  -e JWT_SECRET="your_custom_jwt_secret_key" \
  -e DATABASE_DIR=/app/data \
  -e UPLOADS_DIR=/app/data/uploads \
  -v travelbuff_data:/app/data \
  YOUR_DOCKERHUB_USERNAME/travelbuff:latest
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port inside the container where the web server listens. |
| `JWT_SECRET` | `your_jwt_secret_here` | **Required.** Cryptographic secret for user auth tokens. |
| `DATABASE_DIR` | `./data` | Directory where the SQLite database (`travelbuff.db`) is stored. |
| `UPLOADS_DIR` | `./data/uploads` | Directory for uploaded media, receipts, and reservation documents. |
| `DISABLE_TELEMETRY` | `false` | Set to `true` to disable anonymous telemetry tracking. |

---

## 💾 Volumes & Data Persistence

| Container Path | Host / Named Volume | Purpose |
| :--- | :--- | :--- |
| `/app/data` | `travelbuff_data` | Persistent SQLite database file and uploaded attachments/receipts. |

> ⚠️ **Important**: Always mount a volume to `/app/data` to prevent data loss across container updates or restarts.

---

## 🌐 Reverse Proxy & WebSocket Support

TravelBuff uses WebSockets (`ws://` / `wss://`) for live syncing across devices. When deploying behind a reverse proxy (Nginx, Traefik, Caddy, or Cloudflare), ensure WebSocket headers are upgraded.

### Nginx Example
```nginx
server {
    listen 80;
    server_name travel.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📦 Backup & Restore

1. **In-App JSON Backup**: Navigate to **Settings → Backup Data** to download an encrypted single-file archive of all your locations, collections, trips, expenses, and configuration profiles.
2. **Volume Backup**: Create a snapshot of the `/app/data` directory on the host to backup the SQLite database and all uploaded files simultaneously.

---

## 🏷️ Supported Architectures & Tags

- `latest`: Latest stable release
- `v1.2.0`, `v1.1.0`, etc.: Versioned releases
- Architectures supported: `linux/amd64`, `linux/arm64` (Raspberry Pi 4/5, Apple Silicon VMs)
