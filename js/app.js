/* الهيكل العام: الدخول، القائمة، التوجيه، مركز العمليات، مهامي */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;
const tl = (a, e) => Q.L(a, e);
Q.views = {};
Q.ui = Q.pref.get('ui', {});
Q.saveUI = () => Q.pref.set('ui', Q.ui);

/* ---------- routing ---------- */
Q.parseHash = () => {
  const h = (location.hash || '#/').slice(1);
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = {}; (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return {parts, query, name: parts[0] || ''};
};
Q.go = h => { if (location.hash === h) Q.render(); else location.hash = h; };
Q.home = () => Q.can('dashboard') ? '#/dashboard' : '#/tasks';

const NAV = [
  {id: 'dashboard', icon: 'grid', t: ['مركز العمليات', 'Operations center'], perm: 'dashboard'},
  {id: 'tasks', icon: 'inbox', t: ['مهامي', 'My tasks'], badge: () => Q.tasks().map(taskKey)},
  {sep: ['دورة الحدث', 'Event lifecycle']},
  {id: 'incidents', icon: 'report', t: ['بلاغات السلامة', 'Safety reports'], badge: () => Q.visibleIncidents().filter(x => x.stage !== 'closed').map(x => x.id)},
  {id: 'rca', icon: 'search', t: ['التحقيق و RCA', 'Investigations & RCA'], perm: 'rca.view'},
  {id: 'capa', icon: 'check-square', t: ['الإجراءات التصحيحية', 'Corrective actions'], perm: 'capa.view', badge: () => Q.db.all('capa').filter(c => ['open', 'progress'].includes(c.status) && new Date(c.due) < Q.now() && Q.canSeeCAPA(c)).map(c => c.id), warn: true},
  {sep: ['الأداء والامتثال', 'Performance & compliance']},
  {id: 'indicators', icon: 'pulse', t: ['المؤشرات', 'Indicators'], perm: 'kpi.view'},
  {id: 'cbahi', icon: 'shield', t: ['جاهزية CBAHI', 'CBAHI readiness'], perm: 'cbahi.view'},
  {id: 'devices', icon: 'device', t: ['الأجهزة الطبية', 'Medical devices'], perm: 'device.view'},
  {id: 'reports', icon: 'chart', t: ['التقارير', 'Reports'], perm: 'reports.view'},
  {sep: ['النظام', 'System'], perm: 'admin'},
  {id: 'admin', icon: 'settings', t: ['الإعدادات والمستخدمون', 'Settings & users'], perm: 'admin'}
];

Q.visibleIncidents = () => Q.db.all('incidents').filter(x => Q.canSeeIncident(x));

/* side badges count items not yet seen; opening a section marks its current items as seen */
function navBadge(n, cur) {
  if (!n.badge) return 0;
  const keys = n.badge(), seen = Q.upref.get('navSeen', {});
  if (cur === n.id) { if (JSON.stringify(seen[n.id]) !== JSON.stringify(keys)) Q.upref.set('navSeen', Object.assign({}, seen, {[n.id]: keys})); return 0; }
  const old = seen[n.id] || [];
  return keys.filter(k => !old.includes(k)).length;
}
function renderSide() {
  const cur = Q.parseHash().name;
  const items = NAV.filter(n => !n.perm || Q.can(n.perm));
  const cleaned = items.filter((n, i) => !(n.sep && (!items[i + 1] || items[i + 1].sep)));
  $('#side').innerHTML = `
    <a class="brand" href="${Q.home()}">
      <svg class="logo" aria-hidden="true"><use href="#logo-mark"/></svg>
      <div><b>${L('سلامة', 'Salamah')}</b><small>Q-MedOps</small></div>
    </a>
    <nav class="nav" aria-label="${L('التنقل الرئيسي', 'Main navigation')}">
      ${cleaned.map(n => n.sep ? `<div class="nav-label">${T(n.sep)}</div>` : (() => { const b = navBadge(n, cur); return `<a href="#/${n.id}" class="${cur === n.id ? 'on' : ''}" aria-label="${T(n.t)}" ${cur === n.id ? 'aria-current="page"' : ''}>${ic(n.icon)}<span class="lbl">${T(n.t)}</span>${b ? `<span class="count ${n.warn ? 'warn' : ''}">${b}</span>` : ''}</a>`; })()).join('')}
    </nav>
    <div class="side-foot">
      ${!Q.db.persistent ? `<div class="integ warn-box">${ic('alert', 'sm')}<div><span>${L('التخزين غير متاح', 'Storage unavailable')}</span><small>${L('لن تُحفظ التغييرات بعد الإغلاق', 'Changes will not persist')}</small></div></div>` : ''}
      <button class="me" data-act="user-menu" aria-haspopup="true">${Q.avatar(Q.me.id)}<div><b>${esc(T(Q.me.name))}</b><small>${T(Q.ROLES[Q.me.role])}</small></div>${ic('dots', 'sm')}</button>
    </div>`;
}

/* bell badge: urgent tasks (due within a day) the user has not seen since last opening the bell */
const taskKey = t => `${t.kind}|${t.ref}|${t.what[1]}`;
function renderTop(title) {
  const seen = Q.upref.get('notifSeen', []);
  const n = Q.tasks().filter(t => t.due && (new Date(t.due) < Q.add(Q.now(), Q.DAY)) && !seen.includes(taskKey(t))).length;
  $('#top').innerHTML = `
    <div class="ttl"><small>${Q.fDay(Q.now())} · ${esc(T(Q.S().facility))}</small><h1 id="page-title">${title}</h1></div>
    <form class="gsearch" data-gsearch role="search"><span>${ic('search', 'sm')}</span><input type="search" name="q" placeholder="${L('ابحث برقم بلاغ أو إجراء أو جهاز', 'Search report, action or device ID')}" aria-label="${L('بحث', 'Search')}"></form>
    <div class="top-act">
      <button class="lang" data-act="lang" lang="${L('en', 'ar')}">${ic('globe', 'sm')}<span class="lbl">${L('English', 'العربية')}</span></button>
      <button class="ibtn" data-act="notifs" aria-label="${L('التنبيهات', 'Notifications')}" aria-haspopup="true">${ic('bell')}${n ? `<span class="badge">${n}</span>` : ''}</button>
      <a class="btn btn-p" href="#/report/new">${ic('plus')}<span class="lbl">${L('بلاغ سلامة', 'Safety report')}</span></a>
      <button class="me-top" data-act="user-menu" aria-label="${L('الحساب', 'Account')}">${Q.avatar(Q.me.id)}</button>
    </div>`;
}

Q.render = () => {
  document.documentElement.lang = Q.lang; document.documentElement.dir = Q.lang === 'ar' ? 'rtl' : 'ltr';
  $('.skip').textContent = L('تخطي إلى المحتوى', 'Skip to content');
  Q.closePop();
  if (!Q.me) { $('#app').hidden = true; $('#login').hidden = false; renderLogin(); document.title = L('سلامة | تسجيل الدخول', 'Salamah | Sign in'); return; }
  $('#app').hidden = false; $('#login').hidden = true;
  const r = Q.parseHash();
  if (!r.name) { location.replace(Q.home()); return; }
  const v = Q.views[r.name];
  let out;
  if (!v) out = {title: L('غير موجود', 'Not found'), html: Q.empty(L('الصفحة غير موجودة.', 'Page not found.'), 'search', `<a class="btn btn-s" href="${Q.home()}">${L('العودة', 'Back')}</a>`)};
  else if (v.perm && !Q.can(v.perm)) out = {title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('ليست لديك صلاحية لعرض هذه الصفحة. تواصل مع مدير الجودة إذا كنت تحتاجها.', 'You do not have access to this page.'), 'lock')};
  else { try { out = v.render(r.parts.slice(1), r.query); } catch (e) { console.error(e); out = {title: L('خطأ', 'Error'), html: Q.empty(L('حدث خطأ غير متوقع أثناء عرض الصفحة.', 'Something went wrong rendering this page.') + `<br><code>${esc(e.message)}</code>`, 'alert')}; } }
  renderSide(); renderTop(out.title);
  const root = $('#views');
  const path = r.parts.join('/'), fresh = Q._lastPath !== path; Q._lastPath = path;
  root.innerHTML = `<section class="view ${out.cls || ''}${fresh ? ' enter' : ''}">${out.html}</section>`;
  document.title = `${L('سلامة', 'Salamah')} | ${out.title.replace(/<[^>]+>/g, '')}`;
  out.mount && out.mount(root);
};

