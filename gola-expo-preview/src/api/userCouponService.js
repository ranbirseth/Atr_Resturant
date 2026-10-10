import { api } from './apiClient';

// Users & Coupons service for the Expo admin app.
// Endpoints reused from the existing backend (no new routes):
//   GET    /auth/all      -> all registered users (id, name, email, phone, joined, status, orders)
//   GET    /coupons/all   -> every coupon incl. inactive (admin view)
//   POST   /coupons       -> create coupon
//   PUT    /coupons/:id   -> update coupon (used to toggle isActive)
//   DELETE /coupons/:id   -> delete coupon

export async function getUsers() {
  const data = await api.get('/auth/all');
  return Array.isArray(data) ? data : [];
}

export async function getCoupons() {
  const data = await api.get('/coupons/all');
  return Array.isArray(data) ? data : [];
}

export async function createCoupon(payload) {
  return api.post('/coupons', payload);
}

export async function updateCoupon(id, payload) {
  if (!id) {
    throw new Error('updateCoupon requires a coupon id');
  }
  return api.put(`/coupons/${id}`, payload);
}

export async function deleteCoupon(id) {
  if (!id) {
    throw new Error('deleteCoupon requires a coupon id');
  }
  return api.delete(`/coupons/${id}`);
}
