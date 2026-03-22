import { useState } from 'react';

export default function AuthScreen({ defaultServerUrl, onAuth }) {
  const [server, setServer] = useState(defaultServerUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(action) {
    if (!username || !password) {
      setError('Введите имя пользователя и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onAuth(action, server.trim().replace(/\/$/, ''), username.trim(), password);
    } catch (err) {
      setError(err.message || 'Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="auth-screen" className="screen">
      <div className="auth-box">
        <h1>Алярм</h1>
        <div className="form-group">
          <label>Сервер</label>
          <input
            type="text"
            value={server}
            onChange={e => setServer(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>
        <div className="form-group">
          <label>Имя пользователя</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="username"
          />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit('login')}
            placeholder="password"
          />
        </div>
        <div className="auth-buttons">
          <button className="btn primary" onClick={() => handleSubmit('login')} disabled={loading}>
            Войти
          </button>
          <button className="btn" onClick={() => handleSubmit('register')} disabled={loading}>
            Регистрация
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
