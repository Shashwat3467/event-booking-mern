const express=require('express');
const router=express.Router();

const {protect,admin}=require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const otpLimit = rateLimit({ limit: 30, windowMs: 15 * 60 * 1000 });
const {bookEvent,sendBookingOTP,getMyBookings,confirmBooking,deleteBooking}=require('../controllers/bookingController')

router.post('/',protect,otpLimit,bookEvent);
router.post('/send-otp',protect,otpLimit,sendBookingOTP)
router.get('/my',protect,getMyBookings);
router.put('/:id/confirm',protect,admin,confirmBooking);
router.delete('/:id/delete',protect,deleteBooking)

module.exports=router;