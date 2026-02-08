const express = require('express');
const router = express.Router();
const { getItems, seedItems, createItem, updateItem, deleteItem } = require('../controllers/itemController');
const upload = require('../middleware/upload');

router.get('/', getItems);
router.post('/', upload.single('image'), createItem);
router.put('/:id', upload.single('image'), updateItem);
router.delete('/:id', deleteItem);
router.post('/seed', seedItems);

module.exports = router;
