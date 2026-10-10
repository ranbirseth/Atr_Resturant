import { getBaseUrl } from './config';

async function request(path, options = {}) {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? {'Content-Type': 'application/json'} : {}),
      ...(options.headers || {}),
    },
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

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${path}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
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