/* ---------- login ---------- */
function renderLogin() {
  const users = Q.db.all('users').filter(u => u.active !== false);
  const order = ['director', 'qps', 'supervisor', 'biomed', 'reporter', 'admin'];
  const featured = order.map(r => users.find(u => u.role === r)).filter(Boolean);
  const flow = [
    ['report', ['بلاغ السلامة', 'Safety report'], ['يُسجّل الحدث فور وقوعه', 'Logged as soon as it happens']],
    ['alert', ['تقييم الخطورة', 'Severity assessment'], ['مصفوفة SAL تحدد المسار', 'The SAL matrix sets the path']],
    ['search', ['تحليل السبب الجذري', 'Root cause analysis'], ['فريق RCA وأدوات التحليل', 'RCA team and analysis tools']],
    ['check-square', ['الإجراءات التصحيحية', 'Corrective actions'], ['مهام CAPA بمسؤول وموعد', 'CAPA tasks with owners and dates']],
    ['users', ['مراجعة اللجنة', 'Committee review'], ['لجنة الجودة تتابع وتوصي', 'The quality committee follows up']],
    ['pulse', ['متابعة المؤشرات', 'Indicator tracking'], ['قياس أثر التحسين شهريًا', 'Monthly measure of improvement']]
  ];
  $('#login').innerHTML = `
  <div class="login">
    <aside class="login-brand">
      <div class="brand big"><span class="logo-tile"><svg aria-hidden="true"><use href="#logo-mark"/></svg></span><div><b>${L('سلامة', 'Salamah')}</b><small>Q-MedOps</small></div></div>
      <div class="lb-copy">
        <h2>${L('من البلاغ إلى التحسين، في مسار واحد.', 'From report to improvement, in one flow.')}</h2>
        <p>${L('منصة الجودة وسلامة المرضى: بلاغات، تحقيق، إجراءات تصحيحية، ومؤشرات أداء في مكان واحد.', 'Quality and patient safety platform: reports, investigations, corrective actions and indicators in one place.')}</p>
      </div>
      <ol class="lb-flow">${flow.map(([icon, t, s], i) => `<li style="--i:${i}"><span class="i">${ic(icon, 'sm')}</span><div>${T(t)}<small>${T(s)}</small></div></li>`).join('')}</ol>
    </aside>
    <div class="login-main">
      <div class="login-bar"><button class="lang" data-act="lang">${ic('globe', 'sm')}${L('English', 'العربية')}</button></div>
    <section class="login-card">
      <h1>${L('تسجيل الدخول', 'Sign in')}</h1>
      <p class="muted">${esc(T(Q.S().facility))} · ${L('منصة الجودة وسلامة المرضى', 'Quality & patient safety platform')}</p>
      <form data-login class="fgrid one">
        ${Q.f.text('email', L('البريد الإلكتروني', 'Email'), '', {req: true, type: 'email', ltr: true, attrs: 'autocomplete="username"', ph: 'name@alsalam-hospital.sa'})}
        ${Q.f.text('password', L('كلمة المرور', 'Password'), '', {req: true, type: 'password', attrs: 'autocomplete="current-password"'})}
        <span class="err" data-err></span>
        <button class="btn btn-p block" type="submit">${L('دخول', 'Sign in')}</button>
      </form>
    </section>
    <section class="demo">
      <h2>${L('حسابات التجربة', 'Pilot accounts')}</h2>
      <p class="muted">${L('بيئة تجريبية تُحفظ بياناتها في هذا المتصفح. اختر حسابًا لتجربة صلاحياته، وكلمة المرور لكل الحسابات: ', 'Pilot environment stored in this browser. Pick an account to try its permissions. Password for all: ')}<b class="ltr">demo</b></p>
      <div class="demo-list">${featured.map(u => `<button class="demo-u" data-act="demo-login" data-id="${u.id}">${Q.avatar(u.id)}<div><b>${esc(T(u.name))}</b><small>${T(Q.ROLES[u.role])} · ${Q.dshort(u.deptId)}</small></div>${ic('chev', 'sm flip')}</button>`).join('')}</div>
      <details><summary>${L('كل الحسابات', 'All accounts')} (${users.length})</summary><div class="demo-list">${users.filter(u => !featured.includes(u)).map(u => `<button class="demo-u" data-act="demo-login" data-id="${u.id}">${Q.avatar(u.id, 's')}<div><b>${esc(T(u.name))}</b><small>${T(Q.ROLES[u.role])} · ${Q.dshort(u.deptId)}</small></div></button>`).join('')}</div></details>
    </section>
    </div>
  </div>`;
  $('[data-login]').addEventListener('submit', e => {
    e.preventDefault(); const d = Q.formData(e.target);
    const u = users.find(x => x.email.toLowerCase() === String(d.email).trim().toLowerCase());
    if (!u || d.password !== 'demo') { $('[data-err]').textContent = L('البريد أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'); return; }
    Q.login(u.id); location.hash = Q.home(); Q.render();
  });
}
Q.act('demo-login', el => { Q.login(el.dataset.id); location.hash = Q.home(); Q.render(); Q.toast(L(`مرحبًا ${T(Q.me.name)}`, `Welcome, ${T(Q.me.name)}`)); });

