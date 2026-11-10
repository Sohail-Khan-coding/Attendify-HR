
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      email: String(email || '').toLowerCase(),
      active: true
    }).select('+password');

    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).json({
        message: 'Email or password is incorrect.'
      });
    }

    const token = jwt.sign({
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0
    }, process.env.JWT_SECRET, {
      expiresIn: '12h'
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        designation: user.designation,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
        mustChangePassword: user.mustChangePassword,
        notificationPreferences: user.notificationPreferences,
        leaveAllowance: user.leaveAllowance
      }
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// Current logged-in user
router.get('/me', protect, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      employeeId: req.user.employeeId,
      department: req.user.department,
      designation: req.user.designation,
      phone: req.user.phone,
      address: req.user.address,
      avatar: req.user.avatar,
      mustChangePassword: req.user.mustChangePassword,
      notificationPreferences: req.user.notificationPreferences,
      leaveAllowance: req.user.leaveAllowance
    }
  });
});

// Update profile
router.patch('/profile', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Not allowed.' });
    }

    req.user.phone = req.body.phone || '';
    req.user.address = req.body.address || '';

    await req.user.save();

    res.json({ message: 'Profile updated successfully.' });

  } catch (e) {
    res.status(500).json({ message: 'Profile update failed.' });
  }
});

// Update notification preferences
router.patch('/notifications', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Not allowed.' });
    }

    const preferences = req.user.notificationPreferences || {};

    ['attendanceReminder', 'leaveUpdates', 'announcements'].forEach(key => {
      if (typeof req.body[key] === 'boolean') {
        preferences[key] = req.body[key];
      }
    });

    req.user.notificationPreferences = preferences;
    await req.user.save();

    res.json({ message: 'Notification settings saved.' });

  } catch (e) {
    res.status(500).json({ message: 'Settings update failed.' });
  }
});

// Change password
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    if (!user || !(await bcrypt.compare(currentPassword || '', user.password))) {
      return res.status(400).json({
        message: 'Current password is incorrect.'
      });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters.'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: 'New passwords do not match.'
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    const token = jwt.sign({
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion
    }, process.env.JWT_SECRET, {
      expiresIn: '12h'
    });

    res.json({
      message: 'Password changed successfully.',
      token
    });

  } catch (e) {
    res.status(500).json({ message: 'Password change failed.' });
  }
});

module.exports = router;
