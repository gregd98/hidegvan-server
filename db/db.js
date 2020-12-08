const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  appConfig: {},
  apiConfig: {},
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

const db = low(new FileSync('data/db.json', {
  serialize: (obj) => JSON.stringify(obj),
  deserialize: (data) => JSON.parse(data),
}));
db.defaults(defaultDb).write();

module.exports = db;
