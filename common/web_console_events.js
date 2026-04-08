module.exports = {
  Server: {
    INIT: 'init',
    MESSAGE: 'message',
    MESSAGE_EDIT: 'message:edit',
    MESSAGE_DELETE: 'message:delete',
    MESSAGE_REACTION: 'message:reaction',
  },
  Client: {
    MESSAGE: 'message',
    INTERACTION: 'interaction',
  },
  Socket: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
  },
  Message: {
    INVALID_NAMESPACE: 'Invalid namespace',
  },
};
