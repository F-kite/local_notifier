const api = window.api;

export function logError(message) {
  console.error(message);
  api?.writeLog('ERROR', message);
}

export async function fetchApi(serverUrl, path, options = {}) {
  const { jwt, method = 'GET', body } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  const res = await fetch(`${serverUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return res;
}
