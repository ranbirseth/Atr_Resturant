/**
 * Migration Script: Update existing orders to new status system
 * 
 * This script:
 * 1. Maps old statuses to new ones
 * 2. Generates orderId for existing orders
 * 3. Updates all orders in database
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const { generateOrderId } = require('../utils/orderIdGenerator');

// Status mapping from old to new
const STATUS_MAP = {
    'Pending': 'PLACED',
    'Accepted': 'ACCEPTED',
    'Preparing': 'ACCEPTED', // Kitchen workflow state -> order state
    'Ready': 'ACCEPTED',     // Kitchen workflow state -> order state
    'ChangeRequested': 'CHANGED',
    'Updated': 'CHANGED',
    'Cancelled': 'CANCELLED',
    'Completed': 'COMPLETED'
};

async function migrateOrders() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant_pos';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find all orders without orderId
        const ordersToMigrate = await Order.find({
            $or: [
                { orderId: { $exists: false } },
                { orderId: null }
            ]
        }).sort({ createdAt: 1 });

        console.log(`📊 Found ${ordersToMigrate.length} orders to migrate`);

        if (ordersToMigrate.length === 0) {
            console.log('✅ No orders need migration');
            await mongoose.connection.close();
            return;
        }

        let migratedCount = 0;
        let errorCount = 0;

        for (const order of ordersToMigrate) {
            try {
                // Generate orderId if missing
                if (!order.orderId) {
                    order.orderId = await generateOrderId();
                }

                // Map old status to new status
                const oldStatus = order.status;
                const newStatus = STATUS_MAP[oldStatus] || oldStatus;

                if (oldStatus !== newStatus) {
                    console.log(`  🔄 Order ${order._id}: ${oldStatus} → ${newStatus}`);
                    order.status = newStatus;
                }

                await order.save();
                migratedCount++;

                // Log progress every 10 orders
                if (migratedCount % 10 === 0) {
                    console.log(`  ⏳ Migrated ${migratedCount}/${ordersToMigrate.length} orders...`);
                }
            } catch (error) {
                console.error(`  ❌ Error migrating order ${order._id}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n📈 Migration Summary:');
        console.log(`  ✅ Successfully migrated: ${migratedCount} orders`);
        console.log(`  ❌ Errors: ${errorCount} orders`);
        console.log(`  📊 Total processed: ${ordersToMigrate.length} orders`);

        // Close connection
        await mongoose.connection.close();
        console.log('\n✅ Migration completed and database connection closed');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
if (require.main === module) {
    console.log('🚀 Starting order status migration...\n');
    migrateOrders()
        .then(() => {
            console.log('\n✅ Migration script finished successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateOrders, STATUS_MAP };
