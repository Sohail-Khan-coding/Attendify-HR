# Attendify HR — Attendance & Employee Management

A full-stack starter project with an Angular 16 frontend and Express/MongoDB backend.

## Requirements
- Node.js 18 or 20
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

## Run the backend
```bash
cd backend
copy .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run seed
npm run dev
```
Backend: http://localhost:5000/api

Seeded accounts:
- Admin: `admin@attendify.local` / `Admin@12345`
- Employee: `employee@attendify.local` / `Employee@12345`

Change these credentials immediately for real use.

## Run the Angular frontend
Open a second terminal:
```bash
cd frontend
npm install
npm start
```
Frontend: http://localhost:4200

## Attendance and leave policy (configured)
- Office start time: **09:30 AM**
- Late grace period: **30 minutes** (check-ins after 10:00 AM are marked late)
- Annual leave entitlement for new/default employee records: **24 working days per year**
- Weekly holidays: **Saturday and Sunday**
- Leave requests are counted in working days; Saturdays and Sundays are excluded.
- Today's admin absent count is zero on weekly holidays.

These defaults can be changed in `backend/.env` (`OFFICE_START_TIME`, `LATE_GRACE_MINUTES`, `ANNUAL_LEAVE_DAYS`, `WEEKLY_HOLIDAYS`). Running `npm run seed` applies the configured annual allowance to existing employee records as well as the demo employee.

## Important notes
- Angular 16 CLI applications use TypeScript for Angular components and configuration. The project keeps application logic beginner-friendly and avoids advanced TypeScript patterns.
- Browser camera and GPS require user permission. Camera/GPS generally require HTTPS in production; localhost is allowed for development.
- Attendance photo and coordinates are captured only when the employee chooses to mark attendance. The backend stores uploaded images in `backend/uploads` for this development starter. For production, use private object storage, signed access, retention rules, HTTPS, rate limiting, audit logging, backups and stronger admin controls.
- This starter uses a configurable leave allowance on each employee record. It does not assume a country's statutory leave entitlement. Admins can configure the allowance.
- The sample implementation uses browser GPS and photo capture; it does not prove physical presence or prevent GPS spoofing. Consider office geofencing and device/risk checks for production.
# Attendify-HR
