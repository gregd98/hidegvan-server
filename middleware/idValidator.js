const db = require('../db/db'),
  responses = require('../utils/responses');

const isValidId = (id, isDevice) => {
  const item = db.get(isDevice ? 'devices' : 'rules').find({ id }).value();
  return !!item;
};

exports.validateDeviceId = () => (req, res, next) => (isValidId(req.params.id, true)
  ? next : () => responses.notFound(res))();

exports.validateRuleId = () => (req, res, next) => (isValidId(req.params.id, false)
  ? next : () => responses.notFound(res))();
