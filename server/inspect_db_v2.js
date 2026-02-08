const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Order = require('./models/Order');

const logPath = path.join(__dirname, 'inspection_log.txt');
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logPath, msg + '\n');
};

const inspect = async () => {
    try {
        if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

        await mongoose.connect(process.env.MONGO_URI);
        log('--- DB INSPECTION START ---');

        const allUsers = await User.find({});
        log(`Total Users: ${allUsers.length}`);

        const allOrders = await Order.find({});
        log(`Total Orders: ${allOrders.length}`);

        if (allOrders.length > 0) {
            log('\n--- Sample Order Analysis ---');
            allOrders.slice(0, 5).forEach((order, i) => {
                log(`Order ${i}: _id=${order._id}, userId=${order.userId} (type: ${typeof order.userId})`);
            });
        }

        log('\n--- Linkage Check ---');
        for (const user of allUsers) {
            const matches = allOrders.filter(o => o.userId && o.userId.toString() === user._id.toString());
            log(`User: ${user.name} (${user._id}) -> Found ${matches.length} matches`);
        }

        log('--- DB INSPECTION END ---');
        process.exit(0);
    } catch (error) {
        log('Error: ' + error.message);
        process.exit(1);
    }
};

inspect();
