const { randomInt, createHash, createHmac, timingSafeEqual } = require('node:crypto');
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('./email');
const appError = require('./appError');

const LIFETIME_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const keyFor = (email, action) => createHash('sha256').update(`${action}:${email}`).digest('hex');
const hashFor = (key, code) => createHmac('sha256', process.env.JWT_SECRET).update(`${key}:${code}`).digest('hex');

async function issueOTP(email, action) {
    const key = keyFor(email, action);
    const code = randomInt(100000, 1000000).toString();
    const otpHash = hashFor(key, code);
    const now = new Date();
    try {
        // The fixed primary key makes concurrent resends compete for one document.
        await OTP.findOneAndUpdate({ _id: key, createdAt: { $lte: new Date(now - COOLDOWN_MS) } }, {
            $set: { email, action, otpHash, attempts: 0, consumed: false, createdAt: now },
        }, { upsert: true, returnDocument: 'after', runValidators: true });
    } catch (error) {
        if (error.code === 11000) throw appError(429, 'Please wait 60 seconds before requesting another OTP', 60);
        throw error;
    }
    try {
        await sendOTPEmail(email, code, action);
    } catch (error) {
        await OTP.deleteOne({ _id: key, otpHash });
        throw error;
    }
}

async function consumeOTP(email, code, action) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw appError(400, 'A six-digit OTP is required');
    const key = keyFor(email, action);
    const cutoff = new Date(Date.now() - LIFETIME_MS);
    // Reserve an attempt atomically, including when requests arrive simultaneously.
    const record = await OTP.findOneAndUpdate({
        _id: key, createdAt: { $gt: cutoff }, consumed: false, attempts: { $lt: MAX_ATTEMPTS },
    }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!record) {
        const current = await OTP.findById(key);
        if (current && !current.consumed && current.createdAt > cutoff && current.attempts >= MAX_ATTEMPTS) {
            throw appError(429, 'Too many OTP attempts. Request a new code after the resend cooldown.', 60);
        }
        throw appError(400, 'Invalid or expired OTP');
    }
    const expected = Buffer.from(record.otpHash, 'hex');
    const supplied = Buffer.from(hashFor(key, code), 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        throw appError(record.attempts >= MAX_ATTEMPTS ? 429 : 400,
            record.attempts >= MAX_ATTEMPTS ? 'Too many OTP attempts. Request a new code after the resend cooldown.' : 'Invalid or expired OTP',
            record.attempts >= MAX_ATTEMPTS ? 60 : undefined);
    }
    const consumed = await OTP.findOneAndUpdate({
        _id: key, otpHash: record.otpHash, createdAt: record.createdAt, consumed: false,
    }, { $set: { consumed: true } }, { returnDocument: 'after' });
    if (!consumed) throw appError(400, 'Invalid or expired OTP');
}

module.exports = { issueOTP, consumeOTP };
