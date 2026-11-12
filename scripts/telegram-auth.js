const path = require('path');
const readline = require('readline');
const { TelegramClient } = require(path.resolve(__dirname, '../apps/api/node_modules/telegram'));
const { StringSession } = require(path.resolve(__dirname, '../apps/api/node_modules/telegram/sessions'));
const dotenv = require(path.resolve(__dirname, '../apps/api/node_modules/dotenv'));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) =>
  new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));

async function main() {
  console.log('=== NOOR DRIVE — Telegram MTProto Connection Setup ===\n');

  let apiIdStr = process.env.TELEGRAM_API_ID || '';
  let apiHash = process.env.TELEGRAM_API_HASH || '';

  if (apiIdStr && apiHash) {
    console.log('Loaded TELEGRAM_API_ID and TELEGRAM_API_HASH from .env\n');
  } else {
    apiIdStr = await ask('Enter your Telegram API_ID (from my.telegram.org): ');
    apiHash = await ask('Enter your Telegram API_HASH: ');
  }

  const apiId = parseInt(apiIdStr, 10);
  if (!apiId || !apiHash) {
    console.error('Invalid API_ID or API_HASH.');
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () =>
      await ask('Enter your Telegram phone number (with country code, e.g. +880...): '),
    password: async () =>
      await ask('Enter your Telegram 2FA password (leave blank if none): '),
    phoneCode: async () =>
      await ask('Enter the login code sent to your Telegram app: '),
    onError: (err) => console.error('Telegram auth error:', err),
  });

  console.log('\nConnected successfully to Telegram!');
  console.log('\nUpdate these lines in your .env file:\n');
  console.log('TELEGRAM_ENABLED="true"');
  console.log('TELEGRAM_USER_CONSENT="true"');
  console.log(`TELEGRAM_SESSION_STRING="${client.session.save()}"`);

  await client.disconnect();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

