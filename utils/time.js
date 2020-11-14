const moment = require('moment');

const isValidTime = (time) => Number.isInteger(time) && time >= 0 && time < 1440;
const getCurrentTime = () => {
  const m = moment();
  return m.hour() * 60 + m.minute();
};

exports.checkInterval = (startTime, endTime) => {
  if (isValidTime(startTime) && isValidTime(endTime)) {
    const currentTime = getCurrentTime();
    return startTime < endTime ? currentTime >= startTime && currentTime <= endTime
      : currentTime >= startTime || currentTime <= endTime;
  }
  throw new Error('StartTime or EndTime is invalid.');
};
