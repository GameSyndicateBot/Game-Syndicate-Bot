'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const LAYOUT_PATH = path.join(ROOT, 'layout.json');
const RARITIES_PATH = path.join(ROOT, 'rarities.json');

const layout = require(LAYOUT_PATH);
const rarities = require(RARITIES_PATH);

const {
    wrapText,
    textNode,
    multilineNode,
} = require('./utils');

function resolveRelative(baseFile, targetPath) {
    if (!targetPath) return null;

    if (path.isAbsolute(targetPath)) {
        return targetPath;
    }

    return path.resolve(
        path.dirname(baseFile),
        targetPath,
    );
}

function coverRect(rect, fill = '#07090C') {
    return `
        <rect
            x="${rect.x}"
            y="${rect.y}"
            width="${rect.width}"
            height="${rect.height}"
            fill="${fill}"
        />
    `;
}

function buildTextOverlay(card, rarityName) {
    const rarity = rarities[rarityName];

    if (!rarity) {
        throw new Error(
            `Неизвестная редкость: ${rarityName}`,
        );
    }

    const accent = rarity.accent;
    const secondary = rarity.secondary;

    const text = layout.text;
    const cover = layout.cover;

    const descriptionSource = Array.isArray(card.description)
        ? card.description
        : [card.description ?? ''];

    const descriptionLines = descriptionSource
        .flatMap(item => wrapText(item, 29))
        .slice(0, 10);

    const abilityDescriptionLines = wrapText(
        card.abilityDescription ?? '',
        28,
    );

    return Buffer.from(`
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="${layout.canvas.width}"
            height="${layout.canvas.height}"
        >
            ${coverRect(cover.topNumber)}
            ${coverRect(cover.name)}
            ${coverRect(cover.role)}
            ${coverRect(cover.leftInfo)}
            ${coverRect(cover.specialization)}
            ${coverRect(cover.ability)}
            ${coverRect(cover.badge)}
            ${coverRect(cover.serial)}

            ${textNode({
                x: text.number.x,
                y: text.number.y,
                text: `№${String(card.id).slice(-3)}`,
                size: text.number.size,
                fill: accent,
                weight: 700,
                anchor: 'middle',
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.name.x,
                y: text.name.y,
                text: card.name ?? '',
                size: text.name.size,
                fill: accent,
                weight: 800,
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.role.x,
                y: text.role.y,
                text: card.role ?? '',
                size: text.role.size,
                fill: secondary,
                weight: 700,
                letterSpacing: 1,
            })}

            ${multilineNode({
                x: text.description.x,
                y: text.description.y,
                lines: descriptionLines,
                size: text.description.size,
                lineHeight: text.description.lineHeight,
                fill: '#C7C7C7',
                maxLines: 10,
            })}

            ${textNode({
                x: text.specializationTitle.x,
                y: text.specializationTitle.y,
                text: 'СПЕЦИАЛИЗАЦИЯ',
                size: text.specializationTitle.size,
                fill: accent,
                weight: 800,
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.specialization.x,
                y: text.specialization.y,
                text: card.specialization ?? '',
                size: text.specialization.size,
                fill: '#D0D0D0',
                weight: 500,
            })}

            ${textNode({
                x: text.abilityTitle.x,
                y: text.abilityTitle.y,
                text: 'ОСОБЕННОСТЬ',
                size: text.abilityTitle.size,
                fill: accent,
                weight: 800,
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.ability.x,
                y: text.ability.y,
                text: card.ability ?? '',
                size: text.ability.size,
                fill: '#D9D9D9',
                weight: 800,
                letterSpacing: 1,
            })}

            ${multilineNode({
                x: text.abilityDescription.x,
                y: text.abilityDescription.y,
                lines: abilityDescriptionLines,
                size: text.abilityDescription.size,
                lineHeight: text.abilityDescription.lineHeight,
                fill: '#C7C7C7',
                maxLines: 5,
            })}

            ${textNode({
                x: text.badge.x,
                y: text.badge.y,
                text: card.badge ?? '',
                size: text.badge.size,
                fill: accent,
                weight: 800,
                anchor: 'middle',
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.serialLabel.x,
                y: text.serialLabel.y,
                text: 'ЭКЗЕМПЛЯР',
                size: text.serialLabel.size,
                fill: accent,
                weight: 700,
                anchor: 'middle',
                letterSpacing: 1,
            })}

            ${textNode({
                x: text.serial.x,
                y: text.serial.y,
                text: `#${String(card.id).padStart(6, '0')}`,
                size: text.serial.size,
                fill: accent,
                weight: 800,
                anchor: 'middle',
                letterSpacing: 1,
            })}
        </svg>
    `);
}

async function prepareArt(card, dataFile) {
    const directArt = resolveRelative(
        dataFile,
        card.art,
    );

    if (directArt && fs.existsSync(directArt)) {
        return sharp(directArt)
            .resize(
                layout.art.width,
                layout.art.height,
                {
                    fit: 'cover',
                    position: 'centre',
                },
            )
            .png()
            .toBuffer();
    }

    const legacySource = resolveRelative(
        dataFile,
        card.legacySource,
    );

    if (!legacySource || !fs.existsSync(legacySource)) {
        throw new Error(
            [
                'Не найден арт карточки.',
                `art: ${directArt ?? 'не указан'}`,
                `legacySource: ${legacySource ?? 'не указан'}`,
            ].join('\n'),
        );
    }

    const crop = card.legacyCrop ??
        layout.defaultLegacyCrop;

    return sharp(legacySource)
        .extract({
            left: crop.x,
            top: crop.y,
            width: crop.width,
            height: crop.height,
        })
        .resize(
            layout.art.width,
            layout.art.height,
            {
                fit: 'cover',
                position: 'centre',
            },
        )
        .png()
        .toBuffer();
}

async function renderCard(
    dataFile,
    rarityName,
    outputPath,
) {
    if (!fs.existsSync(dataFile)) {
        throw new Error(
            `Не найден JSON карточки:\n${dataFile}`,
        );
    }

    const card = JSON.parse(
        fs.readFileSync(dataFile, 'utf8'),
    );

    const rarity = rarities[rarityName];

    if (!rarity) {
        throw new Error(
            `Неизвестная редкость: ${rarityName}`,
        );
    }

    const templatePath = path.join(
        ROOT,
        'templates',
        `${rarityName}.png`,
    );

    if (!fs.existsSync(templatePath)) {
        throw new Error(
            `Не найден шаблон:\n${templatePath}`,
        );
    }

    const artBuffer = await prepareArt(
        card,
        dataFile,
    );

    const textOverlay = buildTextOverlay(
        card,
        rarityName,
    );

    fs.mkdirSync(
        path.dirname(outputPath),
        {
            recursive: true,
        },
    );

    await sharp(templatePath)
        .resize(
            layout.canvas.width,
            layout.canvas.height,
            {
                fit: 'fill',
            },
        )
        .composite([
            {
                input: artBuffer,
                left: layout.art.x,
                top: layout.art.y,
            },
            {
                input: textOverlay,
                left: 0,
                top: 0,
            },
        ])
        .png({
            compressionLevel: 9,
        })
        .toFile(outputPath);
}

module.exports = {
    renderCard,
};
// ensure card saved
