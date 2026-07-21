const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CONFIG = require('../config/layout-v4.json');

function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;

    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;

        h *= 60;
        if (h < 0) h += 360;
    }

    return {
        h,
        s: max === 0 ? 0 : d / max,
        v: max,
    };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;

    let h = 0;
    let s = 0;

    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));

        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);

        if (h < 0) h += 360;
    }

    return { h, s, l };
}

function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
    else if (hp < 2) [r1, g1, b1] = [x, c, 0];
    else if (hp < 3) [r1, g1, b1] = [0, c, x];
    else if (hp < 4) [r1, g1, b1] = [0, x, c];
    else if (hp < 5) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];

    const m = l - c / 2;

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

function inside(x, y, rect) {
    return x >= rect.x &&
        y >= rect.y &&
        x < rect.x + rect.width &&
        y < rect.y + rect.height;
}

function getZone(x, y) {
    return CONFIG.zones.find(zone => inside(x, y, zone)) ?? null;
}

function isPurpleAccent(hsv) {
    return hsv.s >= 0.20 &&
        hsv.v >= 0.12 &&
        hsv.h >= 245 &&
        hsv.h <= 330;
}

function isNeutralMetal(hsv) {
    return hsv.s <= 0.20 &&
        hsv.v >= 0.20;
}

function isExistingRarityColor(hsv) {
    const blue = hsv.s >= 0.25 && hsv.v >= 0.12 && hsv.h >= 185 && hsv.h <= 245;
    const red = hsv.s >= 0.25 && hsv.v >= 0.12 && (hsv.h <= 25 || hsv.h >= 340);
    const gold = hsv.s >= 0.25 && hsv.v >= 0.12 && hsv.h >= 25 && hsv.h <= 70;

    return blue || red || gold;
}

function shouldRecolor(zone, r, g, b) {
    const hsv = rgbToHsv(r, g, b);

    if (zone.mode === 'accent-only') {
        return isPurpleAccent(hsv) || isExistingRarityColor(hsv);
    }

    if (zone.mode === 'accent-and-metal') {
        return isPurpleAccent(hsv) ||
            isExistingRarityColor(hsv) ||
            isNeutralMetal(hsv);
    }

    return false;
}

function recolorPixel(r, g, b, targetHex, rarityName) {
    const target = hexToRgb(targetHex);
    const targetHsl = rgbToHsl(target.r, target.g, target.b);
    const original = rgbToHsl(r, g, b);

    if (rarityName === 'common') {
        const value = Math.max(
            0,
            Math.min(255, Math.round(original.l * 255 * 1.18)),
        );

        return {
            r: value,
            g: value,
            b: Math.min(255, value + 6),
        };
    }

    return hslToRgb(
        targetHsl.h,
        Math.max(0.62, targetHsl.s),
        Math.max(0.07, Math.min(0.88, original.l * 0.96 + 0.03)),
    );
}

function escapeXml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function buildOverlaySvg(width, height, rarityName) {
    const rarity = CONFIG.rarities[rarityName];
    const active = '★'.repeat(rarity.stars);
    const inactive = '☆'.repeat(5 - rarity.stars);

    return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.1" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <rect x="315" y="6" width="425" height="58" rx="8" fill="rgba(3,3,8,0.92)"/>
      <rect x="49" y="53" width="300" height="155" rx="8" fill="rgba(3,3,8,0.88)"/>

      <text x="${CONFIG.labels.top.x}" y="${CONFIG.labels.top.y}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="Arial Narrow, DejaVu Sans Condensed, sans-serif"
            font-size="${CONFIG.labels.top.fontSize}" font-weight="700"
            letter-spacing="2" fill="${rarity.color}" filter="url(#glow)">
        ${escapeXml(rarity.label)}
      </text>

      <text x="${CONFIG.labels.left.x}" y="${CONFIG.labels.left.y}"
            dominant-baseline="middle"
            font-family="Arial Narrow, DejaVu Sans Condensed, sans-serif"
            font-size="${CONFIG.labels.left.fontSize}" font-weight="700"
            letter-spacing="1.5" fill="${rarity.color}" filter="url(#glow)">
        ${escapeXml(rarity.label)}
      </text>

      <text x="${CONFIG.labels.stars.x}" y="${CONFIG.labels.stars.y}"
            dominant-baseline="middle"
            font-family="DejaVu Sans, sans-serif"
            font-size="${CONFIG.labels.stars.fontSize}"
            font-weight="700"
            letter-spacing="4"
            filter="url(#glow)">
        <tspan fill="#F5B800">${active}</tspan>
        <tspan fill="#454545">${inactive}</tspan>
      </text>
    </svg>
    `);
}

async function buildCard(inputPath, rarityName, outputPath) {
    const rarity = CONFIG.rarities[rarityName];

    if (!rarity) {
        throw new Error(`Unknown rarity: ${rarityName}`);
    }

    const { data, info } = await sharp(inputPath)
        .resize(CONFIG.width, CONFIG.height, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const zone = getZone(x, y);

            if (!zone) continue;

            const index = (y * info.width + x) * info.channels;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];

            if (a === 0 || !shouldRecolor(zone, r, g, b)) {
                continue;
            }

            const next = recolorPixel(
                r,
                g,
                b,
                rarity.color,
                rarityName,
            );

            data[index] = next.r;
            data[index + 1] = next.g;
            data[index + 2] = next.b;
        }
    }

    const overlay = buildOverlaySvg(
        info.width,
        info.height,
        rarityName,
    );

    await sharp(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: info.channels,
        }
    })
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

    console.log(`Saved: ${outputPath}`);
}

async function main() {
    const inputPath = process.argv[2];
    const rarityName = process.argv[3];
    const outputPath = process.argv[4];

    if (!inputPath || !rarityName) {
        console.log(
            'Usage: node scripts/build-card.js input/000003.png legendary output/000003_legendary.png',
        );
        process.exit(1);
    }

    const finalOutput = outputPath ??
        path.join(
            ROOT,
            'output',
            `${path.parse(inputPath).name}_${rarityName}.png`);

    fs.mkdirSync(path.dirname(finalOutput), { recursive: true });

    await buildCard(
        inputPath,
        rarityName,
        finalOutput,
    );
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    buildCard,
};
