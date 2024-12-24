'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ButtonTrack extends Model {
    static associate({ User }) {
      ButtonTrack.belongsTo(User, {
        as: 'user',
        foreignKey: 'user_id',
      });
    }
  }
  ButtonTrack.init({
    name: DataTypes.STRING,
    params: DataTypes.STRING,
    text: DataTypes.TEXT,
  }, {
    sequelize,
    modelName: 'ButtonTrack',
    underscored: true
  });
  return ButtonTrack;
};
