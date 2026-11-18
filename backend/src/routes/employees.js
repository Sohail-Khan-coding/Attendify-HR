
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { notifyUser } = require('../utils/notifications');

router.use(protect, adminOnly);

// GET: All employees
router.get('/', async (req, res) => {
  try {
    const rows = await User.find({ role: 'employee' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST: Add new employee
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      employeeId,
      phone,
      department,
      designation,
      joiningDate,
      leaveAllowance
    } = req.body;

    if (!String(name || '').trim() || !String(email || '').trim() || !String(employeeId || '').trim()) {
      return res.status(400).json({ message: 'Name, email, and employee ID are required.' });
    }
    if (!password || String(password).length < 12) {
      return res.status(400).json({ message: 'Set a temporary password with at least 12 characters.' });
    }
    const hash = await bcrypt.hash(password, 12);

    const row = await User.create({
      name,
      email: String(email).trim().toLowerCase(),
      password: hash,
      employeeId,
      phone,
      department,
      designation,
      joiningDate,
      leaveAllowance,
      mustChangePassword: true
    });

    await writeAudit({ req, action: 'employee.created', entityType: 'user', entityId: row._id, summary: `Created employee account for ${row.name}.` }).catch(error => console.error('Audit write failed:', error.message));
    await notifyUser(row._id, { title: 'Your Attendify account is ready', message: 'An HR administrator created your account. Sign in and change your temporary password.', category: 'system', link: '/' }).catch(error => console.error('Notification delivery failed:', error.message));

    res.status(201).json({
      id: row._id,
      name: row.name,
      email: row.email
    });

  } catch (e) {
    res.status(400).json({
      message: e.code === 11000
        ? 'Email or employee ID already exists.'
        : e.message
    });
  }
});

// PATCH: Admin can edit employee profile
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'name',
      'email',
      'phone',
      'department',
      'designation',
      'joiningDate',
      'active',
      'leaveAllowance',
      'employeeId',
      'address'
    ];

    const update = {};

    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        update[key] = req.body[key];
      }
    });

    // Normalize email
    if (update.email !== undefined) {
      update.email = String(update.email).trim().toLowerCase();

      if (!update.email) {
        return res.status(400).json({
          message: 'Email address is required.'
        });
      }
    }

    if (update.name !== undefined) {
      update.name = String(update.name).trim();

      if (!update.name) {
        return res.status(400).json({
          message: 'Employee name is required.'
        });
      }
    }

    if (update.employeeId !== undefined) {
      update.employeeId = String(update.employeeId).trim();
    }

    if (update.phone !== undefined) {
      update.phone = String(update.phone).trim();
    }

    const previous = await User.findOne({ _id: req.params.id, role: 'employee' }).select('-password');
    const row = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: 'employee'
      },
      { $set: update },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    if (!row) {
      return res.status(404).json({
        message: 'Employee not found.'
      });
    }

    if (previous && previous.active !== row.active) {
      row.tokenVersion = (row.tokenVersion || 0) + 1;
      await row.save();
    }

    await writeAudit({ req, action: 'employee.updated', entityType: 'user', entityId: row._id, summary: `Updated employee profile for ${row.name}.`, changes: { before: previous ? { name: previous.name, email: previous.email, department: previous.department, active: previous.active } : null, after: { name: row.name, email: row.email, department: row.department, active: row.active } } }).catch(error => console.error('Audit write failed:', error.message));

    res.json({
      message: 'Employee profile updated successfully.',
      employee: row
    });

  } catch (e) {
    res.status(400).json({
      message: e.code === 11000
        ? 'This email or employee ID is already being used by another employee.'
        : e.message
    });
  }
});

// DELETE: Deactivate employee
router.delete('/:id', async (req, res) => {
  try {
    const row = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: 'employee'
      },
      { active: false },
      { new: true }
    );

    if (!row) {
      return res.status(404).json({
        message: 'Employee not found.'
      });
    }

    row.tokenVersion = (row.tokenVersion || 0) + 1;
    await row.save();
    await writeAudit({ req, action: 'employee.deactivated', entityType: 'user', entityId: row._id, summary: `Deactivated employee account for ${row.name}.` }).catch(error => console.error('Audit write failed:', error.message));

    res.json({ message: 'Employee deactivated.' });

  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
