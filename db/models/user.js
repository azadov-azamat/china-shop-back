'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate({ SearchFilter, Subscription }) {}
  }

  User.init(
    {
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      phone: DataTypes.STRING,
      telegramId: DataTypes.BIGINT,
      telegramUsername: DataTypes.STRING,
      selectedLang: DataTypes.STRING,
      isAgreed: DataTypes.BOOLEAN,
      isBlocked: DataTypes.BOOLEAN,
      role: {
        type: DataTypes.ENUM('user', 'manager', 'merchant', 'admin'),
      },
    },
    {
      sequelize,
      modelName: 'User',
      underscored: true,
    }
  );

  return User;
};
