const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Patch location folder
code = code.replace(
  /const folder = allLocs\.find\(l => l\.is_folder === 1 && \(slugify\(l\.name\) === route\.folderSlug \|\| l\.id === route\.folderSlug\)\);/,
  `let folder = allLocs.find(l => l.id === currentFolderIdRef.current && l.is_folder === 1 && (slugify(l.name) === route.folderSlug || l.id === route.folderSlug));
            if (!folder) folder = allLocs.find(l => l.is_folder === 1 && (slugify(l.name) === route.folderSlug || l.id === route.folderSlug));`
);

// Patch location item
code = code.replace(
  /const loc = allLocs\.find\(l => slugify\(l\.name\) === route\.locationSlug \|\| l\.id === route\.locationSlug\);/,
  `let loc = allLocs.find(l => l.id === selectedLocationRef.current && (slugify(l.name) === route.locationSlug || l.id === route.locationSlug));
            if (!loc) loc = allLocs.find(l => slugify(l.name) === route.locationSlug || l.id === route.locationSlug);`
);

// Patch collection
code = code.replace(
  /const col = allCols\.find\(c => slugify\(c\.name\) === route\.collectionSlug \|\| c\.id === route\.collectionSlug\);/,
  `let col = allCols.find(c => c.id === selectedColRef?.current?.id && (slugify(c.name) === route.collectionSlug || c.id === route.collectionSlug));
            if (!col) col = allCols.find(c => slugify(c.name) === route.collectionSlug || c.id === route.collectionSlug);`
);

// Patch trip
code = code.replace(
  /const trip = allTrips\.find\(t => slugify\(t\.name\) === route\.tripSlug \|\| t\.id === route\.tripSlug\);/,
  `let trip = allTrips.find(t => t.id === selectedTripIdRef.current && (slugify(t.name) === route.tripSlug || t.id === route.tripSlug));
            if (!trip) trip = allTrips.find(t => slugify(t.name) === route.tripSlug || t.id === route.tripSlug);`
);

fs.writeFileSync('src/App.jsx', code);
console.log('Patched App.jsx routing logic.');
