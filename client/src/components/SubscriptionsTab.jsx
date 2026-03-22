import { useState } from 'react';

export default function SubscriptionsTab({ subscriptions, onSubscribe, onUnsubscribe }) {
  const [workflowId, setWorkflowId] = useState('');
  const [label, setLabel] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  async function handleSubmit() {
    if (!workflowId.trim()) return;
    await onSubscribe(workflowId.trim(), label.trim(), webhookUrl.trim());
    setWorkflowId('');
    setLabel('');
    setWebhookUrl('');
  }

  return (
    <div className="tab">
      <div className="tab-header">
        <h2>Подписки на Workflow</h2>
      </div>
      <div className="subscribe-form">
        <input
          type="text"
          value={workflowId}
          onChange={e => setWorkflowId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Workflow ID"
        />
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Название"
        />
        <input
          type="text"
          value={webhookUrl}
          onChange={e => setWebhookUrl(e.target.value)}
          placeholder="Webhook URL (для команд)"
        />
        <button className="btn primary" onClick={handleSubmit}>Подписаться</button>
      </div>
      <div className="subscription-list">
        {subscriptions.length === 0 ? (
          <div className="empty-state">Нет подписок</div>
        ) : (
          subscriptions.map(s => (
            <div key={s.workflow_id} className="subscription-item">
              <div className="subscription-info">
                <div className="subscription-label">{s.label || s.workflow_id}</div>
                <div className="subscription-id">{s.workflow_id}</div>
                {s.webhook_url && (
                  <div className="subscription-webhook">{s.webhook_url}</div>
                )}
              </div>
              <button
                className="btn danger"
                onClick={() => onUnsubscribe(s.workflow_id)}
              >
                Отписаться
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
