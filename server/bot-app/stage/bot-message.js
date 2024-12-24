const {message} = require('telegraf/filters');
const debug = require('debug')('search-bot:bot');
const {User, sequelize} = require('../../../db/models');
const {translate} = require('../utils/translate');
const {trackButton} = require('../utils/general');
const {keyboards} = require('../utils/keyboards');
const {Markup} = require("telegraf");

module.exports = function (bot) {
    bot.on('contact', async (ctx) => {
        const {id} = ctx.from;
        const contact = ctx.message.contact;
        if (contact && !ctx.user.phone) {
            let user = await User.findOne({
                where: {telegramId: id},
            });
            user.phone = contact.phone_number;
            ctx.user = await user.save();
            await ctx.reply(translate('success-contact'), {
                ...keyboards('main', {ctx})
            });
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
                Markup.keyboard([
                    Markup.button.contactRequest(translate('send-contact')),
                ]).resize().oneTime(false),
            );
            return;
        }

        await ctx.reply("To'g'irlayapmiz")
    });

    bot.on('location', async (ctx) => {
        ctx.session.page = 'location-search';
        trackButton(ctx, 'location-search');
        await ctx.reply(translate('welcome'), {
            parse_mode: 'Markdown',
            ...keyboards('main', {ctx}),
        });
        // await ctx.scene.enter('destinationWizard', {filterId: ctx.filter.id});
    });
};
