require('dotenv').config({});

const { translate } = require('./translate');

async function setCommands(bot) {
  let commands = [
    { command: 'start', description: translate('commands.start') },
    // { command: 'new_load', description: translate('commands.webapp-add-load') },
    // { command: 'new_vehicle', description: translate('commands.webapp-add-vehicle') },
    { command: 'settings', description: translate('commands.settings') },
    { command: 'help', description: translate('commands.help') },
  ].filter(Boolean);

  try {
    await bot.telegram.setMyCommands(commands);
  } catch (error) {
    console.error('Error setting commands:', error);
  }
}

module.exports = { setCommands };
