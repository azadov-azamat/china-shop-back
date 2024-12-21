const Queue = require('bull');

function createQueue(name, options) {
  return new Queue(name, process.env.REDIS_URL, options);
}

module.exports = createQueue;
