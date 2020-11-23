const express = require('express'),
  validate = require('validate.js'),
  nanoid = require('nanoid'),
  db = require('../db/db'),
  stat = require('../db/statistics'),
  bp = require('../middleware/bodyParser'),
  ids = require('../middleware/idValidator'),
  responses = require('../utils/responses'),
  rules = require('../constraints/deviceConstraints'),
  ewelinkApi = require('../ewelink/ewelinkAdapter'),
  so = require('../utils/socketing'),
  auth = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(auth.authorize());

const updateDeviceFrontend = () => {
  so.getIo().to('frontend').emit('device update', db.get('devices').value());
};

const switchDevice = (deviceId, state) => new Promise((resolve, reject) => {
  const rejectDelay = (reason) =>  new Promise((resolve2, reject2) => {
    setTimeout(reject2.bind(null, reason), 500);
  });
  const attempt = () => new Promise((resolve2, reject2) => {
    ewelinkApi.setPowerState(deviceId, state).then((result) => {
      if (result.error) {
        reject2(new Error(result.error.msg));
      } else {
        resolve2();
      }
    }).catch((error) => {
      console.log(error.message);
      reject2(new Error('API error.'));
    });
  });

  let p = Promise.reject();
  for (let i = 0; i < 5; i += 1) {
    p = p.catch(attempt).catch(rejectDelay);
  }
  p.then((result) => {
    resolve(result);
  }).catch((error) => {
    reject(error);
  });
});

router.get('/', (req, res) => {
  responses.rest(res, db.get('devices').value());
});

router.get('/:id', ids.validateDeviceId(), (req, res) => {
  responses.rest(res, db.get('devices').find({ id: req.params.id }).value());
});

router.delete('/:id', ids.validateDeviceId(), (req, res) => {
  const { id } = req.params;
  const deps = db.get('rules').value().filter((rule) => rule.measuringDevice === id || rule.controlDevice === id);
  if (deps.length > 0) {
    responses.customError(res, 403, `Failed to delete device, because 
    it's used by the following rules: ${deps.map((rule) => rule.name).join(', ')}.`);
  } else {
    db.get('devices').remove({ id }).write();
    updateDeviceFrontend();
    responses.succeed(res);
  }
});

router.post('/:id/switch-state', ids.validateDeviceId(), bp.parseBody(), (req, res) => {
  const { id } = req.params;
  const { state } = req.data;
  if (typeof state === 'boolean') {
    const dbDevice = db.get('devices').find({ id });
    if (dbDevice.value().active !== state) {
      switchDevice(dbDevice.value().deviceId, state).then(() => {
        responses.succeed(res);
      }).catch((error) => {
        responses.customError(res, 500, error.message);
      });
    } else {
      responses.succeed(res);
    }
  } else {
    responses.badRequest(res);
  }
});

router.put('/', bp.parseBody(), (req, res) => {
  const { name, deviceId, isMeasuring } = req.data;
  console.log(req.data);
  if (typeof name !== 'string'
    || typeof deviceId !== 'string'
    || typeof isMeasuring !== 'boolean') {
    responses.badRequest(res);
  } else {
    let validation = validate({
      name,
      id: deviceId,
    }, rules.deviceConstraints, { fullMessages: false });
    if (validation) {
      responses.inputErrors(res, validation);
    } else {
      validation = {};
      if (db.get('devices').find({ deviceId }).value()) {
        validation.id = ['This ID is already associated with a device.'];
      }
      if (db.get('devices').find({ name }).value()) {
        validation.name = ['This name is already in use.'];
      }
      if (Object.values(validation).length > 0) {
        responses.inputErrors(res, validation);
      } else {
        ewelinkApi.getDevice(deviceId).then((result) => {
          if (result.error) {
            responses.customError(res, 500, result.msg);
          } else {
            const state = result.params.switch === 'on';
            const newDevice = {
              id: nanoid.nanoid(),
              deviceId,
              name,
              measuring: isMeasuring,
              initialized: false,
              active: state,
            };
            const tmp = parseFloat(result.params.currentTemperature);
            const { min, max } = db.get('temperatureLimits').value();
            if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
              newDevice.temperature = tmp;
              newDevice.initialized = true;
            }
            db.get('devices').push(newDevice).write();
            const date = (new Date()).toJSON();
            stat.get('devices')
              .push({
                id: newDevice.id,
                temperatures: newDevice.initialized
                  ? [{ date, temperature: tmp }] : [],
                states: [{ date, active: state }],
              }).write();

            updateDeviceFrontend();
            responses.succeed(res);
          }
        }).catch((error) => {
          responses.customError(res, 500, error.message);
        });
      }
    }
  }
});

router.post('/', bp.parseBody(), (req, res) => {
  const {
    id, name, deviceId, isMeasuring,
  } = req.data;
  if (typeof id !== 'string' || typeof name !== 'string'
    || typeof deviceId !== 'string' || typeof isMeasuring !== 'boolean') {
    responses.badRequest(res);
  } else {
    const device = db.get('devices').find({ id }).value();
    if (!device) {
      responses.notFound(res);
    } else {
      let validation = validate({
        name,
        id: deviceId,
      }, rules.deviceConstraints, { fullMessages: false });
      if (validation) {
        responses.inputErrors(res, validation);
      } else {
        validation = {};
        const otherDevices = db.get('devices').value().filter((item) => item.id !== id);
        if (otherDevices.find((item) => item.deviceId === deviceId)) {
          validation.id = ['This ID is already associated with a device.'];
        }
        if (otherDevices.find((item) => item.name === name)) {
          validation.id = ['This name is already in use.'];
        }
        if (Object.values(validation).length > 0) {
          responses.inputErrors(res, validation);
        } else {
          const newDevice = {
            id,
            deviceId,
            name,
            measuring: isMeasuring,
            initialized: device.initialized,
            active: device.active,
          };
          if (device.deviceId !== deviceId) {
            ewelinkApi.getDevice(deviceId).then((result) => {
              if (result.error) {
                responses.customError(res, 500, result.msg);
              } else {
                const state = result.params.switch === 'on';
                newDevice.active = state;
                const tmp = parseFloat(result.params.currentTemperature);
                const { min, max } = db.get('temperatureLimits').value();
                if (!Number.isNaN(tmp) && tmp >= min && tmp <= max) {
                  newDevice.temperature = tmp;
                  newDevice.initialized = true;
                } else {
                  newDevice.initialized = false;
                }
                db.get('devices').find({ id }).assign(newDevice).write();
                const statDevice = stat.get('devices').find({ id });
                const date = (new Date()).toJSON();
                statDevice.get('states').push({ date, active: state }).write();
                if (newDevice.initialized) {
                  statDevice.get('temperatures').push({ date, temperature: tmp }).write();
                }
                updateDeviceFrontend();
                responses.succeed(res);
              }
            }).catch((error) => {
              responses.customError(res, 500, error.message);
            });
          } else {
            db.get('devices').find({ id }).assign(newDevice).write();
            updateDeviceFrontend();
            responses.succeed(res);
          }
        }
      }
    }
  }
});

module.exports = router;
