const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
let connectionPromise;

module.exports = async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI).catch(error => {
      connectionPromise = null;
      throw error;
    });
  }

  await connectionPromise;
  console.log('MongoDB connected');
  return mongoose.connection;
};
