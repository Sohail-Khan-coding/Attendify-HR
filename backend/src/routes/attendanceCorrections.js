const router = require('express').Router();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const { protect, adminOnly } = require('../middleware/auth');
const { localDateKey } = require('../utils/dates');
const { writeAudit } = require('../utils/audit');
const { notifyUser, notifyRoles } = require('../utils/notifications');

router.use(protect);

router.post('/', async (req, res, next) => {
  try {
    const dateKey = String(req.body.dateKey || '');
    const reason = String(req.body.reason || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !reason || reason.length > 1000) {
      return res.status(400).json({ message: 'Select a valid attendance date and enter a reason (up to 1000 characters).' });
    }

    const parseRequestedTime = value => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()) || localDateKey(date) !== dateKey) return undefined;
      return date;
    };
    const requestedCheckIn = parseRequestedTime(req.body.requestedCheckIn);
    const requestedCheckOut = parseRequestedTime(req.body.requestedCheckOut);
    if (requestedCheckIn === undefined || requestedCheckOut === undefined || (!requestedCheckIn && !requestedCheckOut)) {
      return res.status(400).json({ message: 'Enter at least one valid requested time on the selected date.' });
    }
    if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
      return res.status(400).json({ message: 'Requested check-out must be later than requested check-in.' });
    }

    const attendance = await Attendance.findOne({ employee: req.user._id, dateKey });
    if (!attendance) return res.status(404).json({ message: 'No attendance record exists for that date.' });
    const finalCheckIn = requestedCheckIn || attendance.checkIn;
    const finalCheckOut = requestedCheckOut || attendance.checkOut;
    if (finalCheckOut && finalCheckIn && finalCheckOut <= finalCheckIn) {
      return res.status(400).json({ message: 'Requested times would place check-out before check-in.' });
    }
    const existing = await AttendanceCorrection.findOne({ employee: req.user._id, dateKey, status: 'pending' });
    if (existing) return res.status(409).json({ message: 'A correction request for that date is already pending.' });

    const request = await AttendanceCorrection.create({
      employee: req.user._id,
      attendance: attendance._id,
      dateKey,
      requestedCheckIn,
      requestedCheckOut,
      reason
    });
    await writeAudit({ req, action: 'attendance.correction_requested', entityType: 'attendanceCorrection', entityId: request._id, summary: `Employee requested an attendance correction for ${dateKey}.` }).catch(error => console.error('Audit write failed:', error.message));
    await notifyRoles(['admin'], {
      title: 'Attendance correction requested',
      message: `${req.user.name} requested a correction for ${dateKey}.`,
      category: 'correction',
      link: '/corrections'
    }).catch(error => console.error('Notification delivery failed:', error.message));
    res.status(201).json(request);
  } catch (error) { next(error); }
});

router.get('/mine', async (req, res, next) => {
  try {
    const requests = await AttendanceCorrection.find({ employee: req.user._id })
      .sort({ createdAt: -1 }).limit(100).lean();
    res.json(requests);
  } catch (error) { next(error); }
});

router.get('/admin/all', adminOnly, async (req, res, next) => {
  try {
    const requests = await AttendanceCorrection.find()
      .populate('employee', 'name employeeId department')
      .sort({ createdAt: -1 }).limit(500).lean();
    res.json(requests);
  } catch (error) { next(error); }
});

