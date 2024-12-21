const i18n = require('../../services/i18n-config');
require('dotenv').config({});


function translate(text, args = {}) {
  return i18n.__(text, args);
}

module.exports = { translate };
