/* المرحلة الثانية: إدارة المخاطر · FMEA · الاستبيانات · اللجان · سجل الإبلاغ الخارجي · المسح التجريبي · التمارين
   RSK-01/02/03 · PSI-05 · PEX-01 · GOV-01/02 · GOV-05 · AUD-05 · FAC-05 (and FAC-09 disaster exercises) */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;
const DAY = Q.DAY, now = () => Q.now();
const staffOpts = () => Q.userOpts(u => u.role !== 'reporter');
const pct = (a, b) => b ? Math.round(a / b * 100) : null;
const nextId = (col, prefix) => { const y = new Date().getFullYear(); const n = Q.idObjs(col).filter(x => String(x.id).startsWith(`${prefix}-${y}-`)).reduce((m, x) => Math.max(m, +String(x.id).slice(-3) || 0), 0) + 1; return `${prefix}-${y}-${String(n).padStart(3, '0')}`; };
const denied = () => ({title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('ليست لديك صلاحية لعرض هذه الصفحة.', 'You do not have access to this page.'), 'lock')});
const notFound = t => ({title: '—', html: Q.empty(t, 'search')});
const bar = (v, good = 85, warn = 70) => `<div class="track"><i style="width:${v || 0}%;background:${v == null ? 'transparent' : v >= good ? 'var(--brand)' : v >= warn ? 'var(--amber-bar)' : 'var(--red)'}"></i></div>`;
const clsOf = (v, good = 85, warn = 70) => v == null ? 'mute' : v >= good ? 'ok' : v >= warn ? 'med' : 'crit';

Object.assign(Q.AUDIT_TXT, {
  risk_assessed: ['قيّم الخطر', 'assessed the risk'], risk_residual: ['قيّم الخطر المتبقي', 'assessed residual risk'], risk_reviewed: ['راجع الخطر', 'reviewed the risk'], risk_closed: ['أغلق الخطر', 'closed the risk'],
  fmea_approved: ['اعتمد تحليل FMEA', 'approved the FMEA'], survey_opened: ['فتح الاستبيان', 'opened the survey'], survey_closed: ['أغلق الاستبيان', 'closed the survey'], followup: ['تابع الاستجابة', 'followed up the response'],
  meeting_held: ['وثّق الاجتماع', 'recorded the meeting'], decision: ['سجّل قرارًا', 'recorded a decision'], ext_submitted: ['سجّل تقديم البلاغ الخارجي', 'logged the external submission'],
  mock_done: ['وثّق المسح التجريبي', 'recorded the mock survey'], gaps_sent: ['أرسل قائمة الفجوات للمسؤولين', 'sent the gap list to owners'], drill_done: ['وثّق التمرين', 'recorded the exercise']
});

/* one place that raises a corrective action from any source; QPS-created actions open directly, others are proposed */
Q.newCapa = ({title, source, ownerId, deptId, dueDays = 30, refKind = null, refId = null, extra = {}}) => {
  const n = Q.idObjs('capa').reduce((m, c) => Math.max(m, +String(c.id).replace(/\D/g, '') || 0), 300) + 1;
  const c = Object.assign({id: `CAPA-${n}`, title, kind: 'corrective', source, ownerId, deptId: deptId || (Q.user(ownerId) || {}).deptId, due: Q.add(now(), dueDays * DAY).toISOString(), refKind, refId,
    measure: '', progress: 0, status: Q.can('capa.verify') ? 'open' : 'draft', createdAt: Q.iso(now()), createdBy: Q.me ? Q.me.id : null, updates: []}, extra);
  Q.db.put('capa', c); Q.audit('capa', c.id, 'created', refId || ''); return c;
};
Q.capaFor = (refKind, refId, pred = () => true) => Q.db.all('capa').filter(c => c.refKind === refKind && c.refId === refId && c.status !== 'cancelled' && pred(c));
Q.REF_ROUTE = {risk: '#/risks/', fmea: '#/risks/fmea/', meeting: '#/committees/meeting/', survey: '#/surveys/', drill: '#/drills/', mock: '#/mock/', kpi: '#/indicators/', ext: '#/external'};
const capaTable = list => list.length ? `<div class="tbl-wrap"><table><tbody>${list.map(Q.capaRow).join('')}</tbody></table></div>` : '';

/* ======================================================================
   RSK-01 RISK REGISTER · RSK-03 TREATMENT PLANS
   score = likelihood × impact; bands 1–4 low, 5–9 moderate, 10–14 high, 15–25 extreme
   high/extreme needs a treatment plan; residual risk is compared with the target band
   ====================================================================== */
const RISK_CAT = {clinical: ['سريري', 'Clinical'], operational: ['تشغيلي', 'Operational'], safety: ['سلامة المرافق', 'Facility safety'], compliance: ['امتثال وتنظيمي', 'Compliance'], financial: ['مالي', 'Financial'], it: ['تقني ومعلومات', 'IT & information'], reputation: ['سمعة', 'Reputation']};
const BAND = {low: ['منخفض', 'Low', 'ok'], moderate: ['متوسط', 'Moderate', 'med'], high: ['عالٍ', 'High', 'high'], extreme: ['حرج', 'Extreme', 'crit']};
const BAND_ORDER = ['low', 'moderate', 'high', 'extreme'];
Q.riskBand = s => s >= 15 ? 'extreme' : s >= 10 ? 'high' : s >= 5 ? 'moderate' : 'low';
Q.riskScore = r => (r.l || 0) * (r.i || 0);
Q.riskResidual = r => r.rl && r.ri ? r.rl * r.ri : null;
Q.riskCurrentBand = r => Q.riskBand(Q.riskResidual(r) ?? Q.riskScore(r));
Q.riskNeedsPlan = r => r.status !== 'closed' && ['high', 'extreme'].includes(Q.riskBand(Q.riskScore(r))) && !Q.capaFor('risk', r.id).length;
Q.riskAboveTarget = r => r.status !== 'closed' && BAND_ORDER.indexOf(Q.riskCurrentBand(r)) > BAND_ORDER.indexOf(r.target || 'low');
Q.riskReviewDue = r => r.status !== 'closed' && r.reviewDue && new Date(r.reviewDue) < now();
const bandChip = s => { const b = Q.riskBand(s); return `<span class="chip ${BAND[b][2]}"><span class="num" style="font-weight:700">${s}</span> ${T(BAND[b])}</span>`; };
const canEditRisk = r => Q.can('risk.edit') && (Q.me.role !== 'supervisor' || r.deptId === Q.me.deptId || r.ownerId === Q.me.id);
const visibleRisks = () => Q.db.all('risks').filter(r => Q.me.role !== 'supervisor' || r.deptId === Q.me.deptId || r.ownerId === Q.me.id);

Q.views.risks = {perm: 'risk.view', render(parts, q) {
  if (parts[0] === 'fmea') return parts[1] ? fmeaDetail(parts[1]) : fmeaList();
  if (parts[0]) return riskDetail(parts[0]);
  if (q.tab) { Q.ui.riskTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.riskTab || 'open', all = visibleRisks();
  const tabs = [['open', L('المفتوحة', 'Open'), r => r.status !== 'closed'], ['plan', L('تحتاج خطة معالجة', 'Need a treatment plan'), Q.riskNeedsPlan], ['target', L('المتبقي فوق المستهدف', 'Residual above target'), Q.riskAboveTarget], ['review', L('مراجعة متأخرة', 'Review overdue'), Q.riskReviewDue], ['closed', L('المغلقة', 'Closed'), r => r.status === 'closed']];
  const fn = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const list = all.filter(fn).sort((a, b) => Q.riskScore(b) - Q.riskScore(a));
  const open = all.filter(r => r.status !== 'closed');
  const heat = (l, i) => open.filter(r => r.l === l && r.i === i).length;
  return {title: L('سجل المخاطر', 'Risk register'), html: `
  <div class="page-head"><div><h2>${L('سجل المخاطر وخطط المعالجة', 'Risk register & treatment plans')}</h2><p>${L('الدرجة = الاحتمالية × الأثر · العالية والحرجة تتطلب خطة معالجة · يُقارن الخطر المتبقي بالمستوى المستهدف', 'Score = likelihood × impact · high and extreme need a treatment plan · residual risk is compared with the target level')}</p></div>
    <div class="row"><a class="btn btn-s" href="#/risks/fmea">${ic('search')}${L('تحليل FMEA الاستباقي', 'Proactive FMEA')}</a>${Q.can('risk.edit') ? `<button class="btn btn-p" data-act="risk-new">${ic('plus')}${L('خطر جديد', 'New risk')}</button>` : ''}</div></div>
  <div class="risk-top">
    <section class="card"><div class="card-h"><div><h3>${L('خريطة المخاطر المفتوحة', 'Open risk heat map')}</h3><p>${L('الأثر (أفقي) × الاحتمالية (رأسي)', 'Impact (across) × likelihood (down)')}</p></div></div><div class="card-b"><div class="heat">
      <div class="corner"></div>${[1, 2, 3, 4, 5].map(i => `<div class="hd">${i}</div>`).join('')}
      ${[5, 4, 3, 2, 1].map(l => `<div class="hd">${l}</div>${[1, 2, 3, 4, 5].map(i => { const n = heat(l, i); return `<div class="c ${BAND[Q.riskBand(l * i)][2]}" title="${l} × ${i} = ${l * i}">${n || ''}</div>`; }).join('')}`).join('')}</div></div></section>
    <div class="stats c2">
      ${Q.stat(L('مخاطر مفتوحة', 'Open risks'), open.length, BAND_ORDER.slice().reverse().map(b => `${open.filter(r => Q.riskBand(Q.riskScore(r)) === b).length} ${T(BAND[b])}`).join(' · '), {icon: 'alert'})}
      ${Q.stat(L('عالية دون خطة معالجة', 'High without a treatment plan'), all.filter(Q.riskNeedsPlan).length, L('تتطلب خطة فورًا', 'Need a plan now'), {cls: all.filter(Q.riskNeedsPlan).length ? 'up-bad' : ''})}
      ${Q.stat(L('المتبقي فوق المستهدف', 'Residual above target'), all.filter(Q.riskAboveTarget).length, L('بعد المعالجة', 'after treatment'))}
      ${Q.stat(L('مراجعة متأخرة', 'Review overdue'), all.filter(Q.riskReviewDue).length, '', {cls: all.filter(Q.riskReviewDue).length ? 'up-bad' : ''})}
    </div></div>
  <section class="card">
    <div class="toolbar">${Q.seg(tabs.map(([k, t, f]) => [k, t, all.filter(f).length]), tab, 'risk-tab')}</div>
    <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الرقم', 'ID')}</th><th>${L('الخطر', 'Risk')}</th><th class="hide-m">${L('المالك', 'Owner')}</th><th>${L('الأصلي', 'Inherent')}</th><th>${L('المتبقي', 'Residual')}</th><th class="hide-m">${L('المعالجة', 'Treatment')}</th><th class="hide-m">${L('المراجعة', 'Review')}</th></tr></thead>
    <tbody>${list.length ? list.map(r => { const acts = Q.capaFor('risk', r.id), res = Q.riskResidual(r); return `<tr class="click" data-href="#/risks/${r.id}">
      <td class="nowrap"><span class="oid">${r.id}</span><span class="t2">${T(RISK_CAT[r.category] || RISK_CAT.operational)}</span></td><td><span class="t1" style="white-space:normal">${esc(T(r.title))}</span><span class="t2">${Q.dname(r.deptId)}</span></td>
      <td class="hide-m">${esc(Q.uname(r.ownerId))}</td><td>${bandChip(Q.riskScore(r))}</td><td>${res != null ? bandChip(res) : '—'}${Q.riskAboveTarget(r) ? `<span class="t2 c-crit">${L('فوق المستهدف', 'above target')}</span>` : ''}</td>
      <td class="hide-m">${Q.riskNeedsPlan(r) ? `<span class="chip crit">${L('لا توجد خطة', 'No plan')}</span>` : acts.length ? `${acts.filter(c => c.status === 'verified').length}/${acts.length}` : '—'}</td>
      <td class="hide-m nowrap">${r.reviewDue ? `<span class="due ${Q.riskReviewDue(r) ? 'late' : ''}">${Q.fDate(r.reviewDue, false)}</span>` : '—'}</td></tr>`; }).join('') : `<tr><td colspan="7">${Q.empty(L('لا توجد مخاطر في هذا التصنيف.', 'No risks in this view.'), 'alert')}</td></tr>`}</tbody></table></div>
  </section>`};
}};
Q.act('risk-tab', el => { Q.ui.riskTab = el.dataset.v; Q.saveUI(); history.replaceState(null, '', '#/risks'); Q.render(); });
const scale = (name, label, v) => Q.f.sel(name, label, [1, 2, 3, 4, 5].map(n => [n, String(n)]), v || 3, {req: true});
const riskForm = (r = {}) => `<div class="fgrid">
  ${Q.f.text('ar', L('الخطر', 'Risk'), r.title ? r.title.ar : '', {req: true, w: true, ph: L('مثال: تعطل نظام الأكسجين المركزي', 'e.g. central oxygen supply failure')})}
  ${Q.f.sel('category', L('التصنيف', 'Category'), Object.entries(RISK_CAT).map(([k, v]) => [k, T(v)]), r.category || 'clinical')}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), r.deptId || Q.me.deptId, {req: true})}
  ${Q.f.sel('ownerId', L('مالك الخطر', 'Risk owner'), staffOpts(), r.ownerId || Q.me.id, {req: true})}${Q.f.sel('target', L('المستوى المستهدف بعد المعالجة', 'Target level after treatment'), BAND_ORDER.map(b => [b, T(BAND[b])]), r.target || 'moderate')}
  ${scale('l', L('الاحتمالية (1–5)', 'Likelihood (1–5)'), r.l)}${scale('i', L('الأثر (1–5)', 'Impact (1–5)'), r.i)}
  ${Q.f.area('controls', L('الضوابط الحالية', 'Existing controls'), r.controls || '', {rows: 2})}
  ${Q.f.text('reviewDue', L('موعد المراجعة', 'Review date'), r.reviewDue ? Q.toDateInput(r.reviewDue) : Q.toDateInput(Q.add(now(), 180 * DAY)), {type: 'date', req: true})}</div>`;
const riskFrom = (d, r) => Object.assign(r, {title: {ar: d.ar, en: d.ar}, category: d.category, deptId: d.deptId, ownerId: d.ownerId, target: d.target, l: +d.l, i: +d.i, controls: d.controls, reviewDue: Q.fromInput(d.reviewDue)});
Q.act('risk-new', () => Q.modal({title: L('خطر جديد', 'New risk'), wide: true, body: riskForm(), onSubmit: d => { const r = riskFrom(d, {id: nextId('risks', 'RSK'), status: 'open', createdAt: Q.iso(now()), createdBy: Q.me.id});
  Q.db.put('risks', r); Q.audit('risk', r.id, 'created', `${r.l}×${r.i}`); Q.go('#/risks/' + r.id); if (['high', 'extreme'].includes(Q.riskBand(Q.riskScore(r)))) Q.toast(L('خطر عالٍ: أضف خطة معالجة', 'High risk: add a treatment plan'), 'err'); }}));
Q.act('risk-edit', el => { const r = Q.db.get('risks', el.dataset.id); Q.modal({title: L('تعديل الخطر', 'Edit risk'), wide: true, body: riskForm(r), onSubmit: d => { riskFrom(d, r); Q.db.put('risks', r); Q.audit('risk', r.id, 'risk_assessed', `${r.l}×${r.i}`); Q.render(); }}); });
Q.act('risk-residual', el => { const r = Q.db.get('risks', el.dataset.id); Q.modal({title: L('تقييم الخطر المتبقي', 'Assess residual risk'), sub: esc(T(r.title)), body: `<div class="fgrid">${scale('rl', L('الاحتمالية بعد المعالجة', 'Likelihood after treatment'), r.rl || r.l)}${scale('ri', L('الأثر بعد المعالجة', 'Impact after treatment'), r.ri || r.i)}${Q.f.area('note', L('الأساس', 'Basis'), '', {req: true, rows: 2})}</div>`,
  onSubmit: d => { r.rl = +d.rl; r.ri = +d.ri; (r.history = r.history || []).push({at: Q.iso(now()), by: Q.me.id, what: 'residual', score: r.rl * r.ri, note: d.note}); Q.db.put('risks', r); Q.audit('risk', r.id, 'risk_residual', `${r.rl}×${r.ri}`); Q.render(); }}); });
Q.act('risk-review', el => { const r = Q.db.get('risks', el.dataset.id); Q.modal({title: L('مراجعة الخطر', 'Review risk'), body: `<div class="fgrid">${Q.f.area('note', L('نتيجة المراجعة', 'Review outcome'), '', {req: true, rows: 2})}${Q.f.text('next', L('المراجعة القادمة', 'Next review'), Q.toDateInput(Q.add(now(), 180 * DAY)), {type: 'date', req: true})}</div>`,
  onSubmit: d => { r.reviewDue = Q.fromInput(d.next); r.lastReview = {at: Q.iso(now()), by: Q.me.id, note: d.note}; Q.db.put('risks', r); Q.audit('risk', r.id, 'risk_reviewed', d.note); Q.render(); }}); });
Q.act('risk-close', async el => { const r = Q.db.get('risks', el.dataset.id); if (Q.riskAboveTarget(r) && !await Q.confirm(L('الخطر المتبقي ما زال فوق المستهدف. إغلاقه يعني قبوله رسميًا. متابعة؟', 'Residual risk is still above target. Closing it means formally accepting it. Continue?'), {danger: true})) return;
  r.status = 'closed'; r.closedAt = Q.iso(now()); r.closedBy = Q.me.id; Q.db.put('risks', r); Q.audit('risk', r.id, 'risk_closed'); Q.render(); });
function riskDetail(id) {
  const r = Q.db.get('risks', id); if (!r) return notFound(L('الخطر غير موجود.', 'Risk not found.'));
  if (!visibleRisks().includes(r)) return denied();
  const ed = canEditRisk(r), acts = Q.capaFor('risk', r.id), res = Q.riskResidual(r);
  return {title: `<span class="ltr">${r.id}</span>`, html: `
  <nav class="crumbs"><a href="#/risks">${L('سجل المخاطر', 'Risk register')}</a>${ic('chev', 'sm flip')}<span class="ltr">${r.id}</span></nav>
  <div class="page-head"><div><div class="row">${bandChip(Q.riskScore(r))}<span class="chip mute">${T(RISK_CAT[r.category] || RISK_CAT.operational)}</span>${r.status === 'closed' ? `<span class="chip mute">${L('مغلق', 'Closed')}</span>` : ''}</div><h2 style="margin-top:8px">${esc(T(r.title))}</h2><p>${Q.dname(r.deptId)} · ${L('المالك', 'Owner')}: ${esc(Q.uname(r.ownerId))}</p></div>
    <div class="row">${ed && r.status !== 'closed' ? `<button class="btn btn-s" data-act="risk-edit" data-id="${r.id}">${ic('edit')}${L('إعادة التقييم', 'Re-assess')}</button><button class="btn btn-s" data-act="risk-residual" data-id="${r.id}">${L('الخطر المتبقي', 'Residual risk')}</button><button class="btn btn-s" data-act="risk-review" data-id="${r.id}">${ic('check')}${L('مراجعة', 'Review')}</button><button class="btn-g" data-act="risk-close" data-id="${r.id}">${L('إغلاق', 'Close')}</button>` : ''}</div></div>
  ${Q.riskNeedsPlan(r) ? `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L('خطر عالٍ دون خطة معالجة', 'High risk without a treatment plan')}</b><p>${L('أضف إجراء معالجة واحدًا على الأقل بمسؤول وموعد.', 'Add at least one treatment action with an owner and a date.')}</p></div></div>` : ''}
  ${Q.riskAboveTarget(r) && res != null ? `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L('الخطر المتبقي فوق المستوى المستهدف', 'Residual risk is above the target level')}</b><p>${L(`المتبقي ${res} (${T(BAND[Q.riskBand(res)])}) · المستهدف ${T(BAND[r.target])}`, `Residual ${res} (${T(BAND[Q.riskBand(res)])}) · target ${T(BAND[r.target])}`)}</p></div></div>` : ''}
  <div class="detail"><div class="detail-main">
    <section class="card" style="margin-bottom:16px"><div class="card-b"><div class="risk-scores">
      <div><small>${L('الخطر الأصلي', 'Inherent risk')}</small><b>${r.l} × ${r.i} = ${Q.riskScore(r)}</b>${bandChip(Q.riskScore(r))}</div>
      <div><small>${L('الخطر المتبقي', 'Residual risk')}</small><b>${res != null ? `${r.rl} × ${r.ri} = ${res}` : '—'}</b>${res != null ? bandChip(res) : `<span class="muted">${L('لم يُقيّم بعد', 'Not assessed yet')}</span>`}</div>
      <div><small>${L('المستهدف', 'Target')}</small><b>${T(BAND[r.target || 'low'])}</b></div></div>
      ${r.controls ? `<div class="sec" style="margin-top:14px"><h4>${L('الضوابط الحالية', 'Existing controls')}</h4><p class="pre">${esc(r.controls)}</p></div>` : ''}</div></section>
    <section class="card flush" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('خطة المعالجة', 'Treatment plan')}</h3><p>${L('الإجراءات المتأخرة تُصعَّد تلقائيًا (سلم تصعيد CAPA)', 'Overdue actions escalate automatically (CAPA escalation ladder)')}</p></div>${ed && Q.can('capa.create') && r.status !== 'closed' ? `<button class="btn btn-s sm" data-act="capa-new" data-refkind="risk" data-refid="${r.id}" data-src="risk" data-title="${esc(L(`معالجة الخطر ${r.id}: `, `Treat risk ${r.id}: `) + T(r.title))}">${ic('plus', 'sm')}${L('إجراء معالجة', 'Treatment action')}</button>` : ''}</div>
      ${capaTable(acts) || `<div class="card-b"><p class="muted">${L('لا توجد إجراءات.', 'No actions.')}</p></div>`}</section>
  </div>
  <aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
    <div><dt>${L('موعد المراجعة', 'Review date')}</dt><dd>${r.reviewDue ? `${Q.fDate(r.reviewDue, false)} · <span class="due ${Q.rel(r.reviewDue).cls}">${Q.rel(r.reviewDue).txt}</span>` : '—'}</dd></div>
    ${r.lastReview ? `<div><dt>${L('آخر مراجعة', 'Last review')}</dt><dd>${Q.fDate(r.lastReview.at, false)} · ${esc(Q.uname(r.lastReview.by))}<br><small>${esc(r.lastReview.note)}</small></dd></div>` : ''}
    <div><dt>${L('سُجّل', 'Logged')}</dt><dd>${Q.fDate(r.createdAt, false)} · ${esc(Q.uname(r.createdBy))}</dd></div>
    ${r.fmeaId ? `<div><dt>FMEA</dt><dd><a class="ltr" href="#/risks/fmea/${r.fmeaId}">${r.fmeaId}</a></dd></div>` : ''}
  </dl></div></section></aside></div>`};
}

