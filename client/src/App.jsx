import { useState, useEffect, useCallback } from 'react';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatTab from './components/ChatTab';
import SubscriptionsTab from './components/SubscriptionsTab';
import SettingsTab from './components/SettingsTab';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchApi, logError } from './utils/api';

const api = window.api;

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [jwt, setJwt] = useState(null);
  const [username, setUsername] = useState(null);
  const [userToken, setUserToken] = useState(null);
  const [messages, setMessages] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [settings, setSettings] = useState({
    minimizeToTray: true,
    autoStart: false,
    soundEnabled: true,
  });

  // Load settings on startup
  useEffect(() => {
    (async () => {
      const s = await api.getSettings();
      setServerUrl(s.serverUrl || 'http://localhost:3000');
      setJwt(s.jwt);
      setUsername(s.username);
      setUserToken(s.userToken);
      setSettings({
        minimizeToTray: s.minimizeToTray,
        autoStart: s.autoStart,
        soundEnabled: s.soundEnabled,
      });
    })();
  }, []);

  // Load history + subscriptions when logged in
  useEffect(() => {
    if (!jwt) return;
    loadHistory();
    loadSubscriptions();
  }, [jwt, serverUrl]);

  async function loadHistory() {
    try {
      const res = await fetchApi(serverUrl, '/api/messages/history?limit=100', { jwt });
      if (res.ok) {
        const history = await res.json();
        setMessages(history.reverse().map(n => ({ type: 'incoming', data: n })));
      }
    } catch (err) {
      logError(`Load history: ${err.message}`);
    }
  }

  async function loadSubscriptions() {
    try {
      const res = await fetchApi(serverUrl, '/api/subscriptions', { jwt });
      if (res.ok) {
        setSubscriptions(await res.json());
      }
    } catch (err) {
      logError(`Load subscriptions: ${err.message}`);
    }
  }

  const handleNotification = useCallback((notification) => {
    setMessages(prev => [...prev, { type: 'incoming', data: notification }]);

    const bodyText = notification.message.replace(/[*_`\[\]()#]/g, '').substring(0, 200);
    api.showNotification({
      title: notification.title || 'Уведомление',
      body: bodyText,
    });
  }, []);

  const { status: wsStatus, reconnect } = useWebSocket(
    jwt ? serverUrl : null,
    jwt,
    handleNotification,
  );

  // Auth
  async function handleAuth(action, authServerUrl, authUsername, password) {
    const res = await fetch(`${authServerUrl}/api/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authUsername, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');

    setJwt(data.jwt);
    setUsername(data.user.username);
    setUserToken(data.user.token);
    setServerUrl(authServerUrl);

    await api.saveSettings({
      jwt: data.jwt,
      username: data.user.username,
      userToken: data.user.token,
      serverUrl: authServerUrl,
    });
  }

  async function handleLogout() {
    setJwt(null);
    setUsername(null);
    setUserToken(null);
    setMessages([]);
    setSubscriptions([]);
    await api.saveSettings({ jwt: null, username: null, userToken: null });
  }

  // Subscriptions
  async function handleSubscribe(workflowId, label, webhookUrl) {
    const res = await fetchApi(serverUrl, '/api/subscriptions', {
      jwt, method: 'POST',
      body: { workflowId, label, webhookUrl },
    });
    if (res.ok) {
      const sub = await res.json();
      setSubscriptions(prev => {
        const idx = prev.findIndex(s => s.workflow_id === workflowId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = sub;
          return next;
        }
        return [...prev, sub];
      });
    }
  }

  async function handleUnsubscribe(workflowId) {
    const res = await fetchApi(serverUrl, `/api/subscriptions/${workflowId}`, {
      jwt, method: 'DELETE',
    });
    if (res.ok) {
      setSubscriptions(prev => prev.filter(s => s.workflow_id !== workflowId));
    }
  }

  // Callback
  async function handleCallback(notificationId, callbackData, callbackUrl) {
    try {
      const res = await fetchApi(serverUrl, '/api/notify/callback', {
        jwt, method: 'POST',
        body: {
          notification_id: notificationId,
          callback_data: callbackData,
          callback_url: callbackUrl || null,
          username,
          user_token: userToken,
        },
      });
      if (!res.ok) logError(`Callback failed: ${res.status}`);
    } catch (err) {
      logError(`Callback error: ${err.message}`);
    }
  }

  // Send message
  async function handleSendMessage(workflowId, text) {
    const res = await fetchApi(serverUrl, '/api/messages/send', {
      jwt, method: 'POST',
      body: { workflowId, text },
    });
    if (res.ok) {
      setMessages(prev => [...prev, {
        type: 'outgoing',
        data: { text, workflowId, time: new Date().toISOString() },
      }]);
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Ошибка отправки');
    }
  }

  // Settings
  async function handleSaveSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
    await api.saveSettings({ [key]: value });
  }

  async function handleSaveServerUrl(newUrl) {
    setServerUrl(newUrl);
    await api.saveSettings({ serverUrl: newUrl });
  }

  if (!jwt) {
    return <AuthScreen defaultServerUrl={serverUrl} onAuth={handleAuth} />;
  }

  return (
    <div id="main-screen">
      <Sidebar
        username={username}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wsStatus={wsStatus}
        onReconnect={reconnect}
        onLogout={handleLogout}
      />
      <div className="content">
        {activeTab === 'chat' && (
          <ChatTab
            messages={messages}
            subscriptions={subscriptions}
            serverUrl={serverUrl}
            onCallback={handleCallback}
            onSendMessage={handleSendMessage}
            onClearChat={() => setMessages([])}
          />
        )}
        {activeTab === 'subscriptions' && (
          <SubscriptionsTab
            subscriptions={subscriptions}
            onSubscribe={handleSubscribe}
            onUnsubscribe={handleUnsubscribe}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            userToken={userToken}
            settings={settings}
            serverUrl={serverUrl}
            onSaveSetting={handleSaveSetting}
            onSaveServerUrl={handleSaveServerUrl}
          />
        )}
      </div>
    </div>
  );
}
