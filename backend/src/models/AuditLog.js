const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, default: 'System' },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, default: '' },
  summary: { type: String, required: true },
  changes: { type: mongoose.Schema.Types.Mixed, default: undefined },
  requestId: { type: String, default: '' }
}, { timestamps: true, versionKey: false });

auditLogSchema.index({ createdAt: -1 });
module.exports = mongoose.model('AuditLog', auditLogSchema);
