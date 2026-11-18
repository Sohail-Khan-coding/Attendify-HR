const router = require('express').Router();
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

function dateRange(query) {
  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!Number.isFinite(days) || days > 366) return null;
  return { from, to };
}

router.get('/attendance', async (req, res, next) => {
  try {
    const range = dateRange(req.query);
    if (!range) return res.status(400).json({ message: 'Choose a valid date range no longer than 366 days.' });
    const filter = { dateKey: { $gte: range.from, $lte: range.to } };
    if (req.query.employee) filter.employee = req.query.employee;
    const records = await Attendance.find(filter)
      .populate('employee', 'name employeeId department')
      .sort({ dateKey: -1, checkIn: -1 }).limit(5000).lean();
    const summary = records.reduce((acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { total: 0, present: 0, late: 0, incomplete: 0 });
    res.json({ range, summary, records, truncated: records.length === 5000 });
  } catch (error) { next(error); }
});

router.get('/leaves', async (req, res, next) => {
  try {
    const range = dateRange(req.query);
    if (!range) return res.status(400).json({ message: 'Choose a valid date range no longer than 366 days.' });
    const records = await Leave.find({ startDate: { $lte: new Date(`${range.to}T23:59:59.999Z`) }, endDate: { $gte: new Date(`${range.from}T00:00:00.000Z`) } })
      .populate('employee', 'name employeeId department')
      .sort({ createdAt: -1 }).limit(5000).lean();
    const summary = records.reduce((acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0 });
    res.json({ range, summary, records, truncated: records.length === 5000 });
  } catch (error) { next(error); }
});

module.exports = router;
