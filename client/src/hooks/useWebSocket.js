import { useEffect, useRef, useCallback, useState } from 'react';

export function useWebSocket(serverUrl, jwt, onNotification) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const [status, setStatus] = useState('offline');

  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!serverUrl || !jwt) return;
    disconnect();

    const wsUrl = serverUrl.replace(/^http/, 'ws') + `?token=${jwt}`;
    setStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setStatus('online');

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'notification') {
          onNotification(msg.data);
        }
      };

      ws.onclose = () => {
        setStatus('offline');
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          connect();
        }, 5000);
      };

      ws.onerror = () => {};
    } catch {
      setStatus('offline');
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, 5000);
    }
  }, [serverUrl, jwt, onNotification, disconnect]);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { status, reconnect: connect };
}
