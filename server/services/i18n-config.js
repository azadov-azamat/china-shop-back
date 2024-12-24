const i18n = require('i18n');
const path = require('path');

const localesPath = path.join(__dirname, '..', '..', 'translations');

i18n.configure({
  locales: ['uz', 'ru'],
  directory: localesPath,
  defaultLocale: 'uz',
  objectNotation: true,
});

module.exports = i18n;
