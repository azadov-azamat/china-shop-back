require('dotenv').config();

const Promise = require('bluebird');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { createHash } = require('crypto');
const redisClient = require('../services/redis');
const { DAY } = require('time-constants');
const YAML = require('yaml');
const createQueue = require('./utils/create-queue');

const debug = require('debug')('worker:telegram-crawl');
const error = require('debug')('worker:telegram-crawl:error');
const { telegramClient, Api } = require('../services/telegram');
const { parseLoadData, parseDriverDetails } = require('../services/openai');

dayjs.extend(utc);
dayjs.extend(timezone);

const {
  User,
  Load,
  Vehicle,
  DistanceMatrix,
  TelegramChannelGroup,
  Spammer,
  Op,
  SpamWord, Good,
  sequelize,
  Sequelize,
} = require('../../db/models');
const { calculateDistanceMatrix, removeTelegramHeader, removePhoneNumbers, extractPhoneNumber } = require('../utils/general');
const { extractWatermark } = require('../utils/watermark');

const jobOptions = {
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

const queue = createQueue('telegram-crawl', { defaultJobOptions: jobOptions });
const vehicleLoadProcessorQueue = createQueue('process-vehicle-load', { defaultJobOptions: jobOptions });

// let i = 0;
async function processor() {
  debug(`started`);

  const client = telegramClient(process.env.TELEGRAM_API_SESSION);
  let client2 = null;

  try {
    await client.connect();
    const channels = await TelegramChannelGroup.findAll({ where: { disabled: false } });
    // i++
    await Promise.map(channels, async (channel) => {
      let currentClient = client;

      if (channel.id === '-1001234214428') {
        debug(`Crawling from Yuk_markazi_gruppa`);
        client2 = telegramClient(process.env.TELEGRAM_API_SESSION_SECOND);
        await client2.connect();
        currentClient = client2;
      }

      await processChannel(currentClient, channel);
      await (channel.shouldCrawlLoad ? archiveOldLoads(currentClient, channel.id).catch((err) => debug('Error updating or archiving loads: %O', err)) : null);
      await (channel.shouldCrawlVehicle ? archiveOldVehicles(currentClient, channel.id).catch((err) => debug('Error updating or archiving vehicles: %O', err)) : null);
    }, { concurrency: 1 });
  } catch (err) {
    error(err);
  } finally {
    await client.destroy();
    if (client2) {
      client2.destroy()
    }
  }
}

async function processChannel(client, channel) {
  debug(`processChannel ${channel.name}`);
  try {
    const savedMessages = await crawlChannelMessages(client, channel);
    if (savedMessages?.length) {
      channel.lastCrawledMessageId = savedMessages[0];
      channel.crawledDate = new Date();
      await channel.save();
    }
  } catch (err) {
    error(err);
  }
}

async function archiveOldLoads(client, channelId) {
  debug('Fetching up to 50 IDs of loads that need to be updated...');
  const loads = await Load.findAll({
    attributes: ['id', 'telegramMessageId'],
    where: {
      telegram_channel_id: channelId,
      updatedAt: {
        [Op.gt]: Sequelize.literal("NOW() - INTERVAL '3.1 day'")
      },
      duplicationCounter: {
        [Op.lt]: 50
      },
      telegramMessageId: {
        [Op.not]: null // Ensures telegramMessageId is not null
      },
      isDeleted: false,
      isArchived: false
    },
    order: [['updatedAt', 'ASC']], // Sorts by `updatedAt` in ascending order
    limit: isNightTime() ? 80 : 45
  });

  debug(`Found ${loads.length} loads to update: ${loads.map(load => load.telegramMessageId).join(', ')}`);

  const channel = await client.getEntity(channelId);
  const ids = loads.map(load => new Api.InputMessageID({ id: Number(load.telegramMessageId) }));

  const messages = (await client.getMessages(channel, { ids })).filter(Boolean);
  let existingIds = [];
  let deletedIds = [];

  // debug(`messages found ${messages.map(({ id })=> id )}`)

  // Corrected forEach loop and variable names
  loads.forEach(({ id, telegramMessageId }) => {
    let msg = messages.find(({ id })=> Number(id) === Number(telegramMessageId))
    if (msg) {
      existingIds.push(id);
    } else {
      deletedIds.push(id);
    }
  });

  if (existingIds.length > 0) {
    debug('Updating `updatedAt` field for the existing loads...');
    await Load.update(
      { updatedAt: Sequelize.literal('NOW()') },
      {
        where: {
          id: {
            [Op.in]: existingIds
          }
        }
      }
    );
    debug(`Successfully updated ${existingIds.join(',')} existing loads.`);
  } else {
    debug('No existing loads found to update.');
  }

  if (deletedIds.length > 0) {
    debug('Archiving the deleted loads...');
    await Load.update(
      { updatedAt: Sequelize.literal('NOW()'), isArchived: true, isDeleted: true, deletedAt: new Date() },
      {
        where: {
          id: {
            [Op.in]: deletedIds
          }
        }
      }
    );
    debug(`Successfully archived ${deletedIds.join(',')} deleted loads.`);
  } else {
    debug('No deleted loads found to archive.');
  }
}

async function archiveOldVehicles(client, channelId) {
  debug('Fetching up to 50 IDs of vehicles that need to be updated...');
  const vehicles = await Vehicle.findAll({
    attributes: ['id', 'telegramMessageId'],
    where: {
      telegram_channel_id: channelId,
      updatedAt: {
        [Op.gt]: Sequelize.literal("NOW() - INTERVAL '2.2 day'")
      },
      // duplicationCounter: {
      //   [Op.lt]: 50
      // },
      telegramMessageId: {
        [Op.not]: null
      },
      isDeleted: false,
      isArchived: false
    },
    order: [['updatedAt', 'ASC']],
    limit: isNightTime() ? 15 : 6
  });

  debug(`Found ${vehicles.length} vehicles to update: ${vehicles.map(vehicle => vehicle.telegramMessageId).join(', ')}`);

  const channel = await client.getEntity(channelId);
  const ids = vehicles.map(vehicle => new Api.InputMessageID({ id: Number(vehicle.telegramMessageId) }));

  const messages = (await client.getMessages(channel, { ids })).filter(Boolean);
  let existingIds = [];
  let deletedIds = [];

  // Corrected forEach loop and variable names
  vehicles.forEach(({ id, telegramMessageId }) => {
    let msg = messages.find(({ id })=> Number(id) === Number(telegramMessageId))
    if (msg) {
      existingIds.push(id);
    } else {
      deletedIds.push(id);
    }
  });

  if (existingIds.length > 0) {
    debug('Updating `updatedAt` field for the existing vehicles...');
    await Vehicle.update(
      { updatedAt: Sequelize.literal('NOW()') },
      {
        where: {
          id: {
            [Op.in]: existingIds
          }
        }
      }
    );
    debug(`Successfully updated ${existingIds.join(',')} existing vehicles.`);
  } else {
    debug('No existing vehicles found to update.');
  }

  if (deletedIds.length > 0) {
    debug('Archiving the deleted vehicles...');
    await Vehicle.update(
      { updatedAt: Sequelize.literal('NOW()'), isArchived: true, isDeleted: true, deletedAt: new Date() },
      {
        where: {
          id: {
            [Op.in]: deletedIds
          }
        }
      }
    );
    debug(`Successfully archived ${deletedIds.join(',')} deleted vehicles.`);
  } else {
    debug('No deleted vehicles found to archive.');
  }
}

function isNightTime() {
  const currentTime = dayjs().tz('Etc/GMT-5');
  const hour = currentTime.hour();
  return (hour > 1 && hour < 6);
}

async function crawlChannelMessages(client, channel) {
  let minId = channel.lastCrawledMessageId;
  if (minId && /[a-zA-Z]/.test(minId)) {
    minId = minId.slice(0, -1);
  }

  const props = { limit: isNightTime() ? 40 : 100, minId: parseInt(minId, 10) || undefined };
  const messages = await client.getMessages(channel.id, props);
  if (messages.length < 10) {
    debug(`Skipping ${channel.name} messages count too low: ${messages.length}`);
    return;
  }
  debug(`Crawling messages for ${channel.name}, found ${messages.length} messages`);

  if (!channel.title) {
    const { title } = await client.getEntity(channel.id);
    channel.title = title;
    await channel.save();
  }

  let batchText = [];
  let ids = await Promise.map(
    getUniqueByProperty(messages, 'id').filter(({ message }) => message),
    async message => {
      const { sender } = message;

      if (!sender || (sender.firstName === 'Deleted Account' && !sender.username)) {
        debug(`Skipping message from a deleted account:`, message.message);
        return message.id;
      }

      const messageText = removeTelegramHeader(message.message);
      const textHash = createHash('md5').update(messageText.toLowerCase().trim()).digest('hex');
      const textHash2 = createHash('md5').update(messageText).digest('hex');
      const textHash3 = createHash('md5').update(messageText.trim()).digest('hex');
      
      let loadIds = (await redisClient.get('load-message:' + textHash)) || (await redisClient.get('load-message:' + textHash2)) || (await redisClient.get('load-message:' + textHash3));
      let vehicleIds = (await redisClient.get('vehicle-message:' + textHash)) || (await redisClient.get('vehicle-message:' + textHash2)) || (await redisClient.get('vehicle-message:' + textHash3));
      loadIds = loadIds
        ?.split(',')
        .filter(val => !isNaN(val) && val != 1 && val);
      vehicleIds = vehicleIds?.split(',').filter((val) => val != 1 && val);

      if (channel.shouldCrawlVehicle && vehicleIds?.length) {
        const existingVehicle = await Vehicle.findAll({
          where: { id: vehicleIds },
          attributes: ['id'],
        });

        if (existingVehicle.length) {
          const existingIds = existingVehicle.map(load => load.id);
          let url = `https://t.me/${channel.name.trim()}/${message.id}`;
          await Promise.all([
            Vehicle.update(
              {
                url,
                telegram_channel_id: channel.id,
                telegramMessageId: message.id,
                publishedDate: new Date(message.date * 1000),
                isArchived: false,
                duplicationCounter: sequelize.literal('duplication_counter + 1'),
              },
              { where: { id: existingIds } },
            ),
            redisClient.set('vehicle-message:' + textHash, existingIds?.join(',') || '', 'EX', (DAY * 5) / 1000)
          ]);
        // } else if (!vehicleIds?.includes('1')) {
        //   await redisClient.del('vehicle-message:' + textHash);
        }

        debug(`Skipping vehicle message ${vehicleIds.join(', ')} as it is already processed.`);
        return message.id;
      }

      if (channel.shouldCrawlLoad && loadIds?.length) {
        const existingLoads = await Load.findAll({
          where: { id: loadIds },
          attributes: ['id'],
        });

        if (existingLoads.length) {
          const existingIds = existingLoads.map(load => load.id);
          let url = `https://t.me/${channel.name.trim()}/${message.id}`;

           await Promise.all([
             Load.update(
               {
                 url,
                 telegram_channel_id: channel.id,
                 telegramMessageId: message.id,
                 publishedDate: new Date(message.date * 1000),
                 // isArchived: sequelize.literal(`
                 //    CASE
                 //      WHEN duplication_counter < 280 THEN false
                 //      ELSE is_archived
                 //    END
                 // `),
                 // isArchived: false,
                 duplicationCounter: sequelize.literal('duplication_counter + 1'),
               },
               { where: { id: existingIds } }
             ),
             redisClient.set('load-message:' + textHash, existingIds?.join(',') || '', 'EX', (DAY * 5) / 1000)
           ]);
        // } else if (!loadIds?.includes('1')) {
        //   await redisClient.del('load-message:' + textHash);
        }

        debug(`Skipping load message ${loadIds.join(', ')} as it is already processed.`);
        return message.id;
      }

      const date = dayjs(new Date(message.date * 1000));
      let replacedText = messageText
        .replace(/\b(bugun|бугун|xozirga|хозирга|сейчас|hozir|hozrga|сегодня)\b/ig, date.format('DD-MMM-YY'))
        .replace(/\b(ertaga|ertalabga|eralab|ерталб|эртангига|ерталафка|эрталабга|ертагаликка|ертагалиk|ertagalik|ерталабга|эртага|завтра)\b/ig, date.add(1, 'day').format('DD-MMM-YY'))
        .replace(/(милйон)/g, 'миллион')
        .replace(/(➡️|👉)/g, ' -> ')
        .replace(/💰/g, '$');

      let text = capitalizeDestinationOriginWords(removeEmojis(removeEverySecondLineIfAllAreEmpty(insertFlagSequenceLine(replacedText)))).trim();
      const isDriverOffer = containsDriverOffer(text);

      if (isClosingMessage(text)) {
        if (message.forward && false) {
          // const originalSenderId = message.forward.fromId;
          // const originalMessageId = message.forward.channelPost;

          // let load = await Load.findOne({ where: { telegram_channel_id: channel.id, telegram_message_id: originalMessageId } });

          // if (load && load.telegramUserId === originalSenderId && !load.isArchived) {
          //   load.isArchived = true;
          //   await load.save();
          //   debug(`load close by user: ${load.id} url:${load.url}`);
          // }
        }
        // return message.id;
      }

      const isShortText = text.length <= 28;
      const isRecentAd = isWithinLastFourDays(message.date * 1000);
      text = text.replace(/пули нактд Тoшкентда/ig, 'пули нактд').replace(/срочно|sroshni|assalomu|alaykum|assalom|без посредников|диспетчерла безовта килмасин|здравствуйте|bismillah|напрямую от грузовладельца|самые высокие ставки|diqqat|aleykum|Assalomualaykum|груз готов|narx kelishamiz|siroshni|srochniy|Surochna|узидан|ставка нормальная|srochna|srochno|Шопир|сирочни|bezrejim|bez rejm|диспетчеры не нужны|shòpir akalar|Shopirakalar|Shopir akalar|akalar|актуальные грузы|акалар|bez rejim|яхшимисизлар|яхшимисиз|rejimsiz|Akala |хурматли|без режима|без режим|без температурного режима|без температуры|ассалому|ассалом|алайкум|диспетчерла билан ишламаймиз|алейкум/ig, '').replace(/ /g, ' ').replace(/\${3,}/g, '$$').replace(/(\-|\=){4,}/g, '---').replace(/(\_){4,}/g, '___').replace(/\n{4,}/g, '\n\n\n').replace(/(?<![\w\d])(96|105|120|130|140)(?!\d)\s*(?![\- ]*(kub|куб|сум|sum|kg|кг))/gi, '$1куб ').replace(/млн/gi, 'миллион').replace(/mln/gi, 'million').trim();

      const isSpammer = await isSenderSpammer(message.senderId);
      const isCopy = extractWatermark(message.message) === 'X';

      if (isRecentAd && !isShortText && !isSpammer && !(await containsSpam(text)) && !isCopy) {
        if (channel.shouldCrawlVehicle && isDriverOffer || !isDriverOffer && channel.shouldCrawlLoad) {
          batchText.push({ text, textHash, message, isDriverOffer });
        }
      }

      if (isDriverOffer) {
        debug(`Driver advert: ${message.message}`);
      }

      if (isCopy) {
        let url = `https://t.me/${channel.name.trim()}/${message.id}`;
        debug(`Copied advert: ${url}`);
      }

      return message.id;
    },
    { concurrency: 1 },
  );

  let textParse1 = [];
  let messageMap1 = [];
  let textParse2 = [];
  let messageMap2 = [];
  getUniqueByProperty(batchText, 'textHash').forEach(({ text, textHash, message, isDriverOffer }) => {
    if (isDriverOffer) {
      textParse2.push({ id: textParse2.length, text });
      messageMap2.push({ message, textHash });
    } else {
      textParse1.push({ id: textParse1.length, text });
      messageMap1.push({ message, textHash });
    }
  });

  if (textParse1.length < 6) {
    debug(`Skipping ${channel.name} messages to parse count too low: ${textParse1.length}`);
    return;
  }

  if (channel.shouldCrawlLoad && textParse1.length) {
    let textParseChunks = [];
    let chunkSize = 10;

    for (let i = 0; i < textParse1.length; i += chunkSize) {
      let maxLength = Math.max(...textParse1.slice(i, i + chunkSize).map(item => item.text.length));

      if (maxLength > 2100) {
        chunkSize = 4;
      } else if (maxLength < 350) {
        chunkSize = 14;
      } else {
        chunkSize = 10;
      }

      let remainingElements = textParse1.length - i;
      if (remainingElements < chunkSize) {
        // Adjust chunk size to fit remaining elements
        chunkSize = remainingElements;
      }

      // Push the chunk with the correct chunk size
      textParseChunks.push(textParse1.slice(i, i + chunkSize));
    }

    debug(`chunking before: ${textParse1.length} after:${textParseChunks.map((val) => val.length).join(', ')}`);
    // Process each chunk
    for (let chunk of textParseChunks) {
      let sortedData = YAML.stringify(chunk.sort((a, b) => b.text.length - a.text.length));
      let cargoDetails = await parseLoadData(sortedData);

      cargoDetails = cargoDetails
        .reduce((sum, { loads, id }) => {
          let isLowQuality = false;

          if (loads.length > 1) {
            isLowQuality = loads.every((val)=> !hasSomeFieldsFilled(val));
            if (isLowQuality) {
              debug("isLowQuality-test ", JSON.stringify(loads));
            }
          }

          loads?.forEach((item, index) => {
            item.id = id;
            item.index = index;
            item.isLowQuality = isLowQuality;
            item.hasMultipleMessages = loads.length > 1;
          });

          return sum.concat(loads);
        }, [])
        .filter(Boolean);

      let savedIds = (await Promise.map(
        cargoDetails,
        async (data) => {
          let { message, textHash, isLowQuality } = messageMap1[data.id] || {};
          let isValidData = data.origin && data.destination;
          if (message && isValidData && message.senderId && !isLowQuality) {
            try {
              // const alphabet = 'abcdefghijklmnopqrstuvwxyz';
              // const symbol = data.hasMultipleMessages
              //   ? alphabet[data.index % alphabet.length]
              //   : null;
              // const newId = createNewId(channel.localId, message.id, symbol);

              let params = [data.origin, data.destination, message.senderId, textHash];
              let paramsHash = createHash('md5').update(params.join('-')).digest('hex');

              let params2 = [data.origin.replace(/(dan|дан)$/ig, ''), data.destination.replace(/(ga|га|gacha|гача)$/ig), message.senderId, textHash];
              let paramsHash2 = createHash('md5').update(params2.join('-')).digest('hex');

              let duplicateLoad = await Load.findOne({
                where: {
                  [Op.or]: [
                    { paramsHash },
                    { paramsHash: paramsHash2 }
                  ],
                  publishedDate: {
                    [Op.gte]: dayjs().subtract(4, 'day').toDate(),
                  }
                }
              });

              if (!duplicateLoad && data.phone?.length > 8) {
                let goods = cleanupGoods(data.goods);
                if (goods) {
                  duplicateLoad = await Load.findOne({
                    where: {
                      originCityName: {
                        [Op.iLike]: `%${data.origin.replace(/(dan|дан)$/ig, '')}%`
                      },
                      destinationCityName: {
                        [Op.iLike]: `%${data.destination.replace(/(ga|га|gacha|гача)$/ig, '')}%`
                      },
                      phone: {
                        [Op.like]: `%${removeCountryCode(data.phone)}`,
                      },
                      goods: {
                        [Op.iLike]: goods,
                      },
                      isArchived: false,
                      isDeleted: false,
                      publishedDate: {
                        [Op.gte]: dayjs().subtract(5, 'day').toDate(),
                      }
                    },
                  });
                }
              }

              let phones;
              if (!duplicateLoad) {
                let user = await getUser(client, message.senderId, message.peer);
                // ...user.otherPhones
                phones = [...new Set([data.phone, user?.phone, user?.otherPhones[0]])].filter((phone)=> phone?.length > 8).map((phone)=> {
                  return {
                    phone: {
                      [Op.like]: `%${removeCountryCode(phone)}`,
                    },
                  }
                });
              }

              if (!duplicateLoad) {
                duplicateLoad = await Load.findOne({
                  where: {
                    originCityName: {
                      [Op.iLike]: `%${data.origin.replace(/(dan|дан)$/ig, '')}%`,
                    },
                    destinationCityName: {
                      [Op.iLike]: `%${data.destination.replace(/(ga|га|gacha|гача)$/ig, '')}%`,
                    },
                    [Op.or]: [
                      ...phones,
                      {
                        telegramUserId: message.senderId,
                      },
                    ],
                    isDeleted: false,
                    publishedDate: {
                      [Op.gte]: dayjs().subtract(2, 'day').toDate(),
                    },
                  },
                });
              }

              if (!duplicateLoad) {
                const { origin_country_id, destination_country_id, origin_city_id, destination_city_id } = await findCities(data.origin, data.destination);
                if (origin_city_id && (destination_city_id || destination_country_id)) {
                  duplicateLoad = await Load.findOne({
                    where: {
                      origin_country_id, destination_country_id, origin_city_id, destination_city_id,
                      [Op.or]: [
                        ...phones,
                        {
                          telegramUserId: message.senderId,
                        },
                      ],
                      isDeleted: false,
                      publishedDate: {
                        [Op.gt]: dayjs().subtract(2, 'day').toDate(),
                      },
                    },
                  });

                  if (duplicateLoad) {
                    debug(`duplicateLoad found with city and country ids ${duplicateLoad.id} original: ${JSON.stringify(data)}`);
                  }
                }
              }

              let descriptionWithoutPhone = removePhoneNumbers(removeTelegramHeader(message.message)).text;
              let descriptionHashWithoutPhone = createHash('md5').update(descriptionWithoutPhone).digest('hex');

              if (message.message && !duplicateLoad) {
                let [count, duplicateLoads] = await Load.update(
                  {
                    duplication_counter_different_phone: Sequelize.literal('duplication_counter_different_phone + 1'),
                  },
                  {
                    where: {
                      originCityName: {
                        [Op.iLike]: `%${data.origin.replace(/(dan|дан)$/ig, '')}%`
                      },
                      destinationCityName: {
                        [Op.iLike]: `%${data.destination.replace(/(ga|га|gacha|гача)$/ig, '')}%`
                      },
                      descriptionHashWithoutPhone,
                      publishedDate: {
                        [Op.gt]: dayjs().subtract(8, 'day').toDate(),
                      },
                      descriptionHash: { [Op.ne]: textHash },
                    },
                    returning: true
                  }
                );

                if (count > 0) {
                  duplicateLoad = duplicateLoads.find(load => load.telegram_user_id === message.senderId);

                  if (!duplicateLoad) {
                    const matchingLoadText = duplicateLoads.find(duplicateLoad =>
                      duplicateLoad.phone || (!data.phone && !duplicateLoad.phone)
                    );

                    if (matchingLoadText) {
                      debug(`duplicate-test ${matchingLoadText.id} ${matchingLoadText.telegram_user_id}`);
                      return { id: 1, textHash };
                    }
                  }
                }
              }

              if (duplicateLoad) {
                if (duplicateLoad.duplicationCounter < 40) {
                  duplicateLoad.duplicateMessageIds = [duplicateLoad.url, ...duplicateLoad.duplicateMessageIds];
                }
                // fill unfilled fields
                duplicateLoad.cargoType = duplicateLoad.cargoType || data.cargoType;
                duplicateLoad.cargoType2 = duplicateLoad.cargoType2 || data.cargoType2;
                duplicateLoad.weight = duplicateLoad.weight || data.weight;
                duplicateLoad.volume = duplicateLoad.volume || data.volume;
                duplicateLoad.goods = duplicateLoad.goods || cleanupGoods(data.goods);
                duplicateLoad.paymentType = duplicateLoad.paymentType || data.paymentType;
                duplicateLoad.price = duplicateLoad.price || data.price;
                duplicateLoad.loadReadyDate = data.loadReadyDate;
                duplicateLoad.phone = duplicateLoad.phone || data.phone;

                duplicateLoad.telegramMessageId = message.id;
                duplicateLoad.telegram_channel_id = channel.id;
                duplicateLoad.url = `https://t.me/${channel.name.trim()}/${message.id}`;
                duplicateLoad.publishedDate = new Date(message.date * 1000);
                duplicateLoad.duplicationCounter++;
                if (duplicateLoad.isArchived && duplicateLoad.duplicationCounter < 280 && duplicateLoad.expirationButtonCounter < 4) {
                  duplicateLoad.isArchived = false;
                }

                await duplicateLoad.save();

                debug(`Skipping message with ID:${message.id}, as it is already processed.`);
                return { id: duplicateLoad.id, textHash };
              }

              const [savedMessage] = await saveLoad(
                client,
                message,
                data,
                channel,
                // newId,
                textHash,
                descriptionHashWithoutPhone,
                paramsHash,
              );
              return { id: savedMessage.id, textHash };
            } catch (e) {
              error(e);
            }
          } else {
            debug(
              `invalid or low quality text: ${message?.message} ${JSON.stringify(data)}  https://t.me/${channel.name.trim()}/${message?.id || data.id}`,
            );

            return { id: 1, textHash };
          }
        },
        { concurrency: 1 },
      ))
      .filter(Boolean)
      .reduce((sum, { textHash, id }) => {
        sum[textHash] = sum[textHash] || [];
        sum[textHash].push(id);
        return sum;
      }, {});

      let entries = Object.entries(savedIds);

      debug('entries', entries);

      if (entries.length) {
        await Promise.map(entries, async ([hash, value]) => {
          value = value.filter(Boolean);
          if (value.length) {
            await redisClient.set('load-message:' + hash, value?.join(',') || '', 'EX', (DAY * 8) / 1000);
          }
        });
      }
    }
  }

  if (channel.shouldCrawlVehicle && textParse2.length) {
    let sortedData = YAML.stringify(textParse2.sort((a, b) => b.text.length - a.text.length));
    debug(`Driver advert: sortedData: ${sortedData}`);
    let driverDetails = await parseDriverDetails(sortedData);
    debug(`Driver advert: driverDetails: ${JSON.stringify(driverDetails)}`);

    driverDetails = driverDetails
      .reduce((sum, { vehicles, id }) => {
        vehicles?.forEach((item, index) => {
          item.id = id;
          item.index = index;
        });

        return sum.concat(vehicles);
      }, [])
      .filter(Boolean);

    let savedIds = (await Promise.map(
      driverDetails,
      async (data) => {
        let { message, textHash } = messageMap2[data.id] || {};
        let isValidData = data.origin;
        if (!isValidData || !message) {
          debug(`invalid driver data ${JSON.stringify(data)}`);
          return;
        }
        if (isValidData && message.senderId) {
          let paramsHash = null;

          if (data.origin && message.senderId) {
            let params = [data.origin, message.senderId, textHash];
            paramsHash = createHash('md5').update(params.join('-')).digest('hex');

            let duplicateVehicle = await Vehicle.findOne({ where: { paramsHash, isArchived: false } });

            if (!duplicateVehicle && data.phone?.length > 8) {
              duplicateVehicle = await Vehicle.findOne({
                where: {
                  originCityName: data.origin,
                  phone: {
                    [Op.like]: `%${removeCountryCode(data.phone)}`,
                  },
                  publishedDate: {
                    [Op.gte]: dayjs().subtract(2, 'day').toDate(),
                  },
                },
              });
            }

            if (duplicateVehicle) {
              // fill unfilled fields
              duplicateVehicle.cargoType = duplicateVehicle.cargoType || data.cargoType;
              duplicateVehicle.weight = duplicateVehicle.weight || data.weight;
              duplicateVehicle.volume = duplicateVehicle.volume || data.volume;

              duplicateVehicle.telegramMessageId = message.id;
              duplicateVehicle.telegram_channel_id = channel.id;
              duplicateVehicle.url = `https://t.me/${channel.name.trim()}/${message.id}`;
              duplicateVehicle.publishedDate = new Date(message.date * 1000);
              duplicateVehicle.isArchived = false;
              duplicateVehicle.duplicationCounter++;

              await duplicateVehicle.save();

              debug(`Skipping message with ID:${message.id}, as it is already processed.`);
              return { id: duplicateVehicle.id, textHash };
            }

            const [savedMessage] = await saveVehicle(
              client,
              message,
              data,
              channel,
              textHash,
              paramsHash,
            );

            return { id: savedMessage.id, textHash };
          }

          return { id: 1, textHash };
        } else {
          debug(
            `invalid text: ${message?.message} ${JSON.stringify(data)}  https://t.me/${channel.name.trim()}/${message?.id || data.id}`,
          );
        }
      },
      { concurrency: 1 },
    ))
      .filter(Boolean)
      .reduce((sum, { textHash, id }) => {
        sum[textHash] = sum[textHash] || [];
        sum[textHash].push(id);
        return sum;
      }, {});

    let entries = Object.entries(savedIds);

    debug('entries.drivers', entries);

    if (entries.length) {
      await Promise.map(entries, async ([hash, value]) => {
        value = value.filter(Boolean);
        await redisClient.set('vehicle-message:' + hash, value?.join(',') || '', 'EX', (DAY * 6) / 1000); // 6 days expiration
      });
    }
  }

  return ids;
}

function hasSomeFieldsFilled(item) {
  const {
    cargoType,
    cargoType2,
    paymentType,
    weight,
    volume,
    fare,
    // phone,
    price,
    loadReadyDate,
    customsClearanceLocation,
    loadingSide,
    goods,
  } = item;

  debug('isLowQuality-obj', JSON.stringify(item));

  return [
    isFilledField(cargoType),
    isFilledField(cargoType2),
    isFilledField(paymentType),
    isFilledField(loadReadyDate),
    isFilledField(weight),
    isFilledField(volume),
    isFilledField(fare),
    // isFilledField(phone),
    isFilledField(price),
    isFilledField(loadingSide),
    isFilledField(goods),
    isFilledField(customsClearanceLocation),
  ].some(Boolean);
}

function isFilledField(val) {
  return val !== null && val !== undefined && val !== 'none' && val !== 'not_specified' && val !== 0 && val !== '0';
}

function removeCountryCode(phoneNumber) {
  if (phoneNumber?.length === 13 || phoneNumber?.length === 12) {
    // Check if the phone number starts with '+998' and remove it
    if (phoneNumber.startsWith('+998')) {
      return phoneNumber.slice(4);
    }
    // Check if the phone number starts with '998' and remove it
    if (phoneNumber.startsWith('998')) {
      return phoneNumber.slice(3);
    }
  }

  return phoneNumber;
}

function removeEmojis(text) {
  const flagRegex = /([\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF])/g;

  return text.replace(/(([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])+)/g, function(match) {
    if (flagRegex.test(match)) {
      return ' ';
    }

    const emojiCount = [...match].length;
    return emojiCount > 5 ? '-----' : '';
  });
}

function getUniqueByProperty(array, propertyName) {
  return array.filter(
    (element, index, arr) => arr.findIndex(e => e[propertyName] === element[propertyName]) === index,
  );
}

// function createNewId(channel_local_id, id, symbol) {
//   const channelStr = channel_local_id.toString();
//   const idStr = id.toString().padStart(5, '0');
//   let result = channelStr + idStr;

//   if (symbol) result += symbol;

//   return result;
// }

async function getUser(client, senderId, peer) {
  debug(`Looking up user with senderId: ${senderId}`);

  // Attempt to find the user in the database
  let user = await User.findOne({ where: { telegramId: senderId } });

  // If user is not found in the database
  if (!user) {
    debug(`User not found in the database for senderId: ${senderId}`);

    try {
      // Ensure we're dealing with a valid PeerUser
      let sender = senderId;
      if (peer instanceof Api.PeerUser) {
        sender = await client.getInputEntity(peer.userId);
        debug(`Fetched sender entity for userId: ${peer.userId}`);
      }

      // Fetch the entity for the sender
      let res = await client.getEntity(sender).catch(error => {
        return null; // Ensure res is null if there's an error
      });

      // If no result is returned
      if (!res) {
        debug(`No entity found for senderId: ${senderId}`);
        return null; // Early return since no entity was found
      }

      let { username, id, firstName, lastName, bot, phone } = res;

      if (bot) {
        debug(`Sender ${username || id} is a bot, skipping save.`);
        return null; // Skip saving if the sender is a bot
      }

      user = await User.create({
        username,
        telegramId: id,
        telegramUsername: username,
        firstName,
        lastName,
        phone
      });

      debug(`User ${username || id} saved to the database.`);
    } catch (e) {
      debug(`An error occurred while processing senderId ${senderId}: ${e}`);
      return null; // Return null if any error occurs
    }
  }

  return user;
}

async function saveLoad(client, {
  id,
  date,
  message,
  senderId,
  peer
}, data, channel, /*newId,*/ descriptionHash, descriptionHashWithoutPhone, paramsHash) {
  let { origin, destination } = data;
  const regex = /\b(mestniy|mesni|ichida|местный|месне|мэсни|shaxar ichiga|шахар ичига|месни|mesniy|местни|местний|месныи)\b/i;
  let user = await getUser(client, senderId, peer);

  if (regex.test(origin) || regex.test(destination) || regex.test(data.goods)) {
    destination = data.origin;
    data.is_local_load = true;
  }

  // Call the findCities function to get the origin and destination cities
  const { originCity, destinationCity, origin_country_id, destination_country_id, origin_city_id, destination_city_id } = await findCities(origin, destination);

  let { distance, seconds } = await getDistance(originCity, destinationCity, origin_city_id, destination_city_id);

  const orConditions = [{ telegramUserId: senderId }];
  if (data.phone) {
    orConditions.push({
      phone: {
        [Op.like]: `%${removeCountryCode(data.phone)}`,
      },
    });
  }

  if (user?.otherPhones.length) {
    user.otherPhones.forEach((otherPhone) => {
      orConditions.push({
        phone: {
          [Op.like]: `%${removeCountryCode(otherPhone)}`,
        },
      });
    });
  }

  const loadsCount = await Load.count({
    where: {
      [Op.or]: orConditions,
      duplicationCounter: { [Op.lt]: 15 }
    },
  });

  let phone = removeCountryCode(data.phone || extractPhoneNumber(message));
  if (user && phone) {
    user.otherPhones = [...user.otherPhones, phone];
    await user.save();
  }

  let goods = cleanupGoods(data.goods);
  let good;
  if (goods) {
    // good = await Good.findOne({
    //   attributes: ['id'],
    //   where: {
    //     [Op.or]: [
    //       { nameUz: { [Op.iLike]: `${goods}` } },
    //       { nameRu: { [Op.iLike]: `${goods}` } },
    //       { nameCyrl: { [Op.iLike]: `${goods}` } }
    //    ]
    //   }
    // });

    const results = await sequelize.query(
      `
      WITH good_variants AS (
        SELECT
          id,
          names,
          name_cyrl,
          unnest(string_to_array(unaccent(names), ',')) AS name_variant
        FROM goods
      )
      SELECT
        id,
        name_cyrl,
        name_variant,
        similarity(unaccent(name_variant), unaccent(:goods)) AS sim_score,
        LEVENSHTEIN(unaccent(name_variant), unaccent(:goods)) AS levenshtein_dist
      FROM good_variants
      WHERE
        similarity(unaccent(name_variant), unaccent(:goods)) > 0.4
        AND LEVENSHTEIN(unaccent(name_variant), unaccent(:goods)) < 7
      ORDER BY
        sim_score DESC,
        levenshtein_dist ASC
      LIMIT 1;
      `,
      {
        replacements: { goods },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    good = results[0];

    if (results.length) {
      debug(`Goods: ${goods} result: ${good.name_cyrl}, sim:${good.sim_score}, lev:${good.levenshtein_dist}`);
    }
  }

  delete data.id; // fix this

  const props = {
    ...data,
    // id: newId,
    publishedDate: new Date(date * 1000),
    goods,
    good_id: good?.id,
    phone,
    price: data.price,
    originCityName: origin,
    destinationCityName: destination,
    origin_city_id,
    destination_city_id,
    origin_country_id,
    destination_country_id,
    owner_id: user?.id,
    paymentType: data.paymentType || 'not_specified',
    telegram_channel_id: channel.id,
    description: message,
    telegramUserId: senderId,
    telegramUsername: senderId,
    telegramMessageId: id,
    descriptionHash,
    descriptionHashWithoutPhone,
    paramsHash,
    distance,
    isLikelyOwner: loadsCount < 4 && message.length < 200,
    distanceSeconds: seconds,
    url: `https://t.me/${channel.name.trim()}/${id}`,
  };

  let record = upsertData(Load, props);

  vehicleLoadProcessorQueue.add({
    type: 'load',
    id: record.id,
    owner_id: user?.id,
    origin_city_id,
    destination_city_id,
    origin_country_id,
    destination_country_id,
  });

  return record;
}

async function findCities(origin, destination) {
  origin = origin.replace(/(дан|dan)$/, '');
  destination = destination.replace(/(ga|га)$/, '');

  let [originCity, destinationCity] = await Promise.all([
    findSimilarCityName(origin),
    findSimilarCityName(destination),
  ]);

  let splits = origin?.replace(/\b(\)|из)\b/ig, ' ').split(/ |\,|\(/g);
  if (splits.length < 5) {
    let originSplitPromise = splits.filter((val) => val && !['через'].includes(val)).map(findSimilarCityName);
    let originSplit = await Promise.all(originSplitPromise);
    originSplit.push(originCity);

    originSplit = originSplit.filter(Boolean);
    originCity = originSplit
      .filter((item) => item.type !== 'city' || !originSplit.find(({
                                                                     id,
                                                                     parent_id,
                                                                     type,
                                                                   }) => type === 'city' && parent_id === item.id)) // ensure it is not parent city
      .sort(sortItems)[0];
  }

  splits = destination?.replace(/\b(\)|из)\b/ig, ' ').split(/ |\,|\(/g);
  if (splits.length < 5) {
    let destinationSplitPromise = splits.filter((val) => val && !['через'].includes(val)).map(findSimilarCityName);
    let destinationSplit = await Promise.all(destinationSplitPromise);
    destinationSplit.push(destinationCity);

    destinationSplit = destinationSplit.filter(Boolean);
    destinationCity = destinationSplit
      .filter((item) => item.type !== 'city' || !destinationSplit.find(({
                                                                          id,
                                                                          parent_id,
                                                                          type,
                                                                        }) => type === 'city' && parent_id === item.id)) // ensure it is not parent city
      .sort(sortItems)[0];
  }

  let origin_country_id = null;
  let destination_country_id = null;
  let origin_city_id = originCity?.type === 'city' ? originCity.id : null;
  let destination_city_id = destinationCity?.type === 'city' ? destinationCity.id : null;

  if (originCity) {
    if (originCity.type === 'city') {
      origin_country_id = originCity.country_id;
    } else {
      origin_country_id = originCity.id;
    }
  }

  if (destinationCity) {
    if (destinationCity.type === 'city') {
      destination_country_id = destinationCity.country_id;
    } else {
      destination_country_id = destinationCity.id;
    }
  }

  return {
    originCity,
    destinationCity,
    origin_country_id,
    destination_country_id,
    origin_city_id,
    destination_city_id,
  };
}

async function saveVehicle(client, { id, date, message, senderId, peer }, data, channel, descriptionHash, paramsHash) {
  data.publishedDate = new Date(date * 1000); // set message date

  let [originCity, destinations] = await Promise.all([
    findSimilarCityName(data.origin),
    Promise.all(data.destinations.map(destination => findSimilarCityName(destination))),
  ]);

  let origin_country_id = null;
  let origin_city_id = originCity?.type === 'city' ? originCity.id : null;
  let destinationCityIds = [];
  let destinationCountryIds = [];

  if (originCity) {
    if (originCity.type === 'city') {
      origin_country_id = originCity.country_id;
    } else {
      origin_country_id = originCity.id;
    }
  }

  destinations = destinations.filter(Boolean);

  if (destinations.length > 0) {
    destinations.forEach(destination => {
      if (destination.type === 'city') {
        destinationCityIds.push(destination.id);
        destinationCountryIds.push(destination.country_id);
      } else {
        destinationCountryIds.push(destination.id);
      }
    });
  }

  let isLikelyDispatcher = (await Load.count({ where: { telegramUserId: senderId } })) > 3;

  delete data.id; // fix this

  let user = await getUser(client, senderId, peer);
  let phone = removeCountryCode(data.phone || extractPhoneNumber(message))
  if (user && phone && !user.otherPhones.includes(phone)) {
    user.otherPhones = [...user.otherPhones, phone];
    await user.save();
  }

  const props = {
    ...data,
    phone,
    originCityName: data.origin,
    destinationCityNames: data.destinations,
    isLikelyDispatcher,
    origin_city_id,
    origin_country_id,
    destinationCityIds,
    owner_id: user?.id,
    destinationCountryIds: [...new Set(destinationCountryIds)],
    telegram_channel_id: channel.id,
    description: message,
    telegramUserId: senderId,
    telegramMessageId: id,
    descriptionHash,
    paramsHash,
    url: `https://t.me/${channel.name.trim()}/${id}`,
  };

  let record = upsertData(Vehicle, props);

  vehicleLoadProcessorQueue.add({
    id: record.id,
    type: 'vehicle',
    origin_city_id,
    origin_country_id
  });

  return record;
}

function isWithinLastFourDays(date) {
  const fiveDays = dayjs().subtract(4, 'days');
  return dayjs(date).isAfter(fiveDays);
}

async function findSimilarCityName(text) {
  if (!text) return null;

  text = text.toLowerCase().replace(/w/g, 'sh');

  try {
    const results = await sequelize.query(
      `
      WITH city_variants AS (
        SELECT
          id,
          name_uz,
          latlng,
          parent_id,
          unnest(string_to_array(unaccent(names), ',')) AS name_variant,
          country_id
        FROM cities
      ),
      country_variants AS (
        SELECT
          id,
          name_uz,
          unnest(string_to_array(unaccent(names), ',')) AS name_variant
        FROM countries
      ),
      all_variants AS (
        SELECT id, name_uz, name_variant, 'city' AS type, country_id, latlng, parent_id
        FROM city_variants
        WHERE similarity(unaccent(name_variant), unaccent(:text)) > 0.31
        UNION
        SELECT id, name_uz, name_variant, 'country' AS type, NULL AS country_id, NULL AS latlng, NULL AS parent_id
        FROM country_variants
        WHERE similarity(unaccent(name_variant), unaccent(:text)) > 0.31
      )
      SELECT
        id,
        name_uz,
        name_variant,
        type,
        country_id,
        latlng,
        parent_id,
        similarity(unaccent(name_variant), unaccent(:text)) AS sim_score,
        LEVENSHTEIN(unaccent(name_variant), unaccent(:text)) AS levenshtein_dist
      FROM all_variants
      ORDER BY sim_score DESC, levenshtein_dist ASC
      LIMIT 1;
      `,
      {
        replacements: { text },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    if (results.length > 0) {
      return {
        id: results[0].id,
        name: results[0].name_uz,
        type: results[0].type,
        latlng: results[0].latlng,
        country_id: results[0].country_id,
        parent_id: results[0].parent_id,  // Include parent_id in the returned result
      };
    }

  } catch (error) {
    error('Database query failed:', error);
  }

  return null;
}


queue.on('failed', (job, err) => error(err));
queue.on('error', err => error(err));

queue.process(processor);

queue.add({}, { jobId: 1, repeat: { every: 1000 * 60 * 5 } });

async function upsertData(model, info, transaction) {
  let where = info.id ? { id: info.id } : { url: info.url };

  const count = await model.count({
    where,
    transaction,
  });

  if (count > 0) {
    await model.update(info, { where, transaction });
    return [
      info,
      false,
    ];
  } else {
    return [await model.create(info, { transaction }).catch((e) => {
      debug('izzat ', e, info.id)
      error(info);
      error(e);
      throw e;
    }), true];
  }
}

function cleanupGoods(goods) {
  let result = goods?.replace(/(?<![а-яА-ЯёЁa-zA-Z0-9])(?:юк|догруз|груз|bor|бор|paravoz|yuklanadi|ATROFI|без режима|стандарт|исузу|lar|tent|ref|fura|готов|YUK|КЕРАК|KERE|unknown|РЕФ-ТЕНТ|Нужен|null|йук|TAYYOR|moshina|YUK|kerak|GRUZ|КЕРЕ|фура|таййор|Реф|нужен|null|тент(офка)?|плашатка|hazardous|реф|срочни|исузи|not_specified|yoki|yuk|mestniy|mesni|shaxar ichiga|шахар ичига|месни|местни|местний|месныи|ta|та|gruz|yukbor|yarim|kk|майда|керак|юка|bo'sh|katta)(?![а-яА-ЯёЁa-zA-Z0-9])/ig, ' ').replace(/\s+/g, ' ').trim();
  return result === '' || result?.length === 1 ? null : result;
}

function containsDriverOffer(text) {
  const patterns = [
    /(fura|tent|isuzi|isuzu|chakman|cakman|Gazell|mowina|moshin|moshina|benzavoz|mashinasi|izoterma|tentofkalar|labo|damas|paravoz|ref) kerak (bòsa|bo'lsa|bosa|bolsa)/i,
    /(labo|damas) hizmati/i,
    /возьмём/i,
    /муравей/i,
    /yuk (boʻsa|bo'lsa|bolsa|bòlsa)/i,
    /kimda yuk (boʻsa|bo'lsa|bolsa|bor|bòlsa)/i,
    /кимда (йук|юк) (бўса|бўлса|болса|бор)/i,
    /юналишида юрамиз/i,
    / булса оламиз(\s)+/i,
    /освободится (фура|фуры|исузи|тент|тенты|рефы|фурамиз|чакман|тентофкы|тентофка|мошина|газель|лабо|реф|тентовка|машина|изотерма)/i,
    /есть свобод(ный|ная|ные) (фура|фуры|исузи|тент|тенты|рефы|фурамиз|чакман|тентофкы|тентофка|мошина|газель|лабо|реф|тентовка|машина|изотерма)/i,
    /(предлагайте|предложите|нужен|ищу) (груз)/i,
    /yuk (kere|kerak|kk|boʻsa|bo'lsa|bormi|bolsa|k.k)[^a-zA-Z\s]?/i,
    /(fura|tent|isuzi|isuzu|chakman|cakman|Gazell|mowina|benzavoz|moshin|mashina|moshina|mashinasi|izoterma|tentofkalar|labo|damas|paravoz|ref) bor(?![a-zA-Z])/i,
    /[\s^a-zA-Z0-9]?(фура|исузи|тент|фурамиз|тентофка|чакман|мошина|газель|изотерма|лабо|реф|мошин|тентовка|машина|исузу) бор(?![a-zA-Zа-яА-Я])/i,
    /[\s^a-zA-Z0-9]?(юк|йук|йуклар|юук|юклар)[\s^a-zA-Z0-9]?(керак|кк|кере|таклиф килинглар|оламиз|болса|булса|бу́лса|буса|боса|борми|оламиз|оламз)/i,
    /[\s^a-zA-Z0-9]?(yuk|yuuk|yuklar|xizmatla)[\s^a-zA-Z0-9](kerak|kk|kere|keray|taklif qilinglar|olamiz|bulsa|bûlsa|busa|bosa|bo'ls|bo's)/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

function isClosingMessage(text) {
  return text.length < 25 && /yopildi|епилди|йопилди/ig.test(text);
}

async function isSenderSpammer(id) {
  let count = await Spammer.count({
    where: { telegram_id: id }
  });

  return count > 0;
}

async function containsSpam(text) {
  const spamWord = await SpamWord.count({
    where: sequelize.literal(`:text ILIKE CONCAT('%', word, '%')`),
    replacements: { text: text.toLowerCase() }
  });

  return Boolean(spamWord);
}

async function getDistance(originCity, destinationCity, origin_city_id, destination_city_id) {
  if (origin_city_id && destination_city_id) {
    const matrix = await DistanceMatrix.findOne({
      where: {
        [Op.or]: [
          {
            origin_city_id,
            destination_city_id,
          },
          {
            origin_city_id: destination_city_id,
            destination_city_id: origin_city_id,
          },
        ],
      },
    });

    if (!matrix) {
      return {}
      // if (originCity.latlng?.coordinates && destinationCity.latlng?.coordinates) {
      //   let [originLat, originLng] = originCity.latlng.coordinates;
      //   let [destinationLat, destinationLng] = destinationCity.latlng.coordinates;
      //
      //   let result = await calculateDistanceMatrix(originLat, originLng, destinationLat, destinationLng);
      //
      //   if (result) {
      //     let res = await DistanceMatrix.create({ ...result, origin_city_id, destination_city_id });
      //     return { distance: res.distance_meters, seconds: res.duration_seconds };
      //   }
      // }
    } else {
      return { distance: matrix.distance_meters, seconds: matrix.duration_seconds };
    }
  }

  return {};
}

// Custom sorting function to prioritize cities with parent_id
function sortItems(a, b) {
  // If both have parent_id, prioritize city type
  if (a.parent_id && b.parent_id) {
    if (a.type === 'city' && b.type !== 'city') return -1;
    if (b.type === 'city' && a.type !== 'city') return 1;
  }

  // If only one has parent_id, it should be prioritized
  if (a.parent_id && !b.parent_id) return -1;
  if (!a.parent_id && b.parent_id) return 1;

  // Prioritize city type if none have parent_id
  if (a.type === 'city' && b.type !== 'city') return -1;
  if (b.type === 'city' && a.type !== 'city') return 1;

  // Otherwise, keep original order (return 0)
  return 0;
}

function capitalizeDestinationOriginWords(sentence) {
  // Use regex to match words ending with "dan" or "ga"
  return sentence.replace(/\b\w*(dan|ga|дан|га)\b/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function removeEverySecondLineIfAllAreEmpty(text) {
  // Split the text into an array of lines
  let lines = text.split('\n');

  // Check if all second lines (index % 2 === 1) are empty
  let allSecondLinesEmpty = lines.every((line, index) => {
    return index % 2 === 1 ? line.trim() === '' : true;
  });

  // If all second lines are empty, filter them out
  if (allSecondLinesEmpty) {
    return lines.filter((line, index) => index % 2 === 0).join('\n');
  }

  // If not all second lines are empty, return the original text
  return text;
}

/**
 * Function to detect sequences of emoji icons in text and insert the first line of the sequence
 * after each flag line except the first and last one, while preserving original newlines.
 *
 * Example:
 *
 * Input:
 * 🇷🇺СМОЛЕНСКОЙ
 * 🇺🇿КОКАНД 2850
 * 🇺🇿ТАШКЕНТ 2650
 *
 * Output:
 * 🇷🇺СМОЛЕНСКОЙ -> 🇺🇿КОКАНД 2850
 * 🇷🇺СМОЛЕНСКОЙ -> 🇺🇿ТАШКЕНТ 2650
 */
function insertFlagSequenceLine(text) {
  // Split the text by newline
  const lines = text.split('\n');

  const flagRegex = /([\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF])/;

  let result = [];
  let sequenceCount = 0;
  let currentFlagString = null;
  let modifiedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let currentFlag = line?.match(flagRegex)?.[1];
    let nextFlag = lines[i + 1]?.match(flagRegex)?.[1];
    let nextNextFlag = lines[i + 2]?.match(flagRegex)?.[1];

    if (flagRegex.test(line) && (sequenceCount > 0 || sequenceCount === 0 && currentFlag !== nextFlag && nextFlag && nextNextFlag && !lines[i + 1].includes('растаможка'))) {
      sequenceCount++;
      if (!currentFlagString) {
        currentFlagString = line;
        continue;
      }

      let result = line;
      if (sequenceCount > 1) {
        result = currentFlagString + ' -> ' + line.trim();
      }
      modifiedLines.push(result);
    } else {
      if (modifiedLines.length) {
        result.push(...modifiedLines);
      }
      result.push(lines[i]);
      modifiedLines = [];
      sequenceCount = 0;
      currentFlagString = null;
    }
  }

  // Return the modified text
  return result.join('\n');
}
