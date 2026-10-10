import { api } from './apiClient';

// Billing service for the Expo admin app.
//
// Only the existing, read-only coupon validation contract is used here. The
// POS bill itself is a local preview: this phase deliberately does NOT call
// POST /api/orders from the tablet (see docs/implementation/billing-implementation.md).
//
//   POST /api/coupons/validate { code, cartTotal }
//     -> { success, code, discountType, value, discountAmount, message }
//     errors: { message } with HTTP 400/404.
export async function validateCoupon(code, cartTotal) {
  const trimmed = code == null ? '' : String(code).trim();
  if (!trimmed) {
    throw new Error('Enter a coupon code');
  }
  return api.post('/coupons/validate', {
    code: trimmed.toUpperCase(),
    cartTotal: Number(cartTotal) || 0,
  });
}
