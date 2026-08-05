let portalData = window.NTSCStore ? window.NTSCStore.getData() : {};
let student = portalData.student || {};
let classRows = portalData.timetable || [];
let hallRows = portalData.tests || [];
let resultData = portalData.results || {};
let serverTime = { date: '', time: '', weekday: 1, version: 0 };
let lastVersion = -1;
let loadingData = false;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n) { return String(n).padStart(2, '0'); }
function isoOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return isoOf(new Date()); }
function addDaysStr(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
function mondayOfDate(dateStr) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); }
function todayIST() { return serverTime.date || todayISO(); }
function todayISTWeekday() { return typeof serverTime.weekday === 'number' ? serverTime.weekday : new Date(todayIST() + 'T00:00:00').getDay(); }

// ---- Session -------------------------------------------------------------
function storedLogin() {
    try { return JSON.parse(localStorage.getItem('ntsc_landing_login') || '{}'); } catch (e) { return {}; }
}

async function enforceSession() {
    if (location.protocol === 'file:') return;
    const login = storedLogin();
    if (!login.token || login.role !== 'student') {
        localStorage.removeItem('ntsc_landing_login');
        location.href = '/';
        return;
    }
    try {
        const res = await fetch('/api/session/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: login.token })
        });
        if (!res.ok) throw new Error('invalid session');
    } catch (error) {
        localStorage.removeItem('ntsc_landing_login');
        location.href = '/';
    }
}

function studentLogout() {
    const login = storedLogin();
    if (login.token) {
        fetch('/api/session/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: login.token })
        }).catch(() => {});
    }
    localStorage.removeItem('ntsc_landing_login');
    location.href = '/';
}
window.studentLogout = studentLogout;

// ---- Data ----------------------------------------------------------------
async function refreshPortalData(rerender = true) {
    if (loadingData || location.protocol === 'file:') return;
    loadingData = true;
    try {
        const res = await fetch('/api/portal-data', { cache: 'no-store' });
        if (!res.ok) throw new Error('portal data ' + res.status);
        const data = await res.json();
        applyData(data);
        if (window.NTSCStore) window.NTSCStore.saveData(data);
        if (rerender) route();
    } catch (err) {
        console.warn('portal data refresh failed', err);
    } finally {
        loadingData = false;
    }
}

function applyData(data) {
    portalData = data || portalData;
    student = portalData.student || {};
    classRows = portalData.timetable || [];
    hallRows = portalData.tests || [];
    resultData = portalData.results || {};
}

async function syncServerTime() {
    if (location.protocol === 'file:') return;
    try {
        const res = await fetch('/api/time', { cache: 'no-store' });
        const t = await res.json();
        if (!t || !t.ok) return;
        serverTime = t;
        if (typeof t.version === 'number' && t.version > lastVersion) lastVersion = t.version;
        if (currentRoute === 'timetable') timeTable();
    } catch (err) { /* server clock unavailable; keep local time */ }
}

// Real-time cross-device sync via server-sent events. On any backend change
// the server bumps the data version; we re-fetch. A remote logout of THIS
// token is answered immediately.
function connectEvents() {
    if (location.protocol === 'file:') return;
    const login = storedLogin();
    if (!login.token) return;
    const es = new EventSource('/api/events?token=' + encodeURIComponent(login.token) + '&role=student');
    es.onmessage = (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg) return;
        if (msg.type === 'update' && typeof msg.version === 'number' && msg.version !== lastVersion) {
            lastVersion = msg.version;
            refreshPortalData();
        } else if (msg.type === 'logout' && msg.token && msg.token === login.token) {
            toast('You have been signed out from another device');
            localStorage.removeItem('ntsc_landing_login');
            setTimeout(() => { location.href = '/'; }, 1200);
        }
    };
    es.onerror = () => { /* EventSource reconnects automatically (retry: 3000) */ };
}

// ---- Shell ---------------------------------------------------------------
const $ = s => document.querySelector(s);
const main = $('#mainContent');
const app = $('#app');
let currentRoute = 'profile';

