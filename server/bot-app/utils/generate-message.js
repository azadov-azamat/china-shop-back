const Promise = require('bluebird');
const handlebars = require('handlebars');
const asyncHelpers = require('handlebars-async-helpers');
// const { escapers } = require('@telegraf/entity');
const dayjs = require('dayjs');
const ru = require('dayjs/locale/ru');
require('dayjs/locale/uz-latn');
require('dayjs/locale/en');

const { translate } = require('./translate');
const i18n = require('../../services/i18n-config');
const { COUNTRIES } = require('../../utils/constants');
const { City, Country, User } = require('../../../db/models');
const { camelize } = require('sequelize/lib/utils');
// const { capitalize } = require('lodash');
const debug = require('debug')('general-message');
const { addWatermark } = require('../../utils/watermark');
const { formatOwnerUsername } = require('../../utils/general');

// Custom locale for Cyrillic Uzbek
const uzCyrlLocale = {
  name: 'uz-Cyrl',
  months: [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
  ],
  monthsShort: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  weekdays: ['якшанба', 'душанба', 'сешанба', 'чоршанба', 'пайшанба', 'жума', 'шанба'],
  weekdaysShort: ['якш', 'душ', 'сеш', 'чор', 'пай', 'жум', 'шан'],
  weekdaysMin: ['як', 'ду', 'се', 'чо', 'па', 'жу', 'ша'],
  relativeTime: {
    future: '%sдан кейин',
    past: '%s олдин',
    s: 'бир неча секунд',
    m: 'бир дақиқа',
    mm: '%d дақиқа',
    h: 'бир соат',
    hh: '%d соат',
    d: 'бир кун',
    dd: '%d кун',
    M: 'бир ой',
    MM: '%d ой',
    y: 'бир йил',
    yy: '%d йил',
  },
};

const hb = asyncHelpers(handlebars);

dayjs.locale('uz-Cyrl', uzCyrlLocale);
dayjs.locale(ru);
dayjs.extend(require('dayjs/plugin/customParseFormat'));
dayjs.extend(require('dayjs/plugin/relativeTime'));

