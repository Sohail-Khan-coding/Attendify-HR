const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = [
  ...(process.env.CLIENT_URL || 'http://localhost:4200').split(','),
  'https://attendify-hr-by-sohail-khan.vercel.app',
  'https://attendify-hr-by-sohail-khan-ez9tk4hcx-sk-bd8f.vercel.app'
]
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Uploaded files are deliberately not exposed as a public static directory.
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Attendify HR API' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/attendance-corrections', require('./routes/attendanceCorrections'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/reports', require('./routes/reports'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.message === 'Origin is not allowed by CORS.' ? 403 : 500)
    .json({ message: err.message === 'Origin is not allowed by CORS.' ? err.message : 'Unexpected server error.' });
});

module.exports = app;