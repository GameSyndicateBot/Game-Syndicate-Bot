const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

/**
 * Временный помощник.
 * Берёт готовую полную карточку и вырезает область арта.
 *
 * Это не финальный профессиональный вариант, но позволяет быстро перейти к движку:
 * кладёшь full-card PNG/JPG и получаешь cards/assets/arts/000XXX.png.
 *
 * ВАЖНО:
 * координаты настроены под вертикальную карточку 1024x1536.
 * Если у конкретной карты немного другой кроп — подправь CROP.
 */
const CROP = {
    x: 55,
    y: 120,
    width: 914,
    height: 720,
};

async function extractArt(inputPath, cardId) {
    const image = await loadImage(inputPath);

    const scaleX = image.width / 1024;
    const scaleY = image.height / 1536;

    const sx = Math.round(CROP.x * scaleX);
    const sy = Math.round(CROP.y * scaleY);
    const sw = Math.round(CROP.width * scaleX);
    const sh = Math.round(CROP.height * scaleY);

    const canvas = createCanvas(CROP.width, CROP.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, CROP.width, CROP.height);

    const outDir = path.join(__dirname, '..', 'assets', 'arts');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, `${cardId}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));

    console.log(`Saved art: ${outPath}`);
}

async function main() {
    const inputPath = process.argv[2];
    const cardId = process.argv[3];

    if (!inputPath || !cardId) {
        console.log('Usage: node cards/engine/extractArtFromFullCard.js ./full_000002.png 000002');
        process.exit(1);
    }

    await extractArt(inputPath, cardId);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    extractArt,
};

// ensure card saved
