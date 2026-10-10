import {api} from './apiClient';

// Thin wrapper over the existing centralized API client.
// Uses the read-only GET /api/orders endpoint (verified HTTP 200 in the audit).
export async function getOrders() {
  const data = await api.get('/orders');
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response from server (expected a list of orders).');
  }
  return data;
}
