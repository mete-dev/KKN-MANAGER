// Vercel serverless entrypoint - uses pre-built CJS bundle
// This file is a plain .js stub so Vercel doesn't try to compile TypeScript
const { default: app } = require('../dist/server.cjs');
module.exports = app;
