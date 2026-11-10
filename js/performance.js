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
  ${Q.can('kpi.define') && Q.db.all('kpis').some(x => x.pending) ? `<div class="banner info"><div class="ico">${ic('edit')}</div><div><b>${L('تعريفات بانتظار الاعتماد', 'Definitions awaiting approval')}</b><p>${Q.db.all('kpis').filter(x => x.pending).map(x => `<a href="#/indicators/${x.id}">${esc(x.code)}</a>`).join(' · ')}</p></div></div>` : ''}
  ${depts.length > 1 ? `<div style="margin-bottom:12px">${Q.seg([['all', L('كل الأقسام', 'All departments')], ...depts.map(d => [d, Q.dshort(d)])], dept, 'k-dept')}</div>` : ''}
  <div class="ind-grid">${cards.map(({k, s, lv, st}) => `
    <a class="card ind" href="#/indicators/${k.id}"><div class="row"><span class="code">${esc(k.code)} · ${Q.dshort(k.deptId)}</span><span class="chip ${st}">${T(Q.K_ST[st])}</span></div>
      <h3>${esc(T(k.name))}</h3>
      <div class="kpi-val c-${st}">${Q.kFmt(k, lv.v)}<small>${L('الهدف', 'target')} <span class="ltr">${Q.kTarget(k)}</span></small></div>
      ${Q.spark(s, k, 46)}<div class="mo"><span>${Q.MON[Q.lang][+months[0].slice(5) - 1]}</span><span>${Q.MON[Q.lang][+months[4].slice(5) - 1]}</span><span>${Q.MON[Q.lang][+months[8].slice(5) - 1]}</span></div>
      <div class="fx"><b>${esc(T(k.num))}</b> ÷ <b>${esc(T(k.den))}</b>${lv.i >= 0 && lv.i < 8 ? `<br><span class="c-med">${L('آخر قيمة من', 'Latest from')} ${Q.fMonth(months[lv.i])}</span>` : ''}</div></a>`).join('') || Q.empty(L('لا توجد مؤشرات.', 'No indicators.'), 'pulse')}</div>`};
}};
Q.act('k-dept', el => { Q.ui.kDept = el.dataset.v; Q.saveUI(); Q.render(); });

/* KPI-03: XmR control chart. limits = mean ± 2.66 × average moving range (needs ≥ 5 points) */
Q.kLimits = vals => { const v = vals.filter(x => x != null); if (v.length < 5) return null; const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const mr = v.slice(1).map((x, i) => Math.abs(x - v[i])), mrBar = mr.reduce((a, b) => a + b, 0) / mr.length; return {mean, ucl: mean + 2.66 * mrBar, lcl: Math.max(0, mean - 2.66 * mrBar)}; };
/* special-cause rules on the most recent points: beyond a limit · 8 in a row on one side of the mean · 6 in a row rising or falling */
Q.kSpecial = (k, vals) => { if (!Q.S().kpiSpecialCause) return null; vals = vals || series(k, monthsBack(12)); const lim = Q.kLimits(vals); if (!lim) return null;
  const pts = vals.map((v, i) => [v, i]).filter(p => p[0] != null), last = pts[pts.length - 1];
  if (last[0] > lim.ucl || last[0] < lim.lcl) return {rule: 'limit', idx: last[1], t: L('آخر قيمة خارج حدود التحكم', 'Latest value outside the control limits')};
  const tail = n => pts.slice(-n).map(p => p[0]);
  const t8 = tail(8); if (t8.length === 8 && (t8.every(v => v > lim.mean) || t8.every(v => v < lim.mean))) return {rule: 'shift', idx: last[1], t: L('8 قيم متتالية في جهة واحدة من المتوسط', '8 values in a row on one side of the mean')};
  const t6 = tail(6); if (t6.length === 6 && (t6.every((v, i) => !i || v > t6[i - 1]) || t6.every((v, i) => !i || v < t6[i - 1]))) return {rule: 'trend', idx: last[1], t: L('6 قيم متتالية في اتجاه واحد', '6 values in a row moving one way')};
  return null; };
Q.lineChart = (k, vals, labels) => {
  const W = 640, H = 230, pb = 24, pt = 12, pl = 34, lim = Q.kLimits(vals), sp = Q.kSpecial(k, vals);
  const nums = vals.filter(v => v != null).concat([k.target, k.warn], lim ? [lim.ucl, lim.lcl] : [], k.benchmark != null ? [k.benchmark] : []);
  let max = Math.max(...nums), min = Math.min(0, ...nums); if (max === min) max += 1; max += (max - min) * .12;
  const rtl = Q.lang === 'ar', n = vals.length;
  const x = i => { const idx = rtl ? n - 1 - i : i; return pl + (idx + .5) * ((W - pl) / n); };
  const y = v => H - pb - ((v - min) / (max - min)) * (H - pb - pt);
  const pts = vals.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max].map(v => `<line class="gl" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${rtl ? W : 0}" y="${y(v) + 4}" text-anchor="${rtl ? 'end' : 'start'}">${(+v).toFixed(k.unit === 'days' || max < 10 ? 1 : 0)}</text>`).join('');
  const hl = (v, stroke, dash, label, op = .7) => `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${stroke}" stroke-dasharray="${dash}" opacity="${op}"/>${label ? `<text class="ax" x="${rtl ? pl + 4 : W - 4}" y="${y(v) - 4}" text-anchor="${rtl ? 'start' : 'end'}" style="fill:${stroke}">${label}</text>` : ''}`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T(k.name))}">${ticks}
    ${lim ? `<rect x="${pl}" width="${W - pl}" y="${y(lim.ucl)}" height="${Math.max(0, y(lim.lcl) - y(lim.ucl))}" fill="var(--sunken)"/>${hl(lim.ucl, 'var(--faint)', '6 3', 'UCL')}${hl(lim.lcl, 'var(--faint)', '6 3', 'LCL')}${hl(lim.mean, 'var(--ink-2)', '1 3', '', .5)}` : ''}
    ${hl(k.target, 'var(--brand)', '4 4', L('الهدف', 'target'))}${hl(k.warn, 'var(--red)', '2 4', '', .6)}${k.benchmark != null && k.benchmark !== k.target ? hl(k.benchmark, 'var(--blue)', '8 3', L('المرجعي', 'benchmark')) : ''}
    <path d="${d}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${sp && sp.idx === p[3] ? 6 : 4}" class="f-${Q.kState(k, p[2])}" stroke="${sp && sp.idx === p[3] ? 'var(--red)' : '#fff'}" stroke-width="${sp && sp.idx === p[3] ? 3 : 1.5}"><title>${labels[p[3]]}: ${p[2].toFixed(1)}</title></circle>`).join('')}
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
  ${kPendingBanner(k)}
  ${(() => { const sp = Q.kSpecial(k, vals), plan = Q.kPlan(k); if (!sp || plan) return ''; return `<div class="banner"><div class="ico">${ic('pulse')}</div><div><b>${L('سبب خاص في مخطط التحكم: يلزم تحقيق', 'Special cause on the control chart: investigation required')}</b><p>${sp.t}</p></div>${Q.can('capa.create') ? `<div class="act"><button class="btn btn-d sm" data-act="capa-new" data-kpi="${k.id}" data-src="kpi" data-title="${esc(L(`تحقيق في سبب خاص: ${T(k.name)}`, `Investigate special cause: ${T(k.name)}`))}">${ic('search', 'sm')}${L('فتح تحقيق', 'Open investigation')}</button></div>` : ''}</div>`; })()}
  ${(() => { const run = Q.kBreachRun(k), plan = Q.kPlan(k); if (run < 2 && !plan) return '';
    if (plan) return `<div class="banner ok"><div class="ico">${ic('check-square')}</div><div><b>${L('خطة تحسين قيد التنفيذ', 'Action plan in progress')}</b><p><a class="oid" href="#/capa/${plan.id}">${plan.id}</a> · ${esc(plan.title)}</p></div></div>`;
    return `<div class="banner"><div class="ico">${ic('alert')}</div><div><b>${L(run === 2 ? 'خارج الحد شهرين متتاليين' : run <= 10 ? `خارج الحد ${run} أشهر متتالية` : `خارج الحد ${run} شهرًا متتاليًا`, `Breached ${run} months in a row`)}</b><p>${L('سياسة الجودة تتطلب خطة تحسين موثقة عند تجاوز الحد شهرين متتاليين.', 'Quality policy requires a documented action plan after two consecutive breaches.')}</p></div>${Q.can('capa.create') ? `<div class="act"><button class="btn btn-d sm" data-act="capa-new" data-kpi="${k.id}" data-src="kpi" data-title="${esc(L(`خطة تحسين مؤشر: ${T(k.name)}`, `Improvement plan: ${T(k.name)}`))}">${ic('plus', 'sm')}${L('فتح خطة تحسين', 'Open action plan')}</button></div>` : ''}</div>`; })()}
  <div class="stats">${Q.stat(L('آخر قيمة', 'Latest'), `<span class="c-${st}">${Q.kFmt(k, lv.v)}</span>`, lv.i >= 0 ? Q.fMonth(months[lv.i]) : '')}${Q.stat(L('الهدف', 'Target'), `<span class="ltr">${Q.kTarget(k)}</span>`, L(`حد التنبيه ${k.warn}`, `alert limit ${k.warn}`))}${Q.stat(L('متوسط 12 شهرًا', '12-month average'), avg != null ? Q.kFmt(k, avg) : '—')}${Q.stat(L('أشهر ضمن الهدف', 'Months on target'), `${met}<small>/ ${got.length}</small>`)}</div>
  <section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('مخطط التحكم الشهري (XmR)', 'Monthly control chart (XmR)')}</h3><p>${L('المنطقة الرمادية بين حدي التحكم UCL/LCL والخط المنقط في وسطها هو المتوسط · الأخضر الهدف · الأحمر حد التنبيه · الأزرق المرجعي · الدائرة الحمراء سبب خاص', 'Grey band = control limits UCL/LCL with the dotted mean inside · green = target · red = alert limit · blue = benchmark · red ring = special cause')}</p></div></div><div class="card-b">${Q.lineChart(k, vals, months.map(m => Q.MON[Q.lang][+m.slice(5) - 1]))}</div></section>
  ${kDefCard(k)}
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
/* KPI-01 definition library: every definition change is proposed, then approved by a second indicator definer */
const DOMAIN = {safety: ['السلامة', 'Safety'], effectiveness: ['الفعالية', 'Effectiveness'], timeliness: ['التوقيت', 'Timeliness'], patient: ['التمركز حول المريض', 'Patient-centred'], efficiency: ['الكفاءة', 'Efficiency'], equity: ['العدالة', 'Equity']};
const FREQ = {monthly: ['شهري', 'Monthly'], quarterly: ['ربع سنوي', 'Quarterly']};
const DEF_KEYS = ['code', 'deptId', 'name', 'num', 'den', 'unit', 'dir', 'target', 'warn', 'benchmark', 'domain', 'formula', 'frequency', 'source', 'ownerId', 'active'];
Q.KPI_DOMAIN = DOMAIN;
function kpiForm(k = {}) {
  return `<div class="fgrid">
    ${Q.f.text('code', L('الرمز', 'Code'), k.code || '', {req: true, ltr: true})}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), k.deptId || '', {req: true})}
    ${Q.f.text('nameAr', L('الاسم بالعربية', 'Name (Arabic)'), k.name ? k.name.ar : '', {req: true})}${Q.f.text('nameEn', L('الاسم بالإنجليزية', 'Name (English)'), k.name ? k.name.en : '', {ltr: true})}
    ${Q.f.sel('domain', L('المجال', 'Domain'), Object.entries(DOMAIN).map(([a, b]) => [a, T(b)]), k.domain || 'safety')}${Q.f.sel('frequency', L('التكرار', 'Frequency'), Object.entries(FREQ).map(([a, b]) => [a, T(b)]), k.frequency || 'monthly')}
    ${Q.f.text('num', L('البسط', 'Numerator'), k.num ? T(k.num) : '', {req: true})}${Q.f.text('den', L('المقام', 'Denominator'), k.den ? T(k.den) : '', {})}
    ${Q.f.text('formula', L('المعادلة', 'Formula'), k.formula || '', {w: true, req: true, ph: L('مثال: عدد السقطات ÷ أيام المرضى × 1000', 'e.g. falls ÷ patient-days × 1000')})}
    ${Q.f.sel('unit', L('الوحدة', 'Unit'), Object.entries(UNITS).map(([a, b]) => [a, T(b)]), k.unit || 'pct')}${Q.f.sel('dir', L('الاتجاه الأفضل', 'Better when'), [['up', L('أعلى', 'Higher')], ['down', L('أقل', 'Lower')]], k.dir || 'up')}
    ${Q.f.text('target', L('الهدف', 'Target'), k.target != null ? k.target : '', {type: 'number', req: true, attrs: 'step="any"'})}${Q.f.text('warn', L('حد التنبيه (خارج الحد بعده)', 'Alert limit (breach beyond)'), k.warn != null ? k.warn : '', {type: 'number', req: true, attrs: 'step="any"'})}
    ${Q.f.text('benchmark', L('القيمة المرجعية (Benchmark)', 'Benchmark'), k.benchmark != null ? k.benchmark : '', {type: 'number', attrs: 'step="any"', opt: L('(وطني أو دولي)', '(national or international)')})}${Q.f.text('source', L('مصدر البيانات', 'Data source'), k.source || '', {req: true, ph: L('مثال: نظام المعلومات الصحية، سجل القسم', 'e.g. HIS, unit register')})}
    ${Q.f.sel('ownerId', L('مالك المؤشر', 'Indicator owner'), Q.userOpts(u => u.role !== 'reporter'), k.ownerId || '', {req: true, empty: L('اختر', 'Select')})}
    ${k.id ? Q.f.chk('active', L('مؤشر نشط', 'Active'), k.active !== false) : ''}
    <p class="hint w">${L('أي تغيير في التعريف يُعتمد من مُعرِّف مؤشرات آخر قبل تطبيقه.', 'Any definition change is approved by a second indicator definer before it applies.')}</p></div>`;
}
const kDef = d => ({code: d.code, deptId: d.deptId, name: {ar: d.nameAr, en: d.nameEn || d.nameAr}, num: d.num, den: d.den, unit: d.unit, dir: d.dir, target: +d.target, warn: +d.warn, benchmark: d.benchmark === '' || d.benchmark == null ? null : +d.benchmark,
  domain: d.domain, formula: d.formula, frequency: d.frequency, source: d.source, ownerId: d.ownerId, active: d.active === undefined ? true : !!d.active});
const kDiff = (k, def) => DEF_KEYS.filter(f => JSON.stringify(k[f] ?? null) !== JSON.stringify(def[f] ?? null));
Q.kPendingFor = (k, u = Q.me) => !!k.pending && Q.can('kpi.define', u) && k.pending.by !== u.id;
Q.act('kpi-new', () => Q.modal({title: L('مؤشر جديد', 'New indicator'), wide: true, body: kpiForm(), onSubmit: d => { const def = kDef(d);
  if (Q.db.all('kpis').some(x => x.code === def.code)) throw new Error(L('الرمز مستخدم.', 'Code already exists.'));
  const k = Object.assign({id: Q.uid('k'), active: false, status: 'pending'}, def, {active: false}); k.pending = {def, by: Q.me.id, at: Q.iso(Q.now()), isNew: true};
  Q.db.put('kpis', k); Q.go('#/indicators/' + k.id); Q.toast(L('أُرسل التعريف للاعتماد', 'Definition sent for approval')); }}));
Q.act('kpi-edit', el => { const k = Q.db.get('kpis', el.dataset.id); Q.modal({title: L('اقتراح تعديل التعريف', 'Propose a definition change'), wide: true, body: kpiForm(k.pending ? Object.assign({}, k, k.pending.def) : k), submit: L('إرسال للاعتماد', 'Send for approval'),
  onSubmit: d => { const def = kDef(d), ch = kDiff(k, def); if (!ch.length && !(k.pending && k.pending.isNew)) throw new Error(L('لم يتغير شيء.', 'Nothing changed.'));
    k.pending = {def, by: Q.me.id, at: Q.iso(Q.now()), fields: ch, isNew: !!(k.pending && k.pending.isNew)}; Q.db.put('kpis', k); Q.audit('kpi', k.id, 'updated', 'proposed: ' + ch.join(', ')); Q.render(); Q.toast(L('أُرسل التعديل للاعتماد', 'Change sent for approval')); }}); });
Q.act('kpi-approve', el => { const k = Q.db.get('kpis', el.dataset.id); if (!Q.kPendingFor(k)) return Q.toast(L('لا يعتمد المقترح تعديله بنفسه.', 'The proposer cannot approve their own change.'), 'err');
  const p = k.pending, ch = p.isNew ? DEF_KEYS : kDiff(k, p.def);
  (k.history = k.history || []).push({at: Q.iso(Q.now()), by: p.by, approvedBy: Q.me.id, fields: ch, before: Object.fromEntries(ch.map(f => [f, k[f] ?? null]))});
  Object.assign(k, p.def); if (p.isNew) { k.active = true; k.status = 'active'; } delete k.pending; Q.db.put('kpis', k); Q.audit('kpi', k.id, 'approved', ch.join(', ')); Q.render(); Q.toast(L('اعتُمد تعريف المؤشر', 'Indicator definition approved')); });
Q.act('kpi-reject', el => { const k = Q.db.get('kpis', el.dataset.id); if (k.pending && k.pending.isNew) { Q.db.del('kpis', k.id); Q.go('#/indicators'); return; } delete k.pending; Q.db.put('kpis', k); Q.audit('kpi', k.id, 'returned'); Q.render(); });
const kPendingBanner = k => { if (!k.pending) return ''; const p = k.pending, ch = p.isNew ? [] : kDiff(k, p.def), lbl = {target: L('الهدف', 'target'), warn: L('حد التنبيه', 'alert limit'), formula: L('المعادلة', 'formula'), num: L('البسط', 'numerator'), den: L('المقام', 'denominator'), benchmark: L('المرجعي', 'benchmark'), unit: L('الوحدة', 'unit'), dir: L('الاتجاه', 'direction'), source: L('المصدر', 'source'), ownerId: L('المالك', 'owner'), name: L('الاسم', 'name'), domain: L('المجال', 'domain'), frequency: L('التكرار', 'frequency'), active: L('النشاط', 'active'), code: L('الرمز', 'code'), deptId: L('القسم', 'department')};
  const fmt = (f, v) => f === 'ownerId' ? Q.uname(v) : f === 'deptId' ? Q.dname(v) : typeof v === 'object' && v ? T(v) : String(v ?? '—');
  return `<div class="banner info"><div class="ico">${ic('edit')}</div><div><b>${p.isNew ? L('تعريف مؤشر جديد بانتظار الاعتماد', 'New indicator definition awaiting approval') : L('تعديل تعريف بانتظار الاعتماد', 'Definition change awaiting approval')}</b><p>${esc(Q.uname(p.by))} · ${Q.fDate(p.at)}${ch.length ? ' · ' + ch.map(f => `${lbl[f] || f}: <s>${esc(fmt(f, k[f]))}</s> → <b>${esc(fmt(f, p.def[f]))}</b>`).join(' · ') : ''}</p></div>${Q.kPendingFor(k) ? `<div class="act"><button class="btn btn-p sm" data-act="kpi-approve" data-id="${k.id}">${ic('check', 'sm')}${L('اعتماد', 'Approve')}</button><button class="btn btn-s sm" data-act="kpi-reject" data-id="${k.id}">${L('رفض', 'Reject')}</button></div>` : `<div class="act"><span class="muted">${L('يعتمده مُعرِّف آخر', 'Another definer approves it')}</span></div>`}</div>`; };
const kDefCard = k => `<section class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('بطاقة تعريف المؤشر', 'Indicator definition card')}</h3></div></div><div class="card-b"><dl class="meta">
  <div><dt>${L('المجال', 'Domain')}</dt><dd>${k.domain ? T(DOMAIN[k.domain]) : '—'}</dd></div><div><dt>${L('التكرار', 'Frequency')}</dt><dd>${k.frequency ? T(FREQ[k.frequency]) : '—'}</dd></div>
  <div><dt>${L('المعادلة', 'Formula')}</dt><dd>${esc(k.formula || '—')}</dd></div><div><dt>${L('مصدر البيانات', 'Data source')}</dt><dd>${esc(k.source || '—')}</dd></div>
  <div><dt>${L('المالك', 'Owner')}</dt><dd>${k.ownerId ? esc(Q.uname(k.ownerId)) : '—'}</dd></div><div><dt>${L('المرجعي', 'Benchmark')}</dt><dd>${k.benchmark != null ? Q.kFmt(k, k.benchmark) : '—'}</dd></div></dl>
  ${(k.history || []).length ? `<h4 class="subh">${L('سجل تعديلات التعريف', 'Definition change log')}</h4><ol class="log">${[...k.history].reverse().map(h => `<li><span class="t">${Q.fDate(h.at, false)}</span><span>${esc(Q.uname(h.by))} → ${L('اعتمده', 'approved by')} ${esc(Q.uname(h.approvedBy))} · ${h.fields.join(', ')}</span></li>`).join('')}</ol>` : ''}</div></section>`;


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
const EL_ST = {missing: ['ناقص', 'Missing', 'crit'], uploaded: ['بانتظار المراجعة', 'Under review', 'med'], approved: ['معتمد', 'Approved', 'ok'], expired: ['منتهي الصلاحية', 'Expired', 'crit']};
const STD_LBL = {crit: ['فجوة حرجة', 'Critical gap'], med: ['قيد الاستكمال', 'In progress'], ok: ['مستوفى', 'Met']};
const CHAP = Q.CHAP = {QM: ['الجودة وسلامة المرضى', 'Quality & safety'], IPSG: ['الأهداف الدولية للسلامة', 'Intl. safety goals'], MM: ['إدارة الأدوية', 'Medication mgmt'], IPC: ['مكافحة العدوى', 'Infection control'], FMS: ['المرافق والسلامة', 'Facility & safety'], LD: ['القيادة', 'Leadership'], MOI: ['إدارة المعلومات', 'Information mgmt'], PC: ['رعاية المرضى', 'Patient care'], NR: ['التمريض', 'Nursing']};
Q.views.cbahi = {perm: 'cbahi.view', render(parts, q) {
  if (parts[0]) return stdDetail(parts[0]);
  if (q && q.tab) { Q.ui.stdTab = q.tab; Q.saveUI(); }
  const tab = Q.ui.stdTab || 'all';
  const all = Q.db.all('standards');
  const list = all.filter(s => tab === 'all' || (tab === 'esr' ? s.esr : Q.stdState(s) === tab)).sort((a, b) => ({crit: 0, med: 1, ok: 2})[Q.stdState(a)] - ({crit: 0, med: 1, ok: 2})[Q.stdState(b)]);
  const chapters = [...new Set(all.map(s => s.chapter))].map(c => [c, {pct: Q.metPct(all.filter(s => s.chapter === c)) ?? 0}]);
  const esrAll = all.filter(s => s.esr), esrGap = Q.esrGaps(), met = Q.metPct(all);
  const survey = Q.S().surveyDate, days = survey ? Math.ceil((new Date(survey) - Q.now()) / Q.DAY) : null;
  const r = Q.readiness(all), ri = Q.readinessIndex();
  return {title: L('جاهزية CBAHI', 'CBAHI readiness'), html: `
  <div class="page-head"><div><h2>${L('ملف جاهزية CBAHI', 'CBAHI readiness file')}</h2><p>${L('معايير المستشفيات: الإصدار الثالث', 'Hospital standards, 3rd edition')}${survey ? ` · ${L('الزيارة المتوقعة', 'Expected survey')}: ${Q.fDate(survey, false)} (${L(`بعد ${Q.nDays(days)}`, `in ${days} days`)})` : ''}</p></div>
    <div class="row"><a class="btn btn-s" href="#/mock">${ic('shield')}${L('المسح التجريبي', 'Mock survey')}</a>${Q.can('cbahi.edit') ? `<button class="btn btn-p" data-act="std-new">${ic('plus')}${L('معيار جديد', 'New standard')}</button>` : ''}</div></div>
  <section class="card ri ${ri.level}" style="margin-bottom:16px"><div class="card-h"><div><h3>${L('مؤشر جاهزية النظام للزيارة', 'System survey-readiness index')}</h3><p>${L('50% أدلة المعايير + 50% تشغيل نظام الجودة فعليًا (سياسات، جولات، شكاوى، CAPA، OVR، مؤشرات)', '50% standards evidence + 50% the quality system actually running (policies, rounds, complaints, CAPA, OVR, indicators)')}</p></div><div class="ri-score"><strong class="c-${ri.level}">${ri.score}<small>%</small></strong><span class="chip ${ri.level}">${T(ri.verdict)}</span></div></div>
    <div class="card-b">${ri.blockers.length ? `<div class="note warn" style="margin-bottom:14px">${ic('alert', 'sm')}<span><b>${L('موانع الجاهزية: تُعالج قبل الزيارة مهما كانت النسبة', 'Blockers: fix before the survey whatever the score')}</b><ul class="ri-block">${ri.blockers.map(b => `<li>${Q.canRoute(b.go) ? `<a href="${b.go}">${b.t}</a>` : b.t}</li>`).join('')}</ul></span></div>` : ''}
    <div class="ri-dims">${ri.dims.map(d => `<a ${Q.canRoute(d.go) ? `href="${d.go}"` : 'aria-disabled="true"'}><span>${T(d.t)}</span><b>${d.val == null ? '—' : d.val + '%'}</b><div class="track"><i style="width:${d.val || 0}%;background:${d.val == null ? 'transparent' : d.val < 70 ? 'var(--red)' : d.val < 90 ? 'var(--amber-bar)' : 'var(--brand)'}"></i></div><small>${d.val == null ? L('لا توجد بيانات بعد', 'No data yet') : esc(d.detail || '')}</small></a>`).join('')}</div></div></section>
  <div class="stats">${Q.stat(L('متطلبات السلامة الأساسية ESR', 'Essential safety requirements (ESR)'), `${esrAll.length - esrGap.length}<small>/ ${esrAll.length}</small>`, esrGap.length ? `<a class="c-crit" href="#/cbahi?tab=esr">${L(`${esrGap.length} غير مستوفاة: مانع للزيارة`, `${esrGap.length} not met: survey blocker`)}</a>` : L('كلها مستوفاة', 'All met'), {cls: esrGap.length ? 'up-bad' : ''})}${Q.stat(L('التقييم الذاتي: نسبة الاستيفاء', 'Self-assessment: % met'), `${met ?? '—'}<small>%</small>`, L('مستوفى = 1، جزئي = ½، لا ينطبق مستبعد', 'met = 1, partial = ½, N/A excluded'))}${Q.stat(L('جاهزية الأدلة', 'Evidence readiness'), `${r.pct}<small>%</small>`, Q.track([[r.ok / r.total * 100, 'var(--brand)'], [r.med / r.total * 100, 'var(--amber-bar)'], [r.crit / r.total * 100, 'var(--red)']]))}${Q.stat(L('أدلة معتمدة', 'Approved evidence'), r.ok, L(`من ${r.total} عنصر قياس`, `of ${r.total} elements`))}${Q.stat(L('بانتظار المراجعة', 'Awaiting review'), r.med, Q.can('cbahi.edit') && r.med ? L('راجعها من صفحة المعيار', 'Review from each standard') : '')}${Q.stat(L('أدلة ناقصة أو منتهية', 'Missing or expired evidence'), r.crit, (r.expired ? L(`منها ${r.expired} منتهية · `, `${r.expired} expired · `) : '') + L(`في ${all.filter(s => s.elements.some(e => ['missing', 'expired'].includes(Q.elState(e)))).length} معايير`, `across ${all.filter(s => s.elements.some(e => ['missing', 'expired'].includes(Q.elState(e)))).length} standards`), {cls: r.crit ? 'up-bad' : ''})}</div>
  <p class="hint" style="margin:0 0 6px">${L('نسبة الاستيفاء لكل فصل (التقييم الذاتي)', '% met per chapter (self-assessment)')}</p><section class="card chapters">${chapters.map(([c, cr]) => `<div><b>${T(CHAP[c] || [c, c])} <span class="ltr" style="color:var(--faint)">${c}</span></b><strong>${cr.pct}%</strong><div class="track"><i style="width:${cr.pct}%;background:${cr.pct < 70 ? 'var(--red)' : cr.pct < 90 ? 'var(--amber-bar)' : 'var(--brand)'}"></i></div></div>`).join('')}</section>
  <div class="row" style="margin-bottom:12px">${Q.seg([['all', L('الكل', 'All'), all.length], ['crit', L('فجوات حرجة', 'Critical gaps'), all.filter(s => Q.stdState(s) === 'crit').length], ['med', L('قيد الاستكمال', 'In progress'), all.filter(s => Q.stdState(s) === 'med').length], ['ok', L('مستوفى', 'Met'), all.filter(s => Q.stdState(s) === 'ok').length], ['esr', 'ESR', esrAll.length]], tab, 'std-tab')}</div>
  <div class="std-grid">${list.map(s => { const st = Q.stdState(s), ok = s.elements.filter(e => e.status === 'approved').length, up = s.elements.filter(e => e.status === 'uploaded').length; return `
    <a class="card std ${st}" href="#/cbahi/${encodeURIComponent(s.id)}"><div class="row"><span class="code">${esc(s.id)}${s.esr ? ' · <b class="c-crit">ESR</b>' : ''} · ${Q.metPct([s]) ?? '—'}%</span><span class="chip ${st}">${T(STD_LBL[st])}</span></div>
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
  <div class="page-head"><div><div class="row"><span class="chip ${st}">${T(STD_LBL[st])}</span><span class="chip mute">${T(CHAP[s.chapter] || [s.chapter, s.chapter])}</span>${s.priority === 'high' ? `<span class="chip crit">${L('أولوية عالية', 'High priority')}</span>` : ''}${s.esr ? `<span class="chip crit">ESR</span>` : ''}<span class="chip info">${L('الاستيفاء', 'Met')} ${Q.metPct([s]) ?? '—'}%</span></div><h2 style="margin-top:8px">${esc(T(s.name))}</h2><p>${esc(s.note || '')}</p></div>
    <div class="row">${ed ? `<button class="btn btn-s" data-act="std-edit" data-id="${esc(s.id)}">${ic('edit')}${L('تعديل', 'Edit')}</button><button class="btn btn-p" data-act="el-new" data-id="${esc(s.id)}">${ic('plus')}${L('عنصر قياس', 'Element')}</button>` : ''}</div></div>
  <section class="card"><ul class="elements">${s.elements.map(e => { const es = EL_ST[Q.elState(e)], canUp = Q.can('cbahi.upload') && (ed || e.ownerId === Q.me.id); const r = e.due && e.status === 'missing' ? Q.rel(e.due) : null; return `
    <li class="${Q.elState(e) === 'expired' ? 'missing' : e.status}"><div class="el-h"><span class="dot-s ${es[2]}">${T(es)}</span><span class="chip ${Q.EL_RATE[Q.elRating(e)][2]}" title="${L('التقييم الذاتي', 'Self-assessment')}${e.rating ? '' : L(' (مشتق من حالة الدليل)', ' (derived from evidence)')}">${T(Q.EL_RATE[Q.elRating(e)])}${e.rating ? '' : ' *'}</span><b>${esc(T(e.text))}</b><span class="sp"></span><small>${Q.avatar(e.ownerId, 's')} ${esc(Q.uname(e.ownerId))}</small>${r ? `<span class="due ${r.cls}">${r.txt}</span>` : ''}</div>
      ${e.files.length ? `<ul class="files">${e.files.map(f => `<li>${ic('file', 'sm')}<button class="btn-g" data-act="ev-dl" data-std="${esc(s.id)}" data-el="${e.id}" data-f="${f.id}">${esc(f.name)}</button><small>${Q.fSize(f.size)} · ${esc(Q.uname(f.by))} · ${Q.fDate(f.at, false)}</small>${ed || f.by === Q.me.id ? `<button class="btn-g xs" data-act="ev-del" data-std="${esc(s.id)}" data-el="${e.id}" data-f="${f.id}" aria-label="${L('حذف', 'Delete')}">${ic('x', 'sm')}</button>` : ''}</li>`).join('')}</ul>` : ''}
      ${e.note ? `<p class="muted el-note">${esc(e.note)}</p>` : ''}${e.rateNote ? `<p class="hint el-note">${L('مبرر التقييم', 'Assessment rationale')}: ${esc(e.rateNote)}</p>` : ''}${e.validUntil ? `<p class="hint el-note ${Q.elExpired(e) ? 'c-crit' : ''}">${L('صالح حتى', 'Valid until')} ${Q.fDate(e.validUntil, false)}</p>` : ''}
      <div class="el-a">${canUp && e.status !== 'approved' ? `<label class="btn btn-s sm">${ic('clip', 'sm')}${L('إرفاق دليل', 'Attach evidence')}<input type="file" hidden data-up="${e.id}" multiple accept=".pdf,image/*,.doc,.docx,.xlsx"></label>` : ''}
        ${ed && e.status === 'uploaded' ? `<button class="btn btn-p sm" data-act="el-approve" data-std="${esc(s.id)}" data-el="${e.id}">${ic('check', 'sm')}${L('اعتماد', 'Approve')}</button><button class="btn btn-s sm" data-act="el-reject" data-std="${esc(s.id)}" data-el="${e.id}">${L('رفض مع ملاحظة', 'Reject with note')}</button>` : ''}
        ${ed ? `<button class="btn-g" data-act="el-rate" data-std="${esc(s.id)}" data-el="${e.id}">${L('تقييم ذاتي', 'Rate')}</button>` : ''}${['partial', 'not'].includes(Q.elRating(e)) && Q.can('capa.create') ? (() => { const c = Q.db.all('capa').find(x => x.stdId === s.id && x.elId === e.id && x.status !== 'cancelled'); return c ? `<a class="chip info ltr" href="#/capa/${c.id}">${c.id}</a>` : `<button class="btn btn-s sm" data-act="capa-new" data-std="${esc(s.id)}" data-el="${e.id}" data-src="cbahi" data-title="${esc(`${s.id}: ${T(e.text)}`)}">${ic('plus', 'sm')}${L('إجراء لسد الفجوة', 'Action to close gap')}</button>`; })() : ''}
        ${ed ? `<button class="btn-g" data-act="el-edit" data-std="${esc(s.id)}" data-el="${e.id}">${L('تعديل', 'Edit')}</button>` : ''}${canUp && Q.elExpired(e) ? `<label class="btn btn-s sm">${ic('clip', 'sm')}${L('إرفاق دليل محدّث', 'Attach renewed evidence')}<input type="file" hidden data-up="${e.id}" multiple accept=".pdf,image/*,.doc,.docx,.xlsx"></label>` : ''}${ed && e.status === 'approved' ? `<button class="btn-g" data-act="el-reopen" data-std="${esc(s.id)}" data-el="${e.id}">${L('إعادة فتح', 'Reopen')}</button>` : ''}</div></li>`; }).join('')}</ul></section>`};
}
async function upload(s, elId, files) {
  const e = s.elements.find(x => x.id === elId); let n = 0;
  for (const file of files) { if (file.size > 20 * 1048576) { Q.toast(L(`${file.name} أكبر من 20 ميجابايت`, `${file.name} exceeds 20 MB`), 'err'); continue; }
    const id = Q.uid('f'); await Q.db.putFile(id, file); e.files.push({id, name: file.name, size: file.size, type: file.type, by: Q.me.id, at: Q.iso(Q.now())}); n++; }
  if (n) { if (Q.elExpired(e)) e.validUntil = null; e.status = 'uploaded'; e.note = ''; Q.db.put('standards', s); Q.audit('cbahi', s.id, 'uploaded', T(e.text)); Q.render(); Q.toast(L('أُرفق الدليل وأُرسل للمراجعة', 'Evidence attached and sent for review')); }
}
const stdEl = el => { const s = Q.db.get('standards', el.dataset.std); return [s, s.elements.find(x => x.id === el.dataset.el)]; };
Q.act('ev-dl', async el => { const [, e] = stdEl(el); const f = e.files.find(x => x.id === el.dataset.f); const b = await Q.db.getFile(f.id); if (!b) return Q.toast(L('هذا ملف تجريبي بلا محتوى.', 'Demo file without content.'), 'err'); Q.download(f.name, b); });
Q.act('ev-del', async el => { const [s, e] = stdEl(el); if (!await Q.confirm(L('حذف هذا الملف من الأدلة؟', 'Remove this file?'), {danger: true, ok: L('حذف', 'Delete')})) return; e.files = e.files.filter(f => f.id !== el.dataset.f); Q.db.delFile(el.dataset.f); if (!e.files.length) e.status = 'missing'; Q.db.put('standards', s); Q.render(); });
Q.act('el-approve', el => { const [s, e] = stdEl(el);
  Q.modal({title: L('اعتماد الدليل', 'Approve evidence'), sub: esc(T(e.text)), submit: L('اعتماد', 'Approve'), body: `<div class="fgrid one">${Q.f.text('validUntil', L('الدليل صالح حتى', 'Evidence valid until'), e.validUntil ? Q.toDateInput(e.validUntil) : '', {type: 'date', opt: L('(اتركه فارغًا إن لم يكن دوريًا)', '(leave empty if it does not expire)')})}</div>`,
    onSubmit: d => { if (d.validUntil && new Date(Q.fromInput(d.validUntil)) < Q.now()) throw new Error(L('تاريخ الصلاحية في الماضي.', 'Validity date is in the past.'));
      e.status = 'approved'; e.validUntil = Q.fromInput(d.validUntil); e.reviewedBy = Q.me.id; e.reviewedAt = Q.iso(Q.now()); Q.db.put('standards', s); Q.audit('cbahi', s.id, 'approved', T(e.text)); Q.render(); Q.toast(L('اعتُمد الدليل', 'Evidence approved')); }}); });
Q.act('el-rate', el => { const [s, e] = stdEl(el);
  Q.modal({title: L('التقييم الذاتي لعنصر القياس', 'Self-assess the element'), sub: `${esc(s.id)} · ${esc(T(e.text))}`, body: `<div class="fgrid">${Q.f.radio('rating', L('التقييم', 'Rating'), Object.entries(Q.EL_RATE).map(([k, v]) => [k, T(v)]), Q.elRating(e), {w: true})}${Q.f.area('rateNote', L('مبرر التقييم', 'Rationale'), e.rateNote || '', {rows: 2, req: true})}<p class="hint w">${L('لا يُقيّم «مستوفى» دون دليل معتمد ساري.', '"Met" needs approved, in-date evidence.')}</p></div>`,
    onSubmit: d => { if (d.rating === 'met' && Q.elState(e) !== 'approved') throw new Error(L('لا يمكن تقييمه مستوفى قبل اعتماد دليل ساري.', 'Cannot rate Met before evidence is approved and in date.'));
      e.rating = d.rating; e.rateNote = d.rateNote; e.ratedBy = Q.me.id; e.ratedAt = Q.iso(Q.now()); Q.db.put('standards', s); Q.audit('cbahi', s.id, 'rated', `${T(e.text)}: ${T(Q.EL_RATE[d.rating])}`); Q.render(); }}); });
Q.act('el-reopen', el => { const [s, e] = stdEl(el); e.status = e.files.length ? 'uploaded' : 'missing'; Q.db.put('standards', s); Q.render(); });
Q.act('el-reject', el => { const [s, e] = stdEl(el); Q.modal({title: L('رفض الدليل', 'Reject evidence'), body: `<div class="fgrid one">${Q.f.area('note', L('ما المطلوب تعديله؟', 'What needs to change?'), '', {req: true, rows: 3})}</div>`, submit: L('رفض', 'Reject'), danger: true, onSubmit: d => { e.status = 'missing'; e.note = d.note; Q.db.put('standards', s); Q.render(); }}); });
const elForm = (e = {}) => `<div class="fgrid">${Q.f.text('ar', L('عنصر القياس بالعربية', 'Element (Arabic)'), e.text ? e.text.ar : '', {req: true, w: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), e.text ? e.text.en : '', {w: true, ltr: true})}${Q.f.sel('ownerId', L('المسؤول', 'Owner'), Q.userOpts(u => u.role !== 'reporter'), e.ownerId || '', {req: true, empty: L('اختر', 'Select')})}${Q.f.text('due', L('موعد الاستكمال', 'Due'), e.due ? Q.toDateInput(e.due) : '', {type: 'date'})}${Q.f.text('validUntil', L('الدليل صالح حتى', 'Evidence valid until'), e.validUntil ? Q.toDateInput(e.validUntil) : '', {type: 'date', opt: L('(للأدلة الدورية مثل التدريب والفحوص)', '(for recurring evidence: training, drills, inspections)')})}</div>`;
Q.act('el-new', el => { const s = Q.db.get('standards', el.dataset.id); Q.modal({title: L('عنصر قياس جديد', 'New element'), body: elForm(), onSubmit: d => { s.elements.push({id: Q.uid('el'), text: {ar: d.ar, en: d.en || d.ar}, ownerId: d.ownerId, due: Q.fromInput(d.due), status: 'missing', files: [], note: '', validUntil: Q.fromInput(d.validUntil)}); Q.db.put('standards', s); Q.render(); }}); });
Q.act('el-edit', el => { const [s, e] = stdEl(el); Q.modal({title: L('تعديل عنصر القياس', 'Edit element'), body: elForm(e), onSubmit: d => { e.text = {ar: d.ar, en: d.en || d.ar}; e.ownerId = d.ownerId; e.due = Q.fromInput(d.due); e.validUntil = Q.fromInput(d.validUntil); Q.db.put('standards', s); Q.render(); }}); });
const stdForm = (s = {}) => `<div class="fgrid">${Q.f.text('id', L('رمز المعيار', 'Standard code'), s.id || '', {req: true, ltr: true, attrs: s.id ? 'readonly' : '', ph: 'QM.14'})}${Q.f.sel('chapter', L('الفصل', 'Chapter'), Object.entries(CHAP).map(([k, v]) => [k, `${k}: ${T(v)}`]), s.chapter || 'QM')}${Q.f.text('ar', L('الاسم بالعربية', 'Name (Arabic)'), s.name ? s.name.ar : '', {req: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), s.name ? s.name.en : '', {ltr: true})}${Q.f.sel('priority', L('الأولوية', 'Priority'), [['normal', L('عادية', 'Normal')], ['high', L('عالية', 'High')]], s.priority || 'normal')}${Q.f.chk('esr', L('متطلب سلامة أساسي (ESR)', 'Essential safety requirement (ESR)'), !!s.esr)}${Q.f.area('note', L('ملاحظة الحالة', 'Status note'), s.note || '', {rows: 2})}</div>`;
Q.act('std-new', () => Q.modal({title: L('معيار جديد', 'New standard'), wide: true, body: stdForm(), onSubmit: d => { if (Q.db.get('standards', d.id)) throw new Error(L('الرمز مستخدم.', 'Code already exists.')); Q.db.put('standards', {id: d.id.trim(), chapter: d.chapter, name: {ar: d.ar, en: d.en || d.ar}, priority: d.priority, esr: !!d.esr, note: d.note, elements: []}); Q.go('#/cbahi/' + encodeURIComponent(d.id.trim())); }}));
Q.act('std-edit', el => { const s = Q.db.get('standards', el.dataset.id); Q.modal({title: L('تعديل المعيار', 'Edit standard'), wide: true, body: stdForm(s), onSubmit: d => { Object.assign(s, {chapter: d.chapter, name: {ar: d.ar, en: d.en || d.ar}, priority: d.priority, esr: !!d.esr, note: d.note}); Q.db.put('standards', s); Q.render(); }}); });

/* =============== devices =============== */
Q.RISK_CLASS = {high: ['عالية (دعم حياة)', 'High (life support)'], medium: ['متوسطة', 'Medium'], low: ['منخفضة', 'Low']};
const DEV_ST = {ok: ['في الخدمة', 'In service', 'ok'], check: ['فحص احترازي', 'Precautionary check', 'med'], repair: ['قيد الإصلاح', 'Under repair', 'high'], down: ['خارج الخدمة', 'Out of service', 'crit'], retired: ['مُستبعد', 'Retired', 'mute']};
const MK = {pm: ['صيانة وقائية', 'Preventive maintenance'], calibration: ['معايرة', 'Calibration'], electrical: ['اختبار السلامة الكهربائية', 'Electrical safety test'], repair: ['إصلاح', 'Repair'], inspection: ['فحص', 'Inspection']};
/* FAC-02 PM on time (from logs that recorded their due date) · FAC-03 calibration and electrical safety due dates */
Q.pmOnTimePct = () => { const since = Q.add(Q.now(), -365 * Q.DAY), l = Q.db.all('maint').filter(m => m.kind === 'pm' && m.dueAt && new Date(m.at) >= since); return l.length ? Math.round(l.filter(m => m.onTime).length / l.length * 100) : null; };
Q.pmLateDays = d => { const n = Q.nextPM(d); return d.status !== 'retired' && n && n < Q.now() ? Math.ceil((Q.now() - n) / Q.DAY) : 0; };
Q.calibOverdue = d => d.status !== 'retired' && ((d.calibDue && new Date(d.calibDue) < Q.now()) || (d.elecDue && new Date(d.elecDue) < Q.now()));
Q.MK = MK;
Q.views.devices = {perm: 'device.view', render(parts, qs) {
  if (parts[0]) return devDetail(parts[0]);
  if (qs && qs.f) { Q.ui.devF = Object.assign(Q.ui.devF || {}, {st: qs.f}); Q.saveUI(); }
  const f = Object.assign({st: 'all', dept: 'all', q: ''}, Q.ui.devF || {});
  const all = Q.db.all('devices').filter(d => Q.me.role !== 'supervisor' || d.deptId === Q.me.deptId);
  const q = f.q.trim().toLowerCase();
  const list = all.filter(d => (f.st === 'all' || (f.st === 'pm' ? Q.nextPM(d) < Q.now() : f.st === 'incomplete' ? Q.devMissing(d).length > 0 && d.status !== 'retired' : d.status === f.st)) && (f.dept === 'all' || d.deptId === f.dept) && (!q || [d.id, T(d.name), d.model, d.serial].join(' ').toLowerCase().includes(q)));
  const now = Q.now();
  return {title: L('الأجهزة الطبية', 'Medical devices'), mount: root => { $$('[data-df]', root).forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'change', () => { Q.ui.devF = Object.assign(f, {[el.dataset.df]: el.value}); Q.saveUI(); Q.render(); })); }, html: `
  <div class="page-head"><div><h2>${L('سجل الأجهزة الطبية', 'Medical device register')}</h2><p>${L('الأعطال والصيانة الوقائية بالتنسيق مع الهندسة الطبية الحيوية', 'Faults and preventive maintenance with biomedical engineering')}</p></div>
    <div class="row"><button class="btn btn-s" data-act="dev-fault">${ic('alert')}${L('بلاغ عطل جهاز', 'Report device fault')}</button>${Q.can('device.edit') ? `<button class="btn btn-p" data-act="dev-new">${ic('plus')}${L('جهاز جديد', 'New device')}</button>` : ''}</div></div>
  <div class="stats">${(() => { const live = all.filter(d => d.status !== 'retired'), pct = Q.devCompletePct(live), inc = live.filter(d => Q.devMissing(d).length).length; return Q.stat(L('أجهزة مسجلة · اكتمال السجل', 'Registered · record complete'), `${all.length} <small>· ${pct ?? '—'}%</small>`, inc ? `<a href="#/devices?f=incomplete" class="c-crit">${L(`${inc} ببيانات ناقصة`, `${inc} with missing data`)}</a>` : L('كل السجلات مكتملة', 'All records complete')); })()}${Q.stat(L('خارج الخدمة أو قيد الإصلاح', 'Down or in repair'), all.filter(d => ['down', 'repair'].includes(d.status)).length, '', {cls: all.some(d => d.status === 'down') ? 'up-bad' : ''})}${Q.stat(L('صيانة وقائية متأخرة', 'PM overdue'), all.filter(d => Q.nextPM(d) < now && d.status !== 'retired').length, L('تؤثر على معيار FMS.11', 'Affects FMS.11'))}${Q.stat(L('الصيانة في موعدها (12 شهرًا)', 'PM done on time (12 m)'), Q.pmOnTimePct() != null ? `${Q.pmOnTimePct()}<small>%</small>` : '—', L(`${all.filter(d => Q.pmLateDays(d) > Q.S().pmEscDays).length} متأخرة > ${Q.S().pmEscDays} يومًا (مُصعّدة)`, `${all.filter(d => Q.pmLateDays(d) > Q.S().pmEscDays).length} late > ${Q.S().pmEscDays} days (escalated)`))}${Q.stat(L('معايرة / سلامة كهربائية متأخرة', 'Calibration / electrical overdue'), all.filter(Q.calibOverdue).length, L('الفشل يُخرج الجهاز من الخدمة', 'A failed test removes the device from service'), {cls: all.some(Q.calibOverdue) ? 'up-bad' : ''})}</div>
  <section class="card"><div class="toolbar"><div class="search">${ic('search')}<input class="field" data-df="q" type="search" value="${esc(f.q)}" placeholder="${L('رقم الأصل، الطراز، الرقم التسلسلي', 'Asset tag, model, serial')}"></div>
    <select class="field" data-df="st">${[['all', L('كل الحالات', 'All statuses')], ...Object.entries(DEV_ST).map(([k, v]) => [k, T(v)]), ['pm', L('صيانة متأخرة', 'PM overdue')], ['incomplete', L('بيانات ناقصة', 'Incomplete record')]].map(([k, t]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
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
    <div><dt>${L('فئة الخطورة', 'Risk class')}</dt><dd>${d.riskClass ? T(Q.RISK_CLASS[d.riskClass]) : '—'}</dd></div><div><dt>${L('نهاية الضمان', 'Warranty end')}</dt><dd>${d.warrantyUntil ? `${Q.fDate(d.warrantyUntil, false)}${new Date(d.warrantyUntil) < Q.now() ? ` <span class="chip mute">${L('منتهٍ', 'Expired')}</span>` : ''}` : '—'}</dd></div>
    ${Q.devMissing(d).length ? `<div><dt>${L('بيانات ناقصة', 'Missing data')}</dt><dd class="c-crit">${Q.devMissing(d).map(k => T(Q.DEV_FIELDS[k])).join('، ')}</dd></div>` : ''}
    <div><dt>${L('المعايرة القادمة', 'Next calibration')}</dt><dd>${d.calibDue ? `${Q.fDate(d.calibDue, false)} · <span class="due ${Q.rel(d.calibDue).cls}">${Q.rel(d.calibDue).txt}</span>` : '—'}</dd></div><div><dt>${L('السلامة الكهربائية القادمة', 'Next electrical safety test')}</dt><dd>${d.elecDue ? `${Q.fDate(d.elecDue, false)} · <span class="due ${Q.rel(d.elecDue).cls}">${Q.rel(d.elecDue).txt}</span>` : '—'}</dd></div>
    <div><dt>${L('دورة الصيانة', 'PM interval')}</dt><dd>${L(`كل ${d.pmMonths} أشهر`, `every ${d.pmMonths} months`)}</dd></div>
    <div><dt>${L('الصيانة القادمة', 'Next PM')}</dt><dd>${Q.fDate(nx, false)} · <span class="due ${r.late ? 'late' : r.cls}">${r.txt}</span></dd></div></dl>
    ${ed ? `<button class="btn btn-s sm" data-act="dev-edit" data-id="${d.id}" style="margin-top:12px">${ic('edit', 'sm')}${L('تعديل البيانات', 'Edit details')}</button>` : ''}</div></section></aside></div>`};
}
const devForm = (d = {}) => `<div class="fgrid">${Q.f.text('id', L('رقم الأصل', 'Asset tag'), d.id || '', {req: true, ltr: true, attrs: d.id ? 'readonly' : '', ph: 'VEN-ICU-08'})}${Q.f.text('serial', L('الرقم التسلسلي', 'Serial'), d.serial || '', {ltr: true})}${Q.f.text('ar', L('اسم الجهاز', 'Device name'), d.name ? d.name.ar : '', {req: true})}${Q.f.text('en', L('بالإنجليزية', 'English'), d.name ? d.name.en : '', {ltr: true})}${Q.f.text('model', L('الطراز', 'Model'), d.model || '', {req: true, ltr: true})}${Q.f.text('vendor', L('الوكيل', 'Vendor'), d.vendor || '')}${Q.f.sel('deptId', L('القسم', 'Department'), Q.deptOpts(), d.deptId || '', {req: true})}${Q.f.text('location', L('الموقع', 'Location'), d.location || '')}${Q.f.sel('riskClass', L('فئة الخطورة', 'Risk class'), Object.entries(Q.RISK_CLASS).map(([k, v]) => [k, T(v)]), d.riskClass || '', {empty: L('غير محددة', 'Not set')})}${Q.f.text('warrantyUntil', L('نهاية الضمان', 'Warranty end'), d.warrantyUntil ? Q.toDateInput(d.warrantyUntil) : '', {type: 'date'})}${Q.f.text('lastPM', L('آخر صيانة وقائية', 'Last PM'), d.lastPM ? Q.toDateInput(d.lastPM) : Q.toDateInput(Q.now()), {type: 'date', req: true})}${Q.f.sel('pmMonths', L('دورة الصيانة', 'PM interval'), [[3, L('كل 3 أشهر', 'Every 3 months')], [6, L('كل 6 أشهر', 'Every 6 months')], [12, L('سنويًا', 'Yearly')]], d.pmMonths || 6)}${Q.f.area('note', L('ملاحظة', 'Note'), d.note || '', {rows: 2})}</div>`;
const devFrom = (x, d) => Object.assign(d, {name: {ar: x.ar, en: x.en || x.ar}, model: x.model, serial: x.serial, vendor: x.vendor, deptId: x.deptId, location: x.location, riskClass: x.riskClass || null, warrantyUntil: Q.fromInput(x.warrantyUntil), lastPM: Q.fromInput(x.lastPM), pmMonths: +x.pmMonths, note: x.note});
Q.act('dev-new', () => Q.modal({title: L('جهاز جديد', 'New device'), wide: true, body: devForm(), onSubmit: x => { const id = x.id.trim().toUpperCase(); if (Q.db.get('devices', id)) throw new Error(L('رقم الأصل مستخدم.', 'Asset tag exists.')); Q.db.put('devices', devFrom(x, {id, status: 'ok', createdAt: Q.iso(Q.now())})); Q.go('#/devices/' + id); }}));
Q.act('dev-edit', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('تعديل الجهاز', 'Edit device'), wide: true, body: devForm(d), onSubmit: x => { devFrom(x, d); Q.db.put('devices', d); Q.render(); }}); });
Q.act('dev-status', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('حالة الجهاز', 'Device status'), body: `<div class="fgrid">${Q.f.radio('status', L('الحالة', 'Status'), Object.entries(DEV_ST).map(([k, v]) => [k, T(v)]), d.status, {w: true})}${Q.f.area('note', L('ملاحظة', 'Note'), d.note || '', {rows: 2})}</div>`,
  onSubmit: x => { const old = d.status; d.status = x.status; d.note = x.note; Q.db.put('devices', d); Q.db.put('maint', {id: Q.uid('m'), deviceId: d.id, kind: 'inspection', at: Q.iso(Q.now()), by: Q.me.id, text: `${T(DEV_ST[old])} → ${T(DEV_ST[d.status])}${x.note ? ' · ' + x.note : ''}`, result: d.status === 'ok' ? 'pass' : 'pending'}); Q.render(); }}); });
