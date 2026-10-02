# Project Guidelines & Rules (TravelBuff)

## General Workflow
- Do not make any changes unless expressly told to implement. Always make plans first.
- Keep dependencies minimal and adhere to the project's existing architecture.
- This is not a git repository; never check for or run git commands in this workspace.

## Code Standards
- **Frontend (Vue/Vite)**: Follow component structure and style conventions in `src/`.
- **Backend (Node.js/Express)**: Follow existing route and DB handling conventions in `server.js` and `db.js`.
- Preserve existing comments and docstrings.

## New Feature Implementation
- Always evaluate and answer the following questions internally in your plan/assessment (do not ask the user):
1. Does it need backup and restore module changes?
2. Can this be implemented server-side only, or does it need offline functionality first?
3. Does this need a blog on the website to help users use this feature correctly? (If yes, generate a ready-to-use prompt that can be used in the blog space to generate the blog post)
4. Does this need docs.md to be updated?
5. Does this need version change? (If yes, you MUST also update the features list in src/components/WhatsNewModal.jsx to reflect the new changes)
6. Is there anything we are deleting which is user-data?
7. How do the changes affect existing configurations and journeys set in previous versions (e.g., option changes, placement, or schema changes)? Are they affected, and what backward compatibility or migration is needed?

## Bug fixes
- Always evaluate and answer the following questions internally in your plan/assessment (do not ask the user):
1. Does it need backup and restore module changes?
2. Does this need version change? (If yes, you MUST also update the features list in src/components/WhatsNewModal.jsx to reflect the new changes)
3. Is there anything we are deleting which is user-data?
4. Does this fix affect existing configurations, saved journeys, or backward compatibility?

## Architecture & Data Strategy
- **Trip Mode is Offline-First**: 
  - Dexie / IndexedDB client storage is scoped specifically to active journeys, itineraries, reservations (including cached offline file attachments), expenses, currency exchange rates, trip notes, emergency info, and pinned itinerary places.
  - Offline mutations in Trip Mode are queued in the local `sync_queue` and flushed automatically upon reconnection.
- **Library & Administration are Online-First**:
  - `Locations`, `Collections`, `AI Review Queue / Imports`, and `Settings` are server-backed via REST endpoints to keep client memory and IndexedDB lightweight.
  - When disconnected (`syncStatus === 'offline'` or `navigator.onLine === false`), these views must render graceful "Server Not Connected" fallback states with a 1-click shortcut to switch into **Trip Mode**.
- **PWA Caching & Version Freshness**:
  - The Service Worker cache name must align with `APP_VERSION`.
  - Express serves `sw.js` and `index.html` with `Cache-Control: no-cache, no-store, must-revalidate` so online clients always receive fresh UI bundles immediately upon app update.

## Testing & Verification
- Test all API endpoints or UI changes after modifying code.
- Check the console and server logs for any regressions.

