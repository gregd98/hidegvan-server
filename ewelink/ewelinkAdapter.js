const Ewelink = require('ewelink-api');

const promiseWithTimeout = (promise, timeout) => {
  let timeoutFunc = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutFunc = setTimeout(() => {
      reject(new Error('Timeout'));
    }, timeout);
  });
  return { race: Promise.race([promise, timeoutPromise]), timeoutFunc };
};

const withTimeout = async (promise, timeout) => {
  const { race, timeoutFunc } = promiseWithTimeout(promise, timeout);
  try {
    return await race;
  } catch (error) {
    throw new Error(error.message);
  } finally {
    clearTimeout(timeoutFunc);
  }
};

const getDevice = (connection, deviceId) => new Promise((resolve, reject) => {
  connection.getDevice(deviceId).then((result) => {
    resolve(result);
  }).catch((error) => {
    console.log(`Error: ${error.message}`);
    reject(new Error('Api error.'));
  });
});

const getCredentials = (connection) => new Promise((resolve, reject) => {
  connection.getCredentials().then((result) => {
    resolve(result);
  }).catch((error) => {
    console.log(`Error: ${error.message}`);
    reject(new Error('Api error.'));
  });
});

const setPowerState = (connection, deviceId, state) => new Promise((resolve, reject) => {
  connection.setDevicePowerState(deviceId, state ? 'on' : 'off', 1).then((result) => {
    resolve(result);
  }).catch((error) => {
    console.log(`Error: ${error.message}`);
    reject(new Error('Api error.'));
  });
});

class EwelinkAdapter {
  constructor() {
    this.connection = null;
  }

  setConnection(credentials) {
    this.connection = new Ewelink(credentials);
  }

  async getCredentials(timeout = 5000) {
    return withTimeout(getCredentials(this.connection), timeout);
  }

  async getDevice(deviceId, timeout = 5000) {
    return withTimeout(getDevice(this.connection, deviceId), timeout);
  }

  async setPowerState(deviceId, state, timeout = 5000) {
    return withTimeout(setPowerState(this.connection, deviceId, state), timeout);
  }
}

const adapter = new EwelinkAdapter();
module.exports = adapter;
