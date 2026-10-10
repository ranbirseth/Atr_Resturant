import { api } from './apiClient';

// Bills + Payments service for the Expo admin app (Phase 2B).
// Thin wrappers over the dedicated /api/billing router. Errors thrown by
// apiClient carry { status, data } so callers can read e.data.error /
// e.data.message and surface friendly text via billUtils.billingErrorMessage.

export async function getSessionBills(sessionId) {
  if (!sessionId) {
    throw new Error('getSessionBills requires a sessionId');
  }
  const data = await api.get(`/billing/sessions/${encodeURIComponent(sessionId)}/bills`);
  return Array.isArray(data) ? data : [];
}

export async function generateSessionBill(sessionId) {
  if (!sessionId) {
    throw new Error('generateSessionBill requires a sessionId');
  }
  return api.post(`/billing/sessions/${encodeURIComponent(sessionId)}/bills`, {});
}

export async function getBillById(billId) {
  if (!billId) {
    throw new Error('getBillById requires a billId');
  }
  return api.get(`/billing/bills/${encodeURIComponent(billId)}`);
}

export async function recordPayment(billId, payload) {
  if (!billId) {
    throw new Error('recordPayment requires a billId');
  }
  if (!payload || payload.amount == null) {
    throw new Error('recordPayment requires an amount');
  }
  const body = { amount: payload.amount, method: payload.method };
  if (payload.reference) {
    body.reference = payload.reference;
  }
  if (payload.note) {
    body.note = payload.note;
  }
  if (payload.idempotencyKey) {
    body.idempotencyKey = payload.idempotencyKey;
  }
  return api.post(`/billing/bills/${encodeURIComponent(billId)}/payments`, body);
}

export async function reversePayment(billId, paymentId) {
  if (!billId || !paymentId) {
    throw new Error('reversePayment requires a billId and a paymentId');
  }
  return api.post(
    `/billing/bills/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}/reverse`,
    {},
  );
}

export async function voidBill(billId, reason) {
  if (!billId) {
    throw new Error('voidBill requires a billId');
  }
  return api.post(`/billing/bills/${encodeURIComponent(billId)}/void`, { reason: reason || '' });
}

export async function resumeBill(billId) {
  if (!billId) {
    throw new Error('resumeBill requires a billId');
  }
  return api.post(`/billing/bills/${encodeURIComponent(billId)}/resume`, {});
}