/* ---------- RSK-02 FMEA: RPN = severity × occurrence × detection; above the threshold creates an action ---------- */
Q.rpn = m => (m.s || 0) * (m.o || 0) * (m.d || 0);
const rpnChip = v => `<span class="chip ${v > Q.S().rpnThreshold ? 'crit' : v > Q.S().rpnThreshold / 2 ? 'med' : 'ok'}"><span class="num">${v}</span></span>`;
function fmeaList() {
  const all = Q.db.all('fmeas');
  return {title: 'FMEA', html: `
  <nav class="crumbs"><a href="#/risks">${L('سجل المخاطر', 'Risk register')}</a>${ic('chev', 'sm flip')}<span>FMEA</span></nav>
  <div class="page-head"><div><h2>${L('التحليل الاستباقي لأنماط الفشل (FMEA)', 'Proactive failure mode analysis (FMEA)')}</h2><p>${L(`RPN = الشدة × الحدوث × الاكتشاف · أعلى من ${Q.S().rpnThreshold} يفتح إجراءً عند الاعتماد`, `RPN = severity × occurrence × detection · above ${Q.S().rpnThreshold} opens an action on approval`)}</p></div>${Q.can('risk.edit') ? `<button class="btn btn-p" data-act="fmea-new">${ic('plus')}${L('تحليل جديد', 'New analysis')}</button>` : ''}</div>
  <section class="card flush"><div class="tbl-wrap"><table><thead><tr><th>${L('الرقم', 'ID')}</th><th>${L('العملية', 'Process')}</th><th>${L('أنماط الفشل', 'Failure modes')}</th><th>${L('أعلى RPN', 'Top RPN')}</th><th>${L('الحالة', 'Status')}</th></tr></thead><tbody>
  ${all.map(f => { const ms = f.steps.flatMap(s => s.modes); const top = ms.reduce((m, x) => Math.max(m, Q.rpn(x)), 0); return `<tr class="click" data-href="#/risks/fmea/${f.id}"><td class="nowrap"><span class="oid">${f.id}</span></td><td>${esc(T(f.title))}<span class="t2">${Q.dname(f.deptId)}</span></td><td>${ms.length} · ${L(`${ms.filter(m => Q.rpn(m) > Q.S().rpnThreshold).length} فوق الحد`, `${ms.filter(m => Q.rpn(m) > Q.S().rpnThreshold).length} above threshold`)}</td><td>${rpnChip(top)}</td><td><span class="chip ${f.status === 'approved' ? 'ok' : 'mute'}">${f.status === 'approved' ? L('معتمد', 'Approved') : L('مسودة', 'Draft')}</span></td></tr>`; }).join('') || `<tr><td colspan="5">${Q.empty(L('لا توجد تحليلات.', 'No analyses yet.'), 'search')}</td></tr>`}
  </tbody></table></div></section>`};
}
Q.act('fmea-new', () => Q.modal({title: L('تحليل FMEA جديد', 'New FMEA'), body: `<div class="fgrid">${Q.f.text('title', L('العملية المحللة', 'Process analysed'), '', {req: true, w: true, ph: L('مثال: إعطاء الأنسولين في الأقسام', 'e.g. insulin administration on wards')})}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), Q.me.deptId)}${Q.f.area('steps', L('خطوات العملية (خطوة في كل سطر)', 'Process steps (one per line)'), '', {req: true, rows: 5})}</div>`,
  onSubmit: d => { const f = {id: nextId('fmeas', 'FMEA'), kind: 'fmea', title: {ar: d.title, en: d.title}, deptId: d.deptId, status: 'draft', createdAt: Q.iso(now()), createdBy: Q.me.id, steps: String(d.steps).split('\n').map(s => s.trim()).filter(Boolean).map(s => ({id: Q.uid('st'), text: s, modes: []}))};
    if (!f.steps.length) throw new Error(L('أضف خطوة واحدة على الأقل.', 'Add at least one step.')); Q.db.put('fmeas', f); Q.go('#/risks/fmea/' + f.id); }}));
function fmeaDetail(id) {
  const f = Q.db.get('fmeas', id); if (!f) return notFound(L('التحليل غير موجود.', 'Analysis not found.'));
  const ed = Q.can('risk.edit') && f.status !== 'approved', th = Q.S().rpnThreshold;
  const ms = f.steps.flatMap(s => s.modes.map(m => Object.assign({step: s}, m)));
  return {title: `<span class="ltr">${f.id}</span>`, html: `
  <nav class="crumbs"><a href="#/risks">${L('سجل المخاطر', 'Risk register')}</a>${ic('chev', 'sm flip')}<a href="#/risks/fmea">FMEA</a>${ic('chev', 'sm flip')}<span class="ltr">${f.id}</span></nav>
  <div class="page-head"><div><div class="row"><span class="chip ${f.status === 'approved' ? 'ok' : 'mute'}">${f.status === 'approved' ? L('معتمد', 'Approved') : L('مسودة', 'Draft')}</span><span class="chip mute">${Q.dname(f.deptId)}</span></div><h2 style="margin-top:8px">${esc(T(f.title))}</h2><p>${L(`${ms.length} نمط فشل · ${ms.filter(m => Q.rpn(m) > th).length} فوق الحد ${th}`, `${ms.length} failure modes · ${ms.filter(m => Q.rpn(m) > th).length} above threshold ${th}`)}</p></div>
    <div class="row">${ed ? `<button class="btn btn-s" data-act="fmea-mode" data-id="${f.id}">${ic('plus')}${L('نمط فشل', 'Failure mode')}</button>${Q.can('capa.verify') ? `<button class="btn btn-p" data-act="fmea-approve" data-id="${f.id}">${ic('check')}${L('اعتماد وفتح الإجراءات', 'Approve & open actions')}</button>` : ''}` : ''}</div></div>
  <section class="card flush"><div class="tbl-wrap"><table class="fmea"><thead><tr><th>${L('الخطوة', 'Step')}</th><th>${L('نمط الفشل', 'Failure mode')}</th><th class="hide-m">${L('الأثر', 'Effect')}</th><th class="hide-m">${L('السبب', 'Cause')}</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>${L('الإجراء', 'Action')}</th></tr></thead><tbody>
    ${f.steps.map((s, si) => s.modes.length ? s.modes.map((m, mi) => { const c = Q.capaFor('fmea', f.id, x => x.modeId === m.id)[0]; return `<tr>${mi === 0 ? `<td rowspan="${s.modes.length}"><b>${si + 1}.</b> ${esc(s.text)}</td>` : ''}<td>${esc(m.mode)}</td><td class="hide-m">${esc(m.effect || '')}</td><td class="hide-m">${esc(m.cause || '')}</td><td class="num">${m.s}</td><td class="num">${m.o}</td><td class="num">${m.d}</td><td>${rpnChip(Q.rpn(m))}</td><td>${c ? `<a class="chip info ltr" href="#/capa/${c.id}">${c.id}</a>` : Q.rpn(m) > th ? `<span class="muted">${f.status === 'approved' ? '—' : L('يُفتح عند الاعتماد', 'opens on approval')}</span>` : ''}</td></tr>`; }).join('') : `<tr><td><b>${si + 1}.</b> ${esc(s.text)}</td><td colspan="8" class="muted">${L('لم تُحدد أنماط فشل', 'No failure modes yet')}</td></tr>`).join('')}
  </tbody></table></div></section>`};
}
Q.act('fmea-mode', el => { const f = Q.db.get('fmeas', el.dataset.id);
  Q.modal({title: L('نمط فشل', 'Failure mode'), wide: true, body: `<div class="fgrid">${Q.f.sel('step', L('الخطوة', 'Step'), f.steps.map((s, i) => [s.id, `${i + 1}. ${s.text}`]), f.steps[0].id, {w: true})}${Q.f.text('mode', L('نمط الفشل', 'Failure mode'), '', {req: true, w: true})}${Q.f.text('effect', L('الأثر', 'Effect'), '')}${Q.f.text('cause', L('السبب', 'Cause'), '')}
    ${Q.f.sel('s', L('الشدة S (1–10)', 'Severity S (1–10)'), Array.from({length: 10}, (_, i) => [i + 1, String(i + 1)]), 5)}${Q.f.sel('o', L('الحدوث O (1–10)', 'Occurrence O (1–10)'), Array.from({length: 10}, (_, i) => [i + 1, String(i + 1)]), 5)}${Q.f.sel('d', L('الاكتشاف D (1–10، 10 = صعب)', 'Detection D (1–10, 10 = hard)'), Array.from({length: 10}, (_, i) => [i + 1, String(i + 1)]), 5)}</div>`,
    onSubmit: d => { f.steps.find(s => s.id === d.step).modes.push({id: Q.uid('fm'), mode: d.mode, effect: d.effect, cause: d.cause, s: +d.s, o: +d.o, d: +d.d}); Q.db.put('fmeas', f); Q.render(); }}); });
