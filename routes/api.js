const express = require('express'),
  cors = require('cors'),
  db = require('../db/db');

const reactDevCors = {
  origin: 'http://localhost:3000',
  credentials: true,
};

const router = express.Router({ mergeParams: true });
router.use(express.text());
router.use(cors(reactDevCors));

router.get('/devices', (req, res) => {
  res.status(200).json({ succeed: true, payload: db.get('devices').value() });
});

module.exports = router;
