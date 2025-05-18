const { DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => { // sequelize instance-nı arqument kimi qəbul edin
    const ConnectedUser = sequelize.define('ConnectedUser', {
        discordId: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            primaryKey: true
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false
        },
        connectedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    });

    return ConnectedUser; // Modeli export edin
}; 
