const fs = require('fs');

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const dateStr = new Date().toISOString().split('T')[0];

const newEntry = `## [v7.7.3] - ${dateStr}

### 🐞 Bug Fixes
- **Routing State Conflicts**:
  - Fixed an asynchronous state overwrite bug where clicking an imported Location card required two clicks to open if a legacy Location with an identical name (and thus an identical URL slug) existed in the library. 
- **Google Maps Marker Events**:
  - Replaced deprecated \`addListener\` with \`addEventListener('gmp-click')\` for modern \`AdvancedMarkerElement\` integrations, clearing a developer console warning.

`;

const patched = changelog.replace(
  '# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n',
  `# Changelog - TravelBuff\n\nAll notable changes to TravelBuff will be documented in this file.\n\n${newEntry}`
);

fs.writeFileSync('CHANGELOG.md', patched);
console.log('Changelog updated to 7.7.3.');
