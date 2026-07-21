'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PROJECT_ROOT = path.join(__dirname, '..');
const CARDS_ROOT = path.join(PROJECT_ROOT, 'cards-v2');
const TEMPLATES_DIR = path.join(CARDS_ROOT, 'templates');
const OUTPUT_DIR = path.join(CARDS_ROOT, 'output');
const LAYOUT = require(path.join(CARDS_ROOT, 'layout.json'));
const RARITIES = require(path.join(CARDS_ROOT, 'rarities.json'));

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function wrapText(text, maxChars = 30) {
    const words = String(text ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;

        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        if (current) lines.push(current);
        current = word;
    }

    if (current) lines.push(current);
    return lines;
}

function textNode({
    x,
    y,
    text,
    size,
    fill,
    weight = 600,
    anchor = 'start',
    letterSpacing = 0,
}) {
    return `
        <text x="${x}" y="${y}"
              text-anchor="${anchor}"
              font-family="DejaVu Sans Condensed, Arial Narrow, Arial, sans-serif"
              font-size="${size}"
              font-weight="${weight}"
              letter-spacing="${letterSpacing}"
              fill="${fill}">
            ${escapeXml(text)}
        </text>
    `;
}

function multilineNode({
    x,
    y,
    lines,
    size,
    lineHeight,
    fill,
    weight = 400,
    maxLines = 10,
}) {
    return lines
        .slice(0, maxLines)
        .map((line, index) => textNode({
            x,
            y: y + index * lineHeight,
            text: line,
            size,
            fill,
            weight,
        }))
        .join('\n');
}

function resolveFromConfig(configPath, targetPath) {
    if (!targetPath) return null;
    if (path.isAbsolute(targetPath)) return targetPath;

    return path.resolve(path.dirname(configPath), targetPath);
}

function coverRect(rect, fill = '#07090C') {
    return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${fill}"/>`;
}

function normalizeId(value) {
    const raw = String(value ?? '').replace(/\D/g, '');

    if (!raw) {
        throw new Error('В JSON не указан корректный id карточки.');
    }

    return raw.padStart(6, '0');
}

