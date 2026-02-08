require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../models/Item');
const Category = require('../models/Category');
const connectDB = require('../config/db');

const syncCategories = async () => {
    try {
        await connectDB();

        console.log('Fetching items...');
        const items = await Item.find({});

        if (items.length === 0) {
            console.log('No items found to sync categories from.');
            process.exit(0);
        }

        const categories = [...new Set(items.map(item => item.category))];
        console.log(`Found ${categories.length} unique categories:`, categories);

        let createdCount = 0;

        for (const catName of categories) {
            if (!catName) continue;

            // Check if category exists (case-insensitive check could be better but let's stick to exact match for now)
            const existing = await Category.findOne({ name: catName });

            if (!existing) {
                await Category.create({ name: catName, isVisible: true });
                console.log(`Created category: ${catName}`);
                createdCount++;
            } else {
                console.log(`Category already exists: ${catName}`);
            }
        }

        console.log(`Sync complete. Created ${createdCount} new categories.`);
        process.exit(0);
    } catch (error) {
        console.error('Error syncing categories:', error);
        process.exit(1);
    }
};

syncCategories();
