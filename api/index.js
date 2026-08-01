// Vercel serverless function entry point
import app from './server.cjs';

export default function handler(req, res) {
  const expressApp = app.default || app;
  return expressApp(req, res);
}
