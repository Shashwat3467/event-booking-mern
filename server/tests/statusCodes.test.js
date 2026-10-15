const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const sendError = require('../utils/httpError');

function load(file, mocks) {
    mocks = { '../utils/otp': { issueOTP: async () => {} }, '../utils/email': { sendBookingEmail: async () => {} }, ...mocks };
    const module = { exports: {} };
    const filename = path.join(__dirname, '..', file);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, process, console,
        require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(require.resolve(name, { paths: [path.dirname(filename)] })),
    }, { filename });
    return module.exports;
}

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('error classification keeps invalid data, conflicts and outages distinct', () => {
    for (const [error, expected] of [
        [{ name: 'CastError' }, 400], [{ name: 'ValidationError' }, 400],
        [{ code: 11000 }, 409], [{ status: 502, message: 'Email unavailable' }, 502],
        [new Error('database credentials must not leak'), 500],
    ]) {
        const res = response();
        sendError(res, error);
        assert.equal(res.statusCode, expected);
        assert.ok(!JSON.stringify(res.body).includes('credentials'));
    }
});

test('login distinguishes missing input, invalid credentials, verification and database failure', async () => {
    for (const [body, user, expected] of [
        [{}, null, 400],
        [{ email: 'a@b.com', password: 'secret' }, null, 401],
        [{ email: 'a@b.com', password: 'secret' }, { password: 'hash', role: 'user', isVerified: false }, 403],
        [{ email: 'a@b.com', password: 'secret' }, new Error('DB down'), 500],
    ]) {
        const auth = load('controllers/authController.js', {
            '../models/User': { findOne: async () => { if (user instanceof Error) throw user; return user; } },
            '../utils/otp': { issueOTP: async () => {} },
            bcryptjs: { compare: async () => true },
            '../utils/email': { sendOTPEmail: async () => {} },
        });
        const res = response();
        await auth.loginUser({ body }, res);
        assert.equal(res.statusCode, expected);
    }
});

test('duplicate registration returns 409', async () => {
    const auth = load('controllers/authController.js', { '../models/User': { findOne: async () => ({}) } });
    const res = response();
    await auth.registerUser({ body: { name: 'Test', email: 'a@b.com', password: 'secret' } }, res);
    assert.equal(res.statusCode, 409);
});

test('middleware preserves 500 for database failures and 401 for invalid tokens', async () => {
    for (const [jwtError, expected] of [[null, 500], [{ name: 'JsonWebTokenError' }, 401]]) {
        const { protect } = load('middleware/auth.js', {
            jsonwebtoken: { verify: () => { if (jwtError) throw jwtError; return { id: 'abc' }; } },
            '../models/User': { findById: () => ({ select: async () => { throw new Error('DB down'); } }) },
        });
        const res = response();
        await protect({ headers: { authorization: 'Bearer token' } }, res, () => assert.fail('must not authenticate'));
        assert.equal(res.statusCode, expected);
    }
});

test('booking validates payment status and rejects cancelled confirmation', async () => {
    const controller = load('controllers/bookingController.js', {
        mongoose: { connection: { transaction: async work => work({}) } },
        '../models/Bookings': { findById: () => ({ session: () => ({ populate: () => ({ populate: async () => ({ status: 'cancelled' }) }) }) }) },
    });
    for (const [body, expected] of [[{ paymentStatus: 'invalid' }, 400], [{}, 409]]) {
        const res = response();
        await controller.confirmBooking({ body, params: { id: 'test' } }, res);
        assert.equal(res.statusCode, expected);
    }
});

test('OTP email failures return 502 instead of success', async () => {
    const controller = load('controllers/bookingController.js', {
        '../utils/otp': { issueOTP: async () => { throw Object.assign(new Error('Email unavailable'), { status: 502 }); } },
    });
    const res = response();
    await controller.sendBookingOTP({ user: { email: 'a@b.com' } }, res);
    assert.equal(res.statusCode, 502);
});

test('a committed confirmation stays successful when its notification fails', async () => {
    let seatsSaved = false;
    const booking = {
        status: 'pending', userId: { email: 'a@b.com', name: 'Test' },
        eventId: { _id: 'event', title: 'Event' }, save: async () => {},
    };
    const controller = load('controllers/bookingController.js', {
        mongoose: { connection: { transaction: async work => work({}) } },
        '../models/Bookings': { findById: () => ({ session: () => ({ populate: () => ({ populate: async () => booking }) }) }) },
        '../models/Event': { findOneAndUpdate: async () => { seatsSaved = true; return {}; } },
        '../utils/email': { sendBookingEmail: async () => { throw new Error('Email unavailable'); } },
    });
    const res = response();
    await controller.confirmBooking({ body: {}, params: { id: 'booking' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.booking.status, 'confirmed');
    assert.equal(res.body.emailSent, false);
    assert.equal(seatsSaved, true);
});

test('event endpoints return 400 for malformed IDs and validation errors, 404 for absent events', async () => {
    const Event = require('../models/Event');
    const controller = load('controllers/eventController.js', {
        '../models/Event': {
            findById: async id => {
                if (id === 'bad') throw Object.assign(new Error(), { name: 'CastError' });
                return null;
            },
            create: async data => { await new Event(data).validate(); },
        },
    });
    for (const [id, status] of [['bad', 400], ['507f1f77bcf86cd799439011', 404]]) {
        const res = response();
        await controller.getEventById({ params: { id } }, res);
        assert.equal(res.statusCode, status);
    }
    const res = response();
    await controller.createEvent({ body: {}, user: { _id: '507f1f77bcf86cd799439011' } }, res);
    assert.equal(res.statusCode, 400);
});

test('capacity edits preserve confirmed seats and reject reductions below bookings', async () => {
    for (const [totalSeats, expected, available] of [[12, 200, 7], [4, 400, 5]]) {
        const current = { totalSeats: 10, availableSeats: 5, save: async () => {} };
        const controller = load('controllers/eventController.js', {
            mongoose: { connection: { transaction: async work => work({}) } },
            '../models/Event': { findById: () => ({ session: async () => current }) },
        });
        const res = response();
        await controller.updateEvent({ params: { id: 'event' }, body: { totalSeats } }, res);
        assert.equal(res.statusCode, expected);
        assert.equal(current.availableSeats, available);
    }
});

test('cancellation enforces ownership and restores seats only for a confirmed booking', async () => {
    for (const [status, owner, expected, restores] of [
        ['pending', 'user', 200, 0], ['confirmed', 'user', 200, 1],
        ['cancelled', 'user', 409, 0], ['confirmed', 'other-user', 403, 0],
    ]) {
        let restored = 0;
        const controller = load('controllers/bookingController.js', {
            mongoose: { connection: { transaction: async work => work({}) } },
            '../models/Bookings': { findById: () => ({ session: async () => ({ status, userId: owner, eventId: 'event', save: async () => {} }) }) },
            '../models/Event': { updateOne: async () => { restored++; } },
        });
        const res = response();
        await controller.deleteBooking({ params: { id: 'booking' }, user: { id: 'user', role: 'user' } }, res);
        assert.equal(res.statusCode, expected);
        assert.equal(restored, restores);
    }
});
