const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const env = (name, fallback) => (process.env[name] !== undefined && process.env[name] !== '' ? process.env[name] : fallback);

const PORT = Number(env('PORT', 4000));

module.exports = {
  PORT,
  MONGO_URI: env("MONGO_URI", "mongodb://127.0.0.1:27017/onboardiq"),
  JWT_SECRET: env("JWT_SECRET", "dev-only-secret"),
  JWT_EXPIRES_IN: env("JWT_EXPIRES_IN", "8h"),
  EXTRACTION_PROVIDER: env("EXTRACTION_PROVIDER", "mock"),
  EXTRACTION_TIMEOUT_MS: Number(env("EXTRACTION_TIMEOUT_MS", 10000)),
  SERVICE_KEY: env("SERVICE_KEY", "dev-service-key"),
  CORE_BANKING_URL: env(
    "CORE_BANKING_URL",
    `http://localhost:${PORT}/mock/core-banking`,
  ),
  STORAGE_DIR: path.resolve(
    __dirname,
    "..",
    env("STORAGE_DIR", "./storage/documents"),
  ),
  SEED_PASSWORD: env("SEED_PASSWORD", "Password@123"),
  EXPIRY_CRON: env("EXPIRY_CRON", "0 * * * *"),
  // Secret: only read from .env, never hard-coded here.
  GEMINI_API_KEY: env(
    "GEMINI_API_KEY",
    "",
  ),
  GEMINI_MODEL: env("GEMINI_MODEL", "gemini-3.5-flash"),
};
