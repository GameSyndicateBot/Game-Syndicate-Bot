'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
    CARD_SIZE,
    RARITIES,
    getTemplatePath,
} = require('./template');

const TARGETS = Object.freeze({
    common: { label: 'COMMON', stars: 1, rgb: [185, 189, 197] }
    rare: { label: 'RARE', stars: 2, rgb: [0, 107, 255] }
    epic: { label: 'EPIC', stars: 3, rgb: [168, 85, 247] }
    legendary: { label: 'LEGENDARY', stars: 4, rgb: [245, 184, 0] }
    mythic: { label: 'MYTHIC', stars: 5, rgb: [239, 43, 43] }
});

// Zones that belong to rarity styling. The information panel is deliberately excluded,
// therefore grey text and purple icons stay untouched on every rarity.
const STYLE_ZONES = Object.freeze([
    { x: 0, y: 0, width: 1054, height: 210 }
    { x: 0, y: 0, width: 58, height: 1492 }
    { x: 996, y: 0, width: 58, height: 1492 }
    { x: 0, y: 845, width: 1054, height: 205 }
    { x: 0, y: 1342, width: 1054, height: 150 }
]);

// Only the universal outer contour is taken from template 000001.
const TEMPLATE_FRAME_ZONES = Object.freeze([
    { x: 0, y: 0, width: 1054, height: 74 }
    { x: 0, y: 0, width: 38, height: 1492 }
    { x: 1016, y: 0, width: 38, height: 1492 }
]);

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function inside(x, y, rect) {
    return x >= rect.x && y >= rect.y &&
        x < rect.x + rect.width && y < rect.y + rect.height;
}

function isStylePixel(x, y) {
    return STYLE_ZONES.some(rect => inside(x, y, rect));
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

function hsvToRgb(h, s, v) {
    const c = v * s;
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

    const m = v - c;

    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255),
    ];
}

function circularHueDistance(a, b) {
    const d = Math.abs(a - b);
    return Math.min(d, 360 - d);
}

function detectSourceAccent(data, info) {
    const histogram = new Array(72).fill(0);

    // Read only frame/header regions, never the art or information panel.
    for (let y = 0; y < info.height; y += 2) {
        for (let x = 0; x < info.width; x += 2) {
            if (!isStylePixel(x, y)) continue;

            const i = (y * info.width + x) * info.channels;
            const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);

            if (hsv.s < 0.35 || hsv.v < 0.18) continue;

            histogram[Math.floor(hsv.h / 5) % histogram.length] += hsv.s * hsv.v;
        }
    }

    let best = 0;

    for (let i = 1; i < histogram.length; i++) {
        if (histogram[i] > histogram[best]) best = i;
    }

    return best * 5 + 2.5;
}

function shouldRecolor(hsv, sourceHue) {
    if (hsv.s < 0.24 || hsv.v < 0.12) return false;

    // Recolor only the card's current rarity accent. This prevents random purple
    // artwork and purple icons inside the information block from changing.
    return circularHueDistance(hsv.h, sourceHue) <= 28;
}

function recolor(hsv, rarity) {
    if (rarity === 'common') {
        const value = Math.max(0.20, Math.min(0.92, hsv.v * 1.04));
        const neutral = Math.round(value * 255);
        return [neutral, neutral, Math.min(255, neutral + 6)];
    }

    const target = TARGETS[rarity].rgb;
    const targetHsv = rgbToHsv(...target);

    // Preserve original brightness/metal highlights, replace hue and saturation.
    return hsvToRgb(
        targetHsv.h,
        Math.max(0.64, targetHsv.s),
        Math.max(0.10, Math.min(0.96, hsv.v)),
    );
}

function maskSvg(rects) {
    const shapes = rects
        .map(rect => `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="white"/>`)
        .join('');

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE.width}" height="${CARD_SIZE.height}">` +
        `<rect width="100%" height="100%" fill="rgba(0,0,0,0)"/>${shapes}</svg>`);
}

async function buildTemplateFrame(rarity) {
    const templatePath = getTemplatePath(rarity);

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template missing: ${templatePath}`);
    }

    return sharp(templatePath)
        .resize(CARD_SIZE.width, CARD_SIZE.height, { fit: 'fill' })
        .ensureAlpha()
        .composite([{ input: maskSvg(TEMPLATE_FRAME_ZONES), blend: 'dest-in' }])
        .png()
        .toBuffer();
}

function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function labelsSvg(rarity) {
    const config = TARGETS[rarity];
    const color = `rgb(${config.rgb.join(',')})`;
    const active = '★'.repeat(config.stars);
    const inactive = '☆'.repeat(5 - config.stars);

    return Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1054" height="1492">
            <defs>
                <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <rect x="315" y="4" width="424" height="62" rx="8" fill="rgba(3,3,8,.92)"/>
            <rect x="48" y="48" width="305" height="160" rx="8" fill="rgba(3,3,8,.88)"/>
            <text x="527" y="42" text-anchor="middle" dominant-baseline="middle" font-family="Arial Narrow, Arial, sans-serif" font-size="31" font-weight="700" letter-spacing="2" fill="${color}" filter="url(#glow)">${escapeXml(config.label)}</text>
            <text x="125" y="100" dominant-baseline="middle" font-family="Arial Narrow, Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="1.5" fill="${color}" filter="url(#glow)">${escapeXml(config.label)}</text>
            <text x="66" y="146" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="4" filter="url(#glow)"><tspan fill="#F5B800">${active}</tspan><tspan fill="#454545">${inactive}</tspan></text>
        </svg>
    `);
}

async function buildReferenceCard(inputPath, rarity, outputPath) {
    if (!RARITIES.includes(rarity)) {
        throw new Error(`Unknown rarity: ${rarity}`);
    }

    ensureDir(path.dirname(outputPath));

    const { data, info } = await sharp(inputPath)
        .resize(CARD_SIZE.width, CARD_SIZE.height, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const sourceHue = detectSourceAccent(data, info);

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (!isStylePixel(x, y)) continue;

            const i = (y * info.width + x) * info.channels;
            const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);

            if (!shouldRecolor(hsv, sourceHue)) continue;

            const next = recolor(hsv, rarity);
            data[i] = next[0];
            data[i + 1] = next[1];
            data[i + 2] = next[2];
        }
    }

    const frame = await buildTemplateFrame(rarity);

    await sharp(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: info.channels,
        }
    })
        .composite([
            { input: frame, left: 0, top: 0, blend: 'over' }
            { input: labelsSvg(rarity), left: 0, top: 0, blend: 'over' }
        ])
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

    console.log(`Adaptive build saved: ${outputPath}; source hue=${sourceHue.toFixed(1)}`);
}

module.exports = {
    buildReferenceCard,
};
