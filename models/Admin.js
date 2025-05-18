const { DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    const Admin = sequelize.define('Admin', {
        discordId: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            primaryKey: true
        }
    });

    return Admin;
}; 
