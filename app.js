const $ = s => document.querySelector(s);
let token = localStorage.getItem('auroraToken');
let action = 'transfer';
let currentAccountData = null;
let branchDirectory = [];
let cityBarRects = [];

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

async function request(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    }
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Server request failed');
  return data;
}

function toast(message, bad = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'show ' + (bad ? 'bad' : '');
  setTimeout(() => el.className = '', 3500);
}

function openAuth(panel = 'login') {
  if ($('#loginPanel')) $('#loginPanel').hidden = panel !== 'login';
  if ($('#signupPanel')) $('#signupPanel').hidden = panel !== 'signup';
  const modal = $('#authModal');
  if (modal) modal.showModal();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $('#' + btn.dataset.tab);
    if (target) target.classList.add('active');
    if (btn.dataset.tab === 'tab-portfolio') {
      loadPortfolioGraph().catch(err => toast('Portfolio graph: ' + err.message, true));
    } else if (btn.dataset.tab === 'tab-customer-details') {
      loadPortfolioProfile().catch(err => toast('Customer details: ' + err.message, true));
    }
  };
});


function escapeProfile(value) {
  return String(value ?? 'Not provided').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}


async function loadPortfolioGraph() {
  const stats = await request('/api/dashboard/customer-stats');
  const newEl = $('#portfolioNewCustomers');
  const totalEl = $('#portfolioTotalCustomers');
  const startingEl = document.querySelector('#portfolioStartingCustomers');
  if (startingEl) startingEl.textContent = stats.startingCustomers.toLocaleString('en-IN');
  if (newEl) newEl.textContent = stats.newCustomers.toLocaleString('en-IN');
  if (totalEl) totalEl.textContent = stats.totalCustomers.toLocaleString('en-IN');
  drawCityCustomerChart(stats.cityCustomers || []);

  const canvas = $('#customerGrowthChart');
  if (!canvas) return;
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || 640);
    const height = 300;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const values = [stats.startingCustomers, stats.totalCustomers];
    const labels = ['Starting customers', 'Current total'];
    const max = Math.max(stats.startingCustomers * 1.1, stats.totalCustomers * 1.12);
    const left = 54, right = 22, top = 24, bottom = 54;
    const chartH = height - top - bottom;
    const baseY = height - bottom;
    ctx.font = '12px Arial';
    ctx.fillStyle = '#718078';
    ctx.strokeStyle = '#e3eae5';
    ctx.lineWidth = 1;
    for (let n=0;n<=4;n++) {
      const y=top + chartH*n/4;
      ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(width-right,y); ctx.stroke();
      ctx.fillText(Math.round(max*(1-n/4)).toLocaleString('en-IN'), 4, y+4);
    }
    const barW = Math.min(90, (width-left-right)/5);
    const gap = (width-left-right-2*barW)/3;
    values.forEach((value,i)=>{
      const x=left+gap+(barW+gap)*i;
      const barH=Math.max(2,(value/max)*chartH);
      ctx.fillStyle=i===0?'#9ab9a7':'#176b55';
      ctx.fillRect(x,baseY-barH,barW,barH);
      ctx.fillStyle='#1d3429';
      ctx.textAlign='center';
      ctx.font='bold 12px Arial';
      ctx.fillText(value.toLocaleString('en-IN'),x+barW/2,baseY-barH-9);
      ctx.font='11px Arial';
      ctx.fillStyle='#718078';
      ctx.fillText(labels[i],x+barW/2,height-23);
    });
    ctx.textAlign='left';
  };
  draw();
  if (!canvas.dataset.resizeBound) {
    window.addEventListener('resize', draw);
    canvas.dataset.resizeBound='1';
  }
}

