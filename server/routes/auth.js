const express= require('express')
const router= express.Router();
const rateLimit = require('../middleware/rateLimit');
router.use(rateLimit({ limit: 30, windowMs: 15 * 60 * 1000 }));
const {registerUser,loginUser, verifyOtp}=require('../controllers/authController');

router.post('/register',registerUser);
router.post('/login',loginUser);
router.post('/verify_otp',verifyOtp);

module.exports=router; 
