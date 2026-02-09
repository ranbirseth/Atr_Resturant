const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminAuthRoutes = require('./routes/adminAuth');

dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

// Configure allowed origins for CORS
const allowedOrigins = [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    "http://localhost:5173",  // Local client
    "http://localhost:5174",   // Local admin
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "https://zink-zaika-client.vercel.app",
    "https://zink-zaika-admin.vercel.app"
].filter(Boolean); // Remove undefined values
console.log("pasing......")
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            console.log('Socket Origin:', origin);
            // Allow requests with no origin (like mobile apps, Postman, etc.)
            if (!origin) return callback(null, true);

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Allow Vercel and Render deployments as fallback
            if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
                return callback(null, true);
            }

            // Block all other origins
            callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

// Middleware to attach io to req
app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        console.log('Request Origin:', origin);
        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Normalize origin and check if it's localhost/127.0.0.1 on any port (for dev)
        const isLocalhost = origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:');

        if (allowedOrigins.includes(origin) || isLocalhost) {
            return callback(null, true);
        }

        // Allow Vercel and Render deployments as fallback
        if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
            return callback(null, true);
        }

        // Block all other origins
        console.error('CORS Blocked Origin:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());

const path = require('path');

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/feedback', require('./routes/feedbackRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/admin', adminAuthRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    server.listen(PORT, console.log(`Server running on port ${PORT}`));
}

module.exports = app;