Q.act('fmea-approve', async el => { const f = Q.db.get('fmeas', el.dataset.id), th = Q.S().rpnThreshold;
  const hi = f.steps.flatMap(s => s.modes.map(m => ({s, m}))).filter(({m}) => Q.rpn(m) > th);
  if (!f.steps.some(s => s.modes.length)) return Q.toast(L('أضف أنماط الفشل أولًا.', 'Add failure modes first.'), 'err');
  if (!await Q.confirm(L(`سيُعتمد التحليل ويُفتح ${hi.length} إجراء للأنماط فوق ${th}.`, `The analysis will be approved and ${hi.length} action(s) opened for modes above ${th}.`), {ok: L('اعتماد', 'Approve')})) return;
  hi.forEach(({s, m}) => { if (Q.capaFor('fmea', f.id, x => x.modeId === m.id).length) return; Q.newCapa({title: `${T(f.title)} · ${s.text}: ${m.mode} (RPN ${Q.rpn(m)})`, source: 'risk', ownerId: (Q.dept(f.deptId) || {}).headId || Q.me.id, deptId: f.deptId, dueDays: 45, refKind: 'fmea', refId: f.id, extra: {modeId: m.id, kind: 'preventive'}}); });
  f.status = 'approved'; f.approvedAt = Q.iso(now()); f.approvedBy = Q.me.id; Q.db.put('fmeas', f); Q.audit('fmea', f.id, 'fmea_approved'); Q.render(); Q.toast(L(`اعتُمد وفُتح ${hi.length} إجراء`, `Approved; ${hi.length} action(s) opened`)); });

/* ======================================================================
   SURVEYS: PSI-05 safety culture (dimensions, anonymous, vs previous year) · PEX-01 patient satisfaction (public link / QR, by unit)
   ====================================================================== */
const SV_KIND = {culture: ['ثقافة سلامة المرضى', 'Patient safety culture'], patient: ['رضا المرضى', 'Patient satisfaction']};
const VISIT = {inpatient: ['تنويم', 'Inpatient'], outpatient: ['عيادات', 'Outpatient'], emergency: ['طوارئ', 'Emergency']};
const LIKERT = [[1, ['لا أوافق بشدة', 'Strongly disagree']], [2, ['لا أوافق', 'Disagree']], [3, ['محايد', 'Neutral']], [4, ['أوافق', 'Agree']], [5, ['أوافق بشدة', 'Strongly agree']]];
const STARS = [[1, ['سيئ جدًا', 'Very poor']], [2, ['سيئ', 'Poor']], [3, ['مقبول', 'Fair']], [4, ['جيد', 'Good']], [5, ['ممتاز', 'Excellent']]];
const respOf = s => Q.db.all('responses').filter(r => r.refId === s.id);
/* culture: % positive per dimension (agree / strongly agree; reversed for negatively worded items) */
Q.cultureDims = s => { const rs = respOf(s); return s.dimensions.map(dm => { let pos = 0, n = 0;
  rs.forEach(r => dm.items.forEach(it => { const v = (r.answers || {})[it.id]; if (!v) return; n++; if (it.neg ? v <= 2 : v >= 4) pos++; })); return {id: dm.id, name: dm.name, pct: pct(pos, n), n}; }); };
Q.prevCulture = s => Q.db.all('surveys').filter(x => x.kind === 'culture' && x.id !== s.id && (x.year || 0) < (s.year || 0)).sort((a, b) => b.year - a.year)[0] || null;
Q.lowDims = s => s.status === 'closed' || respOf(s).length >= 10 ? Q.cultureDims(s).filter(d => d.pct != null && d.pct < Q.S().cultureLowPct) : [];
/* patient: response score = mean of rated items; low score triggers follow-up */
Q.respScore = r => { const v = Object.values(r.answers || {}).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
Q.respLow = r => { const s = Q.respScore(r); return s != null && s <= Q.S().patientLowScore; };
Q.patientByUnit = s => { const rs = respOf(s), units = [...new Set(rs.map(r => r.deptId))]; return units.map(u => { const list = rs.filter(r => r.deptId === u), sc = list.map(Q.respScore).filter(v => v != null);
  return {deptId: u, n: list.length, avg: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null, sat: pct(sc.filter(v => v >= 4).length, sc.length), low: list.filter(Q.respLow).length, open: list.filter(r => Q.respLow(r) && !r.followUp).length}; }).sort((a, b) => (a.avg || 0) - (b.avg || 0)); };
const surveyUrl = (s, deptId) => `${location.origin}${location.pathname}#/s/${encodeURIComponent(s.id)}${deptId ? '?u=' + deptId : ''}`;

Q.views.surveys = {perm: 'survey.view', render(parts) {
  if (parts[0]) return surveyDetail(parts[0]);
  const all = Q.db.all('surveys').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return {title: L('الاستبيانات', 'Surveys'), html: `
  <div class="page-head"><div><h2>${L('استبيانات ثقافة السلامة ورضا المرضى', 'Safety culture & patient satisfaction surveys')}</h2><p>${L('إجابات مجهولة الهوية · تُقارن ثقافة السلامة بالعام السابق · رضا المرضى حسب الوحدة مع متابعة التقييمات المنخفضة', 'Anonymous answers · safety culture compared with last year · patient satisfaction by unit with follow-up of low scores')}</p></div>${Q.can('survey.manage') ? `<button class="btn btn-p" data-act="sv-new">${ic('plus')}${L('استبيان جديد', 'New survey')}</button>` : ''}</div>
  <div class="std-grid">${all.map(s => { const rs = respOf(s), low = s.kind === 'culture' ? Q.lowDims(s).length : rs.filter(r => Q.respLow(r) && !r.followUp).length;
    const head = s.kind === 'culture' ? (() => { const d = Q.cultureDims(s).filter(x => x.pct != null); return d.length ? Math.round(d.reduce((a, x) => a + x.pct, 0) / d.length) + '%' : '—'; })() : (() => { const sc = rs.map(Q.respScore).filter(v => v != null); return sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1) + ' / 5' : '—'; })();
    return `<a class="card std" href="#/surveys/${s.id}"><div class="row"><span class="code">${T(SV_KIND[s.kind])}${s.year ? ' · ' + s.year : ''}</span><span class="chip ${s.status === 'open' ? 'info' : 'mute'}">${s.status === 'open' ? L('مفتوح', 'Open') : L('مغلق', 'Closed')}</span></div><h3>${esc(T(s.title))}</h3>
      <div class="kpi-val">${head}<small>${L(`${rs.length} استجابة`, `${rs.length} responses`)}</small></div>${low ? `<p class="c-crit">${s.kind === 'culture' ? L(`${low} أبعاد منخفضة تحتاج خطة تحسين`, `${low} low dimension(s) need an improvement plan`) : L(`${low} تقييمات منخفضة بانتظار المتابعة`, `${low} low score(s) awaiting follow-up`)}</p>` : ''}</a>`; }).join('') || Q.empty(L('لا توجد استبيانات.', 'No surveys.'), 'message')}</div>`};
}};
function surveyDetail(id) {
  const s = Q.db.get('surveys', id); if (!s) return notFound(L('الاستبيان غير موجود.', 'Survey not found.'));
  const rs = respOf(s), mg = Q.can('survey.manage');
  const head = `<nav class="crumbs"><a href="#/surveys">${L('الاستبيانات', 'Surveys')}</a>${ic('chev', 'sm flip')}<span>${esc(T(s.title))}</span></nav>
    <div class="page-head"><div><div class="row"><span class="chip info">${T(SV_KIND[s.kind])}</span><span class="chip ${s.status === 'open' ? 'ok' : 'mute'}">${s.status === 'open' ? L('مفتوح للاستجابة', 'Open for responses') : L('مغلق', 'Closed')}</span></div><h2 style="margin-top:8px">${esc(T(s.title))}</h2><p>${L(`${rs.length} استجابة مجهولة الهوية`, `${rs.length} anonymous responses`)}</p></div>
    <div class="row">${mg ? `<button class="btn btn-s" data-act="sv-toggle" data-id="${s.id}">${s.status === 'open' ? L('إغلاق الاستبيان', 'Close survey') : L('إعادة فتح', 'Reopen')}</button>` : ''}<a class="btn btn-p" href="#/s/${s.id}" target="_blank" rel="noopener">${ic('send')}${L('فتح رابط الاستجابة', 'Open response link')}</a></div></div>
    <section class="card share" style="margin-bottom:16px"><div class="card-b row between"><div><b>${L('رابط ورمز QR للمشاركة', 'Share link & QR code')}</b><p class="muted ltr" style="word-break:break-all">${esc(surveyUrl(s))}</p><p class="hint">${s.kind === 'patient' ? L('أضف ?u=رمز القسم لربط الإجابة بالوحدة، مثل ', 'Add ?u=<unit> to tag the unit, e.g. ') + `<span class="ltr">?u=er</span>` : L('يُوزع على الموظفين؛ لا يُسجل اسم المستجيب.', 'Share with staff; the respondent is never recorded.')}</p></div><div data-qr="${esc(surveyUrl(s))}" class="qr"></div></div></section>`;
  if (s.kind === 'culture') {
    const dims = Q.cultureDims(s), prev = Q.prevCulture(s), pd = prev ? Q.cultureDims(prev) : [], low = Q.lowDims(s);
    return {title: esc(T(s.title)), mount: qrMount, html: head + `
    ${low.length ? `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L(`${low.length} أبعاد أقل من ${Q.S().cultureLowPct}% إيجابي: تتطلب خطة تحسين`, `${low.length} dimension(s) below ${Q.S().cultureLowPct}% positive: improvement plan required`)}</b><p>${low.map(d => esc(T(d.name))).join('، ')}</p></div></div>` : ''}
    <section class="card flush"><div class="card-h"><div><h3>${L('نتائج الأبعاد', 'Dimension results')}</h3><p>${prev ? L(`مقارنة مع ${prev.year}`, `Compared with ${prev.year}`) : L('لا يوجد استبيان سابق للمقارنة', 'No previous survey to compare')}</p></div></div><div class="tbl-wrap"><table><thead><tr><th>${L('البعد', 'Dimension')}</th><th>${L('% إيجابي', '% positive')}</th><th>${prev ? prev.year : ''}</th><th>${L('التغير', 'Change')}</th><th>${L('خطة التحسين', 'Improvement plan')}</th></tr></thead><tbody>
      ${dims.map(d => { const p = pd.find(x => x.id === d.id), ch = p && p.pct != null && d.pct != null ? d.pct - p.pct : null, c = Q.capaFor('survey', s.id, x => x.dimId === d.id)[0], isLow = low.some(x => x.id === d.id);
        return `<tr><td>${esc(T(d.name))}<span class="t2">${L(`${d.n} إجابة`, `${d.n} answers`)}</span></td><td style="min-width:140px"><b class="c-${clsOf(d.pct, 75, Q.S().cultureLowPct)}">${d.pct ?? '—'}%</b>${bar(d.pct, 75, Q.S().cultureLowPct)}</td><td class="num">${p && p.pct != null ? p.pct + '%' : '—'}</td><td class="num ${ch == null ? '' : ch >= 0 ? 'c-ok' : 'c-crit'}">${ch == null ? '—' : (ch > 0 ? '+' : '') + ch}</td>
          <td>${c ? `<a class="chip info ltr" href="#/capa/${c.id}">${c.id}</a> ${Q.capaChip(c)}` : isLow ? (Q.can('capa.create') ? `<button class="btn btn-d sm" data-act="capa-new" data-refkind="survey" data-refid="${s.id}" data-dim="${d.id}" data-src="audit" data-title="${esc(L('خطة تحسين ثقافة السلامة: ', 'Safety culture improvement plan: ') + T(d.name))}">${ic('plus', 'sm')}${L('خطة تحسين', 'Improvement plan')}</button>` : `<span class="chip crit">${L('مطلوبة', 'Required')}</span>`) : ''}</td></tr>`; }).join('')}
    </tbody></table></div></section>`};
  }
  const units = Q.patientByUnit(s), lows = rs.filter(Q.respLow).sort((a, b) => (a.followUp ? 1 : 0) - (b.followUp ? 1 : 0) || new Date(b.at) - new Date(a.at));
  const sc = rs.map(Q.respScore).filter(v => v != null), avg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
  return {title: esc(T(s.title)), mount: qrMount, html: head + `
  <div class="stats">${Q.stat(L('متوسط الرضا', 'Average satisfaction'), avg != null ? `${avg.toFixed(2)}<small>/ 5</small>` : '—', L(`${pct(sc.filter(v => v >= 4).length, sc.length) ?? '—'}% راضون (4 فأعلى)`, `${pct(sc.filter(v => v >= 4).length, sc.length) ?? '—'}% satisfied (4+)`))}${Q.stat(L('استجابات', 'Responses'), rs.length, L('آخر 90 يومًا', 'last 90 days'))}${Q.stat(L('تقييمات منخفضة', 'Low scores'), lows.length, L(`${lows.filter(r => !r.followUp).length} بانتظار المتابعة`, `${lows.filter(r => !r.followUp).length} awaiting follow-up`), {cls: lows.some(r => !r.followUp) ? 'up-bad' : ''})}</div>
  <section class="card chapters" style="margin-bottom:16px">${units.map(u => `<div><b>${Q.dname(u.deptId)}</b><strong class="c-${clsOf(u.avg != null ? u.avg * 20 : null, 80, 65)}">${u.avg != null ? u.avg.toFixed(1) : '—'}</strong>${bar(u.avg != null ? u.avg * 20 : null, 80, 65)}<small class="muted">${L(`${u.n} استجابة · ${u.sat ?? '—'}% راضون`, `${u.n} responses · ${u.sat ?? '—'}% satisfied`)}</small></div>`).join('')}</section>
  <section class="card flush"><div class="card-h"><div><h3>${L('التقييمات المنخفضة والمتابعة', 'Low scores & follow-up')}</h3><p>${L(`متوسط ${Q.S().patientLowScore} فأقل يستوجب متابعة من الوحدة`, `Average ${Q.S().patientLowScore} or below requires follow-up by the unit`)}</p></div></div><div class="tbl-wrap"><table><tbody>
    ${lows.map(r => `<tr><td class="nowrap">${Q.fDate(r.at, false)}<span class="t2">${Q.dshort(r.deptId)} · ${T(VISIT[r.visitType] || VISIT.inpatient)}</span></td><td><b class="c-crit">${Q.respScore(r).toFixed(1)}</b></td><td style="white-space:normal">${esc(r.comment || '—')}${r.contact ? `<span class="t2 ltr">${esc(r.contact)}</span>` : ''}</td><td>${r.followUp ? `<span class="chip ok">${L('تمت المتابعة', 'Followed up')}</span><span class="t2">${esc(r.followUp.note)}</span>` : `<button class="btn btn-s sm" data-act="sv-follow" data-id="${r.id}">${L('توثيق المتابعة', 'Record follow-up')}</button>`}</td></tr>`).join('') || `<tr><td>${Q.empty(L('لا توجد تقييمات منخفضة.', 'No low scores.'), 'check')}</td></tr>`}
  </tbody></table></div></section>`};
}
/* QR: drawn by the qrcodejs library when the network allows it; the link itself always works */
function qrMount(root) { const box = $('[data-qr]', root); if (!box) return;
  const draw = () => { try { box.innerHTML = ''; new window.QRCode(box, {text: box.dataset.qr, width: 112, height: 112}); } catch (e) { box.textContent = ''; } };
  if (window.QRCode) return draw();
  const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = draw; sc.onerror = () => { box.innerHTML = `<small class="muted">${L('تعذّر تحميل رمز QR؛ استخدم الرابط', 'QR unavailable offline; use the link')}</small>`; }; document.head.appendChild(sc); }
Q.act('sv-toggle', el => { const s = Q.db.get('surveys', el.dataset.id); s.status = s.status === 'open' ? 'closed' : 'open'; Q.db.put('surveys', s); Q.audit('survey', s.id, s.status === 'open' ? 'survey_opened' : 'survey_closed'); Q.render(); });
Q.act('sv-follow', el => { const r = Q.db.get('responses', el.dataset.id); Q.modal({title: L('متابعة تقييم منخفض', 'Follow up a low score'), body: `<div class="fgrid one">${Q.f.area('note', L('ما الذي تم؟', 'What was done?'), '', {req: true, rows: 3, ph: L('مثال: تواصلت الوحدة مع المريض واعتذرت وعالجت سبب التأخير', 'e.g. the unit called the patient, apologised and fixed the delay')})}</div>`,
  onSubmit: d => { r.followUp = {by: Q.me.id, at: Q.iso(now()), note: d.note}; Q.db.put('responses', r); Q.audit('survey', r.refId, 'followup'); Q.render(); }}); });
