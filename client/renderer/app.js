// ======================== State ========================
let state = {
  serverUrl: 'http://localhost:3000',
  jwt: null,
  username: null,
  userToken: null,
  ws: null,
  messages: [],     // chat messages (notifications + user messages)
  subscriptions: [],
  reconnectTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function logError(message) {
  console.error(message);
  window.api.writeLog('ERROR', message);
}

// ======================== Init ========================
async function init() {
  const settings = await window.api.getSettings();
  state.serverUrl = settings.serverUrl || 'http://localhost:3000';
  state.jwt = settings.jwt;
  state.username = settings.username;
  state.userToken = settings.userToken;

  $('#auth-server').value = state.serverUrl;
  $('#setting-server').value = state.serverUrl;
  $('#setting-tray').checked = settings.minimizeToTray;
  $('#setting-autostart').checked = settings.autoStart;
  $('#setting-sound').checked = settings.soundEnabled;

  // Show log path
  const logPath = await window.api.getLogPath();
  $('#log-path-display').textContent = logPath;

  if (state.jwt && state.username) {
    showMainScreen();
  }

  setupEventListeners();
}

function setupEventListeners() {
  $('#btn-login').addEventListener('click', () => auth('login'));
  $('#btn-register').addEventListener('click', () => auth('register'));
  $('#btn-logout').addEventListener('click', logout);
  $('#auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') auth('login'); });

  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('#btn-subscribe').addEventListener('click', subscribe);
  $('#sub-workflow-id').addEventListener('keydown', e => { if (e.key === 'Enter') subscribe(); });

  $('#btn-clear-chat').addEventListener('click', clearChat);
  $('#btn-send').addEventListener('click', sendMessage);
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-copy-token').addEventListener('click', copyToken);
  $('#btn-reconnect').addEventListener('click', () => {
    if (state.jwt) connectWs();
  });
  $('#btn-open-log').addEventListener('click', () => window.api.openLogFile());

  // Settings toggles — save immediately on change
  $('#setting-tray').addEventListener('change', (e) => {
    window.api.saveSettings({ minimizeToTray: e.target.checked });
  });
  $('#setting-autostart').addEventListener('change', (e) => {
    window.api.saveSettings({ autoStart: e.target.checked });
  });
  $('#setting-sound').addEventListener('change', (e) => {
    window.api.saveSettings({ soundEnabled: e.target.checked });
  });

  // Chat workflow filter
  $('#chat-workflow-select').addEventListener('change', () => renderChat());
}

// ======================== Auth ========================
async function auth(action) {
  const serverUrl = $('#auth-server').value.trim().replace(/\/$/, '');
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;

  if (!username || !password) {
    showAuthError('Введите имя пользователя и пароль');
    return;
  }

  try {
    const res = await fetch(`${serverUrl}/api/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Ошибка');
      return;
    }

    state.jwt = data.jwt;
    state.username = data.user.username;
    state.userToken = data.user.token;
    state.serverUrl = serverUrl;

    await window.api.saveSettings({
      jwt: state.jwt,
      username: state.username,
      userToken: state.userToken,
      serverUrl: state.serverUrl,
    });

    showMainScreen();
  } catch {
    showAuthError('Не удалось подключиться к серверу');
  }
}

function showAuthError(msg) { $('#auth-error').textContent = msg; }

async function logout() {
  state.jwt = null;
  state.username = null;
  state.userToken = null;
  disconnectWs();
  await window.api.saveSettings({ jwt: null, username: null, userToken: null });
  $('#auth-screen').classList.remove('hidden');
  $('#main-screen').classList.add('hidden');
  $('#auth-username').value = '';
  $('#auth-password').value = '';
  $('#auth-error').textContent = '';
}

// ======================== Main screen ========================
async function showMainScreen() {
  $('#auth-screen').classList.add('hidden');
  $('#main-screen').classList.remove('hidden');
  $('#current-user').textContent = state.username;
  $('#user-token-display').value = state.userToken || '';

  connectWs();
  await loadSubscriptions();
  await loadHistory();
}

function switchTab(tab) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach(t => t.classList.add('hidden'));
  $(`#tab-${tab}`).classList.remove('hidden');
}

// ======================== WebSocket ========================
function connectWs() {
  disconnectWs();
  const wsUrl = state.serverUrl.replace(/^http/, 'ws') + `?token=${state.jwt}`;
  setWsStatus('connecting', 'Подключение...');

  try {
    state.ws = new WebSocket(wsUrl);
  } catch (err) {
    logError(`WS connect failed: ${err.message}`);
    setWsStatus('offline', 'Ошибка подключения');
    scheduleReconnect();
    return;
  }

  state.ws.onopen = () => setWsStatus('online', 'Подключён');

  state.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'notification') {
      handleIncomingNotification(msg.data);
    }
  };

  state.ws.onclose = () => {
    setWsStatus('offline', 'Отключён');
    scheduleReconnect();
  };

  state.ws.onerror = (err) => {
    logError(`WS error: ${err.message || 'connection error'}`);
  };
}

