/**
 * One-time utility: rasterize payment SVG sources to PNG for static <img> tags.
 * Run: node scripts/generate-payment-pngs.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PAYMENTS_DIR = path.join(__dirname, '..', 'public', 'images', 'payments');
const FILES = ['bkash', 'nagad', 'visa', 'mastercard', 'cod'];

async function generate() {
    if (!fs.existsSync(PAYMENTS_DIR)) {
        fs.mkdirSync(PAYMENTS_DIR, { recursive: true });
    }

    for (const name of FILES) {
        const svgPath = path.join(PAYMENTS_DIR, `${name}.svg`);
        const pngPath = path.join(PAYMENTS_DIR, `${name}.png`);
        if (!fs.existsSync(svgPath)) {
            console.warn(`Skip missing SVG: ${svgPath}`);
            continue;
        }
        await sharp(svgPath)
            .resize(240, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ compressionLevel: 9 })
            .toFile(pngPath);
        console.log(`Created ${pngPath}`);
    }
}

generate().catch((err) => {
    console.error(err);
    process.exit(1);
});
