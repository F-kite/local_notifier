const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

// userId -> Set<WebSocket>
const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const params = new url.URL(req.url, 'http://localhost').searchParams;
    const token = params.get('token');

    if (!token) {
      ws.close(4001, 'Token required');
      return;
    }

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4002, 'Invalid token');
      return;
    }

    if (!clients.has(user.id)) {
      clients.set(user.id, new Set());
    }
    clients.get(user.id).add(ws);
    console.log(`[WS] ${user.username} connected (${clients.get(user.id).size} sessions)`);

    ws.on('close', () => {
      const userClients = clients.get(user.id);
      if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) clients.delete(user.id);
      }
      console.log(`[WS] ${user.username} disconnected`);
    });

    ws.send(JSON.stringify({ type: 'connected', user: { id: user.id, username: user.username } }));
  });

  return wss;
}

// Send to specific user by DB id
function sendToUser(userId, message) {
  const userClients = clients.get(userId);
  if (!userClients) return 0;

  const msg = JSON.stringify(message);
  let sent = 0;
  for (const ws of userClients) {
    if (ws.readyState === 1) {
      ws.send(msg);
      sent++;
    }
  }
  return sent;
}

// Broadcast to multiple users
function broadcast(message, userIds) {
  let sent = 0;
  for (const userId of userIds) {
    sent += sendToUser(userId, message);
  }
  return sent;
}

module.exports = { setupWebSocket, sendToUser, broadcast };