function drawCityCustomerChart(cityCustomers) {
  const canvas = $('#cityCustomerChart');
  const wrap = $('#cityCustomerChartWrap');
  const tooltip = $('#cityChartTooltip');
  if (!canvas || !wrap) return;
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || 640);
    const height = 360;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const left = 38, right = 14, top = 24, bottom = 105;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const baseY = top + plotH;
    const maxValue = Math.max(5, ...cityCustomers.map(item => Number(item.customers) || 0));
    const yMax = Math.ceil(maxValue / 5) * 5 || 5;
    const values = [0, yMax / 2, yMax];
    ctx.font = '11px Arial';
    ctx.fillStyle = '#718078';
    ctx.strokeStyle = '#e3eae5';
    ctx.lineWidth = 1;
    values.forEach(value => {
      const y = baseY - (value / yMax) * plotH;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(value).toLocaleString('en-IN'), left - 7, y + 4);
    });

    cityBarRects = [];
    const slot = plotW / Math.max(cityCustomers.length, 1);
    const barW = Math.min(28, slot * 0.58);
    cityCustomers.forEach((item, index) => {
      const value = Number(item.customers) || 0;
      const barH = value > 0 ? Math.max(3, (value / yMax) * plotH) : 3;
      const x = left + slot * index + (slot - barW) / 2;
      const y = baseY - barH;
      ctx.fillStyle = '#176b55';
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = '#718078';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barW / 2, baseY + 15);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(item.city, 0, 0);
      ctx.restore();
      cityBarRects.push({ x: x - 5, y: y - 7, w: barW + 10, h: barH + 14, city: item.city, state: item.state, customers: value });
    });
    ctx.textAlign = 'left';
  };
  draw();
  if (!canvas.dataset.hoverBound) {
    canvas.addEventListener('mousemove', event => {
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const hit = cityBarRects.find(bar => x >= bar.x && x <= bar.x + bar.w && y >= bar.y && y <= bar.y + bar.h);
      if (!hit || !tooltip) {
        if (tooltip) tooltip.hidden = true;
        canvas.style.cursor = 'default';
        return;
      }
      tooltip.textContent = `${hit.city}, ${hit.state} · ${hit.customers.toLocaleString('en-IN')} customers`;
      tooltip.hidden = false;
      const wrapBox = wrap.getBoundingClientRect();
      const tipLeft = Math.max(8, Math.min(event.clientX - wrapBox.left + 12, wrap.clientWidth - 230));
      tooltip.style.left = `${tipLeft}px`;
      tooltip.style.top = `${Math.max(6, event.clientY - wrapBox.top - 42)}px`;
      canvas.style.cursor = 'pointer';
    });
    canvas.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.hidden = true;
      canvas.style.cursor = 'default';
    });
    canvas.dataset.hoverBound = '1';
  }
  if (!canvas.dataset.resizeBound) {
    window.addEventListener('resize', draw);
    canvas.dataset.resizeBound = '1';
  }
}

async function loadBranchDirectory() {
  const citySelect = $('#signupCity');
  if (!citySelect) return;
  try {
    const result = await request('/api/branches');
    branchDirectory = result.branches || [];
    citySelect.innerHTML = '<option value="">Select your nearest branch city</option>' + branchDirectory.map(branch =>
      `<option value="${escapeProfile(branch.city)}">${escapeProfile(branch.city)}</option>`
    ).join('');
    citySelect.onchange = () => {
      const branch = branchDirectory.find(item => item.city === citySelect.value);
      const stateInput = $('#signupState');
      const info = $('#signupBranchInfo');
      if (stateInput) stateInput.value = branch ? branch.state : '';
      if (info) info.textContent = branch
        ? `${branch.branch} · ${branch.address} · IFSC: ${branch.ifsc}`
        : 'Choose a city to view its Aurora Bank branch.';
    };
  } catch (err) {
    citySelect.innerHTML = '<option value="">Branch list unavailable — refresh the page</option>';
    toast('Could not load branch cities: ' + err.message, true);
  }
}

async function loadPortfolioProfile() {
  const target = $('#portfolioProfile');
  if (!target) return;
  const result = await request('/api/me');
  const c = result.account;
  const deposits = Array.isArray(c.deposits) ? c.deposits : [];
  const fixedDepositTotal = deposits.reduce((sum, item) => sum + Number(item.principal || item.amount || 0), 0);
  const mutualFunds = c.investments && Array.isArray(c.investments.mutualFunds) ? c.investments.mutualFunds.length : 0;
  target.innerHTML = `
    <div class="portfolio-stat-grid">
      <article><small>Primary account balance</small><strong>${fmt.format(c.balance || 0)}</strong></article>
      <article><small>Secondary wallet</small><strong>${fmt.format(c.secondaryBalance || 0)}</strong></article>
      <article><small>Fixed deposit principal</small><strong>${fmt.format(fixedDepositTotal)}</strong></article>
      <article><small>Mutual fund SIPs</small><strong>${mutualFunds}</strong></article>
    </div>
    <div class="portfolio-section-heading">
      <p class="eyebrow">CUSTOMER DETAILS</p>
      <h4>${escapeProfile(c.name)}</h4>
    </div>
    <div class="portfolio-details-grid">
      <div><small>Account number</small><strong>${escapeProfile(c.id)}</strong></div>
      <div><small>Mobile number</small><strong>${escapeProfile(c.phone)}</strong></div>
      <div><small>Email address</small><strong>${escapeProfile(c.email)}</strong></div>
      <div><small>Residential address</small><strong>${escapeProfile(c.address)}</strong></div>
      <div><small>City</small><strong>${escapeProfile(c.city)}</strong></div>
      <div><small>State</small><strong>${escapeProfile(c.state)}</strong></div>
      <div><small>PIN code</small><strong>${escapeProfile(c.pincode)}</strong></div>
      <div><small>Account type</small><strong>${escapeProfile(c.type)}</strong></div>
      <div><small>Branch</small><strong>${escapeProfile(c.branch || 'Aurora Bank - Main Branch')}</strong></div>
      <div><small>Branch address</small><strong>${escapeProfile(c.branchAddress || 'Aurora Bank Main Branch (Demo Branch)')}</strong></div>
      <div><small>IFSC code</small><strong>${escapeProfile(c.ifsc || 'AURA0001001')}</strong></div>
      <div><small>Account created</small><strong>${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'Existing account'}</strong></div>
    </div>`;
}

