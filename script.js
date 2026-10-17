// ============================================================
// 0. SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://omzcojsvdrnwzozfvwog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9temNvanN2ZHJud3pvemZ2d29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NjY1OTcsImV4cCI6MjEwNzQ0MjU5N30.etxBU7ZnEJJSeYmkPWOGke0Fbi6KHcXd39G9GYzrG30';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'finance_hub' }   // tables live in the finance_hub schema (not public)
});

// ============================================================
// 1. SECURE LOGIN (Supabase Auth)
// ============================================================
let sessionTimeout;
let warningTimeout;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 daqiiqo
const WARNING_TIME = 60 * 1000; // 1 daqiiqo ka hor warning
let currentUser = null;

function resetSessionTimer() {
    clearTimeout(sessionTimeout);
    clearTimeout(warningTimeout);
    const warningEl = document.getElementById('sessionWarning');
    if (warningEl) warningEl.classList.add('hidden');

    // Show warning 1 minute before timeout
    warningTimeout = setTimeout(() => {
        const warningEl2 = document.getElementById('sessionWarning');
        if (warningEl2) warningEl2.classList.remove('hidden');
    }, SESSION_TIMEOUT - WARNING_TIME);

    sessionTimeout = setTimeout(() => {
        const warningEl3 = document.getElementById('sessionWarning');
        if (warningEl3) warningEl3.classList.add('hidden');
        handleLogout(true);
        alert(currentLang === 'en' ? "Your session has expired due to inactivity. Please login in again." : "Kulankaagu wuu dhacay sababo la xiriira maqnaansho. Fadlan mar kale gal.");
    }, SESSION_TIMEOUT);
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const errorEl = document.getElementById('loginError');
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');

    if (!username || !password) {
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Please feild out this form!';
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    errorEl.classList.add('hidden');

    const { data, error } = await sb.auth.signInWithPassword({ email: username, password });

    if (submitBtn) submitBtn.disabled = false;

    if (error || !data.session) {
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Invalid Credentials!';
        return;
    }

    currentUser = data.user;
    await showApp();
}

async function handleLogout(force = false) {
    if (!force) {
        const message = currentLang === 'en'
            ? 'Are you sure you want to log out?'
            : 'Ma hubtaa inaad rabto inaad ka baxdo nidaamka?';
        if (!confirm(message)) return;
    }
    await sb.auth.signOut();
    currentUser = null;
    clearTimeout(sessionTimeout);
    clearTimeout(warningTimeout);
    const warningEl = document.getElementById('sessionWarning');
    if (warningEl) warningEl.classList.add('hidden');
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.classList.add('hidden');
    const loginPage = document.getElementById('loginPage');
    if (loginPage) loginPage.classList.remove('hidden');
    const loginPass = document.getElementById('loginPass');
    if (loginPass) loginPass.value = '';
}

function confirmLogout() {
    return handleLogout(false);
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    icon.className = showing ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
}

async function showApp() {
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');
    if (loginPage) loginPage.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    resetSessionTimer();
    await initApp();
}

// ============================================================
// 2. APP LOGIC (state now loaded from Supabase)
// ============================================================
let accounts = {};
let loans = [];
let transactions = [];
let profile = { name: "User", role: "System Administrator" };
let currentLang = 'so';
let currentTheme = 'dark';
let isBalancesHidden = false;
const hiddenWallets = new Set();

// ============================================================
// 2b. HOME DASHBOARD — WALLET / BANK ICON CONFIG
// ============================================================
// Somali note: si lacagahani ay isugu keenaan (Check balance) sax ah,
// fh_accounts (Supabase) waa inay ka kooban tahay safaf (rows) 'key'-gooda
// la mid ah kuwan hoose. 'group' waxa uu go'aamiyaa PIN-ka loo baahan yahay
// (wallets = 4 lambar, 2528 · banks = 6 lambar, 252829) — 'currencies' waxa
// ay go'aamisaa lacagta uu wallet-kaasi ku shaqeeyo (USD/SLSH ama ETB).
// Ebirr wuxuu leeyahay laba xisaab (ebirr_kaafi, ebirr_coopay) oo mid
// card ah lagu daawan karo.
const WALLET_TILES = [
    { id: 'cash',       group: 'wallets', label: 'Cash',       icon: 'images-wallet-icons/cash1.png',        keys: ['cash'],       currencies: ['USD', 'SLSH', 'ETB'] },
    { id: 'zaad',       group: 'wallets', label: 'Zaad',       icon: 'images-wallet-icons/zaad.png',       keys: ['zaad'],       currencies: ['USD', 'SLSH'] },
    { id: 'edahab',     group: 'wallets', label: 'eDahab',     icon: 'images-wallet-icons/edahab.png',      keys: ['edahab'],     currencies: ['USD', 'SLSH'] },
    { id: 'kaashplus',  group: 'wallets', label: 'Kashplus',   icon: 'images-wallet-icons/kaashplus.png',   keys: ['kaashplus'],  currencies: ['USD', 'SLSH'] },
    { id: 'ebirr',      group: 'wallets', label: 'ebirr',      icon: 'images-wallet-icons/ebirr.png',       currencies: ['ETB'],
        subAccounts: [
            { key: 'ebirr_kaafi',  label: 'Ebirr Kaafi' },
            { key: 'ebirr_coopay', label: 'Coopay Ebirr' }
        ] },
    { id: 'telebirr',   group: 'wallets', label: 'Telebirr',   icon: 'images-wallet-icons/telebirr.png',   keys: ['telebirr'],   currencies: ['ETB'] },
    { id: 'mpesa',      group: 'wallets', label: 'm-pesa',     icon: 'images-wallet-icons/mpesa.png',       keys: ['mpesa'],      currencies: ['ETB'] },
    { id: 'darasalaam', group: 'banks',   label: 'Darasalaam', icon: 'images-wallet-icons/darasalaam.png', keys: ['darasalaam'], currencies: ['USD', 'SLSH'] },
    { id: 'dahabshiil', group: 'banks',   label: 'Dahabshiil', icon: 'images-wallet-icons/dahabshiil.png',  keys: ['dahabshiil'], currencies: ['USD', 'SLSH'] },
    { id: 'kaafimf',    group: 'banks',   label: 'Kaafimf',    icon: 'images-wallet-icons/kaafimf.png',    keys: ['kaafimf'],    currencies: ['ETB'] },
    { id: 'coopbank',   group: 'banks',   label: 'Coopbank',   icon: 'images-wallet-icons/coopbank.png',    keys: ['coopbank'],   currencies: ['ETB'] },
    { id: 'demo', demo: true, group: 'wallets', label: 'Demo', icon: 'fa-solid fa-flask', currencies: ['USD', 'SLSH', 'ETB'],
        sample: { USD: 0.00, SLSH: 0.00, ETB: 0.00 } },
    { id: 'soon1', soon: true, label: 'Soon!' }
];
const WALLET_GROUP_PINS = { wallets: '2528', banks: '252829' };

function tileAccountKeys(tile) {
    if (tile.subAccounts) return tile.subAccounts.map(s => s.key);
    return tile.keys || [];
}
function getAccountCurrencyValue(key, currency) {
    const acc = accounts[key];
    if (!acc || !acc.currencies) return 0;
    return Number(acc.currencies[currency]) || 0;
}
function tileTotalForCurrency(tile, currency) {
    if (tile.demo) return tile.sample[currency] || 0;
    return tileAccountKeys(tile).reduce((sum, key) => sum + getAccountCurrencyValue(key, currency), 0);
}

async function loadAllData() {
    const [accRes, loanRes, txRes, profRes] = await Promise.all([
        sb.from('fh_accounts').select('*').order('created_at', { ascending: true }),
        sb.from('fh_loans').select('*').order('created_at', { ascending: false }),
        sb.from('fh_transactions').select('*').order('date', { ascending: false }),
        sb.from('fh_profile').select('*').maybeSingle()
    ]);

    accounts = {};
    (accRes.data || []).forEach(row => {
        accounts[row.key] = { label: row.label, currencies: row.currencies };
    });

    loans = (loanRes.data || []).map(l => ({
        id: l.id,
        debtor: l.debtor,
        sourceKey: l.source_key,
        sourceLabel: l.source_label,
        currency: l.currency,
        originalAmount: Number(l.original_amount),
        remainingAmount: Number(l.remaining_amount),
        status: l.status
    }));

    transactions = (txRes.data || []).map(t => ({
        id: t.id,
        type: t.type,
        account: t.account,
        currency: t.currency,
        amount: Number(t.amount),
        description: t.description,
        date: t.date
    }));

    if (profRes.data) {
        profile = { name: profRes.data.name, role: profRes.data.role, avatarUrl: profRes.data.avatar_url || null };
        currentLang = profRes.data.lang || 'so';
        currentTheme = profRes.data.theme || 'dark';
        isBalancesHidden = !!profRes.data.hide_balance;
    }
}

async function initApp() {
    triggerLoadingAnimation(async () => {
        await loadAllData();
        initProfileAndSettings();
        syncDataUX();
        updateClockAndGreeting();
        switchTab('dashboard');
        applyTheme();
    });

    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keydown', resetSessionTimer);
    document.addEventListener('mousemove', resetSessionTimer);
}

function applyTheme() {
    const body = document.getElementById('bodyCtx');
    const toggle = document.getElementById('themeToggle');
    const headerIcon = document.getElementById('headerThemeIcon');
    if (currentTheme === 'light') {
        body.className = "theme-light pb-20 md:pb-0";
        if (toggle) { toggle.classList.remove('active'); }
        if (headerIcon) headerIcon.className = 'fa-solid fa-moon';
    } else {
        body.className = "theme-dark pb-20 md:pb-0";
        if (toggle) { toggle.classList.add('active'); }
        if (headerIcon) headerIcon.className = 'fa-solid fa-sun';
    }
}

async function saveProfileFields(fields) {
    if (!currentUser) return;
    await sb.from('fh_profile').update(fields).eq('user_id', currentUser.id);
}

async function toggleTheme() {
    const toggle = document.getElementById('themeToggle');
    if (currentTheme === 'dark') {
        currentTheme = 'light';
        toggle.classList.remove('active');
    } else {
        currentTheme = 'dark';
        toggle.classList.add('active');
    }
    await saveProfileFields({ theme: currentTheme });
    applyTheme();
}

function updateClockAndGreeting() {
    const now = new Date();
    const hours = now.getHours();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const liveClock = document.getElementById('liveClock');
    if (liveClock) liveClock.innerText = timeString;

    let greeting = "";
    if (currentLang === 'en') {
        if (hours < 12) greeting = "Good Morning";
        else if (hours < 18) greeting = "Good Afternoon";
        else greeting = "Good Evening";
    } else {
        if (hours < 12) greeting = "Subax Wanaagsan";
        else if (hours < 18) greeting = "Galab Wanaagsan";
        else greeting = "Habeen Wanaagsan";
    }
    const greetingText = document.getElementById('greetingText');
    const mGreetingText = document.getElementById('mGreetingText');
    if (greetingText) greetingText.innerText = `${greeting}! 👋`;
    if (mGreetingText) mGreetingText.innerText = `${greeting}! 👋`;
}
setInterval(updateClockAndGreeting, 1000);

async function toggleVisibility() {
    isBalancesHidden = !isBalancesHidden;
    await saveProfileFields({ hide_balance: isBalancesHidden });
    updateEyeIcon();
    renderDashboard();
    renderActiveLoansSelectors();
    renderReports();
}

function updateEyeIcon() {
    const btn = document.getElementById('hideBtn');
    if (btn) {
        btn.innerHTML = `<i id="eyeIcon" class="fa-solid ${isBalancesHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        btn.setAttribute('aria-label', currentLang === 'en'
            ? (isBalancesHidden ? 'Show balances' : 'Hide balances')
            : (isBalancesHidden ? 'Muuji haraaga' : 'Qari haraaga'));
    }
    const totalBtn = document.getElementById('hideBtnTotal');
    if (totalBtn) {
        totalBtn.innerHTML = `<i id="eyeIconTotal" class="fa-solid ${isBalancesHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        totalBtn.setAttribute('aria-label', currentLang === 'en'
            ? (isBalancesHidden ? 'Show balances' : 'Hide balances')
            : (isBalancesHidden ? 'Muuji haraaga' : 'Qari haraaga'));
    }
}

