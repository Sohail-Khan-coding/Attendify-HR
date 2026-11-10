
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        message: 'Please sign in first.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({
        message: 'Account unavailable.'
      });
    }

    // Check whether this session has been invalidated
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        message: 'Session expired. Please sign in again.'
      });
    }

    req.user = user;
    next();

  } catch (e) {
    return res.status(401).json({
      message: 'Invalid or expired session.'
    });
  }
};

exports.adminOnly = (req, res, next) => {
  req.user.role === 'admin'
    ? next()
    : res.status(403).json({
        message: 'Admin access required.'
      });
};