Q.act('dev-log', el => { const d = Q.db.get('devices', el.dataset.id); Q.modal({title: L('تسجيل صيانة', 'Log maintenance'), body: `<div class="fgrid">${Q.f.sel('kind', L('النوع', 'Type'), Object.entries(MK).map(([k, v]) => [k, T(v)]), 'pm')}${Q.f.text('at', L('التاريخ', 'Date'), Q.toInput(Q.now()), {type: 'datetime-local', req: true})}<label class="fl">${L('الشهادة (إلزامية للمعايرة والسلامة الكهربائية)', 'Certificate (required for calibration & electrical)')}<input class="field" type="file" name="cert" accept=".pdf,image/*"></label>${Q.f.radio('result', L('النتيجة', 'Result'), [['pass', L('ناجح: الجهاز صالح', 'Pass')], ['fail', L('فشل', 'Fail')], ['pending', L('معلق', 'Pending')]], 'pass', {w: true})}${Q.f.area('text', L('ما الذي تم؟', 'Work done'), '', {req: true, rows: 3})}</div>`,
  onSubmit: async x => { const at = Q.fromInput(x.at), rec = {id: Q.uid('m'), deviceId: d.id, kind: x.kind, at, by: Q.me.id, text: x.text, result: x.result};
    if (x.kind === 'pm') { const due = Q.nextPM(d); if (due) { rec.dueAt = due.toISOString(); rec.onTime = new Date(at) <= due; } }
    if (['calibration', 'electrical'].includes(x.kind)) { if (!x.cert || !x.cert.size) throw new Error(L('أرفق شهادة المعايرة أو الاختبار.', 'Attach the calibration / test certificate.')); const fid = Q.uid('f'); await Q.db.putFile(fid, x.cert); rec.cert = {id: fid, name: x.cert.name};
      if (x.result === 'pass') { const nx = new Date(at); nx.setFullYear(nx.getFullYear() + 1); d[x.kind === 'calibration' ? 'calibDue' : 'elecDue'] = nx.toISOString(); } }
    Q.db.put('maint', rec);
    if (x.kind === 'pm' && x.result === 'pass') d.lastPM = at;
    if (x.result === 'pass' && ['repair', 'check', 'down'].includes(d.status)) d.status = 'ok'; if (x.result === 'fail') d.status = 'down';
    Q.db.put('devices', d); Q.audit('device', d.id, 'pm', T(MK[x.kind])); Q.render(); Q.toast(x.result === 'fail' ? L('فشل: أُخرج الجهاز من الخدمة', 'Failed: device removed from service') : L('سُجّلت الصيانة', 'Maintenance logged')); }}); });
Q.act('dev-fault', el => { const dv = el.dataset.id && Q.db.get('devices', el.dataset.id); Q.form = null;
  Q.prefill = Object.assign({typeId: 't-device', affected: 'equip'}, dv ? {deviceTag: dv.id, deptId: dv.deptId, location: dv.location || '', title: L(`عطل في ${T(dv.name)} ${dv.id}`, `Fault on ${T(dv.name)} ${dv.id}`)} : {}); Q.go('#/report/new'); });
})();
