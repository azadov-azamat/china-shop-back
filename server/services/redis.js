const Redis = require('ioredis');

let client = new Redis(process.env.REDIS_URL);

client.on('connect', () => {
  const address = `${client.options.host}:${client.options.port}`;
  console.log('Connected to Redis at:', address);
});

module.exports = client;