Q.act('sv-new', () => Q.modal({title: L('استبيان جديد', 'New survey'), body: `<div class="fgrid">${Q.f.sel('kind', L('النوع', 'Type'), Object.entries(SV_KIND).map(([k, v]) => [k, T(v)]), 'patient')}${Q.f.text('title', L('العنوان', 'Title'), '', {req: true})}<p class="hint w">${L('يُنشأ بالبنود القياسية (أبعاد ثقافة السلامة أو بنود رضا المرضى) ويمكن تعديل العنوان لاحقًا.', 'Created with the standard items (safety culture dimensions or patient satisfaction items).')}</p></div>`,
  onSubmit: d => { const tpl = d.kind === 'culture' ? JSON.parse(JSON.stringify(CULTURE_TPL)) : null; const s = {id: nextId('surveys', d.kind === 'culture' ? 'SC' : 'PS'), kind: d.kind, title: {ar: d.title, en: d.title}, status: 'open', year: new Date().getFullYear(), createdAt: Q.iso(now()), createdBy: Q.me.id};
    if (tpl) s.dimensions = tpl; else s.items = JSON.parse(JSON.stringify(PATIENT_TPL)); Q.db.put('surveys', s); Q.go('#/surveys/' + s.id); }}));
/* public response page: no sign-in, nothing identifies the respondent */
/* a patient's browser never loads the platform database: with the server it fetches only this survey (Q.publicBoot) */
Q.publicBoot = async () => { if (!Q.API) return false; const id = Q.parseHash().parts[1];
  try { const r = await fetch(`api/public/survey/${encodeURIComponent(id)}`, {cache: 'no-store'}); Q._pub = r.ok ? Object.assign(await r.json(), {remote: true}) : {survey: null, depts: [], remote: true}; } catch (e) { return false; }
  Q.render(); return true; };
const pubDepts = () => Q._pub ? Q._pub.depts.map(d => [d.id, T(d.name)]) : Q.deptOpts(d => !['qps', 'biomed', 'it'].includes(d.id));
Q.publicSurvey = (parts, q) => {
  const s = Q._pub ? Q._pub.survey : Q.db.get('surveys', parts[1]), fac = Q._pub ? Q._pub.facility : Q.S().facility;
  const shell = inner => `<div class="pub"><header class="pub-h"><span class="logo-tile"><svg aria-hidden="true"><use href="#logo-mark"/></svg></span><div><b>${esc(T(fac) || L('المنشأة الصحية', 'Healthcare facility'))}</b><small>${L('سلامة · Q-MedOps', 'Salamah · Q-MedOps')}</small></div><button class="lang" data-act="lang">${ic('globe', 'sm')}${L('English', 'العربية')}</button></header><main class="pub-b">${inner}</main></div>`;
  if (Q._svDone === parts[1]) return shell(`<div class="empty">${ic('check', 'lg')}<h2>${L('شكرًا لك', 'Thank you')}</h2><p>${L('وصلت إجابتك. رأيك يساعدنا على التحسين.', 'Your answers were received. They help us improve.')}</p></div>`);
  if (!s) return shell(Q.empty(L('هذا الرابط غير صالح أو أن الاستبيان مغلق.', 'This link is not valid or the survey is closed.'), 'search'));
  if (s.status !== 'open') return shell(Q.empty(L('هذا الاستبيان مغلق حاليًا. شكرًا لاهتمامك.', 'This survey is closed. Thank you for your interest.'), 'message'));
  const items = s.kind === 'culture' ? s.dimensions.flatMap(dm => dm.items.map(it => Object.assign({dim: dm.name}, it))) : s.items;
  const opts = s.kind === 'culture' ? LIKERT : STARS;
  return shell(`<h1>${esc(T(s.title))}</h1><p class="muted">${L('إجاباتك مجهولة الهوية ولا يُسجل اسمك.', 'Your answers are anonymous; your name is not recorded.')}</p>
    <form data-pub="${s.id}" class="pub-f">
      ${s.kind === 'patient' ? `<div class="fgrid">${Q.f.sel('deptId', L('الوحدة التي زرتها', 'Unit you visited'), pubDepts(), q.u || '', {req: true, empty: L('اختر', 'Select')})}${Q.f.sel('visitType', L('نوع الزيارة', 'Visit type'), Object.entries(VISIT).map(([k, v]) => [k, T(v)]), 'outpatient')}</div>` : ''}
      <ol class="pub-q">${items.map(it => `<li><p>${esc(T(it.text))}</p><div class="pub-o">${opts.map(([v, t]) => `<label><input type="radio" name="q-${it.id}" value="${v}" required><span>${v}<small>${T(t)}</small></span></label>`).join('')}</div></li>`).join('')}</ol>
      ${Q.f.area('comment', L('ملاحظات أو اقتراحات', 'Comments or suggestions'), '', {rows: 3})}
      ${s.kind === 'patient' ? Q.f.text('contact', L('رقم للتواصل إن رغبت أن نتصل بك', 'Phone, if you would like us to call you'), '', {ltr: true, type: 'tel', opt: L('(اختياري)', '(optional)')}) : ''}
      <div class="form-actions"><span class="err" data-err></span><button class="btn btn-p btn-lg" type="submit">${ic('send')}${L('إرسال', 'Submit')}</button></div></form>`);
};
Q.mountPublic = root => { const f = $('form[data-pub]', root); if (!f) return;
  f.addEventListener('submit', async e => { e.preventDefault(); const s = Q._pub ? Q._pub.survey : Q.db.get('surveys', f.dataset.pub), d = Q.formData(f), ans = {};
    const items = s.kind === 'culture' ? s.dimensions.flatMap(dm => dm.items) : s.items; items.forEach(it => { if (d['q-' + it.id]) ans[it.id] = +d['q-' + it.id]; });
    if (Object.keys(ans).length < items.length || (s.kind === 'patient' && !d.deptId)) { $('[data-err]', f).textContent = L('أجب على كل الأسئلة من فضلك.', 'Please answer every question.'); return; }
    if (Q._pub && Q._pub.remote) { const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try { const r = await fetch('api/public/response', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({surveyId: s.id, deptId: d.deptId, visitType: d.visitType, answers: ans, comment: d.comment || '', contact: d.contact || ''})});
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status); } catch (err) { btn.disabled = false; $('[data-err]', f).textContent = L('تعذّر الإرسال، حاول مرة أخرى.', 'Could not send; please try again.'); return; } }
    else Q.db.put('responses', {id: Q.uid('rs'), refId: s.id, kind: s.kind, deptId: d.deptId || null, visitType: d.visitType || null, answers: ans, comment: d.comment || '', contact: d.contact || '', at: Q.iso(now())});
    Q._svDone = s.id; window.scrollTo(0, 0); Q.render(); }); };
const CULTURE_TPL = [
  ['teamwork', 'العمل الجماعي داخل الوحدة', 'Teamwork within units', [['يدعم الموظفون بعضهم في هذه الوحدة', 'People support one another in this unit'], ['نعمل كفريق عند وجود عمل كثير', 'We work together as a team when there is a lot to do']]],
  ['response', 'الاستجابة غير العقابية للأخطاء', 'Non-punitive response to error', [['يشعر الموظفون أن أخطاءهم تُستخدم ضدهم', 'Staff feel their mistakes are held against them', 1], ['عند الإبلاغ عن حدث يُركز على المشكلة لا الشخص', 'When an event is reported, the focus is on the problem, not the person']]],
  ['comm', 'الانفتاح في التواصل', 'Communication openness', [['يتحدث الموظفون بحرية إذا رأوا ما قد يضر المريض', 'Staff speak up freely if they see something that may harm a patient'], ['نخاف من طرح الأسئلة عندما يبدو شيء غير صحيح', 'We are afraid to ask questions when something seems wrong', 1]]],
  ['feedback', 'التغذية الراجعة عن الأخطاء', 'Feedback about error', [['نُبلَّغ بالتغييرات التي تمت بناءً على البلاغات', 'We are told about changes made based on event reports'], ['نناقش طرق منع تكرار الأخطاء', 'We discuss ways to prevent errors from happening again']]],
  ['staffing', 'التوظيف وضغط العمل', 'Staffing & work pace', [['لدينا عدد كافٍ من الموظفين للتعامل مع العمل', 'We have enough staff to handle the workload'], ['نعمل بسرعة كبيرة تؤثر على السلامة', 'We work in crisis mode, trying to do too much too quickly', 1]]],
  ['mgmt', 'دعم الإدارة لسلامة المرضى', 'Management support for safety', [['تجعل الإدارة سلامة المرضى أولوية', 'Management makes patient safety a top priority'], ['تهتم الإدارة بالسلامة فقط بعد وقوع حدث', 'Management seems interested in safety only after an event', 1]]]
].map(([id, ar, en, items]) => ({id, name: {ar, en}, items: items.map(([a, e, neg], i) => ({id: `${id}${i + 1}`, text: {ar: a, en: e}, neg: !!neg}))}));
const PATIENT_TPL = [['سهولة الوصول والمواعيد', 'Access and appointments'], ['تعامل الأطباء واحترامهم', 'Doctors were courteous and respectful'], ['تعامل التمريض واحترامهم', 'Nurses were courteous and respectful'], ['وضوح الشرح عن الحالة والعلاج', 'Clear explanation of condition and treatment'], ['النظافة والراحة', 'Cleanliness and comfort'], ['وقت الانتظار', 'Waiting time']].map(([ar, en], i) => ({id: 'p' + (i + 1), text: {ar, en}}));

/* ======================================================================
   GOV-01 COMMITTEES (quorum, minutes, decisions → actions) · GOV-02 ACTION TRACKER (overdue %, escalate to chair)
   ====================================================================== */
Q.cmMeetings = c => Q.db.all('meetings').filter(m => m.refId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date));
Q.cmActions = c => Q.db.all('capa').filter(x => x.refKind === 'meeting' && x.status !== 'cancelled' && Q.cmMeetings(c).some(m => m.id === x.refId));
Q.cmNextDue = c => { const last = Q.cmMeetings(c).find(m => m.status === 'held'); const base = last ? new Date(last.date) : new Date(c.createdAt || now()); base.setMonth(base.getMonth() + (c.freqMonths || 1)); return base; };
Q.cmOverdue = c => c.active !== false && Q.cmNextDue(c) < now() && !Q.cmMeetings(c).some(m => m.status === 'planned' && new Date(m.date) >= now());
Q.quorumMet = (c, attendees) => (attendees || []).filter(id => (c.members || []).includes(id)).length >= (c.quorum || Math.ceil((c.members || []).length / 2));
const cmActionStats = c => { const a = Q.cmActions(c), act = a.filter(x => ['open', 'progress', 'draft'].includes(x.status)), late = act.filter(x => new Date(x.due) < now()); return {all: a.length, open: act.length, late: late.length, latePct: pct(late.length, act.length)}; };

Q.views.committees = {perm: 'committee.view', render(parts) {
  if (parts[0] === 'meeting') return meetingDetail(parts[1]);
  if (parts[0]) return committeeDetail(parts[0]);
  const all = Q.db.all('committees').filter(c => c.active !== false);
  return {title: L('اللجان', 'Committees'), html: `
  <div class="page-head"><div><h2>${L('اللجان ومتابعة القرارات', 'Committees & decision tracking')}</h2><p>${L('اجتماع ← تحقق النصاب ← محضر ← قرارات تتحول لإجراءات بمسؤول وموعد ← المتأخر يُصعّد للرئيس', 'Meeting → quorum check → minutes → decisions become actions with owner and date → overdue escalates to the chair')}</p></div>${Q.can('committee.manage') ? `<button class="btn btn-p" data-act="cm-new">${ic('plus')}${L('لجنة جديدة', 'New committee')}</button>` : ''}</div>
  <section class="card flush"><div class="tbl-wrap"><table><thead><tr><th>${L('اللجنة', 'Committee')}</th><th class="hide-m">${L('الرئيس', 'Chair')}</th><th>${L('آخر اجتماع', 'Last meeting')}</th><th>${L('الاجتماع القادم', 'Next due')}</th><th>${L('الإجراءات المفتوحة', 'Open actions')}</th><th>${L('المتأخر', 'Overdue')}</th></tr></thead><tbody>
  ${all.map(c => { const last = Q.cmMeetings(c).find(m => m.status === 'held'), st = cmActionStats(c), nx = Q.cmNextDue(c); return `<tr class="click" data-href="#/committees/${c.id}"><td><span class="t1">${esc(T(c.name))}</span><span class="t2">${L(`كل ${c.freqMonths === 3 ? '3 أشهر' : 'شهر'} · النصاب ${c.quorum}/${(c.members || []).length}`, `every ${c.freqMonths === 3 ? '3 months' : 'month'} · quorum ${c.quorum}/${(c.members || []).length}`)}</span></td><td class="hide-m">${esc(Q.uname(c.chairId))}</td>
    <td class="nowrap">${last ? `${Q.fDate(last.date, false)}${last.quorumMet ? '' : ` <span class="chip crit">${L('دون نصاب', 'No quorum')}</span>`}` : '—'}</td><td class="nowrap"><span class="due ${Q.cmOverdue(c) ? 'late' : ''}">${Q.fDate(nx, false)}</span></td><td class="num">${st.open}</td><td>${st.late ? `<span class="chip crit">${st.late} · ${st.latePct}%</span>` : '<span class="chip ok">0</span>'}</td></tr>`; }).join('') || `<tr><td colspan="6">${Q.empty(L('لا توجد لجان.', 'No committees.'), 'users')}</td></tr>`}
  </tbody></table></div></section>`};
}};
function committeeDetail(id) {
  const c = Q.db.get('committees', id); if (!c) return notFound(L('اللجنة غير موجودة.', 'Committee not found.'));
  const ms = Q.cmMeetings(c), st = cmActionStats(c), mg = Q.can('committee.manage') || c.secretaryId === Q.me.id || c.chairId === Q.me.id;
  return {title: esc(T(c.name)), html: `
  <nav class="crumbs"><a href="#/committees">${L('اللجان', 'Committees')}</a>${ic('chev', 'sm flip')}<span>${esc(T(c.name))}</span></nav>
  <div class="page-head"><div><h2>${esc(T(c.name))}</h2><p>${L('الرئيس', 'Chair')}: ${esc(Q.uname(c.chairId))} · ${L('المقرر', 'Secretary')}: ${esc(Q.uname(c.secretaryId))} · ${L('النصاب', 'Quorum')} ${c.quorum}/${(c.members || []).length}</p></div>${mg ? `<button class="btn btn-p" data-act="mt-new" data-id="${c.id}">${ic('plus')}${L('توثيق اجتماع', 'Record meeting')}</button>` : ''}</div>
  ${Q.cmOverdue(c) ? `<div class="banner"><div class="ico">${ic('clock')}</div><div><b>${L('تأخر انعقاد الاجتماع الدوري', 'The periodic meeting is overdue')}</b><p>${L('كان مستحقًا في', 'It was due on')} ${Q.fDate(Q.cmNextDue(c), false)}</p></div></div>` : ''}
  <div class="stats c3">${Q.stat(L('اجتماعات هذا العام', 'Meetings this year'), ms.filter(m => m.status === 'held' && new Date(m.date).getFullYear() === now().getFullYear()).length, L(`${ms.filter(m => m.status === 'held' && !m.quorumMet).length} دون نصاب`, `${ms.filter(m => m.status === 'held' && !m.quorumMet).length} without quorum`))}${Q.stat(L('إجراءات القرارات المفتوحة', 'Open decision actions'), st.open, L(`من ${st.all} إجراء`, `of ${st.all} actions`))}${Q.stat(L('نسبة المتأخر', 'Overdue %'), st.latePct != null ? `${st.latePct}<small>%</small>` : '—', st.late ? L('مُصعّدة للرئيس', 'Escalated to the chair') : '', {cls: st.late ? 'up-bad' : ''})}</div>
  <section class="card flush" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الاجتماعات', 'Meetings')}</h3></div></div><div class="tbl-wrap"><table><tbody>
    ${ms.map(m => `<tr class="click" data-href="#/committees/meeting/${m.id}"><td class="nowrap">${Q.fDate(m.date, false)}</td><td>${L(`${(m.attendees || []).length} حاضر`, `${(m.attendees || []).length} attended`)} ${m.quorumMet ? `<span class="chip ok">${L('النصاب مكتمل', 'Quorum met')}</span>` : `<span class="chip crit">${L('دون نصاب', 'No quorum')}</span>`}</td><td>${L(`${(m.decisions || []).length} قرارات`, `${(m.decisions || []).length} decisions`)}</td></tr>`).join('') || `<tr><td>${Q.empty(L('لا توجد اجتماعات.', 'No meetings.'), 'users')}</td></tr>`}
  </tbody></table></div></section>
  <section class="card flush"><div class="card-h"><div><h3>${L('متابعة إجراءات القرارات', 'Decision action tracker')}</h3></div></div>${capaTable(Q.cmActions(c)) || `<div class="card-b"><p class="muted">—</p></div>`}</section>`};
}
function meetingDetail(id) {
  const m = Q.db.get('meetings', id); if (!m) return notFound(L('الاجتماع غير موجود.', 'Meeting not found.'));
  const c = Q.db.get('committees', m.refId), mg = Q.can('committee.manage') || c.secretaryId === Q.me.id || c.chairId === Q.me.id;
  return {title: Q.fDate(m.date, false), html: `
  <nav class="crumbs"><a href="#/committees">${L('اللجان', 'Committees')}</a>${ic('chev', 'sm flip')}<a href="#/committees/${c.id}">${esc(T(c.name))}</a>${ic('chev', 'sm flip')}<span>${Q.fDate(m.date, false)}</span></nav>
  <div class="page-head"><div><div class="row">${m.quorumMet ? `<span class="chip ok">${L('النصاب مكتمل', 'Quorum met')}</span>` : `<span class="chip crit">${L('دون نصاب: القرارات توصيات فقط', 'No quorum: decisions are recommendations only')}</span>`}</div><h2 style="margin-top:8px">${esc(T(c.name))} · ${Q.fDate(m.date, false)}</h2></div>${mg && m.quorumMet ? `<button class="btn btn-p" data-act="mt-decision" data-id="${m.id}">${ic('plus')}${L('قرار وإجراء', 'Decision & action')}</button>` : ''}</div>
  <div class="detail"><div class="detail-main">
    <section class="card" style="margin-bottom:16px"><div class="card-b"><div class="sec"><h4>${L('جدول الأعمال', 'Agenda')}</h4><p class="pre">${esc(m.agenda || '—')}</p></div><div class="sec"><h4>${L('المحضر', 'Minutes')}</h4><p class="pre">${esc(m.minutes || '—')}</p></div></div></section>
    <section class="card flush"><div class="card-h"><div><h3>${L('القرارات والإجراءات', 'Decisions & actions')}</h3></div></div>${capaTable(Q.capaFor('meeting', m.id)) || `<div class="card-b"><p class="muted">${L('لا توجد قرارات.', 'No decisions.')}</p></div>`}</section>
  </div><aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one"><div><dt>${L('الحضور', 'Attendees')}</dt><dd>${(m.attendees || []).map(Q.uname).map(esc).join('، ')}</dd></div><div><dt>${L('الغائبون', 'Absent')}</dt><dd>${(c.members || []).filter(x => !(m.attendees || []).includes(x)).map(Q.uname).map(esc).join('، ') || '—'}</dd></div></dl></div></section></aside></div>`};
}
Q.act('cm-new', () => Q.modal({title: L('لجنة جديدة', 'New committee'), wide: true, body: `<div class="fgrid">${Q.f.text('name', L('اسم اللجنة', 'Committee name'), '', {req: true, w: true})}${Q.f.sel('chairId', L('الرئيس', 'Chair'), staffOpts(), Q.me.id, {req: true})}${Q.f.sel('secretaryId', L('المقرر', 'Secretary'), staffOpts(), Q.me.id, {req: true})}${Q.f.multi('members', L('الأعضاء', 'Members'), staffOpts(), [Q.me.id])}${Q.f.text('quorum', L('النصاب (عدد الأعضاء)', 'Quorum (members)'), 3, {type: 'number', req: true, attrs: 'min="1"'})}${Q.f.sel('freqMonths', L('التكرار', 'Frequency'), [[1, L('شهريًا', 'Monthly')], [3, L('ربع سنوي', 'Quarterly')]], 1)}</div>`,
  onSubmit: d => { const mem = [].concat(d.members || []); if (+d.quorum > mem.length) throw new Error(L('النصاب أكبر من عدد الأعضاء.', 'Quorum exceeds the number of members.')); const c = {id: Q.uid('cm'), name: {ar: d.name, en: d.name}, chairId: d.chairId, secretaryId: d.secretaryId, members: mem, quorum: +d.quorum, freqMonths: +d.freqMonths, active: true, createdAt: Q.iso(now())}; Q.db.put('committees', c); Q.go('#/committees/' + c.id); }}));
