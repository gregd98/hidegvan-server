const express = require('express'),
  cors = require('cors'),
  validate = require('validate.js'),
  nanoid = require('nanoid'),
  deviceRoutes = require('./devices'),
  ruleRoutes = require('./rules'),
  bp = require('../middleware/bodyParser'),
  db = require('../db/db'),
  pwd = require('../utils/passwordUtils'),
  responses = require('../utils/responses'),
  rules = require('../constraints/signupConstraints'),
  auth = require('../middleware/auth');

const reactDevCors = {
  origin: 'http://localhost:3000',
  credentials: true,
};

const router = express.Router({ mergeParams: true });
router.use(express.text());
router.use(cors(reactDevCors));

router.put('/login', bp.parseBody(), (req, res) => {
  const { username, password } = req.data;
  if (typeof username !== 'string' || typeof password !== 'string') {
    responses.badRequest(res);
  } else {
    const user = db.get('users').find({ username }).value();
    if (user && pwd.checkPassword(user.password, password)) {
      db.get('sessions').remove({ sessionId: req.sessionID }).write();
      db.get('sessions').push({ created: (new Date()).toJSON(), userId: user.id, sessionId: req.sessionID }).write();
      responses.succeed(res);
    } else {
      res.status(401).json({ succeed: false, authenticated: true, message: 'Invalid username or password.' });
    }
  }
});

router.put('/signup', bp.parseBody(), (req, res) => {
  if (db.get('users').value().length > 0) {
    responses.customError(res, 403, 'Access denied.');
  } else {
    const { username, password, confirmPassword } = req.data;
    if (typeof username !== 'string' || typeof password !== 'string' || typeof confirmPassword !== 'string') {
      responses.badRequest(res);
    } else {
      let validation = validate(req.data, rules.signupConstraints, { fullMessages: false });
      if (validation) {
        responses.inputErrors(req, validation);
      } else {
        validation = {};
        if (db.get('users').find({ username }).value()) {
          validation.username = ['Username is taken.'];
        }
        if (pwd.calculatePasswordStrength(password) < 2) {
          validation.password = ['The password must contain at least two character categories among the following: uppercase characters, lowercase characters, digits, special characters.'];
        }
        if (password !== confirmPassword) {
          validation.password = ['Password doesn\'t match.'];
        }
        if (Object.values(validation).length > 0) {
          responses.inputErrors(res, validation);
        } else {
          db.get('users').push({
            id: nanoid.nanoid(),
            username,
            password: pwd.hashPassword(password),
          }).write();
          responses.succeed(res);
        }
      }
    }
  }
});

router.get('/logged-in', (req, res) => {
  const payload = {
    loggedIn: auth.checkSessionId(req.sessionID),
    haveUsers: db.get('users').value().length > 0,
  };
  console.log(`Send data: ${payload}`);
  responses.rest(res, payload);
});

router.use('/devices', deviceRoutes);
router.use('/rules', ruleRoutes);

module.exports = router;
