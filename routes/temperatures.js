const express = require('express'),
  db = require('../db/db'),
  stat = require('../db/statistics'),
  auth = require('../middleware/auth'),
  responses = require('../utils/responses');

const router = express.Router({ mergeParams: true });
// router.use(auth.authorize());

router.get('/', (req, res) => {
  const { lastTime, firstDate, lastDate } = req.query;
  const devices = stat.get('devices').value();
  const cd = (new Date()).getTime();
  const lastTimeInt = parseInt(lastTime, 10);
  const firstDateInt = parseInt(firstDate, 10);
  const lastDateInt = parseInt(lastDate, 10);
  const checkDif = ([time]) => cd - time <= lastTimeInt;
  const checkInterval = ([time]) => time >= firstDateInt && time < lastDateInt + 86400000;
  const sendLastData = () => {
    const payload = devices.map((item) => ({
      id: item.id,
      name: db.get('devices').find({ id: item.id }).value().name,
      temperatures: item.temperatures.filter((instance) => checkDif(instance)),
      states: item.states.filter((instance) => checkDif(instance)),
    }));
    responses.rest(res, payload);
  };
  const sendIntervalData = () => {
    const payload = devices.map((item) => ({
      id: item.id,
      name: db.get('devices').find({ id: item.id }).value().name,
      temperatures: item.temperatures.filter((instance) => checkInterval(instance)),
      states: item.states.filter((instance) => checkInterval(instance)),
    }));
    responses.rest(res, payload);
  };
  if (!lastTime || Number.isNaN(lastTimeInt)) {
    if (!firstDate || Number.isNaN(firstDateInt)
      || !lastDate || Number.isNaN(lastDateInt) || firstDateInt > lastDateInt) {
      responses.badRequest(res);
    } else {
      sendIntervalData();
    }
  } else {
    sendLastData();
  }
});

module.exports = router;
