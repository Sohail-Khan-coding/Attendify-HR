const router = require('express').Router();
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Leave = require('../models/Leave');
const { protect, adminOnly } = require('../middleware/auth');
const { localDateKey, isWorkingDay } = require('../utils/dates');
const { getPhotoBucket, storeAttendancePhoto, deleteAttendancePhoto } = require('../utils/attendancePhotos');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
router.use(protect);
router.post('/check-in', upload.single('photo'), async (req, res) => {
  let photoId;
  try {
    if (!req.file) return res.status(400).json({ message: 'Attendance photo is required (JPG, PNG or WEBP).' });
    const latitude = Number(req.body.latitude), longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ message: 'Location permission is required to mark attendance.' });
    const dateKey = localDateKey();
    const exists = await Attendance.findOne({ employee: req.user._id, dateKey });
    if (exists) return res.status(409).json({ message: 'Attendance already marked today.' });
    const now = new Date(); const [officeHour, officeMinute] = (process.env.OFFICE_START_TIME || '09:30').split(':').map(Number); const grace = Number(process.env.LATE_GRACE_MINUTES || 30); const deadline = new Date(now); deadline.setHours(officeHour, officeMinute + grace, 0, 0); const late = now > deadline;
    photoId = await storeAttendancePhoto(req.file);
    const row = await Attendance.create({ employee: req.user._id, dateKey, checkIn: now, photo: photoId, location: { latitude, longitude, accuracy: Number(req.body.accuracy) || null }, status: late ? 'late' : 'present' });
    res.status(201).json(row);
  } catch (e) {
    if (photoId) await deleteAttendancePhoto(photoId).catch(() => {});
    console.error('Check-in error:', e);
    res.status(400).json({ message: e.code === 11000 ? 'Attendance already marked today.' : e.message });
  }
});

router.post('/check-out', upload.single('photo'), async (req, res) => {
  let photoId;
  try {
    const row = await Attendance.findOne({
      employee: req.user._id,
      dateKey: localDateKey()
    });

    if (!row) {
      return res.status(404).json({
        message: 'Please check in first.'
      });
    }

    if (row.checkOut) {
      return res.status(409).json({
        message: 'You have already checked out.'
      });
    }

    const now = new Date();

    // Office closing time
    const [officeHour, officeMinute] =
      (process.env.OFFICE_END_TIME || '18:00')
        .split(':')
        .map(Number);

    // Early checkout grace period
    const grace = Number(
      process.env.EARLY_CHECKOUT_GRACE_MINUTES || 15
    );

    const deadline = new Date(now);
    deadline.setHours(officeHour, officeMinute - grace, 0, 0);

    const closingTime = new Date(now);
    closingTime.setHours(officeHour, officeMinute, 0, 0);

    // Determine checkout status
    let checkOutStatus;

    if (now < deadline) {
      checkOutStatus = 'early';
    } else if (now <= closingTime) {
      checkOutStatus = 'on-time';
    } else {
      checkOutStatus = 'overtime';
    }

    row.checkOut = now;
    row.checkOutStatus = checkOutStatus;

    if (req.file) row.checkOutPhoto = photoId = await storeAttendancePhoto(req.file);

    if (req.body.latitude && req.body.longitude) {
      row.checkOutLocation = {
        latitude: Number(req.body.latitude),
        longitude: Number(req.body.longitude),
        accuracy: Number(req.body.accuracy) || null
      };
    }

    await row.save();

    res.json({
      message: 'Check-out successful.',
      checkOutStatus,
      attendance: row
    });

  } catch (e) {
    if (photoId) await deleteAttendancePhoto(photoId).catch(() => {});

    console.error('Check-out error:', e);

    res.status(400).json({
      message: e.message || 'Check-out failed.'
    });
  }
});

router.get('/photo/:filename', async (req, res, next) => {
  try {
    const photoId = req.params.filename;
    const record = await Attendance.findOne({
      $or: [{ photo: photoId }, { checkOutPhoto: photoId }]
    });
    if (!record) return res.status(404).json({ message: 'Photo not found.' });
    if (req.user.role !== 'admin' && String(record.employee) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed to view this photo.' });
    }

    // Continue serving legacy local uploads when they still exist on disk.
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads');
      const filePath = path.join(uploadRoot, path.basename(photoId));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Photo file is unavailable.' });
      }

      res.set('Cache-Control', 'private, no-store');
      return res.sendFile(filePath);
    }

    const bucket = getPhotoBucket();
    const file = await bucket.find({ _id: new mongoose.Types.ObjectId(photoId) }).next();
    if (!file) return res.status(404).json({ message: 'Photo file is unavailable.' });

    res.set('Content-Type', file.contentType || file.metadata?.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'private, no-store');
    const downloadStream = bucket.openDownloadStream(file._id);
    downloadStream.on('error', next);
    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
});
router.get('/mine', async (req, res) => { const rows = await Attendance.find({ employee: req.user._id }).sort({ dateKey: -1 }).limit(100); res.json(rows); });
router.get('/today', async (req, res) => { const row = await Attendance.findOne({ employee: req.user._id, dateKey: localDateKey() }); res.json(row); });
router.get('/admin/all', adminOnly, async (req, res) => {
  const filter = {}; if (req.query.date) filter.dateKey = req.query.date;
  if (req.query.employee) filter.employee = req.query.employee;
  const rows = await Attendance.find(filter).populate('employee', 'name employeeId department').sort({ dateKey: -1, checkIn: -1 }).limit(500); res.json(rows);
});
router.get('/admin/summary', adminOnly, async (req, res) => {
  const today = localDateKey(); 
  const start = new Date(`${today}T00:00:00`), end = new Date(`${today}T23:59:59`); 
  const workingDay = isWorkingDay(); 
  const [total, present, late, onLeave, employees] = await Promise.all([User.countDocuments({ role: 'employee', active: true }), 
    Attendance.countDocuments({ dateKey: today }), 
    Attendance.countDocuments({ dateKey: today, status: 'late' }), 
    Leave.countDocuments({ status: 'approved', startDate: { $lte: end }, endDate: { $gte: start } }), 
    User.find({ role: 'employee', active: true }).select('name department')]);
  const absent = workingDay ? Math.max(total - present - onLeave, 0) : 0; const weekday = new Date().getDay(); const weeklyHoliday = workingDay ? null : (weekday === 6 ? 'Saturday' : weekday === 0 ? 'Sunday' : 'Configured holiday'); res.json({ total, present, absent, late, onLeave, employees, isWorkingDay: workingDay, weeklyHoliday });
});

module.exports = router;
