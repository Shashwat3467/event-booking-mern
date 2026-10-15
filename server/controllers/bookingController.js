const sendError = require('../utils/httpError');
const mongoose = require('mongoose');
const Booking = require('../models/Bookings');
const Event = require('../models/Event');
const User = require('../models/User');
const { issueOTP, consumeOTP } = require('../utils/otp');
const appError = require('../utils/appError');
const { sendBookingEmail } = require('../utils/email');

exports.sendBookingOTP = async (req, res) => {
    try {
        await issueOTP(req.user.email, 'event_booking');
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body || {};
        if (!mongoose.isObjectIdOrHexString(eventId) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ message: 'A valid event ID and six-digit OTP are required' });
        }

        await consumeOTP(req.user.email, otp, 'event_booking');
        const booking = await mongoose.connection.transaction(async session => {
            // All booking creations for one user contend on this document. A retried
            // transaction then sees any active booking created by the winning request.
            const locked = await User.updateOne({ _id: req.user.id }, { $inc: { bookingVersion: 1 } }, { session });
            if (!locked.matchedCount) throw appError(404, 'User not found');
            const event = await Event.findById(eventId).session(session);
            if (!event) throw appError(404, 'Event not found');
            if (event.availableSeats <= 0) throw appError(409, 'No seats available');
            const existing = await Booking.findOne({ userId: req.user.id, eventId, status: { $in: ['pending', 'confirmed'] } }).session(session);
            if (existing) throw appError(409, 'Already booked or pending');
            const [created] = await Booking.create([{
                userId: req.user.id, eventId, status: 'pending', paymentStatus: 'not_paid', amount: event.ticketPrice,
            }], { session });
            return created;
        });

        res.status(201).json({ message: 'Booking request submitted', booking });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body || {};
        if (paymentStatus !== undefined && !['paid', 'not_paid'].includes(paymentStatus)) {
            return res.status(400).json({ message: 'Invalid payment status' });
        } // 'paid' or 'not_paid'
        const booking = await mongoose.connection.transaction(async session => {
            const current = await Booking.findById(req.params.id).session(session).populate('userId', 'name email').populate('eventId');
            if (!current) throw appError(404, 'Booking not found');
            if (current.status !== 'pending') throw appError(409, 'Only pending bookings can be confirmed');
            if (!current.eventId || !current.userId) throw appError(404, 'Booking event or user not found');
            const reserved = await Event.findOneAndUpdate({ _id: current.eventId._id, availableSeats: { $gt: 0 } },
                { $inc: { availableSeats: -1 } }, { session, returnDocument: 'after' });
            if (!reserved) throw appError(409, 'No seats available to confirm this booking');
            current.status = 'confirmed';
            if (paymentStatus !== undefined) current.paymentStatus = paymentStatus;
            await current.save({ session });
            return current;
        });

        // Send email on admin confirmation
        try {
            await sendBookingEmail(booking.userId.email, booking.userId.name, booking.eventId.title);
        } catch (error) {
            return res.json({ message: 'Booking confirmed, but confirmation email could not be sent', booking, emailSent: false });
        }

        res.json({ message: 'Booking confirmed successfully', booking });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 })
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        return sendError(res, error);
    }
};

exports.deleteBooking = async (req, res) => {
    try {
        await mongoose.connection.transaction(async session => {
            const booking = await Booking.findById(req.params.id).session(session);
            if (!booking) throw appError(404, 'Booking not found');
            if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') throw appError(403, 'Not authorized');
            if (booking.status === 'cancelled') throw appError(409, 'Already cancelled');
            const wasConfirmed = booking.status === 'confirmed';
            booking.status = 'cancelled';
            await booking.save({ session });
            if (wasConfirmed) {
                await Event.updateOne({ _id: booking.eventId }, { $inc: { availableSeats: 1 } }, { session });
            }
        });

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        return sendError(res, error);
    }
};
