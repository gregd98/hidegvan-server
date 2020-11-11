const express = require('express'),
  db = require('./db/db'),
  stat = require('./db/statistics'),
  ewelinkApi = require('./ewelink/ewelinkAdapter');

const PORT = 80;
const app = express();

ewelinkApi.setConnection(db.get('apiConfig').value());

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

const initializeDevices = () => {
  const f = (deviceId, iteration) => {
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
      console.log(result);
      if (result.error) {
        if (!initialized) {
          repeatUntilSucceed((i) => f(deviceId, i), iteration + 1);
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
        repeatUntilSucceed((i) => f(deviceId, i), iteration + 1);
      }
    });
  };

  db.get('devices').value().forEach((device) => {
    db.get('devices').find({ deviceId: device.deviceId }).assign({ initialized: false }).write();
    repeatUntilSucceed((iteration) => f(device.deviceId, iteration));
  });
};

const initializeSocket = async () => {
  try {
    await ewelinkApi.connection.openWebSocket(async (data) => {
      if (data !== 'pong' && !(data.error !== undefined && data.error === 0)) {
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
            }
          } else {
            const { min, max } = db.get('temperatureLimits').value();
            if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
              dbDevice.assign({ temperature: tmp, initialized: true }).write();
              writeStat();
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
          }
          console.log(`Device ${data.deviceid} turned ${data.params.switch} (${data.sequence})`);
        }
      }
    });
  } catch (error) {
    console.log(error.message);
  }
};

ewelinkApi.getCredentials().then((result) => {
  if (result.error) {
    console.log(result.msg);
  } else {
    ewelinkApi.getDevice('10005e6c69').then((resulttt) => {
      console.log(resulttt);
    }).catch((error) => {
      console.log(error.message);
    });
    initializeDevices();
    initializeSocket();
  }
}).catch((error) => {
  console.log(`Error: ${error.message}`);
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
