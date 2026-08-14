'use strict';
/* =========================================================
   FinTrack — app.js
   Single source of truth for auth, session, and all app logic.
   Storage keys:
     fintrack_users            -> [{ username, name, password }]
     fintrack_current_user     -> "username" | null
     fintrack_user_<username>  -> { settings:{monthlyBudget}, transactions:[], savingsGoals:[] }
   ========================================================= */

/* ============ CONSTANTS ============ */
var USERS_KEY = 'fintrack_users';
var CURRENT_USER_KEY = 'fintrack_current_user';
function userDataKey(username) { return 'fintrack_user_' + username; }

var EXPENSE_CATEGORIES = ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Pendidikan', 'Kesehatan', 'Hiburan', 'Lainnya'];
var INCOME_CATEGORIES = ['Gaji', 'Bonus', 'Freelance', 'Bisnis', 'Lainnya'];

var CATEGORY_ICONS = {
  Makanan: '🍔', Transportasi: '🚗', Belanja: '🛍️', Tagihan: '🧾',
  Pendidikan: '📚', Kesehatan: '🏥', Hiburan: '🎮',
  Gaji: '💼', Bonus: '🎁', Freelance: '💻', Bisnis: '🏢', Lainnya: '📦'
};

var CATEGORY_COLORS = {
  Makanan: '#f59e0b', Transportasi: '#3b82f6', Belanja: '#ec4899', Tagihan: '#ef4444',
  Pendidikan: '#8b5cf6', Kesehatan: '#14b8a6', Hiburan: '#f97316', Lainnya: '#94a3b8'
};

/* ============ STATE ============ */
var currentUser = null;   // username string
var userData = null;      // { settings, transactions, savingsGoals }
var activeReportPeriod = 'weekly';
var confirmCallback = null;
var chartInstances = {}; // keep Chart.js instances to destroy before redraw

/* =========================================================
   UTILITIES
   ========================================================= */
