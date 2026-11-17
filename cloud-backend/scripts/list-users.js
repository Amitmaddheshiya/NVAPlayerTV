const mongoose = require('mongoose');
const User = require('../src/models/User');

mongoose.connect('mongodb://localhost:27017/signage-cms')
  .then(async () => {
    console.log('Connected to MongoDB');
    const users = await User.find().select('email role');
    console.log('Users in database:');
    users.forEach(u => console.log(`- ${u.email} (${u.role})`));
    mongoose.connection.close();
  })
  .catch(console.error);
