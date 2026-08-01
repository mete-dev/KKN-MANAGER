// Vercel serverless entrypoint - server.cjs is copied here during build
const mod = require('./server.cjs');
module.exports = mod.default || mod;
