require('dotenv').config();
const { Markup } = require('telegraf');
const { capitalize } = require('lodash');

const { translate } = require('../utils/translate');
const {ButtonTrack} = require('../../../db/models');

const i18n = require('../../services/i18n-config');

const DEFAULT_LANG = 'uz';

const handleBotHearsCommand = (bot, phrase, handler) => {
  bot.hears((text, ctx) => text === getTranslatedCommand(phrase, ctx), handler);
};

const getTranslatedCommand = (phrase, ctx) =>
  translate({ phrase, locale: ctx.session.language || DEFAULT_LANG });

async function trackButton(ctx, name, params) {
  const { callbackQuery, user } = ctx;

  if (user?.id) {
    await ButtonTrack.create({
      user_id: user.id,
      name,
      text: callbackQuery?.message?.text || null,
      params,
    });
  }
}

const sendInvoice = async (ctx, plan, userId) => {
  const locale = i18n.getLocale();

  return ctx.replyWithInvoice({
    chat_id: ctx.chat.id,
    title: plan['name' + capitalize(locale)],
    description: plan['description' + capitalize(locale)],
    payload: JSON.stringify({
      plan_id: plan.id,
      user_id: userId,
    }),
    provider_token: process.env.PAYCOM_TOKEN,
    currency: 'UZS',
    prices: [{ label: plan['name' + capitalize(locale)], amount: plan.price * 100 }],
    start_parameter: 'search_bot',
    need_phone_number: true,
    need_shipping_address: false,
    is_flexible: false,
  });
};

module.exports = {
  handleBotHearsCommand,
  trackButton,
  sendInvoice
};
