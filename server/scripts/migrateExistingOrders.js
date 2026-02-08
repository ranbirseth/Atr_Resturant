/**
 * Migration Script: Add sessionId to Existing Orders
 * 
 * This script updates all existing orders in the database that don't have a sessionId.
 * Each existing order gets a unique legacy sessionId to maintain backward compatibility.
 * 
 * Usage: node scripts/migrateExistingOrders.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Order = require('../models/Order');
const SessionManager = require('../utils/SessionManager');

// Load environment variables
dotenv.config();

const migrateOrders = async () => {
    try {
        console.log('🔄 Starting migration...');
        console.log('📡 Connecting to database...');

        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Connected to MongoDB');

        // Find all orders without sessionId
        const ordersWithoutSession = await Order.find({
            $or: [
                { sessionId: { $exists: false } },
                { sessionId: null },
                { sessionId: '' }
            ]
        });

        console.log(`📊 Found ${ordersWithoutSession.length} orders without sessionId`);

        if (ordersWithoutSession.length === 0) {
            console.log('✅ No orders to migrate. All orders have sessionId.');
            process.exit(0);
        }

        let migratedCount = 0;
        let errorCount = 0;

        // Update each order with a legacy sessionId
        for (const order of ordersWithoutSession) {
            try {
                const legacySessionId = SessionManager.generateLegacySessionId(order._id.toString());

                await Order.findByIdAndUpdate(order._id, {
                    $set: { sessionId: legacySessionId }
                });

                migratedCount++;

                if (migratedCount % 10 === 0) {
                    console.log(`⏳ Migrated ${migratedCount}/${ordersWithoutSession.length} orders...`);
                }
            } catch (error) {
                console.error(`❌ Error migrating order ${order._id}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n🎉 Migration completed!');
        console.log(`✅ Successfully migrated: ${migratedCount} orders`);
        if (errorCount > 0) {
            console.log(`⚠️  Errors encountered: ${errorCount} orders`);
        }

        // Verify migration
        const remainingOrders = await Order.countDocuments({
            $or: [
                { sessionId: { $exists: false } },
                { sessionId: null },
                { sessionId: '' }
            ]
        });

        if (remainingOrders === 0) {
            console.log('✅ Verification passed: All orders now have sessionId');
        } else {
            console.log(`⚠️  Warning: ${remainingOrders} orders still missing sessionId`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

// Run migration
migrateOrders();
