const required = { allowEmpty: false, message: 'This field is required.' };

// eslint-disable-next-line import/prefer-default-export
exports.signupConstraints = {
  username: {
    presence: required,
    length: {
      minimum: 4,
      maximum: 25,
      tooShort: 'The username must be between 4 and 32 characters.',
      tooLong: 'The username must be between 4 and 32 characters.',
    },
    format: {
      pattern: '[a-z|0-9|\\.|_]+',
      message: 'The usernames must only contain lowercase alphanumeric characters.',
    },
  },
  password: {
    presence: required,
    length: {
      minimum: 8,
      maximum: 128,
      tooShort: 'The password must be between 8 and 128 characters.',
      tooLong: 'The password must be between 8 and 128 characters.',
    },
  },
  confirmPassword: {
    presence: required,
  },
};
