const fs = require('fs');

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const dateStr = new Date().toISOString().split('T')[0];

const newEntry = `## [v7.7.2] - ${dateStr}

### 🐞 Bug Fixes
- **Trip Sync Reliability**:
  - Fixed a critical \`ReferenceError\` in the local database sync loop that caused background synchronization to crash when attempting to download imported trip reservations, which subsequently prevented itinerary items from populating in the UI.
- **Map View Stability**:
  - Removed conflicting inline styling parameters from Google Maps \`AdvancedMarkerElement\` instantiation, relying purely on the native \`colorScheme\` for dark mode toggling to prevent API console crashes.

`;

const patched = changelog.replace(
  '# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n',
  `# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n${newEntry}`
);

fs.writeFileSync('CHANGELOG.md', patched);
console.log('Changelog updated to 7.7.2.');
