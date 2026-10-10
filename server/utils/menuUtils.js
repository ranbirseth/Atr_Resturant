'use strict';

// Pure, dependency-free helpers for menu/category validation and
// server-authoritative order pricing. Kept free of Mongoose so they can be
// unit tested with the Node built-in test runner (node --test).

const MAX_ITEM_QUANTITY = 999;
const AUDIENCES = ['CUSTOMER', 'STAFF'];

const ITEM_WRITABLE_FIELDS = [
    'name',
    'price',
    'staffPrice',
    'description',
    'image',
    'category',
    'isVeg',
    'estimatedPreparationTime',
    'rating',
    'available',
    'availableForStaff',
];

const CATEGORY_WRITABLE_FIELDS = [
    'name',
    'isVisible',
    'customerVisible',
    'staffVisible',
];

// Coerce numbers (including numeric strings from multipart form data) to a
// finite number, otherwise null.
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

// A price must be a finite number >= 0. Returns the number or null.
function toFinitePrice(value) {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed < 0) {
        return null;
    }
    return parsed;
}

function isValidPrice(value) {
    return toFinitePrice(value) !== null;
}

// Accepts booleans and the "true"/"false" strings multipart forms produce.
// Returns a boolean or undefined when the value cannot be interpreted.
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

function normalizeAudience(value) {
    return String(value === undefined || value === null ? '' : value).trim().toUpperCase() === 'STAFF'
        ? 'STAFF'
        : 'CUSTOMER';
}

function normalizeCategoryName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name.trim().replace(/\s+/g, ' ');
}

// Case-insensitive, whitespace-insensitive key for comparing category names.
function categoryKey(name) {
    return normalizeCategoryName(name).toLowerCase();
}

function isValidQuantity(value) {
    const parsed = toFiniteNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_ITEM_QUANTITY;
}

// Build the whitelisted, validated value object for an item create/update.
// `partial` skips required-field checks for updates while still validating
// every field that is actually supplied.
function validateItemInput(body, options = {}) {
    const partial = !!options.partial;
    const src = body || {};
    const errors = [];
    const value = {};

    if (!partial || src.name !== undefined) {
        const name = typeof src.name === 'string' ? src.name.trim() : '';
        if (!name) errors.push('Item name is required');
        else value.name = name;
    }

    if (!partial || src.category !== undefined) {
        const category = normalizeCategoryName(src.category);
        if (!category) errors.push('Category is required');
        else value.category = category;
    }

    if (!partial || src.price !== undefined) {
        const price = toFinitePrice(src.price);
        if (price === null) errors.push('Customer price must be a finite number greater than or equal to 0');
        else value.price = price;
    }

    if (!partial || src.staffPrice !== undefined) {
        const staffPrice = toFinitePrice(src.staffPrice);
        if (staffPrice === null) errors.push('Staff price must be a finite number greater than or equal to 0');
        else value.staffPrice = staffPrice;
    }

    if (src.description !== undefined) {
        value.description = typeof src.description === 'string' ? src.description.trim() : String(src.description);
    }
    if (src.image !== undefined) {
        value.image = typeof src.image === 'string' ? src.image.trim() : src.image;
    }
    if (src.isVeg !== undefined) {
        const parsed = toBoolean(src.isVeg);
        if (parsed === undefined) errors.push('isVeg must be a boolean');
        else value.isVeg = parsed;
    }
    if (src.estimatedPreparationTime !== undefined) {
        const parsed = toFiniteNumber(src.estimatedPreparationTime);
        if (parsed === null || parsed < 0) errors.push('Preparation time must be a finite number of minutes greater than or equal to 0');
        else value.estimatedPreparationTime = parsed;
    }
    if (src.rating !== undefined) {
        const parsed = toFiniteNumber(src.rating);
        if (parsed === null || parsed < 0) errors.push('Rating must be a finite number greater than or equal to 0');
        else value.rating = parsed;
    }
    if (src.available !== undefined) {
        const parsed = toBoolean(src.available);
        if (parsed === undefined) errors.push('available must be a boolean');
        else value.available = parsed;
    }
    if (src.availableForStaff !== undefined) {
        const parsed = toBoolean(src.availableForStaff);
        if (parsed === undefined) errors.push('availableForStaff must be a boolean');
        else value.availableForStaff = parsed;
    }

    return { errors, value };
}

