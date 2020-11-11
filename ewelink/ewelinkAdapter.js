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
    console.log(error.message);
    reject(new Error('Api error'));
  });
});

const getTemperature = (connection, deviceId) => new Promise((resolve, reject) => {
  connection.getDeviceCurrentTemperature(deviceId).then((result) => {
    resolve(result);
  }).catch((error) => {
    console.log(error.message);
    reject(new Error('Api error'));
  });
});

const getCredentials = (connection) => new Promise((resolve, reject) => {
  connection.getCredentials().then((result) => {
    resolve(result);
  }).catch((error) => {
    console.log(error.message);
    reject(new Error('Api error'));
  });
});

class EwelinkAdapter {
  constructor() {
    this.connection = null;
  }

  setConnection(credentials) {
    this.connection = new Ewelink(credentials);
  }

  async getCredentials() {
    return withTimeout(getCredentials(this.connection), 5000);
  }

  async getDevice(deviceId) {
    return withTimeout(getDevice(this.connection, deviceId), 5000);
  }

  async getTemperature(deviceId) {
    return withTimeout(getTemperature(this.connection, deviceId), 5000);
  }
}

const adapter = new EwelinkAdapter();
// Object.freeze(adapter);

module.exports = adapter;
