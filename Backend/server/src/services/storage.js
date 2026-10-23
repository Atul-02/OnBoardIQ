const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STORAGE_DIR } = require('../config');

// Uploaded files are stored on disk (outside the database) under a random name,
// never executed, and only read back as text.

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function saveFile(buffer, applicationId) {
  const dir = path.join(STORAGE_DIR, applicationId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.txt`;
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, buffer);
  // store the path relative to STORAGE_DIR so the folder can be moved
  return path.relative(STORAGE_DIR, full);
}

function readText(storagePath) {
  return fs.readFileSync(path.join(STORAGE_DIR, storagePath), 'utf8');
}

// Strict UTF-8 check: throws on invalid byte sequences.
function isValidUtf8(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

module.exports = { sha256, saveFile, readText, isValidUtf8 };
