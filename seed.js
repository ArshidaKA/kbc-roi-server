const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const User = require('./models/User');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email: 'admin@kbc.com' });
  if (existing) {
    console.log('Admin already exists — admin@kbc.com / admin@1234');
    process.exit(0);
  }

  await User.create({
    name: 'KBC Admin',
    email: 'admin@kbc.com',
    password: 'admin@1234',
    role: 'owner',
  });

  console.log('✓ Admin created');
  console.log('  Email   : admin@kbc.com');
  console.log('  Password: admin@1234');
  console.log('  Role    : owner');
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
