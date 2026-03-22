import { useState, useEffect, useRef } from 'react';
import { Send, BrushCleaning } from 'lucide-react';
import { parseMarkdown, escapeHtml, formatTime } from '../utils/markdown';

export default function ChatTab({ messages, subscriptions, onCallback, onSendMessage, onClearChat }) {
  const [filterWf, setFilterWf] = useState('');
  const [sendWf, setSendWf] = useState('');
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = filterWf
    ? messages.filter(m => (m.data.workflow_id || m.data.workflowId) === filterWf)
    : messages;

  const sendableWorkflows = subscriptions.filter(s => s.webhook_url);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [filtered.length]);

  async function handleSend() {
    if (!inputText.trim()) return;
    if (!sendWf) {
      setError('Выберите workflow');
      setTimeout(() => setError(''), 3000);
      return;
    }
    setError('');
    try {
      await onSendMessage(sendWf, inputText.trim());
      setInputText('');
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 3000);
    }
    inputRef.current?.focus();
  }

  return (
    <div className="tab">
      <div className="tab-header">
        <h2>Уведомления</h2>
        <div className="tab-header-right">
          <select value={filterWf} onChange={e => setFilterWf(e.target.value)}>
            <option value="">Все workflow</option>
            {subscriptions.map(s => (
              <option key={s.workflow_id} value={s.workflow_id}>
                {s.label || s.workflow_id}
              </option>
            ))}
          </select>
          <button className="btn icon" onClick={onClearChat} title="Очистить список уведомлений"><BrushCleaning size={20} /></button>
        </div>
      </div>

      <div className="chat-messages" ref={chatRef}>
        {filtered.length === 0 ? (
          <div className="empty-state">Нет уведомлений</div>
        ) : (
          filtered.map((m, idx) => (
            <ChatMessage key={idx} message={m} onCallback={onCallback} />
          ))
        )}
      </div>

      {error && <div className="chat-input-error">{error}</div>}
      <div className="chat-input-bar">
        <select value={sendWf} onChange={e => { setSendWf(e.target.value); setError(''); }}>
          <option value="" disabled>Workflow...</option>
          {sendableWorkflows.map(s => (
            <option key={s.workflow_id} value={s.workflow_id}>
              {s.label || s.workflow_id}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Введите сообщение или команду..."
        />
        <button className="btn-send" title="Отправить" onClick={handleSend}>
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

function ChatMessage({ message, onCallback }) {
  const { type, data } = message;

  if (type === 'outgoing') {
    return (
      <div className="chat-msg outgoing">
        <div className="chat-msg-body">{escapeHtml(data.text)}</div>
        <div className="chat-msg-meta">
          <span>{data.workflowId || ''}</span>
          <span>{formatTime(data.time)}</span>
        </div>
      </div>
    );
  }

  const level = data.level || 'info';
  const buttons = data.buttons;

  return (
    <div className={`chat-msg incoming level-${level}`}>
      {data.title && <div className="chat-msg-title">{data.title}</div>}
      <div
        className="chat-msg-body"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(data.message || '') }}
      />
      {buttons && Array.isArray(buttons) && buttons.length > 0 && (
        <div className="chat-msg-buttons">
          {buttons.map((row, ri) =>
            Array.isArray(row) && row.map((btn, bi) => (
              <button
                key={`${ri}-${bi}`}
                className="inline-btn"
                onClick={() => onCallback(data.id, btn.callback_data, btn.callback_url || null)}
              >
                {btn.text}
              </button>
            ))
          )}
        </div>
      )}
      <div className="chat-msg-meta">
        <span>{data.workflow_id || ''}</span>
        <span>{formatTime(data.created_at)}</span>
      </div>
    </div>
  );
}
