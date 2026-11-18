
const router = require('express').Router();
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { writeAudit } = require('../utils/audit');
const { isLocked, recordFailure, clearAttempts } = require('../utils/loginThrottle');
const { authenticator, encryptSecret, decryptSecret, verifyCode } = require('../utils/mfa');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

function sessionUser(user) {
  return {
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
    adminMfaEnabled: user.adminMfaEnabled,
    notificationPreferences: user.notificationPreferences,
    leaveAllowance: user.leaveAllowance
  };
}

function createSession(user) {
  const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: '12h'
  });
  return { token, user: sessionUser(user) };
}

// Login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email.length > 254 || password.length > 1024) {
      return res.status(400).json({ message: 'Email or password is too long.' });
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (await isLocked(email, ip)) {
      return res.status(429).json({ message: 'Too many sign-in attempts. Try again in 15 minutes.' });
    }

    const user = await User.findOne({
      email,
      active: true
    }).select('+password +adminMfaSecret');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      await recordFailure(email, ip);
      return res.status(401).json({
        message: 'Email or password is incorrect.'
      });
    }

    await clearAttempts(email, ip);
    if (user.role === 'admin' && user.adminMfaEnabled) {
      const challengeToken = jwt.sign({ id: user._id, purpose: 'admin-mfa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.json({ mfaRequired: true, challengeToken });
    }

    await writeAudit({ req, action: 'auth.login', entityType: 'user', entityId: user._id, summary: 'User signed in.' }).catch(error => console.error('Audit write failed:', error.message));
    res.json(createSession(user));

  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Login failed.' });
  }
});

router.post('/login/verify-mfa', async (req, res) => {
  try {
    const decoded = jwt.verify(String(req.body.challengeToken || ''), process.env.JWT_SECRET);
    if (decoded.purpose !== 'admin-mfa') return res.status(401).json({ message: 'Invalid sign-in challenge.' });
    const user = await User.findById(decoded.id).select('+adminMfaSecret +adminMfaRecoveryCodes');
    if (!user || !user.active || user.role !== 'admin' || !user.adminMfaEnabled || !user.adminMfaSecret) {
      return res.status(401).json({ message: 'Invalid sign-in challenge.' });
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (await isLocked(user.email, ip)) return res.status(429).json({ message: 'Too many verification attempts. Try again in 15 minutes.' });
    const submittedCode = String(req.body.code || '').replace(/\s/g, '').toUpperCase();
    let usedRecoveryCode = false;
    if (!await verifyCode(decryptSecret(user.adminMfaSecret), submittedCode)) {
      const codeHash = crypto.createHash('sha256').update(submittedCode).digest('hex');
      const recoveryCodes = user.adminMfaRecoveryCodes || [];
      const recoveryIndex = recoveryCodes.indexOf(codeHash);
      if (recoveryIndex < 0) {
        await recordFailure(user.email, ip);
        return res.status(401).json({ message: 'Authenticator or recovery code is incorrect.' });
      }
      recoveryCodes.splice(recoveryIndex, 1);
      user.adminMfaRecoveryCodes = recoveryCodes;
      await user.save();
      usedRecoveryCode = true;
    }

    if (usedRecoveryCode) {
      await writeAudit({ req, action: 'auth.mfa_recovery_used', entityType: 'user', entityId: user._id, summary: 'Administrator used a one-time MFA recovery code.' });
    }

    await clearAttempts(user.email, ip);
    await writeAudit({ req, action: 'auth.mfa_login', entityType: 'user', entityId: user._id, summary: 'Administrator completed two-factor sign-in.' }).catch(error => console.error('Audit write failed:', error.message));
    res.json(createSession(user));
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Sign-in challenge expired. Please sign in again.' });
    }
    console.error('MFA sign-in failed:', error.message);
    res.status(500).json({ message: 'Two-factor verification failed.' });
  }
});

