const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Order = require('./models/Order');

const debug = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Found ${users.length} users`);

        const orders = await Order.find({});
        console.log(`Found ${orders.length} orders`);

        if (orders.length > 0) {
            console.log('Sample Order userId:', orders[0].userId);
            console.log('Type of userId:', typeof orders[0].userId);
        }

        for (const user of users) {
            const count = await Order.countDocuments({ userId: user._id });
            console.log(`User: ${user.name} (${user._id}), Orders: ${count}`);

            // Try matching as string if 0
            if (count === 0) {
                const stringCount = await Order.countDocuments({ userId: user._id.toString() });
                if (stringCount > 0) {
                    console.log(`  -> Found ${stringCount} orders when matching as string!`);
                }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

debug();
