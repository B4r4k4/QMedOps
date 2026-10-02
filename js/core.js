/* سلامة · Q-MedOps: النواة: أدوات، لغة، تواريخ، تخزين، صلاحيات، سير العمل، واجهة */
window.Q = (() => {
'use strict';
const Q = {};

/* ---------- DOM & text ---------- */
Q.$ = (s, r = document) => r.querySelector(s);
Q.$$ = (s, r = document) => [...r.querySelectorAll(s)];
Q.esc = s => String(s == null ? '' : (typeof s === 'object' && ('ar' in s || 'en' in s)) ? Q.T(s) : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
Q.ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
Q.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let ls = null; try { ls = window.localStorage; ls.getItem('x'); } catch (e) { ls = null; }
Q.pref = {
  get(k, d) { try { const v = ls && ls.getItem('salamah.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { ls && ls.setItem('salamah.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { ls && ls.removeItem('salamah.' + k); } catch (e) {} }
};

/* ---------- language ---------- */
Q.lang = Q.pref.get('lang', 'ar');
Q.L = (ar, en) => Q.lang === 'ar' ? ar : en;
Q.T = x => x == null ? '' : Array.isArray(x) ? Q.L(x[0], x[1]) : (typeof x === 'object' ? (Q.lang === 'ar' ? (x.ar || x.en) : (x.en || x.ar)) : x);
const L = Q.L, T = Q.T;

/* ---------- dates ---------- */
const HOUR = 36e5, DAY = 864e5; Q.HOUR = HOUR; Q.DAY = DAY;
Q.now = () => new Date();
Q.d = v => v instanceof Date ? v : v ? new Date(v) : null;
Q.iso = d => (d instanceof Date ? d : new Date(d)).toISOString();
Q.add = (d, ms) => new Date(Q.d(d).getTime() + ms);
const MON = {ar:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'], en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], enL:['January','February','March','April','May','June','July','August','September','October','November','December']};
const WD = {ar:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'], en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
Q.MON = MON;
const p2 = n => String(n).padStart(2, '0');
Q.fDate = (v, time = true) => { const d = Q.d(v); if (!d || isNaN(d)) return '—';
  const y = d.getFullYear() !== Q.now().getFullYear() ? ' ' + d.getFullYear() : '';
  const t = time ? (Q.lang === 'ar' ? '، ' : ', ') + `${p2(d.getHours())}:${p2(d.getMinutes())}` : '';
  return Q.lang === 'ar' ? `${d.getDate()} ${MON.ar[d.getMonth()]}${y}${t}` : `${d.getDate()} ${MON.en[d.getMonth()]}${y}${t}`; };
Q.fDay = v => { const d = Q.d(v); return Q.lang === 'ar' ? `${WD.ar[d.getDay()]}، ${d.getDate()} ${MON.ar[d.getMonth()]} ${d.getFullYear()}` : `${WD.en[d.getDay()]}, ${d.getDate()} ${MON.enL[d.getMonth()]} ${d.getFullYear()}`; };
Q.fMonth = ym => { const [y, m] = ym.split('-').map(Number); return Q.lang === 'ar' ? `${MON.ar[m - 1]} ${y}` : `${MON.enL[m - 1]} ${y}`; };
Q.ym = v => { const d = Q.d(v); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
Q.ymAdd = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${p2(m)}`; };
Q.toInput = v => { const d = Q.d(v); if (!d) return ''; return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
Q.toDateInput = v => Q.toInput(v).slice(0, 10);
Q.fromInput = s => s ? new Date(s.length === 10 ? s + 'T12:00' : s).toISOString() : null;
const arN = (n, f) => n === 1 ? f[0] : n === 2 ? f[1] : (n >= 3 && n <= 10) ? `${n} ${f[2]}` : `${n} ${f[3]}`;
Q.nDays = n => L(arN(n, ['يوم واحد', 'يومان', 'أيام', 'يومًا']), `${n} day${n === 1 ? '' : 's'}`);
Q.nHours = n => L(arN(n, ['ساعة', 'ساعتان', 'ساعات', 'ساعة']), `${n} h`);
Q.rel = v => { const due = Q.d(v); if (!due) return {txt: '—', cls: ''};
  const diff = due - Q.now();
  if (diff < 0) { const h = -diff / HOUR; if (h < 24) { const n = Math.max(1, Math.round(h)); return {txt: L(`متأخر ${Q.nHours(n)}`, `${n} h overdue`), cls: 'late', late: true, n: 0}; }
    const n = Math.ceil(-diff / DAY); return {txt: L(`متأخر ${Q.nDays(n)}`, `${n}d overdue`), cls: 'late', late: true, n}; }
  if (diff < DAY) { const n = Math.max(1, Math.round(diff / HOUR)); return {txt: L(`خلال ${Q.nHours(n)}`, `in ${n} h`), cls: 'late', soon: true}; }
  const n = Math.ceil(diff / DAY); return {txt: L(`خلال ${Q.nDays(n)}`, `in ${n} days`), cls: n <= 2 ? 'soon' : '', soon: n <= 2}; };
Q.ago = v => { const d = Q.d(v), m = Math.round((Q.now() - d) / 6e4);
  if (m < 1) return L('الآن', 'just now'); if (m < 60) return L(`قبل ${m} د`, `${m} min ago`);
  const h = Math.round(m / 60); if (h < 24) return L(`قبل ${Q.nHours(h)}`, `${h} h ago`);
  return Q.fDate(d); };
Q.fSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

/* ---------- storage (IndexedDB with in-memory fallback) ---------- */
const COLS = ['users','depts','types','incidents','rca','capa','kpis','kpiValues','standards','devices','maint','audit','comments'];
Q.COLS = COLS;
const DBN = 'salamah-qmedops', VER = 1;
let idb = null;
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const openIDB = () => new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('no idb'));
  const r = indexedDB.open(DBN, VER);
  r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('files')) db.createObjectStore('files'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const kvGet = k => req(idb.transaction('kv').objectStore('kv').get(k));
const kvPut = (k, v) => req(idb.transaction('kv', 'readwrite').objectStore('kv').put(v, k));
const memFiles = {};
const timers = {};

Q.db = {
  data: {}, persistent: false,
  async init() {
    try { idb = await openIDB(); this.persistent = true; } catch (e) { idb = null; }
    let meta = null;
    if (idb) { try { meta = await kvGet('meta'); } catch (e) { meta = null; } }
    if (meta && meta.version) {
      for (const c of COLS) this.data[c] = (await kvGet(c)) || [];
      this.data.settings = (await kvGet('settings')) || Q.defaultSettings();
      this.data.meta = meta;
      if (!meta.bilingual && Q.bilingualize) { Q.bilingualize(this.data); meta.bilingual = 1; await this.flushAll(); }
    } else {
      Q.seed(this.data);
      this.data.meta = {version: 1, bilingual: 1, seededAt: Q.iso(Q.now())};
      await this.flushAll();
    }
  },
  all(c) { return this.data[c] || (this.data[c] = []); },
  get(c, id) { return this.all(c).find(x => x.id === id) || null; },
  put(c, o) { const a = this.all(c), i = a.findIndex(x => x.id === o.id); if (i >= 0) a[i] = o; else a.push(o); this.save(c); return o; },
  del(c, id) { const a = this.all(c), i = a.findIndex(x => x.id === id); if (i >= 0) a.splice(i, 1); this.save(c); },
  save(c) { if (!idb) return; clearTimeout(timers[c]); timers[c] = setTimeout(() => { kvPut(c, this.data[c]).catch(() => Q.toast(L('تعذّر حفظ البيانات', 'Could not save data'), 'err')); }, 120); },
  async flushAll() { if (!idb) return; for (const c of [...COLS, 'settings', 'meta']) { await kvPut(c, this.data[c]); } },
  async putFile(id, blob) { if (idb) await req(idb.transaction('files', 'readwrite').objectStore('files').put(blob, id)); else memFiles[id] = blob; },
  async getFile(id) { if (idb) return req(idb.transaction('files').objectStore('files').get(id)); return memFiles[id]; },
  async delFile(id) { if (idb) await req(idb.transaction('files', 'readwrite').objectStore('files').delete(id)); else delete memFiles[id]; },
  export() { const o = {app: 'salamah-qmedops', exportedAt: Q.iso(Q.now()), settings: this.data.settings}; COLS.forEach(c => o[c] = this.data[c]); return o; },
  async import(o) { if (!o || o.app !== 'salamah-qmedops') throw new Error('bad file'); COLS.forEach(c => this.data[c] = Array.isArray(o[c]) ? o[c] : []); this.data.settings = Object.assign(Q.defaultSettings(), o.settings || {}); if (Q.bilingualize) Q.bilingualize(this.data); await this.flushAll(); },
  async reset() { if (idb) { await req(idb.transaction('kv', 'readwrite').objectStore('kv').clear()); await req(idb.transaction('files', 'readwrite').objectStore('files').clear()); } this.data = {}; Q.seed(this.data); this.data.meta = {version: 1, bilingual: 1, seededAt: Q.iso(Q.now())}; await this.flushAll(); }
};
Q.S = () => Q.db.data.settings;
Q.defaultSettings = () => ({
  facility: {ar: 'مستشفى السلام التخصصي', en: 'Al Salam Specialist Hospital'},
  supervisorHours: 24, reviewDays: 3, externalHours: 24, rcaMeetingDays: 5, rcaReportDays: 30, closureDays: 45, rcaThreshold: 15,
  surveyDate: null
});

/* ---------- lookup helpers ---------- */
Q.user = id => Q.db.get('users', id);
Q.uname = id => { const u = Q.user(id); return u ? T(u.name) : '—'; };
Q.initials = u => { if (!u) return '؟'; const n = Q.T(u.name).replace(/^(د\.|م\.|Dr\.|Eng\.)\s*/, '').trim().split(/\s+/); return (n[0] ? n[0][0] : '') + (n[1] ? n[1][0] : ''); };
Q.avatar = (id, cls = '') => { const u = Q.user(id); const hue = u ? (u.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360 : 150;
  return `<span class="avatar ${cls}" style="background:hsl(${hue} 38% 90%);color:hsl(${hue} 45% 28%)" title="${Q.esc(u ? T(u.name) : '')}">${Q.esc(Q.initials(u))}</span>`; };
Q.dept = id => Q.db.get('depts', id);
Q.dname = id => { const d = Q.dept(id); return d ? T(d.name) : '—'; };
Q.dshort = id => { const d = Q.dept(id); return d ? T(d.short || d.name) : '—'; };
Q.tname = id => { const t = Q.db.get('types', id); return t ? T(t.name) : '—'; };

/* ---------- roles & permissions ---------- */
Q.ROLES = {
  reporter: ['موظف', 'Staff member'], supervisor: ['مشرف قسم', 'Department supervisor'], qps: ['أخصائي جودة', 'Quality specialist'],
  director: ['مدير الجودة', 'Quality director'], biomed: ['الهندسة الطبية', 'Biomedical engineering'], admin: ['مدير النظام', 'System admin']
};
const P = {
  'incident.all': ['qps', 'director', 'admin'],
  'incident.review': ['qps', 'director'],
  'incident.close': ['qps', 'director'],
  'incident.supervise': ['supervisor', 'qps', 'director'],
  'rca.view': ['qps', 'director', 'supervisor', 'biomed'],
  'rca.edit': ['qps', 'director'],
  'capa.view': ['qps', 'director', 'supervisor', 'biomed', 'admin'],
  'capa.create': ['qps', 'director', 'supervisor'],
  'capa.verify': ['qps', 'director'],
  'kpi.view': ['qps', 'director', 'supervisor', 'admin'],
  'kpi.enter': ['qps', 'director', 'supervisor'],
  'kpi.define': ['qps', 'director'],
  'cbahi.view': ['qps', 'director', 'supervisor', 'admin', 'biomed'],
  'cbahi.edit': ['qps', 'director'],
  'cbahi.upload': ['qps', 'director', 'supervisor', 'biomed'],
  'device.view': ['biomed', 'admin', 'director', 'qps', 'supervisor'],
  'device.edit': ['biomed', 'admin', 'director'],
  'reports.view': ['qps', 'director', 'admin'],
  'admin': ['admin', 'director'],
  'dashboard': ['qps', 'director', 'admin', 'supervisor', 'biomed']
};
Q.me = null;
Q.can = (perm, u = Q.me) => !!u && (P[perm] || []).includes(u.role);
Q.canSeeIncident = (x, u = Q.me) => {
  if (!u) return false;
  if (Q.can('incident.all', u)) return true;
  if (x.reporterId === u.id || x.review && x.review.ownerId === u.id) return true;
  if (u.role === 'supervisor' && x.deptId === u.deptId) return true;
  if (u.role === 'biomed' && (x.deviceTag || (Q.db.get('types', x.typeId) || {}).cat === 'device')) return true;
  const r = x.rcaId && Q.db.get('rca', x.rcaId); if (r && (r.team || []).includes(u.id)) return true;
  return false;
};
/* immediate supervisors of a department: supervisor-role staff plus the department head */
Q.supervisorsOf = deptId => { const d = Q.dept(deptId); const ids = Q.db.all('users').filter(u => u.active !== false && u.role === 'supervisor' && u.deptId === deptId).map(u => u.id);
  if (d && d.headId && (Q.user(d.headId) || {}).active !== false && !ids.includes(d.headId)) ids.push(d.headId); return ids; };
Q.isSupervisorOf = (x, u = Q.me) => !!u && Q.supervisorsOf(x.deptId).includes(u.id);
Q.canSeeRCA = (r, u = Q.me) => { if (!r || !u) return false; if (Q.can('rca.edit', u) || r.leadId === u.id || (r.team || []).includes(u.id)) return true;
  const x = Q.db.get('incidents', r.incidentId); return Q.can('rca.view', u) && !!x && Q.canSeeIncident(x, u); };
Q.canSeeCAPA = (c, u = Q.me) => { if (!c || !u || !Q.can('capa.view', u)) return false;
  if (Q.can('incident.all', u) || c.ownerId === u.id || c.createdBy === u.id || c.deptId === u.deptId || (u.role === 'biomed' && c.deptId === 'biomed')) return true;
  const x = c.incidentId && Q.db.get('incidents', c.incidentId); return !!x && Q.canSeeIncident(x, u); };
Q.canSeeKPI = (k, u = Q.me) => !!u && Q.can('kpi.view', u) && (u.role !== 'supervisor' || k.deptId === u.deptId);
Q.canEnterKPI = (k, u = Q.me) => !!u && Q.can('kpi.enter', u) && (u.role !== 'supervisor' || k.deptId === u.deptId);
Q.reportedOnTime = x => (new Date(x.reportedAt) - new Date(x.occurredAt)) <= 24 * 36e5;
Q.login = id => { Q.me = Q.user(id); Q.pref.set('session', id); };
Q.logout = () => { Q.me = null; Q.pref.del('session'); };

/* ---------- risk & workflow ---------- */
Q.SEV = [null, ['حدث وشيك', 'Near miss'], ['طفيف', 'Minor'], ['متوسط', 'Moderate'], ['كبير', 'Major'], ['جسيم', 'Serious']];
Q.LIK = [null, ['نادر', 'Rare'], ['غير مرجّح', 'Unlikely'], ['ممكن', 'Possible'], ['مرجّح', 'Likely'], ['متكرر', 'Frequent']];
Q.FACTORS = {
  patient: ['عوامل المريض', 'Patient factors'], staff: ['عوامل الكادر', 'Staff factors'], equipment: ['المعدات والأدوية', 'Equipment factors'], env: ['بيئة العمل', 'Work environment'],
  coord: ['التنسيق', 'Coordination'], info: ['المعلومات', 'Information'], policy: ['السياسات والإجراءات', 'Rules & procedures'], comm: ['التواصل', 'Communication']
};
Q.AFFECTED = {in: ['مريض منوّم', 'Inpatient'], out: ['مريض عيادات', 'Outpatient'], staff: ['موظف', 'Staff'], visitor: ['زائر', 'Visitor'], equip: ['جهاز', 'Equipment'], property: ['ممتلكات', 'Property'], other: ['أخرى', 'Other']};
Q.CLASS = {incident: ['حادثة', 'Incident'], near: ['حدث وشيك', 'Near miss'], sentinel: ['حدث جسيم', 'Sentinel event']};
Q.STAGES = {new: ['بانتظار تعليق المشرف', 'Awaiting supervisor'], review: ['مراجعة الجودة', 'QPS review'], rca: ['تحليل السبب الجذري', 'Root cause analysis'], action: ['تنفيذ الإجراءات', 'Actions in progress'], closed: ['مغلق', 'Closed']};
Q.STAGE_ORDER = ['new', 'review', 'rca', 'action', 'closed'];
Q.FLOW = [['الإبلاغ', 'Reported'], ['تعليق المشرف', 'Supervisor'], ['مراجعة الجودة', 'QPS review'], ['تحليل RCA', 'RCA'], ['الإجراءات', 'Actions'], ['الإغلاق', 'Closed']];

Q.sal = x => x.review ? x.review.sev * x.review.lik : null;
Q.isSentinel = x => (x.review ? x.review.classification === 'sentinel' : !!x.reporterSentinel);
Q.needsRCA = x => Q.isSentinel(x) || (Q.sal(x) || 0) >= Q.S().rcaThreshold;
Q.band = x => { const s = Q.sal(x); if (Q.isSentinel(x)) return 'crit'; if (s == null) return 'mute'; return s >= Q.S().rcaThreshold ? 'crit' : s >= 6 ? 'med' : 'low'; };
Q.bandLabel = x => { const s = Q.sal(x); if (Q.isSentinel(x)) return L('جسيم', 'Sentinel'); if (s == null) return L('لم يُقيّم', 'Not rated'); return s >= Q.S().rcaThreshold ? L('عالٍ', 'High') : s >= 6 ? L('متوسط', 'Moderate') : L('منخفض', 'Low'); };
Q.salChip = x => { const s = Q.sal(x); return `<span class="chip ${Q.band(x)}">${s != null ? `<span class="num" style="font-weight:700">${s}</span>` : ''}${Q.bandLabel(x)}</span>`; };

/* next required step for an incident: {what, due, role, userIds} */
Q.nextStep = x => {
  if (x.stage === 'closed') return null;
  if (Q.isSentinel(x) && !x.external) return Q.externalStep(x);
  return Q.stageStep(x);
};
Q.externalStep = x => ({key: 'external', what: ['الإخطار الخارجي للجهات الرقابية', 'External notice to regulators'], due: Q.add(x.occurredAt, Q.S().externalHours * HOUR), roles: ['qps', 'director']});
/* the workflow step of the current stage, independent of the parallel sentinel external notice */
Q.stageStep = x => {
  const S = Q.S();
  if (x.stage === 'closed') return null;
  if (x.stage === 'new') return {key: 'supervise', what: ['تعليق المشرف المباشر', 'Supervisor comment'], due: Q.add(x.reportedAt, S.supervisorHours * HOUR), roles: ['supervisor'], dept: x.deptId};
  if (x.stage === 'review') return {key: 'review', what: ['مراجعة الجودة وتحديد SAL', 'QPS review & SAL'], due: Q.add(x.supervisor ? x.supervisor.at : x.reportedAt, S.reviewDays * DAY), roles: ['qps', 'director']};
  if (x.stage === 'rca') {
    const r = Q.db.get('rca', x.rcaId);
    if (r && !r.meetingAt) return {key: 'rca-meet', what: ['اجتماع فريق RCA', 'RCA team meeting'], due: Q.add(x.review.at, S.rcaMeetingDays * DAY), roles: ['qps', 'director'], rca: r.id};
    return {key: 'rca-report', what: ['اعتماد تقرير RCA وخطة CAPA', 'Approve RCA report & CAPA plan'], due: Q.add(x.reportedAt, S.rcaReportDays * DAY), roles: ['qps', 'director'], rca: r && r.id};
  }
  if (x.stage === 'action') {
    const cs = Q.db.all('capa').filter(c => c.incidentId === x.id && c.status !== 'cancelled');
    const allDone = cs.every(c => c.status === 'verified');
    return {key: allDone ? 'close' : 'capa', what: allDone ? ['إغلاق البلاغ والتغذية الراجعة', 'Close & feed back'] : ['تنفيذ الإجراءات التصحيحية', 'Implement corrective actions'], due: Q.add(x.reportedAt, S.closureDays * DAY), roles: ['qps', 'director']};
  }
  return null;
};

Q.audit = (entity, id, action, detail = '') => {
  Q.db.put('audit', {id: Q.uid('a'), entity, ref: id, action, detail, by: Q.me ? Q.me.id : null, at: Q.iso(Q.now())});
};
Q.AUDIT_TXT = {
  created: ['أنشأ السجل', 'created the record'], submitted: ['أرسل البلاغ', 'submitted the report'], supervised: ['أضاف تعليق المشرف', 'added supervisor comment'],
  reviewed: ['راجع البلاغ وحدد SAL', 'reviewed and set SAL'], external: ['سجّل الإخطار الخارجي', 'logged external notice'], rca_opened: ['فتح تحقيق RCA', 'opened RCA'],
  rca_approved: ['اعتمد تقرير RCA', 'approved RCA report'], closed: ['أغلق البلاغ', 'closed the report'], reopened: ['أعاد فتح البلاغ', 'reopened the report'],
  updated: ['حدّث البيانات', 'updated details'], comment: ['علّق', 'commented'], capa_added: ['أضاف إجراءً تصحيحيًا', 'added a corrective action'],
  status: ['غيّر الحالة', 'changed status'], progress: ['حدّث نسبة الإنجاز', 'updated progress'], verified: ['تحقق من فعالية الإجراء', 'verified effectiveness'],
  rescheduled: ['أعاد جدولة الموعد', 'rescheduled'], uploaded: ['أرفق دليلًا', 'attached evidence'], approved: ['اعتمد الدليل', 'approved evidence'], pm: ['سجّل صيانة', 'logged maintenance'],
  assigned: ['أسند المسؤولية', 'assigned owner'], returned: ['أعاد البلاغ للمبلّغ', 'returned to reporter'],
  clarified: ['ردّ على طلب الإيضاح', 'answered the clarification request'], feedback_read: ['اطّلع على التغذية الراجعة', 'read the feedback'], eoc: ['وثّق الجزء الخامس (بيئة الرعاية)', 'completed Part V (environment of care)']
};

/* ---------- tasks (drives "My tasks" and notifications) ---------- */
Q.tasks = (u = Q.me) => {
  if (!u) return [];
  const out = [], now = Q.now();
  const push = (t) => out.push(t);
  Q.db.all('incidents').forEach(x => {
    const sub = Q.tname(x.typeId) + ' · ' + Q.dshort(x.deptId);
    /* reporter: closure feedback to read, clarification to answer */
    if (x.reporterId === u.id) {
      if (x.stage === 'closed' && x.closure && x.closure.notify && !x.closure.seenAt) push({kind: 'incident', ref: x.id, what: ['قراءة التغذية الراجعة على بلاغك', 'Read the feedback on your report'], due: null, prio: 2, link: `#/incidents/${x.id}`, sub});
      if (x.clarify && x.clarify.open) push({kind: 'incident', ref: x.id, what: ['الرد على طلب إيضاح', 'Answer a clarification request'], due: Q.add(x.clarify.at, DAY), prio: 1, link: `#/incidents/${x.id}`, sub});
    }
    if (x.stage === 'closed') return;
    const steps = [Q.nextStep(x)];
    if (steps[0] && steps[0].key === 'external') steps.push(Q.stageStep(x)); // supervisor step runs in parallel with the external notice
    steps.filter(Boolean).forEach(n => {
      let mine = false, what = n.what;
      if (n.key === 'supervise') { const sups = Q.supervisorsOf(x.deptId); mine = sups.includes(u.id) || (['qps', 'director'].includes(u.role) && (!sups.length || n.due < now)); }
      else if (n.key === 'capa') mine = false; // tracked via CAPA tasks
      else mine = n.roles.includes(u.role);
      if (!mine && n.rca) { const r = Q.db.get('rca', n.rca);
        if (r && n.key === 'rca-meet' && (r.leadId === u.id || (r.team || []).includes(u.id))) { mine = true; what = ['حضور اجتماع فريق RCA', 'Attend the RCA team meeting']; }
        if (r && n.key === 'rca-report' && r.leadId === u.id) { mine = true; what = ['استكمال التحليل والسبب الجذري وخطة CAPA', 'Complete analysis, root cause & CAPA plan']; } }
      if (mine) push({kind: 'incident', ref: x.id, what, due: n.due, prio: Q.isSentinel(x) ? 0 : 1, link: n.rca ? `#/rca/${n.rca}` : `#/incidents/${x.id}`, sub});
    });
  });
  Q.db.all('capa').forEach(c => {
    if (c.ownerId === u.id && ['open', 'progress'].includes(c.status)) push({kind: 'capa', ref: c.id, what: ['تنفيذ إجراء تصحيحي', 'Complete corrective action'], due: c.due, prio: 2, link: `#/capa/${c.id}`, sub: c.title});
    if (c.status === 'draft' && Q.can('capa.verify', u)) push({kind: 'capa', ref: c.id, what: ['اعتماد إجراء مقترح', 'Approve proposed action'], due: c.due, prio: 3, link: `#/capa/${c.id}`, sub: c.title});
    if (c.status === 'done' && Q.can('capa.verify', u)) push({kind: 'capa', ref: c.id, what: ['التحقق من فعالية الإجراء', 'Verify effectiveness'], due: Q.add(c.doneAt || c.due, 7 * DAY), prio: 2, link: `#/capa/${c.id}`, sub: c.title});
  });
  if (['biomed', 'admin'].includes(u.role)) Q.db.all('devices').forEach(d => {
    if (d.status === 'retired') return;
    const nx = Q.nextPM(d);
    if (nx && nx < Q.add(now, 14 * DAY)) push({kind: 'device', ref: d.id, what: ['صيانة وقائية', 'Preventive maintenance'], due: nx, prio: 3, link: `#/devices/${d.id}`, sub: T(d.name) + ' · ' + d.model});
    if (u.role === 'biomed' && ['down', 'repair'].includes(d.status)) push({kind: 'device', ref: d.id, what: ['إعادة الجهاز للخدمة', 'Return device to service'], due: null, prio: 2, link: `#/devices/${d.id}`, sub: T(d.name) + ' · ' + d.model});
    if (u.role === 'biomed' && d.status === 'check') push({kind: 'device', ref: d.id, what: ['فحص احترازي للجهاز', 'Precautionary device check'], due: null, prio: 2, link: `#/devices/${d.id}`, sub: T(d.name) + ' · ' + d.model});
  });
  if (Q.can('kpi.enter', u)) {
    const last = Q.ymAdd(Q.ym(now), -1);
    const kp = Q.db.all('kpis').filter(k => k.active !== false && Q.canEnterKPI(k, u));
    const missing = kp.filter(k => !Q.db.get('kpiValues', `${k.id}:${last}`));
    if (missing.length) push({kind: 'kpi', ref: last, what: [`إدخال مؤشرات ${Q.MON.ar[+last.slice(5) - 1]}`, `Enter ${Q.MON.enL[+last.slice(5) - 1]} indicators`], due: new Date(now.getFullYear(), now.getMonth(), 10, 17), prio: 3, link: `#/indicators/entry/${last}`, sub: L(`${missing.length} مؤشرات ناقصة`, `${missing.length} missing`)});
  }
  if (Q.can('cbahi.upload', u)) Q.db.all('standards').forEach(s => s.elements.forEach(e => {
    if (e.ownerId === u.id && e.status === 'missing') push({kind: 'cbahi', ref: s.id, what: ['إرفاق دليل اعتماد', 'Upload accreditation evidence'], due: e.due || null, prio: 4, link: `#/cbahi/${s.id}`, sub: `${s.id} · ${T(e.text)}`});
    if (Q.can('cbahi.edit', u) && e.status === 'uploaded') push({kind: 'cbahi', ref: s.id, what: ['مراجعة دليل مرفوع', 'Review uploaded evidence'], due: null, prio: 4, link: `#/cbahi/${s.id}`, sub: `${s.id} · ${T(e.text)}`});
  }));
  return out.sort((a, b) => a.prio - b.prio || ((a.due ? +Q.d(a.due) : 9e15) - (b.due ? +Q.d(b.due) : 9e15)));
};

/* ---------- devices ---------- */
Q.nextPM = d => d.lastPM ? new Date(new Date(d.lastPM).setMonth(new Date(d.lastPM).getMonth() + (d.pmMonths || 6))) : null;

/* ---------- KPI maths ---------- */
Q.kVal = (k, v) => { if (!v || v.den === 0 && k.unit !== 'count') return null; const n = +v.num, d = +v.den;
  if (k.unit === 'count') return n; if (!d) return null; if (k.unit === 'pct') return n / d * 100; if (k.unit === 'per1000') return n / d * 1000; return n / d; };
Q.kState = (k, val) => { if (val == null) return 'mute';
  if (k.dir === 'up') return val >= k.target ? 'ok' : val >= k.warn ? 'med' : 'crit';
  return val <= k.target ? 'ok' : val <= k.warn ? 'med' : 'crit'; };
Q.kFmt = (k, val, small = true) => { if (val == null) return '—'; const r = Math.abs(val) >= 10 || Number.isInteger(val) ? (Number.isInteger(val) ? val : val.toFixed(0)) : val.toFixed(1);
  const u = k.unit === 'pct' ? '%' : k.unit === 'per1000' ? '‰' : k.unit === 'days' ? (small ? ` <small>${L('يوم', 'd')}</small>` : L(' يوم', ' d')) : '';
  return (k.unit === 'days' ? (+val).toFixed(1) : r) + u; };
Q.kTarget = k => { const u = k.unit === 'pct' ? '%' : k.unit === 'per1000' ? '‰' : k.unit === 'days' ? L(' أيام', ' days') : '';
  return k.dir === 'up' ? L(`≥ ${k.target}${u}`, `≥ ${k.target}${u}`) : (k.target === 0 ? `0${u}` : `≤ ${k.target}${u}`); };
Q.K_ST = {ok: ['ضمن الهدف', 'On target'], med: ['تحت المراقبة', 'Watch'], crit: ['خارج الحد', 'Breach'], mute: ['لا توجد بيانات', 'No data']};

/* ---------- CBAHI maths ---------- */
Q.stdState = s => { const miss = s.elements.filter(e => e.status === 'missing').length, appr = s.elements.filter(e => e.status === 'approved').length;
  if (appr === s.elements.length) return 'ok'; if (miss && s.priority === 'high') return 'crit'; return 'med'; };
Q.readiness = (list = Q.db.all('standards')) => { const r = {ok: 0, med: 0, crit: 0, total: 0};
  list.forEach(s => s.elements.forEach(e => { r.total++; if (e.status === 'approved') r.ok++; else if (e.status === 'uploaded') r.med++; else r.crit++; }));
  r.pct = r.total ? Math.round(r.ok / r.total * 100) : 0; return r; };

/* ---------- UI: toast, modal, confirm, menus ---------- */
Q.toast = (msg, kind = 'ok') => { const t = Q.$('#toast'); t.className = 'toast on ' + kind; t.innerHTML = Q.ic(kind === 'err' ? 'alert' : 'check', 'sm') + `<span>${msg}</span>`; clearTimeout(Q.toast.t); Q.toast.t = setTimeout(() => t.classList.remove('on'), 3400); };

Q.modal = ({title, sub = '', body, submit = L('حفظ', 'Save'), danger = false, wide = false, onSubmit, onMount, cancel = L('إلغاء', 'Cancel')}) => {
  const dlg = Q.$('#modal');
  dlg.className = wide ? 'wide' : '';
  dlg.innerHTML = `<form class="dlg" novalidate>
    <div class="dlg-h"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="ibtn" data-close aria-label="${L('إغلاق', 'Close')}">${Q.ic('x')}</button></div>
    <div class="dlg-b">${body}</div>
    <div class="dlg-f"><span class="err" data-err></span><span class="sp"></span>${cancel ? `<button type="button" class="btn btn-s" data-close>${cancel}</button>` : ''}${submit ? `<button type="submit" class="btn ${danger ? 'btn-d' : 'btn-p'}">${submit}</button>` : ''}</div></form>`;
  const form = Q.$('form', dlg);
  const close = () => { if (dlg.open) dlg.close(); };
  Q.$$('[data-close]', dlg).forEach(b => b.addEventListener('click', close));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = Q.$$('[required]', form).find(el => !String(el.value || '').trim());
    if (bad) { Q.$('[data-err]', dlg).textContent = L('أكمل الحقول الإلزامية.', 'Please complete required fields.'); bad.focus(); return; }
    try { const r = onSubmit ? await onSubmit(Q.formData(form), form) : true; if (r !== false) close(); }
    catch (err) { Q.$('[data-err]', dlg).textContent = err.message || String(err); }
  });
  dlg.showModal(); onMount && onMount(form, dlg);
  const first = Q.$('input:not([type=hidden]),select,textarea', form); first && first.focus();
  return {close, form, dlg};
};
Q.confirm = (msg, {title = L('تأكيد', 'Confirm'), ok = L('تأكيد', 'Confirm'), danger = false} = {}) => new Promise(res => {
  let done = false;
  const m = Q.modal({title, body: `<p>${msg}</p>`, submit: ok, danger, onSubmit: () => { done = true; res(true); }});
  m.dlg.addEventListener('close', () => { if (!done) res(false); }, {once: true});
});
Q.formData = form => { const o = {}; new FormData(form).forEach((v, k) => { if (k in o) { o[k] = [].concat(o[k], v); } else o[k] = v; });
  Q.$$('input[type=checkbox][name]', form).forEach(c => { if (c.dataset.multi == null) o[c.name] = c.checked; });
  Q.$$('input[type=checkbox][data-multi]', form).forEach(c => { if (!Array.isArray(o[c.name])) o[c.name] = o[c.name] && o[c.name] !== true && o[c.name] !== false ? [o[c.name]] : Q.$$(`input[name="${c.name}"]:checked`, form).map(i => i.value); });
  return o; };

/* form field builders */
Q.f = {
  text: (name, label, v = '', o = {}) => `<label class="fl ${o.w ? 'w' : ''}">${label}${o.req ? ' <span class="req">*</span>' : ''}${o.opt ? ` <span class="opt">${o.opt}</span>` : ''}<input class="field ${o.ltr ? 'ltr-in' : ''}" name="${name}" value="${Q.esc(v)}" ${o.req ? 'required' : ''} ${o.type ? `type="${o.type}"` : ''} ${o.attrs || ''} ${o.ph ? `placeholder="${Q.esc(o.ph)}"` : ''}>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  area: (name, label, v = '', o = {}) => `<label class="fl ${o.w !== false ? 'w' : ''}">${label}${o.req ? ' <span class="req">*</span>' : ''}${o.opt ? ` <span class="opt">${o.opt}</span>` : ''}<textarea class="field" name="${name}" ${o.req ? 'required' : ''} ${o.ph ? `placeholder="${Q.esc(o.ph)}"` : ''} ${o.rows ? `style="min-height:${o.rows * 22}px"` : ''}>${Q.esc(v)}</textarea>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  sel: (name, label, opts, v = '', o = {}) => `<label class="fl ${o.w ? 'w' : ''}">${label}${o.req ? ' <span class="req">*</span>' : ''}<select class="field" name="${name}" ${o.req ? 'required' : ''} ${o.attrs || ''}>${o.empty ? `<option value="">${o.empty}</option>` : ''}${opts.map(([k, t]) => `<option value="${Q.esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${Q.esc(t)}</option>`).join('')}</select>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  chk: (name, label, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`,
  multi: (name, label, opts, vals = [], o = {}) => `<div class="fl ${o.w !== false ? 'w' : ''}">${label}<div class="radios">${opts.map(([k, t]) => `<label><input type="checkbox" data-multi name="${name}" value="${Q.esc(k)}" ${vals.includes(k) ? 'checked' : ''}>${Q.esc(t)}</label>`).join('')}</div></div>`,
  radio: (name, label, opts, v, o = {}) => `<div class="fl ${o.w ? 'w' : ''}">${label}${o.req ? ' <span class="req">*</span>' : ''}<div class="radios">${opts.map(([k, t]) => `<label><input type="radio" name="${name}" value="${Q.esc(k)}" ${k === v ? 'checked' : ''}>${Q.esc(t)}</label>`).join('')}</div></div>`
};
Q.userOpts = (filter = () => true) => Q.db.all('users').filter(u => u.active !== false && filter(u)).map(u => [u.id, `${T(u.name)} · ${T(Q.ROLES[u.role])}`]);
Q.deptOpts = (filter = () => true) => Q.db.all('depts').filter(filter).map(d => [d.id, T(d.name)]);
Q.typeOpts = () => Q.db.all('types').filter(t => t.active !== false).map(t => [t.id, T(t.name)]);

Q.download = (name, content, type = 'text/plain') => { const b = content instanceof Blob ? content : new Blob([content], {type}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
Q.csv = rows => '﻿' + rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');

/* ---------- actions registry ---------- */
Q.acts = {};
Q.act = (name, fn) => { Q.acts[name] = fn; };

/* ---------- small render helpers ---------- */
Q.empty = (txt, icon = 'file', action = '') => `<div class="empty">${Q.ic(icon, 'lg')}<p>${txt}</p>${action}</div>`;
Q.stat = (label, big, sub = '', o = {}) => `<${o.go ? `a href="${o.go}"` : 'div'} class="stat">${`<div class="lbl">${label}${o.icon ? Q.ic(o.icon, 'sm') : ''}</div><div class="big ${o.cls || ''}">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`}</${o.go ? 'a' : 'div'}>`;
Q.track = (parts) => `<div class="track">${parts.map(([w, c]) => `<i style="width:${w}%;background:${c}"></i>`).join('')}</div>`;
Q.seg = (items, cur, attr) => `<div class="seg" role="group">${items.map(([k, t, n]) => `<button type="button" data-act="${attr}" data-v="${k}" class="${String(cur) === String(k) ? 'on' : ''}">${t}${n != null ? `<em>${n}</em>` : ''}</button>`).join('')}</div>`;

Q.spark = (vals, k, h = 34) => {
  const w = 160, pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const nums = pts.map(p => p[1]).concat([k.target]);
  let max = Math.max(...nums), min = Math.min(...nums); if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * .15; max += pad; min -= pad;
  const x = i => (i / (vals.length - 1)) * w, y = v => h - 2 - ((v - min) / (max - min)) * (h - 6);
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1], st = Q.kState(k, last[1]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line class="th" x1="0" x2="${w}" y1="${y(k.target).toFixed(1)}" y2="${y(k.target).toFixed(1)}" vector-effect="non-scaling-stroke"/><path class="l s-${st}" d="${d}" vector-effect="non-scaling-stroke"/><circle cx="${x(last[0])}" cy="${y(last[1])}" r="2.6" class="f-${st}"/></svg>`;
};

return Q;
})();