Q.act('mt-new', el => { const c = Q.db.get('committees', el.dataset.id); Q.modal({title: L('توثيق اجتماع', 'Record meeting'), sub: esc(T(c.name)), wide: true, body: `<div class="fgrid">${Q.f.text('date', L('التاريخ', 'Date'), Q.toInput(now()), {type: 'datetime-local', req: true})}${Q.f.multi('attendees', L(`الحضور (النصاب ${c.quorum})`, `Attendees (quorum ${c.quorum})`), (c.members || []).map(id => [id, Q.uname(id)]), [])}${Q.f.area('agenda', L('جدول الأعمال', 'Agenda'), '', {rows: 3})}${Q.f.area('minutes', L('المحضر', 'Minutes'), '', {req: true, rows: 4})}</div>`,
  onSubmit: d => { const att = [].concat(d.attendees || []); const m = {id: nextId('meetings', 'MTG'), refId: c.id, date: Q.fromInput(d.date), attendees: att, agenda: d.agenda, minutes: d.minutes, status: 'held', quorumMet: Q.quorumMet(c, att), createdBy: Q.me.id};
    Q.db.put('meetings', m); Q.audit('committee', c.id, 'meeting_held', m.quorumMet ? 'quorum' : 'no quorum'); Q.go('#/committees/meeting/' + m.id); if (!m.quorumMet) Q.toast(L('لم يكتمل النصاب: لا تُعتمد قرارات في هذا الاجتماع', 'No quorum: no binding decisions in this meeting'), 'err'); }}); });
Q.act('mt-decision', el => { const m = Q.db.get('meetings', el.dataset.id), c = Q.db.get('committees', m.refId);
  Q.modal({title: L('قرار وإجراء', 'Decision & action'), body: `<div class="fgrid">${Q.f.area('text', L('القرار / الإجراء المطلوب', 'Decision / action required'), '', {req: true, rows: 2})}${Q.f.sel('ownerId', L('المسؤول', 'Owner'), staffOpts(), '', {req: true, empty: L('اختر', 'Select')})}${Q.f.text('due', L('الموعد', 'Due'), Q.toDateInput(Q.add(now(), 30 * DAY)), {type: 'date', req: true})}</div>`,
    onSubmit: d => { const x = Q.newCapa({title: `${T(c.name)}: ${d.text}`, source: 'audit', ownerId: d.ownerId, dueDays: Math.max(1, Math.round((new Date(Q.fromInput(d.due)) - now()) / DAY)), refKind: 'meeting', refId: m.id}); x.status = 'open'; Q.db.put('capa', x); (m.decisions = m.decisions || []).push({id: Q.uid('dc'), text: d.text, capaId: x.id}); Q.db.put('meetings', m); Q.audit('committee', c.id, 'decision', x.id); Q.render(); }}); });

/* ======================================================================
   GOV-05 EXTERNAL REPORTING LOG: every report owed to an authority, with its deadline and proof
   sentinel notices and SFDA device reports are pulled in automatically; others are logged by hand
   ====================================================================== */
const AUTH = {moh: ['وزارة الصحة', 'Ministry of Health'], sfda: ['الهيئة العامة للغذاء والدواء (SFDA)', 'SFDA'], cbahi: ['المركز السعودي لاعتماد المنشآت الصحية', 'CBAHI'], hesn: ['الصحة العامة (حصن)', 'Public health (HESN)'], civil: ['الدفاع المدني', 'Civil Defense'], other: ['أخرى', 'Other']};
Q.extRows = () => {
  const out = [];
  Q.db.all('incidents').filter(x => Q.isSentinel(x)).forEach(x => out.push({key: 'sen-' + x.id, authority: 'moh', event: L(`حدث جسيم ${x.id}`, `Sentinel event ${x.id}`) + ' · ' + T(x.title), link: '#/incidents/' + x.id, deadline: Q.add(x.occurredAt, Q.S().externalHours * Q.HOUR).toISOString(), submittedAt: x.external ? x.external.at : null, ref: x.external ? x.external.ref : '', auto: true}));
  Q.db.all('incidents').filter(x => x.sfda || Q.needsSFDA(x)).forEach(x => out.push({key: 'sfda-' + x.id, authority: 'sfda', event: L(`حادث جهاز ${x.deviceTag || x.id}`, `Device incident ${x.deviceTag || x.id}`) + ' · ' + T(x.title), link: '#/incidents/' + x.id, deadline: Q.sfdaDue(x).toISOString(), submittedAt: x.sfda ? x.sfda.at : null, ref: x.sfda ? x.sfda.ref : '', auto: true}));
  Q.db.all('extreports').forEach(e => out.push({key: e.id, id: e.id, authority: e.authority, event: T(e.event), link: e.incidentId ? '#/incidents/' + e.incidentId : null, deadline: e.deadline, submittedAt: e.submittedAt, ref: e.ref || '', proof: e.proof, auto: false}));
  return out.sort((a, b) => (!!a.submittedAt - !!b.submittedAt) || new Date(a.deadline) - new Date(b.deadline));
};
Q.extState = r => r.submittedAt ? (new Date(r.submittedAt) <= new Date(r.deadline) ? 'ok' : 'late') : new Date(r.deadline) < now() ? 'overdue' : 'pending';
const EXT_ST = {ok: ['قُدّم في الموعد', 'Submitted on time', 'ok'], late: ['قُدّم متأخرًا', 'Submitted late', 'med'], overdue: ['متأخر لم يُقدّم', 'Overdue, not submitted', 'crit'], pending: ['بانتظار التقديم', 'Pending', 'info']};
Q.views.external = {perm: 'ext.view', render() {
  const rows = Q.extRows(), y = rows.filter(r => new Date(r.deadline).getFullYear() === now().getFullYear());
  const sub = y.filter(r => r.submittedAt);
  return {title: L('سجل الإبلاغ الخارجي', 'External reporting log'), html: `
  <div class="page-head"><div><h2>${L('سجل الإبلاغ للجهات الخارجية', 'External reporting log')}</h2><p>${L('الجهة · الحدث · المهلة · إثبات التقديم · المتأخر يُصعّد لمدير الجودة', 'Authority · event · deadline · proof of submission · overdue escalates to the quality director')}</p></div>${Q.can('ext.edit') ? `<button class="btn btn-p" data-act="ext-new">${ic('plus')}${L('بلاغ خارجي', 'External report')}</button>` : ''}</div>
  <div class="stats c3">${Q.stat(L('متأخر لم يُقدّم', 'Overdue, not submitted'), rows.filter(r => Q.extState(r) === 'overdue').length, L('مانع للجاهزية', 'Readiness blocker'), {cls: rows.some(r => Q.extState(r) === 'overdue') ? 'up-bad' : ''})}${Q.stat(L('بانتظار التقديم', 'Pending'), rows.filter(r => Q.extState(r) === 'pending').length)}${Q.stat(L('قُدّم في الموعد هذا العام', 'On time this year'), sub.length ? `${pct(sub.filter(r => Q.extState(r) === 'ok').length, sub.length)}<small>%</small>` : '—', L(`${sub.length} بلاغ مقدم`, `${sub.length} submitted`))}</div>
  <section class="card flush"><div class="tbl-wrap"><table><thead><tr><th>${L('الجهة', 'Authority')}</th><th>${L('الحدث', 'Event')}</th><th>${L('المهلة', 'Deadline')}</th><th>${L('التقديم', 'Submitted')}</th><th>${L('الحالة', 'Status')}</th></tr></thead><tbody>
  ${rows.map(r => { const st = Q.extState(r); return `<tr><td>${T(AUTH[r.authority] || AUTH.other)}${r.auto ? `<span class="t2">${L('تلقائي من البلاغ', 'auto from report')}</span>` : ''}</td><td style="white-space:normal">${r.link && Q.canRoute(r.link) ? `<a href="${r.link}">${esc(r.event)}</a>` : esc(r.event)}</td><td class="nowrap">${Q.fDate(r.deadline)}${!r.submittedAt ? `<br><span class="due ${Q.rel(r.deadline).cls}">${Q.rel(r.deadline).txt}</span>` : ''}</td>
    <td class="nowrap">${r.submittedAt ? `${Q.fDate(r.submittedAt, false)}<span class="t2 ltr">${esc(r.ref)}</span>${r.proof ? `<button class="btn-g" data-act="ext-dl" data-id="${r.id}">${ic('clip', 'sm')}${L('الإثبات', 'Proof')}</button>` : ''}` : !r.auto && Q.can('ext.edit') ? `<button class="btn btn-s sm" data-act="ext-submit" data-id="${r.id}">${L('تسجيل التقديم', 'Log submission')}</button>` : r.auto && r.link && Q.canRoute(r.link) ? `<a class="btn-g" href="${r.link}">${L('من صفحة البلاغ', 'From the report')}</a>` : '—'}</td><td><span class="chip ${EXT_ST[st][2]}">${T(EXT_ST[st])}</span></td></tr>`; }).join('') || `<tr><td colspan="5">${Q.empty(L('لا توجد بلاغات خارجية.', 'No external reports.'), 'send')}</td></tr>`}
  </tbody></table></div></section>`};
}};
Q.act('ext-new', () => Q.modal({title: L('بلاغ خارجي', 'External report'), wide: true, body: `<div class="fgrid">${Q.f.sel('authority', L('الجهة', 'Authority'), Object.entries(AUTH).map(([k, v]) => [k, T(v)]), 'hesn')}${Q.f.text('deadline', L('المهلة', 'Deadline'), Q.toInput(Q.add(now(), DAY)), {type: 'datetime-local', req: true})}${Q.f.text('event', L('الحدث', 'Event'), '', {req: true, w: true, ph: L('مثال: حالة حصبة مؤكدة في الطوارئ', 'e.g. confirmed measles case in the ED')})}${Q.f.sel('incidentId', L('البلاغ المرتبط', 'Linked report'), Q.db.all('incidents').slice(-60).reverse().map(x => [x.id, `${x.id}: ${T(x.title)}`]), '', {empty: L('بدون', 'None'), w: true})}</div>`,
  onSubmit: d => { Q.db.put('extreports', {id: nextId('extreports', 'EXT'), authority: d.authority, event: {ar: d.event, en: d.event}, deadline: Q.fromInput(d.deadline), incidentId: d.incidentId || null, refId: d.incidentId || null, createdBy: Q.me.id, createdAt: Q.iso(now())}); Q.render(); }}));
Q.act('ext-submit', el => { const e = Q.db.get('extreports', el.dataset.id); Q.modal({title: L('تسجيل التقديم', 'Log submission'), sub: esc(T(e.event)), body: `<div class="fgrid">${Q.f.text('at', L('تاريخ التقديم', 'Submitted on'), Q.toInput(now()), {type: 'datetime-local', req: true})}${Q.f.text('ref', L('رقم المرجع', 'Reference'), '', {req: true, ltr: true})}<label class="fl w">${L('إثبات التقديم', 'Submission proof')} <span class="req">*</span><input class="field" type="file" name="proof" accept=".pdf,image/*"></label></div>`,
  onSubmit: async d => { if (!d.proof || !d.proof.size) throw new Error(L('أرفق إثبات التقديم.', 'Attach the submission proof.')); const fid = Q.uid('f'); await Q.db.putFile(fid, d.proof);
    Object.assign(e, {submittedAt: Q.fromInput(d.at), ref: d.ref, proof: {id: fid, name: d.proof.name}, submittedBy: Q.me.id}); Q.db.put('extreports', e); Q.audit('ext', e.id, 'ext_submitted', d.ref); Q.render(); }}); });
Q.act('ext-dl', async el => { const e = Q.db.get('extreports', el.dataset.id), b = e && e.proof && await Q.db.getFile(e.proof.id); if (!b) return Q.toast(L('الملف غير متاح (سجل تجريبي).', 'File not available (demo record).'), 'err'); Q.download(e.proof.name, b); });

