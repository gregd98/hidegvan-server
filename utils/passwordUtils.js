const crypto = require('crypto');

exports.calculatePasswordStrength = (value) => {
  let strength = 0;
  strength += value.match(/[\p{Ll}]+/u) ? 1 : 0;
  strength += value.match(/\p{Lu}/u) ? 1 : 0;
  strength += value.match(/[0-9]/) ? 1 : 0;
  strength += value.match(/[`~!@#$%^&*()\-_=+{}[\]\\|;:'",<.>/?]+/) ? 1 : 0;
  return strength;
};

exports.hashPassword = (password) => {
  const salt = crypto.randomBytes(64).toString('base64');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt, iterations };
};

exports.checkPassword = (fromDb, password) => fromDb.hash === crypto.pbkdf2Sync(password, fromDb.salt, fromDb.iterations, 64, 'sha512').toString('hex');
