const badRequest = (req, res) => {
  console.log(`Invalid request body: ${req.body}`);
  res.status(400).json({ succeed: false, message: 'Bad request.' });
};

exports.parseBody = () => (req, res, next) => {
  try {
    const data = JSON.parse(req.body);
    if (typeof data === 'object' && data !== null) {
      req.data = data;
      next();
    } else {
      badRequest(req, res);
    }
  } catch (error) {
    badRequest(req, res);
  }
};

exports.sleep = (ms) => (req, res, next) => new Promise(() => setTimeout(next, ms));