function switchTab(tabId) {
    triggerLoadingAnimation(() => {
        ['dashboard', 'deposit', 'withdraw', 'loans', 'reports', 'settings'].forEach(t => {
            const view = document.getElementById(`view-${t}`);
            if (view) view.classList.add('hidden');
            const sBtn = document.getElementById(`sidebar-${t}`);
            if (sBtn) sBtn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white font-medium text-left transition-all sidebar-btn";
            const mBtn = document.getElementById(`mobile-${t}`);
            if (mBtn) mBtn.className = "flex flex-col items-center gap-0.5 text-slate-400 mobile-nav-btn";
        });
        const activeView = document.getElementById(`view-${tabId}`);
        if (activeView) activeView.classList.remove('hidden');
        const activeSidebar = document.getElementById(`sidebar-${tabId}`);
        if (activeSidebar) activeSidebar.className = "w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium text-left transition-all sidebar-btn active";
        const activeMobile = document.getElementById(`mobile-${tabId}`);
        if (activeMobile) activeMobile.className = "flex flex-col items-center gap-0.5 text-emerald-400 mobile-nav-btn active";

        if (tabId === 'reports') {
            renderReports();
        }
    });
}

function triggerLoadingAnimation(callback) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('hidden');
    setTimeout(async () => { await callback(); overlay.classList.add('hidden'); }, 200);
}

function renderDashboard() {
    renderBalanceTotals();
    renderWalletIconGrid();
}

let selectedBalanceCurrency = 'USD';
const BALANCE_CURRENCY_PREFIX = { USD: '$', SLSH: 'SLSH ', ETB: 'ETB ' };

