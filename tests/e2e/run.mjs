// End-to-end system test for Salamah / Q-MedOps: role crawl + OVR workflows + cross-module links
// Run: node tests/e2e/run.mjs   (needs Node 22+ and Google Chrome; set CHROME env var if not in the default path)
import {launch} from './cdp.mjs';
import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const APP = process.env.APP || pathToFileURL(resolve(DIR, '../../index.html')).href;
writeFileSync(DIR + '/evidence.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const results = [];
const check = (area, name, ok, detail = '', kind = 'FAIL') => { results.push({area, name, status: ok ? 'PASS' : kind, detail}); console.log(`${ok ? 'PASS' : kind.padEnd(4)} [${area}] ${name}${detail ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };

const HELPERS = `window.H = {
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  async go(h) { Q.form = null; if (location.hash === h) Q.render(); else location.hash = h; await H.sleep(90); },
  async as(id) { Q.closePop(); const m = document.querySelector('#modal'); if (m.open) m.close(); Q.login(id); await H.go(Q.home()); },
  view() { return document.querySelector('#views').innerText; },
  q(s, r = document) { return r.querySelector(s); },
  async click(sel, root = document) { const el = root.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); await H.sleep(110); },
  set(sel, val, root = document) { const el = root.querySelector(sel); if (!el) throw new Error('missing field ' + sel);
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = val; else el.value = val;
    el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); },
  dlg() { const d = document.querySelector('#modal'); return d.open ? d : null; },
  async submitDlg(fill = {}) { const d = H.dlg(); if (!d) throw new Error('no dialog'); for (const [k, v] of Object.entries(fill)) H.set(k, v, d); d.querySelector('form').requestSubmit(); await H.sleep(150); return H.dlg() ? (d.querySelector('[data-err]') || {}).textContent || 'dialog still open' : ''; },
  toast() { return document.querySelector('#toast').innerText; },
  tasksOf(uid) { return Q.tasks(Q.user(uid)).map(t => ({kind: t.kind, ref: t.ref, what: Q.T(t.what)})); },
  state() { const t = document.title; const v = H.view();
    if (/حدث خطأ غير متوقع|Something went wrong/.test(v)) return 'error';
    if (/صلاحية غير كافية|Access denied|لا تملك صلاحية/.test(t + v.slice(0, 200))) return 'denied';
    if (/غير متاح|غير موجود|not found|unavailable/i.test(t) || /^\\s*(البلاغ غير موجود|التحقيق غير موجود|الإجراء غير موجود|المؤشر غير موجود|المعيار غير موجود|الجهاز غير موجود)/.test(v)) return 'missing';
    return 'ok'; },
  links() { return [...new Set([...document.querySelectorAll('#app a[href^="#/"], #app [data-href]')].map(a => a.getAttribute('href') || a.dataset.href))]; },
  async fileReport(o) {
    await H.as(o.as);
    if (o.fromDevice) { await H.go('#/devices/' + o.fromDevice); await H.click('[data-act="dev-fault"][data-id="' + o.fromDevice + '"]'); await H.sleep(120); }
    else { await H.go('#/report/new'); H.set('[data-report] [name=typeId]', o.type); await H.sleep(80); H.set('[data-report] [name=deptId]', o.dept); H.set('[data-report] [name=title]', o.title); }
    H.set('[data-report] [name=occurredAt]', Q.toInput(Q.add(Q.now(), -2 * Q.HOUR)));
    if (o.affected) { H.set('[data-report] [name=affected][value=' + o.affected + ']', true); await H.sleep(80); }
    if (H.q('[data-report] [name=mrn]')) { H.set('[data-report] [name=mrn]', '884213'); H.set('[data-report] [name=age]', '3 days'); H.set('[data-report] [name=physician]', 'د. ناصر العتيبي'); H.set('[data-report] [name=diagnosis]', 'كسر في عنق الفخذ'); }
    H.set('[data-report] [name=desc]', o.desc || 'وصف وقائعي للحدث كما تمت ملاحظته في القسم دون تحليل.');
    H.set('[data-report] [name=immediate]', 'إبلاغ الطبيب المناوب ومراقبة المريض.');
    await H.click('[data-act=rf-next]'); if (Q.form.step !== 2) throw new Error('step 1 blocked: ' + H.q('[data-err]').textContent);
    H.set('[data-report] [name=harm][value=' + o.harm + ']', true); await H.sleep(80);
    if (o.sentinel) { H.set('[data-report] [name=sentinel]', true); await H.sleep(80); }
    await H.click('[data-act=rf-next]'); if (Q.form.step !== 3) throw new Error('step 2 blocked: ' + H.q('[data-err]').textContent);
    await H.click('[data-act=rf-submit]'); await H.sleep(150);
    return location.hash.split('/')[2];
  },
  async supervise(id, uid, ceo) { await H.as(uid); await H.go('#/incidents/' + id); const f = H.q('form[data-form=supervise]'); if (!f) return {form: false};
    H.set('[name=comment]', 'تمت مراجعة الحدث مع الفريق. الشدة متوسطة ولم يتكرر سابقًا.', f); H.set('[name=causes]', 'ضغط العمل وتشابه العبوات.', f); H.set('[name=prevention]', 'فصل التخزين وتحقق مزدوج.', f);
    if (ceo !== undefined) H.set('[name=ceoInformed]', ceo, f); f.requestSubmit(); await H.sleep(150); return {form: true, stage: Q.db.get('incidents', id).stage, toast: H.toast()}; },
  async review(id, uid, s, l, cls) { await H.as(uid); await H.go('#/incidents/' + id); const f = H.q('form[data-form=review]'); if (!f) return {form: false};
    f.querySelector('[data-cell="' + s + ',' + l + '"]').click(); await H.sleep(40); if (cls) H.set('[name=classification][value=' + cls + ']', true, f);
    H.set('[name=factors][value=staff]', true, f); f.requestSubmit(); await H.sleep(150); const x = Q.db.get('incidents', id); return {form: true, stage: x.stage, rcaId: x.rcaId || null, sal: Q.sal(x)}; },
  async newCapa(btnSel, owner, title) { const before = Q.db.all('capa').length; await H.click(btnSel); const err = await H.submitDlg({'[name=title]': title, '[name=ownerId]': owner});
    const c = Q.db.all('capa').length > before ? Q.db.all('capa')[Q.db.all('capa').length - 1] : null; return {err, id: c && c.id, status: c && c.status}; },
  async capaDone(id, uid) { await H.as(uid); await H.go('#/capa/' + id); if (!H.q('[data-act=capa-progress]')) return 'no progress button'; await H.click('[data-act=capa-progress]');
    return (await H.submitDlg({'[name=done]': true, '[name=text]': 'نُفذ الإجراء ووُثّق.'})) || Q.db.get('capa', id).status; },
  async capaVerify(id, uid) { await H.as(uid); await H.go('#/capa/' + id); if (!H.q('[data-act=capa-verify]')) return 'no verify button'; await H.click('[data-act=capa-verify]');
    return (await H.submitDlg({'[name=note]': 'تدقيق 20 حالة بعد التطبيق دون ملاحظات.'})) || Q.db.get('capa', id).status; },
  async closeInc(id, uid) { await H.as(uid); await H.go('#/incidents/' + id); const f = H.q('form[data-form=close]'); if (!f) return 'no close form';
    H.set('[name=feedback]', 'شكرًا للإبلاغ. تم فصل التخزين وتدريب الفريق.', f); f.requestSubmit(); await H.sleep(150); return Q.db.get('incidents', id).stage; }
};`;

const t = await launch({profile: DIR + '/profile', url: APP});
const E = async (code) => t.evaluate(`(async () => { ${code} })()`);
await t.evaluate(HELPERS);
const errMark = () => t.errors.length;
const errsSince = n => t.errors.slice(n);

/* ---------------- 1. role crawl: every reachable link per role ---------------- */
const ROLES = {u1: 'director', u2: 'qps', u3: 'supervisor(NICU)', u4: 'supervisor(ICU)', u11: 'biomed', u12: 'reporter(ICU)', u13: 'reporter(NICU)', u14: 'admin'};
const crawl = {};
for (const [uid, role] of Object.entries(ROLES)) {
  const e0 = errMark();
  const res = await E(`await H.as('${uid}');
    const nav = [...document.querySelectorAll('#side .nav a')].map(a => a.getAttribute('href'));
    const seen = new Map(), queue = [Q.home(), ...nav, '#/tasks', '#/report/new', '#/incidents?mine=1'], bad = [], from = {};
    while (queue.length && seen.size < 260) { const h = queue.shift(); if (seen.has(h)) continue;
      await H.go(h); const st = H.state(); seen.set(h, st);
      if (st !== 'ok') bad.push({link: h, state: st, from: from[h] || 'start'});
      if (st === 'ok') for (const l of H.links()) { if (!seen.has(l) && !queue.includes(l)) { queue.push(l); from[l] = h; } } }
    return {pages: seen.size, nav: nav.length, navDenied: nav.filter(n => seen.get(n) !== 'ok'), bad};`);
  crawl[uid] = res;
  const errs = errsSince(e0);
  check('Crawl', `${role} (${uid}): ${res.pages} pages, ${res.nav} nav items`, !res.bad.length && !errs.length, res.bad.length ? res.bad.slice(0, 8) : errs.slice(0, 3));
  if (res.navDenied.length) check('Crawl', `${role}: nav items lead to denied pages`, false, res.navDenied);
}
// English crawl (director) to cover the bilingual UI
{ const e0 = errMark();
  const res = await E(`Q.lang = 'en'; await H.as('u1'); const seen = new Set(), q = [Q.home(), ...[...document.querySelectorAll('#side .nav a')].map(a => a.getAttribute('href'))], bad = [];
    while (q.length && seen.size < 120) { const h = q.shift(); if (seen.has(h)) continue; seen.add(h); await H.go(h); const st = H.state(); if (st !== 'ok') bad.push([h, st]); else H.links().forEach(l => { if (!seen.has(l)) q.push(l); }); }
    Q.lang = 'ar'; return {pages: seen.size, bad};`);
  check('Crawl', `English UI (director): ${res.pages} pages`, !res.bad.length && t.errors.length === e0, res.bad.length ? res.bad : errsSince(e0).slice(0, 3)); }

/* ---------------- 2. Workflow A: low-risk OVR (SAL < 15) end to end ---------------- */
{ const A = 'Workflow A (low risk)';
  const id = await E(`return H.fileReport({as: 'u12', type: 't-fall', dept: 'icu', title: 'سقوط مريض أثناء النقل للسرير', affected: 'in', harm: 'minor'})`);
  check(A, 'Reporter (u12) files OVR through the 3-step form', /^OVR-/.test(id), id);
  const s1 = await E(`return {stage: Q.db.get('incidents','${id}').stage, supTask: H.tasksOf('u4').some(t => t.ref==='${id}'), reporterSees: (await H.as('u12'), Q.visibleIncidents().some(x => x.id==='${id}'))}`);
  check(A, 'New report lands in "awaiting supervisor" stage', s1.stage === 'new', s1.stage);
  check(A, 'ICU supervisor (u4) gets the supervise task', s1.supTask);
  check(A, 'Reporter can track own report', s1.reporterSees);
  const sup = await E(`return H.supervise('${id}', 'u4')`);
  check(A, 'Supervisor comment moves report to QPS review', sup.stage === 'review', sup);
  const q1 = await E(`return {qps: H.tasksOf('u2').some(t => t.ref==='${id}'), dir: H.tasksOf('u1').some(t => t.ref==='${id}')}`);
  check(A, 'QPS & director receive the review task', q1.qps && q1.dir, q1);
  const rv = await E(`return H.review('${id}', 'u2', 3, 2)`);
  check(A, 'QPS sets SAL 6 → routed to department (no RCA)', rv.stage === 'action' && !rv.rcaId && rv.sal === 6, rv);
  const c = await E(`return H.newCapa('[data-act="capa-new"][data-inc="${id}"]', 'u4', 'تدريب طاقم الوحدة على بروتوكول نقل المرضى المعرضين للسقوط')`);
  check(A, 'QPS adds CAPA from report page (auto-approved)', c.id && c.status === 'open', c);
  const own = await E(`return H.tasksOf('u4').some(t => t.ref==='${c.id}')`);
  check(A, 'CAPA owner (u4) receives the task', own);
  const d = await E(`return H.capaDone('${c.id}', 'u4')`);
  check(A, 'Owner marks CAPA complete → awaiting verification', d === 'done', d);
  const v = await E(`const has = H.tasksOf('u2').some(t => t.ref==='${c.id}'); const r = await H.capaVerify('${c.id}', 'u2'); return {has, r}`);
  check(A, 'QPS gets verify task and verifies effectiveness', v.has && v.r === 'verified', v);
  const cl = await E(`const has = H.tasksOf('u2').some(t => t.ref==='${id}'); return {has, st: await H.closeInc('${id}', 'u2')}`);
  check(A, 'Report surfaces for closure and closes with feedback', cl.has && cl.st === 'closed', cl);
  const notified = await E(`return H.tasksOf('u12').some(t => t.ref === '${id}')`);
  check(A, 'Reporter gets a "read the feedback" task when the report closes', notified);
  const fb = await E(`await H.as('u12'); await H.go('#/incidents/${id}'); return {seesFeedback: H.view().includes('شكرًا للإبلاغ'), cleared: !H.tasksOf('u12').some(t => t.ref === '${id}'), seen: !!Q.db.get('incidents','${id}').closure.seenAt}`);
  check(A, 'Reporter sees the feedback banner; task clears once read', fb.seesFeedback && fb.cleared && fb.seen, fb);
  const pr = await E(`await H.as('u2'); await H.go('#/incidents/${id}/print'); const v = H.view(); return {ok: H.state(), p4: v.includes('الجزء الرابع'), p5: v.includes('الجزء الخامس'), phys: v.includes('د. ناصر'), diag: v.includes('كسر'), rule: v.includes('خلال 24 ساعة')}`);
  check(A, 'Printable OVR (AD-111) shows Parts I-V, attending physician & diagnosis, 24 h notification rule', pr.ok === 'ok' && pr.p4 && pr.p5 && pr.phys && pr.diag && pr.rule, pr);
  globalThis.A_ID = id; }

/* ---------------- 3. Workflow B: high-risk (SAL ≥ 15) with RCA ---------------- */
{ const B = 'Workflow B (RCA)';
  const id = await E(`return H.fileReport({as: 'u13', type: 't-med', dept: 'nicu', title: 'إعطاء جرعة مضاعفة من الكافيين', affected: 'in', harm: 'mod'})`);
  await E(`return H.supervise('${id}', 'u3')`);
  const rv = await E(`return H.review('${id}', 'u2', 4, 4)`);
  check(B, 'SAL 16 opens RCA automatically and moves to RCA stage', rv.stage === 'rca' && !!rv.rcaId, rv);
  const rid = rv.rcaId;
  const tk = await E(`const r = Q.db.get('rca','${rid}'); return {lead: r.leadId, team: r.team, qpsMeet: H.tasksOf('u2').some(t => t.ref==='${id}'), leadTask: H.tasksOf(r.leadId).some(t => t.ref==='${id}' || t.ref==='${rid}')}`);
  check(B, 'QPS gets "RCA meeting within 5 days" task', tk.qpsMeet, tk);
  check(B, `RCA lead (${tk.lead}) gets an investigation task`, tk.leadTask, 'only qps/director roles receive RCA tasks; the lead/team get nothing');
  const early = await E(`await H.as('u2'); await H.go('#/rca/${rid}'); await H.click('[data-act=rca-approve]'); const t = H.dlg() ? H.dlg().innerText : ''; H.dlg() && H.dlg().close(); return t`);
  check(B, 'Approval is blocked until meeting, root cause and CAPA exist', /اجتماع/.test(early) && /السبب الجذري/.test(early) && /إجراء/.test(early), early.slice(0, 160));
  const lead = await E(`await H.as('u3'); await H.go('#/rca/${rid}'); const st = H.state(); if (st !== 'ok') return {st};
    await H.click('[data-act=rca-meet]'); await H.submitDlg({'[name=minutes]': 'حضر الفريق كاملًا وتمت مراجعة التسلسل.'});
    const w = H.q('form[data-rca-whys]'); H.set('[name=q]', 'لماذا أُعطيت جرعة مضاعفة؟', w); H.set('[name=a]', 'لأن أمر الطبيب كُرر في النظام.', w); w.requestSubmit(); await H.sleep(120);
    const rc = H.q('form[data-rca-root]'); H.set('[name=rootCause]', 'غياب التنبيه على الأوامر الدوائية المكررة في النظام الإلكتروني.', rc); rc.requestSubmit(); await H.sleep(120);
    const c = await H.newCapa('[data-act="capa-new"][data-rca="${rid}"]', 'u3', 'تفعيل تنبيه الأوامر المكررة في نظام الأدوية'); const r = Q.db.get('rca','${rid}');
    return {st, meeting: !!r.meetingAt, status: r.status, root: !!r.rootCause, capa: c}`);
  check(B, 'RCA lead (supervisor) logs meeting, 5 whys, root cause', lead.meeting && lead.root, lead);
  check(B, 'CAPA proposed during RCA is held as "draft" until approval', lead.capa && lead.capa.status === 'draft', lead.capa);
  const ap = await E(`await H.as('u2'); await H.go('#/rca/${rid}'); await H.click('[data-act=rca-approve]'); const e = await H.submitDlg(); const x = Q.db.get('incidents','${id}');
    return {e, stage: x.stage, capa: Q.db.get('capa','${lead.capa.id}').status, rca: Q.db.get('rca','${rid}').status}`);
  check(B, 'QPS approves RCA → report to actions, CAPA activated', ap.stage === 'action' && ap.capa === 'open' && ap.rca === 'approved', ap);
  const d = await E(`return H.capaDone('${lead.capa.id}', 'u3')`); const v = await E(`return H.capaVerify('${lead.capa.id}', 'u2')`); const cl = await E(`return H.closeInc('${id}', 'u2')`);
  check(B, 'CAPA done → verified → report closed', d === 'done' && v === 'verified' && cl === 'closed', {d, v, cl});
  const rp = await E(`await H.as('u2'); await H.go('#/rca/${rid}/print'); return {st: H.state(), root: H.view().includes('غياب التنبيه')}`);
  check(B, 'RCA report prints with root cause and action plan', rp.st === 'ok' && rp.root, rp);
  globalThis.B_RID = rid; }

/* ---------------- 4. Workflow C: sentinel event ---------------- */
{ const C = 'Workflow C (sentinel)';
  const id = await E(`return H.fileReport({as: 'u15', type: 't-care', dept: 'er', title: 'توقف قلبي غير متوقع بعد تأخر الاستجابة', affected: 'in', harm: 'death'})`);
  const s = await E(`const x = Q.db.get('incidents','${id}'); return {sent: Q.isSentinel(x), next: Q.nextStep(x).key, supTask: H.tasksOf('u5').some(t => t.ref==='${id}'), qpsTask: H.tasksOf('u2').some(t => t.ref==='${id}')}`);
  check(C, 'Harm "death" auto-flags the report as possible sentinel', s.sent, s);
  check(C, 'QPS gets the 24 h external-notice task immediately', s.qpsTask, s);
  check(C, 'ER supervisor (u5) gets the supervise task for the sentinel report', s.supTask, `next step = "${s.next}" hides the supervisor step from u5's task list`);
  const noCeo = await E(`return H.supervise('${id}', 'u5', false)`);
  check(C, 'Supervisor cannot submit a sentinel without confirming CEO informed', noCeo.form && noCeo.stage === 'new', noCeo);
  const ceo = await E(`return H.supervise('${id}', 'u5', true)`);
  check(C, 'With CEO informed, report moves to QPS review', ceo.stage === 'review', ceo);
  const rv = await E(`return H.review('${id}', 'u2', 5, 2, 'sentinel')`);
  check(C, 'QPS classifies as sentinel → RCA opens even below SAL 15', rv.stage === 'rca' && rv.rcaId, rv);
  const blk = await E(`const r = Q.db.get('rca','${rv.rcaId}'); r.meetingAt = Q.iso(Q.now()); r.rootCause = 'x'; Q.db.put('rca', r);
    Q.db.put('capa', {id: 'CAPA-T1', title: 't', ownerId: 'u5', deptId: 'er', due: Q.iso(Q.add(Q.now(), 9*Q.DAY)), incidentId: '${id}', rcaId: '${rv.rcaId}', progress: 0, status: 'draft', updates: []});
    await H.as('u2'); await H.go('#/rca/${rv.rcaId}'); await H.click('[data-act=rca-approve]'); const t = H.dlg() ? H.dlg().innerText : ''; H.dlg() && H.dlg().close(); return t`);
  check(C, 'RCA approval blocked until external notice is logged', /الإخطار الخارجي/.test(blk), blk.slice(0, 120));
  const ex = await E(`await H.as('u2'); await H.go('#/incidents/${id}'); await H.click('[data-act=external]'); const e = await H.submitDlg({'[name=ref]': 'SPSC-2026-7781'}); const x = Q.db.get('incidents','${id}'); return {e, ext: !!x.external, to: x.external && x.external.to}`);
  check(C, 'External notice logged to CBAHI, MOH, SPSC', ex.ext && ex.to.length === 3, ex);
  const ms = await E(`await H.as('u1'); await H.go('#/dashboard'); return {banner: !!document.querySelector('.banner') && document.querySelector('.banner').innerText.includes('${id}'), ms: H.view().includes('الإخطار الخارجي')}`);
  check(C, 'Dashboard sentinel pathway reflects the event', ms.ms, ms); }

