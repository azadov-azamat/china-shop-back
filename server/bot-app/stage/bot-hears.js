const {Markup} = require('telegraf');

const {translate} = require('../utils/translate');
const {keyboards, LANGUAGE} = require('../utils/keyboards');
const i18n = require('../../services/i18n-config');

const {
    handleBotHearsCommand,
    trackButton
} = require('../utils/general');

module.exports = function (bot) {
    handleBotHearsCommand(bot, 'commands.help', async ctx => {
        await ctx.reply(translate('help'), {parse_mode: 'Markdown', disable_web_page_preview: true});
        trackButton(ctx, 'help');
    });

    handleBotHearsCommand(bot, 'commands.settings', async ctx => {
        ctx.session.page = 'settings';

        await ctx.reply(translate('commands.settings'), {
            parse_mode: 'Markdown',
            ...keyboards('settings'),
        });
        // trackButton(ctx, 'settings');
    });

    handleBotHearsCommand(bot, 'commands.language', async ctx => {
        ctx.session.page = 'language';
        await ctx.reply(translate('select-language'), {
            ...keyboards('language')
        });
        trackButton(ctx, 'language');
    });

    handleBotHearsCommand(bot, 'commands.change-contact', async ctx => {
        ctx.session.page = 'change-contact';
        await ctx.reply(translate('request-contact'), {
            ...keyboards('contact')
        });
        trackButton(ctx, 'change-contact');
    });

    handleBotHearsCommand(bot, 'commands.change-current-location', async ctx => {
        ctx.session.page = 'change-current-location';
        await ctx.reply(translate('share-location'), {
            ...keyboards('location')
        });
        trackButton(ctx, 'change-current-location');
    });

    handleBotHearsCommand(bot, 'commands.get-comment', async ctx => {
        ctx.session.page = 'get-comment';
        await ctx.reply(translate('get-comment'), {
            ...keyboards('back')
        });
        trackButton(ctx, 'get-comment');
    });

    handleBotHearsCommand(bot, 'commands.go-back', async ctx => {
        const page = ctx.session.page;

        if (['language', 'change-contact', 'change-current-location'].includes(page)) {
            ctx.session.page = 'settings';
            await ctx.reply(translate('commands.settings'), keyboards('settings'));
        } else {
            await ctx.reply(translate('main-menu'), keyboards('main', {ctx}));
            ctx.session.page = 'main';
        }
        trackButton(ctx, 'go-back');
    });


    handleBotHearsCommand(bot, 'cancel', async ctx => {
        ctx.session.page = 'main';
        await ctx.reply(translate('main-menu'), keyboards('main', {ctx}));
    });

    handleBotHearsCommand(bot, 'accept-agreement', async ctx => {
        const user = ctx.user;
        if (user && user.isAgreed) {
            trackButton(ctx, 'user_again_accepted_agreement', user.id);
            return ctx.reply(translate('already-accepted'));
        }
        user.isAgreed = true;
        await user.save();

        await ctx.reply(translate('accepted-agreement'), {parse_mode: 'HTML'});
        if (!ctx.user.phone) {
            ctx.session.page = 'share-contact';
            await ctx.reply(translate('request-contact'), keyboards('contact'));
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
                const {text} = ctx.message;
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
                    await ctx.reply(translate('selected-language', {lang: text}), {
                        parse_mode: 'HTML',
                        ...keyboards('main', {ctx}),
                    });
                }
                trackButton(ctx, 'change-language', chosenLanguage);
            } catch (e) {
                console.log(e);
            }
        }
    );
};
