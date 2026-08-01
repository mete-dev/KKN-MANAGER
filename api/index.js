// Vercel serverless function entry point
const mod = require('./server.cjs');
module.exports = mod.default || mod;
