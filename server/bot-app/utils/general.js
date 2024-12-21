require('dotenv').config();
const { Markup } = require('telegraf');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { capitalize } = require('lodash');
dayjs.extend(utc);
dayjs.extend(timezone);

const { translate } = require('../utils/translate');
const {
  User,
  Load,
  Vehicle,
  City,
  Good,
  Country,
  Op,
  ButtonTrack,
  UserTelegramQuery,
  Plan,
  sequelize,
  Sequelize,
  StatisticsLoadKiloPrice,
} = require('../../../db/models');
const {
  generateMessage,
  escapeChar,
  escapeCharBtn,
  VEHICLE_MESSAGE_TEMPLATE,
  DEFAULT_MESSAGE_TEMPLATE,
} = require('../utils/generate-message');
const { keyboards } = require('../utils/keyboards');
const i18n = require('../../services/i18n-config');

const LIMIT = 5;
const DEFAULT_LANG = 'uz';

async function findLoads(ctx, startIndex, lastRecordId) {
  const { query, countQuery } = await getCountAndQuery(ctx, startIndex);
  let [{ rows, count }, todayCounter] = await Promise.all([
    Load.findAndCountAll(query),
    startIndex === 0
      ? Load.count({
          where: {
            ...countQuery,
            publishedDate: {
              [Op.gte]: dayjs().tz('Etc/GMT-5').startOf('day').toDate(),
            },
          },
        })
      : null,
  ]);

  const { filter } = ctx;
  const { cargoType, origin_city_id, destination_city_id, isDagruz } = filter;

  if (startIndex === 0 && count > 10) {
    rows = rows.slice(0, 5);
  }

  if (!filter.user_search_id) {
    ctx.session.page = 'search-results';
  }

  ctx.session.resultsCount = count;
  ctx.session.startIndex = 0;

  if (count === 0) {
    if (filter.user_search_id) {
      await ctx.reply(translate('no-has-ad'), {
        parse_mode: 'Markdown',
        ...keyboards('backWithType', { ctx }),
      });
    } else {
      const keyboard = [];

      if (cargoType || isDagruz) {
        const type = isDagruz ? translate('dagruz') : translate(`truck-type.${cargoType}`);
        keyboard.push([
          Markup.button.callback(
            translate('change-current-truck-type', { type }),
            'change_truck_type'
          ),
        ]);
      }
      const locale = i18n.getLocale();
      const lang = locale === 'uz' ? 'uz' : 'ru';

      if (filter.origin_city_id) {
        const originCity = await City.findByPk(filter.origin_city_id, {
          raw: true,
          include: [{ model: City, as: 'groupCity', attributes: ['name_uz', 'name_ru', 'id'] }],
        });

        if (originCity.parent_id) {
          keyboard.push([
            Markup.button.callback(
              translate('search-by-parent', {
                origin: escapeChar(originCity[`groupCity.name_${lang}`]),
                destination: escapeChar(filter.destinationCityName),
              }),
              `search_parent_${originCity.parent_id}`
            ),
          ]);
        } else {
          keyboard.push([
            Markup.button.callback(
              translate('search-by', { origin: escapeCharBtn(filter.originCityName) }),
              `search_by_${filter.originCityName}`
            ),
          ]);
        }

        await ctx.reply(translate('warning.not-found-query'), {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: keyboard },
        });
      } else if (!filter.origin_city_id && filter.origin_country_id) {
        keyboard.push([
          Markup.button.callback(
            translate('search-by', { origin: escapeCharBtn(filter.originCityName) }),
            `search_by_${filter.originCityName}`
          ),
        ]);

        await ctx.reply(translate('warning.not-found-query'), {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await ctx.reply(translate('warning.not-found-query'), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
      }
    }

    return;
  }

  if (startIndex !== 0 && typeof lastRecordId !== undefined) {
    await editLastMessage(ctx, 'Load', lastRecordId, startIndex);
  }

  if (startIndex === 0) {
    await ctx.reply(
      translate(cargoType ? 'query-result-message' : 'query-result-message-without-cargo', {
        count,
        todayCounter,
        cargo: translate('truck-type.' + cargoType),
      }),
      { parse_mode: 'Markdown', ...keyboards('backWithType', { ctx }) }
    );

    if (origin_city_id && destination_city_id) {
      let stat = await StatisticsLoadKiloPrice.findOne({
        where: { origin_city_id, destination_city_id },
        order: [['date', 'DESC']],
      });

      if (stat) {
        await ctx.reply(translate('stat-with-kilo', { price: Math.round(stat.average) }), {
          parse_mode: 'Markdown',
          ...keyboards('backWithType', { ctx }),
        });
      }
    }
  }

  const [ownerIds, goodsIds] = await Promise.all([
    rows.filter(row => row.owner_id !== null).map(row => row.owner_id),
    rows.filter(row => row.good_id !== null).map(row => row.good_id),
  ]);

  const [goods, owners] = await Promise.all([
    Good.findAll({
      where: {
        id: {
          [Op.in]: goodsIds,
        },
      },
    }),
    User.findAll({
      where: {
        id: {
          [Op.in]: ownerIds,
        },
      },
    }),
  ]);

  const updatedRows = rows.map(row => {
    if (!row.owner_id) {
      return {
        ...row.get({ plain: true }),
        owner: null,
      };
    }

    if (!row.good_id) {
      return {
        ...row.get({ plain: true }),
        good: null,
      };
    }

    const owner = owners.find(user => user.id === row.owner_id);
    const good = goods.find(good => good.id === row.good_id);

    return {
      ...row.get({ plain: true }),
      owner: owner ? owner.get({ plain: true }) : null,
      good: good ? good.get({ plain: true }) : null,
    };
  });

  for (let i = 0; i < updatedRows.length; i++) {
    let row = updatedRows[i];

    const message = await generateMessage(
      row,
      startIndex + i + 1,
      DEFAULT_MESSAGE_TEMPLATE,
      ctx.user
    );
    const isLast = i === updatedRows.length - 1;

    try {
      await replyMessage(ctx, 'Load', message, isLast, startIndex, count);
    } catch (error) {
      console.error(error);
      await ctx.reply(' ');
    }
  }

  return { count };
}

async function getCountAndQuery({ filter, user, session }, index, limit) {
  const { cargoType, isDagruz } = filter;

  let where = {
    isArchived: false,
    isDeleted: false,
    expirationButtonCounter: { [Op.lt]: 3 },
    openMessageCounter: { [Op.lt]: 28 },
    createdAt: {
      [Op.gt]: Sequelize.literal("NOW() - INTERVAL '7 days'"),
    },
  };

  if (filter.user_search_id) {
    // Search for MY LOADS section
    where.owner_id = filter.user_search_id;
  } else {
    // Search for ALL LOADS section
    if (user) {
      where.id = { [Op.notIn]: user.markedExpiredLoads || [] };
    }

    if (!filter.originLatlng) {
      // Prepare the promises for fetching origin and destination countries
      const originCountryPromise = Country.findAll({
        where: { parent_id: filter.origin_country_id },
        attributes: ['id'],
        raw: true,
      });

      const destinationCountryPromise = filter.destination_country_id
        ? Country.findAll({
            where: { parent_id: filter.destination_country_id },
            attributes: ['id'],
            raw: true,
          })
        : Promise.resolve([]);

      // Prepare the promises for fetching origin and destination cities
      const originCityPromise = filter.origin_city_id
        ? getChildCityIds([filter.origin_city_id])
        : Promise.resolve([]);

      const destinationCityPromise = filter.destination_city_id
        ? getChildCityIds([filter.destination_city_id])
        : Promise.resolve([]);

      // Wait for all promises to resolve in parallel
      const [originCityIds, destinationCityIds, originCountries, destinationCountries] =
        await Promise.all([
          originCityPromise,
          destinationCityPromise,
          originCountryPromise,
          destinationCountryPromise,
        ]);

      // Process origin countries
      const countryIds = originCountries.map(country => country.id);
      where.origin_country_id =
        countryIds.length > 0
          ? { [Op.in]: [filter.origin_country_id, ...countryIds] }
          : filter.origin_country_id;

      // Process destination countries
      if (filter.destination_country_id) {
        const countryIds = destinationCountries.map(country => country.id);
        where.destination_country_id =
          countryIds.length > 0
            ? { [Op.in]: [filter.destination_country_id, ...countryIds] }
            : filter.destination_country_id;
      } else {
        where.destination_country_id = { [Op.not]: null };
      }

      // Process origin cities
      if (filter.origin_city_id) {
        where.origin_city_id =
          originCityIds.length > 0
            ? { [Op.in]: [filter.origin_city_id, ...originCityIds] }
            : filter.origin_city_id;
      }

      // Process destination cities
      if (filter.destination_city_id) {
        where.destination_city_id =
          destinationCityIds.length > 0
            ? { [Op.in]: [filter.destination_city_id, ...destinationCityIds] }
            : filter.destination_city_id;
      }
    } else {
      let [lat, lng] = filter.originLatlng;

      const closestCities = await City.findAll({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn(
                'ST_DWithin',
                sequelize.col('latlng'),
                sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', lat, lng), 4326),
                10000
              ),
              true
            ),
          ],
        },
        order: [
          [
            sequelize.fn(
              'ST_Distance',
              sequelize.col('latlng'),
              sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', lat, lng), 4326)
            ),
            'ASC',
          ],
        ],
        raw: true,
        limit: 5,
        attributes: ['id'],
      });

      const cityIds = closestCities.map(({ id }) => id);

      if (cityIds.length) {
        where.origin_city_id = { [Op.in]: cityIds };

        let destinationCityName = filter.destinationCityName;
        let json = {
          origin_city_id: null,
          destination_city_id: null,
          origin_country_id: null,
          destination_country_id: null,
          originCityName: null,
        };

        if (destinationCityName) {
          let destination = await findSimilarCityName(destinationCityName);

          if (destination) {
            json.destinationCityName = destinationCityName;

            if (destination.type === 'city') {
              const ids = await getChildCityIds([destination.id]);

              json.destination_city_id = destination.id;
              json.destination_country_id = destination.country_id;

              where.destination_city_id = { [Op.in]: [destination.id, ...ids] };
              where.destination_country_id = destination.country_id;
            } else {
              json.destination_country_id = destination.id;
              where.destination_country_id = destination.id;
            }
            // } else {
            //   ctx.reply('destination city not found');
          }
        }

        // await filter.update(json);
      }
    }
  }

  where[Op.and] = where[Op.and] || [];

  const duplicationAndCountryConditions = [
    {
      duplication_counter: {
        [Op.lt]: 245,
      },
      destination_country_id: {
        [Op.in]: [1, 8],
      },
      origin_country_id: {
        [Op.in]: [1, 8],
      },
    },
    {
      duplication_counter: {
        [Op.lt]: 650,
      },
      [Op.or]: [
        {
          destination_country_id: {
            [Op.ne]: 1,
          },
        },
        {
          origin_country_id: {
            [Op.ne]: 1,
          },
        },
      ],
    },
  ];

  let cargoTypeConditions = [];

  if (cargoType) {
    cargoTypeConditions = [{ cargoType }, { cargoType2: cargoType }];

    if (cargoType === 'isuzu') {
      cargoTypeConditions.push(
        { cargoType: 'small_isuzu' },
        { cargoType2: 'big_isuzu' },
        { cargoType: 'big_isuzu' },
        { cargoType2: 'small_isuzu' }
      );
    } else if (cargoType === 'small_isuzu') {
      cargoTypeConditions.push(
        {
          cargoType: 'not_specified',
          cargoType2: 'not_specified',
          weight: {
            [Op.gte]: 3,
            [Op.lt]: 6,
          },
        },
        {
          cargoType: 'isuzu',
          [Op.or]: [
            {
              weight: {
                [Op.gte]: 3,
                [Op.lt]: 6,
              },
            },
            {
              weight: null,
            },
          ],
        },
        {
          cargoType2: 'isuzu',
          [Op.or]: [
            {
              weight: {
                [Op.gte]: 3,
                [Op.lt]: 6,
              },
            },
            {
              weight: null,
            },
          ],
        }
      );
    } else if (cargoType === 'big_isuzu') {
      cargoTypeConditions.push(
        {
          cargoType: 'not_specified',
          cargoType2: 'not_specified',
          weight: {
            [Op.gte]: 10,
            [Op.lt]: 17,
          },
        },
        {
          cargoType: 'isuzu',
          [Op.or]: [
            {
              weight: {
                [Op.gte]: 10,
                [Op.lt]: 17,
              },
            },
            {
              weight: null,
            },
          ],
        },
        {
          cargoType2: 'isuzu',
          [Op.or]: [
            {
              weight: {
                [Op.gte]: 10,
                [Op.lt]: 17,
              },
            },
            {
              weight: null,
            },
          ],
        }
      );
    } else if (cargoType === 'reefer') {
      cargoTypeConditions.push({ cargoType: 'reefer-mode' }, { cargoType2: 'reefer-mode' });
    } else if (cargoType === 'tented') {
      cargoTypeConditions.push({
        cargoType: 'not_specified',
        cargoType2: 'not_specified',
        weight: {
          [Op.gte]: 20,
        },
      });
    } else if (cargoType === 'labo') {
      cargoTypeConditions.push({
        origin_country_id: 1,
        destination_country_id: 1,
        cargoType2: 'not_specified',
        cargoType: 'not_specified',
        weight: {
          [Op.lt]: 1,
        },
      });
    }
  }

  where[Op.and].push({ [Op.or]: duplicationAndCountryConditions });

  if (cargoType) {
    where[Op.and].push({ [Op.or]: cargoTypeConditions });
    where[Op.and].push({ isDagruz: false });
  }

  if (isDagruz) {
    where[Op.and].push({ isDagruz: true });

    let id = session.userQueryId;
    if (id) {
      await UserTelegramQuery.update({ truckType: 'dagruz' }, { where: { id } });
    }
  }

  const query = {
    where,
    limit: limit ? limit : index === 0 ? 10 : LIMIT,
    offset: index,
    order: [
      ['created_at', 'DESC'],
      ['distance', 'ASC'],
      ['price', 'DESC'],
      [
        sequelize.literal(`
           CASE
             WHEN phone IS NULL THEN 0
             ELSE 1
           END
         `),
        'DESC',
      ],
      // ['load_ready_date', 'DESC'],
      // Sequelize.literal(`
      //   CASE
      //     WHEN duplication_counter < 10 THEN duplication_counter
      //     ELSE NULL
      //   END DESC
      // `),
    ],
  };

  return { query, countQuery: where };
}

