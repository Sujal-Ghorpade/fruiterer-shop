const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const BASE_URL = process.env.BASE_URL;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving with proper caching
app.use(express.static('public', {
    maxAge: '1h',
    etag: true,
    lastModified: true
}));

// Session configuration with secure settings for production
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    },
    name: 'fruiterer-session'
}));

// MongoDB Connection with proper error handling
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Models
const Admin = require('./models/Admin');
const Fruit = require('./models/Fruit');

// Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session.adminId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Routes with proper error handling
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'products.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// API Routes with proper error handling
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const admin = await Admin.findOne({ email });
        
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.adminId = admin._id;
        res.json({ success: true, message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logout successful' });
    });
});

app.get('/api/fruits', async (req, res) => {
    try {
        const fruits = await Fruit.find().sort({ createdAt: -1 });
        res.json(fruits);
    } catch (error) {
        console.error('Get fruits error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/fruits/add', requireAuth, async (req, res) => {
    try {
        const { name, price, imageUrl, category } = req.body;
        
        if (!name || !price || !imageUrl || !category) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const fruit = new Fruit({
            name,
            price: parseFloat(price),
            imageUrl,
            category
        });
        await fruit.save();
        res.json({ success: true, fruit });
    } catch (error) {
        console.error('Add fruit error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/fruits/delete/:id', requireAuth, async (req, res) => {
    try {
        const fruit = await Fruit.findByIdAndDelete(req.params.id);
        if (!fruit) {
            return res.status(404).json({ error: 'Fruit not found' });
        }
        res.json({ success: true, message: 'Fruit deleted successfully' });
    } catch (error) {
        console.error('Delete fruit error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/fruits/update/:id', requireAuth, async (req, res) => {
    try {
        const { name, price, imageUrl, category } = req.body;
        
        if (!name || !price || !imageUrl || !category) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const fruit = await Fruit.findByIdAndUpdate(
            req.params.id,
            { name, price: parseFloat(price), imageUrl, category },
            { new: true, runValidators: true }
        );
        if (!fruit) {
            return res.status(404).json({ error: 'Fruit not found' });
        }
        res.json({ success: true, fruit });
    } catch (error) {
        console.error('Update fruit error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check endpoint for hosting platforms
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize default admin if none exists
async function initializeAdmin() {
    try {
        const adminExists = await Admin.findOne();
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD, 10);
            const admin = new Admin({
                email: process.env.DEFAULT_ADMIN_EMAIL,
                password: hashedPassword
            });
            await admin.save();
            console.log(`Default admin created: ${process.env.DEFAULT_ADMIN_EMAIL}`);
        }
    } catch (error) {
        console.error('Error initializing admin:', error);
    }
}

// Initialize sample fruits if none exist
async function initializeSampleFruits() {
    try {
        const fruitsExist = await Fruit.findOne();
        if (!fruitsExist) {
            const sampleFruits = [
                {
                    name: 'Fresh Strawberries',
                    price: 4.99,
                    imageUrl: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Featured'
                },
                {
                    name: 'Organic Bananas',
                    price: 2.49,
                    imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Featured'
                },
                {
                    name: 'Sweet Oranges',
                    price: 3.99,
                    imageUrl: 'https://images.unsplash.com/photo-1547514701-42782101795e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Juicy Apples',
                    price: 3.49,
                    imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Featured'
                },
                {
                    name: 'Fresh Blueberries',
                    price: 5.99,
                    imageUrl: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Ripe Mangoes',
                    price: 4.49,
                    imageUrl: 'https://images.unsplash.com/photo-1553279768-865429fa0078?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Fresh Pineapples',
                    price: 6.99,
                    imageUrl: 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Sweet Grapes',
                    price: 4.79,
                    imageUrl: 'https://images.unsplash.com/photo-1515589666096-d5c0b1865abd?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Other'
                },
                {
                    name: 'Fresh Lemons',
                    price: 2.99,
                    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Organic Pears',
                    price: 3.79,
                    imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Fresh Raspberries',
                    price: 6.49,
                    imageUrl: 'https://images.unsplash.com/photo-1515589666096-d5c0b1865abd?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                },
                {
                    name: 'Sweet Peaches',
                    price: 4.29,
                    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                    category: 'Seasonal'
                }
            ];

            for (const fruitData of sampleFruits) {
                const fruit = new Fruit(fruitData);
                await fruit.save();
            }
            console.log('Sample fruits added to database');
        }
    } catch (error) {
        console.error('Error initializing sample fruits:', error);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        mongoose.connection.close();
    });
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initializeAdmin();
    initializeSampleFruits();
}); 