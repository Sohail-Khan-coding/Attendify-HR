const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 500 },
  category: { type: String, enum: ['attendance', 'leave', 'correction', 'security', 'announcement', 'system'], default: 'system' },
  link: { type: String, default: '' },
  readAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
module.exports = mongoose.model('Notification', notificationSchema);
