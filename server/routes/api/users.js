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
  '/has-subscription',
  ensureAuth(),
  route(async function(req, res){
    let userId = req.user?.id;
    let subscription = await Subscription.findOne({where: {user_id: userId, status: 'active'}})
    res.send({active: !!subscription});
  }),
);

router.post(
  '/',
  route(async function(req, res) {
    let json = await deserialize(req.body);

    let userAlreadyExist = await User.findOne({
      where: { phone: json.phone, isRegistered: true },
    });

    if (userAlreadyExist) {
      res.status(400).send({});
      return;
    }

    let isConfirmed = await sms.confirmToken(json.phone, json.smsToken, 'register', true);
    if (!isConfirmed) {
      return res.status(401).send('Invalid SMS Code');
    }

    let nonRegisteredUser = await User.findOne({
      where: {
        isRegistered: false,
        [Op.or]: [
          { phone: json.phone },
          json.telegramId ? { telegramId: json.telegramId } : null
        ].filter(Boolean)
      },
    });

    let user;
    if (nonRegisteredUser) {
      user = nonRegisteredUser;
      if (!user.phone) {
        user.phone = json.phone;
      }
      if (!user.role) {
        user.role = json.role;
      }
    } else {
      user = User.build(json);
    }

    user.isRegistered = true;

    await user.setPassword(json.password);
    await user.save();

    res.send(serialize(user));
  }),
);

router.get(
  '/:id',
  route(async function(req, res) {
    const { id } = req.params;

    let isSelf = req.user?.id === id;
    let user = await User.findOne({ where: { id } });

    if (!user) {
      return res.sendStatus(404);
    }
    res.send(serialize(user));
  }),
);

router.get(
  '/unique/phone',
  route(async function(req, res) {
    let { phone } = req.query;
    let user = await User.count({ where: { phone } });
    res.send({ exist: !!user });
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

router.post(
  '/:id/change-password',
  ensureAuth(),
  route(async function(req, res) {
    const { user } = req;
    const { currentPassword, password } = req.body;

    await user.reload({
      attributes: ['salt', 'hash', 'id'],
    });

    let isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.sendStatus(401);
    }

    await user.setPassword(password);
    await user.save();

    res.send({});
  }),
);

router.get(
  '/',
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

router.delete(
  '/:id',
  ensureAuth(),
  route(async function(req, res) {
    // const { id } = req.params;

    // res.sendStatus(204);
  }),
);

module.exports = router;
