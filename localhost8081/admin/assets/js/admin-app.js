(() => {
    'use strict';

    // ---- session / auth ---------------------------------------------------
    let login = {};
    try { login = JSON.parse(localStorage.getItem('ntsc_landing_login') || '{}'); } catch (e) {}
    const token = login.token || '';
    const role = login.role || '';

    const $ = (s) => document.querySelector(s);
    const main = $('#mainContent');
    const app = $('#app');

    const WEEKNAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    let lastVersion = -1;
    let dirty = false;

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => t.classList.remove('show'), 2600);
    }

    async function api(path, opts = {}) {
        const res = await fetch(path, {
            ...opts,
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token, ...(opts.headers || {}) }
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
        return body;
    }

    async function gate() {
        if (!token || role !== 'admin') {
            localStorage.removeItem('ntsc_landing_login');
            location.href = '/';
            return false;
        }
        const res = await fetch('/api/session/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        if (!res.ok) {
            localStorage.removeItem('ntsc_landing_login');
            location.href = '/';
            return false;
        }
        const data = await res.json();
        if (!data.ok || data.role !== 'admin') {
            localStorage.removeItem('ntsc_landing_login');
            location.href = '/';
            return false;
        }
        return true;
    }

    async function adminLogout() {
        try {
            await fetch('/api/session/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
        } catch (e) {}
        localStorage.removeItem('ntsc_landing_login');
        location.href = '/';
    }
    window.adminLogout = adminLogout;

    // ---- date / time helpers ----------------------------------------------
    function pad2(n) { return String(n).padStart(2, '0'); }
    function isoOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    function todayISO() { return isoOf(new Date()); }
    function addDaysStr(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
    function mondayOf(dateStr) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); }
    function weekdayOf(dateStr) { return new Date(dateStr + 'T00:00:00').getDay(); }
    function timeRangeMinutes(t) {
        const m = /^(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})$/i.exec(String(t).trim());
        if (!m) return null;
        const [h1, n1, h2, n2] = m.slice(1).map(Number);
        if (h1 > 23 || n1 > 59 || h2 > 23 || n2 > 59) return null;
        const start = h1 * 60 + n1;
        const end = h2 * 60 + n2;
        if (end <= start) return null;
        return { start, end };
    }
    function dayError(rows, date) {
        if (weekdayOf(date) === 0 || weekdayOf(date) === 6) return 'Classes can only be scheduled Mon–Fri';
        if (!Array.isArray(rows) || rows.length !== 4) return 'Exactly 4 sessions required (3 regular + 1 doubt)';
        const regular = rows.filter((r) => String(r[2]).trim() === 'Regular Class').length;
        const doubt = rows.filter((r) => String(r[2]).trim() === 'Doubt Class').length;
        if (regular !== 3) return `3 regular classes required (have ${regular})`;
        if (doubt !== 1) return `1 doubt session required (have ${doubt})`;
        const seen = new Set();
        const ranges = [];
        for (const r of rows) {
            if (!r[0] || !r[1] || !String(r[2]).trim() || !String(r[3]).trim()) return 'Every session needs a time, type and subject';
            const key = r.join('|');
            if (seen.has(key)) return 'Duplicate session';
            seen.add(key);
            const range = timeRangeMinutes(r[1]);
            if (!range) return 'Invalid time range (use HH:mm to HH:mm, end after start)';
            ranges.push(range);
        }
        ranges.sort((a, b) => a.start - b.start);
        for (let i = 1; i < ranges.length; i++) {
            if (ranges[i].start < ranges[i - 1].end) return 'Sessions must not overlap';
        }
        return null;
    }
    function dayStatus(rows, date) {
        const err = dayError(rows, date);
        return err ? `<span class="warn-chip">${esc(err)}</span>` : `<span class="valid-chip">3 Regular + 1 Doubt</span>`;
    }

    function monthKey(label) {
        const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(label || '').trim());
        if (!m) return '';
        const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const i = names.findIndex((n) => n.toLowerCase() === m[1].toLowerCase());
        if (i < 0) return '';
        return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
    }
    function monthLabel(key) {
        const [y, m] = String(key).split('-');
        const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const i = Number(m) - 1;
        return names[i] ? `${names[i]} ${y}` : '';
    }

    function typeOptions(sel) {
        return ['Regular Class', 'Doubt Class'].map((o) => `<option ${o === sel ? 'selected' : ''}>${o}</option>`).join('');
    }

    // ---- shell ------------------------------------------------------------
    const menus = [
        ['dashboard', 'f0e4', 'Dashboard'],
        ['timetable', 'f274', 'Time Table'],
        ['attendance', 'f14a', 'Attendance'],
        ['sessions', 'f2c0', 'Sessions'],
        ['audit', 'f188', 'Audit Log'],
        ['tests', 'f108', 'Tests'],
        ['results', 'f201', 'Results'],
        ['calendar', 'f133', 'Exam Calendar'],
        ['profile', 'f007', 'Student Profile'],
        ['jobs', 'f013', 'Jobs & Scheduler']
    ];

    function renderMenu(active) {
        $('#sideMenu').innerHTML = menus.map((m) => {
            const [route, icon, label] = m;
            return `<a class="menu-item ${route === active ? 'active' : ''}" href="#${route}"><span class="menu-ico fa-icon">&#x${icon};</span><span>${label}</span></a>`;
        }).join('');
    }

    function shell(title, body) {
        app.classList.remove('dashboard-mode');
        main.innerHTML = `<div class="page-card"><div class="page-title-row"><h1 class="page-title">${esc(title)}</h1><div class="page-actions"><button class="logout-button" type="button" onclick="adminLogout()">Logout</button></div></div>${body}</div>`;
    }

    function openMobileMenu() {
        $('#sidebar').classList.add('open');
        $('#mobileOverlay').classList.add('show');
        document.body.classList.add('menu-open');
    }

    function closeMobileMenu() {
        $('#sidebar').classList.remove('open');
        $('#mobileOverlay').classList.remove('show');
        document.body.classList.remove('menu-open');
    }

    // ---- Dashboard --------------------------------------------------------
    async function dashboard() {
        renderMenu('dashboard');
        const s = await api('/api/admin/status');
        const sum = s.summary || {};
        const now = new Date();
        const thisMonth = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const attNow = (sum.attendance || []).find((r) => r.month === thisMonth) || (sum.attendance || [])[0] || { value: '0/0' };
        const [pr, tot] = String(attNow.value || '/').split('/');
        const pct = Number(tot) ? Math.round((Number(pr) / Number(tot)) * 100) : 0;
        shell('Dashboard', `<div class="admin-card">
            <div class="admin-topbar">Portal Admin Dashboard <small>${esc(thisMonth)}</small></div>
            <div class="stat-grid">
                <div class="stat-card"><span class="stat-icon fa-icon">&#xf274;</span><div><b>${sum.timetableRows || 0}</b><span>Class slots</span></div></div>
                <div class="stat-card"><span class="stat-icon fa-icon">&#xf14a;</span><div><b>${pct}%</b><span>Attendance</span></div></div>
                <div class="stat-card"><span class="stat-icon fa-icon">&#xf108;</span><div><b>${sum.tests || 0}</b><span>Tests</span></div></div>
                <div class="stat-card"><span class="stat-icon fa-icon">&#xf201;</span><div><b>${sum.results || 0}</b><span>Results</span></div></div>
            </div>
            <div class="section-line"></div>
            <div class="admin-meta">
                <div><b>Generated weeks:</b> ${(sum.weeks || []).join(', ') || 'none yet'}</div>
                <div><b>Attendance updated for:</b> ${esc(sum.attendanceUpdatedFor || '—')}</div>
                <div><b>Last attendance update:</b> ${esc(sum.lastAttendanceUpdateAt || '—')}</div>
                <div><b>Active student sessions:</b> ${sum.activeStudentSessions || 0}</div>
                <div><b>Scheduler:</b> ${esc(s.scheduler.timetableCron)} / ${esc(s.scheduler.attendanceCron)} (${esc(s.scheduler.timezone)})</div>
            </div>
        </div>`);
    }

    // ---- Time Table -------------------------------------------------------
    let TT = { timetable: [], timetables: {}, timetableWeekStart: null };
    let ttWeekStart = null;
    let ttActiveDate = null;
    let editingRows = [];

    async function timetablePage() {
        renderMenu('timetable');
        dirty = false;
        let istDate = todayISO();
        try { istDate = (await api('/api/time')).date || istDate; } catch (e) {}
        if (!ttWeekStart) ttWeekStart = mondayOf(istDate);
        TT = await api('/api/admin/timetable');
        if (!ttActiveDate || weekdayOf(ttActiveDate) === 0 || weekdayOf(ttActiveDate) === 6) {
            ttActiveDate = ttWeekStart <= istDate && istDate <= addDaysStr(ttWeekStart, 4) ? istDate : ttWeekStart;
        }
        loadEditingRows();
        renderTimetable();
    }

    function weekDates(weekStart) {
        return Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
    }

    function loadEditingRows() {
        editingRows = (TT.timetable.filter((r) => r[0] === ttActiveDate) || []).map((r) => {
            const row = r.slice();
            while (row.length < 6) row.push('');
            return row;
        });
    }

    function renderTimetable() {
        const dates = weekDates(ttWeekStart);
        if (!dates.includes(ttActiveDate)) ttActiveDate = dates[0];
        const meta = TT.timetables[ttWeekStart];
        shell('Time Table', `
            <div class="gen-week">
                <input id="weekStartInput" class="admin-inp" value="${esc(ttWeekStart)}">
                <button type="button" class="admin-light-btn" onclick="weekShift(-7)">&#171; Prev</button>
                <button type="button" class="admin-light-btn" onclick="weekShift(7)">Next &#187;</button>
                <button type="button" class="admin-submit-btn" onclick="genWeek()">Generate Week</button>
                <button type="button" class="admin-light-btn" onclick="previewWeekNow()">Preview Week</button>
            </div>
            <div class="admin-row-form">
                <div class="date-label">${meta ? `Week of ${esc(meta.weekStart)} — ${esc(meta.weekEnd)}` : `Week of ${esc(ttWeekStart)} (not generated yet)`} <small>generationVersion ${meta ? esc(meta.generationVersion) : '—'}</small></div>
            </div>
            <div class="date-tabs">${dates.map((d) => `<button type="button" class="date-tab ${d === ttActiveDate ? 'active' : ''}" data-date="${d}" onclick="setTTDate('${d}')">${WEEKNAMES[weekdayOf(d)]} ${String(Number(d.slice(8))).padStart(2, '0')}</button>`).join('')}</div>
            <div class="day-head"><b>${esc(ttActiveDate)} — ${esc(WEEKNAMES[weekdayOf(ttActiveDate)])}</b>${dayStatus(editingRows, ttActiveDate)}</div>
            <div class="admin-row-form">
                <div class="date-label">Sessions for this day <small>exactly 3 Regular Class + 1 Doubt Class, no overlaps</small></div>
                <div class="tt-inputs tt-header">
                    <span>Time (HH:mm to HH:mm)</span><span>Type</span><span>Subject Track</span><span>Teacher</span><span>Room</span><span></span>
                </div>
                ${editingRows.map((r, i) => `<div class="tt-inputs tt-row">
                    <input class="tt-time admin-inp" value="${esc(r[1])}" placeholder="08:30 to 10:00">
                    <select class="tt-type admin-inp">${typeOptions(r[2])}</select>
                    <input class="tt-subject admin-inp" value="${esc(r[3])}" placeholder="e.g. Physics Track-1">
                    <input class="tt-teacher admin-inp" value="${esc(r[4])}" placeholder="Teacher">
                    <input class="tt-room admin-inp" value="${esc(r[5])}" placeholder="Room">
                    <button type="button" class="admin-danger-btn" onclick="delEditRow(${i})">Delete</button>
                </div>`).join('') || '<div class="tt-inputs tt-row empty-row"><span class="empty-note">No sessions yet for this day — add below.</span></div>'}
            </div>
            <div class="row-actions">
                <button type="button" class="admin-light-btn" onclick="addEditRow()">+ Add Session</button>
                <button type="button" class="admin-submit-btn" onclick="saveDay()">Save Date</button>
                <button type="button" class="admin-danger-btn" onclick="clearDay()">Clear Date</button>
            </div>
            <div class="admin-meta" style="margin-top:12px">
                <div><b>Generated weeks:</b> ${Object.keys(TT.timetables).sort().join(', ') || 'none yet'}</div>
                <div><b>Flat rows:</b> ${TT.timetable.length}</div>
            </div>`);
    }

    function collectEditing() {
        return [...document.querySelectorAll('.tt-row')].map((el) => {
            const t = el.querySelector('.tt-time');
            if (!t) return null;
            return [ttActiveDate, t.value.trim(), el.querySelector('.tt-type').value, el.querySelector('.tt-subject').value.trim(), el.querySelector('.tt-teacher').value.trim(), el.querySelector('.tt-room').value.trim()];
        }).filter(Boolean);
    }

    window.setTTDate = (d) => {
        if (dirty) { toast('Save or refresh the current day first'); return; }
        ttActiveDate = d;
        loadEditingRows();
        renderTimetable();
    };

    window.weekShift = async (delta) => {
        if (dirty) { toast('Save or refresh the current day first'); return; }
        ttWeekStart = addDaysStr(ttWeekStart, delta);
        ttActiveDate = ttWeekStart;
        loadEditingRows();
        renderTimetable();
    };

    window.addEditRow = () => {
        editingRows.push([ttActiveDate, '', 'Regular Class', '', '', '']);
        renderTimetable();
    };

    window.delEditRow = (i) => {
        editingRows.splice(i, 1);
        renderTimetable();
    };

    window.saveDay = async () => {
        const rows = collectEditing();
        const err = dayError(rows, ttActiveDate);
        if (err) { toast(err); return; }
        try {
            await api('/api/admin/timetable/' + ttActiveDate, { method: 'PUT', body: JSON.stringify({ rows }) });
            dirty = false;
            toast('Saved ' + ttActiveDate);
            await timetablePage();
        } catch (e) { toast(e.message); }
    };

    window.clearDay = async () => {
        if (!confirm('Remove all sessions for ' + ttActiveDate + '?')) return;
        try {
            await api('/api/admin/timetable/' + ttActiveDate, { method: 'DELETE' });
            dirty = false;
            toast('Cleared ' + ttActiveDate);
            await timetablePage();
        } catch (e) { toast(e.message); }
    };

    window.genWeek = async () => {
        const ws = $('#weekStartInput').value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || weekdayOf(ws) !== 1) { toast('Enter a Monday date (YYYY-MM-DD)'); return; }
        try {
            const r = await api('/api/timetable/generate', { method: 'POST', body: JSON.stringify({ weekStart: ws }) });
            toast(r.created ? 'Generated ' + ws : 'Week already exists: ' + ws);
            await timetablePage();
        } catch (e) { toast(e.message); }
    };

    window.previewWeekNow = async () => {
        const ws = $('#weekStartInput').value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || weekdayOf(ws) !== 1) { toast('Enter a Monday date (YYYY-MM-DD)'); return; }
        try {
            const r = await api('/api/admin/timetable/preview', { method: 'POST', body: JSON.stringify({ weekStart: ws }) });
            showPreview(r.rows || [], ws);
        } catch (e) { toast(e.message); }
    };

    function showPreview(rows, weekStart) {
        const ov = document.createElement('div');
        ov.className = 'modal-overlay';
        ov.innerHTML = `<div class="modal-box">
            <div class="modal-head"><b>Preview — week of ${esc(weekStart)}</b><button type="button" class="admin-danger-btn" onclick="this.closest('.modal-overlay').remove()">Close</button></div>
            <div class="modal-body"><table class="simple-table"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Subject</th><th>Teacher</th><th>Room</th></tr></thead><tbody>
            ${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td></tr>`).join('')}
            </tbody></table></div>
            <div class="modal-foot"><span class="pill">20 sessions · 4 per weekday · not saved</span>
            <button type="button" class="admin-submit-btn" onclick="previewGenerate()">Generate This Week</button></div>
        </div>`;
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
    }

    window.previewGenerate = async () => {
        const ws = $('#weekStartInput').value.trim();
        const ov = document.querySelector('.modal-overlay');
        try {
            const r = await api('/api/timetable/generate', { method: 'POST', body: JSON.stringify({ weekStart: ws }) });
            if (ov) ov.remove();
            toast(r.created ? 'Generated ' + ws : 'Week already exists: ' + ws);
            await timetablePage();
        } catch (e) { toast(e.message); }
    };

    // ---- Attendance -------------------------------------------------------
    async function attendancePage() {
        renderMenu('attendance');
        dirty = false;
        const d = await api('/api/admin/attendance');
        const rows = d.attendance || [];
        shell('Attendance', `
            <div class="admin-topbar">Monthly attendance <small>auto-updated Mon–Fri 10 AM IST · updated for ${esc(d.attendanceUpdatedFor || '—')}${d.lastAttendanceUpdateAt ? ' · ' + esc(d.lastAttendanceUpdateAt) : ''}</small></div>
            <div class="admin-row-form">
                <div class="date-label">Add / edit a full month record <small>pins the record so the scheduler never overwrites it</small></div>
                <div class="tt-inputs">
                    <input id="mKey" class="admin-inp" placeholder="Month YYYY-MM" value="${currentMonthKey()}">
                    <input id="mPresent" class="admin-inp" type="number" min="0" placeholder="Present" value="">
                    <input id="mTotal" class="admin-inp" type="number" min="1" placeholder="Total" value="">
                    <button type="button" class="admin-submit-btn" onclick="saveMonthRecord()">Save Record</button>
                </div>
            </div>
            <table class="simple-table month-table"><thead><tr><th>Month</th><th>Present</th><th>Total</th><th style="width:150px"></th></tr></thead>
                <tbody>${rows.map((r) => {
                    const key = monthKey(r.month);
                    const [p, t] = String(r.value || '/').split('/');
                    return `<tr>
                        <td>${esc(r.month)} <span class="pill">${esc(key)}</span></td>
                        <td><input class="m-present admin-inp" type="number" min="0" data-key="${esc(key)}" value="${esc(p)}"></td>
                        <td><input class="m-total admin-inp" type="number" min="1" data-key="${esc(key)}" value="${esc(t)}"></td>
                        <td>
                            <button type="button" class="admin-submit-btn" onclick="saveMonth(this)">Save</button>
                            <button type="button" class="admin-danger-btn" onclick="deleteMonth(this)">Delete</button>
                        </td>
                    </tr>`;
                }).join('') || '<tr><td colspan="4">No attendance records yet — records appear automatically after the 10 AM job or a manual run.</td></tr>'}</tbody>
            </table>
            <p class="empty-note">Present cannot exceed total. Saving a month pins its value: the automatic job will only mark future days as attended without overwriting your record.</p>`);
    }

    function currentMonthKey() {
        const now = new Date();
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    }

    window.saveMonthRecord = async () => {
        const key = $('#mKey').value.trim();
        const present = $('#mPresent').value.trim();
        const total = $('#mTotal').value.trim();
        if (!/^\d{4}-\d{2}$/.test(key)) { toast('Month must be YYYY-MM'); return; }
        try {
            await api('/api/admin/attendance/record', { method: 'PUT', body: JSON.stringify({ key, present: present === '' ? null : present, total: total === '' ? null : total }) });
            dirty = false;
            toast('Record saved for ' + key);
            await attendancePage();
        } catch (e) { toast(e.message); }
    };

    window.saveMonth = async (btn) => {
        const tr = btn.closest('tr');
        const key = tr.querySelector('.m-present').dataset.key;
        const present = tr.querySelector('.m-present').value.trim();
        const total = tr.querySelector('.m-total').value.trim();
        try {
            await api('/api/admin/attendance/record', { method: 'PUT', body: JSON.stringify({ key, present: present === '' ? null : present, total: total === '' ? null : total }) });
            dirty = false;
            toast('Saved');
            await attendancePage();
        } catch (e) { toast(e.message); }
    };

    window.deleteMonth = async (btn) => {
        const key = btn.closest('tr').querySelector('.m-present').dataset.key;
        if (!confirm('Delete the attendance record for ' + monthLabel(key) + '?')) return;
        try {
            await api('/api/admin/attendance/' + key, { method: 'DELETE' });
            dirty = false;
            toast('Deleted ' + monthLabel(key));
            await attendancePage();
        } catch (e) { toast(e.message); }
    };

    // ---- Sessions ---------------------------------------------------------
    async function sessionsPage() {
        renderMenu('sessions');
        const d = await api('/api/admin/sessions');
        const list = d.sessions || [];
        shell('Sessions', `
            <div class="admin-topbar">Active student sessions <small>${list.length} session(s)</small></div>
            <p class="empty-note">Log a student out from any device instantly. The student&#39;s browser is told in real time and redirected to the login screen.</p>
            <table class="simple-table session-table"><thead><tr><th>User</th><th>Device</th><th>Logged in</th><th>Last activity</th><th>Status</th><th style="width:120px"></th></tr></thead>
                <tbody>${list.map((s) => `<tr data-sid="${esc(s.sid)}">
                    <td>${esc(s.user)}</td>
                    <td>${esc(s.device || '—')}</td>
                    <td>${esc((s.loggedInAt || '').replace('T', ' ').slice(0, 19)) || '—'}</td>
                    <td>${esc((s.lastActivityAt || '').replace('T', ' ').slice(0, 19)) || '—'}</td>
                    <td>${s.active ? '<span class="valid-chip">active</span>' : '<span class="warn-chip">idle</span>'}</td>
                    <td><button type="button" class="admin-danger-btn" onclick="revokeSession(this)">Revoke</button></td>
                </tr>`).join('') || '<tr><td colspan="6">No student sessions.</td></tr>'}</tbody>
            </table>
            <div class="row-actions" style="margin-top:12px">
                <button type="button" class="admin-danger-btn" onclick="revokeAll()">Revoke All Sessions</button>
            </div>`);
    }

    window.revokeSession = async (btn) => {
        const tr = btn.closest('tr');
        const sid = tr.dataset.sid;
        const user = tr.cells[0].textContent;
        if (!confirm('Sign out "' + user + '" from their device?')) return;
        try {
            await api('/api/admin/sessions/' + encodeURIComponent(sid), { method: 'DELETE' });
            toast('Session revoked');
            await sessionsPage();
        } catch (e) { toast(e.message); }
    };

    window.revokeAll = async () => {
        if (!confirm('Sign out ALL students from every device?')) return;
        try {
            const r = await api('/api/admin/sessions', { method: 'DELETE' });
            toast('Revoked ' + r.revoked + ' session(s)');
            await sessionsPage();
        } catch (e) { toast(e.message); }
    };

    // ---- Audit Log --------------------------------------------------------
    async function auditPage() {
        renderMenu('audit');
        const d = await api('/api/admin/audit');
        const audit = (d.audit || []).slice().reverse();
        shell('Audit Log', `
            <div class="admin-topbar">Change history <small>${audit.length} entries · newest first</small></div>
            <table class="simple-table audit-table"><thead><tr><th>Time (IST)</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
                <tbody>${audit.map((a) => `<tr>
                    <td>${esc((a.at || '').replace('T', ' ').replace('Z', '').slice(0, 19))}</td>
                    <td>${esc(a.actor)}</td>
                    <td><span class="pill">${esc(a.action)}</span></td>
                    <td>${esc(a.target || '—')}</td>
                    <td>${esc(typeof a.detail === 'string' ? a.detail : (a.detail ? JSON.stringify(a.detail) : '—'))}</td>
                </tr>`).join('') || '<tr><td colspan="5">No activity recorded yet.</td></tr>'}</tbody>
            </table>`);
    }

    // ---- Tests ------------------------------------------------------------
    async function testsPage() {
        renderMenu('tests');
        const d = await api('/api/admin/tests');
        const tests = d.tests || [];
        shell('Tests', `
            <div class="admin-row-form"><div class="date-label">Add new test</div>
                <div class="t-fields">
                    <input id="nId" class="admin-inp" placeholder="ID (e.g. it5)">
                    <input id="nName" class="admin-inp" placeholder="Name">
                    <input id="nDate" class="admin-inp" placeholder="Date (e.g. 12/08/2026 09:00 am)">
                    <input id="nType" class="admin-inp" placeholder="Type (e.g. Non live)">
                    <input id="nDur" class="admin-inp" placeholder="Duration (e.g. 180 min)">
                    <input id="nStatus" class="admin-inp" placeholder="Status (e.g. Upcoming)">
                </div>
                <div class="row-actions"><button type="button" class="admin-submit-btn" onclick="addTest()">Add Test</button></div>
            </div>
            ${tests.map((t) => `
                <div class="test-row">
                    <div class="t-head"><b>${esc(t.id)} · ${esc(t.name)}</b><span class="pill">${esc(t.status || '')}</span></div>
                    <div class="t-fields">
                        <input class="admin-inp e-name" value="${esc(t.name)}" placeholder="Name">
                        <input class="admin-inp e-date" value="${esc(t.date)}" placeholder="Date">
                        <input class="admin-inp e-type" value="${esc(t.type)}" placeholder="Type">
                        <input class="admin-inp e-dur" value="${esc(t.duration)}" placeholder="Duration">
                        <input class="admin-inp e-status" value="${esc(t.status)}" placeholder="Status">
                    </div>
                    <div class="row-actions">
                        <button type="button" class="admin-submit-btn" onclick="saveTest(this)">Save</button>
                        <button type="button" class="admin-danger-btn" onclick="delTest(this)">Delete</button>
                    </div>
                </div>`).join('') || '<div class="empty-note">No tests added yet.</div>'}`);
    }

    window.addTest = async () => {
        const test = {
            id: $('#nId').value.trim(),
            name: $('#nName').value.trim(),
            date: $('#nDate').value.trim(),
            type: $('#nType').value.trim(),
            duration: $('#nDur').value.trim(),
            status: $('#nStatus').value.trim()
        };
        if (!test.id || !test.name) { toast('ID and Name are required'); return; }
        try {
            await api('/api/admin/tests', { method: 'POST', body: JSON.stringify({ test }) });
            toast('Test added');
            await testsPage();
        } catch (e) { toast(e.message); }
    };

    function testRowId(btn) {
        return btn.closest('.test-row').querySelector('.t-head b').textContent.split(' · ')[0];
    }

    window.saveTest = async (btn) => {
        const row = btn.closest('.test-row');
        const test = {
            name: row.querySelector('.e-name').value.trim(),
            date: row.querySelector('.e-date').value.trim(),
            type: row.querySelector('.e-type').value.trim(),
            duration: row.querySelector('.e-dur').value.trim(),
            status: row.querySelector('.e-status').value.trim()
        };
        try {
            await api('/api/admin/tests/' + encodeURIComponent(testRowId(btn)), { method: 'PUT', body: JSON.stringify({ test }) });
            toast('Saved');
            await testsPage();
        } catch (e) { toast(e.message); }
    };

    window.delTest = async (btn) => {
        try {
            await api('/api/admin/tests/' + encodeURIComponent(testRowId(btn)), { method: 'DELETE' });
            toast('Deleted');
            await testsPage();
        } catch (e) { toast(e.message); }
    };

    // ---- Results ----------------------------------------------------------
    let currentResultId = null;
    let RES = null;

    async function resultsPage() {
        renderMenu('results');
        const d = await api('/api/admin/tests');
        const tests = d.tests || [];
        if (!tests.length) {
            shell('Results', '<div class="empty-note">No tests yet — add tests on the Tests page first.</div>');
            return;
        }
        if (!currentResultId || !tests.some((t) => t.id === currentResultId)) currentResultId = tests[0].id;
        let res = null;
        try { res = (await api('/api/admin/results/' + encodeURIComponent(currentResultId))).result; } catch (e) { res = null; }
        RES = res;
        shell('Results', `
            <select class="select-test" onchange="pickResult(this.value)">${tests.map((t) => `<option value="${esc(t.id)}" ${t.id === currentResultId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
            ${resultEditor(res)}`);
    }

    window.pickResult = (id) => { currentResultId = id; resultsPage(); };

    function resultEditor(r) {
        const g = (k, d) => (r && r[k] !== undefined ? r[k] : d);
        const rowCount = r && r.rows && r.rows.length ? r.rows.length : 3;
        const grid = [];
        for (let i = 0; i < rowCount; i++) {
            const row = (r && r.rows && r.rows[i]) || ['', '', '', '', '', '', '', ''];
            const cells = [];
            for (let c = 0; c < 8; c++) cells.push(`<td><input data-r="${i}" data-c="${c}" value="${esc(row[c])}"></td>`);
            grid.push('<tr>' + cells.join('') + '</tr>');
        }
        return `<div class="admin-card">
            <div class="admin-topbar">Result — ${esc(r ? r.name : 'New result')} <small>overall numbers</small></div>
            <div class="t-fields">
                <input id="rs-name" class="admin-inp" placeholder="Name" value="${esc(g('name', ''))}">
                <input id="rs-date" class="admin-inp" placeholder="Attempt date" value="${esc(g('attemptDate', ''))}">
                <input id="rs-marks" class="admin-inp" placeholder="Marks" value="${esc(g('marks', ''))}">
                <input id="rs-max" class="admin-inp" placeholder="Max Marks" value="${esc(g('maxMarks', ''))}">
                <input id="rs-rank" class="admin-inp" placeholder="Rank" value="${esc(g('rank', ''))}">
                <input id="rs-pctile" class="admin-inp" placeholder="Percentile" value="${esc(g('percentile', ''))}">
                <input id="rs-avg" class="admin-inp" placeholder="Avg Marks" value="${esc(g('avgMarks', ''))}">
                <input id="rs-pct" class="admin-inp" placeholder="Percentage %" value="${esc(g('percentage', ''))}">
                <input id="rs-correct" class="admin-inp" placeholder="Correct" value="${esc(g('correct', ''))}">
                <input id="rs-incorrect" class="admin-inp" placeholder="Incorrect" value="${esc(g('incorrect', ''))}">
                <input id="rs-attempted" class="admin-inp" placeholder="Attempted" value="${esc(g('attempted', ''))}">
                <input id="rs-unattempted" class="admin-inp" placeholder="Unattempted" value="${esc(g('unattempted', ''))}">
            </div>
            <div class="admin-topbar" style="margin-top:14px">Score rows — Subject, Max, Marks, Avg, Highest, %age, Percentile, Rank</div>
            <table class="simple-table res-table"><thead><tr><th>Subject</th><th>Max</th><th>Marks</th><th>Avg</th><th>Highest</th><th>%age</th><th>Percentile</th><th>Rank</th></tr></thead>
                <tbody>${grid.join('')}</tbody>
            </table>
            <div class="row-actions"><button type="button" class="admin-submit-btn" onclick="saveResult()">Save Result</button></div>
        </div>`;
    }

    window.saveResult = async () => {
        const rows = [];
        document.querySelectorAll('.res-table tbody tr').forEach((tr) => {
            const row = [];
            tr.querySelectorAll('input').forEach((inp) => row.push(inp.value));
            rows.push(row);
        });
        const result = {
            name: $('#rs-name').value.trim(),
            attemptDate: $('#rs-date').value.trim(),
            marks: $('#rs-marks').value,
            maxMarks: $('#rs-max').value,
            rank: $('#rs-rank').value,
            percentile: $('#rs-pctile').value,
            avgMarks: $('#rs-avg').value,
            percentage: $('#rs-pct').value,
            correct: $('#rs-correct').value,
            incorrect: $('#rs-incorrect').value,
            attempted: $('#rs-attempted').value,
            unattempted: $('#rs-unattempted').value,
            rows
        };
        try {
            await api('/api/admin/results/' + encodeURIComponent(currentResultId), { method: 'PUT', body: JSON.stringify({ result }) });
            toast('Result saved');
            await resultsPage();
        } catch (e) { toast(e.message); }
    };

    // ---- Exam Calendar ----------------------------------------------------
    async function calendarPage() {
        renderMenu('calendar');
        const d = await api('/api/admin/exam-calendar');
        const list = d.examCalendar || [];
        shell('Exam Calendar', `
            <div class="admin-row-form"><div class="date-label">Add exam</div>
                <div class="tt-inputs">
                    <input id="cName" class="admin-inp" placeholder="Exam name">
                    <input id="cDate" class="admin-inp" placeholder="Date (e.g. 23-Aug-2026 09:00 AM)">
                    <input id="cGoal" class="admin-inp" placeholder="Goal (e.g. JEE)">
                    <button type="button" class="admin-light-btn" onclick="addCal()">+ Add</button>
                </div>
                <input id="cVenue" class="admin-inp" placeholder="Venue / address" style="margin:0 12px 12px;width:calc(100% - 24px)">
            </div>
            <table class="simple-table"><thead><tr><th>Name</th><th>Date / Time</th><th>Goal</th><th>Venue</th><th style="width:120px"></th></tr></thead>
                <tbody>${list.map((e, i) => `<tr>
                    <td><input class="admin-inp c-name" value="${esc(e[0])}"></td>
                    <td><input class="admin-inp c-date" value="${esc(e[1])}"></td>
                    <td><input class="admin-inp c-goal" value="${esc(e[2])}"></td>
                    <td><input class="admin-inp c-venue" value="${esc(e[3])}"></td>
                    <td><button type="button" class="admin-light-btn" onclick="saveCal(this)">Save</button>
                        <button type="button" class="admin-danger-btn" onclick="delCal(${i})">Del</button></td>
                </tr>`).join('') || '<tr><td colspan="5">No exams scheduled.</td></tr>'}</tbody>
            </table>`);
    }

    window.addCal = async () => {
        const entry = [$('#cName').value.trim(), $('#cDate').value.trim(), $('#cGoal').value.trim(), $('#cVenue').value.trim()];
        if (!entry[0]) { toast('Exam name required'); return; }
        try {
            await api('/api/admin/exam-calendar', { method: 'POST', body: JSON.stringify({ entry }) });
            toast('Added');
            await calendarPage();
        } catch (e) { toast(e.message); }
    };

    function calRowIndex(btn) {
        const tr = btn.closest('tr');
        return [...tr.parentElement.children].indexOf(tr);
    }

    window.saveCal = async (btn) => {
        const tr = btn.closest('tr');
        const entry = [
            tr.querySelector('.c-name').value.trim(),
            tr.querySelector('.c-date').value.trim(),
            tr.querySelector('.c-goal').value.trim(),
            tr.querySelector('.c-venue').value.trim()
        ];
        try {
            await api('/api/admin/exam-calendar/' + calRowIndex(btn), { method: 'PUT', body: JSON.stringify({ entry }) });
            toast('Saved');
            await calendarPage();
        } catch (e) { toast(e.message); }
    };

    window.delCal = async (i) => {
        try {
            await api('/api/admin/exam-calendar/' + i, { method: 'DELETE' });
            toast('Deleted');
            await calendarPage();
        } catch (e) { toast(e.message); }
    };

    // ---- Student Profile --------------------------------------------------
    async function profilePage() {
        renderMenu('profile');
        const d = await api('/api/admin/student');
        const s = d.student || {};
        const f = (k) => (s[k] !== undefined ? s[k] : '');
        shell('Student Profile', `
            <div class="admin-card" style="max-width:680px">
                <div class="admin-topbar">Registered student record</div>
                <div class="t-fields">
                    <input id="p-name" class="admin-inp" placeholder="Name" value="${esc(f('name'))}">
                    <input id="p-email" class="admin-inp" placeholder="Email" value="${esc(f('email'))}">
                    <input id="p-mobile" class="admin-inp" placeholder="Mobile" value="${esc(f('mobile'))}">
                    <input id="p-goal" class="admin-inp" placeholder="Goal" value="${esc(f('goal'))}">
                    <input id="p-class" class="admin-inp" placeholder="Current Class" value="${esc(f('currentClass'))}">
                    <input id="p-sid" class="admin-inp" placeholder="Student UID" value="${esc(f('studentId'))}">
                    <input id="p-batch" class="admin-inp" placeholder="Batch" value="${esc(f('batch'))}">
                    <input id="p-reg" class="admin-inp" placeholder="Registration" value="${esc(f('registration'))}">
                </div>
                <div class="row-actions"><button type="button" class="admin-submit-btn" onclick="saveProfile()">Save Profile</button></div>
            </div>`);
    }

    window.saveProfile = async () => {
        const student = {
            name: $('#p-name').value.trim(),
            email: $('#p-email').value.trim(),
            mobile: $('#p-mobile').value.trim(),
            goal: $('#p-goal').value.trim(),
            currentClass: $('#p-class').value.trim(),
            studentId: $('#p-sid').value.trim(),
            batch: $('#p-batch').value.trim(),
            registration: $('#p-reg').value.trim()
        };
        try {
            await api('/api/admin/student', { method: 'PUT', body: JSON.stringify({ student }) });
            toast('Profile saved');
            await profilePage();
        } catch (e) { toast(e.message); }
    };

    // ---- Jobs & Scheduler -------------------------------------------------
    async function jobsPage() {
        renderMenu('jobs');
        const s = await api('/api/admin/status');
        const sch = s.scheduler || {};
        const sum = s.summary || {};
        shell('Jobs & Scheduler', `
            <div class="admin-card" style="max-width:760px">
                <div class="admin-topbar">Automatic timetable & attendance <small>${esc(sch.timezone)}</small></div>
                <div class="admin-meta">
                    <div><b>Timetable job:</b> ${esc(sch.timetableCron || '')} (Sunday 6 PM IST)</div>
                    <div><b>Attendance job:</b> ${esc(sch.attendanceCron || '')} (Mon–Fri 10 AM IST)</div>
                    <div><b>Generated weeks:</b> ${(sum.weeks || []).join(', ') || 'none'}</div>
                    <div><b>Attendance updated for:</b> ${esc(sum.attendanceUpdatedFor || '—')}</div>
                    <div><b>Active student sessions:</b> ${sum.activeStudentSessions || 0}</div>
                </div>
                <div class="section-line"></div>
                <p class="empty-note">Both jobs run on a persistent server and are idempotent — no duplicates and a safe catch-up after downtime. They also run automatically on the first API request after the server starts (Render free plan has no background cron).</p>
                <div class="row-actions">
                    <button type="button" class="admin-submit-btn" onclick="runTimetableJob()">Run Timetable Job</button>
                    <button type="button" class="admin-submit-btn" onclick="runAttendanceJob()">Run Attendance Job</button>
                </div>
            </div>`);
    }

    window.runTimetableJob = async () => {
        try {
            const r = await api('/api/jobs/run-timetable', { method: 'POST', body: '{}' });
            toast('generated: ' + ((r.generated || []).join(', ') || 'nothing due'));
            await jobsPage();
        } catch (e) { toast(e.message); }
    };

    window.runAttendanceJob = async () => {
        try {
            const r = await api('/api/jobs/run-attendance', { method: 'POST', body: '{}' });
            toast('attendance: ' + (r.reason || 'updated'));
            await jobsPage();
        } catch (e) { toast(e.message); }
    };

    // ---- routing ----------------------------------------------------------
    const routeMap = {
        dashboard,
        timetable: timetablePage,
        attendance: attendancePage,
        sessions: sessionsPage,
        audit: auditPage,
        tests: testsPage,
        results: resultsPage,
        calendar: calendarPage,
        profile: profilePage,
        jobs: jobsPage
    };

    async function route() {
        let r = (location.hash || '#dashboard').replace('#', '');
        if (!routeMap[r]) r = 'dashboard';
        if (!(await gate())) return;
        try {
            await routeMap[r]();
            closeMobileMenu();
        } catch (e) {
            toast(e.message || 'Request failed');
        }
    }

    // ---- real-time sync ---------------------------------------------------
    function connectEvents() {
        if (!token) return;
        const es = new EventSource('/api/events?token=' + encodeURIComponent(token) + '&role=admin');
        es.onmessage = (ev) => {
            let msg = null;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            if (!msg) return;
            if (msg.type === 'update' && typeof msg.version === 'number' && msg.version !== lastVersion) {
                lastVersion = msg.version;
                const r = (location.hash || '#dashboard').replace('#', '');
                if (dirty) {
                    toast('Data changed by another session — re-open this page to reload');
                    return;
                }
                if (routeMap[r]) routeMap[r]().catch((e) => toast(e.message));
            }
        };
        es.onerror = () => { /* EventSource reconnects automatically (retry: 3000) */ };
    }

    // ---- listeners --------------------------------------------------------
    $('#mobileMenuBtn').addEventListener('click', openMobileMenu);
    $('#mobileOverlay').addEventListener('click', closeMobileMenu);
    $('#hamburger').addEventListener('click', () => {
        if (window.matchMedia('(max-width: 800px)').matches) closeMobileMenu();
    });
    $('#adminSidebarLogout').addEventListener('click', adminLogout);
    window.addEventListener('resize', () => {
        if (!window.matchMedia('(max-width: 800px)').matches) closeMobileMenu();
    });
    window.addEventListener('hashchange', route);

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (el.closest('.tt-row') || el.closest('.month-table') || el.closest('#mKey') || el.closest('#mPresent') || el.closest('#mTotal')) {
            dirty = true;
        }
    });

    route();
    connectEvents();

    // Re-verify the admin session periodically so a signed-out admin is bounced.
    setInterval(async () => {
        if (!token) return;
        try {
            const r = await fetch('/api/session/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            if (!r.ok) throw new Error('signed out');
            const d = await r.json();
            if (!d.ok || d.role !== 'admin') throw new Error('signed out');
        } catch (e) {
            localStorage.removeItem('ntsc_landing_login');
            location.href = '/';
        }
    }, 30000);
})();