function formatRupiah(num) {
  var n = Math.round(Number(num) || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function parseRupiah(str) {
  if (!str) return 0;
  var digits = String(str).replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  var d = new Date();
  var off = d.getTimezoneOffset();
  var local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateHuman(isoDate) {
  if (!isoDate) return '-';
  var parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function safeParseJSON(str, fallback) {
  try {
    var parsed = JSON.parse(str);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

/* =========================================================
   STORAGE HELPERS
   ========================================================= */
function getUsers() {
  return safeParseJSON(localStorage.getItem(USERS_KEY), []);
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function getCurrentUserFromStorage() {
  return localStorage.getItem(CURRENT_USER_KEY) || null;
}
function setCurrentUserInStorage(username) {
  if (username) {
    localStorage.setItem(CURRENT_USER_KEY, username);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}
function defaultUserData() {
  return { settings: { monthlyBudget: 0 }, transactions: [], savingsGoals: [] };
}
function loadUserData(username) {
  var raw = localStorage.getItem(userDataKey(username));
  var data = safeParseJSON(raw, null);
  if (!data) data = defaultUserData();
  if (!data.settings) data.settings = { monthlyBudget: 0 };
  if (typeof data.settings.monthlyBudget !== 'number') data.settings.monthlyBudget = Number(data.settings.monthlyBudget) || 0;
  if (!Array.isArray(data.transactions)) data.transactions = [];
  if (!Array.isArray(data.savingsGoals)) data.savingsGoals = [];
  return data;
}
function saveUserData(username, data) {
  localStorage.setItem(userDataKey(username), JSON.stringify(data));
}
function persistCurrentUserData() {
  if (!currentUser || !userData) return false;
  saveUserData(currentUser, userData);
  // verification read-back, per spec requirement for settings save
  var verify = safeParseJSON(localStorage.getItem(userDataKey(currentUser)), null);
  return !!verify;
}

/* =========================================================
   TOAST
   ========================================================= */
function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('toast-out');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 280);
  }, 2600);
}

/* =========================================================
   RIPPLE / MICRO INTERACTIONS
   ========================================================= */
function createRipple(e, el) {
  var rect = el.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height);
  var clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  var clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  if (typeof clientX !== 'number') { clientX = rect.left + rect.width / 2; clientY = rect.top + rect.height / 2; }
  var x = clientX - rect.left - size / 2;
  var y = clientY - rect.top - size / 2;
  var span = document.createElement('span');
  span.className = 'ripple-el';
  span.style.width = size + 'px';
  span.style.height = size + 'px';
  span.style.left = x + 'px';
  span.style.top = y + 'px';
  el.appendChild(span);
  setTimeout(function () {
    if (span.parentNode) span.parentNode.removeChild(span);
  }, 600);
}

function setupRippleDelegation() {
  var selector = '.btn, .nav-item, .fab, .icon-btn, .auth-tab, .type-btn, .report-tab, .tx-item, .goal-card, .pass-toggle';
  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest(selector) : null;
    if (!target) return;
    createRipple(e, target);
  });
}

/* =========================================================
   MODAL HELPERS
   ========================================================= */
function openModal(overlayId) {
  var overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(overlayId) {
  var overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}
function showConfirm(title, text, onConfirm) {
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalText').textContent = text;
  confirmCallback = onConfirm;
  openModal('confirmModalOverlay');
}

/* =========================================================
   RUPIAH LIVE-FORMAT INPUTS
   ========================================================= */
function attachRupiahFormatting(input) {
  if (!input) return;
  input.addEventListener('input', function () {
    var raw = parseRupiah(input.value);
    input.value = raw ? raw.toLocaleString('id-ID') : '';
  });
}

/* =========================================================
   AUTH SCREEN LOGIC
   ========================================================= */
function switchAuthTab(tab) {
  var tabLoginBtn = document.getElementById('tabLoginBtn');
  var tabRegisterBtn = document.getElementById('tabRegisterBtn');
  var loginForm = document.getElementById('loginForm');
  var registerForm = document.getElementById('registerForm');
  var tabsWrap = document.querySelector('.auth-tabs');

  if (tab === 'register') {
    tabLoginBtn.classList.remove('active');
    tabRegisterBtn.classList.add('active');
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    tabsWrap.classList.add('reg');
  } else {
    tabRegisterBtn.classList.remove('active');
    tabLoginBtn.classList.add('active');
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
    tabsWrap.classList.remove('reg');
  }
}

function clearFieldErrors(ids) {
  ids.forEach(function (id) {
    var errEl = document.getElementById(id + 'Error');
    var inputEl = document.getElementById(id);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('invalid');
  });
}

function setFieldError(id, message) {
  var errEl = document.getElementById(id + 'Error');
  var inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = message;
  if (inputEl) inputEl.classList.add('invalid');
}

function handleRegisterSubmit(e) {
  e.preventDefault();
  var name = document.getElementById('regName').value.trim();
  var username = document.getElementById('regUsername').value.trim();
  var password = document.getElementById('regPassword').value;
  var confirmPass = document.getElementById('regPasswordConfirm').value;
  var msgEl = document.getElementById('registerMsg');
  msgEl.textContent = '';
  msgEl.className = 'form-msg';

  clearFieldErrors(['regName', 'regUsername', 'regPassword', 'regPasswordConfirm']);

  var valid = true;
  var users = getUsers();

  if (!name) {
    setFieldError('regName', 'Nama wajib diisi.');
    valid = false;
  }
  if (username.length < 3) {
    setFieldError('regUsername', 'Username minimal 3 karakter.');
    valid = false;
  } else if (users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
    setFieldError('regUsername', 'Username sudah digunakan.');
    valid = false;
  }
  if (password.length < 6) {
    setFieldError('regPassword', 'Password minimal 6 karakter.');
    valid = false;
  }
  if (confirmPass !== password || !confirmPass) {
    setFieldError('regPasswordConfirm', 'Password dan konfirmasi harus sama.');
    valid = false;
  }

  if (!valid) return;

  users.push({ username: username, name: name, password: password });
  saveUsers(users);
  saveUserData(username, defaultUserData());

  document.getElementById('registerForm').reset();
  msgEl.textContent = 'Account berhasil dibuat. Silakan login.';
  msgEl.classList.add('success');

  switchAuthTab('login');
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('loginMsg').className = 'form-msg';
  showToast('Account berhasil dibuat. Silakan login.');
  setTimeout(function () { document.getElementById('loginPassword').focus(); }, 320);
}

function handleLoginSubmit(e) {
  e.preventDefault();
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value;
  var msgEl = document.getElementById('loginMsg');
  msgEl.textContent = '';
  msgEl.className = 'form-msg';
  clearFieldErrors(['loginUsername', 'loginPassword']);

  var users = getUsers();
  var found = users.find(function (u) {
    return u.username.toLowerCase() === username.toLowerCase() && u.password === password;
  });

  if (!found) {
    msgEl.textContent = 'Username atau password salah.';
    msgEl.classList.add('error');
    document.getElementById('loginUsername').classList.add('invalid');
    document.getElementById('loginPassword').classList.add('invalid');
    return;
  }

  loginUser(found.username, found.name);
}

function loginUser(username, name) {
  currentUser = username;
  userData = loadUserData(username);
  setCurrentUserInStorage(username);
  showAppScreen();
  showToast('Selamat datang, ' + name + '!');
}

function handleLogout() {
  currentUser = null;
  userData = null;
  setCurrentUserInStorage(null);
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
  clearFieldErrors(['loginUsername', 'loginPassword', 'regName', 'regUsername', 'regPassword', 'regPasswordConfirm']);
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('registerMsg').textContent = '';
  switchAuthTab('login');
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.remove('active');
}

function showAppScreen() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.add('active');
  var users = getUsers();
  var u = users.find(function (x) { return x.username === currentUser; });
  document.getElementById('greetUser').textContent = 'Halo, ' + (u ? u.name.split(' ')[0] : currentUser);
  document.getElementById('settingsName').value = u ? u.name : '';
  document.getElementById('settingsUsername').value = currentUser;
  switchPage('dashboard');
}

function setupPasswordToggles() {
  var toggles = document.querySelectorAll('.pass-toggle');
  toggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target');
      var input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.classList.add('showing');
      } else {
        input.type = 'password';
        btn.classList.remove('showing');
      }
    });
  });
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function switchPage(pageName) {
  var pages = document.querySelectorAll('.page');
  pages.forEach(function (p) { p.classList.remove('active'); });
  var target = document.getElementById('page-' + pageName);
  if (target) target.classList.add('active');

  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function (n) {
    n.classList.toggle('active', n.getAttribute('data-nav') === pageName);
  });

  document.getElementById('appMain').scrollTop = 0;
  window.scrollTo(0, 0);

  if (pageName === 'dashboard') renderDashboard();
  else if (pageName === 'transaksi') renderTransaksiPage();
  else if (pageName === 'tabungan') renderTabunganPage();
  else if (pageName === 'laporan') renderLaporanPage();
  else if (pageName === 'settings') renderSettingsPage();
}

