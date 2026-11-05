const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'database');
const DB_FILE = path.join(DB_DIR, 'bank.json');
const sessions = new Map();

// Required C++ fraud module: Node.js handles the web API, C++ scores transfers.
const FRAUD_SOURCE = path.join(ROOT, 'fraud_engine.cpp');
const FRAUD_BINARY = path.join(ROOT, process.platform === 'win32' ? 'fraud_engine.exe' : 'fraud_engine');
function compileFraudEngine() {
  const result = spawnSync('g++', [FRAUD_SOURCE, '-std=c++17', '-O2', '-o', FRAUD_BINARY], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr || 'unknown compiler error');
    throw new Error('C++ fraud engine compilation failed. Install GCC/G++ and add it to PATH. ' + detail);
  }
}
function assessFraud(amount, balance, recentCount) {
  const result = spawnSync(FRAUD_BINARY, [String(amount), String(balance), String(recentCount)], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('C++ fraud engine execution failed.');
  const parts = result.stdout.trim().split('|');
  return { score: Number(parts[0]), status: parts[1], reason: parts.slice(2).join('|') };
}


// Fictional branch directory for this college demo. These are not real bank branches.
const BRANCHES = [
  { city: 'Vijayawada', state: 'Andhra Pradesh', branch: 'Aurora Bank - Vijayawada Branch', address: 'MG Road, Vijayawada, Andhra Pradesh', ifsc: 'AURA0001001' },
  { city: 'Guntur', state: 'Andhra Pradesh', branch: 'Aurora Bank - Guntur Branch', address: 'Arundelpet, Guntur, Andhra Pradesh', ifsc: 'AURA0001002' },
  { city: 'Mangalagiri', state: 'Andhra Pradesh', branch: 'Aurora Bank - Mangalagiri Branch', address: 'Tadepalli Road, Mangalagiri, Andhra Pradesh', ifsc: 'AURA0001003' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', branch: 'Aurora Bank - Visakhapatnam Branch', address: 'Dwaraka Nagar, Visakhapatnam, Andhra Pradesh', ifsc: 'AURA0001004' },
  { city: 'Tirupati', state: 'Andhra Pradesh', branch: 'Aurora Bank - Tirupati Branch', address: 'Air Bypass Road, Tirupati, Andhra Pradesh', ifsc: 'AURA0001005' },
  { city: 'Rajahmundry', state: 'Andhra Pradesh', branch: 'Aurora Bank - Rajahmundry Branch', address: 'Danavaipeta, Rajahmundry, Andhra Pradesh', ifsc: 'AURA0001006' },
  { city: 'Hyderabad', state: 'Telangana', branch: 'Aurora Bank - Hyderabad Branch', address: 'Hitech City, Hyderabad, Telangana', ifsc: 'AURA0001007' },
  { city: 'Bengaluru', state: 'Karnataka', branch: 'Aurora Bank - Bengaluru Branch', address: 'Indiranagar, Bengaluru, Karnataka', ifsc: 'AURA0001008' },
  { city: 'Chennai', state: 'Tamil Nadu', branch: 'Aurora Bank - Chennai Branch', address: 'T. Nagar, Chennai, Tamil Nadu', ifsc: 'AURA0001009' },
  { city: 'Mumbai', state: 'Maharashtra', branch: 'Aurora Bank - Mumbai Branch', address: 'Andheri East, Mumbai, Maharashtra', ifsc: 'AURA0001010' }
];

function initAccountExtras(acc) {
  if (!acc.payees) acc.payees = [];
  if (!acc.cards) {
    acc.cards = {
      debit: { number: '4592 •••• •••• ' + String(acc.id).slice(-4), status: 'ACTIVE', dailyLimit: 50000 },
      credit: { number: '5241 •••• •••• ' + String(acc.id).slice(-4), status: 'ACTIVE', limit: 150000, available: 124000 }
    };
  }
  if (!acc.deposits) acc.deposits = [];
  if (!acc.investments) acc.investments = { ppf: null, demat: null, mutualFunds: [] };
  if (!acc.loans) acc.loans = [];
  if (!acc.insurance) acc.insurance = [];
  if (!acc.stoppedCheques) acc.stoppedCheques = [];
  if (!acc.fraudReports) acc.fraudReports = [];
  if (acc.secondaryBalance === undefined) acc.secondaryBalance = 15000;
}

function loadDb() {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  data.accounts.forEach(initAccountExtras);
  return data;
}

function saveDb(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function cleanAccount(a) { const { pin, ...safe } = a; return safe; }
function error(res, status, message) { json(res, status, { error: message }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function money(value) { return Number(Number(value).toFixed(2)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}
function currentUser(req, data) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const accountId = sessions.get(token);
  return data.accounts.find(a => a.id === accountId);
}
function addTx(data, account, type, amount, note) {
  data.transactions.unshift({
    id: crypto.randomUUID(),
    accountId: account.id,
    type,
    amount: money(amount),
    note,
    createdAt: new Date().toISOString(),
    balanceAfter: money(account.balance)
  });
}

async function api(req, res, url) {
  const data = loadDb();

  if (req.method === 'GET' && url.pathname === '/api/branches') {
    return json(res, 200, { branches: BRANCHES });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const { accountNumber, pin } = await readBody(req);
    const account = data.accounts.find(a => a.id === Number(accountNumber));
    if (!account || account.pin !== String(pin)) return error(res, 401, 'Incorrect account number or PIN.');
    const token = crypto.randomUUID();
    sessions.set(token, account.id);
    return json(res, 200, { token, account: cleanAccount(account) });
  }

  if (req.method === 'POST' && url.pathname === '/api/accounts') {
    const { name, phone, email, address, city, pincode, pin, type, initialDeposit } = await readBody(req);
    const amount = money(initialDeposit);
    const selectedBranch = BRANCHES.find(item => item.city === String(city || '').trim());
    if (!name?.trim() || !phone?.trim() || !email?.trim() || !address?.trim() || !selectedBranch || !/^\d{6}$/.test(String(pincode)) || !/^\d{4}$/.test(String(pin)) || !['Savings', 'Current'].includes(type) || !Number.isFinite(amount) || amount < 0) {
      return error(res, 400, 'Enter valid details, select one of the 10 branch cities, and use a 4-digit PIN.');
    }
    if (type === 'Savings' && amount < 500) return error(res, 400, 'Savings accounts require min ₹500 balance.');
    const account = { id: data.nextAccountNumber++, name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), city: selectedBranch.city, state: selectedBranch.state, pincode: String(pincode), createdAt: new Date().toISOString(), isRegisteredCustomer: true, branch: selectedBranch.branch, branchAddress: selectedBranch.address, ifsc: selectedBranch.ifsc, riskLevel: 'Low', pin: String(pin), type, balance: amount, ...(type === 'Savings' ? { interestRate: 4, minBalance: 500 } : { overdraftLimit: 1000 }) };
    initAccountExtras(account);
    data.accounts.push(account);
    addTx(data, account, 'DEPOSIT', amount, 'Opening balance');
    saveDb(data);
    const token = crypto.randomUUID();
    sessions.set(token, account.id);
    return json(res, 201, { token, account: cleanAccount(account) });
  }

  const account = currentUser(req, data);
  if (!account) return error(res, 401, 'Please sign in to continue.');

  if (req.method === 'GET' && url.pathname === '/api/dashboard/customer-stats') {
    const registered = data.accounts.filter(a => a.isRegisteredCustomer === true);
    const seedCustomers = Array.isArray(data.portfolioSeedCustomers) ? data.portfolioSeedCustomers : [];
    const startingCustomers = seedCustomers.length;
    const newCustomers = registered.length;
    const cityCustomers = BRANCHES.map(branch => ({
      city: branch.city,
      state: branch.state,
      branch: branch.branch,
      customers: seedCustomers.filter(customer => customer.city === branch.city).length +
        registered.filter(customer => customer.city === branch.city).length
    }));
    return json(res, 200, {
      startingCustomers,
      totalCustomers: startingCustomers + newCustomers,
      newCustomers,
      cityCustomers
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    return json(res, 200, { account: cleanAccount(account), interest: account.type === 'Savings' ? money(account.balance * account.interestRate / 100) : 0 });
  }
  if (req.method === 'GET' && url.pathname === '/api/statement/download') {
    const userTxs = data.transactions.filter(t => t.accountId === account.id);
    let csv = 'Transaction ID,Date,Type,Amount (INR),Note,Balance After (INR)\r\n';
    userTxs.forEach(t => { csv += '"' + t.id + '","' + t.createdAt + '","' + t.type + '","' + t.amount + '","' + (t.note||'').replace(/"/g, '""') + '","' + t.balanceAfter + '"\r\n'; });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=Aurora_Statement_' + account.id + '.csv' });
    return res.end(csv);
  }
  if (req.method === 'GET' && url.pathname === '/api/transactions') return json(res, 200, { transactions: data.transactions.filter(t => t.accountId === account.id) });

  if (req.method === 'POST' && url.pathname === '/api/deposit') {
    const { amount } = await readBody(req); const value = money(amount);
    if (!Number.isFinite(value) || value <= 0) return error(res, 400, 'Invalid deposit amount.');
    account.balance = money(account.balance + value);
    addTx(data, account, 'DEPOSIT', value, 'Cash deposit');
    saveDb(data);
    return json(res, 200, { account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/withdraw') {
    const { amount } = await readBody(req); const value = money(amount);
    if (!Number.isFinite(value) || value <= 0) return error(res, 400, 'Invalid withdrawal amount.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Withdrawal violates balance limit.');
    account.balance = money(account.balance - value);
    addTx(data, account, 'WITHDRAW', value, 'Cash withdrawal');
    saveDb(data);
    return json(res, 200, { account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/transfer') {
    const { toAccount, amount, note } = await readBody(req); const value = money(amount);
    const recipient = data.accounts.find(a => a.id === Number(toAccount));
    if (!recipient || recipient.id === account.id) return error(res, 400, 'Invalid recipient account.');
    if (!Number.isFinite(value) || value <= 0) return error(res, 400, 'Transfer amount must be positive.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Insufficient balance for transfer.');
    const recentCount = data.transactions.filter(t => t.accountId === account.id &&
      (Date.now() - new Date(t.createdAt).getTime()) <= 60 * 60 * 1000).length;
    const fraud = assessFraud(value, account.balance, recentCount);
    if (fraud.status === 'BLOCK') {
      return json(res, 403, { error: 'Transfer blocked by C++ fraud detection.', fraud });
    }
    account.lastFraudAssessment = fraud;
    account.balance = money(account.balance - value);
    recipient.balance = money(recipient.balance + value);
    addTx(data, account, 'TRANSFER OUT', value, note?.trim() || ('Transfer to ' + recipient.name));
    addTx(data, recipient, 'TRANSFER IN', value, 'Transfer from ' + account.name);
    saveDb(data);
    return json(res, 200, { account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/transfer/own') {
    const { direction, amount } = await readBody(req); const value = money(amount);
    if (!Number.isFinite(value) || value <= 0) return error(res, 400, 'Invalid transfer amount.');
    if (direction === 'TO_SECONDARY') {
      const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
      if (account.balance - value < floor) return error(res, 400, 'Insufficient balance in primary account.');
      account.balance = money(account.balance - value);
      account.secondaryBalance = money(account.secondaryBalance + value);
      addTx(data, account, 'TRANSFER OUT', value, 'Transfer to Secondary Pocket');
    } else {
      if (account.secondaryBalance < value) return error(res, 400, 'Insufficient funds in secondary pocket.');
      account.secondaryBalance = money(account.secondaryBalance - value);
      account.balance = money(account.balance + value);
      addTx(data, account, 'TRANSFER IN', value, 'Transfer from Secondary Pocket');
    }
    saveDb(data);
    return json(res, 200, { account: cleanAccount(account) });
  }
  if (req.method === 'GET' && url.pathname === '/api/payees') return json(res, 200, { payees: account.payees || [] });
  if (req.method === 'POST' && url.pathname === '/api/payees') {
    const { name, accountNumber, nickname } = await readBody(req);
    const target = data.accounts.find(a => a.id === Number(accountNumber));
    if (!target) return error(res, 404, 'Recipient account does not exist.');
    if (target.id === account.id) return error(res, 400, 'Cannot add your own account.');
    if (account.payees.some(p => p.accountNumber === target.id)) return error(res, 400, 'Payee already exists.');
    account.payees.push({ id: crypto.randomUUID(), accountNumber: target.id, name: name?.trim() || target.name, nickname: nickname?.trim() || target.name.split(' ')[0], addedAt: new Date().toISOString() });
    saveDb(data);
    return json(res, 201, { message: 'Payee added successfully.', payees: account.payees });
  }
  if (req.method === 'GET' && url.pathname === '/api/cards') return json(res, 200, { cards: account.cards });
  if (req.method === 'POST' && url.pathname === '/api/cards/toggle-block') {
    const { cardType } = await readBody(req);
    if (!['debit', 'credit'].includes(cardType)) return error(res, 400, 'Invalid card type.');
    const card = account.cards[cardType];
    card.status = card.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    saveDb(data);
    return json(res, 200, { message: cardType.toUpperCase() + ' card is now ' + card.status + '.', cards: account.cards });
  }
  if (req.method === 'POST' && url.pathname === '/api/deposits/fd') {
    const { amount, tenureMonths } = await readBody(req); const value = money(amount); const months = Number(tenureMonths);
    if (!Number.isFinite(value) || value < 5000) return error(res, 400, 'Minimum FD amount is ₹5,000.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Insufficient balance for FD.');
    const rate = months >= 12 ? 7.1 : 6.0;
    const maturity = money(value + (value * (rate / 100) * (months / 12)));
    account.balance = money(account.balance - value);
    const fd = { id: 'FD-' + Date.now(), type: 'Fixed Deposit', principal: value, rate, months, maturity, createdAt: new Date().toISOString() };
    account.deposits.push(fd);
    addTx(data, account, 'WITHDRAW', value, 'Booked FD #' + fd.id + ' (' + months + ' mos @ ' + rate + '%)');
    saveDb(data);
    return json(res, 201, { message: 'FD booked successfully!', fd, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/deposits/rd') {
    const { monthlyAmount, tenureMonths } = await readBody(req); const value = money(monthlyAmount); const months = Number(tenureMonths);
    if (!Number.isFinite(value) || value < 1000) return error(res, 400, 'Minimum RD installment is ₹1,000.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Insufficient balance for RD.');
    account.balance = money(account.balance - value);
    const rd = { id: 'RD-' + Date.now(), type: 'Recurring Deposit', monthlyInstallment: value, months, rate: 6.8, createdAt: new Date().toISOString() };
    account.deposits.push(rd);
    addTx(data, account, 'WITHDRAW', value, 'Opened RD #' + rd.id + ' (1st installment)');
    saveDb(data);
    return json(res, 201, { message: 'RD created successfully!', rd, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/invest/ppf') {
    if (account.investments?.ppf) return error(res, 400, 'PPF account already exists.');
    const { initialDeposit } = await readBody(req); const value = money(initialDeposit);
    if (value < 500) return error(res, 400, 'Minimum PPF deposit is ₹500.');
    account.balance = money(account.balance - value);
    account.investments.ppf = { ppfNumber: 'PPF-IN-' + account.id, balance: value, rate: 7.1, openedAt: new Date().toISOString() };
    addTx(data, account, 'WITHDRAW', value, 'PPF Account initial contribution');
    saveDb(data);
    return json(res, 201, { message: 'PPF account activated.', ppf: account.investments.ppf, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/invest/demat') {
    if (account.investments?.demat) return error(res, 400, 'Demat account is already active.');
    account.investments.demat = { dpId: 'IN300' + account.id, status: 'ACTIVE', linkedExchanges: ['NSE', 'BSE'], createdAt: new Date().toISOString() };
    saveDb(data);
    return json(res, 201, { message: 'Demat account created successfully.', demat: account.investments.demat });
  }
  if (req.method === 'POST' && url.pathname === '/api/invest/mf') {
    const { fundName, amount } = await readBody(req); const value = money(amount);
    if (!fundName || value < 500) return error(res, 400, 'Select a fund with min ₹500 SIP.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Insufficient balance for Mutual Fund.');
    account.balance = money(account.balance - value);
    const mf = { id: 'MF-' + Date.now(), fundName: fundName.trim(), invested: value, nav: 42.15, units: Number((value / 42.15).toFixed(3)), date: new Date().toISOString() };
    account.investments.mutualFunds.push(mf);
    addTx(data, account, 'WITHDRAW', value, 'Mutual Fund SIP - ' + fundName);
    saveDb(data);
    return json(res, 201, { message: 'Mutual Fund investment recorded.', mf, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/loans/apply') {
    const { loanType, amount, tenureYears } = await readBody(req); const value = money(amount); const years = Number(tenureYears);
    if (!['Home Loan', 'Personal Loan', 'Vehicle Loan'].includes(loanType) || value < 20000 || years < 1) return error(res, 400, 'Invalid loan request.');
    const rate = loanType === 'Home Loan' ? 8.5 : 11.5; const r = rate / (12 * 100); const n = years * 12;
    const emi = money((value * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    const loan = { id: 'LN-' + Date.now(), loanType, principal: value, rate, tenureYears: years, emi, status: 'APPROVED' };
    account.loans.push(loan);
    account.balance = money(account.balance + value);
    addTx(data, account, 'DEPOSIT', value, loanType + ' disbursement #' + loan.id);
    saveDb(data);
    return json(res, 201, { message: loanType + ' approved and credited!', loan, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/insurance/buy') {
    const { plan, sumAssured, premium } = await readBody(req); const cost = money(premium);
    if (account.balance < cost) return error(res, 400, 'Insufficient balance for premium.');
    account.balance = money(account.balance - cost);
    const pol = { policyNumber: 'POL-' + Date.now(), plan, sumAssured: Number(sumAssured), premium: cost, issuedAt: new Date().toISOString() };
    account.insurance.push(pol);
    addTx(data, account, 'WITHDRAW', cost, 'Premium for ' + plan + ' #' + pol.policyNumber);
    saveDb(data);
    return json(res, 201, { message: 'Policy issued successfully.', policy: pol, account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/bills/pay') {
    const { category, provider, identifier, amount } = await readBody(req); const value = money(amount);
    const allowed = ['Mobile Prepaid', 'Mobile Postpaid', 'FASTag', 'DTH', 'Electricity'];
    if (!allowed.includes(category) || !provider || !identifier || value <= 0) return error(res, 400, 'Invalid bill details.');
    const floor = account.type === 'Savings' ? account.minBalance : -account.overdraftLimit;
    if (account.balance - value < floor) return error(res, 400, 'Insufficient balance for bill payment.');
    account.balance = money(account.balance - value);
    addTx(data, account, 'WITHDRAW', value, category + ' bill (' + provider + ' - ' + identifier + ')');
    saveDb(data);
    return json(res, 200, { message: category + ' payment of ₹' + value + ' completed!', account: cleanAccount(account) });
  }
  if (req.method === 'POST' && url.pathname === '/api/cheques/stop') {
    const { chequeNumber, reason } = await readBody(req);
    if (!chequeNumber || !/^\d{6}$/.test(String(chequeNumber))) return error(res, 400, 'Enter a valid 6-digit cheque number.');
    account.stoppedCheques.push({ chequeNumber: String(chequeNumber), reason: String(reason || 'Reported lost'), date: new Date().toISOString() });
    saveDb(data);
    return json(res, 200, { message: 'Cheque #' + chequeNumber + ' stopped successfully.', stoppedCheques: account.stoppedCheques });
  }
  if (req.method === 'POST' && url.pathname === '/api/fraud/report') {
    const { txId, description } = await readBody(req);
    if (!description?.trim()) return error(res, 400, 'Please describe the incident.');
    const ticket = { id: 'INC-' + Date.now(), txId: txId || 'N/A', description: description.trim(), reportedAt: new Date().toISOString(), status: 'UNDER REVIEW' };
    account.fraudReports.push(ticket);
    saveDb(data);
    return json(res, 201, { message: 'Incident recorded under ticket #' + ticket.id + '. Fraud desk notified.', ticket });
  }
  if (req.method === 'POST' && url.pathname === '/api/pin/reset') {
    const { currentPin, newPin } = await readBody(req);
    if (account.pin !== String(currentPin)) return error(res, 400, 'Current PIN is incorrect.');
    if (!/^\d{4}$/.test(String(newPin))) return error(res, 400, 'New PIN must be 4 digits.');
    account.pin = String(newPin); saveDb(data);
    return json(res, 200, { message: 'PIN updated successfully.' });
  }

  return error(res, 404, 'Endpoint not found.');
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + req.headers.host);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let filePath = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(filePath)) filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return error(res, 404, 'Not found.');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { error(res, 400, e.message || 'Server error.'); }
});

try {
  compileFraudEngine();
  console.log('C++ fraud detection engine compiled successfully.');
  server.listen(PORT, () => console.log('Aurora Bank running on http://localhost:' + PORT));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}