/* ---------- popovers ---------- */
Q.openPop = (anchor, html) => {
  const p = $('#pop'); p.innerHTML = html; p.hidden = false;
  const r = anchor.getBoundingClientRect(), w = p.offsetWidth;
  let left = Q.lang === 'ar' ? r.left : r.right - w; left = Math.max(12, Math.min(left, innerWidth - w - 12));
  let top = r.bottom + 8; if (top + p.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 8);
  p.style.left = left + 'px'; p.style.top = top + 'px'; p._anchor = anchor;
};
Q.closePop = () => { const p = $('#pop'); if (p) p.hidden = true; };

Q.act('notifs', el => {
  if (!$('#pop').hidden && $('#pop')._anchor === el) return Q.closePop();
  const all = Q.tasks(), ts = all.slice(0, 7);
  Q.upref.set('notifSeen', all.map(taskKey)); // opening the bell marks everything current as seen
  const b = $('.badge', el); if (b) b.remove();
  Q.openPop(el, `<h4>${L('ما يحتاج انتباهك', 'Needs your attention')}<a class="btn-g" href="#/tasks" style="font-size:12px">${L('كل المهام', 'All tasks')}</a></h4>
    <ul>${ts.length ? ts.map(t => { const r = t.due ? Q.rel(t.due) : null; return `<li><a href="${t.link}"><span class="pi ${r && r.late ? 'crit' : t.kind === 'incident' ? 'med' : 'info'}">${ic(TASK_ICON[t.kind], 'sm')}</span><div><b>${T(t.what)} · <span class="ltr">${esc(t.ref)}</span></b><small>${esc(t.sub || '')}${r ? ` · <span class="due ${r.cls}">${r.txt}</span>` : ''}</small></div></a></li>`; }).join('') : `<li class="muted" style="padding:16px">${L('لا توجد مهام معلقة.', 'Nothing pending.')}</li>`}</ul>`);
});
Q.act('user-menu', el => {
  Q.openPop(el, `<div class="menu"><div class="menu-h">${Q.avatar(Q.me.id)}<div><b>${esc(T(Q.me.name))}</b><small class="ltr">${esc(Q.me.email)}</small></div></div>
    <a href="#/tasks">${ic('inbox', 'sm')}${L('مهامي', 'My tasks')}</a>
    <a href="#/incidents?mine=1">${ic('report', 'sm')}${L('بلاغاتي', 'My reports')}</a>
    <button data-act="switch-user">${ic('users', 'sm')}${L('تبديل الحساب (تجربة)', 'Switch account (pilot)')}</button>
    <button data-act="logout">${ic('logout', 'sm')}${L('تسجيل الخروج', 'Sign out')}</button></div>`);
});
Q.act('logout', () => { Q.logout(); Q.render(); });
Q.act('switch-user', () => {
  Q.modal({title: L('تبديل الحساب', 'Switch account'), sub: L('للتجربة فقط: جرّب سير العمل بصلاحيات مختلفة', 'Pilot only: try the workflow with different roles'),
    body: `<div class="fgrid one">${Q.f.sel('u', L('الحساب', 'Account'), Q.userOpts(), Q.me.id)}</div>`, submit: L('تبديل', 'Switch'),
    onSubmit: d => { Q.login(d.u); location.hash = Q.home(); Q.render(); Q.toast(L(`تم الدخول باسم ${T(Q.me.name)}`, `Signed in as ${T(Q.me.name)}`)); }});
});
Q.act('lang', () => { Q.lang = Q.lang === 'ar' ? 'en' : 'ar'; Q.pref.set('lang', Q.lang); Q.render(); });
const TASK_ICON = {incident: 'report', capa: 'check-square', device: 'wrench', kpi: 'pulse', cbahi: 'shield'};
Q.TASK_ICON = TASK_ICON;