function setupNavigation() {
  document.addEventListener('click', function (e) {
    var navBtn = e.target.closest ? e.target.closest('[data-nav]') : null;
    if (navBtn) {
      switchPage(navBtn.getAttribute('data-nav'));
    }
  });
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function getMonthRange(date) {
  var y = date.getFullYear(), m = date.getMonth();
  var start = new Date(y, m, 1);
  var end = new Date(y, m + 1, 0);
  return { start: start, end: end };
}

function isDateInRange(isoDate, start, end) {
  var d = new Date(isoDate + 'T00:00:00');
  return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
         d <= new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
}

function computeTotals(transactions) {
  var income = 0, expense = 0;
  transactions.forEach(function (t) {
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  });
  return { income: income, expense: expense, balance: income - expense };
}

function renderDashboard() {
  if (!userData) return;
  var now = new Date();
  var range = getMonthRange(now);
  var monthTx = userData.transactions.filter(function (t) { return isDateInRange(t.date, range.start, range.end); });
  var monthTotals = computeTotals(monthTx);
  var allTotals = computeTotals(userData.transactions);

  document.getElementById('dashTotalBalance').textContent = formatRupiah(allTotals.balance);
  document.getElementById('dashIncome').textContent = formatRupiah(monthTotals.income);
  document.getElementById('dashExpense').textContent = formatRupiah(monthTotals.expense);

  var budget = userData.settings.monthlyBudget || 0;
  var spent = monthTotals.expense;
  var percent = budget > 0 ? Math.min(999, Math.round((spent / budget) * 100)) : 0;
  var fillPercent = Math.min(100, percent);

  document.getElementById('dashBudgetPercent').textContent = percent + '%';
  document.getElementById('dashBudgetPercent').classList.toggle('over', percent > 100);
  document.getElementById('dashBudgetFill').style.width = fillPercent + '%';
  document.getElementById('dashBudgetFill').classList.toggle('over', percent > 100);
  document.getElementById('dashBudgetSpent').textContent = formatRupiah(spent) + ' terpakai';
  document.getElementById('dashBudgetTotal').textContent = 'dari ' + formatRupiah(budget);

  var remaining = budget - spent;
  document.getElementById('dashRemaining').textContent = formatRupiah(remaining);

  var goals = userData.savingsGoals;
  var totalTarget = goals.reduce(function (s, g) { return s + g.target; }, 0);
  var totalCurrent = goals.reduce(function (s, g) { return s + g.current; }, 0);
  var savingsPercent = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  document.getElementById('dashSavingsProgress').textContent = savingsPercent + '%';

  renderRecentTransactions();
  renderDashboardCharts();
}

function renderRecentTransactions() {
  var listEl = document.getElementById('dashRecentList');
  var sorted = userData.transactions.slice().sort(function (a, b) {
    return (b.date + b.id).localeCompare(a.date + a.id);
  }).slice(0, 5);

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="empty-state" style="padding:24px 8px;"><div class="empty-icon">💸</div><p>Belum ada transaksi. Tambahkan yang pertama!</p></div>';
    return;
  }
  listEl.innerHTML = sorted.map(renderTxItemHTML).join('');
  attachTxItemHandlers(listEl);
}

function renderTxItemHTML(t) {
  var icon = CATEGORY_ICONS[t.category] || '📦';
  var sign = t.type === 'income' ? '+' : '-';
  return '' +
    '<div class="tx-item" data-id="' + t.id + '">' +
      '<div class="tx-icon ' + t.type + '">' + icon + '</div>' +
      '<div class="tx-info">' +
        '<div class="tx-title">' + escapeHTML(t.description || t.category) + '</div>' +
        '<div class="tx-meta">' + escapeHTML(t.category) + ' &middot; ' + formatDateHuman(t.date) + '</div>' +
      '</div>' +
      '<div class="tx-amount ' + t.type + '">' + sign + ' ' + formatRupiah(t.amount) + '</div>' +
    '</div>';
}

function escapeHTML(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function attachTxItemHandlers(container) {
  container.querySelectorAll('.tx-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-id');
      openTxModalForEdit(id);
    });
  });
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function chartAvailable() {
  return typeof Chart !== 'undefined';
}

function renderDashboardCharts() {
  renderIncomeExpenseTrendChart();
  renderCategoryDoughnutChart('chartCategory', 'chartFallback2', getMonthTransactionsExpenseByCategory());
}

function getMonthTransactionsExpenseByCategory() {
  var now = new Date();
  var range = getMonthRange(now);
  var monthTx = userData.transactions.filter(function (t) {
    return t.type === 'expense' && isDateInRange(t.date, range.start, range.end);
  });
  var byCat = {};
  monthTx.forEach(function (t) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  return byCat;
}

function renderIncomeExpenseTrendChart() {
  var canvas = document.getElementById('chartIncomeExpense');
  var fallback = document.getElementById('chartFallback1');
  if (!chartAvailable()) {
    canvas.style.display = 'none';
    fallback.hidden = false;
    return;
  }
  canvas.style.display = 'block';
  fallback.hidden = true;

  var labels = [];
  var incomeData = [];
  var expenseData = [];
  var now = new Date();
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var range = getMonthRange(d);
    var tx = userData.transactions.filter(function (t) { return isDateInRange(t.date, range.start, range.end); });
    var totals = computeTotals(tx);
    var monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    labels.push(monthsShort[d.getMonth()]);
    incomeData.push(totals.income);
    expenseData.push(totals.expense);
  }

  try {
    destroyChart('incomeExpense');
    chartInstances.incomeExpense = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Pemasukan', data: incomeData, backgroundColor: '#22d3ee', borderRadius: 6, maxBarThickness: 16 },
          { label: 'Pengeluaran', data: expenseData, backgroundColor: '#a78bfa', borderRadius: 6, maxBarThickness: 16 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#a6a6bd', boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#a6a6bd', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#a6a6bd', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  } catch (err) {
    canvas.style.display = 'none';
    fallback.hidden = false;
  }
}

function renderCategoryDoughnutChart(canvasId, fallbackId, byCatObj) {
  var canvas = document.getElementById(canvasId);
  var fallback = document.getElementById(fallbackId);
  var labels = Object.keys(byCatObj);

  if (!chartAvailable()) {
    canvas.style.display = 'none';
    fallback.hidden = false;
    return;
  }
  if (labels.length === 0) {
    canvas.style.display = 'none';
    fallback.hidden = false;
    fallback.textContent = 'Belum ada data pengeluaran pada periode ini.';
    return;
  }
  canvas.style.display = 'block';
  fallback.hidden = true;

  var data = labels.map(function (l) { return byCatObj[l]; });
  var colors = labels.map(function (l) { return CATEGORY_COLORS[l] || '#94a3b8'; });

  try {
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { color: '#a6a6bd', boxWidth: 10, font: { size: 10.5 }, padding: 12 } } }
      }
    });
  } catch (err) {
    canvas.style.display = 'none';
    fallback.hidden = false;
  }
}

