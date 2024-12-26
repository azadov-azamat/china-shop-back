require('dotenv').config();
const express = require('express');
const route = require('express-async-handler');
const ensureAuth = require('../../middleware/ensure-auth');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { Order } = require('../../../db/models');
// const dayjs = require('dayjs');
const { Telegraf } = require('telegraf');
const debug = require('debug')('app:bot-action');

const router = express.Router();

const PAYCOM_API = process.env.PAYCOM_PROD_API;
const xAuth = `${process.env.PAYCOM_CHEKOUT_ID}:G#E%ZzwOXfQcOipvrP3XHXDhd0BE6gkYPBaQ`;
const ADMIN_TELEGRAM_IDS = [867278697];
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const makePaycomRequest = async (method, params) => {
  const payload = {
    id: uuidv4(),
    method,
    params,
  };

  try {
    const response = await axios.post(PAYCOM_API, payload, {
      headers: {
        'X-Auth': xAuth,
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw { status: error.response.status, data: error.response.data };
    } else {
      throw { status: 500, data: 'Error communicating with Paycom API' };
    }
  }
};

const handleApiError = (error, res) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.data || 'Internal Server Error' });
};

router.post(
  '/',
  ensureAuth(),
  route(async (req, res) => {
    const user = req.user;
    const { orderId } = req.body;

    const order = await Order.findOne({ where: { id: orderId } });
    if (!order) {
      return res.status(400).json({ error: 'Invalid order parameters' });
    }

    const params = {
      // amount: order.totalAmount * 100,
      amount: 1000 * 100,
      account: { order_id: order.id },
    };

    try {
      const result = await makePaycomRequest('receipts.create', params);
      res.status(200).json(result);
    } catch (error) {
      handleApiError(error, res);
    }
  })
);

router.post(
  '/pay',
  ensureAuth(),
  route(async (req, res) => {
    const user = req.user;
    const { checkId, token } = req.body;

    if (!token || !checkId) {
      return res.status(400).json({ error: 'Invalid payment parameters' });
    }

    const params = {
      id: checkId,
      token,
      payer: {
        id: user.id,
        phone: user.phone || user.telegramId,
        name: `${user.firstName} ${user.lastName}`,
      },
    };

    try {
      const result = await makePaycomRequest('receipts.pay', params);
      if (result?.result?.receipt) {
        let orderId;
        for (let accountElement of result?.result?.receipt.account) {
          if (accountElement.name === 'order_id') {
              orderId = Number(accountElement.value);
          }
        }

        const order = await Order.findOne({ where: { id: orderId } });
        // const { startDate, endDate } = calculateSubscriptionDates(chosenPlan.duration_in_days);

        debug(`successful_payment: userID-${user.id}, order_id-${orderId}`);
        console.log(`successful_payment: userID-${user.id}, order_id-${orderId}`);
        const message = `✅ China Shop successful payment. OrderId: ${orderId}, UserID: ${user.id}`;

        for (const telegramId of ADMIN_TELEGRAM_IDS) {
          await bot.telegram.sendMessage(telegramId, message);
          debug(`Message sent to Telegram ID: ${telegramId}`);
        }

        // const subscription = await Subscription.create({
        //   startDate,
        //   endDate,
        //   user_id: user.id,
        //   status: 'active',
        //   plan_id: chosenPlan.id,
        // });

        return res.status(200).json({ result: order });
      }
      res.status(200).json(result);
    } catch (error) {
      handleApiError(error, res);
    }
  })
);

// Route for sending receipt
router.post(
  '/send',
  ensureAuth(),
  route(async (req, res) => {
    const { phone, id } = req.body;

    if (!id || !phone) {
      return res.status(400).json({ error: 'Invalid send parameters' });
    }

    try {
      const result = await makePaycomRequest('receipts.send', { id, phone });
      res.status(200).json(result);
    } catch (error) {
      handleApiError(error, res);
    }
  })
);

// Route for canceling a receipt
router.post(
  '/cancel',
  ensureAuth(),
  route(async (req, res) => {
    const { checkId } = req.body;

    if (!checkId) {
      return res.status(400).json({ error: 'Invalid cancel parameters' });
    }

    try {
      const result = await makePaycomRequest('receipts.cancel', { id: checkId });
      res.status(200).json(result);
    } catch (error) {
      handleApiError(error, res);
    }
  })
);

// Route for checking a receipt
router.post(
  '/check',
  ensureAuth(),
  route(async (req, res) => {
    const { checkId } = req.body;

    if (!checkId) {
      return res.status(400).json({ error: 'Invalid check parameters' });
    }

    try {
      const result = await makePaycomRequest('receipts.check', { id: checkId });
      res.status(200).json(result);
    } catch (error) {
      handleApiError(error, res);
    }
  })
);

module.exports = router;