/* ---------------- 5. Device fault → biomedical ---------------- */
{ const D = 'Devices ↔ OVR';
  const id = await E(`return H.fileReport({as: 'u3', fromDevice: 'INF-NICU-12', affected: 'equip', harm: 'none'})`);
  const s = await E(`const x = Q.db.get('incidents','${id}'); const d = Q.db.get('devices','INF-NICU-12'); return {type: x.typeId, tag: x.deviceTag, dev: d.status, biomedSees: Q.canSeeIncident(x, Q.user('u11')), biomedTask: H.tasksOf('u11').some(t => t.ref==='VEN-ICU-03'), pmDue03: Q.nextPM(Q.db.get('devices','VEN-ICU-03')) < Q.add(Q.now(), 14*Q.DAY)}`);
  check(D, 'Fault reported from device page pre-fills type & asset tag', s.type === 't-device' && s.tag === 'INF-NICU-12', s);
  check(D, 'Device status switches to "precautionary check"', s.dev === 'check', s.dev);
  check(D, 'Biomedical engineering can see the linked report', s.biomedSees);
  check(D, 'Biomedical engineering gets a task for a device under precautionary check (VEN-ICU-03)', s.biomedTask, 'tasks only cover devices in "down/repair", not "check"');
  const fix = await E(`await H.as('u11'); await H.go('#/devices/INF-NICU-12'); const linked = H.view().includes('${id}'); await H.click('[data-act=dev-log]'); await H.submitDlg({'[name=text]': 'فحص شامل للمضخة، تعمل بشكل سليم.'}); return {linked, st: Q.db.get('devices','INF-NICU-12').status}`);
  check(D, 'Device page lists the linked report; passing check returns it to service', fix.linked && fix.st === 'ok', fix);
  const ret = await E(`return H.tasksOf('u11').filter(t => t.kind==='device').map(t => t.ref)`);
  const retired = await E(`const d = Q.db.get('devices','XR-RAD-01'); d.status = 'retired'; d.lastPM = Q.iso(Q.add(Q.now(), -400*Q.DAY)); Q.db.put('devices', d); return H.tasksOf('u11').some(t => t.ref==='XR-RAD-01')`);
  check(D, 'Retired devices do not generate PM tasks', !retired, 'retired XR-RAD-01 still produces a PM task'); }

