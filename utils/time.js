const moment = require('moment');

const isValidTime = (time) => Number.isInteger(time) && time >= 0 && time < 1440;
const pad = (num) => (num < 10 ? `0${num}` : num);
const isOn = (n, [t1, t2]) => (t1 < t2 ? n >= t1 && n < t2 : n >= t1 || n < t2);

const getCurrentTime = () => {
  const m = moment();
  return m.hour() * 60 + m.minute();
};

exports.getCurrentTime = () => getCurrentTime();
exports.isConflicted = ([a1, a2], [b1, b2]) => (a1 >= a2 && b1 >= b2)
  || (a1 >= a2 && (b1 < a2 || a1 < b2)) || (b1 >= b2 && (b1 < a2
    || a1 < b2)) || (b1 < a2 && a1 < b2);

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
