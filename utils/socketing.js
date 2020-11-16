const socketIo = require('socket.io');

let instance = null;
class Socket {
  constructor(server) {
    this.io = socketIo(server);
  }

  getIo() {
    return this.io;
  }
}

exports.initialize = (server) => {
  instance = new Socket(server);
  return instance.getIo();
};

exports.getIo = () => {
  if (instance !== null) {
    return instance.getIo();
  }
  return undefined;
};