/* ---------------- 6. Indicators (NICU sheet) ---------------- */
{ const K = 'Indicators';
  const def = await E(`return Q.db.all('kpis').filter(k => k.deptId==='nicu').map(k => k.name.en)`);
  check(K, `NICU indicator sheet coverage (${def.length}/9 indicators defined)`, def.length === 9, def);
  const prev = await E(`return Q.ymAdd(Q.ym(Q.now()), -1)`);
  const en = await E(`await H.as('u3'); await H.go('#/indicators/entry/${prev}'); const tr = H.q('tr[data-k="k1"]'); H.set('[name=num]', '30', tr); H.set('[name=den]', '36', tr); H.q('form[data-entry]').requestSubmit(); await H.sleep(120); return Q.db.get('kpiValues','k1:${prev}')`);
  check(K, 'NICU supervisor enters monthly numerator/denominator', en && en.num === 30 && en.den === 36 && en.by === 'u3', en);
  const rep = await E(`await H.as('u2'); Q.ui.repM = '${prev}'; await H.go('#/reports'); return H.view().includes('83%')`);
  check(K, 'Monthly committee report reflects the new value (30/36 = 83%)', rep);
  const pct = await E(`await H.as('u3'); await H.go('#/indicators/entry/${prev}'); const tr = H.q('tr[data-k="k2"]'); H.set('[name=num]', '250', tr); H.set('[name=den]', '200', tr); H.q('form[data-entry]').requestSubmit(); await H.sleep(120); return Q.db.get('kpiValues','k2:${prev}').num`);
  check(K, 'Validation rejects numerator > denominator for percentages', pct !== 250, pct);
  const leak = await E(`await H.as('u4'); await H.go('#/indicators/k1'); return {st: H.state(), canEnter: !!H.q('[data-act=kpi-val]')}`);
  check(K, 'ICU supervisor cannot open/edit NICU indicator by URL', leak.st !== 'ok' || !leak.canEnter, leak); }

