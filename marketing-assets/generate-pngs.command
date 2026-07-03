#!/bin/bash
# Wherabouts Marketing PNG Generator
# Double-click this file to generate all 65 PNGs into this folder.

cd "$(dirname "$0")"
DIR="$(pwd)"

echo "============================================"
echo "  Wherabouts Marketing Asset PNG Generator"
echo "============================================"
echo ""

echo "Launching Chrome and rendering assets..."
echo ""

node - << 'NODEOF'
const puppeteer = require(process.cwd() + '/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

const DIR = process.cwd();
const RENDERER = 'file://' + path.join(DIR, 'renderer.html');

(async () => {
  // Find an available Chromium-based browser
  const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!chromePath) {
    console.error('ERROR: Could not find Chrome, Chromium, or Brave in /Applications.');
    process.exit(1);
  }
  console.log('Using browser:', chromePath);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--font-render-hinting=none',
    ],
  });

  const page = await browser.newPage();
  // Large viewport so nothing clips
  await page.setViewport({ width: 3000, height: 2000, deviceScaleFactor: 1 });

  console.log('Loading renderer...');
  await page.goto(RENDERER, { waitUntil: 'networkidle0', timeout: 90000 });
  // Extra wait for fonts
  await new Promise(r => setTimeout(r, 2000));

  const assets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-asset-id]')).map(el => ({
      id: el.dataset.assetId,
      name: el.dataset.assetName,
      w: parseInt(el.dataset.assetW),
      h: parseInt(el.dataset.assetH),
      label: el.dataset.assetLabel,
      section: el.dataset.assetSection,
    }))
  );

  console.log(`Found ${assets.length} assets. Generating PNGs...\n`);

  const errors = [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const outPath = path.join(DIR, asset.name + '.png');
    try {
      const el = await page.$(`[data-asset-id="${asset.id}"]`);
      if (!el) throw new Error('Element not found');

      // Scroll into view to avoid offscreen rendering issues
      await page.evaluate(id => {
        const el = document.querySelector(`[data-asset-id="${id}"]`);
        el.scrollIntoView({ block: 'center' });
      }, asset.id);
      await new Promise(r => setTimeout(r, 100));

      await el.screenshot({ path: outPath, type: 'png' });
      const size = fs.statSync(outPath).size;
      console.log(`[${i+1}/${assets.length}] ✓ ${asset.name}.png  (${(size/1024).toFixed(0)} KB)`);
    } catch (e) {
      console.error(`[${i+1}/${assets.length}] ✗ ${asset.name}: ${e.message}`);
      errors.push(asset.name);
    }
  }

  await browser.close();

  console.log('\n============================================');
  if (errors.length === 0) {
    console.log(`✅ Done! ${assets.length} PNGs saved to:`);
  } else {
    console.log(`⚠️  Done with ${errors.length} error(s). Successful PNGs saved to:`);
  }
  console.log('   ' + DIR);
  console.log('============================================');
})();
NODEOF

echo ""
echo "Press any key to close..."
read -n 1
