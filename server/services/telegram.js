require('dotenv').config({});

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const redisClient = require('./redis');
const input = require('input');
const { MINUTE, DAY } = require('time-constants');
const { CustomFile } = require('telegram/client/uploads');

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;

function telegramClient(session = '') {
  const stringSession = new StringSession(session); // fill this later with the value from
    return new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
  });
}

async function sendAuthCode(client, phone) {
  await client.connect();
  const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
    {
      apiId: API_ID,
      apiHash: API_HASH,
    },
    phone
  );

  let key = `telegram-sign-in:${phone}`;
  let value = phoneCodeHash;
  await redisClient.set(key, value, 'EX', DAY / 1000);

  return client;
}

async function authWithCode(client, phone, code) {
  await client.connect();
  let key = `telegram-sign-in:${phone}`;
  let phoneCodeHash = await redisClient.get(key);
  const { user } = await client.invoke(
    new Api.auth.SignIn({
      phoneNumber: phone,
      phoneCodeHash,
      phoneCode: code,
    })
  );

  return { sessionToken: client.session.save(), user };
}

// sendAuthCode(telegramClient(), '998200046674').then(async (client)=> {
//   let code = await input.text('telegram code');
//   let { sessionToken } = await authWithCode(client, '998200046674', code);
//   console.log(sessionToken)
// });

module.exports = { telegramClient, sendAuthCode, authWithCode, Api };
