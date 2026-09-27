const express = require('express');
const router = express.Router();
const { protect, customerOnly } = require('../middleware/authMiddleware');
const { getCustomerDashboard } = require('../controllers/customerDashboardController');

// All routes here are protected and customer-only
router.use(protect, customerOnly);

// Customer endpoints
router.get('/dashboard', getCustomerDashboard);

module.exports = router;