function renderBalanceTotals() {
    const totals = { USD: 0, SLSH: 0, ETB: 0 };
    WALLET_TILES.forEach(tile => {
        if (tile.soon || tile.demo) return;
        Object.keys(totals).forEach(cur => {
            totals[cur] += tileTotalForCurrency(tile, cur);
        });
    });

    const cur = selectedBalanceCurrency;
    const amountEl = document.getElementById('availableBalance');
    if (amountEl) {
        const text = isBalancesHidden
            ? '•••••'
            : `${BALANCE_CURRENCY_PREFIX[cur]}${totals[cur].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        amountEl.textContent = text;
        amountEl.classList.toggle('is-long', text.length > 11 && text.length <= 15);
        amountEl.classList.toggle('is-xlong', text.length > 15);
    }
    const sel = document.getElementById('balanceCurrency');
    if (sel && sel.value !== cur) sel.value = cur;
}

function setBalanceCurrency(cur) {
    if (!BALANCE_CURRENCY_PREFIX[cur]) return;
    selectedBalanceCurrency = cur;
    renderBalanceTotals();
}

// Renders either an <img> (real logo path) or a font-awesome <i> (e.g. the Demo flask icon).
function walletIconMarkup(tile, extraStyle) {
    if (tile.icon && tile.icon.startsWith('fa-')) {
        return `<i class="${tile.icon}" style="font-size:1.5rem;color:var(--primary);${extraStyle || ''}"></i>`;
    }
    return `<img src="${tile.icon}" alt="${tile.label}" loading="lazy">`;
}

function renderWalletIconGrid() {
    const grid = document.getElementById('walletIconGrid');
    if (!grid) return;
    grid.innerHTML = '';

    WALLET_TILES.forEach(tile => {
        if (tile.soon) {
            grid.innerHTML += `
                <div class="wallet-icon-tile is-soon card-item" data-account-label="soon">
                    <div class="wallet-icon-box is-soon"><i class="fa-solid fa-layer-group" style="font-size:1.4rem;color:var(--primary);"></i></div>
                    <span class="wallet-icon-label">${tile.label}</span>
                </div>`;
            return;
        }
        grid.innerHTML += `
            <button type="button" class="wallet-icon-tile card-item${tile.demo ? ' is-demo' : ''}" data-account-label="${tile.label.toLowerCase()}" onclick="openWalletPin('${tile.id}')">
                <div class="wallet-icon-box${tile.demo ? ' is-demo' : ''}">${walletIconMarkup(tile)}</div>
                <span class="wallet-icon-label">${tile.label}</span>
            </button>`;
    });
}

function filterAccounts() {
    const query = document.getElementById('accountSearch').value.toLowerCase();
    document.querySelectorAll('.card-item').forEach(card => {
        const label = card.getAttribute('data-account-label');
        if (label.includes(query)) card.classList.remove('hidden');
        else card.classList.add('hidden');
    });
}

function toggleSearchBar() {
    const wrap = document.getElementById('searchBarWrap');
    const input = document.getElementById('accountSearch');
    if (!wrap) return;
    const opening = wrap.classList.contains('hidden');
    wrap.classList.toggle('hidden');
    if (opening) {
        if (input) input.focus();
    } else if (input) {
        input.value = '';
        filterAccounts();
    }
}

// ============================================================
// 2c. PIN MODAL — geliddu waa lagama maarmaan si loo furo wallet
// ============================================================
let pinInput = '';
let pinActiveTile = null;

function openWalletPin(tileId) {
    const tile = WALLET_TILES.find(t => t.id === tileId);
    if (!tile || tile.soon) return;
    pinActiveTile = tile;
    pinInput = '';
    document.getElementById('pinModalTitle').textContent = tile.label;
    document.getElementById('pinModalIcon').innerHTML = walletIconMarkup(tile);
    document.getElementById('pinError').classList.add('hidden');
    renderPinDots(WALLET_GROUP_PINS[tile.group].length);
    document.getElementById('pinModal').classList.remove('hidden');
}

function closePinModal() {
    document.getElementById('pinModal').classList.add('hidden');
    pinInput = '';
    pinActiveTile = null;
}

function renderPinDots(length) {
    const dots = document.getElementById('pinDots');
    if (!dots) return;
    dots.innerHTML = '';
    for (let i = 0; i < length; i++) {
        const span = document.createElement('span');
        if (i < pinInput.length) span.classList.add('filled');
        dots.appendChild(span);
    }
}

function pinPress(digit) {
    if (!pinActiveTile) return;
    const requiredLength = WALLET_GROUP_PINS[pinActiveTile.group].length;
    if (pinInput.length >= requiredLength) return;
    pinInput += digit;
    renderPinDots(requiredLength);
    document.getElementById('pinError').classList.add('hidden');
    if (pinInput.length === requiredLength) {
        setTimeout(verifyPin, 120);
    }
}

function pinBackspace() {
    if (!pinActiveTile) return;
    pinInput = pinInput.slice(0, -1);
    renderPinDots(WALLET_GROUP_PINS[pinActiveTile.group].length);
}

function verifyPin() {
    if (!pinActiveTile) return;
    const correct = WALLET_GROUP_PINS[pinActiveTile.group];
    if (pinInput === correct) {
        const tile = pinActiveTile;
        closePinModal();
        openWalletDetail(tile.id);
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        pinInput = '';
        renderPinDots(correct.length);
    }
}

// ============================================================
// 2d. WALLET DETAIL MODAL (popup-ka qurxoon ee card-ka)
// ============================================================
let currentDetailTile = null;
let walletDetailHidden = false;

function openWalletDetail(tileId) {
    const tile = WALLET_TILES.find(t => t.id === tileId);
    if (!tile || tile.soon) return;
    currentDetailTile = tile;
    walletDetailHidden = false;

    document.getElementById('walletDetailTitle').textContent = tile.label;
    let subtitle;
    if (tile.demo) {
        subtitle = currentLang === 'en' ? 'Demo — sample data' : 'Demo — tijaabo, xog sawir ah';
    } else if (tile.group === 'banks') {
        subtitle = currentLang === 'en' ? 'Bank account' : 'Akoon bank';
    } else {
        subtitle = currentLang === 'en' ? 'Mobile wallet' : 'Wallet mobile ah';
    }
    document.getElementById('walletDetailSubtitle').textContent = subtitle;
    document.getElementById('walletDetailIcon').innerHTML = walletIconMarkup(tile);
    renderWalletDetailRows();
    updateWalletDetailEye();

    const actions = document.getElementById('walletDetailActions');
    if (actions) actions.style.display = tile.demo ? 'none' : 'grid';
    const demoNote = document.getElementById('walletDetailDemoNote');
    if (demoNote) demoNote.classList.toggle('hidden', !tile.demo);

    document.getElementById('walletDetailModal').classList.remove('hidden');
}

function closeWalletDetail() {
    document.getElementById('walletDetailModal').classList.add('hidden');
    currentDetailTile = null;
}

function renderWalletDetailRows() {
    const rowsEl = document.getElementById('walletDetailRows');
    if (!rowsEl || !currentDetailTile) return;
    rowsEl.innerHTML = '';

    const tile = currentDetailTile;
    const currencies = tile.currencies || [];

    if (tile.subAccounts) {
        tile.subAccounts.forEach(sub => {
            currencies.forEach(cur => {
                const val = getAccountCurrencyValue(sub.key, cur);
                rowsEl.innerHTML += `
                    <div class="wallet-detail-row">
                        <span class="wdr-label">${sub.label} · ${cur}</span>
                        <span class="wdr-value">${walletDetailHidden ? '•••••' : val.toLocaleString()}</span>
                    </div>`;
            });
        });
    } else {
        currencies.forEach(cur => {
            const val = tileTotalForCurrency(tile, cur);
            rowsEl.innerHTML += `
                <div class="wallet-detail-row">
                    <span class="wdr-label">${cur}</span>
                    <span class="wdr-value">${walletDetailHidden ? '•••••' : val.toLocaleString()}</span>
                </div>`;
        });
    }
}

function updateWalletDetailEye() {
    const icon = document.getElementById('walletDetailEyeIcon');
    if (icon) icon.className = `fa-solid ${walletDetailHidden ? 'fa-eye-slash' : 'fa-eye'}`;
}

function toggleWalletDetailVisibility() {
    walletDetailHidden = !walletDetailHidden;
    updateWalletDetailEye();
    renderWalletDetailRows();
}

function goToWalletAction(action) {
    if (!currentDetailTile || currentDetailTile.demo) return;
    const keys = tileAccountKeys(currentDetailTile);
    closeWalletDetail();
    switchTab(action);
    setTimeout(() => {
        const select = document.getElementById(action === 'deposit' ? 'depositAccount' : 'withdrawAccount');
        if (select && keys.length && [...select.options].some(o => o.value === keys[0])) {
            select.value = keys[0];
            if (action === 'deposit') updateDepositCurrencyOptions();
            else updateWithdrawCurrencyOptions();
        }
    }, 260);
}

// ============================================================
// 3. DEPOSIT
// ============================================================
function handleDeposit(e) {
    e.preventDefault();
    const accKey = document.getElementById('depositAccount').value;
    const currency = document.getElementById('depositCurrency').value;
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const description = document.getElementById('depositDescription').value.trim();
    if (isNaN(amount) || amount <= 0) return;

    triggerLoadingAnimation(async () => {
        accounts[accKey].currencies[currency] += amount;

        await updateAccountInDb(accKey);
        await addTransaction({
            type: 'deposit',
            account: accounts[accKey].label,
            currency: currency,
            amount: amount,
            description: description || `Deposit to ${accounts[accKey].label}`
        });

        document.getElementById('depositForm').reset();
        await loadAllData();
        syncDataUX();
        alert(currentLang === 'en' ? "Deposit successful!" : "Lacagta waa lagu shubay!");
        resetSessionTimer();
    });
}

// ============================================================
// 4. WITHDRAW
// ============================================================
function handleWithdraw(e) {
    e.preventDefault();
    const accKey = document.getElementById('withdrawAccount').value;
    const currency = document.getElementById('withdrawCurrency').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const description = document.getElementById('withdrawDescription').value.trim();
    if (isNaN(amount) || amount <= 0) return;

    if (accounts[accKey].currencies[currency] < amount) {
        alert(currentLang === 'en' ? "Insufficient balance!" : "Hadhaagaagu kuguma filna!");
        return;
    }

    triggerLoadingAnimation(async () => {
        accounts[accKey].currencies[currency] -= amount;

        await updateAccountInDb(accKey);
        await addTransaction({
            type: 'withdraw',
            account: accounts[accKey].label,
            currency: currency,
            amount: amount,
            description: description || `Withdrawal from ${accounts[accKey].label}`
        });

        document.getElementById('withdrawForm').reset();
        await loadAllData();
        syncDataUX();
        alert(currentLang === 'en' ? "Withdrawal successful!" : "Lacagta waad la baxday!");
        resetSessionTimer();
    });
}

async function updateAccountInDb(accKey) {
    if (!currentUser) return;
    await sb.from('fh_accounts')
        .update({ currencies: accounts[accKey].currencies })
        .eq('user_id', currentUser.id)
        .eq('key', accKey);
}

// ============================================================
// 5. LOANS
// ============================================================
function populateFormOptions() {
    const depositSelect = document.getElementById('depositAccount');
    const withdrawSelect = document.getElementById('withdrawAccount');
    const sourceSelect = document.getElementById('loanSource');
    if (depositSelect) depositSelect.innerHTML = '';
    if (withdrawSelect) withdrawSelect.innerHTML = '';
    if (sourceSelect) sourceSelect.innerHTML = '';

    Object.keys(accounts).forEach(key => {
        if (depositSelect) {
            let opt1 = document.createElement('option'); opt1.value = key; opt1.text = accounts[key].label;
            depositSelect.appendChild(opt1);
        }
        if (withdrawSelect) {
            let opt2 = document.createElement('option'); opt2.value = key; opt2.text = accounts[key].label;
            withdrawSelect.appendChild(opt2);
        }
        if (sourceSelect) {
            let opt3 = document.createElement('option'); opt3.value = key; opt3.text = accounts[key].label;
            sourceSelect.appendChild(opt3);
        }
    });
    updateDepositCurrencyOptions();
    updateWithdrawCurrencyOptions();
    updateLoanCurrencyOptions();
    renderActiveLoansSelectors();
}

function updateDepositCurrencyOptions() {
    const sourceKey = document.getElementById('depositAccount').value;
    const currencySelect = document.getElementById('depositCurrency');
    currencySelect.innerHTML = '';
    if (accounts[sourceKey]) {
        Object.keys(accounts[sourceKey].currencies).forEach(cur => {
            let option = document.createElement('option'); option.value = cur; option.text = cur;
            currencySelect.appendChild(option);
        });
    }
}

function updateWithdrawCurrencyOptions() {
    const sourceKey = document.getElementById('withdrawAccount').value;
    const currencySelect = document.getElementById('withdrawCurrency');
    currencySelect.innerHTML = '';
    if (accounts[sourceKey]) {
        Object.keys(accounts[sourceKey].currencies).forEach(cur => {
            let option = document.createElement('option'); option.value = cur; option.text = cur;
            currencySelect.appendChild(option);
        });
    }
}

function updateLoanCurrencyOptions() {
    const sourceKey = document.getElementById('loanSource').value;
    const currencySelect = document.getElementById('loanCurrency');
    currencySelect.innerHTML = '';
    if (accounts[sourceKey]) {
        Object.keys(accounts[sourceKey].currencies).forEach(cur => {
            let option = document.createElement('option'); option.value = cur; option.text = cur;
            currencySelect.appendChild(option);
        });
    }
}

function handleGiveLoan(e) {
    e.preventDefault();
    const debtor = document.getElementById('loanDebtor').value.trim();
    const source = document.getElementById('loanSource').value;
    const currency = document.getElementById('loanCurrency').value;
    const amount = parseFloat(document.getElementById('loanAmount').value);

    if (accounts[source].currencies[currency] < amount) {
        alert(currentLang === 'en' ? "Insufficient funds!" : "Hadhagaagu kuguma filna!");
        return;
    }

    triggerLoadingAnimation(async () => {
        accounts[source].currencies[currency] -= amount;
        await updateAccountInDb(source);

        await sb.from('fh_loans').insert({
            user_id: currentUser.id,
            debtor,
            source_key: source,
            source_label: accounts[source].label,
            currency,
            original_amount: amount,
            remaining_amount: amount,
            status: 'Active'
        });

        await addTransaction({
            type: 'loan',
            account: accounts[source].label,
            currency: currency,
            amount: amount,
            description: `Loan given to ${debtor}`
        });

        document.getElementById('loanForm').reset();
        await loadAllData();
        syncDataUX();
        alert(currentLang === 'en' ? "Loan successful!" : "Amaahdii waa la bixiyay!");
        resetSessionTimer();
    });
}

function handleRepayLoan(e) {
    e.preventDefault();
    const loanId = document.getElementById('repayLoanSelect').value;
    const amount = parseFloat(document.getElementById('repayAmount').value);
    if (!loanId || isNaN(amount) || amount <= 0) return;

    const loan = loans.find(l => String(l.id) === String(loanId));
    if (!loan) return;
    if (amount > loan.remainingAmount) {
        alert(currentLang === 'en' ? "Amount exceeds debt!" : "Lacagtu waa ka badantahay amaahda!");
        return;
    }

    triggerLoadingAnimation(async () => {
        accounts[loan.sourceKey].currencies[loan.currency] += amount;
        await updateAccountInDb(loan.sourceKey);

        const newRemaining = loan.remainingAmount - amount;
        const newStatus = newRemaining <= 0 ? 'Paid' : 'Active';
        await sb.from('fh_loans')
            .update({ remaining_amount: newRemaining, status: newStatus })
            .eq('id', loan.id);

        await addTransaction({
            type: 'repayment',
            account: loan.sourceLabel,
            currency: loan.currency,
            amount: amount,
            description: `Loan repayment from ${loan.debtor}`
        });

        document.getElementById('repayForm').reset();
        await loadAllData();
        syncDataUX();
        alert(currentLang === 'en' ? "Repayment successful!" : "Lacagtii waa lagu soo celiyay akoonka!");
        resetSessionTimer();
    });
}

function deleteLoan(loanId) {
    if (!confirm(currentLang === "en" ? "Are you sure you want to delete loans? This action cannot be undone." : "Ma hubtaa inaad rabto inaad tirtirto amaahaha? Ficilkan lama celin karo.")) return;
    (async () => {
        await sb.from('fh_loans').delete().eq('id', loanId);
        await loadAllData();
        syncDataUX();
        alert("Loan deleted successful!");
    })();
}

function renderActiveLoansSelectors() {
    const repaySelect = document.getElementById('repayLoanSelect');
    if (repaySelect) {
        repaySelect.innerHTML = `<option value="">[--${currentLang === 'en' ? 'Select' : 'Dooro'}--]</option>`;
        loans.forEach(l => {
            if (l.status === 'Active') {
                let option = document.createElement('option');
                option.value = l.id;
                option.text = `${l.debtor} (${isBalancesHidden ? '••••' : l.remainingAmount} ${l.currency})`;
                repaySelect.appendChild(option);
            }
        });
    }

    const tbody = document.getElementById('loanTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (loans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Ma jirto amaah.</td></tr>`;
        return;
    }
    loans.forEach(l => {
        let statusBadge = l.status === 'Active' ? `<span class="text-yellow-400">${currentLang === 'en' ? 'Active' : 'Taagan'}</span>` : `<span class="text-emerald-400">${currentLang === 'en' ? 'Paid' : 'La bixiyay'}</span>`;

        let dispOriginal = isBalancesHidden ? '•••••' : l.originalAmount;
        let dispRemaining = isBalancesHidden ? '•••••' : l.remainingAmount;

        tbody.innerHTML += `
            <tr class="border-b border-slate-700/40 text-xs">
                <td class="p-3 text-white">${l.debtor}</td>
                <td class="p-3 text-slate-400">${l.sourceLabel}</td>
                <td class="p-3">${dispOriginal} ${l.currency}</td>
                <td class="p-3 font-bold text-emerald-400">${dispRemaining} ${l.currency}</td>
                <td class="p-3">${statusBadge}</td>
                <td class="p-3">
                    ${l.status === 'Active' ? `<button onclick="deleteLoan('${l.id}')" class="text-red-400 hover:text-red-300 text-xs font-bold">🗑️</button>` : ''}
                </td>
            </tr>`;
    });
}