function buildOverlay(card, rarityName) {
    const rarity = RARITIES[rarityName];

    if (!rarity) {
        throw new Error(
            `Неизвестная редкость: ${rarityName}. ` +
            'Допустимо: common, rare, epic, legendary, mythic.',
        );
    }

    const id = normalizeId(card.id);
    const t = LAYOUT.text;
    const c = LAYOUT.cover;

    const descriptionItems = Array.isArray(card.description)
        ? card.description
        : [card.description ?? ''];

    const descriptionLines = descriptionItems
        .flatMap(item => wrapText(item, 29))
        .slice(0, 10);

    const abilityLines = wrapText(
        card.abilityDescription ?? '',
        28,
    );

    return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${LAYOUT.canvas.width}"
         height="${LAYOUT.canvas.height}">

      ${coverRect(c.topNumber)}
      ${coverRect(c.name)}
      ${coverRect(c.role)}
      ${coverRect(c.leftInfo)}
      ${coverRect(c.specialization)}
      ${coverRect(c.ability)}
      ${coverRect(c.badge)}
      ${coverRect(c.serial)}

      ${textNode({
          x: t.number.x,
          y: t.number.y,
          text: `№${id.slice(-3)}`,
          size: t.number.size,
          fill: rarity.accent,
          weight: 800,
          anchor: 'middle',
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.name.x,
          y: t.name.y,
          text: card.name ?? '',
          size: t.name.size,
          fill: rarity.accent,
          weight: 800,
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.role.x,
          y: t.role.y,
          text: card.role ?? '',
          size: t.role.size,
          fill: rarity.secondary,
          weight: 700,
          letterSpacing: 1,
      })}

      ${multilineNode({
          x: t.description.x,
          y: t.description.y,
          lines: descriptionLines,
          size: t.description.size,
          lineHeight: t.description.lineHeight,
          fill: '#C7C7C7',
          maxLines: 10,
      })}

      ${textNode({
          x: t.specializationTitle.x,
          y: t.specializationTitle.y,
          text: 'СПЕЦИАЛИЗАЦИЯ',
          size: t.specializationTitle.size,
          fill: rarity.accent,
          weight: 800,
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.specialization.x,
          y: t.specialization.y,
          text: card.specialization ?? '',
          size: t.specialization.size,
          fill: '#D0D0D0',
          weight: 500,
      })}

      ${textNode({
          x: t.abilityTitle.x,
          y: t.abilityTitle.y,
          text: 'ОСОБЕННОСТЬ',
          size: t.abilityTitle.size,
          fill: rarity.accent,
          weight: 800,
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.ability.x,
          y: t.ability.y,
          text: card.ability ?? '',
          size: t.ability.size,
          fill: '#D9D9D9',
          weight: 800,
          letterSpacing: 1,
      })}

      ${multilineNode({
          x: t.abilityDescription.x,
          y: t.abilityDescription.y,
          lines: abilityLines,
          size: t.abilityDescription.size,
          lineHeight: t.abilityDescription.lineHeight,
          fill: '#C7C7C7',
          maxLines: 5,
      })}

      ${textNode({
          x: t.badge.x,
          y: t.badge.y,
          text: card.badge ?? '',
          size: t.badge.size,
          fill: rarity.accent,
          weight: 800,
          anchor: 'middle',
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.serialLabel.x,
          y: t.serialLabel.y,
          text: 'ЭКЗЕМПЛЯР',
          size: t.serialLabel.size,
          fill: rarity.accent,
          weight: 700,
          anchor: 'middle',
          letterSpacing: 1,
      })}

      ${textNode({
          x: t.serial.x,
          y: t.serial.y,
          text: `#${id}`,
          size: t.serial.size,
          fill: rarity.accent,
          weight: 800,
          anchor: 'middle',
          letterSpacing: 1,
      })}
    </svg>`);
}

async function prepareArt(card, configPath) {
    const artPath = resolveFromConfig(configPath, card.art);

    if (!artPath || !fs.existsSync(artPath)) {
        throw new Error(
            `Не найден арт карточки: ${artPath ?? 'путь не указан'}`,
        );
    }

    return sharp(artPath)
        .resize(
            LAYOUT.art.width,
            LAYOUT.art.height,
            {
                fit: 'cover',
                position: card.artPosition ?? 'centre',
            },
        )
        .png()
        .toBuffer();
}

async function createCard(configPath, rarityName) {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Не найден JSON: ${configPath}`);
    }

    const card = JSON.parse(
        fs.readFileSync(configPath, 'utf8'),
    );

    const id = normalizeId(card.id);
    const rarity = String(rarityName ?? card.rarity ?? 'common')
        .trim()
        .toLowerCase();

    if (!RARITIES[rarity]) {
        throw new Error(`Неизвестная редкость: ${rarity}`);
    }

    const templatePath = path.join(
        TEMPLATES_DIR,
        `${rarity}.png`,
    );

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Не найден шаблон: ${templatePath}`);
    }

    const art = await prepareArt(card, configPath);
    const overlay = buildOverlay(card, rarity);

    const outputPath = path.join(
        OUTPUT_DIR,
        id,
        `${id}_${rarity}.png`,
    );

    fs.mkdirSync(path.dirname(outputPath), {
        recursive: true,
    });

    await sharp(templatePath)
        .resize(
            LAYOUT.canvas.width,
            LAYOUT.canvas.height,
            { fit: 'fill' },
        )
        .composite([
            {
                input: art,
                left: LAYOUT.art.x,
                top: LAYOUT.art.y,
            },
            {
                input: overlay,
                left: 0,
                top: 0,
            },
        ])
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

    console.log(`Готово: ${outputPath}`);
}

async function main() {
    const configArg = process.argv[2];
    const rarityArg = process.argv[3];

    if (!configArg) {
        console.log(
            'Использование:\n' +
            'node scripts/createCard.js cards-v2/data/000002.json legendary',
        );
        process.exit(1);
    }

    const configPath = path.resolve(configArg);
    await createCard(configPath, rarityArg);
}

if (require.main === module) {
    main().catch(error => {
        console.error('\nОшибка генерации карточки:');
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    createCard,
};
