require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const docs = await db.collection('media').find({ url: { $regex: '192\\.168\\.1\\.4' } }).limit(3).toArray();
  docs.forEach(d => console.log(JSON.stringify({ _id: d._id, url: d.url, path: d.path })));
  process.exit(0);
});
