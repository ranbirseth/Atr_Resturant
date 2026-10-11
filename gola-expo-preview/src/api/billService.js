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

// Captures the session's billable orders into an immutable bill. The audience
// (CUSTOMER | STAFF) is required by the checkout UI so the server applies the
// agreed pricing and rejects mixed-audience sessions / audience mismatches. An
// optional idempotencyKey honours the server's same-key/same-payload contract.
export async function generateSessionBill(sessionId, options) {
  if (!sessionId) {
    throw new Error('generateSessionBill requires a sessionId');
  }
  const opts = options || {};
  const body = {};
  if (opts.audience !== undefined && opts.audience !== null && String(opts.audience).trim() !== '') {
    body.audience = opts.audience;
  }
  if (opts.idempotencyKey !== undefined && opts.idempotencyKey !== null && String(opts.idempotencyKey).trim() !== '') {
    body.idempotencyKey = opts.idempotencyKey;
  }
  return api.post(`/billing/sessions/${encodeURIComponent(sessionId)}/bills`, body);
}

// Direct POS bill for the tablet counter (origin POS). The audience is required
// and server-authoritative: the client only sends item ids + quantities, never
// prices or totals. A fresh idempotencyKey per checkout is required.
export async function createPosBill(audience, items, idempotencyKey) {
  if (audience !== 'CUSTOMER' && audience !== 'STAFF') {
    throw new Error('createPosBill requires an audience of CUSTOMER or STAFF');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('createPosBill requires a non-empty items array');
  }
  if (!idempotencyKey || String(idempotencyKey).trim() === '') {
    throw new Error('createPosBill requires an idempotencyKey');
  }
  return api.post('/billing/pos/bills', {
    audience,
    items,
    idempotencyKey: String(idempotencyKey).trim(),
  });
}

export async function getBillById(billId) {
  if (!billId) {
    throw new Error('getBillById requires a billId');
  }
  return api.get(`/billing/bills/${encodeURIComponent(billId)}`);
}

// Read-only bill listing for the Reviews & Analytics module (Phase 3). Returns
// every bill as a PII-free DTO sorted newest first; IST range / origin /
// audience / status filtering happens client-side from the returned array.
export async function getBills() {
  const data = await api.get('/billing/bills');
  return Array.isArray(data) ? data : [];
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