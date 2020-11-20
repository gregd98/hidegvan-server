const responses = require('../utils/responses');

exports.parseBody = () => (req, res, next) => {
  try {
    const data = JSON.parse(req.body);
    if (typeof data === 'object' && data !== null) {
      req.data = data;
      next();
    } else {
      console.log(`Invalid request body: ${req.body}`);
      responses.badRequest(res);
    }
  } catch (error) {
    console.log(`Invalid request body: ${req.body}`);
    responses.badRequest(res);
  }
};

exports.sleep = (ms) => (req, res, next) => new Promise(() => setTimeout(next, ms));
