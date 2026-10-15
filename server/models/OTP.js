const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    _id: { type: String },
    email: { type: String, required: true },
    otpHash: { type: String, required: true },
    action: { type: String, required: true, enum: ['account_verification', 'event_booking'] },
    attempts: { type: Number, default: 0 },
    consumed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 300 },
});

module.exports = mongoose.models.OTP || mongoose.model('OTP', otpSchema);
