const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/inventoryController');

// NOTE: Intentionally unauthenticated per explicit owner decision. See the
// implementation report for the security risk of open write endpoints.

router.get('/units', getUnits);

router.get('/ingredients', getIngredients);
router.post('/ingredients', createIngredient);
router.get('/ingredients/:id', getIngredient);
router.put('/ingredients/:id', updateIngredient);
router.delete('/ingredients/:id', deleteIngredient);
router.post('/ingredients/:id/activate', (req, res) => {
    req.body = { active: true };
    return setIngredientActive(req, res);
});
router.post('/ingredients/:id/deactivate', (req, res) => {
    req.body = { active: false };
    return setIngredientActive(req, res);
});
router.post('/ingredients/:id/purchase-status', setPurchaseStatus);

router.get('/stock', getStock);
router.get('/stock/balance', getStock);
router.get('/stock/movements', getMovements);
router.post('/stock/movements', recordMovement);
router.get('/stock/cycles', getCycles);
router.post('/stock/reconcile', reconcile);

router.get('/analytics', getAnalytics);
router.get('/alerts', getAlerts);

module.exports = router;