/* ======================================================================
   AUD-05 MOCK SURVEY: scores by chapter → predicted result per chapter → gap list sent to element owners
   ====================================================================== */
const PRED = s => s >= 80 ? ['ok', ['يُتوقع الاستيفاء', 'Likely compliant']] : s >= 60 ? ['med', ['في دائرة الخطر', 'At risk']] : ['crit', ['يُتوقع عدم الاستيفاء', 'Likely non-compliant']];
Q.mockGaps = m => { const weak = Object.entries(m.chapters || {}).filter(([, v]) => v.score < 80).map(([k]) => k);
  return Q.db.all('standards').filter(s => weak.includes(s.chapter)).flatMap(s => s.elements.filter(e => !['met', 'na'].includes(Q.elRating(e))).map(e => ({s, e}))); };
Q.views.mock = {perm: 'cbahi.view', render(parts) {
  const all = Q.db.all('mocks').sort((a, b) => new Date(b.date) - new Date(a.date)), m = parts[0] ? Q.db.get('mocks', parts[0]) : all[0];
  const chaps = [...new Set(Q.db.all('standards').map(s => s.chapter))], CH = Q.CHAP || {};
  const head = `<nav class="crumbs"><a href="#/cbahi">${L('جاهزية CBAHI', 'CBAHI readiness')}</a>${ic('chev', 'sm flip')}<span>${L('المسح التجريبي', 'Mock survey')}</span></nav>
    <div class="page-head"><div><h2>${L('المسح التجريبي قبل زيارة الاعتماد', 'Mock survey before the accreditation visit')}</h2><p>${L('درجة لكل فصل ← نتيجة متوقعة ← قائمة فجوات تُرسل لمسؤولي العناصر', 'Score per chapter → predicted result → gap list sent to element owners')}</p></div>${Q.can('cbahi.edit') ? `<button class="btn btn-p" data-act="mock-new">${ic('plus')}${L('مسح تجريبي جديد', 'New mock survey')}</button>` : ''}</div>`;
  if (!m) return {title: L('المسح التجريبي', 'Mock survey'), html: head + Q.empty(L('لم يُجرَ مسح تجريبي بعد.', 'No mock survey yet.'), 'shield')};
  const gaps = Q.mockGaps(m), esr = Q.esrGaps(), scores = Object.values(m.chapters).map(v => v.score), overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const verdict = esr.length ? ['crit', ['خطر عدم الاعتماد: متطلبات ESR غير مستوفاة', 'Accreditation at risk: ESR not met']] : PRED(Math.min(...scores));
  return {title: L('المسح التجريبي', 'Mock survey'), html: head + `
  ${all.length > 1 ? `<div style="margin-bottom:12px">${Q.seg(all.slice(0, 5).map(x => [x.id, Q.fDate(x.date, false)]), m.id, 'mock-pick')}</div>` : ''}
  <section class="card ri ${verdict[0]}" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('النتيجة المتوقعة', 'Predicted result')} · ${Q.fDate(m.date, false)}</h3><p>${L('المقيّمون', 'Surveyors')}: ${(m.surveyors || []).map(Q.uname).map(esc).join('، ')}</p></div><div class="ri-score"><strong class="c-${verdict[0]}">${overall}<small>%</small></strong><span class="chip ${verdict[0]}">${T(verdict[1])}</span></div></div>
    <div class="card-b"><div class="ri-dims">${chaps.filter(c => m.chapters[c]).map(c => { const v = m.chapters[c], p = PRED(v.score); return `<a href="#/cbahi"><span>${T(CH[c] || [c, c])} <span class="ltr muted">${c}</span></span><b class="c-${p[0]}">${v.score}%</b>${bar(v.score, 80, 60)}<small>${T(p[1])}${v.notes ? ' · ' + esc(v.notes) : ''}</small></a>`; }).join('')}</div></div></section>
  <section class="card flush"><div class="card-h"><div><h3>${L('قائمة الفجوات', 'Gap list')} (${gaps.length})</h3><p>${m.sentAt ? L(`أُرسلت للمسؤولين ${Q.fDate(m.sentAt, false)}: ظهرت في مهامهم`, `Sent to owners ${Q.fDate(m.sentAt, false)}: now in their tasks`) : L('عناصر غير مستوفاة في الفصول دون 80%', 'Elements not met in chapters below 80%')}</p></div>${!m.sentAt && gaps.length && Q.can('cbahi.edit') ? `<button class="btn btn-p sm" data-act="mock-send" data-id="${m.id}">${ic('send', 'sm')}${L('إرسال للمسؤولين', 'Send to owners')}</button>` : ''}</div>
    <div class="tbl-wrap"><table><tbody>${gaps.map(({s, e}) => `<tr><td class="nowrap"><a class="ltr" href="#/cbahi/${encodeURIComponent(s.id)}">${esc(s.id)}</a>${s.esr ? ' <b class="c-crit">ESR</b>' : ''}</td><td style="white-space:normal">${esc(T(e.text))}</td><td><span class="chip ${Q.EL_RATE[Q.elRating(e)][2]}">${T(Q.EL_RATE[Q.elRating(e)])}</span></td><td>${Q.avatar(e.ownerId, 's')} ${esc(Q.uname(e.ownerId))}</td></tr>`).join('') || `<tr><td>${Q.empty(L('لا توجد فجوات.', 'No gaps.'), 'check')}</td></tr>`}</tbody></table></div></section>`};
}};
Q.act('mock-pick', el => Q.go('#/mock/' + el.dataset.v));
Q.act('mock-new', () => { const chaps = [...new Set(Q.db.all('standards').map(s => s.chapter))], CH = Q.CHAP || {};
  Q.modal({title: L('مسح تجريبي جديد', 'New mock survey'), wide: true, body: `<div class="fgrid">${Q.f.text('date', L('التاريخ', 'Date'), Q.toDateInput(now()), {type: 'date', req: true})}${Q.f.multi('surveyors', L('المقيّمون', 'Surveyors'), staffOpts(), [Q.me.id])}
    ${chaps.map(c => `${Q.f.text('s_' + c, `${T(CH[c] || [c, c])} (${c}) %`, Q.metPct(Q.db.all('standards').filter(s => s.chapter === c)) ?? 0, {type: 'number', req: true, attrs: 'min="0" max="100"', hint: L('مقترح من التقييم الذاتي؛ عدّله بما رآه المقيّمون', 'Suggested from the self-assessment; adjust to what surveyors found')})}${Q.f.text('n_' + c, L('ملاحظات', 'Notes'), '')}`).join('')}</div>`,
    onSubmit: d => { const m = {id: nextId('mocks', 'MOCK'), date: Q.fromInput(d.date), surveyors: [].concat(d.surveyors || []), chapters: {}, status: 'done', createdBy: Q.me.id};
      chaps.forEach(c => { m.chapters[c] = {score: Math.max(0, Math.min(100, +d['s_' + c] || 0)), notes: d['n_' + c] || ''}; }); Q.db.put('mocks', m); Q.audit('cbahi', m.id, 'mock_done'); Q.go('#/mock/' + m.id); }}); });
Q.act('mock-send', el => { const m = Q.db.get('mocks', el.dataset.id); m.sentAt = Q.iso(now()); Q.db.put('mocks', m); Q.audit('cbahi', m.id, 'gaps_sent', String(Q.mockGaps(m).length)); Q.render(); Q.toast(L('أُرسلت قائمة الفجوات إلى مهام المسؤولين', 'Gap list sent to the owners’ tasks')); });

/* ======================================================================
   FAC-05 FIRE & EVACUATION DRILLS · FAC-09 DISASTER EXERCISES
   response time vs target, issues and unmet objectives open CAPA, shift coverage per year
   ====================================================================== */
const DRILL_KIND = {fire: ['تمرين حريق', 'Fire drill'], evacuation: ['تمرين إخلاء', 'Evacuation drill'], codered: ['كود أحمر', 'Code red'], disaster: ['تمرين خطة الكوارث', 'Disaster plan exercise']};
const SHIFT = {day: ['صباحية', 'Day'], evening: ['مسائية', 'Evening'], night: ['ليلية', 'Night']};
Q.drillLate = d => d.status === 'planned' && new Date(d.plannedAt) < now();
Q.drillObjPct = d => (d.objectives || []).length ? pct(d.objectives.filter(o => o.met).length, d.objectives.length) : null;
Q.views.drills = {perm: 'drill.view', render(parts) {
  if (parts[0]) return drillDetail(parts[0]);
  const all = Q.db.all('drills').sort((a, b) => new Date(b.plannedAt) - new Date(a.plannedAt)), y = now().getFullYear();
  const doneY = all.filter(d => d.status === 'done' && new Date(d.doneAt).getFullYear() === y && d.kind !== 'disaster');
  const shifts = Object.keys(SHIFT).filter(s => doneY.some(d => d.shift === s)), rt = doneY.filter(d => d.responseMin != null);
  const dis = all.filter(d => d.kind === 'disaster' && d.status === 'done' && new Date(d.doneAt).getFullYear() === y);
  return {title: L('التمارين والجاهزية للطوارئ', 'Drills & emergency preparedness'), html: `
  <div class="page-head"><div><h2>${L('تمارين الحريق والإخلاء وخطة الكوارث', 'Fire, evacuation & disaster exercises')}</h2><p>${L(`الهدف ${Q.S().drillsPerYear} تمارين سنويًا تغطي كل الورديات · زمن الاستجابة المستهدف ${Q.S().drillTargetMin} دقائق · الملاحظات تفتح إجراءات`, `Target ${Q.S().drillsPerYear} drills a year covering every shift · response target ${Q.S().drillTargetMin} min · issues open actions`)}</p></div>${Q.can('drill.edit') ? `<button class="btn btn-p" data-act="drill-new">${ic('plus')}${L('جدولة تمرين', 'Schedule exercise')}</button>` : ''}</div>
  <div class="stats">${Q.stat(L('تمارين هذا العام', 'Drills this year'), `${doneY.length}<small>/ ${Q.S().drillsPerYear}</small>`, bar(pct(doneY.length, Q.S().drillsPerYear), 100, 50), {cls: doneY.length < Q.S().drillsPerYear ? '' : ''})}${Q.stat(L('الورديات المغطاة', 'Shifts covered'), `${shifts.length}<small>/ 3</small>`, Object.keys(SHIFT).filter(s => !shifts.includes(s)).map(s => T(SHIFT[s])).join('، ') ? L('ناقص: ', 'Missing: ') + Object.keys(SHIFT).filter(s => !shifts.includes(s)).map(s => T(SHIFT[s])).join('، ') : L('كلها مغطاة', 'All covered'), {cls: shifts.length < 3 ? 'up-bad' : ''})}${Q.stat(L('متوسط زمن الاستجابة', 'Average response time'), rt.length ? `${(rt.reduce((a, d) => a + d.responseMin, 0) / rt.length).toFixed(1)}<small> ${L('د', 'min')}</small>` : '—', L(`${rt.filter(d => d.responseMin > (d.targetMin || Q.S().drillTargetMin)).length} تجاوزت الهدف`, `${rt.filter(d => d.responseMin > (d.targetMin || Q.S().drillTargetMin)).length} over target`))}${Q.stat(L('تمرين الكوارث السنوي', 'Annual disaster exercise'), dis.length ? `${Q.drillObjPct(dis[0]) ?? '—'}<small>%</small>` : '—', dis.length ? L('أهداف متحققة', 'objectives met') : L('لم يُنفّذ هذا العام', 'Not done this year'), {cls: dis.length ? '' : 'up-bad'})}</div>
  <section class="card flush"><div class="tbl-wrap"><table><thead><tr><th>${L('التمرين', 'Exercise')}</th><th>${L('الموعد', 'Date')}</th><th class="hide-m">${L('الوردية', 'Shift')}</th><th>${L('الاستجابة', 'Response')}</th><th>${L('الملاحظات', 'Issues')}</th><th>${L('الحالة', 'Status')}</th></tr></thead><tbody>
  ${all.map(d => `<tr class="click" data-href="#/drills/${d.id}"><td><span class="t1">${T(DRILL_KIND[d.kind])}</span><span class="t2">${Q.dname(d.deptId)}</span></td><td class="nowrap">${Q.fDate(d.status === 'done' ? d.doneAt : d.plannedAt, false)}</td><td class="hide-m">${T(SHIFT[d.shift] || SHIFT.day)}</td><td>${d.responseMin != null ? `<b class="c-${d.responseMin > (d.targetMin || Q.S().drillTargetMin) ? 'crit' : 'ok'}">${d.responseMin} ${L('د', 'min')}</b>` : d.kind === 'disaster' && d.status === 'done' ? `${Q.drillObjPct(d)}%` : '—'}</td><td class="num">${(d.issues || []).length || (d.status === 'done' ? 0 : '—')}</td><td><span class="chip ${d.status === 'done' ? 'ok' : Q.drillLate(d) ? 'crit' : 'info'}">${d.status === 'done' ? L('منفّذ', 'Done') : Q.drillLate(d) ? L('متأخر', 'Overdue') : L('مجدول', 'Planned')}</span></td></tr>`).join('') || `<tr><td colspan="6">${Q.empty(L('لا توجد تمارين.', 'No exercises.'), 'alert')}</td></tr>`}
  </tbody></table></div></section>`};
}};
function drillDetail(id) {
  const d = Q.db.get('drills', id); if (!d) return notFound(L('التمرين غير موجود.', 'Exercise not found.'));
  const acts = Q.capaFor('drill', d.id);
  return {title: T(DRILL_KIND[d.kind]), html: `
  <nav class="crumbs"><a href="#/drills">${L('التمارين', 'Drills')}</a>${ic('chev', 'sm flip')}<span>${d.id}</span></nav>
  <div class="page-head"><div><div class="row"><span class="chip ${d.status === 'done' ? 'ok' : Q.drillLate(d) ? 'crit' : 'info'}">${d.status === 'done' ? L('منفّذ', 'Done') : Q.drillLate(d) ? L('متأخر', 'Overdue') : L('مجدول', 'Planned')}</span><span class="chip mute">${T(SHIFT[d.shift] || SHIFT.day)}</span></div><h2 style="margin-top:8px">${T(DRILL_KIND[d.kind])} · ${Q.dname(d.deptId)}</h2><p>${esc(d.scenario || '')}</p></div>${d.status === 'planned' && Q.can('drill.edit') ? `<button class="btn btn-p" data-act="drill-done" data-id="${d.id}">${ic('check')}${L('توثيق التنفيذ', 'Record result')}</button>` : ''}</div>
  ${d.status === 'done' ? `<div class="stats c3">${Q.stat(L('زمن الاستجابة', 'Response time'), d.responseMin != null ? `${d.responseMin}<small> ${L('د', 'min')}</small>` : '—', L(`الهدف ${d.targetMin || Q.S().drillTargetMin} د`, `target ${d.targetMin || Q.S().drillTargetMin} min`), {cls: d.responseMin > (d.targetMin || Q.S().drillTargetMin) ? 'up-bad' : ''})}${Q.stat(L('الملاحظات', 'Issues'), (d.issues || []).length, L('كل ملاحظة تفتح إجراءً', 'each opens an action'))}${Q.stat(L('الأهداف المتحققة', 'Objectives met'), Q.drillObjPct(d) != null ? `${Q.drillObjPct(d)}<small>%</small>` : '—')}</div>
  <section class="card" style="margin-bottom:16px"><div class="card-b">${(d.objectives || []).length ? `<div class="sec"><h4>${L('الأهداف', 'Objectives')}</h4><ul class="bul">${d.objectives.map(o => `<li class="${o.met ? 'c-ok' : 'c-crit'}">${o.met ? '✓' : '✗'} ${esc(o.text)}</li>`).join('')}</ul></div>` : ''}<div class="sec"><h4>${L('الملاحظات', 'Issues')}</h4><ul class="bul">${(d.issues || []).map(i => `<li>${esc(i)}</li>`).join('') || `<li class="muted">—</li>`}</ul></div>${d.lessons ? `<div class="sec"><h4>${L('الدروس المستفادة', 'Lessons learned')}</h4><p class="pre">${esc(d.lessons)}</p></div>` : ''}</div></section>
  <section class="card flush"><div class="card-h"><div><h3>${L('الإجراءات', 'Actions')}</h3></div></div>${capaTable(acts) || `<div class="card-b"><p class="muted">—</p></div>`}</section>` : ''}`};
}
Q.act('drill-new', () => Q.modal({title: L('جدولة تمرين', 'Schedule exercise'), wide: true, body: `<div class="fgrid">${Q.f.sel('kind', L('النوع', 'Type'), Object.entries(DRILL_KIND).map(([k, v]) => [k, T(v)]), 'fire')}${Q.f.sel('shift', L('الوردية', 'Shift'), Object.entries(SHIFT).map(([k, v]) => [k, T(v)]), 'night')}${Q.f.sel('deptId', L('المنطقة / القسم', 'Area / department'), Q.deptOpts(), 'er')}${Q.f.text('plannedAt', L('الموعد', 'Date'), Q.toInput(Q.add(now(), 14 * DAY)), {type: 'datetime-local', req: true})}${Q.f.area('scenario', L('السيناريو', 'Scenario'), '', {rows: 2})}${Q.f.area('objectives', L('الأهداف (هدف في كل سطر، لتمارين الكوارث)', 'Objectives (one per line, for disaster exercises)'), '', {rows: 3})}</div>`,
  onSubmit: d => { const x = {id: nextId('drills', 'DRL'), kind: d.kind, shift: d.shift, deptId: d.deptId, plannedAt: Q.fromInput(d.plannedAt), scenario: d.scenario, targetMin: Q.S().drillTargetMin, objectives: String(d.objectives || '').split('\n').map(s => s.trim()).filter(Boolean).map(t => ({text: t, met: null})), status: 'planned', createdBy: Q.me.id};
    Q.db.put('drills', x); Q.go('#/drills/' + x.id); }}));
