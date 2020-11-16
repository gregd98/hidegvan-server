const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  appConfig: {
    fullControl: false,
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
  rules: [
    {
      id: 'jnR0VId4c3zSMml2wsMCW',
      name: 'rule1',
      startTime: 480,
      endTime: 549,
      measuringDevice: 'm2gRJOerFe2QFu0TVMC4z',
      controlDevice: 'm2gRJOerFe2QFu0TVMC4z',
      minTemp: 18.8,
      maxTemp: 18.8,
      enabled: true,
      activated: false,
    },
  ],
};

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

const db = low(new FileSync('data/db.json'));
db.defaults(defaultDb).write();

module.exports = db;
