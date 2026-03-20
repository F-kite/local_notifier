require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { initDB } = require('./db');
const { setupWebSocket } = require('./ws');
const authRoutes = require('./routes/auth');
const notifyRoutes = require('./routes/notify');
const subscriptionRoutes = require('./routes/subscriptions');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/messages', messageRoutes);

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start
async function start() {
  await initDB();
  setupWebSocket(server);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});