// ============================================================
// 6. TRANSACTIONS / REPORTS
// ============================================================
async function addTransaction(data) {
    if (!currentUser) return;
    await sb.from('fh_transactions').insert({
        user_id: currentUser.id,
        date: new Date().toISOString(),
        ...data
    });
}

function renderReports() {
    const filter = document.getElementById('reportFilter')?.value || 'all';
    const dateFrom = document.getElementById('reportDateFrom')?.value || '';
    const dateTo = document.getElementById('reportDateTo')?.value || '';

    let filtered = [...transactions];

    if (filter !== 'all') {
        filtered = filtered.filter(t => t.type === filter);
    }

    if (dateFrom) {
        filtered = filtered.filter(t => t.date >= dateFrom);
    }
    if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        filtered = filtered.filter(t => new Date(t.date) <= endDate);
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalDeposits = transactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = transactions.filter(t => t.type === 'withdraw').reduce((sum, t) => sum + t.amount, 0);
    const totalLoans = transactions.filter(t => t.type === 'loan').reduce((sum, t) => sum + t.amount, 0);

    document.getElementById('totalDeposits').textContent = totalDeposits.toLocaleString();
    document.getElementById('totalWithdrawals').textContent = totalWithdrawals.toLocaleString();
    document.getElementById('totalLoans').textContent = totalLoans.toLocaleString();

    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">Ma jiraan transactions.</td></tr>`;
        document.getElementById('transactionCount').textContent = currentLang === 'en' ? '0 transactions' : '0 dhaqdhaqaaq';
        return;
    }

    document.getElementById('transactionCount').textContent = currentLang === 'en' ? `${filtered.length} transactions` : `${filtered.length} dhaqdhaqaaq`;

    filtered.forEach((t, index) => {
        const typeLabels = {
            deposit: { en: 'Deposit', so: 'Ku Shub', color: 'text-emerald-400' },
            withdraw: { en: 'Withdrawal', so: 'La Bax', color: 'text-red-400' },
            loan: { en: 'Loan', so: 'Amaah', color: 'text-yellow-400' },
            repayment: { en: 'Repayment', so: 'Soo Celin', color: 'text-purple-400' }
        };

        const typeLabel = currentLang === 'en' ? typeLabels[t.type]?.en : typeLabels[t.type]?.so;
        const colorClass = typeLabels[t.type]?.color || 'text-slate-400';
        const dateDisplay = new Date(t.date).toLocaleString();
        const amountDisplay = isBalancesHidden ? '•••••' : t.amount.toLocaleString();
        const rowClass = `transaction-${t.type}`;

        tbody.innerHTML += `
            <tr class="border-b border-slate-700/40 text-xs ${rowClass}">
                <td class="p-3 text-slate-400">${index + 1}</td>
                <td class="p-3 text-white">${dateDisplay}</td>
                <td class="p-3 font-semibold ${colorClass}">${typeLabel}</td>
                <td class="p-3 text-slate-300">${t.account}</td>
                <td class="p-3 text-slate-300">${t.currency}</td>
                <td class="p-3 font-bold text-white">${amountDisplay}</td>
                <td class="p-3 text-slate-400">${t.description}</td>
            </tr>
        `;
    });
}

