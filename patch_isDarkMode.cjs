const fs = require('fs');

let code = fs.readFileSync('src/components/MapView.jsx', 'utf8');

const targetStr = `};

  if (document.body.classList.contains('light-theme')) return false;`;

const replaceStr = `};

const isDarkMode = () => {
  if (document.body.classList.contains('light-theme')) return false;`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('src/components/MapView.jsx', code);
  console.log("Patched isDarkMode.");
} else {
  console.log("Could not find target string.");
}
