const moment = require('moment');

const isValidTime = (time) => Number.isInteger(time) && time >= 0 && time < 1440;
const pad = (num) => (num < 10 ? `0${num}` : num);
const getLength = ([t1, t2]) => (t1 <= t2 ? t2 - t1 : 1440 - t2 + t1);
const isOn = (n, [t1, t2]) => (t1 < t2 ? n >= t1 && n < t2 : n >= t1 || n < t2);
const getCurrentTime = () => {
  const m = moment();
  return m.hour() * 60 + m.minute();
};

exports.getCurrentTime = () => getCurrentTime();
exports.isConflicted = (i1, i2) => (getLength(i1) <= getLength(i2)
  ? isOn(i1[0], i2) || isOn(i1[1], i2) : isOn(i2[0], i1) || isOn(i2[1], i1));
exports.checkInterval = (i) => {
  if (isValidTime(i[0]) && isValidTime(i[1])) {
    return isOn(getCurrentTime(), i);
  }
  throw new Error('StartTime or EndTime is invalid.');
};
exports.getString = (t) => `${pad(Math.trunc(t / 60))}:${pad(t % 60)}`;
exports.getTimeByString = (s) => {
  const tmp = s.split(':');
  return parseInt(tmp[0], 10) * 60 + parseInt(tmp[1], 10);
};
