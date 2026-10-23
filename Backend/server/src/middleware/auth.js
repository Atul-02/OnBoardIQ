const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { JWT_SECRET, SERVICE_KEY } = require('../config');
const { unauthorized, forbidden } = require('../utils/httpError');

// Reads "Authorization: Bearer <token>" and loads the user into req.user.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('User no longer exists');
  req.user = user;
  next();
}

// Allows the request only if the user has at least one of the given roles (FR-1 -> HTTP 403).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw unauthorized();
    if (!req.user.roles.some((r) => roles.includes(r))) {
      throw forbidden(`This action needs one of the roles: ${roles.join(', ')}`);
    }
    next();
  };
}

function hasServiceKey(req) {
  const given = String(req.headers['x-service-key'] || '');
  const a = Buffer.from(given);
  const b = Buffer.from(SERVICE_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Only the backend itself (with the service key from .env) may call simulated services.
function requireServiceKey(req, res, next) {
  if (!hasServiceKey(req)) throw forbidden('Valid x-service-key header required');
  next();
}

// Either the service key, or a logged-in user with one of the roles.
function serviceKeyOrRole(...roles) {
  return async (req, res, next) => {
    if (hasServiceKey(req)) {
      req.isService = true;
      return next();
    }
    await authenticate(req, res, () => {});
    requireRole(...roles)(req, res, next);
  };
}

const hasRole = (user, role) => !!user && user.roles.includes(role);

// Short label used in the audit trail.
const roleLabel = (user) => (user ? user.roles.join('+') : 'SYSTEM');

module.exports = { authenticate, requireRole, requireServiceKey, serviceKeyOrRole, hasRole, roleLabel };
