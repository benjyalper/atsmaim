'use strict';

const api = {
  me: () => fetch('/api/me').then(r => r.ok ? r.json() : null),
  signup: (body) => fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  login: (body) => fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  logout: () => fetch('/api/logout', { method: 'POST' }),
  list: () => fetch('/api/patients').then(r => r.json()),
  create: (body) => fetch('/api/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id, body) => fetch('/api/patients/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  remove: (id) => fetch('/api/patients/' + id, { method: 'DELETE' }).then(r => r.json()),
  delta: (id, delta) => {
    const body = delta === 1 ? { delta, lastSessionDate: todayIso() } : { delta };
    return fetch('/api/patients/' + id + '/sessions/delta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  }
};

let patients = [];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function todayIso() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function totalSessions(p) {
  return 10 + (p.extA ? p.extA.sessions : 0) + (p.extB ? p.extB.sessions : 0) + (p.extC ? p.extC.sessions : 0);
}

function pushSessionDate(p, date) {
  p.sessionDates = [...(p.sessionDates || []), date];
  p.lastSessionDate = date;
  p.sessionsDone += 1;
}

function popSessionDate(p) {
  const arr = p.sessionDates || [];
  const removed = arr.length ? arr[arr.length - 1] : null;
  p.sessionDates = arr.slice(0, -1);
  p.lastSessionDate = p.sessionDates.length ? p.sessionDates[p.sessionDates.length - 1] : null;
  p.sessionsDone = Math.max(0, p.sessionsDone - 1);
  return removed;
}

function unpopSessionDate(p, date) {
  if (date) p.sessionDates = [...(p.sessionDates || []), date];
  p.lastSessionDate = p.sessionDates.length ? p.sessionDates[p.sessionDates.length - 1] : null;
  p.sessionsDone += 1;
}

function counterColor(done, total) {
  const remaining = total - done;
  if (remaining <= 3) return 'red';
  if (remaining <= 6) return 'yellow';
  return 'green';
}

/* ===== Modal helpers ===== */
function showModal(html) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  root.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  return backdrop;
}

function pickExtension(currentSessions, hasValue) {
  return new Promise(resolve => {
    const removeBtn = hasValue ? '<button data-pick="remove" class="danger">הסר הארכה</button>' : '';
    const modal = showModal(`
      <h3>בחר מספר פגישות</h3>
      <div class="ext-pick-buttons">
        <button data-pick="15">15 פגישות</button>
        <button data-pick="30">30 פגישות</button>
        <button data-pick="35">35 פגישות</button>
      </div>
      <div class="modal-buttons">
        ${removeBtn}
        <button data-pick="cancel">ביטול</button>
      </div>
    `);
    modal.addEventListener('click', e => {
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
      const v = btn.dataset.pick;
      modal.remove();
      if (v === 'cancel') resolve({ action: 'cancel' });
      else if (v === 'remove') resolve({ action: 'remove' });
      else resolve({ action: 'set', sessions: Number(v) });
    });
  });
}

function promptText(title, initial) {
  return new Promise(resolve => {
    const modal = showModal(`
      <h3>${escapeHtml(title)}</h3>
      <input type="text" id="modal-input" value="${escapeHtml(initial || '')}" />
      <div class="modal-buttons">
        <button class="primary" data-act="ok">אישור</button>
        <button data-act="cancel">ביטול</button>
      </div>
    `);
    const input = modal.querySelector('#modal-input');
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const finish = (val) => { modal.remove(); resolve(val); };
    modal.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.act;
      if (!a) return;
      finish(a === 'cancel' ? null : input.value);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
      else if (e.key === 'Escape') finish(null);
    });
  });
}

function promptDate(title, initial) {
  return new Promise(resolve => {
    const modal = showModal(`
      <h3>${escapeHtml(title)}</h3>
      <label class="date-field">
        <input type="date" id="modal-date" lang="he-IL" value="${initial || ''}" />
        <span class="date-overlay" id="modal-date-display">${fmtDate(initial) || '—'}</span>
      </label>
      <div class="modal-buttons">
        <button class="primary" data-act="ok">אישור</button>
        <button data-act="cancel">ביטול</button>
      </div>
    `);
    const input = modal.querySelector('#modal-date');
    const display = modal.querySelector('#modal-date-display');
    input.addEventListener('input', () => {
      display.textContent = fmtDate(input.value) || '—';
    });
    setTimeout(() => input.focus(), 50);
    modal.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.act;
      if (!a) return;
      const val = input.value;
      modal.remove();
      resolve(a === 'cancel' ? null : val);
    });
  });
}