/* ---------- charts shared ---------- */
Q.monthBands = (list, months) => months.map(ym => { const r = [0, 0, 0]; list.forEach(x => { if (Q.ym(x.occurredAt) !== ym) return; const b = Q.band(x); r[b === 'crit' ? 2 : b === 'med' ? 1 : 0]++; }); return r; });
Q.barChart = (data, labels, {colors = ['#8cc5b3', '#e5b545', '#d4574a'], names = [L('منخفض', 'Low'), L('متوسط', 'Moderate'), L('عالٍ', 'High')], id = 'c' + Math.random().toString(36).slice(2, 6)} = {}) => {
  const W = 640, H = 210, padB = 24, padT = 14;
  const max = Math.max(5, ...data.map(d => d.reduce((a, b) => a + b, 0)));
  const nice = Math.ceil(max / 5) * 5;
  const step = W / data.length, bw = Math.min(46, step * .56);
  const y = v => H - padB - (v / nice) * (H - padB - padT);
  const rtl = Q.lang === 'ar';
  const cols = data.map((d, i) => {
    const idx = rtl ? data.length - 1 - i : i, cx = step * idx + step / 2, x0 = cx - bw / 2; let acc = 0;
    const top = d.map((v, j) => v ? j : -1).filter(j => j >= 0).pop();
    const rects = d.map((v, j) => { if (!v) return ''; const y1 = y(acc + v), y0 = y(acc); acc += v; return `<rect fill="${colors[j]}" x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1 - (j === top ? 0 : 1.5)).toFixed(1)}" ${j === top ? 'rx="3"' : ''}/>`; }).join('');
    const tot = d.reduce((a, b) => a + b, 0);
    return `<g class="col" tabindex="0" data-tip="${esc(labels[i])}|${d.join('|')}"><rect class="hit" x="${cx - step / 2}" y="0" width="${step}" height="${H - padB}"/>${rects}${tot ? `<text class="ax v" x="${cx}" y="${y(tot) - 5}" text-anchor="middle">${tot}</text>` : ''}<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text></g>`;
  }).join('');
  const grid = [0, .5, 1].map(f => `<line class="gl" x1="0" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}"/>`).join('');
  return `<div class="chart-wrap chart" data-chart data-names="${esc(names.join('|'))}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('رسم أعمدة', 'Bar chart')}">${grid}${cols}</svg><div class="tip"></div></div>`;
};
Q.bindCharts = root => $$('[data-chart]', root).forEach(wrap => {
  const tip = $('.tip', wrap), names = wrap.dataset.names.split('|');
  const show = g => { const [lab, ...v] = g.dataset.tip.split('|'), r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(lab)} · ${v.reduce((a, b) => a + +b, 0)}</b>${v.map((n, i) => `${names[i]} ${n}`).join(' · ')}`;
    tip.style.left = (r.left + r.width / 2 - w.left) + 'px'; tip.style.top = Math.max(0, r.top - w.top + 22) + 'px'; tip.classList.add('on'); };
  $$('.col', wrap).forEach(g => { g.addEventListener('mouseenter', () => show(g)); g.addEventListener('focus', () => show(g)); g.addEventListener('mouseleave', () => tip.classList.remove('on')); g.addEventListener('blur', () => tip.classList.remove('on')); });
});
Q.donut = (r, label = L('مستوفى', 'met')) => {
  const total = r.ok + r.med + r.crit || 1, C = 2 * Math.PI * 46; let off = 0;
  const seg = (v, col) => { const len = v / total * C; const s = v ? `<circle cx="59" cy="59" r="46" fill="none" stroke="${col}" stroke-width="13" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}"/>` : ''; off += len; return s; };
  return `<div class="donut"><svg viewBox="0 0 118 118" aria-hidden="true"><circle cx="59" cy="59" r="46" fill="none" stroke="var(--line-2)" stroke-width="13"/>${seg(r.ok, 'var(--brand)')}${seg(r.med, 'var(--amber-bar)')}${seg(r.crit, 'var(--red)')}</svg><div class="v"><b>${r.pct}%</b><small>${label}</small></div></div>`;
};

