/* التحقيق وتحليل السبب الجذري + الإجراءات التصحيحية والوقائية */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;

Q.RCA_ST = {forming: ['تشكيل الفريق وجمع الوقائع', 'Team & fact finding'], analysis: ['تحليل الأسباب', 'Cause analysis'], report: ['صياغة التقرير', 'Drafting report'], approved: ['معتمد', 'Approved']};
const RCA_ORDER = ['forming', 'analysis', 'report', 'approved'];
const canEditRCA = r => Q.can('rca.edit') || (r.team || []).includes(Q.me.id) || r.leadId === Q.me.id;
const visibleRCA = () => Q.db.all('rca').filter(r => Q.canSeeRCA(r));
const noAccess = () => ({title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('ليست لديك صلاحية لعرض هذا التحقيق.', 'You do not have access to this investigation.'), 'lock')});

/* =============== RCA list & detail =============== */
/* list needs rca.view; a single investigation is open to anyone who can see it (incl. staff on the team) */
Q.views.rca = {render(parts) {
  if (parts[0]) { const r = Q.db.get('rca', parts[0]); if (r && !Q.canSeeRCA(r)) return noAccess(); return parts[1] === 'print' ? rcaPrint(parts[0]) : rcaDetail(parts[0]); }
  if (!Q.can('rca.view')) return noAccess();
  const list = visibleRCA().sort((a, b) => (a.status === 'approved') - (b.status === 'approved') || new Date(b.createdAt) - new Date(a.createdAt));
  const active = list.filter(r => r.status !== 'approved');
  return {title: L('التحقيق و RCA', 'Investigations & RCA'), html: `
  <div class="page-head"><div><h2>${L('التحقيق وتحليل السبب الجذري', 'Investigations & root cause analysis')}</h2><p>${L(`${active.length} تحقيقات نشطة · يُفتح التحقيق تلقائيًا للأحداث الجسيمة أو عند SAL ≥ ${Q.S().rcaThreshold}`, `${active.length} active · opened automatically for sentinel events or SAL ≥ ${Q.S().rcaThreshold}`)}</p></div></div>
  <section class="card"><div class="tbl-wrap"><table class="flush">
    <thead><tr><th>${L('التحقيق', 'Investigation')}</th><th>${L('البلاغ', 'Report')}</th><th>SAL</th><th>${L('قائد الفريق', 'Lead')}</th><th>${L('المرحلة', 'Phase')}</th><th>${L('الاستحقاق التالي', 'Next due')}</th></tr></thead>
    <tbody>${list.length ? list.map(r => { const x = Q.db.get('incidents', r.incidentId) || {}; const n = x.stage === 'rca' ? Q.nextStep(x) : null; const rr = n ? Q.rel(n.due) : null; const pi = RCA_ORDER.indexOf(r.status);
      return `<tr class="click" data-href="#/rca/${r.id}"><td><span class="oid">${r.id}</span><span class="t2">${L('فُتح', 'Opened')} ${Q.fDate(r.createdAt, false)}</span></td><td><span class="t1">${esc(T(x.title))}</span><span class="t2 ltr">${x.id}</span></td><td>${x.id ? Q.salChip(x) : ''}</td><td class="nowrap">${Q.avatar(r.leadId, 's')} ${esc(Q.uname(r.leadId))}</td>
      <td><span class="t1" style="font-weight:400;margin-bottom:4px">${T(Q.RCA_ST[r.status])}</span><span class="stage">${RCA_ORDER.map((s, i) => `<i class="${i <= pi ? 'on' : ''}"></i>`).join('')}</span></td><td>${rr ? `<span class="t1" style="font-weight:400">${T(n.what)}</span><span class="due t2 ${rr.cls}">${rr.txt}</span>` : r.approvedAt ? `<span class="muted">${L('اعتُمد', 'Approved')} ${Q.fDate(r.approvedAt, false)}</span>` : '—'}</td></tr>`; }).join('') : `<tr><td colspan="6">${Q.empty(L('لا توجد تحقيقات.', 'No investigations.'), 'search')}</td></tr>`}</tbody></table></div></section>`};
}};

