const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = process.env.CRONOCODEX_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

module.exports = {
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-secret',
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || 'admin@cronocodex.local',
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!',
  DB_PATH: path.join(DATA_DIR, process.env.DB_FILENAME || 'cronocodex.sqlite'),
};
