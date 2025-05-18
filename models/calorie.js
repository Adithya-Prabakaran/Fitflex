const mongoose = require('mongoose');

const calorieSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    email: { type: String, required: true },
    bmr: { type: Number, required: true }, // Basal Metabolic Rate
    tdee: { type: Number, required: true }, // Total Daily Energy Expenditure
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Calorie', calorieSchema);
