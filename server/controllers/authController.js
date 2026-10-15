const sendError = require('../utils/httpError');
const User = require('../models/User');
const { issueOTP, consumeOTP } = require('../utils/otp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (id,role) => {
    return jwt.sign(
        {id,role},
        process.env.JWT_SECRET,
        {expiresIn:'7d'})
}

exports.registerUser = async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Name, email and password are required' });
    }

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const salt=await bcrypt.genSalt(10);
        const hashedPassword=await bcrypt.hash(password,salt);
        const user=await User.create({ name, email, password: hashedPassword,role:'user',isVerified: false});

        try {
            await issueOTP(email, 'account_verification');
        } catch (error) {
            if (error.status === 502) error.message = 'Account created, but verification email could not be sent. Sign in to request another OTP.';
            throw error;
        }

        res.status(201).json({ message: 'User registered successfully. Please check your email for the verification OTP.', email: user.email });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
        let user= await User.findOne({email});
        if(!user){
            return res.status(401).json({error :'Invalid Credentials'});
        }

        const isMatch=await bcrypt.compare(password,user.password);
        if(!isMatch){
            return res.status(401).json({error:'Invalid Credentials'})
        }

        if(!user.isVerified && user.role==='user'){
            await issueOTP(email, 'account_verification');

            return res.status(403).json({message:'Account not verified. Please check your email for the verification OTP.'})
        }

       res.json({
        message:'Login successful',
        _id:user._id,
        name:user.name,
        email:user.email,
        role:user.role,
        token:generateToken(user._id,user.role)
       })
    } catch (error) {
        return sendError(res, error);
    }
};

exports.verifyOtp=async(req,res)=>{
    const {email,otp}=req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ message: 'Email and a six-digit OTP are required' });
    }

    try {
        await consumeOTP(email, otp, 'account_verification');

        const user=await User.findOneAndUpdate(
            {email},
            {$set:{isVerified:true}},
            { returnDocument: 'after' });
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            message:'Account verified successfully.You can log in now',
            _id:user._id,
            name:user.name,
            email:user.email,
            role:user.role,
            token:generateToken(user._id,user.role)
        });
    } catch (error) {
        return sendError(res, error);
    }
}