async function load() {
  if (!token) {
    if (location.pathname === '/dashboard.html') location.replace('/');
    return;
  }
  try {
    const [me, tx] = await Promise.all([request('/api/me'), request('/api/transactions')]);
    const a = me.account;
    currentAccountData = a;

    if ($('#customerName')) $('#customerName').textContent = a.name.split(' ')[0];
    if ($('#balance')) $('#balance').textContent = fmt.format(a.balance);
    if ($('#secondaryBal')) $('#secondaryBal').textContent = fmt.format(a.secondaryBalance || 0);
    if ($('#accountType')) $('#accountType').textContent = a.type + ' account';
    if ($('#accountId')) $('#accountId').textContent = 'A/C •••• ' + a.id;
    if ($('#interest')) $('#interest').textContent = a.type === 'Savings' ? 'Est. Annual Interest: ' + fmt.format(me.interest) : '';

    if (a.cards) {
      $('#debitNumber').textContent = a.cards.debit.number;
      $('#debitStatus').textContent = a.cards.debit.status;
      $('#debitStatus').className = 'status-badge ' + (a.cards.debit.status === 'ACTIVE' ? 'active' : 'blocked');
      $('#toggleDebitBtn').textContent = a.cards.debit.status === 'ACTIVE' ? 'Block Card' : 'Unblock Card';

      $('#creditNumber').textContent = a.cards.credit.number;
      $('#creditStatus').textContent = a.cards.credit.status;
      $('#creditStatus').className = 'status-badge ' + (a.cards.credit.status === 'ACTIVE' ? 'active' : 'blocked');
      $('#toggleCreditBtn').textContent = a.cards.credit.status === 'ACTIVE' ? 'Block Card' : 'Unblock Card';
      $('#creditAvail').textContent = fmt.format(a.cards.credit.available || 0);
    }

    const payees = a.payees || [];
    const payeeSelect = $('#payeeSelectDropdown');
    if (payeeSelect) {
      payeeSelect.innerHTML = '<option value="">-- Or enter account number manually --</option>' +
        payees.map(p => '<option value="' + p.accountNumber + '">' + (p.nickname || p.name) + ' (' + p.accountNumber + ')</option>').join('');
    }
    const payeeList = $('#payeeList');
    if (payeeList) {
      payeeList.innerHTML = payees.length ? payees.map(p => 
        '<article><div><strong>' + p.name + '</strong><small class="muted">A/C ' + p.accountNumber + ' · ' + (p.nickname || 'Payee') + '</small></div><button class="mini-btn" onclick="quickPay(' + p.accountNumber + ')">Send ₹</button></article>'
      ).join('') : '<p class="empty">No saved payees yet.</p>';
    }

    const deposits = a.deposits || [];
    const mfs = a.investments?.mutualFunds || [];
    const depList = $('#depositsList');
    if (depList) {
      const allHoldings = [
        ...deposits.map(d => '<article><div><strong>' + d.type + ' (#' + d.id + ')</strong><small>' + d.months + ' Mos @ ' + d.rate + '%</small></div><b>' + fmt.format(d.principal || d.monthlyInstallment) + '</b></article>'),
        ...(a.investments?.ppf ? ['<article><div><strong>PPF Account (' + a.investments.ppf.ppfNumber + ')</strong><small>7.1% Tax Free</small></div><b>' + fmt.format(a.investments.ppf.balance) + '</b></article>'] : []),
        ...mfs.map(m => '<article><div><strong>' + m.fundName + '</strong><small>' + m.units + ' units @ NAV ₹42.15</small></div><b>' + fmt.format(m.invested) + '</b></article>')
      ];
      depList.innerHTML = allHoldings.length ? allHoldings.join('') : '<p class="empty">No active Fixed Deposits or investments yet.</p>';
    }

    if (a.investments?.ppf && $('#ppfStatusTxt')) $('#ppfStatusTxt').textContent = 'Active (' + a.investments.ppf.ppfNumber + ')';
    if (a.investments?.demat && $('#dematStatusTxt')) $('#dematStatusTxt').textContent = 'Active (DP: ' + a.investments.demat.dpId + ')';

    const txContainer = $('#transactions');
    if (txContainer) {
      txContainer.innerHTML = tx.transactions.length ? tx.transactions.map(t => 
        '<article><div class="tx-icon ' + (t.type.includes('OUT') || t.type === 'WITHDRAW' ? 'out' : '') + '">' +
        (t.type.includes('IN') || t.type === 'DEPOSIT' ? '↓' : '↑') +
        '</div><div><strong>' + t.type.replace('TRANSFER ', '') + '</strong><small>' + (t.note || 'Banking transaction') + ' · ' + new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '</small></div>' +
        '<b class="' + (t.type.includes('OUT') || t.type === 'WITHDRAW' ? 'negative' : '') + '">' +
        (t.type.includes('OUT') || t.type === 'WITHDRAW' ? '-' : '+') + fmt.format(t.amount) + '</b></article>'
      ).join('') : '<p class="empty">No transactions recorded yet.</p>';
    }
  } catch (e) {
    console.error(e);
    localStorage.removeItem('auroraToken');
    token = null;
    if (location.pathname === '/dashboard.html') location.replace('/');
  }
}

