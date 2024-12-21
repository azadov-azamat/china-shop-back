const Promise = require('bluebird');
const { Markup } = require('telegraf');
const debug = require('debug')('auth-module'); // Step 2: Create a debug namespace
const error = require('debug')('auth-module:error'); // Step 2: Create a debug namespace
const dayjs = require('dayjs');

const { User, SearchFilter, Subscription, Load, Vehicle, Op } = require('../../../db/models');
const i18n = require('../../services/i18n-config');
const { translate } = require('../utils/translate');
const { trackButton } = require('../utils/general');

async function auth(ctx, next) {
  const { id, first_name, last_name, username } = ctx.from;

  // Debug input context from the Telegram user
  debug('User info from context:', { id, first_name, last_name, username });

  let [[user, hasCreatedUser], [filter]] = await Promise.all([
    User.findOrCreate({
      where: { telegramId: id },
      defaults: {
        telegramId: id,
        firstName: first_name,
        lastName: last_name,
        vehicleSearchLimit: 10,
        loadSearchLimit: 80,
        telegramUsername: username,
        isRegisteredInBot: true,
      },
      include: [
        {
          model: Subscription,
          as: 'subscriptions',
          where: { endDate: { [Op.gte]: dayjs().toDate() } },
          required: false,
        },
      ],
    }),
    ctx.session.userId
      ? SearchFilter.findOrCreate({
          where: {
            owner_id: ctx.session.userId,
            isSaved: false,
          },
          defaults: {
            owner_id: ctx.session.userId,
            isSaved: false,
          },
        }).catch(() => [])
      : [],
  ]);

  if (!user.isRegisteredInBot) {
    await user.update({
      firstName: first_name,
      lastName: last_name,
      telegramUsername: username,
      isRegisteredInBot: true,
    });
  }

  // Debug the user and filter results
  debug('User data:', user);
  debug('Has user been created?', hasCreatedUser);
  debug('Filter data:', filter);

  if (user.isBlocked) {
    await ctx.reply(i18n.__('warning.blocked-user'));
    debug('User is blocked. Exiting...');
    return;
  }

  if (!filter || ctx.session.userId !== user.id) {
    debug('Filter not found or session userId mismatch. Creating a new filter.');
    filter = await SearchFilter.findOrCreate({
      where: {
        owner_id: user.id,
        isSaved: false,
      },
      defaults: {
        owner_id: user.id,
        isSaved: false,
      },
    });
  }

  if (hasCreatedUser) {
    // If a new user is created, update existing loads
    try {
      const [updateResult1, updateResult2] = await Promise.all([
        Load.update(
          { owner_id: user.id },
          {
            where: {
              owner_id: null,
              telegram_user_id: id,
            },
          }
        ),
        Vehicle.update(
          { owner_id: user.id },
          {
            where: {
              owner_id: null,
              telegram_user_id: id,
            },
          }
        )
      ]);

      debug('Load update result:', updateResult1); // Log the result of Load.update
      debug('Vehicle update result:', updateResult2); // Log the result of Vehicle.update
    } catch (e) {
      error('updating load:', e); // Log any errors
    }
  }

  // Set the user language preference
  let language = ctx.session.language || 'uz';
  ctx.session.language = language;
  ctx.session.userId = user.id;
  ctx.filter = filter;
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

  // Move to the next middleware
  return next();
}

module.exports = { auth };
