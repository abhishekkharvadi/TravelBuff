const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const refTarget = `const selectedTripIdRef = useRef(selectedTripId);`;
code = code.replace(refTarget, refTarget + `\n  const selectedColRef = useRef(selectedCol);`);

const effectTarget = `  useEffect(() => {
    selectedTripIdRef.current = selectedTripId;
  }, [selectedTripId]);`;
code = code.replace(effectTarget, effectTarget + `\n\n  useEffect(() => {\n    selectedColRef.current = selectedCol;\n  }, [selectedCol]);`);

code = code.replace(
  /let col = null; \/\/ No ref needed for now/,
  `let col = allCols.find(c => c.id === selectedColRef?.current?.id && (slugify(c.name) === route.collectionSlug || c.id === route.collectionSlug));`
);

fs.writeFileSync('src/App.jsx', code);
console.log('Added selectedColRef correctly.');
