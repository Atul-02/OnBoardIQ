const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../validators');
const { conflict, unauthorized } = require('../utils/httpError');
const { audit } = require('../services/audit');

const router = express.Router();

const signToken = (user) => jwt.sign({ sub: String(user._id), roles: user.roles }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Self-registration always creates an APPLICANT. Staff users are created by the seed script.
router.post('/register', validate(registerSchema), async (req, res) => {
  const { username, password, full_name } = req.valid;
  if (await User.exists({ username })) throw conflict('Username is already taken');
  const user = await User.create({ username, full_name, password_hash: await bcrypt.hash(password, 10), roles: ['APPLICANT'] });
  await audit({ action: 'USER_REGISTERED', user, details: { username } });
  res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { username, password } = req.valid;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw unauthorized('Wrong username or password');
  await audit({ action: 'USER_LOGIN', user });
  res.json({ token: signToken(user), user: user.toSafeJSON() });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
