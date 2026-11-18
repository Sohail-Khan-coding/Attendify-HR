const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is required to create a database backup.');
  process.exit(1);
}

const backupDirectory = path.resolve(process.env.BACKUP_DIR || 'backups');
fs.mkdirSync(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const archivePath = path.join(backupDirectory, `attendify-${timestamp}.archive.gz`);
const result = spawnSync('mongodump', ['--uri', uri, `--archive=${archivePath}`, '--gzip'], {
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  console.error(`Could not run mongodump: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  fs.rmSync(archivePath, { force: true });
  process.exit(result.status || 1);
}

console.log(`Compressed database backup created at ${archivePath}`);
