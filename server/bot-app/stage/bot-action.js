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
const {
  removePhoneNumbers,
  removeTelegramHeader,
  formatOwnerUsername,
} = require('../../utils/general');

const LIMIT = 5;

module.exports = function(bot) {
  bot.action('load_search', async ctx => {
    await ctx.editMessageReplyMarkup(null);

    let text = ctx.session.lastQuestion;

    if (text) {
      ctx.session.page = 'load-search';

      const fakeMessageCtx = {
        ...ctx,
        message: {
          text,
          from: ctx.from,
          chat: ctx.chat,
          message_id: ctx.update.callback_query.message.message_id,
          date: Math.floor(Date.now() / 1000),
        },
      };

      await bot.handleUpdate(fakeMessageCtx);
    } else {
      const truckType = ctx.filter?.cargoType;

      if (truckType) {
        ctx.session.page = 'load-search';
        await ctx.reply(translate('enter-cargo-details'), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
      } else {
        await ctx.reply(translate('change-truck-type'), {
          parse_mode: 'Markdown',
          ...keyboards('truckTypes'),
        });
      }
    }
  });

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

  bot.action(/search_by_(.+)/, async ctx => {
    await ctx.editMessageReplyMarkup(null);
    const origin = ctx.match[1];
    await handleSearch(ctx, origin);
    trackButton(ctx, 'search_by', origin);
  });

  bot.action(/search_parent_(\d+)/, async ctx => {
    const { filter } = ctx;
    const originCityId = parseInt(ctx.match[1]);

    await ctx.editMessageReplyMarkup(null);

    filter.origin_city_id = originCityId;

    await findLoads(ctx, 0);
    await filter.save();

    trackButton(ctx, 'search_by_parent', originCityId);
  });

  bot.action(/open_message_info_([\da-zA-Z]+)_(\d+)_([a-zA-Z]+)/, async ctx => {
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2], 10);
    const type = ctx.match[3];
    const isLoad = type === 'Load';
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;
    const { user, filter } = ctx;

    let record = null;

    if (isLoad) {
      record = await Load.findByPk(recordId, {
        attributes: [
          'description',
          'url',
          'id',
          'openMessageCounter',
          'owner_id',
          'phone',
          'isArchived',
        ],
      });

      if (!record) {
        trackButton(ctx, 'open_message_info', `${recordId}_${index}_${type}`);
        const message = escapeChar(translate('warning.deleted-by-owner'));
        return await ctx.telegram.editMessageText(chatId, messageId, null, message, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.callback(
                  translate('go-back'),
                  `close_message_info_${recordId}_${index}_${type}`,
                ),
              ],
            ],
          },
        });
      }
    } else {
      record = await Vehicle.findByPk(recordId, {
        attributes: [
          'description',
          'url',
          'id',
          'openMessageCounter',
          'phone',
          'owner_id',
          'isArchived',
        ],
      });
    }

    if (record && !record.isArchived) {
      let message;
      let phoneButton = [];

      if (record.owner_id === user.id || user.hasActiveSubscription) {
        // handle case when user previews own ad or user has active subscription
        message = escapeChar(removeTelegramHeader(record.description).trim());
        if (record.url) {
          message = message + '\n\n' + `🔗 [${translate('to-message')}](${escapeChar(record.url)})`;
        }
      } else {
        let owner = record.owner_id ? await User.findByPk(record.owner_id) : null;
        let { text, removedPhones } = removePhoneNumbers(removeTelegramHeader(record.description));
        message = escapeChar(text);
        if (removedPhones.length || record.phone || owner?.phone) {
          phoneButton.push(
            Markup.button.callback(translate('phone'), `show_ad_phone_${recordId}_${index}_${type}`),
          );
        } else if (owner?.telegramUsername) {
          phoneButton.push(
            Markup.button.callback(
              translate('telegram'),
              `show_ad_phone_${recordId}_${index}_${type}`,
            ),
          );
        }
        if (record.url) {
          phoneButton.push(
            Markup.button.callback(
              translate('to-message'),
              `show_message_link_${recordId}_${index}_${type}`,
            ),
          );
        }
      }

      await ctx.telegram.editMessageText(chatId, messageId, null, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            phoneButton,
            [
              filter.user_search_id && user.id === filter.user_search_id
                ? isLoad
                  ? Markup.button.callback(
                    translate('delete-ad'),
                    `alert_delete_load_${recordId}_${index}`,
                  )
                  : Markup.button.callback(
                    translate('delete-ad'),
                    `alert_delete_vehicle_${recordId}_${index}`,
                  )
                : isLoad
                  ? Markup.button.callback(
                    translate('cargo-out-date'),
                    `alert_cargo_out_date_${recordId}_${index}`,
                  )
                  : Markup.button.callback(
                    translate('vehicle-not-valid'),
                    `alert_vehicle_not_valid_${recordId}_${index}`,
                  ),
              Markup.button.callback(
                translate('go-back'),
                `close_message_info_${recordId}_${index}_${type}`,
              ),
            ],
          ],
        },
      });

      record.openMessageCounter++;
      await record.save();
    } else {
      // HANDLE CASE WHEN RECORD IS ARCHIVED OR DELETED WHILE USER SEARCHS
      const startIndex = ctx.session.startIndex;
      const lastItemIndex = Math.round(index / 5) * 5;
      const isLastInList = startIndex + LIMIT === index;
      const count = ctx.session.resultsCount;
      const keyboard = [];

      if (isLastInList && lastItemIndex < count && count > 10) {
        keyboard.push([
          Markup.button.callback(
            translate('show-more', {
              nextIndex: index + 1,
              count,
            }),
            `show_more_${index}_${recordId}_${type}`,
          ),
        ]);
      }

      const newMessage = index + '\\. ' + escapeChar(translate('warning.record-already-removed'));
      await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    trackButton(ctx, 'open_message_info', `${recordId}_${index}_${type}`);
  });

  bot.action(/show_message_link_([\da-zA-Z]+)_(\d+)_([a-zA-Z]+)/, async ctx => {
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2], 10);
    const type = ctx.match[3];
    const isLoad = type === 'Load';
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    let res = await checkUserLimit(ctx, recordId, index, type);

    if (!res) {
      return;
    }

    const params = {
      attributes: [
        'description',
        'url',
        'id',
        'openMessageCounter',
        'phoneViewCounter',
        'phone',
        'owner_id',
        'isArchived',
      ],
    };
    const record = isLoad
      ? await Load.findByPk(recordId, params)
      : await Vehicle.findByPk(recordId, params);

    if (!record) {
      trackButton(ctx, 'show_message_link_', `${recordId}_${index}_${type}`);
      const message = escapeChar(translate('warning.deleted-by-owner'));
      return await ctx.telegram.editMessageText(chatId, messageId, null, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              Markup.button.callback(
                translate('go-back'),
                `close_message_info_${recordId}_${index}_${type}`,
              ),
            ],
          ],
        },
      });
    }
    record.phoneViewCounter++;
    await record.save();
    let message = `🔗 [${translate('to-message')}](${escapeChar(record.url)})`;
    await ctx.telegram.editMessageText(chatId, messageId, null, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback(
              translate('go-back'),
              `open_message_info_${recordId}_${index}_${type}`,
            ),
          ],
        ],
      },
    });

    trackButton(ctx, 'show_message_link_', `${recordId}_${index}_${type}`);
  });

  bot.action(/selected_subscription_([\da-zA-Z]+)_(\d+)_([a-zA-Z]+)/, async ctx => {
    const planId = ctx.match[1];
    const index = parseInt(ctx.match[2], 10);
    const type = ctx.match[3];
    const userId = ctx.user.id

    const record = await Plan.findOne({ where: { id: planId } });
    await sendInvoice(ctx, record, userId);

    trackButton(ctx, 'selected_subscription_', `${record.id}_${index}_${type}`);
  });

  bot.action(/show_ad_phone_([\da-zA-Z]+)_(\d+)_([a-zA-Z]+)/, async ctx => {
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2], 10);
    const type = ctx.match[3];
    const isLoad = type === 'Load';
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    try {
      let res = await checkUserLimit(ctx, recordId, index, type);
      if (!res) {
        return;
      }

      const params = {
        attributes: [
          'description',
          'url',
          'id',
          'openMessageCounter',
          'phoneViewCounter',
          'phone',
          'owner_id',
          'isArchived',
        ],
      };
      const record = isLoad
        ? await Load.findByPk(recordId, params)
        : await Vehicle.findByPk(recordId, params);

      let owner = record.owner_id ? await User.findByPk(record.owner_id) : null;

      if (record) {
        record.phoneViewCounter++;
        await record.save();
      }
      if (record && !record.isArchived) {
        let phones = removePhoneNumbers(record.description).removedPhones;
        let message = '';
        if (record.phone || owner.phone || phones.length) {
          message +=
            formatPhoneNumber(phones[0] || record.phone || owner?.phone) +
            formatOwnerUsername(owner, phones[0] || record.phone);
        } else {
          message += formatOwnerUsername(owner, phones[0] || record.phone);
        }
        await ctx.telegram.editMessageText(chatId, messageId, null, message, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.callback(
                  translate('go-back'),
                  `open_message_info_${recordId}_${index}_${type}`,
                ),
              ],
            ],
          },
        });
      } else {
        const startIndex = ctx.session.startIndex;
        const lastItemIndex = Math.round(index / 5) * 5;
        const isLastInList = startIndex + LIMIT === index;
        const count = ctx.session.resultsCount;
        const keyboard = [];

        if (isLastInList && lastItemIndex < count && count > 10) {
          keyboard.push([
            Markup.button.callback(
              translate('show-more', {
                nextIndex: index + 1,
                count,
              }),
              `show_more_${index}_${recordId}_${type}`,
            ),
          ]);
        }

        const newMessage = index + '\\. ' + escapeChar(translate('warning.record-already-removed'));
        await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: keyboard },
        });
      }

      trackButton(ctx, 'show_ad_phone', `${recordId}_${index}_${type}`);
    } catch (e) {
      console.log(e);
    }
  });

  bot.action(/close_message_info_([\da-zA-Z]+)_(\d+)_([a-zA-Z]+)/, async ctx => {
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2], 10);
    const type = ctx.match[3];
    const isLoad = type === 'Load';
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;
    const filter = ctx.filter;

    const record = isLoad
      ? await Load.findByPk(recordId, {
        include: [
          { model: User, as: 'owner' },
          { model: Good, as: 'good' },
        ],
      })
      : await Vehicle.findByPk(recordId, { include: [{ model: User, as: 'owner' }] });

    if (isLoad) {
      if (!record) {
        trackButton(ctx, 'open_message_info_', `${recordId}_${index}_${type}`);
        const message = escapeChar(translate('warning.deleted-by-owner'));
        return await ctx.telegram.editMessageText(chatId, messageId, null, message, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.callback(
                  translate('more'),
                  `open_message_info_${recordId}_${index}_${type}`,
                ),
              ],
            ],
          },
        });
      }
    }

    const message = await generateMessage(
      record,
      index,
      isLoad ? DEFAULT_MESSAGE_TEMPLATE : VEHICLE_MESSAGE_TEMPLATE,
      ctx.user,
    );

    const { startIndex } = ctx.session;
    const lastItemIndex = Math.round(index / 5) * 5;
    const count = ctx.session.resultsCount;
    const isLastInList = startIndex + LIMIT === index || count === index;
    const keyboard = [
      [Markup.button.callback(translate('more'), `open_message_info_${recordId}_${index}_${type}`)],
    ];

    if (isLastInList && lastItemIndex < count && count > 10) {
      if (count - index === 0) {
        keyboard.push([]);
      } else if (index + LIMIT > count) {
        keyboard.push([
          Markup.button.callback(
            translate('count-left', {
              count: count - index,
            }),
            `show_more_${index}_${recordId}_${type}`,
          ),
        ]);
      } else {
        keyboard.push([
          Markup.button.callback(
            translate('show-more', {
              nextIndex: index + 1,
              count,
            }),
            `show_more_${index}_${recordId}_${type}`,
          ),
        ]);
      }
      if (!isLoad) {
        const countryId = ctx.session.selectedCountryId;
        keyboard.push([
          Markup.button.callback(translate('commands.go-back'), `selected_country_${countryId}`),
        ]);
      }
    } else if (isLastInList) {
      if (!isLoad && !filter.user_search_id) {
        const countryId = ctx.session.selectedCountryId;
        keyboard.push([
          Markup.button.callback(translate('commands.go-back'), `selected_country_${countryId}`),
        ]);
      }
    }

    await ctx.telegram.editMessageText(chatId, messageId, null, message.caption, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  bot.action(/alert_cargo_out_date_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const loadId = ctx.match[1];
    const index = parseInt(ctx.match[2]);
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const message = escapeChar(translate('alert-cargo-out-date'));
    await ctx.telegram.editMessageText(chatId, messageId, null, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback(
              translate('confirm'),
              `confirm_cargo_out_date_${loadId}_${index}`,
            ),
            Markup.button.callback(
              translate('cancel'),
              `open_message_info_${loadId}_${index}_Load`,
            ),
          ],
        ],
      },
    });

    trackButton(ctx, 'alert_cargo_out_date_', `${loadId}_${index}`);
  });

  bot.action(/alert_vehicle_not_valid_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2]);
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const message = escapeChar(translate('alert-vehicle-not-valid'));
    await ctx.telegram.editMessageText(chatId, messageId, null, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback(
              translate('confirm'),
              `confirm_vehicle_not_valid_${recordId}_${index}`,
            ),
            Markup.button.callback(
              translate('cancel'),
              `open_message_info_${recordId}_${index}_Vehicle`,
            ),
          ],
        ],
      },
    });

    trackButton(ctx, 'alert_vehicle_not_valid_', `${recordId}_${index}`);
  });

  bot.action(/alert_delete_load_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const loadId = ctx.match[1];
    const index = parseInt(ctx.match[2]);
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const message = escapeChar(translate('alert-delete-ad'));
    await ctx.telegram.editMessageText(chatId, messageId, null, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback(translate('confirm'), `delete_load_by_owner_${loadId}_${index}`),
            Markup.button.callback(
              translate('cancel'),
              `open_message_info_${loadId}_${index}_Load`,
            ),
          ],
        ],
      },
    });

    trackButton(ctx, 'alert_delete_load_', `${loadId}_${index}`);
  });

  bot.action(/alert_delete_vehicle_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const vehicleId = ctx.match[1];
    const index = parseInt(ctx.match[2]);
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const message = escapeChar(translate('alert-delete-ad'));
    await ctx.telegram.editMessageText(chatId, messageId, null, message, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback(
              translate('confirm'),
              `delete_vehicle_by_owner_${vehicleId}_${index}`,
            ),
            Markup.button.callback(
              translate('cancel'),
              `open_message_info_${vehicleId}_${index}_Vehicle`,
            ),
          ],
        ],
      },
    });

    trackButton(ctx, 'alert_delete_vehicle_', `${vehicleId}_${index}`);
  });

  bot.action(/confirm_vehicle_not_valid_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const user = ctx.user;
    const recordId = ctx.match[1];
    const index = parseInt(ctx.match[2]);

    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const vehicle = await Vehicle.findByPk(recordId);

    if (vehicle) {
      if (!user.markedInvalidVehicles || !user.markedInvalidVehicles.includes(vehicle.id)) {
        let oldIds = user.markedInvalidVehicles || [];
        user.markedInvalidVehicles = [vehicle.id.toString(), ...oldIds];
        vehicle.invalidButtonCounter++;

        await Promise.all([user.save(), vehicle.save()]);
      }

      const startIndex = ctx.session.startIndex;
      const lastItemIndex = Math.round(index / 5) * 5;
      const isLastInList = startIndex + LIMIT === index;
      const count = ctx.session.resultsCount;

      const newMessage = index + '\\. ' + escapeChar(translate('successful-archived'));
      const keyboard = [];

      if (isLastInList && lastItemIndex < count && count > 10) {
        keyboard.push([
          Markup.button.callback(
            translate('show-more', {
              nextIndex: index + 1,
              count,
            }),
            `show_more_${index}_${recordId}_Vehicle`,
          ),
        ]);
      }

      await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
      });

      trackButton(ctx, 'confirm_vehicle_not_valid_', `${recordId}_${index}`);

      ctx.answerCbQuery(translate('user-request-accepted'), true);
    } else {
      ctx.answerCbQuery(translate('error.500'), true);
    }
  });

  bot.action(/confirm_cargo_out_date_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const user = ctx.user;
    const loadId = ctx.match[1];
    const index = parseInt(ctx.match[2]);

    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    const load = await Load.findByPk(loadId);

    if (load) {
      if (!user.markedExpiredLoads || !user.markedExpiredLoads.includes(load.id)) {
        let oldIds = user.markedExpiredLoads || [];
        user.markedExpiredLoads = [load.id.toString(), ...oldIds];
        load.expirationButtonCounter++;

        await Promise.all([user.save(), load.save()]);
      }

      const startIndex = ctx.session.startIndex;
      const lastItemIndex = Math.round(index / 5) * 5;
      const isLastInList = startIndex + LIMIT === index;
      const count = ctx.session.resultsCount;

      const newMessage = index + '\\. ' + escapeChar(translate('successful-archived'));
      const keyboard = [];

      if (isLastInList && lastItemIndex < count && count > 10) {
        keyboard.push([
          Markup.button.callback(
            translate('show-more', {
              nextIndex: index + 1,
              count,
            }),
            `show_more_${index}_${loadId}_Load`,
          ),
        ]);
      }

      await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
      });

      trackButton(ctx, 'confirm_cargo_out_date_', `${loadId}_${index}`);

      ctx.answerCbQuery(translate('user-request-accepted'), true);
    } else {
      ctx.answerCbQuery(translate('error.500'), true);
    }
  });

  bot.action(/delete_vehicle_by_owner_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const user = ctx.user;
    const vehicleId = ctx.match[1];
    const index = parseInt(ctx.match[2]);

    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    try {
      await Vehicle.update(
        { isDeleted: true, deletedAt: new Date() },
        {
          where: {
            owner_id: user.id,
            id: vehicleId,
          },
        },
      );
    } catch (e) {
      ctx.answerCbQuery(translate('error.500'), true);
    }

    const newMessage = index + '\\. ' + escapeChar(translate('successful-deleted-ad'));
    await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    });
    trackButton(ctx, `delete_vehicle_by_owner`, `${vehicleId}_${index}`);
  });

  bot.action(/delete_load_by_owner_([\da-zA-Z]+)_(\d+)/, async ctx => {
    const user = ctx.user;
    const loadId = ctx.match[1];
    const index = parseInt(ctx.match[2]);

    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;

    try {
      await Load.update(
        { isDeleted: true, deletedAt: new Date() },
        { where: { owner_id: user.id, id: loadId } },
      );
    } catch (e) {
      ctx.answerCbQuery(translate('error.500'), true);
    }

    const newMessage = index + '\\. ' + escapeChar(translate('successful-deleted-ad'));
    await ctx.telegram.editMessageText(chatId, messageId, null, newMessage, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    });
    trackButton(ctx, `delete_load_by_owner_`, `${loadId}_${index}`);
  });

  bot.action(/search_for_([a-zA-Z'`-]+)(?:_([a-zA-Z'`-]+))?/, async ctx => {
    const city1 = ctx.match[1]; // First city name
    const city2 = ctx.match[2]; // Second city name (optional)

    await ctx.editMessageReplyMarkup(null);

    if (city2) {
      const text = `${city1} ${city2}`;

      await handleSearch(ctx, text);
      trackButton(ctx, 'search_for', text);
    } else {
      await handleSearch(ctx, city1);
      trackButton(ctx, 'search_for', city1);
    }
  });

  bot.action(/show_more_(\d+)_(\d+[\da-zA-Z]+)_([a-zA-Z]+)/, async ctx => {
    const index = parseInt(ctx.match[1]);
    const lastId = ctx.match[2];
    const type = ctx.match[3];

    if (type === 'Vehicle') {
      await findVehicles(ctx, index, lastId);
    } else {
      await findLoads(ctx, index, lastId);
    }

    trackButton(ctx, 'show_more', `${index}-${lastId}-${type}`);

    ctx.session.startIndex = index;
  });

  bot.action('change_truck_type', async ctx => {
    await ctx.editMessageReplyMarkup(null);

    await ctx.reply(translate('change-truck-type'), keyboards('truckTypes'));
    trackButton(ctx, 'change-truck-type');
  });

  bot.action(/selected_country_(.+)/, async ctx => {
    await ctx.editMessageReplyMarkup(null);

    const locale = i18n.getLocale();
    const lang = locale === 'uz' ? 'uz' : 'ru';
    const selectedCountryId = ctx.match[1];
    ctx.session.selectedCountryId = selectedCountryId;

    const [[{ total_vehicles, vehicles_today }], results] = await Promise.all([
      sequelize.query(
        `
          SELECT
            COUNT(DISTINCT v.id) AS total_vehicles,
            COUNT(
              CASE
                WHEN v.published_date AT TIME ZONE 'GMT+5' >= CURRENT_DATE AT TIME ZONE 'GMT+5'
                  AND v.published_date AT TIME ZONE 'GMT+5' < (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'GMT+5'
                THEN 1
                ELSE NULL
              END
            ) AS vehicles_today
          FROM vehicles v
          WHERE v.origin_country_id = :countryId
            AND v.is_archived = false
            AND v.is_deleted = false;
          `,
        {
          replacements: { countryId: selectedCountryId },
          type: Sequelize.QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `
          SELECT * FROM (
            (
              SELECT
                c.id,
                c.name_${lang} AS name,
                COUNT(DISTINCT v.id) AS vehicle_count
              FROM vehicles v
              JOIN cities c ON v.origin_city_id = c.id
              WHERE c.country_id = :countryId
                AND v.origin_country_id = :countryId
                AND v.is_archived = false
                AND v.is_deleted = false
              GROUP BY c.id, c.name_${lang}
            )
            UNION ALL
            (
              SELECT
                0 AS id,
                :otherName AS name,
                COUNT(DISTINCT v.id) AS vehicle_count
              FROM vehicles v
              WHERE v.origin_city_id IS NULL
                AND v.origin_country_id = :countryId
                AND v.is_archived = false
                AND v.is_deleted = false
              GROUP BY v.origin_country_id
              HAVING COUNT(DISTINCT v.id) > 0
            )
          ) AS combined
          ORDER BY
            CASE
              WHEN id = 1 THEN 0
              WHEN id = 0 THEN 2
              ELSE 1
            END,
            name ASC;
          `,
        {
          replacements: {
            countryId: selectedCountryId,
            otherName: translate('other'),
          },
          type: sequelize.QueryTypes.SELECT,
        },
      ),
    ]);

    const buttons = results.reduce((acc, result, index) => {
      if (index % 2 === 0) acc.push([]);
      acc[acc.length - 1].push({
        text: `${result.name} - ${result.vehicle_count}`,
        callback_data: `selected_city_${selectedCountryId}_${result.id}`,
      });
      return acc;
    }, []);

    buttons.push([
      {
        text: translate('commands.go-back'),
        callback_data: 'go_back_country',
      },
    ]);

    await ctx.reply(
      translate('query-result-message-without-cargo', {
        count: total_vehicles,
        todayCounter: vehicles_today,
      }),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons,
        },
      },
    );

    trackButton(ctx, 'selected_country_', selectedCountryId);
  });

  bot.action(/selected_city_(\d+)_(\d+)/, async ctx => {
    await ctx.editMessageReplyMarkup(null);

    const parts = ctx.match[0].split('_');
    const countryId = parseInt(parts[2]);
    const selectedCityId = parseInt(parts[3]);
    const filter = ctx.filter;

    filter.user_search_id = null;

    const query = {
      where: {
        isArchived: false,
        isDeleted: false,
        origin_country_id: countryId,
        origin_city_id: selectedCityId === 0 ? { [Op.eq]: null } : selectedCityId,
      },
    };

    ctx.session.vehicleQuery = query;
    await findVehicles(ctx, 0);
    await filter.save();
    trackButton(ctx, 'selected_city_', selectedCityId);
  });

  bot.action('go_back_country', async ctx => {
    await ctx.editMessageReplyMarkup(null);

    const locale = i18n.getLocale();
    const lang = locale === 'uz' ? 'uz' : 'ru';

    ctx.session.selectedCountryId = null;

    const results = await sequelize.query(
      `
      SELECT cn.id as country_id, cn.name_${lang}, COUNT(DISTINCT v.id) as vehicle_count
      FROM vehicles v
      JOIN countries cn ON v.origin_country_id = cn.id
      WHERE v.is_archived = false
        AND v.is_deleted = false
      GROUP BY cn.id, cn.name_${lang};
    `,
      {
        type: sequelize.QueryTypes.SELECT,
        raw: true,
      },
    );

    const buttons = [];
    for (let i = 0; i < results.length; i += 2) {
      buttons.push(
        results.slice(i, i + 2).map(result => ({
          text: `${result[`name_${lang}`]} - ${result.vehicle_count}`,
          callback_data: `selected_country_${result.country_id}`,
        })),
      );
    }

    buttons.push([
      {
        text: translate('commands.go-back'),
        callback_data: 'go_back',
      },
    ]);

    await ctx.reply(translate('select-country'), {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
    trackButton(ctx, 'go_back_country');
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

    await ctx.reply(translate('accepted-agreement'), {
      parse_mode: 'HTML',
      ...keyboards('main', { ctx }),
    });
    trackButton(ctx, 'accept-agreement');
  });

  // bot.action(/subscription_(.+)/, async (ctx) => {
  //   const planId = ctx.match[1];
  //   let plan = await Plan.findByPk(parseInt(planId));

  //   await sendInvoice(ctx, plan);
  //   trackButton(ctx, 'select_subscription', planId);
  // });

  bot.on('pre_checkout_query', ctx => {
    ctx.answerPreCheckoutQuery(true);
  });

  bot.on('successful_payment', async ctx => {
    const currentMessageId = ctx.message.message_id;

    try {
      const locale = i18n.getLocale();
      const user = ctx.user;
      const paymentInfo = ctx.message.successful_payment;
      const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';
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
            plan: chosenPlan['name' + capitalize(lang)],
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
