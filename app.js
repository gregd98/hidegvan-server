const express = require('express'),
  session = require('express-session'),
  http = require('http'),
  path = require('path'),
  config = require('config'),
  db = require('./db/db'),
  stat = require('./db/statistics'),
  ewelinkApi = require('./ewelink/ewelinkAdapter'),
  time = require('./utils/time'),
  apiRouter = require('./routes/api'),
  so = require('./utils/socketing'),
  rules = require('./logic/rules');

const app = express();
const server = http.createServer(app);
const io = so.initialize(server);

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

const evaluateRulesByMeasuringDevice = (measuringDevice) => db.get('rules').filter({ measuringDevice }).value().forEach((rule) => rules.evaluateRule(rule));
const evaluateRulesByControlDevice = (controlDevice) => db.get('rules').filter({ controlDevice }).value().forEach((rule) => rules.evaluateRule(rule));

const insertStatGap = (id) => {
  const dbTemp = stat.get('devices').find({ id }).get('temperatures');
  const len = dbTemp.value().length;
  if (len > 0 && (dbTemp.value())[len - 1][1] !== null) {
    dbTemp.push([Math.floor(((new Date()).getTime() + (dbTemp.value())[len - 1][0]) / 2), null])
      .write();
  }
};

const initializeDevices = async () => {
  const updateFrontend = () => io.to('frontend').emit('device update', db.get('devices').value());
  const f = (device, iteration) => {
    const { id, deviceId, initialized } = device;
    const dbDevice = db.get('devices').find({ id });
    const repeat = () => repeatUntilSucceed((i) => f(device, i), iteration + 1);
    const assignTemp = (temperature) => {
      dbDevice.assign({ temperature, initialized: true }).write();
      insertStatGap(id);
      stat.get('devices').find({ id }).get('temperatures')
        // .push({ date: (new Date()).toJSON(), temperature })
        .push([(new Date()).getTime(), temperature])
        .write();
      updateFrontend();
      evaluateRulesByMeasuringDevice(id);
    };
    const assignState = (state) => {
      dbDevice.assign({ active: state }).write();
      stat.get('devices').find({ id }).get('states')
        .push([(new Date()).getTime(), state])
        .write();
      updateFrontend();
      evaluateRulesByControlDevice(id);
    };
    ewelinkApi.getDevice(deviceId).then((result) => {
      if (result.error) {
        if (!initialized) {
          // TODO ezt akarjuk-e vajon
          repeat();
        }
      } else {
        const tmp = parseFloat(result.params.currentTemperature);
        assignState(result.params.switch === 'on');
        const { min, max } = db.get('appConfig').value().temperatureLimits;
        if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
          assignTemp(tmp);
        }
      }
    }).catch((error) => {
      console.log(`Error: ${error.message}`);
      if (!initialized) {
        repeat();
      }
    });
  };

  db.get('devices').value().forEach((device) => {
    db.get('devices').find({ id: device.id }).assign({ initialized: false }).write();
    repeatUntilSucceed((iteration) => f(device, iteration));
  });
};

