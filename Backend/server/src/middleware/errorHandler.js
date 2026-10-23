const multer = require('multer');
const { HttpError } = require('../utils/httpError');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 1 MB' : err.message;
    return res.status(422).json({ error: message, fields: [{ field: err.field || 'file', message }] });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', key: err.keyValue });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFoundHandler, errorHandler };