// Build the whitelisted, validated value object for a category create/update.
function validateCategoryInput(body, options = {}) {
    const partial = !!options.partial;
    const src = body || {};
    const errors = [];
    const value = {};

    if (!partial || src.name !== undefined) {
        const name = normalizeCategoryName(src.name);
        if (!name) errors.push('Category name is required');
        else value.name = name;
    }

    ['isVisible', 'customerVisible', 'staffVisible'].forEach((field) => {
        if (src[field] !== undefined) {
            const parsed = toBoolean(src[field]);
            if (parsed === undefined) errors.push(`${field} must be a boolean`);
            else value[field] = parsed;
        }
    });

    return { errors, value };
}

// Server-authoritative order builder. Given the client's requested items and
// the items loaded from MongoDB, produce the trusted line items and subtotal.
// Never trusts client-supplied prices or totals.
function buildAuthoritativeOrder(options = {}) {
    const audience = normalizeAudience(options.audience);
    const requestedItems = Array.isArray(options.requestedItems) ? options.requestedItems : [];
    const dbItems = Array.isArray(options.dbItems) ? options.dbItems : [];
    const hiddenCategories = options.hiddenCategories instanceof Set
        ? options.hiddenCategories
        : new Set((Array.isArray(options.hiddenCategories) ? options.hiddenCategories : []).map(categoryKey));

    const catalog = new Map();
    dbItems.forEach((item) => {
        if (item && item._id !== undefined && item._id !== null) {
            catalog.set(String(item._id), item);
        }
    });

    if (requestedItems.length === 0) {
        return { ok: false, status: 400, message: 'No order items', lines: [], subtotal: 0, audience };
    }

    const errors = [];
    const lines = [];

    requestedItems.forEach((requested) => {
        const rawId = requested && requested.itemId !== undefined && requested.itemId !== null
            ? String(requested.itemId)
            : '';
        if (!rawId) {
            errors.push('Each order item must include an itemId');
            return;
        }

        const dbItem = catalog.get(rawId);
        if (!dbItem) {
            errors.push('A selected menu item could not be found');
            return;
        }

        if (!isValidQuantity(requested.quantity)) {
            errors.push(`Invalid quantity for "${dbItem.name}"`);
            return;
        }

        if (hiddenCategories.has(categoryKey(dbItem.category))) {
            errors.push(`"${dbItem.name}" is not available on this menu`);
            return;
        }

        let unitPrice;
        if (audience === 'STAFF') {
            if (dbItem.availableForStaff === false) {
                errors.push(`"${dbItem.name}" is currently unavailable`);
                return;
            }
            unitPrice = toFinitePrice(dbItem.staffPrice);
            if (unitPrice === null) {
                errors.push(`Staff price is not configured for "${dbItem.name}"`);
                return;
            }
        } else {
            if (dbItem.available === false) {
                errors.push(`"${dbItem.name}" is currently unavailable`);
                return;
            }
            unitPrice = toFinitePrice(dbItem.price);
            if (unitPrice === null) {
                errors.push(`Price is not configured for "${dbItem.name}"`);
                return;
            }
        }

        const quantity = toFiniteNumber(requested.quantity);
        const customizations = Array.isArray(requested.customizations)
            ? requested.customizations
                .filter((value) => typeof value === 'string' && value.trim() !== '')
                .map((value) => value.trim())
            : [];

        lines.push({
            itemId: dbItem._id,
            name: dbItem.name,
            quantity,
            price: unitPrice,
            customizations,
        });
    });

    if (errors.length > 0) {
        return { ok: false, status: 400, message: errors[0], errors, lines: [], subtotal: 0, audience };
    }

    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    return { ok: true, lines, subtotal, audience };
}

module.exports = {
    MAX_ITEM_QUANTITY,
    AUDIENCES,
    ITEM_WRITABLE_FIELDS,
    CATEGORY_WRITABLE_FIELDS,
    toFiniteNumber,
    toFinitePrice,
    isValidPrice,
    toBoolean,
    normalizeAudience,
    normalizeCategoryName,
    categoryKey,
    isValidQuantity,
    validateItemInput,
    validateCategoryInput,
    buildAuthoritativeOrder,
};
