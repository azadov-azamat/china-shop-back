const express = require('express');
const route = require('express-async-handler');
const {
  User,
  sequelize,
  Sequelize,
  Subscription,
  Op,
} = require('../../../db/models');
const { serialize, deserialize } = require('../../../db/serializers');
const ensureAuth = require('../../middleware/ensure-auth');
const sms = require('../../services/sms');

const router = express.Router();

router.get(
  '/:id',
  route(async function(req, res) {
    const { id } = req.params;
    let user = await User.findOne({ where: { id } });

    if (!user) {
      return res.sendStatus(404);
    }
    res.send(serialize(user));
  }),
);


router.patch(
  '/:id',
  route(async function(req, res) {
    const { id } = req.params;

    let json = await deserialize(req.body);
    let user = await User.findByPk(id);

    await user.update(json);
    await user.save();

    res.send(serialize(user));
  }),
);

router.get(
  '/',
  ensureAuth(),
  route(async function(req, res) {
    let userId = req.user?.id;
    let query = req.query;

    if (userId) {
      query.where = {
        ...query,
        id: {
          [Op.ne]: userId,
        },
      };
    }

    let users = await User.findAll(query);
    let json = serialize(users);

    res.send(json);
  }),
);

module.exports = router;