/* =========================================================
   TRANSAKSI PAGE
   ========================================================= */
function populateCategoryFilterOptions() {
  var select = document.getElementById('txFilterCategory');
  var all = EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES.filter(function (c) { return EXPENSE_CATEGORIES.indexOf(c) === -1; }));
  var unique = all.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
  select.innerHTML = '<option value="all">Semua Kategori</option>' +
    unique.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
}

function getFilteredTransactions() {
  var search = document.getElementById('txSearch').value.trim().toLowerCase();
  var type = document.getElementById('txFilterType').value;
  var category = document.getElementById('txFilterCategory').value;
  var from = document.getElementById('txFilterFrom').value;
  var to = document.getElementById('txFilterTo').value;

  return userData.transactions.filter(function (t) {
    if (type !== 'all' && t.type !== type) return false;
    if (category !== 'all' && t.category !== category) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (search) {
      var hay = (t.description + ' ' + t.category).toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  }).sort(function (a, b) { return (b.date + b.id).localeCompare(a.date + a.id); });
}

function renderTransaksiPage() {
  populateCategoryFilterOptions();
  renderTransaksiList();
}

function renderTransaksiList() {
  var listEl = document.getElementById('txListFull');
  var emptyEl = document.getElementById('txEmptyState');
  var filtered = getFilteredTransactions();

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = filtered.map(renderTxItemHTML).join('');
  attachTxItemHandlers(listEl);
}

function setupTransaksiFilters() {
  ['txSearch', 'txFilterType', 'txFilterCategory', 'txFilterFrom', 'txFilterTo'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', renderTransaksiList);
    el.addEventListener('change', renderTransaksiList);
  });
  document.getElementById('txFilterReset').addEventListener('click', function () {
    document.getElementById('txSearch').value = '';
    document.getElementById('txFilterType').value = 'all';
    document.getElementById('txFilterCategory').value = 'all';
    document.getElementById('txFilterFrom').value = '';
    document.getElementById('txFilterTo').value = '';
    renderTransaksiList();
  });
}

/* =========================================================
   TRANSAKSI MODAL (Add / Edit / Delete)
   ========================================================= */
function populateTxCategorySelect(type) {
  var select = document.getElementById('txCategory');
  var cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  select.innerHTML = cats.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
}

function setTxTypeUI(type) {
  document.getElementById('typeExpenseBtn').classList.toggle('active', type === 'expense');
  document.getElementById('typeIncomeBtn').classList.toggle('active', type === 'income');
  populateTxCategorySelect(type);
}

function openTxModalForAdd() {
  document.getElementById('txModalTitle').textContent = 'Tambah Transaksi';
  document.getElementById('txId').value = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txDescription').value = '';
  document.getElementById('txDate').value = todayISO();
  document.getElementById('txFormMsg').textContent = '';
  document.getElementById('txDeleteBtn').hidden = true;
  clearFieldErrors(['txAmount']);
  setTxTypeUI('expense');
  openModal('txModalOverlay');
}

function openTxModalForEdit(id) {
  var t = userData.transactions.find(function (x) { return x.id === id; });
  if (!t) return;
  document.getElementById('txModalTitle').textContent = 'Edit Transaksi';
  document.getElementById('txId').value = t.id;
  setTxTypeUI(t.type);
  document.getElementById('txCategory').value = t.category;
  document.getElementById('txAmount').value = t.amount.toLocaleString('id-ID');
  document.getElementById('txDescription').value = t.description || '';
  document.getElementById('txDate').value = t.date;
  document.getElementById('txFormMsg').textContent = '';
  document.getElementById('txDeleteBtn').hidden = false;
  clearFieldErrors(['txAmount']);
  openModal('txModalOverlay');
}

function handleTxTypeToggle() {
  document.getElementById('typeExpenseBtn').addEventListener('click', function () { setTxTypeUI('expense'); });
  document.getElementById('typeIncomeBtn').addEventListener('click', function () { setTxTypeUI('income'); });
}

function handleTxFormSubmit(e) {
  e.preventDefault();
  clearFieldErrors(['txAmount']);
  var id = document.getElementById('txId').value;
  var type = document.getElementById('typeIncomeBtn').classList.contains('active') ? 'income' : 'expense';
  var amount = parseRupiah(document.getElementById('txAmount').value);
  var category = document.getElementById('txCategory').value;
  var description = document.getElementById('txDescription').value.trim();
  var date = document.getElementById('txDate').value || todayISO();

  if (!amount || amount <= 0) {
    setFieldError('txAmount', 'Nominal harus lebih dari 0.');
    return;
  }

  if (id) {
    var idx = userData.transactions.findIndex(function (x) { return x.id === id; });
    if (idx !== -1) {
      userData.transactions[idx] = { id: id, type: type, amount: amount, category: category, description: description, date: date };
    }
  } else {
    userData.transactions.push({ id: generateId(), type: type, amount: amount, category: category, description: description, date: date });
  }

  saveUserData(currentUser, userData);
  closeModal('txModalOverlay');
  showToast(id ? 'Transaksi berhasil diperbarui.' : 'Transaksi berhasil ditambahkan.');
  refreshAllViews();
}

