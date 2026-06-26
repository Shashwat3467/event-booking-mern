const express=require('express');
const router=express.Router();

const {protect,admin}=require('../middleware/auth');
const { verify } = require('jsonwebtoken');
const {bookEvent,sendBookingOTP,getMyBookings,confirmBooking,deleteBooking}=require('../controllers/bookingController')

router.post('/',protect,bookEvent);
router.post('/send-otp',protect,sendBookingOTP)
router.get('/my',protect,getMyBookings);
router.put('/:id/confirm',protect,admin,confirmBooking);
router.delete('/:id/delete',protect,deleteBooking)

module.exports=router;