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
5. Does this need version change?
6. Is there anything we are deleting which is user-data?
7. How do the changes affect existing configurations and journeys set in previous versions (e.g., option changes, placement, or schema changes)? Are they affected, and what backward compatibility or migration is needed?

## Bug fixes
- Always evaluate and answer the following questions internally in your plan/assessment (do not ask the user):
1. Does it need backup and restore module changes?
2. Does this need version change?
3. Is there anything we are deleting which is user-data?
4. Does this fix affect existing configurations, saved journeys, or backward compatibility?

## Testing & Verification
- Test all API endpoints or UI changes after modifying code.
- Check the console and server logs for any regressions.
