const path = require('path');
const fs = require('fs');
const Canvas = require('canvas');
const kotobaNodeCommon = require('kotoba-node-common');
const MongoStorage = require('monochrome-bot/plugins/storage_mongo');
const Persistence = require('monochrome-bot/src/persistence');
const Settings = require('monochrome-bot/src/settings');
const CommandManager = require('monochrome-bot/src/command_manager');

const { initializeResourceDatabase, initializeFonts } = kotobaNodeCommon;
const { DB_CONNECTION_STRING } = kotobaNodeCommon.database;

const BOT_SRC = path.join(__dirname, '..');
const BOT_ROOT = path.join(BOT_SRC, '..');
const PROJECT_ROOT = path.join(BOT_ROOT, '..');

const DEFAULT_PREFIXES = ['k!'];

const ALLOWED_CMDS = new Set([
  'jisho', 'j', 'en', 'ja', 'jp', 'ja-en', 'jp-en', 'en-jp', 'en-ja',
  'jn',
  'kanji', 'k',
  'strokeorder', 's', 'so',
  'examples', 'ex',
  'random', 'r',
  'pronounce', 'p',
  'translate', 'trans', 'gt', 't',
  'furigana', 'furi', 'f',
  'hispadic', 'es',
  'yourei', 'y',
  'anime', 'a',
  'quiz', 'q',
  'stop', 'endquiz', 'end', 'quit', 'cancel', 'ｑｓ',
  'qs',
  'leaderboard', 'lb',
  'resetserverleaderboard',
  'shiritori', 'st', 'sh',
  'draw', 'd',
  'help', 'h',
  'about',
  'settings', 'setting',
  'deletemydata',
  'wotd', 'schedule', 'sch',
  'schedule_reboot', 'sr',
]);

let initialized = false;

async function initialize() {
  if (initialized) return;

  /* eslint-disable global-require */
  const globals = require('../common/globals');
  const { initShims, createBotShim, createMonochromeShim } = require('./shims');
  initShims(globals);

  const BOT_RESOURCES_PATH = path.join(BOT_ROOT, 'generated/resources.dat');
  const FONTS_PATH = path.join(PROJECT_ROOT, 'resources/fonts');
  const SETTINGS_FILE = path.join(BOT_SRC, 'bot_settings');
  const COMMANDS_DIR = path.join(BOT_SRC, 'discord_commands');

  if (!fs.existsSync(BOT_RESOURCES_PATH)) {
    throw new Error('bot/generated/resources.dat not found — run buildresources in bot/');
  }

  globals.resourceDatabase = initializeResourceDatabase(BOT_RESOURCES_PATH);
  globals.fontHelper = initializeFonts(FONTS_PATH, globals.resourceDatabase, Canvas);

  globals.logger = {
    info() {},
    warn(obj) { console.warn(obj); },
    error(obj) { console.warn(obj); },
    child() { return globals.logger; },
  };

  const storage = new MongoStorage(DB_CONNECTION_STRING, 'kotoba', 'monochromepersistence');
  globals.persistence = new Persistence(DEFAULT_PREFIXES, globals.logger, storage);
  await globals.persistence.getGlobalData();

  globals.prefixes = {
    defaults: DEFAULT_PREFIXES,
    getForChannel(channelId) {
      return globals.persistence.getPrefixesForServer(channelId);
    },
  };

  globals.wsUsers = new Map();
  globals.botShim = createBotShim();

  globals.settings = new Settings(globals.persistence, globals.logger, SETTINGS_FILE);
  globals.monochrome = createMonochromeShim();

  const commandManager = new CommandManager(COMMANDS_DIR, DEFAULT_PREFIXES, globals.monochrome);
  commandManager.load();
  // eslint-disable-next-line no-underscore-dangle
  commandManager.commands_ = commandManager.commands_.filter(
    (cmd) => cmd.aliases.some((a) => ALLOWED_CMDS.has(a)),
  );
  globals.commandManager = commandManager;

  globals.hook = require('../discord_message_processors/user_and_channel_hook');
  globals.quizAnswer = require('../discord_message_processors/quiz_answer');
  globals.shiritoriAnswer = require('../discord_message_processors/shiritori_answer');
  globals.quizManager = require('../common/quiz/manager');
  /* eslint-enable global-require */

  initialized = true;
}

module.exports = { initialize };