function rcaDetail(id) {
  const r = Q.db.get('rca', id); if (!r) return {title: '—', html: Q.empty(L('التحقيق غير موجود.', 'Investigation not found.'), 'search')};
  const x = Q.db.get('incidents', r.incidentId) || {}; const ed = canEditRCA(r) && r.status !== 'approved';
  const capas = Q.db.all('capa').filter(c => c.rcaId === r.id || (c.incidentId === x.id && x.id));
  const pi = RCA_ORDER.indexOf(r.status);
  const meetDue = x.review ? Q.add(x.review.at, Q.S().rcaMeetingDays * Q.DAY) : null;
  return {title: `<span class="ltr">${r.id}</span>`, mount: root => mountRCA(root, r), html: `
  <nav class="crumbs">${Q.can('rca.view') ? `<a href="#/rca">${L('التحقيقات', 'Investigations')}</a>` : `<span>${L('التحقيقات', 'Investigations')}</span>`}${ic('chev', 'sm flip')}<span class="ltr">${r.id}</span></nav>
  <div class="page-head"><div><div class="row"><a class="oid" href="#/incidents/${x.id}">${x.id}</a>${Q.salChip(x)}${Q.isSentinel(x) ? `<span class="chip crit">${L('حدث جسيم', 'Sentinel')}</span>` : ''}<span class="chip mute">${Q.dname(x.deptId)}</span></div>
    <h2 style="margin-top:8px">${esc(T(x.title))}</h2><p>${L('قائد الفريق', 'Lead')}: ${esc(Q.uname(r.leadId))} · ${L('فُتح', 'Opened')} ${Q.fDate(r.createdAt)}</p></div>
    <div class="row"><a class="btn btn-s" href="#/rca/${r.id}/print">${ic('print')}${L('تقرير RCA', 'RCA report')}</a>${ed && Q.can('rca.edit') ? `<button class="btn btn-p" data-act="rca-approve" data-id="${r.id}">${ic('check')}${L('اعتماد التقرير', 'Approve report')}</button>` : ''}</div></div>

  <section class="card" style="margin-bottom:16px"><div class="card-b">
    <div class="flow four">${RCA_ORDER.map((s, i) => `<div class="${i < pi || r.status === 'approved' ? 'done' : i === pi ? 'cur' : ''}">${T(Q.RCA_ST[s])}</div>`).join('')}</div>
    ${ed ? `<div class="row" style="margin-top:10px"><span class="muted">${L('نقل المرحلة إلى:', 'Move phase to:')}</span>${RCA_ORDER.slice(0, 3).filter(s => s !== r.status).map(s => `<button class="btn btn-s sm" data-act="rca-phase" data-id="${r.id}" data-v="${s}">${T(Q.RCA_ST[s])}</button>`).join('')}</div>` : ''}
  </div></section>

  <div class="two" style="margin-bottom:16px">
    <section class="card"><div class="card-h"><div><h3>${L('الفريق والاجتماع', 'Team & meeting')}</h3><p>${L(`${r.team.length} أعضاء`, `${r.team.length} members`)}</p></div>${ed ? `<button class="btn-g" data-act="rca-team" data-id="${r.id}">${ic('edit', 'sm')}${L('تعديل', 'Edit')}</button>` : ''}</div>
      <div class="card-b"><ul class="people">${r.team.map(u => `<li>${Q.avatar(u, 's')}<span>${esc(Q.uname(u))}${u === r.leadId ? ` <span class="chip ok">${L('قائد', 'Lead')}</span>` : ''}</span><small>${T(Q.ROLES[(Q.user(u) || {}).role] || ['', ''])}</small></li>`).join('')}</ul>
      <div class="meet ${r.meetingAt ? 'ok' : ''}">${ic('calendar', 'sm')}<div>${r.meetingAt ? `<b>${L('عُقد الاجتماع', 'Meeting held')}</b><small>${Q.fDate(r.meetingAt)}</small>` : `<b>${L('الاجتماع المخطط', 'Planned meeting')}: ${r.meetingPlan ? Q.fDate(r.meetingPlan) : '—'}</b><small>${meetDue ? L('المهلة', 'Due') + ' ' + Q.fDate(meetDue) + ' · ' + Q.rel(meetDue).txt : ''}</small>`}</div>${ed && !r.meetingAt ? `<button class="btn btn-s sm" data-act="rca-meet" data-id="${r.id}">${L('تسجيل انعقاده', 'Log meeting')}</button>` : ''}</div></div></section>
    <section class="card"><div class="card-h"><div><h3>${Q.isSentinel(x) ? L('المهل النظامية للحدث الجسيم', 'Sentinel timelines') : L('المهل', 'Timelines')}</h3></div></div>
      <div class="card-b">${Q.isSentinel(x) ? Q.milestones(Q.sentinelMilestones(x)) : Q.milestones([
        {t: ['تحديد SAL وفتح التحقيق', 'SAL set & RCA opened'], due: x.reportedAt, done: r.createdAt},
        {t: ['اجتماع فريق RCA', 'RCA meeting'], due: meetDue, done: r.meetingAt},
        {t: ['اعتماد تقرير RCA', 'RCA approved'], due: Q.add(x.reportedAt, Q.S().rcaReportDays * Q.DAY), done: r.approvedAt},
        {t: ['تنفيذ خطة CAPA', 'CAPA implemented'], due: Q.add(x.reportedAt, Q.S().closureDays * Q.DAY), done: x.closure && x.closure.at}])}</div></section>
  </div>

  <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('التسلسل الزمني للحدث', 'Event timeline')}</h3><p>${L('الخطوات الحرجة مميزة باللون الأحمر', 'Critical steps highlighted')}</p></div>${ed ? `<button class="btn-g" data-act="rca-ev" data-id="${r.id}">${ic('plus', 'sm')}${L('إضافة خطوة', 'Add step')}</button>` : ''}</div>
    <div class="card-b">${r.events.length ? `<ol class="events">${[...r.events].sort((a, b) => new Date(a.at) - new Date(b.at)).map(e => `<li class="${e.key ? 'bad' : ''}"><span class="tm">${Q.fDate(e.at).split(/[،,] /).pop()}</span><span class="pt"></span><p>${esc(e.text)} <small class="muted">${Q.fDate(e.at, false)}</small>${ed ? ` <button class="btn-g xs" data-act="rca-ev-del" data-id="${r.id}" data-e="${e.id}" aria-label="${L('حذف', 'Delete')}">${ic('x', 'sm')}</button>` : ''}</p></li>`).join('')}</ol>` : `<p class="muted">${L('لم تُضف خطوات بعد.', 'No steps yet.')}</p>`}</div></section>

  <div class="two" style="margin-bottom:16px">
    <section class="card"><div class="card-h"><div><h3>${L('الأسباب الخمسة', 'Five whys')}</h3></div></div>
      <form class="card-b" data-rca-whys>${ed ? `<div class="whys-edit">${(r.whys.length ? r.whys : [{q: '', a: ''}]).map((w, i) => `<div class="why-row"><span class="n">${i + 1}</span><input class="field" name="q" value="${esc(w.q)}" placeholder="${L('لماذا…؟', 'Why…?')}"><textarea class="field" name="a" rows="2" placeholder="${L('لأن…', 'Because…')}">${esc(w.a)}</textarea></div>`).join('')}</div>
        <div class="form-actions"><button type="button" class="btn btn-s sm" data-act="rca-why-add">${ic('plus', 'sm')}${L('سؤال', 'Why')}</button><button class="btn btn-p sm" type="submit">${L('حفظ', 'Save')}</button></div>`
        : `<ol class="whys">${r.whys.map((w, i) => `<li class="${i === r.whys.length - 1 ? 'root' : ''}"><div><q>${esc(w.q)}</q><span>${esc(w.a)}</span></div></li>`).join('') || `<p class="muted">—</p>`}</ol>`}</form></section>
    <section class="card"><div class="card-h"><div><h3>${L('السبب الجذري', 'Root cause')}</h3><p>${L('صياغة واحدة واضحة تُبنى عليها الإجراءات', 'One clear statement actions build on')}</p></div></div>
      <form class="card-b" data-rca-root>${ed ? `<textarea class="field block" name="rootCause" rows="5">${esc(r.rootCause)}</textarea><div class="form-actions"><button class="btn btn-p sm" type="submit">${L('حفظ', 'Save')}</button></div>` : `<div class="root-cause"><b>${L('السبب الجذري', 'Root cause')}</b>${esc(r.rootCause || '—')}</div>`}</form></section>
  </div>

  <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('العوامل المساهمة: مخطط عظمة السمكة', 'Contributing factors: fishbone')}</h3><p>${L('تصنيف ثقافة الإنصاف كما في نموذج OVR', 'Just Culture categories from the OVR form')}</p></div></div>
    <form class="card-b" data-rca-fish><div class="fish">${Object.keys(Q.FACTORS).map(k => { const v = (r.fish || {})[k] || ''; return `<div class="${v ? 'hit' : ''}"><b>${T(Q.FACTORS[k])}</b>${ed ? `<textarea class="field" name="${k}" rows="2" placeholder="—">${esc(v)}</textarea>` : `<p>${esc(v || '—')}</p>`}</div>`; }).join('')}</div>${ed ? `<div class="form-actions"><button class="btn btn-p sm" type="submit">${L('حفظ', 'Save')}</button></div>` : ''}</form></section>

  <section class="card flush"><div class="card-h"><div><h3>${L('خطة الإجراءات التصحيحية (CAPA)', 'Corrective action plan (CAPA)')}</h3><p>${L('الإجراءات المقترحة تُفعّل عند اعتماد التقرير', 'Proposed actions activate when the report is approved')}</p></div>${Q.can('capa.create') || ed ? `<button class="btn-g" data-act="capa-new" data-inc="${x.id}" data-rca="${r.id}">${ic('plus', 'sm')}${L('إجراء', 'Action')}</button>` : ''}</div>
    ${capas.length ? `<div class="tbl-wrap"><table><tbody>${capas.map(Q.capaRow).join('')}</tbody></table></div>` : `<div class="card-b"><p class="muted">${L('لا توجد إجراءات بعد.', 'No actions yet.')}</p></div>`}</section>`};
}
function mountRCA(root, r) {
  const save = (msg) => { Q.db.put('rca', r); Q.audit('rca', r.id, 'updated', msg); Q.toast(L('حُفظ', 'Saved')); Q.render(); };
  const w = $('[data-rca-whys]', root); if (w && $('[name=q]', w)) w.addEventListener('submit', e => { e.preventDefault(); const qs = $$('[name=q]', w), as = $$('[name=a]', w); r.whys = qs.map((q, i) => ({q: q.value.trim(), a: as[i].value.trim()})).filter(x => x.q || x.a); if (r.status === 'forming' && r.whys.length) r.status = 'analysis'; save('5 whys'); });
  const rc = $('[data-rca-root]', root); if (rc && rc.rootCause) rc.addEventListener('submit', e => { e.preventDefault(); r.rootCause = rc.rootCause.value.trim(); save('root cause'); });
  const f = $('[data-rca-fish]', root); if (f && $('textarea', f)) f.addEventListener('submit', e => { e.preventDefault(); r.fish = {}; $$('textarea', f).forEach(t => { if (t.value.trim()) r.fish[t.name] = t.value.trim(); }); save('fishbone'); });
}
Q.act('rca-why-add', () => { const box = $('.whys-edit'); const n = $$('.why-row', box).length + 1; box.insertAdjacentHTML('beforeend', `<div class="why-row"><span class="n">${n}</span><input class="field" name="q" placeholder="${L('لماذا…؟', 'Why…?')}"><textarea class="field" name="a" rows="2" placeholder="${L('لأن…', 'Because…')}"></textarea></div>`); $$('.why-row [name=q]', box).pop().focus(); });
Q.act('rca-phase', el => { const r = Q.db.get('rca', el.dataset.id); r.status = el.dataset.v; Q.db.put('rca', r); Q.audit('rca', r.id, 'status', T(Q.RCA_ST[r.status])); Q.render(); });
Q.act('rca-team', el => { const r = Q.db.get('rca', el.dataset.id);
  Q.modal({title: L('فريق التحقيق', 'Investigation team'), wide: true, body: `<div class="fgrid">${Q.f.sel('leadId', L('قائد الفريق', 'Team lead'), Q.userOpts(), r.leadId, {req: true, w: true})}${Q.f.multi('team', L('الأعضاء', 'Members'), Q.db.all('users').filter(u => u.active !== false).map(u => [u.id, T(u.name)]), r.team)}${Q.f.text('meetingPlan', L('موعد الاجتماع المخطط', 'Planned meeting'), Q.toInput(r.meetingPlan), {type: 'datetime-local'})}</div>`,
    onSubmit: d => { r.leadId = d.leadId; r.team = [...new Set([d.leadId, ...(d.team || [])])]; r.meetingPlan = Q.fromInput(d.meetingPlan); Q.db.put('rca', r); Q.audit('rca', r.id, 'updated', 'team'); Q.render(); Q.toast(L('حُدّث الفريق', 'Team updated')); }});
});
Q.act('rca-meet', el => { const r = Q.db.get('rca', el.dataset.id);
  Q.modal({title: L('تسجيل انعقاد اجتماع RCA', 'Log RCA meeting'), body: `<div class="fgrid">${Q.f.text('at', L('وقت الاجتماع', 'Meeting time'), Q.toInput(Q.now()), {type: 'datetime-local', req: true})}${Q.f.area('minutes', L('ملخص المحضر', 'Minutes summary'), '', {rows: 3})}</div>`,
    onSubmit: d => { r.meetingAt = Q.fromInput(d.at); if (r.status === 'forming') r.status = 'analysis'; Q.db.put('rca', r); Q.audit('rca', r.id, 'updated', L('عُقد الاجتماع', 'meeting held'));
      if (d.minutes) Q.db.put('comments', {id: Q.uid('c'), ref: r.incidentId, by: Q.me.id, at: Q.iso(Q.now()), text: L('محضر اجتماع RCA: ', 'RCA minutes: ') + d.minutes}); Q.render(); Q.toast(L('سُجّل الاجتماع', 'Meeting logged')); }});
});
Q.act('rca-ev', el => { const r = Q.db.get('rca', el.dataset.id);
  Q.modal({title: L('إضافة خطوة للتسلسل الزمني', 'Add timeline step'), body: `<div class="fgrid">${Q.f.text('at', L('الوقت', 'Time'), Q.toInput((Q.db.get('incidents', r.incidentId) || {}).occurredAt || Q.now()), {type: 'datetime-local', req: true})}${Q.f.area('text', L('ما الذي حدث؟', 'What happened?'), '', {req: true, rows: 2})}${Q.f.chk('key', L('خطوة حرجة ساهمت في الحدث', 'Critical step that contributed'), false)}</div>`,
    onSubmit: d => { r.events.push({id: Q.uid('e'), at: Q.fromInput(d.at), text: d.text, key: !!d.key}); Q.db.put('rca', r); Q.render(); }});
});
Q.act('rca-ev-del', el => { const r = Q.db.get('rca', el.dataset.id); r.events = r.events.filter(e => e.id !== el.dataset.e); Q.db.put('rca', r); Q.render(); });
Q.act('rca-approve', async el => {
  const r = Q.db.get('rca', el.dataset.id), x = Q.db.get('incidents', r.incidentId);
  const capas = Q.db.all('capa').filter(c => c.rcaId === r.id || c.incidentId === x.id);
  const miss = [];
  if (!r.meetingAt) miss.push(L('تسجيل انعقاد اجتماع الفريق', 'log the team meeting'));
  if (!r.rootCause) miss.push(L('صياغة السبب الجذري', 'write the root cause'));
  if (!capas.filter(c => c.status !== 'cancelled').length) miss.push(L('إضافة إجراء تصحيحي واحد على الأقل', 'add at least one corrective action'));
  if (Q.isSentinel(x) && !x.external) miss.push(L('تسجيل الإخطار الخارجي', 'log the external notice'));
  if (miss.length) return Q.modal({title: L('لا يمكن الاعتماد بعد', 'Not ready to approve'), body: `<p>${L('أكمل ما يلي أولًا:', 'Complete these first:')}</p><ul class="bul">${miss.map(m => `<li>${m}</li>`).join('')}</ul>`, submit: '', cancel: L('حسنًا', 'OK')});
  if (!await Q.confirm(L('سيُعتمد تقرير RCA وتُفعّل الإجراءات المقترحة وينتقل البلاغ لمرحلة التنفيذ.', 'The RCA report will be approved, proposed actions activated, and the report moved to implementation.'), {ok: L('اعتماد', 'Approve')})) return;
  r.status = 'approved'; r.approvedAt = Q.iso(Q.now()); r.approvedBy = Q.me.id; Q.db.put('rca', r);
  capas.filter(c => c.status === 'draft').forEach(c => { c.status = 'open'; Q.db.put('capa', c); Q.audit('capa', c.id, 'status', 'open'); });
  x.stage = 'action'; Q.db.put('incidents', x); Q.audit('incident', x.id, 'rca_approved', r.id); Q.audit('rca', r.id, 'rca_approved');
  Q.render(); Q.toast(L('اعتُمد تقرير RCA', 'RCA report approved'));
});