function escapeCharBtn(value) {
  value = value?.toString().replace(/'|`/g, 'ʻ');

  // return escapers.MarkdownV2(value).trim();
  return value?.replace(/([_~[\]*#(){}\=+!`>.|\\])/g, '\\$&').trim();
}

function escapeChar(value) {
  value = value?.toString().replace(/'|`/g, 'ʻ');

  return value?.replace(/([_~[\]*#(){}\=+\-!`>.|\\])/g, '\\$&').trim();
}

function formatPrice(x, hideSign) {
  let result = x?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  if (x < 20000 && x > 100) {
    if (hideSign) {
      return result;
    }
    return '$' + result;
  }

  if (x <= 50) {
    return result + '%';
  }

  return result;
}

function handleDetermineTon(weight) {
  if (weight < 0.5) {
    return translate('post.weight-kg', { weight: weight * 1000 });
  } else {
    return translate('post.weight', { weight });
  }
}

function switchDayJSLang() {
  const locale = i18n.getLocale();

  let language = 'uz';
  switch (locale) {
    case 'ru':
      language = 'ru';
      break;
    case 'uz':
      language = 'uz-latn';
      break;
    case 'uz-Cyrl':
      language = 'uz-Cyrl';
      break;
  }

  dayjs.locale(language);
}

function getPublishDate(date) {
  switchDayJSLang();
  return `${dayjs(date).fromNow()}`
    .replace('bir necha ', '')
    .replace('daqiqa', 'min')
    .replace('soniya oldin', 'hozir');
}

function formatGoods(goods) {
  goods = goods.replace(/\//g, ', ');
  return '\n' + translate('post.goods', { goods: escapeChar(goods) });
}

function formatTruckTypes(type, type2) {
  if (type2 && type2 !== 'not_specified' && type !== type2) {
    return (
      '\n' +
      escapeChar(
        translate('post.truck-types', {
          type: translate('truck-type.' + type),
          type2: translate('truck-type.' + type2),
        })
      )
    );
  } else {
    return (
      '\n' + escapeChar(translate('post.truck-type', { type: translate('truck-type.' + type) }))
    );
  }
}

function formatPaymentType(type) {
  return (
    '\n' + escapeChar(translate('post.payment-type', { type: translate('payment-type.' + type) }))
  );
}

function formatPriceAndPrepayment(price, hasPrepayment, prepaymentAmount, originId, destinationId) {
  const prepayment = hasPrepayment
    ? prepaymentAmount
      ? ` (${translate('prepayment')} ${formatPrice(prepaymentAmount)})`
      : ` (${translate('has-prepayment')})`
    : '';
  return `💵 ${escapeChar((price ? formatPrice(price, originId === 1 && destinationId === 1) : '') + prepayment)}`;
}

function formatIsLikelyOwner() {
  return `🤔 ${escapeChar(translate('is-likely-owner'))}`;
}

function formatIsLikelyDispatcher() {
  return `🤔 ${escapeChar(translate('is-likely-dispatcher'))}`;
}

function formatLoadReadyDate(loadReadyDate) {
  switchDayJSLang();

  const date = dayjs(loadReadyDate);
  const today = dayjs();
  const tomorrow = dayjs().add(1, 'day');

  if (date.isSame(today, 'day')) {
    return `⏳ ${escapeChar(
      translate('load-ready-recently', {
        day: translate('today'),
        date: date.format('D MMMM'),
      })
    )}`;
  } else if (date.isSame(tomorrow, 'day')) {
    return `⏳ ${escapeChar(
      translate('load-ready-recently', {
        day: translate('tomorrow'),
        date: date.format('D MMMM'),
      })
    )}`;
  } else {
    return `⏳ ${escapeChar(translate('load-ready-date', { date: date.format('D MMMM') }))}`;
  }
}

function formatDistance(distance, distanceSeconds) {
  let duration = ((distanceSeconds / 60 / 60) * 1.1).toFixed(1);
  duration = duration.endsWith('.0') ? duration.slice(0, -2) : duration;
  return `🛣️ ${escapeChar(translate('distance-text', { km: Math.round(distance / 1000), hour: duration }))}`;
}

function formatLoadingSide(loadingSide) {
  return `🚛 ${escapeChar(translate('loading-side', { side: translate('side.' + loadingSide) }))}`;
}

function formatDogruz() {
  return `🧳 ${escapeChar(translate('dagruz'))}`;
}

function formatCustomsClearanceLocation(customsClearanceLocation) {
  return `🛃 ${escapeChar(translate('customs-clearance', { customClearance: customsClearanceLocation }))}`;
}

function formatPhoneNumber(phone) {
  let phoneNumbers = phone.split(/\s+/).map(p => p.replace(/[\s-]/g, ''));

  if (phoneNumbers.length > 1 && phoneNumbers.join('').length <= 12) {
    phoneNumbers = [phoneNumbers.join('')];
  }

  const formatWithCode = phone => {
    let formatted = phone.substring(0, 2) + ' ' + phone.substring(2);
    return `[${escapeChar('+998' + formatted)}](${escapeChar('tel:+998' + phone)})`.replace(
      /\s/g,
      ''
    );
  };

  const processPhone = singlePhone => {
    if (singlePhone.length === 12 && singlePhone.startsWith('998')) {
      singlePhone = singlePhone.substring(3);
      return formatWithCode(singlePhone);
    } else if (singlePhone.length > 9 && !singlePhone.startsWith('998')) {
      return `[${escapeChar(singlePhone)}](${escapeChar('tel:' + singlePhone)})`;
    } else if (singlePhone.length === 9) {
      return formatWithCode(singlePhone);
    } else {
      return `[${escapeChar(singlePhone)}](${escapeChar('tel:' + singlePhone)})`.replace(/\s/g, '');
    }
  };

  if (phoneNumbers.length === 2) {
    return phoneNumbers.map(processPhone).join(', ');
  } else {
    return phoneNumbers.map(processPhone).join(',\n ');
  }
}

function addCountryCode(phoneNumber) {
  if (phoneNumber?.length === 9) {
    return `998` + phoneNumber;
  }

  return phoneNumber;
}

hb.registerHelper(
  'details',
  async ({
    departurePlaceName,
    origin_country_id,
    arrivalPlaceName,
    destination_country_id,
    goods,
    weight,
    price,
    phone,
    publishedDate,
    createdAt,
    hasPrepayment,
    prepaymentAmount,
    paymentType,
    cargoType,
    cargoType2,
    requiredTrucksCount,
    volume,
    isLikelyOwner,
    index,
    distance,
    distanceSeconds,
    loadReadyDate,
    loadingSide,
    isDagruz,
    customsClearanceLocation,
    owner_id,
    owner,
    // good,
    user,
    duplicationCounter,
    id,
  }) => {
    let message = '';
    // const locale = i18n.getLocale();
    // const lang = locale === 'uz-Cyrl' ? 'cyrl' : locale === 'uz' ? 'uz' : 'ru';

    const originCountry = COUNTRIES.find(({ id }) => id === origin_country_id) || {};
    const destinationCountry = COUNTRIES.find(({ id }) => id === destination_country_id) || {};

    message = `${originCountry.icon} ${departurePlaceName} - ${destinationCountry.icon} ${arrivalPlaceName}`;

    if (index) {
      message = `${index}. ` + message;
    }

    message = `***${escapeChar(message)}***\n`;

    if (weight) {
      message += '\n' + escapeChar(handleDetermineTon(weight));
    }

    if (volume && volume > 20) {
      message += (weight ? '  ' : '\n') + escapeChar(`↔️ ${volume}m³`);
    }

    if (cargoType && cargoType !== 'not_specified') {
      message += formatTruckTypes(cargoType, cargoType2);

      if (requiredTrucksCount > 1) {
        message += ' ' + escapeChar(translate('trucks-count', { count: requiredTrucksCount }));
      }
    } else if (requiredTrucksCount > 1) {
      message += '\n🚚 ' + escapeChar(translate('trucks-count', { count: requiredTrucksCount }));
    }

    // if (good) {
    //   let goodsName = good['name' + capitalize(lang)];
    //   message += formatGoods(goodsName);
    // }

    if (goods) {
      message += formatGoods(goods);
    }

    if (price || hasPrepayment) {
      message +=
        '\n' +
        formatPriceAndPrepayment(
          price,
          hasPrepayment,
          prepaymentAmount,
          origin_country_id,
          destination_country_id
        );
    }

    if (paymentType && paymentType !== 'not_specified') {
      message += formatPaymentType(paymentType);
    }

    if (isLikelyOwner) {
      message += '\n' + formatIsLikelyOwner(isLikelyOwner);
    }

    if (distance && distanceSeconds) {
      message += '\n' + formatDistance(distance, distanceSeconds);
    }

    // FAILING: test it in other languages, using different queries in diff langs.
    if (loadReadyDate) {
      message += '\n' + formatLoadReadyDate(loadReadyDate);
    }

    if (isDagruz) {
      message += '\n' + formatDogruz();
    }

    if (loadingSide) {
      message += '\n' + formatLoadingSide(loadingSide);
    }

    if (customsClearanceLocation && customsClearanceLocation !== 'null') {
      message += '\n' + formatCustomsClearanceLocation(customsClearanceLocation);
    }

    message = addWatermark(message, 'X');

    // message = addWatermark(message, 'X') + '\n';

    if (user.hasActiveSubscription) {
      owner = owner || (await User.findByPk(owner_id, {
        raw: true,
        attributes: ['phone', 'otherPhones', 'telegramUsername', 'hasActiveSubscription'],
      }));

      if (phone) {
        message += '\n\n' + formatPhoneNumber(phone);
      } else if (owner?.phone) {
        message += '\n\n' + formatPhoneNumber(owner.phone);
      }

      if (owner?.telegramUsername || owner?.otherPhones.length || owner?.phone || phone) {
        message += formatOwnerUsername(owner, phone || owner?.phone);
      }
    }

    if (publishedDate || createdAt) {
      message += ' \n\n' + getPublishDate(publishedDate || createdAt);
      const ids = [36, 4867, 4207, 29735];
      if (ids.includes(user.id)) {
        message += ' '.padEnd(50) + id + ' · ' + duplicationCounter;
      }
    }

    return message;
  }
);

hb.registerHelper(
  'vehicle-details',
  async ({
    // originCityName,
    // destinationCityNames,
    origin_country_id,
    destinationCountryIds,
    destinationCityIds,
    weight,
    publishedDate,
    createdAt,
    truckType,
    truckType2,
    volume,
    index,
    isLikelyDispatcher,
    isDagruz,
    departurePlaceName,
    isWebAd,
    phone,
    owner_id,
    owner,
    user,
  }) => {
    const locale = i18n.getLocale();
    const lang = locale === 'uz' ? 'uz' : 'ru';
    let message = '';
    let destinationNames = '';

    const originCountry = COUNTRIES.find(({ id }) => id === origin_country_id) || {};
    const destinationCountry = destinationCountryIds.length
      ? COUNTRIES.find(({ id }) => id === parseInt(destinationCountryIds[0]))
      : null;

    if (destinationCountry) {
      if (destinationCityIds.length) {
        let cities = await City.findAll({
          where: { id: destinationCityIds },
          raw: true,
          attributes: ['name_ru', 'name_uz'],
        });
        destinationNames = cities.map(city => city[`name_${lang}`]).join(', ');
      } else {
        let countries = COUNTRIES.filter(({ id }) => destinationCountryIds.includes(id.toString()));
        destinationNames = countries.map(c => c[`name_${lang}`]).join(', ');
      }

      let from = escapeChar(originCountry.icon + ' ' + departurePlaceName);
      let to = escapeChar(destinationNames);

      message =
        translate('from-where', { from }) +
        `${isWebAd ? ' ⭐⭐' : ''}` +
        '\n\n' +
        translate('to-where', { to });
    } else {
      message =
        translate('from-where', {
          from: escapeChar(originCountry.icon + ' ' + departurePlaceName),
        }) +
        `${isWebAd ? ' ⭐⭐' : ''}` +
        '\n';
    }

    if (index) {
      message = `*${index}\\.* ` + message;
    }

    if (truckType && truckType !== 'not_specified') {
      message += formatTruckTypes(truckType, truckType2);
    }

    if (weight) {
      message += '\n' + escapeChar(handleDetermineTon(weight));
    }

    if (volume && volume > 20) {
      message += (weight ? '  ' : '\n') + escapeChar(`↔️ ${volume}m³`);
    }

    if (isLikelyDispatcher) {
      message += '\n' + formatIsLikelyDispatcher(isLikelyDispatcher);
    }
    if (isDagruz) {
      message += '\n' + formatDogruz();
    }

    if (user.hasActiveSubscription) {
      owner = owner || (await User.findByPk(owner_id, {
        raw: true,
        attributes: ['phone', 'otherPhones', 'telegramUsername', 'hasActiveSubscription'],
      }));

      if (phone) {
        message += '\n\n' + formatPhoneNumber(phone);
      } else if (owner?.phone) {
        message += '\n\n' + formatPhoneNumber(owner.phone);
      }

      if (owner?.telegramUsername || owner?.otherPhones.length || owner?.phone || phone) {
        message += formatOwnerUsername(owner, phone || owner?.phone);
      }
    }

    if (publishedDate || createdAt) {
      message += '\n\n' + getPublishDate(publishedDate || createdAt);
    }

    return message;
  }
);

hb.registerHelper('link', ({ url, telegramUserId }) => {
  if (!url && !telegramUserId) return;

  let message = translate('to-message');
  let links = [];

  // if (telegramUserId) {
  //   links.push(`📱 [telegram](tg://user?id=${telegramUserId})`);
  // }

  if (url) {
    links.push(`🔗 [${message}](${escapeChar(url)})`);
  }

  return links.join(' ');
});

const DEFAULT_MESSAGE_TEMPLATE = `
{{details record}}
`;

const VEHICLE_MESSAGE_TEMPLATE = `
{{vehicle-details record}}
`;

async function getPlaceNames(record) {
  const locale = i18n.getLocale();
  const lang = locale === 'uz' ? 'uz' : 'ru';
  const params = {
    raw: true,
    attributes: ['name_uz', 'name_ru'],
  };

  const departurePromise = record.origin_city_id
    ? City.findByPk(record.origin_city_id, {
        ...params,
        include: [{ model: City, as: 'groupCity', attributes: ['name_uz', 'name_ru'] }],
      })
    : Country.findByPk(record.origin_country_id, params);

  const arrivalPromise = record.destination_city_id
    ? City.findByPk(record.destination_city_id, {
        ...params,
        include: [{ model: City, as: 'groupCity', attributes: ['name_uz', 'name_ru'] }],
      })
    : Country.findByPk(record.destination_country_id, params);

  let [departure, arrival] = await Promise.all([departurePromise, arrivalPromise]);

  const departureParentCity = departure?.[`groupCity.name_${lang}`] || '';
  const arrivalParentCity = arrival?.[`groupCity.name_${lang}`] || '';

  departure = departure
    ? `${departure[`name_${lang}`]}${departureParentCity ? `, ${departureParentCity}` : ''}`
    : record.originCityName;

  arrival = arrival
    ? `${arrival[`name_${lang}`]}${arrivalParentCity ? `, ${arrivalParentCity}` : ''}`
    : record.destinationCityName;

  return { departure, arrival };
}

async function generateMessage(record, index, template = DEFAULT_MESSAGE_TEMPLATE, user) {
  const plainRecord = record.toJSON ? record.toJSON() : { ...record };
  if (index) {
    plainRecord.index = index;
  }
  const { departure, arrival } = await getPlaceNames(plainRecord);

  if (plainRecord.destination_country_id) {
    plainRecord.departurePlaceName = departure;
    plainRecord.arrivalPlaceName = arrival;
  } else {
    plainRecord.departurePlaceName = departure;
  }

  let caption = await hb.compile(template)({ record: { ...plainRecord, user } });

  return {
    id: record.id,
    index,
    caption,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
  };
}

module.exports = {
  DEFAULT_MESSAGE_TEMPLATE,
  VEHICLE_MESSAGE_TEMPLATE,
  generateMessage,
  escapeChar,
  escapeCharBtn,
  formatPhoneNumber,
};
