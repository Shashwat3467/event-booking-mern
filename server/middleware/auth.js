const jwt=require('jsonwebtoken');
const User=require('../models/User');


//user logged in or not
const protect= async (req,res,next)=>{
    let token = null;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }
    if(token){
        try{
            //token getting stored in decoded
            const decoded=jwt.verify(token,process.env.JWT_SECRET);
            req.user=await User.findById(decoded.id).select('-password');
            if(!req.user){
                return res.status(401).json({message:'Not authorized, user not found'});
            }
            next();
        }  
        catch(error)
        {
            return res.status(401).json({message:'Not authorized, token failed'});
        }
    }
    else
    {
        return res.status(401).json({message:'Not authorized, no token'});
    }
}


const admin = (req,res,next)=>{
    if(req.user && req.user.role === 'admin'){
        next();
    }
    else {
        return res.status(403).json({message:'Not authorized as an admin'});
    }
}


module.exports={protect,admin};