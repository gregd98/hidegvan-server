const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  appConfig: {
    fullControl: false,
    sessionMaxAge: 21600000,
  },
  apiConfig: {
    email: 'andras.demeny@gmail.com',
    password: 'Kicsikutya',
    region: 'eu',
  },
  temperatureLimits: {
    min: 1,
    max: 100,
  },
  users: [],
  sessions: [],
  devices: [
    {
      id: 'm2gRJOerFe2QFu0TVMC4z',
      deviceId: '10005e6c69',
      name: 'Hőmérő',
      measuring: true,
    },
    {
      id: 'SvjYQOMVZrs6kITXdpqPy',
      deviceId: '10005e6de6',
      name: 'Hőpompa',
      measuring: true,
    },
  ],
  rules: [],
};

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const db = low(new FileSync('data/db.json'));
db.defaults(defaultDb).write();

module.exports = db;
