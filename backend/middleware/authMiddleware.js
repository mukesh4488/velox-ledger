const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ success:false, message:'Not authorized, no token' });
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-passwordHash -resetPasswordTokenHash -resetPasswordExpiresAt');
    if (!req.user) return res.status(401).json({ success:false, message:'Not authorized, user not found' });
    next();
  } catch (error) { return res.status(401).json({ success:false, message:'Not authorized, token failed' }); }
};
const ownerOnly=(req,res,next)=>req.user?.role==='OWNER'?next():res.status(403).json({success:false,message:'Not authorized as an owner'});
const customerOnly=(req,res,next)=>req.user?.role==='CUSTOMER'?next():res.status(403).json({success:false,message:'Not authorized as a customer'});
module.exports={protect,ownerOnly,customerOnly};
