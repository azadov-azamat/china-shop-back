'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Media extends Model {
    static associate({ Product, User, Company }) {
      Media.belongsTo(Product, { foreignKey: 'product_id', as: 'product', onDelete: 'CASCADE' });
      Media.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
    }
  }
  Media.init(
    {
      mediaType: DataTypes.ENUM('photo', 'video'),
      order: DataTypes.INTEGER,
      path: DataTypes.STRING,
      contentType: DataTypes.STRING,
      previewPath: DataTypes.STRING,
    },
    {
      sequelize,
      underscored: true,
      modelName: 'Media',
    }
  );
  return Media;
};
