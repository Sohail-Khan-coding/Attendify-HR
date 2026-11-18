const crypto = require('node:crypto');
const { authenticator } = require('otplib');

function encryptionKey() {
  const value = process.env.MFA_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('MFA_ENCRYPTION_KEY must be configured as a 64-character hexadecimal key.');
  }
  return Buffer.from(value, 'hex');
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptSecret(value) {
  const [ivHex, tagHex, contentHex] = String(value || '').split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(contentHex, 'hex')), decipher.final()]).toString('utf8');
}

function verifyCode(secret, token) {
  return authenticator.verify({
    secret,
    token: String(token || '').replace(/\s/g, '')
  });
}

module.exports = { authenticator, encryptSecret, decryptSecret, verifyCode };