const menus = [
    ['profile', 'f007', 'My Profile'],
    ['timetable', 'f274', 'Time Table'],
    ['examination', 'f108', 'Examination', 'arrow'],
    ['examHall', 'f200', 'Examination Hall'],
    ['live', 'f025', 'Live Classes'],
    ['attendance', 'f14a', 'Attendance'],
    ['notice', 'f328', 'Notice Board'],
    ['performance', 'f201', 'Performance Report'],
    ['admit', 'f2c2', 'Admit Card'],
    ['purchase', 'f1da', 'Purchase History'],
    ['videos', 'f04b', 'Videos']
];

function renderMenu(active) {
    $('#sideMenu').innerHTML = menus.map(m => {
        const [route, icon, label, arrow] = m;
        const target = route === 'examination' ? 'examHall' : route === 'performance' ? 'performance-report' : route;
        return `<a class="menu-item ${route === active ? 'active' : ''}" href="#${target}" data-route="${route}"><span class="menu-ico fa-icon">&#x${icon};</span><span>${label}</span>${arrow ? `<span class="arrow fa-icon">&#xf054;</span>` : ''}</a>`;
    }).join('');
}

function shell(title, body, opts = {}) {
    main.innerHTML = `<div class="page-card ${opts.cls || ''}"><div class="page-title-row"><h1 class="page-title">${title}</h1><div class="page-actions"><button class="logout-button logout-red" type="button" onclick="studentLogout()">Logout</button></div></div>${body}</div>`;
}

function applyStudentDetails() {
    const name = student.name || 'STUDENT';
    const email = student.email || '';
    const sn = $('#sideName');
    const se = $('#sideEmail');
    if (sn) sn.textContent = name;
    if (se) se.textContent = email;
}

function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

// ---- My Profile (default section) ------------------------------------------
function profile() {
    renderMenu('profile');
    const p = student;
    shell('My Profile', `
  <div class="profile-top"><div class="profile-photo"><img src="assets/images/avatar_image.png"><b>Profile Picture</b><small>Recommended 300x300</small></div>
    <div><div class="info-row"><label>Name</label><span>${p.name || ''}</span></div><div class="info-row"><label>Mobile</label><span>${p.mobile || ''}</span></div><div class="info-row"><label>Current Class</label><span>${p.currentClass || ''}</span></div></div>
    <div><div class="info-row"><label>Email Address</label><span>${p.email || ''}</span></div><div class="info-row"><label>Primary Goal</label><span>${p.goal || ''}</span></div><div class="info-row"><label>Student UID</label><span>${p.studentId || ''}</span></div></div></div>
  <div class="profile-meta-grid">
    <div class="info-row"><label>Batch</label><span>${p.batch || ''}</span></div>
    <div class="info-row"><label>Registration No</label><span>${p.registration || ''}</span></div>
  </div>`, { cls: 'profile-card' });
}

// ---- Time Table (live IST current-week tabs) ------------------------------
function dayTabLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()} ${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}`;
}

function timeTable() {
    renderMenu('timetable');
    const today = todayIST();
    const wd = todayISTWeekday();
    const sundayAfter18 = wd === 0 && String(serverTime.timeOfDay || '') >= '18:00';
    let weekStart = mondayOfDate(today);
    if (sundayAfter18) weekStart = addDaysStr(weekStart, 7);
    const dates = Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
    const isWeekend = wd === 6 || wd === 0;
    const activeDate = isWeekend ? dates[0] : today;
    const weekMeta = (portalData.timetables || {})[weekStart] || null;

    let body = `<div class="campus"><b>Campus:</b> Gopalpura Campus-1 (Nr. Riddhi Siddhi)<br><b>Address:</b> B-28, 10 B Scheme Near Riddhi Siddhi Circle</div>`;
    body += `<div class="date-tabs">${dates.map(d => `<button type="button" class="date-tab ${d === activeDate ? 'active' : ''}" data-date="${d}" onclick="showDay('${d}')">${dayTabLabel(d)}</button>`).join('')}</div>`;
    if (isWeekend) {
        body += `<div class="weekend-card">${sundayAfter18
            ? 'Sunday evening — next week&#39;s timetable is being generated. It should appear here within a moment.'
            : `It's the weekend (${WEEKDAYS[wd]}) — no classes today. Classes resume on Monday.`}</div>`;
    }
    if (!weekMeta && !isWeekend) {
        body += `<div class="weekend-card">No timetable is available for the current week yet. It is generated automatically.</div>`;
    }
    body += `<div id="dayView"></div>`;
    shell('Time Table', `${body}`);
    showDay(activeDate);
}
window.timeTable = timeTable;

function showDay(date) {
    const rows = classRows.filter(r => r[0] === date);
    const regular = rows.filter(r => String(r[2]).toLowerCase().indexOf('regular') !== -1).length;
    const doubt = rows.filter(r => String(r[2]).toLowerCase().indexOf('doubt') !== -1).length;
    const complete = rows.length === 4 && regular === 3 && doubt === 1;
    const el = $('#dayView');
    if (!el) return;
    document.querySelectorAll('.date-tab').forEach(t => t.classList.toggle('active', t.dataset.date === date));
    const chip = complete
        ? `<span class="valid-chip">3 Regular + 1 Doubt</span>`
        : rows.length
            ? `<span class="warn-chip">Incomplete day (${rows.length} sessions)</span>`
            : `<span class="warn-chip">No classes</span>`;
    el.innerHTML = `<div class="day-head"><b>${cleanDateText(date)}</b>${chip}</div>
  <table class="simple-table timetable"><thead><tr><th>Class Time</th><th>Class Type</th><th>Subjects</th><th>Teacher</th><th>Room</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4] || '—'}</td><td>${r[5] || '—'}</td></tr>`).join('') || '<tr><td colspan="5">No classes scheduled for this day.</td></tr>'}
  </tbody></table>`;
}
window.showDay = showDay;

