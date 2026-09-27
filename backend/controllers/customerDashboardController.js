const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const getCustomerDashboard = async (req,res,next)=>{
 try{
  const customer=await Customer.findById(req.user.customerId).select('name phone email isActive');
  if(!customer||!customer.isActive)return res.status(403).json({success:false,message:'Customer account is inactive.'});
  const transactions=await Transaction.find({customerId:customer._id}).sort({createdAt:-1});
  let totalDebt=0,totalPayment=0; for(const t of transactions){if(t.type==='DEBT')totalDebt+=t.amount;else totalPayment+=t.amount;}
  const balance=totalDebt-totalPayment;
  res.json({success:true,data:{name:customer.name,phone:customer.phone,email:customer.email,totalDebt,totalPayment,balance:Math.abs(balance),isAdvance:balance<0,transactions}});
 }catch(error){next(error);}
};
module.exports={getCustomerDashboard};
