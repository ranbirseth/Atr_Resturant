const Item = require('../models/Item');
const Category = require('../models/Category');
const {
    validateItemInput,
    normalizeAudience,
    categoryKey,
} = require('../utils/menuUtils');

// Resolve a category name against the existing Category collection using a
// case/whitespace-insensitive match. Returns the canonical stored name, or
// null when no category matches.
async function resolveCategoryName(name) {
    const categories = await Category.find({}, 'name');
    const match = categories.find((category) => categoryKey(category.name) === categoryKey(name));
    return match ? match.name : null;
}

// @desc    Get all items
// @route   GET /api/items?audience=customer|staff
// @access  Public
// customer (default): bare array, never exposes staff-only fields.
// staff: includes staffPrice / availableForStaff (NOT an auth boundary).
const getItems = async (req, res) => {
    try {
        const audience = normalizeAudience(req.query.audience);
        const projection = audience === 'STAFF' ? {} : { staffPrice: 0, availableForStaff: 0 };
        const items = await Item.find({}, projection);
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const seedItems = async (req, res) => {
    const dummyItems = [
        { name: "Paneer Tikka", description: "Spicy grilled cottage cheese", price: 250, staffPrice: 250, image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8", category: "Veg", rating: 4.5 },
        { name: "Chicken Biryani", description: "Aromatic basmati rice with chicken", price: 350, staffPrice: 350, image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8", category: "Non-Veg", rating: 4.8 },
        { name: "Veg Burger", description: "Crispy veggie patty with cheese", price: 150, staffPrice: 150, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd", category: "Veg", rating: 4.2 },
        { name: "Butter Chicken", description: "Creamy tomato curry with chicken", price: 320, staffPrice: 320, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398", category: "Non-Veg", rating: 4.7 },
        { name: "Dal Makhani", description: "Black lentils cooked overnight", price: 200, staffPrice: 200, image: "https://images.unsplash.com/photo-1546833999-b9f581602809", category: "Veg", rating: 4.6 }
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
        const { value, errors } = validateItemInput(req.body, { partial: false });
        if (req.file) {
            value.image = `/uploads/${req.file.filename}`;
        }
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        const canonicalCategory = await resolveCategoryName(value.category);
        if (!canonicalCategory) {
            return res.status(400).json({
                message: `Category "${value.category}" does not exist. Create the category first.`,
            });
        }
        value.category = canonicalCategory;

        const item = new Item(value);
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
        const existing = await Item.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const { value, errors } = validateItemInput(req.body, { partial: true });
        if (req.file) {
            value.image = `/uploads/${req.file.filename}`;
        }
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        // Only validate the category against the collection when it actually
        // changes, so legacy items can still have unrelated fields updated even
        // if their category string is not (yet) a Category document.
        if (value.category !== undefined) {
            if (categoryKey(value.category) !== categoryKey(existing.category)) {
                const canonicalCategory = await resolveCategoryName(value.category);
                if (!canonicalCategory) {
                    return res.status(400).json({
                        message: `Category "${value.category}" does not exist. Create the category first.`,
                    });
                }
                value.category = canonicalCategory;
            } else {
                value.category = existing.category;
            }
        }

        const item = await Item.findByIdAndUpdate(req.params.id, { $set: value }, { new: true });
        res.json(item);
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
