const express = require('express');
const router = express.Router();
const { login, forgotPassword, resetPassword } = require('../controllers/authController');
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// TEMPORARY CLOUD SEED ROUTE
router.get('/seed-owner', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const User = require('../models/User');
  try {
    const exists = await User.findOne({role: 'OWNER'});
    if (exists) return res.json({message: 'Owner already exists'});
    const passwordHash = await bcrypt.hash('admin123', 12);
    await User.create({name:'Shop Owner',phone:'9999999999',email:'owner@velox.com',passwordHash,role:'OWNER',customerId:null});
    res.json({message: 'Owner created successfully!'});
  } catch(e) {
    res.json({error: e.message});
  }
});
module.exports = router;
