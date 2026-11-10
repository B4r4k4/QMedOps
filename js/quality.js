/* مهام قسم الجودة: السياسات والإجراءات · شكاوى المرضى · جولات الجودة
   Policies (document control: prepare → approve → in force → periodic review, read-and-sign),
   patient complaints (log → assign → investigate → respond within SLA → close, escalate to OVR),
   quality rounds (checklist template → schedule → conduct → score → findings become CAPA). */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;
const DAY = Q.DAY;
const now = () => Q.now();

Object.assign(Q.AUDIT_TXT, {
  pol_submitted: ['أرسل السياسة للاعتماد', 'submitted the policy for approval'], pol_approved: ['اعتمد السياسة', 'approved the policy'],
  pol_returned: ['رفض الوثيقة وأعادها للمُعد', 'rejected and returned to the author'], pol_signed: ['اعتمد بتوقيع إلكتروني', 'approved with e-signature'], pol_signed_review: ['وقّع المراجعة', 'signed the review'], pol_revision: ['بدأ مراجعة السياسة', 'started a policy revision'],
  pol_reviewed: ['راجع السياسة دون تعديل', 'reviewed the policy with no change'], pol_archived: ['أوقف العمل بالسياسة', 'retired the policy'], pol_ack: ['أقرّ بالاطلاع', 'acknowledged reading'],
  cmp_logged: ['سجّل الشكوى', 'logged the complaint'], cmp_assigned: ['أسند الشكوى', 'assigned the complaint'], cmp_findings: ['وثّق نتائج التحقق', 'recorded investigation findings'],
  cmp_responded: ['ردّ على المشتكي', 'responded to the complainant'], cmp_closed: ['أغلق الشكوى', 'closed the complaint'], cmp_escalated: ['حوّل الشكوى لبلاغ سلامة', 'escalated to a safety report'],
  rnd_planned: ['جدول الجولة', 'scheduled the round'], sfda: ['سجّل البلاغ الرقابي (SFDA)', 'logged the regulator (SFDA) report'], rated: ['قيّم عنصر القياس', 'rated a measurable element'], rnd_done: ['نفّذ الجولة', 'completed the round'], rnd_cancelled: ['ألغى الجولة', 'cancelled the round']
});

const usersOf = deptId => Q.db.all('users').filter(u => u.active !== false && (deptId === 'all' || u.deptId === deptId));
const staffOpts = () => Q.userOpts(u => u.role !== 'reporter');
const scopeName = id => id === 'all' ? L('كل المنشأة', 'Whole facility') : Q.dname(id);
const nextId = (col, prefix) => { const y = new Date().getFullYear(); const n = Q.idObjs(col).filter(x => String(x.id).startsWith(`${prefix}-${y}-`)).reduce((m, x) => Math.max(m, +x.id.slice(-3) || 0), 0) + 1; return `${prefix}-${y}-${String(n).padStart(3, '0')}`; };
const logOf = ref => Q.db.all('audit').filter(a => a.ref === ref).sort((a, b) => new Date(b.at) - new Date(a.at));
const logHTML = log => log.length ? `<h4 class="subh">${L('سجل التدقيق', 'Audit trail')}</h4><ol class="log">${log.map(a => `<li><span class="t">${Q.fDate(a.at)}</span><span><b>${a.by ? esc(Q.uname(a.by)) : ''}</b> ${T(Q.AUDIT_TXT[a.action] || [a.action, a.action])}${a.detail ? ` <span class="muted">· ${esc(a.detail)}</span>` : ''}</span></li>`).join('')}</ol>` : '';
const notFound = (t, icon) => ({title: '—', html: Q.empty(t, icon)});
const denied = () => ({title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('ليست لديك صلاحية لعرض هذا السجل.', 'You do not have access to this record.'), 'lock')});

/* ======================================================================
   DOCUMENT CONTROL: POLICIES, PROCEDURES, FORMS & PLANS
   DOC-01 register · DOC-02 multi-step approval with e-signature · DOC-03 read-and-sign with deadline and escalation
   DOC-04 form/template control: only the version in force reaches users, retired documents disappear for them
   ====================================================================== */
const POL_ST = {draft: ['مسودة', 'Draft', 'mute'], review: ['قيد المراجعة والاعتماد', 'In review & approval', 'med'], approved: ['معتمدة وسارية', 'Approved, in force', 'ok'], archived: ['موقوفة', 'Retired', 'mute']};
const POL_CAT = {admin: ['إدارية', 'Administrative'], clinical: ['سريرية', 'Clinical'], ipc: ['مكافحة العدوى', 'Infection control'], safety: ['سلامة المرضى', 'Patient safety'], mm: ['الأدوية', 'Medication'], fms: ['المرافق والسلامة', 'Facility & safety'], hr: ['الموارد البشرية', 'Human resources']};
const DOC_KIND = {policy: ['سياسة', 'Policy'], procedure: ['إجراء', 'Procedure'], form: ['نموذج', 'Form'], plan: ['خطة', 'Plan']};
Q.POL_ST = POL_ST; Q.DOC_KIND = DOC_KIND;
Q.polInForce = p => !!p.live && p.status !== 'archived';
Q.polOverdue = p => Q.polInForce(p) && !!p.reviewDue && new Date(p.reviewDue) < now();
Q.polDueSoon = p => Q.polInForce(p) && !!p.reviewDue && !Q.polOverdue(p) && new Date(p.reviewDue) < Q.add(now(), Q.S().policyAlertDays * DAY);
Q.polAudience = p => usersOf(p.deptId || 'all');
Q.polAckPct = p => { const a = Q.polAudience(p); if (!a.length) return null; return Math.round(a.filter(u => (p.acks || {})[u.id]).length / a.length * 100); };
Q.polAckLate = p => Q.polInForce(p) && p.ackRequired !== false && !!p.ackDue && new Date(p.ackDue) < now() && (Q.polAckPct(p) ?? 100) < 100;
Q.canEditPolicy = (p, u = Q.me) => !!u && Q.can('policy.edit', u) && (u.role !== 'supervisor' || p.deptId === u.deptId || p.ownerId === u.id);
/* approval chain: reviewers then approvers, in order, every one required. Each step is an e-signature. */
Q.polChain = p => [...(p.reviewers || []).map(id => ({id, step: 'review'})), ...(p.approvers || []).map(id => ({id, step: 'approve'}))];
Q.polNext = p => { if (p.status !== 'review') return null; const signed = new Set((p.signatures || []).filter(s => s.decision !== 'reject').map(s => s.userId));
  const chain = Q.polChain(p); if (!chain.length) return {id: null, step: 'approve'}; /* legacy record without a chain: any approver */
  return chain.find(c => !signed.has(c.id)) || null; };
/* separation of duties: the preparer of a version never signs it */
Q.canSignPolicy = (p, u = Q.me) => { const n = Q.polNext(p); if (!n || !u || p.preparedBy === u.id) return false; return n.id ? n.id === u.id : Q.can('policy.approve', u); };
Q.canApprovePolicy = Q.canSignPolicy;
/* DOC-04: users only ever see the version in force; retired documents vanish for them */
Q.polVisible = (p, u = Q.me) => p.status !== 'archived' || Q.can('policy.edit', u);
Q.polFilesFor = (p, u = Q.me) => (p.files || []).filter(f => Q.canEditPolicy(p, u) || (p.live && (f.version || 1) === p.live.version));
Q.policyAlerts = () => Q.db.all('policies').filter(p => Q.polOverdue(p) || Q.canSignPolicy(p)).map(p => p.id + p.status);
const kindName = p => T(DOC_KIND[p.kind || 'policy']);
const polChip = p => `<span class="chip ${Q.polOverdue(p) ? 'crit' : POL_ST[p.status][2]}">${Q.polOverdue(p) ? L('متأخرة المراجعة', 'Review overdue') : T(POL_ST[p.status])}</span>`;

