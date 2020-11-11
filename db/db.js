const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync');

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
  rules: [],
};

const db = low(new FileSync('data/db.json'));
db.defaults(defaultDb).write();

module.exports = db;
