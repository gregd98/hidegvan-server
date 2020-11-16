const express = require('express'),
  validate = require('validate.js'),
  nanoid = require('nanoid'),
  db = require('../db/db'),
  stat = require('../db/statistics'),
  bp = require('../middleware/bodyParser'),
  responses = require('../utils/responses'),
  rules = require('../constraints/deviceConstraints'),
  ewelinkApi = require('../ewelink/ewelinkAdapter'),
  so = require('../utils/socketing');

const router = express.Router({ mergeParams: true });

const updateDeviceFrontend = () => {
  so.getIo().to('frontend').emit('device update', db.get('devices').value());
};

router.get('/', (req, res) => {
  responses.rest(res, db.get('devices').value());
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  if (id.trim().length > 0) {
    const device = db.get('devices').find({ id }).value();
    (device ? () => responses.rest(res, device) : () => responses.notFound(res))();
  } else {
    responses.badRequest(res);
  }
});

router.put('/', bp.parseBody(), (req, res) => {
  const { name, deviceId, isMeasuring } = req.data;
  console.log(req.data);
  if (!name || typeof name !== 'string'
    || !deviceId || typeof deviceId !== 'string'
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
  if (!id || typeof id !== 'string'
    || !name || typeof name !== 'string'
    || !deviceId || typeof deviceId !== 'string'
    || typeof isMeasuring !== 'boolean') {
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
                }
                db.get('devices').find({ id }).assign(newDevice).write();
                const statDevice = stat.get('devices').find({ id });
                const date = (new Date()).toJSON();
                statDevice.get('states').push({ date, active: state });
                if (newDevice.initialized) {
                  statDevice.get('temperatures').push({ date, temperature: tmp });
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