/* ---------- sentinel pathway ---------- */
Q.sentinelMilestones = x => {
  const S = Q.S(), r = x.rcaId && Q.db.get('rca', x.rcaId);
  return [
    {t: ['إشعار المشرف والرئيس التنفيذي', 'Supervisor & CEO informed'], due: x.reportedAt, done: x.supervisor && x.supervisor.ceoInformed ? x.supervisor.at : null},
    {t: ['إبلاغ إدارة الجودة وتحديد SAL', 'QPS notified & SAL set'], due: Q.add(x.reportedAt, 24 * Q.HOUR), done: x.review ? x.review.at : null},
    {t: ['الإخطار الخارجي CBAHI · MOH · SPSC', 'External notice: CBAHI · MOH · SPSC'], due: Q.add(x.occurredAt, S.externalHours * Q.HOUR), done: x.external ? x.external.at : null, key: 'external'},
    {t: ['اجتماع فريق RCA', 'RCA team meeting'], due: Q.add(x.review ? x.review.at : x.reportedAt, S.rcaMeetingDays * Q.DAY), done: r && r.meetingAt},
    {t: ['رفع تقرير RCA وخطة CAPA', 'Submit RCA & CAPA plan'], due: Q.add(x.reportedAt, S.rcaReportDays * Q.DAY), done: r && r.status === 'approved' ? r.approvedAt : null}
  ];
};
Q.milestones = ms => { let cur = false; return `<ol class="ms">${ms.map(m => { const now = !m.done && !cur; if (now) cur = true; const r = Q.rel(m.due);
  return `<li class="${m.done ? 'done' : now ? 'now' : ''}"><span class="n">${m.done ? ic('check') : ''}</span><div><b>${T(m.t)}</b><small>${m.done ? L('تم', 'Done') + ' · ' + Q.fDate(m.done) : L('المهلة', 'Due') + ' ' + Q.fDate(m.due)}</small></div><span class="when">${m.done ? '' : `<span class="${r.late ? 'c-crit' : ''}">${r.txt}</span>`}</span></li>`; }).join('')}</ol>`; };

Q.act('external', el => {
  const x = Q.db.get('incidents', el.dataset.id);
  Q.modal({title: L('تسجيل الإخطار الخارجي', 'Log external notification'), sub: `<span class="ltr">${x.id}</span> · ${esc(T(x.title))}`,
    body: `<div class="fgrid">
      ${Q.f.text('at', L('وقت الإرسال', 'Sent at'), Q.toInput(Q.now()), {type: 'datetime-local', req: true})}
      ${Q.f.text('ref', L('رقم مرجع البلاغ لدى الجهة', 'Reference number'), '', {req: true, ltr: true, ph: 'SPSC-2026-...'})}
      ${Q.f.multi('to', L('الجهات المُخطرة', 'Notified bodies'), [['CBAHI', 'CBAHI'], ['MOH', L('وزارة الصحة', 'MOH')], ['SPSC', L('المركز السعودي لسلامة المرضى', 'SPSC')]], ['CBAHI', 'MOH', 'SPSC'])}
      ${Q.f.area('note', L('ملاحظة', 'Note'), '', {rows: 2})}</div>
      <div class="note">${ic('info', 'sm')}<span>${L('يُسجّل الإخطار في ملف الحدث وسجل التدقيق. الإرسال الفعلي يتم عبر بوابات الجهات حتى تفعيل الربط الإلكتروني.', 'Logged to the event file and audit trail. Actual submission happens on the authorities’ portals until integration is enabled.')}</span></div>`,
    submit: L('تسجيل الإخطار', 'Log notice'),
    onSubmit: d => { if (!d.to.length) throw new Error(L('اختر جهة واحدة على الأقل.', 'Select at least one body.'));
      x.external = {at: Q.fromInput(d.at), ref: d.ref, to: d.to, note: d.note, by: Q.me.id}; Q.db.put('incidents', x); Q.audit('incident', x.id, 'external', d.to.join(', ') + ' · ' + d.ref); Q.render(); Q.toast(L('سُجّل الإخطار الخارجي', 'External notice logged')); }});
});

