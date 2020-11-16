const express = require('express'),
  cors = require('cors'),
  db = require('../db/db'),
  responses = require('../utils/responses'),
  devicesRoutes = require('./devices');

const reactDevCors = {
  origin: 'http://localhost:3000',
  credentials: true,
};

const router = express.Router({ mergeParams: true });
router.use(express.text());
router.use(cors(reactDevCors));

router.get('/rules', (req, res) => {
  responses.rest(res, db.get('rules').value());
});

router.use('/devices', devicesRoutes);

module.exports = router;
