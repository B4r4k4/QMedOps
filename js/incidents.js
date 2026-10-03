/* بلاغات السلامة: القائمة، التفاصيل وسير العمل، نموذج البلاغ، الطباعة */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;
const PAGE = 25;
const HARM = {none: ['لم يصل للمريض (حدث وشيك)', 'Did not reach patient (near miss)'], nh: ['وصل دون ضرر', 'Reached, no harm'], minor: ['ضرر بسيط', 'Minor harm'], mod: ['ضرر متوسط يحتاج تدخلًا', 'Moderate harm needing intervention'], serious: ['ضرر جسيم أو دائم', 'Serious or permanent harm'], death: ['وفاة', 'Death']};
const HARM_SEV = {none: 1, nh: 2, minor: 2, mod: 3, serious: 5, death: 5};

/* =============== list =============== */
Q.views.incidents = {render(parts, q) {
  if (parts[0]) return parts[1] === 'print' ? printView(parts[0]) : detailView(parts[0]);
  const f = Object.assign({stage: 'open', band: 'all', dept: 'all', type: 'all', period: '90', page: 1}, Q.ui.incF || {});
  if (q.q != null) f.q = q.q; if (q.mine) f.mine = true; if (q.stage) f.stage = q.stage;
  Q.ui.incF = Object.assign({}, f, {mine: f.mine && !!q.mine}); Q.saveUI();
  const all = Q.visibleIncidents();
  const since = f.period === 'all' ? null : Q.add(Q.now(), -(+f.period) * Q.DAY);
  const qq = (f.q || '').trim().toLowerCase();
  const list = all.filter(x => {
    if (f.mine && x.reporterId !== Q.me.id) return false;
    if (f.stage === 'open' && x.stage === 'closed') return false;
    if (f.stage !== 'open' && f.stage !== 'all' && x.stage !== f.stage) return false;
    if (f.band !== 'all' && Q.band(x) !== f.band) return false;
    if (f.dept !== 'all' && x.deptId !== f.dept) return false;
    if (f.type !== 'all' && x.typeId !== f.type) return false;
    if (since && new Date(x.occurredAt) < since && x.stage === 'closed') return false;
    if (qq && ![x.id, T(x.title), x.title.ar, x.title.en, Q.dname(x.deptId), Q.tname(x.typeId), T(x.desc), x.patient && x.patient.mrn].join(' ').toLowerCase().includes(qq)) return false;
    return true;
  }).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); const page = Math.min(f.page, pages);
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const stageOpts = [['open', L('المفتوحة', 'Open')], ['new', T(Q.STAGES.new)], ['review', T(Q.STAGES.review)], ['rca', T(Q.STAGES.rca)], ['action', T(Q.STAGES.action)], ['closed', L('المغلقة', 'Closed')], ['all', L('كل المراحل', 'All stages')]];
  return {title: L('بلاغات السلامة', 'Safety reports'), mount: root => {
    $$('[data-filter]', root).forEach(el => el.addEventListener('change', () => { Q.ui.incF[el.dataset.filter] = el.value; Q.ui.incF.page = 1; Q.saveUI(); Q.render(); }));
    const s = $('#inc-q', root); let t; s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { Q.ui.incF.q = s.value; Q.ui.incF.page = 1; Q.saveUI(); history.replaceState(null, '', '#/incidents'); Q.render(); const n = $('#inc-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); });
  }, html: `
  <div class="page-head"><div><h2>${f.mine ? L('بلاغاتي', 'My reports') : L('بلاغات السلامة (OVR)', 'Safety reports (OVR)')}</h2><p>${Q.can('incident.all') ? L('كل بلاغات المنشأة', 'All facility reports') : Q.me.role === 'supervisor' ? L(`بلاغات ${Q.dname(Q.me.deptId)} وما أرسلته`, `${Q.dname(Q.me.deptId)} and your own reports`) : L('البلاغات التي أرسلتها أو أُسندت إليك', 'Reports you filed or were assigned')}</p></div>
    <div class="row">${Q.can('incident.all') ? `<button class="btn btn-s" data-act="inc-export">${ic('download')}${L('تصدير CSV', 'Export CSV')}</button>` : ''}<a class="btn btn-p" href="#/report/new">${ic('plus')}${L('بلاغ جديد', 'New report')}</a></div></div>
  <section class="card">
    <div class="toolbar">
      <div class="search">${ic('search')}<input class="field" id="inc-q" type="search" value="${esc(f.q || '')}" placeholder="${L('رقم البلاغ، العنوان، رقم الملف…', 'ID, title, MRN…')}" aria-label="${L('بحث', 'Search')}"></div>
      <select class="field" data-filter="stage" aria-label="${L('المرحلة', 'Stage')}">${stageOpts.map(([k, t]) => `<option value="${k}" ${f.stage === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select class="field" data-filter="band" aria-label="${L('الخطورة', 'Risk')}">${[['all', L('كل مستويات الخطورة', 'All risk levels')], ['crit', L('عالٍ أو جسيم', 'High or sentinel')], ['med', L('متوسط', 'Moderate')], ['low', L('منخفض', 'Low')], ['mute', L('لم يُقيّم', 'Not rated')]].map(([k, t]) => `<option value="${k}" ${f.band === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${Q.can('incident.all') ? `<select class="field" data-filter="dept" aria-label="${L('القسم', 'Dept')}"><option value="all">${L('كل الأقسام', 'All departments')}</option>${Q.deptOpts().map(([k, t]) => `<option value="${k}" ${f.dept === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
      <select class="field" data-filter="type" aria-label="${L('النوع', 'Type')}"><option value="all">${L('كل الأنواع', 'All types')}</option>${Q.typeOpts().map(([k, t]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select class="field" data-filter="period" aria-label="${L('الفترة', 'Period')}">${[['30', L('آخر 30 يومًا', 'Last 30 days')], ['90', L('آخر 90 يومًا', 'Last 90 days')], ['365', L('آخر 12 شهرًا', 'Last 12 months')], ['all', L('كل الفترات', 'All time')]].map(([k, t]) => `<option value="${k}" ${f.period === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span class="sp">${L(`${list.length} بلاغًا`, `${list.length} reports`)}</span>
    </div>
    <div class="tbl-wrap"><table class="flush">
      <thead><tr><th>${L('البلاغ', 'Report')}</th><th>${L('القسم', 'Department')}</th><th>SAL</th><th class="hide-m">${L('وقت الحدث', 'Occurred')}</th><th class="hide-m">${L('المسؤول', 'Owner')}</th><th>${L('المرحلة', 'Stage')}</th><th>${L('المهلة', 'Due')}</th></tr></thead>
      <tbody>${rows.length ? rows.map(x => { const n = Q.nextStep(x), r = n ? Q.rel(n.due) : null; return `
        <tr class="click" data-href="#/incidents/${x.id}" tabindex="0"><td><span class="t1">${esc(T(x.title))}</span><span class="t2"><span class="oid">${x.id}</span> · ${esc(Q.tname(x.typeId))}</span></td><td class="nowrap">${Q.dshort(x.deptId)}</td><td>${Q.salChip(x)}</td>
        <td class="num hide-m nowrap">${Q.fDate(x.occurredAt)}</td><td class="hide-m nowrap">${x.review ? esc(Q.uname(x.review.ownerId)) : '<span class="muted">—</span>'}</td><td><span class="t1" style="font-weight:400;margin-bottom:4px">${T(Q.STAGES[x.stage])}</span>${stageBar(x)}</td><td>${r ? `<span class="due ${r.cls}">${r.txt}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('') : `<tr><td colspan="7">${Q.empty(L('لا توجد بلاغات مطابقة.', 'No matching reports.'), 'search')}</td></tr>`}</tbody>
    </table></div>
    ${pages > 1 ? `<div class="pager"><button class="btn btn-s sm" data-act="inc-page" data-v="${page - 1}" ${page === 1 ? 'disabled' : ''}>${L('السابق', 'Previous')}</button><span>${L(`صفحة ${page} من ${pages}`, `Page ${page} of ${pages}`)}</span><button class="btn btn-s sm" data-act="inc-page" data-v="${page + 1}" ${page === pages ? 'disabled' : ''}>${L('التالي', 'Next')}</button></div>` : ''}
  </section>`};
}};
const stageBar = x => { const i = Q.STAGE_ORDER.indexOf(x.stage); const idx = [1, 2, 3, 4, 6][i]; return `<span class="stage" title="${T(Q.STAGES[x.stage])}">${Q.FLOW.map((s, k) => `<i class="${k === 3 && !Q.needsRCA(x) && x.review ? 'skip' : k < idx ? 'on' : ''}"></i>`).join('')}</span>`; };
Q.stageBar = stageBar;
Q.act('inc-page', el => { Q.ui.incF.page = +el.dataset.v; Q.saveUI(); Q.render(); window.scrollTo(0, 0); });
Q.act('inc-export', () => {
  const rows = [['ID', 'Title', 'Type', 'Department', 'Occurred', 'Reported', 'Stage', 'Severity', 'Likelihood', 'SAL', 'Classification', 'Owner', 'Closed at', 'On time']];
  Q.visibleIncidents().forEach(x => rows.push([x.id, T(x.title), Q.tname(x.typeId), Q.dname(x.deptId), Q.toInput(x.occurredAt).replace('T', ' '), Q.toInput(x.reportedAt).replace('T', ' '), T(Q.STAGES[x.stage]), x.review ? x.review.sev : '', x.review ? x.review.lik : '', Q.sal(x) || '', x.review ? T(Q.CLASS[x.review.classification]) : '', x.review ? Q.uname(x.review.ownerId) : '', x.closure ? Q.toInput(x.closure.at).replace('T', ' ') : '', x.closure ? (x.closure.onTime ? 'Y' : 'N') : '']));
  Q.download(`salamah-ovr-${Q.toDateInput(Q.now())}.csv`, Q.csv(rows), 'text/csv;charset=utf-8'); Q.toast(L('نُزّل ملف CSV', 'CSV downloaded'));
});

/* =============== detail =============== */
function detailView(id) {
  const x = Q.db.get('incidents', id);
  if (!x || !Q.canSeeIncident(x)) return {title: L('بلاغ غير متاح', 'Report unavailable'), html: Q.empty(L('البلاغ غير موجود أو ليست لديك صلاحية عرضه.', 'Report not found or not accessible.'), 'lock', `<a class="btn btn-s" href="#/incidents">${L('العودة للبلاغات', 'Back to reports')}</a>`)};
  const n = Q.nextStep(x), r = n ? Q.rel(n.due) : null;
  const capas = Q.db.all('capa').filter(c => c.incidentId === x.id);
  const rca = x.rcaId && Q.db.get('rca', x.rcaId);
  const comments = Q.db.all('comments').filter(c => c.ref === x.id).sort((a, b) => new Date(a.at) - new Date(b.at));
  const log = Q.db.all('audit').filter(a => a.ref === x.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  const idx = [1, 2, 3, 4, 6][Q.STAGE_ORDER.indexOf(x.stage)];
  if (x.reporterId === Q.me.id && x.closure && !x.closure.seenAt) { x.closure.seenAt = Q.iso(Q.now()); Q.db.put('incidents', x); Q.audit('incident', x.id, 'feedback_read'); }
  const canEdit = (x.reporterId === Q.me.id && x.stage === 'new') || Q.can('incident.review');
  const eocOpen = Q.can('incident.review') || x.eoc;
  const hideReporter = x.anonymous && !Q.can('incident.review') && x.reporterId !== Q.me.id;
  const tab = Q.ui.incTab || 'details';
  return {title: `<span class="ltr">${x.id}</span>`, mount: root => mountDetail(root, x), html: `
  <nav class="crumbs"><a href="#/incidents">${L('بلاغات السلامة', 'Safety reports')}</a>${ic('chev', 'sm flip')}<span class="ltr">${x.id}</span></nav>
  <div class="page-head">
    <div><div class="row">${Q.salChip(x)}${Q.isSentinel(x) ? `<span class="chip crit"><span class="d"></span>${L('حدث جسيم', 'Sentinel event')}</span>` : ''}<span class="chip mute">${esc(Q.tname(x.typeId))}</span>${x.archived ? `<span class="chip mute">${L('مؤرشف', 'Archived')}</span>` : ''}</div>
      <h2 style="margin-top:8px">${esc(T(x.title))}</h2><p>${Q.dname(x.deptId)}${x.location ? ' · ' + esc(x.location) : ''} · ${L('سُجّل', 'Filed')} ${Q.fDate(x.reportedAt)}</p></div>
    <div class="row">${canEdit && x.stage !== 'closed' ? `<a class="btn btn-s" href="#/report/edit/${x.id}">${ic('edit')}${L('تعديل', 'Edit')}</a>` : ''}<a class="btn btn-s" href="#/incidents/${x.id}/print">${ic('print')}${L('نموذج OVR', 'OVR form')}</a>${x.stage === 'closed' && Q.can('incident.close') ? `<button class="btn btn-s" data-act="inc-reopen" data-id="${x.id}">${L('إعادة فتح', 'Reopen')}</button>` : ''}</div>
  </div>
  <section class="card" style="margin-bottom:16px"><div class="card-b">
    <div class="flow">${Q.FLOW.map((s, k) => `<div class="${k === 3 && x.review && !Q.needsRCA(x) ? 'na' : k < idx ? 'done' : k === idx ? 'cur' : ''}">${T(s)}</div>`).join('')}</div>
    ${n ? `<div class="next"><div><small>${L('الخطوة التالية', 'Next step')}</small><b>${T(n.what)}</b></div><span class="due ${r.cls}">${r.txt}</span><span class="muted nowrap">${L('المهلة', 'Due')} ${Q.fDate(n.due)}</span></div>` : x.closure ? `<div class="next ok"><div><small>${L('أُغلق', 'Closed')}</small><b>${Q.fDate(x.closure.at)} · ${Q.uname(x.closure.by)}</b></div><span class="chip ${x.closure.onTime ? 'ok' : 'med'}">${x.closure.onTime ? L('ضمن المهلة', 'On time') : L('بعد المهلة', 'Late')}</span></div>` : ''}
  </div></section>
  ${x.clarify && x.clarify.open ? `<div class="banner info"><div class="ico">${ic('info')}</div><div><b>${L('طلب إيضاح من المشرف', 'Clarification requested by the supervisor')}</b><p>${esc(x.clarify.text)} · ${esc(Q.uname(x.clarify.by))} · ${Q.ago(x.clarify.at)}</p></div>${x.reporterId === Q.me.id ? `<div class="act"><button class="btn btn-p sm" data-act="inc-tab" data-v="comments">${L('الرد في النقاش', 'Reply in discussion')}</button></div>` : ''}</div>` : ''}
  ${x.closure && x.reporterId === Q.me.id ? `<div class="banner ok"><div class="ico">${ic('check')}</div><div><b>${L('التغذية الراجعة على بلاغك', 'Feedback on your report')}</b><p class="pre">${esc(x.closure.feedback)}</p></div></div>` : ''}
  ${actionPanel(x, n, rca, capas)}
  <div class="detail">
    <div class="detail-main">
      <div class="tabs" role="tablist">${[['details', L('تفاصيل الحدث', 'Event details')], ['review', L('المراجعة والتقييم', 'Review & assessment')], ['comments', L(`النقاش (${comments.length})`, `Discussion (${comments.length})`)], ['log', L('سجل التدقيق', 'Audit trail')]].map(([k, t]) => `<button role="tab" data-act="inc-tab" data-v="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${t}</button>`).join('')}</div>
      ${tab === 'details' ? `<section class="card"><div class="card-b">
        <div class="sec"><h4>${L('وصف الحدث (وقائع فقط)', 'Description (facts only)')}</h4><p class="quote pre">${esc(x.desc)}</p></div>
        <div class="sec"><h4>${L('الإجراء الفوري المتخذ', 'Immediate action taken')}</h4><p class="pre">${esc(x.immediate || '—')}</p></div>
        ${x.attachments && x.attachments.length ? `<div class="sec"><h4>${L('المرفقات', 'Attachments')}</h4><ul class="files">${x.attachments.map(a => `<li>${ic('clip', 'sm')}<button class="btn-g" data-act="file-dl" data-id="${a.id}" data-name="${esc(a.name)}">${esc(a.name)}</button><small>${Q.fSize(a.size)}</small></li>`).join('')}</ul></div>` : ''}
      </div></section>` : ''}
      ${tab === 'review' ? `<section class="card"><div class="card-b">
        <div class="sec"><h4>${L('تعليق المشرف المباشر', 'Immediate supervisor')}</h4>${x.supervisor ? `<dl class="kv">
          <dt>${L('المشرف', 'Supervisor')}</dt><dd>${Q.uname(x.supervisor.by)} · ${Q.fDate(x.supervisor.at)}</dd>
          <dt>${L('التعليق والإجراء', 'Comment & action')}</dt><dd class="pre">${esc(x.supervisor.comment)}</dd>
          <dt>${L('الأسباب المحتملة', 'Possible causes')}</dt><dd class="pre">${esc(x.supervisor.causes || '—')}</dd>
          <dt>${L('ما يمنع التكرار', 'Prevention')}</dt><dd class="pre">${esc(x.supervisor.prevention || '—')}</dd>
          <dt>${L('إشعار الرئيس التنفيذي', 'CEO informed')}</dt><dd>${x.supervisor.ceoInformed ? L('نعم', 'Yes') : L('لا', 'No')}</dd></dl>` : `<p class="muted">${L('لم يُضف بعد.', 'Not added yet.')}</p>`}</div>
        <div class="sec"><h4>${L('تقييم إدارة الجودة (الجزء الرابع)', 'Quality department (Part IV)')}</h4>${x.review ? `
          <div class="salbox"><div class="score ${Q.band(x) === 'low' ? 'low' : Q.band(x)}">${Q.sal(x)}</div><div><b>${T(Q.CLASS[x.review.classification])} · ${Q.bandLabel(x)}</b><small>${L('الشدة', 'Severity')}: ${T(Q.SEV[x.review.sev])} (${x.review.sev}) × ${L('الاحتمالية', 'Likelihood')}: ${T(Q.LIK[x.review.lik])} (${x.review.lik})</small><small>${Q.uname(x.review.by)} · ${Q.fDate(x.review.at)}</small></div></div>
          <dl class="kv" style="margin-top:14px">
          <dt>${L('العوامل المساهمة', 'Contributing factors')}</dt><dd><div class="tags">${(x.review.factors || []).map(f => `<span class="chip mute">${T(Q.FACTORS[f])}</span>`).join('') || '—'}</div></dd>
          <dt>${L('تحديد الأسباب عبر', 'Causes identified by')}</dt><dd>${x.review.causesBy === 'rca' ? L('فريق RCA', 'RCA team') : L('القسم المعني', 'Concerned department')}</dd>
          <dt>${L('المسؤول عن المتابعة', 'Follow-up owner')}</dt><dd>${Q.uname(x.review.ownerId)}</dd>
          <dt>${L('ملاحظات الجودة', 'QPS notes')}</dt><dd class="pre">${esc(x.review.notes || '—')}</dd></dl>` : `<p class="muted">${L('لم تتم المراجعة بعد.', 'Not reviewed yet.')}</p>`}</div>
        ${x.external ? `<div class="sec"><h4>${L('الإخطار الخارجي', 'External notification')}</h4><dl class="kv"><dt>${L('الجهات', 'Bodies')}</dt><dd>${esc(x.external.to.join(' · '))}</dd><dt>${L('المرجع', 'Reference')}</dt><dd class="ltr">${esc(x.external.ref)}</dd><dt>${L('الوقت', 'Time')}</dt><dd>${Q.fDate(x.external.at)} · ${Q.uname(x.external.by)}</dd></dl></div>` : ''}
        ${x.closure ? `<div class="sec"><h4>${L('الإغلاق والتغذية الراجعة', 'Closure & feedback')}</h4><p class="quote pre">${esc(x.closure.feedback)}</p>${x.closure.seenAt ? `<p class="hint">${L('اطّلع عليها المبلّغ', 'Read by reporter')} ${Q.fDate(x.closure.seenAt)}</p>` : ''}</div>` : ''}
        ${eocOpen ? `<div class="sec"><h4>${L('الجزء الخامس: ضابط سلامة المرضى والبيئة (إذا كان متعلقًا ببيئة الرعاية)', 'Part V: Patient/environmental safety officer (if related to EOC)')}</h4>${x.eoc ? `<dl class="kv">
          <dt>${L('الإبلاغ في الوقت المحدد', 'Notification on time')}</dt><dd>${x.eoc.onTime ? L('نعم', 'Yes') : L('لا', 'No')}</dd>
          <dt>${L('تحديد السبب الجذري', 'Root cause identified')}</dt><dd>${x.eoc.rc ? L('نعم', 'Yes') : L('لا', 'No')}</dd>
          <dt>${L('رصد الاتجاهات', 'Trends')}</dt><dd>${x.eoc.trends ? L('نعم', 'Yes') : L('لا', 'No')}</dd>
          ${x.eoc.note ? `<dt>${L('ملاحظة', 'Note')}</dt><dd class="pre">${esc(x.eoc.note)}</dd>` : ''}
          <dt>${L('الاسم والتاريخ', 'Name & date')}</dt><dd>${esc(Q.uname(x.eoc.by))} · ${Q.fDate(x.eoc.at)}</dd></dl>` : `<p class="muted">${L('لم يُوثّق. يُستكمل للأحداث المتعلقة ببيئة الرعاية (المرافق، الأجهزة، سلامة الموظفين).', 'Not completed. Required for environment-of-care events (facility, devices, staff safety).')}</p>`}
          ${Q.can('incident.review') ? `<button class="btn btn-s sm" data-act="inc-eoc" data-id="${x.id}" style="margin-top:10px">${ic('edit', 'sm')}${x.eoc ? L('تعديل الجزء الخامس', 'Edit Part V') : L('توثيق الجزء الخامس', 'Complete Part V')}</button>` : ''}</div>` : ''}
      </div></section>` : ''}
      ${tab === 'comments' ? `<section class="card"><div class="card-b">
        ${comments.length ? `<ul class="thread">${comments.map(c => `<li>${Q.avatar(c.by, 's')}<div><b>${Q.uname(c.by)}</b> <small>${Q.ago(c.at)}</small><p class="pre">${esc(c.text)}</p></div></li>`).join('')}</ul>` : `<p class="muted">${L('لا توجد تعليقات بعد.', 'No comments yet.')}</p>`}
        <form class="comment-form" data-comment="${x.id}"><textarea class="field" name="text" rows="2" placeholder="${L('اكتب تحديثًا أو سؤالًا للفريق…', 'Write an update or question…')}" required></textarea><button class="btn btn-p sm" type="submit">${L('إرسال', 'Post')}</button></form>
      </div></section>` : ''}
      ${tab === 'log' ? `<section class="card"><div class="card-b">${log.length ? `<ol class="log">${log.map(a => `<li><span class="t">${Q.fDate(a.at)}</span><span><b>${a.by ? Q.uname(a.by) : L('النظام', 'System')}</b> ${T(Q.AUDIT_TXT[a.action] || [a.action, a.action])}${a.detail ? ` <span class="muted">· ${esc(a.detail)}</span>` : ''}</span></li>`).join('')}</ol>` : `<p class="muted">${L('لا توجد سجلات.', 'No entries.')}</p>`}</div></section>` : ''}
    </div>
    <aside class="detail-side">
      <section class="card"><div class="card-b"><dl class="meta one">
        <div><dt>${L('وقت الحدث', 'Occurred')}</dt><dd class="num">${Q.fDate(x.occurredAt)}</dd></div>
        <div><dt>${L('المتأثر', 'Affected')}</dt><dd>${T(Q.AFFECTED[x.affected] || Q.AFFECTED.other)}</dd></div>
        ${x.patient && (x.patient.mrn || x.patient.name) ? `<div><dt>${L('بيانات المريض', 'Patient')}</dt><dd>${x.patient.mrn ? `<span class="ltr num">MRN ${esc(x.patient.mrn)}</span>` : ''}${x.patient.name ? ' · ' + esc(x.patient.name) : ''}${x.patient.age ? ` · ${esc(x.patient.age)}` : ''}${x.patient.sex ? ` · ${x.patient.sex === 'M' ? L('ذكر', 'M') : L('أنثى', 'F')}` : ''}${x.patient.physician ? `<br><small>${L('الطبيب المعالج', 'Attending')}: ${esc(x.patient.physician)}</small>` : ''}${x.patient.diagnosis ? `<br><small>${L('التشخيص', 'Diagnosis')}: ${esc(x.patient.diagnosis)}</small>` : ''}</dd></div>` : ''}
        <div><dt>${L('المبلّغ', 'Reporter')}</dt><dd>${hideReporter ? L('مخفي: ثقافة الإنصاف', 'Withheld: Just Culture') : Q.uname(x.reporterId) + (x.anonymous ? ` <span class="chip mute">${L('طلب إخفاء الاسم', 'asked anonymity')}</span>` : '')}</dd></div>
        ${x.deviceTag ? `<div><dt>${L('الجهاز', 'Device')}</dt><dd>${Q.can('device.view') ? `<a href="#/devices/${x.deviceTag}" class="ltr">${esc(x.deviceTag)}</a>` : `<span class="ltr">${esc(x.deviceTag)}</span>`}</dd></div>` : ''}
        ${rca ? `<div><dt>${L('التحقيق', 'Investigation')}</dt><dd>${Q.canSeeRCA(rca) ? `<a href="#/rca/${rca.id}" class="ltr">${rca.id}</a>` : `<span class="ltr">${rca.id}</span>`} · ${T(Q.RCA_ST[rca.status])}</dd></div>` : ''}
      </dl></div></section>
      <section class="card"><div class="card-h"><div><h3>${L('الإجراءات التصحيحية', 'Corrective actions')}</h3></div>${Q.can('capa.create') && x.stage !== 'closed' && x.review ? `<button class="btn-g" data-act="capa-new" data-inc="${x.id}">${ic('plus', 'sm')}${L('إضافة', 'Add')}</button>` : ''}</div>
        <div class="card-b">${capas.length ? `<ul class="mini-list">${capas.map(c => `<li>${Q.canSeeCAPA(c) ? `<a href="#/capa/${c.id}"><span class="oid">${c.id}</span><span>${esc(c.title)}</span></a>` : `<a><span class="oid">${c.id}</span><span>${esc(c.title)}</span></a>`}${Q.capaChip(c)}</li>`).join('')}</ul>` : `<p class="muted">${L('لا توجد إجراءات مرتبطة.', 'No linked actions.')}</p>`}</div></section>
    </aside>
  </div>`};
}
Q.act('inc-tab', el => { Q.ui.incTab = el.dataset.v; Q.saveUI(); Q.render(); });

function actionPanel(x, n, rca, capas) {
  if (!n) return '';
  const me = Q.me;
  if (n.key === 'external') {
    if (!Q.can('incident.review')) return `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L('حدث جسيم: الإخطار الخارجي لم يُسجل بعد', 'Sentinel: external notice pending')}</b><p>${L('إدارة الجودة مسؤولة عن الإخطار خلال 24 ساعة من وقوع الحدث.', 'QPS must notify within 24 h of occurrence.')}</p></div></div>` + panelAfterExternal(x, rca, capas);
    return `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L('الإخطار الخارجي مطلوب', 'External notice required')}</b><p>${L('إبلاغ CBAHI ووزارة الصحة والمركز السعودي لسلامة المرضى خلال 24 ساعة من وقوع الحدث.', 'Notify CBAHI, MOH and SPSC within 24 h of occurrence.')}</p></div><div class="act"><span class="clock">${ic('clock', 'sm')}${Q.rel(n.due).txt}</span><button class="btn btn-d sm" data-act="external" data-id="${x.id}">${ic('send')}${L('تسجيل الإخطار', 'Log notice')}</button></div></div>` + panelAfterExternal(x, rca, capas);
  }
  return panelAfterExternal(x, rca, capas);
}
function panelAfterExternal(x, rca, capas) {
  const me = Q.me;
  if (x.stage === 'new') {
    const can = Q.isSupervisorOf(x) || Q.can('incident.review');
    if (!can) return info(L('بانتظار تعليق المشرف المباشر للقسم.', 'Waiting for the department supervisor’s comment.'));
    return `<section class="card act-card"><div class="card-h"><div><h3>${L('تعليق المشرف المباشر', 'Supervisor comment')}</h3><p>${L('اذكر الشدة والتكرار والسبب المحتمل وما يمنع تكرار الحدث', 'Cover severity, recurrence, possible cause and prevention')}</p></div></div>
      <form class="card-b" data-form="supervise" data-id="${x.id}"><div class="fgrid">
        ${Q.f.area('comment', L('التعليق والإجراء المتخذ', 'Comment & action taken'), '', {req: true, rows: 3})}
        ${Q.f.area('causes', L('الأسباب المحتملة', 'Possible causes'), '', {w: false, rows: 2})}
        ${Q.f.area('prevention', L('ما الذي يمنع التكرار؟', 'What would prevent recurrence?'), '', {w: false, rows: 2})}
        ${Q.f.chk('ceoInformed', L('تم إشعار الرئيس التنفيذي (مطلوب للأحداث الجسيمة)', 'CEO has been informed (required for sentinel events)'), Q.isSentinel(x))}
      </div><div class="form-actions">${x.reporterId !== me.id ? `<button type="button" class="btn btn-s" data-act="inc-return" data-id="${x.id}">${L('طلب إيضاح من المبلّغ', 'Ask reporter to clarify')}</button>` : ''}<button class="btn btn-p" type="submit">${ic('send')}${L('إرسال لإدارة الجودة', 'Send to QPS')}</button></div></form></section>`;
  }
  if (x.stage === 'review') {
    if (!Q.can('incident.review')) return info(L('البلاغ لدى إدارة الجودة لتحديد مستوى الخطورة (SAL).', 'With QPS for severity assessment (SAL).'));
    const sev = x.review ? x.review.sev : (x.harm ? HARM_SEV[x.harm] : 0), lik = x.review ? x.review.lik : 0;
    const cls = x.reporterSentinel ? 'sentinel' : x.harm === 'none' ? 'near' : 'incident';
    const owners = Q.userOpts(u => ['supervisor', 'qps', 'director', 'biomed'].includes(u.role));
    const defOwner = (Q.dept(x.deptId) || {}).headId || '';
    return `<section class="card act-card"><div class="card-h"><div><h3>${L('مراجعة الجودة وتحديد SAL', 'QPS review & SAL')}</h3><p>${L('الجزء الرابع من نموذج OVR: للاستخدام من قبل إدارة الجودة فقط', 'OVR Part IV: quality department use only')}</p></div></div>
      <form class="card-b" data-form="review" data-id="${x.id}">
        <input type="hidden" name="sev" value="${sev || ''}"><input type="hidden" name="lik" value="${lik || ''}">
        <div class="matrix-wrap">${matrix(sev, lik)}<div class="sal-result" data-salres>${salResult(sev, lik, cls)}</div></div>
        <div class="fgrid" style="margin-top:16px">
          ${Q.f.radio('classification', L('تصنيف الحالة', 'Case assessed as'), Object.entries(Q.CLASS).map(([k, v]) => [k, T(v)]), cls, {w: true})}
          ${Q.f.multi('factors', L('العوامل المساهمة (منهجية ثقافة الإنصاف)', 'Contributing factors (Just Culture)'), Object.entries(Q.FACTORS).map(([k, v]) => [k, T(v)]), x.review ? x.review.factors : [])}
          ${Q.f.sel('ownerId', L('المسؤول عن المتابعة', 'Follow-up owner'), owners, defOwner, {req: true})}
          ${Q.f.sel('causesBy', L('تُحدد الأسباب عبر', 'Causes identified through'), [['dept', L('القسم المعني', 'Concerned department')], ['rca', L('فريق RCA', 'RCA team')]], 'dept')}
          ${Q.f.area('notes', L('ملاحظات الجودة', 'QPS notes'), '', {rows: 2})}
        </div>
        <div class="form-actions"><button class="btn btn-p" type="submit">${ic('check')}${L('اعتماد التقييم', 'Confirm assessment')}</button></div></form></section>`;
  }
  if (x.stage === 'rca') return rca ? `<section class="card act-card"><div class="card-b row between"><div><b>${L('البلاغ قيد تحليل السبب الجذري', 'Under root cause analysis')}</b><p class="muted">${rca.id} · ${T(Q.RCA_ST[rca.status])} · ${L('قائد الفريق', 'Lead')}: ${Q.uname(rca.leadId)}</p></div>${Q.canSeeRCA(rca) ? `<a class="btn btn-p" href="#/rca/${rca.id}">${ic('search')}${L('فتح التحقيق', 'Open investigation')}</a>` : ''}</div></section>` : '';
  if (x.stage === 'action') {
    const open = capas.filter(c => !['verified', 'cancelled'].includes(c.status));
    if (open.length) return `<section class="card act-card"><div class="card-b row between"><div><b>${L(`${open.length} إجراءات قيد التنفيذ`, `${open.length} actions in progress`)}</b><p class="muted">${L('يُغلق البلاغ بعد التحقق من فعالية كل الإجراءات المرتبطة.', 'The report closes once every linked action is verified.')}</p></div>${Q.can('capa.create') ? `<button class="btn btn-s" data-act="capa-new" data-inc="${x.id}">${ic('plus')}${L('إجراء جديد', 'New action')}</button>` : ''}</div></section>`;
    if (!Q.can('incident.close')) return info(L('بانتظار إغلاق إدارة الجودة.', 'Awaiting QPS closure.'));
    return `<section class="card act-card"><div class="card-h"><div><h3>${L('إغلاق البلاغ', 'Close report')}</h3><p>${capas.length ? L('كل الإجراءات المرتبطة مُتحقق منها.', 'All linked actions are verified.') : L('لا توجد إجراءات مرتبطة. أضف إجراءً أو أغلق مع توثيق السبب.', 'No linked actions. Add one or close with a documented reason.')}</p></div>${Q.can('capa.create') ? `<button class="btn-g" data-act="capa-new" data-inc="${x.id}">${ic('plus', 'sm')}${L('إجراء', 'Action')}</button>` : ''}</div>
      <form class="card-b" data-form="close" data-id="${x.id}"><div class="fgrid">${Q.f.area('feedback', L('التغذية الراجعة للمبلّغ والفريق', 'Feedback to reporter & staff'), '', {req: true, rows: 3, ph: L('ما الذي تغيّر نتيجة هذا البلاغ؟', 'What changed as a result of this report?')})}</div>
      <div class="form-actions"><span class="muted">${new Date(Q.nextStep(x).due) >= Q.now() ? L('الإغلاق ضمن مهلة 45 يومًا', 'Within the 45-day window') : L('تجاوز مهلة الإغلاق', 'Past the closure window')}</span><button class="btn btn-p" type="submit">${ic('check')}${L('إغلاق البلاغ', 'Close report')}</button></div></form></section>`;
  }
  return '';
}
const info = t => `<div class="note" style="margin:0 0 16px">${ic('info', 'sm')}<span>${t}</span></div>`;

function matrix(sev, lik) {
  const th = Q.S().rcaThreshold, zone = (s, l) => s * l >= th ? 'z3' : s * l >= 6 ? 'z2' : 'z1';
  return `<div><p class="fl" style="margin-bottom:8px">${L('الشدة (الصفوف) × الاحتمالية (الأعمدة)', 'Severity (rows) × likelihood (columns)')}</p><div class="matrix" role="grid">
    <div class="corner">${L('الشدة ↓', 'Severity ↓')}</div>${[1, 2, 3, 4, 5].map(l => `<div class="hd">${T(Q.LIK[l])}<br><b>${l}</b></div>`).join('')}
    ${[5, 4, 3, 2, 1].map(s => `<div class="rh">${T(Q.SEV[s])} (${s})</div>${[1, 2, 3, 4, 5].map(l => `<button type="button" class="${zone(s, l)} ${sev === s && lik === l ? 'sel' : ''}" data-cell="${s},${l}" aria-label="${T(Q.SEV[s])} × ${T(Q.LIK[l])} = ${s * l}">${s * l}</button>`).join('')}`).join('')}</div></div>`;
}
function salResult(sev, lik, cls) {
  const s = sev * lik, th = Q.S().rcaThreshold, S = Q.S();
  const band = cls === 'sentinel' || s >= th ? 'crit' : s >= 6 ? 'med' : 'ok';
  return `<small>${L('درجة SAL', 'SAL score')}</small><div class="score ${s ? 'c-' + band : ''}">${s || '—'}</div>
    ${s ? `<b>${cls === 'sentinel' ? L('حدث جسيم', 'Sentinel') : s >= th ? L('خطورة عالية', 'High risk') : s >= 6 ? L('خطورة متوسطة', 'Moderate risk') : L('خطورة منخفضة', 'Low risk')}</b><small>${T(Q.SEV[sev])} × ${T(Q.LIK[lik])}</small>` : `<small>${L('اختر خانة من المصفوفة', 'Pick a cell')}</small>`}
    <hr><small>${L('المسار بعد الاعتماد', 'Pathway after confirmation')}</small>
    <p style="font-size:12.5px;margin-top:4px">${!s ? '—' : cls === 'sentinel' ? L(`يُفتح تحقيق RCA، إخطار خارجي خلال ${S.externalHours} ساعة، اجتماع الفريق خلال ${S.rcaMeetingDays} أيام، والتقرير خلال ${S.rcaReportDays} يومًا.`, `RCA opens; external notice in ${S.externalHours} h; meeting in ${S.rcaMeetingDays} days; report in ${S.rcaReportDays} days.`) : s >= th ? L(`يُفتح تحقيق RCA تلقائيًا، اجتماع خلال ${S.rcaMeetingDays} أيام وتنفيذ الإجراءات خلال ${S.closureDays} يومًا.`, `RCA opens automatically; meet in ${S.rcaMeetingDays} days; implement within ${S.closureDays} days.`) : L(`يُحوّل للقسم لتنفيذ الإجراءات، والإغلاق خلال ${S.closureDays} يومًا.`, `Routed to the department; close within ${S.closureDays} days.`)}</p>`;
}

function mountDetail(root, x) {
  const rf = $('[data-form="review"]', root);
  if (rf) {
    const upd = () => { const s = +rf.sev.value, l = +rf.lik.value, c = (rf.querySelector('[name=classification]:checked') || {}).value;
      $('[data-salres]', rf).innerHTML = salResult(s, l, c);
      if (c === 'sentinel' || s * l >= Q.S().rcaThreshold) rf.causesBy.value = 'rca'; };
    rf.addEventListener('click', e => { const b = e.target.closest('[data-cell]'); if (!b) return; const [s, l] = b.dataset.cell.split(','); rf.sev.value = s; rf.lik.value = l; $$('[data-cell]', rf).forEach(c => c.classList.toggle('sel', c === b)); upd(); });
    rf.addEventListener('change', upd);
  }
  const cf = $('[data-comment]', root);
  if (cf) cf.addEventListener('submit', e => { e.preventDefault(); const t = cf.text.value.trim(); if (!t) return;
    Q.db.put('comments', {id: Q.uid('c'), ref: x.id, by: Q.me.id, at: Q.iso(Q.now()), text: t}); Q.audit('incident', x.id, 'comment');
    if (x.clarify && x.clarify.open && x.reporterId === Q.me.id) { x.clarify.open = false; x.clarify.answeredAt = Q.iso(Q.now()); Q.db.put('incidents', x); Q.audit('incident', x.id, 'clarified'); }
    Q.render(); });
  $$('form[data-form]', root).forEach(f => f.addEventListener('submit', e => { e.preventDefault(); const bad = $$('[required]', f).find(el => !el.value.trim()); if (bad) { bad.focus(); Q.toast(L('أكمل الحقول الإلزامية.', 'Complete required fields.'), 'err'); return; } FORMS[f.dataset.form](Q.formData(f), x); }));
}

const FORMS = {
  supervise(d, x) {
    if (Q.isSentinel(x) && !d.ceoInformed) { Q.toast(L('الأحداث الجسيمة تتطلب إشعار الرئيس التنفيذي أولًا.', 'Sentinel events require informing the CEO first.'), 'err'); return; }
    x.supervisor = {by: Q.me.id, at: Q.iso(Q.now()), comment: d.comment, causes: d.causes, prevention: d.prevention, ceoInformed: !!d.ceoInformed};
    x.stage = 'review'; Q.db.put('incidents', x); Q.audit('incident', x.id, 'supervised'); Q.render(); Q.toast(L('أُرسل البلاغ لإدارة الجودة', 'Sent to QPS'));
  },
  review(d, x) {
    const sev = +d.sev, lik = +d.lik;
    if (!sev || !lik) { Q.toast(L('اختر خانة من مصفوفة الخطورة.', 'Pick a cell in the matrix.'), 'err'); return; }
    x.review = {at: Q.iso(Q.now()), by: Q.me.id, sev, lik, classification: d.classification || 'incident', factors: d.factors || [], ownerId: d.ownerId, causesBy: d.causesBy, notes: d.notes};
    Q.audit('incident', x.id, 'reviewed', `SAL ${sev * lik}`); Q.audit('incident', x.id, 'assigned', Q.uname(d.ownerId));
    if (Q.needsRCA(x) || d.causesBy === 'rca') {
      const n = Q.db.all('rca').reduce((m, r) => Math.max(m, +r.id.slice(-3)), 0) + 1;
      const rid = `RCA-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
      Q.db.put('rca', {id: rid, incidentId: x.id, status: 'forming', leadId: d.ownerId, team: [...new Set([d.ownerId, Q.me.id])], createdAt: Q.iso(Q.now()), meetingAt: null, meetingPlan: Q.iso(Q.add(Q.now(), Q.S().rcaMeetingDays * Q.DAY)), events: [{id: Q.uid('e'), at: x.occurredAt, text: T(x.title), key: true}], whys: [], fish: {}, rootCause: ''});
      x.rcaId = rid; x.stage = 'rca'; Q.audit('incident', x.id, 'rca_opened', rid); Q.audit('rca', rid, 'created');
      Q.db.put('incidents', x); Q.render(); Q.toast(L(`اعتُمد التقييم وفُتح التحقيق ${rid}`, `Assessment saved; ${rid} opened`));
    } else { x.stage = 'action'; Q.db.put('incidents', x); Q.render(); Q.toast(L('اعتُمد التقييم وحُوّل البلاغ للقسم', 'Assessment saved; routed to department')); }
  },
  close(d, x) {
    const due = Q.nextStep(x).due;
    x.closure = {at: Q.iso(Q.now()), by: Q.me.id, feedback: d.feedback, onTime: new Date(due) >= Q.now(), notify: true};
    x.stage = 'closed'; Q.db.put('incidents', x); Q.audit('incident', x.id, 'closed'); Q.render(); Q.toast(L('أُغلق البلاغ وأُرسلت التغذية الراجعة', 'Report closed and feedback sent'));
  }
};
Q.act('inc-reopen', async el => { const x = Q.db.get('incidents', el.dataset.id); if (!await Q.confirm(L('إعادة فتح البلاغ ستعيده لمرحلة تنفيذ الإجراءات. متابعة؟', 'Reopening returns the report to the action stage. Continue?'))) return;
  x.stage = 'action'; x.closure = null; Q.db.put('incidents', x); Q.audit('incident', x.id, 'reopened'); Q.render(); });
Q.act('inc-return', el => { const x = Q.db.get('incidents', el.dataset.id);
  Q.modal({title: L('طلب إيضاح من المبلّغ', 'Ask reporter to clarify'), body: `<div class="fgrid one">${Q.f.area('text', L('ما المطلوب توضيحه؟', 'What needs clarifying?'), '', {req: true, rows: 3})}</div>`, submit: L('إرسال', 'Send'),
    onSubmit: d => { Q.db.put('comments', {id: Q.uid('c'), ref: x.id, by: Q.me.id, at: Q.iso(Q.now()), text: L('طلب إيضاح: ', 'Clarification requested: ') + d.text}); x.clarify = {open: true, by: Q.me.id, at: Q.iso(Q.now()), text: d.text}; Q.db.put('incidents', x); Q.audit('incident', x.id, 'returned'); Q.ui.incTab = 'comments'; Q.render(); Q.toast(L('أُرسل الطلب للمبلّغ في النقاش', 'Request posted to the discussion')); }});
});
Q.act('inc-eoc', el => { const x = Q.db.get('incidents', el.dataset.id), e = x.eoc || {}, r = x.rcaId && Q.db.get('rca', x.rcaId);
  Q.modal({title: L('الجزء الخامس: بيئة الرعاية', 'Part V: Environment of care'), sub: L('يُستكمل من ضابط سلامة المرضى والبيئة', 'Completed by the patient/environmental safety officer'), body: `<div class="fgrid one">
    ${Q.f.chk('onTime', L('الإبلاغ في الوقت المحدد (خلال 24 ساعة)', 'Notification on time (within 24 h)'), x.eoc ? e.onTime : Q.reportedOnTime(x))}${Q.f.chk('rc', L('تم تحديد السبب الجذري', 'Root cause is identified'), x.eoc ? e.rc : !!((r && r.rootCause) || (x.supervisor && x.supervisor.causes)))}${Q.f.chk('trends', L('تمت مراجعة الاتجاهات', 'Trends reviewed'), !!e.trends)}${Q.f.area('note', L('ملاحظة', 'Note'), e.note || '', {rows: 2})}</div>`,
    onSubmit: d => { x.eoc = {onTime: !!d.onTime, rc: !!d.rc, trends: !!d.trends, note: d.note, by: Q.me.id, at: Q.iso(Q.now())}; Q.db.put('incidents', x); Q.audit('incident', x.id, 'eoc'); Q.render(); Q.toast(L('وُثّق الجزء الخامس', 'Part V saved')); }});
});
Q.act('file-dl', async el => { const b = await Q.db.getFile(el.dataset.id); if (!b) return Q.toast(L('الملف غير متاح في هذه البيئة (ملف تجريبي).', 'File not available (demo record).'), 'err'); Q.download(el.dataset.name, b); });

/* =============== report form (new / edit) =============== */
Q.views.report = {render(parts) {
  const editId = parts[0] === 'edit' ? parts[1] : null;
  const ex = editId && Q.db.get('incidents', editId);
  if (editId && (!ex || !((ex.reporterId === Q.me.id && ex.stage === 'new') || Q.can('incident.review')))) return {title: L('غير مسموح', 'Not allowed'), html: Q.empty(L('لا يمكن تعديل هذا البلاغ.', 'This report cannot be edited.'), 'lock')};
  const key = 'draft:' + Q.me.id;
  if (!Q.form || Q.form._for !== (editId || 'new')) {
    Q.form = ex ? {_for: editId, step: 1, typeId: ex.typeId, deptId: ex.deptId, title: T(ex.title), location: ex.location || '', occurredAt: Q.toInput(ex.occurredAt), affected: ex.affected, mrn: (ex.patient || {}).mrn || '', pname: (ex.patient || {}).name || '', age: (ex.patient || {}).age || '', sex: (ex.patient || {}).sex || '', physician: (ex.patient || {}).physician || '', diagnosis: (ex.patient || {}).diagnosis || '', desc: ex.desc, immediate: ex.immediate, anonymous: ex.anonymous, harm: ex.harm || '', sentinel: !!ex.reporterSentinel, deviceTag: ex.deviceTag || '', files: []}
      : Object.assign({_for: 'new', step: 1, typeId: '', deptId: Q.me.deptId, title: '', location: '', occurredAt: '', affected: 'in', mrn: '', pname: '', age: '', sex: '', physician: '', diagnosis: '', desc: '', immediate: '', anonymous: false, harm: '', sentinel: false, deviceTag: '', files: []}, Q.prefill ? {} : (Q.pref.get(key, null) || {}), Q.prefill || {}, {_for: 'new', step: 1});
    Q.prefill = null;
    Q.form.files = Q.form.files || [];
  }
  const F = Q.form;
  const steps = [['بيانات الحدث', 'Event details'], ['التأثير والتصنيف الأولي', 'Impact & initial classification'], ['المراجعة والإرسال', 'Review & submit']];
  let body = '';
  if (F.step === 1) {
    const isDev = (Q.db.get('types', F.typeId) || {}).cat === 'device';
    body = `<div class="fgrid">
      ${Q.f.sel('typeId', L('نوع الحدث', 'Event type'), Q.typeOpts(), F.typeId, {req: true, empty: L('اختر النوع', 'Select type')})}
      ${Q.f.sel('deptId', L('القسم الذي وقع فيه الحدث', 'Department where it occurred'), Q.deptOpts(), F.deptId, {req: true})}
      ${Q.f.text('title', L('عنوان مختصر', 'Short title'), F.title, {req: true, w: true, ph: L('مثال: سقوط مريض أثناء التوجه لدورة المياه', 'e.g. Patient fall on the way to the bathroom'), attrs: 'maxlength="120"'})}
      ${Q.f.text('occurredAt', L('تاريخ ووقت الحدث', 'Date & time of occurrence'), F.occurredAt, {req: true, type: 'datetime-local', attrs: `max="${Q.toInput(Q.now())}"`})}
      ${Q.f.text('location', L('الموقع', 'Location'), F.location, {ph: L('الغرفة أو السرير', 'Room or bed')})}
      ${isDev ? Q.f.sel('deviceTag', L('الجهاز', 'Device'), Q.db.all('devices').map(d => [d.id, `${d.id}: ${T(d.name)}`]), F.deviceTag, {empty: L('اختر الجهاز إن وُجد', 'Select device if known'), w: true}) : ''}
      ${Q.f.radio('affected', L('المتأثر', 'Affected'), Object.entries(Q.AFFECTED).map(([k, v]) => [k, T(v)]), F.affected, {w: true})}
      ${['in', 'out'].includes(F.affected) ? `<fieldset class="w addr"><legend>${L('بطاقة المريض (Addressograph)', 'Patient addressograph')}</legend><div class="fgrid three">
        ${Q.f.text('mrn', L('رقم الملف', 'MRN'), F.mrn, {ltr: true, attrs: 'inputmode="numeric"'})}${Q.f.text('pname', L('الاسم', 'Name'), F.pname, {opt: L('(اختياري)', '(optional)')})}${Q.f.text('age', L('العمر', 'Age'), F.age)}${Q.f.sel('sex', L('الجنس', 'Sex'), [['M', L('ذكر', 'Male')], ['F', L('أنثى', 'Female')]], F.sex, {empty: '—'})}${Q.f.text('physician', L('الطبيب المعالج', 'Attending physician'), F.physician)}${Q.f.text('diagnosis', L('التشخيص', 'Diagnosis'), F.diagnosis)}</div></fieldset>` : ''}
      ${Q.f.area('desc', L('وصف ما حدث (وقائع فقط)', 'What happened (facts only)'), F.desc, {req: true, rows: 4, ph: L('ماذا حدث، أين، ومتى. تجنّب الافتراضات أو إلقاء اللوم.', 'What, where, when. Avoid assumptions or blame.')})}
      ${Q.f.area('immediate', L('الإجراء الفوري المتخذ', 'Immediate action taken'), F.immediate, {req: true, rows: 2, ph: L('ما الذي تم لحماية المريض أو الموظف فورًا؟', 'What was done right away to protect the patient or staff?')})}
      <div class="fl w">${L('مرفقات', 'Attachments')} <span class="opt">${L('(صور أو مستندات، حتى 10 ميجابايت للملف)', '(images or documents, up to 10 MB each)')}</span>
        <label class="btn btn-s sm file-pick">${ic('clip', 'sm')}${L('إرفاق ملفات', 'Attach files')}<input type="file" hidden multiple data-files accept="image/*,.pdf,.doc,.docx,.xlsx"></label>${F.files.length ? `<ul class="files">${F.files.map((f, i) => `<li>${ic('clip', 'sm')}${esc(f.name)} <small>${Q.fSize(f.size)}</small><button type="button" class="btn-g" data-act="rf-unfile" data-i="${i}">${L('إزالة', 'Remove')}</button></li>`).join('')}</ul>` : ''}</div>
    </div>`;
  } else if (F.step === 2) {
    body = `<div class="fgrid">
      ${Q.f.radio('harm', L('ما مدى تأثير الحدث؟', 'What was the impact?'), Object.entries(HARM).map(([k, v]) => [k, T(v)]), F.harm, {req: true, w: true})}
      <div class="w">${Q.f.chk('sentinel', L('أعتقد أن هذا حدث جسيم (Sentinel): وفاة أو ضرر دائم أو خطير غير متوقع', 'I believe this is a sentinel event: unexpected death or serious/permanent harm'), F.sentinel)}</div>
      <div class="w">${Q.f.chk('anonymous', L('إخفاء اسمي عن غير إدارة الجودة', 'Hide my name from everyone except QPS'), F.anonymous)}</div>
    </div>
    ${F.sentinel || ['serious', 'death'].includes(F.harm) ? `<div class="note warn">${ic('alert', 'sm')}<span>${L('أبلغ مشرفك المباشر شفهيًا الآن. سيُصعَّد البلاغ فور إرساله لإدارة الجودة والرئيس التنفيذي.', 'Tell your supervisor verbally now. The report will be escalated to QPS and the CEO on submission.')}</span></div>` : ''}
    <div class="note">${ic('lock', 'sm')}<span>${L('يُعامل البلاغ وفق مبادئ ثقافة الإنصاف: الهدف تحسين النظام وليس محاسبة الأفراد. تحديد درجة الخطورة النهائية (SAL) مسؤولية إدارة الجودة.', 'Reports follow Just Culture: the aim is to fix systems, not blame people. QPS sets the final SAL score.')}</span></div>`;
  } else {
    body = `<div class="review-sheet"><dl class="kv">
      <dt>${L('نوع الحدث', 'Type')}</dt><dd>${esc(Q.tname(F.typeId))}</dd><dt>${L('القسم', 'Department')}</dt><dd>${Q.dname(F.deptId)}</dd>
      <dt>${L('العنوان', 'Title')}</dt><dd>${esc(F.title)}</dd><dt>${L('وقت الحدث', 'Occurred')}</dt><dd>${Q.fDate(Q.fromInput(F.occurredAt))}</dd>
      <dt>${L('الموقع', 'Location')}</dt><dd>${esc(F.location || '—')}</dd><dt>${L('المتأثر', 'Affected')}</dt><dd>${T(Q.AFFECTED[F.affected])}${F.mrn ? ` · <span class="ltr">MRN ${esc(F.mrn)}</span>` : ''}</dd>
      <dt>${L('الوصف', 'Description')}</dt><dd class="quote pre">${esc(F.desc)}</dd><dt>${L('الإجراء الفوري', 'Immediate action')}</dt><dd class="pre">${esc(F.immediate || '—')}</dd>
      <dt>${L('التأثير', 'Impact')}</dt><dd>${F.harm ? T(HARM[F.harm]) : '—'}${F.sentinel ? ` <span class="chip crit">${L('حدث جسيم محتمل', 'Possible sentinel')}</span>` : ''}</dd>
      <dt>${L('المرفقات', 'Attachments')}</dt><dd>${F.files.length ? F.files.map(f => esc(f.name)).join(L('، ', ', ')) : '—'}</dd>
      <dt>${L('المبلّغ', 'Reporter')}</dt><dd>${esc(T(Q.me.name))}${F.anonymous ? ` · ${L('الاسم مخفي', 'name hidden')}` : ''}</dd></dl>
      <button type="button" class="btn-g" data-act="rf-step" data-v="1" style="padding:0;margin-top:8px">${L('تعديل البيانات', 'Edit details')}</button></div>`;
  }
  return {title: ex ? L('تعديل بلاغ', 'Edit report') : L('بلاغ سلامة جديد', 'New safety report'), mount: mountForm, html: `
  <nav class="crumbs"><a href="#/incidents">${L('بلاغات السلامة', 'Safety reports')}</a>${ic('chev', 'sm flip')}<span>${ex ? `<span class="ltr">${ex.id}</span>` : L('بلاغ جديد', 'New report')}</span></nav>
  <div class="form-page">
    <section class="card">
      <div class="steps">${steps.map((s, i) => `<div class="${F.step === i + 1 ? 'on' : F.step > i + 1 ? 'done' : ''}"><i>${F.step > i + 1 ? '✓' : i + 1}</i><span>${T(s)}</span></div>`).join('')}</div>
      <form class="card-b" data-report novalidate>${body}</form>
      <div class="dlg-f"><span class="err" data-err></span><span class="sp"></span>
        ${F.step > 1 ? `<button type="button" class="btn btn-s" data-act="rf-step" data-v="${F.step - 1}">${L('السابق', 'Back')}</button>` : (!ex ? `<button type="button" class="btn btn-s" data-act="rf-draft">${L('حفظ كمسودة', 'Save draft')}</button>` : `<a class="btn btn-s" href="#/incidents/${ex.id}">${L('إلغاء', 'Cancel')}</a>`)}
        ${F.step < 3 ? `<button type="button" class="btn btn-p" data-act="rf-next">${L('التالي', 'Next')}</button>` : `<button type="button" class="btn btn-p" data-act="rf-submit">${ic('send')}${ex ? L('حفظ التعديلات', 'Save changes') : L('إرسال البلاغ', 'Submit report')}</button>`}
      </div>
    </section>
    <aside class="form-aside">
      <h4>${L('قبل أن تبدأ', 'Before you start')}</h4>
      <ul><li>${L('أبلغ عن كل حدث أو حدث وشيك، حتى لو لم يتضرر أحد.', 'Report every event or near miss, even without harm.')}</li><li>${L('اكتب الوقائع كما رأيتها، دون تحليل أو لوم.', 'Write facts as you saw them: no analysis or blame.')}</li><li>${L('الأحداث الجسيمة: أبلغ المشرف شفهيًا فورًا ثم سجّل البلاغ.', 'Sentinel events: tell your supervisor now, then file.')}</li><li>${L('المهلة: خلال 24 ساعة من وقوع الحدث.', 'Deadline: within 24 hours of the event.')}</li></ul>
    </aside>
  </div>`};
}};
function syncForm() { const f = $('[data-report]'); if (!f) return; const d = Q.formData(f);
  Object.keys(d).forEach(k => { Q.form[k] = d[k]; }); ['sentinel', 'anonymous'].forEach(k => { if (f.querySelector(`[name=${k}]`)) Q.form[k] = !!d[k]; }); }
function mountForm(root) {
  const f = $('[data-report]', root);
  f.addEventListener('change', e => { syncForm(); if (['affected', 'typeId', 'harm', 'sentinel'].includes(e.target.name)) { if (e.target.name === 'harm' && ['serious', 'death'].includes(Q.form.harm)) Q.form.sentinel = true; Q.render(); } });
  f.addEventListener('input', () => syncForm());
  const fi = $('[data-files]', f);
  if (fi) fi.addEventListener('change', async () => { syncForm();
    for (const file of fi.files) { if (file.size > 10 * 1048576) { Q.toast(L(`${file.name} أكبر من 10 ميجابايت`, `${file.name} exceeds 10 MB`), 'err'); continue; }
      const id = Q.uid('file'); await Q.db.putFile(id, file); Q.form.files.push({id, name: file.name, size: file.size, type: file.type}); }
    Q.render(); });
}
const validate = s => { const F = Q.form;
  if (s === 1) { if (!F.typeId || !F.deptId || !String(F.title).trim() || !F.occurredAt || String(F.desc).trim().length < 20 || !String(F.immediate || '').trim()) return L('أكمل الحقول الإلزامية (ومنها الإجراء الفوري المتخذ)، واكتب وصفًا لا يقل عن 20 حرفًا.', 'Complete the required fields (including the immediate action taken); the description needs at least 20 characters.');
    if (new Date(F.occurredAt) > Q.now()) return L('وقت الحدث لا يمكن أن يكون في المستقبل.', 'Occurrence time cannot be in the future.'); }
  if (s === 2 && !F.harm) return L('حدد مدى تأثير الحدث.', 'Select the impact.');
  return ''; };
Q.act('rf-next', () => { syncForm(); const e = validate(Q.form.step); if (e) { $('[data-err]').textContent = e; return; } Q.form.step++; Q.render(); window.scrollTo(0, 0); });
Q.act('rf-step', el => { syncForm(); Q.form.step = +el.dataset.v; Q.render(); });
Q.act('rf-unfile', el => { syncForm(); const [f] = Q.form.files.splice(+el.dataset.i, 1); if (f) Q.db.delFile(f.id); Q.render(); });
Q.act('rf-draft', () => { syncForm(); const d = Object.assign({}, Q.form, {savedAt: Q.iso(Q.now())}); Q.pref.set('draft:' + Q.me.id, d); Q.form = null; Q.toast(L('حُفظت المسودة على هذا الجهاز', 'Draft saved on this device')); Q.go('#/tasks'); });
Q.act('rf-submit', () => {
  syncForm(); const F = Q.form; const e = validate(1) || validate(2); if (e) { $('[data-err]').textContent = e; return; }
  const patient = ['in', 'out'].includes(F.affected) ? {mrn: F.mrn, name: F.pname, age: F.age, sex: F.sex, physician: F.physician, diagnosis: F.diagnosis} : null;
  if (F._for !== 'new') {
    const x = Q.db.get('incidents', F._for);
    Object.assign(x, {typeId: F.typeId, deptId: F.deptId, title: {ar: F.title, en: F.title}, location: F.location, occurredAt: Q.fromInput(F.occurredAt), affected: F.affected, patient, desc: F.desc, immediate: F.immediate, anonymous: !!F.anonymous, harm: F.harm, reporterSentinel: !!F.sentinel, deviceTag: F.deviceTag || null, attachments: (x.attachments || []).concat(F.files)});
    if (x.clarify && x.clarify.open && x.reporterId === Q.me.id) { x.clarify.open = false; x.clarify.answeredAt = Q.iso(Q.now()); Q.audit('incident', x.id, 'clarified'); }
    Q.db.put('incidents', x); Q.audit('incident', x.id, 'updated'); Q.form = null; Q.go('#/incidents/' + x.id); Q.toast(L('حُفظت التعديلات', 'Changes saved')); return;
  }
  const yr = new Date().getFullYear();
  const n = Q.db.all('incidents').filter(x => x.id.startsWith(`OVR-${yr}-`)).reduce((m, x) => Math.max(m, +x.id.slice(-4)), 0) + 1;
  const id = `OVR-${yr}-${String(n).padStart(4, '0')}`;
  const x = {id, typeId: F.typeId, deptId: F.deptId, title: {ar: F.title, en: F.title}, location: F.location, occurredAt: Q.fromInput(F.occurredAt), reportedAt: Q.iso(Q.now()), createdAt: Q.iso(Q.now()), reporterId: Q.me.id, anonymous: !!F.anonymous,
    affected: F.affected, patient, desc: F.desc, immediate: F.immediate, harm: F.harm, reporterSentinel: !!F.sentinel, deviceTag: F.deviceTag || null, attachments: F.files, stage: 'new'};
  Q.db.put('incidents', x); Q.audit('incident', id, 'submitted');
  if (x.deviceTag) { const d = Q.db.get('devices', x.deviceTag); if (d && d.status === 'ok') { d.status = 'check'; Q.db.put('devices', d); } }
  Q.pref.del('draft:' + Q.me.id); Q.form = null;
  Q.go('#/incidents/' + id);
  Q.toast(x.reporterSentinel ? L(`أُرسل ${id} وصُعّد كحدث جسيم محتمل`, `${id} submitted and escalated as possible sentinel`) : L(`أُرسل ${id} إلى مشرف ${Q.dshort(x.deptId)}`, `${id} sent to the ${Q.dshort(x.deptId)} supervisor`));
});

/* =============== printable OVR form =============== */
function printView(id) {
  const x = Q.db.get('incidents', id);
  if (!x || !Q.canSeeIncident(x)) return {title: '—', html: Q.empty(L('غير متاح', 'Unavailable'), 'lock')};
  const box = (on, t) => `<span class="pbox ${on ? 'on' : ''}"></span>${t}`;
  const p = x.patient || {}, s = x.supervisor || {}, r = x.review || {}, e = x.eoc || {};
  const hideRep = x.anonymous && !Q.can('incident.review');
  return {title: L('نموذج OVR', 'OVR form'), cls: 'print-view', html: `
  <div class="no-print row between" style="margin-bottom:14px"><a class="btn btn-s" href="#/incidents/${x.id}">${ic('chev', 'sm')}${L('العودة', 'Back')}</a><button class="btn btn-p" onclick="window.print()">${ic('print')}${L('طباعة', 'Print')}</button></div>
  <article class="paper">
    <header class="ph"><div><b>${esc(T(Q.S().facility))}</b><small>${L('إدارة الجودة وسلامة المرضى', 'Quality & Patient Safety')}</small></div><div class="pt"><b>${L('تقرير حادثة / حدث وشيك', 'Occurrence Variance Report')}</b><small>AD-111 · OVR</small></div><div class="ltr pid">${x.id}</div></header>
    <section><h5>${L('بطاقة المريض', 'Patient addressograph')}</h5><div class="pg">
      <div><small>${L('الاسم', 'Name')}</small>${esc(p.name || '')}</div><div><small>MRN</small><span class="ltr">${esc(p.mrn || '')}</span></div><div><small>${L('العمر', 'Age')}</small>${esc(p.age || '')}</div><div><small>${L('الجنس', 'Sex')}</small>${box(p.sex === 'M', L('ذكر', 'Male'))} ${box(p.sex === 'F', L('أنثى', 'Female'))}</div>
      <div><small>${L('الطبيب المعالج', 'Attending physician')}</small>${esc(p.physician || '')}</div><div><small>${L('التشخيص', 'Diagnosis')}</small>${esc(p.diagnosis || '')}</div>
      <div><small>${L('الوحدة / الموقع', 'Unit / location')}</small>${Q.dname(x.deptId)}${x.location ? ' · ' + esc(x.location) : ''}</div><div><small>${L('التاريخ', 'Date')}</small>${Q.fDate(x.occurredAt, false)}</div></div></section>
    <section><h5>${L('الجزء الأول: تفاصيل الحادثة', 'Part I: Incident details')}</h5>
      <p class="boxes"><small>${L('المتأثر', 'Affected')}:</small> ${Object.entries(Q.AFFECTED).map(([k, v]) => box(x.affected === k, T(v))).join(' ')}</p>
      <div class="pg"><div><small>${L('اسم المبلّغ (اختياري)', 'Reporter (optional)')}</small>${hideRep ? L('مخفي', 'Withheld') : esc(Q.uname(x.reporterId))}</div><div><small>${L('وقت الإبلاغ', 'Reported')}</small>${Q.fDate(x.reportedAt)}</div><div><small>${L('وقت الحدث', 'Occurred')}</small>${Q.fDate(x.occurredAt)}</div><div><small>${L('نوع الحادثة', 'Type')}</small>${esc(Q.tname(x.typeId))}</div></div></section>
    <section><h5>${L('الجزء الثاني: وصف الحادثة (وقائع فقط)', 'Part II: Description (facts only)')}</h5><p class="pre">${esc(x.desc)}</p></section>
    <section><h5>${L('الجزء الثالث: الإجراء التصحيحي الفوري', 'Part III: Immediate corrective action')}</h5><p class="pre">${esc(x.immediate || '')}</p>
      <div class="sig"><small>${L('تعليق المشرف المباشر', 'Immediate supervisor comments')}</small><p class="pre">${esc(s.comment || '')}${s.causes ? '\n' + L('الأسباب المحتملة: ', 'Possible causes: ') + esc(s.causes) : ''}${s.prevention ? '\n' + L('منع التكرار: ', 'Prevention: ') + esc(s.prevention) : ''}</p><div class="pg"><div><small>${L('الاسم', 'Name')}</small>${s.by ? esc(Q.uname(s.by)) : ''}</div><div><small>${L('وقت الإشعار', 'Notified at')}</small>${s.at ? Q.fDate(s.at) : ''}</div></div></div></section>
    <section><h5>${L('الجزء الرابع: لاستخدام إدارة الجودة فقط', 'Part IV: Quality management use only')}</h5>
      <p class="boxes"><small>${L('مستوى الشدة', 'Severity')}:</small> ${[5, 4, 3, 2, 1].map(v => box(r.sev === v, `${T(Q.SEV[v])} (${v})`)).join(' ')}</p>
      <p class="boxes"><small>${L('التكرار', 'Frequency')}:</small> ${[5, 4, 3, 2, 1].map(v => box(r.lik === v, `${T(Q.LIK[v])} (${v})`)).join(' ')}</p>
      <p><small>${L('المجموع', 'Total score')}:</small> <b>${Q.sal(x) || '____'}</b></p>
      <p class="boxes"><small>${L('التصنيف', 'Case assessed as')}:</small> ${Object.entries(Q.CLASS).map(([k, v]) => box(r.classification === k, T(v))).join(' ')}</p>
      <p class="boxes"><small>${L('العوامل المساهمة', 'Contributing factors')}:</small> ${Object.entries(Q.FACTORS).map(([k, v]) => box((r.factors || []).includes(k), T(v))).join(' ')}</p>
      <p class="boxes"><small>${L('حُددت الأسباب عبر', 'Causes identified through')}:</small> ${box(r.causesBy === 'rca', L('فريق RCA', 'RCA team'))} ${box(r.causesBy === 'dept', L('القسم المعني', 'Concerned department'))}</p>
      <p><small>${L('خطة الإجراءات التصحيحية', 'Corrective action plan')}:</small></p><ol>${Q.db.all('capa').filter(c => c.incidentId === x.id).map(c => `<li>${esc(c.title)}: ${esc(Q.uname(c.ownerId))} · ${Q.fDate(c.due, false)}</li>`).join('') || '<li>&nbsp;</li>'}</ol>
      <p class="boxes"><small>${L('الإبلاغ في الوقت المحدد', 'Notification on time')}:</small> ${box(Q.reportedOnTime(x), L('نعم', 'Yes'))} ${box(!Q.reportedOnTime(x), L('لا', 'No'))} <small>${L('(خلال 24 ساعة من وقوع الحدث)', '(within 24 h of occurrence)')}</small></p>
      <div class="pg"><div><small>${L('الاسم', 'Name')}</small>${r.by ? esc(Q.uname(r.by)) : ''}</div><div><small>${L('التاريخ', 'Date')}</small>${r.at ? Q.fDate(r.at) : ''}</div><div><small>${L('التوقيع', 'Signature')}</small>&nbsp;</div></div></section>
    <section><h5>${L('الجزء الخامس: ضابط سلامة المرضى والبيئة (إذا كان متعلقًا ببيئة الرعاية)', 'Part V: Patient/environmental safety officer (if related to EOC)')}</h5>
      <p class="boxes">${box(e.onTime, L('الإبلاغ في الوقت المحدد', 'Notification on time'))} ${box(e.rc, L('تحديد السبب الجذري', 'RC is identified'))} ${box(e.trends, L('رصد الاتجاهات', 'Trends'))}</p>${e.note ? `<p class="pre">${esc(e.note)}</p>` : ''}
      <div class="pg"><div><small>${L('الاسم', 'Name')}</small>${e.by ? esc(Q.uname(e.by)) : ''}</div><div><small>${L('التاريخ', 'Date')}</small>${e.at ? Q.fDate(e.at) : ''}</div><div><small>${L('التوقيع', 'Signature')}</small>&nbsp;</div></div></section>
    <footer class="pf">${L('طُبع من منصة سلامة', 'Printed from Salamah')} · ${Q.fDate(Q.now())} · ${esc(T(Q.me.name))}</footer>
  </article>`};
}
})();