/* ---------- dashboard ---------- */
Q.views.dashboard = {perm: 'dashboard', render() {
  const vis = Q.visibleIncidents(), open = vis.filter(x => x.stage !== 'closed');
  const scope = Q.can('incident.all') ? '' : L(` · ${Q.dshort(Q.me.deptId)}`, ` · ${Q.dshort(Q.me.deptId)}`);
  const sentinels = open.filter(x => Q.isSentinel(x)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const pending = sentinels.find(x => !x.external);
  const capas = Q.db.all('capa').filter(c => Q.can('incident.all') || c.deptId === Q.me.deptId || c.ownerId === Q.me.id);
  const late = capas.filter(c => ['open', 'progress'].includes(c.status) && new Date(c.due) < Q.now());
  const oldest = late.length ? Math.max(...late.map(c => Math.ceil((Q.now() - new Date(c.due)) / Q.DAY))) : 0;
  const ready = Q.readiness();
  const closedIn = (from, to) => vis.filter(x => x.closure && new Date(x.closure.at) >= from && new Date(x.closure.at) < to).map(x => (new Date(x.closure.at) - new Date(x.reportedAt)) / Q.DAY).sort((a, b) => a - b);
  const med = a => a.length ? Math.round(a[Math.floor(a.length / 2)]) : null;
  const m1 = med(closedIn(Q.add(Q.now(), -90 * Q.DAY), Q.now())), m0 = med(closedIn(Q.add(Q.now(), -180 * Q.DAY), Q.add(Q.now(), -90 * Q.DAY)));
  const attention = open.map(x => ({x, n: Q.nextStep(x)})).filter(o => o.n).sort((a, b) => (Q.isSentinel(b.x) - Q.isSentinel(a.x)) || (new Date(a.n.due) - new Date(b.n.due))).slice(0, 6);
  const range = Q.ui.range || 6, curYm = Q.ym(Q.now());
  const months = Array.from({length: range}, (_, i) => Q.ymAdd(curYm, i - range + 1));
  const bands = Q.monthBands(vis, months);
  const tl_ = bands[bands.length - 1].reduce((a, b) => a + b, 0), tp = bands[bands.length - 2].reduce((a, b) => a + b, 0), ch = tp ? Math.round((tl_ - tp) / tp * 100) : 0;
  const lowShare = tl_ ? Math.round(bands[bands.length - 1][0] / tl_ * 100) : 0;
  const kpis = Q.db.all('kpis').filter(k => k.active !== false && Q.canSeeKPI(k)).map(k => { const vals = Array.from({length: 9}, (_, i) => Q.kVal(k, Q.db.get('kpiValues', `${k.id}:${Q.ymAdd(curYm, i - 8)}`))); const last = [...vals].reverse().find(v => v != null); return {k, vals, last, st: Q.kState(k, last)}; });
  const rank = {crit: 0, med: 1, ok: 2, mute: 3};
  const kpick = kpis.sort((a, b) => rank[a.st] - rank[b.st]).slice(0, 4);
  const sx = sentinels[0];
  return {title: L('مركز العمليات', 'Operations center'), mount: r => Q.bindCharts(r), html: `
  ${pending ? `<div class="banner"><div class="ico">${ic('alert')}</div>
    <div><b>${L('حدث جسيم', 'Sentinel event')} · ${Q.dname(pending.deptId)}</b><p><a class="oid" href="#/incidents/${pending.id}">${pending.id}</a> · ${esc(T(pending.title))} · ${L('لم يُسجَّل الإخطار الخارجي بعد', 'external notice not yet logged')}</p></div>
    <div class="act"><span class="clock">${ic('clock', 'sm')}${Q.rel(Q.add(pending.occurredAt, Q.S().externalHours * Q.HOUR)).txt}</span>${Q.can('incident.review') ? `<button class="btn btn-d sm" data-act="external" data-id="${pending.id}">${ic('send')}${L('تسجيل الإخطار', 'Log notice')}</button>` : ''}<a class="btn btn-s sm" href="#/incidents/${pending.id}">${L('التفاصيل', 'Details')}</a></div></div>` : ''}
  <div class="stats">
    ${Q.stat(L('بلاغات مفتوحة', 'Open reports') + scope, open.length, `<b class="good">${open.filter(x => x.stage === 'review').length}</b> ${L('بانتظار مراجعة الجودة', 'awaiting QPS review')} · <b>${open.filter(x => x.stage === 'new').length}</b> ${L('بانتظار المشرف', 'with supervisor')}`, {icon: 'report', go: '#/incidents'})}
    ${Q.stat(L('إجراءات تصحيحية متأخرة', 'Overdue CAPA'), late.length, late.length ? L(`أقدمها متأخر ${Q.nDays(oldest)}`, `oldest ${oldest} days late`) : L('لا يوجد تأخير', 'None overdue'), {icon: 'clock', go: '#/capa?tab=late', cls: late.length ? 'up-bad' : ''})}
    ${Q.stat(L('جاهزية CBAHI', 'CBAHI readiness'), `${ready.pct}<small>%</small>`, Q.track([[ready.ok / ready.total * 100, 'var(--brand)'], [ready.med / ready.total * 100, 'var(--amber-bar)'], [ready.crit / ready.total * 100, 'var(--red)']]), {icon: 'shield', go: '#/cbahi'})}
    ${Q.stat(L('وسيط مدة الإغلاق (90 يومًا)', 'Median time to close (90 d)'), m1 != null ? `${m1}<small>${L('يومًا', 'days')}</small>` : '—', m1 != null && m0 != null ? `<b class="${m1 <= m0 ? 'down-good' : 'up-bad'}">${m1 <= m0 ? '↓' : '↑'} ${Math.abs(m0 - m1)}</b> ${L('مقارنة بالفترة السابقة', 'vs previous period')}` : '', {icon: 'calendar'})}
  </div>
  <div class="dash">
    <section class="card flush">
      <div class="card-h"><div><h3>${L('بلاغات تحتاج متابعة', 'Reports needing follow-up')}</h3><p>${L('مرتبة حسب الخطورة ثم أقرب مهلة', 'By severity, then nearest deadline')}</p></div><a class="btn-g" href="#/incidents">${L('كل البلاغات', 'All reports')}</a></div>
      ${attention.length ? `<div class="tbl-wrap"><table><thead><tr><th>${L('البلاغ', 'Report')}</th><th>SAL</th><th class="hide-m">${L('الخطوة التالية', 'Next step')}</th><th>${L('المهلة', 'Due')}</th></tr></thead><tbody>
      ${attention.map(({x, n}) => { const r = Q.rel(n.due); return `<tr class="click" data-href="#/incidents/${x.id}"><td><span class="t1">${esc(T(x.title))}</span><span class="t2"><span class="oid">${x.id}</span> · ${Q.dshort(x.deptId)}</span></td><td>${Q.salChip(x)}</td><td class="hide-m step-c">${T(n.what)}</td><td class="nowrap"><span class="due ${r.cls}">${r.txt}</span></td></tr>`; }).join('')}</tbody></table></div>` : Q.empty(L('لا توجد بلاغات مفتوحة.', 'No open reports.'), 'check')}
    </section>
    <section class="card">
      <div class="card-h"><div><h3>${L('مسار الحدث الجسيم', 'Sentinel event pathway')}</h3><p>${sx ? `<a class="oid" href="#/incidents/${sx.id}">${sx.id}</a> · ${L('وفق مهل CBAHI QM.13', 'CBAHI QM.13 timelines')}` : L('لا توجد أحداث جسيمة مفتوحة', 'No open sentinel events')}</p></div></div>
      <div class="card-b">${sx ? Q.milestones(Q.sentinelMilestones(sx)) : Q.empty(L('لا يوجد حدث جسيم مفتوح حاليًا.', 'No open sentinel event.'), 'shield')}</div>
      ${sx && sx.rcaId && Q.canSeeRCA(Q.db.get('rca', sx.rcaId)) ? `<div class="card-f">${ic('users', 'sm')}${L('قائد التحقيق', 'Lead')}: ${Q.uname((Q.db.get('rca', sx.rcaId) || {}).leadId)}<a class="btn-g" style="margin-inline-start:auto" href="#/rca/${sx.rcaId}">${L('فتح التحقيق', 'Open')}</a></div>` : ''}
    </section>
    <section class="card">
      <div class="card-h"><div><h3>${L('بلاغات السلامة حسب الشدة', 'Safety reports by severity')}</h3><p>${L('حسب شهر وقوع الحدث', 'By month of occurrence')}</p></div>${Q.seg([[6, L('6 أشهر', '6 mo')], [12, L('12 شهرًا', '12 mo')]], range, 'range')}</div>
      <div class="card-b">${Q.barChart(bands, months.map(m => Q.MON[Q.lang][+m.slice(5) - 1]))}
        <div class="legend" style="margin-top:10px"><span><i style="background:#8cc5b3"></i>${L('منخفض (SAL ≤ 5)', 'Low (SAL ≤ 5)')}</span><span><i style="background:#e5b545"></i>${L('متوسط (6-14)', 'Moderate (6-14)')}</span><span><i style="background:#d4574a"></i>${L(`عالٍ أو جسيم (≥ ${Q.S().rcaThreshold})`, `High / sentinel (≥ ${Q.S().rcaThreshold})`)}</span>
        <span style="margin-inline-start:auto;color:var(--ink-2)">${L(`${tl_} هذا الشهر`, `${tl_} this month`)} · <b class="${ch > 0 ? 'up-bad' : 'down-good'}">${ch > 0 ? '↑' : '↓'} ${Math.abs(ch)}%</b></span></div>
        ${tl_ ? `<p class="hint" style="margin-top:6px">${L(`${lowShare}% من بلاغات هذا الشهر منخفضة الخطورة. ارتفاع الإبلاغ عن الأحداث البسيطة مؤشر صحي على ثقافة الإبلاغ.`, `${lowShare}% of this month’s reports are low severity: a healthy sign of reporting culture.`)}</p>` : ''}</div>
    </section>
    <section class="card">
      <div class="card-h"><div><h3>${L('جاهزية الاعتماد', 'Accreditation readiness')}</h3><p>${L(`${ready.total} عنصر قياس في ${Q.db.all('standards').length} معايير`, `${ready.total} elements across ${Q.db.all('standards').length} standards`)}</p></div></div>
      <div class="card-b"><div class="readiness">${Q.donut(ready)}
        <div class="lgd"><div><i style="background:var(--brand)"></i><span>${L('معتمد', 'Approved')}</span><b class="num">${ready.ok}</b></div><div><i style="background:var(--amber-bar)"></i><span>${L('بانتظار المراجعة', 'Under review')}</span><b class="num">${ready.med}</b></div><div><i style="background:var(--red)"></i><span>${L('دليل ناقص', 'Missing')}</span><b class="num">${ready.crit}</b></div></div></div>
        <ul class="gap-list">${Q.db.all('standards').filter(s => Q.stdState(s) === 'crit').slice(0, 4).map(s => `<li><b>${s.id}</b><a href="#/cbahi/${encodeURIComponent(s.id)}">${esc(T(s.name))}</a></li>`).join('') || `<li>${L('لا توجد فجوات حرجة', 'No critical gaps')}</li>`}</ul></div>
      <div class="card-f"><a class="btn-g" href="#/cbahi">${L('فتح ملف الأدلة', 'Open evidence file')}</a></div>
    </section>
    ${Q.can('kpi.view') ? `<section class="card span">
      <div class="card-h"><div><h3>${L('مؤشرات تحتاج انتباهًا', 'Indicators needing attention')}</h3><p>${L('آخر قيمة مسجلة · الخط المتقطع هو الهدف', 'Latest value · dashed line is target')}</p></div><a class="btn-g" href="#/indicators">${L('كل المؤشرات', 'All indicators')}</a></div>
      <div class="nicu">${kpick.map(({k, vals, last, st}) => `<a href="#/indicators/${k.id}"><div class="nm"><span>${esc(T(k.name))}</span><span class="chip ${st}">${T(Q.K_ST[st])}</span></div>
        <div class="kpi-val c-${st}">${Q.kFmt(k, last)}</div><div class="tg">${Q.dshort(k.deptId)} · ${L('الهدف', 'Target')} <span class="ltr">${Q.kTarget(k)}</span></div>${Q.spark(vals, k)}</a>`).join('')}</div>
    </section>` : ''}
  </div>`};
}};
Q.act('range', el => { Q.ui.range = +el.dataset.v; Q.saveUI(); Q.render(); });

/* ---------- my tasks ---------- */
Q.views.tasks = {render() {
  const ts = Q.tasks(), now = Q.now();
  const groups = [
    [L('متأخرة', 'Overdue'), ts.filter(t => t.due && new Date(t.due) < now)],
    [L('خلال 7 أيام', 'Next 7 days'), ts.filter(t => t.due && new Date(t.due) >= now && new Date(t.due) < Q.add(now, 7 * Q.DAY))],
    [L('لاحقًا أو دون موعد', 'Later or undated'), ts.filter(t => !t.due || new Date(t.due) >= Q.add(now, 7 * Q.DAY))]
  ];
  const mine = Q.db.all('incidents').filter(x => x.reporterId === Q.me.id).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)).slice(0, 8);
  const drafts = Q.pref.get('draft:' + Q.me.id, null);
  return {title: L('مهامي', 'My tasks'), html: `
  <div class="page-head"><div><h2>${L(`مرحبًا، ${esc(T(Q.me.name).split(' ').slice(0, 2).join(' '))}`, `Hello, ${esc(T(Q.me.name).split(' ').slice(0, 2).join(' '))}`)}</h2><p>${ts.length ? L(`لديك ${ts.length} مهام تحتاج إجراءً`, `You have ${ts.length} items to act on`) : L('لا توجد مهام معلقة عليك الآن.', 'Nothing is waiting on you right now.')}</p></div>
    <a class="btn btn-p" href="#/report/new">${ic('plus')}${L('بلاغ سلامة جديد', 'New safety report')}</a></div>
  ${drafts ? `<div class="banner ok"><div class="ico">${ic('file')}</div><div><b>${L('لديك مسودة بلاغ غير مرسلة', 'You have an unsent draft report')}</b><p>${L('حُفظت', 'Saved')} ${Q.ago(drafts.savedAt)}</p></div><div class="act"><a class="btn btn-s sm" href="#/report/new">${L('متابعة المسودة', 'Continue draft')}</a></div></div>` : ''}
  <div class="dash">
    <section class="card">
      ${ts.length ? groups.filter(g => g[1].length).map(([h, list]) => `<div class="task-group"><h4>${h} <em>${list.length}</em></h4><ul class="tasks">${list.map(t => { const r = t.due ? Q.rel(t.due) : null; return `<li><a href="${t.link}"><span class="ti ${r && r.late ? 'crit' : ''}">${ic(TASK_ICON[t.kind], 'sm')}</span><div><b>${T(t.what)}</b><small><span class="ltr">${esc(t.ref)}</span> · ${esc(t.sub || '')}</small></div><span class="due ${r ? r.cls : ''}">${r ? r.txt : ''}</span>${ic('chev', 'sm flip')}</a></li>`; }).join('')}</ul></div>`).join('') : Q.empty(L('أحسنت، لا توجد مهام معلقة.', 'All clear: no pending tasks.'), 'check')}
    </section>
    <section class="card flush">
      <div class="card-h"><div><h3>${L('بلاغاتي', 'My reports')}</h3><p>${L('ما أبلغت عنه ومرحلته الحالية', 'What you reported and where it stands')}</p></div><a class="btn-g" href="#/incidents?mine=1">${L('الكل', 'All')}</a></div>
      ${mine.length ? `<div class="tbl-wrap"><table><tbody>${mine.map(x => `<tr class="click" data-href="#/incidents/${x.id}"><td><span class="t1">${esc(T(x.title))}</span><span class="t2"><span class="oid">${x.id}</span> · ${Q.fDate(x.reportedAt, false)}</span></td><td><span class="chip ${x.stage === 'closed' ? 'ok' : 'info'}">${T(Q.STAGES[x.stage])}</span></td></tr>`).join('')}</tbody></table></div>` : Q.empty(L('لم ترسل أي بلاغ بعد. الإبلاغ عن الأحداث البسيطة والوشيكة يساعد في منع الأخطر.', 'No reports yet. Reporting near misses helps prevent serious harm.'), 'report')}
    </section>
  </div>`};
}};

