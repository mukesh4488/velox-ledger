const crypto = require('crypto');
const User = require('../models/User');
const Customer = require('../models/Customer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendPasswordResetEmail } = require('../utils/mailer');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const login = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const password = String(req.body.password || '');
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'Please provide email/phone and password' });

    const user = await User.findOne({ $or: [{ email: identifier.toLowerCase() }, { phone: identifier }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (user.role === 'CUSTOMER') {
      const customer = await Customer.findById(user.customerId);
      if (!customer || !customer.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    res.json({ success: true, data: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, customerId: user.customerId, token: generateToken(user._id) } });
  } catch (error) { next(error); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    if (!identifier) return res.status(400).json({ success: false, message: 'Email is required.' });
    const user = await User.findOne({ email: identifier });
    // Do not reveal whether the account exists.
    if (user && user.email) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail(user, resetUrl);
    }
    res.json({ success: true, message: 'If an account exists for that email, a password reset link has been sent.' });
  } catch (error) { next(error); }
};

const resetPassword = async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token || password.length < 8) return res.status(400).json({ success: false, message: 'A valid token and password of at least 8 characters are required.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: { $gt: new Date() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link is invalid or expired.' });
    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) { next(error); }
};

module.exports = { login, forgotPassword, resetPassword };
