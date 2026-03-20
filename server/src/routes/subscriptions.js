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

// Get my subscriptions
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// Subscribe to workflow
router.post('/', requireAuth, async (req, res) => {
  const { workflowId, label, webhookUrl } = req.body;
  if (!workflowId) {
    return res.status(400).json({ error: 'workflowId is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO subscriptions (user_id, workflow_id, label, webhook_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, workflow_id) DO UPDATE SET label = $3, webhook_url = $4
       RETURNING *`,
      [req.user.id, workflowId, label || workflowId, webhookUrl || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Sub] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Unsubscribe
router.delete('/:workflowId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM subscriptions WHERE user_id = $1 AND workflow_id = $2 RETURNING id',
      [req.user.id, req.params.workflowId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
