const Item = require('../models/Item');

// @desc    Get all items
// @route   GET /api/items
// @access  Public
const getItems = async (req, res) => {
    try {
        const items = await Item.find({});
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const seedItems = async (req, res) => {
    const dummyItems = [
        { name: "Paneer Tikka", description: "Spicy grilled cottage cheese", price: 250, image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8", category: "Veg", rating: 4.5 },
        { name: "Chicken Biryani", description: "Aromatic basmati rice with chicken", price: 350, image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8", category: "Non-Veg", rating: 4.8 },
        { name: "Veg Burger", description: "Crispy veggie patty with cheese", price: 150, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd", category: "Veg", rating: 4.2 },
        { name: "Butter Chicken", description: "Creamy tomato curry with chicken", price: 320, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398", category: "Non-Veg", rating: 4.7 },
        { name: "Dal Makhani", description: "Black lentils cooked overnight", price: 200, image: "https://images.unsplash.com/photo-1546833999-b9f581602809", category: "Veg", rating: 4.6 }
    ];

    try {
        await Item.deleteMany();
        const createdItems = await Item.insertMany(dummyItems);
        res.status(201).json(createdItems);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Add new item
// @route   POST /api/items
// @access  Admin
const createItem = async (req, res) => {
    try {
        const itemData = req.body;
        if (req.file) {
            itemData.image = `/uploads/${req.file.filename}`;
        }
        const item = new Item(itemData);
        const createdItem = await item.save();
        res.status(201).json(createdItem);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// @desc    Update item
// @route   PUT /api/items/:id
// @access  Admin
const updateItem = async (req, res) => {
    try {
        const itemData = req.body;
        if (req.file) {
            itemData.image = `/uploads/${req.file.filename}`;
        }
        const item = await Item.findByIdAndUpdate(req.params.id, itemData, { new: true });
        if (item) {
            res.json(item);
        } else {
            res.status(404).json({ message: 'Item not found' });
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// @desc    Delete item
// @route   DELETE /api/items/:id
// @access  Admin
const deleteItem = async (req, res) => {
    try {
        const item = await Item.findByIdAndDelete(req.params.id);
        if (item) {
            res.json({ message: 'Item removed' });
        } else {
            res.status(404).json({ message: 'Item not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = { getItems, seedItems, createItem, updateItem, deleteItem };