function handleTxDelete() {
  var id = document.getElementById('txId').value;
  if (!id) return;
  showConfirm('Hapus Transaksi', 'Transaksi ini akan dihapus secara permanen. Lanjutkan?', function () {
    userData.transactions = userData.transactions.filter(function (t) { return t.id !== id; });
    saveUserData(currentUser, userData);
    closeModal('txModalOverlay');
    showToast('Transaksi berhasil dihapus.');
    refreshAllViews();
  });
}

/* =========================================================
   TABUNGAN PAGE
   ========================================================= */
function renderTabunganPage() {
  var listEl = document.getElementById('goalsList');
  var emptyEl = document.getElementById('goalsEmptyState');
  var goals = userData.savingsGoals;

  if (goals.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = goals.map(renderGoalCardHTML).join('');

  listEl.querySelectorAll('.goal-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      openGoalModalForEdit(card.getAttribute('data-id'));
    });
  });
  listEl.querySelectorAll('[data-action="add-fund"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      createRipple(e, btn);
      e.stopPropagation();
      openFundModal(btn.getAttribute('data-id'), 'add');
    });
  });
  listEl.querySelectorAll('[data-action="sub-fund"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      createRipple(e, btn);
      e.stopPropagation();
      openFundModal(btn.getAttribute('data-id'), 'subtract');
    });
  });

  setTimeout(function () {
    listEl.querySelectorAll('.progress-fill[data-target-width]').forEach(function (el) {
      el.style.width = el.getAttribute('data-target-width') + '%';
    });
  }, 30);
}

function renderGoalCardHTML(g) {
  var percent = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
  return '' +
    '<div class="card glass goal-card" data-id="' + g.id + '">' +
      '<div class="goal-head">' +
        '<div>' +
          '<div class="goal-name">' + escapeHTML(g.name) + '</div>' +
          '<div class="goal-sub">' + formatRupiah(g.current) + ' dari ' + formatRupiah(g.target) + '</div>' +
        '</div>' +
        '<div class="goal-percent">' + percent + '%</div>' +
      '</div>' +
      '<div class="progress-track"><div class="progress-fill" data-target-width="' + percent + '" style="width:0%"></div></div>' +
      '<div class="goal-more-actions">' +
        '<button type="button" class="btn btn-ghost" data-action="add-fund" data-id="' + g.id + '">+ Dana</button>' +
        '<button type="button" class="btn btn-ghost" data-action="sub-fund" data-id="' + g.id + '">- Dana</button>' +
      '</div>' +
    '</div>';
}

function openGoalModalForAdd() {
  document.getElementById('goalModalTitle').textContent = 'Target Tabungan Baru';
  document.getElementById('goalId').value = '';
  document.getElementById('goalName').value = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalCurrent').value = '';
  document.getElementById('goalFormMsg').textContent = '';
  document.getElementById('goalDeleteBtn').hidden = true;
  clearFieldErrors(['goalName', 'goalTarget']);
  openModal('goalModalOverlay');
}

function openGoalModalForEdit(id) {
  var g = userData.savingsGoals.find(function (x) { return x.id === id; });
  if (!g) return;
  document.getElementById('goalModalTitle').textContent = 'Edit Target Tabungan';
  document.getElementById('goalId').value = g.id;
  document.getElementById('goalName').value = g.name;
  document.getElementById('goalTarget').value = g.target.toLocaleString('id-ID');
  document.getElementById('goalCurrent').value = g.current.toLocaleString('id-ID');
  document.getElementById('goalFormMsg').textContent = '';
  document.getElementById('goalDeleteBtn').hidden = false;
  clearFieldErrors(['goalName', 'goalTarget']);
  openModal('goalModalOverlay');
}

function handleGoalFormSubmit(e) {
  e.preventDefault();
  clearFieldErrors(['goalName', 'goalTarget']);
  var id = document.getElementById('goalId').value;
  var name = document.getElementById('goalName').value.trim();
  var target = parseRupiah(document.getElementById('goalTarget').value);
  var current = parseRupiah(document.getElementById('goalCurrent').value);

  var valid = true;
  if (!name) { setFieldError('goalName', 'Nama target wajib diisi.'); valid = false; }
  if (!target || target <= 0) { setFieldError('goalTarget', 'Target harus lebih dari 0.'); valid = false; }
  if (!valid) return;

  if (id) {
    var idx = userData.savingsGoals.findIndex(function (x) { return x.id === id; });
    if (idx !== -1) {
      userData.savingsGoals[idx].name = name;
      userData.savingsGoals[idx].target = target;
      userData.savingsGoals[idx].current = current;
    }
  } else {
    userData.savingsGoals.push({ id: generateId(), name: name, target: target, current: current });
  }

  saveUserData(currentUser, userData);
  closeModal('goalModalOverlay');
  showToast(id ? 'Target tabungan diperbarui.' : 'Target tabungan ditambahkan.');
  refreshAllViews();
}

function handleGoalDelete() {
  var id = document.getElementById('goalId').value;
  if (!id) return;
  showConfirm('Hapus Target Tabungan', 'Target tabungan ini akan dihapus. Lanjutkan?', function () {
    userData.savingsGoals = userData.savingsGoals.filter(function (g) { return g.id !== id; });
    saveUserData(currentUser, userData);
    closeModal('goalModalOverlay');
    showToast('Target tabungan dihapus.');
    refreshAllViews();
  });
}

function openFundModal(goalId, mode) {
  document.getElementById('fundGoalId').value = goalId;
  document.getElementById('fundMode').value = mode;
  document.getElementById('fundAmount').value = '';
  document.getElementById('fundFormMsg').textContent = '';
  clearFieldErrors(['fundAmount']);
  document.getElementById('fundModalTitle').textContent = mode === 'add' ? 'Tambah Dana' : 'Kurangi Dana';
  document.getElementById('fundSaveBtn').textContent = mode === 'add' ? 'Tambah Dana' : 'Kurangi Dana';
  openModal('fundModalOverlay');
}

