'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Comment extends Model {
    static associate({ User, Product }) {
      Comment.belongsTo(User, {
        as: 'user',
        foreignKey: 'user_id',
      });
      Comment.belongsTo(Product, {
        as: 'product',
        foreignKey: 'product_id',
      });
    }
  }
  Comment.init({
    rate: DataTypes.INTEGER,
    text: DataTypes.TEXT,
  }, {
    sequelize,
    modelName: 'Comment',
    underscored: true
  });
  return Comment;
};
