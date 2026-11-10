const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  employeeId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  phone: String, department: String, designation: String, joiningDate: Date,
  role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
  active: { type: Boolean, default: true },
  leaveAllowance: { annual: { type: Number, default: Number(process.env.ANNUAL_LEAVE_DAYS || 24) }, sick: { type: Number, default: 8 }, casual: { type: Number, default: 10 } },
  avatar: String,
  
  address: { type: String, default: '' },

  mustChangePassword: {
    type: Boolean,
    default: false
  },
  
  tokenVersion: {
    type: Number,
    default: 0
  },
  
  notificationPreferences: {
    attendanceReminder: { type: Boolean, default: true },
    leaveUpdates: { type: Boolean, default: true },
    announcements: { type: Boolean, default: true }
  }
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);

