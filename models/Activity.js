const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: ['join', 'leave', 'message', 'command', 'role_change', 'ban', 'kick', 'mute']
    },
    details: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: false
    },
    channelName: {
        type: String,
        required: false
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    serverId: {
        type: String,
        required: true,
        index: true
    }
});

// 30 gün sonra avtomatik silmə
activitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity; 
