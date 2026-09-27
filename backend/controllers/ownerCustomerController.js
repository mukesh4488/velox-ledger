const Customer = require('../models/Customer');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bcrypt = require('bcryptjs');

const addCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, temporaryPassword } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    if (!name || !phone || !temporaryPassword) return res.status(400).json({ success: false, message: 'Name, phone, and temporary password are required' });
    if (temporaryPassword.length < 8) return res.status(400).json({ success: false, message: 'Temporary password must be at least 8 characters.' });
    if (temporaryPassword === phone || temporaryPassword === cleanEmail) return res.status(400).json({ success: false, message: 'Password cannot be the same as phone or email' });
    if (await User.findOne({ phone })) return res.status(400).json({ success: false, message: 'User with this phone already exists' });
    if (cleanEmail && await User.findOne({ email: cleanEmail })) return res.status(400).json({ success: false, message: 'User with this email already exists' });

    const customer = await Customer.create({ name: name.trim(), phone: String(phone).trim(), email: cleanEmail });
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await User.create({ name: customer.name, phone: customer.phone, email: customer.email, passwordHash, role: 'CUSTOMER', customerId: customer._id });
    res.status(201).json({ success: true, data: customer, credentials: { email: customer.email || null, phone: customer.phone, temporaryPassword } });
  } catch (error) { next(error); }
};

const getCustomers = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const query = { isActive: true };
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const customers = await Customer.find(query).sort({ createdAt: -1 });
    const txns = await Transaction.find({ customerId: { $in: customers.map(c => c._id) } });
    const totals = new Map();
    for (const t of txns) { const key = String(t.customerId); const v = totals.get(key) || { debt: 0, payment: 0 }; v[t.type === 'DEBT' ? 'debt' : 'payment'] += t.amount; totals.set(key, v); }
    const data = customers.map(c => { const v = totals.get(String(c._id)) || { debt: 0, payment: 0 }; const balance = v.debt - v.payment; return { ...c.toObject(), balance, isAdvance: balance < 0, totalDebt: v.debt, totalPayment: v.payment }; });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer || !customer.isActive) return res.status(404).json({ success: false, message: 'Customer not found' });
    const transactions = await Transaction.find({ customerId: customer._id });
    const totalDebt = transactions.filter(t => t.type === 'DEBT').reduce((s, t) => s + t.amount, 0);
    const totalPayment = transactions.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0);
    const balance = totalDebt - totalPayment;
    res.json({ success: true, data: { ...customer.toObject(), balance, isAdvance: balance < 0, totalDebt, totalPayment } });
  } catch (error) { next(error); }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    if (phone && await User.findOne({ phone, customerId: { $ne: customer._id } })) return res.status(400).json({ success: false, message: 'Phone already in use.' });
    if (cleanEmail && await User.findOne({ email: cleanEmail, customerId: { $ne: customer._id } })) return res.status(400).json({ success: false, message: 'Email already in use.' });
    customer.name = name?.trim() || customer.name; customer.phone = phone?.trim() || customer.phone; customer.email = cleanEmail ?? customer.email; await customer.save();
    await User.updateOne({ customerId: customer._id }, { name: customer.name, phone: customer.phone, email: customer.email });
    res.json({ success: true, data: customer });
  } catch (error) { next(error); }
};

const deactivateCustomer = async (req, res, next) => {
  try { const customer = await Customer.findById(req.params.id); if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' }); customer.isActive = false; await customer.save(); res.json({ success: true, message: 'Customer deactivated successfully' }); } catch (error) { next(error); }
};

const resetCustomerPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    const customer = await Customer.findById(req.params.id);
    if (!customer || !customer.isActive) return res.status(404).json({ success: false, message: 'Active customer not found.' });
    const user = await User.findOne({ customerId: customer._id });
    if (!user) return res.status(404).json({ success: false, message: 'Customer login account not found.' });
    user.passwordHash = await bcrypt.hash(password, 12); user.resetPasswordTokenHash = null; user.resetPasswordExpiresAt = null; await user.save();
    res.json({ success: true, message: 'Customer password reset successfully.', credentials: { phone: customer.phone, email: customer.email || null, temporaryPassword: password } });
  } catch (error) { next(error); }
};

const makeVapiCall = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (!process.env.VAPI_PRIVATE_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
      return res.status(400).json({ success: false, message: 'VAPI configuration is missing in the backend.' });
    }

    let phone = customer.phone;
    if (!phone.startsWith('+')) phone = '+91' + phone; // Default to India if no country code

    const balance = Math.abs(customer.balance || 0);
    const balanceStr = `₹${balance}`;

    const axios = require('axios');
    const response = await axios.post('https://api.vapi.ai/call/phone', {
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phone },
      assistant: {
        firstMessage: `Hello ${customer.name}, this is the AI assistant from Velox Ledger. You currently have an outstanding balance of ${balanceStr}. Could you let me know when you might be able to settle this?`,
        model: {
          provider: "openai",
          model: "gpt-3.5-turbo",
          messages: [{
            role: "system",
            content: `You are an extremely polite AI assistant working for a store that uses Velox Ledger. You are calling a customer named ${customer.name}. Their current due balance is ${balanceStr}. Ask them when they can pay. Do not negotiate the amount. Keep the conversation short and professional.`
          }]
        },
        voice: { provider: "11labs", voiceId: "burt" }
      }
    }, {
      headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' }
    });

    res.json({ success: true, message: 'AI Agent is calling the customer now!', data: response.data });
  } catch (error) {
    console.error('Vapi Call Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data?.message || 'Failed to trigger AI call.' });
  }
};

module.exports = { addCustomer, getCustomers, getCustomerById, updateCustomer, deactivateCustomer, resetCustomerPassword, makeVapiCall };
