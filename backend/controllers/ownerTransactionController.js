const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const { sendTransactionReceiptEmail } = require('../utils/mailer');

const generateTxnId = async () => `TXN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

const addTransaction = async (req, res, next) => {
  try {
    const { customerId, type, amount, description } = req.body;
    const numericAmount = Number(amount);
    if (!customerId || !type || !Number.isFinite(numericAmount)) return res.status(400).json({ success: false, message: 'Customer, type, and amount are required' });
    if (numericAmount <= 0) return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
    if (!['DEBT', 'PAYMENT'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    const customer = await Customer.findById(customerId); if (!customer || !customer.isActive) return res.status(404).json({ success: false, message: 'Valid active customer not found' });
    const transaction = await Transaction.create({ transactionId: await generateTxnId(), customerId, type, amount: Math.round(numericAmount * 100) / 100, description: String(description || '').trim(), createdBy: req.user._id });
    
    res.status(201).json({ success: true, data: transaction });

    // Send email asynchronously in the background so it doesn't block the response
    if (customer.email) {
      try {
        const allTxns = await Transaction.find({ customerId: customer._id });
        const currentBalance = allTxns.reduce((acc, t) => acc + (t.type === 'DEBT' ? t.amount : -t.amount), 0);
        await sendTransactionReceiptEmail(customer, transaction, currentBalance);
      } catch (err) {
        console.error('Failed to send transaction receipt:', err);
      }
    }
  } catch (error) { next(error); }
};

const getCustomerTransactions = async (req, res, next) => { try { const transactions = await Transaction.find({ customerId: req.params.customerId }).sort({ createdAt: -1 }); res.json({ success: true, data: transactions }); } catch (error) { next(error); } };

const getOwnerDashboard = async (req, res, next) => {
  try {
    const customers = await Customer.find({ isActive: true }).select('name phone email');
    const allTxns = await Transaction.find().sort({ createdAt: -1 });
    const now = new Date(); const startToday = new Date(now); startToday.setHours(0,0,0,0);
    let totalDebt=0,totalPayment=0,todayIncome=0,todayTransactionsCount=0;
    for (const t of allTxns) { if(t.type==='DEBT') totalDebt += t.amount; else totalPayment += t.amount; if(t.createdAt >= startToday){todayTransactionsCount++; if(t.type==='PAYMENT') todayIncome += t.amount;} }
    const balances = new Map();
    for(const t of allTxns){ const k=String(t.customerId); const b=balances.get(k)||0; balances.set(k,b+(t.type==='DEBT'?t.amount:-t.amount)); }
    let outstandingDebt = 0; for (const b of balances.values()) { if (b > 0) outstandingDebt += b; }
    const outstandingCustomers = customers.map(c=>({id:c._id,name:c.name,phone:c.phone,balance:balances.get(String(c._id))||0})).filter(c=>c.balance!==0).sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance)).slice(0,6);
    const recentTransactions = allTxns.slice(0,8);
    res.json({success:true,data:{totalCustomers:customers.length,totalDebt,totalPayment,todayIncome,todayTransactionsCount,outstandingDebt,recentTransactions,outstandingCustomers}});
  } catch(error){next(error);}
};

const getAnalytics = async (req,res,next)=>{
  try{
    const days=Math.min(Math.max(Number(req.query.days)||30,7),365);
    const start=new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate()-(days-1));
    const txns=await Transaction.find({createdAt:{$gte:start}}).sort({createdAt:1});
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const series=[]; for(let i=0;i<days;i++){const d=new Date(start);d.setDate(start.getDate()+i);series.push({date:fmt(d),label:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),sales:0,income:0,transactions:0,debt:0,payment:0});}
    const index=new Map(series.map((x,i)=>[x.date,i]));
    for(const t of txns){const key=fmt(new Date(t.createdAt));const s=series[index.get(key)];if(!s)continue;s.transactions++;if(t.type==='DEBT'){s.debt+=t.amount;s.sales+=t.amount;}else{s.payment+=t.amount;s.income+=t.amount;}}
    const totals=txns.reduce((a,t)=>{if(t.type==='DEBT')a.sales+=t.amount;else a.income+=t.amount;a.transactions++;return a;},{sales:0,income:0,transactions:0});
    res.json({success:true,data:{days,series,totals}});
  }catch(error){next(error);}
};
module.exports={addTransaction,getCustomerTransactions,getOwnerDashboard,getAnalytics};
