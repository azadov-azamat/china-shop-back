const express = require('express');
const route = require('express-async-handler');
const { Telegraf, Markup } = require('telegraf');
const redisClient = require('../../services/redis');
const ensureAuth = require('../../middleware/ensure-auth');
const { setAuth, getLoginLinkInfo, destroyLoginLink } = require('../../bot-app/utils/auth');
const { translate } = require('../../bot-app/utils/translate');
// const { sendMessageToBot } = require('../../utils/bot');
let { User, Load } = require('../../../db/models');

const router = express.Router();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

router.get(
  '/auth',
  ensureAuth(),
  route(async function (req, res) {
    let userId = req.user.id;
    let { botToken } = req.query;
    let telegramUserId = await getLoginLinkInfo(redisClient, botToken);
    let user = await User.findByPk(userId);

    if (!telegramUserId || !user) {
      return res.sendStatus(401);
    }

    destroyLoginLink(redisClient, botToken);

    await Promise.all([
      User.update({ telegramId: telegramUserId }, { where: { id: userId } }),
      setAuth(redisClient, telegramUserId, JSON.stringify({ userId, telegramUserId })),
    ]);

    const message = await bot.telegram.sendMessage(telegramUserId, 'success-login', {
      reply_markup: {
        keyboard: [[{ text: translate('commands.search') }]],
        resize_keyboard: true,
      }
    });

    await bot.telegram.editMessageReplyMarkup(telegramUserId, message.message_id - 1, null, { inline_keyboard: [] })

    res.status(200).send({ status: 'OK' });
  })
);

router.get(
  '/logout',
  route(async function (req, res) {
    let { telegramId } = req.query;

    if (!telegramId) res.send({  });

    const message = await bot.telegram.sendMessage(telegramId, 'success-logout', {
      reply_markup: {
        remove_keyboard: true
      }
    });
    await bot.telegram.editMessageReplyMarkup(telegramId, message.message_id - 1, null, { inline_keyboard: [] })

    await setAuth(redisClient, telegramId, null);
    res.send({  });
  })
);

// router.post(
//   '/send-message',
//   ensureAuth(),
//   route(async function (req, res) {
//     let { recordId } = req.query;
//     let userId = req.user.id;

//     let record = await Load.findOne({ where: { id: recordId } })

//     if (record && req.user.telegramId) {
//       try {
//         await sendMessageToBot(bot, req.user.telegramId, record);
//         res.sendStatus(200);
//       } catch (e) {
//         console.log(e)
//         return res.sendStatus(404);
//       }
//     }

//     res.sendStatus(200);
//   })
// );

module.exports = router;
