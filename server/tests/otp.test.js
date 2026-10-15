const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const appError = require('../utils/appError');
const rateLimit = require('../middleware/rateLimit');

function fixture({ failEmail = false } = {}) {
    let record;
    let code;
    let sequence = 234560;
    const clone = value => value ? structuredClone(value) : null;
    const model = {
        async findOneAndUpdate(query, update, options = {}) {
            const matches = record && record._id === query._id &&
                (!query.createdAt || (query.createdAt.$lte ? record.createdAt <= query.createdAt.$lte :
                    query.createdAt.$gt ? record.createdAt > query.createdAt.$gt : +record.createdAt === +query.createdAt)) &&
                (query.consumed === undefined || record.consumed === query.consumed) &&
                (!query.attempts || record.attempts < query.attempts.$lt) &&
                (!query.otpHash || record.otpHash === query.otpHash);
            if (!matches && !options.upsert) return null;
            if (!matches && record && options.upsert) throw Object.assign(new Error(), { code: 11000 });
            if (!record) record = { _id: query._id };
            if (update.$set) Object.assign(record, update.$set);
            if (update.$inc) record.attempts += update.$inc.attempts;
            return clone(record);
        },
        async findById() { return clone(record); },
        async deleteOne(query) { if (record?.otpHash === query.otpHash) record = undefined; },
    };
    const module = { exports: {} };
    vm.runInNewContext(readFileSync(path.join(__dirname, '../utils/otp.js'), 'utf8'), {
        module, Buffer, Date,
        process: { env: { JWT_SECRET: 'isolated-test-secret' } },
        require(name) {
            if (name === 'node:crypto') return { ...require('node:crypto'), randomInt: () => ++sequence };
            if (name === '../models/OTP') return model;
            if (name === './appError') return appError;
            if (name === './email') return { sendOTPEmail: async (email, value) => {
                code = value;
                if (failEmail) throw appError(502, 'Email unavailable');
            } };
            return require(name);
        },
    });
    return { ...module.exports, record: () => record, code: () => code };
}

test('OTP stores a hash, accepts the correct code once, and keeps resend cooldown after use', async () => {
    const f = fixture();
    await f.issueOTP('test@example.com', 'account_verification');
    assert.match(f.code(), /^\d{6}$/);
    assert.notEqual(f.record().otpHash, f.code());
    await f.consumeOTP('test@example.com', f.code(), 'account_verification');
    await assert.rejects(f.consumeOTP('test@example.com', f.code(), 'account_verification'), { status: 400 });
    await assert.rejects(f.issueOTP('test@example.com', 'account_verification'), { status: 429 });
});

test('explicit expiry rejects a record still waiting for MongoDB TTL deletion', async () => {
    const f = fixture();
    await f.issueOTP('test@example.com', 'event_booking');
    f.record().createdAt = new Date(Date.now() - 301000);
    await assert.rejects(f.consumeOTP('test@example.com', f.code(), 'event_booking'), { status: 400 });
});

test('simultaneous guesses cannot exceed five attempts or use the correct code after lockout', async () => {
    const f = fixture();
    await f.issueOTP('test@example.com', 'event_booking');
    const wrong = f.code() === '100000' ? '100001' : '100000';
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.consumeOTP('test@example.com', wrong, 'event_booking')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 0);
    assert.equal(f.record().attempts, 5);
    await assert.rejects(f.consumeOTP('test@example.com', f.code(), 'event_booking'), { status: 429 });
});

test('simultaneous valid submissions consume a code only once', async () => {
    const f = fixture();
    await f.issueOTP('test@example.com', 'event_booking');
    const results = await Promise.allSettled([1, 2].map(() => f.consumeOTP('test@example.com', f.code(), 'event_booking')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('concurrent resends are limited and replacing a challenge invalidates the earlier code', async () => {
    const f = fixture();
    const results = await Promise.allSettled([1, 2].map(() => f.issueOTP('test@example.com', 'event_booking')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const oldCode = f.code();
    f.record().createdAt = new Date(Date.now() - 61000);
    await f.issueOTP('test@example.com', 'event_booking');
    assert.equal(f.record().attempts, 0);
    assert.equal(f.record().consumed, false);
    assert.ok(f.record().createdAt > new Date(Date.now() - 1000));
    await assert.rejects(f.consumeOTP('test@example.com', oldCode, 'event_booking'), { status: 400 });
    await f.consumeOTP('test@example.com', f.code(), 'event_booking');
});

test('email outage propagates and removes the undelivered challenge', async () => {
    const f = fixture({ failEmail: true });
    await assert.rejects(f.issueOTP('test@example.com', 'event_booking'), { status: 502 });
    assert.equal(f.record(), undefined);
});

test('IP rate limiter blocks excess requests and permits them after window expiry', () => {
    let time = 0;
    const limit = rateLimit({ limit: 2, windowMs: 1000, now: () => time });
    let accepted = 0;
    const res = { set() {}, status(code) { this.code = code; return this; }, json() {} };
    for (let i = 0; i < 3; i++) limit({ ip: '127.0.0.1' }, res, () => accepted++);
    assert.equal(accepted, 2);
    assert.equal(res.code, 429);
    time = 1000;
    limit({ ip: '127.0.0.1' }, res, () => accepted++);
    assert.equal(accepted, 3);
});
