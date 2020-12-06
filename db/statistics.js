const low = require('lowdb'),
  FileSync = require('lowdb/adapters/FileSync'),
  fs = require('fs');

const defaultDb = {
  devices: [
    {
      id: 'm2gRJOerFe2QFu0TVMC4z',
      temperatures: [],
      states: [],
    },
    {
      id: 'SvjYQOMVZrs6kITXdpqPy',
      temperatures: [],
      states: [],
    },
  ],
  devices2: [],
};

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}

// const db = low(new FileSync('data/statistics.json', {
//   serialize: (obj) => JSON.stringify(obj),
//   deserialize: (data) => JSON.parse(data),
// }));
const db = low(new FileSync('data/statistics.json'));
db.defaults(defaultDb).write();

module.exports = db;
