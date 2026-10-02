const fs = require('fs');

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

const dateStr = new Date().toISOString().split('T')[0];

const newEntry = `## [v7.7.1] - ${dateStr}

### 🐞 Bug Fixes
- **Trip Import Location Mapping**:
  - Fixed an issue where trips imported with new or missing locations would silently fail to map day locations, accommodations, and segment transports within the trip's notes.
  - Hardened string-type conversion on ID map lookups to prevent SQLite dynamic typing mismatches.
  - Ensuring the complete itinerary and required locations render accurately upon import.

`;

const patched = changelog.replace(
  '# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n',
  `# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n${newEntry}`
);

fs.writeFileSync('CHANGELOG.md', patched);
console.log('Changelog updated.');
