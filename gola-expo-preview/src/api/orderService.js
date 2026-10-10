import { api } from './apiClient';

// Orders service for the Expo admin app.
// Mirrors only the read + status-update endpoints the tablet needs. Printing,
// KOT, PDF and the /update route are intentionally NOT exposed here.

export async function getGroupedOrders() {
  const data = await api.get('/orders/grouped');
  return Array.isArray(data) ? data : [];
}

export async function getOrders() {
  const data = await api.get('/orders');
  return Array.isArray(data) ? data : [];
}

export async function getOrderById(orderId) {
  if (!orderId) {
    throw new Error('getOrderById requires an order id');
  }
  return api.get(`/orders/${orderId}`);
}

export async function updateOrderStatus(orderId, status) {
  if (!orderId) {
    throw new Error('updateOrderStatus requires an order id');
  }
  if (!status) {
    throw new Error('updateOrderStatus requires a status');
  }
  return api.put(`/orders/${orderId}/status`, { status });
}
