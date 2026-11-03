import { getBaseUrl } from './config';

// TEMP DEBUG: proves which base URL the running JS bundle is actually using.
console.log('[API] Base URL:', getBaseUrl());

function preview(value, maxLength = 400) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) {
    return text;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}... [truncated]` : text;
}

async function request(path, options = {}) {
  const url = `${getBaseUrl()}${path}`;
  const method = options.method || 'GET';
  const headers = {
    Accept: 'application/json',
    ...(options.body ? {'Content-Type': 'application/json'} : {}),
    ...(options.headers || {}),
  };

  // TEMP DEBUG: request that is about to leave the app.
  console.log('[API] --> REQUEST', {
    method,
    url,
    headers,
    body: options.body,
  });

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body,
    });

    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }

    // TEMP DEBUG: raw response received by the app.
    console.log('[API] <-- RESPONSE', {
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      rawLength: text.length,
      dataPreview: preview(data),
      data: data,
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} for ${path}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (error) {
    // TEMP DEBUG: the exact failure (network, DNS, TLS, abort, HTTP, JSON...).
    console.log('[API] !! REQUEST FAILED', {
      method,
      url,
      name: error && error.name,
      message: error && error.message,
      status: error && error.status,
      data: error && error.data,
      stack: error && error.stack,
    });
    throw error;
  }
}

export const api = {
  get: path => request(path),
  post: (path, body) =>
    request(path, {method: 'POST', body: body ? JSON.stringify(body) : undefined}),
  put: (path, body) =>
    request(path, {method: 'PUT', body: body ? JSON.stringify(body) : undefined}),
  patch: (path, body) =>
    request(path, {method: 'PATCH', body: body ? JSON.stringify(body) : undefined}),
  delete: path => request(path, {method: 'DELETE'}),
};

// Development connectivity check against an existing, safe, read-only endpoint
// (GET /api/categories was verified as WORKING in the Phase 1 audit).
export async function checkBackend() {
  try {
    const data = await api.get('/categories');
    return {
      connected: true,
      message: 'Backend Connected',
      baseUrl: getBaseUrl(),
      data,
    };
  } catch (e) {
    return {
      connected: false,
      message: 'Backend Connection Failed',
      baseUrl: getBaseUrl(),
      error: e.message,
    };
  }
}
