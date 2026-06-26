const express= require('express')
const router= express.Router();
const {registerUser,loginUser, verifyOtp}=require('../controllers/authController');

router.post('/register',registerUser);
router.post('/login',loginUser);
router.post('/verify_otp',verifyOtp);

module.exports=router; 
