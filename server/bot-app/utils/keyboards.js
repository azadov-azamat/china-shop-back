require('dotenv').config({});

const { Markup } = require('telegraf');
const camelize = require('camelize');
const { translate } = require('./translate');
const i18n = require('../../../server/services/i18n-config');
const { sequelize } = require('../../../db/models');

const LANGUAGE = {
  uz: '🇺🇿 O`zbekcha',
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

const main = ({ ctx }) => {
  const locale = i18n.getLocale();
  const { id } = ctx.from;

  return Markup.keyboard([
    [Markup.button.webApp(translate('commands.open-store'), `${process.env.FRONT_HOST_NAME}?lang=${locale}&telegramId=${id}`)],
    [translate('commands.get-comment'), translate('commands.settings')],
  ]).resize();
};

const agreementAccept = () => {
  return Markup.keyboard([translate('accept-agreement')]).resize();
};

const settings = () => {
  return Markup.keyboard([
    [translate('commands.language')],
    [translate('commands.change-contact')],
    [translate('commands.change-current-location')],
    [translate('commands.go-back')],
  ]).resize();
};

const contact = () => {
  return Markup.keyboard([
    Markup.button.contactRequest(translate('send-contact')),
  ]).resize().oneTime(false)
};

const location = () => {
  return Markup.keyboard([
    Markup.button.locationRequest(translate('send-location')),
  ]).resize().oneTime(false)
};

const buttonsWithBack = ({ buttons, inline = false }) => {
  buttons.push(inline ? translate('commands.go-back') : [translate('commands.go-back')]);
  return Markup.keyboard(buttons);
};

const keyboardFuncs = {
  language,
  back,
  main,
  contact,
  location,
  buttonsWithBack,
  addLoad,
  settings,
  languageWithoutBack,
  backWithType,
  agreementAccept
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
