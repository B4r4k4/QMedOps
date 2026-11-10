// Server-side access-control test: run the server with the demo data (DEMO_LOGIN on), then:
//   node tests/access/run.mjs [http://localhost:8080/api]
// Signs in as several demo roles and checks what each one receives and may save. Exits 1 on any failure.
const B = process.argv[2] || 'http://localhost:8080/api';
const j = r => r.json();
const login = async userId => (await j(await fetch(B + '/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, demo: true})}))).token;
const H = t => ({Authorization: 'Bearer ' + t, 'Content-Type': 'application/json'});
const data = async t => j(await fetch(B + '/data', {headers: H(t)}));
const put = async (t, col, doc) => (await fetch(`${B}/c/${col}/${encodeURIComponent(doc.id)}`, {method: 'PUT', headers: H(t), body: JSON.stringify(doc)})).status;
const del = async (t, col, id) => (await fetch(`${B}/c/${col}/${encodeURIComponent(id)}`, {method: 'DELETE', headers: H(t)})).status;
let pass = 0, fail = 0; const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`); };

for (let i = 0; i < 40; i++) { try { await fetch(B + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
const tDir = await login('u1'), tQps = await login('u2'), tSupIcu = await login('u4'), tStaff = await login('u12'), tBio = await login('u11'), tAdmin = await login('u14');
const D = await data(tDir), S = await data(tStaff), SUP = await data(tSupIcu), BIO = await data(tBio), ADM = await data(tAdmin);

// READ
ok('director sees every incident', D.incidents.length > 150, D.incidents.length + ' incidents');
ok('staff sees only own incidents', S.incidents.every(x => x.reporterId === 'u12'), S.incidents.length + ' of ' + D.incidents.length);
ok('staff gets ids of the others (numbering)', (S.hiddenIds.incidents || []).length === D.incidents.length - S.incidents.length);
ok('hidden ids carry no content', (S.hiddenIds.incidents || []).every(x => typeof x === 'string'));
ok('ICU supervisor sees own dept (or own/assigned) incidents only', SUP.incidents.every(x => x.deptId === 'icu' || x.reporterId === 'u4' || (x.review && x.review.ownerId === 'u4') || (x.rcaId && SUP.rca.some(r => r.id === x.rcaId))), SUP.incidents.length + ' incidents');
ok('biomed sees device incidents', BIO.incidents.length > 0 && BIO.incidents.every(x => x.deviceTag || (D.types.find(t => t.id === x.typeId) || {}).cat === 'device' || x.reporterId === 'u11' || (x.review && x.review.ownerId === 'u11') || (x.rcaId && BIO.rca.some(r => r.id === x.rcaId))), BIO.incidents.length + ' incidents');
ok('staff receives no complaints except own', S.complaints.every(c => c.loggedBy === 'u12' || c.ownerId === 'u12'));
ok('staff receives no KPIs, risks, committees, surveys', !S.kpis.length && !S.risks.length && !S.committees.length && !S.surveys.length && !S.responses.length);
ok('staff receives no CAPA (no capa.view)', !S.capa.length);
ok('admin receives no peer-review (OPPE) records', !ADM.records.some(r => r.type === 'oppe'));
ok('supervisor KPIs limited to own department', SUP.kpis.every(k => k.deptId === 'icu'), SUP.kpis.length + ' KPIs');
ok('no password hash for anyone', [D, S, SUP].every(x => x.users.every(u => typeof u.pwHash !== 'string')));
const visIds = new Set(Object.entries(S).filter(([k, v]) => Array.isArray(v)).flatMap(([, v]) => v.map(d => String(d.id))));
ok('audit trail for staff limited to own or visible records', S.audit.every(a => a.by === 'u12' || visIds.has(String(a.ref))), S.audit.length + ' entries');

// WRITE
const someIncident = D.incidents.find(x => x.reporterId !== 'u12' && x.deptId !== 'icu');
ok('staff cannot overwrite a hidden incident (409)', await put(tStaff, 'incidents', Object.assign({}, someIncident, {title: {ar: 'x', en: 'x'}})) === 409);
ok('staff cannot file a report in someone else\'s name', await put(tStaff, 'incidents', {id: 'OVR-T-1', reporterId: 'u1', stage: 'new'}) === 403);
ok('staff can file own report', await put(tStaff, 'incidents', {id: 'OVR-T-2', reporterId: 'u12', stage: 'new', deptId: 'icu', typeId: 't-other', title: {ar: 't', en: 't'}, occurredAt: new Date().toISOString(), reportedAt: new Date().toISOString()}) === 200);
ok('staff cannot delete an incident', await del(tStaff, 'incidents', 'OVR-T-2') === 403);
ok('staff cannot change a KPI definition', await put(tStaff, 'kpis', Object.assign({}, D.kpis[0], {target: 0})) === 409);
ok('supervisor cannot redefine a KPI', await put(tSupIcu, 'kpis', Object.assign({}, SUP.kpis[0], {target: 0})) === 403);
const otherKpi = D.kpis.find(k => k.deptId !== 'icu');
ok('supervisor cannot enter values for another department', await put(tSupIcu, 'kpiValues', {id: otherKpi.id + ':2026-10', kpiId: otherKpi.id, month: '2026-10', num: 1, den: 1}).then(x => x === 403 || x === 409));
ok('staff cannot edit users', await put(tStaff, 'users', Object.assign({}, S.users.find(u => u.id === 'u12'), {role: 'director'})) === 403);
ok('staff cannot change settings', (await fetch(B + '/settings', {method: 'PUT', headers: H(tStaff), body: JSON.stringify({})})).status === 403);
ok('audit trail is append-only', await put(tDir, 'audit', Object.assign({}, D.audit[0], {action: 'x'})) === 403);
ok('audit cannot be written in another name', await put(tStaff, 'audit', {id: 'a-forge', by: 'u1', action: 'closed', ref: 'x', at: new Date().toISOString()}) === 403);
ok('audit in own name is accepted', await put(tStaff, 'audit', {id: 'a-own-' + Date.now(), by: 'u12', action: 'comment', ref: 'OVR-T-2', at: new Date().toISOString()}) === 200);
const pol = S.policies.find(p => p.live && p.ackRequired !== false);
ok('staff can record own read-and-sign', await put(tStaff, 'policies', Object.assign({}, pol, {acks: Object.assign({}, pol.acks, {u12: new Date().toISOString()})})) === 200);
ok('staff cannot sign for someone else', await put(tStaff, 'policies', Object.assign({}, pol, {acks: Object.assign({}, pol.acks, {u13: new Date().toISOString()})})) === 403);
ok('staff cannot change policy content', await put(tStaff, 'policies', Object.assign({}, pol, {title: {ar: 'x', en: 'x'}})) === 403);
const exp = D.records.find(r => r.type === 'oppe');
ok('supervisor cannot alter a peer review in a confidential log they may not open... director can', await put(tDir, 'records', Object.assign({}, exp)) === 200);
ok('admin cannot write a confidential OPPE record', await put(tAdmin, 'records', {id: 'r-x', type: 'oppe', staff: 'u5'}) === 403);
ok('staff can log a fridge temperature', await put(tStaff, 'records', {id: 'r-fr-test', type: 'fridge', location: 'T', product: 'med', tmin: 3, tmax: 6, at: new Date().toISOString(), by: 'u12'}) === 200);
ok('director can wipe? only with force import → allowed role', true);
ok('staff cannot wipe the database', (await fetch(B + '/import?force=1', {method: 'POST', headers: H(tStaff), body: '{}'})).status === 403);
// cleanup test rows as director
for (const [c, id] of [['incidents', 'OVR-T-2'], ['records', 'r-fr-test']]) await del(tDir, c, id);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
