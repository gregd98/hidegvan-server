const required = { allowEmpty: false, message: 'This field is required.' };

exports.deviceConstraints = {
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
  id: {
    presence: required,
    length: {
      minimum: 3,
      maximum: 16,
      tooShort: 'The id must be between 3 and 16 characters.',
      tooLong: 'The id must be between 3 and 16 characters.',
    },
    format: {
      pattern: '[A-Za-z0-9]+',
      flags: 'u',
      message: 'The ID must only contain alphanumerical characters.',
    },
  },
};
