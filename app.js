const express = require('express'),
  http = require('http'),
  path = require('path'),
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

const getRules = () => db.get('rules').value().map((rule) => {
  const md = db.get('devices').find({ id: rule.measuringDevice }).value();
  const cd = db.get('devices').find({ id: rule.controlDevice }).value();
  return {
    ...rule,
    measuringDevice: {
      id: rule.measuringDevice,
      name: md ? md.name : '',
    },
    controlDevice: {
      id: rule.controlDevice,
      name: cd ? cd.name : '',
    },
  };
});

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

const evaluateRule = async (rule) => {
  const { fullControl } = db.get('appConfig').value();
  const updateFrontend = () => io.to('frontend').emit('rule update', getRules());
  const setRuleActivated = (state) => db.get('rules').find({ id: rule.id }).assign({ activated: state }).write();
  const switchDevice = (deviceId, state, iteration) => {
    const repeat = () => repeatUntilSucceed((i) => switchDevice(deviceId, state, i), iteration + 1);
    ewelinkApi.setPowerState(deviceId, state).then((result) => {
      if (result.error) {
        repeat();
      } else {
        setRuleActivated(state);
        updateFrontend();
      }
    }).catch((error) => {
      console.log(`Error: ${error.message}`);
      repeat();
    });
  };

  const switchFunc = (deviceId, state) => {
    repeatUntilSucceed((iteration) => switchDevice(deviceId, state, iteration));
    console.log(`${state ? 'Start' : 'Stop'} device: ${deviceId}.`);
  };

  try {
    const measuringDevice = db.get('devices').find({ id: rule.measuringDevice }).value();
    const controlDevice = db.get('devices').find({ id: rule.controlDevice }).value();
    if (measuringDevice && measuringDevice.temperature !== undefined && controlDevice) {
      if (time.checkInterval([rule.startTime, rule.endTime])) {
        console.log('Inside the interval');
        if (rule.activated) {
          if (measuringDevice.temperature > rule.maxTemp) {
            if (controlDevice.active) {
              switchFunc(controlDevice.deviceId, false);
            } else {
              setRuleActivated(false);
              updateFrontend();
            }
          } else if (fullControl && !controlDevice.active) {
            switchFunc(controlDevice.deviceId, true);
          }
        } else if (measuringDevice.temperature < rule.minTemp) {
          if (!controlDevice.active) {
            switchFunc(controlDevice.deviceId, true);
          } else {
            setRuleActivated(true);
            updateFrontend();
          }
        } else if (fullControl && controlDevice.active) {
          switchFunc(controlDevice.deviceId, false);
        }
      } else {
        console.log('Outside of the interval');
        if (rule.activated) {
          if (controlDevice.active) {
            const nextRule = db.get('rules').filter({ controlDevice: controlDevice.id, enabled: true }).value()
              .find((item) => {
                if (item.id !== rule.id) {
                  console.log(`Possible next: ${item}`);
                  const md = db.get('devices').find({ id: item.measuringDevice }).value();
                  return md && md.temperature !== undefined
                    && time.checkInterval([item.startTime, item.endTime])
                    && md.temperature < item.minTemp;
                }
                return false;
              });
            if (nextRule) {
              setRuleActivated(false);
              updateFrontend();
            } else {
              switchFunc(controlDevice.deviceId, false);
            }
          } else {
            setRuleActivated(false);
            updateFrontend();
          }
        }
      }
    }
  } catch (error) {
    console.log(`Error on rule ${rule.name}: ${error.message}`);
  }
};

const evaluateRulesByMeasuringDevice = (measuringDevice) => db.get('rules').filter({ measuringDevice }).value().forEach((rule) => evaluateRule(rule));
const evaluateRulesByControlDevice = (controlDevice) => db.get('rules').filter({ controlDevice }).value().forEach((rule) => evaluateRule(rule));

const initializeDevices = async () => {
  const updateFrontend = () => io.to('frontend').emit('device update', db.get('devices').value());
  const f = (device, iteration) => {
    console.log(`Device in iter: ${iteration}`);
    console.log(device);
    const { id, deviceId, initialized } = device;
    const dbDevice = db.get('devices').find({ id });
    const repeat = () => repeatUntilSucceed((i) => f(device, i), iteration + 1);
    const assignTemp = (temperature) => {
      dbDevice.assign({ temperature, initialized: true }).write();
      stat.get('devices').find({ id }).get('temperatures')
        .push({ date: (new Date()).toJSON(), temperature })
        .write();
      updateFrontend();
      evaluateRulesByMeasuringDevice(id);
    };
    const assignState = (state) => {
      dbDevice.assign({ active: state }).write();
      stat.get('devices').find({ id }).get('states')
        .push({ date: (new Date()).toJSON(), active: state })
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
              const { id, initialized } = dbDevice.value();
              const tmp = parseFloat(data.params.currentTemperature);
              const lastTmp = dbDevice.value().temperature;
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
                  evaluateRulesByMeasuringDevice(id);
                }
              } else {
                const { min, max } = db.get('temperatureLimits').value();
                if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
                  dbDevice.assign({ temperature: tmp, initialized: true }).write();
                  writeStat();
                  updateFrontend();
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
                  .push({ date: (new Date()).toJSON(), active })
                  .write();
                updateFrontend();
                evaluateRulesByControlDevice(id);
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
  // evaluateRules();
  let currentTime = time.getCurrentTime();
  setInterval(() => {
    const tmp = time.getCurrentTime();
    if (tmp !== currentTime) {
      currentTime = tmp;
      evaluateRules();
    }
  }, 1000);
};

io.on('connection', (socket) => {
  console.log('Client connected.');
  socket.join('frontend');
});

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

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRouter);

app.get('/*', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, './public', 'index.html'));
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
