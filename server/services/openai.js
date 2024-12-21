require('dotenv').config({});
const OpenAI = require('openai');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const openai = new OpenAI();
const debug = require('debug')('worker:telegram-crawl');

const CARGO_VOLUME_REGEX =
  /(?:^|\s)([0-9]{1,3}\s*m3|m3|[0-9]{1,5}\s*м3|м3|[0-9]{1,3}\skub[a-z]*|kub[a-z]*|куб[а-я]*|[0-9]{1,3}\s*куб[a-я]*)/i;
const CARGO_WEIGHT_REGEX =
  /(?:^|\s)([0-9]{1,3}\s*ton[a-z]*|ton[a-z]*|тон[а-я]*|[0-9]{1,3}\s*тон[a-я]*)/i;

const CAR_TYPES_ENUM = [
  'none',
  'lexus',
  'isuzu',
  'chrysler',
  'chevrolet',
  'porsche',
  'bmw',
  'ford',
  'lamborghini',
  'tesla',
  'ferrari', // лабо
  'subaru', // чакман
  'mazda', // камаз
  'cadillac', // площадка
  'audi', // шаланда
  'toyota', // трал
  'volkswagen', // контейнеровоз
  'honda', // паровоз
  'mitsubishi', // газель
  'nissan', // sprinter
  'bentley', // avtovoz
  'suzuki', // изотерма
  'maserati', // изотерма
];

function getLoadSchema(text) {
  return {
    name: 'freight_info',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'phone', 'items'],
      properties: {
        messages: {
          type: 'array',
          items: {
            loads: {
              type: 'array',
              items: {
                strict: true,
                type: 'object',
                additionalProperties: false,
                required: ['origin', 'destination'],
                fare: {
                  type: ['integer', 'null'],
                  description: 'cost of transportation',
                },
                origin: {
                  type: ['string', 'null'],
                },
                destination: {
                  type: ['string', 'null'],
                },
                paymentType: {
                  description: 'cash (`нал, наличными`), transfer (`перевод, перечислением`)',
                  type: 'string',
                  enum: ['none', 'cash', 'transfer', 'by_card', 'cash_or_by_card', 'combo'],
                },
                hasPrepayment: {
                  type: 'boolean',
                },
                prepaymentAmount: {
                  type: 'integer',
                },
                truckType: {
                  description: 'vehicle brands occurring in text',
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [...CAR_TYPES_ENUM],
                  },
                },
                requiredVehicleCount: {
                  type: 'integer',
                },
                weight: {
                  description: 'weight in tons, use only weight values from text',
                  type: ['float', 'null'],
                },
                volume: {
                  description: 'cargo or truck volume in meter cube, куб',
                  type: ['integer', 'null'],
                },
                load: {
                  type: ['string', 'null'],
                  description: 'name of goods to transport',
                },
                loadReadyDate: {
                  type: ['date', 'null'],
                  description: `only set if load date is specified, its little-endian format`,
                },
                hasRefrigeratorMode: {
                  description: 'true if text contains `rejim` or `режим`',
                  type: 'boolean',
                },
                loadingSide: {
                  // type: ['string', 'null'],
                  enum: ['none', 'боковая', 'задняя', 'верхняя'],
                },
                customsClearanceLocation: {
                  type: ['string', 'null'],
                },
                isLoadHazardous: {
                  type: 'boolean',
                  description: 'if word hazardous occurs',
                },
              },
            },
            id: {
              type: 'integer',
              description: 'id associated with text',
            },
            // isInvalid: {
            //   type: 'boolean',
            //   description:
            //     'set true if content is not related to logistics details',
            // },
            phone: {
              description: 'single phone, only digits',
              type: ['string', 'null'],
            },
          },
        },
      },
    },
  };
}

