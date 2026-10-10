'use strict';

// Coupon discount rules extracted verbatim from the existing inline logic in
// server/routes/couponRoutes.js so both coupon validation and order creation
// use the exact same, single source of truth. No semantics were changed.

function toFiniteNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

// Returns { ok: true, discountAmount } or { ok: false, reason }.
// reason is one of: INVALID_COUPON | INVALID_TOTAL | BELOW_MINIMUM.
function computeCouponDiscount(coupon, cartTotal) {
    if (!coupon || !coupon.discountType) {
        return { ok: false, reason: 'INVALID_COUPON' };
    }

    const total = toFiniteNumber(cartTotal);
    if (total === null || total < 0) {
        return { ok: false, reason: 'INVALID_TOTAL' };
    }

    const minOrderAmount = coupon.minOrderAmount || 0;
    if (total < minOrderAmount) {
        return { ok: false, reason: 'BELOW_MINIMUM', minOrderAmount };
    }

    let discountAmount = 0;
    if (coupon.discountType === 'PERCENT') {
        discountAmount = (total * coupon.value) / 100;
    } else if (coupon.discountType === 'FLAT') {
        discountAmount = coupon.value;
    }

    // Never discount more than the cart total (matches existing behavior).
    if (discountAmount > total) {
        discountAmount = total;
    }
    if (!(discountAmount >= 0)) {
        discountAmount = 0;
    }

    return { ok: true, discountAmount };
}

module.exports = { computeCouponDiscount, toFiniteNumber };
