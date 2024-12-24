require('dotenv').config({});

const { translate } = require('./translate');

async function setCommands(bot) {
  let commands = [
    { command: 'start', description: translate('commands.start') },
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
