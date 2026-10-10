const Ingredient = require('../models/Ingredient');
const StockMovement = require('../models/StockMovement');
const StockCycle = require('../models/StockCycle');
const U = require('../utils/inventoryUtils');

// Build a UI-ready stock row: raw item fields plus derived status/usage.
function stockRow(ingredient, openCycle) {
    const doc = ingredient && ingredient.toObject ? ingredient.toObject() : ingredient;
    const status = U.computeStockStatus(doc.currentQty, doc.minimumStockLevel);
    const baselineQty = openCycle ? openCycle.baselineQty : null;
    const usagePercent = openCycle ? U.computeUsagePercent(baselineQty, doc.currentQty) : null;
    return {
        ...doc,
        available: status.available,
        lowStock: status.lowStock,
        outOfStock: status.outOfStock,
        needToBuy: U.needToBuyFromStatus(doc.purchaseStatus),
        suggestedQty: U.computeSuggestedQty(doc.minimumStockLevel, doc.expectedDemand, doc.currentQty),
        baselineQty,
        usagePercent,
        remainingPercent: U.computeRemainingPercent(baselineQty, doc.currentQty),
        usageAlert: U.isUsageAlert(baselineQty, doc.currentQty),
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
        const openingUnitCost = value.openingUnitCost !== undefined ? value.openingUnitCost : (value.purchasePrice !== undefined ? value.purchasePrice : null);
        const openingNote = value.openingNote;
        const createdBy = value.createdBy || 'admin';
        delete value.openingQty;
        delete value.openingUnitCost;
        delete value.openingNote;
        delete value.createdBy;

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
                note: openingNote || 'Opening quantity',
                unitCost: openingUnitCost,
                cycleId: cycle._id,
                createdBy,
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
        delete value.openingUnitCost;
        delete value.openingNote;
        delete value.createdBy;

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

// @desc    Delete an inventory item safely
// @route   DELETE /api/inventory/ingredients/:id
// SAFETY: items with any ledger history are NEVER hard-deleted (that would
// orphan the append-only StockMovement ledger and the StockCycle records).
// They are archived instead (isActive=false, the same soft mechanism the
// activate/deactivate routes use) so balances and movement history remain
// intact, and a clear result tells the UI why. Only items with NO movements
// and NO cycles are actually removed from the database.
const deleteIngredient = async (req, res) => {
    try {
        const ingredient = await Ingredient.findById(req.params.id);
        if (!ingredient) {
            return res.status(404).json({ message: 'Inventory item not found' });
        }

        const [movementCount, cycleCount] = await Promise.all([
            StockMovement.countDocuments({ ingredientId: ingredient._id }),
            StockCycle.countDocuments({ ingredientId: ingredient._id }),
        ]);

        if (movementCount > 0 || cycleCount > 0) {
            const archived = await Ingredient.findByIdAndUpdate(
                ingredient._id,
                { $set: { isActive: false } },
                { new: true },
            );
            const openCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' });
            return res.json({
                archived: true,
                message: `"${ingredient.name}" has stock history (${movementCount} movement(s), ${cycleCount} cycle(s)), so it was archived instead of deleted to preserve those records.`,
                ingredient: stockRow(archived, openCycle),
            });
        }

        await StockCycle.deleteMany({ ingredientId: ingredient._id });
        await Ingredient.findByIdAndDelete(ingredient._id);
        res.json({
            deleted: true,
            message: `"${ingredient.name}" deleted.`,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
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
//
// Idempotency is enforced by an insert-first reservation: a StockMovement with
// status RESERVED is created before any balance/cycle mutation, so a duplicate
// concurrent request fails on the unique idempotency index BEFORE it can touch
// the balance or cycle state. The reservation is then committed (status
// COMMITTED + cycleId) after the writes succeed, or deleted on failure.
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

        const delta = U.movementDelta(value);
        if (delta === 0) {
            return res.status(400).json({ message: 'Movement has no effect on stock' });
        }
        const magnitude = Math.abs(delta);
        const movementDate = value.movementDate || new Date();

        const movementFields = {
            ingredientId: ingredient._id,
            type: value.type,
            quantityDelta: U.round2(delta),
            unit: ingredient.unit,
            movementDate,
            note: value.note || '',
            unitCost: value.unitCost !== undefined ? value.unitCost : null,
            createdBy: value.createdBy || 'admin',
        };

        // Reserve the idempotency key (if any) BEFORE mutating balance/cycles.
        let reservation = null;
        if (value.idempotencyKey) {
            try {
                reservation = await StockMovement.create({
                    ...movementFields,
                    idempotencyKey: value.idempotencyKey,
                    cycleId: null,
                    status: 'RESERVED',
                });
            } catch (reserveError) {
                if (reserveError && reserveError.code === 11000) {
                    const existing = await StockMovement.findOne({ idempotencyKey: value.idempotencyKey });
                    if (existing && existing.status !== 'RESERVED') {
                        return res.status(200).json({ alreadyProcessed: true, movement: existing });
                    }
                    return res.status(409).json({
                        error: 'IN_PROGRESS',
                        message: 'A movement with this idempotency key is already being processed',
                    });
                }
                throw reserveError;
            }
        }

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
            if (reservation) {
                await StockMovement.deleteOne({ _id: reservation._id, status: 'RESERVED' });
            }
            const fresh = await Ingredient.findById(ingredient._id);
            const availableQty = fresh ? U.round2(fresh.currentQty) : 0;
            return res.status(409).json({
                error: 'INSUFFICIENT_STOCK',
                message: `Insufficient stock: only ${availableQty} ${ingredient.unit} available`,
                availableQty,
                requested: magnitude,
            });
        }

        const priorPurchaseStatus = ingredient.purchaseStatus;
        const priorLatestCycleId = ingredient.latestCycleId || null;
        let cycleId = null;
        let newCycle = null;
        let priorOpenCycle = null;

        try {
            if (value.type === 'RESTOCK' || value.type === 'OPENING') {
                const currentBefore = U.round2(updated.currentQty - value.quantity);
                const carriedOver = Math.max(0, currentBefore);

                priorOpenCycle = await StockCycle.findOne({ ingredientId: ingredient._id, status: 'OPEN' }).sort({ cycleNumber: -1 });
                if (priorOpenCycle) {
                    priorOpenCycle.status = 'CLOSED';
                    priorOpenCycle.closedAt = movementDate;
                    priorOpenCycle.finalUsagePercent = U.computeUsagePercent(priorOpenCycle.baselineQty, currentBefore);
                    await priorOpenCycle.save();
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

            let movement;
            if (reservation) {
                movement = await StockMovement.findOneAndUpdate(
                    { _id: reservation._id, status: 'RESERVED' },
                    { $set: { cycleId, status: 'COMMITTED' } },
                    { new: true },
                );
                if (!movement) {
                    throw new Error('Idempotency reservation was lost before commit');
                }
            } else {
                movement = await StockMovement.create({
                    ...movementFields,
                    cycleId,
                    status: 'COMMITTED',
                });
            }

            const fresh = await Ingredient.findById(ingredient._id);
            const activeCycle = cycleId ? await StockCycle.findById(cycleId) : null;
            return res.status(201).json({
                movement,
                ingredient: stockRow(fresh, activeCycle),
                cycle: activeCycle,
            });
        } catch (writeError) {
            // Compensate every mutation so a failed write leaves no drift.
            await Ingredient.updateOne({ _id: ingredient._id }, { $inc: { currentQty: U.round2(-delta) } });
            if (newCycle) {
                await StockCycle.deleteOne({ _id: newCycle._id });
                await Ingredient.updateOne(
                    { _id: ingredient._id },
                    { $set: { latestCycleId: priorLatestCycleId, purchaseStatus: priorPurchaseStatus } },
                );
            }
            if (priorOpenCycle) {
                await StockCycle.updateOne(
                    { _id: priorOpenCycle._id },
                    { $set: { status: 'OPEN', closedAt: null, finalUsagePercent: null } },
                );
            }
            if (reservation) {
                await StockMovement.deleteOne({ _id: reservation._id, status: 'RESERVED' });
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
        // Hide uncommitted idempotency reservations (and legacy docs lack status).
        const filter = { status: { $ne: 'RESERVED' } };
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
            { $match: { status: { $ne: 'RESERVED' } } },
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

// @desc    Inventory analytics: additions / consumption / adjustment totals and
//          per-item summaries + purchase suggestions, aggregated once from the
//          append-only ledger (no formula duplicated from inventoryUtils).
// @route   GET /api/inventory/analytics?from=&to=
const getAnalytics = async (req, res) => {
    try {
        const match = { status: { $ne: 'RESERVED' } };
        const range = {};
        if (req.query.from) {
            const from = new Date(req.query.from);
            if (Number.isNaN(from.getTime())) {
                return res.status(400).json({ message: 'from must be a valid date' });
            }
            range.$gte = from;
        }
        if (req.query.to) {
            const to = new Date(req.query.to);
            if (Number.isNaN(to.getTime())) {
                return res.status(400).json({ message: 'to must be a valid date' });
            }
            to.setHours(23, 59, 59, 999);
            range.$lte = to;
        }
        if (Object.keys(range).length > 0) {
            match.movementDate = range;
        }

        const [ingredients, openCycles, grouped] = await Promise.all([
            Ingredient.find({}).sort({ name: 1 }),
            StockCycle.find({ status: 'OPEN' }),
            StockMovement.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { ingredientId: '$ingredientId', type: '$type' },
                        sum: { $sum: '$quantityDelta' },
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        const openByIngredient = new Map(openCycles.map((cycle) => [String(cycle.ingredientId), cycle]));
        const perIngredient = new Map();
        let totalAdditions = 0;
        let totalConsumption = 0;
        let totalAdjustment = 0;
        let movementCount = 0;

        for (const row of grouped) {
            const id = String(row._id.ingredientId);
            const type = row._id.type;
            const sum = U.round2(row.sum || 0);
            movementCount += row.count || 0;
            const entry = perIngredient.get(id) || { additions: 0, consumption: 0, adjustment: 0 };
            if (type === 'OPENING' || type === 'RESTOCK') {
                const added = Math.max(0, sum);
                entry.additions = U.round2(entry.additions + added);
                totalAdditions = U.round2(totalAdditions + added);
            } else if (type === 'CONSUMPTION') {
                const consumed = U.round2(-sum);
                entry.consumption = U.round2(entry.consumption + consumed);
                totalConsumption = U.round2(totalConsumption + consumed);
            } else if (type === 'ADJUSTMENT') {
                entry.adjustment = U.round2(entry.adjustment + sum);
                totalAdjustment = U.round2(totalAdjustment + sum);
            }
            perIngredient.set(id, entry);
        }

        const items = ingredients.map((ingredient) => {
            const id = String(ingredient._id);
            const stats = perIngredient.get(id) || { additions: 0, consumption: 0, adjustment: 0 };
            const openCycle = openByIngredient.get(id);
            const baselineQty = openCycle ? openCycle.baselineQty : null;
            return {
                ingredientId: ingredient._id,
                name: ingredient.name,
                unit: ingredient.unit,
                currentQty: U.round2(ingredient.currentQty),
                minimumStockLevel: ingredient.minimumStockLevel,
                expectedDemand: ingredient.expectedDemand,
                purchasePrice: ingredient.purchasePrice,
                purchaseStatus: ingredient.purchaseStatus,
                needToBuy: U.needToBuyFromStatus(ingredient.purchaseStatus),
                baselineQty,
                usagePercent: U.computeUsagePercent(baselineQty, ingredient.currentQty),
                remainingPercent: U.computeRemainingPercent(baselineQty, ingredient.currentQty),
                usageAlert: U.isUsageAlert(baselineQty, ingredient.currentQty),
                additions: stats.additions,
                consumption: stats.consumption,
                adjustment: stats.adjustment,
                netChange: U.round2(stats.additions + stats.adjustment - stats.consumption),
                suggestedQty: U.computeSuggestedQty(ingredient.minimumStockLevel, ingredient.expectedDemand, ingredient.currentQty),
            };
        });

        const purchaseSuggestions = items
            .filter((item) => item.suggestedQty > 0)
            .map((item) => ({
                ingredientId: item.ingredientId,
                name: item.name,
                unit: item.unit,
                currentQty: item.currentQty,
                minimumStockLevel: item.minimumStockLevel,
                expectedDemand: item.expectedDemand,
                purchaseStatus: item.purchaseStatus,
                suggestedQty: item.suggestedQty,
            }));

        res.json({
            from: range.$gte || null,
            to: range.$lte || null,
            totals: {
                additions: totalAdditions,
                consumption: totalConsumption,
                adjustment: totalAdjustment,
                netChange: U.round2(totalAdditions + totalAdjustment - totalConsumption),
                movementCount,
            },
            items,
            purchaseSuggestions,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Items needing attention: 70%-used cycle, low/out of stock, or
//          flagged for purchase. Reuses stockRow so no derived math is repeated.
// @route   GET /api/inventory/alerts
const getAlerts = async (req, res) => {
    try {
        const ingredients = await Ingredient.find({}).sort({ name: 1 });
        const openCycles = await StockCycle.find({ status: 'OPEN' });
        const byIngredient = new Map(openCycles.map((cycle) => [String(cycle.ingredientId), cycle]));
        const rows = ingredients.map((item) => stockRow(item, byIngredient.get(String(item._id))));
        res.json(rows.filter((row) => row.usageAlert || row.lowStock || row.outOfStock || row.needToBuy));
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
    deleteIngredient,
    setPurchaseStatus,
    getStock,
    recordMovement,
    getMovements,
    getCycles,
    reconcile,
    getAnalytics,
    getAlerts,
};