/* ---------------- 7. CBAHI evidence ---------------- */
{ const CB = 'CBAHI';
  const tgt = await E(`for (const s of Q.db.all('standards')) for (const e of s.elements) if (e.status==='missing' && Q.user(e.ownerId) && Q.user(e.ownerId).role==='supervisor') return {std: s.id, el: e.id, owner: e.ownerId}; return null`);
  check(CB, 'Seed has a supervisor-owned missing evidence element', !!tgt, tgt);
  if (tgt) {
    const tk = await E(`return H.tasksOf('${tgt.owner}').some(t => t.kind==='cbahi' && t.ref==='${tgt.std}')`);
    check(CB, 'Element owner gets "upload evidence" task', tk);
    const r0 = await E(`return Q.readiness().ok`);
    await E(`await H.as('${tgt.owner}'); await H.go('#/cbahi/' + encodeURIComponent('${tgt.std}'))`);
    await t.setFiles(`input[data-up="${tgt.el}"]`, [DIR.replace(/\//g, '\\') + '\\evidence.pdf']); await new Promise(r => setTimeout(r, 400));
    const up = await E(`const e = Q.db.get('standards','${tgt.std}').elements.find(e => e.id==='${tgt.el}'); return {st: e.status, files: e.files.length, qps: H.tasksOf('u2').some(t => t.kind==='cbahi' && t.ref==='${tgt.std}')}`);
    check(CB, 'Owner uploads evidence → "under review" + QPS review task', up.st === 'uploaded' && up.qps, up);
    const ap = await E(`await H.as('u2'); await H.go('#/cbahi/' + encodeURIComponent('${tgt.std}')); await H.click('[data-act=el-approve][data-el="${tgt.el}"]'); return Q.readiness().ok`);
    check(CB, 'QPS approves → readiness count increases', ap === r0 + 1, {before: r0, after: ap});
  } }

/* ---------------- 8. Access control & cross-department isolation ---------------- */
{ const S = 'Access control';
  const r = await E(`const out = {};
    const u4 = Q.user('u4'); const xi = Q.db.all('incidents').find(x => x.deptId !== 'icu' && x.rcaId && !Q.canSeeIncident(x, u4)); const ci = Q.db.all('capa').find(c => c.deptId !== 'icu' && c.ownerId !== 'u4' && c.incidentId && !Q.canSeeIncident(Q.db.get('incidents', c.incidentId), u4)); out.targets = [xi.id, xi.rcaId, ci.id];
    await H.as('u4'); await H.go('#/incidents/' + xi.id); out.icuSupNicuIncident = H.state();
    await H.go('#/rca/' + xi.rcaId); out.icuSupNicuRca = H.state();
    await H.go('#/capa/' + ci.id); out.icuSupNicuCapa = H.state();
    await H.as('u12'); await H.go('#/rca'); out.reporterRca = H.state(); await H.go('#/admin'); out.reporterAdmin = H.state(); await H.go('#/incidents/OVR-2026-1048'); out.reporterOtherInc = H.state();
    await H.as('u13'); await H.go('#/rca/RCA-2026-031'); out.reporterTeamMemberRca = H.state(); out.u13InTeam = Q.db.get('rca','RCA-2026-031').team.includes('u13');
    await H.as('u11'); await H.go('#/admin'); out.biomedAdmin = H.state();
    await H.as('u2'); await H.go('#/incidents/OVR-2026-1048'); out.qpsSeesAnonReporter = !H.view().includes('مخفي');
    await H.as('u3'); await H.go('#/incidents/OVR-2026-1048'); out.supSeesAnon = H.view().includes('مخفي');
    return out;`);
  check(S, 'ICU supervisor blocked from another department’s report', r.icuSupNicuIncident !== 'ok', r.icuSupNicuIncident);
  check(S, 'ICU supervisor blocked from that report’s RCA by direct URL', r.icuSupNicuRca !== 'ok', 'RCA detail has no visibility check: ' + r.targets[1] + ' → ' + r.icuSupNicuRca);
  check(S, 'ICU supervisor blocked from another department’s CAPA by direct URL', r.icuSupNicuCapa !== 'ok', 'CAPA detail has no visibility check: ' + r.targets[2] + ' → ' + r.icuSupNicuCapa);
  check(S, 'Staff blocked from RCA list and admin', r.reporterRca === 'denied' && r.reporterAdmin === 'denied', r);
  check(S, "Staff blocked from another person's report", r.reporterOtherInc !== 'ok', r.reporterOtherInc);
  check(S, 'Staff member who is on an RCA team can open that RCA', r.reporterTeamMemberRca === 'ok', `u13 is in RCA-2026-031 team (${r.u13InTeam}) but gets "${r.reporterTeamMemberRca}"`);
  check(S, 'Biomed blocked from admin', r.biomedAdmin === 'denied', r.biomedAdmin);
  check(S, 'Anonymous reporter: QPS sees name, supervisor sees "withheld" (Just Culture)', r.qpsSeesAnonReporter && r.supSeesAnon, r); }

/* ---------------- 9. Routing gaps ---------------- */
{ const G = 'Routing gaps';
  const it = await E(`const id = await H.fileReport({as: 'u14', type: 't-care', dept: 'it', title: 'تعطل نظام طلب الأدوية لمدة ساعتين', affected: 'other', harm: 'nh'});
    const who = Q.db.all('users').filter(u => H.tasksOf(u.id).some(t => t.ref === id)).map(u => u.id); return {id, who}`);
  check(G, 'Report in a department without a supervisor (IT) is routed to someone', it.who.length > 0, `nobody receives ${it.id} until the 24 h deadline passes`);
  const cl = await E(`const id = await H.fileReport({as: 'u12', type: 't-id', dept: 'icu', title: 'سوار تعريف بدون رقم ملف', affected: 'in', harm: 'nh'});
    await H.as('u4'); await H.go('#/incidents/' + id); await H.click('[data-act=inc-return]'); await H.submitDlg({'[name=text]': 'ما رقم الغرفة بالتحديد؟'});
    return {id, reporterTask: H.tasksOf('u12').some(t => t.ref === id)}`);
  check(G, 'Reporter is notified when supervisor asks for clarification', cl.reporterTask, 'request is only posted as a comment; no task or badge for the reporter');
  const ans = await E(`await H.as('u12'); await H.go('#/incidents/${cl.id}'); const banner = H.view().includes('طلب إيضاح'); Q.ui.incTab = 'comments'; Q.render(); await H.sleep(60);
    const f = H.q('form[data-comment]'); H.set('[name=text]', 'الغرفة 12، السرير ب.', f); f.requestSubmit(); await H.sleep(120);
    return {banner, cleared: !H.tasksOf('u12').some(t => t.ref === '${cl.id}'), open: Q.db.get('incidents','${cl.id}').clarify.open}`);
  check(G, 'Reporter sees the request, replies, and the task clears', ans.banner && ans.cleared && ans.open === false, ans);
  const notif = await E(`const x = Q.db.get('incidents','${globalThis.A_ID}'); return {reportedWithin24h: (new Date(x.reportedAt) - new Date(x.occurredAt)) <= 864e5, printedOnTime: x.closure.onTime}`);
  const late = await E(`const x = Q.db.get('incidents','${globalThis.A_ID}'); const keep = x.occurredAt; x.occurredAt = Q.iso(Q.add(x.reportedAt, -30 * Q.HOUR)); const r = Q.reportedOnTime(x); x.occurredAt = keep; return {late: r, onTime: Q.reportedOnTime(x)}`);
  check(G, 'OVR "Notification on time" follows the 24 h reporting rule', late.late === false && late.onTime === true, late);
  const eoc = await E(`const id = Q.db.all('incidents').find(x => x.deviceTag === 'INF-NICU-12').id; await H.as('u2'); await H.go('#/incidents/' + id); Q.ui.incTab = 'review'; Q.render(); await H.sleep(60);
    await H.click('[data-act=inc-eoc]'); await H.submitDlg({'[name=trends]': true, '[name=note]': 'مراجعة مع الهندسة الطبية.'}); const e = Q.db.get('incidents', id).eoc;
    await H.as('u3'); await H.go('#/incidents/' + id); Q.ui.incTab = 'review'; Q.render(); await H.sleep(60); return {saved: !!e && e.trends && e.onTime, supSees: H.view().includes('الجزء الخامس'), supCannotEdit: !H.q('[data-act=inc-eoc]')}`);
  check(G, 'Part V (EOC safety officer) is completed by QPS and visible read-only to others', eoc.saved && eoc.supSees && eoc.supCannotEdit, eoc); }

/* ---------------- 10. Data integrity sweep ---------------- */
{ const I = 'Data integrity';
  const r = await E(`const ids = c => new Set(Q.db.all(c).map(x => x.id)); const U = ids('users'), Dp = ids('depts'), In = ids('incidents'), R = ids('rca'), T = ids('types'), Dv = ids('devices'); const bad = [];
    Q.db.all('incidents').forEach(x => { if (!Dp.has(x.deptId)) bad.push(x.id+' dept'); if (!T.has(x.typeId)) bad.push(x.id+' type'); if (!U.has(x.reporterId)) bad.push(x.id+' reporter'); if (x.rcaId && !R.has(x.rcaId)) bad.push(x.id+' rca'); if (x.deviceTag && !Dv.has(x.deviceTag)) bad.push(x.id+' device'); if (x.review && !U.has(x.review.ownerId)) bad.push(x.id+' owner');
      if (['rca'].includes(x.stage) && !x.rcaId) bad.push(x.id+' rca-stage-without-rca'); if (x.stage!=='new' && !x.supervisor && x.stage!=='closed') bad.push(x.id+' past-new-without-supervisor'); if (['rca','action','closed'].includes(x.stage) && !x.review) bad.push(x.id+' no-review'); });
    Q.db.all('rca').forEach(r => { if (!In.has(r.incidentId)) bad.push(r.id+' incident'); r.team.forEach(u => { if (!U.has(u)) bad.push(r.id+' team '+u); }); });
    Q.db.all('capa').forEach(c => { if (!U.has(c.ownerId)) bad.push(c.id+' owner'); if (c.incidentId && !In.has(c.incidentId)) bad.push(c.id+' incident'); if (c.rcaId && !R.has(c.rcaId)) bad.push(c.id+' rca'); });
    Q.db.all('kpis').forEach(k => { if (!Dp.has(k.deptId)) bad.push(k.id+' dept'); }); Q.db.all('devices').forEach(d => { if (!Dp.has(d.deptId)) bad.push(d.id+' dept'); });
    Q.db.all('standards').forEach(s => s.elements.forEach(e => { if (!U.has(e.ownerId)) bad.push(s.id+' owner'); }));
    return bad;`);
  check(I, 'All cross-references resolve (users, depts, types, RCA, CAPA, devices, KPIs, standards)', !r.length, r.slice(0, 10));
  const persist = await E(`await H.sleep(400); return Q.db.persistent`);
  await t.navigate(APP); await t.evaluate(HELPERS);
  const after = await E(`return {a: Q.db.get('incidents','${globalThis.A_ID}').stage, k: !!Q.db.get('kpiValues','k1:' + Q.ymAdd(Q.ym(Q.now()), -1))}`);
  check(I, 'Data persists across a full page reload (IndexedDB)', persist && after.a === 'closed', after); }

check('Runtime', 'No JavaScript exceptions or console errors during the whole run', t.errors.length === 0, t.errors.slice(0, 5));
writeFileSync(DIR + '/results.json', JSON.stringify({results, crawl}, null, 1));
const sum = s => results.filter(r => r.status === s).length;
console.log(`\nTOTAL ${results.length} · PASS ${sum('PASS')} · FAIL ${sum('FAIL')} · GAP ${sum('GAP')} · INFO ${sum('INFO')}`);
t.close();