function rcaPrint(id) {
  const r = Q.db.get('rca', id), x = Q.db.get('incidents', r.incidentId);
  const capas = Q.db.all('capa').filter(c => c.rcaId === r.id || c.incidentId === x.id);
  return {title: L('تقرير RCA', 'RCA report'), cls: 'print-view', html: `
  <div class="no-print row between" style="margin-bottom:14px"><a class="btn btn-s" href="#/rca/${r.id}">${L('العودة', 'Back')}</a><button class="btn btn-p" onclick="window.print()">${ic('print')}${L('طباعة', 'Print')}</button></div>
  <article class="paper"><header class="ph"><div><b>${esc(T(Q.S().facility))}</b><small>${L('إدارة الجودة وسلامة المرضى', 'Quality & Patient Safety')}</small></div><div class="pt"><b>${L('تقرير تحليل السبب الجذري', 'Root Cause Analysis Report')}</b><small>CBAHI QM.13</small></div><div class="ltr pid">${r.id}</div></header>
    <section><h5>${L('بيانات الحدث', 'Event')}</h5><div class="pg"><div><small>${L('البلاغ', 'Report')}</small><span class="ltr">${x.id}</span></div><div><small>${L('العنوان', 'Title')}</small>${esc(T(x.title))}</div><div><small>${L('القسم', 'Dept')}</small>${Q.dname(x.deptId)}</div><div><small>${L('وقت الحدث', 'Occurred')}</small>${Q.fDate(x.occurredAt)}</div><div><small>SAL</small>${Q.sal(x) || '—'} · ${x.review ? T(Q.CLASS[x.review.classification]) : ''}</div><div><small>${L('الحالة', 'Status')}</small>${T(Q.RCA_ST[r.status])}</div></div></section>
    <section><h5>${L('الفريق', 'Team')}</h5><p>${r.team.map(u => esc(Q.uname(u)) + (u === r.leadId ? ` (${L('قائد', 'lead')})` : '')).join(L('، ', ', '))}</p><p><small>${L('الاجتماع', 'Meeting')}:</small> ${r.meetingAt ? Q.fDate(r.meetingAt) : '—'}</p></section>
    <section><h5>${L('التسلسل الزمني', 'Timeline')}</h5><ol>${[...r.events].sort((a, b) => new Date(a.at) - new Date(b.at)).map(e => `<li>${Q.fDate(e.at)}: ${esc(e.text)}${e.key ? ' ●' : ''}</li>`).join('')}</ol></section>
    <section><h5>${L('الأسباب الخمسة', 'Five whys')}</h5><ol>${r.whys.map(w => `<li><b>${esc(w.q)}</b> ${esc(w.a)}</li>`).join('')}</ol></section>
    <section><h5>${L('العوامل المساهمة', 'Contributing factors')}</h5><ul>${Object.entries(r.fish || {}).map(([k, v]) => `<li><b>${T(Q.FACTORS[k])}:</b> ${esc(v)}</li>`).join('') || '<li>—</li>'}</ul></section>
    <section><h5>${L('السبب الجذري', 'Root cause')}</h5><p>${esc(r.rootCause || '—')}</p></section>
    <section><h5>${L('خطة الإجراءات', 'Action plan')}</h5><table class="ptable"><thead><tr><th>#</th><th>${L('الإجراء', 'Action')}</th><th>${L('المسؤول', 'Owner')}</th><th>${L('الاستحقاق', 'Due')}</th><th>${L('الحالة', 'Status')}</th></tr></thead><tbody>${capas.map(c => `<tr><td class="ltr">${c.id}</td><td>${esc(c.title)}</td><td>${esc(Q.uname(c.ownerId))}</td><td>${Q.fDate(c.due, false)}</td><td>${T(CAPA_ST[Q.capaState(c)])}</td></tr>`).join('')}</tbody></table></section>
    <section><h5>${L('الاعتماد', 'Approval')}</h5><div class="pg"><div><small>${L('اعتمده', 'Approved by')}</small>${r.approvedBy ? esc(Q.uname(r.approvedBy)) : ''}</div><div><small>${L('التاريخ', 'Date')}</small>${r.approvedAt ? Q.fDate(r.approvedAt) : ''}</div><div><small>${L('التوقيع', 'Signature')}</small>&nbsp;</div></div></section>
    <footer class="pf">${L('طُبع من منصة سلامة', 'Printed from Salamah')} · ${Q.fDate(Q.now())}</footer></article>`};
}