function getDriverSchema(text) {
  return {
    name: 'driver_info',
    schema: {
      type: 'object',
      required: ['id', 'items'],
      properties: {
        messages: {
          type: 'array',
          items: {
            vehicles: {
              type: 'array',
              items: {
                strict: true,
                type: 'object',
                additionalProperties: false,
                required: ['origin', 'destinations'],
                origin: {
                  type: 'string',
                  description: 'driver current location',
                },
                destinations: {
                  description: 'preferred locations to be',
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                truckType: {
                  description: 'vehicle brands occurring in text',
                  type: 'array',
                  items: {
                    // type: 'string',
                    enum: [...CAR_TYPES_ENUM],
                  },
                },
                availbleVehicleCount: {
                  type: 'integer',
                },
                cargoWeight: {
                  description: 'weight in tons, use only weight values from text',
                  type: ['float', 'null'],
                },
                cargoVolume: {
                  description: 'cargo or truck volume in meter cube, куб',
                  type: ['integer', 'null'],
                },
                isLoadHazardous: {
                  type: 'boolean',
                  description: 'if word hazardous occurs',
                },
              },
            },
            id: {
              type: 'integer',
              description: 'id associated with text',
            },
            phone: {
              description: 'single phone, only digits',
              type: ['string', 'null'],
            },
          },
        },
      },
    },
  };
}

const permutations = {
  ford: [
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
    '5 тонналик изузу',
    'кичкина изузи',
    'кичкина эсузи',
    'kichkina esuzi',
    'кичкина  есузи',
    'маленький исузу',
  ],
  bmw: [
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
  isuzu: ['isuzi', 'izuzi', 'исузи', 'изузи', 'izuzu', 'эсузи', 'исузу', 'esuzi', 'usuzi', 'изузу'],
  chevrolet: [
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
    'tentofkalarga',
    'tentovkalarga',
    'tentlarga',
    'тентофкаларга',
    'тентовкаларга',
    'тентларга',
  ],
  'chevrolet porsche': [
    'тент/реф',
    'tent/ref',
    'реф/тент',
    'ref/tent',
    'тентреф',
    'tentref',
    'рефтент',
    'reftent',
  ],
  porsche: [
    'ref',
    'reefer',
    'реф',
    'reflar',
    'рефлар',
    'refrejerator',
    'рефа',
    'рефов',
    'reflarga',
    'рефларга',
  ],
  tesla: ['faf', 'fav', 'фав', 'faw', 'faz', 'фаф'],
  chrysler: ['мега', 'меге', 'mega', 'mege'],
  ferrari: ['лабо', 'labo', 'damas', 'дамас'],
  mazda: ['камаз', 'kamaz', 'qamaz', 'kamas'],
  cadillac: ['площадка', 'ploshadka', 'plashadka', 'plawatka'],
  audi: ['шаланда', 'shalanda'],
  toyota: ['трал', 'тралл', 'tral', 'traller', 'тралы', 'трала'],
  volkswagen: ['контейнеровоз', 'konteyneravoz'],
  honda: [
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
  subaru: [
    'chakman',
    'cakman',
    'chaqman',
    'чакман',
    'chacman',
    'чакмон',
    'шакман',
    'shakman',
    'chakmon',
    'shaqman',
  ],
  lamborghini: ['реф-18', 'ref-18', 'режим -18', 'ref -18', 'реф -18', 'ref+', 'ref-'],
  lexus: ['man', 'ман'],
  nissan: ['sprinter', 'sprintr', 'спринтер', 'спринтр'],
  mitsubishi: ['gazel', 'газел', 'газель'],
  bentley: ['avtovoz', 'автовоз', 'автовозы', 'avtovozlar'],
  suzuki: [
    'изотерма',
    'изотерм',
    'izoterm',
    'izoterma',
    'изотермы',
    'isotherm',
    'isoterm',
    'izotermalar',
    'изотермалар',
    'izotermiz',
    'izotermik',
    'изотермик',
    'изотермический',
  ],
  maserati: ['kia bongo', 'киа бонго', 'киа bongo', 'kia бонго', 'bongo', 'бонго', 'кияа бонго', 'кия бонго', 'kiya bongo'],
};

function cleanupDagruzKeywords(text) {
  return text.replace(
    /догруз|лахтак|папути|paputi|laxtak|ahchaga|ахчага|axchaga|кушимча юк|dogruz|poputi|қўшимча|dagruz|qoʻshimcha|quwimca|qoshimcha/gi,
    'hazardous'
  );
}

function cleanupTruckTrailerType(text) {
  // const regex1 = new RegExp('\\\\n', 'g');
  // text = text.replace(regex1, ' ') // replace each newline with space

  Object.entries(permutations).forEach(([key, values]) => {
    values.forEach(value => {
      // const regex = new RegExp(`(^|\\s|\\\\n|[0-9.,'"!?\\-:;\\/])${value}($|\\s|\\\\n|[0-9.,'"!?\\-:;\\/])`, 'gi');
      const regex = new RegExp(
        `(^|\\s|\\\\n|[0-9.,'"!?\\-:;\\/\\[\\]()])${value}($|\\s|\\\\n|[0-9.,'"!?\\-:;\\/\\[\\]()])`,
        'gi'
      );
      text = text.replace(regex, `$1${key}$2`);
    });
  });
  return text;
}

function removeSpacesBetweenConsecutiveNumbers(text) {
  // Regular expression to find sequences of 8 digits with spaces between them
  const regex = /(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)\s?(\d)/g;

  // Replace matches with the sequence of numbers without spaces
  return text.replace(regex, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
    return p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8;
  });
}

async function parseLoadData(text) {
  text = removeSpacesBetweenConsecutiveNumbers(text);
  text = cleanupTruckTrailerType(text);
  text = cleanupDagruzKeywords(text);
  text = text.replace(/ (куба|cuba) /i, 'куб');
  text = text.replace(
    /([\wа-яА-ЯёЁ]+(дан|dan))([\s.\n\]+|[\wа-яА-ЯёЁ]+)([\wа-яА-ЯёЁ]+(га|ga))/gim,
    '$1 -> $3$4'
  );

  return openai.beta.chat.completions
    .parse({
      messages: [
        {
          role: 'system',
          content:
            'given unstructured texts of Russian and Uzbek freight load info in YAML, convert it into the given structure. Do not translate the content. PROCESS EACH YAML "text" NODE SEPARATELY.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0,
      top_p: 1,
      store: true,
      metadata: {
        name: 'load-details',
      },
      seed: 525212,
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: getLoadSchema(text) },
    })
    .then(({ choices, usage }) => {
      debug(`usage: ${JSON.stringify(usage)}`);
      return mergedData(choices[0].message.parsed.messages).map(
        ({ isInvalid, loads, phone, id }) => {
          loads = loads?.filter(Boolean);
          loads?.forEach(val => {
            val.phone = cleanupPhone(phone);
            val.price = validatePrice(val.fare, val.phone);
            val.price = val.prepaymentAmount === val.price ? null : val.price;

            val.paymentType =
              val.paymentType === 'none'
                ? 'not_specified'
                : ['none', 'cash', 'transfer', 'by_card', 'cash_or_by_card', 'combo'].includes(
                      val.paymentType
                    )
                  ? val.paymentType
                  : null;

            // debug('val.truckType', val.truckType)
            // debug('val.loadReadyDate', val.loadReadyDate)
            // debug('val.loadingSide', val.loadingSide)
            debug('val.loadReadyDate', val.loadReadyDate);
            val.loadReadyDate = parseDate(val.loadReadyDate);
            debug('val.loadReadyDateUpdated', val.loadReadyDate);
            val.customsClearanceLocation =
              val.customsClearanceLocation === 'none' ? null : val.customsClearanceLocation;
            val.loadingSide = val.loadingSide === 'none' ? null : val.loadingSide;
            let typeFromLoad = translateCargo(val.load);

            val.hasRefrigeratorMode =
              val.hasRefrigeratorMode || (val.load && /(мясо|кури)/gi.test(val.load));

            val.cargoType = val.truckType
              ? translateCargo(val.truckType[0], val.hasRefrigeratorMode)
              : typeFromLoad;
            val.cargoType2 = val.truckType
              ? translateCargo(val.truckType[1], val.hasRefrigeratorMode)
              : typeFromLoad;
            val.requiredTrucksCount =
              val.requiredVehicleCount < 40 ? val.requiredVehicleCount : null;
            val.goods =
              val.load && val.load.length < 100 && typeFromLoad === 'not_specified'
                ? replaceAndTrim(val.load)
                : null;
            val.weight = val.weight < 80 && val.weight > 0 ? val.weight : null;
            val.volume =
              val.weight === 120 ? 120 : val.volume > 400 || val.volume < 30 ? null : val.volume;

            if (/dan$/.test(val.destination) || /дан$/.test(val.destination)) {
              let temp = val.destination;
              val.destination = val.origin;
              val.origin = temp;
            }

            if ((!val.destination || val.destination === 'none') && val.origin) {
              const splitOrigin = val.origin.split(/[^a-zA-Z]+/);

              val.origin = splitOrigin[0];
              val.destination = splitOrigin[1] || '';
            }

            if (val.origin && val.destination) {
              let originIndex = text.indexOf(val.origin, text.indexOf(`id: ${id}`));
              let destinationIndex = text.indexOf(
                val.destination,
                originIndex - val.destination.length - 20
              );

              if (destinationIndex !== -1 && originIndex !== -1 && destinationIndex < originIndex) {
                debug(
                  `destination before origin: ${text}, Origin: ${val.origin}, Destination: ${val.destination}`
                );
                // let orgin = val.origin
                // val.origin = val.destination;
                // val.destination = orgin;
              }
            }

            val.isDagruz = val.weight
              ? val.weight < 1 || (val.isLoadHazardous && val.weight < 2)
              : val.isLoadHazardous;

            val.loadingSide = {
              боковая: 'side',
              задняя: 'rear',
              верхняя: 'top',
            }[val.loadingSide];

            delete val.isLoadHazardous;
            delete val.truckType;
            delete val.load;
            val.prepaymentAmount = validatePrepayment(val.price, val.prepaymentAmount);
            return val;
          });

          // loads = loads?.filter((val)=> {
          //   return val.originCity && val.destinationCity ? text.includes(val.originCity) && text.includes(val.destinationCity) : true
          // })

          if (!loads) {
            debug(`no loads found for text: ${text}`);
          }
          if (id === undefined) {
            debug(`id not found: ${text}`);
          }

          if (loads?.length > 3 && text?.length < 100) {
            debug(`too much loads: ${text} ${loads.map(val => JSON.stringify(val))}`);
          }
          return { isInvalid, loads, phone, id: id };
        }
      );
    });

  function validatePrice(price, phone) {
    if (typeof price !== 'number' || price < 10) {
      return null;
    }
    if (phone) {
      if (String(phone).includes(price) || phone === price) {
        return null;
      }
    }

    const priceStr = price.toString();

    if (price > 99999) {
      if (priceStr.endsWith('0000')) {
        return price;
      }
    } else if (price < 100000 && price >= 5000) {
      if (priceStr.endsWith('00') || priceStr.endsWith('50')) {
        return price;
      }
    } else if (price < 5000) {
      if (priceStr.endsWith('0')) {
        return price;
      }
    }

    return null;
  }

  function validatePrepayment(price, prepayment) {
    if (price > 1000000 && prepayment < 10000) {
      return null;
    }

    return prepayment > 0 ? prepayment : null;
  }

  function replaceAndTrim(text) {
    if (!text) return null;

    const brands = [
      'chevrolet',
      'porsche',
      'tesla',
      'chrysler',
      'bmw',
      'ford',
      'isuzu',
      'ferrari',
      'mazda',
      'lexus',
      'lamborghini',
      'audi',
      'toyota',
      'volkswagen',
      'honda',
      'cadillac',
      'subaru',
      'none',
      'mitsubishi',
      'nissan',
      'bentley',
      'suzuki',
      'maserati',
    ];
    brands.forEach(value => {
      const regex = new RegExp(`\\b${value}\\b`, 'gi');
      text = text.replace(regex, '');
    });

    return text
      .replace(/\s{2,}/g, ' ')
      .replace(/[!?:;]/g, '')
      .trim()
      .toLowerCase();
  }
}

async function parseDriverDetails(text) {
  text = removeSpacesBetweenConsecutiveNumbers(text);
  text = cleanupTruckTrailerType(text);
  text = cleanupDagruzKeywords(text);

  return openai.beta.chat.completions
    .parse({
      messages: [
        {
          role: 'system',
          content:
            'given unstructured texts of Russian and Uzbek freight driver info in YAML, convert it into the given structure. Do not translate the content. PROCESS EACH "text" NODE SEPARATELY',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0,
      top_p: 1,
      store: true,
      metadata: {
        name: 'driver-details',
      },
      seed: 525212,
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: getDriverSchema(text) },
    })
    .then(({ choices }) => {
      return choices[0].message.parsed.messages.map(({ vehicles, phone, id }) => {
        vehicles = vehicles?.filter(Boolean);
        vehicles?.forEach(val => {
          val.phone = cleanupPhone(val.phone);

          let tType = val.truckType?.[0];
          let tType2 = val.truckType?.[1];

          val.truckType = translateCargo(tType);
          val.truckType2 = translateCargo(tType2);
          val.weight = val.cargoWeight;
          val.volume = val.cargoVolume;

          delete val.cargoVolume;
          delete val.cargoWeight;

          val.isDagruz = val.isLoadHazardous || Boolean(val.weight && val.weight < 0.6);

          return val;
        });

        if (!vehicles) {
          debug(`no vehicles found for text: ${text}`);
        }

        if (id === undefined) {
          debug(`id not found: ${text}`);
        }

        if (vehicles?.length > 3 && text?.length < 100) {
          debug(`too much vehicles: ${text} ${vehicles.map(val => JSON.stringify(val))}`);
        }

        return { vehicles, phone, id: id };
      });
    });
}

function mergedData(data) {
  return Object.values(
    data.reduce((acc, obj) => {
      const { id, loads, ...otherProps } = obj;

      if (!acc[id]) {
        acc[id] = { id, loads: [], ...otherProps };
      }

      // Merge loads
      acc[id].loads = acc[id].loads.concat(loads);

      // If any other properties need special merging, handle them here.
      // For example, if you want to ensure other properties are consistent across objects with the same id,
      // you might need additional logic here.

      return acc;
    }, {})
  );
}

function parseDate(dateString) {
  // Check if the dateString is not provided or is an empty string
  if (!dateString) {
    return null;
  }

  // Parse the date string with dayjs in UTC
  let dateObj = dayjs.utc(dateString);

  // Check if the parsed date is valid
  if (!dateObj.isValid()) {
    return null;
  }

  // Get the current year
  const currentYear = dayjs().year();

  // Replace the year in the parsed date object with the current year
  dateObj = dateObj.year(currentYear);

  // Check if the parsed date is before today
  if (dateObj.isBefore(dayjs.utc(), 'day')) {
    return null;
  }

  // Convert to JavaScript Date object
  return dateObj.toDate();
}

const VEHICLE_BRAND_MAP = {
  none: 'not_specified',
  isuzu: 'isuzu',
  ford: 'small_isuzu',
  bmw: 'big_isuzu',
  lexus: 'man',
  ferrari: 'labo',
  subaru: 'chakman',
  mazda: 'kamaz',
  cadillac: 'flatbed',
  audi: 'barge',
  toyota: 'lowboy',
  tesla: 'faw',
  chevrolet: 'tented',
  volkswagen: 'containership',
  honda: 'locomotive',
  chrysler: 'mega',
  porsche: 'reefer',
  lamborghini: 'reefer-mode',
  mitsubishi: 'gazel',
  nissan: 'sprinter',
  bentley: 'avtovoz',
  suzuki: 'isotherm',
  maserati: 'kia_bongo',
};

function translateCargo(key, hasMode) {
  if (!key) return 'not_specified';
  const type = VEHICLE_BRAND_MAP[key?.toLowerCase().trim()] || 'not_specified';

  return type === 'reefer' && hasMode ? 'reefer-mode' : type;
}

function cleanupPhone(phone) {
  return phone?.length > 8 ? phone.replace(/\D/g, '') : null;
}

module.exports = { parseLoadData, parseDriverDetails };
