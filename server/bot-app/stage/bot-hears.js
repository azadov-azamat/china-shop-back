const { Markup } = require('telegraf');
const dayjs = require('dayjs');
const { query } = require('express');
const { Sequelize } = require('sequelize');
const { capitalize } = require('lodash');

const { translate } = require('../utils/translate');
const { keyboards, LANGUAGE, TRUCK_TYPES } = require('../utils/keyboards');
const i18n = require('../../services/i18n-config');
const {
  SearchFilter,
  Subscription,
  City,
  Country,
  sequelize,
  Op,
  Vehicle,
  Plan,
} = require('../../../db/models');
const {
  handleBotHearsCommand,
  trackButton,
  sendInvoice,
  findLoads,
  findVehicles,
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

  handleBotHearsCommand(bot, 'commands.quick-search', async ctx => {
    ctx.session.page = 'quick-search';
    await ctx.reply(translate('select-search-type'), {
      parse_mode: 'Markdown',
      ...keyboards('searchTypes'),
    });
  });

  handleBotHearsCommand(bot, 'commands.load-search', async ctx => {
    const filter = ctx.filter;
    const truckType = filter.cargoType;

    ctx.session.page = 'load-search';

    if (truckType) {
      if (filter.originCityName && filter.destinationCityName) {
        const keyboard = [
          [
            Markup.button.callback(
              filter.originCityName + ' - ' + filter.destinationCityName,
              `search_for_${filter.originCityName}_${filter.destinationCityName}`
            ),
          ],
        ];

        await ctx.reply(translate('search-for-latest-query'), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });

        await ctx.reply(translate('enter-cargo-without-details'), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
      } else {
        await ctx.reply(translate('enter-cargo-details'), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
      }
    } else {
      await ctx.reply(translate('change-truck-type'), {
        parse_mode: 'Markdown',
        ...keyboards('truckTypes'),
      });
    }
  });

  handleBotHearsCommand(bot, 'commands.set-filter', async ctx => {
    const user = ctx.user;
    ctx.session.page = 'filter-settings';

    const filter = await SearchFilter.findOne({
      where: { owner_id: user.id, isSaved: true },
      raw: true,
    });

    if (filter) {
      const text = translate('current-filter', {
        originCity: filter.originCityName,
        destinationCity: filter.destinationCityName,
      });
      await ctx.reply(text, { parse_mode: 'HTML', ...keyboards('filters') });
    } else {
      ctx.session.page = 'set-filter';
      await ctx.reply(translate('set-filter-info'), {
        parse_mode: 'Markdown',
        ...keyboards('back'),
      });
    }
  });

  handleBotHearsCommand(bot, 'commands.change-filter', async ctx => {
    ctx.session.page = 'set-filter';
    await ctx.reply(translate('set-filter-info'), { parse_mode: 'Markdown', ...keyboards('back') });
  });

  handleBotHearsCommand(bot, 'commands.unsubscribe', async ctx => {
    const user = ctx.user;
    ctx.session.page = 'main';

    await SearchFilter.update({ isSaved: false }, { where: { owner_id: user.id, isSaved: true } });
    await ctx.reply(translate('successfully-unsubscribed'), keyboards('main', { ctx }));
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

  handleBotHearsCommand(bot, 'save-filter', async ctx => {
    const filter = ctx.filter;

    filter.isSaved = true;
    await filter.save();

    ctx.session.page = 'main';

    ctx.reply(translate('filter-saved'), { parse_mode: 'Markdown', ...keyboards('main', { ctx }) });
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

    await ctx.reply(translate('accepted-agreement'), {
      parse_mode: 'HTML',
      ...keyboards('main', { ctx }),
    });
    trackButton(ctx, 'accept-agreement');
  });

  handleBotHearsCommand(bot, 'commands.subscriptions', async ctx => {
    ctx.session.page = 'subscriptions';
    await ctx.reply(translate('choose-subscription-menu'), keyboards('subscriptions'));
    trackButton(ctx, 'subscriptions');
  });

  handleBotHearsCommand(bot, 'commands.active-subscriptions', async ctx => {
    ctx.session.page = 'active-subscriptions';
    const userSubscriptions = await Subscription.findAll({
      where: { user_id: ctx.user.id, endDate: { [Op.gt]: dayjs().toDate() } },
      include: [{ model: Plan, as: 'plan' }],
    });

    if (!userSubscriptions.length) {
      return await ctx.reply(
        translate('user-have-not-active-subscriptions'),
        keyboards('subscriptions')
      );
    }

    await ctx.reply(translate('user-active-subscriptions'), keyboards('back'));

    const locale = i18n.getLocale();
    const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';

    for (let subscription of userSubscriptions) {
      const { plan } = subscription;
      await ctx.reply(
        translate('card-bought-subscription', {
          plan: plan['name' + capitalize(lang)],
          price: plan.price,
          status: translate(subscription.status),
          createdAt: dayjs(subscription.createdAt).format('DD-MM-YYYY (HH:mm)'),
          endDate: dayjs(subscription.endDate).format('DD-MM-YYYY (HH:mm)'),
        }),
        { parse_mode: 'Markdown' }
      );
    }

    trackButton(ctx, 'active-subscriptions');
  });

  handleBotHearsCommand(bot, 'commands.list-subscriptions', async ctx => {
    ctx.session.page = 'list-subscriptions';
    const userId = ctx.user.id
    await ctx.reply(translate('commands.list-subscriptions'), keyboards('back'));

    try {
      const locale = i18n.getLocale();
      const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';
      const currentSubscription = await Subscription.findOne({
        where: { user_id: ctx.user.id, endDate: { [Op.gt]: dayjs().toDate() } },
      });

      const plans = await Plan.findAll({ order: [['id', 'ASC']] });
      for (const plan of plans) {
        if (currentSubscription) {
          await ctx.reply(
            translate('card-subscription', {
              plan: plan['name' + capitalize(lang)],
              price: plan.price,
            })
          );
        } else {
          await sendInvoice(ctx, plan, userId);
        }
      }
      trackButton(ctx, 'list-subscriptions');
    } catch (e) {
      console.log(e);
    }
  });

  handleBotHearsCommand(bot, 'commands.change-direction', async ctx => {
    await ctx.scene.enter('destinationWizard', { filterId: ctx.filter.id, skipFirstStep: true });
  });

  handleBotHearsCommand(bot, 'commands.my-ads', async ctx => {
    ctx.session.page = 'my-ads';
    await ctx.reply(translate('my-ads-title'), keyboards('selectLoadOrVehicle'));
  });

  handleBotHearsCommand(bot, 'commands.add-new-ads', async ctx => {
    ctx.session.page = 'add-new-ads';
    await ctx.reply(translate('my-ads-title'), keyboards('addNewAds', { ctx }));
    trackButton(ctx, 'add-new-ads');
  });

  handleBotHearsCommand(bot, 'commands.my-loads', async ctx => {
    ctx.session.page = 'my-loads';

    await SearchFilter.destroy({ where: { owner_id: ctx.user.id } });
    ctx.filter = await SearchFilter.create({ owner_id: ctx.user.id, user_search_id: ctx.user.id });
    // await ctx.reply(translate('your-ads'), keyboards('back'));
    await findLoads(ctx, 0);
    trackButton(ctx, 'my-ads.my-loads');
  });

  handleBotHearsCommand(bot, 'commands.my-vehicles', async ctx => {
    ctx.session.page = 'my-vehicles';

    await SearchFilter.destroy({ where: { owner_id: ctx.user.id } });
    ctx.filter = await SearchFilter.create({ owner_id: ctx.user.id, user_search_id: ctx.user.id });

    ctx.session.vehicleQuery = {
      where: {
        owner_id: ctx.user.id,
      },
    };
    // await ctx.reply(translate('your-ads'), keyboards('back'));
    await findVehicles(ctx, 0);
    trackButton(ctx, 'my-ads.my-vehicles');
  });

  handleBotHearsCommand(bot, 'commands.vehicle-search', async ctx => {
    const locale = i18n.getLocale();
    const lang = locale === 'uz' ? 'uz' : 'ru';

    ctx.session.page = 'vehicle';

    const [[{ total_vehicles, vehicles_today }], countryResults] = await Promise.all([
      sequelize.query(
        `
            SELECT
                COUNT(*) AS total_vehicles,
                COUNT(
                    CASE
                        WHEN published_date AT TIME ZONE 'GMT+5' >= CURRENT_DATE AT TIME ZONE 'GMT+5'
                        AND published_date AT TIME ZONE 'GMT+5' < (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'GMT+5'
                        THEN 1
                        ELSE NULL
                    END
                ) AS vehicles_today
            FROM vehicles
            WHERE
                is_archived = false
                AND is_deleted = false;
            `,
        { type: Sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
            SELECT cn.id as country_id, cn.name_${lang}, COUNT(DISTINCT v.id) as vehicle_count
            FROM vehicles v
            JOIN countries cn ON v.origin_country_id = cn.id
            WHERE v.is_archived = false
              AND v.is_deleted = false
            GROUP BY cn.id, cn.name_${lang}
            ORDER BY
              CASE WHEN cn.id = 1 THEN 0 ELSE 1 END,
              cn.name_${lang} ASC;
            `,
        { type: sequelize.QueryTypes.SELECT, raw: true }
      ),
    ]);

    const buttons = [];
    for (let i = 0; i < countryResults.length; i += 2) {
      buttons.push(
        countryResults.slice(i, i + 2).map(result => ({
          text: `${result[`name_${lang}`]} - ${result.vehicle_count}`,
          callback_data: `selected_country_${result.country_id}`,
        }))
      );
    }

    buttons.push([
      {
        text: translate('commands.go-back'),
        callback_data: 'go_back',
      },
    ]);

    await ctx.reply('🚚💨💨💨💨', Markup.removeKeyboard());
    await ctx.reply(
      translate('query-result-message-without-cargo', {
        count: total_vehicles,
        todayCounter: vehicles_today,
      }),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );

    trackButton(ctx, 'vehicle_search');
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

  bot.hears(
    text => {
      return text.includes('🛻');
    },
    async ctx => {
      await ctx.reply(translate('change-truck-type'), keyboards('truckTypes'));
      trackButton(ctx, 'change-truck-type');
    }
  );

  bot.hears(
    text => {
      const translatedTypes = ['any', ...TRUCK_TYPES].map(type => {
        return type === 'dagruz' ? translate('dagruz') : translate(`truck-type.${type}`);
      });
      return translatedTypes.includes(text);
    },
    async ctx => {
      const filter = ctx.filter;
      const lastUpdated = dayjs(filter.updatedAt);
      const { page } = ctx.session;
      let { text } = ctx.message;
      let selectedType = 'any';

      // handle if dagruz
      if (text === translate('dagruz')) {
        filter.cargoType = null;
        filter.isDagruz = true;
      } else {
        for (let i = 0; i < TRUCK_TYPES.length; i++) {
          const type = TRUCK_TYPES[i];
          const translatedType = translate(`truck-type.${type}`);

          if (translatedType === text) {
            selectedType = type;
          }
        }

        filter.cargoType = selectedType !== 'any' ? selectedType : null;
        filter.isDagruz = false;
      }

      await filter.save();

      if (page === 'location-search') {
        await ctx.reply(translate('selected-truck-type', { type: text.toUpperCase() }), {
          parse_mode: 'Markdown',
        });
        await ctx.scene.enter('destinationWizard', {
          filterId: filter.id,
          destination: filter.destinationCityName || translate('skip'),
        });
      } else if (page === 'my-loads') {
        await ctx.reply(translate('selected-truck-type', { type: text.toUpperCase() }), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
        await findLoads(ctx, 0);
      } else {
        ctx.session.page = 'load-search';
        await ctx.reply(translate('selected-truck-type', { type: text.toUpperCase() }), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });

        const isWithinTwoMinutes = lastUpdated.isAfter(dayjs().subtract(2, 'minute'));
        if (isWithinTwoMinutes && page === 'search-results') {
          await findLoads(ctx, 0); // if filter was previously updated within the last 2 minutes than immediately start search
        } else if (filter.originCityName && filter.destinationCityName) {
          const keyboard = [
            [
              Markup.button.callback(
                filter.originCityName + ' - ' + filter.destinationCityName,
                `search_for_${filter.originCityName}_${filter.destinationCityName}`
              ),
            ],
          ];

          await ctx.reply(translate('search-for-latest-query'), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
          });

          await ctx.reply(translate('enter-cargo-without-details'), {
            parse_mode: 'Markdown',
            ...keyboards('backWithType', { ctx }),
          });
        } else {
          await ctx.reply(translate('enter-cargo-details'), {
            parse_mode: 'Markdown',
            ...keyboards('backWithType', { ctx }),
          });
        }
      }

      trackButton(ctx, 'set-truck-type', selectedType);
    }
  );
};