router.patch('/admin/:id/review', adminOnly, async (req, res, next) => {
  let claimedRequestId;
  let attendanceToRollback;
  let attendanceBefore;
  let attendanceWasUpdated = false;
  try {
    const { status } = req.body;
    const adminRemark = String(req.body.adminRemark || '').trim().slice(0, 1000);
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Select approve or reject.' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Correction request not found.' });

    const request = await AttendanceCorrection.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'reviewing' } },
      { new: false }
    );
    if (!request) return res.status(409).json({ message: 'This request was already reviewed or does not exist.' });
    claimedRequestId = request._id;

    let appliedChanges = null;
    if (status === 'approved') {
      const attendance = await Attendance.findById(request.attendance);
      if (!attendance) {
        await AttendanceCorrection.updateOne({ _id: request._id, status: 'reviewing' }, { $set: { status: 'pending' } });
        claimedRequestId = null;
        return res.status(404).json({ message: 'Related attendance record no longer exists.' });
      }

      attendanceToRollback = attendance;
      attendanceBefore = {
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        checkOutStatus: attendance.checkOutStatus,
        status: attendance.status
      };
      const before = { checkIn: attendance.checkIn, checkOut: attendance.checkOut || null };
      if (request.requestedCheckIn) attendance.checkIn = request.requestedCheckIn;
      if (request.requestedCheckOut) attendance.checkOut = request.requestedCheckOut;
      if (attendance.checkOut && attendance.checkOut <= attendance.checkIn) {
        await AttendanceCorrection.updateOne({ _id: request._id, status: 'reviewing' }, { $set: { status: 'pending' } });
        claimedRequestId = null;
        return res.status(400).json({ message: 'The requested change would place check-out before check-in.' });
      }

      const [officeStartHour, officeStartMinute] = (process.env.OFFICE_START_TIME || '09:30').split(':').map(Number);
      const lateDeadline = new Date(attendance.checkIn);
      lateDeadline.setHours(officeStartHour, officeStartMinute + Number(process.env.LATE_GRACE_MINUTES || 30), 0, 0);
      attendance.status = attendance.checkIn > lateDeadline ? 'late' : 'present';

      if (attendance.checkOut) {
        const [officeEndHour, officeEndMinute] = (process.env.OFFICE_END_TIME || '18:00').split(':').map(Number);
        const earlyDeadline = new Date(attendance.checkOut);
        earlyDeadline.setHours(officeEndHour, officeEndMinute - Number(process.env.EARLY_CHECKOUT_GRACE_MINUTES || 15), 0, 0);
        const closeTime = new Date(attendance.checkOut);
        closeTime.setHours(officeEndHour, officeEndMinute, 0, 0);
        attendance.checkOutStatus = attendance.checkOut < earlyDeadline ? 'early'
          : attendance.checkOut <= closeTime ? 'on-time' : 'overtime';
      }
      await attendance.save();
      attendanceWasUpdated = true;
      appliedChanges = { before, after: { checkIn: attendance.checkIn, checkOut: attendance.checkOut || null } };
      await AttendanceCorrection.updateOne({ _id: request._id, status: 'reviewing' }, {
        $set: { status: 'approved', adminRemark, reviewedBy: req.user._id, reviewedAt: new Date(), appliedChanges }
      });
      await writeAudit({ req, action: 'attendance.correction_applied', entityType: 'attendance', entityId: attendance._id, summary: `Approved attendance correction for ${request.dateKey}.`, changes: appliedChanges }).catch(error => console.error('Audit write failed:', error.message));
    } else {
      await AttendanceCorrection.updateOne({ _id: request._id, status: 'reviewing' }, {
        $set: { status: 'rejected', adminRemark, reviewedBy: req.user._id, reviewedAt: new Date() }
      });
    }

    await writeAudit({ req, action: `attendance.correction_${status}`, entityType: 'attendanceCorrection', entityId: request._id, summary: `Attendance correction for ${request.dateKey} was ${status}.` }).catch(error => console.error('Audit write failed:', error.message));
    await notifyUser(request.employee, {
      title: `Attendance correction ${status}`,
      message: `Your correction request for ${request.dateKey} was ${status}.${adminRemark ? ` HR: ${adminRemark}` : ''}`,
      category: 'correction',
      link: '/corrections'
    }).catch(error => console.error('Notification delivery failed:', error.message));
    res.json({ message: `Correction ${status}.`, appliedChanges });
  } catch (error) {
    if (claimedRequestId) {
      const currentRequest = await AttendanceCorrection.findById(claimedRequestId).select('status').catch(() => null);
      if (currentRequest?.status === 'reviewing') {
        if (attendanceWasUpdated && attendanceToRollback && attendanceBefore) {
          attendanceToRollback.checkIn = attendanceBefore.checkIn;
          attendanceToRollback.checkOut = attendanceBefore.checkOut;
          attendanceToRollback.checkOutStatus = attendanceBefore.checkOutStatus;
          attendanceToRollback.status = attendanceBefore.status;
          await attendanceToRollback.save().catch(rollbackError => console.error('Attendance rollback failed:', rollbackError.message));
        }
        await AttendanceCorrection.updateOne({ _id: claimedRequestId, status: 'reviewing' }, { $set: { status: 'pending' } }).catch(() => {});
      }
    }
    next(error);
  }
});

module.exports = router;
