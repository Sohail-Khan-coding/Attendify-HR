const crypto = require('node:crypto');
const LoginAttempt = require('../models/LoginAttempt');

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function hashedKey(value) {
  return crypto.createHash('sha256').update(String(value).toLowerCase()).digest('hex');
}

function keysFor(email, ip) {
  return [hashedKey(`email:${email}`), hashedKey(`ip:${ip}`)];
}

async function isLocked(email, ip) {
  const rows = await LoginAttempt.find({ key: { $in: keysFor(email, ip) } }).select('lockedUntil');
  const now = Date.now();
  return rows.some(row => row.lockedUntil && row.lockedUntil.getTime() > now);
}

async function recordFailure(email, ip) {
  const now = new Date();
  const keys = keysFor(email, ip);
  await Promise.all(keys.map(async key => {
    let row = await LoginAttempt.findOne({ key });
    if (!row) {
      try {
        row = await LoginAttempt.create({ key, attempts: 1, windowStartedAt: now });
        return;
      } catch (error) {
        if (error.code !== 11000) throw error;
        row = await LoginAttempt.findOne({ key });
      }
    }

    if (!row) return;
    if (now.getTime() - row.windowStartedAt.getTime() >= WINDOW_MS) {
      row.attempts = 0;
      row.windowStartedAt = now;
      row.lockedUntil = null;
    }
    row.attempts += 1;
    if (row.attempts >= MAX_ATTEMPTS) row.lockedUntil = new Date(now.getTime() + LOCK_MS);
    await row.save();
  }));
}

async function clearAttempts(email, ip) {
  await LoginAttempt.deleteMany({ key: { $in: keysFor(email, ip) } });
}

module.exports = { isLocked, recordFailure, clearAttempts, LOCK_MS };
