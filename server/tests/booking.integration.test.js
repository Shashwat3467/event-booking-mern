const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Opt-in only: never read MONGO_URL or reuse the application's database.
test('MongoDB booking transactions under concurrent requests', { skip: !process.env.TEST_MONGO_URL }, async t => {
    const mongoose = require('mongoose');
    const Booking = require('../models/Bookings');
    const User = require('../models/User');
    const Event = require('../models/Event');
    const dbName = `eventer_test_${Date.now()}_${process.pid}`;
    await mongoose.connect(process.env.TEST_MONGO_URL, { dbName, serverSelectionTimeoutMS: 5000 });
    try {
        await Promise.all([User.init(), Event.init(), Booking.init()]);
        const module = { exports: {} };
        const filename = path.join(__dirname, '../controllers/bookingController.js');
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
            module, exports: module.exports, console,
            require(name) {
                if (name === '../utils/email') return { sendBookingEmail: async () => {} };
                if (name === '../utils/otp') return { consumeOTP: async () => {} };
                return require(require.resolve(name, { paths: [path.dirname(filename)] }));
            },
        });
        const controller = module.exports;
        const user = await User.create({ name: 'Test', email: 'booking@example.com', password: 'test-hash', isVerified: true });
        async function fixture() {
            const event = await Event.create({ title: 'Test', description: 'Test event', date: new Date(), location: 'Test', category: 'Test', totalSeats: 1, availableSeats: 1, ticketPrice: 10, imageUrl: 'https://example.com/test.png', createdBy: user._id });
            const bookings = await Booking.create([1, 2].map(() => ({ userId: user._id, eventId: event._id, amount: 10 })));
            return { event, bookings };
        }
        async function call(handler, booking) {
            const res = { code: 200, status(code) { this.code = code; return this; }, set() {}, json(body) { this.body = body; return this; } };
            await controller[handler]({ params: { id: String(booking._id) }, body: {}, user: { id: String(user._id), role: 'admin' } }, res);
            return res;
        }
        await t.test('two confirmations for the last seat produce exactly one winner', async () => {
            const { event, bookings } = await fixture();
            const results = await Promise.all(bookings.map(booking => call('confirmBooking', booking)));
            assert.deepEqual(results.map(result => result.code).sort(), [200, 409]);
            assert.equal((await Event.findById(event._id)).availableSeats, 0);
            assert.equal(await Booking.countDocuments({ eventId: event._id, status: 'confirmed' }), 1);
        });
        await t.test('repeating confirmation and cancellation changes the count once each', async () => {
            const { event, bookings: [booking] } = await fixture();
            const confirmed = await Promise.all([1, 2].map(() => call('confirmBooking', booking)));
            assert.deepEqual(confirmed.map(result => result.code).sort(), [200, 409]);
            const cancelled = await Promise.all([1, 2].map(() => call('deleteBooking', booking)));
            assert.deepEqual(cancelled.map(result => result.code).sort(), [200, 409]);
            assert.equal((await Event.findById(event._id)).availableSeats, 1);
        });
        await t.test('a booking save failure rolls back the seat decrement', async () => {
            const { event, bookings: [booking] } = await fixture();
            const save = Booking.prototype.save;
            Booking.prototype.save = async function () { throw new Error('Simulated write failure'); };
            try {
                assert.equal((await call('confirmBooking', booking)).code, 500);
            } finally {
                Booking.prototype.save = save;
            }
            assert.equal((await Event.findById(event._id)).availableSeats, 1);
            assert.equal((await Booking.findById(booking._id)).status, 'pending');
        });
        await t.test('confirmation racing cancellation leaves a cancelled booking and its seat restored', async () => {
            const { event, bookings: [booking] } = await fixture();
            const results = await Promise.all([call('confirmBooking', booking), call('deleteBooking', booking)]);
            assert.ok(results.every(result => [200, 409].includes(result.code)));
            assert.equal((await Booking.findById(booking._id)).status, 'cancelled');
            assert.equal((await Event.findById(event._id)).availableSeats, 1);
        });
        await t.test('concurrent booking requests for one user create only one active booking', async () => {
            const { event, bookings } = await fixture();
            await Booking.deleteMany({ _id: { $in: bookings.map(booking => booking._id) } });
            const submit = async () => {
                const res = { code: 200, status(code) { this.code = code; return this; }, set() {}, json() { return this; } };
                await controller.bookEvent({ body: { eventId: String(event._id), otp: '123456' }, user: { id: String(user._id), email: user.email } }, res);
                return res.code;
            };
            assert.deepEqual((await Promise.all([submit(), submit()])).sort(), [201, 409]);
            assert.equal(await Booking.countDocuments({ eventId: event._id, status: 'pending' }), 1);
            assert.equal((await Event.findById(event._id)).availableSeats, 1);
        });
    } finally {
        if (mongoose.connection.name === dbName && dbName.startsWith('eventer_test_')) await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }
});
