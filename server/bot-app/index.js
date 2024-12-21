require('dotenv').config({});

const { Telegraf, Scenes, Markup, session } = require('telegraf');

const Redis = require('./services/telegraf-redis-session');
const { translate } = require('./utils/translate');
const { auth } = require('./middleware/auth');
const { setCommands } = require('./utils/commands');
const { keyboards, LANGUAGE } = require('./utils/keyboards');
const { User } = require('../../db/models');
const { trackButton } = require('./utils/general');
const destinationWizard = require('./scenes/get-destination');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const store = new Redis();
const stage = new Scenes.Stage([destinationWizard]);
const debug = require('debug')('bot');
const error = require('debug')('bot:error');

// bot.use(session({ store }));
// bot.use(stage.middleware());
// bot.use(auth);

bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err.code === 403 && err.description.includes('bot was blocked by the user')) {
      debug(`User ${ctx.from.id} blocked the bot. Cannot send message.`);
      if (ctx.chat?.id) {
        try {
          await User.destroy({
            where: {
              telegram_id: ctx.from.id,
            },
          });
        } catch (e) {
          error(e);
        }
      }
    } else {
      error('An unexpected error occurred:', err);
    }
  }
});

// setCommands(bot);

bot.start(async ctx => {
  if (ctx.chat.type !== 'private') {
    try {
      const botMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
      if (botMember.status === 'administrator') {
        console.log('test botMember', botMember.status);
        await ctx.telegram.leaveChat(ctx.chat.id);
        return;
      }
    } catch (err) {
      error('Error checking bot status:', err);
      console.log('Error checking bot status:', err);
      return;
    }
  }

  const args = ctx.startPayload;

  ctx.session.page = 'start';

  if (ctx.user) {
    if (!ctx.user.selectedLang) {
      await ctx.reply(translate('select-language'), keyboards('languageWithoutBack'));
    } else {
      ctx.session.page = 'main';
      await ctx.reply(translate('welcome'), {
        parse_mode: 'Markdown',
        ...keyboards('main', { ctx }),
      });
    }

    if (/^-\d+/.test(args)) {
      await trackButton(ctx, 'start', args);
    } else {
      await trackButton(ctx, 'start');
    }
  }
});

// bot.settings(async ctx => {
//   await ctx.reply(translate('select-setting'), keyboards('settings'));
// });
//
// bot.command('new_load', async ctx => {
//   await ctx.reply(translate('commands.webapp-add-load'), keyboards('addLoad', { ctx }));
// });
//
// bot.command('new_vehicle', async ctx => {
//   await ctx.reply(translate('commands.webapp-add-vehicle'), keyboards('addVehicle', { ctx }));
// });
//
// bot.help(async ctx => {
//   await ctx.reply(translate('help'), { parse_mode: 'Markdown', disable_web_page_preview: true });
//   trackButton(ctx, 'help');
// });

// require('./stage/bot-hears')(bot);
// require('./stage/bot-message')(bot);
// require('./stage/bot-action')(bot);

// Global Error Handling
bot.catch(async (err, ctx) => {
  error(`Error for ${ctx.updateType}`, err);
  console.log(`Error for ${ctx.updateType}`, err);

  if (err.response && err.response.error_code === 403) {
    debug(`Bot was blocked by user ${ctx.chat.id}`);
    return;
  } else if (err.response && err.response.error_code === 429) {
    debug(`Rate limit exceeded. Try again`);
    return;
  } else if (err.code) {
    debug(`A generic error occurred: ${err.code}`);
  }

  ctx.reply('Что-то пошло не так. Пожалуйста, попробуйте позже.');
});

process.on('unhandledRejection', err => {
  error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  debug(err);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'production') {
  // bot.launch();
}

module.exports = bot;
