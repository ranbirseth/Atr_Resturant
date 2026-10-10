const Category = require('../models/Category');
const Item = require('../models/Item');
const { validateCategoryInput, categoryKey } = require('../utils/menuUtils');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
    try {
        const { value, errors } = validateCategoryInput(req.body, { partial: false });
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        const existing = await Category.find({}, 'name');
        if (existing.some((category) => categoryKey(category.name) === categoryKey(value.name))) {
            return res.status(400).json({ message: 'Category already exists' });
        }

        const category = await Category.create(value);
        res.status(201).json(category);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const { value, errors } = validateCategoryInput(req.body, { partial: true });
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors });
        }

        const oldName = category.name;
        let renamed = false;

        if (value.name !== undefined && categoryKey(value.name) !== categoryKey(oldName)) {
            const others = await Category.find({ _id: { $ne: category._id } }, 'name');
            if (others.some((other) => categoryKey(other.name) === categoryKey(value.name))) {
                return res.status(400).json({ message: 'Category already exists' });
            }
            category.name = value.name;
            renamed = true;
        } else if (value.name !== undefined) {
            // Case/whitespace-only change: keep canonical new spelling.
            category.name = value.name;
            renamed = true;
        }

        if (value.isVisible !== undefined) category.isVisible = value.isVisible;
        if (value.customerVisible !== undefined) category.customerVisible = value.customerVisible;
        if (value.staffVisible !== undefined) category.staffVisible = value.staffVisible;

        const updatedCategory = await category.save();

        // Cascade the rename to items so they don't disconnect. Match by the
        // normalized key to also catch case/whitespace variants.
        if (renamed) {
            const items = await Item.find({}, 'category');
            const ids = items
                .filter((item) => categoryKey(item.category) === categoryKey(oldName))
                .map((item) => item._id);
            if (ids.length > 0) {
                await Item.updateMany({ _id: { $in: ids } }, { $set: { category: updatedCategory.name } });
            }
        }

        res.json(updatedCategory);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Never silently delete or reassign items: block while any item
        // references this category (matched case/whitespace-insensitively).
        const items = await Item.find({}, 'category');
        const itemCount = items.filter(
            (item) => categoryKey(item.category) === categoryKey(category.name)
        ).length;

        if (itemCount > 0) {
            return res.status(400).json({
                message: `Cannot delete "${category.name}": ${itemCount} item(s) still use it. Reassign or delete those items first.`,
                itemCount,
            });
        }

        await category.deleteOne();
        res.json({ message: 'Category removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
