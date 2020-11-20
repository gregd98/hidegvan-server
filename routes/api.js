const express = require('express'),
  cors = require('cors'),
  deviceRoutes = require('./devices'),
  ruleRoutes = require('./rules');

const reactDevCors = {
  origin: 'http://localhost:3000',
  credentials: true,
};

const router = express.Router({ mergeParams: true });
router.use(express.text());
router.use(cors(reactDevCors));

router.use('/devices', deviceRoutes);
router.use('/rules', ruleRoutes);

module.exports = router;
