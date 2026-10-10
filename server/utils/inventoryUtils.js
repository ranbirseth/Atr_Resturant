'use strict';

// Pure, dependency-free helpers for the Inventory + Stock modules.
// Kept free of Mongoose so they can be unit tested with Node's built-in test
// runner (node --test). CommonJS to match the rest of server/utils/.

// Fixed unit catalog. Inventory items pick ONE unit and every movement for that
// item is expressed in the same unit, so incompatible units are never silently
// mixed (the controller rejects a movement whose unit differs from the item's).
const UNITS = ['kg', 'g', 'litre', 'ml', 'pieces', 'packets'];

const MOVEMENT_TYPES = ['OPENING', 'RESTOCK', 'CONSUMPTION', 'ADJUSTMENT'];

const PURCHASE_STATUSES = ['NONE', 'NEEDED', 'ORDERED', 'COMPLETED'];

const STOCK_FILTERS = ['all', 'available', 'low', 'out', 'need-to-buy'];

// A cycle raises a usage alert once this percent of its baseline has been used
// (i.e. <= 25% of the baseline remains).
const USAGE_ALERT_THRESHOLD = 75;

const INGREDIENT_WRITABLE_FIELDS = [
    'name',
    'unit',
    'minimumStockLevel',
    'expectedDemand',
    'purchasePrice',
    'isActive',
];

// Coerce numbers (including numeric strings from forms) to a finite number.
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

// Finite number >= 0, or null.
function toNonNegativeNumber(value) {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed < 0) {
        return null;
    }
    return parsed;
}

// Finite number > 0, or null.
function toPositiveNumber(value) {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed <= 0) {
        return null;
    }
    return parsed;
}

function toBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return undefined;
}

function normalizeName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name.trim().replace(/\s+/g, ' ');
}

// Case-insensitive, whitespace-insensitive key for duplicate detection.
function nameKey(name) {
    return normalizeName(name).toLowerCase();
}

function normalizeUnit(unit) {
    if (typeof unit !== 'string') {
        return '';
    }
    return unit.trim();
}

function isValidUnit(unit) {
    return UNITS.includes(normalizeUnit(unit));
}

function isValidMovementType(type) {
    return MOVEMENT_TYPES.includes(type);
}

function isValidPurchaseStatus(status) {
    return PURCHASE_STATUSES.includes(status);
}