/* ---------- global events ---------- */
document.addEventListener('click', e => {
  const pop = $('#pop');
  if (!pop.hidden && !e.target.closest('#pop') && !e.target.closest('[data-act="notifs"],[data-act="user-menu"]')) Q.closePop();
  if (e.target.closest('#pop a')) Q.closePop();
  const a = e.target.closest('[data-act]');
  if (a && Q.acts[a.dataset.act]) { e.preventDefault(); Q.acts[a.dataset.act](a, e); return; }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a,button,input,select,label')) location.hash = row.dataset.href;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') Q.closePop();
  if (e.key === 'Enter' && e.target.matches('tr[data-href]')) location.hash = e.target.dataset.href;
});
document.addEventListener('submit', e => {
  if (e.target.matches('[data-gsearch]')) {
    e.preventDefault(); const q = e.target.q.value.trim().toUpperCase(); if (!q) return;
    const hit = Q.db.get('incidents', q) || Q.db.all('incidents').find(x => x.id.endsWith(q.replace(/\D/g, '').padStart(4, '0')) && q.replace(/\D/g, '').length >= 3);
    if (hit && Q.canSeeIncident(hit)) return Q.go('#/incidents/' + hit.id);
    if (Q.canSeeCAPA(Q.db.get('capa', q))) return Q.go('#/capa/' + q);
    if (Q.canSeeRCA(Q.db.get('rca', q))) return Q.go('#/rca/' + q);
    if (Q.db.get('devices', q) && Q.can('device.view')) return Q.go('#/devices/' + q);
    Q.go('#/incidents?q=' + encodeURIComponent(e.target.q.value.trim()));
  }
});
window.addEventListener('hashchange', () => { Q.render(); window.scrollTo(0, 0); });

/* ---------- boot ---------- */
Q.boot = async () => {
  await Q.db.init();
  const sid = Q.pref.get('session', null);
  if (sid && Q.user(sid) && Q.user(sid).active !== false) Q.me = Q.user(sid);
  Q.render();
  setInterval(Q.refresh, 5 * 60 * 1000);
};
})();
