require('dotenv').config();

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

if (process.env.VERCEL) {
	process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/attendify-uploads';
}

const connectDB = require('./config/db');
const app = require('./app');
const port = process.env.PORT || 5000;

if (require.main === module) {
	connectDB()
		.then(() => app.listen(port, () => console.log(`Attendify API running on ${port}`)))
		.catch(err => {
			console.error('Database connection failed:', err.message);
			process.exit(1);
		});
}

module.exports = async (req, res) => {
	return app(req, res);
};
