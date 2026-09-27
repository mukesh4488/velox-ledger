require('dotenv').config();
const bcrypt=require('bcryptjs');
const User=require('./models/User');
const connectDB=require('./config/db');
(async()=>{try{await connectDB();const exists=await User.findOne({role:'OWNER'});if(exists){console.log('Owner already exists');process.exit(0);}const passwordHash=await bcrypt.hash('admin123',12);await User.create({name:'Shop Owner',phone:'9999999999',email:'owner@velox.com',passwordHash,role:'OWNER',customerId:null});console.log('Owner created: owner@velox.com / admin123');process.exit(0);}catch(e){console.error(e);process.exit(1);}})();
