require('dotenv').config({ silent: true });

module.exports = {
  development: {
    url: process.env.DATABASE_URL,
    logging: false,
    ssl: true,
    dialect: 'postgres',
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
    define: {
      timestamps: true,
    },
  },
  test: {
    url: 'postgresql://localhost:5432',
    // "host": "127.0.0.1",
    database: 'test_db',
    dialect: 'postgres',
    logging: false,
  },
  production: {
    url: process.env.DATABASE_URL,
    ssl: true,
    dialect: 'postgres',
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
    define: {
      timestamps: true,
    },
  },
};
