const { webConsoleEvents: socketEvents } = require('kotoba-common');

const BOT_USER_ID = 'ws-bot';
let globals;

function unsupported(name) {
  console.warn(`web_console: bot.${name} called but not supported over WS`);
  return undefined;
}

function createBotShim() {
  return {
    user: { id: BOT_USER_ID, username: 'Kotoba' },
    users: {
      get(id) {
        if (id === BOT_USER_ID) return globals.botShim.user;
        return globals.wsUsers.get(id);
      },
    },
    guilds: { get(id) { return unsupported(`guilds.get(${id})`); } },
    privateChannels: { get(id) { return unsupported(`privateChannels.get(${id})`); } },
    channelGuildMap: {},
    requestHandler: { request() { return unsupported('requestHandler.request'); } },
    sendChannelTyping() { return Promise.resolve(); },
    editMessage() { return Promise.resolve(); },
    createMessage() { return unsupported('createMessage'); },
  };
}

function createMonochromeShim() {
  return {
    getErisBot() { return globals.botShim; },
    getLogger() { return globals.logger; },
    getPersistence() { return globals.persistence; },
    getSettings() { return globals.settings; },
    getBotAdminIds() { return []; },
    getCommandManager() { return globals.commandManager; },
    updateUserFromREST() { return Promise.resolve(); },
    userIsServerAdmin() { return true; },
    waitForMessage() { return Promise.reject(new Error('WAITER TIMEOUT')); },
    getBlacklist() { return { blacklistUser() { return Promise.resolve(); } }; },
    getGenericErrorMessage() { return 'An error occurred.'; },
    getMissingPermissionsErrorMessage() { return 'Missing permissions.'; },
    getDiscordInternalErrorMessage() { return 'Internal error.'; },
    getSettingsIconUri() { return undefined; },
    reload() { console.warn('web_console: monochrome.reload() called but not supported over WS'); },
    connect() { console.warn('web_console: monochrome.connect() called but not supported over WS'); },
  };
}

function preprocessDiscordMarkdown(text) {
  if (!text) return text;
  return text
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const u = globals.wsUsers.get(id);
      const name = u ? u.username : id;
      return `[${name}](https://discord.com/users/${id})`;
    });
}

function createMsgShim(socket, user, channelId, onSend) {
  return {
    channel: {
      id: channelId,
      type: 1,
      guild: null,
      permissionsOf() {
        return { json: new Proxy({}, { get: () => true }) };
      },
      // eslint-disable-next-line no-unused-vars
      createMessage(payload, _file, _msg) {
        const wsPayload = typeof payload === 'string'
          ? { content: payload }
          : { ...payload };

        if (typeof wsPayload.content === 'string') {
          wsPayload.content = preprocessDiscordMarkdown(wsPayload.content);
        }
        if (wsPayload.embeds) {
          wsPayload.embeds = wsPayload.embeds.map((e) => ({
            ...e,
            description: preprocessDiscordMarkdown(e.description),
            fields: e.fields?.map((f) => ({
              ...f,
              name: preprocessDiscordMarkdown(f.name),
              value: typeof f.value === 'string' ? preprocessDiscordMarkdown(f.value) : f.value,
            })),
          }));
        }

        if (wsPayload.attachments) {
          wsPayload.attachments = wsPayload.attachments.map((a) => ({
            filename: a.filename,
            file: a.file,
            binary: Buffer.isBuffer(a.file),
          }));
        }

        const msgId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        wsPayload.id = msgId;
        socket.emit(socketEvents.Server.MESSAGE, wsPayload);
        if (onSend) onSend();

        const msg = {
          id: msgId,
          edit(newPayload) {
            const edited = typeof newPayload === 'string'
              ? { content: newPayload }
              : { ...newPayload };
            edited.id = msgId;
            socket.emit(socketEvents.Server.MESSAGE_EDIT, edited);
            return Promise.resolve(msg);
          },
          delete() {
            socket.emit(socketEvents.Server.MESSAGE_DELETE, { id: msgId });
            return Promise.resolve();
          },
          addReaction(emoji) {
            socket.emit(socketEvents.Server.MESSAGE_REACTION, { id: msgId, emoji });
            return Promise.resolve();
          },
        };
        return Promise.resolve(msg);
      },
    },
    author: {
      id: user.discordUser.id,
      username: user.discordUser.username,
      mention: user.discordUser.username,
    },
    prefix: '',
    extension: '',
    content: '',
    // its effectively a DM, so
    authorIsServerAdmin: true,
    isInteraction: false,
  };
}

function createInteractionShim(userId, messageId, customId) {
  return {
    member: { id: userId },
    message: { id: messageId },
    data: { custom_id: customId },
    acknowledged: false,
    acknowledge() { this.acknowledged = true; return Promise.resolve(); },
    createMessage: () => Promise.resolve(),
  };
}

function initShims(g) { globals = g; }

module.exports = {
  initShims, createBotShim, createMonochromeShim, createMsgShim, createInteractionShim,
};
