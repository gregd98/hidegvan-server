const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync');

const defaultDb = {
  devices: [
    { deviceId: '10005e6c69', temperatures: [], states: [] },
    { deviceId: '10005e6de6', temperatures: [], states: [] },
  ],
};

const db = low(new FileSync('data/statistics.json'));
db.defaults(defaultDb).write();

module.exports = db;