/* =============== CAPA =============== */
const CAPA_ST = {late: ['متأخر', 'Overdue'], progress: ['قيد التنفيذ', 'In progress'], open: ['لم يبدأ', 'Not started'], draft: ['مقترح', 'Proposed'], done: ['بانتظار التحقق', 'Awaiting verification'], verified: ['مغلق ومُتحقق', 'Verified'], cancelled: ['ملغى', 'Cancelled']};
const CAPA_CLS = {late: 'crit', progress: 'info', open: 'mute', draft: 'vio', done: 'med', verified: 'ok', cancelled: 'mute'};
Q.CAPA_ST = CAPA_ST;
Q.capaState = c => ['open', 'progress'].includes(c.status) && new Date(c.due) < Q.now() ? 'late' : c.status;
Q.capaChip = c => { const s = Q.capaState(c); return `<span class="chip ${CAPA_CLS[s]}">${T(CAPA_ST[s])}</span>`; };
Q.capaRow = c => { const st = Q.capaState(c), r = Q.rel(c.due), fin = ['done', 'verified', 'cancelled'].includes(st);
  return `<tr ${Q.canSeeCAPA(c) ? `class="click" data-href="#/capa/${c.id}"` : ''}><td class="nowrap"><span class="oid">${c.id}</span><span class="t2">${c.kind === 'preventive' ? L('وقائي', 'Preventive') : L('تصحيحي', 'Corrective')}</span></td><td class="capa-text"><span class="t1" style="white-space:normal;font-weight:500">${esc(c.title)}</span>${c.incidentId ? `<span class="t2 ltr">${c.incidentId}</span>` : `<span class="t2">${T(SRC[c.source] || SRC.audit)}</span>`}</td>
    <td class="nowrap hide-m">${Q.avatar(c.ownerId, 's')} ${esc(Q.uname(c.ownerId))}</td><td class="nowrap"><span class="t1 num" style="font-weight:400">${Q.fDate(c.due, false)}</span>${fin ? '' : `<span class="due t2 ${r.cls}">${r.txt}</span>`}</td>
    <td class="hide-m"><div class="prog"><div class="track"><i style="width:${c.progress}%;background:${st === 'late' ? 'var(--red)' : 'var(--brand)'}"></i></div><span class="num">${c.progress}%</span></div></td><td>${Q.capaChip(c)}</td></tr>`; };