Q.act('drill-done', el => { const x = Q.db.get('drills', el.dataset.id);
  Q.modal({title: L('توثيق تنفيذ التمرين', 'Record exercise result'), wide: true, body: `<div class="fgrid">${Q.f.text('doneAt', L('وقت التنفيذ', 'Done at'), Q.toInput(now()), {type: 'datetime-local', req: true})}${x.kind !== 'disaster' ? Q.f.text('responseMin', L('زمن الاستجابة (دقائق)', 'Response time (minutes)'), '', {type: 'number', req: true, attrs: 'min="0" step="0.5"'}) : '<div></div>'}
    ${(x.objectives || []).length ? Q.f.multi('met', L('الأهداف المتحققة', 'Objectives met'), x.objectives.map((o, i) => [String(i), o.text]), []) : ''}${Q.f.area('issues', L('الملاحظات (ملاحظة في كل سطر؛ كل واحدة تفتح إجراءً)', 'Issues (one per line; each opens an action)'), '', {rows: 4})}${Q.f.area('lessons', L('الدروس المستفادة', 'Lessons learned'), '', {rows: 2})}</div>`,
    onSubmit: d => { const met = [].concat(d.met || []); Object.assign(x, {status: 'done', doneAt: Q.fromInput(d.doneAt), responseMin: x.kind !== 'disaster' ? +d.responseMin : null, issues: String(d.issues || '').split('\n').map(s => s.trim()).filter(Boolean), lessons: d.lessons, doneBy: Q.me.id});
      (x.objectives || []).forEach((o, i) => { o.met = met.includes(String(i)); });
      const owner = (Q.dept(x.deptId) || {}).headId || Q.me.id, gaps = [...x.issues, ...(x.objectives || []).filter(o => !o.met).map(o => L('هدف لم يتحقق: ', 'Objective not met: ') + o.text)];
      if (x.responseMin != null && x.responseMin > (x.targetMin || Q.S().drillTargetMin)) gaps.push(L(`زمن الاستجابة ${x.responseMin} د تجاوز الهدف`, `Response time ${x.responseMin} min exceeded the target`));
      gaps.forEach(g => Q.newCapa({title: `${T(DRILL_KIND[x.kind])} (${Q.dshort(x.deptId)}): ${g}`, source: 'audit', ownerId: owner, deptId: x.deptId, dueDays: 30, refKind: 'drill', refId: x.id}));
      Q.db.put('drills', x); Q.audit('drill', x.id, 'drill_done', `${gaps.length} actions`); Q.render(); Q.toast(L(`وُثّق التمرين وفُتح ${gaps.length} إجراء`, `Exercise recorded; ${gaps.length} action(s) opened`)); }}); });

/* ======================================================================
   TASKS · READINESS · NAVIGATION HOOKS
   ====================================================================== */
Q.phase2Tasks = (u, push) => {
  Q.db.all('risks').filter(r => r.ownerId === u.id && r.status !== 'closed').forEach(r => {
    if (Q.riskNeedsPlan(r)) push({kind: 'risk', ref: r.id, what: ['خطة معالجة لخطر عالٍ', 'Treatment plan for a high risk'], due: Q.add(r.createdAt || now(), 14 * DAY), prio: 1, link: '#/risks/' + r.id, sub: T(r.title)});
    if (Q.riskReviewDue(r)) push({kind: 'risk', ref: r.id + ':rv', what: ['مراجعة خطر', 'Review a risk'], due: r.reviewDue, prio: 3, link: '#/risks/' + r.id, sub: T(r.title)}); });
  if (Q.can('survey.manage', u)) Q.db.all('surveys').filter(s => s.kind === 'culture').sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 1).forEach(s => Q.lowDims(s).filter(dm => !Q.capaFor('survey', s.id, x => x.dimId === dm.id).length).forEach(dm =>
    push({kind: 'survey', ref: s.id + dm.id, what: ['خطة تحسين لبعد ثقافة سلامة منخفض', 'Improvement plan for a low safety-culture dimension'], due: null, prio: 2, link: '#/surveys/' + s.id, sub: `${T(dm.name)} · ${dm.pct}%`})));
  Q.db.all('responses').filter(r => r.kind === 'patient' && Q.respLow(r) && !r.followUp).forEach(r => { const sups = Q.supervisorsOf(r.deptId);
    if (sups.includes(u.id) || (!sups.length && Q.can('survey.manage', u))) push({kind: 'survey', ref: r.id, what: ['متابعة تقييم رضا منخفض', 'Follow up a low satisfaction score'], due: Q.add(r.at, 3 * DAY), prio: 2, link: '#/surveys/' + r.refId, sub: `${Q.dshort(r.deptId)} · ${Q.respScore(r).toFixed(1)}/5`}); });
  Q.db.all('committees').filter(c => c.active !== false).forEach(c => {
    if (c.secretaryId === u.id && Q.cmOverdue(c)) push({kind: 'committee', ref: c.id, what: ['عقد اجتماع لجنة متأخر', 'Hold an overdue committee meeting'], due: Q.cmNextDue(c), prio: 2, link: '#/committees/' + c.id, sub: T(c.name)});
    const late = Q.cmActions(c).filter(x => ['open', 'progress'].includes(x.status) && new Date(x.due) < now());
    if (c.chairId === u.id && late.length) push({kind: 'committee', ref: c.id + ':late', what: ['تصعيد للرئيس: إجراءات قرارات متأخرة', 'Escalated to chair: overdue decision actions'], due: late.map(x => x.due).sort()[0], prio: 1, link: '#/committees/' + c.id, sub: L(`${late.length} إجراءات · ${T(c.name)}`, `${late.length} actions · ${T(c.name)}`)}); });
  const ext = Q.extRows();
  if (u.role === 'director') { const od = ext.filter(r => Q.extState(r) === 'overdue'); if (od.length) push({kind: 'ext', ref: 'ext-overdue', what: ['تصعيد: بلاغات خارجية متأخرة', 'Escalation: overdue external reports'], due: od[0].deadline, prio: 0, link: '#/external', sub: od.map(r => T(AUTH[r.authority] || AUTH.other)).join('، ')}); }
  if (Q.can('ext.edit', u)) ext.filter(r => !r.auto && !r.submittedAt).forEach(r => push({kind: 'ext', ref: r.id, what: ['تقديم بلاغ لجهة خارجية', 'Submit a report to an authority'], due: r.deadline, prio: 1, link: '#/external', sub: `${T(AUTH[r.authority] || AUTH.other)} · ${r.event}`}));
  const mk = Q.db.all('mocks').filter(m => m.sentAt).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (mk) { const mine = Q.mockGaps(mk).filter(g => g.e.ownerId === u.id); if (mine.length) push({kind: 'cbahi', ref: mk.id, what: ['سد فجوات المسح التجريبي', 'Close mock-survey gaps'], due: Q.S().surveyDate || null, prio: 2, link: '#/mock/' + mk.id, sub: mine.slice(0, 3).map(g => g.s.id).join('، ') + (mine.length > 3 ? ` +${mine.length - 3}` : '')}); }
  if (Q.can('drill.edit', u)) Q.db.all('drills').filter(d => d.status === 'planned' && new Date(d.plannedAt) < Q.add(now(), 7 * DAY)).forEach(d => push({kind: 'drill', ref: d.id, what: ['تنفيذ تمرين وتوثيقه', 'Run and record an exercise'], due: d.plannedAt, prio: Q.drillLate(d) ? 1 : 3, link: '#/drills/' + d.id, sub: `${T(DRILL_KIND[d.kind])} · ${T(SHIFT[d.shift] || SHIFT.day)}`}));
};
const devTasks = (u, push) => {
  Q.db.all('devices').filter(d => d.status !== 'retired').forEach(d => { const sub = T(d.name) + ' · ' + d.id;
    if (u.role === 'biomed') [['calibDue', ['معايرة جهاز', 'Calibrate a device']], ['elecDue', ['اختبار السلامة الكهربائية', 'Electrical safety test']]].forEach(([f, what]) => { if (d[f] && new Date(d[f]) < Q.add(now(), 30 * DAY)) push({kind: 'device', ref: d.id + ':' + f, what, due: d[f], prio: new Date(d[f]) < now() ? 1 : 3, link: '#/devices/' + d.id, sub}); });
    if (Q.pmLateDays && Q.pmLateDays(d) > Q.S().pmEscDays && (u.role === 'director' || (Q.dept('biomed') || {}).headId === u.id)) push({kind: 'device', ref: d.id + ':pmesc', what: ['تصعيد: صيانة وقائية متأخرة طويلًا', 'Escalation: long-overdue preventive maintenance'], due: Q.nextPM(d), prio: 1, link: '#/devices/' + d.id, sub}); }); };
const p2t = Q.phase2Tasks; Q.phase2Tasks = (u, push) => { p2t(u, push); devTasks(u, push); };
Q.extraReadiness = (add, blockers) => {
  const hi = Q.db.all('risks').filter(r => r.status !== 'closed' && ['high', 'extreme'].includes(Q.riskBand(Q.riskScore(r))));
  add('risk', ['مخاطر عالية لها خطة معالجة', 'High risks with a treatment plan'], pct(hi.filter(r => !Q.riskNeedsPlan(r)).length, hi.length), L(`${hi.length} خطر عالٍ`, `${hi.length} high risks`), '#/risks');
  const y = now().getFullYear(), dr = Q.db.all('drills').filter(d => d.kind !== 'disaster' && d.status === 'done' && new Date(d.doneAt).getFullYear() === y).length;
  add('drills', ['تنفيذ خطة التمارين السنوية', 'Annual drill plan delivered'], Math.min(100, pct(dr, Q.S().drillsPerYear) || 0), L(`${dr} من ${Q.S().drillsPerYear}`, `${dr} of ${Q.S().drillsPerYear}`), '#/drills');
  const ext = Q.extRows().filter(r => Q.extState(r) === 'overdue').length; if (ext) blockers.push({t: L(`${ext} بلاغات خارجية متأخرة لم تُقدّم`, `${ext} overdue external report(s) not submitted`), go: '#/external'});
  const ex = Q.db.all('risks').filter(r => r.status !== 'closed' && Q.riskBand(Q.riskScore(r)) === 'extreme' && Q.riskNeedsPlan(r)).length; if (ex) blockers.push({t: L(`${ex} مخاطر حرجة دون خطة معالجة`, `${ex} extreme risk(s) without a treatment plan`), go: '#/risks?tab=plan'});
};

/* ======================================================================
   DEMO DATA + MIGRATION (Phase 2)
   ====================================================================== */
