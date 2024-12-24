require('dotenv').config({});

const { Markup } = require('telegraf');
const camelize = require('camelize');
const { translate } = require('./translate');
const i18n = require('../../../server/services/i18n-config');
const { sequelize } = require('../../../db/models');

const LANGUAGE = {
  uz: '🇺🇿 O`zbekcha lotin',
  ru: '🇷🇺 Русский',
};

const backWithType = ({ ctx }) => {
  const filter = ctx.filter;
  const truckType = filter?.cargoType;
  const isDagruz = filter?.isDagruz;
  const keyboard = [[translate('commands.go-back')]];

  if (isDagruz) {
    keyboard.unshift([translate('change-current-truck-type', { type: translate('dagruz') })]);
  } else if (truckType) {
    const type = translate(`truck-type.${truckType}`).toUpperCase();
    keyboard.unshift([translate('change-current-truck-type', { type })]);
  } else {
    keyboard.unshift([translate('change-truck-type')]);
  }
  return Markup.keyboard(keyboard).resize();
};

const chunkArray = (arr, chunkSize) => {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
};

const language = () => {
  const languageButtons = Object.values(LANGUAGE);
  const chunkedButtons = chunkArray(languageButtons, 2);

  chunkedButtons.push([translate('commands.go-back')]);

  return Markup.keyboard(chunkedButtons).resize();
};

const languageWithoutBack = () =>
  Markup.keyboard([Object.values(LANGUAGE)]).resize();

const back = () => Markup.keyboard([[translate('commands.go-back')]]).resize();

const addLoad = ({ ctx }) => {
  const locale = i18n.getLocale();
  const { id } = ctx.from;
  return Markup.keyboard([
    [Markup.button.webApp(translate('commands.webapp-add-load'), `${process.env.FRONT_HOST_NAME}/main/profile/cargo/new?lang=${locale}&telegramId=${id}`)],
    [translate('commands.go-back')]
  ]).resize();
};

const addVehicle = ({ ctx }) => {
  const locale = i18n.getLocale();
  const { id } = ctx.from;
  return Markup.keyboard([
    [Markup.button.webApp(translate('commands.webapp-add-vehicle'), `${process.env.FRONT_HOST_NAME}/main/profile/vehicle/new?lang=${locale}&telegramId=${id}`)],
    [translate('commands.go-back')]
  ]).resize();
};

const main = ({ ctx }) => {
  return Markup.keyboard([
    [translate('commands.quick-search')],
    // [Markup.button.locationRequest(translate('commands.search-nearby'))],
    [translate('commands.my-ads')],
    [translate('commands.add-new-ads')],
    [translate('commands.settings')],
    [translate('commands.help')],
  ]).resize();
};

const selectLoadOrVehicle = () => {
  return Markup.keyboard([
    [translate('commands.my-loads')],
    [translate('commands.my-vehicles')],
    [translate('commands.go-back')],
  ]).resize();
};

const searchTypes = () => {
  return Markup.keyboard([
    [translate('commands.load-search')],
    [translate('commands.vehicle-search')],
    [translate('commands.go-back')],
  ]).resize();
};

const addNewAds = ({ ctx }) => {
  const locale = i18n.getLocale();
  const { id } = ctx.from;

  return Markup.keyboard([
    [Markup.button.webApp(translate('commands.webapp-add-load'), `${process.env.FRONT_HOST_NAME}/main/profile/cargo/new?lang=${locale}&telegramId=${id}`)],
    [Markup.button.webApp(translate('commands.webapp-add-vehicle'), `${process.env.FRONT_HOST_NAME}/main/profile/vehicle/new?lang=${locale}&telegramId=${id}`)],
    [translate('commands.go-back')],
  ]).resize();
};

const agreementAccept = () => {
  return Markup.keyboard([translate('accept-agreement')]).resize();
};

const getVehicleCountries = async () => {
  const locale = i18n.getLocale();
  const lang = (locale === 'uz' ? 'uz' : 'ru');

  const results = await sequelize.query(`
    SELECT DISTINCT c.country_id, cn.name_${lang}
    FROM vehicles v
    JOIN cities c ON v.origin_city_id = c.id
    JOIN countries cn ON c.country_id = cn.id;
  `, {
    type: sequelize.QueryTypes.SELECT,
    raw: true,
  });

  const buttons = results.map(result => [result[`name_` + lang]]);
  buttons.push([translate('commands.go-back')]);

  return Markup.keyboard([buttons]).resize();
};

const settings = () => {
  return Markup.keyboard([
    // [translate('commands.set-filter')],
    [translate('commands.language')],
    [translate('commands.subscriptions')],
    [translate('commands.go-back')],
  ]).resize();
};

const subscriptions = () => {
  return Markup.keyboard([
    [translate('commands.active-subscriptions')],
    [translate('commands.list-subscriptions')],
    [translate('commands.go-back')],
  ]).resize();
};

const filters = () =>
  Markup.keyboard([
    [translate('commands.change-filter')],
    [translate('commands.unsubscribe')],
    [translate('commands.go-back')],
  ]).resize();

const buttonsWithBack = ({ buttons, inline = false }) => {
  buttons.push(inline ? translate('commands.go-back') : [translate('commands.go-back')]);
  return Markup.keyboard(buttons);
};

const changeDirection = ({ ctx }) => {
  const filter = ctx.filter;
  const truckType = filter?.cargoType;
  const keyboard = [[translate('commands.change-direction')]];

  if (truckType) {
    const type = translate(`truck-type.${truckType}`);
    keyboard.push([translate('change-current-truck-type', { type })]);
  } else {
    keyboard.push([translate('change-truck-type')]);
  }

  keyboard.push([translate('commands.go-back')]);

  return Markup.keyboard(keyboard).resize();
};

const keyboardFuncs = {
  language,
  back,
  main,
  filters,
  buttonsWithBack,
  addLoad,
  addVehicle,
  settings,
  languageWithoutBack,
  backWithType,
  changeDirection,
  getVehicleCountries,
  searchTypes,
  agreementAccept,
  subscriptions,
  selectLoadOrVehicle,
  addNewAds,
};

const keyboards = (name, opts = {}) => {
  name = camelize(name);
  if (keyboardFuncs[name]) {
    return keyboardFuncs[name](opts);
  }
  throw new Error(`Keyboard ${name} not found`);
};


module.exports = {
  keyboards,
  LANGUAGE,
};