function clearReportFilters() {
    document.getElementById('reportFilter').value = 'all';
    document.getElementById('reportDateFrom').value = '';
    document.getElementById('reportDateTo').value = '';
    renderReports();
}

function clearTransactions() {
    if (!confirm(currentLang === "en" ? "Are you sure you want to delete ALL transactions? This action cannot be undone." : "Ma hubtaa inaad rabto inaad tirtirto dhammaan dhaqdhaqaaqyada? Ficilkan lama celin karo.")) return;
    (async () => {
        await sb.from('fh_transactions').delete().eq('user_id', currentUser.id);
        await loadAllData();
        renderReports();
        alert("Deleted ALL transactions successful!");
    })();
}

// ============================================================
// 7. SETTINGS & MANAGEMENT
// ============================================================
function initProfileAndSettings() {
    const profileName = document.getElementById('profileName');
    const avatarCircle = document.getElementById('avatarCircle');
    const settingsName = document.getElementById('settingsName');
    const settingsRole = document.getElementById('settingsRole');

    if (profileName) profileName.innerText = profile.name;
    if (avatarCircle) avatarCircle.innerText = profile.name.charAt(0).toUpperCase();
    if (settingsName) settingsName.value = profile.name;
    if (settingsRole) settingsRole.value = profile.role;

    loadStoredAvatar();

    setLanguage(currentLang, false);
    updateEyeIcon();

    const toggle = document.getElementById('themeToggle');
    if (currentTheme === 'light') {
        if (toggle) toggle.classList.remove('active');
    } else {
        if (toggle) toggle.classList.add('active');
    }
}

