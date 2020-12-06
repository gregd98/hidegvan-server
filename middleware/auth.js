const db = require('../db/db');

const checkSessionId = (sessionId) => {
  const dbSession = db.get('sessions').find({ sessionId });
  if (dbSession.value()) {
    if ((new Date()).getTime() - (new Date(dbSession.value().created)) > db.get('appConfig').value().sessionMaxAge) {
      db.get('sessions').remove({ sessionId }).write();
      return false;
    }
    return db.get('users').find({ id: dbSession.value().userId });
  }
  return false;
};

exports.authorize = () => (req, res, next) => {
  if (checkSessionId(req.sessionID)) {
    req.session.userId = db.get('sessions').find({ sessionId: req.sessionID }).value().userId;
    next();
  } else {
    res.status(401).json({ succeed: false, authenticated: false, message: 'Invalid session ID.' });
  }
};

exports.checkSessionId = (sessionId) => checkSessionId(sessionId);

exports.sleep = (ms) => (req, res, next) => new Promise(() => setTimeout(next, ms));
