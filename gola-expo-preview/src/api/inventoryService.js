import { api } from './apiClient';

// Inventory + Stock service for the Expo admin app.
// All endpoints are unauthenticated by explicit owner decision, so no token or
// header is attached here.

function qs(params) {
  const entries = Object.entries(params || {}).filter(function ([, value]) {
    return value !== undefined && value !== null && value !== '';
  });
  if (entries.length === 0) {
    return '';
  }
  return (
    '?' +
    entries
      .map(function ([key, value]) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(value);
      })
      .join('&')
  );
}

export async function getUnits() {
  const data = await api.get('/inventory/units');
  return Array.isArray(data) ? data : [];
}

export async function getIngredients(params) {
  const data = await api.get('/inventory/ingredients' + qs(params));
  return Array.isArray(data) ? data : [];
}

export async function getIngredient(id) {
  return api.get(`/inventory/ingredients/${id}`);
}

export async function createIngredient(payload) {
  return api.post('/inventory/ingredients', payload);
}

export async function updateIngredient(id, payload) {
  if (!id) {
    throw new Error('updateIngredient requires an id');
  }
  return api.put(`/inventory/ingredients/${id}`, payload);
}

export async function setIngredientActive(id, active) {
  if (!id) {
    throw new Error('setIngredientActive requires an id');
  }
  return api.post(`/inventory/ingredients/${id}/${active ? 'activate' : 'deactivate'}`, {});
}

// Safe delete: the backend hard-deletes only items with no stock history;
// items with movements/cycles are archived (isActive=false) to preserve
// records. Returns { deleted: true } or { archived: true, message, ingredient }.
export async function deleteIngredient(id) {
  if (!id) {
    throw new Error('deleteIngredient requires an id');
  }
  return api.delete(`/inventory/ingredients/${id}`);
}

export async function setPurchaseStatus(id, status) {
  if (!id) {
    throw new Error('setPurchaseStatus requires an id');
  }
  return api.post(`/inventory/ingredients/${id}/purchase-status`, { status });
}

export async function getStock(params) {
  const data = await api.get('/inventory/stock' + qs(params));
  return Array.isArray(data) ? data : [];
}

export async function recordMovement(payload) {
  return api.post('/inventory/stock/movements', payload);
}

export async function getMovements(params) {
  const data = await api.get('/inventory/stock/movements' + qs(params));
  return Array.isArray(data) ? data : [];
}

export async function getCycles(ingredientId) {
  const data = await api.get('/inventory/stock/cycles' + qs({ ingredientId }));
  return Array.isArray(data) ? data : [];
}

export async function reconcile(fix) {
  return api.post('/inventory/stock/reconcile', { fix: !!fix });
}

export async function getAnalytics(params) {
  const data = await api.get('/inventory/analytics' + qs(params));
  return data && typeof data === 'object' ? data : null;
}

export async function getAlerts() {
  const data = await api.get('/inventory/alerts');
  return Array.isArray(data) ? data : [];
}
