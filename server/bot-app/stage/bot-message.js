const { Markup } = require('telegraf');

const { message } = require('telegraf/filters');
const debug = require('debug')('search-bot:bot');
const { UserTelegramQuery, sequelize } = require('../../../db/models');
const { translate } = require('../utils/translate');
const { handleSearch, trackButton } = require('../utils/general');
const emojiRegex = require('emoji-regex')();

const MAX_QUERY_LENGTH = 40;

module.exports = function(bot) {
  bot.on(message('text'), async (ctx) => {
    let question = ctx.message.text.trim().replace(/-/g, ' ');
    debug(`question: ${question}`);


    // if (!ctx.user?.isAgreed) {
    //   await ctx.replyWithMarkdown(translate('warning.agreement-not-accepted'));
    //   return;
    // }

    const filter = ctx.filter;
    if (filter) {
      filter.originLatlng = null;
      // await filter.save?.();
    }

    if (!['load-search', 'search-results'].includes(ctx.session.page)) {
      ctx.session.lastQuestion = question;
      await ctx.reply(translate('warning.go-to-quick-search'), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
            [Markup.button.callback(translate('commands.load-search'), 'load_search')]
          ]
        },
      });
      return;
    }

    if (!question) {
      await ctx.replyWithMarkdown(translate('warning.invalid-query'));
      return;
    }

    // if (question.length > MAX_QUERY_LENGTH) {
      // await ctx.replyWithMarkdown(translate('warning.invalid-query'));
      // await ctx.replyWithMarkdown(translate('long-query', { max_length: 600 }));
    //   return;
    // }

    ctx.session.lastQuestion = null;
    ctx.session.userQueryId = null;

    question = question.replace(emojiRegex, '').trim();

    const filterableWords = ['ga', 'dan'];
    const words = question.trim().split(/\s+/);
    const wordsCount = words.filter((word)=> filterableWords.includes(word));

    if (wordsCount.length > 2 || words.length > 5 || question.length > MAX_QUERY_LENGTH) {
      await ctx.replyWithMarkdown(translate('only-two-words'));
      UserTelegramQuery.create({
        question,
        status: 'no-answer',
        user_id: ctx.user.id,
      });
      return;
    }

    let query = await UserTelegramQuery.create({
      question,
      truckType: filter.cargoType,
      status: 'pending',
      user_id: ctx.user.id,
    });

    ctx.session.userQueryId = query.id;

    try {
      if (ctx.session.page === 'set-filter') {
        await handleSearch(ctx, question, true, query);
      } else {
        const result = await handleSearch(ctx, question, false, query);
        query = await query;
        if (!result) {
          await query.update({ status: 'no-answer' });
        } else if (result.count) {
          await query.update({ resultCount: result.count });
        }
      }
    } catch (error) {
      console.log(error);
      query = await query;
      await ctx.replyWithMarkdown(translate('error.500'));
      await query.update({ failMessage: error.toString(), status: 'error' });
      return;
    }

    query = await query;
    await filter.save?.();
    await query.update({ status: 'complete' });
  });

  bot.on('location', async (ctx) => {
    ctx.session.page = 'location-search';
    trackButton(ctx, 'location-search');
    await ctx.scene.enter('destinationWizard', { filterId: ctx.filter.id });
  });
};
