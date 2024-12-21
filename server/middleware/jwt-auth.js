const route = require('express-async-handler');
const { User } = require('../../db/models');
const { verifyToken } = require('../utils/auth');

module.exports = route(async function (req, res, next) {
  let tokenPayload = await verifyToken(req);
  if (tokenPayload) {

    let user = await User.findOne({ where: { id: tokenPayload.userId } });

    if (!user) {
      return res.sendStatus(401);
    }

    req.user = user;
  }
  await next();
});