// ============================================================
// PROFILE PHOTO UPLOAD
// ============================================================
function applyAvatarImage(dataUrl) {
    document.querySelectorAll('.profile-avatar-slot').forEach(el => {
        el.innerHTML = `<img src="${dataUrl}" alt="Profile">`;
    });
}

function loadStoredAvatar() {
    if (profile.avatarUrl) {
        applyAvatarImage(profile.avatarUrl);
        return;
    }
    if (!currentUser) return;
    try {
        const stored = localStorage.getItem(`fh_avatar_${currentUser.id}`);
        if (stored) applyAvatarImage(stored);
    } catch (e) { /* storage unavailable, ignore */ }
}

async function saveAvatarImage(dataUrl) {
    profile.avatarUrl = dataUrl;
    if (!currentUser) return;
    try { localStorage.setItem(`fh_avatar_${currentUser.id}`, dataUrl); } catch (e) { /* ignore */ }
    try { await sb.from('fh_profile').update({ avatar_url: dataUrl }).eq('user_id', currentUser.id); } catch (e) { /* column may not exist yet */ }
}

function handleAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert(currentLang === 'en' ? 'Please choose an image file.' : 'Fadlan dooro sawir (image) sax ah.');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        alert(currentLang === 'en' ? 'Image must be under 2MB.' : 'Sawirku waa inuu ka yaraadaa 2MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const size = 240;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            applyAvatarImage(dataUrl);
            saveAvatarImage(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function saveProfile() {
    const settingsName = document.getElementById('settingsName');
    const settingsRole = document.getElementById('settingsRole');
    const settingsNewPassword = document.getElementById('settingsNewPassword');

    (async () => {
        profile.name = settingsName.value.trim() || profile.name;
        profile.role = settingsRole.value.trim() || profile.role;

        await saveProfileFields({ name: profile.name, role: profile.role });

        const newPass = settingsNewPassword.value.trim();
        if (newPass.length > 0) {
            const { error } = await sb.auth.updateUser({ password: newPass });
            if (!error) {
                alert(currentLang === 'en' ? "Password successfully Updated!" : "Password-ka Waa La Cusboonaysiiyay!");
            }
            settingsNewPassword.value = '';
        }

        initProfileAndSettings();
        alert(currentLang === 'en' ? "Saved successful!" : "Waa la kaydiyay si guul leh!");
        resetSessionTimer();
    })();
}

function resetAllData() {
    if (!confirm(currentLang === "en" ? "Are you sure you want to delete ALL data? This action cannot be undone." : "Ma hubtaa inaad rabto inaad tirtirto dhammaan xogta? Ficilkan lama celin karo.")) return;
    (async () => {
        await sb.from('fh_transactions').delete().eq('user_id', currentUser.id);
        await sb.from('fh_loans').delete().eq('user_id', currentUser.id);
        for (const key of Object.keys(accounts)) {
            const zeroed = {};
            Object.keys(accounts[key].currencies).forEach(cur => zeroed[cur] = 0);
            await sb.from('fh_accounts').update({ currencies: zeroed }).eq('user_id', currentUser.id).eq('key', key);
        }
        await loadAllData();
        syncDataUX();
        alert(" Deleted ALL the data successful!");
    })();
}

function clearLoans() {
    if (!confirm(" Are you sure wanto ALL the loans? this action can be undone!")) return;
    (async () => {
        await sb.from('fh_loans').delete().eq('user_id', currentUser.id);
        await loadAllData();
        syncDataUX();
        alert(" Delete ALL the loans successful!");
    })();
}

// ============================================================
// 9. DATA EXPORT / IMPORT (Settings)
// ============================================================
let exportRange = 'all';

function setExportRange(val) {
    exportRange = (val === 'today') ? 'today' : 'all';
}

function getExportTransactions() {
    if (exportRange === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return transactions.filter(t => new Date(t.date) >= start);
    }
    return transactions;
}

function triggerFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
    const rows = getExportTransactions();
    const header = ['Date', 'Type', 'Account', 'Currency', 'Amount', 'Description'];
    const lines = [header.join(',')];
    rows.forEach(t => {
        lines.push([
            new Date(t.date).toLocaleString(),
            t.type,
            t.account,
            t.currency,
            t.amount,
            t.description || ''
        ].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(blob, `smartyplus-transactions-${exportRange}-${stamp}.csv`);
}

function exportJSON() {
    const payload = {
        exportedAt: new Date().toISOString(),
        profile: { name: profile.name, role: profile.role },
        accounts,
        loans,
        transactions
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(blob, `smartyplus-backup-${stamp}.json`);
}

function handleImportJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            alert(currentLang === 'en' ? "Invalid JSON file!" : "File-ka JSON-ka ah waa khalad!");
            event.target.value = '';
            return;
        }

        const confirmMsg = currentLang === 'en'
            ? "Import this backup? Matching account balances will be overwritten, and loans/transactions in the file will be added to your current data."
            : "Ma rabtaa inaad soo geliso backup-kan? Haraaga accounts-ka isku mida waa la beddeli doonaa, amaahda iyo dhaqdhaqaaqa file-ka ku jira waxay ku dari doonaan xogtaada hadda jirta.";
        if (!confirm(confirmMsg)) {
            event.target.value = '';
            return;
        }

        triggerLoadingAnimation(async () => {
            if (data.accounts && typeof data.accounts === 'object') {
                for (const key of Object.keys(data.accounts)) {
                    if (accounts[key]) {
                        await sb.from('fh_accounts')
                            .update({ currencies: data.accounts[key].currencies })
                            .eq('user_id', currentUser.id)
                            .eq('key', key);
                    }
                }
            }

            if (Array.isArray(data.loans)) {
                for (const l of data.loans) {
                    await sb.from('fh_loans').insert({
                        user_id: currentUser.id,
                        debtor: l.debtor,
                        source_key: l.sourceKey,
                        source_label: l.sourceLabel,
                        currency: l.currency,
                        original_amount: l.originalAmount,
                        remaining_amount: l.remainingAmount,
                        status: l.status || 'Active'
                    });
                }
            }

            if (Array.isArray(data.transactions)) {
                for (const t of data.transactions) {
                    await sb.from('fh_transactions').insert({
                        user_id: currentUser.id,
                        type: t.type,
                        account: t.account,
                        currency: t.currency,
                        amount: t.amount,
                        description: t.description,
                        date: t.date || new Date().toISOString()
                    });
                }
            }

            await loadAllData();
            syncDataUX();
            alert(currentLang === 'en' ? "Import successful!" : "Soo gelinta waa guuleysatay!");
        });
        event.target.value = '';
    };
    reader.readAsText(file);
}

function downloadPDF() {
    const rows = getExportTransactions();
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert(currentLang === 'en' ? "PDF library failed to load. Check your internet connection." : "PDF-ku si sax ah uma shaqeynin. Hubi internet-ka.");
        return;
    }
    const doc = new jsPDF();
    const stamp = new Date().toLocaleString();
    const rangeLabel = exportRange === 'today'
        ? (currentLang === 'en' ? "Today's Transactions" : "Dhaqdhaqaaqa Maanta")
        : (currentLang === 'en' ? "Transaction History (All)" : "Taariikhda Dhaqdhaqaaqa (Oo Dhan)");

    doc.setFontSize(16);
    doc.text('SmartyPlus', 14, 16);
    doc.setFontSize(11);
    doc.text(rangeLabel, 14, 24);
    doc.setFontSize(9);
    doc.text(`${currentLang === 'en' ? 'Generated' : 'La sameeyay'}: ${stamp}`, 14, 30);

    const body = rows.map(t => [
        new Date(t.date).toLocaleString(),
        t.type,
        t.account,
        t.currency,
        Number(t.amount).toLocaleString(),
        t.description || ''
    ]);

    doc.autoTable({
        startY: 36,
        head: [['Date', 'Type', 'Account', 'Currency', 'Amount', 'Description']],
        body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] }
    });

    const fileStamp = new Date().toISOString().slice(0, 10);
    doc.save(`smartyplus-report-${exportRange}-${fileStamp}.pdf`);
}