function cleanDateText(value) {
    if (!value) return '';
    const d = new Date(value + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// ---- Attendance ------------------------------------------------------------
function attendanceRows() {
    return (portalData.attendance || []).slice();
}

function attendance() {
    renderMenu('attendance');
    const rows = attendanceRows();
    shell('Attendance', `<div class="batch-select-wrap"><select class="batch-select"><option>${student.batch || ''}</option></select></div>
  <table class="simple-table attendance-table"><tbody>
  ${rows.map(r => `<tr><td>${r.month}</td><td>${r.value}</td></tr>`).join('') || '<tr><td>No attendance records yet</td><td></td></tr>'}
  </tbody></table>`);
}

// ---- Examination Hall -------------------------------------------------------
function examHall() {
    renderMenu('examHall');
    shell('Examination Hall', `<div class="field-row">
    <label class="field"><input class="date-input" type="text" placeholder="dd-mm-yyyy" onfocus="this.type='date'" onblur="if(!this.value)this.type='text'"></label>
    <label class="field"><input class="date-input" type="text" placeholder="dd-mm-yyyy" onfocus="this.type='date'" onblur="if(!this.value)this.type='text'"></label>
    <label class="field"><input class="search-input" type="text" placeholder="Search"></label>
  </div>
  <table class="simple-table"><thead><tr><th>Test Name</th><th>Date / Time</th><th>Test type</th><th>Duration</th><th>Time Left/Status</th><th>Attempt</th><th>Analysis</th></tr></thead><tbody>
  ${hallRows.map((r, i) => `<tr class="${i % 2 === 0 ? 'shade' : ''}"><td>${r.name}<a class="small-link">Syllabus</a></td><td>${r.date}</td><td>${r.type}</td><td>${r.duration}</td><td class="status-red">${r.status}</td><td><button class="btn-lightblue">Offline</button></td><td><button class="btn-blue" onclick="location.hash='result-${r.id}'">Result</button></td></tr>`).join('')}
  </tbody></table><div class="section-line"></div>`);
}

function resultPage(id) {
    renderMenu('examHall');
    const r = resultData[id] || resultData.it1 || { name: 'Test', marks: 0, maxMarks: 0, rows: [] };
    shell('Examination Hall', `<div class="result-page">
    <div class="result-breadcrumb"><span class="fa-icon">&#xf03a;</span> <a href="#examHall">Exam Hall</a> <span>&gt;</span> <span>${r.name}</span></div>
    <div class="result-test-meta"><div><b>Test Name:</b>&nbsp; ${r.name}</div><div><b>Attempt Date:</b>&nbsp; ${r.attemptDate || ''}</div></div>
    <h2 class="result-section-title">Overall Performance</h2>
    <section class="overall-card">
      <div class="overall-top">
        <div class="overall-stat"><span class="metric-icon gauge"><span class="fa-icon">&#xf3fd;</span></span><div><b>${r.marks}/${r.maxMarks}</b><span>Marks</span></div></div>
        <div class="overall-stat"><span class="metric-icon medal"><span class="fa-icon">&#xf559;</span></span><div><b>${r.rank}</b><span>Rank</span></div></div>
        <div class="overall-stat"><span class="metric-icon percent"><span class="fa-icon">&#xf295;</span></span><div><b>${r.percentile}</b><span>Percentile</span></div></div>
      </div>
      <div class="overall-line"></div>
      <div class="overall-bottom">
        <div><span>Avg Marks</span><b>${r.avgMarks}</b></div>
        <div><span>Max Marks</span><b>${r.maxMarks}</b></div>
        <div><span>Percentage</span><b>${r.percentage}</b></div>
      </div>
    </section>
    <section class="attempt-card">
      <div class="attempt-box correct"><span class="fa-icon">&#xf058;</span><b>${r.correct}</b><em>Correct</em></div>
      <div class="attempt-box incorrect"><span class="fa-icon">&#xf057;</span><b>${r.incorrect}</b><em>Incorrect</em></div>
      <div class="attempt-box attempted"><span class="fa-icon">&#xf15c;</span><b>${r.attempted}</b><em>Attempted</em></div>
      <div class="attempt-box unattempted"><span class="fa-icon">&#xf2bb;</span><b>${r.unattempted}</b><em>Unattempted</em></div>
    </section>
    <div class="result-tabs"><button class="active">Score Board</button>${r.showLeaderBoard ? '<a href="javascript:void(0)">Leader Board</a>' : ''}</div>
    <h2 class="score-title">SCORE SHEET</h2>
    <table class="simple-table score-table"><thead><tr><th>SUBJECTS</th><th>MAX. MARKS</th><th>MARKS OBTAINED</th><th>AVG MARKS</th><th>HIGHEST</th><th>PERCENTAGE</th><th>PERCENTILE</th><th>RANK</th></tr></thead><tbody>
      ${r.rows.map((row, i) => `<tr class="${i % 2 === 0 ? 'shade' : ''}">${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
  </div>`);
}

// ---- Performance Report (auto-refreshed from backend data) -------------------
function performanceTestRows() {
    const ordered = hallRows.slice().reverse();
    return ordered.map((test) => {
        const id = test.id;
        const r = resultData[id];
        if (!r) return null;
        const label = `${r.name} - ${r.attemptDate || ''}`;
        const findSubject = (name) => r.rows.find(row => String(row[0]).toLowerCase() === name.toLowerCase()) || ['', '', '', '', '', '', '', ''];
        const physics = findSubject('Physics');
        const chemistry = findSubject('Chemistry');
        const maths = findSubject('Maths');
        const total = findSubject('Total');
        const pct = String(total[5] || r.percentage || '').replace('%', '').trim();
        return [
            label,
            physics[2], physics[1], physics[3], physics[7],
            chemistry[2], chemistry[1], chemistry[3], chemistry[7],
            maths[2], maths[1], maths[3], maths[7],
            total[2], total[1], total[3], total[7], '0', pct
        ];
    }).filter(Boolean);
}

function performance() {
    renderMenu('performance');
    const months = ['MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB'];
    const attendanceMap = Object.fromEntries(attendanceRows().map(row => [row.month.slice(0, 3).toUpperCase(), row.value]));
    const attendanceTotal = months.map(month => (attendanceMap[month] || '/').split('/')[1] || '');
    const attendancePresent = months.map(month => (attendanceMap[month] || '/').split('/')[0] || '');
    const attendanceAbsent = attendanceTotal.map((total, i) => total ? Math.max(0, Number(total) - Number(attendancePresent[i] || 0)) : '');
    shell('Performance Report', `<div class="batch-select-wrap"><select class="batch-select"><option>${student.batch || ''}</option></select></div>
  <div class="report-box" style="margin-top:13px">
    <div class="report-header"><img src="assets/images/narayana_logo.png"><h2>Student Performance Report</h2><button class="print-btn" onclick="window.print()"><span class="fa-icon">&#xf02f;</span> Print</button></div>
    <div class="report-meta"><div><b>Name :</b> ${student.name}<br><b>Registration No :</b> ${student.registration}<br><b>Course / Program :</b> ELEVATE LEADER 12 PASS JEE-REGULAR CLASSROOM COURSE (PH-1 D-A, 06 MAY 26)</div><div><b>Goal :</b> ${student.goal}<br><b>Batch :</b> ${student.batch}</div></div>
    <div class="report-section-title">Attendance Report</div><table class="report-table"><tbody><tr><th>Month</th>${months.map(m => `<th>${m}</th>`).join('')}</tr><tr><td>TOTAL</td>${attendanceTotal.map(v => `<td>${v}</td>`).join('')}</tr><tr><td>PRESENT</td>${attendancePresent.map(v => `<td>${v}</td>`).join('')}</tr><tr><td>ABSENT</td>${attendanceAbsent.map(v => `<td>${v}</td>`).join('')}</tr></tbody></table>
    <div class="report-section-title">Test Report</div><table class="report-table"><tbody><tr><th rowspan="3">Test Name &amp; Date</th><th colspan="12">Paper 1 (Main)</th><th colspan="6">OVERALL PERFORMANCE</th></tr><tr><th colspan="4">Physics</th><th colspan="4">Chemistry</th><th colspan="4">Maths</th><th>MO</th><th>MM</th><th>Avg.</th><th>RK</th><th>CR</th><th>%age</th></tr><tr>${Array(18).fill(0).map((_, i) => `<th>${['MO', 'MM', 'AVG.', 'RK'][i % 4] || ''}</th>`).join('')}</tr>
    ${performanceTestRows().map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </div>`);
}

// ---- Placeholders ------------------------------------------------------------
function placeholder(title, active) {
    renderMenu(active);
    shell(title, `<div class="placeholder-box">No records found</div>`);
}

// ---- Routing -----------------------------------------------------------------
function route() {
    currentRoute = (location.hash || '#profile').replace('#', '');
    if (currentRoute.startsWith('result-')) {
        resultPage(currentRoute.replace('result-', ''));
        closeMobileMenu();
        return;
    }
    const map = {
        profile,
        timetable: timeTable,
        attendance,
        examHall,
        result: () => resultPage('it1'),
        examination: examHall,
        performance,
        'performance-report': performance,
        live: () => placeholder('Live Classes', 'live'),
        notice: () => placeholder('Notice Board', 'notice'),
        admit: () => placeholder('Admit Card', 'admit'),
        purchase: () => placeholder('Purchase History', 'purchase'),
        videos: () => placeholder('Videos', 'videos')
    };
    (map[currentRoute] || profile)();
    closeMobileMenu();
}

// ---- Mobile menu --------------------------------------------------------------
function openMobileMenu() {
    $('#sidebar') && $('#sidebar').classList.add('open');
    $('#mobileOverlay') && $('#mobileOverlay').classList.add('show');
    document.body.classList.add('menu-open');
}

function closeMobileMenu() {
    $('#sidebar') && $('#sidebar').classList.remove('open');
    $('#mobileOverlay') && $('#mobileOverlay').classList.remove('show');
    document.body.classList.remove('menu-open');
}

$('#mobileMenuBtn') && $('#mobileMenuBtn').addEventListener('click', openMobileMenu);
$('#mobileOverlay') && $('#mobileOverlay').addEventListener('click', closeMobileMenu);
$('#hamburger') && $('#hamburger').addEventListener('click', () => {
    if (window.matchMedia('(max-width: 800px)').matches) closeMobileMenu();
});
$('#sidebarLogout') && $('#sidebarLogout').addEventListener('click', studentLogout);
window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 800px)').matches) closeMobileMenu();
});
window.addEventListener('hashchange', route);

// ---- Boot ---------------------------------------------------------------------
(async function init() {
    if (location.protocol !== 'file:') {
        history.replaceState(null, '', window.location.pathname + window.location.search + '#profile');
        await enforceSession();
    }
    applyStudentDetails();
    route();
    syncServerTime();
    connectEvents();
    refreshPortalData();
    setInterval(enforceSession, 30000);
    setInterval(syncServerTime, 60000);
})();
