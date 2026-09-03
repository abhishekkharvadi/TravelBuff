# Project Guidelines & Rules (TravelBuff)

## General Workflow
- Do not make any changes unless expressly told to implement. Always make plans first.
- Keep dependencies minimal and adhere to the project's existing architecture.

## Code Standards
- **Frontend (Vue/Vite)**: Follow component structure and style conventions in `src/`.
- **Backend (Node.js/Express)**: Follow existing route and DB handling conventions in `server.js` and `db.js`.
- Preserve existing comments and docstrings.

## New Feature Implementation
- Always ask for following things before making plans: 
1. Does it need backup and restore module changes
2. Can this be implemented server-side only, or does it need offline functionality first?
3. Does this need a blog on the website to help users use this feature correctly?
4. Does this need docs.md to be updated?
5. Does this need version change?
6. Is there anything we are deleting which is user-data?

## Bug fixes
- Always ask for following things before making plans: 
1. Does it need backup and restore module changes
2. Does this need version change?
3. Is there anything we are deleting which is user-data?

## Testing & Verification
- Test all API endpoints or UI changes after modifying code.
- Check the console and server logs for any regressions.
