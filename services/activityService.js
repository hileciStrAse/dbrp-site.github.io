const { Activity } = require('../models/Activity');
const { Op } = require('sequelize');

class ActivityService {
    // Yeni fəaliyyət əlavə etmək
    static async logActivity(data) {
        try {
            const activity = await Activity.create(data);
            return activity;
        } catch (error) {
            console.error('Fəaliyyət qeyd edilərkən xəta:', error);
            throw error;
        }
    }

    // Server üçün fəaliyyətləri əldə etmək
    static async getServerActivities(serverId, limit = 20, skip = 0) {
        try {
            const activities = await Activity.findAll({
                where: { serverId },
                order: [['timestamp', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(skip)
            });
            return activities;
        } catch (error) {
            console.error('Fəaliyyətlər əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // İstifadəçi üçün fəaliyyətləri əldə etmək
    static async getUserActivities(userId, serverId, limit = 50) {
        try {
            const activities = await Activity.findAll({
                where: { userId, serverId },
                order: [['timestamp', 'DESC']],
                limit: parseInt(limit)
            });
            return activities;
        } catch (error) {
            console.error('İstifadəçi fəaliyyətləri əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // Müəyyən bir fəaliyyət növü üçün statistikaları əldə etmək
    static async getActivityStats(serverId, action, timeRange = '24h') {
        try {
            const timeFilter = this.getTimeFilter(timeRange);
            return await Activity.aggregate([
                {
                    $match: {
                        serverId,
                        action,
                        timestamp: { $gte: timeFilter }
                    }
                },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        uniqueUsers: { $addToSet: '$userId' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        count: 1,
                        uniqueUsers: { $size: '$uniqueUsers' }
                    }
                }
            ]);
        } catch (error) {
            console.error('Fəaliyyət statistikaları əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // Köhnə fəaliyyətləri təmizləmək
    static async cleanupOldActivities(days = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            await Activity.destroy({
                where: {
                    timestamp: {
                        [Op.lt]: cutoffDate
                    }
                }
            });
        } catch (error) {
            console.error('Köhnə fəaliyyətlər təmizlənərkən xəta:', error);
            throw error;
        }
    }

    // Vaxt filtiri yaratmaq
    static getTimeFilter(timeRange) {
        const now = new Date();
        switch (timeRange) {
            case '1h':
                return new Date(now.setHours(now.getHours() - 1));
            case '24h':
                return new Date(now.setDate(now.getDate() - 1));
            case '7d':
                return new Date(now.setDate(now.getDate() - 7));
            case '30d':
                return new Date(now.setDate(now.getDate() - 30));
            default:
                return new Date(now.setDate(now.getDate() - 1));
        }
    }

    // Kanal üzrə fəaliyyətləri əldə etmək
    static async getChannelActivities(channelId, serverId, limit = 50) {
        try {
            const activities = await Activity.findAll({
                where: { channelId, serverId },
                order: [['timestamp', 'DESC']],
                limit: parseInt(limit)
            });
            return activities;
        } catch (error) {
            console.error('Kanal fəaliyyətləri əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // Server üzrə fəaliyyət statistikalarını əldə etmək
    static async getServerStats(serverId, timeRange = '24h') {
        try {
            const timeFilter = this.getTimeFilter(timeRange);
            return await Activity.aggregate([
                {
                    $match: {
                        serverId,
                        timestamp: { $gte: timeFilter }
                    }
                },
                {
                    $group: {
                        _id: '$action',
                        count: { $sum: 1 },
                        uniqueUsers: { $addToSet: '$userId' }
                    }
                },
                {
                    $project: {
                        action: '$_id',
                        count: 1,
                        uniqueUsers: { $size: '$uniqueUsers' },
                        _id: 0
                    }
                }
            ]);
        } catch (error) {
            console.error('Server statistikaları əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // İstifadəçi üzrə fəaliyyət statistikalarını əldə etmək
    static async getUserStats(userId, serverId, timeRange = '24h') {
        try {
            const timeFilter = this.getTimeFilter(timeRange);
            return await Activity.aggregate([
                {
                    $match: {
                        userId,
                        serverId,
                        timestamp: { $gte: timeFilter }
                    }
                },
                {
                    $group: {
                        _id: '$action',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        action: '$_id',
                        count: 1,
                        _id: 0
                    }
                }
            ]);
        } catch (error) {
            console.error('İstifadəçi statistikaları əldə edilərkən xəta:', error);
            throw error;
        }
    }

    // Bütün fəaliyyətləri silmək
    static async deleteAllActivities() {
        try {
            await Activity.destroy({
                where: {},
                truncate: true
            });
            return true;
        } catch (error) {
            console.error('Bütün fəaliyyətlər silinərkən xəta:', error);
            throw error;
        }
    }
}

module.exports = ActivityService; 
