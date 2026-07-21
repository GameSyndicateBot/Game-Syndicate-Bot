
module.exports = {
  tank: {
    hp: 160,
    passive: (p) => p.damageReduction = 0.2
  }
  healer: {
    hp: 120,
    ability: (p) => ({ type: "heal", value: 40 })
  }
  assassin: {
    hp: 100,
    critChance: 0.3
  }
  mage: {
    hp: 110,
    ability: () => ({ type: "burn", value: 20, duration: 2 })
  }
};
