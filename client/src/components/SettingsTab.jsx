import { useState, useEffect } from 'react';

const api = window.api;

export default function SettingsTab({ userToken, settings, serverUrl, onSaveSetting, onSaveServerUrl }) {
  const [server, setServer] = useState(serverUrl);
  const [logPath, setLogPath] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getLogPath().then(setLogPath);
  }, []);

  function handleCopyToken() {
    navigator.clipboard.writeText(userToken || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSaveServer() {
    const cleaned = server.trim().replace(/\/$/, '');
    onSaveServerUrl(cleaned);
    setServer(cleaned);
    alert('Адрес сервера сохранён');
  }

  return (
    <div className="tab">
      <div className="tab-header">
        <h2>Настройки</h2>
      </div>
      <div className="settings-form">
        <div className="setting-item">
          <label>Ваш токен для n8n</label>
          <div className="token-display">
            <input type="text" readOnly value={userToken || ''} className="full-width mono" />
            <button className="btn small" onClick={handleCopyToken}>
              {copied ? 'Скопировано!' : 'Копировать'}
            </button>
          </div>
          <p className="hint">Используйте этот токен в HTTP-нодах n8n для отправки уведомлений именно вам</p>
        </div>

        <hr />

        <div className="setting-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={e => onSaveSetting('minimizeToTray', e.target.checked)}
            />
            <span>Сворачивать в трей при закрытии</span>
          </label>
        </div>

        <div className="setting-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={e => onSaveSetting('autoStart', e.target.checked)}
            />
            <span>Запускать при старте Windows</span>
          </label>
        </div>

        <div className="setting-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={e => onSaveSetting('soundEnabled', e.target.checked)}
            />
            <span>Звук уведомлений</span>
          </label>
        </div>

        <div className="setting-item">
          <label>Адрес сервера</label>
          <input
            type="text"
            className="full-width"
            value={server}
            onChange={e => setServer(e.target.value)}
          />
        </div>
        <button className="btn primary" onClick={handleSaveServer}>Сохранить</button>

        <hr />

        <div className="setting-item">
          <label>Журнал ошибок</label>
          <p className="hint">{logPath}</p>
          <button className="btn small" style={{ marginTop: 6 }} onClick={() => api.openLogFile()}>
            Открыть файл лога
          </button>
        </div>
      </div>
    </div>
  );
}
