const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('./models/Order');

async function checkDeliveryOrders() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const orders = await Order.find({}).sort({ createdAt: -1 }).limit(5);

        console.log('\n📦 Last 5 Orders:');
        orders.forEach((order, idx) => {
            console.log(`\n${idx + 1}. Order ID: ${order._id}`);
            console.log(`   Order Type: ${order.orderType}`);
            console.log(`   Is Delivery: ${order.isDelivery}`);
            console.log(`   Delivery Address: ${order.deliveryAddress || 'N/A'}`);
            console.log(`   Table Number: ${order.tableNumber || 'N/A'}`);
            console.log(`   Created: ${order.createdAt}`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDeliveryOrders();
