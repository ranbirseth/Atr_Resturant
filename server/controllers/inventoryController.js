const Ingredient = require('../models/Ingredient');
const StockMovement = require('../models/StockMovement');
const StockCycle = require('../models/StockCycle');
const U = require('../utils/inventoryUtils');

// Build a UI-ready stock row: raw item fields plus derived status/usage.
function stockRow(ingredient, openCycle) {
    const doc = ingredient && ingredient.toObject ? ingredient.toObject() : ingredient;
    const status = U.computeStockStatus(doc.currentQty, doc.minimumStockLevel);
    return {
        ...doc,
        available: status.available,
        lowStock: status.lowStock,
        outOfStock: status.outOfStock,
        needToBuy: U.needToBuyFromStatus(doc.purchaseStatus),
        suggestedQty: U.computeSuggestedQty(doc.minimumStockLevel, doc.expectedDemand, doc.currentQty),
        baselineQty: openCycle ? openCycle.baselineQty : null,
        usagePercent: openCycle ? U.computeUsagePercent(openCycle.baselineQty, doc.currentQty) : null,
    };
}

// @desc    Fixed unit catalog
// @route   GET /api/inventory/units
// @access  Public (owner explicitly requested no auth)
const getUnits = async (req, res) => {
    res.json(U.UNITS.map((name) => ({ name, symbol: name, toBaseFactor: 1 })));
};

// @desc    List inventory items (optionally filtered by name / active state)
// @route   GET /api/inventory/ingredients?query=&active=
const getIngredients = async (req, res) => {
    try {
        const filter = {};
        if (req.query.active === 'true') filter.isActive = true;
        if (req.query.active === 'false') filter.isActive = false;

        let ingredients = await Ingredient.find(filter).sort({ name: 1 });

        const query = U.nameKey(req.query.query || '');
        if (query) {
            ingredients = ingredients.filter((item) => item.nameKey.includes(query));
        }

        const openCycles = await StockCycle.find({ status: 'OPEN' });
        const byIngredient = new Map(openCycles.map((cycle) => [String(cycle.ingredientId), cycle]));

        res.json(ingredients.map((item) => stockRow(item, byIngredient.get(String(item._id)))));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get a single inventory item
// @route   GET /api/inventory/ingredients/:id
const getIngredient = async (req, res) => {
    try {
        const ingredient = await Ingredient.findById(req.params.id);
        if (!ingredient) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }
        const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' });
        res.json(stockRow(ingredient, openCycle));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Create an inventory item (with optional opening quantity)
// @route   POST /api/inventory/ingredients
const createIngredient = async (req, res) => {
    try {
        const { value, errors } = U.validateIngredientInput(req.body, { partial: false });
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        const key = U.nameKey(value.name);
        const duplicate = await Ingredient.findOne({ nameKey: key });
        if (duplicate) {
            return res.status(400).json({ message: 'An inventory item with this name already exists' });
        }

        const openingQty = value.openingQty || 0;
        delete value.openingQty;

        const ingredient = await Ingredient.create({
            ...value,
            nameKey: key,
            currentQty: openingQty,
        });

        let cycle = null;
        if (openingQty > 0) {
            const now = new Date();
            cycle = await StockCycle.create({
                ingredientId: ingredient._id,
                cycleNumber: 1,
                baselineQty: openingQty,
                restockedQty: openingQty,
                carriedOverQty: 0,
                startedAt: now,
                status: 'OPEN',
            });
            await StockMovement.create({
                ingredientId: ingredient._id,
                type: 'OPENING',
                quantityDelta: openingQty,
                unit: ingredient.unit,
                movementDate: now,
                note: 'Opening quantity',
                cycleId: cycle._id,
                createdBy: value.createdBy || 'admin',
            });
            ingredient.latestCycleId = cycle._id;
            await ingredient.save();
        }

        res.status(201).json(stockRow(ingredient, cycle));
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ message: 'An inventory item with this name already exists' });
        }
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update an inventory item (name, unit, minimum stock, demand, active)
// @route   PUT /api/inventory/ingredients/:id
const updateIngredient = async (req, res) => {
    try {
        const existing = await Ingredient.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        const { value, errors } = U.validateIngredientInput(req.body, { partial: true });
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        delete value.openingQty;

        if (value.name !== undefined) {
            const key = U.nameKey(value.name);
            if (key !== existing.nameKey) {
                const others = await Ingredient.find({ _id: { $ne: existing._id } }, 'nameKey');
                if (others.some((other) => other.nameKey === key)) {
                    return res.status(400).json({ message: 'An inventory item with this name already exists' });
                }
                value.nameKey = key;
            } else {
                value.nameKey = existing.nameKey;
            }
        }

        if (value.unit !== undefined && value.unit !== existing.unit) {
            const movementCount = await StockMovement.countDocuments({ ingredientId: existing._id });
            if (movementCount > 0) {
                return res.status(400).json({
                    message: 'Cannot change unit: stock movements already exist for this item. Create a new item instead.',
                });
            }
        }

        const updated = await Ingredient.findByIdAndUpdate(
            existing._id,
            { $set: value },
            { new: true, runValidators: true },
        );
        const openCycle = await StockCycle.findOne({ ingredientId: updated._id, status: 'OPEN' });
        res.json(stockRow(updated, openCycle));
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ message: 'An inventory item with this name already exists' });
        }
        res.status(400).json({ message: error.message });
    }
};

