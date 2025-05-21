const mongoose = require('mongoose');

const GuildConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    statsChannelId: {
        type: String,
        default: null
    },
    salaryChannelId: {
        type: String,
        default: null // 'disable' dəyəri də burada saxlanıla bilər və ya null olaraq qalıb frontenddə idarə edilə bilər
    },
    presidentRoleId: {
        type: String,
        default: null
    },
    // Gələcəkdə əlavə edilə biləcək digər ayarlar
    // Məsələn: prefix, welcomeMessage, etc.
});

module.exports = mongoose.model('GuildConfig', GuildConfigSchema);