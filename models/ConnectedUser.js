const { DataTypes } = require('sequelize');
const sequelize = require('../server').sequelize; // sequelize instanceını server.js-dən import edin

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

module.exports = ConnectedUser; 
