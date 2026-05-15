const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config({ path: '../.env' });

const app = express();
connectDB();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/entries', require('./routes/entries'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/users', require('./routes/users'));
app.use('/api/requests', require('./routes/requests'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`KBC server running on port ${PORT}`));
