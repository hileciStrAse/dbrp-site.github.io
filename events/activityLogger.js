const ActivityService = require('../services/activityService');

module.exports = {
    name: 'activityLogger',
    async execute(client) {
        // İstifadəçi serverə qoşulduqda
        client.on('guildMemberAdd', async (member) => {
            await ActivityService.logActivity({
                userId: member.id,
                username: member.user.username,
                action: 'join',
                details: `${member.user.username} serverə qoşuldu`,
                serverId: member.guild.id
            });
        });

        // İstifadəçi serverdən ayrıldıqda
        client.on('guildMemberRemove', async (member) => {
            await ActivityService.logActivity({
                userId: member.id,
                username: member.user.username,
                action: 'leave',
                details: `${member.user.username} serverdən ayrıldı`,
                serverId: member.guild.id
            });
        });

        // Mesaj göndərildikdə
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            await ActivityService.logActivity({
                userId: message.author.id,
                username: message.author.username,
                action: 'message',
                details: `Mesaj göndərdi: ${message.content.substring(0, 100)}`,
                channelId: message.channel.id,
                channelName: message.channel.name,
                serverId: message.guild.id
            });
        });

        // Əmr istifadə edildikdə
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isCommand()) return;

            await ActivityService.logActivity({
                userId: interaction.user.id,
                username: interaction.user.username,
                action: 'command',
                details: `Əmr istifadə etdi: /${interaction.commandName}`,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                serverId: interaction.guild.id
            });
        });

        // İstifadəçi banlandıqda
        client.on('guildBanAdd', async (ban) => {
            await ActivityService.logActivity({
                userId: ban.user.id,
                username: ban.user.username,
                action: 'ban',
                details: `${ban.user.username} banlandı`,
                serverId: ban.guild.id
            });
        });

        // İstifadəçi kick edildikdə
        client.on('guildMemberRemove', async (member) => {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: 'MEMBER_KICK',
                limit: 1
            });
            
            const kickLog = auditLogs.entries.first();
            if (kickLog && kickLog.target.id === member.id) {
                await ActivityService.logActivity({
                    userId: member.id,
                    username: member.user.username,
                    action: 'kick',
                    details: `${member.user.username} kick edildi`,
                    serverId: member.guild.id
                });
            }
        });

        // Hər gün köhnə fəaliyyətləri təmizləmək
        setInterval(async () => {
            await ActivityService.cleanupOldActivities(30);
        }, 24 * 60 * 60 * 1000); // Hər 24 saatda bir
    }
}; 
