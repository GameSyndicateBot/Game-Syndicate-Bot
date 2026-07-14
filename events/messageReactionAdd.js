const {
    getOrCreatePlayer,
    updatePlayer,
    updateDailyProgress,
} = require('../database/db');

const { checkAchievements } = require('../utils/checkAchievements');

module.exports = {
    name: 'messageReactionAdd',

    async execute(reaction, user) {
        if (user.bot) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Ошибка загрузки реакции:', error);
                return;
            }
        }

        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                console.error('Ошибка загрузки сообщения:', error);
                return;
            }
        }

        const message = reaction.message;
        if (!message.guild) return;

        let giver = getOrCreatePlayer(user);
        const giverMember = await message.guild.members.fetch(user.id).catch(() => null);

        giver.given_reactions = (giver.given_reactions ?? 0) + 1;

        updateDailyProgress(user.id, 'given_reactions', 1);

        if (giverMember) {
            const giverResult = await checkAchievements({
                message: {
                    author: user,
                    guild: message.guild,
                },
                player: giver,
                member: giverMember,
            });

            updatePlayer(giverResult.player);
        } else {
            updatePlayer(giver);
        }

        const author = message.author;

        if (!author || author.bot || author.id === user.id) return;

        let receiver = getOrCreatePlayer(author);
        const receiverMember = await message.guild.members.fetch(author.id).catch(() => null);

        receiver.received_reactions =
            (receiver.received_reactions ?? 0) + 1;

        updateDailyProgress(author.id, 'received_reactions', 1);

        if (receiverMember) {
            const receiverResult = await checkAchievements({
                message: {
                    author,
                    guild: message.guild,
                },
                player: receiver,
                member: receiverMember,
            });

            updatePlayer(receiverResult.player);
        } else {
            updatePlayer(receiver);
        }
    },
};