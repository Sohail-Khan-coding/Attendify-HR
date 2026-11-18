const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const filter = {};
    if (req.query.action) filter.action = String(req.query.action).slice(0, 80);
    if (req.query.entityType) filter.entityType = String(req.query.entityType).slice(0, 60);
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) filter.createdAt.$lte = new Date(req.query.to);
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    const [events, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter)
    ]);
    res.json({ events, total, page, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

module.exports = router;
