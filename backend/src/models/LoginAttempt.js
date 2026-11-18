const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  attempts: { type: Number, default: 0 },
  windowStartedAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null }
}, { timestamps: true });

loginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
