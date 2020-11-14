const express = require('express'),
  http = require('http'),
  socketIo = require('socket.io'),
  db = require('./db/db'),
  stat = require('./db/statistics'),
  ewelinkApi = require('./ewelink/ewelinkAdapter'),
  time = require('./utils/time'),
  apiRouter = require('./routes/api');

const PORT = 80;
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

ewelinkApi.setConnection(db.get('apiConfig').value());

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

const evaluateRule = async (rule) => {
  const switchDevice = (deviceId, state, ruleId, iteration) => {
    const repeat = () => repeatUntilSucceed(
      (i) => switchDevice(deviceId, state, ruleId, i), iteration + 1,
    );
    ewelinkApi.setPowerState(deviceId, state).then((result) => {
      if (result.error) {
        repeat();
      } else {
        db.get('rules').find({ id: ruleId }).assign({ started: state }).write();
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
    const measuringDevice = db.get('devices').find({ deviceId: rule.measuringDevice }).value();
    const controlDevice = db.get('devices').find({ deviceId: rule.controlDevice }).value();
    if (measuringDevice && measuringDevice.temperature !== undefined && controlDevice) {
      if (time.checkInterval(rule.startTime, rule.endTime)) {
        console.log('Inside the interval');
        if (rule.started) {
          if (measuringDevice.temperature > rule.maxTemp) {
            if (controlDevice.active) {
              switchFunc(controlDevice.deviceId, rule.id, false);
            } else {
              db.get('rules').find({ id: rule.id }).assign({ started: false }).write();
            }
          } else if (!controlDevice.active) {
            switchFunc(controlDevice.deviceId, rule.id, true);
          }
        } else if (measuringDevice.temperature < rule.minTemp) {
          if (!controlDevice.active) {
            switchFunc(controlDevice.deviceId, rule.id, true);
          } else {
            db.get('rules').find({ id: rule.id }).assign({ started: true }).write();
          }
        } else if (controlDevice.active) {
          switchFunc(controlDevice.deviceId, rule.id, false);
        }
      } else {
        // TODO itt majd checkolni kell a tobbi ruleos szitut
        console.log('Outside of the interval');
        if (controlDevice.active) {
          switchFunc(controlDevice.deviceId, rule.id, false);
        }
      }
    }
  } catch (error) {
    console.log(`Error on rule ${rule.name}: ${error.message}`);
  }
};

const initializeDevices = () => {
  const f = (deviceId, iteration) => {
    const repeat = () => repeatUntilSucceed((i) => f(deviceId, i), iteration + 1);
    const assignTemp = (temperature) => {
      stat.get('devices').find({ deviceId }).get('temperatures')
        .push({ date: (new Date()).toJSON(), temperature })
        .write();
      db.get('devices').find({ deviceId }).assign({ temperature, initialized: true }).write();
    };
    const assignState = (state) => {
      stat.get('devices').find({ deviceId }).get('states')
        .push({ date: (new Date()).toJSON(), active: state })
        .write();
      db.get('devices').find({ deviceId }).assign({ active: state }).write();
    };
    const { initialized } = db.get('devices').find({ deviceId }).value();
    ewelinkApi.getDevice(deviceId).then((result) => {
      // console.log(result);
      if (result.error) {
        if (!initialized) {
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
    db.get('devices').find({ deviceId: device.deviceId }).assign({ initialized: false }).write();
    repeatUntilSucceed((iteration) => f(device.deviceId, iteration));
  });
};

const initializeSocket = async () => {
  let socket;
  const openSocket = async () => {
    try {
      socket = await ewelinkApi.connection.openWebSocket((data) => {
        // console.log(data);
        if (data !== 'pong' && !(data.error !== undefined && data.error === 0)) {
          const updateFrontend = () => io.to('frontend').emit('device update', db.get('devices').value());
          if (data.params.currentTemperature) {
            console.log(`Device ${data.deviceid}: ${data.params.currentTemperature}`);
            const deviceId = data.deviceid;
            const dbDevice = db.get('devices').find({ deviceId });
            const { initialized } = dbDevice.value();
            const tmp = parseFloat(data.params.currentTemperature);
            const lastTmp = dbDevice.value().temperature;
            const writeStat = () => stat.get('devices').find({ deviceId }).get('temperatures').push({ date: (new Date()).toJSON(), temperature: tmp })
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
              stat.get('devices').find({ deviceId }).get('states')
                .push({ date: (new Date()).toJSON(), active })
                .write();
              updateFrontend();
              db.get('rules').filter({ controlDevice: deviceId }).value().forEach((rule) => evaluateRule(rule));
            }
            console.log(`Device ${data.deviceid} turned ${data.params.switch} (${data.sequence})`);
          }
        }
      });

      const interval = setInterval(async () => {
        // eslint-disable-next-line no-underscore-dangle
        if (!socket._ws) {
          console.log('Socket failed, reopening.');
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
  /* db.get('rules').value().forEach((rule) => {
    db.get('rules').find({ id: rule.id }).assign({ started: false }).write();
  }); */

  const evaluateRules = () => db.get('rules').filter({ active: true }).value()
    .forEach((rule) => evaluateRule(rule));
  evaluateRules();
  setInterval(evaluateRules, 10000);
};

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

  socket.on('send message', (message) => {
    console.log(`Message received: ${message}`);
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
