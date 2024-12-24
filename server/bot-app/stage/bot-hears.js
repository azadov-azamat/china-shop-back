const { Markup } = require('telegraf');
const dayjs = require('dayjs');
const { query } = require('express');
const { Sequelize } = require('sequelize');
const { capitalize } = require('lodash');

const { translate } = require('../utils/translate');
const { keyboards, LANGUAGE, TRUCK_TYPES } = require('../utils/keyboards');
const i18n = require('../../services/i18n-config');
const {
  sequelize,
  Op,
} = require('../../../db/models');
const {
  handleBotHearsCommand,
  trackButton
} = require('../utils/general');

const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

module.exports = function (bot) {
  handleBotHearsCommand(bot, 'commands.help', async ctx => {
    await ctx.reply(translate('help'), { parse_mode: 'Markdown', disable_web_page_preview: true });
    trackButton(ctx, 'help');
  });

  handleBotHearsCommand(bot, 'commands.settings', async ctx => {
    ctx.session.page = 'settings';
    await ctx.reply(translate('commands.settings'), {
      parse_mode: 'Markdown',
      ...keyboards('settings'),
    });
  });

  handleBotHearsCommand(bot, 'commands.language', async ctx => {
    ctx.session.page = 'language';
    await ctx.reply(translate('select-language'), keyboards('language'));
  });

  handleBotHearsCommand(bot, 'commands.go-back', async ctx => {
    const page = ctx.session.page;

    if (['set-filter', 'language'].includes(page)) {
      ctx.session.page = 'settings';
      await ctx.reply(translate('commands.settings'), keyboards('settings'));
    } else if (['load-search', 'vehicle', 'search-results'].includes(page)) {
      ctx.session.page = 'quick-search';
      await ctx.reply(translate('select-search-type'), {
        parse_mode: 'Markdown',
        ...keyboards('searchTypes'),
      });
    } else if (['my-loads', 'my-vehicles'].includes(page)) {
      ctx.session.page = 'my-ads';
      await ctx.reply(translate('my-ads-title'), keyboards('selectLoadOrVehicle'));
    } else if (['list-subscriptions', 'active-subscriptions'].includes(page)) {
      if (page === 'list-subscriptions') {
        const messageId = ctx.message.message_id;
        await ctx.deleteMessage(messageId - 3);
        await ctx.deleteMessage(messageId - 2);
        await ctx.deleteMessage(messageId - 1);
      }
      ctx.session.page = 'subscriptions';
      await ctx.reply(translate('choose-subscription-menu'), keyboards('subscriptions'));
    } else {
      await ctx.reply(translate('main-menu'), keyboards('main', { ctx }));
      ctx.session.page = 'main';
    }
  });


  handleBotHearsCommand(bot, 'cancel', async ctx => {
    ctx.session.page = 'main';
    await ctx.reply(translate('main-menu'), keyboards('main', { ctx }));
  });

  handleBotHearsCommand(bot, 'accept-agreement', async ctx => {
    const user = ctx.user;
    if (user && user.isAgreed) {
      trackButton(ctx, 'user_again_accepted_agreement', user.id);
      return ctx.reply(translate('already-accepted'));
    }
    user.isAgreed = true;
    await user.save();

    await ctx.reply(translate('accepted-agreement'), { parse_mode: 'HTML' });
    if (!ctx.user.phone) {
      ctx.session.page = 'share-contact';
      await ctx.reply(
          translate('request-contact'),
          Markup.keyboard([
            Markup.button.contactRequest(translate('send-contact')),
          ]).resize().oneTime(false),
      );
      trackButton(ctx, 'share-contact-agreement-btn');
    }
    trackButton(ctx, 'accept-agreement');
  });

  bot.hears(
    text => {
      return Object.values(LANGUAGE).includes(text);
    },
    async ctx => {
      try {
        const { text } = ctx.message;
        const chosenLanguage = Object.keys(LANGUAGE).find(key => LANGUAGE[key] === text);

        ctx.session.language = chosenLanguage;
        ctx.user.selectedLang = chosenLanguage;

        await i18n.setLocale(chosenLanguage);
        await ctx.user.save();

        if (!ctx.user.isAgreed) {
          await ctx.reply(
            translate('commands.agreement'),
            Markup.keyboard([[translate('accept-agreement')]]).resize()
          );
          await ctx.reply(translate('agreement-link'), {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.callback(
                    translate('accept-agreement'),
                    `agreement_accepted_by_user`
                  ),
                ],
              ],
            },
          });
          trackButton(ctx, 'agreement-showed', chosenLanguage);
        } else {
          await ctx.reply(translate('selected-language', { lang: text }), {
            parse_mode: 'HTML',
            ...keyboards('main', { ctx }),
          });
        }
        trackButton(ctx, 'change-language', chosenLanguage);
      } catch (e) {
        console.log(e);
      }
    }
  );
};
