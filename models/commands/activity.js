const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ActivityService = require('../services/activityService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fəaliyyət')
        .setDescription('Server fəaliyyətlərini idarə etmək üçün əmrlər')
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Server fəaliyyətlərini göstərir')
                .addStringOption(option =>
                    option.setName('vaxt')
                        .setDescription('Fəaliyyətlərin vaxt aralığı')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Son 1 saat', value: '1h' },
                            { name: 'Son 24 saat', value: '24h' },
                            { name: 'Son 7 gün', value: '7d' },
                            { name: 'Son 30 gün', value: '30d' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('istifadəçi')
                .setDescription('İstifadəçi fəaliyyətlərini göstərir')
                .addUserOption(option =>
                    option.setName('istifadəçi')
                        .setDescription('Fəaliyyətləri görüntülənəcək istifadəçi')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('vaxt')
                        .setDescription('Fəaliyyətlərin vaxt aralığı')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Son 1 saat', value: '1h' },
                            { name: 'Son 24 saat', value: '24h' },
                            { name: 'Son 7 gün', value: '7d' },
                            { name: 'Son 30 gün', value: '30d' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kanal')
                .setDescription('Kanal fəaliyyətlərini göstərir')
                .addChannelOption(option =>
                    option.setName('kanal')
                        .setDescription('Fəaliyyətləri görüntülənəcək kanal')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('statistika')
                .setDescription('Server statistikalarını göstərir')
                .addStringOption(option =>
                    option.setName('vaxt')
                        .setDescription('Statistikaların vaxt aralığı')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Son 1 saat', value: '1h' },
                            { name: 'Son 24 saat', value: '24h' },
                            { name: 'Son 7 gün', value: '7d' },
                            { name: 'Son 30 gün', value: '30d' }
                        )
                )
        ),

    async execute(interaction) {
        // Yalnız admin və ya moderatorlar əmrləri istifadə edə bilər
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ Bu əmri istifadə etmək üçün serveri idarə etmə icazəniz olmalıdır.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const timeRange = interaction.options.getString('vaxt') || '24h';

        try {
            switch (subcommand) {
                case 'server': {
                    const activities = await ActivityService.getServerActivities(interaction.guild.id, 10);
                    const embed = new EmbedBuilder()
                        .setTitle('📊 Server Fəaliyyətləri')
                        .setColor('#00c8ff')
                        .setDescription(`Son ${timeRange} ərzində server fəaliyyətləri:`)
                        .setTimestamp();

                    activities.forEach(activity => {
                        embed.addFields({
                            name: `${activity.username} - ${activity.action}`,
                            value: `${activity.details}\n${new Date(activity.timestamp).toLocaleString('az-AZ')}`,
                            inline: false
                        });
                    });

                    await interaction.reply({ embeds: [embed] });
                    break;
                }

                case 'istifadəçi': {
                    const user = interaction.options.getUser('istifadəçi');
                    const activities = await ActivityService.getUserActivities(user.id, interaction.guild.id, 10);
                    const stats = await ActivityService.getUserStats(user.id, interaction.guild.id, timeRange);

                    const embed = new EmbedBuilder()
                        .setTitle(`👤 ${user.username} - Fəaliyyətlər`)
                        .setColor('#00c8ff')
                        .setDescription(`Son ${timeRange} ərzində fəaliyyətlər:`)
                        .setThumbnail(user.displayAvatarURL())
                        .setTimestamp();

                    // Statistikaları əlavə et
                    if (stats.length > 0) {
                        const statsText = stats.map(stat => 
                            `${stat.action}: ${stat.count} dəfə`
                        ).join('\n');
                        embed.addFields({ name: '📈 Statistikalar', value: statsText, inline: false });
                    }

                    // Son fəaliyyətləri əlavə et
                    activities.forEach(activity => {
                        embed.addFields({
                            name: `${activity.action}`,
                            value: `${activity.details}\n${new Date(activity.timestamp).toLocaleString('az-AZ')}`,
                            inline: false
                        });
                    });

                    await interaction.reply({ embeds: [embed] });
                    break;
                }

                case 'kanal': {
                    const channel = interaction.options.getChannel('kanal');
                    const activities = await ActivityService.getChannelActivities(channel.id, interaction.guild.id, 10);

                    const embed = new EmbedBuilder()
                        .setTitle(`📝 ${channel.name} - Kanal Fəaliyyətləri`)
                        .setColor('#00c8ff')
                        .setDescription('Son kanal fəaliyyətləri:')
                        .setTimestamp();

                    activities.forEach(activity => {
                        embed.addFields({
                            name: `${activity.username} - ${activity.action}`,
                            value: `${activity.details}\n${new Date(activity.timestamp).toLocaleString('az-AZ')}`,
                            inline: false
                        });
                    });

                    await interaction.reply({ embeds: [embed] });
                    break;
                }

                case 'statistika': {
                    const stats = await ActivityService.getServerStats(interaction.guild.id, timeRange);

                    const embed = new EmbedBuilder()
                        .setTitle('📊 Server Statistikaları')
                        .setColor('#00c8ff')
                        .setDescription(`Son ${timeRange} ərzində server statistikaları:`)
                        .setTimestamp();

                    stats.forEach(stat => {
                        embed.addFields({
                            name: `${stat.action}`,
                            value: `Say: ${stat.count}\nUnikal İstifadəçilər: ${stat.uniqueUsers}`,
                            inline: true
                        });
                    });

                    await interaction.reply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Fəaliyyət əmri xətası:', error);
            await interaction.reply({
                content: '❌ Fəaliyyətlər əldə edilərkən xəta baş verdi.',
                ephemeral: true
            });
        }
    }
}; 
