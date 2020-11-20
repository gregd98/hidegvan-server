const db = require('../db/db'),
  ewelinkApi = require('../ewelink/ewelinkAdapter'),
  time = require('../utils/time'),
  so = require('../utils/socketing');

const repeatUntilSucceed = (f, iteration = 0) => {
  setTimeout(() => f(iteration), Math.min(iteration, 60) * 1000);
};

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

const updateFrontend = () => {
  so.getIo().to('frontend').emit('rule update', getRules());
};

exports.evaluateRule = async (rule) => {
  const { fullControl } = db.get('appConfig').value();
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
    if (rule.enabled) {
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
    }
  } catch (error) {
    console.log(`Error on rule ${rule.name}: ${error.message}`);
  }
};

exports.getRules = () => getRules();
