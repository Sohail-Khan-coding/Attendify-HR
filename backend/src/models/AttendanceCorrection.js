const mongoose = require('mongoose');

const attendanceCorrectionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true },
  dateKey: { type: String, required: true, index: true },
  requestedCheckIn: { type: Date, default: null },
  requestedCheckOut: { type: Date, default: null },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'reviewing', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  adminRemark: { type: String, default: '', maxlength: 1000 },
  appliedChanges: { type: mongoose.Schema.Types.Mixed, default: undefined },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

attendanceCorrectionSchema.index({ employee: 1, dateKey: 1, status: 1 });
attendanceCorrectionSchema.index(
  { employee: 1, dateKey: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
module.exports = mongoose.model('AttendanceCorrection', attendanceCorrectionSchema);
