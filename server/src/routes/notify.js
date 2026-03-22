const express = require('express');
const { pool } = require('../db');
const { sendToUser, broadcast } = require('../ws');

const router = express.Router();

// Middleware: check API key
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

// ============================================================
// POST /api/notify/send — Send to specific user by token
// POST /api/notify/send/:workflowId — same, workflow_id from URL
// Telegram-like: replaces sendMessage
// ============================================================
router.post('/send/:workflowId?', requireApiKey, async (req, res) => {
  const { token, text, title, parse_mode, level, reply_markup, callback_url, workflow_id: bodyWorkflowId } = req.body;
  const workflow_id = req.params.workflowId || bodyWorkflowId;

  if (!token || !text) {
    return res.status(400).json({ error: 'token and text are required' });
  }

  try {
    // Find user by their unique token
    const userResult = await pool.query('SELECT id, username FROM users WHERE token = $1', [token]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found by token' });
    }

    const user = userResult.rows[0];
    const buttons = reply_markup?.inline_keyboard || null;

    // Save notification
    const notifResult = await pool.query(
      `INSERT INTO notifications (workflow_id, user_id, title, message, parse_mode, level, buttons, callback_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        workflow_id || null,
        user.id,
        title || (workflow_id ? `Workflow ${workflow_id}` : 'Уведомление'),
        text,
        parse_mode || 'markdown',
        level || 'info',
        buttons ? JSON.stringify(buttons) : null,
        callback_url || null,
      ]
    );

    const notification = notifResult.rows[0];

    // Send via WebSocket
    const sent = sendToUser(user.id, {
      type: 'notification',
      data: formatNotification(notification),
    });

    res.json({
      ok: true,
      message_id: notification.id,
      delivered: sent > 0,
    });
  } catch (err) {
    console.error('[Notify] Send error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============================================================
// POST /api/notify/broadcast — Send to all subscribers of workflow
// POST /api/notify/broadcast/:workflowId — same, workflow_id from URL
// ============================================================
router.post('/broadcast/:workflowId?', requireApiKey, async (req, res) => {
  const { workflow_id: bodyWorkflowId, text, title, parse_mode, level, reply_markup, callback_url } = req.body;
  const workflow_id = req.params.workflowId || bodyWorkflowId;

  if (!workflow_id || !text) {
    return res.status(400).json({ error: 'workflow_id and text are required' });
  }

  try {
    const buttons = reply_markup?.inline_keyboard || null;

    // Find subscribers
    const subsResult = await pool.query(
      'SELECT user_id FROM subscriptions WHERE workflow_id = $1',
      [workflow_id]
    );

    const userIds = subsResult.rows.map(r => r.user_id);
    let totalDelivered = 0;

    // Save notification for each subscriber and send
    for (const userId of userIds) {
      const notifResult = await pool.query(
        `INSERT INTO notifications (workflow_id, user_id, title, message, parse_mode, level, buttons, callback_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          workflow_id,
          userId,
          title || `Workflow ${workflow_id}`,
          text,
          parse_mode || 'markdown',
          level || 'info',
          buttons ? JSON.stringify(buttons) : null,
          callback_url || null,
        ]
      );

      const notification = notifResult.rows[0];
      const sent = sendToUser(userId, {
        type: 'notification',
        data: formatNotification(notification),
      });
      totalDelivered += sent;
    }

    res.json({
      ok: true,
      subscribers: userIds.length,
      delivered: totalDelivered,
    });
  } catch (err) {
    console.error('[Notify] Broadcast error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============================================================
// POST /api/notify/callback — Handle inline button press from client
// (internal, called by client app)
// ============================================================
router.post('/callback', async (req, res) => {
  const { notification_id, callback_data, callback_url: buttonCallbackUrl, user_id, username, user_token } = req.body;

  if (!notification_id || !callback_data) {
    return res.status(400).json({ error: 'notification_id and callback_data are required' });
  }

  try {
    const notifResult = await pool.query('SELECT * FROM notifications WHERE id = $1', [notification_id]);
    if (notifResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = notifResult.rows[0];

    // Build callback URL:
    // 1. Per-button callback_url (full override)
    // 2. Notification callback_url + callback_data as path (e.g. http://host:5678/webhook/ + sayHi)
    let callbackUrl = buttonCallbackUrl;
    if (!callbackUrl && notification.callback_url) {
      const base = notification.callback_url.endsWith('/')
        ? notification.callback_url
        : notification.callback_url + '/';
      callbackUrl = base + encodeURIComponent(callback_data);
    }

    if (!callbackUrl) {
      return res.status(400).json({ error: 'No callback URL for this notification' });
    }

    const callbackPayload = {
      callback_query: {
        id: `${notification_id}_${Date.now()}`,
        from: {
          id: user_token,
          username: username,
        },
        data: callback_data,
        message: {
          message_id: notification.id,
          text: notification.message,
          chat: {
            id: user_token,
          },
        },
      },
    };

    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callbackPayload),
    });

    res.json({ ok: true, status: response.status });
  } catch (err) {
    console.error('[Notify] Callback error:', err.message);
    res.status(500).json({ error: 'Failed to send callback' });
  }
});

function formatNotification(n) {
  return {
    id: n.id,
    workflow_id: n.workflow_id,
    title: n.title,
    message: n.message,
    parse_mode: n.parse_mode,
    level: n.level,
    buttons: n.buttons,
    callback_url: n.callback_url,
    created_at: n.created_at,
  };
}

module.exports = router;
