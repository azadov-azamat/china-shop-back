require('dotenv').config();
const { Markup } = require('telegraf');
const { capitalize } = require('lodash');

const { translate } = require('../utils/translate');
const {
  Subscription,
  Load,
  sequelize,
  Vehicle,
  User,
  Good,
  Plan,
  Op,
} = require('../../../db/models');
const {
  findLoads,
  findVehicles,
  handleSearch,
  trackButton,
  // sendInvoice,
  checkUserLimit, sendInvoice,
} = require('../utils/general');
const {
  escapeChar,
  formatPhoneNumber,
  generateMessage,
  VEHICLE_MESSAGE_TEMPLATE,
  DEFAULT_MESSAGE_TEMPLATE,
} = require('../utils/generate-message');
const { keyboards } = require('../utils/keyboards');
const i18n = require('../../services/i18n-config');
const dayjs = require('dayjs');
const { Sequelize } = require('sequelize');

module.exports = function(bot) {
  bot.action('go_back', async ctx => {
    const page = ctx.session.page;

    if (['load-search', 'search-results', 'vehicle'].includes(page)) {
      ctx.session.page = 'quick-search';
      await ctx.editMessageReplyMarkup(null);
      await ctx.reply(translate('select-search-type'), {
        parse_mode: 'Markdown',
        ...keyboards('searchTypes'),
      });
    } else {
      await ctx.reply(translate('main-menu'), keyboards('main', { ctx }));
      ctx.session.page = 'main';
    }
  });

  bot.action('agreement_accepted_by_user', async ctx => {
    const user = ctx.user;
    if (user && user.isAgreed) {
      trackButton(ctx, 'user_again_accepted_agreement', user.id);
      return ctx.reply(translate('already-accepted'));
    }

    user.isAgreed = true;
    await user.save();
    await ctx.editMessageReplyMarkup(null);

    if (!ctx.user.phone) {
      ctx.session.page = 'share-contact';
      await ctx.reply(
          translate('request-contact'),
          Markup.keyboard([
            Markup.button.contactRequest(translate('send-contact')),
          ]).resize().oneTime(false),
      );
      trackButton(ctx, 'share-contact-agreement-inline-btn');
    }
    trackButton(ctx, 'accept-agreement');
  });


  bot.on('pre_checkout_query', ctx => {
    ctx.answerPreCheckoutQuery(true);
  });

  bot.on('successful_payment', async ctx => {
    const currentMessageId = ctx.message.message_id;

    try {
      const locale = i18n.getLocale();
      const user = ctx.user;
      const paymentInfo = ctx.message.successful_payment;
      let { plan_id, user_id } = JSON.parse(paymentInfo.invoice_payload)
      await ctx.deleteMessage(currentMessageId - plan_id);

      let chosenPlan = await Plan.findByPk(parseInt(plan_id));
      if (chosenPlan) {
        const startDate = dayjs().toDate();

        const endDate = dayjs(startDate)
          .add(chosenPlan.duration_in_days, 'day')
          .toDate();

        await Subscription.create({
          startDate: startDate,
          endDate: endDate,
          user_id: user.id,
          status: 'active',
          plan_id: chosenPlan.id,
        });

        await ctx.reply(
          translate('success-payment-subscription', {
            plan: chosenPlan['name' + capitalize(locale)],
            endDate: dayjs(endDate).format('MM-DD-YYYY'),
          }),
          {
            parse_mode: 'Markdown',
            ...keyboards('subscriptions'),
          },
        );
        trackButton(ctx, 'successful_payment', chosenPlan.id);
      } else {
        ctx.reply('Xato: Tanlangan tarif topilmadi.');
      }
    } catch (e) {
      console.log(e);
    }
  });
};
