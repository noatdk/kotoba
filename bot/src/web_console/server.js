const { webConsoleEvents: socketEvents } = require('kotoba-common');
const shiritoriManager = require('kotoba-node-common').shiritori;
const { InteractiveMessage } = require('monochrome-bot/src/components/interactive_message');
// eslint-disable-next-line import/no-extraneous-dependencies
const passport = require('passport');
const { initialize } = require('./init');
const { createMsgShim, createInteractionShim } = require('./shims');
const globals = require('../common/globals');

const NAMESPACE = '/bot';
const EMBED_ERROR_COLOR = 0xF04747;
const COMMANDS_PER_WINDOW = 10;
const ANSWERS_PER_WINDOW = 30;
const RATE_LIMIT_WINDOW_MS = 10000;
const MAX_MESSAGE_LENGTH = 2000;
const IDLE_TIMEOUT_MS = 600000; // 10 min

function sendErrorEmbed(socket, title, description) {
  socket.emit(socketEvents.Server.MESSAGE, {
    embeds: [{
      title,
      description,
      color: EMBED_ERROR_COLOR,
    }],
  });
}

function createRateLimiter() {
  const commandTimestamps = [];
  const answerTimestamps = [];

  function prune(timestamps, now) {
    while (timestamps.length > 0 && now - timestamps[0] > RATE_LIMIT_WINDOW_MS) {
      timestamps.shift();
    }
  }

  return {
    tryCommand() {
      const now = Date.now();
      prune(commandTimestamps, now);
      if (commandTimestamps.length >= COMMANDS_PER_WINDOW) return false;
      commandTimestamps.push(now);
      return true;
    },
    tryAnswer() {
      const now = Date.now();
      prune(answerTimestamps, now);
      if (answerTimestamps.length >= ANSWERS_PER_WINDOW) return false;
      answerTimestamps.push(now);
      return true;
    },
  };
}

function createIdleTimer(socket, timeoutMs) {
  if (!timeoutMs) return { reset() { }, clear() { } };

  let timer = null;

  function disconnect() {
    sendErrorEmbed(socket, 'Disconnected', 'Session timed out due to inactivity.');
    socket.disconnect(true);
  }

  function reset() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(disconnect, timeoutMs);
  }

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  reset();
  return { reset, clear };
}

async function handleCommand(bot, msg, socket, limiter) {
  if (!limiter.tryCommand()) {
    sendErrorEmbed(
      socket,
      'Rate limited',
      `Max ${COMMANDS_PER_WINDOW} commands per ${RATE_LIMIT_WINDOW_MS / 1000}s. Please slow down.`,
    );
    return false;
  }

  try {
    const result = await globals.commandManager.processInput(bot, msg);
    return !!result;
  } catch (err) {
    const embed = err.publicMessage?.embeds?.[0];
    const desc = embed?.description
      || embed?.title
      || (typeof err.publicMessage === 'string' ? err.publicMessage : null)
      || 'An error occurred.';
    sendErrorEmbed(socket, 'Error', desc);
    return true;
  }
}

async function startListen(io, sessionMiddleware) {
  await initialize();

  const ns = io.of(NAMESPACE);

  const wrap = (mw) => (socket, next) => mw(socket.request, {}, next);
  ns.use(wrap(sessionMiddleware));
  ns.use(wrap(passport.initialize()));
  ns.use(wrap(passport.session()));
  ns.use((socket, next) => {
    const { user } = socket.request;
    if (!user) return next(new Error('Not authenticated'));
    if (user.ban) return next(new Error(`Banned: ${user.ban.reason}`));
    return next();
  });

  ns.on(socketEvents.Socket.CONNECT, (socket) => {
    const { user } = socket.request;
    const userId = user.discordUser.id;
    const channelId = `ws-${userId}`;
    const limiter = createRateLimiter();

    globals.wsUsers.set(userId, user.discordUser);
    socket.join(channelId);

    // eslint-disable-next-line no-underscore-dangle
    const commands = globals.commandManager.commands_.map((cmd) => cmd.aliases[0]);
    let currentPrefixes = globals.prefixes.getForChannel(channelId);
    socket.emit(socketEvents.Server.INIT, { prefixes: currentPrefixes, commands });

    function checkPrefixUpdate() {
      const fresh = globals.prefixes.getForChannel(channelId);
      if (JSON.stringify(fresh) !== JSON.stringify(currentPrefixes)) {
        currentPrefixes = fresh;
        socket.emit(socketEvents.Server.INIT, { prefixes: currentPrefixes, commands });
      }
    }

    const idleTimer = createIdleTimer(socket, IDLE_TIMEOUT_MS);

    socket.on(socketEvents.Client.MESSAGE, async ({ text }, ack) => {
      try {
        if (!text || typeof text !== 'string') return;
        if (text.length > MAX_MESSAGE_LENGTH) return;

        idleTimer.reset();
        const trimmed = text.trim();

        const msg = createMsgShim(socket, user, channelId, checkPrefixUpdate);
        msg.content = trimmed;

        // Check for hooks (settings navigation, confirmations, etc.)
        const hookResult = globals.hook.action(globals.botShim, msg, globals.monochrome);
        if (hookResult) return;

        const handled = await handleCommand(globals.botShim, msg, socket, limiter);
        if (handled) return;

        if (!limiter.tryAnswer()) return;

        if (!globals.quizAnswer.action(globals.botShim, msg)) {
          globals.shiritoriAnswer.action(globals.botShim, msg);
        }
      } finally {
        if (typeof ack === 'function') ack();
      }
    });

    // "Message components"
    socket.on(socketEvents.Client.INTERACTION, async ({ messageId, customId } = {}) => {
      if (!messageId || !customId) return;
      idleTimer.reset();
      try {
        await InteractiveMessage.handleInteraction(
          createInteractionShim(userId, messageId, customId),
        );
      } catch (err) {
        globals.logger.error({
          event: 'INTERACTIVE MESSAGE ERROR',
          interactiveMessageId: err.interactiveMessageId,
          err,
        });
      }
    });

    socket.on(socketEvents.Socket.DISCONNECT, () => {
      idleTimer.clear();
      const room = ns.adapter.rooms?.get(channelId);
      if (room && room.size > 0) return;
      globals.quizManager.stopQuiz(channelId, userId, true);
      shiritoriManager.stopGame(channelId, userId);
    });
  });
}

module.exports = { startListen };
