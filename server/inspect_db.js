const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Order = require('./models/Order');

const inspect = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('--- DB INSPECTION START ---');

        const allUsers = await User.find({});
        console.log(`Total Users: ${allUsers.length}`);

        const allOrders = await Order.find({});
        console.log(`Total Orders: ${allOrders.length}`);

        if (allOrders.length > 0) {
            console.log('\n--- Sample Order Analysis ---');
            allOrders.slice(0, 5).forEach((order, i) => {
                console.log(`Order ${i}: _id=${order._id}, userId=${order.userId} (type: ${typeof order.userId})`);
            });
        }

        console.log('\n--- Linkage Check ---');
        for (const user of allUsers) {
            const matches = allOrders.filter(o => o.userId.toString() === user._id.toString());
            console.log(`User: ${user.name} (${user._id}) -> Found ${matches.length} direct matches in memory`);
        }

        console.log('--- DB INSPECTION END ---');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

inspect();
