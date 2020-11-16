const express = require('express'),
  http = require('http'),
  db = require('./db/db'),
  stat = require('./db/statistics'),
  ewelinkApi = require('./ewelink/ewelinkAdapter'),
  time = require('./utils/time'),
  apiRouter = require('./routes/api'),
  so = require('./utils/socketing');

const PORT = 80;
const app = express();
const server = http.createServer(app);
const io = so.initialize(server);

ewelinkApi.setConnection(db.get('apiConfig').value());

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

const evaluateRule = async (rule) => {
  const { fullControl } = db.get('appConfig').value();
  const updateFrontend = () => io.to('frontend').emit('rule update', db.get('rules').value());
  const switchDevice = (deviceId, state, ruleId, iteration) => {
    const repeat = () => repeatUntilSucceed(
      (i) => switchDevice(deviceId, state, ruleId, i), iteration + 1,
    );
    ewelinkApi.setPowerState(deviceId, state).then((result) => {
      if (result.error) {
        repeat();
      } else {
        db.get('rules').find({ id: ruleId }).assign({ activated: state }).write();
        updateFrontend();
      }
    }).catch((error) => {
      console.log(`Error: ${error.message}`);
      repeat();
    });
  };

  const switchFunc = (deviceId, ruleId, state) => {
    repeatUntilSucceed((iteration) => switchDevice(deviceId, state, ruleId, iteration));
    console.log(`${state ? 'Start' : 'Stop'} device: ${deviceId}.`);
  };

  try {
    const measuringDevice = db.get('devices').find({ id: rule.measuringDevice }).value();
    const controlDevice = db.get('devices').find({ id: rule.controlDevice }).value();
    if (measuringDevice && measuringDevice.temperature !== undefined && controlDevice) {
      if (time.checkInterval(rule.startTime, rule.endTime)) {
        console.log('Inside the interval');
        if (rule.activated) {
          if (measuringDevice.temperature > rule.maxTemp) {
            if (controlDevice.active) {
              switchFunc(controlDevice.deviceId, rule.id, false);
            } else {
              db.get('rules').find({ id: rule.id }).assign({ activated: false }).write();
              updateFrontend();
            }
          } else if (fullControl && !controlDevice.active) {
            switchFunc(controlDevice.deviceId, rule.id, true);
          }
        } else if (measuringDevice.temperature < rule.minTemp) {
          if (!controlDevice.active) {
            switchFunc(controlDevice.deviceId, rule.id, true);
          } else {
            db.get('rules').find({ id: rule.id }).assign({ activated: true }).write();
            updateFrontend();
          }
        } else if (fullControl && controlDevice.active) {
          switchFunc(controlDevice.deviceId, rule.id, false);
        }
      } else {
        console.log('Outside of the interval');
        if (rule.activated) {
          // mindenkeppen inaktiv
          if (controlDevice.active) {
            // TODO ha egyeb rule nem kell bekapcsolva tartsa
            switchFunc(controlDevice.deviceId, rule.id, false);
          }
        }

        if (controlDevice.active) {
          // TODO itt majd checkolni kell a tobbi ruleos szitut
          switchFunc(controlDevice.deviceId, rule.id, false);
        }
      }
    }
  } catch (error) {
    console.log(`Error on rule ${rule.name}: ${error.message}`);
  }
};

const initializeDevices = async () => {
  const f = (device, iteration) => {
    const { id, deviceId, initialized } = device;
    const dbDevice = db.get('devices').find({ id });
    const repeat = () => repeatUntilSucceed((i) => f(deviceId, i), iteration + 1);
    const assignTemp = (temperature) => {
      dbDevice.assign({ temperature, initialized: true }).write();
      stat.get('devices').find({ id }).get('temperatures')
        .push({ date: (new Date()).toJSON(), temperature })
        .write();
    };
    const assignState = (state) => {
      dbDevice.assign({ active: state }).write();
      stat.get('devices').find({ id }).get('states')
        .push({ date: (new Date()).toJSON(), active: state })
        .write();
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
        const { min, max } = db.get('temperatureLimits').value();
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
        // console.log(result);
        let data = result;
        if (data !== 'pong' && !(data.error !== undefined && data.error === 0)) {
          const updateFrontend = () => io.to('frontend').emit('device update', db.get('devices').value());
          if (!data.params) {
            try {
              data = JSON.parse(result);
              console.log('Retard data');
            } catch (error) {
              console.log(`Socket json parse error: ${error.message}`);
            }
          }
          if (data.deviceid && db.get('devices').find({ deviceId: data.deviceid }).value()) {
            if (data.params.currentTemperature) {
              console.log(`Device ${data.deviceid}: ${data.params.currentTemperature}`);
              const deviceId = data.deviceid;
              const dbDevice = db.get('devices').find({ deviceId });
              const { initialized } = dbDevice.value();
              const tmp = parseFloat(data.params.currentTemperature);
              const lastTmp = dbDevice.value().temperature;
              const { id } = db.get('devices').find({ deviceId }).value();
              const writeStat = () => stat.get('devices').find({ id }).get('temperatures').push({
                date: (new Date()).toJSON(),
                temperature: tmp,
              })
                .write();
              if (initialized) {
                if (!Number.isNaN(tmp) && tmp !== lastTmp && Math.abs(tmp - lastTmp) <= 10) {
                  dbDevice.assign({ temperature: tmp }).write();
                  writeStat();
                  updateFrontend();
                  db.get('rules').filter({ measuringDevice: deviceId }).value().forEach((rule) => evaluateRule(rule));
                }
              } else {
                const { min, max } = db.get('temperatureLimits').value();
                if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
                  dbDevice.assign({ temperature: tmp, initialized: true }).write();
                  writeStat();
                  updateFrontend();
                  db.get('rules').filter({ measuringDevice: deviceId }).value().forEach((rule) => evaluateRule(rule));
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
                const { id } = db.get('devices').find({ deviceId }).value();
                stat.get('devices').find({ id }).get('states')
                  .push({ date: (new Date()).toJSON(), active })
                  .write();
                updateFrontend();
                db.get('rules').filter({ controlDevice: id }).value().forEach((rule) => evaluateRule(rule));
              }
              console.log(`Device ${data.deviceid} turned ${data.params.switch} (${data.sequence})`);
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

const initializeRules = async () => {
  const evaluateRules = () => db.get('rules').filter({ enabled: true }).value()
    .forEach((rule) => evaluateRule(rule));
  evaluateRules();
  setInterval(evaluateRules, 10000);
};

const k = db.get('devices').find({ name: 'Egyeskee' }).value();
console.log(k);

ewelinkApi.getCredentials().then((result) => {
  if (result.error) {
    console.log(result.msg);
  } else {
    initializeDevices();
    initializeSocket();
    initializeRules();
  }
}).catch((error) => {
  console.log(`Error: ${error.message}`);
});

app.use('/api', apiRouter);

io.on('connection', (socket) => {
  console.log('Client connected.');
  socket.join('frontend');
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
