// Vercel serverless CJS entrypoint - server.cjs is copied here during npm run build
// Using .cjs extension to force CommonJS and prevent Vercel TS compiler from overwriting this
const mod = require('./server.cjs');
module.exports = mod.default || mod;
