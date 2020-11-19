const required = { allowEmpty: false, message: 'This field is required.' };
const time = {
  presence: required,
  format: {
    pattern: '([0-1]?[0-9]|2[0-3]):[0-5][0-9]',
    message: 'Enter a valid time',
  },
};
const device = {
  presence: required,
  selector: true,
};

// eslint-disable-next-line import/prefer-default-export
exports.ruleConstraints = {
  name: {
    presence: required,
    length: {
      minimum: 3,
      maximum: 16,
      tooShort: 'The name must be between 3 and 16 characters.',
      tooLong: 'The name must be between 3 and 16 characters.',
    },
    format: {
      pattern: '\\p{L}+',
      flags: 'u',
      message: 'The name must only contain alphabetical characters.',
    },
  },
  startTime: time,
  endTime: time,
  minTemp: {
    presence: required,
    numericality: {
      message: 'Enter a valid number.',
    },
  },
  maxTemp: {
    presence: required,
    numericality: {
      message: 'Enter a valid number.',
    },
  },
  measuringDevice: device,
  controlDevice: device,
};
