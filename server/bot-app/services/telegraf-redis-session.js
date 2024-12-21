const redisClient = require('../../services/redis');

function Redis(opts) {
  const prefix = opts?.prefix || "logistics-bot:";

  return {
    async get(key) {
      try {
        const value = await redisClient.get(prefix + key);
        return value ? JSON.parse(value) : {};
      } catch (error) {
        console.error('Error getting value from Redis:', error);
        throw error;
      }
    },
    async set(key, session) {
      try {
        return await redisClient.set(prefix + key, JSON.stringify(session));
      } catch (error) {
        console.error('Error setting value in Redis:', error);
        throw error;
      }
    },
    async delete(key) {
      try {
        return await redisClient.del(prefix + key);
      } catch (error) {
        console.error('Error deleting value from Redis:', error);
        throw error;
      }
    },
  };
}

module.exports = Redis