const SRC = {ovr: ['بلاغ سلامة', 'Safety report'], rca: ['تحقيق RCA', 'RCA'], audit: ['تدقيق داخلي', 'Internal audit'], cbahi: ['فجوة اعتماد', 'Accreditation gap'], kpi: ['مؤشر أداء', 'KPI']};
const visibleCAPA = () => Q.db.all('capa').filter(c => Q.canSeeCAPA(c));

Q.views.capa = {perm: 'capa.view', render(parts, q) {
  if (parts[0]) return capaDetail(parts[0]);
  if (q.tab) { Q.ui.capaTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.capaTab || 'active', mine = !!Q.ui.capaMine;
  const all = visibleCAPA().filter(c => !mine || c.ownerId === Q.me.id);
  const tabs = [['active', L('النشطة', 'Active'), c => ['open', 'progress', 'draft', 'done'].includes(c.status)], ['late', L('متأخرة', 'Overdue'), c => Q.capaState(c) === 'late'], ['draft', L('مقترحة', 'Proposed'), c => c.status === 'draft'], ['done', L('بانتظار التحقق', 'To verify'), c => c.status === 'done'], ['verified', L('مغلقة', 'Closed'), c => ['verified', 'cancelled'].includes(c.status)], ['all', L('الكل', 'All'), () => true]];
  const fn = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const list = all.filter(fn).sort((a, b) => (Q.capaState(b) === 'late') - (Q.capaState(a) === 'late') || new Date(a.due) - new Date(b.due));
  const closed90 = Q.db.all('capa').filter(c => c.status === 'verified' && c.verify && new Date(c.verify.at) > Q.add(Q.now(), -90 * Q.DAY));
  const onTime = closed90.length ? Math.round(closed90.filter(c => new Date(c.doneAt || c.verify.at) <= new Date(c.due)).length / closed90.length * 100) : null;
  return {title: L('الإجراءات التصحيحية', 'Corrective actions'), html: `
  <div class="page-head"><div><h2>${L('الإجراءات التصحيحية والوقائية (CAPA)', 'Corrective & preventive actions (CAPA)')}</h2><p>${L('كل إجراء مرتبط بمصدر ومسؤول وتاريخ استحقاق', 'Every action tied to a source, owner and due date')}</p></div>
    <div class="row"><button class="btn btn-s" data-act="capa-export">${ic('download')}${L('تصدير', 'Export')}</button>${Q.can('capa.create') ? `<button class="btn btn-p" data-act="capa-new">${ic('plus')}${L('إجراء جديد', 'New action')}</button>` : ''}</div></div>
  <div class="stats c3">
    ${Q.stat(L('إجراءات نشطة', 'Active actions'), all.filter(tabs[0][2]).length, L(`منها ${all.filter(c => c.status === 'draft').length} مقترحة`, `${all.filter(c => c.status === 'draft').length} proposed`))}
    ${Q.stat(L('متأخرة عن موعدها', 'Overdue'), all.filter(tabs[1][2]).length, L('تحتاج إعادة جدولة موثقة أو إنجازًا', 'Need documented rescheduling or completion'), {cls: all.filter(tabs[1][2]).length ? 'up-bad' : ''})}
    ${Q.stat(L('الإنجاز في الموعد (90 يومًا)', 'Completed on time (90 d)'), onTime != null ? `${onTime}<small>%</small>` : '—', onTime != null ? Q.track([[onTime, 'var(--brand)']]) : L('لا توجد إجراءات مغلقة', 'No closed actions'))}
  </div>
  <section class="card">
    <div class="toolbar">${Q.seg(tabs.map(([k, t, f]) => [k, t, all.filter(f).length]), tab, 'capa-tab')}<label class="check" style="margin:0"><input type="checkbox" data-act="capa-mine" ${mine ? 'checked' : ''}><span>${L('المسندة إليّ فقط', 'Assigned to me')}</span></label></div>
    <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الرقم', 'ID')}</th><th>${L('الإجراء', 'Action')}</th><th class="hide-m">${L('المسؤول', 'Owner')}</th><th>${L('الاستحقاق', 'Due')}</th><th class="hide-m">${L('الإنجاز', 'Progress')}</th><th>${L('الحالة', 'Status')}</th></tr></thead>
    <tbody>${list.length ? list.map(Q.capaRow).join('') : `<tr><td colspan="6">${Q.empty(L('لا توجد إجراءات في هذا التصنيف.', 'No actions in this view.'), 'check')}</td></tr>`}</tbody></table></div>
  </section>`};
}};
Q.act('capa-tab', el => { Q.ui.capaTab = el.dataset.v; Q.saveUI(); history.replaceState(null, '', '#/capa'); Q.render(); });
Q.act('capa-mine', el => { Q.ui.capaMine = !Q.ui.capaMine; Q.saveUI(); Q.render(); });
Q.act('capa-export', () => { const rows = [['ID', 'Action', 'Kind', 'Source', 'Report', 'Owner', 'Department', 'Due', 'Progress', 'Status']];
  visibleCAPA().forEach(c => rows.push([c.id, T(c.title), c.kind, c.source, c.incidentId || '', Q.uname(c.ownerId), Q.dname(c.deptId), Q.toDateInput(c.due), c.progress, T(CAPA_ST[Q.capaState(c)])]));
  Q.download(`salamah-capa-${Q.toDateInput(Q.now())}.csv`, Q.csv(rows), 'text/csv;charset=utf-8'); });

function capaForm(c = {}) {
  return `<div class="fgrid">
    ${Q.f.area('title', L('الإجراء المطلوب', 'Action required'), c.title || '', {req: true, rows: 2, ph: L('صياغة قابلة للقياس: ماذا، أين، وبأي معيار', 'Measurable: what, where, and by what standard')})}
    ${Q.f.sel('kind', L('النوع', 'Kind'), [['corrective', L('تصحيحي', 'Corrective')], ['preventive', L('وقائي', 'Preventive')]], c.kind || 'corrective')}
    ${Q.f.sel('source', L('المصدر', 'Source'), Object.entries(SRC).map(([k, v]) => [k, T(v)]), c.source || 'ovr')}
    ${Q.f.sel('ownerId', L('المسؤول عن التنفيذ', 'Owner'), Q.userOpts(u => u.role !== 'reporter'), c.ownerId || '', {req: true, empty: L('اختر', 'Select')})}
    ${Q.f.text('due', L('تاريخ الاستحقاق', 'Due date'), c.due ? Q.toDateInput(c.due) : Q.toDateInput(Q.add(Q.now(), 30 * Q.DAY)), {type: 'date', req: true})}
    ${Q.f.sel('incidentId', L('البلاغ المرتبط', 'Linked report'), Q.db.all('incidents').filter(x => x.stage !== 'closed' || x.id === c.incidentId).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 80).map(x => [x.id, `${x.id}: ${T(x.title)}`]), c.incidentId || '', {empty: L('بدون', 'None'), w: true})}
    ${Q.f.area('measure', L('كيف سنتحقق من الفعالية؟', 'How will effectiveness be measured?'), c.measure || '', {rows: 2, opt: L('(اختياري)', '(optional)')})}
  </div>`;
}
Q.act('capa-new', el => {
  const inc = el.dataset.inc || '', rcaId = el.dataset.rca || (inc && (Q.db.get('incidents', inc) || {}).rcaId) || null;
  Q.modal({title: L('إجراء تصحيحي جديد', 'New corrective action'), wide: true, body: capaForm({incidentId: inc, source: rcaId ? 'rca' : inc ? 'ovr' : 'audit'}),
    onSubmit: d => {
      const n = Q.db.all('capa').reduce((m, c) => Math.max(m, +c.id.replace(/\D/g, '')), 300) + 1;
      const r = rcaId && Q.db.get('rca', rcaId);
      const c = {id: `CAPA-${n}`, title: d.title.trim(), kind: d.kind, source: d.source, ownerId: d.ownerId, deptId: (Q.user(d.ownerId) || {}).deptId, due: Q.fromInput(d.due), incidentId: d.incidentId || null, rcaId: d.incidentId ? (Q.db.get('incidents', d.incidentId) || {}).rcaId || null : null, measure: d.measure,
        progress: 0, status: r && r.status !== 'approved' ? 'draft' : Q.can('capa.verify') ? 'open' : 'draft', createdAt: Q.iso(Q.now()), createdBy: Q.me.id, updates: []};
      Q.db.put('capa', c); Q.audit('capa', c.id, 'created'); if (c.incidentId) Q.audit('incident', c.incidentId, 'capa_added', c.id);
      Q.render(); Q.toast(L(`أُضيف ${c.id}`, `${c.id} added`) + (c.status === 'draft' ? L(' كإجراء مقترح', ' as proposed') : ''));
    }});
});

function capaDetail(id) {
  const c = Q.db.get('capa', id); if (!c) return {title: '—', html: Q.empty(L('الإجراء غير موجود.', 'Action not found.'), 'search')};
  if (!Q.canSeeCAPA(c)) return {title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('ليست لديك صلاحية لعرض هذا الإجراء.', 'You do not have access to this action.'), 'lock')};
  const st = Q.capaState(c), r = Q.rel(c.due), x = c.incidentId && Q.db.get('incidents', c.incidentId);
  const owner = c.ownerId === Q.me.id, qps = Q.can('capa.verify');
  const log = Q.db.all('audit').filter(a => a.ref === c.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  const acts = [];
  if (c.status === 'draft' && qps) acts.push(`<button class="btn btn-p" data-act="capa-approve" data-id="${c.id}">${ic('check')}${L('اعتماد الإجراء', 'Approve action')}</button>`);
  if (['open', 'progress'].includes(c.status) && (owner || qps)) acts.push(`<button class="btn btn-p" data-act="capa-progress" data-id="${c.id}">${L('تحديث الإنجاز', 'Update progress')}</button>`, `<button class="btn btn-s" data-act="capa-resched" data-id="${c.id}">${ic('calendar')}${L('إعادة جدولة', 'Reschedule')}</button>`);
  if (c.status === 'done' && qps) acts.push(`<button class="btn btn-p" data-act="capa-verify" data-id="${c.id}">${ic('shield')}${L('التحقق من الفعالية', 'Verify effectiveness')}</button>`);
  if (qps && !['verified', 'cancelled'].includes(c.status)) acts.push(`<button class="btn btn-s" data-act="capa-edit" data-id="${c.id}">${ic('edit')}${L('تعديل', 'Edit')}</button>`, `<button class="btn btn-s" data-act="capa-cancel" data-id="${c.id}">${L('إلغاء الإجراء', 'Cancel action')}</button>`);
  return {title: `<span class="ltr">${c.id}</span>`, html: `
  <nav class="crumbs"><a href="#/capa">${L('الإجراءات التصحيحية', 'Corrective actions')}</a>${ic('chev', 'sm flip')}<span class="ltr">${c.id}</span></nav>
  <div class="page-head"><div><div class="row">${Q.capaChip(c)}<span class="chip mute">${c.kind === 'preventive' ? L('وقائي', 'Preventive') : L('تصحيحي', 'Corrective')}</span><span class="chip mute">${T(SRC[c.source] || SRC.audit)}</span></div><h2 style="margin-top:8px;max-width:820px">${esc(c.title)}</h2></div><div class="row">${acts.join('')}</div></div>
  <div class="detail">
    <div class="detail-main">
      <section class="card" style="margin-bottom:16px"><div class="card-b">
        <div class="prog big"><div class="track"><i style="width:${c.progress}%;background:${st === 'late' ? 'var(--red)' : 'var(--brand)'}"></i></div><span class="num">${c.progress}%</span></div>
        ${c.measure ? `<div class="sec" style="margin:14px 0 0"><h4>${L('مقياس الفعالية', 'Effectiveness measure')}</h4><p>${esc(c.measure)}</p></div>` : ''}
        ${c.verify ? `<div class="note ${c.verify.effective ? '' : 'warn'}" style="margin-top:14px">${ic(c.verify.effective ? 'check' : 'alert', 'sm')}<span><b>${c.verify.effective ? L('فعّال', 'Effective') : L('غير فعّال', 'Not effective')}</b> · ${esc(Q.uname(c.verify.by))} · ${Q.fDate(c.verify.at)}<br>${esc(c.verify.note || '')}</span></div>` : ''}
      </div></section>
      <section class="card"><div class="card-h"><div><h3>${L('التحديثات', 'Updates')}</h3></div></div><div class="card-b">
        ${(c.updates || []).length ? `<ul class="thread">${[...c.updates].reverse().map(u => `<li>${Q.avatar(u.by, 's')}<div><b>${esc(Q.uname(u.by))}</b> <small>${Q.ago(u.at)}${u.progress != null ? ` · ${u.progress}%` : ''}</small><p class="pre">${esc(u.text)}</p></div></li>`).join('')}</ul>` : `<p class="muted">${L('لا توجد تحديثات بعد.', 'No updates yet.')}</p>`}
        ${log.length ? `<h4 class="subh">${L('سجل التدقيق', 'Audit trail')}</h4><ol class="log">${log.map(a => `<li><span class="t">${Q.fDate(a.at)}</span><span><b>${a.by ? esc(Q.uname(a.by)) : ''}</b> ${T(Q.AUDIT_TXT[a.action] || [a.action, a.action])}${a.detail ? ` <span class="muted">· ${esc(a.detail)}</span>` : ''}</span></li>`).join('')}</ol>` : ''}
      </div></section>
    </div>
    <aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
      <div><dt>${L('المسؤول', 'Owner')}</dt><dd>${Q.avatar(c.ownerId, 's')} ${esc(Q.uname(c.ownerId))}</dd></div>
      <div><dt>${L('القسم', 'Department')}</dt><dd>${Q.dname(c.deptId)}</dd></div>
      <div><dt>${L('الاستحقاق', 'Due')}</dt><dd>${Q.fDate(c.due, false)}${['done', 'verified', 'cancelled'].includes(c.status) ? '' : ` · <span class="due ${r.cls}">${r.txt}</span>`}</dd></div>
      ${x ? `<div><dt>${L('البلاغ', 'Report')}</dt><dd>${Q.canSeeIncident(x) ? `<a href="#/incidents/${x.id}" class="ltr">${x.id}</a>` : `<span class="ltr">${x.id}</span>`}<br><small>${esc(T(x.title))}</small></dd></div>` : ''}
      ${c.rcaId ? `<div><dt>${L('التحقيق', 'Investigation')}</dt><dd>${Q.canSeeRCA(Q.db.get('rca', c.rcaId)) ? `<a href="#/rca/${c.rcaId}" class="ltr">${c.rcaId}</a>` : `<span class="ltr">${c.rcaId}</span>`}</dd></div>` : ''}
      <div><dt>${L('أُنشئ', 'Created')}</dt><dd>${Q.fDate(c.createdAt)} · ${esc(Q.uname(c.createdBy))}</dd></div>
    </dl></div></section></aside>
  </div>`};
}
const cap = id => Q.db.get('capa', id);
Q.act('capa-approve', el => { const c = cap(el.dataset.id); c.status = 'open'; Q.db.put('capa', c); Q.audit('capa', c.id, 'status', T(CAPA_ST.open)); Q.render(); Q.toast(L('اعتُمد الإجراء وأُسند للمسؤول', 'Approved and assigned')); });
Q.act('capa-progress', el => { const c = cap(el.dataset.id);
  Q.modal({title: L('تحديث الإنجاز', 'Update progress'), body: `<div class="fgrid one"><label class="fl">${L('نسبة الإنجاز', 'Progress')} <output data-o>${c.progress}%</output><input type="range" name="progress" min="0" max="100" step="5" value="${c.progress}" class="range"></label>${Q.f.area('text', L('ما الذي تم؟', 'What was done?'), '', {req: true, rows: 3})}${Q.f.chk('done', L('اكتمل التنفيذ: أرسله للتحقق من الفعالية', 'Implementation complete: send for verification'), false)}</div>`,
    onMount: f => { const rg = $('[name=progress]', f); rg.addEventListener('input', () => { $('[data-o]', f).textContent = rg.value + '%'; $('[name=done]', f).checked = rg.value === '100'; }); $('[name=done]', f).addEventListener('change', e => { if (e.target.checked) { rg.value = 100; $('[data-o]', f).textContent = '100%'; } }); },
    onSubmit: d => { const p = d.done ? 100 : +d.progress; c.progress = p; c.status = d.done ? 'done' : p > 0 ? 'progress' : c.status; if (d.done) c.doneAt = Q.iso(Q.now());
      (c.updates = c.updates || []).push({at: Q.iso(Q.now()), by: Q.me.id, text: d.text, progress: p}); Q.db.put('capa', c); Q.audit('capa', c.id, d.done ? 'status' : 'progress', `${p}%`); Q.render(); Q.toast(d.done ? L('أُرسل للتحقق', 'Sent for verification') : L('حُدّث الإنجاز', 'Progress updated')); }});
});
Q.act('capa-resched', el => { const c = cap(el.dataset.id);
  Q.modal({title: L('إعادة جدولة الإجراء', 'Reschedule action'), sub: L('تُوثّق إعادة الجدولة ويُحتفظ بالموعد الأصلي في السجل', 'Rescheduling is logged with the original date'), body: `<div class="fgrid">${Q.f.text('due', L('الموعد الجديد', 'New due date'), Q.toDateInput(Q.add(c.due, 14 * Q.DAY)), {type: 'date', req: true})}${Q.f.area('reason', L('سبب إعادة الجدولة', 'Reason'), '', {req: true, rows: 2})}</div>`,
    onSubmit: d => { const old = Q.fDate(c.due, false); c.due = Q.fromInput(d.due); (c.updates = c.updates || []).push({at: Q.iso(Q.now()), by: Q.me.id, text: L(`أُعيدت الجدولة من ${old}: `, `Rescheduled from ${old}: `) + d.reason}); Q.db.put('capa', c); Q.audit('capa', c.id, 'rescheduled', `${old} → ${Q.fDate(c.due, false)}`); Q.render(); }});
});
Q.act('capa-verify', el => { const c = cap(el.dataset.id);
  Q.modal({title: L('التحقق من فعالية الإجراء', 'Verify effectiveness'), body: `<div class="fgrid">${Q.f.radio('effective', L('النتيجة', 'Result'), [['yes', L('فعّال: يُغلق الإجراء', 'Effective: close action')], ['no', L('غير فعّال: يعود للتنفيذ', 'Not effective: back to implementation')]], 'yes', {w: true})}${Q.f.area('note', L('الدليل على الفعالية', 'Evidence of effectiveness'), '', {req: true, rows: 3, ph: L('مثال: تدقيق 30 حالة بعد التطبيق دون ملاحظات', 'e.g. audit of 30 cases after rollout, no findings')})}</div>`,
    onSubmit: d => { const ok = d.effective === 'yes'; c.verify = {at: Q.iso(Q.now()), by: Q.me.id, effective: ok, note: d.note}; c.status = ok ? 'verified' : 'progress'; if (!ok) c.progress = 70;
      Q.db.put('capa', c); Q.audit('capa', c.id, 'verified', ok ? 'effective' : 'not effective'); Q.render(); Q.toast(ok ? L('أُغلق الإجراء', 'Action closed') : L('أُعيد للتنفيذ', 'Returned to implementation')); }});
});
Q.act('capa-edit', el => { const c = cap(el.dataset.id);
  Q.modal({title: L('تعديل الإجراء', 'Edit action'), wide: true, body: capaForm(c), onSubmit: d => { Object.assign(c, {title: d.title, kind: d.kind, source: d.source, ownerId: d.ownerId, deptId: (Q.user(d.ownerId) || {}).deptId, due: Q.fromInput(d.due), incidentId: d.incidentId || null, rcaId: d.incidentId ? (Q.db.get('incidents', d.incidentId) || {}).rcaId || null : null, measure: d.measure}); Q.db.put('capa', c); Q.audit('capa', c.id, 'updated'); Q.render(); }});
});
Q.act('capa-cancel', async el => { const c = cap(el.dataset.id); if (!await Q.confirm(L('إلغاء هذا الإجراء؟ سيبقى في السجل.', 'Cancel this action? It stays in the log.'), {danger: true, ok: L('إلغاء الإجراء', 'Cancel action')})) return;
  c.status = 'cancelled'; Q.db.put('capa', c); Q.audit('capa', c.id, 'status', T(CAPA_ST.cancelled)); Q.render(); });
})();
