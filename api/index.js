// Vercel serverless function entry point
const app = require('./server.cjs');

module.exports = (req, res) => {
  const handler = app.default || app;
  return handler(req, res);
};