// @desc    Activate / deactivate an inventory item (soft, keeps history)
// @route   POST /api/inventory/ingredients/:id/activate | /deactivate
const setIngredientActive = async (req, res) => {
    try {
        const ingredient = await Ingredient.findByIdAndUpdate(
            req.params.id,
            { $set: { isActive: !!req.body.active } },
            { new: true },
        );
        if (!ingredient) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }
        const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' });
        res.json(stockRow(ingredient, openCycle));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Set explicit purchase state (NONE / NEEDED / ORDERED)
// @route   POST /api/inventory/ingredients/:id/purchase-status
// NOTE: COMPLETED is only set by recording an actual RESTOCK movement.
const setPurchaseStatus = async (req, res) => {
    try {
        const status = String(req.body.status || '').trim().toUpperCase();
        if (!U.isValidPurchaseStatus(status)) {
            return res.status(400).json({
                message: `status must be one of: ${U.PURCHASE_STATUSES.join(', ')}`,
            });
        }
        if (status === 'COMPLETED') {
            return res.status(400).json({
                message: 'Complete a purchase by recording a restock quantity instead.',
            });
        }

        const ingredient = await Ingredient.findByIdAndUpdate(
            req.params.id,
            { $set: { purchaseStatus: status } },
            { new: true },
        );
        if (!ingredient) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }
        const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' });
        res.json(stockRow(ingredient, openCycle));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Current stock with computed status/usage, filterable
// @route   GET /api/inventory/stock?filter=all|available|low|out|need-to-buy&query=
const getStock = async (req, res) => {
    try {
        const ingredients = await Ingredient.find({}).sort({ name: 1 });
        const openCycles = await StockCycle.find({ status: 'OPEN' });
        const byIngredient = new Map(openCycles.map((cycle) => [String(cycle.ingredientId), cycle]));

        const rows = ingredients.map((item) => stockRow(item, byIngredient.get(String(item._id))));
        const filtered = U.filterStockItems(rows, {
            filter: req.query.filter || 'all',
            query: req.query.query || '',
        });
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Record a stock movement (OPENING / RESTOCK / CONSUMPTION / ADJUSTMENT)
// @route   POST /api/inventory/stock/movements
// Idempotent when an idempotencyKey is supplied; consumes atomically and never
// drives the balance below zero.
const recordMovement = async (req, res) => {
    try {
        const { value, errors } = U.validateMovementInput(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        const ingredient = await Ingredient.findById(value.ingredientId);
        if (!ingredient) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        if (value.unit && value.unit !== ingredient.unit) {
            return res.status(400).json({
                message: `Unit mismatch: item is measured in ${ingredient.unit}, movement supplied ${value.unit}.`,
            });
        }

        if (!ingredient.isActive && value.type !== 'ADJUSTMENT') {
            return res.status(400).json({ message: 'Cannot record stock movements for an inactive item' });
        }

        if (value.idempotencyKey) {
            const existing = await StockMovement.findOne({ idempotencyKey: value.idempotencyKey });
            if (existing) {
                return res.status(200).json({ alreadyProcessed: true, movement: existing });
            }
        }

        const delta = U.movementDelta(value);
        if (delta === 0) {
            return res.status(400).json({ message: 'Movement has no effect on stock' });
        }
        const magnitude = Math.abs(delta);

        const balanceFilter = { _id: ingredient._id };
        if (delta < 0) {
            balanceFilter.currentQty = { $gte: magnitude };
        }

        const updated = await Ingredient.findOneAndUpdate(
            balanceFilter,
            { $inc: { currentQty: U.round2(delta) } },
            { new: true },
        );

        if (!updated) {
            const fresh = await Ingredient.findById(ingredient._id);
            const availableQty = fresh ? U.round2(fresh.currentQty) : 0;
            return res.status(409).json({
                error: 'INSUFFICIENT_STOCK',
                message: `Insufficient stock: only ${availableQty} ${ingredient.unit} available`,
                availableQty,
                requested: magnitude,
            });
        }

        const movementDate = value.movementDate || new Date();
        const priorPurchaseStatus = ingredient.purchaseStatus;
        let cycleId = null;
        let newCycle = null;

        try {
            if (value.type === 'RESTOCK' || value.type === 'OPENING') {
                const currentBefore = U.round2(updated.currentQty - value.quantity);
                const carriedOver = Math.max(0, currentBefore);

                const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' }).sort({ cycleNumber: -1 });
                if (openCycle) {
                    openCycle.status = 'CLOSED';
                    openCycle.closedAt = movementDate;
                    openCycle.finalUsagePercent = U.computeUsagePercent(openCycle.baselineQty, currentBefore);
                    await openCycle.save();
                }

                const lastCycle = await StockCycle.findOne({ ingredientId: ingredient._id }).sort({ cycleNumber: -1 });
                const cycleNumber = (lastCycle ? lastCycle.cycleNumber : 0) + 1;

                newCycle = await StockCycle.create({
                    ingredientId: ingredient._id,
                    cycleNumber,
                    baselineQty: U.round2(carriedOver + value.quantity),
                    restockedQty: value.quantity,
                    carriedOverQty: carriedOver,
                    startedAt: movementDate,
                    status: 'OPEN',
                });
                cycleId = newCycle._id;

                const setFields = { latestCycleId: newCycle._id };
                if (priorPurchaseStatus === 'NEEDED' || priorPurchaseStatus === 'ORDERED') {
                    setFields.purchaseStatus = 'COMPLETED';
                }
                await Ingredient.updateOne({ _id: ingredient._id }, { $set: setFields });
            } else {
                const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' }).sort({ cycleNumber: -1 });
                if (openCycle) cycleId = openCycle._id;
            }

            const movement = await StockMovement.create({
                ingredientId: ingredient._id,
                type: value.type,
                quantityDelta: U.round2(delta),
                unit: ingredient.unit,
                movementDate,
                note: value.note || '',
                cycleId,
                idempotencyKey: value.idempotencyKey,
                createdBy: value.createdBy || 'admin',
            });

            const fresh = await Ingredient.findById(ingredient._id);
            const activeCycle = cycleId ? await StockCycle.findById(cycleId) : null;
            return res.status(201).json({
                movement,
                ingredient: stockRow(fresh, activeCycle),
                cycle: activeCycle,
            });
        } catch (writeError) {
            // Compensate the balance change if the ledger write failed.
            await Ingredient.updateOne({ _id: ingredient._id }, { $inc: { currentQty: U.round2(-delta) } });
            if (newCycle) {
                await StockCycle.deleteOne({ _id: newCycle._id });
            }
            if (writeError && writeError.code === 11000 && value.idempotencyKey) {
                const existing = await StockMovement.findOne({ idempotencyKey: value.idempotencyKey });
                return res.status(200).json({ alreadyProcessed: true, movement: existing });
            }
            return res.status(500).json({ message: writeError.message });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Append-only movement history
// @route   GET /api/inventory/stock/movements?ingredientId=&type=&from=&to=&limit=
const getMovements = async (req, res) => {
    try {
        const filter = {};
        if (req.query.ingredientId) filter.ingredientId = req.query.ingredientId;
        if (req.query.type) filter.type = String(req.query.type).toUpperCase();

        if (req.query.from || req.query.to) {
            filter.movementDate = {};
            if (req.query.from) filter.movementDate.$gte = new Date(req.query.from);
            if (req.query.to) {
                const to = new Date(req.query.to);
                to.setHours(23, 59, 59, 999);
                filter.movementDate.$lte = to;
            }
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
        const movements = await StockMovement.find(filter)
            .sort({ movementDate: -1, createdAt: -1 })
            .limit(limit);
        res.json(movements);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Usage cycles for an item (newest first)
// @route   GET /api/inventory/stock/cycles?ingredientId=
const getCycles = async (req, res) => {
    try {
        const filter = {};
        if (req.query.ingredientId) filter.ingredientId = req.query.ingredientId;
        const cycles = await StockCycle.find(filter).sort({ cycleNumber: -1 });
        res.json(cycles);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Reconcile materialized balances against the ledger (detect drift)
// @route   POST /api/inventory/stock/reconcile {fix?: boolean}
const reconcile = async (req, res) => {
    try {
        const fix = !!(req.body && req.body.fix);
        const ingredients = await Ingredient.find({});
        const aggregate = await StockMovement.aggregate([
            { $group: { _id: '$ingredientId', sum: { $sum: '$quantityDelta' } } },
        ]);
        const ledgerSums = new Map(aggregate.map((row) => [String(row._id), U.round2(row.sum)]));

        const mismatches = [];
        for (const ingredient of ingredients) {
            const ledgerQty = ledgerSums.get(String(ingredient._id)) || 0;
            const drift = U.round2(ingredient.currentQty - ledgerQty);
            if (Math.abs(drift) > 0.0001) {
                mismatches.push({
                    ingredientId: ingredient._id,
                    name: ingredient.name,
                    recordedQty: U.round2(ingredient.currentQty),
                    ledgerQty,
                    drift,
                });
                if (fix) {
                    ingredient.currentQty = Math.max(0, ledgerQty);
                    await ingredient.save();
                }
            }
        }

        res.json({ checked: ingredients.length, fixed: fix, mismatchCount: mismatches.length, mismatches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUnits,
    getIngredients,
    getIngredient,
    createIngredient,
    updateIngredient,
    setIngredientActive,
    setPurchaseStatus,
    getStock,
    recordMovement,
    getMovements,
    getCycles,
    reconcile,
};
