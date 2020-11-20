const express = require('express'),
  validate = require('validate.js'),
  nanoid = require('nanoid'),
  db = require('../db/db'),
  ruleConstraints = require('../constraints/ruleConstraints'),
  responses = require('../utils/responses'),
  bp = require('../middleware/bodyParser'),
  ids = require('../middleware/idValidator'),
  time = require('../utils/time'),
  so = require('../utils/socketing'),
  rules = require('../logic/rules');

const router = express.Router({ mergeParams: true });

const updateRuleFrontend = () => {
  so.getIo().to('frontend').emit('rule update', rules.getRules());
};

validate.validators.selector = (value) => (value ? undefined : 'This field is required.');

router.get('/', (req, res) => {
  responses.rest(res, rules.getRules());
});

router.get('/:id', ids.validateRuleId(), (req, res) => {
  responses.rest(res, db.get('rules').find({ id: req.params.id }).value());
});

router.delete('/:id', ids.validateRuleId(), (req, res) => {
  const { id } = req.params;
  db.get('rules').remove({ id }).write();
  updateRuleFrontend();
  responses.succeed(res);
});

router.post('/:id/switch-state', ids.validateRuleId(), bp.parseBody(), (req, res) => {
  console.log('switch time');
  const { id } = req.params;
  const { state } = req.data;
  if (typeof state === 'boolean') {
    const dbRule = db.get('rules').find({ id });
    if (dbRule.value().enabled !== state) {
      const newState = { enabled: state };
      if (!state) {
        newState.activated = false;
        dbRule.assign(newState).write();
      } else {
        dbRule.assign(newState).write();
        rules.evaluateRule(dbRule.value());
      }
      updateRuleFrontend();
      responses.succeed(res);
    } else {
      responses.succeed(res);
    }
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
    let validation = validate(req.data, ruleConstraints.ruleConstraints, { fullMessages: false });
    if (validation) {
      responses.inputErrors(res, validation);
    } else {
      validation = {};
      if (db.get('rules').find({ name }).value()) {
        validation.name = ['This name is already in use.'];
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
      let validation = validate(req.data, ruleConstraints.ruleConstraints, { fullMessages: false });
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
