import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import * as cheerio from 'cheerio';
import axios from 'axios';

import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'data', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Utility to download an image from a URL and save it locally
async function downloadImage(urlStr) {
  if (!urlStr || !urlStr.startsWith('http')) return null;
  return new Promise((resolve) => {
    const protocol = urlStr.startsWith('https') ? https : http;
    const req = protocol.get(urlStr, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      
      // Determine extension from URL or content-type
      let ext = path.extname(new URL(urlStr).pathname) || '.jpg';
      const contentType = res.headers['content-type'];
      if (contentType) {
        if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/webp')) ext = '.webp';
        else if (contentType.includes('image/jpeg')) ext = '.jpg';
      }

      const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      const writeStream = fs.createWriteStream(filepath);
      res.pipe(writeStream);
      writeStream.on('finish', () => resolve(`/uploads/${filename}`));
      writeStream.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// Utility to Geocode via OpenStreetMap Nominatim
export async function geocode(query) {
  if (!query) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TravelBuff-App/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      const result = data[0];
      const address = result.address || {};
      const city = address.city || address.town || address.village || address.municipality || '';
      const country = address.country || '';
      return { 
        lat: parseFloat(result.lat), 
        lon: parseFloat(result.lon),
        displayName: result.display_name,
        city: city,
        country: country
      };
    }
    return null;
  } catch (err) {
    console.warn(`Geocoding failed for ${query}`, err.message);
    return null;
  }
}

// Jina Fetcher
function fetchMarkdownJina(url) {
  return new Promise((resolve, reject) => {
    const targetUrl = `https://r.jina.ai/${url}`;
    https.get(targetUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Jina AI returned status code ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// HTML string to Markdown parsing helper using Cheerio
function parseHtmlToMarkdown(html) {
  const $ = cheerio.load(html);
  $('script, style, iframe, noscript').remove();
  
  let markdown = '';
  const elements = $('h1, h2, h3, h4, h5, h6, p, img');
  
  elements.each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    
    if (tagName.startsWith('h') && text) {
      const level = tagName[1];
      markdown += `\n${'#'.repeat(level)} ${text}\n`;
    } else if (tagName === 'p' && text) {
      markdown += `\n${text}\n`;
    } else if (tagName === 'img') {
      const src = $(el).attr('src');
      if (src && src.startsWith('http')) {
        markdown += `\n![](${src})\n`;
      }
    }
  });
  
  return markdown;
}

// Cheerio HTML to Markdown
async function fetchMarkdownCheerio(urlStr) {
  const { data: html } = await axios.get(urlStr, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  return parseHtmlToMarkdown(html);
}

// Playwright Scraper
async function fetchMarkdownPlaywright(urlStr) {
  const launchOptions = { headless: true };
  const alpinePath = '/usr/bin/chromium-browser';
  if (fs.existsSync(alpinePath)) {
    launchOptions.executablePath = alpinePath;
    launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox'];
  }
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(urlStr, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait an additional 2 seconds for JS dynamic rendering
    await page.waitForTimeout(2000);
    const html = await page.content();
    return parseHtmlToMarkdown(html);
  } finally {
    await browser.close();
  }
}

// Firecrawl Fetcher
async function fetchMarkdownFirecrawl(urlStr, apiKey) {
  if (!apiKey) throw new Error('Firecrawl API Key is required');
  const res = await axios.post('https://api.firecrawl.dev/v0/scrape', {
    url: urlStr,
    pageOptions: { onlyMainContent: true }
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (res.data && res.data.success) {
    return res.data.data.markdown;
  }
  throw new Error('Firecrawl scrape failed: ' + (res.data?.error || 'Unknown error'));
}

function cleanPlaceName(rawName) {
  let name = rawName.trim();
  // Strip markdown formatting symbols (like *, _, ~, `, etc.) and punctuation from start/end
  name = name.replace(/^[\*\_\~\`\s"':\-\,\.\/\\\|]+/g, '');
  name = name.replace(/[\*\_\~\`\s"':\-\,\.\/\\\|]+$/g, '');

  // Remove Day prefixes e.g. "Day 1: Place", "Day 01 - Place", "Day 2 Place"
  name = name.replace(/^(?:Day|Date)\s*[-:]?\s*\d+[\s:–—\-]*\s*/i, '').trim();

  // Remove numbers and separators at the start
  // e.g. "1. Place", "10 - Place", "3) Place", "Step 1: Place"
  name = name.replace(/^(\d+[\.\-\s)]+\s*|\bStep\s+\d+[\.\-\s:]+\s*)/i, '').trim();

  // Strip leading/trailing special characters and punctuation again after number strip
  name = name.replace(/^[\*\_\~\`\s"':\-\,\.\/\\\|]+/g, '');
  name = name.replace(/[\*\_\~\`\s"':\-\,\.\/\\\|]+$/g, '');

  // Find contents inside brackets
  const bracketRegex = /\((.*?)\)|\[(.*?)\]/g;
  let match;
  const discarded = [];
  while ((match = bracketRegex.exec(name)) !== null) {
    const text = (match[1] || match[2] || '').trim();
    if (text) discarded.push(text);
  }
  
  // Remove brackets
  name = name.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+/g, ' ').trim();

  // Strip leading/trailing punctuation once more
  name = name.replace(/^[\*\_\~\`\s"':\-\,\.\/\\\|]+/g, '');
  name = name.replace(/[\*\_\~\`\s"':\-\,\.\/\\\|]+$/g, '');
  
  return {
    clean: name,
    discarded: discarded.length > 0 ? discarded.join(', ') : ''
  };
}

function getGeocodeQuery(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  
  const firstWord = words[0];
  // 1st word is 5 characters or more, check 1st word. If less than 5 characters, search with first two words instead.
  if (firstWord.length >= 5) {
    return firstWord;
  } else {
    return words.slice(0, 2).join(' ');
  }
}

export async function processMarkdownImport(urlStr, scraperType = 'jina', firecrawlKey = '', imageDirection = 'below') {
  let markdown = '';
  
  if (scraperType === 'cheerio') {
    markdown = await fetchMarkdownCheerio(urlStr);
  } else if (scraperType === 'playwright') {
    markdown = await fetchMarkdownPlaywright(urlStr);
  } else if (scraperType === 'firecrawl') {
    markdown = await fetchMarkdownFirecrawl(urlStr, firecrawlKey);
  } else {
    markdown = await fetchMarkdownJina(urlStr);
  }

  // 2. Parse Markdown for headings, descriptions, day headings, and images
  const lines = markdown.split('\n');
  const headings = [];
  const images = []; // Array of { url: '', lineNumber: 0 }
  let currentDay = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // Check for images
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+\.(?:jpg|jpeg|png|webp|gif).*?)\)/gi;
    let match;
    while ((match = imageRegex.exec(line)) !== null) {
      images.push({ url: match[1], lineNumber: i });
    }

    // 1. Detect Day lines (e.g. "### **Day 1 in Hyderabad**", "**Day 3 in Hyderabad**", "Day 1", "Date: 2026-08-10")
    const unformattedLine = line.replace(/^#{1,6}\s*/, '').replace(/^[\*\_\`]+|[\*\_\`]+$/g, '').trim();
    const dayMatch = unformattedLine.match(/(?:Day|Date)\s*[-:]?\s*0*(\d+)/i);
    if (dayMatch && dayMatch[1]) {
      currentDay = parseInt(dayMatch[1], 10);
    }

    // 2. Determine if line is a Heading / Place item:
    // - Markdown heading: "# Heading" / "### **Day 1 in Hyderabad**"
    // - Bold line: "**Purani Haveli**" / "**Admire the grandeur of Chowmallah Palace**"
    // - Bulleted or numbered bold line: "- **Charminar**" / "1. **Purani Haveli**"
    let headingText = null;
    let headingLevel = 3;

    const markdownHeadingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    const boldLineMatch = line.match(/^(?:[\*\-\+\d\.\)]+\s*)?\*\*(.+?)\*\*:?\s*(.*)$/);
    const underlineMatch = line.match(/^(?:[\*\-\+\d\.\)]+\s*)?__(.+?)__:?\s*(.*)$/);

    if (markdownHeadingMatch) {
      headingLevel = markdownHeadingMatch[1].length;
      headingText = markdownHeadingMatch[2].trim();
    } else if (boldLineMatch && boldLineMatch[1].trim().length >= 2) {
      headingLevel = 3;
      headingText = boldLineMatch[1].trim();
    } else if (underlineMatch && underlineMatch[1].trim().length >= 2) {
      headingLevel = 3;
      headingText = underlineMatch[1].trim();
    }

    if (headingText) {
      // Strip outer/inner bold/italic/backtick formatting
      const cleanHeadingText = headingText.replace(/[\*\_\`]/g, '').trim();

      // Filter out pure Day headers so "Day 1 in Hyderabad" sets currentDay without creating a fake place
      const isPureDayHeader = /^Day\s*\d+\b(?:\s+in\s+[\w\s]+)?$/i.test(cleanHeadingText) || 
                              /^Date:\s*[\d-]+$/i.test(cleanHeadingText);

      if (!isPureDayHeader && cleanHeadingText.length >= 2) {
        const currentHeading = {
          name: cleanHeadingText,
          level: headingLevel,
          description: '',
          images: [],
          lineNumber: i,
          day: currentDay
        };

        // If bold match had inline description after colon (e.g. **Charminar**: Beautiful monument)
        if (boldLineMatch && boldLineMatch[2] && boldLineMatch[2].trim()) {
          currentHeading.description = boldLineMatch[2].trim().replace(/[\*\_\`]/g, '');
        }

        headings.push(currentHeading);

        // Look ahead for description (first non-empty, non-heading line)
        if (!currentHeading.description) {
          for (let j = i + 1; j < lines.length; j++) {
            const descLine = lines[j].trim();
            if (descLine === '') continue;
            if (descLine.startsWith('#')) break;
            if (descLine.startsWith('**') || descLine.startsWith('__')) break;
            if (descLine.match(/!\[.*\]\(.*\)/)) continue;

            currentHeading.description = descLine.replace(/[\*\_\`]/g, '').trim();
            break;
          }
        }
      }
    }
  }

  // Associate images to headings respecting heading level boundaries
  for (let hIdx = 0; hIdx < headings.length; hIdx++) {
    const h = headings[hIdx];
    
    if (imageDirection === 'above') {
      // Find the preceding heading with level <= h.level
      let startLine = 0;
      for (let k = hIdx - 1; k >= 0; k--) {
        if (headings[k].level <= h.level) {
          startLine = headings[k].lineNumber;
          break;
        }
      }
      // Filter images inside [startLine, h.lineNumber] range
      h.images = images
        .filter(img => img.lineNumber > startLine && img.lineNumber < h.lineNumber)
        .map(img => img.url);
    } else {
      // Below (default)
      // Find the next heading with level <= h.level
      let endLine = lines.length;
      for (let k = hIdx + 1; k < headings.length; k++) {
        if (headings[k].level <= h.level) {
          endLine = headings[k].lineNumber;
          break;
        }
      }
      // Filter images inside [h.lineNumber, endLine] range
      h.images = images
        .filter(img => img.lineNumber > h.lineNumber && img.lineNumber < endLine)
        .map(img => img.url);
    }
  }

  // 3. Process each heading: Download first assigned image and Geocode
  const places = [];
  
  for (const h of headings) {
    if (h.name.length < 2 || h.name.length > 120) continue;

    const cleaned = cleanPlaceName(h.name);

    const place = {
      name: cleaned.clean,
      discarded: cleaned.discarded,
      type: 'place', // guessed below
      description: h.description,
      localImagePath: null,
      latitude: null,
      longitude: null,
      target_location: '', // Will hold City, Country
      geocodeSuccess: false,
      originalHeading: h.name,
      day: h.day || null
    };

    // Download first image if available
    if (h.images.length > 0) {
      const localPath = await downloadImage(h.images[0]);
      if (localPath) {
        place.localImagePath = localPath;
      }
    }

    // Geocode (using cleaned name & character count query logic!)
    const geocodeQuery = getGeocodeQuery(cleaned.clean);
    const coords = await geocode(geocodeQuery);
    if (coords) {
      place.latitude = coords.lat;
      place.longitude = coords.lon;
      place.geocodeSuccess = true;
      
      if (coords.city && coords.country) {
        place.target_location = `${coords.city}, ${coords.country}`;
      } else {
        place.target_location = coords.city || coords.country || '';
      }

      // Guess if it's a location (city/country) or a place
      const cleanLower = cleaned.clean.toLowerCase();
      const cityLower = (coords.city || '').toLowerCase();
      const countryLower = (coords.country || '').toLowerCase();
      if (cleanLower === cityLower || cleanLower === countryLower || cleanLower.includes(cityLower) && cityLower.length > 2) {
        place.type = 'location';
      }
    }

    places.push(place);
  }

  return {
    markdown,
    places
  };
}
