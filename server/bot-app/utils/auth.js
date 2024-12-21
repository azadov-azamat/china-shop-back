const { v4: uuidv4 } = require('uuid');
const { MINUTE, DAY } = require('time-constants');
const { User } = require('../../../db/models');

async function setAuth(redisClient, telegramUserId, value) {
  let key = `bot:session:${telegramUserId}`;
  if (value === null) {
    await redisClient.del(key);
  } else {
    await redisClient.set(key, value, 'EX', (DAY * 30) / 1000);
  }
}

async function clearAuth(redisClient, telegramUserId) {
  let key = `bot:session:${telegramUserId}`;
  return redisClient.del(key);
}

async function getAuth(redisClient, telegramUserId) {
  let key = `bot:session:${telegramUserId}`;
  let val = await redisClient.get(key);
  return val ? JSON.parse(val) : null;
}

async function createAuthLink(redisClient, telegramUserId) {
  let token = uuidv4();
  let key = `bot:login-key:${token}`;
  let [user] = await Promise.all([
    User.findOne({ where: { telegramId: telegramUserId } }),
    redisClient.set(key, telegramUserId, 'EX', (MINUTE * 20) / 1000),
  ]);

  return { user, link: `${process.env.FRONT_HOST_NAME}/login?botToken=${token}`};
}

async function destroyLoginLink(redisClient, token) {
  let key = `bot:login-key:${token}`;
  await redisClient.del(key);
}

async function getLoginLinkInfo(redisClient, token) {
  let key = `bot:login-key:${token}`;
  return redisClient.get(key);
}

module.exports = {
  createAuthLink,
  destroyLoginLink,
  getLoginLinkInfo,
  setAuth,
  getAuth,
};
