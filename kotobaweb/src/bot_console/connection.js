import { webConsoleEvents as socketEvents } from 'kotoba-common';
import { BOT as namespace } from '../common/socket_namespaces';
import { ConnectionStatus, MessageType } from '../common/bot_console/socket_event_enums';
import createSocket from '../util/create_socket';

let socket = null;
const state = {
  status: ConnectionStatus.DISCONNECTED,
  messages: [],
  nextId: 0,
  pending: false,
  prefixes: [],
  commands: [],
};

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn({ ...state }));
}

function addMessage(msg) {
  state.messages = [...state.messages, msg];
  state.nextId += 1;
  notify();
}

function connect() {
  if (socket) return;

  state.status = ConnectionStatus.CONNECTING;
  notify();

  socket = createSocket(namespace);

  socket.on(socketEvents.Server.INIT, ({ prefixes, commands }) => {
    state.prefixes = prefixes || [];
    state.commands = commands || [];
    notify();
  });

  socket.on(socketEvents.Socket.CONNECT, () => {
    state.status = ConnectionStatus.CONNECTED;
    notify();
  });

  socket.on(socketEvents.Socket.DISCONNECT, () => {
    state.status = ConnectionStatus.DISCONNECTED;
    state.pending = false;
    notify();
  });

  socket.on(socketEvents.Socket.CONNECT_ERROR, (err) => {
    state.pending = false;
    if (err.message === socketEvents.Message.INVALID_NAMESPACE) {
      state.status = ConnectionStatus.UNAVAILABLE;
      socket.close();
      socket = null;
    } else {
      state.status = ConnectionStatus.DISCONNECTED;
      addMessage({
        id: state.nextId, type: MessageType.SYSTEM, text: `Connection error: ${err.message}`,
      });
    }
    notify();
  });

  socket.on(socketEvents.Server.MESSAGE, (data) => {
    state.pending = false;
    addMessage({
      serverId: data.id,
      id: state.nextId,
      type: MessageType.BOT,
      data,
    });
  });

  socket.on(socketEvents.Server.MESSAGE_EDIT, (data) => {
    state.messages = state.messages.map((msg) => {
      if (msg.serverId && msg.serverId === data.id) {
        return {
          ...msg, data, loadingButtonId: null, editedAt: Date.now(),
        };
      }
      return msg;
    });
    notify();
  });

  socket.on(socketEvents.Server.MESSAGE_DELETE, ({ id }) => {
    state.messages = state.messages.filter((msg) => msg.serverId !== id);
    notify();
  });

  socket.on(socketEvents.Server.MESSAGE_REACTION, ({ id, emoji }) => {
    state.messages = state.messages.map((msg) => {
      if (msg.serverId && msg.serverId === id) {
        const reactions = (msg.reactions || []).concat(emoji);
        return { ...msg, reactions };
      }
      return msg;
    });
    notify();
  });
}

function send(text) {
  if (!socket || state.status !== ConnectionStatus.CONNECTED) return;
  state.pending = true;
  addMessage({ id: state.nextId, type: MessageType.USER, text });
  socket.emit(socketEvents.Client.MESSAGE, { text });
}

function interact(messageId, customId) {
  if (!socket || state.status !== ConnectionStatus.CONNECTED) return;

  state.messages = state.messages.map((msg) => {
    if (msg.serverId === messageId) {
      return { ...msg, loadingButtonId: customId };
    }
    return msg;
  });
  notify();

  socket.emit(socketEvents.Client.INTERACTION, { messageId, customId });
}

function reconnect() {
  if (socket) {
    socket.removeAllListeners();
    socket.close();
    socket = null;
  }
  connect();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getState() {
  return { ...state };
}

function isConnected() {
  return state.status === ConnectionStatus.CONNECTED;
}

export default {
  connect,
  reconnect,
  send,
  interact,
  subscribe,
  getState,
  isConnected,
};
