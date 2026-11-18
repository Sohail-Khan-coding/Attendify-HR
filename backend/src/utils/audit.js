const AuditLog = require('../models/AuditLog');

async function writeAudit({ req, action, entityType, entityId, summary, changes }) {
  const entry = {
    actor: req?.user?._id || null,
    actorName: req?.user?.name || 'System',
    action,
    entityType,
    entityId: String(entityId || ''),
    summary,
    requestId: req?.headers?.['x-request-id'] || ''
  };

  if (changes !== undefined) entry.changes = changes;
  return AuditLog.create(entry);
}

module.exports = { writeAudit };
