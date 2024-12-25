const {message} = require('telegraf/filters');
const debug = require('debug')('search-bot:bot');
const {User, Comment, sequelize} = require('../../../db/models');
const {translate} = require('../utils/translate');
const {trackButton} = require('../utils/general');
const {keyboards} = require('../utils/keyboards');
const {Markup} = require("telegraf");
const {removeKeyboard} = require("telegraf/markup");

module.exports = function (bot) {
    bot.on('contact', async (ctx) => {
        const {id} = ctx.from;
        const contact = ctx.message.contact;
        if (contact && !ctx.user.phone || ctx.session.page === 'change-contact') {
            let user = await User.findOne({
                where: {telegramId: id},
            });
            user.phone = contact.phone_number;
            ctx.user = await user.save();
            if (ctx.session.startPayload === 'from-site-user') {
                let baseUrl = process.env.BACK_HOST_NAME
                let authUrl = `${baseUrl}/api/auth/by-telegram?userId=${contact.user_id}`
                ctx.session.startPayload = null;
                await ctx.reply(translate('success-contact'), removeKeyboard());
                await ctx.reply(translate('welcome'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [Markup.button.url(translate('enter-site'), authUrl)],
                        ],
                    }
                });
            } else {
                await ctx.reply(translate('success-contact'), {
                    ...keyboards('main', {ctx})
                });
            }
        } else if (!ctx.user.phone && !contact) {
            await ctx.reply(translate('error-contact'));
        } else {
            ctx.session.page = 'main';
            await ctx.reply(translate('welcome'), {
                parse_mode: 'Markdown',
                ...keyboards('main', {ctx}),
            });
        }
        trackButton(ctx, 'accept-contact');
    });

    bot.on(message('text'), async (ctx) => {
        let question = ctx.message.text.trim().replace(/-/g, ' ');
        debug(`question: ${question}`);
        if (!ctx.user?.phone) {
            console.log('test-on-message-send-contact: ', ctx.user?.id)
            await ctx.reply(translate('error-contact'),
                keyboards('contact')
            );
        } else if (ctx.session.page === 'get-comment') {
            await Comment.create({
                text: question,
                user_id: ctx.user.id,
            })
            await ctx.reply(translate('success-comment'), keyboards('main', {ctx}));
        }
    });

    bot.on('location', async (ctx) => {
        if (ctx.session.page === 'change-current-location') {
            const {latitude, longitude} = ctx.message?.location;
            let user = await User.findOne({where: {id: ctx.user.id}});
            user.latlng = [latitude, longitude];
            await user.save();
            await ctx.reply(translate('success-location'), keyboards('settings'));
        } else {
            await ctx.reply(translate('welcome'), {
                parse_mode: 'Markdown',
                ...keyboards('main', {ctx}),
            });
        }
        ctx.session.page = 'location-search';
        trackButton(ctx, 'location-search');
    });
};