function disconnectWs() {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    if (state.jwt) connectWs();
  }, 5000);
}

function setWsStatus(status, text) {
  $('#ws-status').className = `status-dot ${status}`;
  $('#ws-status-text').textContent = text;
}

// ======================== Notifications / Chat ========================
function handleIncomingNotification(notification) {
  state.messages.push({ type: 'incoming', data: notification });
  renderChat();

  // System notification
  const bodyText = notification.message.replace(/[*_`\[\]()#]/g, '').substring(0, 200);
  window.api.showNotification({
    title: notification.title || 'Уведомление',
    body: bodyText,
  });
}

async function loadHistory() {
  try {
    const res = await fetch(`${state.serverUrl}/api/messages/history?limit=100`, {
      headers: { 'Authorization': `Bearer ${state.jwt}` },
    });
    if (res.ok) {
      const history = await res.json();
      // history is newest-first, reverse for chat display
      state.messages = history.reverse().map(n => ({ type: 'incoming', data: n }));
      renderChat();
    }
  } catch (err) {
    logError(`Load history failed: ${err.message}`);
  }
}

function renderChat() {
  const container = $('#chat-messages');
  const filterWf = $('#chat-workflow-select').value;

  const filtered = filterWf
    ? state.messages.filter(m => (m.data.workflow_id || m.data.workflowId) === filterWf)
    : state.messages;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет уведомлений</div>';
    return;
  }

  container.innerHTML = filtered.map((m, idx) => {
    if (m.type === 'outgoing') {
      return `
        <div class="chat-msg outgoing">
          <div class="chat-msg-body">${escapeHtml(m.data.text)}</div>
          <div class="chat-msg-meta">
            <span>${m.data.workflowId || ''}</span>
            <span>${formatTime(m.data.time)}</span>
          </div>
        </div>`;
    }

    const n = m.data;
    const level = n.level || 'info';
    const buttonsHtml = renderButtons(n);

    return `
      <div class="chat-msg incoming level-${level}">
        <div class="chat-msg-title">${escapeHtml(n.title || '')}</div>
        <div class="chat-msg-body">${parseMarkdown(n.message || '')}</div>
        ${buttonsHtml}
        <div class="chat-msg-meta">
          <span>${escapeHtml(n.workflow_id || '')}</span>
          <span>${formatTime(n.created_at)}</span>
        </div>
      </div>`;
  }).join('');

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function renderButtons(notification) {
  const buttons = notification.buttons;
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return '';

  const rows = buttons.map(row => {
    if (!Array.isArray(row)) return '';
    const btns = row.map(btn =>
      `<button class="inline-btn" data-notif-id="${notification.id}" data-callback="${escapeAttr(btn.callback_data)}" data-callback-url="${btn.callback_url ? escapeAttr(btn.callback_url) : ''}">${escapeHtml(btn.text)}</button>`
    ).join('');
    return btns;
  }).join('');

  return `<div class="chat-msg-buttons">${rows}</div>`;
}

// Delegated click handlers (CSP blocks inline onclick)
document.addEventListener('click', (e) => {
  // Inline buttons in notifications
  const inlineBtn = e.target.closest('.inline-btn[data-notif-id]');
  if (inlineBtn) {
    const notifId = inlineBtn.dataset.notifId;
    const callbackData = inlineBtn.dataset.callback;
    const callbackUrl = inlineBtn.dataset.callbackUrl || null;
    handleCallback(notifId, callbackData, callbackUrl, inlineBtn);
    return;
  }

  // Unsubscribe buttons
  const unsubBtn = e.target.closest('[data-unsub-workflow]');
  if (unsubBtn) {
    unsubscribe(unsubBtn.dataset.unsubWorkflow);
    return;
  }
});

async function handleCallback(notificationId, callbackData, buttonCallbackUrl, clickedBtn) {
  try {
    const res = await fetch(`${state.serverUrl}/api/notify/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.jwt}`,
      },
      body: JSON.stringify({
        notification_id: notificationId,
        callback_data: callbackData,
        callback_url: buttonCallbackUrl || null,
        user_id: null,
        username: state.username,
        user_token: state.userToken,
      }),
    });

    if (!res.ok) {
      logError(`Callback failed: ${res.status}`);
    }
  } catch (err) {
    logError(`Callback error: ${err.message}`);
  }
}

async function sendMessage() {
  const workflowId = $('#send-workflow-select').value;
  const text = $('#chat-input').value.trim();

  if (!text) return;
  if (!workflowId) {
    alert('Выберите workflow для отправки');
    return;
  }

  try {
    const res = await fetch(`${state.serverUrl}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.jwt}`,
      },
      body: JSON.stringify({ workflowId, text }),
    });

    if (res.ok) {
      state.messages.push({
        type: 'outgoing',
        data: { text, workflowId, time: new Date().toISOString() },
      });
      renderChat();
      $('#chat-input').value = '';
    } else {
      const err = await res.json();
      alert(err.error || 'Ошибка отправки');
    }
  } catch {
    alert('Не удалось отправить сообщение');
  }
}

function clearChat() {
  state.messages = [];
  renderChat();
}

// ======================== Subscriptions ========================
async function loadSubscriptions() {
  try {
    const res = await fetch(`${state.serverUrl}/api/subscriptions`, {
      headers: { 'Authorization': `Bearer ${state.jwt}` },
    });
    if (res.ok) {
      state.subscriptions = await res.json();
      renderSubscriptions();
      updateWorkflowSelects();
    }
  } catch (err) {
    logError(`Load subscriptions failed: ${err.message}`);
  }
}

async function subscribe() {
  const workflowId = $('#sub-workflow-id').value.trim();
  const label = $('#sub-label').value.trim();
  const webhookUrl = $('#sub-webhook').value.trim();

  if (!workflowId) return;

  try {
    const res = await fetch(`${state.serverUrl}/api/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.jwt}`,
      },
      body: JSON.stringify({ workflowId, label, webhookUrl }),
    });

    if (res.ok) {
      const sub = await res.json();
      // Update or add
      const idx = state.subscriptions.findIndex(s => s.workflow_id === workflowId);
      if (idx >= 0) state.subscriptions[idx] = sub;
      else state.subscriptions.push(sub);
      renderSubscriptions();
      updateWorkflowSelects();
      $('#sub-workflow-id').value = '';
      $('#sub-label').value = '';
      $('#sub-webhook').value = '';
    }
  } catch (err) {
    logError(`Subscribe failed: ${err.message}`);
  }
}

async function unsubscribe(workflowId) {
  try {
    const res = await fetch(`${state.serverUrl}/api/subscriptions/${workflowId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.jwt}` },
    });
    if (res.ok) {
      state.subscriptions = state.subscriptions.filter(s => s.workflow_id !== workflowId);
      renderSubscriptions();
      updateWorkflowSelects();
    }
  } catch (err) {
    logError(`Unsubscribe failed: ${err.message}`);
  }
}

function renderSubscriptions() {
  const list = $('#subscription-list');
  if (state.subscriptions.length === 0) {
    list.innerHTML = '<div class="empty-state">Нет подписок</div>';
    return;
  }

  list.innerHTML = state.subscriptions.map(s => `
    <div class="subscription-item">
      <div class="subscription-info">
        <div class="subscription-label">${escapeHtml(s.label || s.workflow_id)}</div>
        <div class="subscription-id">${escapeHtml(s.workflow_id)}</div>
        ${s.webhook_url ? `<div class="subscription-webhook">${escapeHtml(s.webhook_url)}</div>` : ''}
      </div>
      <button class="btn small danger" data-unsub-workflow="${escapeAttr(s.workflow_id)}">Отписаться</button>
    </div>
  `).join('');
}

function updateWorkflowSelects() {
  const options = state.subscriptions.map(s =>
    `<option value="${escapeAttr(s.workflow_id)}">${escapeHtml(s.label || s.workflow_id)}</option>`
  ).join('');

  $('#chat-workflow-select').innerHTML = '<option value="">Все workflow</option>' + options;

  // Only show workflows with webhook_url for sending
  const sendOptions = state.subscriptions
    .filter(s => s.webhook_url)
    .map(s => `<option value="${escapeAttr(s.workflow_id)}">${escapeHtml(s.label || s.workflow_id)}</option>`)
    .join('');
  $('#send-workflow-select').innerHTML = '<option value="" disabled selected>Workflow...</option>' + sendOptions;
}

// ======================== Settings ========================
async function saveSettings() {
  const settings = {
    serverUrl: $('#setting-server').value.trim().replace(/\/$/, ''),
  };
  await window.api.saveSettings(settings);

  if (settings.serverUrl !== state.serverUrl) {
    state.serverUrl = settings.serverUrl;
    connectWs();
  }
  alert('Настройки сохранены');
}

function copyToken() {
  const input = $('#user-token-display');
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = $('#btn-copy-token');
    btn.textContent = 'Скопировано!';
    setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
  });
}

// ======================== Markdown parser ========================
function parseMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks ```...```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **...** or __...__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic *...* or _..._
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough ~~...~~
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ======================== Helpers ========================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ======================== Start ========================
init();
