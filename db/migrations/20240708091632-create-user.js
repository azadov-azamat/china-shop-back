'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      first_name: {
        type: Sequelize.STRING,
      },
      last_name: {
        type: Sequelize.STRING,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      telegram_id: { type: Sequelize.BIGINT },
      telegram_username: { type: Sequelize.STRING },
      selected_lang: { type: Sequelize.STRING },
      is_blocked: Sequelize.BOOLEAN,
      is_agreed: Sequelize.BOOLEAN,
      role: {
        type: Sequelize.ENUM(
          'admin',
          'user',
          'manager',
          'merchant',
        ),
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  }
};