function showCounterModal(p) {
  return new Promise(resolve => {
    function bodyHtml() {
      const total = totalSessions(p);
      const cls = counterColor(p.sessionsDone, total);
      return `
        <h3>${escapeHtml(p.name)}</h3>
        <div class="counter-modal-body">
          <button type="button" class="cm-btn" data-act="dec">−</button>
          <span class="cm-count count ${cls}">${p.sessionsDone}/${total}</span>
          <button type="button" class="cm-btn" data-act="inc">+</button>
        </div>
        <div class="modal-buttons">
          <button data-act="rename">שינוי שם</button>
          <button class="primary" data-act="close">סגור</button>
        </div>
      `;
    }
    const modal = showModal(bodyHtml());
    const inner = modal.querySelector('.modal');
    function rerender() { inner.innerHTML = bodyHtml(); }
    inner.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'inc') {
        pushSessionDate(p, todayIso());
        rerender();
        render();
        try { await api.delta(p.id, 1); }
        catch { popSessionDate(p); rerender(); render(); }
      } else if (act === 'dec') {
        if (p.sessionsDone <= 0) return;
        const removed = popSessionDate(p);
        rerender();
        render();
        try { await api.delta(p.id, -1); }
        catch { unpopSessionDate(p, removed); rerender(); render(); }
      } else if (act === 'rename') {
        modal.remove();
        const newName = await promptText('שם המטופל', p.name);
        if (newName !== null && newName.trim()) {
          const oldName = p.name;
          p.name = newName.trim();
          render();
          try { await api.update(p.id, { name: p.name }); }
          catch { p.name = oldName; render(); }
        }
        resolve();
      } else if (act === 'close') {
        modal.remove();
        resolve();
      }
    });
  });
}

function showSessionDatesModal(p) {
  const dates = (p.sessionDates || []).slice().reverse(); // newest first
  if (!dates.length) return;
  const items = dates.map((d, i) => {
    const n = dates.length - i; // 1 = first ever
    return `<li><span class="sd-num">פגישה ${n}</span><span class="sd-date">${fmtDate(d)}</span></li>`;
  }).join('');
  const modal = showModal(`
    <h3>${escapeHtml(p.name)} — היסטוריית פגישות</h3>
    <ul class="session-dates-list">${items}</ul>
    <div class="modal-buttons">
      <button class="primary" data-act="close">סגור</button>
    </div>
  `);
  modal.addEventListener('click', e => {
    if (e.target.dataset && e.target.dataset.act === 'close') modal.remove();
  });
}

function confirm2(message) {
  return new Promise(resolve => {
    const modal = showModal(`
      <h3>${escapeHtml(message)}</h3>
      <div class="modal-buttons">
        <button class="danger" data-act="yes">מחק</button>
        <button data-act="no">ביטול</button>
      </div>
    `);
    modal.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.act;
      if (!a) return;
      modal.remove();
      resolve(a === 'yes');
    });
  });
}

/* ===== Render ===== */
function renderExtCell(p, slot) {
  const ext = p['ext' + slot];
  const prevFilled = slot === 'A' || (slot === 'B' && p.extA) || (slot === 'C' && p.extA && p.extB);
  if (!ext) {
    if (!prevFilled) {
      return `<td class="ext-cell empty disabled">—</td>`;
    }
    return `<td class="ext-cell empty" data-action="ext" data-slot="${slot}">+</td>`;
  }
  return `<td class="ext-cell" data-action="ext" data-slot="${slot}">
    <div class="ext-content">
      <div class="ext-date">${fmtDate(ext.date)}</div>
      <div class="ext-sessions">${ext.sessions} פגישות</div>
    </div>
  </td>`;
}

function renderRow(p) {
  const total = totalSessions(p);
  const done = p.sessionsDone;
  const colorCls = counterColor(done, total);
  return `<tr data-id="${p.id}">
    <td class="editable name-cell name-${colorCls}" data-action="name-click">${escapeHtml(p.name)}</td>
    <td class="${p.sessionDates && p.sessionDates.length ? 'editable last-date-cell' : ''}" ${p.sessionDates && p.sessionDates.length ? 'data-action="show-dates"' : ''}>${fmtDate(p.lastSessionDate) || '—'}</td>
    <td class="editable" data-action="edit-date">${fmtDate(p.startDate)}</td>
    ${renderExtCell(p, 'A')}
    ${renderExtCell(p, 'B')}
    ${renderExtCell(p, 'C')}
    <td class="total-cell">${total}</td>
    <td>
      <span class="counter">
        <button type="button" data-action="dec">−</button>
        <span class="count ${colorCls}">${done}/${total}</span>
        <button type="button" data-action="inc">+</button>
      </span>
    </td>
    <td><button type="button" class="delete-btn" data-action="delete" title="מחק">×</button></td>
  </tr>`;
}