router.post('/admin/mfa/setup', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
    const user = await User.findById(req.user._id).select('+password +adminMfaSecret +pendingAdminMfaSecret');
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    if (user.adminMfaEnabled && (!user.adminMfaSecret || !await verifyCode(decryptSecret(user.adminMfaSecret), req.body.code))) {
      return res.status(401).json({ message: 'Enter a valid authenticator code before changing MFA setup.' });
    }

    const secret = authenticator.generateSecret();
    user.pendingAdminMfaSecret = encryptSecret(secret);
    await user.save();
    res.json({ secret, otpauthUrl: await authenticator.keyuri(user.email, 'Attendify HR', secret) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Could not start two-factor setup.' });
  }
});

router.post('/admin/mfa/enable', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
    const user = await User.findById(req.user._id).select('+adminMfaSecret +pendingAdminMfaSecret +adminMfaRecoveryCodes');
    if (!user?.pendingAdminMfaSecret || !await verifyCode(decryptSecret(user.pendingAdminMfaSecret), req.body.code)) {
      return res.status(400).json({ message: 'Authenticator code is invalid. Setup has not been enabled.' });
    }
    user.adminMfaSecret = user.pendingAdminMfaSecret;
    user.pendingAdminMfaSecret = undefined;
    user.adminMfaEnabled = true;
    const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
    user.adminMfaRecoveryCodes = recoveryCodes.map(code => crypto.createHash('sha256').update(code).digest('hex'));
    await user.save();
    await writeAudit({ req, action: 'auth.mfa_enabled', entityType: 'user', entityId: user._id, summary: 'Administrator enabled two-factor authentication.' }).catch(error => console.error('Audit write failed:', error.message));
    res.json({ message: 'Two-factor authentication enabled. Save these recovery codes securely; they are shown only once.', user: sessionUser(user), recoveryCodes });
  } catch (error) { res.status(500).json({ message: error.message || 'Could not enable two-factor authentication.' }); }
});

router.post('/admin/mfa/disable', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
    const user = await User.findById(req.user._id).select('+password +adminMfaSecret +pendingAdminMfaSecret');
    const validPassword = user && await bcrypt.compare(String(req.body.password || ''), user.password);
    const validCode = user?.adminMfaSecret && await verifyCode(decryptSecret(user.adminMfaSecret), req.body.code);
    if (!validPassword || !validCode) return res.status(401).json({ message: 'Password or authenticator code is incorrect.' });
    user.adminMfaEnabled = false;
    user.adminMfaSecret = undefined;
    user.pendingAdminMfaSecret = undefined;
    user.adminMfaRecoveryCodes = [];
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await writeAudit({ req, action: 'auth.mfa_disabled', entityType: 'user', entityId: user._id, summary: 'Administrator disabled two-factor authentication.' }).catch(error => console.error('Audit write failed:', error.message));
    res.json({ message: 'Two-factor authentication disabled.', ...createSession(user) });
  } catch (error) { res.status(500).json({ message: error.message || 'Could not disable two-factor authentication.' }); }
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
      adminMfaEnabled: req.user.adminMfaEnabled,
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
    await writeAudit({ req, action: 'profile.updated', entityType: 'user', entityId: req.user._id, summary: 'Employee updated their contact profile.' }).catch(error => console.error('Audit write failed:', error.message));

    res.json({ message: 'Profile updated successfully.', user: sessionUser(req.user) });

  } catch (e) {
    res.status(500).json({ message: 'Profile update failed.' });
  }
});

// Update notification preferences
router.patch('/notifications', protect, async (req, res) => {
  try {
    const preferences = req.user.notificationPreferences || {};

    ['attendanceReminder', 'leaveUpdates', 'announcements', 'push', 'sound'].forEach(key => {
      if (typeof req.body[key] === 'boolean') {
        preferences[key] = req.body[key];
      }
    });

    req.user.notificationPreferences = preferences;
    await req.user.save();

    res.json({ message: 'Notification settings saved.', notificationPreferences: req.user.notificationPreferences });

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

    if (!newPassword || newPassword.length < 12
      || !/[a-z]/.test(newPassword)
      || !/[A-Z]/.test(newPassword)
      || !/[0-9]/.test(newPassword)
      || !/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: 'Use at least 12 characters with uppercase, lowercase, a number, and a symbol.'
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
    await writeAudit({ req, action: 'auth.password_changed', entityType: 'user', entityId: user._id, summary: 'User changed their password.' }).catch(error => console.error('Audit write failed:', error.message));

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
