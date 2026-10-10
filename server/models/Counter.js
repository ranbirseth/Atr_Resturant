'use strict';

const mongoose = require('mongoose');

// Global atomic sequence counter for human-friendly numeric suffixes
// (e.g. BILL-YYYYMMDD-0001). The _id key holds the per-day (or per-month)
// namespace; the atomic findOneAndUpdate + $inc makes concurrent next() calls
// safe. Design explicitly avoids the orderIdGenerator max-scan (a full
// collection scan sort) used for Orders.
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(key) {
    const result = await this.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return result ? result.seq : 1;
};

// Monotonic daily bill numbers: BILL-YYYYMMDD-####.
counterSchema.statics.nextBillNumber = async function nextBillNumber(now = new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;
    const seq = await this.next(`bill-${datePrefix}`);
    return `BILL-${datePrefix}-${String(seq).padStart(4, '0')}`;
};

// Automatic - exposing the same _id as seq() so the counter collection stays
// ordered.
const Counter = mongoose.model('Counter', counterSchema);

module.exports = Counter;