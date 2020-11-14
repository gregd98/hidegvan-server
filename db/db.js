const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  apiConfig: {
    email: 'andras.demeny@gmail.com',
    password: 'Kicsikutya',
    region: 'eu',
  },
  temperatureLimits: {
    min: 1,
    max: 100,
  },
  devices: [
    {
      deviceId: '10005e6c69', name: 'Egyeske', measuring: true, initialized: true,
    },
    {
      deviceId: '10005e6de6', name: 'Ketteske', measuring: true, initialized: true,
    },
  ],
  rules: [
    {
      id: 'jnR0VId4c3zSMml2wsMCW',
      name: 'rule1',
      startTime: 190,
      endTime: 371,
      measuringDevice: '10005e6c69',
      controlDevice: '10005e6c69',
      minTemp: 19.9,
      maxTemp: 19.9,
      active: true,
      started: false,
    },
  ],
};

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const db = low(new FileSync('data/db.json'));
db.defaults(defaultDb).write();

module.exports = db;
