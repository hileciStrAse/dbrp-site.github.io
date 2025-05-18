module.exports = (sequelize, DataTypes) => {
    const Activity = sequelize.define('Activity', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false
        },
        action: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isIn: [['join', 'leave', 'message', 'command', 'role_change', 'ban', 'kick', 'mute']]
            }
        },
        details: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        channelId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        channelName: {
            type: DataTypes.STRING,
            allowNull: true
        },
        serverId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        indexes: [
            {
                fields: ['userId']
            },
            {
                fields: ['serverId']
            },
            {
                fields: ['timestamp']
            }
        ]
    });

    return Activity;
}; 
