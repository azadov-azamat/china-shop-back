require('dotenv').config();

const express = require('express');
const { User } = require('../../../db/models');
const route = require('express-async-handler');
const redisClient = require('../../services/redis');
const sms = require('../../services/sms');
const { getAuthToken, verifyTelegramAuth } = require('../../utils/auth');
const { serialize } = require('../../../db/serializers');
const { Telegraf } = require('telegraf');
const router = express.Router();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

router.get(
  '/telegram',
  route(async function (req, res) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const authData = req.body;
    console.log("authData", authData);
    console.log("botToken", botToken);

    if (!verifyTelegramAuth(authData, botToken)) {
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    res.send(getAuthToken(authData.id));
  })
);

router.post(
  '/logout',
  route(async function (req, res) {
    req.logout();
  })
);

router.post(
  '/login',
  route(async function (req, res) {
    let { phone, password } = req.body;
    phone = phone + '';

    let user = await User.findOne({
      where: { phone },
      attributes: ['salt', 'hash', 'id'],
    });

    let isPasswordCorrect = await user?.matchPassword(password);

    if (!user || !isPasswordCorrect) {
      return res.sendStatus(400);
    }

    res.send(getAuthToken(user.id));
  })
);

router.post(
  '/reset-password',
  route(async function (req, res) {
    const { phone, smsToken, password } = req.body;

    let user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.sendStatus(400);
    }

    let isConfirmed = await sms.confirmToken(phone, smsToken, 'reset-password', true);
    if (!isConfirmed) {
      return res.sendStatus(401);
    }

    await user.setPassword(password);
    await user.save();

    res.send({});
  })
);

router.post(
  '/send-token',
  route(async function (req, res) {
    let { phone, action = 'register' } = req.body;
    let user = await User.findOne({ where: { phone } });
    let result = await sms.sendToken(phone, action);

    if (result === 1) {
      res.send({ });
    } else if (result === 0) {
      res.sendStatus(400);
    } else if (result === -1) {
      res.sendStatus(401); // flooded show time to wait
    }
  })
);

router.post(
  '/confirm-token',
  route(async function (req, res) {
    let { token } = req.body;
    let str = token.split('&');
    let phone = str[1];
    token = str[0];

    let user = await User.findOne({ where: { phone } });

    if (!user) {
      return res.sendStatus(400);
    }

    let isConfirmed = await sms.confirmToken(phone, token, 'customer-invited', true);
    if (!isConfirmed) {
      return res.sendStatus(401);
    }

    res.send({ phone: user.phone });
  })
);

module.exports = router;