const UI_TRANSLATIONS = {
    "Log in to access and manage your accounts.": ["Log in to access and manage your accounts.", "Gal si aad u hesho oo u maamusho akoonnadaada."],
    "Username": ["Username", "Magaca isticmaalaha"],
    "Enter your key": ["Enter your password", "Geli furaha sirta"],
    "Login": ["Login", "Gal"],
    "Invalid username or password!": ["Invalid username or password!", "Magaca isticmaalaha ama furaha sirta waa khalad!"],
    "Fast & Secure system": ["Fast & Secure system", "Nidaam degdeg ah oo ammaan ah"],
    "Your data is protected and encrypted.": ["Your data is protected and encrypted.", "Xogtaada waa la ilaaliyay oo waa la sirgoynayaa."],
    "Search accounts...": ["Search accounts...", "Raadi akoonnada..."],
    "Finance Dashboard": ["Finance Dashboard", "Dashboard-ka Maaliyadda"],
    "System settings": ["System Settings", "Habaynta nidaamka"],
    "Profile information": ["Profile information", "Macluumaadka profile-ka"],
    "Full Name": ["Full Name", "Magaca oo buuxa"],
    "User role": ["User role", "Doorka isticmaalaha"],
    "Update password": ["Update password", "Cusboonaysii furaha sirta"],
    "Not available": ["Not available", "Lama heli karo"],
    "Save info": ["Save information", "Kaydi macluumaadka"],
    "You will be logged out of the system.": ["You will be logged out of the system.", "Waxaad ka bixi doontaa nidaamka."],
    "System Language": ["System Language", "Luqadda nidaamka"],
    "Color Theme": ["Color Theme", "Naqshadda midabka"],
    "Naqshadda Midabka": ["Color Theme", "Naqshadda midabka"],
    "Management": ["Management", "Maamulka"],
    "Reset All": ["Reset All", "Dib u deji dhammaan"],
    "Clear Loans": ["Clear Loans", "Tirtir amaahaha"],
    "Clear Transactions": ["Clear Transactions", "Tirtir dhammaan dhaqdhaqaaqyada"],
    "Dark": ["Dark", "Madow"],
    "Light": ["Light", "Iftiin"],
    "Dhaqdhaqaaqa Guud ee Lacagta": ["Overall Money Activity", "Dhaqdhaqaaqa Guud ee Lacagta"],
    "Ku shub lacag": ["Deposit Money", "Ku shub lacag"],
    "La bax lacag": ["Withdraw Money", "La bax lacag"],
    "Nidaamka Amaahda iyo Soo Celinta": ["Loan & Repayment Management", "Nidaamka Amaahda iyo Soo Celinta"],
    "Warbixinaha Dhaqdhaqaaqa": ["Activity Reports", "Warbixinaha Dhaqdhaqaaqa"],
    "Ma jiraan transactions.": ["No transactions found.", "Ma jiraan dhaqdhaqaaqyo."],
    "Ma jirto amaah.": ["No loans found.", "Ma jirto amaah."],
    "Qofka": ["Person", "Qofka"],
    "Akoonka": ["Account", "Akoonka"],
    "Hore": ["Original", "Hore"],
    "Ku Hadhay": ["Remaining", "Ku Hadhay"],
    "Xaaladda": ["Status", "Xaaladda"],
    "Ficil": ["Action", "Ficil"],
    "Password": ["Password", "Furaha sirta"],
    "Language": ["Language", "Luqad"],
    "Theme": ["Theme", "Muuqaalka"],
    "Logo": ["Logo", "Astaanta"],
    "Loading Overlay": ["Loading", "Soo dejinaya"],
    "Session Timeout Warning": ["Session timeout warning", "Digniinta waqtiga kulanka"],
    "DASHBOARD": ["DASHBOARD", "DASHBOARD"],
    "DEPOSIT": ["DEPOSIT", "KU SHUBID"],
    "WITHDRAW": ["WITHDRAW", "KA BIXID"],
    "LOANS": ["LOANS", "AMAAH"],
    "REPORTS": ["REPORTS", "WARBIXINNO"],
    "SETTINGS": ["SETTINGS", "HABAYN"],
    "MOBILE NAV": ["MOBILE NAVIGATION", "NAVIGATION-KA MOOBAYLKA"],
    "Select accounts": ["Select Account", "Dooro akoonka"],
    "Currency type": ["Currency", "Nooca lacagta"],
    "Lacagta": ["Amount", "Cadadka lacagta"],
    "Faahfaahin": ["Description", "Faahfaahin"],
    "Deposit to Balance": ["Deposit to Balance", "Ku shub haraaga"],
    "Dooro Akoonka": ["Select Account", "Dooro akoonka"],
    "Nooca Lacagta": ["Currency", "Nooca lacagta"],
    "Cadadka Lacagta": ["Amount", "Cadadka lacagta"],
    "Ka bax": ["Withdraw", "Ka bax"],
    "Bixi Amaah Cusub": ["Issue New Loan", "Bixi amaah cusub"],
    "Magaca Qofka Qaadanaya": ["Borrower Name", "Magaca qofka qaadanaya"],
    "Bixi Amaahda": ["Process Loan", "Bixi amaahda"],
    "Soo Celi Amaahda": ["Repay Active Loan", "Soo celi amaahda"],
    "Dooro Amaahda": ["Select Active Loan", "Dooro amaahda taagan"],
    "Cadadka Soo Celinta": ["Repayment Amount", "Cadadka soo celinta"],
    "Hagaaji soo celinta": ["Submit Repayment", "Gudbi soo celinta"],
    "Diiwaanka Amaahda Tagan": ["Active Loans Ledger", "Diiwaanka amaahaha taagan"],
    "Ku Shubashada": ["Total Deposits", "Wadarta ku shubashada"],
    "Ka Bixinta": ["Total Withdrawals", "Wadarta ka bixista"],
    "Wadarta Amaahda": ["Total Loans Given", "Wadarta amaahaha la bixiyay"],
    "Shaandheey": ["Filter", "Shaandhee"],
    "Dhammaan": ["All Transactions", "Dhammaan dhaqdhaqaaqyada"],
    "Ku Shubo": ["Deposit", "Ku shub"],
    "Ka Bax": ["Withdrawal", "Ka bax"],
    "Amaah": ["Loan", "Amaah"],
    "Soo Celin": ["Repayment", "Soo celin"],
    "Muddada": ["Date Range", "Muddada"],
    "Ilaa": ["To", "Ilaa"],
    "Kudabaq": ["Apply Filter", "Kudabaq"],
    "Nadiifi": ["Clear", "Nadiifi"],
    "Taariikhda Dhaqdhaqaaqa": ["Transaction History", "Taariikhda dhaqdhaqaaqa"],
    "Taariikh": ["Date", "Taariikh"],
    "Nooca": ["Type", "Nooca"],
    "Qadarka": ["Amount", "Qadarka"],
    "Guri": ["Home", "Guri"],
    "Kushubo": ["Deposit", "Ku shub"],
    "Warbixin": ["Reports", "Warbixin"],
    "Welcome back 👋": ["Welcome back 👋", "Soo dhawoow 👋"],
    "Finance Wallets": ["Finance Wallets", "Boorsooyinka Maaliyadda"]
};

