/**
 * Generates minimal placeholder PNG icons for PWA manifest.
 * Run: node scripts/generate-pwa-icons.js
 */
const fs = require('fs');
const path = require('path');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'images', 'icons');

fs.mkdirSync(iconsDir, { recursive: true });

sizes.forEach((size) => {
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), PNG_1x1);
});

fs.writeFileSync(
  path.join(iconsDir, 'README.txt'),
  'Replace these with your actual branded PNG icons at the sizes listed.\n' +
    'Use https://realfavicongenerator.net or https://maskable.app/editor\n' +
    'to generate all sizes from one master 512x512 image.\n'
);

const ogDefault = path.join(__dirname, '..', 'public', 'images', 'og-default.jpg');
const screenshot = path.join(__dirname, '..', 'public', 'images', 'screenshot-mobile.jpg');
if (fs.existsSync(ogDefault) && !fs.existsSync(screenshot)) {
  fs.copyFileSync(ogDefault, screenshot);
}

console.log(`Created ${sizes.length} placeholder icons in public/images/icons/`);
