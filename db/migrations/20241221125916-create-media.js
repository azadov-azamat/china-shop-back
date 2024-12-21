'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      media_type: {
        type: Sequelize.ENUM('photo', 'video', 'placeholder'),
      },
      path: {
        type: Sequelize.STRING,
      },
      preview_path: {
        type: Sequelize.STRING,
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      product_id: {
        type: Sequelize.INTEGER,
        onDelete: 'CASCADE',
        references: {
          model: 'products',
          key: 'id',
        },
      },
      user_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      content_type: {
        type: Sequelize.STRING,
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
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('media');
  },
};
'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      media_type: {
        type: Sequelize.ENUM('photo', 'video', 'placeholder'),
      },
      path: {
        type: Sequelize.STRING,
      },
      preview_path: {
        type: Sequelize.STRING,
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      product_id: {
        type: Sequelize.INTEGER,
        onDelete: 'CASCADE',
        references: {
          model: 'products',
          key: 'id',
        },
      },
      user_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      content_type: {
        type: Sequelize.STRING,
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
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('media');
  },
};
'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      media_type: {
        type: Sequelize.ENUM('photo', 'video', 'placeholder'),
      },
      path: {
        type: Sequelize.STRING,
      },
      preview_path: {
        type: Sequelize.STRING,
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      product_id: {
        type: Sequelize.INTEGER,
        onDelete: 'CASCADE',
        references: {
          model: 'products',
          key: 'id',
        },
      },
      user_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      content_type: {
        type: Sequelize.STRING,
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
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('media');
  },
};
