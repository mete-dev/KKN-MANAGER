// Vercel serverless entrypoint - uses pre-built CJS bundle
const mod = require('../dist/server.cjs');
module.exports = mod.default || mod;
