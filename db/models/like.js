'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Like extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate({ Product, User }) {
      Like.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
      Like.belongsTo(Product, { foreignKey: 'product_id', as: 'product', onDelete: 'CASCADE' });
    }
  }
  Like.init(
    {
      liked: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      underscored: true,
      modelName: 'Like',
    }
  );

  return Like;
};
