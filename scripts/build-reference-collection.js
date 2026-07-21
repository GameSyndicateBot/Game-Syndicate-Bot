'use strict';

const fs = require('fs');
const path = require('path');

const { buildReferenceCard } = require('../images/cardBuilder/builder');
const { RARITIES } = require('../images/cardBuilder/template');

const INPUT = path.join(__dirname, '..', 'input');
const OUTPUT = path.join(__dirname, '..', 'output-reference');
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function getId(filename) {
    const match = path.parse(filename).name.match(/\d{1,6}/);
    return match ? match[0].padStart(6, '0') : null;
}

function score(name) {
    let value = 0;
    if (!name.includes('#U')) value += 100;
    if (!name.includes('%')) value += 20;
    if (/^[0-9]+\s/.test(name)) value += 10;
    if (/\.png$/i.test(name)) value += 5;
    return value;
}

function getUniqueSources() {
    const byId = new Map();

    for (const name of fs.readdirSync(INPUT)) {
        if (!EXTENSIONS.has(path.extname(name).toLowerCase())) continue;

        const id = getId(name);
        if (!id) continue;

        const candidate = { id, name, score: score(name) };
        const current = byId.get(id);

        if (!current || candidate.score > current.score) {
            byId.set(id, candidate);
        }
    }

    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
    const sources = getUniqueSources();

    if (!sources.length) {
        throw new Error('No numbered card images found in input.');
    }

    console.log(`Unique cards: ${sources.length}`);

    for (const source of sources) {
        const inputPath = path.join(INPUT, source.name);

        console.log(`\n[${source.id}] ${source.name}`);

        for (const rarity of RARITIES) {
            const outputPath = path.join(
                OUTPUT,
                source.id,
                `${source.id}_${rarity}.png`);

            await buildReferenceCard(inputPath, rarity, outputPath);
        }
    }

    console.log(`\nDone: ${sources.length * RARITIES.length} files.`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
