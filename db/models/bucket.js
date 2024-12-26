'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Bucket extends Model {
    static associate({ User, Product }) {
      Bucket.belongsTo(User, {
        as: 'user',
        foreignKey: 'user_id',
      });
      Bucket.belongsTo(Product, {
        as: 'product',
        foreignKey: 'product_id',
      });
    }
  }
  Bucket.init({
    count: DataTypes.INTEGER,
    size: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'Bucket',
    underscored: true
  });
  return Bucket;
};
