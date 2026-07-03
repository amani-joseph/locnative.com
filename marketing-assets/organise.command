#!/bin/bash
# Organise Wherabouts PNGs into platform subfolders
cd "$(dirname "$0")"

node - << 'NODEOF'
const fs = require('fs');
const path = require('path');

const BASE = process.cwd();

// Rules: folder → patterns (array of regex strings, first match wins)
const rules = [
  ['instagram',      [/instagram/i]],
  ['x-twitter',      [/x-twitter/i]],
  ['linkedin',       [/linkedin/i]],
  ['youtube',        [/youtube/i]],
  ['facebook',       [/facebook/i]],
  ['github',         [/github/i]],
  ['display-banners',[/medium-rectangle|wide-skyscraper|leaderboard/i]],
  ['email',          [/email-header/i]],
  ['dev-blog',       [/dev-to|hashnode/i]],
  ['hero-og',        [/hero|og-master|one-api|stripe-for/i]],
  ['logo-brand',     [/primary-lockup|stacked-lockup|reverse-on|clear-space|mark-only|on-light-[^2]/i]],
  ['profile-avatar', [/app-icon|avatar|circular-crop|favicon|team-monogram/i]],
  ['icons',          [/grid-stroke|product-endpoint|pin-location|on-light-2-tone/i]],
  ['founder-posts',  [/founder-post/i]],
];

const pngs = fs.readdirSync(BASE).filter(f => f.endsWith('.png'));
console.log(`\nFound ${pngs.length} PNGs to organise.\n`);

const counts = {};
const unmatched = [];

for (const fname of pngs) {
  let dest = null;
  for (const [folder, patterns] of rules) {
    if (patterns.some(p => p.test(fname))) {
      dest = folder;
      break;
    }
  }

  if (!dest) {
    unmatched.push(fname);
    dest = 'misc';
  }

  const destDir = path.join(BASE, dest);
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(path.join(BASE, fname), path.join(destDir, fname));
  counts[dest] = (counts[dest] || 0) + 1;
}

console.log('Files organised by folder:');
const total = Object.values(counts).reduce((a, b) => a + b, 0);
for (const [folder, count] of Object.entries(counts).sort()) {
  console.log(`  ${folder.padEnd(20)} ${count} files`);
}
if (unmatched.length) {
  console.log(`\nIn misc/ (unmatched): ${unmatched.join(', ')}`);
}
console.log(`\n✅ Done! ${total} PNGs organised into ${Object.keys(counts).length} folders.`);
NODEOF

echo ""
echo "Press any key to close..."
read -n 1
