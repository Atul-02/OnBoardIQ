const mongoose = require('mongoose');
const { MONGO_URI } = require('./config');

async function connectDb() {
  await mongoose.connect(MONGO_URI);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

module.exports = { connectDb };