Q.phase2Patch = (data, demo) => {
  const S = data.settings = data.settings || {}, D = Q.defaultSettings(), out = [], put = (c, o) => { (data[c] = data[c] || []).push(o); out.push([c, o]); };
  Object.keys(D).forEach(k => { if (S[k] === undefined) S[k] = D[k]; }); S.phase2Seeded = true;
  if (!demo) return out;
  let seed = 7331; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const T0 = Date.now(), at = (d, h = 10) => { const x = new Date(T0 + d * DAY); x.setHours(h, 0, 0, 0); return x.toISOString(); }, y = new Date().getFullYear();
  const has = id => (data.users || []).some(u => u.id === id), who = (id, alt = 'u1') => has(id) ? id : alt;
  let cn = (data.capa || []).reduce((m, c) => Math.max(m, +String(c.id).replace(/\D/g, '') || 0), 300);
  const capa = (title, owner, dept, dueDays, refKind, refId, status = 'open', extra = {}) => { const c = Object.assign({id: `CAPA-${++cn}`, title, kind: 'corrective', source: 'audit', ownerId: who(owner), deptId: dept, due: at(dueDays), refKind, refId, measure: '', progress: status === 'verified' ? 100 : 30, status, createdAt: at(dueDays - 40), createdBy: 'u2', updates: []}, extra); put('capa', c); return c; };
  /* risks */
  const R = (n, ar, cat, dept, owner, l, i, target, o = {}) => { const r = Object.assign({id: `RSK-${y}-${String(n).padStart(3, '0')}`, title: {ar, en: ar}, category: cat, deptId: dept, ownerId: who(owner), l, i, target, controls: o.controls || '', reviewDue: at(o.review ?? 120), status: 'open', createdAt: at(-90 + n * 3), createdBy: 'u2'}, o.res ? {rl: o.res[0], ri: o.res[1]} : {}); put('risks', r); return r; };
  const r1 = R(1, 'انقطاع الإمداد المركزي بالأكسجين', 'safety', 'icu', 'u11', 2, 5, 'moderate', {controls: 'خزان احتياطي وإنذار ضغط منخفض', res: [1, 5]});
  const r2 = R(2, 'أخطاء الأدوية عالية الخطورة في التنويم', 'clinical', 'pharm', 'u10', 4, 4, 'moderate', {controls: 'تحقق مزدوج للأنسولين والهيبارين', res: [3, 4]});
  R(3, 'سقوط المرضى كبار السن ليلًا', 'clinical', 'med', 'u17', 4, 3, 'moderate', {controls: 'تقييم مورس عند الدخول'});
  const r4 = R(4, 'هجوم فدية على نظام الملف الطبي', 'it', 'it', 'u14', 3, 5, 'moderate', {controls: 'نسخ احتياطي يومي'});
  R(5, 'نقص الكوادر التمريضية في المناوبات الليلية', 'operational', 'icu', 'u4', 3, 3, 'low', {review: -10});
  R(6, 'تعطل جهاز التعقيم الرئيسي', 'safety', 'or', 'u8', 2, 4, 'low', {res: [2, 3]});
  R(7, 'عدم تجديد تراخيص بعض الكوادر في الموعد', 'compliance', 'qps', 'u2', 3, 2, 'low', {res: [2, 2]});
  R(8, 'انتشار عدوى المكورات العنقودية المقاومة في العناية', 'clinical', 'icu', 'u2', 3, 4, 'moderate');
  capa('تركيب إنذار ضغط ثانٍ ومحول تلقائي لخط الأكسجين', 'u11', 'icu', 25, 'risk', r1.id, 'verified', {source: 'risk', verify: {at: at(-5), by: 'u1', effective: true, note: ''}});
  capa('بروتوكول التحقق المزدوج المستقل لكل الأدوية عالية الخطورة', 'u10', 'pharm', 12, 'risk', r2.id, 'progress', {source: 'risk'});
  capa('خطة استعادة بعد الكوارث للنظام واختبار الاستعادة كل ربع', 'u14', 'it', -9, 'risk', r4.id, 'open', {source: 'risk'});
  /* FMEA */
  put('fmeas', {id: `FMEA-${y}-001`, kind: 'fmea', title: {ar: 'إعطاء الأنسولين في أقسام التنويم', en: 'Insulin administration on wards'}, deptId: 'med', status: 'draft', createdAt: at(-20), createdBy: 'u2', steps: [
    {id: 'st1', text: 'وصف الجرعة', modes: [{id: 'fm1', mode: 'كتابة U بدل وحدة', effect: 'جرعة عشرية خاطئة', cause: 'اختصارات غير آمنة', s: 9, o: 4, d: 5}]},
    {id: 'st2', text: 'تحضير الجرعة', modes: [{id: 'fm2', mode: 'سحب الأنسولين بحقنة غير مخصصة', effect: 'جرعة زائدة', cause: 'نقص حقن الأنسولين', s: 9, o: 3, d: 6}, {id: 'fm3', mode: 'خلط نوعين بالترتيب الخاطئ', effect: 'تلوث القارورة', cause: 'نقص التدريب', s: 5, o: 3, d: 4}]},
    {id: 'st3', text: 'الإعطاء والمراقبة', modes: [{id: 'fm4', mode: 'عدم قياس السكر قبل الجرعة', effect: 'هبوط سكر', cause: 'ضغط العمل', s: 8, o: 4, d: 4}]}]});
  /* surveys + anonymous responses */
  const cTpl = JSON.parse(JSON.stringify(CULTURE_TPL)), bias = {teamwork: .75, response: .45, comm: .6, feedback: .55, staffing: .4, mgmt: .7}, prevBias = {teamwork: .7, response: .5, comm: .52, feedback: .5, staffing: .45, mgmt: .66};
  const mkCulture = (id, year, b, n, status) => { put('surveys', {id, kind: 'culture', title: {ar: `مسح ثقافة سلامة المرضى ${year}`, en: `Patient safety culture survey ${year}`}, year, status, dimensions: cTpl, createdAt: at(year === y ? -40 : -400), createdBy: 'u2'});
    for (let k = 0; k < n; k++) { const ans = {}; cTpl.forEach(dm => dm.items.forEach(it => { const pos = rnd() < b[dm.id]; const v = pos ? (rnd() < .5 ? 4 : 5) : (rnd() < .5 ? 2 : 3); ans[it.id] = it.neg ? 6 - v : v; })); put('responses', {id: `rs-${id}-${k}`, refId: id, kind: 'culture', answers: ans, at: at((year === y ? -38 : -398) + k % 20)}); } };
  mkCulture(`SC-${y - 1}-001`, y - 1, prevBias, 46, 'closed'); mkCulture(`SC-${y}-001`, y, bias, 58, 'closed');
  const pid = `PS-${y}-001`; put('surveys', {id: pid, kind: 'patient', title: {ar: 'استبيان رضا المرضى المستمر', en: 'Continuous patient satisfaction survey'}, status: 'open', year: y, items: JSON.parse(JSON.stringify(PATIENT_TPL)), createdAt: at(-90), createdBy: 'u2'});
  const units = {er: 3.3, icu: 4.4, surg: 4.1, med: 3.9, rad: 3.6, lab: 4.3, nicu: 4.6, pharm: 3.8}, comments = ['الانتظار طويل جدًا', 'التمريض متعاون', 'لم يشرح لي الطبيب العلاج', 'نظافة ممتازة', 'تأخر صرف الدواء', ''];
  Object.entries(units).forEach(([u, m]) => { for (let k = 0; k < 9; k++) { const ans = {}; PATIENT_TPL.forEach(it => { ans[it.id] = Math.max(1, Math.min(5, Math.round(m + (rnd() - .5) * 2.6))); }); const r = {id: `rs-${pid}-${u}-${k}`, refId: pid, kind: 'patient', deptId: u, visitType: u === 'er' ? 'emergency' : ['icu', 'surg', 'med', 'nicu'].includes(u) ? 'inpatient' : 'outpatient', answers: ans, comment: comments[Math.floor(rnd() * comments.length)], contact: '', at: at(-80 + k * 8 + Object.keys(units).indexOf(u))};
    const avg = Object.values(ans).reduce((p, v) => p + v, 0) / PATIENT_TPL.length; if (avg <= S.patientLowScore && k < 5) r.followUp = {by: who('u2'), at: Q.add(r.at, 2 * DAY).toISOString(), note: 'تواصلت الوحدة مع المريض واعتذرت'}; put('responses', r); } });
  /* committees + meetings + decisions */
  const CM = (id, ar, en, chair, sec, members, quorum, freq) => { const c = {id, name: {ar, en}, chairId: who(chair), secretaryId: who(sec), members: members.filter(has), quorum, freqMonths: freq, active: true, createdAt: at(-400)}; put('committees', c); return c; };
  const cq = CM('cm-quality', 'لجنة الجودة وسلامة المرضى', 'Quality & Patient Safety Committee', 'u1', 'u2', ['u1', 'u2', 'u3', 'u4', 'u5', 'u10', 'u11'], 4, 1);
  const ci = CM('cm-ipc', 'لجنة مكافحة العدوى', 'Infection Control Committee', 'u1', 'u2', ['u1', 'u2', 'u4', 'u6', 'u9'], 3, 1);
  const cm = CM('cm-pt', 'لجنة الصيدلة والعلاجات وسلامة الأدوية', 'Pharmacy, Therapeutics & Medication Safety Committee', 'u10', 'u16', ['u10', 'u16', 'u1', 'u4', 'u17'], 3, 3);
  CM('cm-eoc', 'لجنة بيئة الرعاية والسلامة', 'Environment of Care & Safety Committee', 'u11', 'u14', ['u11', 'u14', 'u1', 'u8'], 3, 3);
  let mn = 0; const MT = (c, days, att, minutes, decisions = []) => { const m = {id: `MTG-${y}-${String(++mn).padStart(3, '0')}`, refId: c.id, date: at(days, 11), attendees: att.filter(has), agenda: 'مراجعة المؤشرات والبلاغات والإجراءات المفتوحة', minutes, status: 'held', quorumMet: att.filter(id => c.members.includes(id)).length >= c.quorum, createdBy: c.secretaryId, decisions: []};
    put('meetings', m); decisions.forEach(([t, owner, due, st]) => { const x = capa(`${c.name.ar}: ${t}`, owner, (data.users.find(u => u.id === owner) || {}).deptId, due, 'meeting', m.id, st); m.decisions.push({id: 'dc' + x.id, text: t, capaId: x.id}); }); return m; };
  MT(cq, -62, ['u1', 'u2', 'u3', 'u4', 'u5'], 'نوقشت مؤشرات الربع الثالث وارتفاع أخطاء الأدوية.', [['تدريب كل الممرضين على التحقق المزدوج للأنسولين', 'u4', -12, 'progress'], ['مراجعة سياسة الإبلاغ وتبسيط النموذج', 'u2', 20, 'open']]);
  MT(cq, -30, ['u1', 'u2', 'u3', 'u14'], 'لم يكتمل النصاب؛ نوقشت البنود للعلم فقط.');
  MT(ci, -25, ['u1', 'u2', 'u4', 'u9'], 'ارتفاع حالات العدوى المرتبطة بالقسطرة في العناية.', [['حزمة منع عدوى القسطرة المركزية وتدقيق أسبوعي', 'u4', -3, 'open']]);
  MT(cm, -100, ['u10', 'u16', 'u1', 'u4'], 'مراجعة قائمة الأدوية المتشابهة شكلًا ونطقًا.', [['تحديث ملصقات الأدوية المتشابهة في كل الأقسام', 'u10', -40, 'verified']]);
  /* external reports */
  put('extreports', {id: `EXT-${y}-001`, authority: 'hesn', event: {ar: 'حالة سل رئوي مؤكدة', en: 'Confirmed pulmonary TB case'}, deadline: at(-40), submittedAt: at(-40.5), ref: 'HESN-55210', proof: {id: 'demo-proof', name: 'hesn-receipt.pdf'}, createdBy: 'u2', createdAt: at(-41)});
  put('extreports', {id: `EXT-${y}-002`, authority: 'civil', event: {ar: 'حريق محدود في مستودع التموين', en: 'Small fire in the supply store'}, deadline: at(-2), submittedAt: null, createdBy: 'u2', createdAt: at(-4)});
  put('extreports', {id: `EXT-${y}-003`, authority: 'moh', event: {ar: 'تقرير ربعي لمؤشرات الجودة الوطنية', en: 'Quarterly national quality indicator return'}, deadline: at(9), submittedAt: null, createdBy: 'u2', createdAt: at(-10)});
  /* mock survey (earlier) */
  put('mocks', {id: `MOCK-${y}-001`, date: at(-45), surveyors: ['u1', 'u2'].filter(has), chapters: {QM: {score: 72, notes: 'محاضر اللجنة ناقصة'}, IPSG: {score: 85, notes: ''}, MM: {score: 58, notes: 'تخزين الأدوية عالية الخطورة'}, IPC: {score: 70, notes: ''}, FMS: {score: 64, notes: 'تمارين الإخلاء الليلية'}, LD: {score: 90, notes: ''}}, status: 'done', sentAt: at(-44), createdBy: 'u2'});
  /* drills */
  let dn = 0; const DR = (kind, days, shift, dept, rmin, issues = [], objectives = null, status = 'done') => put('drills', {id: `DRL-${y}-${String(++dn).padStart(3, '0')}`, kind, shift, deptId: dept, plannedAt: at(days, shift === 'night' ? 2 : shift === 'evening' ? 19 : 10), doneAt: status === 'done' ? at(days, shift === 'night' ? 2 : 10) : null, responseMin: status === 'done' && kind !== 'disaster' ? rmin : null, targetMin: 5, issues, objectives, lessons: '', status, scenario: '', createdBy: 'u14'});
  DR('fire', -200, 'day', 'er', 4); DR('evacuation', -120, 'evening', 'surg', 7.5, ['تأخر فتح مخرج الطوارئ الخلفي', 'نقص كراسي الإخلاء']); DR('fire', -60, 'day', 'lab', 3.5);
  DR('disaster', -150, 'day', 'er', null, ['ازدحام منطقة الفرز'], [{text: 'تفعيل غرفة القيادة خلال 15 دقيقة', met: true}, {text: 'فرز 30 مصابًا افتراضيًا خلال ساعة', met: false}, {text: 'التواصل مع الهلال الأحمر', met: true}]);
  DR('fire', 10, 'night', 'icu', null, [], null, 'planned'); DR('codered', -5, 'night', 'nicu', null, [], null, 'planned');
  /* AUD-07 documentation audit (sample mode) + AUD-03 tracer templates, with one completed audit and one planned tracer */
  const it = (id, ar, en, clause) => ({id, text: {ar, en}, critical: false, clause});
  if (!(data.checklists || []).some(c => c.id === 'cl-doc')) {
    const doc = {id: 'cl-doc', kind: 'sample', target: 90, minSamples: 10, sampleLabel: {ar: 'رقم الملف الطبي', en: 'MRN'}, active: true, name: {ar: 'تدقيق التوثيق السريري', en: 'Clinical documentation audit'}, standards: ['MR.3', 'PC.2'], items: [
      it('d1', 'تقييم الدخول خلال 24 ساعة', 'Admission assessment within 24 h', 'PC.2'), it('d2', 'خطة الرعاية موثقة', 'Care plan documented', 'PC.4'), it('d3', 'الحساسية موثقة', 'Allergies documented', 'MM.3'),
      it('d4', 'كل القيود مؤرخة وموقعة', 'Every entry dated, timed and signed', 'MR.3'), it('d5', 'ملخص الخروج مكتمل', 'Discharge summary complete', 'MR.5')]};
    put('checklists', doc);
    const samples = Array.from({length: 12}, (_, k) => ({id: 'sm' + k, ref: 'MRN-' + (480200 + k * 37), attrs: {}, answers: {d1: 'yes', d2: k % 4 === 0 ? 'no' : 'yes', d3: k % 6 === 0 ? 'no' : 'yes', d4: k % 3 === 0 ? 'no' : 'yes', d5: k % 2 ? 'yes' : 'na'}}));
    const score = (() => { let y = 0, n = 0; samples.forEach(s => Object.values(s.answers).forEach(v => { if (v === 'yes') y++; if (v === 'no') n++; })); return Math.round(y / (y + n) * 100); })();
    const rid = `RND-${y}-0${40 + 1}`;
    put('rounds', {id: rid, checklistId: 'cl-doc', deptId: 'surg', leadId: who('u2'), scope: 'عينة عشوائية من ملفات الخروج لشهر سابق', units: [], path: '', team: [], plannedAt: at(-15, 9), status: 'done', doneAt: at(-15, 13), doneBy: who('u2'), score, crit: 0, findings: [], samples, answers: {}, createdBy: 'u2', createdAt: at(-30)});
    if (score < 90) capa(`${doc.name.ar} (الجراحي): ${score}% < 90% · مؤرخة وموقعة، خطة الرعاية`, 'u6', 'surg', 15, null, null, 'progress', {source: 'audit', roundId: rid, findingIdx: -1});
  }
  if (!(data.checklists || []).some(c => c.id === 'cl-tracer')) {
    put('checklists', {id: 'cl-tracer', kind: 'tracer', active: true, name: {ar: 'تتبع مريض: إدارة الأدوية', en: 'Patient tracer: medication management'}, standards: ['MM.5', 'IPSG.3'], items: [
      Object.assign(it('t1', 'التحقق من الوصفة قبل الصرف', 'Prescription verified before dispensing', 'MM.4'), {critical: true}), it('t2', 'التخزين الآمن في القسم', 'Safe storage on the unit', 'MM.5'),
      Object.assign(it('t3', 'تحقق مزدوج للأدوية عالية الخطورة', 'Independent double-check for high-alert drugs', 'IPSG.3'), {critical: true}), it('t4', 'توثيق الإعطاء في السجل', 'Administration documented in the record', 'MM.7'), it('t5', 'تثقيف المريض عن أدويته', 'Patient educated about medicines', 'PFE.2')]});
    put('rounds', {id: `RND-${y}-0${40 + 2}`, checklistId: 'cl-tracer', deptId: 'med', leadId: who('u2'), scope: '', units: ['pharm', 'med'], path: 'من وصف الطبيب إلى الصيدلية ثم الإعطاء في الباطني', team: [], plannedAt: at(4, 9), status: 'planned', answers: {}, findings: [], createdBy: 'u2', createdAt: at(-3)});
  }
  /* FAC-02: PM history that recorded its due date, so on-time % is real */
  (data.devices || []).forEach((d, i) => { const due = at(-120 + i * 9), done = at(-120 + i * 9 + (i % 4 === 0 ? 12 : -3)); put('maint', {id: `m-pm-${d.id}`, deviceId: d.id, kind: 'pm', at: done, by: who('u11'), text: 'صيانة وقائية دورية', result: 'pass', dueAt: due, onTime: new Date(done) <= new Date(due)}); });
  /* KPI-01 definition details + benchmark (existing indicators) */
  (data.kpis || []).forEach((k, i) => { if (k.domain) return; Object.assign(k, {domain: ['safety', 'effectiveness', 'timeliness', 'patient', 'efficiency'][i % 5], formula: `${T(k.num)} ÷ ${T(k.den)}${k.unit === 'pct' ? ' × 100' : k.unit === 'per1000' ? ' × 1000' : ''}`, frequency: 'monthly', source: i % 2 ? 'HIS' : 'Manual register', ownerId: (data.depts.find(d => d.id === k.deptId) || {}).headId || 'u2', benchmark: k.target}); out.push(['kpis', k]); });
  /* FAC-03 calibration / electrical safety due dates */
  (data.devices || []).forEach((d, i) => { if (d.calibDue !== undefined) return; d.calibDue = at(-30 + i * 45); d.elecDue = at(-10 + i * 50); out.push(['devices', d]); });
  return out;
};
const prevEnsure = Q.ensureQuality;
Q.ensureQuality = data => { let out = prevEnsure(data); const S = data.settings || {};
  if (!S.phase2Seeded) { const demo = (data.users || []).some(u => /@alsalam-hospital\.sa$/.test(u.email || '')); out = (out || []).concat(Q.phase2Patch(data, demo).filter(x => !(out || []).some(y => y[1] === x[1]))); }
  return out; };
})();
