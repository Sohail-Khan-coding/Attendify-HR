const mongoose = require('mongoose');
const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true },
  checkIn: { type: Date, required: true }, checkOut: Date,
  photo: { type: String, required: true },
  location: { latitude: Number, longitude: Number, accuracy: Number },
  checkOutPhoto: String,
  checkOutLocation: { latitude: Number, longitude: Number, accuracy: Number },
  status: { type: String, enum: ['present', 'late', 'incomplete'], default: 'present' },
  note: String,
  checkOutStatus: {
    type: String,
    enum: ['early', 'on-time', 'overtime'],
    default: null
  },
}, { timestamps: true });
attendanceSchema.index({ employee: 1, dateKey: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', attendanceSchema);
