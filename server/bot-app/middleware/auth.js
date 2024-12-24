const Promise = require('bluebird');
const { Markup } = require('telegraf');
const debug = require('debug')('auth-module'); // Step 2: Create a debug namespace

const { User, Op } = require('../../../db/models');
const i18n = require('../../services/i18n-config');
const { translate } = require('../utils/translate');
const { trackButton } = require('../utils/general');
const {keyboards} = require("../utils/keyboards");

async function auth(ctx, next) {
  const { id, first_name, last_name, username } = ctx.from;

  // Debug input context from the Telegram user
  debug('User info from context:', { id, first_name, last_name, username });

  let [[user, hasCreatedUser]] = await Promise.all([
    User.findOrCreate({
      where: { telegramId: id },
      defaults: {
        telegramId: id,
        firstName: first_name,
        lastName: last_name,
        telegramUsername: username,
        role:  'user'
      },
    }),
  ]);

  // Debug the user and filter results
  debug('User data:', user);
  debug('Has user been created?', hasCreatedUser);

  if (user.isBlocked) {
    await ctx.reply(i18n.__('warning.blocked-user'));
    debug('User is blocked. Exiting...');
    return;
  }

  // Set the user language preference
  let language = ctx.session.language || 'uz';
  ctx.session.language = language;
  ctx.session.userId = user.id;

  i18n.setLocale(language);

  // Debug language and session setup
  debug('Language set:', language);
  debug('Session userId set:', ctx.session.userId);

  ctx.user = user;

  const acceptBtnClicked =
    ctx.message?.text === translate('accept-agreement') ||
    ctx.update?.callback_query?.data === 'agreement_accepted_by_user';

  if (!user.isAgreed && user.selectedLang && !acceptBtnClicked) {
    await ctx.reply(
      translate('commands.agreement'),
      Markup.keyboard([[translate('accept-agreement')]]).resize()
    );
    await ctx.reply(translate('agreement-link'), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback(translate('accept-agreement'), `agreement_accepted_by_user`)],
        ],
      },
    });
    trackButton(ctx, 'agreement-showed');
    return;
  }

  if (user.isAgreed && user.selectedLang && !['share-contact', 'message-text'].includes(ctx.session.page) && !ctx.user.phone) {
    ctx.session.page = 'share-contact';
    await ctx.reply(
        translate('request-contact'),
       keyboards('contact')
    );
    trackButton(ctx, 'share-contact-auth');
    return;
  }

  // Move to the next middleware
  return next();
}

module.exports = { auth };
