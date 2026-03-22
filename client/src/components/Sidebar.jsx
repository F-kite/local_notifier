import { RefreshCw, LogOut, MessageSquare, Bell, Settings } from 'lucide-react';

const TAB_ICONS = {
  chat: MessageSquare,
  subscriptions: Bell,
  settings: Settings,
};

const STATUS_TEXT = {
  online: 'Подключён',
  offline: 'Отключён',
  connecting: 'Подключение...',
};

const tabs = [
  { id: 'chat', label: 'Чат' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'settings', label: 'Настройки' },
];

export default function Sidebar({ username, activeTab, onTabChange, wsStatus, onReconnect, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>{username}</span>
        <button className="btn-icon" title="Выйти" onClick={onLogout}><LogOut size={18} /></button>
      </div>
      <nav className="sidebar-nav">
        {tabs.map(tab => {
          const Icon = TAB_ICONS[tab.id];
          return (
            <button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="connection-status">
        <span className={`status-dot ${wsStatus}`} />
        <span>{STATUS_TEXT[wsStatus] || 'Отключён'}</span>
        <button className="btn-icon" title="Переподключиться" onClick={onReconnect}>
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}
