const fs = require('fs');
const path = require('path');

const cardsPath = path.join(__dirname, '..', 'data', 'cards.json');

function addCard(card) {
    const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

    if (cards.some(item => item.id === card.id)) {
        throw new Error(`Card ${card.id} already exists`);
    }

    cards.push(card);
    cards.sort((a, b) => a.id.localeCompare(b.id));

    fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 4), 'utf8');
}

function main() {
    const example = {
        id: '000003',
        name: 'ИМЯ',
        subtitle: 'РОЛЬ',
        badge: 'STAFF',
        typeIcon: 'shield',
        specialization: 'Специализация',
        ability: 'ОСОБЕННОСТЬ',
        abilityDescription: 'Описание особенности.',
        description: [
            'Строка описания 1.',
            'Строка описания 2.',
            'Строка описания 3.'
        ],
        art: '000003.png'
    };

    console.log('Скопируй этот JSON, поменяй данные и добавь в cards/data/cards.json:');
    console.log(JSON.stringify(example, null, 4));
}

if (require.main === module) {
    main();
}

module.exports = {
    addCard,
};

// ensure card saved
