const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    discriminator: String,
    avatar: String,
    guilds: Array,
    lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);