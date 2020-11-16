const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  devices: [],
};

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const db = low(new FileSync('data/statistics.json'));
db.defaults(defaultDb).write();

module.exports = db;
