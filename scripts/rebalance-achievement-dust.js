const {
    rebalancePreviouslyUnlockedAchievements,
    calculateAchievementDust,
} = require('../utils/achievementDustEconomy');
const achievements = require('../data/achievements.json');

const result = rebalancePreviouslyUnlockedAchievements();

console.log('Achievement Dust economy:');
console.log(result);
console.log('');
console.log('Current reward range by rarity:');

for (const rarity of ['common', 'rare', 'epic', 'legendary', 'mythic']) {
    const values = achievements
        .filter(achievement => achievement.rarity === rarity)
        .map(calculateAchievementDust);

    if (!values.length) continue;

    console.log(
        `${rarity}: ${Math.min(...values)}–${Math.max(...values)} Dust`
    );
}
