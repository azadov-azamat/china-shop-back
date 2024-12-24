require('dotenv').config();

const express = require('express');
const {User} = require('../../../db/models');
const route = require('express-async-handler');
const redisClient = require('../../services/redis');
const sms = require('../../services/sms');
const {getAuthToken, verifyTelegramAuth} = require('../../utils/auth');
const {serialize} = require('../../../db/serializers');
const {Telegraf} = require('telegraf');
const router = express.Router();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

router.get(
    '/telegram/:id',
    route(async function (req, res) {
        const {id} = req.params;

        const user = await User.findOne({where: {telegram_id: id}});
        if (!user) {
            return res.sendStatus(401);
        }
        res.send(getAuthToken(user.id));
    })
);

router.post(
    '/logout',
    route(async function (req, res) {
        req.logout();
    })
);


module.exports = router;