async function replyMessage(ctx, modelType, message, isLast, startIndex, count) {
  const { id, caption, index } = message;
  const { user, filter } = ctx;
  let keyboard = [];

  keyboard.push([
    Markup.button.callback(translate('more'), `open_message_info_${id}_${index}_${modelType}`),
  ]);

  if (isLast && count > 9) {
    const buttons = await getButtons(ctx, modelType, startIndex, count, id);
    keyboard = [...keyboard, ...buttons];
  }

  if (isLast && modelType === 'Vehicle' && !filter.user_search_id) {
    const countryId = ctx.session.selectedCountryId;
    keyboard.push([
      Markup.button.callback(translate('commands.go-back'), `selected_country_${countryId}`),
    ]);
  }

  await ctx.reply(caption, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function getButtons(ctx, modelType, index, count, lastRecordId) {
  const nextIndex = index + LIMIT;
  const keyboard = [];
  const filter = ctx.filter;

  if (nextIndex < count) {
    if (nextIndex + LIMIT > count) {
      keyboard.push([
        Markup.button.callback(
          translate('count-left', {
            count: count - nextIndex,
          }),
          `show_more_${nextIndex}_${lastRecordId}_${modelType}`
        ),
      ]);
    } else {
      keyboard.push([
        Markup.button.callback(
          translate('show-more', {
            nextIndex: nextIndex + 1,
            count,
          }),
          `show_more_${nextIndex}_${lastRecordId}_${modelType}`
        ),
      ]);
    }

    // if (!filter.isSaved && filter.destination_country_id !== null) {
    //   keyboard.push([Markup.button.callback(translate('commands.set-current-filter'), `set_filter_${nextIndex}_${lastRecordId}`)]);
    // }
  }
  return keyboard;
}

async function editLastMessage(ctx, modelName, id, index) {
  const chatId = ctx.update.callback_query.message.chat.id;
  const messageId = ctx.update.callback_query.message.message_id;
  const isLoad = modelName === 'Load';
  const Record = sequelize.models[modelName];

  if (id === 0) {
    try {
      await ctx.telegram.editMessageText(chatId, messageId, null, '----------------', {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (e) {
      console.error(e);
      await ctx.reply(' ');
    }
  } else {
    try {
      const record = await Record.findOne({ where: { id } });
      let { caption } = await generateMessage(
        record,
        index,
        isLoad ? DEFAULT_MESSAGE_TEMPLATE : VEHICLE_MESSAGE_TEMPLATE,
        ctx.user
      );
      let keyboard = [
        [
          Markup.button.callback(
            translate('more'),
            `open_message_info_${id}_${index}_${modelName}`
          ),
        ],
      ];

      caption = caption + '\\.\u200B'; // prevent "message is not modified" error

      await ctx.telegram.editMessageText(chatId, messageId, null, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (e) {
      console.error(e);
      await ctx.reply(' ');
    }
  }
}

const handleBotHearsCommand = (bot, phrase, handler) => {
  bot.hears((text, ctx) => text === getTranslatedCommand(phrase, ctx), handler);
};

async function handleSearch(ctx, question, settingFitler = false, queryModel) {
  let [departure, arrival, hasDestination, truckType] = await extractFromTo(question);

  queryModel = await queryModel;
  if (queryModel) {
    if (departure?.type === 'city') {
      queryModel.resolved_origin_city_id = departure?.id;
      queryModel.resolved_origin_country_id = departure?.country_id;
    } else {
      queryModel.resolved_origin_country_id = departure?.id;
    }

    if (arrival?.type === 'city') {
      queryModel.resolved_destination_city_id = arrival?.id;
      queryModel.resolved_destination_country_id = arrival?.country_id;
    } else {
      queryModel.resolved_destination_country_id = arrival?.id;
    }

    await queryModel.save();
  }

  // if (departure && arrival || departure && hasDestination && !settingFitler) {  // didn't tested settingFitler after updates
  if (departure) {
    try {
      const props = {
        owner_id: ctx.user.id,
        originCityName: departure.name_uz,
      };

      if (arrival) {
        props.destinationCityName = arrival.name_uz;
      }

      if (departure.type === 'city') {
        props.origin_city_id = departure.id;
        props.origin_country_id = departure.country_id;
      } else {
        props.origin_country_id = departure.id;
      }

      if (arrival) {
        if (arrival.type === 'city') {
          props.destination_city_id = arrival.id;
          props.destination_country_id = arrival.country_id;
        } else {
          props.destination_country_id = arrival.id;
        }
      }

      const filter = ctx.filter;
      const json = {
        user_search_id: null,
        originCityName: departure.name_uz,
        destinationCityName: arrival?.name_uz || null,
        origin_city_id: props.origin_city_id || null,
        origin_country_id: props.origin_country_id || null,
        destination_city_id: props.destination_city_id || null,
        destination_country_id: props.destination_country_id || null,
      };

      if (truckType) {
        json.cargoType = truckType;
      }

      await filter.update(json);

      if (settingFitler && departure && arrival) {
        await ctx.reply(
          translate('filter-details', { departure: departure.name_uz, arrival: arrival.name_uz }),
          {
            parse_mode: 'HTML',
            ...Markup.keyboard([[translate('save-filter'), translate('cancel')]]),
          }
        );
        return true;
      } else {
        return await findLoads(ctx, 0);
      }

      // return true;
    } catch (error) {
      console.error(error);
      await ctx.replyWithMarkdown(translate('error.500'));
      return false;
    }
  } else {
    const keyboard = [
      [Markup.button.callback('Toshkent', `search_for_Toshkent`)],
      [Markup.button.callback('Toshkent Samarqand', `search_for_Toshkent_Samarqand`)],
      [Markup.button.callback('Samarqand Toshkent', `search_for_Samarqand_Toshkent`)],
    ];

    ctx.reply(translate('warning.not-found-query-examples', { question }), {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    return false;
  }
}

const getTranslatedCommand = (phrase, ctx) =>
  translate({ phrase, locale: ctx.session.language || DEFAULT_LANG });

async function findSimilarCityName(input, isStrict = false, resultCount = 1) {
  if (!input) return [];

  input = input.toLowerCase();

  try {
    const results = await sequelize.query(
      `
      WITH city_variants AS (
        SELECT
          id,
          name_uz,
          name_ru,
          unnest(string_to_array(names, ',')) AS name_variant,
          country_id
        FROM cities
      ),
      country_variants AS (
        SELECT
          id,
          name_uz,
          name_ru,
          unnest(string_to_array(names, ',')) AS name_variant
        FROM countries
      ),
      all_variants AS (
        SELECT id, name_uz, name_ru, name_variant, 'city' AS type, country_id
        FROM city_variants
        WHERE similarity(name_variant, :input) > 0.3
        UNION
        SELECT id, name_uz, name_ru, name_variant, 'country' AS type, NULL AS country_id
        FROM country_variants
        WHERE similarity(name_variant, :input) > 0.3
      )
      SELECT
        id,
        name_uz,
        name_ru,
        name_variant,
        type,
        country_id,
        similarity(name_variant, :input) AS sim_score,
        LEVENSHTEIN(name_variant, :input) AS levenshtein_dist
      FROM all_variants
      ORDER BY sim_score DESC, levenshtein_dist ASC
      LIMIT ${resultCount};
      `,
      {
        replacements: { input },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    if (results.length > 0) {
      let nameVariant = results[0].name_variant.split(/[\s-]+/);
      let inputTextParts = input.split(/[\s-]+/);

      if (nameVariant.length !== inputTextParts.length && isStrict) {
        return [];
      }

      return results;
    }
  } catch (error) {
    console.error('Database query failed:', error);
  }

  return [];
}

function cleanupTruckTrailerType(text) {
  const regex1 = new RegExp('\\\\n', 'g');
  text = text.trim().replace(regex1, ' ');

  for (const [key, values] of Object.entries(TRUCK_TYPES)) {
    for (const value of values) {
      const regex = new RegExp(
        `(^|\\s|[0-9.,'"!?\\-:;\\/])${value}($|\\s|[0-9.,'"!?\\-:;\\/])`,
        'gi'
      );
      if (regex.test(text)) {
        text = text.replace(regex, ' ').trim();

        return { truckType: key, updatedText: text };
      }
    }
  }

  return { truckType: null, updatedText: text };
}

async function extractFromTo(text) {
  const { truckType, updatedText } = cleanupTruckTrailerType(text);
  const normalizedText = text.replace(/[-\s]+/g, ' ');
  const parts = normalizedText.split(' ');

  if (parts.length === 1) {
    return [(await findSimilarCityName(parts[0]))[0], null, null, truckType];
  }

  let fromResult = null;
  let toResult = null;
  let fromCity = '';
  let toCity = '';

  for (let i = 1; i <= parts.length; i++) {
    let potentialFromCity = parts.slice(0, i).join(' ');
    let [result] = await findSimilarCityName(potentialFromCity, true);

    // if (result && (!fromResult || fromResult.sim_score < result.sim_score)) {
    if (result) {
      fromCity = potentialFromCity;
      fromResult = result;
    }
  }

  if (!fromCity) {
    fromCity = parts[0];
  }

  let remainingParts = parts.slice(fromCity.split(' ').length).join(' ');

  if (remainingParts.length > 0) {
    let destinationParts = remainingParts.split(' ');

    for (let i = 1; i <= destinationParts.length; i++) {
      let potentialToCity = destinationParts.slice(0, i).join(' ');
      let [result] = await findSimilarCityName(potentialToCity, true);

      if (result) {
        toCity = potentialToCity;
        toResult = result;
      }
    }

    for (let start = 1; start < destinationParts.length; start++) {
      for (let i = start + 1; i <= destinationParts.length; i++) {
        let potentialToCity = destinationParts.slice(start, i).join(' ');
        let [result] = await findSimilarCityName(potentialToCity, true);

        if (result && (!toResult || toResult.sim_score < result.sim_score)) {
          toCity = potentialToCity;
          toResult = result;
          break;
        }
      }

      if (toCity) {
        break;
      }
    }

    if (!toResult) {
      let [nonStrictToResult] = await findSimilarCityName(remainingParts, false);
      if (nonStrictToResult) {
        toResult = nonStrictToResult;
      }
    }
  }

  return [fromResult, toResult, remainingParts?.length > 0, truckType];
}

async function trackButton(ctx, name, params) {
  const { callbackQuery, user } = ctx;

  if (user?.id) {
    await ButtonTrack.create({
      user_id: user.id,
      name,
      text: callbackQuery?.message?.text || null,
      params,
    });
  }
}

async function getChildCityIds(parentIds) {
  const childCities = await City.findAll({
    where: { parent_id: { [Op.in]: parentIds } },
    attributes: ['id'],
    raw: true,
  });

  if (childCities.length === 0) {
    return [];
  }

  const childCityIds = childCities.map(city => city.id);

  const moreChildCityIds = await getChildCityIds(childCityIds);

  return [...childCityIds, ...moreChildCityIds];
}

async function findVehicles(ctx, startIndex, lastRecordId) {
  const query = ctx.session.vehicleQuery;

  let totalCount = await Vehicle.count(query);

  query.limit = totalCount <= 10 ? 10 : LIMIT;
  query.offset = startIndex;
  query.order = [
    ['created_at', 'DESC'],
    ['isWebAd', 'DESC'],
  ];

  let { rows, count } = await Vehicle.findAndCountAll(query);

  if (count === 0 && query.where?.owner_id) {
    await ctx.reply(translate('no-has-ad'), keyboards('back'));
  }

  if (count > 0) {
    await ctx.reply(translate('commands.loading'), keyboards('back'));
  }

  ctx.session.resultsCount = count;
  ctx.session.startIndex = 0;

  if (startIndex !== 0 && typeof lastRecordId !== undefined) {
    await editLastMessage(ctx, 'Vehicle', parseInt(lastRecordId), startIndex);
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      let row = rows[i];
      const message = await generateMessage(
        row,
        startIndex + i + 1,
        VEHICLE_MESSAGE_TEMPLATE,
        ctx.user
      );
      const isLast = i === rows.length - 1;

      await replyMessage(ctx, 'Vehicle', message, isLast, startIndex, count);
    } catch (error) {
      console.error(error);
      await ctx.reply(' ');
    }
  }
}

async function checkUserLimit(ctx, recordId, index, type) {
  const { user, filter } = ctx;
  const isLoad = type === 'Load';
  const messageId = ctx.callbackQuery.message.message_id;
  const chatId = ctx.callbackQuery.message.chat.id;
  const locale = i18n.getLocale();
  const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';

  if (filter.user_search_id) {
    return false;
  }

  if (!user.hasActiveSubscription) {
    const searchLimit = isLoad ? user.loadSearchLimit : user.vehicleSearchLimit;

    if (searchLimit < 1) {
      const plans = await Plan.findAll({ order: [['id', 'ASC']] });
      let keyboard = [];
      let row = [];

      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        row.push(
          Markup.button.callback(
            plan['name' + capitalize(lang)],
            `selected_subscription_${plan.id}_${i}_${type}`
          )
        );

        if ((i + 1) % 2 === 0 || i === plans.length - 1) {
          keyboard.push(row);
          row = [];
        }
      }

      const limit = isLoad ? 20 : 2;
      const message = translate('warning.limit-reached-subscription', { limit });
      await ctx.telegram.editMessageText(chatId, messageId, null, message, {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            ...keyboard,
            [
              Markup.button.callback(
                translate('go-back'),
                `open_message_info_${recordId}_${index}_${type}`
              ),
            ],
          ],
        },
      });

      return false;
    }

    if (isLoad) {
      user.loadSearchLimit--;
    } else {
      user.vehicleSearchLimit--;
    }

    await user.save();
  }

  return true;
}

const TRUCK_TYPES = {
  small_isuzu: [
    'кичик изузи',
    'майда исузи',
    'mayda isuzi',
    'кичик исузу',
    'кичик исузи',
    'kichchik isuzu',
    'kichik isuzi',
    'kichkina isuzu',
    'kichkina isuzi',
    'kichkina izuzi',
    'исузи кичкина',
    'кичкина исузи',
    'исузу кичкина',
    'кичкина исузу',
    'кичкина изузи',
    'кичкина эсузи',
    'kichkina esuzi',
    'кичкина  есузи',
    'маленький исузу',
  ],
  big_isuzu: [
    'katta isuzi',
    `kichik isuz`,
    'mayda isuzu',
    'мини фура',
    'kata isuzu',
    'katta izuzi',
    'исузи катта',
    'катта исузи',
    'катта исузу',
    'катта изузи',
    'катта эсузи',
    'katta esuzi',
    'katta isuzu',
    'kotta isuzi',
    'kotta izuzi',
    'исузи котта',
    'котта исузи',
    'котта исузу',
    'котта изузи',
    'котта эсузи',
    'kotta esuzi',
    'большой исузу',
    'kotta isuzu',
    'исузу катта',
    'кота эсузи',
    'кота исузу',
    'кота исузи',
    'катта изузу',
    'катта исюзи',
  ],
  isuzu: ['isuzi', 'izuzi', 'исузи', 'изузи', 'izuzu', 'эсузи', 'исузу', 'esuzi', 'usuzi', 'isuzu'],
  tented: [
    'tent',
    'chodirli',
    'tentli',
    ' ten ',
    'temtofka',
    'tend',
    'тент',
    'тенд',
    'тентованный',
    'тентофка',
    'тентовка',
    'tentovka',
    'tentofka',
    'тентовки',
    'тенты',
    'тента',
    'тентов',
    'тент кк',
    'tent kk',
    'tentlar',
    'тентлар',
    'tentofkalar',
    'tentopka',
    'tentga',
    'tentovkalar',
  ],
  reefer: ['ref', 'reefer', 'реф', 'reflar', 'рефлар', 'refrejerator', 'рефа', 'рефов'],
  fa2: ['faf', 'fav', 'фав', 'faw', 'faz', 'фаф'],
  mega: ['мега', 'меге', 'mega', 'mege'],
  labo: ['лабо', 'labo', 'damas', 'дамас'],
  kamaz: ['камаз', 'kamaz', 'qamaz'],
  flatbed: ['площадка', 'ploshadka', 'plashadka'],
  barge: ['шаланда', 'shalanda'],
  lowboy: ['трал', 'тралл', 'tral', 'traller', 'тралы', 'трала'],
  containership: ['контейнеровоз', 'konteyneravoz'],
  locomotive: [
    'паровоз',
    'parovoz',
    'paravoz',
    'паравоз',
    'поезд',
    'паровой',
    'паровой_поезд',
    'автопаровоз',
    'автопаравоз',
    'паравозлар',
    'paravozlar',
    'паровозы',
    'parvoz',
  ],
  chakman: ['chakman', 'чакман', 'chacman', 'чакмон', 'шакман', 'shakman'],
  man: ['man', 'ман'],
  sprinter: ['sprinter', 'sprintr', 'спринтер', 'спринтр'],
  gazel: ['gazel', 'газел', 'газель'],
  avtovoz: ['avtovoz', 'автовоз', 'автовозы', 'avtovozlar'],
  kia_bongo: [
    'kia bongo',
    'киа бонго',
    'киа bongo',
    'kia бонго',
    'bongo',
    'бонго',
    'кияа бонго',
    'кия бонго',
    'kiya bongo',
  ],
  isotherm: [
    'изотерма',
    'изотерм',
    'izoterm',
    'izoterma',
    'изотермы',
    'isotherm',
    'isoterm',
    'izotermalar',
    'изотермалар',
  ],
};

const sendInvoice = async (ctx, plan, userId) => {
  const locale = i18n.getLocale();
  const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';

  return ctx.replyWithInvoice({
    chat_id: ctx.chat.id,
    title: plan['name' + capitalize(lang)],
    description: plan['description' + capitalize(lang)],
    payload: JSON.stringify({
      plan_id: plan.id,
      user_id: userId,
    }),
    provider_token: process.env.PAYCOM_TOKEN,
    currency: 'UZS',
    prices: [{ label: plan['name' + capitalize(lang)], amount: plan.price * 100 }],
    start_parameter: 'search_bot',
    need_phone_number: true,
    need_shipping_address: false,
    is_flexible: false,
  });
};

module.exports = {
  findLoads,
  findVehicles,
  getCountAndQuery,
  replyMessage,
  getButtons,
  editLastMessage,
  handleBotHearsCommand,
  handleSearch,
  trackButton,
  sendInvoice,
  findSimilarCityName,
  checkUserLimit,
};