if ($('#navLogin')) $('#navLogin').onclick = () => openAuth('login');
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openAuth(b.dataset.open));
document.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => openAuth(b.dataset.switch));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

if ($('#loginForm')) {
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(d) });
      token = r.token;
      localStorage.setItem('auroraToken', token);
      location.assign('/dashboard.html');
    } catch (err) { toast(err.message, true); }
  };
}

loadBranchDirectory();

if ($('#signupForm')) {
  $('#signupForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/accounts', { method: 'POST', body: JSON.stringify(d) });
      token = r.token;
      localStorage.setItem('auroraToken', token);
      location.assign('/dashboard.html');
    } catch (err) { toast(err.message, true); }
  };
}

const stmtBtn = $('#btnDownloadStatement');
if (stmtBtn) {
  stmtBtn.onclick = async () => {
    try {
      const res = await fetch('/api/statement/download', { headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
      if (!res.ok) throw new Error('Could not generate statement.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Aurora_Statement_' + (currentAccountData?.id || 'User') + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Statement downloaded successfully.');
    } catch (err) { toast(err.message, true); }
  };
}

window.quickPay = accNo => {
  action = 'transfer';
  $('#actionTitle').textContent = 'Make a transfer';
  $('#actionEyebrow').textContent = 'TRANSFER';
  $('#recipientField').hidden = false;
  $('#toAccountInput').value = accNo;
  $('#actionModal').showModal();
};

document.querySelectorAll('[data-action]').forEach(b => {
  b.onclick = () => {
    action = b.dataset.action;
    $('#actionTitle').textContent = action === 'deposit' ? 'Add money' : action === 'withdraw' ? 'Withdraw funds' : 'Make a transfer';
    $('#actionEyebrow').textContent = action.toUpperCase();
    $('#recipientField').hidden = action !== 'transfer';
    $('#actionSubmit').innerHTML = (action === 'transfer' ? 'Transfer' : 'Confirm') + ' <b>→</b>';
    $('#actionModal').showModal();
  };
});

const payeeDropdown = $('#payeeSelectDropdown');
if (payeeDropdown) {
  payeeDropdown.onchange = e => { if (e.target.value) $('#toAccountInput').value = e.target.value; };
}

if ($('#actionForm')) {
  $('#actionForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(e.target));
      await request('/api/' + action, { method: 'POST', body: JSON.stringify(payload) });
      $('#actionModal').close();
      e.target.reset();
      await load();
      toast((action[0].toUpperCase() + action.slice(1)) + ' completed.');
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#quickOwnTransfer')) {
  $('#quickOwnTransfer').onclick = () => {
    const tabBtn = document.querySelector('[data-tab="tab-transfers"]');
    if (tabBtn) tabBtn.click();
  };
}
if ($('#ownTransferForm')) {
  $('#ownTransferForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await request('/api/transfer/own', { method: 'POST', body: JSON.stringify(body) });
      e.target.reset();
      await load();
      toast('Funds moved between accounts.');
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#openAddPayeeModal')) $('#openAddPayeeModal').onclick = () => $('#addPayeeModal').showModal();
if ($('#btnOpenAddPayee')) $('#btnOpenAddPayee').onclick = () => $('#addPayeeModal').showModal();
if ($('#addPayeeForm')) {
  $('#addPayeeForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/payees', { method: 'POST', body: JSON.stringify(body) });
      $('#addPayeeModal').close();
      e.target.reset();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#toggleDebitBtn')) {
  $('#toggleDebitBtn').onclick = async () => {
    try {
      const r = await request('/api/cards/toggle-block', { method: 'POST', body: JSON.stringify({ cardType: 'debit' }) });
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}
if ($('#toggleCreditBtn')) {
  $('#toggleCreditBtn').onclick = async () => {
    try {
      const r = await request('/api/cards/toggle-block', { method: 'POST', body: JSON.stringify({ cardType: 'credit' }) });
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#billPayForm')) {
  $('#billPayForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/bills/pay', { method: 'POST', body: JSON.stringify(body) });
      e.target.reset();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#fdForm')) {
  $('#fdForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/deposits/fd', { method: 'POST', body: JSON.stringify(body) });
      e.target.reset();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}
if ($('#rdForm')) {
  $('#rdForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/deposits/rd', { method: 'POST', body: JSON.stringify(body) });
      e.target.reset();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}
if ($('#openPpfModal')) $('#openPpfModal').onclick = () => $('#ppfModal').showModal();
if ($('#ppfForm')) {
  $('#ppfForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/invest/ppf', { method: 'POST', body: JSON.stringify(body) });
      $('#ppfModal').close();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}
if ($('#btnOpenDemat')) {
  $('#btnOpenDemat').onclick = async () => {
    try {
      const r = await request('/api/invest/demat', { method: 'POST', body: JSON.stringify({}) });
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}
if ($('#openMfModal')) $('#openMfModal').onclick = () => $('#mfModal').showModal();
if ($('#mfForm')) {
  $('#mfForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/invest/mf', { method: 'POST', body: JSON.stringify(body) });
      $('#mfModal').close();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#btnOpenLoanModal')) $('#btnOpenLoanModal').onclick = () => $('#loanModal').showModal();
if ($('#loanForm')) {
  $('#loanForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/loans/apply', { method: 'POST', body: JSON.stringify(body) });
      $('#loanModal').close();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#btnOpenInsuranceModal')) $('#btnOpenInsuranceModal').onclick = () => $('#insuranceModal').showModal();
if ($('#planSelect')) {
  $('#planSelect').onchange = e => {
    const opt = e.target.selectedOptions[0];
    $('#sumAssuredInput').value = opt.dataset.sum;
    $('#premiumInput').value = opt.dataset.prem;
  };
}
if ($('#insuranceForm')) {
  $('#insuranceForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/insurance/buy', { method: 'POST', body: JSON.stringify(body) });
      $('#insuranceModal').close();
      await load();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#btnOpenStopChequeModal')) $('#btnOpenStopChequeModal').onclick = () => $('#stopChequeModal').showModal();
if ($('#stopChequeForm')) {
  $('#stopChequeForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/cheques/stop', { method: 'POST', body: JSON.stringify(body) });
      $('#stopChequeModal').close();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#btnOpenFraudModal')) $('#btnOpenFraudModal').onclick = () => $('#fraudModal').showModal();
if ($('#fraudForm')) {
  $('#fraudForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/fraud/report', { method: 'POST', body: JSON.stringify(body) });
      $('#fraudModal').close();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#resetPin')) $('#resetPin').onclick = () => $('#pinModal').showModal();
if ($('#pinForm')) {
  $('#pinForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      const r = await request('/api/pin/reset', { method: 'POST', body: JSON.stringify(d) });
      $('#pinModal').close();
      e.target.reset();
      toast(r.message);
    } catch (err) { toast(err.message, true); }
  };
}

if ($('#balanceCheck')) {
  $('#balanceCheck').onclick = async () => {
    await load();
    toast('Available balance: ' + $('#balance').textContent);
  };
}

if ($('#logout')) {
  $('#logout').onclick = () => {
    localStorage.removeItem('auroraToken');
    token = null;
    location.assign('/');
  };
}

load();