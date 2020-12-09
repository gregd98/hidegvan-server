const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');

const nonce = Math.random().toString(36).slice(5);
const timestamp = Math.floor(new Date() / 1000);

const wssLoginPayload = ({ at, apiKey, appid }) => JSON.stringify({
  action: 'userOnline',
  at,
  apikey: apiKey,
  appid,
  nonce,
  ts: timestamp,
  userAgent: 'app',
  sequence: Math.floor(timestamp * 1000),
  version: 8,
});

module.exports = {
  async openWebSocket(connection, callback, ...{ heartbeat = 10000 }) {
    const payloadLogin = wssLoginPayload({
      at: connection.at,
      apiKey: connection.apiKey,
      appid: connection.APP_ID,
    });

    const wsp = new WebSocketAsPromised(`wss://${connection.region}-pconnect3.coolkit.cc:8080/api/ws`, {
      createWebSocket: (wss) => new W3CWebSocket(wss),
    });

    wsp.onMessage.addListener((message) => {
      if (message === 'pong') {
        callback({ action: 'ping', message: 'ping' });
      } else {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          callback(message);
        }
      }
    });

    wsp.onOpen.addListener(() => {
      callback({ action: 'socket', message: 'Socket opened.' });
    });
    wsp.onClose.addListener(() => {
      callback({ action: 'socket', message: 'Socket closed.' });
    });
    wsp.onError.addListener(() => {
      callback({ action: 'socket', message: 'Socket error.' });
    });

    await wsp.open();
    await wsp.send(payloadLogin);

    const interval = setInterval(async () => {
      if (wsp.isClosed || wsp.isClosing) {
        clearInterval(interval);
      } else {
        wsp.send('ping');
      }
    }, heartbeat);
    return wsp;
  },
};
