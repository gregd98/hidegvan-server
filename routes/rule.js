const express = require('express'),
  validate = require('validate.js'),
  nanoid = require('nanoid'),
  db = require('../db/db'),
  rules = require('../constraints/ruleConstraints'),
  responses = require('../utils/responses'),
  bp = require('../middleware/bodyParser'),
  time = require('../utils/time'),
  so = require('../utils/socketing');

const router = express.Router({ mergeParams: true });

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

const updateRuleFrontend = () => {
  so.getIo().to('frontend').emit('rule update', getRules());
};

validate.validators.selector = (value) => (value ? undefined : 'This field is required.');

router.get('/', (req, res) => {
  responses.rest(res, getRules());
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  if (id.trim().length > 0) {
    const rule = db.get('rules').find({ id }).value();
    (rule ? () => responses.rest(res, rule) : () => responses.notFound(res))();
  } else {
    responses.badRequest(res);
  }
});

router.put('/', bp.parseBody(), (req, res) => {
  console.log(req.data);
  const {
    name, startTime, endTime, minTemp, maxTemp, measuringDevice, controlDevice,
  } = req.data;
  req.data.id = 'kecske';
  if (typeof name !== 'string' || typeof startTime !== 'string' || typeof endTime !== 'string'
    || typeof minTemp !== 'number' || typeof maxTemp !== 'number'
    || typeof measuringDevice !== 'string' || typeof controlDevice !== 'string') {
    responses.badRequest(res);
  } else {
    let validation = validate(req.data, rules.ruleConstraints, { fullMessages: false });
    if (validation) {
      responses.inputErrors(res, validation);
    } else {
      validation = {};
      if (db.get('rules').find({ name }).value()) {
        validation.name = ['This name is already in use.'];
      }
      if (startTime === endTime) {
        validation.endTime = ['Start time and end time must be different.'];
      }
      if (maxTemp < minTemp) {
        validation.maxTemp = ['Maximum temperature must be greater than or equal to minimum temperature.'];
      }
      const md = db.get('devices').find({ id: measuringDevice }).value();
      const cd = db.get('devices').find({ id: controlDevice }).value();
      if (!md || !md.measuring) {
        validation.measuringDevice = ['Invalid device.'];
      }
      if (!cd) {
        validation.controlDevice = ['Invalid device.'];
      }
      if (Object.values(validation).length > 0) {
        responses.inputErrors(res, validation);
      } else {
        const st = time.getTimeByString(startTime);
        const et = time.getTimeByString(endTime);
        const conflict = db.get('rules').filter({ controlDevice }).value().find((rule) => time.isConflicted([rule.startTime, rule.endTime], [st, et]));
        if (conflict) {
          responses.customError(res, 403, `Conflict with rule: ${conflict.name} (${time.getString(conflict.startTime)} - ${time.getString(conflict.endTime)})`);
        } else {
          db.get('rules').push({
            id: nanoid.nanoid(),
            name,
            startTime: st,
            endTime: et,
            measuringDevice,
            controlDevice,
            minTemp: Math.round(minTemp * 10) / 10,
            maxTemp: Math.round(maxTemp * 10) / 10,
            enabled: true,
            activated: false,
          }).write();
          updateRuleFrontend();
          responses.succeed(res);
        }
      }
    }
  }
});

router.post('/', bp.parseBody(), (req, res) => {
  const {
    id, name, startTime, endTime, minTemp, maxTemp, measuringDevice, controlDevice,
  } = req.data;
  if (typeof id !== 'string' || typeof name !== 'string'
    || typeof startTime !== 'string' || typeof endTime !== 'string'
    || typeof minTemp !== 'number' || typeof maxTemp !== 'number'
    || typeof measuringDevice !== 'string' || typeof controlDevice !== 'string') {
    responses.badRequest(res);
  } else {
    const rule = db.get('rules').find({ id }).value();
    if (!rule) {
      responses.notFound(res);
    } else {
      let validation = validate(req.data, rules.ruleConstraints, { fullMessages: false });
      if (validation) {
        responses.inputErrors(res, validation);
      } else {
        validation = {};
        const otherRules = db.get('rules').value().filter((item) => item.id !== id);
        if (otherRules.find((item) => item.name === name)) {
          validation.name = ['This name is already in use.'];
        }
        if (startTime === endTime) {
          validation.endTime = ['Start time and end time must be different.'];
        }
        if (maxTemp < minTemp) {
          validation.maxTemp = ['Maximum temperature must be greater than or equal to minimum temperature.'];
        }
        const md = db.get('devices').find({ id: measuringDevice }).value();
        const cd = db.get('devices').find({ id: controlDevice }).value();
        if (!md || !md.measuring) {
          validation.measuringDevice = ['Invalid device.'];
        }
        if (!cd) {
          validation.controlDevice = ['Invalid device.'];
        }
        if (Object.values(validation).length > 0) {
          responses.inputErrors(res, validation);
        } else {
          const st = time.getTimeByString(startTime);
          const et = time.getTimeByString(endTime);
          const conflict = otherRules.filter((item) => item.controlDevice === controlDevice)
            .find((item) => time.isConflicted([item.startTime, item.endTime], [st, et]));
          if (conflict) {
            responses.customError(res, 403, `Conflict with rule: ${conflict.name} (${time.getString(conflict.startTime)} - ${time.getString(conflict.endTime)})`);
          } else {
            db.get('rules').find({ id }).assign({
              id,
              name,
              startTime: st,
              endTime: et,
              measuringDevice,
              controlDevice,
              minTemp: Math.round(minTemp * 10) / 10,
              maxTemp: Math.round(maxTemp * 10) / 10,
              enabled: rule.enabled,
              activated: false,
            }).write();
            updateRuleFrontend();
            responses.succeed(res);
          }
        }
      }
    }
  }
});

module.exports = router;