const initializeSocket = async () => {
  let socket;
  const openSocket = async () => {
    try {
      socket = await ewelinkApi.connection.openWebSocket((result) => {
        let data = result;
        if (data !== 'pong' && !(data.error !== undefined && data.error === 0)) {
          const updateFrontend = () => io.to('frontend').emit('device update', db.get('devices').value());
          if (!data.params) {
            try {
              data = JSON.parse(result);
            } catch (error) {
              console.log(`Socket json parse error: ${error.message}`);
            }
          }
          if (data.deviceid && db.get('devices').find({ deviceId: data.deviceid }).value()) {
            if (data.params.currentTemperature) {
              const deviceId = data.deviceid;
              const dbDevice = db.get('devices').find({ deviceId });
              const { id, initialized } = dbDevice.value();
              const tmp = parseFloat(data.params.currentTemperature);
              const lastTmp = dbDevice.value().temperature;
              const currentTime = (new Date()).getTime();
              const writeStat = () => stat.get('devices').find({ id }).get('temperatures')
                .push([currentTime, tmp])
                .write();
              if (initialized) {
                if (!Number.isNaN(tmp) && tmp !== lastTmp && Math.abs(tmp - lastTmp) <= 5) {
                  dbDevice.assign({ temperature: tmp }).write();
                  writeStat();
                  updateFrontend();
                  io.to('frontend').emit('temperature update', { deviceId: id, temperature: [currentTime, tmp] });
                  evaluateRulesByMeasuringDevice(id);
                }
              } else {
                const { min, max } = db.get('appConfig').value().temperatureLimits;
                if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
                  dbDevice.assign({ temperature: tmp, initialized: true }).write();
                  insertStatGap(id);
                  writeStat();
                  updateFrontend();
                  io.to('frontend').emit('temperature update', { deviceId: id, temperature: [currentTime, tmp] });
                  evaluateRulesByMeasuringDevice(id);
                }
              }
            }
            if (data.params.switch) {
              const deviceId = data.deviceid;
              const dbDevice = db.get('devices').find({ deviceId });
              const active = data.params.switch === 'on';
              const lastActive = dbDevice.value().active;
              if (lastActive === undefined || lastActive !== active) {
                dbDevice.assign({ active }).write();
                const { id } = dbDevice.value();
                stat.get('devices').find({ id }).get('states')
                  .push([(new Date()).getTime(), active])
                  .write();
                updateFrontend();
                evaluateRulesByControlDevice(id);
              }
            }
          }
        }
      });

      const interval = setInterval(async () => {
        // eslint-disable-next-line no-underscore-dangle
        if (!socket._ws) {
          clearInterval(interval);
          socket.close();
          await openSocket();
        }
      }, 10000);
    } catch (error) {
      console.log(`Failed to open socket: ${error.message}`);
      setTimeout(async () => {
        await openSocket();
      }, 5000);
    }
  };
  await openSocket();
};

const deleteExpiredSessions = () => {
  console.log('Deleting expired sessions.');
  const ct = (new Date()).getTime();
  db.get('sessions').value()
    .filter((item) => ct - (new Date(item.created)).getTime() > db.get('appConfig').value().sessionMaxAge)
    .map((item) => item.sessionId)
    .forEach((sessionId) => db.get('sessions').remove({ sessionId }).write());
};

const initializeRules = async () => {
  const evaluateRules = () => db.get('rules').filter({ enabled: true }).value()
    .forEach((rule) => rules.evaluateRule(rule));
  let currentTime = time.getCurrentTime();
  setInterval(() => {
    const tmp = time.getCurrentTime();
    if (tmp !== currentTime) {
      currentTime = tmp;
      if (currentTime === 1074) {
        deleteExpiredSessions();
      }
      evaluateRules();
    }
  }, 1000);
};

const readConfig = () => {
  if (config.has('apiConfig')) {
    const apiConfig = config.get('apiConfig');
    if (apiConfig.email && apiConfig.password && apiConfig.region) {
      db.set('apiConfig', apiConfig).write();
    } else {
      return false;
    }
  } else {
    return false;
  }
  if (config.has('appConfig')) {
    const appConfig = config.get('appConfig');
    if (appConfig.port && appConfig.fullControl !== undefined && appConfig.sessionMaxAge) {
      db.set('appConfig', appConfig).write();
    } else {
      return false;
    }
  } else {
    return false;
  }
  return true;
};

io.on('connection', (socket) => {
  socket.join('frontend');
});

app.use(session({
  secret: 'super secret',
  cookie: { maxAge: 43200000 },
  resave: false,
  saveUninitialized: true,
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRouter);

app.get('/*', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, './public', 'index.html'));
});

const pressAnyKeyToExit = () => {
  console.log('Press any key to exit...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', process.exit.bind(process, 0));
};

if (readConfig()) {
  ewelinkApi.setConnection(db.get('apiConfig').value());
  ewelinkApi.getCredentials().then((result) => {
    if (result.error) {
      console.log(`Error: ${result.msg}`);
      pressAnyKeyToExit();
    } else {
      initializeDevices();
      initializeSocket();
      initializeRules();
      const { port } = db.get('appConfig').value();
      server.listen(port, () => console.log(`Server running on port ${port}`));
    }
  }).catch((error) => {
    pressAnyKeyToExit();
    console.log(`Error: ${error.message}`);
  });
} else {
  console.log('Error: Invalid config file.');
  pressAnyKeyToExit();
}