Q.views.policies = {perm: 'policy.view', render(parts, q) {
  if (parts[0]) return policyDetail(parts[0]);
  if (q.tab) { Q.ui.polTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.polTab || 'force', kind = Q.ui.polKind || 'all';
  const all = Q.db.all('policies').filter(p => Q.polVisible(p) && (kind === 'all' || (p.kind || 'policy') === kind));
  const tabs = [
    ['force', L('السارية', 'In force'), p => Q.polInForce(p)],
    ['overdue', L('متأخرة المراجعة', 'Review overdue'), p => Q.polOverdue(p)],
    ['soon', L('تقترب من المراجعة', 'Review due soon'), p => Q.polDueSoon(p)],
    ['ack', L('الاطلاع دون 100% بعد المهلة', 'Read-and-sign late'), p => Q.polAckLate(p)],
    ['work', L('قيد الإعداد والاعتماد', 'Being prepared / approved'), p => ['draft', 'review'].includes(p.status)]];
  if (Q.can('policy.edit')) tabs.push(['archived', L('الموقوفة', 'Retired'), p => p.status === 'archived']);
  tabs.push(['all', L('الكل', 'All'), () => true]);
  const fn = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const list = all.filter(fn).sort((a, b) => (Q.polOverdue(b) - Q.polOverdue(a)) || String(a.code).localeCompare(b.code));
  const force = all.filter(Q.polInForce), od = all.filter(Q.polOverdue);
  const myUnread = force.filter(p => p.ackRequired !== false && Q.polAudience(p).some(u => u.id === Q.me.id) && !(p.acks || {})[Q.me.id]);
  const ackVals = force.filter(p => p.ackRequired !== false).map(Q.polAckPct).filter(v => v != null);
  const ackAvg = ackVals.length ? Math.round(ackVals.reduce((a, b) => a + b, 0) / ackVals.length) : null;
  return {title: L('السياسات والإجراءات', 'Policies & procedures'), html: `
  <div class="page-head"><div><h2>${L('ضبط الوثائق: السياسات والإجراءات والنماذج', 'Document control: policies, procedures & forms')}</h2><p>${L(`إعداد ← مراجعة واعتماد متعدد الخطوات بتوقيع إلكتروني ← سريان ← مراجعة كل ${Q.S().policyReviewYears} سنوات · إقرار الاطلاع خلال ${Q.S().ackDays} يومًا`, `Prepare → multi-step review & approval with e-signature → in force → review every ${Q.S().policyReviewYears} years · read-and-sign within ${Q.S().ackDays} days`)}</p></div>
    <div class="row">${Q.can('policy.edit') ? `<button class="btn btn-s" data-act="pol-export">${ic('download')}${L('تصدير', 'Export')}</button><button class="btn btn-p" data-act="pol-new">${ic('plus')}${L('وثيقة جديدة', 'New document')}</button>` : ''}</div></div>
  ${myUnread.length ? `<div class="banner info"><div class="ico">${ic('book')}</div><div><b>${L(`${myUnread.length} وثائق بانتظار إقرارك بالاطلاع`, `${myUnread.length} documents awaiting your read-and-sign`)}</b><p>${myUnread.slice(0, 4).map(p => `<a href="#/policies/${encodeURIComponent(p.id)}">${esc(p.code)}</a>`).join(' · ')}</p></div></div>` : ''}
  <div class="stats">
    ${Q.stat(L('وثائق سارية', 'In force'), force.length, Object.keys(DOC_KIND).map(k => `${force.filter(p => (p.kind || 'policy') === k).length} ${T(DOC_KIND[k])}`).join(' · '), {icon: 'book'})}
    ${Q.stat(L('متأخرة المراجعة', 'Review overdue'), od.length, od.length ? L('تُعد مانعًا لجاهزية CBAHI', 'Counts as a CBAHI readiness blocker') : L('لا يوجد تأخير', 'None overdue'), {cls: od.length ? 'up-bad' : '', icon: 'clock'})}
    ${Q.stat(L('بانتظار توقيعات', 'Awaiting signatures'), all.filter(p => p.status === 'review').length, L(`${all.filter(Q.polDueSoon).length} تقترب من المراجعة`, `${all.filter(Q.polDueSoon).length} review due soon`))}
    ${Q.stat(L('متوسط الإقرار بالاطلاع', 'Average read-and-sign'), ackAvg != null ? `${ackAvg}<small>%</small>` : '—', all.filter(Q.polAckLate).length ? `<b class="c-crit">${L(`${all.filter(Q.polAckLate).length} تجاوزت المهلة دون 100%`, `${all.filter(Q.polAckLate).length} below 100% past deadline`)}</b>` : (ackAvg != null ? Q.track([[ackAvg, 'var(--brand)']]) : ''))}
  </div>
  <section class="card">
    <div class="toolbar">${Q.seg(tabs.map(([k, t, f]) => [k, t, all.filter(f).length]), tab, 'pol-tab')}<select class="field" data-pol-kind style="width:auto">${[['all', L('كل الأنواع', 'All types')], ...Object.entries(DOC_KIND).map(([k, v]) => [k, T(v)])].map(([k, t]) => `<option value="${k}" ${kind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الرمز', 'Code')}</th><th>${L('الوثيقة', 'Document')}</th><th class="hide-m">${L('النطاق', 'Scope')}</th><th class="hide-m">${L('الإصدار', 'Version')}</th><th>${L('المراجعة القادمة', 'Next review')}</th><th class="hide-m">${L('الاطلاع', 'Read')}</th><th>${L('الحالة', 'Status')}</th></tr></thead>
    <tbody>${list.length ? list.map(p => { const r = p.reviewDue && Q.polInForce(p) ? Q.rel(p.reviewDue) : null, ack = Q.polInForce(p) && p.ackRequired !== false ? Q.polAckPct(p) : null; return `<tr class="click" data-href="#/policies/${encodeURIComponent(p.id)}">
      <td class="nowrap"><span class="oid">${esc(p.code)}</span><span class="t2">${kindName(p)}</span></td><td><span class="t1" style="white-space:normal">${esc(T(p.title))}</span><span class="t2">${T(POL_CAT[p.category] || POL_CAT.admin)} · ${esc(Q.uname(p.ownerId))}</span></td>
      <td class="hide-m">${scopeName(p.deptId)}</td><td class="hide-m num">${p.live ? `v${p.live.version}` : '—'}${['draft', 'review'].includes(p.status) && p.live ? ` <small class="muted">→ v${p.version}</small>` : ''}</td>
      <td class="nowrap">${r ? `${Q.fDate(p.reviewDue, false)}<br><span class="due ${Q.polOverdue(p) ? 'late' : Q.polDueSoon(p) ? 'soon' : ''}">${r.txt}</span>` : '—'}</td>
      <td class="hide-m ${Q.polAckLate(p) ? 'c-crit' : ''}">${ack != null ? `${ack}%` : '—'}</td><td>${polChip(p)}</td></tr>`; }).join('') : `<tr><td colspan="7">${Q.empty(L('لا توجد وثائق في هذا التصنيف.', 'No documents in this view.'), 'book')}</td></tr>`}</tbody></table></div>
  </section>`, mount: root => { const s = $('[data-pol-kind]', root); s && s.addEventListener('change', () => { Q.ui.polKind = s.value; Q.saveUI(); Q.render(); }); }};
}};
Q.act('pol-tab', el => { Q.ui.polTab = el.dataset.v; Q.saveUI(); history.replaceState(null, '', '#/policies'); Q.render(); });
Q.act('pol-export', () => { const rows = [['Code', 'Type', 'Title', 'Category', 'Scope', 'Owner', 'Live version', 'Status', 'Effective', 'Review due', 'Read %', 'Read deadline', 'Linked policy']];
  Q.db.all('policies').forEach(p => rows.push([p.code, p.kind || 'policy', T(p.title), p.category, p.deptId === 'all' ? 'All' : Q.dname(p.deptId), Q.uname(p.ownerId), p.live ? p.live.version : '', p.status, p.live ? Q.toDateInput(p.live.effectiveAt) : '', p.reviewDue ? Q.toDateInput(p.reviewDue) : '', Q.polInForce(p) ? Q.polAckPct(p) : '', p.ackDue ? Q.toDateInput(p.ackDue) : '', (Q.db.get('policies', p.linkedPolicyId) || {}).code || '']));
  Q.download(`salamah-documents-${Q.toDateInput(now())}.csv`, Q.csv(rows), 'text/csv;charset=utf-8'); });

function policyDetail(id) {
  const p = Q.db.get('policies', id); if (!p) return notFound(L('الوثيقة غير موجودة.', 'Document not found.'), 'book');
  if (!Q.polVisible(p)) return {title: esc(p.code), html: Q.empty(L('أُوقف العمل بهذه الوثيقة ولم تعد متاحة. راجع الإصدار البديل مع إدارة الجودة.', 'This document has been retired and is no longer available. Ask the quality department for its replacement.'), 'book')};
  const ed = Q.canEditPolicy(p), sign = Q.canSignPolicy(p), force = Q.polInForce(p), next = Q.polNext(p);
  const aud = Q.polAudience(p), acked = aud.filter(u => (p.acks || {})[u.id]), mine = aud.some(u => u.id === Q.me.id) && force && p.ackRequired !== false;
  const files = Q.polFilesFor(p), linked = p.linkedPolicyId && Q.db.get('policies', p.linkedPolicyId);
  const children = Q.db.all('policies').filter(x => x.linkedPolicyId === p.id && Q.polVisible(x));
  const acts = [];
  if (p.status === 'draft' && ed) acts.push(`<button class="btn btn-p" data-act="pol-submit" data-id="${esc(p.id)}">${ic('send')}${L('إرسال للمراجعة والاعتماد', 'Send for review & approval')}</button>`);
  if (sign) acts.push(`<button class="btn btn-p" data-act="pol-sign" data-id="${esc(p.id)}">${ic('check')}${next.step === 'review' ? L('توقيع المراجعة', 'Sign review') : L('اعتماد بتوقيع إلكتروني', 'Approve with e-signature')}</button>`, `<button class="btn btn-s" data-act="pol-return" data-id="${esc(p.id)}">${L('رفض وإعادة للمُعد', 'Reject, return to author')}</button>`);
  if (p.status === 'review' && !sign && next && next.id === Q.me.id && p.preparedBy === Q.me.id) acts.push(`<span class="muted">${L('لا يوقّع مُعدّ الإصدار عليه', 'The preparer cannot sign their own version')}</span>`);
  if (p.status === 'approved' && ed) acts.push(`<button class="btn btn-s" data-act="pol-revise" data-id="${esc(p.id)}">${ic('edit')}${L('بدء مراجعة / إصدار جديد', 'Start revision / new version')}</button>`);
  if (p.status === 'approved' && Q.can('policy.approve')) acts.push(`<button class="btn btn-s" data-act="pol-reviewed" data-id="${esc(p.id)}">${ic('check')}${L('رُوجعت دون تعديل', 'Reviewed, no change')}</button>`);
  if (['draft', 'review'].includes(p.status) && ed) acts.push(`<button class="btn btn-s" data-act="pol-edit" data-id="${esc(p.id)}">${L('تعديل', 'Edit')}</button>`);
  if (p.status !== 'archived' && Q.can('policy.approve')) acts.push(`<button class="btn-g" data-act="pol-archive" data-id="${esc(p.id)}">${L('إيقاف العمل بها', 'Retire')}</button>`);
  const r = p.reviewDue && force ? Q.rel(p.reviewDue) : null;
  const chain = Q.polChain(p), sigs = p.signatures || [];
  return {title: `<span class="ltr">${esc(p.code)}</span>`, mount: root => { const inp = $('input[data-pol-up]', root); if (inp) inp.addEventListener('change', () => polUpload(p, inp.files)); }, html: `
  <nav class="crumbs"><a href="#/policies">${L('السياسات والإجراءات', 'Policies & procedures')}</a>${ic('chev', 'sm flip')}<span class="ltr">${esc(p.code)}</span></nav>
  <div class="page-head"><div><div class="row">${polChip(p)}<span class="chip mute">${kindName(p)}</span><span class="chip mute">${T(POL_CAT[p.category] || POL_CAT.admin)}</span>${p.live ? `<span class="chip info">${L('الإصدار الساري', 'In force')} v${p.live.version}</span>` : ''}${['draft', 'review'].includes(p.status) && ed ? `<span class="chip med">${L('قيد العمل', 'Working on')} v${p.version}</span>` : ''}</div><h2 style="margin-top:8px">${esc(T(p.title))}</h2><p>${esc(T(p.summary) || '')}</p></div><div class="row">${acts.join('')}</div></div>
  ${p.status === 'archived' ? `<div class="banner"><div class="ico">${ic('lock')}</div><div><b>${L('وثيقة موقوفة', 'Retired document')}</b><p>${L('مخفية عن الموظفين تلقائيًا.', 'Automatically hidden from staff.')}</p></div></div>` : ''}
  ${p.returnNote && p.status === 'draft' && ed ? `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L('رُفضت وأُعيدت للتعديل', 'Rejected and returned for changes')}</b><p class="pre">${esc(p.returnNote)}</p></div></div>` : ''}
  ${Q.polOverdue(p) ? `<div class="banner"><div class="ico">${ic('clock')}</div><div><b>${L('تجاوزت موعد المراجعة الدورية', 'Past its periodic review date')}</b><p>${L('ما زالت سارية لكن يجب مراجعتها أو تأكيدها دون تعديل.', 'Still in force, but it must be revised or confirmed unchanged.')}</p></div></div>` : ''}
  ${mine && !(p.acks || {})[Q.me.id] ? `<div class="banner info"><div class="ico">${ic('book')}</div><div><b>${L('مطلوب إقرارك بالاطلاع', 'Please confirm you have read this document')}</b><p>${p.ackDue ? L(`المهلة ${Q.fDate(p.ackDue, false)}`, `Deadline ${Q.fDate(p.ackDue, false)}`) + ` · <span class="due ${Q.rel(p.ackDue).cls}">${Q.rel(p.ackDue).txt}</span>` : ''}</p></div><div class="act"><button class="btn btn-p sm" data-act="pol-ack" data-id="${esc(p.id)}">${ic('check', 'sm')}${L('قرأتها وفهمتها', 'I have read and understood')}</button></div></div>` : ''}
  <div class="detail"><div class="detail-main">
    ${p.status === 'review' ? `<section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('مسار المراجعة والاعتماد', 'Review & approval path')} · v${p.version}</h3><p>${L('بالترتيب، وكل توقيع مطلوب. أي رفض يعيد الوثيقة للمُعد.', 'In order; every signature is required. Any rejection returns it to the author.')}</p></div></div>
      <div class="card-b">${chain.length ? `<ol class="sign-chain">${chain.map(c => { const s = sigs.find(x => x.userId === c.id && x.decision !== 'reject'); const cur = next && next.id === c.id && p.status === 'review'; return `<li class="${s ? 'done' : cur ? 'cur' : ''}"><span class="dot">${s ? ic('check', 'sm') : ''}</span><div><b>${esc(Q.uname(c.id))}</b> <small class="muted">${c.step === 'review' ? L('مراجِع', 'Reviewer') : L('معتمِد', 'Approver')}</small>${s ? `<p class="hint">${L('وقّع إلكترونيًا', 'E-signed')} ${Q.fDate(s.at)}${s.comment ? ` · ${esc(s.comment)}` : ''}</p>` : cur ? `<p class="hint">${L('بانتظار توقيعه', 'Awaiting signature')}</p>` : ''}</div></li>`; }).join('')}</ol>` : `<p class="muted">${L('سجل قديم دون مسار: يعتمده أي معتمِد مخوّل.', 'Legacy record with no path: any authorised approver can sign.')}</p>`}</div></section>` : ''}
    <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('ملف الوثيقة', 'Document file')}</h3><p>${ed ? L('يرى الموظفون ملف الإصدار الساري فقط', 'Staff only see the file of the version in force') : L('الإصدار الساري', 'Version in force')}</p></div>${ed && p.status !== 'archived' ? `<label class="btn btn-s sm">${ic('clip', 'sm')}${L(`إرفاق ملف v${p.version}`, `Attach v${p.version} file`)}<input type="file" hidden data-pol-up multiple accept=".pdf,.doc,.docx,.xlsx"></label>` : ''}</div>
      <div class="card-b">${files.length ? `<ul class="files">${[...files].sort((a, b) => (b.version || 1) - (a.version || 1)).map(f => { const sup = p.live && (f.version || 1) < p.live.version, wip = !p.live || (f.version || 1) > p.live.version; return `<li class="${sup ? 'superseded' : ''}">${ic('file', 'sm')}<button class="btn-g" data-act="pol-dl" data-id="${esc(p.id)}" data-f="${f.id}">${esc(f.name)}</button><small>v${f.version || 1} · ${Q.fSize(f.size)} · ${esc(Q.uname(f.by))} · ${Q.fDate(f.at, false)}</small>${sup ? `<span class="chip mute">${L('مُلغى بإصدار أحدث', 'Superseded')}</span>` : wip ? `<span class="chip med">${L('قيد الاعتماد', 'Not yet approved')}</span>` : `<span class="chip ok">${L('ساري', 'In force')}</span>`}</li>`; }).join('')}</ul>` : `<p class="muted">${force ? L('لا يوجد ملف للإصدار الساري.', 'No file for the version in force.') : L('لم يُرفق ملف بعد.', 'No file attached yet.')}</p>`}</div></section>
    ${force && p.ackRequired !== false ? `<section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الإقرار بالاطلاع', 'Read-and-sign')}</h3><p>${L(`${acked.length} من ${aud.length} من موظفي ${scopeName(p.deptId)}`, `${acked.length} of ${aud.length} staff in ${scopeName(p.deptId)}`)}${p.ackDue ? ` · ${L('المهلة', 'deadline')} ${Q.fDate(p.ackDue, false)}` : ''}</p></div><strong class="${Q.polAckLate(p) ? 'c-crit' : ''}">${Q.polAckPct(p) ?? '—'}%</strong></div>
      <div class="card-b">${Q.track([[Q.polAckPct(p) || 0, Q.polAckLate(p) ? 'var(--red)' : 'var(--brand)']])}${Q.polAckLate(p) ? `<p class="hint c-crit" style="margin-top:8px">${L('تجاوزت المهلة دون 100%: صُعّدت لرؤساء الأقسام المعنية.', 'Past the deadline below 100%: escalated to the department heads concerned.')}</p>` : ''}${Q.can('policy.edit') ? `<details style="margin-top:10px"><summary class="muted">${L('لم يطّلعوا بعد', 'Not yet read')} (${aud.length - acked.length})</summary><p class="muted" style="margin-top:6px">${aud.filter(u => !(p.acks || {})[u.id]).map(u => `${esc(T(u.name))} <small>(${Q.dshort(u.deptId)})</small>`).join('، ') || '—'}</p></details>` : ''}</div></section>` : ''}
    ${children.length ? `<section class="card flush" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('النماذج والإجراءات المرتبطة', 'Linked forms & procedures')}</h3></div></div><div class="tbl-wrap"><table><tbody>${children.map(c => `<tr class="click" data-href="#/policies/${encodeURIComponent(c.id)}"><td class="nowrap"><span class="oid">${esc(c.code)}</span></td><td>${esc(T(c.title))}<span class="t2">${kindName(c)}${c.live ? ` · v${c.live.version}` : ''}</span></td><td>${polChip(c)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${ed ? `<section class="card"><div class="card-h"><div><h3>${L('سجل الإصدارات والتوقيعات', 'Version & signature history')}</h3></div></div><div class="card-b">
      ${(p.history || []).length ? `<ol class="log">${[...p.history].reverse().map(h => `<li><span class="t">${Q.fDate(h.at)}</span><span><b>v${h.v}</b> · ${T(Q.AUDIT_TXT[h.action] || [h.action, h.action])} · ${esc(Q.uname(h.by))}${h.note ? ` <span class="muted">· ${esc(h.note)}</span>` : ''}</span></li>`).join('')}</ol>` : `<p class="muted">—</p>`}</div></section>` : ''}
  </div>
  <aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
    <div><dt>${L('النوع', 'Type')}</dt><dd>${kindName(p)}</dd></div>
    ${linked ? `<div><dt>${L('السياسة الأم', 'Parent policy')}</dt><dd><a class="ltr" href="#/policies/${encodeURIComponent(linked.id)}">${esc(linked.code)}</a><br><small>${esc(T(linked.title))}</small></dd></div>` : ''}
    <div><dt>${L('المالك', 'Owner')}</dt><dd>${Q.avatar(p.ownerId, 's')} ${esc(Q.uname(p.ownerId))}</dd></div>
    <div><dt>${L('النطاق', 'Scope')}</dt><dd>${scopeName(p.deptId)}</dd></div>
    ${p.live ? `<div><dt>${L('تاريخ السريان', 'Effective')}</dt><dd>${Q.fDate(p.live.effectiveAt, false)}</dd></div><div><dt>${L('اعتمدها', 'Approved by')}</dt><dd>${esc((p.live.signers || [p.live.approvedBy]).map(Q.uname).join('، '))}</dd></div>` : ''}
    <div><dt>${L('المراجعة القادمة', 'Next review')}</dt><dd>${p.reviewDue ? `${Q.fDate(p.reviewDue, false)}${r ? ` · <span class="due ${Q.polOverdue(p) ? 'late' : Q.polDueSoon(p) ? 'soon' : ''}">${r.txt}</span>` : ''}` : '—'}</dd></div>
    <div><dt>${L('أعدّ الإصدار الحالي', 'Current version prepared by')}</dt><dd>${esc(Q.uname(p.preparedBy))}</dd></div>
    ${(p.standards || []).length ? `<div><dt>${L('معايير CBAHI', 'CBAHI standards')}</dt><dd>${p.standards.map(s => Q.db.get('standards', s) && Q.can('cbahi.view') ? `<a class="ltr" href="#/cbahi/${encodeURIComponent(s)}">${esc(s)}</a>` : `<span class="ltr">${esc(s)}</span>`).join(' · ')}</dd></div>` : ''}
  </dl></div></section></aside></div>`};
}
const polForm = (p = {}) => `<div class="fgrid">
  ${Q.f.sel('kind', L('نوع الوثيقة', 'Document type'), Object.entries(DOC_KIND).map(([k, v]) => [k, T(v)]), p.kind || 'policy')}${Q.f.text('code', L('رمز الوثيقة', 'Document code'), p.code || '', {req: true, ltr: true, ph: 'QPS-POL-012 / QPS-FRM-004'})}
  ${Q.f.text('ar', L('العنوان بالعربية', 'Title (Arabic)'), p.title ? p.title.ar : '', {req: true})}${Q.f.text('en', L('العنوان بالإنجليزية', 'Title (English)'), p.title ? p.title.en : '', {ltr: true})}
  ${Q.f.sel('category', L('التصنيف', 'Category'), Object.entries(POL_CAT).map(([k, v]) => [k, T(v)]), p.category || 'admin')}
  ${Q.f.sel('linkedPolicyId', L('السياسة الأم (للنماذج والإجراءات)', 'Parent policy (for forms & procedures)'), Q.db.all('policies').filter(x => (x.kind || 'policy') === 'policy' && x.status !== 'archived' && x.id !== p.id).map(x => [x.id, `${x.code}: ${T(x.title)}`]), p.linkedPolicyId || '', {empty: L('بدون', 'None')})}
  ${Q.f.sel('deptId', L('النطاق', 'Scope'), [['all', L('كل المنشأة', 'Whole facility')], ...Q.deptOpts(d => Q.me.role !== 'supervisor' || d.id === Q.me.deptId)], p.deptId || (Q.me.role === 'supervisor' ? Q.me.deptId : 'all'))}
  ${Q.f.sel('ownerId', L('مالك الوثيقة', 'Document owner'), staffOpts(), p.ownerId || Q.me.id, {req: true})}
  ${Q.f.text('standards', L('معايير CBAHI المرتبطة', 'Linked CBAHI standards'), (p.standards || []).join(', '), {ltr: true, ph: 'QM.14, IPC.3', opt: L('(افصل بفاصلة)', '(comma separated)')})}
  ${Q.f.chk('ackRequired', L('يتطلب إقرار الموظفين بالاطلاع', 'Staff must read and sign'), p.ackRequired !== false)}
  ${Q.f.area('summary', L('الغرض والملخص', 'Purpose & summary'), p.summary ? T(p.summary) : '', {rows: 2})}</div>`;
const polFrom = (d, p) => Object.assign(p, {kind: d.kind || 'policy', code: d.code.trim(), category: d.category, title: {ar: d.ar, en: d.en || d.ar}, deptId: d.deptId, ownerId: d.ownerId, ackRequired: !!d.ackRequired, summary: d.summary,
  linkedPolicyId: d.linkedPolicyId || null, standards: String(d.standards || '').split(/[,،\s]+/).map(s => s.trim()).filter(Boolean)});
const pol = id => Q.db.get('policies', id);
const hist = (p, action, note = '') => { (p.history = p.history || []).push({v: p.version, action, by: Q.me.id, at: Q.iso(now()), note}); Q.audit('policy', p.id, action, note); };
Q.act('pol-new', () => Q.modal({title: L('وثيقة جديدة', 'New document'), wide: true, body: polForm(), onSubmit: d => {
  if (Q.db.all('policies').some(x => x.code === d.code.trim())) throw new Error(L('رمز الوثيقة مستخدم.', 'Document code already exists.'));
  if (['form', 'procedure'].includes(d.kind) && !d.linkedPolicyId) throw new Error(L('اربط النموذج أو الإجراء بسياسته الأم.', 'Link the form or procedure to its parent policy.'));
  const p = polFrom(d, {id: Q.uid('pol'), version: 1, status: 'draft', live: null, reviewDue: null, preparedBy: Q.me.id, createdAt: Q.iso(now()), files: [], acks: {}, history: [], reviewers: [], approvers: [], signatures: []});
  hist(p, 'created'); Q.db.put('policies', p); Q.go('#/policies/' + encodeURIComponent(p.id)); }}));
Q.act('pol-edit', el => { const p = pol(el.dataset.id); Q.modal({title: L('تعديل الوثيقة', 'Edit document'), wide: true, body: polForm(p), onSubmit: d => {
  if (Q.db.all('policies').some(x => x.code === d.code.trim() && x.id !== p.id)) throw new Error(L('رمز الوثيقة مستخدم.', 'Document code already exists.'));
  if (['form', 'procedure'].includes(d.kind) && !d.linkedPolicyId) throw new Error(L('اربط النموذج أو الإجراء بسياسته الأم.', 'Link the form or procedure to its parent policy.'));
  polFrom(d, p); Q.db.put('policies', p); Q.audit('policy', p.id, 'updated'); Q.render(); }}); });
/* DOC-02: the author picks reviewers and approvers; all of them sign, in order */
Q.act('pol-submit', el => { const p = pol(el.dataset.id);
  if (!(p.files || []).some(f => (f.version || 1) === p.version)) return Q.toast(L(`أرفق ملف الإصدار v${p.version} قبل الإرسال.`, `Attach the v${p.version} file before sending.`), 'err');
  const notMe = u => u.id !== (p.preparedBy || Q.me.id);
  Q.modal({title: L('إرسال للمراجعة والاعتماد', 'Send for review & approval'), sub: `${esc(p.code)} · v${p.version}`, wide: true, submit: L('إرسال', 'Send'),
    body: `<div class="fgrid">${Q.f.multi('reviewers', L('المراجِعون (يوقّعون أولًا، اختياري)', 'Reviewers (sign first, optional)'), Q.userOpts(u => u.role !== 'reporter' && notMe(u)), p.reviewers || [])}
      ${Q.f.multi('approvers', L('المعتمِدون (بالترتيب، واحد على الأقل)', 'Approvers (in order, at least one)'), Q.userOpts(u => Q.can('policy.approve', u) && notMe(u)), (p.approvers || []).length ? p.approvers : Q.db.all('users').filter(u => u.role === 'director' && u.active !== false && notMe(u) && !u.pwHash).slice(0, 1).map(u => u.id))}
      <p class="hint w">${L('لا يمكن لمُعدّ الإصدار أن يكون مراجِعًا أو معتمِدًا عليه.', 'The preparer cannot review or approve their own version.')}</p></div>`,
    onSubmit: d => { const rv = [].concat(d.reviewers || []).filter(Boolean), ap = [].concat(d.approvers || []).filter(Boolean).filter(id => !rv.includes(id));
      if (!ap.length) throw new Error(L('اختر معتمِدًا واحدًا على الأقل.', 'Choose at least one approver.'));
      Object.assign(p, {reviewers: rv, approvers: ap, signatures: [], status: 'review', returnNote: '', preparedBy: p.preparedBy || Q.me.id, submittedAt: Q.iso(now())});
      hist(p, 'pol_submitted', [...rv, ...ap].map(Q.uname).join(' → ')); Q.db.put('policies', p); Q.render(); Q.toast(L('أُرسلت؛ أول موقّع: ', 'Sent; first signer: ') + Q.uname((Q.polNext(p) || {}).id)); }}); });
/* e-signature = the signer re-enters their own password; the signature records who, when, decision and comment */
Q.act('pol-sign', el => { const p = pol(el.dataset.id), n = Q.polNext(p); if (!Q.canSignPolicy(p)) return Q.toast(L('ليس دورك في التوقيع.', 'It is not your turn to sign.'), 'err');
  const last = Q.polChain(p).filter(c => !(p.signatures || []).some(s => s.userId === c.id && s.decision !== 'reject')).length <= 1;
  Q.modal({title: n.step === 'review' ? L('توقيع المراجعة', 'Sign review') : L('اعتماد بتوقيع إلكتروني', 'Approve with e-signature'), sub: `${esc(p.code)} · v${p.version}`, submit: L('توقيع', 'Sign'),
    body: `<div class="fgrid">${Q.f.area('comment', L('تعليق', 'Comment'), '', {rows: 2, opt: L('(اختياري)', '(optional)')})}
      ${last && n.step === 'approve' ? `${Q.f.text('eff', L('تاريخ السريان', 'Effective date'), Q.toDateInput(now()), {type: 'date', req: true})}${Q.f.text('years', L('المراجعة بعد (سنوات)', 'Review after (years)'), Q.S().policyReviewYears, {type: 'number', req: true, attrs: 'min="1" max="5"'})}<p class="hint w">${L('أنت آخر معتمِد: تُنشر الوثيقة، ويُعاد ضبط الإقرار بالاطلاع، وتبدأ مهلة الاطلاع.', 'You are the last approver: the document is published, read-and-sign resets and its deadline starts.')}</p>` : ''}
      ${Q.f.text('pw', L('كلمة المرور (توقيع إلكتروني)', 'Your password (e-signature)'), '', {type: 'password', req: true, w: true, attrs: 'autocomplete="current-password"'})}</div>`,
    onSubmit: async d => { if (!(await Q.verifyPassword(d.pw))) throw new Error(L('كلمة المرور غير صحيحة؛ لم يُسجّل التوقيع.', 'Wrong password; signature not recorded.'));
      (p.signatures = p.signatures || []).push({userId: Q.me.id, step: n.step, decision: n.step === 'review' ? 'reviewed' : 'approve', comment: d.comment || '', at: Q.iso(now()), method: 'password'});
      hist(p, n.step === 'review' ? 'pol_signed_review' : 'pol_signed', d.comment || '');
      if (!Q.polNext(p)) { const eff = Q.fromInput(d.eff) || Q.iso(now()), due = new Date(eff); due.setFullYear(due.getFullYear() + Math.max(1, +d.years || Q.S().policyReviewYears));
        p.live = {version: p.version, effectiveAt: eff, approvedBy: Q.me.id, approvedAt: Q.iso(now()), signers: p.signatures.filter(s => s.decision !== 'reject').map(s => s.userId)};
        p.status = 'approved'; p.reviewDue = due.toISOString(); p.acks = {}; p.ackDue = Q.add(eff, Q.S().ackDays * DAY).toISOString(); hist(p, 'pol_approved');
        Q.db.put('policies', p); Q.render(); return Q.toast(L('اكتملت التوقيعات ونُشرت الوثيقة', 'All signatures complete; document published')); }
      Q.db.put('policies', p); Q.render(); Q.toast(L('سُجّل توقيعك؛ التالي: ', 'Signed; next: ') + Q.uname(Q.polNext(p).id)); }}); });
Q.act('pol-return', el => { const p = pol(el.dataset.id); Q.modal({title: L('رفض وإعادة للمُعد', 'Reject and return to author'), body: `<div class="fgrid one">${Q.f.area('note', L('ما المطلوب تعديله؟', 'What needs to change?'), '', {req: true, rows: 3})}</div>`, submit: L('رفض', 'Reject'), danger: true,
  onSubmit: d => { (p.signatures = p.signatures || []).push({userId: Q.me.id, decision: 'reject', comment: d.note, at: Q.iso(now())}); p.status = 'draft'; p.returnNote = d.note; hist(p, 'pol_returned', d.note);
    p.signatures = []; Q.db.put('policies', p); Q.render(); }}); });
Q.act('pol-revise', el => { const p = pol(el.dataset.id); p.version = (p.live ? p.live.version : p.version) + 1; p.status = 'draft'; p.preparedBy = Q.me.id; p.signatures = []; hist(p, 'pol_revision'); Q.db.put('policies', p); Q.render(); Q.toast(L('بدأت المراجعة؛ الإصدار الحالي يبقى ساريًا حتى اعتماد الجديد', 'Revision started; the current version stays in force until the new one is approved')); });
Q.act('pol-reviewed', el => { const p = pol(el.dataset.id); Q.modal({title: L('تأكيد المراجعة دون تعديل', 'Confirm review with no change'), sub: esc(T(p.title)), body: `<div class="fgrid one">${Q.f.area('note', L('ملخص المراجعة', 'Review summary'), '', {req: true, rows: 2, ph: L('مثال: رُوجعت مع اللجنة ولا تزال مطابقة للممارسة والمعايير', 'e.g. reviewed with the committee; still matches practice and standards')})}</div>`, submit: L('تأكيد', 'Confirm'),
  onSubmit: d => { const due = new Date(); due.setFullYear(due.getFullYear() + Q.S().policyReviewYears); p.reviewDue = due.toISOString(); hist(p, 'pol_reviewed', d.note); Q.db.put('policies', p); Q.render(); Q.toast(L('سُجّلت المراجعة ومُدّد موعد المراجعة القادمة', 'Review logged; next review date extended')); }}); });
Q.act('pol-archive', async el => { const p = pol(el.dataset.id); if (!await Q.confirm(L('إيقاف العمل بهذه الوثيقة؟ ستختفي عن الموظفين تلقائيًا.', 'Retire this document? It disappears for staff automatically.'), {danger: true, ok: L('إيقاف', 'Retire')})) return;
  p.status = 'archived'; hist(p, 'pol_archived'); Q.db.put('policies', p); Q.render(); });
Q.act('pol-ack', el => { const p = pol(el.dataset.id); p.acks = Object.assign({}, p.acks, {[Q.me.id]: Q.iso(now())}); Q.db.put('policies', p); Q.audit('policy', p.id, 'pol_ack', `v${p.live ? p.live.version : p.version}`); Q.render(); Q.toast(L('سُجّل إقرارك بالاطلاع', 'Read-and-sign recorded')); });
Q.act('pol-dl', async el => { const p = pol(el.dataset.id), f = Q.polFilesFor(p).find(x => x.id === el.dataset.f); if (!f) return Q.toast(L('هذا الإصدار غير متاح.', 'This version is not available.'), 'err');
  const b = await Q.db.getFile(f.id); if (!b) return Q.toast(L('هذا ملف تجريبي بلا محتوى.', 'Demo file without content.'), 'err'); Q.download(f.name, b); });
async function polUpload(p, files) { let n = 0;
  for (const file of files) { if (file.size > 20 * 1048576) { Q.toast(L(`${file.name} أكبر من 20 ميجابايت`, `${file.name} exceeds 20 MB`), 'err'); continue; }
    const id = Q.uid('f'); await Q.db.putFile(id, file); (p.files = p.files || []).push({id, name: file.name, size: file.size, type: file.type, by: Q.me.id, at: Q.iso(now()), version: p.version}); n++; }
  if (n) { Q.db.put('policies', p); Q.audit('policy', p.id, 'uploaded'); Q.render(); Q.toast(L('أُرفق الملف', 'File attached')); } }

/* ======================================================================
   PATIENT COMPLAINTS
   ====================================================================== */
const CMP_ST = {new: ['جديدة', 'New', 'info'], investigating: ['قيد التحقق', 'Investigating', 'med'], responded: ['تم الرد', 'Responded', 'low'], closed: ['مغلقة', 'Closed', 'ok']};
const CMP_CAT = {care: ['جودة الرعاية', 'Quality of care'], communication: ['التواصل والمعلومات', 'Communication'], waiting: ['الانتظار والمواعيد', 'Waiting & appointments'], staff: ['سلوك الموظفين', 'Staff attitude'], rights: ['حقوق المريض والخصوصية', 'Patient rights & privacy'], billing: ['الفواتير والتأمين', 'Billing & insurance'], facility: ['النظافة والمرافق', 'Cleanliness & facility'], food: ['التغذية', 'Food'], other: ['أخرى', 'Other']};
const CMP_CH = {person: ['حضوريًا', 'In person'], phone: ['هاتفيًا', 'Phone'], email: ['البريد الإلكتروني', 'Email'], moh937: ['مركز 937', 'MOH 937'], survey: ['استبيان رضا', 'Satisfaction survey'], portal: ['البوابة / التطبيق', 'Portal / app']};
const CMP_SEV = {low: ['منخفضة', 'Low', 'low'], medium: ['متوسطة', 'Medium', 'med'], high: ['عالية', 'High', 'crit']};
const CMP_REL = {patient: ['المريض', 'Patient'], family: ['أحد الأقارب', 'Family member'], other: ['آخر', 'Other']};
const CMP_METHOD = {phone: ['اتصال هاتفي', 'Phone call'], letter: ['خطاب', 'Letter'], email: ['بريد إلكتروني', 'Email'], meeting: ['مقابلة', 'Meeting'], sms: ['رسالة نصية', 'SMS']};
Q.CMP_ST = CMP_ST;
Q.canSeeComplaint = (c, u = Q.me) => !!u && (['qps', 'director', 'admin'].includes(u.role) && Q.can('complaint.view', u) || c.ownerId === u.id || c.loggedBy === u.id || (u.role === 'supervisor' && c.deptId === u.deptId));
Q.visibleComplaints = () => Q.db.all('complaints').filter(c => Q.canSeeComplaint(c));
Q.cmpLate = c => !['responded', 'closed'].includes(c.status) && new Date(c.due) < now();
Q.cmpOnTime = c => c.response ? new Date(c.response.at) <= new Date(c.due) : null;
const cmpDue = (receivedAt, sev, urgent, S = Q.S()) => Q.add(receivedAt, (urgent || sev === 'high' ? S.complaintUrgentDays : S.complaintDays) * DAY).toISOString();
const cmpChip = c => Q.cmpLate(c) ? `<span class="chip crit">${L('متأخرة الرد', 'Response overdue')}</span>` : `<span class="chip ${CMP_ST[c.status][2]}">${T(CMP_ST[c.status])}</span>`;

Q.views.complaints = {perm: 'complaint.log', render(parts, q) {
  if (parts[0]) return complaintDetail(parts[0]);
  if (q.tab) { Q.ui.cmpTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.cmpTab || 'open';
  const all = Q.visibleComplaints();
  const tabs = [['open', L('المفتوحة', 'Open'), c => !['responded', 'closed'].includes(c.status)], ['late', L('متأخرة الرد', 'Overdue'), Q.cmpLate], ['responded', L('بانتظار الإغلاق', 'To close'), c => c.status === 'responded'], ['closed', L('المغلقة', 'Closed'), c => c.status === 'closed'], ['all', L('الكل', 'All'), () => true]];
  const fn = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const list = all.filter(fn).sort((a, b) => (Q.cmpLate(b) - Q.cmpLate(a)) || new Date(a.due) - new Date(b.due));
  const d90 = all.filter(c => c.response && new Date(c.receivedAt) > Q.add(now(), -90 * DAY));
  const sla = d90.length ? Math.round(d90.filter(Q.cmpOnTime).length / d90.length * 100) : null;
  const closed = all.filter(c => c.status === 'closed' && c.satisfied && c.satisfied !== 'unknown');
  const sat = closed.length ? Math.round(closed.filter(c => c.satisfied === 'yes').length / closed.length * 100) : null;
  const cats = Object.keys(CMP_CAT).map(k => [k, all.filter(c => c.category === k && new Date(c.receivedAt) > Q.add(now(), -90 * DAY)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const manage = Q.can('complaint.view');
  return {title: L('شكاوى المرضى', 'Patient complaints'), html: `
  <div class="page-head"><div><h2>${L('متابعة شكاوى المرضى والرد عليها', 'Patient complaints & responses')}</h2><p>${L(`تسجيل ← إسناد ← تحقق ← رد خلال ${Q.S().complaintDays} أيام (${Q.S().complaintUrgentDays} للعاجلة) ← إغلاق`, `Log → assign → investigate → respond within ${Q.S().complaintDays} days (${Q.S().complaintUrgentDays} if urgent) → close`)}</p></div>
    <div class="row">${manage ? `<button class="btn btn-s" data-act="cmp-export">${ic('download')}${L('تصدير', 'Export')}</button>` : ''}<button class="btn btn-p" data-act="cmp-new">${ic('plus')}${L('تسجيل شكوى', 'Log complaint')}</button></div></div>
  ${manage ? `<div class="stats">
    ${Q.stat(L('شكاوى مفتوحة', 'Open complaints'), all.filter(tabs[0][2]).length, L(`${all.filter(c => c.status === 'new').length} بانتظار الإسناد`, `${all.filter(c => c.status === 'new').length} awaiting assignment`), {icon: 'message'})}
    ${Q.stat(L('متأخرة الرد', 'Response overdue'), all.filter(Q.cmpLate).length, L('تجاوزت مهلة الرد', 'Past the response SLA'), {cls: all.filter(Q.cmpLate).length ? 'up-bad' : '', icon: 'clock'})}
    ${Q.stat(L('الرد ضمن المهلة (90 يومًا)', 'Answered within SLA (90 d)'), sla != null ? `${sla}<small>%</small>` : '—', sla != null ? Q.track([[sla, sla >= 90 ? 'var(--brand)' : 'var(--amber-bar)']]) : '')}
    ${Q.stat(L('رضا المشتكين بعد الرد', 'Complainant satisfaction'), sat != null ? `${sat}<small>%</small>` : '—', cats.length ? L('الأكثر تكرارًا: ', 'Most frequent: ') + cats.map(([k, n]) => `${T(CMP_CAT[k])} (${n})`).join('، ') : '')}
  </div>` : `<div class="note" style="margin-bottom:16px">${ic('info', 'sm')}<span>${L('تظهر هنا الشكاوى التي سجّلتها. تتابعها إدارة الجودة وتردّ على المشتكي.', 'You see the complaints you logged. The quality department follows up and responds.')}</span></div>`}
  <section class="card">
    <div class="toolbar">${Q.seg(tabs.map(([k, t, f]) => [k, t, all.filter(f).length]), tab, 'cmp-tab')}</div>
    <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الرقم', 'ID')}</th><th>${L('الشكوى', 'Complaint')}</th><th class="hide-m">${L('القسم', 'Department')}</th><th class="hide-m">${L('الخطورة', 'Severity')}</th><th class="hide-m">${L('المسؤول', 'Owner')}</th><th>${L('مهلة الرد', 'Respond by')}</th><th>${L('الحالة', 'Status')}</th></tr></thead>
    <tbody>${list.length ? list.map(c => { const r = !['responded', 'closed'].includes(c.status) ? Q.rel(c.due) : null; return `<tr class="click" data-href="#/complaints/${c.id}">
      <td class="nowrap"><span class="oid">${c.id}</span><span class="t2">${T(CMP_CH[c.channel] || CMP_CH.person)}</span></td><td><span class="t1" style="white-space:normal">${esc(T(c.subject))}</span><span class="t2">${T(CMP_CAT[c.category] || CMP_CAT.other)} · ${Q.fDate(c.receivedAt, false)}</span></td>
      <td class="hide-m">${Q.dshort(c.deptId)}</td><td class="hide-m"><span class="chip ${CMP_SEV[c.severity][2]}">${T(CMP_SEV[c.severity])}</span>${c.urgent ? ` <span class="chip crit">${L('عاجلة', 'Urgent')}</span>` : ''}</td>
      <td class="hide-m">${c.ownerId ? esc(Q.uname(c.ownerId)) : `<span class="muted">${L('غير مسندة', 'Unassigned')}</span>`}</td>
      <td class="nowrap">${r ? `<span class="due ${r.cls}">${r.txt}</span>` : c.response ? `<span class="chip ${Q.cmpOnTime(c) ? 'ok' : 'med'}">${Q.cmpOnTime(c) ? L('في الموعد', 'On time') : L('متأخر', 'Late')}</span>` : '—'}</td><td>${cmpChip(c)}</td></tr>`; }).join('') : `<tr><td colspan="7">${Q.empty(L('لا توجد شكاوى في هذا التصنيف.', 'No complaints in this view.'), 'message')}</td></tr>`}</tbody></table></div>
  </section>`};
}};
Q.act('cmp-tab', el => { Q.ui.cmpTab = el.dataset.v; Q.saveUI(); history.replaceState(null, '', '#/complaints'); Q.render(); });
Q.act('cmp-export', () => { const rows = [['ID', 'Received', 'Channel', 'Department', 'Category', 'Severity', 'Subject', 'Owner', 'Status', 'Due', 'Responded', 'On time', 'Satisfied']];
  Q.visibleComplaints().forEach(c => rows.push([c.id, Q.toDateInput(c.receivedAt), c.channel, Q.dname(c.deptId), c.category, c.severity, T(c.subject), Q.uname(c.ownerId), c.status, Q.toDateInput(c.due), c.response ? Q.toDateInput(c.response.at) : '', c.response ? (Q.cmpOnTime(c) ? 'yes' : 'no') : '', c.satisfied || '']));
  Q.download(`salamah-complaints-${Q.toDateInput(now())}.csv`, Q.csv(rows), 'text/csv;charset=utf-8'); });

Q.act('cmp-new', () => Q.modal({title: L('تسجيل شكوى مريض', 'Log a patient complaint'), wide: true, body: `<div class="fgrid">
  ${Q.f.text('receivedAt', L('تاريخ ووقت الاستلام', 'Received at'), Q.toInput(now()), {type: 'datetime-local', req: true, attrs: `max="${Q.toInput(now())}"`})}${Q.f.sel('channel', L('قناة الاستلام', 'Channel'), Object.entries(CMP_CH).map(([k, v]) => [k, T(v)]), 'person')}
  ${Q.f.text('cname', L('اسم المشتكي', 'Complainant name'), '', {req: true})}${Q.f.sel('relation', L('صفته', 'Relation'), Object.entries(CMP_REL).map(([k, v]) => [k, T(v)]), 'patient')}
  ${Q.f.text('phone', L('رقم التواصل', 'Contact number'), '', {ltr: true, type: 'tel'})}${Q.f.text('mrn', L('رقم الملف الطبي', 'Patient MRN'), '', {ltr: true, opt: L('(إن وجد)', '(if any)')})}
  ${Q.f.sel('deptId', L('القسم المعني', 'Department concerned'), Q.deptOpts(), Q.me.deptId, {req: true})}${Q.f.sel('category', L('التصنيف', 'Category'), Object.entries(CMP_CAT).map(([k, v]) => [k, T(v)]), 'care')}
  ${Q.f.text('subject', L('موضوع الشكوى', 'Subject'), '', {req: true, w: true})}
  ${Q.f.area('details', L('تفاصيل الشكوى كما وردت', 'Complaint details as received'), '', {req: true, rows: 4})}
  ${Q.f.sel('severity', L('الخطورة', 'Severity'), Object.entries(CMP_SEV).map(([k, v]) => [k, T(v)]), 'medium', {hint: L('العالية: تمس سلامة المريض أو حقوقه الجوهرية', 'High: affects patient safety or core rights')})}
  ${Q.f.chk('urgent', L('عاجلة (مهلة رد مختصرة)', 'Urgent (shorter response window)'), false)}</div>`,
  submit: L('تسجيل', 'Log'),
  onSubmit: d => { const received = Q.fromInput(d.receivedAt); if (new Date(received) > Q.add(now(), 60000)) throw new Error(L('تاريخ الاستلام في المستقبل.', 'Received date is in the future.'));
    const c = {id: nextId('complaints', 'CMP'), receivedAt: received, channel: d.channel, complainant: {name: d.cname, relation: d.relation, phone: d.phone}, patient: {mrn: d.mrn}, deptId: d.deptId, category: d.category,
      subject: d.subject, details: d.details, severity: d.severity, urgent: !!d.urgent, due: cmpDue(received, d.severity, !!d.urgent), status: 'new', ownerId: null, loggedBy: Q.me.id, createdAt: Q.iso(now())};
    Q.db.put('complaints', c); Q.audit('complaint', c.id, 'cmp_logged'); Q.go('#/complaints/' + c.id); Q.toast(L(`سُجّلت الشكوى ${c.id}`, `Complaint ${c.id} logged`)); }}));

function complaintDetail(id) {
  const c = Q.db.get('complaints', id); if (!c) return notFound(L('الشكوى غير موجودة.', 'Complaint not found.'), 'message');
  if (!Q.canSeeComplaint(c)) return denied();
  const mg = Q.can('complaint.manage'), owner = c.ownerId === Q.me.id, r = Q.rel(c.due);
  const capas = Q.db.all('capa').filter(x => x.complaintId === c.id);
  const acts = [];
  if (mg && c.status !== 'closed') acts.push(`<button class="btn ${c.status === 'new' ? 'btn-p' : 'btn-s'}" data-act="cmp-assign" data-id="${c.id}">${ic('users')}${c.ownerId ? L('إعادة الإسناد', 'Reassign') : L('إسناد للتحقق', 'Assign')}</button>`);
  if (Q.can('capa.create') && c.status !== 'closed') acts.push(`<button class="btn btn-s" data-act="capa-new" data-cmp="${c.id}" data-src="complaint" data-title="${esc(L(`معالجة سبب الشكوى ${c.id}: ${T(c.subject)}`, `Fix the cause of complaint ${c.id}: ${T(c.subject)}`))}">${ic('plus')}${L('إجراء تصحيحي', 'Corrective action')}</button>`);
  if (!c.escalatedAt && c.status !== 'closed' && (mg || owner)) acts.push(`<button class="btn btn-s" data-act="cmp-escalate" data-id="${c.id}">${ic('report')}${L('تحويل لبلاغ سلامة OVR', 'Escalate to OVR')}</button>`);
  let panel = '';
  if (['new', 'investigating'].includes(c.status) && (owner || mg) && c.ownerId) panel = `<section class="card act-card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('التحقق والرد على المشتكي', 'Investigate & respond')}</h3><p>${L('وثّق ما تحققت منه، ثم سجّل الرد الذي أُبلغ به المشتكي.', 'Record what you found, then the response given to the complainant.')}</p></div><span class="due ${r.cls}">${r.txt}</span></div>
    <form class="card-b" data-cmp-form="respond"><div class="fgrid">
      ${Q.f.area('findings', L('نتائج التحقق', 'Investigation findings'), c.investigation ? c.investigation.findings : '', {req: true, rows: 3, ph: L('ما الذي حدث فعلًا؟ من تمت مقابلته؟ هل الشكوى مبررة؟', 'What actually happened? Who was interviewed? Is the complaint justified?')})}
      ${Q.f.sel('justified', L('هل الشكوى مبررة؟', 'Is the complaint justified?'), [['yes', L('مبررة', 'Justified')], ['partly', L('مبررة جزئيًا', 'Partly')], ['no', L('غير مبررة', 'Not justified')]], c.investigation ? c.investigation.justified : 'yes')}
      ${Q.f.sel('method', L('طريقة الرد', 'Response method'), Object.entries(CMP_METHOD).map(([k, v]) => [k, T(v)]), 'phone')}
      ${Q.f.area('response', L('الرد الذي أُبلغ به المشتكي', 'Response given to the complainant'), '', {rows: 3, opt: L('(اتركه فارغًا لحفظ نتائج التحقق فقط)', '(leave empty to save findings only)')})}</div>
      <div class="form-actions"><button class="btn btn-s" type="submit" name="only" value="1">${L('حفظ نتائج التحقق', 'Save findings')}</button><button class="btn btn-p" type="submit">${ic('send')}${L('تسجيل الرد', 'Record response')}</button></div></form></section>`;
  if (c.status === 'responded' && mg) panel = `<section class="card act-card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('إغلاق الشكوى', 'Close complaint')}</h3><p>${L('بعد التواصل مع المشتكي ومعرفة رضاه عن الرد.', 'After checking back with the complainant.')}</p></div></div>
    <form class="card-b" data-cmp-form="close"><div class="fgrid">${Q.f.sel('satisfied', L('هل المشتكي راضٍ عن الرد؟', 'Is the complainant satisfied?'), [['yes', L('نعم', 'Yes')], ['no', L('لا', 'No')], ['unknown', L('تعذّر التواصل', 'Could not reach')]], 'yes')}
      ${Q.f.area('note', L('ملاحظة الإغلاق', 'Closure note'), '', {rows: 2})}</div>
      ${c.severity === 'high' && !capas.length ? `<p class="hint">${L('شكوى عالية الخطورة دون إجراء تصحيحي: وثّق السبب في ملاحظة الإغلاق.', 'High-severity complaint with no corrective action: document why in the closure note.')}</p>` : ''}
      <div class="form-actions"><button class="btn btn-p" type="submit">${ic('check')}${L('إغلاق الشكوى', 'Close complaint')}</button></div></form></section>`;
  if (c.status === 'new' && !c.ownerId && !mg) panel = `<div class="note" style="margin-bottom:16px">${ic('info', 'sm')}<span>${L('بانتظار إسناد الشكوى من إدارة الجودة.', 'Waiting for the quality department to assign it.')}</span></div>`;
  return {title: `<span class="ltr">${c.id}</span>`, mount: root => $$('form[data-cmp-form]', root).forEach(f => f.addEventListener('submit', e => { e.preventDefault(); CMP_FORMS[f.dataset.cmpForm](Q.formData(f), c, e.submitter && e.submitter.name === 'only'); })), html: `
  <nav class="crumbs"><a href="#/complaints">${L('شكاوى المرضى', 'Patient complaints')}</a>${ic('chev', 'sm flip')}<span class="ltr">${c.id}</span></nav>
  <div class="page-head"><div><div class="row">${cmpChip(c)}<span class="chip ${CMP_SEV[c.severity][2]}">${L('الخطورة', 'Severity')}: ${T(CMP_SEV[c.severity])}</span>${c.urgent ? `<span class="chip crit">${L('عاجلة', 'Urgent')}</span>` : ''}<span class="chip mute">${T(CMP_CAT[c.category] || CMP_CAT.other)}</span></div><h2 style="margin-top:8px">${esc(T(c.subject))}</h2></div><div class="row">${acts.join('')}</div></div>
  <div class="detail"><div class="detail-main">
    ${panel}
    <section class="card" style="margin-bottom:16px"><div class="card-b">
      <div class="sec"><h4>${L('تفاصيل الشكوى', 'Complaint details')}</h4><p class="quote pre">${esc(T(c.details))}</p></div>
      ${c.investigation ? `<div class="sec"><h4>${L('نتائج التحقق', 'Investigation findings')} <span class="chip mute">${c.investigation.justified === 'yes' ? L('مبررة', 'Justified') : c.investigation.justified === 'partly' ? L('مبررة جزئيًا', 'Partly justified') : L('غير مبررة', 'Not justified')}</span></h4><p class="pre">${esc(T(c.investigation.findings))}</p><p class="hint">${esc(Q.uname(c.investigation.by))} · ${Q.fDate(c.investigation.at)}</p></div>` : ''}
      ${c.response ? `<div class="sec"><h4>${L('الرد على المشتكي', 'Response to complainant')} <span class="chip ${Q.cmpOnTime(c) ? 'ok' : 'med'}">${Q.cmpOnTime(c) ? L('ضمن المهلة', 'Within SLA') : L('بعد المهلة', 'After SLA')}</span></h4><p class="quote pre">${esc(T(c.response.text))}</p><p class="hint">${T(CMP_METHOD[c.response.method] || CMP_METHOD.phone)} · ${esc(Q.uname(c.response.by))} · ${Q.fDate(c.response.at)}</p></div>` : ''}
      ${c.closure ? `<div class="sec"><h4>${L('الإغلاق', 'Closure')}</h4><p>${L('رضا المشتكي', 'Complainant satisfied')}: <b>${c.satisfied === 'yes' ? L('نعم', 'Yes') : c.satisfied === 'no' ? L('لا', 'No') : L('تعذّر التواصل', 'Not reached')}</b></p>${c.closure.note ? `<p class="pre">${esc(c.closure.note)}</p>` : ''}<p class="hint">${esc(Q.uname(c.closure.by))} · ${Q.fDate(c.closure.at)}</p></div>` : ''}
    </div></section>
    ${capas.length ? `<section class="card flush" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الإجراءات التصحيحية', 'Corrective actions')}</h3></div></div><div class="tbl-wrap"><table><tbody>${capas.map(Q.capaRow).join('')}</tbody></table></div></section>` : ''}
    <section class="card"><div class="card-b">${logHTML(logOf(c.id)) || `<p class="muted">—</p>`}</div></section>
  </div>
  <aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
    <div><dt>${L('المشتكي', 'Complainant')}</dt><dd>${esc(c.complainant.name)} · ${T(CMP_REL[c.complainant.relation] || CMP_REL.other)}${c.complainant.phone && (mg || owner) ? `<br><span class="ltr">${esc(c.complainant.phone)}</span>` : ''}</dd></div>
    ${c.patient && c.patient.mrn ? `<div><dt>${L('رقم الملف', 'MRN')}</dt><dd class="ltr">${esc(c.patient.mrn)}</dd></div>` : ''}
    <div><dt>${L('القسم المعني', 'Department')}</dt><dd>${Q.dname(c.deptId)}</dd></div>
    <div><dt>${L('الاستلام', 'Received')}</dt><dd>${Q.fDate(c.receivedAt)} · ${T(CMP_CH[c.channel] || CMP_CH.person)}</dd></div>
    <div><dt>${L('مهلة الرد', 'Respond by')}</dt><dd>${Q.fDate(c.due)}${!['responded', 'closed'].includes(c.status) ? ` · <span class="due ${r.cls}">${r.txt}</span>` : ''}</dd></div>
    <div><dt>${L('المسؤول عن التحقق', 'Investigator')}</dt><dd>${c.ownerId ? `${Q.avatar(c.ownerId, 's')} ${esc(Q.uname(c.ownerId))}` : '—'}</dd></div>
    <div><dt>${L('سجّلها', 'Logged by')}</dt><dd>${esc(Q.uname(c.loggedBy))}</dd></div>
    ${c.escalatedAt ? `<div><dt>${L('بلاغ سلامة', 'Safety report')}</dt><dd>${L('حُوّلت', 'Escalated')} ${Q.fDate(c.escalatedAt, false)}</dd></div>` : ''}
  </dl></div></section></aside></div>`};
}
const cmp = id => Q.db.get('complaints', id);
const CMP_FORMS = {
  respond(d, c, only) {
    if (!String(d.findings || '').trim()) return Q.toast(L('وثّق نتائج التحقق أولًا.', 'Record the investigation findings first.'), 'err');
    c.investigation = {findings: d.findings, justified: d.justified, by: Q.me.id, at: Q.iso(now())}; if (c.status === 'new') c.status = 'investigating';
    Q.audit('complaint', c.id, 'cmp_findings');
    if (!only) { if (!String(d.response || '').trim()) { Q.db.put('complaints', c); Q.render(); return Q.toast(L('حُفظت النتائج. اكتب نص الرد لتسجيله.', 'Findings saved. Write the response to record it.'), 'err'); }
      c.response = {text: d.response, method: d.method, by: Q.me.id, at: Q.iso(now())}; c.status = 'responded'; Q.audit('complaint', c.id, 'cmp_responded'); }
    Q.db.put('complaints', c); Q.render(); Q.toast(only ? L('حُفظت نتائج التحقق', 'Findings saved') : L('سُجّل الرد على المشتكي', 'Response recorded'));
  },
  close(d, c) {
    const capas = Q.db.all('capa').filter(x => x.complaintId === c.id);
    if (c.severity === 'high' && !capas.length && !String(d.note || '').trim()) return Q.toast(L('وثّق سبب عدم فتح إجراء تصحيحي لشكوى عالية الخطورة.', 'Document why a high-severity complaint has no corrective action.'), 'err');
    c.satisfied = d.satisfied; c.closure = {by: Q.me.id, at: Q.iso(now()), note: d.note}; c.status = 'closed'; Q.db.put('complaints', c); Q.audit('complaint', c.id, 'cmp_closed'); Q.render(); Q.toast(L('أُغلقت الشكوى', 'Complaint closed'));
  }
};
Q.act('cmp-assign', el => { const c = cmp(el.dataset.id); Q.modal({title: L('إسناد الشكوى للتحقق', 'Assign complaint'), sub: c.id, body: `<div class="fgrid one">${Q.f.sel('ownerId', L('المسؤول عن التحقق والرد', 'Investigator / responder'), staffOpts(), c.ownerId || (Q.dept(c.deptId) || {}).headId || '', {req: true, empty: L('اختر', 'Select')})}</div>`,
  onSubmit: d => { c.ownerId = d.ownerId; c.assignedAt = Q.iso(now()); Q.db.put('complaints', c); Q.audit('complaint', c.id, 'cmp_assigned', Q.uname(d.ownerId)); Q.render(); }}); });
Q.act('cmp-escalate', el => { const c = cmp(el.dataset.id); c.escalatedAt = Q.iso(now()); Q.db.put('complaints', c); Q.audit('complaint', c.id, 'cmp_escalated');
  Q.prefill = {deptId: c.deptId, title: L(`شكوى ${c.id}: ${T(c.subject)}`, `Complaint ${c.id}: ${T(c.subject)}`), desc: `${T(c.details)}\n\n(${L('مصدر البلاغ: شكوى مريض', 'Source: patient complaint')} ${c.id})`, mrn: (c.patient || {}).mrn || '', affected: 'in'}; Q.go('#/report/new'); });

/* ======================================================================
   QUALITY ROUNDS
   ====================================================================== */
const RND_ST = {planned: ['مجدولة', 'Planned', 'info'], done: ['منفّذة', 'Completed', 'ok'], cancelled: ['ملغاة', 'Cancelled', 'mute']};
Q.RND_ST = RND_ST;
Q.canSeeRound = (r, u = Q.me) => !!u && Q.can('round.view', u) && (u.role !== 'supervisor' || r.deptId === u.deptId || r.leadId === u.id || (r.team || []).includes(u.id));
Q.canConductRound = (r, u = Q.me) => !!u && Q.can('round.conduct', u) && (r.leadId === u.id || (r.team || []).includes(u.id) || ['qps', 'director'].includes(u.role));
Q.rndLate = r => r.status === 'planned' && new Date(r.plannedAt) < now();
const rndScore = (cl, ans) => { let y = 0, n = 0, crit = 0; cl.items.forEach(it => { const a = (ans || {})[it.id]; if (!a) return; if (a.v === 'yes') y++; if (a.v === 'no') { n++; if (it.critical) crit++; } }); return {score: y + n ? Math.round(y / (y + n) * 100) : null, fails: n, crit}; };
const rndChip = r => Q.rndLate(r) ? `<span class="chip crit">${L('متأخرة', 'Overdue')}</span>` : `<span class="chip ${RND_ST[r.status][2]}">${T(RND_ST[r.status])}</span>`;
const scoreCls = s => s == null ? 'mute' : s >= Q.S().roundTarget ? 'ok' : s >= 75 ? 'med' : 'crit';

Q.views.rounds = {perm: 'round.view', render(parts, q) {
  if (parts[0] === 'checklists') return checklistsView();
  if (parts[0] === 'programme') return programmeView(+parts[1] || now().getFullYear());
  if (parts[0]) return roundDetail(parts[0]);
  if (q.tab) { Q.ui.rndTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.rndTab || 'upcoming';
  const all = Q.db.all('rounds').filter(r => Q.canSeeRound(r));
  const tabs = [['upcoming', L('القادمة', 'Upcoming'), r => r.status === 'planned'], ['late', L('متأخرة', 'Overdue'), Q.rndLate], ['done', L('المنفّذة', 'Completed'), r => r.status === 'done'], ['all', L('الكل', 'All'), () => true]];
  const fn = (tabs.find(t => t[0] === tab) || tabs[0])[2];
  const list = all.filter(fn).sort((a, b) => tab === 'done' ? new Date(b.doneAt || b.plannedAt) - new Date(a.doneAt || a.plannedAt) : new Date(a.plannedAt) - new Date(b.plannedAt));
  const since = Q.add(now(), -90 * DAY), due90 = all.filter(r => r.status !== 'cancelled' && new Date(r.plannedAt) >= since && new Date(r.plannedAt) <= now());
  const done90 = due90.filter(r => r.status === 'done');
  const avg = done90.length ? Math.round(done90.reduce((a, r) => a + (r.score || 0), 0) / done90.length) : null;
  const openFind = all.filter(r => r.status === 'done').reduce((a, r) => a + Q.unactionedFindings(r), 0);
  /* lowest-scoring departments, from each department's latest completed round */
  const latest = {}; all.filter(r => r.status === 'done').forEach(r => { if (!latest[r.deptId] || new Date(r.doneAt) > new Date(latest[r.deptId].doneAt)) latest[r.deptId] = r; });
  const low = Object.values(latest).sort((a, b) => (a.score || 0) - (b.score || 0)).slice(0, 4);
  return {title: L('جولات الجودة', 'Quality rounds'), html: `
  <div class="page-head"><div><h2>${L('جولات الجودة الميدانية', 'Quality rounds')}</h2><p>${L(`قائمة تحقق ← جدولة ← تنفيذ ← نسبة امتثال (الهدف ${Q.S().roundTarget}%) ← الملاحظات تتحول لإجراءات تصحيحية`, `Checklist → schedule → conduct → compliance score (target ${Q.S().roundTarget}%) → findings become corrective actions`)}</p></div>
    <div class="row"><a class="btn btn-s" href="#/rounds/programme">${ic('calendar')}${L('البرنامج السنوي', 'Annual programme')}</a>${Q.can('round.plan') ? `<a class="btn btn-s" href="#/rounds/checklists">${ic('clipboard')}${L('قوائم التحقق', 'Checklists')}</a><button class="btn btn-p" data-act="rnd-new">${ic('plus')}${L('جدولة جولة', 'Schedule round')}</button>` : ''}</div></div>
  <div class="stats">
    ${Q.stat(L('تنفيذ الجولات المجدولة (90 يومًا)', 'Scheduled rounds done (90 d)'), due90.length ? `${Math.round(done90.length / due90.length * 100)}<small>%</small>` : '—', L(`${done90.length} من ${due90.length}`, `${done90.length} of ${due90.length}`), {icon: 'clipboard'})}
    ${Q.stat(L('متوسط الامتثال', 'Average compliance'), avg != null ? `<span class="c-${scoreCls(avg)}">${avg}</span><small>%</small>` : '—', avg != null ? Q.track([[avg, avg >= Q.S().roundTarget ? 'var(--brand)' : 'var(--amber-bar)']]) : '')}
    ${Q.stat(L('جولات متأخرة', 'Overdue rounds'), all.filter(Q.rndLate).length, L('لم تُنفّذ في موعدها', 'Not done on schedule'), {cls: all.filter(Q.rndLate).length ? 'up-bad' : '', icon: 'clock'})}
    ${Q.stat(L('ملاحظات دون إجراء', 'Findings without action'), openFind, openFind ? L('حوّلها لإجراءات تصحيحية', 'Turn them into corrective actions') : L('كل الملاحظات لها إجراء', 'Every finding has an action'), {cls: openFind ? 'up-bad' : ''})}
  </div>
  ${low.length ? `<section class="card chapters" style="margin-bottom:16px">${low.map(r => `<div><b>${Q.dname(r.deptId)}</b><small class="muted">${L(`ملاحظات مفتوحة: ${all.filter(x => x.deptId === r.deptId && x.status === 'done').reduce((a, x) => a + Q.openFindings(x), 0)} · إجمالي ${all.filter(x => x.deptId === r.deptId).reduce((a, x) => a + (x.findings || []).length, 0)}`, `open issues: ${all.filter(x => x.deptId === r.deptId && x.status === 'done').reduce((a, x) => a + Q.openFindings(x), 0)} · total ${all.filter(x => x.deptId === r.deptId).reduce((a, x) => a + (x.findings || []).length, 0)}`)}</small><strong class="c-${scoreCls(r.score)}">${r.score ?? '—'}%</strong><div class="track"><i style="width:${r.score || 0}%;background:${scoreCls(r.score) === 'ok' ? 'var(--brand)' : scoreCls(r.score) === 'med' ? 'var(--amber-bar)' : 'var(--red)'}"></i></div></div>`).join('')}</section>` : ''}
  <section class="card">
    <div class="toolbar">${Q.seg(tabs.map(([k, t, f]) => [k, t, all.filter(f).length]), tab, 'rnd-tab')}</div>
    <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الرقم', 'ID')}</th><th>${L('الجولة', 'Round')}</th><th class="hide-m">${L('القائد', 'Lead')}</th><th>${L('الموعد', 'Date')}</th><th>${L('الامتثال', 'Compliance')}</th><th>${L('الحالة', 'Status')}</th></tr></thead>
    <tbody>${list.length ? list.map(r => { const cl = Q.db.get('checklists', r.checklistId) || {name: '—'}; const rr = r.status === 'planned' ? Q.rel(r.plannedAt) : null; return `<tr class="click" data-href="#/rounds/${r.id}">
      <td class="nowrap"><span class="oid">${r.id}</span></td><td><span class="t1" style="white-space:normal">${esc(T(cl.name))}</span><span class="t2">${Q.dname(r.deptId)}</span></td><td class="hide-m">${esc(Q.uname(r.leadId))}</td>
      <td class="nowrap">${Q.fDate(r.status === 'done' ? r.doneAt : r.plannedAt, false)}${rr ? `<br><span class="due ${rr.cls}">${rr.txt}</span>` : ''}</td>
      <td>${r.status === 'done' ? `<b class="c-${scoreCls(r.score)}">${r.score ?? '—'}%</b>${r.crit ? ` <span class="chip crit">${L(`${r.crit} حرجة`, `${r.crit} critical`)}</span>` : ''}` : '—'}</td><td>${rndChip(r)}</td></tr>`; }).join('') : `<tr><td colspan="6">${Q.empty(L('لا توجد جولات في هذا التصنيف.', 'No rounds in this view.'), 'clipboard')}</td></tr>`}</tbody></table></div>
  </section>`};
}};
Q.act('rnd-tab', el => { Q.ui.rndTab = el.dataset.v; Q.saveUI(); history.replaceState(null, '', '#/rounds'); Q.render(); });

const rndForm = (r = {}, repeat = true) => `<div class="fgrid">
  ${Q.f.sel('checklistId', L('قائمة التحقق', 'Checklist'), Q.db.all('checklists').filter(c => c.active !== false).map(c => [c.id, `${T(c.name)} (${c.items.length})`]), r.checklistId || '', {req: true, empty: L('اختر', 'Select'), w: true})}
  ${Q.f.sel('deptId', L('القسم / الوحدة', 'Department / unit'), Q.deptOpts(), r.deptId || '', {req: true, empty: L('اختر', 'Select')})}
  ${Q.f.text('plannedAt', L('الموعد', 'Date'), r.plannedAt ? Q.toInput(r.plannedAt) : Q.toInput(Q.add(now(), 3 * DAY)), {type: 'datetime-local', req: true})}
  ${Q.f.sel('leadId', L('قائد الجولة / المدقق', 'Round lead / auditor'), Q.userOpts(u => ['qps', 'director', 'supervisor'].includes(u.role)), r.leadId || Q.me.id, {req: true})}
  ${Q.f.multi('units', L('الوحدات التي يمر بها التتبع (للتتبع فقط)', 'Units visited (tracers only)'), Q.deptOpts(), r.units || [])}
  ${Q.f.text('path', L('مسار التتبع (للتتبع فقط)', 'Tracer path (tracers only)'), r.path || '', {w: true, ph: L('مثال: مريض من الطوارئ إلى العمليات ثم العناية', 'e.g. patient from ED to OR to ICU')})}
  ${Q.f.text('scope', L('النطاق', 'Scope'), r.scope || '', {w: true, ph: L('مثال: كل غرف المرضى والممرات، الوردية الصباحية', 'e.g. all patient rooms and corridors, morning shift')})}
  ${repeat ? Q.f.sel('repeat', L('التكرار', 'Repeat'), [['0', L('مرة واحدة', 'Once')], ['1', L('شهريًا لثلاثة أشهر', 'Monthly × 3')], ['2', L('شهريًا لستة أشهر', 'Monthly × 6')]], '0') : ''}</div>`;
Q.act('rnd-new', () => { if (!Q.db.all('checklists').length) return Q.toast(L('أنشئ قائمة تحقق أولًا.', 'Create a checklist first.'), 'err');
  Q.modal({title: L('جدولة جولة جودة', 'Schedule a quality round'), wide: true, body: rndForm(), onSubmit: d => {
    const n = d.repeat === '1' ? 3 : d.repeat === '2' ? 6 : 1; let first = null;
    for (let i = 0; i < n; i++) { const at = new Date(Q.fromInput(d.plannedAt)); at.setMonth(at.getMonth() + i);
      const r = {id: nextId('rounds', 'RND'), checklistId: d.checklistId, deptId: d.deptId, leadId: d.leadId, scope: d.scope || '', units: [].concat(d.units || []), path: d.path || '', team: [], plannedAt: at.toISOString(), status: 'planned', answers: {}, findings: [], createdBy: Q.me.id, createdAt: Q.iso(now())};
      Q.db.put('rounds', r); Q.audit('round', r.id, 'rnd_planned'); first = first || r; }
    Q.go('#/rounds/' + first.id); Q.toast(n > 1 ? L(`جُدولت ${n} جولات`, `${n} rounds scheduled`) : L('جُدولت الجولة', 'Round scheduled')); }}); });

/* AUD-07 (and Phase 3 audits): sample-based audit. rows = samples (file / MRN / observation), columns = criteria.
   compliance = yes ÷ (yes + no) overall and per criterion; below the checklist target opens one corrective action listing the weak criteria */
const bar = (v, good = 85, warn = 70) => `<div class="track"><i style="width:${v || 0}%;background:${v == null ? 'transparent' : v >= good ? 'var(--brand)' : v >= warn ? 'var(--amber-bar)' : 'var(--red)'}"></i></div>`;
Q.sampleScore = (cl, samples) => { let y = 0, n = 0; const per = {}; cl.items.forEach(it => { per[it.id] = {y: 0, n: 0}; });
  (samples || []).forEach(sm => cl.items.forEach(it => { const v = (sm.answers || {})[it.id]; if (v === 'yes') { y++; per[it.id].y++; } if (v === 'no') { n++; per[it.id].n++; } }));
  Object.values(per).forEach(p => { p.pct = p.y + p.n ? Math.round(p.y / (p.y + p.n) * 100) : null; });
  return {score: y + n ? Math.round(y / (y + n) * 100) : null, per}; };
const clTarget = cl => cl.target || Q.S().docAuditTarget;
function sampleRound(r, cl) {
  const can = Q.canConductRound(r) && r.status === 'planned', samples = r.samples || [], sc = Q.sampleScore(cl, samples), tgt = clTarget(cl), minN = cl.minSamples || 5;
  const capas = Q.db.all('capa').filter(c => c.roundId === r.id && c.status !== 'cancelled');
  const attrs = cl.sampleFields || [];
  const cell = (sm, it) => { const v = (sm.answers || {})[it.id]; return can ? `<select class="field sm-cell ${v === 'no' ? 'no' : v === 'yes' ? 'yes' : ''}" data-s="${sm.id}" data-i="${it.id}" aria-label="${esc(T(it.text))}"><option value=""></option><option value="yes" ${v === 'yes' ? 'selected' : ''}>✓</option><option value="no" ${v === 'no' ? 'selected' : ''}>✗</option><option value="na" ${v === 'na' ? 'selected' : ''}>NA</option></select>` : `<span class="c-${v === 'yes' ? 'ok' : v === 'no' ? 'crit' : 'mute'}">${v === 'yes' ? '✓' : v === 'no' ? '✗' : v === 'na' ? 'NA' : '—'}</span>`; };
  return {title: `<span class="ltr">${r.id}</span>`, mount: root => {
    const f = $('[data-sample]', root); if (!f) return;
    const save = () => { $$('[data-s]', f).forEach(el => { const sm = r.samples.find(x => x.id === el.dataset.s); if (sm) (sm.answers = sm.answers || {})[el.dataset.i] = el.value || undefined; });
      $$('[data-ref]', f).forEach(el => { const sm = r.samples.find(x => x.id === el.dataset.ref); if (sm) sm.ref = el.value; });
      $$('[data-attr]', f).forEach(el => { const [sid, aid] = el.dataset.attr.split('|'); const sm = r.samples.find(x => x.id === sid); if (sm) (sm.attrs = sm.attrs || {})[aid] = el.value; }); };
    f.addEventListener('change', e => { if (e.target.matches('[data-s]')) e.target.className = `field sm-cell ${e.target.value}`; save(); const s2 = Q.sampleScore(cl, r.samples); $('[data-score]', root).innerHTML = s2.score == null ? '—' : `<span class="c-${s2.score >= tgt ? 'ok' : 'crit'}">${s2.score}%</span>`; });
    f.addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (!b) return; save(); const n = +b.dataset.add; for (let i = 0; i < n; i++) r.samples.push({id: Q.uid('sm'), ref: '', attrs: {}, answers: {}}); Q.db.put('rounds', r); Q.render(); });
    f.addEventListener('submit', e => { e.preventDefault(); save(); const done = e.submitter && e.submitter.value === 'done';
      if (done) { const filled = r.samples.filter(sm => sm.ref && cl.items.every(it => (sm.answers || {})[it.id]));
        if (filled.length < minN) return Q.toast(L(`أكمل ${minN} عينات على الأقل بمعرّف وكل المعايير (المكتمل ${filled.length}).`, `Complete at least ${minN} samples with an ID and every criterion (done: ${filled.length}).`), 'err');
        r.samples = filled; const s2 = Q.sampleScore(cl, filled); Object.assign(r, {status: 'done', doneAt: Q.iso(now()), doneBy: Q.me.id, score: s2.score, crit: 0, findings: []});
        const weak = cl.items.filter(it => s2.per[it.id].pct != null && s2.per[it.id].pct < tgt);
        if (s2.score < tgt) { const head = (Q.dept(r.deptId) || {}).headId; let n = Q.idObjs('capa').reduce((m, c) => Math.max(m, +String(c.id).replace(/\D/g, '') || 0), 300);
          Q.db.put('capa', {id: `CAPA-${n + 1}`, title: `${T(cl.name)} (${Q.dshort(r.deptId)}): ${s2.score}% < ${tgt}% · ${weak.map(it => `${T(it.text)} ${s2.per[it.id].pct}%`).join('، ')}`, kind: 'corrective', source: 'audit', ownerId: head || r.leadId, deptId: r.deptId, due: Q.add(now(), 30 * DAY).toISOString(), roundId: r.id, findingIdx: -1,
            measure: L(`الوصول إلى ${tgt}% في التدقيق القادم`, `Reach ${tgt}% at the next audit`), progress: 0, status: Q.can('capa.verify') ? 'open' : 'draft', createdAt: Q.iso(now()), createdBy: Q.me.id, updates: []}); }
        Q.audit('round', r.id, 'rnd_done', `${s2.score}%`); }
      Q.db.put('rounds', r); Q.render(); Q.toast(done ? (r.score < tgt ? L(`النتيجة ${r.score}% دون الهدف ${tgt}%: فُتح إجراء تصحيحي`, `Score ${r.score}% below target ${tgt}%: corrective action opened`) : L(`النتيجة ${r.score}% ضمن الهدف`, `Score ${r.score}% meets the target`)) : L('حُفظت المسودة', 'Draft saved')); });
  }, html: `
  <nav class="crumbs"><a href="#/rounds">${L('جولات الجودة', 'Quality rounds')}</a>${ic('chev', 'sm flip')}<span class="ltr">${r.id}</span></nav>
  <div class="page-head"><div><div class="row">${rndChip(r)}<span class="chip mute">${Q.dname(r.deptId)}</span><span class="chip info">${L('تدقيق بالعينات', 'Sample audit')}</span></div><h2 style="margin-top:8px">${esc(T(cl.name))}</h2><p>${L('المدقق', 'Auditor')}: ${esc(Q.uname(r.leadId))} · ${L(`الهدف ${tgt}% · الحد الأدنى ${minN} عينات`, `target ${tgt}% · minimum ${minN} samples`)}</p></div></div>
  ${r.status === 'done' ? `<div class="stats c3">${Q.stat(L('نسبة الامتثال', 'Compliance'), `<span class="c-${r.score >= tgt ? 'ok' : 'crit'}">${r.score}</span><small>%</small>`, L(`الهدف ${tgt}%`, `target ${tgt}%`))}${Q.stat(L('العينات', 'Samples'), samples.length)}${Q.stat(L('معايير دون الهدف', 'Criteria below target'), cl.items.filter(it => sc.per[it.id].pct != null && sc.per[it.id].pct < tgt).length)}</div>` : ''}
  <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الامتثال لكل معيار', 'Compliance per criterion')}</h3></div></div><div class="card-b"><div class="ri-dims">${cl.items.map(it => { const p = sc.per[it.id]; return `<div class="crit-cell"><span>${esc(T(it.text))}${it.clause ? ` <span class="ltr muted">${esc(it.clause)}</span>` : ''}</span><b class="c-${p.pct == null ? 'mute' : p.pct >= tgt ? 'ok' : 'crit'}">${p.pct ?? '—'}${p.pct != null ? '%' : ''}</b>${bar(p.pct, tgt, tgt - 15)}<small>${p.y}/${p.y + p.n}</small></div>`; }).join('')}</div></div></section>
  ${attrs.map(a => { const rows = a.opts.map(([k, lbl]) => { const sub = samples.filter(sm => (sm.attrs || {})[a.id] === k), sc2 = Q.sampleScore(cl, sub); return [lbl, sc2.score, sub.length]; }).filter(x => x[2]); return rows.length ? `<section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الامتثال حسب', 'Compliance by')} ${esc(T(a.label))}</h3></div></div><div class="card-b"><div class="ri-dims">${rows.map(([lbl, v, n]) => `<div class="crit-cell"><span>${esc(T(lbl))}</span><b class="c-${v == null ? 'mute' : v >= tgt ? 'ok' : 'crit'}">${v ?? '—'}${v != null ? '%' : ''}</b>${bar(v, tgt, tgt - 15)}<small>${L(`${n} فرصة`, `${n} observations`)}</small></div>`).join('')}</div></div></section>` : ''; }).join('')}
  ${capas.length ? `<section class="card flush" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الإجراء التصحيحي', 'Corrective action')}</h3></div></div><div class="tbl-wrap"><table><tbody>${capas.map(Q.capaRow).join('')}</tbody></table></div></section>` : ''}
  <form class="card flush" data-sample><div class="card-h"><div><h3>${L('العينات', 'Samples')} (${samples.length})</h3><p>✓ ${L('مستوفى', 'met')} · ✗ ${L('غير مستوفى', 'not met')} · NA ${L('لا ينطبق', 'not applicable')}</p></div>${can ? `<div class="row"><button type="button" class="btn btn-s sm" data-add="1">${ic('plus', 'sm')}${L('عينة', 'Sample')}</button><button type="button" class="btn btn-s sm" data-add="5">+5</button></div>` : ''}</div>
    <div class="tbl-wrap"><table class="sample-grid"><thead><tr><th>#</th><th>${esc(T(cl.sampleLabel || {ar: 'معرّف العينة', en: 'Sample ID'}))}</th>${attrs.map(a => `<th>${esc(T(a.label))}</th>`).join('')}${cl.items.map((it, i) => `<th title="${esc(T(it.text))}">${i + 1}</th>`).join('')}</tr></thead><tbody>
      ${samples.map((sm, i) => `<tr><td class="num">${i + 1}</td><td>${can ? `<input class="field" data-ref="${sm.id}" value="${esc(sm.ref || '')}" style="min-width:110px">` : esc(sm.ref || '')}</td>${attrs.map(a => `<td>${can ? `<select class="field" data-attr="${sm.id}|${a.id}">${a.opts.map(([k, t]) => `<option value="${k}" ${(sm.attrs || {})[a.id] === k ? 'selected' : ''}>${esc(T(t))}</option>`).join('')}</select>` : esc(T((a.opts.find(o => o[0] === (sm.attrs || {})[a.id]) || [0, '—'])[1]))}</td>`).join('')}${cl.items.map(it => `<td>${cell(sm, it)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${3 + attrs.length + cl.items.length}">${Q.empty(can ? L('أضف عينات للبدء.', 'Add samples to start.') : '—', 'clipboard')}</td></tr>`}
    </tbody></table></div>
    <div class="card-b"><ol class="cl-legend">${cl.items.map(it => `<li>${esc(T(it.text))}</li>`).join('')}</ol></div>
    ${can ? `<div class="form-actions sticky"><span class="muted">${L('النسبة الحالية', 'Current score')}: <b data-score>${sc.score == null ? '—' : `<span class="c-${sc.score >= tgt ? 'ok' : 'crit'}">${sc.score}%</span>`}</b></span><button class="btn btn-s" type="submit" value="draft">${L('حفظ مسودة', 'Save draft')}</button><button class="btn btn-p" type="submit" value="done">${ic('check')}${L('إنهاء التدقيق', 'Complete audit')}</button></div>` : ''}
  </form>`};
}
function roundDetail(id) {
  const r = Q.db.get('rounds', id); if (!r) return notFound(L('الجولة غير موجودة.', 'Round not found.'), 'clipboard');
  if (!Q.canSeeRound(r)) return denied();
  const cl = Q.db.get('checklists', r.checklistId); if (!cl) return notFound(L('قائمة التحقق غير موجودة.', 'Checklist not found.'), 'clipboard');
  if (cl.kind === 'sample') { r.samples = r.samples || []; return sampleRound(r, cl); }
  const can = Q.canConductRound(r) && r.status === 'planned';
  const ans = r.answers || {}, sc = rndScore(cl, ans);
  const capas = Q.db.all('capa').filter(c => c.roundId === r.id);
  const acts = [];
  if (r.status === 'planned' && Q.can('round.plan')) acts.push(`<button class="btn btn-s" data-act="rnd-edit" data-id="${r.id}">${ic('calendar')}${L('تعديل الموعد', 'Reschedule')}</button>`, `<button class="btn-g" data-act="rnd-cancel" data-id="${r.id}">${L('إلغاء الجولة', 'Cancel round')}</button>`);
  const rel = r.status === 'planned' ? Q.rel(r.plannedAt) : null;
  return {title: `<span class="ltr">${r.id}</span>`, mount: root => {
    const f = $('[data-round]', root); if (!f) return;
    const upd = () => { const a = collect(f, r.answers), s = rndScore(cl, a); $('[data-score]', root).innerHTML = s.score == null ? '—' : `<span class="c-${scoreCls(s.score)}">${s.score}%</span>`; $('[data-crit]', root).textContent = s.crit ? L(`${s.crit} بنود حرجة غير مستوفاة`, `${s.crit} critical item(s) not met`) : ''; };
    f.addEventListener('change', e => { if (e.target.type === 'file' && e.target.files[0]) e.target.nextElementSibling.textContent = e.target.files[0].name; upd(); });
    f.addEventListener('submit', async e => { e.preventDefault(); const a = collect(f, r.answers), done = e.submitter && e.submitter.value === 'done';
      const missing = cl.items.filter(it => !a[it.id]);
      if (done && missing.length) return Q.toast(L(`أجب على كل البنود (${missing.length} متبقية).`, `Answer every item (${missing.length} left).`), 'err');
      const noNote = cl.items.filter(it => a[it.id] && a[it.id].v === 'no' && !a[it.id].note);
      if (done && noNote.length) return Q.toast(L('اكتب وصفًا لكل بند غير مستوفى.', 'Describe every item marked "No".'), 'err');
      await uploadPhotos(f, a); r.answers = a; r.notes = f.notes.value;
      if (done) { const s = rndScore(cl, a); Object.assign(r, {status: 'done', doneAt: Q.iso(now()), doneBy: Q.me.id, score: s.score, crit: s.crit,
        findings: cl.items.filter(it => a[it.id].v === 'no').map(it => ({itemId: it.id, text: it.text, critical: !!it.critical, note: a[it.id].note, capaId: null}))}); Q.audit('round', r.id, 'rnd_done', `${s.score}%`); }
      Q.db.put('rounds', r); const made = done ? autoCapa(r) : [];
      if (done && cl.recheck && (r.findings || []).length && !Q.db.all('rounds').some(x => x.recheckOf === r.id)) Q.db.put('rounds', {id: nextId('rounds', 'RND'), checklistId: cl.id, deptId: r.deptId, leadId: r.leadId, scope: L(`إعادة فحص ${r.id}`, `Recheck of ${r.id}`), recheckOf: r.id, units: [], path: '', team: [], plannedAt: Q.add(now(), 7 * DAY).toISOString(), status: 'planned', answers: {}, findings: [], createdBy: Q.me.id, createdAt: Q.iso(now())}); Q.render(); Q.toast(done ? (made.length ? L(`اكتملت الجولة وفُتح ${made.length} إجراء تصحيحي تلقائيًا`, `Round completed; ${made.length} corrective action(s) opened automatically`) : L('اكتملت الجولة دون ملاحظات', 'Round completed with no findings')) : L('حُفظت المسودة', 'Draft saved')); });
  }, html: `
  <nav class="crumbs"><a href="#/rounds">${L('جولات الجودة', 'Quality rounds')}</a>${ic('chev', 'sm flip')}<span class="ltr">${r.id}</span></nav>
  <div class="page-head"><div><div class="row">${rndChip(r)}<span class="chip mute">${Q.dname(r.deptId)}</span>${cl.kind === 'tracer' ? `<span class="chip info">${L('تتبع', 'Tracer')}</span>` : ''}</div><h2 style="margin-top:8px">${esc(T(cl.name))}</h2><p>${L('القائد', 'Lead')}: ${esc(Q.uname(r.leadId))} · ${Q.fDate(r.status === 'done' ? r.doneAt : r.plannedAt)}${rel ? ` · <span class="due ${rel.cls}">${rel.txt}</span>` : ''}</p></div><div class="row">${acts.join('')}</div></div>
  <div class="detail"><div class="detail-main">
    ${r.status === 'done' ? `<section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('ملاحظات الجولة', 'Round findings')}</h3><p>${L('كل ملاحظة تحتاج إجراءً تصحيحيًا بمسؤول وموعد', 'Every finding needs a corrective action with an owner and date')}</p></div></div><div class="card-b">
      ${(r.findings || []).length ? `<ul class="findings">${r.findings.map((fd, i) => { const c = Q.findingCapa(r, i); return `<li class="${fd.critical ? 'crit' : ''}"><div><b>${esc(T(fd.text))}</b>${fd.critical ? ` <span class="chip crit">${L('حرج', 'Critical')}</span>` : ''}<p class="muted">${esc(fd.note || '')}</p></div>
        ${c ? `<a class="chip info ltr" href="#/capa/${c.id}">${c.id}</a> ${Q.capaChip(c)}` : Q.can('capa.create') ? `<button class="btn btn-s sm" data-act="capa-new" data-round="${r.id}" data-finding="${i}" data-src="round" data-title="${esc(`${T(fd.text)}: ${fd.note || ''} (${Q.dshort(r.deptId)})`)}">${ic('plus', 'sm')}${L('إجراء تصحيحي', 'Corrective action')}</button>` : `<span class="muted">${L('بانتظار إجراء', 'Awaiting action')}</span>`}</li>`; }).join('')}</ul>` : `<p class="muted">${L('لا توجد ملاحظات: كل البنود مستوفاة.', 'No findings: every item met.')}</p>`}
      ${r.notes ? `<div class="sec" style="margin-top:12px"><h4>${L('ملاحظات عامة', 'General notes')}</h4><p class="pre">${esc(r.notes)}</p></div>` : ''}</div></section>` : ''}
    <form class="card" data-round><div class="card-h"><div><h3>${L('قائمة التحقق', 'Checklist')}</h3><p>${can ? L('نعم = مستوفى · لا = غير مستوفى (اكتب الوصف) · لا ينطبق = يُستبعد من النسبة', 'Yes = met · No = not met (describe it) · N/A = excluded from the score') : r.status === 'planned' ? L('يُنفّذها قائد الجولة أو فريقها أو إدارة الجودة', 'Conducted by the lead, the team or QPS') : ''}</p></div></div>
      <ol class="cl-items">${cl.items.map(it => { const a = ans[it.id] || {}; return `<li data-item="${it.id}" class="${a.v === 'no' ? 'no' : ''}"><div class="cl-q"><span>${esc(T(it.text))}</span>${it.clause ? `<span class="chip mute ltr">${esc(it.clause)}</span>` : ''}${it.critical ? `<span class="chip crit">${L('حرج', 'Critical')}</span>` : ''}</div>
        <div class="cl-a">${can ? ['yes', 'no', 'na'].map(v => `<label class="cl-opt ${v}"><input type="radio" name="v-${it.id}" value="${v}" ${a.v === v ? 'checked' : ''}><span>${v === 'yes' ? L('نعم', 'Yes') : v === 'no' ? L('لا', 'No') : L('لا ينطبق', 'N/A')}</span></label>`).join('') + `<input class="field" name="n-${it.id}" value="${esc(a.note || '')}" placeholder="${L('الوصف / الدليل', 'Note / evidence')}"><label class="cl-photo" title="${L('صورة دليل', 'Evidence photo')}">${ic('clip', 'sm')}<input type="file" hidden accept="image/*" capture="environment" name="p-${it.id}"><span>${a.photo ? esc(a.photo.name) : L('صورة', 'Photo')}</span></label>`
          : `<span class="chip ${a.v === 'yes' ? 'ok' : a.v === 'no' ? 'crit' : 'mute'}">${a.v === 'yes' ? L('مستوفى', 'Met') : a.v === 'no' ? L('غير مستوفى', 'Not met') : a.v === 'na' ? L('لا ينطبق', 'N/A') : '—'}</span>${a.note ? ` <span class="muted">${esc(a.note)}</span>` : ''}${a.photo ? ` <button class="btn-g" data-act="rnd-photo" data-f="${a.photo.id}" data-n="${esc(a.photo.name)}">${ic('clip', 'sm')}${esc(a.photo.name)}</button>` : ''}`}</div></li>`; }).join('')}</ol>
      ${can ? `<div class="card-b">${Q.f.area('notes', L('ملاحظات عامة', 'General notes'), r.notes || '', {rows: 2})}</div><div class="form-actions sticky"><span class="muted">${L('النسبة الحالية', 'Current score')}: <b data-score>${sc.score == null ? '—' : `<span class="c-${scoreCls(sc.score)}">${sc.score}%</span>`}</b> <span class="c-crit" data-crit>${sc.crit ? L(`${sc.crit} بنود حرجة غير مستوفاة`, `${sc.crit} critical item(s) not met`) : ''}</span></span><button class="btn btn-s" type="submit" value="draft">${L('حفظ مسودة', 'Save draft')}</button><button class="btn btn-p" type="submit" value="done">${ic('check')}${L('إنهاء الجولة', 'Complete round')}</button></div>` : ''}
    </form>
  </div>
  <aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
    <div><dt>${L('نسبة الامتثال', 'Compliance')}</dt><dd><b class="c-${scoreCls(r.status === 'done' ? r.score : sc.score)}" style="font-size:22px">${(r.status === 'done' ? r.score : sc.score) ?? '—'}${(r.status === 'done' ? r.score : sc.score) != null ? '%' : ''}</b> <small class="muted">${L('الهدف', 'target')} ${Q.S().roundTarget}%</small></dd></div>
    <div><dt>${L('عدد البنود', 'Items')}</dt><dd>${cl.items.length} · ${L(`${cl.items.filter(i => i.critical).length} حرجة`, `${cl.items.filter(i => i.critical).length} critical`)}</dd></div>
    <div><dt>${L('القسم', 'Department')}</dt><dd>${Q.dname(r.deptId)}</dd></div>
    ${r.scope ? `<div><dt>${L('النطاق', 'Scope')}</dt><dd>${esc(r.scope)}</dd></div>` : ''}
    ${r.path ? `<div><dt>${L('مسار التتبع', 'Tracer path')}</dt><dd>${esc(r.path)}</dd></div>` : ''}${(r.units || []).length ? `<div><dt>${L('الوحدات التي زارها', 'Units visited')}</dt><dd>${r.units.map(Q.dshort).join(' ← ')}</dd></div>` : ''}
    ${r.doneBy ? `<div><dt>${L('نفّذها', 'Done by')}</dt><dd>${esc(Q.uname(r.doneBy))}</dd></div>` : ''}
    ${(cl.standards || []).length ? `<div><dt>${L('معايير CBAHI', 'CBAHI standards')}</dt><dd class="ltr">${cl.standards.map(esc).join(' · ')}</dd></div>` : ''}
  </dl></div></section>
  ${logOf(r.id).length ? `<section class="card" style="margin-top:16px"><div class="card-b">${logHTML(logOf(r.id))}</div></section>` : ''}</aside></div>`};
}
const collect = (f, prev = {}) => { const a = {}; $$('li[data-item]', f).forEach(li => { const id = li.dataset.item, v = (li.querySelector(`input[name="v-${id}"]:checked`) || {}).value; if (v) a[id] = {v, note: (li.querySelector(`[name="n-${id}"]`) || {}).value || '', photo: (prev[id] || {}).photo || null}; li.classList.toggle('no', v === 'no'); }); return a; };
const uploadPhotos = async (f, a) => { for (const inp of $$('input[type=file][name^="p-"]', f)) { const id = inp.name.slice(2), file = inp.files[0]; if (!file || !a[id]) continue;
  if (file.size > 15 * 1048576) { Q.toast(L(`${file.name} أكبر من 15 ميجابايت`, `${file.name} exceeds 15 MB`), 'err'); continue; } const fid = Q.uid('f'); await Q.db.putFile(fid, file); a[id].photo = {id: fid, name: file.name, size: file.size}; } };
/* AUD-02: every non-conformity opens a corrective action automatically (proposed, or open when QPS completes the round) */
const autoCapa = r => { const head = (Q.dept(r.deptId) || {}).headId; let n = Q.idObjs('capa').reduce((m, c) => Math.max(m, +String(c.id).replace(/\D/g, '') || 0), 300); const ids = [];
  (r.findings || []).forEach((fd, i) => { if (Q.findingCapa(r, i)) return; const c = {id: `CAPA-${++n}`, title: `${T(fd.text)}${fd.note ? ': ' + T(fd.note) : ''} (${Q.dshort(r.deptId)})`, kind: 'corrective', source: 'round', ownerId: head || r.leadId, deptId: r.deptId,
    due: Q.add(now(), (fd.critical ? 7 : 30) * DAY).toISOString(), roundId: r.id, findingIdx: i, measure: L('عدم تكرار الملاحظة في الجولة القادمة', 'Finding does not recur at the next round'), progress: 0, status: Q.can('capa.verify') ? 'open' : 'draft', createdAt: Q.iso(now()), createdBy: Q.me.id, updates: []};
    Q.db.put('capa', c); Q.audit('capa', c.id, 'created', r.id); ids.push(c.id); });
  return ids; };
Q.act('rnd-photo', async el => { const b = await Q.db.getFile(el.dataset.f); if (!b) return Q.toast(L('الصورة غير متاحة.', 'Photo not available.'), 'err'); Q.download(el.dataset.n, b); });
Q.act('rnd-edit', el => { const r = Q.db.get('rounds', el.dataset.id); Q.modal({title: L('تعديل الجولة', 'Edit round'), wide: true, body: rndForm(r, false),
  onSubmit: d => { Object.assign(r, {checklistId: d.checklistId, deptId: d.deptId, leadId: d.leadId, scope: d.scope || '', units: [].concat(d.units || []), path: d.path || '', plannedAt: Q.fromInput(d.plannedAt)}); Q.db.put('rounds', r); Q.audit('round', r.id, 'rescheduled'); Q.render(); }}); });
Q.act('rnd-cancel', async el => { const r = Q.db.get('rounds', el.dataset.id); if (!await Q.confirm(L('إلغاء هذه الجولة؟', 'Cancel this round?'), {danger: true, ok: L('إلغاء الجولة', 'Cancel round')})) return;
  r.status = 'cancelled'; Q.db.put('rounds', r); Q.audit('round', r.id, 'rnd_cancelled'); Q.render(); });
/* a finding is covered once a CAPA was raised from it (the CAPA carries roundId + findingIdx) */
Q.findingCapa = (r, i) => Q.db.all('capa').find(c => c.roundId === r.id && c.findingIdx === i && c.status !== 'cancelled') || null;
Q.openFindings = r => (r.findings || []).filter((f, i) => { const c = Q.findingCapa(r, i); return !c || !['verified'].includes(c.status); }).length;
Q.unactionedFindings = r => (r.findings || []).filter((f, i) => !Q.findingCapa(r, i)).length;

/* AUD-01: annual internal audit programme: areas × months, coverage %, missed audits */
Q.auditCoverage = (year = now().getFullYear()) => { const depts = Q.db.all('depts').filter(d => d.audit !== false), y0 = new Date(year, 0, 1), y1 = new Date(year + 1, 0, 1);
  const rs = Q.db.all('rounds').filter(r => r.status !== 'cancelled' && new Date(r.plannedAt) >= y0 && new Date(r.plannedAt) < y1);
  const due = rs.filter(r => new Date(r.plannedAt) <= now()), done = due.filter(r => r.status === 'done');
  const covered = depts.filter(d => rs.some(r => r.deptId === d.id && r.status === 'done'));
  return {depts, rs, due: due.length, done: done.length, missed: rs.filter(Q.rndLate).length, planPct: due.length ? Math.round(done.length / due.length * 100) : null,
    areaPct: depts.length ? Math.round(covered.length / depts.length * 100) : null, unplanned: depts.filter(d => !rs.some(r => r.deptId === d.id))}; };
function programmeView(year) {
  const cv = Q.auditCoverage(year), mon = Q.MON[Q.lang];
  const cell = (d, m) => cv.rs.filter(r => r.deptId === d.id && new Date(r.plannedAt).getMonth() === m).map(r => {
    const cls = r.status === 'done' ? scoreCls(r.score) : Q.rndLate(r) ? 'crit' : 'info';
    const t = r.status === 'done' ? `${r.score}%` : Q.rndLate(r) ? L('فائتة', 'Missed') : L('مجدولة', 'Planned');
    return `<a class="chip ${cls}" href="#/rounds/${r.id}" title="${esc(T((Q.db.get('checklists', r.checklistId) || {}).name || ''))}">${t}</a>`; }).join('');
  return {title: L('برنامج التدقيق السنوي', 'Annual audit programme'), html: `
  <nav class="crumbs"><a href="#/rounds">${L('جولات الجودة', 'Quality rounds')}</a>${ic('chev', 'sm flip')}<span>${L('البرنامج السنوي', 'Annual programme')}</span></nav>
  <div class="page-head"><div><h2>${L(`برنامج التدقيق الداخلي ${year}`, `Internal audit programme ${year}`)}</h2><p>${L('الأقسام × الأشهر: المنفّذة بنسبتها، المجدولة، والفائتة', 'Areas × months: completed with score, planned, and missed')}</p></div>
    <div class="row month-nav"><a class="ibtn" href="#/rounds/programme/${year - 1}" aria-label="${L('السنة السابقة', 'Previous year')}">${ic('chev', 'sm')}</a><b>${year}</b><a class="ibtn" href="#/rounds/programme/${year + 1}" aria-label="${L('السنة التالية', 'Next year')}">${ic('chev', 'sm flip-x')}</a>${Q.can('round.plan') ? `<button class="btn btn-p" data-act="rnd-new">${ic('plus')}${L('جدولة جولة', 'Schedule round')}</button>` : ''}</div></div>
  <div class="stats">
    ${Q.stat(L('تغطية الخطة حتى اليوم', 'Plan coverage to date'), cv.planPct != null ? `${cv.planPct}<small>%</small>` : '—', L(`${cv.done} من ${cv.due} جولة مستحقة نُفّذت`, `${cv.done} of ${cv.due} due audits done`))}
    ${Q.stat(L('تغطية الأقسام', 'Area coverage'), cv.areaPct != null ? `${cv.areaPct}<small>%</small>` : '—', L('أقسام دُققت مرة على الأقل هذا العام', 'Areas audited at least once this year'))}
    ${Q.stat(L('جولات فائتة', 'Missed audits'), cv.missed, cv.missed ? L('تنبيه لمخططي الجولات', 'Planners alerted') : L('لا يوجد', 'None'), {cls: cv.missed ? 'up-bad' : ''})}
    ${Q.stat(L('أقسام دون أي جولة مخططة', 'Areas with no audit planned'), cv.unplanned.length, cv.unplanned.slice(0, 4).map(d => T(d.short || d.name)).join('، '), {cls: cv.unplanned.length ? 'up-bad' : ''})}
  </div>
  <section class="card flush"><div class="tbl-wrap"><table class="prog-grid"><thead><tr><th>${L('القسم', 'Area')}</th>${mon.map(m => `<th>${m}</th>`).join('')}</tr></thead><tbody>
    ${cv.depts.map(d => `<tr class="${cv.unplanned.includes(d) ? 'gap' : ''}"><td class="nowrap">${esc(T(d.short || d.name))}</td>${mon.map((_, m) => `<td>${cell(d, m)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div></section>`};
}
function checklistsView() {
  const all = Q.db.all('checklists'), ed = Q.can('round.plan');
  return {title: L('قوائم تحقق الجولات', 'Round checklists'), html: `
  <nav class="crumbs"><a href="#/rounds">${L('جولات الجودة', 'Quality rounds')}</a>${ic('chev', 'sm flip')}<span>${L('قوائم التحقق', 'Checklists')}</span></nav>
  <div class="page-head"><div><h2>${L('قوائم التحقق', 'Checklists')}</h2><p>${L('اكتب البنود بصياغتك وربطها برقم المعيار فقط، دون نسخ نص المعيار.', 'Write items in your own words and link only the standard number; do not copy standard text.')}</p></div>${ed ? `<button class="btn btn-p" data-act="cl-new">${ic('plus')}${L('قائمة جديدة', 'New checklist')}</button>` : ''}</div>
  <div class="std-grid">${all.map(c => `<div class="card std"><div class="row"><span class="code">${c.items.length} ${L('بند', 'items')} · ${c.kind === 'sample' ? L(`عينات · الهدف ${c.target || Q.S().docAuditTarget}%`, `samples · target ${c.target || Q.S().docAuditTarget}%`) : c.kind === 'tracer' ? L('تتبع', 'tracer') : L('جولة', 'round')}</span>${c.active === false ? `<span class="chip mute">${L('موقوفة', 'Inactive')}</span>` : ''}</div><h3>${esc(T(c.name))}</h3><p>${esc(T(c.desc) || '')}</p>
    <ol class="cl-mini">${c.items.slice(0, 4).map(i => `<li>${esc(T(i.text))}${i.critical ? ' ⚑' : ''}${i.clause ? ` <span class="ltr muted">${esc(i.clause)}</span>` : ''}</li>`).join('')}${c.items.length > 4 ? `<li class="muted">+${c.items.length - 4}</li>` : ''}</ol>
    ${ed ? `<div class="ft"><button class="btn-g" data-act="cl-edit" data-id="${c.id}">${L('تعديل', 'Edit')}</button></div>` : ''}</div>`).join('') || Q.empty(L('لا توجد قوائم تحقق.', 'No checklists.'), 'clipboard')}</div>`};
}
const clForm = (c = {}) => `<div class="fgrid">${Q.f.text('ar', L('الاسم بالعربية', 'Name (Arabic)'), c.name ? c.name.ar : '', {req: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), c.name ? c.name.en : '', {ltr: true})}
  ${Q.f.sel('kind', L('النوع', 'Type'), [['round', L('جولة (قائمة بنود)', 'Round (item list)')], ['tracer', L('تتبع مريض أو نظام', 'Patient / system tracer')], ['sample', L('تدقيق بالعينات (عينة × معيار)', 'Sample audit (sample × criterion)')]], c.kind || 'round')}${Q.f.text('target', L('الهدف % (للعينات)', 'Target % (sample audits)'), c.target || '', {type: 'number', attrs: 'min="1" max="100"'})}
  ${Q.f.text('minSamples', L('الحد الأدنى للعينات', 'Minimum samples'), c.minSamples || '', {type: 'number', attrs: 'min="1"'})}${Q.f.text('sampleLabel', L('اسم معرّف العينة', 'Sample ID label'), c.sampleLabel ? T(c.sampleLabel) : '', {ph: L('مثال: رقم الملف', 'e.g. MRN')})}
  ${Q.f.text('standards', L('معايير CBAHI المرتبطة', 'Linked CBAHI standards'), (c.standards || []).join(', '), {ltr: true, w: true, ph: 'IPC.4, FMS.7'})}
  ${Q.f.area('items', L('البنود: بند في كل سطر · ابدأ البند الحرج بـ ! · ضع رقم المعيار بين قوسين في آخره [IPC.4]', 'Items: one per line · start a critical item with ! · put the clause at the end in brackets [IPC.4]'), (c.items || []).map(i => (i.critical ? '!' : '') + T(i.text) + (i.clause ? ` [${i.clause}]` : '')).join('\n'), {req: true, rows: 8})}
  ${c.id ? Q.f.chk('active', L('قائمة نشطة', 'Active'), c.active !== false) : ''}</div>`;
const clFrom = (d, c) => { const old = c.items || []; const items = String(d.items).split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => { const crit = s.startsWith('!'), m = /\s*\[([^\]]+)\]\s*$/.exec(s), text = s.replace(/^!\s*/, '').replace(/\s*\[[^\]]+\]\s*$/, ''); const ex = old.find(o => T(o.text) === text);
    return {id: ex ? ex.id : Q.uid('it'), text: ex && T(ex.text) === text ? ex.text : {ar: text, en: text}, critical: crit, clause: m ? m[1].trim() : (ex && ex.clause) || ''}; });
  if (!items.length) throw new Error(L('أضف بندًا واحدًا على الأقل.', 'Add at least one item.'));
  return Object.assign(c, {kind: d.kind || 'round', target: +d.target || null, minSamples: +d.minSamples || null, sampleLabel: d.sampleLabel ? {ar: d.sampleLabel, en: d.sampleLabel} : c.sampleLabel || null, name: {ar: d.ar, en: d.en || d.ar}, standards: String(d.standards || '').split(/[,،\s]+/).filter(Boolean), items, active: d.active === undefined ? true : !!d.active}); };
Q.act('cl-new', () => Q.modal({title: L('قائمة تحقق جديدة', 'New checklist'), wide: true, body: clForm(), onSubmit: d => { Q.db.put('checklists', clFrom(d, {id: Q.uid('cl')})); Q.render(); }}));
Q.act('cl-edit', el => { const c = Q.db.get('checklists', el.dataset.id); Q.modal({title: L('تعديل قائمة التحقق', 'Edit checklist'), wide: true, body: clForm(c), onSubmit: d => { Q.db.put('checklists', clFrom(d, c)); Q.render(); }}); });

/* ======================================================================
   TASKS (feeds "My tasks" and notifications)
   ====================================================================== */
Q.qualityTasks = (u, push) => {
  const t = Date.now();
  Q.db.all('policies').forEach(p => {
    const sub = `${p.code} · ${T(p.title)}`, link = `#/policies/${encodeURIComponent(p.id)}`;
    if (p.status === 'approved' && p.ownerId === u.id && p.reviewDue && new Date(p.reviewDue) < Q.add(now(), Q.S().policyAlertDays * DAY)) push({kind: 'policy', ref: p.id, what: ['مراجعة وثيقة دورية', 'Periodic document review'], due: p.reviewDue, prio: Q.polOverdue(p) ? 1 : 3, link, sub});
    if (Q.canSignPolicy(p, u)) push({kind: 'policy', ref: p.id, what: Q.polNext(p).step === 'review' ? ['مراجعة وثيقة وتوقيعها', 'Review and sign a document'] : ['اعتماد وثيقة بتوقيع إلكتروني', 'Approve a document (e-signature)'], due: Q.add(p.submittedAt || now(), 7 * DAY), prio: 2, link, sub});
    if (p.status === 'draft' && p.returnNote && Q.canEditPolicy(p, u) && (p.preparedBy === u.id || p.ownerId === u.id)) push({kind: 'policy', ref: p.id, what: ['تعديل وثيقة رُفضت', 'Revise a rejected document'], due: null, prio: 2, link, sub});
    if (!Q.polInForce(p) || p.ackRequired === false) return;
    /* DOC-03: staff read by the deadline; after it, the department head is escalated */
    if (!(p.acks || {})[u.id] && (p.deptId === 'all' || p.deptId === u.deptId) && p.ackDue && t - new Date(p.ackDue) < 60 * DAY) push({kind: 'policy', ref: p.id, what: ['الإقرار بالاطلاع على وثيقة', 'Read and sign a document'], due: p.ackDue, prio: new Date(p.ackDue) < now() ? 2 : 4, link, sub});
  });
  /* DOC-03 escalation, rolled up: one task per department head listing the late documents */
  Q.db.all('depts').filter(d => d.headId === u.id).forEach(d => { const late = Q.db.all('policies').filter(p => Q.polAckLate(p) && (p.deptId === 'all' || p.deptId === d.id)).map(p => [p, Q.polAudience(p).filter(x => x.deptId === d.id && !(p.acks || {})[x.id]).length]).filter(x => x[1]);
    if (late.length) push({kind: 'policy', ref: 'ack:' + d.id, what: ['تصعيد: موظفون لم يطّلعوا بعد المهلة', 'Escalation: staff not read-and-signed past deadline'], due: late.map(x => x[0].ackDue).sort()[0], prio: 1, link: '#/policies?tab=ack', sub: L(`${T(d.short || d.name)} · ${late.length} وثائق · ${late.reduce((a, x) => a + x[1], 0)} إقرارات ناقصة`, `${T(d.short || d.name)} · ${late.length} documents · ${late.reduce((a, x) => a + x[1], 0)} missing`)}); });
  Q.db.all('complaints').forEach(c => {
    const sub = `${c.id} · ${T(c.subject)}`, link = `#/complaints/${c.id}`;
    if (c.status === 'new' && !c.ownerId && Q.can('complaint.manage', u)) push({kind: 'complaint', ref: c.id, what: ['إسناد شكوى مريض', 'Assign a patient complaint'], due: Q.add(c.receivedAt, DAY), prio: 1, link, sub});
    if (['new', 'investigating'].includes(c.status) && c.ownerId === u.id) push({kind: 'complaint', ref: c.id, what: ['التحقق من شكوى والرد على المشتكي', 'Investigate a complaint and respond'], due: c.due, prio: c.severity === 'high' || c.urgent ? 0 : 1, link, sub});
    if (Q.cmpLate(c) && u.role === 'director' && c.ownerId !== u.id) push({kind: 'complaint', ref: c.id + ':esc', what: ['تصعيد: شكوى تجاوزت مهلة الرد', 'Escalation: complaint past its response SLA'], due: c.due, prio: 0, link, sub});
    if (c.status === 'responded' && Q.can('complaint.manage', u)) push({kind: 'complaint', ref: c.id, what: ['إغلاق شكوى بعد التحقق من الرضا', 'Close a complaint after checking satisfaction'], due: null, prio: 3, link, sub});
  });
  if (Q.can('round.plan', u)) { const missed = Q.db.all('rounds').filter(r => Q.rndLate(r) && r.leadId !== u.id);
    if (missed.length) push({kind: 'round', ref: 'missed', what: ['جولات تدقيق فائتة: أعد جدولتها أو نفّذها', 'Missed audits: reschedule or conduct'], due: missed.map(r => r.plannedAt).sort()[0], prio: 1, link: '#/rounds?tab=late', sub: missed.map(r => `${r.id} · ${Q.dshort(r.deptId)}`).join('، ')}); }
  Q.db.all('rounds').forEach(r => {
    if (r.status !== 'planned' || !(r.leadId === u.id || (r.team || []).includes(u.id))) return;
    if (new Date(r.plannedAt) < Q.add(now(), 3 * DAY)) push({kind: 'round', ref: r.id, what: ['تنفيذ جولة جودة', 'Conduct a quality round'], due: r.plannedAt, prio: 2, link: `#/rounds/${r.id}`, sub: `${T((Q.db.get('checklists', r.checklistId) || {}).name || '')} · ${Q.dshort(r.deptId)}`});
  });
  if (Q.can('capa.create', u)) Q.db.all('rounds').filter(r => r.status === 'done' && r.leadId === u.id).forEach(r => {
    const open = Q.unactionedFindings(r);
    if (open) push({kind: 'round', ref: r.id, what: ['تحويل ملاحظات جولة إلى إجراءات', 'Turn round findings into actions'], due: Q.add(r.doneAt, 7 * DAY), prio: 2, link: `#/rounds/${r.id}`, sub: L(`${open} ملاحظات دون إجراء`, `${open} findings without action`)});
  });
};

/* ======================================================================
   DEMO DATA + MIGRATION
   ====================================================================== */
const CHECKLISTS = [
  {id: 'cl-eoc', name: {ar: 'جولة بيئة الرعاية والسلامة', en: 'Environment of care & safety round'}, standards: ['FMS.7', 'FMS.9'], items: [
    ['ممرات الطوارئ ومخارجها خالية من العوائق', 'Emergency exits and corridors are clear', 1], ['طفايات الحريق مفحوصة وبطاقة الفحص سارية', 'Fire extinguishers inspected and tag in date', 1],
    ['الأرضيات جافة ولا توجد مخاطر انزلاق', 'Floors dry, no slip hazards', 0], ['أسطوانات الغاز مثبتة ومخزنة بأمان', 'Gas cylinders secured and stored safely', 1],
    ['التوصيلات الكهربائية سليمة دون أسلاك مكشوفة', 'Electrical fittings intact, no exposed wiring', 0], ['خطة الإخلاء معلقة وواضحة', 'Evacuation plan posted and legible', 0],
    ['المواد الكيميائية مخزنة مع صحائف بيانات السلامة', 'Chemicals stored with safety data sheets', 0], ['النفايات الطبية مفروزة في الحاويات الصحيحة', 'Medical waste segregated in the right containers', 0]]},
  {id: 'cl-ipc', name: {ar: 'جولة مكافحة العدوى', en: 'Infection control round'}, standards: ['IPC.3', 'IPC.4'], items: [
    ['نظافة اليدين مطبقة في اللحظات الخمس (عينة 10 فرص)', 'Hand hygiene done at the 5 moments (10-opportunity sample)', 1], ['معقم اليدين متوفر عند كل سرير', 'Hand rub available at every bed', 0],
    ['لافتات العزل وأدوات الوقاية متوفرة لغرف العزل', 'Isolation signs and PPE in place for isolation rooms', 1], ['حاويات الأدوات الحادة دون الحد الأقصى ومغلقة', 'Sharps containers below the fill line and closed', 1],
    ['الأسطح والأجهزة نظيفة ومعقمة وفق الجدول', 'Surfaces and equipment cleaned per schedule', 0], ['ثلاجة الأدوية بين 2 و8 درجات مع سجل حرارة', 'Medication fridge 2–8 °C with a temperature log', 0],
    ['المفارش النظيفة مفصولة عن المتسخة', 'Clean linen separated from soiled', 0]]},
  {id: 'cl-wal', name: {ar: 'جولة سلامة المرضى القيادية', en: 'Leadership patient safety walkround'}, standards: ['QM.10', 'IPSG.1'], items: [
    ['تحديد هوية المريض بمعرّفين قبل أي إجراء', 'Patient identified with two identifiers before any procedure', 1], ['تقييم خطر السقوط موثق ومحدّث', 'Fall-risk assessment documented and current', 0],
    ['الأدوية عالية الخطورة مفصولة ومُعلّمة', 'High-alert medications segregated and labelled', 1], ['الموظفون يعرفون كيف يرفعون بلاغ OVR', 'Staff know how to submit an OVR report', 0],
    ['عربة الإنعاش مفحوصة يوميًا ومختومة', 'Crash cart checked daily and sealed', 1], ['التسليم بين المناوبات منظم (SBAR)', 'Shift handover is structured (SBAR)', 0],
    ['حقوق المريض معلقة ومتاحة بلغتين', 'Patient rights posted in two languages', 0]]}
].map(c => Object.assign(c, {active: true, items: c.items.map(([ar, en, crit], i) => ({id: `${c.id}-${i + 1}`, text: {ar, en}, critical: !!crit, clause: c.standards[i % c.standards.length]}))}));

Q.seedQuality = (data, demo = true) => {
  data.checklists = JSON.parse(JSON.stringify(CHECKLISTS));
  data.policies = []; data.complaints = []; data.rounds = [];
  (data.settings = data.settings || Q.defaultSettings()).qualitySeeded = true;
  Object.keys(Q.defaultSettings()).forEach(k => { if (data.settings[k] === undefined) data.settings[k] = Q.defaultSettings()[k]; });
  if (!demo) return;
  const T0 = Date.now(), at = (d, h = 10) => { const x = new Date(T0 + d * DAY); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const users = (data.users || []).filter(u => u.active !== false), has = id => users.some(u => u.id === id);
  const who = (id, alt = 'u1') => has(id) ? id : alt;
  const acksFor = (deptId, share) => { const o = {}; users.filter(u => deptId === 'all' || u.deptId === deptId).forEach((u, i, a) => { if (i < Math.round(a.length * share)) o[u.id] = at(-20 + i % 10); }); return o; };
  /* policies */
  const P = (code, ar, en, cat, dept, owner, effDays, reviewDays, opts = {}) => { const v = opts.v || 1, eff = at(effDays);
    const p = {id: 'pol-' + code.toLowerCase(), code, title: {ar, en}, category: cat, deptId: dept, ownerId: who(owner), version: opts.draftV || v, status: opts.status || 'approved', ackRequired: true, standards: opts.std || [],
      summary: opts.sum || '', preparedBy: who(opts.prep || 'u2'), createdAt: at(effDays - 30), files: [{id: Q.uid('f'), name: `${code}-v${opts.draftV || v}.pdf`, size: 180000 + code.length * 9000, type: 'application/pdf', by: who(opts.prep || 'u2'), at: at(effDays - 10), version: opts.draftV || v}],
      live: opts.status === 'draft' && !opts.draftV ? null : {version: v, effectiveAt: eff, approvedBy: 'u1', approvedAt: at(effDays - 2)}, reviewDue: opts.status === 'draft' && !opts.draftV ? null : at(reviewDays),
      acks: opts.status === 'draft' && !opts.draftV ? {} : acksFor(dept, opts.ack ?? 1), history: opts.status === 'draft' && !opts.draftV ? [{v, action: 'created', by: who(opts.prep || 'u2'), at: at(-5), note: ''}] : [{v, action: 'pol_approved', by: 'u1', at: at(effDays - 2), note: ''}]};
    if (opts.draftV) p.history.push({v: opts.draftV, action: 'pol_revision', by: p.preparedBy, at: at(-6), note: ''});
    if (opts.status === 'review') p.history.push({v: p.version, action: 'pol_submitted', by: p.preparedBy, at: at(-2), note: ''});
    data.policies.push(p); };
  P('QPS-POL-001', 'خطة تحسين الجودة وسلامة المرضى', 'Quality improvement & patient safety plan', 'safety', 'all', 'u1', -300, 795, {std: ['QM.1', 'QM.2'], sum: {ar: 'الإطار العام لبرنامج الجودة وأولويات التحسين السنوية.', en: 'Framework of the quality programme and annual improvement priorities.'}});
  P('QPS-POL-004', 'الإبلاغ عن الحوادث والأحداث الوشيكة (OVR)', 'Occurrence variance reporting (OVR)', 'safety', 'all', 'u2', -420, 675, {std: ['QM.13'], ack: .9, sum: {ar: 'من يبلّغ، متى، وكيف تُصنف الخطورة وتُغلق البلاغات.', en: 'Who reports, when, how severity is classified and reports are closed.'}});
  P('QPS-POL-007', 'إدارة الأحداث الجسيمة وتحليل السبب الجذري', 'Sentinel events & root cause analysis', 'safety', 'all', 'u2', -1110, -15, {std: ['QM.13'], ack: .95});
  P('QPS-POL-009', 'إدارة شكاوى المرضى ومقترحاتهم', 'Patient complaints & suggestions', 'admin', 'all', 'u1', -1050, 45, {std: ['PFR.6'], ack: .85});
  P('IPC-POL-003', 'نظافة اليدين', 'Hand hygiene', 'ipc', 'all', 'u2', -200, 895, {std: ['IPC.3'], ack: .75});
  P('NICU-POL-002', 'التعرف على هوية حديثي الولادة', 'Newborn identification', 'clinical', 'nicu', 'u3', -500, 595, {std: ['IPSG.1'], prep: 'u3'});
  P('PH-POL-011', 'الأدوية عالية الخطورة', 'High-alert medications', 'mm', 'all', 'u10', -1080, 20, {std: ['MM.5'], v: 2, draftV: 3, status: 'review', prep: 'u10'});
  P('FMS-POL-005', 'خطة السلامة من الحرائق والإخلاء', 'Fire safety & evacuation plan', 'fms', 'all', 'u11', -60, 1035, {std: ['FMS.7'], ack: .45, prep: 'u11'});
  P('QPS-POL-015', 'جولات الجودة الميدانية', 'Quality rounds', 'admin', 'all', 'u2', 0, 0, {status: 'draft', prep: 'u2', sum: {ar: 'تكرار الجولات ومسؤولياتها وتحويل الملاحظات لإجراءات.', en: 'Round frequency, roles, and turning findings into actions.'}});
  /* checklists → rounds: past completed with scores, one overdue, upcoming */
  let rn = 0; const y = new Date().getFullYear(); const rid = () => `RND-${y}-${String(++rn).padStart(3, '0')}`;
  const R = (cl, dept, lead, days, score, critNo = []) => { const c = data.checklists.find(x => x.id === cl); const r = {id: rid(), checklistId: cl, deptId: dept, leadId: who(lead), team: [], plannedAt: at(days, 9), status: score == null ? 'planned' : 'done', answers: {}, findings: [], createdBy: 'u2', createdAt: at(days - 14)};
    if (score != null) { const nNo = Math.max(critNo.length, Math.round(c.items.length * (100 - score) / 100)); const noIdx = [...critNo, ...c.items.map((_, i) => i).filter(i => !critNo.includes(i) && !c.items[i].critical)].slice(0, nNo);
      c.items.forEach((it, i) => { r.answers[it.id] = noIdx.includes(i) ? {v: 'no', note: 'غير مستوفى أثناء الجولة / Not met during the round'} : {v: 'yes', note: ''}; });
      const s = rndScore(c, r.answers); Object.assign(r, {doneAt: at(days, 11), doneBy: r.leadId, score: s.score, crit: s.crit, findings: c.items.filter(it => r.answers[it.id].v === 'no').map(it => ({itemId: it.id, text: it.text, critical: !!it.critical, note: {ar: 'رُصد أثناء الجولة', en: 'Observed during the round'}, capaId: null}))}); }
    data.rounds.push(r); return r; };
  R('cl-ipc', 'icu', 'u2', -80, 86); R('cl-eoc', 'er', 'u2', -66, 75, [1]); R('cl-wal', 'nicu', 'u1', -52, 100); R('cl-ipc', 'surg', 'u6', -40, 71, [0]);
  R('cl-eoc', 'or', 'u8', -30, 88); R('cl-wal', 'med', 'u1', -21, 86); R('cl-ipc', 'nicu', 'u3', -12, 100); R('cl-eoc', 'lab', 'u9', -9, null);
  R('cl-wal', 'er', 'u1', 2, null); R('cl-ipc', 'icu', 'u2', 6, null); R('cl-eoc', 'pharm', 'u10', 13, null); R('cl-wal', 'surg', 'u1', 27, null);
  /* complaints */
  let cn = 0; const cid = () => `CMP-${y}-${String(++cn).padStart(3, '0')}`;
  const C = (days, dept, cat, sev, ch, subj, det, st, o = {}) => { const received = at(days, 9 + cn % 6); const c = {id: cid(), receivedAt: received, channel: ch, complainant: {name: o.name || {ar: 'مراجع', en: 'Visitor'}, relation: o.rel || 'family', phone: '05' + String(10000000 + cn * 7919).slice(0, 8)}, patient: {mrn: o.mrn || ''},
      deptId: dept, category: cat, subject: subj, details: det, severity: sev, urgent: !!o.urgent, due: cmpDue(received, sev, !!o.urgent, data.settings), status: st, ownerId: st === 'new' ? null : who(o.owner || data.depts.find(d => d.id === dept)?.headId || 'u2'), loggedBy: who(o.by || 'u2'), createdAt: received};
    if (['investigating', 'responded', 'closed'].includes(st)) c.investigation = {findings: o.find || {ar: 'تمت مراجعة الملف ومقابلة الفريق المعني.', en: 'File reviewed and the team concerned interviewed.'}, justified: o.just || 'yes', by: c.ownerId, at: Q.add(received, (o.rd || 3) * .6 * DAY).toISOString()};
    if (['responded', 'closed'].includes(st)) c.response = {text: o.resp || {ar: 'تم التواصل مع المشتكي وشرح ما اتخذ من إجراءات والاعتذار عن التجربة.', en: 'Called the complainant, explained the actions taken and apologised for the experience.'}, method: 'phone', by: c.ownerId, at: Q.add(received, (o.rd || 3) * DAY).toISOString()};
    if (st === 'closed') { c.satisfied = o.sat || 'yes'; c.closure = {by: 'u2', at: Q.add(received, ((o.rd || 3) + 2) * DAY).toISOString(), note: ''}; }
    data.complaints.push(c); return c; };
  C(-75, 'er', 'waiting', 'medium', 'moh937', {ar: 'انتظار أكثر من 4 ساعات في الطوارئ', en: 'Waited over 4 hours in the emergency department'}, {ar: 'وصل والدي بألم في البطن وانتظر أكثر من أربع ساعات قبل أن يراه الطبيب دون أي تحديث.', en: 'My father arrived with abdominal pain and waited more than four hours to see a doctor with no update.'}, 'closed', {rd: 4, owner: 'u5'});
  C(-60, 'surg', 'communication', 'low', 'person', {ar: 'عدم شرح خطة الخروج للأسرة', en: 'Discharge plan not explained to family'}, {ar: 'خرجت والدتي دون شرح واضح للأدوية والمراجعة القادمة.', en: 'My mother was discharged without a clear explanation of medicines and follow-up.'}, 'closed', {rd: 5, owner: 'u6', sat: 'yes'});
  C(-48, 'nicu', 'rights', 'high', 'email', {ar: 'منع الأم من زيارة طفلها خارج الأوقات', en: 'Mother refused visit outside hours'}, {ar: 'لم يُسمح لي بزيارة طفلي في العناية بعد الولادة القيصرية بحجة أوقات الزيارة.', en: 'I was not allowed to see my baby in the NICU after my C-section because of visiting hours.'}, 'closed', {rd: 2, urgent: true, owner: 'u3', rel: 'patient', just: 'partly', sat: 'no'});
  C(-35, 'pharm', 'staff', 'medium', 'survey', {ar: 'تعامل غير لائق من موظف الصيدلية', en: 'Rude behaviour at the pharmacy counter'}, {ar: 'رفع الموظف صوته عندما سألت عن بديل للدواء.', en: 'The staff member raised his voice when I asked about an alternative medicine.'}, 'closed', {rd: 9, owner: 'u10', sat: 'unknown'});
  C(-20, 'icu', 'care', 'high', 'person', {ar: 'تأخر إعطاء مسكن الألم بعد العملية', en: 'Delay in post-operative pain relief'}, {ar: 'طلبنا مسكنًا عدة مرات خلال الليل ولم يُعطَ إلا بعد ساعتين.', en: 'We asked for pain relief several times overnight and it came two hours later.'}, 'responded', {rd: 2, owner: 'u4'});
  C(-9, 'rad', 'waiting', 'medium', 'phone', {ar: 'تأجيل موعد الأشعة المقطعية مرتين', en: 'CT appointment postponed twice'}, {ar: 'أُلغي موعد الأشعة مرتين في نفس اليوم دون إبلاغ مسبق.', en: 'The CT appointment was cancelled twice on the day with no notice.'}, 'investigating', {owner: 'u7'});
  C(-6, 'med', 'facility', 'low', 'portal', {ar: 'دورة المياه في الغرفة غير نظيفة', en: 'Room bathroom not clean'}, {ar: 'دورة المياه لم تُنظف ليومين رغم الطلب.', en: 'The bathroom was not cleaned for two days despite requests.'}, 'investigating', {owner: 'u17'});
  C(-1, 'er', 'care', 'high', 'moh937', {ar: 'خروج المريض دون إجراء تحليل مطلوب', en: 'Patient discharged without a requested test'}, {ar: 'طلب الطبيب تحليلًا لوظائف القلب لكن المريض خرج قبل إجرائه وعاد بعد يوم بأعراض.', en: 'A cardiac test was ordered but the patient left before it was done and returned a day later with symptoms.'}, 'new', {urgent: true});
  C(0, 'surg', 'billing', 'low', 'phone', {ar: 'مطالبة مالية غير صحيحة', en: 'Incorrect bill'}, {ar: 'وصلتني فاتورة لخدمة مشمولة بالتأمين.', en: 'I was billed for a service covered by insurance.'}, 'new', {});
};
/* Phase 1 upgrade (document control, ESR, device records): normalises existing records once; demo data sets also get sample forms */
Q.phase1Patch = (data, demo) => {
  const S = data.settings = data.settings || {}, D = Q.defaultSettings(), out = [], add = (c, o) => out.push([c, o]);
  Object.keys(D).forEach(k => { if (S[k] === undefined) S[k] = D[k]; });
  S.phase1Seeded = true;
  const users = (data.users || []).filter(u => u.active !== false);
  const director = prep => (users.find(u => u.role === 'director' && u.id !== prep && !u.pwHash) || users.find(u => ['director', 'qps'].includes(u.role) && u.id !== prep) || {}).id;
  (data.policies || []).forEach(p => { let ch = false;
    if (!p.kind) { p.kind = 'policy'; ch = true; }
    if (p.live && !p.ackDue) { p.ackDue = Q.add(p.live.effectiveAt, S.ackDays * DAY).toISOString(); ch = true; }
    if (p.status === 'review' && !(p.approvers || []).length) { const a = director(p.preparedBy); p.reviewers = demo && p.preparedBy !== 'u2' && users.some(u => u.id === 'u2') ? ['u2'] : []; p.approvers = a ? [a] : []; p.signatures = []; p.submittedAt = p.submittedAt || new Date().toISOString(); ch = true; }
    if (ch) add('policies', p); });
  if (demo) {
    const T0 = Date.now(), at = d => new Date(T0 + d * DAY).toISOString(), pols = data.policies = data.policies || [];
    const mk = (id, code, ar, en, parent, o) => { if (pols.some(p => p.id === id)) return; const v = o.v || 1;
      const p = {id, code, kind: 'form', title: {ar, en}, category: o.cat || 'safety', deptId: 'all', ownerId: 'u2', linkedPolicyId: parent, version: v, status: o.status || 'approved', ackRequired: false, standards: o.std || [], summary: '', preparedBy: 'u2', createdAt: at(-400),
        files: Array.from({length: v}, (_, i) => ({id: Q.uid('f'), name: `${code}-v${i + 1}.pdf`, size: 95000 + i * 4000, type: 'application/pdf', by: 'u2', at: at(-400 + i * 200), version: i + 1})),
        live: {version: v, effectiveAt: at(o.eff || -150), approvedBy: 'u1', approvedAt: at((o.eff || -150) - 2), signers: ['u1']}, reviewDue: at(o.review || 900), acks: {}, ackDue: null, reviewers: [], approvers: ['u1'], signatures: [],
        history: [{v: 1, action: 'pol_approved', by: 'u1', at: at(-398), note: ''}].concat(v > 1 ? [{v, action: 'pol_approved', by: 'u1', at: at((o.eff || -150) - 2), note: ''}] : []).concat(o.status === 'archived' ? [{v, action: 'pol_archived', by: 'u1', at: at(-30), note: ''}] : [])};
      pols.push(p); add('policies', p); };
    mk('pol-qps-frm-001', 'QPS-FRM-001', 'نموذج الإبلاغ عن الحوادث OVR', 'OVR incident reporting form', 'pol-qps-pol-004', {v: 2, std: ['QM.13']});
    mk('pol-qps-frm-003', 'QPS-FRM-003', 'نموذج متابعة الشكوى', 'Complaint follow-up form', 'pol-qps-pol-009', {v: 1, cat: 'admin'});
    mk('pol-qps-frm-002', 'QPS-FRM-002', 'نموذج الشكاوى الورقي القديم', 'Old paper complaint form', 'pol-qps-pol-009', {v: 1, cat: 'admin', status: 'archived'});
    const RISK = ['high', 'medium', 'high', 'low', 'medium'];
    (data.devices || []).forEach((d, i, a) => { if (d.riskClass || i >= a.length - 2) return; d.riskClass = RISK[i % RISK.length]; d.warrantyUntil = at(-200 + i * 160); add('devices', d); });
    (data.standards || []).forEach(s => { if (s.esr != null) return; s.esr = s.priority === 'high' && ['FMS', 'IPC', 'MM', 'IPSG', 'QM'].includes(s.chapter); add('standards', s); });
  }
  return out;
};
/* fill quality data once: full demo data on the shipped demo data set, only checklist templates otherwise; then the Phase 1 upgrade */
Q.ensureQuality = data => {
  const s = data.settings = data.settings || {}, out = []; let changed = false;
  const isDemo = (data.users || []).some(u => /@alsalam-hospital\.sa$/.test(u.email || ''));
  if (!s.qualitySeeded) { changed = true;
    const any = ['policies', 'complaints', 'rounds', 'checklists'].some(c => (data[c] || []).length);
    if (any) s.qualitySeeded = true;
    else { const tmp = {users: data.users, depts: data.depts, settings: s}; Q.seedQuality(tmp, isDemo); data.settings = tmp.settings;
      ['checklists', 'policies', 'complaints', 'rounds'].forEach(c => { data[c] = data[c] || []; tmp[c].forEach(o => { data[c].push(o); out.push([c, o]); }); }); } }
  if (!data.settings.phase1Seeded) { changed = true; Q.phase1Patch(data, isDemo).forEach(x => { if (!out.some(y => y[1] === x[1])) out.push(x); }); }
  return changed ? out : null;
};
})();
