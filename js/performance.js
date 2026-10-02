/* المؤشرات السريرية + جاهزية CBAHI + الأجهزة الطبية */
(() => {
'use strict';
const Q = window.Q, {$, $$, esc, ic, L, T} = Q;
const UNITS = {pct: ['نسبة مئوية %', 'Percentage %'], per1000: ['لكل 1000', 'Per 1,000'], days: ['أيام (متوسط)', 'Days (average)'], count: ['عدد', 'Count']};
const monthsBack = n => { const cur = Q.ym(Q.now()); return Array.from({length: n}, (_, i) => Q.ymAdd(cur, i - n + 1)); };
const series = (k, months) => months.map(m => Q.kVal(k, Q.db.get('kpiValues', `${k.id}:${m}`)));
const lastVal = vals => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return {v: vals[i], i}; return {v: null, i: -1}; };
const visibleKPIs = () => Q.db.all('kpis').filter(k => Q.canSeeKPI(k));

/* =============== indicators =============== */
Q.views.indicators = {perm: 'kpi.view', render(parts) {
  if (parts[0] === 'entry') return entryView(parts[1]);
  if (parts[0]) return kpiDetail(parts[0]);
  const dept = Q.ui.kDept || 'all';
  const all = visibleKPIs().filter(k => k.active !== false);
  const depts = [...new Set(all.map(k => k.deptId))];
  const list = all.filter(k => dept === 'all' || k.deptId === dept);
  const months = monthsBack(9);
  const cards = list.map(k => { const s = series(k, months), lv = lastVal(s); return {k, s, lv, st: Q.kState(k, lv.v)}; });
  const cnt = st => cards.filter(c => c.st === st).length;
  const prev = Q.ymAdd(Q.ym(Q.now()), -1);
  const missing = list.filter(k => !Q.db.get('kpiValues', `${k.id}:${prev}`)).length;
  return {title: L('المؤشرات', 'Indicators'), html: `
  <div class="page-head"><div><h2>${L('مؤشرات الأداء السريرية', 'Clinical performance indicators')}</h2><p>${L(`${list.length} مؤشرًا نشطًا · آخر 9 أشهر`, `${list.length} active indicators · last 9 months`)}</p></div>
    <div class="row"><span class="chip ok">${cnt('ok')} ${L('ضمن الهدف', 'on target')}</span><span class="chip med">${cnt('med')} ${L('مراقبة', 'watch')}</span><span class="chip crit">${cnt('crit')} ${L('خارج الحد', 'breach')}</span>
    ${Q.can('kpi.enter') ? `<a class="btn btn-p" href="#/indicators/entry/${prev}">${ic('edit')}${L(`إدخال بيانات ${Q.fMonth(prev)}`, `Enter ${Q.fMonth(prev)}`)}${missing ? ` <em class="pill">${missing}</em>` : ''}</a>` : ''}${Q.can('kpi.define') ? `<button class="btn btn-s" data-act="kpi-new">${ic('plus')}${L('مؤشر جديد', 'New indicator')}</button>` : ''}</div></div>
  ${depts.length > 1 ? `<div style="margin-bottom:12px">${Q.seg([['all', L('كل الأقسام', 'All departments')], ...depts.map(d => [d, Q.dshort(d)])], dept, 'k-dept')}</div>` : ''}
  <div class="ind-grid">${cards.map(({k, s, lv, st}) => `
    <a class="card ind" href="#/indicators/${k.id}"><div class="row"><span class="code">${esc(k.code)} · ${Q.dshort(k.deptId)}</span><span class="chip ${st}">${T(Q.K_ST[st])}</span></div>
      <h3>${esc(T(k.name))}</h3>
      <div class="kpi-val c-${st}">${Q.kFmt(k, lv.v)}<small>${L('الهدف', 'target')} <span class="ltr">${Q.kTarget(k)}</span></small></div>
      ${Q.spark(s, k, 46)}<div class="mo"><span>${Q.MON[Q.lang][+months[0].slice(5) - 1]}</span><span>${Q.MON[Q.lang][+months[4].slice(5) - 1]}</span><span>${Q.MON[Q.lang][+months[8].slice(5) - 1]}</span></div>
      <div class="fx"><b>${esc(T(k.num))}</b> ÷ <b>${esc(T(k.den))}</b>${lv.i >= 0 && lv.i < 8 ? `<br><span class="c-med">${L('آخر قيمة من', 'Latest from')} ${Q.fMonth(months[lv.i])}</span>` : ''}</div></a>`).join('') || Q.empty(L('لا توجد مؤشرات.', 'No indicators.'), 'pulse')}</div>`};
}};
Q.act('k-dept', el => { Q.ui.kDept = el.dataset.v; Q.saveUI(); Q.render(); });

Q.lineChart = (k, vals, labels) => {
  const W = 640, H = 220, pb = 24, pt = 12, pl = 34;
  const nums = vals.filter(v => v != null).concat([k.target, k.warn]);
  let max = Math.max(...nums), min = Math.min(0, ...nums); if (max === min) max += 1; max += (max - min) * .12;
  const rtl = Q.lang === 'ar', n = vals.length;
  const x = i => { const idx = rtl ? n - 1 - i : i; return pl + (idx + .5) * ((W - pl) / n); };
  const y = v => H - pb - ((v - min) / (max - min)) * (H - pb - pt);
  const pts = vals.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max].map(v => `<line class="gl" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${rtl ? W : 0}" y="${y(v) + 4}" text-anchor="${rtl ? 'end' : 'start'}">${(+v).toFixed(k.unit === 'days' || max < 10 ? 1 : 0)}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T(k.name))}">${ticks}
    <line x1="${pl}" x2="${W}" y1="${y(k.target)}" y2="${y(k.target)}" stroke="var(--brand)" stroke-dasharray="4 4" opacity=".7"/><text class="ax" x="${rtl ? pl + 4 : W - 4}" y="${y(k.target) - 4}" text-anchor="${rtl ? 'start' : 'end'}" style="fill:var(--brand)">${L('الهدف', 'target')}</text>
    <line x1="${pl}" x2="${W}" y1="${y(k.warn)}" y2="${y(k.warn)}" stroke="var(--red)" stroke-dasharray="2 4" opacity=".6"/>
    <path d="${d}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="f-${Q.kState(k, p[2])}" stroke="#fff" stroke-width="1.5"><title>${labels[p[3]]}: ${p[2].toFixed(1)}</title></circle>`).join('')}
    ${labels.map((l, i) => `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}</svg></div>`;
};

function kpiDetail(id) {
  const k = Q.db.get('kpis', id); if (!k) return {title: '—', html: Q.empty(L('المؤشر غير موجود.', 'Indicator not found.'), 'pulse')};
  if (!Q.canSeeKPI(k)) return {title: L('صلاحية غير كافية', 'Access denied'), html: Q.empty(L('هذا المؤشر يخص قسمًا آخر.', 'This indicator belongs to another department.'), 'lock')};
  const canEnter = Q.canEnterKPI(k);
  const months = monthsBack(12), vals = series(k, months), lv = lastVal(vals), st = Q.kState(k, lv.v);
  const got = vals.filter(v => v != null), avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
  const met = got.filter(v => Q.kState(k, v) === 'ok').length;
  return {title: esc(T(k.name)), html: `
  <nav class="crumbs"><a href="#/indicators">${L('المؤشرات', 'Indicators')}</a>${ic('chev', 'sm flip')}<span class="ltr">${esc(k.code)}</span></nav>
  <div class="page-head"><div><div class="row"><span class="chip ${st}">${T(Q.K_ST[st])}</span><span class="chip mute">${Q.dname(k.deptId)}</span>${k.active === false ? `<span class="chip mute">${L('موقوف', 'Inactive')}</span>` : ''}</div><h2 style="margin-top:8px">${esc(T(k.name))}</h2><p>${esc(T(k.num))} ÷ ${esc(T(k.den))} · ${T(UNITS[k.unit])}</p></div>
    <div class="row">${canEnter ? `<button class="btn btn-p" data-act="kpi-val" data-id="${k.id}">${ic('edit')}${L('إدخال قيمة', 'Enter value')}</button>` : ''}${Q.can('kpi.define') ? `<button class="btn btn-s" data-act="kpi-edit" data-id="${k.id}">${L('تعريف المؤشر', 'Definition')}</button>` : ''}</div></div>
  <div class="stats">${Q.stat(L('آخر قيمة', 'Latest'), `<span class="c-${st}">${Q.kFmt(k, lv.v)}</span>`, lv.i >= 0 ? Q.fMonth(months[lv.i]) : '')}${Q.stat(L('الهدف', 'Target'), `<span class="ltr">${Q.kTarget(k)}</span>`, L(`حد التنبيه ${k.warn}`, `alert limit ${k.warn}`))}${Q.stat(L('متوسط 12 شهرًا', '12-month average'), avg != null ? Q.kFmt(k, avg) : '—')}${Q.stat(L('أشهر ضمن الهدف', 'Months on target'), `${met}<small>/ ${got.length}</small>`)}</div>
  <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('الاتجاه الشهري', 'Monthly trend')}</h3><p>${L('الخط الأخضر المتقطع هو الهدف، والأحمر حد التنبيه', 'Green dashed = target; red = alert limit')}</p></div></div><div class="card-b">${Q.lineChart(k, vals, months.map(m => Q.MON[Q.lang][+m.slice(5) - 1]))}</div></section>
  <section class="card flush"><div class="tbl-wrap"><table><thead><tr><th>${L('الشهر', 'Month')}</th><th>${esc(T(k.num))}</th><th>${esc(T(k.den))}</th><th>${L('القيمة', 'Value')}</th><th>${L('الحالة', 'Status')}</th><th class="hide-m">${L('أدخلها', 'Entered by')}</th><th></th></tr></thead><tbody>
    ${[...months].reverse().map(m => { const v = Q.db.get('kpiValues', `${k.id}:${m}`), val = Q.kVal(k, v), s = Q.kState(k, val); return `<tr><td class="nowrap">${Q.fMonth(m)}</td><td class="num">${v ? v.num : '—'}</td><td class="num">${v && k.unit !== 'count' ? v.den : '—'}</td><td class="num c-${s}"><b>${Q.kFmt(k, val, false)}</b></td><td>${v ? `<span class="chip ${s}">${T(Q.K_ST[s])}</span>` : `<span class="muted">${L('لم تُدخل', 'Missing')}</span>`}</td><td class="hide-m muted">${v ? esc(Q.uname(v.by)) : ''}${v && v.note ? ` · ${esc(v.note)}` : ''}</td><td>${canEnter ? `<button class="btn-g" data-act="kpi-val" data-id="${k.id}" data-m="${m}">${v ? L('تعديل', 'Edit') : L('إدخال', 'Enter')}</button>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div></section>`};
}
Q.act('kpi-val', el => { const k = Q.db.get('kpis', el.dataset.id), m = el.dataset.m || Q.ymAdd(Q.ym(Q.now()), -1), v = Q.db.get('kpiValues', `${k.id}:${m}`) || {};
  if (!Q.canEnterKPI(k)) return Q.toast(L('لا تملك صلاحية إدخال هذا المؤشر.', 'You cannot enter values for this indicator.'), 'err');
  Q.modal({title: L('إدخال قيمة المؤشر', 'Enter indicator value'), sub: esc(T(k.name)), body: `<div class="fgrid">
    ${Q.f.text('month', L('الشهر', 'Month'), m, {type: 'month', req: true, attrs: `max="${Q.ym(Q.now())}"`})}<div></div>
    ${Q.f.text('num', esc(T(k.num)), v.num != null ? v.num : '', {type: 'number', req: true, attrs: 'min="0" step="any"'})}
    ${k.unit !== 'count' ? Q.f.text('den', esc(T(k.den)), v.den != null ? v.den : '', {type: 'number', req: true, attrs: 'min="0" step="any"'}) : ''}
    ${Q.f.text('note', L('ملاحظة', 'Note'), v.note || '', {w: true, opt: L('(اختياري)', '(optional)')})}</div>`,
    onSubmit: d => saveVal(k, d.month, d.num, d.den, d.note) });
});
function saveVal(k, month, num, den, note) {
  num = +num; den = k.unit === 'count' ? 1 : +den;
  if (num < 0 || den < 0 || (k.unit !== 'count' && !den)) throw new Error(L('المقام يجب أن يكون أكبر من صفر.', 'Denominator must be greater than zero.'));
  if (k.unit === 'pct' && num > den) throw new Error(L('البسط لا يمكن أن يتجاوز المقام في النسب المئوية.', 'Numerator cannot exceed denominator for a percentage.'));
  Q.db.put('kpiValues', {id: `${k.id}:${month}`, kpiId: k.id, month, num, den, note: note || '', by: Q.me.id, at: Q.iso(Q.now())});
  Q.render(); Q.toast(L('حُفظت القيمة', 'Value saved'));
}
function kpiForm(k = {}) {
  return `<div class="fgrid">
    ${Q.f.text('code', L('الرمز', 'Code'), k.code || '', {req: true, ltr: true})}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), k.deptId || '', {req: true})}
    ${Q.f.text('nameAr', L('الاسم بالعربية', 'Name (Arabic)'), k.name ? k.name.ar : '', {req: true})}${Q.f.text('nameEn', L('الاسم بالإنجليزية', 'Name (English)'), k.name ? k.name.en : '', {ltr: true})}
    ${Q.f.text('num', L('البسط', 'Numerator'), k.num ? T(k.num) : '', {req: true})}${Q.f.text('den', L('المقام', 'Denominator'), k.den ? T(k.den) : '', {})}
    ${Q.f.sel('unit', L('الوحدة', 'Unit'), Object.entries(UNITS).map(([a, b]) => [a, T(b)]), k.unit || 'pct')}${Q.f.sel('dir', L('الاتجاه الأفضل', 'Better when'), [['up', L('أعلى', 'Higher')], ['down', L('أقل', 'Lower')]], k.dir || 'up')}
    ${Q.f.text('target', L('الهدف', 'Target'), k.target != null ? k.target : '', {type: 'number', req: true, attrs: 'step="any"'})}${Q.f.text('warn', L('حد التنبيه (خارج الحد بعده)', 'Alert limit (breach beyond)'), k.warn != null ? k.warn : '', {type: 'number', req: true, attrs: 'step="any"'})}
    ${k.id ? Q.f.chk('active', L('مؤشر نشط', 'Active'), k.active !== false) : ''}</div>`;
}
const kFrom = (d, k) => Object.assign(k, {code: d.code, deptId: d.deptId, name: {ar: d.nameAr, en: d.nameEn || d.nameAr}, num: d.num, den: d.den, unit: d.unit, dir: d.dir, target: +d.target, warn: +d.warn, active: d.active === undefined ? true : !!d.active});
Q.act('kpi-new', () => Q.modal({title: L('مؤشر جديد', 'New indicator'), wide: true, body: kpiForm(), onSubmit: d => { const k = kFrom(d, {id: Q.uid('k')}); Q.db.put('kpis', k); Q.go('#/indicators/' + k.id); }}));
Q.act('kpi-edit', el => { const k = Q.db.get('kpis', el.dataset.id); Q.modal({title: L('تعريف المؤشر', 'Indicator definition'), wide: true, body: kpiForm(k), onSubmit: d => { kFrom(d, k); Q.db.put('kpis', k); Q.render(); }}); });

function entryView(m) {
  if (!Q.can('kpi.enter')) return {title: '—', html: Q.empty(L('لا تملك صلاحية الإدخال.', 'No entry permission.'), 'lock')};
  m = m || Q.ymAdd(Q.ym(Q.now()), -1);
  const list = visibleKPIs().filter(k => k.active !== false && Q.canEnterKPI(k));
  const byDept = {}; list.forEach(k => (byDept[k.deptId] = byDept[k.deptId] || []).push(k));
  const done = list.filter(k => Q.db.get('kpiValues', `${k.id}:${m}`)).length;
  return {title: L('إدخال المؤشرات', 'Indicator entry'), mount: root => {
    const f = $('[data-entry]', root);
    f.addEventListener('input', e => { const tr = e.target.closest('tr[data-k]'); if (!tr) return; const k = Q.db.get('kpis', tr.dataset.k); const num = $('[name=num]', tr).value, den = $('[name=den]', tr) ? $('[name=den]', tr).value : 1;
      const v = num === '' || den === '' ? null : Q.kVal(k, {num: +num, den: +den}); const s = Q.kState(k, v); $('[data-v]', tr).innerHTML = `<span class="c-${s}"><b>${Q.kFmt(k, v, false)}</b></span>`; });
    f.addEventListener('submit', e => { e.preventDefault(); let n = 0, err = '';
      $$('tr[data-k]', f).forEach(tr => { const k = Q.db.get('kpis', tr.dataset.k); const num = $('[name=num]', tr).value, den = $('[name=den]', tr) ? $('[name=den]', tr).value : '1', note = $('[name=note]', tr).value;
        if (num === '' && (den === '' || !$('[name=den]', tr))) return; if (num === '' || den === '') { err = L(`أكمل البسط والمقام لـ ${T(k.name)}`, `Complete both values for ${T(k.name)}`); return; }
        if (k.unit === 'pct' && +num > +den) { err = L(`البسط أكبر من المقام في ${T(k.name)}`, `Numerator exceeds denominator for ${T(k.name)}`); return; }
        Q.db.put('kpiValues', {id: `${k.id}:${m}`, kpiId: k.id, month: m, num: +num, den: k.unit === 'count' ? 1 : +den, note, by: Q.me.id, at: Q.iso(Q.now())}); n++; });
      if (err) return Q.toast(err, 'err'); Q.render(); Q.toast(L(`حُفظت ${n} قيم لشهر ${Q.fMonth(m)}`, `${n} values saved for ${Q.fMonth(m)}`)); });
  }, html: `
  <nav class="crumbs"><a href="#/indicators">${L('المؤشرات', 'Indicators')}</a>${ic('chev', 'sm flip')}<span>${L('إدخال شهري', 'Monthly entry')}</span></nav>
  <div class="page-head"><div><h2>${L('إدخال بيانات المؤشرات', 'Enter indicator data')}</h2><p>${L(`${done} من ${list.length} مؤشرات مُدخلة لهذا الشهر`, `${done} of ${list.length} entered for this month`)}</p></div>
    <div class="row month-nav"><a class="ibtn" href="#/indicators/entry/${Q.ymAdd(m, -1)}" aria-label="${L('الشهر السابق', 'Previous month')}">${ic('chev', 'sm')}</a><b>${Q.fMonth(m)}</b>${m < Q.ym(Q.now()) ? `<a class="ibtn" href="#/indicators/entry/${Q.ymAdd(m, 1)}" aria-label="${L('الشهر التالي', 'Next month')}">${ic('chev', 'sm flip-x')}</a>` : '<span class="ibtn ghost"></span>'}</div></div>
  <form data-entry>${Object.entries(byDept).map(([d, ks]) => `<section class="card flush" style="margin-bottom:14px"><div class="card-h"><div><h3>${Q.dname(d)}</h3></div></div><div class="tbl-wrap"><table class="entry"><thead><tr><th>${L('المؤشر', 'Indicator')}</th><th>${L('البسط', 'Numerator')}</th><th>${L('المقام', 'Denominator')}</th><th>${L('القيمة', 'Value')}</th><th class="hide-m">${L('ملاحظة', 'Note')}</th></tr></thead><tbody>
    ${ks.map(k => { const v = Q.db.get('kpiValues', `${k.id}:${m}`) || {}; const val = v.num != null ? Q.kVal(k, v) : null; return `<tr data-k="${k.id}"><td><span class="t1" style="white-space:normal">${esc(T(k.name))}</span><span class="t2">${esc(T(k.num))} ÷ ${esc(T(k.den))} · ${L('الهدف', 'target')} <span class="ltr">${Q.kTarget(k)}</span></span></td>
      <td><input class="field num-in" name="num" type="number" min="0" step="any" value="${v.num != null ? v.num : ''}" aria-label="${L('البسط', 'Numerator')}"></td><td>${k.unit !== 'count' ? `<input class="field num-in" name="den" type="number" min="0" step="any" value="${v.den != null ? v.den : ''}" aria-label="${L('المقام', 'Denominator')}">` : '—'}</td>
      <td data-v class="nowrap"><span class="c-${Q.kState(k, val)}"><b>${Q.kFmt(k, val, false)}</b></span></td><td class="hide-m"><input class="field" name="note" value="${esc(v.note || '')}" aria-label="${L('ملاحظة', 'Note')}"></td></tr>`; }).join('')}
  </tbody></table></div></section>`).join('') || Q.empty(L('لا توجد مؤشرات مسندة لقسمك.', 'No indicators assigned to your department.'), 'pulse')}
  ${list.length ? `<div class="form-actions sticky"><span class="muted">${L('الحقول الفارغة لا تُحفظ', 'Empty rows are skipped')}</span><button class="btn btn-p" type="submit">${ic('check')}${L('حفظ القيم', 'Save values')}</button></div>` : ''}</form>`};
}

/* =============== CBAHI =============== */
const EL_ST = {missing: ['ناقص', 'Missing', 'crit'], uploaded: ['بانتظار المراجعة', 'Under review', 'med'], approved: ['معتمد', 'Approved', 'ok']};
const STD_LBL = {crit: ['فجوة حرجة', 'Critical gap'], med: ['قيد الاستكمال', 'In progress'], ok: ['مستوفى', 'Met']};
const CHAP = {QM: ['الجودة وسلامة المرضى', 'Quality & safety'], IPSG: ['الأهداف الدولية للسلامة', 'Intl. safety goals'], MM: ['إدارة الأدوية', 'Medication mgmt'], IPC: ['مكافحة العدوى', 'Infection control'], FMS: ['المرافق والسلامة', 'Facility & safety'], LD: ['القيادة', 'Leadership'], MOI: ['إدارة المعلومات', 'Information mgmt'], PC: ['رعاية المرضى', 'Patient care'], NR: ['التمريض', 'Nursing']};
Q.views.cbahi = {perm: 'cbahi.view', render(parts) {
  if (parts[0]) return stdDetail(parts[0]);
  const tab = Q.ui.stdTab || 'all';
  const all = Q.db.all('standards');
  const list = all.filter(s => tab === 'all' || Q.stdState(s) === tab).sort((a, b) => ({crit: 0, med: 1, ok: 2})[Q.stdState(a)] - ({crit: 0, med: 1, ok: 2})[Q.stdState(b)]);
  const chapters = [...new Set(all.map(s => s.chapter))].map(c => { const r = Q.readiness(all.filter(s => s.chapter === c)); return [c, r]; });
  const survey = Q.S().surveyDate, days = survey ? Math.ceil((new Date(survey) - Q.now()) / Q.DAY) : null;
  const r = Q.readiness(all);
  return {title: L('جاهزية CBAHI', 'CBAHI readiness'), html: `
  <div class="page-head"><div><h2>${L('ملف جاهزية CBAHI', 'CBAHI readiness file')}</h2><p>${L('معايير المستشفيات: الإصدار الثالث', 'Hospital standards, 3rd edition')}${survey ? ` · ${L('الزيارة المتوقعة', 'Expected survey')}: ${Q.fDate(survey, false)} (${L(`بعد ${Q.nDays(days)}`, `in ${days} days`)})` : ''}</p></div>
    ${Q.can('cbahi.edit') ? `<button class="btn btn-p" data-act="std-new">${ic('plus')}${L('معيار جديد', 'New standard')}</button>` : ''}</div>
  <div class="stats">${Q.stat(L('الجاهزية العامة', 'Overall readiness'), `${r.pct}<small>%</small>`, Q.track([[r.ok / r.total * 100, 'var(--brand)'], [r.med / r.total * 100, 'var(--amber-bar)'], [r.crit / r.total * 100, 'var(--red)']]))}${Q.stat(L('أدلة معتمدة', 'Approved evidence'), r.ok, L(`من ${r.total} عنصر قياس`, `of ${r.total} elements`))}${Q.stat(L('بانتظار المراجعة', 'Awaiting review'), r.med, Q.can('cbahi.edit') && r.med ? L('راجعها من صفحة المعيار', 'Review from each standard') : '')}${Q.stat(L('أدلة ناقصة', 'Missing evidence'), r.crit, L(`في ${all.filter(s => s.elements.some(e => e.status === 'missing')).length} معايير`, `across ${all.filter(s => s.elements.some(e => e.status === 'missing')).length} standards`), {cls: r.crit ? 'up-bad' : ''})}</div>
  <section class="card chapters">${chapters.map(([c, cr]) => `<div><b>${T(CHAP[c] || [c, c])} <span class="ltr" style="color:var(--faint)">${c}</span></b><strong>${cr.pct}%</strong><div class="track"><i style="width:${cr.pct}%;background:${cr.pct < 70 ? 'var(--red)' : cr.pct < 90 ? 'var(--amber-bar)' : 'var(--brand)'}"></i></div></div>`).join('')}</section>
  <div class="row" style="margin-bottom:12px">${Q.seg([['all', L('الكل', 'All'), all.length], ['crit', L('فجوات حرجة', 'Critical gaps'), all.filter(s => Q.stdState(s) === 'crit').length], ['med', L('قيد الاستكمال', 'In progress'), all.filter(s => Q.stdState(s) === 'med').length], ['ok', L('مستوفى', 'Met'), all.filter(s => Q.stdState(s) === 'ok').length]], tab, 'std-tab')}</div>
  <div class="std-grid">${list.map(s => { const st = Q.stdState(s), ok = s.elements.filter(e => e.status === 'approved').length, up = s.elements.filter(e => e.status === 'uploaded').length; return `
    <a class="card std ${st}" href="#/cbahi/${encodeURIComponent(s.id)}"><div class="row"><span class="code">${esc(s.id)}</span><span class="chip ${st}">${T(STD_LBL[st])}</span></div>
      <h3>${esc(T(s.name))}</h3><p>${esc(s.note || '')}</p>
      ${Q.track([[ok / s.elements.length * 100, 'var(--brand)'], [up / s.elements.length * 100, 'var(--amber-bar)']])}
      <div class="ft"><span>${L(`${ok} من ${s.elements.length} معتمد`, `${ok} of ${s.elements.length} approved`)}${up ? ` · ${L(`${up} للمراجعة`, `${up} to review`)}` : ''}</span>${ic('chev', 'sm flip')}</div></a>`; }).join('')}</div>`};
}};
Q.act('std-tab', el => { Q.ui.stdTab = el.dataset.v; Q.saveUI(); Q.render(); });

function stdDetail(id) {
  const s = Q.db.get('standards', id); if (!s) return {title: '—', html: Q.empty(L('المعيار غير موجود.', 'Standard not found.'), 'shield')};
  const st = Q.stdState(s), ed = Q.can('cbahi.edit');
  return {title: `<span class="ltr">${esc(s.id)}</span>`, mount: root => $$('input[data-up]', root).forEach(inp => inp.addEventListener('change', () => upload(s, inp.dataset.up, inp.files))), html: `
  <nav class="crumbs"><a href="#/cbahi">${L('جاهزية CBAHI', 'CBAHI readiness')}</a>${ic('chev', 'sm flip')}<span class="ltr">${esc(s.id)}</span></nav>
  <div class="page-head"><div><div class="row"><span class="chip ${st}">${T(STD_LBL[st])}</span><span class="chip mute">${T(CHAP[s.chapter] || [s.chapter, s.chapter])}</span>${s.priority === 'high' ? `<span class="chip crit">${L('أولوية عالية', 'High priority')}</span>` : ''}</div><h2 style="margin-top:8px">${esc(T(s.name))}</h2><p>${esc(s.note || '')}</p></div>
    <div class="row">${ed ? `<button class="btn btn-s" data-act="std-edit" data-id="${esc(s.id)}">${ic('edit')}${L('تعديل', 'Edit')}</button><button class="btn btn-p" data-act="el-new" data-id="${esc(s.id)}">${ic('plus')}${L('عنصر قياس', 'Element')}</button>` : ''}</div></div>
  <section class="card"><ul class="elements">${s.elements.map(e => { const es = EL_ST[e.status], canUp = Q.can('cbahi.upload') && (ed || e.ownerId === Q.me.id); const r = e.due && e.status === 'missing' ? Q.rel(e.due) : null; return `
    <li class="${e.status}"><div class="el-h"><span class="dot-s ${es[2]}">${T(es)}</span><b>${esc(T(e.text))}</b><span class="sp"></span><small>${Q.avatar(e.ownerId, 's')} ${esc(Q.uname(e.ownerId))}</small>${r ? `<span class="due ${r.cls}">${r.txt}</span>` : ''}</div>
      ${e.files.length ? `<ul class="files">${e.files.map(f => `<li>${ic('file', 'sm')}<button class="btn-g" data-act="ev-dl" data-std="${esc(s.id)}" data-el="${e.id}" data-f="${f.id}">${esc(f.name)}</button><small>${Q.fSize(f.size)} · ${esc(Q.uname(f.by))} · ${Q.fDate(f.at, false)}</small>${ed || f.by === Q.me.id ? `<button class="btn-g xs" data-act="ev-del" data-std="${esc(s.id)}" data-el="${e.id}" data-f="${f.id}" aria-label="${L('حذف', 'Delete')}">${ic('x', 'sm')}</button>` : ''}</li>`).join('')}</ul>` : ''}
      ${e.note ? `<p class="muted el-note">${esc(e.note)}</p>` : ''}
      <div class="el-a">${canUp && e.status !== 'approved' ? `<label class="btn btn-s sm">${ic('clip', 'sm')}${L('إرفاق دليل', 'Attach evidence')}<input type="file" hidden data-up="${e.id}" multiple accept=".pdf,image/*,.doc,.docx,.xlsx"></label>` : ''}
        ${ed && e.status === 'uploaded' ? `<button class="btn btn-p sm" data-act="el-approve" data-std="${esc(s.id)}" data-el="${e.id}">${ic('check', 'sm')}${L('اعتماد', 'Approve')}</button><button class="btn btn-s sm" data-act="el-reject" data-std="${esc(s.id)}" data-el="${e.id}">${L('رفض مع ملاحظة', 'Reject with note')}</button>` : ''}
        ${ed ? `<button class="btn-g" data-act="el-edit" data-std="${esc(s.id)}" data-el="${e.id}">${L('تعديل', 'Edit')}</button>` : ''}${ed && e.status === 'approved' ? `<button class="btn-g" data-act="el-reopen" data-std="${esc(s.id)}" data-el="${e.id}">${L('إعادة فتح', 'Reopen')}</button>` : ''}</div></li>`; }).join('')}</ul></section>`};
}
async function upload(s, elId, files) {
  const e = s.elements.find(x => x.id === elId); let n = 0;
  for (const file of files) { if (file.size > 20 * 1048576) { Q.toast(L(`${file.name} أكبر من 20 ميجابايت`, `${file.name} exceeds 20 MB`), 'err'); continue; }
    const id = Q.uid('f'); await Q.db.putFile(id, file); e.files.push({id, name: file.name, size: file.size, type: file.type, by: Q.me.id, at: Q.iso(Q.now())}); n++; }
  if (n) { e.status = 'uploaded'; e.note = ''; Q.db.put('standards', s); Q.audit('cbahi', s.id, 'uploaded', T(e.text)); Q.render(); Q.toast(L('أُرفق الدليل وأُرسل للمراجعة', 'Evidence attached and sent for review')); }
}
const stdEl = el => { const s = Q.db.get('standards', el.dataset.std); return [s, s.elements.find(x => x.id === el.dataset.el)]; };
Q.act('ev-dl', async el => { const [, e] = stdEl(el); const f = e.files.find(x => x.id === el.dataset.f); const b = await Q.db.getFile(f.id); if (!b) return Q.toast(L('هذا ملف تجريبي بلا محتوى.', 'Demo file without content.'), 'err'); Q.download(f.name, b); });
Q.act('ev-del', async el => { const [s, e] = stdEl(el); if (!await Q.confirm(L('حذف هذا الملف من الأدلة؟', 'Remove this file?'), {danger: true, ok: L('حذف', 'Delete')})) return; e.files = e.files.filter(f => f.id !== el.dataset.f); Q.db.delFile(el.dataset.f); if (!e.files.length) e.status = 'missing'; Q.db.put('standards', s); Q.render(); });
Q.act('el-approve', el => { const [s, e] = stdEl(el); e.status = 'approved'; e.reviewedBy = Q.me.id; e.reviewedAt = Q.iso(Q.now()); Q.db.put('standards', s); Q.audit('cbahi', s.id, 'approved', T(e.text)); Q.render(); Q.toast(L('اعتُمد الدليل', 'Evidence approved')); });
Q.act('el-reopen', el => { const [s, e] = stdEl(el); e.status = e.files.length ? 'uploaded' : 'missing'; Q.db.put('standards', s); Q.render(); });
Q.act('el-reject', el => { const [s, e] = stdEl(el); Q.modal({title: L('رفض الدليل', 'Reject evidence'), body: `<div class="fgrid one">${Q.f.area('note', L('ما المطلوب تعديله؟', 'What needs to change?'), '', {req: true, rows: 3})}</div>`, submit: L('رفض', 'Reject'), danger: true, onSubmit: d => { e.status = 'missing'; e.note = d.note; Q.db.put('standards', s); Q.render(); }}); });
const elForm = (e = {}) => `<div class="fgrid">${Q.f.text('ar', L('عنصر القياس بالعربية', 'Element (Arabic)'), e.text ? e.text.ar : '', {req: true, w: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), e.text ? e.text.en : '', {w: true, ltr: true})}${Q.f.sel('ownerId', L('المسؤول', 'Owner'), Q.userOpts(u => u.role !== 'reporter'), e.ownerId || '', {req: true, empty: L('اختر', 'Select')})}${Q.f.text('due', L('موعد الاستكمال', 'Due'), e.due ? Q.toDateInput(e.due) : '', {type: 'date'})}</div>`;
Q.act('el-new', el => { const s = Q.db.get('standards', el.dataset.id); Q.modal({title: L('عنصر قياس جديد', 'New element'), body: elForm(), onSubmit: d => { s.elements.push({id: Q.uid('el'), text: {ar: d.ar, en: d.en || d.ar}, ownerId: d.ownerId, due: Q.fromInput(d.due), status: 'missing', files: [], note: ''}); Q.db.put('standards', s); Q.render(); }}); });
Q.act('el-edit', el => { const [s, e] = stdEl(el); Q.modal({title: L('تعديل عنصر القياس', 'Edit element'), body: elForm(e), onSubmit: d => { e.text = {ar: d.ar, en: d.en || d.ar}; e.ownerId = d.ownerId; e.due = Q.fromInput(d.due); Q.db.put('standards', s); Q.render(); }}); });
const stdForm = (s = {}) => `<div class="fgrid">${Q.f.text('id', L('رمز المعيار', 'Standard code'), s.id || '', {req: true, ltr: true, attrs: s.id ? 'readonly' : '', ph: 'QM.14'})}${Q.f.sel('chapter', L('الفصل', 'Chapter'), Object.entries(CHAP).map(([k, v]) => [k, `${k}: ${T(v)}`]), s.chapter || 'QM')}${Q.f.text('ar', L('الاسم بالعربية', 'Name (Arabic)'), s.name ? s.name.ar : '', {req: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), s.name ? s.name.en : '', {ltr: true})}${Q.f.sel('priority', L('الأولوية', 'Priority'), [['normal', L('عادية', 'Normal')], ['high', L('عالية', 'High')]], s.priority || 'normal')}${Q.f.area('note', L('ملاحظة الحالة', 'Status note'), s.note || '', {rows: 2})}</div>`;
Q.act('std-new', () => Q.modal({title: L('معيار جديد', 'New standard'), wide: true, body: stdForm(), onSubmit: d => { if (Q.db.get('standards', d.id)) throw new Error(L('الرمز مستخدم.', 'Code already exists.')); Q.db.put('standards', {id: d.id.trim(), chapter: d.chapter, name: {ar: d.ar, en: d.en || d.ar}, priority: d.priority, note: d.note, elements: []}); Q.go('#/cbahi/' + encodeURIComponent(d.id.trim())); }}));
Q.act('std-edit', el => { const s = Q.db.get('standards', el.dataset.id); Q.modal({title: L('تعديل المعيار', 'Edit standard'), wide: true, body: stdForm(s), onSubmit: d => { Object.assign(s, {chapter: d.chapter, name: {ar: d.ar, en: d.en || d.ar}, priority: d.priority, note: d.note}); Q.db.put('standards', s); Q.render(); }}); });

/* =============== devices =============== */
const DEV_ST = {ok: ['في الخدمة', 'In service', 'ok'], check: ['فحص احترازي', 'Precautionary check', 'med'], repair: ['قيد الإصلاح', 'Under repair', 'high'], down: ['خارج الخدمة', 'Out of service', 'crit'], retired: ['مُستبعد', 'Retired', 'mute']};
const MK = {pm: ['صيانة وقائية', 'Preventive maintenance'], repair: ['إصلاح', 'Repair'], inspection: ['فحص', 'Inspection']};
Q.views.devices = {perm: 'device.view', render(parts) {
  if (parts[0]) return devDetail(parts[0]);
  const f = Object.assign({st: 'all', dept: 'all', q: ''}, Q.ui.devF || {});
  const all = Q.db.all('devices').filter(d => Q.me.role !== 'supervisor' || d.deptId === Q.me.deptId);
  const q = f.q.trim().toLowerCase();
  const list = all.filter(d => (f.st === 'all' || (f.st === 'pm' ? Q.nextPM(d) < Q.now() : d.status === f.st)) && (f.dept === 'all' || d.deptId === f.dept) && (!q || [d.id, T(d.name), d.model, d.serial].join(' ').toLowerCase().includes(q)));
  const now = Q.now();
  return {title: L('الأجهزة الطبية', 'Medical devices'), mount: root => { $$('[data-df]', root).forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'change', () => { Q.ui.devF = Object.assign(f, {[el.dataset.df]: el.value}); Q.saveUI(); Q.render(); })); }, html: `
  <div class="page-head"><div><h2>${L('سجل الأجهزة الطبية', 'Medical device register')}</h2><p>${L('الأعطال والصيانة الوقائية بالتنسيق مع الهندسة الطبية الحيوية', 'Faults and preventive maintenance with biomedical engineering')}</p></div>
    <div class="row"><button class="btn btn-s" data-act="dev-fault">${ic('alert')}${L('بلاغ عطل جهاز', 'Report device fault')}</button>${Q.can('device.edit') ? `<button class="btn btn-p" data-act="dev-new">${ic('plus')}${L('جهاز جديد', 'New device')}</button>` : ''}</div></div>
  <div class="stats">${Q.stat(L('أجهزة مسجلة', 'Registered'), all.length)}${Q.stat(L('خارج الخدمة أو قيد الإصلاح', 'Down or in repair'), all.filter(d => ['down', 'repair'].includes(d.status)).length, '', {cls: all.some(d => d.status === 'down') ? 'up-bad' : ''})}${Q.stat(L('صيانة وقائية متأخرة', 'PM overdue'), all.filter(d => Q.nextPM(d) < now && d.status !== 'retired').length, L('تؤثر على معيار FMS.11', 'Affects FMS.11'))}${Q.stat(L('صيانة خلال 14 يومًا', 'PM due in 14 days'), all.filter(d => { const n = Q.nextPM(d); return d.status !== 'retired' && n >= now && n < Q.add(now, 14 * Q.DAY); }).length)}</div>
  <section class="card"><div class="toolbar"><div class="search">${ic('search')}<input class="field" data-df="q" type="search" value="${esc(f.q)}" placeholder="${L('رقم الأصل، الطراز، الرقم التسلسلي', 'Asset tag, model, serial')}"></div>
    <select class="field" data-df="st">${[['all', L('كل الحالات', 'All statuses')], ...Object.entries(DEV_ST).map(([k, v]) => [k, T(v)]), ['pm', L('صيانة متأخرة', 'PM overdue')]].map(([k, t]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select class="field" data-df="dept"><option value="all">${L('كل الأقسام', 'All departments')}</option>${Q.deptOpts().map(([k, t]) => `<option value="${k}" ${f.dept === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><span class="sp">${list.length}</span></div>
  <div class="tbl-wrap"><table class="flush"><thead><tr><th>${L('الجهاز', 'Device')}</th><th>${L('الموقع', 'Location')}</th><th>${L('الحالة', 'Status')}</th><th class="hide-m">${L('آخر صيانة', 'Last PM')}</th><th>${L('الصيانة القادمة', 'Next PM')}</th></tr></thead>
  <tbody>${list.map(d => { const s = DEV_ST[d.status], nx = Q.nextPM(d), r = Q.rel(nx); return `<tr class="click" data-href="#/devices/${d.id}"><td><span class="t1">${esc(T(d.name))} · <span class="ltr" style="font-weight:400">${esc(d.model)}</span></span><span class="t2 asset">${d.id}</span></td><td><span class="t1" style="font-weight:400">${Q.dshort(d.deptId)}</span><span class="t2">${esc(d.location || '')}</span></td><td><span class="dot-s ${s[2]}">${T(s)}</span></td><td class="num hide-m">${Q.fDate(d.lastPM, false)}</td><td><span class="t1 num" style="font-weight:400">${Q.fDate(nx, false)}</span><span class="t2 due ${r.late ? 'late' : r.cls}">${r.txt}</span></td></tr>`; }).join('') || `<tr><td colspan="5">${Q.empty(L('لا توجد أجهزة مطابقة.', 'No matching devices.'), 'device')}</td></tr>`}</tbody></table></div></section>`};
}};
function devDetail(id) {
  const d = Q.db.get('devices', id); if (!d) return {title: '—', html: Q.empty(L('الجهاز غير موجود.', 'Device not found.'), 'device')};
  const s = DEV_ST[d.status], nx = Q.nextPM(d), r = Q.rel(nx), ed = Q.can('device.edit');
  const log = Q.db.all('maint').filter(m => m.deviceId === d.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  const incs = Q.db.all('incidents').filter(x => x.deviceTag === d.id);
  return {title: `<span class="ltr">${d.id}</span>`, html: `
  <nav class="crumbs"><a href="#/devices">${L('الأجهزة الطبية', 'Medical devices')}</a>${ic('chev', 'sm flip')}<span class="ltr">${d.id}</span></nav>
  <div class="page-head"><div><div class="row"><span class="chip ${s[2] === 'high' ? 'high' : s[2]}">${T(s)}</span><span class="chip mute">${Q.dname(d.deptId)}</span></div><h2 style="margin-top:8px">${esc(T(d.name))} · <span class="ltr">${esc(d.model)}</span></h2><p>${esc(d.note || '')}</p></div>
    <div class="row"><button class="btn btn-s" data-act="dev-fault" data-id="${d.id}">${ic('alert')}${L('بلاغ عطل', 'Report fault')}</button>${ed ? `<button class="btn btn-s" data-act="dev-status" data-id="${d.id}">${L('تغيير الحالة', 'Change status')}</button><button class="btn btn-p" data-act="dev-log" data-id="${d.id}">${ic('wrench')}${L('تسجيل صيانة', 'Log maintenance')}</button>` : ''}</div></div>
  <div class="detail"><div class="detail-main">
    <section class="card"><div class="card-h"><div><h3>${L('سجل الصيانة', 'Maintenance log')}</h3></div></div><div class="card-b">
      ${log.length ? `<ol class="log">${log.map(m => `<li><span class="t">${Q.fDate(m.at)}</span><span><b>${T(MK[m.kind])}</b> · ${esc(Q.uname(m.by))} ${m.result === 'pass' ? `<span class="chip ok">${L('ناجح', 'Pass')}</span>` : m.result === 'fail' ? `<span class="chip crit">${L('فشل', 'Fail')}</span>` : `<span class="chip med">${L('معلق', 'Pending')}</span>`}<br><span class="muted">${esc(m.text)}</span></span></li>`).join('')}</ol>` : `<p class="muted">${L('لا توجد سجلات.', 'No records.')}</p>`}
    </div></section>
    ${incs.length ? `<section class="card flush" style="margin-top:16px"><div class="card-h"><div><h3>${L('بلاغات مرتبطة', 'Linked reports')}</h3></div></div><div class="tbl-wrap"><table><tbody>${incs.map(x => `<tr class="click" data-href="#/incidents/${x.id}"><td><span class="t1">${esc(T(x.title))}</span><span class="t2 oid">${x.id}</span></td><td>${Q.salChip(x)}</td><td>${T(Q.STAGES[x.stage])}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div><aside class="detail-side"><section class="card"><div class="card-b"><dl class="meta one">
    <div><dt>${L('رقم الأصل', 'Asset tag')}</dt><dd class="ltr">${esc(d.id)}</dd></div><div><dt>${L('الرقم التسلسلي', 'Serial')}</dt><dd class="ltr">${esc(d.serial || '—')}</dd></div>
    <div><dt>${L('الموقع', 'Location')}</dt><dd>${Q.dname(d.deptId)} · ${esc(d.location || '')}</dd></div><div><dt>${L('الوكيل', 'Vendor')}</dt><dd>${esc(d.vendor || '—')}</dd></div>
    <div><dt>${L('دورة الصيانة', 'PM interval')}</dt><dd>${L(`كل ${d.pmMonths} أشهر`, `every ${d.pmMonths} months`)}</dd></div>
    <div><dt>${L('الصيانة القادمة', 'Next PM')}</dt><dd>${Q.fDate(nx, false)} · <span class="due ${r.late ? 'late' : r.cls}">${r.txt}</span></dd></div></dl>
    ${ed ? `<button class="btn btn-s sm" data-act="dev-edit" data-id="${d.id}" style="margin-top:12px">${ic('edit', 'sm')}${L('تعديل البيانات', 'Edit details')}</button>` : ''}</div></section></aside></div>`};
}
const devForm = (d = {}) => `<div class="fgrid">${Q.f.text('id', L('رقم الأصل', 'Asset tag'), d.id || '', {req: true, ltr: true, attrs: d.id ? 'readonly' : '', ph: 'VEN-ICU-08'})}${Q.f.text('serial', L('الرقم التسلسلي', 'Serial'), d.serial || '', {ltr: true})}${Q.f.text('ar', L('اسم الجهاز', 'Device name'), d.name ? d.name.ar : '', {req: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), d.name ? d.name.en : '', {ltr: true})}${Q.f.text('model', L('الطراز', 'Model'), d.model || '', {req: true, ltr: true})}${Q.f.text('vendor', L('الوكيل', 'Vendor'), d.vendor || '')}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), d.deptId || '', {req: true})}${Q.f.text('location', L('الموقع', 'Location'), d.location || '')}${Q.f.text('lastPM', L('آخر صيانة وقائية', 'Last PM'), d.lastPM ? Q.toDateInput(d.lastPM) : Q.toDateInput(Q.now()), {type: 'date', req: true})}${Q.f.sel('pmMonths', L('دورة الصيانة', 'PM interval'), [[3, L('كل 3 أشهر', 'Every 3 months')], [6, L('كل 6 أشهر', 'Every 6 months')], [12, L('سنويًا', 'Yearly')]], d.pmMonths || 6)}${Q.f.area('note', L('ملاحظة', 'Note'), d.note || '', {rows: 2})}</div>`;
const devFrom = (x, d) => Object.assign(d, {name: {ar: x.ar, en: x.en || x.ar}, model: x.model, serial: x.serial, vendor: x.vendor, deptId: x.deptId, location: x.location, lastPM: Q.fromInput(x.lastPM), pmMonths: +x.pmMonths, note: x.note});
Q.act('dev-new', () => Q.modal({title: L('جهاز جديد', 'New device'), wide: true, body: devForm(), onSubmit: x => { const id = x.id.trim().toUpperCase(); if (Q.db.get('devices', id)) throw new Error(L('رقم الأصل مستخدم.', 'Asset tag exists.')); Q.db.put('devices', devFrom(x, {id, status: 'ok', createdAt: Q.iso(Q.now())})); Q.go('#/devices/' + id); }}));
Q.act('dev-edit', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('تعديل الجهاز', 'Edit device'), wide: true, body: devForm(d), onSubmit: x => { devFrom(x, d); Q.db.put('devices', d); Q.render(); }}); });
Q.act('dev-status', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('حالة الجهاز', 'Device status'), body: `<div class="fgrid">${Q.f.radio('status', L('الحالة', 'Status'), Object.entries(DEV_ST).map(([k, v]) => [k, T(v)]), d.status, {w: true})}${Q.f.area('note', L('ملاحظة', 'Note'), d.note || '', {rows: 2})}</div>`,
  onSubmit: x => { const old = d.status; d.status = x.status; d.note = x.note; Q.db.put('devices', d); Q.db.put('maint', {id: Q.uid('m'), deviceId: d.id, kind: 'inspection', at: Q.iso(Q.now()), by: Q.me.id, text: `${T(DEV_ST[old])} → ${T(DEV_ST[d.status])}${x.note ? ' · ' + x.note : ''}`, result: d.status === 'ok' ? 'pass' : 'pending'}); Q.render(); }}); });
Q.act('dev-log', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('تسجيل صيانة', 'Log maintenance'), body: `<div class="fgrid">${Q.f.sel('kind', L('النوع', 'Type'), Object.entries(MK).map(([k, v]) => [k, T(v)]), 'pm')}${Q.f.text('at', L('التاريخ', 'Date'), Q.toInput(Q.now()), {type: 'datetime-local', req: true})}${Q.f.radio('result', L('النتيجة', 'Result'), [['pass', L('ناجح: الجهاز صالح', 'Pass')], ['fail', L('فشل', 'Fail')], ['pending', L('معلق', 'Pending')]], 'pass', {w: true})}${Q.f.area('text', L('ما الذي تم؟', 'Work done'), '', {req: true, rows: 3})}</div>`,
  onSubmit: x => { Q.db.put('maint', {id: Q.uid('m'), deviceId: d.id, kind: x.kind, at: Q.fromInput(x.at), by: Q.me.id, text: x.text, result: x.result});
    if (x.kind === 'pm' && x.result === 'pass') d.lastPM = Q.fromInput(x.at);
    if (x.result === 'pass' && ['repair', 'check', 'down'].includes(d.status)) d.status = 'ok'; if (x.result === 'fail') d.status = 'down';
    Q.db.put('devices', d); Q.audit('device', d.id, 'pm', T(MK[x.kind])); Q.render(); Q.toast(L('سُجّلت الصيانة', 'Maintenance logged')); }}); });
Q.act('dev-fault', el => { const dv = el.dataset.id && Q.db.get('devices', el.dataset.id); Q.form = null;
  Q.prefill = Object.assign({typeId: 't-device', affected: 'equip'}, dv ? {deviceTag: dv.id, deptId: dv.deptId, location: dv.location || '', title: L(`عطل في ${T(dv.name)} ${dv.id}`, `Fault on ${T(dv.name)} ${dv.id}`)} : {}); Q.go('#/report/new'); });
})();
