const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD.');
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
    tls: { rejectUnauthorized: false }
  });
  return transporter;
}

async function sendPasswordResetEmail(user, resetUrl) {
  const mailer = getTransporter();
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || `Velox Ledger <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: 'Reset your Velox Ledger password',
    text: `Hi ${user.name},\n\nUse this link to reset your Velox Ledger password:\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;background:#071014;padding:32px;color:#eaf5f4"><div style="max-width:560px;margin:auto;background:#0d171c;border:1px solid #203138;border-radius:18px;padding:30px"><div style="font-size:13px;letter-spacing:4px;color:#2dd4bf;font-weight:800">VELOX LEDGER</div><h1 style="font-size:26px">Reset your password</h1><p style="color:#9aabb1">Hi ${escapeHtml(user.name)}, we received a request to reset your account password.</p><a href="${resetUrl}" style="display:inline-block;background:#14b8a6;color:#04100f;padding:13px 20px;border-radius:10px;text-decoration:none;font-weight:800">Reset Password</a><p style="color:#71838a;font-size:13px;margin-top:24px">This link expires in 15 minutes. If you did not request this, you can safely ignore this email.</p></div></div>`
  });
}
async function sendTransactionReceiptEmail(customer, transaction, currentBalance) {
  if (!customer.email) return; // Skip if customer has no email
  const mailer = getTransporter();
  const typeLabel = transaction.type === 'DEBT' ? 'Purchase/Debt Added' : 'Payment Received';
  const amountStr = `₹${Number(transaction.amount).toLocaleString('en-IN')}`;
  const balanceStr = `₹${Math.abs(currentBalance).toLocaleString('en-IN')}`;
  const balanceLabel = currentBalance > 0 ? 'Amount Due' : (currentBalance < 0 ? 'Store Credit (Advance)' : 'Settled (₹0)');
  
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || `Velox Ledger <${process.env.EMAIL_USER}>`,
    to: customer.email,
    subject: `Velox Ledger: ${typeLabel} of ${amountStr}`,
    html: `<div style="font-family:Arial,sans-serif;background:#071014;padding:32px;color:#eaf5f4"><div style="max-width:560px;margin:auto;background:#0d171c;border:1px solid #203138;border-radius:18px;padding:30px"><div style="font-size:13px;letter-spacing:4px;color:#2dd4bf;font-weight:800">VELOX LEDGER</div><h1 style="font-size:22px;margin-top:20px">${typeLabel}</h1><p style="color:#9aabb1">Hi ${escapeHtml(customer.name)}, a new transaction was just recorded on your store account.</p><div style="background:#131f26;padding:20px;border-radius:10px;margin:24px 0"><div style="margin-bottom:12px"><small style="color:#71838a;display:block">Amount</small><b style="font-size:20px;color:${transaction.type==='DEBT'?'#f87171':'#34d399'}">${transaction.type==='DEBT'?'-':'+'}${amountStr}</b></div><div style="margin-bottom:12px"><small style="color:#71838a;display:block">Description</small><b style="font-size:16px">${escapeHtml(transaction.description || 'N/A')}</b></div><div><small style="color:#71838a;display:block">New Account Balance (${balanceLabel})</small><b style="font-size:16px">${balanceStr}</b></div></div><p style="color:#71838a;font-size:13px">You can log into the Customer Portal at any time to view your full transaction history.</p></div></div>`
  });
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
module.exports = { sendPasswordResetEmail, sendTransactionReceiptEmail };
