const cron = require('node-cron');
const { sequelize } = require('../../db/models');

// Schedule the job to run every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  try {
    // Raw query to find and delete duplicate records
    await sequelize.query(`
      DELETE FROM loads
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER(PARTITION BY description_hash ORDER BY created_at DESC) AS row_num
          FROM loads
        ) AS duplicates
        WHERE row_num > 1
      );
    `);

    console.log('Duplicate records removed successfully.');
  } catch (error) {
    console.error('Error removing duplicate records:', error);
  }
});

console.log('Cron job scheduled to remove duplicate records.');
