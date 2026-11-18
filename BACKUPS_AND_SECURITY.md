# Operations: backups, notifications, and account security

## Database backups

MongoDB Atlas backups/PITR are recommended for production. The repository also includes a compressed archive script:

1. Install MongoDB Database Tools (`mongodump` / `mongorestore`) on a trusted machine.
2. Set `MONGO_URI` in that machine's environment (do not put it in a scheduled command or source file).
3. Run `npm run backup` from `backend/`.
4. Copy the generated `backend/backups/*.archive.gz` to encrypted off-site storage and apply a retention policy.
5. Periodically restore to a non-production database using `mongorestore --uri="$RESTORE_URI" --archive=<archive-file> --gzip --drop` and verify the attendance photo GridFS collections as well as normal records.

Vercel functions are ephemeral; do not schedule backups in the function or leave archives in `/tmp`. A backup is not considered verified until a restore has been tested. Never commit backup archives.

## Device notifications

Web Push requires HTTPS and VAPID keys. Generate a key pair on a trusted machine with `npx web-push generate-vapid-keys`; configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the backend deployment environment. Set the same public key in `frontend/src/environments/environment.prod.ts` before building the frontend. The backend key pair and private key must never be exposed to the browser or committed.

Users must sign in, allow notifications, and subscribe each device from Settings. Browsers/OS may suppress notification sound or vibration when the device is silent, in Focus/Do Not Disturb, or site notifications are disabled. The website cannot override those device controls. Foreground alert sounds also require a user gesture and enabled sound preference. iOS generally requires the site to be installed as a Home Screen web app for Web Push.

TOTP enrollment uses `MFA_ENCRYPTION_KEY`; leave it unset only if no administrator will turn on MFA. Set it before enabling MFA, then keep the key stable across deployments. This release adds backend dependencies, so deploy it with `npm ci` / the updated backend lockfile.

## Administrator MFA and secret rotation

Configure `MFA_ENCRYPTION_KEY` as 32 random bytes encoded in hex. For example, generate it locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and store it only in the backend environment manager. Admins enable authenticator-app TOTP from account security settings. Back up the key securely; losing it requires re-enrollment.

A previous committed environment example contained non-placeholder credentials. Rotate the MongoDB database user's password and the JWT signing secret in the hosting provider, update the deployment environment, and redeploy. Changing the JWT secret signs out every current session. Review repository history and revoke any other credential that may have been committed. Do not copy production secrets into `.env.example`.

## Login protections

Login lockout is database-backed and applies to an IP/email pair. Configure Express behind the trusted hosting proxy only; the app trusts one proxy hop for client IP reporting. Use a managed WAF/edge rate limit as an additional production control.
