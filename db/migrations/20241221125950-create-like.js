'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
        'likes',
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          owner_id: {
            type: Sequelize.INTEGER,
            references: {
              model: 'users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          product_id: {
            type: Sequelize.INTEGER,
            references: {
              model: 'products',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          liked: {
            defaultValue: true,
            type: Sequelize.BOOLEAN,
          },
          created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("(now() at time zone 'utc')"),
          },
          updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal("(now() at time zone 'utc')"),
          },
        },
        {
          uniqueKeys: {
            unique_liked: {
              fields: ['owner_id', 'product_id', 'liked'],
            },
          },
        }
    );
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('likes');
  },
};