function handleFundFormSubmit(e) {
  e.preventDefault();
  clearFieldErrors(['fundAmount']);
  var goalId = document.getElementById('fundGoalId').value;
  var mode = document.getElementById('fundMode').value;
  var amount = parseRupiah(document.getElementById('fundAmount').value);

  if (!amount || amount <= 0) {
    setFieldError('fundAmount', 'Nominal harus lebih dari 0.');
    return;
  }

  var goal = userData.savingsGoals.find(function (g) { return g.id === goalId; });
  if (!goal) return;

  if (mode === 'add') {
    goal.current += amount;
  } else {
    goal.current = Math.max(0, goal.current - amount);
  }

  saveUserData(currentUser, userData);
  closeModal('fundModalOverlay');
  showToast(mode === 'add' ? 'Dana berhasil ditambahkan.' : 'Dana berhasil dikurangi.');
  refreshAllViews();
}

/* =========================================================
   LAPORAN PAGE
   ========================================================= */
function getReportRange(period) {
  var now = new Date();
  var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var start;
  if (period === 'weekly') {
    start = new Date(end);
    start.setDate(end.getDate() - 6);
  } else if (period === 'yearly') {
    start = new Date(now.getFullYear(), 0, 1);
    end.setFullYear(now.getFullYear()); end.setMonth(11); end.setDate(31);
  } else {
    var range = getMonthRange(now);
    start = range.start; end = range.end;
  }
  return { start: start, end: end };
}

function getReportPeriodLabel(period) {
  var now = new Date();
  var months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (period === 'weekly') {
    var r = getReportRange('weekly');
    return formatDateHuman(isoFromDate(r.start)) + ' - ' + formatDateHuman(isoFromDate(r.end));
  } else if (period === 'yearly') {
    return 'Tahun ' + now.getFullYear();
  }
  return months[now.getMonth()] + ' ' + now.getFullYear();
}

function isoFromDate(d) {
  var off = d.getTimezoneOffset();
  var local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function renderLaporanPage() {
  setupReportTabsUI();
  renderReportContent();
}

function setupReportTabsUI() {
  var tabs = document.querySelectorAll('.report-tab');
  tabs.forEach(function (tab) {
    tab.classList.toggle('active', tab.getAttribute('data-period') === activeReportPeriod);
  });
}

function renderReportContent() {
  var range = getReportRange(activeReportPeriod);
  var filtered = userData.transactions.filter(function (t) { return isDateInRange(t.date, range.start, range.end); });
  var totals = computeTotals(filtered);

  document.getElementById('repIncome').textContent = formatRupiah(totals.income);
  document.getElementById('repExpense').textContent = formatRupiah(totals.expense);
  var diffEl = document.getElementById('repDiff');
  diffEl.textContent = formatRupiah(totals.balance);
  diffEl.className = totals.balance >= 0 ? 'pos' : 'neg';

  var byCat = {};
  filtered.filter(function (t) { return t.type === 'expense'; }).forEach(function (t) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });

  renderCategoryBreakdownList(byCat, totals.expense);
  renderReportChart(totals);

  var listEl = document.getElementById('repTxList');
  var sorted = filtered.slice().sort(function (a, b) { return (b.date + b.id).localeCompare(a.date + a.id); });
  listEl.innerHTML = sorted.length ? sorted.map(renderTxItemHTML).join('') :
    '<div class="empty-state" style="padding:24px 8px;"><div class="empty-icon">📄</div><p>Tidak ada transaksi pada periode ini.</p></div>';
  attachTxItemHandlers(listEl);
}

function renderCategoryBreakdownList(byCat, totalExpense) {
  var el = document.getElementById('repCategoryBreakdown');
  var cats = Object.keys(byCat);
  if (cats.length === 0) {
    el.innerHTML = '<p style="font-size:12.5px;color:var(--text-dim);">Belum ada pengeluaran pada periode ini.</p>';
    return;
  }
  cats.sort(function (a, b) { return byCat[b] - byCat[a]; });
  el.innerHTML = cats.map(function (c) {
    var pct = totalExpense > 0 ? Math.round((byCat[c] / totalExpense) * 100) : 0;
    return '<div class="cat-row">' +
      '<span class="cat-dot" style="background:' + (CATEGORY_COLORS[c] || '#94a3b8') + '"></span>' +
      '<span class="cat-name">' + escapeHTML(c) + ' (' + pct + '%)</span>' +
      '<span class="cat-amount">' + formatRupiah(byCat[c]) + '</span>' +
    '</div>';
  }).join('');
}

function renderReportChart(totals) {
  var canvas = document.getElementById('chartReport');
  var fallback = document.getElementById('chartFallback3');
  if (!chartAvailable()) {
    canvas.style.display = 'none';
    fallback.hidden = false;
    return;
  }
  canvas.style.display = 'block';
  fallback.hidden = true;
  try {
    destroyChart('report');
    chartInstances.report = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Pemasukan', 'Pengeluaran'],
        datasets: [{
          data: [totals.income, totals.expense],
          backgroundColor: ['#22d3ee', '#a78bfa'],
          borderRadius: 8,
          maxBarThickness: 60
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#a6a6bd' }, grid: { display: false } },
          y: { ticks: { color: '#a6a6bd' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  } catch (err) {
    canvas.style.display = 'none';
    fallback.hidden = false;
  }
}

function setupReportTabs() {
  document.getElementById('reportTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.report-tab');
    if (!btn) return;
    activeReportPeriod = btn.getAttribute('data-period');
    setupReportTabsUI();
    renderReportContent();
  });
}

/* =========================================================
   PDF EXPORT
   ========================================================= */
function handleDownloadPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('Library PDF gagal dimuat. Periksa koneksi internet dan coba lagi.', 'error');
    return;
  }
  try {
    generateReportPdf();
    showToast('Laporan PDF berhasil dibuat.');
  } catch (err) {
    showToast('Gagal membuat PDF: ' + (err && err.message ? err.message : 'terjadi kesalahan.'), 'error');
  }
}

