const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { results } = require('../utils/results.js');
const { onErrorReply, onErrorLog } = require('../utils/error.js');

const fetch = require('node-fetch');

const timeoutTime = 60000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('character')
        .setDescription('Gives you information about any character on MyAnimeList!')
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('The name of the character you want to look up.')
                .setRequired(true),
        ),
    async execute(interaction) {
        await interaction.deferReply();
        const q = interaction.options.getString('name');
        const query = new URLSearchParams({ q });

        const jikanResponse = await fetch(
            `https://api.jikan.moe/v4/characters?${query}&order_by=favorites&sort=desc&page=1`,
        ).then((response) => response.json());
        const { pagination } = jikanResponse;
        let { data } = jikanResponse;
        // let { pagination, data } = await fetch(
        //     `https://api.jikan.moe/v4/characters?${query}&order_by=favorites&sort=desc&page=1`
        // ).then((response) => response.json());

        let page = 1;
        let characterIndex = -1;
        if (data.length == 0) {
            interaction
                .editReply(`No results found for \`${q}\`.`)
                .then((msg) => {
                    setTimeout(() => msg.delete().catch((error) => { onErrorLog(error); }), 10000);
                })
                .catch((error) => {
                    onErrorReply(error, interaction);
                });
        } else {
            let output = results(data, 'name', q, 'character', pagination, page);
            interaction.editReply(output, { fetchReply: true }).then((message) => {
                if (pagination.last_visible_page > 1) {
                    message.react('⏪').then(() => message.react('⏩')).catch((error) => { onErrorLog(error); });
                    const reactionFilter = (reaction, user) => {
                        return (
                            ['⏪', '⏩'].includes(reaction.emoji.name) &&
                            user.id === interaction.user.id
                        );
                    };
                    const collector = message.createReactionCollector({
                        filter: reactionFilter,
                        time: timeoutTime,
                    });
                    collector.on('collect', async (reaction, user) => {
                        if (reaction.emoji.name === '⏩') {
                            if (pagination.last_visible_page > page) {
                                page++;
                                data = (
                                    await fetch(
                                        `https://api.jikan.moe/v4/characters?${query}&order_by=favorites&sort=desc&page=${page}`,
                                    ).then((response) => response.json())
                                )['data'];
                                output = results(data, 'name', q, 'character', pagination, page);
                                interaction
                                    .editReply(output)
                                    .catch((error) => {
                                        onErrorReply(error, interaction);
                                    });
                            }
                        } else if (page > 1) {
                            page--;
                            data = (
                                await fetch(
                                    `https://api.jikan.moe/v4/characters?${query}&order_by=favorites&sort=desc&page=${page}`,
                                ).then((response) => response.json())
                            )['data'];
                            output = results(data, 'name', q, 'character', pagination, page);
                            interaction
                                .editReply(output)
                                .catch((error) => {
                                    onErrorReply(error, interaction);
                                });
                        }
                        const userReactions = message.reactions.cache.filter((currentReaction) =>
                            currentReaction.users.cache.has(user.id),
                        );
                        try {
                            for (const currentReaction of userReactions.values()) {
                                await currentReaction.users.remove(user.id);
                            }
                        } catch (error) {
                            console.error('Failed to remove reactions.');
                        }
                    });
                    collector.on('end', (collected) => {
                        if (collected === 'time') {
                            interaction
                                .editReply('Timeout error, please try again')
                                .then((msg) => {
                                    msg.reaction.removeAll().catch((error) => { onErrorLog(error); });
                                    setTimeout(() => msg.delete().catch((error) => { onErrorLog(error); }), 10000);
                                })
                                .catch((error) => {
                                    onErrorReply(error, interaction);
                                    console.log('error was here');
                                });
                        }
                    });
                }
                const messageFilter = (m) => {
                    return m.author.id === interaction.user.id;
                };
                interaction.channel
                    .awaitMessages({
                        filter: messageFilter,
                        max: 1,
                        time: timeoutTime,
                        errors: ['time'],
                    })
                    .then((collected) => {
                        characterIndex = parseInt(collected.first().content);
                        if (
                            !isNaN(characterIndex) &&
                            characterIndex > 0 &&
                            characterIndex <= data.length
                        ) {
                            interaction
                                .editReply(`Loading result ${collected.first().content}...`)
                                .then(() => {
                                    const character = data[characterIndex - 1];
                                    const embed = new MessageEmbed()
                                        .setColor('#F37A12')
                                        .setTitle(character['name'])
                                        .setURL(character['url']);
                                    if (character['about'] == null) {
                                        embed.setDescription('N/A');
                                    } else if (character['about'].length < 35) {
                                        embed.setDescription(`Note: This description may contain spoilers. If you would still like to learn more about \`${character['name']}\`, please click the link above.`);
                                    } else if (character['about'].length > 4000) {
                                        embed.setDescription(character['about'].substring(0, 3950) + '...');
                                    } else {
                                        embed.setDescription(character['about']);
                                    }
                                    if (character['favorites'] == null) {
                                        embed.addField('Member Favorites', 'N/A', false);
                                    } else {
                                        embed.addField('Member Favorites', character['favorites'].toString(), false);
                                    }
                                    embed.setImage(character['images']['jpg']['image_url']);

                                    interaction.deleteReply().catch((error) => {
                                        onErrorReply(error, interaction);
                                    });
                                    interaction.channel.send({ embeds: [embed] }).catch((error) => {
                                        onErrorReply(error, interaction);
                                    });
                                })
                                .catch((error) => {
                                    onErrorReply(error, interaction);
                                });
                        } else if (collected.first().content.toLowerCase() === 'c') {
                            interaction
                                .editReply('The action was canceled.')
                                .then((msg) => {
                                    msg.reactions.removeAll().catch((error) => { onErrorLog(error); });
                                    setTimeout(() => msg.delete().catch((error) => { onErrorLog(error); }), 10000);
                                })
                                .catch((error) => {
                                    onErrorReply(error, interaction);
                                });
                        } else {
                            interaction
                                .editReply('An invalid input was provided. Please try again.')
                                .then((msg) => {
                                    msg.reactions.removeAll().catch((error) => { onErrorLog(error); });
                                    setTimeout(() => msg.delete().catch((error) => { onErrorLog(error); }), 10000);
                                })
                                .catch((error) => {
                                    onErrorReply(error, interaction);
                                });
                        }
                        collected.first().delete().catch((error) => { onErrorLog(error); });
                    })
                    .catch(() => {
                        interaction
                            .editReply('Timeout error, please try again')
                            .then((msg) => {
                                msg.reactions.removeAll().catch((error) => { onErrorLog(error); });
                                setTimeout(() => msg.delete().catch((error) => { onErrorLog(error); }), 10000);
                            })
                            .catch((error) => {
                                onErrorReply(error, interaction);
                                console.log('error was here');
                            });
                    });
            });
        }
    },
};