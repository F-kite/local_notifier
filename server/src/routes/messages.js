const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

// JWT middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================================
// POST /api/messages/send — User sends message to n8n workflow
// Mimics Telegram webhook format so n8n receives familiar data
// ============================================================
router.post('/send', requireAuth, async (req, res) => {
  const { workflowId, text } = req.body;

  if (!workflowId || !text) {
    return res.status(400).json({ error: 'workflowId and text are required' });
  }

  try {
    // Get user token
    const userResult = await pool.query('SELECT token FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userToken = userResult.rows[0].token;

    // Get subscription with webhook_url
    const subResult = await pool.query(
      'SELECT webhook_url FROM subscriptions WHERE user_id = $1 AND workflow_id = $2',
      [req.user.id, workflowId]
    );

    if (subResult.rows.length === 0 || !subResult.rows[0].webhook_url) {
      return res.status(400).json({ error: 'No webhook URL configured for this workflow subscription' });
    }

    const webhookUrl = subResult.rows[0].webhook_url;

    // Send in Telegram-like format
    const payload = {
      message: {
        message_id: Date.now(),
        from: {
          id: userToken,
          is_bot: false,
          first_name: req.user.username,
          username: req.user.username,
        },
        chat: {
          id: userToken,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: text,
      },
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    res.json({ ok: true, status: response.status });
  } catch (err) {
    console.error('[Messages] Send error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============================================================
// GET /api/messages/history — Get notification history
// ============================================================
router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await pool.query(
      `SELECT id, workflow_id, title, message, parse_mode, level, buttons, callback_url, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