// Round to 2 decimal places to keep balances tidy and comparisons stable.
function round2(value) {
    const parsed = toFiniteNumber(value);
    if (parsed === null) {
        return 0;
    }
    return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

// usage% = (baseline - current) / baseline * 100, clamped 0..100.
// Returns null when there is no meaningful baseline (<= 0).
function computeUsagePercent(baselineQty, currentQty) {
    const baseline = toFiniteNumber(baselineQty);
    const current = toFiniteNumber(currentQty);
    if (baseline === null || baseline <= 0) {
        return null;
    }
    const safeCurrent = current === null ? baseline : current;
    const used = baseline - safeCurrent;
    const percent = (used / baseline) * 100;
    return round2(Math.max(0, Math.min(100, percent)));
}

// Remaining% = current / baseline * 100, clamped 0..100. Returns null when
// there is no meaningful baseline (<= 0). Complement of computeUsagePercent.
function computeRemainingPercent(baselineQty, currentQty) {
    const baseline = toFiniteNumber(baselineQty);
    if (baseline === null || baseline <= 0) {
        return null;
    }
    const current = toFiniteNumber(currentQty);
    const safeCurrent = current === null ? baseline : current;
    return round2(Math.max(0, Math.min(100, (safeCurrent / baseline) * 100)));
}

// True when a cycle has consumed at least `thresholdPercent` of its baseline.
// Null-safe: no baseline (<= 0) never raises an alert.
function isUsageAlert(baselineQty, currentQty, thresholdPercent = USAGE_ALERT_THRESHOLD) {
    const percent = computeUsagePercent(baselineQty, currentQty);
    return percent !== null && percent >= thresholdPercent;
}

// How much to buy to reach minimumStockLevel + expectedDemand, floored at 0.
function computeSuggestedQty(minimumStockLevel, expectedDemand, currentQty) {
    const min = toNonNegativeNumber(minimumStockLevel) || 0;
    const demand = toNonNegativeNumber(expectedDemand) || 0;
    const current = toFiniteNumber(currentQty) || 0;
    return round2(Math.max(0, min + demand - current));
}

// Independent stock flags. Low stock does NOT imply need-to-buy.
function computeStockStatus(currentQty, minimumStockLevel) {
    const current = toFiniteNumber(currentQty) || 0;
    const min = toNonNegativeNumber(minimumStockLevel) || 0;
    const outOfStock = current <= 0;
    const lowStock = !outOfStock && current <= min;
    return {
        available: !outOfStock && !lowStock,
        lowStock,
        outOfStock,
    };
}

function needToBuyFromStatus(purchaseStatus) {
    return purchaseStatus === 'NEEDED' || purchaseStatus === 'ORDERED';
}

// Validate + whitelist an inventory item create/update payload.
// `partial` skips required-field checks for updates.
function validateIngredientInput(body, options = {}) {
    const partial = !!options.partial;
    const src = body || {};
    const errors = [];
    const value = {};

    if (!partial || src.name !== undefined) {
        const name = normalizeName(src.name);
        if (!name) errors.push('Item name is required');
        else value.name = name;
    }

    if (!partial || src.unit !== undefined) {
        const unit = normalizeUnit(src.unit);
        if (!isValidUnit(unit)) {
            errors.push(`Unit is required and must be one of: ${UNITS.join(', ')}`);
        } else {
            value.unit = unit;
        }
    }

    if (!partial || src.minimumStockLevel !== undefined) {
        const min = toNonNegativeNumber(src.minimumStockLevel);
        if (min === null) errors.push('Minimum stock level must be a number greater than or equal to 0');
        else value.minimumStockLevel = min;
    }

    if (src.expectedDemand !== undefined) {
        const demand = toNonNegativeNumber(src.expectedDemand);
        if (demand === null) errors.push('Expected demand must be a number greater than or equal to 0');
        else value.expectedDemand = demand;
    }

    if (src.purchasePrice !== undefined && src.purchasePrice !== null && String(src.purchasePrice).trim() !== '') {
        const price = toNonNegativeNumber(src.purchasePrice);
        if (price === null) errors.push('Purchase price must be a number greater than or equal to 0');
        else value.purchasePrice = price;
    }

    if (src.isActive !== undefined) {
        const active = toBoolean(src.isActive);
        if (active === undefined) errors.push('isActive must be a boolean');
        else value.isActive = active;
    }

    // Opening quantity is only honoured on create (handled by the controller).
    if (src.openingQty !== undefined && src.openingQty !== null && String(src.openingQty).trim() !== '') {
        const opening = toNonNegativeNumber(src.openingQty);
        if (opening === null) errors.push('Opening quantity must be a number greater than or equal to 0');
        else value.openingQty = opening;
    }

    // Opening cost/note are only honoured on create (handled by the controller).
    if (src.openingUnitCost !== undefined && src.openingUnitCost !== null && String(src.openingUnitCost).trim() !== '') {
        const cost = toNonNegativeNumber(src.openingUnitCost);
        if (cost === null) errors.push('Opening unit cost must be a number greater than or equal to 0');
        else value.openingUnitCost = cost;
    }

    if (src.openingNote !== undefined) {
        value.openingNote = typeof src.openingNote === 'string' ? src.openingNote.trim() : String(src.openingNote);
    }

    if (src.createdBy !== undefined && src.createdBy !== null && String(src.createdBy).trim() !== '') {
        value.createdBy = String(src.createdBy).trim();
    }

    return { errors, value };
}

// Validate + whitelist a stock movement payload. `quantity` is a positive
// magnitude for OPENING/RESTOCK/CONSUMPTION; ADJUSTMENT uses a signed
// `quantityDelta`.
function validateMovementInput(body) {
    const src = body || {};
    const errors = [];
    const value = {};

    const ingredientId = typeof src.ingredientId === 'string' ? src.ingredientId.trim() : '';
    if (!ingredientId) errors.push('ingredientId is required');
    else value.ingredientId = ingredientId;

    const type = typeof src.type === 'string' ? src.type.trim().toUpperCase() : '';
    if (!isValidMovementType(type)) {
        errors.push(`type must be one of: ${MOVEMENT_TYPES.join(', ')}`);
    } else {
        value.type = type;
    }

    if (type === 'ADJUSTMENT') {
        const delta = toFiniteNumber(src.quantityDelta);
        if (delta === null || delta === 0) {
            errors.push('quantityDelta must be a non-zero finite number');
        } else {
            value.quantityDelta = round2(delta);
        }
    } else {
        const qty = toPositiveNumber(src.quantity);
        if (qty === null) {
            errors.push('quantity must be a number greater than 0');
        } else {
            value.quantity = round2(qty);
        }
    }

    if (src.unit !== undefined && src.unit !== null && String(src.unit).trim() !== '') {
        value.unit = normalizeUnit(src.unit);
    }

    if (src.movementDate !== undefined && src.movementDate !== null && String(src.movementDate).trim() !== '') {
        const parsed = new Date(src.movementDate);
        if (Number.isNaN(parsed.getTime())) {
            errors.push('movementDate must be a valid date');
        } else {
            value.movementDate = parsed;
        }
    }

    if (src.note !== undefined) {
        value.note = typeof src.note === 'string' ? src.note.trim() : String(src.note);
    }

    if (src.unitCost !== undefined && src.unitCost !== null && String(src.unitCost).trim() !== '') {
        const cost = toNonNegativeNumber(src.unitCost);
        if (cost === null) errors.push('unitCost must be a number greater than or equal to 0');
        else value.unitCost = cost;
    }

    if (src.idempotencyKey !== undefined && src.idempotencyKey !== null && String(src.idempotencyKey).trim() !== '') {
        value.idempotencyKey = String(src.idempotencyKey).trim();
    }

    if (src.createdBy !== undefined && src.createdBy !== null && String(src.createdBy).trim() !== '') {
        value.createdBy = String(src.createdBy).trim();
    }

    return { errors, value };
}

// Signed delta applied to the balance for a validated movement.
function movementDelta(value) {
    if (value.type === 'CONSUMPTION') {
        return -value.quantity;
    }
    if (value.type === 'RESTOCK' || value.type === 'OPENING') {
        return value.quantity;
    }
    if (value.type === 'ADJUSTMENT') {
        return value.quantityDelta;
    }
    return 0;
}

// Filter a list of stock rows (already enriched with computed status fields).
function filterStockItems(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    const filter = options.filter || 'all';
    const query = (options.query || '').trim().toLowerCase();

    return list.filter((item) => {
        if (!item) return false;
        const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
        if (query && !name.includes(query)) {
            return false;
        }
        switch (filter) {
            case 'available':
                return item.available === true;
            case 'low':
                return item.lowStock === true;
            case 'out':
                return item.outOfStock === true;
            case 'need-to-buy':
                return item.needToBuy === true;
            case 'all':
            default:
                return true;
        }
    });
}

module.exports = {
    UNITS,
    MOVEMENT_TYPES,
    PURCHASE_STATUSES,
    STOCK_FILTERS,
    INGREDIENT_WRITABLE_FIELDS,
    USAGE_ALERT_THRESHOLD,
    toFiniteNumber,
    toNonNegativeNumber,
    toPositiveNumber,
    toBoolean,
    normalizeName,
    nameKey,
    normalizeUnit,
    isValidUnit,
    isValidMovementType,
    isValidPurchaseStatus,
    round2,
    computeUsagePercent,
    computeRemainingPercent,
    isUsageAlert,
    computeSuggestedQty,
    computeStockStatus,
    needToBuyFromStatus,
    validateIngredientInput,
    validateMovementInput,
    movementDelta,
    filterStockItems,
};