function render() {
  const tbody = document.getElementById('patients-body');
  tbody.innerHTML = patients.map(renderRow).join('');
}

async function refresh() {
  patients = await api.list();
  render();
}

/* ===== App actions ===== */
async function handleExtClick(p, slot) {
  if (slot === 'B' && !p.extA) {
    alert('יש למלא קודם הארכה א\'');
    return;
  }
  if (slot === 'C' && (!p.extA || !p.extB)) {
    alert('יש למלא קודם הארכות א\' ו-ב\'');
    return;
  }
  const current = p['ext' + slot];
  const result = await pickExtension(current ? current.sessions : null, !!current);
  if (result.action === 'cancel') return;
  if (result.action === 'remove') {
    let extra = '';
    if (slot === 'A' && (p.extB || p.extC)) extra = ' פעולה זו תמחק גם את הארכות ב\' ו-ג\'.';
    if (slot === 'B' && p.extC) extra = ' פעולה זו תמחק גם את הארכה ג\'.';
    const ok = await confirm2('להסיר את ההארכה?' + extra);
    if (!ok) return;
    const patch = { ['ext' + slot]: null };
    if (slot === 'A') { patch.extB = null; patch.extC = null; }
    if (slot === 'B') { patch.extC = null; }
    await api.update(p.id, patch);
    await refresh();
    return;
  }
  if (result.action === 'set') {
    const date = current ? current.date : todayIso();
    await api.update(p.id, { ['ext' + slot]: { sessions: result.sessions, date } });
    await refresh();
  }
}

function setupApp() {
  document.getElementById('patients-body').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    const p = patients.find(x => x.id === id);
    if (!p) return;
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'inc') {
      const today = todayIso();
      pushSessionDate(p, today);
      render();
      try { await api.delta(id, 1); }
      catch { popSessionDate(p); render(); }
    } else if (action === 'dec') {
      if (p.sessionsDone <= 0) return;
      const removed = popSessionDate(p);
      render();
      try { await api.delta(id, -1); }
      catch { unpopSessionDate(p, removed); render(); }
    } else if (action === 'delete') {
      const ok = await confirm2('למחוק את ' + p.name + '?');
      if (ok) { await api.remove(id); await refresh(); }
    } else if (action === 'name-click') {
      await showCounterModal(p);
    } else if (action === 'show-dates') {
      showSessionDatesModal(p);
    } else if (action === 'edit-date') {
      const newDate = await promptDate('תאריך תחילת טיפול', p.startDate);
      if (newDate !== null && newDate) {
        await api.update(id, { startDate: newDate });
        await refresh();
      }
    } else if (action === 'ext') {
      const slot = target.dataset.slot;
      await handleExtClick(p, slot);
    }
  });

  const newDateInput = document.getElementById('new-date');
  const newDateDisplay = document.getElementById('new-date-display');
  function syncNewDateDisplay() {
    newDateDisplay.textContent = fmtDate(newDateInput.value) || '—';
  }
  newDateInput.addEventListener('input', syncNewDateDisplay);

  document.getElementById('add-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-name');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const startDate = newDateInput.value || todayIso();
    await api.create({ name, startDate });
    nameInput.value = '';
    newDateInput.value = todayIso();
    syncNewDateDisplay();
    await refresh();
    nameInput.focus();
  });

  document.getElementById('new-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-btn').click();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.logout();
    showAuth();
  });

  newDateInput.value = todayIso();
  syncNewDateDisplay();
}

/* ===== Auth UI ===== */
function setupAuth() {
  document.querySelectorAll('.auth-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.auth-tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('login-form').classList.toggle('active', tab === 'login');
      document.getElementById('signup-form').classList.toggle('active', tab === 'signup');
      document.getElementById('login-error').textContent = '';
      document.getElementById('signup-error').textContent = '';
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    const res = await api.login({
      username: fd.get('username'),
      password: fd.get('password')
    });
    if (res.ok) {
      const data = await res.json();
      showApp(data.username);
    } else {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'שגיאה בהתחברות';
    }
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById('signup-error');
    errEl.textContent = '';
    const res = await api.signup({
      username: fd.get('username'),
      password: fd.get('password'),
      code: fd.get('code') || undefined
    });
    if (res.ok) {
      const data = await res.json();
      showApp(data.username);
    } else {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'שגיאה בהרשמה';
    }
  });
}

function showAuth() {
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.querySelectorAll('.auth-form input').forEach(i => { if (i.type !== 'submit') i.value = ''; });
}

async function showApp(username) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('username-label').textContent = username;
  await refresh();
}

/* ===== Boot ===== */
(async function init() {
  setupAuth();
  setupApp();
  const me = await api.me();
  if (me && me.username) showApp(me.username);
  else showAuth();
})();