function generateReportPdf() {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'a4' });
  var pageWidth = doc.internal.pageSize.getWidth();
  var pageHeight = doc.internal.pageSize.getHeight();
  var margin = 40;
  var y = margin;

  var users = getUsers();
  var u = users.find(function (x) { return x.username === currentUser; });
  var userName = u ? u.name : currentUser;

  var range = getReportRange(activeReportPeriod);
  var filtered = userData.transactions.filter(function (t) { return isDateInRange(t.date, range.start, range.end); });
  var totals = computeTotals(filtered);
  var periodLabel = getReportPeriodLabel(activeReportPeriod);
  var periodTitle = activeReportPeriod === 'weekly' ? 'Laporan Mingguan' : activeReportPeriod === 'yearly' ? 'Laporan Tahunan' : 'Laporan Bulanan';

  // --- Header with logo mark ---
  doc.setFillColor(124, 58, 237);
  doc.roundedRect(margin, y, 30, 30, 7, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('F', margin + 15, y + 21, { align: 'center' });

  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FinTrack', margin + 40, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 130);
  doc.text('Kelola uang. Lebih bebas.', margin + 40, y + 33);

  y += 55;
  doc.setDrawColor(230, 230, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(periodTitle, margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(90, 90, 110);
  doc.text('Nama pengguna: ' + userName, margin, y);
  y += 14;
  doc.text('Periode: ' + periodLabel, margin, y);
  y += 14;
  doc.text('Dibuat pada: ' + formatDateHuman(todayISO()), margin, y);
  y += 26;

  // --- Summary boxes ---
  var boxW = (pageWidth - margin * 2 - 20) / 3;
  var boxH = 56;
  var summaries = [
    { label: 'Total Pemasukan', value: formatRupiah(totals.income), color: [16, 185, 129] },
    { label: 'Total Pengeluaran', value: formatRupiah(totals.expense), color: [244, 63, 94] },
    { label: 'Saldo', value: formatRupiah(totals.balance), color: [124, 58, 237] }
  ];
  summaries.forEach(function (s, i) {
    var bx = margin + i * (boxW + 10);
    doc.setFillColor(248, 247, 252);
    doc.roundedRect(bx, y, boxW, boxH, 8, 8, 'F');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 140);
    doc.text(s.label, bx + 10, y + 20);
    doc.setFontSize(12.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(s.color[0], s.color[1], s.color[2]);
    doc.text(s.value, bx + 10, y + 40);
    doc.setFont('helvetica', 'normal');
  });
  y += boxH + 26;

  // --- Chart image ---
  try {
    var reportCanvas = document.getElementById('chartReport');
    if (reportCanvas && chartAvailable() && chartInstances.report) {
      var imgData = reportCanvas.toDataURL('image/png', 1.0);
      var imgW = pageWidth - margin * 2;
      var imgH = 150;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 30);
      doc.text('Grafik Pemasukan vs Pengeluaran', margin, y);
      y += 10;
      doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 24;
    }
  } catch (e) { /* chart image optional, ignore failure */ }

  if (y > pageHeight - 120) { doc.addPage(); y = margin; }

  // --- Category breakdown ---
  var byCat = {};
  filtered.filter(function (t) { return t.type === 'expense'; }).forEach(function (t) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  var catKeys = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text('Breakdown Kategori Pengeluaran', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  if (catKeys.length === 0) {
    doc.setTextColor(120, 120, 140);
    doc.text('Tidak ada pengeluaran pada periode ini.', margin, y);
    y += 16;
  } else {
    catKeys.forEach(function (c) {
      if (y > pageHeight - 60) { doc.addPage(); y = margin; }
      var pct = totals.expense > 0 ? Math.round((byCat[c] / totals.expense) * 100) : 0;
      doc.setTextColor(60, 60, 80);
      doc.text(c + ' (' + pct + '%)', margin, y);
      doc.text(formatRupiah(byCat[c]), pageWidth - margin, y, { align: 'right' });
      y += 15;
    });
  }
  y += 12;

  if (y > pageHeight - 100) { doc.addPage(); y = margin; }

  // --- Transactions table ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text('Daftar Transaksi', margin, y);
  y += 18;

  var colX = { date: margin, cat: margin + 70, desc: margin + 170, type: pageWidth - margin - 140, amount: pageWidth - margin };
  drawPdfTableHeader();

  function drawPdfTableHeader() {
    doc.setFillColor(124, 58, 237);
    doc.rect(margin, y - 12, pageWidth - margin * 2, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('Tanggal', colX.date + 4, y);
    doc.text('Kategori', colX.cat + 4, y);
    doc.text('Deskripsi', colX.desc + 4, y);
    doc.text('Jenis', colX.type, y);
    doc.text('Nominal', colX.amount, y, { align: 'right' });
    y += 14;
    doc.setFont('helvetica', 'normal');
  }

  var sortedTx = filtered.slice().sort(function (a, b) { return (a.date + a.id).localeCompare(b.date + b.id); });

  if (sortedTx.length === 0) {
    doc.setTextColor(120, 120, 140);
    doc.setFontSize(10);
    doc.text('Tidak ada transaksi pada periode ini.', margin, y);
    y += 16;
  } else {
    sortedTx.forEach(function (t, idx) {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin;
        drawPdfTableHeader();
      }
      if (idx % 2 === 0) {
        doc.setFillColor(248, 247, 252);
        doc.rect(margin, y - 10, pageWidth - margin * 2, 16, 'F');
      }
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 80);
      doc.text(formatDateHuman(t.date), colX.date + 4, y);
      doc.text(truncateText(doc, t.category, 90), colX.cat + 4, y);
      doc.text(truncateText(doc, t.description || '-', 130), colX.desc + 4, y);
      doc.setTextColor(t.type === 'income' ? 16 : 244, t.type === 'income' ? 185 : 63, t.type === 'income' ? 129 : 94);
      doc.text(t.type === 'income' ? 'Masuk' : 'Keluar', colX.type, y);
      doc.text((t.type === 'income' ? '+' : '-') + formatRupiah(t.amount), colX.amount, y, { align: 'right' });
      y += 16;
    });
  }

  // --- Footer on every page ---
  var pageCount = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(230, 230, 240);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 140, 160);
    doc.text('Generated by FinTrack', margin, pageHeight - 20);
    doc.text('Halaman ' + p + ' dari ' + pageCount, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }

  var fileName = 'FinTrack_Laporan_' + activeReportPeriod + '_' + todayISO() + '.pdf';
  doc.save(fileName);
}

function truncateText(doc, text, maxWidth) {
  text = text == null ? '' : String(text);
  if (doc.getTextWidth(text) <= maxWidth) return text;
  while (text.length > 1 && doc.getTextWidth(text + '...') > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + '...';
}

/* =========================================================
   SETTINGS PAGE
   ========================================================= */
function renderSettingsPage() {
  var users = getUsers();
  var u = users.find(function (x) { return x.username === currentUser; });
  document.getElementById('settingsName').value = u ? u.name : '';
  document.getElementById('settingsUsername').value = currentUser;
  var budget = userData.settings.monthlyBudget || 0;
  document.getElementById('settingsBudget').value = budget ? budget.toLocaleString('id-ID') : '';
}

function handleSaveSettings() {
  var budget = parseRupiah(document.getElementById('settingsBudget').value);
  userData.settings.monthlyBudget = budget;
  var ok = persistCurrentUserData();

  if (ok) {
    showToast('✓ Pengaturan berhasil disimpan');
  } else {
    showToast('Gagal menyimpan pengaturan. Coba lagi.', 'error');
    return;
  }
  refreshAllViews();
}

function handleResetData() {
  showConfirm('Reset Data', 'Semua transaksi, budget, dan tabungan kamu akan dihapus permanen. Akun tetap ada. Lanjutkan?', function () {
    userData = defaultUserData();
    saveUserData(currentUser, userData);
    showToast('Data berhasil direset.');
    refreshAllViews();
  });
}

/* =========================================================
   REFRESH ALL VIEWS (after any data mutation)
   ========================================================= */
function refreshAllViews() {
  var activePage = document.querySelector('.page.active');
  var activeId = activePage ? activePage.id.replace('page-', '') : 'dashboard';
  // Always refresh dashboard numbers even if not visible, cheap enough to only do on demand:
  switchPage(activeId);
}

/* =========================================================
   CONFIRM MODAL WIRING
   ========================================================= */
function setupConfirmModal() {
  document.getElementById('confirmOkBtn').addEventListener('click', function () {
    var cb = confirmCallback;
    confirmCallback = null;
    closeModal('confirmModalOverlay');
    if (typeof cb === 'function') cb();
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', function () {
    confirmCallback = null;
    closeModal('confirmModalOverlay');
  });
}

/* =========================================================
   GENERIC MODAL CLOSE (backdrop + close buttons)
   ========================================================= */
function setupModalClosers() {
  var overlayCloseMap = [
    ['txModalOverlay', 'txModalClose'],
    ['goalModalOverlay', 'goalModalClose'],
    ['fundModalOverlay', 'fundModalClose']
  ];
  overlayCloseMap.forEach(function (pair) {
    var overlayId = pair[0], closeBtnId = pair[1];
    document.getElementById(closeBtnId).addEventListener('click', function () { closeModal(overlayId); });
    document.getElementById(overlayId).addEventListener('click', function (e) {
      if (e.target.id === overlayId) closeModal(overlayId);
    });
  });
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  setupRippleDelegation();
  setupPasswordToggles();
  setupNavigation();
  setupConfirmModal();
  setupModalClosers();
  setupTransaksiFilters();
  setupReportTabs();
  handleTxTypeToggle();

  document.getElementById('tabLoginBtn').addEventListener('click', function () { switchAuthTab('login'); });
  document.getElementById('tabRegisterBtn').addEventListener('click', function () { switchAuthTab('register'); });
  document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
  document.getElementById('registerForm').addEventListener('submit', handleRegisterSubmit);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.getElementById('fabAddTx').addEventListener('click', openTxModalForAdd);
  document.getElementById('txForm').addEventListener('submit', handleTxFormSubmit);
  document.getElementById('txDeleteBtn').addEventListener('click', handleTxDelete);

  document.getElementById('addGoalBtn').addEventListener('click', openGoalModalForAdd);
  document.getElementById('goalForm').addEventListener('submit', handleGoalFormSubmit);
  document.getElementById('goalDeleteBtn').addEventListener('click', handleGoalDelete);
  document.getElementById('fundForm').addEventListener('submit', handleFundFormSubmit);

  document.getElementById('downloadPdfBtn').addEventListener('click', handleDownloadPdf);
  document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
  document.getElementById('resetDataBtn').addEventListener('click', handleResetData);

  attachRupiahFormatting(document.getElementById('settingsBudget'));
  attachRupiahFormatting(document.getElementById('txAmount'));
  attachRupiahFormatting(document.getElementById('goalTarget'));
  attachRupiahFormatting(document.getElementById('goalCurrent'));
  attachRupiahFormatting(document.getElementById('fundAmount'));

  // Session check
  var savedUsername = getCurrentUserFromStorage();
  var users = getUsers();
  var validUser = savedUsername && users.some(function (u) { return u.username === savedUsername; });

  if (validUser) {
    currentUser = savedUsername;
    userData = loadUserData(currentUser);
    showAppScreen();
  } else {
    if (savedUsername) setCurrentUserInStorage(null);
    showAuthScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);
