const mongoose = require('mongoose');

const fruitSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    imageUrl: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Featured', 'Seasonal', 'DryFruits', 'FruitCandy', 'Other'],
        default: 'Other'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Fruit', fruitSchema); 