const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'local_notifier',
  user: process.env.DB_USER || 'notifier',
  password: process.env.DB_PASSWORD || 'notifier_secret',
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      token VARCHAR(64) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      workflow_id VARCHAR(255) NOT NULL,
      label VARCHAR(255),
      webhook_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, workflow_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id VARCHAR(255),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      message TEXT NOT NULL,
      parse_mode VARCHAR(50) DEFAULT 'markdown',
      level VARCHAR(50) DEFAULT 'info',
      buttons JSONB,
      callback_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_workflow_id ON subscriptions(workflow_id);
  `);

  console.log('[DB] Tables initialized');
}

module.exports = { pool, initDB };