function applyCompleteLanguage() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-lang-en]').forEach(el => {
        el.innerText = currentLang === 'en'
            ? el.getAttribute('data-lang-en')
            : el.getAttribute('data-lang-so');
    });

    // Translate remaining static text nodes without touching account/user data.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
        const value = node.nodeValue.trim();
        if (!value || !UI_TRANSLATIONS[value]) return;
        const pair = UI_TRANSLATIONS[value];
        node.nodeValue = node.nodeValue.replace(value, currentLang === 'en' ? pair[0] : pair[1]);
    });

    document.querySelectorAll('[data-placeholder-en]').forEach(el => {
        el.placeholder = currentLang === 'en'
            ? el.getAttribute('data-placeholder-en')
            : el.getAttribute('data-placeholder-so');
    });

    const search = document.getElementById('accountSearch');
    if (search) search.placeholder = currentLang === 'en' ? 'Search accounts...' : 'Raadi akoonnada...';

    const count = document.getElementById('transactionCount');
    if (count && !count.textContent.includes('0')) {
        const n = parseInt(count.textContent, 10) || 0;
        count.textContent = currentLang === 'en' ? `${n} transactions` : `${n} dhaqdhaqaaq`;
    }

    updateClockAndGreeting();
    updateEyeIcon();
    renderDashboard();
    renderActiveLoansSelectors();
    renderReports();
}

function setLanguage(lang, triggerAnimation = true) {
    const applyLang = async () => {
        currentLang = lang;
        await saveProfileFields({ lang });

        const langBtnEn = document.getElementById('lang-btn-en');
        const langBtnSo = document.getElementById('lang-btn-so');
        if (langBtnEn) langBtnEn.className = lang === 'en'
            ? 'flex-1 py-2 px-4 rounded-lg bg-emerald-600 text-white text-xs border border-emerald-500'
            : 'flex-1 py-2 px-4 rounded-lg bg-slate-900 text-slate-400 text-xs border border-slate-700';
        if (langBtnSo) langBtnSo.className = lang === 'so'
            ? 'flex-1 py-2 px-4 rounded-lg bg-emerald-600 text-white text-xs border border-emerald-500'
            : 'flex-1 py-2 px-4 rounded-lg bg-slate-900 text-slate-400 text-xs border border-slate-700';

        applyCompleteLanguage();
    };
    if (triggerAnimation) triggerLoadingAnimation(applyLang);
    else applyLang();
}
function syncDataUX() {
    renderDashboard();
    populateFormOptions();
    renderReports();
}

// ============================================================
// 8. CHECK SESSION ON LOAD
// ============================================================
(async function () {
    const { data } = await sb.auth.getSession();
    if (data.session) {
        currentUser = data.session.user;
        await showApp();
    } else {
        const loginPage = document.getElementById('loginPage');
        const appContainer = document.getElementById('appContainer');
        if (loginPage) loginPage.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('hidden');
    }
})();

sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        const appContainer = document.getElementById('appContainer');
        const loginPage = document.getElementById('loginPage');
        if (appContainer) appContainer.classList.add('hidden');
        if (loginPage) loginPage.classList.remove('hidden');
    }
});
