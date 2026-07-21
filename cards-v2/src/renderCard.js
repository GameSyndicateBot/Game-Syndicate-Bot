'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const layout = require('../layout.json');
const rarities = require('../rarities.json');
const cards = require('../cards.json');
const {
    wrapText,
    textNode,
    multilineNode,
} = require('./utils');

function coverRect(rect, fill = '#07090C') {
    return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${fill}"/>`;
}

function resolveCard(id) {
    const normalized = String(id).padStart(6, '0');
    const card = cards.find(item => item.id === normalized);

    if (!card) {
        throw new Error(`Card not found: ${normalized}`);
    }

    return card;
}

function buildTextOverlay(card, rarityName) {
    const rarity = rarities[rarityName];
    const text = layout.text;
    const cover = layout.cover;

    const descriptionLines = (
        Array.isArray(card.description)
            ? card.description
            : [card.description ?? '']
    )
        .flatMap(item => wrapText(item, 29))
        .slice(0, 10);

    const abilityLines = wrapText(
        card.abilityDescription ?? '',
        28,
    );

    return Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg"
             width="${layout.canvas.width}"
             height="${layout.canvas.height}">
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
                text: `№${card.id.slice(-3)}`,
                size: text.number.size,
                fill: rarity.accent,
                weight: 700,
                anchor: 'middle',
            })}

            ${textNode({
                x: text.name.x,
                y: text.name.y,
                text: card.name,
                size: text.name.size,
                fill: rarity.accent,
                weight: 800,
            })}

            ${textNode({
                x: text.role.x,
                y: text.role.y,
                text: card.role,
                size: text.role.size,
                fill: rarity.secondary,
                weight: 700,
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
                fill: rarity.accent,
                weight: 800,
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
                fill: rarity.accent,
                weight: 800,
            })}

            ${textNode({
                x: text.ability.x,
                y: text.ability.y,
                text: card.ability ?? '',
                size: text.ability.size,
                fill: '#D9D9D9',
                weight: 800,
            })}

            ${multilineNode({
                x: text.abilityDescription.x,
                y: text.abilityDescription.y,
                lines: abilityLines,
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
                fill: rarity.accent,
                weight: 800,
                anchor: 'middle',
            })}

            ${textNode({
                x: text.serialLabel.x,
                y: text.serialLabel.y,
                text: 'ЭКЗЕМПЛЯР',
                size: text.serialLabel.size,
                fill: rarity.accent,
                weight: 700,
                anchor: 'middle',
            })}

            ${textNode({
                x: text.serial.x,
                y: text.serial.y,
                text: `#${card.id}`,
                size: text.serial.size,
                fill: rarity.accent,
                weight: 800,
                anchor: 'middle',
            })}
        </svg>
    `);
}

async function prepareArt(card) {
    const directArt = path.join(ROOT, card.art);

    if (fs.existsSync(directArt)) {
        return sharp(directArt)
            .resize(
                layout.art.width,
                layout.art.height,
                { fit: 'cover' }
            )
            .png()
            .toBuffer();
    }

    if (!card.legacySource) {
        throw new Error(`Art missing for ${card.id}`);
    }

    const legacySource = path.resolve(
        ROOT,
        card.legacySource,
    );
    const crop = card.legacyCrop ?? layout.defaultLegacyCrop;

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
            { fit: 'cover' }
        )
        .png()
        .toBuffer();
}

async function renderCard(id, rarityName, outputPath) {
    if (!rarities[rarityName]) {
        throw new Error(`Unknown rarity: ${rarityName}`);
    }

    const card = resolveCard(id);
    const templatePath = path.join(
        ROOT,
        'templates',
        `${rarityName}.png`);

    const artBuffer = await prepareArt(card);
    const textOverlay = buildTextOverlay(
        card,
        rarityName,
    );

    fs.mkdirSync(
        path.dirname(outputPath),
        { recursive: true }
    );

    await sharp(templatePath)
        .resize(
            layout.canvas.width,
            layout.canvas.height,
            { fit: 'fill' }
        )
        .composite([
            {
                input: artBuffer,
                left: layout.art.x,
                top: layout.art.y,
            }
            {
                input: textOverlay,
                left: 0,
                top: 0,
            }
        ])
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

    console.log(`Saved: ${outputPath}`);
}

module.exports = {
    renderCard,
};
